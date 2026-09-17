/**
 * ===== A AUTORIDADE DE ESTADO DA PESQUISA — RADAR_RESEARCH_PROFILES_1.1 =====
 *
 * ========================= O DEFEITO QUE ISTO FECHA =========================
 *
 * Um artigo com investigação de YouTube CONGELADA — 3 consultas, 38 vídeos,
 * apoio do Google coletado, FINALIZE confirmado e sobrevivendo ao F5 — aparecia
 * assim na tela, ao mesmo tempo:
 *
 *   corpo    "3 consultas · 38 vídeos · Investigação finalizada"
 *   card     "0 consulta(s) · 0 referência(s) · Modelo competitivo: Não iniciado"
 *   tabela   "Pesquisa: Não iniciado · Próxima ação: Iniciar Pesquisa YouTube"
 *   aviso    "YouTube: 0 consulta(s) · 0 resultado(s) · Coletando"
 *
 * Quatro leituras da mesma investigação porque havia quatro cálculos:
 *
 *   1. o card lia `deepResearch`, que é o read-model do GOOGLE e nasce vazio
 *      num artigo de vídeo — daí "0 referências / Não iniciado";
 *   2. a tabela lia a mesma coisa, pela mesma razão;
 *   3. `buildRadarResearchPackage` não tinha NOT_STARTED: ausência de corrida
 *      caía em `COLLECTING`, e "nunca começou" virava "coletando";
 *   4. nenhum dos quatro olhava `youtubeFrozenInvestigation` — a fotografia
 *      existia no banco e não tinha voz na projeção.
 *
 * ===================== POR QUE UMA PROJEÇÃO, E NÃO QUATRO =====================
 *
 * Cada leitura, isolada, era defensável. O que a tela mostrava era a soma — e a
 * soma dizia que a investigação não tinha começado e estava finalizada.
 *
 * ================== A PRECEDÊNCIA DO CONGELADO — §4 e §5 ==================
 *
 * Existindo fotografia, ela MANDA. Nenhum campo transitório pode fazer a tela
 * recuar: depois do FINALIZE, os números vêm da fotografia, não da corrida
 * viva — que é recalculável e por isso mesmo foi congelada.
 *
 * ===================== O QUE ESTA PROJEÇÃO NÃO FAZ =====================
 *
 * Ela não governa o perfil GOOGLE. Aquele pipeline — coleta, curadoria,
 * análise, modelo, relatório, revisão — tem autoridade própria, homologada, e
 * assumi-la aqui seria reescrever o que este gate não pode regredir. Para
 * GOOGLE a projeção declara `ownedByGooglePipeline` e devolve a mão.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

import {
  RADAR_RESEARCH_PROFILE_PLANS,
  radarProfileSupportPlan,
  radarResearchProfileLabel,
  type RadarResearchProfile,
} from "./research-profile.ts";

/*
 * ============ §24 · COLETA E ANÁLISE SÃO COISAS DIFERENTES ============
 *
 * `READY` diz que a PESQUISA está pronta. `READY_TO_FINALIZE` diz que a
 * ANÁLISE já foi feita e existe blueprint para revisar.
 *
 * Sem o segundo, a tela ofereceria congelar uma coleta que ninguém analisou
 * — uma fotografia sem conclusão dentro.
 */
export const RADAR_PROFILE_STATES = [
  "NOT_STARTED",
  "COLLECTING",
  "READY",
  "PARTIAL_SUPPORT_FAILED",
  "READY_TO_FINALIZE",
  "FAILED",
  "FINALIZED",
] as const;
export type RadarProfileState = typeof RADAR_PROFILE_STATES[number];

export const RADAR_PROFILE_STATE_LABELS: Record<RadarProfileState, string> = {
  NOT_STARTED: "Não iniciada",
  COLLECTING: "Coletando",
  READY: "Pronta para finalizar",
  READY_TO_FINALIZE: "Analisada",
  PARTIAL_SUPPORT_FAILED: "Concluída · apoio pendente",
  FAILED: "Falhou",
  FINALIZED: "Finalizado",
};

