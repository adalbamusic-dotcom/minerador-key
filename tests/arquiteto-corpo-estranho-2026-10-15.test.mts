import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { reservedForSiloPage, reservedSiloHeadKeywordIds } from "../lib/arquiteto/article-candidate-guards.ts";
import { buildPlanSheetRows, planArticleKeywordIds, planRowsWithoutArticle, type PlanSheetArticle } from "../lib/arquiteto/plan-article-sheet.ts";
import { readArchitectSubjectStandings } from "../lib/arquiteto/declared-subject.ts";
import { buildArchitectureWorkingProposal, resolveKeywordDnaSignals } from "../lib/arquiteto/architecture-working-proposal.ts";
import type { ArchitectureAnalysis, ClusterAnalysis } from "../lib/arquiteto/architecture-analysis.ts";
import { declaredPlanViewOfTerritory, planGroupTerritory } from "../lib/arquiteto/declared-plan-silo.ts";
import { choosePlanConsolidationTerritory, planSiloPairStep, planTerritoryChoiceSentence } from "../lib/arquiteto/plan-consolidation.ts";
import { diagnoseSiloIdentity, isPendingPlaceholder, retitleSiloPageText, siloPageIdentityTexts } from "../lib/arquiteto/silo-plan-identity.ts";
import { buildSiloDeclaredPlanVersions, planSiloDeclaredPlanApplication } from "../lib/arquiteto/silo-declared-plan-application.ts";
import { buildConsolidatedSiloDnaPayload, buildConsolidatedSiloPagePayload } from "../lib/arquiteto/silo-consolidation.ts";
import { chooseSiloWorkingCopyPillar, formSiloWorkingCopies } from "../lib/arquiteto/silo-formation.ts";
import { buildProvisionalGroups } from "../lib/arquiteto/engine.ts";
import { deterministicArticleDnaPayload, deterministicSiloDnaPayload } from "../lib/arquiteto/adapters.ts";
import { createVersionEnvelope } from "../lib/arquiteto/versioning.ts";
import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import type { DeclaredSiloPlanEntry } from "../lib/arquiteto/silo-declared-plan.ts";
import { AZUL, GRUPOS, MARCA_WIFI, cadastro, linha } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { AZUL_REAL } from "./arquiteto-uma-lista-so-fixtures.mts";
import { VOLUME_VALIDADO } from "./arquiteto-assunto-fixtures.mts";

/*
 * 2026-10-15 · O "CORPO ESTRANHO" DA WIFICONECTA AZUL (fixture do SELECT de
 * 15/10). O dono testou do Minerador ao Arquiteto: 7 ArticleDNA v1 aprovados
 * (articleId = id da principal), todos ligados ao azul, `siloId` nulo e
 * `territoryRef` = territory:5e689f8c (consolidado); o de jogos online foi
 * formado pelo fluxo normal com o alerta "… “Qual a melhor internet para jogar
 * online?…” fica como secundária". O plano das keywords está misturado (v4,
 * v3 em "diferença", v2 em "streaming"); o grupo está no v4 e aponta para um
 * território que não existe mais. O território guarda como entidade central
 * "melhor internet para jogos online" (o 5º SUPORTE), gravada pelo "Processar
 * arquitetura" antigo, que usava a 1ª keyword do grupo como semente. Daí:
 *   1. a reserva da SiloPage tirava jogos online da tabela (corpo estranho);
 *   2. o SiloDNA/SiloPage v1 nasceram com o tema do suporte e a pendência na frase;
 *   5. "Processar arquitetura" via o Silo consolidado como "Silo proposto".
 * Domínio puro + estrutural (comentários limpos antes de procurar). Sem rede.
 */

const AGORA = new Date("2026-10-15T12:00:00Z");
const TERRITORIO_REAL = "territory:5e689f8c-8f06-4e65-94c4-b3cd7ac906cc";
const TERRITORIO_VELHO = "territory:09d9b92d-db4d-4409-88c7-bd7ca5e77c7e";
const JOGOS = "k13";
const VERSAO_DO_PLANO: Record<string, number> = { k9: 4, k10: 3, k11: 4, k12: 2, k13: 4, k14: 4, k15: 4 };
const semComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const ler = (caminho: string) => semComentarios(readFileSync(new URL(caminho, import.meta.url), "utf8"));

