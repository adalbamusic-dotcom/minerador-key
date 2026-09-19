import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { montarRadar, React } from "./radar-dom-harness.mts";
import { RadarProfileBlueprintSection } from "../modules/radar/radar-profile-blueprint.tsx";
import {
  buildRadarEditorialCommercialModel,
  buildRadarEditorialVideoModel,
  type RadarEditorialProfileModel,
} from "../lib/radar/editorial-profile-model.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarAmazonBlueprint, RadarYoutubeCanonicalBlueprint } from "../lib/radar/competitive-blueprint.ts";

/*
 * ===== PROFILES_2 · O TEMPLATE EDITORIAL NOS TRÊS PERFIS =====
 *
 * O Google fechou a gramática: ArticleDNA manda, a evidência do perfil
 * acrescenta, a síntese decide, e o produto editorial é a superfície principal.
 *
 * Este arquivo prova que YouTube e Amazon obedecem à MESMA regra sem copiar a
 * forma do artigo — e que cada um continua respeitando o que a sua coleta
 * REALMENTE observa. A Amazon não vê texto de review; o YouTube não vê gancho.
 * Um blueprint que afirmasse qualquer um dos dois estaria inventando.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ============================== o ArticleDNA ============================== */

const contexto = (patch: Record<string, unknown> = {}): RadarArticleResearchContext => ({
  state: "COMPLETE",
  article: {
    brandId: "marca-1", articleId: "artigo-1",
    articleDnaVersionId: "dna-v1", articleDnaContentHash: "hash-dna-v1",
    promise: "Skincare para pele oleosa", mainIntent: "informacional", hierarchy: "Suporte",
    classification: { intent: "INFORMATIONAL", intentLabel: "Informacional", funnel: "TOP", funnelLabel: "Topo", reason: "Fechado pelo Arquiteto." },
  },
  keywords: [{ identity: { keywordId: "kw1", role: "principal", text: "skincare para pele oleosa" } }],
  editorialTopics: ["identificação da pele oleosa", "rotina de cuidados diária", "proteção solar"],
  resolvedKeywordTexts: ["skincare para pele oleosa"],
  silo: { siloId: "silo-1", siloName: "skincare", articleRole: "SUPORTE" },
  formationSerp: null, internalLinks: null, limitations: [],
  ...patch,
} as unknown as RadarArticleResearchContext);

/* ======================= o blueprint canônico do YouTube ======================= */

const sinal = (id: string, statement: string, evidence: string) => ({
  id, statement, grade: "OBSERVED_SERP" as const, evidence, count: null,
});

const youtube = (patch: Record<string, unknown> = {}): RadarYoutubeCanonicalBlueprint => ({
  schemaVersion: 1,
  profile: "YOUTUBE",
  articleId: "artigo-1",
  articleDnaVersionId: "dna-v1",
  limitations: ["A coleta lê título, canal, duração e posição: ela não abre o vídeo."],
  observed: {
    comparableVideos: 38,
    longForm: 31,
    shorts: 0,
    titlePatterns: [sinal("t1", "COMO CUIDAR DA PELE OLEOSA EM 5 PASSOS", "18 de 38 vídeos")],
    recurrentChannels: [sinal("c1", "Canal Dermato", "6 vídeos")],
    durationRange: "mediana 9 min, p25 6 min, p75 14 min",
    viewsRange: "mediana 42.000 visualizações",
    recency: "mediana 7 meses",
    crossQuery: [],
    googleSupport: [sinal("g1", "A busca traz perguntas sobre hidratação", "4 PAA")],
    gaps: [],
    sufficiency: "Amostra suficiente",
  },
  recommended: {
    format: "ARTICLE_WITH_VIDEO",
    durationDirection: "Entre 8 e 12 minutos",
    titleDirections: [
      { id: "d1", statement: "Nomear o problema e o resultado no mesmo título", objective: "Prender pela promessa concreta", sourceSignal: "18 de 38 vídeos usam número no título" },
    ],
    hookDirection: { id: "h1", statement: "Corrigir a crença de que pele oleosa não precisa de hidratante", objective: "Quebrar a objeção logo no início", sourceSignal: "A busca mostra a dúvida recorrente" },
    script: [
      { block: "ABERTURA", objective: "Prender pelo que o espectador veio resolver", direction: "O que é a pele oleosa", sourceSignal: "Recorrente na amostra" },
      { block: "DEMONSTRACAO", objective: "Mostrar a rotina em execução", direction: "Como aplicar a rotina passo a passo", sourceSignal: "Formato dominante" },
      { block: "FECHAMENTO", objective: "Consolidar e encaminhar", direction: "O que fazer a seguir", sourceSignal: "Fechamento observado" },
    ],
    tone: "Direto e demonstrativo",
    languageDirection: null,
    technicalLevel: null,
    authorityDirection: null,
    shorts: [],
    articleApplication: [
      { piece: "VIDEO_HERO", placement: "Abertura do artigo", role: "Demonstrar a rotina", sourceSignal: "Formato dominante na amostra" },
    ],
  },
  ...patch,
} as unknown as RadarYoutubeCanonicalBlueprint);

