/**
 * ===== DIVERGÊNCIA ENTRE EVIDÊNCIA E DNA · O CONTRATO (puro) =====
 *
 * SDD: docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md
 * §5; adendo de decisões D3, D5 e §3.5; migration 20260923150000 (tabela
 * `writer_evidence_divergences`, NÃO aplicada pelo agente).
 *
 * A IA LÊ E CONFRONTA; QUEM MUDA DNA É O DONO, POR DECISÃO HUMANA
 * (AGENTS.md §9). Daqui sai só o registro "aberta":
 *
 *   - o ALVO é sempre uma referência do próprio documento (ArticleDNA,
 *     SiloDNA, KeywordDNA fixados, o pacote do Radar) ou o contexto vigente
 *     da Marca. Id que não está nas referências é recusado, nunca inventado;
 *   - a EVIDÊNCIA leva a hierarquia calculada pelo servidor, nunca a que a
 *     IA declarar. Fora do dossiê congelado, nunca `CURRENT_SUFFICIENT_SERP`
 *     (invariantes 27 e 35), e só o dossiê é congelado;
 *   - severidade da IA é `info` ou `alerta`. `bloqueante` só por pessoa;
 *   - status nasce `aberta`. Reconhecer, enviar ao dono, resolver e descartar
 *     são decisões humanas no painel — nenhuma rota de IA faz UPDATE.
 *
 * Nada aqui lê banco. O servidor (`lib/server/writer-evidence-divergences.ts`)
 * resolve o alvo contra a linha do documento e grava.
 */

import { z } from "zod";
import type { RadarEvidenceSource } from "../radar/evidence-authority.ts";
import { writerEvidenceEtag } from "./writer-evidence-catalog.ts";

export const WRITER_DIVERGENCE_TARGET_KINDS = ["article_dna", "keyword_dna", "silo_dna", "brand_dna", "radar_bundle"] as const;
export type WriterDivergenceTargetKind = (typeof WRITER_DIVERGENCE_TARGET_KINDS)[number];

export const WRITER_DIVERGENCE_OWNERS = ["arquiteto", "radar", "minerador", "marca"] as const;
export type WriterDivergenceOwner = (typeof WRITER_DIVERGENCE_OWNERS)[number];

/** Não encerradas: o Guardião as lê como abertas. */
export const WRITER_DIVERGENCE_OPEN_STATUSES = ["aberta", "reconhecida", "enviada_ao_dono"] as const;

export type WriterDivergenceOrigin = "ia_mcp" | "ia_interna";

/** O dono padrão de cada alvo: quem decide a mudança, com nova versão. */
export const WRITER_DIVERGENCE_DEFAULT_OWNER: Readonly<Record<WriterDivergenceTargetKind, WriterDivergenceOwner>> = Object.freeze({
  article_dna: "arquiteto",
  silo_dna: "arquiteto",
  keyword_dna: "minerador",
  brand_dna: "marca",
  radar_bundle: "radar",
});

/**
 * O PEDIDO DA IA. Sem status, sem bloqueante, sem hierarquia, sem data: nada
 * disso é a IA quem diz. `.strict()` recusa quem tentar mandar.
 */
export const WriterDivergenceRequestSchema = z.object({
  target: z.object({
    kind: z.enum(WRITER_DIVERGENCE_TARGET_KINDS),
    /** Só para `keyword_dna`: a keyword fixada no documento. */
    keywordId: z.string().trim().min(1).max(300).optional(),
    /** Opcional; quando vem, precisa ser a versão fixada (ou, na Marca, a vigente listada no manifesto). */
    versionId: z.string().trim().min(1).max(300).optional(),
  }).strict(),
  dnaClaim: z.object({
    path: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(2000),
  }).strict(),
  evidence: z.object({
    sourceKey: z.string().trim().min(1).max(300),
    path: z.string().trim().min(1).max(500).optional(),
    /** Aceito por compatibilidade e IGNORADO: o servidor grava a identidade da fonte que ele mesmo calcula. */
    etag: z.string().trim().min(1).max(300).optional(),
  }).strict(),
  severity: z.enum(["info", "alerta"]).default("alerta"),
  suggestedOwner: z.enum(WRITER_DIVERGENCE_OWNERS).optional(),
}).strict();
export type WriterDivergenceRequest = z.infer<typeof WriterDivergenceRequestSchema>;

