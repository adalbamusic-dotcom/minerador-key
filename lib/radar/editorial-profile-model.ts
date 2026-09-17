/**
 * ===== O PRODUTO EDITORIAL DOS PERFIS — PROFILES_2 · §0 a §21 =====
 *
 * ==================== O QUE ESTE MÓDULO NÃO REFAZ ====================
 *
 * O blueprint canônico já produz, para YouTube e Amazon, quase tudo o que §4 e
 * §14 descrevem: direções de título, gancho, blocos de roteiro, Shorts,
 * aplicação no artigo, ângulo comercial, bandas de preço, estrutura de
 * comparação. §22 é explícito — se o campo existe, REUSAR.
 *
 * O que faltava não era contrato: era a CAMADA DE LEITURA. A superfície
 * principal dos dois perfis continuava sendo a evidência — "38 vídeos, mediana,
 * percentis", "o que a pesquisa encontrou" — e o produto editorial vinha
 * depois, misturado com ela.
 *
 * ==================== O MESMO PRINCÍPIO, TRÊS SAÍDAS ====================
 *
 *     ArticleDNA          define o artigo que se quer construir
 *          ↓
 *     evidência do perfil reforça · contradiz · amplia
 *          ↓
 *     síntese Radar       decide o que vira bloco
 *          ↓
 *     MODEL OUTPUT        roteiro-modelo · modelo comercial · artigo-modelo
 *
 * A forma muda — um vídeo não tem H2, uma seção comercial não tem gancho —, e o
 * que NÃO muda é quem manda: nenhuma SERP redefine o ArticleDNA sozinha (§0).
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

import { caixaEditorial, emLista, pareceIdentificador, pontoEditorial } from "./editorial-article-model.ts";
import { radarSemanticStems } from "./semantic-concept-model.ts";
import { RADAR_AMAZON_CRITERIA_LABELS, type RadarAmazonSelection } from "./amazon-candidate-selection.ts";
import type { RadarAmazonEligibility } from "./amazon-eligibility.ts";
import { buildRadarAmazonPromotionPlan, type RadarAmazonPromotionLink } from "./amazon-promotion-links.ts";
import type { RadarAmazonUniverseEntry } from "./amazon-search-model.ts";
import type { RadarAmazonEditorialIntentType, RadarAmazonEditorialSetup } from "./amazon-editorial-target.ts";
import { radarDeclaredArticleIntent } from "./editorial-identity.ts";

import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type {
  RadarAmazonBlueprint,
  RadarYoutubeCanonicalBlueprint,
} from "./competitive-blueprint.ts";

/* ============================ o que é entregue ========================== */

/**
 * §1 · PERFIL NÃO É FORMATO.
 *
 * Um perfil YouTube pode recomendar ARTICLE_WITH_VIDEO; um perfil Amazon pode
 * recomendar ARTICLE_WITH_COMMERCIAL_SECTION. Acoplar "YouTube = vídeo" faria a
 * investigação decidir o formato antes de olhar a evidência.
 */
export type RadarEditorialProfileKind = "VIDEO" | "COMMERCIAL";

export type RadarEditorialProfileBlock = {
  id: string;
  order: number;
  heading: string;
  objective: string;
  /** O que este bloco precisa cobrir, em pontos editoriais. */
  coveragePoints: string[];
  /** A função narrativa/comercial do bloco, em português. */
  function: string;
  evidenceStrength: "STRONG" | "MODERATE" | "DNA_REQUIRED";
  /** §8 · por que o ArticleDNA obriga este assunto a estar aqui. */
  mustCoverReasons: string[];
  sourceNeeded: string | null;
  specialistRequired: string | null;
  /** Oportunidade visual (vídeo) ou de apoio (comercial). */
  visualOpportunity: string | null;
  /** O sinal observado que sustenta o bloco. Fica na evidência. */
  sourceSignal: string;
};

/** Uma peça derivada: um Short, um critério de decisão, uma faixa de preço. */
export type RadarEditorialProfileDerived = {
  id: string;
  label: string;
  detail: string;
  sourceSignal: string;
};

export type RadarEditorialProfileApplication = {
  piece: string;
  placement: string;
  role: string;
};

export type RadarEditorialProfileModel = {
  kind: RadarEditorialProfileKind;
  profile: "YOUTUBE" | "AMAZON";
  /** §21 · o núcleo é o ArticleDNA, e ele viaja identificado. */
  articleIdentity: {
    articleId: string;
    articleDnaVersionId: string;
    principalKeyword: string | null;
    intentLabel: string | null;
    siloRole: string | null;
  };
  /** §1 · o formato recomendado, que o perfil NÃO decide sozinho. */
  editorialOutput: string;
  /** §5 e §19 · título de trabalho ORIGINAL. Nunca a cópia do concorrente. */
  workingTitle: string;
  alternateTitleDirections: string[];
  objective: string;
  promise: string;
  /** §6 · o gancho, quando o formato tem gancho. `null` no comercial. */
  hook: string | null;
  blocks: RadarEditorialProfileBlock[];
  conclusion: string | null;
  cta: string | null;
  /** Shorts (vídeo) ou critérios/faixas/reputação (comercial). */
  derived: RadarEditorialProfileDerived[];
  derivedLabel: string;
  /** §7 e §19 · onde isto entra no artigo. */
  articleApplication: RadarEditorialProfileApplication[];
  seoApplication: string[];
  evidenceNeeds: string[];
  specialistNeeds: string[];
  limitations: string[];
  /** §24 · "Parcial" nunca sem explicar. */
  readiness: { state: "READY" | "PARTIAL"; label: string; reasons: string[] };
  /**
   * ===== PROMOTION_LINK_PLAN_1 · OS LINKS DE PRODUTO =====
   *
   * Só o perfil comercial tem: um roteiro de vídeo não leva o leitor à
   * prateleira. Vazio quando não há shortlist — e vazio é a verdade, não uma
   * lista de links para produtos que o artigo não menciona.
   */
  promotionLinks: RadarAmazonPromotionLink[];
  /** §9 · o handoff precisa saber que haverá link monetizado. */
  affiliateDisclosureRequired: boolean;
  /**
   * ===== 1.2 · §10 · OS CRITÉRIOS SÃO METADADO DA COMPARAÇÃO =====
   *
   * Eles descrevem as COLUNAS da tabela — "Faixa de preço", "Nota de avaliação"
   * —, não as seções do texto. Como heading, viravam `Incluir a coluna "Faixa
   * de preço" na comparação.` no lugar de um H2.
   */
  comparisonCriteria: string[];
  /**
   * ===== 1.2 · §4 e §5 · A SHORTLIST É SUFICIENTE PARA A FORMA? =====
   *
   * `BLOCKED` quando um ranking não tem candidato nenhum: o blueprint não pode
   * fingir um Top N sobre zero produtos compatíveis, e o caminho é corrigir o
   * alvo — não seguir em frente.
   *
   * `PARTIAL` quando há menos do que se pretendia. O artigo continua possível e
   * a promessa muda de tamanho, dito em voz alta.
   */
  shortlistStatus: {
    state: "OK" | "PARTIAL" | "BLOCKED";
    desired: number | null;
    available: number;
    message: string | null;
    /** §5 · o que fazer para destravar, quando está bloqueado. */
    fixHint: string | null;
  };
};

/* ============================== ferramentas ============================== */

