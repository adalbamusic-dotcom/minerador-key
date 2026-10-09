import assert from "node:assert/strict";
import test from "node:test";
import {
  RADAR_ARTICLE_BLUEPRINT_FORBIDDEN_SCENE_LABEL,
  RadarArticleBlueprintAiSchema,
  radarArticleBlueprintColumns,
  radarArticleBlueprintForbiddenScene,
  radarArticleBlueprintPendingNotes,
  radarArticleBlueprintPrompt,
  radarArticleBlueprintVisualAnchors,
  radarArticleBlueprintVisualWithoutForbiddenScene,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintBrief,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import { radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import { ARTIGO, EXPORTADO_EM, LEITURA_DAS_LENTES, montadasDoSilo, planoDoSilo } from "./radar-portable-writing-fixtures.mts";
import { comPlantas } from "./radar-piloto-planta-fixtures-2026-10-09.mts";

/*
 * ===== 2026-10-08 · P1 · O PLANO VISUAL DO ARTIGO-MODELO (caso real do Instagram) =====
 *
 * O CSV real "artigo-instagram-nao-traz-pacientes-para-escrever" (o único do
 * Silo com artigo-modelo) trazia no plano visual:
 *   - Respiro 2 · seção "5" · "antes e depois de um procedimento estético, com
 *     foco em resultado", ALT "com antes e depois" e legenda "Conteúdo que
 *     mostra resultados reais ajuda na conversão" — a voz da marca, no próprio
 *     "Evitar", proíbe antes e depois e promessas clínicas;
 *   - Respiro 1 · seção "2", Respiro 2 · seção "5" e Respiro 3 · seção "8" numa
 *     planta de seis H2 (as seções que declaram as imagens são a 2ª, a 4ª e a
 *     6ª), com H2 da página publicada intercalados como seção própria.
 * Prova-se aqui, sem IA, sem banco e sem rede:
 *   (a) a conferência trata antes e depois, resultado clínico e promessa visual
 *       como proibidos (nota que pede ação → passada de correção) e o pedido à
 *       IA diz isso; fechando, a imagem sai concluída;
 *   (b) no export, a imagem da planta antiga que pede a cena vira instrução
 *       concluída a partir da seção, sem a cena (D10);
 *   (c) a âncora de cada imagem é o TÍTULO da seção, resolvido depois do mapa
 *       da página publicada — nunca um índice que mudou.
 * As fixtures imitam o caso (inventadas a partir do extrato). PROVIDER_CALLS = 0.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const D10 = [/\bpend[eê]ncia/i, /pendente de/i, /aguardando/i, /confira antes/i, /rascunho/i, /fonte a obter/i, /preencher/i, /\ba definir\b/i, /conferir antes/i, /pe[cç]a ao Arquiteto/i];
const linhas = (celula: string) => celula.split("\n");

const PRINCIPAL = "como atrair clientes pelo instagram";
const COMPLEMENTAR = "instagram não traz pacientes";

/* A voz real proíbe nas imagens (o "Evitar" do plano visual da Skill, inventado à imagem dele). */
const EVITAR_DA_VOZ = "Evitar texto sobreposto desnecessário, rostos artificiais, logotipos de terceiros, números fictícios, dashboards falsos, antes e depois e promessas clínicas.";

/* ============================== (a) a régua da cena proibida ============================== */

test("P1 · a régua: antes e depois, resultado clínico e promessa visual são pedidos; a menção negada, a métrica e a keyword passam", () => {
  const pedidos: Array<[string, string]> = [
    ["Imagem de um post de Instagram mostrando um antes e depois de um procedimento estético, com layout limpo.", "ANTES_E_DEPOIS"],
    ["Exemplo de post estratégico com antes e depois", "ANTES_E_DEPOIS"],
    ["Comparação antes/depois do rosto da paciente", "ANTES_E_DEPOIS"],
    ["Before and after photo of a skin treatment, 4:3", "ANTES_E_DEPOIS"],
    ["Sem texto legível, mostrando um antes e depois da pele", "ANTES_E_DEPOIS"],
    ["Não use texto legível e mostre o antes e depois do tratamento", "ANTES_E_DEPOIS"],
    ["Sem logotipos, com antes e depois lado a lado", "ANTES_E_DEPOIS"],
    ["O Instagram não converte sozinho: post com antes e depois da paciente", "ANTES_E_DEPOIS"],
    ["Close no resultado do procedimento de harmonização", "RESULTADO_CLINICO"],
    ["Paciente sorrindo com resultados estéticos visíveis", "RESULTADO_CLINICO"],
    ["Conteúdo que mostra resultados reais ajuda na conversão.", "PROMESSA_VISUAL"],
    ["Mulher com pele perfeita no espelho", "PROMESSA_VISUAL"],
    ["Selo de resultado garantido sobre a foto", "PROMESSA_VISUAL"],
  ];
  for (const [texto, cena] of pedidos) assert.equal(radarArticleBlueprintForbiddenScene(texto), cena, texto);

  const passam = [
    EVITAR_DA_VOZ,
    "Recepção da clínica, sem antes e depois, sem texto legível. Proporção 4:3.",
    "Mesa de planejamento de conteúdo. Não mostrar antes e depois nem resultado do procedimento.",
    "Avoid before and after shots; a calm waiting room",
    "Recepção da clínica. Evitar: antes e depois, promessas clínicas e logotipos.",
    "Evitar fotos com antes e depois e rostos artificiais.",
    "Mensure os resultados: profissional anotando métricas num caderno",
    "Imagem editorial sobre o tema. Sem resultados ou dados inventados.",
    "",
  ];
  for (const texto of passam) assert.equal(radarArticleBlueprintForbiddenScene(texto), null, texto);

  /* A keyword que traz o termo é o assunto, não a cena; a cena pedida fora dela continua pedida. */
  assert.equal(radarArticleBlueprintForbiddenScene("Pote de retinol creamy antes e depois sobre a bancada", ["retinol creamy antes e depois"]), null);
  assert.equal(radarArticleBlueprintForbiddenScene("Pote de retinol creamy antes e depois sobre a bancada"), "ANTES_E_DEPOIS");
  assert.equal(radarArticleBlueprintForbiddenScene("Retinol creamy antes e depois: a pele antes e depois de 30 dias", ["retinol creamy antes e depois"]), "ANTES_E_DEPOIS");
  assert.deepEqual(RADAR_ARTICLE_BLUEPRINT_FORBIDDEN_SCENE_LABEL, { ANTES_E_DEPOIS: "antes e depois", RESULTADO_CLINICO: "resultado clínico", PROMESSA_VISUAL: "promessa visual de resultado" });
});

/* ============================== as fixtures da planta ============================== */

const esqueleto = (id: string, heading: string) => ({
  id, level: 2 as const, parent: null, heading, readerQuestion: null, cover: [], mustCover: false, needsSource: false, needsSpecialist: false, outOfScope: false,
});

function pacote(patch: Partial<RadarArticleBlueprintBrief> = {}): RadarArticleBlueprintBrief {
  return {
    article: {
      principal: PRINCIPAL,
      complementary: [{ keyword: COMPLEMENTAR, role: "complementar", volume: 30 }],
      subject: null, intent: "Informacional", funnel: "Topo", siloRole: "Suporte",
      audience: null, promise: null,
      slug: "instagram-nao-traz-pacientes", publishedUrl: "https://exemplo.com.br/leads-sem-trafego-pago/instagram-nao-traz-pacientes",
      mustCover: [], unit: { type: "article", label: "Artigo", format: null },
    },
    silo: null,
    skeleton: [esqueleto("M1", "Bio atrativa"), esqueleto("M2", "Conteúdos relevantes"), esqueleto("M3", "Hashtags certas")],
    skeletonFrame: { workingTitle: null, promise: null, closing: null },
    evidence: [
      { id: "P1", kind: "pergunta da amostra", text: "Como atrair clientes pelo Instagram? (4 de 6 páginas)" },
      { id: "C1", kind: "cobertura", text: "Crie uma bio atrativa (3 de 6 páginas)" },
      { id: "G1", kind: "lacuna", text: "localização no perfil (1 de 6 páginas cobrem)" },
    ],
    linkCandidates: [{ id: "K1", label: "leads qualificados", role: "Pilar", destination: "/qualificados", status: "PUBLISHED", fromGraph: true }],
    graphLinks: [], sources: [], unsupportedClaims: [], specialist: [], videos: [],
    outOfScope: [], competitorTitles: [],
    measures: { comparablePages: 0, words: { median: null, p25: null, p75: null }, h2: null, h3: null, paragraphs: null, images: null, lists: null },
    authors: [],
    brandVoice: null,
    ...patch,
  };
}

const H2 = {
  perfil: "O primeiro passo: otimize seu perfil para atrair clientes locais",
  tese: "Instagram não traz pacientes quando o pessoal da clínica vira refém do jogo de influencer",
  geografico: "O erro geográfico que quase ninguém fala",
  posts: "Posts para Instagram estética não corrigem uma base fraca",
  muleta: "Quando o Instagram vira uma muleta cara",
  lugar: "O Instagram continua no jogo, mas no lugar certo",
};
const PERGUNTA_DOS_POSTS = "Por que posts bonitos não trazem pacientes?";

/* A seção crua, como a IA devolve. */
const crua = (h2: string, extra: Record<string, unknown> = {}) => ({ h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta.", from: ["M1"], ...extra });

/* O plano visual do caso real, à imagem dele: números que não batem e o Respiro 2 com a cena proibida. */
const VISUAL_DO_CASO = [
  { slot: "CAPA", section: null, concept: "Consultório moderno com agenda de papel aberta", prompt: "Fotografia de um consultório moderno com agenda de papel aberta sobre a mesa, luz suave e tons neutros. Proporção 16:9.", alt: "Consultório com agenda aberta", caption: "" },
  { slot: "R1", section: "2", concept: "Ilustração comparando o jogo de influencer com o foco local", prompt: "Ilustração flat com dois cenários: um perfil com muitos seguidores e poucos agendamentos; outro com poucos seguidores e agenda organizada. Sem texto legível. Proporção 4:3.", alt: "Comparação entre seguidores e agendamentos", caption: "O jogo de influencer prioriza seguidores." },
  {
    slot: "R2", section: "5",
    concept: "Exemplo de post de Instagram com conteúdo estratégico: antes e depois de um procedimento estético, com foco em resultado e chamada para ação.",
    prompt: "Imagem de um post de Instagram mostrando um antes e depois de um procedimento estético, com layout limpo e profissional. Sem texto legível, apenas elementos visuais genéricos. Proporção 4:3.",
    alt: "Exemplo de post estratégico com antes e depois",
    caption: "Conteúdo que mostra resultados reais ajuda na conversão.",
  },
  { slot: "R3", section: "8", concept: "Fluxo do perfil do Instagram ao agendamento, passando pelo site", prompt: "Diagrama em SVG de um funil: no topo o perfil, no meio o site, na base o agendamento. Elementos genéricos, sem texto legível. Proporção 4:3.", alt: "Fluxo do Instagram ao agendamento", caption: "O Instagram é uma etapa do funil." },
];

function respostaDoCaso(patch: Record<string, unknown> = {}) {
  return {
    keywordPlan: { reading: "A principal no H1; a complementar é o contraponto da marca.", complementary: [{ keyword: COMPLEMENTAR, placement: "H2 da seção 2", reason: "o diagnóstico" }] },
    reader: "Profissional de clínica que usa o Instagram.", promise: "Um perfil que leva ao contato.",
    angle: { statement: "Um checklist de diagnóstico do perfil local, com exemplo comentado.", evidence: ["G1"] },
    title: { h1: "Como atrair clientes pelo Instagram sem cair no jogo de influencer", seoTitle: "Como atrair clientes pelo Instagram", metaDescription: "O que ajustar no perfil." },
    opening: { readerQuestion: "Como atrair clientes pelo Instagram?", direction: "Responder direto.", evidence: ["P1"] },
    sections: [
      crua(H2.perfil, { readerQuestion: "Como configurar o perfil do Instagram para atrair clientes da minha região?", from: ["M1"], internalLinks: [{ candidate: "K1", anchor: "leads qualificados" }] }),
      crua(H2.tese, { readerQuestion: "Por que o Instagram não traz pacientes, mesmo com posts frequentes?", from: ["C1"], h3: ["O guru vende frequência; a clínica paga com cansaço"], image: "R1" }),
      crua(H2.geografico, { readerQuestion: "Como o Instagram pode atrair clientes da minha região?", from: ["G1"] }),
      crua(H2.posts, { readerQuestion: PERGUNTA_DOS_POSTS, from: ["M2"], image: "R2" }),
      crua(H2.muleta, { readerQuestion: "O Instagram pode substituir outras estratégias de captação?", from: ["C1"] }),
      crua(H2.lugar, { readerQuestion: "Como usar o Instagram de forma estratégica?", from: ["M3"], image: "R3" }),
    ],
    closing: { turn: "O Instagram, sozinho, não enche a agenda.", cta: "Conheça o serviço." },
    visual: VISUAL_DO_CASO,
    ...patch,
  };
}

const organizar = (ia: Record<string, unknown>, brief: RadarArticleBlueprintBrief = pacote(), opcoes: { close?: boolean } = {}) =>
  radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(ia), brief, opcoes);

/* ============================== (a) o pedido e a conferência ============================== */

test("P1 (a) · o pedido diz: âncora pelo título e antes e depois, resultado clínico e promessa visual proibidos; a passada de correção também", () => {
  const { system, user } = radarArticleBlueprintPrompt(pacote());
  assert.match(system, /cada respiro ligado a uma seção pelo TÍTULO: em section, o H2 da seção como você o escreveu \(nunca o número da seção\), e a mesma vaga no campo image dessa seção; uma imagem por seção\./);
  assert.match(system, /PROIBIDO em qualquer imagem \(prompt, conceito, ALT e legenda\), mesmo quando a seção fala de prova social: antes e depois \('antes\/depois'\), resultado clínico ou de procedimento e promessa visual de resultado \('resultados reais', resultado garantido, pele perfeita\); a imagem explica a ideia da seção, não prova resultado\./);
  assert.match(system, /O que a voz da marca manda evitar nas imagens não entra em prompt nenhum\./, "a regra B5 continua");
  assert.match(user, /"slot":"R1","section":"o H2 da seção, como escrito em sections"/);
  const correcao = radarArticleBlueprintPrompt(pacote(), { fix: { previous: { visual: [] }, pending: ["O plano visual pede antes e depois em Respiro 2"] } }).user;
  assert.match(correcao, /No plano visual: a imagem que pede antes e depois, resultado clínico ou promessa visual de resultado ganha outra cena, que explique a ideia da seção \(prompt, conceito, ALT e legenda sem essas cenas\), e cada respiro aponta a seção pelo título do H2\./);
});

test("P1 (a) · a conferência: a cena proibida vira nota que pede ação (passada de correção); a âncora vira o título da seção que declara a imagem", () => {
  const { payload, notes } = organizar(respostaDoCaso());
  const nota = notes.find(item => item.startsWith("O plano visual pede"));
  assert.equal(nota, "O plano visual pede antes e depois, promessa visual de resultado em Respiro 2 (\"Imagem de um post de Instagram mostrando um antes e depois de um procedimento estético, com layout limpo e profissional…\"): antes e depois, resultado clínico e promessa visual não entram em imagem nenhuma — troque a cena antes de aprovar.");
  assert.deepEqual(radarArticleBlueprintPendingNotes(notes).pending.filter(item => item.startsWith("O plano visual pede")), [nota], "a nota pede ação: dispara a passada de correção");
  assert.equal(notes.filter(item => item.startsWith("O plano visual pede")).length, 1, "uma nota por imagem, com todas as cenas dela");

  /* "2", "5" e "8": a seção que declara a vaga manda — o número da IA não bate com a planta. */
  assert.deepEqual(payload.blueprint.visual.map(item => [item.slot, item.section]), [["CAPA", null], ["R1", H2.tese], ["R2", H2.posts], ["R3", H2.lugar]]);
  assert.deepEqual(payload.blueprint.sections.map(item => item.image), [null, "R1", null, "R2", null, "R3"]);
  assert.match(payload.blueprint.visual[2].prompt, /antes e depois/, "sem fechar, a planta volta à IA como veio (a correção é dela)");
});

test("P1 (a) · fechando, a cena proibida sai: prompt concluído a partir da seção, conceito e legenda fora, ALT pela cena gerada — e a nota não pede ação", () => {
  const { payload, notes } = organizar(respostaDoCaso(), pacote(), { close: true });
  const r2 = payload.blueprint.visual.find(item => item.slot === "R2")!;
  assert.deepEqual(r2, {
    slot: "R2",
    section: H2.posts,
    concept: "",
    prompt: `Escreva o prompt a partir da seção "${H2.posts}" (${PERGUNTA_DOS_POSTS}): uma cena editorial que explique essa ideia, sem antes e depois, sem resultado clínico e sem promessa de resultado, sem texto legível. Proporção 4:3.`,
    alt: "descreva a cena gerada, sem antes e depois nem promessa de resultado",
    caption: "",
  });
  const nota = notes.find(item => item.startsWith("Plano visual: antes e depois"));
  assert.equal(nota, `Plano visual: antes e depois, promessa visual de resultado saiu de Respiro 2 (a regra do plano visual proíbe antes e depois, resultado clínico e promessa visual); o que a pedia virou instrução concluída a partir da seção "${H2.posts}".`);
  assert.equal(radarArticleBlueprintPendingNotes([nota!]).pending.length, 0, "a planta fechada não deixa pendência");
  assert.equal(notes.some(item => item.startsWith("O plano visual pede")), false);
  for (const item of payload.blueprint.visual) {
    for (const campo of [item.prompt, item.concept, item.alt, item.caption]) assert.equal(radarArticleBlueprintForbiddenScene(campo), null, `${item.slot}: ${campo}`);
  }
  /* As outras imagens não mudam (o MESMO texto). */
  assert.equal(payload.blueprint.visual.find(item => item.slot === "R1")!.prompt, VISUAL_DO_CASO[1].prompt);
  assert.equal(payload.blueprint.visual.find(item => item.slot === "R1")!.caption, VISUAL_DO_CASO[1].caption);
});

test("P1 (c) · o número da IA é lido na ordem DELA: a seção de FAQ que saiu não desloca a imagem para a seção errada", () => {
  const { payload, notes } = organizar(respostaDoCaso({
    sections: [
      crua("Otimize a bio do perfil para atrair clientes", { from: ["M1"] }),
      crua("Perguntas frequentes sobre Instagram", { from: ["M2"] }),
      crua("Use os Stories para atrair clientes", { from: ["M2"] }),
      crua("Leve o seguidor ao contato", { from: ["M3"] }),
    ],
    visual: [
      VISUAL_DO_CASO[0],
      { slot: "R1", section: "3", prompt: "Recepção organizada com celular sobre o balcão, sem texto legível. Proporção 4:3." },
      { slot: "R2", section: "Seção 4", prompt: "Mesa com caderno de planejamento de conteúdo. Proporção 4:3." },
    ],
  }));
  assert.ok(notes.includes("Seção \"Perguntas frequentes sobre Instagram\" removida: FAQ não integra o fluxo."));
  assert.deepEqual(payload.blueprint.sections.map(item => item.h2), ["Otimize a bio do perfil para atrair clientes", "Use os Stories para atrair clientes", "Leve o seguidor ao contato"]);
  /* "3" era a 3ª seção da IA (os Stories), que virou a 2ª da planta; "Seção 4" era a 4ª da IA (o contato). */
  assert.deepEqual(payload.blueprint.visual.map(item => [item.slot, item.section]), [["CAPA", null], ["R1", "Use os Stories para atrair clientes"], ["R2", "Leve o seguidor ao contato"]]);
  assert.deepEqual(payload.blueprint.sections.map(item => item.image), [null, "R1", "R2"]);
});

test("P1 (c) · o respiro sem par vai à primeira seção sem imagem a partir da 2ª, dito no painel sem pedir ação; uma imagem por seção", () => {
  const { payload, notes } = organizar(respostaDoCaso({
    visual: [
      VISUAL_DO_CASO[0],
      { slot: "R1", section: null, prompt: "Recepção organizada, sem pessoas. Proporção 4:3." },
      { slot: "R2", section: "Um assunto que a planta não tem", prompt: "Mapa com um pin sobre a clínica. Proporção 4:3." },
      { slot: "R3", section: H2.tese, prompt: "Caderno com o calendário de publicações. Proporção 4:3." },
    ],
    sections: respostaDoCaso().sections.map(item => ({ ...item, image: null })),
  }));
  /* R3 casa pelo título com a 2ª seção; R1 e R2 vão às primeiras livres a partir da 2ª (a 2ª já tem R3). */
  assert.deepEqual(payload.blueprint.visual.map(item => [item.slot, item.section]), [["CAPA", null], ["R1", H2.geografico], ["R2", H2.posts], ["R3", H2.tese]]);
  assert.deepEqual(payload.blueprint.sections.map(item => item.image), [null, "R3", "R1", "R2", null, null]);
  const ditas = notes.filter(item => item.startsWith("Plano visual: Respiro"));
  assert.deepEqual(ditas, [
    `Plano visual: Respiro 1 veio sem seção; ligado à seção "${H2.geografico}" (a primeira sem imagem).`,
    `Plano visual: Respiro 2 apontava "Um assunto que a planta não tem", que não casa com uma seção livre da planta; ligado à seção "${H2.posts}" (a primeira sem imagem).`,
  ]);
  assert.equal(radarArticleBlueprintPendingNotes(ditas).pending.length, 0, "a âncora concluída não paga a passada de correção");
});

/* ============================== (b) e (c) no export ============================== */

/* A planta ANTIGA do caso real, como foi gravada: seções que declaram as imagens e os números "2", "5" e "8" no plano visual. */
function plantaDoCaso(): RadarArticleBlueprintPayload {
  const { payload } = organizar(respostaDoCaso());
  const visual = VISUAL_DO_CASO.map(item => ({ ...item }));
  const gravada = JSON.parse(JSON.stringify(payload)) as RadarArticleBlueprintPayload;
  gravada.blueprint.visual = visual;
  delete gravada.rulesVersion;
  return gravada;
}

const H2_PUBLICADOS = [
  "Instagram não traz pacientes quando o pessoal da clínica vira refém do jogo de influencer",
  "O guru vende frequência. A clínica paga com cansaço",
  "O erro geográfico que quase ninguém fala",
  "Posts para Instagram estética não corrigem uma base fraca",
  "Quando o Instagram vira uma muleta cara",
  "A clínica não precisa de mais uma agência fazendo peça solta",
  "O Instagram continua no jogo, mas no lugar certo",
];

const colunasDoCaso = (planta: RadarArticleBlueprintPayload) =>
  radarArticleBlueprintColumns(planta, null, null, null, { currentH2: H2_PUBLICADOS, keywords: [PRINCIPAL, COMPLEMENTAR], principal: PRINCIPAL });

test("P1 (b)(c) · export da planta antiga: a âncora é o título (depois do mapa da página), e o Respiro 2 sai concluído, sem antes e depois", () => {
  const colunas = colunasDoCaso(plantaDoCaso());
  const visual = linhas(colunas.plano_visual);
  /* O mapa intercala "A clínica não precisa de mais uma agência…" como seção própria: o número nunca bate; o título sim. */
  assert.match(colunas.estrutura, /^- Depois desta seção, a página publicada continua com "A clínica não precisa de mais uma agência fazendo peça solta": seção própria, reescrita na voz\.$/m);
  assert.deepEqual(visual.filter(item => /^(Capa|Respiro \d)\b/.test(item)), [
    "Capa · Consultório moderno com agenda de papel aberta",
    `Respiro 1 · seção "${H2.tese}" · Ilustração comparando o jogo de influencer com o foco local`,
    `Respiro 2 · seção "${H2.posts}"`,
    `Respiro 3 · seção "${H2.lugar}" · Fluxo do perfil do Instagram ao agendamento, passando pelo site`,
  ]);
  assert.doesNotMatch(colunas.plano_visual, /seção "\d+"/, "nenhum índice");
  /* (b) · o prompt que pedia a cena vira a instrução concluída a partir da seção; ALT pela cena gerada; a legenda que prometia resultado sai. */
  const doR2 = visual.slice(visual.indexOf(`Respiro 2 · seção "${H2.posts}"`), visual.findIndex(item => item.startsWith("Respiro 3")));
  assert.deepEqual(doR2, [
    `Respiro 2 · seção "${H2.posts}"`,
    `  Prompt: Escreva o prompt a partir da seção "${H2.posts}" (${PERGUNTA_DOS_POSTS}): uma cena editorial que explique essa ideia, sem antes e depois, sem resultado clínico e sem promessa de resultado, sem texto legível. Proporção 4:3.`,
    "  ALT: descreva a cena gerada, sem antes e depois nem promessa de resultado",
  ]);
  assert.doesNotMatch(colunas.plano_visual, /um antes e depois de um procedimento|com antes e depois|resultados reais/);
  for (const linha of visual) {
    if (linha.startsWith("  Prompt: Escreva o prompt")) continue;
    assert.equal(radarArticleBlueprintForbiddenScene(linha), null, linha);
  }
  /* As outras imagens saem como estavam. */
  assert.ok(visual.includes(`  Prompt: ${VISUAL_DO_CASO[1].prompt}`));
  assert.ok(visual.includes("  Legenda: O jogo de influencer prioriza seguidores."));
  /* A estrutura diz a mesma âncora: a imagem fica na seção do título. */
  const blocoDosPosts = colunas.estrutura.split("\n## ").find(item => item.startsWith(H2.posts))!;
  assert.match(blocoDosPosts, /^- Imagem: R2$/m);
  for (const proibida of D10) assert.doesNotMatch(colunas.plano_visual, proibida, String(proibida));
});

test("P1 (c) · export: o respiro que aponta um H2 publicado que fica como seção própria fica nele; o número sem par vai à seção livre, nunca à errada", () => {
  const planta = plantaDoCaso();
  planta.blueprint.sections = planta.blueprint.sections.map(item => (item.image === "R3" ? { ...item, image: null } : item));
  planta.blueprint.visual = planta.blueprint.visual.map(item => (item.slot === "R3" ? { ...item, section: "A clínica não precisa de mais uma agência fazendo peça solta" } : item));
  const colunas = colunasDoCaso(planta);
  assert.ok(linhas(colunas.plano_visual).includes("Respiro 3 · seção \"A clínica não precisa de mais uma agência fazendo peça solta\" · Fluxo do perfil do Instagram ao agendamento, passando pelo site"), colunas.plano_visual);
  assert.match(colunas.estrutura, /^- Depois desta seção, a página publicada continua com "A clínica não precisa de mais uma agência fazendo peça solta": seção própria, reescrita na voz\. Imagem: R3\.$/m);
  assert.equal((colunas.estrutura.match(/^- Imagem: R3$/gm) || []).length, 0, "a seção da planta não leva a imagem que ficou na seção publicada");

  /* "8" numa planta de 6 seções, sem seção que declare a vaga: vai à primeira seção livre a partir da 2ª. */
  const semPar = plantaDoCaso();
  semPar.blueprint.sections = semPar.blueprint.sections.map(item => (item.image === "R3" ? { ...item, image: null } : item));
  const anteriores = radarArticleBlueprintColumns(semPar).plano_visual;
  assert.ok(linhas(anteriores).includes(`Respiro 3 · seção "${H2.geografico}" · Fluxo do perfil do Instagram ao agendamento, passando pelo site`), anteriores);
});

test("P1 (c) · a âncora: a seção que declara a vaga, o título, o número e a seção livre; uma imagem por seção; a capa sem par fica sem seção", () => {
  const secoes = [{ h2: "A" , image: null }, { h2: "B bio do perfil", image: "R2" }, { h2: "C stories", image: null }, { h2: "D contato", image: null }];
  assert.deepEqual(radarArticleBlueprintVisualAnchors(secoes, [
    { slot: "CAPA", section: "Introdução" },
    { slot: "R1", section: "2" },
    { slot: "R2", section: "9" },
    { slot: "R3", section: "Stories" },
  ]), [
    /* A capa sem par abre o artigo, sem seção. */
    { slot: "CAPA", section: null, title: null, by: null },
    /* "2" apontava a seção que declara o R2 (uma imagem por seção): o R1 vai à primeira livre a partir da 2ª. */
    { slot: "R1", section: 3, title: "D contato", by: "spread" },
    /* A seção que declara a vaga manda sobre o "9", que nem existe. */
    { slot: "R2", section: 1, title: "B bio do perfil", by: "image" },
    /* "Stories" casa pelo título. */
    { slot: "R3", section: 2, title: "C stories", by: "title" },
  ]);
  const porTitulo = radarArticleBlueprintVisualAnchors([{ h2: "Use os Stories para atrair clientes" }, { h2: "Otimize a bio do perfil" }], [{ slot: "R1", section: "Otimize a bio" }]);
  assert.deepEqual(porTitulo, [{ slot: "R1", section: 1, title: "Otimize a bio do perfil", by: "title" }]);
  /* Com a leitura da IA (`numero`): a 3ª da IA é a 2ª da planta. */
  assert.deepEqual(radarArticleBlueprintVisualAnchors([{ h2: "X" }, { h2: "Y" }], [{ slot: "R1", section: "3" }], { numero: numero => [1, 3].indexOf(numero) }), [{ slot: "R1", section: 1, title: "Y", by: "number" }]);
});

test("P1 (b) · a imagem sem cena proibida volta igual (o MESMO objeto); a capa sem seção usa o tema do artigo", () => {
  const limpa = { slot: "R1", concept: "Recepção", prompt: "Recepção organizada. Proporção 4:3.", alt: "Recepção", caption: "" };
  const lida = radarArticleBlueprintVisualWithoutForbiddenScene(limpa, { title: "Seção" });
  assert.equal(lida.item, limpa);
  assert.deepEqual(lida.scenes, []);
  const capa = radarArticleBlueprintVisualWithoutForbiddenScene({ slot: "CAPA", concept: "", prompt: "Antes e depois de uma paciente, 16:9", alt: "Capa", caption: "" }, { title: null }, { topic: "Como atrair clientes pelo Instagram" });
  assert.equal(capa.item.prompt, "Escreva o prompt a partir do tema do artigo (\"Como atrair clientes pelo Instagram\"): uma cena editorial que explique essa ideia, sem antes e depois, sem resultado clínico e sem promessa de resultado, sem texto legível. Proporção 16:9.");
  assert.equal(capa.item.alt, "Capa", "o ALT que não pede a cena fica");
  /* Só a legenda prometia resultado: o prompt fica, a legenda sai. */
  const soLegenda = radarArticleBlueprintVisualWithoutForbiddenScene({ slot: "R2", concept: "", prompt: "Recepção organizada. Proporção 4:3.", alt: "", caption: "Resultados reais na agenda." }, { title: "Seção" });
  assert.equal(soLegenda.item.prompt, "Recepção organizada. Proporção 4:3.");
  assert.equal(soLegenda.item.caption, "");
});

test("P1 · CSV para escrever de ponta a ponta: a linha do artigo leva o plano visual concluído, pelo título, sem a cena proibida", () => {
  const plano = planoDoSilo();
  const planta = plantaDoCaso();
  /* 2026-10-09 · os outros artigos do lote também saem com a planta concluída deles (sem ela, o CSV não é montado). */
  const csv = radarPortableWritingExport({
    articles: comPlantas(montadasDoSilo().map(item => (item.articleId === ARTIGO ? { ...item, blueprint: { ...planta, approval: "APPROVED" as const } } : item)), plano.files[0].writing),
    lenses: LEITURA_DAS_LENTES, plan: plano, today: EXPORTADO_EM,
  }).files![0].csv;
  assert.ok(csv.includes(`Respiro 2 · seção ""${H2.posts}""`), "a âncora pelo título, com as aspas dobradas do CSV");
  assert.ok(csv.includes(`Prompt: Escreva o prompt a partir da seção ""${H2.posts}""`));
  assert.doesNotMatch(csv, /seção ""[58]""/);
  assert.doesNotMatch(csv, /um antes e depois de um procedimento|Exemplo de post estratégico com antes e depois|resultados reais ajuda/);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
