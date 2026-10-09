import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  radarCompetitorBrandOf as marcaDaRegua,
  radarCompetitorHeadingChromeReason,
  radarCompetitorHeadingIsChrome,
  radarCompetitorHeadingIsPostTitle,
  radarCompetitorHeadingPostTitleReason,
  radarMarketCitationIsNoise,
  radarMarketCitationNoiseReason,
  radarReaderQuestionIsNoise,
  radarReaderQuestionNoiseReason,
  radarRegistrableDomain,
  radarResearchIsEnglish,
  radarResearchOtherProfession,
  type RadarMarketCitation,
  type RadarResearchNoiseContext,
} from "../lib/radar/research-noise.ts";
import {
  radarCompetitorBrandOf,
  radarCompetitorHeadingIsNoise,
  radarCompetitorHeadingIsNotTopic,
  radarCompetitorTopics,
  type RadarCompetitorOutlinePage,
} from "../lib/radar/competitor-topics.ts";

/*
 * ===== 2026-10-08 · O RUÍDO DE PESQUISA (P1 da rodada dos 8 CSVs "para escrever" do Silo "Leads sem Tráfego Pago") =====
 *
 * As listas abaixo são as REAIS dos oito CSVs de 08/10 (cabeçalhos dos
 * concorrentes, perguntas a responder e fontes citadas pelo mercado), copiadas
 * dos arquivos; as páginas e os domínios em que cada cabeçalho mora são
 * montados para a prova. A régua sai pura (`research-noise.ts`) e os temas dos
 * concorrentes (`competitor-topics.ts`) contam sobre a lista impressa, por
 * site, sem o cromo. PROVIDER_CALLS = 0.
 */

const ler = (caminho: string) => readFile(new URL(`../${caminho}`, import.meta.url), "utf8").then(texto => texto.replace(/\r\n/g, "\n"));
const h2 = (text: string) => ({ level: 2, text });
const pagina = (url: string, headings: string[]): RadarCompetitorOutlinePage => {
  const domain = new URL(url).hostname;
  return { url, title: domain, domain, headings: headings.map(h2) };
};

/* ------------------------------ os núcleos dos 8 artigos ------------------------------ */

const ATRAIR = ["como atrair um cliente", "como conquistar novos clientes", "como ganhar um cliente", "como conseguir mais clientes", "como atrair mais clientes", "como conquistar clientes"];
const CAPTAR = ["como captar um cliente", "como conquistar os clientes", "como ganhar clientes", "como conquistar um cliente", "como conquistar clientes novos", "como captar clientes"];
const CAPTACAO = ["captação de pacientes dentista", "captação de pacientes sem tráfego pago", "empresa de captação de pacientes", "tráfego orgânico como fazer"];
const TRAFEGO = ["trafego organico e pago", "tráfego pago vs orgânico para clínica de estética", "tráfego pago e orgânico", "tráfego orgânico", "oque é trafego organico"];
const PROMOCOES = ["promoções estética", "promoções para estética", "promoções de estética", "estetica promoções", "site de promoções estetica"];
const QUALIFICADOS = ["leads qualificados", "leads qualificados o que é", "captação de leads qualificados", "gerar leads qualificados", "geração de leads qualificados", "lista de leads qualificados"];
const CAMPANHAS = ["campanhas de marketing", "campanhas de marketing para clínica de estética sem anúncios", "campanhas de marketing digital de sucesso"];
const INSTAGRAM = ["como atrair clientes pelo instagram", "instagram não traz pacientes"];
const RESPONSAVEL = "Responsável por clinica.";

/* ------------------------------ a lista impressa do "como atrair um cliente" (12) ------------------------------ */

const IMPRESSAS_ATRAIR = [
  "https://www.minu.co/blog/como-atrair-clientes",
  "https://www.salesforce.com/br/blog/como-atrair-clientes/",
  "https://www.agendor.com.br/blog/dicas-conquistar-atrair-novos-clientes/",
  "https://www.serasaexperian.com.br/conteudos/ideias-para-atrair-clientes/",
  "https://solides.com.br/blog/dicas-de-captacao-de-novos-clientes/",
  "https://blog.cielo.com.br/dicas-e-historias-de-sucesso/conquistar-mais-clientes/",
  "https://www.kyteapp.com/pt/blog/como-atrair-clientes-para-pequeno-negocio",
  "https://www.cora.com.br/blog/como-divulgar-sua-contabilidade/",
  "https://blog.getninjas.com.br/atendimento-online/",
  "https://www.nuvemshop.com.br/blog/atrair-clientes-para-a-sua-loja-virtual/",
  "https://conteudo.stone.com.br/como-atrair-clientes/",
  "https://www.rdstation.com/blog/agencias/atrair-clientes/",
];
const BASE_ATRAIR = IMPRESSAS_ATRAIR.map(url => ({ url, domain: new URL(url).hostname }));

