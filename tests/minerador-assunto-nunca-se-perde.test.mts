import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { parseDeclaredPlanText } from "../lib/minerador/declared-plan.ts";
import {
  KEYWORD_SUBJECT_RELEASE_KEY,
  guardKeywordSemanticWrite,
  keywordSubjectBlocksDeletion,
  resolveDeclaredPrincipal,
  resolveKeywordSubject,
  semanticForKeywordWrite,
  setKeywordSubject,
  withdrawKeywordSubject,
  type KeywordSubjectRelease,
} from "../lib/minerador/keyword-subject.ts";
import { importDeclaredPlanWithCore, readDeclaredPlanCardRows } from "../lib/minerador/declared-plan-import-core.ts";
import { SUBJECT_RECOVERED_LABEL, recoverSubjectFromHistory, subjectRestoreHint } from "../lib/minerador/subject-recovery.ts";
import { resolveSubjectArticleView } from "../lib/minerador/subject-article-view.ts";
import { PlanFakeDb, type Row } from "./plano-declarado-fake-db.mts";

/*
 * "O ASSUNTO NUNCA SE PERDE" — ordem do dono (2026-10-13), literal: "não podem
 * perder o assunto de jeito nenhum". Caso real: as 7 keywords do Silo azul da
 * WifiConecta perderam `keyword_subject` pelo antigo "Vínculo → Assunto: Não"
 * (6 pelo lote, 1 pela Revisão Humana). Sem rede, sem provider:
 * REAL_PROVIDER_CALLS_IN_TESTS = 0. Nenhuma exclusão de keyword é chamada.
 */

const ACTOR = "d67ebbad-a590-45f8-8bb5-a19c6241ac1b";
const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const AZUL_REAL = "07fec332-4b0a-43cb-af19-cedfd9b24897";
const PILAR_REAL = "c66d4c43-77dd-4d82-a601-ee8b09c9c771";
const AT = "2026-10-13T12:00:00.000Z";
const LATER = "2026-10-14T09:00:00.000Z";

const limpa = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");
const limpaSql = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/^[ \t]*--.*$/gm, "");

const release = (requestId = "tirar-do-plano:r1", via: KeywordSubjectRelease["via"] = "tirar_do_plano"): KeywordSubjectRelease =>
  ({ requestId, reason: "Tirar do plano: artigo 10.", actorId: ACTOR, at: LATER, via });

/** O `analise_semantica` REAL da keyword Pilar do azul (lido por SELECT em 2026-10-13), só as chaves do Assunto. */
const PILAR_PERDIDO: Row = {
  keyword_subject: null,
  keyword_subject_actor: ACTOR,
  keyword_subject_at: "2026-10-13T05:35:06.847Z",
  keyword_subject_origin: "batch",
  keyword_declared_principal: { groupId: AZUL_REAL, planVersion: 1, subjectKeywordId: PILAR_REAL },
  keyword_subject_history: [
    { actorId: ACTOR, changedAt: "2026-10-13T05:30:10.671Z", destinationUrl: null, next: "declared", note: null, origin: "import", previous: "none" },
    {
      actorId: ACTOR, changedAt: "2026-10-13T05:30:10.671Z", destinationUrl: null,
      entryTitle: "Internet fibra óptica ou internet comum: qual a diferença e qual escolher?",
      next: "declared", note: null, origin: "import",
      plan: { declaredPrincipalKeywordId: PILAR_REAL, groupId: AZUL_REAL, order: 9, planVersion: 1, role: "Pilar" },
      previous: "declared",
    },
    { actorId: ACTOR, changedAt: "2026-10-13T05:35:06.847Z", destinationUrl: null, next: "none", note: null, origin: "batch", previous: "declared" },
  ],
};

function cadastrado(): Record<string, unknown> {
  const gravado = setKeywordSubject({ nicho: "Internet" }, {
    actorId: ACTOR, changedAt: AT, origin: "import",
    entry: { title: "Wi-Fi lento em casa", source: "cadastro" },
    plan: { groupId: AZUL_REAL, planVersion: 1, order: 11, role: "Suporte", scope: "Roteador, interferência e testes.", declaredPrincipal: { keywordId: "k-wifi", phrase: "Wi-Fi lento" } },
  });
  assert.ok(gravado.ok);
  return gravado.semantic;
}

/* ============================================================ migration */

