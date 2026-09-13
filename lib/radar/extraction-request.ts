/**
 * O CONTRATO DA EXTRAÇÃO COMPETITIVA — em um lugar só.
 *
 * O schema morava dentro da rota, invisível para o cliente. O endpoint aceita
 * no máximo cinco páginas por requisição — um teto real, que existe para
 * limitar o fan-out de fetch externo de uma única chamada — e a tela nunca
 * soube desse teto. Com sete referências curadas o pedido saía inteiro e
 * voltava `too_big` em `candidates`, com a mensagem genérica "Solicitação de
 * extração Radar inválida.".
 *
 * O teto continua sendo do servidor e continua `.strict()`. O que muda é que
 * ele passa a ser CONHECIDO: o cliente divide a seleção em lotes desse mesmo
 * tamanho, em vez de descobrir o limite por 400.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { z } from "zod";
import { VersionedRadarAnalysisSchema } from "./analysis-contracts.ts";
import { radarResearchDecisionIsAnalyzable, resolveRadarResearchReferenceUrl } from "./research-curation.ts";

/**
 * Páginas externas buscadas por requisição.
 *
 * Não é preferência de UI: é o fan-out que uma chamada pode disparar. Subir
 * este número aumenta o trabalho externo de um único request; dividir a
 * seleção em lotes não.
 */
export const RADAR_EXTRACTION_BATCH_LIMIT = 5;

export const RadarExtractionCandidateSchema = z.object({
  key: z.string().min(1),
  url: z.string().url(),
  itemType: z.literal("organic"),
  decision: z.literal("included"),
}).strict();

export type RadarExtractionCandidate = z.infer<typeof RadarExtractionCandidateSchema>;

/**
 * A CANDIDATA DA PESQUISA PROFUNDA — SÓ O ID.
 *
 * Note o que NÃO existe aqui: `url`. O cliente não escolhe o que o servidor
 * busca. Ele nomeia uma referência já confirmada na curadoria, e a URL sai de
 * lá. Um id legítimo com URL trocada deixa de ser expressável no contrato.
 */
export const RadarResearchExtractionCandidateSchema = z.object({
  source: z.literal("research"),
  referenceId: z.string().min(1),
}).strict();

export type RadarResearchExtractionCandidate = z.infer<typeof RadarResearchExtractionCandidateSchema>;

export const RadarAnyExtractionCandidateSchema = z.union([RadarExtractionCandidateSchema, RadarResearchExtractionCandidateSchema]);
export type RadarAnyExtractionCandidate = z.infer<typeof RadarAnyExtractionCandidateSchema>;

export const isRadarResearchCandidate = (candidate: RadarAnyExtractionCandidate): candidate is RadarResearchExtractionCandidate =>
  "source" in candidate && candidate.source === "research";

export const isRadarCanonicalCandidate = (candidate: RadarAnyExtractionCandidate): candidate is RadarExtractionCandidate =>
  !isRadarResearchCandidate(candidate);

export const RadarExtractionRequestSchema = z.object({
  brandId: z.string().min(1),
  articleId: z.string().min(1),
  analysis: VersionedRadarAnalysisSchema,
  candidates: z.array(RadarAnyExtractionCandidateSchema).min(1).max(RADAR_EXTRACTION_BATCH_LIMIT),
  /** A impressão do universo contra o qual a seleção da pesquisa foi feita. */
  universeFingerprint: z.string().min(1).optional(),
  /*
   * O snapshot e a impressão digital da curadoria contra os quais a seleção
   * foi feita. Opcionais por retrocompatibilidade; quando vêm, o servidor
   * recusa uma seleção montada sobre outra versão em vez de extrair páginas
   * que ninguém mais está vendo.
   */
  snapshotId: z.string().min(1).optional(),
  snapshotHash: z.string().min(1).optional(),
  /** Principal recebida do ArticleDNA: habilita a observação de presença por localização. */
  keyword: z.string().trim().min(1).max(300).optional(),
}).strict();

export type RadarExtractionRequest = z.infer<typeof RadarExtractionRequestSchema>;

/**
 * Os códigos que a rota devolve — para o log saber QUAL contrato recusou.
 *
 * "Solicitação inválida" não dizia se o problema era o formato, a curadoria, o
 * snapshot ou o artigo. A mensagem ao usuário pode continuar curta; o código e
 * a causa não podem ficar escondidos.
 */
export const RADAR_EXTRACTION_ERROR = {
  REQUEST_INVALID: "EXTRACTION_REQUEST_INVALID",
  ARTICLE_MISMATCH: "EXTRACTION_ARTICLE_MISMATCH",
  CURATION_STALE: "EXTRACTION_CURATION_STALE",
  BATCH_TOO_LARGE: "EXTRACTION_BATCH_TOO_LARGE",
  SNAPSHOT_STALE: "EXTRACTION_SNAPSHOT_STALE",
  /** O id não existe na curadoria confirmada desta versão. */
  REFERENCE_UNKNOWN: "EXTRACTION_REFERENCE_UNKNOWN",
  /** O id existe, mas a decisão humana não o coloca na amostra. */
  REFERENCE_NOT_SELECTED: "EXTRACTION_REFERENCE_NOT_SELECTED",
  /** A URL enviada não é a que a curadoria registrou para aquela decisão. */
  URL_MISMATCH: "EXTRACTION_URL_MISMATCH",
} as const;