/**
 * A PRÓXIMA AÇÃO SAI DAQUI — §7.
 *
 * "Revisar relatório" fixado na tabela seria a mesma doença por outro caminho:
 * um texto que não sabe o que aconteceu. Cada estado tem uma continuação, e ela
 * é derivada.
 */
export const RADAR_PROFILE_NEXT_ACTIONS = [
  "START_RESEARCH",
  "WAIT_COLLECTION",
  "RETRY_SUPPORT",
  "FINALIZE",
  "RETRY_RESEARCH",
  "REVIEW_REPORT",
  "ANALYZE_RESEARCH",
] as const;
export type RadarProfileNextAction = typeof RADAR_PROFILE_NEXT_ACTIONS[number];

export type RadarResearchProfileProjection = {
  profile: RadarResearchProfile;
  /**
   * `true` quando o pipeline do Google continua sendo a autoridade daquele
   * artigo. Quem consome deve cair na leitura antiga em vez de usar `state`.
   */
  ownedByGooglePipeline: boolean;
  state: RadarProfileState;
  statusLabel: string;
  /** Existe fotografia congelada. `state` já reflete isso; o campo é para a UI. */
  frozen: boolean;
  finalizedAt: string | null;
  counts: {
    /** Consultas EXECUTADAS. Planejadas não são coleta. */
    queries: number;
    /** Vídeos únicos no universo competitivo — nunca "referências". */
    videos: number;
  };
  support: {
    collected: boolean;
    failureReason: string | null;
  } | null;
  /** O blueprint multiformato congelou junto? */
  multimodalFrozen: boolean;
  /** As linhas do card, na ordem. Vocabulário do PERFIL, não do Google. */
  lines: string[];
  /** Uma linha só, para avisos e para a tabela. */
  headline: string;
  nextAction: { id: RadarProfileNextAction; label: string };

  /*
   * ====== 1.2 · AS TRAVAS DE UI SAEM DAQUI, NÃO DE CADA TELA ======
   *
   * O 1.1 pôs o ESTADO numa autoridade só e a tela continuou dividida: o badge
   * da área, a barra recolhida e o seletor de perfil derivavam por conta
   * própria e ofereciam "Iniciar Pesquisa YouTube" sobre uma investigação
   * congelada. Dado finalizado, produto não.
   *
   * Uma tela que pergunta "posso começar?" e recebe FALSE não tem como
   * discordar das outras.
   */

  /** §3 · depois do freeze o perfil deixa de ser trocável. */
  profileLocked: boolean;
  /** Por que está travado, em português. `null` quando não está. */
  lockReason: string | null;
  /** §4 · START, Nova coleta e Refinalizar somem com isto em `false`. */
  canStart: boolean;
  /** §5 · existe fotografia para abrir. */
  showBlueprint: boolean;
  /**
   * §6 · a amostra competitiva nasce recolhida depois do freeze.
   *
   * 38 vídeos abertos como conteúdo principal enterram a recomendação, que é o
   * que a pessoa vem ler depois de finalizar.
   */
  sampleDefaultExpanded: boolean;
  /**
   * §9 · O ESTADO DO ARTIGO NO RADAR — que não é o estado da PESQUISA.
   *
   * Pesquisa congelada não quer dizer Radar concluído: o relatório ainda
   * espera revisão. Chamar o artigo inteiro de "Finalizado" aqui prometeria um
   * trabalho que não terminou; chamá-lo de "Não iniciado" nega um que
   * terminou. `READY` é a resposta honesta, e só existe quando a pesquisa
   * congelou.
   */
  workflowStatusHint: "READY" | null;
};

const NEXT_ACTION_LABELS: Record<RadarProfileNextAction, string> = {
  START_RESEARCH: "Iniciar pesquisa",
  WAIT_COLLECTION: "Aguardar a coleta",
  RETRY_SUPPORT: "Tentar novamente apoio Google",
  FINALIZE: "Finalizar investigação",
  RETRY_RESEARCH: "Tentar a pesquisa novamente",
  REVIEW_REPORT: "Revisar o relatório",
  /*
   * §19 · DEPOIS DE PRONTA, A CONTINUAÇÃO É ANALISAR — NUNCA COMEÇAR.
   *
   * Oferecer "Iniciar Pesquisa Amazon" sobre um pacote READY convidaria a
   * pagar de novo pelo que já está coletado.
   */
  ANALYZE_RESEARCH: "Analisar pesquisa Amazon",
};

