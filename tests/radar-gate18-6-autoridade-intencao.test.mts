import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { RADAR_INTENT_NOT_CONCLUDED, radarConclusiveIntent, radarConclusiveIntents, radarDeclaredArticleIntent, radarDeclaredKeywordIntent } from "../lib/radar/editorial-identity.ts";
import { buildRadarDeepResearchView } from "../lib/radar/deep-research-view.ts";
import { startRadarDeepResearch } from "../lib/radar/deep-research.ts";
import { buildRadarResearchQueryPlan } from "../lib/radar/research-query-plan.ts";
import { radarResearchUniverseFingerprint } from "../lib/radar/research-curation.ts";
import { autoDecideRadarReference } from "../lib/radar/research-auto-selection.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ======  GATE 18.6 · O QUARTO LEITOR, E OS DEZOITO SEGUINTES  ==========
 *
 * O Gate 18.5 corrigiu a coleta canônica, a auxiliar e o filtro das lacunas, e
 * criou `radarConclusiveIntent`. Depois do F5 a tela ainda mostrava:
 *
 *   #### Intenção
 *   - O artigo declara "unknown" e a busca responde com "informacional".
 *   - Declarada pela composição: unknown.
 *   - Observada na busca: informacional.
 *
 * O produtor era `competitive-observed-model.ts`, que lia `mainIntent` cru — e
 * ele não estava sozinho: o censo encontrou a MESMA frase nascendo também de
 * `editorial-comparison.ts`, e mais dezesseis leituras espalhadas montando
 * cada uma a sua ordem de campos.
 *
 * ISSO É O DEFEITO, não o sintoma. Três gates seguidos corrigiram um leitor por
 * vez porque a decisão "qual é a intenção declarada deste artigo" não morava em
 * lugar nenhum. Ela passa a morar em `radarDeclaredArticleIntent` — e a da
 * keyword, em `radarDeclaredKeywordIntent`. Quem precisa pergunta.
 *
 * A investigação real não é tocada: tudo aqui é fixture em memória, e o
 * sentinela de rede no fim prova REAL_PROVIDER_CALLS = 0.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ============================ a fixture ============================== */

const link = (): RadarObservedLink => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org", kind: "EXTERNAL", anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Por que a pele fica oleosa?", rel: [], target: null, order: 0,
});

const pagina = (id: string, headings: string[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [], wordCount: 1600, internalLinkCount: 3, externalLinkCount: 1,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Na prática, testamos a rotina por oito semanas.", closingWordCount: 40,
  closingText: "Fecho.", hasClosing: true, emphasizedTerms: [], keywordPlacement: null,
  observedLinks: [link()], error: null,
});

const PAGINAS = Array.from({ length: 12 }, (_, index) => {
  const headings = ["Como identificar a pele oleosa?"];
  if (index < 9) headings.push("Por que a pele fica oleosa?");
  if (index < 8) headings.push("Rotina de cuidados para pele oleosa");
  if (index < 7) headings.push("É seguro usar ácido salicílico na gravidez?");
  return pagina(`A${index}`, headings);
});

const ARTIGO = { brandId: "marca-1", articleId: "artigo-1", articleDnaVersionId: "dna-v18", articleDnaContentHash: "hash-dna" };

/*
 * O CAMPO LIVRE TRAZ O SENTINELA — é assim que a investigação real está.
 *
 * `mainIntent: "unknown"` não é hipótese: é o valor que o ArticleDNA do smoke
 * carrega, enquanto o Arquiteto já fechou a classificação como Informacional.
 * A fixture reproduz esse desencontro de propósito; quem o resolve é a ordem.
 */
type Classificacao = { intent: string | null; intentLabel: string | null; funnel: string | null; funnelLabel: string | null; reason: string | null };

const CLASSIFICADO_INFORMACIONAL: Classificacao = { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "A Principal declara este estágio." };
const CLASSIFICADO_COMERCIAL: Classificacao = { intent: "COMMERCIAL_INVESTIGATION", intentLabel: "Comercial", funnel: "BOTTOM", funnelLabel: "Fundo", reason: "A Principal declara decisão." };
const SEM_CLASSIFICACAO: Classificacao = { intent: null, intentLabel: null, funnel: null, funnelLabel: null, reason: null };

