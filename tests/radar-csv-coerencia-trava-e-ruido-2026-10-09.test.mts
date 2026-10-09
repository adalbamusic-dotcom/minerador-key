import assert from "node:assert/strict";
import test from "node:test";
import {
  radarClaimGate,
  radarPendingClaims,
  radarPlatformClaimKind,
  radarSentenceNeedsSource,
  type RadarPendingClaim,
} from "../lib/radar/pending-claims.ts";
import {
  radarCompetitorHeadingChromeReason,
  radarMarketCitationNoiseReason,
  type RadarMarketCitation,
  type RadarResearchNoiseContext,
} from "../lib/radar/research-noise.ts";
import { radarCompetitorTopics } from "../lib/radar/competitor-topics.ts";
import {
  radarBrandVoiceExclusionOf,
  radarBrandVoiceExclusions,
  radarBrandVoiceExclusionsLine,
  type RadarBrandVoiceSection,
} from "../lib/radar/brand-voice.ts";
import { radarSuggestionGuard, radarSuggestionRestatesKeyword } from "../lib/radar/out-of-scope.ts";

/*
 * ===== 2026-10-09 · COERÊNCIA FINAL DOS 8 CSVs "PARA ESCREVER": TRAVA E RUÍDO =====
 *
 * Os textos abaixo são os dos CSVs reais de 09/10 (Silo "Leads sem Tráfego
 * Pago"): título, meta e promessa que travavam sem afirmar nada (defeito 7), a
 * CVM e a "Biblioteca de Marketing" que sobraram na pesquisa (defeito 13), e as
 * réguas puras que o export e o brief usam para as sugestões: o "Não cobrir"
 * (3c), a voz da marca (5) e a própria keyword (6).
 *
 * Domínio puro: sem rede, sem banco, sem provider, sem modelo.
 */

const D10 = /fonte a obter|pend[eê]ncia|pendente de|preencher|rascunho|aguardando aprova/i;
const LIVRE = { needs: false, reason: "", label: "", kind: "LIVRE", source: null };

/* ------------------------------ defeito 7 · a trava ------------------------------ */

test("defeito 7 · título, meta, promessa e CTA reais que só dizem o objetivo do que se cria ou ensina passam", () => {
  for (const frase of [
    /* promoções: H1, meta, promessa e ângulo */
    "Promoções para estética: como criar ofertas que atraem pacientes sem desvalorizar a clínica",
    "Aprenda a criar promoções para estética que atraem pacientes sem desvalorizar sua clínica. Ideias, critérios e exemplos práticos.",
    "Cobrir com clareza o tema “promoções para estética”, mostrando como criar ofertas que atraem pacientes sem destruir a margem, e como pacientes podem encontrar descontos seguros.",
    "Um guia prático com exemplos comentados de promoções que funcionam para clínicas de estética, incluindo um checklist de diagnóstico para avaliar se a promoção atrai o paciente certo.",
    /* tráfego: H1 e meta ("como + infinitivo" com o mecanismo "anúncios" na frase) e o "Explicar" nominalizado */
    "Tráfego pago vs orgânico para clínica de estética: como reduzir dependência de anúncios",
    "Entenda a diferença entre tráfego pago e orgânico, quando usar cada um e como reduzir a dependência de anúncios na sua clínica de estética.",
    "Produção de conteúdo que atrai pacientes em diferentes estágios da decisão.",
    /* Instagram: o CTA real */
    "Se você quer parar de depender do Instagram e construir uma presença orgânica que traz pacientes, conheça nossos serviços de SEO para clínicas.",
    /* leads: a pergunta indireta do "Explicar" */
    "Acompanhe quantos leads se tornam pacientes e de onde eles vêm.",
    /* as outras formas da mesma regra */
    "Crie conteúdos que convertem visitantes em agendamentos.",
    "Aprenda a criar anúncios que aumentam o alcance da clínica.",
    "Descubra se o Instagram prioriza vídeos curtos na sua região.",
    "Monte uma página de serviço que gera agendamentos.",
  ]) assert.deepEqual(radarSentenceNeedsSource(frase), LIVRE, frase);
});

