import type { IChatMessage } from "../writer/llm-types";
import { costOf, buildRequest, decideStep, HttpError, parseReply, renderMessages, runCode, skippedOutputs, stepReads, type ChatRequest, type ModelCall } from "./execute";
import { getPath } from "./template";
import type { Context, PromptStep, Step } from "./types";

export type LlmFn = (req: ChatRequest, step: PromptStep) => Promise<ModelCall>;

export interface StepTrace {
  stepIndex: number;
  stepId: string;
  stepName: string;
  kind: Step["kind"];
  status: "done" | "skipped" | "failed";
  reason: string;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  tokensReasoning: number | null;
  cost: number | null;
  error: string | null;
  startedAt: string;
  endedAt: string;
  body: {
    messages?: IChatMessage[];
    request?: Omit<ChatRequest, "messages">;
    response?: unknown;
    text?: string;
    notes?: string[];
    attempts?: number;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
  };
}

/** The values a step reads, for its Input tab. */
export function inputValues(step: Step, ctx: Context): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of stepReads(step)) out[name] = getPath(ctx, name) ?? null;
  return out;
}

const transient = (e: unknown) =>
  e instanceof SyntaxError || (e instanceof HttpError && (e.status >= 500 || e.status === 429)) || (e instanceof Error && /fetch failed|timeout|aborted|ECONNRESET/i.test(e.message));

/**
 * Runs one step on the context. Returns the outputs to merge into the context
 * and the trace. A model call retries once on bad JSON, a 5xx, a 429 or a network error (§5.2).
 */
export async function executeStep(step: Step, stepIndex: number, ctx: Context, llm: LlmFn | null): Promise<{ outputs: Record<string, unknown>; trace: StepTrace }> {
  const startedAt = new Date().toISOString();
  const decision = decideStep(step, ctx);
  const base = {
    stepIndex,
    stepId: step.id,
    stepName: step.name,
    kind: step.kind,
    model: step.kind === "prompt" ? step.model : null,
    tokensIn: null,
    tokensOut: null,
    tokensReasoning: null,
    cost: null,
    error: null,
    startedAt,
  };
  const input = inputValues(step, ctx);
  if (!decision.run) {
    const outputs = skippedOutputs(step);
    return { outputs, trace: { ...base, status: "skipped", reason: decision.reason, endedAt: new Date().toISOString(), body: { input, output: outputs } } };
  }
  if (step.kind === "code") {
    try {
      const outputs = runCode(step, ctx);
      return { outputs, trace: { ...base, status: "done", reason: decision.reason, endedAt: new Date().toISOString(), body: { input, output: outputs } } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { outputs: {}, trace: { ...base, status: "failed", reason: decision.reason, error: msg, endedAt: new Date().toISOString(), body: { input, output: {} } } };
    }
  }
  let messages: IChatMessage[];
  let request: ChatRequest;
  try {
    messages = renderMessages(step, ctx);
    request = buildRequest(step, messages);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { outputs: {}, trace: { ...base, status: "failed", reason: decision.reason, error: `render: ${msg}`, endedAt: new Date().toISOString(), body: { input, output: {} } } };
  }
  if (!llm) throw new Error("no model function");
  const { messages: _m, ...requestShown } = request;
  let attempts = 0;
  let lastError: string | null = null;
  let call: ModelCall | null = null;
  let tokensIn = 0;
  let tokensOut = 0;
  let tokensReasoning = 0;
  let cost = 0;
  let costKnown = false;
  while (attempts < 2) {
    attempts++;
    try {
      call = await llm(request, step);
      const u = call.response.usage;
      tokensIn += u?.prompt_tokens ?? 0;
      tokensOut += u?.completion_tokens ?? 0;
      tokensReasoning += u?.completion_tokens_details?.reasoning_tokens ?? 0;
      const c = costOf(u);
      if (c !== null) {
        cost += c;
        costKnown = true;
      }
      if (call.response.choices?.[0]?.finish_reason === "length" && step.format === "json")
        throw new Error(`${step.id}: output truncated (finish_reason=length)`);
      const parsed = parseReply(step, call.text);
      const outputs = Object.fromEntries(step.outputs.map((o, i) => [o, i === 0 ? parsed : null]));
      return {
        outputs,
        trace: {
          ...base,
          model: call.response.model ?? step.model,
          status: "done",
          reason: decision.reason,
          tokensIn,
          tokensOut,
          tokensReasoning,
          cost: costKnown ? cost : null,
          endedAt: new Date().toISOString(),
          body: { messages, request: requestShown, response: call.response, text: call.text, notes: call.notes, attempts, input, output: outputs },
        },
      };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (!transient(e) || attempts >= 2) break;
    }
  }
  return {
    outputs: {},
    trace: {
      ...base,
      status: "failed",
      reason: decision.reason,
      error: lastError,
      tokensIn,
      tokensOut,
      tokensReasoning,
      cost: costKnown ? cost : null,
      endedAt: new Date().toISOString(),
      body: { messages, request: requestShown, response: call?.response, text: call?.text, notes: call?.notes, attempts, input, output: {} },
    },
  };
}

/** Runs a whole version on one story in memory (tests, goldens, local scripts). */
export async function runInMemory(steps: Step[], inputs: Context, llm: LlmFn | null, stopBefore?: (step: Step) => boolean) {
  const ctx: Context = { ...inputs };
  const traces: StepTrace[] = [];
  for (let i = 0; i < steps.length; i++) {
    if (stopBefore?.(steps[i])) break;
    const { outputs, trace } = await executeStep(steps[i], i, ctx, llm);
    traces.push(trace);
    if (trace.status === "failed") break;
    Object.assign(ctx, outputs);
  }
  return { ctx, traces };
}
