import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { importDeclaredPlanWithCore, setKeywordPlanLockWithCore } from "../lib/minerador/declared-plan-import-core.ts";
import { resolveDeclaredPrincipal, resolveKeywordSubject, setDeclaredPrincipal, setKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import {
  PLAN_LOCK_ARCHITECT_HINT,
  PLAN_LOCK_CADASTRO_REFUSAL,
  PLAN_LOCK_ORPHAN_REFUSAL,
  PLAN_LOCK_PUBLISHED_REFUSAL,
  keywordPlanLockHint,
  planLockChange,
  resolveKeywordPlanLock,
} from "../lib/minerador/keyword-plan-lock.ts";
import { keywordVinculoChoicesSummary, resolveKeywordVinculo } from "../lib/minerador/keyword-vinculo.ts";
import { planVinculoBatch, planVinculoBatchChoices, type VinculoBatchKeyword } from "../lib/minerador/vinculo-batch.ts";
import {
  VINCULO_PLAN_LOCK_SELECT_OPTIONS,
  commonVinculoSelectValues,
  describeVinculoBatchConfirmation,
  planLockChoiceOfPostValue,
  vinculoBatchActionFromChoice,
  vinculoSelectToBatchChoice,
  vinculoSelectValues,
} from "../lib/minerador/vinculo-screen.ts";
import { resolveSubjectArticleView, subjectHeadline } from "../lib/minerador/subject-article-view.ts";
import { PlanFakeDb, type Row } from "./plano-declarado-fake-db.mts";

/*
 * POSTO DE PRINCIPAL = TRAVA DO CADASTRO NA NÃO PUBLICADA (pedido do dono,
 * 2026-10-13: "no minerador eu coloco como [Travado ao slug] e ele não aceita";
 * "assuntos não estão no cabeçalho no painel, lá no minerador").
 * Fixtures em memória, sem rede, sem provider: REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const ACTOR = "d67ebbad-a590-45f8-8bb5-a19c6241ac1b";
const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const OTHER_BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const AZUL = "22222222-3333-4444-8555-666666666666";
const LARANJA = "a9d5c87b-59aa-4e49-8357-3fa893d4cd2d";
const AT = "2026-10-13T12:00:00.000Z";
const MEDIDA = (volume: number) => ({ volume_measurement: { provider: "google_ads", averageMonthlySearches: volume, measuredAt: "2026-10-10T10:00:00+00:00" } });
const PAGINA_URL = "https://wificonecta.com.br/fibra-empresarial/";
const PUBLICADA = { site_origin: { publicationStatus: "published", sourceUrl: PAGINA_URL, resolvedUrl: PAGINA_URL, canonicalUrl: PAGINA_URL, urlSituation: "canonical_confirmed", lastCheckedAt: "2026-09-20T10:00:00Z", publicationConfirmedBy: ACTOR, publicationConfirmedAt: "2026-09-20T10:00:00Z" } };

const PLANO = `Silo 2 — Wi-Fi e fibra óptica
Nome: Wi-Fi e fibra óptica
Slug: /wifi-e-fibra/
Objetivo: entender a tecnologia e melhorar a conexão.
9. Internet fibra óptica ou internet comum: qual a diferença?
Artigo pilar • Palavra-chave: internet fibra óptica
Explicar tecnologias de acesso e o que observar na contratação.
11. Wi-Fi lento em casa: 10 causas comuns
Palavra-chave: Wi-Fi lento
Posicionamento do roteador, interferência e testes de velocidade.
14. Internet para home office: qual velocidade?
Palavra-chave: internet para home office
Videochamadas, upload e estabilidade.`;

const IDS = {
  wifi: "40000000-0000-4000-8000-000000000001",
  home: "40000000-0000-4000-8000-000000000002",
  solta: "40000000-0000-4000-8000-000000000003",
  pagina: "50000000-0000-4000-8000-000000000001",
  orfa: "60000000-0000-4000-8000-000000000001",
  assuntoAnterior: "70000000-0000-4000-8000-000000000001",
  principalAnterior: "70000000-0000-4000-8000-000000000002",
};

function semantic(base: Row, edits: Array<(value: Row) => { ok: boolean; semantic?: Row }>): Row {
  let atual = base;
  for (const edit of edits) {
    const result = edit(atual);
    assert.ok(result.ok, JSON.stringify(result));
    atual = result.semantic as Row;
  }
  return atual;
}

function marca(): PlanFakeDb {
  const kw = (id: string, keyword: string, extra: Row = {}): Row => ({ id, keyword, brand_id: BRAND, status: "bruto", group_id: null, deleted_at: null, volume_search: null, results_allintitle: null, analise_semantica: { dna_origem: "logico_deterministico" }, ...extra });
  // O formato anterior: o Assunto numa linha, a principal em outra (marca recíproca).
  const planoAnterior = { groupId: LARANJA, planVersion: 1, order: 1, role: "Pilar" as const, scope: "Comparar planos e preços.", declaredPrincipal: { keywordId: IDS.principalAnterior, phrase: "planos de internet" } };
  const assuntoAnterior = semantic({ dna_origem: "logico_deterministico" }, [value => setKeywordSubject(value, { actorId: ACTOR, changedAt: AT, origin: "import", plan: planoAnterior })]);
  const principalAnterior = semantic({ dna_origem: "logico_deterministico" }, [value => setDeclaredPrincipal(value, { mark: { subjectKeywordId: IDS.assuntoAnterior, groupId: LARANJA, planVersion: 1 }, actorId: ACTOR, changedAt: AT })]);
  // A marca órfã: o Assunto saiu da keyword (o "Assunto: Não" antigo), a marca ficou.
  const orfa = semantic({ dna_origem: "logico_deterministico" }, [value => setDeclaredPrincipal(value, { mark: { subjectKeywordId: IDS.orfa, groupId: AZUL, planVersion: 1 }, actorId: ACTOR, changedAt: AT })]);
  return new PlanFakeDb({
    editorial_groups: [
      { id: LARANJA, marca_id: BRAND, name: "Planos e contratação", color: "laranja", origin: "declared_plan", status: "active", plan: { siloName: "Planos e contratação", siloSlug: "planos-de-internet", objective: "x", articleCount: 1 }, plan_version: 1, plan_hash: "h1", silo_id: null, lock_version: 1, updated_at: AT, created_at: AT },
      { id: AZUL, marca_id: BRAND, name: "azul", color: "azul", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT, created_at: AT },
    ],
    editorial_group_events: [],
    editorial_group_articles: [],
    brand_site_catalog_entries: [],
    minerador_keywords: [
      kw(IDS.wifi, "wi-fi lento", { volume_search: 1900, analise_semantica: { dna_origem: "logico_deterministico", ...MEDIDA(1900) } }),
      kw(IDS.home, "internet para home office", { status: "aprovado", volume_search: 0, analise_semantica: { dna_origem: "logico_deterministico", ...MEDIDA(0) } }),
      kw(IDS.solta, "roteador mesh"),
      kw(IDS.pagina, "internet fibra empresarial", { status: "aprovado", analise_semantica: { ...PUBLICADA } }),
      kw(IDS.orfa, "teste de velocidade da internet", { group_id: AZUL, analise_semantica: orfa }),
      kw(IDS.assuntoAnterior, "planos de internet em sp", { group_id: LARANJA, analise_semantica: assuntoAnterior }),
      kw(IDS.principalAnterior, "planos de internet", { status: "aprovado", group_id: LARANJA, analise_semantica: principalAnterior }),
      { id: "90000000-0000-4000-8000-000000000001", keyword: "wi-fi lento", brand_id: OTHER_BRAND, status: "bruto", group_id: null, deleted_at: null, analise_semantica: {} },
    ],
  });
}

async function comPlano(): Promise<PlanFakeDb> {
  const db = marca();
  const aplicado = await importDeclaredPlanWithCore({
    brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "apply", text: PLANO,
    group: { mode: "color", color: "azul" }, destination: { kind: "new_silo" }, importRequestId: "6a1c0d2e-1111-4222-8333-444455556661", now: AT,
  });
  assert.ok(aplicado.ok && aplicado.mode === "apply" && aplicado.failed === 0, JSON.stringify(aplicado));
  return db;
}

const linha = (db: PlanFakeDb, id: string) => db.tables.minerador_keywords.find(row => row.id === id)!;
const trava = (db: PlanFakeDb, id: string, lock: "auto" | "locked" | "free", mode: "preview" | "apply" = "apply", ids = [id]) => setKeywordPlanLockWithCore({
  brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode, keywordIds: ids, lock,
  ...(mode === "apply" ? { importRequestId: `7b2d1e3f-1111-4222-8333-${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}` } : {}), now: AT,
});
const lerTrava = (db: PlanFakeDb, id: string) => {
  const row = linha(db, id);
  const others = (other: string) => (linha(db, other)?.analise_semantica ?? null) as Row | null;
  return resolveKeywordPlanLock({ keywordId: id, keyword: String(row.keyword), status: String(row.status), semantic: row.analise_semantica as Row, volume: { validated: (row.volume_search as number) > 0, value: row.volume_search as number | null }, subjectSemanticOf: others, keywordTextOf: other => String(linha(db, other)?.keyword ?? "") || null });
};

test("domínio: a trava da não publicada — valor efetivo, porquê e recusa clara sem plano; publicada fica com o posto de sempre", async () => {
  const db = await comPlano();
  const wifi = lerTrava(db, IDS.wifi);
  assert.equal(wifi?.kind, "plan");
  if (wifi?.kind !== "plan") return;
  assert.equal(wifi.choice, "auto");
  assert.equal(wifi.state, "locked", "volume medido > 0: travada pela automática");
  assert.equal(wifi.shortLabel, "Travada");
  assert.match(keywordPlanLockHint(wifi), /^Agora: Travada · pelo volume medido\. /);

  const home = lerTrava(db, IDS.home);
  assert.equal(home?.kind === "plan" && home.state, "free", "medida 0: livre");

  const solta = lerTrava(db, IDS.solta);
  assert.deepEqual(solta && solta.kind === "no_plan" ? [solta.orphan, solta.reason] : null, [false, PLAN_LOCK_CADASTRO_REFUSAL]);
  assert.deepEqual(planLockChange(solta!, "locked"), { ok: false, reason: "Para travar, cadastre o artigo em Cadastrar Assuntos." });
  assert.deepEqual(planLockChange(solta!, "free"), { ok: true, changed: false }, "fora de plano já é livre");

  const orfa = lerTrava(db, IDS.orfa);
  assert.equal(orfa?.kind === "no_plan" && orfa.orphan, true);
  assert.equal(orfa?.kind === "no_plan" && orfa.reason, PLAN_LOCK_ORPHAN_REFUSAL);

  assert.equal(lerTrava(db, IDS.pagina), null, "publicada: o posto é o da publicação");

  const principal = lerTrava(db, IDS.principalAnterior);
  assert.equal(principal?.kind === "plan" && principal.subjectKeywordId, IDS.assuntoAnterior, "formato anterior: a trava mora na linha do Assunto");
  assert.equal(principal?.kind === "plan" && principal.origin, "declared");
  assert.equal(principal?.kind === "plan" && principal.title, "planos de internet em sp");
});

test("Vínculo com o contexto do plano: coluna 'Travada · Artigo · …', select na trava; sem contexto, o objeto de antes", async () => {
  const db = await comPlano();
  const row = linha(db, IDS.wifi);
  const plan = { keywordId: IDS.wifi, keyword: "wi-fi lento", volume: { validated: true, value: 1900 }, subjectSemanticOf: (id: string) => (linha(db, id)?.analise_semantica ?? null) as Row | null };
  const comTrava = resolveKeywordVinculo({ status: String(row.status), semantic: row.analise_semantica as Row, plan });
  assert.equal(comTrava.postLabel, "Travada");
  assert.equal(comTrava.postLocked, true);
  assert.match(keywordVinculoChoicesSummary(comTrava), /^Travada · Artigo · /);
  assert.equal(vinculoSelectValues(comTrava).post, "auto", "o select mostra Automática (o valor gravado), o efetivo vai na dica");

  const semContexto = resolveKeywordVinculo({ status: String(row.status), semantic: row.analise_semantica as Row });
  assert.equal(semContexto.postLabel, "Livre");
  assert.equal("planLock" in semContexto || "postLocked" in semContexto, false, "o Arquiteto e os demais leitores não mudam");

  const publicada = linha(db, IDS.pagina);
  const pub = resolveKeywordVinculo({ status: String(publicada.status), semantic: publicada.analise_semantica as Row, plan: { ...plan, keywordId: IDS.pagina } });
  assert.equal(pub.postLabel, "Travado ao slug", "publicada inalterada");
  assert.equal(pub.planLock, undefined);

  assert.deepEqual(VINCULO_PLAN_LOCK_SELECT_OPTIONS.map(option => [option.value, option.label]), [
    ["locked", "Travada (principal fixa no artigo)"],
    ["reviewable", "Livre (o Arquiteto pode trocar)"],
    ["auto", "Automática (pelo volume)"],
  ]);
  assert.equal(planLockChoiceOfPostValue("reviewable"), "free");
  assert.equal(vinculoSelectToBatchChoice("post", "auto"), "post:auto");
  assert.deepEqual(vinculoBatchActionFromChoice("post:auto"), { kind: "post", policy: "auto" });
});

test("núcleo: travar a keyword do plano grava plan.lock pelo cadastro, nova versão do plano, releitura; os outros artigos não mudam", async () => {
  const db = await comPlano();
  const versaoAntes = Number(db.tables.editorial_groups.find(row => row.id === AZUL)!.plan_version);
  const wifiAntes = JSON.stringify(linha(db, IDS.wifi).analise_semantica);

  const previa = await trava(db, IDS.home, "locked", "preview");
  assert.ok(previa.ok);
  if (!previa.ok) return;
  assert.equal(previa.items[0].outcome, "changed");
  assert.equal(previa.items[0].before?.label, "Livre · sem volume medido");
  assert.equal(previa.items[0].after?.label, "Travada · escolhida à mão");
  assert.equal(previa.items[0].approvedToReview, 1, "a aprovada volta a Em revisão");
  assert.equal(Number(db.tables.editorial_groups.find(row => row.id === AZUL)!.plan_version), versaoAntes, "prévia não grava");

  const gravado = await trava(db, IDS.home, "locked");
  assert.ok(gravado.ok, JSON.stringify(gravado));
  if (!gravado.ok) return;
  assert.equal(gravado.items[0].outcome, "changed", JSON.stringify(gravado.items));
  assert.equal(gravado.items[0].after?.label, "Travada · escolhida à mão");
  assert.equal(gravado.architectHint, PLAN_LOCK_ARCHITECT_HINT);
  const plano = resolveKeywordSubject(linha(db, IDS.home).analise_semantica as Row).plan;
  assert.equal(plano?.lock, "locked", "plan.lock gravado na keyword (releitura)");
  assert.equal(plano?.planVersion, versaoAntes + 1, "nova versão do plano");
  assert.deepEqual(gravado.planVersions, [{ groupId: AZUL, planVersion: versaoAntes + 1 }]);
  assert.equal(resolveDeclaredPrincipal(linha(db, IDS.home).analise_semantica as Row).mark?.planVersion, versaoAntes + 1, "a marca recíproca acompanha");
  assert.equal(JSON.stringify(linha(db, IDS.wifi).analise_semantica), wifiAntes, "o artigo que não mudou fica como está");
  assert.equal(resolveKeywordSubject(linha(db, IDS.home).analise_semantica as Row).entry?.title, "Internet para home office: qual velocidade?", "o Assunto continua na keyword");

  const deNovo = await trava(db, IDS.home, "locked");
  assert.ok(deNovo.ok && deNovo.items[0].outcome === "unchanged", "repetir não regrava");

  const automatica = await trava(db, IDS.home, "auto");
  assert.ok(automatica.ok && automatica.items[0].outcome === "changed");
  assert.equal(resolveKeywordSubject(linha(db, IDS.home).analise_semantica as Row).plan?.lock, undefined, "Automática tira a trava manual");
  assert.ok(automatica.ok && automatica.items[0].after?.label === "Livre · sem volume medido");
});

test("núcleo: recusa por item, com o motivo — sem plano, marca órfã, publicada, outra marca; nada é gravado nelas", async () => {
  const db = await comPlano();
  const antes = JSON.stringify(db.tables.minerador_keywords.filter(row => [IDS.solta, IDS.orfa, IDS.pagina].includes(String(row.id))));
  const outraMarca = "90000000-0000-4000-8000-000000000001";
  const result = await trava(db, IDS.solta, "locked", "apply", [IDS.solta, IDS.orfa, IDS.pagina, outraMarca, IDS.wifi]);
  assert.ok(result.ok);
  if (!result.ok) return;
  const por = new Map(result.items.map(item => [item.keywordId, item]));
  assert.deepEqual([por.get(IDS.solta)?.outcome, por.get(IDS.solta)?.reason], ["refused", PLAN_LOCK_CADASTRO_REFUSAL]);
  assert.deepEqual([por.get(IDS.orfa)?.outcome, por.get(IDS.orfa)?.reason], ["refused", PLAN_LOCK_ORPHAN_REFUSAL]);
  assert.deepEqual([por.get(IDS.pagina)?.outcome, por.get(IDS.pagina)?.reason], ["refused", PLAN_LOCK_PUBLISHED_REFUSAL]);
  assert.equal(por.get(outraMarca)?.outcome, "refused", "keyword de outra marca nunca é lida como desta");
  assert.equal(por.get(IDS.wifi)?.outcome, "changed", "a do plano grava no mesmo pedido");
  assert.equal(result.counts.refused, 4);
  assert.equal(JSON.stringify(db.tables.minerador_keywords.filter(row => [IDS.solta, IDS.orfa, IDS.pagina].includes(String(row.id)))), antes);
  assert.deepEqual(db.tables.minerador_keywords.find(row => row.id === outraMarca)!.analise_semantica, {});
});

test("núcleo: formato anterior — pela principal, a trava vai para a linha do Assunto; a principal recebe a marca da versão nova", async () => {
  const db = marca();
  const result = await trava(db, IDS.principalAnterior, "free");
  assert.ok(result.ok, JSON.stringify(result));
  if (!result.ok) return;
  assert.equal(result.items[0].outcome, "changed", JSON.stringify(result.items));
  assert.equal(result.items[0].subjectKeywordId, IDS.assuntoAnterior);
  assert.equal(result.items[0].before?.label, "Travada · declarada antes do cadastro único");
  assert.equal(result.items[0].after?.label, "Livre · escolhida à mão");
  assert.equal(result.items[0].approvedToReview, 1);
  const plano = resolveKeywordSubject(linha(db, IDS.assuntoAnterior).analise_semantica as Row).plan;
  assert.equal(plano?.lock, "free");
  assert.equal(plano?.declaredPrincipal?.keywordId, IDS.principalAnterior, "a principal continua a mesma");
  assert.equal(resolveDeclaredPrincipal(linha(db, IDS.principalAnterior).analise_semantica as Row).mark?.planVersion, plano?.planVersion);
  assert.equal(db.tables.minerador_keywords.filter(row => row.brand_id === BRAND).length, 7, "nenhuma linha nova nasce");
});

test("lote: o Posto vale por item — trava pedida ao cadastro, publicada no posto de sempre, recusa nomeada sem plano (nunca pulada calada)", async () => {
  const db = await comPlano();
  const rows = db.tables.minerador_keywords.filter(row => row.brand_id === BRAND) as unknown as VinculoBatchKeyword[];
  const byId = new Map(rows.map(row => [row.id, row]));
  const selecionadas = [IDS.home, IDS.solta, IDS.pagina, IDS.principalAnterior, IDS.assuntoAnterior].map(id => byId.get(id)!);
  const plan = planVinculoBatch({ keywords: selecionadas, brandId: BRAND, action: { kind: "post", policy: "locked" }, actorId: ACTOR, changedAt: AT, keywordOf: id => byId.get(id) });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  // A escolha é a trava MANUAL: "Travada" fixa à mão até no que hoje está travado pela declaração ou pelo volume.
  assert.deepEqual(plan.planLocks.map(entry => [entry.keyword, entry.lock, entry.fromLabel]), [
    ["internet para home office", "locked", "Livre · sem volume medido"],
    ["planos de internet", "locked", "Travada · declarada antes do cadastro único"],
  ]);
  assert.equal(plan.updates.length, 0, "a publicada já está travada ao slug");
  assert.equal(plan.counts.no_plan, 1);
  assert.equal(plan.counts.unchanged, 1);
  assert.equal(plan.counts.same_article, 1, "o Assunto do formato anterior e a principal são o mesmo artigo");
  assert.equal(plan.counts.not_published, 0, "não publicada não é mais pulada");
  const texto = describeVinculoBatchConfirmation(plan);
  assert.equal(texto.summary, "Posto: Travada: 2 keywords serão gravadas.");
  assert.ok(texto.details.some(detail => detail.startsWith('2 keywords do plano mudam de trava pelo cadastro (nova versão do plano): "internet para home office" (Livre · sem volume medido), "planos de internet" (Travada · declarada antes do cadastro único).')), JSON.stringify(texto.details));
  assert.ok(texto.details.includes('1 recusada ("roteador mesh"): Para travar, cadastre o artigo em Cadastrar Assuntos.'), JSON.stringify(texto.details));
  assert.equal(texto.warning, "2 aprovadas desta seleção vão para Em revisão.");

  // Livre na publicada grava o posto de sempre; nas do plano, a trava; Automática na publicada é recusada.
  const livre = planVinculoBatchChoices({ keywords: selecionadas, brandId: BRAND, actions: [{ kind: "post", policy: "reviewable" }], actorId: ACTOR, changedAt: AT, keywordOf: id => byId.get(id) });
  assert.ok(livre.ok);
  if (!livre.ok) return;
  assert.deepEqual(livre.updates.map(update => [update.id, update.semantic.primary_keyword_policy]), [[IDS.pagina, "reviewable"]]);
  assert.deepEqual(livre.planLocks.map(entry => [entry.id, entry.lock]), [[IDS.home, "free"], [IDS.principalAnterior, "free"]], "duas keywords do mesmo artigo: a trava é pedida uma vez");
  assert.equal(livre.steps[0].counts.same_article, 1);
  assert.equal(livre.counts.planLocks, 2);
  const auto = planVinculoBatch({ keywords: [byId.get(IDS.pagina)!], brandId: BRAND, action: { kind: "post", policy: "auto" }, actorId: ACTOR, changedAt: AT });
  assert.ok(auto.ok && auto.counts.published_auto === 1 && auto.updates.length === 0);

  // O painel em grupo sabe que select mostrar.
  const ctx = (item: { id?: string }) => ({ keywordId: item.id ?? "", subjectSemanticOf: (id: string) => (byId.get(id)?.analise_semantica ?? null) as Row | null });
  assert.equal(commonVinculoSelectValues([byId.get(IDS.home)!, byId.get(IDS.solta)!], ctx).postMode, "plan");
  assert.equal(commonVinculoSelectValues([byId.get(IDS.home)!, byId.get(IDS.pagina)!], ctx).postMode, "mixed");
  assert.equal(commonVinculoSelectValues([byId.get(IDS.pagina)!], ctx).postMode, "slug");
  assert.equal("postMode" in commonVinculoSelectValues([byId.get(IDS.pagina)!]), false, "sem contexto, o objeto de antes");
});

test("cabeçalho e linha: o Assunto em uma linha (título, papel/posição, cor); marca órfã diz que o Assunto saiu", async () => {
  const db = await comPlano();
  const groupOf = (id: string) => (id === AZUL ? { color: "azul", name: "Wi-Fi e fibra óptica" } : id === LARANJA ? { color: "laranja", name: "Planos e contratação" } : null);
  const view = (id: string) => {
    const row = linha(db, id);
    return resolveSubjectArticleView({ keywordId: id, keyword: String(row.keyword), semantic: row.analise_semantica as Row, groupOf, keywordTextOf: other => String(linha(db, other)?.keyword ?? ""), subjectSemanticOf: other => (linha(db, other)?.analise_semantica ?? null) as Row | null });
  };
  const fibra = db.tables.minerador_keywords.find(row => row.keyword === "internet fibra óptica" && row.brand_id === BRAND)!;
  const pilar = subjectHeadline(view(String(fibra.id)));
  assert.deepEqual(pilar && [pilar.text, pilar.position, pilar.group?.color, pilar.tone], ["Assunto: Internet fibra óptica ou internet comum: qual a diferença?", "Pilar · artigo 9", "azul", "subject"]);
  const anterior = subjectHeadline(view(IDS.principalAnterior));
  assert.deepEqual(anterior && [anterior.text, anterior.position, anterior.group?.color], ["Assunto: planos de internet em sp", "Pilar · artigo 1", "laranja"], "a principal do formato anterior mostra o artigo dela");
  const orfa = subjectHeadline(view(IDS.orfa));
  assert.equal(orfa?.tone, "warning");
  assert.match(orfa!.text, /^Assunto retirado desta keyword/);
  assert.equal(subjectHeadline(view(IDS.solta)), null, "keyword sem Assunto: nada na linha");
});

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

test("tela: Revisão com a trava na não publicada, cabeçalho e linha com o Assunto, rota, MCP e catálogo no mesmo núcleo", () => {
  const read = (path: string) => stripComments(readFileSync(new URL(path, import.meta.url), "utf8"));
  const panels = read("../components/editorial/dna-panels.tsx");
  const workspace = read("../modules/minerador/minerador-workspace.tsx");
  const route = read("../app/api/minerador/marcas/[brandId]/plans/lock/route.ts");
  const mcp = read("../lib/server/platform-mcp-tools.ts");
  const catalog = read("../lib/agent/platform-catalog.ts");

  const review = panels.slice(panels.indexOf("function HumanReviewPanel("), panels.indexOf("export function SubjectArticleBlock("));
  assert.match(review, /mode="plan"[\s\S]{0,400}hint=\{keywordPlanLockHint\(planLock\)\}[\s\S]{0,300}type: "plan_lock", lock/, "o mesmo select, no modo trava, com o valor efetivo e o porquê");
  assert.match(review, /type: "primary_policy", policy: value/, "a publicada continua com o posto de sempre");
  const header = panels.slice(panels.indexOf('aria-label="Perfil da keyword"'), panels.indexOf("<ProfileStepStrip"));
  assert.ok(header.indexOf("data-profile-subject-headline") > 0 && header.indexOf("data-profile-subject-headline") < header.indexOf("{keyword.keyword}</h2>"), "o Assunto fica acima do nome da keyword");
  assert.match(header, /<EditorialGroupTag name=\{subjectHeader\.group\.name\} color=\{subjectHeader\.group\.color\} \/>/);
  const headline = header.slice(header.indexOf("data-profile-subject-headline"), header.indexOf("</p>", header.indexOf("data-profile-subject-headline")));
  assert.match(headline, /text-base/);
  assert.doesNotMatch(headline, /text-xs|text-\[(?:9|10|11|12|13)px\]|bg-(?:black|white)\b|#[0-9a-f]{3,6}/i, "14px ou mais, tokens");

  assert.match(workspace, /data-processor-subject-title=\{rowSubjectHeadline\.kind\}[\s\S]{0,200}title=\{[\s\S]{0,200}className=\{`mt-0\.5 truncate text-sm/, "uma linha, truncável, com title");
  assert.match(workspace, /action\.type === "plan_lock"[\s\S]{0,200}handleKeywordPlanLockChange\(item, action\.lock\)/);
  assert.match(workspace, /fetch\(`\/api\/minerador\/marcas\/\$\{selectedBrandId\}\/plans\/lock`/);
  assert.match(workspace, /resolveKeywordVinculo\(\{ status: item\.status, semantic: item\.analise_semantica, plan: vinculoPlanContextOf\(item\) \}\)/);
  assert.doesNotMatch(workspace, /data-processor-subject-title[^\n]*text-xs/);

  assert.match(route, /setKeywordPlanLockWithCore\(/);
  assert.match(route, /action: "edit"/);
  const lockCore = read("../lib/minerador/declared-plan-import-core.ts");
  const fn = lockCore.slice(lockCore.indexOf("export async function setKeywordPlanLockWithCore("));
  assert.match(fn, /importDeclaredPlanWithCore\(\{[\s\S]{0,400}destination: \{ kind: "existing_silo", groupId \}/, "um caminho só: o núcleo do cadastro");
  assert.doesNotMatch(fn, /\.delete\(|\.update\(/, "o núcleo da trava não grava por fora do cadastro");

  const vinculo = mcp.slice(mcp.indexOf('registerTool("set_keyword_vinculo"'), mcp.indexOf("registerTool(", mcp.indexOf('registerTool("set_keyword_vinculo"') + 30));
  assert.match(vinculo, /kind: z\.literal\("plan_lock"\), lock: z\.enum\(DECLARED_PLAN_LOCK_CHOICES\)/);
  const guarda = vinculo.indexOf("!userConfirmation || !decisionHash");
  const ramo = vinculo.indexOf('if (action.kind === "plan_lock")');
  assert.ok(guarda > 0 && ramo > guarda, "aceite e hash antes da trava");
  assert.ok(vinculo.indexOf("decisionHash !== currentDecisionHash", ramo) < vinculo.indexOf('mode: "apply", keywordIds, lock: action.lock', ramo), "hash conferido antes de gravar");

  assert.match(catalog, /routes: \["\/api\/minerador\/marcas\/\[brandId\]\/plans\/lock"\]/);
  assert.match(catalog, /POSTO DE PRINCIPAL = TRAVA DO CADASTRO/);
});
