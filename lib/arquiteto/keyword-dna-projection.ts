import { resolveCanonicalKeywordSnapshot, type CanonicalKeywordSnapshotInput } from "../minerador/canonical-keyword-snapshot.ts";
import { deriveGoogleAdsDemandTrend, formatGoogleAdsCpcTableValue, googleAdsDemandTrendLabel } from "../minerador/google-ads-demand.ts";
import { readDataForSeoKeywordOverview } from "../minerador/dataforseo-keyword-overview-core.ts";
import type { KeywordContextualPresentation } from "../minerador/keyword-contextual-presentation.ts";
import { readMineradorHandoffPresentationRef } from "./minerador-handoff.ts";
import { readPrincipalKgrScore } from "./article-kgr-decision.ts";

/**
 * Projeção somente leitura e sem perda da KeywordDNA recebida.
 *
 * O Minerador constrói a KeywordDNA; o Arquiteto apenas projeta os fatos
 * daquela versão. `READ_ONLY` não significa parcial: o resumo horizontal fica
 * sempre visível e o perfil completo mantém acessível todo campo recebido,
 * inclusive o que não tem seção própria (vai para a proveniência técnica).
 */
export type KeywordDnaProjectionField = {
  label: string;
  value: string;
  unresolved: boolean;
  /** Texto longo: renderizado em bloco, não em coluna. */
  wide?: boolean;
  /** Papel semântico de cor: keyword, identidade nova ou identidade publicada. */
  tone?: "keyword" | "identity-new" | "identity-published";
};

export type KeywordDnaProjectionSection = {
  id: string;
  title: string;
  fields: KeywordDnaProjectionField[];
  emptyNote?: string;
};

export type KeywordDnaPresentationProjection = {
  available: boolean;
  versionNumber: number | null;
  contentHash: string | null;
  generatedAt: string | null;
  brandVoiceApplied: boolean;
  text: string | null;
  provenance: KeywordDnaProjectionField[];
  note: string | null;
};

export type KeywordDnaReadonlyProjection = {
  keywordId: string | null;
  keyword: string | null;
  /** Linha 1 do resumo horizontal. */
  summaryPrimary: KeywordDnaProjectionField[];
  /** Linha 2 do resumo horizontal, apenas com o que existe upstream. */
  summarySecondary: KeywordDnaProjectionField[];
  sections: KeywordDnaProjectionSection[];
  presentation: KeywordDnaPresentationProjection;
  /** Campos técnicos e qualquer chave recebida sem seção própria. */
  technical: KeywordDnaProjectionField[];
  /** Status canônico recebido do Minerador; "Aprovado" é o estado normal. */
  upstreamStatusLabel: string;
  upstreamApproved: boolean;
  /** Dimensões sem conclusão pela evidência disponível — informação, não erro. */
  indeterminateDimensions: string[];
};

export type KeywordDnaProjectionInput = CanonicalKeywordSnapshotInput & {
  canonicalWorkflow?: { payload?: unknown } | null;
  keywordDnaRef?: Record<string, unknown> | null;
  analise_semantica?: Record<string, unknown> | null;
};

const EMPTY = "—";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("pt-BR");
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) {
    const parts = value.map(item => textValue(item)).filter((item): item is string => Boolean(item));
    return parts.length ? parts.join(" · ") : null;
  }
  return null;
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integerLabel(value: number | null): string {
  return value === null ? EMPTY : value.toLocaleString("pt-BR");
}

