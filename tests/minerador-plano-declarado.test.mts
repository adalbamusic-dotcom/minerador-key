import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DECLARED_PLAN_ARTICLES_MAX,
  cleanDeclaredPhrase,
  declaredPlanLeftoverReason,
  normalizeDeclaredPhraseKey,
  normalizeDeclaredSiloSlug,
  parseDeclaredPlanText,
} from "../lib/minerador/declared-plan.ts";
import { normalizeKeyword } from "../lib/minerador/keyword-import-core.ts";
import { SILO_ARTICLE_RANGE } from "../lib/agent/silo-plan.ts";
import {
  declaredPrincipalReciprocity,
  resolveDeclaredPrincipal,
  resolveKeywordSubject,
  setDeclaredPrincipal,
  setKeywordSubject,
  withdrawKeywordSubject,
} from "../lib/minerador/keyword-subject.ts";
import { importDeclaredPlanWithCore } from "../lib/minerador/declared-plan-import-core.ts";
import { PlanFakeDb, type Row } from "./plano-declarado-fake-db.mts";

/*
 * F4 — IMPORTAR PLANO DO SILO (SDD 2026-10-12 §6.1, §11, D1/D2-bis/D5/D9/D10).
 * O texto abaixo é o que o dono colou para a WifiConecta (fixture real).
 * Sem rede, sem provider: REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const PLANO_DO_DONO = `Silo 1 — Planos de internet, preços e contratação
Nome: Planos e contratação
Slug: /planos-de-internet/
Objetivo: atrair pessoas que já querem contratar internet, mas ainda estão comparando operadoras, valores, velocidades e condições.
1. Como escolher o melhor plano de internet residencial para sua casa?
Artigo pilar • Palavra-chave: melhor plano de internet residencial
Explicar o que comparar antes da contratação: velocidade, preço, cobertura, instalação e quantidade de dispositivos.
2. Internet residencial barata: como encontrar um plano que vale a pena?
Palavra-chave: internet residencial barata
Mostrar como comparar custo-benefício, mensalidade, taxas, fidelidade e condições promocionais.
3. Claro, Vivo ou TIM: qual internet residencial escolher?
Palavra-chave: Claro Vivo ou TIM internet
Ensinar a comparar tecnologias, cobertura e condições de contratação sem declarar uma vencedora universal.
4. Como saber quais operadoras de internet atendem meu CEP?
Palavra-chave: internet disponível no meu CEP
Explicar a diferença entre cobertura na região e disponibilidade efetiva no endereço.
5. Internet de 300, 500, 600 Mega ou 1 Giga: qual velocidade contratar?
Palavra-chave: quantos Mega de internet preciso
Relacionar velocidades a diferentes perfis de uso, sem prometer desempenho garantido.
6. Combo de internet, celular e TV: quando vale a pena contratar?
Palavra-chave: combo internet celular e TV
Avaliar economia, conveniência e possíveis limitações dos pacotes combinados.
7. Internet residencial sem fidelidade: quais são as vantagens e desvantagens?
Palavra-chave: internet residencial sem fidelidade
Explicar permanência mínima, possíveis multas e o que conferir no contrato.
8. Como contratar internet residencial em São Paulo: cobertura, planos e instalação
Palavra-chave: contratar internet residencial em São Paulo
Guia local para quem deseja verificar disponibilidade e entender as etapas da contratação.`;

const ACTOR = "d67ebbad-a590-45f8-8bb5-a19c6241ac1b";
const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const OTHER_BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const G = "a9d5c87b-59aa-4e49-8357-3fa893d4cd2d";
const G_OTHER_BRAND = "11111111-2222-4333-8444-555555555555";
const G_SECOND = "22222222-3333-4444-8555-666666666666";
const AT = "2026-10-12T20:00:00.000Z";

test("parser: o plano colado da WifiConecta vira 8 artigos, Pilar no 1, sem sobra nem recusa", () => {
  const plano = parseDeclaredPlanText(PLANO_DO_DONO);
  assert.deepEqual(plano.refusals, []);
  assert.deepEqual(plano.unparsed, []);
  assert.equal(plano.silo.name, "Planos e contratação");
  assert.equal(plano.silo.heading, "Planos de internet, preços e contratação");
  assert.equal(plano.silo.slug, "planos-de-internet");
  assert.match(plano.silo.objective || "", /^atrair pessoas que já querem contratar internet/);
  assert.equal(plano.articles.length, 8);
  assert.deepEqual(plano.articles.map(article => article.order), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(plano.articles.map(article => article.role), ["Pilar", "Suporte", "Suporte", "Suporte", "Suporte", "Suporte", "Suporte", "Suporte"]);
  assert.equal(plano.articles[0].principal, "melhor plano de internet residencial");
  assert.equal(plano.articles[2].subject, "Claro, Vivo ou TIM: qual internet residencial escolher?");
  assert.equal(plano.articles[2].principal, "Claro Vivo ou TIM internet");
  assert.equal(plano.articles[4].subject, "Internet de 300, 500, 600 Mega ou 1 Giga: qual velocidade contratar?");
  assert.equal(plano.articles[7].principal, "contratar internet residencial em São Paulo");
  assert.equal(plano.articles[7].scope, "Guia local para quem deseja verificar disponibilidade e entender as etapas da contratação.");
  // O nome do Silo e o rótulo nunca viram frase de artigo.
  assert.ok(!plano.articles.some(article => /palavra-chave|planos e contratação/i.test(`${article.subject} ${article.principal}`)));
});

test("parser: variações razoáveis — tabela, numeração com parêntese, 'Pilar' em linha própria, rótulo colado no título", () => {
  const tabela = parseDeclaredPlanText(`Nome: Planos
Slug: planos
| # | Assunto | Keyword principal | Papel | Descrição |
|---|---|---|---|---|
| 1 | Como escolher plano | melhor plano | Pilar | Comparar antes de contratar |
| 2 | Internet barata | internet barata | Suporte | Custo-benefício |
| 3 | Sem fidelidade | sem fidelidade | Suporte | Multas |
| 4 | Combo | combo internet | Suporte | Pacotes |`);
  assert.deepEqual(tabela.refusals, []);
  assert.equal(tabela.articles.length, 4);
  assert.equal(tabela.articles[0].role, "Pilar");
  assert.equal(tabela.articles[3].principal, "combo internet");

  const lista = parseDeclaredPlanText(`Silo 2 — Velocidade
1) Assunto: Quantos mega preciso?
Pilar
Palavra-chave: "quantos mega preciso".
Explicar perfis de uso.
Com a segunda linha da descrição.
Artigo 2: Fibra ou rádio?
Principal: fibra ou rádio
Comparar tecnologias.
3 - Teste de velocidade
Keyword: teste de velocidade
Como medir.
4. Wi-Fi em casa
Palavra-chave: wifi em casa
Cobertura.`);
  assert.deepEqual(lista.refusals, []);
  assert.equal(lista.silo.name, "Velocidade");
  assert.equal(lista.articles[0].subject, "Quantos mega preciso?");
  assert.equal(lista.articles[0].principal, "quantos mega preciso");
  assert.equal(lista.articles[0].role, "Pilar");
  assert.equal(lista.articles[0].scope, "Explicar perfis de uso. Com a segunda linha da descrição.");
  assert.equal(lista.articles[1].order, 2);
  assert.equal(lista.articles[1].principal, "fibra ou rádio");
  assert.equal(lista.articles[2].order, 3);
});

test("parser: o que não entende vai para a prévia, sem adivinhar; e as recusas do plano", () => {
  const solto = parseDeclaredPlanText(`Nome: X
uma linha solta antes dos artigos
1. A
Artigo pilar • Palavra-chave: a
Escopo A.
2. B
Palavra-chave: b
Palavra-chave: b2
Escopo B.`);
  assert.equal(solto.unparsed.length, 2);
  assert.match(solto.unparsed[0].reason, /antes do primeiro artigo/);
  assert.equal(solto.unparsed[0].line, 2);
  assert.match(solto.unparsed[1].reason, /já tem a principal/);

  const codes = (texto: string) => parseDeclaredPlanText(texto).refusals.map(refusal => refusal.code);
  assert.ok(codes("Nome: X\n1. A\nPalavra-chave: a\nEscopo.").includes("PILLAR_MISSING"));
  assert.ok(codes("Nome: X\n1. A\nArtigo pilar • Palavra-chave: a\nE.\n2. B\nArtigo pilar • Palavra-chave: b\nE.").includes("PILLAR_REPEATED"));
  assert.ok(codes("Nome: X\n1. A\nArtigo pilar • Palavra-chave: a\nE.\n1. B\nPalavra-chave: b\nE.").includes("ORDER_REPEATED"));
  assert.ok(codes("Nome: X\n1. A\nArtigo pilar • Palavra-chave: mesma\nE.\n2. B\nPalavra-chave: Mesma\nE.").includes("PRINCIPAL_REPEATED"));
  assert.ok(codes("Nome: X\nSlug: https://site.com/x\n1. A\nArtigo pilar • Palavra-chave: a\nE.").includes("SILO_SLUG_INVALID"));
  assert.ok(codes("1. A\nArtigo pilar • Palavra-chave: a\nE.").includes("SILO_NAME_MISSING"), "sem nome nem cabeçalho");
  assert.ok(codes("Nome: X\n1. A\nArtigo pilar • Palavra-chave: a").includes("SCOPE_MISSING"));
  assert.ok(codes(`Nome: X\n1. A\nArtigo pilar • Palavra-chave: a\n${"x".repeat(1201)}`).includes("SCOPE_TOO_LONG"));
  const trinta1 = ["Nome: X", ...Array.from({ length: 31 }, (_, index) => `${index + 1}. Artigo ${index + 1}\n${index === 0 ? "Artigo pilar • " : ""}Palavra-chave: k${index + 1}\nEscopo ${index + 1}.`)].join("\n");
  assert.ok(codes(trinta1).includes("TOO_MANY_ARTICLES"));
  assert.ok(!codes(trinta1.split("\n31. ")[0]).includes("TOO_MANY_ARTICLES"), "30 artigos é tamanho normal (D3)");
});

test("limpeza de rótulos, slug do Silo e o mesmo teto de 30 do Silo (D3)", () => {
  assert.equal(cleanDeclaredPhrase("Palavra-chave: internet disponível no meu CEP"), "internet disponível no meu CEP");
  assert.equal(cleanDeclaredPhrase("“combo internet celular e TV”."), "combo internet celular e TV");
  assert.equal(normalizeDeclaredSiloSlug("/planos-de-internet/"), "planos-de-internet");
  assert.equal(normalizeDeclaredSiloSlug("Planos e Contratação"), "planos-e-contratacao");
  assert.equal(normalizeDeclaredSiloSlug("https://site.com/x"), null);
  assert.equal(DECLARED_PLAN_ARTICLES_MAX, SILO_ARTICLE_RANGE.max);
  for (const frase of ["Claro, Vivo ou TIM: qual internet?", "internet disponível no meu CEP", "  Combo   de internet ", "São Paulo"]) {
    assert.equal(normalizeDeclaredPhraseKey(frase), normalizeKeyword(frase));
  }
});

test("sobras de import: o nome do Silo e a frase com o rótulo não fazem parte do plano (D9)", () => {
  const plano = parseDeclaredPlanText(PLANO_DO_DONO);
  assert.equal(declaredPlanLeftoverReason("Planos e contratação", plano), "silo_name");
  assert.equal(declaredPlanLeftoverReason("Palavra-chave: internet disponível no meu CEP", plano), "pasted_label");
  assert.equal(declaredPlanLeftoverReason("planos de internet", plano), null);
});

const plan = (overrides: Record<string, unknown> = {}) => ({ groupId: G, planVersion: 1, order: 3, role: "Suporte" as const, scope: "Ensinar a comparar.", declaredPrincipal: { keywordId: "p3", phrase: "Claro Vivo ou TIM internet" }, ...overrides });

test("Assunto: o plano grava aditivo, preserva o plano quando outro writer não o passa, e recusa plano inválido", () => {
  const declarado = setKeywordSubject({}, { note: null, actorId: ACTOR, changedAt: AT, origin: "import" });
  assert.ok(declarado.ok);
  assert.equal(resolveKeywordSubject(declarado.semantic).plan, null);
  const comPlano = setKeywordSubject(declarado.semantic, { note: null, actorId: ACTOR, changedAt: AT, origin: "import", plan: plan() });
  assert.ok(comPlano.ok && comPlano.changed);
  assert.equal(resolveKeywordSubject(comPlano.semantic).plan?.order, 3);
  // Repetir o mesmo plano não regrava.
  const igual = setKeywordSubject(comPlano.semantic, { note: null, actorId: ACTOR, changedAt: AT, origin: "import", plan: plan() });
  assert.ok(igual.ok && !igual.changed);
  // A Revisão Humana troca a nota sem conhecer o plano: o plano fica.
  const nota = setKeywordSubject(comPlano.semantic, { note: "para quem compara", actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.ok(nota.ok && nota.changed);
  assert.equal(resolveKeywordSubject(nota.semantic).plan?.declaredPrincipal?.keywordId, "p3");
  const invalido = setKeywordSubject(declarado.semantic, { actorId: ACTOR, changedAt: AT, origin: "import", plan: plan({ scope: "duas\nlinhas" }) });
  assert.equal(invalido.ok, false);
  const longo = setKeywordSubject(declarado.semantic, { actorId: ACTOR, changedAt: AT, origin: "import", plan: plan({ order: 31 }) });
  assert.equal(longo.ok, false);
  // Plano malformado no banco não vira plano nem derruba a leitura do Assunto.
  const torto = { ...declarado.semantic, keyword_subject: { ...(declarado.semantic.keyword_subject as Row), plan: { order: "x" } } };
  assert.equal(resolveKeywordSubject(torto).declared, true);
  assert.equal(resolveKeywordSubject(torto).plan, null);
  // Retirar o Assunto retira o plano junto (o histórico fica).
  const retirado = withdrawKeywordSubject(comPlano.semantic, { actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.ok(retirado.ok && retirado.changed);
  assert.equal(resolveKeywordSubject(retirado.semantic).plan, null);
});

test("principal declarada: marca recíproca, idempotente, ator humano e a conferência de reciprocidade", () => {
  const mark = { subjectKeywordId: "s3", groupId: G, planVersion: 1 };
  assert.equal(setDeclaredPrincipal({}, { mark, actorId: "local-user", changedAt: AT }).ok, false);
  const marcada = setDeclaredPrincipal({ dna_origem: "logico_deterministico" }, { mark, actorId: ACTOR, changedAt: AT });
  assert.ok(marcada.ok && marcada.changed);
  assert.deepEqual(resolveDeclaredPrincipal(marcada.semantic).mark, mark);
  assert.ok(!setDeclaredPrincipal(marcada.semantic, { mark, actorId: ACTOR, changedAt: AT }).changed);
  const assunto = setKeywordSubject({}, { actorId: ACTOR, changedAt: AT, origin: "import", plan: plan() });
  assert.ok(assunto.ok);
  assert.deepEqual(declaredPrincipalReciprocity({ subjectKeywordId: "s3", subjectSemantic: assunto.semantic, principalKeywordId: "p3", principalSemantic: marcada.semantic }), { ok: true });
  const outra = setDeclaredPrincipal({}, { mark: { ...mark, subjectKeywordId: "s9" }, actorId: ACTOR, changedAt: AT });
  assert.ok(outra.ok);
  const divergente = declaredPrincipalReciprocity({ subjectKeywordId: "s3", subjectSemantic: assunto.semantic, principalKeywordId: "p3", principalSemantic: outra.semantic });
  assert.equal(divergente.ok, false);
  assert.match(divergente.ok ? "" : divergente.reason, /sem reciprocidade/);
});

/* ---------------------------------------------------- núcleo, com banco falso */

