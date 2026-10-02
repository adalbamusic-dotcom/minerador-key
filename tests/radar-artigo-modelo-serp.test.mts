import assert from "node:assert/strict";
import test from "node:test";
import {
  RADAR_ARTICLE_BLUEPRINT_DRAFT_MARK,
  RADAR_ARTICLE_BLUEPRINT_LIMITS,
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarApplyArticleBlueprintEdit,
  radarArticleBlueprintAiFailure,
  radarArticleBlueprintAiFailureMessage,
  radarArticleBlueprintColumns,
  radarArticleBlueprintMeasures,
  radarArticleBlueprintOutOfScopeMatcher,
  radarArticleBlueprintPayloadToStore,
  radarArticleBlueprintPendingNotes,
  radarArticleBlueprintPrompt,
  radarArticleBlueprintVideoSections,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintBrief,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import { radarArticleBlueprintExportChoice, readRadarArticleBlueprintsForExport } from "../lib/server/radar-article-blueprint-read.ts";
import { radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import type { RadarBrandVoice } from "../lib/radar/brand-voice.ts";
import { ARTIGO, EXPORTADO_EM, LEITURA_DAS_LENTES, entradaGoogle, montadasDoSilo, planoDoSilo } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== O ARTIGO-MODELO É PARTE DA SERP — decisão do dono, 2026-10-02 =====
 *
 * "A SERP que faz esse trabalho, a IA só ajuda a organizar, e não é para
 * escrever algo à parte." O que se prova aqui, sem IA (a resposta dela é
 * fixture) e sem banco (cliente em memória):
 *
 *   - o esqueleto da SERP vai à IA com ids M, e o tipo da unidade junto;
 *   - a voz da marca vai em trechos com teto, não o Markdown inteiro;
 *   - a resposta passa do teto e é CORTADA, não recusada;
 *   - o servidor confere a origem de cada seção, o fora do escopo (pelas
 *     palavras que o distinguem), FAQ, ids e links, e põe a autoria no E-E-A-T;
 *   - o CSV marca a proposta e, aprovada, sai como antes;
 *   - o export escolhe o aprovado do pacote vigente e, sem ele, a proposta.
 *
 * O caso real que motivou (Instagram, clínicas) está aqui como fixture, ao lado
 * de outro assunto e outro tipo de página: nenhuma regra é do caso.
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

/* ============================== as fixtures ============================== */

const esqueleto = (id: string, heading: string, extra: Partial<RadarArticleBlueprintBrief["skeleton"][number]> = {}) => ({
  id, level: 2 as const, parent: null, heading, readerQuestion: null, cover: [], mustCover: false, needsSource: false, needsSpecialist: false, outOfScope: false, ...extra,
});

/* O caso real, reduzido: artigo publicado, Suporte de um Silo, SERP de lojas para um público de clínicas. */
function pacoteDoCaso(patch: Partial<RadarArticleBlueprintBrief> = {}): RadarArticleBlueprintBrief {
  return {
    article: {
      principal: "como atrair clientes pelo instagram",
      complementary: [{ keyword: "captar clientes pela internet", role: "secundária", volume: 90 }],
      subject: null, intent: "Informacional", funnel: "Topo", siloRole: "Suporte",
      audience: "Donas de clínicas de estética", promise: null,
      slug: "instagram-nao-traz-pacientes", publishedUrl: "https://exemplo.com.br/instagram-nao-traz-pacientes",
      mustCover: [], unit: { type: "article", label: "Artigo", format: null },
    },
    silo: null,
    skeleton: [
      esqueleto("M1", "Por que o perfil não traz pacientes", { readerQuestion: "Por que meu Instagram não traz clientes?", mustCover: true }),
      esqueleto("M2", "Bio e destaques", { level: 3, parent: "M1" }),
      esqueleto("M3", "Ative o Instagram Shopping", { outOfScope: true }),
      esqueleto("M4", "Stories que convertem"),
      esqueleto("M5", "Anúncios pagos"),
    ],
    skeletonFrame: { workingTitle: "Como o que considerar sobre stories para atrair clientes", promise: null, closing: null },
    evidence: [
      { id: "P1", kind: "pergunta da amostra", text: "Como atrair clientes pelo Instagram? (6 de 10 páginas)" },
      { id: "C1", kind: "conceito da amostra", text: "frequência de postagem (5 de 10 páginas)" },
      { id: "S1", kind: "resultado orgânico", text: "Loja virtual · https://loja.exemplo/blog/instagram" },
    ],
    linkCandidates: [{ id: "K1", label: "marketing para clínicas", role: "Pilar", destination: "/marketing-para-clinicas", status: "PLANNED", fromGraph: true }],
    graphLinks: [], sources: [], unsupportedClaims: [], specialist: [], videos: [],
    outOfScope: ["Ative o Instagram Shopping"],
    competitorTitles: ["Como atrair clientes pelo Instagram: 10 dicas"],
    measures: radarArticleBlueprintMeasures([]),
    authors: [{ name: "Dra. Ana Lima", specialty: "Biomedicina estética", source: "contribution" }],
    brandVoice: null,
    ...patch,
  };
}

const secaoCrua = (h2: string, extra: Record<string, unknown> = {}) => ({ h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta.", ...extra });

function respostaCrua(patch: Record<string, unknown> = {}) {
  return {
    keywordPlan: { reading: "A principal no H1; a secundária na seção de diagnóstico." },
    reader: "Dona de clínica de estética.", promise: "Uma agenda que vem do perfil.", angle: { statement: "O perfil é vitrine de agenda.", evidence: ["P1"] },
    title: { h1: "Como atrair clientes pelo Instagram: o que muda na agenda", seoTitle: "Como atrair clientes pelo Instagram", metaDescription: "O que fazer no perfil para virar agenda." },
    opening: { readerQuestion: "Como atrair clientes pelo Instagram?", direction: "Responder em duas frases.", evidence: ["P1"] },
    sections: [
      secaoCrua("Por que o perfil não traz pacientes", { from: ["M1", "M2"], internalLinks: [{ candidate: "K1", anchor: "marketing para clínicas", reason: "Suporte devolve ao Pilar" }] }),
      secaoCrua("Stories que convertem", { from: ["M4", "M99"], h3: ["Perguntas frequentes sobre stories", "Roteiro de três stories"] }),
      secaoCrua("Frequência de postagem", { from: ["C1"] }),
      secaoCrua("Como prospectar com o Instagram Shopping", { from: ["M3"] }),
      secaoCrua("Parcerias com influenciadoras", { from: [] }),
    ],
    discarded: [{ id: "M5", reason: "anúncio pago é outro artigo do Silo" }, { id: "M77", reason: "não existe" }],
    closing: { turn: "Constância vira agenda.", cta: "Fale com a equipe." },
    visual: [{ slot: "CAPA", prompt: "consultório iluminado, celular na mão" }, { slot: "R1", section: "Stories que convertem", prompt: "mão gravando story" }],
    ...patch,
  };
}

/* ============================== o esqueleto e o pedido ============================== */

test("o esqueleto da SERP vai à IA com ids M, sem FAQ, com o tipo da unidade e quem assina", () => {
  const brief = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle({ authors: [{ name: "Dra. Ana Souza", specialty: "Dermatologia", source: "contribution" }] }), silo: planoDoSilo().files[0].writing!, articleId: ARTIGO, publication: null });
  assert.ok(brief.skeleton.length > 0, "o modelo editorial da SERP vira esqueleto");
  assert.deepEqual(brief.skeleton.map(item => item.id), brief.skeleton.map((_, indice) => `M${indice + 1}`), "ids M em sequência");
  assert.ok(brief.skeleton.every(item => !/perguntas frequentes|\bfaq\b/i.test(item.heading)), "FAQ não chega à IA");
  assert.equal(brief.article.unit.label, "Artigo");
  assert.deepEqual(brief.authors, [{ name: "Dra. Ana Souza", specialty: "Dermatologia", source: "contribution" }]);

  const { system, user } = radarArticleBlueprintPrompt(brief);
  assert.match(system, /ORGANIZE O ESQUELETO: cada seção diz de onde vem no campo "from"/);
  assert.match(system, /Sem seção de perguntas frequentes/);
  assert.match(system, /14\. TIPO DA UNIDADE: a planta segue o tipo \(aqui: Artigo/);
  assert.match(user, /# Esqueleto da SERP \(o ponto de partida: organize e cite pelo id M\)/);
  assert.match(user, new RegExp(`${brief.skeleton[0].id} · H2 · `));
  assert.match(user, /Quem assina \(E-E-A-T\): Dra\. Ana Souza \(Dermatologia\)/);
  assert.match(user, /"from":\["M1","P2"\]/, "o formato pede a origem");
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(user), false, "nenhum endereço interno vai à IA");

  /* Sem autoria lida, nada muda; com lista vazia, o pedido diz que falta definir. */
  assert.equal(buildRadarArticleBlueprintBrief({ entrada: entradaGoogle(), silo: null, articleId: ARTIGO, publication: null }).authors, null);
  const semEspecialista = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle({ authors: [] }), silo: null, articleId: ARTIGO, publication: null });
  assert.match(radarArticleBlueprintPrompt(semEspecialista).user, /Quem assina \(E-E-A-T\): nenhum especialista definido na aba Especialista/);
});

