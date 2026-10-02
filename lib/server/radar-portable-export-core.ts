import "server-only";
import { ArtifactRepository, SerpSnapshotRepository } from "@/lib/server/editorial-repositories";
import { radarStartPorts } from "@/lib/server/radar-youtube-start";
import { radarExportArticleReads } from "@/app/api/editorial/radar-export/_leitura-do-artigo";
import { resolveRadarCanonicalDossier } from "@/lib/server/radar-canonical-dossier";
import { radarFrozenObservedAtOfAnalysis } from "@/lib/radar/evidence-bundle-runtime";
import { buildRadarEditorialCommercialModel, buildRadarEditorialVideoModel } from "@/lib/radar/editorial-profile-model";
import { loadRadarCanonicalAuthorities } from "@/lib/server/radar-canonical-authorities";
import { radarPortableSpecialistContext, radarPortableVideoContext } from "@/lib/radar/portable-annex-context";
import { radarAmazonEligibleCandidates } from "@/lib/radar/amazon-eligibility";
import { radarAmazonSelectCandidates } from "@/lib/radar/amazon-candidate-selection";
import { radarAmazonSetupSignature } from "@/lib/radar/amazon-editorial-target";
import type { RadarPortableCommercial, RadarPortableExportInput } from "@/lib/radar/portable-export";
import { radarDeclaredArticleIntent } from "@/lib/radar/editorial-identity";
import { lookupSerpCache } from "@/lib/server/serp-cache";
import { readDataForSeoTargetCodes } from "@/lib/minerador/dataforseo-serp-core";
import { readMineradorKeywordTargetCodes, serpTargetCodesFor } from "@/lib/arquiteto/serp-lens-targeting";
import { radarPortableSerpLensRequests } from "@/lib/radar/portable-serp-observed";
import { planRadarSiloExport, type RadarSiloExportItem } from "@/lib/radar/portable-silo-export";
import {
  radarPortableExportDossierGapsInput,
  radarPortableExportFrozenLensesInput,
  radarPortableExportLensKeywords,
  radarPortableExportReadLenses,
  radarPortableExportResearchLimitations,
  radarPortableExportSerpObservedInput,
  radarSiloIdFromComposition,
  radarSiloMemberDescriptorsWithTitles,
  type RadarPortableExportAssembledArticle,
} from "@/lib/radar/portable-export-batch";
import { radarPortableWritingExport } from "@/lib/radar/portable-writing-batch";
import { radarVideoExportYoutubeOf } from "@/lib/radar/portable-video-export";
import type { RadarWritingPublication } from "@/lib/radar/portable-writing-export";
import type { RadarCanonicalItemIdentity } from "@/lib/server/radar-canonical-authorities";
import type { ArticleDNA, VersionEnvelope } from "@/lib/arquiteto/contracts";

/**
 * ===== O DOSSIÊ PORTÁTIL, MONTADO NUM LUGAR SÓ (SDD MCP ponta a ponta, F1) =====
 *
 * A montagem por artigo morava dentro da rota `/api/editorial/radar-export`,
 * presa à sessão de cookie. Ela saiu para cá SEM MUDAR: a rota da tela e a
 * ferramenta MCP `get_article_for_writing` chamam esta mesma função, e o CSV
 * que a IA recebe é o mesmo que a tela baixa.
 *
 * PROVIDER_CALLS = 0, por construção: cada artigo é uma LEITURA do que já foi
 * pago e congelado (snapshot da SERP, estado do Radar, ArticleDNA canônico).
 * As leituras do lote (artefatos, snapshots, revisões, cache em modo
 * `observation`) continuam uma por lote, e um artigo recusado não derruba os
 * outros: a recusa é por artigo, com motivo.
 */

type LeitorDoCache = Parameters<typeof readMineradorKeywordTargetCodes>[0];

