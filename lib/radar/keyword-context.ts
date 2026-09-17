import type { RadarArticleResearchContext } from "./article-research-context.ts";

/**
 * ===== O CONTEXTO CANÔNICO DE KEYWORD — KEYWORD_CONTEXT_1 · §2 e §3 =====
 *
 * ==================== A LACUNA QUE ISTO FECHA ====================
 *
 * O dossiê entregue ao Planejador carregava o TEXTO da keyword principal em um
 * só lugar: `observed.identity.principal`, que é da fotografia do pipeline do
 * Google. Num artigo de vídeo ou de produto aquele campo nunca existiu.
 *
 * O Planejador então só tinha o título e o slug do artigo — e nenhum dos dois é
 * a keyword. "Skincare para pele oleosa" pode virar o slug `cuidados-pele-
 * oleosa` e o título "Como cuidar da pele oleosa no dia a dia": três textos
 * diferentes, um único fundamento. Planejar pelo título é planejar pela
 * formulação de quem escreveu o título.
 *
 * ==================== A AUTORIDADE, EXATAMENTE ====================
 *
 * O PAPEL de cada keyword — principal, secundária, reforço narrativo — é
 * declaração do ArticleDNA: ele vive em `keywordReferences[].role`.
 *
 * O TEXTO não está no payload do ArticleDNA: nem `KeywordDNA` nem
 * `ArticleKeywordReference` têm campo de texto. Ele vive na HIDRATAÇÃO, que é
 * capturada no import do Arquiteto e amarrada ao mesmo `articleDnaVersionId`.
 *
 * `RadarArticleResearchContext` é quem junta os dois — referência do Arquiteto
 * para o papel, hidratação daquela versão para o texto — e declara em
 * `provenance.textSource` de onde o texto veio. É por isso que ele é a entrada
 * desta função, e não o payload cru.
 *
 * ==================== O QUE NUNCA É FALLBACK — §5 ====================
 *
 * Título, slug e consulta da SERP. Os três existem, os três são parecidos com
 * a keyword em muitos artigos, e é justamente por isso que usá-los produziria
 * um erro que ninguém percebe: o Planejador planejaria para um termo que a
 * formação nunca qualificou.
 *
 * Keyword não resolvida é `null`. Ausência declarada, nunca substituída.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

export type RadarKeywordContext = {
  /** `null` quando a hidratação daquela versão não resolveu o texto. */
  principal: string | null;
  secondary: string[];
  narrativeReinforcements: string[];
  /**
   * COMO O TEXTO FOI RESOLVIDO — e não de onde o PAPEL veio.
   *
   * O papel é sempre do ArticleDNA. `UNRESOLVED` diz que a hidratação daquela
   * versão não trouxe o texto, o que é diferente de "o artigo não tem keyword".
   */
  resolution: "ARTICLE_DNA_HYDRATION" | "UNRESOLVED";
};

export const RADAR_EMPTY_KEYWORD_CONTEXT: RadarKeywordContext = {
  principal: null, secondary: [], narrativeReinforcements: [], resolution: "UNRESOLVED",
};

const texto = (valor: string | null | undefined): string | null =>
  typeof valor === "string" && valor.trim() ? valor.trim() : null;

/**
 * §2 e §3 · O CONTEXTO, MONTADO DA AUTORIDADE — e de nenhuma outra.
 *
 * Nada aqui olha para título, slug, perfil de pesquisa ou consulta executada.
 * A única entrada é a composição de keywords que o Arquiteto aprovou, com o
 * texto resolvido pela hidratação daquela mesma versão.
 */
export function radarKeywordContextOf(context: RadarArticleResearchContext | null | undefined): RadarKeywordContext {
  const keywords = context?.keywords || [];
  if (!keywords.length) return RADAR_EMPTY_KEYWORD_CONTEXT;

  const porPapel = (papel: "principal" | "secundaria" | "reforco_narrativo") => keywords
    .filter(item => item.identity.role === papel)
    .map(item => texto(item.identity.text))
    .filter((valor): valor is string => Boolean(valor));

  const principal = porPapel("principal")[0] ?? null;

  return {
    principal,
    secondary: porPapel("secundaria"),
    narrativeReinforcements: porPapel("reforco_narrativo"),
    /*
     * A RESOLUÇÃO DESCREVE A PRINCIPAL, e é ela que decide o planejamento.
     *
     * Um artigo com secundárias resolvidas e principal perdida não está
     * resolvido: o Planejador planejaria a partir do apoio.
     */
    resolution: principal ? "ARTICLE_DNA_HYDRATION" : "UNRESOLVED",
  };
}

/**
 * ===== §5 · A LEITURA COMPATÍVEL COM O QUE JÁ ESTÁ GRAVADO =====
 *
 * Dossiês V3 gravados antes deste gate não têm `keywordContext`. Eles continuam
 * válidos e continuam legíveis: quem os lê resolve pelo fundamento canônico que
 * o `binding` identifica — que é a mesma autoridade, alcançada pelo caminho
 * mais longo.
 *
 * O que NÃO acontece em nenhum dos dois caminhos é cair para título ou slug.
 */
export function radarKeywordContextOfBundle(
  bundle: { keywordContext?: RadarKeywordContext | null } | null | undefined,
  fallback: RadarArticleResearchContext | null | undefined,
): RadarKeywordContext {
  const gravado = bundle?.keywordContext;
  if (gravado && gravado.principal) return gravado;

  const resolvido = radarKeywordContextOf(fallback);
  /*
   * O GRAVADO SÓ PERDE PARA UMA RESOLUÇÃO QUE REALMENTE RESOLVE.
   *
   * Um dossiê que gravou `principal: null` não fica pior por continuar `null`;
   * ele fica pior se uma leitura vazia sobrescrever o que ele já dizia sobre as
   * secundárias.
   */
  if (resolvido.principal) return resolvido;
  return gravado ?? resolvido;
}
