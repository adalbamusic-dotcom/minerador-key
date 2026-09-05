/**
 * A IDENTIDADE PUBLICÁVEL DA SILOPAGE.
 *
 * O gate de aprovação da SiloPage cobra duas coisas que ninguém preenchia:
 *
 *   - `canonical`, sem o qual a página iria ao ar sem declarar qual URL é a
 *     dela;
 *   - `publicationVerification`, a prova de que a URL publicada é MESMO
 *     aquela página.
 *
 * O construtor determinístico deixava `canonical: null` e a verificação em
 * `not_checked`/`not_applicable`. Resultado: três SiloPages consolidadas e
 * nenhuma aprovável — não por falta de decisão humana, mas porque o artefato
 * nunca recebeu o que já tinha sido observado.
 *
 * A EVIDÊNCIA JÁ EXISTE. O catálogo do site da Brand carrega
 * `verification_status`, canonical declarado e URL resolvida para cada página
 * varrida. Este módulo TRANSPORTA esse fato para o artefato — não o produz, e
 * não vai à rede.
 *
 * IDENTIDADE PUBLICADA É PRESERVADA. Para uma página que já está no ar, slug,
 * URL e canonical vêm do que foi observado; nada aqui inventa endereço. Para
 * uma página nova, o canonical é PLANEJADO a partir da origem declarada pela
 * Brand — e planejado não é publicado, distinção que o retorno mantém
 * explícita.
 *
 * Domínio puro: sem storage, sem fetch, sem IA.
 */

import type { SiloPage } from "./contracts.ts";
import { resolveBrandSiteOrigin } from "../marca/site-canonical-url.ts";

type Verification = SiloPage["publicationVerification"];
type VerificationStatus = Verification["status"];

/**
 * O que o catálogo observou sobre uma página do site da Brand.
 *
 * Espelha as colunas de `brand_site_catalog_entries` que interessam aqui; o
 * chamador entrega a linha já lida.
 */
export type SiteCatalogObservation = {
  /** `verification_status` do catálogo. */
  verificationStatus: string;
  resolvedUrl: string | null;
  declaredCanonicalUrl: string | null;
  normalizedCanonicalUrl: string | null;
  httpStatus?: number | null;
  inSitemap?: boolean | null;
  lastVerifiedAt?: string | null;
};

/**
 * TRADUÇÃO ENTRE DOIS VOCABULÁRIOS QUE NÃO SÃO O MESMO.
 *
 * O catálogo descreve o que a varredura viu no site; a SiloPage descreve o
 * que o artefato pode afirmar. Onde não há equivalente honesto, o resultado é
 * `not_checked` COM MOTIVO — nunca um status forte por conveniência, porque é
 * exatamente esse status que destrava a aprovação.
 */
const STATUS_BY_CATALOG: Record<string, VerificationStatus> = {
  canonical_confirmed: "canonical_confirmed",
  accessible: "accessible",
  canonical_conflict: "canonical_mismatch",
  not_found: "unreachable",
};

/** Motivo legível quando a tradução não produz status forte. */
const REASON_BY_CATALOG: Record<string, string> = {
  discovered: "A página foi descoberta no sitemap, mas ainda não teve o canonical conferido.",
  unverified: "A página está no catálogo sem verificação concluída.",
  canonical_missing: "A página não declara canonical próprio.",
  redirect: "A URL redireciona: o endereço observado não é o desta página.",
  noindex: "A página está marcada como noindex.",
};

export type SiloPagePublicationIdentity = {
  canonical: string | null;
  /** Verdadeiro só quando o canonical foi PLANEJADO, não observado. */
  canonicalIsPlanned: boolean;
  publicationStatus: "new" | "published";
  publishedUrl: string | null;
  publicationVerification: Verification;
  /** O que este resultado afirma, em uma frase, para a tela e o relatório. */
  reason: string;
};

const vazio = (): Verification => ({
  status: "not_applicable",
  checkedAt: null,
  requestedUrl: null,
  resolvedUrl: null,
  declaredCanonical: null,
  httpStatus: null,
  sitemapUrl: null,
  sitemapMatch: null,
  message: null,
});

const urlValida = (valor: string | null | undefined): string | null => {
  if (typeof valor !== "string" || !valor.trim()) return null;
  try {
    return new URL(valor.trim().includes("://") ? valor.trim() : `https://${valor.trim()}`).toString();
  } catch {
    return null;
  }
};