test("o tipo da unidade manda na forma: SiloPage, landing page e roteiro de vídeo", () => {
  const base = entradaGoogle();
  const tipo = (contentType: string) => buildRadarArticleBlueprintBrief({ entrada: { ...base, article: { ...base.article, contentType } }, silo: null, articleId: ARTIGO, publication: null });
  assert.equal(tipo("silo_page").article.unit.label, "SiloPage (página de entrada do Silo)");
  const landing = tipo("landing_page");
  assert.equal(landing.article.unit.label, "landing page");
  assert.match(radarArticleBlueprintPrompt(landing).system, /aqui: landing page/);
  assert.match(radarArticleBlueprintPrompt(landing).user, /^# Unidade\nTipo: landing page/);
  assert.match(radarArticleBlueprintPrompt(landing).system, /landing page ou página de serviço traz problema, oferta, prova, objeções e CTA/);
});

test("as perguntas: retórica de fecho e assunto fora do escopo não chegam à IA (qualquer assunto)", () => {
  const base = entradaGoogle();
  const observado = base.googleObserved!;
  const modelo = base.articleModel!;
  const pergunta = (canonicalQuestion: string) => ({ ...(observado.questions[0] || {}), canonicalQuestion, status: "MARKET_QUESTION_UNDERCOVERED", pages: 11, sampleSize: 12, declaredByArticle: false, evidence: "" });
  const entrada = entradaGoogle({
    googleObserved: { ...observado, questions: [...observado.questions, pergunta("Aprendeu como montar sua rotina de skincare facial?"), pergunta("Como usar ácidos importados de skincare coreano no skincare facial?"), pergunta("Quanto tempo leva para ver resultado do skincare facial?")] } as never,
    articleModel: { ...modelo, candidates: [...modelo.candidates, { id: "cand-fora", observedLabel: "Use o skincare coreano importado", pages: 3, sampleSize: 12, dnaAligned: false, dnaRequired: false, intentFit: false, verdict: "OUT_OF_SCOPE", reason: "Fora do recorte do artigo.", sectionId: null }] } as never,
  });
  const brief = buildRadarArticleBlueprintBrief({ entrada, silo: null, articleId: ARTIGO, publication: null });
  const perguntas = brief.evidence.filter(item => item.id.startsWith("P")).map(item => item.text);
  assert.ok(perguntas.some(item => /Quanto tempo leva/.test(item)), "a pergunta do assunto entra");
  assert.equal(perguntas.some(item => /^Aprendeu/.test(item)), false, "fecho retórico de concorrente fica fora");
  assert.equal(perguntas.some(item => /coreano/.test(item)), false, "pergunta que toca o fora do escopo fica fora");
  assert.ok(brief.outOfScope.includes("Use o skincare coreano importado"));
});

test("o fora do escopo pelas palavras que o distinguem do artigo — Instagram, odontologia, qualquer assunto", () => {
  const instagram = radarArticleBlueprintOutOfScopeMatcher(["Ative o Instagram Shopping"], ["como atrair clientes pelo instagram"]);
  assert.equal(instagram("Como prospectar clientes pelo Instagram com o Instagram Shopping"), true, "a frase inteira não aparece, o assunto sim");
  assert.equal(instagram("Ative o Instagram Shopping"), true);
  assert.equal(instagram("Como atrair clientes pelo Instagram"), false, "o núcleo do artigo nunca é fora do escopo");
  assert.equal(instagram("Instagram"), false, "uma palavra do núcleo sozinha não basta");

  const implante = radarArticleBlueprintOutOfScopeMatcher(["Preço do implante dentário"], ["implante dentário"]);
  assert.equal(implante("Quanto custa? Preço médio do implante"), true);
  assert.equal(implante("Como é a cirurgia de implante dentário"), false);

  assert.equal(radarArticleBlueprintOutOfScopeMatcher([], ["qualquer"])("qualquer coisa"), false, "sem rótulo, nada é fora do escopo");
});

test("a voz da marca vai em trechos por assunto, com teto — não o Markdown inteiro", () => {
  const longo = (marca: string) => `${"Texto da marca. ".repeat(400)}${marca}`;
  const secoes = [
    { heading: "1. Missão", body: longo("FIM-DA-MISSAO") },
    { heading: "4. Voz: firme e humana", body: longo("FIM-DA-VOZ") },
    { heading: "10. Recursos antigos ou inadequados", body: "Não recomendar recurso descontinuado." },
    { heading: "11. Construção do artigo e transição comercial", body: "CTA: agende uma avaliação." },
    { heading: "13. Plano visual", body: "Uma capa e dois ou três respiros." },
  ];
  const voz: RadarBrandVoice = {
    versionId: "voz-v2", version: 2, name: "Marca X", contentHash: "sha256:x", status: "draft", title: "Marca X",
    sections: secoes, markdown: secoes.map(secao => `## ${secao.heading}\n\n${secao.body}`).join("\n\n"),
  };
  assert.ok(voz.markdown.length > 12_000, "a Skill da fixture é grande como a real");
  const brief = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle(), silo: null, articleId: ARTIGO, publication: null, brandVoice: voz });
  const titulos = brief.brandVoice!.excerpts.map(item => item.title);
  assert.deepEqual(titulos, ["CTA, oferta e transição comercial", "Voz, vocabulário e títulos", "O que não fazer", "Plano visual"]);
  assert.match(brief.brandVoice!.excerpts[0].text, /^Construção do artigo e transição comercial:\nCTA: agende/, "o que fala de CTA vem na frente");
  const limites = RADAR_ARTICLE_BLUEPRINT_LIMITS.voiceChars;
  assert.ok(brief.brandVoice!.excerpts.every(item => item.text.length <= Math.max(limites.cta, limites.voice)), "cada trecho tem teto");
  const { user } = radarArticleBlueprintPrompt(brief);
  assert.match(user, /# Voz da marca — Skill "Marca X" v2 \(em rascunho na Marca\)\. Trechos por assunto/);
  assert.match(user, /## O que não fazer\nRecursos antigos ou inadequados:\nNão recomendar recurso descontinuado\./);
  assert.equal(/FIM-DA-MISSAO|FIM-DA-VOZ/.test(user), false, "o resto do Markdown não vai");
  const tamanhoDaVoz = brief.brandVoice!.excerpts.reduce((soma, item) => soma + item.text.length, 0);
  assert.ok(tamanhoDaVoz <= limites.cta + limites.voice + limites.avoid + limites.visual);
});

/* ============================== a resposta compacta ============================== */

test("o esquema da resposta corta o que passa do teto e normaliza ids, em vez de recusar a chamada paga", () => {
  const L = RADAR_ARTICLE_BLUEPRINT_LIMITS;
  const ai = RadarArticleBlueprintAiSchema.parse(respostaCrua({
    title: { h1: `Como atrair clientes pelo Instagram ${"muito ".repeat(60)}`, seoTitle: "SEO", metaDescription: "Meta." },
    sections: [
      secaoCrua("Seção A", { from: ["M1 (Por que o perfil)", "P1,"], h3: ["1", "2", "3", "4", "5", "6"], explain: ["a", "", "b", "c", "d"], paragraphs: "40", evidence: ["S1 (resultado)"] }),
      ...Array.from({ length: 11 }, (_, indice) => secaoCrua(`Seção ${indice + 2}`, { from: ["M4"] })),
    ],
    visual: [{ slot: "CAPA", prompt: "x".repeat(900), alt: "", caption: null }],
    eeat: ["", "Autor real."],
  }));
  assert.equal(ai.title.h1.length, L.shortChars, "texto cortado no teto, com reticências");
  assert.deepEqual(ai.sections[0].from, ["M1", "P1"], "o id é o primeiro pedaço");
  assert.deepEqual(ai.sections[0].evidence, ["S1"]);
  assert.equal(ai.sections[0].h3.length, L.h3);
  assert.deepEqual(ai.sections[0].explain, ["a", "b", "c"], "item vazio sai, o resto até o teto");
  assert.equal(ai.sections[0].paragraphs, 12, "número fora da faixa vira o teto");
  assert.equal(ai.visual[0].prompt.length, L.imagePromptChars);
  assert.equal(ai.visual[0].alt, "", "campo que só explica pode vir vazio");
  assert.deepEqual(ai.eeat, ["Autor real."]);
  assert.equal(ai.sections.length, 12, "o esquema guarda até 12; o servidor corta em 8, com aviso");

  const { payload, notes } = radarSanitizeArticleBlueprint(ai, pacoteDoCaso());
  assert.equal(payload.blueprint.sections.length, L.sections);
  assert.ok(notes.some(nota => /A IA propôs 12 seções; ficaram as 8 primeiras/.test(nota)));
  /* O que não tem forma nenhuma continua recusado. */
  assert.throws(() => RadarArticleBlueprintAiSchema.parse({ ...respostaCrua(), sections: [] }));
});

/*
 * 2026-10-02 · revisão da frente: formas comuns da resposta que têm leitura
 * única são NORMALIZADAS, não recusadas — `null` onde cabia lista, texto solto
 * onde cabia lista ou objeto, ids numa frase só, número onde cabia texto,
 * "Respiro 1" no lugar de "R1", item de lista sem forma. O que decide a planta
 * e não veio continua recusado (o teste acima prova `sections: []`).
 */
test("o esquema normaliza as formas comuns da resposta da IA em vez de recusar a chamada paga", () => {
  const ai = RadarArticleBlueprintAiSchema.parse(respostaCrua({
    keywordPlan: null,
    angle: "O perfil é vitrine de agenda.",
    opening: "Como atrair clientes pelo Instagram?",
    sections: [
      secaoCrua("Seção A", { from: "M1, P1", h3: "Bio que converte", evidence: null, explain: [{ text: "Explique a bio." }, 3], specialist: ["E1"], internalLinks: [{ candidate: null, anchor: "sem destino" }, { candidate: "K1", anchor: "marketing para clínicas" }], externalLinks: null }),
      secaoCrua("Seção B", { from: ["M4"], bold: "frequência", terms: null }),
      secaoCrua("Seção C", { evidence: "C1" }),
    ],
    discarded: null,
    visual: [{ slot: "capa", prompt: "consultório" }, { slot: "Respiro 1", prompt: "celular" }, { slot: "respiro-2", prompt: "agenda" }, { slot: "R3" }],
    eeat: "Autor real.",
    warnings: null,
  }));
  assert.deepEqual(ai.keywordPlan, { reading: "", principalPlacement: [], complementary: [], slugNote: null }, "plano de keywords ausente vira vazio");
  assert.equal(ai.angle.statement, "O perfil é vitrine de agenda.");
  assert.equal(ai.opening.readerQuestion, "Como atrair clientes pelo Instagram?");
  const [a, b, c] = ai.sections;
  assert.deepEqual(a.from, ["M1", "P1"], "ids numa frase só");
  assert.deepEqual(a.h3, ["Bio que converte"], "texto solto onde cabia lista");
  assert.deepEqual(a.evidence, []);
  assert.deepEqual(a.explain, ["Explique a bio.", "3"]);
  assert.equal(a.specialist, "E1");
  assert.deepEqual(a.internalLinks.map(link => link.candidate), ["K1"], "o link sem destino sai sozinho; o resto fica");
  assert.deepEqual(a.externalLinks, []);
  assert.deepEqual(b.bold, ["frequência"]);
  assert.deepEqual(c.evidence, ["C1"]);
  assert.equal(c.from, undefined, "sem origem informada continua ausente (versão sem origem)");
  assert.deepEqual(ai.discarded, [], "null é nada descartado");
  assert.deepEqual(ai.visual.map(item => item.slot), ["CAPA", "R1", "R2"], "vaga normalizada; a sem prompt sai");
  assert.deepEqual(ai.eeat, ["Autor real."]);
  /* Normalizada, a resposta passa pelo servidor como qualquer outra. */
  const { payload } = radarSanitizeArticleBlueprint(ai, pacoteDoCaso());
  assert.equal(payload.blueprint.sections.length, 3);
  assert.equal(payload.measures.plan.respites, 2);
  /* O que decide a planta e não veio continua recusado. */
  assert.throws(() => RadarArticleBlueprintAiSchema.parse(respostaCrua({ title: { seoTitle: "SEO", metaDescription: "Meta." } })), "sem H1 não há planta");
  assert.throws(() => RadarArticleBlueprintAiSchema.parse(respostaCrua({ closing: "Fale com a equipe." })), "fecho sem virada e CTA não se adivinha");
});

/* ============================== o saneamento ============================== */

test("o servidor confere a origem de cada seção na SERP, o fora do escopo, FAQ, descarte e autoria", () => {
  const brief = pacoteDoCaso();
  const { payload, notes } = radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(respostaCrua()), brief);
  const secoes = payload.blueprint.sections;
  assert.deepEqual(secoes.map(item => item.h2), ["Por que o perfil não traz pacientes", "Stories que convertem", "Frequência de postagem", "Parcerias com influenciadoras"]);
  assert.ok(notes.some(nota => /"Como prospectar com o Instagram Shopping" removida: o pacote marca o assunto como fora do escopo/.test(nota)));

  /* Origem: id inexistente sai; evidência vale como origem; sem origem nenhuma, aviso para o dono. */
  assert.deepEqual(secoes[1].from, ["M4"]);
  assert.ok(notes.some(nota => /"Stories que convertem": 1 origem\(ns\) com id inexistente removida/.test(nota)));
  assert.deepEqual(secoes[2].from, ["C1"]);
  assert.deepEqual(secoes[3].from, []);
  assert.ok(notes.some(nota => /"Parcerias com influenciadoras" não diz de onde vem na SERP/.test(nota)), "seção sem origem fica, com aviso");

  /* FAQ sai também do H3. */
  assert.deepEqual(secoes[1].h3, ["Roteiro de três stories"]);
  assert.ok(notes.some(nota => /H3 de FAQ ou fora do escopo removido/.test(nota)));

  /* Descarte: o que existe e não foi usado; id inventado é ignorado; o fora do escopo entra mesmo sem a IA dizer. */
  assert.deepEqual(payload.blueprint.discarded, [{ id: "M5", reason: "anúncio pago é outro artigo do Silo" }, { id: "M3", reason: "fora do escopo do pacote" }]);
  assert.ok(notes.some(nota => /Descarte: 1 id\(s\) que não existem/.test(nota)));
  assert.equal(notes.some(nota => /não usou nem descartou/.test(nota)), false, "H3 de um H2 usado conta como usado");

  /* Autoria (E-E-A-T) do especialista da aba Especialista; plano visual com um respiro só é dito. */
  assert.match(payload.blueprint.eeat[0], /^Autoria: Dra\. Ana Lima \(Biomedicina estética\), especialista da aba Especialista/);
  assert.ok(notes.some(nota => /Plano visual com 1 respiro\(s\): a regra pede dois ou três/.test(nota)));
  assert.deepEqual(payload.skeleton, brief.skeleton, "o esqueleto fica na versão, para a tela e o CSV");
  assert.deepEqual(payload.unit, brief.article.unit);
});

