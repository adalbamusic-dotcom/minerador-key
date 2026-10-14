/*
 * ===== 2026-10-14 · F0 · O CASO REAL DO DONO, REDUZIDO A DOSSIÊ DE TESTE =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §3,
 * §13 e §14 (F0). Origem: o CSV "03-suporte-captacao-de-pacientes-sem-trafego-pago-para-escrever.csv"
 * (Radar, 12/10) e o artigo escrito a partir dele (docx, 14/10), do Suporte 3 do
 * Silo "Leads sem Tráfego Pago" (8 artigos), principal "captação de pacientes
 * dentista", publicado (atualização).
 *
 * Reduzido e anonimizado o bastante para teste:
 *   - o domínio da marca virou `marca-exemplo.com.br` e a marca, "Marca Exemplo";
 *   - o nome de quem assina não entra (nenhum dado pessoal);
 *   - do docx entram só os 3 títulos corrigidos à mão (seção B), nunca o texto;
 *   - dos concorrentes entram título, domínio, trecho curto e H1/H2 (o que a
 *     SERP crua do F-S também entrega), nunca o texto das páginas;
 *   - as keywords e os títulos do Radar ficam como saíram: são o defeito medido.
 *
 * Dois blocos:
 *   1. `CASO_REAL_ANTES`: o que o CSV e o docx do dono trouxeram, literal. Os
 *      testes do "antes" leem estes textos com as réguas novas (V1–V7) — e
 *      continuam valendo depois de cada fase, porque o registro não muda.
 *   2. `plantaDoCasoReal()` + `entradaDoCasoReal()` + `SILO_DO_CASO_REAL()`: a
 *      planta gravada (regras 2026-10-11c, como as 8 do Silo piloto) que o código
 *      de cada fase lê. É ela que mostra o "depois" sem IA (D6).
 */
import type { RadarArticleBlueprintPayload } from "../../lib/radar/article-blueprint.ts";
import type { RadarCompetitiveReadingInput } from "../../lib/radar/competitive-reading.ts";
import type { RadarPortableExportInput } from "../../lib/radar/portable-export.ts";
import type { RadarSiloExportWritingContext } from "../../lib/radar/portable-silo-export.ts";
import type { RadarWritingArticleContext, RadarWritingPublication } from "../../lib/radar/portable-writing-export.ts";
import { ARTIGO, entradaGoogle } from "../radar-portable-writing-fixtures.mts";

export const SITE_DO_CASO = "https://marca-exemplo.com.br";
export const PREFIXO_DO_CASO = `${SITE_DO_CASO}/leads-sem-trafego-pago`;
export const PRINCIPAL_DO_CASO = "captação de pacientes dentista";
/** A forma natural (K1): com a preposição que a frase pede. Não é dedutível sem IA (D6); a planta nova a grava. */
export const PRINCIPAL_NATURAL_DO_CASO = "captação de pacientes para dentista";
export const COMPLEMENTARES_DO_CASO = ["captação de pacientes sem tráfego pago", "tráfego orgânico como fazer", "empresa de captação de pacientes"];

/* ============================== 1 · o registro do "antes" ============================== */

export const CASO_REAL_ANTES = Object.freeze({
  /** Coluna titulo_e_seo do CSV (12/10), como saiu. */
  csv: Object.freeze({
    h1: "Captação de pacientes dentista sem anúncios: o que o orgânico entrega de verdade (precisa de fonte: afirmação sobre plataforma)",
    alternatives: Object.freeze([
      "Captação de pacientes dentista sem verba: por que a agenda depende de base, não de anúncio",
      "Captação de pacientes dentista no orgânico: a rotina que sobrevive quando a verba acaba",
    ]),
    seoTitle: "Captação de pacientes dentista sem anúncios: o que o orgânico entrega (precisa de fonte: afirmação sobre plataforma)",
    metaDescription: "Captação de pacientes dentista sem anúncio: o que o orgânico entrega, o que cobra de você e por onde começar a rotina (precisa de fonte: afirmação sobre plataforma).",
    keywordPlacement: "Keyword principal em: H1, primeiro parágrafo, H2 da seção 1",
    /** Os 5 H2 da coluna estrutura, na ordem. */
    h2: Object.freeze([
      "Captação de pacientes dentista sem anúncios começa pelo orgânico",
      "Tráfego orgânico como fazer para captar pacientes no dia a dia",
      "Por que investir em tráfego orgânico e não só em anúncio",
      "Estratégias de tráfego orgânico que cabem na rotina do consultório",
      "Quem faz tráfego orgânico para o dentista e o que esperar do retorno",
    ]),
    /** Os destinos dos 5 links (L1…L5), pelo papel e nome. */
    links: Object.freeze([
      "Pilar · leads qualificados",
      "Suporte · instagram não traz pacientes",
      "Suporte · tráfego pago vs orgânico para clínica de estética",
      "Suporte · campanhas de marketing para clínica de estética sem anúncios",
      "SiloPage · Leads sem Tráfego Pago",
    ]),
  }),
  /** Seção B do docx: os títulos corrigidos à mão (a forma natural, mas o mesmo prefixo nas 9 opções). */
  docx: Object.freeze({
    h1: Object.freeze([
      "Captação de pacientes para dentista: seu conhecimento pode trabalhar além do consultório",
      "Captação de pacientes para dentista: menos dependência de anúncios, mais conteúdo próprio",
      "Captação de pacientes para dentista: transforme um site parado em um blog de autoridade",
    ]),
    seoTitle: Object.freeze([
      "Captação de pacientes para dentista além dos anúncios",
      "Captação de pacientes para dentista com conteúdo próprio",
    ]),
  }),
  /** O Silo: 8 artigos, o Pilar e 7 Suportes; a planta do Pilar pôs 3 links para os 7 Suportes que o grafo pede (§4.2). */
  silo: Object.freeze({ articles: 8, supports: 7, pillarLinksInPlan: 3, graphPillarToSupport: 7, supportToSupportEdges: 0 }),
});

