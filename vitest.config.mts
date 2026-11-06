import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The "@/" alias of tsconfig.json, so tests can import modules that use it (the field registry).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
