/**
 * Shared LLM reasoning ("thinking") resolver.
 *
 * The discovery + generation pipelines inherit Gemini's default-ON thinking on
 * every LLM call, which Social Suite measured as the bulk of its A6b/B2 latency
 * (~53s wall on a 20-page site). We match Social Suite by bounding it.
 *
 * Mechanism: a reasoning LEVEL string is resolved ONCE here so every call site
 * inherits the same mapping instead of repeating the literal. The result is
 * spread into the request body alongside the other options — the service already
 * does `{ model, messages, stream:false, ...options }`
 * (`openrouter.service.ts`), so no service-method change is needed.
 *
 * ── The resolver is MODEL-AWARE (job 697 fix) ──────────────────────────────
 *
 * OpenRouter exposes TWO different reasoning controls and models accept only
 * one of them. Sending the wrong one is not an error — it is silently DROPPED,
 * and the model then runs at its own `default_effort`.
 *
 *   - `reasoning.effort`     → Gemini 3.x (maps to Google's `thinkingLevel`)
 *   - `reasoning.max_tokens` → models with `reasoning.supports_max_tokens: true`
 *                              on `GET /api/v1/models`. As of 2026-07-28 that is
 *                              EIGHT models — Qwen, Nemotron, claude-opus-4.6 —
 *                              and NOT A SINGLE Gemini model.
 *   - `reasoning.enabled:false` → only where `reasoning.mandatory` is false.
 *                              Verified working on gemini-2.5-* (job 697's 32
 *                              extract calls all reported reasoning_tokens=0).
 *
 * This file previously resolved EVERY level to `{ max_tokens }`, which meant
 * every 3.x Gemini call silently ran at `default_effort: "medium"` and every
 * `GENERATION_REASONING_*` / `DISCOVERY_REASONING_IDEAS` value was inert.
 * Measured on job 697 (`google/gemini-3.5-flash`, displayCopy): the level moved
 * `low` (1024) → `minimal` (256), a 4x cut, and reasoning_tokens did not budge
 * — 1117/1137 on jobs 674/675 vs 1016/1161 on job 697. Both sit where
 * default_effort=medium lands, because neither budget was ever applied.
 *
 * The level names below are deliberately the SAME strings as Gemini 3.x's
 * `supported_efforts` (`["high","medium","low","minimal"]`), so the effort
 * mapping is an identity and no translation table is needed.
 *
 * NOTE: the pre-fix comment here claimed the opposite — that `effort` is not
 * reliably honored on gemini-3.x while a budget is. That was inverted against
 * the live API and is what this change corrects.
 *
 * Level → option:
 *   "off"                        → { enabled: false }   (disable; rejected where
 *                                   reasoning is mandatory — openrouter.service.ts
 *                                   catches the 400 and strips the key)
 *   "minimal" | "low" | "medium" | "high"
 *     · effort-model (Gemini 3.x) → { effort: <level> }
 *     · budget-model / unknown    → { max_tokens: 256 | 1024 | 4096 | 8192 }
 *   "on" | undefined | "" | "?"  → undefined            (omit; keep the model's
 *                                   own default thinking-on)
 *
 * Callers do not pass the model by hand: `resolveGenerationReasoning(job)` and
 * `resolveDiscoveryReasoning(job)` look it up from their own registry, so a
 * model change in `GENERATION_MODELS` / `DISCOVERY_MODELS` automatically moves
 * the job onto the right control.
 *
 * Effort is a CEILING HINT, not a hard budget — Google still decides actual
 * token consumption from task complexity ("Set reasoning effort for Gemini 3
 * models", OpenRouter reasoning-tokens guide). Expect a large reduction at
 * "minimal", not zero.
 *
 * See .plan/discovery-latency-remediation/PLAN.md Slice 1 + the
 * Social-Suite-alignment slice.
 */

import type { IChatOptions } from "./llm-types";

export type LlmReasoningSetting = NonNullable<IChatOptions["reasoning"]>;

