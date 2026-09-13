import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthzError, assertCanAccessMarca, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { createCanonicalServiceClient } from "@/lib/server/canonical-authorization";
import { getExpertBrief, getExpertContribution, persistExpertBriefRadarContext } from "@/lib/server/telegram/persistence";
import {
  RADAR_SPECIALIST_CLASSIFICATIONS,
  RADAR_SPECIALIST_DECISIONS,
  radarContextWithSpecialistReview,
  radarSpecialistReviewsOf,
} from "@/lib/radar/specialist-contribution-review";

/**
 * A DECISÃO HUMANA SOBRE UMA CONTRIBUIÇÃO — SPECIALIST_3 · §6 e §13.
 *
 * ========================= O QUE ESTA ROTA CORRIGE =========================
 *
 * Aceitar, apoiar, citar ou rejeitar era gravado em `localStorage`. Isso
 * satisfaz o F5 e mais nada: abrir o Radar em outra máquina, em outro navegador
 * ou na Vercel depois de decidir no local mostrava tudo "aguardando decisão"
 * de novo. A decisão é do ARTIGO, não do navegador de quem decidiu.
 *
 * O gate é explícito: autoridade = remoto.
 *
 * ====================== POR QUE DENTRO DO `radar_context` ======================
 *
 * `expert_contributions` não tem coluna de decisão, e este gate não autoriza
 * migration. `expert_briefs.radar_context` é jsonb, é escrito somente pelo
 * Radar, e a pauta já é dona das contribuições pela chave estrangeira —
 * `fk_expert_contribution_brief_brand`. Guardar a decisão ali a torna remota
 * sem abrir uma autoridade paralela à da pauta.
 *
 * As outras duas colunas jsonb da contribuição estão OCUPADAS por processos
 * assíncronos: `extraction_payload` é sobrescrito pelo writeback da
 * transcrição e `organization_payload` pelo da organização. Uma decisão tomada
 * antes do áudio terminar de transcrever seria apagada pelo worker.
 *
 * ========================== O QUE ELA NÃO FAZ ==========================
 *
 * NÃO organiza, NÃO classifica sozinha e NÃO promove nada a evidência por
 * conta própria: `decision` chega no corpo porque uma pessoa clicou. Extrair
 * continua sendo diferente de aceitar — §8.
 */

const ReviewRequestSchema = z.object({
  brandId: z.string().uuid(),
  articleId: z.string().trim().min(1).max(256),
  articleDnaVersionId: z.string().trim().min(1).max(256),
  briefId: z.string().uuid(),
  contributionId: z.string().uuid(),
  decision: z.enum(RADAR_SPECIALIST_DECISIONS),
  /** A correção humana da classificação sugerida. `null` mantém a sugestão. */
  classification: z.enum(RADAR_SPECIALIST_CLASSIFICATIONS).nullable().default(null),
  /** A associação manual do §4 — só para contribuição de pauta avulsa. */
  relatedRequirementId: z.string().trim().min(1).max(200).nullable().default(null),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = ReviewRequestSchema.parse(await request.json());
    await assertCanAccessMarca(profile.userId, input.brandId, profile);
    /*
     * DECIDIR SOBRE EVIDÊNCIA É ATO EDITORIAL, e por isso `radar:edit`.
     *
     * Não é gestão de Marca: quem opera a revisão de um artigo precisa poder
     * aceitar o que um especialista respondeu sem ter permissão para
     * administrar a marca inteira.
     */
    await assertEditorialPermission(profile, input.brandId, "radar", "edit");

    const client = createCanonicalServiceClient();
    const brief = await getExpertBrief({
      brandId: input.brandId,
      briefId: input.briefId,
      articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
    }, client);
    if (!brief) throw new AuthzError(404, "Pauta não encontrada neste contexto de artigo e versão do ArticleDNA.");

    /*
     * A CONTRIBUIÇÃO PRECISA SER DESTA PAUTA — e a checagem é no banco.
     *
     * Sem ela, um corpo com o id de uma contribuição de outro artigo gravaria a
     * decisão no `radar_context` daqui: a evidência apareceria sustentando um
     * ponto que ela nunca respondeu.
     */
    const contribuicao = await getExpertContribution({
      brandId: input.brandId,
      expertId: brief.expertId,
      briefId: brief.id,
      contributionId: input.contributionId,
    }, client);
    if (!contribuicao) throw new AuthzError(404, "Contribuição não encontrada nesta pauta.");

    /*
     * CLICAR DE NOVO NA MESMA DECISÃO NÃO É UMA DECISÃO NOVA — §10.
     *
     * Sem esta guarda, o segundo clique reescreve `decidedAt` e `decidedBy`: o
     * histórico passaria a dizer que a pessoa decidiu às 23:04 uma coisa que
     * ela decidiu às 22:53. Nada muda no banco e a resposta diz isso.
     */
    const gravadaAntes = radarSpecialistReviewsOf(brief.radarContext)[input.contributionId] || null;
    if (gravadaAntes
      && gravadaAntes.decision === input.decision
      && gravadaAntes.classification === input.classification
      && gravadaAntes.relatedRequirementId === input.relatedRequirementId) {
      return NextResponse.json({
        brief,
        review: gravadaAntes,
        persistence: "remote_readback_confirmed",
        write: "unchanged",
      }, { headers: noStoreHeaders });
    }

    const radarContext = radarContextWithSpecialistReview({
      radarContext: brief.radarContext,
      contributionId: input.contributionId,
      review: {
        decision: input.decision,
        classification: input.classification,
        relatedRequirementId: input.relatedRequirementId,
        decidedAt: new Date().toISOString(),
        decidedBy: profile.userId,
      },
    });

    const gravada = await persistExpertBriefRadarContext({
      brandId: input.brandId,
      briefId: brief.id,
      expertId: brief.expertId,
      articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
      radarContext,
    }, client);
    if (!gravada) throw new AuthzError(404, "Pauta não encontrada neste contexto de artigo e versão do ArticleDNA.");

    /*
     * O READBACK É A PROVA, e ele lê a DECISÃO, não a linha.
     *
     * Uma resposta 200 do PostgREST diz que o update rodou; ela não diz que o
     * jsonb contém o que se quis gravar. Sem conferir a decisão de volta, a
     * tela marcaria "Aceita como evidência" sobre uma escrita que o banco
     * aplicou a outro campo — ou que uma escrita concorrente já substituiu.
     */
    const readback = await getExpertBrief({
      brandId: input.brandId,
      briefId: brief.id,
      expertId: brief.expertId,
      articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
    }, client);
    const confirmada = readback ? radarSpecialistReviewsOf(readback.radarContext)[input.contributionId] : null;
    if (!readback || !confirmada || confirmada.decision !== input.decision) {
      /*
       * O CÓDIGO TEM NOME — §5.
       *
       * "Não foi possível salvar" cobre rota, rede, permissão e schema ao
       * mesmo tempo. Este caso é outro: a escrita foi aceita e a releitura
       * discorda dela. Quem for investigar precisa saber qual dos dois.
       */
      throw new AuthzError(503, `SPECIALIST_DECISION_READBACK_MISMATCH: a decisão foi gravada, mas a releitura remota devolveu ${confirmada ? confirmada.decision : "nenhuma decisão"} em vez de ${input.decision}.`);
    }

    return NextResponse.json({
      brief: readback,
      review: confirmada,
      persistence: "remote_readback_confirmed",
      write: "applied",
    }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Decisão de revisão inválida.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
}
