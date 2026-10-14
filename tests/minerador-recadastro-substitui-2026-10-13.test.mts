import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseDeclaredPlanText } from "../lib/minerador/declared-plan.ts";
import { importDeclaredPlanWithCore, readDeclaredPlanCardRows, type StructuredDeclaredPlan } from "../lib/minerador/declared-plan-import-core.ts";
import { withdrawFromDeclaredPlanWithCore } from "../lib/minerador/declared-plan-withdraw-core.ts";
import { KEYWORD_SUBJECT_RELEASE_KEY, keywordSubjectBlocksDeletion, resolveDeclaredPrincipal, resolveKeywordSubject, type KeywordSubjectRelease } from "../lib/minerador/keyword-subject.ts";
import { PlanFakeDb, type Row } from "./plano-declarado-fake-db.mts";

/*
 * F1 · RECADASTRO QUE SUBSTITUI (SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`
 * §5, D1 decidida pelo dono em 2026-10-13: "pode seguir suas recomendações sim").
 * "Silo existente" → Acrescentar | Substituir o plano, pelo MESMO núcleo do
 * cadastro. Banco de mentira (sem `delete`): REAL_PROVIDER_CALLS_IN_TESTS = 0;
 * nenhuma exclusão de keyword é chamada.
 */

const ACTOR = "d67ebbad-a590-45f8-8bb5-a19c6241ac1b";
const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const OTHER_BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const G = "a9d5c87b-0000-4000-8000-0000000000a1";
const G_OUTRO = "a9d5c87b-0000-4000-8000-0000000000a2";
const AT = "2026-10-13T12:00:00.000Z";
const LATER = "2026-10-14T09:00:00.000Z";

const K = {
  pilar: "40000000-0000-4000-8000-000000000001",
  wifi: "40000000-0000-4000-8000-000000000002",
  stream: "40000000-0000-4000-8000-000000000003",
  jogos: "40000000-0000-4000-8000-000000000004",
  roteador: "40000000-0000-4000-8000-000000000005",
  outroPlano: "40000000-0000-4000-8000-000000000006",
  publicada: "40000000-0000-4000-8000-000000000007",
};

const SILO = { name: "Wi-Fi e fibra óptica", slug: "wifi-e-fibra", objective: "Entender a conexão de casa." };
type Artigo = StructuredDeclaredPlan["articles"][number];
const A1: Artigo = { order: 1, subject: "Fibra óptica ou internet comum: qual escolher?", principal: "internet fibra óptica", role: "Pilar", scope: "Tecnologias de acesso e o que observar." };
const A2: Artigo = { order: 2, subject: "Wi-Fi lento em casa: causas e soluções", principal: "wi-fi lento", role: "Suporte", scope: "Roteador, interferência e testes." };
const A3: Artigo = { order: 3, subject: "Quantos Mega para streaming?", principal: "internet para streaming", role: "Suporte", scope: "Consumo de banda por qualidade de vídeo." };
const A4: Artigo = { order: 4, subject: "Melhor internet para jogos online", principal: "melhor internet para jogos online", role: "Suporte", scope: "Latência, ping e estabilidade." };

function marca(): PlanFakeDb {
  const kw = (id: string, keyword: string, extra: Row = {}): Row => ({ id, keyword, brand_id: BRAND, status: "aprovado", group_id: null, deleted_at: null, volume_search: null, results_allintitle: null, analise_semantica: { dna_origem: "logico_deterministico" }, ...extra });
  return new PlanFakeDb({
    editorial_groups: [
      { id: G, marca_id: BRAND, name: "azul", color: "azul", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT, created_at: AT },
      { id: G_OUTRO, marca_id: BRAND, name: "laranja", color: "laranja", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT, created_at: AT },
    ],
    editorial_group_events: [],
    editorial_group_articles: [],
    brand_site_catalog_entries: [],
    minerador_keywords: [
      kw(K.pilar, "internet fibra óptica"),
      kw(K.wifi, "wi-fi lento"),
      kw(K.stream, "internet para streaming"),
      kw(K.jogos, "melhor internet para jogos online", { status: "bruto" }),
      kw(K.roteador, "roteador wi-fi 6", { status: "bruto" }),
      kw(K.outroPlano, "internet barata", { status: "bruto" }),
      kw(K.publicada, "fibra empresarial", { analise_semantica: { site_origin: { publicationStatus: "published", sourceUrl: "https://x.com.br/a/", resolvedUrl: "https://x.com.br/a/", canonicalUrl: "https://x.com.br/a/", urlSituation: "canonical_confirmed", lastCheckedAt: AT, publicationConfirmedBy: ACTOR, publicationConfirmedAt: AT } } }),
      // Outra marca com a MESMA frase: nunca é lida nem tocada.
      { id: "90000000-0000-4000-8000-000000000001", keyword: "internet fibra óptica", brand_id: OTHER_BRAND, status: "bruto", group_id: null, deleted_at: null, analise_semantica: {} },
    ],
  });
}

