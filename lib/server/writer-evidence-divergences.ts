import "server-only";

/**
 * ===== DIVERGÊNCIAS ENTRE EVIDÊNCIA E DNA · GRAVAR E LER =====
 *
 * SDD: docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md
 * §5 e §6; adendo D3 (escopo `writer.draft.write`), D5 (tabela própria) e §5
 * (antes da migration). Contrato puro: `lib/redator/writer-evidence-divergence.ts`.
 *
 * O QUE ESTE MÓDULO FAZ, E SÓ ISSO:
 *
 *   - INSERE registro `aberta` em `writer_evidence_divergences`, com o alvo
 *     resolvido contra a linha do documento e a evidência descrita pelo
 *     leitor. Nunca faz UPDATE, nunca DELETE, nunca escreve em DNA, em
 *     `editorial_workflow_items` nem no pacote do Radar;
 *   - LÊ as não encerradas de um documento, com colunas escolhidas, para o
 *     Guardião.
 *
 * Toda consulta filtra `marca_id` (o service role ignora RLS; R4). Sem a
 * migration, a tabela não existe: gravar responde `migration_pendente` e ler
 * devolve vazio com aviso — detectado pelo código do erro (PGRST205/42P01),
 * nunca pela ausência de linhas. Não há gravação alternativa.
 */

import type { VersionReference } from "@/lib/arquiteto/contracts";
import type { GuardianContext, GuardianSubject } from "@/lib/redator/guardian";
import { radarWriterSubjectOf } from "@/lib/redator/radar-subject-turn";
import {
  WRITER_DIVERGENCE_OPEN_STATUSES,
  WRITER_DIVERGENCE_SELECT,
  resolveWriterDivergenceTarget,
  writerDivergenceRow,
  writerOpenDivergenceFromRow,
  type WriterDivergenceRequest,
  type WriterDivergenceRow,
  type WriterDivergenceTargetsOfDocument,
  type WriterOpenDivergence,
} from "@/lib/redator/writer-evidence-divergence";
import {
  WriterEvidenceError,
  isLegacyVersionReference,
  readWriterEvidenceHead,
  writerEvidenceClient,
  writerEvidenceDatabaseFailure,
  writerEvidenceTableMissing,
  type WriterEvidenceContext,
  type WriterEvidenceHead,
} from "@/lib/server/writer-evidence-document";
import { describeWriterEvidenceSource } from "@/lib/server/writer-evidence-reader";
import { readWriterArticleProjection, readWriterBrandContextVersions } from "@/lib/server/writer-evidence-sources";

const TABELA = "writer_evidence_divergences";
const MIGRATION = "20260923150000_writer_evidence_reader";

const migrationPendente = () => new WriterEvidenceError("migration_pendente",
  "A tabela writer_evidence_divergences ainda não existe (migration pendente). Nada foi gravado, nem noutro lugar.",
  { migration: MIGRATION });

/** Códigos com que os gatilhos e CHECKs da tabela recusam: o registro não entra, e a IA recebe o motivo. */
const RECUSAS_DO_BANCO = new Set(["23514", "42501", "23503", "23502", "22001", "P0001"]);

/**
 * O QUE O DOCUMENTO PERMITE APONTAR: as referências fixadas, o pacote do
 * Radar e — só quando pedido — o contexto vigente da Marca (Skills e
 * BrandDNA pela regra do dono).
 */
export async function writerDivergenceTargetsOf(context: WriterEvidenceContext, head: WriterEvidenceHead, withBrand: boolean): Promise<WriterDivergenceTargetsOfDocument> {
  const marca = withBrand ? await readWriterBrandContextVersions(context) : null;
  return {
    articleDnaRef: head.refs.articleDnaRef,
    siloDnaRef: head.refs.siloDnaRef,
    keywordDnaRefs: head.refs.keywordDnaRefs,
    bundle: head.dossier ? { bundleId: head.dossier.bundleId, bundleHash: head.dossier.bundleHash } : null,
    brand: marca ? {
      brandDna: marca.brandDna ? { entityId: marca.brandDna.entityId, versionId: marca.brandDna.versionId, contentHash: marca.brandDna.contentHash } : null,
      skills: marca.skills.map(skill => ({ entityId: skill.entityId, versionId: skill.versionId, contentHash: skill.contentHash })),
    } : null,
  };
}

