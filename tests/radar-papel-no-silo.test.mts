import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importArticlesToRadar } from "../lib/editorial/operational-flow.ts";
import { buildRadarHandoffContexts } from "../lib/arquiteto/radar-handoff-context.ts";
import { resolveSiloHierarchyView } from "../lib/arquiteto/internal-link-projection.ts";
import { buildRadarArticleResearchContext, radarResearchContextSiloRole } from "../lib/radar/article-research-context.ts";
import { buildRadarArticleDnaSummary } from "../lib/radar/operational-view.ts";
import { buildRadarKgrStrategy } from "../lib/radar/strategy-context.ts";
import { planRadarSiloExport } from "../lib/radar/portable-silo-export.ts";
import { reconcileRadarItems } from "../lib/radar/hydration.ts";
import { buildRadarR3Model } from "../lib/radar/r3-workbench.ts";
import { buildRadarEditorialContext } from "../lib/radar/editorial-context.ts";
import { buildRadarFoundationSections } from "../lib/radar/foundation-profiles.ts";
import {
  radarArticleSiloRole,
  radarCurrentSiloDna,
  radarFormatFilterIsLegacyRole,
  radarSiloDnaRoleOf,
  radarSiloRoleIsSupport,
  radarSiloRoleLabelOrNull,
  radarUnitFormatLabel,
} from "../lib/radar/silo-role.ts";
import { buildRadarPortableExportRow } from "../lib/radar/portable-export.ts";
import {
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarArticleBlueprintPrompt,
  radarSanitizeArticleBlueprint,
} from "../lib/radar/article-blueprint.ts";
import { buildRadarWritingExportArticle } from "../lib/radar/portable-writing-export.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RadarR3ProfileMirror } from "../modules/radar/radar-r3-profile-mirror.tsx";
import { createRadarR4LocalArticleState } from "../lib/radar/r4-queue.ts";
import { ARTIGO, ARTIGO_AMAZON, EXPORTADO_EM, ITENS_DO_SILO, MARCA as MARCA_DA_BANCADA, SILO_DNA, entradaGoogle, entradaGoogleSaude, planoDoSilo } from "./radar-portable-writing-fixtures.mts";
/* 2026-10-09 · o CSV "Para escrever" sai só com a planta concluída (regra do dono). */
import { comPlanta, plantaDe, respostaDaPlanta } from "./radar-piloto-planta-fixtures-2026-10-09.mts";

/*
 * ===== 2026-10-08 · O PAPEL NO SILO É O QUE O ARQUITETO DECIDIU =====
 *
 * O relato do dono: no Arquiteto, "leads qualificados" é o PILAR do Silo
 * "Leads sem Tráfego Pago"; no Radar, os oito artigos eram "Suporte". A causa:
 * o Radar lia `RadarItem.hierarchy` = `ArticleDNA.hierarchy`, a SUGESTÃO da
 * formação, gravada "Suporte" fixo antes de o Silo existir. A decisão do Pilar
 * mora no SiloDNA (`pillarArticleId`), e é de lá que o Arquiteto lê.
 *
 * Aqui, pelo caminho real (handoff do Arquiteto → importação → leitores do
 * Radar), com fixtures e sem rede:
 *   1. SiloDNA com o Pilar e ArticleDNA dizendo Suporte → o Radar mostra Pilar
 *      em todas as superfícies (planilha/perfil/R3, Conteúdo, KGR, contexto
 *      editorial, fundamentos, blueprint e artigo-modelo, export por Silo);
 *   2. Silo sem decisão → a reserva da formação, marcada como formação;
 *   3. o Pilar não recebe planta de Suporte nem link para si mesmo;
 *   4. a régua é uma só (o export por Silo e a planilha respondem igual).
 */

const MARCA = "61d2e019-f44f-4fa3-af2f-d86b95628ab3";
const HASH = "sha256:" + "c".repeat(64);
const TERRITORIO = "territory:leads-sem-trafego-pago";
const SILO = "silo:leads-sem-trafego-pago";

const ARTIGOS = [
  { id: "article-formation:leads-qualificados", kw: "leads qualificados", slug: "leads-qualificados", vol: 880 },
  { id: "article-formation:captacao-sem-trafego", kw: "captação de pacientes sem tráfego pago", slug: "captacao-de-pacientes", vol: 90 },
  { id: "article-formation:como-captar-um-cliente", kw: "como captar um cliente", slug: "como-captar-um-cliente", vol: 260 },
];
const PILAR = ARTIGOS[0].id;
const FONTES = ARTIGOS.map(a => ({ id: `kw-${a.slug}`, keyword: a.kw }));

const referencia = (a: typeof ARTIGOS[number]) => ({
  keywordId: `kw-${a.slug}`, keywordDnaVersionId: `kwdna-${a.slug}`, keywordDnaContentHash: HASH, role: "principal",
  strategicContribution: "central", coveredIntentions: ["informacional"], requiredTopics: [a.kw], excludedTopics: [],
  classificationOrigin: "human", confidence: 0.8, humanConfirmed: true, normalizedIntent: "informational",
  volume: a.vol, resultCount: 190, kgrScore: null, incrementalVolume: null, contribution: "central",
  purpose: "Cobrir a intenção declarada", overlapRisk: "low",
});

/* O ArticleDNA como a formação de hoje o grava: `hierarchy: "Suporte"` para TODOS. */
/* `siloId` nulo é o ArticleDNA territorial: o Silo mora no SiloDNA e o handoff o resolve pelo território. */
const articleDna = (a: typeof ARTIGOS[number], siloId: string | null = SILO) => ({
  schemaVersion: 1, articleId: a.id, brandId: MARCA, principalKeywordId: `kw-${a.slug}`, secondaryKeywordIds: [], narrativeReinforcementIds: [],
  keywordReferences: [referencia(a)], siloId, territoryRef: TERRITORIO, hierarchy: "Suporte",
  suggestedSlug: a.slug, canonical: null, mainIntent: "informacional", auxiliaryIntents: [],
  audience: "Clínicas", problem: "Sem leads", desiredResult: "Leads", journeyStage: "consideracao",
  brandObjective: "Autoridade", promise: a.kw, angle: "Prático", cta: "Conhecer", coverage: [a.kw], excludedSubjects: [],
  antiCannibalizationBoundary: "—", nearbyArticleIds: [], differentiation: [], entities: [], requiredTopics: [a.kw],
  questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.7,
  humanPendingDecisions: [],
});
const envelope = (a: typeof ARTIGOS[number], versao = 2, siloId: string | null = SILO) => ({
  versionId: `adna-${a.slug}-v${versao}`, entityId: a.id, versionNumber: versao, previousVersionId: null, contentHash: HASH,
  origin: "human", changeReason: "fixture", createdAt: "2026-10-01T09:00:00.000Z", createdBy: "dono", payload: articleDna(a, siloId),
});

