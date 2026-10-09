import assert from "node:assert/strict";
import test from "node:test";
import {
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarArticleBlueprintAttributedResult,
  radarArticleBlueprintBuyerGuideMarks,
  radarArticleBlueprintColumns,
  radarArticleBlueprintCtaLink,
  radarArticleBlueprintH3WithoutRepeatedH2,
  radarArticleBlueprintOverlappingSections,
  radarArticleBlueprintPendingNotes,
  radarArticleBlueprintPracticalWithoutResult,
  radarArticleBlueprintPrompt,
  radarArticleBlueprintPromiseWithoutFrame,
  radarArticleBlueprintPseudoClaim,
  radarArticleBlueprintReaderBusiness,
  radarArticleBlueprintSecondAudience,
  radarArticleBlueprintWithoutSecondAudience,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintBrief,
  type RadarArticleBlueprintLinkCandidate,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import { radarBrandVoiceExclusions, type RadarBrandVoice } from "../lib/radar/brand-voice.ts";
import type { RadarPendingClaim } from "../lib/radar/pending-claims.ts";
import { ARTIGO, entradaGoogle, planoDoSilo } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== 2026-10-09 · O ARTIGO-MODELO DEPOIS DA COERÊNCIA DOS 8 CSVs "PARA ESCREVER" =====
 *
 * Os textos abaixo são copiados dos CSVs reais de 09/10 (Silo "Leads sem
 * Tráfego Pago": leads qualificados, captação de pacientes, Instagram e
 * promoções). Para cada defeito, a regra no pedido (planta nova) E a correção
 * determinística na conferência e nas colunas (planta antiga já aprovada):
 *
 *   - 5 · as exclusões da Skill de voz entram no "fora do escopo" do pacote;
 *   - 8 · pseudo-afirmação (rótulo de tema) sai da planta e da lista "só com fonte";
 *   - 9 · demonstração com resultado atribuído vira exemplo ilustrativo;
 *   - 10 · o CTA que cita a página comercial ganha o link dela; a continuação
 *     deixa o fechamento (menção opcional no corpo, nunca segunda chamada);
 *   - 11 · H3 igual ao H2 de outra seção sai; H2 sobrepostos viram nota;
 *   - 12 · a moldura "Cobrir com clareza o tema …" não é promessa; um leitor só.
 *
 * PROVIDER_CALLS = 0: sem IA, sem banco, sem rede.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const D10 = /pend[eê]ncia|pendente de|aguardando aprova|confira antes de aprovar|rascunho|fonte a obter|preencher/i;
const linhas = (texto: string) => texto.split("\n");

/* ============================== a voz da marca (Skill "AdalbaPro" v1, trechos do CSV real) ============================== */

const SITE = "https://adalbapro.com.br";
const PAGINA_COMERCIAL = `${SITE}/servicos/seo-para-clinicas`;
const RECURSOS_INADEQUADOS = [
  "Não recomendar Instagram Shopping, ativação de loja ou tutoriais de configuração desse recurso nos artigos deste projeto. Essa é uma exclusão editorial determinada pelo proprietário, não uma afirmação de encerramento universal do produto.",
  "Não transportar conselhos de lojas virtuais para consultórios automaticamente. Venda de produto e agendamento de atendimento são objetivos diferentes.",
  "Não recomendar funcionalidades apenas porque apareceram em um concorrente. Verificar disponibilidade atual, país, tipo de conta e pertinência ao objetivo. Se não houver verificação suficiente, omitir a instrução operacional ou registrar a pendência fora do texto publicável.",
  "Não afirmar que toda clínica está proibida de anunciar no Google ou que a Meta não oferece segmentação local. Quando houver impedimento específico, descrever serviço, condição e fonte.",
].join("\n\n");

function vozDaMarca(): RadarBrandVoice {
  const sections = [
    { heading: "Identidade e oferta", body: `- Marca: AdalbaPro. Site: ${SITE}/.\n- Oferta: desenvolvimento ou melhoria do site, páginas de serviços, informações locais consistentes com o Perfil da Empresa no Google.` },
    { heading: "Recursos antigos ou inadequados", body: RECURSOS_INADEQUADOS },
    { heading: "Plano visual", body: "Evitar texto sobreposto desnecessário, rostos artificiais, repetição de profissional frustrada com celular em todas as imagens, logotipos de terceiros, números fictícios, dashboards falsos, antes e depois e promessas clínicas." },
    { heading: "Vocabulário e estilo", body: "- Evitar \"ecossistema\", \"sinergia\", \"alavancar\", \"motor de vendas\", \"revolucionário\" e outras expressões que não expliquem uma entrega.\n- Evitar chamadas artificiais como \"Veja no vídeo como funciona\" e \"continue lendo para descobrir\"." },
    { heading: "Evitar", body: "Evitar: \"Sua clínica está invisível e vai morrer se não agir agora.\"\n\nNão chamar a leitora de cega, ignorante, incapaz ou preguiçosa." },
    { heading: "Links e conteúdo já publicado", body: `Página comercial de referência: ${PAGINA_COMERCIAL}. Usar quando pertinente e previsto no plano aprovado, sem obrigar todos os artigos a terminar com a mesma chamada.` },
  ];
  return {
    versionId: "voz-v1", version: 1, name: "AdalbaPro", contentHash: "hash-voz", status: "active", title: "AdalbaPro",
    sections, markdown: sections.map(secao => `## ${secao.heading}\n${secao.body}`).join("\n\n"),
  };
}

/* ============================== os pacotes (à imagem dos CSVs reais) ============================== */

const esqueleto = (id: string, heading: string) => ({
  id, level: 2 as const, parent: null, heading, readerQuestion: null, cover: [], mustCover: false, needsSource: false, needsSpecialist: false, outOfScope: false,
});

const candidato = (id: string, label: string, role: string, destination: string | null, status: RadarArticleBlueprintLinkCandidate["status"]): RadarArticleBlueprintLinkCandidate =>
  ({ id, label, role, destination, status, fromGraph: false });

const CANDIDATOS_DO_SILO: RadarArticleBlueprintLinkCandidate[] = [
  candidato("K1", "como atrair um cliente", "Suporte", "/como-atrair-um-cliente", "PLANNED"),
  candidato("K2", "captação de pacientes sem tráfego pago", "Suporte", `${SITE}/leads-sem-trafego-pago/captacao-de-pacientes-sem-trafego-pago`, "PUBLISHED"),
  candidato("K3", "como captar um cliente", "Suporte", "/como-captar-um-cliente", "PLANNED"),
  candidato("K4", "tráfego pago vs orgânico para clínica de estética", "Suporte", `${SITE}/leads-sem-trafego-pago/trafego-pago-vs-organico-para-clinica-de-estetica`, "PUBLISHED"),
  candidato("K5", "leads qualificados", "Pilar", "/qualificados", "PLANNED"),
  candidato("K6", "Página da marca /servicos/seo-para-clinicas", "Página da marca (Skill de voz)", PAGINA_COMERCIAL, "PUBLISHED"),
];

function pacote(patch: Partial<RadarArticleBlueprintBrief> & { principal?: string; complementary?: string[] } = {}): RadarArticleBlueprintBrief {
  const { principal = "como atrair clientes pelo instagram", complementary = ["instagram não traz pacientes"], ...resto } = patch;
  return {
    article: {
      principal,
      complementary: complementary.map(keyword => ({ keyword, role: "secundária", volume: 30 })),
      subject: null, intent: "Informacional", funnel: "Topo", siloRole: "Suporte",
      audience: null, promise: null, slug: null, publishedUrl: null,
      mustCover: [], unit: { type: "article", label: "Artigo", format: null },
    },
    silo: null,
    skeleton: [esqueleto("M2", "Bio atrativa"), esqueleto("M4", "Conteúdos relevantes"), esqueleto("M12", "Mídia paga"), esqueleto("M3", "Hashtags certas")],
    skeletonFrame: { workingTitle: null, promise: null, closing: null },
    evidence: [
      { id: "C1", kind: "conceito da amostra", text: "Faça parcerias com influenciadores (4 de 6 páginas)" },
      { id: "C2", kind: "conceito da amostra", text: "Crie uma bio atrativa (3 de 6 páginas)" },
      { id: "C3", kind: "conceito da amostra", text: "Stories para atrair clientes (2 de 6 páginas)" },
      { id: "P1", kind: "pergunta da amostra", text: "Quem tem 1.000 seguidores no Instagram ganha dinheiro?" },
      { id: "G1", kind: "lacuna", text: "Como captar clientes pela internet? (1 de 6 páginas cobrem)" },
    ],
    linkCandidates: CANDIDATOS_DO_SILO,
    graphLinks: [], sources: [], unsupportedClaims: [], specialist: [], videos: [],
    outOfScope: [], competitorTitles: [],
    measures: { comparablePages: 6, words: { median: 2869, p25: 2141, p75: 4228 }, h2: 16, h3: 8, paragraphs: 73, images: 24, lists: 3 },
    authors: [],
    brandVoice: null,
    ...resto,
  };
}

type Secao = Record<string, unknown>;
const secao = (h2: string, extra: Secao = {}): Secao => ({
  h2, readerQuestion: `${h2}?`, answerFirst: "Responda a pergunta da seção em uma frase.", from: ["M2"], h3: [], explain: [], paragraphs: 3, bold: [], terms: [],
  evidence: ["C2"], internalLinks: [], externalLinks: [], ...extra,
});

const VISUAL = [
  { slot: "CAPA", prompt: "consultório organizado com agenda de papel, sem texto legível, 16:9" },
  { slot: "R1", prompt: "recepção de clínica com balcão vazio, sem pessoas, 4:3" },
  { slot: "R2", prompt: "mapa ilustrado de um bairro com pinos genéricos, em SVG, 4:3" },
];

function resposta(sections: Secao[], patch: Secao = {}): Secao {
  return {
    keywordPlan: { reading: "A principal no H1 e na abertura." },
    reader: "Profissional de clínica de estética ou saúde que já investe tempo e energia no Instagram, mas não vê retorno em agendamentos.",
    promise: "Ao final, o leitor sabe o que ajustar no perfil para atrair clientes da região.",
    angle: { statement: "Um checklist de diagnóstico do perfil, com exemplo comentado.", evidence: ["G1"] },
    title: { h1: "Como atrair clientes pelo Instagram sem cair no jogo de influencer", seoTitle: "Como atrair clientes pelo Instagram sem ilusões", metaDescription: "O que ajustar no perfil para atrair clientes da região." },
    opening: { readerQuestion: "Como atrair clientes pelo Instagram de forma eficaz, sem cair nas armadilhas comuns?", direction: "Responder direto.", evidence: ["P1"] },
    sections,
    closing: { turn: "O Instagram pode ser um aliado, mas não é a solução completa.", cta: "Fale com a AdalbaPro.", nextStep: null },
    visual: VISUAL,
    eeat: ["Autor: Adalberto Escalante, especialista da marca AdalbaPro."],
    warnings: [],
    ...patch,
  };
}

const organizar = (ia: Secao, brief: RadarArticleBlueprintBrief = pacote(), opcoes: { close?: boolean } = {}) =>
  radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(ia), brief, opcoes);

