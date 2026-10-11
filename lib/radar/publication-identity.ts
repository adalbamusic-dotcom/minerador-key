/**
 * ===== 2026-10-11 · A IDENTIDADE DE PUBLICAÇÃO — Silo, slug, URL canônica e situação =====
 *
 * Caso real (CSV "Para escrever" de "como atrair um cliente", 2026-10-11): o
 * dono não conseguia dizer quais artigos eram novos e quais já estavam no ar. A
 * ordem narrativa mostrava só o slug ("/qualificados", "/como-captar-um-cliente")
 * com "fora do arquivo (fora desta seleção)"; o link para um destino novo saía
 * "/como-captar-um-cliente (planejado, ainda não publicado)", sem o caminho do
 * Silo, enquanto os irmãos publicados moram em
 * https://adalbapro.com.br/leads-sem-trafego-pago/<slug>; e o artigo novo não
 * dizia o canonical ("Canonical: não informado no CSV", escreveu o redator). A
 * regra antiga do prefixo só funcionava quando o PRÓPRIO artigo já estava no ar.
 *
 * Uma função só (`radarPublicationIdentity`) para este artigo e para cada
 * membro do Silo, usada no bloco "Publicação (para conferir e aprovar no momento de postar)", na
 * ordem narrativa e no destino de cada link:
 *   - publicado: a URL publicada ou o canonical gravado, PRESERVADOS (o que
 *     está gravado vence o calculado; AGENTS §11);
 *   - novo: o canonical gravado, quando há; senão a URL da SiloPage (publicada
 *     ou canonical) + "/<slug>"; sem SiloPage, a origem do site da marca +
 *     "/<slug>"; sem nada, só o slug, com "endereço sem Silo definido".
 *
 * Domínio puro: sem banco, sem rede, sem IA. Nada é gravado: a URL planejada é
 * leitura do que o Arquiteto já decidiu (Silo e slug).
 */

export const RADAR_PUBLICATION_PUBLISHED = "publicado (preservar URL, slug e canonical)";
export const RADAR_PUBLICATION_NEW = "novo (ainda não publicado)";
export const RADAR_PUBLICATION_NO_SILO = "endereço sem Silo definido";

export type RadarPublicationIdentityOrigin = "published" | "canonical" | "silo" | "site" | "slug" | "none";

export type RadarPublicationIdentity = {
  siloLabel: string | null;
  /** A URL da SiloPage (publicada ou canonical); null sem SiloPage com endereço. */
  siloUrl: string | null;
  /** A SiloPage está no ar? null quando não se sabe. */
  siloPublished: boolean | null;
  slug: string | null;
  /** A URL canônica completa (a gravada ou a planejada). null quando só há o slug. */
  url: string | null;
  /** O endereço para dizer: a URL canônica ou, sem ela, "/<slug>". */
  address: string | null;
  published: boolean;
  /** "publicado (preservar URL, slug e canonical)" ou "novo (ainda não publicado)". */
  situation: string;
  /** "publicado" ou "novo, ainda não publicado" (a forma curta da ordem narrativa e dos links). */
  shortSituation: string;
  origin: RadarPublicationIdentityOrigin;
  /** "endereço sem Silo definido" quando a URL não pôde ser montada. */
  note: string | null;
};

export type RadarPublicationIdentityInput = {
  slug?: string | null;
  published?: boolean | null;
  publishedUrl?: string | null;
  canonical?: string | null;
  silo?: {
    label?: string | null;
    /** A SiloPage como o Silo a conhece. */
    page?: { publishedUrl?: string | null; canonical?: string | null; slug?: string | null; published?: boolean | null } | null;
    /**
     * O caminho do Silo lido dos artigos dele já publicados (a URL publicada sem
     * o slug do fim), para o Silo sem SiloPage com endereço: o novo mora ao lado
     * dos irmãos no ar, não na raiz do site.
     */
    baseUrl?: string | null;
  } | null;
  /** A origem do site da marca (https://dominio), para o artigo sem SiloPage e para a SiloPage só com slug. */
  siteOrigin?: string | null;
};

const t = (valor: unknown): string => (typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "");

/** A URL absoluta, sem a barra do fim; null quando não é endereço http(s). */
function absoluta(valor: unknown): string | null {
  const limpo = t(valor);
  if (!/^https?:\/\/[^\s/]+/i.test(limpo)) return null;
  return limpo.replace(/\/+$/, "") || null;
}

/** O slug sem barras nas pontas ("/como-atrair/" → "como-atrair"). */
export function radarPublicationSlug(valor: unknown): string | null {
  const limpo = t(valor).replace(/^\/+|\/+$/g, "");
  return limpo || null;
}

