/**
 * O DOSSIÊ DE TRABALHO DO ARTICLE — UMA UNIDADE, DUAS CAMADAS IMUTÁVEIS.
 *
 * O Planejador precisa receber o artigo inteiro: o que o Arquiteto formou e o
 * que o Radar provou. Para quem opera, isso é "o DNA completo de trabalho do
 * artigo". Tecnicamente são duas coisas, e é importante que continuem sendo:
 *
 *   ARTICLE_DNA aprovado          imutável, do Arquiteto
 *   + RADAR_EVIDENCE_BUNDLE       camada versionada de evidência, do Radar
 *   = ARTICLE_WORKING_DOSSIER     a unidade que o Planejador consome
 *
 * O Radar NÃO reescreve o ArticleDNA. Ele acrescenta uma camada amarrada a
 * `articleId + articleDnaVersionId + articleDnaContentHash` — e é esse vínculo
 * que impede a evidência de sobreviver ao fundamento que a originou. Sem ele,
 * um dossiê antigo pareceria atual para sempre, e o Planejador planejaria um
 * artigo que não existe mais.
 *
 * O QUE ISSO ENCERRA, RIO ABAIXO:
 *
 *   O PLANEJADOR NÃO PESQUISA DE NOVO. Ele compõe — estrutura, distribuição de
 *   conceitos, H2/H3, aplicação dos links já planejados, fontes, imagens, CTA,
 *   requisitos do especialista, instruções ao Redator. Descoberta competitiva
 *   já aconteceu e chega fundamentada.
 *
 *   O REDATOR NÃO REDESCOBRE NADA. Intenção, concorrência, conceitos, links,
 *   fontes e estrutura estratégica chegam decididos, com a evidência atrás.
 *
 * E nada sai daqui sem procedência: resumo sem origem é opinião com aparência
 * de dado, e é exatamente o que o Planejador não pode receber.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import { assertRadarEvidenceAuthority, radarSerpEvidenceStanding, type RadarEvidenceResolution, type RadarSerpStanding } from "./evidence-authority.ts";
import { assertRadarAiDiscoveryAuthority, type RadarAiDiscoveryContext } from "./ai-discovery-context.ts";

import type { RadarCompetitiveObservedModel } from "./competitive-observed-model.ts";
import { assertRadarVideoEvidenceLayer, type RadarVideoEvidenceLayer } from "./video-evidence.ts";
import { assertRadarSpecialistEvidenceLayer, type RadarSpecialistEvidenceLayer } from "./specialist-evidence.ts";

/* ============================== o vínculo =============================== */

/**
 * A que fundamento esta evidência pertence.
 *
 * Os três campos são obrigatórios porque cada um responde a uma pergunta
 * diferente: qual artigo, qual versão dele, e se o conteúdo daquela versão é
 * mesmo o que foi lido. Faltando qualquer um, o dossiê não pode ser entregue.
 */
export type RadarEvidenceBinding = {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash: string | null;
};

export type RadarEvidenceBundle = {
  binding: RadarEvidenceBinding;
  observedAt: string;
  /** A fotografia competitiva inteira — não um resumo dela. */
  observed: RadarCompetitiveObservedModel;
  /** A SERP tem precedência nesta investigação? A resposta viaja junto. */
  serpStanding: RadarSerpStanding;
  /** As divergências registradas, nenhuma resolvida em silêncio. */
  conflicts: RadarEvidenceResolution[];
  /** O que não foi possível observar. Ausência declarada, nunca omitida. */
  limitations: string[];
  /**
   * A EVIDÊNCIA AUDIOVISUAL — VIDEOS_3.5 · §5, e ela vive AQUI.
   *
   * Não dentro do ArticleDNA: o Radar não reescreve o que o Arquiteto
   * aprovou. A camada é opcional porque um artigo pode não ter pedido apoio
   * audiovisual, ou não ter casado ainda — e `null` diz isso sem inventar
   * uma execução vazia.
   */
  video: RadarVideoEvidenceLayer | null;
  /**
   * A EVIDÊNCIA PROFISSIONAL — SPECIALIST_3 · §9, e ela vive AQUI também.
   *
   * Pelo mesmo motivo da camada de vídeo: o Radar não reescreve o contrato que
   * o Arquiteto aprovou. O que um especialista respondeu ACRESCENTA evidência à
   * versão do ArticleDNA — não redefine o artigo.
   *
   * `null` quando nenhuma contribuição foi aceita ainda, o que é diferente de
   * uma camada vazia: `null` diz "não houve", a camada com `items: []` e
   * `notApproved: 3` diz "houve, e ninguém decidiu".
   */
  specialist: RadarSpecialistEvidenceLayer | null;
};

