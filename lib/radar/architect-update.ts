/**
 * ===== F5 · O RADAR ACOMPANHA O ARQUITETO (SDD acelerar-fluxo-do-plano 2026-10-13, item 14) =====
 *
 * O item do Radar transporta a versão do ArticleDNA que o Arquiteto ENVIOU
 * (`radarCurrentArticleDnaVersion` com `transportedVersionId`). Quando o
 * Arquiteto aprova uma versão nova do mesmo artigo ("Gravar melhorias", plano,
 * conversão do Assunto), o item NÃO muda sozinho: a investigação, a planta e o
 * pacote foram feitos sobre a versão transportada.
 *
 * Este domínio decide, só lendo:
 *   1. se há "Atualização disponível do Arquiteto" (rótulo PRÓPRIO, eixo de
 *      transferência — distinto do "Atualização disponível" da publicação em
 *      `editorial-identity.ts`, que é identidade de publicação e não muda);
 *   2. o que mudou (principal, slug, keywords, papéis, promessa/escopo, Assunto,
 *      papel no Silo, intenção) e a classe da mudança;
 *   3. o que a adoção reaproveita, o que fica para refazer e o que custa;
 *   4. quando a adoção é recusada (investigação congelada, pacote enviado,
 *      slug publicado que mudaria);
 *   5. o payload do item adotado (os campos do Arquiteto vêm do MESMO
 *      `importArticlesToRadar` do envio; o que é do Radar fica) e o patch da
 *      versão nova da análise.
 *
 * Regras do dono: o Radar se adapta ao Arquiteto, nunca exige reenvio nem mexe
 * nele; não reagrupa, não troca a principal por conta própria e não altera
 * slug, canonical nem URL publicada. A adoção é decisão humana sobre a prévia.
 *
 * Domínio puro: sem servidor, sem banco, sem provider, sem IA.
 */

