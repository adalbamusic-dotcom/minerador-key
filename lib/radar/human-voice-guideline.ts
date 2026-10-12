/**
 * ===== 2026-10-11 · A DIRETRIZ DE COMUNICAÇÃO HUMANA GUIADA PELA SERP (pedido do dono) =====
 *
 * Origem: os dois documentos do dono ("Diretrizes de comunicação humana" e
 * "Visão estratégica muito forte sobre a apatia dos conteúdos gerados por IA")
 * e as observações do Guardião de SEO do site dele sobre um artigo de teste.
 * Documento canônico para humanos: `docs/compartilhado/diretriz-de-comunicacao-humana.md`.
 * Contrato e precedência: Adendo G de `docs/05-radar/sdd-diretriz-editorial-pela-serp-2026-10-02.md`.
 *
 * UMA FONTE SÓ. O pedido do artigo-modelo, a linha "Silo" do CSV "Para escrever",
 * a linha "Voz da marca", os prompts do Redator, o roteiro de vídeo, a semente de
 * roteiro e carrossel e o catálogo do MCP montam o texto da diretriz por estas
 * funções. Nenhum outro módulo reescreve a regra: muda aqui, muda em todos.
 *
 * Módulo puro e sem dependência pesada (só a frase da âncora natural, que também
 * é um módulo sem dependência): entra em constantes de topo de outros módulos sem
 * fechar ciclo de carga.
 *
 * PRECEDÊNCIA (Adendo G): a SERP manda na substância (intenção, funil, tópicos,
 * perguntas, cobertura, medidas e formato; SERP > lógica > IA); esta diretriz manda
 * na VOZ. Onde a Skill de voz da marca suaviza o tom, vale esta diretriz; onde a
 * Skill protege fato, oferta, preço, credencial ou a dignidade da leitora, a Skill
 * vale. A trava de fonte (`pending-claims.ts`) e o D10 não mudam.
 */
import { RADAR_NATURAL_ANCHOR_RULE } from "./natural-anchor-rule.ts";

/** A versão da diretriz. Mudou uma regra, muda a data (e a versão das regras do artigo-modelo). */
export const RADAR_HUMAN_VOICE_GUIDELINE_VERSION = "2026-10-11";

/** Onde a diretriz nasceu (dito ao humano e à IA). */
export const RADAR_HUMAN_VOICE_ORIGIN = Object.freeze([
  "Diretrizes de comunicação humana (documento do dono, 2026-10-11)",
  "Visão estratégica muito forte sobre a apatia dos conteúdos gerados por IA (documento do dono, 2026-10-11)",
  "Observações do Guardião de SEO do site do dono sobre um artigo de teste (2026-10-11)",
]);

/**
 * ERRO PROPOSITAL: DESLIGADO. O dono pede "pequenos erros" como sinal humano. A
 * diretriz entrega isso como NATURALIDADE DE FALA (oralidade, repetição
 * intencional, frase quebrada, começo com "E" ou "Mas"), e o texto publicável sai
 * sem erro de ortografia ou de concordância proposital: o Guardião de SEO e a
 * autoria E-E-A-T leem qualidade, e o erro proposital vira ruído na correção.
 * Decisão a confirmar com o dono (Adendo G). Esta constante só documenta o estado:
 * nenhuma função gera erro, e ligá-la exige implementar a geração e uma nova
 * decisão registrada.
 */
export const RADAR_HUMAN_VOICE_INTENTIONAL_ERRORS = false as const;

/** Regra 8 do Guia do dono: de 3 a 6 H2 por artigo; o excedente vira H3. */
export const RADAR_HUMAN_VOICE_H2 = Object.freeze({ min: 3, max: 6 });
/** Opções de título que a planta entrega (o H1 e as alternativas). */
export const RADAR_HUMAN_VOICE_TITLE_OPTIONS = 3;
/** A keyword principal aparece nos primeiros N caracteres da meta description. */
export const RADAR_HUMAN_VOICE_KEYWORD_EARLY_CHARS = 60;
/** Os tetos de título e meta que o artigo-modelo já usa (SEO title ~60, meta ~155). */
export const RADAR_HUMAN_VOICE_SEO_TITLE_MAX = 60;
export const RADAR_HUMAN_VOICE_META_MAX = 155;

