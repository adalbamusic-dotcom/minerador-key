import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canonicalArticleKeywordRole,
  canonicalArticleStructuralKeywords,
  resolveArticleAiReviewBase,
  resolveArticleAiReviewReadout,
} from "../lib/arquiteto/article-ai-review.ts";
import {
  articleAiStateLabel,
  deriveArticleProcessReadModel,
  type ArticleProcessReadModelInput,
} from "../lib/arquiteto/article-process-read-model.ts";
import { contentHash } from "../lib/arquiteto/versioning.ts";

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

/** Caso real group-ogg12k: 5 keywords, 1 principalKeywordId. */
const PRINCIPAL = "754441b3-75ec-4c19-a63b-0fe3aa11da30";
const SECOND_PRINCIPAL = "d97d52d4-61c7-44d7-b4ed-dfa778df115d";
const OTHERS = [
  "37fce54b-aa42-478e-9b72-011ade14fbf0",
  "9ef57568-0e6f-4413-a509-812078921915",
  "c900af5c-ed4b-481f-8d33-0eb0c5811e54",
];

type Role = "principal" | "secundaria" | "reforco_narrativo" | null;

const baseFor = (keywords: ReadonlyArray<{ keywordId: string; role: Role }>, principalKeywordId: string | null = PRINCIPAL) =>
  resolveArticleAiReviewBase({
    articleId: "group-ogg12k",
    principalKeywordId,
    keywords,
    articleDna: null,
    serpAssessment: null,
  });

/**
 * Espelha `articleAiReviewBaseFor` do workspace: o Article carrega um Silo, mas
 * o Silo é etapa posterior e não entra na base estrutural revisada.
 */
const baseForGroup = (group: {
  articleId: string;
  principalKeywordId: string | null;
  keywords: ReadonlyArray<{ keywordId: string; role: Role }>;
  suggestedSiloId: string | null;
}) => resolveArticleAiReviewBase({
  articleId: group.articleId,
  principalKeywordId: group.principalKeywordId,
  keywords: group.keywords,
  articleDna: null,
  serpAssessment: null,
});

/** Estado inconsistente da cópia de trabalho no momento da execução. */
const duringExecution: Array<{ keywordId: string; role: Role }> = [
  { keywordId: PRINCIPAL, role: "principal" },
  { keywordId: SECOND_PRINCIPAL, role: "principal" },
  ...OTHERS.map(keywordId => ({ keywordId, role: "secundaria" as Role })),
];

/** Mesma arquitetura depois do reload, com a cópia de trabalho normalizada. */
const afterReload: Array<{ keywordId: string; role: Role }> = [
  { keywordId: PRINCIPAL, role: "principal" },
  { keywordId: SECOND_PRINCIPAL, role: "secundaria" },
  ...OTHERS.map(keywordId => ({ keywordId, role: "secundaria" as Role })),
];

/** Réplica da fórmula ANTIGA, para provar a instabilidade que existia. */
const legacyHash = (keywords: ReadonlyArray<{ keywordId: string; role: Role }>) => contentHash({
  articleId: "group-ogg12k",
  principalKeywordId: PRINCIPAL,
  siloId: null,
  keywords: [...keywords]
    .map(keyword => ({ keywordId: keyword.keywordId, role: keyword.role }))
    .sort((first, second) => first.keywordId.localeCompare(second.keywordId)),
});

const readModel = (overrides: Partial<ArticleProcessReadModelInput> = {}) => deriveArticleProcessReadModel({
  logicProcessing: false,
  hasLogicalOutput: true,
  serpProcessing: false,
  hasSerpAssessment: true,
  serpHasError: false,
  aiProcessing: false,
  pendingProposalCount: 0,
  annotations: [],
  humanPendingDecisionCount: 0,
  reviewProcessing: false,
  ...overrides,
});

test("A · principalKeywordId prevalece sobre reviewRole inconsistente", () => {
  const canonical = canonicalArticleStructuralKeywords(duringExecution, PRINCIPAL);

  const principals = canonical.filter(keyword => keyword.role === "principal");
  assert.equal(principals.length, 1, "nunca duas Principais no hash");
  assert.equal(principals[0].keywordId, PRINCIPAL);
  assert.equal(canonical.find(keyword => keyword.keywordId === SECOND_PRINCIPAL)?.role, "secundaria");
  // Papel ausente também colapsa em Secundária, sem null instável.
  assert.equal(canonicalArticleKeywordRole({ keywordId: "x", role: null, principalKeywordId: PRINCIPAL }), "secundaria");
  assert.equal(canonicalArticleKeywordRole({ keywordId: "x", role: undefined, principalKeywordId: PRINCIPAL }), "secundaria");
});

