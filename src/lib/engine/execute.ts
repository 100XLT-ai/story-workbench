import { resolveReasoningOption } from "../writer/llm-reasoning";
import type { IChatMessage } from "../writer/llm-types";
import { parseJsonText } from "../writer/writer/writer-output";
import { evaluateWhen } from "./filter";
import { INPUT_ROOTS } from "./inputs";
import { REGISTRY } from "./registry";
import { renderTemplate, templateTokens } from "./template";
import type { CodeStep, Context, PromptStep, Step, VersionDefinition } from "./types";

export interface ChatRequest {
  model: string;
  messages: IChatMessage[];
  stream: false;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
  reasoning?: Record<string, unknown>;
  usage: { include: true };
}

/** The reasoning field sent for a step: a level is resolved for the model, as llm-reasoning.ts does. */
export function reasoningFor(step: PromptStep): Record<string, unknown> | undefined {
  const r = step.reasoning;
  if (r === null || r === undefined) return undefined;
  if (typeof r === "string") return resolveReasoningOption(r, step.model) as Record<string, unknown> | undefined;
  return { ...r };
}

export function renderMessages(step: PromptStep, ctx: Context): IChatMessage[] {
  const messages: IChatMessage[] = [];
  if (step.system !== null && step.system !== undefined && step.system !== "")
    messages.push({ role: "system", content: renderTemplate(step.system, ctx) });
  messages.push({ role: "user", content: renderTemplate(step.user, ctx) });
  return messages;
}

export function buildRequest(step: PromptStep, messages: IChatMessage[]): ChatRequest {
  const req: ChatRequest = { model: step.model, messages, stream: false, usage: { include: true } };
  if (step.temperature !== null && step.temperature !== undefined) req.temperature = step.temperature;
  if (step.maxTokens !== null && step.maxTokens !== undefined) req.max_tokens = step.maxTokens;
  if (step.format === "json" || step.format === "json_raw") req.response_format = { type: "json_object" };
  const reasoning = reasoningFor(step);
  if (reasoning) req.reasoning = reasoning;
  return req;
}

export function runCode(step: CodeStep, ctx: Context): Record<string, unknown> {
  const fn = REGISTRY[step.fn];
  if (!fn) throw new Error(`code function "${step.fn}" is not in the registry`);
  const result = fn.run(ctx, step.params ?? {});
  const out: Record<string, unknown> = {};
  for (const name of step.outputs) out[name] = name in result ? result[name] : null;
  return out;
}

/** Parses a prompt reply for the step's format. Throws a SyntaxError on bad JSON. */
export function parseReply(step: PromptStep, text: string): unknown {
  if (step.format === "json") return parseJsonText(text);
  return text;
}

export function skippedOutputs(step: Step): Record<string, unknown> {
  return Object.fromEntries(step.outputs.map((o) => [o, null]));
}

export function decideStep(step: Step, ctx: Context) {
  return evaluateWhen(step.when, ctx);
}

// ---------------------------------------------------------------- validation

export interface ValidationIssue {
  stepId: string;
  field: string;
  message: string;
}

/** Checks that every token, input and `when` field is a story input or an earlier step's output. */
export function validateVersion(def: VersionDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const available = new Set<string>(INPUT_ROOTS);
  const ids = new Set<string>();
  def.steps.forEach((step, i) => {
    const where = `step ${i + 1} "${step.id}"`;
    if (!step.id || !/^[A-Za-z_][\w]*$/.test(step.id))
      issues.push({ stepId: step.id, field: "id", message: `${where}: the id must be letters, digits and _ only.` });
    if (ids.has(step.id)) issues.push({ stepId: step.id, field: "id", message: `${where}: the id is used twice.` });
    ids.add(step.id);
    const need = (root: string, field: string, what: string) => {
      if (!available.has(root))
        issues.push({
          stepId: step.id,
          field,
          message: `${where}: ${what} reads "${root}", but no story input or earlier step makes it.`,
        });
    };
    for (const c of step.when ?? []) need(c.field.split(".")[0], "when", `the "when" condition ${c.field}`);
    if (step.kind === "prompt") {
      for (const f of ["system", "user"] as const) {
        const text = step[f];
        if (!text) continue;
        for (const t of templateTokens(text)) {
          if (!available.has(t.root))
            issues.push({
              stepId: step.id,
              field: f,
              message: `${where}: the token ${t.raw} in the ${f} prompt is unknown. No story input or earlier step makes "${t.root}".`,
            });
        }
      }
      if (!step.model) issues.push({ stepId: step.id, field: "model", message: `${where}: the model is empty.` });
    } else {
      if (!REGISTRY[step.fn])
        issues.push({ stepId: step.id, field: "fn", message: `${where}: the code function "${step.fn}" is not in the registry.` });
      for (const inp of step.inputs) need(inp.split(".")[0], "inputs", `the input`);
    }
    if (!step.outputs.length) issues.push({ stepId: step.id, field: "outputs", message: `${where}: the step writes no output.` });
    for (const o of step.outputs) available.add(o);
  });
  return issues;
}