/** Uma regra da diretriz: o que é, como aplicar e o exemplo bom × ruim. */
export type RadarHumanVoiceRule = {
  id: string;
  title: string;
  what: string;
  how: string;
  good: string;
  bad: string;
};

/*
 * ============================== A VOZ ==============================
 *
 * Os exemplos "do dono" são citados dos documentos dele. A provocação mira a
 * situação, a receita, o mercado ou o "algoritmo"; a leitora é aliada.
 */
export const RADAR_HUMAN_VOICE_RULES: readonly RadarHumanVoiceRule[] = Object.freeze([
  {
    id: "serp-manda",
    title: "A SERP manda no conteúdo; a voz manda na forma",
    what: "Intenção, funil, tópicos, perguntas, cobertura, medidas e formato saem da investigação da SERP (SERP > lógica > IA). Esta diretriz decide como se diz, nunca o que se cobre.",
    how: "Não crie seção, tópico, pergunta nem promessa por causa da voz. A dor e o gancho são as perguntas reais da SERP (Pessoas também perguntam, buscas relacionadas) e o contraste com os títulos e as promessas do topo.",
    good: "A SERP pergunta \"qual o segredo para atrair clientes?\" e a abertura responde: \"Segredo? O que te venderam foi postar todo dia. E a agenda continua igual.\"",
    bad: "Criar uma seção \"o fim do Instagram\" só porque soa provocativo, sem pergunta da SERP que a peça.",
  },
  {
    id: "sem-eufemismo",
    title: "Choque de realidade, sem eufemismo",
    what: "Texto humano não suaviza: diz a situação como ela é. \"Politicamente incorreto\", no sentido do dono, é recusar o tom corporativo morno, a frase pronta e o texto certinho que cheira a robô.",
    how: "Fale sem rodeio da situação, do mercado, das receitas prontas, da agência genérica de posts e anúncios e da vida refém do feed. \"Desafio\" vira problema; \"pequenas diretrizes\" vira barreira.",
    good: "Postar todo dia e ver a agenda parada não é falta de esforço. É a receita errada.",
    bad: "As redes sociais apresentam alguns desafios que podem impactar seus resultados.",
  },
  {
    id: "emocao",
    title: "Emoção que a leitora reconhece",
    what: "Cada trecho carrega uma emoção da rotina: cansaço, frustração, dinheiro perdido, raiva da receita que não funciona, alívio quando a saída aparece.",
    how: "Ligue a emoção a uma situação observável da clínica e, logo depois, a uma explicação útil. Não repita a mesma dor em todas as seções: identifica uma vez e avança.",
    good: "O atendimento termina. A cobrança por conteúdo continua.",
    bad: "Sua clínica está invisível e vai morrer se não agir agora.",
  },
  {
    id: "provocacao",
    title: "Ironia, indireta e duplo sentido, com o alvo certo",
    what: "Ironia, sarcasmo, indireta e duplo sentido estão liberados. O alvo é a situação, a receita, o mercado ou o \"algoritmo\"; a leitora é aliada, nunca o alvo.",
    how: "Ataque \"o marketing que te venderam\", a solução mágica, a promessa da agência comum de posts e anúncios. Nunca a inteligência, a aparência ou a dignidade da profissional.",
    good: "\"Por que o marketing que te venderam para clínicas de estética não funciona na vida real\" (título de exemplo do dono).",
    bad: "\"Você ainda não entendeu o básico do marketing?\"",
  },
  {
    id: "ritmo",
    title: "Ritmo de fala, texto correto",
    what: "Humano não escreve reto: frases curtas e longas, quebra, pergunta direta, repetição intencional, começo com \"E\" ou \"Mas\", palavras fortes e oralidade com moderação (\"pra\", \"tá\").",
    how: "Varie o ritmo dentro do parágrafo. A naturalidade vem da fala; o texto publicado sai sem erro de ortografia ou de concordância proposital.",
    good: "E aí vem a parte que ninguém conta. Você posta. Posta de novo. E a mensagem que chega é de quem mora a 80 km.",
    bad: "Escrever \"agente vai\" ou \"os paciente\" de propósito para parecer humano.",
  },
  {
    id: "primeira-pessoa",
    title: "Primeira pessoa de quem assina (E-E-A-T)",
    what: "Quando quem assina é o especialista da aba Especialista, o texto pode falar na voz dele (\"eu vejo…\", \"no consultório…\"). A autoridade vem de quem estudou e pratica.",
    how: "Experiência só como relato delimitado do especialista (o parecer aceito, a fala dos vídeos da marca); nunca caso, número ou paciente inventado. Sem especialista definido, sem primeira pessoa de profissional.",
    good: "Eu vejo isso toda semana: a clínica posta, o anúncio cai e o dinheiro some. (com o especialista que assina)",
    bad: "\"Atendi 300 pacientes que dobraram o faturamento\", sem parecer nem fonte.",
  },
  {
    id: "fatos-travados",
    title: "Fatos travados: a dificuldade, não a proibição",
    what: "A voz não destrava fato. Afirmação sobre plataforma, conversão ou comportamento do público só entra com fonte do pacote ou delimitada (a trava de fonte de sempre).",
    how: "Sobre anúncio de saúde e estética no Google e na Meta, fale da dificuldade real (campanha reprovada, bloqueio na prática, banimento, conta caindo, dinheiro jogado fora), na voz e na experiência de quem assina, sem afirmar proibição universal como fato. O dono: \"não vai falar que está proibido\", e sim da dificuldade.",
    good: "Quem já tentou anunciar procedimento estético conhece a rotina: campanha reprovada, conta em análise, verba parada.",
    bad: "O Google proíbe anúncios de estética.",
  },
  {
    id: "gatilhos",
    title: "Gatilhos com dado real",
    what: "Dor, perda, medo de perder e contraste estão liberados. Escassez e urgência só com dado real da clínica (agenda, vagas, prazo dito pela marca).",
    how: "Nunca invente escassez, prazo, vaga ou condição especial.",
    good: "Cada mês sem aparecer na busca é paciente da sua região marcando com quem aparece.",
    bad: "\"Últimas vagas! Só hoje!\", sem dado da clínica.",
  },
  {
    id: "consciencia",
    title: "Começo no nível 3, fim no nível 2 de consciência",
    what: "Nível 3 (abertura): a leitora já reconhece o problema e já tentou as receitas conhecidas (posts, feed, anúncio, agência). Nível 2 (virada e fechamento): ela ainda não entende a busca orgânica como solução.",
    how: "A abertura fala com quem já tentou e mostra por que as receitas falham (choque de realidade). A virada e o fechamento explicam, sem sigla, a estrutura própria no Google: site, páginas de serviço, Perfil da Empresa no Google e artigos que respondem às perguntas reais de quem procura na região.",
    good: "Abertura: \"Você já postou, já impulsionou, já pagou agência. E a agenda?\" Fechamento: \"Quando alguém da sua região procura o procedimento no Google, aparece quem tem site e página explicando o serviço.\"",
    bad: "Abrir com \"O que é SEO local\" ou fechar com \"invista em E-E-A-T e silos\".",
  },
]);