test("defeito 7 · a afirmação continua travando: \"canais que convertem\", o particípio, o comparativo, o \"por que\" e a relativa que afirma da plataforma", () => {
  for (const [frase, sentido] of [
    /* o caso real que motivou a trava por sentido (08/10) */
    ["Use o Instagram como vitrine, direcionando o público para canais que convertem, como o site e o WhatsApp.", "CONVERSAO"],
    ["canais que convertem, como o site e o WhatsApp", "CONVERSAO"],
    /* as legendas e o "Explicar" reais de 09/10 */
    ["Promoções bem planejadas atraem pacientes sem desvalorizar a clínica", "CONVERSAO"],
    ["Conteúdo relevante atrai leads qualificados", "CONVERSAO"],
    ["Conteúdo otimizado para SEO atrai pacientes que buscam tratamentos na região.", "CONVERSAO"],
    /* "como" seguido de artigo é comparativo, não "como + infinitivo" */
    ["Faça como as clínicas que lotam a agenda.", "CONVERSAO"],
    /* "por que" pressupõe o efeito */
    ["Entenda por que o conteúdo educativo gera agendamentos.", "CONVERSAO"],
    /* a relativa com a plataforma como sujeito afirma o que ela faz */
    ["Crie posts para o Instagram, que o algoritmo prioriza.", "PLATAFORMA"],
    ["O Instagram prioriza vídeos curtos.", "PLATAFORMA"],
    /* o verbo de criação conjugado (não infinitivo, imperativo nem nome) não é orientação */
    ["A clínica cria ofertas que atraem pacientes.", "CONVERSAO"],
  ] as const) assert.equal(radarPlatformClaimKind(frase), sentido, frase);
});

/* Os links externos da planta real de "leads qualificados" (uma afirmação por seção). */
const PLANTA_LEADS: RadarPendingClaim[] = [
  "Definição de lead qualificado conforme fontes do setor",
  "Estatísticas sobre conversão de leads qualificados",
  "Passos para gerar leads qualificados",
  "Métricas para avaliar geração de leads",
  "Riscos de comprar listas de leads",
  "Diferença entre lead qualificado e interessado",
].map((texto, secao) => ({ texto, origem: "PLANTA", fonte: null, secao }));
const META_LEADS = "Entenda o que são leads qualificados, a diferença para leads interessados e como gerá-los com estratégias práticas para clínicas de estética";

test("defeito 7 · o link da planta fora da seção pede semelhança alta: a meta real de leads passa; a frase que fala do link continua travando", () => {
  /*
   * 2026-10-09 (correção) · a meta passa porque os links da planta de leads são
   * rótulos de tema e saem na ORIGEM (`radarPendingClaims`); a frase que traz
   * inteira uma afirmação de verdade da planta trava em qualquer lugar.
   */
  const daOrigem = radarPendingClaims(null, { blueprint: { sections: PLANTA_LEADS.map(item => ({ externalLinks: [{ claim: item.texto, sourceType: "oficial", source: null }] })) }, sources: [] } as never);
  assert.deepEqual(daOrigem, []);
  for (const comuns of [new Set<string>(), new Set(["lead", "qualificad"])]) {
    assert.deepEqual(radarSentenceNeedsSource(META_LEADS, { pendentes: daOrigem, secao: null, comuns }), LIVRE, `comuns: ${[...comuns].join(",")}`);
    /* A frase que FALA do link, fora da seção dele, ainda trava pelo link (com o motivo concluído, D10). */
    const fala = radarSentenceNeedsSource("A diferença entre lead qualificado e lead interessado.", { pendentes: PLANTA_LEADS, secao: null, comuns });
    assert.equal(fala.needs, true);
    assert.equal(fala.kind, "PLANTA");
    assert.equal(fala.reason, "a planta pede fonte oficial ou verificada: \"Diferença entre lead qualificado e interessado\"");
    assert.doesNotMatch(`${fala.reason} ${fala.label}`, D10);
  }
  /* Na seção que escreveu o link vale a regra de antes: duas raízes distintivas em comum bastam. */
  const naSecao = radarClaimGate("Comprar listas pode trazer contatos desatualizados e sem interesse real", PLANTA_LEADS, 4, { comuns: new Set(["lead", "qualificad"]) });
  assert.equal(naSecao.estado, "TRAVADA");
  assert.equal(naSecao.estado === "TRAVADA" ? naSecao.afirmacao?.texto : null, "Riscos de comprar listas de leads");
  /* As afirmações do mercado continuam na régua dos 60% (a semelhança alta é só do link da planta). */
  const mercado: RadarPendingClaim[] = [{ texto: "Clareamento com bicarbonato desgasta o esmalte do dente", origem: "MERCADO_SEM_FONTE", fonte: null, secao: null }];
  assert.equal(radarClaimGate("O bicarbonato desgasta o esmalte do dente, então escolha produtos com orientação profissional e acompanhamento regular", mercado, null).estado, "TRAVADA");
});

