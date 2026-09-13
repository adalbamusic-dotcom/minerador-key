import type { RadarBriefCoverage, RadarFrozenBriefInput, RadarRelevantExtract } from "./video-brief-matching.ts";

/**
 * A EVIDÊNCIA AUDIOVISUAL COMO CAMADA DO DOSSIÊ — nunca dentro do ArticleDNA.
 *
 * VIDEOS_3.5 · §5 e §6. A divisão de autoridade não muda por causa de vídeo:
 *
 *   ARTICLE_DNA            contrato editorial aprovado pelo Arquiteto, imutável
 *   RADAR_EVIDENCE_BUNDLE  o que a investigação provou, amarrado àquela versão
 *
 * Escrever o casamento dentro do ArticleDNA seria fazer o Radar reescrever o
 * que o Arquiteto aprovou — e o recorte de vídeo mudaria o contrato editorial
 * sem que ninguém tivesse aprovado a mudança. A camada vive aqui, presa ao
 * mesmo fundamento, e o Planejador recebe as duas coisas juntas.
 *
 * O QUE ELA CARREGA, E POR QUÊ CADA COISA:
 *
 *   os SNAPSHOTS das pautas   o que se foi procurar, congelado
 *   o ESTADO de cada pauta    o que o material respondeu
 *   os EXTRATOS selecionados  a evidência, com tempo e texto original
 *   as FONTES usadas          de onde cada trecho saiu
 *   a IDENTIDADE da execução  qual casamento produziu isto
 *
 * Sem a identidade da execução, o Planejador não teria como saber se o que ele
 * tem em mãos ainda é o casamento corrente — e "evidência de vídeo" viraria um
 * texto solto, sem meio de conferir.
 *
 * NADA AQUI É RECALCULADO. Esta é projeção do que o banco já tem: o matcher
 * roda no casamento, não na entrega.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

/* ============================== a identidade ============================= */

/**
 * A qual investigação congelada e a qual execução esta evidência pertence.
 *
 * Os dois são obrigatórios e respondem a perguntas diferentes: qual conjunto de
 * pautas foi usado, e qual rodada de casamento produziu os trechos. Um dossiê
 * com as pautas de um congelamento e os trechos de outro descreveria um artigo
 * que ninguém investigou.
 */
export type RadarVideoEvidenceIdentity = {
  frozenBundleId: string;
  frozenBundleHash: string | null;
  /** A execução do casamento — a corrente, não uma histórica superada. */
  matchingRunId: string;
  /** `m4:<fonte>@v<versão>|…`. Diz qual matcher e sobre qual material. */
  inputFingerprint: string;
  matcherVersion: number | null;
  matchedAt: string;
};

export type RadarVideoEvidenceSource = {
  videoSourceId: string;
  displayName: string | null;
  /** O idioma em que o trecho está. Nada é traduzido nesta fase. */
  languageCode: string | null;
  /** Qual versão do transcript sustentou os trechos desta fonte. */
  processingVersion: number;
};

/**
 * O DESFECHO DE UMA PAUTA, com tudo o que o Planejador precisa saber.
 *
 * `missingCriteria` viaja junto de propósito: o que a investigação NÃO achou é
 * informação de planejamento tão útil quanto o que achou. Entregar só o que foi
 * encontrado faria uma pauta parcial parecer resolvida.
 */
export type RadarVideoEvidenceBriefResult = {
  videoBriefId: string;
  topic: string;
  /** O que a pauta mandou procurar, verbatim do congelamento. */
  whatToLookFor: string[];
  narrativePurpose: string;
  relatedSectionId: string | null;
  relatedSectionTitle: string | null;
  provenance: Array<{ source: string; detail: string }>;
  state: RadarBriefCoverage["state"];
  reason: string;
  matchedCriteria: string[];
  missingCriteria: string[];
  usefulSourceIds: string[];
  extracts: RadarRelevantExtract[];
};

export type RadarVideoEvidenceLayer = {
  identity: RadarVideoEvidenceIdentity;
  /** As pautas congeladas, inteiras. O Planejador não as reconstrói. */
  briefs: RadarFrozenBriefInput[];
  results: RadarVideoEvidenceBriefResult[];
  /** Só as fontes que sustentaram algum trecho. Biblioteca não é evidência. */
  sources: RadarVideoEvidenceSource[];
  summary: {
    briefs: number;
    supported: number;
    partial: number;
    notFound: number;
    extracts: number;
    sources: number;
  };
};

/* ============================ as invariantes ============================ */

/**
 * A CAMADA NÃO PODE ANDAR SOLTA — e o erro acontece na montagem.
 *
 * Tarde demais seria o Planejador compondo com trechos de uma execução que já
 * foi superada, ou com pautas de outro congelamento.
 */