const contexto = (classification: Classificacao): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    ...ARTIGO,
    promise: "Explicar como identificar, compreender e cuidar da pele oleosa.",
    mainIntent: "unknown", hierarchy: "Suporte", classification,
  },
  keywords: [{
    identity: { keywordId: "kw1", canonicalKeywordId: null, sourceKeywordId: null, keywordDnaVersionId: "kdna-1", text: "skincare para pele oleosa", role: "principal" },
    strategy: { volume: 720, resultCount: 4200, kgrScore: 0.589, incrementalVolume: null, contribution: null, normalizedIntent: "unknown", coveredIntentions: [], strategicContribution: null, purpose: null, overlapRisk: null, keywordUrlRelation: null, demandEvidence: null, keywordDnaSnapshot: { payload: { centralEntity: "pele oleosa" } }, semanticQualification: null },
    resolution: "FULL",
    provenance: { textSource: "hydration", strategySource: "article_reference", keywordDnaVersionId: "kdna-1", keywordDnaContentHash: "hash-kdna" },
  }],
  editorialTopics: ["identificação da pele oleosa"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null,
  internalLinks: {
    graphId: "graph-1", graphVersionId: "graph-v18", graphContentHash: `sha256:${"c".repeat(64)}`,
    edges: [
      { sourceNodeId: "article:este", targetNodeId: "article:pilar", relationType: "SUPPORT_TO_PILLAR", anchorConcepts: ["rotina de cuidados para pele oleosa"], reason: "O suporte devolve ao Pilar", priority: "HIGH", direction: "outbound" },
      { sourceNodeId: "article:pilar", targetNodeId: "article:este", relationType: "PILLAR_TO_SUPPORT", anchorConcepts: ["pele oleosa e acne"], reason: "O Pilar abre a verticalização", priority: "HIGH", direction: "inbound" },
    ],
  },
  limitations: [],
} as unknown as RadarArticleResearchContext);

const SNAPSHOT = { query: "skincare para pele oleosa", organicResults: PAGINAS.map((page, index) => ({ position: index + 1, title: page.title, domain: `d${index}.com`, url: page.url })) };

function vista(classification: Classificacao, dominantIntent: string | null) {
  const ctx = contexto(classification);
  const record = startRadarDeepResearch({ context: ctx, plan: buildRadarResearchQueryPlan(ctx), startedBy: "ator", now: "2026-09-10T09:00:00.000Z" });
  const base = {
    context: ctx, record, snapshot: SNAPSHOT as never, extractions: PAGINAS,
    observedAt: "2026-09-10T12:00:00.000Z",
    diagnostic: { dominantIntent, dominantFormats: ["article"] },
  } as Parameters<typeof buildRadarDeepResearchView>[0];

  const universo = buildRadarDeepResearchView(base);
  const recordBase = base.record as NonNullable<typeof base.record>;
  return buildRadarDeepResearchView({
    ...base,
    record: {
      ...recordBase,
      researchCuration: {
        universeFingerprint: radarResearchUniverseFingerprint(universo.references),
        confirmedAt: "2026-09-10T09:30:00.000Z", confirmedBy: "ator",
        references: universo.references.map(reference => ({
          referenceId: reference.referenceId, normalizedUrl: reference.normalizedUrl, url: reference.url,
          decision: autoDecideRadarReference(reference).decision, reason: "",
        })),
      },
    },
  });
}

/*
 * TODO TEXTO, COLHIDO POR VARREDURA — não por lista de campos.
 *
 * Escrevi a primeira versão deste helper nomeando os campos à mão, e o `tsc`
 * mostrou que metade deles não existia: `brief.expectedAnswer`, `secao.title`,
 * `video.reason`. Como `undefined` virava a string "undefined" ao concatenar,
 * as asserções passavam sem olhar para nada — teste verde sobre campo
 * inexistente, que é pior do que teste vermelho.
 *
 * A varredura recursiva não tem como errar o nome de um campo, e colhe também
 * os que forem acrescentados depois.
 */
