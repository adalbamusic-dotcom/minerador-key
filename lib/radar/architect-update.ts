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
import { RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS } from "./operational-actions.ts";
import { RADAR_SERP_RECOLLECT_CALLS } from "./serp/lens-set.ts";
import { radarReopenedGooglePatch } from "./refreeze-repair.ts";
import { radarDeclaredArticleIntent } from "./editorial-identity.ts";
import { radarSiloMeshPriority, radarSiloMeshStrongest, type RadarSiloMeshPriority } from "./silo-link-mesh.ts";

/* ================================ o rótulo ================================ */

/** O rótulo do eixo de transferência. NÃO é o "Atualização disponível" da publicação. */
export const RADAR_ARCHITECT_UPDATE_LABEL = "Atualização disponível do Arquiteto";

export const radarArchitectUpdateLabel = (fromVersionNumber: number, toVersionNumber: number) =>
  `${RADAR_ARCHITECT_UPDATE_LABEL} · v${fromVersionNumber} → v${toVersionNumber}`;

export const RADAR_ARCHITECT_ADOPT_BUTTON = "Adotar a versão nova";

/* ============================== a classificação ============================ */

/** As três classes da versão nova do ArticleDNA (F5). */
export type RadarArchitectDnaUpdateClass = "same_research_basis" | "composition_changed" | "principal_changed";

/**
 * 2026-10-14 · `links_changed`: o InternalLinkGraph aprovado vigente do Silo é
 * mais novo que o grafo transportado pelo item (decisão do dono: "links não
 * mudam a SERP"). É uma atualização própria, ao lado da do ArticleDNA.
 */
export type RadarArchitectUpdateClass = RadarArchitectDnaUpdateClass | "links_changed";

export const RADAR_ARCHITECT_UPDATE_CLASS_LABEL: Record<RadarArchitectUpdateClass, string> = {
  same_research_basis: "Mesma base de pesquisa: a SERP e as evidências continuam valendo",
  composition_changed: "Composição mudou (principal igual): vale o que foi coletado das keywords que ficaram",
  principal_changed: "A principal ou o slug mudou: a pesquisa do Google da principal precisa ser refeita",
  links_changed: "Só os links internos mudaram: a SERP, a investigação e as evidências continuam valendo",
};

/** Qual atualização: a versão nova do ArticleDNA (F5) ou o grafo de links novo (2026-10-14). Ausente = ArticleDNA. */
export type RadarArchitectUpdateKind = "article_dna" | "links";

