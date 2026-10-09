import assert from "node:assert/strict";
import test from "node:test";
import { radarPortableCompetitorsStructure, RADAR_PORTABLE_GAP_LIMITS } from "../lib/radar/portable-dossier-gaps.ts";
import { radarCompetitorTopics, type RadarCompetitorOutlinePage } from "../lib/radar/competitor-topics.ts";
import {
  radarSampleBasisDenominators,
  radarSampleBasisFraction,
  radarSampleBasisLabel,
  radarSampleBasisOf,
  radarSampleBasisRewriteCount,
  radarSampleBasisRewriteEvidence,
  radarSampleBasisSources,
  type RadarSampleBasisModel,
} from "../lib/radar/sample-basis.ts";
import type { RadarObservedCompetitor } from "../lib/radar/competitive-observed-model.ts";

/*
 * ===== 2026-10-09 · UMA BASE DE AMOSTRA SÓ (defeito 2 da rodada de coerência dos 8 CSVs "para escrever") =====
 *
 * O CSV real de "leads qualificados" (09/10) imprimia "Páginas comparáveis
 * lidas pela investigação (…; 12)" e "H2/H3 das 12 páginas comparáveis, de 10
 * site(s)", e na mesma linha "Autoria: 10 de 23 páginas", "Data de
 * atualização visível: 22 de 23" e as evidências "C1 (O que é um lead
 * qualificado? (17 de 23 páginas))". A causa: a lista impressa saía da coluna
 * `competitors_structure_json`, cortada em 20 concorrentes pela melhor posição
 * (comparáveis ou não); o modelo conta todas as comparáveis. A amostra abaixo
 * imita esse caso — 12 comparáveis entre as 20 de melhor posição e outras 11
 * depois delas (URLs do arquivo real e das "Outras consultas do artigo").
 * PROVIDER_CALLS = 0.
 */

const ESTRUTURA = { words: 2789, h2: 12, h3: 13, paragraphs: 74, images: 23, lists: 4 };
/* O concorrente como o modelo observado o guarda: a régua lê dele só o que `RadarSampleBasisModel` declara. */
const concorrente = (url: string, rank: number, comparable: boolean): RadarObservedCompetitor => ({
  referenceId: null,
  url,
  domain: new URL(url).hostname,
  title: new URL(url).hostname,
  classification: null,
  origin: "CANONICAL",
  queries: ["leads qualificados"],
  queryRecurrence: 1,
  ranks: [{ keyword: "leads qualificados", role: "principal", rank }],
  extractionStatus: comparable ? "success" : "not_extracted",
  format: comparable ? "article_editorial" : null,
  comparable,
  structure: comparable ? ESTRUTURA : null,
  conceptsCovered: [],
  questionsCovered: [],
  limitations: [],
});

/* As 12 comparáveis da lista impressa do CSV real (melhor posição até 5). */
const IMPRESSAS = [
  "https://exactsales.com.br/leads-qualificados/",
  "https://intelligenzia.com.br/11-ferramentas-que-podem-ajudar-a-gerar-leads-qualificados/",
  "https://dtnetwork.com.br/blog/como-conseguir-leads-qualificados/",
  "https://exactsales.com.br/demonstracoes-exact-sales/searching/",
  "https://www.claro.com.br/blog/empresas/como-gerar-leads-com-baixo-investimento",
  "https://www.rdstation.com/blog/marketing/leads-qualificados/",
  "https://outmarketing.com.br/geracao-de-leads-qualificados-desafio-ou-obrigacao/",
  "https://www.edialog.com.br/leads-qualificados/",
  "https://www.serasaexperian.com.br/conteudos/o-que-e-lead/",
  "https://protagnst.com/geracao-de-leads/",
  "https://br.hubspot.com/blog/marketing/leads-qualificados",
  "https://www.zendesk.com.br/blog/sales/fast-track-lead-generation-sell-reach/",
];
/* As 8 não comparáveis que também estão entre as 20 de melhor posição (lista comercial, vídeo, vitrine). */
const NAO_COMPARAVEIS_NO_TOPO = [
  "https://www.datastone.com.br/comprar-leads-qualificados",
  "https://www.activecampaign.com/br/blog/leads",
  "https://www.youtube.com/watch?v=leads1",
  "https://www.youtube.com/watch?v=leads2",
  "https://www.econodata.com.br/lista-de-empresas",
  "https://www.leadster.com.br/planos",
  "https://www.linkedin.com/pulse/leads-qualificados",
  "https://www.instagram.com/p/leads",
];
/* As 11 comparáveis de posição pior (6 a 10), fora do teto da coluna e dentro de toda conta do modelo. */
const DEPOIS_DO_TETO = [
  "https://materiais.rdstation.com/guia-leads-qualificados",
  "https://www.econodata.com.br/blog/gerar-leads-qualificados",
  "https://blog.agencia10x.com/captacao-de-leads-qualificados",
  "https://www.envox.com.br/blog/leads-qualificados",
  "https://www.organicadigital.com/blog/leads-qualificados",
  "https://malvamarketingdigital.com/leads-qualificados",
  "https://www.agendor.com.br/blog/leads-qualificados",
  "https://www.salesforce.com/br/blog/leads-qualificados",
  "https://www.exactsales.com.br/blog/mql-sql",
  "https://www.ramper.com.br/blog/leads-qualificados",
  "https://www.meetime.com.br/blog/leads-qualificados",
];
const POSICOES_DO_TOPO = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5];

