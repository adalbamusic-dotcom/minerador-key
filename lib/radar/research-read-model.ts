/**
 * ===== O READ MODEL DA PESQUISA — RADAR_FINAL_2.1 · §2 a §6 =====
 *
 * ================== DISCLOSURE FECHADO NÃO É LAZY LOADING ==================
 *
 * A amostra competitiva já vinha recolhida na tela. Mas os 129,7 KB de
 * `amazonSearch` chegavam no payload inicial de qualquer jeito — o clique só
 * decidia se eles seriam PINTADOS, não se seriam transportados.
 *
 * Aqui a matéria-prima sai da cópia de leitura e vira uma referência com
 * contagem. O conteúdo é buscado quando alguém abre o disclosure.
 *
 * ==================== SOMENTE O QUE ESTÁ CONGELADO ====================
 *
 * A compactação vale para investigação FINALIZED, e a razão é de produto, não
 * de performance: antes do freeze o universo É a superfície de trabalho — é
 * nele que a curadoria do YouTube acontece, e ele está aberto por construção.
 * Tirá-lo dali quebraria a curadoria para economizar bytes que a pessoa está
 * olhando.
 *
 * Depois do freeze a amostra é consulta: recolhida, e a fotografia responde
 * sozinha pelo que a tela mostra.
 *
 * ==================== UMA AUTORIDADE, TRÊS PERFIS — §6 ====================
 *
 * Não existem `google-sample`, `youtube-sample` e `amazon-sample`. Três
 * endpoints para a mesma pergunta divergiriam na primeira correção feita só
 * num deles.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { RadarResearchProfile } from "./research-profile.ts";
import { radarNormalizedUrl } from "./research-reference.ts";

const objeto = (valor: unknown): Record<string, unknown> | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;

const lista = (valor: unknown): unknown[] => Array.isArray(valor) ? valor : [];

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor.trim() : null;

/* ============================ o que a tela pede ============================ */

/** §4 e §5 · as duas partes que a tela busca sob demanda. */
export const RADAR_RESEARCH_LAZY_PARTS = ["sample", "provenance"] as const;
export type RadarResearchLazyPart = typeof RADAR_RESEARCH_LAZY_PARTS[number];

/**
 * §3 · O RESUMO QUE SUBSTITUI O CONTEÚDO NO PAYLOAD INICIAL.
 *
 * `count` é o que o rótulo do disclosure precisa — "Ver amostra competitiva ·
 * 51 produtos" — e `available` distingue "não há amostra" de "a amostra está
 * lá e ainda não foi buscada". Sem essa distinção a tela mostraria o mesmo
 * vazio nos dois casos.
 */
export type RadarResearchSampleSummary = {
  count: number;
  available: boolean;
  unit: "página(s)" | "vídeo(s)" | "produto(s)";
};

export type RadarResearchProvenanceSummary = { available: boolean };

const UNIDADE: Record<RadarResearchProfile, RadarResearchSampleSummary["unit"]> = {
  GOOGLE: "página(s)",
  YOUTUBE: "vídeo(s)",
  AMAZON: "produto(s)",
};

/* ========================= a compactação da leitura ========================= */

/** As corridas que carregam matéria-prima de amostra. */
const CORRIDAS = ["amazonSearch", "youtubeSearch"] as const;

/**
 * ============ RADAR_FINAL_2.3 · A AMOSTRA DO GOOGLE ============
 *
 * Ela não é uma "corrida": é uma lista de páginas extraídas, e ela vira `[]`
 * em vez de `null` porque o schema a declara como array.
 *
 * Ela só pôde entrar aqui depois de a escrita competitiva do Google ganhar
 * fronteira no FINALIZE. Antes disso, compactá-la faria a curadoria e a
 * extração gravarem sobre uma lista vazia — alto, graças à trava do 2.1, mas
 * quebrado.
 */
const LISTAS_DE_AMOSTRA = ["extractions"] as const;

/**
 * A investigação deste perfil está congelada?
 *
 * É a fotografia que autoriza a compactação: ela carrega as contagens por
 * referência, e é ela que sustenta cabeçalho, cards e Blueprint sem o universo
 * ao lado (§7).
 */
export function radarResearchIsFrozen(payload: unknown): boolean {
  const analise = objeto(payload);
  if (!analise) return false;
  return Boolean(
    objeto(analise.amazonFrozenInvestigation)
    || objeto(analise.youtubeFrozenInvestigation)
    || objeto(analise.finalizedBundle),
  );
}

