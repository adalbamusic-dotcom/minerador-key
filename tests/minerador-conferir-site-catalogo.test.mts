import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { candidateFromCatalogMatch, deriveSitePageStructure, matchKeywordToCatalog, sitePathOf, slugOfText } from "../lib/minerador/site-catalog-match.ts";
import { buildMineradorSiteSyncPlan } from "../lib/minerador/site-sync-adapter.ts";
import { applyPublicationLinkAction, readPublicationLink, readSiteOrigin } from "../lib/minerador/publication-link.ts";
import { isPostLockedToSlug, primaryPostLabel, readPrimaryKeywordPolicy } from "../lib/minerador/primary-keyword-policy.ts";
import { keywordVinculoSummary, resolveKeywordVinculo } from "../lib/minerador/keyword-vinculo.ts";
import { importSiteKeywordsToMinerador } from "../lib/marca/site-minerador-import.ts";
import { deriveMineradorTableRows } from "../lib/minerador/table-view.ts";
import { resolveCanonicalKeywordSnapshot } from "../lib/minerador/canonical-keyword-snapshot.ts";
import { applyApproval } from "../lib/minerador/approved-package.ts";
import { MINERADOR_EDITORIAL_STATUS_OPTIONS } from "../lib/minerador/editorial-status.ts";
import { canCompleteHumanReview } from "../lib/minerador/human-review.ts";
import { KEYWORD_PAGE_TYPES, keywordPageTypeLabel, keywordPageTypeStanding, keywordPageTypeStatement, readKeywordPageType, resolveKeywordPageType, setKeywordPageType } from "../lib/minerador/keyword-page-type.ts";
import { sitePageRoleLabel } from "../lib/minerador/site-catalog-match.ts";

