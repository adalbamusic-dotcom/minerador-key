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
/**
 * Os primeiros N caracteres que o Google mostra do título (truncamento).
 * 2026-10-14 · K2 (SDD silo interligado): vale para o SEO title (a principal dentro
 * dos primeiros 60); a meta description deixou de ter essa obrigação (K4).
 */
export const RADAR_HUMAN_VOICE_KEYWORD_EARLY_CHARS = 60;

/*
 * ===== 2026-10-14 · KEYWORD SEM REPETIÇÃO ANTIGA (SEO SEMÂNTICO) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §7,
 * decisões D4 e D5 (decididas pelo dono em 2026-10-14). A regra "keyword no
 * começo" de H1, alternativas, SEO title, meta, primeira frase e primeiro H2
 * produziu 9 opções de título e meta começando por "Captação de pacientes
 * dentista…". Ela saiu; ficaram K1–K9:
 *   K1 forma natural da principal (português correto); K2 a principal natural uma
 *   vez no H1 e no SEO title, em qualquer posição, abrindo no máximo 1 das 3
 *   opções; K3 três ângulos (dor → saída, contraste com o topo, diagnóstico);
 *   K4 meta natural; K5 abertura nas primeiras ~100 palavras; K6 nenhum H2 abre
 *   pela principal nem por complementar; K7 teto de repetição e variações
 *   semânticas; K8 nenhuma marca de processo em título ou meta; K9 sem isca.
 * As conferências puras ficam no fim deste módulo (V1–V7 da SDD).
 */
/** A versão das regras de keyword e título (K1–K9). Mudou uma, muda a data. */
export const RADAR_KEYWORD_RULES_VERSION = "2026-10-14";
/** K2 · quantas das 3 opções de título a principal pode abrir. */
export const RADAR_HUMAN_VOICE_TITLE_KEYWORD_OPENERS_MAX = 1;
/** K5 · a abertura traz a principal (ou uma variação próxima) nas primeiras N palavras. */
export const RADAR_HUMAN_VOICE_OPENING_WORDS = 100;
/** K7 · o teto da forma natural da principal no corpo: base + palavras / porPalavras. */
export const RADAR_HUMAN_VOICE_KEYWORD_DENSITY = Object.freeze({ base: 2, wordsPerExtra: 600 });
/** K7 · as variações semânticas que a planta nova grava (cada uma com o id da evidência). */
export const RADAR_HUMAN_VOICE_SEMANTIC_VARIANTS = Object.freeze({ min: 6, max: 12 });
/** K3 · o Jaccard das raízes (tirando as da principal) a partir do qual duas opções são "a mesma frase". */
export const RADAR_HUMAN_VOICE_TITLE_SIMILARITY_MAX = 0.5;
/** K3 · os três ângulos das opções de título, ditos iguais ao pedido, ao CSV e ao catálogo. */
export const RADAR_HUMAN_VOICE_TITLE_ANGLES = Object.freeze([
  "dor → saída",
  "contraste com o que o topo da SERP promete (as \"dicas\" e os números)",
  "diagnóstico ou decisão (fundo de funil)",
]);
/** A precedência da keyword sobre a voz (§7.1 da SDD), dita igual onde a regra de keyword vai. */
export const RADAR_KEYWORD_PRECEDENCE =
  "Keyword é substância de SEO, não tom: onde a Skill de voz da marca protege a gramática e proíbe densidade artificial de repetição, a Skill vale.";
/*
 * ===== 2026-10-14b · F3 · FECHAMENTO EM 4 CAMPOS, DIFERENCIAL DA MARCA E RESSALVAS =====
 *
 * SDD silo interligado §9 (D7 e D8, decididas pelo dono em 2026-10-14). O
 * fechamento tem 4 campos conferidos (dor, mudança para a estrutura própria,
 * facilidade, diagnóstico), e o diagnóstico é o CTA ÚNICO: a fala aprovada do
 * especialista alimenta a mudança e a facilidade, na voz dele, e deixa de
 * substituir o diagnóstico (muda o item 6 do Adendo F). A oferta de diagnóstico
 * é da Skill de voz da Marca (D8). E as ressalvas deixam de vir em série: o
 * caso real tinha 52 "não", 45 "pode" e 0 dado próprio.
 */
