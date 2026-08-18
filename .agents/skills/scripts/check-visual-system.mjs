import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

const SEARCH_DIRECTORIES = ["src", "app", "pages", "components"].map((directory) =>
  path.join(ROOT, directory),
);

const ALLOWED_COLOR_FILES = new Set([
  path.normalize(path.join(ROOT, "src/styles/tokens.css")),
  path.normalize(path.join(ROOT, "src/styles/globals.css")),
]);

const SUPPORTED_EXTENSIONS = new Set([
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".vue",
  ".svelte",
]);

const colorPatterns = [
  {
    name: "hexadecimal color",
    regex: /#[0-9a-fA-F]{3,8}\b/g,
  },
  {
    name: "rgb color",
    regex: /\brgba?\s*\([^)]*\)/g,
  },
  {
    name: "hsl color",
    regex: /\bhsla?\s*\([^)]*\)/g,
  },
  {
    name: "oklch color",
    regex: /\boklch\s*\([^)]*\)/g,
  },
];

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(directory) {
  if (!(await exists(directory))) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === "dist" ||
      entry.name === "build"
    ) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function getLineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

const files = [
  ...new Set(
    (
      await Promise.all(
        SEARCH_DIRECTORIES.map((directory) => collectFiles(directory)),
      )
    ).flat(),
  ),
];

const violations = [];

for (const filePath of files) {
  const normalizedPath = path.normalize(filePath);

  if (ALLOWED_COLOR_FILES.has(normalizedPath)) {
    continue;
  }

  const content = await readFile(filePath, "utf8");

  for (const pattern of colorPatterns) {
    for (const match of content.matchAll(pattern.regex)) {
      violations.push({
        file: path.relative(ROOT, filePath),
        line: getLineNumber(content, match.index ?? 0),
        type: pattern.name,
        value: match[0],
      });
    }
  }
}

if (violations.length > 0) {
  console.error("\nVisual-system violations found:\n");

  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line} — ${violation.type}: ${violation.value}`,
    );
  }

  console.error(
    "\nUse semantic design tokens instead of hardcoded colors.\n",
  );

  process.exit(1);
}

console.log("Visual-system check passed.");