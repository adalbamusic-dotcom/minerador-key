/**
 * UMA PESQUISA, UM MODO — e eles não se misturam.
 *
 *   GOOGLE   páginas e artigos. O benchmark é editorial: estrutura, tópicos,
 *            headings, tamanho, cobertura.
 *   YOUTUBE  vídeos. O benchmark é audiovisual: abordagem, sequência, hook,
 *            duração, canal. Comparar um vídeo com um artigo por número de H2
 *            não descreve nada.
 *   AMAZON   produtos. O benchmark é de listagem: atributos, benefícios,
 *            objeções, avaliações.
 *
 * A CASCA NASCE EXTENSÍVEL. Quando Mercado Livre e Shopee chegarem, entram na
 * mesma lista sem redesenhar o Radar — e a decisão de agrupar tudo sob
 * "Marketplaces" pode ser tomada lá, não agora.
 *
 * Seleção ÚNICA: uma investigação descreve um universo só. Nada de Google mais
 * Amazon marcados ao mesmo tempo.
 *
 * A escolha é do usuário, antes de começar, e fica gravada na investigação. O
 * modo NÃO muda no meio: uma investigação descreve um universo só.
 *
 * O QUE A FONTE ATUAL DÁ, E O QUE ELA NÃO DÁ — declarado, não presumido.
 * A SERP do Google já devolve o bloco de vídeos e o normalizador os preserva
 * com `inferredType: "video"`. Isso basta para observar quais vídeos competem,
 * de que canal e em que posição. Métricas próprias do YouTube (visualizações,
 * duração, capítulos, transcrição) NÃO vêm daí, e este módulo diz isso em vez
 * de inventar número.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { z } from "zod";

export const RadarPrimarySearchModeSchema = z.enum(["WEB", "YOUTUBE", "AMAZON"]);
export type RadarPrimarySearchMode = z.infer<typeof RadarPrimarySearchModeSchema>;

export const RADAR_DEFAULT_SEARCH_MODE: RadarPrimarySearchMode = "WEB";

export const radarSearchModeLabel = (mode: RadarPrimarySearchMode) =>
  ({ WEB: "Google", YOUTUBE: "YouTube", AMAZON: "Amazon" }[mode]);

/**
 * O QUE CADA MODO CONSEGUE FAZER HOJE — declarado, não presumido.
 *
 * O seletor reconhece os três porque a casca precisa nascer extensível: quando
 * Mercado Livre e Shopee chegarem, entram aqui sem redesenhar o Radar. Mas
 * reconhecer o modo NÃO é ter a engine dele. Oferecer um botão que não pesquisa
 * seria pior do que não oferecer botão nenhum.
 */
export type RadarSearchModeEngine = "available" | "partial" | "planned";

export const RADAR_SEARCH_MODE_ENGINE: Record<RadarPrimarySearchMode, RadarSearchModeEngine> = {
  WEB: "available",
  /*
   * A PESQUISA DE YOUTUBE PASSOU A TER ENGINE PRÓPRIA — YOUTUBE_SEARCH_1.
   *
   * Até aqui ela lia o bloco de vídeos da SERP do Google: dava para saber QUE
   * vídeo aparece ali e nada além. Agora a coleta é a SERP do próprio YouTube,
   * com consultas montadas para vídeo, dedupe por `videoId` e universo
   * competitivo classificado por FORMATO.
   *
   * Ela é `available` para START, coleta, universo e curadoria. Análise
   * profunda — transcript de concorrente, hook, roteiro — é o YOUTUBE_SEARCH_2,
   * e por isso o rótulo não promete "completo".
   */
  YOUTUBE: "available",
  /*
   * A PESQUISA DE AMAZON DEIXOU DE SER PLANO — 2.1 · §8.
   *
   * Ela já tinha START, corrida gravada, coleta síncrona na Merchant API,
   * universo deduplicado por ASIN, apoio do Google no mesmo pedido, freeze e
   * blueprint comercial. O que faltava era a chamada ATRAVESSAR: o idioma saía
   * sem região e o provider recusava a tarefa.
   *
   * Corrigido isso, "em construção" passou a ser a única parte falsa da tela —
   * e um rótulo que desmente o botão ao lado ensina a não confiar em nenhum dos
   * dois. Texto de review, PDP e enriquecimento por ASIN continuam fora, e é a
   * LIMITAÇÃO da coleta que diz isso, no lugar onde ela é lida.
   */
  AMAZON: "available",
};

