/**
 * ===== REPARO PONTUAL DO ARTIGO (`ARTICLE_REPAIR_1`) =====
 *
 * SDD: `docs/04-arquiteto/sdd-reparo-pontual-do-artigo-2026-10-01.md`.
 *
 * O que estes testes guardam não é o botão: é a CLASSIFICAÇÃO. Um reparo que
 * trate "o registro se perdeu" e "ninguém decidiu" como a mesma coisa vira
 * carimbo, e o portão deixa de significar algo.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { RADAR_GATE_CODES, type RadarEligibility, type RadarGateCode } from "../lib/arquiteto/radar-handoff-gate.ts";
import type { ArticleFormationMarkerPayload } from "../lib/arquiteto/article-formation-marker.ts";
import {
  appendConcludedFormation, buildArticleRepairPlan, classificaBloqueio, concludedFormationForRepair, markerCovers,
  type ArticleRepairFacts, type ConcludedFormation,
} from "../lib/arquiteto/article-repair.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const MODULO = "../lib/arquiteto/article-repair.ts";
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ============================== fixtures ============================== */

/** Um veredito do portão onde só os códigos informados reprovaram. */
const eligibility = (reprovados: RadarGateCode[]): RadarEligibility => ({
  articleId: "art-1",
  label: "como captar clientes para clínica de estética",
  eligible: reprovados.length === 0,
  checks: RADAR_GATE_CODES.map(code => ({
    code, ok: !reprovados.includes(code), detail: `motivo de ${code}`,
  })),
  blockers: reprovados.map(code => `motivo de ${code}`),
});

const facts = (reprovados: RadarGateCode[], extra: Partial<ArticleRepairFacts> = {}): ArticleRepairFacts => ({
  article: {
    articleId: "art-1", label: "L",
    articleDnaVersionId: "ver-1", belongsToCurrentScenario: true, readbackConfirmed: true,
  },
  eligibility: eligibility(reprovados),
  parecer: null,
  constaNoMarcador: true,
  formacaoDecididaForaDoMarcador: false,
  ...extra,
});

const parecerAberto = { candidateRef: "cand-1", assessmentId: "assess-1", formationBaseHash: "serpbase:aa", resolvido: false };

const conclusao = (over: Partial<ConcludedFormation> = {}): ConcludedFormation => ({
  candidateRef: "article-formation:c1", territoryRef: "territory:t1",
  principalKeywordId: "kw-1", members: [{ keywordId: "kw-1", role: "principal" }],
  formationBaseHash: "serpbase:aa", slug: "s", fullPath: "https://x/s",
  concludedAt: "2026-10-01T00:00:00.000Z", concludedBy: "user-1",
  materializedArticleId: "art-1", ...over,
});

const marcador = (formacoes: ConcludedFormation[]): ArticleFormationMarkerPayload => ({
  contractVersion: "article-formation-marker-v1",
  baseHash: "base-1",
  processedAt: "2026-09-30T00:00:00.000Z",
  confirmation: {
    status: "partial", confirmedAt: "2026-09-30T00:00:00.000Z",
    confirmedArticleCount: formacoes.length, coveredKeywordCount: 0,
    pendingSiloCount: 0, failedCount: 0,
  },
  concludedFormations: formacoes,
});

const passo = (plano: ReturnType<typeof buildArticleRepairPlan>, code: RadarGateCode) =>
  plano.bloqueios.find(item => item.code === code);

/* ======================= COMPORTAMENTAL ======================= */

test("01 · artigo íntegro não oferece reparo — e é assim que a idempotência acontece", () => {
  const plano = buildArticleRepairPlan(facts([]));
  assert.equal(plano.saudavel, true);
  assert.deepEqual(plano.bloqueios, []);

  /*
   * Não existe controle de "já rodou": o passo some porque a invariante passou
   * a valer. Reparar duas vezes é impossível, não é bloqueado.
   */
  const depoisDoReparo = buildArticleRepairPlan(facts([], { constaNoMarcador: true }));
  assert.equal(depoisDoReparo.saudavel, true);
});

