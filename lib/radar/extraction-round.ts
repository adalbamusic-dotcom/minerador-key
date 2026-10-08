/**
 * ====== 2026-10-08 · A RODADA DE EXTRAÇÃO FECHA POR CHAVE — E A CONTA É UMA SÓ ======
 *
 * O DONO VIU ISTO: "Analisar concorrência · e finaliza (+ 1 chamada de IA)"
 * terminava com "17 selecionada(s) · 11 reutilizada(s) · 1 analisada(s)
 * agora · 5 sem acesso" — a conta fechada — e logo em seguida "Não finalizou
 * sozinha: a próxima etapa ainda é 'Analisar concorrência'". Cada clique novo
 * relia a mesma página e parava de novo, num laço.
 *
 * A CAUSA ERA DE IDENTIDADE. O extrator grava em `page.url` a URL FINAL, já
 * depois do redirect e serializada por `new URL()`: o acento do caminho vira
 * `%C3%B3`, o host vira punycode, a raiz ganha "/". A seleção conhece a URL
 * PEDIDA. A releitura comparava as duas pela URL normalizada — que tira
 * protocolo, `www.`, query e barra final, mas não absorve troca de caminho
 * nem percent-encoding — e a página lida virava "fora da seleção atual"
 * enquanto a referência dela continuava pendente para sempre.
 *
 * DUAS REGRAS FECHAM O VÃO:
 *
 *   1. A rodada fecha pela CHAVE do candidato, nunca pela URL que voltou. A
 *      página entra na amostra com a URL que a seleção pediu (a que o servidor
 *      buscou); a final serve só para limpar a extração órfã que o defeito já
 *      gravou. Candidato sem página e sem erro — inclusive a página que o
 *      contrato recusou — vira falha declarada (`no_outcome`), não espera. E
 *      duas referências que terminam na MESMA página contam o conteúdo uma
 *      vez: a repetida vira falha declarada (`redirect_duplicate`).
 *
 *   2. A conta é UMA régua: `radarExtractionAccount` é a mesma função na
 *      análise (`buildRadarAnalysisMembership`), na frase do fim da rodada e na
 *      Fase 1 (`buildRadarDeepResearchView`). Duas contas sobre a mesma amostra
 *      foi exatamente como "a análise fechou" e "a Fase 1 vê pendência"
 *      conviveram na mesma tela.
 *
 * `radarNormalizedUrl` NÃO mudou: ela alimenta o `referenceId` e o fingerprint
 * da curadoria, e mudá-la deixaria STALE toda curadoria já confirmada.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { RadarExtractionPage } from "./analysis-contracts.ts";
import { radarNormalizedUrl } from "./research-reference.ts";

/* ================================ a régua ================================ */

export type RadarExtractionAccount = {
  /** A seleção, uma URL por página (a primeira grafia vista). */
  selectedUrls: string[];
  /** Selecionadas que já têm extração. */
  analyzedUrls: string[];
  /** Selecionadas sem extração, com falha registrada. Desfecho, não espera. */
  failedUrls: string[];
  /** Selecionadas sem extração e sem falha. É o que uma análise ainda vai buscar. */
  pendingUrls: string[];
  /** Extrações que não pertencem à seleção. Cache, não membro. */
  orphanUrls: string[];
  selected: number;
  analyzed: number;
  failed: number;
  pending: number;
  orphans: number;
  /** `selected === analyzed + failed + pending`. Falso denuncia conta que não fecha. */
  consistent: boolean;
};

/**
 * SELECIONADAS = ANALISADAS + SEM ACESSO + PENDENTES — sempre, sem sobreposição.
 *
 * A identidade é a URL normalizada (`radarNormalizedUrl`). Quem passa as URLs
 * decide a seleção; esta função só conta, e conta igual para todos.
 */