/* ================================ o alvo ================================ */

type Referencia = { entityId: string; versionId: string; contentHash: string | null };

export type WriterDivergenceTarget = { kind: WriterDivergenceTargetKind } & Referencia;

/**
 * O QUE O DOCUMENTO PERMITE APONTAR. `brand` é `null` quando o contexto da
 * Marca não foi lido (o alvo `brand_dna` exige lê-lo antes).
 */
export type WriterDivergenceTargetsOfDocument = {
  articleDnaRef: Referencia;
  siloDnaRef: Referencia;
  keywordDnaRefs: readonly Referencia[];
  bundle: { bundleId: string; bundleHash: string } | null;
  brand: { brandDna: Referencia | null; skills: readonly Referencia[] } | null;
};

export type WriterDivergenceTargetResolution =
  | { ok: true; target: WriterDivergenceTarget }
  | { ok: false; reason: string };

const recusa = (reason: string): WriterDivergenceTargetResolution => ({ ok: false, reason });

/** Resolve o alvo pedido contra as referências do documento. Nada é aceito por existir noutro lugar. */
export function resolveWriterDivergenceTarget(
  alvos: WriterDivergenceTargetsOfDocument,
  pedido: WriterDivergenceRequest["target"],
): WriterDivergenceTargetResolution {
  const fixada = (kind: WriterDivergenceTargetKind, referencia: Referencia, rotulo: string): WriterDivergenceTargetResolution => {
    if (pedido.versionId && pedido.versionId !== referencia.versionId) return recusa(`a versão pedida não é a do ${rotulo} fixada no documento`);
    return { ok: true, target: { kind, entityId: referencia.entityId, versionId: referencia.versionId, contentHash: referencia.contentHash } };
  };
  switch (pedido.kind) {
    case "article_dna": return fixada("article_dna", alvos.articleDnaRef, "ArticleDNA");
    case "silo_dna": return fixada("silo_dna", alvos.siloDnaRef, "SiloDNA");
    case "keyword_dna": {
      if (!pedido.keywordId && !pedido.versionId) return recusa("keyword_dna exige keywordId de uma keyword fixada no documento");
      const referencia = alvos.keywordDnaRefs.find(item =>
        (!pedido.keywordId || item.entityId === pedido.keywordId) && (!pedido.versionId || item.versionId === pedido.versionId));
      if (!referencia) return recusa("a keyword não está entre as fixadas no documento");
      return { ok: true, target: { kind: "keyword_dna", entityId: referencia.entityId, versionId: referencia.versionId, contentHash: referencia.contentHash } };
    }
    case "radar_bundle": {
      if (!alvos.bundle) return recusa("o documento não tem pacote do Radar");
      if (pedido.versionId && pedido.versionId !== alvos.bundle.bundleId) return recusa("o pacote pedido não é o entregue ao documento");
      return { ok: true, target: { kind: "radar_bundle", entityId: alvos.bundle.bundleId, versionId: alvos.bundle.bundleId, contentHash: alvos.bundle.bundleHash } };
    }
    case "brand_dna": {
      if (!alvos.brand) return recusa("o contexto da Marca não foi lido");
      const pedida = pedido.versionId && pedido.versionId !== "current" ? pedido.versionId : null;
      const referencia = pedida
        ? [alvos.brand.brandDna, ...alvos.brand.skills].find(item => item?.versionId === pedida) ?? null
        : alvos.brand.brandDna;
      if (!referencia) return recusa(pedida ? "a versão pedida não é a vigente da Marca" : "nenhum BrandDNA aprovado nesta Marca; aponte a Skill vigente pelo versionId");
      return { ok: true, target: { kind: "brand_dna", entityId: referencia.entityId, versionId: referencia.versionId, contentHash: referencia.contentHash } };
    }
    default:
      return recusa("tipo de alvo desconhecido");
  }
}

/* ============================== a evidência ============================= */