export type RadarExtractionErrorCode = (typeof RADAR_EXTRACTION_ERROR)[keyof typeof RADAR_EXTRACTION_ERROR];

/**
 * A seleção curada dividida em lotes que cabem no contrato.
 *
 * Sete referências não viram sete requisições nem um 400: viram dois lotes,
 * na ordem da curadoria, sem perder nenhuma e sem repetir nenhuma.
 */
export function radarExtractionBatches<T>(candidates: readonly T[], limit = RADAR_EXTRACTION_BATCH_LIMIT): T[][] {
  if (limit < 1) throw new Error("O lote de extração precisa de pelo menos uma página.");
  const lotes: T[][] = [];
  for (let inicio = 0; inicio < candidates.length; inicio += limit) lotes.push(candidates.slice(inicio, inicio + limit));
  return lotes;
}

/**
 * A frase que a pessoa lê, sem esconder o código que o log guarda.
 *
 * Quem opera não precisa do caminho Zod; precisa saber se o problema é dela
 * (curadoria mudou) ou do sistema (contrato divergiu).
 */
export function radarExtractionErrorMessage(code: string | null | undefined, fallback: string): string {
  if (code === RADAR_EXTRACTION_ERROR.ARTICLE_MISMATCH) return "A análise carregada não pertence a este artigo. Recarregue a linha antes de analisar.";
  if (code === RADAR_EXTRACTION_ERROR.CURATION_STALE) return "A curadoria mudou depois desta seleção. Reabra Concorrentes e confirme as referências antes de analisar.";
  if (code === RADAR_EXTRACTION_ERROR.SNAPSHOT_STALE) return "Esta seleção foi montada sobre outro snapshot da SERP. Recarregue a linha antes de analisar.";
  if (code === RADAR_EXTRACTION_ERROR.BATCH_TOO_LARGE) return `Cada requisição analisa no máximo ${RADAR_EXTRACTION_BATCH_LIMIT} página(s). A seleção é enviada em lotes automaticamente; recarregue a linha e tente de novo.`;
  if (code === RADAR_EXTRACTION_ERROR.REQUEST_INVALID) return "O pedido de análise não corresponde ao contrato atual. Recarregue a linha; o detalhe técnico está no log.";
  return fallback;
}

/* ------------------------- o portão do servidor -------------------------- */

export type RadarExtractionRefusal = {
  code: RadarExtractionErrorCode;
  message: string;
  status: number;
  details: Record<string, unknown>;
};

/**
 * O QUE IMPEDE EXTRAIR — depois do schema, antes de qualquer fetch externo.
 *
 * A regra nunca foi "a tela pediu": a autoridade é a curadoria persistida que
 * veio no pedido. Se a seleção foi montada sobre outro snapshot, sobre outra
 * impressão digital de curadoria, ou aponta para uma chave que a curadoria não
 * incluiu, o pedido é recusado COM O CÓDIGO que diz qual contrato falhou.
 *
 * Domínio puro: nenhuma página externa é buscada aqui.
 */
