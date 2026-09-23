import "server-only";

/**
 * ===== IA INTERNA DO REDATOR COM EVIDÊNCIA · SEÇÃO E MELHORIA =====
 *
 * SDD: docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md
 * §4.4 ("IA interna") e §5; adendo D1, D5 e D9.
 *
 * Antes, `/api/redator/section` e `/improve` mandavam ao modelo só título,
 * instruções e blocos, e os `alerts` que ele devolvia se perdiam na tela.
 * Agora:
 *
 *   1. o SERVIDOR monta o pacote da seção (≤ 24 kB) a partir da linha do
 *      documento, filtrada pela Marca autorizada. O documento que vem do
 *      navegador só dá os blocos em edição e o id — nunca a evidência;
 *   2. o prompt leva o pacote e as guardas (sem FAQ, terceiros é pesquisa,
 *      conflito dos dois lados, ler não é mudar DNA);
 *   3. cada alerta vira divergência `aberta` (origem `ia_interna`) para
 *      decisão humana. Sem a migration, o alerta volta na resposta marcado
 *      "não registrado" — nada é gravado noutro lugar.
 *
 * O modelo é injetado (`generate`): a rota passa a Connection DeepSeek da
 * Marca; os testes, um DeepSeek falso. Nenhuma chamada paga em teste.
 */

import type { z } from "zod";
import type { ContentDocument } from "@/lib/arquiteto/contracts";
import { RedatorImproveProposalSchema, RedatorSectionProposalSchema, type RedatorImproveProposal, type RedatorSectionProposal } from "@/lib/redator/contracts";
import {
  buildImprovePrompt,
  buildSectionWritingPrompt,
  createSectionPromptContext,
  IMPROVE_SYSTEM_PROMPT,
  SECTION_WRITING_SYSTEM_PROMPT,
  type WriterPromptEvidence,
} from "@/lib/redator/prompts";
import { writerEvidenceJsonBytes } from "@/lib/redator/writer-evidence-catalog";
import {
  WRITER_DIVERGENCE_TARGET_KINDS,
  resolveWriterDivergenceTarget,
  writerDivergenceRow,
  type WriterDivergenceEvidence,
  type WriterDivergenceTargetKind,
  type WriterDivergenceTargetsOfDocument,
} from "@/lib/redator/writer-evidence-divergence";
import {
  buildWriterSectionEvidencePackage,
  writerAiAlertMessage,
  writerSectionSourceOf,
  type WriterAiAlert,
  type WriterImproveProviderSchema,
  type WriterSectionFocus,
  type WriterSectionProviderSchema,
} from "@/lib/redator/writer-section-evidence";
import { insertWriterDivergence, writerDivergenceTargetsOf } from "@/lib/server/writer-evidence-divergences";
import { WriterEvidenceError, readWriterEvidenceHead, type WriterEvidenceContext, type WriterEvidenceHead } from "@/lib/server/writer-evidence-document";
import { readWriterSectionMaterial } from "@/lib/server/writer-evidence-reader";

export type WriterAiGenerate<T> = (prompt: { system: string; user: string }) => Promise<T>;

/* ================================ pacote ================================ */

export type WriterSectionEvidenceRead = {
  head: WriterEvidenceHead | null;
  evidence: WriterPromptEvidence;
  bytes: number | null;
};

const aviso = (erro: WriterEvidenceError) => `${erro.code}: ${erro.message}`.slice(0, 1000);

/**
 * O PACOTE DA SEÇÃO. Documento de outra Marca (ou inexistente) é
 * `document_not_found` e interrompe a escrita. Qualquer outra falha do leitor
 * (documento fora do contrato, pacote trocado, pacote que não coube) vira
 * escrita SEM pacote, com o motivo declarado ao modelo e à tela.
 */
export async function readWriterSectionEvidence(context: WriterEvidenceContext, documentId: string, focus: WriterSectionFocus): Promise<WriterSectionEvidenceRead> {
  let head: WriterEvidenceHead;
  try {
    head = await readWriterEvidenceHead(context, documentId);
  } catch (erro) {
    if (erro instanceof WriterEvidenceError && erro.code !== "document_not_found") return { head: null, evidence: { package: null, notice: aviso(erro) }, bytes: null };
    throw erro;
  }
  try {
    const material = await readWriterSectionMaterial(context, head);
    const pacote = buildWriterSectionEvidencePackage(material, focus);
    if (!pacote) return { head, evidence: { package: null, notice: "source_too_large: o pacote da seção não coube em 24 kB" }, bytes: null };
    return { head, evidence: { package: pacote, notice: null }, bytes: writerEvidenceJsonBytes(pacote) };
  } catch (erro) {
    if (erro instanceof WriterEvidenceError && erro.code !== "document_not_found") return { head, evidence: { package: null, notice: aviso(erro) }, bytes: null };
    throw erro;
  }
}

