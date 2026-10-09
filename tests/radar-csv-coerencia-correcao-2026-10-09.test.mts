import assert from "node:assert/strict";
import test from "node:test";
import {
  radarClaimIsTopicLabel,
  radarPendingClaims,
  radarPlatformClaimKind,
  radarSentenceNeedsSource,
  type RadarPendingClaim,
} from "../lib/radar/pending-claims.ts";
import {
  RADAR_ARTICLE_BLUEPRINT_TURN_WITHOUT_CALL,
  RadarArticleBlueprintAiSchema,
  radarArticleBlueprintAttributedResult,
  radarArticleBlueprintColumns,
  radarArticleBlueprintOverlappingSections,
  radarArticleBlueprintPendingNotes,
  radarArticleBlueprintPracticalWithoutResult,
  radarArticleBlueprintPseudoClaim,
  radarArticleBlueprintReading,
  radarArticleBlueprintRulesNoticeText,
  radarArticleBlueprintSecondAudience,
  radarArticleBlueprintTitleWithoutSecondAudience,
  radarArticleBlueprintTurnWithoutCall,
  radarArticleBlueprintWithoutSecondAudience,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintBrief,
  type RadarArticleBlueprintLinkCandidate,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import { radarWritingCutCell, radarWritingReferenceTexts, radarWritingReferenceTreats } from "../lib/radar/portable-writing-export.ts";
import { radarSemanticStems } from "../lib/radar/semantic-concept-model.ts";
import { radarBrandVoiceExclusionOf, radarBrandVoiceExclusions } from "../lib/radar/brand-voice.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RadarArticleBlueprintRulesNotice } from "../modules/radar/radar-article-blueprint-panel.tsx";
import { radarMarketCitationNoiseReason, type RadarMarketCitation, type RadarResearchNoiseContext } from "../lib/radar/research-noise.ts";
import { WRITER_BLUEPRINT_READING_RULES, writerArticleBlueprintForWriting, writerBlueprintWithCurrentNames } from "../lib/redator/writer-blueprint-for-writing.ts";

/*
 * ===== 2026-10-09 · CORREÇÃO DA RODADA DE COERÊNCIA DOS 8 CSVs "PARA ESCREVER" =====
 *
 * A revisão adversarial da rodada (casos reais, contrato e suítes) achou o que
 * as correções do dia ainda erravam. Cada teste abaixo falhava antes da
 * correção e usa o texto do CSV real do Silo "Leads sem Tráfego Pago" (ou o
 * caso medido pela revisão). Domínio puro: sem rede, sem banco, sem modelo.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const D10 = /fonte a obter|pend[eê]ncia|pendente de|preencher|rascunho|aguardando aprova/i;

/* A planta mínima que `radarPendingClaims` lê: os links externos por seção e as fontes do pacote. */
const plantaComLinks = (links: ReadonlyArray<ReadonlyArray<{ claim: string; source?: string | null }>>) =>
  ({ blueprint: { sections: links.map(lista => ({ externalLinks: lista.map(link => ({ claim: link.claim, sourceType: "oficial", source: link.source ?? null })) })) }, sources: [] }) as unknown as RadarArticleBlueprintPayload;

/* ------------------------------ a trava: semelhança alta por oração e reprodução inteira ------------------------------ */

/* Os links externos sem fonte da planta real de tráfego (um por seção, como o CSV de 09/10 os lista). */
const PLANTA_TRAFEGO = [
  "Tráfego pago depende de orçamento contínuo e é percebido como menos confiável",
  "Tráfego orgânico constrói presença estável a longo prazo",
  "Tráfego pago gera resultados imediatos, mas depende de orçamento contínuo",
  "Combinar tráfego orgânico e pago transforma o site em uma máquina de crescimento",
];
/* As raízes que a planta real de tráfego tem em metade ou mais das seções (`radarClaimCommonStems`). */
const COMUNS_TRAFEGO = new Set(["trafeg", "pago", "organic", "clinic"]);

test("casos-reais-F1 · a frase que reafirma o link da planta numa oração e acrescenta outra depois de ';' continua travando (CSV de tráfego)", () => {
  const pendentes = radarPendingClaims(null, plantaComLinks(PLANTA_TRAFEGO.map(claim => [{ claim }])));
  const frase = "O orgânico sustenta a presença a longo prazo; o pago traz picos de tráfego quando necessário";
  for (const secao of [2, 3]) {
    const veredito = radarSentenceNeedsSource(frase, { pendentes, secao, comuns: COMUNS_TRAFEGO });
    assert.equal(veredito.needs, true, `seção ${secao}`);
    assert.equal(veredito.kind, "PLANTA");
    assert.equal(veredito.reason, "a planta pede fonte oficial ou verificada: \"Tráfego orgânico constrói presença estável a longo prazo\"");
    assert.doesNotMatch(`${veredito.reason} ${veredito.label}`, D10);
  }
  /* A mesma reafirmação ligada por " e " (oração coordenada com sujeito próprio). */
  assert.equal(radarSentenceNeedsSource("O orgânico sustenta a presença a longo prazo e o pago traz picos de tráfego quando necessário", { pendentes, secao: 2, comuns: COMUNS_TRAFEGO }).kind, "PLANTA");
  /* A oração que só toca uma raiz da afirmação não é reafirmação. */
  assert.equal(radarSentenceNeedsSource("Crie uma rotina de conteúdo para o longo prazo; revise o calendário a cada mês", { pendentes, secao: 2, comuns: COMUNS_TRAFEGO }).needs, false);
});

test("suites-R1 · a frase longa que reproduz inteira a afirmação da planta trava em qualquer lugar (meta, H1, promessa)", () => {
  const pendentes: RadarPendingClaim[] = [
    { texto: "O Google responde por mais de 90% das buscas no Brasil", origem: "PLANTA", fonte: null, secao: 2 },
    { texto: "Clínicas que respondem no WhatsApp em até 5 minutos convertem 3 vezes mais", origem: "PLANTA", fonte: null, secao: 4 },
  ];
  for (const secao of [null, 0]) {
    const meta = radarSentenceNeedsSource(
      "Descubra por que o Google responde por mais de 90% das buscas no Brasil e como sua clínica de estética pode aparecer nas primeiras posições com SEO local bem feito",
      { pendentes, secao },
    );
    assert.equal(meta.kind, "PLANTA", `meta · seção ${secao}`);
    const whatsapp = radarSentenceNeedsSource(
      "Responder no WhatsApp em até 5 minutos faz a clínica converter 3 vezes mais, segundo o atendimento de quem trabalha com estética e harmonização facial",
      { pendentes, secao },
    );
    assert.equal(whatsapp.needs, true, `WhatsApp · seção ${secao}`);
  }
});

const ROTULOS_DE_LEADS = [
  "Definição de lead qualificado conforme fontes do setor",
  "Estatísticas sobre conversão de leads qualificados",
  "Passos para gerar leads qualificados",
  "Métricas para avaliar geração de leads",
  "Riscos de comprar listas de leads",
  "Diferença entre lead qualificado e interessado",
];
const META_LEADS = "Entenda o que são leads qualificados, a diferença para leads interessados e como gerá-los com estratégias práticas para clínicas de estética";

test("suites-R1, suites-R7 · o rótulo de tema sai na origem (`radarPendingClaims`): a meta real de leads passa em toda régua, e a afirmação de verdade fica", () => {
  const planta = plantaComLinks([
    [{ claim: ROTULOS_DE_LEADS[0] }], [{ claim: ROTULOS_DE_LEADS[1] }], [{ claim: ROTULOS_DE_LEADS[2] }], [{ claim: ROTULOS_DE_LEADS[3] }],
    [{ claim: ROTULOS_DE_LEADS[4] }, { claim: "Comprar listas pode trazer contatos desatualizados e sem interesse real" }],
    [{ claim: ROTULOS_DE_LEADS[5] }],
  ]);
  const pendentes = radarPendingClaims(null, planta);
  assert.deepEqual(pendentes.map(item => item.texto), ["Comprar listas pode trazer contatos desatualizados e sem interesse real"]);
  for (const comuns of [new Set<string>(), new Set(["lead", "qualificad"])]) {
    assert.equal(radarSentenceNeedsSource(META_LEADS, { pendentes, secao: null, comuns }).needs, false);
  }
  /* O rótulo com fonte do pacote fica: o link existe, e a frase coberta leva a fonte. */
  const comFonte = { ...planta, sources: [{ id: "X1", url: "https://www.gov.br/x", title: "Fonte oficial" }] } as unknown as RadarArticleBlueprintPayload;
  comFonte.blueprint.sections[1].externalLinks[0].source = "X1";
  assert.ok(radarPendingClaims(null, comFonte).some(item => item.texto === ROTULOS_DE_LEADS[1] && item.fonte?.id === "X1"));
});

/* ------------------------------ a pseudo-afirmação: só cabeça de rótulo de lista fechada ------------------------------ */

test("suites-R2, casos-reais-F3 · afirmação normativa e de direção não é rótulo de tema (o link da planta fica e a frase trava)", () => {
  for (const afirmacao of [
    "Resolução do CFM proíbe fotos de antes e depois",
    "Código de Ética Médica veda a promessa de resultado",
    "Perfil da Empresa no Google concentra as buscas locais",
    "Publicidade de procedimentos estéticos segue as regras da Anvisa",
    "Uso de antes e depois sem autorização viola o CFM",
    "Clínicas com perfil completo recebem mais ligações",
    "Leads de anúncios perdem interesse rápido",
    "Conteúdo de bastidores engaja mais seguidores",
    "Queda no alcance orgânico do Instagram",
    "Maior taxa de conversão de leads indicados",
    "Redução do custo por lead com conteúdo",
  ]) {
    assert.equal(radarClaimIsTopicLabel(afirmacao), false, afirmacao);
    assert.equal(radarArticleBlueprintPseudoClaim(afirmacao), false, `reexportada · ${afirmacao}`);
  }
  for (const rotulo of [...ROTULOS_DE_LEADS, "Como gerar leads qualificados", "Boas práticas para captar pacientes", "Passo a passo para otimizar o perfil"]) {
    assert.equal(radarClaimIsTopicLabel(rotulo), true, rotulo);
  }
  /* O efeito na trava: a frase que repete a regra regulatória continua pedindo fonte. */
  const pendentes = radarPendingClaims(null, plantaComLinks([[], [{ claim: "Resolução do CFM proíbe fotos de antes e depois" }]]));
  assert.equal(pendentes.length, 1);
  assert.equal(radarSentenceNeedsSource("O CFM proíbe publicar fotos de antes e depois nas redes sociais da clínica", { pendentes, secao: 1 }).kind, "PLANTA");
});

/* ------------------------------ o objetivo do que se cria: a isenção estreita ------------------------------ */

test("casos-reais-F2, suites-R3 · a isenção do objetivo só vale com verbo de criação e sem número, prazo, comparação, 'faça parte' ou cópula", () => {
  for (const frase of [
    "Aprenda a direcionar o público para canais que convertem, como o site e o WhatsApp.",
    "Como direcionar o público do Instagram para canais que convertem",
    "Saiba como escolher canais que convertem",
    "Faça anúncios que convertem 10 vezes mais",
    "Como criar um site que converte 3 vezes mais visitantes",
    "Aprenda a criar ofertas que lotam a agenda em uma semana",
    "Aprenda a criar anúncios que geram 3 vezes mais pacientes",
    "Monte uma página que converte 30% dos visitantes",
    "Faça parte das clínicas que lotam a agenda com o Instagram",
    "Construir autoridade é o que traz pacientes",
    "Crie conteúdos que convertem mais que os anúncios",
  ]) assert.notEqual(radarPlatformClaimKind(frase), null, frase);
  /* O objetivo do que se cria continua passando (o defeito 7 real). */
  for (const frase of [
    "Promoções para estética: como criar ofertas que atraem pacientes sem desvalorizar a clínica",
    "Aprenda a criar promoções para estética que atraem pacientes sem desvalorizar sua clínica.",
    "Crie conteúdos que convertem visitantes em agendamentos.",
    "Monte uma página de serviço que gera agendamentos.",
    "Produção de conteúdo que atrai pacientes em diferentes estágios da decisão.",
  ]) assert.equal(radarPlatformClaimKind(frase), null, frase);
});

/* ------------------------------ o corte da célula: o "Não cobrir" fica inteiro ------------------------------ */

test("contrato-F1 · a cobrir_e_superar acima do teto dela cede o 'Como superar' de antes; o 'Não cobrir' e a nota da voz ficam inteiros", () => {
  const naoCobrir = [
    "Não cobrir:",
    "- \"Ative o Instagram Shopping\": a voz da marca exclui \"Instagram Shopping\" (seção \"Recursos antigos ou inadequados\" da Skill).",
    "- \"Como prospectar clientes da forma certa\": outro foco; não trata de \"como captar um cliente\".",
  ].join("\n");
  const celula = ["Como superar a SERP:", ...Array.from({ length: 80 }, (_, indice) => `- Movimento ${indice + 1}: aprofunde a seção com um exemplo comentado e um checklist próprio.`), "", naoCobrir].join("\n");
  const cortada = radarWritingCutCell("cobrir_e_superar", celula, 3_000, "Célula cortada no limite de 3.000 caracteres.");
  assert.ok(cortada.length <= 3_000, `${cortada.length}`);
  assert.ok(cortada.endsWith(naoCobrir), cortada.slice(-400));
  assert.ok(cortada.startsWith("Como superar a SERP:\n- Movimento 1:"));
  assert.match(cortada, /\n\[…\] Célula cortada no limite de 3\.000 caracteres\.\nNão cobrir:/);
  /* As outras colunas cortam pelo fim, como antes; abaixo do teto, a célula sai igual. */
  assert.match(radarWritingCutCell("plano_visual", celula, 3_000, "Célula cortada."), /\n\[…\] Célula cortada\.$/);
  assert.equal(radarWritingCutCell("cobrir_e_superar", naoCobrir, 3_000, "x"), naoCobrir);
});

/* ------------------------------ a planta lida: as fixtures (à imagem dos CSVs reais) ------------------------------ */

const linhas = (texto: string) => texto.split("\n");
const candidatoK = (id: string, label: string, role: string, destination: string | null, status: RadarArticleBlueprintLinkCandidate["status"]): RadarArticleBlueprintLinkCandidate =>
  ({ id, label, role, destination, status, fromGraph: false });
const CANDIDATOS: RadarArticleBlueprintLinkCandidate[] = [
  candidatoK("K1", "como atrair um cliente", "Suporte", "/como-atrair-um-cliente", "PLANNED"),
  candidatoK("K2", "captação de pacientes sem tráfego pago", "Suporte", "https://adalbapro.com.br/leads-sem-trafego-pago/captacao-de-pacientes-sem-trafego-pago", "PUBLISHED"),
  candidatoK("K3", "como captar um cliente", "Suporte", "/como-captar-um-cliente", "PLANNED"),
  candidatoK("K6", "Página da marca /servicos/seo-para-clinicas", "Página da marca (Skill de voz)", "https://adalbapro.com.br/servicos/seo-para-clinicas", "PUBLISHED"),
];
const esqueletoM = (id: string, heading: string) => ({
  id, level: 2 as const, parent: null, heading, readerQuestion: null, cover: [], mustCover: false, needsSource: false, needsSpecialist: false, outOfScope: false,
});
function pacote(principal: string, complementares: string[]): RadarArticleBlueprintBrief {
  return {
    article: {
      principal, complementary: complementares.map(keyword => ({ keyword, role: "secundária", volume: 30 })),
      subject: null, intent: "Informacional", funnel: "Topo", siloRole: "Suporte",
      audience: null, promise: null, slug: null, publishedUrl: null, mustCover: [], unit: { type: "article", label: "Artigo", format: null },
    },
    silo: null,
    skeleton: [esqueletoM("M2", "Bio atrativa"), esqueletoM("M4", "Conteúdos relevantes"), esqueletoM("M3", "Hashtags certas")],
    skeletonFrame: { workingTitle: null, promise: null, closing: null },
    evidence: [{ id: "C2", kind: "conceito da amostra", text: "Crie uma bio atrativa (3 de 6 páginas)" }, { id: "P1", kind: "pergunta da amostra", text: "Como atrair clientes?" }],
    linkCandidates: CANDIDATOS, graphLinks: [], sources: [], unsupportedClaims: [], specialist: [], videos: [], outOfScope: [], competitorTitles: [],
    measures: { comparablePages: 6, words: { median: 2869, p25: 2141, p75: 4228 }, h2: 16, h3: 8, paragraphs: 73, images: 24, lists: 3 },
    authors: [], brandVoice: null,
  };
}
type Secao = Record<string, unknown>;
const secaoDe = (h2: string, extra: Secao = {}): Secao => ({
  h2, readerQuestion: `${h2}?`, answerFirst: "Responda a pergunta da seção em uma frase.", from: ["M2"], h3: [], explain: [], paragraphs: 3, bold: [], terms: [],
  evidence: ["C2"], internalLinks: [], externalLinks: [], ...extra,
});
const respostaDe = (sections: Secao[], patch: Secao = {}): Secao => ({
  keywordPlan: { reading: "A principal no H1 e na abertura." },
  reader: "Profissional de clínica de estética que quer atrair pacientes sem anúncios.",
  promise: "Ao final, o leitor sabe o que ajustar para atrair pacientes da região.",
  angle: { statement: "Um checklist de diagnóstico, com exemplo comentado.", evidence: [] },
  title: { h1: "Como atrair pacientes sem anúncios", seoTitle: "Como atrair pacientes sem anúncios", metaDescription: "O que ajustar para atrair pacientes da região." },
  opening: { readerQuestion: "Como atrair pacientes sem anúncios?", direction: "Responder direto.", evidence: ["P1"] },
  sections,
  closing: { turn: "Captação sem anúncios é possível com consistência.", cta: "Fale com a AdalbaPro.", nextStep: null },
  visual: [{ slot: "CAPA", prompt: "consultório organizado, sem texto legível, 16:9" }, { slot: "R1", prompt: "recepção de clínica vazia, 4:3" }, { slot: "R2", prompt: "mapa ilustrado de bairro, em SVG, 4:3" }],
  eeat: [], warnings: [],
  ...patch,
});
/* A planta ANTIGA, como o banco a guarda: a conferência de antes não mexia nas seções, no leitor, na promessa, no título nem no fechamento. */
function plantaAntiga(ia: Secao, brief: RadarArticleBlueprintBrief): RadarArticleBlueprintPayload {
  const { payload } = radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(ia), brief);
  const bruta = RadarArticleBlueprintAiSchema.parse(ia);
  const antiga: RadarArticleBlueprintPayload = {
    ...payload,
    blueprint: { ...payload.blueprint, promise: bruta.promise, reader: bruta.reader, title: bruta.title, closing: bruta.closing, sections: bruta.sections.map(item => ({ ...item, image: null })) },
  };
  delete antiga.rulesVersion;
  return antiga;
}