const assuntoSemantic = (note: string | null = null): Row => {
  const result = setKeywordSubject({ dna_origem: "logico_deterministico" }, { note, actorId: ACTOR, changedAt: "2026-10-12T16:00:00.000Z", origin: "import" });
  assert.ok(result.ok);
  return result.semantic;
};

function wifiConecta(): PlanFakeDb {
  const plano = parseDeclaredPlanText(PLANO_DO_DONO);
  const kw = (id: string, keyword: string, extra: Row = {}): Row => ({ id, keyword, brand_id: BRAND, status: "aprovado", group_id: G, deleted_at: null, volume_search: null, results_allintitle: null, analise_semantica: { dna_origem: "logico_deterministico" }, ...extra });
  const subjects = plano.articles.map((article, index) => kw(`00000000-0000-4000-8000-00000000000${index + 1}`, article.subject, { analise_semantica: assuntoSemantic() }));
  const principais = [
    kw("10000000-0000-4000-8000-000000000001", "melhor plano de internet residencial", { volume_search: 260 }),
    kw("10000000-0000-4000-8000-000000000002", "internet residencial barata", { volume_search: 1600 }),
    kw("10000000-0000-4000-8000-000000000003", "Claro Vivo ou TIM internet", { status: "bruto" }),
    kw("10000000-0000-4000-8000-000000000004", "internet disponível no meu cep", { volume_search: 260 }),
    kw("10000000-0000-4000-8000-000000000005", "quantos Mega de internet preciso", { status: "bruto" }),
    kw("10000000-0000-4000-8000-000000000006", "combo internet celular e TV", { volume_search: 20 }),
    kw("10000000-0000-4000-8000-000000000007", "internet residencial sem fidelidade", { volume_search: 170 }),
    kw("10000000-0000-4000-8000-000000000008", "contratar internet residencial em São Paulo", { status: "bruto" }),
  ];
  return new PlanFakeDb({
    editorial_groups: [
      { id: G, marca_id: BRAND, name: "laranja", color: "laranja", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT },
      { id: G_SECOND, marca_id: BRAND, name: "azul", color: "azul", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT },
      { id: G_OTHER_BRAND, marca_id: OTHER_BRAND, name: "outra", color: "verde", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT },
    ],
    editorial_group_events: [],
    editorial_group_articles: [],
    brand_site_catalog_entries: [],
    minerador_keywords: [
      ...subjects,
      ...principais,
      kw("20000000-0000-4000-8000-000000000001", "Planos e contratação", { status: "bruto" }),
      kw("20000000-0000-4000-8000-000000000002", "Palavra-chave: internet disponível no meu CEP", { status: "bruto" }),
      // Sustentação da Pesquisa por Assunto do Assunto 6, ainda sem grupo — e uma em outro grupo (D5).
      kw("30000000-0000-4000-8000-000000000001", "plano vivo controle", { group_id: null, volume_search: 49500, analise_semantica: { subject_discovery: { subjectKeywordIds: [subjects[5].id as string] } } }),
      kw("30000000-0000-4000-8000-000000000002", "combos claro movel", { group_id: G_SECOND, analise_semantica: { subject_discovery: { subjectKeywordIds: [subjects[5].id as string] } } }),
      // Outra marca com a MESMA frase de uma principal: nunca é lida nem tocada.
      { id: "90000000-0000-4000-8000-000000000001", keyword: "Claro Vivo ou TIM internet", brand_id: OTHER_BRAND, status: "bruto", group_id: null, deleted_at: null, analise_semantica: {} },
    ],
  });
}