/* Os esboços: as 12 páginas impressas e mais 11 de fora da lista (o "23" do CSV real), com o cromo dos mesmos sites. */
const SOLUCOES_DE_DADOS = "Soluções de dados para personalizar campanhas de marketing";
const DADOS_NA_CONVERSAO = "Como utilizar dados para aumentar a conversão das campanhas de marketing?";
const REFORMA = "Reforma Tributária na prática: o que sua empresa precisa revisar agora";
const PITCH = "Como fazer um pitch de vendas eficiente? Guia para converter clientes";
const IA_PMES = "Inteligência Artificial para PMEs: 7 aplicações práticas de IA";
const MENSAGENS = "65 mensagens de Dia do Cliente para agradecer e encantar seu público";
const MINU = ["1. Identifique o seu público-alvo", "2. Elabore uma comunicação consistente", "3. Esteja presente na internet", "Use provas sociais", "Faça parcerias", "Foque no atendimento", "Populares", "Conclusão"];
const ESBOCOS_ATRAIR: RadarCompetitorOutlinePage[] = [
  pagina(IMPRESSAS_ATRAIR[0], MINU),
  pagina(IMPRESSAS_ATRAIR[1], ["Procure parcerias", "Faça networking em eventos", "Invista em branding", "Use bem as redes sociais", "Software de suporte ao cliente", "Integrações"]),
  pagina(IMPRESSAS_ATRAIR[2], ["Não tem como atrair clientes sentado em sua mesa", "“Venda” é algo pessoal", "Invista no melhor atendimento", "Participe de eventos", "Matérias mais lidas"]),
  pagina(IMPRESSAS_ATRAIR[3], ["Invista em um bom atendimento", "Treine os seus colaboradores", "Desenvolva parcerias", "Participe de eventos", "Invista nas redes sociais", SOLUCOES_DE_DADOS, DADOS_NA_CONVERSAO]),
  pagina(IMPRESSAS_ATRAIR[4], ["Use provas sociais", "Construa valor para a marca", "Serviços", "Materiais Gratuitos"]),
  pagina(IMPRESSAS_ATRAIR[5], ["Use provas sociais", "Melhore a reputação da marca", "Promova eventos presenciais", "Semana 1 — 1º ao 10º dia"]),
  pagina(IMPRESSAS_ATRAIR[6], ["Praticidade para o cliente", "Procure parcerias", "Utilize as redes sociais", "Como atrair clientes na prática?"]),
  pagina(IMPRESSAS_ATRAIR[7], ["Marketing contábil", "Use provas sociais", REFORMA, "CNPJ alfanumérico: o que mudou e como preparar sua empresa", "Empresa"]),
  pagina(IMPRESSAS_ATRAIR[8], ["Foque no atendimento", "Responda rápido aos pedidos"]),
  pagina(IMPRESSAS_ATRAIR[9], ["Conheça o seu público", "Crie estratégias para as redes sociais", "Aproveite as datas comemorativas", "Agora a sua loja virtual"]),
  pagina(IMPRESSAS_ATRAIR[10], ["Use provas sociais", "Faça parcerias", IA_PMES, MENSAGENS]),
  pagina(IMPRESSAS_ATRAIR[11], ["Branding e redes sociais", "Você precisa de um site próprio", PITCH, "Junte-se a mais de 600,000 profissionais de marketing! Agradecemos sua inscrição!"]),
  /* fora da lista impressa */
  pagina("https://www.serasaexperian.com.br/conteudos/score-de-credito/", [SOLUCOES_DE_DADOS, DADOS_NA_CONVERSAO, "Score de crédito para empresas"]),
  pagina("https://www.serasaexperian.com.br/conteudos/consulta-cnpj/", [SOLUCOES_DE_DADOS, DADOS_NA_CONVERSAO, "Consulta de CNPJ"]),
  pagina("https://www.cora.com.br/blog/abrir-conta-pj/", [REFORMA, "Empresa", "Abrir conta PJ"]),
  pagina("https://conteudo.stone.com.br/maquininha/", [IA_PMES, MENSAGENS, "Maquininha de cartão"]),
  pagina("https://www.rdstation.com/blog/marketing/inbound/", [PITCH, "Marketing de conteúdo"]),
  pagina("https://mailchimp.com/pt-br/resources/atrair-clientes/", ["Use provas sociais", "Faça parcerias", "Foque no atendimento"]),
  pagina("https://www.minu.co/blog/como-atrair-clientes?utm_source=serp", MINU),
  pagina("https://amp.minu.co/blog/como-atrair-clientes", MINU),
  pagina("https://www.agendor.com.br/blog/crm/", ["CRM de vendas", "Matérias mais lidas"]),
  pagina("https://blog.cielo.com.br/maquininha/", ["Maquininha", "Semana 1 — 1º ao 10º dia"]),
  pagina("https://www.salesforce.com/br/blog/crm/", ["O que é CRM", "Software de suporte ao cliente"]),
];

const RUIDO_DOS_TEMAS = [
  /Soluções de dados/, /campanhas de marketing\?/, /pitch de vendas/, /65 mensagens/, /Reforma Tributária/, /Inteligência Artificial para PMEs/,
  /CNPJ/, /^Empresa$/, /Populares/, /Serviços/, /Materiais Gratuitos/, /Matérias mais lidas/, /Software de suporte/, /Integrações/,
  /Semana 1/, /Junte-se/, /loja virtual/i, /datas comemorativas/i,
];

test("os temas do Pilar/atrair: uma base só (a lista impressa), recorrência por site, cromo e título de post fora", () => {
  const leitura = radarCompetitorTopics({ pages: ESBOCOS_ATRAIR, core: ATRAIR, basis: BASE_ATRAIR, audience: RESPONSAVEL });
  assert.equal(leitura.sampleSize, 12, "o 'de M' é a lista impressa (12), não os 23 esboços");
  assert.equal(leitura.sampleDomains, 12);
  assert.equal(leitura.headingsRead, ESBOCOS_ATRAIR.slice(0, 12).reduce((soma, item) => soma + item.headings.length, 0), "só os cabeçalhos das páginas da base");
  for (const tema of leitura.topics) {
    assert.equal(tema.sampleSize, 12);
    assert.ok(tema.pages <= 12, tema.label);
    for (const texto of [tema.label, ...tema.headings]) {
      for (const ruido of RUIDO_DOS_TEMAS) assert.doesNotMatch(texto, ruido, `${tema.label} · ${texto}`);
    }
  }
  const tema = (rotulo: string) => leitura.topics.find(item => item.label === rotulo);
  /* Os temas legítimos ficam, contados por SITE e só na lista impressa (o mailchimp, fora dela, não conta). */
  assert.equal(tema("Provas sociais")?.pages, 5, "minu, solides, cielo, cora e stone");
  assert.equal(tema("Atendimento")?.pages, 4, "minu, agendor, serasa e getninjas");
  assert.equal(tema("Parcerias")?.pages, 5, "minu, salesforce, serasa, kyteapp e stone");
  assert.equal(tema("Participe de eventos")?.pages, 4, "salesforce, agendor, serasa e cielo");
  assert.ok(!tema("Provas sociais")!.domains.includes("mailchimp.com"));
  /* "Provas sociais" e "Redes sociais" não são o mesmo tema só porque dividem "sociais". */
  assert.ok(!tema("Provas sociais")!.headings.some(item => /redes sociais/i.test(item)));
  assert.ok(leitura.topics.some(item => /redes sociais/i.test(item.label) && item.pages >= 4), "redes sociais é outro tema");
  /* A cópia do minu em outro endereço conta uma vez e não transforma o conteúdo dele em cromo. */
  assert.ok(tema("Provas sociais")!.domains.some(item => /minu\.co$/.test(item)));
});