/* ------------------------------ a demonstração (9) ------------------------------ */

test("casos-reais-F14, suites-R5 · a demonstração: os casos comuns são pegos, a reescrita não quebra o texto e a ação do caso não é resultado", () => {
  for (const [texto, esperado] of [
    ["Demonstração: caso de uma clínica que, depois de otimizar o perfil, recebeu 30% mais ligações", "Demonstração: exemplo ilustrativo de como otimizar o perfil, sem resultado atribuído"],
    ["Exemplo: a clínica X otimizou o perfil e dobrou os agendamentos em três meses", "Exemplo ilustrativo: como otimizar o perfil, sem resultado atribuído"],
    ["Exemplo de clínica que aumentou as avaliações no Google em 3 meses", "Exemplo ilustrativo do ajuste, sem resultado atribuído"],
    ["Demonstração: clínicas que otimizaram o perfil passaram a receber mais ligações", "Demonstração: exemplo ilustrativo de como otimizar o perfil, sem resultado atribuído"],
    ["Mostrar o antes e depois do perfil de uma clínica que lotou a agenda", "Mostrar o antes e depois do perfil de uma clínica (exemplo ilustrativo, sem resultado atribuído)"],
    /* o caso real (CSV de captação) continua igual */
    ["Demonstração: exemplo de um consultório que otimizou o perfil do Google e passou a receber mais ligações; mostrar antes e depois das configurações.", "Demonstração: exemplo ilustrativo de como otimizar o perfil do Google, sem resultado atribuído; mostrar antes e depois das configurações."],
  ] as const) {
    assert.equal(radarArticleBlueprintAttributedResult(texto), true, texto);
    assert.equal(radarArticleBlueprintPracticalWithoutResult(texto), esperado, texto);
  }
  /* A AÇÃO do caso ("aumentou o orçamento", "aumentou a frequência de posts") não é resultado: o texto fica igual. */
  for (const texto of [
    "Checklist: o que uma clínica que aumentou o orçamento de anúncios deve revisar",
    "Comparação entre um perfil que aumentou a frequência de posts e outro que manteve",
  ]) {
    assert.equal(radarArticleBlueprintAttributedResult(texto), false, texto);
    assert.equal(radarArticleBlueprintPracticalWithoutResult(texto), texto);
  }
});