/** A versão das regras de fechamento, diferencial e ressalva (F3). Mudou uma, muda a data. */
export const RADAR_CLOSING_RULES_VERSION = "2026-10-14b";
/** D7 · Onde a fala aprovada do especialista entra no fechamento (dito igual ao pedido, ao CSV e ao catálogo). */
export const RADAR_CLOSING_SPECIALIST_RULE =
  "A fala aprovada do especialista entra na mudança para a estrutura e na facilidade, na voz dele; o CTA único é o diagnóstico (o que a marca verifica e uma chamada só), pela oferta da Skill de voz.";
/** F3 · A regra das ressalvas: afirmação delimitada e concreta, ressalva uma vez, onde a afirmação está. */
export const RADAR_HUMAN_VOICE_RESERVATION_RULE =
  "Ressalvas: afirme de forma delimitada e concreta (o que a marca verifica, faz ou mede, com número e fonte quando o pacote os traz); a ressalva vai UMA vez, onde a afirmação está, nunca \"pode\" e \"não garante\" em série; sem fonte nem experiência da marca, corte a afirmação.";

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
  /* 2026-10-14 · K1–K4 e K8 (SDD silo interligado, D4): a principal natural uma vez, em qualquer posição; 3 ângulos; meta natural; nenhuma marca de processo. */
  {
    id: "titulo",
    title: "H1 e SEO title: a principal natural uma vez e três ângulos",
    what: `A keyword principal, na forma natural (português correto, com a preposição e a flexão que a frase pede), aparece uma vez no H1 e uma vez no SEO title, em qualquer posição: o gancho pode vir primeiro, e a principal abre no máximo ${RADAR_HUMAN_VOICE_TITLE_KEYWORD_OPENERS_MAX} das ${RADAR_HUMAN_VOICE_TITLE_OPTIONS} opções (o H1 e duas alternativas). Cada opção tem um ângulo: ${RADAR_HUMAN_VOICE_TITLE_ANGLES.join("; ")}. SEO title até ~${RADAR_HUMAN_VOICE_SEO_TITLE_MAX} caracteres, com a principal dentro dos primeiros ${RADAR_HUMAN_VOICE_KEYWORD_EARLY_CHARS}.`,
    how: "Leia os títulos do topo (resultados orgânicos) e as perguntas da SERP: se o topo promete dicas e guias, o título promete o contraste e a saída. Nunca isca genérica (\"guia prático\", \"guia completo\", \"dicas\", \"o que é\", \"tudo sobre\") nem marca de processo (\"(precisa de fonte…)\", colchetes de instrução, número de link, \"TODO\"): a afirmação que só entra com fonte sai do título e vira promessa delimitada pela marca.",
    good: "A agenda sobe com o anúncio e cai quando ele para? Captação de pacientes para dentista com estrutura própria",
    bad: "Três opções que começam igual: \"Captação de pacientes dentista sem anúncios: …\", \"Captação de pacientes dentista sem verba: …\", \"Captação de pacientes dentista no orgânico: …\"",
  },
  {
    id: "meta",
    title: "Meta description natural que dá motivo para clicar",
    what: `Dor ou contraste, o que a leitora ganha e por que clicar mesmo com resposta de IA no topo (autoridade, serviço real, experiência de quem assina). A principal ou uma variação próxima aparece uma vez, em qualquer posição; até ~${RADAR_HUMAN_VOICE_META_MAX} caracteres. As ${RADAR_HUMAN_VOICE_TITLE_OPTIONS} opções seguem os ângulos do título.`,
    how: "Sem \"descubra\", \"aprenda\", \"dicas\" e \"guia prático\" e sem marca de processo: a meta diz o que muda para quem lê, com a promessa que a página cumpre.",
    good: "Post, anúncio e agência e a agenda ainda oscila? Veja como site, perfil no Google e respostas às perguntas da recepção ajudam a captação de pacientes para dentista.",
    bad: "Captação de pacientes dentista sem anúncio: o que o orgânico entrega, o que cobra de você e por onde começar a rotina.",
  },
  /* 2026-10-14 · K5–K7 (D5): a abertura responde à busca; nenhum H2 abre pela keyword; teto de repetição e variações. */
  {
    id: "inicio",
    title: "A abertura responde à busca; nenhum H2 abre pela keyword",
    what: `O primeiro parágrafo responde à busca com a principal (forma natural) ou uma variação próxima nas primeiras ~${RADAR_HUMAN_VOICE_OPENING_WORDS} palavras, sem obrigar a primeira frase. Os H2 seguem os subtemas, as entidades e as perguntas reais da SERP: nenhum H2 começa pela principal nem por uma complementar; a principal entra em no máximo 1 H2; cada complementar entra dentro da seção que trata dela (num H2, só natural, fora do começo e em um H2 só); dois H2 não começam pelas mesmas 2 palavras de conteúdo.`,
    how: `No corpo, a forma natural da principal aparece no máximo ${RADAR_HUMAN_VOICE_KEYWORD_DENSITY.base} + palavras/${RADAR_HUMAN_VOICE_KEYWORD_DENSITY.wordsPerExtra} vezes (cerca de 7 em 3.000 palavras); o resto é variação semântica: sinônimos, entidades e buscas relacionadas que a SERP mostra.`,
    good: "H2: \"Por que a agenda sobe com o anúncio e cai quando ele para\"",
    bad: "H2: \"Captação de pacientes dentista sem anúncios começa pelo orgânico\" e \"Tráfego orgânico como fazer para captar pacientes no dia a dia\"",
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
  /* 2026-10-14b · F3 (D7 e D8): os 4 tempos viram 4 campos conferidos; o diagnóstico é o CTA único, com a oferta da Skill; a fala do especialista vai para a mudança e a facilidade. */
  {
    id: "fechamento",
    title: "Fechamento em 4 tempos, um CTA só",
    what: "Dor, mudança para a estrutura própria no Google, facilidade (a marca faz; a profissional só contribui com o que sabe) e diagnóstico, que é o CTA único: uma verificação concreta da marca (verbo + o que ela olha) e uma chamada só, com a oferta de diagnóstico da Skill de voz da marca.",
    how: `Nenhuma segunda chamada: a leitura seguinte, quando houver, vai no corpo. ${RADAR_CLOSING_SPECIALIST_RULE}`,
    good: "Se a agenda depende do mês em que o anúncio roda, você está alugando a atenção do paciente. A saída é o consultório achável no Google: uma página por tratamento, o perfil coerente com o site e as perguntas da recepção respondidas. Eu pesquiso, escrevo e publico; você revisa o que é clínico. Quer saber por onde começar? Eu olho seu site, seu perfil no Google e as perguntas que mais chegam, e te digo o que falta.",
    bad: "Fechar com três chamadas (agende, siga no Instagram, baixe o e-book), ou pôr a fala inteira do especialista (\"Vamos planejar a presença orgânica da sua clínica?\") no lugar do diagnóstico.",
  },
  /* 2026-10-14b · F3: as ressalvas uma vez, onde a afirmação está; afirmação delimitada e concreta. */
  {
    id: "ressalvas",
    title: "Afirmação concreta, ressalva uma vez",
    what: RADAR_HUMAN_VOICE_RESERVATION_RULE,
    how: "Troque a série de \"pode\" e \"não garante\" por o que a marca verifica, faz ou mede; quando o pacote traz número ou fonte, use; a trava de fonte continua: o fato sem fonte sai ou vira o que a marca verifica.",
    good: "Eu olho as perguntas que chegam na recepção e transformo as cinco mais repetidas em páginas. (o que a marca faz, delimitado)",
    bad: "O orgânico pode ajudar, mas não garante resultado, não significa agenda cheia e pode levar tempo. (ressalvas em série, nenhum dado)",
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
/* 2026-10-14 · K1–K9 (SDD silo interligado, D4 e D5): a principal natural uma vez, sem prefixo fixo, 3 ângulos, meta natural, abertura, H2 sem keyword no começo, teto e variações; a precedência da keyword no fim. */
export const RADAR_HUMAN_VOICE_SERP_SUMMARY =
  `Título, meta e CTA pela SERP (regras de keyword ${RADAR_KEYWORD_RULES_VERSION}): a keyword principal na forma natural (português correto) aparece uma vez no H1 e uma vez no SEO title, em qualquer posição, e abre no máximo ${RADAR_HUMAN_VOICE_TITLE_KEYWORD_OPENERS_MAX} das ${RADAR_HUMAN_VOICE_TITLE_OPTIONS} opções de título, cada uma com um ângulo (${RADAR_HUMAN_VOICE_TITLE_ANGLES.join("; ")}), sem "guia prático", "dicas", "o que é" nem "tudo sobre" e sem marca de processo ("(precisa de fonte…)", colchetes de instrução); SEO title até ~${RADAR_HUMAN_VOICE_SEO_TITLE_MAX} caracteres, com a principal dentro dos primeiros ${RADAR_HUMAN_VOICE_KEYWORD_EARLY_CHARS}; meta description natural, com dor ou contraste, o ganho e o motivo para clicar mesmo com resposta de IA no topo, a principal ou uma variação próxima uma vez, até ~${RADAR_HUMAN_VOICE_META_MAX}; o primeiro parágrafo responde à busca com a principal ou uma variação próxima nas primeiras ~${RADAR_HUMAN_VOICE_OPENING_WORDS} palavras; nenhum H2 começa pela principal nem por uma complementar (a principal em no máximo 1 H2; a complementar dentro da seção que trata dela); no corpo, a principal no máximo ${RADAR_HUMAN_VOICE_KEYWORD_DENSITY.base} + palavras/${RADAR_HUMAN_VOICE_KEYWORD_DENSITY.wordsPerExtra} vezes, e o resto em variações semânticas da SERP (sinônimos, entidades, buscas relacionadas); de ${RADAR_HUMAN_VOICE_H2.min} a ${RADAR_HUMAN_VOICE_H2.max} H2, com o excedente como H3 sem perder cobertura; 2 ou 3 sinais de autoridade local (site como captação local, perguntas reais e experiência virando autoridade, contraste com feed e posts soltos, diferença para a agência comum); fechamento em 4 tempos (dor, estrutura própria no Google, facilidade, diagnóstico) com um CTA só; capa e ao menos uma imagem útil no corpo. ${RADAR_KEYWORD_PRECEDENCE}`;

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
    /* 2026-10-14 · K1–K8 (SDD silo interligado): a forma natural gravada, as 3 opções com ângulos, a meta natural, os H2 sem keyword no começo e as variações com o id da evidência. */
    `28. TÍTULO, META, ESTRUTURA E FECHAMENTO PELA SERP. ${RADAR_HUMAN_VOICE_SERP_SUMMARY} Em title.principalNatural, grave a keyword principal na forma natural (a mesma ordem de palavras de conteúdo, com a preposição e a flexão que o português pede; igual à principal quando ela já é gramatical). Em title, h1 e as 2 alternatives são as ${RADAR_HUMAN_VOICE_TITLE_OPTIONS} opções: a forma natural aparece uma vez em cada uma (no h1, obrigatória; numa alternativa, pode ser uma variação próxima), abre no máximo ${RADAR_HUMAN_VOICE_TITLE_KEYWORD_OPENERS_MAX} delas, e cada uma tem um ângulo: (a) ${RADAR_HUMAN_VOICE_TITLE_ANGLES[0]}; (b) ${RADAR_HUMAN_VOICE_TITLE_ANGLES[1]}, contra os títulos do topo (evidências S e formato F); (c) ${RADAR_HUMAN_VOICE_TITLE_ANGLES[2]}. As 3 não começam pelas mesmas palavras. seoTitle traz a forma natural uma vez, dentro dos primeiros ${RADAR_HUMAN_VOICE_KEYWORD_EARLY_CHARS} caracteres; metaDescription é natural, com a principal ou uma variação próxima uma vez. Nenhum h2 de sections começa pela keyword principal nem por uma complementar; a principal entra em no máximo 1 h2; a complementar vai dentro da seção que trata dela (keywordPlan.complementary diz qual seção, não "H2"). opening.direction diz que o primeiro parágrafo responde à busca com a principal ou uma variação próxima nas primeiras ~${RADAR_HUMAN_VOICE_OPENING_WORDS} palavras. Em semanticVariants, de ${RADAR_HUMAN_VOICE_SEMANTIC_VARIANTS.min} a ${RADAR_HUMAN_VOICE_SEMANTIC_VARIANTS.max} variações da keyword (sinônimos, entidades e buscas relacionadas do pacote), cada uma com o id da evidência de onde vem (C, B, P ou S). Título e meta nunca levam marca de processo: a afirmação que só entra com fonte sai do título e vira promessa delimitada pela marca. sections tem de ${RADAR_HUMAN_VOICE_H2.min} a ${RADAR_HUMAN_VOICE_H2.max} itens: o que a SERP pede além disso entra como H3 da seção mais próxima pelo sentido. O fechamento tem 4 campos (regras ${RADAR_CLOSING_RULES_VERSION}): closing.pain (a dor que a leitora já sentiu com a receita pronta), closing.structureShift (a mudança para a estrutura própria no Google), closing.ease (a facilidade: quem faz é a marca, a leitora só contribui com o que sabe) e closing.diagnosis (o diagnóstico, a única chamada: o que a marca verifica, verbo + objeto, e uma chamada só, pela oferta de diagnóstico do pacote); closing.turn e closing.cta podem vir vazios (o servidor os monta dos 4 campos). ${RADAR_CLOSING_SPECIALIST_RULE} Em eeat, liste os 2 ou 3 sinais de autoridade local que a planta usa e em que seção. ${RADAR_HUMAN_VOICE_RESERVATION_RULE}`,
  ];
}

