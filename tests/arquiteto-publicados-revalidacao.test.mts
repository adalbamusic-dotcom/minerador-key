import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildArchitectureWorkingProposal, type KeywordDnaSignals } from "../lib/arquiteto/architecture-working-proposal.ts";
import type { ArchitectureAnalysis, ClusterAnalysis, ClusterDestination } from "../lib/arquiteto/architecture-analysis.ts";
import { buildCanonicalWorkflowWorkspaceItems, type CanonicalWorkflowItem } from "../lib/arquiteto/canonical-workspace.ts";
import { editorialUnitDeclarationFromVinculo, readArchitectKeywordVinculo } from "../lib/arquiteto/editorial-unit-declaration.ts";
import type { EditorialUnitDeclaration } from "../lib/arquiteto/contracts.ts";
import { buildArticleFormationUniverse, type ArticleFormationKeyword } from "../lib/arquiteto/article-formation.ts";
import {
  PUBLISHED_IDENTITY_ASSIGNMENT_KEYS,
  isArchitectKeywordPublished,
  publishedIdentityKeysIn,
  publishedIdentitySource,
  readPublishedIdentity,
  withoutPublishedIdentityKeys,
} from "../lib/arquiteto/published-identity.ts";
import {
  isPublishedAddressUnder,
  normalizePublishedAddress,
  publishedPageIdentityOf,
  publishedPathKey,
  regroupFreeAroundPublished,
  resolvePublishedSiloMembership,
} from "../lib/arquiteto/published-silo-membership.ts";
import { manualSiloCandidateDraft, planSiloAssignment, publishedSiloCandidateDraft } from "../lib/arquiteto/silo-assignment.ts";
import { planPublishedArchitectureRecognition } from "../lib/arquiteto/published-architecture-recognition.ts";
import { planSiloDecisionBatch } from "../lib/arquiteto/silo-decision-batch.ts";
import { buildTerritorialLandscape, type TerritorialLandscapeInput } from "../lib/arquiteto/territorial-landscape.ts";
import { TerritoryCandidateSchema, type TerritoryCandidate } from "../lib/arquiteto/territory.ts";

/*
 * O CENÁRIO DO DONO (2026-09-25): ~200 keywords importadas ao Arquiteto —
 * 4 Silos publicados, 21 artigos publicados (todos com URL, Vínculo
 * declarado e aprovados no Minerador) e ~130 livres. A arquitetura publicada
 * já foi formada e comprovada: o Arquiteto só revalida e remonta, sem mexer
 * em URL, slug ou canonical, e reconhece pelo LINK qual artigo é de qual Silo.
 *
 * Tudo sintético, com o formato real do Minerador (`analise_semantica` com
 * `keyword_page_type` e `site_origin`). Nenhuma rede, nenhum provider.
 */

const BRAND = "550e8400-e29b-41d4-a716-446655440001";
const OUTRA_MARCA = "550e8400-e29b-41d4-a716-446655440099";
const NOW = "2026-09-20T12:00:00.000Z";
const SITE = "https://www.marca.com.br";

/** A evidência que `readPublicationLink` exige para dizer "publicada". */
const evidenciaPublicada = (url: string) => ({
  publicationStatus: "published",
  sourceUrl: url,
  resolvedUrl: url,
  canonicalUrl: url,
  urlSituation: "canonical_confirmed",
  lastCheckedAt: NOW,
  publicationConfirmedBy: "user-1",
  publicationConfirmedAt: NOW,
});

type Linha = { id: string; brand_id: string; keyword: string; status: string; lista_id?: string; analise_semantica: Record<string, unknown> };

const publicada = (id: string, keyword: string, pageType: "silo" | "article", caminho: string): Linha => ({
  id, brand_id: BRAND, keyword, status: "aprovado", lista_id: "lista-do-minerador",
  analise_semantica: { keyword_page_type: pageType, site_origin: evidenciaPublicada(`${SITE}${caminho}`) },
});

const livre = (id: string, keyword: string): Linha => ({
  id, brand_id: BRAND, keyword, status: "aprovado", analise_semantica: {},
});

const SILOS: Linha[] = [
  publicada("silo-skincare", "skincare", "silo", "/skincare/"),
  publicada("silo-cabelos", "cuidados com cabelos", "silo", "/cabelos"),
  publicada("silo-maquiagem", "maquiagem", "silo", "/maquiagem"),
  publicada("silo-unhas", "unhas decoradas", "silo", "/unhas"),
];

const ARTIGOS: Linha[] = [
  ...Array.from({ length: 5 }, (_, i) => publicada(`art-skin-${i}`, `skincare tema ${i}`, "article", `/skincare/tema-${i}`)),
  // Aninhado: `/skincare/rotina/noite` continua no Silo `/skincare`.
  publicada("art-skin-aninhado", "rotina noturna de skincare", "article", "/skincare/rotina/noite?utm=x#topo"),
  // O léxico diz "skincare", o endereço diz "cabelos": vence o endereço.
  publicada("art-cab-lexico-enganoso", "skincare para couro cabeludo", "article", "/cabelos/skincare-couro-cabeludo/"),
  ...Array.from({ length: 4 }, (_, i) => publicada(`art-cab-${i}`, `cabelos cacheados ${i}`, "article", `/cabelos/cacheados-${i}`)),
  ...Array.from({ length: 5 }, (_, i) => publicada(`art-maq-${i}`, `maquiagem para festa ${i}`, "article", `/maquiagem/festa-${i}`)),
  ...Array.from({ length: 4 }, (_, i) => publicada(`art-unha-${i}`, `unhas decoradas simples ${i}`, "article", `/unhas/simples-${i}`)),
  // Fora de qualquer Silo publicado: o site não a põe em Silo.
  publicada("art-fora", "novidades da marca", "article", "/blog/novidades-da-marca"),
];

const LIVRES: Linha[] = [
  ...Array.from({ length: 30 }, (_, i) => livre(`livre-skin-${i}`, `skincare dica ${i}`)),
  ...Array.from({ length: 30 }, (_, i) => livre(`livre-maq-${i}`, `maquiagem dica ${i}`)),
  ...Array.from({ length: 70 }, (_, i) => livre(`livre-jard-${i}`, `jardinagem em casa ${i}`)),
];

const LOTE = [...SILOS, ...ARTIGOS, ...LIVRES];

