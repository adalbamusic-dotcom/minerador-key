import type { ArticleDNA, SiloDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import type { SerpCollectionRecord, SerpReviewRecord } from "../editorial/contracts.ts";
import { normalizeSerpCacheKeyword } from "../editorial/serp-cache.ts";
import type { RadarAnalysisVersion } from "./analysis-contracts.ts";
import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type { RadarEvidenceBundle } from "./evidence-bundle.ts";
import { radarFrozenObservedAtOfAnalysis } from "./evidence-bundle-runtime.ts";
import { radarFrozenSerpStandingOf } from "./investigation-finalization.ts";
import type { RadarKeywordContext } from "./keyword-context.ts";
import type { RadarHandoffReadiness } from "./handoff-readiness.ts";
import type { RadarPortableDossierGapsInput } from "./portable-dossier-gaps.ts";
import {
  buildRadarPortableExportRow,
  radarPortableExportCsv,
  type RadarPortableExportInput,
  type RadarPortableExportRow,
} from "./portable-export.ts";
import {
  radarPortableLinkedSerpRecord,
  radarPortableNewerSerpCollection,
  radarPortableResearchLimitations,
  type RadarPortableFrozenLensesInput,
  type RadarPortableNewerSerpCollection,
  type RadarPortableSerpLensKeyword,
  type RadarPortableSerpLensLookup,
  type RadarPortableSerpObservedInput,
} from "./portable-serp-observed.ts";
import {
  radarSiloMemberDescriptorsOfArticleDnas,
  type RadarSiloExportMember,
  type RadarSiloExportMemberDescriptor,
  type RadarSiloExportPlan,
} from "./portable-silo-export.ts";
import { latestRadarR5SerpReview } from "./r5-sequential.ts";
import type { RadarResearchProfile } from "./research-profile.ts";
import type { RadarVideoExportYoutube } from "./portable-video-export.ts";
import type { RadarVideoLensOrganicReading } from "./video-competitive.ts";
import { radarArticleBlueprintColumns, radarArticleBlueprintReading, type RadarArticleBlueprintPayload } from "./article-blueprint.ts";
import type { RadarPortableExportBlueprint } from "./portable-export.ts";
import type { RadarAmazonCommercialBlock } from "./amazon-commercial-block.ts";
import { radarWritingBlueprintExclusions, radarWritingProjections, radarWritingRowNeedsBlueprint } from "./portable-writing-export.ts";
import { radarClaimCommonStems, radarPendingClaims } from "./pending-claims.ts";

/**
 * ===== A MONTAGEM DO LOTE DO EXPORT PORTÁTIL — as pontes puras da rota =====
 *
 * ==================== POR QUE ESTE ARQUIVO EXISTE ====================
 *
 * A rota `app/api/editorial/radar-export` lê o banco; os módulos
 * `portable-serp-observed`, `portable-dossier-gaps` e `portable-silo-export`
 * projetam. Entre os dois fica uma escolha que precisa de teste: QUAL snapshot,
 * QUAL revisão, QUAIS decisões, QUAIS keywords, QUAL silo. Deixá-la dentro da
 * rota só seria testável com banco — e regra de negócio escondida atrás de I/O
 * é regra que ninguém protege.
 *
 * Aqui ela é pura: recebe o que a rota já leu e devolve as entradas das
 * colunas novas. A rota só chama.
 *
 * ==================== O QUE NÃO SE FAZ AQUI ====================
 *
 * Nenhuma leitura, nenhum relógio, nenhuma coleta. A leitura do cache de SERP
 * é injetada (`radarPortableExportReadLenses`), e é por isso que a falha dela
 * pode ser provada sem banco: ela vira "cache indisponível" na coluna, nunca
 * um export derrubado.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

/* ============================== a SERP do artigo ============================== */

type PayloadDaAnalise = RadarAnalysisVersion["payload"];

/**
 * ===== A SERP OBSERVADA: a que o DOSSIÊ referencia, nunca "a mais recente" =====
 *
 * O `observed` do Google é montado sobre o snapshot mais recente; o dossiê
 * congelado referencia o da análise (`research.google.refs`). No YouTube e na
 * Amazon, a mesma camada aponta para o snapshot de APOIO. A coluna descreve a
 * SERP que a investigação analisou, e avisa quando há coleta posterior.
 *
 * ==================== A CURADORIA SÓ ONDE ELA DESCREVE ESTA SERP ====================
 *
 * `serpDecisions` são chaves POSICIONAIS da SERP canônica da análise. Numa
 * SERP de apoio, a posição 3 é outra página — aplicar a decisão ali diria que
 * alguém aprovou o que ninguém viu. Por isso a curadoria só atravessa quando a
 * camada é a principal e o registro vinculado é o da análise.
 */
export function radarPortableExportSerpObservedInput(input: {
  /** Os snapshots já lidos pela rota (`SerpSnapshotRepository.list`), o lote inteiro. */
  records: readonly SerpCollectionRecord[];
  articleId: string;
  bundle: Pick<RadarEvidenceBundle, "research">;
  /**
   * O payload INTEIRO da análise corrente: além da curadoria e das consultas,
   * o instante do congelamento é lido do perfil que manda (Amazon, YouTube ou
   * Google), pela mesma função de `research_status_md`.
   */
  analysis: Pick<PayloadDaAnalise, "serpDecisions" | "deepResearch" | "serpSnapshotId">;
  /** `listReviews(brandId)`, uma leitura por lote. */
  reviews: readonly SerpReviewRecord[];
  /** `false` quando a leitura das revisões falhou: a coluna diz "não lida", nunca "aguardando". */
  reviewsReadable: boolean;
}): RadarPortableSerpObservedInput {
  const camada = input.bundle.research.google;
  const { record, issue } = radarPortableLinkedSerpRecord(input.records, camada);
  const daAnalise = Boolean(record && input.analysis.serpSnapshotId
    && (record.id === input.analysis.serpSnapshotId || record.research?.id === input.analysis.serpSnapshotId));

  return {
    snapshot: record?.research ?? null,
    unavailableReason: issue,
    serpRole: camada?.role ?? null,
    /*
     * O CONGELAMENTO É O DA INVESTIGAÇÃO, não o da camada.
     *
     * Na SERP de apoio (YouTube/Amazon), `camada.frozenAt` é a data da COLETA
     * de apoio (`camadaDeApoioDoGoogle` grava `collectedAt` ali). A coluna
     * dizia "Congelamento da investigação: <data da coleta de apoio>", e a
     * mesma linha trazia outra data em `research_status_md`. Agora as duas
     * saem da mesma função. Na principal do Google elas já coincidiam; a
     * camada só responde quando a análise não gravou o instante.
     */
    frozenAt: radarFrozenObservedAtOfAnalysis(input.analysis) ?? (camada?.role === "PRIMARY" ? camada.frozenAt ?? null : null),
    review: record ? latestRadarR5SerpReview([...input.reviews], record.id) : null,
    reviewReadable: input.reviewsReadable,
    serpDecisions: camada?.role === "PRIMARY" && daAnalise ? input.analysis.serpDecisions || [] : [],
    deepResearchQueries: input.analysis.deepResearch?.queries ?? [],
    newerCollection: radarPortableNewerSerpCollection(input.records, input.articleId, record),
  };
}

/* ============================ as lacunas do dossiê ============================ */

/**
 * ===== O QUE O REDATOR LÊ DO DOSSIÊ E O CSV NÃO DIZIA =====
 *
 * A prontidão é a MESMA que o Redator usa para recusar (`dossier.readiness`),
 * mais a identidade do ArticleDNA (versão e impressão), que ele também exige.
 *
 * `serpStandingFrozen`: só o Google grava a situação da SERP no congelamento.
 * No YouTube e na Amazon o dossiê carrega o valor PADRÃO, que não é avaliação
 * de ninguém — e a célula diz isso em vez de apresentá-lo como veredito.
 */
export function radarPortableExportDossierGapsInput(input: {
  /**
   * O payload INTEIRO da análise corrente: o instante do congelamento é lido
   * do perfil que manda (Amazon, YouTube ou Google), como no envio ao Redator.
   */
  analysis: { finalizedBundle?: unknown };
  profile: RadarResearchProfile;
  bundle: RadarEvidenceBundle;
  readiness: RadarHandoffReadiness;
  article: { articleDnaVersionId: string | null | undefined; articleDnaContentHash: string | null | undefined };
  exportedAt: string;
  /**
   * A coleta de SERP posterior à investigação, quando existe
   * (`serpObserved.newerCollection`). As colunas de evidência saem do
   * `observed`, que é montado sobre a coleta MAIS RECENTE — e a célula da
   * situação precisa dizer isso, não só a coluna da SERP.
   */
  newerSerpCollection?: RadarPortableNewerSerpCollection | null;
}): RadarPortableDossierGapsInput {
  return {
    status: {
      frozenObservedAt: radarFrozenObservedAtOfAnalysis(input.analysis),
      bundle: input.bundle,
      readiness: input.readiness,
      articleDnaIdentityComplete: Boolean(input.article.articleDnaVersionId && input.article.articleDnaContentHash),
      serpStandingFrozen: input.profile === "GOOGLE" ? radarFrozenSerpStandingOf(input.analysis.finalizedBundle) !== null : false,
      exportedAt: input.exportedAt,
      newerSerpCollection: input.newerSerpCollection ?? null,
      /* As lentes do pacote: o mesmo dossiê, a mesma régua de `serp_lenses_*`. */
      frozenLenses: {
        profile: input.profile,
        // R3 (2026-09-28): com o Google finalizado, o dossiê de YouTube ou
        // Amazon também traz as lentes do Google, como apoio.
        block: input.bundle.serpLenses ?? null,
        frozenAt: radarFrozenObservedAtOfAnalysis(input.analysis),
      },
    },
    observed: input.bundle.observed,
  };
}

/* ============================ as lentes do pacote ============================ */

/**
 * ===== AS LENTES QUE O PACOTE ENTREGA AO REDATOR, PARA A COLUNA DE LENTES =====
 *
 * A cópia é a do DOSSIÊ (`bundle.serpLenses`): o mesmo bloco que o Planejador
 * e o Redator recebem, lido do bundle congelado (no YouTube e na Amazon, só
 * quando o Google finalizado viaja como apoio, R3 de 2026-09-28). Nada de
 * cache nem de snapshot vivo — o cache entra na mesma coluna, depois, como
 * observação fora do pacote.
 *
 * Os snapshots já lidos pela rota servem só para dar NOME à consulta canônica
 * congelada (o bloco guarda o id dela, que não sai) e para dizer se ela é a
 * mesma SERP de `serp_observed_md`. A coleta só vale quando id E assinatura
 * batem com o bloco: registro com o mesmo id e outro conteúdo não é a SERP
 * que o pacote congelou.
 */
export function radarPortableExportFrozenLensesInput(input: {
  profile: RadarResearchProfile;
  bundle: Pick<RadarEvidenceBundle, "serpLenses" | "research">;
  /** O payload da análise corrente: o instante do congelamento sai dele. */
  analysis: unknown;
  records?: readonly SerpCollectionRecord[];
}): RadarPortableFrozenLensesInput {
  // R3 (2026-09-28): YouTube e Amazon só acrescentam; as lentes do Google, quando o dossiê as traz, saem.
  const block = input.bundle.serpLenses ?? null;
  const base = { profile: input.profile, block, frozenAt: radarFrozenObservedAtOfAnalysis(input.analysis) };
  if (!block?.canonicalSnapshotId) return base;

  const ehACongelada = (registro: SerpCollectionRecord | null | undefined): registro is SerpCollectionRecord & { research: NonNullable<SerpCollectionRecord["research"]> } =>
    Boolean(registro?.research
      && (registro.id === block.canonicalSnapshotId || registro.research.id === block.canonicalSnapshotId)
      && registro.research.contentHash === block.canonicalSnapshotHash);
  const congelada = (input.records || []).find(ehACongelada) ?? null;
  const vinculada = radarPortableLinkedSerpRecord(input.records || [], input.bundle.research.google).record;
  return {
    ...base,
    canonicalQuery: congelada?.research.query ?? null,
    sameSerpAsObserved: vinculada ? ehACongelada(vinculada) : null,
  };
}

/**
 * As limitações do dossiê para o CSV: as que o congelamento escreveu sobre as
 * lentes saem portáteis (sem o motivo cru da coleta); as outras, como estão.
 */
export function radarPortableExportResearchLimitations(bundle: Pick<RadarEvidenceBundle, "limitations" | "serpLenses">): string[] {
  return radarPortableResearchLimitations(bundle.limitations, bundle.serpLenses);
}

/* ============================== a SERP por lente ============================== */

/* Sem acento: serve SÓ para achar o id da keyword quando o texto exato não casa. */
const normalizar = (valor: string) =>
  valor.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/* Espaço colapsado: a mesma limpeza do pedido ao cache (`radarPortableSerpLensRequests`). */
const colapsado = (valor: string | null | undefined): string => (valor || "").replace(/\s+/g, " ").trim();

/**
 * A CHAVE DE UMA KEYWORD NO CACHE — a mesma no pedido, no índice e na coluna.
 *
 * `normalizeSerpCacheKeyword` MANTÉM os acentos: "óleo de rosa mosqueta" e
 * "oleo de rosa mosqueta" são duas consultas para o cache, duas SERPs que o
 * Minerador pagou. Deduplicar sem acento fazia a variante sumir da coluna de
 * lentes sem nenhum aviso. E o espaço interno é colapsado dos DOIS lados: sem
 * isso, "rosa  mosqueta" era lida e acertada, mas o índice não a entregava ao
 * artigo, e a coluna dizia "nenhuma coleta" de uma lente que estava no cache.
 */
const chaveDoCache = (valor: string | null | undefined): string => normalizeSerpCacheKeyword(colapsado(valor));

/**
 * ===== AS KEYWORDS DO ARTIGO QUE VÃO AO CACHE =====
 *
 * A principal e as secundárias — as que o artigo PROMETE cobrir. Reforço
 * narrativo não tem SERP própria no desenho do Arquiteto, e pedir quatro
 * lentes para cada um multiplicaria a leitura sem mudar o que se escreve.
 *
 * O texto vem do contexto de keyword do DOSSIÊ (o mesmo que o Redator recebe);
 * o id da keyword só acompanha o pedido ao cache e nunca é exportado.
 */
export function radarPortableExportLensKeywords(input: {
  keywordContext: Pick<RadarKeywordContext, "principal" | "secondary">;
  researchContext?: Pick<RadarArticleResearchContext, "keywords"> | null;
}): RadarPortableSerpLensKeyword[] {
  /* O id pelo texto exato (chave do cache); sem ele, pelo texto sem acento. */
  const idPorChave = new Map<string, string>();
  const idSemAcento = new Map<string, string>();
  for (const keyword of input.researchContext?.keywords || []) {
    const textoDaKeyword = keyword?.identity?.text;
    const id = keyword?.identity?.keywordId;
    if (!textoDaKeyword || !id) continue;
    if (!idPorChave.has(chaveDoCache(textoDaKeyword))) idPorChave.set(chaveDoCache(textoDaKeyword), id);
    if (!idSemAcento.has(normalizar(textoDaKeyword))) idSemAcento.set(normalizar(textoDaKeyword), id);
  }

  const vistas = new Set<string>();
  const saida: RadarPortableSerpLensKeyword[] = [];
  const incluir = (textoDaKeyword: string | null | undefined, role: RadarPortableSerpLensKeyword["role"]) => {
    const limpo = colapsado(textoDaKeyword);
    const chave = chaveDoCache(limpo);
    if (!chave || vistas.has(chave)) return;
    vistas.add(chave);
    saida.push({ keyword: limpo, role, keywordId: idPorChave.get(chave) ?? idSemAcento.get(normalizar(limpo)) ?? null });
  };
  incluir(input.keywordContext.principal, "principal");
  for (const secundaria of input.keywordContext.secondary) incluir(secundaria, "secundaria");
  return saida;
}

export type RadarPortableExportLensReading = {
  lookups: readonly RadarPortableSerpLensLookup[];
  readFailed: boolean;
};

/**
 * ===== AS LEITURAS DE CADA ARTIGO, SEM VARRER O LOTE INTEIRO =====
 *
 * A leitura é uma só para o lote; a coluna de cada artigo só precisa das
 * lentes das keywords DELE. Indexar uma vez pela keyword normalizada (a mesma
 * normalização da chave do cache) evita que quinhentos artigos percorram,
 * cada um, as leituras dos outros quatrocentos e noventa e nove.
 */
export function radarPortableExportLensLookupsFor(
  lookups: readonly RadarPortableSerpLensLookup[],
): (keywords: readonly RadarPortableSerpLensKeyword[]) => RadarPortableSerpLensLookup[] {
  const porKeyword = new Map<string, RadarPortableSerpLensLookup[]>();
  for (const consulta of lookups) {
    const chave = chaveDoCache(consulta.request.query.keyword);
    porKeyword.set(chave, [...(porKeyword.get(chave) || []), consulta]);
  }
  return keywords => [...new Set(keywords.map(item => chaveDoCache(item.keyword)))]
    .flatMap(chave => porKeyword.get(chave) || []);
}

/**
 * ===== UMA LEITURA DO CACHE PARA O LOTE — e a falha não derruba o export =====
 *
 * O cache de SERP é CONTEXTO: ele diz o que as quatro lentes mostram hoje. A
 * investigação congelada não depende dele. Se o banco recusar a leitura, ou a
 * configuração dos códigos de localidade estiver inválida, o arquivo sai do
 * mesmo jeito — e cada lente diz "a leitura do cache falhou nesta exportação",
 * que é diferente de "nenhuma coleta".
 */
export async function radarPortableExportReadLenses(
  ler: () => Promise<readonly RadarPortableSerpLensLookup[]>,
  aoFalhar?: (erro: unknown) => void,
): Promise<RadarPortableExportLensReading> {
  try {
    return { lookups: await ler(), readFailed: false };
  } catch (erro) {
    aoFalhar?.(erro);
    return { lookups: [], readFailed: true };
  }
}

/** O que a rota guardou de cada artigo finalizado, antes de o lote fechar. */
export type RadarPortableExportAssembledArticle = {
  articleId: string;
  entrada: RadarPortableExportInput;
  lentes: readonly RadarPortableSerpLensKeyword[];
  /**
   * As lentes congeladas no pacote (`radarPortableExportFrozenLensesInput`).
   * Com elas, `serp_lenses_*` abre pela cópia congelada e rotula o cache como
   * observação fora do pacote. Sem elas, a coluna sai como antes.
   */
  lentesCongeladas?: RadarPortableFrozenLensesInput | null;
  /**
   * 2026-10-02 · Aditivo: a pesquisa do YouTube do artigo, para o export de
   * vídeo e redes sociais. Os outros formatos não a leem.
   */
  youtube?: RadarVideoExportYoutube | null;
  /** 2026-10-02 · Aditivo: ids dos especialistas das contribuições aceitas (a autoria é lida por eles). */
  expertIds?: string[];
  /** 2026-10-02 · Aditivo: o hash do pacote congelado que esta entrada descreve. */
  bundleHash?: string | null;
  /**
   * 2026-10-02 · Aditivo: o artigo-modelo deste pacote (SDD diretriz, Adendo A) —
   * o aprovado ou, sem ele, a proposta da IA, com o estado em `approval`
   * (nunca gravado), para as colunas saírem marcadas como proposta.
   */
  blueprint?: RadarArticleBlueprintPayload | null;
  /**
   * 2026-10-07 · Aditivo: o orgânico das três lentes extras para a keyword
   * principal, lido do resumo gravado no cache — só no modo vídeo da exportação
   * (`videoLensDigests`). Os outros formatos não o leem nem o recebem.
   */
  lensDigests?: RadarVideoLensOrganicReading | null;
  /**
   * 2026-10-09 (correção) · Aditivo, fora do pacote e do hash: o bloco comercial
   * COMPLETO da Amazon congelada (`radarAmazonFrozenCommercialBlock`) — faixas de
   * preço, regras de escrita, limitações e o esqueleto comercial como
   * matéria-prima. Só o gerador do artigo-modelo o lê; sem ele, a geração caía
   * sempre no plano comercial resumido de `entrada.commercial`.
   */
  amazonCommercialBlock?: RadarAmazonCommercialBlock | null;
};

/**
 * ===== AS LINHAS DO LOTE — as lentes e o contexto do silo entram AQUI =====
 *
 * As duas colunas que dependem do LOTE (lentes e silo) só existem depois do
 * laço por artigo. Enquanto isto morava na rota, a ligação
 * `siloContext ← plano.contextByArticleId` podia sumir sem nenhum teste
 * vermelho — e os CSVs por silo sairiam sem o contexto do silo, que é o
 * núcleo do pedido. Aqui ela tem teste com o plano real.
 *
 * Sem plano (dossiê avulso), a linha não ganha contexto de silo: com só parte
 * do silo no pedido, ele chamaria de "não enviado" o irmão não selecionado.
 */
export function radarPortableExportRows(input: {
  articles: readonly RadarPortableExportAssembledArticle[];
  lenses: RadarPortableExportLensReading;
  plan: Pick<RadarSiloExportPlan, "contextByArticleId"> | null;
}): Map<string, RadarPortableExportRow> {
  const lentesDe = radarPortableExportLensLookupsFor(input.lenses.lookups);
  const linhas = new Map<string, RadarPortableExportRow>();
  for (const artigo of input.articles) {
    linhas.set(artigo.articleId, buildRadarPortableExportRow({
      ...artigo.entrada,
      serpLenses: {
        keywords: artigo.lentes,
        lookups: lentesDe(artigo.lentes),
        readFailed: input.lenses.readFailed,
        ...(artigo.lentesCongeladas ? { frozen: artigo.lentesCongeladas } : {}),
      },
      siloContext: input.plan?.contextByArticleId[artigo.articleId] ?? null,
      /*
       * 2026-10-09 · o técnico pelo artigo-modelo: a planta concluída, já lida
       * (rascunho antigo não conta). (correção) Com a entrada do artigo: a trava,
       * as exclusões do ArticleDNA e o próximo passo que chama fora.
       */
      articleBlueprint: radarPortableExportHasApprovedBlueprint(artigo) ? radarPortableExportBlueprintOf(artigo.blueprint!, artigo.entrada) : null,
    }));
  }
  return linhas;
}

/**
 * 2026-10-09 · A PLANTA LIDA PARA A LINHA DO TÉCNICO: as MESMAS colunas do CSV
 * "Para escrever" (`radarArticleBlueprintColumns`) e a leitura compartilhada com
 * o Redator e o vídeo (`radarArticleBlueprintReading`). Rascunho antigo não é
 * planta: `null`.
 *
 * 2026-10-09 (correção) · COM AS REGRAS DO PILOTO. O técnico manda escrever pela
 * estrutura (`outline_md`), mas lia a planta crua: o "Próximo passo" que chama
 * virava uma segunda chamada no fechamento, a trava de fonte não tinha as
 * afirmações do pacote e a seção que o reajuste do ArticleDNA excluiu ficava.
 * Com a entrada do artigo (`entrada`), as opções são as do CSV para escrever que
 * não dependem do lote: a trava (`radarPendingClaims` + `radarClaimCommonStems`),
 * as exclusões do ArticleDNA, a principal e a continuação dita (`null`: o
 * próximo passo que chama sai, sem segunda chamada). A leitura vai sem o
 * próximo passo que chama (`withoutCallInNextStep`), como o vídeo e o Redator.
 * Sem `entrada` (chamada antiga), a leitura de antes.
 */
export function radarPortableExportBlueprintOf(
  payload: RadarArticleBlueprintPayload | null | undefined,
  entrada: RadarPortableExportInput | null = null,
): RadarPortableExportBlueprint | null {
  if (!payload || !payload.blueprint || payload.approval === "DRAFT") return null;
  const sources = new Set(payload.sources.map(item => item.id));
  if (!entrada) {
    return {
      payload,
      columns: radarArticleBlueprintColumns(payload),
      reading: radarArticleBlueprintReading(payload.blueprint, { sources }).blueprint,
    };
  }
  const p = radarWritingProjections(entrada);
  const exclusions = radarWritingBlueprintExclusions(entrada, p);
  return {
    payload,
    columns: radarArticleBlueprintColumns(payload, null, null, null, {
      ...(exclusions ? { exclusions } : {}),
      pendentes: radarPendingClaims(p, payload),
      comuns: radarClaimCommonStems(p, payload),
      principal: textoLimpo(p.dna.principalKeyword) || null,
      continuation: null,
    }),
    reading: radarArticleBlueprintReading(payload.blueprint, { sources, withoutCallInNextStep: true, ...(exclusions ? { exclusions } : {}) }).blueprint,
  };
}

/*
 * ===== 2026-10-09 · O ARTIGO-MODELO É OBRIGATÓRIO EM TODA ENTREGA (regra do dono) =====
 *
 * "Tudo que é de processos antigos tem que ser substituído pelos novos
 * processos dos pilotos." CSV "Para escrever", CSV de vídeo, CSV técnico e o
 * export por Silo passam a exigir a planta CONCLUÍDA de cada artigo — a que a
 * montagem já leu por `radarArticleBlueprintPick` (hash exato ou a concluída
 * do mesmo congelamento e ArticleDNA). Sem ela, nada sai pelo modelo editorial
 * antigo: a rota responde 409 com a lista do que falta, pelo título, e a tela
 * organiza em série (o custo dito no botão antes do clique) e exporta.
 *
 * Puro: a decisão é sobre o que a montagem trouxe, sem leitura nova.
 */

/** O código do estado "falta o artigo-modelo" — o mesmo das funções puras de entrega e da resposta 409 da rota. */
export const RADAR_EXPORT_NEEDS_ARTICLE_BLUEPRINT = "needs_article_blueprint" as const;

/** O estado explícito que as funções puras de entrega devolvem sem a planta (contrato da rodada de 2026-10-09). */
export type RadarExportNeedsArticleBlueprint = { status: typeof RADAR_EXPORT_NEEDS_ARTICLE_BLUEPRINT; articleIds: string[] };

/** O que falta, como a tela o mostra: o artigo pelo título, nunca pelo id. */
export type RadarPortableExportMissingBlueprint = { articleId: string; title: string };

/** A planta concluída do pacote vigente: a montagem a trouxe e ela não é o rascunho antigo. */
export const radarPortableExportHasApprovedBlueprint = (artigo: Pick<RadarPortableExportAssembledArticle, "blueprint">): boolean =>
  Boolean(artigo.blueprint && artigo.blueprint.blueprint && artigo.blueprint.approval !== "DRAFT");

/** O nome do artigo que a tela reconhece: a promessa do ArticleDNA (o título do item), a principal ou o slug. */
const tituloDoArtigo = (artigo: Pick<RadarPortableExportAssembledArticle, "entrada">): string =>
  textoLimpo(artigo.entrada.article.promise) || textoLimpo(artigo.entrada.article.principalKeyword) || textoLimpo(artigo.entrada.article.slug) || "artigo sem título conhecido";

/**
 * Os artigos montados sem a planta concluída, na ordem do pedido. `ids` (opcional): só estes (o que a função pura de entrega apontou).
 *
 * 2026-10-09 (correção) · UM PORTÃO SÓ. No modo "writing", a investigação de vídeo como
 * perfil primário não pede planta — a linha dela no CSV "Para escrever" é só a
 * identidade, bloqueada, e não lê a planta (`radarWritingRowNeedsBlueprint`, a regra do
 * portão puro da escrita). Cobrar a organização (paga) dela era pagar por uma planta que
 * o arquivo ignora. Nos outros modos (vídeo, técnico), todo artigo pede a planta.
 */
export function radarPortableExportMissingBlueprints(
  artigos: readonly RadarPortableExportAssembledArticle[],
  ids: readonly string[] | null = null,
  opcoes: { mode?: "writing" | "full" | "video" | null } = {},
): RadarPortableExportMissingBlueprint[] {
  const pedidos = ids ? new Set(ids) : null;
  const dispensado = (artigo: RadarPortableExportAssembledArticle) => opcoes.mode === "writing" && !radarWritingRowNeedsBlueprint(artigo.entrada.profile);
  return artigos
    .filter(artigo => (pedidos ? pedidos.has(artigo.articleId) : !dispensado(artigo) && !radarPortableExportHasApprovedBlueprint(artigo)))
    .map(artigo => ({ articleId: artigo.articleId, title: tituloDoArtigo(artigo) }));
}

/**
 * A função pura de entrega devolveu "falta o artigo-modelo"? Guarda de tipo:
 * do lado verdadeiro, o resultado é o estado explícito; do falso, o arquivo.
 */
export function radarExportNeedsArticleBlueprint<T>(resultado: T): resultado is Extract<T, RadarExportNeedsArticleBlueprint> {
  const lido = resultado as { status?: unknown; articleIds?: unknown } | null;
  return Boolean(lido && typeof lido === "object" && lido.status === RADAR_EXPORT_NEEDS_ARTICLE_BLUEPRINT && Array.isArray(lido.articleIds));
}

/** Os ids do estado explícito, saneados. */
export const radarExportNeedsArticleBlueprintIds = (resultado: unknown): string[] =>
  ((resultado as { articleIds?: unknown } | null)?.articleIds as unknown[] | undefined || []).filter((id): id is string => typeof id === "string" && Boolean(id.trim()));

/**
 * O CORPO DA RESPOSTA 409: o que falta, pelo título, e o teto do custo de
 * organizar (até 2 chamadas de IA por artigo: organizar e, quando a resposta
 * vem cortada ou a conferência aponta o que corrigir, mais 1). Os recusados de
 * antes (não finalizados) vão junto, para a tela não perdê-los.
 */
export function radarPortableExportNeedsBlueprintBody(input: {
  missing: readonly RadarPortableExportMissingBlueprint[];
  refused: ReadonlyArray<{ articleId: string; code: string; reason: string }>;
}) {
  const quantos = input.missing.length;
  return {
    success: false as const,
    code: RADAR_EXPORT_NEEDS_ARTICLE_BLUEPRINT,
    error: quantos === 1
      ? "Falta o artigo-modelo concluído deste artigo: toda entrega sai pelo artigo-modelo. Organize-o para exportar."
      : `Faltam os artigos-modelo concluídos de ${quantos} artigos: toda entrega sai pelo artigo-modelo. Organize-os para exportar.`,
    missingArticleBlueprints: input.missing.map(item => ({ articleId: item.articleId, title: item.title })),
    /* O teto do custo, para o botão dizer antes do clique. */
    maxAiCalls: quantos * 2,
    refused: input.refused,
  };
}

/* ================================== o silo ================================== */

const textoLimpo = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

/**
 * ===== O SILO DE UM ARTIGO RECUSADO ANTES DE O ITEM SER LIDO =====
 *
 * O `RadarItem.siloId` só é lido quando o artigo chega às autoridades. Um
 * artigo recusado antes disso (sem ArticleDNA, sem investigação) ainda precisa
 * aparecer como FALTANTE no silo dele — senão o silo sairia "completo" com um
 * buraco. A composição do SiloDNA mais recente da marca diz a que silo ele
 * pertence; se nenhum o lista, ele fica sem silo, e o aviso diz isso.
 */
export function radarSiloIdFromComposition(
  articleId: string,
  siloVersions: readonly VersionEnvelope<SiloDNA>[],
  brandId?: string | null,
): string | null {
  const recentes = new Map<string, VersionEnvelope<SiloDNA>>();
  for (const versao of siloVersions) {
    const siloId = textoLimpo(versao?.payload?.siloId);
    if (!siloId) continue;
    if (brandId && versao.payload.brandId && versao.payload.brandId !== brandId) continue;
    const atual = recentes.get(siloId);
    if (!atual || versao.versionNumber > atual.versionNumber) recentes.set(siloId, versao);
  }
  for (const [siloId, versao] of recentes) {
    const dna = versao.payload;
    const membros = new Set([
      dna.pillarArticleId,
      ...(dna.narrativeOrder || []),
      ...(dna.supportArticleIds || []),
      ...(dna.articleReferences || []).map(referencia => referencia.articleId),
    ].map(textoLimpo).filter(Boolean));
    if (membros.has(articleId)) return siloId;
  }
  return null;
}

/**
 * ===== COMO DESCREVER UM MEMBRO DO SILO QUE NÃO ESTÁ NO LOTE =====
 *
 * O slug vem do descritor do módulo do silo (publicado vence sugerido). O
 * título é a PROMESSA do ArticleDNA — a mesma frase que vira `RadarItem.title`
 * na importação (`operational-flow.ts`) —, para que o membro "não enviado ao
 * Radar" apareça com o nome que as pessoas reconhecem, e nunca pelo id.
 */
export function radarSiloMemberDescriptorsWithTitles(
  versoes: readonly VersionEnvelope<ArticleDNA>[],
  brandId?: string | null,
): RadarSiloExportMemberDescriptor[] {
  const promessa = new Map<string, { numero: number; titulo: string }>();
  for (const versao of versoes) {
    const articleId = textoLimpo(versao?.payload?.articleId);
    if (!articleId || (brandId && versao.payload.brandId !== brandId)) continue;
    const atual = promessa.get(articleId);
    if (!atual || versao.versionNumber > atual.numero) promessa.set(articleId, { numero: versao.versionNumber, titulo: textoLimpo(versao.payload.promise) });
  }
  return radarSiloMemberDescriptorsOfArticleDnas(versoes, brandId).map(descritor => ({
    ...descritor,
    title: promessa.get(descritor.articleId)?.titulo || null,
  }));
}

/** Um faltante, como a tela o mostra: pelo título, nunca pelo id. */
export type RadarPortableExportSiloPending = {
  title: string;
  status: string;
  reason: string | null;
};

export type RadarPortableExportSiloFile = {
  filename: string;
  csv: string;
  silo: {
    /** O nome do silo, "Silo sem nome N" ou "Sem silo". */
    name: string;
    kind: "silo" | "no_silo";
    partial: boolean;
    exported: number;
    total: number;
    pending: RadarPortableExportSiloPending[];
    warnings: string[];
  };
};

const rotuloDoMembro = (membro: Pick<RadarSiloExportMember, "title" | "principalKeyword" | "slug">): string =>
  membro.title || membro.principalKeyword || membro.slug || "artigo sem título conhecido";

const pendenteDe = (membro: RadarSiloExportMember): RadarPortableExportSiloPending => ({
  title: rotuloDoMembro(membro),
  status: membro.statusLabel,
  reason: membro.reason,
});

/**
 * ===== UM CSV POR SILO, NA ORDEM DO SILO =====
 *
 * As linhas já foram montadas pela rota, pela MESMA cadeia do dossiê avulso;
 * o plano só diz quais entram em cada arquivo e em que ordem. `articleIds` do
 * plano são internos — servem para casar plano e linha e não saem daqui: o
 * faltante vai para a tela pelo título e pela situação.
 */
export function radarPortableExportSiloFiles(input: {
  plan: Pick<RadarSiloExportPlan, "files">;
  rowsByArticleId: ReadonlyMap<string, RadarPortableExportRow>;
}): RadarPortableExportSiloFile[] {
  return input.plan.files.map(arquivo => {
    const linhas = arquivo.articleIds
      .map(articleId => input.rowsByArticleId.get(articleId))
      .filter((linha): linha is RadarPortableExportRow => Boolean(linha));
    return {
      filename: arquivo.filename,
      csv: radarPortableExportCsv(linhas),
      silo: {
        name: arquivo.siloLabel,
        kind: arquivo.kind,
        partial: arquivo.partial,
        exported: linhas.length,
        total: arquivo.total,
        pending: arquivo.pending.map(pendenteDe),
        warnings: arquivo.warnings,
      },
    };
  });
}

/** Os silos sem nenhum artigo finalizado: sem arquivo, com os faltantes pelo título. */
export function radarPortableExportEmptySilos(plan: Pick<RadarSiloExportPlan, "emptySilos">): Array<{ name: string; pending: RadarPortableExportSiloPending[] }> {
  return plan.emptySilos.map(silo => ({ name: silo.siloLabel, pending: silo.pending.map(pendenteDe) }));
}
