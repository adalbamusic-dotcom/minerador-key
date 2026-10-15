import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { planSiloCreationRefusal, planSiloHeadKeywordIds, planSiloHeadSentence, planSiloStatus, planSiloTextKey } from "../lib/arquiteto/declared-plan-silo.ts";
import { reservedSiloHeadKeywordIds } from "../lib/arquiteto/article-candidate-guards.ts";
import { buildArchitectureWorkingProposal, resolveKeywordDnaSignals } from "../lib/arquiteto/architecture-working-proposal.ts";
import type { ArchitectureAnalysis, ClusterAnalysis } from "../lib/arquiteto/architecture-analysis.ts";
import { buildPlanSheetRows, planArticleFlowSteps, planArticleKeywordIds, planArticleVisibleSteps, planReinforcementDetail, planSheetPreviewLines, type PlanSheetArticle } from "../lib/arquiteto/plan-article-sheet.ts";
import { planConsolidationLines, planSiloDecisionHash } from "../lib/arquiteto/plan-consolidation.ts";
import { articleEditorialPending, isEditorialPending, planEditorialLineChanges, planEditorialLineSentence, EDITORIAL_PENDING_TEXT } from "../lib/arquiteto/plan-editorial-line.ts";
import { readArchitectSubjectStandings } from "../lib/arquiteto/declared-subject.ts";
import { AZUL, GRUPOS, MARCA_WIFI } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { AZUL_REAL, grupoDaKeywordReal, mesaWifiReal } from "./arquiteto-uma-lista-so-fixtures.mts";

/*
 * 2026-10-15 · O SILO DO PLANO É O DNA DO PLANO (pedido do dono, literal):
 * "muitas vezes eu já tenho a keyword e o slug do silo (…) o Google provider
 * barra ele porque tem 0 volume e não cadastra ele como keyword (…) se ele não
 * detectou uma keyword destinada para o silo, mas no DNA já está definido, ele
 * tem que fazer só isso, recriar e ir pra frente, os dados são claros, não tem
 * que tentar converter ninguém (…) a definição do silo já tem que estar na aba
 * do Silo e não nos artigos. Artigo só mexe com artigos".
 *
 * Fixture do caso real (SELECT de 15/10, marca WifiConecta d4fa133a): grupo
 * azul com plano { siloName "Wi-Fi e fibra óptica", siloSlug "wifi-e-fibra" },
 * 7 artigos do plano (k9 Pilar … k15); a keyword 34bd7c0f "Wi-Fi e fibra
 * óptica" existe no Minerador (bruta, 0 volume, sem Assunto e sem grupo) e NÃO
 * está no Arquiteto. As duas variantes são testadas: ausente (o normal) e
 * presente (se um dia for enviada).
 */
