// Zora Play live-joke service (AWS Lambda, Node.js 20).
// The TV app asks for ONE fresh joke. This function:
//   1. asks Amazon Bedrock (Nova Lite, Converse API) for one joke as JSON, with the child-safety Guardrail attached,
//   2. checks it with our own rules and again with ApplyGuardrail,
//   3. turns the question and the answer into speech with Amazon Polly (a voice that fits the chosen buddy),
//   4. returns the text and both audio clips. If anything fails it returns an error and the app tells a stored joke instead.
// The app sends only the buddy's id. No child data is sent or kept.
import { BedrockRuntimeClient, ConverseCommand, ApplyGuardrailCommand } from '@aws-sdk/client-bedrock-runtime';
import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
import { isJokeForAges3to8 } from './rules.mjs';

const MODEL_ID = process.env.MODEL_ID || 'apac.amazon.nova-pro-v1:0';
const BEDROCK_REGION = process.env.BEDROCK_REGION || 'ap-south-1';
const POLLY_REGION = process.env.POLLY_REGION || 'us-east-1';
const GUARDRAIL_ID = process.env.GUARDRAIL_ID;
const GUARDRAIL_VERSION = process.env.GUARDRAIL_VERSION || '1';

const bedrock = new BedrockRuntimeClient({ region: BEDROCK_REGION });
const polly = new PollyClient({ region: POLLY_REGION });

// One Polly voice per buddy (standard engine, so pitch can be changed like the recorded voices).
const VOICES = {
  dino: { voiceId: 'Ivy', pitch: '+5%', rate: '92%' },
  cat: { voiceId: 'Ivy', pitch: '+25%', rate: '100%' },
  dog: { voiceId: 'Justin', pitch: '-5%', rate: '92%' },
  bear: { voiceId: 'Matthew', pitch: '-25%', rate: '85%' },
};

const SYSTEM = `You write jokes for a TV buddy that talks to children aged 3 to 8. Every joke must suit BOTH a 3 year old and an 8 year old.
Rules:
- Very simple English. Short sentences. Only everyday words a 3 year old knows. No long or hard words.
- Safe for young children only: no scary things, nothing about school tests, doctors, illness, money, politics, religion, love or romance, and nothing grown-up or rude.
- Be warm, gentle and silly. Nothing scary, rude, mean, political, romantic, medical or religious.
- No brand names, no names of real people. Never ask the child for personal data.
- Never mention eating a person. Animals never eat other animals in your jokes.
- No digits, links or emojis. Only letters, spaces, commas, full stops, question marks, exclamation marks and apostrophes.
- The joke must make sense when SPOKEN ALOUD: no spelling tricks.
Good examples of the style (never copy them, write a NEW one):
- What do you call a cow that plays the drums? A moo-sician!
- Why did the cat wear a bowtie? To look pawsome!
- What do you call a dog with a fever? A hot dog!
- Why did the cookie go to the moon? To see the Milky Way!
- What did the tree wear to the pool? Swim trunks!
The answer must be a real, clear pun or a silly surprise that a 5 year old can get. Do not write plain facts or nonsense.
Return ONLY valid JSON like {"question":"What do you call a sleeping bull?","answer":"A bulldozer!"}. No markdown.`;

const TOPICS = ['animals', 'food', 'toys', 'vehicles', 'space', 'ocean', 'weather', 'farm', 'music', 'school', 'birthday party', 'bedtime', 'robots', 'dinosaurs', 'fruit', 'vegetables', 'playground', 'trees and flowers', 'insects', 'birds', 'pets', 'the zoo', 'the beach', 'snow', 'cooking', 'colours', 'shapes', 'clothes'];
const STYLES = ['a pun on a sound', 'a silly surprise answer', 'a joke about a funny animal', 'a play on words', 'a joke with a funny object that acts like a person'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function validJoke(j) {
  return !!j && isJokeForAges3to8(j.question, j.answer);
}

function parseJoke(raw) {
  const s = String(raw).replace(/```(?:json)?/gi, '').trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function writeJoke() {
  const topic = pick(TOPICS);
  const style = pick(STYLES);
  const resp = await bedrock.send(new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: SYSTEM }],
    messages: [{ role: 'user', content: [
      { text: `Write ONE new joke about ${topic}, ${style}. One question that ends with "?" and one short answer. The question and answer together must be 14 words or fewer. It must be gentle and easy enough for a 3 year old, and still funny to an 8 year old. Not a famous old joke. Return JSON only.` },
      // Only this block is checked on the way in; the model's output is always checked by the guardrail.
      ...(GUARDRAIL_ID ? [{ guardContent: { text: { text: 'Write one short, gentle joke for children.' } } }] : []),
    ] }],
    inferenceConfig: { maxTokens: 200, temperature: 0.95 },
    ...(GUARDRAIL_ID ? { guardrailConfig: { guardrailIdentifier: GUARDRAIL_ID, guardrailVersion: GUARDRAIL_VERSION } } : {}),
  }));
  if (resp.stopReason === 'guardrail_intervened') return { blocked: true };
  const text = resp.output?.message?.content?.map((c) => c.text || '').join('') || '';
  return { joke: parseJoke(text) };
}

async function guardrailOk(text) {
  if (!GUARDRAIL_ID) return true;
  const r = await bedrock.send(new ApplyGuardrailCommand({
    guardrailIdentifier: GUARDRAIL_ID, guardrailVersion: GUARDRAIL_VERSION, source: 'OUTPUT',
    content: [{ text: { text } }],
  }));
  return r.action === 'NONE';
}

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function speak(text, voice) {
  const ssml = `<speak><prosody rate="${voice.rate}" pitch="${voice.pitch}">${esc(text)}</prosody></speak>`;
  const out = await polly.send(new SynthesizeSpeechCommand({
    Engine: 'standard', VoiceId: voice.voiceId, OutputFormat: 'mp3', SampleRate: '22050', TextType: 'ssml', Text: ssml,
  }));
  const chunks = [];
  for await (const c of out.AudioStream) chunks.push(c);
  return Buffer.concat(chunks).toString('base64');
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
const reply = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json', ...CORS }, body: JSON.stringify(body) });

export const handler = async (event) => {
  if ((event?.requestContext?.http?.method || '') === 'OPTIONS') return { statusCode: 204, headers: CORS };
  const q = event?.queryStringParameters || {};
  const buddy = VOICES[q.buddy] ? q.buddy : 'dino';
  const started = Date.now();
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const r = await writeJoke();
      if (r.blocked || !validJoke(r.joke)) continue;
      const question = r.joke.question.trim().replace(/’/g, "'");
      const answer = r.joke.answer.trim().replace(/’/g, "'");
      if (!(await guardrailOk(`${question} ${answer}`))) continue;
      const voice = VOICES[buddy];
      const [audioQuestion, audioAnswer] = await Promise.all([speak(question, voice), speak(answer, voice)]);
      console.log(JSON.stringify({ ok: true, buddy, attempt, ms: Date.now() - started, question, answer }));
      return reply(200, { question, answer, audioQuestion, audioAnswer, buddy });
    }
    console.log(JSON.stringify({ ok: false, reason: 'no valid joke after 3 tries', buddy, ms: Date.now() - started }));
    return reply(502, { error: 'no joke' });
  } catch (e) {
    console.log(JSON.stringify({ ok: false, reason: String(e?.name || e), message: String(e?.message || '').slice(0, 300), buddy }));
    return reply(502, { error: 'service error' });
  }
};