export function radarExtractionAccount(input: {
  selectedUrls: readonly string[];
  extractionUrls: readonly string[];
  failureUrls: readonly string[];
}): RadarExtractionAccount {
  const porNormalizada = new Map<string, string>();
  for (const url of input.selectedUrls) {
    const chave = radarNormalizedUrl(url);
    if (chave && !porNormalizada.has(chave)) porNormalizada.set(chave, url);
  }
  const selectedUrls = [...porNormalizada.values()];
  const extraidas = new Set(input.extractionUrls.map(radarNormalizedUrl));
  /* Só a falha REGISTRADA conta como desfecho. */
  const falhadas = new Set(input.failureUrls.map(radarNormalizedUrl).filter(Boolean));

  const analyzedUrls = selectedUrls.filter(url => extraidas.has(radarNormalizedUrl(url)));
  const failedUrls = selectedUrls.filter(url => !extraidas.has(radarNormalizedUrl(url)) && falhadas.has(radarNormalizedUrl(url)));
  const pendingUrls = selectedUrls.filter(url => !extraidas.has(radarNormalizedUrl(url)) && !falhadas.has(radarNormalizedUrl(url)));
  const orphanUrls = [...new Map(input.extractionUrls
    .filter(url => !porNormalizada.has(radarNormalizedUrl(url)))
    .map(url => [radarNormalizedUrl(url), url])).values()];

  return {
    selectedUrls,
    analyzedUrls,
    failedUrls,
    pendingUrls,
    orphanUrls,
    selected: selectedUrls.length,
    analyzed: analyzedUrls.length,
    failed: failedUrls.length,
    pending: pendingUrls.length,
    orphans: orphanUrls.length,
    consistent: selectedUrls.length === analyzedUrls.length + failedUrls.length + pendingUrls.length,
  };
}

/* ========================= o fechamento da rodada ======================== */

/** A forma de `extractionFailures` na versão da análise. */
export type RadarExtractionRoundFailure = {
  key: string;
  url: string;
  code: string;
  message: string;
  status: number | null;
  observedAt: string;
};

/**
 * Uma resposta de página como a rota devolve: a chave do candidato, a URL que
 * o servidor buscou (`requestedUrl`, ausente em servidor anterior a esta
 * correção) e a página já validada pelo contrato — `null` quando ele a recusou.
 */
export type RadarExtractionRoundResponse = {
  key: string;
  requestedUrl: string | null;
  page: RadarExtractionPage | null;
};

/** O candidato que terminou a rodada sem página e sem erro. */
export const RADAR_EXTRACTION_NO_OUTCOME = "no_outcome";

/**
 * 2026-10-08 · A referência cuja página redireciona para o conteúdo que OUTRA
 * referência já trouxe à amostra. O conteúdo entra uma vez só; esta fica como
 * limitação declarada, com o destino dito na mensagem.
 */
export const RADAR_EXTRACTION_REDIRECT_DUPLICATE = "redirect_duplicate";

export type RadarExtractionRoundResult = {
  /** As páginas lidas agora, com a URL que a seleção pediu. */
  pages: RadarExtractionPage[];
  /** As falhas que a versão grava: as desta rodada mais as anteriores não tentadas de novo. */
  failures: RadarExtractionRoundFailure[];
  /** A amostra inteira depois da rodada: uma página por URL, sem a órfã que a releitura substituiu. */
  mergedExtractions: RadarExtractionPage[];
  /** Chaves sem página nem erro. Viraram falha `no_outcome`. */
  withoutOutcome: string[];
  /** Extrações antigas removidas por serem a URL final de uma página relida agora. */
  removedOrphans: string[];
};

