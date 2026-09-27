/**
 * D2.2 — "MESMO ASSUNTO" É O QUE A SERP DIZ.
 *
 * Regra do dono (docs/compartilhado/regras-serp-e-assuntos-2026-09-26.md,
 * D2.2): duas keywords tratam do mesmo assunto quando o Google devolve as
 * MESMAS PÁGINAS para as duas — páginas em comum no top 10, nas 4 lentes,
 * lidas do cache já pago. Palavras em comum e a Lógica são sinal de apoio,
 * nunca a medida principal (A2: SERP conclusiva > decisão humana > Lógica > IA).
 *
 * Por que páginas e não palavras: na AdalbaPro (leitura do cache de
 * 2026-09-26, sem custo), "como atrair pacientes para clínica" divide 7
 * páginas do top 10 com "como atrair pacientes" e "como atrair mais
 * pacientes" — e a afinidade por palavras, descontado o tema do Silo, não
 * chegava ao piso de 0,5. O reforço colava keyword parecida de outro assunto
 * e deixava de fora as que o Google trata como a mesma busca.
 *
 * A RÉGUA — calibrada na mesma leitura, 12.561 pares de 159 keywords com
 * SERP nas lentes extras:
 *
 *   páginas em comum   pares    leitura
 *   0                  10.455   assuntos diferentes
 *   1                   1.527   ruído: um portal genérico que ranqueia tudo
 *   2                     163   apoio: vizinhança, precisa de outro sinal
 *   3 ou mais             416   forte: o Google trata como o mesmo assunto
 *
 * Os pares reais que o dono conferiu ficam todos no "forte" (3 a 7 páginas):
 * "marketing digital para dentistas" × "marketing para dentistas" (3),
 * "captação de pacientes" × "como captar pacientes" (3), "como atrair
 * clientes para consultório" × "como atrair pacientes para o consultório" (5).
 *
 * A UNIÃO DAS LENTES: uma página conta quando está no top 10 das duas
 * keywords em QUALQUER lente. Medido no mesmo cache, a comparação lente a
 * lente dava 0 para pares com 7 páginas em comum — as lentes de cada keyword
 * foram coletadas em dias diferentes e o top 10 gira entre aparelhos. A
 * divergência entre lentes é sinal, não defeito (A3); as lentes em que as
 * duas concordam no mesmo aparelho ficam registradas à parte.
 *
 * O QUE NÃO SE LÊ: a lente canônica (desktop-windows) guarda o corpo inteiro
 * e não o digest; as URLs dela exigiriam ler ~26 KB por keyword. Ela entra
 * pelos DOMÍNIOS da observação (~1 KB), como apoio. As páginas vêm das três
 * lentes com digest. A leitura diz isso em vez de fingir quatro lentes.
 *
 * AUSÊNCIA NUNCA VIRA ZERO (A7): keyword sem nenhuma lente com páginas no
 * cache dá `unknown`, e quem decide volta à regra anterior dizendo por quê.
 *
 * Domínio puro: sem React, sem storage, sem rede, sem provider.
 */
import { SERP_CACHE_CANONICAL_LENS, SERP_CACHE_LENSES, serpCacheLensLabel } from "../editorial/serp-cache.ts";

/* --------------------------------- régua --------------------------------- */

export type SerpSubjectThresholds = {
  /** A partir daqui o Google trata as duas como o mesmo assunto. */
  strongPages: number;
  /** Vizinhança: só vale junto de outro sinal (palavras ou DNA). */
  supportPages: number;
};

/** Calibrada na leitura real de 2026-09-26 (ver o cabeçalho). */
export const SERP_SUBJECT_THRESHOLDS: SerpSubjectThresholds = Object.freeze({ strongPages: 3, supportPages: 2 });

/** As 4 lentes do produto, pelo rótulo do cache (`desktop-windows`…). */
export const SERP_SUBJECT_LENS_LABELS: readonly string[] = SERP_CACHE_LENSES.map(serpCacheLensLabel);
export const SERP_SUBJECT_CANONICAL_LENS_LABEL = serpCacheLensLabel(SERP_CACHE_CANONICAL_LENS);

