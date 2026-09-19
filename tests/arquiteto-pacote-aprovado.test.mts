import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  KEYWORD_ALIGNMENT_STATES,
  keywordPackageClosureIssues,
  readApprovedPackageRef,
  resolveArticleKeywordAlignment,
  type KeywordPackageState,
} from "../lib/arquiteto/keyword-package-alignment.ts";
import { resolveSiloClosureReadiness } from "../lib/arquiteto/silo-closure-readiness.ts";
import { canonicalRevisionState } from "../lib/arquiteto/canonical-version-authority.ts";
import { articleKeywordReference } from "../lib/arquiteto/adapters.ts";
import { ApprovedPackageRefSchema, ArticleKeywordReferenceSchema, SiloDNASchema } from "../lib/arquiteto/contracts.ts";
import type { ArchitectKeyword } from "../lib/arquiteto/contracts.ts";

/**
 * ALINHAMENTO ENTRE O ARTICLEDNA E O PACOTE APROVADO DO MINERADOR.
 *
 * O KeywordDNA passou a ser congelado no ato da aprovação. O Arquiteto grava
 * sobre qual versão cada keyword entrou no artigo, compara na leitura, e barra
 * o FECHAMENTO do Silo — nunca a formação — quando o insumo está em movimento.
 *
 * Nada aqui é opinião: é comparação de hash contra o que o handoff gravou.
 */

const ref = (version: number, hash = `h${version}`) => ({ version, contentHash: hash, approvedAt: `2026-09-1${version}T00:00:00.000Z` });
const estado = (keywordId: string, current: ReturnType<typeof ref> | null): [string, KeywordPackageState] =>
  [keywordId, { keywordId, current }];

const artigo = (refs: Record<string, ReturnType<typeof ref> | undefined>) => ({
  articleId: "cand:pilar",
  keywordReferences: Object.entries(refs).map(([keywordId, approvedPackageRef]) => ({
    keywordId, role: "secundaria",
    ...(approvedPackageRef ? { approvedPackageRef } : {}),
  })) as never,
});

/* ============ leitura do pacote gravado pelo handoff =================== */

test("readApprovedPackageRef lê o approvedDna do item e recusa pacote incompleto", () => {
  assert.deepEqual(
    readApprovedPackageRef({ approvedDna: { version: 3, contentHash: "abc", approvedAt: "2026-09-18T00:00:00.000Z", keyword: "x" } }),
    { version: 3, contentHash: "abc", approvedAt: "2026-09-18T00:00:00.000Z" },
  );
  assert.equal(readApprovedPackageRef({ approvedDna: null }), null, "em revisão: sem pacote");
  assert.equal(readApprovedPackageRef({}), null);
  assert.equal(readApprovedPackageRef({ approvedDna: { version: 0, contentHash: "abc", approvedAt: "x" } }), null, "versão inválida não vira ref");
  assert.equal(readApprovedPackageRef({ approvedDna: { version: 1, contentHash: "", approvedAt: "x" } }), null);
});

/* ============ os quatro estados, e o que cada um significa ============= */

test("ALIGNED — mesma versão aprovada vigente", () => {
  const out = resolveArticleKeywordAlignment({
    article: artigo({ k1: ref(2) }),
    currentByKeywordId: new Map([estado("k1", ref(2))]),
  });
  assert.equal(out.keywords[0].state, "ALIGNED");
  assert.deepEqual(out.staleReasons, []);
  assert.equal(out.inReview, false);
  assert.equal(out.provenanceIncomplete, false);
});

test("PACKAGE_NEWER — reaprovação depois da formação invalida, com motivo nomeado", () => {
  const out = resolveArticleKeywordAlignment({
    article: artigo({ k1: ref(2) }),
    currentByKeywordId: new Map([estado("k1", ref(3))]),
    labels: new Map([["k1", "skin care noturno"]]),
  });
  assert.equal(out.keywords[0].state, "PACKAGE_NEWER");
  assert.equal(out.staleReasons.length, 1);
  assert.match(out.staleReasons[0], /skin care noturno/);
  assert.match(out.staleReasons[0], /v2 → v3/);
});

test("IN_REVIEW — keyword em revisão informa e NÃO invalida: o Arquiteto segue sobre a aprovada", () => {
  const out = resolveArticleKeywordAlignment({
    article: artigo({ k1: ref(2) }),
    currentByKeywordId: new Map([estado("k1", null)]),
  });
  assert.equal(out.keywords[0].state, "IN_REVIEW");
  assert.equal(out.inReview, true);
  assert.deepEqual(out.staleReasons, [], "revisão em andamento não é staleReason");
  assert.match(out.keywords[0].reason, /segue sobre a v2 aprovada/);
});