/*
 * ============================== O QUE A SERP GUIA NA PÁGINA ==============================
 *
 * As observações do Guardião de SEO do dono viram regra onde não contrariam a SERP.
 */
export const RADAR_HUMAN_VOICE_SERP_RULES: readonly RadarHumanVoiceRule[] = Object.freeze([
  {
    id: "titulo",
    title: "H1 e SEO title: keyword no começo e gancho de contraste",
    what: `A keyword principal no começo; depois, o gancho de dor e contraste comercial que diferencia dos títulos do topo da SERP. ${RADAR_HUMAN_VOICE_TITLE_OPTIONS} opções (o H1 e duas alternativas); SEO title até ~${RADAR_HUMAN_VOICE_SEO_TITLE_MAX} caracteres.`,
    how: "Leia os títulos do topo (resultados orgânicos) e as perguntas da SERP: se o topo promete dicas e guias, o título promete o contraste e a saída. Nunca isca genérica (\"guia prático\", \"guia completo\", \"dicas\", \"o que é\", \"tudo sobre\").",
    good: "Como atrair um cliente sem depender de post e de anúncio que cai",
    bad: "Como atrair um cliente: guia prático para clínicas",
  },
  {
    id: "meta",
    title: "Meta description que dá motivo para clicar",
    what: `Dor, contraste, o que a leitora ganha e por que clicar mesmo com resposta de IA no topo (autoridade, serviço real, experiência de quem assina). Keyword nos primeiros ${RADAR_HUMAN_VOICE_KEYWORD_EARLY_CHARS} caracteres; até ~${RADAR_HUMAN_VOICE_META_MAX} caracteres.`,
    how: "Sem \"descubra\", \"aprenda\", \"dicas\" e \"guia prático\": a meta diz o que muda para quem lê, com a promessa que a página cumpre.",
    good: "Como atrair um cliente quando o feed não traz ninguém: o que muda com site, páginas de serviço e busca na sua região.",
    bad: "Descubra como atrair um cliente com estratégias práticas e dicas.",
  },
  {
    id: "inicio",
    title: "Keyword na primeira frase e no primeiro H2",
    what: "A primeira frase do corpo traz a keyword principal; o primeiro H2 traz a keyword ou um recorte forte dela.",
    how: "Nada de aquecimento antes da keyword: a primeira frase já responde à busca, na dor que a SERP mostra.",
    good: "Primeiro H2: \"Como atrair clientes quando o post não traz ninguém\"",
    bad: "Primeiro H2: \"Contexto do mercado\"",
  },
  {
    id: "h2",
    title: `De ${RADAR_HUMAN_VOICE_H2.min} a ${RADAR_HUMAN_VOICE_H2.max} H2 (Regra 8 do Guia)`,
    what: `O artigo tem de ${RADAR_HUMAN_VOICE_H2.min} a ${RADAR_HUMAN_VOICE_H2.max} H2. A cobertura que a SERP pede além disso vira H3 dentro da seção mais próxima pelo sentido; nada da cobertura obrigatória some.`,
    how: "Junte o que responde à mesma pergunta; o tópico que sobra entra como H3, com o conteúdo, os links e a imagem dele.",
    good: "Seis H2, cada um respondendo a uma pergunta diferente da leitora.",
    bad: "Oito H2, dois deles dizendo a mesma coisa com outro nome.",
  },
  {
    id: "autoridade-local",
    title: "Sinais de autoridade local (2 ou 3 por artigo)",
    what: "Escolha os que combinam com o trecho: o site como presença de captação local; as perguntas reais e a experiência da clínica virando autoridade; o contraste com a vida refém do feed e de posts soltos; a diferença para a agência comum de posts e anúncios.",
    how: "Mostre o método próprio da marca (SEO local, silos, E-E-A-T, sinais locais, captação própria) como entrega concreta, sem sigla na frente de quem é leigo.",
    good: "Cada pergunta que chega no WhatsApp vira uma página que responde antes da próxima pessoa perguntar.",
    bad: "\"Trabalhamos SEO local, silos e E-E-A-T\" solto, sem dizer o que isso entrega.",
  },
  {
    id: "fechamento",
    title: "Fechamento em 4 tempos, um CTA só",
    what: "Dor, mudança para a estrutura própria no Google, facilidade (a marca faz; a profissional só contribui com o que sabe) e diagnóstico, que é o CTA único que já existe.",
    how: "Nenhuma segunda chamada: a leitura seguinte, quando houver, vai no corpo.",
    good: "Cansou de postar para ninguém? A saída é ter a clínica achável no Google. Eu organizo site, páginas e artigos; você só conta o que faz. Vamos olhar como sua clínica aparece hoje?",
    bad: "Fechar com três chamadas (agende, siga no Instagram, baixe o e-book).",
  },
  {
    id: "imagens",
    title: "Capa obrigatória e imagem útil no corpo",
    what: "Uma capa e ao menos uma imagem útil no corpo (o plano visual pede dois ou três respiros, cada um ligado a uma seção).",
    how: "A imagem explica a ideia da seção; não prova resultado.",
    good: "Respiro na seção do caminho prático mostrando a pessoa procurando a clínica no celular, sem texto legível.",
    bad: "Artigo longo só com a capa.",
  },
  {
    id: "links",
    title: "Links internos reais",
    what: "Só os links do plano, cada um para a URL canônica do destino.",
    how: RADAR_NATURAL_ANCHOR_RULE,
    good: "\"…quem já comparou tráfego pago vs orgânico…\" com o link do artigo irmão.",
    bad: "Âncora que repete a keyword inteira do destino em todo artigo.",
  },
]);

