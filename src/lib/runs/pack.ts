import { gunzipSync, gzipSync } from "node:zlib";

/** Large trace and state values are stored as gzip JSON (§10b). */
export function pack(value: unknown): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(value ?? null), "utf8"));
}

export function unpack(buf: Buffer | Uint8Array | null | undefined): unknown {
  if (!buf) return null;
  return JSON.parse(gunzipSync(Buffer.from(buf)).toString("utf8")) as unknown;
}