/**
 * `strong`  mesmo assunto para o Google;
 * `support` vizinhança (2 páginas) — só vale com outro sinal;
 * `weak`    uma página em comum: ruído;
 * `none`    nenhuma página em comum;
 * `unknown` uma das duas não tem páginas no cache: não dá para medir.
 */
export type SerpSubjectStrength = "strong" | "support" | "weak" | "none" | "unknown";

export const SERP_SUBJECT_STRENGTH_LABELS: Readonly<Record<SerpSubjectStrength, string>> = Object.freeze({
  strong: "mesmo assunto no Google",
  support: "vizinhança no Google",
  weak: "uma página em comum (ruído)",
  none: "nenhuma página em comum",
  unknown: "sem SERP no cache para medir",
});

/* -------------------------------- entrada -------------------------------- */

/** O que o cache devolveu de UMA lente de UMA keyword. */
export type SerpSubjectLensReading = {
  /** Rótulo da lente: `desktop-windows`, `desktop-macos`, `mobile-android`, `mobile-ios`. */
  lens: string;
  /** URLs orgânicas do top 10, na ordem. `null` = a lente não trouxe URLs (sem digest). */
  urls: readonly string[] | null;
  /** Domínios concorrentes da observação. `null` = não lidos. */
  domains: readonly string[] | null;
  collectedAt: string | null;
};

/** A pegada de uma keyword na SERP: o que o cache tem dela nas 4 lentes. */
export type KeywordSerpFootprint = {
  keywordId: string;
  keyword: string;
  lenses: readonly SerpSubjectLensReading[];
};

/* ------------------------------- normalização ------------------------------- */

/**
 * A identidade de uma página: host sem `www`, caminho sem barra final, sem
 * query nem âncora, em minúsculas. `https://www.x.com.br/blog/a/?utm=1` e
 * `http://x.com.br/blog/a` são a mesma página.
 */
export function normalizeSerpPageUrl(value: string | null | undefined): string | null {
  const texto = typeof value === "string" ? value.trim() : "";
  if (!texto) return null;
  try {
    const url = new URL(texto);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let caminho = url.pathname.replace(/\/+$/, "");
    try { caminho = decodeURIComponent(caminho); } catch { /* caminho já vale como veio */ }
    return `${host}${caminho.toLowerCase()}`;
  } catch {
    return null;
  }
}

export function normalizeSerpDomain(value: string | null | undefined): string | null {
  const texto = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!texto) return null;
  const semEsquema = texto.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0];
  const host = semEsquema.replace(/^www\./, "").replace(/:\d+$/, "");
  return host || null;
}

const hostDaPagina = (pagina: string) => pagina.split("/")[0];

/* ----------------------------- domínios genéricos ----------------------------- */

/**
 * D2.3 — "3 OU MAIS DOMÍNIOS EM COMUM" SÓ CONTA COM SITE QUE DISTINGUE.
 *
 * Rede social e portal que ranqueiam tudo não dizem que duas buscas são o
 * mesmo assunto. Na AdalbaPro (cache de 2026-09-26, 158 keywords com páginas),
 * instagram.com aparece no top 10 de 65 e youtube.com no de 59: contando os
 * dois, 239 pares viravam "Provável" só por domínio. Tirando a lista fixa e os
 * sites presentes em mais de 15% das SERPs do lote, sobram 51 — vizinhos de
 * verdade. Os genéricos continuam lidos; só não contam como sinal.
 */
export const SERP_GENERIC_DOMAINS: readonly string[] = Object.freeze([
  "instagram.com", "youtube.com", "facebook.com", "reddit.com", "linkedin.com", "tiktok.com",
  "pinterest.com", "twitter.com", "x.com", "wikipedia.org", "quora.com", "google.com",
]);
/** Fração das SERPs do lote a partir da qual um site é genérico. */
export const SERP_GENERIC_DOMAIN_SHARE = 0.15;
/**
 * Abaixo disto o lote é pequeno (e em geral de um tema só) para medir a
 * frequência: um site que ranqueia a família inteira pareceria genérico. Só a
 * lista fixa vale.
 */