let pedido = 0;
const novoPedido = () => `6a1c0d2e-1111-4222-8333-${String(++pedido).padStart(12, "0")}`;

const nucleo = (db: PlanFakeDb, extra: Partial<Parameters<typeof importDeclaredPlanWithCore>[0]>, keywordsClient: unknown = db) => importDeclaredPlanWithCore({
  brandId: BRAND, actorUserId: ACTOR, keywordsClient: keywordsClient as PlanFakeDb, groupsClient: db, mode: "preview",
  group: { mode: "existing", groupId: G }, destination: { kind: "existing_silo", groupId: G }, now: LATER, ...extra,
});

/** O Silo azul com os quatro artigos gravados (cadastro único: o Assunto na própria keyword). */
async function comPlano(): Promise<PlanFakeDb> {
  const db = marca();
  const gravado = await importDeclaredPlanWithCore({
    brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "apply",
    plan: { silo: SILO, articles: [A1, A2, A3, A4] }, group: { mode: "color", color: "azul", name: null }, destination: { kind: "new_silo" },
    importRequestId: novoPedido(), now: AT,
  });
  assert.ok(gravado.ok && gravado.mode === "apply" && gravado.failed === 0, JSON.stringify(gravado));
  return db;
}

const semantica = (db: PlanFakeDb, id: string) => db.rows("minerador_keywords").find(row => row.id === id)!.analise_semantica as Row;
const grupo = (db: PlanFakeDb, id = G) => db.rows("editorial_groups").find(row => row.id === id)!;
const nadaApagado = (db: PlanFakeDb, total: number) => {
  assert.equal(db.rows("minerador_keywords").length, total, "nenhuma keyword some");
  assert.ok(db.rows("minerador_keywords").every(row => !row.deleted_at), "nada vai para a lixeira");
  assert.ok(!db.log.some(entrada => entrada.op === "delete"), "nenhum delete");
};

async function substituir(db: PlanFakeDb, articles: Artigo[], extra: Partial<Parameters<typeof importDeclaredPlanWithCore>[0]> = {}) {
  const previa = await nucleo(db, { plan: { silo: null, articles }, planMode: "replace", ...extra });
  assert.ok(previa.ok && previa.mode === "preview", JSON.stringify(previa));
  if (!previa.ok || previa.mode !== "preview") throw new Error("prévia");
  return previa;
}

/* ============================================================ compatibilidade */

test("planMode ausente = o corpo de sempre (acréscimo): idêntico a 'append', sem os campos da substituição", async () => {
  const db = await comPlano();
  const linhas = [A1, A2, A3, A4, { order: 5, subject: "Roteador Wi-Fi 6 vale a pena?", principal: "roteador wi-fi 6", role: "Suporte" as const, scope: "Quando trocar o roteador." }];
  const ausente = await nucleo(db, { plan: { silo: null, articles: linhas } });
  const append = await nucleo(db, { plan: { silo: null, articles: linhas }, planMode: "append" });
  assert.deepEqual(append, ausente);
  assert.ok(ausente.ok && ausente.mode === "preview");
  if (!ausente.ok || ausente.mode !== "preview") return;
  assert.equal("planMode" in ausente, false);
  assert.equal("replace" in ausente, false);
  // No acréscimo, o Assunto não muda de keyword e o Pilar não sai (as regras de antes).
  const troca = await nucleo(db, { plan: { silo: null, articles: [{ ...A2, principal: "roteador wi-fi 6" }] } });
  assert.ok(troca.ok && troca.mode === "preview" && troca.blockers.some(item => /já mora na keyword "wi-fi lento"/.test(item)));
});

/* ============================================================ as quatro listas */