function todoTexto(valor: unknown, saida: string[] = []): string[] {
  if (typeof valor === "string") saida.push(valor);
  else if (Array.isArray(valor)) for (const item of valor) todoTexto(item, saida);
  else if (valor && typeof valor === "object") for (const item of Object.values(valor)) todoTexto(item, saida);
  return saida;
}

/** As projeções humanas que o §6 nomeia, e só elas. */
function textoHumanoDe(view: ReturnType<typeof buildRadarDeepResearchView>) {
  return todoTexto([
    view.narrative,
    view.observed.intent,
    view.observed.conflicts,
    view.comparison,
    view.blueprint,
  ]).join("\n");
}

/* ============  A · INFORMACIONAL × INFORMACIONAL  ==================== */

test("GATE 18.6 · A — com o Arquiteto declarando Informacional, 'unknown' não aparece em lugar nenhum", () => {
  const view = vista(CLASSIFICADO_INFORMACIONAL, "informacional");
  const texto = textoHumanoDe(view);

  /*
   * A ASSERÇÃO É SOBRE A FRASE INTEIRA, não sobre uma seção.
   *
   * O smoke encontrou "unknown" em três linhas de uma vez, produzidas por dois
   * módulos diferentes. Varrer todo o texto humano é o que impede corrigir uma
   * superfície e deixar a outra falando.
   */
  assert.doesNotMatch(texto, /unknown/i, `"unknown" sobreviveu em: ${texto.split("\n").filter(l => /unknown/i.test(l)).join(" | ")}`);

  /* E as três linhas exatas do smoke não podem mais nascer. */
  assert.ok(!texto.includes(`O artigo declara "unknown"`));
  assert.ok(!texto.includes("Declarada pela composição: unknown."));

  /* §3: a leitura correta é a do Arquiteto, e ela é declarada por extenso. */
  const intencao = view.narrative.find(secao => secao.title === "Intenção");
  assert.ok(intencao, "a seção Intenção continua existindo — não foi escondida");
  assert.equal(view.observed.intent.declared, "Informacional");
  assert.equal(view.observed.intent.observedInSerp, "informacional");
  assert.equal(view.observed.intent.alignment, "ALIGNED", "as duas evidências são coerentes");
  assert.ok(intencao.lines.some(linha => linha.includes("Declarada pela composição: Informacional.")));
  assert.ok(intencao.lines.some(linha => linha.includes("Observada na busca: informacional.")));

  /* INFORMATIONAL_INFORMATIONAL_CONFLICT = NO, nas duas projeções. */
  const linhaDeIntencao = view.comparison.rows.find(row => row.dimension === "intent");
  assert.ok(linhaDeIntencao, "a comparação não foi eliminada");
  assert.equal(linhaDeIntencao.status, "CONFIRMED");
  assert.equal(view.observed.conflicts.filter(item => /inten/i.test(item.subject)).length, 0);

  /*
   * E AS DUAS PONTAS ESCREVEM EM IDIOMAS DIFERENTES.
   *
   * O provider devolve "informational"; o fundamento do Arquiteto diz
   * "Informacional". A linha corrigida neste gate comparava
   * `declarada.toLowerCase() === observada.toLowerCase()` — que chamaria isso
   * de DIVERGENTE e escreveria um conflito editorial inexistente por causa de
   * uma diferença de grafia. Sem este caso, a mutação que devolve a comparação
   * literal sobrevive: com os dois lados em português, ela dá o mesmo
   * resultado.
   */
  const emIngles = vista(CLASSIFICADO_INFORMACIONAL, "informational");
  assert.equal(emIngles.observed.intent.alignment, "ALIGNED", "PT × EN continua sendo a mesma intenção");
  assert.equal(emIngles.comparison.rows.find(row => row.dimension === "intent")?.status, "CONFIRMED");
  assert.doesNotMatch(textoHumanoDe(emIngles), /não coincide|CONFLICT/i);
});

/* ============  B · CONFLITO REAL PRESERVADO  ========================= */