/* A planta ANTIGA, como o banco a guarda: a conferência de antes não mexia nas seções. */
function plantaAntiga(ia: Secao, brief: RadarArticleBlueprintBrief = pacote()): RadarArticleBlueprintPayload {
  const { payload } = organizar(ia, brief);
  const bruta = RadarArticleBlueprintAiSchema.parse(ia);
  const antiga: RadarArticleBlueprintPayload = {
    ...payload,
    blueprint: { ...payload.blueprint, promise: bruta.promise, reader: bruta.reader, closing: bruta.closing, sections: bruta.sections.map(item => ({ ...item, image: null })) },
    measures: {
      ...payload.measures,
      plan: {
        ...payload.measures.plan,
        h3: bruta.sections.reduce((soma, item) => soma + item.h3.length, 0),
        internalLinks: bruta.sections.reduce((soma, item) => soma + item.internalLinks.length, 0),
        externalLinks: bruta.sections.reduce((soma, item) => soma + item.externalLinks.length, 0),
      },
    },
  };
  delete antiga.rulesVersion;
  return antiga;
}

/* ============================== O caso do Instagram (seções copiadas do CSV real) ============================== */

const CTA_DO_INSTAGRAM = "Se você quer parar de depender do Instagram e construir uma presença orgânica que traz pacientes, conheça nossos serviços de SEO para clínicas";

