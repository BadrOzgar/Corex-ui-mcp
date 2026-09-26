// Starts the built server over stdio, calls every tool/resource once, and prints the results.
// Usage: npm run build && npm run smoke   (or `npm run smoke -- --dev` to run src/ through tsx, no build)
import { spawn } from "node:child_process";

const args = process.argv.includes("--dev") ? ["--import", "tsx", "src/index.ts"] : ["dist/index.js"];
const server = spawn(process.execPath, args, { stdio: ["pipe", "pipe", "inherit"] });

let buffer = "";
const pending = new Map();
server.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const msg = JSON.parse(buffer.slice(0, newline));
    buffer = buffer.slice(newline + 1);
    pending.get(msg.id)?.(msg);
  }
});

let nextId = 1;
function request(method, params = {}) {
  const id = nextId++;
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 10000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result);
    });
  });
}

const callTool = async (name, args) => {
  const result = await request("tools/call", { name, arguments: args });
  return (result.isError ? "[isError] " : "") + result.content.map((c) => c.text).join("\n");
};

function show(title, text, maxLines = 25) {
  const lines = text.split("\n");
  console.log(`\n=== ${title} ===\n${lines.slice(0, maxLines).join("\n")}${lines.length > maxLines ? `\n… (${lines.length - maxLines} more lines)` : ""}`);
}

try {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "1.0.0" },
  });
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  show("initialize", `${init.serverInfo.name}@${init.serverInfo.version}`);

  const { tools } = await request("tools/list");
  show("tools/list", tools.map((t) => `- ${t.name}`).join("\n"));

  show("list_components", await callTool("list_components", {}), 12);
  show("get_component Button", await callTool("get_component", { name: "Button" }), 40);
  show("get_component Table.Row", await callTool("get_component", { name: "Table.Row" }), 10);
  show("get_component Input (should fail)", await callTool("get_component", { name: "Input" }));
  show("search_components date", await callTool("search_components", { query: "date" }));
  show("search_icons cart", await callTool("search_icons", { query: "cart" }));
  show("validate_props", await callTool("validate_props", { component: "Button", props: ["primary", "size", "onClick"] }));
  show(
    "validate_code",
    await callTool("validate_code", {
      code: `<Page title="Settings">
  <Card sectioned>
    <Input label="Name" />
    <TextField label="Title" value={title} onChange={(v) => setTitle(v)} />
    <Button primary destructive onClick={() => save({ id: 1 })}>Save</Button>
  </Card>
</Page>`,
    }),
  );

  const { resources } = await request("resources/list");
  show("resources/list", `${resources.length} resources, e.g.\n${resources.slice(0, 4).map((r) => `- ${r.uri}`).join("\n")}`);
  const guidelines = await request("resources/read", { uri: "corex://guidelines" });
  show("resources/read corex://guidelines", guidelines.contents[0].text, 8);

  console.log("\nSmoke test passed.");
} catch (err) {
  console.error(`\nSmoke test failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  server.kill();
}