/*
 * ============================== AS FRASES QUE VIAJAM ==============================
 */

/**
 * O NÚCLEO DA DIRETRIZ: a MESMA frase em todo entregável (pedido do artigo-modelo,
 * linha "Silo" do CSV, prompts do Redator, roteiro de vídeo, semente de roteiro e
 * carrossel, catálogo do MCP). Os testes conferem que ela chega igual a todos.
 */
export const RADAR_HUMAN_VOICE_CORE =
  `Comunicação humana guiada pela SERP (diretriz ${RADAR_HUMAN_VOICE_GUIDELINE_VERSION}): a SERP decide o que se cobre (intenção, tópicos, perguntas, medidas e formato); esta diretriz decide como se diz. Texto visceral e sem eufemismo, com emoção que a leitora reconhece (cansaço, frustração, dinheiro perdido, alívio), ironia e indireta contra a situação, a receita pronta, o mercado ou o "algoritmo", nunca contra a leitora; ritmo de fala (frases curtas e longas, pergunta direta, repetição intencional), com o texto publicado correto, sem erro proposital. Começo no nível 3 de consciência (quem já tentou posts, feed, anúncio e agência vê por que falharam) e fim no nível 2 (a busca orgânica explicada sem sigla, com a estrutura própria no Google). Fatos continuam travados: a dificuldade de anunciar saúde e estética é dita como experiência de quem assina, nunca como proibição universal; escassez e urgência só com dado real da clínica.`;

