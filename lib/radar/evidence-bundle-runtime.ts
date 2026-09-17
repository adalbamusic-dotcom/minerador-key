/**
 * ===== O DOSSIÊ V3, MONTADO A PARTIR DO QUE ESTÁ GRAVADO — RADAR_FINAL_1 =====
 *
 * ================== O QUE ESTE MÓDULO EXISTE PARA RESOLVER ==================
 *
 * O contrato V3 existia desde o Gate 16 e NUNCA foi montado em runtime: o
 * builder do handoff não tinha uma única chamada fora de teste, e o envio ao
 * Planejador acontecia por um comando de workflow que não carregava evidência
 * nenhuma. O Planejador recebia um item, não um dossiê.
 *
 * Pior: o núcleo do dossiê era a fotografia do pipeline do GOOGLE. Um artigo de
 * vídeo ou de produto não tem essa fotografia — e por isso não tinha handoff
 * possível sem fabricar um snapshot do Google, que é o que §17 proíbe.
 *
 * ==================== FROZEN VENCE LIVE, SEM EXCEÇÃO — §3 ====================
 *
 * Cada perfil tem a própria autoridade congelada. Havendo fotografia, é ela que
 * viaja: entregar um blueprint vivo ao Planejador faria uma melhoria no
 * vocabulário de padrões mudar a recomendação sob um carimbo de "finalizado".
 *
 * ===================== REFERÊNCIA, NUNCA MATÉRIA-PRIMA — §15 =====================
 *
 * `runId`, `snapshotId`, assinatura e contagens. Nenhum universo competitivo,
 * nenhum resultado de SERP, nenhum transcript inteiro. A auditoria do banco já
 * mediu o preço de esquecer isso: 126.656 de 144.440 bytes de uma fotografia
 * eram a coleta copiada byte a byte.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import {
  buildRadarEvidenceBundleV3,
  type RadarBundleCrossSerp,
  type RadarBundleEditorialOutput,
  type RadarEvidenceBinding,
  type RadarEvidenceBundle,
  type RadarResearchLayer,
} from "./evidence-bundle.ts";
import { radarSerpEvidenceStanding } from "./evidence-authority.ts";
import type { RadarCompetitiveBlueprint, RadarResearchRef } from "./competitive-blueprint.ts";
import type { RadarResearchProfile } from "./research-profile.ts";
import type { RadarResearchSource } from "./search-mode.ts";
import type { RadarCompetitiveObservedModel } from "./competitive-observed-model.ts";
import type { RadarKeywordContext } from "./keyword-context.ts";
import type { RadarVideoEvidenceLayer } from "./video-evidence.ts";
import type { RadarSpecialistEvidenceLayer } from "./specialist-evidence.ts";
import type { RadarEvidenceResolution } from "./evidence-authority.ts";

const objeto = (valor: unknown): Record<string, unknown> | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;

const lista = (valor: unknown): unknown[] => Array.isArray(valor) ? valor : [];

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor.trim() : null;

const textos = (valor: unknown): string[] =>
  lista(valor).map(item => texto(item)).filter((item): item is string => item !== null);

const inteiro = (valor: unknown): number =>
  typeof valor === "number" && Number.isFinite(valor) ? Math.max(0, Math.round(valor)) : 0;

/* ======================= §5 · qual perfil investigou ======================= */

/**
 * O PERFIL SAI DA EVIDÊNCIA GRAVADA, não do seletor da tela.
 *
 * O seletor descreve a intenção de quem está olhando agora; o dossiê precisa
 * descrever o que REALMENTE foi investigado e congelado. Num artigo já
 * finalizado em vídeo, alguém pode ter trocado o seletor para Amazon sem
 * coletar nada — e o dossiê diria "primária: AMAZON" sobre uma investigação de
 * YouTube.
 */
export function radarPrimaryProfileOfAnalysis(payload: unknown): RadarResearchProfile | null {
  const analise = objeto(payload);
  if (!analise) return null;
  if (objeto(analise.amazonFrozenInvestigation)) return "AMAZON";
  if (objeto(analise.youtubeFrozenInvestigation)) return "YOUTUBE";
  if (objeto(analise.finalizedBundle)) return "GOOGLE";
  return null;
}

/* ============================ as camadas ============================ */

