import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireSessionProfile,
  marcaHasPublished,
  authzErrorResponse,
} from "@/lib/server/authz";
import { listAccessibleTenantIds } from "@/lib/server/tenant-context";
import { provisionBrandWithOwner } from "@/lib/server/brand-provisioning";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Configuração server-side do Supabase ausente.");
  return createClient(url, key);
}

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
}

export async function GET() {
  try {
    const profile = await requireSessionProfile();
    const tenants = await listAccessibleTenantIds(profile);
    const ids = tenants.map(tenant => tenant.id);
    const { data, error } = ids.length
      ? await profile.supabase.from("marcas").select("*").in("id", ids).order("nome", { ascending: true })
      : { data: [], error: null };
    if (error) throw error;
    const brands = data || [];
    if (profile.isAdmin && ids.length) {
      const memberships = await profile.supabase.from("brand_memberships").select("marca_id").in("marca_id", ids);
      if (!memberships.error) {
        const counts = new Map<string, number>();
        for (const membership of memberships.data || []) counts.set(membership.marca_id, (counts.get(membership.marca_id) || 0) + 1);
        for (const brand of brands) (brand as Record<string, unknown>).membershipCount = counts.get(brand.id) || 0;
      }
    }
    return NextResponse.json({ brands, role: profile.role, profileLoading: false });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    console.error("Erro na rota GET /api/marcas:", { status: mapped.status });
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await requireSessionProfile();
    if (!profile.isAdmin) return NextResponse.json({ error: "Apenas administradores podem cadastrar marcas." }, { status: 403 });
    const body = (await request.json()) as MarcaPayload;
    if (!body.nome?.trim()) return NextResponse.json({ error: "O nome da marca é obrigatório." }, { status: 400 });

    const created = await provisionBrandWithOwner(createServiceClient(), profile.userId, {
      nome: body.nome,
      site_url: body.site_url,
      nicho: body.nicho,
      dna_diretrizes: body.dna_diretrizes,
      silos_existentes: body.silos_existentes,
      localizacao: body.localizacao,
      ownerUserId: body.ownerUserId,
      ownerEmail: body.ownerEmail,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const mapped = authzErrorResponse(error);
    console.error("Erro na rota POST /api/marcas:", { status: mapped.status, code: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const profile = await requireSessionProfile();
    if (!profile.isAdmin) return NextResponse.json({ error: "Apenas administradores podem excluir marcas." }, { status: 403 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID da marca é obrigatório." }, { status: 400 });
    if (await marcaHasPublished(id, profile.supabase)) {
      return NextResponse.json({ error: "Esta marca possui conteúdo publicado e não pode ser excluída. Arquive a marca em vez de apagar." }, { status: 409 });
    }
    const { error } = await profile.supabase.from("marcas").delete().eq("id", id);
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
    const profile = await requireSessionProfile();
    if (!profile.isAdmin) return NextResponse.json({ error: "Apenas administradores podem editar marcas." }, { status: 403 });
    const body = (await request.json()) as MarcaPayload;
    if (!body.id) return NextResponse.json({ error: "ID da marca é obrigatório." }, { status: 400 });
    if (!body.nome?.trim()) return NextResponse.json({ error: "O nome da marca é obrigatório." }, { status: 400 });

    const supabase = createServiceClient();
    const { data, error } = await supabase.from("marcas").update({
      nome: body.nome.trim(),
      site_url: body.site_url?.trim() || null,
      nicho: body.nicho?.trim() || null,
      dna_diretrizes: body.dna_diretrizes?.trim() || null,
      silos_existentes: body.silos_existentes || [],
      localizacao: body.localizacao?.trim() || "",
    }).eq("id", body.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const currentLists = await supabase.from("listas_kgr").select("nome").eq("marca_id", body.id);
    const currentNames = new Set((currentLists.data || []).map(list => list.nome.toLowerCase().trim()));
    const newSilos = (body.silos_existentes || []).filter(silo => silo.nome && !currentNames.has(silo.nome.toLowerCase().trim()));
    if (newSilos.length) {
      const listsResult = await supabase.from("listas_kgr").insert(newSilos.map(silo => ({ nome: silo.nome, nicho: body.nicho?.trim() || null, marca_id: body.id })));
      if (listsResult.error) return NextResponse.json({ error: "Marca atualizada, mas os silos novos não puderam ser persistidos." }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (error) {
    const mapped = authzErrorResponse(error);
    console.error("Erro na rota PUT /api/marcas:", { status: mapped.status });
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
