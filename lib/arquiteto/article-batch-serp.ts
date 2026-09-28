/*
 * PRIMEIRA COLETA DA SERP DO LOTE — domínio puro, sem React, sem rede.
 *
 * SDD `docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md`,
 * fatia A2. Desde 2026-09-28 o Minerador não coleta mais SERP como etapa
 * obrigatória: a PRIMEIRA coleta acontece aqui, na aba Artigos, ANTES da
 * formação, para TODAS as keywords COM VOLUME do lote (os Silos confirmados
 * que estão sendo formados). Keyword sem volume nunca é coletada.
 *
 * - "Com volume" é o predicado único das coletas novas: `volume_search`
 *   finito e maior que zero (`hasSearchVolume`). Na prática é a média do
 *   Google Ads gravada pelo processo Volume; uma keyword importada com volume
 *   de planilha e ainda não medida também conta, porque o predicado lê a
 *   coluna, não a origem. A estimativa do Labs não conta.
 * - A coleta é pelo núcleo da rota `keyword-serp` (keyword × lente, 4 lentes,
 *   cache primeiro com validade de 30 dias, canônica com profundidade 20 e
 *   corpo), em blocos que cabem no teto da rota, com UM plano somado e UMA
 *   confirmação (`runPaidSerpBlocks`).
 * - O que já está no cache não entra no plano pago: com tudo no cache, a
 *   coleta é só leitura e segue sem diálogo.
 *
 * Nada aqui decide formação: depois da coleta, o índice "mesmo assunto"
 * (D2.2) é relido do cache e a formação é refeita com ele.
 */

import { hasSearchVolume } from "./serp-subject-suggestions.ts";

/**
 * Keywords por pedido à rota `keyword-serp`: 6 keywords × 4 lentes = até 24
 * consultas por pedido. O teto da rota é de 12 KEYWORDS por pedido (e 200
 * consultas autorizadas), então o bloco cabe com folga.
 */
export const ARTICLE_BATCH_SERP_BLOCK_SIZE = 6;

export type ArticleBatchSerpKeywordInput = {
  id: string | number;
  keyword?: string | null;
  volume_search?: number | null;
  territoryRef?: unknown;
};

export type ArticleBatchSerpTarget = { keywordId: string; keyword: string };

export type ArticleBatchSerpLot = {
  /** Keywords COM volume do lote, sem repetição de texto: são as coletadas. */
  targets: ArticleBatchSerpTarget[];
  /** Keywords do lote SEM volume: nunca coletadas. */
  withoutVolume: ArticleBatchSerpTarget[];
  /** Mesmo texto de outra keyword do lote: a chave do cache é a mesma, paga uma vez só. */
  sameTextAs: { keywordId: string; keyword: string; sameAsKeywordId: string }[];
  /** Os pedidos à rota, na ordem. */
  blocks: ArticleBatchSerpTarget[][];
  /** Os Silos do lote, ordenados. */
  siloRefs: string[];
};

const normalizar = (texto: string) => texto.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * O lote da coleta: as keywords dos Silos em formação (a tela inclui a cabeça
 * da SiloPage com volume), menos as que o chamador excluir, separadas entre
 * com e sem volume.
 */
export function planArticleBatchSerpLot(input: {
  keywords: readonly ArticleBatchSerpKeywordInput[];
  siloRefs: Iterable<string>;
  excludedKeywordIds?: ReadonlySet<string>;
  blockSize?: number;
}): ArticleBatchSerpLot {
  const silos = new Set([...input.siloRefs].filter(Boolean));
  const tamanho = Math.max(1, Math.floor(input.blockSize ?? ARTICLE_BATCH_SERP_BLOCK_SIZE));
  const vistos = new Set<string>();
  const porTexto = new Map<string, string>();
  const targets: ArticleBatchSerpTarget[] = [];
  const withoutVolume: ArticleBatchSerpTarget[] = [];
  const sameTextAs: ArticleBatchSerpLot["sameTextAs"] = [];
  for (const keyword of input.keywords) {
    const keywordId = String(keyword.id);
    const ref = typeof keyword.territoryRef === "string" ? keyword.territoryRef : null;
    if (!ref || !silos.has(ref) || vistos.has(keywordId) || input.excludedKeywordIds?.has(keywordId)) continue;
    const texto = String(keyword.keyword || "").trim();
    if (!texto) continue;
    vistos.add(keywordId);
    const alvo = { keywordId, keyword: texto };
    if (!hasSearchVolume(keyword.volume_search)) {
      withoutVolume.push(alvo);
      continue;
    }
    const chave = normalizar(texto);
    const primeira = porTexto.get(chave);
    if (primeira) {
      sameTextAs.push({ ...alvo, sameAsKeywordId: primeira });
      continue;
    }
    porTexto.set(chave, keywordId);
    targets.push(alvo);
  }
  const blocks: ArticleBatchSerpTarget[][] = [];
  for (let inicio = 0; inicio < targets.length; inicio += tamanho) blocks.push(targets.slice(inicio, inicio + tamanho));
  return { targets, withoutVolume, sameTextAs, blocks, siloRefs: [...silos].sort() };
}

/** Identidade curta do lote para o ledger (`scopeId` da rota): FNV-1a dos Silos. */
export function articleBatchSerpScopeId(siloRefs: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const caractere of [...siloRefs].sort().join("|")) {
    hash ^= caractere.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `article-batch:${siloRefs.length}:${hash.toString(16).padStart(8, "0")}`;
}

/** A frase do lote: quantas coletadas, quantas fora por falta de volume. */
export function describeArticleBatchSerpLot(lot: ArticleBatchSerpLot): string {
  const partes = [`${lot.targets.length} keyword(s) com volume nas 4 lentes`];
  if (lot.withoutVolume.length) partes.push(`${lot.withoutVolume.length} sem volume ficam fora (nunca coletadas)`);
  if (lot.sameTextAs.length) partes.push(`${lot.sameTextAs.length} com o mesmo texto de outra (uma consulta só)`);
  return partes.join(" · ");
}