function camadaDoYoutube(congelada: Record<string, unknown>): RadarResearchLayer {
  const referencia = objeto(congelada.runRef);
  const corridaLegada = objeto(congelada.run);

  /*
   * A CONTAGEM VEM DA REFERÊNCIA QUANDO ELA EXISTE.
   *
   * Fotografias tiradas antes da correção de compactação carregam a corrida
   * inteira; as novas carregam só a referência. Ler os dois caminhos é o que
   * mantém as antigas legíveis sem reescrever histórico.
   */
  const refs: RadarResearchRef[] = referencia
    ? [{
      source: "YOUTUBE_SERP",
      role: "PRIMARY_COMPETITIVE_RESEARCH",
      ref: texto(referencia.runId) || "",
      fingerprint: texto(referencia.runFingerprint),
      collectedAt: texto(referencia.collectedAt),
      sampleSize: inteiro(referencia.universeSize),
    }]
    : corridaLegada
      ? [{
        source: "YOUTUBE_SERP",
        role: "PRIMARY_COMPETITIVE_RESEARCH",
        ref: texto(corridaLegada.runId) || "",
        fingerprint: texto(objeto(corridaLegada.fingerprint)?.signature),
        collectedAt: texto(objeto(corridaLegada.provenance)?.collectedAt),
        sampleSize: lista(corridaLegada.universe).length,
      }]
      : [];

  return {
    role: "PRIMARY",
    frozenAt: texto(congelada.finalizedAt),
    refs,
    counts: {
      queries: referencia ? inteiro(referencia.queriesExecuted) : lista(corridaLegada?.queries).filter(item => objeto(item)?.executed === true).length,
      items: referencia ? inteiro(referencia.universeSize) : lista(corridaLegada?.universe).length,
    },
    limitations: textos(congelada.limitations),
  };
}

function camadaDaAmazon(congelada: Record<string, unknown>): RadarResearchLayer {
  const referencia = objeto(congelada.runRef);
  const resumo = objeto(congelada.observedSummary);

  return {
    role: "PRIMARY",
    frozenAt: texto(congelada.finalizedAt),
    refs: referencia
      ? [{
        source: "AMAZON_SERP",
        role: "PRIMARY_COMPETITIVE_RESEARCH",
        ref: texto(referencia.runId) || "",
        fingerprint: texto(referencia.runFingerprint),
        collectedAt: texto(referencia.collectedAt),
        sampleSize: inteiro(referencia.universeSize),
      }]
      : [],
    counts: {
      queries: inteiro(referencia?.queriesExecuted),
      items: inteiro(resumo?.products ?? referencia?.universeSize),
    },
    limitations: textos(congelada.limitations),
  };
}

/**
 * ============ §4 · O APOIO É APOIO, E O DOSSIÊ DIZ ISSO ============
 *
 * Num artigo de vídeo ou de produto, o Google foi lido UMA vez, sobre a keyword
 * principal, para fortalecer a leitura primária. Representá-lo como camada
 * primária faria o Planejador acreditar que houve investigação competitiva de
 * páginas — e ele planejaria sobre dez links azuis que ninguém curou.
 */
function camadaDeApoioDoGoogle(input: {
  snapshotId: string | null;
  keyword: string | null;
  collectedAt: string | null;
  role: RadarResearchRef["role"];
}): RadarResearchLayer | null {
  if (!input.snapshotId) return null;
  return {
    role: "SUPPORT",
    frozenAt: input.collectedAt,
    refs: [{
      source: "WEB_SERP",
      role: input.role,
      ref: input.snapshotId,
      fingerprint: null,
      collectedAt: input.collectedAt,
      sampleSize: 0,
    }],
    counts: { queries: input.keyword ? 1 : 0, items: 0 },
    limitations: [],
  };
}

/* ====================== §7 · o que o Radar recomenda ====================== */

function saidasDoBlueprint(blueprint: RadarCompetitiveBlueprint | null): RadarBundleEditorialOutput[] {
  if (!blueprint) return [];

  if (blueprint.profile === "AMAZON") {
    return blueprint.recommended.recommendedOutputs.map(saida => ({
      output: saida.output,
      objective: saida.objective,
      reason: saida.reason,
      sourceSignals: [...saida.sourceSignals],
    }));
  }

  if (blueprint.profile === "GOOGLE" && blueprint.recommended.editorialOutput) {
    /*
     * O perfil Google declara UMA saída, como string. Ela vira a mesma forma
     * das outras para o Planejador não precisar aprender dois formatos da
     * mesma resposta — e a origem é o ângulo editorial, que a sustenta.
     */
    return [{
      output: blueprint.recommended.editorialOutput,
      objective: blueprint.recommended.editorialAngle.objective,
      reason: blueprint.recommended.editorialAngle.statement,
      sourceSignals: [blueprint.recommended.editorialAngle.sourceSignal],
    }];
  }

  return [];
}