/* ------------------------------ defeito 13 · o ruído ------------------------------ */

const ATRAIR = ["como atrair um cliente", "como conquistar novos clientes", "como ganhar um cliente", "como conseguir mais clientes", "como atrair mais clientes", "como conquistar clientes"];
const TEMAS_ATRAIR = ["Como atrair clientes?", "Por que conhecer o cliente faz toda a diferença", "O que é a captação de clientes?", "Foque no atendimento"];
const OFICIAL = "domínio oficial ou regulador";
const citada = (title: string, url: string, supports: string[] = []): RadarMarketCitation => ({ title, url, domain: new URL(url).hostname, authorityClass: OFICIAL, supports });

test("defeito 13 · CVM e \"Atendimento CVM\" saem do artigo de atrair cliente, mesmo citadas numa seção do concorrente que toca o tema", () => {
  const contexto: RadarResearchNoiseContext = { core: ATRAIR, topics: TEMAS_ATRAIR };
  /* A seção do concorrente toca o tema sempre — a página é sobre ele: não diz o assunto da fonte. */
  for (const secoes of [[], ["Como atrair clientes"], ["Invista em um atendimento de excelência ao cliente"]]) {
    assert.equal(radarMarketCitationNoiseReason(citada("CVM", "https://www.gov.br/cvm/pt-br", secoes), contexto), "oficial fora do tema", `CVM · ${secoes.join(",")}`);
    assert.equal(
      radarMarketCitationNoiseReason(citada("Atendimento CVM", "https://www.gov.br/cvm/pt-br/canais_atendimento/consultas-reclamacoes-denuncias", secoes), contexto),
      "oficial fora do tema",
      `Atendimento CVM · ${secoes.join(",")}`,
    );
  }
  /* Fica o oficial cujo endereço diz o assunto, e o de âncora genérica no portal, quando a seção é que diz o assunto. */
  const internet: RadarResearchNoiseContext = { core: ATRAIR, topics: ["Esteja presente na internet"] };
  assert.equal(radarMarketCitationNoiseReason(citada("IBGE", "https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/23445-pnad-continua-tic-2017-internet-chega-a-tres-em-cada-quatro-domicilios-do-pais", ["Como atrair clientes"]), internet), null);
  assert.equal(radarMarketCitationNoiseReason(citada("clique aqui", "https://www.gov.br/", ["Esteja presente na internet"]), internet), null);
  assert.equal(radarMarketCitationNoiseReason(citada("clique aqui", "https://www.gov.br/", ["Fale com o contador"]), internet), "oficial fora do tema");
  /* O artigo científico citado pelo domínio: âncora (o domínio) e caminho (o identificador) não dizem assunto; a seção diz. */
  const acne: RadarResearchNoiseContext = { core: ["o que causa acne", "acne adulta"], topics: ["O que causa acne"] };
  assert.equal(radarMarketCitationNoiseReason(citada("pmc.ncbi.nlm.nih.gov", "https://pmc.ncbi.nlm.nih.gov/articles/PMC9311318/", ["O que causa acne"]), acne), null);
  assert.equal(radarMarketCitationNoiseReason(citada("pmc.ncbi.nlm.nih.gov", "https://pmc.ncbi.nlm.nih.gov/articles/PMC9311318/", ["Atendimento ao cliente"]), acne), "oficial fora do tema");
});

