// Versioned prompts for the Bedrock content pipeline (build time only; never bundled into dist/).
// Bump PROMPT_VERSION whenever any prompt text changes. It is copied into every output file.

export const PROMPT_VERSION = '1.2.0'; // 1.2.0: jokes rewritten to be much easier for 3 to 5 year olds

export const KINDS = ['jokes', 'riddles', 'animal-facts', 'talk-replies', 'bedtime'];

const SAFETY_RULES = `You write lines for a TV buddy that talks to children aged 3 to 8.
Rules for EVERY line:
- Use very simple English. Short sentences. Words a 4 year old knows.
- Be warm, gentle and silly. Nothing scary, rude, mean, political, romantic, medical or religious.
- No brand names, no names of real people, no places that need a map.
- Never ask the child for personal data (name, age, address, school, photos).
- No digits. Write numbers as words. No links, no emails, no emojis.
- Only use these marks: letters, spaces, commas, full stops, question marks, exclamation marks, apostrophes.
Return ONLY valid JSON. No markdown, no commentary.`;

export const SYSTEM_PROMPT = SAFETY_RULES;

/** Per-kind task text and the exact JSON shape the model must return. */
export const KIND_SPECS = {
  jokes: {
    task: (n, ctx = {}) => `Write ${n} VERY EASY jokes for children aged 3 to 5. A 3 year old must understand the joke at once. Rules: the question and answer together are 10 words or fewer. Use only everyday words about ${ctx.topics || 'animals, animal sounds, colours, food, toys and sleeping'}. The funny part must be a silly picture or a silly sound (for example an animal doing something a person does), NEVER a pun that needs reading, spelling or knowing a saying. Do not use idioms, riddles about letters or numbers, or word play on long words. Each joke has one question that ends with "?" and one short answer sentence. Good examples of the style: "What does a sleepy cow say? Mooo zzz!" and "What is a cat's favourite colour? Purr-ple!" and "Why is the duck happy? It can swim!". Make each joke different from the others.`,
    shape: '{"items":[{"question":"What do you call a sleeping bull?","answer":"A bulldozer!"}]}',
  },
  riddles: {
    task: (n) => `Write ${n} new easy riddles for small children. Each riddle has one question that ends with "?" and one short answer sentence. The question and answer together must be 14 words or fewer. Topics: animals, colours, shapes, counting words.`,
    shape: '{"items":[{"question":"What has four legs and says moo?","answer":"A cow!"}]}',
  },
  'animal-facts': {
    task: (n, ctx) => `Write ${n} true, gentle animal facts in total, spread evenly over these animals: ${ctx.animals.join(', ')}. Each fact is ONE sentence of 12 words or fewer and names the animal.`,
    shape: '{"items":[{"animal":"dog","fact":"Dogs love to play fetch."}]}',
  },
  'talk-replies': {
    task: (n) => `Write ${n} friendly replies the buddy can say in a chat with a child. Each reply is 2 or 3 short sentences (10 words or fewer each). Topics: favourite things, feelings, being kind, helping at home, playing outside, animals. Do not ask for personal facts.`,
    shape: '{"items":[{"topic":"kindness","sentences":["Being kind is great.","Can you share a smile today?"]}]}',
  },
  bedtime: {
    task: (n) => `Write ${n} calm wind-down lines for bedtime. Each is 1 or 2 soft sentences (12 words or fewer each). Mention rest, stars, moon, cosy blankets or slow breaths. Nothing exciting.`,
    shape: '{"items":[{"line":"The stars are sleepy. Time to rest."}]}',
  },
};

/** The user message for one request. `avoid` is a small sample of lines we already have. */
export function buildUserPrompt(kind, count, ctx = {}) {
  const spec = KIND_SPECS[kind];
  if (!spec) throw new Error(`Unknown kind "${kind}". Use one of: ${KINDS.join(', ')}`);
  const avoid = (ctx.avoid ?? []).slice(0, 25);
  return [
    spec.task(count, ctx),
    avoid.length ? `Do not repeat or closely copy these lines:\n${avoid.map((l) => `- ${l}`).join('\n')}` : '',
    `Return JSON in exactly this shape (an "items" array with ${count} entries):\n${spec.shape}`,
  ].filter(Boolean).join('\n\n');
}