const secoesDoInstagram = (): Secao[] => [
  secao("O primeiro passo: otimize seu perfil para atrair clientes locais", {
    readerQuestion: "Como configurar o perfil do Instagram para atrair clientes da minha região?",
    answerFirst: "Comece transformando seu perfil em uma vitrine clara para o público local: use uma conta comercial, escreva uma bio com localização e serviços, e adicione botões de contato.",
    h3: ["Tenha uma conta comercial para acessar recursos essenciais", "Crie uma bio atrativa que diga onde você atende e o que oferece", "Use os botões de contato e link para facilitar a ação"],
    explain: ["A bio deve informar cidade, bairro e especialidade para filtrar o público.", "Facilite o agendamento com botão de WhatsApp, e-mail ou link para o site."],
    terms: ["otimização de perfil", "conversão local"],
    internalLinks: [{ candidate: "K1", anchor: "como atrair um cliente", reason: "Complementa com estratégias gerais de atração." }],
  }),
  secao("Instagram não traz pacientes quando o pessoal da clínica vira refém do jogo de influencer", {
    readerQuestion: "Por que o Instagram não traz pacientes, mesmo com posts frequentes?",
    answerFirst: "O Instagram não traz pacientes quando o perfil prioriza estética de influencer em vez de presença local.",
    from: ["M4"],
    h3: ["O erro geográfico que quase ninguém fala", "O guru vende frequência; a clínica paga com cansaço", "Posts para Instagram estética não corrigem uma base fraca"],
    explain: ["A clínica local precisa atrair pessoas que podem ir até o consultório, não seguidores de qualquer lugar.", "Conteúdo bonito sem estratégia de conversão não resolve a falta de pacientes."],
    terms: ["engajamento", "alcance", "agendamento"],
    evidence: ["C1", "C3"],
    internalLinks: [{ candidate: "K2", anchor: "captação de pacientes sem tráfego pago", reason: "Aprofunda a alternativa orgânica para clínicas." }],
    externalLinks: [{ claim: "O algoritmo do Instagram prioriza conteúdo com alto engajamento, não necessariamente relevância local", sourceType: "oficial", source: null }],
  }),
  secao("O erro geográfico que quase ninguém fala", {
    readerQuestion: "Como o Instagram pode atrair clientes da minha região?",
    h3: ["Use a bio para dizer onde você atende", "Marque a localização em posts e stories", "Interaja com perfis locais"],
    explain: ["A bio deve informar cidade e bairro para filtrar o público.", "Comentar e seguir perfis locais aumenta a visibilidade regional."],
    terms: ["geolocalização", "público local"],
  }),
  secao("Posts para Instagram estética não corrigem uma base fraca", {
    readerQuestion: "Por que posts bonitos não trazem pacientes?",
    from: ["M4"],
    h3: ["Conteúdo que responde dúvidas reais dos pacientes", "Use os recursos do Instagram a favor da conversão", "Stories e Reels com propósito, não só tendência"],
    explain: ["Recursos como link na bio, destaque de stories e botão de contato facilitam a ação."],
    terms: ["prova social", "call to action"],
    internalLinks: [{ candidate: "K3", anchor: "como captar um cliente", reason: "Detalha o processo de captação." }],
  }),
  secao("Quando o Instagram vira uma muleta cara", {
    readerQuestion: "O Instagram pode substituir outras estratégias de captação?",
    from: ["M12"],
    h3: ["O custo oculto do tempo e da energia", "Mídia paga no Instagram: quando faz sentido", "A importância de ter um site e presença no Google"],
    explain: ["O tempo gasto com Instagram poderia ser investido em outras frentes."],
    terms: ["custo de oportunidade", "tráfego pago"],
    internalLinks: [{ candidate: "K4", anchor: "tráfego pago vs orgânico para clínica de estética", reason: "Compara as duas abordagens." }],
  }),
  secao("O Instagram continua no jogo, mas no lugar certo", {
    readerQuestion: "Como usar o Instagram de forma estratégica para atrair clientes?",
    from: ["M3"],
    h3: ["Hashtags certas para alcançar o público local", "Mensure os resultados para entender o que funciona", "Transforme seguidores em clientes com ofertas e CTAs"],
    explain: ["Use hashtags de nicho e localização, não apenas as genéricas.", "Acompanhe métricas como cliques no link, mensagens e agendamentos."],
    terms: ["engajamento", "conversão"],
    internalLinks: [{ candidate: "K5", anchor: "gerar leads qualificados", reason: "Pilar do silo, aprofunda a geração de leads." }],
  }),
];

const iaDoInstagram = () => resposta(secoesDoInstagram(), {
  closing: {
    turn: "O Instagram pode ser um aliado, mas não é a solução completa. O jogo maduro é construir uma captação própria, com site e presença no Google.",
    cta: CTA_DO_INSTAGRAM,
    nextStep: null,
  },
});

/* ============================== 5 · as exclusões da voz ============================== */

test("5 · no pacote do artigo-modelo, a exclusão da voz (régua única da voz) é fora do escopo: o conceito e a pergunta sobre Instagram Shopping não chegam à IA, e o pedido diz de onde vem", () => {
  const base = entradaGoogle();
  const observado = base.googleObserved as unknown as { concepts: { all: unknown[] }; questions: unknown[] } & Record<string, unknown>;
  const comShopping = {
    ...observado,
    concepts: { ...observado.concepts, all: [...observado.concepts.all, { canonicalLabel: "Ative o Instagram Shopping", status: "RECURRENT", sourceCount: 2, sampleSize: 6, queries: [], evidence: "2 de 6" }] },
    questions: [...observado.questions, { canonicalQuestion: "Como ativar o Instagram Shopping na loja?", status: "MARKET_QUESTION_UNDERCOVERED", pages: 2, sampleSize: 6, declaredByArticle: false, evidence: "2 de 6" }],
  };
  const entrada = { ...base, googleObserved: comShopping as never, dossierGaps: base.dossierGaps ? { ...base.dossierGaps, observed: comShopping as never } : null };
  const silo = planoDoSilo().files[0].writing!;

  const semVoz = buildRadarArticleBlueprintBrief({ entrada, silo, articleId: ARTIGO, publication: null });
  assert.ok(semVoz.evidence.some(item => /Instagram Shopping/.test(item.text)), "sem a voz, a amostra chega como antes");
  assert.equal("voiceExclusions" in semVoz, false);

  const comVoz = buildRadarArticleBlueprintBrief({ entrada, silo, articleId: ARTIGO, publication: null, brandVoice: vozDaMarca() });
  assert.equal(comVoz.evidence.some(item => /Instagram Shopping/.test(item.text)), false, comVoz.evidence.map(item => item.text).join("\n"));
  assert.deepEqual(comVoz.voiceExclusions?.map(item => item.label), radarBrandVoiceExclusions(vozDaMarca()).map(item => item.label));
  assert.ok(comVoz.voiceExclusions?.some(item => item.label === "Instagram Shopping"));
  assert.deepEqual(comVoz.outOfScope, semVoz.outOfScope, "o 'não cobrir' do pacote não muda: a exclusão da voz tem régua própria");
  /* O resto da amostra continua chegando: a exclusão não tira o que não a toca. */
  assert.equal(comVoz.evidence.length, semVoz.evidence.length - 2);
  const { system, user } = radarArticleBlueprintPrompt(comVoz);
  assert.ok(linhas(user).includes("- Instagram Shopping (exclusão da voz da marca)"), user);
  assert.match(system, /O que a Skill proíbe como assunto \(em 'Fora do escopo', marcado 'exclusão da voz da marca'\) não entra em seção, H3, pergunta, diferencial, ângulo nem demonstração/);

  /* E a conferência tira a seção que a IA ainda propuser sobre o assunto excluído, dizendo de onde vem a exclusão. */
  const ia = resposta([...secoesDoInstagram().slice(0, 3), secao("Ative o Instagram Shopping no perfil da clínica", { from: ["M4"] })]);
  const { payload, notes } = organizar(ia, pacote({ voiceExclusions: radarBrandVoiceExclusions(vozDaMarca()) }));
  assert.equal(payload.blueprint.sections.some(item => /Shopping/.test(item.h2)), false);
  assert.ok(notes.some(item => item === "Seção \"Ative o Instagram Shopping no perfil da clínica\" removida: a voz da marca exclui \"Instagram Shopping\" (seção \"Recursos antigos ou inadequados\" da Skill)."), notes.join("\n"));
  /* Sem a exclusão no pacote, a mesma seção fica (o artigo é sobre Instagram). */
  assert.ok(organizar(ia).payload.blueprint.sections.some(item => /Shopping/.test(item.h2)));
});