test("02 · o caso real: decisão tomada, registro perdido → REEXECUTÁVEL", () => {
  /*
   * 01/10: ArticleDNA aprovado, decisão humana na keyword desde 28/09, e o
   * marcador sem a entrada. Ninguém precisa decidir nada de novo.
   */
  const plano = buildArticleRepairPlan(facts(["SERP_RESOLVED"], {
    constaNoMarcador: false,
    formacaoDecididaForaDoMarcador: true,
    parecer: parecerAberto,
  }));
  const serp = passo(plano, "SERP_RESOLVED")!;

  assert.equal(serp.classe, "reexecutavel");
  assert.equal(serp.disponivel, true);
  assert.match(serp.acao!, /marcador de formação/);
  /* O motivo continua sendo o do portão — não reescrevemos a recusa. */
  assert.equal(serp.motivo, "motivo de SERP_RESOLVED");
});

test("03 · restaurar vence perguntar", () => {
  /*
   * No caso real as DUAS condições valiam: parecer em aberto E marcador sem a
   * entrada. Pedir decisão nova faria a pessoa decidir duas vezes a mesma
   * coisa — e a segunda resposta poderia divergir da que o artigo já carrega.
   */
  const comAmbos = classificaBloqueio("SERP_RESOLVED", facts(["SERP_RESOLVED"], {
    constaNoMarcador: false, formacaoDecididaForaDoMarcador: true, parecer: parecerAberto,
  }));
  assert.equal(comAmbos.classe, "reexecutavel");

  /* Sem decisão prévia em lugar nenhum, aí sim é pergunta. */
  const soParecer = classificaBloqueio("SERP_RESOLVED", facts(["SERP_RESOLVED"], {
    constaNoMarcador: false, formacaoDecididaForaDoMarcador: false, parecer: parecerAberto,
  }));
  assert.equal(soParecer.classe, "decisao_humana");
  assert.match(soParecer.acao!, /decisão editorial/);
});

test("04 · parecer já resolvido e marcador em dia: o bloqueio vem de outro lugar", () => {
  const fora = classificaBloqueio("SERP_RESOLVED", facts(["SERP_RESOLVED"], {
    constaNoMarcador: true, formacaoDecididaForaDoMarcador: false,
    parecer: { ...parecerAberto, resolvido: true },
  }));
  /* Apontar um reparo sem saber qual seria inventar. */
  assert.equal(fora.classe, "outra_fase");
  assert.equal(fora.acao, null);
  assert.ok(fora.onde);
});

test("05 · ARTICLE_DNA_CURRENT falha por três motivos, com três classes", () => {
  const semDna = classificaBloqueio("ARTICLE_DNA_CURRENT", facts(["ARTICLE_DNA_CURRENT"], {
    article: { articleId: "a", label: "L", articleDnaVersionId: null, belongsToCurrentScenario: true, readbackConfirmed: true },
  }));
  assert.equal(semDna.classe, "composicao", "sem artigo não há o que reparar");
  assert.equal(semDna.acao, null);

  const acervo = classificaBloqueio("ARTICLE_DNA_CURRENT", facts(["ARTICLE_DNA_CURRENT"], {
    article: { articleId: "a", label: "L", articleDnaVersionId: "v", belongsToCurrentScenario: false, readbackConfirmed: true },
  }));
  assert.equal(acervo.classe, "outra_fase", "acervo não se conserta; materializa-se de novo");

  const semReadback = classificaBloqueio("ARTICLE_DNA_CURRENT", facts(["ARTICLE_DNA_CURRENT"], {
    article: { articleId: "a", label: "L", articleDnaVersionId: "v", belongsToCurrentScenario: true, readbackConfirmed: false },
  }));
  assert.equal(semReadback.classe, "reexecutavel", "readback não confirmado é rastro perdido");
  /*
   * Rastro perdido de verdade — e mesmo assim sem botão nesta entrega, que
   * implementa o marcador e o parecer. Botão que não faz nada é pior que
   * nenhum: a classe diz o que é, o `onde` diz onde se resolve hoje.
   */
  assert.equal(semReadback.acao, null);
  assert.match(semReadback.onde!, /aba Artigos/);
});

