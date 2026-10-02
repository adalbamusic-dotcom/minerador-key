import { NextResponse } from "next/server";
import { z } from "zod";
import { authzErrorResponse, requireCanonicalSessionProfile } from "@/lib/server/authz";
import { assertEditorialPermission } from "@/lib/server/editorial-authorization";
import { assembleRadarPortableExport, radarReadPublishedStructure } from "@/lib/server/radar-portable-export-core";
import {
  radarPortableExportCsv,
  radarPortableExportFilename,
  type RadarPortableExportRow,
} from "@/lib/radar/portable-export";
import { RADAR_EXPORT_MAX_ARTICLES } from "@/lib/radar/portable-silo-scope";
import { radarPortableExportStreamResponse } from "@/lib/radar/portable-export-response";
import {
  radarPortableExportEmptySilos,
  radarPortableExportRows,
  radarPortableExportSiloFiles,
} from "@/lib/radar/portable-export-batch";
import { radarPortableWritingExport } from "@/lib/radar/portable-writing-batch";
import { radarPortableVideoExport } from "@/lib/radar/portable-video-export";

/**
 * ===== O DOSSIÊ EDITORIAL PORTÁTIL — RADAR_PORTABLE_EXPORT_1.2 =====
 *
 * ==================== PROVIDER_CALLS = 0, POR CONSTRUÇÃO ====================
 *
 * Nada aqui coleta. Cada artigo é uma LEITURA do que já foi pago e congelado:
 * snapshot da SERP gravado, estado do Radar, ArticleDNA canônico. Cem artigos
 * custam cem leituras — e nenhuma ida a provider.
 *
 * ==================== §8 · A AUTORIDADE DO GOOGLE, CORRIGIDA ====================
 *
 * A fotografia competitiva do pipeline do Google era montada só dentro do
 * React. Toda resolução de servidor recebia `googleObserved: undefined` e
 * produzia `blueprint: null` — e o CSV saía com título, promessa e estrutura
 * vazios ao lado de uma tela que mostrava o blueprint inteiro.
 *
 * Agora a montagem (em `lib/server/radar-portable-export-core.ts`, a mesma que
 * a ferramenta MCP `get_article_for_writing` usa) lê os mesmos snapshots e
 * chama os mesmos builders de domínio que a tela chama, na mesma ordem. Não
 * existe "a versão do servidor": existe a cadeia, executada onde o dado está.
 *
 * ==================== §2 · UM ARTIGO NÃO DERRUBA O LOTE ====================
 *
 * A recusa é por artigo, com motivo, e o arquivo sai com os que fecharam. Uma
 * exceção aqui faria o artigo 7 de 100 cancelar os outros 99.
 *
 * ==================== 2026-09-23 · A SERP, O REDATOR E O SILO ====================
 *
 * O CSV é a saída final de quem escreve com outra ferramenta ou outra IA, e
 * passou a carregar, por artigo, o que o Redator recebe: a SERP que o dossiê
 * referencia (com a curadoria e as SERPs auxiliares das secundárias), a SERP
 * do cache da marca nas quatro lentes, a situação da investigação com a
 * prontidão, os requisitos de autoridade e a estrutura de cada concorrente.
 *
 * Leituras novas, todas por LOTE e filtradas pela marca: as revisões da SERP
 * (uma consulta, colunas explícitas) e o cache de SERP em modo `observation`
 * (~1 KB por entrada, sem corpo). Nenhuma coleta: o cache é lido, nunca pago.
 *
 * A leitura por artigo (E4 da SDD de egress): a análise corrente passou a vir
 * com só a corrida dela (`_leitura-do-artigo.ts`). As autoridades
 * (`loadRadarCanonicalAuthorities`) ainda releem o item com todas as corridas,
 * e a camada de vídeo relê a linha: as duas moram em `lib/server` e são
 * compartilhadas com o envio ao Planejador e ao Redator. Cortá-las pede
 * mudança lá, não aqui.
 *
 * Com as quatro lentes (adendo R3), a coluna de lentes abre pela CÓPIA
 * congelada no pacote (`bundle.serpLenses`) e deixa o cache como observação
 * fora dele, rotulada como o leitor do Redator a rotula. Pacote sem a cópia
 * declara a ausência. Nenhuma leitura a mais: o bundle já está em memória.
 *
 * `groupBy: "silo"` (opcional) devolve UM CSV POR SILO, EM VEZ do CSV do
 * lote, com os artigos na ordem do silo e o contexto do silo em cada linha.
 * Uma chamada para o lote inteiro: chamar uma vez por silo repetiria a
 * leitura dos artefatos e dos snapshots da marca a cada silo.
 */