/**
 * O STATUS GRAVADO VIRA ESTADO DE TELA — e a tradução mora em um lugar só.
 *
 * `PARTIAL_SUPPORT_FAILED` é o caso que justifica a tabela existir: ele não é
 * falha nem sucesso, e qualquer ramo que só conheça os dois extremos ou jogaria
 * fora a coleta paga ou mentiria que o apoio veio.
 */
const LEITURA_DO_PACOTE: Record<string, { state: RadarProfileState; linha: string; proxima: RadarProfileNextAction }> = {
  COLLECTING: { state: "COLLECTING", linha: "Coleta em andamento", proxima: "WAIT_COLLECTION" },
  READY: { state: "READY", linha: "Pesquisa concluída", proxima: "FINALIZE" },
  /*
   * ============ 1.1 · §23 · SUCESSO PAGO NÃO É "FALHOU" ============
   *
   * A coleta da Amazon tinha acontecido, tinha sido cobrada e tinha trazido 59
   * produtos. A tela dizia "apoio falhou" e a leitura da pessoa foi que a
   * pesquisa inteira tinha falhado — o que convida a um START novo, que cobra
   * a prateleira de novo para corrigir uma leitura do Google que custou uma.
   *
   * O estado continua distinguindo as duas coletas. O que muda é a palavra: o
   * apoio está PENDENTE, tem um botão próprio, e a primária está concluída.
   */
  PARTIAL_SUPPORT_FAILED: {
    state: "PARTIAL_SUPPORT_FAILED",
    linha: "Pesquisa principal concluída; o apoio do Google ficou pendente",
    proxima: "RETRY_SUPPORT",
  },
  FAILED: { state: "FAILED", linha: "A pesquisa falhou", proxima: "RETRY_RESEARCH" },
};

type CorridaGravada = { state?: unknown; queries?: unknown; universe?: unknown } | null;

type LeituraDaAnalise = {
  youtubeSearch?: CorridaGravada;
  /** §18 · a corrida da Amazon é campo próprio, ao lado da de vídeo. */
  amazonSearch?: CorridaGravada;
  youtubeFrozenInvestigation?: {
    finalizedAt?: unknown;
    run?: { queries?: unknown; universe?: unknown } | null;
    multimodal?: unknown;
  } | null;
  supportResearch?: { collectedAt?: unknown; failureReason?: unknown } | null;
  /** §16 · o pacote gravado, quando o perfil já o produz. */
  researchPackage?: unknown;
  /** §23 · o blueprint da Amazon, gravado pela análise. */
  amazonBlueprint?: unknown;
  /** §25 · a fotografia da Amazon, quando já houve FINALIZE. */
  amazonFrozenInvestigation?: unknown;
  serpSnapshotId?: unknown;
  deepResearch?: unknown;
};

const objeto = (valor: unknown) =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;

const lista = (valor: unknown) => Array.isArray(valor) ? valor : [];

/**
 * ============ A PROJEÇÃO CANÔNICA ============
 *
 * `profile` vem de quem pergunta porque a chavinha é preferência de tela até o
 * START gravar o alvo; o payload é a verdade sobre o que já aconteceu.
 */
