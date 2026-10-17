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
import { principalIsIdentity } from "./article-improvement.ts";
import { readPublishedIdentity } from "./published-identity.ts";
import { SERP_PAID_QUERY_COST_USD } from "./serp-lens-plan.ts";
import { resolveDeclaredPrincipal, resolveKeywordSubject, subjectPhraseOf } from "../minerador/keyword-subject.ts";

/* =========================================================================
 * 2026-10-17 · A RÉGUA ÚNICA DA COLETA DA SERP (decisão do dono: "implementa
 * a sua recomendação"). Keyword SEM volume NÃO é coletada — EXCETO a principal
 * de identidade do artigo (linha do plano, Assunto ou página publicada): a SERP
 * dela mostra o que o Google exibe para a frase exata do artigo (estrutura,
 * concorrentes, base para o Radar) e custa 4 consultas (até US$ 0,014), ditas
 * antes. SUBSTITUI, em parte, "keyword sem volume nunca é coletada" (G6, de
 * 2026-09-28) e a "primeira coleta da secundária de mais volume" (T12, manhã
 * de 17/10). Identidade é a régua de sempre (`principalIsIdentity`, T12); aqui
 * só se lê, dos dados (pacote aprovado, ArticleDNA, publicado), o título e o
 * slug que ela compara. Uma régua só: "Processar artigos", "Validar SERP", a
 * melhoria e o servidor (`keyword-serp` e `serp`), que confere de novo no banco.
 * ========================================================================= */

/** A keyword como o Arquiteto a tem: o texto e o `analise_semantica` do PACOTE APROVADO (nunca a linha viva). */
export type SerpIdentityRow = { keywordId: string; keyword: string; packageSemantic: Record<string, unknown> | null; status?: string | null };
/** O artigo vigente, na forma mínima (ArticleDNA): principal, Assunto, keywords, a frase do Assunto e o slug publicado. */
export type SerpIdentityArticle = { principalKeywordId: string | null; subjectKeywordId: string | null; keywordIds: readonly string[]; subjectPhrase?: string | null; publishedSlug?: string | null };
export type SerpIdentityCheck = { identity: boolean; reason: string };

export const SERP_IDENTITY_PURPOSE = "para ver o que o Google mostra para a frase do artigo";
const IDENTITY_REASONS = {
  absent: "não chegou ao Arquiteto com o pacote aprovado",
  notPrincipal: "não é a principal do artigo dela",
  noLine: "não é a principal de uma linha do plano, de um Assunto nem de uma página publicada",
  notIdentity: "é a principal, mas não está no título do Assunto nem no slug declarado ou publicado (não é a identidade do artigo)",
  identity: "é a principal de identidade do artigo (está no título do Assunto ou no slug declarado ou publicado)",
} as const;

const recordOf = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const textOf = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
/** O último segmento do caminho de uma URL publicada (a pasta do Silo não conta, X4). */
function slugOfUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? null; } catch { return url.split("/").filter(Boolean).at(-1) ?? null; }
}

/** A linha da mesa (`masterList`) na forma da régua: só o pacote aprovado conta. */
export function serpIdentityRowOf(row: Record<string, unknown>): SerpIdentityRow {
  const pacote = recordOf(recordOf(recordOf(row.canonicalWorkflow)?.payload)?.approvedDna);
  return {
    keywordId: String(row.id ?? ""),
    keyword: textOf(row.keyword) ?? textOf(pacote?.keyword) ?? "",
    packageSemantic: recordOf(pacote?.analiseSemantica),
    status: textOf(row.status),
  };
}

/** O ArticleDNA vigente na forma da régua. */
export function serpIdentityArticleOf(payload: { principalKeywordId?: unknown; subject?: { keywordId?: unknown; phrase?: unknown } | null; keywordReferences?: readonly { keywordId?: unknown }[]; publishedIdentityRef?: { slug?: unknown; publishedUrl?: unknown } | null }): SerpIdentityArticle {
  const publicado = payload.publishedIdentityRef ? textOf(payload.publishedIdentityRef.slug) ?? slugOfUrl(textOf(payload.publishedIdentityRef.publishedUrl)) : null;
  return {
    principalKeywordId: textOf(payload.principalKeywordId),
    subjectKeywordId: textOf(payload.subject?.keywordId),
    keywordIds: (payload.keywordReferences ?? []).map(reference => textOf(reference.keywordId)).filter((id): id is string => Boolean(id)),
    subjectPhrase: textOf(payload.subject?.phrase),
    publishedSlug: publicado,
  };
}

/**
 * A keyword é a PRINCIPAL DE IDENTIDADE de um artigo da marca? Lido dos dados:
 * no ArticleDNA vigente, ela precisa ser a principal (a do Assunto que virou
 * âncora numa troca não é); sem artigo, a principal declarada da linha do plano,
 * a keyword que carrega o Assunto ou a página publicada. Identidade = a régua de
 * T12 (`principalIsIdentity`) com o título do Assunto, o slug declarado no plano
 * ou o slug publicado (o sugerido do DNA não conta).
 */
