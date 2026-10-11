import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * ===== 2026-10-11 · A MESA NÃO ESTOURA O TEMPO DO BANCO =====
 *
 * Visto em produção (marca adalbapro), depois da leitura em fluxo: "Seção(ões)
 * que não puderam ser lidas: workflow (A operação no banco excedeu o tempo
 * limite…) · documents (idem)". Medido no banco (só leitura):
 *   - documentos: 2 linhas, 8,43 MB de payload (quase tudo o bundle do Radar
 *     copiado no documento). O select da listagem pede ~40 caminhos JSON e cada
 *     um descomprime o payload inteiro: 11,7 s, acima do limite de 8 s. Lendo o
 *     payload UMA vez numa variável e tirando o bundle: 186 ms, 6 KB de saída.
 *   - Radar: a view de listagem devolvia os mesmos 4,4 MB da tabela e custava
 *     543 ms contra 48 ms.
 * Correção: a listagem do Radar lê a tabela; a dos documentos usa a função
 * `editorial_content_documents_listing` (migration 20261011120000), com o select
 * antigo de volta enquanto a função não existir. O documento listado é o MESMO.
 */

const { CONTENT_DOCUMENT_LISTING_SELECT, listedContentDocumentFromListingPayload, listedContentDocumentFromRow } = await import("../lib/editorial/content-document-listing.ts");
const { documentoV2ComDossie, documentoV2SemDossie } = await import("./editorial-documento-e1-fixtures.mts");

const ler = (relativo: string) => readFileSync(new URL("../" + relativo, import.meta.url), "utf8");
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

/* O que o PostgREST devolve para `apelido:payload->a->b`: o valor no caminho, ou null quando falta algum passo. */
function linhaProjetada(payload: unknown): Record<string, unknown> {
  const linha: Record<string, unknown> = {};
  for (const item of CONTENT_DOCUMENT_LISTING_SELECT.split(",")) {
    const [apelido, expressao] = item.split(":");
    const [, ...chaves] = expressao.split("->");
    let valor: unknown = payload;
    for (const chave of chaves) valor = valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>)[chave] : undefined;
    linha[apelido] = valor === undefined ? null : structuredClone(valor);
  }
  return linha;
}

/* O que a função do banco devolve: o payload lido uma vez, sem o bundle do dossiê e com `bundleOmitted`. */
function payloadDaFuncao(payload: Record<string, unknown>): Record<string, unknown> {
  const v = structuredClone(payload);
  const contexto = v.importedContext;
  if (contexto && typeof contexto === "object" && !Array.isArray(contexto)) {
    const dossie = (contexto as Record<string, unknown>).dossier;
    if (dossie && typeof dossie === "object" && !Array.isArray(dossie)) {
      const { bundle: _bundle, ...semBundle } = dossie as Record<string, unknown>;
      void _bundle;
      (contexto as Record<string, unknown>).dossier = { ...semBundle, bundleOmitted: true };
    }
  }
  return v;
}

test("documentos · a função do banco e o select por caminhos listam o MESMO documento (com e sem dossiê)", () => {
  for (const documento of [documentoV2ComDossie("doc-com"), documentoV2SemDossie("doc-sem")] as Array<Record<string, unknown>>) {
    const pelaFuncao = listedContentDocumentFromListingPayload(payloadDaFuncao(documento));
    const peloSelect = listedContentDocumentFromRow(linhaProjetada(documento));
    assert.deepEqual(pelaFuncao, peloSelect, String(documento.id));
    assert.doesNotMatch(JSON.stringify(pelaFuncao), /"bundle"\s*:/, "o bundle não sai na listagem");
  }
});

test("documentos · o repositório chama a função primeiro e volta ao select antigo só sem a função", () => {
  const repo = semComentarios(ler("lib/server/editorial-repositories.ts"));
  const lista = repo.slice(repo.indexOf("const viaFuncao = await client().rpc(\"editorial_content_documents_listing\""));
  assert.ok(lista.length > 0, "a listagem chama a função");
  assert.match(lista, /if \(!viaFuncao\.error\) \{[\s\S]*?listedContentDocumentFromListingPayload\(row\.payload\)/);
  assert.match(lista, /else if \(funcaoDeListagemAusente\(viaFuncao\.error\)\) \{[\s\S]*?CONTENT_DOCUMENT_LISTING_SELECT/);
  assert.match(repo, /return code === "PGRST202" \|\| code === "42883"/);
});

test("documentos · a migration lê o payload uma vez, tira só o bundle, é só leitura e só do service_role", () => {
  const sql = ler("supabase/migrations/20261011120000_listagem_documentos_uma_leitura.sql").replace(/--.*$/gm, "");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.editorial_content_documents_listing\(p_marca_id uuid\)/);
  assert.match(sql, /STABLE\s+SECURITY INVOKER/);
  assert.match(sql, /v := linha\.payload;/);
  assert.match(sql, /\(dossie - 'bundle'\) \|\| '\{"bundleOmitted": true\}'::jsonb/);
  assert.match(sql, /WHERE d\.marca_id = p_marca_id/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.editorial_content_documents_listing\(uuid\) TO service_role;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.editorial_content_documents_listing\(uuid\) FROM anon, authenticated;/);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER TABLE|DROP)\b/i);
});

test("Radar · a listagem lê a tabela (a view custava 10x sem economizar bytes); a poda em TypeScript continua", () => {
  const repo = semComentarios(ler("lib/server/editorial-repositories.ts"));
  assert.match(repo, /let fonteDaListagemWorkflow: string = WORKFLOW_TABELA;/);
  assert.match(repo, /pruneRadarAnalysisHistory\(/);
});
