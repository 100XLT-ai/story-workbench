const STOP_WORDS = new Set(
  (
    "a an the and or but of to in on for with by at from as is are was were be been " +
    "has have had it its this that these those their our we they he she his her will " +
    "can not no into over more than about also which who whom whose all each per"
  ).split(" "),
);

const NBSP = new RegExp(String.fromCharCode(160), "g");

/** Normalizes quotes, dashes and whitespace so copied text compares equal. */
export function normalizeText(text: string): string {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(NBSP, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lower-case content words, without stop words and punctuation. */
export function contentWords(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9$%.,' ]/g, " ")
    .split(" ")
    .map((w) => w.replace(/^[.,']+|[.,']+$/g, ""))
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/** Splits text into sentences; keeps quoted sentences whole where it can. */
export function splitSentences(text: string): string[] {
  const flat = normalizeText(text.replace(/\n+/g, " \n "));
  const parts = flat.split(/(?<=[.!?]["')\]]?)\s+(?=["'([]?[A-Z0-9$])|\s\n\s/);
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Text with every double-quoted passage removed (the narrator's own words). */
export function stripQuoted(text: string): string {
  return normalizeText(text).replace(/"[^"]*"/g, " ");
}

/** Double-quoted passages in the text, in order. */
export function quotedPassages(text: string): string[] {
  return [...normalizeText(text).matchAll(/"([^"]+)"/g)].map((m) =>
    m[1].trim(),
  );
}

export function wordCount(text: string): number {
  return normalizeText(text)
    .split(" ")
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