test("defeito 13 · \"Biblioteca de Marketing\" é navegação e não vira tema; \"Informações\" e \"Exclusivo pra você\" também saem", () => {
  for (const cabecalho of ["Biblioteca de Marketing", "BIBLIOTECA DE MARKETING", "Biblioteca", "Informações", "Exclusivo pra você"]) {
    assert.equal(radarCompetitorHeadingChromeReason(cabecalho), "rótulo de navegação", cabecalho);
  }
  /* Rótulo inteiro, como os outros: a recomendação que só cita a biblioteca continua tema. */
  for (const tema of ["Crie uma biblioteca de conteúdos para a clínica", "Informações de contato no perfil"]) assert.equal(radarCompetitorHeadingChromeReason(tema), null, tema);
  const pagina = (dominio: string, ...cabecalhos: string[]) => ({ url: `https://www.${dominio}/blog/atrair-clientes`, title: dominio, domain: `www.${dominio}`, headings: cabecalhos.map(text => ({ level: 2, text })) });
  const { topics } = radarCompetitorTopics({
    pages: [
      pagina("rdstation.com", "Biblioteca de Marketing", "Faça automação de marketing", "Utilize as redes sociais"),
      pagina("minu.co", "Biblioteca de Marketing", "Explore o Marketing de Conteúdo", "Use bem as redes sociais"),
      pagina("salesforce.com", "Informações", "Exclusivo pra você", "Faça bom uso das redes sociais"),
    ],
    core: ATRAIR,
  });
  const rotulos = topics.map(item => item.label);
  assert.ok(!rotulos.some(rotulo => /biblioteca|^informa|exclusivo/i.test(rotulo)), rotulos.join(" · "));
  assert.ok(topics.every(item => item.headings.every(cabecalho => !/^Biblioteca|^Informações$|^Exclusivo/.test(cabecalho))), "nem como exemplo de cabeçalho");
  assert.equal(topics.find(item => item.label === "Redes sociais")?.pages, 3);
});

/* ------------------------------ defeito 5 · a voz da marca ------------------------------ */

/* As seções da Skill real "AdalbaPro" v1, como a linha "Voz da marca" do CSV as traz. */
const SKILL_ADALBAPRO: RadarBrandVoiceSection[] = [
  {
    heading: "Uso das quatro janelas da SERP",
    body: "Não transformar toda pergunta relacionada em seção. Descartar ruído, navegação, publicidade, frases de encerramento e títulos de conteúdos recomendados que não pertencem ao assunto.",
  },
  {
    heading: "Recursos antigos ou inadequados",
    body: [
      "Não recomendar Instagram Shopping, ativação de loja ou tutoriais de configuração desse recurso nos artigos deste projeto. Essa é uma exclusão editorial determinada pelo proprietário, não uma afirmação de encerramento universal do produto.",
      "",
      "Não transportar conselhos de lojas virtuais para consultórios automaticamente. Venda de produto e agendamento de atendimento são objetivos diferentes.",
      "",
      "Não recomendar funcionalidades apenas porque apareceram em um concorrente. Verificar disponibilidade atual, país, tipo de conta e pertinência ao objetivo. Se não houver verificação suficiente, omitir a instrução operacional ou registrar a pendência fora do texto publicável.",
      "",
      "Não afirmar que toda clínica está proibida de anunciar no Google ou que a Meta não oferece segmentação local. Quando houver impedimento específico, descrever serviço, condição e fonte.",
    ].join("\n"),
  },
  {
    heading: "Vocabulário e estilo",
    body: "- Não usar o caractere de travessão na copy. Preferir ponto, vírgula ou dois-pontos.\n- Evitar \"ecossistema\", \"sinergia\", \"alavancar\", \"motor de vendas\", \"revolucionário\" e outras expressões que não expliquem uma entrega.",
  },
  { heading: "Plano visual", body: "Evitar texto sobreposto desnecessário, rostos artificiais, logotipos de terceiros, números fictícios, dashboards falsos, antes e depois e promessas clínicas." },
];