export type RadarPortableExportAssembly = {
  exportedAt: string;
  /** As entradas por artigo; as linhas saem depois do lote, com as lentes e o silo. */
  montadas: RadarPortableExportAssembledArticle[];
  identificacao: Array<{ slug: string | null; keyword: string | null }>;
  recusados: Array<{ articleId: string; code: string; reason: string }>;
  publicacoes: Map<string, RadarWritingPublication>;
  lentes: Awaited<ReturnType<typeof radarPortableExportReadLenses>>;
  /** Só com `groupBy: "silo"`. */
  plano: ReturnType<typeof planRadarSiloExport> | null;
  /** 2026-10-02 · Só com `selectionSiloContext` e sem `groupBy`: o Silo de cada selecionado. */
  planoDaSelecao: ReturnType<typeof planRadarSiloExport> | null;
};

export async function assembleRadarPortableExport(input: {
  brandId: string;
  articleIds: readonly string[];
  groupBy?: "silo";
  /**
   * 2026-10-02 · Aditivo: o export dos SELECIONADOS também leva o Silo. O plano
   * marca o irmão não selecionado como "fora desta seleção", e não como "não
   * enviado ao Radar" — que era o motivo de o avulso sair sem Silo.
   */
  selectionSiloContext?: boolean;
  /** O cliente das leituras de alvo e do cache: a sessão da tela ou o operacional do MCP (sempre filtrado pela marca). */
  supabase: LeitorDoCache;
  actorUserId: string;
  exportedAt?: string;
}): Promise<RadarPortableExportAssembly> {
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const artefatos = await new ArtifactRepository().list(input.brandId);
  /* §8 · uma leitura de snapshots para o lote inteiro, não uma por artigo. */
  const snapshots = await new SerpSnapshotRepository().list(input.brandId);
  /*
   * 2026-09-23 · UMA leitura de revisões da SERP para o lote inteiro.
   *
   * `listReviews` filtra pela marca e lê colunas explícitas. Se ela falhar, a
   * coluna da SERP diz "revisão não lida nesta exportação" — e o arquivo sai:
   * a revisão é contexto da SERP, não condição do dossiê.
   */
  const revisoes = await new SerpSnapshotRepository().listReviews(input.brandId)
    .catch(() => ({ reviews: [] as Awaited<ReturnType<SerpSnapshotRepository["listReviews"]>>["reviews"], available: false }));

  /*
   * AS LINHAS SÃO MONTADAS DEPOIS DO LAÇO, NÃO DENTRO.
   *
   * Duas colunas dependem do LOTE e não do artigo: as lentes (uma leitura do
   * cache para todas as keywords de todos os artigos) e o contexto do silo
   * (que só se sabe completo ou parcial olhando o silo inteiro). O laço
   * resolve cada artigo e guarda a entrada; a linha sai quando o lote fecha.
   */
  const montadas: RadarPortableExportAssembledArticle[] = [];
  const identificacao: Array<{ slug: string | null; keyword: string | null }> = [];
  const recusados: Array<{ articleId: string; code: string; reason: string }> = [];
  /* O que o plano por silo precisa saber de CADA artigo pedido — finalizado ou não. */
  const itensDoSilo: RadarSiloExportItem[] = [];
  /*
   * 2026-09-23 · A PÁGINA PUBLICADA, PARA O FORMATO "PARA ESCREVER".
   *
   * Sai do ArticleDNA que o laço JÁ leu (mesma marca, mesmo artigo): URL
   * publicada, canonical, slug e a política da principal. Nenhuma leitura
   * nova; o formato completo não usa este mapa.
   */
  const publicacoes = new Map<string, RadarWritingPublication>();

  /*
   * O ARTIGO RECUSADO CONTINUA SENDO MEMBRO DO SILO.
   *
   * Sem ele no plano, o silo sairia "completo" com um buraco. O silo vem do
   * `RadarItem` quando ele já foi lido; antes disso, da composição do SiloDNA.
   * O título é o do item ou a promessa do ArticleDNA — nunca o id.
   */
  const faltante = (
    articleId: string,
    reason: string,
    article: VersionEnvelope<ArticleDNA> | null,
    item: RadarCanonicalItemIdentity | null = null,
  ): RadarSiloExportItem => ({
    articleId,
    siloId: item?.siloId || radarSiloIdFromComposition(articleId, artefatos.silos, input.brandId),
    status: "not_finalized",
    title: item?.title || (article ? identidadeDoArticleDna(article.payload).promise : null),
    slug: item?.slug || (article ? identidadeDoArticleDna(article.payload).slug : null),
    unitType: item?.unitType ?? null,
    reason,
  });

  /* O mesmo artigo pedido duas vezes é um artigo. */
  for (const articleId of [...new Set(input.articleIds)]) {
    const article = artefatos.articles.find(version =>
      version.payload.articleId === articleId && version.payload.brandId === input.brandId);
    if (!article) {
      recusados.push({ articleId, code: "article_dna_not_found", reason: "O ArticleDNA canônico não foi encontrado para esta marca." });
      itensDoSilo.push(faltante(articleId, "O ArticleDNA canônico não foi encontrado para esta marca.", null));
      continue;
    }

    /*
     * E4 · A ANÁLISE CORRENTE SEM AS CORRIDAS DAS OUTRAS VERSÕES.
     *
     * A mesma versão de antes (a de maior número), agora lida com só a
     * corrida dela: no item mais pesado, 8,22 MB viraram 2,50 MB. A regra
     * de escolha é a antiga, provada em `portable-export-reading`, e o CSV
     * sai byte a byte igual (`tests/radar-export-leitura-por-artigo`).
     */
    const corrente = await radarExportArticleReads.currentAnalysis({ brandId: input.brandId, articleId });
    if (!corrente) {
      recusados.push({ articleId, code: "radar_item_not_found", reason: "Não há investigação gravada para este artigo." });
      itensDoSilo.push(faltante(articleId, "Não há investigação gravada para este artigo.", article));
      continue;
    }

    const fundamento = {
      brandId: input.brandId,
      articleId,
      articleDnaVersionId: article.versionId,
      articleDnaContentHash: article.contentHash,
    };

    /*
     * ===== PARITY_1 · §2 e §9 · UMA LEITURA, DUAS PROJEÇÕES =====
     *
     * O export deixou de ler as autoridades por conta própria. A mesma
     * função que o envio ao Planejador usa resolve a fotografia do Google,
     * a biblioteca de vídeos, o especialista e o contexto de pesquisa — e o
     * que sobra para este arquivo é PROJETAR.
     *
     * Enquanto ele lia por conta própria, existiam duas normalizações da
     * mesma contribuição de especialista. Duas normalizações são duas
     * verdades, e a primeira divergência apareceria num artigo escrito.
     */
    const autoridades = await loadRadarCanonicalAuthorities({
      brandId: input.brandId,
      articleId,
      article,
      analysis: corrente,
      serpRecords: snapshots.records,
    });
    const contexto = autoridades.researchContext;

    const canonico = resolveRadarCanonicalDossier({
      analysis: corrente,
      article: fundamento,
      /* Mesmo instante do envio ao Redator: o do congelamento. Hash igual nos dois consumidores. */
      observedAt: radarFrozenObservedAtOfAnalysis(corrente.payload) ?? exportedAt,
      authorities: autoridades,
    });
    if (!canonico.ok) {
      recusados.push({ articleId, code: canonico.code, reason: canonico.reason });
      itensDoSilo.push(faltante(articleId, canonico.reason, article, autoridades.radarItem ?? null));
      continue;
    }

    const { profile: perfil, bundle, blueprintView, keywordContext: keywords } = canonico.dossier;
    const payload = corrente.payload;

    const comercial = perfil === "AMAZON" ? estadoComercialCanonico(payload) : null;

    const modeloDoPerfil = contexto && blueprintView.blueprint
      ? perfil === "AMAZON" && blueprintView.blueprint.profile === "AMAZON"
        ? buildRadarEditorialCommercialModel({
          context: contexto,
          blueprint: blueprintView.blueprint,
          setup: comercial?.setup ?? null,
          selection: comercial?.selection ?? null,
          eligibility: comercial?.eligibility ?? null,
          universe: comercial?.universe || [],
        })
        : perfil === "YOUTUBE" && blueprintView.blueprint.profile === "YOUTUBE"
          ? buildRadarEditorialVideoModel({ context: contexto, blueprint: blueprintView.blueprint })
          : null
      : null;

    /*
     * ===== §8 · O ARTIGO-MODELO É O DA TELA, NÃO UM EQUIVALENTE =====
     *
     * A rota remontava o artigo-modelo por conta própria, com um argumento
     * a mais no builder do blueprint do que a tela usa. Um
     * argumento a mais é tudo o que é preciso para duas leituras da mesma
     * investigação divergirem sem ninguém notar.
     *
     * Agora o modelo vem da MESMA passagem que a aba renderiza. Não existem
     * dois artigos-modelo para comparar: existe um.
     */
    const modeloDoArtigo = perfil === "GOOGLE" ? autoridades.google?.articleModel ?? null : null;
    const fundamentoDoArtigo = identidadeDoArticleDna(article.payload);

    /*
     * ===== PARITY_1 · §9 · OS ANEXOS SÃO PROJEÇÃO, NÃO LEITURA =====
     *
     * As camadas canônicas já estão no dossiê — `bundle.video` e
     * `bundle.specialist` são as MESMAS que o Planejador recebe. O que
     * acontece aqui é a escolha do que sai para fora da plataforma, escrita
     * em português.
     *
     * Enquanto este arquivo lia as tabelas por conta própria, existiam duas
     * normalizações da mesma resposta de especialista. Duas normalizações são
     * duas verdades.
     */
    const videoContext = radarPortableVideoContext(bundle.video);
    const specialistContext = radarPortableSpecialistContext(bundle.specialist);

    /*
     * 2026-09-23 · A SERP QUE O DOSSIÊ REFERENCIA, e não a mais recente.
     *
     * Os snapshots e as revisões já estão em memória (uma leitura por
     * lote); a escolha do registro, da revisão e da curadoria é a regra
     * pura de `portable-export-batch`, que tem teste próprio. Sai ANTES da
     * entrada porque a coleta posterior também é avisada na situação.
     */
    const serpObservada = radarPortableExportSerpObservedInput({
      records: snapshots.records,
      articleId,
      bundle,
      analysis: payload,
      reviews: revisoes.reviews,
      reviewsReadable: revisoes.available,
    });

    const planoComercial: RadarPortableCommercial | null = perfil === "AMAZON"
      ? {
        setup: comercial?.setup ?? null,
        counts: comercial?.counts ?? null,
        products: (modeloDoPerfil?.promotionLinks || []).map(link => ({ asin: link.asin, productName: link.productName })),
        links: modeloDoPerfil?.promotionLinks || [],
        comparisonCriteria: modeloDoPerfil?.comparisonCriteria || [],
        disclosureRequired: Boolean(modeloDoPerfil?.affiliateDisclosureRequired),
        shortlistStatus: modeloDoPerfil?.shortlistStatus ?? null,
      }
      : null;

    const entrada: RadarPortableExportInput = {
      profile: perfil,
      blueprintView,
      exportedAt,
      article: {
        /*
         * ===== KEYWORD_CONTEXT_1 · §7 · A MESMA COMPOSIÇÃO DOS DOIS LADOS =====
         *
         * O export montava a lista por conta própria a partir do contexto de
         * pesquisa. Dava o mesmo resultado — e era mais um lugar onde a regra
         * de qual papel vira qual coluna podia divergir do que o Planejador
         * recebe. Agora os dois leem o contexto resolvido pelo dossiê.
         */
        principalKeyword: keywords.principal,
        secondaryKeywords: keywords.secondary,
        narrativeReinforcements: keywords.narrativeReinforcements,
        intent: contexto?.article.classification?.intentLabel ?? radarDeclaredArticleIntent(article.payload),
        funnel: contexto?.article.classification?.funnelLabel ?? null,
        siloName: contexto?.silo?.siloName ?? null,
        articleRole: contexto?.silo?.articleRole ?? null,
        slug: fundamentoDoArtigo.slug,
        canonical: fundamentoDoArtigo.canonical,
        contentType: fundamentoDoArtigo.contentType,
        audience: fundamentoDoArtigo.audience,
        promise: fundamentoDoArtigo.promise,
        publishedProtected: fundamentoDoArtigo.published,
        protectedFields: fundamentoDoArtigo.protectedFields,
        mustCover: contexto?.editorialTopics || [],
      },
      articleModel: modeloDoArtigo,
      profileModel: modeloDoPerfil,
      googleObserved: autoridades.google?.observed ?? null,
      researchContext: contexto,
      youtubeUniverse: perfil === "YOUTUBE" ? payload.youtubeSearch?.universe || [] : [],
      youtubeQueries: perfil === "YOUTUBE"
        ? (payload.youtubeSearch?.queries || []).map(item => ({ queryId: item.queryId, text: item.text }))
        : [],
      amazon: perfil === "AMAZON"
        ? { setup: comercial?.setup ?? null, universe: comercial?.universe || [] }
        : null,
      commercial: planoComercial,
      videoContext,
      specialistContext,
      internalLinks: (contexto?.internalLinks?.edges || [])
        .filter(aresta => aresta.direction === "outbound")
        .map(aresta => `${aresta.relationType}: ${aresta.anchorConcepts.join(", ") || aresta.targetNodeId}`),
      /* As do congelamento das lentes saem sem o motivo cru da coleta; as outras, como estão. */
      researchLimitations: radarPortableExportResearchLimitations(bundle),
      serpObserved: serpObservada,
      /* O que o Redator lê do dossiê e o CSV não dizia: prontidão, datas, autoridade, concorrentes. */
      dossierGaps: radarPortableExportDossierGapsInput({
        analysis: payload,
        profile: perfil,
        bundle,
        readiness: canonico.dossier.readiness,
        article: fundamento,
        exportedAt,
        /* As colunas de evidência saem do `observed`, montado sobre a coleta mais recente: a situação avisa. */
        newerSerpCollection: serpObservada.newerCollection,
      }),
    };

    montadas.push({
      articleId,
      entrada,
      lentes: radarPortableExportLensKeywords({ keywordContext: keywords, researchContext: contexto }),
      /*
       * 2026-09-23 · AS LENTES DO PACOTE ANTES DAS DO CACHE.
       *
       * A cópia congelada (`bundle.serpLenses`, a mesma que o Redator
       * recebe) é a fonte de verdade da coluna; o cache, lido depois do
       * laço, entra como observação fora do pacote. Nenhuma leitura nova:
       * o bundle e os snapshots já estão em memória.
       */
      lentesCongeladas: radarPortableExportFrozenLensesInput({ profile: perfil, bundle, analysis: payload, records: snapshots.records }),
      /*
       * 2026-10-02 · A PESQUISA DO YOUTUBE, EM QUALQUER PERFIL.
       *
       * No artigo do Google ela é o complemento opcional para converter o
       * artigo em vídeo. Fotografia vence a corrida viva; nenhuma coleta.
       */
      youtube: radarVideoExportYoutubeOf({
        run: payload.youtubeSearch,
        frozen: payload.youtubeFrozenInvestigation,
        declaredIntent: radarDeclaredArticleIntent(article.payload),
        editorialTopics: contexto?.editorialTopics || [],
        generatedAt: exportedAt,
      }),
    });

    identificacao.push({
      slug: fundamentoDoArtigo.slug,
      keyword: keywords.principal,
    });

    publicacoes.set(articleId, {
      published: fundamentoDoArtigo.published,
      publishedUrl: fundamentoDoArtigo.publishedUrl,
      canonical: fundamentoDoArtigo.canonical,
      slug: fundamentoDoArtigo.slug,
      principalPolicy: fundamentoDoArtigo.principalPolicy,
    });

    /*
     * A CHAVE DO SILO É `RadarItem.siloId`: é o silo já resolvido na
     * importação, inclusive para ArticleDNA antigo que não o declara. Só
     * quando o item não pôde ser lido é que a composição do SiloDNA responde.
     */
    itensDoSilo.push({
      articleId,
      siloId: autoridades.radarItem?.siloId || radarSiloIdFromComposition(articleId, artefatos.silos, input.brandId),
      status: "finalized",
      title: autoridades.radarItem?.title || fundamentoDoArtigo.promise,
      slug: fundamentoDoArtigo.slug,
      principalKeyword: keywords.principal,
      unitType: autoridades.radarItem?.unitType ?? null,
      importedSiloDnaVersionId: contexto?.silo?.siloDnaVersionId ?? null,
      siloPage: contexto?.silo
        ? { slug: contexto.silo.siloPageSlug, canonical: contexto.silo.siloPageCanonical, publicationStatus: contexto.silo.siloPagePublicationStatus }
        : null,
    });
  }

  /*
   * ===== 2026-09-23 · A SERP POR LENTE: UMA LEITURA DO CACHE PARA O LOTE =====
   *
   * Principal e secundárias de todos os artigos, nas quatro lentes, em modo
   * `observation` (R8 da SDD de egress: ~1 KB por entrada, sem corpo). O
   * cache é LIDO, nunca pago — não há coleta neste caminho.
   *
   * A leitura é contexto, não condição: se o banco recusar, ou os códigos de
   * localidade estiverem inválidos, o arquivo sai do mesmo jeito e a coluna
   * diz "a leitura do cache falhou nesta exportação".
   *
   * ==================== OS CÓDIGOS DO ALVO DA KEYWORD (A8) ====================
   *
   * A chave do cache inclui localidade e idioma, e o Minerador grava com os
   * códigos do ALVO de cada keyword (o targeting da medição), não com os do
   * ambiente. Consultar com os do ambiente ia a outra chave sempre que os
   * dois divergissem (`pt-br` no ambiente, keyword medida em inglês) — e a
   * lente saía "nenhuma coleta" com a coleta gravada. A regra é a mesma do
   * Arquiteto (`serp-lens-targeting`): uma leitura ESTREITA do targeting por
   * lote de 100 ids, filtrada pela marca; sem alvo resolvível, ou com a
   * leitura falha, valem os códigos do ambiente, como antes.
   */
  const lentes = montadas.length
    ? await radarPortableExportReadLenses(async () => {
      const ambiente = readDataForSeoTargetCodes();
      const keywordsDoLote = montadas.flatMap(item => item.lentes);
      const alvos = await readMineradorKeywordTargetCodes(
        input.supabase,
        input.brandId,
        keywordsDoLote.map(item => item.keywordId || "").filter(Boolean),
        ambiente,
      );
      const pedidos = radarPortableSerpLensRequests({
        keywords: keywordsDoLote,
        ...ambiente,
        codesFor: keywordId => serpTargetCodesFor(alvos.codes, keywordId, ambiente),
      });
      if (!pedidos.length) return [];
      return lookupSerpCache(
        { supabase: input.supabase as Parameters<typeof lookupSerpCache>[0]["supabase"], brandId: input.brandId, actorUserId: input.actorUserId },
        pedidos,
        { mode: "observation", now: new Date(exportedAt) },
      );
    }, erro => console.warn("[radar-export] serp_cache_read_failed", {
      message: erro instanceof Error ? erro.message.slice(0, 240) : "falha desconhecida",
    }))
    : { lookups: [], readFailed: false };

  /*
   * ===== 2026-09-23 · O PLANO POR SILO, SÓ QUANDO PEDIDO =====
   *
   * O dossiê avulso não ganha contexto de silo: com só parte do silo no
   * pedido, o contexto chamaria de "não enviado ao Radar" o irmão que apenas
   * não foi selecionado. No export por silo a tela manda o silo inteiro, e
   * aí o contexto diz a verdade — completo, ou parcial com os faltantes.
   */
  const plano = input.groupBy === "silo"
    ? planRadarSiloExport({
      today: exportedAt,
      brandId: input.brandId,
      items: itensDoSilo,
      siloVersions: artefatos.silos,
      memberDescriptors: radarSiloMemberDescriptorsWithTitles(artefatos.articles, input.brandId),
    })
    : null;

  const planoDaSelecao = !plano && input.selectionSiloContext
    ? planRadarSiloExport({
      today: exportedAt,
      brandId: input.brandId,
      items: itensDoSilo,
      siloVersions: artefatos.silos,
      memberDescriptors: radarSiloMemberDescriptorsWithTitles(artefatos.articles, input.brandId),
      selectionOnly: true,
    })
    : null;

  return { exportedAt, montadas, identificacao, recusados, publicacoes, lentes, plano, planoDaSelecao };
}