/**
 * ============ §2 · A CÓPIA DE LEITURA, SEM A MATÉRIA-PRIMA ============
 *
 * Devolve uma CÓPIA marcada como `COMPACT`. O marcador não é decoração: uma
 * cópia compacta tem exatamente a forma de uma investigação sem coleta, e sem
 * ele uma gravação a sucederia apagando a coleta paga do banco.
 *
 * Quando não há o que compactar — investigação viva, ou sem corrida — devolve o
 * payload ORIGINAL, e `FULL` continua valendo. Marcar `COMPACT` sem ter tirado
 * nada travaria escritas legítimas.
 */
export function compactRadarResearchForRead<T extends Record<string, unknown>>(payload: T): T {
  if (!radarResearchIsFrozen(payload)) return payload;

  const temCorrida = CORRIDAS.some(campo => objeto(payload[campo]));
  const temAmostra = LISTAS_DE_AMOSTRA.some(campo => lista(payload[campo]).length > 0);
  if (!temCorrida && !temAmostra) return payload;

  const compacto: Record<string, unknown> = { ...payload, researchTransport: "COMPACT" };
  for (const campo of CORRIDAS) {
    if (objeto(payload[campo])) compacto[campo] = null;
  }
  for (const campo of LISTAS_DE_AMOSTRA) {
    if (lista(payload[campo]).length > 0) compacto[campo] = [];
  }
  return compacto as T;
}

/* ============================== os resumos ============================== */

/**
 * A CONTAGEM VEM DA FOTOGRAFIA, não da corrida.
 *
 * É para isso que o freeze guarda `runRef` e `observedSummary`: a tela diz "51
 * produtos" sem reabrir 51 produtos. Contar a corrida aqui faria a compactação
 * perder justamente o número que ela precisa mostrar.
 */
export function radarResearchSampleSummary(input: {
  payload: unknown;
  profile: RadarResearchProfile;
}): RadarResearchSampleSummary {
  const analise = objeto(input.payload);
  const unit = UNIDADE[input.profile];
  if (!analise) return { count: 0, available: false, unit };

  if (input.profile === "AMAZON") {
    const congelada = objeto(analise.amazonFrozenInvestigation);
    const resumo = congelada ? objeto(congelada.observedSummary) : null;
    const referencia = congelada ? objeto(congelada.runRef) : null;
    const corrida = objeto(analise.amazonSearch);
    const count = Number(resumo?.products ?? referencia?.universeSize) || lista(corrida?.universe).length;
    return { count, available: count > 0, unit };
  }

  if (input.profile === "YOUTUBE") {
    const congelada = objeto(analise.youtubeFrozenInvestigation);
    const referencia = congelada ? objeto(congelada.runRef) : null;
    const corrida = objeto(analise.youtubeSearch);
    const count = Number(referencia?.universeSize) || lista(corrida?.universe).length;
    return { count, available: count > 0, unit };
  }

  /*
   * §11 · A FOTOGRAFIA MANDA, COMO NOS OUTROS DOIS PERFIS.
   *
   * `finalizedBundle.sample.extractionIds` é a amostra CONGELADA. Contar as
   * extrações correntes diria "18" sobre uma fotografia de 8 — e o rótulo
   * descreveria uma amostra que a fotografia não tem.
   */
  const congelado = objeto(analise.finalizedBundle);
  const amostraCongelada = congelado ? objeto(congelado.sample) : null;
  if (amostraCongelada) {
    const count = lista(amostraCongelada.extractionIds).length;
    return { count, available: count > 0, unit };
  }

  const observado = objeto(objeto(analise.deepResearch)?.observed);
  const amostra = observado ? objeto(observado.sample) : null;
  const count = Number(amostra?.comparablePages) || 0;
  return { count, available: count > 0, unit };
}

/**
 * ===== 2.1 · §9 e §10 · A COLETA PRINCIPAL, PELA MESMA AUTORIDADE =====
 *
 * ==================== A CONTRADIÇÃO QUE ISTO FECHA ====================
 *
 * A MESMA investigação dizia, na mesma tela:
 *
 *   YouTube · 3 consultas · 38 vídeos · Finalizado
 *   SERP do YouTube ................................ não coletada
 *
 * As duas leituras estavam certas sobre fontes diferentes. O cabeçalho lia a
 * FOTOGRAFIA; o pacote lia `analysis.youtubeSearch` — e `compactRadarResearchForRead`
 * zera esse campo assim que a investigação congela, justamente porque a
 * fotografia já guarda as contagens. O pacote leu a ausência do transporte como
 * ausência de coleta.
 *
 * ==================== FROZEN > LIVE > TRANSPORTE ====================
 *
 * É a mesma ordem que o 1.3 estabeleceu para o Google, aplicada aqui. Compactar
 * é decisão de TRANSPORTE: ela não pode mudar o que a investigação significa.
 *
 * A fotografia responde mesmo com a corrida ao lado — não por desempenho, mas
 * porque depois do freeze é ela que vale: a corrida viva pode ser sucedida por
 * outra coleta, e a fotografia não muda.
 */