/** §7 · a saída multiformato do YouTube, quando a camada existe. */
function saidasDoMultimodal(multimodal: Record<string, unknown> | null): RadarBundleEditorialOutput[] {
  const recomendado = multimodal ? objeto(multimodal.recommended) : null;
  const saida = texto(recomendado?.editorialOutput);
  if (!saida) return [];

  const razoes = textos(recomendado?.rationale);
  return [{
    output: saida,
    objective: "Cobrir a intenção no formato que as duas buscas tratam como resposta.",
    reason: razoes[0] || "A leitura cruzada das SERPs sustenta esta saída.",
    /*
     * §7 · SEM ORIGEM, A SAÍDA NÃO VIAJA.
     *
     * Uma recomendação sem `sourceSignals` chega ao Planejador com a mesma
     * aparência de uma contagem de SERP — e o contrato do dossiê a recusa.
     */
    sourceSignals: razoes.length ? razoes : ["multimodal:cross-serp"],
  }];
}

/* ========================== §8 · o sinal cruzado ========================== */

function cruzamentoDoMultimodal(multimodal: Record<string, unknown> | null): RadarBundleCrossSerp | null {
  const observado = multimodal ? objeto(multimodal.observed) : null;
  if (!observado) return null;

  const videos = lista(observado.crossSerpVideos).map(item => objeto(item));
  if (!videos.length) return null;

  const contar = (sinal: string) => videos.filter(item => texto(item?.signal) === sinal).length;

  return {
    /*
     * CONTAGEM POR SINAL, não a lista de vídeos.
     *
     * O que o Planejador precisa é da distribuição: quantos vencem nos dois
     * lugares, quantos só num. Os vídeos têm autoridade própria na coleta.
     */
    signals: [
      { signal: "CROSS_PLATFORM" as const, count: contar("CROSS_PLATFORM") },
      { signal: "YOUTUBE_ONLY" as const, count: contar("YOUTUBE_ONLY") },
      { signal: "GOOGLE_ONLY" as const, count: contar("GOOGLE_ONLY") },
    ].filter(item => item.count > 0),
    sources: textos(observado.sources),
  };
}

/* ============================== a montagem ============================== */

export type RadarBundleResolutionFailure =
  | "NO_FINALIZED_RESEARCH"
  | "ARTICLE_MISMATCH";

export type RadarBundleResolution =
  | { ok: true; bundle: RadarEvidenceBundle }
  | { ok: false; code: RadarBundleResolutionFailure; reason: string };

/**
 * ============ §16 · A MONTAGEM DO DOSSIÊ, A PARTIR DA ANÁLISE ============
 *
 * Uma função resolve os três perfis. Adapters internos existem — um por perfil,
 * acima — mas o contrato que sai daqui é UM, e é ele que o Planejador aprende.
 */
