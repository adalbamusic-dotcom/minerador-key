import assert from "node:assert/strict";
import test from "node:test";
import {
  RADAR_WRITING_EXPORT_COLUMNS,
  RADAR_WRITING_EXPORT_CUT_ORDER,
  RADAR_WRITING_EXPORT_LIMITS,
  RADAR_WRITING_NO_APPROVED_LINK,
  RADAR_WRITING_STRUCTURE_CONTINUATION,
  buildRadarWritingExportArticle,
  buildRadarWritingTopRow,
  radarWritingCompactStructure,
  radarWritingExportCsv,
  type RadarWritingArticleContext,
  type RadarWritingExportRow,
  type RadarWritingPublication,
} from "../lib/radar/portable-writing-export.ts";
import { radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import { radarSampleBasisDenominators } from "../lib/radar/sample-basis.ts";
import { googleCompetitiveBlueprintOfAnalysis } from "../lib/radar/google-editorial.ts";
import { radarBrandVoiceExclusions, type RadarBrandVoice } from "../lib/radar/brand-voice.ts";
import { buildRadarArticleBlueprintBrief, type RadarArticleBlueprintPayload } from "../lib/radar/article-blueprint.ts";
import type { RadarCompetitorOutlinePage } from "../lib/radar/competitor-topics.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import type { RadarSiloExportWritingContext } from "../lib/radar/portable-silo-export.ts";
import type { RadarCompetitiveObservedModel } from "../lib/radar/competitive-observed-model.ts";
import { ARTIGO, EXPORTADO_EM, LEITURA_DAS_LENTES, entradaGoogle } from "./radar-portable-writing-fixtures.mts";
import { comPlanta, plantaDe, respostaDaPlanta } from "./radar-piloto-planta-fixtures-2026-10-09.mts";

/*
 * ===== 2026-10-09 · O CSV "PARA ESCREVER" COERENTE (defeitos 1, 2, 3, 4, 5, 6, 10 e 14 dos 8 CSVs reais) =====
 *
 * Os 8 CSVs "para escrever" do Silo "Leads sem Tráfego Pago" (09/10) ainda se
 * contradiziam. As fixtures abaixo imitam os casos reais, com os textos
 * copiados dos arquivos do dono (estrutura, "Não cobrir", "Como superar",
 * Skill de voz, ordem narrativa e "Tópicos incluídos"):
 *   1 · estrutura de captar e de promoções cortada em 14 mil;
 *   2 · "12 páginas comparáveis" na lista e "N de 23" no resto;
 *   3 · o "Não cobrir" proibindo o que o artigo-modelo cobre (custo por lead,
 *       ICP, primeira abordagem, captador, ferramentas) e sugestões do que ele proíbe;
 *   4 · "pertence a <keyword de Tópicos incluídos>, outro tópico do Silo";
 *   5 · "Diferenciar em 'Ative o Instagram Shopping'" com a voz proibindo;
 *   6 · "Sustentar 'como atrair um cliente' como diferencial";
 *   10 · a continuação como segunda saída no fechamento;
 *   14 · campanhas publicado sem artigo-modelo com a estrutura legada (4 Ps).
 * O arquivo inteiro de cada caso passa pela varredura D10. PROVIDER_CALLS = 0 e AI_CALLS = 0.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* D10, mais o que esta rodada tirou: corte no meio, dono que não é artigo e a continuação no fechamento. */
const D10 = [
  /\bpend[eê]ncia/i, /\bpendente\b/i, /aguardando/i, /confira antes/i, /conferir antes/i, /rascunho/i, /fonte a obter/i, /preencher/i,
  /\ba definir\b/i, /peça ao Arquiteto/i, /Célula cortada/, /outro tópico do Silo/, /no fechamento, apresente/,
  /* 2026-10-09 (correção · contrato-F1) · nenhuma coluna destes casos é cortada para o artigo caber. */
  /Cortado para o artigo caber/,
];
/* O trecho de terceiro (snippet entre “…”) é pesquisa citada como veio, não instrução do entregável. */
const doExport = (texto: string) => texto.replace(/“[^”]*”/g, "“…”");
const linhas = (texto: string) => texto.split("\n");
const tudo = (row: RadarWritingExportRow) => RADAR_WRITING_EXPORT_COLUMNS.map(coluna => row[coluna]).join("\n");
const CSVS: string[] = [];
const guardar = (contexto: RadarWritingArticleContext, ...rows: RadarWritingExportRow[]) => {
  CSVS.push(radarWritingExportCsv([buildRadarWritingTopRow({ label: contexto.silo ? "Silo" : "Marca", silo: contexto.silo, articles: [], siteUrl: "https://adalbapro.com.br" }), ...rows]));
};
const naoCobrirDe = (cobrir: string) => linhas(cobrir.slice(cobrir.indexOf("Não cobrir:")));
const comoSuperarDe = (cobrir: string) => linhas(cobrir.slice(0, cobrir.indexOf("\n\n") > 0 ? cobrir.indexOf("\n\n") : cobrir.length));

/* ============================== o Silo real ============================== */

const SITE = "https://adalbapro.com.br";
const PREFIXO = `${SITE}/leads-sem-trafego-pago`;
const membro = (articleId: string, position: number, principal: string, slug: string, role = "Suporte") =>
  ({ articleId, position, title: principal, principalKeyword: principal, slug, role, statusLabel: "fora desta seleção", inThisFile: false, reason: null });
/* A ordem narrativa e os "Tópicos incluídos" do CSV real (o Silo tem 8 artigos; os tópicos são keywords). */
const SILO_LEADS = (eu: string, posicao: number): RadarSiloExportWritingContext => ({
  kind: "silo", label: "Leads sem Tráfego Pago", partial: true, draft: false, centralEntity: "Leads sem Tráfego Pago",
  objective: "Construir autoridade em leads sem tráfego pago.", audience: null, macroProblem: null, dominantIntent: null, whyTogether: null,
  boundary: "Manter a cobertura centrada em leads sem tráfego pago e revisar sobreposições antes da publicação.",
  includedTopics: [
    "Leads sem Tráfego Pago", "como atrair clientes pelo whatsapp", "como fazer captação de clientes", "como conseguir mais clientes",
    "como captar pacientes", "trafego pago como funciona", "como ganhar um cliente", "gerador de leads qualificados",
  ],
  excludedTopics: [],
  siloPage: { slug: "leads-sem-trafego-pago", canonical: PREFIXO, publishedUrl: null, status: "nova, ainda não publicada" },
  members: [
    membro("pilar-leads", 1, "leads qualificados", "qualificados", "Pilar"),
    membro("sup-instagram", 2, "instagram não traz pacientes", "instagram-nao-traz-pacientes"),
    membro("sup-captacao", 3, "captação de pacientes sem tráfego pago", "captacao-de-pacientes-sem-trafego-pago"),
    membro("sup-promocoes", 4, "promoções estética", "promocoes-para-estetica"),
    membro("sup-captar", 5, "como captar um cliente", "como-captar-um-cliente"),
    membro("sup-trafego", 6, "tráfego pago vs orgânico para clínica de estética", "trafego-pago-vs-organico-para-clinica-de-estetica"),
    membro("sup-campanhas", 7, "campanhas de marketing para clínica de estética sem anúncios", "campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios"),
    membro("sup-atrair", 8, "como atrair um cliente", "como-atrair-um-cliente"),
  ].map(item => (item.articleId === eu ? { ...item, articleId: ARTIGO, statusLabel: "neste arquivo", inThisFile: true, position: posicao } : item)),
} as RadarSiloExportWritingContext);

/* A Skill de voz real da AdalbaPro: a seção que proíbe recurso (texto copiado da linha "Voz da marca" do CSV). */
const VOZ: RadarBrandVoice = {
  versionId: "voz-1", version: 1, name: "AdalbaPro", contentHash: "sha256:voz", status: "draft", title: "AdalbaPro",
  sections: [
    { heading: "Missão", body: "Produzir conteúdo útil para profissionais que precisam divulgar clínicas e consultórios locais." },
    {
      heading: "Recursos antigos ou inadequados",
      body: [
        "Não recomendar Instagram Shopping, ativação de loja ou tutoriais de configuração desse recurso nos artigos deste projeto. Essa é uma exclusão editorial determinada pelo proprietário, não uma afirmação de encerramento universal do produto.",
        "Não transportar conselhos de lojas virtuais para consultórios automaticamente. Venda de produto e agendamento de atendimento são objetivos diferentes.",
        "Não recomendar funcionalidades apenas porque apareceram em um concorrente.",
        "Não afirmar que toda clínica está proibida de anunciar no Google ou que a Meta não oferece segmentação local.",
      ].join("\n\n"),
    },
  ],
  markdown: "",
};

/* ============================== a entrada ============================== */

type Observado = RadarCompetitiveObservedModel & Record<string, unknown>;
const kw = (text: string, role: string, volume: number | null = null) => ({
  identity: { keywordId: `kw-${text}`, text, role },
  strategy: { volume, kgrScore: null, normalizedIntent: "informacional", coveredIntentions: ["informacional"] },
  resolution: "FULL", provenance: { textSource: "hydration", strategySource: "article_reference" },
});
const pergunta = (canonicalQuestion: string, pages = 2, sampleSize = 12) => ({ canonicalQuestion, status: "MARKET_QUESTION_UNDERCOVERED", pages, sampleSize, declaredByArticle: false, evidence: `${pages} de ${sampleSize}` });
const candidatoFora = (observedLabel: string, sampleSize = 12) => ({ id: `fora:${observedLabel}`, observedLabel, pages: 1, sampleSize, dnaAligned: false, dnaRequired: false, intentFit: true, verdict: "OUT_OF_SCOPE", reason: "O ArticleDNA não declara este assunto e ele não toca a composição de keywords: pertence a outro artigo.", sectionId: null });
const diferencial = (subject: string, pagesCovering = 2) => ({ subject, basis: "SERP_EVIDENCE", pagesCovering, sources: [], evidence: `${pagesCovering} páginas` });

function entrada(opcoes: {
  principal: string;
  complementares?: string[];
  audiencia?: string;
  observado?: (observado: Observado) => void;
  modelo?: (modelo: Record<string, unknown> & { candidates: unknown[]; sections: unknown[] }) => void;
  comBlueprint?: boolean;
  outlines?: RadarCompetitorOutlinePage[];
}): RadarPortableExportInput {
  const base = entradaGoogle();
  const observado = structuredClone(base.googleObserved) as Observado;
  observado.questions = [];
  observado.aiDiscovery = null as never;
  opcoes.observado?.(observado);
  const modelo = structuredClone(base.articleModel) as unknown as Record<string, unknown> & { candidates: unknown[]; sections: unknown[] };
  opcoes.modelo?.(modelo);
  const complementares = opcoes.complementares ?? [];
  return {
    ...base,
    article: {
      ...base.article, principalKeyword: opcoes.principal, secondaryKeywords: complementares, mustCover: [],
      slug: opcoes.principal.replace(/\s+/g, "-"), audience: opcoes.audiencia ?? "Biomédicas estetas e profissionais de estética que atendem em clínicas e consultórios.",
      siloName: "Leads sem Tráfego Pago", articleRole: "support", promise: null,
    },
    researchContext: { ...base.researchContext!, keywords: [kw(opcoes.principal, "principal"), ...complementares.map(item => kw(item, "secundaria"))], resolvedKeywordTexts: [opcoes.principal, ...complementares], editorialTopics: [] } as never,
    googleObserved: observado as never,
    dossierGaps: base.dossierGaps ? { ...base.dossierGaps, observed: observado as never } : null,
    articleModel: modelo as never,
    internalLinks: [],
    authors: [{ name: "Adalberto Escalante", specialty: "SEO para clínicas", source: "contribution" }],
    ...(opcoes.comBlueprint ? {
      blueprintView: {
        blueprint: googleCompetitiveBlueprintOfAnalysis({ articleId: ARTIGO, articleDnaVersionId: "dna-v1", observed: observado, researchRefs: [], generatedAt: EXPORTADO_EM }),
        sample: { label: "página(s)", count: observado.sample.comparablePages },
      } as never,
    } : {}),
    ...(opcoes.outlines ? { competitorOutlines: opcoes.outlines } : {}),
  };
}

const contexto = (silo: RadarSiloExportWritingContext | null, extra: Partial<RadarWritingArticleContext> = {}): RadarWritingArticleContext =>
  ({ topRowLabel: silo ? "Silo" : "Marca", filePosition: 1, silo, articleId: ARTIGO, publication: null, ...extra });

/* ============================== a planta ============================== */

type Secao = RadarArticleBlueprintPayload["blueprint"]["sections"][number];
const secao = (h2: string, extra: Partial<Secao> = {}): Secao => ({
  h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta.", from: [], h3: [], explain: [], paragraphs: 3, bold: [], terms: [], evidence: [],
  specialist: null, video: null, internalLinks: [], externalLinks: [], image: null, practical: null, ...extra,
} as Secao);

const candidatosDoSilo = (): RadarArticleBlueprintPayload["linkCandidates"] => [
  { id: "K1", label: "leads qualificados", role: "Pilar", destination: "/qualificados", status: "PLANNED", fromGraph: true },
  { id: "K2", label: "instagram não traz pacientes", role: "Suporte", destination: `${PREFIXO}/instagram-nao-traz-pacientes`, status: "PUBLISHED", fromGraph: true },
  { id: "K3", label: "captação de pacientes sem tráfego pago", role: "Suporte", destination: `${PREFIXO}/captacao-de-pacientes-sem-trafego-pago`, status: "PUBLISHED", fromGraph: true },
  { id: "K4", label: "como captar um cliente", role: "Suporte", destination: "/como-captar-um-cliente", status: "PLANNED", fromGraph: true },
  { id: "K5", label: "como atrair um cliente", role: "Suporte", destination: "/como-atrair-um-cliente", status: "PLANNED", fromGraph: true },
  { id: "K6", label: "Página da marca /servicos/seo-para-clinicas", role: "Página da marca (Skill de voz)", destination: `${SITE}/servicos/seo-para-clinicas`, status: "PUBLISHED", fromGraph: false },
];

function planta(secoes: Secao[], extra: Partial<RadarArticleBlueprintPayload> = {}): RadarArticleBlueprintPayload {
  return {
    schemaVersion: 1,
    rulesVersion: "2026-10-09",
    blueprint: {
      keywordPlan: { reading: "A principal define a intenção.", principalPlacement: ["H1", "primeiro parágrafo"], complementary: [], slugNote: null },
      reader: "Profissionais de clínicas de estética que precisam atrair pacientes sem depender de tráfego pago.",
      promise: "Ao final, o leitor sabe o próximo passo.",
      angle: { statement: "Um guia prático com exemplos do setor.", evidence: [] },
      title: { h1: "Título de trabalho", alternatives: [], seoTitle: "Título de trabalho", metaDescription: "Meta de trabalho." },
      opening: { readerQuestion: "Qual é a pergunta principal?", direction: "Responder direto.", evidence: [] },
      sections: secoes,
      closing: { turn: "Retomar a resposta principal.", specialist: null, cta: "Conheça os serviços da marca.", nextStep: null },
      visual: [],
      eeat: ["Adalberto Escalante assina o artigo."],
      warnings: [],
    } as unknown as RadarArticleBlueprintPayload["blueprint"],
    measures: {
      serp: { comparablePages: 12, words: { median: 2789, p25: 1853, p75: 3288 }, h2: 12, h3: 13, paragraphs: 74, images: 23, lists: 4 },
      plan: { sections: secoes.length, h3: 0, paragraphs: 30, bold: 0, images: 0, respites: 0, internalLinks: 0, externalLinks: 0, wordsMin: 1853, wordsMax: 3288 },
    },
    linkCandidates: candidatosDoSilo(),
    sources: [],
    evidence: [],
    skeleton: [],
    ...extra,
  } as RadarArticleBlueprintPayload;
}

/* ============================== 1 · a estrutura nunca é cortada ============================== */

/* Uma seção do tamanho das de captar: 4 H3, 3 "Explicar", 12 evidências com URL, "Vem do esqueleto", termos, links e link externo. */
function secaoDeCaptar(indice: number): Secao {
  return secao(`Seção ${indice + 1} de captar com um título de tamanho real para a planta`, {
    readerQuestion: `Quais estratégias práticas posso usar para captar clientes no passo ${indice + 1}?`,
    answerFirst: "Combine estratégias ativas, como prospecção e indicações, com passivas, como conteúdo e presença online.",
    from: [],
    h3: ["Peça indicações para clientes atuais", "Capte clientes pela internet", "Use ferramentas para facilitar a prospecção", "10 dicas para conquistar novos clientes"],
    explain: [
      "Indicações são uma forma de ganhar clientes por confiança, quando o atendimento foi bom.",
      "Na internet, use conteúdo, redes sociais e SEO local para quem procura na região.",
      "Ferramentas como CRM ajudam a organizar contatos e follow-up sem perder ninguém.",
    ],
    terms: ["prospecção ativa", "prospecção passiva", "follow-up"],
    evidence: Array.from({ length: 12 }, (_, item) => `S${item + 1}`),
    internalLinks: [{ candidate: "K1", anchor: `captação de leads qualificados ${indice}`, reason: "Conectar ao Pilar." }],
    externalLinks: [{ claim: "O marketing de conteúdo é uma estratégia eficaz para captar clientes pela internet", sourceType: "fonte oficial", source: null }],
  });
}
const EVIDENCIAS_S = Array.from({ length: 12 }, (_, item) => ({ id: `S${item + 1}`, kind: "resultado orgânico", text: `Captação de clientes: o que é, como fazer e 5 dicas práticas ${item + 1} · https://www.rdstation.com/blog/vendas/captacao-de-clientes-${item + 1}/` }));

test("1 · a estrutura do tamanho da de captar e de promoções (mais de 14 mil) sai inteira, sem corte e sem compactação", () => {
  const plantaGrande = planta(Array.from({ length: 9 }, (_, indice) => secaoDeCaptar(indice)), { evidence: EVIDENCIAS_S });
  const ctx = contexto(SILO_LEADS("sup-captar", 5), { blueprint: plantaGrande });
  const artigo = buildRadarWritingExportArticle(entrada({ principal: "como captar um cliente", complementares: ["como captar clientes"] }), ctx);
  guardar(ctx, artigo.row);
  const estrutura = artigo.row.estrutura;
  assert.ok(estrutura.length > 14_000, `a fixture passa do teto antigo: ${estrutura.length}`);
  assert.ok(estrutura.length <= RADAR_WRITING_EXPORT_LIMITS.structureChars);
  assert.doesNotMatch(estrutura, /Célula cortada|Cortado para o artigo|Compactação/);
  assert.ok(estrutura.includes("## Seção 9 de captar"), "a última seção está na célula");
  assert.match(estrutura, /^Afirmações que só entram com fonte do pacote ou delimitadas \(regra geral 5\): /m, "a lista do fim, que promoções perdia, está inteira");
  assert.match(estrutura, /\. Sem fonte do pacote, escreva de forma qualificada ou omita; nenhuma ganha link externo sem fonte\.$/);
  const total = RADAR_WRITING_EXPORT_COLUMNS.reduce((soma, coluna) => soma + artigo.row[coluna].length, 0);
  assert.ok(total <= RADAR_WRITING_EXPORT_LIMITS.articleChars, `artigo com ${total}`);
  assert.equal(RADAR_WRITING_EXPORT_COLUMNS.some(coluna => /Cortado para o artigo caber|Célula cortada/.test(artigo.row[coluna])), false, "nenhuma coluna cortada");
});

test("1 · acima do limite seguro, a estrutura encolhe por níveis que dizem o que encolheu e, no limite, continua inteira na coluna de fontes", () => {
  /* Os níveis, na ordem e só os necessários. */
  const celula = [
    "ARTIGO-MODELO DA SERP (planta concluída do artigo; a redação é de quem escreve).",
    ...Array.from({ length: 20 }, (_, indice) => [
      "",
      `## Seção ${indice + 1}`,
      "- Vem do esqueleto da SERP: M1 \"Captar cliente e captação\"",
      "- Termos a nomear: persona · segmentação",
      "- Evidências: S1 (Captação de clientes · https://www.rdstation.com/blog/vendas/captacao-de-clientes/ · em todas as 4 lentes)",
    ]).flat(),
  ].join("\n");
  assert.equal(radarWritingCompactStructure(celula, 10_000).celula, celula, "abaixo do limite, byte a byte igual");
  const soUrl = radarWritingCompactStructure(celula, celula.length - 200);
  assert.deepEqual(soUrl.niveis.length, 1, soUrl.niveis.join(" | "));
  assert.equal(soUrl.continuacao, null);
  assert.match(soUrl.celula, /^Compactação \(a célula passou do limite seguro de uma planilha\): saíram as URLs das evidências \(fica o título de cada página; o topo orgânico com o endereço está na coluna serp_resumida\)\. O resto da estrutura está inteiro\.$/m);
  assert.match(soUrl.celula, /^- Evidências: S1 \(Captação de clientes · em todas as 4 lentes\)$/m);
  assert.match(soUrl.celula, /^- Vem do esqueleto da SERP: /m, "o nível seguinte só quando o anterior não basta");

  /* A planta gigante: compacta, e o que ainda passa vai inteiro, por seção, para a coluna de fontes. */
  /* Vinte seções do tamanho das de captar: mais que o dobro de uma planta real, e ainda sem corte nenhum. */
  const gigante = planta(Array.from({ length: 20 }, (_, indice) => secaoDeCaptar(indice)), { evidence: EVIDENCIAS_S });
  const ctx = contexto(SILO_LEADS("sup-captar", 5), { blueprint: gigante });
  const artigo = buildRadarWritingExportArticle(entrada({ principal: "como captar um cliente", complementares: ["como captar clientes"] }), ctx);
  guardar(ctx, artigo.row);
  const { estrutura, fontes_e_especialista: fontes } = artigo.row;
  assert.ok(estrutura.length <= RADAR_WRITING_EXPORT_LIMITS.structureChars, `estrutura com ${estrutura.length}`);
  assert.match(estrutura, /^Compactação \(a célula passou do limite seguro de uma planilha\): saíram as URLs das evidências .*; as linhas "Termos a nomear" de cada seção\. O resto da estrutura está inteiro\.$/m);
  assert.doesNotMatch(estrutura, /https:\/\/www\.rdstation\.com/, "as URLs das evidências saíram");
  assert.match(estrutura, /\[A estrutura continua na coluna fontes_e_especialista, no bloco "Continuação da coluna estrutura": as seções seguintes não couberam numa célula de planilha\.\]$/);
  assert.ok(fontes.startsWith(RADAR_WRITING_STRUCTURE_CONTINUATION), fontes.slice(0, 200));
  for (let indice = 1; indice <= 20; indice += 1) {
    const titulo = `## Seção ${indice} de captar com um título de tamanho real para a planta`;
    assert.equal((estrutura + "\n" + fontes).split(titulo).length - 1, 1, `a seção ${indice} aparece uma vez, inteira`);
  }
  assert.match(fontes, /Afirmações que só entram com fonte do pacote ou delimitadas \(regra geral 5\): /, "a lista do fim continua inteira");
  assert.doesNotMatch(estrutura + fontes, /Célula cortada|Cortado para o artigo caber/, "nada cortado no meio");
  assert.match(fontes, /^YMYL: /m, "as fontes do artigo continuam depois da continuação");
  /*
   * 2026-10-09 (correção · contrato-F1) · "sem corte nenhum" vale para TODAS as
   * colunas: com o teto do artigo em 48 mil, a continuação empurrava o corte
   * para cobrir_e_superar (a coluna do "Não cobrir"), serp_resumida e
   * plano_visual — o teste só olhava estrutura e fontes.
   */
  for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) assert.doesNotMatch(artigo.row[coluna], /Célula cortada|Cortado para o artigo caber/, coluna);
  assert.ok(artigo.row.cobrir_e_superar.startsWith("Como superar a SERP:\n"), "a cobrir_e_superar chega inteira");
  assert.ok(artigo.row.cobrir_e_superar.endsWith("\n- Data de atualização visível: 12 de 12 páginas mostram."), artigo.row.cobrir_e_superar);
});

