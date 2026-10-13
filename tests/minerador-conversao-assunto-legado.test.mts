import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveDeclaredPrincipal, resolveKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import { importDeclaredPlanWithCore } from "../lib/minerador/declared-plan-import-core.ts";
import { convertedTitleIndex, isConvertibleLegacySubject, readSubjectConversion, setSubjectConversion, SUBJECT_CONVERSION_KEY } from "../lib/minerador/subject-conversion.ts";
import { buildConversionDraft } from "../lib/minerador/subject-conversion-draft.ts";
import { convertLegacySubjectsWithCore, readConversionDraftWithCore, runConversionFollowUp, type ConversionFollowUp, type ConversionRowInput } from "../lib/minerador/subject-conversion-core.ts";
import { resolveSubjectArticleView } from "../lib/minerador/subject-article-view.ts";
import { PlanFakeDb, type Row } from "./plano-declarado-fake-db.mts";

/*
 * CONVERTER O ASSUNTO DO FORMATO ANTERIOR (SDD
 * `docs/compartilhado/sdd-conversao-assunto-legado-2026-10-13.md`).
 * Fixture no formato da WifiConecta (grupo laranja, sem plano; Assuntos como
 * linha própria, já no Arquiteto). Sem rede, sem provider: nenhuma chamada paga.
 */

const ACTOR = "d67ebbad-a590-45f8-8bb5-a19c6241ac1b";
const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const OTHER_BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const LARANJA = "a9d5c87b-59aa-4e49-8357-3fa893d4cd2d";
const AZUL = "07fec332-4b0a-43cb-af19-cedfd9b24897";
const AT = "2026-10-13T12:00:00.000Z";
const MEDIDA = (volume: number) => ({ volume_measurement: { provider: "google_ads", averageMonthlySearches: volume, measuredAt: "2026-10-10T10:00:00+00:00" } });

const T1 = "6d5d87cd-3f0f-4431-bef4-81285715db0e"; // Claro, Vivo ou TIM… (Pilar do Silo)
const T2 = "4ac4d315-59f8-404d-bcb9-638b7d730b68"; // Internet residencial sem fidelidade…
const T3 = "9df07c7b-16ae-414e-aadc-9f460c5f537b"; // Internet de 300… Mega (sem artigo)
const K1 = "3048743b-0000-4000-8000-000000000001"; // claro ou vivo
const K2 = "e764443e-0000-4000-8000-000000000002"; // internet residencial sem fidelidade
const S1 = "258696eb-0000-4000-8000-000000000003"; // vivo ou claro (secundária do artigo 1)
const MEGA = "f7a6c14b-0000-4000-8000-000000000004"; // quantos Mega de internet preciso (bruta)
const VIVO_CONTROLE = "679b1bb2-c0b8-40a0-bf18-07600d2cb92f"; // artigo de território sem Assunto
const TERRITORIO_ARTIGO = `article-candidate:territory:9c75c3a7-15e1-4655-b627-c08e394b4606:${VIVO_CONTROLE}`;
const SILO_ID = "territory:9c75c3a7-15e1-4655-b627-c08e394b4606";

const titulo = { keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null }, keyword_subject_actor: ACTOR, keyword_subject_at: "2026-10-12T16:00:00+00:00", keyword_subject_origin: "import" };
const logica = { dna_origem: "logico_deterministico", intencao_principal: "Comercial" };

function artigo(entity: string, version: number, principal: string, secondaries: string[], subject: string | null, extra: Row = {}): Row {
  return {
    marca_id: BRAND, artifact_type: "article_dna", entity_id: entity, version_number: version, created_at: AT,
    payload: { articleId: entity, principalKeywordId: principal, secondaryKeywordIds: secondaries, narrativeReinforcementIds: [], hierarchy: "Suporte", promise: `Cobrir com clareza o tema “${principal}”.`, ...(subject ? { subject: { keywordId: subject, phrase: "x" } } : {}), ...extra },
  };
}