test("fixture: 4 Silos, 21 artigos publicados e 130 livres", () => {
  assert.equal(SILOS.length, 4);
  assert.equal(ARTIGOS.length, 21);
  assert.equal(LIVRES.length, 130);
});

/* ---------------------------------------------- (1) publicada = Vínculo */

test("(1) aprovada com Vínculo publicado é publicada; livre e candidata não são", () => {
  for (const linha of [...SILOS, ...ARTIGOS]) {
    assert.equal(isArchitectKeywordPublished(linha), true, linha.id);
    assert.equal(publishedIdentitySource(linha), "vinculo", linha.id);
  }
  for (const linha of LIVRES) assert.equal(isArchitectKeywordPublished(linha), false, linha.id);

  const candidata = { ...livre("cand", "candidata"), analise_semantica: { site_origin: { sourceUrl: `${SITE}/x` } } };
  assert.equal(isArchitectKeywordPublished(candidata), false, "URL candidata sem confirmação não é publicação");

  const legado = { ...livre("leg", "legado"), status: "publicado" };
  assert.equal(publishedIdentitySource(legado), "legacy_status", "o status legado continua protegendo");

  const texto = { ...ARTIGOS[0], analise_semantica: { site_origin: JSON.stringify(evidenciaPublicada(`${SITE}/skincare/tema-0`)) } };
  assert.equal(isArchitectKeywordPublished(texto), true, "site_origin gravado como texto JSON continua lido");

  const identidade = readPublishedIdentity(ARTIGOS[0]);
  assert.equal(identidade?.canonicalUrl, `${SITE}/skincare/tema-0`);
});

test("(1) o Vínculo vem do PACOTE APROVADO do item, não da linha viva", () => {
  const semLinha = { ...ARTIGOS[0], analise_semantica: {} };
  assert.equal(isArchitectKeywordPublished(semLinha), false);
  const comPacote = { ...semLinha, canonicalWorkflow: { payload: { approvedDna: { analiseSemantica: ARTIGOS[0].analise_semantica } } } };
  assert.equal(isArchitectKeywordPublished(comPacote), true);
});

function workflowItem(keywordId: string, payload: Record<string, unknown>): CanonicalWorkflowItem {
  return {
    id: `wf-${keywordId}`, marcaId: BRAND, subjectType: "keyword", subjectId: keywordId, articleId: null,
    stage: "architect", state: "received", sourceEntityId: keywordId, sourceVersionId: null, sourceContentHash: null,
    payload, lockVersion: 1, createdAt: NOW, updatedAt: NOW,
  };
}

test("(1) a projeção canônica marca a publicada pelo Vínculo e não herda a lista como Silo", () => {
  const artigo = ARTIGOS[0];
  // Linha estreita (sem analise_semantica), o pacote aprovado no item.
  const [item] = buildCanonicalWorkflowWorkspaceItems(
    [workflowItem(artigo.id, { approvedDna: { analiseSemantica: artigo.analise_semantica } })],
    [{ id: artigo.id, brand_id: BRAND, keyword: artigo.keyword, status: "aprovado", lista_id: "lista-do-minerador" }],
    BRAND,
  );
  assert.equal(item.isPublished, true);
  assert.equal(item.status, "aprovado", "o status não é reescrito");
  assert.equal(item.siloId, null, "lista_id é proveniência, não Silo da publicada pelo Vínculo");
  assert.equal((item as Record<string, unknown>).publishedUrl, `${SITE}/skincare/tema-0`);
  assert.equal((item as Record<string, unknown>).canonical, `${SITE}/skincare/tema-0`);

  const [novo] = buildCanonicalWorkflowWorkspaceItems(
    [workflowItem("livre-1", {})],
    [{ id: "livre-1", brand_id: BRAND, keyword: "livre", status: "aprovado" }],
    BRAND,
  );
  assert.equal(novo.isPublished, false);
  assert.equal((novo as Record<string, unknown>).publishedUrl, undefined, "livre não ganha campo novo");

  const [legado] = buildCanonicalWorkflowWorkspaceItems(
    [workflowItem("leg-1", {})],
    [{ id: "leg-1", brand_id: BRAND, keyword: "legado", status: "publicado", lista_id: "silo-legado" }],
    BRAND,
  );
  assert.equal(legado.isPublished, true);
  assert.equal(legado.siloId, "silo-legado", "o legado continua como era");
});

test("(1) a trava de identidade: uma lista só para a rota e para a mesa", () => {
  assert.deepEqual([...PUBLISHED_IDENTITY_ASSIGNMENT_KEYS].sort(), [
    "clusterId", "computedSlug", "principalKeywordId", "provisionalGroupId", "role", "siloId", "siloName", "silo_id", "slug_sugerido",
  ]);
  const assignment = { workingArticleId: "w-1", clusterId: "c", computedSlug: "/x", computedHierarquia: "Pilar", articleKgrDecision: "YES", territoryRef: "territory:1" };
  assert.deepEqual(publishedIdentityKeysIn(assignment).sort(), ["clusterId", "computedSlug"]);
  assert.deepEqual(withoutPublishedIdentityKeys(assignment), { workingArticleId: "w-1", computedHierarquia: "Pilar", articleKgrDecision: "YES", territoryRef: "territory:1" });

  const rota = readFileSync("app/api/arquiteto/workspace/route.ts", "utf8");
  assert.match(rota, /isArchitectKeywordPublished\(\{ status: keyword\?\.status \?\? null, canonicalWorkflow: \{ payload: currentPayload \} \}\)/);
  assert.match(rota, /publishedIdentityKeysIn\(update\.assignment\)\.length/);

  const mesa = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(mesa, /assignment: item\.isPublished \? withoutPublishedIdentityKeys\(assignment\) : assignment/);
});

/* ------------------------------------------- (2) membership pela URL */