/* ============================== 8 · a pseudo-afirmação ============================== */

const ROTULOS_DO_CSV_DE_LEADS = [
  "Definição de lead qualificado conforme fontes do setor",
  "Estatísticas sobre conversão de leads qualificados",
  "Passos para gerar leads qualificados",
  "Métricas para avaliar geração de leads",
  "Riscos de comprar listas de leads",
  "Diferença entre lead qualificado e interessado",
];

test("8 · pseudo-afirmação: rótulo de tema sem verbo (CSV de leads) é rótulo; afirmação com verbo ou número continua afirmação", () => {
  for (const rotulo of ROTULOS_DO_CSV_DE_LEADS) assert.equal(radarArticleBlueprintPseudoClaim(rotulo), true, rotulo);
  assert.equal(radarArticleBlueprintPseudoClaim("Como gerar leads qualificados"), true);
  for (const afirmacao of [
    "O algoritmo do Instagram prioriza conteúdo com alto engajamento, não necessariamente relevância local",
    "Comprar listas pode trazer contatos desatualizados e sem interesse real",
    "Sites de ofertas agregam promoções de clínicas parceiras",
    "Descontos agressivos podem atrair clientes que não valorizam o serviço",
    "Postar com frequência aumenta o alcance",
    "Conteúdo relevante atrai leads qualificados",
    "Taxa de conversão de 2% em páginas de captura",
    "Pacientes de estética pesquisam preços antes de agendar",
  ]) assert.equal(radarArticleBlueprintPseudoClaim(afirmacao), false, afirmacao);
});

const secoesDeLeads = (): Secao[] => [
  secao("O que é um lead qualificado?", {
    readerQuestion: "O que caracteriza um lead qualificado?",
    externalLinks: [{ claim: ROTULOS_DO_CSV_DE_LEADS[0], sourceType: "oficial", source: null }],
  }),
  secao("Por que gerar leads qualificados?", {
    readerQuestion: "Por que devo investir em gerar leads qualificados?",
    externalLinks: [{ claim: ROTULOS_DO_CSV_DE_LEADS[1], sourceType: "oficial", source: null }],
  }),
  secao("Lista de leads qualificados: o que é e como usar", {
    readerQuestion: "O que é uma lista de leads qualificados e como posso utilizá-la?",
    externalLinks: [
      { claim: ROTULOS_DO_CSV_DE_LEADS[4], sourceType: "oficial", source: null },
      { claim: "Comprar listas pode trazer contatos desatualizados e sem interesse real", sourceType: "oficial", source: null },
    ],
  }),
  secao("Lead qualificado vs. lead interessado: entenda a diferença", {
    readerQuestion: "Qual a diferença entre lead qualificado e lead interessado?",
    externalLinks: [{ claim: ROTULOS_DO_CSV_DE_LEADS[5], sourceType: "oficial", source: null }],
  }),
];

const iaDeLeads = () => resposta(secoesDeLeads(), {
  title: {
    h1: "Leads qualificados: o que são e como gerá-los para sua clínica",
    seoTitle: "Leads qualificados: o que são e como gerar | AdalbaPro",
    metaDescription: "Entenda o que são leads qualificados, a diferença para leads interessados e como gerá-los com estratégias práticas para clínicas de estética.",
  },
  opening: { readerQuestion: "O que é um lead qualificado e como saber se estou atraindo as pessoas certas para minha clínica?", direction: "Definição clara.", evidence: ["P1"] },
});
const pacoteDeLeads = () => pacote({ principal: "leads qualificados", complementary: ["leads qualificados o que é", "gerar leads qualificados", "lista de leads qualificados"] });

test("8 · a conferência tira da planta o link externo que é rótulo de tema (nem link, nem afirmação delimitada); a afirmação real fica", () => {
  const { payload, notes } = organizar(iaDeLeads(), pacoteDeLeads());
  const afirmacoes = payload.blueprint.sections.flatMap(item => item.externalLinks.map(link => link.claim));
  assert.deepEqual(afirmacoes, ["Comprar listas pode trazer contatos desatualizados e sem interesse real"]);
  assert.equal(payload.measures.plan.externalLinks, 1);
  const removidas = notes.filter(item => /é rótulo de tema, não afirmação a sustentar/.test(item));
  assert.equal(removidas.length, 4, notes.join("\n"));
  assert.equal(radarArticleBlueprintPendingNotes(removidas).pending.length, 0, "correção aplicada: não paga passada de correção");
  assert.match(radarArticleBlueprintPrompt(pacoteDeLeads()).system, /claim é a FRASE afirmativa que o texto vai dizer, com sujeito e verbo/);
});

