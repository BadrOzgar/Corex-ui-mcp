import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export const PACKAGE_NAME = "@xco-agency/corex-ui";

export type ExportKind = "component" | "hook" | "utility";

export interface CorexExport {
  name: string;
  kind: ExportKind;
  description: string;
  /** Prop names found on the component's declaration and its `<Name>PropsType`. */
  props: string[];
  /** Deprecated prop name -> deprecation note (usually names the replacement). */
  deprecatedProps: Record<string, string>;
  /** Raw type declarations from the package's .d.ts, with huge unions collapsed. */
  types: string;
}

export interface CuratedComponent {
  description?: string;
  notes?: string[];
  examples?: string[];
}

export interface Pattern {
  description: string;
  components: string[];
  rules: string[];
}

interface Statement {
  name: string;
  jsdoc: string;
  text: string;
}

const require = createRequire(import.meta.url);
// The package doesn't export ./package.json, so resolve its entry (dist/index.cjs) and walk up.
const packageDir = dirname(dirname(require.resolve(PACKAGE_NAME)));

export const packageVersion: string = JSON.parse(
  readFileSync(join(packageDir, "package.json"), "utf8"),
).version;

// Resolved from the project root so it works from both src/ (tsx) and dist/ (node).
const dataDir = new URL("../../src/data/", import.meta.url);

function readData<T>(file: string): T {
  return JSON.parse(readFileSync(new URL(file, dataDir), "utf8")) as T;
}

export const curated = readData<Record<string, CuratedComponent>>("components.json");
export const patterns = readData<Record<string, Pattern>>("patterns.json");

/** Splits the .d.ts into top-level statements, each with its leading JSDoc. */
function parseStatements(source: string): Map<string, Statement> {
  const statements = new Map<string, Statement>();
  const lines = source.split(/\r?\n/);
  const startRe = /^(?:declare (?:const|function|class)|type|interface) (\w+)/;

  let jsdoc: string[] = [];
  let inDoc = false;
  let current: { name: string; jsdoc: string; lines: string[] } | undefined;

  const flush = () => {
    if (current && !statements.has(current.name)) {
      statements.set(current.name, { name: current.name, jsdoc: current.jsdoc, text: current.lines.join("\n").trimEnd() });
    }
    current = undefined;
  };

  for (const line of lines) {
    if (inDoc) {
      jsdoc.push(line);
      if (line.includes("*/")) inDoc = false;
      continue;
    }
    if (line.startsWith("/**")) {
      flush();
      jsdoc = [line];
      inDoc = !line.includes("*/");
      continue;
    }
    const match = startRe.exec(line);
    if (match) {
      flush();
      current = { name: match[1], jsdoc: jsdoc.join("\n"), lines: [line] };
      jsdoc = [];
      continue;
    }
    if (line.startsWith("export ") || line.startsWith("import ")) {
      flush();
      continue;
    }
    if (current) current.lines.push(line);
    else if (line.trim() === "") jsdoc = [];
  }
  flush();
  return statements;
}

function cleanJsdoc(jsdoc: string): string {
  return jsdoc
    .split("\n")
    .map((l) => l.replace(/^\s*\/\*\*\s?|\s*\*\/\s*$|^\s*\*\s?/g, ""))
    .join("\n")
    .trim();
}

/** Collapses long string-literal unions (e.g. the 500+ icon names) so types stay readable. */
function collapseUnions(text: string): string {
  return text.replace(/(?:"[\w-]+" \| ){20,}"[\w-]+"/g, (union) => {
    const values = union.split(" | ");
    // Only the icon union should point at search_icons; `alert-circle` is an icon name no other union has.
    const hint = values.includes('"alert-circle"') ? "; use search_icons" : "";
    return `${values.slice(0, 3).join(" | ")} | /* …${values.length - 3} more${hint} */`;
  });
}

/** Top-level members of the object literals in a declaration (4-space indent). */
function extractProps(text: string): { props: string[]; deprecated: Record<string, string> } {
  const props = new Set<string>();
  const deprecated: Record<string, string> = {};
  let pendingDoc = "";
  let inDoc = false;

  for (const line of text.split("\n")) {
    // JSDoc on a member, single-line (`/** ... */`) or multi-line (`/**`, ` * ...`, ` */`).
    if (inDoc || /^ {4}\/\*\*/.test(line)) {
      pendingDoc += " " + line.replace(/\*\/\s*$/, "").replace(/^\s*\/?\*+/, "").trim();
      inDoc = !line.includes("*/");
      continue;
    }
    const member = /^ {4}(\w+)\??:/.exec(line);
    if (member) {
      props.add(member[1]);
      const dep = /@deprecated\s*(.*)/.exec(pendingDoc);
      if (dep) deprecated[member[1]] = dep[1].replace(/\s+/g, " ").trim() || "Deprecated.";
    }
    pendingDoc = "";
  }
  return { props: [...props], deprecated };
}

