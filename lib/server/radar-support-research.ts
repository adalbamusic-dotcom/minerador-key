/**
 * ===== O APOIO DO GOOGLE, ORQUESTRADO NO SERVIDOR — 1.1 · §3 e §4 =====
 *
 * ==================== O DESENHO QUE ESTE MÓDULO SUBSTITUI ====================
 *
 * No perfil YouTube o apoio foi encadeado no NAVEGADOR: a primeira requisição
 * terminava, e a segunda só começava se a aba continuasse viva. Fechar o
 * navegador entre as duas deixava a investigação pela metade, com a coleta
 * principal paga e o apoio nunca feito.
 *
 * Aqui as duas coletas acontecem na MESMA requisição de servidor. O navegador
 * dispara a intenção e pode morrer em seguida: o que estiver gravado é o que
 * aconteceu, e o que faltar é recuperável sem repetir o que já custou.
 *
 * ==================== O QUE O APOIO É, E O QUE NÃO É ====================
 *
 * §4: UMA consulta ao Google, sobre a keyword principal canônica. Ela produz
 * snapshot de SERP — que é evidência com autoridade própria — e para aí.
 *
 * NÃO abre curadoria, NÃO pede seleção de dez concorrentes, NÃO inicia deep
 * research e NÃO cria um segundo FINALIZE. O erro que isso evita já aconteceu
 * uma vez: o apoio do YouTube entrava pelo caminho da investigação Google
 * PRINCIPAL e o runtime respondia "este snapshot não possui payload canônico
 * completo".
 *
 * §4 · SEM KEYWORD PRINCIPAL, SEM APOIO. O título do artigo não entra como
 * reserva silenciosa: ele é promessa editorial, não formulação de busca, e a
 * SERP voltaria de outra intenção.
 */

/*
 * ==================== R4 · O APOIO NAS QUATRO LENTES ====================
 *
 * SDD do Radar nas quatro lentes. Sem SERP real no artigo, o apoio passa pelo
 * MESMO núcleo da SERP canônica (`collectRadarSerpLensSnapshot`): cache
 * primeiro nas quatro lentes, só as faltantes pagas, canônica em 20 e extras
 * em 10, gravadas como `radar`. Os códigos de local e idioma são os do ALVO da
 * keyword principal — não mais o literal "pt-br" nem o desktop fixo sem
 * sistema. Com SERP real no artigo, nada muda: ela é reaproveitada.
 */

import type { ArticleDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import { SerpCollectionRecordSchema, SerpQueryInputSchema, type SerpCollectionRecord } from "../editorial/contracts.ts";
import { SERP_CACHE_CANONICAL_LENS } from "../editorial/serp-cache.ts";
import { readDataForSeoTargetCodes } from "../minerador/dataforseo-serp-core.ts";
import type { SerpSearchInput } from "../radar/serp/contracts.ts";
import { RADAR_SERP_MAX_AGE_MS, RADAR_SERP_SNAPSHOT_DEPTH } from "../radar/serp/lens-set.ts";
import { resolveDataForSeoCanonicalSerpCompatibilityConfig } from "./dataforseo-canonical.ts";
import { recordIntegrationUsage } from "./integrations-runtime.ts";
import { ArtifactRepository, SerpSnapshotRepository } from "./editorial-repositories.ts";
import { getOperationalClient } from "./editorial-db.ts";
import { collectRadarSerpLensSnapshot, readRadarKeywordTargetCodes, type RadarSerpLensDeps, type RadarSerpTargetCodes } from "./radar-serp-lenses.ts";
import { radarGoogleSerpWriteLockAtSave } from "./radar-serp-write-lock.ts";
import type { RadarGoogleSerpWriteDecision } from "../radar/google-research-write-lock.ts";
import type { SerpCacheContext } from "./serp-cache-store.ts";
import { radarDeclaredArticleIntent } from "../radar/editorial-identity.ts";
import { radarSerpSnapshotSummary } from "../radar/serp-snapshot-summary.ts";
import type { RadarResearchSourceRole } from "../radar/research-profile.ts";

/**
 * As portas do apoio. Em produção, todas as padrão; os testes trocam banco,
 * provider e repositórios sem rede e sem chamada paga.
 */
export type RadarGoogleSupportDeps = {
  loadArticles?: (brandId: string) => Promise<{ articles: ReadonlyArray<VersionEnvelope<ArticleDNA>> }>;
  snapshots?: {
    list: (brandId: string, articleId: string) => Promise<{ records: readonly SerpCollectionRecord[] }>;
    save: (brandId: string, record: SerpCollectionRecord, actorUserId: string) => Promise<unknown>;
  };
  /** O cliente do cache e da leitura do alvo da keyword. */
  cacheClient?: SerpCacheContext["supabase"];
  environmentCodes?: RadarSerpTargetCodes;
  lenses?: Partial<RadarSerpLensDeps>;
  now?: () => Date;
  /** A trava da investigação Google do artigo; em produção, a leitura leve da SERP (R1b). */
  googleSerpLock?: () => Promise<RadarGoogleSerpWriteDecision>;
};

export const RADAR_SUPPORT_GOOGLE_FINALIZED_REASON =
  "A investigação Google deste artigo está finalizada: a SERP congelada não é recoletada nem ganha snapshot novo pelo apoio. Reabra a investigação antes de coletar de novo.";
export const RADAR_SUPPORT_FINALIZED_DURING_COLLECTION_REASON =
  "A investigação Google foi finalizada enquanto o apoio era coletado. A coleta foi feita e registrada no uso, mas não foi gravada como snapshot.";

export type RadarSupportCollectionOutcome =
  | { status: "COLLECTED"; snapshotId: string; keyword: string; role: RadarResearchSourceRole; collectedAt: string }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; reason: string; keyword: string | null };