const CONCORRENTES: RadarObservedCompetitor[] = [
  /* A ordem do modelo não é a da posição: a régua ordena. */
  ...DEPOIS_DO_TETO.map((url, indice) => concorrente(url, 6 + Math.floor(indice / 3), true)),
  ...NAO_COMPARAVEIS_NO_TOPO.map((url, indice) => concorrente(url, 1 + (indice % 5), false)),
  ...IMPRESSAS.map((url, indice) => concorrente(url, POSICOES_DO_TOPO[indice], true)),
  concorrente("https://www.leadster.com.br/blog/o-que-e-lead", 9, false),
];
const MODELO = {
  competitors: CONCORRENTES,
  structure: { measures: [], presences: [], patterns: [] },
  sample: { comparablePages: 23 },
};

test("a causa: a lista impressa vinha da coluna cortada em 20 pela posição; a base única tem as 23 comparáveis do modelo", () => {
  const coluna = radarPortableCompetitorsStructure({ profile: "GOOGLE", observed: MODELO as never });
  assert.equal(coluna.listed, RADAR_PORTABLE_GAP_LIMITS.competitors);
  assert.equal(coluna.competitors.filter(item => item.comparable).length, 12, "o 12 do CSV real: as comparáveis entre as 20 de melhor posição");

  const base = radarSampleBasisOf(MODELO)!;
  assert.equal(base.size, 23, "o 23 do CSV real: todas as comparáveis do modelo");
  assert.equal(base.modelSize, 23);
  assert.equal(base.aligned, true, "a base é a amostra do modelo: os números dele já estão sobre ela");
  assert.deepEqual(base.pages.slice(0, 12).map(item => item.url).sort(), [...IMPRESSAS].sort(), "na ordem da melhor posição, as 12 da lista antiga vêm primeiro");
  assert.ok(base.pages.every((item, indice) => indice === 0 || (base.pages[indice - 1].bestPosition ?? 0) <= (item.bestPosition ?? Number.POSITIVE_INFINITY)));
  assert.ok(base.pages.every(item => item.structure), "cada página da base traz a estrutura medida (a mediana do artigo-modelo sai dela)");
  assert.ok(!base.pages.some(item => NAO_COMPARAVEIS_NO_TOPO.includes(item.url)), "lista comercial, vídeo e vitrine não entram");
  /* exactsales (2 páginas) e rdstation (www e materiais) contam uma vez cada. */
  assert.equal(base.sites, 20);
  assert.equal(radarSampleBasisLabel(base), "23 páginas comparáveis, de 20 sites");
});

test("os temas dos concorrentes sobre a base única dizem o mesmo número de páginas e de sites", () => {
  const base = radarSampleBasisOf(MODELO)!;
  const esbocos: RadarCompetitorOutlinePage[] = base.pages.map((item, indice) => ({
    url: item.url,
    title: item.title,
    domain: item.domain,
    headings: [{ level: 2, text: indice % 2 ? "Como medir resultados em geração de leads" : "Momento de compra" }, { level: 2, text: `Tema próprio número ${indice}` }],
  }));
  const temas = radarCompetitorTopics({ pages: esbocos, core: ["leads qualificados"], basis: base.pages });
  assert.equal(temas.sampleSize, base.size);
  assert.equal(temas.sampleDomains, base.sites, "o 'de N sites' dos temas é o da base");
  assert.ok(temas.topics.every(item => item.sampleSize === base.size && item.pages <= base.sites));
});

