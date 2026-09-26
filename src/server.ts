import { McpServer } from "@modelcontextprotocol/server";
import { registerComponentTools } from "./tools/components.js";
import { registerSearchTools } from "./tools/search.js";
import { registerValidationTools } from "./tools/validation.js";
import { registerComponentResources } from "./resources/components.js";
import { registerGuidelineResources } from "./resources/guidelines.js";

export function createServer() {
  const server = new McpServer({
    name: "corex-ui",
    version: "0.1.0",
  });

  registerComponentTools(server);
  registerSearchTools(server);
  registerValidationTools(server);
  registerComponentResources(server);
  registerGuidelineResources(server);

  return server;
}
