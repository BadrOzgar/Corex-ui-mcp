import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { corexExports, findExport, renderExport } from "../lib/corex.js";

export function registerComponentResources(server: McpServer) {
  server.registerResource(
    "component",
    new ResourceTemplate("corex://components/{name}", {
      list: async () => ({
        resources: corexExports
          .filter((e) => e.kind !== "utility")
          .map((e) => ({
            uri: `corex://components/${e.name}`,
            name: e.name,
            description: e.description.split("\n")[0] || undefined,
            mimeType: "text/markdown",
          })),
      }),
    }),
    { title: "CoreX UI component reference", mimeType: "text/markdown" },
    async (uri, { name }) => {
      const entry = findExport(String(name));
      if (!entry) throw new Error(`Unknown component: ${name}`);
      return { contents: [{ uri: uri.href, text: renderExport(entry) }] };
    },
  );
}
