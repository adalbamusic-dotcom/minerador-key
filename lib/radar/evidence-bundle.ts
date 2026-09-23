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
import type { RadarKeywordContext } from "./keyword-context.ts";
import { assertRadarVideoEvidenceLayer, type RadarVideoEvidenceLayer } from "./video-evidence.ts";
import { assertRadarSpecialistEvidenceLayer, type RadarSpecialistEvidenceLayer } from "./specialist-evidence.ts";
import type { RadarCompetitiveBlueprint, RadarResearchRef } from "./competitive-blueprint.ts";
import type { RadarResearchProfile } from "./research-profile.ts";
import type { RadarResearchSource } from "./search-mode.ts";
import type { RadarFrozenSerpLensBlock } from "./serp/frozen-lenses.ts";

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

/* ===================== §4 e §5 · as camadas de pesquisa ===================== */

/**
 * PRIMÁRIA OU APOIO — e a diferença não é decorativa.
 *
 * Num artigo de vídeo, o Google foi lido UMA vez para fortalecer a leitura do
 * YouTube. Representá-lo como `research.google` primária faria o Planejador
 * acreditar que houve investigação competitiva de páginas — e ele planejaria
 * sobre uma amostra de dez links azuis que ninguém curou.
 */
export type RadarResearchLayerRole = "PRIMARY" | "SUPPORT";

export type RadarResearchLayer = {
  role: RadarResearchLayerRole;
  /** §3 · quando a fotografia que sustenta esta camada foi tirada. */
  frozenAt: string | null;
  /**
   * §15 · REFERÊNCIAS, NUNCA MATÉRIA-PRIMA.
   *
   * `runId`, `snapshotId`, assinatura e tamanho da amostra. O universo
   * competitivo continua tendo autoridade própria onde ele mora — copiá-lo
   * aqui repetiria o erro que custou 88% de uma fotografia de YouTube.
   */
  refs: RadarResearchRef[];
  /** Contagens congeladas: a leitura não depende de reabrir a coleta. */
  counts: { queries: number; items: number };
  /** §14 · o que esta camada NÃO alcançou. */
  limitations: string[];
};

/**
 * §8 · O SINAL CROSS-SERP — competitivo, nunca factual.
 *
 * "Este vídeo vence no YouTube e no Google" descreve distribuição, não
 * qualidade nem verdade sobre o tema. O Planejador recebe o sinal com o nome
 * dele para não o promover a fato.
 */
export type RadarBundleCrossSerp = {
  signals: Array<{ signal: "CROSS_PLATFORM" | "YOUTUBE_ONLY" | "GOOGLE_ONLY"; count: number }>;
  /** As fontes que sustentam a leitura cruzada. Sem as duas, não há cruzamento. */
  sources: string[];
};

/**
 * §7 · O QUE O RADAR RECOMENDA PRODUZIR — com origem, sempre.
 *
 * O Planejador pode priorizar e integrar. O que ele não pode é tratar isto
 * como observação factual: `sourceSignals` é o que impede a confusão, e por
 * isso ele viaja mesmo quando a lista tem um item só.
 */
export type RadarBundleEditorialOutput = {
  output: string;
  objective: string;
  reason: string;
  sourceSignals: string[];
};

/**
 * ============ A VERSÃO DO CONTRATO DE EVIDÊNCIA ============
 *
 * V3 é o que o Planejador consome. A diferença para as anteriores não é
 * cosmética: o núcleo deixou de ser a fotografia do Google e passou a ser
 * PERFIL + CAMADAS, porque um artigo de vídeo e um de produto nunca tiveram
 * `RadarCompetitiveObservedModel` — e o handoff os recusava por isso.
 */
export const RADAR_EVIDENCE_BUNDLE_VERSION = 3 as const;

