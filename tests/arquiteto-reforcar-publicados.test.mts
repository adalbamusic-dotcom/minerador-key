import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import type { ArchitectKeyword, ArticleDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { articleApprovalRevalidationIssues } from "../lib/arquiteto/article-approval-revalidation.ts";
import { buildSerpSubjectIndex, type KeywordSerpFootprint } from "../lib/arquiteto/serp-subject-overlap.ts";
import { proposePublishedPrimarySwap } from "../lib/arquiteto/published-primary-swap.ts";
import { formationKeywordOfPage, type DifferentiationPage } from "../lib/arquiteto/published-differentiation.ts";
import { differentiationCandidateId, type DifferentiationCandidate, type DifferentiationRunPorts } from "../lib/arquiteto/published-differentiation-run.ts";
import {
  PUBLISHED_REINFORCEMENT_APPROVAL_TEXT,
  buildFirstPublishedArticleDna,
  describePublishedReinforcementOutcome,
  planPublishedReinforcementPage,
  publishedReinforcementReadbackConfirms,
  publishedSlugOf,
  withHumanArticleApproval,
  withReinforcementKeywords,
  type PublishedReinforcementPageFacts,
  type ReinforcementKeywordFacts,
} from "../lib/arquiteto/published-reinforcement.ts";
import {
  REINFORCEMENT_MAX_COST_USD,
  buildReinforcementSearchPlan,
  describeReinforcementSearchResult,
  evaluateReinforcementSearch,
  filterReinforcementCandidates,
  partitionReinforcementPages,
  reinforcementSearchId,
  runReinforcementSearch,
  verifyReinforcementSearchPlanHash,
} from "../lib/arquiteto/published-reinforcement-search.ts";
import { normalizeKeyword } from "../lib/minerador/keyword-import-core.ts";

/**
 * REFORÇAR PUBLICADOS (SDD docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md).
 *
 * Domínio puro, com a leitura real da AdalbaPro (top 10 do cache de
 * 2026-09-26). Nenhuma rede, nenhum crédito, nenhum banco.
 */

let chamadasDeRede = 0;
globalThis.fetch = (async () => {
  chamadasDeRede += 1;
  throw new Error("Rede proibida nos testes do Reforçar publicados.");
}) as typeof fetch;

type Linha = { keywordId: string; keyword: string; volume: number | null; intent: string | null; published: boolean; lenses: Array<{ lens: string; urls: string[] | null }> };
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/arquiteto-serp-mesmo-assunto-adalbapro.json", import.meta.url), "utf8")) as { keywords: Linha[] };
const LINHA = new Map(FIXTURE.keywords.map(linha => [linha.keywordId, linha]));
const pegada = (keywordId: string, comoId = keywordId): KeywordSerpFootprint => {
  const linha = LINHA.get(keywordId)!;
  return { keywordId: comoId, keyword: linha.keyword, lenses: linha.lenses.map(leitura => ({ lens: leitura.lens, urls: leitura.urls, domains: null, collectedAt: "2026-09-20T12:00:00+00:00" })) };
};

const MARCA = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const TERRITORIO = "territory:0b8f7c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const OUTRO_TERRITORIO = "territory:1c9f7c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

const slugify = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pagina = (keywordId: string, extra: Partial<DifferentiationPage> = {}): DifferentiationPage => {
  const linha = LINHA.get(keywordId)!;
  const url = `https://adalbapro.com.br/blog/${slugify(linha.keyword)}`;
  return { keywordId, keyword: linha.keyword, url, canonical: url, slug: `/blog/${slugify(linha.keyword)}`, post: "free", volume: linha.volume, volumeValidated: Boolean(linha.volume), intent: linha.intent, entity: null, problem: null, articleId: null, articleKeywordCount: null, ...extra };
};
const fato = (keywordId: string, extra: Partial<ReinforcementKeywordFacts> = {}): ReinforcementKeywordFacts => {
  const linha = LINHA.get(keywordId)!;
  return { keywordId, keyword: linha.keyword, workflowItemId: `wi-${keywordId}`, lockVersion: 3, received: true, territoryRef: TERRITORIO, formationRef: null, isPublished: linha.published, volume: linha.volume, volumeValidated: Boolean(linha.volume), ...extra };
};
const fatos = (extra: Partial<PublishedReinforcementPageFacts> = {}): PublishedReinforcementPageFacts => ({
  page: pagina("kw-01"),
  item: fato("kw-01"),
  members: [],
  article: null,
  ranking: { ranks: false, possiblyRanks: false, label: "Não aparece no top 10." },
  chosen: [],
  unknownIds: [],
  newKeywords: [],
  newMissing: [],
  swapKeywordId: null,
  swapProposal: null,
  ...extra,
});
const escolhida = (keywordId: string, extra: Partial<ReinforcementKeywordFacts> = {}, level: "strong" | "probable" | null = "strong", paginas = 7) => ({ ...fato(keywordId, extra), level, sharedPageCount: paginas });

/* ============================ 1. o plano de uma página ============================ */

test("plano: publicado sem ArticleDNA ganha o PRIMEIRO, mesmo sem reforço (acaba o 'conclua a formação')", () => {
  const plano = planPublishedReinforcementPage(fatos());
  assert.equal(plano.status, "ready");
  assert.equal(plano.dna.mode, "first");
  assert.equal(plano.articleId, "kw-01", "o id do ArticleDNA é a keyword publicada");
  assert.match(plano.lines[0], /cria o ArticleDNA do publicado \(versão 1\), aprovado por você/);
  assert.ok(plano.lines.includes("URL, slug e canonical não mudam."));
  assert.ok(!plano.lines.join(" ").includes("Concluir formação"));
});

test("plano: recusa a página inteira quando falta o essencial, com o motivo", () => {
  assert.match(planPublishedReinforcementPage(fatos({ item: null })).refusal!, /ainda não está no Arquiteto/);
  assert.match(planPublishedReinforcementPage(fatos({ item: fato("kw-01", { territoryRef: null }) })).refusal!, /não tem Silo confirmado/);
  assert.match(planPublishedReinforcementPage(fatos({ page: pagina("kw-01", { url: null }) })).refusal!, /não tem URL no Vínculo/);
});

test("plano: cada keyword é conferida — publicada, sem volume, outro artigo, o Google não junta, fora do Arquiteto", () => {
  const plano = planPublishedReinforcementPage(fatos({
    chosen: [
      escolhida("kw-09"),
      escolhida("kw-03", { isPublished: true }),
      escolhida("kw-10", { volumeValidated: false }),
      escolhida("kw-11", { formationRef: "article-formation:outro" }),
      escolhida("kw-13", {}, null, 1),
      escolhida("kw-12", { received: false }),
      escolhida("kw-14", { territoryRef: OUTRO_TERRITORIO }, "probable", 2),
    ],
  }));
  assert.equal(plano.status, "ready");
  assert.deepEqual(plano.add.map(item => item.keywordId), ["kw-09", "kw-14"]);
  assert.equal(plano.add.find(item => item.keywordId === "kw-14")!.fromTerritoryRef, OUTRO_TERRITORIO, "de outro Silo: muda de Silo na mesma confirmação");
  const motivos = Object.fromEntries(plano.refused.map(item => [item.keyword, item.reason]));
  assert.match(motivos["como atrair clientes para consultório"], /duas publicadas nunca se fundem/);
  assert.match(motivos["como atrair pacientes para o consultório"], /Sem volume do Google Ads/);
  assert.match(motivos["como atrair mais pacientes"], /outro artigo por decisão sua/);
  assert.match(motivos["como atrair pacientes particulares"], /O Google não junta/);
  assert.match(motivos["como atrair mais pacientes para o consultorio"], /Ainda não está no Arquiteto/);
  assert.ok(plano.lines.some(linha => /muda para o Silo do publicado/.test(linha)));
});

test("plano: teto de 6 — quem já está no ArticleDNA conta primeiro e nenhuma keyword some", () => {
  const artigo = { articleId: "kw-01", versionId: "v-1", versionNumber: 1, payload: { principalKeywordId: "kw-01", brandId: MARCA, keywordReferences: ["kw-01", "kw-09", "kw-10", "kw-11"].map(keywordId => ({ keywordId, role: keywordId === "kw-01" ? "principal" : "secundaria" })), primaryKeywordDecision: undefined } as never };
  const plano = planPublishedReinforcementPage(fatos({
    article: artigo,
    chosen: [escolhida("kw-12"), escolhida("kw-13"), escolhida("kw-14")],
  }));
  assert.equal(plano.dna.mode, "successor");
  assert.deepEqual(plano.keep.map(item => item.keywordId), ["kw-09", "kw-10", "kw-11"], "o que o ArticleDNA tem continua");
  assert.deepEqual(plano.add.map(item => item.keywordId), ["kw-12", "kw-13"], "4 + 2 = 6");
  assert.match(plano.refused.find(item => item.keyword === "como atrair clientes para clinica medica")!.reason, /teto de 6/);
  assert.match(plano.lines[0], /nova versão do ArticleDNA \(v2\)/);
});

test("plano: formação gravada com outra principal (decisão humana) ou membro no ArticleDNA de outro artigo recusa a página; escolhida noutro ArticleDNA é recusada", () => {
  const outraPrincipal = planPublishedReinforcementPage(fatos({ item: fato("kw-01", { formationRef: "article-formation:x" }), members: [fato("kw-09", { formationRef: "article-formation:x", formationRole: "principal" })] }));
  assert.equal(outraPrincipal.status, "refused");
  assert.match(outraPrincipal.refusal ?? "", /tem "[^"]+" como principal, por decisão sua/);
  const noutroArtigo = planPublishedReinforcementPage(fatos({ item: fato("kw-01", { formationRef: "article-formation:x" }), members: [fato("kw-09", { formationRef: "article-formation:x", otherArticleId: "kw-03" })] }));
  assert.equal(noutroArtigo.status, "refused");
  assert.match(noutroArtigo.refusal ?? "", /no ArticleDNA de outro artigo/);
  const escolhidaAlheia = planPublishedReinforcementPage(fatos({ chosen: [escolhida("kw-09", { otherArticleId: "kw-03" })] }));
  assert.deepEqual(escolhidaAlheia.add, []);
  assert.match(escolhidaAlheia.refused[0].reason, /Já está no ArticleDNA de outro artigo/);
});

test("plano: ArticleDNA de outra principal recusa a página; o mesmo conteúdo não gera versão", () => {
  const outra = { articleId: "a", versionId: "v", versionNumber: 2, payload: { principalKeywordId: "kw-09", brandId: MARCA, keywordReferences: [{ keywordId: "kw-09", role: "principal" }] } as never };
  assert.match(planPublishedReinforcementPage(fatos({ article: outra })).refusal!, /outra principal/);
  const mesmo = { articleId: "kw-01", versionId: "v", versionNumber: 1, payload: { principalKeywordId: "kw-01", brandId: MARCA, keywordReferences: [{ keywordId: "kw-01", role: "principal" }, { keywordId: "kw-09", role: "secundaria" }] } as never };
  const plano = planPublishedReinforcementPage(fatos({ article: mesmo, chosen: [escolhida("kw-09")] }));
  assert.equal(plano.status, "unchanged");
  assert.equal(plano.dna.mode, "none");
});

test("troca: só Posto Livre, sem ranquear, substituta no artigo e pela régua da troca; Travado só secundárias", () => {
  const serp = buildSerpSubjectIndex([pegada("kw-03"), pegada("kw-10")]);
  const page = pagina("kw-03");
  const proposta = proposePublishedPrimarySwap({
    published: formationKeywordOfPage(page), post: "free", identity: { url: page.url, canonical: page.canonical, slug: page.slug },
    candidates: [{ ...formationKeywordOfPage(pagina("kw-10")), isPublished: false, volumeValidated: true }], serp,
  });
  assert.equal(proposta.state, "proposed");
  const base = fatos({ page, item: fato("kw-03"), chosen: [escolhida("kw-10", {}, "strong", 5)], swapKeywordId: "kw-10", swapProposal: proposta });
  const livre = planPublishedReinforcementPage(base);
  assert.equal(livre.swap.state, "apply");
  assert.match(livre.swap.reason, /"como atrair pacientes para o consultório" assume a principal; "como atrair clientes para consultório" fica como secundária/);
  assert.equal(planPublishedReinforcementPage({ ...base, page: { ...page, post: "locked" } }).swap.state, "refused");
  assert.match(planPublishedReinforcementPage({ ...base, page: { ...page, post: "locked" } }).swap.reason, /Travado ao slug/);
  assert.match(planPublishedReinforcementPage({ ...base, page: { ...page, post: "unknown" } }).swap.reason, /não está declarado/);
  assert.match(planPublishedReinforcementPage({ ...base, ranking: { ranks: true, possiblyRanks: false, label: "Posição 4." } }).swap.reason, /aparece no Google/);
  assert.match(planPublishedReinforcementPage({ ...base, ranking: null }).swap.reason, /Não deu para reler a SERP/);
  assert.match(planPublishedReinforcementPage({ ...base, chosen: [] }).swap.reason, /não está no artigo nesta confirmação/);
  // A recusa da troca não impede o reforço.
  const travado = planPublishedReinforcementPage({ ...base, page: { ...page, post: "locked" } });
  assert.deepEqual(travado.add.map(item => item.keywordId), ["kw-10"]);
});

test("keyword nova: só com volume do Google Ads, e a confirmação diz que o dono aprova no Minerador", () => {
  const plano = planPublishedReinforcementPage(fatos({
    newKeywords: [
      { keyword: "captar pacientes clínica", normalizedKeyword: "captar pacientes clinica", adsVolume: 50, level: "strong", sharedPageCount: 4, origins: ["ads_url_seed"], evidence: [], searchId: "11111111-1111-4111-8111-111111111111", existingKeywordId: null },
      { keyword: "sem volume", normalizedKeyword: "sem volume", adsVolume: 0, level: "strong", sharedPageCount: 4, origins: ["ads_url_seed"], evidence: [], searchId: "11111111-1111-4111-8111-111111111111", existingKeywordId: null },
    ],
    newMissing: ["inventada"],
  }));
  assert.deepEqual(plano.create.map(item => item.keyword), ["captar pacientes clínica"]);
  assert.match(plano.refused.find(item => item.keyword === "sem volume")!.reason, /Sem volume do Google Ads/);
  assert.match(plano.refused.find(item => item.keyword === "inventada")!.reason, /Não está no resultado gravado da busca/);
  assert.ok(plano.lines.some(linha => /importadas no Minerador e aprovadas por você/.test(linha)));
  // A que já existe no Minerador não é "importada": a frase diz que ela já está lá.
  const existente = planPublishedReinforcementPage(fatos({ newKeywords: [{ keyword: "gestão de clínica", normalizedKeyword: "gestao de clinica", adsVolume: 50, level: "probable", sharedPageCount: 2, origins: ["ads_keyword_seed"], evidence: [], searchId: "11111111-1111-4111-8111-111111111111", existingKeywordId: "kw-77" }] }));
  assert.ok(existente.lines.some(linha => /1 keyword que já está no Minerador \(aprovadas por você e enviadas ao Arquiteto\): "gestão de clínica"/.test(linha)), existente.lines.join(" | "));
  assert.ok(!existente.lines.some(linha => /importadas/.test(linha)));
  assert.match(PUBLISHED_REINFORCEMENT_APPROVAL_TEXT, /você aprova estas keywords no Minerador/);
});

/* ============================== 2. o ArticleDNA ============================== */

const linhaDaMesa = (keywordId: string, extra: Record<string, unknown> = {}): ArchitectKeyword => {
  const linha = LINHA.get(keywordId)!;
  return { id: keywordId, keyword: linha.keyword, intent: linha.intent ?? "Informativo", volume_search: linha.volume, status: "aprovado", analise_semantica: {}, isPublished: linha.published, territoryRef: TERRITORIO, ...extra } as unknown as ArchitectKeyword;
};

test("primeiro ArticleDNA do publicado: identidade do site, guarda do publicado e pai = território", () => {
  const page = pagina("kw-01");
  const feito = buildFirstPublishedArticleDna({
    brandId: MARCA, page, territoryRef: TERRITORIO,
    keywords: [linhaDaMesa("kw-01", { url: "https://errada.com/x" }), linhaDaMesa("kw-09", { url: "https://outra.com/nao" })],
    roles: { "kw-01": "principal", "kw-09": "secundaria" },
    siloVersions: [],
  });
  assert.equal(feito.ok, true, feito.ok ? "" : feito.reason);
  if (!feito.ok) return;
  const dna = feito.payload;
  assert.equal(dna.articleId, "kw-01");
  assert.equal(dna.principalKeywordId, "kw-01");
  assert.equal(dna.brandId, MARCA);
  assert.equal(dna.suggestedSlug, "como-atrair-pacientes-para-clinica", "o slug é o último segmento da URL publicada");
  assert.equal(dna.canonical, page.canonical);
  assert.equal(dna.publishedIdentityRef?.publicationStatus, "published_protected");
  assert.equal(dna.publishedIdentityRef?.publishedUrl, page.url, "só a principal carrega a URL: a de apoio não cria conflito");
  assert.equal(dna.territoryRef, TERRITORIO);
  assert.equal(dna.siloId, null, "sem Silo canônico ainda: estágio INITIAL");
  assert.deepEqual(dna.secondaryKeywordIds, ["kw-09"]);
  assert.equal(publishedSlugOf("https://adalbapro.com.br/blog/abc/"), "abc");
  // Convenção registrada na SDD §3.1: o suggestedSlug do publicado é o último segmento da URL;
  // o caminho inteiro fica só na identidade protegida da troca (a mesa o lê assim).

  // A confirmação é a aprovação humana: arquitetura confirmada e a evidência SERP do artigo;
  // sem isso, a mesma portaria da rota de artefatos recusa.
  const envelope = (payload: ArticleDNA) => ({ payload }) as VersionEnvelope<ArticleDNA>;
  assert.deepEqual(articleApprovalRevalidationIssues({ version: envelope(dna), authorizedBrandId: MARCA }).map(issue => issue.code), ["ARCHITECTURE_NOT_CONFIRMED", "SERP_EVIDENCE_MISSING"]);
  const serpRef = { entityId: "assessment-1", versionId: "assessment-1:base-1", contentHash: `sha256:${"a".repeat(64)}` };
  const aprovado = withHumanArticleApproval(dna, serpRef);
  assert.deepEqual(articleApprovalRevalidationIssues({ version: envelope(aprovado), authorizedBrandId: MARCA }), []);
  assert.equal(aprovado.architectureStatus, "architecture_confirmed");
  assert.deepEqual(aprovado.serpAssessmentRef, serpRef);
  assert.equal(aprovado.primaryKeywordPolicy, dna.primaryKeywordPolicy, "o Posto do publicado não é travado pelo reforço");
  assert.equal(aprovado.suggestedSlug, dna.suggestedSlug);
  assert.deepEqual(articleApprovalRevalidationIssues({ version: envelope(withHumanArticleApproval(dna, null)), authorizedBrandId: MARCA }).map(issue => issue.code), ["SERP_EVIDENCE_MISSING"]);

  // Reforço narrativo decidido por humano não vira secundária.
  const comReforco = buildFirstPublishedArticleDna({ brandId: MARCA, page, territoryRef: TERRITORIO, keywords: [linhaDaMesa("kw-01"), linhaDaMesa("kw-09"), linhaDaMesa("kw-10")], roles: { "kw-01": "principal", "kw-09": "reforco_narrativo", "kw-10": "secundaria" }, siloVersions: [] });
  assert.ok(comReforco.ok);
  if (comReforco.ok) {
    assert.deepEqual(comReforco.payload.narrativeReinforcementIds, ["kw-09"]);
    assert.deepEqual(comReforco.payload.secondaryKeywordIds, ["kw-10"]);
  }
});

test("sucessora: acrescenta as keywords, não tira nenhuma e copia identidade e decisões", () => {
  const primeiro = buildFirstPublishedArticleDna({ brandId: MARCA, page: pagina("kw-01"), territoryRef: TERRITORIO, keywords: [linhaDaMesa("kw-01"), linhaDaMesa("kw-09")], roles: {}, siloVersions: [] });
  assert.ok(primeiro.ok);
  if (!primeiro.ok) return;
  const atual = { ...primeiro.payload, differentiation: ["Diferenciação: nota humana"] };
  const sucessora = withReinforcementKeywords({ current: atual, brandId: MARCA, add: [linhaDaMesa("kw-09"), linhaDaMesa("kw-10"), linhaDaMesa("kw-11")], decidedAt: "2026-09-28T12:00:00Z" });
  assert.equal(sucessora.changed, true);
  assert.deepEqual(sucessora.payload.keywordReferences.map(reference => reference.keywordId), ["kw-01", "kw-09", "kw-10", "kw-11"]);
  assert.deepEqual(sucessora.payload.differentiation, ["Diferenciação: nota humana"], "decisão humana anterior preservada");
  assert.equal(sucessora.payload.suggestedSlug, atual.suggestedSlug);
  assert.equal(sucessora.payload.canonical, atual.canonical);
  assert.equal(publishedReinforcementReadbackConfirms({ written: sucessora.payload, readback: sucessora.payload, previous: atual }), true);
  // Releitura sem uma keyword, ou com slug trocado, não confirma.
  const semUma = { ...sucessora.payload, keywordReferences: sucessora.payload.keywordReferences.slice(0, 3) };
  assert.equal(publishedReinforcementReadbackConfirms({ written: sucessora.payload, readback: semUma, previous: atual }), false);
  assert.equal(publishedReinforcementReadbackConfirms({ written: sucessora.payload, readback: { ...sucessora.payload, suggestedSlug: "outro" }, previous: atual }), false);
  assert.equal(withReinforcementKeywords({ current: atual, brandId: MARCA, add: [linhaDaMesa("kw-09")], decidedAt: "2026-09-28T12:00:00Z" }).changed, false, "nova versão só com mudança real");
});

test("mensagens: sucesso só com gravação confirmada; nada gravado é informação, não sucesso", () => {
  assert.equal(describePublishedReinforcementOutcome([], null).tone, "info");
  assert.match(describePublishedReinforcementOutcome([], null).message, /^Nada foi gravado/);
  const ok = describePublishedReinforcementOutcome([{ publishedKeywordId: "kw-01", keyword: "x", written: true, versionNumber: 1, added: 2, created: 1, swapApplied: false, error: null }], null);
  assert.equal(ok.tone, "success");
  assert.match(ok.message, /1 artigo publicado gravado e confirmados na releitura, com 3 keywords novas nos artigos/);
  const parou = describePublishedReinforcementOutcome([{ publishedKeywordId: "kw-01", keyword: "x", written: false, versionNumber: null, added: 0, created: 0, swapApplied: false, error: "a Lógica não foi confirmada" }], "\"x\": a Lógica não foi confirmada");
  assert.equal(parou.tone, "warning");
  assert.match(parou.message, /Não gravado: "x" \(a Lógica não foi confirmada\) — nada foi gravado nele/);
  // Parou no 3º de 5: diz o que já ficou gravado no que falhou e nomeia os que nem foram tentados.
  const meio = describePublishedReinforcementOutcome([
    { publishedKeywordId: "a", keyword: "a", written: true, versionNumber: 1, added: 0, created: 0, swapApplied: false, error: null },
    { publishedKeywordId: "b", keyword: "b", written: false, versionNumber: null, added: 0, created: 0, swapApplied: false, error: "a composição não foi gravada: lock vencido", partial: ["1 keyword(s) importada(s) no Minerador (\"n\")", "a Lógica delas", "aprovação de 1 no Minerador", "envio de 1 ao Arquiteto"] },
  ], "\"b\": a composição não foi gravada: lock vencido", ["c", "d"]);
  assert.equal(meio.tone, "warning");
  assert.match(meio.message, /Não gravado: "b" \(a composição não foi gravada: lock vencido\) — já ficou gravado: 1 keyword\(s\) importada\(s\) no Minerador \("n"\); a Lógica delas; aprovação de 1 no Minerador; envio de 1 ao Arquiteto\./);
  assert.match(meio.message, /Não tentados \(nada foi gravado neles\): "c", "d"\. Abra a prévia de novo para gravá-los\./);
  // Sucessora igual (as novas ficaram sem volume): nada no artigo, mas o Minerador gravou — e é dito.
  const soMinerador = describePublishedReinforcementOutcome([{ publishedKeywordId: "e", keyword: "e", written: false, versionNumber: null, added: 0, created: 0, swapApplied: false, error: null, partial: ["o Volume do Google Ads delas"], leftOut: [{ keyword: "k", reason: "o Google Ads não confirmou volume: ficou no Minerador, fora do artigo" }] }], null);
  assert.equal(soMinerador.tone, "info");
  assert.match(soMinerador.message, /^"e": o ArticleDNA não mudou\. Gravado só: o Volume do Google Ads delas\. Ficaram de fora: "k"/);
  assert.doesNotMatch(soMinerador.message, /já tinham tudo/);
});

/* =========================== 3. a busca em lote =========================== */

const semPar = ["kw-02", "kw-04", "kw-05", "kw-06", "kw-07", "kw-08", "kw-01", "kw-03"];

test("plano da busca: 14 publicados × 5 candidatas cabem no teto de US$ 1,00 (US$ 0,98); 30 cortam", async () => {
  const catorze = Array.from({ length: 14 }, (_, i) => ({ ...pagina("kw-01"), keywordId: `p-${i}`, keyword: `tema ${i}`, url: `https://adalbapro.com.br/blog/tema-${i}` }));
  const plano = await buildReinforcementSearchPlan({ brandId: MARCA, searchId: reinforcementSearchId(catorze.map(item => item.keywordId)), pages: catorze });
  assert.equal(plano.costRange.maxUsd, 0.98);
  assert.equal(plano.costRange.minUsd, 0);
  assert.equal(plano.withinCap, true);
  assert.deepEqual(plano.cuts, []);
  assert.equal(plano.hardCapUsd, REINFORCEMENT_MAX_COST_USD);
  assert.deepEqual(plano.pages[0].ads?.map(call => [call.kind, call.keywords, call.url]), [["keyword_seed", ["tema 0"], null], ["url_seed", ["tema 0"], "https://adalbapro.com.br/blog/tema-0"]], "o tema e a URL como semente");
  assert.equal(await verifyReinforcementSearchPlanHash(plano), true);
  assert.equal(await verifyReinforcementSearchPlanHash({ ...plano, hardCapUsd: 5 }), false);
  const trinta = Array.from({ length: 30 }, (_, i) => ({ ...catorze[0], keywordId: `q-${i}`, keyword: `tema ${i}` }));
  const cortado = await buildReinforcementSearchPlan({ brandId: MARCA, searchId: "rs-0000000000000000", pages: trinta });
  assert.ok(cortado.costRange.maxUsd <= REINFORCEMENT_MAX_COST_USD);
  assert.ok(cortado.cuts.length >= 1);
  assert.match(reinforcementSearchId(["b", "a"]), /^rs-[0-9a-f]{16}$/);
  assert.equal(reinforcementSearchId(["b", "a"]), reinforcementSearchId(["a", "b"]));
});

test("dois modos: quem disputa o mesmo assunto com outro publicado vai à diferenciação", () => {
  const pages = semPar.map(id => pagina(id));
  const particao = partitionReinforcementPages({
    requestedKeywordIds: [...semPar, "nao-existe"],
    pages,
    groups: [{ groupId: "dg-0000000000000001", members: [{ page: pagina("kw-01") }, { page: pagina("kw-03") }] }],
  });
  assert.deepEqual(particao.differentiation.map(grupo => grupo.keywordIds), [["kw-01", "kw-03"]]);
  assert.deepEqual(particao.reinforcement.map(page => page.keywordId), ["kw-02", "kw-04", "kw-05", "kw-06", "kw-07", "kw-08"]);
  assert.deepEqual(particao.unknown, ["nao-existe"]);
});

const candidata = (keywordId: string, adsVolume: number | null, extra: Partial<DifferentiationCandidate> = {}): DifferentiationCandidate => {
  const linha = LINHA.get(keywordId)!;
  const normal = normalizeKeyword(linha.keyword);
  return { candidateId: differentiationCandidateId(normal), keyword: linha.keyword, normalizedKeyword: normal, origins: ["ads_url_seed"], evidence: [], adsVolume, estimate: null, hasVolume: Boolean(adsVolume), entityFit: false, rankedByUrl: false, tier: "volume_only", existingKeywordId: null, serpMeasured: true, ...extra };
};

test("filtro: só volume do Google Ads (estimativa não vale), nunca publicada; o tema da página vai à frente", () => {
  const filtro = filterReinforcementCandidates({
    page: pagina("kw-02"),
    candidates: [candidata("kw-20", 140), candidata("kw-15", 210), candidata("kw-17", null, { estimate: 900 }), candidata("kw-16", 70)],
    blockedNormalized: new Set([normalizeKeyword("marketing para clinica")]),
  });
  assert.deepEqual(filtro.kept.map(item => item.keyword), ["marketing para dentistas", "marketing dentista"]);
  assert.deepEqual(filtro.refused.map(item => item.reason), ["É uma keyword publicada da marca: publicadas nunca se fundem.", "Sem volume do Google Ads: não reforça nada."]);
});

test("avaliação pela SERP: Forte (3+ páginas), Provável (2 páginas com palavras) e cada candidata num publicado só", () => {
  const pages = [pagina("kw-02"), pagina("kw-04")];
  const cands = [candidata("kw-15", 210), candidata("kw-17", 10), candidata("kw-19", 30), candidata("kw-20", 140)];
  const serp = buildSerpSubjectIndex([pegada("kw-02"), pegada("kw-04"), ...cands.map(item => pegada([...LINHA.values()].find(linha => normalizeKeyword(linha.keyword) === item.normalizedKeyword)!.keywordId, item.candidateId))]);
  const resultado = evaluateReinforcementSearch({ pages, inRound: new Set(["kw-02", "kw-04"]), candidates: { "kw-02": cands, "kw-04": cands }, serp });
  const dentistas = resultado.find(item => item.keywordId === "kw-02")!;
  assert.equal(dentistas.state, "found");
  assert.deepEqual(dentistas.suggestions.map(item => [item.keyword, item.level, item.sharedPageCount, item.preselected]), [["marketing para dentistas", "strong", 3, true], ["marketing digital odontologico", "strong", 4, true]]);
  const captacao = resultado.find(item => item.keywordId === "kw-04")!;
  assert.deepEqual(captacao.suggestions.map(item => [item.keyword, item.level]), [["como captar pacientes", "strong"]]);
  const todas = resultado.flatMap(item => item.suggestions.map(sugestao => sugestao.candidateId));
  assert.equal(new Set(todas).size, todas.length, "nenhuma keyword sugerida a dois publicados");
  assert.ok(!todas.includes(differentiationCandidateId(normalizeKeyword("marketing para clinica"))), "outro assunto no Google não é sugestão");
  assert.match(describeReinforcementSearchResult({ pages: resultado, costs: { reportedCostUsd: 0.056, budgetSpentUsd: 0.056, authorizedUsd: 1, byPage: [] } }), /Nada foi gravado ainda\. Para gravar: marque e use "Reforçar publicados"/);
});

test("rodada paga com portas falsas: teto e hash conferidos, Google Ads grátis, SERP cache primeiro, nada de rede", async () => {
  const pages = [pagina("kw-02")];
  const plano = await buildReinforcementSearchPlan({ brandId: MARCA, searchId: reinforcementSearchId(["kw-02"]), pages });
  let serpPagas = 0;
  const ports: DifferentiationRunPorts = {
    now: () => new Date("2026-09-28T12:00:00Z"),
    async openExecution() {
      return {
        ledgerCapability: false,
        findUsage: async () => false,
        googleAdsIdeas: async () => ({ requestId: "r", ideas: ["marketing para dentistas", "marketing para clinica"].map(keyword => ({ keyword, averageMonthlySearches: 100, competition: null, competitionIndex: null, averageCpcMicros: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: null })) }),
        recordGoogleAdsUsage: async () => undefined,
        async collectSerp(request, opcoes) {
          opcoes.onRequestStarted();
          serpPagas += 1;
          const linha = [...LINHA.values()].find(item => item.keyword === request.query.keyword)!;
          const urls = linha.lenses.flatMap(leitura => leitura.urls || []).slice(0, 10);
          return { providerRequestId: "s", costUsd: 0.002, digest: { version: "organic-digest-v1", depth: 10, organic: urls.map((url, i) => ({ rank_group: i + 1, url, domain: "d", title: "t", description: "d" })) } as never, organicCount: urls.length, stored: true, error: null };
        },
        recordDataForSeoUsage: async () => "skipped" as const,
      };
    },
    googleAdsVolumes: async lista => new Map(lista.map(item => [normalizeKeyword(item), item === "marketing para dentistas" ? 210 : 140])),
    // "marketing para clinica" já está no cache (4 lentes): não paga.
    readFootprints: async alvos => ({
      footprints: alvos.filter(alvo => alvo.keyword === "marketing para clinica").map(alvo => pegada("kw-20", alvo.keywordId)),
      missingLenses: alvos.filter(alvo => alvo.keyword !== "marketing para clinica").flatMap(alvo => ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"].map(lens => ({ keywordId: alvo.keywordId, lens, reason: "sem cache" }))),
    }),
  };
  const semAutorizar = await runReinforcementSearch({ brandId: MARCA, plan: plano, pages, pageFootprints: [pegada("kw-02")], publishedNormalized: new Set(), operationRequestId: "22222222-2222-4222-8222-222222222222", authorizedPlan: null }, ports);
  assert.equal(semAutorizar.ok, false);
  const acimaDoTeto = await runReinforcementSearch({ brandId: MARCA, plan: { ...plano, withinCap: false }, pages, pageFootprints: [], publishedNormalized: new Set(), operationRequestId: "22222222-2222-4222-8222-222222222223", authorizedPlan: { planHash: plano.planHash, maxCostUsd: 1 } }, ports);
  assert.equal(acimaDoTeto.ok, false, "plano adulterado (hash) não paga");
  const rodada = await runReinforcementSearch({ brandId: MARCA, plan: plano, pages, pageFootprints: [pegada("kw-02")], publishedNormalized: new Set(), operationRequestId: "22222222-2222-4222-8222-222222222224", authorizedPlan: { planHash: plano.planHash, maxCostUsd: plano.costRange.maxUsd } }, ports);
  assert.ok(rodada.ok, rodada.ok ? "" : rodada.message);
  if (!rodada.ok) return;
  assert.equal(serpPagas, 4, "só as 4 lentes da que não estava no cache");
  const dentistas = rodada.result.pages[0];
  assert.deepEqual(dentistas.suggestions.map(item => [item.keyword, item.level, item.adsVolume]), [["marketing para dentistas", "strong", 210]]);
  assert.ok(rodada.result.costs.reportedCostUsd <= REINFORCEMENT_MAX_COST_USD);
  assert.equal(chamadasDeRede, 0);
});
