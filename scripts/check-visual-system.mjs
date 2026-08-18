import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_FILES = [
  "components/global-topbar.tsx",
  "components/global-notice-center.tsx",
  "components/product-shell.tsx",
  "components/providers.tsx",
];

const BANNED_COLOR_NAMES = /\b(purple|violet|indigo|fuchsia|lilac|lavender|roxo|violeta|azul-lilás)\b/i;
const RAW_COLOR_VALUE = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/i;
const TAILWIND_COLOR_CLASS = /\b(?:bg|text|border|ring|outline|from|via|to|decoration|divide|accent|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-[0-9]+)?(?:\/[0-9]+)?\b/i;

export function findVisualViolations(source, { allowRawColors = false } = {}) {
  const violations = [];
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (BANNED_COLOR_NAMES.test(line)) violations.push({ line: lineNumber, kind: "banned-color-name", value: line.trim() });
    if (!allowRawColors && RAW_COLOR_VALUE.test(line)) violations.push({ line: lineNumber, kind: "raw-color-value", value: line.trim() });
    if (TAILWIND_COLOR_CLASS.test(line)) violations.push({ line: lineNumber, kind: "non-semantic-color-class", value: line.trim() });
  });
  return violations;
}

export function scanVisualFiles(files = DEFAULT_FILES) {
  return files.flatMap((file) => {
    const absolute = path.resolve(root, file);
    if (!fs.existsSync(absolute)) return [{ file, line: 0, kind: "missing-file", value: file }];
    const source = fs.readFileSync(absolute, "utf8");
    return findVisualViolations(source).map((violation) => ({ file, ...violation }));
  });
}

function parseFiles(argv) {
  const filesIndex = argv.indexOf("--files");
  return filesIndex === -1 ? DEFAULT_FILES : argv.slice(filesIndex + 1).filter(Boolean);
}

function main() {
  const violations = scanVisualFiles(parseFiles(process.argv.slice(2)));
  if (violations.length) {
    for (const violation of violations) console.error(`${violation.file}:${violation.line} ${violation.kind}: ${violation.value}`);
    process.exitCode = 1;
    return;
  }
  console.log(`VISUAL_SYSTEM_GUARD = PASS (${parseFiles(process.argv.slice(2)).length} files)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