export type RadarResearchPrimaryCollection = {
  collected: boolean;
  running: boolean;
  failed: boolean;
  queryCount: number;
  resultCount: number;
  /** De onde esta leitura veio. `NONE` quando não há coleta alguma. */
  authority: "FROZEN" | "RUN" | "NONE";
};

export function radarResearchPrimaryCollection(input: {
  payload: unknown;
  profile: RadarResearchProfile;
}): RadarResearchPrimaryCollection {
  const vazio: RadarResearchPrimaryCollection = {
    collected: false, running: false, failed: false, queryCount: 0, resultCount: 0, authority: "NONE",
  };

  const analise = objeto(input.payload);
  if (!analise || input.profile === "GOOGLE") return vazio;

  const congelada = objeto(input.profile === "AMAZON"
    ? analise.amazonFrozenInvestigation
    : analise.youtubeFrozenInvestigation);
  const referencia = congelada ? objeto(congelada.runRef) : null;

  if (referencia) {
    /*
     * A FOTOGRAFIA MANDA, e `runRef` existe exatamente para isto: quatro
     * números que dizem "3 consultas · 38 vídeos" sem reabrir a corrida.
     */
    return {
      collected: true,
      running: false,
      failed: false,
      queryCount: Number(referencia.queriesExecuted) || 0,
      resultCount: Number(referencia.universeSize) || 0,
      authority: "FROZEN",
    };
  }

  /*
   * FOTOGRAFIA LEGADA — a corrida inteira copiada, sem `runRef`.
   *
   * Congelamentos anteriores ao gate que criou a referência guardam `run` aqui.
   * Ler `collected: false` sobre eles diria "não coletada" a uma investigação
   * congelada, que é o mesmo defeito em outra época.
   */
  const corridaCongelada = congelada ? objeto(congelada.run) : null;
  if (corridaCongelada) {
    return {
      collected: true,
      running: false,
      failed: false,
      queryCount: lista(corridaCongelada.queries).filter(item => objeto(item)?.executed === true).length,
      resultCount: lista(corridaCongelada.universe).length,
      authority: "FROZEN",
    };
  }

  const corrida = objeto(input.profile === "AMAZON" ? analise.amazonSearch : analise.youtubeSearch);
  if (!corrida) return vazio;

  const estado = texto(corrida.state);
  return {
    collected: estado === "COLLECTED",
    running: estado === "COLLECTING",
    failed: estado === "COLLECTION_FAILED",
    queryCount: lista(corrida.queries).filter(item => objeto(item)?.executed === true).length,
    resultCount: lista(corrida.universe).length,
    authority: "RUN",
  };
}

export function radarResearchProvenanceSummary(payload: unknown): RadarResearchProvenanceSummary {
  const analise = objeto(payload);
  if (!analise) return { available: false };
  return {
    available: Boolean(
      objeto(analise.amazonSearch) || objeto(analise.youtubeSearch)
      || objeto(analise.amazonFrozenInvestigation) || objeto(analise.youtubeFrozenInvestigation)
      || texto(analise.serpSnapshotId)
      /*
       * §5 · O GOOGLE TAMBÉM TEM O QUE CONFERIR.
       *
       * O registro da investigação e o bundle identificam a rodada mesmo num
       * artigo sem snapshot canônico gravado — e sem isto o disclosure do
       * Google simplesmente não apareceria nesse caso.
       */
      || objeto(analise.deepResearch) || objeto(analise.finalizedBundle),
    ),
  };
}

/* ====================== as partes buscadas sob demanda ====================== */

export type RadarResearchSamplePayload = {
  profile: RadarResearchProfile;
  /** A corrida do perfil, INTEIRA — é ela que a amostra renderiza. */
  run: unknown;
  /** §10 · as páginas congeladas do Google. Vazio nos outros dois perfis. */
  pages: unknown[];
  count: number;
  /**
   * §12 · A INTEGRIDADE DA REFERÊNCIA CONGELADA.
   *
   * `null` quando fecha. Quando um id congelado não resolve, a amostra NÃO é
   * completada com outra página: a fotografia não pode mudar de significado
   * em silêncio.
   */
  integrity: { code: "FROZEN_SAMPLE_REFERENCE_MISSING"; missingIds: string[]; message: string } | null;
};

