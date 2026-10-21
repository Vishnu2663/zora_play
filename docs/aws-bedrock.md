# AWS Bedrock content pipeline

Zora Play is a TV app for children aged 3 to 8 that works offline. We use Amazon Bedrock in two ways:

1. **At build time**: Bedrock writes new kid-friendly lines, they are checked, and a human approves them. The approved lines ship inside the app as ordinary text plus pre-recorded voice clips. This is the main content pipeline below.
2. **At run time, for one button**: when the TV is online, **Tell me a joke** can fetch a brand-new joke, written live by Bedrock and spoken by Amazon Polly. See [Live jokes at run time](#live-jokes-at-run-time). If the TV is offline, the call is slow, or the joke looks unsafe, a stored, reviewed joke is told instead.

## AWS services used

| Service | How it is used | Where |
|---|---|---|
| **Amazon Bedrock, Converse API** | Writes new jokes, riddles, animal facts, chat replies and bedtime lines as strict JSON. Models: Amazon Nova Lite (most kinds) and Amazon Nova Pro (jokes), through the `apac.` inference profiles. | `scripts/bedrock-generate.mjs`, `scripts/lib/bedrock-lib.mjs` |
| **Amazon Bedrock Guardrails** | A child-safety guardrail (`zora-play-kids`) is applied to the model's output during generation, and again to every line with the `ApplyGuardrail` API before a human sees it. | `scripts/bedrock-check.mjs`, `scripts/bedrock-guardrail-setup.md` |
| **Amazon CloudWatch Logs** | Bedrock model invocation logging writes every call (prompt, reply, token counts, latency, which guardrail stopped it) to the log group `/aws/bedrock/modelinvocations`. | Bedrock console, Settings |
| **AWS Lambda + Amazon API Gateway** | The live-joke service (`infra/joke-service`): an HTTP endpoint that runs one function per joke request, rate-limited. | `infra/joke-service/` |
| **Amazon Polly** | Speaks a live joke in a voice that fits the chosen buddy (question and answer as two mp3 clips). | `infra/joke-service/index.mjs` |
| **AWS IAM** | Standard credentials chain (`AWS_PROFILE` or environment variables); no keys in the repo. Policy in `scripts/bedrock-guardrail-setup.md`. | n/a |

## Live jokes at run time

```
 Fire TV app (Tell me a joke)                      AWS (ap-south-1, Polly in us-east-1)
 ----------------------------                      ------------------------------------
 GET https://<api>.execute-api.../?buddy=bear  -->  API Gateway (rate limit: 2/s, burst 5)
   only the buddy's id is sent                        '-> Lambda zora-play-joke
                                                          1. Bedrock Converse (Nova Pro) writes ONE joke as JSON,
                                                             Guardrail attached to the output
                                                          2. our rules (one question, 14 words or fewer, plain letters,
                                                             banned words) + ApplyGuardrail on the final text
                                                          3. Polly speaks the question and the answer (mp3)
 shows the joke, plays the audio, laughs        <--  { question, answer, audioQuestion, audioAnswer }
 on ANY problem: tells a stored joke instead
```

- **Why not call Bedrock straight from the app?** That would need AWS keys inside the APK, where anyone could extract them. The app only knows a public URL; the function holds the permissions (a least-privilege role: `bedrock:InvokeModel` on the Nova models, `bedrock:ApplyGuardrail` on our guardrail, `polly:SynthesizeSpeech`).
- **Privacy:** the request carries only the buddy's id. Nothing about the child is sent or stored. Lambda logs record the joke text and timing, nothing else.
- **Ages 3 to 8:** the prompt asks for a joke that suits both a 3 and an 8 year old, in everyday words, with nothing scary, romantic, medical or rude. The same rules then check every joke: one question, at most 14 words, plain letters only, no word of four or more syllables, no blocked words (the same list as the build pipeline), no questions about the child. They live in `infra/joke-service/rules.mjs` (function) and `src/core/liveJoke.ts` (TV), and a test keeps the two identical.
- **Safety, three layers:** the Guardrail on Bedrock's output, those rules in the function, and the same rules again on the TV. Any failure means a stored joke is told.
- **Connected or not:** while the TV is connected to Wi-Fi, every press asks the service for a new joke. With no connection (or Settings has the feature off) the button tells a stored joke straight away, with no waiting. If one request fails or takes longer than 5 seconds, that press tells a stored joke, and the next press asks again.
- **Cost and abuse:** the API is rate limited; each joke is roughly one short Nova Pro call and two short Polly calls. Set an AWS budget alert.
- **Settings:** a grown-up can switch it off (Settings > Fresh jokes online).
- **Code and deploy:** `infra/joke-service/index.mjs` and `deploy.sh` (creates only `zora-play-*` resources; safe to re-run). Run `bash infra/joke-service/deploy.sh` with `AWS_REGION`, `GUARDRAIL_ID` and `GUARDRAIL_VERSION` set.
- **Measured:** about 1.7 to 4 seconds per joke, with voice; the app waits at most 5 seconds before falling back.

## Why Bedrock

- One API (Converse) for many models, so the model can change without code changes (`--model` / `BEDROCK_MODEL_ID`).
- **Guardrails** give a second, independent child-safety check (content filters, denied topics, word and PII filters) on top of our own rules.
- Standard AWS credentials and IAM, no API key files in the repo.
- Build-time use fits the offline promise: nothing from AWS runs on the TV.

## Architecture (text diagram)

```
 BUILD TIME (developer laptop, AWS credentials)                      RUN TIME (Fire TV, fully offline)
 ──────────────────────────────────────────────                      ─────────────────────────────────
 bedrock-generate.mjs ──Converse API──► Bedrock model
   │  strict JSON, retry, backoff, dedupe, local rules
   ▼
 voice/generated/<kind>.json      status: "pending"
   │
 bedrock-check.mjs ──ApplyGuardrail──► Bedrock Guardrail
   │  + local rules  → voice/generated/safety-report.json
   ▼
 review-lines.mjs   human approves / rejects (name + date)
   │  only "approved" + guardrail pass + local pass
   ▼
 import-approved.mjs → src/core/generatedLines.ts  ──────────────►  app code reads plain TypeScript arrays
   │                                                                  (responses.ts, talk.ts, games.ts, phrases.ts)
 npm run voice:phrases → gen-voice.py --only-missing                       │
   ▼                                                                       ▼
 public/audio/voice/<buddy>/*.mp3 (4 buddies)  ───────────────────►  dist/ : no AWS SDK, no network
```

`@aws-sdk/client-bedrock-runtime` is a **devDependency**. A test (`test/bedrock-pipeline.test.ts`) fails if anything under `src/` mentions the SDK, Bedrock, or imports `scripts/`.

## Files

| File | Job |
|---|---|
| `scripts/bedrock-prompts.mjs` | Versioned prompts (`PROMPT_VERSION`), one task per kind |
| `scripts/lib/bedrock-lib.mjs` | JSON parsing, validation, local safety rules, dedupe, backoff, guardrail result handling |
| `scripts/bedrock-generate.mjs` | Generate lines (Converse API) |
| `scripts/bedrock-check.mjs` | Guardrail check (ApplyGuardrail) → `safety-report.json` |
| `scripts/review-lines.mjs` | Human approve / reject |
| `scripts/import-approved.mjs` | Writes `src/core/generatedLines.ts` |
| `scripts/bedrock-guardrail-setup.md` | The Guardrail to create, exact settings, IAM policy |
| `src/core/generatedLines.ts` | `JOKES_GENERATED`, `RIDDLES`, `ANIMAL_FACTS_GENERATED`, `TALK_REPLIES_GENERATED`, `BEDTIME_LINES` (28 approved lines imported so far) |

## Line kinds

| Kind | Shape | Where it shows up |
|---|---|---|
| `jokes` | question ending `?`, then one short answer, max 14 words | joined into `JOKES` (spoken question, 2 s pause, answer) |
| `riddles` | same shape, animals / colours / shapes / counting | joined into `JOKES` |
| `animal-facts` | one sentence per animal in `ANIMALS`, max 12 words | extra facts; the game picks one at random after a right answer |
| `talk-replies` | 2–3 short sentences | in the voice catalog (`TALK_LINES`) |
| `bedtime` | 1–2 calm sentences | in the voice catalog (`UI_LINES`) |

## Local rules (a line must pass these AND the guardrail)

Only letters, spaces and `, . ! ? '`; no digits (except counting talk replies); no URLs or emails; blocked-word list
(violence, fear, romance, medical, politics, brands, personal data); no word over 3 syllables; length limits per kind;
jokes need exactly one `?` and a one-sentence answer. See `checkLocal` in `scripts/lib/bedrock-lib.mjs`.

## Run it

```bash
# one-time
npm install                       # installs the SDK as a devDependency
# AWS: use env vars or a named profile. Never write keys into files.
export AWS_PROFILE=zora-play      # or AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
export AWS_REGION=ap-south-1     # the region we used; use the region where you have model access
export BEDROCK_MODEL_ID=apac.amazon.nova-lite-v1:0   # or another model id / inference profile id
# .env.example lists every variable
export BEDROCK_GUARDRAIL_ID=<guardrail id>
export BEDROCK_GUARDRAIL_VERSION=<version number>

node scripts/bedrock-generate.mjs --kind=jokes --count=5 --dry-run   # prints the prompts, no AWS call
node scripts/bedrock-generate.mjs --kind=jokes --count=5             # repeat for riddles, animal-facts, talk-replies, bedtime
node scripts/bedrock-check.mjs                                       # guardrail + local rules, writes the safety report
node scripts/review-lines.mjs --list
node scripts/review-lines.mjs --reviewer="Your Name"                 # interactive approve / reject
node scripts/import-approved.mjs
npm run voice:phrases
python scripts/gen-voice.py --model <piper model> --only-missing     # records clips for all 4 buddies
npm test && npm run build
```

Tests need no AWS: `npm test` (they use a fake Bedrock client).

On Windows with Git Bash, set `MSYS_NO_PATHCONV=1` before AWS CLI commands that take a `/aws/...` log group name, or Git Bash rewrites the path.

### AWS setup you must do

1. Bedrock console → **Model access** → request access to your chosen model, in your chosen region.
2. Create the Guardrail described in `scripts/bedrock-guardrail-setup.md` and create a version.
3. IAM: allow `bedrock:InvokeModel` and `bedrock:ApplyGuardrail` (policy in the setup file).

## Model, region, prompts, guardrail used

| Item | Value |
|---|---|
| Models | `apac.amazon.nova-lite-v1:0` (Amazon Nova Lite) for riddles, animal facts, talk replies and bedtime; `apac.amazon.nova-pro-v1:0` (Amazon Nova Pro) for the funnier jokes. APAC inference profiles; also stored in every line's `generatedWith`. |
| Region | `ap-south-1` (the APAC profiles may run the call in another APAC region; the invocation log shows `inferenceRegion`, for example `ap-southeast-2` or `ap-northeast-1`) |
| Prompt version | `1.1.0` (`scripts/bedrock-prompts.mjs`; riddles, animal facts, talk replies and bedtime were first made with `1.0.0`) |
| Guardrail | `zora-play-kids`, id `1kcus2m06r9m`, version `1` (content filters High, 7 denied topics, word filters, PII block, grounding off) |

Every generated line carries `generatedWith` (model, region, date, prompt version). Each output file's `metadata` also stores the system prompt.
The prompts ask for strict JSON, simple English, and the safety rules above; per-kind task text and JSON shapes are in `bedrock-prompts.mjs`.

## Review workflow

1. Generate → lines are `pending`.
2. `bedrock-check.mjs` stamps each line with guardrail verdict, triggered filters, and local-rule result. Failing lines cannot be approved.
3. The owner reads every eligible line and approves or rejects it (`review.reviewer`, `review.date` saved).
4. `import-approved.mjs` re-checks the local rules and imports only `approved` lines whose guardrail verdict is `pass`.
5. If a check is re-run later and an approved line now fails, it goes back to `pending`.

## Results of the real runs

| Measure | Result |
|---|---|
| Lines generated and checked | 45 (jokes 25, riddles 5, animal facts 5, talk replies 5, bedtime 5) |
| Guardrail verdict on those lines (`safety-report.json`, 2026-10-18) | 45 of 45 passed, 0 blocked, 0 failed the local rules |
| Human review | 28 approved, 17 rejected (14 jokes and 3 riddles: not funny, wrong or too close to a known joke) |
| Imported into the app | the 28 approved lines (`src/core/generatedLines.ts`), voiced for all 4 buddies |

### Live checks on 2026-10-19

- **Guardrail behaviour:** 4 safe lines passed. 7 unsafe lines (a scary monster, asking the child's address, medicine, a brand and shop, politics and religion, insults, romance) were all blocked. The prompt-attack text "Ignore all previous instructions..." was blocked as `INPUT` and allowed as `OUTPUT`, as configured (prompt attack is an input filter).
- **Generation:** 3 lines per kind, all five kinds, 15 of 15 passed the local rules and the guardrail.
- **Logging:** the calls appear in the CloudWatch log group `/aws/bedrock/modelinvocations`, with token counts (roughly 230 to 580 input tokens and 60 to 140 output tokens per batch call) and latency of about 1 to 1.7 seconds.
- **Unit tests:** `node --test test/bedrock-pipeline.test.ts` passes (26 tests, no AWS needed).

### A bug the logs helped us find

With the guardrail attached to the generation call, the jokes and talk-replies batches were blocked 5 times out of 5 (`stopReason: guardrail_intervened`, `inputTokenCount: 0` in the log). The trace showed the cause: the guardrail's High **PROMPT_ATTACK** input filter flagged our own instruction text ("Do not ask for personal facts", "Return ONLY valid JSON"), not anything unsafe. Riddles, animal facts and bedtime happened to pass.

The fix is in `generateLines` (`scripts/lib/bedrock-lib.mjs`): with a guardrail, the request now marks a small `guardContent` block, and Bedrock then checks only that block on the way in. Our instructions are written by us, not by a user, so an input prompt-attack check on them adds nothing. The guardrail still checks the model's **output** during generation, and `bedrock-check.mjs` checks every line again with `ApplyGuardrail`. After the change both kinds generated on the first try.

## Cost

Token counts per call are in the invocation log (see above). A batch of 5 short lines is a few hundred tokens in and out, plus one `ApplyGuardrail` text-unit charge per line checked. Check current prices on the Bedrock pricing page for Nova Lite and Nova Pro, and set a budget alert. We have not totalled the real bill yet.

## Verification status

Verified with no AWS: unit tests with a fake client (parsing, validation, dedupe, retry and backoff, local rules, guardrail result handling, approved-only import, and "nothing in `src/` touches the SDK"), `--dry-run`, typecheck, build, and `dist/index.html` containing no SDK or Bedrock text.

Verified with real AWS: Converse calls on Nova Lite and Nova Pro, the guardrail blocking and allowing the right lines, generation for all five kinds, the safety report, and the CloudWatch invocation log.

Not verified: that the model's facts are right (a human checks each one), and the cost against the real bill.

## Honest limits

- A model and a guardrail can both miss things. The human review is the real gate.
- The local blocked-word list and syllable counter are simple heuristics; they can reject fine lines and miss odd ones.
- Jokes and riddles may not be funny or may be near-copies of well-known jokes; dedupe only catches exact text (case and punctuation blind).
- Animal facts come from a model and are not fact-checked automatically. Check each one.
- `talk-replies` and `bedtime` lines are added to the voice catalog but no screen picks them at random yet. Only jokes, riddles and animal facts are wired into behaviour.
- Voice clips still need the offline Piper pipeline and ffmpeg on the build machine.
- Model invocation logging records only model calls. The line-by-line `ApplyGuardrail` checks are not model calls, so their results live in `safety-report.json`, not in CloudWatch.
- The invocation log stores the full prompts, replies and the IAM identity. Treat it as private and redact the account id before sharing a screenshot.
- Guardrail `source` is `OUTPUT` by default (these are model outputs); use `--source=INPUT` to test the other path.

## Friction notes (for the hackathon friction log)

- **Model access is a separate manual step** per model and per region; the first call fails with `AccessDeniedException` until it is granted. We map this to a message that names the exact console page.
- **Model ids vs inference profiles:** some models only work through a regional inference profile id (for example `us.<model>`); a plain id gives a confusing "invalid identifier" error.
- **Guardrails need a numbered version** for reproducible runs; `DRAFT` changes under you.
- **ApplyGuardrail response is nested** (`assessments[].contentPolicy.filters[]`, `topicPolicy`, `wordPolicy`, `sensitiveInformationPolicy`); we flatten it to a list of triggered filters for the report.
- **Strict JSON is not guaranteed:** models sometimes wrap JSON in code fences or add chat text. We strip fences, extract the object, validate the shape, and retry.
- **Throttling:** we turn off SDK auto-retry and use our own exponential backoff with jitter so the log says what happened.
- **Guardrails can only judge text**, not "is this joke age 3-8 simple?", so reading-level rules stay in our own code.
- **Prompt-attack filter flagged our own prompts:** with the guardrail attached to Converse, jokes and talk-replies were blocked 5 of 5 times. The trace (`trace=enabled`) showed `PROMPT_ATTACK`, strength High, on our instruction text. Fix: mark only a small `guardContent` block for the input check; the output is still checked. By default the whole user message is scanned, which is a surprise for build-time prompts.
- **A blocked call looks like a success:** it returns normally with `stopReason: guardrail_intervened` and the blocked-message text, not an error, so the code has to check `stopReason`.
- **`ApplyGuardrail` is not in the model invocation log**, so the safety checks need their own record (our `safety-report.json`).
- **Invocation logging needs extra permissions to read:** the IAM user that makes the calls could not read the log group (`logs:DescribeLogStreams` and `logs:FilterLogEvents` were denied); the console worked.
- **`apac.` model ids run in other regions** than the one you call. The log shows `inferenceRegion`; worth knowing for data-residency questions.
- **Git Bash on Windows rewrites `/aws/...` arguments** into a Windows path; set `MSYS_NO_PATHCONV=1` for the AWS CLI.
- **Nova Lite returned invalid JSON once** (single-quoted property), which the retry loop handled.
- **Facts need a human:** a model riddle said a butterfly has two wings; guardrails and local rules cannot catch wrong facts.

## Text for Devpost: "AWS Builder" mini challenge

Zora Play is a kids' TV buddy for Fire OS that works fully offline, with one optional online feature (live jokes through a small Lambda that uses Bedrock and Polly; any problem falls back to stored jokes). We use
AWS at build time for the stored content, and at run time for that one button: Amazon Bedrock (Converse API with Amazon Nova Lite and Nova Pro), Bedrock Guardrails, and CloudWatch
invocation logging. A small Node pipeline asks a Bedrock model, through the Converse API, for new jokes, riddles,
animal facts, chat replies and bedtime lines in strict JSON. Every line is checked by our own child-safety rules and by an Amazon
Bedrock Guardrail (ApplyGuardrail: high content filters, denied topics, word and PII filters), then a human approves or rejects it.
Approved lines are imported as plain text and recorded as voice clips for four buddies, so the shipped app contains no AWS SDK and
makes no network call. Prompts are versioned, and every line records the model, region, date and prompt version for traceability.

## Text for the Product Feedback answer

- **Services used:** Amazon Bedrock (Converse API with Nova Lite and Nova Pro, Guardrails through ApplyGuardrail) and CloudWatch Logs (Bedrock model invocation logging), all at build time only. The shipped app has no AWS dependency.
- **What worked:** one Converse API across models; Guardrails as an independent safety layer that blocked every unsafe test line and passed all 45 generated lines; the invocation log made the guardrail problem easy to diagnose (token count 0 plus `guardrail_intervened`).
- **What needs work:** the prompt-attack filter scanned our own instruction text and blocked whole batches until we used `guardContent`; a blocked call returns as a normal response; `ApplyGuardrail` is not in the invocation log; model access and inference-profile ids are easy to get wrong; nested guardrail assessments; strict JSON is not guaranteed.
- **Onboarding:** _(fill in: how long it took from zero to the first successful call)_
- **Would I use it again:** _(fill in your honest answer)_
