import { NextResponse } from "next/server";
import { BadRequest, FilterError, VersionError } from "./service";
import { NotFound } from "./data/story-inputs";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...CORS, ...headers } });
}

export function fail(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof VersionError) return json({ error: message, issues: e.issues }, 422);
  if (e instanceof BadRequest || e instanceof FilterError || e instanceof SyntaxError) return json({ error: message }, 400);
  if (e instanceof NotFound) return json({ error: message }, 404);
  console.error(e);
  return json({ error: message }, 500);
}

export async function body<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new BadRequest("The body is not valid JSON.");
  }
}

export const num = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? undefined : Number(v));

export function notFound(what: string) {
  return json({ error: `${what} not found` }, 404);
}

export function options() {
  return new Response(null, { status: 204, headers: CORS });
}