/**
 * §4 · A AMOSTRA, LIDA DO QUE JÁ ESTÁ GRAVADO.
 *
 * Nenhum provider é tocado: a corrida foi paga uma vez e vive na versão
 * corrente. Abrir o disclosure é uma ida ao BANCO, e só.
 */
export function radarResearchSampleOfAnalysis(input: {
  payload: unknown;
  profile: RadarResearchProfile;
}): RadarResearchSamplePayload {
  const analise = objeto(input.payload);
  const run = input.profile === "AMAZON"
    ? analise?.amazonSearch ?? null
    : input.profile === "YOUTUBE"
      ? analise?.youtubeSearch ?? null
      : null;

  const count = radarResearchSampleSummary({ payload: input.payload, profile: input.profile }).count;
  if (input.profile !== "GOOGLE") {
    return { profile: input.profile, run: run ?? null, pages: [], count, integrity: null };
  }

  /*
   * ============ §10 e §11 · A AMOSTRA DO GOOGLE SAI DOS IDS CONGELADOS ============
   *
   * `payload.extractions` pode ter 18 páginas hoje enquanto a fotografia
   * congelou 8. Devolver as correntes mostraria uma amostra que a fotografia
   * não tem — e quem lesse acharia que a investigação assinada cobria mais do
   * que cobriu.
   */
  const congelado = objeto(analise?.finalizedBundle);
  const amostraCongelada = congelado ? objeto(congelado.sample) : null;
  const extracoes = lista(analise?.extractions).map(item => objeto(item)).filter((item): item is Record<string, unknown> => item !== null);

  if (!amostraCongelada) {
    /* Sem fotografia, a amostra é a corrente — é a investigação viva. */
    return { profile: "GOOGLE", run: null, pages: extracoes, count, integrity: null };
  }

  const idsCongelados = lista(amostraCongelada.extractionIds)
    .map(item => texto(item))
    .filter((item): item is string => item !== null);

  /*
   * ============ 2.4 · A REFERÊNCIA CONGELADA É UMA URL ============
   *
   * `freezeRadarEvidenceBundle` grava `observed.competitors[].url` em
   * `extractionIds` — URLs, não `page.id`, que em runtime é
   * `competitor:<base64url>`. Procurar só por `id` não achava NENHUMA página de
   * uma investigação real: as oito congeladas voltavam todas como ausentes, e o
   * aviso de integridade dispararia em todo artigo Google finalizado.
   *
   * A resolução é por URL NORMALIZADA — a mesma chave com que o modelo
   * observado casa referência e extração. O `id` continua aceito para
   * fotografias que o tenham gravado: aceitar as duas identidades da MESMA
   * página é identidade, não substituição.
   */
  const porChave = new Map<string, Record<string, unknown>>();
  for (const item of extracoes) {
    const url = texto(item.url);
    if (url) porChave.set(radarNormalizedUrl(url), item);
    const id = texto(item.id);
    if (id) porChave.set(id, item);
  }
  const resolver = (referencia: string) => porChave.get(radarNormalizedUrl(referencia)) || porChave.get(referencia) || null;

  const pages = idsCongelados.map(resolver).filter((item): item is Record<string, unknown> => Boolean(item));
  const missingIds = idsCongelados.filter(id => !resolver(id));

  return {
    profile: "GOOGLE",
    run: null,
    pages,
    count: idsCongelados.length,
    /*
     * §12 · A FALTA É DITA, e a amostra não é completada por baixo.
     *
     * Substituir um id que não resolve por outra página faria a fotografia
     * descrever uma investigação diferente sem que nada avisasse.
     */
    integrity: missingIds.length
      ? {
        code: "FROZEN_SAMPLE_REFERENCE_MISSING" as const,
        missingIds,
        message: `${missingIds.length} página(s) da amostra congelada não foram encontradas na versão corrente.`,
      }
      : null,
  };
}

export type RadarResearchProvenancePayload = {
  profile: RadarResearchProfile;
  runId: string | null;
  runVersion: number | null;
  fingerprint: string | null;
  provider: string | null;
  endpoint: string | null;
  languageCode: string | null;
  collectedAt: string | null;
  frozenAt: string | null;
  supportSnapshotId: string | null;
  limitations: string[];
  /**
   * ===== RADAR_FINAL_2.4 · §5 · A IDENTIDADE DA FOTOGRAFIA =====
   *
   * Aditivos e genéricos: perfil sem bundle devolve `null` nos dois. Eles moram
   * aqui, e não no card visível, porque §5 é explícito — id técnico não fica
   * fora do disclosure. Quem opera não decide nada olhando para um hash.
   */
  frozenId: string | null;
  frozenHash: string | null;
};