test("B · mesma estrutura antes e depois do reload produz o mesmo hash", async () => {
  const before = await baseFor(duringExecution);
  const after = await baseFor(afterReload);

  assert.equal(before.articleContentHash, after.articleContentHash);
  assert.deepEqual(before.keywordIds, after.keywordIds);
});

const ARTICLE_EM_FORMACAO = {
  articleId: "group-fase-artigos",
  principalKeywordId: "kw-a",
  keywords: [
    { keywordId: "kw-a", role: "principal" as Role },
    { keywordId: "kw-b", role: "secundaria" as Role },
    { keywordId: "kw-c", role: "secundaria" as Role },
  ],
};

test("A/B/C · Silo não governa STALE: null→X, X→Y e X→null mantêm o hash", async () => {
  const semSilo = await baseForGroup({ ...ARTICLE_EM_FORMACAO, suggestedSiloId: null });
  const comSilo = await baseForGroup({ ...ARTICLE_EM_FORMACAO, suggestedSiloId: "silo-123" });
  const outroSilo = await baseForGroup({ ...ARTICLE_EM_FORMACAO, suggestedSiloId: "silo-456" });

  assert.equal(semSilo.articleContentHash, comSilo.articleContentHash, "null → X");
  assert.equal(comSilo.articleContentHash, outroSilo.articleContentHash, "X → Y");
  assert.equal(outroSilo.articleContentHash, semSilo.articleContentHash, "X → null");
  // O contrato não aceita mais siloId como entrada da identidade estrutural.
  const source = readFileSync("lib/arquiteto/article-ai-review.ts", "utf8");
  const resolver = source.slice(source.indexOf("export async function resolveArticleAiReviewBase"), source.indexOf("export type ArticleAiReviewProposalInput"));
  assert.doesNotMatch(resolver, /siloId/);
  assert.doesNotMatch(workspace, /siloId: group\.suggestedSiloId \|\| null,/);
});

test("pipeline · atribuir Silo depois não desatualiza a revisão da fase Artigos", async () => {
  // FASE ARTIGOS: Article formado sem Silo, IA concluída sem propostas.
  const faseArtigos = await baseForGroup({ ...ARTICLE_EM_FORMACAO, suggestedSiloId: null });
  // FASE SILOS: mesma formação, agora dentro de um Silo.
  const faseSilos = await baseForGroup({ ...ARTICLE_EM_FORMACAO, suggestedSiloId: "silo-123" });

  const sameBaseArticleContentHash = faseArtigos.articleContentHash === faseSilos.articleContentHash;
  assert.equal(sameBaseArticleContentHash, true);

  const readout = resolveArticleAiReviewReadout({
    review: {
      base: faseArtigos,
      execution: { state: "COMPLETED_NO_PROPOSALS", materialProposalCount: 0 },
      proposals: [],
      humanDecision: "no_action",
    } as never,
    currentBaseContentHash: faseSilos.articleContentHash,
  });

  assert.equal(readout.stale, false, "avançar para Silos não pode invalidar a revisão");
  assert.equal(readout.state, "COMPLETED_NO_PROPOSALS");
  const model = readModel({ durableAiState: "COMPLETED_NO_PROPOSALS", aiBaseChanged: readout.stale });
  assert.equal(model.ai.state, "COMPLETED_NO_PROPOSALS");
  assert.notEqual(model.ai.state, "STALE");
});

test("E/F · entrada e saída de keyword continuam invalidando a revisão", async () => {
  const original = await baseForGroup({ ...ARTICLE_EM_FORMACAO, suggestedSiloId: null });
  const adicionada = await baseForGroup({
    ...ARTICLE_EM_FORMACAO,
    keywords: [...ARTICLE_EM_FORMACAO.keywords, { keywordId: "kw-d", role: "secundaria" as Role }],
    suggestedSiloId: null,
  });
  const removida = await baseForGroup({
    ...ARTICLE_EM_FORMACAO,
    keywords: ARTICLE_EM_FORMACAO.keywords.slice(0, 2),
    suggestedSiloId: null,
  });

  assert.notEqual(original.articleContentHash, adicionada.articleContentHash);
  assert.notEqual(original.articleContentHash, removida.articleContentHash);
  assert.notEqual(adicionada.articleContentHash, removida.articleContentHash);
});