export const radarSearchModeAvailability = (mode: RadarPrimarySearchMode) => ({
  engine: RADAR_SEARCH_MODE_ENGINE[mode],
  canStart: RADAR_SEARCH_MODE_ENGINE[mode] !== "planned",
  reason: RADAR_SEARCH_MODE_ENGINE[mode] === "planned"
    ? `A pesquisa em ${radarSearchModeLabel(mode)} ainda não foi construída. O modo aparece porque a casca já o reconhece.`
    : RADAR_SEARCH_MODE_ENGINE[mode] === "partial"
      ? `A pesquisa em ${radarSearchModeLabel(mode)} usa o bloco de vídeos da busca: observa quais vídeos competem, sem métricas próprias da plataforma.`
      : null,
});

/** Os tipos de resultado que cada modo aceita como AMOSTRA principal. */
const AMOSTRA_DO_MODO: Record<RadarPrimarySearchMode, (tipo: string | null | undefined) => boolean> = {
  /* Vídeo é observação da SERP, nunca página do benchmark editorial. */
  WEB: tipo => (tipo || "").toLowerCase() !== "video",
  /* E artigo não entra no benchmark de vídeo pelo mesmo motivo, invertido. */
  YOUTUBE: tipo => (tipo || "").toLowerCase() === "video",
  /* Produto é a unidade da pesquisa de marketplace. Engine ainda não construída. */
  AMAZON: tipo => (tipo || "").toLowerCase() === "product",
};

export const radarResultBelongsToMode = (mode: RadarPrimarySearchMode, inferredType: string | null | undefined) =>
  AMOSTRA_DO_MODO[mode](inferredType);

export type RadarModeSplit<T> = {
  /** O que forma o benchmark deste modo. */
  sample: T[];
  /** O que a busca mostrou e não pertence a este benchmark. Evidência, não amostra. */
  crossReference: T[];
};

/**
 * A separação estrita, em um lugar só.
 *
 * Nenhuma tela decide sozinha "isto é vídeo, então..."; quem responde é esta
 * função, e o que sobra continua visível como referência cruzada.
 */
export function splitRadarResultsByMode<T extends { inferredType?: string | null }>(
  mode: RadarPrimarySearchMode,
  results: readonly T[],
): RadarModeSplit<T> {
  const sample: T[] = [];
  const crossReference: T[] = [];
  for (const result of results) {
    (radarResultBelongsToMode(mode, result.inferredType) ? sample : crossReference).push(result);
  }
  return { sample, crossReference };
}

/**
 * O QUE A FONTE ATUAL ENTREGA NO MODO VÍDEO.
 *
 * Existe para o relatório poder dizer "isto não foi observado porque a fonte
 * não fornece" — em vez de deixar o campo vazio parecendo ausência de padrão.
 */
export const RADAR_YOUTUBE_SOURCE_COVERAGE = {
  dataForSeoHas: [
    "URL e videoId (derivável da URL)",
    "título do vídeo",
    "canal (pelo domínio/URL, quando o provider o expõe)",
    "posição no bloco de vídeos da SERP",
    "descrição curta / snippet",
    "data, quando o item a traz",
  ],
  youtubeApiRequiredFor: [
    "visualizações",
    "duração exata",
    "capítulos",
    "transcrição / legendas",
    "inscritos e autoridade do canal",
    "links da descrição completa",
    "engajamento (likes, comentários)",
  ],
} as const;

