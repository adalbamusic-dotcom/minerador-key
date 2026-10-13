import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importDeclaredPlanWithCore } from "../lib/minerador/declared-plan-import-core.ts";
import { withdrawFromDeclaredPlanWithCore } from "../lib/minerador/declared-plan-withdraw-core.ts";
import { resolveDeclaredPrincipal, resolveKeywordSubject, setKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import { assignKeywordGroupWithCore } from "../lib/minerador/keyword-group-core.ts";
import { PlanFakeDb, type Row } from "./plano-declarado-fake-db.mts";

/*
 * 2026-10-12 · "TIRAR DO PLANO" PELA TELA (SDD do plano declarado §6.1-5;
 * backlog do Minerador). Um artigo sai do plano declarado sem tirar o Assunto e
 * sem apagar nada: prévia → decisão humana (`decisionHash`) → versão nova do
 * plano no grupo → releitura. O mesmo núcleo do plano (hash do plano restante =
 * o que reimportar o texto restante daria). Banco de mentira; nada pago.
 */

const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const ACTOR = "8f0c2a4e-1111-4222-8333-444455556666";
const G = "a9d5c87b-0000-4000-8000-000000000001";
const G_AZUL = "a9d5c87b-0000-4000-8000-000000000002";
const AT = "2026-10-12T16:00:00.000Z";

const cabecalho = "Nome: Planos e contratação\nSlug: /planos-de-internet/\nObjetivo: Ajudar a escolher e contratar internet residencial.";
const artigos = [
  "1. Como escolher o melhor plano de internet residencial\nArtigo pilar • Palavra-chave: melhor plano de internet residencial\nComo comparar planos.",
  "2. Internet residencial barata: onde achar\nPalavra-chave: internet residencial barata\nOnde achar planos baratos.",
  "3. Claro, Vivo ou TIM: qual escolher\nPalavra-chave: Claro Vivo ou TIM internet\nComparação das três operadoras.",
  "4. Internet sem fidelidade\nPalavra-chave: internet residencial sem fidelidade\nPlanos sem multa.",
];
const PLANO = [cabecalho, ...artigos].join("\n");
const PLANO_SEM_O_3 = [cabecalho, artigos[0], artigos[1], artigos[3]].join("\n");

const assunto = (): Row => {
  const result = setKeywordSubject({ dna_origem: "logico_deterministico" }, { note: "Para quem quer trocar de plano", actorId: ACTOR, changedAt: AT, origin: "import" });
  assert.ok(result.ok);
  return result.semantic;
};

const S = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004"];
const P = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003", "10000000-0000-4000-8000-000000000004"];

function marca(): PlanFakeDb {
  const kw = (id: string, keyword: string, extra: Row = {}): Row => ({ id, keyword, brand_id: BRAND, status: "aprovado", group_id: G, deleted_at: null, volume_search: 260, results_allintitle: null, analise_semantica: { dna_origem: "logico_deterministico" }, ...extra });
  return new PlanFakeDb({
    editorial_groups: [
      { id: G, marca_id: BRAND, name: "Laranja", color: "laranja", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT },
      { id: G_AZUL, marca_id: BRAND, name: "Azul", color: "azul", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT },
    ],
    editorial_group_events: [],
    editorial_group_articles: [],
    brand_site_catalog_entries: [],
    minerador_keywords: [
      kw(S[0], "Como escolher o melhor plano de internet residencial", { analise_semantica: assunto() }),
      kw(S[1], "Internet residencial barata: onde achar", { analise_semantica: assunto() }),
      kw(S[2], "Claro, Vivo ou TIM: qual escolher", { analise_semantica: assunto() }),
      kw(S[3], "Internet sem fidelidade", { analise_semantica: assunto() }),
      kw(P[0], "melhor plano de internet residencial"),
      kw(P[1], "internet residencial barata"),
      kw(P[2], "Claro Vivo ou TIM internet", { status: "bruto", volume_search: null }),
      kw(P[3], "internet residencial sem fidelidade"),
    ],
  });
}

async function comPlano(): Promise<PlanFakeDb> {
  const db = marca();
  const gravado = await importDeclaredPlanWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "apply", text: PLANO, group: { mode: "existing", groupId: G }, importRequestId: "6a1c0d2e-1111-4222-8333-444455556666", now: AT });
  assert.ok(gravado.ok && gravado.mode === "apply" && gravado.failed === 0, JSON.stringify(gravado));
  return db;
}