/**
 * O formato "Para escrever" de UM artigo, para quem escreve fora da plataforma
 * (MCP `get_article_for_writing`): a mesma projeção do botão "Para escrever",
 * com a linha de topo da marca e a linha do artigo, no mesmo CSV.
 */
export async function radarWritingExportForArticle(input: {
  brandId: string;
  articleId: string;
  supabase: LeitorDoCache;
  actorUserId: string;
}): Promise<
  | { ok: true; csv: string; filename: string | null; blocked: boolean; exportedAt: string }
  | { ok: false; code: string; reason: string }
> {
  const montagem = await assembleRadarPortableExport({ brandId: input.brandId, articleIds: [input.articleId], supabase: input.supabase, actorUserId: input.actorUserId });
  if (!montagem.montadas.length) {
    const recusa = montagem.recusados[0];
    return { ok: false, code: recusa?.code ?? "radar_export_empty", reason: recusa?.reason ?? "O artigo não tem investigação finalizada para exportar." };
  }
  const escrita = radarPortableWritingExport({ articles: montagem.montadas, lenses: montagem.lentes, plan: null, publications: montagem.publicacoes, today: montagem.exportedAt });
  return { ok: true, csv: escrita.csv ?? "", filename: escrita.filename, blocked: escrita.blocked > 0, exportedAt: montagem.exportedAt };
}

