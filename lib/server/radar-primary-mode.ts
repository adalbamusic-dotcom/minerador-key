import { WorkflowRepository } from "./editorial-repositories";
import {
  assertRadarResearchModeAllowed,
  radarDecideResearchSource,
  radarPrimaryModeOfAnalysis,
  radarResearchPlanOfAnalysis,
  type RadarPrimarySearchMode,
  type RadarResearchSource,
  type RadarSourceDecision,
} from "../radar/search-mode";

/**
 * ========= A AUTORIDADE DE MODO, NO SERVIDOR — YOUTUBE_SEARCH_1.2 =========
 *
 * ======================== POR QUE ISTO EXISTE ========================
 *
 * O 1.1 fechou a troca WEB ↔ YOUTUBE na tela. A tela não é autoridade: um POST
 * direto em qualquer das duas rotas pagas iniciava coleta num artigo já
 * comprometido com o outro universo. O prejuízo era dinheiro gasto numa
 * pergunta que o domínio recusa — e uma divergência entre o que a interface
 * promete e o que o servidor faz.
 *
 * ===================== O CLIENTE NÃO É CONSULTADO =====================
 *
 * Nenhuma das rotas aceita `mode` no corpo. O modo corrente é RESOLVIDO aqui, a
 * partir da análise canônica gravada. Aceitar o modo do cliente devolveria a
 * ele a escolha do próprio veredito, que é o vetor que este gate fecha.
 *
 * ======================= ANTES DE QUALQUER GASTO =======================
 *
 * Quem chama, chama primeiro: antes de resolver a configuração do provider
 * (que já reserva cota), antes da corrida e antes de qualquer persistência
 * parcial. Um 409 depois da chamada seria um 409 que já custou.
 */

export type RadarPrimaryModeDecision = {
  currentMode: RadarPrimarySearchMode | null;
  requestedMode: RadarPrimarySearchMode;
};

/**
 * De onde sai a análise corrente. Injetável para o teste exercitar a decisão
 * REAL sem banco — a regra provada é a mesma que roda em produção.
 */
export type RadarAnalysisPayloadLoader = (input: { brandId: string; articleId: string }) => Promise<unknown>;

/**
 * QUAL É A ANÁLISE CORRENTE — a ÚLTIMA, porque a cadeia é append-only.
 *
 * A validação da FORMA não é feita aqui: quem tolera payload envelhecido é
 * `radarPrimaryModeOfAnalysis`, num lugar só. Validar a análise inteira
 * transformaria um registro legado fora de forma numa recusa de coleta — uma
 * guarda que vira indisponibilidade.
 */
function ultimaAnalise(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const versoes = (payload as { analysisVersions?: unknown }).analysisVersions;
  if (!Array.isArray(versoes) || !versoes.length) return null;
  const ultima = versoes[versoes.length - 1];
  if (!ultima || typeof ultima !== "object" || Array.isArray(ultima)) return null;
  return (ultima as { payload?: unknown }).payload ?? null;
}

const carregarDoBanco: RadarAnalysisPayloadLoader = async ({ brandId, articleId }) => {
  const linha = await new WorkflowRepository().findByArticle(brandId, articleId, "radar");
  return ultimaAnalise(linha?.payload);
};

/**
 * Resolve o modo corrente e RECUSA a troca — lançando
 * `RadarPrimaryModeConflictError`, que carrega código, status e corpo.
 *
 * Artigo sem item Radar ou sem análise nenhuma resolve `null`: não há
 * compromisso, e a primeira investigação é a que o cria. Recusar aqui bloquearia
 * justamente o caminho novo que o gate quer permitir.
 */
/**
 * ============ 2.1 · PARTE B · A DECISÃO POR FONTE ============
 *
 * Substitui `assertRadarPrimaryModeForRequest` nos caminhos que coletam uma
 * SERP. A diferença é o que ela recusa: a antiga recusava a segunda FONTE; esta
 * recusa apenas a troca de ALVO — que ninguém faz por coleta, só por pedido
 * explícito.
 *
 * Coletar o Google como apoio de um artigo de vídeo passa por aqui e devolve
 * `isSupport: true`, com o alvo intacto.
 */
export async function resolveRadarResearchSource(
  input: {
    brandId: string;
    articleId: string;
    source: RadarResearchSource;
    /** O alvo que este pedido declara, usado só quando o artigo não tem um. */
    intendedTarget?: RadarPrimarySearchMode | null;
  },
  options: { loadAnalysisPayload?: RadarAnalysisPayloadLoader } = {},
): Promise<RadarSourceDecision & { plan: ReturnType<typeof radarResearchPlanOfAnalysis> }> {
  const carregar = options.loadAnalysisPayload || carregarDoBanco;
  const analise = await carregar({ brandId: input.brandId, articleId: input.articleId });
  const plan = radarResearchPlanOfAnalysis(analise);
  const decisao = radarDecideResearchSource({
    currentTarget: plan.primaryTarget,
    source: input.source,
    intendedTarget: input.intendedTarget,
  });
  return { ...decisao, plan };
}

export async function assertRadarPrimaryModeForRequest(
  input: { brandId: string; articleId: string; requestedMode: RadarPrimarySearchMode },
  options: { loadAnalysisPayload?: RadarAnalysisPayloadLoader } = {},
): Promise<RadarPrimaryModeDecision> {
  const carregar = options.loadAnalysisPayload || carregarDoBanco;
  const analise = await carregar({ brandId: input.brandId, articleId: input.articleId });
  const currentMode = radarPrimaryModeOfAnalysis(analise);
  assertRadarResearchModeAllowed({ currentMode, requestedMode: input.requestedMode });
  return { currentMode, requestedMode: input.requestedMode };
}

/** Exposto para o teste montar a mesma leitura que a produção faz. */
export const radarAnalysisPayloadFromWorkflowRow = ultimaAnalise;
