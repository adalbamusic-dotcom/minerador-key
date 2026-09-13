/**
 * O QUE SÓ O SERVIDOR PODE AFIRMAR.
 *
 * O smoke do 18.10 encontrou a tela dizendo, ao mesmo tempo:
 *
 *   "Pesquisa = Finalizado · Investigação congelada · bundle b619b587"
 *   "A investigação NÃO foi finalizada: a gravação remota não pôde ser
 *    confirmada por readback. Tente novamente."
 *
 * As duas frases eram produzidas pelo mesmo clique. O handler de finalização
 * estava correto — ele só declara sucesso com readback confirmado. Quem
 * mentiu foi a camada abaixo: o caminho de FALLBACK LOCAL de
 * `saveRadarAnalysis` aplicava a versão inteira ao workspace quando a escrita
 * remota falhava, e essa versão carregava o `finalizedBundle`. A tela lê o
 * bundle do estado local e renderiza "Finalizado".
 *
 * O F5 desmascarou: sem o bundle no banco, a investigação voltou a "Pronto".
 *
 * A DISTINÇÃO QUE FALTAVA.
 *
 * O fallback local existe para não perder TRABALHO — páginas lidas, decisões
 * de curadoria, texto digitado. Ele nunca deveria carregar AFIRMAÇÕES sobre o
 * estado remoto. Há uma diferença de natureza entre:
 *
 *   trabalho    o que a máquina produziu e pode ser regravado depois
 *   afirmação   o que declara que o servidor aceitou e guardou
 *
 * `finalizedBundle` diz "esta investigação está congelada no banco".
 * `analysisCompletedAt` diz "a gravação final da análise foi aceita" — é ele
 * que destrava o FINALIZE. Nenhum dos dois pode nascer de um fallback: eles
 * são exatamente o que o fallback está admitindo que não aconteceu.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

/** As afirmações que só existem com readback remoto confirmado. */
export const RADAR_REMOTE_ONLY_CLAIMS = ["analysisCompletedAt", "finalizedBundle"] as const;
export type RadarRemoteOnlyClaim = (typeof RADAR_REMOTE_ONLY_CLAIMS)[number];

export type RadarUnconfirmedPayload = {
  analysisCompletedAt?: string | null;
  finalizedBundle?: unknown;
};

export type RadarStrippedClaims<T> = {
  /** O payload sem as afirmações que o servidor não confirmou. */
  payload: T;
  /** O que foi removido. Vazio quando não havia afirmação alguma. */
  stripped: RadarRemoteOnlyClaim[];
};

/**
 * Devolve o payload SEM as afirmações de autoridade remota.
 *
 * O trabalho continua inteiro — `extractions`, `benchmark`, `competitiveReport`,
 * `verifiedSources`, `deepResearch`, decisões de curadoria. O que sai são os
 * dois campos que significam "o servidor aceitou".
 *
 * Devolver a lista do que saiu não é detalhe: é o que permite à tela dizer
 * QUAL etapa ficou por confirmar, em vez de mostrar um estado anterior sem
 * explicação.
 */
export function radarStripUnconfirmedClaims<T extends RadarUnconfirmedPayload>(payload: T): RadarStrippedClaims<T> {
  const stripped: RadarRemoteOnlyClaim[] = [];
  const resultado = { ...payload };

  if (resultado.analysisCompletedAt) {
    stripped.push("analysisCompletedAt");
    resultado.analysisCompletedAt = null;
  }
  if (resultado.finalizedBundle) {
    stripped.push("finalizedBundle");
    resultado.finalizedBundle = null;
  }

  return { payload: resultado, stripped };
}

/* ================= o estado do que ESTÁ no banco, agora ================= */

/**
 * O QUE A VERSÃO REMOTA REALMENTE ALCANÇOU.
 *
 * A auditoria do 18.10.1 encontrou a v24 assim:
 *
 *   extractions = 11 · deepResearch = YES
 *   analysisCompletedAt = NULL · verifiedSources = 0
 *   benchmark = NO · competitiveReport = NO · finalizedBundle = NULL
 *
 * Onze páginas lidas e gravadas, e nenhuma consolidação confirmada. O ciclo
 * não tinha nome para isso: a tela só sabia perguntar "analisou?" e recebia
 * não — então oferecia "Analisar concorrência" como se as páginas nunca
 * tivessem sido lidas, ou travava em "Análise não confirmada" sem saída.
 *
 * As duas leituras custam caro de formas diferentes: a primeira relê páginas
 * já pagas; a segunda deixa o artigo parado.
 */
