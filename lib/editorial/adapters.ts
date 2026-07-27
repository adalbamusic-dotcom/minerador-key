import type { ArchitectKeyword } from "../arquiteto/contracts.ts";
import { legacyVersionReference } from "../arquiteto/versioning.ts";
import { adaptKeywordIdentityContext } from "../arquiteto/identity-context.ts";
import type { EditorialSnapshot, LegacyKeywordView } from "./contracts.ts";

const read = (record: Record<string, unknown> | null, aliases: string[]) => {
  for (const alias of aliases) {
    const value = record?.[alias];
    if (value !== undefined && value !== null && value !== "") return { value, available: true, sourcePath: `analise_semantica.${alias}` };
  }
  return { value: null, available: false, sourcePath: aliases.map(alias => `analise_semantica.${alias}`).join(" | ") };
};

export function adaptLegacyBrand(snapshot: EditorialSnapshot) {
  const brand = snapshot.brand;
  const fields = {
    nome: { value: brand.nome, available: Boolean(brand.nome), sourcePath: "marcas.nome" },
    nicho: { value: brand.nicho, available: Boolean(brand.nicho), sourcePath: "marcas.nicho" },
    localizacao: { value: brand.localizacao, available: Boolean(brand.localizacao), sourcePath: "marcas.localizacao" },
    site: { value: brand.site_url, available: Boolean(brand.site_url), sourcePath: "marcas.site_url" },
    diretrizes: { value: brand.dna_diretrizes, available: Boolean(brand.dna_diretrizes), sourcePath: "marcas.dna_diretrizes" },
  };
  const missingFields = ["positioning", "audience", "voice", "businessObjectives", "differentiators", "prohibitedClaims", "editorialPrinciples"];
  const reference = legacyVersionReference(brand.id, { ...fields, rawGuidelines: brand.dna_diretrizes });
  return {
    brandId: brand.id, origin: "legacy" as const, versionId: reference.versionId, contentHash: reference.contentHash,
    rawGuidelines: brand.dna_diretrizes, fields, missingFields,
    completion: Object.values(fields).filter(field => field.available).length / Object.keys(fields).length,
  };
}

export function adaptLegacyKeyword(keyword: EditorialSnapshot["keywords"][number]): LegacyKeywordView {
  const semantic = keyword.analise_semantica;
  const fields = {
    intent: keyword.intent ? { value: keyword.intent, available: true, sourcePath: "keywords_kgr.intent" } : read(semantic, ["intencao_principal", "intencao"]),
    centralEntity: read(semantic, ["entidade_central", "entidade"]),
    audience: read(semantic, ["publico", "publico_alvo"]),
    perceivedProblem: read(semantic, ["problema_percebido", "problema"]),
    desiredResult: read(semantic, ["resultado_desejado", "resultado"]),
    commercialPotential: read(semantic, ["potencial_comercial"]),
    editorialType: read(semantic, ["tipo_editorial", "formato_esperado"]),
    affiliatePotential: read(semantic, ["potencial_afiliado"]),
  };
  const missingFields = Object.entries(fields).filter(([, field]) => !field.available).map(([name]) => name);
  const reference = legacyVersionReference(keyword.id, { keyword: keyword.keyword, semantic, intent: keyword.intent });
  return { keywordId: keyword.id, keyword: keyword.keyword, origin: "legacy", versionId: reference.versionId,
    contentHash: reference.contentHash, status: keyword.status, ...fields, humanConfirmed: false, missingFields };
}

export function snapshotToArchitectKeywords(snapshot: EditorialSnapshot): ArchitectKeyword[] {
  const siloNames = new Map(snapshot.silos.map(silo => [silo.id, silo.nome]));
  return snapshot.keywords.map(keyword => ({
    id: keyword.id, keyword: keyword.keyword, intent: keyword.intent, volume_search: keyword.volume_search,
    kgr_score: keyword.kgr_score, lista_id: keyword.lista_id, silo_id: keyword.lista_id,
    siloName: keyword.lista_id ? siloNames.get(keyword.lista_id) || null : null, status: keyword.status || undefined,
    isPublished: keyword.isPublished ?? keyword.status?.toLowerCase() === "publicado", analise_semantica: keyword.analise_semantica,
    publishedUrl: keyword.publishedUrl ?? keyword.published_url ?? keyword.url ?? null,
    url: keyword.url ?? keyword.publishedUrl ?? keyword.published_url ?? null,
    canonical: keyword.canonical ?? keyword.canonical_url ?? null,
    slug_sugerido: keyword.slug_sugerido ?? null,
    ...adaptKeywordIdentityContext(keyword),
  }));
}
