import { NextResponse } from "next/server";
import { z } from "zod";
import { RADAR_USER_WORKER_CLAIMABLE_STATUSES, radarSummarizeUserWorkerQueue, type RadarUserWorkerJobRow } from "@/lib/radar/user-worker-presence";
import { PipelineRuntimeError, resolvePipelineContext } from "@/lib/server/pipeline-runtime";

/**
 * O ESTADO OPERACIONAL DA FILA — leitura, e nada além de leitura.
 *
 * USER_WORKER_1 · §5 e §6: a Vercel serve a interface e ENFILEIRA; quem
 * processa é a máquina do usuário. Esta rota existe para a tela poder dizer se
 * há alguém do outro lado, e para não chamar de erro da fonte o que é ausência
 * de processador.
 *
 * ELA É UMA ROTA PRÓPRIA DE PROPÓSITO. A tentação era devolver isto junto com
 * `radar-video-sources`, que a tela já lê. Mas aquela rota é auditada para não
 * encostar em `external_processing_jobs` — a garantia de que registrar fonte
 * não cria nem consome trabalho —, e afrouxar a auditoria para caber uma
 * leitura enfraqueceria a única prova que existe daquilo. Fila é outro assunto:
 * fica em outra porta.
 *
 * O QUE ESTA ROTA NÃO FAZ: não reivindica (`claim_external_processing_job` não
 * aparece aqui), não cria job, não escreve nada, não chama provider, não toca
 * Storage. `GET` sem efeito: relê o que o Supabase registra e devolve.
 */

const QuerySchema = z.object({ brandId: z.string().uuid() });

/*
 * SÓ O TRABALHO DE VÍDEO — porque o número é lido dentro da área Vídeos.
 *
 * O worker do usuário é um só e atende todos os `job_kind`. Mas "3 na fila"
 * impresso no painel de Vídeos tem de significar três vídeos; somar aí uma
 * mídia do Telegram faria a contagem descrever outra coisa que não o que a
 * pessoa está olhando.
 */
const JOB_KIND = "radar_video_text_acquisition";

type LinhaDaFila = { status: string; attempts: number; max_attempts: number; heartbeat_at: string | null };

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({ brandId: url.searchParams.get("brandId") || "" });
    if (!parsed.success) return NextResponse.json({ success: false, error: "Consulta de estado do worker inválida.", issues: parsed.error.flatten() }, { status: 400 });

    const context = await resolvePipelineContext({ brandId: parsed.data.brandId, module: "radar", action: "view" });
    const resultado = await context.supabase
      .from("external_processing_jobs")
      .select("status,attempts,max_attempts,heartbeat_at")
      .eq("brand_id", context.brandId)
      .eq("job_kind", JOB_KIND)
      .in("status", [...RADAR_USER_WORKER_CLAIMABLE_STATUSES, "PROCESSING"]);
    if (resultado.error) throw new PipelineRuntimeError("QUERY_FAILURE", `Não foi possível ler o estado da fila: ${resultado.error.message}`, 503);

    const linhas: RadarUserWorkerJobRow[] = ((resultado.data || []) as unknown as LinhaDaFila[]).map(linha => ({
      status: String(linha.status),
      attempts: Number(linha.attempts) || 0,
      maxAttempts: Number(linha.max_attempts) || 0,
      heartbeatAt: linha.heartbeat_at ?? null,
    }));

    /* A contagem é do domínio: a regra de quem ainda espera worker é conferível sem banco. */
    return NextResponse.json({ success: true, worker: radarSummarizeUserWorkerQueue(linhas) });
  } catch (error) {
    if (error instanceof PipelineRuntimeError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Falha ao ler o estado do worker." }, { status: 500 });
  }
}