/** As 7 linhas do azul como o banco as tem hoje: plano misturado, travas, territory real. */
function mesaAzul() {
  return AZUL_REAL.map(([id, keyword, titulo, ordem, papel, volume]) => {
    const semantica = cadastro(id, keyword, titulo, ordem, papel, AZUL, volume !== null ? VOLUME_VALIDADO : {});
    const plano = (semantica.keyword_subject as { plan: Record<string, unknown> }).plan;
    plano.planVersion = VERSAO_DO_PLANO[id];
    plano.lock = id === "k10" ? "free" : "locked";
    return linha(id, keyword, semantica, { territoryRef: TERRITORIO_REAL, ...(volume !== null ? { volume_search: volume, volume_source: "google_ads" } : {}) });
  });
}
const TERRITORIO_COM_TEMA_ERRADO = { territoryRef: TERRITORIO_REAL, humanDecided: true, siloPage: { slug: "wifi-e-fibra", centralEntity: "melhor internet para jogos online", name: "Wi-Fi e fibra óptica" } };

/* ---------------------------------------------- 1 · o corpo estranho */

test("causa: a entidade central do território (um suporte) reservava jogos online para a SiloPage — o artigo do plano saía da tabela", () => {
  const linhas = mesaAzul();
  const keywords = linhas.map(item => ({ keywordId: String(item.id), text: String(item.keyword), territoryRef: TERRITORIO_REAL }));
  // A regra de antes (só a identidade do Silo): jogos online reservado.
  assert.deepEqual([...reservedForSiloPage({ siloPage: TERRITORIO_COM_TEMA_ERRADO.siloPage, keywords })], [JOGOS], "reproduz a causa");
  const doPlano = planArticleKeywordIds({ brandId: MARCA_WIFI, standings: readArchitectSubjectStandings(linhas) });
  assert.deepEqual([...doPlano].sort(), ["k10", "k11", "k12", "k13", "k14", "k15", "k9"]);
  const reservadas = reservedSiloHeadKeywordIds({ lexicalHeadIds: ["k9"], declaredSiloHeadIds: [], territories: [TERRITORIO_COM_TEMA_ERRADO], keywords, planArticleKeywordIds: doPlano });
  assert.equal(reservadas.size, 0, "artigo do plano (Pilar ou Suporte) nunca é a SiloPage");
  // A cabeça DECLARADA Silo no Minerador continua reservada; fora do plano, a regra de sempre.
  assert.deepEqual([...reservedSiloHeadKeywordIds({ lexicalHeadIds: [], declaredSiloHeadIds: ["silo-declarado"], territories: [TERRITORIO_COM_TEMA_ERRADO], keywords, planArticleKeywordIds: new Set() })].sort(), ["k13", "silo-declarado"]);
  assert.equal(reservedSiloHeadKeywordIds({ lexicalHeadIds: [], declaredSiloHeadIds: [], territories: [{ ...TERRITORIO_COM_TEMA_ERRADO, humanDecided: false }], keywords }).size, 0, "Silo não decidido não reserva");
});

test("a tabela: com os 7 ArticleDNA na mesa, nenhuma linha 'Artigo do plano · Ainda sem ArticleDNA'; o sintoma de antes era jogos online sozinho, 'Formado · v1'", () => {
  const linhas = mesaAzul();
  const standings = readArchitectSubjectStandings(linhas);
  // Os 7 ArticleDNA v1 aprovados (articleId = id da principal; siloId nulo; territoryRef real).
  const artigos: PlanSheetArticle[] = AZUL_REAL.map(([id]) => ({ articleId: id, versionNumber: 1, subjectKeywordId: id, principalKeywordId: id, keywordIds: [id], slug: id, siloRef: TERRITORIO_REAL, siloLabel: "Wi-Fi e fibra óptica", serpAssessed: id !== "k10" && id !== "k11" }));
  const grupos: Record<string, { color: string; name: string; planVersion: number }> = { [AZUL]: { ...GRUPOS[AZUL], planVersion: 4 } };
  const rows = buildPlanSheetRows({ brandId: MARCA_WIFI, keywords: linhas, standings, groupOf: id => grupos[id] ?? null, keywordGroupOf: () => AZUL, articles: artigos, radarArticleIds: new Set(), serp: null, filter: { kind: "all" }, now: AGORA });
  assert.equal(rows.length, 7);
  assert.ok(rows.every(row => row.formation.state === "formed" && row.formation.label.startsWith("Formado · v1")), JSON.stringify(rows.map(row => row.formation.label)));
  // 4 · a versão do plano dita é a do grupo (v4), mesmo com as keywords em 2/3/4 — e nada é gravado nelas.
  assert.deepEqual([...new Set(rows.map(row => row.planVersion))], [4]);
  assert.deepEqual(linhas.map(item => VERSAO_DO_PLANO[String(item.id)]), [4, 3, 4, 2, 4, 4, 4], "a fixture continua misturada (só leitura)");
  // Antes: a mesa tinha 6 artigos (jogos online reservado) → 1 linha do plano sobrando.
  const seis = new Set(AZUL_REAL.map(([id]) => id).filter(id => id !== JOGOS));
  assert.deepEqual(planRowsWithoutArticle(rows, seis).map(row => row.keywordId), [JOGOS], "o 'corpo estranho' de antes");
  // Agora: os 7 na tabela, nenhuma linha solta.
  assert.deepEqual(planRowsWithoutArticle(rows, new Set(AZUL_REAL.map(([id]) => id))), []);
});