/* ============================== 2 · a planta gravada ============================== */

type Secao = RadarArticleBlueprintPayload["blueprint"]["sections"][number];
const secao = (h2: string, readerQuestion: string, answerFirst: string, h3: string[], links: Array<[string, string, string]>, image: string | null, evidence: string[] = []): Secao => ({
  h2, readerQuestion, answerFirst, from: [], h3, explain: [], paragraphs: 3, bold: [], terms: [], evidence,
  specialist: null, video: null, internalLinks: links.map(([candidate, anchor, reason]) => ({ candidate, anchor, reason })), externalLinks: [], image, practical: null,
} as Secao);

const SECOES = (): Secao[] => [
  secao(CASO_REAL_ANTES.csv.h2[0], "O que é tráfego orgânico na captação de pacientes?", "Tráfego orgânico é a visita que chega por busca, perfil e indicação, sem pagar por clique.",
    ["Quais características definem o tráfego orgânico", "Quais são as vantagens, e o que elas não garantem"], [["K1", "contatos qualificados", "pilar: aprofunda a captação de contatos com intenção"]], null, ["C1"]),
  secao(CASO_REAL_ANTES.csv.h2[1], "Como começar o tráfego orgânico sem equipe grande?", "Comece por um diagnóstico do site e do perfil, depois publique o que o paciente pesquisa.",
    ["Como começar: o primeiro passo", "Como medir se a rotina funciona"], [["K2", "o Instagram sozinho não basta", "mostra por que o perfil não substitui o site"]], "R1", ["C3"]),
  secao(CASO_REAL_ANTES.csv.h2[2], "Qual a diferença entre tráfego pago e orgânico para a clínica?", "O pago para quando a verba acaba; o orgânico pede conteúdo e site mantidos.",
    ["Por que investir no orgânico", "Qual a diferença entre pago e orgânico"], [["K3", "pago ou orgânico, qual escolher", "comparação de canais para clínica de estética, lado a lado"]], "R2", ["C4"]),
  secao(CASO_REAL_ANTES.csv.h2[3], "Quais estratégias de tráfego orgânico funcionam para dentista?", "Escolha poucas estratégias e mantenha a publicação; a constância pesa mais que o volume.",
    ["Quais estratégias de tráfego orgânico seguir", "Como entra o tráfego vindo de ferramentas de IA"], [["K4", "sem anúncios", "aprofunda estratégias sem anúncio"]], null, ["P4"]),
  secao(CASO_REAL_ANTES.csv.h2[4], "O que faz uma agência de tráfego orgânico e vale a pena?", "A agência executa a base; a clínica precisa acompanhar e responder pacientes.",
    ["O que faz uma agência de tráfego orgânico", "Quem é especialista em tráfego orgânico"], [["K5", "visão geral do tema", "siloPage: leva ao tema central do Silo"]], "R3"),
];