function classify(name: string): ExportKind | undefined {
  if (/^use[A-Z]/.test(name)) return "hook";
  if (/^[A-Z][a-z]/.test(name)) return "component";
  if (/^[a-z]/.test(name) && name !== "version") return "utility";
  return undefined; // constants like COREX_UI_VERSION
}

function buildIndex(): { exports: Map<string, CorexExport>; icons: string[] } {
  const source = readFileSync(join(packageDir, "dist", "index.d.ts"), "utf8");
  const statements = parseStatements(source);

  const exportList = /^export \{(.*)\};?\s*$/m.exec(source)?.[1] ?? "";
  const valueNames = exportList
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("type "));

  const exports = new Map<string, CorexExport>();
  for (const name of valueNames) {
    const kind = classify(name);
    const decl = statements.get(name);
    if (!kind || !decl) continue;

    const related = [decl];
    for (const suffix of ["PropsType", "ComponentType", "Result", "ResultType", "OptionsType"]) {
      const base = kind === "hook" ? name.replace(/^use/, "Use") : name;
      const stmt = statements.get(`${base}${suffix}`);
      if (stmt && !related.includes(stmt)) related.push(stmt);
    }
    // `declare const X: XComponentType` style compounds reference their type by name.
    const refType = /: (\w+ComponentType);/.exec(decl.text)?.[1];
    if (refType && statements.has(refType) && !related.includes(statements.get(refType)!)) {
      related.push(statements.get(refType)!);
    }

    const description =
      cleanJsdoc(decl.jsdoc) || cleanJsdoc(related.find((s) => s.jsdoc)?.jsdoc ?? "") || curated[name]?.description || "";

    const { props, deprecated } = kind === "component"
      ? related.reduce(
          (acc, s) => {
            const r = extractProps(s.text);
            r.props.forEach((p) => acc.props.add(p));
            Object.assign(acc.deprecated, r.deprecated);
            return acc;
          },
          { props: new Set<string>(), deprecated: {} as Record<string, string> },
        )
      : { props: new Set<string>(), deprecated: {} };

    exports.set(name, {
      name,
      kind,
      description,
      props: [...props].sort(),
      deprecatedProps: deprecated,
      types: related
        .map((s) => (s.jsdoc ? `${s.jsdoc}\n${s.text}` : s.text))
        .map(collapseUnions)
        .join("\n\n"),
    });
  }

  const iconUnion = /^ {4}icon\?: "" \| \(([^)]*)\)/m.exec(statements.get("Button")?.text ?? "")?.[1] ?? "";
  const icons = [...iconUnion.matchAll(/"([\w-]+)"/g)].map((m) => m[1]);

  return { exports, icons };
}

const index = buildIndex();

export const corexExports = [...index.exports.values()];
export const icons = index.icons;

/** Case-insensitive lookup; also resolves compound names like `Table.Row` -> `TableRow`. */
export function findExport(name: string): CorexExport | undefined {
  const key = name.replace(".", "").toLowerCase();
  return corexExports.find((e) => e.name.toLowerCase() === key);
}

export function importStatement(name: string): string {
  return `import { ${name} } from "${PACKAGE_NAME}";`;
}

/** Markdown reference for one export: shared by the get_component tool and component resources. */
export function renderExport(entry: CorexExport): string {
  const extra = curated[entry.name];
  const sections = [`# ${entry.name} (${entry.kind})`, entry.description, "```ts\n" + importStatement(entry.name) + "\n```"];

  if (extra?.notes?.length) sections.push("## Notes\n" + extra.notes.map((n) => `- ${n}`).join("\n"));
  const deprecated = Object.entries(entry.deprecatedProps);
  if (deprecated.length) {
    sections.push("## Deprecated props (legacy Polaris compatibility)\n" + deprecated.map(([p, note]) => `- \`${p}\`: ${note}`).join("\n"));
  }
  if (extra?.examples?.length) sections.push("## Examples\n" + extra.examples.map((e) => "```tsx\n" + e + "\n```").join("\n"));
  sections.push("## Type definitions\n```ts\n" + entry.types + "\n```");

  return sections.filter(Boolean).join("\n\n");
}