function marca(): PlanFakeDb {
  const kw = (id: string, keyword: string, extra: Row = {}): Row => ({ id, keyword, brand_id: BRAND, status: "aprovado", group_id: LARANJA, deleted_at: null, volume_search: null, results_allintitle: null, analise_semantica: { ...logica }, ...extra });
  return new PlanFakeDb({
    editorial_groups: [
      { id: LARANJA, marca_id: BRAND, name: "laranja", color: "laranja", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT, created_at: AT },
      { id: AZUL, marca_id: BRAND, name: "Wi-Fi e fibra óptica", color: "azul", origin: "declared_plan", status: "active", plan: { siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra", objective: "x", articleCount: 7 }, plan_version: 1, plan_hash: "h", silo_id: null, lock_version: 1, updated_at: AT, created_at: AT },
    ],
    editorial_group_events: [],
    editorial_group_articles: [],
    brand_site_catalog_entries: [],
    minerador_keywords: [
      kw(T1, "Claro, Vivo ou TIM: qual internet residencial escolher?", { analise_semantica: { ...logica, ...titulo, keyword_page_type: "article" } }),
      kw(T2, "Internet residencial sem fidelidade: quais são as vantagens e desvantagens?", { analise_semantica: { ...logica, ...titulo } }),
      kw(T3, "Internet de 300, 500, 600 Mega ou 1 Giga: qual velocidade contratar?", { analise_semantica: { ...logica, ...titulo } }),
      kw(K1, "claro ou vivo", { volume_search: 590, analise_semantica: { ...logica, ...MEDIDA(590), subject_discovery: { subjectKeywordIds: [T1] } } }),
      kw(K2, "internet residencial sem fidelidade", { volume_search: 170, analise_semantica: { ...logica, ...MEDIDA(170) } }),
      kw(S1, "vivo ou claro", { volume_search: 590, analise_semantica: { ...logica, ...MEDIDA(590), subject_discovery: { subjectKeywordIds: [T1] } } }),
      kw(MEGA, "quantos Mega de internet preciso", { status: "bruto", analise_semantica: { ...logica } }),
      kw(VIVO_CONTROLE, "plano vivo controle", { volume_search: 49500, analise_semantica: { ...logica, ...MEDIDA(49500) } }),
      // Outra marca com a MESMA frase: nunca é lida nem tocada.
      { id: "90000000-0000-4000-8000-000000000001", keyword: "claro ou vivo", brand_id: OTHER_BRAND, status: "aprovado", group_id: null, deleted_at: null, analise_semantica: { ...titulo } },
    ],
    editorial_artifact_versions: [
      artigo(T1, 1, K1, [], T1),
      artigo(T1, 3, K1, [S1], T1),
      artigo(T2, 1, K2, [], T2),
      artigo(TERRITORIO_ARTIGO, 1, VIVO_CONTROLE, [], null),
      { marca_id: BRAND, artifact_type: "silo_dna", entity_id: SILO_ID, version_number: 1, created_at: AT, payload: { siloId: SILO_ID, name: "planos de internet", objective: "Construir autoridade em planos de internet.", pillarArticleId: T1, narrativeOrder: [T1, TERRITORIO_ARTIGO, T2], supportArticleIds: [TERRITORIO_ARTIGO, T2] } },
      { marca_id: BRAND, artifact_type: "silo_page", entity_id: `silo-page:${SILO_ID}`, version_number: 1, created_at: AT, payload: { siloId: SILO_ID, slug: "planos-de-internet" } },
      // Outra marca: nunca entra no rascunho.
      { marca_id: OTHER_BRAND, artifact_type: "article_dna", entity_id: "x", version_number: 9, created_at: AT, payload: { articleId: "x", principalKeywordId: "y", subject: { keywordId: T1 } } },
    ],
  });
}

const linha = (db: PlanFakeDb, id: string) => db.tables.minerador_keywords.find(row => row.id === id)!;

function chamadas() {
  const log: string[] = [];
  const followUp: ConversionFollowUp = {
    runLogic: async ids => { log.push(`logic:${[...ids].sort().join(",")}`); return { applied: 0, failed: 0 }; },
    approve: async ids => { log.push(`approve:${[...ids].sort().join(",")}`); return ids.map(id => ({ id, outcome: "applied" })); },
    send: async ids => { log.push(`send:${[...ids].sort().join(",")}`); return { importedKeywordIds: [...ids] }; },
  };
  return { log, followUp };
}

async function rascunho(db: PlanFakeDb) {
  const lido = await readConversionDraftWithCore({ brandId: BRAND, keywordsClient: db, groupsClient: db, groupId: LARANJA });
  assert.ok(lido.ok, lido.ok ? "" : lido.reason);
  return lido;
}

function linhasDe(draft: Awaited<ReturnType<typeof rascunho>>["draft"]): ConversionRowInput[] {
  return draft.rows.map(row => ({ fromKeywordId: row.fromKeywordId, articleId: row.articleId, order: row.order, role: row.role, title: row.title, keyword: row.suggestedKeyword ?? "", scope: row.scope, lock: "auto" }));
}

/* ----------------------------------------------------------------- domínio */

test("bloco de conversão: grava com ator, idempotente, recusa sem ator; malformado não vira conversão", () => {
  const conversao = { fromKeywordId: T1, fromPhrase: "Claro, Vivo ou TIM", articleId: T1 };
  const gravado = setSubjectConversion({}, { conversion: conversao, actorId: ACTOR, changedAt: AT });
  assert.ok(gravado.ok && gravado.changed);
  assert.equal(readSubjectConversion(gravado.semantic)?.fromKeywordId, T1);
  const denovo = setSubjectConversion(gravado.semantic, { conversion: conversao, actorId: ACTOR, changedAt: "2026-10-14T00:00:00Z" });
  assert.ok(denovo.ok && !denovo.changed, "a mesma conversão não regrava");
  assert.equal(setSubjectConversion({}, { conversion: conversao, actorId: "local-user", changedAt: AT }).ok, false);
  assert.equal(readSubjectConversion({ [SUBJECT_CONVERSION_KEY]: { fromKeywordId: "x" } }), null);
  const desfeito = setSubjectConversion(gravado.semantic, { conversion: null, actorId: ACTOR, changedAt: AT });
  assert.ok(desfeito.ok && desfeito.changed);
  assert.equal(readSubjectConversion(desfeito.semantic), null);
  assert.equal((desfeito.semantic.keyword_subject_conversion_history as unknown[]).length, 2, "histórico append-only");
});

test("índice T → K: só com a keyword viva carregando o Assunto (entry); desfeito, a linha-título volta a ser Assunto", () => {
  const k = { keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null, entry: { title: "Claro, Vivo ou TIM", source: "cadastro" } }, keyword_subject_conversion: { fromKeywordId: T1, fromPhrase: "Claro, Vivo ou TIM", articleId: T1, convertedAt: AT, actorId: ACTOR } };
  assert.equal(convertedTitleIndex([{ id: K1, keyword: "claro ou vivo", semantic: k }]).get(T1)?.keywordId, K1);
  assert.equal(convertedTitleIndex([{ id: K1, keyword: "claro ou vivo", semantic: { ...k, keyword_subject: null } }]).size, 0);
  assert.equal(isConvertibleLegacySubject(titulo), true);
  assert.equal(isConvertibleLegacySubject(k), false, "Assunto com entry não é formato anterior");
});

/* ---------------------------------------------------------------- rascunho */

test("rascunho do grupo laranja: K sugerida = principal vigente; secundária não pode; ordem e Pilar do SiloDNA; sem artigo sugere por termos", async () => {
  const db = marca();
  const lido = await rascunho(db);
  assert.equal(lido.group.hasPlan, false);
  assert.deepEqual(lido.draft.silo, { name: "planos de internet", slug: "planos-de-internet", objective: "Construir autoridade em planos de internet." });
  const [r1, r2, r3] = lido.draft.rows;
  assert.equal(r1.fromKeywordId, T1);
  assert.equal(r1.role, "Pilar");
  assert.equal(r1.suggestedKeywordId, K1);
  assert.equal(r1.articleVersion, 3, "a versão vigente do artigo");
  assert.equal(r1.options.find(option => option.keywordId === S1)?.allowed, false, "secundária do artigo não carrega o Assunto");
  assert.equal(r2.fromKeywordId, T2);
  assert.equal(r2.role, "Suporte");
  assert.equal(r2.suggestedKeywordId, K2);
  assert.equal(r3.fromKeywordId, T3);
  assert.equal(r3.articleId, null);
  assert.equal(r3.suggestedKeywordId, MEGA, "sem artigo: a keyword fora de artigo com mais termos em comum");
  assert.equal(lido.draft.outsidePlan.length, 1);
  assert.equal(lido.draft.outsidePlan[0].principal, "plano vivo controle");
  assert.equal(lido.draft.rows.some(row => row.title === "claro ou vivo"), false, "keyword de outra marca nunca entra");
  assert.match(r1.scope, /claro ou vivo|3048743b/);
});

/* ------------------------------------------------------- prévia e aplicar */

test("prévia não grava; aplicar grava o Assunto DENTRO da keyword com o plano do grupo, sem tocar a linha-título, e encadeia Lógica, aprovação e envio", async () => {
  const db = marca();
  const lido = await rascunho(db);
  const rows = linhasDe(lido.draft);
  const tituloAntes = JSON.stringify([linha(db, T1), linha(db, T2), linha(db, T3)]);
  const antes = JSON.stringify(db.tables);

  const previa = await convertLegacySubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "preview", groupId: LARANJA, silo: lido.draft.silo, rows, now: AT });
  assert.ok(previa.ok && previa.mode === "preview", previa.ok ? "" : `${previa.reason} ${(previa.blockers || []).join(" | ")}`);
  assert.equal(JSON.stringify(db.tables), antes, "a prévia não grava nada");
  assert.equal(previa.preview.canApply, true, previa.preview.blockers.join(" | "));
  assert.equal(previa.preview.articles[0].conversion?.fromKeywordId, T1);
  assert.equal(previa.preview.articles[0].shape, "cadastro");
  assert.ok(previa.preview.notices.some(notice => /arquivada \(não vai para a lixeira\)/.test(notice)));

  const { log, followUp } = chamadas();
  const aplicado = await convertLegacySubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "apply", groupId: LARANJA, silo: lido.draft.silo, rows, importRequestId: "00000000-0000-4000-8000-0000000000c1", followUp, now: AT });
  assert.ok(aplicado.ok && aplicado.mode === "apply", aplicado.ok ? "" : aplicado.reason);
  assert.equal(aplicado.applied.failed, 0, JSON.stringify(aplicado.applied.articles));
  for (const [k, t] of [[K1, T1], [K2, T2], [MEGA, T3]] as const) {
    const semantic = linha(db, k).analise_semantica as Record<string, unknown>;
    const assunto = resolveKeywordSubject(semantic);
    assert.equal(assunto.declared, true);
    assert.equal(assunto.entry?.title, linha(db, t).keyword, "o título é o texto da linha-título");
    assert.equal(assunto.plan?.declaredPrincipal?.keywordId, k, "a keyword carrega o Assunto (cadastro único)");
    assert.equal(resolveDeclaredPrincipal(semantic).mark?.subjectKeywordId, k);
    assert.equal(readSubjectConversion(semantic)?.fromKeywordId, t);
  }
  assert.equal(JSON.stringify([linha(db, T1), linha(db, T2), linha(db, T3)]), tituloAntes, "a linha-título NÃO é tocada (nem lixeira, nem regravação)");
  assert.equal(db.tables.minerador_keywords.length, 9, "nenhuma keyword some, nenhuma linha 'Assunto' nasce");
  const grupo = db.tables.editorial_groups.find(group => group.id === LARANJA)!;
  assert.equal(grupo.plan_version, 1);
  assert.equal((grupo.plan as { siloName?: string }).siloName, "planos de internet");
  assert.deepEqual(log, [`logic:${[K1, K2, MEGA].sort().join(",")}`, `approve:${[K1, K2, MEGA].sort().join(",")}`, `send:${[K1, K2, MEGA].sort().join(",")}`]);
  assert.match(aplicado.followUp.nextStep, /Atualizar o Assunto dos artigos/);
  assert.equal(linha(db, "90000000-0000-4000-8000-000000000001").analise_semantica && JSON.stringify(linha(db, "90000000-0000-4000-8000-000000000001").analise_semantica).includes("keyword_subject_conversion"), false, "outra marca intocada");

  // Repetir é seguro: nada é regravado.
  const depois = JSON.stringify(db.tables.minerador_keywords);
  const lido2 = await rascunho(db);
  assert.equal(lido2.draft.rows.length, 0, "convertidas saem do rascunho");
  assert.equal(lido2.draft.converted.length, 3);
  const repetido = await convertLegacySubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "apply", groupId: LARANJA, silo: null, rows, importRequestId: "00000000-0000-4000-8000-0000000000c2", followUp: chamadas().followUp, now: "2026-10-14T00:00:00Z" });
  assert.ok(repetido.ok && repetido.mode === "apply", repetido.ok ? "" : `${repetido.reason} ${(repetido.blockers || []).join(" | ")}`);
  assert.ok(repetido.applied.articles.every(article => article.outcome === "unchanged"), JSON.stringify(repetido.applied.articles));
  assert.equal(JSON.stringify(db.tables.minerador_keywords), depois, "idempotente: nenhuma escrita");
});