/** The four non-"off" levels, in the exact spelling Gemini 3.x `effort` uses. */
type ReasoningEffort = NonNullable<LlmReasoningSetting["effort"]>;

/**
 * Reasoning LEVEL → thinking-token budget, for BUDGET-style models only
 * (`reasoning.supports_max_tokens: true`). Gemini never takes this path.
 */
const REASONING_BUDGET: Record<string, number> = {
  minimal: 256,
  low: 1024,
  medium: 4096,
  high: 8192,
};

/** Levels that are valid `effort` values (same keys as REASONING_BUDGET). */
const EFFORT_LEVELS = new Set<string>(["minimal", "low", "medium", "high"]);

/**
 * True when `model` takes `reasoning.effort` rather than `reasoning.max_tokens`.
 *
 * Gemini 3.x (`google/gemini-3*` — 3-flash-preview, 3.1-*, 3.5-*, 3.6-*) is
 * effort-only. Gemini 2.5 is NOT: it exposes no `supported_efforts` at all and
 * is driven by `enabled:false`, so it stays on the budget path where a non-"off"
 * level is (harmlessly) a no-op rather than an unsupported `effort` string.
 *
 * Exported so the mapping is greppable + directly unit-testable. Deliberately a
 * prefix test, not a per-model table: a table would silently mis-route the next
 * `gemini-3.x` id someone pins via env, which is exactly the failure this whole
 * change is fixing.
 */
export function usesEffortReasoning(model: string | undefined | null): boolean {
  return /^google\/gemini-3/.test((model ?? "").trim().toLowerCase());
}

/**
 * Map a reasoning LEVEL string (+ the model it will be sent to) to the
 * `reasoning` request option. Pure + exhaustively tested — no env read, no
 * ConfigService.
 *
 * `model` is optional: omitted (or unrecognized) keeps the historical budget
 * behavior, which is correct for budget-style models and a safe no-op elsewhere.
 * Prefer passing it — that is what routes Gemini 3.x onto `effort`.
 */
export function resolveReasoningOption(
  value: string | undefined | null,
  model?: string | undefined | null,
): LlmReasoningSetting | undefined {
  const normalized = (value ?? "").trim().toLowerCase();

  if (normalized === "off") {
    return { enabled: false };
  }

  if (EFFORT_LEVELS.has(normalized)) {
    // Gemini 3.x: the level IS the effort. Note `minimal` is absent from
    // supported_efforts on the 3.x PRO ids (they list high/medium/low only) —
    // no registry job runs on a pro model today, so no clamp is needed; add one
    // here if a pro id is ever pinned.
    if (usesEffortReasoning(model)) {
      return { effort: normalized as ReasoningEffort };
    }
    return { max_tokens: REASONING_BUDGET[normalized] };
  }

  // "on", "", unset, or any unrecognized value → omit the field so the model
  // keeps its own default (thinking-on). Never throws: an unknown value must not
  // break an LLM call, and the Joi schema already rejects bad values at boot.
  return undefined;
}

/**
 * Convenience reader: resolve the reasoning option from the current
 * `LLM_REASONING` env value. The default is "off" (reasoning disabled), matching
 * the Joi schema default, so an unset flag still ships the fast path.
 *
 * NOTE: every PRODUCTION call site reads its level from a per-task registry
 * (DISCOVERY_REASONING / GENERATION_REASONING), NOT from this helper —
 * `LLM_REASONING` is retained as the global default for any call site that opts
 * out of a per-task lever (legacy / future); there are none today. The per-task
 * registries take their Social-Suite-aligned level DIRECTLY and intentionally do
 * NOT consult `LLM_REASONING`, so a global `LLM_REASONING=off` can never (a)
 * silently re-truncate the narrative nor (b) force `off` onto a 3.x model.
 */
export function getLlmReasoningOption(
  model?: string | undefined | null,
): LlmReasoningSetting | undefined {
  return resolveReasoningOption(process.env.LLM_REASONING ?? "off", model);
}