test("8 · a planta antiga: o rótulo não sai como 'Sem link externo', não entra em 'só com fonte' e não trava a meta description", () => {
  const antiga = plantaAntiga(iaDeLeads(), pacoteDeLeads());
  assert.equal(antiga.blueprint.sections.flatMap(item => item.externalLinks).length, 5, "a planta gravada guarda os rótulos");
  /* O export passa as afirmações da planta GRAVADA (com os rótulos): a coluna as filtra. */
  const doExport: RadarPendingClaim[] = antiga.blueprint.sections.flatMap((item, indice) => item.externalLinks.map(link => ({ texto: link.claim, origem: "PLANTA" as const, fonte: null, secao: indice })));
  for (const colunas of [radarArticleBlueprintColumns(antiga), radarArticleBlueprintColumns(antiga, null, null, null, { pendentes: doExport })]) {
    for (const rotulo of ROTULOS_DO_CSV_DE_LEADS) assert.equal(colunas.estrutura.includes(rotulo), false, `${rotulo}\n${colunas.estrutura}`);
    assert.ok(linhas(colunas.estrutura).includes("- Sem link externo: \"Comprar listas pode trazer contatos desatualizados e sem interesse real\" fica delimitada no texto (precisa de fonte: oficial)."));
    assert.match(colunas.estrutura, / · 0 links externos \(1 afirmação delimitada, sem link\)/);
    assert.ok(linhas(colunas.titulo_e_seo).includes("Meta description: Entenda o que são leads qualificados, a diferença para leads interessados e como gerá-los com estratégias práticas para clínicas de estética."), colunas.titulo_e_seo);
    assert.doesNotMatch(colunas.estrutura, D10);
  }
});

/* ============================== 9 · a demonstração com resultado inventado ============================== */

const DEMONSTRACAO_DE_CAPTACAO = "Demonstração: exemplo de um consultório que otimizou o perfil do Google e passou a receber mais ligações; mostrar antes e depois das configurações.";

test("9 · a demonstração com resultado atribuído (CSV de captação) vira exemplo ilustrativo; 'antes e depois das configurações' fica", () => {
  assert.equal(radarArticleBlueprintAttributedResult(DEMONSTRACAO_DE_CAPTACAO), true);
  assert.equal(radarArticleBlueprintPracticalWithoutResult(DEMONSTRACAO_DE_CAPTACAO),
    "Demonstração: exemplo ilustrativo de como otimizar o perfil do Google, sem resultado atribuído; mostrar antes e depois das configurações.");
  assert.equal(radarArticleBlueprintPracticalWithoutResult("Mostre uma clínica que dobrou os agendamentos."), "Mostre um exemplo ilustrativo do ajuste, sem resultado atribuído.");
  /* Sem caso com resultado, o MESMO texto. */
  const semCaso = "Demonstração: um exemplo ilustrativo antes → o ajuste na bio → depois, com a cidade e o bairro.";
  assert.equal(radarArticleBlueprintAttributedResult(semCaso), false);
  assert.equal(radarArticleBlueprintPracticalWithoutResult(semCaso), semCaso);
  assert.equal(radarArticleBlueprintAttributedResult("Explique que um perfil que mostra a cidade filtra o público."), false);
});

const secoesDeCaptacao = (): Secao[] => [
  secao("Tráfego orgânico como fazer: passo a passo para dentistas", {
    readerQuestion: "Como começar a fazer tráfego orgânico para captar pacientes?",
    h3: ["Como aumentar o tráfego orgânico do site", "Como começar no tráfego orgânico", "Como medir o tráfego orgânico"],
    explain: ["Otimize páginas com palavras-chave locais e conteúdo útil.", "Crie um blog com artigos sobre dúvidas comuns dos pacientes.", "Use ferramentas como Google Analytics e Search Console para monitorar."],
    practical: DEMONSTRACAO_DE_CAPTACAO,
  }),
  secao("Estratégias de tráfego orgânico para captação de pacientes na odontologia", {
    readerQuestion: "Quais estratégias de tráfego orgânico funcionam para dentistas?",
    h3: ["Marketing de conteúdo para dentistas", "SEO local e Perfil da Empresa no Google", "Redes sociais orgânicas", "E-mail marketing para fidelização"],
    explain: ["Crie artigos e vídeos que respondam dúvidas dos pacientes.", "Otimize o perfil do Perfil da Empresa no Google para buscas locais.", "Use Instagram e TikTok para mostrar bastidores e dicas."],
    terms: ["blog", "redes sociais", "e-mail marketing"],
  }),
  secao("Captação de pacientes na odontologia: como aplicar o tráfego orgânico", {
    readerQuestion: "Como aplicar o tráfego orgânico especificamente na odontologia?",
    h3: ["Conteúdo educativo para pacientes", "Depoimentos e prova social", "Otimização para busca local"],
    explain: ["Publique artigos sobre procedimentos e cuidados bucais.", "Incentive avaliações positivas no Google.", "Use palavras-chave locais e informações de contato claras."],
    terms: ["avaliações", "SEO local"],
  }),
  secao("Tráfego orgânico no Instagram e TikTok para dentistas", {
    readerQuestion: "Como usar Instagram e TikTok para captar pacientes sem anúncios?",
    h3: ["Formatos de conteúdo que funcionam", "Como aumentar o alcance orgânico", "Erros comuns a evitar"],
    explain: ["Use hashtags relevantes e publique consistentemente.", "Evite conteúdo excessivamente promocional."],
    terms: ["Instagram", "TikTok", "engajamento"],
  }),
  secao("Quando contratar uma empresa de captação de pacientes", {
    readerQuestion: "Quando vale a pena contratar uma empresa especializada em captação de pacientes?",
    h3: ["Sinais de que você precisa de ajuda", "O que esperar de uma agência", "Como escolher um parceiro"],
    explain: ["Falta de tempo para produzir conteúdo e otimizar o site."],
    terms: ["terceirização", "consultoria"],
    internalLinks: [{ candidate: "K6", anchor: "SEO para clínicas", reason: "Serviço da marca que se relaciona com a necessidade." }],
  }),
];
const pacoteDeCaptacao = () => pacote({
  principal: "captação de pacientes dentista",
  complementary: ["captação de pacientes sem tráfego pago", "empresa de captação de pacientes", "tráfego orgânico como fazer"],
});
const iaDeCaptacao = () => resposta(secoesDeCaptacao(), {
  closing: { turn: "Captação sem tráfego pago é possível com consistência.", cta: "Conheça nossos serviços de SEO para clínicas e planeje a presença orgânica do consultório.", nextStep: null },
});

