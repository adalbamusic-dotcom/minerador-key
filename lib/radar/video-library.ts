import type { RadarVideoSource } from "./video-source.ts";
import { radarVideoAcquisitionCapability, radarVideoTextCanRequest, type RadarVideoTextState } from "./video-text-acquisition.ts";

/**
 * A BIBLIOTECA DE FONTES DA MARCA — e o uso que cada artigo faz dela.
 *
 * TRÊS CAMADAS, e só a terceira é do artigo:
 *
 *   1. FONTE      pertence à marca. Uma URL, uma fonte.
 *   2. CONTEÚDO   transcript, idioma, tempos. Pertence à FONTE.
 *   3. USO        o artigo seleciona quais fontes participam do trabalho dele.
 *
 * O caso que motivou o desenho: 25 palestras do mesmo especialista, cada
 * artigo usando quatro delas. No modelo antigo a mesma palestra virava uma
 * fonte por artigo — e seria transcrita uma vez por artigo.
 *
 * CONSEQUÊNCIA QUE IMPORTA: transcrição pronta é reusada. Um segundo artigo
 * que selecione a mesma fonte não paga Speech de novo.
 *
 * Domínio puro: sem fetch, sem provider, sem storage.
 */

/** Uma fonte da biblioteca, com o que o artigo corrente sabe sobre ela. */
export type RadarLibrarySource = RadarVideoSource & {
  /** O artigo corrente selecionou esta fonte? */
  selectedForArticle: boolean;
  /** Em quantos artigos ela está ativa. Zero é resposta legítima. */
  articleUsageCount: number;
  /*
   * 2026-10-02 · O MODO DE USO NESTE ARTIGO (SDD diretriz editorial, Adendo B, D6).
   *
   * OPCIONAIS de propósito, e fora de `RadarVideoSourceSchema` (que é .strict()):
   * a chave AUSENTE diz "o servidor não leu o modo" (coluna inexistente ou
   * leitura falha) e a tela não oferece o seletor; `null` diz "lido, sem modo".
   * Só existem em fonte SELECIONADA pelo artigo corrente.
   */
  articleUsage?: RadarVideoUsage | null;
  articleUsageNote?: string | null;
};

/* ================== o modo de uso do vídeo no artigo ================== */

/**
 * COMO O ARTIGO USA CADA VÍDEO SELECIONADO — Adendo B (D6), 2026-10-02.
 *
 * Como no Especialista, a escolha é do DONO: a plataforma sugere a partir do
 * casamento, mas nunca grava a sugestão (AGENTS §9). A ordem é a do contrato
 * do banco (`radar_article_video_sources_usage_check`).
 */
export const RADAR_VIDEO_USAGES = ["CONTEXT", "TOPIC_SUGGESTION", "SUPPORT", "QUOTE", "EMBED", "NOT_USED"] as const;
export type RadarVideoUsage = typeof RADAR_VIDEO_USAGES[number];

export const RADAR_VIDEO_USAGE_LABEL: Record<RadarVideoUsage, string> = {
  CONTEXT: "Contexto",
  TOPIC_SUGGESTION: "Sugestão de pauta",
  SUPPORT: "Apoio",
  QUOTE: "Citação",
  EMBED: "Incorporar no artigo",
  NOT_USED: "Não usar",
};

/*
 * O RÓTULO DO BOTÃO É UM VERBO — pedido do dono, 2026-10-02: "coloca igual que
 * no Especialista" ("Aceitar como evidência", "Usar como apoio"…). O substantivo
 * acima continua sendo o nome do modo no selo e nos CSVs.
 */
export const RADAR_VIDEO_USAGE_ACTION_LABEL: Record<RadarVideoUsage, string> = {
  CONTEXT: "Usar como contexto",
  TOPIC_SUGGESTION: "Sugerir como pauta",
  SUPPORT: "Usar como apoio",
  QUOTE: "Marcar citação",
  EMBED: "Incorporar no artigo",
  NOT_USED: "Não usar",
};

/** O que cada modo pede a quem escreve. Uma frase só, lida pela tela e pelos CSVs. */
export const RADAR_VIDEO_USAGE_HINT: Record<RadarVideoUsage, string> = {
  CONTEXT: "ler para entender o assunto, não citar",
  TOPIC_SUGGESTION: "ideia de seção ou pergunta a validar",
  SUPPORT: "trecho com tempo sustenta um ponto do texto, atribuído ao vídeo",
  QUOTE: "fala literal entre aspas, atribuída ao vídeo, com o tempo",
  EMBED: "o vídeo entra incorporado no artigo, na seção indicada",
  NOT_USED: "não entra no artigo",
};