/**
 * O canonical PLANEJADO de uma página que ainda não foi publicada.
 *
 * Deriva da origem declarada pela Brand — nenhum domínio é escrito no código.
 * Sem origem declarada não há o que planejar, e devolver algo aqui seria
 * inventar o endereço.
 */
export function plannedSiloPageCanonical(input: {
  brandSiteUrl: string | null | undefined;
  slug: string;
}): string | null {
  const origem = resolveBrandSiteOrigin(input.brandSiteUrl);
  const caminho = `/${String(input.slug || "").trim().replace(/^\/+|\/+$/g, "")}`;
  if (!origem || caminho === "/") return null;
  try {
    return new URL(caminho, `${origem.protocol}//${origem.host}`).toString();
  } catch {
    return null;
  }
}

export function resolveSiloPagePublicationIdentity(input: {
  slug: string;
  brandSiteUrl: string | null | undefined;
  /** Linha do catálogo correspondente a esta página, quando existir. */
  observation?: SiteCatalogObservation | null;
  /** Identidade já gravada na SiloPage vigente; publicada, ela manda. */
  current?: Pick<SiloPage, "publicationStatus" | "publishedUrl" | "canonical"> | null;
}): SiloPagePublicationIdentity {
  const observado = input.observation || null;

  // ------------------------------------------------ página já publicada
  if (observado) {
    const traduzido = STATUS_BY_CATALOG[observado.verificationStatus] ?? null;
    const resolvida = urlValida(observado.resolvedUrl);
    const declarada = urlValida(observado.declaredCanonicalUrl) || urlValida(observado.normalizedCanonicalUrl);

    /*
     * DIVERGÊNCIA NÃO SE RESOLVE ESCOLHENDO UM LADO.
     *
     * Se o artefato já declara canonical e o catálogo observou outro, os
     * dois estão falando de endereços diferentes para a mesma página. Pegar
     * o do catálogo reescreveria identidade publicada em silêncio; pegar o do
     * artefato esconderia o que o site realmente serve. O honesto é preservar
     * o que a página declara e marcar `canonical_mismatch`, que é o status
     * que o gate consulta para NÃO aprovar.
     */
    const jaDeclarado = urlValida(input.current?.canonical);
    const divergente = Boolean(jaDeclarado && declarada && jaDeclarado !== declarada);

    const verification: Verification = {
      ...vazio(),
      status: divergente ? "canonical_mismatch" : traduzido ?? "not_checked",
      checkedAt: observado.lastVerifiedAt ?? null,
      requestedUrl: resolvida,
      resolvedUrl: resolvida,
      declaredCanonical: declarada,
      httpStatus: observado.httpStatus ?? null,
      sitemapMatch: observado.inSitemap ?? null,
      message: divergente
        ? `A SiloPage declara ${jaDeclarado} e o catálogo observou ${declarada}: a identidade publicada não é reescrita aqui.`
        : traduzido
        ? null
        : REASON_BY_CATALOG[observado.verificationStatus]
          || `O catálogo classificou esta página como "${observado.verificationStatus}", sem equivalente que sustente aprovação.`,
    };

    return {
      // Identidade publicada NÃO é reescrita: o que a página já declara vem
      // primeiro, e o observado só preenche o vazio.
      canonical: jaDeclarado || declarada || resolvida,
      canonicalIsPlanned: false,
      publicationStatus: "published",
      publishedUrl: resolvida || urlValida(input.current?.publishedUrl),
      publicationVerification: verification,
      reason: divergente
        ? `Canonical divergente entre o artefato e o catálogo; a aprovação fica bloqueada até alguém decidir qual é o endereço desta página.`
        : traduzido === "canonical_confirmed"
        ? "O catálogo do site confirmou o canonical desta página publicada."
        : traduzido
          ? `O catálogo observou esta página como ${traduzido}.`
          : verification.message || "A página está no catálogo sem verificação conclusiva.",
    };
  }

  // -------------------------------------------------- página ainda nova
  const planejado = plannedSiloPageCanonical({ brandSiteUrl: input.brandSiteUrl, slug: input.slug });
  return {
    canonical: planejado,
    canonicalIsPlanned: Boolean(planejado),
    publicationStatus: "new",
    publishedUrl: null,
    // `not_applicable` é o terminal correto: não há publicação a verificar.
    // Isso é diferente de "não verificamos ainda".
    publicationVerification: { ...vazio(), status: "not_applicable" },
    reason: planejado
      ? "Canonical planejado a partir da origem declarada pela Brand. Planejado não significa publicado."
      : "A Brand não declara origem de site: não há canonical a planejar.",
  };
}
