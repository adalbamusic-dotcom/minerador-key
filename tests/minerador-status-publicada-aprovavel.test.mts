import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MINERADOR_EDITORIAL_STATUS_OPTIONS } from "../lib/minerador/editorial-status.ts";

/**
 * Página no ar também percorre o eixo editorial.
 *
 * Encontrado em teste de fluxo com a publicada `skincare facial`: Lógica,
 * Volume, SERP e revisão humana passaram, e mudar o status para `aprovado`
 * respondeu "Falha ao salvar status" — com o console mostrando um objeto
 * vazio, sem causa. No banco:
 *
 *   status sozinho, publicada ......... PUBLICADO_PROTEGIDO
 *   só semântica, publicada ........... OK   (por isso os processos passaram)
 *   status, NÃO publicada ............. OK
 *
 * `protect_published_keyword` é de quando `publicado` era VALOR de status:
 * congelar a coluna protegia o marcador. Com os três eixos (§66/§67) a
 * publicação virou marcador próprio em `site_origin`, e congelar `status`
 * passou a bloquear o eixo editorial numa página no ar.
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const migration = readFileSync(
  new URL("../supabase/migrations/20260921110000_status_nao_e_estrutural.sql", import.meta.url),
  "utf8",
).replace(/^[ \t]*--.*$/gm, "");

test("status deixa de ser campo estrutural", () => {
  assert.doesNotMatch(
    migration,
    /NEW\.status IS DISTINCT FROM OLD\.status/,
    "qualquer mudança de status não pode mais derrubar a escrita",
  );

  // Os quatro estados editoriais precisam ser alcançáveis numa publicada —
  // é o que o eixo editorial significa.
  assert.ok(MINERADOR_EDITORIAL_STATUS_OPTIONS.length >= 4);
  assert.ok(
    MINERADOR_EDITORIAL_STATUS_OPTIONS.some(opcao => opcao.value === "aprovado"),
    "aprovado é um dos estados, e era justamente o bloqueado",
  );
});

test("a despromoção de linha legada continua barrada", () => {
  // Numa linha cujo status ainda seja 'publicado', sair dele apagaria o
  // único sinal de publicação que ela tem. Nenhuma existe hoje, mas a guarda
  // cobre importação antiga.
  assert.match(
    migration,
    /lower\(coalesce\(OLD\.status, ''\)\) IN \('publicado', 'published'\)\s*AND lower\(coalesce\(NEW\.status, ''\)\) NOT IN \('publicado', 'published'\)/,
  );
});

test("o que era estrutural de verdade continua congelado", () => {
  for (const campo of ["NEW.keyword IS DISTINCT FROM OLD.keyword", "NEW.lista_id IS DISTINCT FROM OLD.lista_id"]) {
    assert.ok(migration.includes(campo), `${campo} segue protegido`);
  }
  assert.match(migration, /old_json \? 'location'/, "location segue protegido");
  assert.match(migration, /PUBLICADO_PROTEGIDO/, "a recusa continua existindo para esses");

  // SECURITY DEFINER não pode se perder na reescrita: a função lê
  // `lifecycle_keyword_is_published`, restrita ao dono.
  assert.match(migration, /^ SECURITY DEFINER$/m);
});

test("o código morto de slug e canonical saiu", () => {
  /*
   * `minerador_keywords` não tem coluna `slug` nem `canonical`: a guarda
   * `old_json ? 'slug'` era sempre falsa e os dois ramos nunca executaram.
   * Induziam a leitura de que o endereço estava protegido aqui — e não
   * estava. Quem protege é `minerador_keywords_trava_identidade_publicada`,
   * dentro do `analise_semantica`, onde slug e canônico moram.
   */
  assert.doesNotMatch(migration, /old_json \? 'slug'/);
  assert.doesNotMatch(migration, /old_json \? 'canonical'/);
});