/** A planta como a conferência de 2026-10-11c a gravou (sem marca de processo: a marca nasce na leitura do export). */
export function plantaDoCasoReal(extra: Partial<RadarArticleBlueprintPayload["blueprint"]> = {}): RadarArticleBlueprintPayload {
  const secoes = SECOES();
  return {
    schemaVersion: 1,
    rulesVersion: "2026-10-11c",
    blueprint: {
      keywordPlan: {
        reading: "A keyword principal define a intenção: o dentista quer captar pacientes sem depender de anúncio.",
        principalPlacement: ["H1", "primeiro parágrafo", "H2 da seção 1"],
        complementary: [
          { keyword: COMPLEMENTARES_DO_CASO[0], placement: "H2 1 e corpo da abertura", reason: "É o recorte do tema do Silo e do título atual." },
          { keyword: COMPLEMENTARES_DO_CASO[1], placement: "H2 2", reason: "Responde o passo a passo que a busca mostra." },
          { keyword: COMPLEMENTARES_DO_CASO[2], placement: "H2 5", reason: "Ajuda o leitor a comparar agência comum com trabalho de base." },
        ],
        slugNote: "Slug e URL publicados não mudam (atualização).",
      },
      reader: "Dentistas e donos de consultório odontológico que querem captar pacientes sem depender de anúncio pago.",
      promise: "Ao final, o dentista sabe por onde começar a captação orgânica e o que esperar dela.",
      angle: { statement: "O checklist do que a clínica já tem antes de qualquer canal.", evidence: ["S2"] },
      title: {
        h1: "Captação de pacientes dentista sem anúncios: o que o orgânico entrega de verdade",
        alternatives: [...CASO_REAL_ANTES.csv.alternatives],
        seoTitle: "Captação de pacientes dentista sem anúncios: o que o orgânico entrega",
        metaDescription: "Captação de pacientes dentista sem anúncio: o que o orgânico entrega, o que cobra de você e por onde começar a rotina.",
      },
      opening: { readerQuestion: "Dá para captar pacientes sem pagar anúncio?", direction: "Responder que dá para captar, mas o orgânico exige base e tempo.", evidence: ["P2"] },
      sections: secoes,
      closing: {
        turn: "Dor: a verba some e a agenda some junto. Estrutura própria no Google: site, perfil e conteúdo que a busca encontra. Facilidade: começar com poucas páginas bem feitas.",
        specialist: null,
        cta: "Vamos planejar a presença orgânica da sua clínica no Google?",
        nextStep: null,
      },
      visual: [
        { slot: "CAPA", section: null, concept: "Recepção de consultório", prompt: "Recepção de consultório odontológico com luz natural, sem texto legível. 16:9.", alt: "Recepção de consultório", caption: "" },
        { slot: "R1", section: secoes[1].h2, concept: "Perguntas da recepção", prompt: "Mão anotando perguntas num caderno sobre o balcão, sem texto legível. 4:3.", alt: "Perguntas da recepção", caption: "" },
        { slot: "R2", section: secoes[2].h2, concept: "Dois caminhos", prompt: "Ilustração em SVG de dois caminhos lado a lado, sem rótulos legíveis. 4:3.", alt: "Dois caminhos", caption: "" },
        { slot: "R3", section: secoes[4].h2, concept: "Conversa de trabalho", prompt: "Duas pessoas conversando diante de um notebook fechado, sem texto legível. 4:3.", alt: "Conversa", caption: "" },
      ],
      eeat: ["Quem assina é o especialista da aba Especialista, pelo nome cadastrado."],
      warnings: [],
      ...extra,
    } as unknown as RadarArticleBlueprintPayload["blueprint"],
    measures: {
      serp: { comparablePages: 20, words: { median: 2190, p25: 1527, p75: 4058 }, h2: 10, h3: 15, paragraphs: 52, images: 26, lists: 4 },
      plan: { sections: secoes.length, h3: 10, paragraphs: 15, bold: 0, images: 4, respites: 3, internalLinks: 5, externalLinks: 0, wordsMin: 1527, wordsMax: 4058 },
    },
    linkCandidates: [
      { id: "K1", label: "leads qualificados", role: "Pilar", destination: `${PREFIXO_DO_CASO}/qualificados`, status: "PLANNED", fromGraph: true },
      { id: "K2", label: "instagram não traz pacientes", role: "Suporte", destination: `${PREFIXO_DO_CASO}/instagram-nao-traz-pacientes`, status: "PUBLISHED", fromGraph: false },
      { id: "K3", label: "tráfego pago vs orgânico para clínica de estética", role: "Suporte", destination: `${PREFIXO_DO_CASO}/trafego-pago-vs-organico-para-clinica-de-estetica`, status: "PUBLISHED", fromGraph: false },
      { id: "K4", label: "campanhas de marketing para clínica de estética sem anúncios", role: "Suporte", destination: `${PREFIXO_DO_CASO}/campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios`, status: "PUBLISHED", fromGraph: false },
      { id: "K5", label: "SiloPage \"Leads sem Tráfego Pago\"", role: "SiloPage", destination: PREFIXO_DO_CASO, status: "PLANNED", fromGraph: true },
    ],
    sources: [],
    evidence: [
      { id: "S1", kind: "resultado orgânico", text: "Como captar 20 pacientes por semana sem gastar R$1,00 · https://www.youtube.com/watch?v=video-exemplo" },
      { id: "S2", kind: "resultado orgânico", text: "10 estratégias para captação de pacientes na odontologia · https://blog.capim.com.br/artigo/captacao-de-pacientes" },
      { id: "S3", kind: "resultado orgânico", text: "Dicas de Ouro para Captação de Pacientes na Odontologia · https://www.cemoi.com.br/dicas-de-ouro-para-captacao-de-pacientes-na-odontologia/" },
      { id: "P1", kind: "Pessoas também perguntam", text: "Como fazer captação de pacientes em odontologia?" },
      { id: "P2", kind: "Pessoas também perguntam", text: "Como conseguir captar pacientes?" },
      { id: "P3", kind: "Pessoas também perguntam", text: "Como criar um script para captar pacientes para a odontologia?" },
      { id: "P4", kind: "Pessoas também perguntam", text: "O que o CRO não permite postar?" },
      { id: "C1", kind: "conceito", text: "O que é tráfego orgânico? (8 de 20 páginas)" },
      { id: "C3", kind: "conceito", text: "Como fazer tráfego orgânico? (6 de 20 páginas)" },
      { id: "C4", kind: "conceito", text: "Por que investir em tráfego orgânico? (4 de 20 páginas)" },
      { id: "C7", kind: "conceito", text: "Principais diferenças entre tráfego pago e orgânico (3 de 20 páginas)" },
    ],
    skeleton: [],
  } as RadarArticleBlueprintPayload;
}

