import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ArticleDNASchema, type ArticleDNA } from "../lib/arquiteto/contracts.ts";
import { buildSerpSubjectIndex, normalizeSerpPageUrl, type KeywordSerpFootprint } from "../lib/arquiteto/serp-subject-overlap.ts";
import {
  DIFFERENTIATION_STAGE,
  DIFFERENTIATION_SUBJECT_TYPE,
  detectPublishedCannibalization,
  differentiationTokens,
  fitsSlugEntity,
  proposeDifferentiationAngles,
  readPageRanking,
  validateDifferentiationAiAngles,
  type DifferentiationGroup,
  type DifferentiationPage,
} from "../lib/arquiteto/published-differentiation.ts";
import {
  DIFFERENTIATION_LEGACY_PLAN_VERSION,
  DIFFERENTIATION_MAX_COST_USD,
  DIFFERENTIATION_PLAN_OUTDATED_MESSAGE,
  DIFFERENTIATION_PLAN_VERSION,
  DIFFERENTIATION_SERP_KEYWORD_MAX_USD,
  authorizeDifferentiationPlan,
  buildDifferentiationPlan,
  evaluateDifferentiation,
  filterDifferentiationCandidates,
  listDifferentiationPaidCalls,
  runPublishedDifferentiation,
  verifyDifferentiationPlanHash,
  type DifferentiationCandidate,
  type DifferentiationRunPorts,
} from "../lib/arquiteto/published-differentiation-run.ts";
import {
  DIFFERENTIATION_NOTE_PREFIX,
  differentiationEditorialLines,
  differentiationReadbackConfirms,
  planDifferentiationApply,
  withDifferentiationFields,
} from "../lib/arquiteto/published-differentiation-apply.ts";
import type { SubjectDiscoveryAdsSeed } from "../lib/minerador/subject-discovery-search.ts";
import { buildRadarDocument, radarDocumentId } from "../lib/redator/radar-import.ts";
import { normalizeKeyword } from "../lib/minerador/keyword-import-core.ts";

/**
 * DIFERENCIAR PUBLICADOS QUE DISPUTAM O MESMO ASSUNTO — o domínio.
 *
 * SDD docs/04-arquiteto/sdd-diferenciacao-publicados-canibalizados-2026-09-27.md §8.
 * A detecção roda sobre a LEITURA REAL do cache da AdalbaPro (fixture, sem
 * custo). A rodada paga roda com portas falsas: nenhuma rede, nenhum crédito.
 */

let chamadasDeRede = 0;
globalThis.fetch = (async () => {
  chamadasDeRede += 1;
  throw new Error("Rede proibida no teste da diferenciação.");
}) as typeof fetch;

type Fixture = {
  publicados: Array<{ keyword: string; volume: number | null; intencao: string }>;
  serp: Array<{ keyword: string; lente: string; urls: string[] | null }>;
};
const REAL = JSON.parse(readFileSync(new URL("./fixtures/adalbapro-publicados-serp-2026-09-26.json", import.meta.url), "utf8")) as Fixture;

const slugDe = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** As duas URLs reais do site que aparecem no top 10 (2026-09-26). */
const URLS_REAIS: Record<string, string> = {
  "campanhas de marketing para clínica de estética sem anúncios": "https://adalbapro.com.br/leads-sem-trafego-pago/campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios",
  "modelos de campanha para clínica de estética": "https://adalbapro.com.br/estrategia-de-negocios/modelos-de-campanha-para-clinica-de-estetica",
};

function pegadasReais(): KeywordSerpFootprint[] {
  const porKeyword = new Map<string, KeywordSerpFootprint>();
  for (const linha of REAL.serp) {
    const atual = porKeyword.get(linha.keyword) || { keywordId: linha.keyword, keyword: linha.keyword, lenses: [] };
    porKeyword.set(linha.keyword, { ...atual, lenses: [...atual.lenses, { lens: linha.lente, urls: linha.urls, domains: null, collectedAt: "2026-09-20T12:00:00Z" }] });
  }
  return [...porKeyword.values()];
}

function paginasReais(extra: (keyword: string) => Partial<DifferentiationPage> = () => ({})): DifferentiationPage[] {
  return REAL.publicados.map(item => ({
    keywordId: item.keyword,
    keyword: item.keyword,
    url: URLS_REAIS[item.keyword] || `https://adalbapro.com.br/blog/${slugDe(item.keyword)}`,
    canonical: null,
    slug: null,
    post: "free",
    volume: item.volume,
    volumeValidated: (item.volume ?? 0) > 0,
    intent: item.intencao === "Pendente" ? null : item.intencao,
    entity: null,
    problem: null,
    articleId: null,
    articleKeywordCount: null,
    ...extra(item.keyword),
  }));
}

const INDICE_REAL = buildSerpSubjectIndex(pegadasReais());
const ATRAIR = "como atrair pacientes para clínica de estética";
const CAPTAR = "como captar clientes para clínica de estética";

function detectarReal(extra?: (keyword: string) => Partial<DifferentiationPage>) {
  return detectPublishedCannibalization({ pages: paginasReais(extra), serp: INDICE_REAL, brandHosts: ["adalbapro.com.br"] });
}

/* ================================ detecção ================================ */

test("persistência: subject_type livre e o estágio do Arquiteto como o banco aceita", () => {
  assert.equal(DIFFERENTIATION_SUBJECT_TYPE, "differentiation_proposal");
  assert.equal(DIFFERENTIATION_STAGE, "architect", "o CHECK de editorial_workflow_items.stage não aceita 'arquiteto'");
});

test("detecção com os dados reais do cache: as 4 famílias, 13 pares Fortes, grátis", () => {
  const deteccao = detectarReal();
  assert.equal(deteccao.pagesMeasured, 25);
  assert.equal(deteccao.withoutSerp.length, 0);
  assert.equal(deteccao.groups.length, 4);
  const familias = deteccao.groups.map(grupo => grupo.members.map(membro => membro.page.keyword).sort());
  const tem = (...nomes: string[]) => familias.some(familia => familia.length === nomes.length && nomes.every(nome => familia.includes(nome)));
  assert.ok(tem("plano de marketing para clínica de estética", "como criar um plano de marketing para clínica de estética", "plano de marketing estética: exemplos e templates", "checklist de plano de marketing para clínica de estética"), "família do plano de marketing");
  assert.ok(tem(ATRAIR, CAPTAR), "atrair × captar em estética: o caso do dono");
  assert.ok(tem("como atrair clientes para consultório", "como atrair pacientes para clínica", "como atrair pacientes para consultório odontológico"), "atrair em consultório e clínica");
  assert.ok(tem("campanhas de marketing para clínica de estética sem anúncios", "marketing para clínica de estética", "agência de marketing para clínica de estética", "modelos de campanha para clínica de estética", "promoções para estética"), "campanhas e marketing");
  assert.equal(deteccao.groups.reduce((total, grupo) => total + grupo.strongPairs.length, 0), 13);
  const par = deteccao.groups.find(grupo => grupo.members.some(membro => membro.page.keyword === CAPTAR))!;
  assert.equal(par.strongPairs[0].sharedPageCount, 6);
  assert.equal(deteccao.groups[0].maxSharedPages, 7, "o grupo mais grave vem primeiro");
  assert.ok(par.probablePairs.every(item => item.level === "probable" && item.sharedPageCount === 2));
  assert.equal(chamadasDeRede, 0);
});

test("página que ranqueia: só as 2 do site no top 10, com a posição (Q3)", () => {
  const deteccao = detectarReal();
  const membros = deteccao.groups.flatMap(grupo => grupo.members);
  const ranqueiam = membros.filter(membro => membro.ranking.ranks).map(membro => [membro.page.keyword, membro.ranking.bestPosition]);
  assert.deepEqual(ranqueiam.sort(), [["campanhas de marketing para clínica de estética sem anúncios", 4], ["modelos de campanha para clínica de estética", 7]].sort());
  const campanhas = membros.find(membro => membro.page.keyword.startsWith("campanhas"))!;
  assert.deepEqual([...new Set(campanhas.ranking.hits.map(hit => hit.lens))].sort(), ["mobile-android", "mobile-ios"]);
  // Outra página do site no top 10 não conta como "esta página".
  const pegada: KeywordSerpFootprint = { keywordId: "x", keyword: "x", lenses: [{ lens: "mobile-ios", urls: ["https://outro.com/a", "https://adalbapro.com.br/outra-pagina"], domains: null, collectedAt: null }] };
  const leitura = readPageRanking({ url: "https://adalbapro.com.br/esta", canonical: null }, pegada, ["adalbapro.com.br"]);
  assert.equal(leitura.ranks, false);
  assert.equal(leitura.otherSitePages.length, 1);
  // Na lente canônica só há domínios: "posição não lida" segura a troca.
  const soDominio: KeywordSerpFootprint = { keywordId: "y", keyword: "y", lenses: [{ lens: "desktop-windows", urls: null, domains: ["adalbapro.com.br"], collectedAt: null }] };
  assert.equal(readPageRanking({ url: "https://adalbapro.com.br/esta", canonical: null }, soDominio, []).possiblyRanks, true);
});

