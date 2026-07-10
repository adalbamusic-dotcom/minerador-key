import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import { createClient } from "@supabase/supabase-js";
import {
  requireSessionProfile,
  marcaHasPublished,
  authzErrorResponse,
} from "@/lib/server/authz";
import { listMarcasForProfile } from "@/lib/server/marcas-access.mjs";

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Configuracao server-side do Supabase ausente.");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

interface MarcaPayload {
  id?: string;
  nome?: string;
  site_url?: string;
  nicho?: string;
  dna_diretrizes?: string;
  silos_existentes?: Array<{ nome: string; slug?: string }>;
  localizacao?: string;
}

export async function GET() {
  try {
    const profile = await requireSessionProfile();
    const dataBrands = await listMarcasForProfile(profile, async (marcaId) => {
      let query = profile.supabase.from("marcas").select("*");
      if (marcaId !== null) {
        query = query.eq("id", marcaId);
      }

      const { data, error } = await query.order("nome", { ascending: true });
      if (error) throw error;
      return data || [];
    });

    return NextResponse.json({
      brands: dataBrands,
      role: profile.role,
      profileLoading: false
    });
  } catch (err) {
    const mapped = authzErrorResponse(err);
    console.error("Erro na rota GET /api/marcas:", err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServiceClient();
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const email = session.user.email?.toLowerCase();
    
    // Verifica se o usuário é administrador geral por e-mail ou no banco
    const configuredAdminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase();
    let isAdmin = Boolean(configuredAdminEmail) && email === configuredAdminEmail;
    
    if (!isAdmin) {
      const userId = session.user.id;
      if (userId) {
        const { data: perfil } = await supabase
          .from("perfis")
          .select("role")
          .eq("id", userId)
          .single();
        if (perfil?.role === "admin") {
          isAdmin = true;
        }
      }
    }

    if (!isAdmin) {
      return NextResponse.json({ error: "Apenas administradores podem cadastrar marcas" }, { status: 403 });
    }

    const body = (await req.json()) as MarcaPayload;
    const { nome, site_url, nicho, dna_diretrizes, silos_existentes, localizacao } = body;

    if (!nome || !nome.trim()) {
      return NextResponse.json({ error: "O nome da marca é obrigatório" }, { status: 400 });
    }

    // 1. Grava a nova marca no Supabase usando Service Role (bypassa RLS)
    const { data: newBrand, error: brandError } = await supabase
      .from("marcas")
      .insert([{
        nome: nome.trim(),
        site_url: site_url ? site_url.trim() : null,
        nicho: nicho ? nicho.trim() : null,
        dna_diretrizes: dna_diretrizes ? dna_diretrizes.trim() : null,
        silos_existentes: silos_existentes || [],
        localizacao: localizacao ? localizacao.trim() : ""
      }])
      .select()
      .single();

    if (brandError) {
      console.error("Erro ao gravar marca no Supabase:", brandError);
      return NextResponse.json({ error: brandError.message }, { status: 500 });
    }

    // 2. Grava os silos como listas de KGR iniciais
    if (silos_existentes && Array.isArray(silos_existentes) && silos_existentes.length > 0) {
      const listsPayload = silos_existentes.map((silo) => ({
        nome: silo.nome,
        nicho: nicho ? nicho.trim() : null,
        marca_id: newBrand.id
      }));

      const { error: listsError } = await supabase
        .from("listas_kgr")
        .insert(listsPayload);

      if (listsError) {
        console.error("Erro ao criar os silos automáticos no Supabase:", listsError);
      }
    }

    return NextResponse.json(newBrand);
  } catch (err) {
    const mapped = authzErrorResponse(err);
    console.error("Erro na rota POST /api/marcas:", err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const profile = await requireSessionProfile();

    if (!profile.isAdmin) {
      return NextResponse.json(
        { error: "Apenas administradores podem excluir marcas" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID da marca é obrigatório" }, { status: 400 });
    }

    // 1. Antes de excluir, verifica se ha conteudo publicado vinculado.
    //    Regra absoluta: marca com publicado nao pode ser apagada.
    const hasPublished = await marcaHasPublished(id, profile.supabase);
    if (hasPublished) {
      return NextResponse.json(
        {
          error:
            "Esta marca possui conteúdo publicado e não pode ser excluída. Arquive a marca em vez de apagar.",
        },
        { status: 409 }
      );
    }

    // 2. Sem publicado: hard delete admin (bypassa RLS via Service Role).
    //    O trigger do banco (protect_marca_with_published) ainda e a ultima trave.
    const { error } = await profile.supabase.from("marcas").delete().eq("id", id);

    if (error) {
      // Se o trigger do banco bloqueou (seguranca extra), retorna 409
      const msg = String(error.message || "");
      if (msg.includes("PUBLICADO_PROTEGIDO")) {
        return NextResponse.json(
          {
            error:
              "Esta marca possui conteúdo publicado e não pode ser excluída. Arquive a marca em vez de apagar.",
          },
          { status: 409 }
        );
      }
      console.error("Erro ao excluir marca no Supabase:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const mapped = authzErrorResponse(err);
    if (mapped.status !== 500) {
      console.error("Bloqueio de autorizacao no DELETE /api/marcas:", mapped.message);
    } else {
      console.error("Erro na rota DELETE /api/marcas:", err);
    }
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = createServiceClient();
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const email = session.user.email?.toLowerCase();
    const configuredAdminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase();
    let isAdmin = Boolean(configuredAdminEmail) && email === configuredAdminEmail;
    
    if (!isAdmin) {
      const userId = session.user.id;
      if (userId) {
        const { data: perfil } = await supabase
          .from("perfis")
          .select("role")
          .eq("id", userId)
          .single();
        if (perfil?.role === "admin") {
          isAdmin = true;
        }
      }
    }

    if (!isAdmin) {
      return NextResponse.json({ error: "Apenas administradores podem editar marcas" }, { status: 403 });
    }

    const body = (await req.json()) as MarcaPayload;
    const { id, nome, site_url, nicho, dna_diretrizes, silos_existentes, localizacao } = body;

    if (!id) {
      return NextResponse.json({ error: "ID da marca é obrigatório" }, { status: 400 });
    }

    if (!nome || !nome.trim()) {
      return NextResponse.json({ error: "O nome da marca é obrigatório" }, { status: 400 });
    }

    // 1. Atualiza a marca (bypassa RLS)
    const { data: updatedBrand, error: brandError } = await supabase
      .from("marcas")
      .update({
        nome: nome.trim(),
        site_url: site_url ? site_url.trim() : null,
        nicho: nicho ? nicho.trim() : null,
        dna_diretrizes: dna_diretrizes ? dna_diretrizes.trim() : null,
        silos_existentes: silos_existentes || [],
        localizacao: localizacao ? localizacao.trim() : ""
      })
      .eq("id", id)
      .select()
      .single();

    if (brandError) {
      console.error("Erro ao atualizar marca no Supabase:", brandError);
      return NextResponse.json({ error: brandError.message }, { status: 500 });
    }

    // 2. Verifica se há novos silos e cria na tabela listas_kgr
    if (silos_existentes && Array.isArray(silos_existentes) && silos_existentes.length > 0) {
      // Busca silos atuais na tabela listas_kgr
      const { data: currentLists } = await supabase
        .from("listas_kgr")
        .select("nome")
        .eq("marca_id", id);
      
      const currentNames = new Set(currentLists?.map(l => l.nome.toLowerCase().trim()) || []);
      
      const newSilosToInsert = silos_existentes.filter((silo) => 
        silo.nome && !currentNames.has(silo.nome.toLowerCase().trim())
      );

      if (newSilosToInsert.length > 0) {
        const listsPayload = newSilosToInsert.map((silo) => ({
          nome: silo.nome,
          nicho: nicho ? nicho.trim() : null,
          marca_id: id
        }));

        const { error: listsError } = await supabase
          .from("listas_kgr")
          .insert(listsPayload);

        if (listsError) {
          console.error("Erro ao criar novos silos adicionais via API:", listsError);
        }
      }
    }

    return NextResponse.json(updatedBrand);
  } catch (err) {
    const mapped = authzErrorResponse(err);
    console.error("Erro na rota PUT /api/marcas:", err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