/* O SiloDNA da fase Silos. `articleRoles` legado nasce de ArticleDNA.hierarchy: todos "Suporte". */
const siloDna = (pillarArticleId: string | null, versao = 1, extra: Record<string, unknown> = {}) => ({
  versionId: `silodna-v${versao}`, entityId: SILO, versionNumber: versao, previousVersionId: null, contentHash: HASH,
  origin: "human", changeReason: "fixture", createdAt: "2026-10-01T09:00:00.000Z", createdBy: "dono",
  payload: {
    siloId: SILO, brandId: MARCA, name: "Leads sem Tráfego Pago", territoryRef: TERRITORIO, centralEntity: "Leads sem Tráfego Pago",
    pillarArticleId, supportArticleIds: ARTIGOS.map(a => a.id).filter(id => id !== pillarArticleId),
    articleReferences: ARTIGOS.map(a => ({ articleId: a.id, articleDnaVersionId: `adna-${a.slug}-v2`, articleDnaContentHash: HASH, role: "Suporte" })),
    articleRoles: ARTIGOS.map(a => ({ articleId: a.id, role: "Suporte", reason: "formação" })),
    /* A ordem narrativa põe "como captar" antes de "captação": a posição do Suporte sai daqui. */
    narrativeOrder: pillarArticleId ? [pillarArticleId, ARTIGOS[2].id, ARTIGOS[1].id] : ARTIGOS.map(a => a.id),
    includedTopics: [], excludedTopics: [], territoryNarrative: null,
    ...extra,
  },
});

function radarDe(silo: ReturnType<typeof siloDna>, siloIdNoArtigo: string | null = SILO, fontes: unknown[] = FONTES) {
  const versoes = ARTIGOS.map(a => envelope(a, 2, siloIdNoArtigo));
  const handoff = buildRadarHandoffContexts({ articles: versoes as never, siloVersions: [silo] as never, siloPageVersions: [], graphs: [] });
  const contexto = Object.fromEntries(handoff.eligible.map(entry => [entry.articleId, { silo: entry.silo, internalLinks: null, serpProvenance: null }]));
  const itens = importArticlesToRadar([], versoes as never, MARCA, "2026-10-08T10:00:00.000Z", fontes as never, {}, {}, {}, contexto as never);
  return { versoes, itens: itens as any[] };
}

const CONTAGENS = { total: 0, primary: 0, support: 0, format: 0, pending: 0, excluded: 0, own: 0 };
const r3De = (item: any, versao: any, siloRole?: ReturnType<typeof radarArticleSiloRole>) => buildRadarR3Model({
  row: item, article: versao, keyword: item.title, silo: "Leads sem Tráfego Pago", publication: "Publicado e protegido",
  view: null, records: [], analysis: null, referenceCounts: CONTAGENS, references: [], analysisQueue: 0, pagesAnalyzed: 0,
  reportGenerated: false, reportApproved: false, sentToWriter: false, serpStatus: "Não coletada", siloRole,
} as never);

/*
 * A régua como a planilha a chama (radar-page.tsx), com o SiloDNA vigente de `pipeline.siloVersions`.
 * 2026-10-08 (revisão) · o Silo resolvido pelo handoff (`siloId`) vem antes do da hidratação.
 */
const papelDaPlanilha = (item: any, versao: any, siloVersions: Record<string, unknown>) => radarArticleSiloRole({
  articleId: item.articleId, brandId: item.brandId, siloId: item.siloId || item.hydration?.silo?.id, unitType: item.unitType,
  siloDna: radarCurrentSiloDna(siloVersions as never, item.siloId || item.hydration?.silo?.id, item.brandId),
  hydrationSilo: item.hydration?.silo ?? null, formationHint: versao.payload.hierarchy || item.hierarchy,
});

/* ================================ 1 · o caso do dono ================================ */

test("1 · Pilar no SiloDNA e 'Suporte' no ArticleDNA: o Radar mostra Pilar em todas as superfícies", () => {
  const silo = siloDna(PILAR);
  const { versoes, itens } = radarDe(silo);
  const autoridade = resolveSiloHierarchyView({ siloDna: silo.payload as never, siloPage: null, articleIdentity: new Map() }).roleByArticleId;
  assert.equal(autoridade.get(PILAR), "PILAR", "a régua do Arquiteto diz PILAR");
  assert.ok(itens.every(item => item.hierarchy === "Suporte"), "o transporte continua dizendo Suporte (sugestão da formação) — e não é lido como papel");

  const esperado = ["Pilar", "Suporte", "Suporte"];
  itens.forEach((item, indice) => {
    const versao = versoes[indice];
    const papel = papelDaPlanilha(item, versao, { [SILO]: silo });
    assert.equal(papel.role, esperado[indice], `${ARTIGOS[indice].kw}: régua`);
    assert.equal(papel.source, "SILO_DNA");

    /* planilha (coluna Artigo), perfil ("Silo / função"), Workbench ("Função") e R3: model.hierarchy */
    const r3 = r3De(item, versao, papel);
    assert.equal(r3.hierarchy, esperado[indice], `${ARTIGOS[indice].kw}: R3/planilha/perfil`);
    assert.equal(r3.content.rows.find(row => row.data === "Função")?.value, esperado[indice]);
    assert.match(r3.content.rows.find(row => row.data === "Função")?.source || "", /SiloDNA/);

    /* coluna Conteúdo e faixa do ArticleDNA */
    const contexto = buildRadarArticleResearchContext({ item, article: versao as never, siloDna: silo as never });
    assert.equal(buildRadarArticleDnaSummary(contexto).role, esperado[indice], `${ARTIGOS[indice].kw}: Conteúdo`);
    assert.equal(radarResearchContextSiloRole(contexto).role, esperado[indice]);
    /* o hash do dossiê depende destes dois: eles continuam como vieram */
    assert.equal(contexto.article.hierarchy, "Suporte");

    /* "Função no silo" do contexto KGR */
    const kgr = buildRadarKgrStrategy({ article: versao.payload as never, context: item.arquitetoStrategyContext || null, published: true, slug: item.slug, siloName: "Leads sem Tráfego Pago", pillarArticleId: silo.payload.pillarArticleId, siloRole: papel });
    assert.equal(kgr?.hierarchy.role, indice === 0 ? "pillar" : "support", `${ARTIGOS[indice].kw}: KGR`);

    /* fundamentos e contexto editorial */
    const fundamentos = buildRadarFoundationSections(contexto);
    assert.equal(fundamentos.find(secao => secao.title === "Silo")?.fields.find(campo => campo.label === "Papel do artigo no silo")?.value, esperado[indice]);
    const editorial = buildRadarEditorialContext({ item, article: versao as never, keyword: ARTIGOS[indice].kw, siloRole: papel });
    const funcao = editorial.fields.find(campo => campo.key === "funcao");
    assert.equal(funcao?.value, esperado[indice]);
    assert.equal(funcao?.source, "ARQUITETO");
  });

  /* A posição do Suporte vem da narrativeOrder do SiloDNA. */
  assert.equal(papelDaPlanilha(itens[2], versoes[2], { [SILO]: silo }).supportPosition, 1);
  assert.equal(papelDaPlanilha(itens[1], versoes[1], { [SILO]: silo }).supportPosition, 2);
});