/* ======================== alertas → divergências ======================== */

export type WriterAlertRegistration = {
  status: "none" | "registered" | "partial" | "not_registered" | "migration_pendente";
  recorded: Array<{ id: string; status: "recorded" | "already_recorded"; message: string }>;
  notRecorded: Array<{ message: string; reason: string }>;
};

/** Teto de alertas convertidos em divergência por proposta: cada um custa um INSERT com releitura. */
export const WRITER_AI_ALERTS_REGISTERED_MAX = 20;

const TIPOS_DE_ALVO = new Set<string>(WRITER_DIVERGENCE_TARGET_KINDS);
const CAMINHO_NAO_DECLARADO = "nao_declarado";

/**
 * CADA ALERTA VIRA UM REGISTRO `aberta`, origem `ia_interna`, sem grant.
 *
 * - Alvo: o que o alerta apontou, resolvido contra as referências do
 *   documento; sem alvo, o ArticleDNA fixado (o contrato do artigo). Id fora
 *   das referências não é registrado (AGENTS.md §9).
 * - Evidência: uma chave do pacote que o modelo recebeu, com a hierarquia do
 *   pacote; chave fora dele não vira evidência, e o alerta entra como
 *   interpretação da IA (`AI_INTERPRETATION`).
 * - Falha de registro não derruba a proposta: o alerta volta com o motivo.
 */
export async function registerWriterAiAlerts(context: WriterEvidenceContext, input: {
  head: WriterEvidenceHead | null;
  evidence: WriterPromptEvidence;
  alerts: readonly WriterAiAlert[];
  actorUserId: string;
  focus: WriterSectionFocus;
}): Promise<WriterAlertRegistration> {
  const recorded: WriterAlertRegistration["recorded"] = [];
  const alertas = input.alerts.slice(0, WRITER_AI_ALERTS_REGISTERED_MAX);
  if (!alertas.length) return { status: "none", recorded, notRecorded: [] };
  /* Acima do teto, o alerta não é tentado — e volta dito, nunca some. */
  const excedentes = input.alerts.slice(WRITER_AI_ALERTS_REGISTERED_MAX).map(alerta => ({
    message: writerAiAlertMessage(alerta).slice(0, 1000),
    reason: `limite de ${WRITER_AI_ALERTS_REGISTERED_MAX} alertas registrados por proposta; este não foi registrado`,
  }));
  if (!input.head) {
    return {
      status: "not_registered", recorded,
      notRecorded: [
        ...alertas.map(alerta => ({ message: writerAiAlertMessage(alerta), reason: `sem evidência legível do documento; nada foi registrado${input.evidence.notice ? ` (${input.evidence.notice})` : ""}` })),
        ...excedentes,
      ],
    };
  }
  const notRecorded: WriterAlertRegistration["notRecorded"] = [];
  const head = input.head;
  let alvos: WriterDivergenceTargetsOfDocument | null = null;
  let pendente = false;

  for (const alerta of alertas) {
    const message = writerAiAlertMessage(alerta).slice(0, 1000);
    if (pendente) { notRecorded.push({ message, reason: "migration_pendente" }); continue; }
    const objeto = typeof alerta === "string" ? null : alerta;
    const tipo = objeto?.targetKind?.trim() || "article_dna";
    if (!TIPOS_DE_ALVO.has(tipo)) { notRecorded.push({ message, reason: `tipo de alvo desconhecido: ${tipo.slice(0, 40)}` }); continue; }
    try {
      if (!alvos || (tipo === "brand_dna" && !alvos.brand)) alvos = await writerDivergenceTargetsOf(context, head, tipo === "brand_dna");
      const alvo = resolveWriterDivergenceTarget(alvos, { kind: tipo as WriterDivergenceTargetKind, keywordId: objeto?.keywordId?.trim() || undefined });
      if (!alvo.ok) { notRecorded.push({ message, reason: alvo.reason }); continue; }

      const citada = writerSectionSourceOf(input.evidence.package, objeto?.evidenceSourceKey);
      const evidencia: WriterDivergenceEvidence = citada
        ? {
          sourceKey: (objeto?.evidenceSourceKey ?? citada.sourceKey).trim(), path: objeto?.evidencePath?.trim() || null, etag: null,
          level: citada.level, frozen: citada.frozen, observedAt: citada.frozen ? input.evidence.package?.bundle?.observedAt ?? null : null, posteriorAoPacote: false,
        }
        : {
          sourceKey: `ia.interna/${input.focus.kind}`, path: input.focus.id, etag: null,
          level: "AI_INTERPRETATION", frozen: false, observedAt: null, posteriorAoPacote: false,
        };
      const caminho = objeto?.dnaClaimPath?.trim() || CAMINHO_NAO_DECLARADO;
      const linha = writerDivergenceRow({
        brandId: context.brandId, documentId: head.documentId, articleId: head.articleId, target: alvo.target,
        claim: { path: caminho, summary: message }, evidence: evidencia, severity: "alerta", origin: "ia_interna",
        mcpGrantId: null, createdBy: input.actorUserId, note: caminho === CAMINHO_NAO_DECLARADO ? message : null,
      });
      const gravada = await insertWriterDivergence(context, linha);
      recorded.push({ id: gravada.divergence.id, status: gravada.status, message });
    } catch (erro) {
      if (erro instanceof WriterEvidenceError && erro.code === "migration_pendente") { pendente = true; notRecorded.push({ message, reason: "migration_pendente" }); continue; }
      notRecorded.push({ message, reason: erro instanceof WriterEvidenceError ? `${erro.code}: ${erro.message}`.slice(0, 300) : "falha ao registrar; o alerta não foi gravado" });
    }
  }
  notRecorded.push(...excedentes);
  const status: WriterAlertRegistration["status"] = pendente && !recorded.length ? "migration_pendente"
    : !notRecorded.length ? "registered" : recorded.length ? "partial" : "not_registered";
  return { status, recorded, notRecorded };
}