/* ============================== 3 · o Silo e a entrada do export ============================== */

const membro = (articleId: string, position: number, principal: string, slug: string, role = "Suporte") =>
  ({ articleId, position, title: principal, principalKeyword: principal, slug, role, statusLabel: "fora desta seleção", inThisFile: false, reason: null });

/** O Silo "Leads sem Tráfego Pago": o Pilar e os 7 Suportes, na ordem narrativa do CSV. */
export const SILO_DO_CASO_REAL = (): RadarSiloExportWritingContext => ({
  kind: "silo", label: "Leads sem Tráfego Pago", partial: true, draft: false, centralEntity: "Leads sem Tráfego Pago",
  objective: "Construir autoridade em leads sem tráfego pago.", audience: null, macroProblem: null, dominantIntent: null, whyTogether: null,
  boundary: null, includedTopics: [], excludedTopics: [],
  siloPage: { slug: "leads-sem-trafego-pago", canonical: PREFIXO_DO_CASO, publishedUrl: null, status: "nova, ainda não publicada" },
  members: [
    membro("pilar-leads", 1, "leads qualificados", "qualificados", "Pilar"),
    membro("sup-instagram", 2, "instagram não traz pacientes", "instagram-nao-traz-pacientes"),
    { ...membro(ARTIGO, 3, PRINCIPAL_DO_CASO, "captacao-de-pacientes-sem-trafego-pago"), statusLabel: "finalizado", inThisFile: true },
    membro("sup-promocoes", 4, "promoções para estética", "promocoes-para-estetica"),
    membro("sup-captar", 5, "como captar um cliente", "como-captar-um-cliente"),
    membro("sup-trafego", 6, "tráfego pago vs orgânico para clínica de estética", "trafego-pago-vs-organico-para-clinica-de-estetica"),
    membro("sup-campanhas", 7, "campanhas de marketing para clínica de estética sem anúncios", "campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios"),
    membro("sup-atrair", 8, "como atrair um cliente", "como-atrair-um-cliente"),
  ],
} as RadarSiloExportWritingContext);

export const PUBLICACAO_DO_CASO_REAL: RadarWritingPublication = {
  published: true, publishedUrl: `${PREFIXO_DO_CASO}/captacao-de-pacientes-sem-trafego-pago`, canonical: null,
  slug: "captacao-de-pacientes-sem-trafego-pago", principalPolicy: null,
} as RadarWritingPublication;

export function entradaDoCasoReal(): RadarPortableExportInput {
  const base = entradaGoogle();
  return {
    ...base,
    article: {
      ...base.article, principalKeyword: PRINCIPAL_DO_CASO, secondaryKeywords: COMPLEMENTARES_DO_CASO, narrativeReinforcements: [], mustCover: [],
      slug: "captacao-de-pacientes-sem-trafego-pago", canonical: null, siloName: "Leads sem Tráfego Pago", articleRole: "support", publishedProtected: true,
      audience: "Dentistas e donos de consultório odontológico que querem captar pacientes sem depender de anúncio pago.", promise: null,
    },
  };
}

export const contextoDoCasoReal = (extra: Partial<RadarWritingArticleContext> = {}): RadarWritingArticleContext => ({
  topRowLabel: "Silo", filePosition: 3, silo: SILO_DO_CASO_REAL(), articleId: ARTIGO, publication: PUBLICACAO_DO_CASO_REAL, blueprint: plantaDoCasoReal(), ...extra,
});

/* ============================== 4 · o Pilar do caso (F2) ============================== */

/*
 * 2026-10-14 · F2 · A PLANTA GRAVADA DO PILAR "leads qualificados" (§4.2 da SDD):
 * regras 2026-10-11c, 3 H2 que abrem pela keyword e 3 links para os 7 Suportes
 * que o grafo pede (P→S HIGH, 7 de 7 no grafo). Os H2 e os links seguem o
 * retrato do banco; o resto da planta é reduzido ao que a leitura precisa. Os
 * candidatos K são os 7 Suportes e a SiloPage (como o pedido os deu).
 */