test("1 (correção · contrato-F1) · quando o artigo passa do teto, 'Como superar' e 'Não cobrir' nunca são cortados; cede primeiro a SERP resumida", () => {
  const gigante = planta(Array.from({ length: 20 }, (_, indice) => secaoDeCaptar(indice)), { evidence: EVIDENCIAS_S });
  const ctx = contexto(SILO_LEADS("sup-captar", 5), { blueprint: gigante });
  const artigo = buildRadarWritingExportArticle(entrada({ principal: "como captar um cliente", complementares: ["como captar clientes"] }), ctx);
  const total = RADAR_WRITING_EXPORT_COLUMNS.reduce((soma, coluna) => soma + artigo.row[coluna].length, 0);
  assert.ok(RADAR_WRITING_EXPORT_LIMITS.articleChars >= 2 * RADAR_WRITING_EXPORT_LIMITS.structureChars, "o teto do artigo cabe a estrutura inteira (célula + continuação)");
  assert.ok(total <= RADAR_WRITING_EXPORT_LIMITS.articleChars, `artigo com ${total}`);
  assert.equal(RADAR_WRITING_EXPORT_CUT_ORDER.includes("cobrir_e_superar"), false, "a coluna do contrato não cede ao teto do artigo");
  assert.deepEqual(RADAR_WRITING_EXPORT_CUT_ORDER, ["serp_resumida", "plano_visual", "fontes_e_especialista"]);
});

