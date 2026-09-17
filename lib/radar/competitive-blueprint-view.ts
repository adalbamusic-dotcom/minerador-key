/**
 * ===== A AUTORIDADE DE LEITURA DO BLUEPRINT — §7 e §19 =====
 *
 * Uma função monta o blueprint competitivo a partir do que está gravado. Área
 * Pesquisa, cards, Relatório e o futuro handoff ao Planejador leem daqui.
 *
 * ===================== POR QUE NÃO EM CADA COMPONENTE =====================
 *
 * O 1.1 já mostrou o desfecho de derivar em quatro lugares: card, corpo,
 * tabela e aviso discordaram sobre a mesma investigação, e cada leitura era
 * defensável isolada. Montar o blueprint dentro de quatro componentes React
 * repetiria isso com um dado mais caro — e a divergência só apareceria depois
 * de alguém publicar o conteúdo errado.
 *
 * ===================== A PRECEDÊNCIA DO CONGELADO — §20 =====================
 *
 * Existindo fotografia, ela manda. O blueprint vivo é recalculado a cada
 * abertura; se os dois disputassem a tela, uma melhoria no vocabulário de
 * padrões mudaria a recomendação sob um carimbo que diz "finalizado".
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

import { buildRadarYoutubeCanonicalBlueprint } from "./youtube-editorial.ts";
import { radarFrozenRunCounts, type RadarYoutubeFrozenInvestigation } from "./youtube-evidence.ts";
import type { RadarCompetitiveBlueprint, RadarResearchRef } from "./competitive-blueprint.ts";
import type { RadarYoutubeBlueprint } from "./youtube-blueprint.ts";
import type { RadarMultimodalBlueprint } from "./multimodal-blueprint.ts";
import type { RadarResearchProfile } from "./research-profile.ts";
import { googleCompetitiveBlueprintOfAnalysis } from "./google-editorial.ts";
import type { RadarAmazonFrozenInvestigation } from "./amazon-evidence.ts";
import type { RadarAmazonBlueprint } from "./competitive-blueprint.ts";
import type { RadarCompetitiveObservedModel } from "./competitive-observed-model.ts";

export type RadarCompetitiveBlueprintView = {
  profile: RadarResearchProfile;
  /** `true` quando a leitura veio da fotografia, e não do recálculo. */
  frozen: boolean;
  blueprint: RadarCompetitiveBlueprint | null;
  /**
   * Por que não há blueprint. `null` quando há.
   *
   * Sem isso a tela mostraria uma seção vazia e ninguém saberia se falta
   * coleta, se falta finalizar ou se a leitura quebrou.
   */
  unavailableReason: string | null;
  /** A amostra competitiva: contagem para o rótulo, sem carregar a amostra. */
  sample: { label: string; count: number };
};

/**
 * O BLUEPRINT CANÔNICO DESTE ARTIGO.
 *
 * `payload` é a versão corrente da análise. `liveBlueprint` e `multimodal` são
 * os recálculos que a tela já faz — eles só entram quando NÃO há fotografia.
 */