test("UNKNOWN — acervo anterior ao pacote não é alinhado nem desatualizado por palpite", () => {
  const out = resolveArticleKeywordAlignment({
    article: artigo({ k1: undefined }),
    currentByKeywordId: new Map([estado("k1", ref(5))]),
  });
  assert.equal(out.keywords[0].state, "UNKNOWN");
  assert.equal(out.provenanceIncomplete, true);
  assert.deepEqual(out.staleReasons, [], "sem ref gravada não há o que comparar");
});

test("keyword com ref gravada mas fora do mapa atual é ALIGNED: ausência de informação não contradiz o gravado", () => {
  // A keyword gravou ref mas o mapa atual não a conhece: não é revisão nem
  // reaprovação — é ausência de informação, e ausência não invalida.
  const out = resolveArticleKeywordAlignment({
    article: artigo({ k1: ref(2) }),
    currentByKeywordId: new Map(),
  });
  assert.equal(out.keywords[0].state, "ALIGNED", "sem current e sem entrada no mapa: nada contradiz o gravado");
  assert.deepEqual(out.staleReasons, []);
});

test("todo estado do contrato é produzido por algum caminho", () => {
  assert.deepEqual([...KEYWORD_ALIGNMENT_STATES], ["ALIGNED", "PACKAGE_NEWER", "IN_REVIEW", "UNKNOWN"]);
});

/* ============ o mecanismo apagado agora acende ========================= */

test("canonicalRevisionState recebe staleReasons e invalida a aprovada", () => {
  const canonical = { versionId: "v1", entityId: "cand:pilar", versionNumber: 1 } as never;
  const alinhado = canonicalRevisionState({ authority: { canonical, workingProposal: null, latest: canonical }, staleReasons: [] });
  assert.equal(alinhado.canonicalIsStale, false);
  assert.equal(alinhado.usableDownstream, true);

  const reaprovada = canonicalRevisionState({
    authority: { canonical, workingProposal: null, latest: canonical },
    staleReasons: ['"skin care noturno" foi reaprovada (v2 → v3) depois que este artigo nasceu.'],
  });
  assert.equal(reaprovada.canonicalIsStale, true);
  assert.equal(reaprovada.usableDownstream, false);
  assert.match(reaprovada.headline, /precisa de revisão/);
});

/* ============ o fechamento do Silo barra insumo em movimento ============ */

test("KEYWORD_PACKAGE_STALE — em revisão barra o fechamento", () => {
  const issues = keywordPackageClosureIssues({
    keywordIds: ["k1", "k2"],
    currentByKeywordId: new Map([estado("k1", null), estado("k2", ref(1))]),
    labels: new Map([["k1", "skin care nivea"]]),
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].keywordId, "k1");
  assert.match(issues[0].reason, /em revisão/);
});

test("KEYWORD_PACKAGE_STALE — reaprovada depois da formação barra; alinhada não", () => {
  const issues = keywordPackageClosureIssues({
    keywordIds: ["k1", "k2"],
    currentByKeywordId: new Map([estado("k1", ref(3)), estado("k2", ref(1))]),
    recordedByKeywordId: new Map([["k1", ref(2)], ["k2", ref(1)]]),
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].keywordId, "k1");
  assert.match(issues[0].reason, /v2 → v3/);
});

test("KEYWORD_PACKAGE_STALE — sem handoff ou pré-pacote não barra: ausência não é movimento", () => {
  const issues = keywordPackageClosureIssues({
    keywordIds: ["k1"],
    currentByKeywordId: new Map(),
  });
  assert.deepEqual(issues, []);
});

test("resolveSiloClosureReadiness expõe o novo blocker com o rótulo", () => {
  const fechamento = resolveSiloClosureReadiness({
    siloRef: "territory:skincare",
    activeCandidateRefs: ["cand:a"],
    concludedCandidateRefs: ["cand:a"],
    pendingMaterializationRefs: [],
    keywordPackageIssues: [{ label: "skin care nivea", reason: "está em revisão no Minerador; fechar agora congelaria um insumo em movimento." }],
  });
  assert.equal(fechamento.ready, false);
  assert.deepEqual(fechamento.blockers.map(item => item.code), ["KEYWORD_PACKAGE_STALE"]);
  assert.match(fechamento.blockers[0].detail, /"skin care nivea" está em revisão/);
  // Sem insumo em movimento, os cinco blockers antigos seguem sendo os únicos.
  assert.equal(resolveSiloClosureReadiness({
    siloRef: "territory:skincare", activeCandidateRefs: ["cand:a"], concludedCandidateRefs: ["cand:a"], pendingMaterializationRefs: [],
  }).ready, true);
});