test("prévia: fica igual · muda · entra · sai, com o motivo de cada uma; não grava nada; decisionHash", async () => {
  const db = await comPlano();
  const antes = JSON.stringify(db.tables);
  const novo = { order: 5, subject: "Roteador Wi-Fi 6 vale a pena?", principal: "roteador wi-fi 6", role: "Suporte" as const, scope: "Quando trocar o roteador." };
  const previa = await substituir(db, [A1, { ...A2, scope: "Roteador, interferência, testes e repetidores." }, A4, novo]);
  assert.equal(JSON.stringify(db.tables), antes, "prévia não escreve");
  assert.equal(previa.planMode, "replace");
  assert.deepEqual(previa.blockers, []);
  assert.equal(previa.canApply, true);
  const lista = previa.replace!;
  assert.ok(lista.decisionHash);
  assert.deepEqual(lista.same.map(item => item.order), [1, 4]);
  assert.deepEqual(lista.changed.map(item => item.order), [2]);
  assert.match(lista.changed[0].reasons.join(" "), /detalhes mudam/);
  assert.match(lista.changed[0].reasons.join(" "), /1 aprovada\(s\) voltam a “Em revisão”/);
  assert.deepEqual(lista.entering.map(item => item.keyword), ["roteador wi-fi 6"]);
  assert.deepEqual(lista.leaving.map(item => [item.kind, item.keyword, item.order]), [["article", "internet para streaming", 3]]);
  assert.match(lista.leaving[0].reasons.join(" "), /não está no plano novo/);
  assert.match(lista.leaving[0].reasons.join(" "), /“Tirar do plano”/);
  assert.equal(lista.leaving[0].approvedToReview, 1);
  assert.deepEqual(lista.nextPlanVersions, { withdrawal: 2, plan: 3 });
  assert.ok(lista.effects.some(efeito => /Nada é apagado/.test(efeito)));
  assert.ok(lista.effects.some(efeito => /Fora do plano/.test(efeito) && /Radar, Redator e publicados não mudam/.test(efeito)));
  assert.deepEqual(previa.keptArticles, [], "na substituição nada é mantido por fora das linhas");
  // A mesma prévia de novo = o mesmo hash; outra linha = outro hash.
  const igual = await substituir(db, [A1, { ...A2, scope: "Roteador, interferência, testes e repetidores." }, A4, novo]);
  assert.equal(igual.replace!.decisionHash, lista.decisionHash);
  const outra = await substituir(db, [A1, A2, A4, novo]);
  assert.notEqual(outra.replace!.decisionHash, lista.decisionHash);
});

/* ============================================================ aplicar */

test("aplicar: exige o decisionHash da prévia; faz Sai (v2, marcador) e o plano novo (v3); nada apagado; idempotente", async () => {
  const db = await comPlano();
  const total = db.rows("minerador_keywords").length;
  const novo = { order: 5, subject: "Roteador Wi-Fi 6 vale a pena?", principal: "roteador wi-fi 6", role: "Suporte" as const, scope: "Quando trocar o roteador." };
  const linhas = [A1, { ...A2, scope: "Roteador, interferência, testes e repetidores." }, A4, novo];
  const previa = await substituir(db, linhas);
  const antes = JSON.stringify(db.tables);

  const semDecisao = await nucleo(db, { mode: "apply", plan: { silo: null, articles: linhas }, planMode: "replace", importRequestId: novoPedido() });
  assert.ok(!semDecisao.ok && semDecisao.code === "DECISION_REQUIRED");
  const velha = await nucleo(db, { mode: "apply", plan: { silo: null, articles: linhas }, planMode: "replace", importRequestId: novoPedido(), decisionHash: "outra-prévia" });
  assert.ok(!velha.ok && velha.code === "DECISION_STALE");
  assert.equal(JSON.stringify(db.tables), antes, "recusas não escrevem");

  const aplicado = await nucleo(db, { mode: "apply", plan: { silo: null, articles: linhas }, planMode: "replace", importRequestId: novoPedido(), decisionHash: previa.replace!.decisionHash });
  assert.ok(aplicado.ok && aplicado.mode === "apply", JSON.stringify(aplicado));
  if (!aplicado.ok || aplicado.mode !== "apply") return;
  assert.equal(aplicado.failed, 0);
  assert.equal(aplicado.planMode, "replace");
  assert.deepEqual(aplicado.replaced?.withdrawn.map(item => item.subjectKeywordId), [K.stream]);
  assert.equal(aplicado.replaced?.withdrawalPlanVersion, 2);
  assert.equal(aplicado.planVersion, 3, "uma decisão, duas versões");
  assert.equal(grupo(db).plan_version, 3);
  assert.equal((grupo(db).plan as Row).articleCount, 4);

  // O que saiu: o Assunto continua declarado (com o título), sem plano, com o marcador de "Tirar do plano"; a marca sai.
  const saiu = semantica(db, K.stream);
  const assunto = resolveKeywordSubject(saiu);
  assert.equal(assunto.declared, true);
  assert.equal(assunto.plan, null);
  assert.equal(assunto.entry?.title, A3.subject, "o título fica na keyword (histórico)");
  const marcador = saiu[KEYWORD_SUBJECT_RELEASE_KEY] as KeywordSubjectRelease;
  assert.equal(marcador.via, "tirar_do_plano");
  assert.match(marcador.requestId, /^tirar-do-plano:substituir:/);
  assert.match(marcador.reason, /^Substituir o plano: artigo 3 \(Suporte\)/);
  assert.equal(resolveDeclaredPrincipal(saiu).mark, null);
  assert.equal(keywordSubjectBlocksDeletion(saiu), false, "liberada como o 'Tirar do plano' libera");
  assert.equal(db.rows("minerador_keywords").find(row => row.id === K.stream)!.group_id, G, "continua no grupo");

  // O que entra e o que muda: o plano novo, com a marca recíproca.
  for (const id of [K.pilar, K.wifi, K.jogos, K.roteador]) {
    const plano = resolveKeywordSubject(semantica(db, id)).plan;
    assert.equal(plano?.groupId, G, id);
    assert.equal(resolveDeclaredPrincipal(semantica(db, id)).mark?.subjectKeywordId, id);
  }
  assert.equal(resolveKeywordSubject(semantica(db, K.wifi)).plan?.scope, "Roteador, interferência, testes e repetidores.");
  assert.equal(resolveKeywordSubject(semantica(db, K.pilar)).plan?.planVersion, 1, "o que fica igual não é regravado");
  nadaApagado(db, total + 0);

  // Eventos: a retirada (v2, com as retiradas) e o plano novo (v3).
  const eventos = db.rows("editorial_group_events").filter(row => row.event_type === "plan_changed");
  assert.equal(eventos.length, 2);
  assert.deepEqual(((eventos[0].payload as Row).withdrawals as Row[]).map(item => item.subjectKeywordId), [K.stream]);
  assert.equal((eventos[0].payload as Row).planVersion, 2);
  assert.equal((eventos[1].payload as Row).planVersion, 3);

  // Reaplicar a mesma decisão: o plano mudou → recusa sem gravar; a prévia nova diz "nada sai".
  const depois = JSON.stringify(db.tables);
  const repetir = await nucleo(db, { mode: "apply", plan: { silo: null, articles: linhas }, planMode: "replace", importRequestId: novoPedido(), decisionHash: previa.replace!.decisionHash });
  assert.ok(!repetir.ok && repetir.code === "DECISION_STALE");
  const novaPrevia = await substituir(db, linhas);
  assert.equal(novaPrevia.replace!.leaving.length, 0);
  assert.equal(novaPrevia.replace!.same.length, 4);
  const deNovo = await nucleo(db, { mode: "apply", plan: { silo: null, articles: linhas }, planMode: "replace", importRequestId: novoPedido(), decisionHash: novaPrevia.replace!.decisionHash });
  assert.ok(deNovo.ok && deNovo.mode === "apply" && deNovo.planVersion === 3, "sem mudança, sem versão nova");
  assert.equal(JSON.stringify(db.tables.editorial_groups), JSON.stringify(JSON.parse(depois).editorial_groups));
});