/**
 * §5 · A PROVENIÊNCIA, TAMBÉM SOB DEMANDA.
 *
 * Ela existe para CONFERÊNCIA — quem opera não decide nada olhando para
 * `run-amz-1`. Transportá-la na primeira pintura é pagar rede por um dado que
 * quase ninguém abre.
 */
export function radarResearchProvenanceOfAnalysis(input: {
  payload: unknown;
  profile: RadarResearchProfile;
}): RadarResearchProvenancePayload {
  const analise = objeto(input.payload);

  /*
   * ============ RADAR_FINAL_2.4 · §5 · O GOOGLE TEM OUTRAS FONTES ============
   *
   * Amazon e YouTube guardam uma CORRIDA com proveniência dentro. O Google não:
   * a coleta dele é a SERP canônica do artigo, e o que a identifica está
   * espalhado em `serpSnapshotId`, no registro da investigação e no bundle.
   *
   * Ele entra aqui — e não num segundo módulo — porque §6 é explícito:
   * adaptação de perfil é permitida, autoridade paralela não. Sem este ramo, o
   * Google caía no ramo do YouTube e lia `youtubeSearch`, que num artigo de
   * Google é sempre nulo: a proveniência respondia vazia sem dizer por quê.
   */
  if (input.profile === "GOOGLE") {
    const registro = objeto(analise?.deepResearch);
    const congelado = objeto(analise?.finalizedBundle);
    const apoioGoogle = objeto(analise?.supportResearch);
    return {
      profile: "GOOGLE",
      /* A SERP canônica é o artefato endereçável da rodada do Google. */
      runId: texto(analise?.serpSnapshotId),
      runVersion: Number(analise?.serpSnapshotVersion) || null,
      fingerprint: texto(congelado?.foundationFingerprint) || texto(objeto(registro?.fingerprint)?.value),
      /* O payload da análise não grava provider nem endpoint do Google. Dizer
       * "dataforseo" aqui seria inventar: o campo fica nulo e a tela omite. */
      provider: null,
      endpoint: null,
      languageCode: null,
      collectedAt: texto(registro?.startedAt),
      frozenAt: texto(congelado?.frozenAt) || texto(registro?.finalizedAt),
      supportSnapshotId: texto(apoioGoogle?.snapshotId) || texto(apoioGoogle?.serpSnapshotId),
      limitations: lista(congelado?.limitations)
        .map(item => texto(item))
        .filter((item): item is string => item !== null),
      frozenId: texto(congelado?.bundleId),
      frozenHash: texto(congelado?.bundleHash),
    };
  }

  const corrida = objeto(input.profile === "AMAZON" ? analise?.amazonSearch : analise?.youtubeSearch);
  const congelada = objeto(input.profile === "AMAZON" ? analise?.amazonFrozenInvestigation : analise?.youtubeFrozenInvestigation);
  const referencia = congelada ? objeto(congelada.runRef) : null;
  const proveniencia = corrida ? objeto(corrida.provenance) : null;
  const apoio = objeto(lista(congelada?.supportRefs)[0]) || objeto(analise?.supportResearch);

  return {
    profile: input.profile,
    /* A referência da fotografia responde mesmo sem a corrida ao lado. */
    runId: texto(referencia?.runId) || texto(corrida?.runId),
    runVersion: Number(referencia?.runVersion ?? corrida?.runVersion) || null,
    fingerprint: texto(referencia?.runFingerprint) || texto(objeto(corrida?.fingerprint)?.signature),
    provider: texto(referencia?.provider) || texto(proveniencia?.provider),
    endpoint: texto(referencia?.endpoint) || texto(proveniencia?.endpoint),
    languageCode: texto(referencia?.languageCode) || texto(proveniencia?.languageCode),
    collectedAt: texto(referencia?.collectedAt) || texto(proveniencia?.collectedAt),
    frozenAt: texto(congelada?.finalizedAt),
    supportSnapshotId: texto(apoio?.snapshotId) || texto(apoio?.serpSnapshotId),
    limitations: lista(congelada?.limitations)
      .map(item => texto(item))
      .filter((item): item is string => item !== null),
    /* A fotografia destes dois perfis é a própria referência da corrida. */
    frozenId: texto(referencia?.runId),
    frozenHash: texto(referencia?.runFingerprint),
  };
}