/* ============ o contrato é aditivo e a formação grava a ref ============ */

test("ApprovedPackageRef e os campos novos são opcionais: acervo antigo continua válido", () => {
  assert.equal(ApprovedPackageRefSchema.safeParse({ version: 1, contentHash: "h", approvedAt: "2026-09-18" }).success, true);
  assert.equal(ApprovedPackageRefSchema.safeParse({ version: 1, contentHash: "h" }).success, false, "sem approvedAt não é pacote");
  // ArticleKeywordReference sem o campo continua parseando: aditivo.
  const shape = ArticleKeywordReferenceSchema.shape;
  assert.equal(shape.approvedPackageRef.isOptional(), true);
  assert.equal(SiloDNASchema.shape.keywordPackageRefs.isOptional(), true);
});

test("a formação grava approvedPackageRef só quando o handoff entregou pacote", () => {
  const base = {
    id: "k1", keyword: "skin care noturno", intent: "informacional", volume_search: 720, kgr_score: 0.4,
    analise_semantica: { dna_origem: "logico_deterministico", dna_confianca: 0.9 },
  } as unknown as ArchitectKeyword;
  const comPacote = articleKeywordReference({ ...base, approvedPackageRef: ref(2) } as ArchitectKeyword, "principal", "brand-1");
  assert.deepEqual(comPacote.approvedPackageRef, ref(2));
  const emRevisao = articleKeywordReference({ ...base, approvedPackageRef: null } as ArchitectKeyword, "principal", "brand-1");
  assert.equal("approvedPackageRef" in emRevisao, false, "null (em revisão) não vira ref no artigo");
  const prePacote = articleKeywordReference(base, "principal", "brand-1");
  assert.equal("approvedPackageRef" in prePacote, false);
  // E os três continuam artefatos válidos.
  for (const item of [comPacote, emRevisao, prePacote]) assert.equal(ArticleKeywordReferenceSchema.safeParse(item).success, true, JSON.stringify(ArticleKeywordReferenceSchema.safeParse(item)));
});

/* ============ contrato de tela: uma autoridade, escopo Arquiteto ======= */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const codigo = workspace.split("\n")
  .filter(linha => !linha.trimStart().startsWith("*") && !linha.trimStart().startsWith("//") && !linha.trimStart().startsWith("/*"))
  .join("\n");

test("a linha do artigo alimenta canonicalRevisionState com staleReasons do alinhamento", () => {
  assert.equal(codigo.includes("staleReasons: alinhamento?.staleReasons ?? [],"), true);
  assert.equal(codigo.includes("resolveArticleKeywordAlignment({"), true);
});

test("gatilho e retomada passam o mesmo keywordPackageIssuesFor ao portão", () => {
  assert.equal((codigo.match(/keywordPackageIssues: keywordPackageIssuesFor\(/g) || []).length, 2, "duas chamadas, uma função");
  assert.equal(codigo.includes("const keywordPackageIssuesFor = useCallback("), true);
});

test("o pacote é lido do item de workflow, não da linha viva do Minerador", () => {
  const canonical = readFileSync("lib/arquiteto/canonical-workspace.ts", "utf8");
  assert.match(canonical, /"approvedDna" in item\.payload \? \{ approvedPackageRef: readApprovedPackageRef\(item\.payload\) \} : \{\}/);
  // Escopo: nenhum arquivo fora do Arquiteto muda para isto.
  const alinhamento = readFileSync("lib/arquiteto/keyword-package-alignment.ts", "utf8");
  for (const proibido of ["fetch(", "/api/", "minerador/", "supabase"]) {
    assert.equal(alinhamento.includes(proibido), false, `o alinhamento não pode conter ${proibido}`);
  }
});

test("o SiloDNA consolidado deriva keywordPackageRefs dos artigos, uma fonte só", () => {
  const consolidation = readFileSync("lib/arquiteto/silo-consolidation.ts", "utf8");
  assert.match(consolidation, /articles\.flatMap\(article => article\.payload\.keywordReferences\)/);
  assert.match(consolidation, /\.\.\.\(keywordPackageRefs\.length \? \{ keywordPackageRefs \} : \{\}\)/);
});
