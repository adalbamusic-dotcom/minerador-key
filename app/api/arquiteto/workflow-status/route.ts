import { describeGlobalTransitionFailure, persistGlobalTransition } from "@/lib/server/global-workflow-transition";
import { buildCanonicalIndex } from "@/lib/server/global-workflow-canonical";
import { globalWorkflowStatus } from "@/lib/editorial/global-workflow-status";
/**
 * O STATUS OPERACIONAL DO ARTIGO, PERSISTIDO NA AUTORIDADE QUE JÁ EXISTE.
 *
 * Nenhuma coluna nova, nenhuma migration: `editorial_workflow_items` já tem
 * `stage`, `state` livre, `lock_version` e a unicidade
 * (marca, subject_type, subject_id, stage). O item do Radar vive em
 * `stage = 'radar'`; o do Arquiteto passa a viver em `stage = 'architect'`
 * com o mesmo `subject_type = 'article'` — linhas distintas pela chave, sem
 * disputar estado uma com a outra.
 *
 * A transição fica registrada em `editorial_decision_events` com
 * `from_state → to_state`, que é o mesmo rastro que o Radar usa.
 *
 * A ESCRITA VAI PELO service_role, DEPOIS DA PERMISSÃO.
 *
 * A migration 0027 concede a `authenticated` apenas SELECT em
 * `editorial_workflow_items`; escrever com a sessão do usuário tomaria
 * 42501. O caminho é o mesmo de `import_radar`: checar a permissão
 * editorial primeiro e só então usar o cliente operacional.
 *
 * O QUE ESTA ROTA NÃO FAZ: tocar ArticleDNA, SiloDNA, SiloPage ou grafo. Ela
 * lê esses artefatos para VALIDAR e nunca os escreve — é a diferença entre
 * mover o item no pipeline e reabrir a decisão editorial.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCanonicalSessionProfile, authzErrorResponse } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { getOperationalClient, PersistenceUnavailableError } from "@/lib/server/editorial-db";
import {
  planReadyInvalidation,
  readyBaseMatchesCurrent,
  readReadyBase,
  readyBaseFromClaim,
  validateReadyForRadarClaims,
  type CanonicalApprovalIndex,
} from "@/lib/arquiteto/operational-status";

const ARCHITECT_STAGE = "architect";
const ARTICLE_SUBJECT = "article";

/**
 * §1/§6 — A FALHA SAI COM PASSO E ERRO TÉCNICO NO LOG.
 *
 * A mesa recebe a frase operacional que o passo produziu; o log recebe qual
 * passo foi e o que o banco disse. Sem isto, uma violação de NOT NULL chegava
 * ao usuário como "A gravação do status falhou" — e nem no servidor ficava
 * registro do motivo real.
 */
function descreveFalha(error: unknown, brandId: string, articleId: string) {
  const detalhe = describeGlobalTransitionFailure(error);
  console.error("[arquiteto][workflow-status] falha na transição", JSON.stringify({
    brandId, articleId, step: detalhe.step, message: detalhe.message, technical: detalhe.technical,
  }));
  return detalhe.message;
}

type Db = ReturnType<typeof getOperationalClient>;

const BrandQuerySchema = z.object({ brandId: z.string().uuid() });

const ClaimSchema = z.object({
  articleId: z.string().min(1),
  articleDnaVersionId: z.string().min(1),
  siloDnaVersionId: z.string().min(1),
  siloPageVersionId: z.string().min(1),
  internalLinkGraphVersionId: z.string().min(1),
}).strict();

const ReadyRequestSchema = z.object({
  brandId: z.string().uuid(),
  target: z.enum(["PRONTO_PARA_RADAR", "ENVIADO_AO_RADAR"]),
  claims: z.array(ClaimSchema).min(1).max(200),
}).strict();

const RequestSchema = z.union([ReadyRequestSchema, z.object({brandId:z.string().uuid(),target:z.enum(["RASCUNHO","EM_PROCESSO","DESCARTADO"]),articleIds:z.array(z.string().min(1)).min(1).max(200)}).strict()]);

type WorkflowRow = {
  id: string;
  article_id: string | null;
  state: string;
  lock_version: number;
  payload: unknown;
};

async function readArchitectItems(db: Db, brandId: string, articleIds?: readonly string[]) {
  let query = db
    .from("editorial_workflow_items")
    .select("id,article_id,state,lock_version,payload")
    .eq("marca_id", brandId)
    .eq("stage", ARCHITECT_STAGE)
    .eq("subject_type", ARTICLE_SUBJECT);
  if (articleIds?.length) query = query.in("subject_id", [...articleIds]);
  const result = await query;
  if (result.error) throw result.error;
  return (result.data || []) as WorkflowRow[];
}

/** A linha como a mesa a lê: status + a base que sustentou a marca. */
function itemView(row: WorkflowRow) {
  return {
    articleId: row.article_id,
    status: globalWorkflowStatus(row.state),
    lockVersion: row.lock_version,
    base: readReadyBase(row.payload),
  };
}

