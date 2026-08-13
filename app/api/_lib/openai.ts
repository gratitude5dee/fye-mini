import { runtime } from './http';

type JsonSchema = Record<string, unknown>;

function outputText(response: Record<string, unknown>) {
  if (typeof response.output_text === 'string') return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as { content?: unknown[] }).content) ? (item as { content: Array<Record<string, unknown>> }).content : [];
    const text = content.find((entry) => entry?.type === 'output_text')?.text;
    if (typeof text === 'string') return text;
  }
  throw new Error('OpenAI returned no written response.');
}

async function openai(path: string, body: Record<string, unknown>) {
  const apiKey = runtime('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof (payload.error as { message?: unknown })?.message === 'string' ? (payload.error as { message: string }).message : 'OpenAI request failed.');
  return payload;
}

export async function structured<T>(instructions: string, input: string, name: string, schema: JsonSchema) {
  const response = await openai('/responses', {
    model: runtime('OPENAI_MODEL') ?? 'gpt-5.6',
    store: false,
    instructions,
    input,
    text: { format: { type: 'json_schema', name, strict: true, schema } }
  });
  return JSON.parse(outputText(response)) as T;
}

export async function embedding(input: string) {
  const response = await openai('/embeddings', {
    model: 'text-embedding-3-small',
    dimensions: 1024,
    input
  });
  const vector = (response.data as Array<{ embedding?: unknown }> | undefined)?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length !== 1024 || !vector.every((value) => typeof value === 'number')) {
    throw new Error('Embedding response did not contain a 1024-dimensional vector.');
  }
  return vector as number[];
}