export type RadarAnalysisPersistenceState =
  /** Não há versão remota compatível com o snapshot corrente. */
  | "NO_ANALYSIS"
  /** Páginas gravadas, consolidação final não confirmada. */
  | "ANALYSIS_PARTIALLY_PERSISTED"
  /** `analysisCompletedAt` confirmado pelo servidor. */
  | "ANALYSIS_CONFIRMED"
  /** Investigação congelada com bundle desta mesma pesquisa. */
  | "FINALIZED";

export type RadarAnalysisPersistence = {
  state: RadarAnalysisPersistenceState;
  /** Quantas páginas já estão gravadas remotamente. */
  extractions: number;
  /** Quantas fontes já foram verificadas e gravadas. */
  verifiedSources: number;
  /** O que a retomada ainda precisa produzir. Vazio quando nada falta. */
  missing: string[];
  reason: string;
};

export function radarAnalysisPersistenceState(input: {
  analysis: {
    extractions?: readonly unknown[];
    verifiedSources?: readonly unknown[];
    benchmark?: unknown;
    competitiveReport?: unknown;
    analysisCompletedAt?: string | null;
    finalizedBundle?: unknown;
  } | null | undefined;
  /** O bundle pertence à investigação corrente? Vindo da guarda de identidade. */
  bundleBelongsToCurrentResearch?: boolean;
}): RadarAnalysisPersistence {
  const analysis = input.analysis;
  if (!analysis) {
    return { state: "NO_ANALYSIS", extractions: 0, verifiedSources: 0, missing: [], reason: "Não há versão de análise remota para este snapshot." };
  }

  const extractions = analysis.extractions?.length || 0;
  const verifiedSources = analysis.verifiedSources?.length || 0;

  /*
   * O BUNDLE SÓ CONTA SE FOR DESTA PESQUISA — §1.
   *
   * `articleId` coincidir não basta: o mesmo artigo acumula investigações, e
   * uma anterior deixou bundle gravado. Sem esta porta, uma rodada nova
   * apareceria finalizada com a fotografia de outra.
   */
  if (analysis.finalizedBundle && input.bundleBelongsToCurrentResearch !== false) {
    return { state: "FINALIZED", extractions, verifiedSources, missing: [], reason: "A investigação corrente está congelada no servidor." };
  }

  if (analysis.analysisCompletedAt) {
    return { state: "ANALYSIS_CONFIRMED", extractions, verifiedSources, missing: [], reason: "A análise está gravada e confirmada; falta apenas finalizar." };
  }

  if (extractions > 0) {
    const missing = [
      ...(verifiedSources ? [] : ["verificação das fontes"]),
      ...(analysis.benchmark ? [] : ["benchmark"]),
      ...(analysis.competitiveReport ? [] : ["relatório competitivo"]),
      "carimbo de conclusão",
    ];
    return {
      state: "ANALYSIS_PARTIALLY_PERSISTED",
      extractions,
      verifiedSources,
      missing,
      reason: `${extractions} página(s) já estão gravadas no servidor; falta ${missing.join(", ")}.`,
    };
  }

  return { state: "NO_ANALYSIS", extractions: 0, verifiedSources, missing: [], reason: "Nenhuma página foi gravada nesta versão." };
}

/* ============ a base REMOTA sobre a qual a retomada trabalha ============ */

export type RadarResumableVersion = {
  versionId: string;
  versionNumber: number;
  payload: {
    articleDnaVersionId: string;
    serpSnapshotId: string;
    serpSnapshotVersion: number;
    serpSnapshotHash: string;
    extractions?: readonly unknown[];
  };
};

/**
 * QUAL VERSÃO REMOTA A RETOMADA PODE USAR COMO BASE — §1, §3 e §7.
 *
 * O smoke do 18.10.2 falhou com `SOURCE_ANALYSIS_UNKNOWN` sobre o id
 * `9dab0c90…`, e a v24 remota é `7bcab027…`. A retomada usou `data.analysis`
 * como se fosse a versão do banco. Não é: o `workspace` guarda também versões
 * APLICADAS LOCALMENTE — o fallback do 18.10 as coloca lá de propósito, para
 * não perder trabalho — e a mais recente delas venceu a seleção.
 *
 * O endpoint de verificação resolve cada `sourceId` a partir da análise
 * PERSISTIDA. Mandar um id que só existe em memória é pedir para o servidor
 * procurar algo que ele nunca guardou.
 *
 * Esta autoridade só aceita versões que vieram do banco, e ainda exige que
 * elas descrevam O MESMO snapshot e o MESMO fundamento — uma versão remota de
 * outra rodada seria tão errada quanto uma local.
 */