export function radarExtractionRefusal(
  input: RadarExtractionRequest,
  /*
   * O mapa `organic:<posição> → URL` lido do SNAPSHOT PERSISTIDO.
   *
   * Ele existe para a decisão antiga, gravada antes de a URL passar a viajar
   * junto: com o snapshot em mãos, o servidor amarra o par mesmo no histórico.
   * Sem ele, a decisão antiga continua validada só pela chave.
   */
  canonicalUrlByKey?: ReadonlyMap<string, string>,
): RadarExtractionRefusal | null {
  const payload = input.analysis.payload;

  if (payload.brandId !== input.brandId || payload.articleId !== input.articleId) {
    return {
      code: RADAR_EXTRACTION_ERROR.ARTICLE_MISMATCH,
      message: "A análise não corresponde ao item Radar selecionado.",
      status: 409,
      details: {
        expected: { brandId: input.brandId, articleId: input.articleId },
        received: { brandId: payload.brandId, articleId: payload.articleId },
      },
    };
  }

  if (input.snapshotId && payload.serpSnapshotId !== input.snapshotId) {
    return {
      code: RADAR_EXTRACTION_ERROR.SNAPSHOT_STALE,
      message: "A análise descreve outro snapshot da SERP.",
      status: 409,
      details: { expected: input.snapshotId, received: payload.serpSnapshotId },
    };
  }

  if (input.snapshotHash && payload.serpSnapshotHash !== input.snapshotHash) {
    return {
      code: RADAR_EXTRACTION_ERROR.CURATION_STALE,
      message: "A curadoria mudou depois desta seleção.",
      status: 409,
      details: { expected: input.snapshotHash, received: payload.serpSnapshotHash },
    };
  }

  const canonicas = input.candidates.filter(isRadarCanonicalCandidate);
  const pesquisa = input.candidates.filter(isRadarResearchCandidate);

  const decisoes = new Map(payload.serpDecisions
    .filter(decision => decision.itemType === "organic" && decision.decision === "included")
    .map(decision => [decision.key, decision]));
  const fora = canonicas.filter(candidate => !decisoes.has(candidate.key)).map(candidate => candidate.key);
  if (fora.length) {
    return {
      code: RADAR_EXTRACTION_ERROR.CURATION_STALE,
      message: "Somente URLs orgânicas já incluídas na curadoria podem ser extraídas.",
      status: 409,
      details: { keys: fora },
    };
  }

  /*
   * A CHAVE NÃO BASTA: O PAR CHAVE ↔ URL É QUE VALE.
   *
   * O portão conferia só a chave, e a URL vinha do cliente ao lado dela — uma
   * chave legítima com destino trocado passava. Desde este lote a decisão
   * carrega a URL que a curadoria viu, e é ela que manda. Decisão antiga sem
   * URL continua aceita pela chave: o histórico não é reescrito, e o que nasce
   * daqui em diante nasce amarrado.
   */
  const trocadas = canonicas
    .map(candidate => ({ candidate, url: decisoes.get(candidate.key)?.url || canonicalUrlByKey?.get(candidate.key) }))
    .filter(item => item.url && item.url !== item.candidate.url);
  if (trocadas.length) {
    return {
      code: RADAR_EXTRACTION_ERROR.URL_MISMATCH,
      message: "A URL enviada não corresponde à referência incluída na curadoria.",
      status: 409,
      details: { keys: trocadas.map(item => ({ key: item.candidate.key, expected: item.url, received: item.candidate.url })) },
    };
  }

  /* ------------------ as referências da pesquisa profunda ----------------- */

  if (pesquisa.length) {
    const curadoria = payload.deepResearch?.researchCuration || null;
    if (!curadoria) {
      return {
        code: RADAR_EXTRACTION_ERROR.REFERENCE_UNKNOWN,
        message: "Esta versão não tem curadoria de pesquisa confirmada; nenhuma referência pode ser extraída.",
        status: 409,
        details: { referenceIds: pesquisa.map(candidate => candidate.referenceId) },
      };
    }

    if (input.universeFingerprint && curadoria.universeFingerprint !== input.universeFingerprint) {
      return {
        code: RADAR_EXTRACTION_ERROR.CURATION_STALE,
        message: "O universo pesquisado mudou depois desta curadoria.",
        status: 409,
        details: { expected: input.universeFingerprint, received: curadoria.universeFingerprint },
      };
    }

    const desconhecidas: string[] = [];
    const naoSelecionadas: string[] = [];
    for (const candidate of pesquisa) {
      const resolvida = resolveRadarResearchReferenceUrl(curadoria, candidate.referenceId);
      if (!resolvida) { desconhecidas.push(candidate.referenceId); continue; }
      if (!radarResearchDecisionIsAnalyzable(resolvida.decision)) naoSelecionadas.push(candidate.referenceId);
    }
    if (desconhecidas.length) {
      return {
        code: RADAR_EXTRACTION_ERROR.REFERENCE_UNKNOWN,
        message: "Uma das referências não existe na curadoria de pesquisa desta versão.",
        status: 409,
        details: { referenceIds: desconhecidas },
      };
    }
    if (naoSelecionadas.length) {
      return {
        code: RADAR_EXTRACTION_ERROR.REFERENCE_NOT_SELECTED,
        message: "Somente referências marcadas como concorrente ou apoio podem ser extraídas.",
        status: 409,
        details: { referenceIds: naoSelecionadas },
      };
    }
  }

  return null;
}

export type RadarExtractionTarget = {
  key: string;
  url: string;
  origin: "canonical" | "research";
};

/**
 * O QUE SERÁ BUSCADO — resolvido pelo servidor, nunca copiado do pedido.
 *
 * Para a referência da pesquisa, a URL vem da curadoria persistida. Para a
 * canônica, vem da decisão quando ela a registra, e só cai no valor do pedido
 * quando a versão é anterior a este lote — caso em que a chave já foi validada
 * contra a curadoria logo acima.
 *
 * Chame SEMPRE depois de `radarExtractionRefusal` devolver `null`.
 */
export function radarExtractionTargets(input: RadarExtractionRequest, canonicalUrlByKey?: ReadonlyMap<string, string>): RadarExtractionTarget[] {
  const payload = input.analysis.payload;
  const decisoes = new Map(payload.serpDecisions.map(decision => [decision.key, decision]));
  const curadoria = payload.deepResearch?.researchCuration || null;

  return input.candidates.flatMap((candidate): RadarExtractionTarget[] => {
    if (isRadarResearchCandidate(candidate)) {
      const resolvida = resolveRadarResearchReferenceUrl(curadoria, candidate.referenceId);
      return resolvida ? [{ key: candidate.referenceId, url: resolvida.url, origin: "research" }] : [];
    }
    return [{ key: candidate.key, url: decisoes.get(candidate.key)?.url || canonicalUrlByKey?.get(candidate.key) || candidate.url, origin: "canonical" }];
  });
}