test("1 · o contexto KGR decide pelo pillarArticleId do SiloDNA mesmo sem a régua resolvida", () => {
  const silo = siloDna(PILAR);
  const { versoes, itens } = radarDe(silo);
  const kgr = buildRadarKgrStrategy({ article: versoes[0].payload as never, context: itens[0].arquitetoStrategyContext || null, published: true, slug: itens[0].slug, pillarArticleId: PILAR });
  assert.equal(kgr?.hierarchy.role, "pillar", "pillarArticleId igual ao artigo é Pilar, e não a sugestão 'Suporte'");
  const suporte = buildRadarKgrStrategy({ article: versoes[1].payload as never, context: itens[1].arquitetoStrategyContext || null, published: true, slug: itens[1].slug, pillarArticleId: PILAR });
  assert.equal(suporte?.hierarchy.role, "support");
  /* Só a régua resolvida, sem pillarArticleId: a decisão manda, com a posição da narrativeOrder. */
  const pela = buildRadarKgrStrategy({ article: versoes[0].payload as never, context: itens[0].arquitetoStrategyContext || null, published: true, slug: itens[0].slug, siloRole: papelDaPlanilha(itens[0], versoes[0], { [SILO]: silo }) });
  assert.equal(pela?.hierarchy.role, "pillar");
  const segundo = buildRadarKgrStrategy({ article: versoes[2].payload as never, context: itens[2].arquitetoStrategyContext || null, published: true, slug: itens[2].slug, siloRole: papelDaPlanilha(itens[2], versoes[2], { [SILO]: silo }) });
  assert.deepEqual([segundo?.hierarchy.role, segundo?.hierarchy.supportOrder], ["support", 1]);
});

test("1 · sem o SiloDNA em mãos, a foto do envio responde (e em português)", () => {
  const silo = siloDna(PILAR);
  const { versoes, itens } = radarDe(silo);
  assert.equal(itens[0].hydration?.silo?.articleRole, "pillar");
  const r3 = r3De(itens[0], versoes[0]);
  assert.equal(r3.hierarchy, "Pilar");
  assert.equal(r3.siloRole?.source, "HIDRATACAO");
  const contexto = buildRadarArticleResearchContext({ item: itens[0], article: versoes[0] as never });
  assert.equal(buildRadarArticleDnaSummary(contexto).role, "Pilar");
});

test("1 · a reconciliação apaga a foto, e o SiloDNA vigente continua respondendo Pilar", () => {
  const silo = siloDna(PILAR);
  const { itens } = radarDe(silo);
  const v3 = envelope(ARTIGOS[0], 3);
  const reconciliados = reconcileRadarItems(itens as never, { [PILAR]: v3 } as never, MARCA, FONTES as never, {});
  const pilar = reconciliados.find((item: any) => item.articleId === PILAR) as any;
  assert.equal(pilar.hydration.silo?.articleRole ?? null, null, "a foto do envio some na reconciliação");
  const contexto = buildRadarArticleResearchContext({ item: pilar, article: v3 as never, siloDna: silo as never });
  assert.equal(radarResearchContextSiloRole(contexto).role, "Pilar");
  assert.equal(r3De(pilar, v3, papelDaPlanilha(pilar, v3, { [SILO]: silo })).hierarchy, "Pilar");
});

test("1 · o Pilar trocado no Arquiteto depois do envio: vale o vigente, e a foto antiga é avisada", () => {
  const { versoes, itens } = radarDe(siloDna(PILAR, 1));
  const trocado = siloDna(ARTIGOS[2].id, 2);
  const antigo = papelDaPlanilha(itens[0], versoes[0], { [SILO]: trocado });
  assert.equal(antigo.role, "Suporte");
  assert.equal(antigo.staleSnapshot, true);
  assert.match(antigo.note || "", /mudou depois do envio/);
  const novo = papelDaPlanilha(itens[2], versoes[2], { [SILO]: trocado });
  assert.equal(novo.role, "Pilar");
});

/*
 * 2026-10-08 (revisão) · O ArticleDNA TERRITORIAL (sem `siloId`) RECONCILIADO.
 *
 * O handoff resolve o Silo pelo território (`row.siloId`). Uma versão nova do
 * ArticleDNA faz a reconciliação remontar a hidratação sem o Silo resolvido:
 * `hydration.silo.id` vira o `lista_id` da keyword do Minerador. Quem lia
 * `hydration.silo.id || row.siloId` perdia o SiloDNA vigente e mostrava o
 * Pilar como "Suporte (formação)" — na planilha, no perfil, na coluna
 * Conteúdo e no `article_role` do CSV completo (servidor).
 */
test("1 · ArticleDNA territorial reconciliado com o lista_id do Minerador: o Pilar continua Pilar pelo SiloDNA", () => {
  const silo = siloDna(PILAR);
  const fontes = ARTIGOS.map(a => ({ id: `kw-${a.slug}`, keyword: a.kw, lista_id: "lista-minerador-123" }));
  const { itens } = radarDe(silo, null, fontes);
  assert.equal(itens[0].siloId, SILO, "o handoff resolveu o Silo pelo território");
  const v3 = envelope(ARTIGOS[0], 3, null);
  const [pilar] = reconcileRadarItems([itens[0]] as never, { [PILAR]: v3 } as never, MARCA, fontes as never, { [SILO]: silo } as never) as any[];
  assert.equal(pilar.hydration?.silo?.id, "lista-minerador-123", "a reconciliação troca o Silo da hidratação pelo lista_id");
  assert.equal(pilar.siloId, SILO, "e não mexe no Silo resolvido do item");

  /* planilha, perfil e R3 */
  const papel = papelDaPlanilha(pilar, v3, { [SILO]: silo });
  assert.deepEqual([papel.label, papel.source], ["Pilar", "SILO_DNA"]);
  assert.equal(r3De(pilar, v3, papel).hierarchy, "Pilar");
  /* servidor (`loadRadarCanonicalAuthorities`) e coluna Conteúdo: o contexto de pesquisa com o SiloDNA do Silo do item */
  const contexto = buildRadarArticleResearchContext({ item: pilar, article: v3 as never, siloDna: radarCurrentSiloDna([silo] as never, pilar.siloId || pilar.hydration?.silo?.id, MARCA) as never });
  assert.equal(buildRadarArticleDnaSummary(contexto).role, "Pilar");
  assert.equal(radarSiloRoleLabelOrNull(radarResearchContextSiloRole(contexto)), "Pilar", "o article_role do CSV completo");
});

/*
 * 2026-10-08 (revisão) · O ARTIGO SAIU DA COMPOSIÇÃO DO SILODNA VIGENTE.
 *
 * O envio (v1) disse "pillar" para "leads qualificados"; o SiloDNA v3 decidiu
 * outro Pilar e tirou o artigo da composição. A foto do envio não responde por
 * cima da decisão do Silo: seriam dois Pilares no mesmo Silo.
 */
