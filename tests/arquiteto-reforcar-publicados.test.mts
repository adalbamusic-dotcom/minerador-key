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
import { buildCanonicalArticleWorkspaceItems, mergeCanonicalArticleWorkspaceItems, publishedPageKeywordIdOf } from "../lib/arquiteto/canonical-bootstrap.ts";
import { projectKeywordDnaForArchitect } from "../lib/arquiteto/keyword-dna-projection.ts";
import { buildArticleFormationUniverse, type ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";
import { partitionMaterializedArticles } from "../lib/arquiteto/formation-materialization.ts";
import { articleSerpBaseHash, articleSerpBaseOf } from "../lib/arquiteto/article-serp-gate.ts";
import { PUBLISHED_REINFORCEMENT_SWAP_REASON, aliasPublishedFormationSerp, calculatedCandidateRefOf, recordedPublishedSwapsOf, serpAssessmentComposition, serpCompositionDescribes, serpCompositionMismatch } from "../lib/arquiteto/published-formation-serp.ts";
import { classifySlugFit, slugTextOf } from "../lib/arquiteto/published-slug-fit.ts";
import { applyReinforcementSwap } from "../lib/arquiteto/published-reinforcement.ts";

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
  assert.match(describeReinforcementSearchResult({ pages: resultado, costs: { reportedCostUsd: 0.056, budgetSpentUsd: 0.056, authorizedUsd: 1, byPage: [] } }), /Nada foi gravado ainda\. Para gravar: marque na tabela "Reforçar publicados" e use "Gravar reforços"/);
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

/* ================= correção de 2026-09-28: os defeitos vistos em produção ================= */

const ATOR_CORRECAO = "11111111-1111-4111-8111-111111111111";
const envelopeDe = (payload: ArticleDNA, versionNumber = 1): VersionEnvelope<ArticleDNA> => ({
  versionId: `v-${payload.articleId}-${versionNumber}`, entityId: payload.articleId, versionNumber, previousVersionId: null,
  contentHash: `sha256:${"a".repeat(64)}`, origin: "human", changeReason: "teste", createdAt: "2026-09-28T22:52:00.000Z", createdBy: ATOR_CORRECAO, payload,
}) as VersionEnvelope<ArticleDNA>;
const dnaPublicado = (membros: string[]) => {
  const feito = buildFirstPublishedArticleDna({
    brandId: MARCA, page: pagina("kw-01"), territoryRef: TERRITORIO,
    keywords: [linhaDaMesa("kw-01"), ...membros.map(id => linhaDaMesa(id))],
    roles: Object.fromEntries(membros.map(id => [id, "secundaria" as const])), siloVersions: [],
  });
  assert.ok(feito.ok, feito.ok ? "" : feito.reason);
  return withHumanArticleApproval((feito as { ok: true; payload: ArticleDNA }).payload, { entityId: "assessment-pub", versionId: "assessment-pub:base-1", contentHash: `sha256:${"b".repeat(64)}` });
};

test("Defeito 1: membro de artigo publicado não vira publicado — só a página carrega URL e canonical (o caso de 5 keywords)", () => {
  // "como atrair pacientes sem redes sociais" v2 ganhou 4 keywords: 21 publicados viraram 27 na mesa.
  const dna = dnaPublicado(["kw-09", "kw-11", "kw-12", "kw-13"]);
  const { items } = buildCanonicalArticleWorkspaceItems([envelopeDe(dna, 2)], MARCA);
  assert.equal(items.length, 5);
  const publicados = items.filter(item => item.isPublished === true).map(item => item.keywordId);
  assert.deepEqual(publicados, ["kw-01"], "uma página, um publicado");
  const pagina1 = items.find(item => item.keywordId === "kw-01")!;
  assert.equal(pagina1.publishedUrl, dna.publishedIdentityRef?.publishedUrl);
  assert.equal(pagina1.canonical, dna.canonical);
  for (const membro of items.filter(item => item.keywordId !== "kw-01")) {
    assert.equal(membro.isPublished, false, `${membro.keyword} é membro, não página`);
    assert.equal(membro.publishedUrl, undefined);
    assert.equal(membro.canonical, null, "o canonical do artigo não vira identidade do membro");
    assert.deepEqual((membro.publishedArticlePage as { keywordId: string }).keywordId, "kw-01");
  }
  assert.equal(publishedPageKeywordIdOf(dna), "kw-01");

  // A working copy lê o Vínculo do Minerador: a página publicada por Vínculo continua publicada;
  // um membro que o Minerador não declara publicado continua membro.
  const merged = mergeCanonicalArticleWorkspaceItems([
    { id: "kw-01", keywordId: "kw-01", isPublished: true, publishedIdentitySource: "vinculo", publishedUrl: dna.publishedIdentityRef?.publishedUrl, canonical: dna.canonical },
    { id: "kw-11", keywordId: "kw-11", isPublished: false },
  ], items, MARCA);
  assert.deepEqual(merged.filter(item => item.isPublished === true).map(item => item.keywordId), ["kw-01"]);

  // O perfil do membro: o slug é dito como do artigo publicado, sem a cor de identidade publicada.
  const perfil = projectKeywordDnaForArchitect(merged.find(item => item.keywordId === "kw-11") as never);
  const publicacao = perfil.sections.find(secao => secao.title === "Publicação e proteção")!;
  const slug = publicacao.fields.find(campo => campo.label.startsWith("Slug"))!;
  assert.equal(slug.label, 'Slug do artigo publicado de "como atrair pacientes para clínica"');
  assert.equal(slug.tone, undefined);
  assert.ok(!publicacao.fields.some(campo => campo.label === "Canonical"), "sem canonical de página no membro");
});

test("Defeito 1: depois da troca confirmada, o artigo continua identificado pela página (entity_id = âncora original)", () => {
  const dna = dnaPublicado(["kw-09"]);
  const indice = buildSerpSubjectIndex([pegada("kw-01"), pegada("kw-09")]);
  const page = pagina("kw-01");
  const proposta = proposePublishedPrimarySwap({ published: formationKeywordOfPage(page), post: "free", identity: { url: page.url, canonical: page.canonical, slug: "como-atrair-pacientes-para-clinica" }, candidates: [{ ...formationKeywordOfPage(pagina("kw-09")), isPublished: false, volumeValidated: true }], serp: indice });
  assert.equal(proposta.state, "proposed", proposta.note);
  const trocada = applyReinforcementSwap({ current: dna, proposal: proposta, page: { ...page, slug: "como-atrair-pacientes-para-clinica" }, substituteVolume: 20, actorId: ATOR_CORRECAO, decidedAt: "2026-09-28T22:52:00Z" });
  assert.ok(trocada.ok, trocada.ok ? "" : trocada.reason);
  if (!trocada.ok) return;
  assert.equal(trocada.payload.principalKeywordId, "kw-09");
  assert.equal(trocada.payload.articleId, "kw-01");
  assert.equal(publishedPageKeywordIdOf(trocada.payload), "kw-01", "a página é a âncora original, não a nova principal");
  const { items } = buildCanonicalArticleWorkspaceItems([envelopeDe(trocada.payload)], MARCA);
  const paginaItem = items.find(item => item.keywordId === "kw-01")!;
  const novaPrincipal = items.find(item => item.keywordId === "kw-09")!;
  assert.equal(paginaItem.isPublished, true);
  assert.equal(paginaItem.publishedPrimarySwapTo, "kw-09");
  assert.equal(novaPrincipal.isPublished, false, "a nova principal não vira outro publicado");
  assert.equal(novaPrincipal.canonical, null);

  // A formação humana com a página secundária pela troca confirmada: sem conflito e sem slug novo.
  const F = "article-formation:7acbdf59-eaf4-4067-8050-98edfcf26b8b";
  const chave = (id: string, extra: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({ keywordId: id, keyword: LINHA.get(id)!.keyword, intent: "Informativo", volume: LINHA.get(id)!.volume, kgr: null, entity: null, problem: null, isPublished: false, humanFormationRef: F, ...extra });
  const universo = (comTroca: boolean) => buildArticleFormationUniverse({
    siloRef: TERRITORIO, siloLabel: "Captação", siloSlug: "captacao-de-pacientes",
    keywords: [chave("kw-09", { humanRole: "principal" }), chave("kw-01", { humanRole: "secundaria", isPublished: true, ...(comTroca ? { publishedPrimarySwapConfirmedTo: "kw-09" } : {}) })],
  }).candidates.find(candidato => candidato.candidateRef === F)!;
  assert.deepEqual(universo(true).conflicts, [], "a troca confirmada é decisão humana sobre ESTE artigo");
  assert.equal(universo(true).suggestedSlug, null, "o slug é o da página no ar");
  assert.match(universo(false).conflicts.join(" "), /está publicada e não é a principal/, "sem a troca confirmada, o conflito continua dito");

  // A reconciliação aceita a nova principal: o artigo trocado não vai ao acervo.
  const particao = partitionMaterializedArticles({
    accepted: [{ articleId: "kw-01", territoryRef: TERRITORIO, principalKeywordId: "kw-01", alsoPrincipalKeywordIds: ["kw-09"], keywordIds: ["kw-09", "kw-01"] }],
    candidates: [{ candidateRef: F, siloRef: TERRITORIO, principalKeywordId: "kw-09", keywordIds: ["kw-09", "kw-01"] }],
  });
  assert.deepEqual([...particao.current], [F]);
  assert.deepEqual(particao.legacy, []);
});

test("Defeito 3: o parecer da página responde pela formação humana dela; o hash da base decide (igual → vigente, mudou → desatualizado)", () => {
  const F = "article-formation:11111111-2222-4333-8444-555555555555";
  const doCalculado = { candidateRef: calculatedCandidateRefOf(TERRITORIO, "kw-01"), payload: { marca: "parecer-da-pagina" } };
  const linhas = [
    { id: "kw-01", keywordId: "kw-01", isPublished: true, territoryRef: TERRITORIO, articleFormationRef: F },
    { id: "kw-09", keywordId: "kw-09", isPublished: false, territoryRef: TERRITORIO, articleFormationRef: F },
  ];
  const lidos = aliasPublishedFormationSerp([doCalculado], linhas);
  assert.deepEqual(lidos.map(item => item.candidateRef), [doCalculado.candidateRef, F]);
  assert.equal(lidos[1].payload, doCalculado.payload);
  // Parecer próprio da formação: vence; duas publicadas no grupo: nada é emprestado.
  assert.equal(aliasPublishedFormationSerp([doCalculado, { candidateRef: F, payload: { marca: "proprio" } }], linhas).length, 2);
  assert.equal(aliasPublishedFormationSerp([doCalculado], linhas.map(linha => ({ ...linha, isPublished: true }))).length, 1);

  // As 19 composições que não mudaram: a base do candidato humano é a MESMA do calculado.
  const umaSo = (humano: boolean) => buildArticleFormationUniverse({
    siloRef: TERRITORIO, siloLabel: "Captação", siloSlug: "captacao-de-pacientes",
    keywords: [{ keywordId: "kw-01", keyword: LINHA.get("kw-01")!.keyword, intent: "Comercial", volume: null, kgr: null, entity: null, problem: null, isPublished: true, ...(humano ? { humanFormationRef: F, humanRole: "principal" as const } : {}) }],
    groups: humano ? [] : [{ keywordIds: ["kw-01"], principalKeywordId: "kw-01" }],
  }).candidates[0];
  const base = (candidato: ReturnType<typeof umaSo>) => articleSerpBaseHash(articleSerpBaseOf({ candidate: candidato, intentByKeywordId: new Map([["kw-01", "Comercial"]]), siloContext: { centralEntity: "captação", macroIntent: "Informativa" } }));
  assert.equal(umaSo(true).candidateRef, F);
  assert.notEqual(umaSo(false).candidateRef, F);
  assert.equal(base(umaSo(true)), base(umaSo(false)), "mesma composição: o parecer da página é vigente para a formação");

  // A composição que o parecer observou (b1e61059: 5 keywords no DNA, parecer de 1).
  const observada = serpAssessmentComposition({ recommendations: [{ keywordId: "kw-01", currentRole: "principal" }], keywordDnaReferences: [{ keywordId: "kw-01" }] });
  assert.deepEqual(observada, { keywordIds: ["kw-01"], principalKeywordId: "kw-01", roles: { "kw-01": "principal" } });
  assert.equal(serpCompositionDescribes(observada, { keywordIds: ["kw-01"], principalKeywordId: "kw-01" }), true);
  assert.equal(serpCompositionDescribes(observada, { keywordIds: ["kw-01", "kw-09", "kw-11", "kw-12", "kw-13"], principalKeywordId: "kw-01" }), false);
  assert.equal(serpCompositionDescribes({ keywordIds: ["kw-01", "kw-09"], principalKeywordId: "kw-01" }, { keywordIds: ["kw-01", "kw-09"], principalKeywordId: "kw-09" }), false, "c937661d: a troca muda a principal, o parecer precisa ser da composição trocada");
});

test("Defeito 3 no plano: parecer de outra composição adia o ArticleDNA; o da composição aprova; o DNA com parecer errado ganha a sucessora só com o parecer", () => {
  const daPagina = { reference: { entityId: "a-pub", versionId: "a-pub:1", contentHash: `sha256:${"b".repeat(64)}` }, composition: { keywordIds: ["kw-01"], principalKeywordId: "kw-01" } };
  const adiado = planPublishedReinforcementPage(fatos({ chosen: [escolhida("kw-09")], serpCandidates: [daPagina] }));
  assert.equal(adiado.status, "ready", "a mesa (composição) é gravada");
  assert.match(String(adiado.dnaDeferred), /descreve outra composição \(1 keyword; a composição a gravar tem 2\)/);
  assert.ok(adiado.lines.some(linha => /Próximo passo: "Processar artigos"/.test(linha)));
  const daComposicao = { reference: { entityId: "a-form", versionId: "a-form:2", contentHash: `sha256:${"c".repeat(64)}` }, composition: { keywordIds: ["kw-01", "kw-09"], principalKeywordId: "kw-01" } };
  const pronto = planPublishedReinforcementPage(fatos({ chosen: [escolhida("kw-09")], serpCandidates: [daPagina, daComposicao] }));
  assert.equal(pronto.dnaDeferred, null);
  assert.equal(pronto.serpReference?.versionId, "a-form:2", "vai para o DNA o parecer DESTA composição, não o primeiro achado");
  // Só a página, sem parecer nenhum: nada a gravar na mesa — recusa com o caminho.
  assert.match(planPublishedReinforcementPage(fatos({ serpCandidates: [] })).refusal!, /ainda não tem parecer da SERP gravado\. Rode "Processar artigos"/);

  // O DNA gravado em produção com o parecer de 1 keyword num artigo de 2.
  const dna = { ...dnaPublicado(["kw-09"]), serpAssessmentRef: daPagina.reference };
  const artigo = { articleId: "kw-01", versionId: "v1", versionNumber: 1, payload: dna };
  const membro = fato("kw-09", { formationRef: "article-formation:x", formationRole: "secundaria" });
  const semParecerCerto = planPublishedReinforcementPage(fatos({ item: fato("kw-01", { formationRef: "article-formation:x", formationRole: "principal" }), members: [membro], article: artigo, serpCandidates: [daPagina] }));
  assert.equal(semParecerCerto.status, "refused");
  assert.match(semParecerCerto.refusal!, /foi aprovado com o parecer da SERP de outra composição \(2 keywords no artigo\)/);
  const refresco = planPublishedReinforcementPage(fatos({ item: fato("kw-01", { formationRef: "article-formation:x", formationRole: "principal" }), members: [membro], article: artigo, serpCandidates: [daPagina, daComposicao] }));
  assert.equal(refresco.status, "ready");
  assert.equal(refresco.serpRefresh, true);
  assert.equal(refresco.dna.mode, "successor");
  assert.match(refresco.lines[0], /só para levar o parecer da SERP desta composição/);
});

test("Defeito 2: a troca prefere a que cabe no slug; a que troca a entidade não é proposta; keyword de outro artigo é recusada", () => {
  const slug = "como-atrair-pacientes-para-clinica";
  assert.equal(classifySlugFit(slug, "como atrair pacientes").fit, "fits");
  assert.equal(classifySlugFit(slug, "como atrair mais pacientes").fit, "fits");
  assert.equal(classifySlugFit(slug, "como atrair pacientes para o consultório").fit, "contradicts");
  assert.equal(classifySlugFit(slug, "como atrair mais pacientes para o consultorio").fit, "contradicts");
  assert.equal(classifySlugFit(slug, "como atrair pacientes particulares").fit, "neutral");
  assert.equal(classifySlugFit(slug, "como atrair clientes para clinica medica").fit, "neutral");

  const indice = buildSerpSubjectIndex(["kw-01", "kw-09", "kw-10", "kw-11"].map(id => pegada(id)));
  const page = pagina("kw-01");
  const identidade = { url: "https://adalbapro.com.br/captacao-de-pacientes/como-atrair-pacientes-para-clinica", canonical: null, slug: null };
  const candidata = (id: string, extra: Partial<ArticleFormationKeyword> = {}) => ({ ...formationKeywordOfPage(pagina(id)), isPublished: false, ...extra, volumeValidated: true });
  // O caso real: "para o consultório" com MAIS volume ainda perde — ela troca a entidade do slug.
  const real = proposePublishedPrimarySwap({ published: formationKeywordOfPage(page), post: "free", identity: identidade, candidates: [candidata("kw-10", { volume: 90 }), candidata("kw-09")], serp: indice });
  assert.equal(real.substitute?.keyword, "como atrair pacientes");
  assert.equal(real.substitute?.slugFit, "fits");
  assert.match(real.substitute!.reason, /cabe no slug "como-atrair-pacientes-para-clinica"/);
  const recusada = real.rejected.find(item => item.keywordId === "kw-10")!;
  assert.equal(recusada.missing, "slug_entity");
  assert.match(recusada.reason, /o slug diz "clinica" e ela diz "consultorio"/);
  // Âncora de outro publicado ou membro de outro artigo: recusada com o motivo.
  const alheia = proposePublishedPrimarySwap({ published: formationKeywordOfPage(page), post: "free", identity: identidade, candidates: [candidata("kw-11"), candidata("kw-09")], serp: indice, elsewhere: id => id === "kw-09" ? 'Está no artigo "leads sem tráfego pago"' : null });
  assert.equal(alheia.substitute?.keywordId, "kw-11");
  assert.equal(alheia.rejected.find(item => item.keywordId === "kw-09")?.missing, "other_article");
});

test("Defeito 4: eco da própria frase não é 'outro assunto'; falha de todas as sementes é erro com o motivo; o funil é contado", async () => {
  const pages = [pagina("kw-02")];
  const plano = await buildReinforcementSearchPlan({ brandId: MARCA, searchId: reinforcementSearchId(["kw-02"]), pages });
  const ideia = (keyword: string) => ({ keyword, averageMonthlySearches: 0, competition: null, competitionIndex: null, averageCpcMicros: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, currencyCode: null });
  const portas = (googleAdsIdeas: () => Promise<{ requestId: string; ideas: ReturnType<typeof ideia>[] }>, volume = 0): DifferentiationRunPorts => ({
    now: () => new Date("2026-09-28T22:58:00Z"),
    async openExecution() {
      return {
        ledgerCapability: false, findUsage: async () => false, googleAdsIdeas, recordGoogleAdsUsage: async () => undefined,
        collectSerp: async () => { throw new Error("SERP não devia ser chamada"); },
        recordDataForSeoUsage: async () => "skipped" as const,
      };
    },
    googleAdsVolumes: async lista => new Map(lista.map(item => [normalizeKeyword(item), volume])),
    readFootprints: async () => ({ footprints: [], missingLenses: [] }),
  });
  const rodar = (ports: DifferentiationRunPorts, id: string) => runReinforcementSearch({ brandId: MARCA, plan: plano, pages, pageFootprints: [pegada("kw-02")], publishedNormalized: new Set(), operationRequestId: id, authorizedPlan: { planHash: plano.planHash, maxCostUsd: plano.costRange.maxUsd } }, ports);

  // Produção (rodada 6bc23f9e): cada semente voltou com 1 ideia — a própria frase.
  const eco = await rodar(portas(async () => ({ requestId: "r", ideas: [ideia("marketing digital para dentistas")] })), "31313131-3131-4131-8131-313131313131");
  assert.ok(eco.ok, eco.ok ? "" : eco.message);
  if (!eco.ok) return;
  const [paginaEco] = eco.result.pages;
  assert.equal(paginaEco.state, "none");
  assert.match(paginaEco.reason, /devolveu só a própria frase \(2 ideias em 2 buscas\)/);
  assert.match(paginaEco.reason, /Próximo passo: "Buscar reforço" com um tema mais amplo/);
  assert.equal(paginaEco.funnel?.ideasReceived, 2);
  assert.equal(paginaEco.funnel?.echoOfPhrase, 2);
  assert.equal(paginaEco.funnel?.distinct, 0);
  assert.deepEqual(paginaEco.funnel?.sample, ["marketing digital para dentistas"]);
  const frase = describeReinforcementSearchResult(eco.result);
  assert.doesNotMatch(frase, /o Google trata as keywords com volume como outro assunto/, "nada foi medido: não é 'outro assunto'");
  assert.match(frase, /o Google Ads devolveu 2 ideias para 1 publicado \(1 só com a própria frase\)/);

  // Ideias novas, todas sem volume: contadas, sem "outro assunto".
  const semVolume = await rodar(portas(async () => ({ requestId: "r", ideas: [ideia("dentista marketing gratis"), ideia("marketing dentista barato")] })), "32323232-3232-4232-8232-323232323232");
  assert.ok(semVolume.ok);
  if (semVolume.ok) {
    assert.match(semVolume.result.pages[0].reason, /O Google Ads trouxe 2 keywords novas: 2 sem volume\. Nenhuma chegou a ser medida na SERP/);
    assert.equal(semVolume.result.pages[0].funnel?.withoutVolume, 2);
  }

  // O token do Google Ads venceu: todas as sementes falham — erro da rodada, nunca "nada achado".
  const falha = await rodar(portas(async () => { throw Object.assign(new Error("invalid_grant: o acesso ao Google Ads expirou"), { code: "GOOGLE_ADS_AUTH" }); }), "33333333-3333-4333-8333-333333333334");
  assert.equal(falha.ok, false);
  if (!falha.ok) {
    assert.equal(falha.status, 503);
    assert.equal(falha.code, "GOOGLE_ADS_UNAVAILABLE");
    assert.match(falha.message, /^Erro do Google Ads: invalid_grant: o acesso ao Google Ads expirou/);
  }
  assert.equal(chamadasDeRede, 0);
});

test("fiação na mesa: o parecer da página chega à formação no carregador; a troca confirmada chega à formação e à reconciliação", () => {
  const semComentarios = (caminho: string) => readFileSync(caminho, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(semComentarios("lib/arquiteto/canonical-workspace.ts"), /articleFormationSerp: aliasPublishedFormationSerp\(\s*body\.data\.articleFormationSerp,/);
  const mesa = semComentarios("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(mesa, /publishedPrimarySwapConfirmedTo: trocasDaMesa\.get\(String\(keyword\.id\)\) \?\? String\(keyword\.publishedPrimarySwapTo\)/);
  assert.match(mesa, /const trocasDaMesa = recordedPublishedSwapsOf\(keywordsPorSilo\.get\(territory\.territoryRef\) \|\| \[\]\);/);
  assert.match(mesa, /alsoPrincipalKeywordIds: \[String\(version\.payload\.principalKeywordId\)\]/);
});

/* ================= corretor de 2026-09-28: os achados da revisão ================= */

test("Corretor D2: o encaixe usa só o último segmento — a pasta do Silo não conta como slug", () => {
  const caminho = "/captacao-de-pacientes/como-atrair-pacientes-para-clinica";
  const url = `https://adalbapro.com.br${caminho}`;
  assert.equal(slugTextOf({ slug: caminho }), "como-atrair-pacientes-para-clinica");
  assert.equal(slugTextOf({ slug: null, url }), "como-atrair-pacientes-para-clinica");
  assert.equal(slugTextOf({ slug: `${url}/` }), "como-atrair-pacientes-para-clinica");
  assert.notEqual(classifySlugFit(caminho, "captação de pacientes").fit, "fits", "a pasta do Silo não é o slug da página");
  assert.notEqual(classifySlugFit(url, "captação de pacientes para clínica").fit, "fits");
  assert.equal(classifySlugFit(caminho, "como atrair pacientes").fit, "fits");
  assert.equal(classifySlugFit(caminho, "como atrair pacientes para o consultório").fit, "contradicts");

  // Na régua: com o caminho inteiro em `slug` (como a mesa e o servidor passam), a keyword-pilar da pasta não "cabe no slug".
  const indice = buildSerpSubjectIndex(["kw-01", "kw-13"].map(id => pegada(id)));
  const page = pagina("kw-01");
  const pilar = { ...formationKeywordOfPage(pagina("kw-13")), keyword: "captação de pacientes", volume: 90, isPublished: false, volumeValidated: true };
  const proposta = proposePublishedPrimarySwap({ published: formationKeywordOfPage(page), post: "free", identity: { url, canonical: url, slug: caminho }, candidates: [pilar], serp: indice });
  assert.equal(proposta.substitute?.keywordId, "kw-13");
  assert.equal(proposta.substitute?.slugFit, "neutral");
  assert.doesNotMatch(proposta.substitute!.reason, /cabe no slug/);
});

test("Corretor D2: slug com dois complementos — a keyword com a mesma entidade central não é recusada", () => {
  const slug = "como-atrair-pacientes-para-clinica-em-sp";
  assert.notEqual(classifySlugFit(slug, "como atrair pacientes para clínica").fit, "contradicts");
  assert.notEqual(classifySlugFit(slug, "como atrair pacientes para clinica em sao paulo").fit, "contradicts");
  assert.equal(classifySlugFit(slug, "como atrair pacientes para o consultório").fit, "contradicts", "a entidade trocada continua recusada");
  assert.equal(classifySlugFit("como-atrair-pacientes-para-clinica", "como atrair pacientes em sp").fit, "contradicts", "sem nenhuma palavra do complemento do slug");
});

test("Corretor D3: a portaria do servidor confere papéis, as 4 lentes, o parecer vigente e diz por que não serve", () => {
  const completo = { requested: ["a", "b", "c", "d"], observed: ["a", "b", "c", "d"], missing: [] };
  const parecer = { recommendations: [{ keywordId: "kw-01", currentRole: "principal" }, { keywordId: "kw-09", currentRole: "reforco_narrativo" }], keywordDnaReferences: [{ keywordId: "kw-01" }, { keywordId: "kw-09" }] };
  const observada = serpAssessmentComposition(parecer, completo)!;
  assert.deepEqual(observada, { keywordIds: ["kw-01", "kw-09"], principalKeywordId: "kw-01", roles: { "kw-01": "principal", "kw-09": "reforco_narrativo" }, lensesComplete: true });
  const alvo = { keywordIds: ["kw-01", "kw-09"], principalKeywordId: "kw-01" };
  assert.equal(serpCompositionMismatch(observada, { ...alvo, roles: { "kw-01": "principal", "kw-09": "reforco_narrativo" } }), null);
  assert.match(String(serpCompositionMismatch(observada, { ...alvo, roles: { "kw-01": "principal", "kw-09": "secundaria" } })), /outros papéis/);
  assert.match(String(serpCompositionMismatch(serpAssessmentComposition(parecer, { ...completo, observed: ["a", "b", "c"], missing: [{ lens: "d" }] }), alvo)), /sem alguma das 4 lentes/);
  assert.match(String(serpCompositionMismatch(serpAssessmentComposition({ ...parecer, evaluationStatus: "outdated" }, completo), alvo)), /marcado como desatualizado/);
  assert.equal(serpAssessmentComposition(parecer)!.lensesComplete, undefined, "sem marcador: legado, desconhecido (não bloqueia)");
  const semPrincipal = serpAssessmentComposition({ recommendations: [{ keywordId: "kw-09", currentRole: "secundaria" }], keywordDnaReferences: [{ keywordId: "kw-01" }, { keywordId: "kw-09" }] });
  assert.match(String(serpCompositionMismatch(semPrincipal, alvo)), /não diz qual era a principal/);

  // No plano: o parecer com outro papel não aprova o DNA — adia com o motivo.
  const reforco = fato("kw-09", { formationRef: "article-formation:y", formationRole: "reforco" });
  const comPapelErrado = { reference: { entityId: "a-f", versionId: "a-f:1", contentHash: `sha256:${"c".repeat(64)}` }, composition: { keywordIds: ["kw-01", "kw-09"], principalKeywordId: "kw-01", roles: { "kw-01": "principal" as const, "kw-09": "secundaria" as const } } };
  const plano = planPublishedReinforcementPage(fatos({ item: fato("kw-01", { formationRef: "article-formation:y", formationRole: "principal" }), members: [reforco], serpCandidates: [comPapelErrado] }));
  assert.equal(plano.serpReference ?? null, null);
  assert.equal(plano.status, "refused", "sem nada a gravar na mesa, recusa com o caminho");
  assert.match(String(plano.refusal), /outros papéis/);
  const comPapelCerto = { ...comPapelErrado, composition: { ...comPapelErrado.composition, roles: { "kw-01": "principal" as const, "kw-09": "reforco_narrativo" as const } } };
  const certo = planPublishedReinforcementPage(fatos({ item: fato("kw-01", { formationRef: "article-formation:y", formationRole: "principal" }), members: [reforco], serpCandidates: [comPapelCerto] }));
  assert.equal(certo.serpReference?.versionId, "a-f:1");
});

test("Corretor: teto de 6 também para o ArticleDNA + a composição gravada na mesa", () => {
  const membros = ["kw-09", "kw-10", "kw-11", "kw-12", "kw-13", "kw-14"].map(id => fato(id, { formationRef: "article-formation:z", formationRole: "secundaria" }));
  const plano = planPublishedReinforcementPage(fatos({ item: fato("kw-01", { formationRef: "article-formation:z", formationRole: "principal" }), members: membros, serpCandidates: [] }));
  assert.equal(plano.status, "refused");
  assert.match(String(plano.refusal), /somam 7 keywords, acima do teto de 6: tire 1 na mesa antes/);
});

test("Corretor D2 (mesa): a troca já confirmada que contradiz o slug não é alinhada; uma nova troca que cabe no slug refaz, e a página segue sendo o artigo", () => {
  // O caso de produção: "para o consultório" virou a principal de /como-atrair-pacientes-para-clinica.
  const base = dnaPublicado(["kw-10"]);
  const indice = buildSerpSubjectIndex(["kw-01", "kw-09", "kw-10"].map(id => pegada(id)));
  const page = pagina("kw-01");
  const semSlug = proposePublishedPrimarySwap({ published: formationKeywordOfPage(page), post: "free", identity: { url: null, canonical: null, slug: null }, candidates: [{ ...formationKeywordOfPage(pagina("kw-10")), volume: 20, isPublished: false, volumeValidated: true }], serp: indice });
  assert.equal(semSlug.state, "proposed", semSlug.note);
  const errada = applyReinforcementSwap({ current: base, proposal: semSlug, page: { ...page, slug: null }, substituteVolume: 20, actorId: ATOR_CORRECAO, decidedAt: "2026-09-28T22:52:00Z" });
  assert.ok(errada.ok, errada.ok ? "" : errada.reason);
  if (!errada.ok) return;
  const artigo = { articleId: "kw-01", versionId: "v1", versionNumber: 1, payload: errada.payload };
  const F = "article-formation:7acbdf59-eaf4-4067-8050-98edfcf26b8b";
  const composicao = { reference: errada.payload.serpAssessmentRef!, composition: { keywordIds: ["kw-01", "kw-10"], principalKeywordId: "kw-10" } };
  const mesa = { item: fato("kw-01", { formationRef: F, formationRole: "principal" as const }), members: [fato("kw-10", { formationRef: F, formationRole: "secundaria" as const })], article: artigo, serpCandidates: [composicao] };

  // Sem nada marcado: nada de "Alinha na mesa" — recusa com o aviso forte e o caminho.
  const sozinho = planPublishedReinforcementPage(fatos(mesa));
  assert.equal(sozinho.status, "refused");
  assert.match(String(sozinho.refusal), /A principal atual, "como atrair pacientes para o consultório", não combina com o slug publicado "como-atrair-pacientes-para-clinica": troca a entidade do slug: o slug diz "clinica" e ela diz "consultorio"/);
  assert.match(String(sozinho.refusal), /não é alinhada na mesa sem uma nova decisão sua/);
  assert.ok(!sozinho.lines.some(linha => /Alinha na mesa/.test(linha)));

  // Com reforço marcado: grava, avisa, e a mesa NÃO é alinhada à troca errada.
  const comReforco = planPublishedReinforcementPage(fatos({ ...mesa, chosen: [escolhida("kw-11")] }));
  assert.equal(comReforco.status, "ready");
  assert.equal(comReforco.confirmedSwapContradictsSlug, true);
  assert.ok(comReforco.lines.some(linha => /não combina com o slug publicado/.test(linha)), comReforco.lines.join(" | "));
  assert.ok(!comReforco.lines.some(linha => /Alinha na mesa/.test(linha)));

  // Nova troca para a que cabe no slug: refaz (antes: "a troca já foi aplicada").
  const cabe = proposePublishedPrimarySwap({ published: formationKeywordOfPage(page), post: "free", identity: { url: page.url, canonical: page.canonical, slug: page.slug }, candidates: [{ ...formationKeywordOfPage(pagina("kw-09")), isPublished: false, volumeValidated: true }], serp: indice });
  assert.equal(cabe.substitute?.keywordId, "kw-09", cabe.note);
  const refeita = planPublishedReinforcementPage(fatos({ ...mesa, chosen: [escolhida("kw-09")], swapKeywordId: "kw-09", swapProposal: cabe, swapSource: "request" }));
  assert.equal(refeita.swap.state, "apply", refeita.swap.reason);
  assert.match(refeita.swap.reason, /"como atrair pacientes para o consultório", que contradiz o slug, deixa de ser a principal e fica como secundária/);
  // A mesma troca errada pedida de novo continua recusada.
  const deNovo = planPublishedReinforcementPage(fatos({ ...mesa, chosen: [escolhida("kw-11")], swapKeywordId: "kw-10", swapProposal: semSlug }));
  assert.equal(deNovo.swap.state, "refused");
  assert.match(deNovo.swap.reason, /já foi aplicada/);

  // O payload refeito: a nova principal, a errada vira secundária, a página segue identificando o artigo.
  const comNova = withReinforcementKeywords({ current: errada.payload, brandId: MARCA, add: [linhaDaMesa("kw-09")], decidedAt: "2026-09-29T10:00:00Z" }).payload;
  const payload = applyReinforcementSwap({ current: comNova, proposal: cabe, page, substituteVolume: 20, actorId: ATOR_CORRECAO, decidedAt: "2026-09-29T10:00:00Z", redo: { currentPrincipalLabel: "como atrair pacientes para o consultório" } });
  assert.ok(payload.ok, payload.ok ? "" : payload.reason);
  if (!payload.ok) return;
  assert.equal(payload.payload.principalKeywordId, "kw-09");
  assert.equal(payload.payload.primaryKeywordDecision?.previousKeywordId, "kw-01", "a decisão é sobre a página");
  assert.equal(publishedPageKeywordIdOf(payload.payload), "kw-01");
  assert.equal(payload.payload.keywordReferences.find(reference => reference.keywordId === "kw-10")?.role, "secundaria");
  assert.equal(payload.payload.keywordReferences.find(reference => reference.keywordId === "kw-01")?.role, "secundaria");
  assert.equal(payload.payload.suggestedSlug, errada.payload.suggestedSlug, "slug intocado");
  assert.equal(payload.payload.canonical, errada.payload.canonical, "canonical intocado");
  // Sem o `redo`, a régua recusa como antes (a principal mudou depois da proposta).
  assert.equal(applyReinforcementSwap({ current: comNova, proposal: cabe, page, substituteVolume: 20, actorId: ATOR_CORRECAO, decidedAt: "2026-09-29T10:00:00Z" }).ok, false);
});

test("Corretor D3 (mesa): a troca confirmada no Reforçar e gravada só na mesa é reconhecida; a formação da Revisão humana não", () => {
  const F = "article-formation:1f1f1f1f-2222-4333-8444-555555555555";
  const decisao = (role: string, reason = PUBLISHED_REINFORCEMENT_SWAP_REASON) => ({ operation: "move", role, reason, source: "human", decidedAt: "2026-09-29T10:00:00Z" });
  const linhas = [
    { id: "kw-01", isPublished: true, articleFormationRef: F, articleFormationDecision: decisao("secundaria") },
    { id: "kw-09", isPublished: false, articleFormationRef: F, articleFormationDecision: decisao("principal") },
    { id: "kw-11", isPublished: false, articleFormationRef: F, articleFormationDecision: decisao("secundaria", "Reforçar publicados: composição do artigo publicado decidida por humano.") },
  ];
  assert.deepEqual([...recordedPublishedSwapsOf(linhas)], [["kw-01", "kw-09"]]);
  const revisaoHumana = linhas.map(linha => ({ ...linha, articleFormationDecision: decisao((linha.articleFormationDecision as { role: string }).role, "humano") }));
  assert.equal(recordedPublishedSwapsOf(revisaoHumana).size, 0, "a Revisão humana não vira troca implícita");
  // A formação reconhece a troca gravada: a página secundária sem conflito e sem slug novo.
  const chave = (id: string, extra: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({ keywordId: id, keyword: LINHA.get(id)!.keyword, intent: "Informativo", volume: LINHA.get(id)!.volume, kgr: null, entity: null, problem: null, isPublished: false, humanFormationRef: F, ...extra });
  const candidato = buildArticleFormationUniverse({
    siloRef: TERRITORIO, siloLabel: "Captação", siloSlug: "captacao-de-pacientes",
    keywords: [chave("kw-09", { humanRole: "principal" }), chave("kw-01", { humanRole: "secundaria", isPublished: true, publishedPrimarySwapConfirmedTo: recordedPublishedSwapsOf(linhas).get("kw-01") })],
  }).candidates.find(item => item.candidateRef === F)!;
  assert.deepEqual(candidato.conflicts, []);
  assert.equal(candidato.suggestedSlug, null);
});

test("Corretor D3: o DNA aprovado com parecer de outros papéis (o caso real de 'tráfego pago': reforço × secundária) pede o Processar, com o porquê", () => {
  const dna = dnaPublicado(["kw-09"]);
  const artigo = { articleId: "kw-01", versionId: "v1", versionNumber: 1, payload: dna };
  const F = "article-formation:f18cef87-7d2d-43f2-a112-22072dbf3406";
  const parecerDoCalculado = { reference: dna.serpAssessmentRef!, composition: { keywordIds: ["kw-01", "kw-09"], principalKeywordId: "kw-01", roles: { "kw-01": "principal" as const, "kw-09": "reforco_narrativo" as const } } };
  const plano = planPublishedReinforcementPage(fatos({ item: fato("kw-01", { formationRef: F, formationRole: "principal" }), members: [fato("kw-09", { formationRef: F, formationRole: "secundaria" })], article: artigo, serpCandidates: [parecerDoCalculado] }));
  assert.equal(plano.status, "refused");
  assert.match(String(plano.refusal), /foi aprovado com o parecer da SERP de outra composição \(2 keywords no artigo\) — o parecer da SERP foi feito com outros papéis \(secundária × reforço\)\. Rode "Processar artigos"/);
});