test("9 · a conferência e a planta antiga: a entrega prática sai sem o resultado atribuído, pela trava de fonte", () => {
  const { payload, notes } = organizar(iaDeCaptacao(), pacoteDeCaptacao());
  assert.equal(payload.blueprint.sections[0].practical, "Demonstração: exemplo ilustrativo de como otimizar o perfil do Google, sem resultado atribuído; mostrar antes e depois das configurações.");
  const nota = notes.find(item => /entrega prática atribuía resultado/.test(item));
  assert.ok(nota && radarArticleBlueprintPendingNotes([nota]).pending.length === 0, notes.join("\n"));
  assert.match(radarArticleBlueprintPrompt(pacoteDeCaptacao()).system, /A demonstração mostra o ajuste, não um resultado: sem fonte X do pacote, nada de caso com resultado atribuído/);

  const estrutura = radarArticleBlueprintColumns(plantaAntiga(iaDeCaptacao(), pacoteDeCaptacao())).estrutura;
  assert.ok(linhas(estrutura).includes("- Entrega prática: Demonstração: exemplo ilustrativo de como otimizar o perfil do Google, sem resultado atribuído; mostrar antes e depois das configurações."), estrutura);
  assert.doesNotMatch(estrutura, /passou a receber mais ligações/);
});

/* ============================== 11 · H3 repetido e H2 sobrepostos ============================== */

test("11 · o H3 igual ao H2 de outra seção sai (CSV do Instagram): na conferência e na planta antiga, com a medida que concorda", () => {
  const { sections, removed } = radarArticleBlueprintH3WithoutRepeatedH2(RadarArticleBlueprintAiSchema.parse(iaDoInstagram()).sections);
  assert.deepEqual(removed.map(item => item.h3), ["O erro geográfico que quase ninguém fala", "Posts para Instagram estética não corrigem uma base fraca"]);
  assert.deepEqual(sections[1].h3, ["O guru vende frequência; a clínica paga com cansaço"]);

  const { payload, notes } = organizar(iaDoInstagram());
  assert.deepEqual(payload.blueprint.sections[1].h3, ["O guru vende frequência; a clínica paga com cansaço"]);
  assert.equal(payload.measures.plan.h3, 16);
  assert.equal(notes.filter(item => /repetia um H2 da planta \(a seção dele já existe\)/.test(item)).length, 2);
  /* Sem falso positivo: as seções do Instagram não se sobrepõem pelas réguas novas. */
  assert.equal(notes.some(item => /respondem a mesma pergunta|se sobrepõem/.test(item)), false, notes.join("\n"));

  const antiga = plantaAntiga(iaDoInstagram());
  assert.equal(antiga.measures.plan.h3, 18);
  const estrutura = radarArticleBlueprintColumns(antiga).estrutura;
  assert.equal((estrutura.match(/O erro geográfico que quase ninguém fala/g) || []).length, 1, "só o H2 da seção 3");
  assert.equal((estrutura.match(/Posts para Instagram estética não corrigem uma base fraca/g) || []).length, 1);
  assert.match(estrutura, /^Medidas do plano: 6 H2 · 16 H3 · /m);
});

test("11 · H2 sobrepostos (CSV de captação): estratégias × aplicação (só o genérico muda) e estratégias × Instagram/TikTok (o corpo já trata o título) viram nota que pede ação", () => {
  const comuns = new Set<string>();
  const sobrepostas = radarArticleBlueprintOverlappingSections(RadarArticleBlueprintAiSchema.parse(iaDeCaptacao()).sections, comuns);
  assert.ok(sobrepostas.length >= 1);
  const { notes } = organizar(iaDeCaptacao(), pacoteDeCaptacao());
  const generico = notes.find(item => item.startsWith("Seções \"Estratégias de tráfego orgânico para captação de pacientes na odontologia\" e \"Captação de pacientes na odontologia: como aplicar o tráfego orgânico\" respondem a mesma pergunta"));
  const corpo = notes.find(item => item.startsWith("Seções \"Estratégias de tráfego orgânico para captação de pacientes na odontologia\" e \"Tráfego orgânico no Instagram e TikTok para dentistas\" se sobrepõem"));
  assert.ok(generico, notes.join("\n"));
  assert.ok(corpo, notes.join("\n"));
  assert.equal(radarArticleBlueprintPendingNotes([generico!, corpo!]).pending.length, 2, "pedem ação: a passada de correção junta ou diferencia");
  const { system, user } = radarArticleBlueprintPrompt(pacoteDeCaptacao(), { fix: { previous: {}, pending: [generico!] } });
  assert.match(system, /Cada H2 responde uma pergunta DIFERENTE do leitor: estratégias, aplicação e um canal do mesmo assunto não são três seções/);
  assert.match(system, /Um H3 nunca repete o H2 de outra seção/);
  assert.match(user, /cada H2 responde uma pergunta diferente \(junte as seções sobrepostas ou dê a cada uma a sua entrega\)/);
});

/* ============================== 10 · o CTA e a continuação ============================== */

test("10 · o CTA que cita a página comercial (CSV do Instagram): a âncora é o trecho do CTA; sem candidato 'Página da marca', nada", () => {
  const achado = radarArticleBlueprintCtaLink(CTA_DO_INSTAGRAM, CANDIDATOS_DO_SILO);
  assert.equal(achado?.candidate.id, "K6");
  assert.equal(achado?.anchor, "serviços de SEO para clínicas");
  assert.equal(radarArticleBlueprintCtaLink(CTA_DO_INSTAGRAM, CANDIDATOS_DO_SILO.filter(item => item.id !== "K6")), null);
  assert.equal(radarArticleBlueprintCtaLink("Fale com a AdalbaPro e conheça nossos serviços.", CANDIDATOS_DO_SILO), null, "uma palavra do caminho não é citação da página");
  /* "clínica" solta antes não alarga a âncora. */
  assert.equal(radarArticleBlueprintCtaLink("Se a sua clínica quer agenda, conheça os serviços de SEO para clínicas.", CANDIDATOS_DO_SILO)?.anchor, "serviços de SEO para clínicas");
});

