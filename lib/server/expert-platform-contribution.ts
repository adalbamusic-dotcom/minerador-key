import "server-only";
import { randomUUID } from "node:crypto";
import { createExpertBrief, getExpertBrief, getExpertContribution, listActiveBrandExperts, listExpertBriefsForContext } from "./telegram/persistence";
import { radarSpecialistRequirementIdOf } from "@/lib/radar/specialist-lifecycle";
import type { createCanonicalServiceClient } from "./canonical-authorization";

/**
 * ===== O PARECER DIRETO DO ESPECIALISTA NA PLATAFORMA — SDD Radar 2026-09-30, Parte B =====
 *
 * Irmão de `insertTelegramContribution`: o especialista com acesso à
 * plataforma escreve o parecer na aba Especialista, e ele segue EXATAMENTE o
 * caminho das respostas do Telegram (D2): entra como "Contribuição a revisar",
 * alguém decide (aceitar como evidência, apoio, citação ou rejeitar) e só então
 * vai ao pacote — ao Redator e ao CSV.
 *
 * Tipos:
 *   - RESPOSTA   responde a um ponto de revisão da investigação (Google);
 *   - FECHAMENTO, CTA, DIRETRIZ   parecer livre, sem ponto: ganha uma pauta
 *     própria com um ponto SINTÉTICO (`direto:<tipo>:<id>`). É por ele que o
 *     parecer entra na camada do especialista pela mesma porta das respostas,
 *     sem afrouxar a regra de que todo item aponta para um ponto.
 *
 * Grava com a migration 20260930120000 (canal `platform` e `authored_by`).
 * Sem ela aplicada, recusa com a instrução, e nada fica pela metade.
 */

export const PLATFORM_CONTRIBUTION_KINDS = ["RESPOSTA", "FECHAMENTO", "CTA", "DIRETRIZ"] as const;
export type PlatformContributionKind = typeof PLATFORM_CONTRIBUTION_KINDS[number];
export const PLATFORM_CONTRIBUTION_MAX_CHARS = 20000;
export const PLATFORM_DIRECT_REQUIREMENT_PREFIX = "direto:";

const ROTULO: Record<Exclude<PlatformContributionKind, "RESPOSTA">, { titulo: string; pergunta: string }> = {
  FECHAMENTO: { titulo: "Fechamento do artigo (parecer direto)", pergunta: "Como o especialista fecha este artigo: conclusão, recado final e o que o leitor deve levar." },
  CTA: { titulo: "Argumentação do CTA (parecer direto)", pergunta: "Que argumento o especialista usa para o chamado à ação deste artigo." },
  DIRETRIZ: { titulo: "Diretriz de conteúdo (parecer direto)", pergunta: "Que diretriz o especialista dá para o conteúdo deste artigo." },
};

export class PlatformContributionError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status: number) { super(message); this.code = code; this.status = status; }
}

type Client = ReturnType<typeof createCanonicalServiceClient>;