test("(2) endereço normalizado: protocolo, www, barra, query e caixa não mudam a posição", () => {
  assert.deepEqual(normalizePublishedAddress("http://WWW.Marca.com.br/Skincare/?a=1#x"), { host: "marca.com.br", path: "/skincare" });
  assert.deepEqual(normalizePublishedAddress("marca.com.br"), { host: "marca.com.br", path: "/" });
  assert.equal(normalizePublishedAddress("/skincare/tema"), null, "sem host não há 'mesmo site'");
  assert.equal(normalizePublishedAddress(""), null);

  const silo = normalizePublishedAddress(`${SITE}/skincare`)!;
  assert.equal(isPublishedAddressUnder(normalizePublishedAddress(`${SITE}/skincare/tema`)!, silo), true);
  assert.equal(isPublishedAddressUnder(normalizePublishedAddress(`${SITE}/skincare-facial/tema`)!, silo), false, "prefixo de texto não é prefixo de caminho");
  assert.equal(isPublishedAddressUnder(normalizePublishedAddress("https://outro.com.br/skincare/tema")!, silo), false, "outro host");
  assert.equal(isPublishedAddressUnder(silo, silo), false, "o Silo não é membro de si mesmo");
  assert.equal(isPublishedAddressUnder(silo, normalizePublishedAddress(SITE)!), false, "a home não é Silo");
});

const entradas = (linhas: readonly Linha[]) => linhas.map(linha => {
  const vinculo = readArchitectKeywordVinculo(linha);
  return {
    keywordId: linha.id, brandId: linha.brand_id, published: vinculo.publicationDeclared,
    pageType: vinculo.pageType, url: vinculo.url, canonicalUrl: vinculo.canonicalUrl,
  };
});

test("(2) cada artigo publicado entra no Silo cuja URL o contém — 20 de 21, e 1 fora", () => {
  const membership = resolvePublishedSiloMembership({ brandId: BRAND, entries: entradas(LOTE) });
  assert.equal(membership.siloAddressByHead.size, 4);
  assert.equal(membership.siloHeadByArticle.size, 20);
  assert.deepEqual(membership.outsideAnySilo, ["art-fora"]);
  assert.deepEqual(membership.conflicts, []);

  const contagem = new Map<string, number>();
  for (const cabeca of membership.siloHeadByArticle.values()) contagem.set(cabeca, (contagem.get(cabeca) || 0) + 1);
  assert.deepEqual(Object.fromEntries(contagem), { "silo-skincare": 6, "silo-cabelos": 5, "silo-maquiagem": 5, "silo-unhas": 4 });
  assert.equal(membership.siloHeadByArticle.get("art-skin-aninhado"), "silo-skincare", "aninhado sobe até o Silo");
  assert.equal(membership.siloHeadByArticle.get("art-cab-lexico-enganoso"), "silo-cabelos", "o endereço vence o léxico");
  for (const livreId of LIVRES.map(item => item.id)) assert.equal(membership.siloHeadByArticle.has(livreId), false);
});

test("(2) outra marca não entra; Silo com endereço duplicado é conflito, não palpite", () => {
  const intrusa = { ...publicada("silo-intruso", "skincare", "silo", "/skincare/tema-0"), brand_id: OUTRA_MARCA };
  const comIntrusa = resolvePublishedSiloMembership({ brandId: BRAND, entries: entradas([...LOTE, intrusa]) });
  assert.equal(comIntrusa.siloHeadByArticle.get("art-skin-0"), "silo-skincare");
  assert.equal(comIntrusa.siloAddressByHead.has("silo-intruso"), false);

  const gemeo = publicada("silo-skincare-2", "skin care", "silo", "/skincare");
  const duplicado = resolvePublishedSiloMembership({ brandId: BRAND, entries: entradas([...LOTE, gemeo]) });
  assert.equal(duplicado.siloHeadByArticle.has("art-skin-0"), false);
  assert.ok(duplicado.conflicts.some(item => item.keywordId === "art-skin-0" && /mesmo endereço/.test(item.reason)));
  // Os outros Silos não são afetados pelo conflito de um.
  assert.equal(duplicado.siloHeadByArticle.get("art-cab-0"), "silo-cabelos");

  const aninhados = resolvePublishedSiloMembership({
    brandId: BRAND,
    entries: entradas([...LOTE, publicada("silo-rotina", "rotina de skincare", "silo", "/skincare/rotina")]),
  });
  assert.equal(aninhados.siloHeadByArticle.get("art-skin-aninhado"), "silo-rotina", "vence o Silo mais próximo");
});

/* -------------------------- (2)(3) a proposta revalida em vez de refazer */

const score = (value: number) => ({ value, reasons: [] });
const cluster = (over: Partial<ClusterAnalysis> & { clusterRef: string; memberKeywordIds: string[] }): ClusterAnalysis => ({
  label: over.clusterRef,
  headKeywordId: over.memberKeywordIds[0],
  ambiguousHeadKeywordIds: [],
  destination: "insufficient_depth" as ClusterDestination,
  suggestedTerritoryRef: null,
  suggestedTerritoryLabel: null,
  alternativeTerritoryRefs: [],
  scores: { coherence: score(0.6), siloFit: score(0.4), depth: score(0.2), publishedEvidence: score(0) },
  confidence: "média",
  reason: "grupo léxico",
  ...over,
});

const ids = (prefixo: string) => LOTE.filter(item => item.id.startsWith(prefixo)).map(item => item.id);

/** O léxico, como o analisador faria: por texto, sem saber de URL. */
const CLUSTERS = [
  cluster({ clusterRef: "skincare", memberKeywordIds: ["silo-skincare", ...ids("art-skin-"), "art-cab-lexico-enganoso", ...ids("livre-skin-")] }),
  // Só livres e um artigo publicado de maquiagem, sem a cabeça: o léxico via Silo novo.
  cluster({ clusterRef: "maquiagem dica", destination: "new_silo_candidate", memberKeywordIds: ["art-maq-0", ...ids("livre-maq-")] }),
  // Patrimônio publicado sozinho não semeia Silo novo.
  cluster({ clusterRef: "novidades da marca", destination: "new_silo_candidate", memberKeywordIds: ["art-fora"] }),
  // Livres de outro tema seguem pela proposta de sempre.
  cluster({ clusterRef: "jardinagem em casa", destination: "new_silo_candidate", memberKeywordIds: ids("livre-jard-") }),
];

const analise: ArchitectureAnalysis = {
  clusters: CLUSTERS,
  summary: { keywords: LOTE.length, clusters: CLUSTERS.length, strengthening: 0, newSilos: 3, insufficient: 1, ambiguous: 0, confidence: "média" },
  narrative: [],
  baseHash: "base:revalidacao",
};