test("recusas: secundária do artigo, a própria linha-título, linha-título de outro grupo, linha já convertida para outra keyword", async () => {
  const db = marca();
  const lido = await rascunho(db);
  const rows = linhasDe(lido.draft);
  const comSecundaria = rows.map(row => row.fromKeywordId === T1 ? { ...row, keyword: "vivo ou claro" } : row);
  const r1 = await convertLegacySubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "preview", groupId: LARANJA, silo: lido.draft.silo, rows: comSecundaria, now: AT });
  assert.equal(r1.ok, false);
  assert.ok(!r1.ok && (r1.blockers || []).some(item => /secundária deste artigo/.test(item)));

  const propria = rows.map(row => row.fromKeywordId === T2 ? { ...row, keyword: linha(db, T2).keyword as string } : row);
  const r2 = await convertLegacySubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "preview", groupId: LARANJA, silo: lido.draft.silo, rows: propria, now: AT });
  assert.ok(r2.ok && r2.mode === "preview");
  assert.equal(r2.preview.canApply, false);
  assert.ok(r2.preview.blockers.some(item => /própria linha-título/.test(item)));

  const outroGrupo = await convertLegacySubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "preview", groupId: AZUL, silo: null, rows, now: AT });
  assert.equal(outroGrupo.ok, false);
  assert.ok(!outroGrupo.ok && /fora deste grupo/.test(outroGrupo.reason));

  // Converte T2 para K2 e tenta reconverter para outra keyword.
  const so2 = rows.filter(row => row.fromKeywordId === T1 || row.fromKeywordId === T2);
  const feito = await convertLegacySubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "apply", groupId: LARANJA, silo: lido.draft.silo, rows: so2, importRequestId: "00000000-0000-4000-8000-0000000000c3", followUp: null, now: AT });
  assert.ok(feito.ok && feito.mode === "apply", feito.ok ? "" : feito.reason);
  assert.match(feito.followUp.nextStep, /Aprove as keywords convertidas/, "sem followUp, diz o que falta");
  const outra = so2.map(row => row.fromKeywordId === T2 ? { ...row, articleId: null, keyword: "quantos Mega de internet preciso" } : row);
  const r4 = await convertLegacySubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "preview", groupId: LARANJA, silo: null, rows: outra, now: AT });
  assert.ok(r4.ok && r4.mode === "preview");
  assert.ok(r4.preview.blockers.some(item => /já foi convertida para "internet residencial sem fidelidade"/.test(item)), r4.preview.blockers.join(" | "));
});

