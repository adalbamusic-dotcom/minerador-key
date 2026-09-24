import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { createMockPlanAndDocument } from "../lib/editorial/providers.ts";
import { runGuardian } from "../lib/redator/guardian.ts";
import {
  WRITER_GUARDIAN_SUBJECT_NOT_READ_NOTICE,
  writerGuardianApprovalBlockingCount,
  writerGuardianNoticeText,
  writerGuardianPanelSummary,
} from "../lib/redator/guardian-panel-summary.ts";
import { findVisualViolations } from "../scripts/check-visual-system.mjs";

/*
 * ===== O guardião no painel de quem redige =====
 *
 * 1. Com o relatório do servidor, as contagens e o rótulo vêm DELE, não da
 *    prévia local (que não lê o Assunto nem as divergências).
 * 2. Os avisos do servidor (o que ele não conseguiu conferir) aparecem em
 *    frase para gente; o código técnico sai.
 * 3. Sem relatório do servidor, o resumo é o de antes: "Prévia local" e as
 *    contagens locais, sem aviso.
 * 4. As linhas alteradas no painel ficam em 14px e tokens, e a dívida visual
 *    do arquivo não cresce: o teto é o valor medido depois desta mudança
 *    (41 itens; o HEAD tinha 43).
 * 5. A aprovação pelo painel é barrada pelo mesmo número de bloqueios que o
 *    resumo mostra: o maior entre a prévia local e o servidor.
 */