test("1 · artigo fora da composição do SiloDNA vigente: sem papel, nem a foto nem a formação respondem", () => {
  const { versoes, itens } = radarDe(siloDna(PILAR, 1));
  assert.equal(itens[0].hydration?.silo?.articleRole, "pillar", "a foto do envio dizia Pilar");
  const semOArtigo = siloDna(ARTIGOS[2].id, 3, {
    supportArticleIds: [ARTIGOS[1].id],
    articleReferences: [ARTIGOS[2], ARTIGOS[1]].map(a => ({ articleId: a.id, articleDnaVersionId: `adna-${a.slug}-v2`, articleDnaContentHash: HASH, role: "Suporte" })),
    articleRoles: [ARTIGOS[2], ARTIGOS[1]].map(a => ({ articleId: a.id, role: "Suporte", reason: "formação" })),
    narrativeOrder: [ARTIGOS[2].id, ARTIGOS[1].id],
  });
  const papel = papelDaPlanilha(itens[0], versoes[0], { [SILO]: semOArtigo });
  assert.equal(papel.source, "FORA_DA_COMPOSICAO");
  assert.equal(papel.label, "Fora da composição do SiloDNA vigente");
  assert.deepEqual([papel.role, papel.decided, papel.isPillar, papel.isSupport], [null, false, false, false]);
  assert.equal(papel.pillarArticleId, ARTIGOS[2].id, "o Pilar do Silo continua dito: é outro");
  assert.equal(papel.staleSnapshot, true);
  assert.match(papel.note || "", /Resolva no Arquiteto/);
  /* o novo Pilar segue Pilar */
  assert.equal(papelDaPlanilha(itens[2], versoes[2], { [SILO]: semOArtigo }).role, "Pilar");

  /* tela: R3/Função pendente, com a fonte dita */
  const funcao = r3De(itens[0], versoes[0], papel).content.rows.find(row => row.data === "Função");
  assert.equal(funcao?.value, "Fora da composição do SiloDNA vigente");
  assert.equal(funcao?.state, "pendente");
  assert.match(funcao?.source || "", /não está na composição/);

  /* KGR (como a planilha o chama, sem reserva fora da régua): nunca "pillar" com o Pilar sendo outro */
  const kgr = buildRadarKgrStrategy({ article: versoes[0].payload as never, context: itens[0].arquitetoStrategyContext || null, published: true, slug: itens[0].slug, siloName: "Leads sem Tráfego Pago", pillarArticleId: papel.pillarArticleId, siloRole: papel });
  assert.deepEqual([kgr?.hierarchy.role, kgr?.hierarchy.pillarArticleId], ["support", ARTIGOS[2].id]);

  /* CSV completo (`article_role`) e CSV "Para escrever": o rótulo da régua, nunca "Pilar" */
  const contexto = buildRadarArticleResearchContext({ item: itens[0], article: versoes[0] as never, siloDna: semOArtigo as never });
  const rotulo = radarSiloRoleLabelOrNull(radarResearchContextSiloRole(contexto));
  assert.equal(rotulo, "Fora da composição do SiloDNA vigente");
  const entrada = entradaGoogle();
  entrada.article = { ...entrada.article, articleRole: rotulo };
  const plano = planoDoSilo().files[0].writing!;
  const foraDoPlano = { ...plano, members: plano.members.map(m => m.articleId === ARTIGO ? { ...m, role: "fora da composição do SiloDNA" } : m) };
  const linha = JSON.stringify(buildRadarWritingExportArticle(entrada, comPlanta(entrada, { topRowLabel: "Silo", filePosition: 1, silo: foraDoPlano, articleId: ARTIGO, publication: null } as never)).row);
  assert.match(linha, /Papel no Silo: Fora da composição do SiloDNA vigente/);
  assert.doesNotMatch(linha, /Papel no Silo: Pilar/);
});

/* ================================ 2 · Silo sem decisão ================================ */

test("2 · SiloDNA sem Pilar: a reserva é a formação, marcada como formação — nunca 'decisão'", () => {
  const silo = siloDna(null);
  const { versoes, itens } = radarDe(silo);
  /* O envio é binário: sem Pilar, a foto diz "support" para todos. Ela não é decisão. */
  assert.ok(itens.every(item => item.hydration?.silo?.articleRole === "support"));
  const papel = papelDaPlanilha(itens[0], versoes[0], { [SILO]: silo });
  assert.equal(papel.source, "FORMACAO");
  assert.equal(papel.decided, false);
  assert.equal(papel.role, "Suporte");
  assert.equal(papel.label, "Suporte (formação)");
  assert.equal(r3De(itens[0], versoes[0], papel).content.rows.find(row => row.data === "Função")?.state, "pendente");
});

/*
 * 2026-10-08 (revisão) · O envio grava "pillar" só para o `pillarArticleId` e
 * "support" para todo o resto — também quando o Silo do envio não tinha Pilar.
 * Sem o SiloDNA vigente para confirmar, o "Suporte" da foto não é decisão.
 */
test("2 · sem o SiloDNA vigente, o 'Suporte' da foto do envio não é decisão; o 'Pilar' da foto é", () => {
  const { versoes, itens } = radarDe(siloDna(PILAR));
  const suporte = radarArticleSiloRole({ articleId: itens[1].articleId, brandId: MARCA, siloId: SILO, hydrationSilo: itens[1].hydration?.silo ?? null, formationHint: "Suporte" });
  assert.deepEqual([suporte.label, suporte.source, suporte.decided], ["Suporte", "HIDRATACAO", false]);
  assert.match(suporte.note || "", /confirme no Arquiteto/);
  const funcao = r3De(itens[1], versoes[1]).content.rows.find(row => row.data === "Função");
  assert.equal(funcao?.state, "pendente");
  assert.match(funcao?.source || "", /confirme no Arquiteto/);
  /* O KGR é binário: a foto do Silo continua a melhor evidência, acima da sugestão da formação (aqui, "Pilar"). */
  const contextoComFormacaoPilar = { ...itens[1].arquitetoStrategyContext, hierarchy: { ...itens[1].arquitetoStrategyContext.hierarchy, role: "Pilar" } };
  const kgr = buildRadarKgrStrategy({ article: versoes[1].payload as never, context: contextoComFormacaoPilar, published: true, slug: itens[1].slug, siloRole: suporte });
  assert.equal(kgr?.hierarchy.role, "support");
  const pilar = radarArticleSiloRole({ articleId: PILAR, brandId: MARCA, siloId: SILO, hydrationSilo: itens[0].hydration?.silo ?? null, formationHint: "Suporte" });
  assert.deepEqual([pilar.label, pilar.source, pilar.decided], ["Pilar", "HIDRATACAO", true]);
  assert.equal(r3De(itens[0], versoes[0]).content.rows.find(row => row.data === "Função")?.state, "preservado");
});

test("2 · sem SiloDNA e sem foto, a formação; sem nada, nenhum papel inventado", () => {
  const formacao = radarArticleSiloRole({ articleId: "a", formationHint: "Pilar" });
  assert.deepEqual([formacao.role, formacao.source, formacao.decided], ["Pilar", "FORMACAO", false]);
  const nada = radarArticleSiloRole({ articleId: "a" });
  assert.deepEqual([nada.role, nada.source, nada.label], [null, "NENHUMA", "Papel não decidido no Silo"]);
  assert.notEqual(nada.role, "Suporte");
});