test("Manter como está: o grupo volta marcado até a SERP dele mudar", () => {
  const antes = detectarReal();
  const par = antes.groups.find(grupo => grupo.members.some(membro => membro.page.keyword === CAPTAR))!;
  const mantido = detectPublishedCannibalization({ pages: paginasReais(), serp: INDICE_REAL, kept: [{ groupId: par.groupId, serpFingerprint: par.serpFingerprint }] });
  assert.equal(mantido.groups.find(grupo => grupo.groupId === par.groupId)?.kept, true);
  const outraSerp = detectPublishedCannibalization({ pages: paginasReais(), serp: INDICE_REAL, kept: [{ groupId: par.groupId, serpFingerprint: "0000000000000000" }] });
  assert.equal(outraSerp.groups.find(grupo => grupo.groupId === par.groupId)?.kept, false, "SERP nova devolve o grupo ao painel");
});

/* ================================= ângulos ================================= */

test("ângulos pelo que separa os slugs: captar clientes × atrair pacientes; entidade clínica de estética", () => {
  const par = detectarReal().groups.find(grupo => grupo.members.some(membro => membro.page.keyword === CAPTAR))!;
  const angulos = proposeDifferentiationAngles({ group: par });
  const captar = angulos.find(angulo => angulo.keywordId === CAPTAR)!;
  const atrair = angulos.find(angulo => angulo.keywordId === ATRAIR)!;
  assert.equal(captar.label, "captar clientes");
  assert.equal(atrair.label, "atrair pacientes");
  assert.deepEqual(captar.entityTokens, ["clinica", "estetica"]);
  assert.equal(captar.ideasSeed, "captar clientes clínica estética", "o ângulo com o tema da página");
  assert.equal(captar.relatedSeed, CAPTAR, "sem IA, as pesquisas relacionadas partem da busca real publicada");
  assert.deepEqual(captar.sources, ["slug"]);
  assert.ok(fitsSlugEntity("anúncios para clínicas de estética", captar.entityTokens), "plural e acento não separam");
  assert.ok(fitsSlugEntity("tráfego pago para estética", captar.entityTokens), "'estética' basta (exemplo do dono)");
  assert.ok(!fitsSlugEntity("marketing para dentistas", captar.entityTokens));
  // Entidade de uma palavra só é genérica: precisa de mais uma palavra da página.
  const paginaClinica = differentiationTokens("como atrair pacientes para clínica");
  assert.equal(fitsSlugEntity("clínica veterinária", ["clinica"], paginaClinica), false);
  assert.equal(fitsSlugEntity("pacientes para clínica odontológica", ["clinica"], paginaClinica), true);
  assert.equal(fitsSlugEntity("clínica veterinária", ["clinica"]), true, "sem as palavras da página, a regra antiga");

  const plano = detectarReal().groups[0];
  const amplo = proposeDifferentiationAngles({ group: plano }).find(angulo => angulo.keywordId === "plano de marketing para clínica de estética")!;
  assert.match(amplo.label, /^visão geral/);
  assert.equal(amplo.ideasSeed, "plano de marketing para clínica de estética");
  const consultorio = detectarReal().groups.find(grupo => grupo.members.some(membro => membro.page.keyword === "como atrair pacientes para consultório odontológico"))!;
  const odonto = proposeDifferentiationAngles({ group: consultorio }).find(angulo => angulo.keywordId === "como atrair pacientes para consultório odontológico")!;
  assert.equal(odonto.ideasSeed, "atrair pacientes consultório odontológico", "sozinho, \"odontológico\" traria ideias fora do slug");
  const campanhas = detectarReal().groups.find(grupo => grupo.members.length === 5)!;
  const modelos = proposeDifferentiationAngles({ group: campanhas }).find(angulo => angulo.keywordId === "modelos de campanha para clínica de estética")!;
  assert.equal(modelos.ideasSeed, "modelos campanha clínica estética");
  assert.deepEqual(differentiationTokens("Promoções para Estética"), ["promocao", "estetica"]);
});

test("IA (Q1) é a menor autoridade: id inventado recusado, sementes conferidas, nunca decide", () => {
  const par = detectarReal().groups.find(grupo => grupo.members.some(membro => membro.page.keyword === CAPTAR))!;
  const resposta = {
    angles: [
      { keywordId: CAPTAR, angle: "Captação ativa: anúncios e tráfego pago", seeds: ["anúncios para clínica de estética", "tráfego pago para estética", "google ads para clínica de estética", "anúncios para clínica de estética", CAPTAR] },
      { keywordId: "id-inventado", angle: "Qualquer", seeds: ["a b", "c d", "e f"] },
      { keywordId: ATRAIR, angle: "Atração orgânica", seeds: ["instagram para clínica de estética"] },
    ],
  };
  const conferida = validateDifferentiationAiAngles(resposta, par);
  assert.equal(conferida.accepted.length, 1);
  assert.deepEqual(conferida.accepted[0].seeds, ["anúncios para clínica de estética", "tráfego pago para estética", "google ads para clínica de estética"], "repetida e a keyword do grupo saem");
  assert.ok(conferida.rejected.some(item => item.keywordId === "id-inventado"));
  assert.ok(conferida.rejected.some(item => item.keywordId === ATRAIR && /menos de 3/.test(item.reason)));
  assert.equal(validateDifferentiationAiAngles({ angles: [{ keywordId: CAPTAR, angle: "x", seeds: ["a b"], extra: 1 }] }, par).accepted.length, 0, "campo inventado derruba a resposta");
  const comIa = proposeDifferentiationAngles({ group: par, ai: conferida.accepted }).find(angulo => angulo.keywordId === CAPTAR)!;
  assert.equal(comIa.label, "captar clientes", "o slug continua sendo a autoridade do nome");
  assert.equal(comIa.aiLabel, "Captação ativa: anúncios e tráfego pago");
  assert.equal(comIa.relatedSeed, "anúncios para clínica de estética");
  assert.deepEqual(comIa.seeds.map(semente => semente.source), ["slug", "ai", "ai", "ai"]);
});

/* ============================== plano e custo ============================== */