test("a aba usa a reserva única com as keywords do plano (estrutural)", () => {
  const tela = ler("../modules/arquiteto/arquiteto-workspace.tsx");
  const inicio = tela.indexOf("const reservedSiloHeadIds = useMemo(");
  const trecho = tela.slice(inicio, tela.indexOf("const confirmedTerritoryRefs", inicio));
  assert.match(trecho, /reservedSiloHeadKeywordIds\(\{/);
  // 2026-10-15 (tarde) · o conjunto virou memo próprio (`planArticleKeywordIdSet`), usado também pela aba Silos; + a keyword do Silo do plano.
  assert.match(tela, /const planArticleKeywordIdSet = useMemo\(\(\) => planArticleKeywordIds\(\{ brandId: selectedBrandId \|\| null, standings: subjectStandings \}\)/);
  assert.match(trecho, /planArticleKeywordIds: planArticleKeywordIdSet,/);
  assert.match(trecho, /planSiloHeadIds: planSiloHeadIds\.keys\(\),/);
  assert.ok(tela.indexOf("const subjectStandings = useMemo(") < inicio, "o Assunto é lido antes da reserva");
  assert.doesNotMatch(tela, /reservedForSiloPage\(/, "a aba não tem mais reserva própria");
  assert.match(tela, /planVersion: grupo\.planVersion/, "a linha diz a versão do grupo");
});

/* ------------------------------------- 2 · o tema da página do Silo */

const ATOR = "d67ebbad-a590-45f8-8bb5-a19c6241ac1b";
const kw = (id: string, value: string, volume: number) => ({ id, keyword: value, intent: "Informativo", volume_search: volume, results_allintitle: null, kgr_score: null, lista_id: null, siloName: null, status: "aprovado", analise_semantica: { entidade_central: "internet", publico: "clientes", problema_percebido: "duvida" } });

/** Os 7 ArticleDNA como o banco os tem: articleId = id da principal; Assunto = o título; `siloId` nulo; territoryRef real. */
async function artigosDoAzul() {
  const versoes: VersionEnvelope<ArticleDNA>[] = [];
  for (const [id, keyword, titulo, ordem, papel, volume] of AZUL_REAL) {
    const base = deterministicArticleDnaPayload(buildProvisionalGroups([kw(id, keyword, volume ?? 0)])[0], MARCA_WIFI);
    const payload = {
      ...base, articleId: id, principalKeywordId: id, hierarchy: papel, siloId: undefined, territoryRef: TERRITORIO_REAL, suggestedSlug: keyword.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-"),
      keywordReferences: base.keywordReferences.map(reference => ({ ...reference, keywordId: id })),
      subject: { keywordId: id, phrase: titulo, note: null, destinationUrl: null, attachedAt: "2026-10-15T00:56:23.995Z", attachedBy: ATOR },
      alerts: id === JOGOS ? [...base.alerts, "Principal declarada no plano do Silo: cabeceira fixa (D1-bis), mesmo sem volume medido. “Qual a melhor internet para jogar online? Velocidade, ping e estabilidade” fica como secundária."] : base.alerts,
    } as unknown as ArticleDNA;
    versoes.push(await createVersionEnvelope({ entityId: id, versionNumber: 1, origin: "human", changeReason: `fixture ${ordem}`, createdBy: ATOR, payload }));
  }
  return versoes;
}
const entradas = (): DeclaredSiloPlanEntry[] => AZUL_REAL.map(([id, keyword, , ordem, papel]) => ({
  subjectKeywordId: id,
  plan: { groupId: AZUL, planVersion: VERSAO_DO_PLANO[id], order: ordem, role: papel, scope: `Escopo do artigo ${ordem}.`, declaredPrincipal: { keywordId: id, phrase: keyword }, lock: id === "k10" ? "free" : "locked" },
  declaredBy: ATOR, declaredAt: "2026-10-13T10:00:00Z",
}) as DeclaredSiloPlanEntry);
const PLANO_AZUL = { siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra", objective: "conquistar tráfego de pessoas que querem entender a tecnologia, melhorar a conexão ou descobrir se precisam trocar de plano.", articleCount: 7 } as never;

/** O par v1 como gravado em 15/10 03:25: tema = jogos online (do território), pendência na frase. */
async function parV1(artigos: VersionEnvelope<ArticleDNA>[]) {
  const copia = chooseSiloWorkingCopyPillar(formSiloWorkingCopies({ brandId: MARCA_WIFI, articleVersions: artigos }).workingCopies[0], "k9");
  const ordem = ["k9", "k10", "k11", "k12", "k13", "k14", "k15"];
  const base = {
    copy: { ...copia, id: TERRITORIO_REAL, name: "Wi-Fi e fibra óptica", slug: "wifi-e-fibra", source: "existing" as const, conflicts: [], supportArticleIds: ordem.slice(1), articleReferences: ordem.map(id => copia.articleReferences.find(ref => ref.articleId === id)!) },
    articleVersions: artigos,
    territory: { territoryRef: TERRITORIO_REAL, centralEntity: "melhor internet para jogos online", macroIntent: "Comercial", boundary: { includes: [], excludes: [] }, narrative: { rationale: [], statement: "x", continuity: "coherent", brandAlignment: "aligned" } as never },
    declaredObjective: (PLANO_AZUL as { objective: string }).objective,
  };
  const dnaPayload = buildConsolidatedSiloDnaPayload(base);
  // O v1 real foi gravado com o construtor antigo: a pendência do público dentro das frases.
  const antigo = { ...dnaPayload, audience: "Pendente de enriquecimento e revisão humana", macroProblem: "Dificuldade em melhor internet para jogos online para pendente de enriquecimento e revisão humana." } as SiloDNA;
  const dna = await createVersionEnvelope({ entityId: TERRITORIO_REAL, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: ATOR, payload: antigo });
  const pagePayload = buildConsolidatedSiloPagePayload(dna, base);
  const paginaAntiga = { ...pagePayload, intro: `${antigo.objective} Este conteúdo organiza os principais temas sobre melhor internet para jogos online para pendente de enriquecimento e revisão humana.` } as SiloPage;
  const page = await createVersionEnvelope({ entityId: paginaAntiga.siloPageId, versionNumber: 1, origin: "human", changeReason: "fixture", createdBy: ATOR, payload: paginaAntiga });
  return { dna, page };
}

test("o par v1 reproduz o defeito: tema e H1 de um suporte, CTA e intro sobre jogos online, pendência na frase", async () => {
  const artigos = await artigosDoAzul();
  const { dna, page } = await parV1(artigos);
  assert.equal(dna.payload.centralEntity, "melhor internet para jogos online");
  assert.equal(dna.payload.pillarArticleId, "k9");
  assert.equal(page.payload.h1, "melhor internet para jogos online");
  assert.equal(page.payload.cta, "Conheça todos os conteúdos sobre melhor internet para jogos online.");
  assert.ok(isPendingPlaceholder(page.payload.intro));
  const diagnostico = diagnoseSiloIdentity({ centralEntity: dna.payload.centralEntity, siloName: dna.payload.name, macroProblem: dna.payload.macroProblem, page: page.payload, planSiloName: "Wi-Fi e fibra óptica", pillarLabel: "internet fibra óptica", supportLabels: ["melhor internet para jogos online", "internet para streaming"] });
  assert.equal(diagnostico?.expected, "Wi-Fi e fibra óptica");
  assert.ok(diagnostico?.reasons.some(reason => /é de um suporte do Silo/.test(reason)));
  assert.ok(diagnostico?.reasons.some(reason => /pendência/.test(reason)));
});

test("o construtor não põe mais pendência em frase, e o tema do Pilar ou do Silo do plano não é 'corrigido'", () => {
  const textos = siloPageIdentityTexts({ centralEntity: "Wi-Fi e fibra óptica", objective: "Objetivo.", audience: "Pendente de enriquecimento e revisão humana" });
  assert.equal(textos.intro, "Objetivo. Este conteúdo organiza os principais temas sobre wi-fi e fibra óptica.");
  const dna = deterministicSiloDnaPayload("territory:x", "Wi-Fi e fibra óptica", [], { brandId: MARCA_WIFI });
  assert.equal(dna.macroProblem, "Dificuldade em wi-fi e fibra óptica.");
  assert.equal(diagnoseSiloIdentity({ centralEntity: "Wi-Fi e fibra óptica", siloName: "Wi-Fi e fibra óptica", planSiloName: "Wi-Fi e fibra óptica", pillarLabel: "internet fibra óptica", supportLabels: ["melhor internet para jogos online"] }), null);
  assert.equal(diagnoseSiloIdentity({ centralEntity: "internet fibra óptica", siloName: "Wi-Fi e fibra óptica", planSiloName: "Wi-Fi e fibra óptica", pillarLabel: "internet fibra óptica", supportLabels: ["melhor internet para jogos online"] }), null, "o tema do Pilar também vale");
  assert.equal(diagnoseSiloIdentity({ centralEntity: "internet", siloName: "Planos", planSiloName: "Planos", pillarLabel: "plano barato", supportLabels: ["vivo ou claro"] }), null, "tema escolhido por gente que não é de suporte fica");
  // O texto escrito por gente sobre outra coisa fica; o que nasceu do tema antigo acompanha.
  const pagina = { h1: "melhor internet para jogos online", seoTitle: "Título escrito à mão", intro: "Sobre melhor internet para jogos online.", cta: "Fale conosco", coverImageBrief: "x", metaDescription: "m", breadcrumbs: [{ label: "melhor internet para jogos online", slug: "wifi-e-fibra" }], sections: [{ id: "s1", heading: "melhor internet para jogos online: visão geral", objective: "o", linkedArticleIds: ["k9"] }] };
  const nova = retitleSiloPageText(pagina, { from: "melhor internet para jogos online", to: "Wi-Fi e fibra óptica", objective: "Objetivo.", audience: null, pillarArticleId: "k9" });
  assert.deepEqual([nova.h1, nova.seoTitle, nova.cta, nova.breadcrumbs[0].label, nova.sections[0].heading], ["Wi-Fi e fibra óptica", "Título escrito à mão", "Fale conosco", "Wi-Fi e fibra óptica", "Wi-Fi e fibra óptica: visão geral"]);
  assert.equal(nova.intro, "Objetivo. Este conteúdo organiza os principais temas sobre wi-fi e fibra óptica.");
});

test("Consolidar o Silo do plano · reencontrando o par com o tema de um suporte: 'Corrigir a página do Silo (v2)' com o tema do Silo do plano; depois, nada novo", async () => {
  const artigos = await artigosDoAzul();
  const { dna, page } = await parV1(artigos);
  const entrada = {
    brandId: MARCA_WIFI, siloId: TERRITORIO_REAL,
    siloDnaVersions: [dna] as VersionEnvelope<SiloDNA>[], siloPageVersions: [page] as VersionEnvelope<SiloPage>[],
    articleDnaVersions: artigos, statuses: [dna, page].map(version => ({ versionId: version.versionId, status: "approved" })),
    entries: entradas(), groupPlans: new Map([[AZUL, PLANO_AZUL]]), groupPlanVersions: new Map([[AZUL, 4]]),
  };
  const plano = planSiloDeclaredPlanApplication(entrada);
  assert.equal(plano.ok, true, JSON.stringify(plano));
  if (!plano.ok) return;
  assert.equal(plano.unchanged, false);
  assert.equal(plano.nextSiloDna.centralEntity, "Wi-Fi e fibra óptica");
  assert.equal(plano.nextSiloDna.macroProblem, "Dificuldade em wi-fi e fibra óptica.");
  assert.equal(plano.nextSiloDna.pillarArticleId, "k9", "o Pilar continua o do plano");
  assert.deepEqual(plano.nextSiloDna.narrativeOrder, ["k9", "k10", "k11", "k12", "k13", "k14", "k15"]);
  assert.equal(plano.nextSiloPage.h1, "Wi-Fi e fibra óptica");
  assert.equal(plano.nextSiloPage.cta, "Conheça todos os conteúdos sobre wi-fi e fibra óptica.");
  assert.equal(plano.nextSiloPage.slug, "wifi-e-fibra", "o slug do plano fica");
  const texto = JSON.stringify(plano.nextSiloPage) + plano.nextSiloDna.macroProblem;
  assert.doesNotMatch(texto, /jogos online/i, "nada do tema do suporte na página");
  assert.doesNotMatch(texto, /pendente de enriquecimento/i, "nenhuma pendência em frase");
  assert.match(plano.changes[0], /^Corrigir a página do Silo: .*“melhor internet para jogos online” é de um suporte/);
  assert.equal(plano.planVersion, 4, "a versão dita é a do grupo, não a mistura das keywords");

  const versoes = await buildSiloDeclaredPlanVersions(plano, ATOR);
  assert.deepEqual([versoes.siloDna.versionNumber, versoes.siloPage.versionNumber], [2, 2]);
  assert.equal(versoes.siloDna.previousVersionId, dna.versionId, "o v1 fica no histórico (imutável)");
  assert.match(versoes.siloDna.changeReason, /ordem do plano \(v4\)/);

  // A prévia da consolidação diz isso numa frase; com a v2 gravada, nada novo.
  const passo = planSiloPairStep({ siloId: TERRITORIO_REAL, currentVersion: 1, declaredPlan: { state: "READY", changes: plano.changes, decisionHash: "a".repeat(64), siloDnaVersionId: dna.versionId } });
  assert.equal(passo.state, "fix");
  assert.match(passo.sentence, /^Corrigir a página do Silo \(v2\) nesta mesma confirmação: Corrigir a página do Silo: /);
  const depois = planSiloDeclaredPlanApplication({ ...entrada, siloDnaVersions: [dna, versoes.siloDna], siloPageVersions: [page, versoes.siloPage], statuses: [dna, page, versoes.siloDna, versoes.siloPage].map(version => ({ versionId: version.versionId, status: "approved" })) });
  assert.equal(depois.ok && depois.unchanged, true, JSON.stringify(depois.ok ? depois.changes : depois));
  assert.equal(planSiloPairStep({ siloId: TERRITORIO_REAL, currentVersion: 2, declaredPlan: { state: "UNCHANGED", changes: [] } }).state, "current");
  assert.equal(planSiloPairStep({ siloId: null, currentVersion: null, declaredPlan: null }).state, "missing");
});

test("a consolidação de sempre também usa o tema do plano quando ele vier (aditivo)", async () => {
  const artigos = await artigosDoAzul();
  const copia = chooseSiloWorkingCopyPillar(formSiloWorkingCopies({ brandId: MARCA_WIFI, articleVersions: artigos }).workingCopies[0], "k9");
  const base = { copy: { ...copia, source: "existing" as const, conflicts: [] }, articleVersions: artigos, territory: { territoryRef: TERRITORIO_REAL, centralEntity: "melhor internet para jogos online", macroIntent: "Comercial", boundary: { includes: [], excludes: [] }, narrative: { rationale: [], statement: "x", continuity: "coherent", brandAlignment: "aligned" } as never } };
  assert.equal(buildConsolidatedSiloDnaPayload(base).centralEntity, "melhor internet para jogos online", "sem o tema do plano, o de sempre");
  const comPlano = buildConsolidatedSiloDnaPayload({ ...base, declaredCentralEntity: "Wi-Fi e fibra óptica" });
  assert.equal(comPlano.centralEntity, "Wi-Fi e fibra óptica");
  assert.equal(comPlano.centralEntitySource, "manual");
  const tela = ler("../modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(tela, /declaredCentralEntity: siloDoPlano \? diagnoseSiloIdentity\(\{/);
  assert.match(tela, /siloConsolidatedOf: territoryRef => \{[\s\S]*?return !diagnoseSiloIdentity\(\{/, "par com tema errado: a etapa 1 volta");
});

/* -------------------------- 3 · o vínculo velho e 5 · Processar arquitetura */

const territorio = (ref: string, lifecycleStatus: string, slug: string | null, name = "Wi-Fi e fibra óptica") => declaredPlanViewOfTerritory({ territoryRef: ref, lifecycleStatus, name, slugState: { publishedSlug: null, confirmed: null, proposals: slug ? [{ slug }] : [] } });

test("o Silo do plano que já existe: onde as keywords estão (consolidado incluído), mesmo com o grupo apontando para um território que sumiu", () => {
  const slugOf = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const real = territorio(TERRITORIO_REAL, "consolidated", "wifi-e-fibra");
  const achado = planGroupTerritory({ plan: { siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra" }, linkedTerritoryRef: TERRITORIO_VELHO, keywordTerritoryRefs: Array(7).fill(TERRITORIO_REAL), territories: [real], slugOf });
  assert.deepEqual(achado, { territoryRef: TERRITORIO_REAL, name: "Wi-Fi e fibra óptica", slug: "wifi-e-fibra" });
  // Sem keyword no Silo: o de mesmo slug (proposto incluído). Desfeito nunca volta por aqui.
  assert.equal(planGroupTerritory({ plan: { siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra" }, linkedTerritoryRef: TERRITORIO_VELHO, keywordTerritoryRefs: [], territories: [real], slugOf })?.territoryRef, TERRITORIO_REAL);
  assert.equal(planGroupTerritory({ plan: { siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra" }, linkedTerritoryRef: null, keywordTerritoryRefs: [], territories: [territorio(TERRITORIO_REAL, "rejected", "wifi-e-fibra")], slugOf }), null);
  // A prévia da consolidação também reconhece o consolidado (antes dizia "será criado").
  const escolha = choosePlanConsolidationTerritory({ rowTerritoryRefs: Array(7).fill(TERRITORIO_REAL), territories: [{ territoryRef: TERRITORIO_REAL, lifecycleStatus: "consolidated", name: "Wi-Fi e fibra óptica", slugs: ["wifi-e-fibra"] }], fallback: { kind: "create" } });
  assert.equal(escolha.kind, "rows");
  assert.match(planTerritoryChoiceSentence(escolha, "Wi-Fi e fibra óptica"), /já existe e está consolidado/);
});

test("Processar arquitetura com o plano consolidado: reusa o Silo do plano (nenhum 'Silo proposto'), e o Silo proposto do plano não tem semente (tema = nome do plano)", () => {
  const ids = AZUL_REAL.map(([id]) => id);
  const sinais = AZUL_REAL.map(([keywordId, text]) => resolveKeywordDnaSignals({ keywordId, text, semantic: {} }));
  const cluster = { clusterRef: "c1", label: "internet", memberKeywordIds: ["k13", ...ids.filter(id => id !== "k13")], headKeywordId: "k13", ambiguousHeadKeywordIds: [], destination: "new_silo_candidate", suggestedTerritoryRef: null, suggestedTerritoryLabel: null, alternativeTerritoryRefs: [], confidence: "alta", reason: "grupo coeso" } as unknown as ClusterAnalysis;
  const analise: ArchitectureAnalysis = { clusters: [cluster], summary: { keywords: 7, clusters: 1, strengthening: 0, newSilos: 1, insufficient: 0, ambiguous: 0, confidence: "alta" }, narrative: [], baseHash: "base" };
  const base = { analysis: analise, existingSilos: [], keywords: sinais, slugOf: (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-") };
  // Jogos online primeiro (a ordem em que a mesa as lia): antes, ela virava a semente e o tema do território.
  const grupo = { groupId: AZUL, label: "Azul", siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra", keywordIds: ["k13", ...ids.filter(id => id !== "k13")] };
  const semSilo = buildArchitectureWorkingProposal({ ...base, declaredPlanGroups: [{ ...grupo, territoryRef: TERRITORIO_VELHO }] });
  assert.equal(semSilo.counters.SILOS_PROPOSED, 1, "o vínculo velho sozinho não acha o Silo");
  assert.equal(semSilo.silos.find(silo => silo.key === "proposed:wifi-e-fibra")?.seedKeywordId, null, "sem semente: o tema é o nome do Silo do plano, nunca jogos online");
  const comSilo = buildArchitectureWorkingProposal({ ...base, declaredPlanGroups: [{ ...grupo, territoryRef: TERRITORIO_REAL, territory: { name: "Wi-Fi e fibra óptica", slug: "wifi-e-fibra" } }] });
  assert.deepEqual([comSilo.counters.SILOS_PROPOSED, comSilo.counters.SILOS_REUSED], [0, 1]);
  assert.ok(comSilo.assignments.filter(item => ids.includes(item.keywordId)).every(item => item.siloKey === TERRITORIO_REAL && item.membershipState === "existing_silo_match"));
  assert.equal(comSilo.counters.RESOLVED_KEYWORDS, 7, "nenhuma keyword some");
  const tela = ler("../modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(tela, /const existente = planGroupTerritory\(\{/);
  assert.match(tela, /territory: existente \? \{ name: existente\.name, slug: existente\.slug \} : null/);
});

/** Um cliente falso do Supabase: cada chamada encadeada é anotada; a resposta vem de `responder(tabela, operação, filtros)`. */
function clienteFalso(responder: (tabela: string, operacao: string, filtros: Array<[string, string, unknown]>, corpo: unknown) => { data: unknown; error: unknown }) {
  const chamadas: Array<{ tabela: string; operacao: string; filtros: Array<[string, string, unknown]>; corpo: unknown }> = [];
  const client = {
    from(tabela: string) {
      let operacao = "select"; let corpo: unknown = null;
      const filtros: Array<[string, string, unknown]> = [];
      const fim = () => { chamadas.push({ tabela, operacao, filtros: [...filtros], corpo }); return Promise.resolve(responder(tabela, operacao, filtros, corpo)); };
      const builder: Record<string, unknown> = {
        select: () => builder,
        update: (valor: unknown) => { operacao = "update"; corpo = valor; return builder; },
        insert: (valor: unknown) => { operacao = "insert"; corpo = valor; return fim(); },
        eq: (coluna: string, valor: unknown) => { filtros.push(["eq", coluna, valor]); return builder; },
        is: (coluna: string, valor: unknown) => { filtros.push(["is", coluna, valor]); return builder; },
        in: (coluna: string, valor: unknown) => { filtros.push(["in", coluna, valor]); return builder; },
        limit: () => builder,
        maybeSingle: () => fim(),
        then: (ok: (valor: unknown) => unknown, erro?: (motivo: unknown) => unknown) => fim().then(ok, erro),
      };
      return builder;
    },
  };
  return { client: client as never, chamadas };
}
const GRUPO_LIDO = { id: AZUL, marca_id: MARCA_WIFI, name: "Wi-Fi e fibra óptica", color: "azul", origin: "declared_plan", status: "active", plan: { siloName: "Wi-Fi e fibra óptica" }, plan_version: 4, plan_hash: null, silo_id: TERRITORIO_VELHO, lock_version: 7 };

test("store: o grupo ligado a um Silo que sumiu (sem território, SiloDNA nem SiloPage) é religado ao Silo real; Silo que existe nunca é trocado", async () => {
  const { linkEditorialGroupSilo } = await import("../lib/editorial/editorial-groups-store.ts");
  const sumiu = clienteFalso((tabela, operacao) => tabela === "editorial_groups" && operacao === "select" ? { data: GRUPO_LIDO, error: null }
    : tabela === "editorial_groups" && operacao === "update" ? { data: [{ id: AZUL }], error: null }
    : { data: [], error: null });
  const religado = await linkEditorialGroupSilo(sumiu.client, { brandId: MARCA_WIFI, actorUserId: ATOR, groupId: AZUL, siloId: TERRITORIO_REAL });
  assert.deepEqual(religado, { ok: true, changed: true });
  const update = sumiu.chamadas.find(item => item.operacao === "update")!;
  assert.equal((update.corpo as { silo_id: string }).silo_id, TERRITORIO_REAL);
  assert.ok(update.filtros.some(([op, coluna, valor]) => op === "eq" && coluna === "silo_id" && valor === TERRITORIO_VELHO), "só troca se o vínculo ainda for o velho");
  assert.ok(update.filtros.some(([op, coluna, valor]) => op === "eq" && coluna === "lock_version" && valor === 7));
  const evento = sumiu.chamadas.find(item => item.tabela === "editorial_group_events")!;
  assert.deepEqual((evento.corpo as Array<{ payload: unknown }>)[0].payload, { siloId: TERRITORIO_REAL, replacedMissingSiloId: TERRITORIO_VELHO });

  for (const vivo of ["editorial_workflow_items", "editorial_artifact_versions"]) {
    const existe = clienteFalso((tabela, operacao) => tabela === "editorial_groups" && operacao === "select" ? { data: GRUPO_LIDO, error: null } : { data: tabela === vivo ? [{ id: "x" }] : [], error: null });
    const recusa = await linkEditorialGroupSilo(existe.client, { brandId: MARCA_WIFI, actorUserId: ATOR, groupId: AZUL, siloId: TERRITORIO_REAL });
    assert.equal(recusa.ok ? null : (recusa as { code?: string }).code, "GROUP_SILO_TAKEN", `Silo antigo vivo em ${vivo}: recusa`);
    assert.ok(!existe.chamadas.some(item => item.operacao === "update"), "nada é escrito");
  }
  // Erro de leitura: na dúvida, o Silo existe (não troca).
  const duvida = clienteFalso((tabela, operacao) => tabela === "editorial_groups" && operacao === "select" ? { data: GRUPO_LIDO, error: null } : { data: null, error: { message: "falhou" } });
  assert.equal((await linkEditorialGroupSilo(duvida.client, { brandId: MARCA_WIFI, actorUserId: ATOR, groupId: AZUL, siloId: TERRITORIO_REAL })).ok, false);
  // Grupo sem Silo: a regra de sempre (`silo_id is null`).
  const livre = clienteFalso((tabela, operacao) => tabela === "editorial_groups" && operacao === "select" ? { data: { ...GRUPO_LIDO, silo_id: null }, error: null } : { data: [{ id: AZUL }], error: null });
  assert.deepEqual(await linkEditorialGroupSilo(livre.client, { brandId: MARCA_WIFI, actorUserId: ATOR, groupId: AZUL, siloId: TERRITORIO_REAL }), { ok: true, changed: true });
  assert.ok(livre.chamadas.find(item => item.operacao === "update")!.filtros.some(([op, coluna]) => op === "is" && coluna === "silo_id"));
});

test("o vínculo do grupo: religa só quando o Silo antigo sumiu (store), e a consolidação tenta religar quando o vínculo difere", () => {
  const store = ler("../lib/editorial/editorial-groups-store.ts");
  assert.match(store, /if \(antigo && await editorialGroupSiloStillExists\(client, input\.brandId, antigo\)\) \{\s*return \{ ok: false, code: "GROUP_SILO_TAKEN"/);
  assert.match(store, /\(antigo \? update\.eq\("silo_id", antigo\) : update\.is\("silo_id", null\)\)/);
  assert.match(store, /\.eq\("subject_type", "territory"\)\.eq\("subject_id", siloId\)/);
  assert.match(store, /\.in\("artifact_type", \["silo_dna", "silo_page"\]\)\.in\("entity_id", \[siloId, `silo-page:\$\{siloId\}`\]\)/);
  const servidor = ler("../lib/server/arquiteto-plan-consolidation.ts");
  assert.match(servidor, /if \(input\.linkedSiloId !== territorio\.territoryRef\) \{/);
});
