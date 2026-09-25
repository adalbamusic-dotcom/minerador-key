/**
 * REVALIDAR NÃO É REFAZER — o site já disse onde cada publicada mora.
 *
 * Quando a lista chega com Silos e artigos JÁ publicados, a arquitetura deles
 * já foi formada e comprovada: cada página tem URL, canonical e marca, e o
 * endereço diz a que Silo ela pertence. `/skincare/rotina-noturna` está sob
 * `/skincare` porque o caminho diz isso — não porque o léxico acha.
 *
 * Antes, o encaixe das publicadas nos Silos era por afinidade léxica, como o
 * de qualquer keyword nova. Isso podia pôr um artigo publicado no Silo errado
 * e, pior, propor Silo novo a partir de patrimônio publicado.
 *
 * Este módulo responde duas perguntas, sem provider, sem IA e sem tocar em
 * URL, slug ou canonical:
 *
 *   1. MEMBERSHIP PELA URL — de qual Silo publicado (da mesma marca) cada
 *      artigo publicado é membro, pelo prefixo de caminho no mesmo host;
 *   2. REMONTAR — quais keywords LIVRES pedem o mesmo conteúdo de um artigo
 *      publicado (afinidade de canibalização) e por isso entram nele, em vez
 *      de formar um artigo novo que competiria com a página que já está no ar.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import {
  CANNIBAL_FLOOR,
  MAX_ARTICLE_KEYWORDS,
  sameArticleAffinity,
  suggestPrincipal,
  type ArticleFormationKeyword,
} from "./article-formation.ts";

/* --------------------------------------------------------- endereço */

export type PublishedAddress = {
  /** Host sem `www.` e em minúsculas. */
  host: string;
  /** Caminho em minúsculas, sem barra final, sem query nem fragmento. `/` na home. */
  path: string;
};

/**
 * Normaliza um endereço publicado para comparação estrutural.
 *
 * Protocolo, `www.`, barra final, query e fragmento não mudam a posição da
 * página na árvore do site; caixa também não (slugs são minúsculos). O que
 * não é URL absoluta devolve `null`: sem host não há como afirmar "mesmo
 * site", e inventar um seria encaixe por palpite.
 */
export function normalizePublishedAddress(value: string | null | undefined): PublishedAddress | null {
  const texto = typeof value === "string" ? value.trim() : "";
  if (!texto) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(texto) ? texto : `https://${texto}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host || !host.includes(".")) return null;
  let path = url.pathname;
  try { path = decodeURIComponent(path); } catch { /* caminho malformado segue como veio */ }
  path = path.toLowerCase().replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return { host, path: path || "/" };
}

/**
 * A IDENTIDADE PUBLICADA de uma página: o caminho que está no ar.
 *
 * É o endereço declarado — canônico primeiro, URL na falta dele —, lido
 * como está: sem query, sem fragmento, sem barra final e SEM trocar a caixa
 * nem transformar o texto. O slug de um Silo publicado é este caminho, nunca
 * o texto da keyword passado por um normalizador: `/cabelos` continua
 * `/cabelos` mesmo que a keyword seja "cuidados com cabelos" (AGENTS §11).
 *
 * Sem URL absoluta legível, ou na home, devolve `null` — nada é fabricado.
 */
export type PublishedPageIdentity = {
  /** O caminho no ar, como declarado (`/cabelos`, `/cuidados/cabelos`). */
  slug: string;
  canonical: string | null;
  url: string | null;
};

export function publishedPageIdentityOf(input: { url: string | null | undefined; canonical: string | null | undefined }): PublishedPageIdentity | null {
  const canonical = typeof input.canonical === "string" && input.canonical.trim() ? input.canonical.trim() : null;
  const url = typeof input.url === "string" && input.url.trim() ? input.url.trim() : null;
  const fonte = canonical && normalizePublishedAddress(canonical) ? canonical : url && normalizePublishedAddress(url) ? url : null;
  if (!fonte) return null;
  let caminho: string;
  try {
    caminho = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(fonte) ? fonte : `https://${fonte}`).pathname;
  } catch {
    return null;
  }
  try { caminho = decodeURIComponent(caminho); } catch { /* caminho malformado segue como veio */ }
  caminho = caminho.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (!caminho || caminho === "/") return null;
  return { slug: caminho.startsWith("/") ? caminho : `/${caminho}`, canonical, url };
}