export function assertRadarVideoEvidenceLayer(layer: RadarVideoEvidenceLayer): void {
  if (!layer.identity.frozenBundleId.trim()) throw new Error("RADAR_VIDEO_EVIDENCE_MISSING_FROZEN_BUNDLE");
  if (!layer.identity.matchingRunId.trim()) throw new Error("RADAR_VIDEO_EVIDENCE_MISSING_RUN");
  if (!layer.identity.inputFingerprint.trim()) throw new Error("RADAR_VIDEO_EVIDENCE_MISSING_FINGERPRINT");

  const conhecidas = new Set(layer.briefs.map(item => item.briefId));
  for (const resultado of layer.results) {
    if (!conhecidas.has(resultado.videoBriefId)) throw new Error("RADAR_VIDEO_EVIDENCE_RESULT_WITHOUT_BRIEF");
    for (const trecho of resultado.extracts) {
      if (trecho.videoBriefId !== resultado.videoBriefId) throw new Error("RADAR_VIDEO_EVIDENCE_EXTRACT_BRIEF_MISMATCH");
      /*
       * A ÂNCORA VIAJA COM O TRECHO. Sem índices de segmento e sem tempos, o
       * Planejador receberia uma citação que ninguém consegue conferir no
       * vídeo — que é exatamente o que o portão do casamento existe para
       * impedir. O contrato não pode afrouxar na saída o que segurou na origem.
       */
      if (!trecho.segmentIndexes.length) throw new Error("RADAR_VIDEO_EVIDENCE_EXTRACT_WITHOUT_ANCHOR");
      if (!(trecho.endMs >= trecho.startMs)) throw new Error("RADAR_VIDEO_EVIDENCE_EXTRACT_WITH_IMPOSSIBLE_TIME");
      if (!trecho.originalText.trim()) throw new Error("RADAR_VIDEO_EVIDENCE_EXTRACT_WITHOUT_TEXT");
    }
  }
}

/* ============================== a montagem ============================== */

/**
 * A CAMADA, PROJETADA DO QUE JÁ ESTÁ GRAVADO.
 *
 * `coverage` vem da leitura do casamento — a mesma projeção que a tela mostra.
 * Nada é recalculado aqui: se o estado de uma pauta mudasse entre a tela e a
 * entrega, seriam duas verdades sobre a mesma execução.
 */
export function buildRadarVideoEvidenceLayer(input: {
  identity: RadarVideoEvidenceIdentity;
  briefs: readonly RadarFrozenBriefInput[];
  coverage: readonly RadarBriefCoverage[];
  /** A biblioteca da marca. Só entram as que sustentaram algum trecho. */
  sources: readonly RadarVideoEvidenceSource[];
}): RadarVideoEvidenceLayer {
  const porPauta = new Map(input.coverage.map(item => [item.videoBriefId, item]));

  const results: RadarVideoEvidenceBriefResult[] = input.briefs.map(brief => {
    const cobertura = porPauta.get(brief.briefId);
    return {
      videoBriefId: brief.briefId,
      topic: brief.topic,
      whatToLookFor: [...brief.whatToLookFor],
      narrativePurpose: brief.narrativePurpose,
      relatedSectionId: brief.relatedSectionId,
      relatedSectionTitle: brief.relatedSectionTitle,
      provenance: [...((brief as { provenance?: Array<{ source: string; detail: string }> }).provenance || [])],
      /*
       * PAUTA SEM COBERTURA É `NOT_FOUND`, e não some da entrega.
       *
       * Omiti-la faria o Planejador acreditar que a investigação não pediu
       * aquele apoio audiovisual — quando ela pediu e o material não respondeu.
       */
      state: cobertura?.state || "NOT_FOUND",
      reason: cobertura?.reason || "Esta pauta não foi alcançada por nenhuma fonte nesta execução.",
      matchedCriteria: [...(cobertura?.matchedCriteria || [])],
      missingCriteria: [...(cobertura?.missingCriteria || brief.whatToLookFor)],
      usefulSourceIds: [...(cobertura?.usefulSourceIds || [])],
      extracts: [...(cobertura?.extracts || [])],
    };
  });

  const usadas = new Set(results.flatMap(item => item.usefulSourceIds));
  const sources = input.sources.filter(item => usadas.has(item.videoSourceId));

  const layer: RadarVideoEvidenceLayer = {
    identity: input.identity,
    briefs: input.briefs.map(item => ({ ...item })),
    results,
    sources,
    summary: {
      briefs: results.length,
      supported: results.filter(item => item.state === "SUPPORTED").length,
      partial: results.filter(item => item.state === "PARTIAL").length,
      notFound: results.filter(item => item.state === "NOT_FOUND").length,
      extracts: results.reduce((total, item) => total + item.extracts.length, 0),
      sources: sources.length,
    },
  };

  assertRadarVideoEvidenceLayer(layer);
  return layer;
}