const nucleo = (db: PlanFakeDb, extra: Partial<Parameters<typeof withdrawFromDeclaredPlanWithCore>[0]> = {}, keywordsClient: unknown = db) => withdrawFromDeclaredPlanWithCore({
  brandId: BRAND, actorUserId: ACTOR, keywordsClient: keywordsClient as PlanFakeDb, groupsClient: db, mode: "list", groupId: G, now: "2026-10-12T18:00:00.000Z", ...extra,
});
const semantica = (db: PlanFakeDb, id: string) => db.rows("minerador_keywords").find(row => row.id === id)!.analise_semantica as Row;
const grupoG = (db: PlanFakeDb) => db.rows("editorial_groups").find(row => row.id === G)!;

test("lista: os artigos do plano em ordem; o Pilar não sai sozinho", async () => {
  const db = await comPlano();
  const lista = await nucleo(db);
  assert.ok(lista.ok && lista.mode === "list", JSON.stringify(lista));
  if (!lista.ok || lista.mode !== "list") return;
  assert.deepEqual(lista.articles.map(article => article.order), [1, 2, 3, 4]);
  assert.equal(lista.group.planVersion, 1);
  assert.equal(lista.articles[0].role, "Pilar");
  assert.equal(lista.articles[0].canWithdraw, false);
  assert.match(lista.articles[0].withdrawBlocker || "", /O Pilar não sai do plano sozinho/);
  assert.ok(lista.articles.slice(1).every(article => article.canWithdraw));
  assert.equal(lista.articles[2].principal?.phrase, "Claro Vivo ou TIM internet");
});

test("prévia: diz o que muda e não escreve nada; aplicar exige a decisão sobre a prévia vigente", async () => {
  const db = await comPlano();
  const antes = JSON.stringify(db.tables);
  const previa = await nucleo(db, { mode: "preview", subjectKeywordId: S[2] });
  assert.ok(previa.ok && previa.mode === "preview", JSON.stringify(previa));
  if (!previa.ok || previa.mode !== "preview") return;
  assert.equal(previa.remainingArticles, 3);
  assert.equal(previa.nextPlanVersion, 2);
  assert.equal(previa.approvedToReview, 1, "o Assunto aprovado volta para revisão; a principal bruto não conta");
  assert.ok(previa.effects.some(efeito => /continua declarado e no grupo “Laranja”/.test(efeito)));
  assert.ok(previa.effects.some(efeito => /passa a precisar de Volume/.test(efeito)));
  assert.ok(previa.effects.some(efeito => /Nada é apagado/.test(efeito)));
  assert.equal(JSON.stringify(db.tables), antes, "prévia não escreve");
  const semDecisao = await nucleo(db, { mode: "apply", subjectKeywordId: S[2] });
  assert.ok(!semDecisao.ok && semDecisao.code === "DECISION_REQUIRED");
  const velha = await nucleo(db, { mode: "apply", subjectKeywordId: S[2], decisionHash: "outra-prévia" });
  assert.ok(!velha.ok && velha.code === "DECISION_STALE");
  const pilar = await nucleo(db, { mode: "preview", subjectKeywordId: S[0] });
  assert.ok(!pilar.ok && pilar.code === "PILLAR_CANNOT_LEAVE");
  const fora = await nucleo(db, { mode: "preview", subjectKeywordId: P[1] });
  assert.ok(!fora.ok && fora.code === "NOT_IN_PLAN");
  assert.equal(JSON.stringify(db.tables), antes, "recusas não escrevem");
});