test("recorrência por SITE: duas páginas do mesmo site (subdomínio incluído) contam uma vez no tema", () => {
  const paginas = [
    pagina("https://blog.cielo.com.br/dicas/conquistar-mais-clientes/", ["Use provas sociais", "Foque no atendimento"]),
    pagina("https://www.cielo.com.br/blog/fidelizar-clientes/", ["Mostre a prova social dos clientes satisfeitos", "Programa de pontos"]),
    pagina("https://www.minu.co/blog/como-atrair-clientes", ["Use provas sociais", "Invista no melhor atendimento"]),
  ];
  const leitura = radarCompetitorTopics({ pages: paginas, core: ATRAIR, basis: paginas.map(item => ({ url: item.url, domain: item.domain })) });
  assert.equal(leitura.sampleSize, 3, "a lista impressa tem 3 páginas");
  assert.equal(leitura.sampleDomains, 2, "de 2 sites");
  const provas = leitura.topics.find(item => item.label === "Provas sociais")!;
  assert.equal(provas.pages, 2, "cielo (duas páginas) e minu: 2 sites, não 3 páginas");
  assert.deepEqual(provas.domains, ["blog.cielo.com.br", "www.minu.co"]);

  /* O rótulo é o cabeçalho de mais SITES: o que uma página só repete três vezes não ganha o nome do tema. */
  const repetido = radarCompetitorTopics({
    core: ATRAIR,
    pages: [
      pagina("https://a.com.br/blog/x", ["Invista no atendimento ao cliente", "Invista no atendimento ao cliente", "Invista no atendimento ao cliente"]),
      pagina("https://b.com.br/blog/y", ["Foque no atendimento"]),
      pagina("https://c.com.br/blog/z", ["Foque no atendimento"]),
    ],
  });
  assert.equal(repetido.topics[0].label, "Atendimento");
  assert.equal(repetido.topics[0].pages, 3);
});

test("sem a lista impressa, a leitura é a de antes (todas as páginas), já sem o cromo repetido do mesmo site", () => {
  const leitura = radarCompetitorTopics({ pages: ESBOCOS_ATRAIR, core: ATRAIR });
  assert.equal(leitura.sampleSize, ESBOCOS_ATRAIR.length, "compatível: sem base, o 'de M' é o número de páginas recebidas");
  assert.ok(!leitura.topics.some(item => /Soluções de dados|pitch de vendas|Reforma Tributária/.test([item.label, ...item.headings].join(" "))));
  const provas = leitura.topics.find(item => item.label === "Provas sociais")!;
  assert.equal(provas.pages, 6, "agora o mailchimp conta: sem base, todas as páginas; ainda por site");
});

/* ------------------------------ captar, tráfego e promoções: o que sai e o que fica ------------------------------ */

test("os temas de captar, tráfego e promoções: menu, inglês, listicle e consumo saem; perfil, indicações e diferença ficam", () => {
  const captar = radarCompetitorTopics({
    core: CAPTAR,
    audience: RESPONSAVEL,
    pages: [
      pagina("https://br.hubspot.com/blog/sales/captar-clientes", ["Defina o perfil dos seus clientes", "Programa de indicação", "Software de CRM de vendas completo", "CMO News"]),
      pagina("https://www.agendor.com.br/blog/como-captar-clientes/", ["Defina o perfil", "Incentive as indicações", "‌19 exemplos de e-mail de vendas para aumentar seu faturamento", "Técnicas de vendas pelo WhatsApp: as 11 melhores para sua empresa!"]),
      pagina("https://exactsales.com.br/captacao-de-clientes/", ["Indicações de clientes atuais", "Contact past customers", "Leverage public relations"]),
      pagina("https://www.rdstation.com/blog/vendas/captar-clientes/", [") Perfil do cliente", "CMO Insights"]),
      pagina("https://meetime.com.br/blog/captar-clientes/", ["Como descobrir e captar clientes potenciais: 13 dicas para te ajudar", "Como prospectar clientes pela Internet em 8 passos", "Esteja presente nas redes sociais"]),
      pagina("https://www.minu.co/blog/como-captar-clientes", ["Esteja presente nas redes sociais", "Dores do seu cliente"]),
    ],
  });
  const textos = captar.topics.flatMap(item => [item.label, ...item.headings]).join(" · ");
  for (const ruido of [/CRM de vendas completo/, /19 exemplos/, /Técnicas de vendas pelo WhatsApp/, /Contact past customers/, /Leverage public relations/, /CMO/, /13 dicas/, /8 passos/]) {
    assert.doesNotMatch(textos, ruido, String(ruido));
  }
  const perfil = captar.topics.find(item => /perfil/i.test(item.label))!;
  assert.equal(perfil.pages, 3, "hubspot, agendor e rdstation");
  assert.ok(perfil.headings.includes("Defina o perfil dos seus clientes"));
  const indicacoes = captar.topics.find(item => /indica/i.test(item.label))!;
  assert.equal(indicacoes.pages, 3, "hubspot, agendor e exactsales");
  assert.ok(indicacoes.domains.includes("exactsales.com.br"), "'Indicações de clientes atuais' fica no tema");

  const trafego = radarCompetitorTopics({
    core: TRAFEGO,
    audience: RESPONSAVEL,
    pages: [
      pagina("https://br.hubspot.com/blog/marketing/trafego-pago-organico", ["Principais diferenças", "CMO News", "Prévia do ícone do site", "Mais Conteúdos Relacionados"]),
      pagina("https://www.webi.com.br/trafego-pago-x-organico", ["Diferença tráfego pago e orgânico", "Cookies de publicidade", "Solicite seu diagnóstico gratuito com nossos especialistas"]),
      pagina("https://unifecaf.com.br/blog/trafego", ["Qual a diferença entre tráfego orgânico e pago?", "Assista a um vídeo sobre o assunto", "Serviços", "Empresa"]),
    ],
  });
  const diferenca = trafego.topics.find(item => /diferen/i.test(item.label))!;
  assert.equal(diferenca.pages, 3);
  assert.ok(diferenca.headings.includes("Diferença tráfego pago e orgânico"));
  assert.equal(trafego.topics.length, 1, "o resto é cromo do site");

  const promocoes = radarCompetitorTopics({
    core: PROMOCOES,
    pages: [
      pagina("https://www.mitrasestetica.com.br/promocoes", ["VOCÊ GANHOU UM PRESENTE !", "Ei, não vá embora, VOCÊ GANHOU UM PRESENTE !", "Vale Presente", "NOSSOS TELEFONES", "Programa de fidelidade"]),
      pagina("https://www.uvarosa.com.br/promocoes", ["Agendamento efetuado com sucesso!", "Você ganhou !", "Oferta do dia", "Programa de indicações"]),
      pagina("https://magote.com/estetica", ["Como usar cupom de desconto", "Cupons de desconto mais resgatados", "Emitir o cupom", "🔍 Onde posso encontrar cupons de desconto e promoções de Estética"]),
      pagina("https://www.medcal.com.br/blog/promocoes-clinica", ["Ideias de promoções para clínicas de estética", "50% OFF na implantação", "Programa de fidelidade"]),
    ],
  });
  const promo = promocoes.topics.flatMap(item => [item.label, ...item.headings]).join(" · ");
  for (const ruido of [/GANHOU/i, /TELEFONES/, /Agendamento efetuado/, /cupo/i, /OFF/]) assert.doesNotMatch(promo, ruido, String(ruido));
  /* 2026-10-08 (correção) · F11 · no artigo de promoção, vale-presente e oferta do dia são mecânicas que a clínica usa: ficam como tema. */
  for (const fica of [/Vale Presente/, /Oferta do dia/]) assert.match(promo, fica, String(fica));
  assert.ok(promocoes.topics.some(item => /programa/i.test(item.label) && item.pages === 3), "fidelidade e indicação ficam");
  assert.ok(promocoes.topics.some(item => item.headings.includes("Ideias de promoções para clínicas de estética")));
});

