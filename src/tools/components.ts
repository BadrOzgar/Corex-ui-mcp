import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { corexExports, findExport, packageVersion, renderExport, PACKAGE_NAME } from "../lib/corex.js";

export function registerComponentTools(server: McpServer) {
  server.registerTool(
    "list_components",
    {
      title: "List CoreX UI exports",
      description: `List the components, hooks, and utilities exported by ${PACKAGE_NAME}.`,
      inputSchema: z.object({
        kind: z.enum(["component", "hook", "utility", "all"]).default("component"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ kind }) => {
      const list = corexExports
        .filter((e) => kind === "all" || e.kind === kind)
        .map((e) => `- ${e.name}${e.description ? `: ${e.description.split("\n")[0]}` : ""}`);
      const text = `${PACKAGE_NAME}@${packageVersion}: ${list.length} ${kind === "all" ? "exports" : `${kind}s`}\n\n${list.join("\n")}`;
      return { content: [{ type: "text", text }] };
    },
  );

  server.registerTool(
    "get_component",
    {
      title: "Get CoreX UI component",
      description:
        "Get the import line, description, deprecated props, examples, and full TypeScript props for a CoreX UI component or hook. Compound names like `Table.Row` are accepted.",
      inputSchema: z.object({ name: z.string() }),
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => {
      const entry = findExport(name);
      if (!entry) {
        return {
          isError: true,
          content: [{ type: "text", text: `"${name}" is not exported by ${PACKAGE_NAME}. Use search_components to find the right name.` }],
        };
      }
      return { content: [{ type: "text", text: renderExport(entry) }] };
    },
  );
}