export const PILAR_DO_CASO = "leads qualificados";
export const ARTIGO_DO_PILAR = "pilar-leads";
const SUPORTES_DO_CASO: ReadonlyArray<[string, string, string]> = [
  ["sup-instagram", "instagram não traz pacientes", "instagram-nao-traz-pacientes"],
  [ARTIGO, PRINCIPAL_DO_CASO, "captacao-de-pacientes-sem-trafego-pago"],
  ["sup-promocoes", "promoções para estética", "promocoes-para-estetica"],
  ["sup-captar", "como captar um cliente", "como-captar-um-cliente"],
  ["sup-trafego", "tráfego pago vs orgânico para clínica de estética", "trafego-pago-vs-organico-para-clinica-de-estetica"],
  ["sup-campanhas", "campanhas de marketing para clínica de estética sem anúncios", "campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios"],
  ["sup-atrair", "como atrair um cliente", "como-atrair-um-cliente"],
];

const SECOES_DO_PILAR = (): Secao[] => [
  secao("Leads qualificados o que é: o contato que chega pronto para conversar", "O que é um lead qualificado?", "É o contato que já sabe o que procura e aceita conversar sobre o serviço.",
    ["Lead frio, morno e qualificado", "Por que o volume de seguidores engana"], [["K1", "o feed que não traz ninguém", "o Instagram sozinho não qualifica o contato"]], null, ["C1"]),
  secao("Gerar leads qualificados: os canais que não dependem de anúncio", "Quais canais trazem contato qualificado sem pagar anúncio?", "Site, perfil no Google e conteúdo que responde dúvidas trazem quem já está procurando.",
    ["Campanhas de marketing sem verba de mídia", "O primeiro contato pelo WhatsApp"], [["K4", "o primeiro contato", "como transformar a primeira conversa em consulta"]], "R1", ["C3"]),
  secao("Geração de leads qualificados: como medir o que vira consulta", "Como saber se o lead virou consulta?", "Meça do primeiro contato ao agendamento, não só cliques.",
    ["Do clique ao agendamento", "Tráfego pago ou orgânico na conta do mês"], [["K5", "pago ou orgânico", "a comparação lado a lado dos dois canais"]], "R2", ["C4"]),
  secao("Promoções que atraem sem derrubar a margem", "Promoção traz contato qualificado?", "Promoção atrai quem procura preço; com critério, ela traz quem volta.",
    ["Quando a promoção vale a pena", "O que dizer na oferta"], [], null, ["P1"]),
];

export function plantaDoPilarDoCasoReal(): RadarArticleBlueprintPayload {
  const base = plantaDoCasoReal();
  const secoes = SECOES_DO_PILAR();
  return {
    ...base,
    blueprint: {
      ...base.blueprint,
      keywordPlan: { reading: "O Pilar cobre o tema inteiro: o que é, como gerar e como medir o lead qualificado.", principalPlacement: ["H1"], complementary: [], slugNote: null },
      title: { h1: "Leads qualificados: o contato que chega pronto para conversar", alternatives: [], seoTitle: "Leads qualificados sem tráfego pago", metaDescription: "Como gerar e medir leads qualificados sem depender de anúncio." },
      sections: secoes,
      visual: [
        { slot: "CAPA", section: null, concept: "Recepção", prompt: "Recepção de clínica com luz natural, sem texto legível. 16:9.", alt: "Recepção", caption: "" },
        { slot: "R1", section: secoes[1].h2, concept: "Canais", prompt: "Mesa com caderno e celular, sem texto legível. 4:3.", alt: "Canais", caption: "" },
        { slot: "R2", section: secoes[2].h2, concept: "Medição", prompt: "Ilustração em SVG de um funil sem rótulos legíveis. 4:3.", alt: "Medição", caption: "" },
      ],
    } as unknown as RadarArticleBlueprintPayload["blueprint"],
    measures: { ...base.measures, plan: { ...base.measures.plan, sections: secoes.length, internalLinks: 3 } },
    linkCandidates: [
      ...SUPORTES_DO_CASO.map(([, principal, slug], indice) => ({ id: `K${indice + 1}`, label: principal, role: "Suporte", destination: `/${slug}`, status: "PLANNED" as const, fromGraph: true })),
      { id: "K8", label: "SiloPage \"Leads sem Tráfego Pago\"", role: "SiloPage", destination: PREFIXO_DO_CASO, status: "PLANNED" as const, fromGraph: false },
    ],
  } as RadarArticleBlueprintPayload;
}

export function entradaDoPilarDoCasoReal(): RadarPortableExportInput {
  const base = entradaGoogle();
  return {
    ...base,
    article: {
      ...base.article, principalKeyword: PILAR_DO_CASO, secondaryKeywords: ["gerar leads qualificados", "geração de leads qualificados"], narrativeReinforcements: [], mustCover: [],
      slug: "qualificados", canonical: null, siloName: "Leads sem Tráfego Pago", articleRole: "pillar", publishedProtected: false,
      audience: "Donos de clínica que querem contatos prontos para conversar sem depender de anúncio pago.", promise: null,
    },
  };
}