/* ------------------------------ o segundo público (12) ------------------------------ */

test("casos-reais-F15 · o efeito para o negócio com o paciente como sujeito não é segundo leitor; a ação de compra ou busca é", () => {
  for (const texto of [
    "O artigo mostra como pedir indicações, e pacientes que já foram atendidos passam a indicar a clínica com mais facilidade.",
    "O artigo mostra como montar a oferta sem perder margem, e clientes que voltam recebem um benefício claro.",
  ]) {
    assert.equal(radarArticleBlueprintSecondAudience(texto, { business: true }), null, texto);
    assert.equal(radarArticleBlueprintWithoutSecondAudience(texto, { business: true }), texto);
  }
  /* Os casos reais de promoções continuam. */
  assert.equal(radarArticleBlueprintSecondAudience("Profissionais de clínicas de estética que buscam criar promoções eficazes, e pacientes que procuram ofertas confiáveis."), "e pacientes que procuram ofertas confiáveis");
  assert.equal(radarArticleBlueprintSecondAudience("O artigo mostra como criar ofertas, e como pacientes podem encontrar descontos seguros.", { business: true }), "e como pacientes podem encontrar descontos seguros");
  /* No título: "para clínicas e pacientes" perde o consumidor. */
  assert.equal(radarArticleBlueprintTitleWithoutSecondAudience("Promoções estética: guia prático para clínicas e pacientes"), "Promoções estética: guia prático para clínicas");
  assert.equal(radarArticleBlueprintTitleWithoutSecondAudience("Promoções de estética: ideias e critérios para não perder margem"), "Promoções de estética: ideias e critérios para não perder margem");
});