export function radarResearchProfileStateOfAnalysis(input: {
  payload: unknown;
  profile: RadarResearchProfile;
}): RadarResearchProfileProjection {
  const analise = (objeto(input.payload) || {}) as LeituraDaAnalise;
  const plano = RADAR_RESEARCH_PROFILE_PLANS[input.profile];
  const rotuloDoPerfil = radarResearchProfileLabel(input.profile);
  /*
   * A UNIDADE DO UNIVERSO MUDA COM O PERFIL.
   *
   * "38 vídeo(s)" num artigo de produto descreveria a investigação errada, e o
   * card inteiro passaria a falar de uma coleta que não é a dele.
   */
  const unidade = input.profile === "AMAZON" ? "produto(s)" : "vídeo(s)";

  /*
   * ======== O PERFIL GOOGLE DEVOLVE A MÃO — §16 ========
   *
   * O pipeline dele é outro e está homologado. Traduzi-lo para estes seis
   * estados perderia curadoria, modelo e revisão pelo caminho — seis caixas
   * onde havia seis etapas com nomes próprios.
   */
  if (input.profile === "GOOGLE") {
    return {
      profile: input.profile,
      ownedByGooglePipeline: true,
      state: analise.serpSnapshotId || analise.deepResearch ? "COLLECTING" : "NOT_STARTED",
      statusLabel: "",
      frozen: false,
      finalizedAt: null,
      counts: { queries: 0, videos: 0 },
      support: null,
      multimodalFrozen: false,
      lines: [],
      headline: "",
      nextAction: { id: "START_RESEARCH", label: NEXT_ACTION_LABELS.START_RESEARCH },
      /* Quem trava e destrava o pipeline do Google é ele mesmo. */
      profileLocked: false, lockReason: null, canStart: true,
      showBlueprint: false, sampleDefaultExpanded: true, workflowStatusHint: null,
    };
  }

  /*
   * ====== A FOTOGRAFIA É A DO PERFIL — AMAZON_SEARCH_2 · §27 ======
   *
   * Ler `youtubeFrozenInvestigation` num artigo de produto diria "não
   * finalizada" sobre uma investigação congelada, e a tela voltaria a
   * oferecer START sobre uma fotografia assinada — o defeito que o 1.2
   * fechou, reaberto por ler o campo do perfil errado.
   */
  const congelada = objeto(
    input.profile === "AMAZON" ? analise.amazonFrozenInvestigation : analise.youtubeFrozenInvestigation,
  );
  /*
   * ====== A CORRIDA É A DO PERFIL — AMAZON_SEARCH_1 ======
   *
   * Até aqui isto lia `youtubeSearch` para qualquer perfil que não fosse o
   * Google, porque só havia um. Com a Amazon coletando, ler a corrida errada
   * faria um artigo de produto anunciar "não iniciada" sobre uma coleta que
   * aconteceu — exatamente o defeito que o 1.1 fechou, por outro caminho.
   */
  const corrida = objeto(input.profile === "AMAZON" ? analise.amazonSearch : analise.youtubeSearch);

  /*
   * ============ §16 · O PACOTE É A AUTORIDADE, QUANDO EXISTE ============
   *
   * Ele foi gravado pelo servidor, com as duas coletas amarradas pelo mesmo
   * clique. Ler os campos soltos ao lado dele abriria uma segunda leitura da
   * mesma investigação — e foi exatamente isso que fez a tela dizer "não
   * iniciada" e "finalizada" ao mesmo tempo no 1.1.
   *
   * O campo solto continua respondendo por quem ainda não tem pacote: o perfil
   * YouTube grava `supportResearch` e não grava pacote.
   */
  const pacote = objeto(analise.researchPackage);
  const apoioDoPacote = pacote ? objeto(pacote.supportResearch) : null;
  const apoio = apoioDoPacote || objeto(analise.supportResearch);

  const apoioPlanejado = Boolean(plano.supportRole);
  /*
   * No pacote o apoio declara STATUS; nos campos soltos, só a data. Ler as duas
   * formas aqui é o que permite o YouTube seguir como está enquanto a Amazon
   * usa o pacote.
   */
  const apoioColetado = apoioDoPacote
    ? apoioDoPacote.status === "COLLECTED"
    : Boolean(apoio?.collectedAt);
  const apoioFalhou = apoioDoPacote
    ? apoioDoPacote.status === "FAILED" || apoioDoPacote.status === "SKIPPED"
    : Boolean(apoio?.failureReason) && !apoioColetado;

  /*
   * ============ §4 e §5 · A FOTOGRAFIA TEM PRECEDÊNCIA ============
   *
   * Aqui está a correção do bloqueio. Antes desta guarda, um artigo finalizado
   * caía nas regras de transição abaixo e voltava a dizer "Coletando" ou "Não
   * iniciada" — porque ali só existiam campos vivos.
   *
   * E os números saem da fotografia, não da corrida: a corrida é recalculável,
   * e foi por isso que ela foi congelada.
   */
  if (congelada) {
    /*
     * §26 · NA AMAZON OS NÚMEROS VÊM DA REFERÊNCIA.
     *
     * A fotografia dela não copia a corrida — por construção. Procurar
     * `congelada.run` aqui devolveria zero sobre uma investigação real, e a
     * tela anunciaria "0 consulta(s) · 0 produto(s) · Finalizada".
     */
    const referencia = objeto(congelada.runRef);
    const corridaCongelada = objeto(congelada.run);
    const consultas = referencia
      ? Number(referencia.queriesExecuted) || 0
      : lista(corridaCongelada?.queries).filter(item => objeto(item)?.executed === true).length;
    const videos = referencia
      ? Number(referencia.universeSize) || 0
      : lista(corridaCongelada?.universe).length;
    const finalizedAt = typeof congelada.finalizedAt === "string" ? congelada.finalizedAt : null;
    const multimodal = Boolean(objeto(congelada.multimodal));

    const linhas = [
      rotuloDoPerfil,
      `${consultas} consulta(s) · ${videos} ${unidade}`,
      "Investigação competitiva concluída",
      multimodal ? "Blueprint multiformato congelado" : "Blueprint competitivo congelado",
    ];

    return {
      profile: input.profile,
      ownedByGooglePipeline: false,
      state: "FINALIZED",
      statusLabel: RADAR_PROFILE_STATE_LABELS.FINALIZED,
      frozen: true,
      finalizedAt,
      counts: { queries: consultas, videos },
      /*
       * O APOIO DEPOIS DO FREEZE NÃO SEGURA MAIS NADA — §12.
       *
       * Um `supportResearch` preso em pendente descreve o passado da coleta,
       * não a investigação congelada. Ele continua gravado (o histórico não se
       * apaga); o que ele perde é o poder de puxar o pacote para COLLECTING.
       */
      support: apoioPlanejado ? { collected: apoioColetado, failureReason: null } : null,
      multimodalFrozen: multimodal,
      lines: linhas,
      headline: `${rotuloDoPerfil} · ${consultas} consulta(s) · ${videos} ${unidade} · ${RADAR_PROFILE_STATE_LABELS.FINALIZED}`,
      nextAction: { id: "REVIEW_REPORT", label: NEXT_ACTION_LABELS.REVIEW_REPORT },

      /*
       * §3 e §4 · O LOCK.
       *
       * Trocar de perfil aqui trocaria o universo sob uma fotografia já
       * assinada — e um START novo faria o mesmo em silêncio. A única porta
       * para desfazer é reabrir, que é explícita e diz o que custa.
       */
      profileLocked: true,
      lockReason: `Esta investigação foi finalizada em ${rotuloDoPerfil}. Reabra/zere a investigação para escolher outro perfil.`,
      canStart: false,
      showBlueprint: true,
      sampleDefaultExpanded: false,
      workflowStatusHint: "READY",
    };
  }

  /* ==================== sem fotografia: o estado vivo ==================== */

  const estadoDaCorrida = typeof corrida?.state === "string" ? corrida.state : null;
  const primariaDoPacote = pacote ? objeto(pacote.primaryResearch) : null;

  /*
   * §7 · A CONTAGEM DO PACOTE É A DE PRODUTOS ÚNICOS.
   *
   * Contar itens de página diria "55" onde há 51 produtos, e "2 patrocinados"
   * onde há 1 comprando dois slots. O pacote já guarda a distinção; recontar
   * aqui a perderia.
   */
  const consultas = primariaDoPacote
    ? Number(primariaDoPacote.queryCount) || 0
    : lista(corrida?.queries).filter(item => objeto(item)?.executed === true).length;
  const videos = primariaDoPacote
    ? Number(primariaDoPacote.uniqueProductCount) || 0
    : lista(corrida?.universe).length;

  /*
   * ============ §16 · UM READ-MODEL, E ELE É O PACOTE ============
   *
   * Cabeçalho, corpo, tabela, barra de ação e próxima ação saem daqui. Deixar
   * cada um deduzir o estado por conta própria é o que produziu, no 1.1, uma
   * tela que dizia "não iniciada" no topo e "finalizada" na linha de baixo.
   *
   * Os ramos abaixo continuam respondendo por quem ainda não grava pacote — o
   * perfil YouTube — e é por isso que este ramo testa a existência, não o
   * perfil.
   */
  /*
   * ============ §24 · A ANÁLISE JÁ FEITA VENCE O PACOTE ============
   *
   * Existindo blueprint gravado, a investigação passou da coleta. Continuar
   * dizendo "Pronta" ofereceria "Analisar" de novo sobre uma análise que já
   * aconteceu — e recalculá-la mudaria a página sob quem já a leu.
   */
  const blueprintGravado = objeto(analise.amazonBlueprint);
  if (input.profile === "AMAZON" && blueprintGravado) {
    return montar({
      input, plano, rotuloDoPerfil, unidade, state: "READY_TO_FINALIZE",
      consultas, videos, apoioPlanejado, apoioColetado, apoioFalhou,
      linhaDeEstado: "Blueprint competitivo gerado, aguardando revisão",
      proxima: "FINALIZE",
    });
  }

  const statusDoPacote = typeof pacote?.status === "string" ? pacote.status : null;
  if (statusDoPacote) {
    const leitura = LEITURA_DO_PACOTE[statusDoPacote];
    if (leitura) {
      return montar({
        input, plano, rotuloDoPerfil, unidade, state: leitura.state,
        consultas, videos, apoioPlanejado, apoioColetado, apoioFalhou,
        linhaDeEstado: leitura.linha,
        /* READY do YouTube ainda congela; READY da Amazon segue para a análise. */
        proxima: leitura.proxima === "FINALIZE" && input.profile === "AMAZON" ? "ANALYZE_RESEARCH" : leitura.proxima,
      });
    }
  }

  /*
   * ======== §4 · "NUNCA COMEÇOU" NÃO É "COLETANDO" ========
   *
   * A ausência deste estado era metade do defeito: sem corrida nenhuma, a
   * projeção antiga caía em COLLECTING e a tela dizia que estava coletando algo
   * que ninguém pediu.
   */
  if (!corrida) {
    return montar({
      input, plano, rotuloDoPerfil, unidade, state: "NOT_STARTED",
      consultas: 0, videos: 0, apoioPlanejado, apoioColetado: false, apoioFalhou: false,
      linhaDeEstado: "Nenhuma coleta iniciada",
      proxima: "START_RESEARCH",
    });
  }

  if (estadoDaCorrida === "COLLECTING") {
    return montar({
      input, plano, rotuloDoPerfil, unidade, state: "COLLECTING",
      consultas, videos, apoioPlanejado, apoioColetado, apoioFalhou,
      linhaDeEstado: "Coleta em andamento",
      proxima: "WAIT_COLLECTION",
    });
  }

  /*
   * FALHA DE COLETA SEM UNIVERSO É FALHA. Com universo, não é: a coleta
   * conseguiu alguma coisa, e jogá-la fora cobraria de novo o que já foi pago.
   */
  if (estadoDaCorrida === "COLLECTION_FAILED" && videos === 0) {
    return montar({
      input, plano, rotuloDoPerfil, unidade, state: "FAILED",
      consultas, videos, apoioPlanejado, apoioColetado, apoioFalhou,
      linhaDeEstado: "A coleta falhou e não há investigação utilizável",
      proxima: "RETRY_RESEARCH",
    });
  }

  if (apoioPlanejado && apoioFalhou) {
    return montar({
      input, plano, rotuloDoPerfil, unidade, state: "PARTIAL_SUPPORT_FAILED",
      consultas, videos, apoioPlanejado, apoioColetado, apoioFalhou,
      linhaDeEstado: "Pesquisa principal preservada; o apoio do Google falhou",
      proxima: "RETRY_SUPPORT",
    });
  }

  if (apoioPlanejado && !apoioColetado) {
    return montar({
      input, plano, rotuloDoPerfil, unidade, state: "COLLECTING",
      consultas, videos, apoioPlanejado, apoioColetado, apoioFalhou,
      linhaDeEstado: "Apoio do Google pendente",
      proxima: "WAIT_COLLECTION",
    });
  }

  return montar({
    input, plano, rotuloDoPerfil, unidade, state: "READY",
    consultas, videos, apoioPlanejado, apoioColetado, apoioFalhou,
    linhaDeEstado: input.profile === "AMAZON"
      ? "Pesquisa concluída, pronta para análise"
      : "Investigação utilizável, ainda não congelada",
    proxima: input.profile === "AMAZON" ? "ANALYZE_RESEARCH" : "FINALIZE",
  });
}