/** A limitação, escrita para o relatório. */
export function radarYoutubeSourceLimitation(): string {
  return `A pesquisa de vídeo usa o bloco de vídeos da SERP: ela observa qual vídeo compete, de que canal e em que posição. ${RADAR_YOUTUBE_SOURCE_COVERAGE.youtubeApiRequiredFor.join(", ")} exigiriam a API oficial do YouTube e não foram observados.`;
}

/**
 * ============ UM ARTIGO, UMA INVESTIGAÇÃO — YOUTUBE_SEARCH_1.1 · §1 ============
 *
 * O `primaryMode` de um artigo se COMPROMETE na primeira investigação e não
 * muda depois. Um artigo com a pesquisa do Google fechada não vira artigo de
 * YouTube: converter exigiria zerar o que já foi pago, curado e aprovado, e
 * "zerar o que está fechado" nunca é o que a pessoa quis dizer ao clicar num
 * seletor de modo.
 *
 * A trava é SIMÉTRICA de propósito. Se ela valesse só para o Google, um artigo
 * que nasceu de YouTube aceitaria um START de Google por cima, e o mesmo
 * problema voltaria espelhado.
 *
 * Ela NÃO impede olhar: trocar o seletor continua mostrando a outra aba. O que
 * ela impede é a única ação que gasta e grava — o START.
 */
/**
 * ============== A REGRA, EM UM LUGAR SÓ — YOUTUBE_SEARCH_1.2 · §3 ==============
 *
 * Esta é a ÚNICA função que decide se uma troca de modo é permitida. A tela e
 * as duas rotas pagas chamam ela — não uma cópia, não uma variante. Duplicar a
 * regra por rota é como as duas se desencontram: a tela recusaria e o servidor
 * aceitaria, que é exatamente o defeito que este gate fecha.
 *
 * Ela impede TROCA de modo, e só isso. Mesmo modo passa direto: o que pode ou
 * não ser repetido dentro de um modo é decisão do lifecycle daquele modo, e
 * responder isso aqui daria a esta função uma segunda autoridade que ela não
 * tem (§5).
 */
export class RadarPrimaryModeConflictError extends Error {
  /** Código ESTÁVEL: cliente e log dependem dele. Não renomear. */
  readonly code = "RADAR_PRIMARY_MODE_CONFLICT" as const;
  readonly status = 409 as const;
  readonly currentMode: RadarPrimarySearchMode;
  readonly requestedMode: RadarPrimarySearchMode;

  constructor(currentMode: RadarPrimarySearchMode, requestedMode: RadarPrimarySearchMode) {
    super(`Este artigo já tem a investigação de ${radarSearchModeLabel(currentMode)} e um artigo descreve um universo só. Para pesquisar em ${radarSearchModeLabel(requestedMode)}, use outro artigo — a investigação de ${radarSearchModeLabel(currentMode)} não será zerada nem convertida.`);
    this.name = "RadarPrimaryModeConflictError";
    this.currentMode = currentMode;
    this.requestedMode = requestedMode;
  }

  /** O corpo útil que o §2 pede, montado onde a regra mora. */
  get body() {
    return { code: this.code, error: this.message, currentMode: this.currentMode, requestedMode: this.requestedMode };
  }
}

export function assertRadarResearchModeAllowed(input: {
  /** O modo a que o artigo JÁ se comprometeu. `null` = nenhum ainda. */
  currentMode: RadarPrimarySearchMode | null;
  /** O modo em que se quer iniciar agora. */
  requestedMode: RadarPrimarySearchMode;
}): void {
  /* Sem compromisso, ou continuando no mesmo universo: segue (§5). */
  if (!input.currentMode || input.currentMode === input.requestedMode) return;
  throw new RadarPrimaryModeConflictError(input.currentMode, input.requestedMode);
}