export const contextoDoPilarDoCasoReal = (extra: Partial<RadarWritingArticleContext> = {}): RadarWritingArticleContext => ({
  topRowLabel: "Silo", filePosition: 1, silo: SILO_DO_CASO_REAL(), articleId: ARTIGO_DO_PILAR,
  publication: { published: false, publishedUrl: null, canonical: null, slug: "qualificados", principalPolicy: null } as RadarWritingPublication,
  blueprint: plantaDoPilarDoCasoReal(), ...extra,
});

/* ============================== 5 · a SERP já coletada do caso (F3) ============================== */

/*
 * 2026-10-14b · F3 · A SERP DO SUPORTE "captação de pacientes dentista", REDUZIDA
 * (SDD §3 e §13): os orgânicos e o "Pessoas também perguntam" com a resposta que o
 * Google mostrou (os mesmos da SERP crua do F-S), o resumo de IA citando o CFO, e
 * as páginas comparáveis lidas com a posição, as medidas, os conceitos e os H2
 * (sem o texto de nenhuma página). psitto, zenklub e amplimed são de psicologia
 * (fora do leitor); prospectaodonto tem 15.944 palavras (fora da curva). O top
 * relevante (capim, cemoi, idealodonto) organiza pela jornada do paciente; o resto,
 * não. Nenhum dado pessoal.
 */
export const SERP_ORGANICA_DO_CASO = Object.freeze([
  { position: 1, title: "Como captar 20 pacientes por semana sem gastar R$1,00", url: "https://www.youtube.com/watch?v=video-exemplo", domain: "youtube.com", snippet: "Veja o passo a passo para lotar a agenda." },
  { position: 3, title: "10 estratégias para captação de pacientes na odontologia", url: "https://blog.capim.com.br/artigo/captacao-de-pacientes", domain: "blog.capim.com.br", snippet: "1. Conheça bem seu público-alvo · 2. Marque presença nas redes sociais" },
  { position: 4, title: "Dicas de Ouro para Captação de Pacientes na Odontologia", url: "https://www.cemoi.com.br/dicas-de-ouro-para-captacao-de-pacientes-na-odontologia/", domain: "cemoi.com.br", snippet: "1. Tenha uma Presença Digital Forte e Profissional · 2. Atendimento de Excelência" },
  { position: 6, title: "Você, psicólogo, quer fazer parte da Psitto terapia online?", url: "https://www.psitto.com.br/sou-psicologo/", domain: "psitto.com.br", snippet: "Cadastre-se como psicólogo e atenda online." },
  { position: 7, title: "Zenklub: Terapia online com psicólogos disponíveis 24h por dia", url: "https://zenklub.com.br/", domain: "zenklub.com.br", snippet: "Encontre psicólogos para terapia online." },
  { position: 8, title: "Como captar pacientes: estratégias para psicólogos", url: "https://www.amplimed.com.br/blog/como-captar-pacientes-na-psicologia/", domain: "amplimed.com.br", snippet: "Estratégias para psicólogos captarem pacientes." },
  { position: 9, title: "como atrair mais pacientes para o seu consultório", url: "https://www.idealodonto.com.br/blog/captacao-de-pacientes-odontologia/", domain: "idealodonto.com.br", snippet: "Existem várias formas de captar pacientes, incluindo marketing digital." },
  { position: 10, title: "Prospecta Odonto | Marketing e Captação para Dentistas", url: "https://www.prospectaodonto.com.br/", domain: "prospectaodonto.com.br", snippet: "Somos a 1ª agência de marketing odontológico especializada em captação de pacientes." },
  { position: 12, title: "Captação de pacientes dentista: o guia do orgânico", url: "https://www.odontoblog-exemplo.com.br/captacao/", domain: "odontoblog-exemplo.com.br", snippet: "Tudo sobre captar pacientes com tráfego orgânico." },
  { position: 14, title: "Como o consultório odontológico atrai pacientes pela internet", url: "https://www.clinica-software-exemplo.com.br/blog/atrair-pacientes/", domain: "clinica-software-exemplo.com.br", snippet: "O site e o perfil no Google ajudam o consultório a ser encontrado." },
]);

