import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * A recusa existe no caminho REAL de exclusão, não só na tela.
 *
 * Havia três camadas e um buraco no meio. A tela filtrava a seleção; a rota
 * ganhou guarda em 2026-09-21; e o banco continuava fazendo SOFT DELETE de 24
 * horas na keyword publicada. Pior: `lifecycle_assert_keywords_not_published`
 * tinha sido criada no mesmo dia e NENHUMA função a chamava — a trava estava
 * escrita, correta, e morta.
 *
 * Qualquer chamada direta à RPC (outro caminho de código, um job, o painel do
 * Supabase) passava reto. REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

function sqlSemComentarios(caminho: string): string {
  // O cabeçalho da migration cita os dois símbolos que este teste procura.
  // Sem limpar, o teste casaria com a própria explicação.
  return readFileSync(new URL(caminho, import.meta.url), "utf8").replace(/^\s*--.*$/gm, "");
}

const migration = sqlSemComentarios("../supabase/migrations/20260921040000_exclusao_recusa_publicada.sql");

test("a trava é chamada antes de qualquer mutação", () => {
  const chamada = migration.indexOf("PERFORM public.lifecycle_assert_keywords_not_published(p_brand_id, target_ids)");
  assert.ok(chamada > 0, "a RPC chama a trava");

  // Recusar depois de apagar não é recusar. Tudo que escreve vem depois.
  for (const mutacao of [
    "PERFORM set_config('lifecycle.keyword_operation', 'internal', true)",
    "DELETE FROM public.minerador_keywords ",
    "DELETE FROM public.minerador_keyword_metric_measurements",
    "DELETE FROM public.editorial_workflow_items",
    "UPDATE public.minerador_discovery_candidates",
  ]) {
    const indice = migration.indexOf(mutacao);
    assert.ok(indice > 0, `a RPC ainda contém: ${mutacao}`);
    assert.ok(chamada < indice, `a trava vem antes de: ${mutacao}`);
  }

  // O lote inteiro, não uma keyword por vez: apagar "as outras" e avisar
  // depois deixaria o humano sem saber o que aconteceu com o quê.
  assert.match(migration, /lifecycle_assert_keywords_not_published\(p_brand_id, target_ids\)/);
});

test("publicada é recusada, não soft-deletada", () => {
  // Era isto que existia no ramo do publicado, e é isto que não pode voltar.
  assert.doesNotMatch(migration, /interval '24 hours'/, "o soft delete de 24h saiu do ramo do publicado");

  assert.match(
    migration,
    /IF public\.lifecycle_keyword_is_published\(p_brand_id, current_keyword\.id\) THEN\s*RAISE EXCEPTION 'KEYWORD_DELETE_PUBLICATION_PROTECTED/,
    "o ramo do publicado aborta",
  );

  // Não pode virar CONTINUE nem cair adiante: logo abaixo começa o DELETE
  // físico em cascata.
  const ramo = migration.slice(migration.indexOf("IF public.lifecycle_keyword_is_published"));
  const fimDoRamo = ramo.indexOf("END IF;");
  assert.ok(fimDoRamo > 0);
  assert.doesNotMatch(ramo.slice(0, fimDoRamo), /CONTINUE/, "o ramo não segue adiante");
});

test("a recusa do banco chega à rota com código próprio", () => {
  const lifecycle = readFileSync(new URL("../lib/server/minerador-keyword-lifecycle.ts", import.meta.url), "utf8");
  const limpo = lifecycle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // `lifecycleErrorCode` casa o código por substring na mensagem do banco.
  // Sem a entrada no mapa, a recusa viraria um 422 genérico.
  assert.match(limpo, /KEYWORD_DELETE_PUBLICATION_PROTECTED: 409/, "o código está registrado como 409");
  assert.match(limpo, /code === "KEYWORD_DELETE_PUBLICATION_PROTECTED"/, "e tem mensagem própria");

  // A mensagem genérica não diz o que fazer; esta diz.
  assert.match(limpo, /Desvincule a publicação antes/);
});

test("a guarda da rota continua existindo: as duas camadas, não uma", () => {
  const rota = readFileSync(new URL("../app/api/minerador/marcas/[brandId]/keywords/delete/route.ts", import.meta.url), "utf8");
  const limpa = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // O banco passou a recusar, mas a rota continua respondendo antes — é dela
  // que sai a mensagem com o NOME das keywords protegidas.
  assert.match(limpa, /isKeywordPublished\(/);
  assert.match(limpa, /KEYWORD_DELETE_PUBLICATION_PROTECTED/);
  assert.ok(
    limpa.indexOf("KEYWORD_DELETE_PUBLICATION_PROTECTED") < limpa.indexOf("lifecycle_delete_minerador_keywords"),
    "a rota recusa antes de chamar a RPC",
  );
});