/* ======================= o blueprint canônico da Amazon ======================= */

const amazon = (patch: Record<string, unknown> = {}): RadarAmazonBlueprint => ({
  schemaVersion: 1,
  profile: "AMAZON",
  articleId: "artigo-1",
  articleDnaVersionId: "dna-v1",
  limitations: [
    "A coleta da prateleira não traz texto de avaliação: elogios e reclamações não foram observados.",
    "Benefícios e atributos do PDP não foram lidos nesta investigação.",
  ],
  observed: {
    products: 51,
    placementSignals: [sinal("p1", "Um produto aparece em orgânico e em dois slots patrocinados", "ASIN B01 · 3 posições")],
    priceSignals: [sinal("pr1", "Preço observado em 12/09/2026", "R$ 89,90")],
    ratingSignals: [sinal("r1", "Nota média 4,5 com 2.300 avaliações", "agregado da listagem")],
    purchaseSignals: [sinal("b1", "Amazon Choice em 3 produtos", "selo da listagem")],
    offerTextSignals: [],
    relatedSearchSignals: [sinal("s1", "sabonete para pele oleosa", "busca relacionada")],
    googleSupport: [sinal("gs1", "A busca traz comparações entre marcas", "3 resultados")],
    priceBands: [
      { band: "ECONOMICA", observedValue: 39.9, currency: "BRL", observedAt: "2026-09-12", source: "listagem", sampleSize: 17, method: "Tercil inferior do universo observado" },
      { band: "PREMIUM", observedValue: 189.9, currency: "BRL", observedAt: "2026-09-12", source: "listagem", sampleSize: 17, method: "Tercil superior do universo observado" },
    ],
    sufficiency: "Amostra suficiente",
  },
  recommended: {
    offerDirection: [],
    positioning: null,
    priceBandDirection: "INTERMEDIARIA",
    comparisonStructure: [
      { id: "c1", statement: "Comparar por faixa de preço", objective: "Dar critério de orçamento", sourceSignal: "Bandas derivadas do universo" },
      { id: "c2", statement: "Comparar por reputação e sinais de compra", objective: "Separar o que o mercado já valida", sourceSignal: "Nota e volume de avaliações" },
    ],
    buyingGuideStructure: [
      { id: "g1", statement: "Como escolher um produto para pele oleosa", objective: "Organizar a decisão do leitor", sourceSignal: "Recorrência da intenção comercial" },
    ],
    commercialArticleStructure: [
      { id: "a1", statement: "Faixas de preço observadas", objective: "Situar o leitor no mercado", sourceSignal: "Bandas derivadas" },
    ],
    ctaDirection: { id: "cta1", statement: "Levar o leitor a comparar antes de decidir", objective: "Fechar sem empurrar produto", sourceSignal: "Intenção observada" },
    googleSeoSupport: [
      { id: "seo1", statement: "Cobrir as buscas relacionadas na seção comercial", objective: "Capturar a cauda comercial", sourceSignal: "Buscas relacionadas" },
    ],
    supportState: "SUPPORT_OK",
    recommendedOutputs: [
      { output: "ARTICLE_WITH_COMMERCIAL_SECTION", objective: "Cobrir o tema e resolver a decisão", reason: "A intenção declarada é informacional, e a prateleira sustenta uma seção", sourceSignals: ["Intenção declarada", "Universo de 51 produtos"] },
    ],
    editorialAngle: { id: "ea1", statement: "Explicar antes de recomendar", objective: "Preservar a intenção informacional", sourceSignal: "Classificação do Arquiteto" },
    commercialAngle: { id: "ca1", statement: "Dar critério de escolha sem eleger um vencedor", objective: "Resolver a decisão do leitor", sourceSignal: "Sinais de reputação da listagem" },
    differentiationDirection: [],
    titleDirections: [
      { pattern: "Nomear o critério antes do produto", objective: "Evitar título de vitrine", sourceSignals: ["Buscas relacionadas"] },
    ],
  },
  ...patch,
} as unknown as RadarAmazonBlueprint);

