import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RADAR_WRITING_EXPORT_COLUMNS,
  RADAR_WRITING_GENERAL_RULES,
  buildRadarWritingBrandVoiceRow,
  buildRadarWritingExportArticle,
  buildRadarWritingTopRow,
  radarWritingExportCsv,
  radarWritingSourceMark,
  type RadarWritingArticleContext,
  type RadarWritingExportRow,
  type RadarWritingPublication,
} from "../lib/radar/portable-writing-export.ts";
import { radarCompetitorBrandOf, radarCompetitorHeadingIsNoise, radarCompetitorTopics, type RadarCompetitorOutlinePage } from "../lib/radar/competitor-topics.ts";
import { radarArticleBlueprintColumns, type RadarArticleBlueprintPayload } from "../lib/radar/article-blueprint.ts";
import { radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import type { RadarBrandVoice, RadarBrandVoiceState } from "../lib/radar/brand-voice.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import type { RadarSiloExportWritingContext } from "../lib/radar/portable-silo-export.ts";
import { ARTIGO, EXPORTADO_EM, LEITURA_DAS_LENTES, contextoDePesquisa, entradaGoogle, montadasDoSiloSaude, planoDoSilo } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== 2026-10-08 · O CSV PARA ESCREVER DEPOIS DO CASO REAL DE 08/10 (Grupo C do desenho) =====
 *
 * O CSV real "como atrair clientes pelo instagram" (slug publicado
 * instagram-nao-traz-pacientes) saiu de um artigo-modelo ANTIGO (montado antes de
 * 2026-10-02: só M1, sem mapa da página publicada, sem versão das regras) e
 * trazia:
 *   C1 · "Skill … (em rascunho na Marca)" e "Versão 1 da Skill de voz, em rascunho na Marca.";
 *   C2 · "seção existente que a planta não tem só sai com decisão humana — leve-a como pendência";
 *   C3 · "Link externo: … → fonte a obter (fonte oficial)";
 *   C4 · nenhuma trava de fonte ("canais que convertem", "procuram no Google, não no Instagram",
 *        "converte visitantes em agendamentos" passavam como fato);
 *   C5 · cabeçalhos de concorrente com ruído ("… com a Bagy", "Carol", "Agora a sua loja virtual",
 *        "Feriados e datas comemorativas de setembro…", "catálogo online");
 *   C6 · "Costurar num mesmo argumento X e Y" com X e Y em "Já coberto pela maioria";
 *   C7 · "pitch de vendas" e "vender muito no Instagram" a responder, "chamar a atenção" fora,
 *        e o WhatsApp (outro tópico do Silo) a responder aqui;
 *   C8 · "[RELATO DA MARCA — preencher]";
 *   C9 · destino planejado dito como se fosse endereço publicado ("use o caminho");
 *   e "Google Meu Negócio" (B4) na planta antiga.
 *
 * As fixtures imitam o caso (inventadas a partir do extrato; nada lido do
 * arquivo do dono). O CSV INTEIRO (topo, voz e artigo) é varrido contra as
 * palavras proibidas do D10. PROVIDER_CALLS = 0 e AI_CALLS = 0.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* A lista do desenho (D10), mais "aguardando" (o especialista) e o marcador de relato. 2026-10-08 (correção da revisão) · e as esperas antigas: "a definir" e "conferir antes". */
const D10_PROIBIDAS = [/\bpend[eê]ncia/i, /pendente de/i, /aguardando/i, /confira antes de aprovar/i, /rascunho/i, /fonte a obter/i, /preencher/i, /RELATO DA MARCA/, /\ba definir\b/i, /conferir antes/i];
/*
 * O texto do export, sem o trecho de terceiro: o snippet orgânico entre “…” é
 * pesquisa citada como veio (a coleta real da bancada diz "para preencher
 * rugas"), não instrução do entregável.
 */
const doExport = (texto: string) => texto.replace(/“[^”]*”/g, "“…”");

/* ============================== as fixtures do caso ============================== */

const PRINCIPAL = "como atrair clientes pelo instagram";
const COMPLEMENTAR = "instagram não traz pacientes";
const URL_PUBLICADA = "https://adalbapro.com.br/leads-sem-trafego-pago/instagram-nao-traz-pacientes";
const H2_PUBLICADOS = [
  "Instagram não traz pacientes quando o pessoal da clínica vira refém do jogo de engajamento",
  "O guru vende frequência. A clínica paga com cansaço",
  "O erro geográfico que quase ninguém fala",
  "Posts para Instagram estética não corrigem uma base fraca",
  "Quando o Instagram vira uma muleta cara",
  "A clínica não precisa de mais uma agência fazendo peça solta",
  "O Instagram continua no jogo, mas no lugar certo",
  "Como saber se a clínica está jogando o jogo errado?",
  "O jogo maduro é construir captação própria",
];

const kw = (text: string, role: string, volume: number) => ({
  identity: { keywordId: `kw-${role}`, text, role },
  strategy: { volume, kgrScore: null, normalizedIntent: "informacional", coveredIntentions: ["informacional"] },
  resolution: "FULL", provenance: { textSource: "hydration", strategySource: "article_reference" },
});
const pergunta = (canonicalQuestion: string, pages: number) => ({ canonicalQuestion, status: "MARKET_QUESTION_UNDERCOVERED", pages, sampleSize: 6, declaredByArticle: false, evidence: `${pages} de 6` });
const candidatoFora = (observedLabel: string) => ({ observedLabel, pages: 1, sampleSize: 6, verdict: "OUT_OF_SCOPE", reason: "O ArticleDNA não declara este assunto e ele não toca a composição de keywords: pertence a outro artigo.", sectionId: null });
const pagina = (domain: string, headings: string[]): RadarCompetitorOutlinePage => ({ url: `https://${domain}/blog/como-atrair-clientes-instagram`, title: domain, domain, headings: headings.map(text => ({ level: 2, text })) });

/* Os cabeçalhos dos concorrentes, com o ruído do caso real no meio dos temas legítimos. */
const PAGINAS_CONCORRENTES: RadarCompetitorOutlinePage[] = [
  pagina("www.nextar.com.br", ["Crie uma biografia atrativa", "Produza conteúdos relevantes", "Use as hashtags certas", "Promova a interação nos comentários", "Faça parcerias com influenciadores"]),
  pagina("www.nuvemshop.com.br", ["Tenha uma conta comercial", "Conheça sua audiência", "Agora a sua loja virtual", "Aproveite os recursos do Instagram", "Carol"]),
  pagina("www.bagy.com.br", ["Crie uma bio atrativa", "Aposte nas hashtags", "Faça parceria com influenciadores", "Transforme seus seguidores em clientes com a Bagy", "Qual a importância de ter um catálogo online"]),
  pagina("conteudo.stone.com.br", ["Produza conteúdos relevantes para sua persona", "Destaques de forma estratégica", "Feriados e datas comemorativas de setembro: calendário do mês", "Interaja com os seguidores"]),
  pagina("vetlinebrasil.com.br", ["Otimize o perfil do seu negócio", "Use o espaço da bio", "Monte um calendário para suas postagens", "Stories e Reels"]),
  pagina("suaimprensa.com.br", ["Interaja com os seguidores", "Stories para atrair clientes", "Tenha um calendário de publicações", "Aposte nas hashtags"]),
];

function entradaDoCaso(extra: Partial<RadarPortableExportInput> = {}): RadarPortableExportInput {
  const base = entradaGoogle();
  const contexto = { ...contextoDePesquisa(), keywords: [kw(PRINCIPAL, "principal", 1600), kw(COMPLEMENTAR, "secundaria", 30)], resolvedKeywordTexts: [PRINCIPAL, COMPLEMENTAR], editorialTopics: [] };
  const observado = structuredClone(base.googleObserved) as unknown as Record<string, unknown>;
  observado.questions = [
    pergunta("Como captar clientes pela internet?", 1), pergunta("Como captar clientes pelo WhatsApp?", 1),
    pergunta("Como fazer um pitch de vendas eficiente? Guia para converter clientes", 1), pergunta("Como prospectar clientes pelo Instagram com tráfego orgânico?", 2),
    pergunta("Como prospectar mais clientes pelo Instagram?", 2), pergunta("Como transformar seguidores em clientes no Instagram?", 2),
    pergunta("Devo seguir meus clientes no Instagram?", 1), pergunta("O que fazer para vender muito no Instagram?", 1),
    /* A mesma pergunta que a planta já responde na seção 1: não se repete entre as perguntas a responder. */
    pergunta("O Instagram realmente serve para atrair clientes?", 1),
  ];
  observado.aiDiscovery = null;
  const modelo = structuredClone(base.articleModel) as unknown as Record<string, unknown> & { candidates?: unknown[] };
  modelo.candidates = [...(modelo.candidates || []), candidatoFora("Como chamar a atenção no Instagram?"), candidatoFora("Ative o Instagram Shopping")];
  return {
    ...base,
    article: {
      ...base.article, principalKeyword: PRINCIPAL, secondaryKeywords: [COMPLEMENTAR], slug: "instagram-nao-traz-pacientes", canonical: URL_PUBLICADA, mustCover: [],
      audience: "Profissionais de saúde e estética que usam Instagram para divulgar o consultório.", promise: null, siloName: "Leads sem Tráfego Pago", articleRole: "support",
    },
    researchContext: contexto as never,
    googleObserved: observado as never,
    articleModel: modelo as never,
    dossierGaps: base.dossierGaps ? { ...base.dossierGaps, observed: observado as never } : null,
    internalLinks: [],
    authors: [{ name: "Especialista Exemplo", specialty: "SEO para clínicas", source: "contribution" }],
    competitorOutlines: PAGINAS_CONCORRENTES,
    ...extra,
  };
}

type Secao = RadarArticleBlueprintPayload["blueprint"]["sections"][number];
const secao = (h2: string, extra: Partial<Secao>): Secao => ({
  h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta.", from: ["M1"], h3: [], explain: [], paragraphs: 3, bold: [], terms: [], evidence: [],
  specialist: null, video: null, internalLinks: [], externalLinks: [], image: null, practical: null, ...extra,
} as Secao);

/* O artigo-modelo ANTIGO do caso real: só M1, sem publishedMap nem rulesVersion, "Google Meu Negócio", link externo sem fonte, 5 links planejados e 1 publicado. */
function plantaAntiga(): RadarArticleBlueprintPayload {
  return {
    schemaVersion: 1,
    blueprint: {
      keywordPlan: { reading: "A principal define a intenção e o H1; a complementar é o contraponto.", principalPlacement: ["H1", "primeiro parágrafo"], complementary: [{ keyword: COMPLEMENTAR, placement: "H2 da seção 2", reason: "a frustração do público" }], slugNote: null },
      reader: "Profissionais de saúde e estética que usam Instagram para divulgar o consultório, mas sentem que o esforço não se converte em pacientes agendados.",
      promise: "Mostrar por que o Instagram, sozinho, não enche a agenda e como usar a plataforma de forma estratégica para atrair clientes, sem depender de tráfego pago.",
      angle: { statement: "O Instagram é uma vitrine, não um funil de vendas: ele gera atenção, mas a conversão em pacientes exige estratégia e presença orgânica complementar.", evidence: ["S1"] },
      title: { h1: "Como atrair clientes pelo Instagram (sem cair na ilusão de que ele enche a agenda)", alternatives: ["Instagram não traz pacientes? Entenda o que fazer para atrair clientes de verdade"], seoTitle: "Como atrair clientes pelo Instagram | AdalbaPro", metaDescription: "Descubra por que o Instagram não traz pacientes sozinho e aprenda estratégias práticas para atrair clientes pelo Instagram." },
      opening: { readerQuestion: "Por que eu posto todos os dias no Instagram e mesmo assim não consigo pacientes?", direction: "A abertura reconhece a frustração de quem investe tempo no Instagram e não vê retorno, introduzindo a ideia de que a plataforma serve para atrair atenção, mas não converte sozinha.", evidence: ["P1"] },
      sections: [
        secao("O que o Instagram faz bem (e o que ele não faz)", {
          readerQuestion: "O Instagram realmente serve para atrair clientes?",
          answerFirst: "O Instagram é ótimo para gerar visibilidade e engajamento, mas não foi desenhado para converter seguidores em pacientes automaticamente.",
          h3: ["O papel do algoritmo na entrega de conteúdo", "Por que seguidores não são sinônimo de pacientes"],
          explain: ["O algoritmo prioriza conteúdo que gera interação, não necessariamente o que leva a agendamentos.", "A atenção no feed é passageira; a decisão de marcar consulta envolve confiança e necessidade.", "Muitos perfis têm milhares de seguidores, mas poucos se tornam pacientes."],
          evidence: ["S2"], internalLinks: [{ candidate: "K1", anchor: "tráfego pago vs orgânico", reason: "Aprofunda a comparação entre estratégias pagas e orgânicas." }],
          externalLinks: [{ claim: "O algoritmo do Instagram prioriza conteúdo com alto engajamento.", sourceType: "fonte oficial", source: null }], image: "R1",
        }),
        secao("Instagram não traz pacientes: por que isso acontece?", {
          readerQuestion: "Por que meu Instagram não traz pacientes, mesmo com muitos seguidores?",
          answerFirst: "O Instagram não traz pacientes porque ele foi feito para entretenimento e descoberta, não para a decisão de agendar uma consulta.",
          h3: ["A natureza do conteúdo no Instagram", "A falta de intenção de busca do usuário", "O mito do 'postar todo dia'"],
          explain: ["O conteúdo do Instagram é consumido de passagem, sem o compromisso de uma necessidade imediata.", "Quem está no Instagram não está necessariamente procurando um médico ou clínica.", "Postar com frequência não garante relevância nem conversão."],
          internalLinks: [{ candidate: "K2", anchor: "captação de pacientes sem tráfego pago", reason: "Apresenta alternativas orgânicas." }],
        }),
        secao("Como usar o Instagram para atrair clientes de forma estratégica", {
          readerQuestion: "Então como eu posso usar o Instagram para atrair clientes?",
          answerFirst: "Use o Instagram como vitrine para gerar autoridade e relacionamento, direcionando o público para canais que convertem, como o site e o WhatsApp.",
          h3: ["Otimize seu perfil para conversão", "Crie conteúdo que responda às dúvidas do paciente", "Use stories para mostrar bastidores e humanizar"],
          explain: ["A bio deve deixar claro quem você atende e como agendar.", "Conteúdo educativo gera confiança e posiciona você como autoridade.", "Stories criam proximidade e incentivam o contato direto."],
          internalLinks: [{ candidate: "K3", anchor: "como atrair um cliente", reason: "Detalha o processo de atração." }], image: "R2",
        }),
        secao("Estratégias práticas para atrair clientes pelo Instagram", {
          readerQuestion: "Quais ações concretas posso aplicar hoje no meu Instagram?",
          answerFirst: "Aplique táticas como parcerias com influenciadores locais, uso de hashtags relevantes e interação ativa com a audiência.",
          h3: ["Parcerias com influenciadores e perfis locais", "Uso inteligente de hashtags e geolocalização", "Interação e networking na plataforma"],
          explain: ["Influenciadores locais podem ampliar seu alcance para o público certo.", "Hashtags e geolocalização ajudam a ser encontrado por quem está perto.", "Comentar e responder mensagens constrói relacionamento e confiança."],
          internalLinks: [{ candidate: "K4", anchor: "como captar um cliente", reason: "Complementa com técnicas de captação." }],
        }),
        secao("O que fazer quando o Instagram não é suficiente", {
          readerQuestion: "E se mesmo com estratégia o Instagram não trouxer pacientes?",
          answerFirst: "Combine o Instagram com presença orgânica em outros canais, como Google Meu Negócio e site otimizado, para captar pacientes com intenção de busca.",
          h3: ["A importância do Google para clínicas", "Como o site e o SEO complementam o Instagram", "Integrando canais para uma estratégia completa"],
          explain: ["Pacientes com dor ou necessidade procuram no Google, não no Instagram.", "Um site otimizado converte visitantes em agendamentos.", "A integração entre canais aumenta a chance de ser encontrado."],
          internalLinks: [{ candidate: "K5", anchor: "gerar leads qualificados", reason: "Explica como gerar leads." }, { candidate: "K6", anchor: "SEO para clínicas", reason: "Apresenta o serviço." }], image: "R3",
        }),
      ],
      closing: {
        turn: "O Instagram é uma ferramenta poderosa para atrair atenção, mas não substitui uma estratégia de captação de pacientes. Para transformar seguidores em agendamentos, é preciso ir além da plataforma.",
        specialist: "E1",
        cta: "Se você quer parar de depender do Instagram e construir uma presença orgânica que realmente traz pacientes, conheça o SEO para clínicas da AdalbaPro.",
        nextStep: "Acesse a página de SEO para clínicas e descubra como aparecer no Google.",
      },
      visual: [
        { slot: "CAPA", section: null, concept: "Profissional olhando o celular com a agenda vazia ao fundo", prompt: "Mulher de jaleco branco em consultório, olhando o smartphone; ao fundo, agenda aberta vazia. Sem texto legível. Proporção 16:9.", alt: "Profissional de saúde olhando o celular", caption: "" },
        { slot: "R1", section: "O que o Instagram faz bem (e o que ele não faz)", concept: "Feed cheio de curtidas e agenda vazia", prompt: "Ilustração dividida: tela de smartphone com corações; agenda de papel em branco. Sem texto legível. Proporção 4:3.", alt: "Engajamento e agenda vazia", caption: "" },
        { slot: "R2", section: "Como usar o Instagram para atrair clientes de forma estratégica", concept: "Profissional gravando stories", prompt: "Mulher de jaleco gravando stories com smartphone em tripé. Sem texto legível. Proporção 4:3.", alt: "Profissional gravando stories", caption: "" },
        { slot: "R3", section: "O que fazer quando o Instagram não é suficiente", concept: "Clínica no mapa", prompt: "Ilustração de mapa com pin sobre uma clínica. Sem texto legível. Proporção 4:3.", alt: "Clínica no mapa", caption: "" },
      ],
      eeat: ["Especialista Exemplo, especialista em SEO para clínicas, assina o artigo."],
      warnings: [],
    } as unknown as RadarArticleBlueprintPayload["blueprint"],
    measures: {
      serp: { comparablePages: 6, words: { median: 2869, p25: 2141, p75: 4228 }, h2: 16, h3: 8, paragraphs: 73, images: 24, lists: 5 },
      plan: { sections: 5, h3: 14, paragraphs: 15, bold: 15, images: 4, respites: 3, internalLinks: 6, externalLinks: 1, wordsMin: 2141, wordsMax: 4228 },
    },
    linkCandidates: [
      { id: "K1", label: "tráfego pago vs orgânico para clínica de estética", role: "Suporte", destination: "/trafego-pago-vs-organico-para-clinica-de-estetica", status: "PLANNED", fromGraph: true },
      { id: "K2", label: "captação de pacientes sem tráfego pago", role: "Suporte", destination: "/captacao-de-pacientes-sem-trafego-pago", status: "PLANNED", fromGraph: true },
      { id: "K3", label: "como atrair um cliente", role: "Suporte", destination: "/como-atrair-um-cliente", status: "PLANNED", fromGraph: true },
      { id: "K4", label: "como captar um cliente", role: "Suporte", destination: "/como-captar-um-cliente", status: "PLANNED", fromGraph: true },
      { id: "K5", label: "Cobrir com clareza o tema “leads qualificados”.", role: "Pilar", destination: "/qualificados", status: "PLANNED", fromGraph: true },
      { id: "K6", label: "Página da marca /servicos/seo-para-clinicas", role: "Página da marca (Skill de voz)", destination: "https://adalbapro.com.br/servicos/seo-para-clinicas", status: "PUBLISHED", fromGraph: false },
    ],
    sources: [],
    evidence: [
      { id: "S1", kind: "resultado orgânico", text: "Guia de como atrair clientes no Instagram · https://www.nextar.com.br/blog/como-conquistar-clientes-com-o-instagram" },
      { id: "S2", kind: "resultado orgânico", text: "Como atrair clientes no Instagram em 2026? · https://www.nuvemshop.com.br/blog/como-atrair-clientes-no-instagram/" },
      { id: "P1", kind: "pergunta da amostra", text: "Quem tem 1.000 seguidores no Instagram ganha dinheiro?" },
    ],
    skeleton: [{ id: "M1", level: 2, parent: null, heading: "O que considerar sobre stories para atrair clientes?", readerQuestion: null, cover: [], mustCover: false, needsSource: false, needsSpecialist: false, outOfScope: false }],
    brandVoice: { versionId: "voz-1", version: 1, name: "AdalbaPro", contentHash: "sha256:voz", status: "draft" },
  };
}

/* O artigo-modelo NOVO (regras de 2026-10-08): a página que a IA viu e o mapa dela — absorve, sai com motivo, omitido. */
function plantaNova(): RadarArticleBlueprintPayload {
  const antiga = plantaAntiga();
  return {
    ...antiga,
    rulesVersion: "2026-10-08",
    publishedStructure: { h1: "Instagram não traz pacientes? Talvez sua clínica esteja jogando o jogo errado", h2: [...H2_PUBLICADOS, "Conclusão"] },
    measures: { ...antiga.measures, plan: { ...antiga.measures.plan, paragraphsMin: 55, paragraphsMax: 108, wordsPerParagraph: 39 } },
    blueprint: {
      ...antiga.blueprint,
      publishedMap: [
        { current: H2_PUBLICADOS[0], section: 2, reason: "a tese da página vira o diagnóstico da seção 2", origin: "ai" },
        { current: H2_PUBLICADOS[1], section: 2, reason: "", origin: "ai" },
        { current: H2_PUBLICADOS[2], section: 5, reason: "o diferencial da página entra na busca local", origin: "ai" },
        { current: H2_PUBLICADOS[3], section: null, reason: "repete o diagnóstico da seção 2 sem entrega nova", origin: "ai" },
        { current: H2_PUBLICADOS[4], section: 2, reason: "", origin: "ai" },
        { current: H2_PUBLICADOS[5], section: null, reason: "oferta comercial fora do escopo deste artigo", origin: "ai" },
        { current: H2_PUBLICADOS[6], section: 3, reason: "", origin: "ai" },
        { current: H2_PUBLICADOS[7], section: 4, reason: "vira o checklist da seção 4", origin: "ai" },
      ],
    },
  };
}

const SILO: RadarSiloExportWritingContext = {
  kind: "silo", label: "Leads sem Tráfego Pago", partial: true, draft: false,
  centralEntity: "Leads sem Tráfego Pago", objective: "Construir autoridade em leads sem tráfego pago.", audience: null, macroProblem: null, dominantIntent: null, whyTogether: null,
  boundary: "Manter a cobertura centrada em leads sem tráfego pago.",
  includedTopics: ["Leads sem Tráfego Pago", COMPLEMENTAR, "como atrair clientes pelo whatsapp", "como captar um cliente", "como captar pacientes", "como captar clientes para contabilidade", "como fazer captação de clientes", "tráfego pago google", "como atrair clientes"],
  excludedTopics: [],
  siloPage: null,
  members: [
    { articleId: "pilar-1", position: 1, title: "leads qualificados", principalKeyword: "leads qualificados", slug: "qualificados", role: "Pilar", statusLabel: "fora desta seleção", inThisFile: false, reason: null },
    { articleId: ARTIGO, position: 2, title: PRINCIPAL, principalKeyword: PRINCIPAL, slug: "instagram-nao-traz-pacientes", role: "Suporte", statusLabel: "finalizado", inThisFile: true, reason: null },
    { articleId: "sup-3", position: 3, title: "captação de pacientes sem tráfego pago", principalKeyword: "captação de pacientes sem tráfego pago", slug: "captacao-de-pacientes-sem-trafego-pago", role: "Suporte", statusLabel: "fora desta seleção", inThisFile: false, reason: null },
    { articleId: "sup-4", position: 4, title: "como captar um cliente", principalKeyword: "como captar um cliente", slug: "como-captar-um-cliente", role: "Suporte", statusLabel: "fora desta seleção", inThisFile: false, reason: null },
    { articleId: "sup-5", position: 5, title: "tráfego pago vs orgânico para clínica de estética", principalKeyword: "tráfego pago vs orgânico para clínica de estética", slug: "trafego-pago-vs-organico-para-clinica-de-estetica", role: "Suporte", statusLabel: "fora desta seleção", inThisFile: false, reason: null },
    { articleId: "sup-6", position: 6, title: "como atrair um cliente", principalKeyword: "como atrair um cliente", slug: "como-atrair-um-cliente", role: "Suporte", statusLabel: "fora desta seleção", inThisFile: false, reason: null },
  ],
} as RadarSiloExportWritingContext;

const publicacao = (h2: string[] | null = [...H2_PUBLICADOS, "Perguntas frequentes"]): RadarWritingPublication => ({
  published: true, publishedUrl: URL_PUBLICADA, canonical: URL_PUBLICADA, slug: "instagram-nao-traz-pacientes", principalPolicy: "revisable",
  currentStructure: h2 ? { h1: "Instagram não traz pacientes? Talvez sua clínica esteja jogando o jogo errado", h2, updatedAt: null } : null,
});

/* A Skill de voz em RASCUNHO (o caso real), com texto inventado. */
const VOZ: RadarBrandVoice = {
  versionId: "voz-1", version: 1, name: "AdalbaPro", contentHash: "sha256:voz", status: "draft", title: "AdalbaPro",
  sections: [
    { heading: "1. Missão", body: "Conteúdo útil para profissionais que divulgam clínicas locais." },
    { heading: "2. Voz", body: "Linguagem próxima, clara e adulta." },
    { heading: "3. Plano visual", body: "Uma capa e dois ou três respiros." },
  ],
  markdown: "## 1. Missão\n\nConteúdo útil para profissionais que divulgam clínicas locais.\n\n## 2. Voz\n\nLinguagem próxima, clara e adulta.\n\n## 3. Plano visual\n\nUma capa e dois ou três respiros.",
};
const VOZ_EM_RASCUNHO: RadarBrandVoiceState = { kind: "available", voice: VOZ };

function csvDoCaso(planta: RadarArticleBlueprintPayload | null, opcoes: { publicacao?: RadarWritingPublication; entrada?: RadarPortableExportInput } = {}) {
  const contexto: RadarWritingArticleContext = {
    topRowLabel: "Silo", filePosition: 2, silo: SILO, articleId: ARTIGO, publication: opcoes.publicacao ?? publicacao(),
    ...(planta ? { blueprint: planta } : {}),
    brandVoice: { versionId: VOZ.versionId, version: 1, name: "AdalbaPro", contentHash: VOZ.contentHash, status: "draft" },
  };
  const artigo = buildRadarWritingExportArticle(opcoes.entrada ?? entradaDoCaso(), contexto);
  const topo = buildRadarWritingTopRow({ label: "Silo", silo: SILO, articles: [artigo], siteUrl: URL_PUBLICADA, brandVoice: VOZ_EM_RASCUNHO, authorsKnown: true });
  const voz = buildRadarWritingBrandVoiceRow(VOZ_EM_RASCUNHO)!;
  return { artigo, linha: artigo.row, topo, voz, csv: radarWritingExportCsv([topo, voz, artigo.row]) };
}

const linhas = (celula: string) => celula.split("\n");
const tudo = (row: RadarWritingExportRow) => RADAR_WRITING_EXPORT_COLUMNS.map(coluna => row[coluna]).join("\n");
const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ============================== o artigo-modelo ANTIGO, de ponta a ponta ============================== */

test("CSV para escrever, artigo-modelo ANTIGO do caso real: o arquivo INTEIRO sai sem as palavras do D10", () => {
  const { csv, artigo } = csvDoCaso(plantaAntiga());
  for (const proibida of D10_PROIBIDAS) {
    const achado = doExport(csv).split(/\r?\n/).find(linha => proibida.test(linha));
    assert.equal(achado, undefined, `${proibida} no CSV: ${achado}`);
  }
  assert.ok(csv.includes("“"), "a varredura cobre o arquivo com a SERP resumida (só o trecho de terceiro fica de fora)");
  assert.doesNotMatch(csv, /Google Meu Negócio|Google My Business/, "B4: o nome antigo do produto não chega ao entregável");
  assert.match(artigo.row.estrutura, /como Perfil da Empresa no Google e site otimizado/);
  assert.equal(artigo.verdict, "Sim", artigo.row.pode_escrever);
});

test("C1 · a voz em rascunho é dita como a versão corrente na Marca, no topo e na linha da voz", () => {
  const { topo, voz } = csvDoCaso(plantaAntiga());
  assert.match(topo.promessa_e_leitor, /aplique a linha "Voz da marca", logo abaixo \(Skill "AdalbaPro" v1 \(versão corrente na Marca\)\)/);
  assert.match(voz.pode_escrever, /^Vale para todas as linhas deste arquivo: Skill "AdalbaPro" v1 \(versão corrente na Marca\)\./);
  assert.equal(linhas(voz.artigo)[1], "Versão 1 da Skill de voz, corrente na Marca.");
});

test("C2 · artigo-modelo antigo: cada H2 publicado tem destino (casamento conservador: o que não casa FICA), e o FAQ legado segue a regra dele", () => {
  const { linha } = csvDoCaso(plantaAntiga());
  const artigo = linhas(linha.artigo);
  assert.ok(artigo.includes("Estrutura publicada atual (lida da página na exportação): H1 \"Instagram não traz pacientes? Talvez sua clínica esteja jogando o jogo errado\"; 10 H2."));
  assert.ok(artigo.includes("Atualização: cada H2 publicado tem destino na planta do artigo-modelo (coluna estrutura); nada sai da página sem decisão registrada no artigo-modelo:"));
  for (const h2 of H2_PUBLICADOS) {
    const destino = artigo.find(item => item.startsWith(`- "${h2.slice(0, 40)}`));
    assert.ok(destino, `o H2 "${h2}" ficou sem destino`);
    assert.match(destino!, /→ (vira a seção \d|fica como seção própria, reescrita na voz)/, destino);
    assert.doesNotMatch(destino!, /→ sai/, "planta antiga não tira H2 nenhum: sem decisão registrada, fica");
  }
  /*
   * 2026-10-08 (correção da revisão) · antes, NENHUM dos 9 H2 casava (as raízes
   * da complementar contavam como comuns) e os 9 iam "logo depois da abertura",
   * antes da seção 1: o artigo respondia à busca só depois da página antiga
   * inteira. Agora o H2 que traz a complementar vai para a seção onde a planta a
   * põe ("H2 da seção 2"), e o que fica sem par vai depois da última seção
   * absorvida — nunca antes da 1ª seção.
   */
  assert.ok(artigo.includes(`- "${H2_PUBLICADOS[0].slice(0, 79).trimEnd()}…" → vira a seção 2 ("Instagram não traz pacientes: por que isso acontece?"), reescrito na voz`), linha.artigo);
  assert.ok(artigo.includes("- \"O erro geográfico que quase ninguém fala\" → fica como seção própria, reescrita na voz, depois da seção 2 (\"Instagram não traz pacientes: por que isso acontece?\")"));
  assert.ok(artigo.includes("- \"Perguntas frequentes\" → FAQ legado: segue a regra do FAQ legado, abaixo"));
  assert.doesNotMatch(linha.artigo, /leve-a como|só sai com decisão humana —|logo depois da abertura/);
  /* A estrutura diz onde cada H2 que fica entra — e a medida soma os H2 mantidos. */
  assert.match(linha.estrutura, /\n- Depois desta seção, a página publicada continua com "O erro geográfico que quase ninguém fala": seção própria, reescrita na voz\.\n/);
  assert.match(linha.estrutura, /\n- Da página publicada, entra aqui \(reescrito na voz\): "Instagram não traz pacientes quando o pessoal/);
  assert.doesNotMatch(linha.estrutura, /Logo depois da abertura/);
  assert.match(linha.estrutura, /^Medidas do plano: 5 H2 \(\+ 8 H2 da página publicada mantidos como seções próprias\) · /m);
  /* O prompt aponta para o mapa. */
  assert.match(linha.prompt, /- Artigo publicado: é atualização; preserve URL, slug e canonical e siga o mapa da página publicada \(coluna artigo\): nenhuma seção existente sai sem decisão registrada no artigo-modelo\./);
});

test("C3 · o link externo sem fonte vira instrução concluída: a afirmação sai delimitada, sem link, e é contada à parte", () => {
  const { linha } = csvDoCaso(plantaAntiga());
  assert.ok(linhas(linha.estrutura).includes("- Sem link externo: \"O algoritmo do Instagram prioriza conteúdo com alto engajamento\" fica delimitada no texto (precisa de fonte: oficial)."));
  assert.doesNotMatch(linha.estrutura, /^- Link externo:/m, "sem fonte do pacote, nenhum link externo");
  assert.match(linha.estrutura, /· 6 links internos · 0 links externos \(1 afirmação delimitada, sem link\) · 2141–4228 palavras\./);
  /* Com a fonte no pacote, o link continua link. */
  const comFonte = plantaAntiga();
  comFonte.sources = [{ id: "X1", url: "https://about.instagram.com/blog/announcements/instagram-ranking-explained", title: "Instagram Ranking Explained", claim: "O algoritmo do Instagram prioriza conteúdo com alto engajamento." }];
  comFonte.blueprint.sections[0].externalLinks = [{ ...comFonte.blueprint.sections[0].externalLinks[0], source: "X1" }];
  const estrutura = radarArticleBlueprintColumns(comFonte).estrutura;
  assert.match(estrutura, /^- Link externo: O algoritmo do Instagram prioriza conteúdo com alto engajamento\. → https:\/\/about\.instagram\.com\/blog\/announcements\/instagram-ranking-explained$/m);
  assert.match(estrutura, /· 1 link externo · /);
});

test("C4 · as três afirmações do caso real levam \"(precisa de fonte: …)\" e entram na lista concluída; a tese do dono e a orientação passam", () => {
  const { linha } = csvDoCaso(plantaAntiga());
  const estrutura = linhas(linha.estrutura);
  assert.ok(estrutura.includes("- Abre respondendo: Use o Instagram como vitrine para gerar autoridade e relacionamento, direcionando o público para canais que convertem, como o site e o WhatsApp (precisa de fonte: afirmação sobre conversão do público)."));
  assert.ok(estrutura.includes("- Explicar: Pacientes com dor ou necessidade procuram no Google, não no Instagram (precisa de fonte: afirmação sobre comportamento do público)."));
  assert.ok(estrutura.includes("- Explicar: Um site otimizado converte visitantes em agendamentos (precisa de fonte: afirmação sobre conversão do público)."));
  /* A frase que a planta liga ao link externo sem fonte trava pela afirmação da própria seção. */
  assert.ok(estrutura.includes("- Explicar: O algoritmo prioriza conteúdo que gera interação, não necessariamente o que leva a agendamentos (precisa de fonte: afirmação que a planta liga a fonte oficial ou verificada)."));
  /* O CTA que afirma efeito comercial também. */
  assert.match(linha.estrutura, /^CTA: Se você quer parar de depender do Instagram e construir uma presença orgânica que realmente traz pacientes, conheça o SEO para clínicas da AdalbaPro \(precisa de fonte: afirmação sobre conversão do público\)\.$/m);
  /* A tese do dono (nega o efeito), a orientação e o efeito que não é comercial passam. */
  assert.ok(linhas(linha.promessa_e_leitor).includes("Promessa: Mostrar por que o Instagram, sozinho, não enche a agenda e como usar a plataforma de forma estratégica para atrair clientes, sem depender de tráfego pago."));
  assert.ok(estrutura.includes("- Explicar: A bio deve deixar claro quem você atende e como agendar."));
  assert.ok(estrutura.includes("- Explicar: Conteúdo educativo gera confiança e posiciona você como autoridade."));
  assert.match(linha.estrutura, /no primeiro parágrafo — A abertura reconhece a frustração [^\n]*mas não converte sozinha\. \[P1/, "a abertura que nega a conversão passa");
  /* A lista concluída, no fim da estrutura, com as três do caso e a do link sem fonte. */
  const lista = estrutura.find(item => item.startsWith("Afirmações que só entram com fonte do pacote ou delimitadas (regra geral 5): "))!;
  assert.ok(lista, "a linha concluída da trava não saiu");
  for (const trecho of ["canais que convertem", "\"Pacientes com dor ou necessidade procuram no Google, não no Instagram\" (afirmação sobre comportamento do público)", "\"Um site otimizado converte visitantes em agendamentos\" (afirmação sobre conversão do público)", "\"O algoritmo do Instagram prioriza conteúdo com alto engajamento\" (afirmação que a planta liga a fonte oficial ou verificada)"]) {
    assert.ok(lista.includes(trecho), trecho);
  }
  assert.doesNotMatch(lista, /Mostrar por que o Instagram, sozinho|A bio deve deixar claro/, "a tese e a orientação não entram na lista");
  assert.match(lista, /Sem fonte do pacote, escreva de forma qualificada ou omita; nenhuma ganha link externo sem fonte\.$/);
  /* A regra geral 5 é a que a marca cita. */
  assert.match(RADAR_WRITING_GENERAL_RULES[4], /^Afirmação marcada "precisa de fonte" só entra com uma das fontes listadas/);
});

test("C4 · a premissa da planta (promessa, ângulo, direção da abertura e virada) também passa pela trava", () => {
  const planta = plantaAntiga();
  planta.blueprint.promise = "Mostrar como o Instagram traz pacientes para a clínica.";
  planta.blueprint.angle = { ...planta.blueprint.angle, statement: "O Instagram gera agendamentos quando o perfil é bem feito." };
  planta.blueprint.opening = { ...planta.blueprint.opening, direction: "Abrir dizendo que pacientes procuram no Google, não no Instagram." };
  planta.blueprint.closing = { ...planta.blueprint.closing, turn: "Um site otimizado converte visitantes em agendamentos." };
  const colunas = radarArticleBlueprintColumns(planta);
  const promessa = linhas(colunas.promessa_e_leitor);
  assert.ok(promessa.includes("Promessa: Mostrar como o Instagram traz pacientes para a clínica (precisa de fonte: afirmação sobre conversão do público)."), colunas.promessa_e_leitor);
  /* 2026-10-08 (correção da revisão) · B6 no export: o ângulo não cita resultado orgânico (S1) — ele não sustenta diferencial. */
  assert.ok(promessa.includes("Ângulo: O Instagram gera agendamentos quando o perfil é bem feito (precisa de fonte: afirmação sobre conversão do público)."), colunas.promessa_e_leitor);
  assert.match(colunas.estrutura, / — Abrir dizendo que pacientes procuram no Google, não no Instagram \(precisa de fonte: afirmação sobre comportamento do público\)\. \[P1/);
  assert.match(colunas.estrutura, /^Fechamento: Um site otimizado converte visitantes em agendamentos \(precisa de fonte: afirmação sobre conversão do público\)\. \(voz do especialista E1\)$/m);
  const lista = linhas(colunas.estrutura).find(item => item.startsWith("Afirmações que só entram com fonte do pacote ou delimitadas"))!;
  for (const trecho of ["Mostrar como o Instagram traz pacientes para a clínica", "O Instagram gera agendamentos quando o perfil é bem feito", "Abrir dizendo que pacientes procuram no Google"]) assert.ok(lista.includes(trecho), trecho);
});

test("C4 · fora do artigo-modelo, promessa, fechamento e chamada final também passam pela trava; a frase que nega o efeito não", () => {
  const base = entradaGoogle();
  const modelo = structuredClone(base.articleModel) as unknown as Record<string, unknown> & { conclusion: Record<string, unknown> };
  modelo.conclusion = { ...modelo.conclusion, synthesis: "Um site otimizado converte visitantes em agendamentos.", callToAction: "O Instagram, sozinho, não enche a agenda: conheça o serviço." };
  const row = buildRadarWritingExportArticle({ ...base, articleModel: modelo as never }, { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null }).row;
  const promessa = linhas(row.promessa_e_leitor);
  assert.ok(promessa.includes("Fechamento: Um site otimizado converte visitantes em agendamentos (precisa de fonte: afirmação sobre conversão do público)."), row.promessa_e_leitor);
  assert.ok(promessa.includes("Chamada final: O Instagram, sozinho, não enche a agenda: conheça o serviço."), "a tese que nega o efeito passa");
  assert.equal(radarWritingSourceMark("Gera confiança.", { needs: false, label: "" }), "Gera confiança.");
  assert.equal(radarWritingSourceMark("Converte mais", { needs: true, label: "afirmação sobre conversão do público" }), "Converte mais (precisa de fonte: afirmação sobre conversão do público)");
});

test("C5 · cabeçalhos dos concorrentes: autopromoção, nome solto, loja e conteúdo datado saem; os temas legítimos ficam", () => {
  const { linha } = csvDoCaso(plantaAntiga());
  const serp = linha.serp_resumida;
  /* 2026-10-08 · P1 · a recorrência dos temas conta SITES (o menu repetido de um site não vira tema). */
  assert.match(serp, /O que os concorrentes lidos cobrem \(H2\/H3 das 6 páginas comparáveis, de 6 site\(s\); /);
  for (const ruido of [/com a Bagy/, /"Carol"/, /loja virtual/i, /catálogo online/i, /setembro|datas comemorativas/i]) assert.doesNotMatch(serp, ruido, String(ruido));
  const unicos = linhas(serp).find(item => item.startsWith("Tratado por 1 site só"))!;
  assert.match(unicos, /"Destaques de forma estratégica"/);
  assert.match(unicos, /"Promova a interação nos comentários"/);
  assert.match(serp, /^- Seguidores · 2 de 6 sites · ex\.: "Interaja com os seguidores"$/m, "o tema fica; só o cabeçalho de autopromoção sai");
  assert.match(serp, /^- Calendário de publicações · 2 de 6 sites · /m, "o tema fica; só o cabeçalho datado sai");

  /* A régua, para qualquer marca: a marca do domínio, e o núcleo que muda o que é ruído. */
  assert.equal(radarCompetitorBrandOf("www.bagy.com.br"), "bagy");
  assert.equal(radarCompetitorBrandOf("conteudo.stone.com.br"), "stone");
  assert.equal(radarCompetitorBrandOf("vetlinebrasil.com.br"), "vetlinebrasil");
  assert.equal(radarCompetitorBrandOf("abc.com"), null, "nome curto não conta");
  const instagram = { core: [PRINCIPAL, COMPLEMENTAR] };
  assert.equal(radarCompetitorHeadingIsNoise("Transforme seus seguidores em clientes com a Bagy", { ...instagram, domain: "www.bagy.com.br" }), true);
  assert.equal(radarCompetitorHeadingIsNoise("Conheça a Vetline Brasil", { ...instagram, domain: "vetlinebrasil.com.br" }), true, "a marca em duas palavras");
  assert.equal(radarCompetitorHeadingIsNoise("Transforme seus seguidores em clientes", { ...instagram, domain: "www.bagy.com.br" }), false, "sem a marca, é tema");
  assert.equal(radarCompetitorHeadingIsNoise("Como usar a Nuvemshop no Instagram", { core: ["como usar a nuvemshop"], domain: "www.nuvemshop.com.br" }), false, "a marca que é o assunto do artigo fica");
  assert.equal(radarCompetitorHeadingIsNoise("Agora a sua loja virtual", instagram), true);
  assert.equal(radarCompetitorHeadingIsNoise("Qual a importância de ter um catálogo online", instagram), true);
  assert.equal(radarCompetitorHeadingIsNoise("Agora a sua loja virtual", { core: ["como vender pelo instagram"] }), false, "artigo de venda: loja é assunto");
  assert.equal(radarCompetitorHeadingIsNoise("Feriados e datas comemorativas de setembro: calendário do mês", instagram), true);
  assert.equal(radarCompetitorHeadingIsNoise("Promoções de setembro para clínicas", { core: ["promoções para estética"] }), false, "artigo de promoção: data é assunto");
  /* 2026-10-08 (revisão) · "marco" sem acento só é mês com contexto de data; órgão público não tem marca. */
  assert.equal(radarCompetitorHeadingIsNoise("O marco zero do seu perfil no Instagram", instagram), false, "'marco zero' não é março");
  assert.equal(radarCompetitorHeadingIsNoise("Datas de março para postar", instagram), true, "'de março' é mês");
  assert.equal(radarCompetitorHeadingIsNoise("Campanha de março 2026", instagram), true);
  assert.equal(radarCompetitorBrandOf("saude.gov.br"), null, "domínio de órgão não tem marca");
  assert.equal(radarCompetitorBrandOf("www.gov.br"), null);
  assert.equal(radarCompetitorHeadingIsNoise("Saúde bucal na atenção básica", { core: [PRINCIPAL], domain: "saude.gov.br" }), false, "tema legítimo de fonte pública fica");
  for (const legitimo of ["Destaques de forma estratégica", "Promova a interação nos comentários", "Tenha um calendário de publicações", "Interaja com os seguidores"]) {
    assert.equal(radarCompetitorHeadingIsNoise(legitimo, { ...instagram, domain: "www.nextar.com.br" }), false, legitimo);
  }
  /* A palavra solta: só a que nenhuma outra página trata. */
  const soltas = radarCompetitorTopics({ pages: [pagina("a.com.br", ["Carol", "Hashtags"]), pagina("b.com.br", ["Use as hashtags certas"])], core: [PRINCIPAL] });
  assert.equal(soltas.topics.some(item => item.label === "Carol"), false);
  assert.ok(soltas.topics.some(item => /hashtag/i.test(item.label) && item.pages === 2), "\"Hashtags\", que outra página trata, fica");
});

test("C6 · o diferencial vem da página publicada (o que a amostra não trata), nunca da costura do que a maioria já cobre", async () => {
  const { linha } = csvDoCaso(plantaAntiga());
  const cobrir = linha.cobrir_e_superar;
  const diferencial = linhas(cobrir).find(item => item.startsWith("- Diferencial da página publicada: "))!;
  assert.ok(diferencial, cobrir);
  assert.match(diferencial, /"O erro geográfico que quase ninguém fala"/);
  assert.match(diferencial, /Isso fica na atualização, reescrito na voz \(o destino de cada H2 está na coluna artigo\)\.$/);
  assert.doesNotMatch(cobrir, /Costurar/);
  const fonte = semComentarios(await readFile(new URL("../lib/radar/portable-writing-export.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(fonte, /Costurar num mesmo argumento/, "o movimento que costurava o que a maioria já cobre não volta");

  /*
   * Sem a página lida: o tema de uma página só que toca a planta. A seção que o
   * trata no título ou num H3 ("Interação e networking na plataforma") vence a
   * que só o cita no corpo (o "Explicar" da seção 1 fala de interação).
   */
  const plantaDoTema = plantaAntiga();
  plantaDoTema.blueprint.sections[3] = { ...plantaDoTema.blueprint.sections[3], explain: ["Responder mensagens constrói relacionamento e confiança."] };
  const semPagina = csvDoCaso(plantaDoTema, { publicacao: publicacao(null) }).linha.cobrir_e_superar;
  /* 2026-10-08 · P1 · a recorrência dos temas conta sites: "um só site entre as N páginas comparáveis". */
  assert.match(semPagina, /^- Diferencial possível: "Promova a interação nos comentários", tratado por um só site entre as 6 páginas comparáveis — aprofunde na seção "Estratégias práticas para atrair clientes pelo Instagram", sem copiar o cabeçalho do concorrente\.$/m);

  /* Sem página e sem concorrentes lidos: a entrega concreta da planta; sem ela, o movimento não existe. */
  const comEntrega = plantaAntiga();
  comEntrega.blueprint.sections[3] = { ...comEntrega.blueprint.sections[3], practical: "Checklist de cinco itens para revisar o perfil antes de postar." };
  const entrega = csvDoCaso(comEntrega, { publicacao: publicacao(null), entrada: entradaDoCaso({ competitorOutlines: [] }) }).linha.cobrir_e_superar;
  assert.match(entrega, /^- Entrega concreta da planta: Checklist de cinco itens para revisar o perfil antes de postar \(seção "Estratégias práticas para atrair clientes pelo Instagram"\)\.$/m);
  const nada = csvDoCaso(plantaAntiga(), { publicacao: publicacao(null), entrada: entradaDoCaso({ competitorOutlines: [] }) }).linha.cobrir_e_superar;
  assert.doesNotMatch(nada, /Diferencial|Entrega concreta/);
  /* Com diferencial da página, a entrega da planta não vira um segundo movimento. */
  assert.doesNotMatch(csvDoCaso(comEntrega).linha.cobrir_e_superar, /Entrega concreta/);

  /* O H2 publicado que os concorrentes JÁ tratam não é diferencial (hashtags e bio estão em 3 páginas), nem o fecho da página. */
  const comComum = csvDoCaso(plantaAntiga(), { publicacao: publicacao(["Considerações finais", "Hashtags certas e bio atrativa no perfil", ...H2_PUBLICADOS]) }).linha.cobrir_e_superar;
  const linhaDoDiferencial = linhas(comComum).find(item => item.startsWith("- Diferencial da página publicada: "))!;
  assert.doesNotMatch(linhaDoDiferencial, /Hashtags certas e bio atrativa|Considerações finais/);
  assert.match(linhaDoDiferencial, /"O erro geográfico que quase ninguém fala"/);
});

test("C7 · só a pergunta DESTE artigo fica para responder; a do outro tópico do Silo e a de outro foco vão ao \"Não cobrir\"", () => {
  const { linha } = csvDoCaso(plantaAntiga());
  const cobrir = linha.cobrir_e_superar;
  const aResponder = cobrir.slice(cobrir.indexOf("Perguntas a responder"), cobrir.indexOf("Não cobrir:"));
  for (const deste of ["Como prospectar clientes pelo Instagram com tráfego orgânico?", "Como prospectar mais clientes pelo Instagram?", "Como transformar seguidores em clientes no Instagram?", "Devo seguir meus clientes no Instagram?"]) {
    assert.ok(aResponder.includes(`- ${deste}`), deste);
  }
  for (const outro of ["pitch de vendas", "vender muito", "WhatsApp", "pela internet"]) assert.ok(!aResponder.includes(outro), outro);
  const naoCobrir = linhas(cobrir.slice(cobrir.indexOf("Não cobrir:")));
  assert.ok(naoCobrir.includes("- \"Como captar clientes pelo WhatsApp?\": pertence a \"como atrair clientes pelo whatsapp\", outro tópico do Silo; não responder aqui."));
  assert.ok(naoCobrir.includes("- \"Como captar clientes pela internet?\": pertence ao artigo \"como captar um cliente\" do Silo; não responder aqui."));
  /* 2026-10-08 · P1 · título de post ("…? Guia para…") é ruído de pesquisa: sai de todas as listas, sem virar linha do "Não cobrir". */
  assert.equal(cobrir.includes("pitch de vendas"), false, "o título de post sai de todas as listas");
  assert.ok(naoCobrir.includes("- \"O que fazer para vender muito no Instagram?\": outro foco; não trata de \"como atrair clientes pelo instagram\" nem das complementares."));
  assert.ok(naoCobrir.some(item => item.startsWith("- \"Como chamar a atenção no Instagram?\": ")), "o \"não cobrir\" do pacote continua");
  /* A pergunta que a planta já responde não se repete. */
  assert.doesNotMatch(aResponder, /O Instagram realmente serve para atrair clientes\?/);
  /* Com o artigo-modelo, a abertura é a dele: a "pergunta de abertura" que o export escolheria (a de tráfego orgânico) continua na lista. */
  const semPlanta = csvDoCaso(null).linha;
  assert.match(semPlanta.promessa_e_leitor, /^Abertura: responder "Como prospectar clientes pelo Instagram com tráfego orgânico\?" logo no primeiro parágrafo/m);
  assert.ok(aResponder.includes("- Como prospectar clientes pelo Instagram com tráfego orgânico?"));
  /* Sem Silo, a do WhatsApp é outro foco. */
  const semSilo = buildRadarWritingExportArticle(entradaDoCaso(), { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: publicacao(), blueprint: plantaAntiga() }).row.cobrir_e_superar;
  assert.match(semSilo, /^- "Como captar clientes pelo WhatsApp\?": outro foco; não trata de "como atrair clientes pelo instagram" nem das complementares\.$/m);
});

test("C7 (correção da revisão) · a pergunta que É a keyword de outro tópico do Silo vai ao \"Não cobrir\" mesmo dividindo duas raízes; a pergunta que a planta usa como evidência não é proibida", () => {
  /* R4 · "Como atrair clientes pelo WhatsApp?" divide "atrair" e "clientes" com o núcleo — e é o tópico "como atrair clientes pelo whatsapp". */
  const entrada = entradaDoCaso();
  const observado = entrada.googleObserved as unknown as { questions: unknown[] };
  observado.questions = [...observado.questions, pergunta("Como atrair clientes pelo WhatsApp?", 2), pergunta("Como captar clientes pelo Instagram?", 2)];
  const cobrir = csvDoCaso(plantaAntiga(), { entrada }).linha.cobrir_e_superar;
  const aResponder = cobrir.slice(cobrir.indexOf("Perguntas a responder"), cobrir.indexOf("Não cobrir:"));
  assert.doesNotMatch(aResponder, /pelo WhatsApp/);
  assert.ok(linhas(cobrir).includes("- \"Como atrair clientes pelo WhatsApp?\": pertence a \"como atrair clientes pelo whatsapp\", outro tópico do Silo; não responder aqui."), cobrir);
  /* A pergunta com uma palavra do artigo fora do destino ("instagram" não está em "como captar um cliente") continua deste artigo. */
  assert.ok(aResponder.includes("- Como captar clientes pelo Instagram?"), aResponder);

  /* completude · a seção 5 da planta real se apoia na lacuna G1 "Como captar clientes pela internet?": ela não pode ir ao "Não cobrir". */
  const planta = plantaAntiga();
  planta.blueprint.sections[4].evidence = ["G1", "O1"];
  planta.evidence = [...planta.evidence, { id: "G1", kind: "lacuna", text: "Como captar clientes pela internet? (1 de 6 páginas cobrem)" }, { id: "O1", kind: "oportunidade", text: "Revisar perguntas relacionadas como evidência editorial." }];
  const linha = csvDoCaso(planta).linha;
  assert.match(linha.estrutura, /^- Evidências: G1 \(Como captar clientes pela internet\? \(1 de 6 páginas cobrem\)\)/m);
  assert.doesNotMatch(linha.cobrir_e_superar, /Como captar clientes pela internet/, "nem a responder de novo, nem proibida: a planta já a responde na seção 5");
});

test("C8 · sem material próprio da marca: sem relato, sem inventar, sem marcador — na regra geral e no \"Como superar\"", () => {
  const { linha, topo } = csvDoCaso(plantaAntiga());
  assert.match(topo.prompt, /^4\. Não invente fatos, números, estudos, preços, produtos, autores, credenciais, depoimentos nem URLs; onde faltar experiência própria da marca, escreva sem relato e sem inventá-lo, sem marcador no texto\.$/m);
  assert.match(linha.cobrir_e_superar, /^- Experiência: nenhuma das \d+ páginas traz relato de prática\. Não há material próprio da marca neste arquivo: escreva sem relato e sem inventá-lo; nenhum marcador vai ao texto\.$/m);
});

test("C9 · destino planejado: instrução concluída e condicional, nunca endereço publicado nem link quebrado", () => {
  const { linha } = csvDoCaso(plantaAntiga());
  const links = linhas(linha.links_internos);
  assert.equal(links[0], "Aplique somente estes 6 link(s), com a âncora indicada (pode ajustar concordância):");
  assert.equal(links[1], "Destino planejado (ainda não publicado): o link entra com a URL final quando o destino estiver no ar junto com este artigo ou antes; se este artigo for ao ar primeiro, a âncora fica como texto simples, sem link (nunca link quebrado). O caminho planejado não é endereço publicado: não invente domínio nem URL.");
  assert.equal(links.filter(item => /^L\d · .*\(planejado/.test(item)).length, 5, "5 planejados");
  assert.ok(links.some(item => /^L6 · âncora "SEO para clínicas" → .* → https:\/\/adalbapro\.com\.br\/servicos\/seo-para-clinicas \(publicado\)/.test(item)), "1 publicado");
  assert.match(linha.links_internos, /→ Pilar "leads qualificados" → \/leads-sem-trafego-pago\/qualificados \(planejado: caminho do Silo/);
  assert.doesNotMatch(linha.links_internos, /use o caminho|marque a âncora|não resolvido: marque/);
  /* Sem artigo-modelo, a mesma regra no destino do Silo. */
  const saude = radarPortableWritingExport({ articles: montadasDoSiloSaude(), lenses: LEITURA_DAS_LENTES, plan: planoDoSilo(), today: EXPORTADO_EM }).files![0].csv;
  assert.match(saude, /\(destino ainda não publicado: o link entra com a URL final quando o destino estiver no ar junto com este artigo ou antes; senão, a âncora fica como texto simples; não invente URL\)/);
  assert.doesNotMatch(saude, /use o slug planejado|marque a âncora/);
  /* Sem planejado, a regra não aparece. */
  const soPublicado = plantaAntiga();
  soPublicado.blueprint.sections = soPublicado.blueprint.sections.map(item => ({ ...item, internalLinks: item.internalLinks.filter(link => link.candidate === "K6") }));
  assert.doesNotMatch(radarArticleBlueprintColumns(soPublicado).links_internos, /Destino planejado/);
  /* Sem a URL publicada (sem prefixo), o planejado diz o estado; o destino sem endereço fica como texto simples. */
  const semPrefixo = plantaAntiga();
  semPrefixo.linkCandidates = semPrefixo.linkCandidates.map(item => (item.id === "K3" ? { ...item, status: "UNRESOLVED" as const, destination: null } : item));
  const colunaSemPrefixo = linhas(radarArticleBlueprintColumns(semPrefixo).links_internos);
  assert.ok(colunaSemPrefixo.some(item => item.startsWith("L1 · âncora \"tráfego pago vs orgânico\" → Suporte \"tráfego pago vs orgânico para clínica de estética\" → /trafego-pago-vs-organico-para-clinica-de-estetica (planejado, ainda não publicado) · ")));
  assert.ok(colunaSemPrefixo.some(item => item.startsWith("L3 · âncora \"como atrair um cliente\" → Suporte \"como atrair um cliente\" (sem endereço no pacote: a âncora fica como texto simples, sem link) · ")));
});

test("D10 no resto do arquivo: o parecer ainda não aceito e o Silo em formação são ditos sem espera aberta", () => {
  /* O parecer ainda não aceito fica fora do texto — regra cumprida, sem "aguardando aceite" (como o CSV de vídeo). */
  const semAceito = buildRadarWritingExportArticle({ ...entradaDoCaso(), specialistContext: { state: "RECEIVED", note: "", items: [], pending: 2, rejected: 0 } as never }, { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null }).row;
  assert.match(semAceito.fontes_e_especialista, /^Especialista: sem contribuição aceita; 2 parecer\(es\) ainda não aceito\(s\) no Radar ficam fora deste texto\.$/m);
  assert.doesNotMatch(semAceito.fontes_e_especialista, /aguardando/);
  /* O Silo ainda em formação no Arquiteto: dito sem "rascunho", no topo e na linha do artigo. */
  const emFormacao = { ...SILO, draft: true };
  const artigo = buildRadarWritingExportArticle(entradaDoCaso(), { topRowLabel: "Marca", filePosition: 1, silo: emFormacao, articleId: ARTIGO, publication: publicacao(), blueprint: plantaAntiga(), siloInline: true });
  assert.match(artigo.row.artigo, /^Silo: Leads sem Tráfego Pago \(em formação no Arquiteto: a composição pode mudar\)$/m);
  const topo = buildRadarWritingTopRow({ label: "Silo", silo: emFormacao, articles: [artigo], siteUrl: URL_PUBLICADA, brandVoice: VOZ_EM_RASCUNHO, authorsKnown: true });
  assert.match(topo.pode_escrever, /- o Silo está em formação no Arquiteto: a composição pode mudar\./);
  for (const proibida of D10_PROIBIDAS) assert.doesNotMatch(doExport(`${tudo(artigo.row)}\n${tudo(topo)}`), proibida, String(proibida));
});

test("C4 · a afirmação que o MERCADO repete sem fonte trava a frase da planta que a reproduz, mesmo sem sentido detectado", async () => {
  const { entradaGoogleSaude } = await import("./radar-portable-writing-fixtures.mts");
  const planta = plantaAntiga();
  planta.blueprint.sections[0] = { ...planta.blueprint.sections[0], explain: ["A acne tem causa hormonal e pede avaliação de quem atende."] };
  const row = buildRadarWritingExportArticle(entradaGoogleSaude(), { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null, blueprint: planta }).row;
  assert.ok(linhas(row.estrutura).includes("- Explicar: A acne tem causa hormonal e pede avaliação de quem atende (precisa de fonte: o mercado repete sem fonte)."), row.estrutura);
  /* Sem as afirmações do pacote, só o detector por sentido: a mesma frase passa. */
  assert.ok(linhas(radarArticleBlueprintColumns(planta).estrutura).includes("- Explicar: A acne tem causa hormonal e pede avaliação de quem atende."));
});

test("o artigo-modelo com links internos não deixa o artigo \"isolado do Silo\" no veredito", () => {
  const { artigo } = csvDoCaso(plantaAntiga());
  assert.doesNotMatch(artigo.row.pode_escrever, /sem links internos no pacote/);
  const semPlanta = csvDoCaso(null);
  assert.match(semPlanta.artigo.row.pode_escrever, /sem links internos no pacote/, "sem planta e sem plano, a falta continua dita");
});

/* ============================== o artigo-modelo NOVO, com o mapa ============================== */

test("CSV para escrever, artigo-modelo NOVO com publishedMap: o mapa decide (absorve, sai com motivo, fecho, omitido fica) e o arquivo segue sem D10", () => {
  const { linha, csv } = csvDoCaso(plantaNova(), { publicacao: publicacao([...H2_PUBLICADOS, "Conclusão", "Perguntas frequentes"]) });
  for (const proibida of D10_PROIBIDAS) assert.doesNotMatch(doExport(csv), proibida, String(proibida));
  const artigo = linhas(linha.artigo);
  assert.ok(artigo.includes(`- "${H2_PUBLICADOS[0].slice(0, 79).trimEnd()}…" → vira a seção 2 ("Instagram não traz pacientes: por que isso acontece?"), reescrito na voz — a tese da página vira o diagnóstico da seção 2`), linha.artigo);
  assert.ok(artigo.includes(`- "${H2_PUBLICADOS[2]}" → vira a seção 5 ("O que fazer quando o Instagram não é suficiente"), reescrito na voz — o diferencial da página entra na busca local`));
  assert.ok(artigo.includes(`- "${H2_PUBLICADOS[3]}" → sai: repete o diagnóstico da seção 2 sem entrega nova (decisão no artigo-modelo)`));
  assert.ok(artigo.includes(`- "${H2_PUBLICADOS[5]}" → sai: oferta comercial fora do escopo deste artigo (decisão no artigo-modelo)`));
  assert.ok(artigo.includes(`- "${H2_PUBLICADOS[8]}" → fica como seção própria, reescrita na voz, depois da seção 4 ("Estratégias práticas para atrair clientes pelo Instagram")`), "o H2 omitido no mapa fica (nada sai sem decisão)");
  assert.ok(artigo.includes("- \"Conclusão\" → vai para o fechamento da planta, reescrito na voz"));
  assert.ok(artigo.includes("- \"Perguntas frequentes\" → FAQ legado: segue a regra do FAQ legado, abaixo"));

  const estrutura = linha.estrutura;
  const secao2 = estrutura.slice(estrutura.indexOf("## Instagram não traz pacientes: por que isso acontece?"), estrutura.indexOf("## Como usar o Instagram"));
  assert.match(secao2, /^- Da página publicada, entra aqui \(reescrito na voz\): "Instagram não traz pacientes quando[^"]*"; "O guru vende frequência\. A clínica paga com cansaço"; "Quando o Instagram vira uma muleta cara"$/m);
  const secao4 = estrutura.slice(estrutura.indexOf("## Estratégias práticas"), estrutura.indexOf("## O que fazer quando"));
  assert.match(secao4, /^- Depois desta seção, a página publicada continua com "O jogo maduro é construir captação própria": seção própria, reescrita na voz\.$/m);
  assert.match(estrutura, /^Sai da página publicada \(decisão registrada no artigo-modelo\): "Posts para Instagram estética não corrigem uma base fraca" \(repete o diagnóstico da seção 2 sem entrega nova\); "A clínica não precisa de mais uma agência fazendo peça solta" \(oferta comercial fora do escopo deste artigo\)\.$/m);
  assert.match(estrutura, /^Da página publicada, entra no fechamento \(reescrito na voz\): "Conclusão"\.$/m);
  assert.doesNotMatch(estrutura, /^Logo depois da abertura/m, "com o mapa, nada fica solto antes da 1ª seção");

  /* O que a planta decidiu tirar não é diferencial da página — nem quando abre a página. */
  const diferencial = linhas(linha.cobrir_e_superar).find(item => item.startsWith("- Diferencial da página publicada: "))!;
  assert.ok(diferencial);
  assert.doesNotMatch(diferencial, /Posts para Instagram estética|mais uma agência|Conclusão/);
  const primeiroOsQueSaem = [H2_PUBLICADOS[5], H2_PUBLICADOS[3], ...H2_PUBLICADOS.filter((_, indice) => indice !== 5 && indice !== 3)];
  const comOsQueSaemPrimeiro = linhas(csvDoCaso(plantaNova(), { publicacao: publicacao(primeiroOsQueSaem) }).linha.cobrir_e_superar).find(item => item.startsWith("- Diferencial da página publicada: "))!;
  assert.doesNotMatch(comOsQueSaemPrimeiro, /Posts para Instagram estética|mais uma agência/);
  assert.match(comOsQueSaemPrimeiro, /"O erro geográfico que quase ninguém fala"/);
});

test("artigo-modelo NOVO sem a leitura de agora: o mapa sai da página que a IA viu, dito como tal", () => {
  const { linha } = csvDoCaso(plantaNova(), { publicacao: publicacao(null) });
  assert.ok(linhas(linha.artigo).includes("Estrutura publicada atual (lida ao montar o artigo-modelo): H1 \"Instagram não traz pacientes? Talvez sua clínica esteja jogando o jogo errado\"; 10 H2."));
  assert.match(linha.artigo, /→ sai: repete o diagnóstico da seção 2 sem entrega nova \(decisão no artigo-modelo\)/);
  assert.match(linha.estrutura, /^Sai da página publicada \(decisão registrada no artigo-modelo\): /m);
});

test("sem artigo-modelo, a atualização é a regra concluída (nada sai sem decisão), sem pendência", () => {
  const { linha } = csvDoCaso(null);
  const artigo = linhas(linha.artigo);
  assert.ok(artigo.some(item => item.startsWith("Estrutura publicada atual (lida da página na exportação): H1 ") && item.includes("10 H2: \"Instagram não traz pacientes quando")));
  assert.ok(artigo.includes("Atualização: o que a página já cobre fica no texto, reescrito na voz e reordenado se preciso; a seção publicada que a estrutura sugerida não tem fica como seção própria. Nada sai da página sem decisão humana registrada."));
  for (const proibida of D10_PROIBIDAS) assert.doesNotMatch(doExport(tudo(linha)), proibida, String(proibida));
});

/* ============================== 2026-10-08 · correções da revisão ============================== */

test("a trava vale para o texto mais visível: H1, alternativas, SEO title, meta, próximo passo, ALT e legenda; o próximo passo REAL e a tese passam", () => {
  const planta = plantaAntiga();
  planta.blueprint.title = {
    h1: "O Instagram enche a agenda da clínica",
    alternatives: ["Stories geram agendamentos todos os dias", "Instagram não traz pacientes? Entenda o que fazer"],
    seoTitle: "Um bom perfil transforma seguidores em pacientes",
    metaDescription: "Um site otimizado converte visitantes em agendamentos.",
  };
  planta.blueprint.closing = { ...planta.blueprint.closing, nextStep: "Um site otimizado converte visitantes em agendamentos." };
  planta.blueprint.visual = planta.blueprint.visual.map(item => item.slot === "R3" ? { ...item, caption: "A presença no Google capta pacientes com intenção de busca.", alt: "Clínica no mapa" }
    : item.slot === "R1" ? { ...item, alt: "Stories geram agendamentos para a clínica" } : item);
  const colunas = radarArticleBlueprintColumns(planta);
  const titulo = linhas(colunas.titulo_e_seo);
  assert.ok(titulo.includes("H1: O Instagram enche a agenda da clínica (precisa de fonte: afirmação sobre conversão do público)"), colunas.titulo_e_seo);
  assert.ok(titulo.includes("Alternativas: Stories geram agendamentos todos os dias (precisa de fonte: afirmação sobre conversão do público) · Instagram não traz pacientes? Entenda o que fazer"));
  assert.ok(titulo.includes("SEO title: Um bom perfil transforma seguidores em pacientes (precisa de fonte: afirmação sobre conversão do público)"));
  assert.ok(titulo.includes("Meta description: Um site otimizado converte visitantes em agendamentos (precisa de fonte: afirmação sobre conversão do público)."));
  assert.match(colunas.estrutura, /^Próximo passo: Um site otimizado converte visitantes em agendamentos \(precisa de fonte: afirmação sobre conversão do público\)\.$/m);
  assert.match(colunas.plano_visual, /^ {2}Legenda: A presença no Google capta pacientes com intenção de busca \(precisa de fonte: afirmação sobre conversão do público\)\.$/m);
  assert.match(colunas.plano_visual, /^ {2}ALT: Clínica no mapa$/m);
  assert.match(colunas.plano_visual, /^ {2}ALT: Stories geram agendamentos para a clínica \(precisa de fonte: afirmação sobre conversão do público\)$/m);
  const lista = linhas(colunas.estrutura).find(item => item.startsWith("Afirmações que só entram com fonte do pacote ou delimitadas"))!;
  for (const trecho of ["O Instagram enche a agenda da clínica", "Stories geram agendamentos todos os dias", "Um bom perfil transforma seguidores em pacientes", "A presença no Google capta pacientes com intenção de busca"]) assert.ok(lista.includes(trecho), trecho);
  /* O próximo passo REAL do artigo-modelo de 08/10 é orientação (imperativo, oração temporal): passa, como o H1 real (a tese). */
  const real = plantaAntiga();
  real.blueprint.closing = { ...real.blueprint.closing, nextStep: "Acesse a página de SEO para clínicas e descubra como aparecer no Google quando o paciente procura." };
  const colunasReais = radarArticleBlueprintColumns(real);
  assert.match(colunasReais.estrutura, /^Próximo passo: Acesse a página de SEO para clínicas e descubra como aparecer no Google quando o paciente procura\.$/m);
  assert.ok(linhas(colunasReais.titulo_e_seo).includes("H1: Como atrair clientes pelo Instagram (sem cair na ilusão de que ele enche a agenda)"));
});

test("o export protege a planta ANTIGA: ordem de leitura da busca \"como …\", cena repetida e ângulo só com evidência que o sustenta — tudo concluído", () => {
  const { linha, csv } = csvDoCaso(plantaAntiga());
  /* B2 · a busca "como …" com a 1ª seção pelo diagnóstico: o primeiro parágrafo responde o caminho prático. */
  assert.ok(linhas(linha.estrutura).includes("- Ordem de leitura: a busca é \"como atrair clientes pelo instagram\" — o primeiro parágrafo já responde o caminho prático em uma ou duas frases, apontando para \"Como usar o Instagram para atrair clientes de forma estratégica\"; a pergunta acima e o diagnóstico (\"O que o Instagram faz bem (e o que ele não faz)\") entram como contexto, sem negar o assunto do artigo."), linha.estrutura);
  /* B5 · capa e Respiro 2 com a mesma cena (profissional com celular). */
  assert.ok(linhas(linha.plano_visual).includes("Cena repetida: Capa e Respiro 2 mostram profissional com celular — ao gerar Respiro 2, troque o sujeito ou o objeto da cena."), linha.plano_visual);
  /* B6 · o ângulo citava o resultado orgânico S1, que não sustenta diferencial. */
  assert.ok(linhas(linha.promessa_e_leitor).includes("Ângulo: O Instagram é uma vitrine, não um funil de vendas: ele gera atenção, mas a conversão em pacientes exige estratégia e presença orgânica complementar."), linha.promessa_e_leitor);
  assert.doesNotMatch(linha.promessa_e_leitor, /Ângulo: [^\n]*\[S1/);
  for (const proibida of D10_PROIBIDAS) assert.doesNotMatch(doExport(csv), proibida, String(proibida));

  /* A planta que já segue as regras não ganha linha nenhuma; a evidência G/D/O do ângulo continua citada. */
  const nova = plantaAntiga();
  nova.blueprint.sections = [nova.blueprint.sections[2], nova.blueprint.sections[0], ...nova.blueprint.sections.slice(3)];
  nova.blueprint.opening = { ...nova.blueprint.opening, readerQuestion: "Como atrair clientes pelo Instagram?" };
  nova.blueprint.visual = nova.blueprint.visual.filter(item => item.slot !== "R2");
  nova.blueprint.angle = { ...nova.blueprint.angle, evidence: ["S1", "G1"] };
  nova.evidence = [...nova.evidence, { id: "G1", kind: "lacuna", text: "Checklist de diagnóstico do perfil (nenhuma página cobre)" }];
  const colunas = radarArticleBlueprintColumns(nova, null, null, null, { principal: PRINCIPAL });
  assert.doesNotMatch(colunas.estrutura, /Ordem de leitura/);
  assert.doesNotMatch(colunas.plano_visual, /Cena repetida/);
  assert.match(colunas.promessa_e_leitor, /^Ângulo: [^\n]*\[G1 \(Checklist de diagnóstico do perfil/m);
  assert.doesNotMatch(colunas.promessa_e_leitor, /\[S1|; S1/);
  /* Só a pergunta da abertura pelo diagnóstico ("Por que …") já pede a ordem de leitura, com a 1ª seção prática. */
  const soAbertura = radarArticleBlueprintColumns({ ...nova, blueprint: { ...nova.blueprint, opening: { ...nova.blueprint.opening, readerQuestion: "Por que eu posto todos os dias e não tenho pacientes?" } } }, null, null, null, { principal: PRINCIPAL });
  assert.match(soAbertura.estrutura, /^- Ordem de leitura: a busca é "como atrair clientes pelo instagram" — /m);
  /* Busca que não é "como …": a ordem de leitura não se aplica. */
  assert.doesNotMatch(radarArticleBlueprintColumns(plantaAntiga(), null, null, null, { principal: "instagram não traz pacientes" }).estrutura, /Ordem de leitura/);
});

/*
 * 2026-10-08 (correção da revisão) · as esperas ANTIGAS também saem concluídas
 * ("a definir", "conferir antes"): o silo de saúde é o caso que as trazia —
 * especialista que responde outra coisa e sem ponto de aplicação, SEO title e
 * meta sem texto, fontes citadas pelo mercado sem verificação.
 */
test("D10 nas esperas antigas: o CSV do silo de saúde inteiro sai sem \"a definir\" nem \"conferir antes\"", () => {
  const { files } = radarPortableWritingExport({ articles: montadasDoSiloSaude(), lenses: LEITURA_DAS_LENTES, plan: planoDoSilo(), today: EXPORTADO_EM });
  const csv = files![0].csv;
  assert.match(csv, /Aplicar em: onde couber no texto, como orientação/);
  assert.match(csv, /SEO title: escreva com cerca de 60 caracteres/);
  assert.match(csv, /Citadas pelo mercado, sem verificação no pacote \(só como referência delimitada, nunca como fonte da afirmação\):/);
  for (const proibida of D10_PROIBIDAS) assert.doesNotMatch(doExport(csv), proibida, String(proibida));
});

/*
 * 2026-10-08 (correção da revisão) · O TEXTO DA SKILL É DA MARCA. A Skill real do
 * dono manda "registrar a pendência fora do texto publicável" e fala em
 * "preencher" — e o CSV a transcreve como veio (a plataforma não reescreve a
 * voz da marca). A varredura D10 é do texto que a PLATAFORMA escreve: o
 * trecho transcrito da Skill fica de fora dela, e este caso prova a isenção
 * com trechos iguais aos da Skill real (inventados a partir do extrato). Se o
 * dono quiser o arquivo inteiro sem essas palavras, a mudança é na Skill, na
 * Marca (registrado no estado do Radar).
 */
test("D10 × Skill real: o texto da Skill viaja transcrito, sem mudança; fora dele, o arquivo inteiro sai sem as palavras do D10", () => {
  const corpos = [
    "Se não houver verificação suficiente, omitir a instrução operacional ou registrar a pendência fora do texto publicável.",
    "Identificar o autor real antes da publicação; não criar um revisor apenas para preencher campo.",
    "Se o fechamento indicar outro artigo, esse destino deve aparecer no plano de links. Destinos não resolvidos ficam nas pendências, nunca como link quebrado no texto final.",
    "Separar fontes e pendências editoriais do texto destinado ao público.\n- Não ficaram marcadores internos ou relatos por preencher no texto publicável?",
    "Use este documento. Separe texto publicável de pendências.",
  ];
  const titulos = ["4. Fontes e verificação", "5. Autoria", "6. Links internos", "7. Revisão final", "8. Instrução curta"];
  const vozReal: RadarBrandVoice = {
    ...VOZ,
    sections: [...VOZ.sections, ...corpos.map((body, indice) => ({ heading: titulos[indice], body }))],
    markdown: [VOZ.markdown, ...corpos.map((body, indice) => `## ${titulos[indice]}\n\n${body}`)].join("\n\n"),
  };
  const estado: RadarBrandVoiceState = { kind: "available", voice: vozReal };
  const { artigo } = csvDoCaso(plantaAntiga());
  const topo = buildRadarWritingTopRow({ label: "Silo", silo: SILO, articles: [artigo], siteUrl: URL_PUBLICADA, brandVoice: estado, authorsKnown: true });
  const csv = radarWritingExportCsv([topo, buildRadarWritingBrandVoiceRow(estado)!, artigo.row]);
  /* A Skill viaja inteira, como a Marca a escreveu (o CSV dobra as aspas, e estes trechos não têm aspas). */
  const transcrita = corpos.flatMap(corpo => corpo.split("\n")).map(linha => linha.trim()).filter(Boolean);
  for (const linha of transcrita) assert.ok(csv.includes(linha), `a Skill não foi transcrita como veio: ${linha}`);
  /* Fora do trecho transcrito, nada do D10 — a isenção é explícita e só dela. */
  const semASkill = transcrita.reduce((texto, linha) => texto.split(linha).join("«trecho da Skill»"), doExport(csv));
  for (const proibida of D10_PROIBIDAS) assert.doesNotMatch(semASkill, proibida, String(proibida));
});

test("PROVIDER_CALLS = 0 e AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
