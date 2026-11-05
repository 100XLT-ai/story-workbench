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
  outputFileTracingIncludes: {
    "/mcp": ["./docs/TEAM-GUIDE.md"],
  },
};

export default withWorkflow(nextConfig);
