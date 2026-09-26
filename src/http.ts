#!/usr/bin/env node
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 3000);
// Bind to localhost by default so the server is only reachable through the reverse proxy.
const HOST = process.env.HOST ?? "127.0.0.1";
// When set, every /mcp request must send `Authorization: Bearer <key>` or `x-api-key: <key>`.
const API_KEY = process.env.MCP_API_KEY;

const mcp = createMcpHandler(createServer, {
  onerror: (error) => console.error("[mcp]", error.message),
});

function isAuthorized(req: IncomingMessage): boolean {
  if (!API_KEY) return true;
  const header = req.headers.authorization;
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : req.headers["x-api-key"];
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(API_KEY);
  return a.length === b.length && timingSafeEqual(a, b);
}

function toRequest(req: IncomingMessage): Request {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
    else if (value !== undefined) headers.set(name, value);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    duplex: "half",
  } as RequestInit);
}

async function sendResponse(res: ServerResponse, response: Response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) return res.end();
  // Stream the body so SSE responses reach the client as they are produced.
  const nodeStream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
  res.on("close", () => nodeStream.destroy());
  nodeStream.pipe(res);
}

const httpServer = createHttpServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;

  if (path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ status: "ok" }));
  }

  if (path !== "/mcp") {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("Not found");
  }

  if (!isAuthorized(req)) {
    res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer" });
    return res.end(JSON.stringify({ error: "Unauthorized" }));
  }

  try {
    await sendResponse(res, await mcp.fetch(toRequest(req)));
  } catch (error) {
    console.error("[http]", error);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Corex MCP listening on http://${HOST}:${PORT}/mcp${API_KEY ? " (API key required)" : ""}`);
});

function shutdown() {
  httpServer.close();
  mcp.close().finally(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