test("H · Reforço → Secundária também muda o hash", async () => {
  const reforco = await baseForGroup({
    ...ARTICLE_EM_FORMACAO,
    keywords: [ARTICLE_EM_FORMACAO.keywords[0], { keywordId: "kw-b", role: "reforco_narrativo" as Role }],
    suggestedSiloId: null,
  });
  const secundaria = await baseForGroup({
    ...ARTICLE_EM_FORMACAO,
    keywords: [ARTICLE_EM_FORMACAO.keywords[0], { keywordId: "kw-b", role: "secundaria" as Role }],
    suggestedSiloId: null,
  });

  assert.notEqual(reforco.articleContentHash, secundaria.articleContentHash);
});

test("C · mudança real da Principal muda o hash", async () => {
  const original = await baseFor(afterReload);
  const outraPrincipal = await baseFor(
    afterReload.map(keyword => ({ ...keyword, role: keyword.keywordId === SECOND_PRINCIPAL ? "principal" as Role : keyword.role })),
    SECOND_PRINCIPAL,
  );

  assert.notEqual(original.articleContentHash, outraPrincipal.articleContentHash);
});

test("D · Secundária ↔ Reforço narrativo é estrutural e muda o hash", async () => {
  const secundaria = await baseFor(afterReload);
  const reforco = await baseFor(afterReload.map(keyword =>
    keyword.keywordId === SECOND_PRINCIPAL ? { ...keyword, role: "reforco_narrativo" as Role } : keyword));

  assert.notEqual(secundaria.articleContentHash, reforco.articleContentHash);
  // O papel real sobrevive à canonicalização; não é achatado em Secundária.
  assert.equal(
    canonicalArticleStructuralKeywords([{ keywordId: "x", role: "reforco_narrativo" }], PRINCIPAL)[0].role,
    "reforco_narrativo",
  );
});

test("regressão group-ogg12k · a fórmula antiga era instável, a nova não é", async () => {
  const legacyBefore = await legacyHash(duringExecution);
  const legacyAfter = await legacyHash(afterReload);
  const canonicalBefore = (await baseFor(duringExecution)).articleContentHash;
  const canonicalAfter = (await baseFor(afterReload)).articleContentHash;

  // O hash realmente persistido em group-ogg12k, com duas keywords "principal".
  assert.equal(legacyBefore, "sha256:61da4619b8c797cded4cb09c6217f102aa2a07c4c498ae4fedfb445a55d7398c");
  assert.notEqual(legacyBefore, legacyAfter, "a fórmula antiga divergia no reload");
  assert.equal(canonicalBefore, canonicalAfter, "a fórmula canônica não diverge");
  // A revisão histórica não coincide com a nova base: vira STALE, não NOT_RUN.
  assert.notEqual(legacyBefore, canonicalAfter);
});

test("E · NO_OP com a mesma base continua vigente após o reload", () => {
  const model = readModel({ durableAiState: "COMPLETED_NO_PROPOSALS", durableMaterialProposalCount: 0, durablePendingProposalCount: 0, aiBaseChanged: false });

  assert.equal(model.ai.state, "COMPLETED_NO_PROPOSALS");
  assert.equal(articleAiStateLabel(model.ai.state), "Concluída sem propostas");
  assert.equal(model.ai.proposalCount, 0);
  assert.equal(model.ai.historicalProposalCount, 0);
  assert.equal(model.review.state, "COMPLETED");
});

test("F · revisão com propostas e mesma base continua vigente após o reload", () => {
  const model = readModel({ durableAiState: "COMPLETED_WITH_PROPOSALS", durableMaterialProposalCount: 3, durablePendingProposalCount: 3, aiBaseChanged: false });

  assert.equal(model.ai.state, "COMPLETED_WITH_PROPOSALS");
  assert.equal(model.ai.proposalCount, 3);
  assert.equal(model.ai.historicalProposalCount, 0);
  assert.equal(model.review.state, "PENDING");
  assert.equal(model.review.pendingCount, 3);
});

test("G · base divergente vira STALE, nunca NOT_RUN", () => {
  const model = readModel({ durableAiState: "COMPLETED_WITH_PROPOSALS", durableMaterialProposalCount: 3, durablePendingProposalCount: 3, aiBaseChanged: true });

  assert.equal(model.ai.state, "STALE");
  assert.notEqual(model.ai.state, "NOT_RUN");
  assert.equal(articleAiStateLabel(model.ai.state), "Desatualizada");
});