export type WriterDivergenceRecord = { status: "recorded" | "already_recorded"; divergence: WriterOpenDivergence };

async function releituraPorDedupe(context: WriterEvidenceContext, linha: WriterDivergenceRow): Promise<WriterOpenDivergence | null> {
  const { data, error } = await writerEvidenceClient(context).from(TABELA)
    .select(WRITER_DIVERGENCE_SELECT)
    .eq("marca_id", context.brandId).eq("document_id", linha.document_id).eq("dedupe_key", linha.dedupe_key)
    .maybeSingle();
  if (error) {
    if (writerEvidenceTableMissing(error)) throw migrationPendente();
    writerEvidenceDatabaseFailure(error);
  }
  return data ? writerOpenDivergenceFromRow(data as unknown as Record<string, unknown>) : null;
}

/**
 * GRAVA UM REGISTRO `aberta`, com a releitura do que o banco guardou
 * (sucesso só depois da confirmação real). A mesma divergência de novo é
 * `already_recorded`, pela chave de idempotência.
 */
export async function insertWriterDivergence(context: WriterEvidenceContext, linha: WriterDivergenceRow): Promise<WriterDivergenceRecord> {
  if (linha.marca_id !== context.brandId || linha.status !== "aberta") throw new WriterEvidenceError("divergence_refused", "Registro fora da Marca autorizada ou não aberto.");
  const { data, error } = await writerEvidenceClient(context).from(TABELA)
    .insert(linha)
    .select(WRITER_DIVERGENCE_SELECT)
    .single();
  if (error) {
    if (writerEvidenceTableMissing(error)) throw migrationPendente();
    if (error.code === "23505") {
      const existente = await releituraPorDedupe(context, linha);
      if (!existente) throw new WriterEvidenceError("divergence_refused", "A divergência já existe, mas não pôde ser relida.");
      return { status: "already_recorded", divergence: existente };
    }
    if (RECUSAS_DO_BANCO.has(String(error.code ?? ""))) {
      throw new WriterEvidenceError("divergence_refused", `O banco recusou o registro: ${String(error.message ?? "").slice(0, 200)}`);
    }
    writerEvidenceDatabaseFailure(error);
  }
  const gravada = data ? writerOpenDivergenceFromRow(data as unknown as Record<string, unknown>) : null;
  if (!gravada) throw new WriterEvidenceError("divergence_refused", "O registro gravado não pôde ser relido.");
  return { status: "recorded", divergence: gravada };
}

/**
 * A DIVERGÊNCIA PEDIDA PELA IA EXTERNA (MCP). Origem `ia_mcp`, com o grant
 * que autorizou a chamada — o gatilho da tabela confere de novo Marca, ator,
 * status e escopo do grant. O alvo sai das referências do documento; a
 * evidência, do leitor (a chave precisa ser alcançável, e a hierarquia é
 * calculada aqui, nunca aceita da IA).
 */
export async function recordWriterDivergenceFromMcp(context: WriterEvidenceContext, input: {
  documentId: string;
  request: WriterDivergenceRequest;
  actorUserId: string;
  mcpGrantId: string | null;
}): Promise<WriterDivergenceRecord> {
  if (!input.mcpGrantId) {
    throw new WriterEvidenceError("divergence_requires_grant",
      "Registrar divergência exige uma conexão OAuth com grant ativo e o escopo writer.draft.write; o bearer de diagnóstico não registra.");
  }
  const head = await readWriterEvidenceHead(context, input.documentId);
  const alvos = await writerDivergenceTargetsOf(context, head, input.request.target.kind === "brand_dna");
  const alvo = resolveWriterDivergenceTarget(alvos, input.request.target);
  if (!alvo.ok) throw new WriterEvidenceError("target_not_in_document", alvo.reason);
  const evidencia = await describeWriterEvidenceSource(context, head, input.request.evidence.sourceKey);
  const linha = writerDivergenceRow({
    brandId: context.brandId,
    documentId: head.documentId,
    articleId: head.articleId,
    target: alvo.target,
    claim: input.request.dnaClaim,
    evidence: {
      sourceKey: evidencia.sourceKey,
      path: input.request.evidence.path ?? null,
      /* O etag que a IA declara não é conferível (a página depende de cursor, teto e campos): grava-se a identidade da fonte calculada aqui. */
      etag: evidencia.identityEtag,
      level: evidencia.level,
      frozen: evidencia.frozen,
      observedAt: evidencia.observedAt,
      posteriorAoPacote: evidencia.posteriorAoPacote,
    },
    severity: input.request.severity,
    suggestedOwner: input.request.suggestedOwner ?? null,
    origin: "ia_mcp",
    mcpGrantId: input.mcpGrantId,
    createdBy: input.actorUserId,
  });
  return insertWriterDivergence(context, linha);
}