/** A evidência como o SERVIDOR a descreve: hierarquia, congelamento e data vêm do leitor. */
export type WriterDivergenceEvidence = {
  sourceKey: string;
  path: string | null;
  etag: string | null;
  level: RadarEvidenceSource;
  frozen: boolean;
  observedAt: string | null;
  posteriorAoPacote: boolean;
};

const dataOuNulo = (valor: string | null): string | null =>
  valor && Number.isFinite(Date.parse(valor)) ? valor : null;

/**
 * As regras da borda, iguais aos CHECKs da tabela: congelado só com chave do
 * dossiê e nunca posterior; fora dele nunca SERP vigente e suficiente.
 */
export function normalizeWriterDivergenceEvidence(evidencia: WriterDivergenceEvidence): WriterDivergenceEvidence {
  const frozen = evidencia.frozen && evidencia.sourceKey.startsWith("radar.bundle.");
  const level: RadarEvidenceSource = !frozen && evidencia.level === "CURRENT_SUFFICIENT_SERP" ? "OTHER_RADAR_EVIDENCE" : evidencia.level;
  return {
    sourceKey: evidencia.sourceKey.slice(0, 300),
    path: evidencia.path ? evidencia.path.slice(0, 500) : null,
    etag: evidencia.etag ? evidencia.etag.slice(0, 300) : null,
    level,
    frozen,
    observedAt: dataOuNulo(evidencia.observedAt),
    posteriorAoPacote: frozen ? false : evidencia.posteriorAoPacote,
  };
}

/* ================================ a linha =============================== */

/**
 * IDEMPOTÊNCIA (AGENTS.md §10). A mesma afirmação do mesmo DNA confrontada
 * com a mesma evidência é um registro só, venha da IA externa ou da interna.
 * `nota` entra quando não há caminho de DNA declarado (alerta livre).
 */
export function writerDivergenceDedupeKey(partes: {
  targetKind: WriterDivergenceTargetKind;
  targetVersionId: string;
  claimPath: string;
  evidenceSourceKey: string;
  evidencePath: string | null;
  note?: string | null;
}): string {
  const normalizar = (texto: string | null | undefined) => (texto ?? "").normalize("NFC").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
  return `div:${writerEvidenceEtag([
    partes.targetKind, partes.targetVersionId, normalizar(partes.claimPath),
    partes.evidenceSourceKey, normalizar(partes.evidencePath), normalizar(partes.note),
  ]).slice(3)}`;
}

export type WriterDivergenceRow = {
  marca_id: string;
  document_id: string;
  article_id: string;
  dedupe_key: string;
  target_kind: WriterDivergenceTargetKind;
  target_entity_id: string;
  target_version_id: string;
  target_content_hash: string | null;
  dna_claim_path: string;
  dna_claim_summary: string;
  evidence_source_key: string;
  evidence_path: string | null;
  evidence_etag: string | null;
  evidence_hierarchy_level: RadarEvidenceSource;
  evidence_frozen: boolean;
  evidence_observed_at: string | null;
  evidence_posterior_ao_pacote: boolean;
  severity: "info" | "alerta";
  suggested_owner: WriterDivergenceOwner;
  origin: WriterDivergenceOrigin;
  mcp_grant_id: string | null;
  created_by: string;
  status: "aberta";
};

/**
 * MONTA A LINHA. `ia_mcp` exige o grant; `ia_interna` nunca leva grant. O
 * alvo `radar_bundle` leva o hash (o gatilho confere id E hash do pacote).
 */