const modeloDeVideo = (patch: { context?: RadarArticleResearchContext; blueprint?: RadarYoutubeCanonicalBlueprint } = {}) =>
  buildRadarEditorialVideoModel({ context: patch.context || contexto(), blueprint: patch.blueprint || youtube() });

const modeloComercial = (patch: { context?: RadarArticleResearchContext; blueprint?: RadarAmazonBlueprint } = {}) =>
  buildRadarEditorialCommercialModel({ context: patch.context || contexto(), blueprint: patch.blueprint || amazon() });

async function montar(model: RadarEditorialProfileModel) {
  const tela = await montarRadar();
  await tela.render(React.createElement(RadarProfileBlueprintSection, { model }));
  return tela;
}

const visivelSemDisclosure = (tela: Awaited<ReturnType<typeof montar>>) => {
  const copia = tela.container.cloneNode(true) as HTMLElement;
  for (const details of [...copia.querySelectorAll("details")]) {
    const resumo = details.querySelector("summary");
    details.replaceChildren(...(resumo ? [resumo] : []));
  }
  return copia.textContent || "";
};

/* ============================ §25 · YOUTUBE ============================ */

test("A e §21 · o ArticleDNA é o núcleo, e ele muda o blueprint", () => {
  const model = modeloDeVideo();

  assert.equal(model.articleIdentity.articleId, "artigo-1");
  assert.equal(model.articleIdentity.articleDnaVersionId, "dna-v1");
  assert.equal(model.articleIdentity.principalKeyword, "skincare para pele oleosa");
  assert.equal(model.articleIdentity.intentLabel, "Informacional");

  /*
   * §21 · MESMA EVIDÊNCIA, OUTRO ARTICLEDNA → OUTRO BLUEPRINT.
   *
   * Sem isto, "o ArticleDNA é o núcleo" seria uma frase no comentário: a
   * síntese poderia estar lendo só a SERP e ninguém notaria.
   */
  const outro = modeloDeVideo({
    context: contexto({
      keywords: [{ identity: { keywordId: "kw2", role: "principal", text: "protetor solar para pele oleosa" } }],
      editorialTopics: ["textura do protetor", "reaplicação ao longo do dia"],
    }),
  });
  assert.notEqual(outro.workingTitle, model.workingTitle);
  assert.notDeepEqual(
    outro.blocks.flatMap(bloco => bloco.coveragePoints),
    model.blocks.flatMap(bloco => bloco.coveragePoints),
    "os tópicos declarados mudaram o que cada bloco cobre",
  );
});

