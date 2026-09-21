import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * Gatilho que lê função restrita tem de rodar como dono.
 *
 * Em 2026-09-21 a trava de identidade foi criada SEM `SECURITY DEFINER`.
 * Ela chama `minerador_keyword_is_published`, cuja ACL é `postgres=X/postgres`
 * — só o dono executa. Com o usuário da tela:
 *
 *   42501 · permission denied for function minerador_keyword_is_published
 *
 * E o alcance não era só a keyword publicada: a checagem acontece antes do
 * retorno antecipado, então QUALQUER update de `analise_semantica` falhava. O
 * caminho de escrita inteiro do Minerador ficou parado.
 *
 * `protect_published_keyword` convive com a mesma ACL restrita há muito tempo
 * porque é `SECURITY DEFINER`. Era só ter seguido o vizinho — e é isto que
 * este teste passa a exigir. REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const PASTA = new URL("../supabase/migrations/", import.meta.url);

/** Gatilhos de `minerador_keywords` escritos por nós. */
const GATILHOS = [
  "minerador_keywords_trava_identidade_publicada",
  "minerador_keywords_preserva_series",
];

/**
 * A definição que VALE é a da migration mais recente — as anteriores são
 * história. Procurar em todas e exigir de todas puniria o arquivo antigo por
 * ter sido corrigido depois.
 */
function ultimaDefinicao(funcao: string): { arquivo: string; corpo: string } {
  const arquivos = readdirSync(PASTA).filter(nome => nome.endsWith(".sql")).sort();
  let achado: { arquivo: string; corpo: string } | null = null;
  for (const arquivo of arquivos) {
    const sql = readFileSync(new URL(arquivo, PASTA), "utf8");
    const marca = `CREATE OR REPLACE FUNCTION public.${funcao}()`;
    const inicio = sql.indexOf(marca);
    if (inicio < 0) continue;
    const corpo = sql.slice(inicio, sql.indexOf("$function$;", inicio) + 11);
    achado = { arquivo, corpo };
  }
  if (!achado) throw new Error(`nenhuma migration define ${funcao}`);
  return achado;
}

for (const funcao of GATILHOS) {
  test(`${funcao} roda como dono`, () => {
    const { arquivo, corpo } = ultimaDefinicao(funcao);
    const semComentario = corpo.replace(/^[ \t]*--.*$/gm, "");

    assert.match(
      semComentario,
      /SECURITY DEFINER/,
      `${arquivo}: sem SECURITY DEFINER o gatilho roda com o papel de quem escreve, e a leitura auxiliar é restrita ao dono`,
    );

    // SECURITY DEFINER sem search_path fixo é a armadilha clássica: o dono
    // passaria a resolver nomes pelo caminho de quem chamou.
    assert.match(semComentario, /SET search_path = pg_catalog, public, pg_temp/, `${arquivo}: search_path fixo`);
  });
}

test("a correção cobre os dois gatilhos no mesmo arquivo", () => {
  // Os dois foram corrigidos juntos de propósito. O de séries não estava
  // quebrado — `minerador_restaura_serie` ficou aberta a PUBLIC —, mas
  // depender disso é depender de acidente: restringir aquela função um dia
  // traria o mesmo 42501, e no caminho de escrita.
  // O cabeçalho explica o defeito e cita `SECURITY DEFINER` em prosa: sem
  // limpar comentários, a contagem casaria com a própria explicação.
  const sql = readFileSync(new URL("20260921090000_gatilhos_rodam_como_dono.sql", PASTA), "utf8")
    .replace(/^[ \t]*--.*$/gm, "");
  for (const funcao of GATILHOS) {
    assert.ok(sql.includes(`CREATE OR REPLACE FUNCTION public.${funcao}()`), `${funcao} está na correção`);
  }
  // Só a declaração, que fica sozinha na linha: os dois `COMMENT ON FUNCTION`
  // também citam o termo no texto.
  assert.equal((sql.match(/^SECURITY DEFINER$/gm) || []).length, GATILHOS.length);
});