export type RadarArchitectUpdateChangeField =
  | "principal" | "slug" | "keywords_added" | "keywords_removed" | "keyword_roles" | "keyword_qualification"
  | "promise" | "scope" | "subject" | "silo_role" | "intent"
  | "links_added" | "links_removed" | "links_obligation" | "links_summary" | "links_inbound";

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
  classification: RadarArchitectDnaUpdateClass;
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

  const classification: RadarArchitectDnaUpdateClass = principalMudou || slugMudou
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
  | "version_integrity"
  /* 2026-10-14 · o grafo novo só cobre a versão nova do ArticleDNA: os links chegam com a adoção dela. */
  | "links_follow_article_version";

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
  /**
   * 2026-10-18 · Quem chama continua o congelamento novo na tela ("Ver e
   * adotar" do Radar). Com ele, a investigação do Google congelada (enviada ou
   * não ao Redator) é adotável quando a principal e o slug ficam: a mesma
   * confirmação pesquisa só o que falta, congela de novo e organiza o
   * artigo-modelo. Sem ele (MCP), a recusa é a de antes.
   */
  allowRefreeze?: boolean;
}): RadarArchitectAdoptionRefusal | null {
  const analise = input.analysis || null;
  if (input.from.publishedIdentityRef && input.from.suggestedSlug !== input.to.suggestedSlug) {
    return { code: "published_slug_change", reason: `O artigo está publicado em /${input.from.suggestedSlug} e a versão nova traz /${input.to.suggestedSlug}: o Radar não muda URL, slug nem canonical publicados. A troca é decisão do Arquiteto com a política da principal publicada.` };
  }
  const refaz = radarArchitectAdoptionRefreezes(input);
  const pelaTela = classifyArchitectUpdate(input.from, input.to).classification !== "principal_changed" && radarGoogleFrozenOf(analise);
  if (!refaz && (input.state === "sent_writer" || analise?.writerBundle || analise?.writerTransfer)) {
    return { code: "sent_to_writer", reason: pelaTela
      ? "O pacote já foi enviado ao Redator sobre a versão transportada: o documento fica nela. A adoção com congelamento novo é feita na tela do Radar ('Ver e adotar' → 'Adotar a versão nova'), que diz o custo antes; depois, o Redator mostra 'Atualização disponível'. Até lá o item e os entregáveis seguem na versão enviada."
      : "O pacote já foi enviado ao Redator sobre a versão transportada: o documento fica nela. Adotar a versão nova pede um congelamento novo, que esta fase ainda não faz sozinha; até lá o item e os entregáveis seguem na versão enviada." };
  }
  if (input.state === "approved" || analise?.approvedPackage || analise?.status === "approved") {
    return { code: "approved_package", reason: "O pacote do Radar já foi aprovado sobre a versão transportada. Adotar a versão nova pede um congelamento novo; até lá o item e os entregáveis seguem na versão enviada." };
  }
  const congelados = [
    analise?.finalizedBundle || analise?.deepResearch?.finalizedAt ? "Google" : null,
    analise?.youtubeFrozenInvestigation ? "YouTube" : null,
    analise?.amazonFrozenInvestigation ? "Amazon" : null,
  ].filter((valor): valor is string => Boolean(valor));
  if (congelados.length && !refaz) {
    return { code: "frozen_investigation", reason: pelaTela
      ? `A investigação está congelada (${congelados.join(", ")}) sobre a versão transportada: o artigo-modelo, o CSV e o envio dependem dessa fotografia. A troca com congelamento novo sobre a versão nova é feita na tela do Radar ('Ver e adotar' → 'Adotar a versão nova'), que diz o custo antes; até lá o item e os entregáveis seguem na versão enviada.`
      : `A investigação está congelada (${congelados.join(", ")}) sobre a versão transportada: o artigo-modelo, o CSV e o envio dependem dessa fotografia. A troca só acontece depois de um congelamento novo sobre a versão nova, que esta fase ainda não faz sozinha; até lá o item e os entregáveis seguem na versão enviada.` };
  }
  return null;
}

/** A investigação do Google está congelada (a fotografia canônica do pacote)? */
export const radarGoogleFrozenOf = (analise: AnaliseLeve) => Boolean(analise?.finalizedBundle || analise?.deepResearch?.finalizedAt);

/**
 * 2026-10-18 · A ADOÇÃO COM CONGELAMENTO NOVO (defeito do teste real, WifiConecta).
 *
 * "Melhorar publicados…" acrescentou keywords ao Suporte (v2 → v3, principal
 * igual) e o Radar recusava a adoção porque a investigação estava congelada:
 * o artigo finalizado nunca recebia a melhoria do Arquiteto e ia ao Redator
 * com a composição velha. Agora, na tela, a adoção vale quando o Google está
 * congelado e a principal e o slug ficam — a MESMA confirmação leva o item à
 * versão nova, reabre a investigação numa versão nova da análise (a fotografia
 * antiga fica no histórico), pesquisa só o que falta, congela de novo pelo
 * "Finalizar" de sempre e organiza o artigo-modelo. Principal ou slug novo
 * continua recusado aqui: a pesquisa da principal recomeça, decisão do artigo.
 * Pacote aprovado (fluxo antigo de aprovação) continua recusado.
 */
export function radarArchitectAdoptionRefreezes(input: { analysis: AnaliseLeve; from: ArticleDNA; to: ArticleDNA; allowRefreeze?: boolean }): boolean {
  if (!input.allowRefreeze || !radarGoogleFrozenOf(input.analysis)) return false;
  if (input.from.publishedIdentityRef && input.from.suggestedSlug !== input.to.suggestedSlug) return false;
  return classifyArchitectUpdate(input.from, input.to).classification !== "principal_changed";
}

/* ===================== o que fica, o que refaz, o que custa ================ */

/**
 * 2026-10-18 · O CONGELAMENTO NOVO QUE A MESMA CONFIRMAÇÃO FAZ (investigação
 * do Google congelada, principal e slug iguais). A tela segue, depois da
 * releitura da adoção, pelo MESMO "Pesquisar e finalizar" do lote: pesquisa só
 * o que falta (cache primeiro, 4 lentes), analisa, congela pelo "Finalizar" de
 * sempre e organiza o artigo-modelo ("só se faltar").
 */