/** A regra geral da linha "Silo"/"Marca" do CSV "Para escrever" (uma regra numerada). */
export function radarHumanVoiceWritingRule(): string {
  /* 2026-10-14b · F3 · as ressalvas uma vez, na mesma regra geral 12 (o fechamento D7 vai à estrutura de cada artigo, com a fala do especialista). */
  return `${RADAR_HUMAN_VOICE_CORE} ${RADAR_HUMAN_VOICE_SERP_SUMMARY} ${RADAR_HUMAN_VOICE_RESERVATION_RULE} ${RADAR_HUMAN_VOICE_PRECEDENCE} A definição completa, com exemplos bons e ruins, está em docs/compartilhado/diretriz-de-comunicacao-humana.md.`;
}

/** A frase da linha "Voz da marca": a precedência entre a Skill e a diretriz. */
export function radarHumanVoiceBrandVoiceRowNote(): string {
  return `A diretriz de comunicação humana (${RADAR_HUMAN_VOICE_GUIDELINE_VERSION}, regra geral da linha de topo) vale sobre esta linha onde ela suaviza o tom; esta linha vale onde protege fato, oferta, preço, credencial ou a dignidade da leitora.`;
}

/** O trecho dos prompts do Redator (escrita de seção e melhoria de trecho). */
export function radarHumanVoiceRedatorRule(): string {
  /* 2026-10-14 · K5–K7 (SDD silo interligado): a abertura nas primeiras ~100 palavras, nenhum H2 pela keyword, teto e variações (no lugar de "a primeira frase traz a keyword"). */
  return `${RADAR_HUMAN_VOICE_CORE} ${RADAR_HUMAN_VOICE_PRECEDENCE} ${RADAR_KEYWORD_PRECEDENCE} Na seção: o primeiro parágrafo do artigo responde à busca com a keyword principal na forma natural (ou uma variação próxima) nas primeiras ~${RADAR_HUMAN_VOICE_OPENING_WORDS} palavras; nenhum H2 começa pela keyword principal nem por uma complementar; no corpo, a forma natural da principal no máximo ${RADAR_HUMAN_VOICE_KEYWORD_DENSITY.base} + palavras/${RADAR_HUMAN_VOICE_KEYWORD_DENSITY.wordsPerExtra} vezes, o resto em variações (sinônimos, entidades e buscas relacionadas); a seção que fecha o artigo segue os 4 tempos (dor, estrutura própria no Google, facilidade, diagnóstico no CTA único); os sinais de autoridade local entram quando o trecho pede (site como captação local, perguntas reais e experiência virando autoridade, contraste com feed e posts soltos, diferença para a agência comum). Primeira pessoa só na voz de quem assina e só com o relato que a evidência traz. ${RADAR_HUMAN_VOICE_RESERVATION_RULE}`;
}

