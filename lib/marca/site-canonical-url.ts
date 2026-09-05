/**
 * Identidade canônica de URL do site da Marca.
 *
 * Existe porque `normalizeSiteUrl` (site-domain.ts) só remove a barra final na
 * raiz: `https://marca.com/a/` e `https://marca.com/a` produzem strings
 * diferentes e duplicariam o catálogo. `normalizeSiteUrl` continua responsável
 * por apresentação e pelos guards de host; este módulo responde outra pergunta —
 * "estas duas URLs são o mesmo recurso?".
 *
 * DOIS níveis, deliberadamente separados:
 *
 *   canonicalSiteKey(url)                 — CONSERVADOR, sem contexto de Marca.
 *                                           Mantém protocolo e mantém `www.`.
 *                                           Só remove o que é indiscutível.
 *   brandCanonicalSiteKey(brandSite, url) — IDENTIDADE EDITORIAL da Brand.
 *                                           É esta que alimenta `normalized_url`
 *                                           e o UNIQUE (marca_id, normalized_url).
 *
 * A separação é normativa: a equivalência que `isAuthorizedSiteHost` estabelece
 * é de AUTORIZAÇÃO DE COLETA — quais hosts a Brand pode buscar — e não prova,
 * sozinha, identidade editorial. Por isso o colapso de `www.`/apex e de
 * http/https nunca é global: ele acontece apenas quando ancorado no host e no
 * protocolo declarados em `marcas.site_url`.
 *
 * A URL observada NUNCA é reescrita. A chave é derivada, não substitutiva.
 */

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

export class CanonicalSiteKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalSiteKeyError";
  }
}

type ParsedSiteUrl = { protocol: string; host: string; path: string; query: string };

function parseSiteUrl(rawUrl: string): ParsedSiteUrl {
  const input = (rawUrl || "").trim();
  if (!input) throw new CanonicalSiteKeyError("URL vazia não possui chave canônica.");

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new CanonicalSiteKeyError("URL inválida.");
  }

  if (!HTTP_PROTOCOLS.has(url.protocol)) throw new CanonicalSiteKeyError("Apenas URLs HTTP e HTTPS possuem chave canônica.");
  if (url.username || url.password) throw new CanonicalSiteKeyError("URLs com credenciais não são aceitas.");

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new CanonicalSiteKeyError("URL sem host.");

  // Barra final fora, exceto na raiz. `/a` e `/a/` são o mesmo recurso.
  const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "") || "/";

  // Query PRESERVADA — identifica o recurso. Só a ordem é normalizada.
  const params = [...new URLSearchParams(url.search).entries()]
    .sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
  const query = params.length ? `?${params.map(([name, value]) => `${name}=${value}`).join("&")}` : "";

  // Fragmento descartado: não identifica recurso no servidor.
  return { protocol: url.protocol, host, path, query };
}

/** Remove `www.` apenas para COMPARAR dois hosts. Não reescreve nada. */
const apexOf = (host: string) => host.replace(/^www\./, "");

/**
 * Chave conservadora, sem contexto de Marca.
 *
 * Normaliza só o que é indiscutível: host minúsculo, porta padrão removida,
 * fragmento descartado, barra final removida fora da raiz, query preservada e
 * ordenada, caixa do path e percent-encoding intactos.
 *
 * NÃO colapsa `www.` e NÃO descarta o protocolo — sem saber qual origem a Brand
 * declara como canônica, tratar `http://www.x/a` e `https://x/a` como a mesma
 * coisa seria heurística, não identidade.
 */
export function canonicalSiteKey(rawUrl: string): string {
  const parsed = parseSiteUrl(rawUrl);
  return `${parsed.protocol}//${parsed.host}${parsed.path}${parsed.query}`;
}

/** Versão tolerante para dados observados: entrada inválida vira ausência. */
export function canonicalSiteKeyOrNull(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    return canonicalSiteKey(rawUrl);
  } catch {
    return null;
  }
}

/**
 * Origem canônica da Brand, derivada de `marcas.site_url`. É ela que define
 * qual host e qual protocolo representam o site — não uma regra global.
 */
export type BrandSiteOrigin = { protocol: string; host: string };

export function resolveBrandSiteOrigin(brandSiteUrl: string | null | undefined): BrandSiteOrigin | null {
  if (!brandSiteUrl) return null;
  try {
    const parsed = parseSiteUrl(brandSiteUrl);
    return { protocol: parsed.protocol, host: parsed.host };
  } catch {
    return null;
  }
}

/**
 * `true` quando o host observado é a mesma origem editorial declarada pela
 * Brand, considerando apenas a variação `www.`/apex. Qualquer outro host —
 * subdomínio diferente, outro domínio — é outra coisa.
 */
export function isBrandSiteHost(host: string, origin: BrandSiteOrigin): boolean {
  return apexOf(host.toLowerCase()) === apexOf(origin.host);
}

/**
 * IDENTIDADE EDITORIAL — a chave que alimenta `normalized_url` e o
 * `UNIQUE (marca_id, normalized_url)`.
 *
 * Ancorada na Brand:
 *
 *  - se o host observado for a origem da Brand (apex ou `www.`), a chave usa o
 *    host **exatamente como a Brand o declarou** em `marcas.site_url` e omite o
 *    protocolo, porque a Brand declara uma única origem canônica — a colisão
 *    fica contida na própria configuração da Marca, não numa regra global;
 *  - se o host for outro, devolve `null`: a URL não pertence ao site da Brand e
 *    **não entra no catálogo**. É o mesmo limite que `assertAllowedExternalUrl`
 *    já impõe na coleta, agora também na identidade.
 *
 * Sem `marcas.site_url` cadastrada não existe identidade editorial — devolve
 * `null` em vez de inventar uma.
 */
export function brandCanonicalSiteKey(brandSiteUrl: string | null | undefined, rawUrl: string): string | null {
  const origin = resolveBrandSiteOrigin(brandSiteUrl);
  if (!origin) return null;

  let parsed: ParsedSiteUrl;
  try {
    parsed = parseSiteUrl(rawUrl);
  } catch {
    return null;
  }

  if (!isBrandSiteHost(parsed.host, origin)) return null;
  return `${origin.host}${parsed.path}${parsed.query}`;
}

/** Duas URLs só são a mesma página da Brand por esta regra. Nunca por substring. */
export function sameBrandSiteUrl(
  brandSiteUrl: string | null | undefined,
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left || !right) return false;
  const leftKey = brandCanonicalSiteKey(brandSiteUrl, left);
  const rightKey = brandCanonicalSiteKey(brandSiteUrl, right);
  return Boolean(leftKey) && leftKey === rightKey;
}

/**
 * Chave de uma página a partir do site da Brand e de um slug editorial. Último
 * passo do matching, quando o artefato editorial não traz URL nem canonical.
 */
export function brandCanonicalSiteKeyFromSlug(
  brandSiteUrl: string | null | undefined,
  slug: string | null | undefined,
): string | null {
  const origin = resolveBrandSiteOrigin(brandSiteUrl);
  if (!origin || !slug) return null;
  const path = `/${String(slug).trim().replace(/^\/+|\/+$/g, "")}`;
  if (path === "/") return null;
  try {
    return brandCanonicalSiteKey(brandSiteUrl, new URL(path, `${origin.protocol}//${origin.host}`).toString());
  } catch {
    return null;
  }
}