test("sem lista comparável não há base (o transporte compacto): quem apresenta fica com os números do modelo", () => {
  assert.equal(radarSampleBasisOf(null), null);
  assert.equal(radarSampleBasisOf({ competitors: CONCORRENTES.map(item => ({ ...item, comparable: false })), sample: { comparablePages: 23 } }), null);
  const semFoto = radarSampleBasisOf({ competitors: CONCORRENTES })!;
  assert.equal(semFoto.modelSize, null);
  assert.equal(semFoto.aligned, true, "sem a amostra do modelo, nada a comparar");
  /* A mesma URL em duas grafias é uma página só. */
  const repetida = radarSampleBasisOf({ competitors: [concorrente("https://www.a.com.br/post/", 1, true), concorrente("http://a.com.br/post?utm_source=x", 2, true)] })!;
  assert.equal(repetida.size, 1);
  assert.equal(radarSampleBasisLabel(repetida), "1 página comparável, de 1 site");
});

/* ------------------------------ a fração e a recontagem ------------------------------ */

const LEAD_QUALIFICADO = "O que é um lead qualificado?";
/* A deriva: a fotografia congelou 23, e a lista viva perdeu 3 páginas (por exemplo, órfãs recortadas pela seleção). */
const PERDIDAS = DEPOIS_DO_TETO.slice(8);
const DERIVA: RadarSampleBasisModel = { competitors: CONCORRENTES.filter(item => !PERDIDAS.includes(item.url)), sample: { comparablePages: 23 } };
/* As 17 páginas que sustentam o conceito no modelo: 14 da base viva e as 3 perdidas. */
const SUSTENTAM = [...IMPRESSAS, ...DEPOIS_DO_TETO.slice(0, 2), ...PERDIDAS];

test("a fração: o número do modelo quando a base é a amostra; recontado pelas URLs na deriva; fora do texto sem elas", () => {
  const base = radarSampleBasisOf(MODELO)!;
  assert.deepEqual(radarSampleBasisFraction(base, { pages: 17, sampleSize: 23 }), { pages: 17, sampleSize: 23, recounted: false });
  assert.deepEqual(radarSampleBasisFraction(null, { pages: 10, sampleSize: 23 }), { pages: 10, sampleSize: 23, recounted: false }, "sem base, como veio");

  const deriva = radarSampleBasisOf(DERIVA)!;
  assert.equal(deriva.size, 20);
  assert.equal(deriva.aligned, false);
  assert.deepEqual(radarSampleBasisFraction(deriva, { pages: 17, sampleSize: 23, urls: SUSTENTAM.map(url => url.replace("https://", "http://")) }), { pages: 14, sampleSize: 20, recounted: true });
  assert.equal(radarSampleBasisFraction(deriva, { pages: 10, sampleSize: 23 }), null, "autoria e data (sem URL por página no modelo): a contagem sai, nunca '10 de 20'");
});

/* ------------------------------ os rótulos gravados no artigo-modelo ------------------------------ */

/* Os textos das evidências como o artigo-modelo de "leads qualificados" os gravou (coluna estrutura do CSV real). */
const C1 = `${LEAD_QUALIFICADO} (17 de 23 páginas)`;
const G1 = "Qual a diferença entre lead qualificado e lead interessado? (5 de 23 páginas cobrem)";
const D1 = "Por que gerar leads? (7 páginas cobrem)";
const P1 = "Como gerar leads qualificados (2 de 23 páginas)";

const FONTES = {
  concepts: { all: [{ canonicalLabel: LEAD_QUALIFICADO, supportingPages: SUSTENTAM.map(url => ({ url })) }, { canonicalLabel: "Por que gerar leads?", supportingPages: [{ url: IMPRESSAS[0] }] }] },
  questions: [{ canonicalQuestion: "Como gerar leads qualificados", sourceUrls: [IMPRESSAS[1], PERDIDAS[0]] }],
  gaps: [{ subject: "Qual a diferença entre lead qualificado e lead interessado?", sources: [IMPRESSAS[2], IMPRESSAS[3], PERDIDAS[1], PERDIDAS[2], DEPOIS_DO_TETO[0]].map(url => ({ url })) }],
  differentiations: [{ subject: "Por que gerar leads?", sources: [...IMPRESSAS.slice(0, 5), ...PERDIDAS.slice(0, 2)].map(url => ({ url })) }],
};

