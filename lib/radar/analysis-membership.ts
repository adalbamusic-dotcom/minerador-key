/**
 * CACHE TÉCNICO NÃO É PERTENCIMENTO À AMOSTRA.
 *
 * O smoke confirmou sete referências e a tela respondeu "Nenhuma das 1
 * página(s) selecionada(s) pôde ser analisada." O "1" não era a seleção: era o
 * que faltava extrair, porque as outras seis já estavam extraídas na versão
 * anterior da análise e foram reaproveitadas. Duas coisas diferentes usavam a
 * mesma palavra, e a conta não fechava para quem lia.
 *
 * Aqui as duas ficam separadas e contadas:
 *
 *   selecionadas = a curadoria confirmada de agora
 *   reutilizadas = já extraídas E ainda selecionadas
 *   falhadas     = tentadas nesta versão e recusadas pela origem
 *   pendentes    = selecionadas sem extração e sem falha registrada
 *   órfãs        = extrações que não pertencem mais à seleção
 *
 * Uma extração existir nunca decide se a página está na amostra: quem decide é
 * a seleção confirmada.
 *
 *   selecionadas = reutilizadas + falhadas + pendentes   (sempre, sem overlap)
 *
 * A FALHA PRECISOU SAIR DE "PENDENTE". Uma página que a origem recusa nunca
 * vira extração, então ela voltava para a fila em toda análise e a tela dizia
 * "1 pendente" para sempre. Falha definitiva é um desfecho, não uma espera.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { RadarAnalysisVersion } from "./analysis-contracts.ts";
import type { RadarSerpView } from "./snapshot-view.ts";
import { buildRadarSerpSelectionProjection, type RadarSerpSelectionScope } from "./serp-curation.ts";
import { radarNormalizedUrl } from "./research-reference.ts";

export type RadarAnalysisMembership = {
  /** A seleção confirmada corrente. É ela que define a amostra. */
  selected: number;
  /** Selecionadas que já têm extração — entram sem nova busca externa. */
  reused: number;
  /** Selecionadas cuja extração falhou nesta versão. Desfecho, não espera. */
  failed: number;
  /** Selecionadas sem extração e sem falha. É o que uma nova análise vai buscar. */
  pending: number;
  /** Páginas que compõem a amostra corrente (as reutilizadas). */
  analyzed: number;
  /** Extrações que sobraram de uma seleção anterior. Cache, não membro. */
  orphanExtractions: number;
  selectedUrls: string[];
  reusedUrls: string[];
  failedUrls: string[];
  pendingUrls: string[];
  orphanUrls: string[];
  /** `selected === reused + failed + pending`. Falso denuncia conta que não fecha. */
  consistent: boolean;
};

export function buildRadarAnalysisMembership(input: {
  view: RadarSerpView | null | undefined;
  analysis: RadarAnalysisVersion | null | undefined;
  scope?: RadarSerpSelectionScope;
  /*
   * As URLs que a CURADORIA DA PESQUISA confirmou.
   *
   * Sem elas, uma página descoberta por consulta auxiliar e extraída apareceria
   * como "extração órfã" — o contador acusando de sobra exatamente o que o lote
   * passou a permitir. A amostra é a união das duas curadorias.
   */
  researchSelectedUrls?: readonly string[];
}): RadarAnalysisMembership {
  const projection = buildRadarSerpSelectionProjection(input.view, input.analysis, input.scope);
  /*
   * A IDENTIDADE É A URL NORMALIZADA — a mesma da pesquisa profunda.
   *
   * Comparar string crua fazia a mesma página aparecer duas vezes na conta
   * quando ela vinha da curadoria canônica E da curadoria da pesquisa, com
   * `www.` ou barra final de diferença. Duas contagens, um só destino.
   */
  const canonicalUrls = projection.compatible ? projection.selectedRows.map(row => row.result.url) : [];
  const porNormalizada = new Map<string, string>();
  for (const url of [...canonicalUrls, ...(input.researchSelectedUrls || [])]) {
    const chave = radarNormalizedUrl(url);
    if (chave && !porNormalizada.has(chave)) porNormalizada.set(chave, url);
  }
  const selectedUrls = [...porNormalizada.values()];
  const selecionadas = new Set(porNormalizada.keys());

  const extractedUrls = projection.compatible ? (input.analysis?.payload.extractions || []).map(page => page.url) : [];
  const extraidas = new Set(extractedUrls.map(radarNormalizedUrl));
  /* Só a falha REGISTRADA nesta versão conta como desfecho. */
  const falhadas = new Set((input.analysis?.payload.extractionFailures || []).map(item => radarNormalizedUrl(item.url)).filter(Boolean));

  const reusedUrls = selectedUrls.filter(url => extraidas.has(radarNormalizedUrl(url)));
  const failedUrls = selectedUrls.filter(url => !extraidas.has(radarNormalizedUrl(url)) && falhadas.has(radarNormalizedUrl(url)));
  const pendingUrls = selectedUrls.filter(url => !extraidas.has(radarNormalizedUrl(url)) && !falhadas.has(radarNormalizedUrl(url)));
  const orphanUrls = [...new Map(extractedUrls
    .filter(url => !selecionadas.has(radarNormalizedUrl(url)))
    .map(url => [radarNormalizedUrl(url), url])).values()];

  return {
    selected: selectedUrls.length,
    reused: reusedUrls.length,
    failed: failedUrls.length,
    pending: pendingUrls.length,
    analyzed: reusedUrls.length,
    orphanExtractions: orphanUrls.length,
    selectedUrls,
    reusedUrls,
    failedUrls,
    pendingUrls,
    orphanUrls,
    consistent: selectedUrls.length === reusedUrls.length + failedUrls.length + pendingUrls.length,
  };
}

/**
 * A frase da amostra, com as três contas visíveis.
 *
 * "7 selecionadas · 6 reutilizadas · 1 pendente" responde de uma vez por que
 * uma análise nova vai buscar só uma página sem sugerir que a seleção encolheu.
 */
export function radarMembershipLabel(membership: RadarAnalysisMembership): string {
  const partes = [`${membership.selected} selecionada(s)`];
  if (membership.reused) partes.push(`${membership.reused} já analisada(s)`);
  if (membership.failed) partes.push(`${membership.failed} sem acesso`);
  if (membership.pending) partes.push(`${membership.pending} pendente(s)`);
  if (membership.orphanExtractions) partes.push(`${membership.orphanExtractions} fora da seleção atual`);
  return partes.join(" · ");
}