export const SERP_GENERIC_DOMAIN_MIN_KEYWORDS = 50;

export function isFixedGenericDomain(domain: string): boolean {
  return SERP_GENERIC_DOMAINS.some(generico => domain === generico || domain.endsWith(`.${generico}`));
}

/* --------------------------------- medida --------------------------------- */

export type SerpSubjectOverlap = {
  leftKeywordId: string;
  rightKeywordId: string;
  strength: SerpSubjectStrength;
  /** Páginas (normalizadas) no top 10 das duas, em qualquer lente. */
  sharedPages: string[];
  sharedPageCount: number;
  /** Domínios em comum (URLs das lentes com digest + domínios da observação). */
  sharedDomains: string[];
  sharedDomainCount: number;
  /**
   * D2.3 (aditivo) — os domínios em comum sem rede social nem portal genérico
   * (`SERP_GENERIC_DOMAINS` e, no índice, os sites de mais de 15% das SERPs).
   * É o que conta para o nível "Provável" (3 ou mais).
   */
  sharedDistinctiveDomains: string[];
  sharedDistinctiveDomainCount: number;
  /** Lentes em que as duas têm a MESMA página no MESMO aparelho. */
  lensesAgreeing: string[];
  /** Lentes com páginas lidas de cada lado. */
  pageLensesLeft: string[];
  pageLensesRight: string[];
  /** Lentes que faltam de cada lado (nem páginas nem domínios). */
  missingLensesLeft: string[];
  missingLensesRight: string[];
  /** As 4 lentes presentes dos dois lados (com páginas ou domínios). */
  complete: boolean;
  /** A frase para a tela, em português, sem número solto. */
  reason: string;
};

type Pegada = {
  paginasPorLente: Map<string, Set<string>>;
  paginas: Set<string>;
  dominios: Set<string>;
  lentesPresentes: Set<string>;
};

function pegadaDe(footprint: KeywordSerpFootprint | null | undefined): Pegada {
  const paginasPorLente = new Map<string, Set<string>>();
  const paginas = new Set<string>();
  const dominios = new Set<string>();
  const lentesPresentes = new Set<string>();
  for (const leitura of footprint?.lenses || []) {
    const urls = (leitura.urls || []).map(normalizeSerpPageUrl).filter((item): item is string => Boolean(item));
    const doms = (leitura.domains || []).map(normalizeSerpDomain).filter((item): item is string => Boolean(item));
    if (urls.length) {
      paginasPorLente.set(leitura.lens, new Set([...(paginasPorLente.get(leitura.lens) || []), ...urls]));
      for (const url of urls) {
        paginas.add(url);
        dominios.add(hostDaPagina(url));
      }
    }
    for (const dominio of doms) dominios.add(dominio);
    if (urls.length || doms.length) lentesPresentes.add(leitura.lens);
  }
  return { paginasPorLente, paginas, dominios, lentesPresentes };
}

const faltando = (presentes: ReadonlySet<string>) => SERP_SUBJECT_LENS_LABELS.filter(lens => !presentes.has(lens));

function forcaPorPaginas(paginas: number, limiares: SerpSubjectThresholds): Exclude<SerpSubjectStrength, "unknown"> {
  if (paginas >= limiares.strongPages) return "strong";
  if (paginas >= limiares.supportPages) return "support";
  return paginas === 1 ? "weak" : "none";
}

/**
 * Mede se duas keywords são o mesmo assunto para o Google.
 *
 * `left`/`right` com os nomes da busca: a frase da tela cita as duas.
 */