/* ===================== §10 · o estado comercial canônico ===================== */

type Payload = Awaited<ReturnType<typeof radarStartPorts.loadRadarState>> extends { analyses: Array<infer T> } | null
  ? T extends { payload: infer P } ? P : never
  : never;

/**
 * ===== §10 · A AMAZON EXPORTA O ESTADO CANÔNICO, E SÓ ELE =====
 *
 * ==================== O RISCO QUE ISTO FECHA ====================
 *
 * O blueprint comercial vem da FOTOGRAFIA congelada. A shortlist e os links não
 * podem vir dela: a fotografia guarda as conclusões e o resumo, não o universo
 * — então eles precisam ser recalculados sobre a corrida gravada.
 *
 * Se alguém trocou a configuração DEPOIS de congelar, a corrida gravada passou
 * a descrever outra investigação. Recalcular a shortlist sobre ela produziria
 * produtos de um alvo ao lado de um blueprint de outro — e o CSV não teria como
 * mostrar a diferença.
 *
 * A assinatura da configuração material existe exatamente para responder isso.
 * Quando ela não bate, a leitura comercial não sai: o blueprint congelado
 * continua descrevendo o artigo, e a lista de produtos fica vazia porque vazia
 * é a verdade sobre o que pode ser afirmado.
 */