/** A precedência, dita igual ao humano e à IA. */
export const RADAR_HUMAN_VOICE_PRECEDENCE =
  "Precedência: a SERP manda na substância (SERP > lógica > IA) e a diretriz, na voz. Onde a Skill de voz da marca suaviza o tom, vale esta diretriz; onde a Skill protege fato, oferta, preço, credencial ou a dignidade da leitora, a Skill vale. A trava de fonte e o entregável concluído não mudam.";

/** O que a SERP guia na página (título, meta, começo, H2, autoridade, fechamento, imagens), numa frase. */
export const RADAR_HUMAN_VOICE_SERP_SUMMARY =
  `Título, meta e CTA pela SERP: H1 e SEO title com a keyword principal no começo e o gancho de dor e contraste que diferencia dos títulos do topo (${RADAR_HUMAN_VOICE_TITLE_OPTIONS} opções; nunca "guia prático", "dicas", "o que é" nem "tudo sobre"); meta description com dor, contraste, o ganho e o motivo para clicar mesmo com resposta de IA no topo, keyword nos primeiros ${RADAR_HUMAN_VOICE_KEYWORD_EARLY_CHARS} caracteres e até ~${RADAR_HUMAN_VOICE_META_MAX}; keyword na primeira frase do corpo e no primeiro H2 (inteira ou um recorte forte); de ${RADAR_HUMAN_VOICE_H2.min} a ${RADAR_HUMAN_VOICE_H2.max} H2, com o excedente como H3 sem perder cobertura; 2 ou 3 sinais de autoridade local (site como captação local, perguntas reais e experiência virando autoridade, contraste com feed e posts soltos, diferença para a agência comum); fechamento em 4 tempos (dor, estrutura própria no Google, facilidade, diagnóstico) com um CTA só; capa e ao menos uma imagem útil no corpo.`;

/** O fechamento em 4 tempos, como a coluna estrutura e o Redator o dizem. */
export const RADAR_HUMAN_VOICE_CLOSING_STEPS = Object.freeze([
  "dor (o que a leitora já sentiu com a receita pronta)",
  "mudança para a estrutura própria no Google",
  "facilidade (a marca faz; a profissional só contribui com o que sabe)",
  "diagnóstico (o CTA abaixo, a única chamada)",
]);