const assinatura = (valor: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < valor.length; index += 1) {
    hash ^= valor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

const normalizar = (valor: string) =>
  valor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * §23 · O QUE NUNCA ATRAVESSA PARA A LEITURA PRINCIPAL.
 *
 * Contagem de amostra, mediana, percentil, rank, ASIN cru, id de coleta. Eles
 * sustentam a decisão e não ajudam a produzir — e §9 é explícito sobre isso no
 * YouTube, onde a tela mostrava 38 vídeos e três percentis antes do roteiro.
 */
const TELEMETRIA_DO_PERFIL = [
  /\d+\s+de\s+\d+/i,
  /\b(mediana|percentil|p\d{2})\b/i,
  /\b(rank|posi(ç|c)(ã|a)o)\s*#?\d/i,
  /\bv(í|i)deo\(s\)\b|\bproduto\(s\)\b/i,
  /\b(asin|snapshot|runid|run id|endpoint)\b/i,
  /\b\d+\s+(v(í|i)deos|produtos|consultas|canais|resultados)\b/i,
];

/**
 * §16 · O COMENTÁRIO SOBRE A BUSCA NÃO É O GANCHO DO VÍDEO.
 *
 * "Abra contrariando a promessa que a amostra repete" descreve a ESTRATÉGIA
 * que levou à recomendação. Para executá-la, quem grava teria de ler a
 * evidência primeiro e traduzir sozinho — e é isso que faz a superfície
 * principal mostrar a decisão em vez do produto dela.
 *
 * Isto não apaga a justificativa: ela continua inteira no blueprint
 * competitivo, dentro do disclosure de evidência.
 */
const COMENTARIO_SOBRE_A_BUSCA = [
  /\ba amostra\b/i,
  /\b(a|na|da|pela) (busca|serp)\b/i,
  /\bos? t(í|i)tulos?\b/i,
  /\bconcorrentes?\b/i,
  /\benquadramento\b/i,
  /\bresultados? que\b/i,
];

const comentaASerp = (valor: string) => COMENTARIO_SOBRE_A_BUSCA.some(padrao => padrao.test(valor));

/** Uma pergunta de verdade — não uma frase SOBRE perguntas existirem. */
const pareceUmaPergunta = (valor: string) => {
  const limpo = (valor || "").trim();
  if (!limpo) return false;
  return limpo.endsWith("?")
    || /^(o que|qual|quais|como|quando|onde|por que|porque|quanto|quem|vale a pena|pode|posso|preciso|devo)\b/i.test(limpo);
};

const semTelemetria = (valor: string | null | undefined): string | null => {
  const texto = (valor || "").trim();
  if (!texto) return null;
  if (TELEMETRIA_DO_PERFIL.some(padrao => padrao.test(texto))) return null;
  return pareceIdentificador(texto) ? null : caixaEditorial(texto);
};

/**
 * §5 e §19 · O TÍTULO DE TRABALHO — original, curto, e nunca o do concorrente.
 *
 * A escada é a mesma do Google: a primeira formulação que não coincidir com
 * nada observado. Sem isso, "usar os padrões de título" viraria "repetir o
 * título que já está ranqueando".
 */
function tituloDeTrabalho(input: {
  principal: string | null;
  facetas: string[];
  direcoes: readonly string[];
  observados: readonly string[];
  sufixo: string;
}): { titulo: string; alternativas: string[] } {
  const observados = new Set(input.observados.map(normalizar));
  const principal = input.principal
    ? input.principal.charAt(0).toUpperCase() + input.principal.slice(1)
    : null;

  const candidatas = [
    principal && input.facetas.length ? `${principal}: ${emLista(input.facetas.slice(0, 2))}` : null,
    principal ? `${principal}: ${input.sufixo}` : null,
    ...input.direcoes.map(direcao => caixaEditorial(direcao)),
  ].filter((valor): valor is string => Boolean(valor))
    .filter(opcao => !observados.has(normalizar(opcao)));

  return {
    titulo: candidatas[0] || (principal ? `${principal}` : "Título a definir com o Planejador"),
    alternativas: candidatas.slice(1, 3),
  };
}

/**
 * §8 · MUST_COVER NÃO É MUST_BLOCK.
 *
 * O ArticleDNA diz que o assunto precisa ser coberto. Onde ele entra — bloco,
 * ponto de cobertura, Short, aplicação no artigo — é decisão da síntese, como
 * já é no Google. Aqui a verificação é de COBERTURA: o assunto declarado
 * aparece em algum lugar do modelo?
 */
function cobreOTopico(topico: string, textos: string[]): boolean {
  const raizes = radarSemanticStems(topico);
  if (!raizes.length) return false;
  const corpo = normalizar(textos.join(" "));
  const presentes = raizes.filter(raiz => corpo.includes(raiz.slice(0, Math.max(4, raiz.length - 1))));
  return presentes.length >= Math.ceil(raizes.length / 2);
}

function identidadeDoArtigo(context: RadarArticleResearchContext) {
  const principal = context.keywords.find(item => item.identity.role === "principal")?.identity.text || null;
  return {
    articleId: context.article.articleId,
    articleDnaVersionId: context.article.articleDnaVersionId,
    principalKeyword: principal,
    /*
     * A INTENÇÃO VEM DA AUTORIDADE — Gate 18.6 · §2.
     *
     * Ler `article.mainIntent` direto é o que fazia a faixa do Article dizer
     * "unknown" enquanto o Arquiteto mostrava Informacional para o mesmo
     * artigo. A classificação terminal responde; a autoridade completa o resto.
     */
    intentLabel: context.article.classification?.intentLabel
      || radarDeclaredArticleIntent(context.article),
    siloRole: context.silo?.articleRole || null,
  };
}

/**
 * §24 · O STATUS PARCIAL DIZ O QUE FALTA.
 *
 * Mesmo padrão aprovado no Google: só conta o que TRAVA — fonte pendente,
 * revisão profissional, limitação declarada da coleta. Evidência moderada não
 * rebaixa o modelo inteiro; ela é dita no bloco.
 */
/**
 * ===== 2.1 · §19 · UMA LIMITAÇÃO POR COISA LIMITADA =====
 *
 * A tela mostrava quatro, e duas delas diziam a mesma frase de dois lugares:
 *
 *   "nenhum vídeo baixado, assistido ou transcrito"
 *   "nenhuma página visitada e nenhum vídeo assistido ou transcrito"
 *
 * As duas são verdadeiras e vêm de camadas diferentes — o blueprint de YouTube
 * e o multiformato. Repetidas lado a lado, elas ensinam a pular o bloco inteiro,
 * e aí a limitação que importa some junto com o eco.
 *
 * ==================== POR QUE NÃO É `new Set` ====================
 *
 * Elas não são iguais como string; são a mesma restrição dita com outras
 * palavras. A comparação é por RAÍZES, e é conservadora de propósito: só colapsa
 * quando a maioria das raízes da mais curta está na mais longa. Duas limitações
 * de verdade diferentes sobrevivem às duas — perder uma seria esconder um limite
 * da coleta, que é o oposto do que este bloco existe para fazer.
 *
 * A mais curta é a que fica: ela diz o mesmo com menos, e a versão completa
 * continua legível na proveniência.
 */
export function deduplicarLimitacoes(valores: readonly string[]): string[] {
  const candidatas = [...new Set(valores.map(item => (item || "").trim()).filter(Boolean))];

  const raizesDe = (valor: string) => new Set(radarSemanticStems(valor).filter(raiz => raiz.length >= 3));

  /* A mais curta primeiro: entre duas formas da mesma restrição, ela vence. */
  const ordenadas = [...candidatas].sort((esquerda, direita) => esquerda.length - direita.length);

  const mantidas: Array<{ texto: string; raizes: Set<string> }> = [];
  for (const valor of ordenadas) {
    const raizes = raizesDe(valor);
    const repetida = raizes.size >= 3 && mantidas.some(item => {
      if (item.raizes.size < 3) return false;
      const menor = item.raizes.size <= raizes.size ? item.raizes : raizes;
      const maior = menor === raizes ? item.raizes : raizes;
      const comuns = [...menor].filter(raiz => maior.has(raiz)).length;
      return comuns / menor.size >= 0.6;
    });
    if (!repetida) mantidas.push({ texto: valor, raizes });
  }

  /* A ordem de entrada é preservada: quem lê conhece a sequência original. */
  const sobreviventes = new Set(mantidas.map(item => item.texto));
  return candidatas.filter(item => sobreviventes.has(item));
}

/**
 * ===== 2.1 · §13 e §17 · AS NECESSIDADES EDITORIAIS DESTE ARTIGO =====
 *
 * O ArticleDNA é o núcleo, e ele não pode aparecer só como selo MUST_COVER num
 * bloco chamado "Bloco 1 · fundamento". O que ele declara precisa GOVERNAR o
 * que o roteiro cobre — é dele que saem os blocos, o título e a promessa.
 *
 * As perguntas do apoio do Google entram DEPOIS dos tópicos declarados: elas
 * ampliam o que o artigo já decidiu ser, nunca o substituem (§0).
 */
function necessidadesEditoriais(input: {
  topicos: readonly string[];
  perguntas: readonly string[];
}): string[] {
  const vistas: string[][] = [];
  const saida: string[] = [];

  for (const bruto of [...input.topicos, ...input.perguntas]) {
    const limpo = (bruto || "").trim();
    if (!limpo) continue;
    /* Nada de telemetria entra como necessidade editorial. */
    if (TELEMETRIA_DO_PERFIL.some(padrao => padrao.test(limpo))) continue;
    if (pareceIdentificador(limpo)) continue;

    const raizes = radarSemanticStems(limpo).filter(raiz => raiz.length >= 3);
    if (!raizes.length) continue;

    /* Duas formulações da mesma necessidade viram um bloco, não dois. */
    const repetida = vistas.some(anterior => {
      const comuns = raizes.filter(raiz => anterior.includes(raiz)).length;
      return comuns >= Math.ceil(Math.min(anterior.length, raizes.length) / 2) + (raizes.length > 2 ? 1 : 0);
    });
    if (repetida) continue;

    vistas.push(raizes);
    saida.push(limpo);
  }

  return saida;
}

function prontidao(input: { evidenceNeeds: string[]; specialistNeeds: string[]; limitations: string[] }) {
  const motivos = [
    input.evidenceNeeds.length ? `${input.evidenceNeeds.length} fonte(s) pendente(s)` : null,
    input.specialistNeeds.length ? `${input.specialistNeeds.length} revisão(ões) profissional(is)` : null,
    input.limitations.length ? `${input.limitations.length} limitação(ões) declarada(s)` : null,
  ].filter((valor): valor is string => Boolean(valor));

  return motivos.length
    ? { state: "PARTIAL" as const, label: `Parcial · ${motivos.join(" · ")}`, reasons: motivos }
    : { state: "READY" as const, label: "Pronto para o Planejador", reasons: [] };
}

/* ============================ o perfil YOUTUBE =========================== */

const FUNCAO_DO_BLOCO: Record<string, string> = {
  ABERTURA: "Abrir: prender pelo que o espectador veio resolver.",
  CONTEXTO: "Contextualizar: dar o fundamento antes da demonstração.",
  DEMONSTRACAO: "Demonstrar: mostrar o que o texto só descreveria.",
  COMPARACAO: "Comparar: colocar as opções lado a lado.",
  FECHAMENTO: "Fechar: consolidar e encaminhar o próximo passo.",
};

/**
 * ===== 2.1 · §17 · O BLOCO DIZ O QUE O VÍDEO COBRE, NÃO ONDE ELE FICA =====
 *
 * "Bloco 1 · fundamento" e "Bloco 2 · aplicação" descrevem a POSIÇÃO na
 * estrutura. São verdade sobre o roteiro e não dizem nada sobre ESTE artigo —
 * o mesmo par apareceria num vídeo de contabilidade.
 *
 * Aqui o nome estrutural vira PAPEL (que já é um campo próprio) e o título do
 * bloco passa a ser a necessidade que ele carrega. Quando não há necessidade
 * sobrando, o papel é aplicado AO ASSUNTO — "Para quem é skin care noturno" é
 * pobre, mas é sobre o artigo; "Abertura" não é sobre nada.
 *
 * A LISTA de blocos continua vindo do roteiro derivado, e não daqui: fixar sete
 * blocos por decreto seria trocar um template genérico por outro.
 */
const PAPEL_ESTRUTURAL: Array<{ padrao: RegExp; titulo: (assunto: string) => string; portador: boolean }> = [
  { padrao: /^gancho/i, titulo: assunto => `Abertura sobre ${assunto}`, portador: false },
  { padrao: /^abertura/i, titulo: assunto => `Para quem é ${assunto}`, portador: false },
  { padrao: /^ressalva/i, titulo: assunto => `O que depende de avaliação profissional em ${assunto}`, portador: false },
  { padrao: /^(conclus|fechamento)/i, titulo: assunto => `Fechamento de ${assunto}`, portador: false },
  { padrao: /^cta/i, titulo: () => "Próximo passo", portador: false },
  /* Os blocos de conteúdo são os que RECEBEM necessidade. */
  { padrao: /erros|obje(ç|c)(õ|o)es/i, titulo: assunto => `Erros e ajustes em ${assunto}`, portador: true },
  { padrao: /fundamento/i, titulo: assunto => `Como ${assunto} funciona`, portador: true },
  { padrao: /aplica(ç|c)(ã|a)o|demonstra/i, titulo: assunto => `${assunto} na prática`, portador: true },
];

const papelDoBloco = (nome: string) =>
  PAPEL_ESTRUTURAL.find(item => item.padrao.test(nome.trim()));

/** §21 · o enum do contrato dito em português, para quem vai produzir. */
const PECA_NO_ARTIGO: Record<string, string> = {
  VIDEO_HERO: "Vídeo principal",
  SHORT: "Short",
  IMAGEM: "Imagem",
  GOOGLE_SUPPORT: "Cobertura semântica do apoio Google",
};

/**
 * ===== §3 a §12 · O ROTEIRO-MODELO =====
 *
 * A evidência do YouTube não observa gancho nenhum — ela lê título, canal,
 * duração e posição. Por isso o gancho é RECOMENDAÇÃO com sinal declarado, e
 * não uma fala inventada (§6).
 */
export function buildRadarEditorialVideoModel(input: {
  context: RadarArticleResearchContext;
  blueprint: RadarYoutubeCanonicalBlueprint;
}): RadarEditorialProfileModel {
  const { context, blueprint } = input;
  const recomendado = blueprint.recommended;
  const identidade = identidadeDoArtigo(context);

  /*
   * ====== §13 · O ARTICLEDNA GOVERNA, E ELE COMEÇA AQUI ======
   *
   * As necessidades são resolvidas ANTES dos blocos, do título e da promessa,
   * porque as três saem delas. Resolver depois faria cada uma inventar a sua.
   */
  const assunto = (identidade.principalKeyword || "").trim();
  const necessidades = necessidadesEditoriais({
    topicos: context.editorialTopics,
    /* §18 · perguntas do apoio do Google são afirmáveis; transcript não existe. */
    perguntas: blueprint.observed.googleSupport.map(item => item.statement),
  });
  const porAtribuir = [...necessidades];

  const blocks: RadarEditorialProfileBlock[] = recomendado.script.map((secao, indice) => {
    const papel = papelDoBloco(secao.block);
    /*
     * A NECESSIDADE VAI PARA O BLOCO QUE A CARREGA, na ordem do roteiro.
     *
     * Só blocos de conteúdo recebem: pendurar "ordem da rotina noturna" no CTA
     * daria ao título do bloco uma promessa que aquele bloco não cumpre.
     */
    const necessidade = papel?.portador !== false && porAtribuir.length ? porAtribuir.shift()! : null;
    const titulo = necessidade
      ? caixaEditorial(pontoEditorial(necessidade) || necessidade)
      : papel && assunto
        ? caixaEditorial(papel.titulo(assunto.toLowerCase()))
        : caixaEditorial(secao.block);

    return {
      id: `block:${assinatura(`${secao.block}|${indice}`)}`,
      order: indice + 1,
      heading: titulo,
      objective: secao.objective,
      coveragePoints: [
        ...(necessidade ? [] : [secao.direction]),
        ...(necessidade ? [secao.direction] : []),
      ].map(pontoEditorial).filter((valor): valor is string => Boolean(valor)),
      /* O nome estrutural não sumiu: ele virou o PAPEL, que é o campo dele. */
      function: FUNCAO_DO_BLOCO[secao.block.toUpperCase()]
        || `${caixaEditorial(secao.block)}: ${secao.objective.charAt(0).toLowerCase()}${secao.objective.slice(1)}`,
      evidenceStrength: "MODERATE",
      mustCoverReasons: [],
      sourceNeeded: null,
      specialistRequired: null,
      visualOpportunity: null,
      sourceSignal: secao.sourceSignal,
    };
  });

  /*
   * O QUE SOBROU NÃO SE PERDE — e também não vira bloco por decreto (§8).
   *
   * Uma necessidade sem bloco portador disponível entra como ponto de cobertura
   * do último bloco de conteúdo: ela continua exigida, e a arquitetura do vídeo
   * não cresce para acomodá-la.
   */
  if (porAtribuir.length) {
    const ultimoDeConteudo = [...blocks].reverse()
      .find(bloco => papelDoBloco(recomendado.script[bloco.order - 1]?.block || "")?.portador !== false)
      || blocks[blocks.length - 1];
    if (ultimoDeConteudo) {
      ultimoDeConteudo.coveragePoints = [
        ...ultimoDeConteudo.coveragePoints,
        ...porAtribuir.map(item => pontoEditorial(item) || item.toLowerCase()),
      ];
    }
  }

  /*
   * §8 · O QUE O ARTICLEDNA EXIGE ENTRA ONDE COUBER.
   *
   * Um tópico declarado que o roteiro já cobre é marcado no bloco que o cobre.
   * O que nenhum bloco cobre vira ponto de cobertura do primeiro — nunca um
   * bloco novo por decreto, que é o `MUST_COVER ≠ MUST_VIDEO_BLOCK` do gate.
   */
  const evidenceNeeds: string[] = [];
  const specialistNeeds: string[] = [];

  for (const topico of context.editorialTopics) {
    const cobertoPor = blocks.find(bloco => cobreOTopico(topico, [bloco.heading, bloco.objective, ...bloco.coveragePoints]));
    const alvo = cobertoPor || blocks[0];
    if (!alvo) continue;
    alvo.mustCoverReasons = [...alvo.mustCoverReasons, `O ArticleDNA declara "${topico}": ele precisa ser coberto, e a arquitetura decide onde.`];
    if (!cobertoPor) alvo.coveragePoints = [...alvo.coveragePoints, topico.toLowerCase()];
  }

  /*
   * ============ §14 · O TÍTULO SAI DAS NECESSIDADES, NÃO DOS BLOCOS ============
   *
   * "Skin care noturno: gancho e abertura" nasceu de ler as duas primeiras
   * FACETAS do modelo — que naquele momento eram os nomes estruturais dos dois
   * primeiros blocos. O título anunciava a arquitetura do roteiro em vez do que
   * o vídeo entrega, e nenhum espectador procura por "gancho".
   *
   * As facetas agora são as necessidades reais, e nome estrutural nenhum tem
   * como chegar aqui: elas vêm do ArticleDNA e do apoio do Google.
   */
  const facetas = necessidades.slice(0, 2)
    .map(item => pontoEditorial(item))
    .filter((valor): valor is string => Boolean(valor));

  const { titulo, alternativas } = tituloDeTrabalho({
    principal: identidade.principalKeyword,
    facetas,
    direcoes: recomendado.titleDirections.map(item => item.statement),
    /* §5 · nada que coincida com um título observado sai como recomendação. */
    observados: blueprint.observed.titlePatterns.map(item => item.statement),
    sufixo: "o que mostrar em vídeo",
  });

  /*
   * ================= §15 · A PROMESSA DIZ O QUE ELE SABERÁ FAZER =================
   *
   * "Ao final, o espectador sai sabendo aplicar o que viu" serve para qualquer
   * vídeo já produzido no mundo — e por isso não ajuda a produzir nenhum.
   *
   * A especificidade vem das necessidades, que são do ArticleDNA. Sem elas, a
   * promessa recua para o ASSUNTO e continua prudente: prometer detalhe que a
   * evidência não sustenta seria inventar entrega.
   */
  const promessa = necessidades.length
    ? `Ao final, o espectador sabe ${emLista(necessidades.slice(0, 3).map(item => (pontoEditorial(item) || item).toLowerCase()))}.`
    : assunto
      ? `Ao final, o espectador sabe o que fazer sobre ${assunto.toLowerCase()} — e o que a busca ainda deixa em aberto.`
      : "Ao final, o espectador encontra respondido o que foi procurar.";

  /*
   * ==================== §16 · O GANCHO É PARA USAR ====================
   *
   * A superfície principal mostrava "Abra contrariando a promessa que a amostra
   * repete ('Rotina')". Isso é estratégia sobre a SERP: para executá-la, quem
   * grava precisaria primeiro ler a evidência, entender o que "a amostra repete"
   * quer dizer e traduzir sozinho. É a decisão, não o produto da decisão.
   *
   * A frequência que sustenta a escolha ("Rotina aparece 13 vezes") continua
   * inteira no blueprint competitivo, dentro de "Ver evidência competitiva".
   *
   * §18 · e nada aqui afirma como concorrente ABRE vídeo: nenhum foi assistido.
   */
  const perguntaDeApoio = blueprint.observed.googleSupport
    .map(item => item.statement)
    .find(item => pareceUmaPergunta(item)) || null;
  const primeiraNecessidade = necessidades[0] || null;

  /*
   * O GANCHO DO BLUEPRINT VALE QUANDO ELE JÁ É GANCHO.
   *
   * "Corrigir a crença de que pele oleosa não precisa de hidratante" é
   * executável: quem grava sabe o que dizer. Substituí-lo por uma derivação
   * nossa jogaria fora a leitura boa junto com a ruim.
   *
   * O que não atravessa é o COMENTÁRIO SOBRE A BUSCA. Ele não é erro — é a
   * justificativa da escolha, e o lugar dela é a evidência.
   */
  const direcaoDoGancho = semTelemetria(recomendado.hookDirection?.statement);
  const ganchoPronto = direcaoDoGancho && !comentaASerp(direcaoDoGancho) ? direcaoDoGancho : null;

  const gancho = ganchoPronto
    || (perguntaDeApoio
      ? `Abra pela pergunta "${perguntaDeApoio}" e responda nos primeiros segundos, antes de qualquer apresentação de canal.`
      : primeiraNecessidade
        ? `Abra dizendo que o vídeo resolve ${(pontoEditorial(primeiraNecessidade) || primeiraNecessidade).toLowerCase()} — e entregue isso antes de qualquer apresentação de canal.`
        : assunto
          ? `Abra afirmando o que muda em ${assunto.toLowerCase()} depois deste vídeo, antes de qualquer apresentação de canal.`
          : null);

  /*
   * §10 · SHORT SÓ COM SINAL — e ausência de Short na SERP não é proibição.
   *
   * O contrato já exige `sourceSignal` em cada Short recomendado. O que este
   * módulo não faz é inventar "Shorts observados" quando a coleta não devolveu
   * nenhum: o que existe é recomendação, e ela diz de onde veio.
   */
  const derived: RadarEditorialProfileDerived[] = recomendado.shorts.map(item => ({
    id: item.id,
    label: item.suggestedAngle,
    detail: `${item.hookDirection} · ${item.contentPromise}`,
    sourceSignal: item.sourceSignal,
  }));

  /* §19 · quatro limitações com duas dizendo a mesma coisa viram o que são. */
  const limitations = deduplicarLimitacoes(blueprint.limitations.map(item => caixaEditorial(item)));

  return {
    kind: "VIDEO",
    profile: "YOUTUBE",
    articleIdentity: identidade,
    editorialOutput: recomendado.format,
    workingTitle: titulo,
    alternateTitleDirections: alternativas,
    objective: recomendado.titleDirections[0]?.objective
      || `Resolver em vídeo o que o espectador procura sobre ${identidade.principalKeyword || "o assunto"}.`,
    promise: promessa,
    hook: gancho || null,
    blocks,
    conclusion: blocks.length ? "Consolidar o que foi demonstrado, sem repetir o roteiro." : null,
    cta: semTelemetria(recomendado.shorts[0]?.ctaDirection) || "Encaminhar o espectador para o próximo passo do tema.",
    derived,
    derivedLabel: "Shorts derivados",
    /*
     * ============ §21 · "APLICAÇÃO NO ARTIGO · 1" NÃO É ÚTIL ============
     *
     * O contrato já traz peça, lugar e função de cada uma. O que faltava era a
     * peça ter NOME LEGÍVEL: `VIDEO_HERO` e `GOOGLE_SUPPORT` são enums, e um
     * enum na superfície principal é identificador técnico com outra roupa.
     */
    articleApplication: recomendado.articleApplication.map(item => ({
      piece: PECA_NO_ARTIGO[item.piece] || caixaEditorial(item.piece),
      placement: item.placement,
      role: item.role,
    })),
    seoApplication: [],
    evidenceNeeds,
    specialistNeeds,
    limitations,
    readiness: prontidao({ evidenceNeeds, specialistNeeds, limitations }),
    /* O roteiro de vídeo não leva o leitor à prateleira. */
    promotionLinks: [],
    /* O roteiro de vídeo não compara produto: não há critério nem shortlist. */
    comparisonCriteria: [],
    shortlistStatus: { state: "OK" as const, desired: null, available: 0, message: null, fixHint: null },
    affiliateDisclosureRequired: false,
  };
}

/* ============================ o perfil AMAZON ============================ */

/**
 * ===== §27, §28 e §30 · CADA INTENÇÃO TEM A SUA FORMA =====
 *
 * As três listas do blueprint continuam sendo as mesmas — o que muda é QUAL
 * delas responde, e em que ordem. Um comparativo abre pelos critérios; um guia
 * de compra abre pela decisão; um review abre pelo produto.
 *
 * A tabela é de FORMA, não de conteúdo: nenhuma frase nasce aqui. Tudo continua
 * saindo de `recommended`, que já nasce com `sourceSignal` em cada item — é o
 * que impede a mudança de forma de virar invenção de fato.
 */
type EstruturaComercial = RadarAmazonBlueprint["recommended"];
type ItemEstrutural = EstruturaComercial["comparisonStructure"][number];

const ESTRUTURA_POR_INTENCAO: Record<RadarAmazonEditorialIntentType, (r: EstruturaComercial) => ItemEstrutural[]> = {
  /* O review olha UM produto: o comparativo é contexto, e vem depois. */
  PRODUCT_REVIEW: r => [...r.commercialArticleStructure, ...r.comparisonStructure],
  /* §27 · X vs Y é comparação par a par — o critério abre o artigo. */
  PRODUCT_VS_PRODUCT: r => [...r.comparisonStructure, ...r.commercialArticleStructure],
  /* §28 · 3+ produtos pedem matriz de critérios antes de qualquer conclusão. */
  PRODUCT_COMPARISON: r => [...r.comparisonStructure, ...r.commercialArticleStructure],
  TOP_BEST: r => [...r.comparisonStructure, ...r.commercialArticleStructure, ...r.buyingGuideStructure],
  /* O custo-benefício começa pela faixa: é ela que organiza o argumento. */
  TOP_VALUE: r => [...r.commercialArticleStructure, ...r.comparisonStructure, ...r.buyingGuideStructure],
  /* A necessidade manda: o guia de escolha vem antes da comparação. */
  BEST_FOR_USE_CASE: r => [...r.buyingGuideStructure, ...r.comparisonStructure],
  BUYING_GUIDE: r => [...r.buyingGuideStructure, ...r.commercialArticleStructure],
  BRAND_LINE_REVIEW: r => [...r.commercialArticleStructure, ...r.comparisonStructure],
};

/**
 * ===== 1.2 · §10 · O RÓTULO DENTRO DA INSTRUÇÃO =====
 *
 * `Incluir a coluna "Faixa de preço" na comparação.` carrega o critério entre
 * aspas — é ele que interessa. Sem as aspas, a frase inteira viraria "critério",
 * e a tabela do artigo teria uma coluna chamada "Incluir a coluna".
 */
function rotuloDoCriterio(statement: string): string | null {
  const entreAspas = (statement || "").match(/["“]([^"”]{2,60})["”]/);
  if (entreAspas?.[1]) return caixaEditorial(entreAspas[1].trim());

  /*
   * SEM ASPAS, a frase só vira critério se ela JÁ for um rótulo — curta e sem
   * verbo de instrução. Uma ordem inteira como critério seria o mesmo defeito
   * com outra roupa.
   */
  const limpo = (statement || "").trim().replace(/\.$/, "");
  if (!limpo || limpo.length > 40) return null;
  if (/^(incluir|reservar|abrir|comparar|adicionar|montar|usar|destacar|separar)\b/i.test(limpo)) return null;
  return caixaEditorial(limpo);
}

/**
 * ===== 1.2 · §8 e §9 · O TÍTULO DE TRABALHO DO ARTIGO COMERCIAL =====
 *
 * ==================== O QUE ELE NÃO PODE SER ====================
 *
 * Uma instrução de montagem. `comparisonStructure` produz frases como
 * `Incluir a coluna "Faixa de preço" na comparação.`, e elas viraram título:
 *
 *     Sérum nivea: incluir a coluna "faixa de preço" na comparação
 *
 * ==================== §8 · A PROMESSA ACOMPANHA A EVIDÊNCIA ====================
 *
 * A intenção NÃO muda quando a evidência é fraca — um `TOP_BEST` continua sendo
 * um `TOP_BEST` (§7). O que muda é a PALAVRA: sem reputação suficiente na
 * maioria dos selecionados, "os melhores" não é defensável, e o título diz
 * "opções para comparar". Mesma forma, promessa honesta.
 */
function tituloComercialDaIntencao(input: {
  intent: RadarAmazonEditorialIntentType;
  assunto: string;
  desejado: number | null;
  selecionados: number;
  necessidade: string | null;
  produtos: readonly { resolvedTitle: string | null; input: string }[];
  observados: readonly string[];
  /** §8 · a evidência sustenta o superlativo? */
  superlativo?: boolean;
}): { titulo: string; alternativas: string[] } {
  const assunto = (input.assunto || "o produto").trim();
  const capitalizado = assunto.charAt(0).toUpperCase() + assunto.slice(1);
  const quantos = input.selecionados || input.desejado || 0;
  const podeDizerMelhores = input.superlativo !== false;
  const nome = (indice: number) =>
    (input.produtos[indice]?.resolvedTitle || input.produtos[indice]?.input || "").split(",")[0].trim();

  const candidatos = (() => {
    switch (input.intent) {
      case "TOP_BEST":
        return podeDizerMelhores
          ? [
            quantos ? `Os ${quantos} melhores ${assunto}` : `Os melhores ${assunto}`,
            `${capitalizado}: qual escolher`,
          ]
          : [
            quantos ? `${quantos} ${assunto} para comparar` : `${capitalizado} para comparar`,
            `${capitalizado}: opções em destaque e como escolher`,
          ];
      case "TOP_VALUE":
        return [
          quantos ? `Os ${quantos} ${assunto} com melhor custo-benefício` : `${capitalizado} com melhor custo-benefício`,
          `${capitalizado}: o que compensa em cada faixa de preço`,
        ];
      case "BEST_FOR_USE_CASE":
        return input.necessidade
          ? [
            quantos ? `Os ${quantos} melhores ${assunto} para ${input.necessidade}` : `Os melhores ${assunto} para ${input.necessidade}`,
            `${capitalizado} para ${input.necessidade}: como escolher`,
          ]
          : [`${capitalizado}: como escolher`];
      case "PRODUCT_VS_PRODUCT":
        return nome(0) && nome(1)
          ? [`${nome(0)} ou ${nome(1)}: qual escolher`, `${nome(0)} vs ${nome(1)}`]
          : [`${capitalizado}: comparativo`];
      case "PRODUCT_COMPARISON":
        return [
          quantos ? `${quantos} ${assunto} comparados` : `${capitalizado}: comparativo`,
          `${capitalizado}: diferenças que importam na escolha`,
        ];
      case "PRODUCT_REVIEW":
        return nome(0)
          ? [`${nome(0)}: análise`, `${nome(0)} vale a pena?`]
          : [`${capitalizado}: análise`];
      case "BRAND_LINE_REVIEW":
        return [`${capitalizado}: a linha explicada`, `${capitalizado}: qual produto da linha escolher`];
      case "BUYING_GUIDE":
        return [`Como escolher ${assunto}`, `${capitalizado}: guia de compra`];
      default:
        return [capitalizado];
    }
  })();

  /*
   * §5 · NADA QUE COINCIDA COM O OBSERVADO SAI COMO RECOMENDAÇÃO.
   *
   * A mesma escada do Google e do YouTube: a primeira formulação que não seja
   * cópia do que a prateleira já mostra.
   */
  const vistos = new Set(input.observados.map(item =>
    item.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()));
  const normal = (valor: string) =>
    valor.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

  const livres = candidatos.map(item => item.trim()).filter(item => item && !vistos.has(normal(item)));
  return {
    titulo: livres[0] || candidatos[0] || capitalizado,
    alternativas: livres.slice(1, 3),
  };
}

/**
 * ===== 1.2 · §11 · AS SEÇÕES DE CADA FORMA COMERCIAL =====
 *
 * ==================== POR QUE ELAS SÃO NOMEADAS AQUI ====================
 *
 * O gerador do blueprint produz INSTRUÇÕES porque é isso que ele sabe: ele lê a
 * prateleira e diz o que a comparação precisa ter. Ele não sabe qual ARTIGO está
 * sendo construído — e um "Top 10 custo-benefício" e um "X vs Y" pedem seções
 * diferentes sobre a mesma evidência.
 *
 * Quem sabe disso é a intenção editorial, que a pessoa declarou. Estas são as
 * seções que cada forma promete, particularizadas pelo assunto do artigo, pelos
 * critérios REAIS que a coleta sustentou e pelos produtos escolhidos.
 *
 * Nada aqui inventa fato: os nomes descrevem a ESTRUTURA do texto, e o que entra
 * em cada seção continua vindo da evidência.
 */
function secoesComerciais(input: {
  intent: RadarAmazonEditorialIntentType;
  assunto: string;
  criterios: string[];
  selecionados: number;
  produtos: readonly { resolvedTitle: string | null; input: string }[];
  necessidade: string | null;
}): Array<{ heading: string; objective: string; sourceSignal: string; id: string }> {
  const { assunto, criterios } = input;
  const porCriterios = criterios.length ? emLista(criterios.map(item => item.toLowerCase())) : "os critérios observados";
  const nomeDoProduto = (indice: number) =>
    (input.produtos[indice]?.resolvedTitle || input.produtos[indice]?.input || `Produto ${indice + 1}`).split(",")[0].trim();
  const quantos = input.selecionados ? String(input.selecionados) : "as";

  const secao = (id: string, heading: string, objective: string, sourceSignal: string) =>
    ({ id, heading: caixaEditorial(heading), objective, sourceSignal });

  switch (input.intent) {
    case "TOP_BEST":
      return [
        secao("sel", `Como selecionamos ${assunto}`, `Declarar o critério antes da lista: ${porCriterios}.`, "Critérios derivados do que a coleta observou."),
        secao("comp", "Comparação resumida", `Colocar as opções lado a lado por ${porCriterios}.`, "Eixos de comparação sustentados pela prateleira."),
        secao("lista", `${assunto}: as opções selecionadas`, `Apresentar ${quantos} opções selecionadas, uma a uma, com o que sustenta cada uma.`, "Seleção derivada dos candidatos compatíveis."),
        secao("perfis", "Para quem cada opção faz sentido", "Ligar cada opção a uma necessidade concreta do leitor.", "Diferenças observadas entre os selecionados."),
        secao("fim", "Conclusão", "Fechar com a escolha que os critérios sustentam, e dizer o que ficou em aberto.", "Suficiência declarada da amostra."),
      ];
    case "TOP_VALUE":
      return [
        secao("metodo", "Como avaliamos custo-benefício", `Explicar que custo-benefício relaciona preço e reputação, e não é o mais barato. Critérios: ${porCriterios}.`, "Relação preço/reputação observada na prateleira."),
        secao("comp", "Comparação", `Colocar as opções lado a lado por ${porCriterios}.`, "Eixos de comparação sustentados pela prateleira."),
        secao("lista", `${assunto}: as opções selecionadas`, `Apresentar ${quantos} opções selecionadas com o que cada uma entrega pelo que custa.`, "Seleção por relação preço/reputação."),
        secao("faixas", "Faixas de preço observadas", "Situar o leitor na prateleira, com a ressalva de que preço muda.", "Bandas derivadas do universo observado."),
        secao("fim", "Conclusão", "Fechar indicando o que compensa em cada faixa.", "Suficiência declarada da amostra."),
      ];
    case "PRODUCT_VS_PRODUCT":
      return [
        secao("a", nomeDoProduto(0), "Apresentar o primeiro produto pelo que a prateleira mostra dele.", "Leitura comercial do produto A."),
        secao("b", nomeDoProduto(1), "Apresentar o segundo produto pelo que a prateleira mostra dele.", "Leitura comercial do produto B."),
        secao("comp", "Comparação por critérios", `Confrontar os dois por ${porCriterios}.`, "Eixos de comparação sustentados pela prateleira."),
        secao("perfis", "Para quem cada um faz sentido", "Dizer em que caso cada opção é a escolha melhor, sem eleger um vencedor absoluto.", "Diferenças observadas entre os dois."),
        secao("fim", "Conclusão comparativa", "Fechar com a diferença que decide, e com o que a coleta não observou.", "Limitações declaradas da coleta."),
      ];
    case "BEST_FOR_USE_CASE":
      return [
        secao("necessidade", `O que importa para ${input.necessidade || "esta necessidade"}`, "Explicar o que muda a escolha quando a necessidade é esta.", "Consulta de necessidade observada na loja."),
        secao("sel", "Como selecionamos", `Declarar o critério antes da lista: ${porCriterios}.`, "Critérios derivados do que a coleta observou."),
        secao("lista", `${assunto}: as opções selecionadas`, `Apresentar ${quantos} opções selecionadas.`, "Seleção derivada dos candidatos compatíveis."),
        secao("comp", "Comparação", `Colocar as opções lado a lado por ${porCriterios}.`, "Eixos de comparação sustentados pela prateleira."),
        secao("fim", "Conclusão", "Fechar com a indicação que a necessidade declarada sustenta.", "Suficiência declarada da amostra."),
      ];
    case "PRODUCT_COMPARISON":
      return [
        secao("sel", "O que entra nesta comparação", `Delimitar o conjunto comparado e por que ele é comparável: ${porCriterios}.`, "Conjunto escolhido para o artigo."),
        secao("matriz", "Comparação por critérios", `Confrontar as opções por ${porCriterios}.`, "Eixos de comparação sustentados pela prateleira."),
        secao("grupos", "Diferenças que importam", "Agrupar por diferença observável em vez de ordenar por nota única.", "Diferenças observadas entre os produtos."),
        secao("perfis", "Para quem cada opção faz sentido", "Ligar cada opção a um contexto de escolha.", "Contextos derivados das diferenças."),
        secao("fim", "Conclusão", "Fechar sem eleger vencedor quando os critérios não sustentam um.", "Limitações declaradas da coleta."),
      ];
    case "PRODUCT_REVIEW":
      return [
        secao("produto", nomeDoProduto(0), "Apresentar o produto pelo que a prateleira mostra dele.", "Leitura comercial do produto avaliado."),
        secao("contexto", `${assunto}: o que existe em volta`, "Situar o produto na prateleira, sem transformar o review em comparativo.", "Contexto competitivo observado."),
        secao("criterios", "O que observar antes de decidir", `Dar critério ao leitor: ${porCriterios}.`, "Critérios derivados do que a coleta observou."),
        secao("fim", "Conclusão", "Fechar com para quem o produto faz sentido, e com o que a coleta não observou.", "Limitações declaradas da coleta."),
      ];
    case "BRAND_LINE_REVIEW":
      return [
        secao("linha", `${assunto}: como a linha se divide`, "Mapear a família de produtos pelo que a prateleira mostra.", "Universo observado da marca."),
        secao("produtos", "Os produtos da linha", "Apresentar cada produto e o que o distingue dos vizinhos.", "Produtos observados da linha."),
        secao("criterios", "Como escolher dentro da linha", `Dar critério ao leitor: ${porCriterios}.`, "Critérios derivados do que a coleta observou."),
        secao("fim", "Conclusão", "Fechar indicando qual produto da linha resolve cada caso.", "Limitações declaradas da coleta."),
      ];
    case "BUYING_GUIDE":
      return [
        secao("criterios", `Como escolher ${assunto}`, `Entregar decisão, não catálogo: ${porCriterios}.`, "Critérios derivados do que a coleta observou."),
        secao("faixas", "O que muda entre as faixas de preço", "Explicar o que se ganha e o que se abre mão em cada faixa.", "Bandas derivadas do universo observado."),
        secao("erros", "Erros comuns na escolha", "Antecipar a decisão ruim que a prateleira induz.", "Padrões observados na listagem."),
        secao("fim", "Conclusão", "Fechar com o caminho de decisão, sem eleger um produto.", "Limitações declaradas da coleta."),
      ];
    default:
      return [];
  }
}

/**
 * §6 e §7 · A FORMA DE SAÍDA QUE CADA INTENÇÃO DECLARA.
 *
 * Ela é derivada da escolha da pessoa, e não da leitura da prateleira. É o que
 * impede um `TOP_BEST` de aparecer como `COMPARISON` porque a análise achou a
 * prateleira parecida com um comparativo.
 */
const RADAR_AMAZON_OUTPUT_DA_INTENCAO: Record<RadarAmazonEditorialIntentType, string> = {
  PRODUCT_REVIEW: "PRODUCT_REVIEW",
  PRODUCT_VS_PRODUCT: "PRODUCT_VS_PRODUCT",
  PRODUCT_COMPARISON: "PRODUCT_COMPARISON",
  TOP_BEST: "TOP_BEST",
  TOP_VALUE: "TOP_VALUE",
  BEST_FOR_USE_CASE: "BEST_FOR_USE_CASE",
  BUYING_GUIDE: "BUYING_GUIDE",
  BRAND_LINE_REVIEW: "BRAND_LINE_REVIEW",
};

/** §27 e §28 · a promessa que cada forma faz ao leitor. */
const PROMESSA_POR_INTENCAO: Record<RadarAmazonEditorialIntentType, (assunto: string) => string> = {
  PRODUCT_REVIEW: assunto => `Ao final, o leitor sabe se ${assunto} atende o caso dele — e o que a prateleira oferece em volta.`,
  PRODUCT_VS_PRODUCT: () => "Ao final, o leitor sabe em que cada um dos dois é melhor, e para quem cada opção faz sentido.",
  PRODUCT_COMPARISON: () => "Ao final, o leitor sabe com que critérios separar as opções e em qual grupo a dele cai.",
  TOP_BEST: () => "Ao final, o leitor sabe por que cada opção entrou na lista e o que as diferencia entre si.",
  TOP_VALUE: () => "Ao final, o leitor sabe o que se ganha e o que se abre mão em cada faixa de preço.",
  BEST_FOR_USE_CASE: assunto => `Ao final, o leitor sabe o que procurar em ${assunto} para a necessidade dele.`,
  BUYING_GUIDE: assunto => `Ao final, o leitor sabe com que critérios escolher ${assunto} sozinho.`,
  BRAND_LINE_REVIEW: () => "Ao final, o leitor sabe como a linha se divide e qual produto dela resolve o caso dele.",
};

/**
 * ===== §13 a §20 · O MODELO COMERCIAL =====
 *
 * A SERP da Amazon não tem texto de review, benefício de PDP, objeção de
 * comprador nem ficha de marca. §15 é uma lista do que o modelo NÃO pode
 * afirmar — e a forma de obedecer não é lembrar de não escrever: é não ter de
 * onde tirar. Tudo aqui vem de `recommended`, que já nasce com `sourceSignal`,
 * e as limitações viajam visíveis.
 */
export function buildRadarEditorialCommercialModel(input: {
  context: RadarArticleResearchContext;
  blueprint: RadarAmazonBlueprint;
  /**
   * ===== §30 · O INTENT MUDA O MODELO — AMAZON_EDITORIAL_TARGET_1 =====
   *
   * Um review, um X vs Y, um top 10 e um guia de compra não podem sair iguais
   * da mesma evidência. Saíam: o modelo comercial concatenava guia, comparação
   * e artigo comercial na mesma ordem para qualquer artigo, porque nada lhe
   * dizia qual dos quatro estava sendo construído.
   *
   * Opcional porque é aditivo: investigação anterior a este gate não tem alvo
   * declarado e continua produzindo o modelo genérico, que era o que ela tinha.
   */
  setup?: RadarAmazonEditorialSetup | null;
  /** §23 e §24 · os candidatos selecionados por critério, quando há ranking. */
  selection?: RadarAmazonSelection | null;
  /**
   * 1.1 · §2, §3 e §16 · as três camadas, para a leitura poder nomeá-las.
   *
   * Sem isto o modelo diria "59 produtos comparáveis" sobre um universo que
   * mistura marcas e classes — a frase falsa sobre o número verdadeiro.
   */
  eligibility?: RadarAmazonEligibility | null;
  /**
   * PROMOTION_LINK_PLAN_1 · §3 · o universo, SÓ para recuperar URL e título.
   *
   * Os links saem da shortlist; o universo é consultado por ASIN para achar a
   * URL observada de cada um. Ele nunca é a fonte da lista.
   */
  universe?: readonly RadarAmazonUniverseEntry[];
}): RadarEditorialProfileModel {
  const { context, blueprint } = input;
  const recomendado = blueprint.recommended;
  const identidade = identidadeDoArtigo(context);
  const intencao = input.setup?.intent.type || null;

  /*
   * A ESTRUTURA É ESCOLHIDA PELA INTENÇÃO, não somada.
   *
   * Concatenar as três listas dava ao review a estrutura de um guia de compra
   * seguida da de um comparativo — um artigo que ninguém pediu, montado com
   * pedaços verdadeiros.
   */
  const estrutura = intencao
    ? ESTRUTURA_POR_INTENCAO[intencao](recomendado)
    : [
      ...recomendado.buyingGuideStructure,
      ...recomendado.comparisonStructure,
      ...recomendado.commercialArticleStructure,
    ];

  /*
   * ===== 1.2 · §10 · O CRITÉRIO DE COMPARAÇÃO É METADADO =====
   *
   * `comparisonStructure` não contém seções: contém INSTRUÇÕES. O gerador
   * escreve `Incluir a coluna "Faixa de preço" na comparação.` — uma ordem
   * para quem monta a tabela, e não um H2 do artigo.
   *
   * Colá-las como cabeçalho produzia exatamente o que §9 proíbe:
   *
   *     H2: Incluir a coluna "Faixa de preço" na comparação.
   *     H2: Reservar seção comercial explícita, separada da parte informativa.
   *
   * São verdades sobre a DECISÃO, não sobre o artigo. O critério vira metadado
   * da comparação (`comparisonCriteria`), que é o que ele sempre foi.
   */
  /*
   * ===== 1.2 · §4 e §5 · A SHORTLIST SUSTENTA A FORMA PROMETIDA? =====
   *
   * Um "Top 10" com 4 compatíveis não é um Top 10. Ele continua sendo um artigo
   * possível — com 4 — e o que não pode acontecer é a tela apresentá-lo como se
   * os 10 existissem.
   *
   * Com ZERO compatíveis não há artigo de ranking nenhum, e o caminho não é
   * seguir: é corrigir o alvo. Deixar passar produziria um "Top 10 melhores"
   * com uma lista vazia e seis links de afiliado para nada.
   */
  const exigeRanking = intencao === "TOP_BEST" || intencao === "TOP_VALUE" || intencao === "BEST_FOR_USE_CASE";
  const disponiveis = input.selection?.candidates.length ?? 0;
  const pretendidos = input.setup?.intent.desiredCount ?? null;

  const suficienciaDaShortlist: RadarEditorialProfileModel["shortlistStatus"] = !input.selection || !intencao
    ? { state: "OK", desired: pretendidos, available: disponiveis, message: null, fixHint: null }
    : exigeRanking && disponiveis === 0
      ? {
        state: "BLOCKED",
        desired: pretendidos,
        available: 0,
        message: "Nenhum produto compatível com o alvo foi encontrado nesta coleta; não há ranking a construir.",
        fixHint: input.eligibility?.method === "CLASS_AND_BRAND"
          ? "Revise o tipo de produto e o filtro de marca — eles são comparados com o texto do título observado."
          : "Revise o alvo da investigação antes de seguir.",
      }
      : pretendidos && disponiveis < pretendidos
        ? {
          state: "PARTIAL",
          desired: pretendidos,
          available: disponiveis,
          message: `Apenas ${disponiveis} produto(s) compatíveis encontrados; o artigo pretendia ${pretendidos}.`,
          fixHint: null,
        }
        : { state: "OK", desired: pretendidos, available: disponiveis, message: null, fixHint: null };

  const criteriosDeComparacao = recomendado.comparisonStructure
    .map(item => rotuloDoCriterio(item.statement))
    .filter((valor): valor is string => Boolean(valor));

  /*
   * ===== 1.2 · §11 · A ESTRUTURA DEPENDE DA INTENÇÃO =====
   *
   * As seções são as do artigo que a intenção promete, particularizadas pelo
   * assunto e pelos critérios reais. A instrução original vira o OBJETIVO do
   * bloco — ela continua legível, no campo onde instrução cabe.
   */
  const assuntoComercial = (identidade.principalKeyword || "o produto").trim();
  const secoes = intencao
    ? secoesComerciais({
      intent: intencao,
      assunto: assuntoComercial,
      criterios: criteriosDeComparacao,
      selecionados: input.selection?.candidates.length || 0,
      produtos: input.setup?.target.products || [],
      necessidade: input.setup?.intent.useCase || null,
    })
    : null;

  const blocks: RadarEditorialProfileBlock[] = (secoes || estrutura.map((item, indice) => ({
    heading: caixaEditorial(item.statement),
    objective: item.objective,
    sourceSignal: item.sourceSignal,
    id: item.id,
    ordem: indice,
  }))).map((item, indice) => ({
    id: `block:${assinatura(`${item.id}|${indice}`)}`,
    order: indice + 1,
    heading: item.heading,
    /*
     * A INSTRUÇÃO DO GERADOR VIRA OBJETIVO — ela não some.
     *
     * "Incluir a coluna Faixa de preço" é uma boa instrução e um péssimo
     * cabeçalho. No objetivo ela diz o que o bloco precisa resolver, que é
     * exatamente para o que ela foi escrita.
     */
    objective: item.objective || estrutura[indice]?.objective || "Resolver a decisão do leitor com o que a prateleira sustenta.",
    coveragePoints: [],
    function: "Bloco comercial sustentado por sinal observado na prateleira.",
    evidenceStrength: "MODERATE",
    mustCoverReasons: [],
    sourceNeeded: null,
    specialistRequired: null,
    visualOpportunity: null,
    sourceSignal: item.sourceSignal || estrutura[indice]?.sourceSignal || "Leitura da prateleira observada nesta coleta.",
  }));

  for (const topico of context.editorialTopics) {
    const cobertoPor = blocks.find(bloco => cobreOTopico(topico, [bloco.heading, bloco.objective]));
    const alvo = cobertoPor || blocks[0];
    if (!alvo) continue;
    alvo.mustCoverReasons = [...alvo.mustCoverReasons, `O ArticleDNA declara "${topico}": ele precisa ser coberto, e a arquitetura decide onde.`];
    if (!cobertoPor) alvo.coveragePoints = [...alvo.coveragePoints, topico.toLowerCase()];
  }

  /*
   * §16 · PREÇO OBSERVADO E PREÇO RECOMENDADO SÃO COISAS DIFERENTES.
   *
   * O valor visto tem data e amostra, e vive na evidência. O que o modelo
   * recomenda é uma BANDA — recomendar o valor exato transformaria a fotografia
   * de uma terça-feira em regra editorial.
   */
  const faixas: RadarEditorialProfileDerived[] = blueprint.observed.priceBands.map(item => ({
    id: `banda:${item.band}`,
    label: RADAR_BANDA_LABEL[item.band] || item.band,
    detail: item.method,
    sourceSignal: item.source,
  }));

  const criterios: RadarEditorialProfileDerived[] = recomendado.comparisonStructure.map(item => ({
    id: item.id, label: item.statement, detail: item.objective, sourceSignal: item.sourceSignal,
  }));

  /*
   * §17 · O NOME CERTO: reputação e sinais de compra.
   *
   * Nota, volume de avaliações, Amazon Choice, Best Seller e posição não são
   * "opinião dos compradores" — não há texto de review nesta coleta, e chamar
   * assim faria o Redator escrever elogio que ninguém disse.
   */
  const reputacao: RadarEditorialProfileDerived[] = blueprint.observed.ratingSignals
    .concat(blueprint.observed.purchaseSignals)
    .slice(0, 6)
    .map((item, indice) => ({
      id: `reputacao:${indice}`,
      label: caixaEditorial(item.statement),
      detail: "Reputação e sinais de compra — agregados, sem texto de avaliação.",
      sourceSignal: item.evidence,
    }));

  /*
   * §23, §24 e §25 · A SELEÇÃO ENTRA COMO PEÇA DERIVADA, com os sinais dela.
   *
   * Cada candidato carrega o que o sustentou e o que faltou. Um item sem
   * `supportingSignals` não chega aqui — a seleção não o teria escolhido.
   */
  const selecionados: RadarEditorialProfileDerived[] = (input.selection?.candidates || []).map(candidato => ({
    id: `candidato:${candidato.asin}`,
    label: `${candidato.order}. ${candidato.title}`,
    detail: candidato.missingSignals.length
      ? `${candidato.supportingSignals.join(" ")} Falta: ${candidato.missingSignals.join("; ")}.`
      : candidato.supportingSignals.join(" "),
    sourceSignal: `Selecionado por ${RADAR_AMAZON_CRITERIA_LABELS[input.selection!.criteria].toLowerCase()}, entre os produtos observados na prateleira.`,
  }));

  /*
   * §19 · a mesma deduplicação do vídeo: o comercial também soma camadas.
   *
   * §24 · e o que a seleção NÃO consegue sustentar entra aqui, junto das
   * limitações da coleta — não num rodapé próprio que ninguém lê.
   */
  const limitations = deduplicarLimitacoes([
    ...blueprint.limitations,
    ...(input.selection?.limitations || []),
    /*
     * 1.1 · §8 e §16 · COMO A COMPATIBILIDADE FOI DECIDIDA É UMA LIMITAÇÃO.
     *
     * "11 compatíveis" saiu de leitura de TÍTULO, porque a loja não entrega
     * marca nem categoria estruturadas. Um produto da marca cujo título não a
     * menciona fica de fora — e quem assina o artigo precisa saber disso.
     */
    ...(input.eligibility?.notes || []),
    /*
     * §4 · O PARCIAL É DITO EM VOZ ALTA, junto das outras limitações.
     *
     * "Apenas 4 produtos compatíveis" precisa estar onde quem assina o artigo
     * lê — não escondido numa contagem que ele teria de conferir sozinho.
     */
    ...(suficienciaDaShortlist.message ? [suficienciaDaShortlist.message] : []),
  ].map(item => caixaEditorial(item)));
  const evidenceNeeds: string[] = [];
  const specialistNeeds: string[] = [];

  /*
   * ===== PROMOTION_LINK_PLAN_1 · §3 · OS LINKS SAEM DA SHORTLIST =====
   *
   * Sem seleção não há link, e isso é a verdade sobre o blueprint: um modelo
   * comercial sem produtos escolhidos não tem o que promover. Gerar links do
   * universo bruto produziria 59 endereços num artigo de 6 produtos.
   */
  /*
   * §12 · SEM SHORTLIST VÁLIDA, NÃO HÁ LINK — e isso já é estrutural.
   *
   * O plano nasce da SHORTLIST (PROMOTION_LINK_PLAN_1 · §3), e `BLOCKED` só
   * acontece quando a shortlist está vazia. Um guarda extra contra o estado
   * bloqueado seria código que nunca muda o resultado — e código que nunca muda
   * o resultado não pode ser protegido por teste nenhum.
   *
   * Um parcial (6 de 20) CONTINUA gerando os 6 links: o artigo é menor, e ele
   * existe.
   */
  const plano = input.selection && intencao
    ? buildRadarAmazonPromotionPlan({
      intent: intencao,
      selection: input.selection,
      universe: input.universe || [],
    })
    : { links: [], affiliateDisclosureRequired: false, source: { observed: 0, eligible: 0, shortlist: 0 } };

  /*
   * ============ 1.2 · §9 · O TÍTULO É DE ARTIGO, NÃO DE TAREFA ============
   *
   * As facetas saíam de `comparisonStructure`, que contém INSTRUÇÕES. O título
   * produzido era, literalmente:
   *
   *     Sérum nivea: incluir a coluna "faixa de preço" na comparação
   *
   * Ninguém procura por isso, e ninguém publica isso. É a terceira vez que o
   * mesmo defeito aparece — o Google mostrou telemetria como objetivo, o
   * YouTube montou o título com nomes de bloco, e aqui a instrução de montagem
   * virou manchete.
   *
   * O título agora vem da FORMA que a intenção promete, aplicada ao assunto.
   */
  const { titulo, alternativas } = intencao
    ? tituloComercialDaIntencao({
      intent: intencao,
      assunto: assuntoComercial,
      desejado: input.setup?.intent.desiredCount || null,
      selecionados: input.selection?.candidates.length || 0,
      necessidade: input.setup?.intent.useCase || null,
      produtos: input.setup?.target.products || [],
      observados: blueprint.observed.relatedSearchSignals.map(item => item.statement),
      /*
       * §8 · A PROMESSA RECUA; A FORMA NÃO.
       *
       * Sem reputação suficiente na maioria dos selecionados, "os melhores" não
       * é defensável. O artigo continua sendo um TOP_BEST — o que muda é a
       * palavra, que passa a ser "opções para comparar".
       */
      superlativo: input.selection ? input.selection.supportsSuperlative : true,
    })
    : tituloDeTrabalho({
      principal: identidade.principalKeyword,
      /* Sem intenção declarada, o critério REAL entra — nunca a instrução. */
      facetas: criteriosDeComparacao.slice(0, 2).map(item => item.toLowerCase()),
      direcoes: recomendado.titleDirections.map(item => item.pattern),
      observados: blueprint.observed.relatedSearchSignals.map(item => item.statement),
      sufixo: "como escolher",
    });

  return {
    kind: "COMMERCIAL",
    profile: "AMAZON",
    articleIdentity: identidade,
    /*
     * ===== 1.2 · §6 e §7 · A INTENÇÃO DECLARADA NÃO MUDA SOZINHA =====
     *
     * A saída recomendada vem da ANÁLISE, que lê a prateleira e não sabe qual
     * artigo a pessoa pediu. Quando ela discorda da intenção declarada, quem
     * manda é a intenção: um `TOP_BEST` não pode virar `COMPARISON` porque a
     * análise achou que a prateleira parece um comparativo.
     *
     * Trocar em silêncio é pior do que recusar: a tela mostraria outra forma de
     * artigo sob o nome que a pessoa escolheu, e a diferença só apareceria
     * depois, no texto pronto.
     *
     * §1 continua valendo onde ele foi escrito: sem intenção declarada, a
     * análise responde — é o comportamento anterior a este gate, intacto.
     */
    editorialOutput: intencao
      ? RADAR_AMAZON_OUTPUT_DA_INTENCAO[intencao]
      : recomendado.recommendedOutputs[0]?.output || "ARTICLE_WITH_COMMERCIAL_SECTION",
    workingTitle: titulo,
    alternateTitleDirections: alternativas,
    objective: recomendado.commercialAngle?.statement
      || recomendado.editorialAngle?.statement
      || `Dar critério de escolha sobre ${identidade.principalKeyword || "o assunto"}.`,
    /* §30 · a promessa é a da FORMA escolhida, não a de "um artigo comercial". */
    promise: intencao
      ? PROMESSA_POR_INTENCAO[intencao](identidade.principalKeyword || "o produto")
      : "Ao final, o leitor sabe com que critérios comparar e em que faixa se posicionar.",
    /* O comercial não tem gancho: ele tem critério. */
    hook: null,
    blocks,
    conclusion: null,
    cta: semTelemetria(recomendado.ctaDirection?.statement),
    /*
     * §23 e §24 · OS CANDIDATOS VÊM PRIMEIRO, E CADA UM DIZ POR QUE ENTROU.
     *
     * "Top 10" sem isso seria uma lista de dez produtos que a pessoa teria de
     * acreditar. Com isso, ela é uma seleção auditável — e quando a evidência
     * não sustenta "os melhores", o próprio item diz o que faltou.
     */
    derived: [...selecionados, ...criterios, ...faixas, ...reputacao],
    derivedLabel: selecionados.length
      ? "Candidatos selecionados, critérios, faixas e reputação"
      : "Critérios, faixas e reputação",
    articleApplication: [],
    seoApplication: recomendado.googleSeoSupport.map(item => item.statement),
    evidenceNeeds,
    specialistNeeds,
    limitations,
    readiness: prontidao({ evidenceNeeds, specialistNeeds, limitations }),
    promotionLinks: plano.links,
    comparisonCriteria: criteriosDeComparacao,
    shortlistStatus: suficienciaDaShortlist,
    affiliateDisclosureRequired: plano.affiliateDisclosureRequired,
  };
}

const RADAR_BANDA_LABEL: Record<string, string> = {
  ECONOMICA: "Faixa econômica",
  INTERMEDIARIA: "Faixa intermediária",
  PREMIUM: "Faixa premium",
};
