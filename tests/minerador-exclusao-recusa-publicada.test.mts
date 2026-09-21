import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Página no ar sai por decisão DECLARADA — nunca por efeito colateral.
 *
 * Duas coisas que pareciam a mesma:
 *
 *   apagar de propósito, com confirmação ...... permitido, janela de 24h
 *   sumir por dedupe/processamento ............ recusado
 *
 * Em 2026-09-21 eu li a segunda e implementei a recusa total, trocando o soft
 * delete contratado por um RAISE. O diálogo "Remover keywords publicadas por
 * 24 horas" continuava na tela oferecendo o que o banco passou a negar — e a
 * rota ainda ganhou uma guarda 409 própria, negando antes mesmo do banco.
 *
 * A diferença entre as duas é a DECLARAÇÃO (`p_allow_recoverable`), desenho
 * que já existiu na migration 0046 e se perdeu. Este teste guarda os dois
 * lados: o caminho legítimo não pode ser bloqueado, e o acidental não pode
 * passar. REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const migration = readFileSync(
  new URL("../supabase/migrations/20260921100000_exclusao_publicada_exige_declaracao.sql", import.meta.url),
  "utf8",
).replace(/^[ \t]*--.*$/gm, "");

test("sem declaração, o lote com publicada é recusado inteiro", () => {
  // A trava roda só quando o chamador NÃO declarou o fluxo recuperável.
  assert.match(
    migration,
    /IF NOT coalesce\(p_allow_recoverable, false\) THEN\s*PERFORM public\.lifecycle_assert_keywords_not_published\(p_brand_id, target_ids\);\s*END IF;/,
    "a recusa é condicional à falta de declaração",
  );

  // O lote inteiro, não uma por vez: apagar "as outras" e avisar depois
  // deixaria o humano sem saber o que aconteceu com o quê.
  assert.match(migration, /lifecycle_assert_keywords_not_published\(p_brand_id, target_ids\)/);

  // Recusar depois de apagar não é recusar.
  const trava = migration.indexOf("lifecycle_assert_keywords_not_published(p_brand_id, target_ids)");
  for (const mutacao of [
    "PERFORM set_config('lifecycle.keyword_operation', 'internal', true)",
    "DELETE FROM public.minerador_keywords ",
    "UPDATE public.minerador_discovery_candidates",
  ]) {
    const indice = migration.indexOf(mutacao);
    assert.ok(indice > 0 && trava < indice, `a trava vem antes de: ${mutacao}`);
  }
});

test("com declaração, a publicada vai para a janela de 24 horas", () => {
  // Isto é contrato, não concessão: a publicada sai da operação, fica
  // restaurável e só então é purgada. Foi o que a recusa total quebrou.
  assert.match(
    migration,
    /IF public\.lifecycle_keyword_is_published\(p_brand_id, current_keyword\.id\) THEN\s*UPDATE public\.minerador_keywords/,
    "o ramo do publicado volta a soft-deletar",
  );
  assert.match(migration, /purge_after = current_timestamp \+ interval '24 hours'/, "a janela é de 24 horas");
  assert.match(migration, /recoverable_ids := array_append\(recoverable_ids, current_keyword\.id\)/, "e entra como recuperável");

  // O parâmetro tem default: a chamada antiga de três argumentos continua
  // resolvendo, então a rota não quebra enquanto o código novo não sobe.
  assert.match(migration, /p_allow_recoverable boolean DEFAULT false/);

  // DROP antes do CREATE: acrescentar parâmetro cria SOBRECARGA, e as duas
  // conviventes deixariam a chamada de três argumentos ambígua.
  const drop = migration.indexOf("DROP FUNCTION IF EXISTS public.lifecycle_delete_minerador_keywords(uuid, uuid[], uuid)");
  const create = migration.indexOf("CREATE OR REPLACE FUNCTION public.lifecycle_delete_minerador_keywords(");
  assert.ok(drop > 0 && create > drop, "o DROP vem antes do CREATE");
});

test("a recusa fala a língua certa: exige o fluxo, não proíbe o ato", () => {
  assert.match(migration, /RAISE EXCEPTION 'KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW: %', protegidas/);
  assert.match(migration, /string_agg\(k\.keyword/, "e nomeia as keywords");

  // "PUBLICATION_PROTECTED" dizia que publicada nunca sai. Não é o contrato.
  assert.doesNotMatch(migration, /KEYWORD_DELETE_PUBLICATION_PROTECTED/, "o código antigo não sobrevive");
});

test("a rota declara o fluxo e não duplica a decisão", () => {
  const rota = readFileSync(
    new URL("../app/api/minerador/marcas/[brandId]/keywords/delete/route.ts", import.meta.url),
    "utf8",
  );
  const limpa = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(limpa, /allowRecoverable: z\.boolean\(\)\.optional\(\)\.default\(false\)/, "ausente é false");
  assert.match(limpa, /p_allow_recoverable: input\.allowRecoverable/, "a declaração chega ao banco");

  // Uma guarda própria aqui recusaria o fluxo legítimo antes do banco — foi
  // exatamente o que aconteceu, e a tela ficou oferecendo o que a rota negava.
  assert.doesNotMatch(limpa, /isKeywordPublished\(/, "a rota não repete a decisão do banco");
  assert.doesNotMatch(limpa, /status: 409/, "nem inventa recusa própria");
});

test("a tela só declara quando o humano confirmou uma publicada", () => {
  const ws = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const limpo = ws.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // `publishedIds` vem do preview do servidor; não vazio significa que o
  // diálogo de 24 horas foi mostrado e o nome foi digitado.
  assert.match(
    limpo,
    /allowRecoverable: review\.publishedIds\.length > 0/,
    "a declaração nasce da confirmação, não de um default",
  );
});