export function buildRadarEvidenceBundleFromAnalysis(input: {
  payload: unknown;
  /** §2 · o fundamento CORRENTE. É contra ele que a identidade é conferida. */
  article: RadarEvidenceBinding;
  /** §6 · o blueprint canônico, montado pela autoridade de leitura. */
  competitiveBlueprint: RadarCompetitiveBlueprint | null;
  /** §9 e §10 · as camadas que já existem, quando existem. */
  video?: RadarVideoEvidenceLayer | null;
  specialist?: RadarSpecialistEvidenceLayer | null;
  /** A fotografia do pipeline do Google, quando o perfil é GOOGLE. */
  googleObserved?: RadarCompetitiveObservedModel | null;
  /** §2 · o contexto canônico de keyword, resolvido pela autoridade. */
  keywordContext?: RadarKeywordContext | null;
  conflicts?: readonly RadarEvidenceResolution[];
  serp?: { current: boolean; sufficient: boolean; valid: boolean };
  observedAt: string;
}): RadarBundleResolution {
  const analise = objeto(input.payload);
  const perfil = radarPrimaryProfileOfAnalysis(input.payload);

  if (!analise || !perfil) {
    return {
      ok: false,
      code: "NO_FINALIZED_RESEARCH",
      reason: "Nenhuma investigação finalizada foi encontrada neste artigo: finalize a pesquisa antes de enviar ao Planejador.",
    };
  }

  const pacote = objeto(analise.researchPackage);
  const apoioDoPacote = pacote ? objeto(pacote.supportResearch) : null;
  const apoioSolto = objeto(analise.supportResearch);

  const research: RadarEvidenceBundle["research"] = { google: null, youtube: null, amazon: null };
  const sources: RadarResearchSource[] = [];
  const limitacoes: string[] = [];
  let multimodal: Record<string, unknown> | null = null;

  if (perfil === "YOUTUBE") {
    const congelada = objeto(analise.youtubeFrozenInvestigation)!;
    research.youtube = camadaDoYoutube(congelada);
    sources.push("YOUTUBE_SERP");
    limitacoes.push(...research.youtube.limitations);
    multimodal = objeto(objeto(congelada.multimodal)?.blueprint);

    const apoio = camadaDeApoioDoGoogle({
      snapshotId: texto(apoioSolto?.serpSnapshotId) || texto(apoioDoPacote?.snapshotId),
      keyword: texto(apoioSolto?.keyword) || texto(apoioDoPacote?.keyword),
      collectedAt: texto(apoioSolto?.collectedAt) || texto(apoioDoPacote?.collectedAt),
      role: "SEO_SUPPORT",
    });
    if (apoio) { research.google = apoio; sources.push("WEB_SERP"); }
  }

  if (perfil === "AMAZON") {
    const congelada = objeto(analise.amazonFrozenInvestigation)!;
    research.amazon = camadaDaAmazon(congelada);
    sources.push("AMAZON_SERP");
    limitacoes.push(...research.amazon.limitations);

    const referenciaDeApoio = objeto(lista(congelada.supportRefs)[0]);
    const apoio = camadaDeApoioDoGoogle({
      snapshotId: texto(referenciaDeApoio?.snapshotId) || texto(apoioDoPacote?.snapshotId),
      keyword: texto(referenciaDeApoio?.keyword) || texto(apoioDoPacote?.keyword),
      collectedAt: texto(referenciaDeApoio?.collectedAt) || texto(apoioDoPacote?.collectedAt),
      role: "SEO_COMMERCIAL_SUPPORT",
    });
    if (apoio) { research.google = apoio; sources.push("WEB_SERP"); }
  }

  if (perfil === "GOOGLE") {
    const congelado = objeto(analise.finalizedBundle)!;
    const observado = input.googleObserved || null;
    research.google = {
      role: "PRIMARY",
      frozenAt: texto(congelado.frozenAt),
      refs: texto(analise.serpSnapshotId)
        ? [{
          source: "WEB_SERP",
          role: "PRIMARY_COMPETITIVE_RESEARCH",
          ref: texto(analise.serpSnapshotId) as string,
          fingerprint: texto(analise.serpSnapshotHash),
          collectedAt: texto(congelado.frozenAt),
          sampleSize: observado?.sample.comparablePages ?? 0,
        }]
        : [],
      counts: {
        queries: observado?.sample.queriesExecuted ?? 0,
        items: observado?.sample.comparablePages ?? 0,
      },
      limitations: textos(congelado.limitations),
    };
    sources.push("WEB_SERP");
    limitacoes.push(...research.google.limitations);
  }

  /*
   * ============ §14 · TODA LIMITAÇÃO MATERIAL ATRAVESSA ============
   *
   * "Não analisou texto de reviews", "não abriu PDP", "nota não prova
   * qualidade". Perder qualquer uma dessas no handoff faria o Planejador tratar
   * sinal comercial como veredito — e o artigo afirmaria o que a coleta nunca
   * mediu.
   *
   * O `Set` remove repetição literal, nunca conteúdo: duas frases diferentes
   * sobre a mesma ausência continuam as duas.
   */
  if (input.competitiveBlueprint) limitacoes.push(...input.competitiveBlueprint.limitations);

  const bundle = buildRadarEvidenceBundleV3({
    binding: input.article,
    observedAt: input.observedAt,
    primaryResearchProfile: perfil,
    researchSources: [...new Set(sources)],
    research,
    /* §3 · a fotografia editorial já construída. Nunca recalculada aqui. */
    competitiveBlueprint: input.competitiveBlueprint,
    crossSerp: cruzamentoDoMultimodal(multimodal),
    editorialOutputs: perfil === "YOUTUBE" && multimodal
      ? saidasDoMultimodal(multimodal)
      : saidasDoBlueprint(input.competitiveBlueprint),
    observed: perfil === "GOOGLE" ? input.googleObserved || null : null,
    serpStanding: radarSerpEvidenceStanding(input.serp || { current: true, sufficient: true, valid: true }),
    conflicts: [...(input.conflicts || [])],
    limitations: [...new Set(limitacoes)],
    video: input.video || null,
    specialist: input.specialist || null,
    /*
     * §1 e §5 · A CHAVE SÓ APARECE QUANDO HÁ CONTEXTO A ENTREGAR.
     *
     * Omiti-la quando não há mantém a serialização canônica idêntica à de
     * antes deste gate — e com ela o hash de todo dossiê que não tem
     * keyword resolvida. Gravar a chave com valor nulo mudaria a identidade de
     * pacotes que não mudaram em nada.
     */
    ...(input.keywordContext ? { keywordContext: input.keywordContext } : {}),
  });

  return { ok: true, bundle };
}