const sinais = (linha: Linha): KeywordDnaSignals => ({
  keywordId: linha.id, text: linha.keyword, intent: "Informativa", secondaryIntent: null, funnel: null,
  semanticState: null, confidence: null, centralEntity: null, modifiers: [],
  perceivedProblem: null, audience: null, desiredResult: null, editorialType: null,
  awarenessLevel: null, journeyStage: null, cannibalizationNote: null,
  dnaVersionId: null, dnaContentHash: `hash-${linha.id}`,
} as KeywordDnaSignals);

const declaracoes = new Map<string, EditorialUnitDeclaration>(LOTE.flatMap(linha => {
  const declaracao = editorialUnitDeclarationFromVinculo(readArchitectKeywordVinculo(linha));
  return declaracao ? [[linha.id, declaracao] as const] : [];
}));

const slugOf = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const proposta = (revalidar: boolean) => buildArchitectureWorkingProposal({
  analysis: analise,
  existingSilos: [],
  keywords: LOTE.map(sinais),
  declarations: declaracoes,
  slugOf,
  ...(revalidar ? {
    publishedKeywordIds: new Set([...SILOS, ...ARTIGOS].map(item => item.id)),
    publishedSiloHeadByArticle: resolvePublishedSiloMembership({ brandId: BRAND, entries: entradas(LOTE) }).siloHeadByArticle,
  } : {}),
});

test("(2) a proposta põe cada publicada no Silo que o site declara e cobre o lote inteiro", () => {
  const resultado = proposta(true);
  const destino = new Map(resultado.assignments.map(item => [item.keywordId, item]));
  const siloDe = (keywordId: string) => resultado.silos.find(silo => silo.key === destino.get(keywordId)?.siloKey)?.seedKeywordId;

  assert.equal(resultado.counters.KEYWORDS_ANALYZED, 155);
  assert.equal(resultado.counters.RESOLVED_KEYWORDS, 155, "nenhuma keyword fica fora do plano");

  // As 4 cabeças publicadas são os Silos, com a primária declarada.
  for (const silo of SILOS) {
    assert.equal(destino.get(silo.id)?.declaredBy, "published_silo_head", silo.id);
    const proposto = resultado.silos.find(item => item.seedKeywordId === silo.id);
    assert.equal(proposto?.primaryKeywordDeclaration?.keywordId, silo.id, "o Silo publicado mantém a primária declarada");
    assert.equal(proposto?.primaryKeywordDeclaration?.declaration.canonical, silo.analise_semantica.site_origin && (silo.analise_semantica.site_origin as { canonicalUrl: string }).canonicalUrl);
  }

  // 20 artigos pela URL; o léxico enganoso não os move.
  const pelaUrl = resultado.assignments.filter(item => item.declaredBy === "published_url");
  assert.equal(pelaUrl.length, 20);
  assert.equal(siloDe("art-cab-lexico-enganoso"), "silo-cabelos");
  assert.equal(siloDe("art-skin-aninhado"), "silo-skincare");
  assert.equal(siloDe("art-maq-0"), "silo-maquiagem");
  assert.ok(/URL publicada está sob a URL do Silo/.test(destino.get("art-unha-0")!.reason));

  // Publicada fora de Silo: sem destino inventado, com o motivo.
  assert.equal(destino.has("art-fora"), false);
  assert.ok(resultado.unassigned.some(item => item.keywordId === "art-fora" && /Publicada fora de Silo/.test(item.reason)));
});

test("(3) remontar: as livres se reagrupam em torno do publicado, e publicada não semeia Silo novo", () => {
  const resultado = proposta(true);
  const destino = new Map(resultado.assignments.map(item => [item.keywordId, item.siloKey]));
  const chaveDe = (seed: string) => resultado.silos.find(silo => silo.seedKeywordId === seed)!.key;

  // Livres de skincare vão com a cabeça; livres de maquiagem vão para o Silo
  // do artigo publicado que está no grupo delas — sem Silo novo "maquiagem dica".
  for (const id of ids("livre-skin-")) assert.equal(destino.get(id), chaveDe("silo-skincare"), id);
  for (const id of ids("livre-maq-")) assert.equal(destino.get(id), chaveDe("silo-maquiagem"), id);

  const sementes = resultado.silos.map(silo => silo.seedKeywordId);
  for (const artigo of ARTIGOS) assert.equal(sementes.includes(artigo.id), false, `${artigo.id} não pode semear Silo`);
  // 4 publicados + 1 novo das livres de jardinagem, pela proposta de sempre.
  assert.equal(resultado.counters.SILOS_PROPOSED, 5);
  assert.ok(resultado.silos.some(silo => silo.name === "jardinagem em casa"));
  for (const id of ids("livre-jard-")) assert.equal(destino.get(id), chaveDe(resultado.silos.find(silo => silo.name === "jardinagem em casa")!.seedKeywordId!), id);

  // Determinístico: a mesma entrada, o mesmo hash.
  assert.equal(proposta(true).proposalHash, resultado.proposalHash);
});

test("(3) sem as entradas novas, a proposta é a de antes (retrocompatível)", () => {
  const antes = proposta(false);
  assert.equal(antes.assignments.some(item => item.declaredBy === "published_url"), false);
  // O léxico enganoso, sozinho, levava o artigo de cabelos para skincare.
  const skincare = antes.silos.find(silo => silo.seedKeywordId === "silo-skincare")!.key;
  assert.equal(antes.assignments.find(item => item.keywordId === "art-cab-lexico-enganoso")?.siloKey, skincare);
});

/* ----------------------------- (3) confirmar: membership sem identidade */

const REF = "territory:11111111-1111-4111-8111-111111111111";
const territorio = (): TerritoryCandidate => ({
  schemaVersion: 1, territoryRef: REF, brandId: BRAND, existingSiloRef: null,
  name: "skincare", centralEntity: "skincare", macroIntent: "informacional",
  boundary: { includes: ["skincare"], excludes: [] },
  narrative: { summary: "Universo.", relationToBrand: "core", editorialAngle: null },
  discovery: { origin: "manual_strategic", evidence: [], detectedAt: NOW },
  territoryKind: "new", architecturalOrigin: "manual_strategic", ingestionOrigin: "ui",
  publicationProtection: "unpublished", lifecycleStatus: "candidate", decisionState: "pending",
  slugState: { proposals: [], confirmed: null, publishedSlug: null, publishedCanonical: null },
  lineage: { splitFrom: null, mergedFrom: [], supersededBy: null },
  conflicts: [], pendingOperation: null,
} as unknown as TerritoryCandidate);

