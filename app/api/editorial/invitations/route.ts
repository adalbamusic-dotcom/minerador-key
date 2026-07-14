import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCanAccessMarca, authzErrorResponse, requireSessionProfile } from "@/lib/server/authz";
import { CollaboratorRoleSchema, ModulePermissionSchema } from "@/lib/editorial/operational-flow";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { InvitationRepository } from "@/lib/server/editorial-repositories";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";

const InvitationInputSchema = z.object({
  brandId: z.string().uuid(), email: z.string().email(), role: CollaboratorRoleSchema,
  permissions: z.array(ModulePermissionSchema).min(1), expiresAt: z.string().datetime(),
});

export async function POST(request: NextRequest) {
  try {
    const profile = await requireSessionProfile();
    const input = InvitationInputSchema.parse(await request.json());
    await assertCanAccessMarca(profile.userId, input.brandId, profile); await assertEditorialPermission(profile, input.brandId, "marca", "manage");
    const invitation = await new InvitationRepository().create({ ...input, createdBy: profile.userId }, profile.userId);
    return NextResponse.json({ invitation, persisted: true, emailSent: false,
      message: "Convite persistido como pendente. Nenhum e-mail foi enviado porque não há provedor configurado." }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Dados do convite inválidos.", details: error.issues }, { status: 400 });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