import type { ArticleDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import { canonicalJson, contentHash } from "../arquiteto/versioning.ts";
import type { RadarItem } from "../editorial/operational-flow.ts";
import type { RadarAnalysisPayload } from "./analysis-contracts.ts";
import { buildRadarResetPayload } from "./radar-reset.ts";
import { radarDeclaredArticleIntent } from "./editorial-identity.ts";

/* ================================ o rótulo ================================ */

/** O rótulo do eixo de transferência. NÃO é o "Atualização disponível" da publicação. */
export const RADAR_ARCHITECT_UPDATE_LABEL = "Atualização disponível do Arquiteto";

export const radarArchitectUpdateLabel = (fromVersionNumber: number, toVersionNumber: number) =>
  `${RADAR_ARCHITECT_UPDATE_LABEL} · v${fromVersionNumber} → v${toVersionNumber}`;

export const RADAR_ARCHITECT_ADOPT_BUTTON = "Adotar a versão nova";

/* ============================== a classificação ============================ */

export type RadarArchitectUpdateClass = "same_research_basis" | "composition_changed" | "principal_changed";

export const RADAR_ARCHITECT_UPDATE_CLASS_LABEL: Record<RadarArchitectUpdateClass, string> = {
  same_research_basis: "Mesma base de pesquisa: a SERP e as evidências continuam valendo",
  composition_changed: "Composição mudou (principal igual): vale o que foi coletado das keywords que ficaram",
  principal_changed: "A principal ou o slug mudou: a pesquisa do Google da principal precisa ser refeita",
};

export type RadarArchitectUpdateChangeField =
  | "principal" | "slug" | "keywords_added" | "keywords_removed" | "keyword_roles" | "keyword_qualification"
  | "promise" | "scope" | "subject" | "silo_role" | "intent";

export type RadarArchitectUpdateChange = {
  field: RadarArchitectUpdateChangeField;
  label: string;
  before: string | null;
  after: string | null;
};

type Referencia = ArticleDNA["keywordReferences"][number];

const ROLE_LABEL: Record<Referencia["role"], string> = {
  principal: "principal",
  secundaria: "secundária",
  reforco_narrativo: "reforço narrativo",
};

/** O texto da keyword que a referência carrega (o snapshot do KeywordDNA); sem ele, o id. */
export function radarArchitectKeywordText(reference: Referencia): string {
  const snapshot = reference.keywordDnaSnapshot?.sourceKeywordSnapshot as Record<string, unknown> | undefined;
  const texto = typeof snapshot?.keyword === "string" ? snapshot.keyword.trim() : "";
  return texto || reference.keywordId;
}

const lista = (valores: readonly string[]) => valores.length ? valores.join(", ") : null;
const igual = (a: unknown, b: unknown) => canonicalJson(a ?? null) === canonicalJson(b ?? null);

/**
 * O QUE MUDOU entre a versão transportada (vN) e a vigente aprovada (vM), e a
 * classe da mudança.
 *
 *   - `principal_changed`: a principal ou o slug mudou. A SERP canônica do
 *     artigo é a da principal: ela precisa ser refeita (Vídeos e Especialista
 *     ficam, como no RESET).
 *   - `composition_changed`: entraram ou saíram keywords, mudou o papel de uma
 *     delas ou a qualificação (KeywordDNA) que a investigação leu; a principal
 *     é a mesma. Vale o que foi coletado das que ficaram; o resto pede coleta.
 *   - `same_research_basis`: principal, conjunto, papéis, qualificação e slug
 *     iguais (mudou promessa, escopo, papel no Silo, Assunto, intenção…). A
 *     SERP e as evidências continuam válidas.
 */
export function classifyArchitectUpdate(from: ArticleDNA, to: ArticleDNA): {
  classification: RadarArchitectUpdateClass;
  changes: RadarArchitectUpdateChange[];
} {
  const changes: RadarArchitectUpdateChange[] = [];
  const refsAntes = new Map(from.keywordReferences.map(reference => [reference.keywordId, reference]));
  const refsDepois = new Map(to.keywordReferences.map(reference => [reference.keywordId, reference]));
  const principalAntes = refsAntes.get(from.principalKeywordId);
  const principalDepois = refsDepois.get(to.principalKeywordId);

  const principalMudou = from.principalKeywordId !== to.principalKeywordId;
  if (principalMudou) {
    changes.push({
      field: "principal", label: "Keyword principal",
      before: principalAntes ? radarArchitectKeywordText(principalAntes) : from.principalKeywordId,
      after: principalDepois ? radarArchitectKeywordText(principalDepois) : to.principalKeywordId,
    });
  }
  const slugMudou = from.suggestedSlug !== to.suggestedSlug;
  if (slugMudou) changes.push({ field: "slug", label: "Slug", before: `/${from.suggestedSlug}`, after: `/${to.suggestedSlug}` });

  const entraram = to.keywordReferences.filter(reference => !refsAntes.has(reference.keywordId));
  const sairam = from.keywordReferences.filter(reference => !refsDepois.has(reference.keywordId));
  if (entraram.length) changes.push({ field: "keywords_added", label: "Keywords que entraram", before: null, after: lista(entraram.map(reference => `${radarArchitectKeywordText(reference)} (${ROLE_LABEL[reference.role]})`)) });
  if (sairam.length) changes.push({ field: "keywords_removed", label: "Keywords que saíram", before: lista(sairam.map(reference => `${radarArchitectKeywordText(reference)} (${ROLE_LABEL[reference.role]})`)), after: null });

  const papeis: string[] = [];
  const papeisDepois: string[] = [];
  const qualificacao: string[] = [];
  for (const depois of to.keywordReferences) {
    const antes = refsAntes.get(depois.keywordId);
    if (!antes) continue;
    if (antes.role !== depois.role && !(principalMudou && (antes.role === "principal" || depois.role === "principal"))) {
      papeis.push(`${radarArchitectKeywordText(depois)}: ${ROLE_LABEL[antes.role]}`);
      papeisDepois.push(`${radarArchitectKeywordText(depois)}: ${ROLE_LABEL[depois.role]}`);
    }
    if (antes.keywordDnaVersionId !== depois.keywordDnaVersionId
      || (antes.semanticQualificationRef?.versionId ?? null) !== (depois.semanticQualificationRef?.versionId ?? null)) {
      qualificacao.push(radarArchitectKeywordText(depois));
    }
  }
  if (papeis.length) changes.push({ field: "keyword_roles", label: "Papel das keywords", before: lista(papeis), after: lista(papeisDepois) });
  if (qualificacao.length) changes.push({ field: "keyword_qualification", label: "Qualificação da keyword (KeywordDNA) que a investigação leu", before: null, after: lista(qualificacao) });

  if (from.promise !== to.promise) changes.push({ field: "promise", label: "Promessa", before: from.promise, after: to.promise });
  const escopoAntes = { coverage: from.coverage, excludedSubjects: from.excludedSubjects, antiCannibalizationBoundary: from.antiCannibalizationBoundary, angle: from.angle };
  const escopoDepois = { coverage: to.coverage, excludedSubjects: to.excludedSubjects, antiCannibalizationBoundary: to.antiCannibalizationBoundary, angle: to.angle };
  if (!igual(escopoAntes, escopoDepois)) {
    changes.push({ field: "scope", label: "Escopo (cobertura, ângulo, fronteira)", before: lista(from.coverage), after: lista(to.coverage) });
  }
  const assuntoAntes = from.subject ? `${from.subject.phrase} (${from.subject.keywordId})` : null;
  const assuntoDepois = to.subject ? `${to.subject.phrase} (${to.subject.keywordId})` : null;
  if (assuntoAntes !== assuntoDepois) changes.push({ field: "subject", label: "Assunto", before: assuntoAntes, after: assuntoDepois });
  if (from.hierarchy !== to.hierarchy || (from.siloId ?? null) !== (to.siloId ?? null)) {
    changes.push({ field: "silo_role", label: "Papel no Silo", before: `${from.hierarchy}${from.siloId ? ` · ${from.siloId}` : ""}`, after: `${to.hierarchy}${to.siloId ? ` · ${to.siloId}` : ""}` });
  }
  /* A intenção declarada pela autoridade do Radar (GATE 18.6), nunca pelo campo cru. */
  const intencaoAntes = radarDeclaredArticleIntent(from);
  const intencaoDepois = radarDeclaredArticleIntent(to);
  if (intencaoAntes !== intencaoDepois) changes.push({ field: "intent", label: "Intenção", before: intencaoAntes, after: intencaoDepois });

  const classification: RadarArchitectUpdateClass = principalMudou || slugMudou
    ? "principal_changed"
    : entraram.length || sairam.length || papeis.length || qualificacao.length
      ? "composition_changed"
      : "same_research_basis";
  return { classification, changes };
}

/* ============================== a detecção ================================ */

export type RadarArchitectVersionRef = { versionId: string; versionNumber: number };

/**
 * HÁ VERSÃO NOVA? A vigente aprovada do artigo (a mesma régua do índice
 * canônico do Arquiteto) é outra versão, mais nova, do MESMO artigo e da MESMA
 * marca que a transportada. Ler não grava nada.
 */
export function detectArchitectUpdate(input: {
  brandId: string;
  articleId: string;
  transported: VersionEnvelope<ArticleDNA> | null;
  current: VersionEnvelope<ArticleDNA> | null;
}): { available: false } | { available: true; from: RadarArchitectVersionRef; to: RadarArchitectVersionRef } {
  const { transported, current } = input;
  if (!transported || !current) return { available: false };
  if (transported.versionId === current.versionId) return { available: false };
  for (const versao of [transported, current]) {
    if (versao.payload.articleId !== input.articleId || versao.payload.brandId !== input.brandId) return { available: false };
  }
  if (current.versionNumber <= transported.versionNumber) return { available: false };
  return {
    available: true,
    from: { versionId: transported.versionId, versionNumber: transported.versionNumber },
    to: { versionId: current.versionId, versionNumber: current.versionNumber },
  };
}

/* ============================ quando se recusa ============================ */

export type RadarArchitectAdoptionRefusalCode =
  | "frozen_investigation"
  | "approved_package"
  | "sent_to_writer"
  | "published_slug_change"
  | "silo_unresolved"
  | "version_integrity";

export type RadarArchitectAdoptionRefusal = { code: RadarArchitectAdoptionRefusalCode; reason: string };

type AnaliseLeve = Partial<Pick<RadarAnalysisPayload,
  "finalizedBundle" | "youtubeFrozenInvestigation" | "amazonFrozenInvestigation" | "deepResearch"
  | "approvedPackage" | "writerBundle" | "writerTransfer" | "status">> | null | undefined;

/**
 * O QUE IMPEDE A ADOÇÃO NESTA FASE.
 *
 * Investigação congelada (Google, YouTube ou Amazon), pacote aprovado ou envio
 * ao Redator: a fotografia, o artigo-modelo e o documento estão presos à versão
 * transportada (o vínculo `binding.articleDnaVersionId`). Trocar o item antes
 * de um congelamento novo deixaria os entregáveis sem base — a regra D11 é
 * "troca só depois do novo congelamento". Até lá o item segue na vN e os
 * entregáveis também. Slug de artigo publicado que mudaria: o Radar nunca muda
 * URL, slug nem canonical publicados.
 */
export function radarArchitectAdoptionRefusal(input: {
  state: string;
  analysis: AnaliseLeve;
  from: ArticleDNA;
  to: ArticleDNA;
}): RadarArchitectAdoptionRefusal | null {
  const analise = input.analysis || null;
  if (input.from.publishedIdentityRef && input.from.suggestedSlug !== input.to.suggestedSlug) {
    return { code: "published_slug_change", reason: `O artigo está publicado em /${input.from.suggestedSlug} e a versão nova traz /${input.to.suggestedSlug}: o Radar não muda URL, slug nem canonical publicados. A troca é decisão do Arquiteto com a política da principal publicada.` };
  }
  if (input.state === "sent_writer" || analise?.writerBundle || analise?.writerTransfer) {
    return { code: "sent_to_writer", reason: "O pacote já foi enviado ao Redator sobre a versão transportada: o documento fica nela. Adotar a versão nova pede um congelamento novo, que esta fase ainda não faz sozinha; até lá o item e os entregáveis seguem na versão enviada." };
  }
  if (input.state === "approved" || analise?.approvedPackage || analise?.status === "approved") {
    return { code: "approved_package", reason: "O pacote do Radar já foi aprovado sobre a versão transportada. Adotar a versão nova pede um congelamento novo; até lá o item e os entregáveis seguem na versão enviada." };
  }
  const congelados = [
    analise?.finalizedBundle || analise?.deepResearch?.finalizedAt ? "Google" : null,
    analise?.youtubeFrozenInvestigation ? "YouTube" : null,
    analise?.amazonFrozenInvestigation ? "Amazon" : null,
  ].filter((valor): valor is string => Boolean(valor));
  if (congelados.length) {
    return { code: "frozen_investigation", reason: `A investigação está congelada (${congelados.join(", ")}) sobre a versão transportada: o artigo-modelo, o CSV e o envio dependem dessa fotografia. A troca só acontece depois de um congelamento novo sobre a versão nova, que esta fase ainda não faz sozinha; até lá o item e os entregáveis seguem na versão enviada.` };
  }
  return null;
}

/* ===================== o que fica, o que refaz, o que custa ================ */

export type RadarArchitectAdoptionPlan = {
  keeps: string[];
  redo: string[];
  costs: string[];
};

export function radarArchitectAdoptionPlan(input: {
  classification: RadarArchitectUpdateClass;
  hasAnalysis: boolean;
  hasGoogleResearch: boolean;
  hasYoutubeRun: boolean;
  hasAmazonRun: boolean;
  /** O grafo aprovado já cobre a versão nova? `null` = o item não carrega links. */
  linksCoverNewVersion: boolean | null;
}): RadarArchitectAdoptionPlan {
  const keeps: string[] = [];
  const redo: string[] = [];
  const costs = ["A adoção em si não chama provider nem IA: grava o item na versão nova e uma versão nova da análise (as anteriores ficam no histórico)."];
  if (!input.hasAnalysis) {
    keeps.push("Ainda não há investigação neste item: ele só passa a transportar a versão nova.");
  } else if (input.classification === "same_research_basis") {
    keeps.push("A SERP da principal (4 lentes) e a amostra já coletada.");
    if (input.hasGoogleResearch) keeps.push("A investigação do Google em andamento, com curadoria e evidências: ela passa a valer para a versão nova.");
    keeps.push("Vídeos e Especialista ficam gravados.");
  } else if (input.classification === "composition_changed") {
    keeps.push("A SERP da principal (4 lentes) e o que foi coletado das keywords que ficaram (cache).");
    keeps.push("Vídeos e Especialista ficam gravados.");
    if (input.hasGoogleResearch) redo.push("A investigação do Google fica marcada como desatualizada: 'Refazer a pesquisa' traz as keywords novas (cache primeiro).");
    costs.push("Refazer a pesquisa pode pagar SERP das keywords novas que não estiverem no cache (4 lentes): o custo aparece no botão antes do clique.");
  } else {
    keeps.push("Vídeos e Especialista ficam gravados (como no RESET).");
    redo.push("A pesquisa do Google da principal é zerada na versão nova da análise e precisa ser refeita para a principal nova.");
    costs.push("A pesquisa nova da principal paga a SERP (4 lentes, cache primeiro): o custo aparece no botão antes do clique.");
  }
  if (input.hasAnalysis && input.hasYoutubeRun) redo.push("A coleta do YouTube em andamento foi feita sobre a versão anterior: confira antes de finalizar (refazer é decisão sua, com custo no botão).");
  if (input.hasAnalysis && input.hasAmazonRun) redo.push("A coleta da Amazon em andamento foi feita sobre a versão anterior: confira antes de finalizar (refazer é decisão sua, com custo no botão).");
  if (input.linksCoverNewVersion === true) keeps.push("Links internos: o grafo aprovado já cobre a versão nova.");
  if (input.linksCoverNewVersion === false) keeps.push("Links internos: seguem as relações aprovadas no envio; o grafo aprovado ainda não cobre a versão nova (lacuna declarada, não bloqueia).");
  keeps.push("O artigo-modelo e o CSV saem da versão nova pelo caminho de sempre, depois de finalizar a investigação.");
  return { keeps, redo, costs };
}

/* ======================== o item e a análise adotados ===================== */

/**
 * Os campos do item que vêm do ArticleDNA pelo envio (`importArticlesToRadar`).
 * O que é do Radar (id, estado, histórico de análises, datas, origem) fica.
 */
export const RADAR_ARCHITECT_ITEM_FIELDS = [
  "articleDnaVersionId", "articleDnaContentHash", "title", "slug", "siloId", "hierarchy", "principalKeywordId",
  "format", "intent", "hydration", "arquitetoKeywordDnaReferences", "arquitetoKeywordUrlRelations",
  "arquitetoArchitectureStatus", "arquitetoKgrIdentity", "arquitetoStrategyContext", "arquitetoSerpAssessment",
  "arquitetoSerpProvenance", "arquitetoInternalLinks",
] as const satisfies ReadonlyArray<keyof RadarItem>;

/** O payload gravado do item com os campos do Arquiteto trocados pelos do item construído pelo envio. */
export function radarItemPayloadAdoptingVersion(input: {
  currentPayload: Record<string, unknown>;
  built: RadarItem;
}): Record<string, unknown> {
  const proximo: Record<string, unknown> = { ...input.currentPayload };
  for (const campo of RADAR_ARCHITECT_ITEM_FIELDS) {
    const valor = input.built[campo];
    if (valor === undefined) delete proximo[campo];
    else proximo[campo] = valor;
  }
  return proximo;
}

/** As fontes de keyword para a hidratação: a do envio anterior (Minerador) — a nova keyword cai no snapshot do ArticleDNA. */
export function radarAdoptionSourceKeywords(hydration: RadarItem["hydration"] | null | undefined): Array<Record<string, unknown>> {
  return (hydration?.keywordSnapshots || []).map(snapshot => ({
    id: snapshot.canonicalKeywordId || snapshot.referenceKeywordId,
    keywordId: snapshot.referenceKeywordId,
    sourceKeywordId: snapshot.sourceKeywordId,
    originalKeywordId: snapshot.originalKeywordId,
    canonicalKeywordId: snapshot.canonicalKeywordId,
    keyword: snapshot.keyword,
    siloId: snapshot.siloId,
    siloName: snapshot.siloName,
    isPublished: snapshot.isPublished,
  }));
}

/**
 * A impressão da investigação, reapontada para a versão nova — SÓ na mesma
 * base de pesquisa. Só as duas partes do ARTIGO mudam; keywords, Silo,
 * formação e links continuam comparados pela tela, então qualquer outra
 * diferença ainda acusa "desatualizada". Formato inesperado: `null` (a
 * investigação fica como estava e a tela diz que precisa refazer).
 */
export function radarRebindResearchFingerprint<F extends { articleDnaVersionId: string; articleDnaContentHash: string | null; value: string }>(
  fingerprint: F,
  to: { versionId: string; contentHash: string },
): F | null {
  const prefixo = `${fingerprint.articleDnaVersionId}|${fingerprint.articleDnaContentHash || ""}|`;
  if (!fingerprint.value.startsWith(prefixo)) return null;
  return {
    ...fingerprint,
    articleDnaVersionId: to.versionId,
    articleDnaContentHash: to.contentHash,
    value: `${to.versionId}|${to.contentHash}|${fingerprint.value.slice(prefixo.length)}`,
  };
}

/**
 * O PATCH DA VERSÃO NOVA DA ANÁLISE, por classe.
 *
 * Sempre: a análise passa a declarar a versão nova e as decisões de keyword
 * acompanham o conjunto da versão nova (as que ficaram mantêm a decisão; as
 * novas entram como "manter"). Mesma base: a impressão da investigação é
 * reapontada. Composição mudou: a impressão fica (a tela marca para refazer,
 * cache primeiro). Principal mudou: a pesquisa do Google é zerada pelo MESMO
 * reset do Radar (Vídeos, Especialista, YouTube e Amazon ficam).
 */
export function radarAnalysisAdoptionPatch(input: {
  current: RadarAnalysisPayload;
  to: VersionEnvelope<ArticleDNA>;
  classification: RadarArchitectUpdateClass;
}): Partial<RadarAnalysisPayload> {
  const decisoes = new Map(input.current.keywordDecisions.map(decision => [decision.keywordId, decision]));
  const keywordDecisions = input.to.payload.keywordReferences.map(reference =>
    decisoes.get(reference.keywordId) ?? { keywordId: reference.keywordId, decision: "keep" as const, note: "" });
  const base: Partial<RadarAnalysisPayload> = { articleDnaVersionId: input.to.versionId, keywordDecisions };
  if (input.classification === "principal_changed") {
    const zerada = buildRadarResetPayload(input.current);
    return { ...zerada, ...base };
  }
  if (input.classification === "same_research_basis" && input.current.deepResearch) {
    const impressao = radarRebindResearchFingerprint(input.current.deepResearch.fingerprint, { versionId: input.to.versionId, contentHash: input.to.contentHash });
    if (impressao) return { ...base, deepResearch: { ...input.current.deepResearch, fingerprint: impressao } };
  }
  return base;
}

/* ============================ a prévia e o hash ============================ */

export type RadarArchitectUpdatePreviewItem = {
  articleId: string;
  itemId: string;
  lockVersion: number;
  title: string;
  slug: string;
  siloId: string | null;
  siloName: string | null;
  state: string;
  label: string;
  from: RadarArchitectVersionRef;
  to: RadarArchitectVersionRef;
  classification: RadarArchitectUpdateClass;
  classificationLabel: string;
  changes: RadarArchitectUpdateChange[];
  plan: RadarArchitectAdoptionPlan;
  adoptable: boolean;
  refusal: RadarArchitectAdoptionRefusal | null;
  /** Muda quando qualquer coisa do item ou das versões muda: a prévia vencida não confirma. */
  itemHash: string;
};

export async function radarArchitectUpdateItemHash(input: {
  articleId: string; itemId: string; lockVersion: number;
  from: RadarArchitectVersionRef; to: RadarArchitectVersionRef & { contentHash: string };
  classification: RadarArchitectUpdateClass; adoptable: boolean;
}): Promise<string> {
  return (await contentHash({ kind: "radar_architect_update_item", ...input })).replace(/^sha256:/, "");
}

/**
 * O HASH DA DECISÃO sobre um conjunto de artigos (a seleção da prévia, com a
 * recusa por item já aplicada). Ordem não importa; o mesmo conjunto dá o mesmo
 * hash na tela, na rota e no MCP.
 */
export async function radarArchitectAdoptionDecisionHash(items: ReadonlyArray<Pick<RadarArchitectUpdatePreviewItem, "articleId" | "itemHash">>): Promise<string> {
  const entradas = [...items].map(item => ({ articleId: item.articleId, itemHash: item.itemHash }))
    .sort((a, b) => a.articleId.localeCompare(b.articleId));
  return (await contentHash({ kind: "radar_architect_adoption", items: entradas })).replace(/^sha256:/, "");
}

/** Agrupa a prévia por Silo, para o lote "por Silo" (prévia + uma confirmação + recusa por item). */
export function radarArchitectUpdatesBySilo<T extends Pick<RadarArchitectUpdatePreviewItem, "siloId" | "siloName">>(items: readonly T[]): Array<{ siloId: string | null; siloName: string; items: T[] }> {
  const grupos = new Map<string, { siloId: string | null; siloName: string; items: T[] }>();
  for (const item of items) {
    const chave = item.siloId ?? "";
    const grupo = grupos.get(chave) ?? { siloId: item.siloId, siloName: item.siloName || (item.siloId ? item.siloId : "Sem Silo resolvido"), items: [] };
    grupo.items.push(item);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()].sort((a, b) => a.siloName.localeCompare(b.siloName, "pt-BR"));
}