/**
 * §19 · "Tentar novamente" sozinho não diz o que vai ser refeito — e aqui a
 * diferença custa dinheiro: repetir o apoio é de graça, repetir a pesquisa da
 * Amazon é uma coleta paga.
 */
function rotuloDaProxima(proxima: RadarProfileNextAction, profile: RadarResearchProfile): string {
  if (proxima === "RETRY_RESEARCH" && profile === "AMAZON") return "Tentar novamente Pesquisa Amazon";
  return NEXT_ACTION_LABELS[proxima];
}

function montar(entrada: {
  input: { profile: RadarResearchProfile };
  plano: typeof RADAR_RESEARCH_PROFILE_PLANS[RadarResearchProfile];
  rotuloDoPerfil: string;
  state: RadarProfileState;
  consultas: number;
  videos: number;
  apoioPlanejado: boolean;
  apoioColetado: boolean;
  apoioFalhou: boolean;
  linhaDeEstado: string;
  unidade: string;
  proxima: RadarProfileNextAction;
}): RadarResearchProfileProjection {
  const linhas = [entrada.rotuloDoPerfil];
  /* "0 consulta(s) · 0 vídeo(s)" numa pesquisa não iniciada é ruído. */
  if (entrada.state !== "NOT_STARTED") linhas.push(`${entrada.consultas} consulta(s) · ${entrada.videos} ${entrada.unidade}`);
  linhas.push(entrada.linhaDeEstado);

  const partes = [entrada.rotuloDoPerfil];
  if (entrada.state !== "NOT_STARTED") partes.push(`${entrada.consultas} consulta(s)`, `${entrada.videos} ${entrada.unidade}`);
  partes.push(RADAR_PROFILE_STATE_LABELS[entrada.state]);

  return {
    profile: entrada.input.profile,
    ownedByGooglePipeline: false,
    state: entrada.state,
    statusLabel: RADAR_PROFILE_STATE_LABELS[entrada.state],
    frozen: false,
    finalizedAt: null,
    counts: { queries: entrada.consultas, videos: entrada.videos },
    support: entrada.apoioPlanejado
      ? { collected: entrada.apoioColetado, failureReason: entrada.apoioFalhou ? "O apoio do Google não pôde ser coletado." : null }
      : null,
    multimodalFrozen: false,
    lines: linhas,
    headline: partes.join(" · "),
    nextAction: { id: entrada.proxima, label: rotuloDaProxima(entrada.proxima, entrada.input.profile) },
    /*
     * ANTES DO FREEZE NADA ESTÁ TRAVADO — e é assim que tem de ser: a escolha
     * do perfil pertence a quem ainda não gastou nada com ela.
     */
    profileLocked: false,
    lockReason: null,
    /*
     * Coleta em curso não aceita outro START — e ANÁLISE FEITA também não.
     *
     * AMAZON_SEARCH_2 · §23: depois do blueprint gerado, um START recoletaria
     * a prateleira e jogaria fora a análise que a pessoa está revisando.
     * Reabrir continua possível, e é explícito.
     */
    canStart: entrada.state !== "COLLECTING" && entrada.state !== "READY_TO_FINALIZE",
    /*
     * §28 · O BLUEPRINT É LEGÍVEL ASSIM QUE EXISTE, não só depois do freeze.
     *
     * Revisar antes de congelar é exatamente o que "aguardando revisão" pede;
     * esconder a leitura até o FINALIZE faria a decisão humana acontecer às
     * cegas.
     */
    showBlueprint: entrada.state === "READY_TO_FINALIZE",
    /* §29 · com blueprint na tela, 51 produtos abertos empurram a conclusão para fora. */
    sampleDefaultExpanded: entrada.state !== "READY_TO_FINALIZE",
    workflowStatusHint: null,
  };
}

