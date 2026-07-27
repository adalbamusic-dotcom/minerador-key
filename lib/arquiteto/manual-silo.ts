import type { SiloPagePublicationVerification } from "./contracts.ts";

const slugPattern = /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeManualSiloPageSlug(value: string): string {
  const input = value.trim();
  if (/^https?:\/\//i.test(input) || /\s/.test(input)) throw new Error("Informe somente o slug, sem URL completa ou espaços.");
  if (!input.startsWith("/")) throw new Error("O slug da Página do Silo deve começar com '/'.");
  const normalized = `/${input.slice(1).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}`;
  if (!slugPattern.test(normalized)) throw new Error("O slug deve usar apenas letras minúsculas, números e hífens.");
  return normalized.slice(1);
}

export function assertManualSiloPageSlugAvailable(slug: string, knownSlugs: string[]): void {
  const normalized = slug.replace(/^\//, "").toLowerCase();
  if (knownSlugs.some(candidate => candidate.replace(/^\//, "").toLowerCase() === normalized)) {
    throw new Error("Este slug já está registrado para a marca ativa.");
  }
}

export function assertManualPublishedSiloPageUrl(value: string, brandSiteUrl: string | null | undefined): string {
  const input = value.trim();
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Informe uma URL publicada completa e válida."); }
  if (!/^https?:$/.test(url.protocol)) throw new Error("A URL publicada deve usar HTTP ou HTTPS.");
  if (!brandSiteUrl) throw new Error("A marca ativa não possui domínio configurado para validar esta URL.");
  let brandUrl: URL;
  try { brandUrl = new URL(brandSiteUrl); } catch { throw new Error("O domínio da marca ativa não está configurado corretamente."); }
  if (url.hostname.toLowerCase() !== brandUrl.hostname.toLowerCase()) throw new Error("A URL publicada precisa pertencer ao domínio da marca ativa.");
  return input;
}

export function initialManualSiloPageVerification(status: "new" | "published", publishedUrl: string | null): SiloPagePublicationVerification {
  return {
    status: status === "published" ? "not_checked" : "not_applicable",
    checkedAt: null,
    requestedUrl: publishedUrl,
    resolvedUrl: null,
    declaredCanonical: null,
    httpStatus: null,
    sitemapUrl: null,
    sitemapMatch: null,
    message: status === "published" ? "URL registrada; conferência online ainda não executada." : "Página ainda não publicada.",
  };
}