/* ============================ as invariantes ============================ */

/**
 * A evidência não pode andar solta.
 *
 * Este erro acontece cedo, na montagem — não tarde, quando o Planejador já
 * estiver compondo um artigo com a fotografia de outra versão.
 */
export function assertRadarEvidenceBinding(binding: RadarEvidenceBinding): void {
  if (!binding.brandId.trim()) throw new Error("RADAR_EVIDENCE_BINDING_MISSING_BRAND");
  if (!binding.articleId.trim()) throw new Error("RADAR_EVIDENCE_BINDING_MISSING_ARTICLE");
  if (!binding.articleDnaVersionId.trim()) throw new Error("RADAR_EVIDENCE_BINDING_MISSING_ARTICLE_DNA_VERSION");
}

/**
 * O dossiê carrega evidência, não conclusão sem origem.
 *
 * A checagem é sobre o que sai daqui: fotografia inteira, com identidade, com
 * procedência das camadas, e com as limitações declaradas. Um `summary` sem
 * nada disso passaria despercebido rio abaixo e viraria decisão editorial.
 */
export function assertRadarEvidenceProvenance(bundle: RadarEvidenceBundle): void {
  assertRadarEvidenceBinding(bundle.binding);

  const identidade = bundle.observed.identity;
  if (identidade.articleId !== bundle.binding.articleId) throw new Error("RADAR_EVIDENCE_BUNDLE_ARTICLE_MISMATCH");
  if (identidade.articleDnaVersionId !== bundle.binding.articleDnaVersionId) throw new Error("RADAR_EVIDENCE_BUNDLE_ARTICLE_DNA_MISMATCH");
  if (identidade.articleDnaContentHash !== bundle.binding.articleDnaContentHash) throw new Error("RADAR_EVIDENCE_BUNDLE_ARTICLE_DNA_HASH_MISMATCH");

  /*
   * A CAMADA DE DESCOBERTA VIAJA AMARRADA AO MESMO FUNDAMENTO.
   *
   * Ela carrega o próprio vínculo porque é ela que chega ao Planejador como
   * lista de exigências. Um contexto de descoberta apontando para outra versão
   * do ArticleDNA passaria despercebido — e viraria requisito de um artigo que
   * não existe mais.
   */
  const descoberta = bundle.observed.aiDiscovery;
  if (descoberta.binding.articleId !== bundle.binding.articleId) throw new Error("RADAR_EVIDENCE_BUNDLE_DISCOVERY_ARTICLE_MISMATCH");
  if (descoberta.binding.articleDnaVersionId !== bundle.binding.articleDnaVersionId) throw new Error("RADAR_EVIDENCE_BUNDLE_DISCOVERY_ARTICLE_DNA_MISMATCH");
  if (descoberta.binding.articleDnaContentHash !== bundle.binding.articleDnaContentHash) throw new Error("RADAR_EVIDENCE_BUNDLE_DISCOVERY_ARTICLE_DNA_HASH_MISMATCH");
  assertRadarAiDiscoveryAuthority(descoberta);

  /* A camada bruta precisa continuar alcançável a partir do que é entregue. */
  if (!bundle.observed.evidence.comparison) throw new Error("RADAR_EVIDENCE_BUNDLE_WITHOUT_COMPARISON");
  if (bundle.observed.sample.comparablePages > 0 && !bundle.observed.evidence.structural) {
    throw new Error("RADAR_EVIDENCE_BUNDLE_WITHOUT_STRUCTURAL_EVIDENCE");
  }

  for (const conflito of bundle.conflicts) assertRadarEvidenceAuthority(conflito);

  /*
   * A CAMADA DE VÍDEO SEGUE A MESMA REGRA DAS OUTRAS: ou está íntegra, ou
   * não sai daqui. Trecho sem âncora, resultado sem pauta ou execução sem
   * identidade chegariam ao Planejador como evidência que ninguém confere.
   */
  if (bundle.video) assertRadarVideoEvidenceLayer(bundle.video);

  /*
   * A CAMADA DE ESPECIALISTA TAMBÉM PRECISA APONTAR PARA ESTE FUNDAMENTO.
   *
   * Ela é a única cujo conteúdo é a fala de uma pessoa identificada. Uma camada
   * amarrada a outra versão do ArticleDNA chegaria ao Planejador como opinião
   * profissional sobre um artigo que já mudou — com nome e data, o que é pior
   * do que um dado anônimo desatualizado.
   */
  if (bundle.specialist) {
    assertRadarSpecialistEvidenceLayer(bundle.specialist);
    if (bundle.specialist.binding.articleId !== bundle.binding.articleId) throw new Error("RADAR_EVIDENCE_BUNDLE_SPECIALIST_ARTICLE_MISMATCH");
    if (bundle.specialist.binding.articleDnaVersionId !== bundle.binding.articleDnaVersionId) throw new Error("RADAR_EVIDENCE_BUNDLE_SPECIALIST_ARTICLE_DNA_MISMATCH");
    if (bundle.specialist.binding.articleDnaContentHash !== bundle.binding.articleDnaContentHash) throw new Error("RADAR_EVIDENCE_BUNDLE_SPECIALIST_ARTICLE_DNA_HASH_MISMATCH");
  }
}

