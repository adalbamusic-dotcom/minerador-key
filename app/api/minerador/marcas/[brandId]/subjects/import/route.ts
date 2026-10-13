import { NextResponse } from "next/server";

/**
 * IMPORT DE ASSUNTOS PELO PROCESSADOR — APOSENTADO EM 2026-10-13.
 *
 * SDD `docs/compartilhado/sdd-cadastro-assunto-na-keyword-2026-10-13.md` §3.1:
 * o Assunto entra só pelo card "Cadastrar Assuntos" (rota
 * `/api/minerador/marcas/[brandId]/plans/import`, núcleo
 * `importDeclaredPlanWithCore`), DENTRO da keyword que o carrega. Esta rota
 * criava o Assunto como linha própria ("Assunto solto") e era uma segunda
 * porta: responde 410 sem ler nem gravar nada. O núcleo `importSubjectsWithCore`
 * continua, chamado só pelo núcleo do cadastro.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  return NextResponse.json({
    success: false,
    code: "SUBJECT_ENTRY_MOVED",
    message: "O cadastro de Assuntos mudou: use \"Cadastrar Assuntos\" no Minerador. O Assunto mora na keyword (título, keyword e detalhes numa linha só). Nada foi gravado.",
  }, { status: 410 });
}