/** O mesmo teto da coluna `usage_note` (CHECK de 2000 caracteres). */
export const RADAR_VIDEO_USAGE_NOTE_MAX = 2000;

/** O valor do banco, conferido: o que não é um dos seis modos vale como "sem modo". */
export function radarVideoUsageOf(valor: unknown): RadarVideoUsage | null {
  return typeof valor === "string" && (RADAR_VIDEO_USAGES as readonly string[]).includes(valor) ? valor as RadarVideoUsage : null;
}

/**
 * O MODO POR CIMA DA SELEÇÃO — 2026-10-02.
 *
 * Envolve o resultado de `overlayRadarArticleSelection` em vez de mudá-lo: a
 * sobreposição continua uma decisão só, e o modo é outra camada, do mesmo
 * artigo. `usages` NULO é leitura indisponível (coluna ainda inexistente ou
 * consulta recusada): a lista sai exatamente como antes, sem as chaves novas,
 * e a aba segue funcionando sem modos.
 *
 * Só a fonte SELECIONADA pelo artigo corrente recebe o modo. Sem artigo não há
 * uso a declarar — o mesmo raciocínio do checkbox.
 */
export function withRadarArticleUsage<T extends { id: string; selectedForArticle: boolean }>(
  sources: readonly T[],
  usages: ReadonlyMap<string, { usage: RadarVideoUsage | null; note: string | null }> | null,
  articleId: string | null,
): Array<T & { articleUsage?: RadarVideoUsage | null; articleUsageNote?: string | null }> {
  if (!usages || !articleId) return [...sources];
  return sources.map(fonte => {
    if (!fonte.selectedForArticle) return fonte;
    const modo = usages.get(fonte.id) || null;
    return { ...fonte, articleUsage: modo?.usage ?? null, articleUsageNote: modo?.note ?? null };
  });
}

/**
 * A SUGESTÃO DO CASAMENTO — derivada, NUNCA gravada (AGENTS §9).
 *
 * "Casar pautas" passa a preencher o modo SUGERIDO; quem confirma ou troca é o
 * dono. A regra é curta de propósito, para não fingir mais do que o casamento
 * sabe:
 *
 *   - a fonte sustentou trecho de alguma pauta → Apoio (o trecho tem tempo);
 *   - o casamento rodou, a fonte tem texto e nenhum trecho dela serviu →
 *     Contexto (ler para entender, sem citar);
 *   - sem casamento, sem seleção ou sem texto → nenhuma sugestão.
 *
 * Citação, Incorporar e Não usar são julgamentos editoriais que o casamento
 * não tem como fazer, e por isso nunca são sugeridos.
 */
export function suggestRadarVideoUsage(input: {
  source: { id: string; selectedForArticle: boolean; textState: string };
  coverage: ReadonlyArray<{ extracts: ReadonlyArray<{ videoSourceId: string }> }> | null;
}): RadarVideoUsage | null {
  if (!input.coverage || !input.source.selectedForArticle) return null;
  if (input.coverage.some(pauta => pauta.extracts.some(trecho => trecho.videoSourceId === input.source.id))) return "SUPPORT";
  return input.source.textState === "TEXT_READY" ? "CONTEXT" : null;
}

/**
 * A CAMADA DO ARTIGO POR CIMA DA BIBLIOTECA — §2.3.2.
 *
 * A biblioteca vem da MARCA. O artigo, quando existe, acrescenta uma única
 * informação: quais daquelas fontes ele declarou usar.
 *
 * `articleId` NULO É RESPOSTA LEGÍTIMA, não um parâmetro faltando: é a
 * biblioteca sendo lida por quem não abriu artigo nenhum. Nesse caso nada está
 * selecionado — e tratar "sem artigo" como "tudo selecionado" mostraria uso que
 * ninguém declarou.
 *
 * `articleUsageCount` conta TODOS os artigos, sempre: essa informação é da
 * fonte, e é ela que protege uma fonte usada alhures na hora de arquivar.
 *
 * Estava duplicada em duas rotas, sem teste. Aqui ela é uma decisão só.
 */
