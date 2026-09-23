import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCanAccessMarca, authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { EditorialSnapshotSchema } from "@/lib/editorial/contracts";

const QuerySchema = z.string().uuid();

export async function GET(request: NextRequest) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const marcaId = QuerySchema.parse(request.nextUrl.searchParams.get("marcaId"));
    await assertCanAccessMarca(profile.userId, marcaId, profile);

    const { data: brand, error: brandError } = await profile.supabase.from("marcas")
      .select("id,nome,site_url,nicho,localizacao,dna_diretrizes,silos_existentes,created_at").eq("id", marcaId).single();
    if (brandError || !brand) return NextResponse.json({ error: "Marca não encontrada." }, { status: 404 });

    const { data: silos, error: silosError } = await profile.supabase.from("minerador_keyword_lists")
      .select("id,nome,nicho,marca_id,created_at").eq("marca_id", marcaId).order("created_at", { ascending: true });
    if (silosError) throw silosError;
    const siloIds = (silos || []).map(silo => silo.id);

    // Correção de isolamento de marca (AGENTS.md seção 5), não só de egress: esta rota usa service role, então a RLS
    // não filtra nada, e o .or() de lista sozinho deixava passar toda keyword sem lista de QUALQUER marca. Medido em
    // 2026-09-23 para a marca 09762023: 267 linhas de 3 marcas (228 de outras), 1,84 MB por carga fria da mesa
    // editorial; com o filtro, 39 linhas e ~0,43 MB. brand_id é NOT NULL e nenhuma keyword aponta para lista de outra
    // marca, então o filtro só remove linhas alheias. O .or() e o gate de siloIds ficam como estavam: marca sem listas
    // continua sem carregar keywords aqui, para não aumentar o egress nem mudar o que o snapshot já entregava.
    const [keywordResult, briefingResult] = siloIds.length ? await Promise.all([
      profile.supabase.from("minerador_keywords").select("id,keyword,intent,volume_search,kgr_score,lista_id,status,analise_semantica,created_at").eq("brand_id", marcaId).is("deleted_at", null).or(`lista_id.is.null,${siloIds.map(id => `lista_id.eq.${id}`).join(",")}`),
      profile.supabase.from("briefings_artigos").select("id,silo_id,keyword_principal,keywords_secundarias,slug_sugerido,hierarquia,status,meta_title,meta_description,diretrizes_estrategicas,created_at").in("silo_id", siloIds),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (keywordResult.error) throw keywordResult.error;
    if (briefingResult.error) throw briefingResult.error;

    const data = EditorialSnapshotSchema.parse({
      brand: { ...brand, site_url: brand.site_url ?? null, nicho: brand.nicho ?? null, localizacao: brand.localizacao ?? null,
        dna_diretrizes: brand.dna_diretrizes ?? null, created_at: brand.created_at ?? null },
      silos: (silos || []).map(silo => ({ ...silo, nicho: silo.nicho ?? null, created_at: silo.created_at ?? null })),
      keywords: (keywordResult.data || []).map(keyword => ({ ...keyword, intent: keyword.intent ?? null,
        volume_search: keyword.volume_search ?? null, kgr_score: keyword.kgr_score ?? null, status: keyword.status ?? null,
        analise_semantica: keyword.analise_semantica ?? null, created_at: keyword.created_at ?? null })),
      briefings: (briefingResult.data || []).filter(briefing => briefing.silo_id).map(briefing => ({ ...briefing,
        titulo: null, canonical: null, updated_at: null, keywords_secundarias: briefing.keywords_secundarias ?? [],
        slug_sugerido: briefing.slug_sugerido ?? null, hierarquia: briefing.hierarquia ?? null, status: briefing.status ?? null,
        meta_title: briefing.meta_title ?? null, meta_description: briefing.meta_description ?? null,
        diretrizes_estrategicas: briefing.diretrizes_estrategicas ?? null, created_at: briefing.created_at ?? null })),
      loadedAt: new Date().toISOString(),
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Marca inválida.", issues: error.flatten() }, { status: 400 });
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
