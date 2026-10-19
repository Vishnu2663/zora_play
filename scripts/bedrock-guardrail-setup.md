# Bedrock Guardrail for Zora Play (child-safety check)

Create this Guardrail once in the AWS console (Amazon Bedrock > Guardrails > Create guardrail).
The scripts only *call* it (`ApplyGuardrail`). They never create or change it.

Name: `zora-play-kids`  ·  Region: the same region you generate in.

## 1. Content filters (set BOTH input and output to **High**)

| Category | Strength |
|---|---|
| Hate | High |
| Insults | High |
| Sexual | High |
| Violence | High |
| Misconduct | High |
| Prompt attack | High (input only) |

## 2. Denied topics (add each, with the sample phrases)

| Topic name | Definition | Sample phrases |
|---|---|---|
| Scary content | Anything frightening to a young child: monsters, ghosts, nightmares, dark places, being lost or hurt. | "a monster under the bed", "the ghost will get you" |
| Romance | Dating, kissing, love between adults or teens. | "kiss me", "my girlfriend" |
| Medical advice | Illness, medicine, doctors, treatment, diagnosis. | "take this pill", "you have a fever" |
| Politics and religion | Elections, parties, politicians, religious teaching. | "vote for", "pray to" |
| Brands and shopping | Named products, brands, shops, ads, buying things. | "buy this toy", "visit our shop" |
| Personal data requests | Asking a child for name, age, address, school, photos, phone. | "what is your address", "tell me your name" |
| Real people | Naming real celebrities, public figures or private people. | "as said by <real person>" |

## 3. Word filters

- Turn on **Profanity** (managed list).
- Add custom words: `kill`, `die`, `dead`, `blood`, `gun`, `knife`, `bomb`, `hate`, `stupid`, `dumb`, `idiot`, `ugly`, `monster`, `ghost`, `nightmare`, `beer`, `wine`, `drug`, `cigarette`.

## 4. Sensitive information (PII) filters — action **Block**

Name, Email, Phone, Address, Age, Username, Password, URL, Credit/debit card number, Social security number (and any other type offered).

## 5. Contextual grounding check

**Off.** Lines are creative (jokes, riddles), so there is no source text to ground against.

## 6. Messages and version

- Blocked-prompt and blocked-response message: `Blocked by the Zora Play child-safety guardrail.`
- Save, then **Create version**. Use the number as `BEDROCK_GUARDRAIL_VERSION` (never `DRAFT` for a real run, so the report is reproducible).

## Settings used

Fill this table after creating the Guardrail, and keep it in `docs/aws-bedrock.md`:

| Item | Value |
|---|---|
| Guardrail ID | `1kcus2m06r9m` (name `zora-play-kids`) |
| Version | `1` |
| Region | `ap-south-1` |
| Content filters | all High |
| Denied topics | the 7 above |
| PII | Block |
| Grounding | Off |

## IAM permissions the scripts need

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["bedrock:InvokeModel"], "Resource": "*" },
    { "Effect": "Allow", "Action": ["bedrock:ApplyGuardrail"], "Resource": "arn:aws:bedrock:<region>:<account-id>:guardrail/<guardrail-id>" }
  ]
}
```

Tighten `InvokeModel` to your model / inference-profile ARN when you know it. If you pass `--guardrail` to `bedrock-generate.mjs`, the same guardrail is also applied while generating, and `bedrock:ApplyGuardrail` covers that.

The guardrail is a second opinion, not a guarantee. A human still approves every line (`scripts/review-lines.mjs`).