/**
 * "Conferir site" contra o catálogo REMOTO da marca: casa por H1, slug e
 * título, e diz se a página é Silo ou artigo pela posição no caminho.
 * Fixture espelha o Care Glow em 2026-09-20: a página do Silo não está no
 * sitemap; seis artigos abaixo dela estão. REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const entry = (id: string, path: string, h1: string | null, title: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  normalizedUrl: `careglow.com.br${path}`,
  discoveredUrl: `https://careglow.com.br${path}`,
  resolvedUrl: `https://careglow.com.br${path}`,
  declaredCanonicalUrl: `https://careglow.com.br${path}`,
  title,
  h1,
  verificationStatus: "canonical_confirmed",
  presenceState: "present",
  ignoredAt: null,
  ...extra,
});

const catalog = [
  entry("home", "/", "CareGlow", "CareGlow | Skincare"),
  entry("afiliados", "/afiliados", "Afiliados", "Afiliados | CareGlow"),
  entry("pomada", "/rotina-skincare-facial/qual-pomada-e-boa-para-queimadura", "Qual pomada é boa para queimadura", "Qual pomada é boa para queimadura? Como escolher | CareGlow"),
  entry("hidroquinona", "/rotina-skincare-facial/hidroquinona-valor", "Hidroquinona valor", "Hidroquinona valor: quando pagar mais faz sentido | CareGlow"),
  entry("produto", "/rotina-skincare-facial/produto-de-skin-care", "Os 10 Melhores produto de skin care (2026)", "Melhor Produto de Skin Care: Top 10 para sua Pele em 2026 | CareGlow"),
  entry("rugas", "/anti-idade-e-retinol/qual-melhor-creme-para-rugas", "Qual melhor creme para rugas", "Qual melhor creme para rugas | CareGlow"),
  entry("removida", "/rotina-skincare-facial/antiga", "Qual pomada é boa para queimadura", "Antiga", { presenceState: "removed" }),
];

test("a keyword do artigo é encontrada pelo H1 da página, com acento e maiúscula ignorados", () => {
  const matches = matchKeywordToCatalog("qual pomada é boa para queimadura", catalog);
  assert.equal(matches.length, 1, "a entrada removida do catálogo não conta");
  assert.equal(matches[0].entry.id, "pomada");
  assert.equal(matches[0].matchedBy, "h1");
  assert.equal(matches[0].confidence, "high");
});

test("sem H1 igual, o slug da página ainda casa; título só casa a keyword inteira", () => {
  assert.equal(slugOfText("Qual pomada é boa para queimadura"), "qual-pomada-e-boa-para-queimadura");
  const semH1 = catalog.map(item => item.id === "pomada" ? { ...item, h1: null } : item);
  const porSlug = matchKeywordToCatalog("qual pomada e boa para queimadura", semH1);
  assert.equal(porSlug[0]?.matchedBy, "slug");

  assert.equal(matchKeywordToCatalog("produto de skin care", catalog)[0]?.matchedBy, "slug", "slug igual é casamento forte");
  const porTitulo = matchKeywordToCatalog("melhor produto de skin care", catalog);
  assert.equal(porTitulo[0]?.entry.id, "produto");
  assert.equal(porTitulo[0]?.matchedBy, "title");
  assert.equal(porTitulo[0]?.confidence, "medium");

  assert.deepEqual(matchKeywordToCatalog("pomada", catalog), [], "pedaço de keyword não casa");
  assert.deepEqual(matchKeywordToCatalog("skincare facial", catalog), [], "a página do Silo não está no catálogo: nada a casar");
});

test("a URL do Silo (fora do sitemap) é reconhecida como Silo pelos artigos abaixo dela", () => {
  const silo = deriveSitePageStructure("https://careglow.com.br/rotina-skincare-facial", catalog);
  assert.equal(silo.role, "silo");
  assert.equal(silo.siloPath, "/rotina-skincare-facial");
  assert.equal(silo.childCount, 3, "a removida não conta como filha");

  const artigo = deriveSitePageStructure("https://careglow.com.br/rotina-skincare-facial/qual-pomada-e-boa-para-queimadura", catalog);
  assert.equal(artigo.role, "article");
  assert.equal(artigo.siloPath, "/rotina-skincare-facial");
  assert.equal(artigo.siloSlug, "rotina-skincare-facial");
  assert.match(artigo.reason, /não consta no catálogo/);

  assert.equal(deriveSitePageStructure("https://careglow.com.br/", catalog).role, "home");
  assert.equal(deriveSitePageStructure("https://careglow.com.br/afiliados", catalog).role, "institutional");
  assert.equal(deriveSitePageStructure("https://careglow.com.br/silo-novo", catalog).role, "unresolved");
  assert.equal(sitePathOf("careglow.com.br/rotina-skincare-facial/?utm=1"), "/rotina-skincare-facial");
});

test("o casamento vira candidata do fluxo existente, com papel e Silo declarados", () => {
  const [match] = matchKeywordToCatalog("qual pomada é boa para queimadura", catalog);
  const candidate = candidateFromCatalogMatch({ keyword: "qual pomada é boa para queimadura", brandId: "brand-1", match, catalog, candidateId: "11111111-1111-4111-8111-111111111111" });
  assert.equal(candidate.catalogEntryId, "pomada");
  assert.equal(candidate.sourceKind, "site_sitemap");
  assert.equal(candidate.sourceUrl, "https://careglow.com.br/rotina-skincare-facial/qual-pomada-e-boa-para-queimadura");
  assert.equal(candidate.urlSituation, "canonical_confirmed");
  assert.equal(candidate.keywordUrlRelation, "candidate_primary");
  assert.equal(candidate.siteRole, "article");
  assert.equal(candidate.siloPath, "/rotina-skincare-facial");
  assert.equal(candidate.pageH1, "Qual pomada é boa para queimadura");

  // Sem `lastCheckedAt` ainda é candidata: a verificação técnica vem depois.
  assert.equal(readPublicationLink({ status: "bruto", evidence: candidate as never }).state, "candidate");
  const verificada = { ...candidate, lastCheckedAt: "2026-09-20T10:00:00.000Z" };
  assert.equal(readPublicationLink({ status: "bruto", evidence: verificada as never }).state, "verified");

  const plan = buildMineradorSiteSyncPlan([candidate], [{ id: "kw-1", keyword: "Qual pomada é boa para queimadura", lista_id: null, analise_semantica: {} }], null);
  assert.equal(plan.items[0].outcome, "evidence_updated");
  assert.equal(plan.items[0].mineradorKeywordId, "kw-1");
});

test("a candidata declara a keyword de origem e não duplica linha fora do Silo de destino", () => {
  const [match] = matchKeywordToCatalog("qual pomada é boa para queimadura", catalog);
  const candidate = candidateFromCatalogMatch({
    keyword: "qual pomada é boa para queimadura", brandId: "brand-1", match, catalog,
    candidateId: "22222222-2222-4222-8222-222222222222", mineradorKeywordId: "kw-1",
  });
  assert.equal(candidate.mineradorKeywordId, "kw-1");

  // A linha selecionada vive FORA do Silo escolhido — o caso real do Care
  // Glow, onde as keywords estão sem lista. Sem a origem declarada, a busca
  // por texto dentro do Silo não acha e cria uma segunda linha.
  const rows = [{ id: "kw-1", keyword: "Qual pomada é boa para queimadura", lista_id: null, analise_semantica: {} }];
  const comOrigem = buildMineradorSiteSyncPlan([candidate], rows, "silo-destino");
  assert.equal(comOrigem.items[0].outcome, "evidence_updated");
  assert.equal(comOrigem.items[0].mineradorKeywordId, "kw-1");

  const semOrigem = buildMineradorSiteSyncPlan([{ ...candidate, mineradorKeywordId: null }], rows, "silo-destino");
  assert.equal(semOrigem.items[0].outcome, "new", "sem origem declarada, o Silo volta a filtrar");

  // Candidata realmente nova continua exigindo destino.
  const nova = buildMineradorSiteSyncPlan([{ ...candidate, mineradorKeywordId: null }], rows, null);
  assert.equal(nova.items[0].mineradorKeywordId, "kw-1", "sem Silo, o casamento por texto ainda encontra");
});

test("a conferência por link é ação explícita por keyword, não queda do catálogo", () => {
  const source = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  // Comentário casa com o próprio texto que se quer ausente; limpar antes.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // A ação deixou a coluna e virou botão do card DECISÃO, junto dos dados da
  // página (SDD das duas declarações, 2026-09-20). O workspace continua dono
  // do formulário; o card só dispara.
  assert.match(code, /onCheckByLink=\{\(\) => openManualSiteCheck\(item\)\}/, "o card do DNA abre a conferência manual");

  // O formulário era renderizado com `!siteSyncPlan`: uma prévia aberta
  // escondia o campo, e a mensagem de queda do catálogo apontava para um
  // formulário invisível.
  assert.doesNotMatch(code, /manualSiteCheckKeywordId && !siteSyncPlan/, "o formulário não depende da ausência de prévia");
  assert.match(code, /openManualSiteCheck = \(keyword: KeywordItem\) => \{[\s\S]{0,400}setSiteSyncPlan\(null\)/, "abrir a conferência manual fecha a prévia");
  assert.match(code, /setManualSiteCheckUrl\(evidence\?\.resolvedUrl \|\| evidence\?\.sourceUrl/, "a URL já conhecida da keyword vem preenchida");
});

test("colar o link → conferir → salvar → declarar publicado: a cadeia inteira", async () => {
  // O caso real de 2026-09-20: `/rotina-skincare-facial` está no sitemap ao
  // vivo, mas o catálogo persistido é de 2026-09-03 e não a conhece. O link
  // colado à mão é a única entrada — e tem de chegar até "Publicada".
  const keywordId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
  const url = "https://careglow.com.br/rotina-skincare-facial";
  const structure = deriveSitePageStructure(url, catalog);
  assert.equal(structure.role, "silo", "os artigos abaixo dela provam o Silo, mesmo fora do catálogo");

  // O que a tela monta depois da verificação técnica da página.
  const candidate = {
    id: "33333333-3333-4333-8333-333333333333",
    brandId: "brand-1",
    text: "skincare facial",
    normalizedText: "skincare facial",
    catalogEntryId: null,
    sourceKind: "manual_url" as const,
    sourceUrl: url,
    sourceField: "other" as const,
    sourceFields: ["other" as const],
    suggestedRole: "unclassified" as const,
    slugCoherence: "unknown" as const,
    urlSituation: "canonical_confirmed" as const,
    publicationStatus: "not_confirmed" as const,
    keywordUrlRelation: "undefined" as const,
    architectureStatus: "awaiting_architecture" as const,
    relationConfirmedBy: null,
    relationConfirmedAt: null,
    lastCheckedAt: "2026-09-20T23:30:00.000Z",
    confidence: "medium" as const,
    resolvedUrl: url,
    declaredCanonicalUrl: url,
    catalogTitle: null,
    siteRole: structure.role,
    siloPath: structure.siloPath,
    mineradorKeywordId: keywordId,
  };

  // A keyword está SEM lista e o destino é um Silo qualquer: a origem
  // declarada impede que ela seja recriada em vez de atualizada.
  const rows = [{ id: keywordId, keyword: "skincare facial", lista_id: null, analise_semantica: {} }];
  const plan = buildMineradorSiteSyncPlan([candidate], rows, "silo-destino");
  assert.equal(plan.items[0].outcome, "evidence_updated");
  assert.equal(plan.items[0].mineradorKeywordId, keywordId);

  // Persistência: o mesmo caminho da rota, com repositório de teste.
  const saved: Array<{ id: string; analise_semantica: Record<string, unknown> }> = [];
  const result = await importSiteKeywordsToMinerador({
    brandId: "brand-1",
    targetListId: "silo-destino",
    candidates: [candidate],
    importBatchId: "44444444-4444-4444-8444-444444444444",
    requestedBy: "human-1",
    now: "2026-09-20T23:31:00.000Z",
    repository: {
      validateDestination: async () => {},
      findByIds: async (_brandId, ids) => rows.filter(row => ids.includes(row.id)).map(row => ({ id: row.id, brand_id: "brand-1", keyword: row.keyword, status: "bruto", analise_semantica: row.analise_semantica })),
      findByList: async () => [],
      updateKeywordEvidence: async ({ id, analise_semantica }) => { saved.push({ id, analise_semantica }); },
      insertKeyword: async () => { throw new Error("não deve inserir: a keyword já existe fora do Silo de destino"); },
    },
  });
  assert.equal(result.items[0].outcome, "evidence_updated");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, keywordId);

  const origin = readSiteOrigin(saved[0].analise_semantica)!;
  assert.equal(origin.source, "manual_url");
  assert.equal(origin.sourceUrl, url);
  assert.equal(origin.siteRole, "silo", "o papel viaja na evidência persistida");
  assert.equal(origin.siloPath, "/rotina-skincare-facial");

  // Conferida tecnicamente, ainda NÃO publicada: a declaração é humana.
  const verificado = readPublicationLink({ status: "bruto", evidence: origin });
  assert.equal(verificado.state, "verified");
  assert.equal(verificado.action, "confirm");
  assert.equal(verificado.siteRole, "silo");

  const confirmado = applyPublicationLinkAction(saved[0].analise_semantica, { action: "confirm", actorId: "human-1", changedAt: "2026-09-20T23:32:00.000Z", status: "bruto" });
  assert.equal(confirmado.changed, true);
  const publicado = readPublicationLink({ status: "bruto", evidence: readSiteOrigin(confirmado.semantic) });
  assert.equal(publicado.state, "published");
  assert.equal(publicado.url, url);
  assert.equal(publicado.siteRole, "silo", "o papel sobrevive à confirmação");
  assert.equal(publicado.action, "unlink");
});

test("colar o link confere e declara num ato só; o lote continua sem declarar", () => {
  const source = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // Um caminho só de persistência, usado pela prévia do catálogo e pela URL
  // digitada — antes a URL digitada parava na prévia, e a prévia fica no topo
  // da tela: a linha continuava "Livre" e o resultado parecia não existir.
  assert.match(code, /const persistSiteSyncCandidates = async \(/, "persistência extraída");
  assert.match(code, /handleConfirmSiteSync[\s\S]{0,600}await persistSiteSyncCandidates\(candidates\)/, "a prévia do catálogo usa o mesmo caminho");
  assert.match(code, /handleManualSiteCheck[\s\S]{0,4000}await persistSiteSyncCandidates\(\[conferida\]/, "a URL digitada grava direto");

  /*
   * Colar a URL de uma página que está no ar e mandar conferir É a
   * declaração: exigir um segundo clique no card DECISÃO pedia a mesma
   * confirmação duas vezes. O `skipPrompt` existe por isso — e só aqui.
   */
  assert.match(code, /handleManualSiteCheck[\s\S]{0,5000}handlePublicationLinkAction\(conferido as KeywordItem, "confirm", "", \{ skipPrompt: true \}\)/, "colar o link declara a publicação");
  assert.equal((code.match(/skipPrompt: true/g) || []).length, 1, "nenhum outro caminho pula a pergunta ao humano");

  // O lote vindo do catálogo continua só conferindo: são muitas keywords de
  // uma vez, e declarar publicação em massa não é decisão que se toma por
  // engano num botão de prévia.
  // Fatiar pelo corpo, não por distância: `handlePublicationLinkAction` é
  // declarada logo depois e entrava na janela sem ser chamada.
  const confirmarLote = code.slice(code.indexOf("const handleConfirmSiteSync"));
  const corpoDoLote = confirmarLote.slice(0, confirmarLote.indexOf("\n  };"));
  assert.match(corpoDoLote, /persistSiteSyncCandidates\(candidates\)/, "o lote persiste");
  assert.doesNotMatch(corpoDoLote, /handlePublicationLinkAction/, "e não declara publicação");
  // O botão avulso vive no card DECISÃO, para a keyword que foi conferida
  // por outro caminho e ainda não foi declarada.
  const panels = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  assert.match(panels, /Confirmar publicada/);
});