test("o servidor avisa H1 sem a principal, abertura de outro assunto e seção do esqueleto esquecida", () => {
  const brief = pacoteDoCaso({ authors: [] });
  const ai = RadarArticleBlueprintAiSchema.parse(respostaCrua({
    title: { h1: "Como o que considerar sobre stories para atrair clientes", seoTitle: "SEO", metaDescription: "Meta." },
    opening: { readerQuestion: "Como captar clientes pela internet?", direction: "Responder." },
    discarded: [],
  }));
  const { payload, notes } = radarSanitizeArticleBlueprint(ai, brief);
  assert.ok(notes.some(nota => /O H1 não traz a keyword principal inteira \("como atrair clientes pelo instagram"\)/.test(nota)));
  assert.ok(notes.some(nota => /A pergunta da abertura \("Como captar clientes pela internet\?"\) não fala da keyword principal/.test(nota)));
  assert.ok(notes.some(nota => /não usou nem descartou 1 seção\(ões\) do esqueleto da SERP \(M5 "Anúncios pagos"\)/.test(nota)));
  assert.match(payload.blueprint.eeat[0], /^Autoria: nenhum especialista definido na aba Especialista/);

  /* Sem autoria lida, o E-E-A-T é o da IA. */
  const semLeitura = radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(respostaCrua({ eeat: ["Autor real."] })), pacoteDoCaso({ authors: null }));
  assert.deepEqual(semLeitura.payload.blueprint.eeat, ["Autor real."]);
});