/**
 * O estado canônico como o SERVIDOR o lê.
 *
 * Aprovado E vigente: entre as versões aprovadas de uma entidade, só a de
 * maior `version_number` entra. Uma versão aprovada que já foi sucedida não
 * pode sustentar um avanço de status.
 */
/**
 * §4 — devolve remotamente a EM_PROCESSO o que está PRONTO sobre base vencida.
 *
 * Não é uma opinião da tela: a linha muda no banco e a transição fica no mesmo
 * rastro de decisões. Sem isto, a UI rebaixava e o banco continuava dizendo
 * `PRONTO_PARA_RADAR` — dois estados para o mesmo item, e o remoto perdendo
 * para o local justamente onde ele deveria mandar.
 *
 * `ENVIADO_AO_RADAR` não entra: o handoff aconteceu (§5).
 */
async function invalidateStaleReady(
  db: Db,
  brandId: string,
  actorId: string,
  rows: readonly WorkflowRow[],
  canonical: CanonicalApprovalIndex,
) {
  const plano = planReadyInvalidation({
    rows: rows.map(row => ({
      articleId: String(row.article_id ?? ""),
      status: row.state,
      base: readReadyBase(row.payload),
    })),
    canonical,
  });
  if (!plano.invalidate.length) return [];

  const porArtigo = new Map(rows.map(row => [String(row.article_id ?? ""), row]));
  const invalidados: { articleId: string; reasons: string[] }[] = [];
  for (const alvo of plano.invalidate) {
    const row = porArtigo.get(alvo.articleId);
    if (!row) continue;
    await persistGlobalTransition(db, {
      brandId, articleId: alvo.articleId, actorId, target: "EM_PROCESSO",
      previous: row, payload: { reasons: alvo.reasons, previousBase: readReadyBase(row.payload) },
    });
    invalidados.push(alvo);
  }
  return invalidados;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = BrandQuerySchema.parse({ brandId: url.searchParams.get("brandId") || "" });
    const profile = await requireCanonicalSessionProfile();
    await assertEditorialPermission(profile, query.brandId, "arquiteto", "view");
    const db = getOperationalClient();
    const rows = await readArchitectItems(db, query.brandId);
    const canonical = await buildCanonicalIndex(db, query.brandId);

    /*
     * A CORREÇÃO EXIGE PERMISSÃO DE ESCRITA; A VERDADE NA TELA, NÃO.
     *
     * Quem só tem leitura não grava a invalidação — mas também não pode ver
     * "Pronto para Radar" sobre base vencida. Por isso `baseMatchesCurrent`
     * vai na resposta de qualquer jeito: a tela fica correta para todo mundo,
     * e o banco é corrigido por quem tem permissão para corrigi-lo.
     */
    const podeCorrigir = await assertEditorialPermission(profile, query.brandId, "arquiteto", "approve")
      .then(() => true)
      .catch(() => false);
    const invalidados = podeCorrigir
      ? await invalidateStaleReady(db, query.brandId, profile.userId, rows, canonical)
      : [];
    const atual = invalidados.length ? await readArchitectItems(db, query.brandId) : rows;

    return NextResponse.json({
      success: true,
      data: {
        source: "CANONICAL_REMOTE",
        items: atual.map(row => {
          const view = itemView(row);
          return {
            ...view,
            baseMatchesCurrent: readyBaseMatchesCurrent({ base: view.base, canonical }).matches,
          };
        }),
        invalidated: invalidados,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "brandId é obrigatório.", code: "INVALID_CONTEXT" }, { status: 400 });
    }
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 503 });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.parse(await request.json());
    const profile = await requireCanonicalSessionProfile();
    // Mover o item no pipeline é ato do Arquiteto sobre a própria mesa.
    await assertEditorialPermission(profile, parsed.brandId, "arquiteto", "approve");
    const db = getOperationalClient();
    const actorId = profile.userId;

    if ("articleIds" in parsed) {
      const confirmed:string[]=[]; const refused:{articleId:string;blockers:string[]}[]=[];
      for (const articleId of [...new Set(parsed.articleIds)]) {
        try {
          const owned=await db.from("editorial_artifact_versions").select("payload").eq("marca_id",parsed.brandId).eq("artifact_type","article_dna");
          if (owned.error) throw owned.error;
          if (!owned.data?.some(item => {
            const envelope = item.payload as { payload?: { articleId?: string }; articleId?: string };
            return (envelope?.payload?.articleId ?? envelope?.articleId) === articleId;
          })) throw new Error("Artigo canônico não encontrado nesta marca.");
          const row=(await readArchitectItems(db,parsed.brandId,[articleId]))[0];
          if (row?.state === "ENVIADO_AO_RADAR") throw new Error("A entrega já foi realizada; o status não pode apagar esse histórico.");
          await persistGlobalTransition(db, {
            brandId: parsed.brandId, articleId, actorId, target: parsed.target,
            previous: row ?? null, payload: {},
          });
          confirmed.push(articleId);
        } catch(error) { refused.push({articleId,blockers:[descreveFalha(error, parsed.brandId, articleId)]}); }
      }
      return NextResponse.json({success:true,data:{source:"CANONICAL_REMOTE",confirmed,refused,items:(await readArchitectItems(db,parsed.brandId,parsed.articleIds)).map(itemView)}});
    }
    // A alegação do cliente é INSUMO. Quem decide é o estado gravado.
    const canonical = await buildCanonicalIndex(db, parsed.brandId);
    const validacao = validateReadyForRadarClaims({ claims: parsed.claims, canonical });
    /*
     * §6 — O DIAGNÓSTICO VAI PARA O LOG DO SERVIDOR.
     *
     * "ArticleDNA, SiloDNA e SiloPage não estão aprovados e vigentes" não diz
     * qual das três falhou nem sobre quais versões — e o índice canônico tem
     * regra de validade além do status aprovado. Sem isto, a próxima tentativa
     * é adivinhação. UUID não vai para a mesa; vai para cá.
     */
    for (const recusa of validacao.refused) {
      if (!recusa.diagnostic) continue;
      console.warn("[arquiteto][ready-for-radar] recusa", JSON.stringify({
        brandId: parsed.brandId,
        articleId: recusa.articleId,
        blockers: recusa.blockers,
        ...recusa.diagnostic,
      }));
    }

    const existentes = new Map(
      (await readArchitectItems(db, parsed.brandId, validacao.accepted.map(claim => claim.articleId)))
        .map(row => [String(row.article_id), row]),
    );

    const persistidos: string[] = [];
    const falhas: { articleId: string; blockers: string[] }[] = [];

    for (const claim of validacao.accepted) {
      const atual = existentes.get(claim.articleId);
      if (parsed.target === "ENVIADO_AO_RADAR") {
        const radar = await db.from("editorial_workflow_items").select("id,source_version_id").eq("marca_id",parsed.brandId).eq("stage","radar").eq("article_id",claim.articleId).maybeSingle();
        if (radar.error || !radar.data || radar.data.source_version_id !== claim.articleDnaVersionId || !["PRONTO_PARA_RADAR","ENVIADO_AO_RADAR"].includes(atual?.state || "")) {
          falhas.push({articleId:claim.articleId,blockers:["Entrega no Radar ainda não confirmada remotamente."]}); continue;
        }
      }
      if (atual?.state === "ENVIADO_AO_RADAR" && parsed.target !== "ENVIADO_AO_RADAR") {
        falhas.push({articleId:claim.articleId,blockers:["O artigo já foi entregue ao Radar."]}); continue;
      }
      try {
        await persistGlobalTransition(db, {
          brandId: parsed.brandId, articleId: claim.articleId, actorId, target: parsed.target,
          previous: atual ?? null, payload: readyBaseFromClaim(claim), sourceVersionId: claim.articleDnaVersionId,
        });
        persistidos.push(claim.articleId);
      } catch (error) {
        falhas.push({
          articleId: claim.articleId,
          /*
           * §6 — O PASSO QUE FALHOU, NOMEADO.
           *
           * O erro do PostgREST NÃO é `instanceof Error`: é objeto simples. O
           * fallback engolia a mensagem do banco e a mesa recebia "A gravação
           * do status falhou" sobre uma violação de NOT NULL. O técnico vai
           * para o log; a mesa recebe a frase operacional.
           */
          blockers: [descreveFalha(error, parsed.brandId, claim.articleId)],
        });
      }
    }

    /*
     * READBACK. A resposta é o que o banco devolveu, não o que a rota tentou.
     *
     * Sem esta releitura, uma escrita que o trigger recusasse voltaria como
     * sucesso — que é a classe de falso positivo que este corte veio fechar.
     */
    const readback = await readArchitectItems(db, parsed.brandId, parsed.claims.map(claim => claim.articleId));
    const failedIds = new Set([...validacao.refused, ...falhas].map(item => item.articleId));
    const confirmados = readback.filter(row => persistidos.includes(String(row.article_id)) && !failedIds.has(String(row.article_id)) && row.state === parsed.target).map(row => String(row.article_id));
    const naoConfirmados = persistidos.filter(articleId => !confirmados.includes(articleId));
    for (const articleId of naoConfirmados) {
      falhas.push({ articleId, blockers: ["A gravação não apareceu no readback remoto."] });
    }

    return NextResponse.json({
      success: true,
      data: {
        source: "CANONICAL_REMOTE",
        persistence: naoConfirmados.length ? "PARTIAL" : "PERSISTED",
        target: parsed.target,
        confirmed: confirmados,
        refused: [...validacao.refused, ...falhas],
        items: readback.map(row => ({ ...itemView(row), baseMatchesCurrent: readyBaseMatchesCurrent({base:readReadyBase(row.payload),canonical}).matches })),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Brand, alvo e artigos válidos são obrigatórios.", code: "INVALID_CONTEXT" }, { status: 400 });
    }
    if (error instanceof PersistenceUnavailableError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 503 });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status });
  }
}