export function overlayRadarArticleSelection<T extends { id: string }>(input: {
  sources: readonly T[];
  /** Vínculos ATIVOS da marca inteira, de todos os artigos. */
  links: ReadonlyArray<{ articleId: string; videoSourceId: string }>;
  articleId: string | null;
}): Array<T & { selectedForArticle: boolean; articleUsageCount: number }> {
  const doArtigo = new Set(
    input.articleId
      ? input.links.filter(item => item.articleId === input.articleId).map(item => item.videoSourceId)
      : [],
  );
  const usos = new Map<string, number>();
  for (const item of input.links) usos.set(item.videoSourceId, (usos.get(item.videoSourceId) || 0) + 1);

  return input.sources.map(fonte => ({
    ...fonte,
    selectedForArticle: doArtigo.has(fonte.id),
    articleUsageCount: usos.get(fonte.id) || 0,
  }));
}

/* ================== o que a tela sabe sobre a leitura ================== */

export const RADAR_VIDEO_LIBRARY_READ_STATES = ["NOT_READ", "LOADING", "READ_OK", "READ_FAILED"] as const;
export type RadarVideoLibraryReadState = typeof RADAR_VIDEO_LIBRARY_READ_STATES[number];

export type RadarVideoLibraryReading = {
  state: RadarVideoLibraryReadState;
  /** A primeira linha: o acervo, ou por que ele não é conhecido. */
  headline: string;
  /** A segunda: o detalhe operacional, quando existe. */
  detail: string;
  tone: "neutral" | "pending" | "success" | "warning";
  counts: {
    total: number;
    live: number;
    textReady: number;
    processing: number;
    archived: number;
    /** `null` sem artigo: não existe seleção a contar, e zero seria mentira. */
    selectedForArticle: number | null;
  };
};

/**
 * LISTA VAZIA NÃO É A MESMA COISA QUE LEITURA FALHA — §2.3.3.
 *
 * Com o SELECT quebrado a tela dizia "Nenhuma fonte na biblioteca da marca".
 * Era falso: ninguém sabia quantas fontes existiam. A afirmação vinha de
 * `sources.length === 0`, e um array vazio é o que sobra tanto de um acervo
 * vazio quanto de uma consulta que nunca voltou.
 *
 * Aqui as duas coisas são estados diferentes, e a diferença é dita. Uma
 * projeção só, consumida pelo card do topo e pelo painel — duas projeções
 * divergiriam, como já divergiram na coluna do Especialista.
 */
export function summarizeRadarVideoLibrary(input: {
  sources: readonly RadarLibrarySource[];
  articleId: string | null;
  loading?: boolean;
  error?: string | null;
  /** `true` só depois de uma leitura remota confirmada. */
  readbackConfirmed?: boolean;
}): RadarVideoLibraryReading {
  const vivas = input.sources.filter(item => item.registrationStatus !== "ARCHIVED");
  const textReady = vivas.filter(item => item.textState === "TEXT_READY").length;
  const processing = vivas.filter(item => EM_PROCESSAMENTO.includes(item.textState)).length;
  const counts = {
    total: input.sources.length,
    live: vivas.length,
    textReady,
    processing,
    archived: input.sources.length - vivas.length,
    selectedForArticle: input.articleId ? vivas.filter(item => item.selectedForArticle).length : null,
  };

  /*
   * A ORDEM DAS PERGUNTAS IMPORTA. O erro vem primeiro: uma leitura que falhou
   * depois de uma boa ainda tem fontes em memória, e mostrá-las como se
   * estivessem atuais esconderia que a tela está defasada.
   */
  if (input.error) {
    return {
      state: "READ_FAILED",
      headline: "Não foi possível carregar a biblioteca",
      detail: input.error,
      tone: "warning",
      counts,
    };
  }
  if (input.loading) {
    return { state: "LOADING", headline: "Lendo a biblioteca…", detail: "", tone: "pending", counts };
  }
  if (!input.readbackConfirmed) {
    return {
      state: "NOT_READ",
      headline: "Biblioteca ainda não lida",
      detail: "A leitura remota ainda não foi confirmada.",
      tone: "pending",
      counts,
    };
  }

  /*
   * O `headline` conta as VIVAS: arquivar tira da biblioteca por padrão. Mas a
   * arquivada não some — ela continua alcançável pelo filtro, e some do texto
   * seria esconder acervo de quem opera.
   */
  const detalhe = [
    textReady ? `${textReady} com texto pronto` : null,
    processing ? `${processing} em processamento` : null,
    counts.archived ? `${counts.archived} arquivada(s)` : null,
    counts.selectedForArticle === null ? null : `${counts.selectedForArticle} selecionada(s) para este artigo`,
  ].filter(Boolean).join(" · ");

  return {
    state: "READ_OK",
    headline: vivas.length ? `${vivas.length} fonte(s) na biblioteca da marca` : "Nenhuma fonte na biblioteca da marca",
    detail: detalhe,
    tone: !vivas.length ? "neutral" : textReady === vivas.length ? "success" : "pending",
    counts,
  };
}