/** O trecho do roteiro de vídeo e da semente de roteiro e carrossel. */
export function radarHumanVoiceVideoRule(): string {
  /* 2026-10-14 · F6 (SDD silo interligado §10) · K2/K3 no vídeo: a principal natural nas primeiras ~60 letras, nunca prefixo fixo; 3 ângulos; o diagnóstico como CTA único. */
  return `${RADAR_HUMAN_VOICE_CORE} ${RADAR_HUMAN_VOICE_PRECEDENCE} No vídeo: gancho, título, descrição, fala e lâminas na mesma voz e com o mesmo contraste do artigo; o título traz a keyword principal na forma natural, uma vez, dentro das primeiras ~60 letras (nunca como prefixo fixo: ela abre no máximo 1 das 3 opções), e as 3 opções têm ângulos diferentes (dor → saída; contraste com o que os vídeos do topo prometem; diagnóstico), nunca "dicas" ou "guia"; a descrição abre pela dor, com a keyword natural nas primeiras linhas; as fontes de autoridade são citadas pelo nome da entidade; o fechamento segue os 4 tempos com o diagnóstico como CTA único.`;
}

/** A nota do catálogo do MCP (AGENTS §17.1). */
export function radarHumanVoiceCatalogNote(): string {
  /* As versões ditas aqui são as de `RADAR_ARTICLE_BLUEPRINT_RULES_VERSION` e `WRITER_BLUEPRINT_READING_RULES` (o teste da diretriz confere). */
  return `Diretriz de comunicação humana guiada pela SERP (${RADAR_HUMAN_VOICE_GUIDELINE_VERSION}; pedido do dono; lib/radar/human-voice-guideline.ts e docs/compartilhado/diretriz-de-comunicacao-humana.md; vale no pedido do artigo-modelo, no CSV 'Para escrever', no CSV de vídeo, no Redator, na semente de roteiro e carrossel, em get_article_for_writing e get_video_material; regras do artigo-modelo '2026-10-14c', leitura do Redator '2026-10-14'; regras de keyword e título ${RADAR_KEYWORD_RULES_VERSION}; fechamento em 4 campos, diferencial da marca, análise competitiva e ressalvas ${RADAR_CLOSING_RULES_VERSION}; fontes externas de autoridade no texto 2026-10-14c (§16.2), SDD docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md; no vídeo, desde a F6 (2026-10-14), as mesmas regras de keyword e título — a principal natural nas primeiras ~60 letras, nunca prefixo fixo, 3 ângulos — e o vídeo em 4 partes: vídeo longo com o gabarito do YouTube e o arco de storytelling, curtos de ~15 s por micro-assunto, um carrossel por curto, e as fontes de autoridade e o fechamento em 4 tempos nas três saídas).${RADAR_HUMAN_VOICE_CORE} ${RADAR_HUMAN_VOICE_SERP_SUMMARY} ${RADAR_HUMAN_VOICE_PRECEDENCE} Planta gravada com mais de ${RADAR_HUMAN_VOICE_H2.max} H2: a leitura compartilhada não muda o payload nem o hash e diz qual seção entra como H3 de qual (h2Merges no Redator; a linha da seção no CSV). Planta gravada antes de ${RADAR_KEYWORD_RULES_VERSION} (D6, sem IA e sem mudar o payload nem o hash): a leitura tira a marca de processo do H1, das alternativas, do SEO title e da meta (a afirmação que só entra com fonte continua na lista do fim da coluna estrutura) e diz, como instrução concluída, a forma natural da principal, as opções que abrem pela keyword, os H2 que abrem pela keyword ou por uma complementar, o teto de repetição e as variações; H2 reescritos e os 3 ângulos de título só organizando de novo.`;
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
 *
 * 2026-10-14 · DESLIGADA (K2, SDD silo interligado): nenhum entregável a aplica
 * mais — a keyword deixou de ser prefixo obrigatório. Fica exportada até a F1
 * fechar, para rollback (§7.2 da SDD).
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

/*
 * ===== 2026-10-14 · AS CONFERÊNCIAS DE KEYWORD (V1–V7 da SDD silo interligado) =====
 *
 * Leitura de palavras, não de sentido, como as de cima: servem à conferência da
 * planta nova (nota que a passada de correção resolve) e à leitura da planta
 * gravada (instrução concluída na coluna, D6 e D10). A forma natural da principal
 * é aceita pelas MESMAS palavras de conteúdo, na mesma ordem, com só conectivos
 * entre elas ("captação de pacientes dentista" casa com "captação de pacientes
 * para dentista"); a forma crua é a sequência inteira, colada.
 */

/** Os conectivos que a forma natural pode pôr entre duas palavras de conteúdo da keyword. */
const CONECTIVOS = new Set(["a", "o", "as", "os", "um", "uma", "de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos", "e", "para", "pra", "ao", "aos"]);
const MAXIMO_DE_CONECTIVOS = 2;

/** As palavras de conteúdo (sem as funcionais), no singular simples, na ordem. */
const conteudoDe = (valor: string | null | undefined): string[] => cruas(valor).filter(palavra => !FUNCIONAIS.has(palavra)).map(singular);

/** Os inícios (índice da palavra) de cada vez que a sequência de conteúdo da keyword aparece no texto, sem sobrepor. */
function inicioDasOcorrencias(texto: string | null | undefined, keyword: string | null | undefined): number[] {
  const alvo = conteudoDe(keyword);
  if (!alvo.length) return [];
  const lidas = cruas(texto);
  const inicios: number[] = [];
  let indice = 0;
  while (indice < lidas.length) {
    if (singular(lidas[indice]) !== alvo[0]) { indice += 1; continue; }
    let posicao = indice + 1;
    let casou = 1;
    while (casou < alvo.length && posicao < lidas.length) {
      let pulos = 0;
      while (posicao < lidas.length && CONECTIVOS.has(lidas[posicao]) && singular(lidas[posicao]) !== alvo[casou] && pulos < MAXIMO_DE_CONECTIVOS) { posicao += 1; pulos += 1; }
      if (posicao < lidas.length && singular(lidas[posicao]) === alvo[casou]) { casou += 1; posicao += 1; continue; }
      break;
    }
    if (casou === alvo.length) { inicios.push(indice); indice = posicao; } else indice += 1;
  }
  return inicios;
}

/** K1/V3 · Quantas vezes a keyword (crua ou na forma natural) aparece no texto. */
export function radarKeywordOccurrences(texto: string | null | undefined, keyword: string | null | undefined): number {
  return inicioDasOcorrencias(texto, keyword).length;
}

/** K1 · A keyword aparece no texto, crua ou na forma natural (as mesmas palavras de conteúdo, na mesma ordem). */
export const radarKeywordNaturalPresent = (texto: string | null | undefined, keyword: string | null | undefined): boolean =>
  radarKeywordOccurrences(texto, keyword) > 0;

/** K2 · A keyword (crua ou natural) aparece dentro dos primeiros N caracteres (truncamento do SEO title), sem cortar palavra ao meio. */
export function radarKeywordWithinChars(texto: string | null | undefined, keyword: string | null | undefined, caracteres = RADAR_HUMAN_VOICE_KEYWORD_EARLY_CHARS): boolean {
  if (!conteudoDe(keyword).length) return true;
  const inteiro = String(texto ?? "");
  const resto = inteiro.slice(caracteres).search(/\s/);
  return radarKeywordNaturalPresent(resto < 0 ? inteiro : inteiro.slice(0, caracteres + resto), keyword);
}

/** V5 · A forma CRUA inteira, colada (com as funcionais dela), aparece no texto. */
export function radarKeywordCrudeFormPresent(texto: string | null | undefined, crua: string | null | undefined): boolean {
  const alvo = palavras(crua);
  if (!alvo.length) return false;
  const lido = palavras(texto);
  for (let inicio = 0; inicio + alvo.length <= lido.length; inicio += 1) {
    if (alvo.every((palavra, indice) => lido[inicio + indice] === palavra)) return true;
  }
  return false;
}

/** V5 · A forma crua difere da natural (a natural acrescenta preposição ou flexão): só então a crua é "não gramatical". */
export const radarKeywordCrudeDiffersFromNatural = (crua: string | null | undefined, natural: string | null | undefined): boolean =>
  Boolean(String(natural ?? "").trim()) && palavras(crua).join(" ") !== palavras(natural).join(" ");

/**
 * V1/K6 · O título (H2 ou opção de título) COMEÇA pela keyword: as primeiras
 * palavras de conteúdo dele são as da keyword, na ordem ("Como atrair clientes no
 * dia a dia?" começa por "como atrair um cliente"; "Tráfego orgânico como fazer
 * para…" começa por "tráfego orgânico como fazer").
 */
export function radarHeadingStartsWithKeyword(titulo: string | null | undefined, keyword: string | null | undefined): boolean {
  const alvo = conteudoDe(keyword);
  if (!alvo.length) return false;
  const lido = conteudoDe(titulo);
  return alvo.length <= lido.length && alvo.every((palavra, indice) => lido[indice] === palavra);
}

/** K6 · Os pares de H2 que começam pelas mesmas N palavras de conteúdo (índices na ordem dada). */
export function radarHeadingsSameOpening(titulos: readonly string[], quantas = 2): Array<[number, number]> {
  const aberturas = titulos.map(titulo => conteudoDe(titulo).slice(0, quantas));
  const pares: Array<[number, number]> = [];
  for (let a = 0; a < aberturas.length; a += 1) {
    for (let b = a + 1; b < aberturas.length; b += 1) {
      if (aberturas[a].length === quantas && aberturas[a].join(" ") === aberturas[b].join(" ")) pares.push([a, b]);
    }
  }
  return pares;
}

/** K2/V6 · Quantas opções de título a principal abre. */
export const radarTitleOptionsOpenedByKeyword = (opcoes: readonly string[], principal: string | null | undefined): number =>
  opcoes.filter(opcao => radarHeadingStartsWithKeyword(opcao, principal)).length;

/**
 * K3/V6 · AS 3 OPÇÕES TÊM ÂNGULOS DIFERENTES. Duas opções são "a mesma frase"
 * quando começam pelas mesmas 3 palavras de conteúdo, ou quando o Jaccard das
 * raízes delas, tirando as da principal, passa de 0,5. Devolve os pares (índices).
 */
export function radarTitleOptionsDistinct(opcoes: readonly string[], principal: string | null | undefined): { distinct: boolean; sameOpening: Array<[number, number]>; similar: Array<[number, number]> } {
  const daPrincipal = new Set(conteudoDe(principal));
  const raizes = opcoes.map(opcao => new Set(conteudoDe(opcao).filter(palavra => !daPrincipal.has(palavra))));
  const sameOpening = radarHeadingsSameOpening(opcoes, 3);
  const similar: Array<[number, number]> = [];
  for (let a = 0; a < raizes.length; a += 1) {
    for (let b = a + 1; b < raizes.length; b += 1) {
      const uniao = new Set([...raizes[a], ...raizes[b]]);
      if (!uniao.size) continue;
      const comuns = [...raizes[a]].filter(raiz => raizes[b].has(raiz)).length;
      if (comuns / uniao.size >= RADAR_HUMAN_VOICE_TITLE_SIMILARITY_MAX) similar.push([a, b]);
    }
  }
  return { distinct: !sameOpening.length && !similar.length, sameOpening, similar };
}

/*
 * K8/V4 · A MARCA DE PROCESSO EM TÍTULO OU META. "(precisa de fonte…)",
 * "(pendente…)", "(a confirmar…)", colchetes de instrução e "TODO" saem na leitura
 * (sem IA); "pendente" e "L1" soltos são apontados, não apagados (apagar palavra
 * solta poderia quebrar a frase).
 */
const MARCAS_REMOVIVEIS: readonly RegExp[] = [
  /\s*\((?:precisa de fonte|pendente|a confirmar|a definir|sem fonte)[^)]*\)/gi,
  /\s*\[[^\]]*\]/g,
  /\s*\bTODO\b:?/g,
];
const MARCAS_APONTADAS: ReadonlyArray<{ rotulo: string; padrao: RegExp }> = [
  { rotulo: "(precisa de fonte…)", padrao: /\(precisa de fonte/i },
  { rotulo: "(pendente…)", padrao: /\((?:pendente|a confirmar|a definir|sem fonte)/i },
  { rotulo: "colchetes de instrução", padrao: /\[[^\]]*\]/ },
  { rotulo: "TODO", padrao: /\bTODO\b/ },
  { rotulo: "pendente", padrao: /\bpendente\b/i },
  { rotulo: "número de link (L1…)", padrao: /\bL\d+\b/ },
];

/** V4 · A marca de processo que o título ou a meta traz, ou null. */
export function radarTitleProcessMark(texto: string | null | undefined): string | null {
  const lido = String(texto ?? "");
  return MARCAS_APONTADAS.find(item => item.padrao.test(lido))?.rotulo ?? null;
}

/** V4 · O título ou a meta sem as marcas removíveis; o que não tem marca volta igual (o mesmo texto). */
export function radarTitleWithoutProcessMarks(texto: string): string {
  if (!texto) return texto;
  let limpo = texto;
  for (const padrao of MARCAS_REMOVIVEIS) limpo = limpo.replace(padrao, "");
  if (limpo === texto) return texto;
  return limpo.replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").replace(/[:;,\s]+$/, "").trim();
}

/** K7 · O teto da forma natural da principal no corpo: 2 + palavras/600 (sem palavras medidas, o piso). */
export function radarKeywordBodyCap(palavrasDoArtigo: number | null | undefined): number {
  const total = Number(palavrasDoArtigo);
  const { base, wordsPerExtra } = RADAR_HUMAN_VOICE_KEYWORD_DENSITY;
  return Number.isFinite(total) && total > 0 ? base + Math.floor(total / wordsPerExtra) : base;
}