test("GATE 18.6 · B — Comercial × Informacional continua sendo divergência", () => {
  const view = vista(CLASSIFICADO_COMERCIAL, "informacional");
  const texto = textoHumanoDe(view);

  /*
   * A CORREÇÃO NÃO PODE CALAR O QUE IMPORTA (§4).
   *
   * Um artigo fechado como Comercial cuja SERP responde informacional é um
   * achado editorial: o mercado responde outra pergunta. Silenciar isso seria
   * trocar um defeito por outro pior — este teste é o que impede.
   */
  assert.equal(view.observed.intent.declared, "Comercial");
  assert.equal(view.observed.intent.observedInSerp, "informacional");
  assert.equal(view.observed.intent.alignment, "DIVERGENT");

  const linhaDeIntencao = view.comparison.rows.find(row => row.dimension === "intent");
  assert.equal(linhaDeIntencao?.status, "CONFLICT");
  assert.ok(texto.includes(`O artigo declara "Comercial" e a SERP responde com "informacional".`), "a frase real continua sendo escrita");
  assert.doesNotMatch(texto, /unknown/i, "e ainda assim o sentinela não entra");
});

/* ============  C · AUSÊNCIA REAL NÃO É DECLARAÇÃO  =================== */

test("GATE 18.6 · C — sem classificação terminal, a ausência é dita como ausência", () => {
  const view = vista(SEM_CLASSIFICACAO, "informacional");
  const texto = textoHumanoDe(view);

  /*
   * §5: "unknown" não é declaração. Com o campo livre trazendo o sentinela e o
   * Arquiteto sem ter concluído, não há intenção declarada — e o texto precisa
   * dizer isso, não inventar que o artigo declarou a palavra "unknown".
   */
  assert.equal(view.observed.intent.declared, null, "ausência é null, não uma string");
  assert.equal(view.observed.intent.observedInSerp, "informacional");
  assert.equal(view.observed.intent.alignment, "NOT_OBSERVED");
  assert.doesNotMatch(texto, /unknown/i);
  assert.ok(!texto.includes("Declarada pela composição:"), "não se declara o que não foi declarado");

  assert.match(view.observed.intent.note, /não concluiu a intenção declarada/);
  assert.ok(view.observed.intent.note.includes(`A busca respondeu com "informacional"`), "o que foi observado continua sendo dito");

  const linhaDeIntencao = view.comparison.rows.find(row => row.dimension === "intent");
  assert.equal(linhaDeIntencao?.status, "NOT_OBSERVED");
  assert.match(String(linhaDeIntencao?.evidence), /não declara intenção principal/);
});

/* ============  D, E e F · BLUEPRINT, NARRATIVA E PAUTA  ============== */