const PLANO_AZUL = { groupId: AZUL, siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra" };
const PLANO_LARANJA = { groupId: "aaaa0000-0000-4000-8000-00000000a202", siloName: "Planos de internet", siloSlug: "planos-de-internet" };
const CABECA = "34bd7c0f-b543-4c0e-b83d-a71b0a819ce3";
const TERRITORIO = "territory:5e689f8c-8f06-4e65-94c4-b3cd7ac906cc";
const mesa = () => mesaWifiReal();
const doPlano = () => planArticleKeywordIds({ brandId: MARCA_WIFI, standings: readArchitectSubjectStandings(mesa()) });
const slugOf = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
/** Os estruturais leem o código sem comentários (um comentário não pode passar nem reprovar um teste). */
const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/* ---------------------------------------------- 1 · a keyword do Silo */

test("1 · a keyword do Silo é reconhecida pelo nome/slug do plano (cabeça da SiloPage); artigo do plano nunca é cabeça; ambígua não é reconhecida", () => {
  assert.equal(planSiloTextKey("Wi-Fi e fibra óptica"), "wifiefibraoptica");
  const keywords = [
    ...AZUL_REAL.map(([keywordId, text]) => ({ keywordId, text })),
    { keywordId: CABECA, text: "Wi-Fi e fibra óptica" },
    { keywordId: "slug", text: "wifi e fibra" },
    { keywordId: "outra", text: "internet residencial" },
  ];
  const cabecas = planSiloHeadKeywordIds({ plans: [PLANO_AZUL, PLANO_LARANJA], keywords, planArticleKeywordIds: doPlano() });
  assert.deepEqual([...cabecas].sort(), [[CABECA, AZUL], ["slug", AZUL]], "o nome e o slug do plano; nenhuma keyword de artigo");
  // Artigo do plano com o mesmo texto do Silo continua artigo (nunca converte artigo em Silo).
  const artigoComONome = planSiloHeadKeywordIds({ plans: [PLANO_AZUL], keywords: [{ keywordId: "k9", text: "Wi-Fi e fibra óptica" }], planArticleKeywordIds: new Set(["k9"]) });
  assert.equal(artigoComONome.size, 0);
  // Dois planos com o mesmo nome: ambíguo, decisão humana.
  assert.equal(planSiloHeadKeywordIds({ plans: [PLANO_AZUL, { ...PLANO_LARANJA, siloName: "Wi-Fi e fibra óptica" }], keywords: [{ keywordId: CABECA, text: "Wi-Fi e fibra óptica" }] }).size, 0);
  // Marca sem plano (AdalbaPro): nada é reconhecido.
  assert.equal(planSiloHeadKeywordIds({ plans: [], keywords }).size, 0);
});

test("1 · keyword do Silo ausente é o NORMAL (0 volume, Silo não indexado): a frase diz que a identidade vem do plano; presente, é a cabeça", () => {
  assert.equal(planSiloHeadSentence({ siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra", head: null }), "Keyword do Silo: nenhuma no Arquiteto — normal (0 volume, não cadastrada, Silo não indexado). A identidade vem do plano: “Wi-Fi e fibra óptica” · /wifi-e-fibra.");
  assert.match(planSiloHeadSentence({ siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra", head: { keyword: "Wi-Fi e fibra óptica" } }), /cabeça da SiloPage \(nunca vira artigo nem “não agrupada”\)/);
});

test("1 · a reserva: a keyword do Silo (presente) fica fora de artigo e de 'não agrupadas' mesmo sem Silo; artigo do plano nunca é reservado", () => {
  const reservadas = reservedSiloHeadKeywordIds({
    lexicalHeadIds: ["k9"], declaredSiloHeadIds: [], territories: [],
    keywords: [{ keywordId: CABECA, text: "Wi-Fi e fibra óptica", territoryRef: null }],
    planArticleKeywordIds: doPlano(), planSiloHeadIds: [CABECA],
  });
  assert.deepEqual([...reservadas], [CABECA], "a cabeça reservada; o Pilar (k9) nunca");
  // Sem a cabeça (o caso real): nada é reservado — e nada é pendência.
  assert.equal(reservedSiloHeadKeywordIds({ lexicalHeadIds: [], declaredSiloHeadIds: [], territories: [], keywords: [], planArticleKeywordIds: doPlano(), planSiloHeadIds: [] }).size, 0);
});

/* ------------------------- 2 · nunca converter artigo, nunca Silo paralelo */

function proposta(opcoes: { cabeca: boolean; territorio: boolean }) {
  const ids = AZUL_REAL.map(([id]) => id);
  const textos = [...AZUL_REAL.map(([keywordId, text]) => ({ keywordId, text })), ...(opcoes.cabeca ? [{ keywordId: CABECA, text: "Wi-Fi e fibra óptica" }] : [])];
  const sinais = textos.map(({ keywordId, text }) => resolveKeywordDnaSignals({ keywordId, text, semantic: {} }));
  // O léxico junta a keyword do Silo com os artigos e a elege cabeça (o que fazia nascer um Silo "wi-fi-e-fibra-optica" paralelo).
  const membros = opcoes.cabeca ? [CABECA, ...ids] : ids;
  const cluster = { clusterRef: "c1", label: "Wi-Fi e fibra óptica", memberKeywordIds: membros, headKeywordId: membros[0], ambiguousHeadKeywordIds: [], destination: "new_silo_candidate", suggestedTerritoryRef: null, suggestedTerritoryLabel: null, alternativeTerritoryRefs: [], confidence: "alta", reason: "grupo coeso" } as unknown as ClusterAnalysis;
  const analise: ArchitectureAnalysis = { clusters: [cluster], summary: { keywords: membros.length, clusters: 1, strengthening: 0, newSilos: 1, insufficient: 0, ambiguous: 0, confidence: "alta" }, narrative: [], baseHash: "base" };
  return buildArchitectureWorkingProposal({
    analysis: analise, existingSilos: [], keywords: sinais, slugOf,
    declaredPlanGroups: [{ groupId: AZUL, label: "Azul", siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra", keywordIds: ids,
      territoryRef: opcoes.territorio ? TERRITORIO : null, territory: opcoes.territorio ? { name: "Wi-Fi e fibra óptica", slug: "wifi-e-fibra" } : null,
      headKeywordIds: opcoes.cabeca ? [CABECA] : [] }],
  });
}

test("2 · 'Processar arquitetura' com a keyword do Silo presente: ela entra no Silo do plano como cabeça; nenhum segundo Silo; nenhum artigo vira semente", () => {
  for (const territorio of [true, false]) {
    const resultado = proposta({ cabeca: true, territorio });
    const chave = territorio ? TERRITORIO : "proposed:wifi-e-fibra";
    assert.deepEqual(resultado.silos.map(silo => silo.key), [chave], `um Silo só, o do plano (${territorio ? "existente" : "proposto"})`);
    assert.equal(resultado.silos[0].seedKeywordId, null, "o tema é o nome do Silo do plano, nunca a semente léxica");
    const cabeca = resultado.assignments.find(item => item.keywordId === CABECA)!;
    assert.equal(cabeca.siloKey, chave);
    assert.match(cabeca.reason, /Keyword do Silo do plano.*cabeça da SiloPage/);
    assert.ok(resultado.assignments.filter(item => item.keywordId !== CABECA).every(item => item.siloKey === chave), "os artigos do plano seguem no Silo do plano");
    assert.equal(resultado.counters.RESOLVED_KEYWORDS, 8, "nenhuma keyword some");
  }
});

test("2 · variante 'keyword do Silo ausente' (o caso real): o Silo do plano é reusado ou proposto pelo NOME e SLUG do plano; nada pendente", () => {
  const existente = proposta({ cabeca: false, territorio: true });
  assert.deepEqual([existente.counters.SILOS_PROPOSED, existente.counters.SILOS_REUSED], [0, 1]);
  const novo = proposta({ cabeca: false, territorio: false });
  assert.deepEqual(novo.silos.map(silo => [silo.key, silo.name, silo.slug, silo.seedKeywordId]), [["proposed:wifi-e-fibra", "Wi-Fi e fibra óptica", "wifi-e-fibra", null]]);
});

test("2 · criação manual, 'Usar como Silo' e sugestão: Silo do plano não é criado por fora; artigo do plano não vira Silo; marca sem plano segue como antes", () => {
  const planos = [{ ...PLANO_AZUL, groupLabel: "Azul" }];
  assert.match(planSiloCreationRefusal({ name: "Wi-Fi e fibra óptica", plans: planos, existingTerritoryName: () => "Wi-Fi e fibra óptica" })!, /já existe .*não se cria um segundo/);
  assert.match(planSiloCreationRefusal({ name: "Qualquer", slug: "wifi-e-fibra", plans: planos })!, /criado \(ou recriado\) com o nome e o slug do plano por “Consolidar o Silo do plano”/);
  assert.match(planSiloCreationRefusal({ keywordIds: ["k9"], plans: planos, planArticleKeywordIds: doPlano() })!, /artigo do plano nunca vira Silo/);
  assert.equal(planSiloCreationRefusal({ name: "Captação de Pacientes", plans: [] }), null, "AdalbaPro (sem plano): como antes");
  assert.equal(planSiloCreationRefusal({ name: "Planos de internet", plans: planos }), null, "outro nome: livre");
  const tela = ler("../modules/arquiteto/arquiteto-workspace.tsx");
  assert.equal(tela.split("planSiloCreationRefusal({").length - 1, 2, "a criação manual e o 'Usar como Silo' perguntam ao plano");
  assert.match(tela, /candidates: doTerritorio\.filter\(kw => !planArticleKeywordIdSet\.has\(String\(kw\.id\)\)\)/, "a primária do Silo pela SERP nunca propõe artigo do plano");
  assert.match(tela, /keyword\.siloCandidate\?\.status === "candidate" && !keyword\.isPublished && !planArticleKeywordIdSet\.has\(String\(keyword\.id\)\) && !planSiloHeadIds\.has\(String\(keyword\.id\)\)/, "a sugestão de Silo não lista artigo do plano nem a keyword do Silo");
});

/* ------------------------------------------ 3 · Silo na aba Silos */

test("3 · o estado do Silo do plano (aba Silos) e o portão da aba Artigos", () => {
  const base = { siloName: "Wi-Fi e fibra óptica", linkedTerritoryRef: TERRITORIO, rejected: false, split: false, keywordsWithoutSilo: 0, pillarFormed: true } as const;
  const vivo = (lifecycleStatus: string) => ({ territoryRef: TERRITORIO, lifecycleStatus, name: "Wi-Fi e fibra óptica" });
  const caso = (extra: Partial<Parameters<typeof planSiloStatus>[0]>) => planSiloStatus({ ...base, territory: vivo("consolidated"), pair: "current", ...extra });
  assert.deepEqual([caso({}).stage, caso({}).actionable, caso({}).readyForArticles, caso({}).pairCurrent], ["done", false, true, true]);
  assert.equal(caso({ pair: "fix" }).stage, "fix", "15/10: a página com o tema de um suporte");
  assert.equal(caso({ linkedTerritoryRef: "territory:09d9b92d-db4d-4409-88c7-bd7ca5e77c7e" }).stage, "link", "o grupo apontava para um Silo que sumiu");
  assert.equal(caso({ pair: "missing" }).stage, "pair");
  const espera = caso({ pair: "missing", pillarFormed: false });
  assert.deepEqual([espera.stage, espera.actionable, espera.readyForArticles], ["wait_articles", false, true], "o Silo pronto libera a aba Artigos; a página espera o Pilar");
  const criar = caso({ territory: null });
  assert.deepEqual([criar.stage, criar.actionable, criar.readyForArticles], ["create", true, false]);
  assert.match(criar.sentence, /sem keyword do Silo, normal/);
  assert.deepEqual([caso({ territory: vivo("candidate") }).stage, caso({ territory: vivo("candidate") }).readyForArticles], ["confirm", false]);
  assert.equal(caso({ territory: null, rejected: true }).stage, "rejected");
  assert.equal(caso({ split: true }).actionable, false);
});

test("3 · a decisão do Silo tem impressão digital própria (Silo, vínculo, keywords que entram, cabeça)", () => {
  const base = { groupId: AZUL, planVersion: 4, territory: { kind: "rows", territoryRef: TERRITORIO, lifecycleStatus: "consolidated" }, linkedSiloId: TERRITORIO, keywordsWithoutSilo: [], headKeywordIds: [] };
  assert.equal(planSiloDecisionHash(base), planSiloDecisionHash({ ...base }));
  assert.notEqual(planSiloDecisionHash(base), planSiloDecisionHash({ ...base, headKeywordIds: [CABECA] }));
  assert.notEqual(planSiloDecisionHash(base), planSiloDecisionHash({ ...base, linkedSiloId: null }));
});

test("3 · a aba Artigos não cria Silo: a linha sem Silo é recusada com o caminho da aba Silos", () => {
  const linhas = mesa().filter(linha => String(linha.id).startsWith("k")).map(linha => ({ ...linha, territoryRef: linha.id === "k10" ? null : TERRITORIO }));
  const standings = readArchitectSubjectStandings(linhas);
  const lines = planConsolidationLines({ brandId: MARCA_WIFI, groupId: AZUL, rows: new Map(linhas.map(linha => [String(linha.id), linha])), standings, articles: [], ownerOf: () => null, hasIntent: () => true, territoryRef: TERRITORIO, now: new Date("2026-10-15T12:00:00Z") });
  const k10 = lines.find(line => line.keywordId === "k10")!;
  assert.equal(k10.action, "refused");
  assert.match(k10.sentence, /^Sem Silo ainda\. O Silo do plano é consolidado na aba Silos \(“Consolidar o Silo do plano”\)/);
  assert.equal(lines.find(line => line.keywordId === "k9")!.action, "write");
  const nucleo = semComentarios(ler("../lib/server/arquiteto-plan-consolidation.ts"));
  const linha = nucleo.slice(nucleo.indexOf("export async function applyPlanConsolidationLine"));
  assert.doesNotMatch(linha, /ensurePlanTerritory|createTerritoryWorkflowItem|confirmedTerritoryDraft|linkEditorialGroupSilo/, "o escopo artigos nunca cria, confirma nem religa Silo");
  assert.match(linha, /if \(!relido\.preview\.siloReady/);
});

/* ------------------------------------------ 3 · a barra da aba Artigos */

const linhasDoPlano = (articles: PlanSheetArticle[]) => buildPlanSheetRows({ brandId: MARCA_WIFI, keywords: mesa(), groupOf: id => GRUPOS[id] ?? null, keywordGroupOf: grupoDaKeywordReal, articles, radarArticleIds: new Set(), serp: { state: "ready", byKeyword: new Map(AZUL_REAL.map(([id]) => [id, { lenses: 4, collectedAt: "2026-10-14T00:00:00Z" }])) }, filter: { kind: "groups", color: "azul", groupIds: [AZUL] }, now: new Date("2026-10-15T12:00:00Z") });
const formados = (ids: string[], extra: Partial<PlanSheetArticle> = {}): PlanSheetArticle[] => ids.map(id => ({ articleId: id, versionNumber: 1, subjectKeywordId: id, principalKeywordId: id, keywordIds: [id], serpAssessed: true, ...extra }));
const SETE = AZUL_REAL.map(([id]) => id);

test("3 · as etapas da aba Artigos são só de artigo: sem Silo decidido tudo espera a aba Silos; 1 some com tudo formado; 3 linha editorial; 4 links só com a página do Silo em dia", () => {
  const semSilo = planArticleFlowSteps({ rows: linhasDoPlano([]), silo: { ready: false, pairCurrent: false, sentence: "O Silo do plano é consolidado na aba Silos" } });
  assert.ok(semSilo.every(step => step.state === "blocked"));
  assert.match(semSilo[0].reason, /aba Silos/);
  const formar = planArticleFlowSteps({ rows: linhasDoPlano(formados(["k9"])), silo: { ready: true, pairCurrent: false, sentence: "" } });
  assert.deepEqual(formar.map(step => [step.id, step.state]), [[1, "current"], [2, "blocked"], [3, "blocked"], [4, "blocked"]]);
  assert.deepEqual(planArticleVisibleSteps(formar, 2).map(step => step.label), ["1 · Formar artigos do plano", "2 · Reforçar keywords e SERP"]);
  const editorial = planArticleFlowSteps({ rows: linhasDoPlano(formados(SETE, { editorialPending: true })), silo: { ready: true, pairCurrent: true, sentence: "" } });
  assert.equal(editorial[0].hidden, true, "a etapa 1 some quando todo artigo do plano tem ArticleDNA");
  assert.deepEqual(editorial.map(step => step.state), ["done", "done", "current", "blocked"]);
  const semPagina = planArticleFlowSteps({ rows: linhasDoPlano(formados(SETE)), silo: { ready: true, pairCurrent: false, sentence: "" } });
  assert.deepEqual([semPagina[3].state, /aba Silos/.test(semPagina[3].reason)], ["blocked", true], "links esperam a página do Silo (aba Silos)");
  const links = planArticleFlowSteps({ rows: linhasDoPlano(formados(SETE)), silo: { ready: true, pairCurrent: true, sentence: "" } });
  assert.equal(links[3].state, "current");
});

/* -------------------------------------------- 4 · a linha editorial */

test("4 · linha editorial: só o pendente ganha valor, de fonte declarada (Assunto, escopo, BrandDNA, Pilar/objetivo do plano, SERP); nada inventado; nada sobrescrito", () => {
  const atual = { angle: EDITORIAL_PENDING_TEXT, promise: "Escopo do artigo 11.", problem: EDITORIAL_PENDING_TEXT, audience: EDITORIAL_PENDING_TEXT, cta: EDITORIAL_PENDING_TEXT, brandObjective: EDITORIAL_PENDING_TEXT };
  const entrada = { current: atual, subjectPhrase: "Wi-Fi lento em casa: 10 causas comuns e como melhorar a conexão", principalKeyword: "Wi-Fi lento", scope: "Escopo do artigo 11.", role: "Suporte" as const, siloName: "Wi-Fi e fibra óptica", siloObjective: "conquistar tráfego de pessoas que querem entender a tecnologia.", pillarSubject: "Internet fibra óptica ou internet comum: qual a diferença e qual escolher?", brandAudience: ["Famílias que contratam internet em casa"], serpIntent: "Informativa" };
  const mudancas = planEditorialLineChanges(entrada);
  const porCampo = Object.fromEntries(mudancas.map(change => [change.field, change]));
  assert.deepEqual(Object.keys(porCampo).sort(), ["angle", "audience", "brandObjective", "cta", "problem"], "a promessa já é o escopo do plano: fica");
  assert.equal(porCampo.angle.after, "Wi-Fi lento em casa: 10 causas comuns e como melhorar a conexão — intenção informativa confirmada pela SERP.");
  assert.equal(porCampo.problem.after, "Quem busca “Wi-Fi lento” quer resolver: Wi-Fi lento em casa: 10 causas comuns e como melhorar a conexão.");
  assert.equal(porCampo.audience.source, "BrandDNA aprovado");
  assert.match(porCampo.cta.after, /^Aprofundar no artigo Pilar do Silo “Wi-Fi e fibra óptica”: “Internet fibra óptica ou internet comum/);
  // Sem BrandDNA: o público continua pendente (não se inventa), e a frase diz.
  const semMarca = planEditorialLineChanges({ ...entrada, brandAudience: [] });
  assert.equal(semMarca.some(change => change.field === "audience"), false);
  // 2026-10-15 (noite) · a frase diz o caminho: "Aprove o BrandDNA em Marca e rode a Linha editorial de novo" (antes: "(sem fonte)").
  assert.match(planEditorialLineSentence(semMarca, ["angle", "cta", "problem", "audience"]), /Público pendente \(sem BrandDNA aprovado\): Aprove o BrandDNA em Marca e rode a Linha editorial de novo\./);
  // Valor decidido por gente fica.
  assert.equal(planEditorialLineChanges({ ...entrada, current: { ...atual, angle: "Ângulo escolhido pelo dono" } }).some(change => change.field === "angle"), false);
  // Pilar · 2026-10-15 (noite, readback do dono): o CTA é para o LEITOR — os Suportes pelos Assuntos; sem Suporte,
  // a página do Silo pelo nome. O objetivo do plano (meta de negócio) nunca vira CTA. Sem Silo nem Suporte, fica pendente.
  assert.equal(planEditorialLineChanges({ ...entrada, role: "Pilar", pillarSubject: null, supportSubjects: ["Wi-Fi lento em casa", "Internet para home office?"] }).find(change => change.field === "cta")!.after, "Leia também os artigos do Silo “Wi-Fi e fibra óptica”: “Wi-Fi lento em casa” e “Internet para home office?”.");
  assert.equal(planEditorialLineChanges({ ...entrada, role: "Pilar", pillarSubject: null }).find(change => change.field === "cta")!.after, "Conheça todos os conteúdos do Silo “Wi-Fi e fibra óptica”.");
  assert.ok(planEditorialLineChanges({ ...entrada, role: "Pilar", pillarSubject: null }).every(change => change.field === "brandObjective" || !/conquistar tráfego/.test(change.after)), "o objetivo só vai para o campo Objetivo");
  assert.equal(planEditorialLineChanges({ ...entrada, role: "Pilar", pillarSubject: null, siloName: null }).some(change => change.field === "cta"), false);
  assert.equal(isEditorialPending("Cobrir com clareza o tema “x”."), true, "a moldura genérica da promessa conta como pendente");
  assert.equal(articleEditorialPending({ angle: "a", cta: "b", problem: "c", audience: EDITORIAL_PENDING_TEXT }), true);
  assert.equal(articleEditorialPending({ angle: "a", cta: "b", problem: "c", audience: "d" }), false);
  const servidor = semComentarios(ler("../lib/server/arquiteto-plan-editorial-line.ts"));
  assert.doesNotMatch(servidor, /editorialAi|deepseek|openrouter|\/api\/minerador|minerador_keywords|lib\/redator|\/api\/redator|writer_/i, "sem IA, nada no Minerador nem no Redator (a frase da tela pode citá-los; nenhum import ou rota)");
  assert.match(servidor, /appendArquitetoArtifact\(await runtime\.authorize\("arquiteto", "approve"\), "article_dna", version, "approved"\)/);
  assert.match(servidor, /versionNumber: atual\.versionNumber \+ 1/, "versão nova, nunca reescreve a consolidada");
});

/* ------------------------------------ etapa 2 · o motor de sempre, explicado */

test("etapa 2 · a prévia diz por artigo a keyword mais fraca e por quê, o que entra (com a fonte) e o que sai", () => {
  const run = {
    targets: [{ id: "k11", memberIds: ["k11", "fraca", "boa"], primaryId: "k11" }],
    keywords: [{ id: "k11", keyword: "Wi-Fi lento", volume: 260, volumeValidated: true }, { id: "fraca", keyword: "wifi devagar", volume: null, volumeValidated: false }, { id: "boa", keyword: "wifi lento o que fazer", volume: 90, volumeValidated: true }, { id: "solta", keyword: "como melhorar o wifi de casa", volume: 1300, volumeValidated: true }, { id: "nova", keyword: "roteador wifi lento", volume: 70, volumeValidated: true, external: true }],
    proposals: [{ targetId: "k11", status: "ready" as const, reasons: [], principalId: "k11", currentPrimaryId: "k11", memberIds: ["k11", "boa", "solta", "nova"], addIds: ["solta", "nova"], removeIds: ["fraca"], evidenceBasis: "serp" as const }],
  };
  const detalhe = planReinforcementDetail(run, "k11")!;
  assert.deepEqual(detalhe.weakest, { keywordId: "fraca", keyword: "wifi devagar", why: "sem volume validado" });
  assert.deepEqual(detalhe.enters.map(item => [item.keyword, item.source]), [["como melhorar o wifi de casa", "SERP (páginas em comum no cache)"], ["roteador wifi lento", "busca nova no Google Ads"]]);
  assert.deepEqual(detalhe.leaves.map(item => item.keyword), ["wifi devagar"]);
  const [linha] = planSheetPreviewLines(run, [{ keywordId: "k11", keyword: "Wi-Fi lento", formation: { state: "formed", version: 1, articleId: "k11", principalKeywordId: "k11", label: "Formado · v1" } }]);
  assert.match(linha.sentence, /Vai gravar: nova versão \(v2\).*Mais fraca: “wifi devagar” \(sem volume validado\) · entra “como melhorar o wifi de casa” \(SERP \(páginas em comum no cache\)\), “roteador wifi lento” \(busca nova no Google Ads\) · sai “wifi devagar”/);
  // Sem substituta: "adequado", e a mais fraca é dita.
  const adequado = planSheetPreviewLines({ ...run, proposals: [{ ...run.proposals[0], status: "adequate" as const, addIds: [], removeIds: [] }] }, [{ keywordId: "k11", keyword: "Wi-Fi lento", formation: { state: "formed", version: 1, articleId: "k11", principalKeywordId: "k11", label: "Formado · v1" } }]);
  assert.match(adequado[0].sentence, /Mais fraca: “wifi devagar” \(sem volume validado\) — sem substituta com volume, SERP e DNA na lista da marca \(keywords soltas incluídas\)/);
  const motor = ler("../lib/server/arquiteto-article-improvement.ts");
  assert.match(motor, /groupFilter: \{ kind: "none" \}/, "o recorte do grupo traz as soltas para a lista");
});

/* ------------------------------------------ 5 · contrato e catálogo */

test("5 · o contrato está escrito (spec, SDD) e o catálogo do MCP acompanha", () => {
  const spec = ler("../docs/04-arquiteto/spec.md");
  assert.match(spec, /Silo do plano: identidade = DNA do plano/);
  assert.match(ler("../docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md"), /keyword do Silo é OPCIONAL/);
  const catalogo = ler("../lib/agent/platform-catalog.ts");
  assert.match(catalogo, /"\/api\/arquiteto\/plan-silo\/editorial-line"/);
  assert.match(catalogo, /proibido converter artigo em Silo/);
});
