export interface ModelInfo {
  id: string;
  name: string;
  context_length: number | null;
  /** USD per token. */
  prompt: number;
  completion: number;
}

let cache: { at: number; models: ModelInfo[] } | null = null;

/** OpenRouter's public model list (no key), cached for an hour. */
export async function listModels(): Promise<ModelInfo[]> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.models;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(15_000) });
    const body = (await res.json()) as { data?: { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }[] };
    const models = (body.data ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      context_length: m.context_length ?? null,
      prompt: Number(m.pricing?.prompt ?? 0) || 0,
      completion: Number(m.pricing?.completion ?? 0) || 0,
    }));
    cache = { at: Date.now(), models };
    return models;
  } catch {
    return cache?.models ?? [];
  }
}

export async function priceOf(model: string): Promise<ModelInfo | null> {
  return (await listModels()).find((m) => m.id === model) ?? null;
}