function estadoComercialCanonico(payload: Payload) {
  const setup = payload.amazonEditorialSetup ?? null;
  const corrida = payload.amazonSearch ?? null;
  const congelada = payload.amazonFrozenInvestigation ?? null;

  if (!setup || !corrida) {
    return { setup, universe: [], eligibility: null, selection: null, counts: null };
  }

  const assinaturaCongelada = congelada?.originalEditorialIntent?.setupSignature ?? null;
  const assinaturaCorrente = radarAmazonSetupSignature(setup);
  if (assinaturaCongelada && assinaturaCongelada !== assinaturaCorrente) {
    return { setup, universe: [], eligibility: null, selection: null, counts: null };
  }

  const eligibility = radarAmazonEligibleCandidates({
    intent: setup.intent, target: setup.target, universe: corrida.universe,
  });
  const selection = radarAmazonSelectCandidates({
    intent: setup.intent,
    universe: eligibility.eligible,
    observedCount: eligibility.rawCount,
    queryCount: corrida.queries.filter(item => item.executed).length,
  });

  return {
    setup,
    universe: corrida.universe,
    eligibility,
    selection,
    counts: { observed: eligibility.rawCount, eligible: eligibility.eligible.length, shortlist: selection.candidates.length },
  };
}

/* ===================== §1 e §5 do addendum · o fundamento da página ===================== */