test("2 · SiloDNA de outra marca, de outro Silo ou em rascunho não empresta papel", () => {
  const outraMarca = siloDna(PILAR, 1, { brandId: "outra-marca" });
  assert.equal(radarCurrentSiloDna([outraMarca] as never, SILO, MARCA), null);
  assert.equal(radarArticleSiloRole({ articleId: PILAR, brandId: MARCA, siloId: SILO, siloDna: outraMarca as never, formationHint: "Suporte" }).source, "FORMACAO");
  const outroSilo = siloDna(PILAR, 1, { siloId: "silo:outro" });
  assert.equal(radarArticleSiloRole({ articleId: PILAR, brandId: MARCA, siloId: SILO, siloDna: outroSilo as never, formationHint: "Suporte" }).source, "FORMACAO");
  const rascunho = siloDna(PILAR, 4, { formationStatus: "draft" });
  const formado = siloDna(PILAR, 3);
  assert.equal(radarCurrentSiloDna([formado, rascunho] as never, SILO, MARCA)?.versionNumber, 3, "o vigente é o formado de maior versão");
});

test("2 · a SiloPage é a raiz do Silo, não Pilar nem Suporte", () => {
  const papel = radarArticleSiloRole({ articleId: "silo-page:x", unitType: "silo_page", formationHint: "SiloPage" });
  assert.deepEqual([papel.role, papel.source], ["SiloPage", "UNIDADE"]);
});

/* ================================ 3 · uma régua só ================================ */

test("3 · o export por Silo e a planilha respondem igual: '1 · Pilar · leads qualificados'", () => {
  const silo = siloDna(PILAR);
  const { versoes, itens } = radarDe(silo);
  const plano = planRadarSiloExport({ today: "2026-10-08", brandId: MARCA, items: itens.map(item => ({ articleId: item.articleId, siloId: item.siloId, status: "finalized", slug: item.slug, principalKeyword: item.title })), siloVersions: [silo] as never });
  const membros = plano.files[0]?.writing?.members || [];
  assert.equal(membros[0]?.role, "Pilar");
  assert.equal(membros[0]?.articleId, PILAR);
  for (const membro of membros) {
    const indice = ARTIGOS.findIndex(a => a.id === membro.articleId);
    assert.equal(membro.role, papelDaPlanilha(itens[indice], versoes[indice], { [SILO]: silo }).role, `${membro.articleId}: duas réguas`);
    assert.equal(membro.role, radarSiloDnaRoleOf(silo.payload as never, membro.articleId));
  }
});

/*
 * 2026-10-08 (revisão) · SILO SEM PILAR: o plano por Silo dava "Suporte" sem
 * marca (o papel legado de `articleRoles`, cópia da formação), e o CSV "Para
 * escrever" e o artigo-modelo, que preferem o papel do plano, diziam "devolve
 * o leitor ao Pilar" num Silo sem Pilar — enquanto a planilha dizia
 * "Suporte (formação)". Agora as quatro superfícies dizem o mesmo rótulo.
 */
test("3 · Silo sem Pilar: plano, planilha, CSV 'Para escrever' e artigo-modelo dizem '(formação)', nunca decisão", () => {
  const silo = siloDna(null);
  const { versoes, itens } = radarDe(silo);
  const plano = planRadarSiloExport({ today: "2026-10-08", brandId: MARCA, items: itens.map(item => ({ articleId: item.articleId, siloId: item.siloId, status: "finalized", slug: item.slug, principalKeyword: item.title })), siloVersions: [silo] as never });
  for (const membro of plano.files[0]?.writing?.members || []) {
    const indice = ARTIGOS.findIndex(a => a.id === membro.articleId);
    assert.equal(membro.role, "Suporte (formação)", `${membro.articleId}: o plano`);
    assert.equal(membro.role, papelDaPlanilha(itens[indice], versoes[indice], { [SILO]: silo }).label, `${membro.articleId}: plano e planilha`);
  }
  /* Sem nenhuma declaração legada, nem a formação: "Papel não decidido no Silo". */
  assert.equal(radarSiloDnaRoleOf({ ...silo.payload, articleRoles: [], articleReferences: silo.payload.articleReferences.map(({ role: _papel, ...ref }) => ref) } as never, PILAR), "Papel não decidido no Silo");

  /* A bancada do CSV "Para escrever", com o mesmo Silo sem Pilar (a formação sugeria Pilar para este artigo). */
  const semPilar = { ...SILO_DNA, payload: { ...SILO_DNA.payload, pillarArticleId: null } };
  const planoSemPilar = planRadarSiloExport({ today: EXPORTADO_EM, brandId: MARCA_DA_BANCADA, items: ITENS_DO_SILO, siloVersions: [semPilar] as never }).files[0].writing!;
  assert.equal(planoSemPilar.members.find(m => m.articleId === ARTIGO)?.role, "Pilar (formação)");
  const linha = JSON.stringify(buildRadarWritingExportArticle(entradaGoogle(), comPlanta(entradaGoogle(), { topRowLabel: "Silo", filePosition: 1, silo: planoSemPilar, articleId: ARTIGO, publication: null } as never)).row);
  assert.match(linha, /Papel no Silo: Pilar \(formação\)/);
  assert.doesNotMatch(linha, /Papel no Silo: (?:Pilar|Suporte) —/, "a sugestão não recebe o que o papel decidido pede");

  /* O artigo-modelo de um "Suporte (formação)" num Silo sem Pilar: sem "devolve o leitor ao Pilar" e sem cobrança de link ao "Pilar (formação)". */
  const comoSuporte = { ...planoSemPilar, members: planoSemPilar.members.map(m => m.articleId === ARTIGO ? { ...m, role: "Suporte (formação)" } : m.articleId === ARTIGO_AMAZON ? { ...m, role: "Pilar (formação)" } : m) };
  const brief = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle(), silo: comoSuporte, articleId: ARTIGO, publication: null });
  assert.equal(brief.article.siloRole, "Suporte (formação)");
  assert.doesNotMatch(radarArticleBlueprintPrompt(brief).user, /devolve o leitor ao Pilar/);
  const { notes } = radarSanitizeArticleBlueprint(respostaSemLinkParaOPilar(brief), brief);
  assert.ok(!notes.some(nota => /Falta o link para o Pilar/.test(nota)), "Silo sem Pilar não cobra link para a sugestão da formação");
});

test("3 · a coluna Formato não mostra o papel copiado na importação", () => {
  const { itens } = radarDe(siloDna(PILAR));
  assert.equal(itens[0].format, "Suporte", "o campo gravado não muda");
  assert.equal(radarUnitFormatLabel(itens[0]), "Artigo");
  assert.equal(radarUnitFormatLabel({ unitType: "silo_page", format: "silo_page" }), "SiloPage");
});

/*
 * 2026-10-08 (revisão) · A última vista da planilha volta do navegador com o
 * filtro Formato de antes ("Suporte"), que não casa com "Artigo"/"SiloPage" e
 * escondia todas as linhas com o seletor dizendo "Formato: Todos".
 */