/* ================================ leitura ================================ */

export const WRITER_OPEN_DIVERGENCES_LIMIT = 50;

export type WriterOpenDivergencesRead =
  | { status: "read"; items: WriterOpenDivergence[]; truncated: boolean }
  | { status: "migration_pendente"; items: []; truncated: false };

/** As não encerradas do documento, mais recentes primeiro, até 50. */
export async function readOpenWriterDivergences(context: WriterEvidenceContext, documentId: string): Promise<WriterOpenDivergencesRead> {
  const { data, error } = await writerEvidenceClient(context).from(TABELA)
    .select(WRITER_DIVERGENCE_SELECT)
    .eq("marca_id", context.brandId).eq("document_id", documentId)
    .in("status", [...WRITER_DIVERGENCE_OPEN_STATUSES])
    .order("created_at", { ascending: false })
    .limit(WRITER_OPEN_DIVERGENCES_LIMIT + 1);
  if (error) {
    if (writerEvidenceTableMissing(error)) return { status: "migration_pendente", items: [], truncated: false };
    writerEvidenceDatabaseFailure(error);
  }
  const linhas = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const items = linhas.slice(0, WRITER_OPEN_DIVERGENCES_LIMIT)
    .map(writerOpenDivergenceFromRow)
    .filter((item): item is WriterOpenDivergence => Boolean(item));
  return { status: "read", items, truncated: linhas.length > WRITER_OPEN_DIVERGENCES_LIMIT };
}

/** O que o Guardião recebe: as divergências e o aviso quando não foi possível lê-las todas. */
export function writerGuardianContextOf(lidas: WriterOpenDivergencesRead): GuardianContext {
  const notices: string[] = [];
  if (lidas.status === "migration_pendente") {
    notices.push("migration_pendente: as divergências registradas não foram lidas; o Guardião emitiu só as análises determinísticas.");
  } else if (lidas.truncated) {
    notices.push(`Mais de ${WRITER_OPEN_DIVERGENCES_LIMIT} divergências abertas: só as ${WRITER_OPEN_DIVERGENCES_LIMIT} mais recentes entraram na análise.`);
  }
  return { divergences: lidas.items, notices };
}

/** Só o motivo ou o código estável do erro, nunca a mensagem do driver (pode trazer dado da linha). */
function codigoDoErro(erro: unknown): string {
  const campo = (nome: "reason" | "code") => erro && typeof erro === "object" && nome in erro ? String((erro as Record<string, unknown>)[nome] ?? "") : "";
  const bruto = campo("reason") || campo("code");
  const limpo = bruto.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40);
  return limpo || "falha_de_leitura";
}

/**
 * O CONTEXTO DO GUARDIÃO, SEM DERRUBAR A ANÁLISE. O Guardião é análise
 * determinística que antes nunca tocava o banco; a leitura das divergências é
 * acréscimo. Falha dessa leitura — além da migration pendente — vira aviso em
 * `notices` e as regras determinísticas seguem. Quem DECIDE com as divergências
 * (a entrega a Publicações) usa `checkOpenBlockingWriterDivergence`, que não
 * engole erro.
 *
 * SDD do Assunto, F4.2 · com `articleDnaRef` (a referência que o PRÓPRIO
 * documento fixa), o contexto também traz o Assunto do ArticleDNA: UMA
 * leitura estreita, só `payload->subject` daquela versão, na Marca do
 * contexto (< 1 kB). É ele que liga os dois avisos do Guardião (virada e link
 * para o destino), que nunca bloqueiam (Q6). Sem a referência, ou referência
 * legada, nada é lido e o contexto é o de antes. Falha dessa leitura também
 * vira aviso: o Guardião segue sem a conferência do Assunto.
 */