export function measureSerpSubjectOverlap(
  left: KeywordSerpFootprint | null | undefined,
  right: KeywordSerpFootprint | null | undefined,
  options: { thresholds?: SerpSubjectThresholds; leftKeywordId?: string; rightKeywordId?: string; genericDomains?: ReadonlySet<string> } = {},
): SerpSubjectOverlap {
  const limiares = options.thresholds || SERP_SUBJECT_THRESHOLDS;
  const a = pegadaDe(left);
  const b = pegadaDe(right);
  const leftKeywordId = left?.keywordId || options.leftKeywordId || "";
  const rightKeywordId = right?.keywordId || options.rightKeywordId || "";
  const sharedPages = [...a.paginas].filter(pagina => b.paginas.has(pagina)).sort();
  const sharedDomains = [...a.dominios].filter(dominio => b.dominios.has(dominio)).sort();
  const sharedDistinctiveDomains = sharedDomains.filter(dominio => !isFixedGenericDomain(dominio) && !options.genericDomains?.has(dominio));
  const distintivos = { sharedDistinctiveDomains, sharedDistinctiveDomainCount: sharedDistinctiveDomains.length };
  const lensesAgreeing = SERP_SUBJECT_LENS_LABELS.filter(lens => {
    const esquerda = a.paginasPorLente.get(lens);
    const direita = b.paginasPorLente.get(lens);
    return Boolean(esquerda && direita && [...esquerda].some(pagina => direita.has(pagina)));
  });
  const pageLensesLeft = SERP_SUBJECT_LENS_LABELS.filter(lens => a.paginasPorLente.has(lens));
  const pageLensesRight = SERP_SUBJECT_LENS_LABELS.filter(lens => b.paginasPorLente.has(lens));
  const missingLensesLeft = faltando(a.lentesPresentes);
  const missingLensesRight = faltando(b.lentesPresentes);
  const complete = !missingLensesLeft.length && !missingLensesRight.length;
  const nomeA = left?.keyword ? `"${left.keyword}"` : "a primeira";
  const nomeB = right?.keyword ? `"${right.keyword}"` : "a segunda";

  if (!a.paginas.size || !b.paginas.size) {
    const semSerp = [!a.paginas.size ? nomeA : null, !b.paginas.size ? nomeB : null].filter(Boolean).join(" e ");
    return {
      leftKeywordId, rightKeywordId, strength: "unknown",
      sharedPages: [], sharedPageCount: 0, sharedDomains, sharedDomainCount: sharedDomains.length, ...distintivos,
      lensesAgreeing: [], pageLensesLeft, pageLensesRight, missingLensesLeft, missingLensesRight, complete,
      reason: `Sem páginas da SERP no cache para ${semSerp}: não dá para medir se é o mesmo assunto no Google.`,
    };
  }

  const strength = forcaPorPaginas(sharedPages.length, limiares);
  const lentesLidas = `${pageLensesLeft.length} e ${pageLensesRight.length} lente(s) com páginas`;
  const incompleta = complete ? "" : " SERP incompleta: falta lente no cache.";
  const concordam = lensesAgreeing.length ? ` No mesmo aparelho: ${lensesAgreeing.join(", ")}.` : "";
  const reason = strength === "strong"
    ? `O Google trata como o mesmo assunto: ${sharedPages.length} páginas em comum no top 10 (${lentesLidas}).${concordam}${incompleta}`
    : strength === "support"
      ? `Vizinhança no Google: 2 páginas em comum no top 10 — só vale com outro sinal (${lentesLidas}).${incompleta}`
      : strength === "weak"
        ? `Só 1 página em comum no top 10 (${sharedPages[0]}): para o Google não é o mesmo assunto.${incompleta}`
        : `Nenhuma página em comum no top 10${sharedDomains.length ? ` (só ${sharedDomains.length} domínio(s) em comum)` : ""}: para o Google não é o mesmo assunto.${incompleta}`;
  return {
    leftKeywordId, rightKeywordId, strength,
    sharedPages, sharedPageCount: sharedPages.length, sharedDomains, sharedDomainCount: sharedDomains.length, ...distintivos,
    lensesAgreeing, pageLensesLeft, pageLensesRight, missingLensesLeft, missingLensesRight, complete,
    reason,
  };
}

/* --------------------------------- índice --------------------------------- */

/**
 * O índice da mesa: as pegadas lidas do cache por lote, com a medida
 * memorizada e simétrica. É o que a formação, a troca da principal e o
 * diagnóstico recebem — uma leitura só para todas as perguntas.
 */