/* ------------------------------ a planta antiga de promoções: título, seção do cupom e virada ------------------------------ */

const LEITOR_PROMOCOES = "Profissionais de clínicas de estética que buscam criar promoções eficazes sem desvalorizar seus serviços, e pacientes que procuram ofertas confiáveis.";
const PROMESSA_PROMOCOES = "Cobrir com clareza o tema “promoções para estética”, mostrando como criar ofertas que atraem pacientes sem destruir a margem, e como pacientes podem encontrar descontos seguros.";
const VIRADA_PROMOCOES = "Promoções para estética podem funcionar se forem planejadas com critério, focando em valor e no paciente certo. O próximo passo é avaliar sua presença digital e considerar uma consultoria especializada.";
const iaDePromocoes = () => respostaDe([
  secaoDe("O erro é usar desconto como resposta para tudo em promoções para estética", { readerQuestion: "Por que descontos genéricos não funcionam para clínicas de estética?" }),
  secaoDe("Ideias de promoções de estética com mais critério comercial", {
    readerQuestion: "Quais promoções funcionam para clínicas de estética sem desvalorizar o serviço?",
    h3: ["Pacotes de tratamento com preço fechado", "Como criar promoções sem desvalorizar a clínica"],
  }),
  secaoDe("Site de promoções estetica: onde encontrar ofertas confiáveis", {
    readerQuestion: "Quais sites de promoções de estética são confiáveis?",
    answerFirst: "Sites como Magote, UvaRosa e Cuponeria oferecem ofertas, mas é preciso verificar a reputação da clínica e as condições do cupom.",
    h3: ["Plataformas de ofertas e cupons", "Critérios para avaliar uma oferta"],
    explain: ["Verifique avaliações, localização e termos do cupom antes de comprar.", "Desconfie de descontos extremos que podem indicar baixa qualidade.", "Uma oferta clara mostra o que está incluído no pacote."],
  }),
  secaoDe("Como criar promoções sem desvalorizar a clínica", { readerQuestion: "Como estruturar uma promoção que não prejudique a imagem da clínica?" }),
], {
  reader: LEITOR_PROMOCOES,
  promise: PROMESSA_PROMOCOES,
  title: {
    h1: "Promoções para estética: como criar ofertas que atraem pacientes sem desvalorizar a clínica",
    alternatives: ["Promoções estética: guia prático para clínicas e pacientes", "Promoções de estética: ideias e critérios para não perder margem"],
    seoTitle: "Promoções para Estética: Guia Prático para Clínicas",
    metaDescription: "Aprenda a criar promoções para estética que atraem pacientes sem desvalorizar sua clínica.",
  },
  closing: { turn: VIRADA_PROMOCOES, cta: "Antes da próxima promoção, observe se sua divulgação explica o que está sendo contratado.", nextStep: "Acesse a página de SEO para clínicas e agende uma conversa." },
});
const pacoteDePromocoes = () => pacote("promoções estética", ["promoções para estética", "site de promoções estetica"]);