test("aplicar: plano v2 no grupo (= reimportar o texto restante), Assunto sem plano e ainda declarado, principal sem a marca; nada some", async () => {
  const db = await comPlano();
  const outrosAntes = [S[0], S[1], S[3], P[0], P[1], P[3]].map(id => JSON.stringify(semantica(db, id)));
  const totalAntes = db.rows("minerador_keywords").length;
  const previa = await nucleo(db, { mode: "preview", subjectKeywordId: S[2] });
  assert.ok(previa.ok && previa.mode === "preview");
  if (!previa.ok || previa.mode !== "preview") return;
  const aplicado = await nucleo(db, { mode: "apply", subjectKeywordId: S[2], decisionHash: previa.decisionHash });
  assert.ok(aplicado.ok && aplicado.mode === "apply", JSON.stringify(aplicado));
  if (!aplicado.ok || aplicado.mode !== "apply") return;
  assert.equal(aplicado.planVersion, 2);
  assert.equal(aplicado.groupAlreadyUpdated, false);
  assert.deepEqual(aplicado.readback, { subjectPlanRemoved: true, subjectStillDeclared: true, principalMarkRemoved: true, groupPlanHash: grupoG(db).plan_hash });

  // O grupo: v2, 3 artigos, e o hash é o do texto restante (reimportá-lo não muda nada).
  assert.equal(grupoG(db).plan_version, 2);
  assert.equal((grupoG(db).plan as Row).articleCount, 3);
  const reimportar = await importDeclaredPlanWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "preview", text: PLANO_SEM_O_3, group: { mode: "existing", groupId: G }, now: AT });
  assert.ok(reimportar.ok && reimportar.mode === "preview" && reimportar.group.mode === "existing" && reimportar.group.samePlan, "mesmo plano que o texto restante");

  // O Assunto: continua declarado, com a nota; sem plano. A principal: sem a marca.
  const assuntoDepois = resolveKeywordSubject(semantica(db, S[2]));
  assert.equal(assuntoDepois.declared, true);
  assert.equal(assuntoDepois.note, "Para quem quer trocar de plano");
  assert.equal(assuntoDepois.plan, null);
  assert.equal(resolveDeclaredPrincipal(semantica(db, P[2])).mark, null);
  const historico = semantica(db, S[2]).keyword_subject_history as Row[];
  assert.deepEqual(historico.at(-1)!.plan, null, "o histórico do Assunto guarda a retirada");

  // Nada some; ninguém muda de grupo; os outros artigos do plano não são regravados.
  assert.equal(db.rows("minerador_keywords").length, totalAntes);
  assert.ok(db.rows("minerador_keywords").every(row => !row.deleted_at));
  assert.equal(db.rows("minerador_keywords").find(row => row.id === S[2])!.group_id, G);
  assert.equal(db.rows("minerador_keywords").find(row => row.id === P[2])!.group_id, G);
  assert.deepEqual([S[0], S[1], S[3], P[0], P[1], P[3]].map(id => JSON.stringify(semantica(db, id))), outrosAntes);

  // O evento do grupo diz o que saiu.
  const eventos = db.rows("editorial_group_events").filter(row => row.event_type === "plan_changed");
  assert.equal(eventos.length, 1);
  assert.deepEqual((eventos[0].payload as Row).withdrawal, { subjectKeywordId: S[2], subjectPhrase: "Claro, Vivo ou TIM: qual escolher", order: 3, role: "Suporte", principalKeywordId: P[2] });
  assert.equal((eventos[0].payload as Row).planVersion, 2);

  // Fora do plano, o Assunto e a principal podem mudar de grupo (antes: KEYWORD_PLAN_ANCHORED).
  const mover = await assignKeywordGroupWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordIds: [S[2], P[2], S[1]], groupId: G_AZUL, keywordsClient: db, groupsClient: db });
  assert.ok(mover.ok);
  if (mover.ok) {
    assert.deepEqual([...mover.moved].sort(), [P[2], S[2]].sort());
    assert.deepEqual(mover.refused.map(item => item.code), ["KEYWORD_PLAN_ANCHORED"], "quem continua no plano continua preso");
  }

  // Repetir com a mesma prévia: o Assunto já saiu.
  const repetir = await nucleo(db, { mode: "apply", subjectKeywordId: S[2], decisionHash: previa.decisionHash });
  assert.ok(!repetir.ok && repetir.code === "NOT_IN_PLAN");
});