/**
 * A chave de COMPARAÇÃO de um slug/caminho de Silo: minúsculas, uma barra
 * inicial, sem barra final. Serve só para reconhecer o mesmo endereço; o
 * valor gravado continua o declarado.
 */
export function publishedPathKey(value: string | null | undefined): string | null {
  const texto = typeof value === "string" ? value.trim() : "";
  if (!texto) return null;
  const caminho = texto.toLowerCase().replace(/\/{2,}/g, "/").replace(/\/+$/, "").replace(/^\/*/, "/");
  return caminho === "/" ? null : caminho;
}

/** `child` fica sob `parent` no mesmo host (prefixo de caminho inteiro)? */
export function isPublishedAddressUnder(child: PublishedAddress, parent: PublishedAddress): boolean {
  if (child.host !== parent.host) return false;
  // A home não é Silo editorial: estar "sob /" é estar no site, não no Silo.
  if (parent.path === "/") return false;
  return child.path.startsWith(`${parent.path}/`);
}

/* ------------------------------------------------ membership pela URL */

export type PublishedSiloMembershipEntry = {
  keywordId: string;
  /** Marca da keyword, quando conhecida. Diferente da ativa = fora da conta. */
  brandId?: string | null;
  /** Publicada pelo Vínculo do Minerador (ou status legado). */
  published: boolean;
  /** Tipo de página que o Vínculo resolveu: `silo`, `article`, … */
  pageType: string;
  url: string | null;
  canonicalUrl: string | null;
};

export type PublishedSiloMembership = {
  /** Artigo publicado → keyword-cabeça do Silo publicado que o contém. */
  siloHeadByArticle: Map<string, string>;
  /** O endereço de cada Silo publicado reconhecido, pela cabeça. */
  siloAddressByHead: Map<string, PublishedAddress>;
  /** Artigos publicados sem Silo publicado acima deles na URL. */
  outsideAnySilo: string[];
  /** Encaixes que o endereço não resolve sozinho — nunca viram palpite. */
  conflicts: Array<{ keywordId: string; reason: string }>;
  /** Cabeças que são `territoryRef` de Silo publicado já no acervo, não keyword do lote. */
  territoryHeads: Set<string>;
};

/** O endereço que vale: o canônico declarado, e só na falta dele a URL. */
function addressOf(entry: Pick<PublishedSiloMembershipEntry, "url" | "canonicalUrl">): PublishedAddress | null {
  return normalizePublishedAddress(entry.canonicalUrl) ?? normalizePublishedAddress(entry.url);
}

/**
 * Qual Silo publicado contém cada artigo publicado.
 *
 * Regras, em ordem — e todas observáveis no endereço:
 *
 *  - só entram keywords publicadas da marca ativa;
 *  - Silo = publicada cujo tipo de página é `silo`; artigo = tipo `article`;
 *  - o artigo é membro do Silo cuja URL é PREFIXO do caminho dele no mesmo
 *    host; havendo Silos aninhados, vence o mais profundo (o mais próximo);
 *  - dois Silos com o MESMO endereço são conflito: o encaixe não é decidido
 *    por desempate arbitrário;
 *  - artigo sem Silo acima dele fica fora — o site não o põe em Silo, e a
 *    lógica não inventa um.
 */
export function resolvePublishedSiloMembership(input: {
  brandId: string | null;
  entries: readonly PublishedSiloMembershipEntry[];
  /**
   * Silos publicados que JÁ SÃO território da marca ativa (proteção
   * `protected`, com o canonical publicado gravado). Entram só quando
   * nenhuma cabeça do lote declara o mesmo endereço: assim o artigo
   * publicado é reconhecido mesmo que a cabeça do Silo não tenha vindo na
   * importação. A "cabeça" devolvida é o próprio `territoryRef`.
   */
  territorySilos?: ReadonlyArray<{ territoryRef: string; canonicalUrl: string | null }>;
}): PublishedSiloMembership {
  const daMarca = input.entries.filter(entry => entry.published
    && (!input.brandId || !entry.brandId || entry.brandId === input.brandId));

  const siloAddressByHead = new Map<string, PublishedAddress>();
  const cabecasPorEndereco = new Map<string, string[]>();
  for (const entry of daMarca) {
    if (entry.pageType !== "silo") continue;
    const endereco = addressOf(entry);
    if (!endereco || endereco.path === "/") continue;
    siloAddressByHead.set(entry.keywordId, endereco);
    const chave = `${endereco.host}${endereco.path}`;
    cabecasPorEndereco.set(chave, [...(cabecasPorEndereco.get(chave) || []), entry.keywordId]);
  }
  const territoryHeads = new Set<string>();
  const enderecosDoLote = new Set(cabecasPorEndereco.keys());
  for (const territorio of input.territorySilos || []) {
    const endereco = normalizePublishedAddress(territorio.canonicalUrl);
    if (!endereco || endereco.path === "/") continue;
    const chave = `${endereco.host}${endereco.path}`;
    // A cabeça do lote tem precedência: o território dela é o mesmo Silo.
    if (enderecosDoLote.has(chave)) continue;
    siloAddressByHead.set(territorio.territoryRef, endereco);
    territoryHeads.add(territorio.territoryRef);
    cabecasPorEndereco.set(chave, [...(cabecasPorEndereco.get(chave) || []), territorio.territoryRef]);
  }

  const siloHeadByArticle = new Map<string, string>();
  const outsideAnySilo: string[] = [];
  const conflicts: PublishedSiloMembership["conflicts"] = [];

  for (const entry of daMarca) {
    if (entry.pageType !== "article") continue;
    const endereco = addressOf(entry);
    if (!endereco) {
      conflicts.push({ keywordId: entry.keywordId, reason: "Publicada sem URL absoluta legível: o Silo não pode ser reconhecido pelo endereço." });
      continue;
    }
    let melhor: { chave: string; profundidade: number } | null = null;
    for (const [chave, cabecas] of cabecasPorEndereco) {
      const silo = siloAddressByHead.get(cabecas[0])!;
      if (!isPublishedAddressUnder(endereco, silo)) continue;
      const profundidade = silo.path.split("/").length;
      if (!melhor || profundidade > melhor.profundidade) melhor = { chave, profundidade };
    }
    if (!melhor) {
      outsideAnySilo.push(entry.keywordId);
      continue;
    }
    const cabecas = cabecasPorEndereco.get(melhor.chave)!;
    if (cabecas.length > 1) {
      conflicts.push({
        keywordId: entry.keywordId,
        reason: `Mais de um Silo publicado declara o mesmo endereço (${melhor.chave}); o encaixe espera decisão humana.`,
      });
      continue;
    }
    siloHeadByArticle.set(entry.keywordId, cabecas[0]);
  }

  return { siloHeadByArticle, siloAddressByHead, outsideAnySilo, conflicts, territoryHeads };
}

/* ------------------------------------- remontar em torno da publicada */

export type FormationGroup = { principalKeywordId: string; keywordIds: string[] };

export type PublishedRegrouping = {
  /** Um grupo por publicada: ela é a principal, e as livres que a repetem entram nela. */
  publishedGroups: FormationGroup[];
  /** Os grupos das livres, sem as que foram para uma publicada. */
  freeGroups: FormationGroup[];
  /** Livre → publicada em torno da qual ela foi remontada, com o porquê. */
  attached: Map<string, { publishedKeywordId: string; affinity: number; reasons: string[] }>;
};

/**
 * REMONTA as livres em torno das publicadas — sem mexer na publicada.
 *
 * Uma livre que pede o MESMO conteúdo de uma página publicada (afinidade no
 * piso de canibalização) não forma artigo novo: um artigo novo competiria
 * com a página que já está no ar. Ela entra no artigo publicado, como
 * secundária/reforço, até o teto de seis.
 *
 * O que NÃO acontece aqui:
 *  - a publicada nunca muda de principal, slug, URL ou canonical;
 *  - duas publicadas nunca se fundem (cada uma é um patrimônio);
 *  - keyword com decisão humana de formação não é tocada;
 *  - abaixo do piso, nada muda: a livre segue no núcleo dela.
 */
export function regroupFreeAroundPublished(input: {
  keywords: readonly ArticleFormationKeyword[];
  /** Grupos das livres, como o formador os montou. */
  freeGroups: readonly FormationGroup[];
  siloTokens?: ReadonlySet<string>;
}): PublishedRegrouping {
  const publicadas = input.keywords.filter(keyword => keyword.isPublished);
  const porId = new Map(input.keywords.map(keyword => [keyword.keywordId, keyword]));
  const vagas = new Map(publicadas.map(keyword => [keyword.keywordId, MAX_ARTICLE_KEYWORDS - 1]));
  const attached: PublishedRegrouping["attached"] = new Map();

  if (publicadas.length) {
    // Maior afinidade primeiro: a vaga vai para quem mais repete a publicada.
    const pares: Array<{ livre: string; publicada: string; affinity: number; reasons: string[] }> = [];
    for (const group of input.freeGroups) {
      for (const keywordId of group.keywordIds) {
        const livre = porId.get(keywordId);
        if (!livre || livre.isPublished || livre.humanFormationRef || livre.subjectHeldOut || livre.subjectAnchored) continue;
        for (const publicada of publicadas) {
          const { affinity, reasons } = sameArticleAffinity(publicada, livre, input.siloTokens);
          if (affinity >= CANNIBAL_FLOOR) pares.push({ livre: keywordId, publicada: publicada.keywordId, affinity, reasons });
        }
      }
    }
    pares.sort((left, right) => right.affinity - left.affinity
      || left.publicada.localeCompare(right.publicada)
      || left.livre.localeCompare(right.livre));
    for (const par of pares) {
      if (attached.has(par.livre)) continue;
      const restantes = vagas.get(par.publicada) ?? 0;
      if (restantes <= 0) continue;
      vagas.set(par.publicada, restantes - 1);
      attached.set(par.livre, { publishedKeywordId: par.publicada, affinity: par.affinity, reasons: par.reasons });
    }
  }

  const publishedGroups = publicadas.map(publicada => ({
    principalKeywordId: publicada.keywordId,
    keywordIds: [
      publicada.keywordId,
      ...[...attached].filter(([, destino]) => destino.publishedKeywordId === publicada.keywordId).map(([livre]) => livre),
    ],
  }));

  const freeGroups = input.freeGroups.flatMap(group => {
    const restantes = group.keywordIds.filter(keywordId => !attached.has(keywordId));
    if (!restantes.length) return [];
    if (restantes.length === group.keywordIds.length) return [{ principalKeywordId: group.principalKeywordId, keywordIds: [...group.keywordIds] }];
    // A principal saiu para a publicada: o núcleo elege outra entre as que ficaram.
    const principal = restantes.includes(group.principalKeywordId)
      ? group.principalKeywordId
      : suggestPrincipal({
        keywords: restantes.map(keywordId => porId.get(keywordId)).filter((keyword): keyword is ArticleFormationKeyword => Boolean(keyword)),
        siloTokens: input.siloTokens,
      })?.keywordId ?? restantes[0];
    return [{ principalKeywordId: principal, keywordIds: restantes }];
  });

  return { publishedGroups, freeGroups, attached };
}