type PaginaDoCaso = { url: string; domain: string; title: string; bestPosition: number; words: number; h2: number; concepts: string[]; headings: string[] };
export const PAGINAS_COMPARAVEIS_DO_CASO: readonly PaginaDoCaso[] = Object.freeze([
  { url: SERP_ORGANICA_DO_CASO[1].url, domain: "blog.capim.com.br", title: SERP_ORGANICA_DO_CASO[1].title, bestPosition: 3, words: 2100, h2: 10, concepts: ["canais e conteúdo", "site profissional", "jornada do paciente", "presença nas redes sociais"], headings: ["1. Conheça bem seu público-alvo", "2. Marque presença nas redes sociais", "3. Ofereça uma experiência marcante"] },
  { url: SERP_ORGANICA_DO_CASO[2].url, domain: "cemoi.com.br", title: SERP_ORGANICA_DO_CASO[2].title, bestPosition: 4, words: 1900, h2: 8, concepts: ["canais e conteúdo", "site profissional", "jornada do paciente", "atendimento no primeiro contato"], headings: ["Tenha uma Presença Digital Forte e Profissional", "Atendimento de Excelência Começa no Primeiro Contato"] },
  { url: SERP_ORGANICA_DO_CASO[3].url, domain: "psitto.com.br", title: SERP_ORGANICA_DO_CASO[3].title, bestPosition: 6, words: 800, h2: 2, concepts: ["canais e conteúdo"], headings: ["Como funciona", "Planos"] },
  { url: SERP_ORGANICA_DO_CASO[4].url, domain: "zenklub.com.br", title: SERP_ORGANICA_DO_CASO[4].title, bestPosition: 7, words: 1200, h2: 4, concepts: ["canais e conteúdo"], headings: ["Terapia online", "Psicólogos"] },
  { url: SERP_ORGANICA_DO_CASO[5].url, domain: "amplimed.com.br", title: SERP_ORGANICA_DO_CASO[5].title, bestPosition: 8, words: 1800, h2: 6, concepts: ["canais e conteúdo", "site profissional"], headings: ["Como captar pacientes na psicologia", "Marketing para psicólogos"] },
  { url: SERP_ORGANICA_DO_CASO[6].url, domain: "idealodonto.com.br", title: SERP_ORGANICA_DO_CASO[6].title, bestPosition: 9, words: 2400, h2: 9, concepts: ["canais e conteúdo", "site profissional", "jornada do paciente", "diferença entre tráfego pago e orgânico"], headings: ["Marketing digital", "Referências e parcerias", "Conclusão"] },
  { url: SERP_ORGANICA_DO_CASO[7].url, domain: "prospectaodonto.com.br", title: SERP_ORGANICA_DO_CASO[7].title, bestPosition: 10, words: 15944, h2: 30, concepts: ["canais e conteúdo", "site profissional"], headings: ["Captação de pacientes", "Clientes"] },
  { url: SERP_ORGANICA_DO_CASO[8].url, domain: "odontoblog-exemplo.com.br", title: SERP_ORGANICA_DO_CASO[8].title, bestPosition: 12, words: 1700, h2: 9, concepts: ["canais e conteúdo", "diferença entre tráfego pago e orgânico"], headings: ["Captação de pacientes dentista: o que é", "Captação de pacientes dentista no Instagram", "Captação de pacientes dentista com anúncios", "O que é tráfego orgânico"] },
  { url: SERP_ORGANICA_DO_CASO[9].url, domain: "clinica-software-exemplo.com.br", title: SERP_ORGANICA_DO_CASO[9].title, bestPosition: 14, words: 2000, h2: 7, concepts: ["canais e conteúdo", "site profissional"], headings: ["O site do consultório", "O perfil no Google", "Perguntas frequentes"] },
]);

export const PAA_DO_CASO = Object.freeze([
  { question: "Como fazer captação de pacientes em odontologia?", answer: "A captação começa pelo perfil da clínica no Google e por um site que responde às dúvidas.", sourceUrl: SERP_ORGANICA_DO_CASO[1].url },
  { question: "O que o CRO não permite postar?", answer: null, sourceUrl: null },
  { question: "Como conseguir captar pacientes?", answer: "Para conseguir captar pacientes de forma constante, o consultório precisa ser encontrado por quem já procura o tratamento: site com páginas por serviço, perfil no Google coerente, avaliações respondidas e conteúdo que responde às dúvidas da recepção.", sourceUrl: SERP_ORGANICA_DO_CASO[6].url },
  { question: "Como criar um script para captar pacientes para a odontologia?", answer: "Um script para psicólogos captarem pacientes começa pela apresentação do profissional e pela forma de atendimento online, com horários e valores.", sourceUrl: SERP_ORGANICA_DO_CASO[5].url },
  { question: "Como funciona o tráfego vindo de IA?", answer: null, sourceUrl: null },
]);

/*
 * 2026-10-14b · F3 · A ENTRADA DO EXPORT COM A SERP DO CASO: a bancada do caso
 * (`entradaDoCasoReal`) com o snapshot da SERP canônica do caso (orgânicos, PAA
 * com a resposta, resumo de IA citando o CFO), as páginas comparáveis lidas
 * (posição, medidas e conceitos no modelo observado) e os H2 delas
 * (`competitorOutlines`). O resto do pacote continua o da bancada.
 */