const CorpoSchema = z.object({
  brandId: z.string().uuid(),
  /* O teto é o mesmo que a tela confere antes de pedir: uma constante só. */
  articleIds: z.array(z.string().trim().min(1).max(256)).min(1).max(RADAR_EXPORT_MAX_ARTICLES),
  /** Aditivo: sem ele, a resposta é a de antes (um CSV para o lote). */
  groupBy: z.literal("silo").optional(),
  /**
   * 2026-09-23 · Aditivo: o formato do CSV. Sem ele, a resposta é a de antes
   * ("full", o formato completo/técnico): quem chamava continua recebendo as
   * mesmas colunas. A tela manda "writing", o padrão dela.
   */
  /*
   * 2026-10-02 · Aditivo: "video" é o CSV para vídeo e redes sociais — dados,
   * evidências e diretrizes de roteiro do YouTube, sem estrutura de artigo.
   * Sempre um arquivo só, mesmo com `groupBy`.
   */
  mode: z.enum(["writing", "full", "video"]).optional(),
}).strict();

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const profile = await requireCanonicalSessionProfile();
    const input = CorpoSchema.parse(await request.json());
    await assertEditorialPermission(profile, input.brandId, "radar", "view");

    const { exportedAt, montadas, identificacao, recusados, publicacoes, lentes, plano, planoDaSelecao, brandVoice } = await assembleRadarPortableExport({
      brandId: input.brandId,
      articleIds: input.articleIds,
      groupBy: input.mode === "video" ? undefined : input.groupBy,
      supabase: profile.supabase,
      actorUserId: profile.userId,
      /* 2026-10-02 · a estrutura atual da página publicada (H1/H2), para a atualização preservar o que existe. */
      readPublishedStructure: radarReadPublishedStructure,
      /* 2026-10-02 · "Só os selecionados" no formato para escrever também leva o Silo. */
      /* 2026-10-02 · o CSV de vídeo também recebe o Silo (os tópicos que o Silo exclui valem no "não cobrir"). */
      selectionSiloContext: input.mode === "video" || (input.mode === "writing" && !input.groupBy),
    });

    /*
     * ===== 2026-10-02 · O FORMATO "PARA VÍDEO E REDES SOCIAIS" =====
     *
     * As MESMAS entradas, outra projeção: sem estrutura de artigo, com a
     * pesquisa do YouTube que o núcleo já leu. Nenhuma leitura a mais.
     */
    if (input.mode === "video") {
      if (!montadas.length) {
        return NextResponse.json({
          success: false,
          code: "radar_export_empty",
          error: "Nenhum dos artigos selecionados tem investigação finalizada para exportar.",
          refused: recusados,
        }, { status: 409, headers: noStoreHeaders });
      }
      const video = radarPortableVideoExport({ articles: montadas, today: exportedAt, brandVoice, selectionPlan: planoDaSelecao });
      const semYoutube = video.withoutYoutube ? ` ${video.withoutYoutube} sem pesquisa do YouTube: veja a coluna pode_gravar.` : "";
      return radarPortableExportStreamResponse({
        success: true,
        mode: "video",
        csv: video.csv,
        filename: video.filename,
        exported: video.exported,
        refused: recusados,
        headline: recusados.length
          ? `${video.exported} tema(s) exportado(s) para vídeo; ${recusados.length} artigo(s) ficaram de fora por não estarem finalizados.${semYoutube}`
          : `${video.exported} tema(s) exportado(s) para vídeo.${semYoutube}`,
        exportedAt,
        serpCacheReadFailed: lentes.readFailed,
      }, { headers: noStoreHeaders });
    }

    /*
     * ===== 2026-09-23 · O FORMATO "PARA ESCREVER" =====
     *
     * As MESMAS entradas (`montadas`), as MESMAS lentes e o MESMO plano do
     * formato completo — só a projeção muda: 13 colunas fixas, com uma linha
     * de topo por arquivo. Nenhuma leitura a mais: tudo o que a ponte usa já
     * está em memória. Sem `mode`, nada disto roda e a resposta é a de antes.
     */
    if (input.mode === "writing") {
      if (!montadas.length) {
        return NextResponse.json({
          success: false,
          code: "radar_export_empty",
          error: "Nenhum dos artigos selecionados tem investigação finalizada para exportar.",
          refused: recusados,
          ...(plano ? { warnings: plano.warnings, emptySilos: radarPortableExportEmptySilos(plano) } : {}),
        }, { status: 409, headers: noStoreHeaders });
      }
      const escrita = radarPortableWritingExport({ articles: montadas, lenses: lentes, plan: plano, selectionPlan: planoDaSelecao, publications: publicacoes, today: exportedAt, brandVoice });
      const bloqueados = escrita.blocked ? ` ${escrita.blocked} com bloqueio para escrever: veja a coluna pode_escrever.` : "";
      return radarPortableExportStreamResponse({
        success: true,
        mode: "writing",
        ...(plano ? {} : { csv: escrita.csv, filename: escrita.filename }),
        exported: escrita.exported,
        blocked: escrita.blocked,
        refused: recusados,
        headline: recusados.length
          ? `${escrita.exported} artigo(s) exportado(s) para escrever; ${recusados.length} artigo(s) ficaram de fora por não estarem finalizados.${bloqueados}`
          : `${escrita.exported} artigo(s) exportado(s) para escrever.${bloqueados}`,
        exportedAt,
        serpCacheReadFailed: lentes.readFailed,
        ...(plano
          ? {
            files: escrita.files,
            archiveFilename: escrita.archiveFilename,
            emptySilos: radarPortableExportEmptySilos(plano),
            warnings: plano.warnings,
          }
          : {}),
      }, { headers: noStoreHeaders });
    }

    /* As lentes e o contexto do silo entram na linha pela ponte pura, testada com o plano real. */
    const linhaPorArtigo = radarPortableExportRows({ articles: montadas, lenses: lentes, plan: plano });
    const rows: RadarPortableExportRow[] = [...linhaPorArtigo.values()];

    if (!rows.length) {
      return NextResponse.json({
        success: false,
        code: "radar_export_empty",
        error: "Nenhum dos artigos selecionados tem investigação finalizada para exportar.",
        refused: recusados,
        ...(plano ? { warnings: plano.warnings, emptySilos: radarPortableExportEmptySilos(plano) } : {}),
      }, { status: 409, headers: noStoreHeaders });
    }

    /*
     * Em FLUXO: o corpo passa fácil do teto de 4,5 MB da função com as linhas
     * novas (~133 KB cada). Ver `lib/radar/portable-export-response.ts`.
     */
    return radarPortableExportStreamResponse({
      success: true,
      /*
       * O CSV DO LOTE SÓ SAI NO DOSSIÊ AVULSO.
       *
       * Com `groupBy: "silo"`, as MESMAS linhas já vão em `files[].csv`, e a
       * tela lê só `files`. Mandar os dois dobrava o corpo da resposta — e
       * metade dele ia para o lixo — justamente quando cada linha passou de
       * ~59 KB para ~133 KB com a SERP. O teto do corpo de resposta da função
       * chegaria com a metade dos artigos.
       */
      ...(plano
        ? {}
        : {
          csv: radarPortableExportCsv(rows),
          filename: radarPortableExportFilename({ articles: identificacao, today: exportedAt }),
        }),
      exported: rows.length,
      refused: recusados,
      headline: recusados.length
        ? `${rows.length} dossiê(s) exportado(s); ${recusados.length} artigo(s) ficaram de fora por não estarem finalizados.`
        : `${rows.length} dossiê(s) exportado(s).`,
      exportedAt,
      /* A leitura do cache de SERP falhou? A coluna já diz; o campo deixa a tela avisar. */
      serpCacheReadFailed: lentes.readFailed,
      /*
       * Aditivo, só com `groupBy: "silo"`: um CSV por silo, os silos que não
       * tiveram nenhum finalizado e os avisos — os faltantes pelo TÍTULO.
       */
      ...(plano
        ? {
          files: radarPortableExportSiloFiles({ plan: plano, rowsByArticleId: linhaPorArtigo }),
          archiveFilename: plano.delivery.kind === "zip" ? plano.delivery.filename : null,
          emptySilos: radarPortableExportEmptySilos(plano),
          warnings: plano.warnings,
        }
        : {}),
    }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Pedido de exportação inválido.", details: error.issues }, { status: 400, headers: noStoreHeaders });
    }
    const mapped = authzErrorResponse(error);
    return NextResponse.json({ success: false, error: mapped.message }, { status: mapped.status, headers: noStoreHeaders });
  }
}