/**
 * ============== QUAL UNIVERSO ESTE ARTIGO JÁ DESCREVE — §1 ==============
 *
 * A resposta sai do que está GRAVADO na análise canônica, nunca do que o
 * cliente afirma. Um `mode` vindo no corpo do pedido seria justamente o vetor
 * que este gate fecha: quem chama a rota direto escolheria o próprio veredito.
 *
 * O parâmetro é estrutural de propósito — este módulo é domínio puro e não
 * importa o contrato da análise, que por sua vez já depende do modelo de vídeo.
 *
 * AMAZON ainda não tem investigação PERSISTIDA: o modo é reconhecido pela casca
 * e nenhum campo da análise o registra. Por isso ele nunca sai daqui hoje — e
 * quando o START de Amazon existir, entra como mais uma linha desta tabela, sem
 * tocar em quem chama.
 */
/**
 * ===== ALVO EDITORIAL × FONTES DE PESQUISA — YOUTUBE_SEARCH_2.1 · PARTE B =====
 *
 * ==================== O QUE ESTAVA RESTRITIVO DEMAIS ====================
 *
 * "UM primaryMode = UMA única SERP" confundia duas perguntas diferentes:
 *
 *   O QUE VAMOS PRODUZIR?   → um vídeo, um artigo, uma página de produto.
 *   DE ONDE VEM A LEITURA?  → SERP do YouTube, do Google, da Amazon.
 *
 * Fundi-las impedia o caso legítimo: um artigo cujo destino é VÍDEO, que usa a
 * SERP do Google como apoio para entender intenção, perguntas e termos. Sob a
 * regra antiga, coletar o Google convertia o artigo em WEB e bloqueava o
 * YouTube — o oposto do que a pessoa queria.
 *
 * ========================= O QUE MUDA, E O QUE NÃO =========================
 *
 * O ALVO continua imutável: ele define o produto editorial, e trocá-lo depois
 * de investigar significaria jogar fora o que já foi pago e curado.
 *
 * As FONTES passam a ser aditivas. Coletar uma segunda SERP nunca muda o alvo,
 * nunca invalida a investigação existente e nunca bloqueia a primeira fonte.
 */
/**
 * ===== A REVISÃO DO 2.1 — RADAR_MULTIMODAL_1 =====
 *
 * O 2.1 separou ALVO de FONTE e já foi um avanço. Mas ele deixou o alvo com o
 * mesmo vocabulário das fontes — `WEB | YOUTUBE | AMAZON` —, como se a saída
 * editorial fosse sempre "uma peça daquela plataforma".
 *
 * As duas SERPs reais da mesma keyword provaram o contrário: texto, vídeo
 * longo, Short e camada comercial disputavam a MESMA intenção. A resposta certa
 * não era "um artigo" nem "um vídeo" — era um pacote.
 *
 * Então são TRÊS coisas, não duas:
 *
 *   EDITORIAL OUTPUT   o que vamos produzir (pode ser um pacote)
 *   PRIMARY TARGET     onde a peça principal vive (imutável)
 *   RESEARCH SOURCES   de onde veio a leitura (aditivas)
 *
 * `primaryTarget` continua existindo e continua imutável: ele diz onde a peça
 * PRINCIPAL vive, e é o que impede uma investigação paga de ser jogada fora. O
 * que deixou de ser verdade é que ele determina o formato da entrega.
 */
export const RADAR_RESEARCH_SOURCES = ["WEB_SERP", "YOUTUBE_SERP", "AMAZON_SERP"] as const;
export type RadarResearchSource = typeof RADAR_RESEARCH_SOURCES[number];

export const RADAR_SOURCE_OF_MODE: Record<RadarPrimarySearchMode, RadarResearchSource> = {
  WEB: "WEB_SERP",
  YOUTUBE: "YOUTUBE_SERP",
  AMAZON: "AMAZON_SERP",
};

export const radarResearchSourceLabel = (source: RadarResearchSource) =>
  ({ WEB_SERP: "SERP do Google", YOUTUBE_SERP: "SERP do YouTube", AMAZON_SERP: "SERP da Amazon" }[source]);

/**
 * A FONTE OBRIGATÓRIA DE CADA ALVO — §6.
 *
 * Um artigo cujo destino é vídeo PRECISA da SERP do YouTube: sem ela não há
 * leitura do universo que ele vai disputar. As outras são apoio.
 */