test("casos-reais-F4 · um CTA só, também na virada: a frase que chama sai do fechamento quando há CTA", () => {
  assert.equal(radarArticleBlueprintTurnWithoutCall(VIRADA_PROMOCOES), "Promoções para estética podem funcionar se forem planejadas com critério, focando em valor e no paciente certo.");
  assert.equal(radarArticleBlueprintTurnWithoutCall("O próximo passo é falar com um especialista."), RADAR_ARTICLE_BLUEPRINT_TURN_WITHOUT_CALL);
  const virada = "O Instagram pode ser um aliado, mas não é a solução completa. O jogo maduro é construir uma captação própria, com site e presença no Google.";
  assert.equal(radarArticleBlueprintTurnWithoutCall(virada), virada, "a virada que retoma a tese fica igual");

  const colunas = radarArticleBlueprintColumns(plantaAntiga(iaDePromocoes(), pacoteDePromocoes()), null, null, null, {
    specialistCta: "\"Baixar o preço de novo pode doer.\" (E1; atribuir como fala do especialista)",
    continuation: null,
  });
  /* Na conferência da planta nova também: a virada e as alternativas saem corrigidas, com nota que não pede ação. */
  const nova = radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(iaDePromocoes()), pacoteDePromocoes());
  assert.equal(nova.payload.blueprint.closing.turn, "Promoções para estética podem funcionar se forem planejadas com critério, focando em valor e no paciente certo.");
  assert.deepEqual(nova.payload.blueprint.title.alternatives, ["Promoções estética: guia prático para clínicas", "Promoções de estética: ideias e critérios para não perder margem"]);
  const corrigidas = nova.notes.filter(nota => /^Um CTA só: a frase do fechamento|^Um leitor só: o título/.test(nota));
  assert.equal(corrigidas.length, 2, nova.notes.join("\n"));
  assert.equal(radarArticleBlueprintPendingNotes(corrigidas).pending.length, 0, "correção aplicada: não paga passada de correção");
  const fechamento = linhas(colunas.estrutura).find(linha => linha.startsWith("Fechamento:"))!;
  assert.equal(fechamento, "Fechamento: Promoções para estética podem funcionar se forem planejadas com critério, focando em valor e no paciente certo.");
  assert.doesNotMatch(colunas.estrutura, /próximo passo é|considerar uma consultoria|^Próximo passo:/m);
  assert.equal((colunas.estrutura.match(/^CTA/gm) || []).length, 1);
});

test("casos-reais-F5 · um leitor só no CSV de promoções: a alternativa perde o público duplo e a seção do cupom não se contradiz", () => {
  const colunas = radarArticleBlueprintColumns(plantaAntiga(iaDePromocoes(), pacoteDePromocoes()));
  assert.ok(linhas(colunas.titulo_e_seo).includes("Alternativas: Promoções estética: guia prático para clínicas · Promoções de estética: ideias e critérios para não perder margem"), colunas.titulo_e_seo);
  assert.doesNotMatch(colunas.titulo_e_seo, /e pacientes/);
  const guia = colunas.estrutura.split("\n## ").find(item => item.startsWith("Site de promoções estetica"))!;
  assert.ok(linhas(guia).includes("- Pergunta do leitor: Quais sites de promoções de estética são confiáveis? (responda do ponto de vista de quem vende: o que a clínica ganha e perde com isso, não como quem compra escolhe)"), guia);
  assert.ok(linhas(guia).includes("- Explicar: Verifique avaliações, localização e termos do cupom antes de comprar. — reescreva para a clínica: o que isso muda para quem anuncia, não um conselho a quem compra."), guia);
  assert.ok(linhas(guia).includes("- Explicar: Desconfie de descontos extremos que podem indicar baixa qualidade. — reescreva para a clínica: o que isso muda para quem anuncia, não um conselho a quem compra."), guia);
  assert.ok(linhas(guia).includes("- Explicar: Uma oferta clara mostra o que está incluído no pacote."), "a linha que não orienta a compra fica igual");
  assert.match(guia, /^- Abre respondendo: Sites como Magote.* — reescreva para a clínica: /m);
  /* As outras seções não ganham nada. */
  const ideias = colunas.estrutura.split("\n## ").find(item => item.startsWith("Ideias de promoções"))!;
  assert.doesNotMatch(ideias, /reescreva para|ponto de vista de quem vende/);
});

/* ------------------------------ o Redator lê a mesma planta (F12, contrato-F4, R7) ------------------------------ */

const secoesDeLeads = (): Secao[] => [
  secaoDe("O que é um lead qualificado?", {
    readerQuestion: "O que caracteriza um lead qualificado?",
    externalLinks: [{ claim: ROTULOS_DE_LEADS[0], sourceType: "oficial", source: null }],
  }),
  secaoDe("Geração de leads qualificados: como medir resultados", {
    readerQuestion: "Como medir a geração de leads qualificados?",
    explain: ["Meça a geração de leads qualificados acompanhando métricas como taxa de conversão, custo por lead e origem dos leads."],
    externalLinks: [{ claim: ROTULOS_DE_LEADS[3], sourceType: "oficial", source: null }],
  }),
  secaoDe("Lista de leads qualificados: o que é e como usar", {
    readerQuestion: "O que é uma lista de leads qualificados e como posso utilizá-la?",
    h3: ["Riscos de comprar listas", "Lead qualificado vs. lead interessado: entenda a diferença"],
    externalLinks: [{ claim: ROTULOS_DE_LEADS[4], sourceType: "oficial", source: null }, { claim: "Comprar listas pode trazer contatos desatualizados e sem interesse real", sourceType: "oficial", source: null }],
  }),
  secaoDe("Lead qualificado vs. lead interessado: entenda a diferença", {
    readerQuestion: "Qual a diferença entre lead qualificado e lead interessado?",
    externalLinks: [{ claim: ROTULOS_DE_LEADS[5], sourceType: "oficial", source: null }],
  }),
];