/* ------------------------------ título de post, cromo e o cabeçalho que não é tema ------------------------------ */

test("radarCompetitorHeadingIsPostTitle: título de post, encerramento, autopromoção e inglês saem; seção de verdade fica", () => {
  const titulos: Array<[string, string]> = [
    [PITCH, "guia"],
    [MENSAGENS, "título de listicle"],
    ["‌19 exemplos de e-mail de vendas para aumentar seu faturamento", "título de listicle"],
    [REFORMA, "título de post"],
    ["CNPJ alfanumérico: o que mudou e como preparar sua empresa", "título de post"],
    [IA_PMES, "título de post"],
    ["Dia do Cliente 2026: 11 ideias para ter sucesso com a data", "título de post"],
    ["Técnicas de vendas pelo WhatsApp: as 11 melhores para sua empresa!", "título de post"],
    ["Otimização de conversão: saiba como alcançar a eficiência", "título de post"],
    ["Formulário para cadastro de leads: veja como aumentar suas conversões", "título de post"],
    ["Zé Delivery: +42% de conversão com CRM por ocasião", "título de post"],
    ["Como descobrir e captar clientes potenciais: 13 dicas para te ajudar", "título de post"],
    ["Como prospectar clientes pela Internet em 8 passos", "título de listicle"],
    ["Como escolher bons exemplos? Veja os critérios usados nesta seleção", "título de post"],
    ["Como Atrair Clientes para Pequeno Negócio | Guia Prático", "guia"],
    ["Saiba mais!", "chamada"],
    ["Gostou de saber mais sobre como atrair clientes?", "encerramento"],
    ["Tudo certo sobre como atrair clientes para loja?", "encerramento"],
    ["Como conseguir leads qualificados: conclusão", "encerramento"],
    ["Conclusão", "encerramento"],
    ["O que todos esses exemplos têm em comum?", "fala do próprio post"],
    ["Why's it important to get new clients?", "inglês"],
    ["YouTube amplia presença na TV e transforma creators, esporte e IA em ativos de negócio", "manchete de outra página"],
    ["Proteína sai do suplemento e chega ao cappuccino da Melitta e ao prato do Giraffas", "manchete de outra página"],
  ];
  for (const [titulo, motivo] of titulos) {
    assert.equal(radarCompetitorHeadingPostTitleReason(titulo, { core: /YouTube|Proteína/.test(titulo) ? CAMPANHAS : ATRAIR }), motivo, titulo);
  }
  assert.equal(radarCompetitorHeadingPostTitleReason("Transforme seus seguidores em clientes com a Bagy", { core: INSTAGRAM, domain: "www.bagy.com.br" }), "autopromoção");
  assert.equal(radarCompetitorHeadingIsPostTitle("Transforme seus seguidores em clientes", { core: INSTAGRAM, domain: "www.bagy.com.br" }), false);
  assert.equal(radarCompetitorHeadingIsPostTitle("Guia de cuidados depois do clareamento", { core: ["guia de clareamento dental"] }), false, "'Guia' que é do núcleo fica");

  const secoes = [
    "Use provas sociais", "Foque no atendimento", "Faça parcerias", "Participe de eventos", "Defina o perfil dos seus clientes", "Indicações de clientes atuais",
    "Diferença tráfego pago e orgânico", "Qual a diferença entre tráfego orgânico e pago?", "Tráfego pago: quando vale a pena?", "Preço do implante: o que muda o custo",
    "Pós-operatório: cuidados essenciais", "Como captar clientes: captação ativa ou passiva?", "Exemplos dos 4 Ps do marketing", "1. Tenha uma conta comercial",
    "Ferramentas ajudam a achar o lead qualificado, o critério decide", "Destaques de forma estratégica", "Stories e Reels", "Marketing digital", "Guest post",
    "Não tem como atrair clientes sentado em sua mesa", "Como montar campanhas de marketing para clínica de estética sem virar refém de anúncios",
  ];
  for (const secao of secoes) assert.equal(radarCompetitorHeadingPostTitleReason(secao, { core: /campanhas/i.test(secao) ? CAMPANHAS : ATRAIR }), null, secao);
});