/**
 * COLETA O APOIO E DEVOLVE O DESFECHO — nunca lança.
 *
 * §5 · A falha do apoio não pode derrubar a coleta principal, que já foi paga.
 * Propagar o erro faria o pacote inteiro parecer falho e convidaria a um START
 * novo que cobraria tudo de novo para corrigir uma leitura que custou uma.
 */
export async function collectRadarGoogleSupport(input: {
  brandId: string;
  articleId: string;
  actorUserId: string;
  role: RadarResearchSourceRole;
  location: string;
  /**
   * §4 · A KEYWORD PRINCIPAL — a MESMA que a coleta primária usou.
   *
   * Ela chega de fora, já conferida: a rota recalcula o hash do texto antes de
   * qualquer gasto, então o que entra aqui é o que o provider recebeu do outro
   * lado. Resolvê-la de novo aqui abriria um segundo caminho de resolução, e
   * dois caminhos acabam discordando — foi assim que o alvo do artigo passou a
   * ser inferido de duas maneiras no 2.1.
   *
   * O título NUNCA entra como reserva: ele é promessa editorial, não
   * formulação de busca, e a SERP voltaria de outra intenção.
   */
  primaryKeyword: string | null;
}, deps: RadarGoogleSupportDeps = {}): Promise<RadarSupportCollectionOutcome> {
  const keyword = (input.primaryKeyword || "").trim() || null;

  try {
    if (!keyword) {
      return { status: "SKIPPED", reason: "A keyword principal deste artigo não foi resolvida; o apoio do Google não foi coletado." };
    }
    const artefatos = await (deps.loadArticles ? deps.loadArticles(input.brandId) : new ArtifactRepository().list(input.brandId));
    const article = artefatos.articles.find(version =>
      version.payload.articleId === input.articleId && version.payload.brandId === input.brandId);
    if (!article) return { status: "SKIPPED", reason: "O ArticleDNA canônico deste artigo não foi encontrado." };

    const referencia = article.payload.keywordReferences.find(item =>
      item.role === "principal" && item.keywordId === article.payload.principalKeywordId);

    const repositorio = deps.snapshots || new SerpSnapshotRepository();
    const historico = await repositorio.list(input.brandId, input.articleId);
    const reais = historico.records.filter(registro => registro.origin === "real" && registro.research);
    const anterior = reais.at(-1);

    /*
     * UM SNAPSHOT QUE JÁ EXISTE NÃO É RECOLETADO.
     *
     * O artigo pode ter passado por outro perfil antes. Pagar a mesma SERP de
     * novo para carimbar "apoio coletado" cobraria da pessoa a troca de perfil.
     */
    if (anterior?.research) {
      return {
        status: "COLLECTED",
        snapshotId: anterior.research.id,
        keyword,
        role: input.role,
        collectedAt: new Date().toISOString(),
      };
    }

    /*
     * A TRAVA DO FINALIZE VALE PARA O APOIO TAMBÉM (R1b).
     *
     * Sem SERP real, o apoio gravaria um snapshot novo no artigo — inclusive
     * por acerto de cache, sem chamada paga. Com a investigação Google
     * finalizada, isso é snapshot novo sob fotografia congelada, que a rota da
     * SERP já recusa. A pergunta vem ANTES do cache, da credencial e da quota,
     * e de novo antes de gravar, como na rota.
     */
    const trava = deps.googleSerpLock || (() => radarGoogleSerpWriteLockAtSave(input.brandId, input.articleId));
    if (!(await trava()).allowed) return { status: "SKIPPED", reason: RADAR_SUPPORT_GOOGLE_FINALIZED_REASON };

    /*
     * OS CÓDIGOS DO ALVO DA KEYWORD, pela mesma leitura da SERP canônica: é o
     * que faz a SERP que o Minerador já pagou servir aqui de graça. O texto do
     * idioma no pedido passa a ser o código consultado, não um literal.
     */
    const cliente = deps.cacheClient || getOperationalClient();
    const alvo = await readRadarKeywordTargetCodes(cliente, input.brandId, article.payload.principalKeywordId, deps.environmentCodes || readDataForSeoTargetCodes());

    const consulta = SerpQueryInputSchema.parse({
      keyword, articleId: input.articleId, location: input.location, language: alvo.codes.languageCode, device: SERP_CACHE_CANONICAL_LENS.device,
    });

    const busca: SerpSearchInput = {
      brandId: input.brandId,
      articleId: input.articleId,
      articleDnaVersionId: article.versionId,
      keywordId: article.payload.principalKeywordId,
      keywordDnaVersionId: referencia?.keywordDnaVersionId || article.payload.principalKeywordId,
      keyword: consulta.keyword,
      location: consulta.location,
      language: consulta.language,
      device: consulta.device,
      operatingSystem: SERP_CACHE_CANONICAL_LENS.operatingSystem,
      expectedIntent: radarDeclaredArticleIntent(article.payload) || "",
      expectedFormat: article.payload.hierarchy,
      requiredTopics: article.payload.requiredTopics,
      articleEntities: article.payload.entities,
      resultLimit: RADAR_SERP_SNAPSHOT_DEPTH,
      version: (anterior?.research?.version || 0) + 1,
      previousSnapshotId: anterior?.id || null,
    };

    const lentes = await collectRadarSerpLensSnapshot({
      context: { supabase: cliente, brandId: input.brandId, actorUserId: input.actorUserId },
      searchInput: busca,
      codes: alvo.codes,
      codesSource: alvo.source,
      cacheKeywordId: alvo.cacheKeywordId,
      previous: null,
      recollect: false,
      now: deps.now ? deps.now() : new Date(),
      maxAgeMs: RADAR_SERP_MAX_AGE_MS,
      operationRequestId: crypto.randomUUID(),
      purpose: "support",
      usageMetadata: { role: input.role },
    }, {
      resolveConfig: deps.lenses?.resolveConfig
        || (quotaUnits => resolveDataForSeoCanonicalSerpCompatibilityConfig({ actorUserId: input.actorUserId, brandId: input.brandId, quotaUnits })),
      recordUsage: deps.lenses?.recordUsage || recordIntegrationUsage,
      ...(deps.lenses?.fetchImpl ? { fetchImpl: deps.lenses.fetchImpl } : {}),
    });
    const research = lentes.research;

    /*
     * O SNAPSHOT É GRAVADO como evidência — e é só isso.
     *
     * `needs_review` é o estado do snapshot no contrato da SERP; ele não abre
     * curadoria por si. Quem abre curadoria é o clique de "Iniciar curadoria"
     * do perfil Google, que este caminho nunca toca.
     */
    const registro = SerpCollectionRecordSchema.parse({
      id: research.id,
      input: consulta,
      status: "needs_review",
      provider: "dataforseo",
      origin: "real",
      isMock: false,
      /*
       * ===== 1.1 · §20 · O RESUMO CANÔNICO, E NÃO UM PARECIDO =====
       *
       * Isto era `{ query, resultCount }` — um objeto plausível que o contrato
       * não aceita. `SerpCollectionRecord.snapshot` é um `SerpSnapshot` do
       * Arquiteto, com `schemaVersion`, `keyword`, `location`, `capturedAt` e
       * mais oito campos.
       *
       * O `parse` estourava AQUI, três linhas depois da chamada paga e depois
       * do registro de uso. A coleta do Google acontecia, era cobrada, e ia
       * inteira para o `catch` como "apoio falhou" — e o retry pagava de novo.
       *
       * O erro real, lido do banco: `snapshot.schemaVersion Invalid input:
       * expected 1` seguido de `snapshot.keyword` e `snapshot.location`
       * `undefined`.
       */
      snapshot: radarSerpSnapshotSummary(research),
      research,
      persistenceMode: "local",
      cost: null,
      error: null,
      dnaIntent: radarDeclaredArticleIntent(article.payload),
      conflictReason: null,
      humanDecisionRequired: false,
    });
    if (!(await trava()).allowed) return { status: "SKIPPED", reason: RADAR_SUPPORT_FINALIZED_DURING_COLLECTION_REASON };
    await repositorio.save(input.brandId, registro, input.actorUserId);

    return { status: "COLLECTED", snapshotId: research.id, keyword, role: input.role, collectedAt: new Date().toISOString() };
  } catch (erro) {
    return {
      status: "FAILED",
      reason: (erro instanceof Error ? erro.message : "A leitura de apoio do Google falhou.").slice(0, 500),
      keyword,
    };
  }
}