export type RadarEvidenceBundle = {
  bundleVersion: typeof RADAR_EVIDENCE_BUNDLE_VERSION;
  /**
   * §20 · IDENTIDADE PRÓPRIA — e é ela que torna o handoff idempotente.
   *
   * Não é o id do artigo nem o da versão da análise: é o hash do CONTEÚDO
   * consolidado. Dois envios do mesmo dossiê produzem a mesma identidade; um
   * dossiê que mudou de verdade produz outra, e a versão sobe.
   */
  bundleId: string;
  bundleHash: string;
  binding: RadarEvidenceBinding;
  observedAt: string;
  /** §5 · como investigamos. Diferente de `editorialOutputs`, que é o que produzir. */
  primaryResearchProfile: RadarResearchProfile;
  researchSources: RadarResearchSource[];
  /**
   * §4 · cada camada é OPCIONAL e sustentada por evidência real.
   *
   * `null` diz "esta fonte não foi investigada", que é diferente de uma camada
   * vazia dizendo "investigamos e não achamos nada".
   */
  research: {
    google: RadarResearchLayer | null;
    youtube: RadarResearchLayer | null;
    amazon: RadarResearchLayer | null;
  };
  /** §6 · a fotografia editorial canônica, já construída. Nunca recalculada aqui. */
  competitiveBlueprint: RadarCompetitiveBlueprint | null;
  crossSerp: RadarBundleCrossSerp | null;
  editorialOutputs: RadarBundleEditorialOutput[];
  /**
   * A FOTOGRAFIA DO PIPELINE DO GOOGLE — e SÓ ele a produz.
   *
   * Era o núcleo obrigatório do dossiê, e era por isso que YouTube e Amazon
   * não conseguiam entregar nada: eles nunca tiveram este modelo. Ele continua
   * inteiro quando existe; `null` é a verdade sobre um artigo de vídeo, não
   * uma lacuna a preencher com snapshot fabricado (§17).
   */
  observed: RadarCompetitiveObservedModel | null;
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
  /**
   * ===== O CONTEXTO DE KEYWORD — KEYWORD_CONTEXT_1 · §1 e §2 =====
   *
   * O texto da keyword principal só era alcançável na identidade da fotografia
   * competitiva do Google. Num artigo de vídeo ou de produto ela nunca
   * existiu, e o Planejador ficava com título e slug — nenhum dos dois é a
   * keyword.
   *
   * ADITIVO E OPCIONAL de propósito (§1 e §5): o contrato continua V3, e todo
   * dossiê gravado antes deste gate continua íntegro. A chave ausente não
   * entra na serialização canônica, então o hash daqueles pacotes não muda —
   * e quem os lê resolve pelo fundamento que o vínculo do dossiê identifica.
   */
  keywordContext?: RadarKeywordContext | null;
  /**
   * ===== AS QUATRO LENTES DA SERP — SDD do Radar, R3 =====
   *
   * A cópia que o FINALIZE gravou no bundle congelado, entregue como está: o
   * Planejador e o Redator leem o que cada aparelho observou sem chamar
   * provider nem ler cache (invariante 50). Sem digest bruto.
   *
   * ADITIVO E OPCIONAL, como `keywordContext`: ausente quando a investigação
   * congelada não tem lentes, e o hash de todo dossiê anterior não muda.
   */
  serpLenses?: RadarFrozenSerpLensBlock;
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

  /*
   * ============ §2 · A IDENTIDADE É VERIFICADA SEMPRE ============
   *
   * A fotografia do Google pode não existir — num artigo de vídeo ou de
   * produto ela nunca existiu. O VÍNCULO, não: ele é o que impede evidência
   * de sobreviver ao fundamento que a originou, e vale para os três perfis.
   */
  const observado = bundle.observed;
  if (observado) {
    const identidade = observado.identity;
    if (identidade.articleId !== bundle.binding.articleId) throw new Error("RADAR_EVIDENCE_BUNDLE_ARTICLE_MISMATCH");
    if (identidade.articleDnaVersionId !== bundle.binding.articleDnaVersionId) throw new Error("RADAR_EVIDENCE_BUNDLE_ARTICLE_DNA_MISMATCH");
    if (identidade.articleDnaContentHash !== bundle.binding.articleDnaContentHash) throw new Error("RADAR_EVIDENCE_BUNDLE_ARTICLE_DNA_HASH_MISMATCH");
  }

  /*
   * A CAMADA DE DESCOBERTA VIAJA AMARRADA AO MESMO FUNDAMENTO.
   *
   * Ela carrega o próprio vínculo porque é ela que chega ao Planejador como
   * lista de exigências. Um contexto de descoberta apontando para outra versão
   * do ArticleDNA passaria despercebido — e viraria requisito de um artigo que
   * não existe mais.
   */
  if (observado) {
    const descoberta = observado.aiDiscovery;
    if (descoberta.binding.articleId !== bundle.binding.articleId) throw new Error("RADAR_EVIDENCE_BUNDLE_DISCOVERY_ARTICLE_MISMATCH");
    if (descoberta.binding.articleDnaVersionId !== bundle.binding.articleDnaVersionId) throw new Error("RADAR_EVIDENCE_BUNDLE_DISCOVERY_ARTICLE_DNA_MISMATCH");
    if (descoberta.binding.articleDnaContentHash !== bundle.binding.articleDnaContentHash) throw new Error("RADAR_EVIDENCE_BUNDLE_DISCOVERY_ARTICLE_DNA_HASH_MISMATCH");
    assertRadarAiDiscoveryAuthority(descoberta);

    /* A camada bruta precisa continuar alcançável a partir do que é entregue. */
    if (!observado.evidence.comparison) throw new Error("RADAR_EVIDENCE_BUNDLE_WITHOUT_COMPARISON");
    if (observado.sample.comparablePages > 0 && !observado.evidence.structural) {
      throw new Error("RADAR_EVIDENCE_BUNDLE_WITHOUT_STRUCTURAL_EVIDENCE");
    }
  }

  /*
   * ============ §4 · A CAMADA PRIMÁRIA PRECISA EXISTIR ============
   *
   * O perfil declara COMO investigamos. Um dossiê que diz "primária: AMAZON"
   * sem camada da Amazon descreveria uma investigação que não aconteceu — e a
   * ausência passaria despercebida, porque o nome do perfil já soa suficiente.
   */
  const primaria = bundle.research[bundle.primaryResearchProfile.toLowerCase() as "google" | "youtube" | "amazon"];
  if (!primaria) throw new Error("RADAR_EVIDENCE_BUNDLE_PRIMARY_LAYER_MISSING");
  if (primaria.role !== "PRIMARY") throw new Error("RADAR_EVIDENCE_BUNDLE_PRIMARY_LAYER_ROLE");

  /*
   * §4 · E NENHUMA OUTRA CAMADA PODE SE DIZER PRIMÁRIA.
   *
   * O apoio do Google num artigo de vídeo é camada de apoio. Marcá-lo como
   * primário faria o Planejador acreditar que houve investigação competitiva
   * de páginas — sobre dez links azuis que ninguém curou.
   */
  for (const [fonte, camada] of Object.entries(bundle.research)) {
    if (!camada || fonte === bundle.primaryResearchProfile.toLowerCase()) continue;
    if (camada.role === "PRIMARY") throw new Error("RADAR_EVIDENCE_BUNDLE_DUPLICATE_PRIMARY_LAYER");
  }

  /*
   * §7 · TODA RECOMENDAÇÃO DE SAÍDA DECLARA A ORIGEM.
   *
   * Sem `sourceSignals`, uma sugestão editorial chega ao Planejador com a
   * mesma aparência de uma contagem de SERP.
   */
  for (const saida of bundle.editorialOutputs) {
    if (!saida.sourceSignals.length) throw new Error("RADAR_EVIDENCE_BUNDLE_OUTPUT_WITHOUT_SOURCE");
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
  /** §3 · quando o pipeline do Google congelou esta investigação. */
  frozenAt?: string | null;
  /** §15 · as referências da coleta. Nunca a matéria-prima dela. */
  researchRefs?: readonly RadarResearchRef[];
  /** §6 · a fotografia editorial canônica, quando o adapter já a montou. */
  competitiveBlueprint?: RadarCompetitiveBlueprint | null;
  editorialOutputs?: readonly RadarBundleEditorialOutput[];
}): RadarEvidenceBundle {
  const identidade = input.observed.identity;
  const binding: RadarEvidenceBinding = {
    brandId: identidade.brandId,
    articleId: identidade.articleId,
    articleDnaVersionId: identidade.articleDnaVersionId,
    articleDnaContentHash: identidade.articleDnaContentHash,
  };
  assertRadarEvidenceBinding(binding);

  /*
   * ============ §16 · ESTE É O ADAPTER DO PERFIL GOOGLE ============
   *
   * Ele deixou de ser o handoff: é uma das três portas internas que alimentam
   * `buildRadarEvidenceBundleV3`. Continua existindo porque o pipeline do
   * Google tem material que os outros dois não têm — a fotografia competitiva
   * inteira — e traduzi-lo aqui evita que o builder único precise conhecer a
   * forma de três investigações diferentes.
   */
  return buildRadarEvidenceBundleV3({
    binding,
    observedAt: identidade.observedAt,
    primaryResearchProfile: "GOOGLE",
    researchSources: ["WEB_SERP"],
    research: {
      google: {
        role: "PRIMARY",
        frozenAt: input.frozenAt ?? null,
        refs: input.researchRefs ? [...input.researchRefs] : [],
        counts: { queries: input.observed.sample.queriesExecuted, items: input.observed.sample.comparablePages },
        limitations: [...input.observed.limitations],
      },
      youtube: null,
      amazon: null,
    },
    competitiveBlueprint: input.competitiveBlueprint ?? null,
    crossSerp: null,
    editorialOutputs: input.editorialOutputs ? [...input.editorialOutputs] : [],
    observed: input.observed,
    serpStanding: radarSerpEvidenceStanding(input.serp),
    conflicts: [...(input.conflicts || [])],
    limitations: [...input.observed.limitations],
    video: input.video || null,
    specialist: input.specialist || null,
  });
}