export const RADAR_REQUIRED_SOURCE_FOR_TARGET: Record<RadarPrimarySearchMode, RadarResearchSource> = RADAR_SOURCE_OF_MODE;

/**
 * O PAPEL DE CADA FONTE — 1.1 · §3.
 *
 * `PRIMARY` é a fonte que corresponde ao alvo do artigo; `SUPPORTING` é
 * qualquer outra. Ele é DERIVADO do alvo, não gravado: um campo à parte seria
 * uma segunda verdade que um dia discordaria do alvo, e aí ninguém saberia
 * qual das duas manda.
 */
export type RadarResearchSourceRole = "PRIMARY" | "SUPPORTING";

export type RadarResearchSourceStatus = {
  source: RadarResearchSource;
  collected: boolean;
  role: RadarResearchSourceRole;
  /** Se esta fonte é a que o alvo exige. */
  required: boolean;
};

export type RadarResearchPlan = {
  /** O produto editorial. Imutável depois de declarado. */
  primaryTarget: RadarPrimarySearchMode | null;
  /** As fontes já coletadas, em ordem canônica. */
  sources: RadarResearchSource[];
  /** A fonte que o alvo exige e que ainda não foi coletada. `null` quando não falta. */
  missingRequiredSource: RadarResearchSource | null;
  /**
   * AS TRÊS FONTES, COLETADAS OU NÃO — §2.
   *
   * A tela precisa mostrar as três lado a lado para a pessoa entender que elas
   * se SOMAM. Uma lista só com o que já existe pareceria uma escolha feita.
   */
  sourceStatus: RadarResearchSourceStatus[];
};

/**
 * O PLANO DE PESQUISA LIDO DO QUE ESTÁ GRAVADO.
 *
 * O alvo EXPLÍCITO vence. Sem ele, cai na inferência legada — a primeira
 * investigação gravada era o alvo, e é assim que artigos anteriores a este
 * gate continuam sendo lidos corretamente.
 */
export function radarResearchPlanOfAnalysis(payload: unknown): RadarResearchPlan {
  const analise = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as {
    deepResearch?: unknown;
    youtubeSearch?: unknown;
    amazonSearch?: unknown;
    youtubeFrozenInvestigation?: unknown;
    amazonFrozenInvestigation?: unknown;
    finalizedBundle?: unknown;
    serpSnapshotId?: unknown;
    researchTarget?: { primaryTarget?: unknown } | null;
  };

  /*
   * ====== 2.1 · §10 · A FOTOGRAFIA TAMBÉM CONTA COMO FONTE COLETADA ======
   *
   * `compactRadarResearchForRead` zera as corridas depois do freeze — é decisão
   * de transporte, e o §10 é explícito: ela não altera estado semântico.
   *
   * Sem esta leitura, uma investigação de YouTube CONGELADA voltava a aparecer
   * com a fonte obrigatória faltando, e a tela oferecia coletar de novo — paga
   * — a SERP que está congelada ao lado.
   */
  const presente = (...valores: unknown[]) =>
    valores.some(valor => valor !== null && valor !== undefined);

  const sources: RadarResearchSource[] = [];
  /*
   * A SERP DO GOOGLE CONTA MESMO SEM INVESTIGAÇÃO PROFUNDA — 1.1 · §1.
   *
   * `deepResearch` é a investigação rica; `serpSnapshotId` é a coleta simples.
   * Uma leitura de APOIO num artigo de vídeo produz a segunda e não a primeira
   * — e olhar só `deepResearch` faria a fonte coletada sumir da lista, com a
   * tela oferecendo "adicionar Google" para algo que já existe.
   */
  if (presente(analise.deepResearch, analise.finalizedBundle)) sources.push("WEB_SERP");
  else if (presente(analise.serpSnapshotId)) sources.push("WEB_SERP");
  if (presente(analise.youtubeSearch, analise.youtubeFrozenInvestigation)) sources.push("YOUTUBE_SERP");
  /*
   * A AMAZON FALTAVA NESTA LISTA desde que o perfil existe.
   *
   * Sem ela, um artigo comercial com a prateleira já coletada aparecia com a
   * fonte obrigatória pendente — e o plano dizia para coletar outra vez.
   */
  if (presente(analise.amazonSearch, analise.amazonFrozenInvestigation)) sources.push("AMAZON_SERP");

  const declarado = analise.researchTarget?.primaryTarget;
  const explicito = RadarPrimarySearchModeSchema.safeParse(declarado);
  /*
   * A INFERÊNCIA LEGADA: a primeira investigação gravada declarava o alvo.
   *
   * Ela existe para não reescrever o passado. Assim que o alvo explícito for
   * gravado — e o START passa a gravá-lo —, é ele que responde.
   */
  const primaryTarget = explicito.success
    ? explicito.data
    : radarPrimaryModeOfAnalysis(payload);

  const exigida = primaryTarget ? RADAR_REQUIRED_SOURCE_FOR_TARGET[primaryTarget] : null;

  return {
    primaryTarget,
    sources,
    missingRequiredSource: exigida && !sources.includes(exigida) ? exigida : null,
    sourceStatus: RADAR_RESEARCH_SOURCES.map(source => ({
      source,
      collected: sources.includes(source),
      /*
       * SEM ALVO DECLARADO, nenhuma fonte é apoio: o artigo ainda não decidiu
       * o que produz, e chamar a primeira coleta de "apoio" seria inventar uma
       * hierarquia que ninguém estabeleceu.
       */
      role: primaryTarget && source !== RADAR_SOURCE_OF_MODE[primaryTarget] ? "SUPPORTING" : "PRIMARY",
      required: source === exigida,
    })),
  };
}