function decimalLabel(value: number | null): string {
  return value === null ? EMPTY : value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

function dateLabel(value: unknown): string | null {
  const raw = typeof value === "string" && value.trim() ? value.trim() : null;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString("pt-BR");
}

function field(label: string, value: string | null, options: { unresolved?: boolean; wide?: boolean; tone?: KeywordDnaProjectionField["tone"] } = {}): KeywordDnaProjectionField | null {
  if (value === null) return null;
  return { label, value, unresolved: options.unresolved ?? false, ...(options.wide ? { wide: true } : {}), ...(options.tone ? { tone: options.tone } : {}) };
}

function compact(fields: Array<KeywordDnaProjectionField | null>): KeywordDnaProjectionField[] {
  return fields.filter((item): item is KeywordDnaProjectionField => Boolean(item));
}

function section(id: string, title: string, fields: Array<KeywordDnaProjectionField | null>, emptyNote: string): KeywordDnaProjectionSection {
  const resolved = compact(fields);
  return resolved.length ? { id, title, fields: resolved } : { id, title, fields: [], emptyNote };
}

function serialize(value: unknown): string | null {
  const direct = textValue(value);
  if (direct !== null) return direct;
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function handoffPayload(keyword: KeywordDnaProjectionInput): Record<string, unknown> | null {
  return asRecord(keyword.canonicalWorkflow?.payload);
}

/** Converte a KeywordDNA recebida em projeção somente leitura para o Arquiteto. */
export function projectKeywordDnaForArchitect(
  keyword: KeywordDnaProjectionInput,
  presentation?: KeywordContextualPresentation | null,
): KeywordDnaReadonlyProjection {
  const snapshot = resolveCanonicalKeywordSnapshot(keyword);
  const semantic = asRecord(keyword.analise_semantica);
  const payload = handoffPayload(keyword);
  const measurement = snapshot.processor.volume.validated ? snapshot.processor.volume.measurement : snapshot.processor.imported.metrics;
  const measurementRecord = asRecord(measurement);
  const trend = deriveGoogleAdsDemandTrend(measurementRecord?.monthlySearchVolumes);
  const overview = readDataForSeoKeywordOverview(semantic?.dataforseo_keyword_overview)
    || readDataForSeoKeywordOverview(semantic?.keyword_overview)
    || readDataForSeoKeywordOverview(snapshot.metrics.kd.measurement);
  const confidence = numeric(semantic?.confianca) ?? numeric(semantic?.confidence);
  const centralEntity = textValue(semantic?.entidade_central) || textValue(semantic?.centralEntity);
  const kgrScore = readPrincipalKgrScore({
    kgr: numeric((keyword as { kgr?: unknown }).kgr),
    kgr_score: numeric(keyword.kgr_score),
  }) ?? snapshot.metrics.kgr.score;
  const qualification = asRecord(payload?.semanticQualification);
  const reviewRecord = snapshot.humanReview.record as unknown as Record<string, unknown> | null;

  // Chaves já projetadas em seções próprias; o que sobrar vai para a
  // proveniência técnica, para nenhum campo recebido desaparecer.
  const usedSemanticKeys = new Set<string>();
  const semanticText = (...keys: string[]): string | null => {
    for (const key of keys) {
      usedSemanticKeys.add(key);
      const value = textValue(semantic?.[key]);
      if (value !== null) return value;
    }
    return null;
  };

  const summaryPrimary = compact([
    field("Volume", integerLabel(snapshot.metrics.volume.value), { unresolved: snapshot.metrics.volume.value === null }),
    field("Resultados", integerLabel(snapshot.metrics.result.value), { unresolved: snapshot.metrics.result.value === null }),
    field("Intenção", snapshot.semantic.intentField.label, { unresolved: snapshot.semantic.intentField.state === "unresolved" }),
    field("Funil", snapshot.semantic.funnelField.label, { unresolved: snapshot.semantic.funnelField.state === "unresolved" }),
    field("KGR", decimalLabel(kgrScore), { unresolved: kgrScore === null }),
    field("Aplicabilidade", snapshot.metrics.kgr.applicabilityLabel, { unresolved: snapshot.metrics.kgr.applicability === "pending" }),
  ]);

  const summarySecondary = compact([
    snapshot.metrics.cpc.sortValue !== null ? field("CPC", formatGoogleAdsCpcTableValue(snapshot.metrics.cpc)) : null,
    snapshot.metrics.kd.value !== null ? field("KD", String(snapshot.metrics.kd.value)) : null,
    trend !== "dados_insuficientes" ? field("Tendência", googleAdsDemandTrendLabel(trend)) : null,
    centralEntity ? field("Entidade", centralEntity) : null,
    confidence !== null ? field("Confiança", `${Math.round(confidence * 100)}%`) : null,
  ]);

  const identity = section("identidade", "Identidade", [
    field("Keyword", snapshot.identity.keyword),
    field("ID", snapshot.identity.id),
    field("Brand", snapshot.identity.brandId),
    field("Status", snapshot.status.label, { unresolved: snapshot.status.kind !== "resolved" }),
    field("Maturidade", snapshot.maturity, { unresolved: snapshot.maturity === "INSUFICIENTE" }),
    field("Origem do DNA", semanticText("dna_origem", "origem_logica")),
    field("Versão da KeywordDNA", textValue(keyword.keywordDnaRef?.versionId)),
    field("Hash da versão", textValue(keyword.keywordDnaRef?.contentHash)),
  ], "Identidade não recebida no handoff.");

  const logic = section("leitura-logica", "Leitura lógica", [
    field("Intenção lógica", semanticText("intencao_principal", "intencao")),
    field("Intenção canônica", snapshot.semantic.intentLabel),
    field("Intenção secundária", semanticText("intencao_secundaria")),
    field("Funil lógico", semanticText("funil", "funnel")),
    field("Funil canônico", snapshot.semantic.funnelLabel),
    field("Entidade central", semanticText("entidade_central", "centralEntity")),
    field("Modificadores", semanticText("modificadores")),
    field("Nicho", snapshot.semantic.nicheLabel),
    field("Localidade", semanticText("localidade", "intencao_local")),
    field("Audiência", semanticText("publico", "perfil_b2b")),
    field("Problema percebido", semanticText("problema_percebido"), { wide: true }),
    field("Necessidade", semanticText("job_to_be_done", "necessidade"), { wide: true }),
    field("Resultado desejado", semanticText("resultado_desejado"), { wide: true }),
    field("Jornada", semanticText("etapa_jornada")),
    field("Nível de consciência", semanticText("nivel_consciencia")),
    field("Tipo editorial", semanticText("tipo_editorial", "formato_esperado")),
    field("Potencial comercial", semanticText("potencial_comercial")),
    field("Objeção implícita", semanticText("objecao_implicita")),
    field("Emoção dominante", semanticText("emocao_dominante")),
    field("Confiança", confidence !== null ? `${Math.round(confidence * 100)}%` : null),
    field("Ambiguidade", semanticText("ambiguidade")),
    field("Origem lógica", semanticText("origem_logica", "dna_origem")),
  ], "Leitura lógica não recebida.");

  const googleAds = section("google-ads", "Demanda · Google Ads", [
    field("Volume atual", integerLabel(snapshot.processor.volume.value)),
    field("Tendência", trend !== "dados_insuficientes" ? googleAdsDemandTrendLabel(trend) : null),
    field("CPC", snapshot.metrics.cpc.sortValue !== null ? formatGoogleAdsCpcTableValue(snapshot.metrics.cpc) : null),
    field("Concorrência Ads", textValue(measurementRecord?.competition)),
    field("Índice de concorrência", textValue(measurementRecord?.competitionIndex)),
    field("Targeting", serialize(measurementRecord?.targeting)),
    field("Última medição", dateLabel(snapshot.processor.volume.measuredAt)),
    field("Provider", textValue(snapshot.processor.volume.provider)),
    field("Estado no Processador", snapshot.processor.volume.state),
    field("Histórico mensal", Array.isArray(measurementRecord?.monthlySearchVolumes) ? `${(measurementRecord.monthlySearchVolumes as unknown[]).length} medições recebidas` : null),
  ], "Nenhuma medição do Google Ads recebida.");

  const dataForSeo = section("dataforseo", "Competição SEO · DataForSEO", [
    field("Resultados", integerLabel(snapshot.metrics.result.value)),
    field("KD", snapshot.metrics.kd.value !== null ? String(snapshot.metrics.kd.value) : null),
    field("Referring domains", textValue(overview?.avgReferringDomains ?? overview?.avg_referring_domains)),
    field("Backlinks", textValue(overview?.avgBacklinks ?? overview?.avg_backlinks)),
    field("Domain rank", textValue(overview?.avgDomainRank ?? overview?.avg_domain_rank)),
    field("Sinal de intenção externo", snapshot.semantic.externalIntentLabel),
    field("Última medição", dateLabel(snapshot.processor.results.measuredAt)),
    field("Provider", textValue(snapshot.processor.results.provider)),
    field("Estado no Processador", snapshot.processor.results.state),
  ], "Nenhuma evidência do DataForSEO recebida.");

  const semanticQualification = section("qualificacao-semantica", "Qualificação Semântica do Minerador", [
    field("Intenção consolidada", textValue(qualification?.intent)),
    field("Funil consolidado", textValue(qualification?.funnel)),
    field("Estado da evidência", qualification ? (qualification.semanticState === "conclusive" ? "Conclusiva" : "Não conclusiva") : null),
    field("Versão", textValue(qualification?.versionId)),
    field("Hash", textValue(qualification?.contentHash)),
    field("Coletada em", dateLabel(qualification?.collectedAt)),
  ], "Handoff sem Qualificação Semântica persistida. Esta seção descreve o que o Minerador consolidou; não é a SERP de formação do Arquiteto.");

  const kgr = section("kgr-keyword", "KGR da keyword", [
    field("Score", decimalLabel(kgrScore), { unresolved: kgrScore === null }),
    field("Aplicabilidade", snapshot.metrics.kgr.applicabilityLabel, { unresolved: snapshot.metrics.kgr.applicability === "pending" }),
    field("Decisão registrada", semanticText("kgr_decisao")),
    field("Origem da decisão", semanticText("kgr_decisao_origem")),
    field("Decidido por", semanticText("kgr_decidido_por")),
    field("Decidido em", dateLabel(semanticText("kgr_decidido_em"))),
    field("Justificativa", semanticText("kgr_justificativa"), { wide: true }),
    field("Origem do cálculo", snapshot.metrics.kgr.source),
    field("Volume usado", integerLabel(snapshot.metrics.kgr.volumeUsed)),
    field("Resultado usado", integerLabel(snapshot.metrics.kgr.allintitleUsed)),
  ], "KGR não recebido para esta keyword.");

  const mineradorReview = section("revisao-upstream", "Revisão upstream", [
    field("Origem", "Minerador"),
    field("Status da revisão", snapshot.humanReview.completed ? "Concluída" : "Pendente", { unresolved: !snapshot.humanReview.completed }),
    field("Concluída por", textValue(reviewRecord?.completedBy)),
    field("Concluída em", dateLabel(reviewRecord?.completedAt)),
    field("Decisões registradas", serialize(reviewRecord?.decisions)),
    field("Status final", snapshot.status.label),
    field("Campos pendentes", snapshot.humanReview.pendingFields.length ? snapshot.humanReview.pendingFields.join(" · ") : null),
  ], "Nenhuma revisão upstream recebida do Minerador.");

  // Identidade publicada e identidade nova têm cores próprias: slug, URL e
  // canonical de conteúdo já publicado nunca se confundem com os provisórios.
  const published = String(keyword.status || "").toLocaleLowerCase("pt-BR") === "publicado"
    || (keyword as { isPublished?: unknown }).isPublished === true;
  const identityTone = published ? "identity-published" as const : "identity-new" as const;
  const publication = section("publicacao", "Publicação e proteção", [
    field("Vínculo", snapshot.vinculo.label),
    field("URL", snapshot.vinculo.url, { tone: identityTone }),
    field("Relação", snapshot.vinculo.relation),
    field("Slug", semanticText("slug_sugerido") || textValue((keyword as { computedSlug?: unknown }).computedSlug), { tone: identityTone }),
    field("Canonical", textValue((keyword as { canonical?: unknown }).canonical), { tone: identityTone }),
    field("Política da principal", textValue((keyword as { primaryKeywordPolicy?: unknown }).primaryKeywordPolicy)),
  ], "Sem identidade publicada recebida.");

  const presentationRef = readMineradorHandoffPresentationRef(payload);
  const presentationProjection: KeywordDnaPresentationProjection = presentation || presentationRef
    ? {
      available: true,
      versionNumber: presentation?.lifecycle.version ?? presentationRef?.versionNumber ?? null,
      contentHash: presentation?.lifecycle.contentHash ?? presentationRef?.contentHash ?? null,
      generatedAt: presentation?.provenance.generatedAt ?? presentationRef?.generatedAt ?? null,
      brandVoiceApplied: Boolean(presentation?.input.appliedSkillRefs.length),
      text: presentation?.output.text ?? null,
      provenance: compact([
        field("Origem", "Minerador"),
        field("Provider", textValue(presentation?.provenance.provider)),
        field("Modelo", textValue(presentation?.provenance.model)),
        field("Requisição", textValue(presentation?.provenance.operationRequestId)),
        field("Gerada em", dateLabel(presentation?.provenance.generatedAt ?? presentationRef?.generatedAt)),
        field("Versão", presentation ? String(presentation.lifecycle.version) : presentationRef ? String(presentationRef.versionNumber) : null),
        field("Hash", presentation?.lifecycle.contentHash ?? presentationRef?.contentHash ?? null),
        field("Skills aplicadas", presentation?.input.appliedSkillRefs.map(ref => ref.definitionKey).join(" · ") || null),
      ]),
      note: presentation ? null : "Referência recebida no handoff; o texto integral não foi carregado nesta sessão.",
    }
    : {
      available: false,
      versionNumber: null,
      contentHash: null,
      generatedAt: null,
      brandVoiceApplied: false,
      text: null,
      provenance: [],
      note: "Não disponível para esta versão da KeywordDNA.",
    };

  const remainingSemantic = compact(Object.entries(semantic || {})
    .filter(([key]) => !usedSemanticKeys.has(key))
    .map(([key, value]) => field(key, serialize(value), { wide: true })));

  const technical = compact([
    field("Referência da versão", serialize(keyword.keywordDnaRef)),
    field("Estado do workflow", textValue(asRecord(keyword.canonicalWorkflow as Record<string, unknown> | null)?.state)),
    field("Payload do handoff", serialize(payload), { wide: true }),
    field("Estados do processo", serialize(snapshot.process), { wide: true }),
  ]).concat(remainingSemantic);

  // Dimensão indeterminada é resultado legítimo da análise: a evidência
  // existe, mas não sustenta conclusão. Nada aqui é erro nem pendência.
  const indeterminateDimensions = [
    ...(snapshot.semantic.intentField.state === "unresolved" ? ["Intenção"] : []),
    ...(snapshot.semantic.funnelField.state === "unresolved" ? ["Funil"] : []),
    ...(snapshot.semantic.nicheState === "unresolved" ? ["Nicho"] : []),
    ...(qualification && qualification.semanticState !== "conclusive" ? ["Qualificação Semântica"] : []),
  ];

  return {
    keywordId: snapshot.identity.id,
    keyword: snapshot.identity.keyword,
    summaryPrimary,
    summarySecondary,
    sections: [identity, logic, googleAds, dataForSeo, semanticQualification, kgr, mineradorReview, publication],
    presentation: presentationProjection,
    technical,
    upstreamStatusLabel: snapshot.status.label,
    upstreamApproved: snapshot.status.status === "aprovado" || String(keyword.status || "").toLocaleLowerCase("pt-BR") === "publicado",
    indeterminateDimensions,
  };
}