test("GATE 18.6 · D, E e F — as três projeções humanas, cada uma conferida", () => {
  /*
   * §6 pedia para verificar blueprint, narrativa do relatório e SpecialistBrief
   * separadamente. Elas derivam da mesma autoridade, mas cada uma tem o seu
   * caminho até o texto — e o Gate 18.3 já mostrou que derivar da mesma fonte
   * não garante que todas a leiam do mesmo jeito.
   */
  for (const [rotulo, classificacao] of [["Informacional", CLASSIFICADO_INFORMACIONAL], ["sem classificação", SEM_CLASSIFICACAO]] as const) {
    const view = vista(classificacao, "informacional");

    /* D · Blueprint */
    const blueprint = view.blueprint;
    assert.equal(blueprint.article.intent, classificacao.intentLabel, "o blueprint mostra a decisão do Arquiteto, ou nada");

    /*
     * SEM FUNDAMENTO, O BLUEPRINT DECLARA A INSUFICIÊNCIA — não propõe às cegas.
     *
     * Com o Arquiteto sem ter concluído e o campo livre trazendo só o
     * sentinela, não há intenção nem funil para ancorar um bloco. A camada
     * responde `INSUFFICIENT` com o motivo escrito, que é o que o §5 pede:
     * dizer que não concluiu, em vez de inventar uma proposta a partir de
     * "unknown".
     */
    if (classificacao.intentLabel) {
      assert.ok(blueprint.sections.length > 0, "com fundamento, a mesma amostra propõe blocos");
      assert.equal(blueprint.readiness.state, "READY");
    } else {
      assert.equal(blueprint.sections.length, 0, "sem fundamento, nenhum bloco é proposto");
      assert.equal(blueprint.readiness.state, "INSUFFICIENT");
      assert.match(blueprint.readiness.reason, /não produziu necessidade suficiente/);
      assert.doesNotMatch(blueprint.readiness.reason, /unknown/i, "e o motivo não cita o sentinela");
    }
    assert.doesNotMatch(todoTexto(blueprint).join("\n"), /unknown/i, `blueprint com ${rotulo}`);

    /* E · narrativa do relatório */
    assert.ok(view.narrative.length > 0, "a narrativa tem seções");
    assert.doesNotMatch(todoTexto(view.narrative).join("\n"), /unknown/i, `narrativa com ${rotulo}`);

    /* F · SpecialistBrief */
    assert.ok(blueprint.specialistBriefs.length > 0, "a fixture produz pauta de especialista de verdade");
    for (const brief of blueprint.specialistBriefs) {
      /* Os campos existem de fato — é o que faltou na primeira versão do teste. */
      assert.equal(typeof brief.question, "string");
      assert.equal(typeof brief.whyNeeded, "string");
      assert.equal(typeof brief.claimContext, "string");
    }
    assert.doesNotMatch(todoTexto(blueprint.specialistBriefs).join("\n"), /unknown/i, `pauta com ${rotulo}`);
  }
});

/* ============  A AUTORIDADE, EXERCITADA DIRETAMENTE  ================= */

test("GATE 18.6 · a ordem existe uma vez e aceita as duas formas do fundamento", () => {
  /* A forma do contexto de pesquisa: `classification.intent` já achatado. */
  assert.equal(radarDeclaredArticleIntent({ mainIntent: "unknown", classification: { intent: "INFORMATIONAL", intentLabel: "Informacional" } }), "Informacional");
  /* A forma do ArticleDNA persistido: `classification.intent.value`. */
  assert.equal(radarDeclaredArticleIntent({ mainIntent: "unknown", classification: { intent: { value: "INFORMATIONAL" } } }), "INFORMATIONAL");

  /* Os sentinelas das duas origens: o do normalizador e o do fechamento. */
  assert.equal(radarConclusiveIntent("unknown"), null);
  assert.equal(radarConclusiveIntent("AMBIGUOUS"), null);
  assert.equal(radarConclusiveIntent("indeterminate"), null);
  assert.equal(radarConclusiveIntent("Informacional"), "Informacional");
  assert.equal(radarDeclaredArticleIntent({ mainIntent: "unknown", classification: { intent: { value: "AMBIGUOUS" } } }), null);
  assert.equal(radarDeclaredArticleIntent(null), null);
  assert.equal(radarDeclaredArticleIntent({ mainIntent: "Comercial" }), "Comercial");

  /* A keyword é outro sujeito, com a ordem dela. */
  assert.equal(radarDeclaredKeywordIntent({ normalizedIntent: "unknown" }), null);
  assert.equal(radarDeclaredKeywordIntent({ normalizedIntent: "unknown", coveredIntentions: ["unknown", "Informacional"] }), "Informacional");
  assert.equal(radarDeclaredKeywordIntent({ semanticQualificationRef: { intent: "Comercial" }, normalizedIntent: "informational" }), "Comercial");
  assert.equal(radarDeclaredKeywordIntent(null), null);

  /* E a mesma regra sobre uma lista de sinais. */
  assert.deepEqual(radarConclusiveIntents(["unknown", "", null, "Comercial", "AMBIGUOUS"]), ["Comercial"]);
  assert.deepEqual(radarConclusiveIntents(null), []);

  /* Quando o contrato exige texto, a ausência é declarada — não disfarçada. */
  assert.doesNotMatch(RADAR_INTENT_NOT_CONCLUDED, /unknown/i);
});

/* ============  O CENSO: NENHUMA LEITURA FORA DA AUTORIDADE  ========== */