/** Os sinais de autoridade local, como a coluna estrutura os oferece (escolher 2 ou 3 pelo trecho). */
export const RADAR_HUMAN_VOICE_LOCAL_AUTHORITY = Object.freeze([
  "o site como presença de captação local",
  "as perguntas reais e a experiência da clínica virando autoridade",
  "o contraste com a vida refém do feed e de posts soltos",
  "a diferença para a agência comum de posts e anúncios",
]);

const comoLinha = (regra: RadarHumanVoiceRule) => `${regra.title}: ${regra.what} ${regra.how} Bom: ${regra.good} Ruim: ${regra.bad}`;

/**
 * O BLOCO DO PEDIDO DO ARTIGO-MODELO (as regras 27 e 28 do pedido). A planta
 * não escreve o texto, mas os campos que viram texto (promessa, ângulo, H1,
 * alternativas, SEO title, meta, abertura, resposta que abre cada seção, virada e
 * CTA) já saem nesta voz, e o resto do pedido continua mandando no conteúdo.
 */
export function radarHumanVoicePromptBlock(): string[] {
  return [
    `27. VOZ HUMANA GUIADA PELA SERP. ${RADAR_HUMAN_VOICE_CORE} ${RADAR_HUMAN_VOICE_PRECEDENCE} Nos campos que viram texto (promise, angle, title, opening.direction, answerFirst, closing.turn, closing.cta e os prompts de imagem), escreva nessa voz; a dor e o gancho vêm das evidências P, B e S (perguntas, buscas relacionadas e títulos do topo), nunca inventados; a diretriz não cria seção, H3, pergunta nem tópico. Em eeat, quando há quem assina, diga se a primeira pessoa dele cabe (relato delimitado, sem caso inventado).`,
    `28. TÍTULO, META, ESTRUTURA E FECHAMENTO PELA SERP. ${RADAR_HUMAN_VOICE_SERP_SUMMARY} Em title, h1 e as 2 alternatives são as ${RADAR_HUMAN_VOICE_TITLE_OPTIONS} opções, todas com a keyword principal no começo e um gancho diferente, cada uma contra o que os títulos do topo (evidências S e formato F) prometem. O primeiro H2 de sections traz a keyword ou um recorte forte dela; opening.direction diz que a primeira frase traz a keyword. sections tem de ${RADAR_HUMAN_VOICE_H2.min} a ${RADAR_HUMAN_VOICE_H2.max} itens: o que a SERP pede além disso entra como H3 da seção mais próxima pelo sentido. closing.turn leva os 3 primeiros tempos do fechamento (dor, estrutura própria no Google, facilidade) e closing.cta é o diagnóstico, a única chamada. Em eeat, liste os 2 ou 3 sinais de autoridade local que a planta usa e em que seção.`,
  ];
}

/** A regra geral da linha "Silo"/"Marca" do CSV "Para escrever" (uma regra numerada). */
export function radarHumanVoiceWritingRule(): string {
  return `${RADAR_HUMAN_VOICE_CORE} ${RADAR_HUMAN_VOICE_SERP_SUMMARY} ${RADAR_HUMAN_VOICE_PRECEDENCE} A definição completa, com exemplos bons e ruins, está em docs/compartilhado/diretriz-de-comunicacao-humana.md.`;
}

/** A frase da linha "Voz da marca": a precedência entre a Skill e a diretriz. */
export function radarHumanVoiceBrandVoiceRowNote(): string {
  return `A diretriz de comunicação humana (${RADAR_HUMAN_VOICE_GUIDELINE_VERSION}, regra geral da linha de topo) vale sobre esta linha onde ela suaviza o tom; esta linha vale onde protege fato, oferta, preço, credencial ou a dignidade da leitora.`;
}

/** O trecho dos prompts do Redator (escrita de seção e melhoria de trecho). */
export function radarHumanVoiceRedatorRule(): string {
  return `${RADAR_HUMAN_VOICE_CORE} ${RADAR_HUMAN_VOICE_PRECEDENCE} Na seção: a primeira frase do artigo traz a keyword principal; a seção que fecha o artigo segue os 4 tempos (dor, estrutura própria no Google, facilidade, diagnóstico no CTA único); os sinais de autoridade local entram quando o trecho pede (site como captação local, perguntas reais e experiência virando autoridade, contraste com feed e posts soltos, diferença para a agência comum). Primeira pessoa só na voz de quem assina e só com o relato que a evidência traz.`;
}