/* ============================== a montagem ============================== */

export function buildRadarEvidenceBundle(input: {
  observed: RadarCompetitiveObservedModel;
  /** A camada audiovisual daquela rodada, quando houve casamento. */
  video?: RadarVideoEvidenceLayer | null;
  /** A camada profissional, quando alguém aceitou alguma contribuição. */
  specialist?: RadarSpecialistEvidenceLayer | null;
  /** A investigação está vigente e a amostra sustenta leitura de mercado? */
  serp: { current: boolean; sufficient: boolean; valid: boolean };
  conflicts?: readonly RadarEvidenceResolution[];
}): RadarEvidenceBundle {
  const identidade = input.observed.identity;
  const binding: RadarEvidenceBinding = {
    brandId: identidade.brandId,
    articleId: identidade.articleId,
    articleDnaVersionId: identidade.articleDnaVersionId,
    articleDnaContentHash: identidade.articleDnaContentHash,
  };
  assertRadarEvidenceBinding(binding);

  const bundle: RadarEvidenceBundle = {
    binding,
    observedAt: identidade.observedAt,
    observed: input.observed,
    serpStanding: radarSerpEvidenceStanding(input.serp),
    conflicts: [...(input.conflicts || [])],
    limitations: [...input.observed.limitations],
    video: input.video || null,
    specialist: input.specialist || null,
  };

  assertRadarEvidenceProvenance(bundle);
  return bundle;
}

/**
 * O CONTEXTO DE DESCOBERTA DO DOSSIÊ — sem uma segunda cópia dele.
 *
 * Ele vive na fotografia competitiva, porque é dela que deriva. O acessório
 * existe para o Planejador não precisar saber onde: duplicá-lo no envelope
 * criaria duas verdades envelhecendo em ritmos diferentes, que é exatamente o
 * que este módulo existe para impedir.
 */
export const radarEvidenceBundleAiDiscovery = (bundle: RadarEvidenceBundle): RadarAiDiscoveryContext =>
  bundle.observed.aiDiscovery;

/**
 * O dossiê ainda descreve o artigo que o Planejador tem em mãos?
 *
 * Comparar versão E hash: a versão diz que é o mesmo contrato, o hash diz que
 * o conteúdo dele não mudou por baixo. Uma sem a outra deixa passar exatamente
 * o caso que interessa.
 */
export function radarEvidenceBundleMatchesArticle(bundle: RadarEvidenceBundle, article: {
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash: string | null;
}): { matches: boolean; reason: string } {
  if (bundle.binding.articleId !== article.articleId) {
    return { matches: false, reason: "O dossiê pertence a outro artigo." };
  }
  if (bundle.binding.articleDnaVersionId !== article.articleDnaVersionId) {
    return { matches: false, reason: `O dossiê foi montado sobre a versão ${bundle.binding.articleDnaVersionId} do ArticleDNA, e a versão corrente é ${article.articleDnaVersionId}.` };
  }
  if (bundle.binding.articleDnaContentHash !== article.articleDnaContentHash) {
    return { matches: false, reason: "A versão é a mesma, mas o conteúdo do ArticleDNA mudou desde a investigação." };
  }
  return { matches: true, reason: "O dossiê descreve exatamente esta versão do ArticleDNA." };
}
