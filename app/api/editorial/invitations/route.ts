import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCanAccessMarca, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { CollaboratorRoleSchema, ModulePermissionSchema } from "@/lib/editorial/operational-flow";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { InvitationRepository } from "@/lib/server/editorial-repositories";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";

const InvitationInputSchema = z.object({
  brandId: z.string().uuid(), email: z.string().email(), role: CollaboratorRoleSchema,
  permissions: z.array(ModulePermissionSchema).min(1), expiresAt: z.string().datetime(),
});

/**
 * 2026-10-14 · F2 das listas leves (SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`, item 4).
 *
 * Os convites saíram da mesa (`GET /api/editorial/workspace`), que toda área
 * editorial lia sem usar. Só a Marca ("Equipe") os mostra, e lê aqui, quando a
 * seção abre. Mesma permissão que a mesa exigia (`marca:view`). Falha de
 * leitura é falha (503/erro), nunca "nenhum convite".
 */
export async function GET(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const brandId = z.string().uuid().parse(request.nextUrl.searchParams.get("brandId"));
    await assertEditorialPermission(profile, brandId, "marca", "view");
    const invitations = await new InvitationRepository().list(brandId);
    return NextResponse.json({ invitations, persisted: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Marca inválida." }, { status: 400 });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

/*
 * 2026-10-18 · "Cancelar" convite (defeito da Marca no inventário de botões).
 * O botão de sempre da Equipe passa a gravar pelo `InvitationRepository.updateStatus`
 * que já existia, e a tela só muda depois da releitura. Suspender e revogar não
 * entram: o banco não guarda esses estados (CHECK da 0002), e a tela diz isso.
 */
const InvitationCancelSchema = z.object({ brandId: z.string().uuid(), invitationId: z.string().uuid(), action: z.literal("cancel") }).strict();

export async function PATCH(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = InvitationCancelSchema.parse(await request.json());
    await assertCanAccessMarca(profile.userId, input.brandId, profile); await assertEditorialPermission(profile, input.brandId, "marca", "manage");
    const repository = new InvitationRepository();
    const cancelado = await repository.updateStatus(input.brandId, input.invitationId, "cancelled");
    const relido = (await repository.list(input.brandId)).find(item => item.id === input.invitationId) || null;
    if (!relido) return NextResponse.json({ error: "Convite não encontrado nesta marca." }, { status: 404 });
    if (!cancelado && relido.status !== "cancelled") return NextResponse.json({ error: "Só um convite pendente pode ser cancelado.", invitation: relido }, { status: 409 });
    return NextResponse.json({ invitation: relido, persisted: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Pedido de cancelamento inválido.", details: error.issues }, { status: 400 });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code, error: error.message }, { status: 503 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
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