test("B e C · o título é original e nunca o do concorrente", () => {
  const model = modeloDeVideo();

  assert.ok(model.workingTitle.length > 10);
  /* O padrão observado vem em caixa alta da SERP: ele não atravessa. */
  assert.equal(model.workingTitle.includes("COMO CUIDAR DA PELE OLEOSA EM 5 PASSOS"), false);
  assert.equal(model.workingTitle, model.workingTitle.trim());

  /* E se a escada gerasse exatamente o observado, ela desceria para a próxima. */
  const colidindo = modeloDeVideo({
    blueprint: youtube({
      observed: { ...youtube().observed, titlePatterns: [sinal("t1", "Skincare para pele oleosa: o que mostrar em vídeo", "observado")] },
      recommended: { ...youtube().recommended, script: [] },
    }),
  });
  assert.notEqual(
    colidindo.workingTitle.toLowerCase(),
    "skincare para pele oleosa: o que mostrar em vídeo",
  );
});

test("D · o hook é utilizável e não é telemetria", () => {
  const model = modeloDeVideo();

  assert.ok(model.hook, "há gancho recomendado");
  assert.match(model.hook!, /hidratante|crença/i, "o gancho diz o que fazer, não o que foi medido");
  assert.equal(/\d+ de \d+|mediana|percentil|38/i.test(model.hook!), false);

  /*
   * E UM GANCHO QUE FOSSE MÉTRICA NÃO PASSA.
   *
   * A coleta não abre vídeo: ela lê título, canal, duração e posição. Se a
   * recomendação vier com a cara de uma medição, ela não é gancho.
   *
   * 2.1 · §16 · O QUE MUDOU É O QUE ACONTECE DEPOIS DA RECUSA.
   *
   * Antes, a medição era barrada e a superfície ficava sem gancho nenhum — a
   * tela mostrava o problema em vez de resolvê-lo. Agora a recusa CAI para o
   * ArticleDNA, que é o núcleo: o gancho existe, é sobre este artigo, e nenhum
   * número atravessou. A asserção é sobre a métrica não passar — nunca foi
   * sobre a superfície ficar vazia.
   */
  const comMetrica = modeloDeVideo({
    blueprint: youtube({
      recommended: { ...youtube().recommended, hookDirection: { id: "h", statement: "Mediana de 9 minutos em 38 vídeos", objective: "x", sourceSignal: "y" } },
    }),
  });
  assert.equal(/mediana|\d+ v(í|i)deos|9 minutos|38/i.test(comMetrica.hook || ""), false, "telemetria não vira gancho");
  assert.ok(comMetrica.hook, "e a recusa não deixa o vídeo sem abertura");
  assert.match(comMetrica.hook!, /pele oleosa/i, "o substituto vem do ArticleDNA, não da amostra");

  /*
   * §16 · A ESTRATÉGIA SOBRE A SERP TAMBÉM NÃO É GANCHO.
   *
   * Esta é a frase real que a tela mostrava. Ela é uma boa decisão e uma
   * péssima instrução de gravação — a justificativa fica na evidência.
   */
  const comEstrategia = modeloDeVideo({
    blueprint: youtube({
      recommended: {
        ...youtube().recommended,
        hookDirection: { id: "h", statement: 'Abra contrariando a promessa que a amostra repete ("Rotina")', objective: "x", sourceSignal: "y" },
      },
    }),
  });
  assert.equal(/a amostra repete|contrariando a promessa/i.test(comEstrategia.hook || ""), false);
  assert.ok(comEstrategia.hook, "e o vídeo continua tendo abertura");
});

