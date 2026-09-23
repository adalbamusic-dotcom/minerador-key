import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { RADAR_EXPORT_STREAM_CHUNK_BYTES, radarPortableExportStreamResponse } from "../lib/radar/portable-export-response.ts";

/**
 * A RESPOSTA DO EXPORT SAI EM FLUXO — e continua sendo o mesmo JSON.
 *
 * A função da Vercel recusa corpo de resposta acima de 4,5 MB; com ~133 KB por
 * linha, o export quebraria com uns 30 artigos. Resposta em fluxo não tem esse
 * teto. Estes testes provam que o fluxo entrega o JSON intacto (inclusive com
 * acento partido entre dois pedaços) e que a rota usa o fluxo no sucesso.
 */

const semComentarios = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter(linha => !linha.trim().startsWith("//"))
  .join("\n");

const corpoGrande = () => ({
  success: true,
  // ~1,2 MB de texto com acento: força vários pedaços e acento na fronteira.
  files: Array.from({ length: 12 }, (_, indice) => ({ filename: `radar-silo-${indice}.csv`, csv: `"investigação";"ação"\n${"coração, pão e maçã · ".repeat(4_500)}` })),
  headline: "12 dossiê(s) exportado(s).",
});

async function pedacos(resposta: Response) {
  const leitor = resposta.body!.getReader();
  const lidos: Uint8Array[] = [];
  while (true) {
    const { value, done } = await leitor.read();
    if (done) break;
    lidos.push(value);
  }
  return lidos;
}

test("o corpo sai em vários pedaços e volta como o MESMO JSON", async () => {
  const corpo = corpoGrande();
  const serializado = new TextEncoder().encode(JSON.stringify(corpo));
  assert.ok(serializado.length > 4 * RADAR_EXPORT_STREAM_CHUNK_BYTES, "o corpo do teste é maior que vários pedaços");

  const lidos = await pedacos(radarPortableExportStreamResponse(corpo));
  assert.ok(lidos.length > 4, "é fluxo de verdade, não um bloco só");
  assert.ok(lidos.every(pedaco => pedaco.length <= RADAR_EXPORT_STREAM_CHUNK_BYTES));
  const juntos = new Uint8Array(lidos.reduce((total, pedaco) => total + pedaco.length, 0));
  let posicao = 0;
  for (const pedaco of lidos) { juntos.set(pedaco, posicao); posicao += pedaco.length; }
  assert.deepEqual(JSON.parse(new TextDecoder().decode(juntos)), corpo);

  // Quem lê pela tela usa `resposta.json()`: o mesmo resultado.
  assert.deepEqual(await radarPortableExportStreamResponse(corpo).json(), corpo);
});

test("acento partido entre dois pedaços chega inteiro", async () => {
  // "ç" tem 2 bytes: com pedaço de 1 byte, TODO acento é partido.
  const corpo = { texto: "coração · ação · investigação" };
  const resposta = radarPortableExportStreamResponse(corpo, { chunkBytes: 1 });
  assert.deepEqual(await resposta.json(), corpo);
});

test("cabeçalhos: JSON em UTF-8, os do chamador preservados, e sem tamanho fixo", () => {
  const resposta = radarPortableExportStreamResponse({ success: true }, { headers: { "Cache-Control": "no-store" } });
  assert.equal(resposta.status, 200);
  assert.equal(resposta.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  // Com Content-Length o corpo seria um bloco medido de antemão — não um fluxo.
  assert.equal(resposta.headers.get("content-length"), null);
});

test("a rota responde o sucesso em fluxo; erros continuam pequenos, em JSON direto", () => {
  const rota = semComentarios("../app/api/editorial/radar-export/route.ts");
  assert.match(rota, /import \{ radarPortableExportStreamResponse \} from "@\/lib\/radar\/portable-export-response";/);
  const sucesso = rota.slice(rota.indexOf("return radarPortableExportStreamResponse({"), rota.indexOf("} catch (error) {", rota.indexOf("return radarPortableExportStreamResponse({")));
  assert.ok(sucesso.length > 200, "o retorno de sucesso foi encontrado");
  assert.match(sucesso, /^return radarPortableExportStreamResponse\(\{\n\s+success: true,/);
  assert.match(sucesso, /\}, \{ headers: noStoreHeaders \}\);/);
  // O sucesso só sai por fluxo: nenhum `NextResponse.json` com `success: true`.
  assert.doesNotMatch(rota, /NextResponse\.json\(\{\n\s+success: true/);
});
