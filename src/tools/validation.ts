import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { findExport, PACKAGE_NAME } from "../lib/corex.js";

// Props React/JSX accepts on any component; never worth flagging.
const UNIVERSAL_PROPS = new Set(["key", "ref", "children", "className", "style", "id"]);

function checkProps(component: string, props: string[]): string[] {
  const entry = findExport(component);
  if (!entry || entry.kind !== "component") {
    return [`<${component}> is not a ${PACKAGE_NAME} component.`];
  }

  const issues: string[] = [];
  for (const prop of props) {
    if (UNIVERSAL_PROPS.has(prop) || /^(aria|data)-/.test(prop)) continue;
    const deprecation = entry.deprecatedProps[prop];
    if (deprecation) {
      issues.push(`<${component}> \`${prop}\` is deprecated: ${deprecation}`);
    } else if (!entry.props.includes(prop)) {
      issues.push(`<${component}> \`${prop}\` is not a known prop (it may still be a native Polaris attribute; check get_component).`);
    }
  }
  return issues;
}

function report(issues: string[]) {
  const text = issues.length ? `Found ${issues.length} issue(s):\n${issues.map((i) => `- ${i}`).join("\n")}` : "No issues found.";
  return { content: [{ type: "text" as const, text }] };
}

export function registerValidationTools(server: McpServer) {
  server.registerTool(
    "validate_props",
    {
      title: "Validate component props",
      description: "Check prop names for a CoreX UI component: flags deprecated legacy props (with their replacement) and unknown props.",
      inputSchema: z.object({
        component: z.string(),
        props: z.array(z.string()).describe("Prop names used on the component"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ component, props }) => report(checkProps(component, props)),
  );

  server.registerTool(
    "validate_code",
    {
      title: "Validate CoreX UI JSX",
      description:
        "Scan a JSX/TSX snippet for CoreX UI misuse: components that don't exist in the package, deprecated legacy props, and unknown props.",
      inputSchema: z.object({ code: z.string() }),
      annotations: { readOnlyHint: true },
    },
    async ({ code }) => {
      const issues: string[] = [];
      // Opening tags of capitalized components, including compounds like <Table.Row>.
      for (const [, tag, attrs] of code.matchAll(/<([A-Z]\w*(?:\.[A-Z]\w*)?)((?:[^<>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g)) {
        const withoutExpressions = attrs.replace(/\{(?:[^{}]|\{[^{}]*\})*\}/g, "{}").replace(/"[^"]*"|'[^']*'/g, '""');
        const props = [...withoutExpressions.matchAll(/(?:^|\s)([\w-]+)(?==|\s|\/|$)/g)].map((m) => m[1]);
        issues.push(...checkProps(tag, props));
      }
      return report([...new Set(issues)]);
    },
  );
}
