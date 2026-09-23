/**
 * A RESPOSTA DO EXPORT SAI EM FLUXO.
 *
 * Com a SERP, a situação da investigação e o contexto do silo, uma linha do
 * dossiê portátil passou de ~59 KB para ~133 KB (medido em 2026-09-23 com a
 * coleta real de "skincare facial"). A função da Vercel recusa corpo de
 * resposta acima de 4,5 MB (413 `FUNCTION_PAYLOAD_TOO_LARGE`) — ou seja, o
 * export quebraria com uns 30 artigos, e "Silos completos" sem seleção manda
 * a marca inteira.
 *
 * A própria Vercel indica o caminho quando o dado não pode encolher: resposta
 * em fluxo não tem esse teto
 * (vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).
 * O Next 16 aceita `new Response(ReadableStream)` num route handler
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md,
 * "Streaming").
 *
 * Por que não um pedido por silo: cada pedido relê os artefatos, os snapshots
 * e as revisões da marca inteira. O fluxo mantém UMA leitura para o lote.
 *
 * Para quem lê, nada muda: é o mesmo JSON, e `resposta.json()` junta os
 * pedaços. Os pedaços são de bytes — um caractere acentuado pode cair entre
 * dois deles; quem decodifica é o leitor, sobre o fluxo inteiro.
 */

export const RADAR_EXPORT_STREAM_CHUNK_BYTES = 256 * 1024;

export function radarPortableExportStreamResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string>; chunkBytes?: number } = {},
): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const pedaco = Math.max(1, init.chunkBytes ?? RADAR_EXPORT_STREAM_CHUNK_BYTES);
  let enviado = 0;
  const fluxo = new ReadableStream<Uint8Array>({
    // `pull` respeita o ritmo de quem lê: um pedaço por vez, sem empilhar tudo na fila.
    pull(controller) {
      if (enviado >= bytes.length) {
        controller.close();
        return;
      }
      const fim = Math.min(enviado + pedaco, bytes.length);
      controller.enqueue(bytes.subarray(enviado, fim));
      enviado = fim;
    },
  });
  return new Response(fluxo, {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(init.headers || {}) },
  });
}