test("E e F · os blocos vêm das necessidades, e MUST_COVER não força bloco", () => {
  const model = modeloDeVideo();

  assert.equal(model.blocks.length, 3, "um bloco por seção de roteiro — nem mais, nem menos");
  for (const bloco of model.blocks) {
    assert.ok(bloco.heading.length > 2);
    assert.ok(bloco.objective.length > 5);
    assert.ok(bloco.sourceSignal.length > 3, "todo bloco declara o sinal que o sustenta");
  }

  /*
   * §8 · MUST_COVER ≠ MUST_VIDEO_BLOCK.
   *
   * Os três tópicos declarados são cobertos — e nenhum deles criou um quarto
   * bloco por decreto.
   */
  const comExigencia = model.blocks.filter(bloco => bloco.mustCoverReasons.length > 0);
  assert.ok(comExigencia.length > 0, "o ArticleDNA aparece onde o assunto foi parar");
  assert.equal(model.blocks.length, 3, "nenhum bloco novo nasceu do tópico declarado");

  const cobertura = model.blocks.flatMap(bloco => [bloco.heading, ...bloco.coveragePoints]).join(" ").toLowerCase();
  assert.match(cobertura, /prote(ç|c)(ã|a)o solar/i, "o tópico declarado é coberto em algum lugar");
});

test("G e H · sem Shorts observados não se inventa Short observado", () => {
  const model = modeloDeVideo();

  assert.equal(youtube().observed.shorts, 0, "a coleta não devolveu Short nenhum");
  assert.deepEqual(model.derived, [], "e o modelo não fabrica Shorts");

  /* §10 · com sinal, o Short entra — e ele diz de onde veio. */
  const comShort = modeloDeVideo({
    blueprint: youtube({
      recommended: {
        ...youtube().recommended,
        shorts: [{
          id: "s1", sourceSignal: "Pergunta recorrente no apoio do Google", sourceQuestion: "Pele oleosa precisa de hidratante?",
          objective: "Responder a objeção em 40 segundos", hookDirection: "Começar pela crença errada",
          suggestedAngle: "Hidratar não é o mesmo que olear", contentPromise: "Resolver a dúvida em um take",
          ctaDirection: "Encaminhar para o vídeo completo",
        }],
      },
    }),
  });
  assert.equal(comShort.derived.length, 1);
  assert.ok(comShort.derived[0].sourceSignal.length > 5, "H · todo Short recomendado tem sinal de origem");
});

test("I e J · o apoio do Google continua apoio, e a telemetria fica escondida", async () => {
  const model = modeloDeVideo();

  /* §11 · uma investigação, um blueprint audiovisual. */
  assert.equal(model.profile, "YOUTUBE");
  assert.equal(model.kind, "VIDEO");

  const tela = await montar(model);
  const visivel = visivelSemDisclosure(tela);

  /* §9 · nada de 38 vídeos, mediana, percentil, rank ou lista de canais. */
  for (const proibido of [/38/, /mediana/i, /percentil/i, /\bp25\b/i, /Canal Dermato/, /visualiza(ç|c)(õ|o)es/i]) {
    assert.equal(proibido.test(visivel), false, `"${proibido}" vazou para a leitura principal`);
  }

  /* E continua alcançável: o sinal de cada bloco vive no disclosure. */
  const evidencias = tela.all("radar-profile-block-evidence").map(item => item.textContent || "").join(" ");
  assert.match(evidencias, /Recorrente na amostra|Formato dominante/);
  tela.destroy();
});

/* ============================ §26 · AMAZON ============================ */

test("K, L e §18 · a identidade é o produto, não o slot", () => {
  const model = modeloComercial();

  /*
   * §18 · UM ASIN EM TRÊS POSIÇÕES CONTINUA SENDO UM PRODUTO.
   *
   * O sinal de posicionamento descreve placements; ele não entra no modelo
   * como três produtos — e o ASIN cru não atravessa para a leitura.
   */
  const corpo = [model.objective, model.promise, ...model.blocks.map(bloco => bloco.heading)].join(" ");
  assert.equal(/\bB0[0-9A-Z]{8}\b/.test(corpo), false, "ASIN bruto na leitura editorial");
  assert.equal(/slot/i.test(corpo), false, "slot tratado como produto");
});