test("troca de Pilar: no acréscimo é recusada (dois Pilares); na substituição o Pilar antigo sai pelo 'Tirar do plano'", async () => {
  const db = await comPlano();
  const linhas: Artigo[] = [{ ...A2, order: 1, role: "Pilar" }, { ...A3, order: 2 }, { ...A4, order: 3 }];
  const acrescimo = await nucleo(db, { plan: { silo: null, articles: [{ ...A2, role: "Pilar" }] } });
  assert.ok(acrescimo.ok && acrescimo.mode === "preview" && !acrescimo.canApply, "acréscimo com outro Pilar: dois Pilares");
  const previa = await substituir(db, linhas);
  assert.deepEqual(previa.blockers, []);
  const sai = previa.replace!.leaving.find(item => item.keywordId === K.pilar)!;
  assert.equal(sai.role, "Pilar");
  assert.match(sai.reasons.join(" "), /Pilar substituído: o plano novo traz “Wi-Fi lento em casa: causas e soluções” como Pilar/);
  assert.match(previa.replace!.changed.find(item => item.keywordId === K.wifi)!.reasons.join(" "), /papel Suporte → Pilar/);
  // A retirada avulsa continua recusando o Pilar.
  const avulsa = await withdrawFromDeclaredPlanWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "preview", groupId: G, subjectKeywordId: K.pilar });
  assert.ok(!avulsa.ok && avulsa.code === "PILLAR_CANNOT_LEAVE");
  if (!avulsa.ok) assert.match(avulsa.reason, /Substituir o plano/);

  const aplicado = await nucleo(db, { mode: "apply", plan: { silo: null, articles: linhas }, planMode: "replace", importRequestId: novoPedido(), decisionHash: previa.replace!.decisionHash });
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.failed === 0, JSON.stringify(aplicado));
  assert.equal(resolveKeywordSubject(semantica(db, K.pilar)).plan, null);
  assert.equal((semantica(db, K.pilar)[KEYWORD_SUBJECT_RELEASE_KEY] as KeywordSubjectRelease).via, "tirar_do_plano");
  assert.equal(resolveKeywordSubject(semantica(db, K.wifi)).plan?.role, "Pilar");
  const lido = await readDeclaredPlanCardRows({ brandId: BRAND, keywordsClient: db, groupsClient: db, groupId: G });
  assert.ok(lido.ok);
  if (lido.ok) {
    assert.deepEqual(lido.rows.map(row => [row.order, row.role, row.keyword]), [[1, "Pilar", "wi-fi lento"], [2, "Suporte", "internet para streaming"], [3, "Suporte", "melhor internet para jogos online"]]);
    assert.ok(lido.rows.every(row => !row.recovered), "o que saiu de propósito não volta como recuperado");
  }
});