test("cadastro comum nunca readota a linha-título convertida como Assunto anterior", async () => {
  const db = marca();
  const lido = await rascunho(db);
  const rows = linhasDe(lido.draft).filter(row => row.fromKeywordId !== T3);
  const feito = await convertLegacySubjectsWithCore({ brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "apply", groupId: LARANJA, silo: lido.draft.silo, rows, importRequestId: "00000000-0000-4000-8000-0000000000c4", followUp: null, now: AT });
  assert.ok(feito.ok);
  // Agora o dono cadastra, no Silo existente, o título de T2 com OUTRA keyword: o card diz que o Assunto já mora em K2.
  const previa = await importDeclaredPlanWithCore({
    brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "preview",
    plan: { silo: null, articles: [{ order: 3, subject: linha(db, T2).keyword as string, principal: "quantos Mega de internet preciso", role: "Suporte", scope: "x" }] },
    group: { mode: "existing", groupId: LARANJA }, destination: { kind: "existing_silo", groupId: LARANJA }, now: AT,
  });
  assert.ok(previa.ok && previa.mode === "preview");
  assert.equal(previa.articles[0].shape, "cadastro", "a linha-título convertida não volta a ser 'legacy'");
  assert.ok(previa.blockers.some(item => /já mora na keyword/.test(item)), previa.blockers.join(" | "));
});