/**
 * ============ §9 · O FINALIZE É IDEMPOTENTE ============
 *
 * Clicar de novo sobre uma investigação já congelada não pode tirar outra
 * fotografia: `finalizedAt` mudaria, uma versão nova da análise nasceria e o
 * Planejador veria duas investigações onde houve uma. "Congelado" que se
 * reescreve a cada clique não congela nada.
 */
export function radarYoutubeFinalizeDecision(input: {
  payload: unknown;
  profile: RadarResearchProfile;
}): { shouldFreeze: boolean; reason: string } {
  const projecao = radarResearchProfileStateOfAnalysis(input);

  if (projecao.state === "FINALIZED") {
    return { shouldFreeze: false, reason: "Investigação já estava finalizada; nenhuma fotografia nova foi criada." };
  }
  if (projecao.state === "NOT_STARTED") {
    return { shouldFreeze: false, reason: "Não há coleta para finalizar." };
  }
  if (projecao.state === "COLLECTING") {
    return { shouldFreeze: false, reason: "A coleta ainda está em andamento; finalizar agora congelaria uma investigação pela metade." };
  }
  if (projecao.state === "FAILED") {
    return { shouldFreeze: false, reason: "A coleta falhou e não há investigação utilizável para congelar." };
  }
  return { shouldFreeze: true, reason: "Investigação congelada: consultas, amostra, coortes e blueprint." };
}

