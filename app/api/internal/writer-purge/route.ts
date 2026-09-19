/**
 * ===== CORTE 5 · A ROTA INTERNA DE PURGA =====
 *
 * ==================== ELA NÃO É PARA GENTE ====================
 *
 * Purga não é ação de quem escreve. Não há tela, não há botão e não há caminho
 * a partir de uma sessão autenticada comum: a rota exige um **token
 * operacional** que só existe no ambiente do servidor.
 *
 * Por isso ela NÃO usa `requireCanonicalSessionProfile`. Autorizar por sessão
 * de usuário daria a qualquer pessoa com login um caminho até o DELETE — e a
 * diferença entre "pode editar um artigo" e "pode apagar histórico em
 * definitivo" é exatamente o que esta rota precisa preservar.
 *
 * ==================== FECHADA POR PADRÃO ====================
 *
 * Sem `WRITER_PURGE_TOKEN` no ambiente, a rota responde 503 e não executa nada.
 * Não é um descuido de configuração: é o estado seguro. A variável não está
 * definida, e enquanto não estiver a purga continua inalcançável.
 *
 * ==================== O NAVEGADOR NÃO É AUTORIDADE DE NADA ====================
 *
 * `brandId` chega no corpo porque a purga é por marca e o disparo é operacional
 * — mas quem manda o corpo é quem tem o token, não um navegador. Nenhum
 * `assetId`, `versionId` ou `updated_by` é aceito: o serviço SELECIONA o que
 * apagar a partir do estado do banco. Aceitar uma lista de ids deixaria o
 * chamador escolher a vítima, e a lista não passaria pelas guardas.
 *
 * ==================== SEM CRON ====================
 *
 * Nada agenda esta rota. `pg_cron` não está instalado e nenhum cron de
 * plataforma foi configurado. Ela só roda quando alguém com o token a chamar.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { PersistenceUnavailableError } from "@/lib/server/editorial-db";
import { executeWriterPurge, planWriterPurge } from "@/lib/server/writer-purge-service";

export const runtime = "nodejs";

const BodySchema = z.object({
  brandId: z.string().uuid(),
  /*
   * `dry_run` é o padrão. Executar exige dizer `execute` em voz alta — e nada
   * neste repositório faz isso.
   */
  mode: z.enum(["dry_run", "execute"]).default("dry_run"),
  limit: z.number().int().min(1).max(500).default(50),
}).strict();

/** Comparação de tempo constante: comparar com `===` vaza o prefixo correto. */
function tokenConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  try {
    const esperado = process.env.WRITER_PURGE_TOKEN;
    if (!esperado) {
      /* Fecha por ausência de configuração, nunca por presença de erro. */
      return NextResponse.json({ code: "purge_not_configured" }, { status: 503 });
    }

    const recebido = request.headers.get("x-writer-purge-token") || "";
    if (!recebido || !tokenConfere(recebido, esperado)) {
      /* 404 e não 403: uma rota interna não confirma a própria existência. */
      return NextResponse.json({ code: "not_found" }, { status: 404 });
    }

    const body = BodySchema.parse(await request.json());

    if (body.mode === "dry_run") {
      const plano = await planWriterPurge({ brandId: body.brandId, limit: body.limit });
      return NextResponse.json(plano, { headers: { "Cache-Control": "no-store, private" } });
    }

    const execucao = await executeWriterPurge({ brandId: body.brandId, limit: body.limit });
    return NextResponse.json(execucao, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ code: "invalid_input", issues: error.issues }, { status: 400 });
    if (error instanceof PersistenceUnavailableError) return NextResponse.json({ code: error.code }, { status: 503 });
    return NextResponse.json({ code: "purge_failed" }, { status: 500 });
  }
}