const fonte = (relativo: string) => readFileSync(new URL(relativo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const AVISO_DO_SERVIDOR = "assunto_nao_lido (PGRST301): o Assunto do ArticleDNA não pôde ser lido agora; o Guardião não conferiu a virada nem o link para o destino.";

test("resumo: sem relatório do servidor, é a prévia local de antes", () => {
  assert.deepEqual(writerGuardianPanelSummary(null, { blockingCount: 2, warningCount: 3 }), {
    source: "local", label: "Prévia local", blockingCount: 2, warningCount: 3, notices: [],
  });
  assert.deepEqual(writerGuardianPanelSummary(null, null), {
    source: "local", label: "Prévia local", blockingCount: 0, warningCount: 0, notices: [],
  });
});

test("resumo: com relatório do servidor, as contagens são as dele, não as da prévia", () => {
  const resumo = writerGuardianPanelSummary(
    { blockingCount: 1, warningCount: 4, notices: [AVISO_DO_SERVIDOR, "  "] },
    { blockingCount: 0, warningCount: 0 },
  );
  assert.equal(resumo.source, "server");
  assert.equal(resumo.label, "Análise atual");
  assert.equal(resumo.blockingCount, 1);
  assert.equal(resumo.warningCount, 4);
  assert.deepEqual(resumo.notices, [{ text: WRITER_GUARDIAN_SUBJECT_NOT_READ_NOTICE, raw: AVISO_DO_SERVIDOR }]);
  assert.deepEqual(writerGuardianPanelSummary({ blockingCount: 0, warningCount: 0 }, { blockingCount: 5, warningCount: 5 }).notices, []);
});

test("avisos: o código técnico sai, a frase fica legível", () => {
  assert.equal(writerGuardianNoticeText(AVISO_DO_SERVIDOR), "Não foi possível ler o Assunto; a virada e o link para o destino não foram conferidos.");
  assert.equal(
    writerGuardianNoticeText("migration_pendente: as divergências registradas não foram lidas; o Guardião emitiu só as análises determinísticas."),
    "As divergências registradas não foram lidas; o Guardião emitiu só as análises determinísticas.",
  );
  assert.equal(
    writerGuardianNoticeText("divergencias_nao_lidas (42P01): as divergências registradas não puderam ser lidas agora; o Guardião emitiu só as análises determinísticas."),
    "As divergências registradas não puderam ser lidas agora; o Guardião emitiu só as análises determinísticas.",
  );
  assert.equal(
    writerGuardianNoticeText("Mais de 50 divergências abertas: só as 50 mais recentes entraram na análise."),
    "Mais de 50 divergências abertas: só as 50 mais recentes entraram na análise.",
  );
  for (const aviso of [AVISO_DO_SERVIDOR, "migration_pendente: x"]) assert.equal(/^[a-z_]+[ :(]/.test(writerGuardianNoticeText(aviso)), false);
});

test("com o guardião real: o Assunto não escrito vira aviso do servidor, e o resumo conta esse aviso", async () => {
  const { document } = await createMockPlanAndDocument("brand-1");
  const local = runGuardian(document, "local");
  const servidor = runGuardian(document, "hash-servidor", {
    subject: { phrase: "gestão de clínicas veterinárias independentes", destinationUrl: "https://exemplo.test/destino" },
  });
  assert.ok(servidor.warningCount > local.warningCount, "a prévia local não enxerga a virada");
  const resumo = writerGuardianPanelSummary(servidor, local);
  assert.equal(resumo.warningCount, servidor.warningCount);
  assert.equal(resumo.blockingCount, servidor.blockingCount);

  const semLeitura = runGuardian(document, "hash-servidor", { notices: [AVISO_DO_SERVIDOR] });
  assert.deepEqual(writerGuardianPanelSummary(semLeitura, local).notices.map(n => n.text), [WRITER_GUARDIAN_SUBJECT_NOT_READ_NOTICE]);
  assert.deepEqual(writerGuardianPanelSummary(null, local), {
    source: "local", label: "Prévia local", blockingCount: local.blockingCount, warningCount: local.warningCount, notices: [],
  });
});

test("painel: o resumo lê o relatório do servidor e mostra os avisos em 14px e tokens", () => {
  const painel = fonte("../components/editorial/professional-writer.tsx");
  const codigo = semComentarios(painel);
  assert.match(codigo, /import \{ writerGuardianApprovalBlockingCount, writerGuardianPanelSummary \} from "@\/lib\/redator\/guardian-panel-summary";/);
  assert.match(codigo, /const guardianSummary = writerGuardianPanelSummary\(guardianReport, localGuardian\);/);
  const inicio = codigo.indexOf('<div className="mt-3 rounded border border-divider p-2 text-sm" data-testid="writer-guardian-summary">');
  assert.ok(inicio > 0, "o bloco do resumo existe");
  const bloco = codigo.slice(inicio, codigo.indexOf("A análise não aprova o documento.</p></div>", inicio));
  assert.match(bloco, /\{guardianSummary\.label\}/);
  assert.match(bloco, /\{guardianSummary\.blockingCount\} bloqueio\(s\) · \{guardianSummary\.warningCount\} aviso\(s\)/);
  assert.match(bloco, /guardianSummary\.notices\.map\(/);
  assert.match(bloco, /\{notice\.text\}/);
  assert.equal(bloco.includes("localGuardian"), false, "o resumo não lê a prévia local direto");
  assert.equal(/text-xs|text-\[\d+px\]/.test(bloco), false, "nada abaixo de 14px no bloco");
  assert.deepEqual(findVisualViolations(bloco), [], "o bloco usa só tokens");
  assert.equal(/Análise atual|Prévia local/.test(codigo), false, "o rótulo vem do resumo");
});

test("painel: a dívida visual do arquivo não cresce além do valor medido", () => {
  const atual = findVisualViolations(fonte("../components/editorial/professional-writer.tsx")).length;
  assert.ok(atual <= 41, `dívida de professional-writer.tsx: ${atual} (teto 41; HEAD 43)`);
});

test("aprovação: bloqueio visto só pelo servidor também barra; sem servidor, o número é o local de antes", () => {
  const local = { blockingCount: 0, warningCount: 1 };
  assert.equal(writerGuardianApprovalBlockingCount(writerGuardianPanelSummary(null, local), local), 0);
  const localComBloqueio = { blockingCount: 2, warningCount: 0 };
  assert.equal(writerGuardianApprovalBlockingCount(writerGuardianPanelSummary(null, localComBloqueio), localComBloqueio), 2);
  const servidor = { blockingCount: 1, warningCount: 1, notices: [] };
  assert.equal(writerGuardianApprovalBlockingCount(writerGuardianPanelSummary(servidor, local), local), 1, "divergência bloqueante do servidor");
  const localComTres = { blockingCount: 3, warningCount: 0 };
  assert.equal(writerGuardianApprovalBlockingCount(writerGuardianPanelSummary({ blockingCount: 0, warningCount: 0 }, localComTres), localComTres), 3, "a prévia local continua barrando");
  assert.equal(writerGuardianApprovalBlockingCount(writerGuardianPanelSummary(null, null), null), 0);

  const codigo = semComentarios(fonte("../components/editorial/professional-writer.tsx"));
  const inicio = codigo.indexOf("const requestStatus = ");
  assert.ok(inicio > 0);
  const aprovacao = codigo.slice(inicio, codigo.indexOf("history.capture(", inicio));
  assert.match(aprovacao, /const bloqueios = writerGuardianApprovalBlockingCount\(guardianSummary, localGuardian\);/);
  assert.match(aprovacao, /status === "aprovado" && bloqueios\)/);
  assert.match(aprovacao, /Aprovação bloqueada: \$\{bloqueios\} achado\(s\) crítico\(s\) no Guardião\./);
  assert.equal(aprovacao.includes("localGuardian?.blockingCount"), false, "o bloqueio não lê só a prévia local");
});

test("guard visual estrito no helper novo", () => {
  assert.deepEqual(findVisualViolations(fonte("../lib/redator/guardian-panel-summary.ts")), []);
});
