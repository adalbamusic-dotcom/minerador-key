import { operationById, type PlatformStage } from "./platform-catalog.ts";
import type { PlatformStateSnapshot } from "./platform-state-model.ts";

/**
 * ===== O QUE FAZER AGORA — E QUEM FAZ =====
 *
 * Domínio puro. Lê o retrato da marca e devolve as próximas ações, na ordem do
 * pipeline, cada uma apontando para uma operação do catálogo. Não inventa
 * operação: se o catálogo não tem, a ação não existe.
 *
 * Cada ação diz se é a IA que executa (`who: "agent"`, com a ferramenta) ou se
 * é decisão humana na tela (`who: "human"`, com o link). É isso que faz a IA
 * parar no lugar certo e retomar depois.
 */

export type NextAction = {
  operationId: string;
  title: string;
  who: "agent" | "human";
  tools: string[];
  screen: string;
  howOnScreen: string;
  reason: string;
  /** Ids envolvidos (limitados) — para a IA saber sobre quais itens agir. */
  items: string[];
  count: number;
};

const ITENS_MAX = 25;

export function resolveNextActions(state: PlatformStateSnapshot): { actions: NextAction[]; playbook: string | null } {
  const actions: NextAction[] = [];

  const push = (operationId: string, reason: string, items: string[] = [], count = items.length) => {
    const operation = operationById(operationId);
    if (!operation) throw new Error(`Operação fora do catálogo: ${operationId}`);
    actions.push({
      operationId,
      title: operation.title,
      who: operation.decision === "human" || operation.access === "ui" ? "human" : "agent",
      tools: [...(operation.tools ?? [])],
      screen: state.brand.screens[operation.screen as PlatformStage],
      howOnScreen: operation.howOnScreen,
      reason,
      items: items.slice(0, ITENS_MAX),
      count,
    });
  };

  /* ---- Marca ---- */
  if (state.brand.siteUrl && state.published.total === 0) {
    push("marca.site_catalog", "O site da marca está cadastrado, mas nenhuma página publicada foi sincronizada. Sem isso não dá para saber o que já existe no ar.");
  }

  /* ---- Minerador ---- */
  const brutas = state.minerador.byStatus.bruto ?? 0;
  const emRevisao = state.minerador.byStatus.em_revisao ?? 0;
  if (brutas > 0) {
    push("minerador.measure_and_qualify", `${brutas} keyword(s) em 'bruto' aguardam medição e Lógica no Processador.`, [], brutas);
  }
  if (brutas + emRevisao > 0) {
    push("minerador.review_and_approve", `${brutas + emRevisao} keyword(s) aguardam revisão e aprovação humana.`, [], brutas + emRevisao);
  }
  if (state.minerador.approvedNotSentIds.length) {
    push("minerador.send_to_arquiteto",
      `${state.minerador.approvedNotSentIds.length} keyword(s) aprovada(s) ainda não foram enviadas ao Arquiteto.`,
      state.minerador.approvedNotSentIds);
  }

  /* ---- Arquiteto ---- */
  const artigos = state.arquiteto.articles;
  if (state.arquiteto.receivedKeywords > 0 && !artigos.length) {
    push("arquiteto.form_architecture", `O Arquiteto recebeu ${state.arquiteto.receivedKeywords} keyword(s) e ainda não formou artigos.`);
  }
  const emFormacao = artigos.filter(article => !["PRONTO_PARA_RADAR", "ENVIADO_AO_RADAR", "DESCARTADO"].includes(article.workflowState ?? ""));
  if (emFormacao.length) {
    push("arquiteto.confirm_architecture", `${emFormacao.length} artigo(s) ainda não foram confirmados no Arquiteto.`, emFormacao.map(article => article.articleId));
  }
  const prontos = artigos.filter(article => article.workflowState === "PRONTO_PARA_RADAR");
  if (prontos.length) {
    push("arquiteto.send_to_radar", `${prontos.length} artigo(s) prontos para o Radar.`, prontos.map(article => article.articleId));
  }
  const silosSemPagina = state.arquiteto.silos.filter(silo => !silo.page?.slug);
  if (silosSemPagina.length) {
    push("arquiteto.confirm_architecture", `${silosSemPagina.length} silo(s) sem página do silo com slug.`, silosSemPagina.map(silo => silo.siloId));
  }

  /* ---- Radar ---- */
  const emInvestigacao = state.radar.items.filter(item => !["approved", "sent_writer", "sent_planner"].includes(item.state));
  if (emInvestigacao.length) {
    push("radar.investigate", `${emInvestigacao.length} artigo(s) em investigação no Radar.`, emInvestigacao.map(item => item.articleId));
    push("radar.finalize", "Quando a investigação tiver evidência suficiente, o usuário finaliza.", emInvestigacao.map(item => item.articleId));
  }
  const finalizados = state.radar.items.filter(item => item.state === "approved");
  if (finalizados.length) {
    push("radar.send_to_writer", `${finalizados.length} artigo(s) finalizado(s) ainda não estão no Redator.`, finalizados.map(item => item.articleId));
  }

  /* ---- Redator ---- */
  const paraEscrever = state.redator.documents.filter(document => ["planejado", "escrevendo"].includes(document.status));
  if (paraEscrever.length) {
    push("redator.write_draft", `${paraEscrever.length} documento(s) prontos para escrever.`, paraEscrever.map(document => document.documentId));
  }
  const emRevisaoDoc = state.redator.documents.filter(document => document.status === "em_revisao");
  if (emRevisaoDoc.length) {
    push("redator.approve", `${emRevisaoDoc.length} documento(s) aguardam aprovação final.`, emRevisaoDoc.map(document => document.documentId));
  }

  /* ---- Nada ainda ---- */
  const vazio = !state.minerador.total && !artigos.length && !state.arquiteto.silos.length;
  const playbook = vazio || (!artigos.length && !state.arquiteto.silos.length && !state.minerador.subjects.length)
    ? "silo_do_zero"
    : null;

  return { actions, playbook };
}
