import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Diretórios de frontend ativo varridos por padrão. */
const SCAN_DIRECTORIES = ["app", "components", "modules"];
const SCAN_EXTENSIONS = new Set([".tsx", ".ts", ".css"]);

/** Único arquivo autorizado a conter valores de cor brutos. */
const TOKEN_FILES = new Set(["app/globals.css"]);

const BASELINE_FILE = "scripts/visual-system-baseline.json";

/**
 * Roxo é bloqueio absoluto: nunca entra no baseline, nunca é tolerado,
 * em nenhum arquivo, incluindo o arquivo de tokens.
 */
const BANNED_COLOR_NAMES = /\b(purple|violet|indigo|fuchsia|lilac|lavender|roxo|violeta|lil[aá]s|azul-lil[aá]s)\b/i;

const RAW_COLOR_VALUE = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch)\s*\(/i;

/**
 * Um hex roxo dentro do arquivo de tokens escaparia do RAW_COLOR_VALUE, porque
 * ali valores brutos são permitidos. Este detector fecha a brecha: qualquer hex
 * cujo matiz caia na faixa violeta/roxo/magenta com saturação real é bloqueado.
 */
const HEX_LITERAL = /#([0-9a-f]{3}|[0-9a-f]{6})\b/gi;
/**
 * Limite inferior calibrado entre o azul oficial e o indigo: `action-accent`
 * #193cb8 fica em 227°, indigo-500 #6366f1 em 239° e indigo-900 #312e81 em 242°.
 * 234° separa os dois sem falso positivo na paleta aprovada.
 * Tints quase brancos (ex.: #eef2ff) não são classificáveis por matiz — esses
 * caem na regra de valor bruto, que já os bloqueia fora do arquivo de tokens.
 */
const PURPLE_HUE_RANGE = [234, 335];
const PURPLE_MIN_SATURATION = 0.18;

function hexHueAndSaturation(hex) {
  const full = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex;
  const r = Number.parseInt(full.slice(0, 2), 16) / 255;
  const g = Number.parseInt(full.slice(2, 4), 16) / 255;
  const b = Number.parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return { hue: 0, saturation: 0 };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = Math.round(hue * 60);
  return { hue: hue < 0 ? hue + 360 : hue, saturation };
}

export function isPurpleHex(hex) {
  const { hue, saturation } = hexHueAndSaturation(hex.replace("#", ""));
  return saturation >= PURPLE_MIN_SATURATION && hue >= PURPLE_HUE_RANGE[0] && hue <= PURPLE_HUE_RANGE[1];
}

const TAILWIND_HUES = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOR_UTILITIES = "bg|text|border|ring|outline|from|via|to|decoration|divide|accent|fill|stroke|shadow|caret|placeholder";

const TAILWIND_COLOR_CLASS = new RegExp(`\\b(?:${COLOR_UTILITIES})-(?:${TAILWIND_HUES}|white|black)(?:-[0-9]+)?(?:\\/[0-9]+)?\\b`, "i");

/** Tons válidos do Tailwind. Qualquer outro não gera CSS e some silenciosamente. */
const VALID_SHADES = new Set(["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"]);
const SHADED_COLOR_CLASS = new RegExp(`\\b(?:${COLOR_UTILITIES})-(?:${TAILWIND_HUES})-([0-9]+)\\b`, "gi");

/** Piso tipográfico absoluto da plataforma. */
const ARBITRARY_FONT_SIZE = /\btext-\[([0-9]+)px\]/g;
const MIN_FONT_SIZE_PX = 12;

/** Violações que o baseline pode tolerar enquanto a dívida é migrada. */
const BASELINEABLE = new Set(["raw-color-value", "non-semantic-color-class", "invalid-color-class", "sub-minimum-font-size"]);

export function findVisualViolations(source, { allowRawColors = false } = {}) {
  const violations = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const value = line.trim().slice(0, 240);

    if (BANNED_COLOR_NAMES.test(line)) violations.push({ line: lineNumber, kind: "banned-color-name", value });

    for (const match of line.matchAll(HEX_LITERAL)) {
      if (isPurpleHex(match[0])) violations.push({ line: lineNumber, kind: "banned-color-name", value: `${match[0]} é roxo/violeta — ${value}` });
    }

    if (!allowRawColors && RAW_COLOR_VALUE.test(line)) violations.push({ line: lineNumber, kind: "raw-color-value", value });
    if (TAILWIND_COLOR_CLASS.test(line)) violations.push({ line: lineNumber, kind: "non-semantic-color-class", value });

    for (const match of line.matchAll(SHADED_COLOR_CLASS)) {
      if (!VALID_SHADES.has(match[1])) violations.push({ line: lineNumber, kind: "invalid-color-class", value: `${match[0]} não existe no Tailwind e não gera CSS` });
    }

    for (const match of line.matchAll(ARBITRARY_FONT_SIZE)) {
      if (Number(match[1]) < MIN_FONT_SIZE_PX) violations.push({ line: lineNumber, kind: "sub-minimum-font-size", value: `${match[0]} abaixo do piso de ${MIN_FONT_SIZE_PX}px` });
    }
  });

  return violations;
}