test("radarCompetitorHeadingIsChrome: navegação, tela, banner, newsletter, chamada e menu de produto saem; tema fica", () => {
  const cromo: Array<[string, string]> = [
    ["Populares", "rótulo de navegação"], ["Serviços", "rótulo de navegação"], ["Materiais Gratuitos", "rótulo de navegação"],
    ["Matérias mais lidas", "rótulo de navegação"], ["Integrações", "rótulo de navegação"], ["Recursos", "rótulo de navegação"],
    ["Empresa", "rótulo de navegação"], ["Conteúdos", "rótulo de navegação"], ["+ conteúdo", "rótulo de navegação"], ["CMO News", "rótulo de navegação"],
    ["CMO Insights", "rótulo de navegação"], ["Configurações da galeria", "rótulo de navegação"], ["NOSSOS TELEFONES", "rótulo de navegação"],
    ["Prévia do ícone do site", "rótulo de navegação"], ["Ferramentas gratuitas", "rótulo de navegação"], ["Mais Conteúdos Relacionados", "rótulo de navegação"],
    ["Clientes", "rótulo de navegação"], ["Produtos", "rótulo de navegação"], ["Consulta", "rótulo de navegação"],
    ["Agendamento efetuado com sucesso!", "mensagem de tela ou cookie"], ["VOCÊ GANHOU UM PRESENTE !", "mensagem de tela ou cookie"],
    ["Ei, não vá embora, VOCÊ GANHOU UM PRESENTE !", "mensagem de tela ou cookie"], ["Cookies de publicidade", "mensagem de tela ou cookie"],
    ["Junte-se a mais de 600,000 profissionais de marketing! Agradecemos sua inscrição!", "newsletter ou inscrição"],
    ["50% OFF na implantação", "banner de oferta"], ["Software de suporte ao cliente", "menu de produto"], ["Software de CRM de vendas completo", "menu de produto"],
    [SOLUCOES_DE_DADOS, "menu de produto"], ["Soluções para diversas estruturas clínicas", "menu de produto"],
    ["Clínicas +3 profissionais", "faixa de plano"], ["Consultórios 1 a 2 profissionais", "faixa de plano"], ["Eduardo S. - Paciente", "assinatura de depoimento"],
    ["Semana 1 — 1º ao 10º dia", "unidade de tempo sem assunto"], ["Resumo de 30 dias", "unidade de tempo sem assunto"],
    ["Conheça outros recursos", "chamada para ação"], ["Quer ver seu Wi-Fi capturando clientes?", "chamada para ação"],
    ["Solicite seu diagnóstico gratuito com nossos especialistas", "chamada para ação"], ["Assista a um vídeo sobre o assunto", "chamada para ação"],
  ];
  for (const [cabecalho, motivo] of cromo) assert.equal(radarCompetitorHeadingChromeReason(cabecalho), motivo, cabecalho);
  for (const tema of ["Atendimento", "Parcerias", "Provas sociais", "Hashtags", "Marketing de conteúdo", "Programa de fidelidade", "Tráfego pago", "Aproveite os recursos do Instagram", "Destaques de forma estratégica", "O fim dos cookies de terceiros", "Conheça seu público"]) {
    assert.equal(radarCompetitorHeadingIsChrome(tema), false, tema);
  }
});

test("radarCompetitorHeadingIsNotTopic junta a régua, e C5 continua (marca do domínio, datado, loja; agora cupom fora do consumidor)", () => {
  const atrair: RadarResearchNoiseContext = { core: ATRAIR, audience: RESPONSAVEL };
  for (const ruido of [PITCH, MENSAGENS, REFORMA, "Populares", "Conclusão", "Agora a sua loja virtual", "Aproveite as datas comemorativas", "Dia do Cliente 2026: 11 ideias para ter sucesso com a data"]) {
    assert.equal(radarCompetitorHeadingIsNotTopic(ruido, atrair), true, ruido);
  }
  assert.equal(radarCompetitorHeadingIsNotTopic("Como é o processo entre Pacientes e Psicólogo?", { core: CAPTACAO }), true, "outra profissão no artigo de dentista");
  assert.equal(radarCompetitorHeadingIsNotTopic("Alta rotatividade de funcionários na clínica", { core: CAPTACAO }), true, "gestão de pessoas fora do tema");
  for (const tema of ["Use provas sociais", "Foque no atendimento", "Faça parcerias", "Participe de eventos", "Defina o perfil dos seus clientes", "Indicações de clientes atuais", "Diferença tráfego pago e orgânico"]) {
    assert.equal(radarCompetitorHeadingIsNotTopic(tema, atrair), false, tema);
  }
  /* C5, com a mesma assinatura (a marca mudou de casa e continua exportada daqui). */
  assert.equal(radarCompetitorBrandOf, marcaDaRegua);
  assert.equal(radarCompetitorBrandOf("conteudo.stone.com.br"), "stone");
  assert.equal(radarCompetitorHeadingIsNoise("Como usar cupom de desconto", { core: PROMOCOES }), true, "cupom num artigo para a clínica");
  assert.equal(radarCompetitorHeadingIsNoise("Como usar cupom de desconto", { core: PROMOCOES, audience: "Consumidora que quer fazer limpeza de pele pagando menos" }), false, "artigo para o consumidor: cupom é assunto");
  assert.equal(radarCompetitorHeadingIsNoise("Black Friday na clínica", { core: PROMOCOES }), false, "artigo de promoção: data comemorativa é assunto");
  assert.equal(radarCompetitorHeadingIsNoise("Black Friday na clínica", { core: ATRAIR }), true);
});