test("10 · a conferência põe o link do CTA na última seção; a planta antiga ganha o mesmo link (L6) e a linha da chamada", () => {
  const { payload, notes } = organizar(iaDoInstagram());
  const ultima = payload.blueprint.sections[payload.blueprint.sections.length - 1];
  assert.deepEqual(ultima.internalLinks.at(-1), { candidate: "K6", anchor: "serviços de SEO para clínicas", reason: "o CTA do fechamento cita esta página" });
  assert.equal(payload.measures.plan.internalLinks, 6);
  const nota = notes.find(item => /O CTA cita a página comercial/.test(item));
  assert.ok(nota && radarArticleBlueprintPendingNotes([nota]).pending.length === 0);
  const { system } = radarArticleBlueprintPrompt(pacote());
  assert.match(system, /Quando o CTA cita a página comercial da marca \(o candidato 'Página da marca'\), o link para ela entra no plano, na ÚLTIMA seção/);

  const colunas = radarArticleBlueprintColumns(plantaAntiga(iaDoInstagram()));
  assert.match(colunas.links_internos, /^Aplique somente estes 6 link\(s\)/m);
  assert.ok(linhas(colunas.links_internos).includes(`L6 · âncora "serviços de SEO para clínicas" → Página da marca (Skill de voz) "Página da marca /servicos/seo-para-clinicas" → ${PAGINA_COMERCIAL} (publicado) · onde: seção "O Instagram continua no jogo, mas no lugar certo" · por quê: o CTA do fechamento cita esta página`), colunas.links_internos);
  assert.ok(linhas(colunas.estrutura).includes("Link da chamada: L6, âncora \"serviços de SEO para clínicas\" → Página da marca /servicos/seo-para-clinicas (no fim da última seção, junto da chamada)."), colunas.estrutura);
  assert.match(colunas.estrutura, / · 6 links internos · /);
  assert.equal((colunas.estrutura.match(/^CTA/gm) || []).length, 1);
  assert.doesNotMatch(colunas.estrutura, D10);
});

test("10 · a planta que já liga a página comercial (CSV de captação) não ganha link repetido: a linha da chamada aponta o L que existe", () => {
  const { payload } = organizar(iaDeCaptacao(), pacoteDeCaptacao());
  assert.equal(payload.blueprint.sections.flatMap(item => item.internalLinks).filter(link => link.candidate === "K6").length, 1);
  const colunas = radarArticleBlueprintColumns(plantaAntiga(iaDeCaptacao(), pacoteDeCaptacao()));
  assert.match(colunas.links_internos, /^Aplique somente estes 1 link\(s\)/m);
  assert.ok(linhas(colunas.estrutura).includes("Link da chamada: L1, âncora \"SEO para clínicas\" → Página da marca /servicos/seo-para-clinicas (no fim da última seção, junto da chamada)."), colunas.estrutura);
});

test("10 · um CTA só: a continuação deixa o fechamento e vira menção opcional no corpo da seção que tem o link dela (L2, CSV do Instagram)", () => {
  const colunas = radarArticleBlueprintColumns(plantaAntiga(iaDoInstagram()), null, null, null, {
    principal: "como atrair clientes pelo instagram",
    continuation: { kind: "article", label: "captação de pacientes sem tráfego pago", articleId: "a-captacao", slug: "captacao-de-pacientes-sem-trafego-pago", names: ["captação de pacientes sem tráfego pago"] },
  });
  assert.doesNotMatch(colunas.estrutura, /^Continuação|^Próximo passo:/m);
  /*
   * 2026-10-09 (correção · casos-reais-F16) · o link L2 está na seção 2 de 6: a
   * "leitura seguinte" vai à ÚLTIMA seção pertinente depois dela ("Quando o
   * Instagram vira uma muleta cara", a das outras estratégias de captação),
   * citando o L2 sem repetir o link. Sem seção pertinente depois do link, fica
   * na seção do link (como antes).
   */
  const secao5 = colunas.estrutura.split("\n## ")[5];
  assert.ok(secao5.startsWith("Quando o Instagram vira uma muleta cara"), secao5);
  assert.ok(linhas(secao5).includes("- Leitura seguinte (opcional, não é uma chamada): se couber, mencione aqui o próximo artigo do Silo, \"captação de pacientes sem tráfego pago\", como a leitura seguinte — o link L2 (seção \"Instagram não traz pacientes quando o pessoal da clínica vira refém do jogo de influencer\") já leva a ele; não repita o link e nunca o use como uma segunda chamada no fechamento."), secao5);
  assert.equal((colunas.estrutura.match(/^- Leitura seguinte/gm) || []).length, 1);
  assert.equal((colunas.estrutura.match(/^CTA/gm) || []).length, 1);
  const { system } = radarArticleBlueprintPrompt(pacote());
  assert.match(system, /UM CTA SÓ: closing\.cta é a única chamada do artigo/);
  assert.match(radarArticleBlueprintPrompt(pacote()).user, /"nextStep":null/);
});

/* ============================== 12 · a promessa e o leitor (CSV de promoções) ============================== */

const LEITOR_DE_PROMOCOES = "Profissionais de clínicas de estética que buscam criar promoções eficazes sem desvalorizar seus serviços, e pacientes que procuram ofertas confiáveis.";
const PROMESSA_DE_PROMOCOES = "Cobrir com clareza o tema “promoções para estética”, mostrando como criar ofertas que atraem pacientes sem destruir a margem, e como pacientes podem encontrar descontos seguros.";

test("12 · a moldura 'Cobrir com clareza o tema …' sai da promessa (o gerúndio vai ao presente); só a moldura vira vazio", () => {
  assert.equal(radarArticleBlueprintPromiseWithoutFrame(PROMESSA_DE_PROMOCOES),
    "O artigo mostra como criar ofertas que atraem pacientes sem destruir a margem, e como pacientes podem encontrar descontos seguros.");
  assert.equal(radarArticleBlueprintPromiseWithoutFrame("Cobrir com clareza o tema “promoções para estética”."), "");
  assert.equal(radarArticleBlueprintPromiseWithoutFrame("Ao final, o leitor sabe montar a promoção."), "Ao final, o leitor sabe montar a promoção.");

  /* No pacote: a promessa declarada que é só a moldura não vai à IA. */
  const entrada = entradaGoogle({ article: { ...entradaGoogle().article, promise: "Cobrir com clareza o tema “skincare facial”." } });
  const brief = buildRadarArticleBlueprintBrief({ entrada, silo: planoDoSilo().files[0].writing!, articleId: ARTIGO, publication: null });
  assert.equal(brief.article.promise, null);
  const { system, user } = radarArticleBlueprintPrompt(brief);
  assert.doesNotMatch(user, /Cobrir com clareza/);
  assert.match(system, /24\. UM LEITOR SÓ E A PROMESSA: reader é UM público/);
  assert.match(system, /nunca 'Cobrir com clareza o tema …'/);
});