test("outro assunto e outro tipo: página de serviço odontológica segue as mesmas regras", () => {
  const brief = pacoteDoCaso({
    article: { ...pacoteDoCaso().article, principal: "implante dentário", complementary: [], siloRole: "Pilar", unit: { type: "landing_page", label: "landing page", format: null } },
    skeleton: [esqueleto("M1", "O que é implante dentário"), esqueleto("M2", "Quanto custa o implante", { outOfScope: true }), esqueleto("M3", "Como é a cirurgia")],
    outOfScope: ["Preço do implante dentário"],
    evidence: [{ id: "P1", kind: "pergunta da amostra", text: "Implante dentário dói?" }],
    linkCandidates: [], authors: null, competitorTitles: [],
  });
  const ai = RadarArticleBlueprintAiSchema.parse(respostaCrua({
    title: { h1: "Implante dentário: como funciona e quem pode fazer", seoTitle: "Implante dentário", metaDescription: "Meta." },
    opening: { readerQuestion: "Como funciona o implante dentário?", direction: "Responder." },
    sections: [
      secaoCrua("O que é implante dentário", { from: ["M1"] }),
      secaoCrua("Como é a cirurgia", { from: ["M3"] }),
      secaoCrua("Implante dentário dói?", { from: ["P1"] }),
      secaoCrua("Quanto custa? Preço médio do implante", { from: ["M2"] }),
    ],
    discarded: [],
  }));
  const { payload, notes } = radarSanitizeArticleBlueprint(ai, brief);
  assert.deepEqual(payload.blueprint.sections.map(item => item.h2), ["O que é implante dentário", "Como é a cirurgia", "Implante dentário dói?"]);
  assert.deepEqual(payload.blueprint.discarded, [{ id: "M2", reason: "fora do escopo do pacote" }]);
  assert.equal(notes.some(nota => /H1 não traz|abertura .* não fala/.test(nota)), false);
  assert.match(radarArticleBlueprintColumns(payload).estrutura, /\nTipo da unidade: landing page\.\n/);
});