test("as cores seguem o contrato visual da marca, não a conveniência da tela", () => {
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const code = workspace.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

  /*
   * `sistema-visual.md` §5.0.1: `identity-published` vale SOMENTE para slug,
   * link e canonical, e só quando o status é publicado. Eu a tinha usado em
   * dois badges de estado — que é exatamente o uso proibido.
   */
  const usos = code.match(/identity-published/g) || [];
  assert.equal(usos.length, 1, "identity-published só no endereço da página");
  assert.match(code, /data-keyword-page-url[\s\S]{0,600}publicationLink\.state === "published" \? "text-identity-published" : "text-identity-new"/, "publicada usa a cor publicada; conferida usa a nova");

  // A linha inteira deixou de ser vermelha: o sinal mora no selo.
  assert.doesNotMatch(code, /publicationProtected[\s\S]{0,120}bg-danger-soft/, "a linha publicada volta à cor normal");
  assert.match(code, /border-danger\/50 bg-danger-soft[\s\S]{0,400}Publicado/, "o selo PUBLICADO carrega o sinal");

  // Badges de estado usam tokens de status, nunca a cor de identidade.
  assert.match(code, /vinculo\.postLockedToSlug[\s\S]{0,200}border-context-accent/);
  assert.match(code, /vinculo\.pageType\.declared[\s\S]{0,200}border-context-accent/);
});

