import "server-only";

import { getBrandContextPack, type BrandContextModule } from "@/lib/marca/brand-context-pack";
import { BrandSkillSchema, type BrandSkillRecord, type BrandSkillStatus } from "@/lib/marca/brand-skill-contracts";
import { BrandSkillError, brandSkillIdentity, importBrandSkill, replaceBrandSkillMarkdown, type BrandSkillImportInput } from "@/lib/marca/brand-skill-domain";
import { getOperationalClient, mapPersistenceError, OptimisticLockError } from "@/lib/server/editorial-db";

const artifactType = "brand_skill";
type TechnicalStatus = "draft" | "proposed" | "approved" | "rejected" | "superseded";
export type PersistedBrandSkillVersion = { versionId: string; previousVersionId: string | null; lifecycleStatus: TechnicalStatus; skill: BrandSkillRecord };
type Row = { version_id: string; entity_id: string; version_number: number; previous_version_id: string | null; status: TechnicalStatus; content_hash: string; payload: unknown; created_by: string; created_at: string };
type Event = { version_id: string; status: TechnicalStatus; actor_id: string; occurred_at: string };
const uiStatus = (value: TechnicalStatus): BrandSkillStatus => value === "approved" ? "active" : value === "proposed" ? "pending_approval" : value === "draft" ? "draft" : "archived";

export async function listPersistedBrandSkills(brandId: string): Promise<PersistedBrandSkillVersion[]> {
  const client = getOperationalClient();
  const versions = await client.from("editorial_artifact_versions").select("version_id,entity_id,version_number,previous_version_id,status,content_hash,payload,created_by,created_at").eq("marca_id", brandId).eq("artifact_type", artifactType).order("entity_id").order("version_number", { ascending: false });
  if (versions.error) mapPersistenceError(versions.error);
  const rows = (versions.data || []) as Row[];
  const ids = rows.map(row => row.version_id);
  const events = ids.length ? await client.from("editorial_version_status_events").select("version_id,status,actor_id,occurred_at").in("version_id", ids).order("occurred_at") : { data: [], error: null };
  if (events.error) mapPersistenceError(events.error);
  const latest = new Map<string, Event>((events.data || []).map(row => [row.version_id, row as Event]));
  return rows.map(row => {
    const lifecycleStatus = latest.get(row.version_id)?.status || row.status;
    const payload = BrandSkillSchema.parse(row.payload);
    if (payload.brandId !== brandId || brandSkillIdentity(payload) !== row.entity_id || payload.version !== row.version_number || payload.contentHash !== row.content_hash) throw new BrandSkillError("stored_skill_contract_invalid", "A versão persistida da Skill não corresponde ao contrato canônico.");
    return { versionId: row.version_id, previousVersionId: row.previous_version_id, lifecycleStatus, skill: { ...payload, versionId: row.version_id, status: uiStatus(lifecycleStatus), provenance: { ...payload.provenance, importedBy: row.created_by, importedAt: row.created_at } } };
  });
}
const latestOf = (items: PersistedBrandSkillVersion[], definitionKey: string) => items.find(item => item.skill.definitionKey === definitionKey) || null;
async function appendEvent(versionId: string, status: TechnicalStatus, actorId: string, reason: string) { const result = await getOperationalClient().from("editorial_version_status_events").insert({ version_id: versionId, status, actor_id: actorId, reason }); if (result.error) mapPersistenceError(result.error); }

export async function savePersistedBrandSkill(input: BrandSkillImportInput & { expectedPreviousVersionId?: string | null; reason?: string }) {
  const previous = latestOf(await listPersistedBrandSkills(input.brandId), input.definitionKey);
  if ((previous && input.expectedPreviousVersionId !== previous.versionId) || (!previous && input.expectedPreviousVersionId)) throw new OptimisticLockError();
  const prepared = previous ? await replaceBrandSkillMarkdown({ ...input, previous: previous.skill }) : { changed: true, skill: await importBrandSkill(input) };
  if (!prepared.changed) return { outcome: "unchanged" as const, version: previous! };
  const versionId = crypto.randomUUID();
  const inserted = await getOperationalClient().from("editorial_artifact_versions").insert({ version_id: versionId, entity_id: brandSkillIdentity(prepared.skill), marca_id: input.brandId, artifact_type: artifactType, version_number: prepared.skill.version, previous_version_id: previous?.versionId || null, source_version_id: null, status: "draft", content_hash: prepared.skill.contentHash, payload: prepared.skill, origin: "human", change_reason: input.reason?.trim() || "Skill atualizada manualmente.", created_by: input.importedBy, created_at: prepared.skill.provenance.importedAt });
  if (inserted.error) { if (inserted.error.code === "23505") { const recovered = latestOf(await listPersistedBrandSkills(input.brandId), input.definitionKey); if (recovered?.skill.contentHash === prepared.skill.contentHash) return { outcome: "unchanged" as const, version: recovered }; } mapPersistenceError(inserted.error); }
  await appendEvent(versionId, "draft", input.importedBy, "Rascunho de Skill salvo; aprovação humana pendente.");
  const version = (await listPersistedBrandSkills(input.brandId)).find(item => item.versionId === versionId); if (!version) throw new BrandSkillError("readback_missing", "A Skill foi gravada, mas o readback não a confirmou.");
  return { outcome: previous ? "successor" as const : "created" as const, version };
}
export async function transitionPersistedBrandSkill(input: { brandId: string; actorUserId: string; versionId: string; action: "submit" | "approve" | "archive"; reason?: string }) {
  const all = await listPersistedBrandSkills(input.brandId); const target = all.find(item => item.versionId === input.versionId); if (!target) throw new BrandSkillError("skill_not_found", "Versão de Skill não encontrada para esta Marca.");
  const next: TechnicalStatus = input.action === "submit" ? "proposed" : input.action === "approve" ? "approved" : "superseded";
  if (target.lifecycleStatus === next) return { unchanged: true, version: target };
  if (input.action === "submit" && target.lifecycleStatus !== "draft") throw new BrandSkillError("invalid_transition", "Somente um rascunho pode ser enviado para aprovação.");
  if (input.action === "approve" && target.lifecycleStatus !== "proposed") throw new BrandSkillError("invalid_transition", "Somente uma Skill aguardando aprovação pode ser ativada.");
  await appendEvent(target.versionId, next, input.actorUserId, input.reason?.trim() || (next === "proposed" ? "Skill enviada para aprovação humana." : next === "approved" ? "Skill aprovada por decisão humana." : "Skill arquivada por decisão humana."));
  if (next === "approved") { const former = all.find(item => item.skill.definitionKey === target.skill.definitionKey && item.versionId !== target.versionId && item.lifecycleStatus === "approved"); if (former) await appendEvent(former.versionId, "superseded", input.actorUserId, `Substituída por ${target.versionId}.`); }
  const version = (await listPersistedBrandSkills(input.brandId)).find(item => item.versionId === target.versionId); if (!version || version.lifecycleStatus !== next) throw new BrandSkillError("readback_missing", "A mudança de estado não foi confirmada no readback."); return { unchanged: false, version };
}
export async function getPersistedBrandContextPack(input: { brandId: string; module: BrandContextModule; purpose?: string | null }) { return getBrandContextPack({ brandId: input.brandId, module: input.module, purpose: input.purpose, skills: (await listPersistedBrandSkills(input.brandId)).map(item => item.skill) }); }