export function radarReconcileExtractionRound(input: {
  /** O que a rodada pediu, pela chave que o servidor devolve, com a URL que a tela conhece. */
  candidates: ReadonlyArray<{ key: string; url: string }>;
  responses: readonly RadarExtractionRoundResponse[];
  /** As falhas finais da rodada, depois do retry. */
  failures: readonly RadarExtractionRoundFailure[];
  previousExtractions: readonly RadarExtractionPage[];
  /** As falhas gravadas na versão anterior. Só as não tentadas de novo seguem. */
  previousFailures?: readonly RadarExtractionRoundFailure[];
  /** A seleção corrente: a extração antiga só é limpa quando já não pertence a ela. */
  selectedUrls: readonly string[];
  observedAt: string;
}): RadarExtractionRoundResult {
  const pedidaPorChave = new Map(input.candidates.map(candidate => [candidate.key, candidate.url]));
  const comDesfecho = new Set<string>();
  const recusadasPeloContrato = new Set<string>();
  /* As URLs finais que não são a pedida: é por elas que a órfã antiga é achada. */
  const finaisDiferentes = new Set<string>();
  const pages: RadarExtractionPage[] = [];
  const selecionadas = new Set(input.selectedUrls.map(radarNormalizedUrl));

  const lidas: Array<{ key: string; pedida: string; final: string; finalUrl: string; page: RadarExtractionPage }> = [];
  for (const resposta of input.responses) {
    /* Chave que a rodada não pediu não entra: a amostra é a seleção, não o que voltou. */
    if (!pedidaPorChave.has(resposta.key) || comDesfecho.has(resposta.key)) continue;
    if (!resposta.page) { recusadasPeloContrato.add(resposta.key); continue; }
    const pedida = resposta.requestedUrl || pedidaPorChave.get(resposta.key)!;
    comDesfecho.add(resposta.key);
    lidas.push({ key: resposta.key, pedida, final: radarNormalizedUrl(resposta.page.url), finalUrl: resposta.page.url, page: resposta.page });
  }

  /*
   * 2026-10-08 · DUAS REFERÊNCIAS, UMA PÁGINA — O CONTEÚDO ENTRA UMA VEZ.
   *
   * A referência A redireciona para B. Se B também está selecionada e tem
   * página (lida agora pela própria URL, ou já na amostra), gravar A com a URL
   * pedida punha o conteúdo de B duas vezes no modelo — benchmark, termos e
   * competitividade contavam a mesma página em dobro. O mesmo vale para duas
   * referências que terminam na mesma página fora da seleção: a primeira
   * fica com ela. A repetida vira limitação declarada, com o destino dito.
   */
  const lidasPelaPropriaUrl = new Set(lidas.filter(lida => !lida.final || lida.final === radarNormalizedUrl(lida.pedida)).map(lida => radarNormalizedUrl(lida.pedida)));
  const jaNaAmostra = new Set(input.previousExtractions.map(page => radarNormalizedUrl(page.url)));
  const daRodada: RadarExtractionRoundFailure[] = [];
  for (const lida of lidas) {
    const redirecionou = Boolean(lida.final) && lida.final !== radarNormalizedUrl(lida.pedida);
    const deOutraReferencia = redirecionou && (lidasPelaPropriaUrl.has(lida.final) || (selecionadas.has(lida.final) && jaNaAmostra.has(lida.final)));
    const repetida = redirecionou && finaisDiferentes.has(lida.final);
    if (deOutraReferencia || repetida) {
      daRodada.push({
        key: lida.key,
        url: lida.pedida,
        code: RADAR_EXTRACTION_REDIRECT_DUPLICATE,
        message: `A página desta referência redireciona para ${lida.finalUrl}, que já está na amostra por outra referência; o conteúdo entra uma vez só, e esta referência fica como limitação declarada.`,
        status: null,
        observedAt: input.observedAt,
      });
      continue;
    }
    if (redirecionou) finaisDiferentes.add(lida.final);
    /* A identidade da página na amostra é a da seleção; a URL final só serve para achar a órfã antiga. */
    pages.push({ ...lida.page, url: lida.pedida });
  }

  for (const falha of input.failures) {
    if (comDesfecho.has(falha.key)) continue;
    comDesfecho.add(falha.key);
    daRodada.push(falha);
  }

  const withoutOutcome: string[] = [];
  for (const [key, url] of pedidaPorChave) {
    if (comDesfecho.has(key)) continue;
    withoutOutcome.push(key);
    daRodada.push({
      key,
      url,
      code: RADAR_EXTRACTION_NO_OUTCOME,
      message: recusadasPeloContrato.has(key)
        ? "A página foi lida, mas o conteúdo não passou no contrato de extração; ela fica fora da amostra como limitação declarada."
        : "A leitura não devolveu página nem erro para esta referência; ela fica fora da amostra como limitação declarada.",
      status: null,
      observedAt: input.observedAt,
    });
  }

  /* Uma página por URL: a relida substitui a antiga, e a órfã da URL final sai. */
  const novas = new Set(pages.map(page => radarNormalizedUrl(page.url)));
  const removedOrphans: string[] = [];
  const mantidas = input.previousExtractions.filter(page => {
    const chave = radarNormalizedUrl(page.url);
    if (novas.has(chave)) return false;
    if (finaisDiferentes.has(chave) && !selecionadas.has(chave)) { removedOrphans.push(page.url); return false; }
    return true;
  });
  const mergedExtractions = [...mantidas, ...pages];

  /*
   * A FALHA ANTERIOR NÃO TENTADA CONTINUA SENDO DESFECHO.
   *
   * A rodada normal tenta de novo todas as sem acesso, e então nada herda. A
   * rodada que lê só as pendentes não as tenta — e sem herdar, as "sem acesso"
   * voltariam a ser pendentes na versão nova.
   */
  const tentadas = new Set([...pedidaPorChave.values()].map(radarNormalizedUrl));
  const extraidas = new Set(mergedExtractions.map(page => radarNormalizedUrl(page.url)));
  const jaNaRodada = new Set(daRodada.map(falha => radarNormalizedUrl(falha.url)));
  const herdadas = (input.previousFailures || []).filter(falha => {
    const chave = radarNormalizedUrl(falha.url);
    return Boolean(chave) && selecionadas.has(chave) && !tentadas.has(chave) && !extraidas.has(chave) && !jaNaRodada.has(chave);
  });

  return {
    pages,
    failures: [...herdadas, ...daRodada],
    mergedExtractions,
    withoutOutcome,
    removedOrphans,
  };
}