export type RadarArchitectRefreezePlan = {
  /** As keywords que entraram e ainda não têm SERP auxiliar gravada. */
  newKeywords: string[];
  /** Consultas que a pesquisa pode pagar: a principal (se faltar) e as auxiliares que faltam. */
  queriesToCollect: number;
  /** Teto DataForSEO: consultas × 4 lentes (cache primeiro: lente válida no cache não é paga). */
  serpCallsCeiling: number;
  /** Teto de IA do artigo-modelo. */
  aiCallsCeiling: number;
  /** O pacote já foi enviado ao Redator: o documento de lá não muda. */
  sentToWriter: boolean;
};

export type RadarArchitectAdoptionPlan = {
  keeps: string[];
  redo: string[];
  costs: string[];
  /** 2026-10-18 · presente quando a confirmação também congela de novo (ausente = a adoção de antes). */
  refreeze?: RadarArchitectRefreezePlan | null;
};

/** O que a prévia sabe para o congelamento novo (leitura da investigação gravada). */
export type RadarArchitectRefreezeInput = {
  sentToWriter: boolean;
  /** A SERP da principal tem evidência gravada (reaproveitada sem cobrança). */
  canonicalReused: boolean;
  /** Keywords que entraram, sem SERP auxiliar gravada. */
  newKeywords: string[];
  /** Auxiliares das keywords que ficaram e que ainda não têm evidência (nunca coletadas ou falharam). */
  keptAuxiliaryMissing: number;
  /** Auxiliares das keywords que ficaram, com evidência gravada (reaproveitadas). */
  keptAuxiliaryReused: number;
  youtubeFrozen: boolean;
  amazonFrozen: boolean;
  fromVersionNumber: number;
  toVersionNumber: number;
};

export function radarArchitectRefreezePlan(input: RadarArchitectRefreezeInput): RadarArchitectRefreezePlan {
  const consultas = (input.canonicalReused ? 0 : 1) + input.newKeywords.length + Math.max(0, Math.trunc(input.keptAuxiliaryMissing));
  return {
    newKeywords: [...input.newKeywords],
    queriesToCollect: consultas,
    serpCallsCeiling: consultas * RADAR_SERP_RECOLLECT_CALLS,
    aiCallsCeiling: RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS,
    sentToWriter: input.sentToWriter,
  };
}