export function serpIdentityPrincipalCheck(input: { keywordId: string; rowOf: (keywordId: string) => SerpIdentityRow | null | undefined; articles: readonly SerpIdentityArticle[] }): SerpIdentityCheck {
  const row = input.rowOf(input.keywordId);
  if (!row || !row.keyword || !row.packageSemantic) return { identity: false, reason: IDENTITY_REASONS.absent };
  const doArtigo = input.articles.filter(article => article.principalKeywordId === input.keywordId || article.subjectKeywordId === input.keywordId || article.keywordIds.includes(input.keywordId));
  const comoPrincipal = doArtigo.find(article => article.principalKeywordId === input.keywordId) ?? null;
  if (doArtigo.length && !comoPrincipal) return { identity: false, reason: IDENTITY_REASONS.notPrincipal };
  const proprio = resolveKeywordSubject(row.packageSemantic);
  const marca = resolveDeclaredPrincipal(row.packageSemantic).mark;
  // O Assunto do artigo: o do ArticleDNA; sem ele, o desta keyword (cadastro único) ou o do plano que a declarou principal.
  const assuntoId = comoPrincipal?.subjectKeywordId ?? (proprio.declared ? input.keywordId : marca?.subjectKeywordId ?? null);
  const linhaDoAssunto = assuntoId && assuntoId !== input.keywordId ? input.rowOf(assuntoId) ?? null : assuntoId ? row : null;
  const assunto = linhaDoAssunto?.packageSemantic ? resolveKeywordSubject(linhaDoAssunto.packageSemantic) : null;
  const publicada = readPublishedIdentity({ status: row.status ?? null, analise_semantica: row.packageSemantic });
  if (!comoPrincipal) {
    const declarada = assunto?.plan?.declaredPrincipal?.keywordId ?? null;
    const daLinha = Boolean(assunto?.declared) && (declarada ? declarada === input.keywordId : assuntoId === input.keywordId);
    if (!daLinha && !publicada) return { identity: false, reason: IDENTITY_REASONS.noLine };
  }
  const titulo = comoPrincipal?.subjectPhrase ?? (assunto?.declared && linhaDoAssunto ? subjectPhraseOf(linhaDoAssunto.keyword, assunto) : null);
  const slugDoPlano = assunto?.declared ? assunto.plan?.slug ?? null : null;
  const slugPublicado = comoPrincipal?.publishedSlug ?? slugOfUrl(publicada?.url ?? null);
  const identidade = principalIsIdentity({ keyword: row.keyword, title: titulo, slug: slugDoPlano })
    || Boolean(slugPublicado && principalIsIdentity({ keyword: row.keyword, slug: slugPublicado }));
  return identidade ? { identity: true, reason: IDENTITY_REASONS.identity } : { identity: false, reason: IDENTITY_REASONS.notIdentity };
}

/** As principais de identidade entre as keywords da mesa (a mesma régua, para a tela). */
export function serpIdentityPrincipalIds(input: { rows: Iterable<Record<string, unknown>>; articles: readonly SerpIdentityArticle[]; onlyWithoutVolume?: boolean }): Set<string> {
  const porId = new Map<string, SerpIdentityRow>();
  const volumes = new Map<string, unknown>();
  for (const row of input.rows) {
    const linha = serpIdentityRowOf(row);
    if (!linha.keywordId) continue;
    porId.set(linha.keywordId, linha);
    volumes.set(linha.keywordId, row.volume_search);
  }
  // Os artigos de cada keyword (a régua só olha os artigos em que ela aparece): a mesa grande não vira linhas × artigos.
  const artigosDe = new Map<string, SerpIdentityArticle[]>();
  for (const article of input.articles) {
    for (const id of new Set([article.principalKeywordId, article.subjectKeywordId, ...article.keywordIds].filter((value): value is string => Boolean(value)))) {
      const lista = artigosDe.get(id);
      if (lista) lista.push(article); else artigosDe.set(id, [article]);
    }
  }
  const ids = new Set<string>();
  for (const keywordId of porId.keys()) {
    if (input.onlyWithoutVolume !== false && hasSearchVolume(typeof volumes.get(keywordId) === "number" ? volumes.get(keywordId) as number : null)) continue;
    if (serpIdentityPrincipalCheck({ keywordId, rowOf: id => porId.get(id), articles: artigosDe.get(keywordId) ?? [] }).identity) ids.add(keywordId);
  }
  return ids;
}

/**
 * A RÉGUA: a SERP desta keyword pode ser coletada? Com volume, sim; sem volume,
 * só a principal de identidade do artigo. Nenhuma outra régua decide isso.
 */