/**
 * ===== O QUE O ARTICLEDNA DIZ SOBRE A PÁGINA, E NÃO SOBRE O TEXTO =====
 *
 * Slug, canonical, tipo de unidade, público, promessa e o que a publicação
 * TRAVOU. A leitura é defensiva de propósito: `unitClassification`,
 * `keywordStrategy` e `publishedIdentityRef` são todos opcionais no contrato, e
 * um ArticleDNA consolidado antes de cada um deles continua legível.
 *
 * `publishedIdentityRef` VENCE o slug sugerido: quando a página está publicada,
 * o endereço real é o que está no ar — e é ele que não pode ser reescrito.
 */
function identidadeDoArticleDna(payload: unknown) {
  const dna = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const objeto = (valor: unknown) =>
    (valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {}) as Record<string, unknown>;
  const texto = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor.trim() : null);

  const publicada = objeto(dna.publishedIdentityRef);
  const published = publicada.publicationStatus === "published_protected";
  const protecao = objeto(objeto(dna.keywordStrategy).publicationProtection);
  const declarados = Array.isArray(protecao.protectedFields) ? protecao.protectedFields.map(String) : [];

  return {
    slug: texto(publicada.slug) || texto(dna.suggestedSlug),
    canonical: texto(publicada.canonical) || texto(dna.canonical),
    contentType: texto(objeto(dna.unitClassification).type),
    audience: texto(dna.audience),
    promise: texto(dna.promise),
    published,
    /* 2026-09-23 · só o formato "Para escrever" lê estes dois; ausentes, ele diz "estado desconhecido". */
    publishedUrl: texto(publicada.publishedUrl),
    principalPolicy: texto(dna.primaryKeywordPolicy),
    /*
     * PUBLICADO TRAVA SLUG E CANONICAL, mesmo sem a lista declarada.
     *
     * A lista é a decisão explícita do Arquiteto; a publicação é um fato. Uma
     * página no ar cujo ArticleDNA não declarou proteção continua sendo uma
     * página cuja URL quebra se alguém a reescrever de fora.
     */
    protectedFields: published ? [...new Set([...declarados, "slug", "canonical"])] : declarados,
  };
}