/** The context names that a step reads: its declared inputs plus every token root and `when` root. */
export function stepReads(step: Step): string[] {
  const names = new Set<string>(step.inputs.map((i) => i.split(".")[0]));
  for (const c of step.when ?? []) names.add(c.field.split(".")[0]);
  if (step.kind === "prompt") {
    for (const t of [...templateTokens(step.system ?? ""), ...templateTokens(step.user)]) names.add(t.root);
  }
  return [...names];
}

// ---------------------------------------------------------------- OpenRouter

export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
  cost?: number;
  cost_details?: { upstream_inference_cost?: number };
}

export interface ChatResponse {
  id?: string;
  model?: string;
  choices?: { message?: { content?: unknown }; finish_reason?: string }[];
  usage?: ChatUsage;
  error?: { message?: string; code?: number };
}

/** USD as OpenRouter reports it (llm-call.ts costOf: a BYOK key reports the price in upstream_inference_cost). */
export function costOf(usage: ChatUsage | undefined): number | null {
  if (!usage) return null;
  const upstream = usage.cost_details?.upstream_inference_cost;
  if (typeof upstream === "number" && upstream > 0) return upstream;
  return typeof usage.cost === "number" ? usage.cost : null;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function post(req: ChatRequest, apiKey: string, timeoutMs: number): Promise<ChatResponse> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://story-workbench.vercel.app",
      "X-Title": "Story Workbench",
    },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let body: ChatResponse;
  try {
    body = JSON.parse(text) as ChatResponse;
  } catch {
    throw new HttpError(`OpenRouter answered ${res.status} with a body that is not JSON: ${text.slice(0, 300)}`, res.status);
  }
  if (!res.ok || body.error) {
    throw new HttpError(`OpenRouter ${res.status}: ${body.error?.message ?? text.slice(0, 300)}`, body.error?.code ?? res.status);
  }
  return body;
}

export interface ModelCall {
  response: ChatResponse;
  text: string;
  /** The request that produced the response (after any fallback). */
  sent: ChatRequest;
  notes: string[];
  ms: number;
}

/**
 * One chat completion with production's two recovery layers (openrouter.service.ts):
 * a model that mandates reasoning gets the request again without the reasoning
 * field, and a truncated reply (finish_reason=length) is retried once at a
 * larger max_tokens.
 */
export async function callOpenRouter(req: ChatRequest, apiKey: string, timeoutMs = 295_000): Promise<ModelCall> {
  const started = Date.now();
  const notes: string[] = [];
  let sent = req;
  let response: ChatResponse;
  try {
    response = await post(sent, apiKey, timeoutMs);
  } catch (e) {
    if (sent.reasoning && e instanceof HttpError && e.status === 400 && /reason/i.test(e.message)) {
      notes.push("the model mandates reasoning; sent again without the reasoning field");
      const { reasoning: _r, ...rest } = sent;
      sent = rest;
      response = await post(sent, apiKey, timeoutMs);
    } else throw e;
  }
  if (response.choices?.[0]?.finish_reason === "length" && sent.max_tokens !== undefined) {
    const bumped = Math.min(Math.max(sent.max_tokens * 2, 8192), 32000);
    if (bumped > sent.max_tokens) {
      notes.push(`the reply was cut at max_tokens ${sent.max_tokens}; retried once at ${bumped}`);
      sent = { ...sent, max_tokens: bumped };
      response = await post(sent, apiKey, timeoutMs);
    }
  }
  const content = response.choices?.[0]?.message?.content;
  return { response, text: typeof content === "string" ? content : "", sent, notes, ms: Date.now() - started };
}