/**
 * ============ §7 · COLETAR APOIO NUNCA MUDA O ALVO ============
 *
 * Esta é a regra que substitui a trava de modo único para as FONTES. O alvo só
 * é recusado quando alguém tenta TROCÁ-LO; coletar uma segunda SERP passa.
 *
 * O `primaryTarget` devolvido é o que deve ficar gravado depois da operação:
 * o já declarado, ou o novo quando o artigo ainda não tinha nenhum.
 */
export type RadarSourceDecision = {
  primaryTarget: RadarPrimarySearchMode;
  /** `true` quando esta coleta é apoio, não a investigação principal. */
  isSupport: boolean;
  /** `true` quando esta operação é a que declara o alvo do artigo. */
  declaresTarget: boolean;
};

export function radarDecideResearchSource(input: {
  /** O que está gravado hoje. `null` = artigo sem alvo declarado. */
  currentTarget: RadarPrimarySearchMode | null;
  /** A SERP que se quer coletar agora. */
  source: RadarResearchSource;
  /**
   * O alvo que o pedido declara. Só é usado quando o artigo ainda não tem um —
   * e é assim que "coletar Google como apoio de um vídeo" existe: o alvo
   * declarado é YOUTUBE e a fonte é WEB_SERP.
   */
  intendedTarget?: RadarPrimarySearchMode | null;
}): RadarSourceDecision {
  const modoDaFonte = (Object.keys(RADAR_SOURCE_OF_MODE) as RadarPrimarySearchMode[])
    .find(modo => RADAR_SOURCE_OF_MODE[modo] === input.source)!;

  if (input.currentTarget) {
    /*
     * ARTIGO JÁ TEM ALVO: a coleta segue, e o alvo NÃO muda.
     *
     * Se a fonte não corresponde ao alvo, ela é apoio — e apoio é bem-vindo:
     * é exatamente o Google servindo a um artigo de vídeo.
     */
    return {
      primaryTarget: input.currentTarget,
      isSupport: modoDaFonte !== input.currentTarget,
      declaresTarget: false,
    };
  }

  /*
   * ARTIGO SEM ALVO: esta coleta o declara.
   *
   * O pedido pode dizer qual — permitindo começar pelo Google com o destino já
   * fixado em YOUTUBE. Sem declaração, o alvo é o da própria fonte.
   */
  const alvo = input.intendedTarget || modoDaFonte;
  return { primaryTarget: alvo, isSupport: modoDaFonte !== alvo, declaresTarget: true };
}