test("casos-reais-F12, contrato-F4, suites-R7 · o Redator recebe a mesma planta lida que o CSV: sem rótulo como 'precisa de fonte', sem moldura, sem público duplo, sem H3 repetido e sem segunda chamada", () => {
  const leads = plantaAntiga(respostaDe(secoesDeLeads()), pacote("leads qualificados", ["gerar leads qualificados"]));
  const doRedator = writerArticleBlueprintForWriting({ id: "bp-1", versionNumber: 1, approvedAt: "2026-10-08T12:00:00Z", blueprint: leads.blueprint, plan: null, linkCandidates: leads.linkCandidates, brandVoice: null })!;
  const marcadas = (doRedator.sections || []).flatMap(secao => (secao.needsSource || []).map(item => item.sentence));
  for (const rotulo of ROTULOS_DE_LEADS) assert.equal(marcadas.includes(rotulo), false, `${rotulo}\n${marcadas.join("\n")}`);
  assert.ok(marcadas.includes("Comprar listas pode trazer contatos desatualizados e sem interesse real"), marcadas.join("\n"));
  assert.ok(!marcadas.includes("Meça a geração de leads qualificados acompanhando métricas como taxa de conversão, custo por lead e origem dos leads."), "a frase que o CSV deixa livre também fica livre no Redator");
  assert.deepEqual(doRedator.sections[2].h3, ["Riscos de comprar listas"], "o H3 que repete o H2 de outra seção sai");

  const promocoes = plantaAntiga(iaDePromocoes(), pacoteDePromocoes());
  const doRedatorP = writerArticleBlueprintForWriting({ id: "bp-2", versionNumber: 1, approvedAt: "2026-10-08T12:00:00Z", blueprint: promocoes.blueprint, plan: null, linkCandidates: promocoes.linkCandidates, brandVoice: null })!;
  assert.equal(doRedatorP.promise, "O artigo mostra como criar ofertas que atraem pacientes sem destruir a margem.");
  assert.equal(doRedatorP.reader, "Profissionais de clínicas de estética que buscam criar promoções eficazes sem desvalorizar seus serviços.");
  assert.equal(doRedatorP.closing?.nextStep, null, "um CTA só: o próximo passo que chama não é segunda chamada");
  /* O próximo passo que só aponta a leitura seguinte fica (o Redator não tem a continuação no corpo). */
  const comLeitura = { ...promocoes.blueprint, closing: { ...promocoes.blueprint.closing, nextStep: "Ler o guia: como captar um cliente" } };
  assert.equal(writerArticleBlueprintForWriting({ id: "bp-3", versionNumber: 1, approvedAt: null, blueprint: comLeitura, plan: null, linkCandidates: [], brandVoice: null })?.closing?.nextStep, "Ler o guia: como captar um cliente");
  assert.equal(doRedatorP.closing?.turn, "Promoções para estética podem funcionar se forem planejadas com critério, focando em valor e no paciente certo.");
  /* O CSV diz o mesmo da mesma planta. */
  const colunas = radarArticleBlueprintColumns(promocoes);
  assert.ok(linhas(colunas.promessa_e_leitor).includes(`Leitor: ${doRedatorP.reader}`));
  assert.ok(colunas.promessa_e_leitor.includes(`Promessa: ${doRedatorP.promise}`), colunas.promessa_e_leitor);
  /* A fatia do MCP lê pela mesma função, e a regra da leitura entra no etag. */
  /* 2026-10-09b · a leitura passou a ser a do CSV (fontes reais, exclusões do ArticleDNA, continuação opcional): o etag muda com ela. */
  assert.equal(WRITER_BLUEPRINT_READING_RULES, "2026-10-09b");
  const fatia = writerBlueprintWithCurrentNames(promocoes.blueprint) as RadarArticleBlueprintPayload["blueprint"];
  assert.equal(fatia.promise, doRedatorP.promise);
  /* A planta que já segue as regras volta como o MESMO objeto. */
  const limpa = radarArticleBlueprintReading(RadarArticleBlueprintAiSchema.parse(respostaDe([secaoDe("Bio que diz onde atende"), secaoDe("Conteúdo que responde dúvidas"), secaoDe("Leve o seguidor ao contato")])));
  assert.equal(radarArticleBlueprintReading(limpa.blueprint).blueprint, limpa.blueprint);
});

/* ------------------------------ H2 sobrepostos (11) e a leitura seguinte (10) ------------------------------ */

test("casos-reais-F8 · as seções legítimas das plantas reais não viram 'H2 sobrepostos' (a retomada por coesão e o H3 de contexto não cobrem o título)", () => {
  /* captar: a seção seguinte retoma o perfil definido antes; o "cliente ideal" não está nela. */
  const comunsCaptar = new Set(radarSemanticStems("como captar um cliente como captar clientes o que considerar sobre o que o artigo precisa cobrir"));
  const captar = [
    { h2: "Defina o perfil do seu cliente ideal", h3: ["Identifique os principais problemas dos seus clientes", "O que analisar para prospectar e reter clientes", "Exemplo prático: perfil para clínica de estética"], explain: ["Liste características demográficas, comportamentais e dores do cliente.", "Entenda os problemas que seu produto ou serviço resolve.", "Analise dados de clientes atuais para encontrar padrões."], terms: ["persona", "segmentação", "dores do cliente"] },
    { h2: "Como conquistar um cliente na primeira abordagem", h3: ["O que falar para atrair clientes", "Adapte a abordagem ao perfil", "Exemplo de script natural"], explain: ["Use perguntas abertas para descobrir a dor do cliente.", "Personalize a mensagem com base no perfil definido.", "Um script natural ajuda a guiar a conversa sem parecer robótico."], terms: ["escuta ativa", "personalização", "rapport"] },
  ];
  assert.deepEqual(radarArticleBlueprintOverlappingSections(captar, comunsCaptar), []);
  /* captação: "Erros comuns a evitar" no Instagram não trata a seção de erros da captação. */
  const comunsCaptacao = new Set(radarSemanticStems("captação de pacientes dentista captação de pacientes sem tráfego pago empresa de captação de pacientes tráfego orgânico como fazer o que considerar sobre o que o artigo precisa cobrir"));
  const captacao = [
    { h2: "Tráfego orgânico no Instagram e TikTok para dentistas", h3: ["Formatos de conteúdo que funcionam", "Como aumentar o alcance orgânico", "Erros comuns a evitar"], explain: ["Vídeos curtos com dicas de saúde bucal têm bom desempenho.", "Use hashtags relevantes e publique consistentemente.", "Evite conteúdo excessivamente promocional."], terms: ["Instagram", "TikTok", "engajamento"] },
    { h2: "Erros comuns na captação de pacientes sem tráfego pago", h3: ["Achar que tráfego pago resolve tudo", "Não otimizar o site para SEO", "Não acompanhar métricas"], explain: ["Tráfego pago é complementar, não substitui uma base orgânica.", "Sem SEO, o site não aparece nas buscas relevantes.", "Sem métricas, não é possível ajustar a estratégia."], terms: ["tráfego pago", "otimização"] },
  ];
  assert.deepEqual(radarArticleBlueprintOverlappingSections(captacao, comunsCaptacao), []);
  /* O par real que se sobrepõe continua: o corpo das estratégias já trata o Instagram e o TikTok. */
  const estrategias = { h2: "Estratégias de tráfego orgânico para captação de pacientes na odontologia", h3: ["Marketing de conteúdo para dentistas", "Redes sociais orgânicas"], explain: ["Use Instagram e TikTok para mostrar bastidores e dicas."], terms: ["blog"] };
  assert.deepEqual(radarArticleBlueprintOverlappingSections([estrategias, captacao[0]], comunsCaptacao).map(item => item.kind), ["BODY_COVERS"]);
});

test("casos-reais-F16 · sem link aprovado, a leitura seguinte vai à última seção que trata do destino; a palavra que está no Silo todo ('pacientes') não basta", () => {
  const ia = respostaDe([
    secaoDe("O que é um lead qualificado?", { explain: ["Um lead qualificado tem chance real de virar paciente."] }),
    secaoDe("Onde os leads aparecem: site, Google e Instagram", { explain: ["Use o Instagram como vitrine e leve o seguidor ao site."] }),
    secaoDe("Geração de leads qualificados: como medir resultados", { explain: ["Acompanhe quantos leads se tornam pacientes e de onde eles vêm."] }),
    secaoDe("Lista de leads qualificados: o que é e como usar", { explain: ["Uma lista própria de pacientes atendidos vale mais que uma lista comprada."] }),
  ]);
  const colunas = radarArticleBlueprintColumns(plantaAntiga(ia, pacote("leads qualificados", ["gerar leads qualificados"])), null, null, null, {
    principal: "leads qualificados",
    continuation: { kind: "article", label: "instagram não traz pacientes", articleId: "a-instagram", slug: "instagram-nao-traz-pacientes", names: ["instagram não traz pacientes"] },
  });
  const secoes = colunas.estrutura.split("\n## ");
  const onde = secoes.findIndex(secao => linhas(secao).some(linha => linha.startsWith("- Leitura seguinte")));
  assert.ok(secoes[onde].startsWith("Onde os leads aparecem: site, Google e Instagram"), secoes[onde]);
  assert.equal((colunas.estrutura.match(/^- Leitura seguinte/gm) || []).length, 1);
});

