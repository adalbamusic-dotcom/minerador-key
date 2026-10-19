import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  KEYWORD_SUBJECT_HISTORY_KEY,
  KEYWORD_SUBJECT_KEY,
  KEYWORD_SUBJECT_LABEL,
  KEYWORD_SUBJECT_NOTE_MAX,
  isKeywordSubjectActorId,
  keywordSubjectLabel,
  normalizeKeywordSubjectNote,
  resolveKeywordSubject,
  setKeywordSubject,
  type DestinationCheck,
} from "../lib/minerador/keyword-subject.ts";
import {
  SUBJECT_DESTINATION_NO_BRAND_SITE_NOTICE,
  SUBJECT_DESTINATION_OUT_OF_CATALOG_NOTICE,
  subjectDestinationCatalogKey,
  validateSubjectDestination,
} from "../lib/minerador/subject-destination.ts";

/**
 * ASSUNTO — domínio da declaração e da página de destino (SDD 2026-09-24,
 * F1.1, F1.2, F1.5 e F1.10). Fixtures puras; nenhuma rede, nenhum provider.
 */

const ACTOR = "3f0c9a52-8b1e-4c7d-9f2a-5e6b7c8d9e0f";
const OTHER_ACTOR = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const AT = "2026-09-24T12:00:00+00:00";
const LATER = "2026-09-24T13:00:00+00:00";
/** 2026-10-13 (ajuste declarado, "o Assunto nunca se perde"): retirar exige o marcador de liberação. */
const SITE = "https://www.clinicaexemplo.com.br";

function check(overrides: Partial<DestinationCheck> = {}): DestinationCheck {
  return { hostMatchesBrand: true, catalogPageType: "service", catalogTitle: "SEO para clínicas", checkedAt: AT, ...overrides };
}

test("declarar grava as cinco chaves, com ator, instante, origem e histórico", () => {
  const base = { dna_origem: "logico_deterministico", keyword_page_type: "service_page" };
  const result = setKeywordSubject(base, {
    note: "  Nosso serviço de SEO para donos de clínica  ",
    destinationUrl: `${SITE}/seo-para-clinicas`,
    destinationCheck: check(),
    actorId: ACTOR,
    changedAt: AT,
    origin: "review",
  });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.deepEqual(result.semantic[KEYWORD_SUBJECT_KEY], {
    declared: true,
    note: "Nosso serviço de SEO para donos de clínica",
    destinationUrl: `${SITE}/seo-para-clinicas`,
    destinationCheck: check(),
  });
  assert.equal(result.semantic.keyword_subject_actor, ACTOR);
  assert.equal(result.semantic.keyword_subject_at, AT);
  assert.equal(result.semantic.keyword_subject_origin, "review");
  assert.deepEqual(result.semantic[KEYWORD_SUBJECT_HISTORY_KEY], [{
    previous: "none", next: "declared", note: "Nosso serviço de SEO para donos de clínica",
    destinationUrl: `${SITE}/seo-para-clinicas`, actorId: ACTOR, changedAt: AT, origin: "review",
  }]);
  // O resto do DNA fica intacto, inclusive o tipo de página (P2).
  assert.equal(result.semantic.dna_origem, "logico_deterministico");
  assert.equal(result.semantic.keyword_page_type, "service_page");
  // Nada é mutado na entrada.
  assert.equal(KEYWORD_SUBJECT_KEY in base, false);

  const resolved = resolveKeywordSubject(result.semantic);
  assert.equal(resolved.declared, true);
  assert.equal(resolved.noteMissing, false);
  assert.equal(resolved.actorId, ACTOR);
  assert.equal(resolved.origin, "review");
  assert.equal(keywordSubjectLabel(resolved), KEYWORD_SUBJECT_LABEL);
  assert.equal(KEYWORD_SUBJECT_LABEL, "Assunto · declarado");
});