test("3 · o filtro Formato guardado com um papel é de antes e é descartado", () => {
  for (const antigo of ["Suporte", "Pilar", "Reforco Narrativo", "Reforço narrativo", "support"]) assert.equal(radarFormatFilterIsLegacyRole(antigo), true, antigo);
  for (const valido of ["Artigo", "SiloPage", "", undefined]) assert.equal(radarFormatFilterIsLegacyRole(valido), false, String(valido));
  /* Nenhum valor da coluna nova é papel: o descarte nunca apaga um filtro válido. */
  const { itens } = radarDe(siloDna(PILAR));
  for (const item of [...itens, { unitType: "silo_page", format: "silo_page" }]) assert.equal(radarFormatFilterIsLegacyRole(radarUnitFormatLabel(item)), false);
  /* A fiação na planilha está no teste 5 (estrutural). */
});

/* ============================ 4 · o artigo-modelo do Pilar ============================ */

/* A IA de mentira: nenhuma seção linka o Pilar. */
function respostaSemLinkParaOPilar(brief: ReturnType<typeof buildRadarArticleBlueprintBrief>) {
  const secao = (h2: string) => ({
    h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta da seção.", h3: ["Um H3"], explain: ["O que explicar"],
    paragraphs: 3, bold: ["termo"], terms: ["termo"], evidence: [brief.evidence[0]?.id || "S1"],
    specialist: null, video: null, internalLinks: [], externalLinks: [], image: null, practical: null,
  });
  return RadarArticleBlueprintAiSchema.parse({
    keywordPlan: { reading: "A principal no H1.", principalPlacement: ["H1"], complementary: [], slugNote: null },
    reader: "Quem cuida da pele.", promise: "Uma rotina.", angle: { statement: "Rotina antes de produto.", evidence: ["S1"] },
    title: { h1: "Skincare facial passo a passo", alternatives: [], seoTitle: "Skincare facial", metaDescription: "Rotina de skincare facial." },
    opening: { readerQuestion: "Como montar uma rotina de skincare facial?", direction: "Responder em duas frases.", evidence: [] },
    sections: [secao("Limpeza"), secao("Hidratação"), secao("Proteção solar"), secao("Passo a passo")],
    closing: { turn: "Constância vence produto.", specialist: null, cta: "Conheça.", nextStep: null },
    visual: [
      { slot: "CAPA", section: null, concept: "rotina", prompt: "pia com toalha", alt: "rotina", caption: "Rotina" },
      { slot: "R1", section: "Passo a passo", concept: "limpeza", prompt: "espuma", alt: "limpeza", caption: "Limpeza" },
    ],
    eeat: ["Autor real."], warnings: [],
  });
}

test("4 · o Pilar recebe 'Papel no Silo: Pilar', sem candidato a si mesmo e sem a nota de link ao Pilar", () => {
  /* A foto do envio diz "support" (errada); o plano por Silo (SiloDNA vigente) diz Pilar — e manda. */
  const entrada = entradaGoogle();
  entrada.article = { ...entrada.article, articleRole: "support" };
  const plano = planoDoSilo().files[0].writing!;
  /* Uma duplicata do próprio artigo (outro id, mesmo slug) não pode virar destino. */
  const comDuplicata = { ...plano, members: [...plano.members, { ...plano.members.find(m => m.articleId === ARTIGO)!, articleId: "duplicata-do-pilar", role: "Pilar", position: 99 }] };
  const brief = buildRadarArticleBlueprintBrief({ entrada, silo: comDuplicata, articleId: ARTIGO, publication: null });
  assert.equal(brief.article.siloRole, "Pilar");
  assert.ok(brief.linkCandidates.every(item => !/pilar/i.test(item.role)), "o próprio Pilar (nem a duplicata pelo slug) é candidato a link");
  assert.match(radarArticleBlueprintPrompt(brief).user, /Papel no Silo: Pilar — cobre o tema com amplitude/);
  const { notes } = radarSanitizeArticleBlueprint(respostaSemLinkParaOPilar(brief), brief);
  assert.ok(!notes.some(nota => /Falta o link para o Pilar/.test(nota)), "o Pilar não recebe a cobrança de Suporte");
  /* Mesmo com um candidato "Pilar" sobrando (Silo de antes da troca), o Pilar não é cobrado de linkar outro Pilar. */
  const comPilarAntigo = { ...brief, linkCandidates: [...brief.linkCandidates, { id: "K99", label: "pilar antigo", role: "Pilar", destination: "/pilar-antigo", status: "PLANNED" as const, fromGraph: false }] };
  const { notes: notasComAntigo } = radarSanitizeArticleBlueprint(respostaSemLinkParaOPilar(comPilarAntigo), comPilarAntigo);
  assert.ok(!notasComAntigo.some(nota => /Falta o link para o Pilar/.test(nota)));
  /* O CSV "Para escrever" do mesmo artigo diz o mesmo papel — o do plano por Silo, não o da foto. */
  const linha = JSON.stringify(buildRadarWritingExportArticle(entrada, comPlanta(entrada, { topRowLabel: "Silo", filePosition: 1, silo: plano, articleId: ARTIGO, publication: null } as never)).row);
  assert.match(linha, /Papel no Silo: Pilar — cobre o tema com amplitude/);
  assert.doesNotMatch(linha, /Papel no Silo: Suporte/);
});

test("4 · o Suporte é cobrado pelo link ao Pilar", () => {
  const entrada = entradaGoogle();
  const plano = planoDoSilo().files[0].writing!;
  /* O mesmo artigo, lido como Suporte do mesmo Silo (o Pilar é o irmão). */
  const comoSuporte = { ...plano, members: plano.members.map(m => m.articleId === ARTIGO ? { ...m, role: "Suporte" } : m.articleId === ARTIGO_AMAZON ? { ...m, role: "Pilar" } : m) };
  const brief = buildRadarArticleBlueprintBrief({ entrada, silo: comoSuporte, articleId: ARTIGO, publication: null });
  assert.equal(brief.article.siloRole, "Suporte");
  assert.ok(brief.linkCandidates.some(item => /pilar/i.test(item.role)));
  const { notes } = radarSanitizeArticleBlueprint(respostaSemLinkParaOPilar(brief), brief);
  assert.ok(notes.some(nota => /Falta o link para o Pilar/.test(nota)));
  assert.equal(radarSiloRoleIsSupport("Suporte (formação)"), true, "a marca da formação não esconde o papel");
});

/* ============================ 6 · os links do grafo aprovado ============================ */

