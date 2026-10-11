import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_HUMAN_VOICE_CORE,
  RADAR_HUMAN_VOICE_GUIDELINE_VERSION,
  RADAR_HUMAN_VOICE_H2,
  RADAR_HUMAN_VOICE_INTENTIONAL_ERRORS,
  RADAR_HUMAN_VOICE_PRECEDENCE,
  RADAR_HUMAN_VOICE_RULES,
  RADAR_HUMAN_VOICE_SERP_RULES,
  RADAR_HUMAN_VOICE_SERP_SUMMARY,
  radarHumanVoiceBrandVoiceRowNote,
  radarHumanVoiceCatalogNote,
  radarHumanVoiceGenericBait,
  radarHumanVoiceHeadingHasKeyword,
  radarHumanVoiceKeywordEarly,
  radarHumanVoicePromptBlock,
  radarHumanVoiceRedatorRule,
  radarHumanVoiceStartsWithKeyword,
  radarHumanVoiceTitleWithKeywordFirst,
  radarHumanVoiceVideoRule,
  radarHumanVoiceWritingRule,
} from "../lib/radar/human-voice-guideline.ts";
import {
  RADAR_ARTICLE_BLUEPRINT_RULES_VERSION,
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarArticleBlueprintColumns,
  radarArticleBlueprintH2Merges,
  radarArticleBlueprintPayloadReading,
  radarArticleBlueprintPendingNotes,
  radarArticleBlueprintPrompt,
  radarArticleBlueprintReading,
  radarArticleBlueprintRulesNoticeText,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import {
  RADAR_WRITING_EXPORT_COLUMNS,
  RADAR_WRITING_GENERAL_RULES,
  buildRadarWritingBrandVoiceRow,
  buildRadarWritingExportArticle,
  buildRadarWritingTopRow,
  radarWritingExportCsv,
  type RadarWritingArticleContext,
  type RadarWritingExportRow,
  type RadarWritingPublication,
} from "../lib/radar/portable-writing-export.ts";
import { RADAR_VIDEO_GENERAL_RULES, buildRadarVideoBrandVoiceRow, buildRadarVideoExportArticle, buildRadarVideoTopRow } from "../lib/radar/portable-video-export.ts";
import { radarSentenceNeedsSource } from "../lib/radar/pending-claims.ts";
import type { RadarBrandVoiceState } from "../lib/radar/brand-voice.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import type { RadarSiloExportWritingContext } from "../lib/radar/portable-silo-export.ts";
import { IMPROVE_SYSTEM_PROMPT, SECTION_WRITING_SYSTEM_PROMPT } from "../lib/redator/prompts.ts";
import { CAROUSEL_SEED_SYSTEM_PROMPT, SCRIPT_SEED_SYSTEM_PROMPT } from "../lib/redator/deliverable-seed.ts";
import { WRITER_BLUEPRINT_READING_RULES, writerArticleBlueprintForWriting } from "../lib/redator/writer-blueprint-for-writing.ts";
import { operationById } from "../lib/agent/platform-catalog.ts";
import { ARTIGO, entradaGoogle } from "./radar-portable-writing-fixtures.mts";
import { respostaDaPlanta } from "./radar-piloto-planta-fixtures-2026-10-09.mts";

/*
 * ===== 2026-10-11 · A DIRETRIZ DE COMUNICAÇÃO HUMANA GUIADA PELA SERP (pedido do dono) =====
 *
 * Os dois documentos do dono ("Diretrizes de comunicação humana" e "Visão
 * estratégica muito forte sobre a apatia dos conteúdos gerados por IA") e as
 * observações do Guardião de SEO do site dele viram UMA fonte
 * (`lib/radar/human-voice-guideline.ts`) que chega igual ao pedido do
 * artigo-modelo, ao CSV "Para escrever" (linha de topo e linha "Voz da marca"),
 * aos prompts do Redator, ao CSV de vídeo, à semente de roteiro e carrossel e ao
 * catálogo do MCP. A SERP continua mandando no conteúdo; a diretriz manda na voz.
 *
 * O caso real: "artigo-como-atrair-um-cliente-para-escrever.csv" (11/10), com a
 * planta gravada de 7 H2 e os títulos reais (SEO title "Como atrair um cliente:
 * guia prático para clínicas", meta "Descubra como atrair um cliente…"). Sem
 * rede, sem IA, sem banco.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* D10 (entregável sai concluído) e as esperas antigas que o dono tirou. */
const D10 = [
  /\bpend[eê]ncia/i, /pendente de/i, /aguardando aprova/i, /rascunho/i, /fonte a obter/i, /\bpreencher\b/i, /pe[cç]a ao Arquiteto/i,
  /confira se a coleta traz/i, /conferir antes/i, /confira antes de aprovar/i, /\ba definir\b/i,
];
const semD10 = (texto: string, onde: string) => {
  /* Trecho de terceiro entre aspas curvas (snippet da SERP) é pesquisa citada, não texto do entregável. */
  for (const proibida of D10) assert.doesNotMatch(texto.replace(/“[^”]*”/g, "“…”"), proibida, `${onde}: ${proibida}`);
};
const semComentario = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const lerFonte = async (caminho: string) => semComentario(await readFile(new URL(caminho, import.meta.url), "utf8"));

/* ============================== o caso real ============================== */

const SITE = "https://adalbapro.com.br";
const PREFIXO = `${SITE}/leads-sem-trafego-pago`;
const PRINCIPAL = "como atrair um cliente";
const COMPLEMENTARES = ["como conquistar novos clientes", "como ganhar um cliente", "como conseguir mais clientes", "como atrair mais clientes", "como conquistar clientes"];

const membro = (articleId: string, position: number, principal: string, slug: string, role = "Suporte") =>
  ({ articleId, position, title: principal, principalKeyword: principal, slug, role, statusLabel: "fora desta seleção", inThisFile: false, reason: null });
const SILO = (): RadarSiloExportWritingContext => ({
  kind: "silo", label: "Leads sem Tráfego Pago", partial: true, draft: false, centralEntity: "Leads sem Tráfego Pago",
  objective: "Construir autoridade em leads sem tráfego pago.", audience: null, macroProblem: null, dominantIntent: null, whyTogether: null,
  boundary: null, includedTopics: [], excludedTopics: [],
  siloPage: { slug: "leads-sem-trafego-pago", canonical: PREFIXO, publishedUrl: null, status: "nova, ainda não publicada" },
  members: [
    membro("pilar-leads", 1, "leads qualificados", "qualificados", "Pilar"),
    membro("sup-trafego", 2, "tráfego pago vs orgânico para clínica de estética", "trafego-pago-vs-organico-para-clinica-de-estetica"),
    { ...membro(ARTIGO, 3, PRINCIPAL, "como-atrair-um-cliente"), statusLabel: "finalizado", inThisFile: true },
  ],
} as RadarSiloExportWritingContext);
const novo = (slug: string): RadarWritingPublication => ({ published: false, publishedUrl: null, canonical: null, slug, principalPolicy: null });

function entrada(): RadarPortableExportInput {
  const base = entradaGoogle();
  return {
    ...base,
    article: {
      ...base.article, principalKeyword: PRINCIPAL, secondaryKeywords: COMPLEMENTARES, narrativeReinforcements: [], mustCover: [],
      slug: "como-atrair-um-cliente", canonical: null, siloName: "Leads sem Tráfego Pago", articleRole: "support", publishedProtected: false,
      audience: "Profissionais de clínicas de estética e saúde que buscam atrair clientes sem depender de tráfego pago.", promise: null,
    },
    authors: [{ name: "Adalberto Escalante", specialty: null, source: "contribution" }],
  };
}

type Secao = RadarArticleBlueprintPayload["blueprint"]["sections"][number];
const secao = (h2: string, readerQuestion: string, h3: string[], links: Array<[string, string]> = [], image: string | null = null): Secao => ({
  h2, readerQuestion, answerFirst: "Resposta direta.", from: [], h3, explain: [], paragraphs: 3, bold: [], terms: [], evidence: [],
  specialist: null, video: null, internalLinks: links.map(([candidate, anchor]) => ({ candidate, anchor, reason: "Aprofunda o tema." })), externalLinks: [], image, practical: null,
} as Secao);

/* As 7 seções do CSV real, com os H3 e as perguntas como saíram. */
const SECOES_REAIS = (): Secao[] => [
  secao("Como atrair clientes no dia a dia?", "Como atrair clientes no dia a dia?", ["O que considerar sobre praticidade para o cliente?", "Exemplo prático: como uma clínica pode facilitar o agendamento"], [], "R1"),
  secao("Como conquistar novos clientes com abordagem e relacionamento?", "Como conquistar novos clientes?", ["O que caracteriza a captação de clientes?", "O que considerar sobre atrair novos clientes?", "Como ganhar um cliente com uma abordagem consultiva?", "Dicas para atrair clientes sem parecer insistente"]),
  secao("Como conseguir mais clientes com canais e presença?", "Como conseguir mais clientes?", ["Redes sociais: como usar sem depender de anúncios", "Marketing e vendas: como atrair mais clientes com conteúdo", "Atendimento: o diferencial que fideliza", "Parcerias e eventos: como ampliar o alcance"], [["K2", "tráfego pago vs orgânico"]], "R2"),
  secao("Como conquistar clientes com experiência e fidelização?", "Como conquistar clientes de forma duradoura?", ["Por que conhecer o cliente faz toda a diferença?", "A experiência do cliente como vantagem competitiva", "Boas-vindas e acompanhamento: o que considerar"]),
  secao("O que considerar antes de atrair novos clientes?", "O que você precisa saber antes de atrair novos clientes?", ["Definindo o perfil do cliente ideal", "Avaliando a capacidade de atendimento", "Preparando a equipe e os processos"], [["K1", "gerar leads qualificados"]]),
  secao("Como a presença orgânica complementa a atração de clientes?", "Como a presença orgânica ajuda a atrair clientes?", ["O papel do site e do Google Perfil da Empresa", "Conteúdo que responde às dúvidas do cliente", "Como o SEO local aumenta a visibilidade"], [], "R3"),
  secao("Como colocar em prática um plano para atrair clientes?", "Como começar a atrair clientes hoje?", ["Checklist de diagnóstico rápido", "Priorizando ações de baixo custo", "Criando uma rotina de atração"], [["K3", "serviços de SEO para clínicas"]]),
];

function plantaReal(extra: Partial<RadarArticleBlueprintPayload["blueprint"]> = {}): RadarArticleBlueprintPayload {
  const secoes = SECOES_REAIS();
  return {
    schemaVersion: 1,
    rulesVersion: "2026-10-09b",
    blueprint: {
      keywordPlan: { reading: "A principal abre o artigo.", principalPlacement: ["H1", "primeiro parágrafo"], complementary: [], slugNote: null },
      reader: "Profissionais de clínicas de estética e saúde que buscam atrair clientes sem depender de tráfego pago.",
      promise: "Ao final, o leitor terá um caminho prático para atrair clientes no dia a dia.",
      angle: { statement: "Um roteiro de diagnóstico e ação com exemplos comentados.", evidence: [] },
      title: {
        h1: "Como atrair um cliente: o caminho prático para conquistar e fidelizar",
        alternatives: ["Como atrair um cliente: guia prático para clínicas e consultórios", "Como atrair um cliente: estratégias para conquistar novos clientes"],
        seoTitle: "Como atrair um cliente: guia prático para clínicas",
        metaDescription: "Descubra como atrair um cliente com estratégias práticas de abordagem, canais e experiência. Aprenda a conquistar e fidelizar clientes sem depender de anúncios.",
      },
      opening: { readerQuestion: "Como atrair um cliente para minha clínica sem depender de anúncios pagos?", direction: "Responder no primeiro parágrafo.", evidence: [] },
      sections: secoes,
      closing: { turn: "Atrair clientes não é sobre truques, mas sobre presença consistente.", specialist: null, cta: "Vamos conversar sobre como apresentar sua clínica? Conheça os serviços de SEO para clínicas.", nextStep: null },
      visual: [
        { slot: "CAPA", section: null, concept: "Recepção de clínica", prompt: "Recepção de clínica com luz natural, sem texto legível. 16:9.", alt: "Recepção de clínica", caption: "" },
        { slot: "R1", section: secoes[0].h2, concept: "Agenda no celular", prompt: "Mão marcando horário no celular, sem texto legível. 4:3.", alt: "Agendamento", caption: "" },
        { slot: "R2", section: secoes[2].h2, concept: "Canais", prompt: "Mesa com cartões e celular, sem texto legível. 4:3.", alt: "Canais", caption: "" },
        { slot: "R3", section: secoes[5].h2, concept: "Busca local", prompt: "Pessoa procurando clínica no mapa do celular, sem texto legível. 4:3.", alt: "Busca local", caption: "" },
      ],
      eeat: ["Adalberto Escalante assina o artigo."],
      warnings: [],
      ...extra,
    } as unknown as RadarArticleBlueprintPayload["blueprint"],
    measures: {
      serp: { comparablePages: 23, words: { median: 2869, p25: 2134, p75: 3139 }, h2: 9, h3: 18, paragraphs: 68, images: 23, lists: 4 },
      plan: { sections: secoes.length, h3: 22, paragraphs: 21, bold: 0, images: 4, respites: 3, internalLinks: 3, externalLinks: 0, wordsMin: 2134, wordsMax: 3139 },
    },
    linkCandidates: [
      { id: "K1", label: "leads qualificados", role: "Pilar", destination: "/qualificados", status: "PLANNED", fromGraph: true },
      { id: "K2", label: "tráfego pago vs orgânico para clínica de estética", role: "Suporte", destination: `${PREFIXO}/trafego-pago-vs-organico-para-clinica-de-estetica`, status: "PUBLISHED", fromGraph: false },
      { id: "K3", label: "Página da marca /servicos/seo-para-clinicas", role: "Página da marca (Skill de voz)", destination: `${SITE}/servicos/seo-para-clinicas`, status: "PUBLISHED", fromGraph: false },
    ],
    sources: [],
    evidence: [
      { id: "S1", kind: "resultado orgânico", text: "10 dicas eficazes de como conquistar novos clientes · https://www.agendor.com.br/blog/dicas-conquistar-atrair-novos-clientes/" },
      { id: "S2", kind: "resultado orgânico", text: "Como atrair clientes: 10 dicas infalíveis · https://www.salesforce.com/br/blog/como-atrair-clientes/" },
      { id: "S3", kind: "resultado orgânico", text: "Como Atrair Clientes para Pequeno Negócio | Guia Prático · https://www.kyte.com.br/blog/como-atrair-clientes-para-pequeno-negocio" },
      { id: "P1", kind: "Pessoas também perguntam", text: "Qual o segredo para atrair clientes?" },
      { id: "B1", kind: "busca relacionada", text: "como atrair clientes sem gastar dinheiro" },
    ],
    skeleton: [],
  } as RadarArticleBlueprintPayload;
}

const contexto = (extra: Partial<RadarWritingArticleContext> = {}): RadarWritingArticleContext => ({
  topRowLabel: "Silo", filePosition: 1, silo: SILO(), articleId: ARTIGO, publication: novo("como-atrair-um-cliente"), blueprint: plantaReal(), ...extra,
});
const linhaDoArtigo = (extra: Partial<RadarWritingArticleContext> = {}) => buildRadarWritingExportArticle(entrada(), contexto(extra));
const linhasDe = (texto: string) => texto.split("\n");
const tudoDaLinha = (row: RadarWritingExportRow) => RADAR_WRITING_EXPORT_COLUMNS.map(coluna => row[coluna]).join("\n");
const briefReal = () => buildRadarArticleBlueprintBrief({ entrada: entrada(), silo: SILO(), articleId: ARTIGO, publication: novo("como-atrair-um-cliente") });

const VOZ: RadarBrandVoiceState = {
  kind: "available",
  voice: {
    versionId: "voz-1", version: 1, name: "AdalbaPro", contentHash: "sha256:voz", status: "draft", title: "Voz da AdalbaPro", markdown: "",
    sections: [
      { heading: "Voz: firme, humana e provocadora", body: "Interpretar a expressão do proprietário \"politicamente incorreto\" como liberdade para confrontar receitas repetidas." },
      { heading: "Construção do artigo e transição comercial", body: "Apresentar site, páginas de serviços e artigos como entregas concretas." },
    ],
  },
};

/* ============================== 1 · uma fonte só ============================== */

test("fonte única · o núcleo da diretriz chega IGUAL ao pedido, à linha 'Silo' do CSV, à linha 'Voz da marca', ao Redator, ao vídeo, à semente e ao catálogo", () => {
  const { system } = radarArticleBlueprintPrompt(briefReal());
  const [voz, serp] = radarHumanVoicePromptBlock();
  assert.ok(system.includes(voz) && system.includes(serp), "as regras 27 e 28 no pedido");
  assert.match(voz, /^27\. VOZ HUMANA GUIADA PELA SERP\. /);
  assert.match(serp, /^28\. TÍTULO, META, ESTRUTURA E FECHAMENTO PELA SERP\. /);

  const topo = buildRadarWritingTopRow({ label: "Silo", silo: SILO(), articles: [linhaDoArtigo()], siteUrl: SITE, authorsKnown: true });
  assert.equal(RADAR_WRITING_GENERAL_RULES[RADAR_WRITING_GENERAL_RULES.length - 1], radarHumanVoiceWritingRule());
  assert.ok(topo.prompt.includes(`${RADAR_WRITING_GENERAL_RULES.length}. ${radarHumanVoiceWritingRule()}`), "a regra geral numerada na linha de topo");
  assert.match(topo.prompt, new RegExp(`${RADAR_WRITING_GENERAL_RULES.length + 1}\\. Não altere: `), "o 'Não altere' continua por último");
  assert.equal(RADAR_WRITING_GENERAL_RULES[8].startsWith("Links internos: "), true, "a numeração das regras de antes não mudou");

  const vozDoCsv = buildRadarWritingBrandVoiceRow(VOZ)!;
  assert.ok(vozDoCsv.pode_escrever.includes(radarHumanVoiceBrandVoiceRowNote()));
  assert.ok(buildRadarVideoBrandVoiceRow(VOZ)!.pode_gravar.includes(radarHumanVoiceBrandVoiceRowNote()));

  assert.ok(SECTION_WRITING_SYSTEM_PROMPT.includes(radarHumanVoiceRedatorRule()), "escrita de seção do Redator");
  assert.ok(IMPROVE_SYSTEM_PROMPT.includes(radarHumanVoiceRedatorRule()), "melhoria de trecho do Redator");
  assert.equal(RADAR_VIDEO_GENERAL_RULES[RADAR_VIDEO_GENERAL_RULES.length - 1], radarHumanVoiceVideoRule());
  assert.ok(buildRadarVideoTopRow({ articles: [] }).prompt.includes(radarHumanVoiceVideoRule()), "linha de topo do CSV de vídeo");
  assert.ok(SCRIPT_SEED_SYSTEM_PROMPT.includes(radarHumanVoiceVideoRule()) && CAROUSEL_SEED_SYSTEM_PROMPT.includes(radarHumanVoiceVideoRule()), "semente de roteiro e carrossel");
  assert.ok(operationById("radar.export_for_writing")!.notes!.includes(radarHumanVoiceCatalogNote()), "nota do catálogo do MCP");

  /* Todos levam o MESMO núcleo e a MESMA precedência. */
  for (const [onde, texto] of [
    ["pedido", system], ["linha Silo", topo.prompt], ["Redator", SECTION_WRITING_SYSTEM_PROMPT], ["melhoria", IMPROVE_SYSTEM_PROMPT],
    ["vídeo", radarHumanVoiceVideoRule()], ["semente", SCRIPT_SEED_SYSTEM_PROMPT], ["catálogo", radarHumanVoiceCatalogNote()],
  ] as const) {
    assert.ok(texto.includes(RADAR_HUMAN_VOICE_CORE), `${onde}: o núcleo`);
    assert.ok(texto.includes(RADAR_HUMAN_VOICE_PRECEDENCE), `${onde}: a precedência`);
  }
  for (const texto of [system, topo.prompt, radarHumanVoiceCatalogNote()]) assert.ok(texto.includes(RADAR_HUMAN_VOICE_SERP_SUMMARY), "o título, a meta e o CTA pela SERP");
});

test("fonte única · o MCP, os fundamentos do Redator e o catálogo chamam a mesma fonte (estrutural, sem comentários)", async () => {
  const mcp = await lerFonte("../app/api/mcp/redator/route.ts");
  assert.match(mcp, /import \{ radarHumanVoiceRedatorRule \} from "@\/lib\/radar\/human-voice-guideline";/);
  assert.match(mcp, /\n\s*radarHumanVoiceRedatorRule\(\),\n\s*"Salve apenas rascunhos com lock/);
  const fundamentos = await lerFonte("../lib/server/writer-evidence-reader.ts");
  assert.match(fundamentos, /\.\.\.\(planta\.articleBlueprint \? \[`\$\{RADAR_HUMAN_VOICE_CORE\} \$\{RADAR_HUMAN_VOICE_PRECEDENCE\}`\] : \[\]\),/);
  assert.match(fundamentos, /articleBlueprint\.h2Merges \(Regra 8 do Guia/);
  const catalogo = await lerFonte("../lib/agent/platform-catalog.ts");
  assert.match(catalogo, /import \{ radarHumanVoiceCatalogNote \} from "\.\.\/radar\/human-voice-guideline\.ts";/);
  assert.match(radarHumanVoiceCatalogNote(), new RegExp(`regras do artigo-modelo '${RADAR_ARTICLE_BLUEPRINT_RULES_VERSION}', leitura do Redator '${WRITER_BLUEPRINT_READING_RULES}'`));
  /* Ninguém reescreve o núcleo à mão: só o módulo da diretriz tem a frase. */
  for (const caminho of ["../lib/radar/article-blueprint.ts", "../lib/radar/portable-writing-export.ts", "../lib/radar/portable-video-export.ts", "../lib/redator/prompts.ts", "../lib/redator/deliverable-seed.ts"]) {
    assert.doesNotMatch(await lerFonte(caminho), /Texto visceral e sem eufemismo/, `${caminho} reescreveu a diretriz`);
  }
});

test("fonte única · o documento canônico e o Adendo G dizem as mesmas regras, com a origem nos documentos do dono", async () => {
  const doc = await readFile(new URL("../docs/compartilhado/diretriz-de-comunicacao-humana.md", import.meta.url), "utf8");
  assert.match(doc, new RegExp(`versão ${RADAR_HUMAN_VOICE_GUIDELINE_VERSION}`));
  assert.match(doc, /Diretrizes de comunicação humana/);
  assert.match(doc, /Visão estratégica muito forte sobre a apatia dos conteúdos gerados por IA/);
  for (const regra of [...RADAR_HUMAN_VOICE_RULES, ...RADAR_HUMAN_VOICE_SERP_RULES]) assert.ok(doc.includes(regra.title), `o documento não tem "${regra.title}"`);
  const sdd = await readFile(new URL("../docs/05-radar/sdd-diretriz-editorial-pela-serp-2026-10-02.md", import.meta.url), "utf8");
  assert.match(sdd, /## Adendo G — Comunicação humana guiada pela SERP \(2026-10-11\) — PEDIDO DO DONO, IMPLEMENTADO EM CÓDIGO/);
  assert.match(sdd, /RADAR_HUMAN_VOICE_INTENTIONAL_ERRORS/);
});

/* ============================== 2 · precedência ============================== */

test("precedência · a SERP decide os tópicos: a diretriz não cria seção, pergunta nem tópico, e a leitura não tira nem acrescenta seção", () => {
  assert.match(RADAR_HUMAN_VOICE_CORE, /a SERP decide o que se cobre \(intenção, tópicos, perguntas, medidas e formato\); esta diretriz decide como se diz/);
  assert.match(radarHumanVoicePromptBlock()[0], /a diretriz não cria seção, H3, pergunta nem tópico/);
  assert.match(radarHumanVoicePromptBlock()[0], /a dor e o gancho vêm das evidências P, B e S \(perguntas, buscas relacionadas e títulos do topo\), nunca inventados/);
  /* O pedido continua com as regras da SERP antes da voz (2: a SERP manda na intenção). */
  const { system } = radarArticleBlueprintPrompt(briefReal());
  assert.ok(system.indexOf("2. A SERP manda na intenção") < system.indexOf("27. VOZ HUMANA"));
  /* A planta lida tem as mesmas seções, na mesma ordem; nenhuma nova. */
  const gravada = plantaReal();
  const lida = radarArticleBlueprintReading(gravada.blueprint, { principal: PRINCIPAL, linkCandidates: gravada.linkCandidates });
  assert.deepEqual(lida.blueprint.sections.map(item => item.h2), gravada.blueprint.sections.map(item => item.h2));
  /* A precedência sobre a Skill: suaviza → diretriz; protege fato, oferta, preço, credencial e dignidade → Skill. */
  assert.match(RADAR_HUMAN_VOICE_PRECEDENCE, /Onde a Skill de voz da marca suaviza o tom, vale esta diretriz; onde a Skill protege fato, oferta, preço, credencial ou a dignidade da leitora, a Skill vale\./);
});

/* ============================== 3 · a trava de fonte ============================== */

test("trava · a voz não destrava fato: a afirmação de plataforma sem fonte continua travada no CSV e a regra 17 fica no pedido", () => {
  const veredito = radarSentenceNeedsSource("O algoritmo do Instagram prioriza conteúdo com alto engajamento.", { pendentes: [], secao: null });
  assert.deepEqual([veredito.needs, veredito.kind], [true, "PLATAFORMA"]);
  const { system } = radarArticleBlueprintPrompt(briefReal());
  assert.match(system, /^17\. AFIRMAÇÕES: /m);
  assert.match(RADAR_HUMAN_VOICE_CORE, /Fatos continuam travados: a dificuldade de anunciar saúde e estética é dita como experiência de quem assina, nunca como proibição universal; escassez e urgência só com dado real da clínica\./);
  /* Na planta, a frase de plataforma sem fonte sai marcada e entra na lista concluída. */
  const comPlataforma = plantaReal();
  comPlataforma.blueprint.sections[2] = { ...comPlataforma.blueprint.sections[2], answerFirst: "O algoritmo do Instagram prioriza conteúdo com alto engajamento." };
  const estrutura = linhaDoArtigo({ blueprint: comPlataforma }).row.estrutura;
  assert.match(estrutura, /^- Abre respondendo: O algoritmo do Instagram prioriza conteúdo com alto engajamento \(precisa de fonte: afirmação sobre plataforma\)\.$/m);
  assert.match(estrutura, /^Afirmações que só entram com fonte do pacote ou delimitadas \(regra geral 5\): "O algoritmo do Instagram prioriza conteúdo com alto engajamento" \(afirmação sobre plataforma\)/m);
});

/* ============================== 4 · título, meta e as 3 opções ============================== */

test("título · as conferências puras: keyword no começo, isca genérica (fora da keyword), keyword cedo na meta e o recorte forte no H2", () => {
  assert.equal(radarHumanVoiceStartsWithKeyword("Como atrair um cliente: o caminho prático", PRINCIPAL), true);
  assert.equal(radarHumanVoiceStartsWithKeyword("Como atrair UNS clientes", PRINCIPAL), false);
  assert.equal(radarHumanVoiceStartsWithKeyword("Guia: como atrair um cliente", PRINCIPAL), false);
  assert.equal(radarHumanVoiceGenericBait("Como atrair um cliente: guia prático para clínicas", [PRINCIPAL]), "guia prático");
  assert.equal(radarHumanVoiceGenericBait("O que é SEO local na prática", ["o que é seo local"]), null, "a isca que é a keyword não conta");
  assert.equal(radarHumanVoiceGenericBait("Como atrair um cliente sem depender de post e de anúncio que cai", [PRINCIPAL]), null);
  assert.equal(radarHumanVoiceKeywordEarly("Descubra como atrair um cliente com estratégias práticas de abordagem", PRINCIPAL), true);
  assert.equal(radarHumanVoiceKeywordEarly("Estratégias práticas de abordagem, canais e experiência para conquistar e fidelizar: como atrair um cliente", PRINCIPAL), false);
  assert.equal(radarHumanVoiceHeadingHasKeyword("Como atrair clientes no dia a dia?", PRINCIPAL), true, "recorte forte: atrair + cliente");
  assert.equal(radarHumanVoiceHeadingHasKeyword("Contexto do mercado", PRINCIPAL), false);
  assert.equal(radarHumanVoiceTitleWithKeywordFirst("Guia para clínicas: como atrair um cliente sem anúncio", PRINCIPAL), "Como atrair um cliente sem anúncio: Guia para clínicas");
  assert.equal(radarHumanVoiceTitleWithKeywordFirst("Atrair um cliente começa pelo Google", PRINCIPAL), "Atrair um cliente começa pelo Google", "sem a forma 'A: keyword', nada muda");
});

test("título · a conferência da planta nova aponta keyword fora do começo, isca, meta sem a keyword cedo, menos de 3 opções e o 1º H2 sem a keyword; troca as metades sem IA", () => {
  const brief = briefReal();
  const ai = RadarArticleBlueprintAiSchema.parse(respostaDaPlanta(brief, {
    title: {
      h1: "Guia prático: como atrair um cliente",
      alternatives: ["Para clínicas: como atrair um cliente sem anúncio"],
      seoTitle: "Dicas: como atrair um cliente",
      metaDescription: "Estratégias de abordagem, canais e experiência para conquistar e fidelizar pacientes na clínica: como atrair um cliente.",
    },
  }));
  ai.sections[0] = { ...ai.sections[0], h2: "Contexto do mercado de estética" };
  const { payload, notes } = radarSanitizeArticleBlueprint(ai, brief);
  const pendentes = radarArticleBlueprintPendingNotes(notes).pending;
  const tem = (padrao: RegExp) => assert.ok(pendentes.some(item => padrao.test(item)), `${padrao}\n${pendentes.join("\n")}`);
  tem(/^O H1 não começa pela keyword principal \("como atrair um cliente"\): reescreva antes de aprovar \(regra 28\)\.$/);
  tem(/^O H1 usa isca genérica \("guia prático"\): troque pela dor e pelo contraste comercial que a SERP mostra antes de aprovar \(regra 28\)\.$/);
  tem(/^O SEO title usa isca genérica \("dicas"\)/);
  tem(/^A meta description não traz a keyword principal nos primeiros 60 caracteres/);
  tem(/^O título tem 2 opção\(ões\): a regra pede 3 \(o H1 e 2 alternativas, regra 28\)\.$/);
  tem(/^O primeiro H2 \("Contexto do mercado de estética"\) não traz a keyword principal nem um recorte forte dela/);
  /* "A: keyword…" vira "Keyword…: A" (só as metades trocam), dito como correção feita. */
  assert.equal(payload.blueprint.title.seoTitle, "Como atrair um cliente: Dicas");
  assert.deepEqual(payload.blueprint.title.alternatives, ["Como atrair um cliente sem anúncio: Para clínicas"]);
  assert.ok(notes.includes("Regra 28: a keyword principal foi para o começo do SEO title ou das alternativas (as duas metades do título trocaram de lugar, sem reescrever palavra)."));
  assert.equal(radarArticleBlueprintPendingNotes(["Regra 28: a keyword principal foi para o começo do SEO title ou das alternativas (as duas metades do título trocaram de lugar, sem reescrever palavra)."]).pending.length, 0, "a troca é correção, não pendência");
  assert.equal(payload.rulesVersion, RADAR_ARTICLE_BLUEPRINT_RULES_VERSION);
  assert.equal(RADAR_ARTICLE_BLUEPRINT_RULES_VERSION, "2026-10-11b");
  /* O pedido manda as 3 opções e a passada de correção as cobra. */
  const pedido = radarArticleBlueprintPrompt(brief);
  assert.match(pedido.user, /"alternatives":\["",""\]/);
  assert.match(radarArticleBlueprintPrompt(brief, { fix: { previous: ai, pending: pendentes } }).user, /Pela regra 28: H1, as 2 alternativas e o SEO title começam pela keyword principal/);
});

test("título · CSV do caso real: as 3 opções, o ajuste do SEO title e da alternativa com 'guia prático', a meta e o gancho pela SERP", () => {
  const titulo = linhasDe(linhaDoArtigo().row.titulo_e_seo);
  /* As linhas da planta continuam como eram. */
  assert.deepEqual(titulo.slice(0, 5), [
    "H1: Como atrair um cliente: o caminho prático para conquistar e fidelizar",
    "Alternativas: Como atrair um cliente: guia prático para clínicas e consultórios · Como atrair um cliente: estratégias para conquistar novos clientes",
    "SEO title: Como atrair um cliente: guia prático para clínicas",
    "Meta description: Descubra como atrair um cliente com estratégias práticas de abordagem, canais e experiência. Aprenda a conquistar e fidelizar clientes sem depender de anúncios.",
    "Keyword principal em: H1, primeiro parágrafo",
  ]);
  assert.match(titulo[5], /^Título pela SERP \(diretriz de comunicação humana 2026-10-11\): 3 opções \(o H1 e as alternativas acima\), cada uma com a keyword principal no começo/);
  assert.ok(titulo.includes("- Ajuste da alternativa 1: troque \"guia prático\" pela dor e pelo contraste comercial que a SERP mostra (gancho abaixo)."));
  assert.ok(titulo.includes("- Ajuste do SEO title: troque \"guia prático\" pela dor e pelo contraste comercial que a SERP mostra (gancho abaixo)."));
  assert.ok(titulo.includes("- Ajuste da meta description: troque \"descubra\" pela dor e pelo contraste comercial que a SERP mostra (gancho abaixo)."));
  assert.equal(titulo.some(item => /^- Ajuste do H1: comece/.test(item)), false, "o H1 já começa pela keyword");
  assert.ok(titulo.includes("Gancho pela SERP: a dor vem das perguntas reais (P1 \"Qual o segredo para atrair clientes?\"; B1 \"como atrair clientes sem gastar dinheiro\"); o contraste, dos títulos do topo (S1 \"10 dicas eficazes de como conquistar novos clientes\"; S2 \"Como atrair clientes: 10 dicas infalíveis\"; S3 \"Como Atrair Clientes para Pequeno Negócio | Guia Prático\"), que prometem \"dicas\", \"guia prático\": o título promete a saída que eles não dão."), titulo.join("\n"));
  assert.match(titulo[titulo.length - 1], /^Meta description pela SERP: dor, contraste, o que a leitora ganha e por que clicar mesmo com resposta de IA no topo/);
  /* Planta sem alternativas: a coluna manda escrever as que faltam, no mesmo molde. */
  const semAlternativas = plantaReal({ title: { ...plantaReal().blueprint.title, alternatives: [] } });
  assert.ok(linhasDe(linhaDoArtigo({ blueprint: semAlternativas }).row.titulo_e_seo).includes("- Escreva mais 2 opções no mesmo molde: a keyword principal no começo e outro gancho de contraste."));
});

test("título · a planta gravada 'Para clínicas: como atrair um cliente' sai com a keyword no começo no CSV, no vídeo e no Redator, sem mudar o payload", () => {
  const gravada = plantaReal({ title: { h1: "Como atrair um cliente: o caminho", alternatives: ["Para clínicas: como atrair um cliente sem anúncio"], seoTitle: "Sem anúncio: como atrair um cliente", metaDescription: "Como atrair um cliente quando o feed não traz ninguém." } });
  const antes = JSON.stringify(gravada);
  const csv = linhasDe(linhaDoArtigo({ blueprint: gravada }).row.titulo_e_seo);
  assert.ok(csv.includes("Alternativas: Como atrair um cliente sem anúncio: Para clínicas"));
  assert.ok(csv.includes("SEO title: Como atrair um cliente: Sem anúncio"));
  assert.equal(JSON.stringify(gravada), antes, "o payload gravado não muda (nem o hash)");
  const redator = writerArticleBlueprintForWriting({
    id: "bp-1", versionNumber: 1, approvedAt: "2026-10-11T12:00:00.000Z", blueprint: gravada.blueprint, plan: gravada.measures.plan,
    linkCandidates: gravada.linkCandidates, brandVoice: null, sources: gravada.sources, keywords: { principal: PRINCIPAL, secondary: COMPLEMENTARES },
  })!;
  assert.equal(redator.seoTitle, "Como atrair um cliente: Sem anúncio");
  assert.equal(WRITER_BLUEPRINT_READING_RULES, "2026-10-11b");
});

/* ============================== 5 · o primeiro H2 e a primeira frase ============================== */

test("começo · o primeiro H2 do caso real já traz a keyword; o que não traz ganha a instrução concluída; a primeira frase traz a keyword", () => {
  const estrutura = linhasDe(linhaDoArtigo().row.estrutura);
  assert.ok(estrutura.includes("- Primeiro H2: \"Como atrair clientes no dia a dia?\" já traz a keyword principal (ou um recorte forte dela)."));
  assert.ok(estrutura.includes("- Primeira frase do corpo: traz \"como atrair um cliente\" e entra na dor da SERP, para quem já tentou posts, feed, anúncio e agência (nível 3)."));
  const semKeyword = plantaReal();
  semKeyword.blueprint.sections[0] = { ...semKeyword.blueprint.sections[0], h2: "Contexto do mercado de estética" };
  assert.ok(linhasDe(linhaDoArtigo({ blueprint: semKeyword }).row.estrutura).includes("- Primeiro H2: escreva \"Contexto do mercado de estética\" com a keyword principal ou um recorte forte dela, sem mudar a pergunta da seção."));
});

/* ============================== 6 · de 3 a 6 H2 ============================== */

test("H2 · a planta nova: o pedido pede de 3 a 6 seções, a conferência aponta 7 (pede ação) e, fechando, diz o que os entregáveis leem", () => {
  const brief = briefReal();
  const { system } = radarArticleBlueprintPrompt(brief);
  assert.match(system, /^16\. TAMANHO: de 3 a 6 seções \(H2; o que a SERP pede além disso vira H3, regra 28\)/m);
  const ai = RadarArticleBlueprintAiSchema.parse(respostaDaPlanta(brief, { sections: SECOES_REAIS().map(item => ({ ...item, from: [], evidence: [], internalLinks: [], image: null })) }));
  assert.equal(ai.sections.length, 7);
  const aberta = radarSanitizeArticleBlueprint(ai, brief);
  assert.ok(radarArticleBlueprintPendingNotes(aberta.notes).pending.includes("A planta tem 7 H2: a regra pede de 3 a 6 (Regra 8 do Guia) — junte a cobertura que sobra como H3 da seção mais próxima pelo sentido antes de aprovar."));
  const fechada = radarSanitizeArticleBlueprint(ai, brief, { close: true });
  const nota = fechada.notes.find(item => item.startsWith("Regra 8 "))!;
  assert.equal(nota, "Regra 8 (de 3 a 6 H2): a planta ficou com 7 H2; os entregáveis leem \"Como conquistar clientes com experiência e fidelização?\" como H3 de \"Como conseguir mais clientes com canais e presença?\", sem perder cobertura.");
  assert.equal(radarArticleBlueprintPendingNotes([nota]).pending.length, 0, "fechando, a nota não pede ação (D10)");
  assert.equal(fechada.payload.blueprint.sections.length, 7, "nada da cobertura sai da planta");
});

test("H2 · a planta gravada real de 7 H2: a leitura junta 'fidelização' como H3 de 'canais e presença', sem mudar payload, links nem imagens; CSV e Redator dizem o mesmo", () => {
  const gravada = plantaReal();
  const antes = JSON.stringify(gravada);
  const lida = radarArticleBlueprintReading(gravada.blueprint, { principal: PRINCIPAL, linkCandidates: gravada.linkCandidates });
  assert.deepEqual(lida.h2Merges, [{ section: 3, into: 2 }]);
  assert.equal(radarArticleBlueprintPayloadReading(gravada, { principal: PRINCIPAL }).blueprint.sections.length, 7, "a planta lida continua com as 7 seções");
  assert.equal(JSON.stringify(gravada), antes);

  const row = linhaDoArtigo().row;
  const estrutura = linhasDe(row.estrutura);
  assert.match(row.estrutura, /^Medidas do plano: 6 H2 \(Regra 8: 1 seção da planta entra como H3\) · 23 H3 · /m);
  const h2 = estrutura.filter(item => item.startsWith("## "));
  assert.equal(h2.length, 6);
  const junta = estrutura.findIndex(item => item.startsWith("### Como conquistar clientes com experiência e fidelização? (H3 do H2 acima, pela Regra 8 do Guia: de 3 a 6 H2; a cobertura fica inteira)"));
  assert.ok(junta > 0, row.estrutura);
  const h2Acima = estrutura.slice(0, junta).reverse().find(item => item.startsWith("## "));
  assert.equal(h2Acima, "## Como conseguir mais clientes com canais e presença?", "o H2 mais perto acima é o que a recebe");
  assert.ok(estrutura.some(item => /^\s+- Tópico dentro deste H3 \(sem novo H2\): Por que conhecer o cliente faz toda a diferença\?$/.test(item)), "os H3 dela viram tópicos, sem sumir");
  assert.ok(estrutura.includes("- H2: 6 (Regra 8 do Guia: de 3 a 6). A planta tem 7 seções: a marcada \"H3 do H2 acima\" entra como H3, com a cobertura, os links e a imagem."));
  for (const item of gravada.blueprint.sections) assert.equal(row.estrutura.split(item.h2).length - 1 >= 1, true, `a seção "${item.h2}" continua na estrutura`);
  /* Links e imagens não mudam de número nem de lugar. */
  assert.match(row.links_internos, /^L1 · âncora sugerida "tráfego pago vs orgânico"/m);
  assert.match(row.plano_visual, /^Respiro 3 · seção "Como a presença orgânica complementa a atração de clientes\?"/m);

  const redator = writerArticleBlueprintForWriting({
    id: "bp-1", versionNumber: 1, approvedAt: "2026-10-11T12:00:00.000Z", blueprint: gravada.blueprint, plan: gravada.measures.plan,
    linkCandidates: gravada.linkCandidates, brandVoice: null, sources: gravada.sources, keywords: { principal: PRINCIPAL, secondary: COMPLEMENTARES },
  })!;
  assert.deepEqual(redator.h2Merges, [{ section: "Como conquistar clientes com experiência e fidelização?", into: "Como conseguir mais clientes com canais e presença?" }]);
  assert.equal(redator.sections.length, 7, "o Redator casa pelo H2 de documentos já criados: as seções não somem");
  assert.match(SECTION_WRITING_SYSTEM_PROMPT, /Quando evidence\.articleBlueprint\.h2Merges existir \(Regra 8 do Guia: de 3 a 6 H2\)/);
  /* Com 6 H2 ou menos, nada muda. */
  const seis = plantaReal({ sections: SECOES_REAIS().slice(0, 6) });
  assert.deepEqual(radarArticleBlueprintReading(seis.blueprint, { principal: PRINCIPAL }).h2Merges, []);
  assert.match(linhaDoArtigo({ blueprint: seis }).row.estrutura, /^- H2: 6 \(Regra 8 do Guia: de 3 a 6\)\.$/m);
});

test("H2 · a régua: nunca a primeira nem a última, sem cadeia, e a planta grande fica com 6 H2", () => {
  const vinte = Array.from({ length: 20 }, (_, indice) => ({ h2: `Seção ${indice + 1} sobre captação de pacientes número ${indice + 1}`, h3: [] as string[] }));
  const juntas = radarArticleBlueprintH2Merges(vinte);
  assert.equal(vinte.length - juntas.length, RADAR_HUMAN_VOICE_H2.max);
  const saem = new Set(juntas.map(item => item.section));
  assert.equal(saem.has(0) || saem.has(19), false, "a primeira e a última ficam como H2");
  for (const item of juntas) assert.equal(saem.has(item.into), false, `sem cadeia: ${item.section} → ${item.into}`);
});

/* ============================== 7 · fechamento, CTA, capa e imagem ============================== */

test("fechamento · 4 tempos com um CTA só, no pedido e no CSV", () => {
  assert.match(radarHumanVoicePromptBlock()[1], /closing\.turn leva os 3 primeiros tempos do fechamento \(dor, estrutura própria no Google, facilidade\) e closing\.cta é o diagnóstico, a única chamada/);
  const row = linhaDoArtigo().row;
  assert.ok(linhasDe(row.estrutura).includes("- Fechamento em 4 tempos: dor (o que a leitora já sentiu com a receita pronta) → mudança para a estrutura própria no Google → facilidade (a marca faz; a profissional só contribui com o que sabe) → diagnóstico (o CTA abaixo, a única chamada); a virada e o fim explicam a busca orgânica sem sigla (nível 2)."));
  assert.equal(linhasDe(row.estrutura).filter(item => /^CTA[ :(]/.test(item)).length, 1, "um CTA só");
  assert.ok(linhasDe(row.estrutura).includes("- Autoridade local: 2 ou 3 sinais, onde o trecho pedir (o site como presença de captação local; as perguntas reais e a experiência da clínica virando autoridade; o contraste com a vida refém do feed e de posts soltos; a diferença para a agência comum de posts e anúncios)."));
});

test("imagens · capa obrigatória e imagem útil no corpo: a planta com elas diz onde; a sem elas ganha a instrução concluída; a conferência cobra", () => {
  assert.ok(linhasDe(linhaDoArtigo().row.estrutura).includes("- Imagens: capa e 3 imagens no corpo, nas seções indicadas."));
  const semImagem = plantaReal({ visual: [] });
  const row = linhaDoArtigo({ blueprint: semImagem }).row;
  assert.match(row.plano_visual, /^Capa \(obrigatória\): escreva o prompt a partir do H1 \("Como atrair um cliente: o caminho prático para conquistar e fidelizar"\), cena editorial sem texto legível, 16:9; ALT pela keyword principal\.$/m);
  assert.match(row.plano_visual, /^Imagem no corpo \(ao menos uma\): na seção "Como conquistar novos clientes com abordagem e relacionamento\?", explicando a ideia dela, 4:3, sem antes e depois nem promessa de resultado\.$/m);
  assert.match(row.estrutura, /^- Imagens: a capa é obrigatória \(prompt a partir do H1, sem texto legível\); ponha ao menos uma imagem útil no corpo, na seção "Como conquistar novos clientes com abordagem e relacionamento\?", explicando a ideia dela\.$/m);
  const brief = briefReal();
  const { notes } = radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(respostaDaPlanta(brief, { visual: [] })), brief);
  assert.ok(notes.includes("Plano visual sem capa: defina a capa antes de aprovar."));
  assert.ok(notes.includes("Plano visual com 0 respiro(s): a regra pede dois ou três."));
});

/* ============================== 8 · D10, erro proposital e o aviso ============================== */

test("D10 · o CSV do caso real, a linha 'Silo', a linha 'Voz da marca', o vídeo e as frases da diretriz saem concluídos", () => {
  const artigo = linhaDoArtigo();
  const topo = buildRadarWritingTopRow({ label: "Silo", silo: SILO(), articles: [artigo], siteUrl: SITE, authorsKnown: true, brandVoice: VOZ });
  semD10(radarWritingExportCsv([topo, buildRadarWritingBrandVoiceRow(VOZ)!, artigo.row]), "CSV para escrever");
  const video = buildRadarVideoExportArticle(entrada(), { position: 1, youtube: null, blueprint: plantaReal(), publication: novo("como-atrair-um-cliente"), silo: SILO() }).row;
  semD10(Object.values(video).join("\n"), "CSV de vídeo");
  for (const texto of [RADAR_HUMAN_VOICE_CORE, RADAR_HUMAN_VOICE_PRECEDENCE, RADAR_HUMAN_VOICE_SERP_SUMMARY, ...radarHumanVoicePromptBlock(), radarHumanVoiceWritingRule(), radarHumanVoiceRedatorRule(), radarHumanVoiceVideoRule(), radarHumanVoiceCatalogNote(), radarHumanVoiceBrandVoiceRowNote()]) {
    semD10(texto, "diretriz");
  }
  const aviso = radarArticleBlueprintRulesNoticeText({ rulesVersion: "2026-10-11" })!;
  assert.match(aviso, /^Esta versão foi montada com as regras de 2026-10-11\. As de 2026-10-11b acrescentam a diretriz de comunicação humana guiada pela SERP \(2026-10-11\)/);
  semD10(aviso, "aviso das regras");
  assert.equal(radarArticleBlueprintRulesNoticeText({ rulesVersion: "2026-10-11b" }), null);
  assert.doesNotMatch(tudoDaLinha(artigo.row), /dependência/i, "a palavra que casa com a régua do D10 não entra");
});

test("erro proposital · desligado e documentado; as instruções que vão à IA pedem texto correto e não ensinam o erro", () => {
  assert.equal(RADAR_HUMAN_VOICE_INTENTIONAL_ERRORS, false);
  const ERROS = /\bagente vai\b|\bos paciente\b|\bconcerteza\b|\bmim fazer\b|\bnois\b|\bfazem dois anos\b/i;
  const instrucoes = [RADAR_HUMAN_VOICE_CORE, RADAR_HUMAN_VOICE_SERP_SUMMARY, RADAR_HUMAN_VOICE_PRECEDENCE, ...radarHumanVoicePromptBlock(), radarHumanVoiceWritingRule(), radarHumanVoiceRedatorRule(), radarHumanVoiceVideoRule(), radarHumanVoiceCatalogNote()];
  for (const texto of instrucoes) {
    assert.doesNotMatch(texto, ERROS, texto.slice(0, 80));
    /* Toda instrução que leva o núcleo diz que o texto publicado sai correto. */
    if (texto.includes(RADAR_HUMAN_VOICE_CORE)) assert.match(texto, /com o texto publicado correto, sem erro proposital/, texto.slice(0, 80));
  }
  assert.match(RADAR_HUMAN_VOICE_CORE, /com o texto publicado correto, sem erro proposital/);
  /* O exemplo ruim de "erro de propósito" fica só na definição para humanos (documento e lista de regras), nunca nas instruções. */
  assert.match(RADAR_HUMAN_VOICE_RULES.find(item => item.id === "ritmo")!.bad, /de propósito para parecer humano/);
});

test("definições · cada regra tem o que é, como aplicar e exemplo bom × ruim; os exemplos do dono estão citados", () => {
  for (const regra of [...RADAR_HUMAN_VOICE_RULES, ...RADAR_HUMAN_VOICE_SERP_RULES]) {
    for (const campo of ["what", "how", "good", "bad"] as const) assert.ok(regra[campo].trim().length > 10, `${regra.id}.${campo}`);
  }
  assert.match(RADAR_HUMAN_VOICE_RULES.find(item => item.id === "provocacao")!.good, /o marketing que te venderam/);
  assert.match(RADAR_HUMAN_VOICE_RULES.find(item => item.id === "fatos-travados")!.how, /não vai falar que está proibido/);
  assert.match(RADAR_HUMAN_VOICE_RULES.find(item => item.id === "consciencia")!.what, /Nível 3 \(abertura\): a leitora já reconhece o problema e já tentou as receitas conhecidas \(posts, feed, anúncio, agência\)\. Nível 2 \(virada e fechamento\): ela ainda não entende a busca orgânica como solução\./);
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
