import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { ArtifactRepository, SerpSnapshotRepository } from "@/lib/server/editorial-repositories";
import { radarStartPorts } from "@/lib/server/radar-youtube-start";
import { resolveRadarCanonicalDossier } from "@/lib/server/radar-canonical-dossier";
import { radarFrozenObservedAtOfAnalysis } from "@/lib/radar/evidence-bundle-runtime";
import { buildRadarEditorialCommercialModel, buildRadarEditorialVideoModel } from "@/lib/radar/editorial-profile-model";
import { loadRadarCanonicalAuthorities } from "@/lib/server/radar-canonical-authorities";
import { radarPortableSpecialistContext, radarPortableVideoContext } from "@/lib/radar/portable-annex-context";
import { radarAmazonEligibleCandidates } from "@/lib/radar/amazon-eligibility";
import { radarAmazonSelectCandidates } from "@/lib/radar/amazon-candidate-selection";
import { radarAmazonSetupSignature } from "@/lib/radar/amazon-editorial-target";
import {
  buildRadarPortableExportRow,
  radarPortableExportCsv,
  radarPortableExportFilename,
  type RadarPortableCommercial,
  type RadarPortableExportRow,
} from "@/lib/radar/portable-export";
import { radarDeclaredArticleIntent } from "@/lib/radar/editorial-identity";

/**
 * ===== O DOSSIÊ EDITORIAL PORTÁTIL — RADAR_PORTABLE_EXPORT_1.2 =====
 *
 * ==================== PROVIDER_CALLS = 0, POR CONSTRUÇÃO ====================
 *
 * Nada aqui coleta. Cada artigo é uma LEITURA do que já foi pago e congelado:
 * snapshot da SERP gravado, estado do Radar, ArticleDNA canônico. Cem artigos
 * custam cem leituras — e nenhuma ida a provider.
 *
 * ==================== §8 · A AUTORIDADE DO GOOGLE, CORRIGIDA ====================
 *
 * A fotografia competitiva do pipeline do Google era montada só dentro do
 * React. Toda resolução de servidor recebia `googleObserved: undefined` e
 * produzia `blueprint: null` — e o CSV saía com título, promessa e estrutura
 * vazios ao lado de uma tela que mostrava o blueprint inteiro.
 *
 * Agora a rota lê os mesmos snapshots e chama os mesmos builders de domínio que
 * a tela chama, na mesma ordem. Não existe "a versão do servidor": existe a
 * cadeia, executada onde o dado está.
 *
 * ==================== §2 · UM ARTIGO NÃO DERRUBA O LOTE ====================
 *
 * A recusa é por artigo, com motivo, e o arquivo sai com os que fecharam. Uma
 * exceção aqui faria o artigo 7 de 100 cancelar os outros 99.
 */

const CorpoSchema = z.object({
  brandId: z.string().uuid(),
  articleIds: z.array(z.string().trim().min(1).max(256)).min(1).max(500),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = CorpoSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "radar", "view");

    const exportedAt = new Date().toISOString();
    const artefatos = await new ArtifactRepository().list(input.brandId);
    /* §8 · uma leitura de snapshots para o lote inteiro, não uma por artigo. */
    const snapshots = await new SerpSnapshotRepository().list(input.brandId);

    const rows: RadarPortableExportRow[] = [];
    const identificacao: Array<{ slug: string | null; keyword: string | null }> = [];
    const recusados: Array<{ articleId: string; code: string; reason: string }> = [];

    /* O mesmo artigo pedido duas vezes é um artigo. */
    for (const articleId of [...new Set(input.articleIds)]) {
      const article = artefatos.articles.find(version =>
        version.payload.articleId === articleId && version.payload.brandId === input.brandId);
      if (!article) {
        recusados.push({ articleId, code: "article_dna_not_found", reason: "O ArticleDNA canônico não foi encontrado para esta marca." });
        continue;
      }

      const estado = await radarStartPorts.loadRadarState({ brandId: input.brandId, articleId });
      const corrente = estado?.analyses.slice().sort((esquerda, direita) => direita.versionNumber - esquerda.versionNumber)[0] || null;
      if (!corrente) {
        recusados.push({ articleId, code: "radar_item_not_found", reason: "Não há investigação gravada para este artigo." });
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

      rows.push(buildRadarPortableExportRow({
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
        researchLimitations: bundle.limitations,
      }));

      identificacao.push({
        slug: fundamentoDoArtigo.slug,
        keyword: keywords.principal,
      });
    }

    if (!rows.length) {
      return NextResponse.json({
        success: false,
        code: "radar_export_empty",
        error: "Nenhum dos artigos selecionados tem investigação finalizada para exportar.",
        refused: recusados,
      }, { status: 409, headers: noStoreHeaders });
    }

    return NextResponse.json({
      success: true,
      csv: radarPortableExportCsv(rows),
      filename: radarPortableExportFilename({ articles: identificacao, today: exportedAt }),
      exported: rows.length,
      refused: recusados,
      headline: recusados.length
        ? `${rows.length} dossiê(s) exportado(s); ${recusados.length} artigo(s) ficaram de fora por não estarem finalizados.`
        : `${rows.length} dossiê(s) exportado(s).`,
    }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Pedido de exportação inválido.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
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