test("a falha da IA vira frase clara; só corte, formato e resposta vazia pedem nova tentativa", () => {
  assert.equal(radarArticleBlueprintAiFailure({ code: "AI_OUTPUT_INVALID", finishReason: "length" }), "CUT");
  assert.equal(radarArticleBlueprintAiFailure({ code: "AI_OUTPUT_INVALID", finishReason: "stop" }), "FORMAT");
  assert.equal(radarArticleBlueprintAiFailure({ code: "AI_PROVIDER_INVALID_RESPONSE", finishReason: null }), "EMPTY");
  assert.equal(radarArticleBlueprintAiFailure({ code: "AI_TIMEOUT", finishReason: null }), null, "tempo esgotado não se repete");
  assert.equal(radarArticleBlueprintAiFailure({ code: "AI_QUOTA_EXCEEDED", finishReason: null }), null);
  const corte = radarArticleBlueprintAiFailureMessage("CUT", 2);
  assert.match(corte, /^A resposta da IA veio cortada \(passou do tamanho máximo\), mesmo depois de 1 nova tentativa/);
  assert.match(corte, /a investigação continua finalizada/);
  for (const falha of ["CUT", "FORMAT", "EMPTY"] as const) assert.doesNotMatch(radarArticleBlueprintAiFailureMessage(falha, 1), /JSON/i);
});