test("dois eixos: status editorial e vínculo não se misturam, e o filtro lê o que a coluna mostra", async () => {
  const semantic = {
    dna_origem: "logico_deterministico",
    intencao_principal: "Informativa",
    nicho: "Estética",
    funnel: "TOFU",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-09-20T10:00:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", status: "success", resultsAllintitle: 336, measuredAt: "2026-09-20T10:01:00.000Z" },
    kgr_aplicabilidade: "applicable",
    site_origin: {
      schemaVersion: "site-sitemap-v1", source: "manual_url", brandId: "brand-1", catalogEntryId: null,
      sourceUrl: "https://careglow.com.br/rotina-skincare-facial",
      resolvedUrl: "https://careglow.com.br/rotina-skincare-facial",
      declaredCanonicalUrl: "https://careglow.com.br/rotina-skincare-facial",
      urlSituation: "canonical_confirmed", publicationStatus: "not_confirmed", keywordUrlRelation: "undefined",
      lastCheckedAt: "2026-09-20T23:30:00.000Z", siteRole: "silo", siloPath: "/rotina-skincare-facial",
      normalizedText: "skincare facial", relationConfirmedBy: null, relationConfirmedAt: null,
    },
  };

  // Publicada no site, crua no Minerador: os dois eixos convivem.
  const linha = { id: "kw-1", keyword: "skincare facial", location: null, results_allintitle: 336, volume_search: 90, kgr_score: null, intent: null, status: "bruto", lista_id: null, analise_semantica: semantic };
  const vinculo = readPublicationLink({ status: linha.status, evidence: readSiteOrigin(semantic) });
  assert.equal(vinculo.state, "verified", "tem página conferida");
  assert.equal(resolveCanonicalKeywordSnapshot(linha).status.status, "bruto", "e continua bruta: não passou pelos processos");

  const filtros = {
    searchQuery: "", status: "Todos", intent: "Todos", listId: "Todos", siteRelation: "Todos",
    siteArchitecture: "Todos", sitePublication: "Todos", kgrApplicability: "Todos", kgrMeasurement: "Todos",
    volumeEligibility: "Todos", orderMode: "column" as const, manualOrderIds: [], sortColumn: null, sortDirection: "asc" as const,
  };
  const filtra = (patch: Record<string, string>) => deriveMineradorTableRows([linha], [], { ...filtros, ...patch } as never).length;
  assert.equal(filtra({ sitePublication: "verified" }), 1, "o filtro de Vínculo fala a língua da coluna");
  assert.equal(filtra({ sitePublication: "published" }), 0);
  assert.equal(filtra({ status: "bruto" }), 1);
  assert.equal(filtra({ status: "aprovado" }), 0);

  // Aprovada e depois mexida: a coluna mostra "Em revisão" sem ninguém gravar.
  const aprovada = await applyApproval({
    keywordId: "kw-1", brandId: "brand-1", keyword: "skincare facial", intent: "Informativa",
    volumeSearch: 90, resultsAllintitle: 336, kgrScore: null, listaId: null, semantic,
    approvedAt: "2026-09-20T12:00:00.000Z", approvedBy: "human-1",
  });
  const mexida = { ...linha, status: "aprovado", volume_search: 140, analise_semantica: aprovada };
  assert.equal(resolveCanonicalKeywordSnapshot(mexida).status.status, "em_revisao");
  const filtraMexida = (patch: Record<string, string>) => deriveMineradorTableRows([mexida], [], { ...filtros, ...patch } as never).length;
  assert.equal(filtraMexida({ status: "em_revisao" }), 1, "filtrar por Em revisão encontra o que a tela mostra");
  assert.equal(filtraMexida({ status: "aprovado" }), 0, "e não devolve a que a tela já tirou de aprovada");
});