const paisagem = buildTerritorialLandscape({
  brandId: BRAND,
  keywords: [{ id: "art-skin-0", brand_id: BRAND }, { id: "art-fora", brand_id: BRAND }, { id: "livre-skin-0", brand_id: BRAND }],
  territories: [territorio()],
  assignments: [],
} as TerritorialLandscapeInput);

const chave = (keywordId: string, isPublished: boolean) => ({
  keywordId, brandId: BRAND, workflowItemId: `wf-${keywordId}`, expectedLock: 1, currentTerritoryRef: null, isPublished,
});

test("(3) a publicada só ganha membership no Silo que o site declara", () => {
  const declarada = planSiloAssignment({
    brandId: BRAND, landscape: paisagem, keyword: { ...chave("art-skin-0", true), declaredTerritoryRef: REF },
    target: { kind: "territory", territoryRef: REF }, reason: "Decisão humana.", decidedAt: NOW,
  });
  assert.equal(declarada.ok, true);

  const semDeclaracao = planSiloAssignment({
    brandId: BRAND, landscape: paisagem, keyword: chave("art-skin-0", true),
    target: { kind: "territory", territoryRef: REF }, reason: "Decisão humana.", decidedAt: NOW,
  });
  assert.equal(semDeclaracao.ok, false);
  assert.ok(!semDeclaracao.ok && semDeclaracao.refusals.some(item => item.code === "PUBLISHED_KEYWORD_PROTECTED"));

  const lote = planSiloDecisionBatch({
    brandId: BRAND,
    landscape: paisagem,
    keywordOf: keywordId => chave(keywordId, keywordId.startsWith("art-")),
    decisions: [
      { keywordId: "art-skin-0", target: { kind: "territory", territoryRef: REF }, declaredBySite: true },
      { keywordId: "art-fora", target: { kind: "unassigned" } },
      { keywordId: "livre-skin-0", target: { kind: "territory", territoryRef: REF } },
    ],
    decidedAt: NOW,
  });
  assert.deepEqual(lote.writes.map(item => item.keywordId).sort(), ["art-skin-0", "livre-skin-0"]);
  assert.deepEqual(lote.unchanged, ["art-fora"], "publicada já fora de Silo: nada a gravar, nem falha");
  assert.deepEqual(lote.refused, []);
  // O que sobe é SÓ membership: nenhum campo de identidade publicada.
  const escrita = lote.writes.find(item => item.keywordId === "art-skin-0")!;
  assert.deepEqual(Object.keys(escrita.assignment).sort(), ["territoryAssignment", "territoryRef"]);
  assert.deepEqual(publishedIdentityKeysIn(escrita.assignment), []);
  assert.match(String((escrita.assignment.territoryAssignment as { reason: string }).reason), /Silo que o site declara/);
});

test("reprocessar publicado já no Silo consolidado é no-op, não exige sucessor", () => {
  const consolidada = buildTerritorialLandscape({
    brandId: BRAND,
    keywords: [{ id: "art-skin-0", brand_id: BRAND }],
    territories: [{ ...territorio(), lifecycleStatus: "consolidated", decisionState: "confirmed" }],
    assignments: [],
  } as TerritorialLandscapeInput);
  const lote = planSiloDecisionBatch({
    brandId: BRAND, landscape: consolidada,
    keywordOf: () => ({ ...chave("art-skin-0", true), currentTerritoryRef: REF }),
    decisions: [{ keywordId: "art-skin-0", target: { kind: "territory", territoryRef: REF }, declaredBySite: true }],
    decidedAt: NOW,
  });
  assert.deepEqual(lote.unchanged, ["art-skin-0"]);
  assert.deepEqual(lote.writes, []);
  assert.deepEqual(lote.refused, []);
});

/* ------------------------ (3) remontar livres em torno do artigo publicado */

const kw = (keywordId: string, keyword: string, isPublished = false, over: Partial<ArticleFormationKeyword> = {}): ArticleFormationKeyword => ({
  keywordId, keyword, intent: "Informativa", volume: 100, kgr: 0.2, entity: null, problem: null, isPublished, ...over,
});

test("(3) a livre que repete a publicada entra nela; o resto fica no núcleo dela", () => {
  const publicadaRotina = kw("pub-rotina", "rotina noturna de skincare", true);
  const publicadaProtetor = kw("pub-protetor", "protetor solar facial", true);
  const repete = kw("livre-rotina", "rotina skincare noturna");
  const repete2 = kw("livre-rotina-2", "skincare rotina noturna");
  const outro = kw("livre-acne", "acne na adolescencia");
  const outro2 = kw("livre-acne-2", "acne adolescente tratamento");
  const humana = kw("livre-humana", "rotina noturna skincare", false, { humanFormationRef: "article-formation:x" });

  const resultado = regroupFreeAroundPublished({
    keywords: [publicadaRotina, publicadaProtetor, repete, repete2, outro, outro2, humana],
    freeGroups: [
      { principalKeywordId: "livre-rotina", keywordIds: ["livre-rotina", "livre-rotina-2", "livre-acne"] },
      { principalKeywordId: "livre-acne-2", keywordIds: ["livre-acne-2"] },
      { principalKeywordId: "livre-humana", keywordIds: ["livre-humana"] },
    ],
  });

  assert.deepEqual(resultado.publishedGroups, [
    { principalKeywordId: "pub-rotina", keywordIds: ["pub-rotina", "livre-rotina", "livre-rotina-2"] },
    { principalKeywordId: "pub-protetor", keywordIds: ["pub-protetor"] },
  ], "a publicada continua principal do próprio artigo; duas publicadas nunca se fundem");
  // O núcleo que perdeu a principal elege outra entre as que ficaram.
  assert.deepEqual(resultado.freeGroups, [
    { principalKeywordId: "livre-acne", keywordIds: ["livre-acne"] },
    { principalKeywordId: "livre-acne-2", keywordIds: ["livre-acne-2"] },
    { principalKeywordId: "livre-humana", keywordIds: ["livre-humana"] },
  ]);
  assert.equal(resultado.attached.has("livre-humana"), false, "decisão humana não é tocada");
  assert.equal(resultado.attached.get("livre-rotina")?.publishedKeywordId, "pub-rotina");
});