test("o Assunto muda de keyword (só na substituição): A sai liberada com o marcador, B entra com o título", async () => {
  const db = await comPlano();
  const total = db.rows("minerador_keywords").length;
  const linhas: Artigo[] = [A1, { ...A2, principal: "roteador wi-fi 6" }, A3, A4];
  const previa = await substituir(db, linhas);
  assert.deepEqual(previa.blockers, []);
  assert.ok(previa.notices.some(item => /o Assunto "Wi-Fi lento em casa: causas e soluções" passa de "wi-fi lento" para "roteador wi-fi 6"/.test(item)), previa.notices.join(" | "));
  assert.match(previa.replace!.leaving[0].reasons.join(" "), /o Assunto passa para “roteador wi-fi 6”/);
  assert.match(previa.replace!.entering[0].reasons.join(" "), /o Assunto vem de “wi-fi lento” \(que sai do plano\)/);
  const aplicado = await nucleo(db, { mode: "apply", plan: { silo: null, articles: linhas }, planMode: "replace", importRequestId: novoPedido(), decisionHash: previa.replace!.decisionHash });
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.failed === 0, JSON.stringify(aplicado));
  const a = resolveKeywordSubject(semantica(db, K.wifi));
  assert.equal(a.plan, null);
  assert.equal((semantica(db, K.wifi)[KEYWORD_SUBJECT_RELEASE_KEY] as KeywordSubjectRelease).via, "tirar_do_plano");
  const historicoA = semantica(db, K.wifi).keyword_subject_history as Row[];
  assert.ok(historicoA.some(linha => linha.release), "o histórico append-only de A guarda o que saiu");
  const b = resolveKeywordSubject(semantica(db, K.roteador));
  assert.equal(b.entry?.title, A2.subject);
  assert.equal(b.plan?.order, 2);
  assert.equal(b.plan?.declaredPrincipal?.keywordId, K.roteador);
  assert.equal(resolveDeclaredPrincipal(semantica(db, K.roteador)).mark?.subjectKeywordId, K.roteador);
  nadaApagado(db, total);
});

/* ============================================================ o caso real do azul */