export type SerpSubjectIndex = {
  readonly thresholds: SerpSubjectThresholds;
  footprint(keywordId: string): KeywordSerpFootprint | null;
  /** A keyword tem páginas de alguma lente no cache. */
  hasPages(keywordId: string): boolean;
  overlap(leftKeywordId: string, rightKeywordId: string): SerpSubjectOverlap;
  /** As keywords do índice com páginas no cache. */
  keywordIdsWithPages(): string[];
  /** D2.3 (aditivo) — os sites que aparecem em tantas SERPs do lote que não distinguem assunto. */
  genericDomains(): ReadonlySet<string>;
};

export function buildSerpSubjectIndex(
  footprints: readonly KeywordSerpFootprint[],
  thresholds: SerpSubjectThresholds = SERP_SUBJECT_THRESHOLDS,
): SerpSubjectIndex {
  const porId = new Map(footprints.map(item => [item.keywordId, item]));
  const comPaginas = new Set(footprints
    .filter(item => item.lenses.some(leitura => (leitura.urls || []).some(url => Boolean(normalizeSerpPageUrl(url)))))
    .map(item => item.keywordId));
  const memo = new Map<string, SerpSubjectOverlap>();
  // D2.3 — site presente em mais de 15% das SERPs do lote não distingue assunto.
  const presenca = new Map<string, number>();
  let comDominios = 0;
  for (const pegada of footprints) {
    const dominios = new Set<string>();
    for (const leitura of pegada.lenses) {
      for (const url of leitura.urls || []) {
        const pagina = normalizeSerpPageUrl(url);
        if (pagina) dominios.add(hostDaPagina(pagina));
      }
      for (const dominio of leitura.domains || []) {
        const normal = normalizeSerpDomain(dominio);
        if (normal) dominios.add(normal);
      }
    }
    if (!dominios.size) continue;
    comDominios += 1;
    for (const dominio of dominios) presenca.set(dominio, (presenca.get(dominio) ?? 0) + 1);
  }
  const genericos: ReadonlySet<string> = comDominios >= SERP_GENERIC_DOMAIN_MIN_KEYWORDS
    ? new Set([...presenca].filter(([, vezes]) => vezes / comDominios > SERP_GENERIC_DOMAIN_SHARE).map(([dominio]) => dominio))
    : new Set();
  return {
    thresholds,
    genericDomains: () => genericos,
    footprint: keywordId => porId.get(keywordId) || null,
    hasPages: keywordId => comPaginas.has(keywordId),
    keywordIdsWithPages: () => [...comPaginas].sort(),
    overlap(leftKeywordId, rightKeywordId) {
      const chave = `${leftKeywordId}\u0000${rightKeywordId}`;
      const pronta = memo.get(chave);
      if (pronta) return pronta;
      // A contagem é simétrica; a frase cita as duas na ordem pedida.
      const medida = measureSerpSubjectOverlap(porId.get(leftKeywordId), porId.get(rightKeywordId), { thresholds, leftKeywordId, rightKeywordId, genericDomains: genericos });
      memo.set(chave, medida);
      return medida;
    },
  };
}

/**
 * As keywords do índice que dividem a SERP com `keywordId`, da mais forte
 * para a mais fraca, só a partir de `minimum` (padrão: forte).
 */
export function serpSubjectNeighbors(
  index: SerpSubjectIndex,
  keywordId: string,
  candidateIds: readonly string[],
  minimum: Exclude<SerpSubjectStrength, "unknown" | "none"> = "strong",
): SerpSubjectOverlap[] {
  const ordem: Record<SerpSubjectStrength, number> = { strong: 3, support: 2, weak: 1, none: 0, unknown: -1 };
  return candidateIds
    .filter(id => id !== keywordId)
    .map(id => index.overlap(keywordId, id))
    .filter(medida => ordem[medida.strength] >= ordem[minimum])
    .sort((left, right) => right.sharedPageCount - left.sharedPageCount || left.rightKeywordId.localeCompare(right.rightKeywordId));
}