export function radarResumableRemoteAnalysis(input: {
  /** Versões lidas do servidor. Nunca as do workspace. */
  analyses: readonly RadarResumableVersion[];
  snapshot: { id: string; version: number; hash: string };
  articleDnaVersionId: string;
}): { ok: true; version: RadarResumableVersion; reason: string } | { ok: false; reason: string } {
  if (!input.analyses.length) {
    return { ok: false, reason: "O servidor não devolveu nenhuma versão de análise para este artigo." };
  }

  const doMesmoFundamento = input.analyses.filter(version => version.payload.articleDnaVersionId === input.articleDnaVersionId);
  if (!doMesmoFundamento.length) {
    return { ok: false, reason: "As versões gravadas pertencem a outra versão do ArticleDNA; retomar sobre elas descreveria outro artigo." };
  }

  const doMesmoSnapshot = doMesmoFundamento.filter(version =>
    version.payload.serpSnapshotId === input.snapshot.id
    && version.payload.serpSnapshotVersion === input.snapshot.version
    && version.payload.serpSnapshotHash === input.snapshot.hash);
  if (!doMesmoSnapshot.length) {
    return { ok: false, reason: "Nenhuma versão gravada está vinculada ao snapshot SERP corrente." };
  }

  const comPaginas = doMesmoSnapshot.filter(version => (version.payload.extractions?.length || 0) > 0);
  if (!comPaginas.length) {
    return { ok: false, reason: "As versões gravadas para este snapshot não têm páginas extraídas; não há o que consolidar." };
  }

  const escolhida = comPaginas.slice().sort((esquerda, direita) => esquerda.versionNumber - direita.versionNumber).at(-1)!;
  return {
    ok: true,
    version: escolhida,
    reason: `Retomando sobre a versão ${escolhida.versionNumber} gravada no servidor, com ${escolhida.payload.extractions?.length || 0} página(s).`,
  };
}

/**
 * O BUNDLE É DESTA INVESTIGAÇÃO, OU DE OUTRA? — §1.
 *
 * `foundationFingerprint` é o fingerprint do fundamento congelado no INÍCIO da
 * pesquisa que produziu o bundle. Ele é a única coisa que distingue um
 * congelamento da rodada corrente de um congelamento antigo do mesmo artigo.
 *
 * A auditoria achou um bundle `bundle:75bd4fc2` numa versão anterior, de uma
 * investigação que não é esta. Promovê-lo seria descrever a rodada nova com a
 * fotografia da antiga — e ninguém veria, porque o artigo é o mesmo.
 *
 * Na dúvida, NÃO pertence: um bundle sem fingerprint, ou uma pesquisa sem
 * registro, não podem provar parentesco.
 */
export function radarBundleBelongsToCurrentResearch(input: {
  bundle: { foundationFingerprint?: string | null } | null | undefined;
  record: { fingerprint?: { value?: string | null } | null } | null | undefined;
}): { belongs: boolean; reason: string } {
  if (!input.bundle) return { belongs: false, reason: "Não há bundle congelado nesta versão." };

  const doBundle = input.bundle.foundationFingerprint;
  const daPesquisa = input.record?.fingerprint?.value;

  if (!doBundle) return { belongs: false, reason: "O bundle não declara o fundamento que congelou; não dá para provar que é desta investigação." };
  if (!daPesquisa) return { belongs: false, reason: "A investigação corrente não tem registro com fundamento; o bundle não pode ser atribuído a ela." };
  if (doBundle !== daPesquisa) return { belongs: false, reason: "O bundle congelou outro fundamento: ele pertence a uma investigação anterior deste artigo." };

  return { belongs: true, reason: "O bundle congelou o mesmo fundamento da investigação corrente." };
}

/**
 * A frase que nomeia a etapa que ficou sem confirmação.
 *
 * Sem ela, a pessoa vê o estado recuar — de "Finalizado" para "Pronto" — e não
 * tem como saber se perdeu o trabalho ou só a confirmação. O trabalho está
 * intacto; o que falta é o carimbo do servidor.
 */
export function radarUnconfirmedClaimsNotice(stripped: readonly RadarRemoteOnlyClaim[]): string | null {
  if (!stripped.length) return null;

  const etapas = stripped.map(claim => claim === "finalizedBundle"
    ? "o congelamento da investigação"
    : "a gravação final da análise");

  return `O trabalho desta rodada está aplicado nesta aba, mas ${etapas.join(" e ")} não foi confirmado pelo servidor e por isso não aparece como concluído. Nada precisa ser refeito do zero: a etapa não confirmada pode ser repetida sozinha.`;
}
