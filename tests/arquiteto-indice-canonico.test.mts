import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateReadyForRadarClaims, type CanonicalApprovalIndex } from "../lib/arquiteto/operational-status.ts";

/**
 * O ÍNDICE CANÔNICO DO SERVIDOR — UMA DEFINIÇÃO DE "APROVADO", NÃO DUAS.
 *
 * A homologação recusou os CINCO artigos da Care Glow com a mesma tríade:
 * ArticleDNA, SiloDNA e SiloPage "não aprovados e vigentes". Três tipos
 * falhando em bloco não é problema de artefato — é o índice.
 *
 * Causa: `buildCanonicalIndex` derivava o status apenas de
 * `editorial_version_status_events`, enquanto o writer do Arquiteto grava o
 * status NA LINHA de `editorial_artifact_versions` e nunca emite evento. O
 * loader canônico — o que a mesa mostra — lê `row.status`. Duas autoridades
 * para a mesma pergunta, e a do portão via `null` em tudo.
 */

const indice = readFileSync("lib/server/global-workflow-canonical.ts", "utf8");
const rota = readFileSync("app/api/arquiteto/workflow-status/route.ts", "utf8");

/* ============ a causa raiz não pode voltar ============================= */

test("o índice lê o status da LINHA da versão, como o loader canônico", () => {
  assert.match(indice, /\.select\("version_id,entity_id,artifact_type,version_number,status,payload"\)/);
  assert.match(indice, /effectiveVersionStatus\(row\.version_id, eventList\) \?\? row\.status/);
  // A leitura só por evento — que enxergava `null` em todo artefato do
  // Arquiteto — não pode voltar como única fonte.
  assert.doesNotMatch(indice, /if \(effectiveVersionStatus\(row\.version_id, eventList\) !== "approved"\) continue;/);
});

test("evento posterior vence a linha: rejeição depois da gravação ainda barra", () => {
  // A ordem importa: `evento ?? linha`, nunca `linha ?? evento`.
  const trecho = indice.slice(indice.indexOf("const statusVigente"), indice.indexOf("const statusVigente") + 200);
  assert.match(trecho, /effectiveVersionStatus\([^)]*\) \?\? row\.status/);
  assert.doesNotMatch(trecho, /row\.status \?\? effectiveVersionStatus/);
});

test("architectureStatus é opcional no contrato e não pode virar obrigatório", () => {
  const contratos = readFileSync("lib/arquiteto/contracts.ts", "utf8");
  assert.match(contratos, /architectureStatus: ArticleArchitectureStatusSchema\.optional\(\)/);
  // Ausência não contradiz; valor diferente contradiz e continua barrando.
  assert.match(indice, /article\.architectureStatus === undefined/);
  assert.match(indice, /\|\| article\.architectureStatus === "architecture_confirmed"/);
  assert.doesNotMatch(indice, /article\.brandId === brandId && article\.architectureStatus === "architecture_confirmed"/);
});

test("o gate NÃO foi enfraquecido: marca, principal única e pendência seguem", () => {
  assert.match(indice, /article\.brandId === brandId/);
  assert.match(indice, /principals\.length === 1 && principals\[0\]\.keywordId === article\.principalKeywordId/);
  assert.match(indice, /article\.humanPendingDecisions\.length === 0/);
  assert.match(indice, /parsed\.data\.formationStatus === "formed"/);
  assert.match(indice, /row\.workflow_status !== "approved"/);
  assert.match(indice, /conflictFree\.has\(id\)/);
});

/* ============ §7 · o lote da Care Glow ================================= */

const SILO = "silo:v1";
const PAGE = "page:v1";
const GRAPH = "graph:v1";
const ARTIGOS = [
  { articleId: "cand:pilar", versionId: "art:pilar" },
  { articleId: "cand:noturno", versionId: "art:noturno" },
  { articleId: "cand:nivea", versionId: "art:nivea" },
  { articleId: "cand:mascara", versionId: "art:mascara" },
  { articleId: "cand:vitaminac", versionId: "art:vitaminac" },
];

const careGlow = (overrides: Partial<CanonicalApprovalIndex> = {}): CanonicalApprovalIndex => ({
  approvedArticleVersions: new Set(ARTIGOS.map(item => item.versionId)),
  approvedSiloVersions: new Set([SILO]),
  approvedSiloPageVersions: new Set([PAGE]),
  approvedGraphVersions: new Set([GRAPH]),
  articleIdByVersion: new Map(ARTIGOS.map(item => [item.versionId, item.articleId])),
  graphBases: new Map([[GRAPH, {
    siloDnaVersionId: SILO,
    siloPageVersionId: PAGE,
    articleVersionIds: ARTIGOS.map(item => item.versionId),
  }]]),
  ...overrides,
} as unknown as CanonicalApprovalIndex);