export function entradaDoCasoRealComSerp(): RadarPortableExportInput {
  const base = entradaDoCasoReal();
  const observado = structuredClone(base.googleObserved) as unknown as Record<string, unknown> & {
    competitors: Array<Record<string, unknown>>; concepts: { all: Array<Record<string, unknown>> }; entities: Record<string, unknown>; sample: Record<string, unknown>;
  };
  const modelo = observado.competitors[0];
  observado.competitors = PAGINAS_COMPARAVEIS_DO_CASO.map(pagina => ({
    ...modelo, url: pagina.url, domain: pagina.domain, title: pagina.title, comparable: true, referenceId: null,
    ranks: [{ keyword: PRINCIPAL_DO_CASO, role: "principal", rank: pagina.bestPosition }],
    structure: { words: pagina.words, h2: pagina.h2, h3: 0, paragraphs: Math.round(pagina.words / 45), images: 2, lists: 1 },
    conceptsCovered: [...pagina.concepts], questionsCovered: [],
  }));
  const conceito = observado.concepts.all[0];
  observado.concepts.all = leituraDoCasoReal().concepts.map(item => ({ ...conceito, id: `c-${item.label}`, canonicalLabel: item.label, variants: [item.label], status: item.status, sourceCount: item.sourceCount, sampleSize: item.sampleSize }));
  observado.entities = { ...observado.entities, marketOnly: [{ label: "Perfil da Empresa no Google", pages: 4, evidence: "4 páginas citam." }] };
  observado.sample = { ...observado.sample, comparablePages: PAGINAS_COMPARAVEIS_DO_CASO.length };
  /* O snapshot da bancada, com a SERP do caso no lugar (os blocos que o caso não usa ficam os da bancada). */
  const daBancada = (base.serpObserved?.snapshot || {}) as Record<string, unknown> & { serpFeatures: Record<string, unknown> & { aiOverview: Record<string, unknown> }; diagnostic: Record<string, unknown> };
  const snapshot = {
    ...daBancada,
    query: PRINCIPAL_DO_CASO,
    organicResults: SERP_ORGANICA_DO_CASO.map(item => ({ ...item, sitelinks: [], date: null, inferredType: "article", confidence: "high", manualType: null, notes: "" })),
    peopleAlsoAsk: PAA_DO_CASO.map((item, indice) => ({ position: indice + 1, question: item.question, answer: item.answer, sourceTitle: null, sourceUrl: item.sourceUrl, classification: null, notes: "" })),
    relatedSearches: [{ term: "captação de pacientes odontologia", classification: null, notes: "" }, { term: "empresa de captação de pacientes", classification: null, notes: "" }],
    knowledgeGraph: null,
    diagnostic: { ...daBancada.diagnostic, recurringTitlePatterns: ["Listas numeradas: 10 estratégias, 22 dicas"] },
    serpFeatures: {
      ...daBancada.serpFeatures,
      aiOverview: { ...daBancada.serpFeatures.aiOverview, present: true, references: [{ domain: "cfo.org.br", title: "Código de ética odontológica", url: "https://website.cfo.org.br/codigo-de-etica/" }] },
    },
  };
  return {
    ...base,
    googleObserved: observado as never,
    serpObserved: { ...(base.serpObserved || {}), snapshot: snapshot as never, serpDecisions: [] },
    competitorOutlines: PAGINAS_COMPARAVEIS_DO_CASO.map(pagina => ({ url: pagina.url, title: pagina.title, domain: pagina.domain, headings: pagina.headings.map(text => ({ level: 2, text })) })),
  };
}

/** A entrada pura da leitura competitiva do caso (o que a ponte do export monta do pacote). */
export function leituraDoCasoReal(): RadarCompetitiveReadingInput {
  return {
    principal: PRINCIPAL_DO_CASO,
    core: [...COMPLEMENTARES_DO_CASO],
    audience: "Dentistas e donos de consultório odontológico que querem captar pacientes sem depender de anúncio pago.",
    organic: SERP_ORGANICA_DO_CASO.map(item => ({ ...item })),
    pages: PAGINAS_COMPARAVEIS_DO_CASO.map(item => ({ ...item })),
    concepts: [
      { label: "canais e conteúdo", sourceCount: 9, sampleSize: 9, status: "RECURRENT" },
      { label: "site profissional", sourceCount: 6, sampleSize: 9, status: "RECURRENT" },
      { label: "jornada do paciente", sourceCount: 3, sampleSize: 9, status: "RECURRENT" },
      { label: "diferença entre tráfego pago e orgânico", sourceCount: 2, sampleSize: 9, status: "RECURRENT" },
      { label: "regras do CRO para publicidade", sourceCount: 1, sampleSize: 9, status: "UNDERCOVERED" },
    ],
    peopleAlsoAsk: PAA_DO_CASO.map(item => ({ ...item })),
    aiOverview: { shown: true, citedSources: [{ domain: "cfo.org.br", url: "https://website.cfo.org.br/codigo-de-etica/", title: "Código de ética odontológica" }] },
    titlePatterns: ["Listas numeradas: 10 estratégias, 22 dicas"],
    marketOnlyEntities: [{ label: "Perfil da Empresa no Google", pages: 4 }],
    recommendedAngle: "O checklist do que a clínica já tem antes de qualquer canal.",
    recommendedDifferentiation: [],
  };
}