test("declarar publicada congela o canônico e não mexe no status editorial", () => {
  const origin = {
    schemaVersion: "site-sitemap-v1", source: "manual_url", brandId: "brand-1", catalogEntryId: null,
    sourceUrl: "https://careglow.com.br/rotina-skincare-facial?utm=1",
    resolvedUrl: "https://careglow.com.br/rotina-skincare-facial",
    declaredCanonicalUrl: "https://careglow.com.br/rotina-skincare-facial",
    urlSituation: "canonical_confirmed", publicationStatus: "not_confirmed", keywordUrlRelation: "candidate_primary",
    lastCheckedAt: "2026-09-20T23:30:00.000Z", siteRole: "silo", siloPath: "/rotina-skincare-facial",
    relationConfirmedBy: null, relationConfirmedAt: null,
  };
  assert.equal(readPublicationLink({ status: "bruto", evidence: origin }).canonicalUrl, null, "não há canônico antes da declaração");

  const confirmado = applyPublicationLinkAction({ site_origin: origin }, { action: "confirm", actorId: "human-1", changedAt: "2026-09-20T23:40:00.000Z", status: "bruto" });
  const view = readPublicationLink({ status: "bruto", evidence: readSiteOrigin(confirmado.semantic) });
  assert.equal(view.state, "published");
  assert.equal(view.canonicalUrl, "https://careglow.com.br/rotina-skincare-facial", "o canônico declarado fica congelado na evidência");
  assert.equal(view.relation, "confirmed_primary");
  // Declarar publicação NÃO aprova a keyword: ela continua no eixo editorial.
  assert.equal(resolveCanonicalKeywordSnapshot({ id: "kw-1", keyword: "skincare facial", status: "bruto", analise_semantica: confirmado.semantic }).status.status, "bruto");
});

test("uma lista de status editorial em todas as telas, sem opção escrita à mão", () => {
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const panels = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  const limpo = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // Eram quatro listas escritas à mão — coluna, recuperação de legado, filtro
  // e Decisão — e três divergiam. Divergência não se conserta conferindo as
  // quatro; conserta-se tendo uma.
  for (const [nome, fonte] of [["workspace", limpo(workspace)], ["dna-panels", limpo(panels)]] as const) {
    for (const status of ["bruto", "em_revisao", "aprovado", "rejeitado", "publicado"]) {
      assert.doesNotMatch(fonte, new RegExp(`<option value="${status}"`), `${nome}: <option> de status escrito à mão (${status})`);
    }
  }
  assert.equal((limpo(workspace).match(/MINERADOR_EDITORIAL_STATUS_OPTIONS\.map/g) || []).length, 5, "filtro, recuperação de legado, lote (duas barras) e criação manual — a coluna deixou de escrever");
  assert.equal((limpo(panels).match(/MINERADOR_EDITORIAL_STATUS_OPTIONS\.map/g) || []).length, 1, "Status final na Decisão");

  assert.deepEqual(
    MINERADOR_EDITORIAL_STATUS_OPTIONS.map(option => option.value),
    ["bruto", "em_revisao", "aprovado", "rejeitado"],
    "sem `publicado`: publicação é o outro eixo",
  );
});

test("o canônico declarado continua sendo o endereço que a tela aponta", () => {
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  // O papel observado saiu da coluna: lá ficam as declarações. O endereço
  // saiu junto e foi para o lado da palavra-chave, inteiro.
  assert.match(workspace, /publicationLink\.canonicalUrl \|\| publicationLink\.url/, "publicada aponta para o canônico declarado");

  // Livre e Publicada continuam sendo estados distintos e legíveis.
  assert.equal(readPublicationLink({ status: "bruto", evidence: null }).label, "Livre");
  const publicada = readPublicationLink({
    status: "bruto",
    evidence: {
      sourceUrl: "https://careglow.com.br/rotina-skincare-facial",
      resolvedUrl: "https://careglow.com.br/rotina-skincare-facial",
      canonicalUrl: "https://careglow.com.br/rotina-skincare-facial",
      urlSituation: "canonical_confirmed", publicationStatus: "published",
      lastCheckedAt: "2026-09-20T23:30:00.000Z",
      publicationConfirmedBy: "human-1", publicationConfirmedAt: "2026-09-20T23:40:00.000Z",
      keywordUrlRelation: "confirmed_primary", siteRole: "silo", siloPath: "/rotina-skincare-facial",
    },
  });
  assert.equal(publicada.label, "Publicada · Principal");
  assert.equal(publicada.siteRole, "silo");
  assert.equal(publicada.canonicalUrl, "https://careglow.com.br/rotina-skincare-facial");
});

