import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  declaredPrincipalLock,
  hasLockingVolume,
  lockedDeclaredPrincipal,
  parseDeclaredPlanText,
  readDeclaredPlanLockChoice,
} from "../lib/minerador/declared-plan.ts";
import { resolveDeclaredPrincipal, resolveKeywordSubject, setKeywordSubject, subjectPhraseOf } from "../lib/minerador/keyword-subject.ts";
import { importDeclaredPlanWithCore, readDeclaredPlanCardRows } from "../lib/minerador/declared-plan-import-core.ts";
import { PlanFakeDb, type Row } from "./plano-declarado-fake-db.mts";

/*
 * CADASTRO ÚNICO — O ASSUNTO MORA NA KEYWORD (SDD
 * `docs/compartilhado/sdd-cadastro-assunto-na-keyword-2026-10-13.md`).
 * Fixture: o Silo 2 que o dono vai cadastrar na WifiConecta. Sem rede, sem
 * provider: REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const SILO_2 = `Silo 2 — Wi-Fi, fibra óptica e qualidade da internet
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

const ACTOR = "d67ebbad-a590-45f8-8bb5-a19c6241ac1b";
const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const OTHER_BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const LARANJA = "a9d5c87b-59aa-4e49-8357-3fa893d4cd2d";
const AZUL = "22222222-3333-4444-8555-666666666666";
const AT = "2026-10-13T12:00:00.000Z";
const MEDIDA = (volume: number) => ({ volume_measurement: { provider: "google_ads", averageMonthlySearches: volume, measuredAt: "2026-10-10T10:00:00+00:00" } });
const PAGINA_URL = "https://wificonecta.com.br/fibra-empresarial/";

function marca(): PlanFakeDb {
  const kw = (id: string, keyword: string, extra: Row = {}): Row => ({ id, keyword, brand_id: BRAND, status: "bruto", group_id: null, deleted_at: null, volume_search: null, results_allintitle: null, analise_semantica: { dna_origem: "logico_deterministico" }, ...extra });
  return new PlanFakeDb({
    editorial_groups: [
      { id: LARANJA, marca_id: BRAND, name: "Planos e contratação", color: "laranja", origin: "declared_plan", status: "active", plan: { siloName: "Planos e contratação", siloSlug: "planos-de-internet", objective: "x", articleCount: 8 }, plan_version: 1, plan_hash: "h1", silo_id: null, lock_version: 1, updated_at: AT, created_at: AT },
      { id: AZUL, marca_id: BRAND, name: "azul", color: "azul", origin: "manual", status: "active", plan: null, plan_version: 0, plan_hash: null, silo_id: null, lock_version: 1, updated_at: AT, created_at: AT },
    ],
    editorial_group_events: [],
    editorial_group_articles: [],
    brand_site_catalog_entries: [],
    minerador_keywords: [
      // "Wi-Fi lento" já existe e tem volume medido no Google Ads: entra TRAVADA.
      kw("40000000-0000-4000-8000-000000000001", "wi-fi lento", { volume_search: 1900, analise_semantica: { dna_origem: "logico_deterministico", ...MEDIDA(1900) } }),
      // Medida com 0: conta como sem volume (livre).
      kw("40000000-0000-4000-8000-000000000002", "internet para home office", { volume_search: 0, analise_semantica: { dna_origem: "logico_deterministico", ...MEDIDA(0) } }),
      // A página publicada (Vínculo formal) do destino "artigo publicado".
      kw("50000000-0000-4000-8000-000000000001", "internet fibra empresarial", { status: "aprovado", analise_semantica: { site_origin: { publicationStatus: "published", sourceUrl: PAGINA_URL, resolvedUrl: PAGINA_URL, canonicalUrl: PAGINA_URL, urlSituation: "canonical_confirmed", lastCheckedAt: "2026-09-20T10:00:00Z", publicationConfirmedBy: ACTOR, publicationConfirmedAt: "2026-09-20T10:00:00Z" } } }),
      // Outra marca com a MESMA frase: nunca é lida nem tocada.
      { id: "90000000-0000-4000-8000-000000000001", keyword: "internet fibra óptica", brand_id: OTHER_BRAND, status: "bruto", group_id: null, deleted_at: null, analise_semantica: {} },
    ],
  });
}

const core = (db: PlanFakeDb, extra: Partial<Parameters<typeof importDeclaredPlanWithCore>[0]> = {}) => importDeclaredPlanWithCore({
  brandId: BRAND, actorUserId: ACTOR, keywordsClient: db, groupsClient: db, mode: "preview", text: SILO_2,
  group: { mode: "new", color: "azul", name: null }, destination: { kind: "new_silo" }, now: AT, brandSiteUrl: "https://wificonecta.com.br", ...extra,
});
const linha = (db: PlanFakeDb, keyword: string) => db.tables.minerador_keywords.find(row => String(row.keyword).toLowerCase() === keyword.toLowerCase() && row.brand_id === BRAND);

test("parser: o Silo 2 vira 7 artigos (9 a 15), Pilar no 9, e a linha \"Trava:\" é lida", () => {
  const plano = parseDeclaredPlanText(SILO_2);
  assert.deepEqual(plano.refusals, []);
  assert.equal(plano.articles.length, 7);
  assert.deepEqual(plano.articles.map(article => article.order), [9, 10, 11, 12, 13, 14, 15]);
  assert.equal(plano.articles[0].role, "Pilar");
  assert.equal(plano.articles[0].principal, "internet fibra óptica");
  assert.equal(plano.silo.name, "Wi-Fi e fibra óptica");
  assert.equal(plano.silo.slug, "wifi-e-fibra");
  assert.ok(plano.notices.some(notice => /não é sequencial/.test(notice)));
  const comTrava = parseDeclaredPlanText(`${SILO_2.split("\n").slice(0, 7).join("\n")}\nTrava: travada`);
  assert.equal(comTrava.articles[0].lock, "locked");
  assert.equal(readDeclaredPlanLockChoice("Livre"), "free");
  assert.equal(readDeclaredPlanLockChoice("automática"), "auto");
  assert.equal(readDeclaredPlanLockChoice("talvez"), null);
});

test("trava: manual vence; no cadastro único segue o volume (0 = livre); plano anterior é travado pela declaração", () => {
  const plan = (keywordId: string, lock?: "locked" | "free") => ({ declaredPrincipal: { keywordId, phrase: "k" }, ...(lock ? { lock } : {}) });
  assert.equal(declaredPrincipalLock(plan("K"), { subjectKeywordId: "K", volume: { validated: true, value: 260 } })?.state, "locked");
  assert.equal(declaredPrincipalLock(plan("K"), { subjectKeywordId: "K", volume: { validated: true, value: 0 } })?.state, "free");
  assert.equal(declaredPrincipalLock(plan("K"), { subjectKeywordId: "K", volume: { validated: false, value: 900 } })?.state, "free", "volume importado, não medido, não trava");
  assert.equal(declaredPrincipalLock(plan("K", "locked"), { subjectKeywordId: "K", volume: null })?.origin, "manual");
  assert.equal(declaredPrincipalLock(plan("K", "free"), { subjectKeywordId: "K", volume: { validated: true, value: 5000 } })?.state, "free");
  const anterior = declaredPrincipalLock(plan("P"), { subjectKeywordId: "S", volume: null });
  assert.equal(anterior?.state, "locked");
  assert.equal(anterior?.origin, "declared");
  assert.equal(declaredPrincipalLock({ declaredPrincipal: null }, { subjectKeywordId: "S" }), null);
  assert.equal(lockedDeclaredPrincipal(declaredPrincipalLock(plan("K"), { subjectKeywordId: "K", volume: null })), null, "livre não fixa principal");
  assert.equal(hasLockingVolume({ validated: true, value: 1 }), true);
});

test("o Assunto dentro da keyword: título no `entry`, frase do Assunto = título, idempotente", () => {
  const gravado = setKeywordSubject({}, { actorId: ACTOR, changedAt: AT, origin: "import", entry: { title: "Wi-Fi lento em casa", source: "cadastro" } });
  assert.ok(gravado.ok && gravado.changed);
  const lido = resolveKeywordSubject(gravado.semantic);
  assert.equal(lido.entry?.title, "Wi-Fi lento em casa");
  assert.equal(subjectPhraseOf("wi-fi lento", lido), "Wi-Fi lento em casa");
  assert.equal(subjectPhraseOf("frase antiga", resolveKeywordSubject({ keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null } })), "frase antiga");
  const de_novo = setKeywordSubject(gravado.semantic, { actorId: ACTOR, changedAt: AT, origin: "import", entry: { title: "Wi-Fi lento em casa", source: "cadastro" } });
  assert.ok(de_novo.ok && !de_novo.changed);
  const invalido = setKeywordSubject({}, { actorId: ACTOR, changedAt: AT, origin: "import", entry: { title: "a\nb", source: "cadastro" } });
  assert.equal(invalido.ok, false);
});

test("prévia do Silo 2 (cor Azul, Silo novo): 7 artigos com o Assunto na keyword, trava pelo volume, nada gravado", async () => {
  const db = marca();
  const antes = JSON.stringify(db.tables);
  const previa = await core(db);
  assert.ok(previa.ok && previa.mode === "preview", JSON.stringify(previa));
  if (!previa.ok || previa.mode !== "preview") return;
  assert.deepEqual(previa.blockers, []);
  assert.equal(previa.canApply, true);
  assert.ok(previa.articles.every(article => article.shape === "cadastro" && article.change === "new"));
  const porOrdem = new Map(previa.articles.map(article => [article.order, article]));
  assert.equal(porOrdem.get(11)?.lock?.state, "locked", "Wi-Fi lento tem volume medido: travada");
  assert.equal(porOrdem.get(11)?.lock?.origin, "volume");
  assert.equal(porOrdem.get(14)?.lock?.state, "free", "medida 0 = sem volume: livre");
  assert.equal(porOrdem.get(9)?.lock?.state, "free", "keyword nova, sem volume: livre");
  assert.equal(porOrdem.get(9)?.principal.state, "new");
  assert.equal(porOrdem.get(9)?.title, "Internet fibra óptica ou internet comum: qual a diferença e qual escolher?");
  assert.equal(previa.group.mode, "existing", "a cor Azul já tem grupo: o cadastro vai para ele");
  assert.equal(previa.siloPlan?.siloSlug, "wifi-e-fibra");
  assert.ok(previa.notices.some(notice => /LIVRES/.test(notice)));
  assert.equal(JSON.stringify(db.tables), antes, "prévia não escreve nada");
});

test("aplicar o Silo 2: nenhuma linha de título nasce; cada keyword carrega o Assunto, o plano e a marca de si mesma; reaplicar não muda nada", async () => {
  const db = marca();
  const antes = db.tables.minerador_keywords.length;
  const aplicado = await core(db, { mode: "apply", importRequestId: "6a1c0d2e-1111-4222-8333-444455556661" });
  assert.ok(aplicado.ok && aplicado.mode === "apply", JSON.stringify(aplicado));
  if (!aplicado.ok || aplicado.mode !== "apply") return;
  assert.equal(aplicado.failed, 0, JSON.stringify(aplicado.articles));
  assert.equal(aplicado.reciprocityConfirmed, 7);
  // 5 keywords novas (2 já existiam); NENHUMA linha com o título do Assunto.
  assert.equal(db.tables.minerador_keywords.length, antes + 5);
  for (const titulo of parseDeclaredPlanText(SILO_2).articles.map(article => article.subject)) assert.equal(linha(db, titulo), undefined, `o título "${titulo}" não vira keyword`);
  const fibra = linha(db, "internet fibra óptica")!;
  const assunto = resolveKeywordSubject(fibra.analise_semantica as Row);
  assert.equal(assunto.declared, true);
  assert.equal(assunto.entry?.title, "Internet fibra óptica ou internet comum: qual a diferença e qual escolher?");
  assert.equal(assunto.entry?.source, "cadastro");
  assert.equal(assunto.plan?.order, 9);
  assert.equal(assunto.plan?.role, "Pilar");
  assert.equal(assunto.plan?.declaredPrincipal?.keywordId, fibra.id, "a principal é a própria keyword");
  assert.equal(assunto.plan?.lock, undefined, "trava automática não grava nada");
  assert.equal(resolveDeclaredPrincipal(fibra.analise_semantica as Row).mark?.subjectKeywordId, fibra.id);
  assert.equal(fibra.group_id, AZUL);
  assert.equal(fibra.status, "bruto");
  const grupo = db.tables.editorial_groups.find(row => row.id === AZUL)!;
  assert.equal(grupo.origin, "declared_plan");
  assert.equal((grupo.plan as Row).siloName, "Wi-Fi e fibra óptica");
  assert.equal((grupo.plan as Row).articleCount, 7);
  // A outra marca nunca é tocada.
  assert.deepEqual(db.tables.minerador_keywords.find(row => row.brand_id === OTHER_BRAND)!.analise_semantica, {});

  const snapshot = JSON.stringify(db.tables.minerador_keywords);
  const de_novo = await core(db, { mode: "apply", importRequestId: "7b2d1e3f-1111-4222-8333-444455556662" });
  assert.ok(de_novo.ok && de_novo.mode === "apply");
  if (de_novo.ok && de_novo.mode === "apply") assert.ok(de_novo.articles.every(article => article.outcome === "unchanged"), JSON.stringify(de_novo.articles));
  assert.equal(JSON.stringify(db.tables.minerador_keywords), snapshot);
});

test("Silo existente: acrescentar o artigo 16 grava só ele; os 7 ficam como estão (mesma versão, sem voltar a revisão)", async () => {
  const db = marca();
  const primeiro = await core(db, { mode: "apply", importRequestId: "8c3e2f40-1111-4222-8333-444455556663" });
  assert.ok(primeiro.ok);
  const fibraAntes = JSON.stringify(linha(db, "internet fibra óptica")!.analise_semantica);
  const novo = { silo: null, articles: [{ order: 16, subject: "Roteador mesh vale a pena?", principal: "roteador mesh", role: "Suporte" as const, scope: "Quando o mesh resolve a cobertura da casa.", lock: "locked" as const }] };
  const previa = await core(db, { text: null, plan: novo, destination: { kind: "existing_silo", groupId: AZUL } });
  assert.ok(previa.ok && previa.mode === "preview");
  if (!previa.ok || previa.mode !== "preview") return;
  assert.deepEqual(previa.blockers, []);
  assert.equal(previa.keptArticles.length, 7);
  assert.equal(previa.siloPlan?.articleCount, 8);
  assert.equal(previa.articles[0].lock?.state, "locked");
  assert.equal(previa.articles[0].lock?.origin, "manual");
  const aplicado = await core(db, { mode: "apply", importRequestId: "9d4f3051-1111-4222-8333-444455556664", text: null, plan: novo, destination: { kind: "existing_silo", groupId: AZUL } });
  assert.ok(aplicado.ok && aplicado.mode === "apply", JSON.stringify(aplicado));
  if (!aplicado.ok || aplicado.mode !== "apply") return;
  assert.equal(aplicado.planVersion, 2);
  const mesh = resolveKeywordSubject(linha(db, "roteador mesh")!.analise_semantica as Row);
  assert.equal(mesh.plan?.lock, "locked");
  assert.equal(mesh.plan?.planVersion, 2);
  assert.equal(JSON.stringify(linha(db, "internet fibra óptica")!.analise_semantica), fibraAntes, "o artigo já gravado não foi regravado");
});

test("recusas: Silo novo numa cor que já tem outro Silo; artigo sem keyword", async () => {
  const db = marca();
  const naLaranja = await core(db, { group: { mode: "new", color: "laranja", name: null } });
  assert.ok(naLaranja.ok && naLaranja.mode === "preview");
  if (naLaranja.ok && naLaranja.mode === "preview") {
    assert.equal(naLaranja.canApply, false);
    assert.ok(naLaranja.blockers.some(blocker => /já tem o Silo "Planos e contratação"/.test(blocker)));
  }
  const semKeyword = await core(db, { text: "Nome: Teste\n1. Um título\nArtigo pilar\nEscopo." });
  assert.ok(semKeyword.ok && semKeyword.mode === "preview");
  if (semKeyword.ok && semKeyword.mode === "preview") {
    assert.equal(semKeyword.canApply, false);
    assert.ok(semKeyword.blockers.some(blocker => /O Assunto entra sempre por trás de uma keyword/.test(blocker)));
  }
});

test("destino artigo publicado: o Assunto vai para a keyword publicada (protegida) e as keywords entram como sustentações dela", async () => {
  const db = marca();
  const pedido = { text: null, plan: { silo: null, articles: [
    { order: 1, subject: "Fibra para empresas: o que muda no contrato", principal: "fibra para empresas", role: "Suporte" as const, scope: "Reforçar SLA, IP fixo e suporte dedicado." },
    { order: 2, subject: "", principal: "internet dedicada empresarial", role: "Suporte" as const, scope: "" },
  ] }, destination: { kind: "published" as const, url: PAGINA_URL }, group: { mode: "new" as const, color: "azul", name: null } };
  const previa = await core(db, pedido);
  assert.ok(previa.ok && previa.mode === "preview", JSON.stringify(previa));
  if (!previa.ok || previa.mode !== "preview") return;
  assert.deepEqual(previa.blockers, []);
  assert.equal(previa.destination.publishedKeyword?.keyword, "internet fibra empresarial");
  assert.ok(previa.articles.every(article => article.lock === null), "trava não se aplica ao publicado");
  const pagina = linha(db, "internet fibra empresarial")!;
  const antesDaPagina = { keyword: pagina.keyword, status: pagina.status, origem: JSON.stringify((pagina.analise_semantica as Row).site_origin) };
  const aplicado = await core(db, { ...pedido, mode: "apply", importRequestId: "aa4f3051-1111-4222-8333-444455556665" });
  assert.ok(aplicado.ok && aplicado.mode === "apply", JSON.stringify(aplicado));
  if (!aplicado.ok || aplicado.mode !== "apply") return;
  assert.equal(aplicado.failed, 0, JSON.stringify(aplicado.articles));
  const depois = linha(db, "internet fibra empresarial")!;
  const assunto = resolveKeywordSubject(depois.analise_semantica as Row);
  assert.equal(assunto.declared, true);
  assert.equal(assunto.entry?.title, "Fibra para empresas: o que muda no contrato");
  assert.equal(assunto.entry?.details, "Reforçar SLA, IP fixo e suporte dedicado.");
  assert.equal(assunto.plan, null, "publicado não entra em plano de Silo");
  assert.deepEqual({ keyword: depois.keyword, status: depois.status, origem: JSON.stringify((depois.analise_semantica as Row).site_origin) }, antesDaPagina, "URL, Vínculo e keyword da página intocados");
  const sustentacao = linha(db, "fibra para empresas")!;
  const bloco = (sustentacao.analise_semantica as Row).subject_discovery as Row;
  assert.deepEqual(bloco.subjectKeywordIds, [pagina.id]);
  assert.equal(resolveKeywordSubject(sustentacao.analise_semantica as Row).declared, false, "a sustentação não vira Assunto");
  assert.ok(sustentacao.group_id, "a cor foi gravada");
});

test("leitura compatível: o plano anterior (Silo 1) aparece no formato do card, travado pela declaração, sem regravar nada", async () => {
  const db = marca();
  // Silo 1 no formato anterior: o Assunto numa linha, a principal declarada em outra.
  const assuntoId = "00000000-0000-4000-8000-000000000003";
  const principalId = "10000000-0000-4000-8000-000000000003";
  db.tables.minerador_keywords.push(
    { id: assuntoId, keyword: "Claro, Vivo ou TIM: qual internet residencial escolher?", brand_id: BRAND, status: "aprovado", group_id: LARANJA, deleted_at: null, analise_semantica: { keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null, plan: { groupId: LARANJA, planVersion: 1, order: 3, role: "Suporte", scope: "Comparar tecnologias.", declaredPrincipal: { keywordId: principalId, phrase: "Claro Vivo ou TIM internet" } } } } },
    { id: principalId, keyword: "Claro Vivo ou TIM internet", brand_id: BRAND, status: "bruto", group_id: LARANJA, deleted_at: null, analise_semantica: { keyword_declared_principal: { subjectKeywordId: assuntoId, groupId: LARANJA, planVersion: 1 } } },
    // O Pilar do Silo 1 (artigo 1), também no formato anterior.
    { id: "00000000-0000-4000-8000-000000000001", keyword: "Como escolher o melhor plano de internet residencial para sua casa?", brand_id: BRAND, status: "aprovado", group_id: LARANJA, deleted_at: null, analise_semantica: { keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null, plan: { groupId: LARANJA, planVersion: 1, order: 1, role: "Pilar", scope: "O que comparar antes de contratar.", declaredPrincipal: { keywordId: "10000000-0000-4000-8000-000000000001", phrase: "melhor plano de internet residencial" } } } } },
    { id: "10000000-0000-4000-8000-000000000001", keyword: "melhor plano de internet residencial", brand_id: BRAND, status: "aprovado", group_id: LARANJA, deleted_at: null, volume_search: 260, analise_semantica: { ...MEDIDA(260), keyword_declared_principal: { subjectKeywordId: "00000000-0000-4000-8000-000000000001", groupId: LARANJA, planVersion: 1 } } },
  );
  const antes = JSON.stringify(db.tables);
  const lido = await readDeclaredPlanCardRows({ brandId: BRAND, keywordsClient: db, groupsClient: db, groupId: LARANJA });
  assert.ok(lido.ok);
  if (!lido.ok) return;
  assert.equal(lido.silo?.siloName, "Planos e contratação");
  assert.equal(lido.rows.length, 2);
  assert.equal(lido.rows[0].role, "Pilar");
  assert.equal(lido.rows[1].title, "Claro, Vivo ou TIM: qual internet residencial escolher?");
  assert.equal(lido.rows[1].keyword, "Claro Vivo ou TIM internet");
  assert.equal(lido.rows[1].shape, "legacy");
  assert.equal(lido.rows[1].lockLabel, "Travada · declarada antes do cadastro único");
  assert.equal(JSON.stringify(db.tables), antes, "ler não grava nada");
  // Destravar pelo card grava NA linha do Assunto anterior; nenhuma linha nova.
  const destravar = { silo: null, articles: [{ order: 3, subject: "Claro, Vivo ou TIM: qual internet residencial escolher?", principal: "Claro Vivo ou TIM internet", role: "Suporte" as const, scope: "Comparar tecnologias.", lock: "free" as const }] };
  const total = db.tables.minerador_keywords.length;
  const aplicado = await core(db, { mode: "apply", importRequestId: "bb4f3051-1111-4222-8333-444455556666", text: null, plan: destravar, destination: { kind: "existing_silo", groupId: LARANJA } });
  assert.ok(aplicado.ok && aplicado.mode === "apply", JSON.stringify(aplicado));
  assert.equal(db.tables.minerador_keywords.length, total);
  const plano = resolveKeywordSubject(db.tables.minerador_keywords.find(row => row.id === assuntoId)!.analise_semantica as Row).plan!;
  assert.equal(plano.lock, "free");
  assert.equal(plano.declaredPrincipal?.keywordId, principalId);
});

test("estrutural: a rota do card e o MCP chamam o mesmo núcleo; o card não grava direto", () => {
  const limpa = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const rota = limpa("../app/api/minerador/marcas/[brandId]/plans/import/route.ts");
  assert.match(rota, /importDeclaredPlanWithCore\(/);
  assert.match(rota, /readDeclaredPlanCardRows\(/);
  assert.doesNotMatch(rota, /setKeywordSubject|setDeclaredPrincipal|\.update\(/);
  const mcp = limpa("../lib/server/platform-mcp-tools.ts");
  assert.match(mcp, /importDeclaredPlanWithCore\(/);
  const nucleo = limpa("../lib/minerador/declared-plan-import-core.ts");
  assert.match(nucleo, /importSubjectsWithCore\(/);
  assert.match(nucleo, /importSubjectDiscoveryWithCore\(/);
  assert.match(nucleo, /declaredPrincipalReciprocity\(/);
});