const core = (db: PlanFakeDb, extra: Partial<Parameters<typeof importDeclaredPlanWithCore>[0]> = {}) => importDeclaredPlanWithCore({
  brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "preview", text: PLANO_DO_DONO,
  group: { mode: "existing", groupId: G }, now: AT, ...extra,
});

test("prévia (WifiConecta): os 8 Assuntos já existem, as 3 principais sem volume aparecem pela D2-bis, as 2 sobras ficam fora", async () => {
  const db = wifiConecta();
  const before = JSON.stringify(db.tables.minerador_keywords);
  const preview = await core(db);
  assert.ok(preview.ok && preview.mode === "preview");
  if (!preview.ok || preview.mode !== "preview") return;
  assert.deepEqual(preview.blockers, []);
  assert.equal(preview.canApply, true);
  assert.ok(preview.articles.every(article => article.subject.state === "existing_subject"));
  const semVolume = preview.articles.filter(article => article.principal.state === "existing_without_volume").map(article => article.order);
  assert.ok([3, 5, 8].every(order => semVolume.includes(order)));
  assert.deepEqual(preview.leftovers.map(item => item.reason).sort(), ["pasted_label", "silo_name"]);
  assert.equal(preview.group.mode, "existing");
  assert.equal(preview.supports.total, 2);
  assert.equal(preview.supports.withoutGroup, 1);
  assert.equal(preview.supports.inOtherGroup, 1);
  assert.ok(preview.approvedToReview > 0, "a prévia diz quantos aprovados voltam a Em revisão (R2)");
  assert.equal(JSON.stringify(db.tables.minerador_keywords), before, "prévia não escreve nada");
});

