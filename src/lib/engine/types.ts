/** One filter clause. The same shape serves story filters, saved filters and step `when` conditions. */
export type FilterOp =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "in"
  | "contains"
  | "is_null"
  | "not_null";

export interface FilterClause {
  field: string;
  op: FilterOp;
  value?: unknown;
}

/** null = send no reasoning field; a level string is resolved per model; an object is sent as is. */
export type ReasoningSetting =
  | null
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | { effort?: "minimal" | "low" | "medium" | "high"; max_tokens?: number; enabled?: boolean };

interface StepBase {
  id: string;
  name: string;
  /** One plain sentence: what this step does. Shown on its card. */
  purpose: string;
  inputs: string[];
  outputs: string[];
  /** All clauses must hold, or the step is skipped. Fields read the context. */
  when?: FilterClause[];
  /** Which part of the workflow the step belongs to. */
  part: "article" | "social" | "ad" | "other";
}

export interface PromptStep extends StepBase {
  kind: "prompt";
  /** Omit or null: no system message is sent. */
  system: string | null;
  user: string;
  model: string;
  temperature: number | null;
  maxTokens: number | null;
  reasoning: ReasoningSetting;
  /**
   * json: sends response_format json_object and parses the reply (bad JSON fails the step).
   * json_raw: sends response_format json_object and keeps the reply text (a later code step parses it).
   * text: sends no response_format and keeps the reply text.
   */
  format: "json" | "json_raw" | "text";
}

export interface CodeStep extends StepBase {
  kind: "code";
  fn: string;
  params?: Record<string, unknown>;
}

export type Step = PromptStep | CodeStep;

export interface VersionDefinition {
  steps: Step[];
  settings: Record<string, unknown>;
}

export type Context = Record<string, unknown>;
