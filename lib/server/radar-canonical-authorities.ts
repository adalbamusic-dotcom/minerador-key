import { createCanonicalServiceClient } from "./canonical-authorization.ts";
import { loadRadarVideoBriefMatching } from "./radar-video-matching-read.ts";
import { listExpertBriefsForContext, listExpertContributions } from "./telegram/persistence.ts";
import { SerpSnapshotRepository, WorkflowRepository } from "./editorial-repositories.ts";
import { buildRadarArticleResearchContext } from "../radar/article-research-context.ts";
import { buildRadarSpecialistEvidenceLayer, type RadarSpecialistEvidenceSource } from "../radar/specialist-evidence.ts";
import { buildRadarVideoEvidenceLayer } from "../radar/video-evidence.ts";
import { radarGoogleReadModelOfAnalysis, type RadarGoogleReadModel } from "../radar/google-observed-read-model.ts";
import { radarPrimaryProfileOfAnalysis } from "../radar/evidence-bundle-runtime.ts";
import { RadarItemSchema } from "../editorial/operational-flow.ts";
import { radarSpecialistExtraction, radarSpecialistReviewsOf } from "../radar/specialist-contribution-review.ts";
import { radarSpecialistRequirementIdOf } from "../radar/specialist-lifecycle.ts";
import type { ArticleDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import type { RadarAnalysisVersion } from "../radar/analysis-contracts.ts";
import type { RadarArticleResearchContext } from "../radar/article-research-context.ts";
import type { RadarSpecialistEvidenceLayer } from "../radar/specialist-evidence.ts";
import type { RadarVideoEvidenceLayer } from "../radar/video-evidence.ts";

/**
 * ===== AS AUTORIDADES DO RADAR, LIDAS UMA VEZ — PARITY_1 · §2, §3, §4 e §9 =====
 *
 * ==================== A DIVERGÊNCIA QUE ESTE ARQUIVO FECHA ====================
 *
 * O export portátil aprendeu a ler a biblioteca de vídeos, as contribuições do
 * especialista e a fotografia do pipeline do Google. O envio ao Planejador não.
 *
 * O resultado era o oposto do que o dossiê canônico existe para garantir: o
 * MESMO artigo saía completo num CSV que vai para fora da plataforma e
 * incompleto no pacote que alimenta o próximo módulo do produto.
 *
 * Pior do que a assimetria: o export tinha virado uma SEGUNDA AUTORIDADE. Ele
 * normalizava a contribuição do especialista à sua maneira, com um formato só
 * dele — e a partir daí existiriam duas verdades sobre a mesma resposta.
 *
 * ==================== A ORDEM CANÔNICA ====================
 *
 *   autoridades do Radar
 *          ↓
 *   loadRadarCanonicalAuthorities   (I/O — uma vez, aqui)
 *          ↓
 *   resolveRadarCanonicalDossier    (puro — uma vez, lá)
 *          ↓
 *     ├── sendRadarToPlanner   → grava o bundle V3
 *     └── portable export      → projeta Markdown e CSV
 *
 * O export continua DERIVADO: ele formata o que este módulo resolveu, e não
 * resolve nada por conta própria (§9).
 *
 * ==================== ZERO PROVIDER, ZERO IA — §17 ====================
 *
 * Tudo aqui é SELECT do que já está gravado e já foi decidido por uma pessoa.
 * Nada coleta, nada transcreve, nada classifica e nada aprova.
 */

type Linha = Record<string, unknown>;

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor.trim() : null;

const objeto = (valor: unknown): Linha | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Linha : null;

export type RadarCanonicalAuthorities = {
  /** A fotografia do pipeline do Google. `null` fora do perfil GOOGLE. */
  google: RadarGoogleReadModel | null;
  /** §3 · a biblioteca casada com as pautas. `null` quando não há seleção. */
  video: RadarVideoEvidenceLayer | null;
  /** §4 · as contribuições aceitas. `null` quando não houve nenhuma. */
  specialist: RadarSpecialistEvidenceLayer | null;
  /** §8 · o contexto resolvido — é dele que sai o DNA das keywords. */
  researchContext: RadarArticleResearchContext | null;
};

export const RADAR_NO_AUTHORITIES: RadarCanonicalAuthorities = {
  google: null, video: null, specialist: null, researchContext: null,
};

/* ==================== §14 · as duas decisões de ausência ==================== */

/**
 * ===== §14 · AUSÊNCIA NÃO VIRA CAMADA VAZIA =====
 *
 * As duas decisões abaixo são PURAS de propósito. Elas decidem se existe
 * evidência a entregar, e essa é a pergunta mais fácil de errar em silêncio:
 * uma camada com listas vazias diz ao Planejador "investigamos e não achamos
 * nada", que é o oposto de "não houve investigação".
 *
 * Deixá-las dentro do leitor de banco tornaria a regra só testável com stub de
 * I/O — e regra de negócio escondida atrás de I/O é regra que ninguém protege.
 */
export function radarVideoLayerIsWorthDelivering(casamento: {
  briefs: readonly unknown[];
  run: unknown;
  frozenBundleId: string | null;
}): boolean {
  return Boolean(casamento.briefs.length && casamento.run && casamento.frozenBundleId);
}

/**
 * A camada sem item ativo mas com respostas não decididas É entregável: ela diz
 * que houve resposta e ninguém decidiu. A com tudo zerado não — ali não houve
 * nada, e `null` é a única forma honesta de dizer isso.
 */
export function radarSpecialistLayerIsWorthDelivering(layer: {
  items: readonly unknown[];
  notApproved: number;
  rejected: number;
}): boolean {
  return Boolean(layer.items.length || layer.notApproved || layer.rejected);
}

/* ============================== §3 · a biblioteca ============================== */

async function camadaDeVideo(input: {
  brandId: string;
  articleId: string;
}): Promise<RadarVideoEvidenceLayer | null> {
  const casamento = await loadRadarVideoBriefMatching({ brandId: input.brandId, articleId: input.articleId });

  /*
   * §14 · AUSÊNCIA NÃO VIRA CAMADA VAZIA.
   *
   * Sem pauta congelada ou sem execução de casamento, `null` é a resposta: uma
   * camada com `briefs: []` diria "investigamos o material e não achamos nada",
   * que é outra coisa — e chegaria ao Planejador com o peso de um resultado.
   */
  if (!radarVideoLayerIsWorthDelivering(casamento)) return null;

  /* A decisão acima já respondeu; o TypeScript precisa da mesma resposta. */
  const corrida = casamento.run!;
  const bundleCongelado = casamento.frozenBundleId!;

  const client = createCanonicalServiceClient();
  const usados = [...new Set(casamento.extracts.map(item => item.videoSourceId))];
  const fontes = usados.length
    ? await client
      .from("radar_video_sources")
      .select("id,video_title,display_name")
      .eq("brand_id", input.brandId)
      .in("id", usados)
    : { data: [] as Linha[] };

  const nomes = new Map(((fontes.data || []) as Linha[])
    .map(linha => [String(linha.id), texto(linha.video_title) || texto(linha.display_name)]));

  return buildRadarVideoEvidenceLayer({
    identity: {
      frozenBundleId: bundleCongelado,
      frozenBundleHash: casamento.frozenBundleHash,
      matchingRunId: corrida.runId,
      inputFingerprint: corrida.inputFingerprint,
      matcherVersion: casamento.matcherVersion,
      matchedAt: corrida.createdAt,
    },
    briefs: casamento.briefs,
    coverage: casamento.coverage,
    /*
     * §3 · O NOME DA FONTE, e o idioma e a versão do texto que a sustentou.
     *
     * Nada de `gs://`, de id de job nem de worker: eles descrevem COMO o texto
     * foi obtido, e o Planejador planeja com o que o texto DIZ.
     */
    sources: usados.map(id => ({
      videoSourceId: id,
      displayName: nomes.get(id) ?? null,
      languageCode: casamento.extracts.find(item => item.videoSourceId === id)?.sourceLanguage ?? null,
      processingVersion: casamento.extracts.find(item => item.videoSourceId === id)?.provenance.processingVersion ?? 1,
    })),
  });
}

/* ============================== §4 · o especialista ============================== */

async function camadaDoEspecialista(input: {
  brandId: string;
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash: string | null;
}): Promise<RadarSpecialistEvidenceLayer | null> {
  const client = createCanonicalServiceClient();

  const [pautas, contribuicoes] = await Promise.all([
    listExpertBriefsForContext({
      brandId: input.brandId,
      articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
    }, client),
    listExpertContributions(input.brandId, client),
  ]);

  if (!pautas.length) return null;

  const porPauta = new Map(pautas.map(item => [item.id, item]));
  const decisoes: Record<string, ReturnType<typeof radarSpecialistReviewsOf>[string]> = {};
  for (const pauta of pautas) Object.assign(decisoes, radarSpecialistReviewsOf(pauta.radarContext));

  const doArtigo = contribuicoes.filter(item => porPauta.has(item.briefId));
  if (!doArtigo.length) return null;

  const fontes: RadarSpecialistEvidenceSource[] = doArtigo.map(contribuicao => {
    const pauta = porPauta.get(contribuicao.briefId)!;
    const requisito = objeto(pauta.radarContext.specialistRequirement);

    return {
      extraction: radarSpecialistExtraction({
        contributionId: contribuicao.id,
        expertId: contribuicao.expertId,
        briefId: contribuicao.briefId,
        requirementId: radarSpecialistRequirementIdOf(pauta.radarContext),
        requirementKind: texto(requisito?.kind),
        requirementQuestion: texto(requisito?.question),
        sourceType: contribuicao.sourceType,
        originalText: contribuicao.originalText,
        transcriptText: contribuicao.transcriptText,
        organizationPayload: objeto(contribuicao.organizationPayload),
        /*
         * §4 · O CANAL NÃO ATRAVESSA, e ele é omitido na ORIGEM.
         *
         * `externalUpdateId` é o id da mensagem no Telegram; `originalAssetUri`
         * é o `gs://` do áudio; `checksum` é do arquivo. Nenhum dos três diz
         * nada sobre o conteúdo editorial, e os três são metadado privado do
         * canal por onde a resposta chegou.
         *
         * Filtrar aqui — e não na saída — é o que impede a próxima projeção de
         * levá-los junto sem ninguém notar.
         */
        externalUpdateId: null,
        originalAssetUri: null,
        checksum: null,
        receivedAt: contribuicao.receivedAt,
        decision: decisoes[contribuicao.id]?.decision || "NOT_APPROVED",
        classification: decisoes[contribuicao.id]?.classification ?? null,
      }),
      requirementQuestion: texto(requisito?.question) || pauta.title,
      requirementKind: texto(requisito?.kind) || "REVIEW_POINT",
      sentQuestions: (pauta.questions as unknown[])
        .map(item => texto(objeto(item)?.text) || texto(item))
        .filter((valor): valor is string => Boolean(valor)),
      expertDisplayName: null,
    };
  });

  const layer = buildRadarSpecialistEvidenceLayer({
    binding: {
      brandId: input.brandId,
      articleId: input.articleId,
      articleDnaVersionId: input.articleDnaVersionId,
      articleDnaContentHash: input.articleDnaContentHash,
    },
    /*
     * QUANTOS PONTOS A INVESTIGAÇÃO PREPAROU — o denominador da leitura.
     *
     * Duas pautas do mesmo ponto são um ponto preparado, não dois: é por isso
     * que a contagem é de requisitos DISTINTOS, e não de pautas.
     */
    preparedRequirements: new Set(pautas
      .map(pauta => radarSpecialistRequirementIdOf(pauta.radarContext))
      .filter((valor): valor is string => Boolean(valor))).size,
    sources: fontes,
  });

  /*
   * §14 · NENHUMA CONTRIBUIÇÃO ATIVA É `null`, não camada vazia.
   *
   * A diferença importa: `null` diz "não houve"; a camada com `items: []` e
   * `notApproved: 3` diz "houve, e ninguém decidiu". A segunda só pode existir
   * quando alguma resposta realmente chegou.
   */
  return radarSpecialistLayerIsWorthDelivering(layer) ? layer : null;
}

/* ============================== a leitura única ============================== */

export async function loadRadarCanonicalAuthorities(input: {
  brandId: string;
  articleId: string;
  article: VersionEnvelope<ArticleDNA>;
  analysis: RadarAnalysisVersion;
  /** Os snapshots já lidos pelo chamador, quando ele leu o lote inteiro. */
  serpRecords?: Awaited<ReturnType<SerpSnapshotRepository["list"]>>["records"];
}): Promise<RadarCanonicalAuthorities> {
  const item = await new WorkflowRepository().findByArticle(input.brandId, input.articleId, "radar");
  const lido = item ? RadarItemSchema.safeParse({ ...(item.payload as object), id: item.id }) : null;
  const researchContext = lido?.success
    ? buildRadarArticleResearchContext({ item: lido.data, article: input.article })
    : null;

  /*
   * §5 · O GOOGLE NÃO GANHA CONTRATO NOVO.
   *
   * A fotografia do pipeline já é campo do bundle (`observed`). O que faltava
   * era montá-la fora do React — e é isso, e só isso, que acontece aqui.
   */
  const perfil = radarPrimaryProfileOfAnalysis(input.analysis.payload);
  const snapshots = input.serpRecords
    ?? (perfil === "GOOGLE" ? (await new SerpSnapshotRepository().list(input.brandId, input.articleId)).records : []);

  const google = perfil === "GOOGLE" && researchContext
    ? radarGoogleReadModelOfAnalysis({
      context: researchContext,
      analysis: input.analysis,
      serpRecords: snapshots.filter(registro => registro.input.articleId === input.articleId),
      brandId: input.brandId,
      articleId: input.articleId,
      articleDnaVersionId: input.article.versionId,
    })
    : null;

  const [video, specialist] = await Promise.all([
    camadaDeVideo({ brandId: input.brandId, articleId: input.articleId }),
    camadaDoEspecialista({
      brandId: input.brandId,
      articleId: input.articleId,
      articleDnaVersionId: input.article.versionId,
      articleDnaContentHash: input.article.contentHash,
    }),
  ]);

  return { google, video, specialist, researchContext };
}