test("6 · o destino do link sai pelo nó do grafo aprovado, e não casando palavras do título", () => {
  const silo = planoDoSilo().files[0].writing!;
  /*
   * O grafo aprovado manda o Pilar de saúde para o nó "def" com a âncora
   * "produtos nivea para a pele". O irmão daquele nó não tem palavra nenhuma
   * da âncora no título; casar palavras levaria o link para "skin care nivea".
   */
  const irmao = { articleId: "article-candidate:territory:def", position: 5, title: "Hidratante facial noturno", principalKeyword: "hidratante facial noturno", slug: "hidratante-facial-noturno", role: "Suporte", statusLabel: "finalizado", inThisFile: false, reason: null };
  const contexto = { topRowLabel: "Silo", filePosition: 1, silo: { ...silo, members: [...silo.members, irmao] }, articleId: ARTIGO, publication: null };
  /* O artigo-modelo marca o mesmo irmão como "pedido pelo grafo aprovado" — pelo nó, e não pelo texto. */
  const brief = buildRadarArticleBlueprintBrief({ entrada: entradaGoogleSaude(), silo: contexto.silo as never, articleId: ARTIGO, publication: null });
  const candidato = brief.linkCandidates.find(item => item.destination === "/hidratante-facial-noturno");
  assert.equal(candidato?.fromGraph, true, "o irmão pedido pelo nó do grafo aprovado não foi marcado como do grafo");
  /*
   * 2026-10-09 · os links do CSV são os da planta: a planta que põe o link com a
   * âncora do grafo vai ao destino do nó (o candidato resolvido pelo nó), nunca
   * ao irmão que só casa palavras.
   */
  const secoes = (respostaDaPlanta(brief, {}, { semLinks: true }).sections as Array<Record<string, unknown>>)
    .map((item, indice) => (indice === 0 ? { ...item, internalLinks: [{ candidate: candidato!.id, anchor: "produtos nivea para a pele", reason: "pedido pelo grafo aprovado" }] } : item));
  const planta = plantaDe(entradaGoogleSaude(), { silo: contexto.silo as never, articleId: ARTIGO, resposta: { sections: secoes } });
  const links = buildRadarWritingExportArticle(entradaGoogleSaude(), { ...contexto, blueprint: planta } as never).row.links_internos;
  const doNo = links.split("\n").find(linha => linha.includes("âncora \"produtos nivea para a pele\"")) || "";
  assert.match(doNo, /→ Suporte "hidratante facial noturno" → \/hidratante-facial-noturno/, links);
  assert.doesNotMatch(doNo, /skin-care-nivea/);
  /* 2026-10-08 (revisão) · §13 · o nó serve à resolução, mas não sai no CSV completo. */
  const json = buildRadarPortableExportRow(entradaGoogleSaude()).internal_links_resolved_json;
  assert.ok(JSON.parse(json).length > 0, "a bancada tem links do grafo");
  assert.doesNotMatch(json, /targetNodeId|article:article-candidate|:territory:/);
});

/* ============================ 7 · o card SERP do perfil ============================ */

test("7 · o card SERP do perfil lê a investigação finalizada, não a curadoria legada", () => {
  const silo = siloDna(PILAR);
  const { versoes, itens } = radarDe(silo);
  /* O estado local R4 real, com a fila SERP parada em "Aguardando revisão" — a leitura legada que contradizia a investigação. */
  const r4 = createRadarR4LocalArticleState();
  const modelo = { ...r3De(itens[0], versoes[0], papelDaPlanilha(itens[0], versoes[0], { [SILO]: silo })), r4: { ...r4, serp: { ...r4.serp, state: "WAITING_REVIEW" } } } as never;
  const comInvestigacao = renderToStaticMarkup(createElement(RadarR3ProfileMirror, {
    model: modelo, articleHref: null, architectHref: null,
    research: { statusLabel: "Finalizado", detail: "Google · 26 de 38 analisada(s)", analyzed: 26, references: 38 },
  }));
  assert.match(comInvestigacao, /Finalizado/);
  assert.match(comInvestigacao, /26 de 38 analisada\(s\)/);
  assert.doesNotMatch(comInvestigacao, /Aguardando revisão SERP|Pendentes/);
  /* O papel do perfil é o do Silo. */
  assert.match(comInvestigacao, /Leads sem Tráfego Pago · Pilar/);
  /* Sem investigação, o card de antes. */
  const semInvestigacao = renderToStaticMarkup(createElement(RadarR3ProfileMirror, { model: modelo, articleHref: null, architectHref: null }));
  assert.match(semInvestigacao, /Pendentes/);
});

/* ============================ 5 · a fiação (estrutural) ============================ */

const semComentarios = (texto: string) => texto.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
const fonte = async (caminho: string) => semComentarios(await readFile(new URL(caminho, import.meta.url), "utf8"));

