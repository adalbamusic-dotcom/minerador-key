import { NextRequest, NextResponse } from "next/server";
import { authzErrorResponse, marcaHasPublished } from "@/lib/server/authz";
import {
  createCanonicalServiceClient,
  listCanonicalAccessibleBrands,
  requireCanonicalBrandManageOrPlatformAdmin,
  requireCanonicalPlatformAdmin,
} from "@/lib/server/canonical-authorization";

interface MarcaPayload {
  id?: string;
  nome?: string;
  site_url?: string;
  nicho?: string;
  dna_diretrizes?: string;
  silos_existentes?: Array<{ nome: string; slug?: string }>;
  localizacao?: string;
  ownerUserId?: string;
  ownerEmail?: string;
  agencyId?: string;
}

export async function GET(request: NextRequest) {
  try {
    const operationalScope = request.nextUrl.searchParams.get("scope") === "operational";
    const access = await listCanonicalAccessibleBrands(operationalScope ? "marca" : undefined);
    const supabase = createCanonicalServiceClient();
    const ids = access.brands.map((brand) => brand.id);
    const query = access.isPlatformAdmin && !operationalScope
      ? supabase.from("marcas").select("*").order("nome", { ascending: true })
      : ids.length
      ? supabase.from("marcas").select("*").in("id", ids).order("nome", { ascending: true })
      : Promise.resolve({ data: [], error: null });
    const { data, error } = await query;
    if (error) throw error;
    const brands = data || [];

    if (brands.length) {
      const links = await supabase.from("agency_brands").select("agency_id,brand_id").in("brand_id", brands.map((brand) => brand.id)).eq("status", "active");
      if (!links.error && links.data?.length) {
        const agencyIds = [...new Set(links.data.map((link) => link.agency_id))];
        const agencies = await supabase.from("agencies").select("id,name").in("id", agencyIds);
        if (!agencies.error) {
          const agencyNameById = new Map((agencies.data || []).map((agency) => [agency.id, agency.name]));
          const agencyIdByBrandId = new Map((links.data || []).map((link) => [link.brand_id, link.agency_id]));
          for (const brand of brands) {
            const agencyId = agencyIdByBrandId.get(brand.id);
            (brand as Record<string, unknown>).agencyName = agencyId ? agencyNameById.get(agencyId) || null : null;
          }
        }
      }
    }

    if (access.isPlatformAdmin && !operationalScope && brands.length) {
      const memberships = await supabase.from("brand_memberships").select("marca_id").in("marca_id", brands.map((brand) => brand.id));
      if (!memberships.error) {
        const counts = new Map<string, number>();
        for (const membership of memberships.data || []) counts.set(membership.marca_id, (counts.get(membership.marca_id) || 0) + 1);
        for (const brand of brands) (brand as Record<string, unknown>).membershipCount = counts.get(brand.id) || 0;
      }

    }
    return NextResponse.json({ brands, role: access.isPlatformAdmin ? "admin" : "cliente", profileLoading: false, scope: operationalScope ? "operational" : "catalog" });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    console.error("Erro na rota GET /api/marcas:", { status: mapped.status });
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: NextRequest) {
  void request;
  return NextResponse.json({ error: "A criacao operacional de marcas pertence ao onboarding da agencia e nao esta disponivel nesta rota.", code: "BRAND_DIRECT_CREATE_RETIRED" }, { status: 405, headers: { Allow: "GET, PUT, DELETE" } });

  /* Retired direct-creation implementation retained temporarily for audit only.
  try {
    await requireCanonicalPlatformAdmin();
    const body = (await request.json()) as MarcaPayload;
    if (!body.nome?.trim()) return NextResponse.json({ error: "O nome da marca é obrigatório." }, { status: 400 });

    const created = await createAdminBrandWithAgency({
      client: createCanonicalServiceClient(),
      name: body.nome,
      ownerUserId: body.ownerUserId,
      agencyId: body.agencyId,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof AdminBrandCreationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const mapped = authzErrorResponse(error);
    console.error("Erro na rota POST /api/marcas:", { status: mapped.status, code: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  */
}

export async function DELETE(request: NextRequest) {
  try {
    await requireCanonicalPlatformAdmin();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID da marca é obrigatório." }, { status: 400 });
    const supabase = createCanonicalServiceClient();
    if (await marcaHasPublished(id, supabase)) {
      return NextResponse.json({ error: "Esta marca possui conteúdo publicado e não pode ser excluída. Arquive a marca em vez de apagar." }, { status: 409 });
    }
    const { error } = await supabase.from("marcas").delete().eq("id", id);
    if (error) {
      if (String(error.message || "").includes("PUBLICADO_PROTEGIDO")) {
        return NextResponse.json({ error: "Esta marca possui conteúdo publicado e não pode ser excluída. Arquive a marca em vez de apagar." }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    console.error("Erro na rota DELETE /api/marcas:", { status: mapped.status });
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as MarcaPayload;
    if (!body.id) return NextResponse.json({ error: "ID da marca é obrigatório." }, { status: 400 });
    if (!body.nome?.trim()) return NextResponse.json({ error: "O nome da marca é obrigatório." }, { status: 400 });
    await requireCanonicalBrandManageOrPlatformAdmin(body.id);

    const supabase = createCanonicalServiceClient();
    const { data, error } = await supabase.from("marcas").update({
      nome: body.nome.trim(),
      site_url: body.site_url?.trim() || null,
      nicho: body.nicho?.trim() || null,
      dna_diretrizes: body.dna_diretrizes?.trim() || null,
      silos_existentes: body.silos_existentes || [],
      localizacao: body.localizacao?.trim() || "",
    }).eq("id", body.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const currentLists = await supabase.from("minerador_keyword_lists").select("nome").eq("marca_id", body.id);
    const currentNames = new Set((currentLists.data || []).map((list) => list.nome.toLowerCase().trim()));
    const newSilos = (body.silos_existentes || []).filter((silo) => silo.nome && !currentNames.has(silo.nome.toLowerCase().trim()));
    if (newSilos.length) {
      const listsResult = await supabase.from("minerador_keyword_lists").insert(newSilos.map((silo) => ({ nome: silo.nome, nicho: body.nicho?.trim() || null, marca_id: body.id })));
      if (listsResult.error) return NextResponse.json({ error: "Marca atualizada, mas os silos novos não puderam ser persistidos." }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (error) {
    const mapped = authzErrorResponse(error);
    console.error("Erro na rota PUT /api/marcas:", { status: mapped.status });
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