/* ============================== 2 · uma base de amostra só ============================== */

/*
 * O caso de leads: 33 referências — 12 comparáveis entre as 20 de melhor
 * posição, 8 não comparáveis nelas (lista comercial, vídeo, vitrine) e 11
 * comparáveis depois. A coluna JSON corta em 20 pela posição: a lista impressa
 * dizia 12; o modelo conta 23.
 */
function trintaETres(observado: Observado, opcoes: { comparaveisDepois?: number; amostraDoModelo?: number } = {}) {
  const molde = observado.competitors[0];
  const depois = opcoes.comparaveisDepois ?? 11;
  const extras = [
    ...Array.from({ length: 8 }, (_, indice) => ({ ...molde, url: `https://vitrine-${indice}.com.br/comprar-leads`, domain: `vitrine-${indice}.com.br`, title: `Comprar leads ${indice}`, ranks: [{ keyword: "leads qualificados", role: "principal", rank: 13 + indice }], comparable: false, structure: null, extractionStatus: "not_extracted", format: null })),
    ...Array.from({ length: depois }, (_, indice) => ({ ...molde, url: `https://depois-${indice}.com.br/blog/leads-qualificados`, domain: `depois-${indice}.com.br`, title: `Leads qualificados ${indice}`, ranks: [{ keyword: "gerar leads qualificados", role: "secundaria", rank: 21 + indice }], comparable: true })),
  ];
  observado.competitors = [...observado.competitors, ...extras] as never;
  const amostra = opcoes.amostraDoModelo ?? 12 + depois;
  (observado.sample as { comparablePages: number }).comparablePages = amostra;
  const todasAsUrls = (observado.competitors as Array<{ url: string; comparable: boolean }>).filter(item => item.comparable).map(item => item.url);
  for (const conceito of (observado.concepts as { all: Array<{ sampleSize: number; sourceCount: number; supportingPages: Array<{ url: string }> }> }).all) {
    conceito.sampleSize = amostra;
    const extrasDoConceito = todasAsUrls.slice(12, 12 + 5).map(url => ({ pageId: url, url, title: url, heading: "x" }));
    conceito.supportingPages = [...conceito.supportingPages, ...extrasDoConceito];
    conceito.sourceCount = conceito.supportingPages.length;
  }
  for (const lacuna of observado.gaps as Array<{ sampleSize: number }>) lacuna.sampleSize = amostra;
  for (const sinal of (observado.authorityEvidence as { eeatSignals: Array<{ sampleSize: number; pages: number; key: string }> }).eeatSignals) {
    sinal.sampleSize = amostra;
    if (sinal.pages) sinal.pages = sinal.key === "NAMED_AUTHOR" ? 10 : 22;
  }
  for (const afirmacao of (observado.authorityEvidence as { claims: Array<{ market: { sampleSize: number } }> }).claims) afirmacao.market.sampleSize = amostra;
  observado.questions = [pergunta("Como gerar leads qualificados?", 6, amostra)] as never;
  observado.differentiations = [diferencial("Como medir resultados em geração de leads", 6)] as never;
}
const esbocosDasComparaveis = (observado: Observado): RadarCompetitorOutlinePage[] =>
  (observado.competitors as Array<{ url: string; domain: string; comparable: boolean }>).filter(item => item.comparable)
    .map((item, indice) => ({ url: item.url, title: item.domain, domain: item.domain, headings: [{ level: 2, text: "Faça parcerias" }, { level: 2, text: indice % 2 ? "Invista no atendimento" : "Defina o perfil do lead" }, ...(indice === 3 ? [{ level: 2, text: "Lead scoring na prática" }] : [])] }));