/** O trecho do roteiro de vídeo e da semente de roteiro e carrossel. */
export function radarHumanVoiceVideoRule(): string {
  return `${RADAR_HUMAN_VOICE_CORE} ${RADAR_HUMAN_VOICE_PRECEDENCE} No vídeo: gancho, título, descrição, fala e lâminas na mesma voz e com o mesmo contraste do artigo; o título começa pela keyword principal e promete o contraste com o que os vídeos do topo prometem, nunca "dicas" ou "guia"; a descrição abre pela dor e pela keyword; o fechamento segue os 4 tempos com um CTA só.`;
}

/** A nota do catálogo do MCP (AGENTS §17.1). */
export function radarHumanVoiceCatalogNote(): string {
  /* As versões ditas aqui são as de `RADAR_ARTICLE_BLUEPRINT_RULES_VERSION` e `WRITER_BLUEPRINT_READING_RULES` (o teste da diretriz confere). */
  return `Diretriz de comunicação humana guiada pela SERP (${RADAR_HUMAN_VOICE_GUIDELINE_VERSION}; pedido do dono; lib/radar/human-voice-guideline.ts e docs/compartilhado/diretriz-de-comunicacao-humana.md; vale no pedido do artigo-modelo, no CSV 'Para escrever', no CSV de vídeo, no Redator, na semente de roteiro e carrossel, em get_article_for_writing e get_video_material; regras do artigo-modelo '2026-10-11c', leitura do Redator '2026-10-11c').${RADAR_HUMAN_VOICE_CORE} ${RADAR_HUMAN_VOICE_SERP_SUMMARY} ${RADAR_HUMAN_VOICE_PRECEDENCE} Planta gravada com mais de ${RADAR_HUMAN_VOICE_H2.max} H2: a leitura compartilhada não muda o payload nem o hash e diz qual seção entra como H3 de qual (h2Merges no Redator; a linha da seção no CSV).`;
}

/*
 * ============================== AS CONFERÊNCIAS PURAS ==============================
 *
 * Leitura de palavras, não de sentido: servem à conferência da planta nova (nota)
 * e à leitura da planta gravada (instrução concluída na coluna).
 */

const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Plural simples: "clientes" e "cliente" são a mesma palavra para a régua (os dois lados passam pela mesma troca). */
const singular = (palavra: string): string => {
  if (palavra.length <= 3 || !palavra.endsWith("s")) return palavra;
  if (/(?:oes|aes)$/.test(palavra)) return `${palavra.slice(0, -3)}ao`;
  if (/[rz]es$/.test(palavra)) return palavra.slice(0, -2);
  return palavra.slice(0, -1);
};
const cruas = (valor: string | null | undefined): string[] =>
  semAcento(String(valor ?? "")).replace(/[^a-z0-9\s]+/g, " ").split(/\s+/).filter(Boolean);
const palavras = (valor: string | null | undefined): string[] => cruas(valor).map(singular);