test("12 · um leitor só: o segundo público sai do leitor e da promessa; o objeto do negócio ('atraem pacientes e clientes que voltam') não é segundo leitor", () => {
  assert.equal(radarArticleBlueprintSecondAudience(LEITOR_DE_PROMOCOES), "e pacientes que procuram ofertas confiáveis");
  assert.equal(radarArticleBlueprintWithoutSecondAudience(LEITOR_DE_PROMOCOES), "Profissionais de clínicas de estética que buscam criar promoções eficazes sem desvalorizar seus serviços.");
  const promessa = radarArticleBlueprintPromiseWithoutFrame(PROMESSA_DE_PROMOCOES);
  assert.equal(radarArticleBlueprintSecondAudience(promessa), null, "sem o negócio no texto, só com o leitor dito");
  assert.equal(radarArticleBlueprintWithoutSecondAudience(promessa, { business: true }), "O artigo mostra como criar ofertas que atraem pacientes sem destruir a margem.");
  assert.equal(radarArticleBlueprintSecondAudience("Profissionais de clínica que criam ofertas que atraem pacientes e clientes que voltam."), null);
  assert.equal(radarArticleBlueprintReaderBusiness(LEITOR_DE_PROMOCOES), "a clínica");
});

const secoesDePromocoes = (): Secao[] => [
  secao("O erro é usar desconto como resposta para tudo em promoções para estética", {
    readerQuestion: "Por que descontos genéricos não funcionam para clínicas de estética?",
    explain: ["Avalie métricas como taxa de retorno e ticket médio para identificar o perfil atraído."],
  }),
  secao("Ideias de promoções de estética com mais critério comercial", {
    readerQuestion: "Quais promoções funcionam para clínicas de estética sem desvalorizar o serviço?",
    h3: ["Pacotes de tratamento com preço fechado", "Avaliação gratuita como porta de entrada", "Programa de fidelidade e indicações"],
  }),
  secao("Site de promoções estetica: onde encontrar ofertas confiáveis", {
    readerQuestion: "Quais sites de promoções de estética são confiáveis?",
    answerFirst: "Sites como Magote, UvaRosa e Cuponeria oferecem ofertas, mas é preciso verificar a reputação da clínica e as condições do cupom.",
    h3: ["Plataformas de ofertas e cupons", "Critérios para avaliar uma oferta", "Cuidados com promoções enganosas"],
    explain: ["Verifique avaliações, localização e termos do cupom antes de comprar.", "Desconfie de descontos extremos que podem indicar baixa qualidade."],
  }),
  secao("Como criar promoções sem desvalorizar a clínica", {
    readerQuestion: "Como estruturar uma promoção que não prejudique a imagem da clínica?",
    explain: ["Defina objetivos claros, limite a duração e comunique o valor agregado."],
  }),
];
const pacoteDePromocoes = () => pacote({ principal: "promoções estética", complementary: ["promoções para estética", "promoções de estética", "site de promoções estetica"] });
const iaDePromocoes = () => resposta(secoesDePromocoes(), { reader: LEITOR_DE_PROMOCOES, promise: PROMESSA_DE_PROMOCOES });

test("12 · a conferência: a moldura sai sempre; o público duplo e a seção que fala com quem compra pedem ação; fechando, o segundo público sai", () => {
  const aberta = organizar(iaDePromocoes(), pacoteDePromocoes());
  assert.equal(aberta.payload.blueprint.promise, "O artigo mostra como criar ofertas que atraem pacientes sem destruir a margem, e como pacientes podem encontrar descontos seguros.");
  const duplo = aberta.notes.find(item => item.startsWith("O leitor fala com dois públicos"));
  const guia = aberta.notes.find(item => item.startsWith("Seção \"Site de promoções estetica: onde encontrar ofertas confiáveis\" fala com quem compra"));
  assert.ok(duplo && guia, aberta.notes.join("\n"));
  assert.equal(radarArticleBlueprintPendingNotes([duplo!, guia!]).pending.length, 2);
  assert.match(guia!, /o que a clínica ganha e perde com isso/);
  assert.equal(aberta.notes.some(item => /^Seção "(?:O erro|Ideias|Como criar)/.test(item) && /fala com quem compra/.test(item)), false, "só a seção do guia de compra");

  const fechada = organizar(iaDePromocoes(), pacoteDePromocoes(), { close: true });
  assert.equal(fechada.payload.blueprint.reader, "Profissionais de clínicas de estética que buscam criar promoções eficazes sem desvalorizar seus serviços.");
  assert.equal(fechada.payload.blueprint.promise, "O artigo mostra como criar ofertas que atraem pacientes sem destruir a margem.");
  const corrigida = fechada.notes.find(item => item.startsWith("Um leitor só:"));
  assert.ok(corrigida && radarArticleBlueprintPendingNotes([corrigida]).pending.length === 0);
});

test("12 · a planta antiga de promoções: leitor de um público, promessa sem moldura nem segundo público, e a seção de cupom enquadrada para a clínica", () => {
  const colunas = radarArticleBlueprintColumns(plantaAntiga(iaDePromocoes(), pacoteDePromocoes()));
  const promessa = linhas(colunas.promessa_e_leitor);
  assert.equal(promessa[0], "Leitor: Profissionais de clínicas de estética que buscam criar promoções eficazes sem desvalorizar seus serviços.");
  assert.ok(promessa[1].startsWith("Promessa: O artigo mostra como criar ofertas que atraem pacientes sem destruir a margem"), promessa[1]);
  assert.doesNotMatch(colunas.promessa_e_leitor, /Cobrir com clareza|descontos seguros|pacientes que procuram ofertas/);
  const guia = colunas.estrutura.split("\n## ").find(item => item.startsWith("Site de promoções estetica"))!;
  assert.ok(linhas(guia).some(linha => linha.startsWith("- Enquadramento (um leitor só): escreva esta seção para o leitor declarado, o que a clínica ganha e perde com isso e como decide; não oriente quem compra (")), guia);
  assert.equal((colunas.estrutura.match(/Enquadramento \(um leitor só\)/g) || []).length, 1);
  assert.doesNotMatch(colunas.estrutura, D10);
});

/* ============================== a planta que já segue as regras sai igual ============================== */

test("a planta nova e limpa passa pelas colunas sem linha nova (nem enquadramento, nem link da chamada, nem leitura seguinte)", () => {
  const { payload } = organizar(resposta(secoesDoInstagram().slice(0, 1).concat([
    secao("Use os Stories para mostrar a rotina da clínica", { from: ["M4"] }),
    secao("Leve o seguidor ao contato", { from: ["M3"] }),
  ])));
  const colunas = radarArticleBlueprintColumns(payload);
  assert.doesNotMatch(colunas.estrutura, /Enquadramento|Link da chamada|Leitura seguinte|exemplo ilustrativo/);
  assert.equal(radarArticleBlueprintBuyerGuideMarks(payload.blueprint.sections[0]).length, 0);
});

test("sentinela: nenhuma ida ao servidor", () => {
  assert.deepEqual(idasAoServidor, []);
});