test("H · STALE preserva a contagem histórica de propostas", () => {
  const model = readModel({ durableAiState: "COMPLETED_WITH_PROPOSALS", durableMaterialProposalCount: 3, durablePendingProposalCount: 3, aiBaseChanged: true });

  assert.equal(model.ai.historicalProposalCount, 3);
  assert.match(workspace, /data-testid="architect-ai-historical-proposals"/);
  assert.match(workspace, /data-testid="architect-ai-stale"/);
});

test("I · STALE não gera pendência ativa", () => {
  const model = readModel({ durableAiState: "COMPLETED_WITH_PROPOSALS", durableMaterialProposalCount: 3, durablePendingProposalCount: 3, aiBaseChanged: true });

  assert.equal(model.ai.proposalCount, 0);
  assert.equal(model.review.pendingCount, 0);
  // A linha nunca mostra "3 pendente(s)" para uma revisão de outra base.
  assert.notEqual(model.review.state, "PENDING");
});

test("J · STALE não bloqueia a aprovação do artigo", () => {
  const model = readModel({ durableAiState: "COMPLETED_WITH_PROPOSALS", durableMaterialProposalCount: 3, durablePendingProposalCount: 3, aiBaseChanged: true });

  assert.equal(model.review.state, "NOT_REQUIRED");
  assert.equal(model.review.pendingCount, 0);
  // Decisão pendente do próprio artigo continua contando; a IA desatualizada não.
  const comDecisaoHumana = readModel({ durableAiState: "COMPLETED_WITH_PROPOSALS", durableMaterialProposalCount: 3, aiBaseChanged: true, humanPendingDecisionCount: 1 });
  assert.equal(comDecisaoHumana.review.pendingCount, 1);
  assert.equal(comDecisaoHumana.ai.state, "STALE");
});

test("K · NOT_RUN continua reservado à ausência real de revisão", () => {
  const semRevisao = readModel({ durableAiState: null, aiBaseChanged: false });
  assert.equal(semRevisao.ai.state, "NOT_RUN");
  assert.equal(semRevisao.ai.historicalProposalCount, 0);
  // Sem artefato durável não existe STALE, mesmo com a flag ligada.
  const flagSemArtefato = readModel({ durableAiState: null, aiBaseChanged: true });
  assert.equal(flagSemArtefato.ai.state, "NOT_RUN");
});

test("L · execução em sessão prevalece sobre a revisão desatualizada, sem chamada automática", () => {
  const reexecutado = readModel({ durableAiState: "COMPLETED_WITH_PROPOSALS", durableMaterialProposalCount: 3, aiBaseChanged: true, pendingProposalCount: 2 });

  assert.equal(reexecutado.ai.state, "COMPLETED_WITH_PROPOSALS");
  assert.equal(reexecutado.ai.proposalCount, 2);
  // A reexecução é sempre explícita: nenhum efeito dispara a IA por conta do STALE.
  assert.doesNotMatch(workspace, /aiBaseChanged[\s\S]{0,120}handleRevalidateStructure/);
  assert.doesNotMatch(workspace, /stale[\s\S]{0,80}runBackgroundTask/);
});

test("a linha rotula STALE como Desatualizada e o hash não usa reviewRole", () => {
  /*
   * A leitura de STALE vive no PAINEL, não numa coluna da planilha.
   *
   * A coluna "Revisão IA" saiu por decisão de contrato: IA é evidência do
   * processamento, não um estágio manual com casa própria na mesa. O que não
   * podia acontecer era a leitura sumir junto — e ela não sumiu.
   */
  assert.match(workspace, /articleAiStateLabel\(articleProcess\.ai\.state\)/);
  assert.match(workspace, /articleProcess\.ai\.state === "STALE" &&/);
  // O rótulo é do read model, uma fonte só para as duas telas.
  assert.match(
    readFileSync("lib/arquiteto/article-process-read-model.ts", "utf8"),
    /STALE: "Desatualizada"/,
  );
  const base = readFileSync("lib/arquiteto/article-ai-review.ts", "utf8");
  const hashBlock = base.slice(base.indexOf("const articleContentHash"), base.indexOf("return {", base.indexOf("const articleContentHash")));
  assert.match(hashBlock, /canonicalArticleStructuralKeywords\(input\.keywords, input\.principalKeywordId\)/);
  assert.doesNotMatch(hashBlock, /role: keyword\.role/);
});