function walk(directory) {
  const absolute = path.resolve(root, directory);
  if (!fs.existsSync(absolute)) return [];
  const found = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".next")) continue;
    const relative = path.join(directory, entry.name).split(path.sep).join("/");
    if (entry.isDirectory()) found.push(...walk(relative));
    else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) found.push(relative);
  }
  return found;
}

export function collectScanFiles() {
  return SCAN_DIRECTORIES.flatMap((directory) => walk(directory)).sort();
}

export function scanVisualFiles(files = collectScanFiles()) {
  return files.flatMap((file) => {
    const normalized = file.split(path.sep).join("/");
    const absolute = path.resolve(root, normalized);
    if (!fs.existsSync(absolute)) return [{ file: normalized, line: 0, kind: "missing-file", value: normalized }];
    const source = fs.readFileSync(absolute, "utf8");
    return findVisualViolations(source, { allowRawColors: TOKEN_FILES.has(normalized) }).map((violation) => ({ file: normalized, ...violation }));
  });
}

function readBaseline() {
  const absolute = path.resolve(root, BASELINE_FILE);
  if (!fs.existsSync(absolute)) return {};
  try {
    return JSON.parse(fs.readFileSync(absolute, "utf8")).files || {};
  } catch {
    return {};
  }
}

function countByFile(violations) {
  const counts = {};
  for (const violation of violations) counts[violation.file] = (counts[violation.file] || 0) + 1;
  return counts;
}

function writeBaseline(counts) {
  const payload = {
    comment: "Dívida visual tolerada por arquivo. Só pode diminuir. Roxo nunca entra aqui. Atualize com: node scripts/check-visual-system.mjs --update-baseline",
    minimumFontSizePx: MIN_FONT_SIZE_PX,
    files: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
  };
  fs.writeFileSync(path.resolve(root, BASELINE_FILE), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function main() {
  const argv = process.argv.slice(2);
  const filesIndex = argv.indexOf("--files");
  const explicitFiles = filesIndex === -1 ? null : argv.slice(filesIndex + 1).filter((value) => !value.startsWith("--"));
  const strict = argv.includes("--strict") || Boolean(explicitFiles?.length);
  const updateBaseline = argv.includes("--update-baseline");

  const files = explicitFiles?.length ? explicitFiles : collectScanFiles();
  const violations = scanVisualFiles(files);

  const banned = violations.filter((violation) => violation.kind === "banned-color-name");
  const debt = violations.filter((violation) => BASELINEABLE.has(violation.kind));
  const other = violations.filter((violation) => !BASELINEABLE.has(violation.kind) && violation.kind !== "banned-color-name");

  // Roxo é sempre fatal, em qualquer modo.
  if (banned.length) {
    console.error(`\nROXO PROIBIDO — ${banned.length} ocorrência(s). Regra 0 do sistema visual.\n`);
    for (const violation of banned) console.error(`  ${violation.file}:${violation.line} ${violation.value}`);
    console.error("\nConverter usando .agents/skills/app-visual-system/references/color-contract.md\n");
    process.exitCode = 1;
    return;
  }

  for (const violation of other) console.error(`${violation.file}:${violation.line} ${violation.kind}: ${violation.value}`);
  if (other.length) {
    process.exitCode = 1;
    return;
  }

  if (updateBaseline) {
    writeBaseline(countByFile(debt));
    console.log(`BASELINE ATUALIZADO — ${debt.length} item(ns) de dívida em ${Object.keys(countByFile(debt)).length} arquivo(s).`);
    return;
  }

  if (strict) {
    if (debt.length) {
      for (const violation of debt) console.error(`${violation.file}:${violation.line} ${violation.kind}: ${violation.value}`);
      console.error(`\nMODO ESTRITO — ${debt.length} violação(ões).`);
      process.exitCode = 1;
      return;
    }
    console.log(`VISUAL_SYSTEM_GUARD = PASS (estrito, ${files.length} arquivo(s), sem roxo, sem dívida)`);
    return;
  }

  const baseline = readBaseline();
  const current = countByFile(debt);
  const regressions = [];
  const improvements = [];

  for (const [file, count] of Object.entries(current)) {
    const allowed = baseline[file] ?? 0;
    if (count > allowed) regressions.push({ file, count, allowed });
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const count = current[file] ?? 0;
    if (count < allowed) improvements.push({ file, count, allowed });
  }

  if (regressions.length) {
    console.error("\nREGRESSÃO VISUAL — dívida aumentou nos arquivos abaixo:\n");
    for (const { file, count, allowed } of regressions) {
      console.error(`  ${file}: ${count} (baseline ${allowed})`);
      for (const violation of debt.filter((item) => item.file === file)) console.error(`    ${violation.line} ${violation.kind}: ${violation.value}`);
    }
    console.error("");
    process.exitCode = 1;
    return;
  }

  const total = debt.length;
  console.log(`VISUAL_SYSTEM_GUARD = PASS (${files.length} arquivo(s) varrido(s), 0 roxo, ${total} item(ns) de dívida dentro do baseline)`);
  if (improvements.length) {
    console.log(`\n${improvements.length} arquivo(s) melhoraram. Rode --update-baseline para travar o ganho:`);
    for (const { file, count, allowed } of improvements) console.log(`  ${file}: ${count} (baseline ${allowed})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
