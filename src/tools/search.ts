import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { corexExports, icons, type ExportKind } from "../lib/corex.js";

const KIND_ORDER: Record<ExportKind, number> = { component: 0, hook: 1, utility: 2 };

export function registerSearchTools(server: McpServer) {
  server.registerTool(
    "search_components",
    {
      title: "Search CoreX UI components",
      description:
        "Search CoreX UI components and hooks by keyword across names, descriptions, and prop names (e.g. `date`, `modal`, `tone`).",
      inputSchema: z.object({ query: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const q = query.toLowerCase();
      const scored = corexExports
        .map((e) => {
          let score = 0;
          if (e.name.toLowerCase() === q) score += 10;
          else if (e.name.toLowerCase().includes(q)) score += 5;
          if (e.description.toLowerCase().includes(q)) score += 2;
          if (e.props.some((p) => p.toLowerCase().includes(q))) score += 1;
          return { e, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => KIND_ORDER[a.e.kind] - KIND_ORDER[b.e.kind] || b.score - a.score);

      const text = scored.length
        ? scored.map(({ e }) => `- ${e.name} (${e.kind})${e.description ? `: ${e.description.split("\n")[0]}` : ""}`).join("\n")
        : `No matches for "${query}".`;
      return { content: [{ type: "text", text }] };
    },
  );

  server.registerTool(
    "search_icons",
    {
      title: "Search CoreX UI icons",
      description: "Search the valid icon names accepted by `icon` props (Button, Icon, Card, ...).",
      inputSchema: z.object({ query: z.string().min(1) }),
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      const matches = icons.filter((i) => i.includes(query.toLowerCase()));
      const text = matches.length ? matches.join(", ") : `No icons match "${query}" (${icons.length} icons available).`;
      return { content: [{ type: "text", text }] };
    },
  );
}
