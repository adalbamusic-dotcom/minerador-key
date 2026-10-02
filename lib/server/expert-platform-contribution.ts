import "server-only";
import { randomUUID } from "node:crypto";
import { createBrandExpert, createExpertBrief, getExpertBrief, getExpertContribution, listActiveBrandExperts, listExpertBriefsForContext, persistExpertBriefRadarContext } from "./telegram/persistence";
import { radarContextWithSpecialistReview, radarSpecialistReviewsOf } from "@/lib/radar/specialist-contribution-review";
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
/** "Eu mesmo": quem está logado escreve o parecer (SDD Radar 2026-09-30, B2.1). */
export const PLATFORM_SELF_EXPERT = "self";

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

/**
 * "EU MESMO" — o usuário logado vira o especialista daquela Marca.
 *
 * A SDD previa a opção e ela não existia: com a Marca sem especialista
 * cadastrado, o campo do parecer nem aparecia. O registro é o mesmo
 * `brand_experts` de sempre; o vínculo com quem digita vai no `metadata`
 * (`platformUserId`), e a segunda vez reaproveita o mesmo registro.
 */
/** O especialista escolhido é o registro "Eu mesmo" de quem está logado? */
async function expertIsActor(brandId: string, expertId: string, actorUserId: string, client: Client): Promise<boolean> {
  const linha = await client.from("brand_experts").select("id").eq("brand_id", brandId).eq("id", expertId)
    .contains("metadata", { platformUserId: actorUserId }).limit(1);
  return !linha.error && Boolean((linha.data || []).length);
}

