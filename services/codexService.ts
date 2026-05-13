/**
 * services/codexService.ts
 * Serviço simples para chamar a API de Responses da OpenAI (uso server-side apenas).
 * - NÃO exponha `OPENAI_API_KEY` no frontend. Use este módulo em rotas/funções server-side.
 */

type GenOptions = {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  store?: boolean;
};

const DEFAULT_OPTIONS: Required<GenOptions> = {
  model: 'gpt-4o-mini',
  max_tokens: 512,
  temperature: 0.2,
  store: false,
};

function getApiKey(): string {
  if (typeof window !== 'undefined') {
    throw new Error('codexService: CANNOT be used in browser environment');
  }
  const key = process.env.OPENAI_API_KEY ?? process.env.OPENAI_KEY ?? '';
  if (!key) throw new Error('OPENAI_API_KEY not configured (set in server env)');
  return key;
}

async function generateWithCodex(prompt: string, opts: GenOptions = {}): Promise<string> {
  const apiKey = getApiKey();
  const options = { ...DEFAULT_OPTIONS, ...opts };

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      input: prompt,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      store: options.store,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${txt}`);
  }

  const data = (await res.json()) as {
    output?: Array<{ content?: Array<{ text?: string }> }>;
    choices?: Array<{ message?: { content?: string } }>;
  };

  // Responses API returns structured output
  if (data.output && Array.isArray(data.output) && data.output.length > 0) {
    return data.output
      .flatMap((o) => o.content ?? [])
      .map((c) => c.text ?? '')
      .join('\n');
  }

  // Chat completions API fallback
  if (data.choices && data.choices.length > 0) {
    return data.choices[0]?.message?.content ?? '';
  }

  throw new Error('codexService: resposta inesperada da API');
}

export default { generateWithCodex };