export function radarCompetitiveBlueprintViewOfAnalysis(input: {
  profile: RadarResearchProfile;
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash?: string | null;
  frozen: RadarYoutubeFrozenInvestigation | null | undefined;
  liveBlueprint: RadarYoutubeBlueprint | null | undefined;
  liveMultimodal: RadarMultimodalBlueprint | null | undefined;
  primaryKeyword: string | null;
  supportSnapshotId?: string | null;
  /**
   * §1 · O MODELO QUE O PIPELINE DO GOOGLE JÁ PRODUZIU.
   *
   * Entra pronto porque a autoridade dele é outra: este módulo lê o resultado,
   * não conduz a investigação.
   */
  googleObserved?: RadarCompetitiveObservedModel | null;
  /** §4 · quando o pipeline do Google já congelou. */
  googleFrozenAt?: string | null;
  /*
   * ====== A AMAZON ENTRA PRONTA — AMAZON_SEARCH_2 · §31 ======
   *
   * O blueprint dela é GRAVADO pela análise, não recalculado aqui. Isso é o
   * que faz F5 e outra sessão mostrarem a mesma leitura: recalcular a cada
   * abertura deixaria uma melhoria no vocabulário de faixas mudar a
   * recomendação sob a página que a pessoa já leu.
   */
  amazonFrozen?: RadarAmazonFrozenInvestigation | null;
  amazonBlueprint?: RadarAmazonBlueprint | null;
  /** Só para o rótulo da amostra: a contagem, nunca a amostra. */
  amazonUniverseSize?: number;
  serpSnapshotId?: string | null;
  generatedAt: string;
}): RadarCompetitiveBlueprintView {
  /*
   * ====== O GOOGLE ENTRA PELO ADAPTER — 1.1 · §1 e §3 ======
   *
   * DUAS AUTORIDADES, E ELAS NÃO SE MISTURAM.
   *
   * O pipeline do Google continua sendo a autoridade OPERACIONAL, com as seis
   * etapas dele — coleta, curadoria, análise, modelo, relatório, revisão. Nada
   * aqui decide etapa, muda estado ou persiste.
   *
   * O que entra é uma TRADUÇÃO do que ele já observou para a gramática do
   * envelope. É a diferença entre ler o resultado e assumir o processo.
   */
  if (input.profile === "GOOGLE") {
    if (!input.googleObserved) {
      return {
        profile: "GOOGLE",
        frozen: false,
        blueprint: null,
        unavailableReason: "A investigação do Google ainda não produziu modelo competitivo.",
        sample: { label: "página(s)", count: 0 },
      };
    }

    /*
     * §4 · A FOTOGRAFIA DO GOOGLE VENCE O VIVO.
     *
     * `finalizedBundle` é o congelamento canônico daquele pipeline. Havendo
     * um, a leitura editorial descreve o que foi assinado — recalcular faria
     * uma melhoria no agrupamento semântico mudar a recomendação sob um
     * carimbo que diz "finalizado".
     */
    const congeladoEm = input.googleFrozenAt || null;
    const refs: RadarResearchRef[] = input.serpSnapshotId
      ? [{
        source: "WEB_SERP", role: "PRIMARY_COMPETITIVE_RESEARCH",
        ref: input.serpSnapshotId, fingerprint: null, collectedAt: null,
        sampleSize: input.googleObserved.sample.comparablePages,
      }]
      : [];

    return {
      profile: "GOOGLE",
      frozen: Boolean(congeladoEm),
      blueprint: googleCompetitiveBlueprintOfAnalysis({
        articleId: input.articleId,
        articleDnaVersionId: input.articleDnaVersionId,
        articleDnaContentHash: input.articleDnaContentHash ?? null,
        observed: input.googleObserved,
        researchRefs: refs,
        generatedAt: input.generatedAt,
        frozenAt: congeladoEm,
      }),
      unavailableReason: null,
      sample: { label: "página(s)", count: input.googleObserved.sample.comparablePages },
    };
  }

  if (input.profile === "AMAZON") {
    /*
     * §26 e §28 · A FOTOGRAFIA MANDA, e o blueprint dela vem de dentro.
     *
     * A fotografia da Amazon não copia a corrida; ela copia as CONCLUSÕES. É
     * por isso que a leitura congelada não precisa da coleta ao lado — e por
     * isso que ela não pode ser recalculada: recalcular mudaria o que já foi
     * assinado.
     */
    if (input.amazonFrozen) {
      const fotografia = input.amazonFrozen;
      return {
        profile: "AMAZON",
        frozen: true,
        blueprint: fotografia.competitiveBlueprint,
        unavailableReason: null,
        sample: { label: "produto(s)", count: fotografia.observedSummary.products },
      };
    }

    if (input.amazonBlueprint) {
      return {
        profile: "AMAZON",
        frozen: false,
        blueprint: input.amazonBlueprint,
        unavailableReason: null,
        sample: { label: "produto(s)", count: input.amazonUniverseSize || input.amazonBlueprint.observed.products },
      };
    }

    /*
     * §24 · COLETA SEM ANÁLISE NÃO É BLUEPRINT AUSENTE POR FALTA DE DADO.
     *
     * A frase diz o que falta FAZER. "Não há coleta suficiente" mandaria
     * recoletar uma prateleira que já foi paga.
     */
    return {
      profile: "AMAZON",
      frozen: false,
      blueprint: null,
      unavailableReason: input.amazonUniverseSize
        ? "A pesquisa Amazon está coletada e ainda não foi analisada."
        : "Ainda não há coleta da Amazon para analisar.",
      sample: { label: "produto(s)", count: input.amazonUniverseSize || 0 },
    };
  }

  if (input.profile !== "YOUTUBE") {
    return {
      profile: input.profile,
      frozen: false,
      blueprint: null,
      unavailableReason: "Este perfil não produz blueprint competitivo.",
      sample: { label: "item(ns)", count: 0 },
    };
  }

  const congelada = input.frozen || null;

  /* §20 · a fotografia manda. */
  if (congelada) {
    const contagens = radarFrozenRunCounts(congelada);
    const refs: RadarResearchRef[] = [];

    if (congelada.runRef) {
      refs.push({
        source: "YOUTUBE_SERP", role: "PRIMARY_COMPETITIVE_RESEARCH",
        ref: congelada.runRef.runId,
        fingerprint: congelada.runRef.runFingerprint,
        collectedAt: congelada.runRef.collectedAt,
        sampleSize: congelada.runRef.universeSize,
      });
    } else if (congelada.run) {
      /* §3 · fotografia legada: a referência sai da cópia que ela tem. */
      refs.push({
        source: "YOUTUBE_SERP", role: "PRIMARY_COMPETITIVE_RESEARCH",
        ref: congelada.run.runId,
        fingerprint: congelada.run.fingerprint.signature,
        collectedAt: congelada.run.provenance.collectedAt,
        sampleSize: congelada.run.universe.length,
      });
    }

    if (input.supportSnapshotId) {
      refs.push({
        source: "WEB_SERP", role: "SEO_SUPPORT",
        ref: input.supportSnapshotId, fingerprint: null, collectedAt: null, sampleSize: 0,
      });
    }

    return {
      profile: "YOUTUBE",
      frozen: true,
      blueprint: buildRadarYoutubeCanonicalBlueprint({
        articleId: input.articleId,
        articleDnaVersionId: input.articleDnaVersionId,
        articleDnaContentHash: input.articleDnaContentHash ?? null,
        blueprint: congelada.blueprint,
        multimodal: congelada.multimodal?.blueprint || null,
        researchRefs: refs,
        primaryKeyword: input.primaryKeyword,
        generatedAt: input.generatedAt,
        frozenAt: congelada.finalizedAt,
      }),
      unavailableReason: null,
      sample: { label: "vídeo(s)", count: contagens.universeSize },
    };
  }

  /* Sem fotografia: o recálculo, declarado como vivo. */
  if (!input.liveBlueprint) {
    return {
      profile: "YOUTUBE",
      frozen: false,
      blueprint: null,
      unavailableReason: "Ainda não há coleta suficiente para montar o blueprint competitivo.",
      sample: { label: "vídeo(s)", count: 0 },
    };
  }

  return {
    profile: "YOUTUBE",
    frozen: false,
    blueprint: buildRadarYoutubeCanonicalBlueprint({
      articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
      articleDnaContentHash: input.articleDnaContentHash ?? null,
      blueprint: input.liveBlueprint,
      multimodal: input.liveMultimodal || null,
      researchRefs: [{
        source: "YOUTUBE_SERP", role: "PRIMARY_COMPETITIVE_RESEARCH",
        ref: input.liveBlueprint.runId,
        fingerprint: input.liveBlueprint.runFingerprint,
        collectedAt: null,
        sampleSize: input.liveBlueprint.observed.universeSize,
      }],
      primaryKeyword: input.primaryKeyword,
      generatedAt: input.generatedAt,
      frozenAt: null,
    }),
    unavailableReason: null,
    sample: { label: "vídeo(s)", count: input.liveBlueprint.observed.universeSize },
  };
}
