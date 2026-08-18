import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse } from "@/lib/server/authz";
import { authorizedSiteBrand } from "@/app/api/marca/site/_helpers";

const QuerySchema = z.string().uuid();

export async function GET(request: Request) {
  try {
    const brandId = QuerySchema.parse(new URL(request.url).searchParams.get("brandId"));
    const brand = await authorizedSiteBrand(brandId);
    const { data, error } = await brand.profile.supabase.from("minerador_keyword_lists").select("id,nome,marca_id").eq("marca_id", brandId).order("nome", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ lists: (data || []).map(item => ({ id: item.id, nome: item.nome })) });
  } catch (error) {
    const mapped = authzErrorResponse(error); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
