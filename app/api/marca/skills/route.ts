import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BrandSkillActionRequestSchema } from "@/lib/marca/brand-skill-contracts";
import { BrandSkillError } from "@/lib/marca/brand-skill-domain";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { listPersistedBrandSkills, savePersistedBrandSkill, transitionPersistedBrandSkill } from "@/lib/server/brand-skills";

const BrandId = z.string().uuid();
function fail(error: unknown) { if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 }); if (error instanceof BrandSkillError) return NextResponse.json({ code: error.code, error: error.message }, { status: error.code === "skill_not_found" ? 404 : 409 }); if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados da Skill inválidos.", details: error.issues }, { status: 400 }); const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status }); }
export async function GET(request: NextRequest) { try { const profile = await requireCanonicalSessionProfile(); const brandId = BrandId.parse(request.nextUrl.searchParams.get("brandId")); await assertEditorialPermission(profile, brandId, "marca", "view"); return NextResponse.json({ skills: await listPersistedBrandSkills(brandId), persistenceMode: "server" }); } catch (error) { return fail(error); } }
export async function POST(request: NextRequest) { try { const profile = await requireCanonicalSessionProfile(); const input = BrandSkillActionRequestSchema.parse(await request.json()); await assertEditorialPermission(profile, input.brandId, "marca", input.action === "approve" ? "approve" : "edit"); if (input.action === "save") { const result = await savePersistedBrandSkill({ brandId: input.brandId, ...input.payload, importedBy: profile.userId }); return NextResponse.json({ ...result, persistenceMode: "server" }, { status: result.outcome === "created" ? 201 : 200 }); } return NextResponse.json({ ...(await transitionPersistedBrandSkill({ ...input, actorUserId: profile.userId })), persistenceMode: "server" }); } catch (error) { return fail(error); } }