test("5 · as telas do Radar não exibem `row.hierarchy` nem `payload.hierarchy` como papel", async () => {
  for (const arquivo of ["../modules/radar/radar-page.tsx", "../modules/radar/radar-analysis-page.tsx", "../modules/radar/radar-r3-profile-mirror.tsx", "../modules/radar/radar-workbench.tsx", "../modules/radar/radar-r3-workbench.tsx", "../lib/radar/r3-workbench.ts"]) {
    const codigo = await fonte(arquivo);
    for (const achado of codigo.matchAll(/(?:row|input\.row|payload)\??\.hierarchy\b/g)) {
      const antes = codigo.slice(Math.max(0, (achado.index || 0) - 120), achado.index);
      /*
       * Só a régua lê o campo, como `formationHint`. 2026-10-08 (revisão): sem
       * exceção — o motivo "Formato editorial" do modo de análise mostrava
       * `article.payload.hierarchy` ("Formato editorial: Suporte." no Pilar).
       */
      assert.match(antes, /formationHint:[^,]*$/, `${arquivo}: hierarchy fora da régua: …${codigo.slice((achado.index || 0) - 60, (achado.index || 0) + 30)}…`);
    }
    assert.doesNotMatch(codigo, /value: row => row\.format/, `${arquivo}: a coluna Formato voltou a mostrar o papel`);
    assert.doesNotMatch(codigo, /format: (?:row\??\.format|target\.format|article\?\.payload\.hierarchy)/, `${arquivo}: o papel sugerido voltou a ser dito formato`);
  }
  const leitores = {
    "../lib/radar/operational-view.ts": /role: radarSiloRoleLabelOrNull\(radarResearchContextSiloRole\(context\)\)/,
    "../lib/radar/editorial-blueprint.ts": /siloRole: radarSiloRoleLabelOrNull\(radarResearchContextSiloRole\(input\.context\)\)/,
    "../lib/radar/editorial-article-model.ts": /siloRole: radarSiloRoleLabelOrNull\(radarResearchContextSiloRole\(context\)\)/,
    "../lib/radar/editorial-profile-model.ts": /siloRole: radarSiloRoleLabelOrNull\(radarResearchContextSiloRole\(context\)\)/,
    "../lib/server/radar-portable-export-core.ts": /articleRole: contexto \? radarSiloRoleLabelOrNull\(radarResearchContextSiloRole\(contexto\)\) : null/,
    "../lib/radar/portable-silo-export.ts": /return radarSiloDnaRoleOf\(silo, articleId\);/,
  };
  for (const [arquivo, padrao] of Object.entries(leitores)) assert.match(await fonte(arquivo), padrao, `${arquivo}: o leitor saiu da régua única`);
  /* O servidor passa os SiloDNA já lidos; o MCP recebe o Silo como o botão "Para escrever". */
  const nucleo = await fonte("../lib/server/radar-portable-export-core.ts");
  /* A chamada das autoridades, e não um dos outros dois `siloVersions` do arquivo (os do plano por Silo). */
  assert.match(nucleo, /loadRadarCanonicalAuthorities\(\{\s*brandId: input\.brandId,\s*articleId,\s*article,\s*analysis: corrente,\s*serpRecords: snapshots\.records,\s*siloVersions: artefatos\.silos,\s*\}\)/);
  /*
   * 2026-10-09 (correção) · o MCP monta pelo módulo próprio (`radarMcpMaterialForArticle`,
   * lib/server/radar-mcp-material.ts), com o Silo da seleção como o botão; a antiga
   * `radarWritingExportForArticle` saiu do núcleo.
   */
  const doMcp = await fonte("../lib/server/radar-mcp-material.ts");
  assert.match(doMcp, /readPublishedStructure: radarReadPublishedStructure,\s*selectionSiloContext: true,/);
  /* Sem `groupBy`, `montagem.plano` é null: o Silo da linha vem do plano da seleção, como na rota. */
  assert.match(doMcp, /plan: montagem\.plano, selectionPlan: montagem\.planoDaSelecao,/);
  /* A planilha resolve o papel UMA vez por linha, com o SiloDNA vigente, e o entrega a todo leitor da linha. */
  const pagina = await fonte("../modules/radar/radar-page.tsx");
  /* 2026-10-08 (revisão) · o Silo resolvido pelo handoff (`row.siloId`) antes do da hidratação, em todo ponto que acha o SiloDNA. */
  assert.match(pagina, /const siloDaLinha = radarCurrentSiloDna\(pipeline\.siloVersions, row\.siloId \|\| row\.hydration\?\.silo\?\.id, row\.brandId\);/);
  assert.match(pagina, /const papelNoSilo = radarArticleSiloRole\(\{ articleId: row\.articleId, brandId: row\.brandId, siloId: row\.siloId \|\| row\.hydration\?\.silo\?\.id, unitType: row\.unitType, siloDna: siloDaLinha,/);
  for (const [arquivo, codigo] of Object.entries({ pagina, analise: await fonte("../modules/radar/radar-analysis-page.tsx"), autoridades: await fonte("../lib/server/radar-canonical-authorities.ts"), contexto: await fonte("../lib/radar/article-research-context.ts") })) {
    assert.doesNotMatch(codigo, /hydration\?\.silo\?\.id \|\| (?:row|lido\.data|item)\.siloId|hydrationSilo\?\.id \|\| item\.siloId \|\| null,\s*unitType/, `${arquivo}: a hidratação (lista_id depois da reconciliação) passou na frente do Silo resolvido`);
  }
  /* 2026-10-08 (revisão) · o contexto KGR lê o Pilar só da régua; nada de reserva do SiloDNA por fora. */
  assert.match(pagina, /siloName: siloLabel\(row\), pillarArticleId: papelNoSilo\.pillarArticleId, siloRole: papelNoSilo \}\)/);
  assert.doesNotMatch(pagina, /papelNoSilo\.pillarArticleId \?\?/);
  /* 2026-10-08 (revisão) · o motivo "Formato editorial" grava a unidade, não o papel sugerido. */
  assert.match(pagina, /format: radarUnitFormatLabel\(target\),/);
  assert.doesNotMatch(pagina, /format: target\.format/);
  /* 2026-10-08 (revisão) · o filtro Formato guardado com um papel é descartado na planilha. */
  assert.match(await fonte("../modules/radar/radar-format-filter-legacy.tsx"), /useEffect\(\(\) => \{\s*if \(radarFormatFilterIsLegacyRole\(valor\)\) limpar\(\);\s*\}, \[valor, limpar\]\);/);
  assert.match(pagina, /<RadarFormatoFiltroLegado valor=\{grid\.filters\[formatColumn\.id\]\} limpar=\{\(\) => grid\.setFilter\(formatColumn\.id, ""\)\}\/>/);
  assert.match(pagina, /buildRadarR3Model\(\{ row, article: article \|\| null, siloRole: papelNoSilo,/);
  assert.match(pagina, /buildRadarArticleResearchContext\(\{ item: row, article: article \|\| null, siloDna: siloDaLinha \}\)/);
  assert.ok((pagina.match(/siloRole: papelNoSilo \}\)/g) || []).length >= 2, "o contexto KGR e o contexto editorial recebem a régua");
  assert.match(pagina, /research=\{pesquisaDoPerfil\(row\)\}/, "o card SERP do perfil lê a investigação");
  const analise = await fonte("../modules/radar/radar-analysis-page.tsx");
  assert.match(analise, /hierarchy: papelNoSilo\?\.label \|\| "Papel não decidido no Silo",/);
  assert.match(analise, /siloName, pillarArticleId: papelNoSilo\?\.pillarArticleId, siloRole: papelNoSilo \}\)/);
  assert.match(analise, /siloDna: radarCurrentSiloDna\(pipeline\.siloVersions, row\.siloId \|\| row\.hydration\?\.silo\?\.id, row\.brandId\),/);
  assert.match(analise, /format: row \? radarUnitFormatLabel\(row\) : "Artigo",/);
  const autoridades = await fonte("../lib/server/radar-canonical-authorities.ts");
  assert.match(autoridades, /siloDna: radarCurrentSiloDna\(input\.siloVersions \|\| \[\], lido\.data\.siloId \|\| lido\.data\.hydration\?\.silo\?\.id, input\.brandId\),/);
  assert.match(await fonte("../lib/radar/article-research-context.ts"), /siloId: item\.siloId \|\| hydrationSilo\?\.id \|\| null,\s*unitType: item\.unitType,/);
  const envio = await fonte("../lib/server/radar-writer-send.ts");
  assert.match(envio, /loadRadarCanonicalAuthorities\(\{ brandId, articleId, article, analysis, siloVersions: artefatos\.silos \}\)/);
  assert.match(envio, /const siloId = article\.payload\.siloId \|\| siloDoItem \|\| null;/);
  /*
   * 2026-10-08 (revisão) · O dossiê do Redator ficou fora da régua de propósito
   * (`observed.identity.hierarchy` e `observed.internalLinkPlan.articleRole`
   * entram no hash do dossiê, que chaveia o artigo-modelo aprovado): o
   * catálogo do MCP diz isso a quem lê o dossiê, em vez de "a mesma régua".
   */
  const catalogo = await fonte("../lib/agent/platform-catalog.ts");
  assert.match(catalogo, /observed\.identity\.hierarchy é a sugestão da formação/);
  assert.match(catalogo, /FORA da régua, de propósito: o dossiê do Redator/);
});

test("5 · o Radar não grava papel: a régua não escreve em ArticleDNA, SiloDNA nem grafo", async () => {
  const regua = await fonte("../lib/radar/silo-role.ts");
  assert.doesNotMatch(regua, /fetch\(|supabase|\.from\(|localStorage|indexedDB/i);
  const silo = siloDna(PILAR);
  const congelado = JSON.stringify(silo);
  radarArticleSiloRole({ articleId: PILAR, siloDna: silo as never, formationHint: "Suporte" });
  radarSiloDnaRoleOf(silo.payload as never, PILAR);
  assert.equal(JSON.stringify(silo), congelado, "o SiloDNA lido sai como entrou");
});