test("follow-up: aprovação recusada não é enviada e o próximo passo diz o que falta; erro depois de gravar é retomável", async () => {
  const log: string[] = [];
  const parcial = await runConversionFollowUp([K1, K2], {
    runLogic: async () => ({ applied: 0, failed: 0 }),
    approve: async ids => ids.map(id => ({ id, outcome: id === K1 ? "applied" : "blocked", reason: "Falta a Lógica" })),
    send: async ids => { log.push(...ids); return { importedKeywordIds: ids }; },
  });
  assert.deepEqual(log, [K1]);
  assert.match(parcial.nextStep, /1 keyword\(s\) não foram aprovadas/);
  const quebrado = await runConversionFollowUp([K1], { runLogic: async () => { throw new Error("rede"); }, approve: async () => [], send: async () => ({ importedKeywordIds: [] }) });
  assert.equal(quebrado.error, "rede");
  assert.match(quebrado.nextStep, /nada é regravado/);
});

/* ------------------------------------------------------------------ painel */

test("painel do DNA: K mostra 'convertido de'; a linha-título convertida diz para onde o Assunto foi e avisa que excluir apaga de vez", () => {
  const k = { keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null, entry: { title: "Claro, Vivo ou TIM", source: "cadastro" } }, keyword_subject_conversion: { fromKeywordId: T1, fromPhrase: "Claro, Vivo ou TIM", articleId: T1, convertedAt: AT, actorId: ACTOR } };
  const viewK = resolveSubjectArticleView({ keywordId: K1, keyword: "claro ou vivo", semantic: k });
  assert.ok(viewK && viewK.kind === "subject");
  assert.deepEqual(viewK.convertedFrom, { keywordId: T1, phrase: "Claro, Vivo ou TIM" });
  const viewT = resolveSubjectArticleView({ keywordId: T1, keyword: "Claro, Vivo ou TIM", semantic: titulo, convertedTo: { keywordId: K1, keyword: "claro ou vivo" } });
  assert.ok(viewT && viewT.kind === "converted_title");
  assert.match(viewT.hint, /não a exclua/);
  // Sem conversão, a vista é a de sempre (sem campo novo).
  const semConversao = resolveSubjectArticleView({ keywordId: T1, keyword: "Claro, Vivo ou TIM", semantic: titulo });
  assert.ok(semConversao && semConversao.kind === "subject" && !("convertedFrom" in semConversao));
});