test("falha no meio: o grupo já está na versão nova; gerar a prévia e confirmar de novo termina sem repetir nada", async () => {
  const db = await comPlano();
  let atualizacoes = 0;
  // A 2ª escrita de keyword (a do Assunto; a 1ª é a da principal) não volta: releitura falha.
  const instavel = {
    from(tabela: string) {
      const consulta = db.from(tabela);
      if (tabela !== "minerador_keywords") return consulta;
      const original = consulta.update.bind(consulta);
      consulta.update = (patch: Row) => {
        atualizacoes += 1;
        if (atualizacoes !== 2) return original(patch);
        const vazio: Record<string, unknown> = {};
        for (const metodo of ["eq", "is"]) vazio[metodo] = () => vazio;
        vazio.select = () => Promise.resolve({ data: [], error: null });
        return vazio;
      };
      return consulta;
    },
  };
  const previa = await nucleo(db, { mode: "preview", subjectKeywordId: S[1] });
  assert.ok(previa.ok && previa.mode === "preview");
  if (!previa.ok || previa.mode !== "preview") return;
  const falhou = await nucleo(db, { mode: "apply", subjectKeywordId: S[1], decisionHash: previa.decisionHash }, instavel);
  assert.ok(!falhou.ok && falhou.code === "WRITE_NOT_CONFIRMED", JSON.stringify(falhou));
  if (!falhou.ok) assert.match(falhou.reason, /é seguro/);
  assert.equal(grupoG(db).plan_version, 2, "o grupo já foi");
  assert.ok(resolveKeywordSubject(semantica(db, S[1])).plan, "o Assunto ainda tem o plano");
  assert.equal(resolveDeclaredPrincipal(semantica(db, P[1])).mark, null, "a principal já perdeu a marca (nunca sobra exceção sem plano)");

  const novaPrevia = await nucleo(db, { mode: "preview", subjectKeywordId: S[1] });
  assert.ok(novaPrevia.ok && novaPrevia.mode === "preview");
  if (!novaPrevia.ok || novaPrevia.mode !== "preview") return;
  const terminou = await nucleo(db, { mode: "apply", subjectKeywordId: S[1], decisionHash: novaPrevia.decisionHash });
  assert.ok(terminou.ok && terminou.mode === "apply", JSON.stringify(terminou));
  if (terminou.ok && terminou.mode === "apply") {
    assert.equal(terminou.groupAlreadyUpdated, true);
    assert.equal(terminou.planVersion, 2, "a versão não sobe de novo");
  }
  assert.equal(db.rows("editorial_group_events").filter(row => row.event_type === "plan_changed").length, 1, "um evento só");
  assert.equal(resolveKeywordSubject(semantica(db, S[1])).plan, null);
});

test("isolamento e contrato: outra marca não lê o plano; sem ator não grava; grupo sem plano recusa", async () => {
  const db = await comPlano();
  const outra = await withdrawFromDeclaredPlanWithCore({ brandId: "11111111-0000-4000-8000-0000000000ff", actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "list", groupId: G });
  assert.ok(!outra.ok && outra.code === "GROUP_WITHOUT_PLAN");
  const semAtor = await nucleo(db, { actorUserId: "local-user", mode: "preview", subjectKeywordId: S[1] });
  assert.ok(!semAtor.ok && semAtor.code === "ACTOR_REQUIRED");
  const semPlano = await nucleo(db, { groupId: G_AZUL });
  assert.ok(!semPlano.ok && semPlano.code === "GROUP_WITHOUT_PLAN");
});

test("estrutural: a rota chama o núcleo (GET lê, POST com minerador:edit) e não grava keyword por conta própria", () => {
  const limpa = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const rota = limpa("../app/api/minerador/marcas/[brandId]/plans/withdraw/route.ts");
  assert.match(rota, /withdrawFromDeclaredPlanWithCore\(/);
  assert.match(rota, /assertCanReadEditorialGroups\(profile, brandId\)/);
  assert.match(rota, /requireTenantPermission\(\{ brandId, actorUserId: profile\.userId, module: "minerador", action: "edit", profile \}\)/);
  assert.doesNotMatch(rota, /setKeywordSubject|setDeclaredPrincipal|\.update\(/);
  const nucleoFonte = limpa("../lib/minerador/declared-plan-withdraw-core.ts");
  assert.match(nucleoFonte, /declareEditorialGroupPlan\(/, "a versão nova do plano sai do repositório de sempre");
  assert.match(nucleoFonte, /declaredPlanHash\(/, "o mesmo hash do import");
  assert.match(nucleoFonte, /input\.decisionHash !== decisionHash/);
  assert.doesNotMatch(nucleoFonte, /\.update\(\{[^}]*\b(group_id|deleted_at|status)\b|\)\.delete\(/, "não muda grupo, status nem apaga (o `inFlight.delete` é só a trava em memória)");
  assert.match(nucleoFonte, /\.update\(\{ analise_semantica: semantic \}\)/, "a única escrita de keyword é a semântica");
});