const PADROES = [/\.mainIntent\b/, /\.normalizedIntent\b/, /classification\??\.intent\b/, /\.coveredIntentions\b/, /semanticQualification(Ref)?\??\.intent\b/];
const AUTORIDADE = /radarConclusiveIntents?\(|radarDeclaredArticleIntent\(|radarDeclaredKeywordIntent\(/;

/*
 * DECLARADOS: estes leem o CAMPO, não a intenção.
 *
 * O construtor da projeção copia `ArticleDNA.mainIntent` fielmente — se ele
 * mentisse, o painel de fundamento perderia a capacidade de auditar o campo. O
 * censo comparativo do Arquiteto e o mapa de uso trabalham sobre nomes de
 * campo. Filtrar ali seria esconder o estado real do dado, que é o oposto
 * deste gate.
 */
const DECLARADOS = new Set([
  "lib/radar/article-research-context.ts",
  "lib/radar/editorial-context.ts",
  "lib/radar/foundation-usage-map.ts",
  "lib/radar/editorial-identity.ts",
]);

function varrer(dir: string, saida: string[] = []) {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const caminho = join(dir, nome).split("\\").join("/");
    if (statSync(caminho).isDirectory()) varrer(caminho, saida);
    else if (/\.(ts|tsx)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/*
 * O CENSO É POR EXPRESSÃO, NÃO POR LINHA.
 *
 * `radarConclusiveIntents(\n  keywords.flatMap(…normalizedIntent…),\n)` põe a
 * autoridade numa linha e o campo na seguinte. Contado por linha, isso aparece
 * como leitura crua — e não é: é o argumento de quem aplica a regra.
 */
function expressoes(codigo: string) {
  const saida: Array<{ linha: number; texto: string }> = [];
  let buffer = "";
  let inicio = 0;
  let profundidade = 0;
  codigo.split(/\r?\n/).forEach((linha, i) => {
    if (!buffer) inicio = i + 1;
    buffer += (buffer ? "\n" : "") + linha;
    for (const char of linha) {
      if (char === "(" || char === "[") profundidade += 1;
      if (char === ")" || char === "]") profundidade -= 1;
    }
    if (profundidade <= 0) { saida.push({ linha: inicio, texto: buffer }); buffer = ""; profundidade = 0; }
  });
  if (buffer) saida.push({ linha: inicio, texto: buffer });
  return saida;
}

function leiturasCruas() {
  const fora: string[] = [];
  for (const arquivo of [...varrer("lib/radar"), ...varrer("modules/radar"), ...varrer("app/api/editorial")]) {
    if (DECLARADOS.has(arquivo)) continue;
    const bruto = readFileSync(arquivo, "utf8");
    /* Comentários fora: o censo é sobre o que EXECUTA. */
    const codigo = bruto.replace(/\/\*[\s\S]*?\*\//g, trecho => trecho.replace(/[^\n]/g, " ")).replace(/\/\/.*/g, "");
    for (const { linha, texto } of expressoes(codigo)) {
      if (!PADROES.some(padrao => padrao.test(texto)) || AUTORIDADE.test(texto)) continue;
      fora.push(`${arquivo}:${linha} ${texto.trim().replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
  return fora;
}

test("GATE 18.6 · §2 — DIRECT_RAW_INTENT_READS_REMAINING = 0", () => {
  /*
   * ESTE CENSO É O ÚNICO QUE IMPEDE O QUINTO LEITOR.
   *
   * As asserções A–F provam que as projeções de HOJE estão certas. Só o censo
   * impede que a próxima projeção escrita no Radar monte a décima nona ordem
   * própria e reabra o defeito pela quinta vez.
   */
  const fora = leiturasCruas();
  assert.deepEqual(fora, [], `leituras de intenção fora da autoridade:\n${fora.join("\n")}`);

  /* NÃO-VACUIDADE: o censo enxerga uma leitura crua quando ela existe. */
  const comMutacao = expressoes("const declarada = input.context.article.mainIntent;")
    .filter(({ texto }) => PADROES.some(padrao => padrao.test(texto)) && !AUTORIDADE.test(texto));
  assert.equal(comMutacao.length, 1, "o censo reconhece a forma exata do defeito original");

  /* E não confunde o argumento de quem aplica a regra com uma leitura crua. */
  const comAutoridade = expressoes("const intencoes = radarConclusiveIntents(\n  keywords.flatMap(k => [k.strategy.normalizedIntent]),\n);")
    .filter(({ texto }) => PADROES.some(padrao => padrao.test(texto)) && !AUTORIDADE.test(texto));
  assert.equal(comAutoridade.length, 0, "a chamada multilinha da autoridade não conta como leitura crua");
});

test("GATE 18.6 · os dois produtores da frase passaram a perguntar à autoridade", () => {
  /*
   * §1 pedia o produtor EXATO. Eram dois, escrevendo a mesma frase a partir de
   * duas leituras cruas diferentes — e é por isso que a busca literal do
   * enunciado era necessária: pelo comportamento, os dois eram indistinguíveis.
   */
  const modelo = readFileSync(new URL("../lib/radar/competitive-observed-model.ts", import.meta.url), "utf8");
  assert.match(modelo, /const declarada = radarDeclaredArticleIntent\(input\.context\.article\)/);
  assert.match(modelo, /const leituraDeIntencao = radarIntentConflict\(\{ expected: declarada, observed: observada \}\)/);
  /* Sem comentários: a frase antiga sobrevive no comentário que a explica. */
  const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(
    !/declarada\.toLowerCase\(\) === observada\.toLowerCase\(\)/.test(semComentarios(modelo)),
    "a comparação literal não decide mais alinhamento",
  );

  const comparacao = readFileSync(new URL("../lib/radar/editorial-comparison.ts", import.meta.url), "utf8");
  assert.match(comparacao, /const declaradaIntencao = radarDeclaredArticleIntent\(input\.context\.article\)/);
  assert.match(comparacao, /radarIntentConflict\(\{ expected: declaradaIntencao, observed: observadaIntencao \}\)/);

  /* As duas frases do smoke continuam existindo no código — com valor real. */
  assert.ok(modelo.includes("O artigo declara"), "a frase não foi apagada, foi corrigida na origem");
  assert.ok(comparacao.includes("O artigo declara"));
});

/* ============  H · A INVESTIGAÇÃO REAL NÃO É TOCADA  ================= */

test("GATE 18.6 · H — nada aqui escreve, persiste ou alcança a investigação", () => {
  /*
   * §7: a rodada real está entre o ANALYZE e o FINALIZE. Uma escrita acidental
   * deste gate custaria a investigação inteira.
   */
  const autoridade = readFileSync(new URL("../lib/radar/editorial-identity.ts", import.meta.url), "utf8");
  const codigo = autoridade.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["fetch", "await ", "supabase", "possibleConflicts ="]) {
    assert.ok(!codigo.includes(proibido), `a autoridade não faz "${proibido}"`);
  }

  /* As funções são puras: a mesma entrada, o mesmo resultado, sem efeito. */
  const entrada = { mainIntent: "unknown", classification: { intent: "INFORMATIONAL", intentLabel: "Informacional" } };
  const antes = JSON.stringify(entrada);
  assert.equal(radarDeclaredArticleIntent(entrada), radarDeclaredArticleIntent(entrada));
  assert.equal(JSON.stringify(entrada), antes, "a entrada não é mutada");

  const sinais = ["unknown", "Comercial"];
  radarConclusiveIntents(sinais);
  assert.deepEqual(sinais, ["unknown", "Comercial"], "a lista de entrada não é mutada");

  /* E a vista completa é construída em memória, sem tocar repositório. */
  const view = vista(CLASSIFICADO_INFORMACIONAL, "informacional");
  assert.equal(view.record?.startedBy, "ator", "o registro é o da fixture, não um lido do repositório");
  assert.ok(view.comparison.rows.length > 0, "e a vista inteira foi montada em memória");
});

/* ============  G · ZERO PROVIDER  ==================================== */

test("GATE 18.6 · G — nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `REAL_PROVIDER_CALLS deveria ser 0; houve: ${tentativasDeRede.join(", ")}`);
});