test("M e §15 · sem texto de avaliação, nada de elogio ou reclamação", async () => {
  const model = modeloComercial();

  /*
   * A VARREDURA É DO QUE O MODELO AFIRMA — não do que ele declara faltar.
   *
   * "Elogios e reclamações não foram observados" é exatamente a frase que
   * PROTEGE o Redator; bani-la junto com a inferência transformaria a
   * declaração de ausência em defeito.
   */
  const afirmacoes = [
    model.objective, model.promise, model.cta || "", model.workingTitle,
    ...model.alternateTitleDirections,
    ...model.blocks.flatMap(bloco => [bloco.heading, bloco.objective, ...bloco.coveragePoints]),
    ...model.derived.map(item => item.label),
    ...model.seoApplication,
  ].join(" ").toLowerCase();

  for (const proibido of ["compradores reclamam", "elogi", "reclama", "benefício principal", "melhor produto", "marca mais confiável"]) {
    assert.equal(afirmacoes.includes(proibido), false, `"${proibido}" foi inferido sem fonte`);
  }

  /* §17 · e o nome usado é o correto. */
  const reputacao = model.derived.filter(item => /reputa(ç|c)(ã|a)o/i.test(item.detail));
  assert.ok(reputacao.length > 0, "os sinais agregados aparecem com o nome certo");
  for (const item of reputacao) {
    assert.match(item.detail, /sem texto de avalia(ç|c)(ã|a)o/i);
  }

  /* §24 · e a limitação sobe para a leitura, não fica de rodapé. */
  const tela = await montar(model);
  const visivel = visivelSemDisclosure(tela);
  assert.match(visivel, /não traz texto de avaliação/i);
  assert.match(model.readiness.label, /^Parcial · /);
  tela.destroy();
});

test("N e §16 · preço observado não vira preço recomendado", async () => {
  const model = modeloComercial();

  /* O valor exato existe na evidência; a recomendação é banda. */
  const faixas = model.derived.filter(item => /faixa/i.test(item.label));
  assert.ok(faixas.length >= 2, "as faixas observadas aparecem");
  for (const faixa of faixas) {
    assert.equal(/R\$\s?\d/.test(faixa.label), false, `"${faixa.label}" recomenda valor exato`);
  }

  const tela = await montar(model);
  const visivel = visivelSemDisclosure(tela);
  assert.equal(/R\$\s?\d+[.,]\d/.test(visivel), false, "AMAZON_EXACT_PRICE_RECOMMENDED = NO");
  tela.destroy();
});

test("O, P e Q · nada de marca inventada, e o modelo é do ArticleDNA", () => {
  const model = modeloComercial();

  assert.equal(model.articleIdentity.articleDnaVersionId, "dna-v1");
  assert.equal(model.editorialOutput, "ARTICLE_WITH_COMMERCIAL_SECTION", "§1 · o perfil não decide o formato sozinho");

  /* §20 · o apoio do Google acrescenta SEO e intenção, não fatos da prateleira. */
  assert.ok(model.seoApplication.length > 0, "o apoio entra como aplicação SEO");
  const seo = model.seoApplication.join(" ").toLowerCase();
  assert.equal(/avalia(ç|c)(ã|a)o|review|benef(í|i)cio/.test(seo), false,
    "o apoio do Google não fabrica fato exclusivo da Amazon");

  /* §21 · outro ArticleDNA, outro modelo. */
  const outro = modeloComercial({
    context: contexto({ keywords: [{ identity: { keywordId: "kw9", role: "principal", text: "protetor solar facial" } }] }),
  });
  assert.notEqual(outro.workingTitle, model.workingTitle);
});

test("R · as limitações continuam visíveis e explicam o Parcial", () => {
  const model = modeloComercial();

  assert.ok(model.limitations.length >= 2);
  assert.equal(model.readiness.state, "PARTIAL");
  assert.ok(model.readiness.reasons.length > 0, "§24 · nunca 'Parcial' sem dizer o quê");
  assert.match(model.readiness.label, /limita(ç|c)(ã|a)o/i);
});

/* ============================ §27 · UX COMUM ============================ */