test("plano v2: as keywords novas vêm do Google Ads (grátis); o custo é só a SERP, com teto de US$ 0,50 por grupo", async () => {
  const deteccao = detectarReal();
  const par = deteccao.groups.find(grupo => grupo.members.some(membro => membro.page.keyword === CAPTAR))!;
  const angulos = proposeDifferentiationAngles({ group: par });
  const plano = await buildDifferentiationPlan({ brandId: "marca", group: par, angles: angulos, aiUsed: false });
  assert.equal(plano.version, DIFFERENTIATION_PLAN_VERSION);
  assert.equal(plano.version, "published-differentiation-plan-v2");
  assert.equal(DIFFERENTIATION_SERP_KEYWORD_MAX_USD, 0.014);
  assert.deepEqual(plano.costRange, { minUsd: 0, maxUsd: 0.14 }, "2 páginas × 5 candidatas × 4 lentes; tudo no cache custa 0");
  assert.equal(plano.cuts.length, 0);
  assert.equal(plano.withinCap, true);
  assert.equal(listDifferentiationPaidCalls(plano).length, 40, "só a SERP é paga");
  assert.ok(listDifferentiationPaidCalls(plano).every(chamada => chamada.endpoint === "serp"));
  assert.deepEqual(plano.adsTargeting, { language: "languageConstants/1014", geoTargetConstants: ["geoTargetConstants/2076"], keywordPlanNetwork: "GOOGLE_SEARCH", includeAdultKeywords: false });
  for (const [indice, pagina] of plano.pages.entries()) {
    const angulo = angulos.find(item => item.keywordId === pagina.keywordId)!;
    assert.deepEqual(pagina.labs, [], "nenhuma chamada do Labs");
    assert.ok(pagina.url, "as páginas reais têm URL no Vínculo");
    assert.deepEqual(pagina.ads?.map(chamada => [chamada.callId, chamada.kind, chamada.url]), [[`p${indice + 1}:ads:keyword_seed`, "keyword_seed", null], [`p${indice + 1}:ads:url_seed`, "url_seed", pagina.url]]);
    assert.equal(pagina.ads?.[0].keywords[0], angulo.ideasSeed, "a semente de ideias do ângulo vai ao Google Ads");
    assert.equal(new Set(pagina.ads?.[0].keywords.map(normalizeKeyword)).size, pagina.ads?.[0].keywords.length, "sem semente repetida");
    assert.deepEqual(pagina.ads?.[1].keywords, [angulo.ideasSeed]);
  }
  assert.ok(plano.notices.some(aviso => /vêm do Google Ads/.test(aviso)));

  // Sem URL no Vínculo: só a semente frase, e a nota diz por quê.
  const semUrl = { ...par, members: par.members.map((membro, indice) => indice ? membro : { ...membro, page: { ...membro.page, url: null } }) };
  const planoSemUrl = await buildDifferentiationPlan({ brandId: "marca", group: semUrl, angles: angulos, aiUsed: false });
  assert.deepEqual(planoSemUrl.pages[0].ads?.map(chamada => chamada.kind), ["keyword_seed"]);
  assert.match(planoSemUrl.pages[0].note || "", /Google Ads recebe só as sementes/);

  const campanhas = deteccao.groups.find(grupo => grupo.members.length === 5)!;
  const cinco = await buildDifferentiationPlan({ brandId: "marca", group: campanhas, angles: proposeDifferentiationAngles({ group: campanhas }), aiUsed: false });
  assert.deepEqual(cinco.costRange, { minUsd: 0, maxUsd: 0.35 }, "5 páginas cabem no teto sem corte");
  assert.equal(cinco.cuts.length, 0);
  assert.ok(cinco.pages.every(pagina => pagina.inRound));

  // Oito páginas passam do teto: corta candidatas (5 → 3 → 2), nunca o Google Ads.
  const oito = { ...campanhas, members: [...campanhas.members, ...campanhas.members.slice(0, 3).map(membro => ({ ...membro, page: { ...membro.page, keywordId: `${membro.page.keywordId}-copia` } }))] };
  const cortado = await buildDifferentiationPlan({ brandId: "marca", group: oito, angles: proposeDifferentiationAngles({ group: oito }), aiUsed: false });
  assert.ok(cortado.costRange.maxUsd <= DIFFERENTIATION_MAX_COST_USD, `máximo ${cortado.costRange.maxUsd}`);
  assert.ok(cortado.cuts.some(corte => /SERP de .* candidatas por página/.test(corte)));
  assert.ok(!cortado.cuts.some(corte => /pesquisas relacionadas/.test(corte)), "o corte das relacionadas saiu");
  assert.ok(cortado.pages.every(pagina => (pagina.ads || []).length > 0));

  const total = (await Promise.all(deteccao.groups.map(grupo => buildDifferentiationPlan({ brandId: "marca", group: grupo, angles: proposeDifferentiationAngles({ group: grupo }), aiUsed: false })))).reduce((soma, item) => soma + item.costRange.maxUsd, 0);
  assert.ok(Math.abs(total - 0.98) < 1e-9, `as 4 famílias (14 páginas): até US$ 0,98, antes ~US$ 2 (${total.toFixed(3)})`);
});

test("prévia com hash: sem autorização, com outro hash ou acima do teto nada é pago", async () => {
  const par = detectarReal().groups.find(grupo => grupo.members.some(membro => membro.page.keyword === CAPTAR))!;
  const plano = await buildDifferentiationPlan({ brandId: "marca", group: par, angles: proposeDifferentiationAngles({ group: par }), aiUsed: false });
  assert.ok(await verifyDifferentiationPlanHash(plano));
  assert.equal(await verifyDifferentiationPlanHash({ ...plano, pages: plano.pages.map((pagina, indice) => indice ? pagina : { ...pagina, ads: (pagina.ads || []).map(chamada => ({ ...chamada, keywords: [...chamada.keywords, "outra semente"] })) }) }), false, "semente adulterada não confere");
  assert.equal(await verifyDifferentiationPlanHash({ ...plano, pages: plano.pages.map((pagina, indice) => indice ? pagina : { ...pagina, ads: (pagina.ads || []).map(chamada => chamada.kind === "url_seed" ? { ...chamada, url: "https://outro.com/x" } : chamada) }) }), false, "URL adulterada não confere");
  assert.equal(await verifyDifferentiationPlanHash({ ...plano, adsTargeting: { ...plano.adsTargeting!, geoTargetConstants: ["geoTargetConstants/20106"] } }), false, "targeting adulterado não confere");
  assert.equal(authorizeDifferentiationPlan(plano, null).ok, false);
  assert.equal((authorizeDifferentiationPlan(plano, { planHash: "sha256:outro", maxCostUsd: 0.3 }) as { code: string }).code, "PAID_PLAN_CHANGED");
  assert.equal((authorizeDifferentiationPlan(plano, { planHash: plano.planHash, maxCostUsd: 0.1 }) as { code: string }).code, "PAID_PLAN_CHANGED", "autorizado abaixo do máximo");
  assert.deepEqual(authorizeDifferentiationPlan(plano, { planHash: plano.planHash, maxCostUsd: plano.costRange.maxUsd }), { ok: true, budgetUsd: 0.14 });
  assert.equal((authorizeDifferentiationPlan({ ...plano, costRange: { minUsd: 0.1, maxUsd: 0.6 }, withinCap: false }, { planHash: plano.planHash, maxCostUsd: 0.6 }) as { code: string }).code, "DIFFERENTIATION_PLAN_ABOVE_CAP");
});

/* =============================== candidatas =============================== */

function candidata(keyword: string, extra: Partial<DifferentiationCandidate> = {}): DifferentiationCandidate {
  const normal = normalizeKeyword(keyword);
  return { candidateId: `cand:${normal}`, keyword, normalizedKeyword: normal, origins: ["labs_category"], evidence: [], adsVolume: 100, estimate: 100, hasVolume: true, entityFit: false, rankedByUrl: false, tier: "volume_only", existingKeywordId: null, serpMeasured: false, ...extra };
}

test("filtro D2.3: sem volume, publicada e ângulo da irmã saem; entidade vem primeiro", () => {
  const filtro = filterDifferentiationCandidates({
    candidates: [
      candidata("marketing para dentistas", { adsVolume: 900 }),
      candidata("anúncios para clínica de estética", { adsVolume: 320 }),
      candidata("captar clientes estética grátis", { adsVolume: 0, estimate: 0, hasVolume: false }),
      candidata("como atrair pacientes estética", { adsVolume: 110 }),
      candidata("marketing para clínica de estética", { adsVolume: 90 }),
      candidata("leads para clínica", { adsVolume: 50, rankedByUrl: true, origins: ["labs_ranked"] }),
    ],
    angle: { entityTokens: ["clinica", "estetica"], distinctTokens: ["captar", "cliente"] },
    siblingDistinctTokens: ["atrair", "paciente"],
    blockedNormalized: new Set([normalizeKeyword("marketing para clínica de estética")]),
  });
  assert.deepEqual(filtro.kept.map(item => [item.keyword, item.tier]), [["anúncios para clínica de estética", "entity"], ["leads para clínica", "ranked"], ["marketing para dentistas", "volume_only"]]);
  const motivo = (keyword: string) => filtro.refused.find(item => item.keyword === keyword)?.reason;
  assert.match(motivo("captar clientes estética grátis")!, /Sem volume/);
  assert.match(motivo("como atrair pacientes estética")!, /ângulo de uma página irmã/);
  assert.match(motivo("marketing para clínica de estética")!, /publicada/);
});

/* ================================= rodada ================================= */