test("gravar: grupo com plano, plano em cada Assunto, marca recíproca em cada principal, sustentação sem grupo herda; reaplicar não muda nada", async () => {
  const db = wifiConecta();
  const applied = await core(db, { mode: "apply", importRequestId: "6a1c0d2e-1111-4222-8333-444455556666" });
  assert.ok(applied.ok && applied.mode === "apply", JSON.stringify(applied));
  if (!applied.ok || applied.mode !== "apply") return;
  assert.equal(applied.failed, 0);
  assert.equal(applied.reciprocityConfirmed, 8);
  assert.equal(applied.planVersion, 1);
  const grupo = db.tables.editorial_groups.find(row => row.id === G)!;
  assert.equal(grupo.origin, "declared_plan");
  assert.equal((grupo.plan as Row).siloName, "Planos e contratação");
  assert.equal((grupo.plan as Row).siloSlug, "planos-de-internet");
  const linha = (keyword: string) => db.tables.minerador_keywords.find(row => row.keyword === keyword && row.brand_id === BRAND)!;
  const assunto3 = resolveKeywordSubject(linha("Claro, Vivo ou TIM: qual internet residencial escolher?").analise_semantica as Row).plan!;
  assert.equal(assunto3.order, 3);
  assert.equal(assunto3.role, "Suporte");
  assert.equal(assunto3.declaredPrincipal?.keywordId, "10000000-0000-4000-8000-000000000003");
  assert.equal(resolveKeywordSubject(linha("Como escolher o melhor plano de internet residencial para sua casa?").analise_semantica as Row).plan?.role, "Pilar");
  assert.equal(resolveDeclaredPrincipal(linha("Claro Vivo ou TIM internet").analise_semantica as Row).mark?.subjectKeywordId, linha("Claro, Vivo ou TIM: qual internet residencial escolher?").id);
  assert.equal(linha("plano vivo controle").group_id, G, "sustentação sem grupo herda o grupo do plano");
  assert.equal(linha("combos claro movel").group_id, G_SECOND, "a de outro grupo não muda (D5)");
  assert.equal(linha("Planos e contratação").group_id, G, "sobra não é tocada (lixeira é do dono)");
  assert.ok(db.tables.editorial_group_events.some(event => event.event_type === "plan_declared"));
  // A outra marca nunca é tocada.
  const outra = db.tables.minerador_keywords.find(row => row.brand_id === OTHER_BRAND)!;
  assert.deepEqual(outra.analise_semantica, {});
  assert.equal(outra.group_id, null);

  const snapshot = JSON.stringify(db.tables.minerador_keywords);
  const again = await core(db, { mode: "apply", importRequestId: "7b2d1e3f-1111-4222-8333-444455556666" });
  assert.ok(again.ok && again.mode === "apply");
  if (again.ok && again.mode === "apply") {
    assert.equal(again.planVersion, 1, "mesmo plano = mesma versão");
    assert.ok(again.articles.every(article => article.outcome === "unchanged"));
  }
  assert.equal(JSON.stringify(db.tables.minerador_keywords), snapshot);
});