test("S a V · a casca é a mesma nos dois perfis", async () => {
  for (const model of [modeloDeVideo(), modeloComercial()]) {
    const tela = await montar(model);

    /* S · o blueprint principal é conteúdo aberto, nunca um disclosure. */
    assert.ok(tela.query("radar-profile-blueprint"), "o blueprint é a superfície principal");
    assert.equal(tela.get("radar-profile-blueprint").tagName.toLowerCase(), "section");

    /* T, U e V · tudo o que é contexto nasce fechado. */
    for (const details of [...tela.container.querySelectorAll("details")]) {
      assert.equal((details as HTMLDetailsElement).open, false, "nenhum disclosure nasce aberto");
    }

    const visivel = visivelSemDisclosure(tela);
    assert.ok(visivel.includes(model.workingTitle), "título de trabalho");
    assert.ok(visivel.includes(model.promise), "promessa");
    assert.match(visivel, /Saída recomendada/);
    tela.destroy();
  }
});

test("W e §23 · nenhum identificador técnico na leitura principal", async () => {
  for (const model of [modeloDeVideo(), modeloComercial()]) {
    const tela = await montar(model);
    const texto = tela.text();

    assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(texto), false, "UUID na leitura");
    for (const proibido of ["block:", "banda:", "reputacao:", "snapshot", "runId", "endpoint"]) {
      assert.equal(texto.includes(proibido), false, `"${proibido}" vazou`);
    }
    tela.destroy();
  }
});

test("X e §22 · o handoff continua sendo o existente, sem contrato paralelo", async () => {
  const page = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
  const workbench = await readFile(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");

  /* A fronteira do Planejador continua sendo UMA, para os três perfis. */
  assert.match(workbench, /\{writerHandoff && <WriterHandoff tab=\{writerHandoff\} \/>\}/);
  assert.match(workbench, /\{writerHandoff && !areaGoogle && <WriterHandoff/);

  /* E o modelo dos perfis é derivado do blueprint canônico — não um paralelo. */
  assert.match(page, /modeloEditorialDoPerfil/);
  assert.match(page, /buildRadarEditorialVideoModel/);
  assert.match(page, /buildRadarEditorialCommercialModel/);

  const modelo = await readFile(new URL("../lib/radar/editorial-profile-model.ts", import.meta.url), "utf8");
  for (const proibido of ["youtubeSearch.universe", "amazonSearch.universe", "organicResults", "fetch("]) {
    assert.equal(modelo.includes(proibido), false, `${proibido}: o modelo duplicaria a matéria-prima`);
  }
});

test("Y e Z · a mesma evidência produz o mesmo modelo, sempre", () => {
  /*
   * O modelo é DERIVADO: nada nele depende de relógio, ordem de render ou
   * estado de tela. É isso que faz o F5 devolver o mesmo briefing, e é isso
   * que faz a leitura compacta e a completa concordarem.
   */
  const primeira = JSON.stringify(modeloDeVideo());
  const segunda = JSON.stringify(modeloDeVideo());
  assert.equal(primeira, segunda, "o roteiro-modelo é determinístico");

  const comercialA = JSON.stringify(modeloComercial());
  const comercialB = JSON.stringify(modeloComercial());
  assert.equal(comercialA, comercialB, "o modelo comercial é determinístico");
});

test("§30 · o template do Google não foi tocado", async () => {
  const google = await readFile(new URL("../lib/radar/editorial-article-model.ts", import.meta.url), "utf8");
  assert.match(google, /export function buildRadarEditorialArticleModel/);
  /* Os perfis reusam os ajudantes do Google — não os reescrevem. */
  const perfis = await readFile(new URL("../lib/radar/editorial-profile-model.ts", import.meta.url), "utf8");
  assert.match(perfis, /from "\.\/editorial-article-model\.ts"/);
  assert.equal(/function caixaEditorial\(/.test(perfis), false, "o ajudante foi copiado em vez de reusado");
});

test("sentinela · nenhuma ida ao servidor neste gate", () => {
  assert.deepEqual(idasAoServidor, []);
});