export async function readWriterGuardianContext(
  context: WriterEvidenceContext,
  documentId: string,
  opcoes: { articleDnaRef?: VersionReference | null } = {},
): Promise<GuardianContext> {
  const [base, assunto] = await Promise.all([lerContextoDasDivergencias(context, documentId), lerAssuntoDoGuardiao(context, opcoes.articleDnaRef ?? null)]);
  if (!assunto) return base;
  if ("notice" in assunto) return { ...base, notices: [...(base.notices ?? []), assunto.notice] };
  return { ...base, subject: assunto.subject };
}

async function lerContextoDasDivergencias(context: WriterEvidenceContext, documentId: string): Promise<GuardianContext> {
  try {
    return writerGuardianContextOf(await readOpenWriterDivergences(context, documentId));
  } catch (erro) {
    return {
      divergences: [],
      notices: [`divergencias_nao_lidas (${codigoDoErro(erro)}): as divergências registradas não puderam ser lidas agora; o Guardião emitiu só as análises determinísticas.`],
    };
  }
}

/** O Assunto declarado no ArticleDNA fixado, ou `null` quando não há (nem referência lida). */
export async function readWriterGuardianSubject(context: WriterEvidenceContext, articleDnaRef: VersionReference | null): Promise<GuardianSubject | null> {
  if (!articleDnaRef || isLegacyVersionReference(articleDnaRef)) return null;
  const projecao = await readWriterArticleProjection(context, { refs: { articleDnaRef } }, ["subject"]);
  const assunto = radarWriterSubjectOf(projecao?.fields.subject);
  return assunto ? { phrase: assunto.phrase, destinationUrl: assunto.destinationUrl } : null;
}

async function lerAssuntoDoGuardiao(
  context: WriterEvidenceContext,
  articleDnaRef: VersionReference | null,
): Promise<{ subject: GuardianSubject } | { notice: string } | null> {
  try {
    const subject = await readWriterGuardianSubject(context, articleDnaRef);
    return subject ? { subject } : null;
  } catch (erro) {
    return { notice: `assunto_nao_lido (${codigoDoErro(erro)}): o Assunto do ArticleDNA não pôde ser lido agora; o Guardião não conferiu a virada nem o link para o destino.` };
  }
}

export type WriterBlockingDivergenceCheck =
  | { status: "read"; blocking: boolean }
  | { status: "migration_pendente"; blocking: false };

/**
 * HÁ DIVERGÊNCIA NÃO ENCERRADA QUE UMA PESSOA MARCOU COMO BLOQUEANTE? É a
 * regra do Guardião (`bloqueante` → `blocked`) sem o teto de 50 da leitura de
 * exibição: filtra no banco e traz no máximo um id. GET, não HEAD: o
 * PostgREST responde HEAD de tabela inexistente com 404 sem corpo, e o
 * supabase-js transforma isso em sucesso vazio — a migration pendente
 * passaria por "nenhuma bloqueante" sem o código PGRST205. Sem a migration
 * não existe registro, nem bloqueante; qualquer outro erro LANÇA, porque quem
 * chama decide entregar ou não.
 */
export async function checkOpenBlockingWriterDivergence(context: WriterEvidenceContext, documentId: string): Promise<WriterBlockingDivergenceCheck> {
  const { data, error } = await writerEvidenceClient(context).from(TABELA)
    .select("id")
    .eq("marca_id", context.brandId).eq("document_id", documentId)
    .in("status", [...WRITER_DIVERGENCE_OPEN_STATUSES])
    .eq("severity", "bloqueante")
    .limit(1);
  if (error) {
    if (writerEvidenceTableMissing(error)) return { status: "migration_pendente", blocking: false };
    writerEvidenceDatabaseFailure(error);
  }
  if (!Array.isArray(data)) throw new WriterEvidenceError("divergence_refused", "A consulta de divergências bloqueantes não voltou do banco.");
  return { status: "read", blocking: data.length > 0 };
}