test("o posto de principal é declaração da Revisão Humana, com default dos dois lados", () => {
  const panels = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const limpo = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(limpo(panels), /aria-label="Vínculo da keyword"/, "a seção vive na Revisão Humana");
  assert.match(limpo(panels), /aria-label="Posto de principal na revisão humana"/, "com o posto dentro dela");
  assert.match(limpo(panels), /type: "primary_policy"/, "e despacha como ação de revisão, junto do KGR");
  assert.doesNotMatch(limpo(panels), /Política da principal<\/label>/, "o seletor duplicado saiu da Decisão");
  assert.match(limpo(workspace), /action\.type === "primary_policy"/, "o workspace atende a ação");

  /*
   * O DEFAULT SEGUE O FATO.
   *
   * Sem publicação a keyword é livre — não há vaga a perder. Com publicação
   * declarada ela já é a primária de um endereço no ar, e o default é
   * travada ao slug. Soltar continua sendo escolha; cobrar declaração de
   * quem já tem uma seria inventar pendência.
   */
  assert.equal(readPrimaryKeywordPolicy({ status: "bruto", semantic: {} }), "free");
  assert.equal(readPrimaryKeywordPolicy({ status: "bruto", semantic: {}, publicationDeclared: true }), "locked");
  assert.equal(
    readPrimaryKeywordPolicy({ status: "bruto", semantic: { primary_keyword_policy: "reviewable" }, publicationDeclared: true }),
    "reviewable",
    "a escolha do humano vence o default",
  );

  // E por isso o posto não entra no gate da revisão.
  const publicada = {
    kgr_aplicabilidade: "applicable",
    site_origin: {
      sourceUrl: "https://careglow.com.br/rotina-skincare-facial",
      resolvedUrl: "https://careglow.com.br/rotina-skincare-facial",
      urlSituation: "canonical_confirmed", publicationStatus: "published",
      lastCheckedAt: "2026-09-20T23:30:00.000Z",
      publicationConfirmedBy: "human-1", publicationConfirmedAt: "2026-09-20T23:40:00.000Z",
    },
  };
  const completacao = canCompleteHumanReview(publicada, { status: "bruto" });
  assert.equal(completacao.ok, true);
  assert.equal("pendingPrimaryPolicy" in completacao, false, "default é resposta, não pendência");

  // O cabeçalho do perfil repete o par do Vínculo, e "Publicada" é alerta.
  /*
   * O cabeçalho só fala quando há publicação: keyword nova não tem URL
   * nem vaga a perder, e dois selos diziam "Livre" pela mesma ausência.
   * O par do Vínculo continua visível na coluna, sempre.
   */
  assert.match(limpo(panels), /\{published && \([\s\S]{0,900}label="Publicada" tone="danger"/, "publicada é alerta, e só aparece publicada");
  assert.match(limpo(panels), /\{published && \([\s\S]{0,900}label=\{headerVinculo\.postLabel\}/, "o posto aparece junto");
  assert.match(limpo(panels), /\{published && \([\s\S]{0,900}label=\{headerVinculo\.pageTypeLabel\}/, "e o tipo também");
  assert.doesNotMatch(limpo(panels), /label=\{published \? "Publicada" : "Livre"\}/, "sem publicação o cabeçalho não anuncia ausência");
});

test("a coluna Status informa e não escreve; publicado é marcador, não classificação", () => {
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const limpo = workspace.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // Escrever status é papel da barra do rodapé e do card do DNA. A coluna lê.
  assert.doesNotMatch(limpo, /onChange=\{\(e\) => handleUpdateStatus\(item\.id, e\.target\.value\)\}/, "a coluna não escreve mais o status");
  assert.match(limpo, /Classificação atual\. Para alterar, use a barra do rodapé ou o card do DNA\./);
  assert.match(limpo, /publicationLink\.state === "published"[\s\S]{0,900}>\s*Publicado\s*</, "o marcador de publicação aparece ao lado da classificação");

  // Publicado NÃO entra no enum editorial: continua sendo o outro eixo.
  assert.deepEqual(MINERADOR_EDITORIAL_STATUS_OPTIONS.map(option => option.value), ["bruto", "em_revisao", "aprovado", "rejeitado"]);
});

test("tipo de página: padrão Artigo, observado no site, declarado pelo humano", () => {
  // Nada declarado e nada no site: Artigo é o que a maioria vira.
  const padrao = resolveKeywordPageType({ semantic: {} });
  assert.deepEqual(padrao, { type: "article", source: "default", determined: false, declared: false, published: false });
  assert.equal(keywordPageTypeStatement(padrao.type, { published: false }), "Potencial: Artigo");
  assert.equal(keywordPageTypeStatement(padrao.type, { published: true }), "Artigo");

  // Enquanto a publicação não é declarada, o papel observado só sugere.
  const observado = resolveKeywordPageType({ semantic: {}, siteRole: "silo" });
  assert.deepEqual(observado, { type: "silo", source: "site", determined: true, declared: false, published: false });
  assert.deepEqual(
    resolveKeywordPageType({ semantic: {}, siteRole: "institutional" }),
    { type: "article", source: "default", determined: false, declared: false, published: false },
    "papel não editorial não vira tipo",
  );

  // A declaração humana vence o observado e guarda histórico.
  const declarado = setKeywordPageType({}, { pageType: "silo", actorId: "human-1", changedAt: "2026-09-20T23:50:00.000Z" });
  assert.equal(declarado.changed, true);
  assert.deepEqual(
    resolveKeywordPageType({ semantic: declarado.semantic, siteRole: "article" }),
    { type: "silo", source: "human", determined: true, declared: false, published: false },
  );
  assert.equal((declarado.semantic.keyword_page_type_history as unknown[]).length, 1);

  const repetido = setKeywordPageType(declarado.semantic, { pageType: "silo", actorId: "human-1", changedAt: "2026-09-20T23:55:00.000Z" });
  assert.equal(repetido.changed, false, "declarar o mesmo valor não cria versão");

  const landing = setKeywordPageType(declarado.semantic, { pageType: "landing_page", actorId: "human-1", changedAt: "2026-09-21T00:00:00.000Z" });
  assert.equal(readKeywordPageType({ semantic: landing.semantic }), "landing_page");
  assert.deepEqual(KEYWORD_PAGE_TYPES, ["article", "silo", "landing_page", "service_page"]);

  // Declarar tipo nunca é obrigatório: não entra no gate da revisão.
  assert.equal(canCompleteHumanReview({ kgr_aplicabilidade: "applicable" }, { status: "bruto" }).ok, true);
});

test("o Vínculo mostra só as duas declarações; conferência e link saem da coluna", () => {
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const panels = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  const limpo = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
  const celula = limpo(workspace).slice(
    limpo(workspace).indexOf(`<td data-keyword-vinculo-cell className="border-r border-divider/70 px-2 py-1 text-center whitespace-nowrap">`),
    limpo(workspace).indexOf(`{/* Resultados`) >= 0 ? limpo(workspace).indexOf(`{/* Resultados`) : undefined,
  );

  assert.match(celula, /vinculo\.postLabel/, "declaração 1: o posto, Livre ou Travado ao slug");
  assert.doesNotMatch(celula, /Posto a declarar/, "não existe posto por declarar: o padrão é Livre");
  assert.match(celula, /vinculo\.pageTypeLabel/, "declaração 2: o tipo, potencial ou declarado");
  assert.doesNotMatch(celula, /Conferir por link/, "conferir saiu da coluna");
  assert.doesNotMatch(celula, /Confirmar publicada/, "confirmar saiu da coluna");

  // Foram para o card DECISÃO, junto dos dados da página.
  assert.match(limpo(panels), /aria-label="Página publicada"[\s\S]{0,2600}Conferir por link/);
  assert.match(limpo(panels), /aria-label="Página publicada"[\s\S]{0,2600}Confirmar publicada/);

  // O endereço inteiro mora ao lado da palavra-chave, com cor própria.
  assert.match(limpo(workspace), /data-keyword-page-url[\s\S]{0,400}text-identity-published/);
  assert.match(limpo(workspace), /data-keyword-page-url[\s\S]{0,900}publicationLink\.canonicalUrl \|\| publicationLink\.url \|\| getCanonicalUrl\(item\)/);

  // As duas declarações se fazem na Revisão Humana, e nenhuma é obrigatória.
  assert.match(limpo(panels), /aria-label="Vínculo da keyword"/);
  assert.match(limpo(panels), /<VinculoPageTypeSelect[\s\S]{0,200}ariaContext="na revisão humana"/, "nome acessível: o rótulo visível + contexto");
  assert.match(limpo(panels), /aria-label="Posto de principal na revisão humana"/);
});

test("publicada, o tipo é declaração — e a escolha continua livre", () => {
  const evidencia = {
    sourceUrl: "https://careglow.com.br/rotina-skincare-facial",
    resolvedUrl: "https://careglow.com.br/rotina-skincare-facial",
    urlSituation: "canonical_confirmed", publicationStatus: "published",
    lastCheckedAt: "2026-09-20T23:30:00.000Z",
    publicationConfirmedBy: "human-1", publicationConfirmedAt: "2026-09-20T23:40:00.000Z",
    siteRole: "silo", siloPath: "/rotina-skincare-facial",
  };
  assert.equal(readPublicationLink({ status: "bruto", evidence: evidencia }).state, "published");

  // Potencial só existe enquanto a keyword é nova. Publicada, o tipo vem do
  // papel observado e passa a ser DECLARAÇÃO — muda o peso da palavra.
  const publicada = resolveKeywordPageType({ semantic: { site_origin: evidencia }, siteRole: "silo", published: true });
  assert.deepEqual(publicada, { type: "silo", source: "site", determined: true, declared: true, published: true });
  assert.equal(keywordPageTypeStanding(publicada.type, { declared: true }), "Silo · declarado");
  assert.equal(keywordPageTypeStanding("article", { declared: false }), "Artigo · potencial");

  // Mas NÃO trava: corrigir o que a página é tem de ser possível sem desfazer
  // a publicação. Nenhuma recusa, nenhum `disabled` no domínio.
  const corrigido = setKeywordPageType({ site_origin: evidencia }, {
    pageType: "landing_page", actorId: "human-1", changedAt: "2026-09-21T00:10:00.000Z", siteRole: "silo", published: true,
  });
  assert.equal(corrigido.changed, true, "publicada, o humano ainda corrige o tipo");
  assert.equal(corrigido.reason, undefined);
  assert.equal(readKeywordPageType({ semantic: corrigido.semantic, published: true }), "landing_page");

  // Nova: o mesmo valor, outro peso.
  const nova = resolveKeywordPageType({ semantic: {}, published: false });
  assert.equal(nova.declared, false);
  assert.equal(keywordPageTypeStanding(nova.type, { declared: nova.declared }), "Artigo · potencial");

  // O posto tem dois valores visíveis: três internos, duas respostas.
  assert.equal(primaryPostLabel("free"), "Livre");
  assert.equal(primaryPostLabel("reviewable"), "Livre", "presa a uma publicação, mas podendo sair, ainda é livre");
  assert.equal(primaryPostLabel("locked"), "Travado ao slug");
  assert.equal(isPostLockedToSlug("locked"), true);
  assert.equal(isPostLockedToSlug("reviewable"), false);
});

test("uma resolução do Vínculo para as três telas — a Revisão decide, as outras refletem", () => {
  const publicada = {
    site_origin: {
      sourceUrl: "https://careglow.com.br/rotina-skincare-facial",
      resolvedUrl: "https://careglow.com.br/rotina-skincare-facial",
      canonicalUrl: "https://careglow.com.br/rotina-skincare-facial",
      urlSituation: "canonical_confirmed", publicationStatus: "published",
      lastCheckedAt: "2026-09-20T23:30:00.000Z",
      publicationConfirmedBy: "human-1", publicationConfirmedAt: "2026-09-20T23:40:00.000Z",
      siteRole: "silo", siloPath: "/rotina-skincare-facial",
    },
  };

  // Publicada: o default é Travado ao slug, e o tipo é declaração.
  const comPublicacao = resolveKeywordVinculo({ status: "bruto", semantic: publicada });
  assert.equal(comPublicacao.publicationDeclared, true);
  assert.equal(comPublicacao.post, "locked");
  assert.equal(comPublicacao.postLabel, "Travado ao slug");
  assert.equal(comPublicacao.postSelectValue, "locked");
  assert.equal(comPublicacao.pageTypeLabel, "Silo · declarado");
  assert.equal(keywordVinculoSummary(comPublicacao), "Travado ao slug · Silo · declarado");

  // Nova: Livre e potencial.
  const nova = resolveKeywordVinculo({ status: "bruto", semantic: {} });
  assert.equal(nova.postLabel, "Livre");
  assert.equal(nova.postSelectValue, "reviewable", "soltar grava reviewable, não free");
  assert.equal(nova.pageTypeLabel, "Artigo · potencial");

  // A escolha humana vence o default, dos dois lados.
  const solta = resolveKeywordVinculo({ status: "bruto", semantic: { ...publicada, primary_keyword_policy: "reviewable", keyword_page_type: "landing_page" } });
  assert.equal(solta.postLabel, "Livre");
  assert.equal(solta.pageTypeLabel, "Landing page · declarado");

  /*
   * A DIVERGÊNCIA QUE ISTO IMPEDE.
   *
   * Coluna, cabeçalho do Perfil e Revisão Humana derivavam o par por conta
   * própria; a Revisão dizia "Livre" para uma publicada enquanto a coluna já
   * dizia "Travado ao slug". Agora as três chamam o mesmo resolvedor, e
   * nenhuma delas resolve nada sozinha.
   */
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const panels = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  const limpo = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.equal((limpo(workspace).match(/resolveKeywordVinculo\(/g) || []).length, 1, "a coluna resolve uma vez");
  assert.equal((limpo(panels).match(/resolveKeywordVinculo\(/g) || []).length, 2, "Revisão Humana e cabeçalho do Perfil");
  for (const [nome, fonte] of [["workspace", limpo(workspace)], ["dna-panels", limpo(panels)]] as const) {
    assert.doesNotMatch(fonte, /resolveKeywordPageType\(/, `${nome}: nenhuma tela resolve o tipo por fora`);
  }
  assert.doesNotMatch(limpo(panels), /readPrimaryKeywordPolicy\(/, "nem o posto");
});

test("endereço e identidade SEO têm papéis de cor diferentes", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const guia = readFileSync(new URL("../docs/compartilhado/sistema-visual.md", import.meta.url), "utf8");
  const panels = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");

  // O papel novo reaproveita um hex que já existia na paleta; nenhum valor
  // bruto entra em componente.
  assert.match(css, /--identity-slug: var\(--context-accent\);/);
  assert.match(css, /--color-identity-slug: var\(--identity-slug\);/);
  assert.match(css, /--context-accent: #12A1E0;/);
  assert.match(guia, /\| identidade do slug \| `identity-slug` \| `context-accent` \| `#12A1E0` \| \*\*slug e canonical\*\*/);

  /*
   * Endereço e identidade SEO são coisas diferentes.
   *
   * O link para onde a página vive segue o estado — publicada em #193cb8,
   * apenas conferida em #10DDE0. O canônico usa #12A1E0 sempre: ele não muda
   * de natureza quando o conteúdo é publicado, muda de imutabilidade, e isso
   * se comunica por selo e não recolorindo o dado.
   */
  assert.match(panels, /text-identity-slug[\s\S]{0,300}publication\.canonicalUrl/, "o canônico usa o papel do slug");
  assert.match(panels, /href=\{publication\.url\}/, "o link aponta para o endereço, não para o canônico");
  assert.match(panels, /publication\.canonicalUrl \? "text-identity-published" : "text-identity-new"/, "o endereço segue o estado");

  // E na tabela o endereço continua sendo endereço.
  const limpo = workspace.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(limpo, /data-keyword-page-url[\s\S]{0,600}publicationLink\.state === "published" \? "text-identity-published" : "text-identity-new"/);

  // Nenhum hex cru nos componentes: a regra do contrato visual.
  const semComentarios = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const [nome, fonte] of [["dna-panels", semComentarios(panels)], ["workspace", semComentarios(workspace)]] as const) {
    assert.doesNotMatch(fonte, /#(?:193cb8|12A1E0|10DDE0)/i, `${nome}: valor bruto de cor fora de globals.css`);
  }
});

test("o select do tipo mostra o peso que a escolha terá, e os defaults dos dois lados", () => {
  // 2026-09-24 (pedido do dono): as opções do Potencial moram no componente
  // comum da Revisão e do rodapé (vinculo-selects.tsx); a Revisão o usa.
  const panels = readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8")
    + readFileSync(new URL("../components/editorial/vinculo-selects.tsx", import.meta.url), "utf8");
  const limpo = panels.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

  /*
   * O peso vem da publicação, não da opção. Escolher Silo numa keyword nova
   * é "Silo · potencial"; na publicada é "Silo · declarado". O select
   * mostrava só "Silo" enquanto a linha abaixo dizia a frase inteira.
   */
  // 2026-09-24 (pedido do dono): o peso deixou de vir só da publicação. A
  // keyword nova escolhe entre 8 valores (4 potenciais e 4 declarados); a
  // publicada mostra os 4 declarados, como antes. Os rótulos vêm do domínio.
  assert.match(limpo, /keywordPageTypeChoices\(\{ published: true \}\)/, "publicada: só os declarados");
  assert.match(limpo, /keywordPageTypeChoices\(\)\.filter\(choice => choice\.stance === "potential"\)/, "nova: os potenciais");
  assert.match(limpo, /keywordPageTypeChoices\(\)\.filter\(choice => choice\.stance === "declared"\)/, "nova: os declarados");
  assert.match(limpo, /\{choice\.label\}/, "as opções carregam o peso");
  assert.doesNotMatch(limpo, /<option key=\{value\} value=\{value\}>\{keywordPageTypeLabel\(value\)\}/, "sem rótulo cru no select");

  // Os dois selects escrevem; coluna e cabeçalho só refletem.
  assert.match(limpo, /aria-label="Posto de principal na revisão humana"[\s\S]{0,700}type: "primary_policy"/);
  assert.match(limpo, /ariaContext="na revisão humana"[\s\S]{0,700}type: "page_type"/);

  // E o default de cada lado sai do resolvedor, não de literal na tela.
  const nova = resolveKeywordVinculo({ status: "bruto", semantic: {} });
  assert.equal(nova.postLabel, "Livre");
  assert.equal(keywordPageTypeStanding(nova.pageType.type, { declared: nova.publicationDeclared }), "Artigo · potencial");

  const publicada = resolveKeywordVinculo({
    status: "bruto",
    semantic: {
      site_origin: {
        sourceUrl: "https://careglow.com.br/rotina-skincare-facial",
        resolvedUrl: "https://careglow.com.br/rotina-skincare-facial",
        urlSituation: "canonical_confirmed", publicationStatus: "published",
        lastCheckedAt: "2026-09-20T23:30:00.000Z",
        publicationConfirmedBy: "human-1", publicationConfirmedAt: "2026-09-20T23:40:00.000Z",
        siteRole: "article",
      },
    },
  });
  assert.equal(publicada.postLabel, "Travado ao slug");
  assert.equal(keywordPageTypeStanding(publicada.pageType.type, { declared: publicada.publicationDeclared }), "Artigo · declarado");
});