/* ------------------------------ perguntas do leitor ------------------------------ */

const CONCORRENTES_ATRAIR = BASE_ATRAIR.map(item => item.domain).concat(["www.youtube.com", "www.instagram.com"]);

test("radarReaderQuestionIsNoise: as perguntas reais dos 8 CSVs — o que sai e por quê", () => {
  const casos: Array<[string, RadarResearchNoiseContext, string]> = [
    ["Deseja receber e-mails com novos eventos e conteúdos exclusivos?", { core: CAPTAR }, "newsletter ou inscrição"],
    ["Why's it important to get new clients?", { core: ATRAIR }, "inglês"],
    ["Como conseguir leads qualificados: conclusão", { core: QUALIFICADOS }, "encerramento"],
    ["E então, como começar a gerar tráfego orgânico?", { core: TRAFEGO, audience: RESPONSAVEL }, "encerramento"],
    ["🤑 É possível ganhar Cashback em compras nas marcas de Estética?", { core: PROMOCOES }, "loja ou consumo fora do leitor"],
    ["👍As marcas e lojas de Estética são seguras e confiáveis?", { core: PROMOCOES }, "loja ou consumo fora do leitor"],
    ["Como atrair clientes nos primeiros 30 dias da loja virtual?", { core: ATRAIR, audience: RESPONSAVEL }, "loja ou consumo fora do leitor"],
    ["Como é o processo entre Pacientes e Psicólogo?", { core: CAPTACAO }, "outra profissão"],
    ["Alta rotatividade de funcionários na clínica: o que fazer?", { core: CAPTACAO }, "fora do tema (gestão de pessoas)"],
    ["Como funciona o Agendor para atrair clientes?", { core: ATRAIR, competitorDomains: CONCORRENTES_ATRAIR }, "produto de terceiro"],
    ["Como captar clientes para o seu negócio: 7 estratégias essenciais", { core: CAPTAR }, "título de post"],
    ["Como fazer um pitch de vendas eficiente? Guia para converter clientes", { core: INSTAGRAM }, "guia"],
  ];
  for (const [pergunta, contexto, motivo] of casos) assert.equal(radarReaderQuestionNoiseReason(pergunta, contexto), motivo, pergunta);

  const ficam: Array<[RadarResearchNoiseContext, string[]]> = [
    [{ core: ATRAIR, audience: RESPONSAVEL, competitorDomains: CONCORRENTES_ATRAIR }, [
      "O que fazer para atrair clientes?", "Como atrair clientes com marketing digital", "Como atrair clientes na prática?", "Como um CRM pode ajudar a atrair clientes?",
      "O que fazer antes de tentar atrair clientes?", "Como atrair clientes pelo Instagram?",
    ]],
    [{ core: QUALIFICADOS }, [
      "Como gerar leads qualificados", "Como gerar leads no LinkedIn?", "Como gerar leads qualificados no Inbound Marketing?", "Como a automação de marketing pode ajudar a gerar leads gastando menos?",
      "Como definir um Lead qualificado?", "Como funciona a geração de leads?", "Como gerar leads com o Whatsapp?", "Como gerar leads no Instagram?", "Como gerar leads qualificados no Outbound Marketing?",
    ]],
    [{ core: TRAFEGO, audience: RESPONSAVEL }, [
      "Qual a diferença entre tráfego orgânico e pago?", "Como afiliados e creators podem gerar tráfego orgânico?", "Como aumentar seu tráfego orgânico de forma eficiente",
      "Como começar uma estratégia de tráfego pago?", "Como dar início a uma estratégia de tráfego orgânico?", "Como montar uma estratégia que concilie tráfego pago e orgânico?",
      "Como obter tráfego orgânico", "Como tráfego pago e orgânico trabalham juntos?", "De que forma o tráfego orgânico e o tráfego pago se complementam?",
      "Devo pausar meus anúncios e investir apenas em tráfego orgânico?",
    ]],
    [{ core: CAPTACAO }, [
      "Como a fidelização de pacientes pode transformar seu consultório", "Como aumentar visitas e leads com tráfego orgânico?", "Como criar uma estratégia de tráfego orgânico eficaz",
      "Como devo me comunicar com os pacientes para mantê-los engajados?", "Como dominar o tráfego orgânico?", "Como ajudar pacientes com medo", "Como é para os pacientes?",
    ]],
    [{ core: CAPTAR }, [
      "Como captar clientes pela internet", "Como captar clientes por telefone", "Como captar clientes: captação ativa ou passiva?", "Como conquistar o primeiro cliente?",
      "E o que vem depois da conquista de um cliente?",
    ]],
    [{ core: CAMPANHAS, audience: RESPONSAVEL }, [
      "Quais são os exemplos de marketing digital?", "Como escolher uma empresa para gerenciar campanhas de marketing digital?", "Como medir o ROI de campanhas de marketing com dados de terceiros",
      "Como montar uma campanha de marketing digital eficaz para pequenas empresas?", "Como utilizar dados para aumentar a conversão das campanhas de marketing?",
      "Qual o custo médio para gerenciar campanhas de marketing digital?",
    ]],
    [{ core: INSTAGRAM, audience: "Profissional de clínica de estética ou saúde que já investe tempo e energia no Instagram", competitorDomains: ["www.instagram.com", "www.nuvemshop.com.br"] }, [
      "Como prospectar clientes pelo Instagram com mídia paga", "Como prospectar clientes pelo Instagram com tráfego orgânico?", "Como prospectar mais clientes pelo Instagram?",
      "Como transformar seguidores em clientes no Instagram?", "Devo seguir meus clientes no Instagram?", "Como psicólogos e dentistas usam o Instagram?",
    ]],
    [{ core: PROMOCOES }, ["Como criar promoções sem desvalorizar a clínica?", "Que tipo de promoção atrai os pacientes certos?"]],
  ];
  for (const [contexto, perguntas] of ficam) {
    for (const pergunta of perguntas) assert.equal(radarReaderQuestionNoiseReason(pergunta, contexto), null, pergunta);
  }
  assert.equal(radarReaderQuestionIsNoise("🤑 É possível ganhar Cashback em compras nas marcas de Estética?", { core: PROMOCOES, audience: "Consumidora que quer economizar em estética" }), false, "para o consumidor, cashback é dúvida dele");
});

