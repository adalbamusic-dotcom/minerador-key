import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { articleKeywordReference } from "../lib/arquiteto/adapters.ts";
import { ArticleKeywordReferenceSchema } from "../lib/arquiteto/contracts.ts";
import { buildRadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import { buildRadarKeywordProfile, radarDeclaredCommercialSignal } from "../lib/radar/foundation-profiles.ts";
import { RadarItemSchema } from "../lib/editorial/operational-flow.ts";
import type { ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";

/*
 * O ÚLTIMO FUNDAMENTO QUE FALTAVA ATRAVESSAR.
 *
 * O Minerador consolida intenção e funil no artefato
 * `keyword_semantic_qualification`, e o handoff já a levava até o Arquiteto —
 * mas ela parava ali: o ArticleDNA guardava as métricas e perdia a leitura
 * semântica que as explicava. O Radar então mostrava "intenção pendente" para
 * uma keyword que o Minerador já havia classificado como Transacional/BOFU.
 */
const brandId = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const HASH = "sha256:" + "c".repeat(64);

const qualificacao = (intent: string | null, funnel: string | null) => ({
  versionId: `keyword_semantic_qualification:${brandId}:kw-1:v1`,
  versionNumber: 1,
  contentHash: "sha256:" + "d".repeat(64),
  intent, funnel,
  semanticState: intent ? "conclusive" as const : "non_conclusive" as const,
  collectedAt: "2026-09-03T19:07:35.000Z",
});

const keywordDoArquiteto = (patch: Record<string, unknown> = {}) => ({
  id: "969600d4-4a24-411c-8e23-2e456f8a6a86",
  keyword: "skin care principia",
  brand_id: brandId,
  volume_search: 2400,
  results_allintitle: 424,
  kgr_score: 0.177,
  intent: "transacional",
  analise_semantica: { dna_origem: "logico_deterministico", dna_confianca: "media" },
  ...patch,
});

/* ---------------------------- A, B, C e D -------------------------------- */

test("B e D · todo papel recebe keywordDnaSnapshot: o envelope não muda com o papel", () => {
  for (const papel of ["principal", "secundaria", "reforco_narrativo"] as const) {
    const referencia = articleKeywordReference(keywordDoArquiteto() as never, papel, brandId);
    assert.equal(ArticleKeywordReferenceSchema.safeParse(referencia).success, true, `${papel} produz referência válida`);
    assert.notEqual(referencia.keywordDnaSnapshot, undefined, `${papel} recebe o snapshot da KeywordDNA`);
    assert.equal(typeof referencia.volume, "number");
    assert.equal(typeof referencia.resultCount, "number");
    assert.equal(typeof referencia.kgrScore, "number");
    assert.ok(referencia.strategicContribution);
    assert.ok(referencia.coveredIntentions.length);
  }
});

test("C · a qualificação semântica passa a ser incorporada na formação, para todos os papéis", () => {
  const comQualificacao = keywordDoArquiteto({ semanticQualification: qualificacao("Transacional", "BOFU") });

  for (const papel of ["principal", "secundaria", "reforco_narrativo"] as const) {
    const referencia = articleKeywordReference(comQualificacao as never, papel, brandId);
    assert.equal(referencia.semanticQualificationRef?.intent, "Transacional", `${papel} carrega a intenção consolidada`);
    assert.equal(referencia.semanticQualificationRef?.funnel, "BOFU");
    assert.equal(referencia.semanticQualificationRef?.semanticState, "conclusive");
    assert.match(String(referencia.semanticQualificationRef?.versionId), /keyword_semantic_qualification/);
    assert.match(String(referencia.semanticQualificationRef?.contentHash), /^sha256:/);
    assert.equal(referencia.semanticQualificationRef?.collectedAt, "2026-09-03T19:07:35.000Z");
  }
});

test("P · sem qualificação na origem, nada é inventado — a ausência permanece ausente", () => {
  const semQualificacao = articleKeywordReference(keywordDoArquiteto() as never, "principal", brandId);
  assert.equal(semQualificacao.semanticQualificationRef, undefined);

  // Referência incompleta também não vira campo preenchido por conveniência.
  const incompleta = articleKeywordReference(
    keywordDoArquiteto({ semanticQualification: { versionId: "v1", intent: "Transacional" } }) as never,
    "principal", brandId,
  );
  assert.equal(incompleta.semanticQualificationRef, undefined, "sem hash, data e estado não existe referência");

  // Evidência não conclusiva viaja com os eixos vazios, e diz que são vazios.
  const naoConclusiva = articleKeywordReference(
    keywordDoArquiteto({ semanticQualification: qualificacao(null, null) }) as never, "principal", brandId,
  );
  assert.equal(naoConclusiva.semanticQualificationRef?.semanticState, "non_conclusive");
  assert.equal(naoConclusiva.semanticQualificationRef?.intent, null);
});

test("E · formar a referência não muta a keyword recebida", () => {
  const keyword = keywordDoArquiteto({ semanticQualification: qualificacao("Transacional", "BOFU") });
  const antes = JSON.stringify(keyword);
  articleKeywordReference(keyword as never, "principal", brandId);
  assert.equal(JSON.stringify(keyword), antes, "a formação é pura sobre a entrada");
});

/* --------------------- L, M e N · o Radar resolve sozinho ---------------- */

const KEYWORDS = [
  { id: "kw-1", texto: "skin care principia", role: "principal" as const, intent: "Transacional", funnel: "BOFU" },
  { id: "kw-2", texto: "skin care loreal", role: "secundaria" as const, intent: "Informativa", funnel: "TOFU" },
];

const referenciaCompleta = (kw: typeof KEYWORDS[number]) => ({
  keywordId: kw.id, keywordDnaVersionId: `kwdna-${kw.id}`, keywordDnaContentHash: HASH, role: kw.role,
  strategicContribution: `Contribuição de ${kw.texto}`, coveredIntentions: ["informacional"],
  requiredTopics: [], excludedTopics: [], classificationOrigin: "human" as const, confidence: 0.8,
  humanConfirmed: true, volume: 2400, resultCount: 424, kgrScore: 0.177,
  semanticQualificationRef: { ...qualificacao(kw.intent, kw.funnel), versionId: `keyword_semantic_qualification:${brandId}:${kw.id}:v1` },
});

const snapshotHidratado = (kw: typeof KEYWORDS[number]) => ({
  referenceKeywordId: kw.id, canonicalKeywordId: kw.id, sourceKeywordId: kw.id, originalKeywordId: kw.id,
  aliases: [], keywordDnaVersionId: `kwdna-${kw.id}`, keyword: kw.texto, role: kw.role,
  brandId, siloId: "silo-1", siloName: "Skin care para peles oleosas", isPublished: false,
});

const linha = () => RadarItemSchema.parse({
  id: "radar:article-1", brandId, articleId: "article-1", articleDnaVersionId: "articledna-v5",
  articleDnaContentHash: HASH, title: "Cobrir skin care principia", slug: "skin-care-principia",
  siloId: "silo-1", hierarchy: "Suporte", principalKeywordId: "kw-1", format: "Suporte",
  intent: "informacional", state: "research_pending", importedAt: "2026-09-07T10:00:00.000Z",
  updatedAt: "2026-09-07T10:00:00.000Z", origin: "local", lockVersion: 1,
  hydration: {
    schemaVersion: 1, brandId, articleId: "article-1", articleDnaVersionId: "articledna-v5",
    source: "arquiteto_import", capturedAt: "2026-09-07T10:00:00.000Z", principalKeywordId: "kw-1",
    principalKeyword: snapshotHidratado(KEYWORDS[0]), keywordSnapshots: KEYWORDS.map(snapshotHidratado),
    silo: { id: "silo-1", name: "Skin care para peles oleosas", siloDnaVersionId: "silodna-v3", siloDnaContentHash: HASH, territoryRef: "t1", siloPageId: "sp1", siloPageVersionId: "spv1", siloPageSlug: "/skincare", siloPageCanonical: null, siloPagePublicationStatus: "published", articleRole: "support" },
  },
  arquitetoKeywordDnaReferences: KEYWORDS.map(referenciaCompleta),
});

const articleDna = (): ArticleDNA => ({
  schemaVersion: 1, articleId: "article-1", brandId, principalKeywordId: "kw-1",
  secondaryKeywordIds: ["kw-2"], narrativeReinforcementIds: [],
  keywordReferences: KEYWORDS.map(referenciaCompleta), siloId: "silo-1", hierarchy: "Suporte",
  suggestedSlug: "skin-care-principia", canonical: null, mainIntent: "informacional", auxiliaryIntents: [],
  audience: "Pele oleosa", problem: "Rotina", desiredResult: "Rotina clara", journeyStage: "consideracao",
  brandObjective: "Autoridade", promise: "Cobrir skin care principia", angle: "Prático", cta: "Conhecer",
  coverage: ["rotina de skincare"], excludedSubjects: [], antiCannibalizationBoundary: "Sem maquiagem",
  nearbyArticleIds: [], differentiation: [], entities: [], requiredTopics: ["rotina de skincare"],
  questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [],
  confidence: 0.7, humanPendingDecisions: [],
} as unknown as ArticleDNA);

const envelope = (): VersionEnvelope<ArticleDNA> => ({
  versionId: "articledna-v5", entityId: "article-1", versionNumber: 5, previousVersionId: "articledna-v4",
  contentHash: HASH, origin: "human", changeReason: "fixture", createdAt: "2026-09-07T09:00:00.000Z",
  createdBy: "auditor", payload: articleDna(),
} as VersionEnvelope<ArticleDNA>);

test("L · a projeção do R10.1 resolve o fundamento novo sem código especial", () => {
  const context = buildRadarArticleResearchContext({ item: linha(), article: envelope() });

  assert.equal(context.keywords.length, KEYWORDS.length);
  for (const keyword of context.keywords) {
    const esperada = KEYWORDS.find(kw => kw.id === keyword.identity.keywordId)!;
    assert.equal(keyword.strategy.semanticQualification?.intent, esperada.intent);
    assert.equal(keyword.strategy.semanticQualification?.funnel, esperada.funnel);
    assert.equal(keyword.strategy.semanticQualification?.semanticState, "conclusive");
    assert.match(String(keyword.strategy.semanticQualification?.versionId), /keyword_semantic_qualification/);
  }
});

test("M · a UI mostra intenção consolidada, funil, estado, versão e hash da qualificação", () => {
  const context = buildRadarArticleResearchContext({ item: linha(), article: envelope() });
  const perfil = buildRadarKeywordProfile(context.keywords[0]);

  const logica = perfil.find(secao => secao.title === "Leitura lógica")!;
  assert.equal(logica.fields.find(field => field.label === "Intenção consolidada")?.value, "Transacional");
  assert.equal(logica.fields.find(field => field.label === "Funil consolidado")?.value, "BOFU");

  const semantica = perfil.find(secao => secao.title === "Qualificação semântica")!;
  assert.equal(semantica.fields.find(field => field.label === "Estado da evidência")?.value, "Conclusiva");
  assert.match(String(semantica.fields.find(field => field.label === "Versão da qualificação")?.value), /keyword_semantic_qualification/);
  assert.match(String(semantica.fields.find(field => field.label === "Hash da qualificação")?.value), /^sha256:/);
  assert.ok(semantica.fields.find(field => field.label === "Qualificação coletada em")?.value);

  // A secundária tem exatamente as mesmas seções e campos.
  const perfilSecundaria = buildRadarKeywordProfile(context.keywords[1]);
  assert.deepEqual(perfilSecundaria.map(secao => secao.title), perfil.map(secao => secao.title));
  assert.equal(perfilSecundaria.find(secao => secao.title === "Leitura lógica")!.fields.find(field => field.label === "Funil consolidado")?.value, "TOFU");
});

test("N · o motor recebe a intenção consolidada, e ela muda a leitura da SERP", () => {
  const context = buildRadarArticleResearchContext({ item: linha(), article: envelope() });
  const sinal = radarDeclaredCommercialSignal(context);

  assert.equal(sinal.expectsCommercialSerp, true, "Transacional na qualificação é lido pelo motor");
  assert.ok(sinal.declaredIntents.includes("transacional"));
  assert.ok(sinal.commercialKeywords >= 1);

  const fonte = readFileSync(new URL("../lib/radar/foundation-profiles.ts", import.meta.url), "utf8");
  assert.ok(fonte.includes("keyword.strategy.semanticQualification?.intent"), "o sinal lê a qualificação, não só o normalizedIntent");
});

/* ------------------------ imutabilidade e contrato ----------------------- */

test("E e I · o campo é aditivo: versão antiga continua válida e a composição não muda", () => {
  const antiga = { ...referenciaCompleta(KEYWORDS[0]) } as Record<string, unknown>;
  delete antiga.semanticQualificationRef;
  const parsed = ArticleKeywordReferenceSchema.safeParse(antiga);
  assert.equal(parsed.success, true, "ArticleDNA formado antes deste corte continua parseando");

  // E o Radar declara a ausência em vez de escondê-la.
  const contexto = buildRadarArticleResearchContext({
    item: RadarItemSchema.parse({ ...linha(), arquitetoKeywordDnaReferences: [antiga] }),
    article: envelope(),
  });
  assert.equal(contexto.keywords[0].strategy.semanticQualification, null);
  const semantica = buildRadarKeywordProfile(contexto.keywords[0]).find(secao => secao.title === "Qualificação semântica")!;
  assert.equal(semantica.fields.find(field => field.label === "Versão da qualificação")?.state, "NOT_IN_THIS_VERSION");
});

test("J e K · a incorporação não toca principal, papéis nem Silo", () => {
  const referencias = KEYWORDS.map(kw => articleKeywordReference(
    keywordDoArquiteto({ id: kw.id, keyword: kw.texto, semanticQualification: qualificacao(kw.intent, kw.funnel) }) as never,
    kw.role, brandId,
  ));

  assert.deepEqual(referencias.map(item => item.keywordId), KEYWORDS.map(kw => kw.id));
  assert.deepEqual(referencias.map(item => item.role), KEYWORDS.map(kw => kw.role));
  assert.equal(referencias.filter(item => item.role === "principal").length, 1);

  // A formação da referência não conhece Silo: ele não é tocado por este caminho.
  const fonte = readFileSync(new URL("../lib/arquiteto/adapters.ts", import.meta.url), "utf8");
  const corpo = fonte.slice(fonte.indexOf("export function articleKeywordReference"), fonte.indexOf("const stringList"));
  assert.equal(/siloId|siloDna|siloPage/i.test(corpo), false, "a referência de keyword não decide Silo");
});

/* ------------- o caminho canônico da rematerialização (R10.1C) ----------- */

test("REMATERIALIZAÇÃO · a reformação passa por articleKeywordReference e preserva a qualificação", async () => {
  const { confirmedArticlePayload } = await import("../lib/arquiteto/architecture-confirmation.ts");

  const referencias = KEYWORDS.map(referenciaCompleta);
  const antes = {
    ...articleDna(),
    keywordReferences: referencias,
  } as ArticleDNA;

  const confirmado = confirmedArticlePayload(antes, "kw-1", "ator-1", "2026-09-07T12:00:00.000Z");

  // A confirmação preserva o fundamento de TODAS as keywords.
  assert.equal(confirmado.keywordReferences.length, KEYWORDS.length);
  for (const referencia of confirmado.keywordReferences) {
    const esperada = KEYWORDS.find(kw => kw.id === referencia.keywordId)!;
    assert.equal(referencia.semanticQualificationRef?.intent, esperada.intent, `${esperada.texto} mantém a intenção consolidada`);
    assert.equal(referencia.semanticQualificationRef?.funnel, esperada.funnel);
  }

  // A composição não muda: mesma principal, mesmos papéis, mesmo conjunto.
  assert.equal(confirmado.principalKeywordId, "kw-1");
  assert.deepEqual(confirmado.keywordReferences.map(item => item.keywordId).sort(), KEYWORDS.map(kw => kw.id).sort());
  assert.equal(confirmado.keywordReferences.filter(item => item.role === "principal").length, 1);
  assert.equal(confirmado.siloId, antes.siloId);
  assert.equal(confirmado.suggestedSlug, antes.suggestedSlug);
});

test("REMATERIALIZAÇÃO · a reformação real reconstrói as referências e sucede a versão vigente", () => {
  const workspace = readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8");
  const trecho = workspace.slice(workspace.indexOf("const base = deterministicArticleDnaPayload(grupo, selectedBrandId);"), workspace.indexOf("aprovacoes.push(createStatusEvent"));

  /*
   * O caminho canônico, provado no código:
   *   deterministicArticleDnaPayload → articleKeywordReference (fundamento novo)
   *   → confirmedArticlePayload → materializeArticleSiloId
   *   → createVersionEnvelope (sucessora) → persistArquitetoArtifact (edit)
   */
  assert.ok(trecho.includes("deterministicArticleDnaPayload"), "a reformação reconstrói as referências");
  assert.ok(trecho.includes("previousVersionId: vigente?.versionId || null"), "sucede a versão vigente");
  assert.ok(trecho.includes("versionNumber: (vigente?.versionNumber || 0) + 1"));
  assert.ok(trecho.includes("Formação concluída novamente"), "o motivo da versão é explícito");
  assert.ok(trecho.includes('action: vigente ? "edit" : "create"'));

  /*
   * E o guarda que muda a expectativa do smoke: conteúdo idêntico volta como
   * UNCHANGED e NÃO cria versão. Sem qualificação na origem, a reformação é um
   * no-op — o que é o comportamento correto, não uma falha.
   */
  assert.ok(trecho.includes('if (persistido.persistence === "UNCHANGED") continue;'));

  // Nenhuma escrita direta de artefato fora do pipeline versionado.
  assert.equal(/UPDATE |\.update\(/.test(trecho), false, "não existe mutação in-place no caminho da reformação");
});