/* ===================== §20 · a identidade do dossiê ===================== */

function assinaturaDoDossie(valor: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < valor.length; index += 1) {
    hash ^= valor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Serialização estável: o mesmo conteúdo produz sempre o mesmo texto. */
function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor) ?? "null";
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  const entradas = Object.entries(valor as Record<string, unknown>)
    /* A própria identidade fica de fora: ela é o resultado, não a entrada. */
    .filter(([chave]) => chave !== "bundleId" && chave !== "bundleHash")
    .sort(([esquerda], [direita]) => esquerda.localeCompare(direita));
  return `{${entradas.map(([chave, item]) => `${JSON.stringify(chave)}:${canonico(item)}`).join(",")}}`;
}

/**
 * ============ A IDENTIDADE DO CONTEÚDO — §20 ============
 *
 * Dois dossiês montados a partir da MESMA investigação produzem o mesmo hash,
 * ainda que em momentos diferentes. É isso que faz o segundo envio ao
 * Planejador ser reconhecido como o mesmo pacote, em vez de virar uma segunda
 * entrega com outro nome.
 *
 * E uma investigação que mudou de verdade produz outro hash — aí a versão
 * sobe, explicitamente.
 */
export function radarEvidenceBundleIdentity(bundle: Omit<RadarEvidenceBundle, "bundleId" | "bundleHash">): { bundleId: string; bundleHash: string } {
  const assinatura = assinaturaDoDossie(canonico(bundle));
  return { bundleId: `bundle:${assinatura}`, bundleHash: `bundle-hash:${assinatura}` };
}