test("idempotência: mesma nota e mesmo destino não regravam, nem com nova conferência do catálogo", () => {
  const first = setKeywordSubject({}, { note: "Para clínicas", actorId: ACTOR, changedAt: AT, origin: "import" });
  assert.ok(first.ok && first.changed);
  const again = setKeywordSubject(first.semantic, { note: "Para clínicas", actorId: OTHER_ACTOR, changedAt: LATER, origin: "batch" });
  assert.equal(again.ok, true);
  assert.equal(again.changed, false);
  assert.deepEqual(again.semantic, first.semantic);

  const withDestination = setKeywordSubject(first.semantic, { note: "Para clínicas", destinationUrl: `${SITE}/seo`, destinationCheck: check(), actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.ok(withDestination.ok && withDestination.changed);
  const recheck = setKeywordSubject(withDestination.semantic, { note: "Para clínicas", destinationUrl: `${SITE}/seo`, destinationCheck: check({ checkedAt: LATER, catalogTitle: null }), actorId: ACTOR, changedAt: LATER, origin: "review" });
  assert.equal(recheck.changed, false, "reconferir o catálogo não é mudança");
});

/*
 * 2026-10-16 · F1 da linha única do Minerador (D4): a retirada do Assunto
 * inteiro (`withdrawKeywordSubject`, sem chamador desde 2026-10-13) saiu; os
 * passos e o teste que só a testavam saíram junto. O histórico continua
 * append-only pelas regravações; tirar o plano é com o marcador
 * (`tests/minerador-assunto-nunca-se-perde.test.mts`).
 */
test("histórico append-only: trocar a nota e regravar só acrescentam", () => {
  const a = setKeywordSubject({}, { note: "v1", actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.ok(a.ok);
  const b = setKeywordSubject(a.semantic, { note: "v2", actorId: ACTOR, changedAt: LATER, origin: "review" });
  assert.ok(b.ok && b.changed);
  const d = setKeywordSubject(b.semantic, { note: null, actorId: ACTOR, changedAt: LATER, origin: "batch" });
  assert.ok(d.ok && d.changed);

  const history = d.semantic[KEYWORD_SUBJECT_HISTORY_KEY] as Array<Record<string, unknown>>;
  assert.deepEqual(history.map(entry => [entry.previous, entry.next, entry.note, entry.origin]), [
    ["none", "declared", "v1", "review"],
    ["declared", "declared", "v2", "review"],
    ["declared", "declared", null, "batch"],
  ]);
  // Cada passo preserva as entradas anteriores tal como estavam.
  assert.deepEqual((d.semantic[KEYWORD_SUBJECT_HISTORY_KEY] as unknown[]).slice(0, 2), (b.semantic[KEYWORD_SUBJECT_HISTORY_KEY] as unknown[]));
});

test("keyword_subject: null gravado antes (dado antigo) é lido como sem Assunto", () => {
  const antigo = { [KEYWORD_SUBJECT_KEY]: null, nicho: "Estética" };
  assert.equal(resolveKeywordSubject(antigo).declared, false);
  assert.equal(keywordSubjectLabel(resolveKeywordSubject(antigo)), null);
});

test("nota: até 280 caracteres, uma linha só; vazia vira null (desde 2026-10-13 o rótulo não cobra mais a nota)", () => {
  const limit = "x".repeat(KEYWORD_SUBJECT_NOTE_MAX);
  assert.equal(KEYWORD_SUBJECT_NOTE_MAX, 280);
  assert.deepEqual(normalizeKeywordSubjectNote(limit), { ok: true, note: limit });
  const tooLong = setKeywordSubject({}, { note: `${limit}y`, actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.equal(tooLong.ok, false);
  assert.equal(!tooLong.ok && tooLong.code, "NOTE_TOO_LONG");
  assert.equal(tooLong.changed, false);
  assert.deepEqual(tooLong.semantic, {});

  for (const breaking of ["linha 1\nlinha 2", "linha 1\r\nlinha 2", `a${String.fromCharCode(0x2028)}b`]) {
    const result = setKeywordSubject({}, { note: breaking, actorId: ACTOR, changedAt: AT, origin: "review" });
    assert.equal(!result.ok && result.code, "NOTE_MULTILINE", JSON.stringify(breaking));
  }

  const blank = setKeywordSubject({}, { note: "   ", actorId: ACTOR, changedAt: AT, origin: "batch" });
  assert.ok(blank.ok && blank.changed);
  const resolved = resolveKeywordSubject(blank.semantic);
  assert.equal(resolved.note, null);
  assert.equal(resolved.noteMissing, true);
  assert.equal(keywordSubjectLabel(resolved), KEYWORD_SUBJECT_LABEL, "a nota não é mais editável (o Assunto saiu do Vínculo): nada de 'Assunto sem nota'");
});

test("ator: só auth.users.id; e-mail, local-user e vazio são recusados e nada é gravado", () => {
  for (const actorId of ["", "local-user", "usuario", "dono@clinica.com.br", "  ", "not-a-uuid"]) {
    const declared = setKeywordSubject({}, { note: "x", actorId, changedAt: AT, origin: "review" });
    assert.equal(declared.ok, false, actorId);
    assert.equal(!declared.ok && declared.code, "ACTOR_REQUIRED");
    assert.deepEqual(declared.semantic, {});
  }
  assert.equal(isKeywordSubjectActorId(ACTOR), true);
  assert.equal(isKeywordSubjectActorId(undefined), false);

  // Sessão com e-mail e id: o id é o ator; o e-mail nunca chega ao registro.
  const session = { user: { email: "dono@clinica.com.br", id: ACTOR } };
  const result = setKeywordSubject({}, { note: "x", actorId: session.user.id, changedAt: AT, origin: "review" });
  assert.ok(result.ok);
  assert.doesNotMatch(JSON.stringify(result.semantic), /@|local-user/);
});

test("origem fora de import/review/batch é recusada", () => {
  const result = setKeywordSubject({}, { note: "x", actorId: ACTOR, changedAt: AT, origin: "ai" as never });
  assert.equal(!result.ok && result.code, "ORIGIN_INVALID");
});

test("destino sem conferência no domínio da marca não é gravado", () => {
  const unchecked = setKeywordSubject({}, { note: "x", destinationUrl: `${SITE}/seo`, actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.equal(!unchecked.ok && unchecked.code, "DESTINATION_UNCHECKED");
  const foreign = setKeywordSubject({}, { note: "x", destinationUrl: "https://outro.com/seo", destinationCheck: check({ hostMatchesBrand: false }), actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.equal(!foreign.ok && foreign.code, "DESTINATION_UNCHECKED");
});

test("leitura defensiva: valor malformado não vira declaração", () => {
  for (const value of [true, "sim", { declared: "true" }, { note: "x" }, [], null]) {
    assert.equal(resolveKeywordSubject({ [KEYWORD_SUBJECT_KEY]: value }).declared, false, JSON.stringify(value));
  }
  assert.equal(resolveKeywordSubject(null).declared, false);
  assert.equal(resolveKeywordSubject(undefined).declared, false);
});

/* ------------------------------ página de destino ----------------------------- */

test("destino: https no host da marca é aceito, com www/apex equivalentes e URL preservada", () => {
  for (const raw of [`${SITE}/seo-para-clinicas`, "https://clinicaexemplo.com.br/seo-para-clinicas/", "https://CLINICAEXEMPLO.com.br/servicos?x=1"]) {
    const result = validateSubjectDestination({ rawUrl: `  ${raw}  `, brandSiteUrl: SITE, checkedAt: AT, catalog: { pageType: "service", title: " SEO para clínicas " } });
    assert.equal(result.ok, true, raw);
    assert.equal(result.ok && result.code, "ACCEPTED");
    assert.equal(result.ok && result.destinationUrl, raw, "a URL observada nunca é reescrita");
    assert.deepEqual(result.ok && result.destinationCheck, { hostMatchesBrand: true, catalogPageType: "service", catalogTitle: "SEO para clínicas", checkedAt: AT });
    assert.equal(result.ok && result.notice, null);
  }
});

test("destino: fora do domínio, http, sem protocolo ou inválido é recusado com motivo", () => {
  const cases: Array<[string, string]> = [
    ["https://outrodominio.com.br/seo", "OUTSIDE_BRAND_SITE"],
    ["https://blog.clinicaexemplo.com.br/seo", "OUTSIDE_BRAND_SITE"],
    ["https://clinicaexemplo.com.br.golpe.com/seo", "OUTSIDE_BRAND_SITE"],
    ["http://clinicaexemplo.com.br/seo", "NOT_HTTPS"],
    ["clinicaexemplo.com.br/seo", "INVALID_URL"],
    ["https://user:senha@clinicaexemplo.com.br/seo", "INVALID_URL"],
    ["javascript:alert(1)", "INVALID_URL"],
  ];
  for (const [raw, code] of cases) {
    const result = validateSubjectDestination({ rawUrl: raw, brandSiteUrl: SITE, checkedAt: AT });
    assert.equal(result.ok, false, raw);
    assert.equal(!result.ok && result.code, code, raw);
    assert.ok(!result.ok && result.reason.length > 0);
  }
});

test("destino: vazio é aceito sem destino; marca sem site aceita o Assunto sem destino e diz por quê", () => {
  const empty = validateSubjectDestination({ rawUrl: "  ", brandSiteUrl: SITE, checkedAt: AT });
  assert.deepEqual(empty, { ok: true, code: "EMPTY", destinationUrl: null, destinationCheck: null, notice: null });

  for (const brandSiteUrl of [null, undefined, "", "não é url ::"]) {
    const noSite = validateSubjectDestination({ rawUrl: `${SITE}/seo`, brandSiteUrl, checkedAt: AT });
    assert.equal(noSite.ok, true);
    assert.equal(noSite.ok && noSite.code, "NO_BRAND_SITE");
    assert.equal(noSite.ok && noSite.destinationUrl, null);
    assert.equal(noSite.ok && noSite.notice, SUBJECT_DESTINATION_NO_BRAND_SITE_NOTICE);
  }
});

test("destino: fora do catálogo é informativo e não bloqueia", () => {
  const result = validateSubjectDestination({ rawUrl: `${SITE}/landing-nova`, brandSiteUrl: SITE, checkedAt: AT, catalog: null });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.destinationCheck, { hostMatchesBrand: true, catalogPageType: null, catalogTitle: null, checkedAt: AT });
  assert.equal(result.ok && result.notice, SUBJECT_DESTINATION_OUT_OF_CATALOG_NOTICE);

  // A saída da validação é exatamente o que setKeywordSubject aceita.
  const declared = setKeywordSubject({}, {
    note: null,
    destinationUrl: result.ok ? result.destinationUrl : null,
    destinationCheck: result.ok ? result.destinationCheck : null,
    actorId: ACTOR,
    changedAt: AT,
    origin: "review",
  });
  assert.ok(declared.ok && declared.changed);
});

test("chave do catálogo: identidade editorial da marca; outro host ou marca sem site não buscam", () => {
  assert.equal(subjectDestinationCatalogKey(SITE, "https://clinicaexemplo.com.br/seo/"), "www.clinicaexemplo.com.br/seo");
  assert.equal(subjectDestinationCatalogKey(SITE, "https://outro.com/seo"), null);
  assert.equal(subjectDestinationCatalogKey(null, `${SITE}/seo`), null);
  assert.equal(subjectDestinationCatalogKey(SITE, ""), null);
});

/* ------------------------------ P4: só o humano ------------------------------ */

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Lista FECHADA de quem pode chamar cada porta de gravação do Assunto (F1.10).
 * Um chamador novo exige mudar este teste de propósito.
 */
const SUBJECT_WRITE_CALLERS: Record<string, readonly string[]> = {
  // 2026-10-12 (SDD do plano declarado §6.1-2): o núcleo do plano do Silo grava
  // `keyword_subject.plan` no Assunto declarado e declara pelo núcleo de sempre.
  // 2026-10-12 (SDD do plano §6.1-5, "Tirar do plano"): o núcleo da retirada
  // tira `keyword_subject.plan` (o Assunto continua declarado); só a rota da tela o chama.
  // 2026-10-13 (pedido do dono): o Vínculo — Revisão Humana, lote e MCP — não
  // declara nem retira Assunto; vinculo-batch.ts e a tela saíram da lista.
  setKeywordSubject: ["lib/minerador/keyword-import-core.ts", "lib/minerador/declared-plan-import-core.ts", "lib/minerador/declared-plan-withdraw-core.ts"],
  // 2026-10-16 (F1 da linha única, D4): a função saiu; a entrada vazia guarda que nenhum chamador volte.
  withdrawKeywordSubject: [],
  // 2026-09-24 (pedido do dono): o seletor Vínculo único grava as três
  // escolhas de uma vez por planVinculoBatchChoices, que chama o
  // planVinculoBatch passo a passo no próprio arquivo; a tela só chama o novo.
  planVinculoBatch: [],
  // 2026-09-26 (SDD da plataforma para agentes §5.1 e adendo da decisão
  // delegada): o MCP declara Assunto e decide o Vínculo SÓ com o aceite do
  // usuário no chat. O teste P4b abaixo prova a guarda antes de cada chamada.
  planVinculoBatchChoices: ["modules/minerador/minerador-workspace.tsx", "lib/server/platform-mcp-tools.ts"],
  // 2026-10-13 (SDD do cadastro único §3.1): a rota do Processador e a ferramenta
  // declare_subjects saíram; só o núcleo do cadastro declara o Assunto (dentro da keyword).
  importSubjectsWithCore: ["lib/minerador/declared-plan-import-core.ts"],
  // 2026-10-12 (F4): o plano do Silo tem um núcleo só — a rota da tela e a
  // ferramenta MCP `declare_silo_plan` (com a guarda do aceite, P4b).
  // 2026-10-13 (SDD da conversão do formato anterior): a conversão passa pelo MESMO núcleo do cadastro.
  // 2026-10-18 (SDD do Assunto pela principal §6.2-b, F4): o "Aprovar e enviar" grava o Assunto do volume 0 pelo MESMO núcleo (destino "Keyword (sem Silo)").
  importDeclaredPlanWithCore: ["app/api/minerador/marcas/[brandId]/plans/import/route.ts", "lib/minerador/subject-conversion-core.ts", "lib/server/minerador-approve-and-send.ts", "lib/server/platform-mcp-tools.ts"],
  // 2026-10-13: converter tem a rota da tela e a ferramenta MCP `convert_legacy_subjects` (com a guarda do aceite).
  convertLegacySubjectsWithCore: ["app/api/minerador/marcas/[brandId]/plans/convert/route.ts", "lib/server/platform-mcp-tools.ts"],
  // 2026-10-12: "Tirar do plano" é só da tela (prévia → decisão humana); nenhuma ferramenta MCP.
  // 2026-10-13 (SDD acelerar, item 15 — mudança declarada): "Tirar do plano" numa confirmação chama o
  // MESMO núcleo pelas dependências da mesma rota da tela (`chain`); continua sem ferramenta MCP.
  withdrawFromDeclaredPlanWithCore: ["app/api/minerador/marcas/[brandId]/plans/withdraw/route.ts", "lib/server/declared-plan-withdraw-chain-runtime.ts"],
};

/** Chamador de IA autorizado — isento da regex de "caminho de IA", e só ele. */
const MCP_ACEITE_CALLER = "lib/server/platform-mcp-tools.ts";

const SUBJECT_WRITE_DEFINED_IN: Record<string, string> = {
  setKeywordSubject: "lib/minerador/keyword-subject.ts",
  withdrawKeywordSubject: "lib/minerador/keyword-subject.ts",
  planVinculoBatch: "lib/minerador/vinculo-batch.ts",
  planVinculoBatchChoices: "lib/minerador/vinculo-batch.ts",
  importSubjectsWithCore: "lib/minerador/keyword-import-core.ts",
  importDeclaredPlanWithCore: "lib/minerador/declared-plan-import-core.ts",
  convertLegacySubjectsWithCore: "lib/minerador/subject-conversion-core.ts",
  withdrawFromDeclaredPlanWithCore: "lib/minerador/declared-plan-withdraw-core.ts",
};

test("P4: a gravação do Assunto só tem os chamadores da lista fechada — nenhum caminho de IA ou MCP", () => {
  const files = ["app", "lib", "modules", "components"]
    .flatMap(dir => sourceFiles(join(ROOT, dir)))
    .map(file => ({ path: relative(ROOT, file).split(sep).join("/"), source: stripComments(readFileSync(file, "utf8")) }));

  for (const [writer, allowed] of Object.entries(SUBJECT_WRITE_CALLERS)) {
    const pattern = new RegExp(`\\b${writer}\\s*\\(`);
    const callers = files
      .filter(file => file.path !== SUBJECT_WRITE_DEFINED_IN[writer] && pattern.test(file.source))
      .map(file => file.path)
      .sort();
    assert.deepEqual(callers, [...allowed].sort(), `${writer}: chamadores fora da lista fechada`);
  }

  const aiProvider = /from ["'][^"']*(openai|anthropic|@ai-sdk|gemini|deepseek|ai-provider)[^"']*["']/i;
  const allowedCallers = new Set(Object.values(SUBJECT_WRITE_CALLERS).flat());
  for (const path of allowedCallers) {
    if (path === MCP_ACEITE_CALLER) continue;
    assert.doesNotMatch(path, /mcp|\/ai[-/.]|-ai\.|openai|anthropic|gemini|deepseek|llm|radar|redator|arquiteto/i, `${path} parece caminho de IA`);
    const source = files.find(file => file.path === path)?.source ?? "";
    assert.doesNotMatch(source, aiProvider, `${path} importa provider de IA e grava Assunto`);
  }
  // Nenhuma rota de MCP menciona a gravação, nem por nome.
  for (const file of files) {
    if (!file.path.startsWith("app/api/") || !/mcp/i.test(file.path)) continue;
    assert.doesNotMatch(file.source, /keyword_subject|setKeywordSubject|withdrawKeywordSubject|importSubjectsWithCore|planVinculoBatch/, file.path);
  }
});

test("P4b: o MCP só grava Assunto/Vínculo depois da guarda do aceite humano", () => {
  const source = stripComments(readFileSync(join(ROOT, MCP_ACEITE_CALLER), "utf8"));

  // 2026-10-13: declare_subjects saiu (o Assunto solto); o MCP não chama mais o import de Assuntos direto.
  assert.equal(source.indexOf('registerTool("declare_subjects"'), -1);
  assert.doesNotMatch(source, /importSubjectsWithCore\(/);

  // declare_silo_plan (F4): aceite e importRequestId antes do núcleo do plano.
  const planoInicio = source.indexOf('registerTool("declare_silo_plan"');
  assert.ok(planoInicio > 0, "a ferramenta do plano do Silo existe");
  const plano = source.slice(planoInicio, source.indexOf("importDeclaredPlanWithCore(", planoInicio));
  assert.match(plano, /mode === "apply" && !userConfirmation[\s\S]*human_confirmation_required/);
  assert.match(plano, /mode === "apply" && !importRequestId[\s\S]*import_request_required/);

  // set_keyword_vinculo: aceite + hash antes; a aplicação só depois de conferir o hash da prévia.
  const vinculoInicio = source.indexOf('registerTool("set_keyword_vinculo"');
  const vinculo = source.slice(vinculoInicio, source.indexOf("registerTool(", vinculoInicio + 30));
  const guarda = vinculo.indexOf("!userConfirmation || !decisionHash");
  const conferencia = vinculo.indexOf("decisionHash !== currentDecisionHash");
  const aplicacao = vinculo.indexOf("const planToApply = planVinculoBatchChoices(");
  assert.ok(guarda > 0 && conferencia > guarda && aplicacao > conferencia, "aceite → hash → aplicar, nesta ordem");
  assert.match(vinculo, /"platform\.decide"/, "aplicar exige o escopo opt-in");
  // O posto da principal publicada fica fora (adendo §3; AGENTS.md §11).
  assert.doesNotMatch(vinculo, /kind: z\.literal\("post"\)/);
  // 2026-10-13: o Assunto saiu do Vínculo — subject_declare/subject_withdraw são
  // recusados ANTES de qualquer leitura ou gravação, com a porta única na mensagem.
  const recusa = vinculo.indexOf('if (action.kind === "subject_declare" || action.kind === "subject_withdraw")');
  assert.ok(recusa > 0 && recusa < guarda, "a recusa vem antes da guarda e do núcleo");
  assert.match(vinculo.slice(recusa, guarda), /code: "subject_entry_moved", message: VINCULO_SUBJECT_ENTRY_MOVED_REASON/);
});