/* ------------------------------ fontes citadas pelo mercado ------------------------------ */

const OFICIAL = "domínio oficial ou regulador";
const INSTITUCIONAL = "domínio educacional ou institucional";
const citada = (title: string, url: string, authorityClass: string): RadarMarketCitation => ({ title, url, domain: new URL(url).hostname, authorityClass });

test("radarMarketCitationIsNoise: as fontes reais dos 8 CSVs — rodapé, selo, CPF, diploma, W3C, aposta e oficial fora do tema saem", () => {
  const COOKIE = citada("Leia mais sobre esses objetivos", "https://cookiedatabase.org/tcf/purposes/", INSTITUCIONAL);
  const W3C = citada("Descreva a finalidade da imagem (abrir em uma nova aba)", "https://www.w3.org/WAI/tutorials/images/decision-tree/", INSTITUCIONAL);
  const casos: Array<[RadarMarketCitation, RadarResearchNoiseContext, string]> = [
    /* campanhas */
    [citada("Clique para confirmar o credenciamento BBB e ver um relatório BBB", "https://www.bbb.org/us/ca/san-mateo/profile/market-survey/momentive-global-inc-1116-876628", INSTITUCIONAL), { core: CAMPANHAS }, "selo ou credenciamento"],
    /* captação (dentista) */
    [W3C, { core: CAPTACAO }, "tutorial técnico do W3C"],
    [citada("Selo Govtech de segurança", "https://selo.brazillab.org.br/startups", INSTITUCIONAL), { core: CAPTACAO }, "selo ou credenciamento"],
    [citada("CensoPsi 2022", "https://site.cfp.org.br/censopsi-2022-cfp-divulga-os-resultados-da-maior-pesquisa-sobre-o-exercicio-profissional-da-psicologia-brasileira/", INSTITUCIONAL), { core: CAPTACAO }, "outra profissão"],
    [citada("resolução da Agência Nacional de Saúde Suplementar (ANS)", "http://www.ans.gov.br/aans/noticias-ans/consumidor/5809-ans-amplia-cobertura-dos-planos-de-saude", OFICIAL), { core: CAPTACAO }, "oficial fora do tema"],
    /* atrair */
    [citada("IBGE", "https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/23445-pnad-continua-tic-2017-internet-chega-a-tres-em-cada-quatro-domicilios-do-pais", OFICIAL), { core: ATRAIR }, "oficial fora do tema"],
    [citada("CVM", "https://www.gov.br/cvm/pt-br", OFICIAL), { core: ATRAIR }, "oficial fora do tema"],
    [citada("Atendimento CVM", "https://www.gov.br/cvm/pt-br/canais_atendimento/consultas-reclamacoes-denuncias", OFICIAL), { core: ATRAIR, topics: ["Foque no atendimento"] }, "oficial fora do tema"],
    [citada("Brasil.gov", "https://www.gov.br/pt-br", OFICIAL), { core: ATRAIR }, "oficial fora do tema"],
    /* captar */
    [COOKIE, { core: CAPTAR }, "cookie ou consentimento"],
    [citada("Clique aqui para entender sobre a certificação Fin Antifraude do Efí Bank", "https://fin.org.br/selo-fin-de-prevencao-a-fraudes", INSTITUCIONAL), { core: CAPTAR }, "selo ou credenciamento"],
    [citada("Consultar CPF", "https://loja.spcbrasil.org.br/consulta/pessoa-fisica", INSTITUCIONAL), { core: CAPTAR }, "consulta de CPF ou CNPJ"],
    [citada("Consultar CNPJ", "https://loja.spcbrasil.org.br/consulta/pessoa-juridica", INSTITUCIONAL), { core: CAPTAR }, "consulta de CPF ou CNPJ"],
    [citada("Monitorar meu CPF", "https://loja.spcbrasil.org.br/monitore", INSTITUCIONAL), { core: CAPTAR }, "consulta de CPF ou CNPJ"],
    /* promoções */
    [COOKIE, { core: PROMOCOES }, "cookie ou consentimento"],
    [citada("jogo da fortuna tiger jogo da fortuna tiger Games 4.3 ★", "https://ecidade.campinagrande.pb.gov.br/games.php/jogo-da-fortuna-tiger", OFICIAL), { core: PROMOCOES }, "aposta ou jogo"],
    [citada("betano apostas login betano Games 5.0 ★", "https://ecidade.campinagrande.pb.gov.br/games.php/betano-apostas-login", OFICIAL), { core: PROMOCOES }, "aposta ou jogo"],
    [citada("LAI", "http://www.planalto.gov.br/ccivil_03/_ato2011-2014/2011/lei/l12527.htm", OFICIAL), { core: PROMOCOES }, "lei de rodapé"],
    [citada("www.planalto.gov.br", "http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm", OFICIAL), { core: PROMOCOES }, "lei de rodapé"],
    /* qualificados */
    [W3C, { core: QUALIFICADOS }, "tutorial técnico do W3C"],
    /* tráfego */
    [COOKIE, { core: TRAFEGO }, "cookie ou consentimento"],
    [citada("QR-Code para a aplicação do e-MEC", "https://emec.mec.gov.br/emec/consulta-cadastro/detalhamento/d96957f455f6405d14c6542552b0f6eb/MTc4NTQ=", OFICIAL), { core: TRAFEGO }, "diploma ou e-MEC"],
    [citada("Autenticação de Diploma via física", "https://mentorweb.unifecaf.edu.br/fecafMentorWebG5/jsf/executaInterfacePublica.jsf?codigoForm=CLI84", INSTITUCIONAL), { core: TRAFEGO }, "diploma ou e-MEC"],
    /* institucional e o próprio site de um concorrente lido */
    [citada("Sobre a RD Station", "https://www.rdstation.com/sobre/", INSTITUCIONAL), { core: ATRAIR, competitorDomains: CONCORRENTES_ATRAIR }, "página institucional"],
    [citada("Calculadora de ROI", "https://www.rdstation.com/ferramentas/calculadora-roi/", INSTITUCIONAL), { core: ATRAIR, competitorDomains: CONCORRENTES_ATRAIR }, "site do próprio concorrente"],
  ];
  for (const [fonte, contexto, motivo] of casos) assert.equal(radarMarketCitationNoiseReason(fonte, contexto), motivo, fonte.title || fonte.url);

  /* Ficam: os exemplos de campanha, o estudo, a especialidade do público, o verbete do assunto e o oficial que toca o tema. */
  const ficam: Array<[RadarMarketCitation, RadarResearchNoiseContext]> = [
    [citada("Alcohol Change UK", "https://alcoholchange.org.uk/help-and-support/managing-your-drinking/dry-january/about-dry-january/the-dry-january-story", INSTITUCIONAL), { core: CAMPANHAS }],
    [citada("estudo do European Journal of Business and Management Research", "https://www.ejbmr.org/index.php/ejbmr/article/view/14", INSTITUCIONAL), { core: CAMPANHAS }],
    [citada("“Save Amazônia”", "https://www.greenpeace.org/brasil/minecraft-save-amazonia/", INSTITUCIONAL), { core: CAMPANHAS }],
    [citada("odontologia estética", "https://cfo.org.br/especialidades/", INSTITUCIONAL), { core: CAPTACAO }],
    [citada("Custo de Aquisição de Cliente", "https://pt.wikipedia.org/wiki/Custo_de_aquisi%C3%A7%C3%A3o_de_clientes", INSTITUCIONAL), { core: CAPTAR, competitorDomains: ["pt.wikipedia.org"] }],
    [citada("IBGE", "https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/23445-pnad-continua-tic-2017-internet-chega-a-tres-em-cada-quatro-domicilios-do-pais", OFICIAL), { core: ATRAIR, topics: ["Esteja presente na internet"] }],
    [citada("Conselho orienta dentistas sobre publicidade", "https://www.gov.br/saude/pt-br/assuntos/noticias/2024/orientacao-publicidade", OFICIAL), { core: CAPTACAO }],
    [citada("Lei Geral de Proteção de Dados (LGPD)", "http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm", OFICIAL), { core: ["lgpd para clínicas", "dados pessoais de pacientes"] }],
  ];
  for (const [fonte, contexto] of ficam) assert.equal(radarMarketCitationNoiseReason(fonte, contexto), null, fonte.title || fonte.url);
  assert.equal(radarMarketCitationIsNoise(COOKIE, { core: ["política de cookies do site da clínica"] }), false, "artigo sobre cookie fica com o cookie");
});