test("com a base alinhada, os rótulos gravados ficam como estão; o diferencial ganha o 'de M' da base", () => {
  const base = radarSampleBasisOf(MODELO)!;
  const fontes = radarSampleBasisSources(FONTES);
  assert.equal(radarSampleBasisRewriteCount(C1, base, fontes, "C1"), C1);
  assert.equal(radarSampleBasisRewriteCount(G1, base, fontes, "G1"), G1);
  assert.equal(radarSampleBasisRewriteCount(P1, base, fontes, "P3"), P1);
  assert.equal(radarSampleBasisRewriteCount(D1, base, fontes, "D1"), "Por que gerar leads? (7 de 23 páginas cobrem)");
  assert.equal(radarSampleBasisRewriteCount(D1, base, null, "D1"), "Por que gerar leads? (7 de 23 páginas cobrem)", "alinhada, o número do modelo basta: nada a recontar");
  /* O texto sem contagem no fim (resultado orgânico, busca relacionada) não muda; sem base, nada muda. */
  const s1 = "Leads qualificados: o que são e como atraí-los? · https://exactsales.com.br/leads-qualificados/";
  assert.equal(radarSampleBasisRewriteCount(s1, base, fontes, "S1"), s1);
  assert.equal(radarSampleBasisRewriteCount(C1, null, fontes, "C1"), C1);
  const evidencia = { id: "C1", kind: "conceito da amostra", text: C1 };
  assert.equal(radarSampleBasisRewriteEvidence(evidencia, base, fontes), evidencia, "sem mudança, o mesmo objeto");
});

test("na deriva, o rótulo gravado é recontado sobre a base sem chamar IA; sem fonte, a contagem sai", () => {
  const deriva = radarSampleBasisOf(DERIVA)!;
  const fontes = radarSampleBasisSources(FONTES);
  assert.equal(radarSampleBasisRewriteCount(C1, deriva, fontes, "C1"), `${LEAD_QUALIFICADO} (14 de 20 páginas)`);
  assert.equal(radarSampleBasisRewriteCount(G1, deriva, fontes, "G1"), "Qual a diferença entre lead qualificado e lead interessado? (3 de 20 páginas cobrem)");
  assert.equal(radarSampleBasisRewriteCount(P1, deriva, fontes, "P3"), "Como gerar leads qualificados (1 de 20 páginas)");
  assert.equal(radarSampleBasisRewriteCount(D1, deriva, fontes, "D1"), "Por que gerar leads? (5 de 20 páginas cobrem)", "o D sem 'de M' também é recontado");
  assert.equal(radarSampleBasisRewriteCount("Custo por lead (4 de 23 páginas)", deriva, fontes, "C9"), "Custo por lead", "rótulo fora do modelo: o rótulo fica, a contagem sai");
  assert.equal(radarSampleBasisRewriteCount("Como gerar leads quentes? (4 de 23 páginas tratam)", deriva, null, null), "Como gerar leads quentes?");
  const evidencia = radarSampleBasisRewriteEvidence({ id: "C1", kind: "conceito da amostra", text: C1 }, deriva, fontes);
  assert.deepEqual(evidencia, { id: "C1", kind: "conceito da amostra", text: `${LEAD_QUALIFICADO} (14 de 20 páginas)` });
});

test("as fontes de cada medida: pela letra da evidência primeiro, sem acento nem entidade HTML no casamento", () => {
  const fontes = radarSampleBasisSources({
    concepts: { all: [{ canonicalLabel: "Captação &amp; conversão", supportingPages: [{ url: "https://a.com/1" }] }] },
    questions: [{ canonicalQuestion: "Captação & conversão", sourceUrls: ["https://b.com/2"] }],
  });
  assert.deepEqual(fontes("captacao & conversao", "C"), ["https://a.com/1"]);
  assert.deepEqual(fontes("Captação & conversão", "P"), ["https://b.com/2"]);
  assert.deepEqual(fontes("Captação & conversão"), ["https://a.com/1"], "sem letra, o conceito primeiro");
  assert.equal(fontes("Outro assunto", "C"), null);
  assert.equal(radarSampleBasisSources(null)("qualquer"), null);
});