test("isolamento e recusas: grupo de outra marca, principal igual ao Assunto sem volume, Assunto de outro plano", async () => {
  const db = wifiConecta();
  const outraMarca = await core(db, { group: { mode: "existing", groupId: G_OTHER_BRAND } });
  assert.ok(outraMarca.ok && outraMarca.mode === "preview");
  if (outraMarca.ok && outraMarca.mode === "preview") {
    assert.equal(outraMarca.canApply, false);
    assert.ok(outraMarca.blockers.some(blocker => /não existe nesta marca/.test(blocker)));
  }
  const igual = await core(db, { text: "Nome: X\n1. Claro, Vivo ou TIM: qual internet residencial escolher?\nArtigo pilar • Palavra-chave: Claro, Vivo ou TIM: qual internet residencial escolher?\nEscopo." });
  assert.ok(igual.ok && igual.mode === "preview");
  if (igual.ok && igual.mode === "preview") {
    assert.equal(igual.articles[0].principal.state, "same_as_subject_without_volume");
    assert.equal(igual.canApply, false);
  }
  const bloqueado = await core(db, { mode: "apply", importRequestId: "8c3e2f40-1111-4222-8333-444455556666", text: "Nome: X\n1. A\nPalavra-chave: a\nE." });
  assert.equal(bloqueado.ok, false);
  // Depois de gravar no grupo "laranja", declarar os mesmos Assuntos no grupo "azul" é recusado (um plano por Assunto).
  const gravado = await core(db, { mode: "apply", importRequestId: "9d4f3051-1111-4222-8333-444455556666" });
  assert.ok(gravado.ok);
  const noAzul = await core(db, { group: { mode: "existing", groupId: G_SECOND } });
  assert.ok(noAzul.ok && noAzul.mode === "preview");
  if (noAzul.ok && noAzul.mode === "preview") {
    assert.ok(noAzul.articles.every(article => article.subject.state === "other_plan"));
    assert.equal(noAzul.canApply, false);
  }
});

test("estrutural: só o núcleo do plano grava o plano e a marca; a rota e o MCP chamam o mesmo núcleo", () => {
  const limpa = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const rota = limpa("../app/api/minerador/marcas/[brandId]/plans/import/route.ts");
  assert.match(rota, /importDeclaredPlanWithCore\(/);
  assert.doesNotMatch(rota, /setKeywordSubject|setDeclaredPrincipal|\.update\(/);
  const nucleo = limpa("../lib/minerador/declared-plan-import-core.ts");
  assert.match(nucleo, /importSubjectsWithCore\(/);
  assert.match(nucleo, /assignKeywordGroupWithCore\(/);
  assert.match(nucleo, /declaredPrincipalReciprocity\(/);
});