const normalPaginas = (keyword: string) => new Set(REAL.serp.filter(linha => linha.keyword === keyword).flatMap(linha => linha.urls || []).map(url => normalizeSerpPageUrl(url)!));
const soDe = (de: string, contra: string) => {
  const outra = normalPaginas(contra);
  const urls = new Map<string, string>();
  for (const linha of REAL.serp.filter(item => item.keyword === de)) for (const url of linha.urls || []) { const normal = normalizeSerpPageUrl(url)!; if (!outra.has(normal) && !urls.has(normal)) urls.set(normal, url); }
  return [...urls.values()];
};
const SO_CAPTAR = soDe(CAPTAR, ATRAIR);
const SO_ATRAIR = soDe(ATRAIR, CAPTAR);
const novas = (prefixo: string, quantas: number) => Array.from({ length: quantas }, (_, indice) => `https://${prefixo}.com.br/pagina-${indice + 1}`);

/** A SERP que o provider falso devolve para cada candidata (as mesmas URLs nas 4 lentes). */
const SERP_DAS_CANDIDATAS: Record<string, string[]> = {
  "anúncios para clínica de estética": [...SO_CAPTAR.slice(0, 3), ...novas("anuncios", 6), "https://compartilhada.com.br/trafego"],
  "tráfego pago para estética": [...SO_CAPTAR.slice(0, 2), "https://compartilhada.com.br/trafego", ...novas("trafego", 7)],
  "instagram para clínica de estética": [...SO_ATRAIR.slice(0, 3), ...novas("instagram", 7)],
  "marketing de indicação estética": [...SO_ATRAIR.slice(0, 2), ...novas("indicacao", 8)],
};
const VOLUMES: Record<string, number | null> = {
  "anúncios para clínica de estética": 320, "tráfego pago para estética": 90, "instagram para clínica de estética": 480,
  "marketing de indicação estética": 50, "captar clientes estética grátis": 0, "como atrair pacientes estética": 110,
};

/** As ideias do Google Ads falso: pela URL da página (url_seed) e pelas sementes do ângulo (keyword_seed). */
function ideiasDoAds(seed: SubjectDiscoveryAdsSeed): string[] {
  if (seed.kind === "keyword_and_url") {
    return seed.url.includes("captar") ? ["anúncios para clínica de estética", "tráfego pago para estética"] : ["instagram para clínica de estética"];
  }
  if (seed.keywords.some(semente => semente.includes("captar"))) return ["captar clientes estética grátis", "como atrair pacientes estética", "marketing para clínica de estética"];
  if (seed.keywords.some(semente => semente.includes("atrair"))) return ["marketing de indicação estética"];
  return [];
}

