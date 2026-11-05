// The app's own copy of the two OpenRouter types the ported writer code reads
// (longtale-core `openrouter.interface.ts`). Text messages only.
export interface IChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface IChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" | "text" };
  reasoning?: {
    enabled?: boolean;
    effort?: "minimal" | "low" | "medium" | "high";
    max_tokens?: number;
  };
}