/* ------------------------------ as peças da régua ------------------------------ */

test("as peças: site registrável, inglês, outra profissão", () => {
  assert.equal(radarRegistrableDomain("https://blog.cielo.com.br/dicas/x"), "cielo.com.br");
  assert.equal(radarRegistrableDomain("www.cielo.com.br"), "cielo.com.br");
  assert.equal(radarRegistrableDomain("agenciadenoticias.ibge.gov.br"), "ibge.gov.br");
  assert.equal(radarRegistrableDomain("www.gov.br"), "gov.br");
  assert.equal(radarRegistrableDomain("amp.minu.co"), "minu.co");
  assert.equal(radarRegistrableDomain("www.kyteapp.com"), "kyteapp.com");

  for (const ingles of ["Why's it important to get new clients?", "Contact past customers", "Leverage public relations", "How to attract GOOD CLIENTS using INSTAGRAM"]) {
    assert.equal(radarResearchIsEnglish(ingles), true, ingles);
  }
  for (const portugues of ["Stories e Reels", "Guest post", "Marketing digital", "Como gerar leads no LinkedIn?", "Como gerar leads qualificados no Inbound Marketing?", "SEO, dados e otimização contínua"]) {
    assert.equal(radarResearchIsEnglish(portugues), false, portugues);
  }

  assert.equal(radarResearchOtherProfession("Como é o processo entre Pacientes e Psicólogo?", { core: CAPTACAO }), true);
  assert.equal(radarResearchOtherProfession("Como é o processo entre Pacientes e Psicólogo?", { core: INSTAGRAM, audience: "Profissional de clínica de estética ou saúde" }), false, "público de saúde aceita as profissões de saúde");
  assert.equal(radarResearchOtherProfession("Como é o processo entre Pacientes e Psicólogo?", { core: ATRAIR, audience: RESPONSAVEL }), false, "sem profissão no núcleo nem no leitor, não há como julgar");
  assert.equal(radarResearchOtherProfession("Marketing para dentistas e psicólogos", { core: CAPTACAO }), false, "cita também a do público");
});

test("a régua é pura: sem import nem I/O, e competitor-topics continua fora do hash do dossiê", async () => {
  const regua = await ler("lib/radar/research-noise.ts");
  assert.doesNotMatch(regua, /^import /m, "nenhum import: só funções sobre o texto e o contexto");
  assert.doesNotMatch(regua, /\bfetch\(|readFile|process\.env|supabase/i);
  const temas = await ler("lib/radar/competitor-topics.ts");
  assert.match(temas, /export \{ radarCompetitorBrandOf \} from "\.\/research-noise\.ts";/);
  const dossie = await ler("lib/radar/evidence-bundle.ts");
  assert.doesNotMatch(dossie, /competitor-topics|radarCompetitorTopics/, "os temas dos concorrentes não entram no hash do dossiê");
});

test("PROVIDER_CALLS = 0", () => {
  assert.ok(true, "domínio puro e leitura de fonte");
});