/** A origem (https://dominio) do primeiro endereço absoluto da lista. */
export function radarSiteOriginOf(...enderecos: ReadonlyArray<string | null | undefined>): string | null {
  for (const endereco of enderecos) {
    const url = absoluta(endereco);
    if (!url) continue;
    try {
      return new URL(url).origin;
    } catch {
      continue;
    }
  }
  return null;
}

/** A URL da SiloPage: a publicada, o canonical ou, só com o slug, a origem do site + "/<slug>". */
export function radarSiloPageUrl(pagina: { publishedUrl?: string | null; canonical?: string | null; slug?: string | null } | null | undefined, siteOrigin: string | null = null): string | null {
  if (!pagina) return null;
  const gravada = absoluta(pagina.publishedUrl) || absoluta(pagina.canonical);
  if (gravada) return gravada;
  const slug = radarPublicationSlug(pagina.slug);
  const origem = absoluta(siteOrigin);
  return slug && origem ? `${origem}/${slug}` : null;
}

export function radarPublicationIdentity(input: RadarPublicationIdentityInput): RadarPublicationIdentity {
  const slug = radarPublicationSlug(input.slug);
  const published = Boolean(input.published);
  const siteOrigin = absoluta(input.siteOrigin);
  const pagina = input.silo?.page ?? null;
  const siloUrl = radarSiloPageUrl(pagina, siteOrigin) ?? absoluta(input.silo?.baseUrl);
  const siloPublished = pagina ? (absoluta(pagina.publishedUrl) ? true : typeof pagina.published === "boolean" ? pagina.published : null) : null;
  const publicada = absoluta(input.publishedUrl);
  const canonical = absoluta(input.canonical);
  let url: string | null = null;
  let origin: RadarPublicationIdentityOrigin = "none";
  /* O gravado vence o calculado: no publicado, a URL publicada e, sem ela, o canonical; no novo, o canonical declarado. */
  if (published && publicada) { url = publicada; origin = "published"; }
  else if (canonical) { url = canonical; origin = "canonical"; }
  else if (published && !slug) { url = null; origin = "none"; }
  else if (slug && siloUrl) { url = `${siloUrl}/${slug}`; origin = "silo"; }
  else if (slug && siteOrigin) { url = `${siteOrigin}/${slug}`; origin = "site"; }
  else if (slug) { origin = "slug"; }
  return {
    siloLabel: t(input.silo?.label) || null,
    siloUrl,
    siloPublished,
    slug,
    url,
    address: url ?? (slug ? `/${slug}` : null),
    published,
    situation: published ? RADAR_PUBLICATION_PUBLISHED : RADAR_PUBLICATION_NEW,
    shortSituation: published ? "publicado" : "novo, ainda não publicado",
    origin,
    note: url ? null : RADAR_PUBLICATION_NO_SILO,
  };
}

/** A SiloPage está no ar? Pela URL publicada ou pelo estado legível do Silo ("publicada", "nova, ainda não publicada"); null quando não se sabe. */
export function radarSiloPagePublished(pagina: { publishedUrl?: string | null; status?: string | null } | null | undefined): boolean | null {
  if (!pagina) return null;
  if (absoluta(pagina.publishedUrl)) return true;
  const estado = t(pagina.status).toLocaleLowerCase("pt-BR");
  if (/n[aã]o publicad|\bnova\b|\bnew\b/.test(estado)) return false;
  if (/publicad|published/.test(estado)) return true;
  return null;
}

/** A publicação de um membro como o lote a conhece (`RadarWritingPublication`, só o que a identidade lê). */
export type RadarPublicationRecord = { published: boolean; publishedUrl: string | null; canonical: string | null; slug: string | null };

/** O Silo como o export "Para escrever" o conhece (`RadarSiloExportWritingContext`, só o que a identidade lê). */
export type RadarPublicationSilo = {
  kind: "silo" | "no_silo";
  label: string;
  siloPage: { slug: string | null; canonical: string | null; publishedUrl: string | null; status: string } | null;
  members: ReadonlyArray<{ articleId: string; slug: string | null }>;
};

export type RadarSiloPublicationIdentities = {
  siteOrigin: string | null;
  /** O caminho do Silo lido dos artigos já publicados (sem SiloPage com endereço, é ele que monta a URL do novo). */
  siloBaseUrl: string | null;
  siloPage: RadarPublicationIdentity | null;
  /** Por articleId do membro. */
  members: Map<string, RadarPublicationIdentity>;
};

/**
 * O CAMINHO DO SILO PELOS ARTIGOS JÁ PUBLICADOS: a URL publicada cujo último
 * trecho é o slug do próprio artigo, sem esse trecho ("…/leads-sem-trafego-pago/
 * instagram-nao-traz-pacientes" → "…/leads-sem-trafego-pago"). Vale o caminho
 * que mais artigos dividem (no empate, o primeiro); só na raiz do site, nenhum.
 */