const alegacoes = ARTIGOS.map(item => ({
  articleId: item.articleId,
  articleDnaVersionId: item.versionId,
  siloDnaVersionId: SILO,
  siloPageVersionId: PAGE,
  internalLinkGraphVersionId: GRAPH,
}));

test("§7 — os cinco da Care Glow passam: READY_CLAIMS = 5, REFUSED = 0", () => {
  const resultado = validateReadyForRadarClaims({ claims: alegacoes, canonical: careGlow() });
  assert.equal(resultado.accepted.length, 5, resultado.refused.map(item => `${item.articleId}: ${item.blockers.join(" ")}`).join(" · "));
  assert.equal(resultado.refused.length, 0);
});

test("§7 — ArticleDNA fora do índice (stale/sucedido) recusa só ele", () => {
  const resultado = validateReadyForRadarClaims({
    claims: alegacoes,
    canonical: careGlow({ approvedArticleVersions: new Set(ARTIGOS.slice(1).map(item => item.versionId)) }),
  });
  assert.equal(resultado.accepted.length, 4, "o lote não é atômico: quem falha é nomeado");
  assert.equal(resultado.refused.length, 1);
  assert.equal(resultado.refused[0].articleId, "cand:pilar");
  assert.match(resultado.refused[0].blockers.join(" "), /ArticleDNA alegado não está aprovado/);
});

test("§7 — SiloDNA errado recusa o lote inteiro, com diagnóstico", () => {
  const resultado = validateReadyForRadarClaims({
    claims: alegacoes.map(item => ({ ...item, siloDnaVersionId: "silo:de-outro" })),
    canonical: careGlow(),
  });
  assert.equal(resultado.accepted.length, 0);
  assert.equal(resultado.refused[0].diagnostic?.siloDnaKnownApproved, false);
  assert.equal(resultado.refused[0].diagnostic?.articleDnaKnownApproved, true, "e diz que o artigo estava bem");
});

test("§7 — SiloPage errada recusa", () => {
  const resultado = validateReadyForRadarClaims({
    claims: alegacoes.map(item => ({ ...item, siloPageVersionId: "page:de-outro" })),
    canonical: careGlow(),
  });
  assert.equal(resultado.accepted.length, 0);
  assert.equal(resultado.refused[0].diagnostic?.siloPageKnownApproved, false);
});

test("§7 — base do grafo divergente recusa", () => {
  const resultado = validateReadyForRadarClaims({
    claims: alegacoes,
    canonical: careGlow({
      graphBases: new Map([[GRAPH, {
        siloDnaVersionId: "silo:de-outro-par",
        siloPageVersionId: PAGE,
        articleVersionIds: ARTIGOS.map(item => item.versionId),
      }]]),
    }),
  });
  assert.equal(resultado.accepted.length, 0);
  assert.match(resultado.refused[0].blockers.join(" "), /não corresponde ao artigo e ao par de Silo/);
});

test("§7 — grafo que não cobre o ArticleDNA recusa", () => {
  const resultado = validateReadyForRadarClaims({
    claims: alegacoes,
    canonical: careGlow({
      graphBases: new Map([[GRAPH, {
        siloDnaVersionId: SILO,
        siloPageVersionId: PAGE,
        // O grafo cobre só quatro: o quinto não pode passar.
        articleVersionIds: ARTIGOS.slice(0, 4).map(item => item.versionId),
      }]]),
    }),
  });
  assert.equal(resultado.accepted.length, 4);
  assert.equal(resultado.refused.length, 1);
  assert.equal(resultado.refused[0].articleId, "cand:vitaminac");
});

test("§7 — versão de outro artigo recusa mesmo estando aprovada", () => {
  const resultado = validateReadyForRadarClaims({
    claims: [{ ...alegacoes[0], articleId: "cand:de-outra-brand" }],
    canonical: careGlow(),
  });
  assert.equal(resultado.accepted.length, 0);
  assert.match(resultado.refused[0].blockers.join(" "), /pertence a outro artigo/);
  assert.equal(resultado.refused[0].diagnostic?.articleIdOfVersion, "cand:pilar");
});

test("§7 — grafo não aprovado recusa", () => {
  const resultado = validateReadyForRadarClaims({
    claims: alegacoes,
    canonical: careGlow({ approvedGraphVersions: new Set() }),
  });
  assert.equal(resultado.accepted.length, 0);
  assert.equal(resultado.refused[0].diagnostic?.graphKnownApproved, false);
});

/* ============ §4 · o diagnóstico chega ao log ========================== */

test("§4 — a rota registra o diagnóstico de cada recusa", () => {
  assert.match(rota, /\[arquiteto\]\[ready-for-radar\] recusa/);
  assert.match(rota, /blockers: recusa\.blockers/);
  assert.match(rota, /\.\.\.recusa\.diagnostic,/);
});