test("defeito 5 · as exclusões que a Skill real declara: Instagram Shopping, ativação de loja e conselhos de lojas virtuais — e só elas", () => {
  const exclusoes = radarBrandVoiceExclusions({ sections: SKILL_ADALBAPRO });
  assert.deepEqual(exclusoes.map(item => item.label), ["Instagram Shopping", "ativação de loja", "conselhos de lojas virtuais"]);
  assert.ok(exclusoes.every(item => item.section === "Recursos antigos ou inadequados"));
  assert.match(exclusoes[0].rule, /^Não recomendar Instagram Shopping, ativação de loja ou tutoriais de configuração desse recurso nos artigos deste projeto\.$/);
  assert.match(exclusoes[2].rule, /^Não transportar conselhos de lojas virtuais para consultórios automaticamente\.$/);
  assert.deepEqual(radarBrandVoiceExclusions(null), []);
  assert.deepEqual(radarBrandVoiceExclusions({ sections: [] }), []);

  const qual = (texto: string) => radarBrandVoiceExclusionOf(texto, exclusoes)?.label ?? null;
  /* O caso real do CSV de Instagram e as outras formas do mesmo assunto. */
  assert.equal(qual("Diferenciar em \"Ative o Instagram Shopping\": a busca mostra que só 2 de 6 página(s) cobrem."), "Instagram Shopping");
  assert.equal(qual("Como usar o Shopping do Instagram na clínica"), "Instagram Shopping");
  assert.equal(qual("Ative a loja do Instagram"), "ativação de loja");
  assert.equal(qual("Ativação da sua loja no perfil"), "ativação de loja");
  assert.equal(qual("Agora a sua loja virtual"), "conselhos de lojas virtuais");
  assert.equal(qual("Dicas de e-commerce para vender mais"), "conselhos de lojas virtuais");
  assert.equal(qual("Como divulgar sua loja online"), "conselhos de lojas virtuais");
  /* O que não é exclusão: o canal, o Perfil da Empresa, as funcionalidades em geral e o vocabulário. */
  for (const livre of ["Como atrair clientes pelo Instagram", "Use os Destaques do Instagram", "Perfil da Empresa no Google", "Recursos de agendamento no site", "Ecossistema de canais da clínica", ""]) {
    assert.equal(qual(livre), null, livre);
  }
  const linha = radarBrandVoiceExclusionsLine(exclusoes) || "";
  assert.match(linha, /Instagram Shopping, ativação de loja, conselhos de lojas virtuais/);
  assert.match(linha, /"Recursos antigos ou inadequados"/);
  assert.doesNotMatch(linha, D10);
  assert.equal(radarBrandVoiceExclusionsLine([]), null);
});

test("defeito 5 · vale para qualquer marca: lista numa seção \"O que evitar\", com numeração no título", () => {
  const exclusoes = radarBrandVoiceExclusions({ sections: [{ heading: "7. O que evitar", body: "- Dropshipping\n- Promessa de cura\n- Nunca sugerir harmonização com fios de PDO\n- Não recomendar práticas de bronzeamento artificial." }] });
  assert.deepEqual(exclusoes.map(item => item.label), ["Dropshipping", "Promessa de cura", "harmonização com fios de PDO", "práticas de bronzeamento artificial"]);
  /* A cabeça de conselho ("práticas de") fica no rótulo e sai do padrão: o assunto é o bronzeamento artificial. */
  assert.equal(radarBrandVoiceExclusionOf("Bronzeamento artificial é seguro?", exclusoes)?.label, "práticas de bronzeamento artificial");
  assert.equal(radarBrandVoiceExclusionOf("Como fazer dropshipping de cosméticos", exclusoes)?.label, "Dropshipping");
  assert.equal(radarBrandVoiceExclusionOf("A promessa de cura vende mais?", exclusoes)?.label, "Promessa de cura");
  assert.equal(radarBrandVoiceExclusionOf("Cura e cicatrização depois do procedimento", exclusoes), null, "só uma das palavras não casa");
  assert.equal(exclusoes[0].section, "O que evitar");
});

/* ------------------------------ 3(c) e 6 · as sugestões ------------------------------ */

const QUALIFICADOS = ["leads qualificados", "leads qualificados o que é", "captação de leads qualificados", "gerar leads qualificados", "geração de leads qualificados", "lista de leads qualificados"];

