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

import { SerpCollectionRecordSchema, SerpQueryInputSchema } from "../editorial/contracts.ts";
import type { SerpSearchInput } from "../radar/serp/contracts.ts";
import { collectDataForSeoSerpSnapshot } from "./dataforseo-serp-operation.ts";
import { resolveDataForSeoCanonicalSerpCompatibilityConfig } from "./dataforseo-canonical.ts";
import { recordIntegrationUsage } from "./integrations-runtime.ts";
import { ArtifactRepository, SerpSnapshotRepository } from "./editorial-repositories.ts";
import { radarDeclaredArticleIntent } from "../radar/editorial-identity.ts";
import { radarSerpSnapshotSummary } from "../radar/serp-snapshot-summary.ts";
import type { RadarResearchSourceRole } from "../radar/research-profile.ts";

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
}): Promise<RadarSupportCollectionOutcome> {
  const keyword = (input.primaryKeyword || "").trim() || null;

  try {
    if (!keyword) {
      return { status: "SKIPPED", reason: "A keyword principal deste artigo não foi resolvida; o apoio do Google não foi coletado." };
    }
    const artefatos = await new ArtifactRepository().list(input.brandId);
    const article = artefatos.articles.find(version =>
      version.payload.articleId === input.articleId && version.payload.brandId === input.brandId);
    if (!article) return { status: "SKIPPED", reason: "O ArticleDNA canônico deste artigo não foi encontrado." };

    const referencia = article.payload.keywordReferences.find(item =>
      item.role === "principal" && item.keywordId === article.payload.principalKeywordId);

    const repositorio = new SerpSnapshotRepository();
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

    const consulta = SerpQueryInputSchema.parse({
      keyword, articleId: input.articleId, location: input.location, language: "pt-br", device: "desktop",
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
      expectedIntent: radarDeclaredArticleIntent(article.payload) || "",
      expectedFormat: article.payload.hierarchy,
      requiredTopics: article.payload.requiredTopics,
      articleEntities: article.payload.entities,
      resultLimit: Number.parseInt(process.env.SERP_DEFAULT_RESULTS || "10", 10) || 10,
      version: (anterior?.research?.version || 0) + 1,
      previousSnapshotId: anterior?.id || null,
    };

    const resolucao = await resolveDataForSeoCanonicalSerpCompatibilityConfig({
      actorUserId: input.actorUserId, brandId: input.brandId, quotaUnits: 1,
    });
    const operationRequestId = crypto.randomUUID();
    const research = await collectDataForSeoSerpSnapshot(busca, { config: resolucao.config, operationRequestId });

    await recordIntegrationUsage({
      resource: resolucao.resource,
      operation: "module_operation",
      module: "radar",
      resultStatus: "succeeded",
      units: 1,
      idempotencyKey: `dataforseo:radar:support:${operationRequestId}:${input.articleId}`,
      providerReference: null,
      metadata: { operationKind: "serp_support", articleId: input.articleId, role: input.role, snapshotId: research.id },
    });

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
    await new SerpSnapshotRepository().save(input.brandId, registro, input.actorUserId);

    return { status: "COLLECTED", snapshotId: research.id, keyword, role: input.role, collectedAt: new Date().toISOString() };
  } catch (erro) {
    return {
      status: "FAILED",
      reason: (erro instanceof Error ? erro.message : "A leitura de apoio do Google falhou.").slice(0, 500),
      keyword,
    };
  }
}