test("(3) o teto de seis vale para o artigo publicado", () => {
  const pub = kw("pub", "rotina noturna de skincare", true);
  const livres = Array.from({ length: 8 }, (_, i) => kw(`l-${i}`, "rotina noturna skincare"));
  const resultado = regroupFreeAroundPublished({
    keywords: [pub, ...livres],
    freeGroups: [{ principalKeywordId: "l-0", keywordIds: livres.map(item => item.keywordId) }],
  });
  assert.equal(resultado.publishedGroups[0].keywordIds.length, 6);
  assert.equal(resultado.freeGroups[0].keywordIds.length, 3, "o excesso segue no núcleo, sem sumir");
});

test("(3) a mesa usa a remontagem e a membership pela URL", () => {
  const mesa = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const formacao = mesa.slice(mesa.indexOf("const articleFormation = useMemo"));
  const corpo = formacao.slice(0, formacao.indexOf("\n  }, ["));
  assert.match(corpo, /regroupFreeAroundPublished\(\{/);
  assert.match(corpo, /groups: \[\.\.\.remontagem\.freeGroups, \.\.\.gruposPublicados\]/);
  assert.match(mesa, /publishedSiloHeadByArticle: publishedSiloMembership\.siloHeadByArticle/);
  assert.match(mesa, /assignment\.declaredBy \? \{ declaredBySite: true as const \} : \{\}/);
  assert.match(mesa, /resolvePublishedSiloMembership\(\{/);
});

/* ------------- (2) o Silo publicado mantém o ENDEREÇO do site (AGENTS §11) */

test("(2) o slug do Silo publicado é o caminho da URL declarada, não o texto da keyword", () => {
  const resultado = proposta(true);
  const siloDe = (seed: string) => resultado.silos.find(silo => silo.seedKeywordId === seed)!;

  // "cuidados com cabelos" está no ar em /cabelos; "unhas decoradas" em /unhas.
  assert.equal(siloDe("silo-cabelos").slug, "/cabelos");
  assert.equal(siloDe("silo-cabelos").key, "proposed:/cabelos");
  assert.equal(siloDe("silo-unhas").slug, "/unhas");
  assert.equal(siloDe("silo-skincare").slug, "/skincare", "a barra final da URL não entra no slug");
  for (const silo of SILOS) {
    const proposto = siloDe(silo.id);
    const url = (silo.analise_semantica.site_origin as { canonicalUrl: string }).canonicalUrl;
    assert.deepEqual(proposto.publishedIdentity, { slug: new URL(url).pathname.replace(/\/+$/, ""), canonical: url, url }, silo.id);
  }
  // Silo não publicado não ganha identidade publicada.
  assert.equal(resultado.silos.find(silo => silo.name === "jardinagem em casa")!.publishedIdentity, undefined);
});

test("(2) identidade publicada: canônico primeiro, caixa preservada, home e texto solto não viram slug", () => {
  assert.deepEqual(publishedPageIdentityOf({ url: `${SITE}/x`, canonical: "https://www.marca.com.br/Cuidados/Cabelos/?utm=1#a" }),
    { slug: "/Cuidados/Cabelos", canonical: "https://www.marca.com.br/Cuidados/Cabelos/?utm=1#a", url: `${SITE}/x` });
  assert.equal(publishedPageIdentityOf({ url: `${SITE}/`, canonical: null }), null, "a home não é Silo");
  assert.equal(publishedPageIdentityOf({ url: "/cabelos", canonical: null }), null, "sem host não há endereço publicado");
  assert.equal(publishedPageIdentityOf({ url: `${SITE}/cabelos`, canonical: "lixo sem ponto" })?.slug, "/cabelos", "canônico ilegível cede à URL");
  assert.equal(publishedPathKey("/Cabelos/"), "/cabelos");
  assert.equal(publishedPathKey("cabelos"), "/cabelos");
  assert.equal(publishedPathKey("/"), null);
});

test("(2) o território do Silo publicado nasce protegido, com publishedSlug e canonical da declaração", () => {
  const silo = proposta(true).silos.find(item => item.seedKeywordId === "silo-cabelos")!;
  const draft = publishedSiloCandidateDraft({
    name: silo.name,
    publishedSlug: silo.publishedIdentity!.slug,
    publishedCanonical: silo.publishedIdentity!.canonical,
    publishedUrl: silo.publishedIdentity!.url,
  });
  // O servidor valida com o mesmo schema (createTerritoryWorkflowItem).
  const territorio = TerritoryCandidateSchema.parse({ ...draft, territoryRef: REF, brandId: BRAND });
  assert.equal(territorio.publicationProtection, "protected");
  assert.equal(territorio.slugState.publishedSlug, "/cabelos");
  assert.equal(territorio.slugState.publishedCanonical, `${SITE}/cabelos`);
  assert.deepEqual(territorio.slugState.proposals, [], "página no ar não recebe slug proposto");
  assert.equal(territorio.slugState.confirmed, null);
  // O manual segue como era.
  assert.equal((manualSiloCandidateDraft({ name: "x", slug: "/x" }) as { publicationProtection: string }).publicationProtection, "unpublished");

  const mesa = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(mesa, /draft: silo\.publishedIdentity\s*\? publishedSiloCandidateDraft\(\{/);
});

test("publicados declarados são efetiváveis no primeiro processamento sem confirmar proposta livre", () => {
  const proposal = proposta(true);
  const refs = new Map(SILOS.map((silo, index) => [silo.id, `territory:00000000-0000-4000-8000-00000000000${index}`]));
  const refByKey = new Map(proposal.silos.flatMap(silo => {
    const ref = silo.seedKeywordId ? refs.get(silo.seedKeywordId) : null;
    return ref ? [[silo.key, ref] as const] : [];
  }));
  const territories = new Map(proposal.silos.flatMap(silo => {
    const ref = refByKey.get(silo.key);
    if (!ref || !silo.publishedIdentity) return [];
    return [[ref, TerritoryCandidateSchema.parse({
      ...publishedSiloCandidateDraft({
        name: silo.name,
        publishedSlug: silo.publishedIdentity.slug,
        publishedCanonical: silo.publishedIdentity.canonical,
        publishedUrl: silo.publishedIdentity.url,
      }),
      territoryRef: ref, brandId: BRAND,
    })] as const];
  }));
  const membership = resolvePublishedSiloMembership({ brandId: BRAND, entries: entradas(LOTE) });
  const plan = planPublishedArchitectureRecognition({
    brandId: BRAND,
    proposal, declarations: declaracoes, siloHeadByArticle: membership.siloHeadByArticle,
    territoryRefOf: key => refByKey.get(key) ?? null,
    territoryOf: ref => territories.get(ref),
  });
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.territoryRefs.length, 4);
  assert.equal(plan.decisions.length, 24, "4 cabeças e 20 artigos sob URLs dos Silos");
  assert.ok(plan.decisions.every(item => item.declaredBySite === true));
  assert.ok(plan.decisions.every(item => item.keywordId.startsWith("silo-") || item.keywordId.startsWith("art-")));
  assert.equal(plan.decisions.some(item => item.keywordId === "art-fora"), false);
  assert.equal(plan.decisions.some(item => item.keywordId.startsWith("livre-")), false);

  const firstSilo = proposal.silos.find(item => item.seedKeywordId === SILOS[0].id)!;
  const reused = buildArchitectureWorkingProposal({
    analysis: analise, keywords: LOTE.map(sinais), declarations: declaracoes, slugOf,
    existingSilos: [{ territoryRef: refByKey.get(firstSilo.key)!, name: firstSilo.name, centralEntity: firstSilo.name, slug: firstSilo.slug, primaryKeywordId: SILOS[0].id }],
    publishedKeywordIds: new Set([...SILOS, ...ARTIGOS].map(item => item.id)),
    publishedSiloHeadByArticle: membership.siloHeadByArticle,
  });
  const reusedPlan = planPublishedArchitectureRecognition({
    brandId: BRAND,
    proposal: reused, declarations: declaracoes, siloHeadByArticle: membership.siloHeadByArticle,
    territoryRefOf: key => refByKey.get(key) ?? (territories.has(key) ? key : null),
    territoryOf: ref => territories.get(ref),
  });
  assert.equal(reusedPlan.territoryRefs.length, 4, "candidato publicado legado é reaproveitado");
  assert.equal(reusedPlan.decisions.length, 24, "reaproveitar não perde artigos publicados");

  const corrupted = new Map(territories);
  const [firstRef, firstTerritory] = [...corrupted.entries()][0];
  corrupted.set(firstRef, TerritoryCandidateSchema.parse({ ...firstTerritory, slugState: { ...firstTerritory.slugState, publishedSlug: "/outra-raiz" } }));
  const refused = planPublishedArchitectureRecognition({
    brandId: BRAND,
    proposal, declarations: declaracoes, siloHeadByArticle: membership.siloHeadByArticle,
    territoryRefOf: key => refByKey.get(key) ?? null,
    territoryOf: ref => corrupted.get(ref),
  });
  assert.ok(refused.conflicts.length > 0, "endereço divergente não autoriza reconhecimento");
  assert.equal(refused.territoryRefs.length, 3);
  const withoutCanonical = new Map(territories);
  withoutCanonical.set(firstRef, TerritoryCandidateSchema.parse({ ...firstTerritory, slugState: { ...firstTerritory.slugState, publishedCanonical: null } }));
  assert.equal(planPublishedArchitectureRecognition({
    brandId: BRAND, proposal, declarations: declaracoes,
    siloHeadByArticle: membership.siloHeadByArticle,
    territoryRefOf: key => refByKey.get(key) ?? null,
    territoryOf: ref => withoutCanonical.get(ref),
  }).territoryRefs.length, 3, "canonical declarado não pode sumir do território efetivado");
  const otherBrand = planPublishedArchitectureRecognition({
    brandId: "outra-marca", proposal, declarations: declaracoes,
    siloHeadByArticle: membership.siloHeadByArticle,
    territoryRefOf: key => refByKey.get(key) ?? null,
    territoryOf: ref => territories.get(ref),
  });
  assert.deepEqual(otherBrand.decisions, [], "território de outra marca nunca recebe publicado");
});

test("Silo publicado efetivado libera Artigos sem clicar Confirmar arquitetura", () => {
  const mesa = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const painel = readFileSync("modules/arquiteto/architecture-panel.tsx", "utf8");
  assert.match(mesa, /canContinueToArticles=\{confirmedTerritoryRefs\.size > 0\}/);
  assert.match(painel, /\{canContinueToArticles && \(/);
  assert.match(painel, /Confirmar propostas novas/);
  assert.doesNotMatch(painel, /\{confirmed && \(\s*<button[\s\S]*?architect-continue-to-articles/);
});

test("(2) Silo publicado já no acervo é reconhecido pelo endereço (ou pela primária) e não duplica", () => {
  const base = {
    analysis: analise, keywords: LOTE.map(sinais), declarations: declaracoes, slugOf,
    publishedKeywordIds: new Set([...SILOS, ...ARTIGOS].map(item => item.id)),
    publishedSiloHeadByArticle: resolvePublishedSiloMembership({ brandId: BRAND, entries: entradas(LOTE) }).siloHeadByArticle,
  };
  const REF_CABELOS = "territory:22222222-2222-4222-8222-222222222222";
  const pelaUrl = buildArchitectureWorkingProposal({
    ...base,
    existingSilos: [{ territoryRef: REF_CABELOS, name: "Cabelos", centralEntity: "cabelos", slug: "/Cabelos/" }],
  });
  assert.equal(pelaUrl.assignments.find(item => item.keywordId === "silo-cabelos")?.siloKey, REF_CABELOS);
  assert.equal(pelaUrl.assignments.find(item => item.keywordId === "art-cab-0")?.siloKey, REF_CABELOS);
  assert.equal(pelaUrl.silos.some(item => item.key === "proposed:/cabelos"), false, "nenhum Silo duplicado");

  // Território criado antes da correção, com o slug do texto: casa pela primária.
  const pelaPrimaria = buildArchitectureWorkingProposal({
    ...base,
    existingSilos: [{ territoryRef: REF_CABELOS, name: "cuidados com cabelos", centralEntity: "", slug: "/cuidados-com-cabelos", primaryKeywordId: "silo-cabelos" }],
  });
  assert.equal(pelaPrimaria.assignments.find(item => item.keywordId === "silo-cabelos")?.siloKey, REF_CABELOS);
  assert.equal(pelaPrimaria.counters.SILOS_PROPOSED, 4);
});

test("(2) artigo publicado entra pelo endereço do Silo que já é território, mesmo sem a cabeça no lote", () => {
  const REF_UNHAS = "territory:33333333-3333-4333-8333-333333333333";
  const semCabeca = LOTE.filter(item => item.id !== "silo-unhas");
  const membership = resolvePublishedSiloMembership({
    brandId: BRAND,
    entries: entradas(semCabeca),
    territorySilos: [
      { territoryRef: REF_UNHAS, canonicalUrl: `${SITE}/unhas` },
      // Mesmo endereço de uma cabeça do lote: a cabeça vence, sem conflito.
      { territoryRef: "territory:dup", canonicalUrl: `${SITE}/cabelos` },
    ],
  });
  assert.equal(membership.siloHeadByArticle.get("art-unha-0"), REF_UNHAS);
  assert.equal(membership.siloHeadByArticle.get("art-cab-0"), "silo-cabelos");
  assert.deepEqual(membership.conflicts, []);
  assert.deepEqual([...membership.territoryHeads], [REF_UNHAS]);

  const resultado = buildArchitectureWorkingProposal({
    analysis: analise,
    existingSilos: [{ territoryRef: REF_UNHAS, name: "Unhas", centralEntity: "unhas", slug: "/unhas" }],
    keywords: semCabeca.map(sinais),
    declarations: declaracoes,
    slugOf,
    publishedKeywordIds: new Set([...SILOS, ...ARTIGOS].map(item => item.id)),
    publishedSiloHeadByArticle: membership.siloHeadByArticle,
  });
  const unha = resultado.assignments.find(item => item.keywordId === "art-unha-0")!;
  assert.equal(unha.siloKey, REF_UNHAS);
  assert.equal(unha.declaredBy, "published_url");
  assert.match(unha.reason, /Silo "Unhas"/);
});

test("(2) conflito do endereço chega à linha com o motivo real, não como 'fora de Silo'", () => {
  const gemeo = publicada("silo-skincare-2", "skin care", "silo", "/skincare");
  const lote = [...LOTE, gemeo];
  const membership = resolvePublishedSiloMembership({ brandId: BRAND, entries: entradas(lote) });
  const declaracoesComGemeo = new Map(declaracoes);
  declaracoesComGemeo.set(gemeo.id, editorialUnitDeclarationFromVinculo(readArchitectKeywordVinculo(gemeo))!);
  const resultado = buildArchitectureWorkingProposal({
    analysis: analise, existingSilos: [], keywords: lote.map(sinais), declarations: declaracoesComGemeo, slugOf,
    publishedKeywordIds: new Set([...SILOS, ...ARTIGOS, gemeo].map(item => item.id)),
    publishedSiloHeadByArticle: membership.siloHeadByArticle,
    publishedSiloConflicts: new Map(membership.conflicts.map(item => [item.keywordId, item.reason])),
  });
  const linha = resultado.unassigned.find(item => item.keywordId === "art-skin-0")!;
  assert.match(linha.reason, /^Conflito para decisão humana: .*mesmo endereço/);
  assert.doesNotMatch(linha.reason, /Publicada fora de Silo/);
  const fora = resultado.unassigned.find(item => item.keywordId === "art-fora")!;
  assert.match(fora.reason, /Publicada fora de Silo reconhecido/);
});

test("(3) publicada já em território sem Silo declarado pelo site: a membership vigente é preservada", () => {
  const lote = planSiloDecisionBatch({
    brandId: BRAND,
    landscape: paisagem,
    keywordOf: keywordId => ({ ...chave(keywordId, true), currentTerritoryRef: REF }),
    decisions: [{ keywordId: "art-fora", target: { kind: "unassigned" } }],
    decidedAt: NOW,
  });
  assert.deepEqual(lote.unchanged, ["art-fora"], "nem escrita, nem falha");
  assert.deepEqual(lote.writes, []);
  assert.deepEqual(lote.refused, []);

  // Livre continua podendo sair do Silo por decisão humana.
  const livreSai = planSiloDecisionBatch({
    brandId: BRAND,
    landscape: paisagem,
    keywordOf: keywordId => ({ ...chave(keywordId, false), currentTerritoryRef: REF }),
    decisions: [{ keywordId: "livre-skin-0", target: { kind: "unassigned" } }],
    decidedAt: NOW,
  });
  assert.deepEqual(livreSai.writes.map(item => item.keywordId), ["livre-skin-0"]);
});

test("(3) revisão humana com publicada não principal, ou duas publicadas, sai com conflito dito", () => {
  const universo = buildArticleFormationUniverse({
    siloRef: REF, siloLabel: "skincare", siloSlug: "/skincare",
    keywords: [
      kw("livre-principal", "skincare barato", false, { humanFormationRef: "article-formation:h1", humanRole: "principal" }),
      kw("pub-a", "rotina noturna de skincare", true, { humanFormationRef: "article-formation:h1", humanRole: "secundaria" }),
      kw("pub-b", "protetor solar facial", true, { humanFormationRef: "article-formation:h2" }),
      kw("pub-c", "hidratante facial", true, { humanFormationRef: "article-formation:h2" }),
      kw("pub-d", "limpeza de pele", true, { humanFormationRef: "article-formation:h3", humanRole: "principal" }),
      kw("livre-e", "limpeza de pele caseira", false, { humanFormationRef: "article-formation:h3" }),
    ],
  });
  const porRef = new Map(universo.candidates.map(item => [item.candidateRef, item]));
  const h1 = porRef.get("article-formation:h1")!;
  assert.equal(h1.principalKeywordId, "livre-principal", "a decisão humana não é trocada em silêncio");
  assert.ok(h1.conflicts.some(item => /"rotina noturna de skincare" está publicada e não é a principal/.test(item)));
  assert.ok(porRef.get("article-formation:h2")!.conflicts.some(item => /2 páginas publicadas no mesmo artigo/.test(item)));
  assert.deepEqual(porRef.get("article-formation:h3")!.conflicts, [], "publicada principal do próprio grupo: nada a dizer");
});