function portasFalsas(options: { usado?: boolean; adsFalha?: "keyword_and_url"; volumesFalham?: boolean } = {}) {
  const registro = { ideias: [] as string[], usoAds: [] as Array<{ suffix: string; resultStatus: string }>, serp: [] as string[], ledger: [] as string[], ads: 0 };
  const ports: DifferentiationRunPorts = {
    now: () => new Date("2026-09-27T12:00:00Z"),
    async openExecution() {
      return {
        ledgerCapability: true,
        findUsage: async () => Boolean(options.usado),
        async googleAdsIdeas(seed, targeting, pageSize) {
          registro.ideias.push(`${seed.kind}:${seed.kind === "keyword_and_url" ? seed.url : seed.keywords.join(" + ")}|${targeting.geoTargetConstants.join(",")}|${pageSize}`);
          if (options.adsFalha === seed.kind) throw Object.assign(new Error("Google Ads fora"), { code: "GOOGLE_ADS_DISCOVERY_ERROR" });
          return { requestId: `ads-${seed.kind}`, ideas: ideiasDoAds(seed).map(keyword => ({ keyword, averageMonthlySearches: VOLUMES[keyword] ?? 30, competition: null, competitionIndex: null, averageCpcMicros: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: null })) };
        },
        async recordGoogleAdsUsage(event) { registro.usoAds.push({ suffix: event.suffix, resultStatus: event.resultStatus }); },
        async collectSerp(request, options2) {
          options2.onRequestStarted();
          registro.serp.push(`${request.query.keyword}|${request.query.lens.device}-${request.query.lens.operatingSystem}`);
          const urls = SERP_DAS_CANDIDATAS[request.query.keyword] || [];
          return { providerRequestId: "serp-req", costUsd: 0.002, digest: { version: "organic-digest-v1", depth: 10, organic: urls.map((url, indice) => ({ rank_group: indice + 1, url, domain: new URL(url).hostname, title: "t", description: "d" })) } as never, organicCount: urls.length, stored: true, error: null };
        },
        async recordDataForSeoUsage(event) { registro.ledger.push(event.idempotencyKey); return "recorded" as const; },
      };
    },
    async googleAdsVolumes(keywords) {
      registro.ads += 1;
      if (options.volumesFalham) throw new Error("métricas fora");
      return new Map(keywords.map(keyword => [normalizeKeyword(keyword), VOLUMES[keyword] ?? null]));
    },
    async readFootprints(targets) {
      // Cache primeiro: "instagram…" já está no cache nas 4 lentes; as outras faltam.
      const cacheadas = targets.filter(alvo => alvo.keyword === "instagram para clínica de estética");
      return {
        footprints: cacheadas.map(alvo => ({ keywordId: alvo.keywordId, keyword: alvo.keyword, lenses: ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"].map(lens => ({ lens, urls: SERP_DAS_CANDIDATAS[alvo.keyword], domains: null, collectedAt: "2026-09-25T00:00:00Z" })) })),
        missingLenses: targets.filter(alvo => alvo.keyword !== "instagram para clínica de estética").flatMap(alvo => ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"].map(lens => ({ keywordId: alvo.keywordId, lens, reason: "sem entrada no cache" }))),
      };
    },
  };
  return { ports, registro };
}

async function montarPar(postoAtrair: DifferentiationPage["post"] = "locked") {
  const deteccao = detectarReal(keyword => keyword === ATRAIR ? { post: postoAtrair } : {});
  const grupo = deteccao.groups.find(item => item.members.some(membro => membro.page.keyword === CAPTAR))!;
  const angles = proposeDifferentiationAngles({ group: grupo });
  const plan = await buildDifferentiationPlan({ brandId: "marca", group: grupo, angles, aiUsed: false });
  const pageFootprints = pegadasReais().filter(pegada => pegada.keywordId === CAPTAR || pegada.keywordId === ATRAIR);
  return { grupo, angles, plan, pageFootprints };
}

const OPERACAO = "11111111-2222-4333-8444-555555555555";

test("rodada paga com portas falsas: Google Ads grátis (sementes e URL), SERP cache-first, avaliação e custo só da SERP", async () => {
  const { grupo, angles, plan, pageFootprints } = await montarPar("locked");
  const { ports, registro } = portasFalsas();
  const desfecho = await runPublishedDifferentiation({
    brandId: "marca", plan, group: grupo, angles, pageFootprints,
    publishedNormalized: new Set(REAL.publicados.map(item => normalizeKeyword(item.keyword))),
    operationRequestId: OPERACAO, authorizedPlan: { planHash: plan.planHash, maxCostUsd: plan.costRange.maxUsd },
  }, ports);
  assert.ok(desfecho.ok, JSON.stringify(desfecho));
  if (!desfecho.ok) return;
  const { result } = desfecho;
  assert.equal(registro.ideias.length, 4, "2 sementes do Google Ads por página");
  assert.ok(registro.ideias.some(item => item.startsWith("keyword:captar clientes clínica estética")), "a semente do ângulo vai ao Google Ads");
  assert.ok(registro.ideias.filter(item => item.startsWith("keyword_and_url:https://")).length === 2, "a URL de cada página vai como semente");
  assert.ok(registro.ideias.every(item => item.endsWith("|geoTargetConstants/2076|100")), "targeting canônico do plano e 100 ideias por semente");
  assert.deepEqual(registro.usoAds.map(item => item.suffix), ["keyword_seed:p1", "url_seed:p1", "keyword_seed:p2", "url_seed:p2"], "uma chave de uso por página e semente: não colidem");
  assert.equal(registro.ads, 1, "as métricas históricas do Google Ads são consultadas uma vez, em lote");
  assert.ok(!registro.serp.some(item => item.startsWith("instagram")), "a candidata no cache não é paga de novo");
  assert.equal(registro.serp.length, 12, "3 candidatas × 4 lentes que faltavam");
  assert.equal(new Set(registro.ledger).size, registro.ledger.length, "uma chave de ledger por chamada");
  assert.ok(registro.ledger.every(chave => chave.startsWith(`dataforseo:${OPERACAO}:keyword_research:p`)));
  assert.ok(registro.ledger.every(chave => /:serp:/.test(chave)), "só a SERP entra no ledger DataForSEO");
  assert.ok(result.costs.budgetSpentUsd <= plan.costRange.maxUsd);
  assert.equal(result.costs.reportedCostUsd, Number((12 * 0.002).toFixed(6)), "o custo é só a SERP");
  assert.deepEqual(result.labsFailures, []);
  assert.deepEqual(result.adsFailures, []);
  assert.ok(Object.values(result.candidates).flat().every(item => item.origins.every(origem => origem === "ads_keyword_seed" || origem === "ads_url_seed")), "origens só do Google Ads");
  assert.ok(Object.values(result.candidates).flat().every(item => !item.rankedByUrl && item.estimate === null), "a semente por URL não liga rankedByUrl e não há estimativa");
  assert.equal(chamadasDeRede, 0);

  const avaliacao = result.evaluation;
  const captar = avaliacao.pages.find(pagina => pagina.keywordId === CAPTAR)!;
  const atrair = avaliacao.pages.find(pagina => pagina.keywordId === ATRAIR)!;
  assert.equal(avaliacao.state, "differentiated", avaliacao.reason);
  assert.equal(captar.state, "differentiated");
  assert.equal(captar.newPrincipal?.keyword, "anúncios para clínica de estética", "Posto Livre, sem ranquear, volume 320 > 10 e 3 páginas com a principal");
  assert.deepEqual(captar.secondaries.map(item => item.keyword), ["tráfego pago para estética"]);
  assert.ok(captar.newPrincipal!.sharedWithSiblings <= 1 && captar.newPrincipal!.sharedWithPage >= 2);
  assert.equal(atrair.newPrincipal, null, "Posto Travado: só secundárias");
  assert.deepEqual(atrair.secondaries.map(item => item.keyword).sort(), ["instagram para clínica de estética", "marketing de indicação estética"]);
  assert.match(atrair.warning || "", /Travado ao slug/);
  assert.deepEqual(avaliacao.before, [{ leftKeywordId: grupo.strongPairs[0].leftKeywordId, rightKeywordId: grupo.strongPairs[0].rightKeywordId, sharedPageCount: 6 }]);
  assert.ok(avaliacao.after.every(par => par.sharedPageCount <= 1), JSON.stringify(avaliacao.after));
  assert.ok(result.refused[CAPTAR].some(item => item.keyword === "como atrair pacientes estética"));
  assert.ok(result.refused[CAPTAR].some(item => item.keyword === "captar clientes estética grátis"), "sem volume nunca é proposta");
  assert.ok(result.refused[CAPTAR].some(item => item.keyword === "marketing para clínica de estética"), "outra publicada não entra");
});

test("rodada: ledger com a operação → nada é pago; plano adulterado → nada é pago", async () => {
  const { grupo, angles, plan, pageFootprints } = await montarPar();
  const usado = portasFalsas({ usado: true });
  const repetida = await runPublishedDifferentiation({ brandId: "marca", plan, group: grupo, angles, pageFootprints, publishedNormalized: new Set(), operationRequestId: OPERACAO, authorizedPlan: { planHash: plan.planHash, maxCostUsd: plan.costRange.maxUsd } }, usado.ports);
  assert.equal(repetida.ok, false);
  assert.equal((repetida as { code: string }).code, "OPERATION_ALREADY_EXECUTED");
  assert.equal(usado.registro.ideias.length + usado.registro.serp.length, 0);

  const limpo = portasFalsas();
  const adulterado = await runPublishedDifferentiation({ brandId: "marca", plan: { ...plan, hardCapUsd: 5 }, group: grupo, angles, pageFootprints, publishedNormalized: new Set(), operationRequestId: OPERACAO, authorizedPlan: { planHash: plan.planHash, maxCostUsd: 5 } }, limpo.ports);
  assert.equal((adulterado as { code: string }).code, "PLAN_TAMPERED");
  const semAutorizacao = await runPublishedDifferentiation({ brandId: "marca", plan, group: grupo, angles, pageFootprints, publishedNormalized: new Set(), operationRequestId: OPERACAO, authorizedPlan: null }, limpo.ports);
  assert.equal((semAutorizacao as { code: string }).code, "PAID_PLAN_REQUIRED");
  assert.equal(limpo.registro.ideias.length + limpo.registro.serp.length, 0);
});

test("rodada: prévia v1 (com Labs) nunca roda — recusada antes de qualquer chamada, sem pagar", async () => {
  const { grupo, angles, plan, pageFootprints } = await montarPar();
  const { ports, registro } = portasFalsas();
  const antiga = { ...plan, version: DIFFERENTIATION_LEGACY_PLAN_VERSION, pages: plan.pages.map(pagina => ({ ...pagina, ads: undefined, labs: [{ callId: "p1:keyword_ideas", endpoint: "keyword_ideas" as const, input: pagina.keyword }] })), adsTargeting: undefined };
  const desfecho = await runPublishedDifferentiation({ brandId: "marca", plan: antiga, group: grupo, angles, pageFootprints, publishedNormalized: new Set(), operationRequestId: OPERACAO, authorizedPlan: { planHash: plan.planHash, maxCostUsd: plan.costRange.maxUsd } }, ports);
  assert.equal(desfecho.ok, false);
  assert.equal((desfecho as { code: string }).code, "PAID_PLAN_CHANGED");
  assert.equal((desfecho as { message: string }).message, DIFFERENTIATION_PLAN_OUTDATED_MESSAGE);
  assert.equal(registro.ideias.length + registro.serp.length + registro.ledger.length + registro.ads, 0);
});

test("rodada: uma semente do Google Ads que falha segue com as outras; métricas fora usam a média da ideia", async () => {
  const { grupo, angles, plan, pageFootprints } = await montarPar("locked");
  const { ports, registro } = portasFalsas({ adsFalha: "keyword_and_url", volumesFalham: true });
  const desfecho = await runPublishedDifferentiation({ brandId: "marca", plan, group: grupo, angles, pageFootprints, publishedNormalized: new Set(), operationRequestId: OPERACAO, authorizedPlan: { planHash: plan.planHash, maxCostUsd: plan.costRange.maxUsd } }, ports);
  assert.ok(desfecho.ok, JSON.stringify(desfecho));
  if (!desfecho.ok) return;
  assert.deepEqual(desfecho.result.adsFailures?.map(item => item.kind), ["url_seed", "url_seed"]);
  assert.deepEqual(registro.usoAds.filter(item => item.resultStatus === "failed").map(item => item.suffix), ["url_seed:p1", "url_seed:p2"]);
  assert.equal(desfecho.result.adsVolumeFailed, true);
  assert.ok(desfecho.result.notices.some(aviso => /média mensal das ideias/.test(aviso)));
  assert.ok(desfecho.result.notices.some(aviso => /2 semente\(s\) do Google Ads falharam/.test(aviso)));
  const marketing = desfecho.result.candidates[ATRAIR]?.find(item => item.keyword === "marketing de indicação estética");
  assert.equal(marketing?.adsVolume, 50, "sem a métrica histórica, vale a média da ideia do Google Ads");
});

/* =========================== avaliação sintética =========================== */

function grupoSintetico(paginas: Array<Partial<DifferentiationPage> & { keywordId: string }>, ranqueia: Record<string, boolean> = {}): DifferentiationGroup {
  return {
    groupId: "dg-0000000000000000", serpFingerprint: "f", kept: false, anyRanking: false, maxSharedPages: 4, summary: "",
    strongPairs: [{ leftKeywordId: paginas[0].keywordId, rightKeywordId: paginas[1].keywordId, level: "strong", sharedPageCount: 4, sharedPages: [], outsideGroup: false, reason: "" }],
    probablePairs: [],
    members: paginas.map(pagina => ({
      page: { keyword: pagina.keywordId, url: null, canonical: null, slug: null, post: "free", volume: 10, volumeValidated: true, intent: null, entity: null, problem: null, articleId: null, articleKeywordCount: null, ...pagina },
      ranking: { ranks: Boolean(ranqueia[pagina.keywordId]), possiblyRanks: false, bestPosition: ranqueia[pagina.keywordId] ? 4 : null, hits: [], otherSitePages: [], label: ranqueia[pagina.keywordId] ? "Ranqueia: 4º no top 10 (mobile-android)." : "Não aparece no top 10." },
      pageCount: 10, lensesWithPages: 3,
    })),
  };
}
const pegada = (id: string, urls: string[]): KeywordSerpFootprint => ({ keywordId: id, keyword: id, lenses: [{ lens: "mobile-ios", urls, domains: null, collectedAt: null }] });
const u = (...ids: string[]) => ids.map(id => `https://s.com/${id}`);

test("página que ranqueia não troca a principal (Q3); teto de 6 corta as vagas", () => {
  const grupo = grupoSintetico([{ keywordId: "A", volume: 10 }, { keywordId: "B", articleKeywordCount: 5 }], { A: true });
  const indice = buildSerpSubjectIndex([
    pegada("A", u("a1", "a2", "a3", "x1")), pegada("B", u("b1", "b2", "b3", "x1")),
    pegada("cand:a-nova", u("a1", "a2", "a3", "n1")), pegada("cand:a-outra", u("a1", "a2", "n2", "n3")),
    pegada("cand:b-nova", u("b1", "b2", "b3", "m1")), pegada("cand:b-outra", u("b1", "b3", "m2")),
  ]);
  const candidatas = new Map([
    ["A", [candidata("a nova", { candidateId: "cand:a-nova", adsVolume: 500, serpMeasured: true, tier: "entity" }), candidata("a outra", { candidateId: "cand:a-outra", adsVolume: 200, serpMeasured: true, tier: "entity" })]],
    ["B", [candidata("b nova", { candidateId: "cand:b-nova", adsVolume: 400, serpMeasured: true, tier: "entity" }), candidata("b outra", { candidateId: "cand:b-outra", adsVolume: 300, serpMeasured: true, tier: "entity" })]],
  ]);
  const avaliacao = evaluateDifferentiation({ group: grupo, angles: [], candidates: candidatas, serp: indice });
  const a = avaliacao.pages.find(pagina => pagina.keywordId === "A")!;
  const b = avaliacao.pages.find(pagina => pagina.keywordId === "B")!;
  assert.equal(a.newPrincipal, null, "ranqueia: a principal fica");
  assert.match(a.principalNote || "", /já aparece no Google/);
  assert.equal(a.secondaries.length, 2);
  assert.equal(b.newPrincipal?.keyword, "b nova", "Posto Livre sem ranquear troca");
  assert.equal(b.secondaries.length, 0, "5 keywords no artigo: cabe só 1 nova (teto de 6)");
  assert.match(b.warning || "", /cabem só 1/);
});

test("diferenciação fraca e sem saída, com o motivo curto", () => {
  const grupo = grupoSintetico([{ keywordId: "A" }, { keywordId: "B" }]);
  const indice = buildSerpSubjectIndex([
    pegada("A", u("a1", "a2", "c1", "c2")), pegada("B", u("b1", "b2", "c1", "c2")),
    // Encaixa em A, mas divide 2 páginas com B: o Google ainda junta.
    pegada("cand:junta", u("a1", "a2", "c1", "c2", "z1")),
  ]);
  const fraca = evaluateDifferentiation({ group: grupo, angles: [], serp: indice, candidates: new Map([["A", [candidata("junta", { candidateId: "cand:junta", serpMeasured: true, tier: "entity", entityFit: true })]], ["B", []]]) });
  assert.equal(fraca.state, "weak");
  assert.equal(fraca.pages[0].state, "weak");
  assert.match(fraca.pages[0].reason, /O Google ainda junta 2 páginas/);
  assert.equal(fraca.pages[1].state, "no_way_out");
  assert.deepEqual(fraca.pages[0].secondaries, [], "a melhor possível nunca vira secundária");
  assert.equal(fraca.pages[0].bestEffort?.keyword, "junta", "fica só como evidência");
  assert.match(fraca.pages[0].reason, /não entra no aceite/);

  const semNada = evaluateDifferentiation({ group: grupo, angles: [], serp: indice, candidates: new Map([["A", [candidata("sem volume", { hasVolume: false, adsVolume: 0, estimate: 0 })]], ["B", []]]) });
  assert.equal(semNada.state, "no_way_out");
  assert.match(semNada.reason, /A decisão fica com você/);
});

test("separação conta a principal que a irmã MANTÉM; fraca só propõe o que cabe no slug", () => {
  // Travado primeiro na ordem: a nova principal da Livre não pode dividir 3 páginas com a principal que fica.
  const grupo = grupoSintetico([{ keywordId: "ATR", post: "locked" }, { keywordId: "CAP", post: "free" }]);
  const indice = buildSerpSubjectIndex([
    pegada("ATR", u("c1", "c2", "c3", "c4", "a1", "a2")), pegada("CAP", u("c1", "c2", "c3", "c4", "k1", "k2")),
    pegada("cand:y", u("a1", "a2", "y1", "y2")),
    pegada("cand:x", u("c1", "c2", "c3", "k1", "x1")),
    pegada("cand:z", u("k1", "k2", "c4", "z1")),
  ]);
  const avaliacao = evaluateDifferentiation({ group: grupo, angles: [], serp: indice, candidates: new Map([
    ["ATR", [candidata("y atrair", { candidateId: "cand:y", adsVolume: 100, serpMeasured: true, tier: "entity", entityFit: true })]],
    ["CAP", [candidata("x captar", { candidateId: "cand:x", adsVolume: 500, serpMeasured: true, tier: "entity", entityFit: true }), candidata("z captar", { candidateId: "cand:z", adsVolume: 400, serpMeasured: true, tier: "entity", entityFit: true })]],
  ]) });
  const cap = avaliacao.pages.find(pagina => pagina.keywordId === "CAP")!;
  assert.notEqual(cap.newPrincipal?.keyword, "x captar", "x divide 3 páginas com a principal que o Travado mantém");
  assert.ok(![cap.newPrincipal, ...cap.secondaries].some(item => item?.keyword === "x captar"));
  assert.equal(cap.newPrincipal?.keyword, "z captar");
  for (const pagina of avaliacao.pages) for (const item of [pagina.newPrincipal, ...pagina.secondaries]) if (item) assert.ok(item.separationOk && item.fitOk, item.keyword);
  const par = avaliacao.after[0];
  assert.equal(par.sharedPageCount, 1, "a principal mantida de ATR conta no depois (c4)");
  assert.equal(avaliacao.state, "differentiated");

  // Livre que NÃO troca (volume menor) mantém a principal: a irmã é medida contra ela.
  const semTroca = evaluateDifferentiation({ group: grupoSintetico([{ keywordId: "ATR", post: "locked" }, { keywordId: "CAP", post: "free", volume: 9000 }]), angles: [], serp: indice, candidates: new Map([
    ["ATR", [candidata("y atrair", { candidateId: "cand:y", adsVolume: 100, serpMeasured: true, tier: "entity", entityFit: true })]],
    ["CAP", [candidata("z captar", { candidateId: "cand:z", adsVolume: 400, serpMeasured: true, tier: "entity", entityFit: true })]],
  ]) });
  const capSem = semTroca.pages.find(pagina => pagina.keywordId === "CAP")!;
  assert.equal(capSem.newPrincipal, null);
  assert.match(capSem.principalNote || "", /régua da troca/);
  assert.equal(semTroca.after[0].sharedPageCount, 4, "as duas principais ficam: o Google ainda junta");
  assert.equal(semTroca.state, "weak");
  assert.match(semTroca.reason, /a principal que fica também conta/);

  // Fraca: candidata que não cabe no slug (só volume, 0 páginas com a página) não é "a melhor possível".
  const semEncaixe = evaluateDifferentiation({ group: grupo, angles: [], serp: buildSerpSubjectIndex([
    pegada("ATR", u("c1", "c2", "c3", "c4", "a1", "a2")), pegada("CAP", u("c1", "c2", "c3", "c4", "k1", "k2")),
    pegada("cand:curso", u("m1", "m2", "m3")),
  ]), candidates: new Map([["ATR", [candidata("curso de maquiagem", { candidateId: "cand:curso", adsVolume: 900, serpMeasured: true, tier: "volume_only" })]], ["CAP", []]]) });
  const atr = semEncaixe.pages.find(pagina => pagina.keywordId === "ATR")!;
  assert.equal(atr.state, "no_way_out");
  assert.equal(atr.bestEffort, null);
  assert.deepEqual(atr.secondaries, []);
});

/* ================================= aplicar ================================= */

const ATOR = "11111111-1111-4111-8111-111111111111";
const MARCA = "5b0e7c1a-2d3f-4a5b-8c9d-0e1f2a3b4c5d";
function referencia(keywordId: string, role: "principal" | "secundaria" | "reforco_narrativo") {
  return {
    keywordId, keywordDnaVersionId: `legacy:dna-${slugDe(keywordId)}:v1`, keywordDnaContentHash: `legacy:dna-${slugDe(keywordId)}`,
    role, strategicContribution: "Sustenta o artigo.", coveredIntentions: ["informacional"], requiredTopics: [], excludedTopics: [],
    classificationOrigin: "system" as const, confidence: 0.7, humanConfirmed: false,
    ...(role === "principal" ? { keywordUrlRelation: "confirmed_primary" as const } : {}),
  };
}
function artigo(principal: string, outras: string[], extra: Partial<ArticleDNA> = {}): ArticleDNA {
  return ArticleDNASchema.parse({
    schemaVersion: 1, articleId: `article-${slugDe(principal)}`, brandId: MARCA,
    principalKeywordId: principal, secondaryKeywordIds: outras, narrativeReinforcementIds: [],
    keywordReferences: [referencia(principal, "principal"), ...outras.map(id => referencia(id, "secundaria"))],
    siloId: null, hierarchy: "Suporte", suggestedSlug: slugDe(principal),
    canonical: `https://adalbapro.com.br/blog/${slugDe(principal)}`, mainIntent: "informacional", auxiliaryIntents: [],
    audience: "Donas de clínica", problem: "Agenda vazia", desiredResult: "Agenda cheia", journeyStage: "TOFU", brandObjective: "Serviço",
    promise: "Clientes", angle: "Prático", cta: "Conhecer", coverage: ["captação"], excludedSubjects: [],
    antiCannibalizationBoundary: "Não trata de gestão.", nearbyArticleIds: [], differentiation: [], entities: [], requiredTopics: [],
    questions: [], objections: [], evidenceNeeded: [], sourcesNeeded: [], internalLinks: [], alerts: [], confidence: 0.7, humanPendingDecisions: [],
    ...extra,
  });
}

async function rodadaDoPar() {
  const { grupo, angles, plan, pageFootprints } = await montarPar("locked");
  const desfecho = await runPublishedDifferentiation({ brandId: "marca", plan, group: grupo, angles, pageFootprints, publishedNormalized: new Set(), operationRequestId: "22222222-2222-4333-8444-555555555555", authorizedPlan: { planHash: plan.planHash, maxCostUsd: plan.costRange.maxUsd } }, portasFalsas().ports);
  if (!desfecho.ok) throw new Error(desfecho.message);
  return { grupo, result: desfecho.result };
}

test("aplicar: troca pelos mesmos gravadores, nota, excluídos e link; URL/slug/canonical iguais; nova só no Processador", async () => {
  const { grupo, result } = await rodadaDoPar();
  const captarAtual = artigo(CAPTAR, ["kw-anuncios"]);
  const atrairAtual = artigo(ATRAIR, []);
  const plano = planDifferentiationApply({
    groupId: grupo.groupId, members: grupo.members, results: result.evaluation.pages,
    articles: new Map([[CAPTAR, { articleId: captarAtual.articleId, payload: captarAtual }], [ATRAIR, { articleId: atrairAtual.articleId, payload: atrairAtual }]]),
    currentPosts: new Map([[CAPTAR, "free"], [ATRAIR, "locked"]]),
    existingByNormalized: new Map([[normalizeKeyword("anúncios para clínica de estética"), "kw-anuncios"]]),
    footprints: result.footprints, actorId: ATOR, decidedAt: "2026-09-27T15:00:00Z",
  });
  const captar = plano.pages.find(pagina => pagina.keywordId === CAPTAR)!;
  assert.equal(captar.swap.applied, true, captar.swap.reason);
  const nova = captar.nextPayload!;
  assert.equal(nova.principalKeywordId, "kw-anuncios");
  assert.equal(nova.keywordReferences.find(item => item.keywordId === CAPTAR)?.role, "secundaria", "a antiga vira secundária");
  for (const campo of ["articleId", "brandId", "suggestedSlug", "canonical"] as const) assert.equal(nova[campo], captarAtual[campo], campo);
  assert.equal(nova.primaryKeywordDecision?.actorId, ATOR);
  assert.ok(nova.excludedSubjects.includes("atrair pacientes"));
  assert.ok(nova.differentiation.some(linha => linha.startsWith(DIFFERENTIATION_NOTE_PREFIX) && /não cobrir "atrair pacientes"/.test(linha) && /linkar para ele/.test(linha)));
  assert.ok(nova.internalLinks.some(linha => linha.startsWith("Link interno sugerido: ") && linha.includes("como-atrair-pacientes")));
  assert.deepEqual(nova.nearbyArticleIds, [atrairAtual.articleId]);
  assert.deepEqual(captar.ingest.map(item => item.keyword), ["tráfego pago para estética"], "nova keyword vai ao Processador");
  assert.deepEqual(Object.keys(nova).filter(chave => !(chave in captarAtual)).sort(), ["primaryKeywordCandidates", "primaryKeywordDecision"], "nenhum campo novo no ArticleDNA");
  ArticleDNASchema.parse(nova);

  const atrair = plano.pages.find(pagina => pagina.keywordId === ATRAIR)!;
  assert.equal(atrair.swap.applied, false);
  assert.equal(atrair.nextPayload?.principalKeywordId, ATRAIR);
  assert.ok(atrair.nextPayload?.excludedSubjects.includes("captar clientes"));
  assert.equal(plano.ingestBatches.find(lote => lote.pageKeywordId === ATRAIR)?.subjectPhrase, ATRAIR, "tema = a principal publicada, como o Buscar reforço");
  assert.ok(differentiationReadbackConfirms({ written: nova, readback: nova, previous: captarAtual }));
  assert.equal(differentiationReadbackConfirms({ written: nova, readback: { ...nova, suggestedSlug: "outro" }, previous: captarAtual }), false);

  assert.deepEqual(differentiationEditorialLines(nova.differentiation), nova.differentiation.filter(linha => linha.startsWith(DIFFERENTIATION_NOTE_PREFIX)));
  assert.deepEqual(differentiationEditorialLines(["texto antigo sem prefixo"]), [], "sem nota, o Redator recebe o mesmo de antes");
});

test("aplicar: Posto travado depois da proposta, sem ArticleDNA, keyword fora do artigo e repetição", async () => {
  const { grupo, result } = await rodadaDoPar();
  const captarAtual = artigo(CAPTAR, []);
  const base = {
    groupId: grupo.groupId, members: grupo.members, results: result.evaluation.pages,
    existingByNormalized: new Map([[normalizeKeyword("anúncios para clínica de estética"), "kw-anuncios"]]),
    footprints: result.footprints, actorId: ATOR, decidedAt: "2026-09-27T15:00:00Z",
  };
  const travou = planDifferentiationApply({ ...base, articles: new Map([[CAPTAR, { articleId: captarAtual.articleId, payload: captarAtual }], [ATRAIR, null]]), currentPosts: new Map([[CAPTAR, "locked"]]) });
  const captar = travou.pages.find(pagina => pagina.keywordId === CAPTAR)!;
  assert.equal(captar.swap.applied, false);
  assert.match(captar.swap.reason, /Travado ao slug/);
  assert.equal(captar.nextPayload?.principalKeywordId, CAPTAR, "a nota é gravada; a principal fica");
  const fora = planDifferentiationApply({ ...base, articles: new Map([[CAPTAR, { articleId: captarAtual.articleId, payload: captarAtual }], [ATRAIR, null]]), currentPosts: new Map([[CAPTAR, "free"]]) });
  const captarFora = fora.pages.find(pagina => pagina.keywordId === CAPTAR)!;
  assert.deepEqual(captarFora.formation.map(item => [item.keywordId, item.role]), [["kw-anuncios", "principal"]], "no Minerador, fora do artigo: entra pela formação");
  assert.match(captarFora.swap.reason, /traga-a pela formação/);
  const semDna = fora.pages.find(pagina => pagina.keywordId === ATRAIR)!;
  assert.equal(semDna.nextPayload, null);
  // 2026-09-28: publicado nunca passa por "Concluir formação"; o ArticleDNA nasce no "Reforçar publicados".
  assert.match(semDna.refusal || "", /use "Reforçar publicados" \(ele cria o ArticleDNA, sem custo\)/);
  assert.doesNotMatch(semDna.refusal || "", /Concluir formação/);

  // Q3 relido agora: a página passou a aparecer no Google, ou a SERP não pôde ser relida → a principal fica.
  const artigosCaptar = new Map([[CAPTAR, { articleId: captarAtual.articleId, payload: artigo(CAPTAR, ["kw-anuncios"]) }], [ATRAIR, null]]);
  const ranqueouAgora = planDifferentiationApply({ ...base, articles: artigosCaptar, currentPosts: new Map([[CAPTAR, "free"]]), currentRankings: new Map([[CAPTAR, { ranks: true, possiblyRanks: false }]]) });
  assert.match(ranqueouAgora.pages.find(pagina => pagina.keywordId === CAPTAR)!.swap.reason, /aparece no Google/);
  const semLeitura = planDifferentiationApply({ ...base, articles: artigosCaptar, currentPosts: new Map([[CAPTAR, "free"]]), currentRankings: null });
  assert.match(semLeitura.pages.find(pagina => pagina.keywordId === CAPTAR)!.swap.reason, /Não deu para reler a SERP/);
  const leuLimpo = planDifferentiationApply({ ...base, articles: artigosCaptar, currentPosts: new Map([[CAPTAR, "free"]]), currentRankings: new Map([[CAPTAR, { ranks: false, possiblyRanks: false }], [ATRAIR, { ranks: false, possiblyRanks: false }]]) });
  assert.equal(leuLimpo.pages.find(pagina => pagina.keywordId === CAPTAR)!.swap.applied, true);

  const repetida = withDifferentiationFields({ current: captarFora.nextPayload!, angle: "captar clientes", siblings: [{ keywordId: ATRAIR, keyword: ATRAIR, url: grupo.members.find(membro => membro.page.keywordId === ATRAIR)!.page.url, angle: "atrair pacientes", articleId: null }], decidedAt: "2026-09-27T16:00:00Z", groupId: grupo.groupId });
  assert.equal(repetida.changed, false, "nova versão só com mudança real");
  const comAssunto = withDifferentiationFields({ current: artigo(CAPTAR, [], { subject: undefined }), angle: "x", siblings: [{ keywordId: "s", keyword: "s", url: null, angle: "atrair pacientes", articleId: null }], decidedAt: "2026-09-27T16:00:00Z", groupId: "g" });
  assert.ok(comAssunto.changed);
});

test("aceite leva só as Diferenciado por padrão; fraca marcada recebe só a nota, nunca keyword", async () => {
  const { grupo, result } = await rodadaDoPar();
  const captarAtual = artigo(CAPTAR, []);
  const atrairAtual = artigo(ATRAIR, []);
  // Avaliação gravada antes da correção: a fraca trazia a melhor possível em secundárias.
  const resultados = result.evaluation.pages.map(pagina => pagina.keywordId === ATRAIR
    ? { ...pagina, state: "weak" as const, newPrincipal: null, secondaries: [{ ...pagina.secondaries[0], keyword: "curso de maquiagem", candidateId: "cand:curso de maquiagem", separationOk: false, fitOk: false }] }
    : pagina);
  const base = {
    groupId: grupo.groupId, members: grupo.members, results: resultados,
    articles: new Map([[CAPTAR, { articleId: captarAtual.articleId, payload: captarAtual }], [ATRAIR, { articleId: atrairAtual.articleId, payload: atrairAtual }]]),
    currentPosts: new Map([[CAPTAR, "free" as const], [ATRAIR, "locked" as const]]),
    existingByNormalized: new Map<string, string>(), footprints: result.footprints, actorId: ATOR, decidedAt: "2026-09-27T15:00:00Z",
  };
  const padrao = planDifferentiationApply(base);
  assert.deepEqual(padrao.pages.map(pagina => pagina.keywordId), [CAPTAR], "só a Diferenciado entra sem a marca da pessoa");
  assert.ok(!padrao.ingestBatches.some(lote => lote.items.some(item => item.keyword === "curso de maquiagem")));

  const marcada = planDifferentiationApply({ ...base, selectedPageIds: new Set([ATRAIR]) });
  const atrair = marcada.pages.find(pagina => pagina.keywordId === ATRAIR)!;
  assert.deepEqual([atrair.ingest, atrair.formation], [[], []], "fraca marcada: nenhuma keyword");
  assert.equal(atrair.swap.applied, false);
  assert.ok(atrair.nextPayload?.differentiation.some(linha => linha.startsWith(DIFFERENTIATION_NOTE_PREFIX)), "só a nota do ângulo");
  assert.equal(marcada.ingestBatches.length, 0);
});

test("Redator: a nota de diferenciação desce no editorialContext do envio; sem nota, o documento é o mesmo", () => {
  const HASH = `sha256:${"a".repeat(64)}`;
  const ref = (entityId: string, versionId: string) => ({ entityId, versionId, contentHash: HASH });
  const dossie = {
    analysis: { versionId: "analysis-v3", versionNumber: 3, payload: { articleId: "article-1" } },
    article: { brandId: "brand-1", articleId: "article-1", articleDnaVersionId: "art-v2", articleDnaContentHash: HASH },
    profile: "GOOGLE", blueprintView: {}, bundle: { bundleId: "bundle-id-1", bundleHash: "bundle-hash-1" },
    authorities: null,
    keywordContext: { principal: CAPTAR, secondary: [], narrativeReinforcements: [], resolution: "ARTICLE_DNA_HYDRATION" },
    readiness: { ready: true, headline: "Pronto", blocks: [] },
  };
  const montar = (extra: Record<string, unknown>) => buildRadarDocument({
    documentId: radarDocumentId("brand-1", "article-1"), dossier: dossie, radarItemId: "radar:1",
    title: "Como captar clientes", slug: "como-captar-clientes-para-clinica-de-estetica",
    brandDnaRef: ref("brand-dna", "brand-v1"), siloDnaRef: ref("silo-1", "silo-v1"), keywordDnaRefs: [ref("kw-1", "kw-v1")],
    actorUserId: "user-1", now: "2026-09-27T12:00:00.000Z", ...extra,
  } as never);
  const nota = `${DIFFERENTIATION_NOTE_PREFIX}ângulo "captar clientes"; não cobrir "atrair pacientes" — é do artigo "${ATRAIR}" (https://adalbapro.com.br/blog/x); linkar para ele.`;
  const com = montar({ differentiation: ["Diferencia-se pela captação ativa (texto antigo, sem prefixo).", nota] });
  assert.deepEqual(com.importedContext.editorialContext, [nota], "só as linhas com o prefixo descem");
  const semNota = montar({});
  assert.deepEqual(semNota.importedContext.editorialContext, []);
  assert.equal(JSON.stringify(montar({ differentiation: [] })), JSON.stringify(semNota), "sem nota, byte a byte o de antes");
  assert.equal(JSON.stringify(montar({ differentiation: ["texto antigo sem prefixo"] })), JSON.stringify(semNota));
  const muitas = montar({ differentiation: Array.from({ length: 6 }, (_, indice) => `${DIFFERENTIATION_NOTE_PREFIX}linha ${indice + 1}`) });
  assert.equal(muitas.importedContext.editorialContext.length, 4, "no máximo 4 linhas");
  // Com Assunto: as linhas do Assunto vêm antes; a nota fecha o contexto.
  const subject = {
    keywordId: "kw-assunto", phrase: "Captação de clientes para clínica", note: null, destinationUrl: null,
    approvedPackageRef: { version: 3, contentHash: `sha256:${"p".repeat(64)}`, approvedAt: "2026-09-24T10:00:00+00:00" },
    attachedBy: "00000000-0000-4000-8000-000000000004", attachedAt: "2026-09-24T12:00:00+00:00",
  };
  const soAssunto = montar({ subject }).importedContext.editorialContext;
  const comAssunto = montar({ subject, differentiation: [nota] }).importedContext.editorialContext;
  assert.ok(soAssunto.length > 0);
  assert.deepEqual(comAssunto, [...soAssunto, nota], "o Assunto primeiro, a nota depois");
  assert.equal(chamadasDeRede, 0);
});