/* ============================== as colunas do CSV ============================== */

const payloadDoCaso = () => radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(respostaCrua()), pacoteDoCaso()).payload;

test("CSV: a proposta da IA sai marcada em cada coluna; aprovada, sai como antes", () => {
  const payload = payloadDoCaso();
  const proposta = radarArticleBlueprintColumns({ ...payload, approval: "DRAFT" });
  assert.ok(proposta.estrutura.startsWith(`${RADAR_ARTICLE_BLUEPRINT_DRAFT_MARK}. A SERP montou o esqueleto e a IA organizou`));
  assert.equal(RADAR_ARTICLE_BLUEPRINT_DRAFT_MARK, "PROPOSTA DA IA — aguardando aprovação no Radar (Pesquisa → Artigo-modelo da SERP)");
  for (const coluna of ["promessa_e_leitor", "titulo_e_seo", "links_internos", "plano_visual"] as const) {
    assert.ok(proposta[coluna].startsWith("PROPOSTA DA IA — aguardando aprovação no Radar.\n"), coluna);
  }
  assert.equal(proposta.estrutura.includes("ARTIGO-MODELO APROVADO"), false);

  const aprovado = radarArticleBlueprintColumns({ ...payload, approval: "APPROVED" });
  assert.ok(aprovado.estrutura.startsWith("ARTIGO-MODELO APROVADO (planta do artigo ideal; a redação é de quem escreve)."));
  assert.equal(JSON.stringify(aprovado).includes("PROPOSTA DA IA"), false, "aprovado, a marca some");
  assert.deepEqual(radarArticleBlueprintColumns(payload), aprovado, "sem estado informado, o texto é o do aprovado — como antes");

  /* A origem na SERP e o descarte, só em versões que os têm. */
  assert.match(aprovado.estrutura, /## Por que o perfil não traz pacientes\n- Pergunta do leitor: [^\n]*\n- Vem do esqueleto da SERP: M1 "Por que o perfil não traz pacientes"; M2 "Bio e destaques"\n/);
  assert.match(aprovado.estrutura, /## Parcerias com influenciadoras\n- Pergunta do leitor: [^\n]*\n- Vem da SERP: origem não indicada \(a IA acrescentou sem evidência; confira\)\n/);
  assert.match(aprovado.estrutura, /\nDescartado do esqueleto da SERP: M5 "Anúncios pagos" \(anúncio pago é outro artigo do Silo\); M3 "Ative o Instagram Shopping" \(fora do escopo do pacote\)\.\n/);
  assert.match(aprovado.estrutura, /E-E-A-T: Autoria: Dra\. Ana Lima/);

  const antiga = structuredClone(payload) as RadarArticleBlueprintPayload;
  for (const secao of antiga.blueprint.sections) delete secao.from;
  delete antiga.blueprint.discarded;
  delete antiga.skeleton;
  delete antiga.unit;
  assert.equal(/Vem d|Descartado do esqueleto|Tipo da unidade/.test(radarArticleBlueprintColumns(antiga).estrutura), false, "versão anterior sai como antes");
});

test("CSV: campo que veio vazio não deixa rótulo solto", () => {
  const payload = payloadDoCaso();
  const vazio = structuredClone(payload) as RadarArticleBlueprintPayload;
  vazio.blueprint.keywordPlan = { reading: "", principalPlacement: [], complementary: [{ keyword: "captar clientes pela internet", placement: "", reason: "" }], slugNote: null };
  vazio.blueprint.opening = { ...vazio.blueprint.opening, direction: "" };
  vazio.blueprint.sections[0] = {
    ...vazio.blueprint.sections[0],
    internalLinks: [{ candidate: "K1", anchor: "marketing para clínicas", reason: "" }],
    externalLinks: [{ claim: "Postar com frequência aumenta o alcance.", sourceType: "", source: null }],
  };
  vazio.blueprint.visual = [{ slot: "CAPA", section: null, concept: "", prompt: "consultório", alt: "", caption: "" }];
  const colunas = radarArticleBlueprintColumns(vazio);
  assert.doesNotMatch(colunas.estrutura, /^Keywords: $/m);
  assert.match(colunas.estrutura, /^Keywords:\n- captar clientes pela internet$/m, "a lista fica, sem seta nem parênteses vazios");
  assert.match(colunas.estrutura, /^Abertura: responder "[^"]+" no primeiro parágrafo( \[|$)/m);
  assert.doesNotMatch(colunas.estrutura, / — $| — \[|\(\)|→ \(|fonte a obter \(\)/m);
  assert.match(colunas.estrutura, /- Link externo: Postar com frequência aumenta o alcance\. → fonte a obter$/m);
  assert.doesNotMatch(colunas.links_internos, /por quê: $/m);
  assert.match(colunas.links_internos, /onde: seção "Por que o perfil não traz pacientes"$/m);
  assert.equal(colunas.plano_visual, "Plano visual: 1 imagem(ns).\nCapa\n  Prompt: consultório");
  /* Com os campos preenchidos, o texto é o de antes. */
  const cheio = structuredClone(payload) as RadarArticleBlueprintPayload;
  cheio.blueprint.visual = [{ slot: "CAPA", section: null, concept: "agenda cheia", prompt: "consultório", alt: "Consultório com agenda", caption: "A agenda vem do perfil" }];
  assert.equal(radarArticleBlueprintColumns(cheio).plano_visual, "Plano visual: 1 imagem(ns).\nCapa · agenda cheia\n  Prompt: consultório\n  ALT: Consultório com agenda\n  Legenda: A agenda vem do perfil");
});

test("CSV: a proposta leva as pendências que o servidor achou; a aprovada sai como antes", () => {
  const brief = pacoteDoCaso({ authors: [] });
  const ai = RadarArticleBlueprintAiSchema.parse(respostaCrua({
    title: { h1: "Como o que considerar sobre stories para atrair clientes", seoTitle: "SEO", metaDescription: "Meta." },
    opening: { readerQuestion: "Como captar clientes pela internet?", direction: "Responder." },
    discarded: [],
  }));
  const { payload, notes } = radarSanitizeArticleBlueprint(ai, brief);
  const proposta = radarArticleBlueprintColumns({ ...payload, approval: "DRAFT", validation: notes, origin: "ai" }).estrutura;
  const linhas = proposta.split("\n");
  assert.ok(linhas[0].startsWith(RADAR_ARTICLE_BLUEPRINT_DRAFT_MARK));
  assert.equal(linhas[1], "Pendências da proposta (o servidor conferiu a resposta da IA contra o pacote):");
  for (const pendencia of [/O H1 não traz a keyword principal inteira/, /A pergunta da abertura .* não fala da keyword principal/, /"Parcerias com influenciadoras" não diz de onde vem na SERP/, /Plano visual com 1 respiro\(s\): a regra pede dois ou três/, /não usou nem descartou 1 seção/]) {
    assert.ok(linhas.some(linha => linha.startsWith("- ") && pendencia.test(linha)), `pendência ausente: ${pendencia}`);
  }
  assert.ok(!linhas.some(linha => /^- .*removida/.test(linha)), "correção já aplicada não é pendência");
  assert.match(proposta, /\nOutras \d+ nota\(s\) da conferência são correções já aplicadas pelo servidor ou registro \(ver no Radar\)\.\n/);

  /* Edição do dono: a pendência pode já estar resolvida, e o CSV diz isso. */
  assert.match(radarArticleBlueprintColumns({ ...payload, approval: "DRAFT", validation: notes, origin: "human_edit" }).estrutura, /\nPendências da proposta \(achadas na resposta da IA; a edição do dono pode já ter resolvido alguma — confira\):\n/);
  /* Aprovada, ou proposta sem as notas lidas: como antes. */
  assert.doesNotMatch(radarArticleBlueprintColumns({ ...payload, approval: "APPROVED", validation: notes }).estrutura, /Pendências da proposta/);
  assert.equal(radarArticleBlueprintColumns({ ...payload, approval: "DRAFT" }).estrutura, radarArticleBlueprintColumns({ ...payload, approval: "DRAFT", validation: [] }).estrutura);
  assert.doesNotMatch(radarArticleBlueprintColumns({ ...payload, approval: "DRAFT" }).estrutura, /Pendências da proposta/);
  /* Nada disso vai ao banco. */
  const guardado = radarArticleBlueprintPayloadToStore({ ...payload, approval: "DRAFT", validation: notes, origin: "ai" });
  assert.equal("validation" in guardado || "origin" in guardado || "approval" in guardado, false);
  assert.deepEqual(radarArticleBlueprintPendingNotes(["Seção \"X\" removida: FAQ não integra o fluxo.", "Falta o link para o Pilar (Y)."]), { pending: ["Falta o link para o Pilar (Y)."], corrected: 1 });
});

test("CSV para escrever: a proposta vai na linha do artigo, marcada; o bloco de vídeos não a chama de aprovada", () => {
  const plano = planoDoSilo();
  const brief = buildRadarArticleBlueprintBrief({ entrada: entradaGoogle(), silo: plano.files[0].writing!, articleId: ARTIGO, publication: null });
  const ai = RadarArticleBlueprintAiSchema.parse(respostaCrua({
    title: { h1: "Skincare facial: a rotina que funciona", seoTitle: "Skincare facial", metaDescription: "Meta." },
    opening: { readerQuestion: "Como montar uma rotina de skincare facial?", direction: "Responder." },
    sections: brief.skeleton.slice(0, 3).map(item => secaoCrua(item.heading, { from: [item.id] })).concat(brief.skeleton.length < 3 ? [secaoCrua("Rotina da manhã", { from: [brief.evidence[0].id] }), secaoCrua("Rotina da noite", { from: [brief.evidence[0].id] })] : []),
    discarded: [],
  }));
  const { payload } = radarSanitizeArticleBlueprint(ai, brief);
  const com = (approval: "DRAFT" | "APPROVED") => radarPortableWritingExport({
    articles: montadasDoSilo().map(item => item.articleId === ARTIGO ? { ...item, blueprint: { ...payload, approval } } : item),
    lenses: LEITURA_DAS_LENTES, plan: plano, today: EXPORTADO_EM,
  }).files![0].csv;
  const proposta = com("DRAFT");
  assert.ok(proposta.includes(RADAR_ARTICLE_BLUEPRINT_DRAFT_MARK));
  assert.equal(proposta.includes("ARTIGO-MODELO APROVADO"), false);
  const aprovado = com("APPROVED");
  assert.ok(aprovado.includes("ARTIGO-MODELO APROVADO"));
  assert.equal(aprovado.includes("PROPOSTA DA IA"), false);

  assert.equal(radarArticleBlueprintVideoSections({ ...payload, videos: [], approval: "DRAFT" }, { title: "x", url: null }), null, "a proposta não é o artigo-modelo aprovado");
  assert.deepEqual(radarArticleBlueprintVideoSections({ ...payload, videos: [], approval: "APPROVED" }, { title: "x", url: null }), []);
});

test("a marca de aprovação nunca vai ao banco: gravar e editar a tiram", () => {
  const payload = payloadDoCaso();
  const marcado: RadarArticleBlueprintPayload = { ...payload, approval: "DRAFT" };
  assert.equal("approval" in radarArticleBlueprintPayloadToStore(marcado), false);
  assert.equal(radarArticleBlueprintPayloadToStore(payload), payload, "sem marca, o mesmo objeto");
  const editado = radarApplyArticleBlueprintEdit(marcado, { title: { h1: "Como atrair clientes pelo Instagram sem anúncio" } });
  assert.equal("approval" in editado, false);
  assert.deepEqual(editado.blueprint.sections.map(item => item.from), payload.blueprint.sections.map(item => item.from), "a edição preserva a origem");
});

/* ============================== a leitura do export ============================== */

test("export: o aprovado mais novo do pacote vigente; sem ele, a proposta mais nova; outro pacote não vale", () => {
  const hashes = new Map([["a1", "h1"], ["a2", "h2"], ["a3", "h3"]]);
  const escolha = radarArticleBlueprintExportChoice([
    { id: "v1", articleId: "a1", bundleHash: "h1", versionNumber: 1, state: "APPROVED" },
    { id: "v2", articleId: "a1", bundleHash: "h1", versionNumber: 2, state: "DRAFT" },
    { id: "v3", articleId: "a2", bundleHash: "h2", versionNumber: 3, state: "DRAFT" },
    { id: "v4", articleId: "a2", bundleHash: "h2", versionNumber: 4, state: "DRAFT" },
    { id: "v5", articleId: "a3", bundleHash: "velho", versionNumber: 5, state: "APPROVED" },
    { id: "v6", articleId: "a3", bundleHash: "h3", versionNumber: 2, state: "DRAFT" },
  ], hashes);
  assert.deepEqual(Object.fromEntries(escolha), {
    a1: { id: "v1", approval: "APPROVED" },
    a2: { id: "v4", approval: "DRAFT" },
    a3: { id: "v6", approval: "DRAFT" },
  });
});

function clienteEmMemoria(linhas: Array<Record<string, unknown>>) {
  const selecoes: string[] = [];
  return {
    selecoes,
    from(tabela: string) {
      assert.equal(tabela, "radar_article_blueprints");
      const filtros: Array<(linha: Record<string, unknown>) => boolean> = [];
      let colunas: string[] = [];
      const consulta = {
        select(lista: string) { selecoes.push(lista); colunas = lista.split(","); return consulta; },
        eq(campo: string, valor: unknown) { filtros.push(linha => linha[campo] === valor); return consulta; },
        in(campo: string, valores: unknown[]) { filtros.push(linha => valores.includes(linha[campo])); return consulta; },
        order() { return consulta; },
        then(resolver: (valor: { data: unknown; error: null }) => void) {
          resolver({ data: linhas.filter(linha => filtros.every(filtro => filtro(linha))).map(linha => Object.fromEntries(colunas.map(coluna => [coluna, linha[coluna]]))), error: null });
        },
      };
      return consulta;
    },
  };
}

test("export: a leitura é por lote, filtrada pela marca, traz só os payloads escolhidos e marca o estado", async () => {
  const payload = payloadDoCaso();
  const linha = (id: string, brand: string, article: string, hash: string, versao: number, state: string) => ({
    id, brand_id: brand, article_id: article, bundle_hash: hash, version_number: versao, state,
    /* 2026-10-02 · as notas da conferência e a origem, colunas que já existiam. */
    validation: [`O H1 não traz a keyword principal inteira ("x"): confira antes de aprovar (${id}).`], origin: "ai",
    payload: { ...payload, blueprint: { ...payload.blueprint, title: { ...payload.blueprint.title, h1: `H1 de ${id}` } } },
  });
  const cliente = clienteEmMemoria([
    linha("v1", "marca-a", "a1", "h1", 1, "APPROVED"),
    linha("v2", "marca-a", "a1", "h1", 2, "DRAFT"),
    linha("v3", "marca-a", "a2", "h2", 1, "DRAFT"),
    linha("v9", "marca-b", "a2", "h2", 9, "APPROVED"),
  ]);
  const lidos = await readRadarArticleBlueprintsForExport(cliente as never, "marca-a", [{ articleId: "a1", bundleHash: "h1" }, { articleId: "a2", bundleHash: "h2" }, { articleId: "a3", bundleHash: null }]);
  assert.equal(lidos.get("a1")?.approval, "APPROVED");
  assert.equal(lidos.get("a1")?.blueprint.title.h1, "H1 de v1");
  assert.equal(lidos.get("a2")?.approval, "DRAFT", "a aprovada de outra marca não vale");
  assert.equal(lidos.get("a2")?.blueprint.title.h1, "H1 de v3");
  assert.equal(lidos.has("a3"), false);
  /* 2026-10-02 · só a proposta leva as pendências e a origem; a aprovada sai como antes. */
  assert.deepEqual(lidos.get("a2")?.validation, ["O H1 não traz a keyword principal inteira (\"x\"): confira antes de aprovar (v3)."]);
  assert.equal(lidos.get("a2")?.origin, "ai");
  assert.equal("validation" in lidos.get("a1")!, false);
  assert.equal("origin" in lidos.get("a1")!, false);
  assert.equal(cliente.selecoes[0].includes("payload"), false, "a primeira consulta não traz payload");
  assert.equal(cliente.selecoes.filter(item => item.includes("payload")).length, 1, "uma consulta de payload, só dos escolhidos");

  /* Tolerante: sem tabela ou com o banco recusando, o CSV sai sem artigo-modelo. */
  const quebrado = { from() { throw new Error("relation radar_article_blueprints does not exist"); } };
  const avisos: unknown[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { avisos.push(args); };
  try {
    assert.equal((await readRadarArticleBlueprintsForExport(quebrado as never, "marca-a", [{ articleId: "a1", bundleHash: "h1" }])).size, 0);
  } finally {
    console.warn = original;
  }
  assert.equal(avisos.length, 1);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
