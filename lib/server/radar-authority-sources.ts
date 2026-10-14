/**
 * ===== 2026-10-14 · FONTES EXTERNAS DE AUTORIDADE — AS LEITURAS DO SERVIDOR (FASE A) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §16.2.
 *
 * Só SELECT: a lista de autoridades da Marca sai do BrandDNA APROVADO (a decisão é
 * humana; rascunho não vale), pela mesma régua da rota da Marca
 * (`effectiveBrandDnaVersionId`). Sem BrandDNA aprovado, ou com a lista vazia, vale
 * a lista sugerida.
 */
import { effectiveBrandDnaVersionId } from "@/lib/marca/domain";
import { getOperationalClient, mapPersistenceError } from "@/lib/server/editorial-db";

export type RadarBrandAuthorityLines = { lines: string[]; brandDnaVersionId: string | null };

export async function readRadarBrandAuthorityLines(brandId: string): Promise<RadarBrandAuthorityLines> {
  const client = getOperationalClient();
  const versoes = await client.from("editorial_artifact_versions")
    .select("version_id,payload")
    .eq("marca_id", brandId).eq("artifact_type", "brand_dna").order("version_number", { ascending: false });
  if (versoes.error) mapPersistenceError(versoes.error);
  const linhas = (versoes.data || []) as Array<{ version_id: string; payload: unknown }>;
  if (!linhas.length) return { lines: [], brandDnaVersionId: null };
  const ids = linhas.map(item => item.version_id);
  const eventos = await client.from("editorial_version_status_events").select("version_id,status,occurred_at").in("version_id", ids).order("occurred_at", { ascending: true });
  if (eventos.error) mapPersistenceError(eventos.error);
  const aprovada = effectiveBrandDnaVersionId(ids, ((eventos.data || []) as Array<{ version_id: string; status: string }>).map(item => ({ versionId: item.version_id, status: item.status })));
  if (!aprovada) return { lines: [], brandDnaVersionId: null };
  const envelope = linhas.find(item => item.version_id === aprovada)?.payload as { payload?: { brandId?: unknown; authoritySources?: unknown } } | undefined;
  /* A lista é da marca pedida, ou não é lista nenhuma. */
  if (!envelope?.payload || envelope.payload.brandId !== brandId) return { lines: [], brandDnaVersionId: null };
  const fontes = Array.isArray(envelope.payload.authoritySources) ? envelope.payload.authoritySources.filter((item): item is string => typeof item === "string") : [];
  return { lines: fontes, brandDnaVersionId: aprovada };
}