export function radarSiloBaseFromPublished(publicacoes: ReadonlyArray<{ published?: boolean | null; publishedUrl?: string | null; slug?: string | null }>): string | null {
  const contagem = new Map<string, number>();
  for (const item of publicacoes) {
    const url = item.published ? absoluta(item.publishedUrl) : null;
    const slug = radarPublicationSlug(item.slug);
    if (!url || !slug) continue;
    try {
      const endereco = new URL(url);
      const partes = endereco.pathname.split("/").filter(Boolean);
      if (partes.length < 2 || partes[partes.length - 1] !== slug) continue;
      const base = `${endereco.origin}/${partes.slice(0, -1).join("/")}`;
      contagem.set(base, (contagem.get(base) || 0) + 1);
    } catch {
      continue;
    }
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * A IDENTIDADE DE TODO O SILO DE UMA VEZ: a SiloPage e cada membro, pela mesma
 * `radarPublicationIdentity`, com a publicação de cada um (o mapa do lote) e a
 * origem do site (a SiloPage, quem chama e os irmãos no ar).
 */
export function radarSiloPublicationIdentities(input: {
  silo: RadarPublicationSilo | null | undefined;
  publications?: ReadonlyMap<string, RadarPublicationRecord> | null;
  siteUrls?: ReadonlyArray<string | null | undefined>;
  /** A publicação deste artigo (fora do mapa do lote), que também diz o caminho do Silo quando está no ar. */
  extraPublications?: ReadonlyArray<RadarPublicationRecord | null | undefined>;
}): RadarSiloPublicationIdentities {
  const silo = input.silo && input.silo.kind === "silo" ? input.silo : null;
  const publicacoes = [...(input.publications?.values() || [])];
  const siteOrigin = radarSiteOriginOf(
    silo?.siloPage?.publishedUrl, silo?.siloPage?.canonical, ...(input.siteUrls || []),
    ...publicacoes.flatMap(item => [item.publishedUrl, item.canonical]),
  );
  const pagina = silo?.siloPage ?? null;
  /* Sem SiloPage com endereço, o caminho do Silo vem dos membros dele que estão no ar (e deste artigo, quando está). */
  const doSilo = new Set((silo?.members || []).map(membro => membro.articleId));
  const publicadosDoSilo = [
    ...[...(input.publications?.entries() || [])].filter(([articleId]) => doSilo.has(articleId)).map(([, item]) => item),
    ...(input.extraPublications || []).filter((item): item is RadarPublicationRecord => Boolean(item)),
  ];
  const siloBaseUrl = silo ? radarSiloBaseFromPublished(publicadosDoSilo) : null;
  const paginaNoAr = radarSiloPagePublished(pagina);
  const paginaDoSilo = pagina ? { ...pagina, published: paginaNoAr } : null;
  const siloPage = pagina
    /* A SiloPage é o próprio Silo: o endereço dela é a URL do Silo, nunca "<Silo>/<slug>". */
    ? radarPublicationIdentity({ slug: pagina.slug, published: paginaNoAr === true, publishedUrl: pagina.publishedUrl, canonical: radarSiloPageUrl(pagina, siteOrigin), silo: { label: silo?.label ?? null, page: paginaDoSilo }, siteOrigin })
    : null;
  const members = new Map<string, RadarPublicationIdentity>();
  for (const membro of silo?.members || []) {
    const publicacao = input.publications?.get(membro.articleId) ?? null;
    members.set(membro.articleId, radarPublicationIdentity({
      slug: t(publicacao?.slug) || membro.slug,
      published: Boolean(publicacao?.published),
      publishedUrl: publicacao?.publishedUrl ?? null,
      canonical: publicacao?.canonical ?? null,
      silo: { label: silo?.label ?? null, page: paginaDoSilo, baseUrl: siloBaseUrl },
      siteOrigin,
    }));
  }
  return { siteOrigin, siloBaseUrl, siloPage, members };
}

/**
 * O BLOCO "Publicação (para conferir e aprovar no momento de postar)": Silo, URL do Silo, slug, URL
 * canônica e situação, uma informação por linha, para conferir e aprovar no
 * momento de postar.
 */
export function radarPublicationIdentityLines(identidade: RadarPublicationIdentity): string[] {
  const silo = identidade.siloLabel
    ? `- Silo: ${identidade.siloLabel}${identidade.siloUrl ? ` · URL do Silo: ${identidade.siloUrl}${identidade.siloPublished === false ? " (página do Silo nova, ainda não publicada)" : ""}` : ""}`
    : "- Silo: sem Silo resolvido para este artigo";
  return [
    "Publicação (para conferir e aprovar no momento de postar):",
    silo,
    `- Slug: ${identidade.slug ?? "sem slug registrado"}`,
    `- URL canônica: ${identidade.url ?? `${identidade.address ?? "sem endereço"} (${RADAR_PUBLICATION_NO_SILO})`}`,
    `- Situação: ${identidade.situation}`,
  ];
}