test("3(c) e 5 · a sugestão não sugere o \"Não cobrir\" nem a exclusão da voz; a voz vem primeiro", () => {
  const voz = radarBrandVoiceExclusions({ sections: SKILL_ADALBAPRO });
  const leads = radarSuggestionGuard({ labels: ["Como identificar um lead qualificado na prática no dia a dia?"], core: QUALIFICADOS, voice: voz });
  /* O caso real de leads: o diferencial possível era o assunto que a nota punha fora (o assunto é o primeiro trecho entre aspas). */
  assert.deepEqual(
    leads("Diferencial possível: \"Como identificar leads qualificados\", tratado por um só site entre as 12 páginas comparáveis — aprofunde na seção \"O que é um lead qualificado?\", sem copiar o cabeçalho do concorrente."),
    { kind: "NAO_COBRIR", label: "Como identificar um lead qualificado na prática no dia a dia?" },
  );
  assert.equal(leads("Sustentar \"Por que gerar leads?\" como diferencial."), null);
  assert.equal(leads("Como gerar leads no LinkedIn?"), null);
  assert.equal(leads(""), null);

  const instagram = radarSuggestionGuard({ labels: [], core: ["como atrair clientes pelo instagram", "instagram não traz pacientes"], voice: voz });
  const veto = instagram("Diferenciar em \"Ative o Instagram Shopping\": a busca mostra que só 2 de 6 página(s) cobrem.");
  assert.equal(veto?.kind, "VOZ_DA_MARCA");
  assert.equal(veto?.label, "Instagram Shopping");
  assert.match(veto && veto.kind === "VOZ_DA_MARCA" ? veto.rule : "", /^Não recomendar Instagram Shopping/);
  assert.equal(instagram("Como prospectar clientes pelo Instagram com o Instagram Shopping")?.kind, "VOZ_DA_MARCA", "pergunta também");
  assert.equal(instagram("Destaques de forma estratégica"), null);
  /* A voz vence o "Não cobrir" quando os dois tocam a sugestão. */
  assert.equal(radarSuggestionGuard({ labels: ["Ative o Instagram Shopping"], core: ["instagram"], voice: voz })("Ative o Instagram Shopping")?.kind, "VOZ_DA_MARCA");
  /* Sem voz, a régua única do "Não cobrir" segue valendo. */
  assert.deepEqual(radarSuggestionGuard({ labels: ["Ative o Instagram Shopping"], core: ["instagram"] })("Ative o Instagram Shopping"), { kind: "NAO_COBRIR", label: "Ative o Instagram Shopping" });
});

test("6 · sustentar a própria keyword não é diferencial: a principal e as complementares saem; o assunto a mais fica", () => {
  assert.equal(radarSuggestionRestatesKeyword("Sustentar \"como atrair um cliente\" como diferencial.", ATRAIR), "como atrair um cliente");
  assert.equal(radarSuggestionRestatesKeyword("Sustentar \"como ganhar um cliente\" como diferencial.", ATRAIR), "como ganhar um cliente");
  assert.equal(radarSuggestionRestatesKeyword("Como atrair um cliente?", ATRAIR), "como atrair um cliente");
  assert.equal(radarSuggestionRestatesKeyword("Dicas de como conquistar clientes", ATRAIR), "como conquistar clientes", "a palavra de formato não muda o assunto");
  assert.equal(radarSuggestionRestatesKeyword("Sustentar \"como ganhar clientes\" como diferencial.", ATRAIR), "como ganhar um cliente", "o plural é a mesma keyword");
  for (const diferencial of [
    "Diferencial possível: \"Conheça o seu público\", tratado por um só site entre as 12 páginas comparáveis.",
    "Sustentar \"Por que gerar leads?\" como diferencial.",
    "Como ganhar clientes pelo Instagram",
    "",
  ]) assert.equal(radarSuggestionRestatesKeyword(diferencial, ATRAIR), null, diferencial);
  assert.equal(radarSuggestionRestatesKeyword("Sustentar \"leads qualificados\" como diferencial.", QUALIFICADOS), "leads qualificados");
  assert.equal(radarSuggestionRestatesKeyword("Sustentar \"leads qualificados\" como diferencial.", []), null);
});
