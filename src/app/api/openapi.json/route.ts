import { json, options } from "@/lib/http";

export const OPTIONS = options;

const filterParam = {
  name: "filter",
  in: "query",
  description: 'JSON list of { field, op, value }, joined by AND. Ops: eq, ne, lt, lte, gt, gte, in, contains, is_null, not_null. Example: [{"field":"rank","op":"in","value":[3,5]},{"field":"quote_count","op":"lte","value":1}]',
  schema: { type: "string" },
};
const id = (name: string, d: string) => ({ name, in: "path", required: true, description: d, schema: { type: "integer" } });
const ok = (d: string) => ({ "200": { description: d, content: { "application/json": { schema: { type: "object" } } } } });
const jsonBody = (props: Record<string, unknown>, required: string[] = []) => ({
  required: true,
  content: { "application/json": { schema: { type: "object", properties: props, ...(required.length ? { required } : {}) } } },
});
const Filter = { type: "array", items: { type: "object", properties: { field: { type: "string" }, op: { type: "string", enum: ["eq", "ne", "lt", "lte", "gt", "gte", "in", "contains", "is_null", "not_null"] }, value: {} }, required: ["field", "op"] } };
const Change = { type: "object", properties: { step_id: { type: "string" }, field: { type: "string" }, new_value: {} }, required: ["step_id", "field", "new_value"] };

export function GET(req: Request) {
  const base = new URL(req.url).origin;
  return json({
    openapi: "3.0.3",
    info: {
      title: "Story Workbench API",
      version: "1.0.0",
      description: "Open API (no login, no token) for the Story Workbench: stories from a fixed copy of longtale_dv2, writer workflows and versions, background runs and traces. The same functions are on the MCP server at /mcp.",
    },
    servers: [{ url: base }],
    paths: {
      "/api/stories": {
        get: { summary: "Query stories", parameters: [filterParam, { name: "sort", in: "query", schema: { type: "string" } }, { name: "dir", in: "query", schema: { type: "string", enum: ["asc", "desc"] } }, { name: "limit", in: "query", schema: { type: "integer", maximum: 1000 } }, { name: "offset", in: "query", schema: { type: "integer" } }], responses: ok("{ total, limit, offset, filter, rows }") },
        post: { summary: "Query stories (body)", requestBody: jsonBody({ filter: Filter, sort: { type: "string" }, dir: { type: "string" }, limit: { type: "integer" }, offset: { type: "integer" } }), responses: ok("{ total, rows }") },
      },
      "/api/stories/fields": { get: { summary: "Story fields and story inputs", responses: ok("{ fields, inputs }") } },
      "/api/stories/ask": { post: { summary: "Turn a plain request into a filter", requestBody: jsonBody({ text: { type: "string" } }, ["text"]), responses: ok("{ filter, explanation, count }") } },
      "/api/stories/{id}": { get: { summary: "One story's fixed inputs and runs", parameters: [id("id", "Story (candidate) id")], responses: ok("story") } },
      "/api/families": { get: { summary: "Workflow families with their versions", responses: ok("{ families }") } },
      "/api/versions": {
        get: { summary: "List versions", parameters: [{ name: "family_id", in: "query", schema: { type: "integer" } }], responses: ok("{ versions }") },
        post: {
          summary: "Create a version (from a parent plus changes, or a full definition)",
          requestBody: jsonBody({ author: { type: "string" }, note: { type: "string" }, parent_id: { type: "integer" }, changes: { type: "array", items: Change }, edits: { type: "array", items: { type: "object" } }, definition: { type: "object" }, new_family: { type: "string" }, family_id: { type: "integer" } }),
          responses: { "201": { description: "The new version with its diff" }, "422": { description: "Validation issues, for example an unknown {{token}}" } },
        },
      },
      "/api/versions/preview": { post: { summary: "Validate a definition and diff it against a parent (nothing is saved)", requestBody: jsonBody({ parent_id: { type: "integer" }, definition: { type: "object" } }, ["parent_id", "definition"]), responses: ok("{ issues, diff }") } },
      "/api/versions/{id}": { get: { summary: "A version's full definition", parameters: [id("id", "Version id")], responses: ok("version") } },
      "/api/versions/{id}/export": { get: { summary: "Download a version's full definition as one JSON file", parameters: [id("id", "Version id")], responses: ok("JSON file") } },
      "/api/propose-edit": { post: { summary: "Ask the prompt editor for changes from a comment", requestBody: jsonBody({ version_id: { type: "integer" }, step_id: { type: "string" }, comment: { type: "string" }, trace: { type: "object", properties: { run_story_id: { type: "integer" }, step_id: { type: "string" } } } }, ["version_id", "comment"]), responses: ok("{ changes, reason, diff, issues }") } },
      "/api/runs": {
        get: { summary: "List runs", responses: ok("{ runs }") },
        post: { summary: "Start a run (1 to 500 stories)", requestBody: jsonBody({ version_id: { type: "integer" }, story_ids: { type: "array", items: { type: "integer" } }, filter: Filter, author: { type: "string" }, note: { type: "string" }, overrides: { type: "object", properties: { generation_date: { type: "string" }, publisher: { type: "string" }, sponsor: { type: "string" }, aliases: { type: "array", items: { type: "string" } }, programs: { type: "array", items: { type: "string" } } } } }, ["version_id"]), responses: { "201": { description: "{ runId, estimate }" } } },
      },
      "/api/runs/estimate": { post: { summary: "Estimate the cost of a run", requestBody: jsonBody({ version_id: { type: "integer" }, story_ids: { type: "array", items: { type: "integer" } }, filter: Filter }, ["version_id"]), responses: ok("estimate") } },
      "/api/runs/{id}": { get: { summary: "A run with one row per story", parameters: [id("id", "Run id")], responses: ok("run") } },
      "/api/runs/{id}/results": { get: { summary: "Download the results", parameters: [id("id", "Run id"), { name: "format", in: "query", schema: { type: "string", enum: ["json", "csv", "md"] } }], responses: ok("results") } },
      "/api/runs/{id}/cancel": { post: { summary: "Cancel a run", parameters: [id("id", "Run id")], responses: ok("run") } },
      "/api/traces/{runId}/{storyId}": { get: { summary: "One story's trace in one run", parameters: [id("runId", "Run id"), id("storyId", "Story id"), { name: "step", in: "query", schema: { type: "string" } }], responses: ok("trace") } },
      "/api/traces/compare": { get: { summary: "Compare two run stories step by step", parameters: [{ name: "a", in: "query", required: true, schema: { type: "integer" } }, { name: "b", in: "query", required: true, schema: { type: "integer" } }], responses: ok("comparison") } },
      "/api/registry": { get: { summary: "Code functions for code steps", responses: ok("{ functions }") } },
      "/api/models": { get: { summary: "OpenRouter's model list with prices", parameters: [{ name: "q", in: "query", schema: { type: "string" } }], responses: ok("{ models }") } },
      "/api/settings": { get: { summary: "Settings and usage", responses: ok("{ settings, usage }") }, post: { summary: "Change a setting", requestBody: jsonBody({ key: { type: "string" }, value: {}, author: { type: "string" } }, ["key", "value"]), responses: ok("{ settings }") } },
      "/api/saved-filters": { get: { summary: "Saved filters", responses: ok("{ filters }") }, post: { summary: "Save a filter", requestBody: jsonBody({ name: { type: "string" }, filter: Filter, author: { type: "string" } }, ["name", "filter"]), responses: { "201": { description: "saved filter" } } } },
      "/api/health": { get: { summary: "Health, database size and usage", responses: ok("{ ok }") } },
    },
  });
}