async function resolveSelfExpert(brandId: string, actorUserId: string, client: Client): Promise<string> {
  const existente = await client.from("brand_experts").select("id").eq("brand_id", brandId).eq("status", "active")
    .contains("metadata", { platformUserId: actorUserId }).limit(1);
  if (existente.error) throw new PlatformContributionError("expert_lookup_failed", "Não foi possível conferir o especialista desta Marca.", 503);
  const achado = (existente.data || [])[0] as { id?: string } | undefined;
  if (achado?.id) return String(achado.id);
  let nome = "Especialista da equipe";
  try {
    const usuario = await client.auth.admin.getUserById(actorUserId);
    const dados = usuario.data.user;
    const meta = (dados?.user_metadata || {}) as Record<string, unknown>;
    const candidato = [meta.full_name, meta.name, dados?.email?.split("@")[0]].find(valor => typeof valor === "string" && valor.trim());
    if (typeof candidato === "string") nome = candidato.trim().slice(0, 160);
  } catch {
    // Sem o nome do Auth, o rótulo genérico basta: a autoria fica em `authored_by`.
  }
  const criado = await createBrandExpert({ brandId, displayName: nome, createdBy: actorUserId, metadata: { origin: "platform_self", platformUserId: actorUserId } }, client);
  return criado.id;
}

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
}, client: Client): Promise<{ contributionId: string; briefId: string; readbackConfirmed: true; accepted: boolean }> {
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

  const expertId = input.expertId === PLATFORM_SELF_EXPERT ? await resolveSelfExpert(input.brandId, input.actorUserId, client) : input.expertId;
  /*
   * D3 (SDD diretriz editorial, 2026-10-02): o parecer escrito pelo PRÓPRIO
   * especialista logado entra já aceito. Quem escreve é quem decide; o passo de
   * aceitar só faz sentido para o que chega de outra pessoa (Telegram, outro
   * especialista da lista).
   */
  const proprio = input.expertId === PLATFORM_SELF_EXPERT || await expertIsActor(input.brandId, expertId, input.actorUserId, client);
  const experts = await listActiveBrandExperts(input.brandId, client);
  if (!experts.some(expert => expert.id === expertId)) throw new PlatformContributionError("expert_not_found", "Especialista não encontrado ou não utilizável nesta Marca.", 404);

  /* A pauta: a do ponto, quando já existe para este especialista; senão, uma nova, já esperando revisão. */
  const requirementId = input.kind === "RESPOSTA" ? input.requirement!.id : `${PLATFORM_DIRECT_REQUIREMENT_PREFIX}${input.kind.toLowerCase()}:${randomUUID()}`;
  let briefId: string | null = null;
  if (input.kind === "RESPOSTA") {
    const existentes = await listExpertBriefsForContext({ brandId: input.brandId, expertId: expertId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId }, client);
    briefId = existentes.find(pauta => radarSpecialistRequirementIdOf(pauta.radarContext) === requirementId)?.id ?? null;
  }
  if (!briefId) {
    const rotulo = input.kind === "RESPOSTA" ? null : ROTULO[input.kind];
    const criada = await createExpertBrief({
      brandId: input.brandId,
      expertId: expertId,
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
    expert_id: expertId,
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
  const pauta = await getExpertBrief({ brandId: input.brandId, briefId, expertId: expertId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId }, client);
  if (!lida || !pauta) throw new PlatformContributionError("readback_failed", "O parecer foi enviado, mas a releitura não confirmou. Atualize a aba antes de tentar de novo.", 503);
  if (!proprio) return { contributionId, briefId, readbackConfirmed: true, accepted: false };

  /* O aceite do próprio autor, pelo mesmo registro da revisão, com releitura. */
  const radarContext = radarContextWithSpecialistReview({
    radarContext: pauta.radarContext,
    contributionId,
    review: { decision: "ACCEPTED_EVIDENCE", classification: null, relatedRequirementId: null, decidedAt: new Date().toISOString(), decidedBy: input.actorUserId },
  });
  await persistExpertBriefRadarContext({ brandId: input.brandId, briefId, expertId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId, radarContext }, client);
  const relida = await getExpertBrief({ brandId: input.brandId, briefId, expertId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId }, client);
  const aceita = relida ? radarSpecialistReviewsOf(relida.radarContext)[contributionId]?.decision === "ACCEPTED_EVIDENCE" : false;
  if (!aceita) throw new PlatformContributionError("accept_readback_failed", "O parecer foi gravado, mas o aceite não se confirmou na releitura. Aceite em Respostas recebidas.", 503);
  return { contributionId, briefId, readbackConfirmed: true, accepted: true };
}

/**
 * REEDITAR O PRÓPRIO PARECER (pedido do dono, 2026-10-02).
 *
 * Só o autor reedita, e só o que veio pela plataforma: resposta do Telegram é a
 * fala original de outra pessoa e não se reescreve. O texto anterior não some:
 * vai para `original_metadata.edits`, com data e autor da edição.
 */
export async function updatePlatformExpertContribution(input: {
  brandId: string;
  contributionId: string;
  text: string;
  actorUserId: string;
}, client: Client): Promise<{ contributionId: string; readbackConfirmed: true }> {
  const texto = input.text.trim();
  if (!texto) throw new PlatformContributionError("empty_text", "Escreva o parecer antes de salvar.", 400);
  if (texto.length > PLATFORM_CONTRIBUTION_MAX_CHARS) throw new PlatformContributionError("text_too_long", `O parecer passa de ${PLATFORM_CONTRIBUTION_MAX_CHARS} caracteres.`, 400);
  const lida = await client.from("expert_contributions").select("id,provider,authored_by,original_text,original_metadata")
    .eq("brand_id", input.brandId).eq("id", input.contributionId).maybeSingle();
  if (lida.error) throw new PlatformContributionError("read_failed", "Não foi possível ler o parecer.", 503);
  const linha = lida.data as { provider?: string; authored_by?: string | null; original_text?: string | null; original_metadata?: Record<string, unknown> | null } | null;
  if (!linha) throw new PlatformContributionError("not_found", "Parecer não encontrado nesta Marca.", 404);
  if (linha.provider !== "platform" || linha.authored_by !== input.actorUserId) {
    throw new PlatformContributionError("not_author", "Só quem escreveu o parecer na plataforma pode reeditá-lo.", 403);
  }
  if ((linha.original_text || "").trim() === texto) return { contributionId: input.contributionId, readbackConfirmed: true };
  const meta = (linha.original_metadata && typeof linha.original_metadata === "object") ? linha.original_metadata : {};
  const edicoes = Array.isArray((meta as { edits?: unknown }).edits) ? (meta as { edits: unknown[] }).edits : [];
  const gravada = await client.from("expert_contributions").update({
    original_text: texto,
    original_metadata: { ...meta, edits: [...edicoes, { previousText: linha.original_text || "", editedAt: new Date().toISOString(), editedBy: input.actorUserId }] },
  }).eq("brand_id", input.brandId).eq("id", input.contributionId);
  if (gravada.error) throw new PlatformContributionError("update_failed", "Não foi possível salvar o parecer.", 503);
  const relida = await client.from("expert_contributions").select("original_text").eq("brand_id", input.brandId).eq("id", input.contributionId).maybeSingle();
  if (relida.error || ((relida.data as { original_text?: string } | null)?.original_text || "").trim() !== texto) {
    throw new PlatformContributionError("readback_failed", "O parecer foi salvo, mas a releitura não confirmou. Atualize a área antes de tentar de novo.", 503);
  }
  return { contributionId: input.contributionId, readbackConfirmed: true };
}