/* ------------------------------ 3(a): a régua alinhada à da guarda ------------------------------ */

test("casos-reais-F6, contrato-F3, casos-reais-F7 · o 3(a): palavra de modo não distingue, a raiz única só vale num título (ou a expressão inteira), verbo comum nunca basta", () => {
  /* A planta real de captar (H2, H3, termos e "Explicar" do CSV de 09/10). */
  const captar = {
    blueprint: {
      opening: { readerQuestion: "Como captar um cliente de forma consistente?" },
      sections: [
        { h2: "Como captar clientes: estratégias práticas", readerQuestion: "Quais estratégias práticas posso usar?", answerFirst: "Comece pelas indicações.", h3: ["Peça indicações para clientes atuais", "Use ferramentas para facilitar a prospecção"], explain: ["Ferramentas como CRM ajudam a organizar contatos e follow-up."], terms: ["prospecção ativa", "prospecção passiva", "follow-up"], bold: [] },
        { h2: "Como conquistar os clientes e fidelizar", readerQuestion: "Como fidelizar?", answerFirst: "Personalize.", h3: ["Personalize a experiência do cliente"], explain: ["A personalização faz o cliente se sentir único e valorizado."], terms: ["retenção"], bold: [] },
        { h2: "Como conquistar clientes novos com prospecção ativa", readerQuestion: "Como prospectar ativamente?", answerFirst: "Liste os contatos.", h3: ["Canais para prospecção ativa"], explain: [], terms: [], bold: [] },
      ],
    },
  } as unknown as RadarArticleBlueprintPayload;
  const nucleoCaptar = ["como captar um cliente", "como conquistar os clientes", "como ganhar clientes", "como captar clientes"];
  const trataCaptar = radarWritingReferenceTreats(radarWritingReferenceTexts(captar, null), nucleoCaptar);
  assert.equal(trataCaptar("Como prospectar clientes da forma certa"), true, "a planta trata prospecção: o item genérico sai");
  assert.equal(trataCaptar("O que faz um captador de clientes?"), false, "'faz' (verbo comum) de passagem não trata; 'captador' não está na planta");
  /* Com o captador num H3 (a planta do teste do export), o mesmo item sai. */
  const comCaptador = { blueprint: { ...captar.blueprint, sections: [...captar.blueprint.sections, { h2: "Quem capta", readerQuestion: "Quem capta?", answerFirst: "", h3: ["O que faz um captador de clientes"], explain: [], terms: [], bold: [] }] } } as unknown as RadarArticleBlueprintPayload;
  assert.equal(radarWritingReferenceTreats(radarWritingReferenceTexts(comCaptador, null), nucleoCaptar)("O que faz um captador de clientes?"), true);
  /* Instagram: "vende" de passagem num H3-metáfora não trata "vender muito no Instagram". */
  const instagram = { blueprint: { opening: { readerQuestion: "" }, sections: [{ h2: "Instagram não traz pacientes quando…", readerQuestion: "", answerFirst: "", h3: ["O guru vende frequência; a clínica paga com cansaço"], explain: [], terms: [], bold: [] }] } } as unknown as RadarArticleBlueprintPayload;
  assert.equal(radarWritingReferenceTreats(radarWritingReferenceTexts(instagram, null), ["como atrair clientes pelo instagram", "instagram não traz pacientes"])("O que fazer para vender muito no Instagram?"), false);
  /* Tráfego: "redes sociais" num "Explicar" não trata "Tráfego social". */
  const trafego = { blueprint: { opening: { readerQuestion: "" }, sections: [{ h2: "A diferença real entre tráfego pago e orgânico", readerQuestion: "", answerFirst: "", h3: [], explain: ["Anúncios no Google e nas redes sociais segmentam por localização e interesse."], terms: [], bold: [] }] } } as unknown as RadarArticleBlueprintPayload;
  assert.equal(radarWritingReferenceTreats(radarWritingReferenceTexts(trafego, null), ["tráfego pago vs orgânico para clínica de estética"])("Tráfego social"), false);
  /* Leads: a EXPRESSÃO inteira na resposta trata ("custo por lead"). */
  const leads = { blueprint: { opening: { readerQuestion: "" }, sections: [{ h2: "Geração de leads qualificados: como medir resultados", readerQuestion: "", answerFirst: "Meça a geração de leads qualificados acompanhando métricas como taxa de conversão, custo por lead e origem dos leads.", h3: [], explain: [], terms: [], bold: [] }] } } as unknown as RadarArticleBlueprintPayload;
  assert.equal(radarWritingReferenceTreats(radarWritingReferenceTexts(leads, null), ["leads qualificados", "gerar leads qualificados"])("Custo por Lead (CPL)"), true);
});

/* ------------------------------ o ruído da pesquisa (13) ------------------------------ */

const OFICIAL = "domínio oficial ou regulador";
const citadaOficial = (title: string, url: string, supports: string[] = []): RadarMarketCitation => ({ title, url, domain: new URL(url).hostname, authorityClass: OFICIAL, supports });