export function radarPrimaryModeOfAnalysis(payload: unknown): RadarPrimarySearchMode | null {
  /*
   * A TOLERÂNCIA A LIXO MORA AQUI, E SÓ AQUI.
   *
   * Quem chama lê de um payload persistido, e payload persistido envelhece. Uma
   * segunda checagem de forma no leitor do servidor não mudava resultado nenhum
   * — era código que nenhuma entrada distinguia. Com a guarda num lugar só,
   * quebrar a tolerância quebra um teste.
   */
  if (!payload) return null;
  /*
   * A CHECAGEM É SÓ ESTA, e é o bastante.
   *
   * `typeof` e `Array.isArray` pareciam necessários e não eram: ler
   * `.deepResearch` de um número, de uma string ou de um array já devolve
   * `undefined`, e `undefined` não prova compromisso nenhum. Nenhuma entrada
   * vinda de JSON distinguia as duas versões — era guarda que nunca decidiu.
   *
   * O que sobra decide de verdade: sem este `!payload`, `null` e `undefined`
   * fariam a leitura estourar dentro de uma guarda de integridade.
   */
  const analise = payload as { deepResearch?: unknown; youtubeSearch?: unknown };
  const provas: Array<[RadarPrimarySearchMode, unknown]> = [
    ["WEB", analise.deepResearch],
    ["YOUTUBE", analise.youtubeSearch],
  ];
  return provas.find(([, prova]) => prova !== null && prova !== undefined)?.[0] || null;
}

export type RadarPrimaryModeCommitment = {
  /** O modo a que este artigo já se comprometeu, ou `null` se nenhum ainda. */
  committedTo: RadarPrimarySearchMode | null;
  /** Se dá para iniciar uma investigação no modo perguntado. */
  canStart: boolean;
  /** Por que não dá. `null` quando dá. */
  reason: string | null;
};

/**
 * A MESMA REGRA, NA FORMA QUE A TELA PRECISA.
 *
 * A tela não lida bem com exceção: ela precisa DESABILITAR o botão e escrever o
 * motivo antes do clique. Este invólucro converte o veredito em resposta — e
 * chama a mesma função das rotas, para não existirem duas versões da regra.
 */
export function radarPrimaryModeCommitment(input: {
  mode: RadarPrimarySearchMode;
  currentMode: RadarPrimarySearchMode | null;
}): RadarPrimaryModeCommitment {
  try {
    assertRadarResearchModeAllowed({ currentMode: input.currentMode, requestedMode: input.mode });
    return { committedTo: input.currentMode, canStart: true, reason: null };
  } catch (erro) {
    if (!(erro instanceof RadarPrimaryModeConflictError)) throw erro;
    return { committedTo: erro.currentMode, canStart: false, reason: erro.message };
  }
}

/**
 * Trocar de modo com investigação em curso descarta a anterior.
 *
 * Não existe "misturar depois": um universo de vídeo e um de artigo respondem
 * perguntas diferentes. A troca é permitida — e explícita.
 */
export function radarSearchModeChange(input: {
  current: RadarPrimarySearchMode;
  next: RadarPrimarySearchMode;
  hasInvestigation: boolean;
}): { allowed: boolean; requiresReset: boolean; message: string | null } {
  if (input.current === input.next) return { allowed: true, requiresReset: false, message: null };
  if (!input.hasInvestigation) return { allowed: true, requiresReset: false, message: null };
  return {
    allowed: true,
    requiresReset: true,
    message: `A investigação atual foi feita em ${radarSearchModeLabel(input.current)}. Trocar para ${radarSearchModeLabel(input.next)} descarta o resultado vigente e recomeça a pesquisa.`,
  };
}