export const RADAR_VIDEO_LIBRARY_FILTERS = [
  "ALL",
  "SELECTED_FOR_ARTICLE",
  "TEXT_READY",
  "NOT_PROCESSED",
  "PROCESSING",
  "ARCHIVED",
] as const;
export type RadarVideoLibraryFilter = typeof RADAR_VIDEO_LIBRARY_FILTERS[number];

export const RADAR_VIDEO_LIBRARY_FILTER_LABEL: Record<RadarVideoLibraryFilter, string> = {
  ALL: "Todas",
  SELECTED_FOR_ARTICLE: "Selecionadas para este artigo",
  TEXT_READY: "Texto pronto",
  NOT_PROCESSED: "Não processadas",
  PROCESSING: "Em processamento",
  ARCHIVED: "Arquivadas",
};

const EM_PROCESSAMENTO: RadarVideoTextState[] = ["QUEUED", "PROCESSING"];

/**
 * O FILTRO ESCONDE ARQUIVADAS POR PADRÃO — e só por padrão.
 *
 * Arquivar tira da vista, não do banco: a fonte continua resolvível para
 * qualquer evidência congelada que a cite. O filtro `ARCHIVED` existe
 * justamente para que ela permaneça alcançável por quem procurar.
 */
export function filterRadarVideoLibrary(
  sources: readonly RadarLibrarySource[],
  filter: RadarVideoLibraryFilter,
): RadarLibrarySource[] {
  if (filter === "ARCHIVED") return sources.filter(item => item.registrationStatus === "ARCHIVED");

  const vivas = sources.filter(item => item.registrationStatus !== "ARCHIVED");
  if (filter === "SELECTED_FOR_ARTICLE") return vivas.filter(item => item.selectedForArticle);
  if (filter === "TEXT_READY") return vivas.filter(item => item.textState === "TEXT_READY");
  if (filter === "PROCESSING") return vivas.filter(item => EM_PROCESSAMENTO.includes(item.textState));
  if (filter === "NOT_PROCESSED") {
    return vivas.filter(item => item.textState !== "TEXT_READY" && !EM_PROCESSAMENTO.includes(item.textState));
  }
  return vivas;
}

/* ==================== processar as selecionadas ======================== */

export const RADAR_VIDEO_PROCESS_OUTCOMES = [
  /** Já tem texto: o artigo usa o que existe, sem pagar Speech de novo. */
  "REUSED_TEXT",
  /** Já está na fila ou processando: o job existente serve. */
  "REUSED_JOB",
  "ENQUEUED",
  /** Sem via autorizada de aquisição. Não é falha, e não vira job. */
  "UNAVAILABLE",
  /** Falhou em definitivo: repetir exige decisão humana explícita. */
  "BLOCKED_BY_FAILURE",
] as const;
export type RadarVideoProcessOutcome = typeof RADAR_VIDEO_PROCESS_OUTCOMES[number];

export type RadarVideoProcessDecision = {
  videoSourceId: string;
  outcome: RadarVideoProcessOutcome;
  reason: string;
};

/**
 * "PROCESSAR SELECIONADOS" NÃO SIGNIFICA CHAMAR O SPEECH PARA TODAS.
 *
 * Significa garantir que as fontes escolhidas estejam prontas para este
 * artigo. Uma fonte já transcrita é reusada; uma que já está na fila não gera
 * segundo job; e uma sem via de aquisição é declarada, não tentada.
 *
 * Decisão pura: esta função não enfileira nada. Ela diz o que fazer, e quem
 * chama executa — o que torna a política conferível sem tocar em banco.
 */
