import { brandCanonicalSiteKey, isBrandSiteHost, resolveBrandSiteOrigin } from "../marca/site-canonical-url.ts";
import type { SitePageType } from "../marca/site-contracts.ts";
import type { DestinationCheck } from "./keyword-subject.ts";

/**
 * PÁGINA DE DESTINO DO ASSUNTO — validação pura (SDD 2026-09-24, F1.2).
 *
 * 1. Obrigatório: `https` explícito e host do site da marca, pela origem
 *    declarada em `marcas.site_url` (`resolveBrandSiteOrigin` +
 *    `isBrandSiteHost`, só a variação `www.`/apex). Fora do domínio, recusa
 *    com motivo (Q4).
 * 2. Informativo, nunca bloqueia: o catálogo do site. Quem lê o catálogo é a
 *    rota, com colunas estreitas, pela chave `subjectDestinationCatalogKey`;
 *    aqui só entra o que ela achou.
 * 3. Sem rede: conferir se a página está no ar é ação da Marca.
 *
 * Sem `site_url` na marca, o Assunto é aceito SEM destino, e a tela diz por quê.
 *
 * Domínio puro.
 */

export type SubjectDestinationCatalogHit = { pageType: SitePageType | null; title: string | null };

export type SubjectDestinationInput = {
  /** O que o humano digitou ou o CSV trouxe. Vazio = sem destino. */
  rawUrl: string | null | undefined;
  /** `marcas.site_url`, lido no servidor para a marca da rota. */
  brandSiteUrl: string | null | undefined;
  checkedAt: string;
  /** Resultado da busca no catálogo; `null`/ausente = fora do catálogo. */
  catalog?: SubjectDestinationCatalogHit | null;
};

export type SubjectDestinationAcceptedCode = "ACCEPTED" | "EMPTY" | "NO_BRAND_SITE";
export type SubjectDestinationRefusedCode = "INVALID_URL" | "NOT_HTTPS" | "OUTSIDE_BRAND_SITE";

export type SubjectDestinationValidation =
  | {
    ok: true;
    code: SubjectDestinationAcceptedCode;
    destinationUrl: string | null;
    destinationCheck: DestinationCheck | null;
    /** Aviso para a tela: sem site cadastrado, ou fora do catálogo. `null` quando não há o que dizer. */
    notice: string | null;
  }
  | { ok: false; code: SubjectDestinationRefusedCode; reason: string };

export const SUBJECT_DESTINATION_NO_BRAND_SITE_NOTICE =
  "A marca não tem site cadastrado: o Assunto é declarado sem página de destino. Cadastre o site na Marca para apontar a virada para uma página." as const;
export const SUBJECT_DESTINATION_OUT_OF_CATALOG_NOTICE =
  "Página fora do catálogo do site. Isso não impede a declaração: landing costuma não estar no sitemap." as const;

function parseAbsolute(raw: string): URL | null {
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function validateSubjectDestination(input: SubjectDestinationInput): SubjectDestinationValidation {
  const raw = typeof input.rawUrl === "string" ? input.rawUrl.trim() : "";
  if (!raw) return { ok: true, code: "EMPTY", destinationUrl: null, destinationCheck: null, notice: null };

  const origin = resolveBrandSiteOrigin(input.brandSiteUrl);
  if (!origin) {
    return { ok: true, code: "NO_BRAND_SITE", destinationUrl: null, destinationCheck: null, notice: SUBJECT_DESTINATION_NO_BRAND_SITE_NOTICE };
  }

  const url = parseAbsolute(raw);
  if (!url || !url.hostname || url.username || url.password) {
    return { ok: false, code: "INVALID_URL", reason: "Informe o endereço completo da página, começando com https://." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, code: "NOT_HTTPS", reason: "A página de destino precisa usar https://." };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!isBrandSiteHost(host, origin)) {
    return { ok: false, code: "OUTSIDE_BRAND_SITE", reason: `A página de destino precisa estar no site da marca (${origin.host}).` };
  }

  const catalog = input.catalog ?? null;
  return {
    ok: true,
    code: "ACCEPTED",
    // A URL observada nunca é reescrita: grava-se o que o humano informou.
    destinationUrl: raw,
    destinationCheck: {
      hostMatchesBrand: true,
      catalogPageType: catalog?.pageType ?? null,
      catalogTitle: catalog?.title?.trim() || null,
      checkedAt: input.checkedAt,
    },
    notice: catalog ? null : SUBJECT_DESTINATION_OUT_OF_CATALOG_NOTICE,
  };
}

/**
 * Chave para buscar a página no catálogo (`brand_site_catalog_entries`,
 * identidade `(marca_id, normalized_url)`). `null` quando a URL não é do site
 * da marca ou a marca não tem site — aí não há busca a fazer.
 */
export function subjectDestinationCatalogKey(brandSiteUrl: string | null | undefined, rawUrl: string | null | undefined): string | null {
  const raw = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!raw) return null;
  return brandCanonicalSiteKey(brandSiteUrl, raw);
}