const SILO_AZUL = `Silo 2 — Wi-Fi, fibra óptica e qualidade da internet
Nome: Wi-Fi e fibra óptica
Slug: /wifi-e-fibra/
Objetivo: conquistar tráfego de pessoas que querem entender a tecnologia.
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

/** As 7 do azul: cadastradas, depois perderam o Assunto (lote "Assunto: Não", formato antigo do histórico); a marca de principal ficou. */
async function azulPerdido(): Promise<{ db: PlanFakeDb; groupId: string }> {
  const db = new PlanFakeDb({
    editorial_groups: [{ id: G, marca_id: BRAND, name: "azul", color: "azul", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT, created_at: AT }],
    editorial_group_events: [], editorial_group_articles: [], brand_site_catalog_entries: [], minerador_keywords: [],
  });
  const cadastro = await importDeclaredPlanWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "apply", text: SILO_AZUL, group: { mode: "color", color: "azul", name: null }, destination: { kind: "new_silo" }, importRequestId: novoPedido(), now: AT });
  assert.ok(cadastro.ok && cadastro.mode === "apply");
  for (const row of db.tables.minerador_keywords) {
    const semantic = row.analise_semantica as Row;
    const historico = (semantic.keyword_subject_history as Row[]).map(linha => {
      if (!linha.plan) return linha;
      const { scope: _scope, ...semEscopo } = linha.plan as Row;
      return { ...linha, plan: semEscopo };
    });
    historico.push({ previous: "declared", next: "none", note: null, destinationUrl: null, actorId: ACTOR, changedAt: "2026-10-13T05:35:06.847Z", origin: "batch" });
    row.analise_semantica = { ...semantic, keyword_subject: null, keyword_subject_origin: "batch", keyword_subject_at: "2026-10-13T05:35:06.847Z", keyword_subject_history: historico };
  }
  return { db, groupId: G };
}

/** As linhas do card como a tela monta: as recuperadas + os detalhes colados (a mesma regra do card). */
async function linhasDoCard(db: PlanFakeDb, groupId: string): Promise<Artigo[]> {
  const lido = await readDeclaredPlanCardRows({ brandId: BRAND, keywordsClient: db, groupsClient: db, groupId });
  assert.ok(lido.ok);
  if (!lido.ok) return [];
  assert.equal(lido.rows.length, 7);
  assert.ok(lido.rows.every(row => row.recovered), "as 7 vêm do histórico");
  const colado = parseDeclaredPlanText(SILO_AZUL).articles;
  const chave = (value: string | null) => (value || "").trim().toLocaleLowerCase("pt-BR");
  return lido.rows.map(row => ({ order: row.order, subject: row.title, principal: row.keyword, role: row.role, scope: row.details || colado.find(article => chave(article.principal) === chave(row.keyword))?.scope || "", lock: row.lock }));
}

test("caso real do azul: 7 keywords com a marca de principal e sem Assunto — Substituir devolve tudo, sem linha nova", async () => {
  const { db, groupId } = await azulPerdido();
  const total = db.rows("minerador_keywords").length;
  assert.equal(total, 7);
  const linhas = await linhasDoCard(db, groupId);
  const previa = await substituir(db, linhas, { group: { mode: "existing", groupId }, destination: { kind: "existing_silo", groupId } });
  assert.deepEqual(previa.blockers, []);
  assert.equal(previa.replace!.entering.length, 7);
  assert.equal(previa.replace!.leaving.length, 0, "nada sai: as 7 voltam");
  assert.ok(previa.replace!.entering.every(item => /volta ao plano: a keyword tinha perdido o Assunto/.test(item.reasons.join(" "))));
  const aplicado = await nucleo(db, { mode: "apply", plan: { silo: null, articles: linhas }, planMode: "replace", group: { mode: "existing", groupId }, destination: { kind: "existing_silo", groupId }, importRequestId: novoPedido(), decisionHash: previa.replace!.decisionHash });
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.failed === 0, JSON.stringify(aplicado));
  if (!aplicado.ok || aplicado.mode !== "apply") return;
  assert.equal(aplicado.reciprocityConfirmed, 7);
  nadaApagado(db, total);
  for (const row of db.tables.minerador_keywords) {
    const assunto = resolveKeywordSubject(row.analise_semantica as Row);
    assert.equal(assunto.declared, true, String(row.keyword));
    assert.equal(assunto.plan?.groupId, groupId);
    assert.equal(assunto.plan?.declaredPrincipal?.keywordId, row.id, "o Assunto mora na própria keyword");
    assert.ok(assunto.entry?.title);
  }
  const relido = await readDeclaredPlanCardRows({ brandId: BRAND, keywordsClient: db, groupsClient: db, groupId });
  assert.ok(relido.ok && relido.rows.length === 7 && relido.rows.every(row => !row.recovered));
});

test("azul, substituindo sem uma das 7: a recuperada fora do plano novo perde a marca e não volta como 'Recuperado do histórico'", async () => {
  const { db, groupId } = await azulPerdido();
  const total = db.rows("minerador_keywords").length;
  const linhas = await linhasDoCard(db, groupId);
  const fora = linhas.find(item => item.order === 15)!;
  const foraId = db.rows("minerador_keywords").find(row => String(row.keyword).toLocaleLowerCase("pt-BR") === fora.principal!.toLocaleLowerCase("pt-BR"))!.id as string;
  const seis = linhas.filter(item => item.order !== 15);
  const previa = await substituir(db, seis, { group: { mode: "existing", groupId }, destination: { kind: "existing_silo", groupId } });
  assert.deepEqual(previa.blockers, []);
  assert.equal(previa.replace!.entering.length, 6);
  assert.deepEqual(previa.replace!.leaving.map(item => [item.kind, item.keywordId, item.order]), [["orphan_mark", foraId, 15]]);
  assert.match(previa.replace!.leaving[0].reasons.join(" "), /não volta mais como “Recuperado do histórico”/);
  const aplicado = await nucleo(db, { mode: "apply", plan: { silo: null, articles: seis }, planMode: "replace", group: { mode: "existing", groupId }, destination: { kind: "existing_silo", groupId }, importRequestId: novoPedido(), decisionHash: previa.replace!.decisionHash });
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.failed === 0, JSON.stringify(aplicado));
  if (!aplicado.ok || aplicado.mode !== "apply") return;
  assert.deepEqual(aplicado.replaced?.orphanMarksCleared, [foraId]);
  assert.equal(aplicado.replaced?.withdrawalPlanVersion, null, "nada do plano gravado ficava: sem versão intermediária");
  const semantic = semantica(db, foraId);
  assert.equal(resolveDeclaredPrincipal(semantic).mark, null);
  assert.equal((semantic[KEYWORD_SUBJECT_RELEASE_KEY] as KeywordSubjectRelease).via, "tirar_do_plano");
  assert.equal(db.rows("minerador_keywords").find(row => row.id === foraId)!.group_id, groupId, "continua no grupo");
  nadaApagado(db, total);
  const relido = await readDeclaredPlanCardRows({ brandId: BRAND, keywordsClient: db, groupsClient: db, groupId });
  assert.ok(relido.ok);
  if (relido.ok) assert.deepEqual(relido.rows.map(row => row.order), [9, 10, 11, 12, 13, 14], "a que ficou fora não volta");
});

/* ============================================================ idempotência no meio */

test("falha no meio da retirada: WITHDRAWAL_FAILED, plano novo não gravado; prévia nova e confirmação terminam sem repetir nada", async () => {
  const db = await comPlano();
  const linhas: Artigo[] = [A1, A2];
  const previa = await substituir(db, linhas);
  assert.deepEqual(previa.replace!.leaving.map(item => item.keywordId), [K.stream, K.jogos]);
  let atualizacoes = 0;
  // A 2ª escrita de keyword da retirada (a do 2º artigo que sai) não volta: a releitura falha.
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
  const falhou = await nucleo(db, { mode: "apply", plan: { silo: null, articles: linhas }, planMode: "replace", importRequestId: novoPedido(), decisionHash: previa.replace!.decisionHash }, instavel);
  assert.ok(!falhou.ok && falhou.code === "WITHDRAWAL_FAILED", JSON.stringify(falhou));
  if (!falhou.ok) assert.match(falhou.reason, /é seguro/);
  assert.equal(grupo(db).plan_version, 2, "a retirada já gravou a versão com o que fica");
  assert.equal(resolveKeywordSubject(semantica(db, K.stream)).plan, null, "o 1º já saiu");
  assert.ok(resolveKeywordSubject(semantica(db, K.jogos)).plan, "o 2º ainda está no plano");

  const novaPrevia = await substituir(db, linhas);
  assert.deepEqual(novaPrevia.replace!.leaving.map(item => item.keywordId), [K.jogos], "o que já saiu não sai de novo");
  const terminou = await nucleo(db, { mode: "apply", plan: { silo: null, articles: linhas }, planMode: "replace", importRequestId: novoPedido(), decisionHash: novaPrevia.replace!.decisionHash });
  assert.ok(terminou.ok && terminou.mode === "apply" && terminou.failed === 0, JSON.stringify(terminou));
  if (!terminou.ok || terminou.mode !== "apply") return;
  assert.equal(terminou.replaced?.withdrawalPlanVersion, 2, "a versão da retirada não sobe de novo (mesmo hash)");
  assert.equal(terminou.planVersion, 3);
  assert.equal(db.rows("editorial_group_events").filter(row => row.event_type === "plan_changed" && (row.payload as Row).withdrawals).length, 1, "um evento de retirada só");
  assert.equal(resolveKeywordSubject(semantica(db, K.jogos)).plan, null);
  nadaApagado(db, 8);
});

/* ============================================================ recusas por linha */

test("R4/R6/R7 e o slug continuam recusando por linha; replace só no Silo existente; outra marca não vê o grupo", async () => {
  const db = await comPlano();
  // R6 — a keyword é Assunto do plano de outra cor.
  const laranja = await importDeclaredPlanWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "apply", plan: { silo: { name: "Planos" }, articles: [{ order: 1, subject: "Internet barata", principal: "internet barata", role: "Pilar", scope: "Planos baratos." }] }, group: { mode: "color", color: "laranja", name: null }, destination: { kind: "new_silo" }, importRequestId: novoPedido(), now: AT });
  assert.ok(laranja.ok && laranja.mode === "apply");
  const r6 = await substituir(db, [A1, { order: 2, subject: "Internet barata no azul", principal: "internet barata", role: "Suporte", scope: "x" }]);
  assert.ok(r6.blockers.some(item => /já pertence ao plano de outro grupo/.test(item)), r6.blockers.join(" | "));
  // R7 — keyword publicada: destino "Artigo publicado".
  const r7 = await substituir(db, [A1, { order: 2, subject: "Fibra para empresas", principal: "fibra empresarial", role: "Suporte", scope: "x" }]);
  assert.ok(r7.blockers.some(item => /já está publicada/.test(item)), r7.blockers.join(" | "));
  // Slug: confirmado no Arquiteto (silo_id) não muda; o nome pode mudar.
  grupo(db).silo_id = "silo-confirmado";
  const slug = await substituir(db, [A1, A2], { plan: { silo: { name: "Wi-Fi em casa", slug: "/wifi-em-casa/" }, articles: [A1, A2] } });
  assert.ok(slug.blockers.some(item => /já está confirmado no Arquiteto/.test(item)), slug.blockers.join(" | "));
  const nome = await substituir(db, [A1, A2], { plan: { silo: { name: "Wi-Fi em casa" }, articles: [A1, A2] } });
  assert.deepEqual(nome.blockers, []);
  assert.equal(nome.silo.name, "Wi-Fi em casa");
  assert.equal(nome.silo.slug, "wifi-e-fibra", "sem Slug: fica o gravado");
  // R4 — "Silo novo" numa cor que já tem outro Silo: recusa com o caminho (Silo existente: acrescentar ou substituir).
  const r4 = await nucleo(db, { plan: { silo: { name: "Outro Silo" }, articles: [A1] }, group: { mode: "color", color: "azul", name: null }, destination: { kind: "new_silo" } });
  assert.ok(r4.ok && r4.mode === "preview" && r4.blockers.some(item => /já tem o Silo "Wi-Fi e fibra óptica"[\s\S]*"Substituir o plano"/.test(item)), JSON.stringify(r4.ok && r4.mode === "preview" ? r4.blockers : r4));
  // Só no Silo existente.
  const novoSilo = await nucleo(db, { plan: { silo: SILO, articles: [A1] }, planMode: "replace", group: { mode: "color", color: "lima", name: null }, destination: { kind: "new_silo" } });
  assert.ok(novoSilo.ok && novoSilo.mode === "preview" && novoSilo.blockers.some(item => /só vale no destino “Silo existente”/.test(item)));
  // Isolamento: outra marca não acha o grupo.
  const outra = await importDeclaredPlanWithCore({ brandId: OTHER_BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "preview", plan: { silo: null, articles: [A1] }, planMode: "replace", group: { mode: "existing", groupId: G }, destination: { kind: "existing_silo", groupId: G }, now: LATER });
  assert.ok(outra.ok && outra.mode === "preview" && !outra.canApply && outra.blockers.some(item => /não existe nesta marca/.test(item)));
});

/* ============================================================ estrutural */

const limpa = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("estrutural: um caminho só (card → rota → núcleo; MCP → núcleo), o 'Sai' pelo núcleo de Tirar do plano, nenhuma exclusão", () => {
  const nucleoFonte = limpa("../lib/minerador/declared-plan-import-core.ts");
  const retirada = limpa("../lib/minerador/declared-plan-withdraw-core.ts");
  assert.match(nucleoFonte, /withdrawForPlanReplacementWithCore\(\{/);
  assert.match(nucleoFonte, /input\.decisionHash !== decisao\.decisionHash/);
  assert.doesNotMatch(nucleoFonte, /tirar_do_plano/, "o marcador é gravado só pelo núcleo de Tirar do plano");
  assert.match(retirada, /export async function withdrawForPlanReplacementWithCore/);
  assert.match(retirada, /releaseArticleKeywords\(\{ client: input\.keywordsClient/);
  for (const fonte of [nucleoFonte, retirada]) {
    assert.doesNotMatch(fonte, /lifecycle_delete|from\("minerador_keywords"\)[^;]*\.delete\(|deleted_at:/, "nada é apagado nem vai para a lixeira");
  }
  const rota = limpa("../app/api/minerador/marcas/[brandId]/plans/import/route.ts");
  assert.match(rota, /planMode: z\.enum\(\["append", "replace"\]\)\.optional\(\)/);
  assert.match(rota, /planMode: input\.planMode \?\? null,\s*decisionHash: input\.decisionHash \?\? null/);
  const card = limpa("../modules/minerador/subject-cadastro-card.tsx");
  assert.match(card, /data-subject-cadastro-modo-plano/);
  assert.match(card, /data-subject-cadastro-quatro-listas/);
  assert.match(card, /planMode: preview\.request\.planMode, decisionHash: preview\.result\.replace\?\.decisionHash/);
  assert.match(card, /confirmacaoSubstituicaoOk/);
  assert.doesNotMatch(card, /from\("minerador_keywords"\)|supabase/i, "a tela não grava por conta própria");
  const mcp = limpa("../lib/server/platform-mcp-tools.ts");
  const inicio = mcp.indexOf('server.registerTool("declare_silo_plan"');
  const trecho = mcp.slice(inicio, mcp.indexOf("server.registerTool(", inicio + 30));
  assert.equal((trecho.match(/importDeclaredPlanWithCore\(/g) || []).length, 1);
  assert.match(trecho, /planMode: z\.enum\(\["append", "replace"\]\)/);
  assert.match(trecho, /\["minerador\.write", "platform\.decide"\]/);
  assert.match(trecho, /decision_hash_required/);
});