export async function submitPlatformExpertContribution(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  expertId: string;
  kind: PlatformContributionKind;
  text: string;
  actorUserId: string;
  /** RESPOSTA: o ponto de revisão respondido (id, pergunta e tipo, como a tela os mostra). */
  requirement?: { id: string; question: string | null; kind: string | null } | null;
}, client: Client): Promise<{ contributionId: string; briefId: string; readbackConfirmed: true }> {
  const texto = input.text.trim();
  if (!texto) throw new PlatformContributionError("empty_text", "Escreva o parecer antes de enviar.", 400);
  if (texto.length > PLATFORM_CONTRIBUTION_MAX_CHARS) throw new PlatformContributionError("text_too_long", `O parecer passa de ${PLATFORM_CONTRIBUTION_MAX_CHARS} caracteres.`, 400);
  if (input.kind === "RESPOSTA" && !input.requirement?.id) throw new PlatformContributionError("requirement_required", "Escolha o ponto de revisão que o parecer responde.", 400);

  /*
   * A MIGRATION PRIMEIRO, ANTES DE QUALQUER ESCRITA. A coluna `authored_by` e o
   * canal `platform` entram na MESMA transação da migration: ler a coluna prova
   * as duas. Sem ela, nenhuma pauta é criada (nada fica órfão).
   */
  const coluna = await client.from("expert_contributions").select("authored_by").limit(1);
  if (coluna.error) throw new PlatformContributionError("migration_pending", "O parecer direto ainda não pode ser gravado: falta aplicar a migration 20260930120000_expert_contribution_platform_channel.sql no banco. Nada foi gravado.", 503);

  const experts = await listActiveBrandExperts(input.brandId, client);
  if (!experts.some(expert => expert.id === input.expertId)) throw new PlatformContributionError("expert_not_found", "Especialista não encontrado ou não utilizável nesta Marca.", 404);

  /* A pauta: a do ponto, quando já existe para este especialista; senão, uma nova, já esperando revisão. */
  const requirementId = input.kind === "RESPOSTA" ? input.requirement!.id : `${PLATFORM_DIRECT_REQUIREMENT_PREFIX}${input.kind.toLowerCase()}:${randomUUID()}`;
  let briefId: string | null = null;
  if (input.kind === "RESPOSTA") {
    const existentes = await listExpertBriefsForContext({ brandId: input.brandId, expertId: input.expertId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId }, client);
    briefId = existentes.find(pauta => radarSpecialistRequirementIdOf(pauta.radarContext) === requirementId)?.id ?? null;
  }
  if (!briefId) {
    const rotulo = input.kind === "RESPOSTA" ? null : ROTULO[input.kind];
    const criada = await createExpertBrief({
      brandId: input.brandId,
      expertId: input.expertId,
      articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
      title: rotulo?.titulo ?? (input.requirement?.question || "Resposta a ponto de revisão (parecer direto)").slice(0, 240),
      radarContext: {
        specialistRequirement: {
          requirementId,
          kind: input.kind === "RESPOSTA" ? input.requirement?.kind ?? "REVIEW_POINT" : input.kind,
          question: rotulo?.pergunta ?? input.requirement?.question ?? null,
        },
        channel: "platform",
      },
      questions: [],
      status: "awaiting_review",
      createdBy: input.actorUserId,
    }, client);
    briefId = criada.id;
  }

  const inserido = await client.from("expert_contributions").insert({
    brand_id: input.brandId,
    expert_id: input.expertId,
    brief_id: briefId,
    provider: "platform",
    bot_key: "platform",
    external_update_id: `platform:${randomUUID()}`,
    source_type: "TEXT",
    original_text: texto,
    original_metadata: { channel: "platform", kind: input.kind },
    processing_status: "RECEIVED",
    authored_by: input.actorUserId,
  }).select("id").single();
  if (inserido.error) {
    const codigo = String((inserido.error as { code?: string }).code || "");
    // 23514: o CHECK antigo recusa 'platform'; 42703/PGRST204: a coluna authored_by não existe.
    if (["23514", "42703", "PGRST204"].includes(codigo)) {
      throw new PlatformContributionError("migration_pending", "O parecer direto ainda não pode ser gravado: falta aplicar a migration 20260930120000_expert_contribution_platform_channel.sql no banco. Nada foi gravado como resposta.", 503);
    }
    throw new PlatformContributionError("insert_failed", "Não foi possível gravar o parecer do especialista.", 503);
  }
  const contributionId = String(inserido.data.id);

  /* A pauta que já existia (RESPOSTA) passa a esperar revisão, como no Telegram. */
  await client.from("expert_briefs").update({ status: "awaiting_review", updated_at: new Date().toISOString() })
    .eq("brand_id", input.brandId).eq("id", briefId)
    .in("status", ["draft", "ready_to_send", "awaiting_expert", "receiving", "reviewed"]);

  const lida = await getExpertContribution({ brandId: input.brandId, contributionId, briefId }, client);
  const pauta = await getExpertBrief({ brandId: input.brandId, briefId, expertId: input.expertId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId }, client);
  if (!lida || !pauta) throw new PlatformContributionError("readback_failed", "O parecer foi enviado, mas a releitura não confirmou. Atualize a aba antes de tentar de novo.", 503);
  return { contributionId, briefId, readbackConfirmed: true };
}