/** As linhas da prévia do congelamento novo: o que é reaproveitado, o que é coletado, a IA e o teto. */
function planoDoCongelamentoNovo(input: {
  classification: RadarArchitectDnaUpdateClass;
  refreeze: RadarArchitectRefreezeInput;
  linksCoverNewVersion: boolean | null;
}): RadarArchitectAdoptionPlan {
  const dados = input.refreeze;
  const plano = radarArchitectRefreezePlan(dados);
  const keeps: string[] = [
    dados.canonicalReused
      ? "Reaproveitado, sem nova cobrança: a SERP da principal (4 lentes) já gravada."
      : "A SERP da principal não tem evidência gravada: ela entra na coleta abaixo (cache primeiro, 4 lentes).",
  ];
  if (dados.keptAuxiliaryReused) keeps.push(`Reaproveitado, sem nova cobrança: a SERP auxiliar de ${dados.keptAuxiliaryReused} keyword(s) que ficaram.`);
  keeps.push("Reaproveitado: as páginas da concorrência já lidas; Vídeos e Especialista ficam gravados.");
  if (dados.youtubeFrozen || dados.amazonFrozen) keeps.push(`O congelamento ${[dados.youtubeFrozen ? "do YouTube" : null, dados.amazonFrozen ? "da Amazon" : null].filter(Boolean).join(" e ")} fica como está (não depende das keywords do artigo).`);
  keeps.push(`Histórico: a investigação congelada e o artigo-modelo da v${dados.fromVersionNumber} ficam no histórico; nada é apagado.`);
  if (dados.sentToWriter) keeps.push("O documento do Redator não muda: depois do congelamento novo, 'Enviar ao Redator' mostra lá 'Atualização disponível' (a base não é substituída sem decisão).");
  if (input.linksCoverNewVersion === true) keeps.push("Links internos: o grafo aprovado vigente já cobre a versão nova e vem junto na adoção (links não mudam a SERP).");
  if (input.linksCoverNewVersion === false) keeps.push("Links internos: seguem as relações aprovadas no envio; o grafo aprovado ainda não cobre a versão nova (lacuna declarada, não bloqueia).");
  const coletar = input.classification === "composition_changed"
    ? plano.queriesToCollect
      ? `2. "Refazer Pesquisa Google" coleta só o que falta: ${[
        ...(dados.canonicalReused ? [] : ["a SERP da principal"]),
        ...(dados.newKeywords.length ? [`a SERP das keywords novas (${dados.newKeywords.join(", ")})`] : []),
        ...(dados.keptAuxiliaryMissing ? [`${dados.keptAuxiliaryMissing} auxiliar(es) que ainda não tinham resultado`] : []),
      ].join(", ")} — cache primeiro, 4 lentes.`
      : "2. \"Refazer Pesquisa Google\" sem coleta nova: tudo o que a composição nova pede já está gravado."
    : "2. Sem pesquisa nova: a investigação gravada vale para a versão nova (mesma base de pesquisa).";
  const redo = [
    `1. O item passa para a v${dados.toVersionNumber} do ArticleDNA, com a principal, o slug e o canonical de sempre, e a investigação é reaberta numa versão nova da análise.`,
    coletar,
    `3. A concorrência é analisada e a investigação é congelada de novo sobre a v${dados.toVersionNumber}, pelo mesmo "Finalizar" de sempre.`,
    "4. O artigo-modelo da SERP é organizado de novo para o pacote novo.",
    "5. O servidor relê cada passo; o artigo que parar diz o motivo e continua pelo botão dele.",
  ];
  const costs = [
    plano.serpCallsCeiling
      ? `DataForSEO: no máximo ${plano.serpCallsCeiling} chamada(s) (${plano.queriesToCollect} consulta(s) × 4 lentes); cache primeiro: lente válida no cache não é paga.`
      : "DataForSEO: nada a pagar (nenhuma consulta nova).",
    `IA: até ${plano.aiCallsCeiling} chamada(s) para organizar o artigo-modelo.`,
    "A leitura das páginas da concorrência não consulta o buscador.",
  ];
  return { keeps, redo, costs, refreeze: plano };
}

export function radarArchitectAdoptionPlan(input: {
  classification: RadarArchitectDnaUpdateClass;
  hasAnalysis: boolean;
  hasGoogleResearch: boolean;
  hasYoutubeRun: boolean;
  hasAmazonRun: boolean;
  /** O grafo aprovado já cobre a versão nova? `null` = o item não carrega links. */
  linksCoverNewVersion: boolean | null;
  /** 2026-10-18 · a confirmação também congela de novo (investigação do Google congelada, principal igual). */
  refreeze?: RadarArchitectRefreezeInput | null;
}): RadarArchitectAdoptionPlan {
  if (input.refreeze && input.hasAnalysis && input.classification !== "principal_changed") {
    return planoDoCongelamentoNovo({ classification: input.classification, refreeze: input.refreeze, linksCoverNewVersion: input.linksCoverNewVersion });
  }
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
  if (input.linksCoverNewVersion === true) keeps.push("Links internos: o grafo aprovado vigente já cobre a versão nova e vem junto na adoção (links não mudam a SERP).");
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
  classification: RadarArchitectDnaUpdateClass;
  /**
   * 2026-10-18 · a adoção com congelamento novo: a investigação do Google é
   * REABERTA nesta versão nova da análise (sem a fotografia e sem o carimbo de
   * finalização — o mesmo `radarReopenedGooglePatch` do "Reparar
   * congelamento"). A fotografia antiga fica na versão anterior, no histórico.
   */
  refreeze?: boolean;
}): Partial<RadarAnalysisPayload> {
  const decisoes = new Map(input.current.keywordDecisions.map(decision => [decision.keywordId, decision]));
  const keywordDecisions = input.to.payload.keywordReferences.map(reference =>
    decisoes.get(reference.keywordId) ?? { keywordId: reference.keywordId, decision: "keep" as const, note: "" });
  const base: Partial<RadarAnalysisPayload> = { articleDnaVersionId: input.to.versionId, keywordDecisions };
  if (input.classification === "principal_changed") {
    const zerada = buildRadarResetPayload(input.current);
    return { ...zerada, ...base };
  }
  let deepResearch = input.current.deepResearch;
  let reapontada = false;
  if (input.classification === "same_research_basis" && deepResearch) {
    const impressao = radarRebindResearchFingerprint(deepResearch.fingerprint, { versionId: input.to.versionId, contentHash: input.to.contentHash });
    if (impressao) { deepResearch = { ...deepResearch, fingerprint: impressao }; reapontada = true; }
  }
  if (input.refreeze) return { ...base, ...radarReopenedGooglePatch(deepResearch) };
  return reapontada ? { ...base, deepResearch } : base;
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
  /** 2026-10-14 · ausente = "article_dna" (o leitor de antes segue igual). */
  updateKind?: RadarArchitectUpdateKind;
  label: string;
  /** Na atualização de links, `from` e `to` são a versão transportada do ArticleDNA (ela não muda). */
  from: RadarArchitectVersionRef;
  to: RadarArchitectVersionRef;
  /** 2026-10-14 · só na atualização de links: o grafo transportado e o vigente. */
  graph?: RadarArchitectGraphChange | null;
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
  /** 2026-10-14 · o grafo vigente que vem junto na adoção (só quando há; sem ele, o hash é o de antes). */
  linksGraphVersionId?: string | null;
}): Promise<string> {
  const { linksGraphVersionId, ...resto } = input;
  return (await contentHash({ kind: "radar_architect_update_item", ...resto, ...(linksGraphVersionId ? { linksGraphVersionId } : {}) })).replace(/^sha256:/, "");
}

