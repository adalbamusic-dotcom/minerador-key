/**
 * TRÊS AÇÕES. SÓ.
 *
 *   1. Iniciar pesquisa SERP
 *   2. Analisar concorrência
 *   3. Finalizar SERP
 *
 * O que existia antes disso — coletar, iniciar curadoria, classificar cada
 * resultado, confirmar seleção, analisar pendentes, reabrir, revisar, aprovar —
 * continua acontecendo, mas por conta do sistema. "Analisar páginas pendentes
 * (1)" era o fluxo interno vazando para a tela: um número que só faz sentido
 * para quem escreveu o código, oferecido como se fosse a decisão do usuário.
 *
 * Esta autoridade responde uma pergunta só: **qual é a única coisa que a pessoa
 * precisa fazer agora?** E quando não há nada a fazer, ela diz isso — em vez de
 * oferecer um botão que não muda nada.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { RadarDeepResearchState } from "./deep-research.ts";
import type { RadarInvestigationSufficiency } from "./investigation-sufficiency.ts";
import { RADAR_DEFAULT_SEARCH_MODE, radarSearchModeAvailability, radarSearchModeLabel, type RadarPrimarySearchMode } from "./search-mode.ts";
import type { RadarResearchResumption } from "./research-resumption.ts";

export type RadarPhase1ActionId = "START_RESEARCH" | "ANALYZE_COMPETITION" | "FINALIZE_SERP" | "NONE";

export type RadarPhase1Action = {
  id: RadarPhase1ActionId;
  label: string;
  enabled: boolean;
  /** Por que não dá para agir agora. `null` quando dá. */
  blockedReason: string | null;
  /** Uma linha de contexto sob o botão. Nunca um número interno solto. */
  hint: string | null;
  /**
   * O QUE O BOTÃO FAZ, PARA QUEM NUNCA VIU ESTA TELA — §10.
   *
   * A ação primária do Radar aparece nas quatro áreas, inclusive com a Pesquisa
   * recolhida. Fora dela, "Iniciar pesquisa" não dizia pesquisar ONDE, nem que
   * a decisão pertence à área Pesquisa, nem que ela gasta uma consulta paga. A
   * pessoa clicava sem saber o que estava comprando.
   *
   * Isto é texto de tooltip: explicação. Estado, ação e erro continuam na
   * interface principal, nunca escondidos aqui dentro.
   */
  info: string | null;
};