/* ================================ fluxos ================================ */

export type WriterEvidenceSummary = {
  included: boolean;
  bytes: number | null;
  notice: string | null;
  trimmed: Array<{ field: string; kept: number; total: number; readAt: string }>;
};

const resumoDa = (lido: WriterSectionEvidenceRead): WriterEvidenceSummary => ({
  included: Boolean(lido.evidence.package),
  bytes: lido.bytes,
  notice: lido.evidence.notice,
  trimmed: lido.evidence.package?.trimmed ?? [],
});

/** Proposta de seção com o pacote do servidor; alertas viram divergências. */
export async function runWriterSectionProposal(input: {
  context: WriterEvidenceContext;
  actorUserId: string;
  document: ContentDocument;
  sectionId: string;
  humanInstruction: string;
  generate: WriterAiGenerate<z.infer<typeof WriterSectionProviderSchema>>;
}): Promise<{ proposal: RedatorSectionProposal; evidence: WriterEvidenceSummary; divergences: WriterAlertRegistration }> {
  const secao = input.document.blocks.find(block => block.id === input.sectionId && block.type === "heading");
  const focus: WriterSectionFocus = { kind: "section", id: input.sectionId, label: secao && "text" in secao && secao.text.trim() ? secao.text : input.document.title };
  const lido = await readWriterSectionEvidence(input.context, input.document.id, focus);
  const contexto = createSectionPromptContext(input.document, input.sectionId, input.humanInstruction, lido.evidence);
  const gerado = await input.generate({ system: SECTION_WRITING_SYSTEM_PROMPT, user: buildSectionWritingPrompt(contexto) });
  const proposal = RedatorSectionProposalSchema.parse({
    documentId: input.document.id, sectionId: input.sectionId, paragraphs: gerado.paragraphs,
    alerts: gerado.alerts.map(writerAiAlertMessage), humanDecisionRequired: true, origin: "ai",
  });
  const divergences = await registerWriterAiAlerts(input.context, { head: lido.head, evidence: lido.evidence, alerts: gerado.alerts, actorUserId: input.actorUserId, focus });
  return { proposal, evidence: resumoDa(lido), divergences };
}

/** Melhoria de trecho com o pacote do servidor, focado no próprio trecho. */
export async function runWriterImproveProposal(input: {
  context: WriterEvidenceContext;
  actorUserId: string;
  document: ContentDocument;
  selectedText: string;
  humanInstruction: string;
  generate: WriterAiGenerate<z.infer<typeof WriterImproveProviderSchema>>;
}): Promise<{ proposal: RedatorImproveProposal; evidence: WriterEvidenceSummary; divergences: WriterAlertRegistration }> {
  const focus: WriterSectionFocus = { kind: "improve", id: null, label: input.selectedText.slice(0, 300) };
  const lido = await readWriterSectionEvidence(input.context, input.document.id, focus);
  const gerado = await input.generate({ system: IMPROVE_SYSTEM_PROMPT, user: buildImprovePrompt(input.document, input.selectedText, input.humanInstruction, lido.evidence) });
  const proposal = RedatorImproveProposalSchema.parse({
    replacementText: gerado.replacementText, alerts: gerado.alerts.map(writerAiAlertMessage), humanDecisionRequired: true, origin: "ai",
  });
  const divergences = await registerWriterAiAlerts(input.context, { head: lido.head, evidence: lido.evidence, alerts: gerado.alerts, actorUserId: input.actorUserId, focus });
  return { proposal, evidence: resumoDa(lido), divergences };
}