export function serpCollectionAllowed(input: { volume: number | null | undefined; identityPrincipal: boolean }): boolean {
  return hasSearchVolume(input.volume) || input.identityPrincipal === true;
}

/** A recusa de quem fica fora pela régua (o servidor e a tela dizem a mesma frase). */
export function serpCollectionRefusal(check: Pick<SerpIdentityCheck, "reason"> | null | undefined): string {
  return `Sem volume no Google Ads e ${check?.reason ?? IDENTITY_REASONS.noLine}: a SERP não é coletada. Sem volume, só a SERP da principal de identidade do artigo é coletada (dono, 17/10).`;
}

const dolares = (valor: number) => valor.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 4 });

/**
 * A frase da prévia de custo, por artigo: "SERP da principal de identidade “…”
 * (sem buscas no Google Ads): 4 consultas, até US$ 0,014 — para ver o que o
 * Google mostra para a frase do artigo". `queries` = as lentes que faltam.
 */
export function identityPrincipalSerpSentence(keyword: string, options: { queries?: number; neverMeasured?: boolean } = {}): string {
  const consultas = Math.max(0, Math.round(options.queries ?? 4));
  const ate = Math.round(consultas * SERP_PAID_QUERY_COST_USD.otherLensMax * 10000) / 10000;
  return `SERP da principal de identidade “${keyword}” (${options.neverMeasured ? "sem volume medido" : "sem buscas no Google Ads"}): ${consultas} ${consultas === 1 ? "consulta" : "consultas"}, até US$ ${dolares(ate)} — ${SERP_IDENTITY_PURPOSE}.`;
}

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
  /** Keywords do lote SEM volume que não são a principal de identidade: nunca coletadas. */
  withoutVolume: ArticleBatchSerpTarget[];
  /** 2026-10-17 · as principais de identidade SEM volume: estão em `targets` (coletadas, 4 lentes, com o propósito dito). */
  identityPrincipals: ArticleBatchSerpTarget[];
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
  /** 2026-10-17 · as principais de identidade da mesa (`serpIdentityPrincipalIds`): sem volume, só elas entram. */
  identityPrincipalIds?: ReadonlySet<string>;
}): ArticleBatchSerpLot {
  const silos = new Set([...input.siloRefs].filter(Boolean));
  const tamanho = Math.max(1, Math.floor(input.blockSize ?? ARTICLE_BATCH_SERP_BLOCK_SIZE));
  const vistos = new Set<string>();
  const porTexto = new Map<string, string>();
  const targets: ArticleBatchSerpTarget[] = [];
  const withoutVolume: ArticleBatchSerpTarget[] = [];
  const identityPrincipals: ArticleBatchSerpTarget[] = [];
  const sameTextAs: ArticleBatchSerpLot["sameTextAs"] = [];
  for (const keyword of input.keywords) {
    const keywordId = String(keyword.id);
    const ref = typeof keyword.territoryRef === "string" ? keyword.territoryRef : null;
    if (!ref || !silos.has(ref) || vistos.has(keywordId) || input.excludedKeywordIds?.has(keywordId)) continue;
    const texto = String(keyword.keyword || "").trim();
    if (!texto) continue;
    vistos.add(keywordId);
    const alvo = { keywordId, keyword: texto };
    const identidade = input.identityPrincipalIds?.has(keywordId) === true;
    if (!serpCollectionAllowed({ volume: keyword.volume_search, identityPrincipal: identidade })) {
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
    if (!hasSearchVolume(keyword.volume_search)) identityPrincipals.push(alvo);
  }
  const blocks: ArticleBatchSerpTarget[][] = [];
  for (let inicio = 0; inicio < targets.length; inicio += tamanho) blocks.push(targets.slice(inicio, inicio + tamanho));
  return { targets, withoutVolume, identityPrincipals, sameTextAs, blocks, siloRefs: [...silos].sort() };
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

/** A frase do lote: quantas coletadas, as principais de identidade sem volume (com o propósito) e quantas fora por falta de volume. */
export function describeArticleBatchSerpLot(lot: ArticleBatchSerpLot): string {
  const identidade = lot.identityPrincipals ?? [];
  const partes = [`${lot.targets.length - identidade.length} keyword(s) com volume nas 4 lentes`];
  for (const alvo of identidade) partes.push(identityPrincipalSerpSentence(alvo.keyword).replace(/\.$/, ""));
  if (lot.withoutVolume.length) partes.push(`${lot.withoutVolume.length} sem volume ficam fora (nunca coletadas: não são a principal de identidade do artigo)`);
  if (lot.sameTextAs.length) partes.push(`${lot.sameTextAs.length} com o mesmo texto de outra (uma consulta só)`);
  return partes.join(" · ");
}