/**
 * O APOIO ESPERADO POR ESTE PERFIL — reexportado para a tela não recalcular.
 *
 * Ela precisa saber se DEVIA haver apoio para distinguir "este perfil não tem"
 * de "tem e não veio".
 */
/**
 * ====== §8 · A EVIDÊNCIA QUE O RELATÓRIO PODE USAR ======
 *
 * Só de investigação CONGELADA, e só o que ela realmente sustenta: consultas,
 * universo e a presença do blueprint multiformato. Nada aqui inventa páginas
 * extraídas, fontes verificadas ou pontos de especialista — esses continuam
 * falando do pipeline do Google, e um check verde sem lastro é pior do que um
 * check pendente.
 */
export function radarYoutubeReportEvidence(projecao: RadarResearchProfileProjection | null | undefined) {
  if (!projecao || projecao.ownedByGooglePipeline || projecao.state !== "FINALIZED") return null;
  return {
    finalized: true,
    queries: projecao.counts.queries,
    videos: projecao.counts.videos,
    multimodalFrozen: projecao.multimodalFrozen,
  };
}

/**
 * ============ §33 · O QUE O RELATÓRIO PODE AFIRMAR SOBRE A AMAZON ============
 *
 * Pesquisa congelada, apoio comercial do Google e blueprint competitivo. E
 * NADA além disso.
 *
 * A tentação aqui é deixar "evidência de produto" verde porque há 51 produtos
 * na amostra. Mas a SERP de produtos não abriu review, não abriu PDP e não
 * leu atributo nenhum: um check verde que o dado não sustenta é pior do que
 * um check pendente, porque ninguém volta para conferir o que já está verde.
 */
export function radarAmazonReportEvidence(input: {
  projecao: RadarResearchProfileProjection | null | undefined;
  payload: unknown;
}) {
  const projecao = input.projecao;
  if (!projecao || projecao.profile !== "AMAZON" || projecao.state !== "FINALIZED") return null;

  const analise = objeto(input.payload);
  const congelada = objeto(analise?.amazonFrozenInvestigation);
  const blueprint = objeto(congelada?.competitiveBlueprint);
  const apoios = lista(congelada?.supportRefs);

  return {
    finalized: true,
    queries: projecao.counts.queries,
    products: projecao.counts.videos,
    /* O apoio é declarado pela fotografia, não deduzido da tela. */
    supportCollected: apoios.length > 0,
    blueprintFrozen: Boolean(blueprint),
    editorialOutput: typeof congelada?.editorialOutput === "string" ? congelada.editorialOutput : null,
  };
}

export const radarProfileExpectsSupport = (profile: RadarResearchProfile, primaryKeyword: string | null) =>
  Boolean(radarProfileSupportPlan({ profile, primaryKeyword }));