test("06 · SERP não executada ou desatualizada é custo de provider, fora desta entrega", () => {
  for (const code of ["SERP_EXECUTED", "SERP_CURRENT"] as RadarGateCode[]) {
    const plano = buildArticleRepairPlan(facts([code]));
    const item = passo(plano, code)!;
    assert.equal(item.classe, "custo_de_provider", code);
    assert.equal(item.disponivel, false, `${code} não pode ser reparado nesta entrega`);
    assert.match(item.onde!, /Processar artigos/);
    /* E o custo não é escondido: o texto diz que o cache vem primeiro. */
    assert.match(item.onde!, /cache primeiro/);
  }
});

test("07 · composição nunca é automática", () => {
  for (const code of ["ARTICLE_PARENT_EXPLICIT", "PRINCIPAL_DEFINED", "COMPOSITION_VALID",
    "MAX_KEYWORDS_RESPECTED", "SLUG_STATE_VALID"] as RadarGateCode[]) {
    const item = passo(buildArticleRepairPlan(facts([code])), code)!;
    assert.equal(item.classe, "composicao", code);
    assert.equal(item.disponivel, false, `${code} é o conteúdo da decisão, não o registro dela`);
    assert.equal(item.acao, null, code);
  }
});

test("08 · o que pertence a outra fase aponta onde, e não repara", () => {
  for (const code of ["CANONICAL_SILO_BINDING", "INTERNAL_LINK_GRAPH_APPROVED", "NO_CROSS_SILO"] as RadarGateCode[]) {
    const item = passo(buildArticleRepairPlan(facts([code])), code)!;
    assert.equal(item.classe, "outra_fase", code);
    assert.equal(item.disponivel, false, code);
    assert.ok(item.onde, `${code} precisa dizer onde se resolve`);
  }
});

test("09 · nenhum passo é disponível sem ação declarada", () => {
  /* Varre os doze: disponível implica ter o que fazer. */
  for (const code of RADAR_GATE_CODES) {
    for (const variante of [
      facts([code]),
      facts([code], { constaNoMarcador: false, formacaoDecididaForaDoMarcador: true, parecer: parecerAberto }),
      facts([code], { parecer: parecerAberto }),
    ]) {
      const item = passo(buildArticleRepairPlan(variante), code)!;
      if (item.disponivel) assert.ok(item.acao, `${code} disponível precisa de ação`);
      if (!item.acao) assert.equal(item.disponivel, false, `${code} sem ação não pode ser disponível`);
    }
  }
});

test("10 · só as duas classes autorizadas ficam disponíveis", () => {
  /*
   * O escopo autorizado foi reexecutável + decisão humana. Se alguém promover
   * `custo_de_provider` a disponível sem a segunda entrega, isto reprova.
   */
  const todos = RADAR_GATE_CODES.flatMap(code => buildArticleRepairPlan(
    facts([code], { constaNoMarcador: false, formacaoDecididaForaDoMarcador: true, parecer: parecerAberto }),
  ).bloqueios);
  for (const item of todos.filter(x => x.disponivel)) {
    assert.ok(["reexecutavel", "decisao_humana"].includes(item.classe), `${item.code}: ${item.classe}`);
  }
});

test("11 · o marcador deduplica e as contagens saem da lista final", () => {
  const antiga = conclusao({ candidateRef: "article-formation:velha", materializedArticleId: "art-1" });
  const outra = conclusao({ candidateRef: "article-formation:outra", materializedArticleId: "art-9", principalKeywordId: "kw-9", members: [{ keywordId: "kw-9", role: "principal" }] });
  const nova = conclusao({ candidateRef: "article-formation:nova", materializedArticleId: "art-1", members: [{ keywordId: "kw-1", role: "principal" }, { keywordId: "kw-2", role: "secundaria" }] });

  const resultado = appendConcludedFormation(marcador([antiga, outra]), nova, "2026-10-01T10:00:00.000Z");

  /* A entrada do MESMO artigo saiu; a de outro artigo ficou. */
  assert.deepEqual(resultado.concludedFormations.map(item => item.candidateRef),
    ["article-formation:outra", "article-formation:nova"]);
  assert.equal(resultado.confirmation.confirmedArticleCount, 2);
  assert.equal(resultado.confirmation.coveredKeywordCount, 3, "kw-9, kw-1 e kw-2");
  assert.equal(resultado.confirmation.confirmedAt, "2026-10-01T10:00:00.000Z");
  /* O que não é desta operação passa intacto. */
  assert.equal(resultado.baseHash, "base-1");
  assert.equal(resultado.confirmation.pendingSiloCount, 0);
});

