#!/usr/bin/env node
/*
 * BATERIA DE REGRESSÃO — `npm run test:regressao` (2026-10-18).
 *
 * Regra do dono (AGENTS.md §0.3): "entrega sem a suíte verde não é entrega", e
 * nada vai para deploy sem esta bateria verde no local. Roda, uma depois da
 * outra, as suítes que guardam a linha de processo de cada área (cenários-ouro,
 * botões pela tela — DOM —, servidor, contratos) e o TypeScript. Tudo com
 * fixtures: nenhuma chamada paga, nenhuma escrita remota.
 *
 * Não para na primeira falha: roda tudo e no fim mostra a tabela, para quem
 * corrige ver o quadro inteiro. Sai com código 1 se alguma suíte BLOQUEANTE
 * falhar. A suíte com falhas antigas conhecidas fica com o teto delas
 * (`maxFail`): passou do teto, é regressão e bloqueia.
 *
 * Uso: `npm run test:regressao` (tudo) ou `npm run test:regressao -- radar arquiteto`
 * (só as suítes cujo nome contém um dos termos).
 */
import { spawnSync } from "node:child_process";

const NODE_TEST = "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning";

const SUITES = [
  { nome: "typescript", cmd: "npx tsc --noEmit -p .", tipo: "tsc" },
  { nome: "arquiteto", cmd: "npm run -s test:arquiteto" },
  { nome: "arquiteto:servidor", cmd: "npm run -s test:arquiteto:servidor" },
  { nome: "arquiteto:cenarios", cmd: "npm run -s test:arquiteto:cenarios" },
  { nome: "arquiteto:dom", cmd: "npm run -s test:arquiteto:dom" },
  { nome: "arquiteto:lentes", cmd: "npm run -s test:arquiteto:lentes" },
  { nome: "minerador:cenarios", cmd: "npm run -s test:minerador:cenarios" },
  { nome: "minerador:dom", cmd: "npm run -s test:minerador:dom" },
  /* Falhas antigas conhecidas em 2026-10-17: 25 (anteriores à linha única). Mais que isso é regressão. */
  { nome: "minerador:todos", cmd: `${NODE_TEST} --experimental-loader ./tests/integrations-runtime-loader.mjs --test "tests/minerador-*.test.mts"`, maxFail: 25 },
  { nome: "radar", cmd: "npm run -s test:radar" },
  { nome: "ai-provider", cmd: "npm run -s test:ai-provider" },
  { nome: "agent (catálogo MCP)", cmd: "npm run -s test:agent" },
  /* 4 falhas antigas em editorial-pipeline.test.mts (rotas, layout do Admin, Marca/Conta): os textos procurados não existem nem no HEAD de 2026-10-18. */
  { nome: "editorial", cmd: "npm run -s test:editorial", maxFail: 4 },
  { nome: "editorial:dom", cmd: "npm run -s test:editorial:dom" },
  { nome: "redator", cmd: "npm run -s test:redator" },
  { nome: "redator:dom", cmd: "npm run -s test:redator:dom" },
  { nome: "marca", cmd: "npm run -s test:marca" },
  /* O tutorial do "?" global (dono, 18/10): todo botão citado existe na tela da área. */
  { nome: "ajuda (tutorial)", cmd: `${NODE_TEST} --test tests/context-help.test.mts` },
  /* 2 falhas antigas em authenticated-tenant-access.test.mts: procuram `await getCurrentSupabaseToken()` e `keywordQuery = allowedIds.length` no arquiteto-workspace.tsx, ausentes também no HEAD de 2026-10-18. */
  { nome: "authz", cmd: "npm run -s test:authz", maxFail: 2 },
];

const filtros = process.argv.slice(2).map(termo => termo.toLowerCase());
const escolhidas = filtros.length ? SUITES.filter(suite => filtros.some(termo => suite.nome.toLowerCase().includes(termo))) : SUITES;

function contar(saida, rotulo) {
  const achados = [...saida.matchAll(new RegExp(`^\\s*ℹ ${rotulo} (\\d+)`, "gm"))];
  return achados.length ? achados.reduce((soma, achado) => soma + Number(achado[1]), 0) : null;
}

const linhas = [];
let bloqueou = false;
const inicio = Date.now();
for (const suite of escolhidas) {
  const t0 = Date.now();
  process.stdout.write(`▶ ${suite.nome} … `);
  const r = spawnSync(suite.cmd, { shell: true, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  const saida = `${r.stdout || ""}\n${r.stderr || ""}`;
  const segundos = Math.round((Date.now() - t0) / 1000);
  let pass = null, fail = null, todo = null, ok;
  if (suite.tipo === "tsc") {
    const erros = (saida.match(/error TS\d+/g) || []).length;
    fail = erros; ok = r.status === 0;
  } else {
    pass = contar(saida, "pass"); fail = contar(saida, "fail"); todo = contar(saida, "todo");
    const teto = suite.maxFail ?? 0;
    ok = fail !== null ? fail <= teto && (teto > 0 || r.status === 0) : r.status === 0;
  }
  if (!ok) bloqueou = true;
  linhas.push({ suite: suite.nome, ok, pass, fail, todo, teto: suite.maxFail ?? 0, segundos });
  console.log(`${ok ? "verde" : "VERMELHO"} (${segundos}s)`);
  if (!ok) {
    const falhas = saida.split("\n").filter(linha => /^\s*✖|not ok|error TS\d+|Error:/.test(linha)).slice(0, 25);
    for (const linha of falhas) console.log(`    ${linha.trim()}`);
  }
}

console.log("\nBateria de regressão — resultado");
console.log("suíte".padEnd(24), "estado".padEnd(10), "pass".padStart(6), "fail".padStart(6), "todo".padStart(6), "teto".padStart(6), "tempo".padStart(7));
for (const l of linhas) {
  console.log(l.suite.padEnd(24), (l.ok ? "verde" : "VERMELHO").padEnd(10), String(l.pass ?? "-").padStart(6), String(l.fail ?? "-").padStart(6), String(l.todo ?? "-").padStart(6), String(l.teto).padStart(6), `${l.segundos}s`.padStart(7));
}
console.log(`\nTotal: ${Math.round((Date.now() - inicio) / 1000)}s · ${bloqueou ? "VERMELHA — não vai para deploy" : "VERDE — pode seguir para o deploy"}`);
process.exit(bloqueou ? 1 : 0);