/* ------------------------------ a conferência da linha inteira ------------------------------ */

/* Trechos copiados da linha de "leads qualificados" do CSV real de 09/10 (serp_resumida, cobrir_e_superar e estrutura). */
const LINHA_REAL = [
  "Páginas comparáveis lidas pela investigação (a base das medidas e dos \"N de M páginas\" deste arquivo; 12):",
  "- e mais 2 página(s) comparável(is), na investigação do Radar",
  "O que os concorrentes lidos cobrem (H2/H3 das 12 páginas comparáveis, de 10 site(s); 311 cabeçalhos lidos; a recorrência conta sites e mostra o que a amostra trata, não o que funciona):",
  "- Momento de compra · 4 de 10 sites · ex.: \"Momento de compra\"; \"Intenção de compra\"",
  "- Diferencial possível: \"Como identificar leads qualificados\", tratado por um só site entre as 12 páginas comparáveis — aprofunde na seção \"O que é um lead qualificado?\".",
  "- Diferenciar em \"Como medir resultados em geração de leads\": a busca mostra que só 6 de 23 página(s) cobrem.",
  "- Autoria: 10 de 23 páginas identificam quem escreveu; assine com autor real, sem inventar credencial.",
  "- Data de atualização visível: 22 de 23 páginas mostram.",
  "Concorrentes comparáveis (12): mediana de 2789 palavras, 12 H2, 13 H3, 74 parágrafos, 23 imagens.",
  "- Evidências: C1 (O que é um lead qualificado? (17 de 23 páginas)); S4 (Lead Qualificado · só em desktop · Windows e celular · iOS (2 de 4 lentes))",
].join("\n");

test("a conferência acha as duas bases da linha real (12 e 23) e ignora lentes e o 'e mais N'", () => {
  const { pages, sites } = radarSampleBasisDenominators(LINHA_REAL);
  assert.deepEqual([...new Set(pages)].sort((a, b) => a - b), [12, 23], "o defeito: duas bases de páginas na mesma linha");
  assert.equal(pages.filter(item => item === 12).length, 4, "lista, temas, diferencial possível e medidas do artigo-modelo");
  assert.equal(pages.filter(item => item === 23).length, 4, "como superar, autoria, data e a evidência C1");
  assert.deepEqual(sites, [10, 10], "o cabeçalho dos temas e o tema, cada um lido uma vez");
  assert.ok(!pages.includes(2) && !pages.includes(4), "'e mais 2 página(s)' e '2 de 4 lentes' não são base");
});

test("a mesma linha dita pela base única tem um número de páginas e um de sites", () => {
  const base = radarSampleBasisOf(MODELO)!;
  const fontes = radarSampleBasisSources(FONTES);
  const depois = [
    `Páginas comparáveis lidas pela investigação (a base das medidas e das contagens deste arquivo: ${radarSampleBasisLabel(base)}):`,
    "- e mais 13 página(s) comparável(is), na investigação do Radar",
    `O que os concorrentes lidos cobrem (H2/H3 das ${radarSampleBasisLabel(base)}; a recorrência conta sites):`,
    `- Momento de compra · 4 de ${base.sites} sites`,
    `- Diferencial possível: "Como identificar leads qualificados", tratado por um só site entre os ${base.sites} sites das ${base.size} páginas comparáveis.`,
    "- Diferenciar em \"Como medir resultados em geração de leads\": a busca mostra que só 6 de 23 página(s) cobrem.",
    "- Autoria: 10 de 23 páginas identificam quem escreveu.",
    `Concorrentes comparáveis (${base.size}): mediana de 2789 palavras.`,
    `- Evidências: C1 (${radarSampleBasisRewriteCount(C1, base, fontes, "C1")}); D1 (${radarSampleBasisRewriteCount(D1, base, fontes, "D1")})`,
  ].join("\n");
  const { pages, sites } = radarSampleBasisDenominators(depois);
  assert.deepEqual([...new Set(pages)], [base.size]);
  assert.deepEqual([...new Set(sites)], [base.sites]);
});