export function writerDivergenceRow(input: {
  brandId: string;
  documentId: string;
  articleId: string;
  target: WriterDivergenceTarget;
  claim: { path: string; summary: string };
  evidence: WriterDivergenceEvidence;
  severity: "info" | "alerta";
  suggestedOwner?: WriterDivergenceOwner | null;
  origin: WriterDivergenceOrigin;
  mcpGrantId: string | null;
  createdBy: string;
  note?: string | null;
}): WriterDivergenceRow {
  if (input.origin === "ia_mcp" && !input.mcpGrantId) throw new Error("WRITER_DIVERGENCE_MCP_REQUIRES_GRANT");
  if (input.origin === "ia_interna" && input.mcpGrantId) throw new Error("WRITER_DIVERGENCE_INTERNAL_WITHOUT_GRANT");
  if (input.severity !== "info" && input.severity !== "alerta") throw new Error("WRITER_DIVERGENCE_SEVERITY_FROM_AI");
  const evidencia = normalizeWriterDivergenceEvidence(input.evidence);
  const claimPath = input.claim.path.trim().slice(0, 500);
  return {
    marca_id: input.brandId,
    document_id: input.documentId,
    article_id: input.articleId,
    dedupe_key: writerDivergenceDedupeKey({
      targetKind: input.target.kind, targetVersionId: input.target.versionId, claimPath,
      evidenceSourceKey: evidencia.sourceKey, evidencePath: evidencia.path, note: input.note ?? null,
    }),
    target_kind: input.target.kind,
    target_entity_id: input.target.entityId,
    target_version_id: input.target.versionId,
    target_content_hash: input.target.contentHash,
    dna_claim_path: claimPath,
    dna_claim_summary: input.claim.summary.trim().slice(0, 2000),
    evidence_source_key: evidencia.sourceKey,
    evidence_path: evidencia.path,
    evidence_etag: evidencia.etag,
    evidence_hierarchy_level: evidencia.level,
    evidence_frozen: evidencia.frozen,
    evidence_observed_at: evidencia.observedAt,
    evidence_posterior_ao_pacote: evidencia.posteriorAoPacote,
    severity: input.severity,
    suggested_owner: input.suggestedOwner ?? WRITER_DIVERGENCE_DEFAULT_OWNER[input.target.kind],
    origin: input.origin,
    mcp_grant_id: input.origin === "ia_mcp" ? input.mcpGrantId : null,
    created_by: input.createdBy,
    status: "aberta",
  };
}

/* ============================ a leitura estreita ========================= */

/** O que se lê de volta: nunca `created_by`, grant ou etag — só o que o Guardião e a IA usam. */
export const WRITER_DIVERGENCE_SELECT = [
  "id", "status", "severity", "origin", "target_kind", "target_entity_id", "target_version_id",
  "dna_claim_path", "dna_claim_summary", "evidence_source_key", "evidence_path", "evidence_hierarchy_level",
  "evidence_frozen", "evidence_posterior_ao_pacote", "suggested_owner", "created_at",
].join(",");

export type WriterOpenDivergence = {
  id: string;
  status: string;
  severity: "info" | "alerta" | "bloqueante";
  origin: string;
  targetKind: string;
  targetEntityId: string;
  targetVersionId: string;
  dnaClaimPath: string;
  dnaClaimSummary: string;
  evidenceSourceKey: string;
  evidencePath: string | null;
  evidenceHierarchyLevel: string | null;
  evidenceFrozen: boolean;
  evidencePosteriorAoPacote: boolean;
  suggestedOwner: string | null;
  createdAt: string | null;
};

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);

export function writerOpenDivergenceFromRow(linha: Record<string, unknown>): WriterOpenDivergence | null {
  const id = texto(linha.id);
  const severity = linha.severity;
  if (!id || (severity !== "info" && severity !== "alerta" && severity !== "bloqueante")) return null;
  const obrigatorios = [linha.status, linha.target_kind, linha.target_entity_id, linha.target_version_id, linha.dna_claim_path, linha.dna_claim_summary, linha.evidence_source_key];
  if (!obrigatorios.every(valor => texto(valor))) return null;
  return {
    id,
    status: String(linha.status),
    severity,
    origin: texto(linha.origin) ?? "desconhecida",
    targetKind: String(linha.target_kind),
    targetEntityId: String(linha.target_entity_id),
    targetVersionId: String(linha.target_version_id),
    dnaClaimPath: String(linha.dna_claim_path),
    dnaClaimSummary: String(linha.dna_claim_summary),
    evidenceSourceKey: String(linha.evidence_source_key),
    evidencePath: texto(linha.evidence_path),
    evidenceHierarchyLevel: texto(linha.evidence_hierarchy_level),
    evidenceFrozen: linha.evidence_frozen === true,
    evidencePosteriorAoPacote: linha.evidence_posterior_ao_pacote === true,
    suggestedOwner: texto(linha.suggested_owner),
    createdAt: texto(linha.created_at),
  };
}
