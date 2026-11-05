function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Single-pass placeholder substitution. Scans the ORIGINAL template once and
 * replaces every occurrence of any key in `replacements` with its value.
 *
 * This is deliberately NOT a sequential chain of one-token-at-a-time
 * substitutions (template.split(tokenA).join(valueA), then
 * .split(tokenB).join(valueB), ...). A sequential chain re-scans the
 * GROWING string on every step, so if an earlier-inserted value happens to
 * contain the literal text of a later token (e.g. externally-influenced ad
 * copy containing the substring "{NEGATIVE_PROMPT}"), the later pass would
 * blindly re-match and splice into that already-inserted content.
 *
 * A single `String.replace` with a global regex matches only against the
 * original input string — text inside the replacement callback's return
 * value is never re-scanned — so this is safe even when `replacements`
 * values come from untrusted/LLM-influenced sources.
 */
export function substituteTokens(
  template: string,
  replacements: Record<string, string>,
): string {
  const tokens = Object.keys(replacements).sort((a, b) => b.length - a.length);
  if (tokens.length === 0) return template;
  const pattern = new RegExp(tokens.map(escapeForRegExp).join("|"), "g");
  return template.replace(pattern, (match) => replacements[match]);
}