/* ========================= §16 · O BUILDER ÚNICO ========================= */

/**
 * ============ O DOSSIÊ V3 — UMA AUTORIDADE, TRÊS PERFIS ============
 *
 * Tudo o que sai daqui já existia: o fundamento veio do Arquiteto, as camadas
 * vieram das investigações congeladas, as limitações vieram de cada rodada.
 * Este builder amarra, verifica, nomeia — e recusa quando não fecha.
 *
 * NÃO existem `buildGooglePlannerPackage`, `buildYoutubePlannerPackage` e
 * `buildAmazonPlannerPackage`: três handoffs paralelos divergiriam na primeira
 * semana, e o Planejador teria de aprender três dialetos para a mesma
 * pergunta. Adapters por perfil existem — e desembocam AQUI.
 */
export function buildRadarEvidenceBundleV3(
  input: Omit<RadarEvidenceBundle, "bundleVersion" | "bundleId" | "bundleHash">,
): RadarEvidenceBundle {
  assertRadarEvidenceBinding(input.binding);

  const semIdentidade = { ...input, bundleVersion: RADAR_EVIDENCE_BUNDLE_VERSION };
  const bundle: RadarEvidenceBundle = { ...semIdentidade, ...radarEvidenceBundleIdentity(semIdentidade) };

  assertRadarEvidenceProvenance(bundle);
  return bundle;
}

/**
 * O dossiê ainda é o que diz ser?
 *
 * Recalcula a identidade sobre o conteúdo declarado. Um pacote que atravessou
 * a rede e chegou diferente não passa por aqui calado — que é o que torna o
 * readback de §19 uma prova, e não uma esperança.
 */
export function assertRadarEvidenceBundleIntegrity(bundle: RadarEvidenceBundle): void {
  if (bundle.bundleVersion !== RADAR_EVIDENCE_BUNDLE_VERSION) throw new Error("RADAR_EVIDENCE_BUNDLE_VERSION_MISMATCH");
  const { bundleId: _id, bundleHash: _hash, ...conteudo } = bundle;
  const esperada = radarEvidenceBundleIdentity(conteudo);
  if (esperada.bundleId !== bundle.bundleId) throw new Error("RADAR_EVIDENCE_BUNDLE_ID_MUTATED");
  if (esperada.bundleHash !== bundle.bundleHash) throw new Error("RADAR_EVIDENCE_BUNDLE_MUTATED");
  assertRadarEvidenceProvenance(bundle);
}

/**
 * O CONTEXTO DE DESCOBERTA DO DOSSIÊ — sem uma segunda cópia dele.
 *
 * Ele vive na fotografia competitiva, porque é dela que deriva. O acessório
 * existe para o Planejador não precisar saber onde: duplicá-lo no envelope
 * criaria duas verdades envelhecendo em ritmos diferentes, que é exatamente o
 * que este módulo existe para impedir.
 */
export const radarEvidenceBundleAiDiscovery = (bundle: RadarEvidenceBundle): RadarAiDiscoveryContext | null =>
  bundle.observed?.aiDiscovery ?? null;

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