const PLANTA_DE_LEADS = () => planta([
  secao("O que é um lead qualificado?", { readerQuestion: "O que caracteriza um lead qualificado?", evidence: ["C1", "S1"] }),
  secao("Por que gerar leads qualificados?", { readerQuestion: "Por que devo investir em gerar leads qualificados?", evidence: ["C2", "D1"] }),
  secao("Lead qualificado vs. lead interessado: entenda a diferença", { readerQuestion: "Qual a diferença entre lead qualificado e lead interessado?", evidence: ["G1"] }),
], {
  evidence: [
    { id: "S1", kind: "resultado orgânico", text: "Leads qualificados: o que são e como atraí-los? · https://exactsales.com.br/leads-qualificados/" },
    { id: "C1", kind: "conceito da amostra", text: "Como montar a rotina de skincare facial? (17 de 23 páginas)" },
    { id: "C2", kind: "conceito da amostra", text: "Por que gerar leads? (7 de 23 páginas)" },
    { id: "D1", kind: "diferencial possível", text: "Por que gerar leads? (7 páginas cobrem)" },
    { id: "G1", kind: "lacuna", text: "Qual a diferença entre lead qualificado e lead interessado? (5 de 23 páginas cobrem)" },
  ],
});

test("2 · uma base só (leads 12×23): a lista, os temas, o 'Como superar', as fontes e os rótulos da planta falam de 23 páginas comparáveis", () => {
  let doCaso: Observado | null = null;
  const dados = entrada({ principal: "leads qualificados", complementares: ["gerar leads qualificados"], observado: observado => { trintaETres(observado); doCaso = observado; } });
  const comEsbocos = { ...dados, competitorOutlines: esbocosDasComparaveis(doCaso!) };
  /* 2026-10-09 · sem a planta concluída, nada sai (regra do dono); a base única vale na linha com a planta. */
  assert.throws(() => buildRadarWritingExportArticle(comEsbocos, contexto(SILO_LEADS("pilar-leads", 1))), (erro: unknown) => (erro as { code?: string }).code === "needs_article_blueprint");
  for (const blueprint of [PLANTA_DE_LEADS()]) {
    const ctx = contexto(SILO_LEADS("pilar-leads", 1), blueprint ? { blueprint } : {});
    const artigo = buildRadarWritingExportArticle(comEsbocos, ctx);
    guardar(ctx, artigo.row);
    const linha = tudo(artigo.row);
    const denominadores = radarSampleBasisDenominators(linha);
    assert.ok(denominadores.pages.length >= 6, `${blueprint ? "com" : "sem"} planta: ${JSON.stringify(denominadores)}`);
    assert.deepEqual([...new Set(denominadores.pages)], [23], `${blueprint ? "com" : "sem"} planta, um M de páginas: ${JSON.stringify(denominadores)}`);
    assert.deepEqual([...new Set(denominadores.sites)], [23], `${blueprint ? "com" : "sem"} planta, um S de sites: ${JSON.stringify(denominadores)}`);
    assert.match(artigo.row.serp_resumida, /^Páginas comparáveis lidas pela investigação \(a base das medidas e das contagens deste arquivo: 23 páginas comparáveis, de 23 sites\):$/m);
    assert.match(artigo.row.serp_resumida, /^- e mais 13 página\(s\) comparável\(is\), na investigação do Radar$/m);
    assert.match(artigo.row.serp_resumida, /^O que os concorrentes lidos cobrem \(H2\/H3 das 23 páginas comparáveis, de 23 sites; /m);
    assert.match(artigo.row.serp_resumida, /^- Parcerias · 23 de 23 sites · /m, "a recorrência conta os sites da base inteira, não os 12 da lista cortada");
    assert.match(artigo.row.cobrir_e_superar, /^- Autoria: 10 de 23 páginas identificam quem escreveu/m);
    assert.doesNotMatch(artigo.row.serp_resumida, /comprar-leads|vitrine-/, "a não comparável não entra na base");
    if (blueprint) {
      assert.match(artigo.row.estrutura, /^Concorrentes comparáveis \(23 páginas comparáveis, de 23 sites\): mediana de \d+ palavras/m);
      /*
       * 2026-10-09 (correção · contrato-F6) · o plano de parágrafos ("~W palavras
       * cada, como nos concorrentes") sai da mesma base da linha de baixo: W é a
       * mediana de palavras dividida pela de parágrafos dela.
       */
      const daBase = /^Concorrentes comparáveis \(23 páginas comparáveis, de 23 sites\): mediana de (\d+) palavras, [^,]+, [^,]+, (\d+) parágrafos/m.exec(artigo.row.estrutura);
      const doPlano = /\(~(\d+) palavras cada, como nos concorrentes\)/.exec(artigo.row.estrutura);
      assert.ok(daBase && doPlano, artigo.row.estrutura.slice(0, 600));
      assert.equal(Number(doPlano![1]), Math.round(Number(daBase![1]) / Number(daBase![2])), "uma base só na mesma célula");
      assert.match(artigo.row.estrutura, /D1 \(Por que gerar leads\? \(7 de 23 páginas cobrem\)\)/, "o D ganha o 'de M' da base");
      assert.match(artigo.row.estrutura, /G1 \(Qual a diferença entre lead qualificado e lead interessado\? \(5 de 23 páginas cobrem\)\)/, "o rótulo que já está na base fica");
    }
  }
});

test("2 (correção · contrato-F7) · o esqueleto do artigo-modelo conta o tema em SITES, como o CSV ('N de S sites'), nunca 'N de M páginas'", () => {
  let doCaso: Observado | null = null;
  const dados = entrada({ principal: "leads qualificados", complementares: ["gerar leads qualificados"], observado: observado => { trintaETres(observado); doCaso = observado; } });
  const comEsbocos = { ...dados, competitorOutlines: esbocosDasComparaveis(doCaso!) };
  const brief = buildRadarArticleBlueprintBrief({ entrada: comEsbocos, silo: SILO_LEADS("pilar-leads", 1), articleId: ARTIGO, publication: null });
  const dosTemas = brief.skeleton.flatMap(item => item.cover).filter(linha => linha.startsWith("tema tratado por"));
  assert.ok(dosTemas.length >= 1, JSON.stringify(brief.skeleton));
  for (const linha of dosTemas) assert.match(linha, /^tema tratado por \d+ de 23 sites comparáveis \(cabeçalhos dos concorrentes: não copie\)$/, linha);
});

test("2 · deriva (fotografia de 23, lista viva de 20): o rótulo é recontado pelas URLs; o que não tem URL perde a contagem — nunca outro M", () => {
  let doCaso: Observado | null = null;
  const dados = entrada({ principal: "leads qualificados", complementares: ["gerar leads qualificados"], observado: observado => { trintaETres(observado, { comparaveisDepois: 8, amostraDoModelo: 23 }); doCaso = observado; } });
  const conceito = (doCaso!.concepts as { all: Array<{ canonicalLabel: string; supportingPages: Array<{ url: string }> }> }).all[0];
  const naBase = conceito.supportingPages.length;
  const ctx = contexto(null, { blueprint: PLANTA_DE_LEADS() });
  const comLimitacao = { ...dados, competitorOutlines: esbocosDasComparaveis(doCaso!), researchLimitations: ["Nenhuma página foi visitada e nenhum vídeo foi assistido nesta leitura."] };
  const artigo = buildRadarWritingExportArticle(comLimitacao, ctx);
  guardar(ctx, artigo.row);
  const denominadores = radarSampleBasisDenominators(tudo(artigo.row));
  assert.deepEqual([...new Set(denominadores.pages)], [20], JSON.stringify(denominadores));
  assert.match(artigo.row.cobrir_e_superar, /As 20 páginas comparáveis, estas sim, foram lidas pela investigação/, "a limitação fala da base, não da fotografia");
  assert.match(artigo.row.estrutura, new RegExp(`C1 \\(${conceito.canonicalLabel.replace(/[?()]/g, "\\$&")} \\(${naBase} de 20 páginas\\)\\)`), "recontado pelas páginas que sustentam o conceito");
  assert.match(artigo.row.estrutura, /C2 \(Por que gerar leads\?\)/, "o rótulo que o modelo não tem perde a contagem e fica");
  assert.match(artigo.row.cobrir_e_superar, /^- Autoria: assine com autor real, sem inventar credencial\.$/m, "o sinal sem URL perde a contagem");
  assert.doesNotMatch(artigo.row.cobrir_e_superar, /Data de atualização visível/);
});

/* ============================== 3 · o artigo-modelo vence o "Não cobrir" genérico ============================== */

/* Leads: a planta mede "custo por lead" e fala do perfil; o "Não cobrir" proibia "Custo por Lead (CPL)" e "Perfil do Lead". */
const PLANTA_LEADS_REAL = () => planta([
  secao("O que é um lead qualificado?", {
    readerQuestion: "O que caracteriza um lead qualificado?",
    answerFirst: "Lead qualificado é a pessoa que demonstrou interesse real no seu serviço e tem potencial para se tornar cliente.",
    explain: ["Um lead qualificado combina interesse demonstrado e adequação ao perfil de cliente ideal."],
    terms: ["lead", "qualificação", "funil de vendas", "perfil de cliente ideal"],
  }),
  secao("Geração de leads qualificados: como medir resultados", {
    readerQuestion: "Como sei se minhas estratégias de geração de leads qualificados estão funcionando?",
    answerFirst: "Meça a geração de leads qualificados acompanhando métricas como taxa de conversão, custo por lead e origem dos leads.",
    h3: ["Métricas essenciais", "Ferramentas de análise"],
  }),
  secao("Lead qualificado vs. lead interessado: entenda a diferença", {
    readerQuestion: "Qual a diferença entre lead qualificado e lead interessado?",
    explain: ["A qualificação avalia fit, interesse e momento de compra.", "Comprar listas de leads pode trazer contatos desatualizados e sem interesse real."],
    internalLinks: [{ candidate: "K4", anchor: "como captar um cliente", reason: "Detalha a captação." }],
  }),
]);

test("3(a) · leads: o que o artigo-modelo cobre (custo por lead, perfil, funil de vendas) sai do 'Não cobrir'; o resto fica", () => {
  const dados = entrada({
    principal: "leads qualificados", complementares: ["gerar leads qualificados", "geração de leads qualificados"],
    modelo: modelo => {
      modelo.candidates = [...modelo.candidates, ...["Custo por Lead (CPL)", "Perfil do Lead", "Os leads no funil de vendas", "Vale a pena comprar listas de leads?", "MQL – Marketing Qualified Lead", "Erros comuns na qualificação de leads", "Ferramentas essenciais para gestão de leads"].map(rotulo => candidatoFora(rotulo))];
    },
  });
  const ctx = contexto(SILO_LEADS("pilar-leads", 1), { blueprint: PLANTA_LEADS_REAL() });
  const artigo = buildRadarWritingExportArticle(dados, ctx);
  guardar(ctx, artigo.row);
  const naoCobrir = naoCobrirDe(artigo.row.cobrir_e_superar).join("\n");
  /* "custo por lead" na resposta, "perfil de cliente ideal" e "funil de vendas" nos termos, "Comprar listas de leads" num "Explicar". */
  for (const coberto of ["Custo por Lead (CPL)", "Perfil do Lead", "Os leads no funil de vendas", "Vale a pena comprar listas de leads?"]) assert.doesNotMatch(naoCobrir, new RegExp(coberto.replace(/[()?]/g, "\\$&")), `${coberto}: a planta cobre, a planta vence`);
  for (const fica of ["MQL – Marketing Qualified Lead", "Erros comuns na qualificação de leads", "Ferramentas essenciais para gestão de leads"]) assert.match(naoCobrir, new RegExp(`"${fica}": O ArticleDNA não declara`), `${fica}: a planta não trata, continua fora`);
  /* E o que ficou fora continua sendo exclusão: a pergunta que o toca não é sugerida. */
  assert.ok(artigo.row.estrutura.includes("custo por lead"), "a planta mede custo por lead");
  /*
   * 2026-10-09 (correção · casos-reais-F9) · o PEDIDO do artigo-modelo segue a
   * mesma regra: com a planta anterior, o item genérico que ela trata não vai à
   * IA como "Fora do escopo (não cobrir)" — organizar de novo não tira da
   * planta o que o CSV declarou coberto por ela.
   */
  const semAnterior = buildRadarArticleBlueprintBrief({ entrada: dados, silo: SILO_LEADS("pilar-leads", 1), articleId: ARTIGO, publication: null });
  const comAnterior = buildRadarArticleBlueprintBrief({ entrada: dados, silo: SILO_LEADS("pilar-leads", 1), articleId: ARTIGO, publication: null, previous: PLANTA_LEADS_REAL() });
  for (const coberto of ["Custo por Lead (CPL)", "Perfil do Lead", "Os leads no funil de vendas"]) {
    assert.ok(semAnterior.outOfScope.includes(coberto), `sem a planta anterior, ${coberto} continua fora`);
    assert.equal(comAnterior.outOfScope.includes(coberto), false, `${coberto}: a planta anterior trata`);
  }
  for (const fica of ["MQL – Marketing Qualified Lead", "Erros comuns na qualificação de leads"]) assert.ok(comAnterior.outOfScope.includes(fica), fica);
});

/* Captar: H2 "Defina o perfil do seu cliente ideal", "…na primeira abordagem", H3 "O que faz um captador de clientes", "Diferença entre prospecção e captação". */
const PLANTA_CAPTAR = () => planta([
  secao("O que é captação de clientes e por que ela importa", {
    readerQuestion: "O que é captação de clientes e por que devo me preocupar com isso?",
    h3: ["O que caracteriza a captação de clientes", "Diferença entre prospecção e captação"],
    internalLinks: [{ candidate: "K1", anchor: "captação de leads qualificados", reason: "Pilar." }],
  }),
  secao("Defina o perfil do seu cliente ideal", { readerQuestion: "Como definir o perfil do cliente ideal para o meu negócio?", bold: ["perfil do cliente ideal", "ICP"] }),
  secao("Como captar clientes: estratégias práticas", {
    readerQuestion: "Quais estratégias práticas posso usar para captar clientes?",
    h3: ["Use ferramentas para facilitar a prospecção"],
    explain: ["Para atrair o cliente para uma loja física, a vitrine e o atendimento no balcão pesam."],
    internalLinks: [{ candidate: "K5", anchor: "como atrair um cliente", reason: "Artigo complementar." }],
  }),
  secao("Como conquistar um cliente na primeira abordagem", { readerQuestion: "O que fazer para conquistar um cliente no primeiro contato?" }),
  secao("Como conquistar clientes novos com prospecção ativa", { readerQuestion: "Como prospectar ativamente novos clientes sem ser invasivo?", h3: ["O que faz um captador de clientes"] }),
]);

/* As perguntas do "Não cobrir" do CSV real de captar. */
const PERGUNTAS_CAPTAR = [
  "Como abordar um cliente pela primeira vez?", "Como prospectar clientes da forma certa", "O que faz um captador de clientes?",
  "O que mais atrai cliente para uma loja física?", "O que não fazer se você quer mais clientes?",
  "Quais ferramentas utilizar para facilitar a prospecção e captação de clientes?", "Qual a diferença entre prospecção e captação de clientes?",
  "Qual a importância de definir o Perfil do Cliente Ideal (ICP)?", "Quem é responsável pela captação de clientes nas empresas?",
  "Como captar clientes pela internet", "Como captar clientes por telefone", "Como conseguir mais clientes com estratégia omnichannel",
];
const entradaDeCaptar = () => entrada({
  principal: "como captar um cliente",
  complementares: ["como conquistar os clientes", "como ganhar clientes", "como conquistar um cliente", "como conquistar clientes novos", "como captar clientes"],
  audiencia: "Profissional liberal ou pequeno empresário que precisa atrair clientes sem depender de tráfego pago.",
  observado: observado => { observado.questions = PERGUNTAS_CAPTAR.map(item => pergunta(item, 2)) as never; },
});

test("3(a) e 4 · captar: o que a planta trata (ICP, primeira abordagem, captador, ferramentas, prospecção × captação) sai do 'Não cobrir'; nenhum dono é tópico sem artigo", () => {
  const ctx = contexto(SILO_LEADS("sup-captar", 5), { blueprint: PLANTA_CAPTAR() });
  const artigo = buildRadarWritingExportArticle(entradaDeCaptar(), ctx);
  guardar(ctx, artigo.row);
  const cobrir = artigo.row.cobrir_e_superar;
  const naoCobrir = naoCobrirDe(cobrir).join("\n");
  /* 2026-10-09 (correção · contrato-F3) · "da forma certa" é palavra de modo: "Como prospectar clientes da forma certa" também sai (a planta trata prospecção num H2 e numa pergunta). */
  for (const coberta of ["Qual a importância de definir o Perfil do Cliente Ideal (ICP)?", "Como abordar um cliente pela primeira vez?", "O que faz um captador de clientes?", "Quais ferramentas utilizar para facilitar a prospecção e captação de clientes?", "Qual a diferença entre prospecção e captação de clientes?", "Como prospectar clientes da forma certa"]) {
    assert.equal(naoCobrir.includes(coberta), false, `${coberta}: a planta trata, sai do "Não cobrir"\n${naoCobrir}`);
  }
  assert.doesNotMatch(tudo(artigo.row), /outro tópico do Silo/, "4: o dono só é artigo do Silo");
  const donos = [...naoCobrir.matchAll(/pertence ao artigo "([^"]+)" do Silo/g)].map(achado => achado[1]);
  const artigosDoSilo = SILO_LEADS("sup-captar", 5).members.map(item => item.principalKeyword);
  for (const dono of donos) assert.ok(artigosDoSilo.includes(dono), `o dono "${dono}" é artigo da ordem narrativa`);
});

test("3(b) · o assunto de OUTRO ARTIGO do Silo fica no 'Não cobrir'; a seção da planta que o toca diz 'só mencione e linke'", () => {
  const ctx = contexto(SILO_LEADS("sup-captar", 5), { blueprint: PLANTA_CAPTAR() });
  const artigo = buildRadarWritingExportArticle(entradaDeCaptar(), ctx);
  const naoCobrir = naoCobrirDe(artigo.row.cobrir_e_superar);
  assert.ok(naoCobrir.includes("- \"O que mais atrai cliente para uma loja física?\": pertence ao artigo \"como atrair um cliente\" do Silo; não responder aqui."), naoCobrir.join("\n"));
  const estrutura = artigo.row.estrutura;
  const daSecao = estrutura.slice(estrutura.indexOf("## Como captar clientes: estratégias práticas"), estrutura.indexOf("## Como conquistar um cliente na primeira abordagem"));
  assert.match(daSecao, /^- Outro artigo do Silo: "O que mais atrai cliente para uma loja física\?" é assunto do artigo "como atrair um cliente"; aqui só mencione e linke para "como atrair um cliente" \(link L2\), sem responder a pergunta\.$/m, daSecao);
  assert.match(artigo.row.links_internos, /^L2 · âncora "como atrair um cliente" → Suporte "como atrair um cliente"/m, "o L é o mesmo da coluna de links");
  /* Sem link da planta para o artigo, cita sem link. */
  const semLink = PLANTA_CAPTAR();
  semLink.blueprint.sections[2] = { ...semLink.blueprint.sections[2], internalLinks: [] };
  const outra = buildRadarWritingExportArticle(entradaDeCaptar(), contexto(SILO_LEADS("sup-captar", 5), { blueprint: semLink })).row.estrutura;
  assert.ok(outra.includes(`- Outro artigo do Silo: "O que mais atrai cliente para uma loja física?" é assunto do artigo "como atrair um cliente"; aqui só mencione "como atrair um cliente" ${RADAR_WRITING_NO_APPROVED_LINK}, sem responder a pergunta.`), outra);
});

test("3(c) · leads: o 'Diferencial possível' nunca sugere o que o 'Não cobrir' tira ('Como identificar leads qualificados' × 'Como identificar um lead qualificado na prática')", () => {
  const ESBOCOS: RadarCompetitorOutlinePage[] = [
    { url: "https://exactsales.com.br/leads-qualificados/", title: "exactsales", domain: "exactsales.com.br", headings: [{ level: 2, text: "Como identificar leads qualificados" }, { level: 2, text: "Faça parcerias" }] },
    { url: "https://www.rdstation.com/blog/marketing/leads-qualificados/", title: "rdstation", domain: "www.rdstation.com", headings: [{ level: 2, text: "Lead scoring e pontuação de leads" }, { level: 2, text: "Faça parcerias" }] },
  ];
  const dados = entrada({
    principal: "leads qualificados", complementares: ["gerar leads qualificados"],
    observado: observado => { observado.differentiations = [diferencial("Como identificar um lead qualificado na prática", 6)] as never; },
    modelo: modelo => { modelo.candidates = [...modelo.candidates, candidatoFora("Como qualificar um lead na prática?")]; },
    outlines: ESBOCOS,
  });
  const comTema = planta([
    secao("O que é um lead qualificado?", { readerQuestion: "O que caracteriza um lead qualificado?", h3: ["Como identificar leads qualificados no atendimento"], explain: ["Pontuação de leads ajuda a separar o interesse real."] }),
  ]);
  const artigo = buildRadarWritingExportArticle(dados, contexto(null, { blueprint: comTema }));
  guardar(contexto(null), artigo.row);
  const cobrir = artigo.row.cobrir_e_superar;
  /* 2026-10-09 · a lista de diferenciais da SERP saiu da coluna (a planta decide): o diferencial fora do escopo não aparece, e a nota "resolvido" não é mais dita. */
  assert.doesNotMatch(cobrir, /Nota: o pacote também listava|Diferenciar em "Como identificar um lead qualificado na prática"/);
  assert.doesNotMatch(cobrir, /Diferencial possível: "Como identificar leads qualificados"/, "a sugestão não contradiz o 'Não cobrir'");
  assert.doesNotMatch(artigo.row.serp_resumida, /"Como identificar leads qualificados"/, "nem o tema da SERP");
  assert.match(cobrir, /^- Diferencial possível: "Lead scoring e pontuação de leads", tratado por um só site entre /m, "o tema que não toca o 'Não cobrir' continua diferencial");
});

/* ============================== 4 · o dono é artigo do Silo ============================== */

test("4 (correção · contrato-F2) · o tópico que é keyword de um artigo do Silo tem nele o dono: 'como conseguir mais clientes' é de 'como atrair um cliente'", () => {
  /* As keywords do ArticleDNA de cada membro do lote (o lote as passa); "como conseguir mais clientes" é complementar de "como atrair um cliente". */
  const palavras = new Map<string, readonly string[]>([
    ["sup-atrair", ["como atrair um cliente", "como conseguir mais clientes", "como ganhar um cliente", "como conquistar novos clientes"]],
    ["sup-captar", ["como captar um cliente", "como captar clientes"]],
  ]);
  const captacao = entrada({
    principal: "captação de pacientes sem tráfego pago", complementares: ["captação de pacientes dentista"],
    observado: observado => { observado.questions = ["Como conseguir mais clientes para minha empresa?", "Como fazer captação de pacientes no consultório?"].map(item => pergunta(item, 2)) as never; },
  });
  const comPalavras = contexto(SILO_LEADS("sup-captacao", 3), { siloMemberKeywords: palavras });
  const linha = buildRadarWritingExportArticle(captacao, comPlanta(captacao, comPalavras)).row;
  guardar(comPalavras, linha);
  assert.ok(naoCobrirDe(linha.cobrir_e_superar).includes("- \"Como conseguir mais clientes para minha empresa?\": pertence ao artigo \"como atrair um cliente\" do Silo; não responder aqui."), linha.cobrir_e_superar);
  assert.doesNotMatch(linha.cobrir_e_superar.split("Não cobrir:")[0], /Como conseguir mais clientes para minha empresa/, "não é pergunta deste artigo");
  /* Captar (as perguntas reais do CSV): a mesma keyword alheia deixa de ser "outro foco" e aponta o artigo dono. */
  const ctxCaptar = contexto(SILO_LEADS("sup-captar", 5), { siloMemberKeywords: palavras });
  const linhaCaptar = buildRadarWritingExportArticle(entradaDeCaptar(), comPlanta(entradaDeCaptar(), ctxCaptar)).row;
  guardar(ctxCaptar, linhaCaptar);
  assert.ok(naoCobrirDe(linhaCaptar.cobrir_e_superar).includes("- \"Como conseguir mais clientes com estratégia omnichannel\": pertence ao artigo \"como atrair um cliente\" do Silo; não responder aqui."), linhaCaptar.cobrir_e_superar);
});

test("4 · 'outro tópico do Silo' não existe mais: a pergunta do tópico sem artigo vai ao artigo que trata dela, fica neste artigo ou é outro foco", () => {
  /* Instagram (Suporte 2): "Como captar clientes pelo WhatsApp?" ia a "como atrair clientes pelo whatsapp", keyword de "Tópicos incluídos". */
  const instagram = entrada({
    principal: "como atrair clientes pelo instagram", complementares: ["instagram não traz pacientes"],
    observado: observado => {
      observado.questions = ["Como captar clientes pelo WhatsApp?", "Como prospectar clientes pelo Instagram com tráfego orgânico?", "Como prospectar mais clientes pelo Instagram?", "Como transformar seguidores em clientes no Instagram?", "Devo seguir meus clientes no Instagram?"].map(item => pergunta(item, 2)) as never;
    },
  });
  const ctx = contexto(SILO_LEADS("sup-instagram", 2));
  const artigo = buildRadarWritingExportArticle(instagram, comPlanta(instagram, ctx));
  guardar(ctx, artigo.row);
  assert.ok(naoCobrirDe(artigo.row.cobrir_e_superar).includes("- \"Como captar clientes pelo WhatsApp?\": pertence ao artigo \"como captar um cliente\" do Silo; não responder aqui."), artigo.row.cobrir_e_superar);
  assert.doesNotMatch(tudo(artigo.row), /outro tópico do Silo|pertence a "como atrair clientes pelo whatsapp"/);
  /* Tráfego (Suporte 6): "trafego pago como funciona" é tópico sem artigo — a pergunta vira outro foco, nunca "pertence a" ele. */
  const trafego = entrada({
    principal: "tráfego pago vs orgânico para clínica de estética", complementares: ["trafego organico e pago"],
    observado: observado => { observado.questions = ["Como funciona o tráfego vindo de ferramentas de IA?", "Como fazer tráfego orgânico?", "Como medir o tráfego orgânico?", "Qual a diferença entre tráfego orgânico e pago?"].map(item => pergunta(item, 2)) as never; },
  });
  const linhaTrafego = buildRadarWritingExportArticle(trafego, comPlanta(trafego, contexto(SILO_LEADS("sup-trafego", 6)))).row;
  guardar(contexto(SILO_LEADS("sup-trafego", 6)), linhaTrafego);
  assert.doesNotMatch(tudo(linhaTrafego), /pertence a "trafego pago como funciona"|outro tópico do Silo/);
});

/* ============================== 5 · as exclusões da voz da marca ============================== */

test("5 · Instagram: a voz da marca proíbe Instagram Shopping — sai de 'Como superar', temas, perguntas e termos, e entra no 'Não cobrir' com a seção da Skill", () => {
  const esbocos: RadarCompetitorOutlinePage[] = ["www.nextar.com.br", "www.nuvemshop.com.br", "www.bagy.com.br", "conteudo.stone.com.br"].map((domain, indice) => ({
    url: `https://${domain}/blog/como-atrair-clientes-instagram`, title: domain, domain,
    headings: [{ level: 2, text: "Ative o Instagram Shopping" }, { level: 2, text: "Crie uma bio atrativa" }, ...(indice < 2 ? [{ level: 2, text: "Instagram Shopping para vender mais" }] : [])],
  }));
  const instagram = entrada({
    principal: "como atrair clientes pelo instagram", complementares: ["instagram não traz pacientes"],
    observado: observado => {
      observado.differentiations = [diferencial("Ative o Instagram Shopping", 2)] as never;
      observado.questions = ["Como prospectar clientes pelo Instagram com o Instagram Shopping", "Como prospectar mais clientes pelo Instagram?", "Como transformar seguidores em clientes no Instagram?", "Como montar uma loja virtual no Instagram?"].map(item => pergunta(item, 2)) as never;
    },
    outlines: esbocos,
  });
  /* 2026-10-09 · a linha sai com a planta concluída, organizada com a mesma Skill de voz (as exclusões chegam ao esqueleto e à conferência). */
  const lote = radarPortableWritingExport({
    articles: [{ articleId: ARTIGO, entrada: instagram, lentes: [], blueprint: plantaDe(instagram, { articleId: ARTIGO, brandVoice: VOZ }) } as never],
    lenses: LEITURA_DAS_LENTES, plan: null, today: EXPORTADO_EM, brandVoice: { kind: "available", voice: VOZ },
  });
  CSVS.push(lote.csv!);
  const exclusoes = radarBrandVoiceExclusions(VOZ).map(item => item.label);
  assert.deepEqual(exclusoes, ["Instagram Shopping", "ativação de loja", "conselhos de lojas virtuais"], "a régua única da voz (agente R)");
  const linha = lote.csv!;
  assert.doesNotMatch(linha, /Diferenciar em ""Ative o Instagram Shopping""/, "o diferencial que a voz proíbe não é movimento");
  /* 2026-10-09 · a lista de diferenciais da SERP saiu da coluna: não há o que conciliar, e a nota "resolvido" não é mais dita. */
  assert.doesNotMatch(linha, /Nota: o pacote também listava/);
  assert.match(linha, /- Exclusão da voz da marca \(seção ""Recursos antigos ou inadequados"" da Skill\): não recomendar nem sugerir Instagram Shopping, ativação de loja, conselhos de lojas virtuais — em nenhuma seção, tema, pergunta ou diferencial\./);
  const artigo = linha.split("\r\n").slice(-2).join("\n");
  assert.doesNotMatch(artigo.replace(/Exclusão da voz da marca[^\n]*/g, "").replace(/Seção ""[^"]*"" removida: a voz da marca exclui[^\n]*/g, ""), /Instagram Shopping|loja virtual/, "nem tema, nem pergunta, nem termo");
  assert.match(artigo, /Como prospectar mais clientes pelo Instagram\?/, "a pergunta que não toca a exclusão fica (abertura ou lista)");
  assert.match(artigo, /^- Como transformar seguidores em clientes no Instagram\?/m, "a pergunta que não toca a exclusão fica");
  assert.match(artigo, /Bio atrativa · 4 de \d+ sites/, "o tema que não toca a exclusão fica");
});

/* ============================== 6 · sustentar a própria keyword não é diferencial ============================== */

test("6 · atrair: 'Sustentar \"como atrair um cliente\"' e 'Sustentar \"como ganhar um cliente\"' saem; o diferencial de verdade fica", () => {
  const atrair = entrada({
    principal: "como atrair um cliente",
    complementares: ["como conquistar novos clientes", "como ganhar um cliente", "como conseguir mais clientes", "como atrair mais clientes", "como conquistar clientes"],
    observado: observado => { observado.differentiations = [diferencial("como atrair um cliente", 3), diferencial("como ganhar um cliente", 3), diferencial("Conheça o seu público", 2)] as never; },
    comBlueprint: true,
  });
  /*
   * 2026-10-09 · os diferenciais do blueprint competitivo ("Sustentar…") saíram
   * do "Como superar": são matéria-prima do gerador. Na linha (com a planta),
   * nenhum "Sustentar" volta; o diferencial que a planta ASSUME sai com a seção
   * onde ela o cobre — e a própria keyword nunca é diferencial (regra 6).
   */
  const ctx = contexto(SILO_LEADS("sup-atrair", 8));
  const artigo = buildRadarWritingExportArticle(atrair, comPlanta(atrair, ctx));
  guardar(ctx, artigo.row);
  const superar = comoSuperarDe(artigo.row.cobrir_e_superar).join("\n");
  assert.doesNotMatch(superar, /"como atrair um cliente"|"como ganhar um cliente"/, superar);
  assert.doesNotMatch(superar, /^- Sustentar /m, superar);
  const brief = buildRadarArticleBlueprintBrief({ entrada: atrair, silo: SILO_LEADS("sup-atrair", 8), articleId: ARTIGO, publication: null });
  const diferenciais = brief.evidence.filter(item => item.id.startsWith("D")).map(item => item.text);
  assert.ok(diferenciais.some(item => /Conheça o seu público/.test(item)), `o diferencial de verdade chega ao gerador: ${diferenciais.join(" | ")}`);
  assert.equal(diferenciais.some(item => /^como (?:atrair|ganhar) um cliente\b/i.test(item)), false, `a própria keyword não chega como diferencial: ${diferenciais.join(" | ")}`);
  /* A planta que assume o diferencial (evidência D na seção): o "Como superar" diz onde. */
  const idDoPublico = brief.evidence.find(item => item.id.startsWith("D") && /Conheça o seu público/.test(item.text))!.id;
  const resposta = respostaDaPlanta(brief);
  const secoes = (resposta.sections as Array<Record<string, unknown>>).map((item, indice) => (indice === 0 ? { ...item, evidence: [idDoPublico] } : item));
  const comDiferencial = buildRadarWritingExportArticle(atrair, { ...ctx, blueprint: plantaDe(atrair, { silo: SILO_LEADS("sup-atrair", 8), articleId: ARTIGO, resposta: { sections: secoes } }) });
  assert.match(comoSuperarDe(comDiferencial.row.cobrir_e_superar).join("\n"), /^- Diferenciar em "Conheça o seu público[^"]*" na seção "[^"]+": diferencial da SERP que o artigo-modelo assume\.$/m, comDiferencial.row.cobrir_e_superar);
});

/* ============================== 10 · um CTA só ============================== */

test("10 · planta antiga do Instagram: o CTA que cita a página comercial ganha o link dela; a continuação é opcional, no corpo, nunca no fechamento", () => {
  const antiga = planta([
    secao("O primeiro passo: otimize seu perfil para atrair clientes locais", { internalLinks: [{ candidate: "K5", anchor: "como atrair um cliente", reason: "Complementa." }] }),
    secao("Instagram não traz pacientes quando o pessoal da clínica vira refém do jogo de influencer", { internalLinks: [{ candidate: "K3", anchor: "captação de pacientes sem tráfego pago", reason: "Alternativa orgânica." }] }),
    secao("O Instagram continua no jogo, mas no lugar certo", { internalLinks: [{ candidate: "K1", anchor: "gerar leads qualificados", reason: "Pilar." }] }),
  ], { rulesVersion: undefined });
  antiga.blueprint.closing = { ...antiga.blueprint.closing, cta: "Se você quer parar de depender do Instagram e construir uma presença orgânica que traz pacientes, conheça nossos serviços de SEO para clínicas." };
  const ctx = contexto(SILO_LEADS("sup-instagram", 2), { blueprint: antiga });
  const artigo = buildRadarWritingExportArticle(entrada({ principal: "como atrair clientes pelo instagram", complementares: ["instagram não traz pacientes"] }), ctx);
  guardar(ctx, artigo.row);
  assert.match(artigo.row.links_internos, /^L4 · âncora "serviços de SEO para clínicas" → Página da marca \(Skill de voz\) "Página da marca \/servicos\/seo-para-clinicas" → https:\/\/adalbapro\.com\.br\/servicos\/seo-para-clinicas \(publicado\) · onde: seção "O Instagram continua no jogo, mas no lugar certo"/m);
  assert.match(artigo.row.estrutura, /^Link da chamada: L4, âncora "serviços de SEO para clínicas" → Página da marca \/servicos\/seo-para-clinicas \(no fim da última seção, junto da chamada\)\.$/m);
  const fechamento = artigo.row.estrutura.slice(artigo.row.estrutura.indexOf("\nFechamento:"));
  assert.doesNotMatch(fechamento, /Continuação|Leitura seguinte|Próximo passo/, "o fechamento tem uma chamada só");
  assert.match(artigo.row.estrutura, /^- Leitura seguinte \(opcional, não é uma chamada\): o link L2 desta seção leva ao próximo artigo do Silo, "captação de pacientes sem tráfego pago"; se couber, apresente-o ali/m);
  /* 2026-10-09 · sem planta, nada sai; com a planta que não liga o próximo artigo, a continuação é citada sem link, no corpo, nenhuma na promessa. */
  const doInstagram = entrada({ principal: "como atrair clientes pelo instagram", complementares: ["instagram não traz pacientes"] });
  assert.throws(() => buildRadarWritingExportArticle(doInstagram, contexto(SILO_LEADS("sup-instagram", 2))), (erro: unknown) => (erro as { code?: string }).code === "needs_article_blueprint");
  const semLink = buildRadarWritingExportArticle(doInstagram, contexto(SILO_LEADS("sup-instagram", 2), { blueprint: plantaDe(doInstagram, { silo: SILO_LEADS("sup-instagram", 2), articleId: ARTIGO, semLinks: true }) })).row;
  guardar(contexto(SILO_LEADS("sup-instagram", 2)), semLink);
  assert.doesNotMatch(semLink.promessa_e_leitor, /Continuação|Leitura seguinte/);
  assert.match(semLink.estrutura, /^- Leitura seguinte \(opcional, não é uma chamada\): se couber, mencione o próximo artigo do Silo, "captação de pacientes sem tráfego pago", no corpo desta seção \(cite sem link: /m);
});

/* ============================== 14 · publicado sem artigo-modelo ============================== */

const H2_CAMPANHAS = [
  "O que define uma campanha sem anúncios para estética?",
  "Por que campanhas sem anúncios falham em clínicas de estética?",
  "Quais campanhas orgânicas fazem sentido para clínica de estética?",
  "Como montar campanhas de marketing para clínica de estética sem virar refém de post",
  "Erros que enfraquecem campanhas sem anúncios",
  "Por que escolher a AdalbaPro em vez de uma agência comum?",
  "Campanhas sem anúncios precisam de estrutura, não de mais improviso",
];

function entradaDeCampanhas() {
  return entrada({
    principal: "campanhas de marketing",
    complementares: ["campanhas de marketing para clínica de estética sem anúncios", "campanhas de marketing digital de sucesso"],
    audiencia: "Responsável por clinica.",
    observado: observado => { observado.differentiations = [diferencial("Exemplos dos 4 Ps do marketing", 2), diferencial("Resultados Digitais (RD Station)", 3)] as never; },
    comBlueprint: true,
    modelo: modelo => {
      const molde = modelo.sections[0] as Record<string, unknown>;
      const filha = (id: string, titulo: string, extra: Record<string, unknown> = {}) => ({ ...molde, id, level: 3, parentId: "section:mkt", headingSuggestion: titulo, readerQuestion: titulo, coveragePoints: [], mustCoverReasons: [], childSections: [], ...extra });
      modelo.sections = [
        {
          ...molde, id: "section:mkt", headingSuggestion: "O que caracteriza marketing digital?", readerQuestion: "O que é marketing digital?", coveragePoints: ["características de marketing digital"], mustCoverReasons: [],
          childSections: [
            filha("section:4ps", "Exemplos dos 4 Ps do marketing"),
            filha("section:serve", "Para que serve uma estratégia de marketing digital?", { coveragePoints: ["resultados Digitais (RD Station)"] }),
            filha("section:naofazer", "O que não fazer no marketing digital de sucesso?", { coveragePoints: ["não fazer no marketing digital de sucesso"], mustCoverReasons: ["O ArticleDNA declara \"marketing digital de sucesso\": ele precisa ser coberto, e a arquitetura decide onde."] }),
            filha("section:erros", "Erros que enfraquecem uma campanha sem anúncios", { coveragePoints: ["erros de campanha"] }),
            filha("section:falham", "Por que campanhas orgânicas falham sem planejamento", { coveragePoints: ["planejamento da campanha"] }),
          ],
        },
      ];
      modelo.candidates = [...modelo.candidates, candidatoFora("Quais são os 4 Ps do marketing?"), candidatoFora("Como usar os 4 Ps do marketing em sua estratégia"), candidatoFora("Os piores erros de marketing"), candidatoFora("Mais conteúdos de Marketing")];
    },
  });
}

const publicacaoDeCampanhas = (): RadarWritingPublication => ({
  published: true, publishedUrl: `${PREFIXO}/campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios`, canonical: `${PREFIXO}/campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios`,
  slug: "campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios", principalPolicy: "revisable",
  currentStructure: { h1: "Campanhas sem anúncios para estética: quando post não sustenta captação", h2: [...H2_CAMPANHAS, "Perguntas frequentes"], updatedAt: null },
});

/*
 * 2026-10-09 · regra do dono: o publicado sem artigo-modelo não sai mais pela
 * "estrutura de referência" legada (a página publicada com o modelo da SERP de
 * complemento) — sem a planta concluída, nada sai. Com ela, cada H2 publicado
 * tem destino no mapa da planta; as réguas que o caso real pediu (os 4 Ps fora
 * de toda sugestão, a regra 3(a) com a referência, o FAQ legado) continuam.
 */
test("14 · campanhas publicado: sem artigo-modelo, nada sai; com ele, cada H2 publicado tem destino e os 4 Ps somem de toda sugestão", () => {
  const ctx = contexto(SILO_LEADS("sup-campanhas", 7), { publication: publicacaoDeCampanhas() });
  assert.throws(() => buildRadarWritingExportArticle(entradaDeCampanhas(), ctx), (erro: unknown) => (erro as { code?: string }).code === "needs_article_blueprint");
  const artigo = buildRadarWritingExportArticle(entradaDeCampanhas(), comPlanta(entradaDeCampanhas(), ctx));
  guardar(ctx, artigo.row);
  const estrutura = artigo.row.estrutura;
  assert.match(estrutura, /^ARTIGO-MODELO DA SERP \(planta concluída do artigo/);
  assert.doesNotMatch(estrutura, /^Estrutura de referência:|^Temas do modelo da SERP sem H2 publicado|^- Atualizar: reescrever na voz; complemento da SERP/m, "a estrutura legada do publicado saiu");
  /* Cada H2 publicado aparece com o destino dito (no mapa da coluna artigo ou na estrutura da planta), e o FAQ legado pela regra dele. */
  const comMapa = `${artigo.row.artigo}\n${estrutura}`;
  for (const h2 of H2_CAMPANHAS) assert.ok(comMapa.includes(h2.slice(0, 60)), h2);
  assert.match(artigo.row.artigo, /^- "Perguntas frequentes" → FAQ legado: segue a regra do FAQ legado, abaixo$/m, artigo.row.artigo);
  /* Os 4 Ps: o "Não cobrir" os proíbe, e nada os sustenta (o descarte do esqueleto diz o motivo). */
  const linha = tudo(artigo.row);
  assert.doesNotMatch(linha.replace(/^- "(?:Quais são os 4 Ps do marketing\?|Como usar os 4 Ps do marketing em sua estratégia)":.*$/gm, "").replace(/^Descartado do esqueleto da SERP:.*$/gm, ""), /4 Ps/, "nem estrutura, nem 'Sustentar', nem tema");
  const naoCobrir = naoCobrirDe(artigo.row.cobrir_e_superar).join("\n");
  assert.match(naoCobrir, /"Quais são os 4 Ps do marketing\?": O ArticleDNA não declara/);
  assert.doesNotMatch(artigo.row.pode_escrever, /não produziu estrutura/);
});

/* ============================== a varredura D10 ============================== */

test("D10 · todo CSV desta rodada sai sem palavra proibida, sem célula cortada, sem 'outro tópico do Silo' e sem continuação no fechamento", () => {
  assert.ok(CSVS.length >= 10, `os testes acima geraram ${CSVS.length} CSV(s)`);
  for (const csv of CSVS) {
    const texto = doExport(csv);
    for (const proibida of D10) {
      const achado = texto.split(/\r?\n/).find(linha => proibida.test(linha));
      assert.equal(achado, undefined, `${proibida}: ${achado?.slice(0, 200)}`);
    }
  }
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