test("suites-R4 · a fonte regulatória que nomeia o INSTRUMENTO (lei, resolução, RDC, código, manual) é decidida pela seção, como antes; a CVM continua saindo", () => {
  const promocoes: RadarResearchNoiseContext = { core: ["promoções para estética", "promoções estética"], topics: ["Cuidados legais nas promoções de estética"] };
  for (const [titulo, url, secao] of [
    ["Código de Defesa do Consumidor", "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm", "Cuidados legais nas promoções de estética"],
    ["Lei nº 8.078", "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm", "Cuidados legais nas promoções de estética"],
    ["RDC nº 96/2008", "https://bvsms.saude.gov.br/bvs/saudelegis/anvisa/2008/res0096_17_12_2008.html", "Regras de publicidade para clínicas de estética"],
  ] as const) assert.equal(radarMarketCitationNoiseReason(citadaOficial(titulo, url, [secao]), promocoes), null, titulo);
  assert.equal(radarMarketCitationNoiseReason(citadaOficial("Resolução CFM 2.336/2023", "https://sistemas.cfm.org.br/normas/visualizar/resolucoes/BR/2023/2336", ["O que o CFM permite na publicidade médica"]), { core: ["marketing médico"], topics: ["O que o CFM permite na publicidade médica"] }), null);
  assert.equal(radarMarketCitationNoiseReason(citadaOficial("Manual de publicidade médica", "https://www.gov.br/saude/pt-br/manual-publicidade", ["Como divulgar o consultório sem infringir regras"]), { core: ["captação de pacientes"], topics: ["Como divulgar o consultório sem infringir regras"] }), null);
  /* O instrumento citado numa seção que não toca o tema continua saindo; a CVM (órgão, sem instrumento) também. */
  assert.notEqual(radarMarketCitationNoiseReason(citadaOficial("Lei nº 8.078", "https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm", ["Fale com o contador"]), promocoes), null);
  const atrair: RadarResearchNoiseContext = { core: ["como atrair um cliente"], topics: ["Como atrair clientes?"] };
  assert.equal(radarMarketCitationNoiseReason(citadaOficial("CVM", "https://www.gov.br/cvm/pt-br", ["Como atrair clientes"]), atrair), "oficial fora do tema");
});

test("casos-reais-F10 · a página de login e a carta do SPC Brasil (CSV real de captar) saem como ruído", () => {
  const captar: RadarResearchNoiseContext = { core: ["como captar um cliente", "como captar clientes"], topics: ["Como captar clientes"] };
  const citada = (title: string, url: string): RadarMarketCitation => ({ title, url, domain: new URL(url).hostname, authorityClass: "site de mercado", supports: ["Como captar clientes"] });
  assert.notEqual(radarMarketCitationNoiseReason(citada("Sistema SPC Brasil", "https://sistema.spc.org.br/spc/controleacesso/autenticacao/entry.action"), captar), null);
  assert.notEqual(radarMarketCitationNoiseReason(citada("Recebeu uma carta do SPC Brasil?", "https://sistema.spc.org.br/spc/notificacao/notificacaoInit.action"), captar), null);
  /* Num artigo sobre crédito e inadimplência, o SPC é assunto. */
  assert.equal(radarMarketCitationNoiseReason(citada("Recebeu uma carta do SPC Brasil?", "https://sistema.spc.org.br/spc/notificacao/notificacaoInit.action"), { core: ["como consultar o crédito de um cliente"], topics: ["Inadimplência"] }), null);
});

/* ------------------------------ a voz da marca (5) ------------------------------ */

test("casos-reais-F17 · a exclusão da voz guarda a condição da Skill, não casa 'atividades' e reconhece os outros nomes do Instagram Shopping", () => {
  const exclusoes = radarBrandVoiceExclusions({
    sections: [{
      heading: "Recursos antigos ou inadequados",
      body: [
        "Não recomendar Instagram Shopping, ativação de loja ou tutoriais de configuração desse recurso nos artigos deste projeto. Essa é uma exclusão editorial determinada pelo proprietário, não uma afirmação de encerramento universal do produto.",
        "",
        "Não transportar conselhos de lojas virtuais para consultórios automaticamente. Venda de produto e agendamento de atendimento são objetivos diferentes.",
      ].join("\n"),
    }],
  });
  const qual = (texto: string) => radarBrandVoiceExclusionOf(texto, exclusoes)?.label ?? null;
  /* A condição ("automaticamente"): o texto sobre produto não é o conselho transportado. */
  assert.equal(qual("e-commerce de dermocosméticos"), null);
  assert.equal(qual("Venda de produtos próprios na loja virtual da clínica"), null);
  assert.equal(qual("Dicas de e-commerce para vender mais"), "conselhos de lojas virtuais", "o conselho de e-commerce transportado continua fora");
  /* A raiz de "ativação" não casa "atividades". */
  assert.equal(qual("Atividades da loja de cosméticos da clínica"), null);
  assert.equal(qual("Ative a loja do Instagram"), "ativação de loja", "o nome dito vence o sinônimo");
  /* Os tutoriais do recurso excluído, pelos outros nomes. */
  for (const tutorial of ["Crie uma loja no Instagram", "Marque produtos nos posts do Instagram", "Configure a sacola do Instagram", "Monte o catálogo do Instagram"]) {
    assert.equal(qual(tutorial), "Instagram Shopping", tutorial);
  }
  for (const livre of ["Como atrair clientes pelo Instagram", "Use os Destaques do Instagram", "Marque a localização da clínica nos posts"]) assert.equal(qual(livre), null, livre);
});

/* ------------------------------ o aviso das regras (F13, contrato-F5, R6) ------------------------------ */

test("casos-reais-F13, contrato-F5, suites-R6 · o aviso do painel diz o que falta pela versão gravada: a planta de 08/10 não é chamada de 'sem página publicada'", () => {
  const de0810 = radarArticleBlueprintRulesNoticeText({ rulesVersion: "2026-10-08" })!;
  assert.match(de0810, /^Esta versão foi montada com as regras de 2026-10-08\. As de 2026-10-09 acrescentam a conferência do rótulo de tema/);
  assert.match(de0810, /Os entregáveis \(CSV para escrever, CSV de vídeo e Redator\) já aplicam essas correções ao ler esta versão/);
  assert.doesNotMatch(de0810, /não leu a página publicada|nem conferiu a abertura/);
  const semVersao = radarArticleBlueprintRulesNoticeText({})!;
  /* 2026-10-09b · as regras avançaram (Amazon congelada e exclusões dos reajustes): a de 09/10 também ganha o aviso, que diz só o que 09b acrescenta. */
  assert.match(semVersao, /^Esta versão foi montada com regras anteriores às atuais \(2026-10-09b\): a planta não leu a página publicada/);
  const de0910 = radarArticleBlueprintRulesNoticeText({ rulesVersion: "2026-10-09" })!;
  assert.match(de0910, /^Esta versão foi montada com as regras de 2026-10-09\. As de 2026-10-09b acrescentam o bloco comercial da Amazon congelada/);
  assert.doesNotMatch(de0910, /não leu a página publicada|rótulo de tema/);
  assert.equal(radarArticleBlueprintRulesNoticeText({ rulesVersion: "2026-10-09b" }), null);
  const tela = renderToStaticMarkup(createElement(RadarArticleBlueprintRulesNotice, { payload: { rulesVersion: "2026-10-08" } }));
  assert.match(tela, /data-testid="radar-article-blueprint-rules-outdated"/);
  assert.match(tela, /montada com as regras de 2026-10-08/);
  assert.doesNotMatch(tela, /<button/);
  assert.doesNotMatch(`${de0810} ${semVersao} ${de0910}`, D10);
});

test("sentinela: nenhuma ida ao servidor", () => {
  assert.deepEqual(idasAoServidor, []);
});