export function decideRadarVideoProcessing(input: {
  /** Somente as fontes que o artigo selecionou. As demais não participam. */
  selected: readonly RadarLibrarySource[];
}): RadarVideoProcessDecision[] {
  return input.selected.map(fonte => {
    if (fonte.textState === "TEXT_READY") {
      return { videoSourceId: fonte.id, outcome: "REUSED_TEXT" as const, reason: "O texto desta fonte já existe e é reutilizado por este artigo." };
    }
    if (EM_PROCESSAMENTO.includes(fonte.textState)) {
      return { videoSourceId: fonte.id, outcome: "REUSED_JOB" as const, reason: "Já existe uma extração em andamento para esta fonte." };
    }
    if (fonte.textState === "FAILED_FINAL") {
      return { videoSourceId: fonte.id, outcome: "BLOCKED_BY_FAILURE" as const, reason: "A extração falhou em definitivo; repetir exige decisão humana explícita." };
    }

    const capacidade = radarVideoAcquisitionCapability({
      kind: fonte.sourceKind,
      hasUploadedMedia: Boolean(fonte.uploadedMediaUri),
    });
    const pedido = radarVideoTextCanRequest({ state: fonte.textState, capability: capacidade });
    if (!pedido.allowed) {
      return { videoSourceId: fonte.id, outcome: "UNAVAILABLE" as const, reason: pedido.reason };
    }
    return { videoSourceId: fonte.id, outcome: "ENQUEUED" as const, reason: "Extração enfileirada para esta fonte." };
  });
}

/* ======================= arquivar e limpar lista ======================= */

export const RADAR_VIDEO_ARCHIVE_OUTCOMES = ["ARCHIVED", "KEPT_IN_USE", "KEPT_FROZEN", "ALREADY_ARCHIVED"] as const;
export type RadarVideoArchiveOutcome = typeof RADAR_VIDEO_ARCHIVE_OUTCOMES[number];

export type RadarVideoArchiveDecision = {
  videoSourceId: string;
  outcome: RadarVideoArchiveOutcome;
  reason: string;
};

/**
 * "LIMPAR LISTA" NÃO DESTRÓI EVIDÊNCIA — §15.
 *
 * Arquivar é tirar da vista; apagar é quebrar histórico. Uma fonte citada por
 * um bundle congelado precisa continuar resolvível, senão o congelamento
 * deixaria de provar o que provava.
 *
 * A recusa é POR ITEM e com motivo: "limpei tudo menos três, e por estes
 * motivos" é uma resposta; "não foi possível limpar" não é.
 */
export function decideRadarVideoArchive(input: {
  sources: readonly RadarLibrarySource[];
  /** Artigo corrente, quando a operação parte de dentro dele. */
  currentArticleId?: string | null;
  /** Fontes citadas por evidência congelada. Nunca somem. */
  frozenSourceIds?: readonly string[];
  /**
   * `true` quando o pedido é da lista inteira. Aí o uso em OUTRO artigo
   * protege a fonte; num pedido item a item, quem opera já está declarando
   * que quer arquivar aquela fonte.
   */
  clearList?: boolean;
}): RadarVideoArchiveDecision[] {
  const congeladas = new Set(input.frozenSourceIds || []);

  return input.sources.map(fonte => {
    if (fonte.registrationStatus === "ARCHIVED") {
      return { videoSourceId: fonte.id, outcome: "ALREADY_ARCHIVED" as const, reason: "Esta fonte já estava arquivada." };
    }
    if (congeladas.has(fonte.id)) {
      return { videoSourceId: fonte.id, outcome: "KEPT_FROZEN" as const, reason: "Esta fonte sustenta evidência congelada e permanece na biblioteca." };
    }

    /*
     * USO EM OUTRO ARTIGO PROTEGE A FONTE numa limpeza de lista.
     *
     * Quem limpa a lista está falando do trabalho atual; arquivar por tabela
     * rasa levaria junto a fonte que outro artigo usa hoje.
     */
    const usoEmOutros = fonte.articleUsageCount - (fonte.selectedForArticle ? 1 : 0);
    if (input.clearList && usoEmOutros > 0) {
      return {
        videoSourceId: fonte.id,
        outcome: "KEPT_IN_USE" as const,
        reason: `Esta fonte é usada por ${usoEmOutros} outro(s) artigo(s) e permanece na biblioteca.`,
      };
    }

    return { videoSourceId: fonte.id, outcome: "ARCHIVED" as const, reason: "Arquivada: sai da biblioteca por padrão e continua resolvível." };
  });
}

/** O resumo que a tela mostra depois de uma ação em lote. */
export function summarizeRadarVideoArchive(decisions: readonly RadarVideoArchiveDecision[]) {
  const conta = (outcome: RadarVideoArchiveOutcome) => decisions.filter(item => item.outcome === outcome).length;
  return {
    archived: conta("ARCHIVED"),
    keptInUse: conta("KEPT_IN_USE"),
    keptFrozen: conta("KEPT_FROZEN"),
    alreadyArchived: conta("ALREADY_ARCHIVED"),
    total: decisions.length,
  };
}