test("12 · gravar o mesmo reparo duas vezes devolve o mesmo marcador", () => {
  const nova = conclusao();
  const uma = appendConcludedFormation(marcador([]), nova, "2026-10-01T10:00:00.000Z");
  const duas = appendConcludedFormation(uma, nova, "2026-10-01T10:00:00.000Z");
  assert.deepEqual(duas, uma, "as contagens vêm da lista, não de um incremento");
});

test("13 · markerCovers é a mesma pergunta que o portão faz", () => {
  const m = marcador([conclusao({ candidateRef: "article-formation:c1", materializedArticleId: "art-1" })]);
  assert.equal(markerCovers(m, { candidateRef: "article-formation:c1", articleId: "outro" }), true);
  assert.equal(markerCovers(m, { candidateRef: null, articleId: "art-1" }), true);
  assert.equal(markerCovers(m, { candidateRef: "nenhum", articleId: "outro" }), false);
  assert.equal(markerCovers(null, { candidateRef: "article-formation:c1", articleId: "art-1" }), false);
});

test("15 · a entrada de conclusão sai completa, ou não sai", () => {
  const base = {
    candidateRef: "article-formation:c1", territoryRef: "territory:t1", principalKeywordId: "kw-1",
    secondaryKeywordIds: ["kw-2"], narrativeReinforcementIds: ["kw-3"],
    formationBaseHash: "serpbase:aa", slug: "s", fullPath: "https://x/s",
    materializedArticleId: "art-1", agora: "2026-10-01T10:00:00.000Z", ator: "user-1",
  };

  const entrada = concludedFormationForRepair(base)!;
  assert.deepEqual(entrada.members, [
    { keywordId: "kw-1", role: "principal" },
    { keywordId: "kw-2", role: "secundaria" },
    { keywordId: "kw-3", role: "reforco" },
  ]);
  assert.equal(entrada.materializedArticleId, "art-1");
  assert.equal(entrada.concludedBy, "user-1");

  /*
   * ESTA é a guarda principal: faltando qualquer campo obrigatório, não se
   * grava uma formação parcial. Preencher buraco com valor inventado faria o
   * marcador deixar de ser prova de coisa alguma.
   */
  for (const faltando of ["candidateRef", "territoryRef", "principalKeywordId", "formationBaseHash", "ator"] as const) {
    assert.equal(concludedFormationForRepair({ ...base, [faltando]: faltando === "ator" ? "" : null }), null, faltando);
  }

  /* Slug e caminho podem faltar: o contrato os aceita nulos. */
  assert.ok(concludedFormationForRepair({ ...base, slug: null, fullPath: null }));
  /* Artigo sem secundárias nem reforços tem um membro só. */
  assert.equal(concludedFormationForRepair({ ...base, secondaryKeywordIds: [], narrativeReinforcementIds: [] })!.members.length, 1);
});

/* ======================= ESTRUTURAL ======================= */

test("14 · ESTRUTURAL · o módulo é puro e não cria autoridade de escrita", async () => {
  const src = semComentarios(await fonte(MODULO));

  for (const proibido of ["fetch(", "supabase", "getOperationalClient", "server-only", "useState", "useMemo"]) {
    assert.ok(!src.includes(proibido), `o módulo puro não pode conter ${proibido}`);
  }
  /* Ele classifica o que o portão já avaliou; não reimplementa as checagens. */
  assert.match(src, /facts\.eligibility\.checks/);
  assert.doesNotMatch(src, /resolveRadarEligibility\(/, "não reavalia o portão");
});
