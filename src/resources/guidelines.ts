import { McpServer } from "@modelcontextprotocol/server";
import { PACKAGE_NAME, packageVersion, patterns } from "../lib/corex.js";

const GUIDELINES = `# CoreX UI guidelines (${PACKAGE_NAME}@${packageVersion})

CoreX UI provides legacy-\`@shopify/polaris\`-compatible React components backed by Shopify's
Polaris web components (\`s-*\` custom elements).

## Setup
- Import everything from \`${PACKAGE_NAME}\`; migrating code only needs its import source swapped from \`@shopify/polaris\`.
- The app must load the Polaris web components script (Shopify CLI apps already do):
  \`<script src="https://cdn.shopify.com/shopifycloud/polaris-1.js"></script>\`
- React 18 or 19 is required as a peer dependency.

## Writing new code
- Prefer the modern props over legacy boolean flags, e.g. \`variant="primary"\` instead of \`primary\`,
  \`tone="critical"\` instead of \`destructive\`, \`href\` instead of \`url\`.
  Legacy props still work but are deprecated; \`validate_code\` flags them.
- Spacing uses Polaris tokens (\`small-200\`, \`base\`, \`large-100\`, ...) rather than legacy numeric values (\`200\`, \`400\`).
- Only use icon names from \`search_icons\`.
- App Bridge features (\`useToast\`, \`useSaveBar\`, \`SaveBar\`, \`TitleBar\`, \`AppNav\`) only work inside an embedded Shopify admin session; outside one they no-op.
`;

export function registerGuidelineResources(server: McpServer) {
  server.registerResource(
    "guidelines",
    "corex://guidelines",
    { title: "CoreX UI guidelines", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, text: GUIDELINES }] }),
  );

  server.registerResource(
    "patterns",
    "corex://patterns",
    { title: "CoreX UI layout patterns", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, text: JSON.stringify(patterns, null, 2) }] }),
  );
}