/* ---------------------------------------------------------- estrutura */

function semComentarios(fonte: string) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("a conversão nunca chama a exclusão de keyword; a rota passa pelo núcleo e pelos follow-ups de sempre", () => {
  const arquivos = ["lib/minerador/subject-conversion.ts", "lib/minerador/subject-conversion-core.ts", "lib/minerador/subject-conversion-draft.ts", "lib/server/minerador-subject-conversion.ts", "app/api/minerador/marcas/[brandId]/plans/convert/route.ts", "modules/minerador/subject-conversion-dialog.tsx"];
  for (const arquivo of arquivos) {
    const fonte = semComentarios(readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8"));
    assert.doesNotMatch(fonte, /lifecycle_delete_minerador_keywords|keywords\/delete|\.delete\(|deleted_at:\s*new|purge/, arquivo);
  }
  const rota = semComentarios(readFileSync(new URL("../app/api/minerador/marcas/[brandId]/plans/convert/route.ts", import.meta.url), "utf8"));
  assert.match(rota, /convertLegacySubjectsWithCore\(/);
  assert.match(rota, /serverConversionFollowUp\(/);
  assert.match(rota, /action: "approve"/, "converter aprova: exige a permissão de aprovação");
  const nucleo = semComentarios(readFileSync(new URL("../lib/minerador/subject-conversion-core.ts", import.meta.url), "utf8"));
  assert.match(nucleo, /importDeclaredPlanWithCore\(/, "o MESMO núcleo do card");
  const servidor = semComentarios(readFileSync(new URL("../lib/server/minerador-subject-conversion.ts", import.meta.url), "utf8"));
  assert.match(servidor, /runKeywordLogicWithCore\(/);
  // SDD acelerar 2026-10-13, item 2 (mudança declarada): aprovar e enviar saem do encadeamento único.
  assert.match(servidor, /approveKeywordsOnServer\(brandId, actorId, keywordIds\)/);
  assert.match(servidor, /sendKeywordsToArquitetoOnServer\(brandId, actorId, keywordIds\)/);
  const encadeamento = semComentarios(readFileSync(new URL("../lib/server/minerador-approve-and-send.ts", import.meta.url), "utf8"));
  assert.match(encadeamento, /applyKeywordDecisionEntries\(/);
  assert.match(encadeamento, /createMineradorArquitetoHandoff\(/);
  assert.doesNotMatch(encadeamento, /lifecycle_delete_minerador_keywords|keywords\/delete|\.delete\(|deleted_at:\s*new|purge/);
  assert.doesNotMatch(semComentarios(readFileSync(new URL("../lib/minerador/declared-plan-import-core.ts", import.meta.url), "utf8")), /lixeira se quiser \(recuperável\)/, "o aviso da sobra não promete recuperação que não existe");
});

test("entregáveis intocados: CSV 'Para escrever', artigo-modelo, MCP do Redator e Redator não leem a conversão", () => {
  const entregaveis = ["lib/radar/article-blueprint.ts", "lib/radar/human-voice-guideline.ts", "lib/radar/publication-identity.ts"];
  for (const arquivo of entregaveis) {
    const fonte = readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8");
    assert.doesNotMatch(fonte, /subject-conversion|keyword_subject_conversion/, arquivo);
  }
});
