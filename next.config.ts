import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The MCP resource workbench://guide reads the team guide at run time.
  // The /guide pages are static (read at build time); these entries keep the
  // files in the server bundle if a guide route ever renders on demand.
  outputFileTracingIncludes: {
    "/mcp": ["./docs/TEAM-GUIDE.md"],
    "/guide": ["./docs/TEAM-GUIDE.md", "./README.md"],
    "/guide/developers": ["./docs/TEAM-GUIDE.md", "./README.md"],
    "/guide/scoring": ["./docs/SCORING.md"],
  },
};

export default withWorkflow(nextConfig);