const MIGRATION = "../supabase/migrations/20261015120000_assunto_nunca_se_perde.sql";
const ROLLBACK = "../supabase/rollback/20261015120000_assunto_nunca_se_perde.rollback.sql";

function corpoDaFuncao(sql: string, nome: string): string {
  const inicio = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}()`);
  assert.ok(inicio >= 0, `${nome} definida`);
  return sql.slice(inicio, sql.indexOf("$function$;", inicio) + 11);
}

test("migration: é a última, numa transação, com guardas, ensaio funcional desfeito e pós-checagem", () => {
  const nomes = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter(nome => nome.endsWith(".sql")).sort();
  assert.equal(nomes.at(-1), "20261015120000_assunto_nunca_se_perde.sql", "ordena depois de todas as migrations");
  const sql = limpaSql(MIGRATION);
  assert.match(sql, /^\s*BEGIN;/m);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /ASSUNTO_PRE:/);
  assert.match(sql, /ASSUNTO_POS:/);
  assert.match(sql, /RAISE EXCEPTION 'ASSUNTO_ENSAIO_OK'/);
  assert.match(sql, /EXCEPTION WHEN raise_exception THEN\s+IF SQLERRM <> 'ASSUNTO_ENSAIO_OK' THEN RAISE; END IF;/);
  assert.match(sql, /o ensaio funcional deixou resíduo/);
  assert.doesNotMatch(sql, /DROP TRIGGER|ALTER TABLE|CREATE OR REPLACE VIEW|GRANT /, "não mexe em gatilho existente, tabela, view nem grants");
  const cabecalho = readFileSync(new URL(MIGRATION, import.meta.url), "utf8");
  assert.match(cabecalho, /npx supabase migration repair --status applied 20261015120000 --linked/);
  assert.match(cabecalho, /RAISE EXCEPTION 'ENSAIO'/);
});

test("migration (a): preserva sem marcador, libera só com marcador NOVO, histórico append-only, nunca derruba a escrita", () => {
  const sql = limpaSql(MIGRATION);
  const corpo = corpoDaFuncao(sql, "minerador_keywords_preserva_assunto");
  assert.match(corpo, /SECURITY DEFINER/);
  assert.match(corpo, /SET search_path = pg_catalog, public, pg_temp/);
  assert.doesNotMatch(corpo, /RAISE/, "a preservação nunca derruba a escrita");
  assert.doesNotMatch(corpo, /RETURN NULL/, "nunca descarta a linha");
  // Perdeu: removido/anulado, desdeclarado, sem plan ou sem entry.
  assert.match(corpo, /jsonb_typeof\(assunto_depois\) IS DISTINCT FROM 'object'/);
  assert.match(corpo, /\(assunto_depois -> 'declared'\) IS DISTINCT FROM 'true'::jsonb/);
  assert.match(corpo, /jsonb_typeof\(assunto_antes -> 'plan'\) = 'object' AND jsonb_typeof\(assunto_depois -> 'plan'\) IS DISTINCT FROM 'object'/);
  assert.match(corpo, /jsonb_typeof\(assunto_antes -> 'entry'\) = 'object' AND jsonb_typeof\(assunto_depois -> 'entry'\) IS DISTINCT FROM 'object'/);
  // Liberação: marcador novo, via autorizada e campos preenchidos.
  assert.match(corpo, /liberacao IS DISTINCT FROM \(antes -> 'keyword_subject_release'\)/);
  assert.match(corpo, /\(liberacao ->> 'via'\) IN \('tirar_do_plano', 'conversao', 'excluir_cor'\)/);
  for (const campo of ["requestId", "reason", "actorId", "at"]) assert.ok(corpo.includes(`liberacao ->> '${campo}'`), campo);
  // Repõe o Assunto antigo e registra a tentativa.
  assert.match(corpo, /jsonb_set\(resultado, ARRAY\['keyword_subject'\], assunto_antes, true\)/);
  assert.match(corpo, /'preservedBy', 'database'/);
  assert.match(corpo, /'attempted', jsonb_build_object/);
  assert.match(corpo, /'scope', assunto_antes -> 'plan' -> 'scope'/, "a linha do banco guarda os detalhes");
  assert.match(corpo, /hist_depois @> hist_antes/, "histórico append-only");
  assert.match(sql, /CREATE TRIGGER minerador_keywords_preserva_assunto\s+BEFORE UPDATE ON public\.minerador_keywords\s+FOR EACH ROW\s+WHEN \(OLD\.analise_semantica IS DISTINCT FROM NEW\.analise_semantica\)/);
  // O ensaio funcional cobre os casos pedidos.
  for (const caso of ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7"]) assert.ok(readFileSync(new URL(MIGRATION, import.meta.url), "utf8").includes(`-- ${caso} `), `ensaio ${caso}`);
});

test("migration (b): exclusão (e ida para a lixeira) recusada com Assunto do plano; liberada por Tirar do plano ou pela futura exclusão da cor", () => {
  const sql = limpaSql(MIGRATION);
  const corpo = corpoDaFuncao(sql, "minerador_keywords_recusa_exclusao_com_assunto");
  assert.match(corpo, /SECURITY DEFINER/);
  assert.match(corpo, /SET search_path = pg_catalog, public, pg_temp/);
  assert.match(corpo, /RAISE EXCEPTION 'KEYWORD_DELETE_SUBJECT_PROTECTED:/);
  assert.match(corpo, /jsonb_typeof\(assunto -> 'plan'\) = 'object'/);
  assert.match(corpo, /NOT IN \('tirar_do_plano', 'excluir_cor'\)/);
  assert.match(corpo, /OLD\.deleted_at IS NULL AND NEW\.deleted_at IS NOT NULL/);
  assert.match(sql, /CREATE TRIGGER minerador_keywords_recusa_exclusao_com_assunto\s+BEFORE DELETE OR UPDATE OF deleted_at ON public\.minerador_keywords/);
  // A rota de exclusão mapeia o código para a mensagem da tela.
  const ciclo = limpa("../lib/server/minerador-keyword-lifecycle.ts");
  assert.match(ciclo, /KEYWORD_DELETE_SUBJECT_PROTECTED: 409/);
  assert.match(ciclo, /KEYWORD_DELETE_SUBJECT_PROTECTED_MESSAGE/);
  assert.match(limpa("../modules/minerador/minerador-workspace.tsx"), /code === "KEYWORD_DELETE_SUBJECT_PROTECTED"/);
});

test("rollback: tira só os dois gatilhos e as duas funções, sem mexer em dado", () => {
  const sql = limpaSql(ROLLBACK);
  assert.match(sql, /DROP TRIGGER IF EXISTS minerador_keywords_preserva_assunto ON public\.minerador_keywords;/);
  assert.match(sql, /DROP TRIGGER IF EXISTS minerador_keywords_recusa_exclusao_com_assunto ON public\.minerador_keywords;/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.minerador_keywords_preserva_assunto\(\);/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.minerador_keywords_recusa_exclusao_com_assunto\(\);/);
  assert.doesNotMatch(sql, /UPDATE |DELETE FROM|ALTER TABLE/);
});

/* ================================================== guarda no código */

test("guarda: cópia sem a chave do Assunto LEVA o Assunto (merge, não replace); o resto da escrita passa", () => {
  const antes = cadastrado();
  const copia: Record<string, unknown> = { nicho: "Internet", intencao_principal: "informacional" };
  const guarda = guardKeywordSemanticWrite(antes, copia);
  assert.ok(guarda.ok);
  if (!guarda.ok) return;
  assert.equal(guarda.carried, true);
  assert.deepEqual(guarda.semantic.keyword_subject, antes.keyword_subject);
  assert.equal(guarda.semantic.keyword_subject_origin, "import");
  assert.equal(guarda.semantic.intencao_principal, "informacional", "a escrita das outras chaves continua");
  assert.deepEqual(guarda.semantic.keyword_subject_history, antes.keyword_subject_history);
});

test("guarda: anular, desdeclarar, tirar o plano ou o título sem marcador é RECUSADO com o motivo", () => {
  const antes = cadastrado();
  const assunto = antes.keyword_subject as Record<string, unknown>;
  const casos: Array<[string, Record<string, unknown>]> = [
    ["anulado", { ...antes, keyword_subject: null }],
    ["desdeclarado", { ...antes, keyword_subject: { ...assunto, declared: false } }],
    ["sem plano", { ...antes, keyword_subject: { ...assunto, plan: undefined } }],
    ["sem título", { ...antes, keyword_subject: { ...assunto, entry: null } }],
  ];
  for (const [nome, depois] of casos) {
    const guarda = guardKeywordSemanticWrite(antes, JSON.parse(JSON.stringify(depois)));
    assert.equal(guarda.ok, false, nome);
    if (guarda.ok) continue;
    assert.equal(guarda.code, "SUBJECT_RELEASE_REQUIRED");
    assert.match(guarda.reason, /Tirar do plano/);
    assert.equal(guarda.title, "Wi-Fi lento em casa");
  }
  assert.throws(() => semanticForKeywordWrite(antes, { ...antes, keyword_subject: null }), /Tirar do plano.*Wi-Fi lento em casa/);
});

test("guarda: marcador NOVO libera; o mesmo marcador de novo não; a trava (plan.lock) passa sem marcador", () => {
  const antes = cadastrado();
  const assunto = antes.keyword_subject as Record<string, unknown>;
  const semPlano = { ...antes, keyword_subject: { ...assunto, plan: undefined }, [KEYWORD_SUBJECT_RELEASE_KEY]: release() };
  assert.ok(guardKeywordSemanticWrite(antes, JSON.parse(JSON.stringify(semPlano))).ok);
  const jaLiberado = { ...antes, [KEYWORD_SUBJECT_RELEASE_KEY]: release() };
  const repetido = { ...jaLiberado, keyword_subject: null };
  assert.equal(guardKeywordSemanticWrite(jaLiberado, repetido).ok, false, "marcador repetido não libera");
  const malformado = { ...antes, keyword_subject: null, [KEYWORD_SUBJECT_RELEASE_KEY]: { ...release(), via: "vinculo" } };
  assert.equal(guardKeywordSemanticWrite(antes, malformado).ok, false, "via fora da lista não libera");
  const trava = { ...antes, keyword_subject: { ...assunto, plan: { ...(assunto.plan as Record<string, unknown>), lock: "locked" } } };
  const guarda = guardKeywordSemanticWrite(antes, trava);
  assert.ok(guarda.ok && guarda.carried === false, "a trava do plano (frente A) não é bloqueada");
});

test("guarda: o histórico é append-only (cópia velha volta a ter as linhas gravadas, mesmo com chaves noutra ordem)", () => {
  const antes = cadastrado();
  const historico = antes.keyword_subject_history as Array<Record<string, unknown>>;
  const reordenada = Object.fromEntries(Object.entries(historico[0]).reverse());
  const novaLinha = { previous: "declared", next: "declared", note: null, destinationUrl: null, actorId: ACTOR, changedAt: LATER, origin: "import" };
  const guarda = guardKeywordSemanticWrite(antes, { ...antes, keyword_subject_history: [reordenada, novaLinha] });
  assert.ok(guarda.ok);
  if (!guarda.ok) return;
  assert.equal((guarda.semantic.keyword_subject_history as unknown[]).length, 2, "a linha reordenada é a mesma; a nova fica");
  const truncada = guardKeywordSemanticWrite(antes, { ...antes, keyword_subject_history: [] });
  assert.ok(truncada.ok && (truncada.semantic.keyword_subject_history as unknown[]).length === historico.length);
  const semAssunto = guardKeywordSemanticWrite({ nicho: "x" }, { nicho: "y" });
  assert.ok(semAssunto.ok && semAssunto.carried === false, "keyword comum: nada muda");
});

test("setKeywordSubject/withdrawKeywordSubject: tirar plano ou Assunto exige o marcador; com ele, o marcador e o histórico registram", () => {
  const antes = cadastrado();
  const semMarcador = setKeywordSubject(antes, { actorId: ACTOR, changedAt: LATER, origin: "review", plan: null });
  assert.equal(semMarcador.ok, false);
  assert.equal(!semMarcador.ok && semMarcador.code, "SUBJECT_RELEASE_REQUIRED");
  const comMarcador = setKeywordSubject(antes, { actorId: ACTOR, changedAt: LATER, origin: "review", plan: null, release: release() });
  assert.ok(comMarcador.ok && comMarcador.changed);
  assert.equal((comMarcador.semantic[KEYWORD_SUBJECT_RELEASE_KEY] as KeywordSubjectRelease).via, "tirar_do_plano");
  const linha = (comMarcador.semantic.keyword_subject_history as Array<Record<string, unknown>>).at(-1)!;
  assert.equal((linha.release as KeywordSubjectRelease).requestId, "tirar-do-plano:r1");
  assert.equal(resolveKeywordSubject(comMarcador.semantic).declared, true, "o Assunto continua declarado; só o plano saiu");
  // O histórico do cadastro já leva os detalhes (escopo) para uma recuperação futura.
  const gravacao = (antes.keyword_subject_history as Array<Record<string, unknown>>).at(-1)!;
  assert.equal((gravacao.plan as Record<string, unknown>).scope, "Roteador, interferência e testes.");

  assert.equal(withdrawKeywordSubject(antes, { actorId: ACTOR, changedAt: LATER, origin: "batch" }).ok, false, "o antigo \"Assunto: Não\" é recusado");
  const retirado = withdrawKeywordSubject(antes, { actorId: ACTOR, changedAt: LATER, origin: "review", release: release("conv:1", "conversao") });
  assert.ok(retirado.ok && retirado.changed);
  const saida = (retirado.semantic.keyword_subject_history as Array<Record<string, unknown>>).at(-1)!;
  assert.equal(saida.entryTitle, "Wi-Fi lento em casa");
  assert.equal((saida.plan as Record<string, unknown>).order, 11);
});

test("exclusão: a mesma regra do gatilho (plano bloqueia; título só sai depois de Tirar do plano ou da futura exclusão da cor)", () => {
  const antes = cadastrado();
  assert.equal(keywordSubjectBlocksDeletion(antes), true);
  const tirado = setKeywordSubject(antes, { actorId: ACTOR, changedAt: LATER, origin: "review", plan: null, release: release() });
  assert.ok(tirado.ok);
  assert.equal(keywordSubjectBlocksDeletion(tirado.semantic), false, "depois de Tirar do plano, pode");
  const soTitulo = setKeywordSubject({}, { actorId: ACTOR, changedAt: AT, origin: "import", entry: { title: "Reforço", source: "cadastro" } });
  assert.ok(soTitulo.ok);
  assert.equal(keywordSubjectBlocksDeletion(soTitulo.semantic), true);
  assert.equal(keywordSubjectBlocksDeletion({ ...soTitulo.semantic, [KEYWORD_SUBJECT_RELEASE_KEY]: release("cor:1", "excluir_cor") }), false, "a exclusão da cor (SDD futura) libera pelo marcador");
  assert.equal(keywordSubjectBlocksDeletion({ nicho: "x" }), false);
});

/* ============================== lista fechada e escritores (estrutural) */

function arquivos(pasta: string): string[] {
  const raiz = new URL(`../${pasta}/`, import.meta.url);
  const saida: string[] = [];
  const andar = (url: URL, relativo: string) => {
    for (const nome of readdirSync(url)) {
      const filho = new URL(nome, url);
      if (statSync(filho).isDirectory()) andar(new URL(`${nome}/`, url), `${relativo}${nome}/`);
      else if (/\.(ts|tsx)$/.test(nome)) saida.push(`${pasta}/${relativo}${nome}`);
    }
  };
  andar(raiz, "");
  return saida;
}

test("lista fechada: só \"Tirar do plano\" grava o marcador; \"excluir_cor\" e \"conversao\" ficam reservados no domínio", () => {
  const todos = ["lib", "app", "modules", "components"].flatMap(arquivos).map(path => ({ path, source: limpa(`../${path}`) }));
  const usam = (padrao: RegExp) => todos.filter(file => padrao.test(file.source)).map(file => file.path).sort();
  assert.deepEqual(usam(/tirar_do_plano/), ["lib/minerador/declared-plan-withdraw-core.ts", "lib/minerador/keyword-subject.ts"]);
  assert.deepEqual(usam(/excluir_cor/), ["lib/minerador/keyword-subject.ts"], "a exclusão por cor ainda não existe");
  assert.deepEqual(usam(/["']conversao["']/), ["lib/minerador/keyword-subject.ts"], "a conversão não retira o Assunto da linha-título hoje");
  assert.deepEqual(usam(/keyword_subject_release|KEYWORD_SUBJECT_RELEASE_KEY/), ["lib/minerador/keyword-subject.ts"]);
  assert.deepEqual(usam(/withdrawKeywordSubject\(/), ["lib/minerador/keyword-subject.ts"], "ninguém chama a retirada do Assunto inteiro");
  // "Tirar do plano": as duas escritas que tiram o plano levam o marcador.
  const tirar = limpa("../lib/minerador/declared-plan-withdraw-core.ts");
  const chamadas = tirar.match(/setKeywordSubject\([^;]*plan: null[^;]*\)/g) || [];
  assert.equal(chamadas.length, 2);
  for (const chamada of chamadas) assert.match(chamada, /release/);
  assert.match(tirar, /via: "tirar_do_plano"/);
});

test("escritores de analise_semantica: a tela, a Lógica/aprovação do servidor e o MCP passam pela guarda", () => {
  const tela = limpa("../modules/minerador/minerador-workspace.tsx");
  const escritas = tela.split("\n").filter(linha => /\.update\(\{[^}]*analise_semantica/.test(linha));
  assert.ok(escritas.length >= 6, `escritas da tela: ${escritas.length}`);
  for (const linha of escritas) assert.match(linha, /semanticForKeywordWrite\(/, linha.trim());
  const decisao = limpa("../lib/server/minerador-keyword-decision-core.ts");
  assert.equal((decisao.match(/guardKeywordSemanticWrite\(/g) || []).length, 2, "Lógica e aprovação");
  const mcp = limpa("../lib/server/platform-mcp-tools.ts");
  assert.match(mcp, /guardKeywordSemanticWrite\(current\.analise_semantica, update\.semantic\)/);
  assert.match(mcp, /update\(\{ analise_semantica: guarded\.semantic \}\)/);
});

/* ========================== recuperação do histórico (caso real do azul) */

test("recuperação: o Pilar real do azul volta do histórico (título, ordem, papel, keyword); detalhes vazios no formato antigo", () => {
  const linha = recoverSubjectFromHistory({ keywordId: PILAR_REAL, keyword: "internet fibra óptica", semantic: PILAR_PERDIDO, groupId: AZUL_REAL });
  assert.ok(linha);
  assert.equal(linha?.title, "Internet fibra óptica ou internet comum: qual a diferença e qual escolher?");
  assert.equal(linha?.order, 9);
  assert.equal(linha?.role, "Pilar");
  assert.equal(linha?.details, "", "o histórico antigo não guardava o escopo");
  assert.equal(linha?.lock, "auto");
  assert.deepEqual(linha?.loss, { at: "2026-10-13T05:35:06.847Z", origin: "batch" });
  assert.equal(recoverSubjectFromHistory({ keywordId: PILAR_REAL, keyword: "x", semantic: PILAR_PERDIDO, groupId: "outro-grupo" }), null, "outro grupo");
  // Tirar do plano (plano retirado de propósito) não é recuperado.
  const tirado = setKeywordSubject(cadastrado(), { actorId: ACTOR, changedAt: LATER, origin: "review", plan: null, release: release() });
  assert.ok(tirado.ok);
  assert.equal(recoverSubjectFromHistory({ keywordId: "k-wifi", keyword: "Wi-Fi lento", semantic: tirado.semantic, groupId: AZUL_REAL }), null);
  // Ainda no plano: nada a recuperar.
  assert.equal(recoverSubjectFromHistory({ keywordId: "k-wifi", keyword: "Wi-Fi lento", semantic: cadastrado(), groupId: AZUL_REAL }), null);
});

test("painel: \"Assunto retirado em <data> por <origem>. Restaurar: Cadastrar Assuntos → Silo existente → Azul\"", () => {
  const view = resolveSubjectArticleView({ keywordId: PILAR_REAL, keyword: "internet fibra óptica", semantic: PILAR_PERDIDO, groupOf: () => ({ color: "azul", name: "Wi-Fi e fibra óptica" }) });
  assert.ok(view && view.kind === "orphan_mark");
  if (!view || view.kind !== "orphan_mark") return;
  assert.equal(view.hint, "Assunto retirado em 13/10/2026 05:35 (UTC) por Vínculo em lote. Restaurar: Cadastrar Assuntos → Silo existente → Azul (as linhas já vêm do histórico).");
  assert.equal(view.lostOrigin, "batch");
  assert.equal(subjectRestoreHint({ loss: null, colorLabel: null }), "Assunto retirado desta keyword. Restaurar: Cadastrar Assuntos → Silo existente → a cor do grupo (as linhas já vêm do histórico).");
});

const SILO_AZUL = `Silo 2 — Wi-Fi, fibra óptica e qualidade da internet
Nome: Wi-Fi e fibra óptica
Slug: /wifi-e-fibra/
Objetivo: conquistar tráfego de pessoas que querem entender a tecnologia, melhorar a conexão ou descobrir se precisam trocar de plano.
9. Internet fibra óptica ou internet comum: qual a diferença e qual escolher?
Artigo pilar • Palavra-chave: internet fibra óptica
Explicar tecnologias de acesso, vantagens, limitações e o que observar na contratação.
10. Qual a diferença entre internet e Wi-Fi? Entenda antes de contratar
Palavra-chave: diferença entre internet e Wi-Fi
Esclarecer a diferença entre a conexão da operadora e a rede sem fio dentro de casa.
11. Wi-Fi lento em casa: 10 causas comuns e como melhorar a conexão
Palavra-chave: Wi-Fi lento
Abordar posicionamento do roteador, interferência, aparelhos conectados e testes de velocidade.
12. Quantos Mega de internet precisa para assistir Netflix, YouTube e streaming?
Palavra-chave: internet para streaming
Explicar consumo de banda por qualidade de vídeo e quantidade de telas simultâneas.
13. Qual a melhor internet para jogar online? Velocidade, ping e estabilidade
Palavra-chave: melhor internet para jogos online
Mostrar por que latência, estabilidade e tipo de conexão importam além dos Mega contratados.
14. Internet para home office: qual velocidade e conexão são ideais?
Palavra-chave: internet para home office
Abordar videochamadas, upload, estabilidade e uso simultâneo da rede pela família.
15. Teste de velocidade da internet: como saber se você recebe o que contratou?
Palavra-chave: teste de velocidade da internet
Ensinar a testar a conexão, interpretar download, upload e ping e identificar possíveis problemas.`;

const AZUL = "22222222-3333-4444-8555-666666666666";

function marcaComAzul(): PlanFakeDb {
  return new PlanFakeDb({
    editorial_groups: [
      { id: AZUL, marca_id: BRAND, name: "azul", color: "azul", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT, created_at: AT },
    ],
    editorial_group_events: [],
    editorial_group_articles: [],
    brand_site_catalog_entries: [],
    minerador_keywords: [],
  });
}

/** Reproduz a perda real: histórico no formato antigo (sem escopo) + a linha "Assunto: Não" do lote; a marca de principal fica. */
function perderComoNoAzul(db: PlanFakeDb, groupId: string) {
  for (const row of db.tables.minerador_keywords) {
    const semantic = row.analise_semantica as Record<string, unknown>;
    const plano = resolveKeywordSubject(semantic).plan;
    if (!plano || plano.groupId !== groupId) continue;
    const historico = (semantic.keyword_subject_history as Array<Record<string, unknown>>).map(linha => {
      if (!linha.plan) return linha;
      const { scope: _scope, ...semEscopo } = linha.plan as Record<string, unknown>;
      return { ...linha, plan: semEscopo };
    });
    historico.push({ previous: "declared", next: "none", note: null, destinationUrl: null, actorId: ACTOR, changedAt: "2026-10-13T05:35:06.847Z", origin: "batch" });
    row.analise_semantica = { ...semantic, keyword_subject: null, keyword_subject_origin: "batch", keyword_subject_at: "2026-10-13T05:35:06.847Z", keyword_subject_history: historico };
  }
}

test("card \"Silo existente → Azul\": as 7 linhas vêm RECUPERADAS do histórico; colar o plano completa os detalhes; Cadastrar pelo MESMO núcleo restaura sem linha nova", async () => {
  const db = marcaComAzul();
  const cadastro = await importDeclaredPlanWithCore({
    brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "apply", text: SILO_AZUL,
    group: { mode: "color", color: "azul", name: null }, destination: { kind: "new_silo" }, importRequestId: "aa000000-1111-4222-8333-444455556666", now: AT,
  });
  assert.ok(cadastro.ok && cadastro.mode === "apply", JSON.stringify(cadastro));
  if (!cadastro.ok || cadastro.mode !== "apply") return;
  const groupId = cadastro.groupId;
  const keywordsAntes = db.tables.minerador_keywords.length;
  assert.equal(keywordsAntes, 7);

  perderComoNoAzul(db, groupId);
  for (const row of db.tables.minerador_keywords) {
    assert.equal(resolveKeywordSubject(row.analise_semantica as Row).declared, false);
    assert.ok(resolveDeclaredPrincipal(row.analise_semantica as Row).mark, "a marca de principal continua (como no banco)");
  }

  const antes = JSON.stringify(db.tables);
  const lido = await readDeclaredPlanCardRows({ brandId: BRAND, keywordsClient: db, groupsClient: db, groupId });
  assert.ok(lido.ok);
  if (!lido.ok) return;
  assert.equal(JSON.stringify(db.tables), antes, "ler não grava nada");
  assert.equal(lido.rows.length, 7);
  assert.deepEqual(lido.rows.map(row => row.order), [9, 10, 11, 12, 13, 14, 15]);
  assert.equal(lido.rows[0].role, "Pilar");
  assert.equal(lido.rows[0].title, "Internet fibra óptica ou internet comum: qual a diferença e qual escolher?");
  assert.equal(lido.rows[0].keyword, "internet fibra óptica");
  for (const row of lido.rows) {
    assert.equal(row.recovered?.label, SUBJECT_RECOVERED_LABEL);
    assert.equal(row.recovered?.lostOrigin, "batch");
    assert.equal(row.details, "", "o formato antigo não tinha o escopo");
    assert.equal(row.shape, "cadastro");
    assert.equal(row.keywordId, row.subjectKeywordId);
  }

  // O dono cola o plano: casa pela keyword e só preenche o que falta (a mesma regra do card).
  const colado = parseDeclaredPlanText(SILO_AZUL).articles;
  const chave = (value: string | null) => (value || "").trim().toLocaleLowerCase("pt-BR");
  const linhas = lido.rows.map(row => {
    const lida = colado.find(article => chave(article.principal) === chave(row.keyword));
    return { ...row, details: row.details.trim() ? row.details : lida?.scope ?? "" };
  });
  assert.ok(linhas.every(row => row.details), "todos os detalhes preenchidos pelo plano colado");

  const plano = { silo: null, articles: linhas.map(row => ({ order: row.order, subject: row.title, principal: row.keyword, role: row.role, scope: row.details, lock: row.lock })) };
  const previa = await importDeclaredPlanWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "preview", plan: plano, group: { mode: "existing", groupId }, destination: { kind: "existing_silo", groupId }, now: LATER });
  assert.ok(previa.ok && previa.mode === "preview", JSON.stringify(previa));
  if (!previa.ok || previa.mode !== "preview") return;
  assert.deepEqual(previa.blockers, []);
  assert.equal(previa.canApply, true);

  const aplicado = await importDeclaredPlanWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "apply", plan: plano, group: { mode: "existing", groupId }, destination: { kind: "existing_silo", groupId }, importRequestId: "bb000000-1111-4222-8333-444455556666", now: LATER });
  assert.ok(aplicado.ok && aplicado.mode === "apply", JSON.stringify(aplicado));
  assert.equal(db.tables.minerador_keywords.length, keywordsAntes, "nenhuma linha nova");
  for (const row of db.tables.minerador_keywords) {
    const assunto = resolveKeywordSubject(row.analise_semantica as Row);
    assert.equal(assunto.declared, true, String(row.keyword));
    assert.equal(assunto.plan?.groupId, groupId);
    assert.equal(assunto.plan?.declaredPrincipal?.keywordId, row.id, "o Assunto mora na própria keyword");
    assert.ok(assunto.entry?.title);
  }
  const relido = await readDeclaredPlanCardRows({ brandId: BRAND, keywordsClient: db, groupsClient: db, groupId });
  assert.ok(relido.ok && relido.rows.length === 7 && relido.rows.every(row => !row.recovered), "depois de restaurado, as linhas são as gravadas");
});

test("card (estrutural): selo \"Recuperado do histórico\", linha recuperada entra como nova e o colar só completa o que falta", () => {
  const card = limpa("../modules/minerador/subject-cadastro-card.tsx");
  assert.match(card, /stored: !row\.recovered/);
  assert.match(card, /recovered: row\.recovered\?\.label \?\? null/);
  assert.match(card, /data-subject-cadastro-recuperada/);
  assert.match(card, /details: recuperada\.details\.trim\(\) \? recuperada\.details : lida\.details/);
  assert.match(card, /title: recuperada\.title\.trim\(\) \? recuperada\.title : lida\.title/);
});