const FUNCIONAIS = new Set(["a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "para", "pra", "por", "com", "sem", "como", "que", "qual", "quais", "se", "ao", "aos", "mais", "seu", "sua"]);

/** As iscas genéricas de guia e dica (as que o Guardião de SEO do dono aponta). */
const ISCAS: ReadonlyArray<{ rotulo: string; padrao: RegExp }> = [
  { rotulo: "guia prático", padrao: /\bguia\s+pratico\b/ },
  { rotulo: "guia completo", padrao: /\bguia\s+completo\b/ },
  { rotulo: "guia definitivo", padrao: /\bguia\s+definitivo\b/ },
  { rotulo: "dicas", padrao: /\bdicas?\b/ },
  { rotulo: "o que é", padrao: /\bo\s+que\s+(?:e|sao)\b/ },
  { rotulo: "tudo sobre", padrao: /\btudo\s+sobre\b/ },
  { rotulo: "tudo o que você precisa saber", padrao: /\btudo\s+o\s+que\s+(?:voce\s+)?precisa\s+saber\b/ },
  { rotulo: "descubra", padrao: /\bdescubra\b/ },
  { rotulo: "aprenda", padrao: /\baprenda\b/ },
  { rotulo: "saiba mais", padrao: /\bsaiba\s+mais\b/ },
];

/**
 * A ISCA GENÉRICA no texto ("guia prático", "dicas", "o que é", "tudo sobre",
 * "descubra"…), ou null. A isca que faz parte de uma keyword do artigo ("o que é
 * seo local") não conta: é o que o leitor busca.
 */
export function radarHumanVoiceGenericBait(texto: string | null | undefined, keywords: readonly (string | null | undefined)[] = []): string | null {
  const lido = semAcento(String(texto ?? ""));
  if (!lido.trim()) return null;
  const dasKeywords = keywords.map(item => semAcento(String(item ?? ""))).filter(Boolean);
  for (const isca of ISCAS) {
    if (!isca.padrao.test(lido)) continue;
    if (dasKeywords.some(keyword => isca.padrao.test(keyword))) continue;
    return isca.rotulo;
  }
  return null;
}

/** O texto COMEÇA pela keyword principal (sem acento, caixa, pontuação e plural simples). */
export function radarHumanVoiceStartsWithKeyword(texto: string | null | undefined, principal: string | null | undefined): boolean {
  const alvo = palavras(principal);
  if (!alvo.length) return true;
  const lido = palavras(texto);
  return alvo.every((palavra, indice) => lido[indice] === palavra);
}

/** A keyword principal inteira aparece nos primeiros N caracteres (meta description). */
export function radarHumanVoiceKeywordEarly(texto: string | null | undefined, principal: string | null | undefined, caracteres = RADAR_HUMAN_VOICE_KEYWORD_EARLY_CHARS): boolean {
  const alvo = palavras(principal);
  if (!alvo.length) return true;
  /* Os primeiros N caracteres, sem cortar a última palavra ao meio. */
  const inteiro = String(texto ?? "");
  const resto = inteiro.slice(caracteres).search(/\s/);
  const lido = palavras(resto < 0 ? inteiro : inteiro.slice(0, caracteres + resto));
  for (let inicio = 0; inicio + alvo.length <= lido.length; inicio += 1) {
    if (alvo.every((palavra, indice) => lido[inicio + indice] === palavra)) return true;
  }
  return false;
}

/**
 * O título traz a keyword inteira ou um RECORTE FORTE dela: todas as palavras de
 * conteúdo da principal (sem as funcionais: "como atrair um cliente" → "atrair",
 * "cliente"). Vale para o primeiro H2.
 */
export function radarHumanVoiceHeadingHasKeyword(titulo: string | null | undefined, principal: string | null | undefined): boolean {
  const conteudo = cruas(principal).filter(palavra => !FUNCIONAIS.has(palavra)).map(singular);
  if (!conteudo.length) return true;
  const lido = new Set(palavras(titulo));
  return conteudo.every(palavra => lido.has(palavra));
}

/**
 * A KEYWORD NO COMEÇO DE UMA ALTERNATIVA, SEM IA: o título "A: B" (ou "A — B",
 * "A | B") em que B começa pela keyword vira "B: A". Só troca de lugar as duas
 * metades, sem reescrever palavra; o que não tem essa forma volta igual.
 */
export function radarHumanVoiceTitleWithKeywordFirst(titulo: string, principal: string | null | undefined): string {
  if (!titulo || radarHumanVoiceStartsWithKeyword(titulo, principal)) return titulo;
  const partes = titulo.match(/^(.+?)\s*(?::|\s[—–|-])\s+(.+)$/);
  if (!partes) return titulo;
  const [, antes, depois] = partes;
  if (!radarHumanVoiceStartsWithKeyword(depois, principal)) return titulo;
  const cabeca = depois.replace(/[.?!\s]+$/, "");
  const primeira = cabeca.charAt(0).toLocaleUpperCase("pt-BR") + cabeca.slice(1);
  return `${primeira}: ${antes.trim()}`;
}
