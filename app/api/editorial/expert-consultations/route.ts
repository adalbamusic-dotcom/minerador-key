import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthzError, assertCanAccessMarca, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { telegramPlatformBotUsername } from "@/lib/server/telegram/canonical";
import {
  createBrandExpert,
  createExpertBrief,
  getExpertBrief,
  issueTelegramOnboardingToken,
  listActiveBrandExperts,
  listActiveTelegramBindingsForExpert,
  listBrandExpertBindings,
  listExpertBriefsForContext,
  listTelegramOnboardingTokens,
  revokeOpenTelegramOnboardingTokens,
} from "@/lib/server/telegram/persistence";
import { radarSpecialistDraftFromRequirement, radarSpecialistDuplicateDraft, radarSpecialistRequirementIdOf } from "@/lib/radar/specialist-lifecycle";
import {
  RADAR_SPECIALIST_PROVISIONAL_NAME,
  radarSpecialistConsultationContext,
  radarSpecialistInviteLink,
  radarSpecialistInviteMessage,
  radarSpecialistInviteState,
  radarSpecialistIsProvisionalName,
  radarSpecialistConsultationOf,
} from "@/lib/radar/specialist-consultation";

/**
 * CRIAR UMA CONSULTA — o convite que não exige cadastro prévio.
 *
 * ======================= POR QUE ESTA ROTA EXISTE =======================
 *
 * A rota equivalente da área Marca exige `brand:manage`, porque administrar
 * especialistas é ato de gestão. Convidar alguém para revisar um ponto é ato
 * EDITORIAL, e quem o pratica tem `radar:edit`. Reaproveitar a rota de Marca
 * obrigaria o operador do Radar a ter permissão de gestão da marca só para
 * pedir uma opinião — ou obrigaria a afrouxar a permissão de gestão.
 *
 * ============================ O QUE ELA FAZ ============================
 *
 *   1. cria (ou reusa) um participante externo provisório
 *   2. cria (ou reusa) a pauta DRAFT do ponto de revisão
 *   3. emite o token one-time de onboarding que já existia
 *   4. devolve o deep link para o operador copiar
 *
 * ========================= O QUE ELA NÃO FAZ =========================
 *
 * NÃO ENVIA NADA. Nem Telegram, nem e-mail, nem `sent_at`. Criar a consulta é
 * o convite; o pedido continua sendo outra decisão, com outro clique, na rota
 * de envio. `PREPARED != SENT` atravessa esta rota inteira.
 *
 * Nenhuma migration foi criada para isto: `brand_experts` já era, por comentário
 * da própria migration de fundação, "especialista de domínio da Marca; não
 * exige login e não é membership de usuário".
 */

const RequirementSchema = z.object({
  requirementId: z.string().trim().min(1).max(200),
  claimId: z.string().trim().min(1).max(200),
  kind: z.string().trim().min(1).max(80),
  priority: z.string().trim().min(1).max(40),
  specificQuestion: z.string().trim().min(1).max(4000),
  topic: z.string().trim().max(400).optional(),
  claim: z.string().trim().max(1000).optional(),
  whyReviewIsNeeded: z.string().trim().max(2000).optional(),
  ymylRelevance: z.string().trim().max(80).optional(),
  marketObservation: z.string().trim().max(2000).optional(),
  factualEvidence: z.string().trim().max(2000).optional(),
  conflict: z.string().trim().max(2000).nullable().optional(),
  sourceCandidates: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
  provenance: z.string().trim().max(2000).optional(),
}).strict();

const ConsultationRequestSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
  articleDnaVersionId: z.string().trim().min(1).max(256),
  requirement: RequirementSchema,
  /** O contexto do Radar que a pauta já carregava. */
  radarContext: z.record(z.string(), z.unknown()).default({}),
  /**
   * `reissue` é a resposta honesta ao token que não volta do banco.
   *
   * Depois de um F5 o link não existe mais em lugar nenhum: só o hash foi
   * persistido. Em vez de esconder o botão — o defeito de runtime deste gate —
   * a tela oferece gerar outro, e o anterior é REVOGADO no mesmo ato.
   */
  action: z.enum(["create", "reissue"]).default("create"),
}).strict();

const ConsultationQuerySchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
  articleDnaVersionId: z.string().trim().min(1).max(256),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = ConsultationRequestSchema.parse(await request.json());
    await assertCanAccessMarca(profile.userId, input.brandId, profile);
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");

    const client = createCanonicalServiceClient();
    const escopo = { brandId: input.brandId, articleId: input.articleId, articleDnaVersionId: input.articleDnaVersionId };

    /*
     * A PAUTA GÊMEA MANDA — inclusive sobre quem é o participante.
     *
     * Clicar duas vezes em "Criar consulta" não pode criar dois participantes
     * nem duas pautas para o mesmo ponto. Quando a pauta já existe, o convite
     * é reemitido para o MESMO participante: o token é de uso único e expira em
     * 24h, então reemitir é a única forma de recuperar um link perdido.
     */
    const existentes = await listExpertBriefsForContext(escopo, client);
    const gemea = radarSpecialistDuplicateDraft({ requirementId: input.requirement.requirementId, briefs: existentes });

    const expertId = gemea?.expertId || (await createBrandExpert({
      brandId: input.brandId,
      displayName: RADAR_SPECIALIST_PROVISIONAL_NAME,
      createdBy: profile.userId,
      metadata: {
        origin: "radar_specialist_consultation",
        articleId: input.articleId,
        articleDnaVersionId: input.articleDnaVersionId,
        requirementId: input.requirement.requirementId,
      },
    }, client)).id;

    const consulta = radarSpecialistConsultationContext({
      ...escopo,
      requirementId: input.requirement.requirementId,
      invitedBy: profile.userId,
      invitedAt: new Date().toISOString(),
    });

    let brief = gemea;
    if (!brief) {
      const projetada = radarSpecialistDraftFromRequirement({ requirement: input.requirement, ...escopo, expertId });
      /*
       * DRAFT, e nada além disso. A pauta nasce sem `sent_at` e sem aprovação:
       * criar a consulta é convidar, não pedir.
       */
      const criada = await createExpertBrief({
        ...escopo,
        expertId,
        title: projetada.title,
        radarContext: { ...input.radarContext, specialistRequirement: projetada.radarContext, consultation: consulta },
        questions: projetada.questions,
        status: "draft",
        createdBy: profile.userId,
      }, client);
      const readback = await getExpertBrief({ ...escopo, briefId: criada.id, expertId }, client);
      if (!readback) throw new AuthzError(503, "A consulta foi criada, mas o readback compatível não foi confirmado.");
      brief = readback;
    }

    if (radarSpecialistRequirementIdOf(brief.radarContext) !== input.requirement.requirementId) {
      throw new AuthzError(409, "A pauta encontrada não pertence a este ponto de revisão.");
    }

    /*
     * JÁ CONECTADO NÃO PRECISA DE LINK NOVO.
     *
     * Emitir outro token para quem já entrou criaria um convite órfão — e, pior,
     * um segundo `/start` recusaria o vínculo com `TELEGRAM_BINDING_ALREADY_EXISTS`,
     * deixando o especialista diante de um erro que ele não causou.
     */
    const vinculos = await listActiveTelegramBindingsForExpert({ brandId: input.brandId, expertId }, client);
    if (vinculos.length) {
      return NextResponse.json({
        brief, expertId, consultation: consulta,
        connected: true,
        invite: null,
        notification: "NOT_SENT",
      }, { headers: noStoreHeaders });
    }

    /*
     * UM CONVITE ABERTO POR VEZ.
     *
     * Sem revogar, cada "gerar novo link" deixaria mais uma URL válida
     * circulando por WhatsApp e e-mail, todas abrindo a mesma consulta — e um
     * convite de uso único que se multiplica não é de uso único.
     */
    const revogados = input.action === "reissue" ? await revokeOpenTelegramOnboardingTokens({ brandId: input.brandId, expertId }, client) : 0;
    const token = await issueTelegramOnboardingToken({ brandId: input.brandId, expertId, createdBy: profile.userId }, client);
    const botUsername = await telegramPlatformBotUsername(client);
    const link = radarSpecialistInviteLink({ botUsername, token: token.token });

    return NextResponse.json({
      brief, expertId, consultation: consulta,
      connected: false,
      invite: { link, message: radarSpecialistInviteMessage({ link }), botUsername, expiresAt: token.expiresAt, revokedPrevious: revogados },
      /* O convite é copiado por uma pessoa. Nada sai daqui sozinho. */
      notification: "NOT_SENT",
    }, { status: gemea ? 200 : 201, headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados da consulta inválidos.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
}

/**
 * A CONSULTA, LIDA DO BANCO — SPECIALIST_2.1.1 · §3.
 *
 * O DEFEITO QUE ISTO CONSERTA: o POST devolvia participante, pauta e link, e
 * a tela guardava tudo em estado de React. O primeiro F5 apagava a memória e
 * a área voltava a pedir "Selecionar especialista" — com a consulta inteira
 * gravada no banco, a três tabelas de distância.
 *
 * A autoridade da consulta é REMOTA. Esta projeção é o que a tela lê ao abrir,
 * e o POST deixa de ser a única fonte de verdade sobre o que existe.
 *
 * O TOKEN NÃO VOLTA AQUI. `telegram_onboarding_tokens` guarda o hash; o link
 * só existiu na resposta que o criou. O que volta é o ESTADO do convite, para
 * a tela oferecer "gerar novo link" em vez de esconder o botão.
 */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = ConsultationQuerySchema.safeParse({
      brandId: params.get("brandId") || "",
      articleId: params.get("articleId") || "",
      articleDnaVersionId: params.get("articleDnaVersionId") || "",
    });
    if (!query.success) return NextResponse.json({ error: "Contexto da consulta inválido." }, { status: 400, headers: noStoreHeaders });

    const profile = await requireCanonicalSessionProfile();
    await assertCanAccessMarca(profile.userId, query.data.brandId, profile);
    await assertEditorialPermission(profile, query.data.brandId, "radar", "view");
    const client = createCanonicalServiceClient();

    const [participantes, pautas, vinculos] = await Promise.all([
      listActiveBrandExperts(query.data.brandId, client),
      listExpertBriefsForContext(query.data, client),
      listBrandExpertBindings(query.data.brandId, client),
    ]);

    const doConvite = pautas.filter(brief => radarSpecialistConsultationOf(brief.radarContext));
    const convites = await listTelegramOnboardingTokens({ brandId: query.data.brandId, expertIds: [...new Set(doConvite.map(brief => brief.expertId))] }, client);

    const porParticipante = new Map(participantes.map(item => [item.id, item]));
    const ativos = new Set(vinculos.filter(item => item.status === "active").map(item => item.expertId));

    const consultations = doConvite.map(brief => {
      const consulta = radarSpecialistConsultationOf(brief.radarContext);
      const connected = ativos.has(brief.expertId);
      const meus = convites.filter(item => item.expertId === brief.expertId);
      return {
        requirementId: radarSpecialistRequirementIdOf(brief.radarContext),
        consultationId: consulta?.consultationId || null,
        /* O participante da consulta É a autoridade dela: nada a selecionar. */
        participant: porParticipante.get(brief.expertId)
          ? { id: brief.expertId, displayName: porParticipante.get(brief.expertId)?.displayName || null, provisional: radarSpecialistIsProvisionalName(porParticipante.get(brief.expertId)?.displayName) }
          : { id: brief.expertId, displayName: null, provisional: true },
        briefId: brief.id,
        status: brief.status,
        sentAt: brief.sentAt,
        connected,
        invite: { state: radarSpecialistInviteState({ tokens: meus, connected }), expiresAt: meus.find(item => !item.usedAt && !item.revokedAt)?.expiresAt || null },
      };
    });

    return NextResponse.json({ consultations, botUsername: await telegramPlatformBotUsername(client) }, { headers: noStoreHeaders });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
}