/**
 * O HASH DA DECISÃO sobre um conjunto de artigos (a seleção da prévia, com a
 * recusa por item já aplicada). Ordem não importa; o mesmo conjunto dá o mesmo
 * hash na tela, na rota e no MCP.
 */
export async function radarArchitectAdoptionDecisionHash(items: ReadonlyArray<Pick<RadarArchitectUpdatePreviewItem, "articleId" | "itemHash">>): Promise<string> {
  /* 2026-10-14 · o mesmo artigo pode vir duas vezes (ArticleDNA e links): o hash do item desempata. */
  const entradas = [...items].map(item => ({ articleId: item.articleId, itemHash: item.itemHash }))
    .sort((a, b) => a.articleId.localeCompare(b.articleId) || a.itemHash.localeCompare(b.itemHash));
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

/* ====================== 2026-10-14 · O GRAFO DE LINKS NOVO ====================== */

/*
 * "ATUALIZAÇÃO DISPONÍVEL DO ARQUITETO · LINKS" — decisão do dono, 2026-10-14:
 * "estender a 'Atualização disponível do Arquiteto' do Radar para avisar também
 * quando o grafo de links muda. Você adota com um clique, sem reenviar nada e
 * sem refazer a pesquisa, porque links não mudam a SERP. Isso segue a regra de
 * que o Radar se adapta ao Arquiteto."
 *
 * O item transporta o grafo do envio (`arquitetoInternalLinks`). Quando o
 * InternalLinkGraph aprovado vigente do Silo do artigo é outro (a malha da F4
 * aprovada, um rebase) e cobre a versão transportada do ArticleDNA, o item
 * mostra a atualização de links. Adotar troca SÓ o grafo transportado: a
 * investigação, a SERP, as evidências, o pacote congelado e a planta ficam; o
 * artigo-modelo e o CSV leem a malha nova na leitura (D6, `silo-link-mesh.ts`).
 * Diferente da versão nova do ArticleDNA, vale também para item finalizado,
 * aprovado ou enviado ao Redator.
 */

export const radarArchitectLinksUpdateLabel = (fromGraphVersionNumber: number | null, toGraphVersionNumber: number) =>
  `${RADAR_ARCHITECT_UPDATE_LABEL} · links · grafo ${fromGraphVersionNumber === null ? "do envio" : `v${fromGraphVersionNumber}`} → v${toGraphVersionNumber}`;

export const RADAR_ARCHITECT_ADOPT_LINKS_BUTTON = "Adotar os links novos";

/** O campo do item que vem do grafo. O que deriva dele (obrigação, trilha, âncoras) é lido na hora, não gravado. */
export const RADAR_ARCHITECT_LINK_FIELDS = ["arquitetoInternalLinks"] as const satisfies ReadonlyArray<keyof RadarItem>;

export type RadarArchitectGraphChange = {
  graphId: string;
  fromGraphVersionId: string | null;
  fromGraphVersionNumber: number | null;
  toGraphVersionId: string;
  toGraphVersionNumber: number;
  toGraphContentHash: string;
};

type LinksDoItem = NonNullable<RadarItem["arquitetoInternalLinks"]>;

/** O que a prévia sabe de cada nó do grafo: o nome e o papel. */
export type RadarArchitectGraphNodeInfo = { label: string; role: string | null };

const nomeDoNo = (nodeId: string, nos: ReadonlyMap<string, RadarArchitectGraphNodeInfo>) =>
  nos.get(nodeId)?.label || (nodeId.startsWith("silo-page:") ? "SiloPage do Silo" : nodeId.replace(/^article:/, ""));

const papelPeloNo = (nodeId: string, nos: ReadonlyMap<string, RadarArchitectGraphNodeInfo>) =>
  nos.get(nodeId)?.role ?? (nodeId.startsWith("silo-page:") ? "SiloPage" : null);

const OBRIGACAO_CURTA: Readonly<Record<RadarSiloMeshPriority, string>> = {
  HIGH: "obrigatório no corpo",
  MEDIUM: "no corpo se a seção tratar; senão trilha",
  LOW: "trilha",
};

/** Os destinos de saída e a obrigação de cada um pela régua do Radar (D2: o mínimo estrutural e o `priority` do grafo). */
function saidasComObrigacao(links: LinksDoItem | null | undefined, articleRole: string | null | undefined, nos: ReadonlyMap<string, RadarArchitectGraphNodeInfo>) {
  const saidas = new Map<string, RadarSiloMeshPriority>();
  for (const aresta of links?.edges || []) {
    if (aresta.direction !== "outbound") continue;
    const obrigacao = radarSiloMeshPriority({ articleRole, targetRole: papelPeloNo(aresta.targetNodeId, nos), graphPriority: aresta.priority });
    saidas.set(aresta.targetNodeId, radarSiloMeshStrongest(saidas.get(aresta.targetNodeId) ?? null, obrigacao)!);
  }
  return saidas;
}

const entradasDe = (links: LinksDoItem | null | undefined) =>
  new Set((links?.edges || []).filter(aresta => aresta.direction === "inbound").map(aresta => aresta.sourceNodeId));

const contagem = (saidas: ReadonlyMap<string, RadarSiloMeshPriority>) => {
  const valores = [...saidas.values()];
  const de = (prioridade: RadarSiloMeshPriority) => valores.filter(valor => valor === prioridade).length;
  return `${saidas.size} destino(s): ${de("HIGH")} obrigatório(s) no corpo, ${de("MEDIUM")} no corpo se a seção tratar, ${de("LOW")} na trilha "Continue no Silo"`;
};

/**
 * O QUE MUDA NOS LINKS deste artigo, por destino: os que entram, os que saem,
 * a obrigação que mudou (obrigatório no corpo, no corpo se a seção tratar,
 * trilha) e quem passa a apontar para ele. A obrigação é a MESMA régua que o
 * artigo-modelo e o CSV aplicam na leitura (`radarSiloMeshPriority`).
 */
export function diffArchitectLinks(input: {
  articleRole: string | null | undefined;
  from: LinksDoItem | null | undefined;
  to: LinksDoItem;
  nodes: ReadonlyMap<string, RadarArchitectGraphNodeInfo>;
}): RadarArchitectUpdateChange[] {
  const antes = saidasComObrigacao(input.from, input.articleRole, input.nodes);
  const depois = saidasComObrigacao(input.to, input.articleRole, input.nodes);
  const nome = (nodeId: string) => nomeDoNo(nodeId, input.nodes);
  const changes: RadarArchitectUpdateChange[] = [];
  const resumo: RadarArchitectUpdateChange = { field: "links_summary", label: "Links deste artigo", before: input.from ? contagem(antes) : "sem grafo no envio", after: contagem(depois) };
  changes.push(resumo);
  const entram = [...depois.keys()].filter(destino => !antes.has(destino));
  const saem = [...antes.keys()].filter(destino => !depois.has(destino));
  if (entram.length) changes.push({ field: "links_added", label: "Links que entram (destino e obrigação)", before: null, after: lista(entram.map(destino => `${nome(destino)} (${OBRIGACAO_CURTA[depois.get(destino)!]})`)) });
  if (saem.length) changes.push({ field: "links_removed", label: "Links que saem", before: lista(saem.map(destino => `${nome(destino)} (${OBRIGACAO_CURTA[antes.get(destino)!]})`)), after: null });
  const mudaram = [...depois.keys()].filter(destino => antes.has(destino) && antes.get(destino) !== depois.get(destino));
  if (mudaram.length) {
    changes.push({
      field: "links_obligation", label: "Obrigação que mudou",
      before: lista(mudaram.map(destino => `${nome(destino)}: ${OBRIGACAO_CURTA[antes.get(destino)!]}`)),
      after: lista(mudaram.map(destino => `${nome(destino)}: ${OBRIGACAO_CURTA[depois.get(destino)!]}`)),
    });
  }
  const recebiaDe = entradasDe(input.from);
  const recebeDe = entradasDe(input.to);
  const passam = [...recebeDe].filter(origem => !recebiaDe.has(origem));
  const deixam = [...recebiaDe].filter(origem => !recebeDe.has(origem));
  if (passam.length || deixam.length) {
    changes.push({
      field: "links_inbound", label: "Páginas que apontam para este artigo",
      before: `${recebiaDe.size}${deixam.length ? ` (deixam de apontar: ${deixam.map(nome).join(", ")})` : ""}`,
      after: `${recebeDe.size}${passam.length ? ` (passam a apontar: ${passam.map(nome).join(", ")})` : ""}`,
    });
  }
  /* Nenhuma relação deste artigo muda (o grafo novo mexeu em outros): dizer, e não deixar parecer que nada aconteceu. */
  if (changes.length === 1 && resumo.before === resumo.after) resumo.after = `${resumo.after} — as mesmas relações deste artigo; muda só a versão do grafo`;
  return changes;
}

/** O que a adoção dos links mantém, refaz e custa. Nada a refazer: links não mudam a SERP. */
export function radarArchitectLinksAdoptionPlan(input: { frozen: boolean; sentToWriter: boolean }): RadarArchitectAdoptionPlan {
  const keeps = [
    "A SERP, a investigação, as evidências e as coletas ficam como estão: links não mudam a SERP (a análise não ganha versão nova).",
    input.frozen
      ? "O pacote congelado e a planta do artigo-modelo não são regravados: o artigo-modelo e o CSV 'Para escrever' leem a malha nova na leitura (obrigatório no corpo, o resto na trilha 'Continue no Silo')."
      : "O artigo-modelo e o CSV 'Para escrever' passam a ler a malha nova (obrigatório no corpo, o resto na trilha 'Continue no Silo').",
  ];
  if (input.sentToWriter) keeps.push("O documento já criado no Redator fica com os links do envio; reenviar ao Redator é pelo caminho de sempre.");
  return { keeps, redo: [], costs: ["Nada pago e nenhuma IA: grava só o grafo transportado pelo item (o campo de links)."] };
}

/** O grafo novo só cobre a versão nova do ArticleDNA: os links chegam com a adoção dela (a regra do ArticleDNA continua valendo). */
export const radarArchitectLinksFollowArticleRefusal = (toArticleVersionNumber: number, toGraphVersionNumber: number): RadarArchitectAdoptionRefusal => ({
  code: "links_follow_article_version",
  reason: `O grafo aprovado vigente (v${toGraphVersionNumber}) foi montado sobre a versão nova do ArticleDNA (v${toArticleVersionNumber}): os links chegam junto com a adoção dessa versão.`,
});

export async function radarArchitectLinksUpdateItemHash(input: {
  articleId: string; itemId: string; lockVersion: number; transportedVersionId: string;
  graph: RadarArchitectGraphChange; adoptable: boolean;
}): Promise<string> {
  return (await contentHash({ kind: "radar_architect_links_update_item", ...input })).replace(/^sha256:/, "");
}

/** O payload gravado do item com SÓ o grafo transportado trocado. Investigação, análise e o resto do item ficam. */
export function radarItemPayloadAdoptingLinks(input: { currentPayload: Record<string, unknown>; links: LinksDoItem }): Record<string, unknown> {
  return { ...input.currentPayload, arquitetoInternalLinks: input.links };
}