export function radarPhase1Action(input: {
  state: RadarDeepResearchState;
  contextReady: boolean;
  hasPrimaryQuery: boolean;
  running: boolean;
  /** O modo escolhido. A engine dele decide se dá para começar. */
  mode?: RadarPrimarySearchMode;
  /** Referências que a seleção automática colocou na amostra. */
  selected: number;
  /** Selecionadas ainda sem extração e sem falha registrada. */
  pending: number;
  /** Selecionadas com falha definitiva. Não travam o fluxo. */
  failed: number;
  /** Páginas já na amostra. */
  analyzed: number;
  /**
   * O ANALYZE chegou ao fim — gravação final e readback confirmados?
   *
   * Opcional para não mudar o comportamento de quem ainda não informa: sem o
   * dado, a autoridade se comporta exatamente como antes.
   */
  analysisConfirmed?: boolean;
  /**
   * Páginas JÁ GRAVADAS no servidor — Gate 18.10.1.
   *
   * `analyzed` conta o que a leitura viva enxerga; este número vem do que o
   * banco confirmou. Quando a consolidação falha, é ele que diz à pessoa
   * quanto trabalho está seguro — e portanto o que a retomada não precisa
   * refazer.
   */
  persistedExtractions?: number;
  /**
   * O QUE A PESQUISA JÁ TEM, POR CONSULTA — Gate 18.9.
   *
   * Sem isto a Fase 1 só conhecia dois mundos: "não começou" e "acabou". Uma
   * canônica recuperada do banco caía no segundo, e a única ação oferecida era
   * "Refazer" — que recoletaria, paga, a SERP que acabara de ser recuperada.
   *
   * Opcional para não mudar o comportamento de quem ainda não informa.
   */
  resumption?: Pick<RadarResearchResumption, "state" | "canonicalComplete" | "auxiliaryPending" | "auxiliaryFailed" | "auxiliaryExecuted" | "auxiliaryTotal"> | null;
  sufficiency?: Pick<RadarInvestigationSufficiency, "level" | "headline"> | null;
}): RadarPhase1Action {
  const modo = input.mode || RADAR_DEFAULT_SEARCH_MODE;
  const ondePesquisa = radarSearchModeLabel(modo);
  /*
   * A MESMA EXPLICAÇÃO, ONDE QUER QUE O BOTÃO APAREÇA.
   *
   * Ela nomeia o destino da busca, diz a que área a decisão pertence e avisa
   * que a consulta é paga. Fica aqui, e não na tela, porque o botão tem dois
   * lugares de render — dentro da área Pesquisa e no slot da primeira camada —
   * e duas cópias do texto viram duas versões da verdade.
   */
  const explicacaoDaPesquisa = `Esta ação pertence à área Pesquisa do Radar e consulta ${ondePesquisa} de verdade: ela gasta uma consulta paga por keyword pesquisada. A partir dela o Radar monta o universo competitivo do artigo — a SERP canônica, as consultas auxiliares e a amostra que vai à análise. Ela aparece aqui mesmo com a área Pesquisa recolhida para que a ação principal do artigo nunca dependa de abrir um card.`;

  if (!input.contextReady) {
    return { id: "NONE", label: "Pesquisa indisponível", enabled: false, blockedReason: "O contexto do artigo ainda não foi resolvido.", hint: null, info: null };
  }
  if (!input.hasPrimaryQuery) {
    return { id: "NONE", label: "Pesquisa indisponível", enabled: false, blockedReason: "A composição não tem principal com texto resolvido; não há consulta central.", hint: null, info: null };
  }
  /*
   * MODO RECONHECIDO NÃO É MODO PRONTO.
   *
   * A casca lista Google, YouTube e Amazon porque precisa nascer extensível.
   * Mas oferecer "Iniciar pesquisa" num modo cuja engine ainda não existe seria
   * prometer o que não acontece — e o usuário descobriria pelo silêncio.
   */
  const disponibilidade = radarSearchModeAvailability(modo);
  if (!disponibilidade.canStart) {
    return { id: "NONE", label: "Pesquisa indisponível neste modo", enabled: false, blockedReason: disponibilidade.reason, hint: null, info: null };
  }
  if (input.running) {
    return { id: "NONE", label: `Pesquisando ${ondePesquisa}…`, enabled: false, blockedReason: null, hint: "A investigação está em andamento.", info: explicacaoDaPesquisa };
  }

  /*
   * O RÓTULO DIZ ONDE — §8.
   *
   * "Iniciar pesquisa" era verdadeiro e mudo: fora da área Pesquisa ninguém
   * sabia que o destino era o Google nem que existiam outros destinos. O modo
   * já estava resolvido aqui; ele só não chegava ao texto do botão.
   */
  if (input.state === "NOT_STARTED") {
    return { id: "START_RESEARCH", label: `Iniciar Pesquisa ${ondePesquisa}`, enabled: true, blockedReason: null, hint: "Pesquisa a principal, as secundárias e os reforços úteis, e monta o universo competitivo.", info: explicacaoDaPesquisa };
  }
  if (input.state === "STALE") {
    return { id: "START_RESEARCH", label: `Refazer Pesquisa ${ondePesquisa}`, enabled: true, blockedReason: null, hint: "O fundamento do artigo mudou depois desta investigação.", info: explicacaoDaPesquisa };
  }
  if (input.state === "FINALIZED") {
    return { id: "NONE", label: "Pesquisa finalizada", enabled: false, blockedReason: null, hint: input.sufficiency?.headline || null, info: null };
  }

  /*
   * A PESQUISA COMEÇOU E NÃO TERMINOU — Gate 18.9 · §3 e §7.
   *
   * Este é o estado que a recuperação da SERP paga produz: a consulta central
   * tem evidência gravada, as auxiliares do plano não. Chamar isso de
   * "Refazer" mandaria recoletar — paga — a canônica que acabou de ser
   * recuperada; chamar de "Pronto para analisar" prometeria um universo
   * competitivo que nunca foi montado.
   *
   * A ação é COMPLETAR, e ela vem antes de analisar: ler uma amostra que a
   * pesquisa não terminou de reunir produz um modelo competitivo que descreve
   * menos do que o artigo pediu.
   *
   * Só as PENDENTES governam. As falhadas aparecem no motivo e não prendem o
   * botão aqui para sempre — senão uma keyword que o provider recusa por
   * motivo permanente travaria a Fase 1 inteira.
   */
  const retomada = input.resumption;
  if (retomada && retomada.canonicalComplete && retomada.auxiliaryPending.length > 0) {
    const faltando = retomada.auxiliaryPending.length;
    return {
      id: "START_RESEARCH",
      label: `Completar Pesquisa ${ondePesquisa}`,
      enabled: true,
      blockedReason: null,
      hint: [
        "SERP principal já coletada",
        `${faltando} consulta(s) auxiliar(es) a executar`,
        ...(retomada.auxiliaryFailed.length ? [`${retomada.auxiliaryFailed.length} sem resultado na tentativa anterior`] : []),
      ].join(" · "),
      info: `A SERP principal deste artigo já está coletada e gravada — esta ação NÃO a consulta de novo e não paga por ela outra vez. Ela executa somente as consultas auxiliares que ainda faltam para montar o universo competitivo, e o número delas vem do plano deste artigo. Depois disso a pesquisa fica pronta para a análise da concorrência.`,
    };
  }

  /*
   * ANALISAR É UMA COISA SÓ — não "analisar as pendentes".
   *
   * Quantas páginas faltam é problema do sistema. Para quem opera, ou a
   * concorrência já foi analisada ou não foi.
   */
  if (input.pending > 0) {
    return {
      id: "ANALYZE_COMPETITION",
      label: "Analisar concorrência",
      enabled: true,
      blockedReason: null,
      hint: `${input.selected} referência(s) selecionada(s) automaticamente${input.analyzed ? `, ${input.analyzed} já analisada(s)` : ""}.`,
      info: "Lê as páginas que a pesquisa selecionou e monta o modelo competitivo do artigo. Não consulta o buscador de novo: trabalha sobre o que a pesquisa já trouxe.",
    };
  }

  /*
   * AMOSTRA GRAVADA NÃO É ANÁLISE CONCLUÍDA — §6 e §7.
   *
   * Entre a gravação da amostra e a da camada de evidência existe uma versão
   * com páginas lidas e zero pendências. Oferecer FINALIZE ali deixaria congelar
   * uma investigação sem fontes verificadas, sem modelo e sem relatório — com
   * aparência de completa.
   */
  if (input.analyzed > 0 && input.analysisConfirmed === false) {
    /*
     * O BECO SEM SAÍDA VIROU AÇÃO — 18.10.1 · §6.
     *
     * Esta era a única saída possível quando a consolidação final não chegava
     * ao banco: um botão morto e a instrução de recarregar a página. Recarregar
     * mostrava a verdade e mantinha o artigo parado — as onze páginas gravadas
     * ficavam inalcançáveis.
     *
     * O que falta NÃO é ler páginas; é consolidar o que já foi lido. Oferecer
     * "Analisar concorrência" aqui mandaria reler o que já está pago. O id
     * continua ANALYZE_COMPETITION porque o handler é o mesmo — quem muda é o
     * escopo, e é ele que o rótulo precisa dizer.
     */
    const gravadas = input.persistedExtractions ?? input.analyzed;
    return {
      id: "ANALYZE_COMPETITION",
      label: "Concluir análise",
      enabled: true,
      blockedReason: null,
      hint: `${gravadas} página(s) já gravadas no servidor · falta a consolidação final${input.failed ? ` · ${input.failed} sem acesso` : ""}`,
      info: `As ${gravadas} páginas já estão salvas no servidor e não serão coletadas de novo — esta ação retoma apenas a consolidação que ainda não foi confirmada: o modelo competitivo, a verificação das fontes que faltarem e o carimbo final da análise. Nenhuma consulta ao buscador e nenhuma releitura de página acontecem aqui. Só depois de o servidor confirmar essa gravação a investigação pode ser finalizada.`,
    };
  }

  if (!input.analyzed) {
    /*
     * Zero pendentes e zero analisadas: a pesquisa não achou nada processável.
     * Refazer é o que resta — e o motivo é dito, não escondido atrás do botão.
     */
    return {
      id: "START_RESEARCH",
      label: `Refazer Pesquisa ${ondePesquisa}`,
      enabled: true,
      blockedReason: input.failed ? `Nenhuma das ${input.failed} página(s) selecionada(s) pôde ser acessada.` : "A pesquisa não encontrou página analisável.",
      hint: null,
      info: explicacaoDaPesquisa,
    };
  }

  return {
    id: "FINALIZE_SERP",
    /* §15: a nomenclatura é "pesquisa"; o id e a autoridade não mudam. */
    label: "Finalizar pesquisa",
    enabled: true,
    blockedReason: null,
    hint: [
      `${input.analyzed} página(s) na amostra`,
      ...(input.failed ? [`${input.failed} sem acesso`] : []),
      ...(input.sufficiency?.headline ? [input.sufficiency.headline] : []),
    ].join(" · "),
    info: "Congela a investigação deste artigo: a leitura passa a descrever o que foi pesquisado agora, e melhorias posteriores não mudam mais estes números.",
  };
}

/** A mesma frase, para a coluna "Próxima ação" da planilha. */
export function radarPhase1NextAction(action: RadarPhase1Action): string {
  if (action.id === "NONE") return action.blockedReason || action.hint || action.label;
  return action.label;
}
