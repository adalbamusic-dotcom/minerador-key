import type { RadarVideoTextState } from "./video-text-acquisition.ts";

/**
 * O CASAMENTO ENTRE PAUTA E CONTEÚDO — e o portão que impede evidência falsa.
 *
 * TRÊS CAMADAS, e a terceira é nova:
 *
 *   1. FONTE      pertence à marca.
 *   2. CONTEÚDO   o transcript pertence à FONTE, e é reutilizado por todos.
 *   3. CASAMENTO  o trecho relevante pertence ao ARTIGO — porque depende das
 *                 PAUTAS, e as pautas são da investigação congelada dele.
 *
 * A mesma palestra serve a dez artigos com dez recortes diferentes, sem
 * retranscrever nada: o que muda entre eles são as perguntas, não o áudio.
 *
 * ============ AS TRÊS CAMADAS DO RECORTE — VIDEOS_3.3 · §1 ===============
 *
 *   TRANSCRIPT   todo o texto original da fonte. Fica inteiro, intocado.
 *   CANDIDATOS   as janelas que o material sustenta. Podem ser muitas, e
 *                existem só aqui dentro: nenhuma é gravada.
 *   EXTRATOS     os poucos trechos que realmente ajudam a pauta. SÓ ESTES
 *                viram `radar_video_brief_extract`.
 *
 * A m2 confundia candidato com extrato: toda ocorrência lexical do assunto
 * virava linha no banco, e um artigo de skincare terminou com 509 trechos
 * "encontrados" — número que descreve o transcript, não a evidência.
 *
 * ================ O PORTÃO: NENHUM TRECHO SEM ÂNCORA ======================
 *
 * Todo `RadarRelevantExtract` nasce de SEGMENTOS REAIS do transcript
 * persistido. O texto é a concatenação exata deles; os tempos são os deles.
 * Nada aqui escreve tempo, reescreve frase ou resume.
 *
 * Isso vale mesmo que um dia a proposta venha de um modelo: `anchorRadarExtract`
 * é a única porta, ela exige índices de segmentos que existem, e devolve `null`
 * para o que não ancora. Uma citação que o modelo "lembrou" não passa.
 *
 * Domínio puro: sem fetch, sem provider, sem banco.
 */

/* ======================= o que entra no casamento ====================== */

/** A pauta, como o bundle CONGELADO a preservou. Nunca o blueprint vivo. */
export type RadarFrozenBriefInput = {
  briefId: string;
  topic: string;
  narrativePurpose: string;
  whatToLookFor: string[];
  relatedSectionId: string | null;
  relatedSectionTitle: string | null;
  questions: string[];
  entities: string[];
  evidenceNeeded: string;
  priority: string;
};

/** Um trecho do transcript, com o tempo REAL que o provider devolveu. */
export type RadarTranscriptSegment = { text: string; startMs: number; endMs: number };

/** Uma fonte com texto pronto, já selecionada pelo artigo. */
export type RadarMatchableSource = {
  videoSourceId: string;
  displayName: string | null;
  textState: RadarVideoTextState;
  selectedForArticle: boolean;
  registrationStatus: string;
  languageCode: string | null;
  /** A versão do processamento que produziu este texto. Entra na identidade. */
  processingVersion: number;
  segments: RadarTranscriptSegment[];
  /** O texto inteiro, para a fonte que não tem tempos. */
  transcriptText: string;
};

/* ======================== o que sai do casamento ======================== */

export const RADAR_EXTRACT_SUPPORT_TYPES = ["ANSWERS_QUESTION", "MENTIONS_ENTITY", "COVERS_TOPIC"] as const;
export type RadarExtractSupportType = typeof RADAR_EXTRACT_SUPPORT_TYPES[number];

export const RADAR_BRIEF_COVERAGE_STATES = ["SUPPORTED", "PARTIAL", "NOT_FOUND"] as const;
export type RadarBriefCoverageState = typeof RADAR_BRIEF_COVERAGE_STATES[number];

export type RadarRelevantExtract = {
  videoBriefId: string;
  videoSourceId: string;
  /** Os índices dos segmentos que originaram este trecho. A âncora. */
  segmentIndexes: number[];
  startMs: number;
  endMs: number;
  /** A concatenação EXATA dos segmentos. Nunca reescrita, nunca traduzida. */
  originalText: string;
  sourceLanguage: string | null;
  reasonForRelevance: string;
  matchedQuestions: string[];
  /**
   * OS CRITÉRIOS DA PAUTA QUE ESTE TRECHO SUSTENTA — derivados, nunca gravados.
   *
   * Não há coluna para eles no banco, e é de propósito: a lista é conclusão
   * sobre o texto do trecho à luz da pauta, e as duas coisas estão gravadas.
   * A leitura de volta reconstrói exatamente a mesma lista.
   */
  matchedCriteria: string[];
  /**
   * O TRECHO RESPONDE O OBJETIVO DO TÍTULO — derivado, nunca gravado.
   *
   * Como `matchedCriteria`: conclusão sobre o texto do trecho à luz da pauta,
   * e as duas coisas já estão no banco. A leitura de volta reconstrói o mesmo
   * veredito, e por isso o F5 não muda o estado da pauta.
   */
  answersTitle: boolean;
  /**
   * O ASSUNTO QUE ESTE TRECHO COBRE — termos, frases e entidades da pauta.
   *
   * Na m2 este campo guardava só `entities`. A m3 o alarga porque a cobertura
   * da pauta passou a ser medida por ASSUNTO COBERTO, e a leitura de volta
   * (que não tem o transcript em mãos) precisa saber o que cada trecho cobriu
   * para dizer o que ainda falta. A coluna não mudou; o que ela carrega, sim.
   */
  matchedEntities: string[];
  supportType: RadarExtractSupportType;
  confidence: number;
  limitations: string[];
  provenance: { processingVersion: number; anchoredToSegments: true };
};

export type RadarBriefCoverage = {
  videoBriefId: string;
  state: RadarBriefCoverageState;
  extracts: RadarRelevantExtract[];
  usefulSourceIds: string[];
  /**
   * A GUIA DA PAUTA, E O QUE DELA FOI ATENDIDO — §3, §6 e §7.
   *
   * `criteria` são os itens de `whatToLookFor`, na ordem da pauta; os outros
   * dois são a mesma lista partida em duas. A tela não recalcula nada: ela
   * mostra o que foi encontrado e o que continua faltando, com estas palavras.
   */
  criteria: string[];
  matchedCriteria: string[];
  missingCriteria: string[];
  /** Por que este é o estado, em português, para quem opera. */
  reason: string;
};

/* ========================== a normalização ============================= */

/*
 * PALAVRAS QUE NÃO DISTINGUEM NADA.
 *
 * "de", "para", "the" aparecem em qualquer transcript; contá-las faria todo
 * segmento parecer relevante para toda pauta. A lista cobre PT, EN e ES porque
 * a fonte fica no idioma ORIGINAL — traduzir é o gate seguinte.
 */
const VAZIAS = new Set([
  "a", "o", "as", "os", "um", "uma", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
  "que", "com", "por", "para", "se", "ao", "aos", "à", "às", "ou", "mas", "como", "mais", "muito", "ser",
  "the", "of", "and", "to", "in", "is", "it", "for", "on", "with", "as", "at", "by", "this", "that", "you",
  "el", "la", "los", "las", "un", "una", "y", "en", "por", "para", "con", "es", "se", "del", "al",
]);

/**
 * Sem acento, sem caixa, sem pontuação — o mínimo para comparar palavras.
 *
 * Os diacríticos saem pela classe Unicode de marcas — e não por uma
 * faixa de escapes: combinante literal no código-fonte é invisível no editor e
 * some em qualquer passagem por ferramenta que normalize texto.
 */
export function radarMatchNormalize(valor: string): string {
  return valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function palavras(valor: string): string[] {
  return radarMatchNormalize(valor).split(" ").filter(item => item.length >= 3 && !VAZIAS.has(item));
}

/**
 * VOCABULÁRIO OPERACIONAL — descreve COMO olhar, não DO QUE se trata.
 *
 * O smoke negativo encontrou o defeito aqui. A pauta "TIPOS DE ACNE" pede "os
 * sinais visíveis", "exemplos reais", "quanto tempo cada parte leva" — e traz
 * `tipo` dentro de `entities`. Nenhuma dessas palavras fala de acne: elas falam
 * do FORMATO da evidência. Um transcript sobre notebook casa com todas.
 *
 * Foi assim que dez trechos sobre Galaxy Book viraram PARTIAL em pautas de
 * skincare: dois genéricos numa frase bastavam para abrir uma janela.
 *
 * Estes termos continuam valendo como REFORÇO de uma correspondência que já é
 * temática. O que eles não podem mais é CRIAR uma — e, na m3, são eles que
 * formam o vocabulário da RELAÇÃO: a palavra que não prova assunto é
 * exatamente a que prova o que se está dizendo sobre o assunto.
 */
export const RADAR_GENERIC_MATCH_TERMS = new Set([
  /* o formato da evidência */
  "passo", "passos", "etapa", "etapas", "ordem", "exemplo", "exemplos", "caso", "casos",
  "sinal", "sinais", "tipo", "tipos", "parte", "partes", "item", "itens", "lista",
  /* a execução */
  "erro", "erros", "comum", "comuns", "real", "reais", "certo", "errado", "melhor", "pior",
  "fazer", "faz", "feito", "usar", "uso", "leva", "levar", "vale", "regra", "forma",
  /* o tempo e o lugar, sem assunto */
  "tempo", "quanto", "quando", "onde", "aparecem", "aparece", "dura", "duracao", "minuto", "minutos",
  /*
   * OS VERBOS DA PERGUNTA — eles perguntam, não respondem.
   *
   * "O que CAUSA acne?" tem um assunto só: acne. Um vídeo de notebook dizendo
   * "isso causa lentidão" casaria com a pauta se `causa` valesse como âncora —
   * e o mesmo vale para piora, controlar, evitar, ajuda.
   */
  "causa", "causar", "causam", "piora", "piorar", "controlar", "controle", "evitar",
  "ajuda", "ajudar", "resolve", "resolver", "funciona", "funcionar", "precisa", "precisar",
  /* o andaime da pergunta */
  "qual", "quais", "sao", "quanto", "quantos", "porque", "porquê",
  /* a leitura e a meta-informação da investigação */
  "visivel", "visiveis", "mostra", "mostrar", "explica", "explicar", "diferenca", "distingue", "parecido", "parecidos",
  "ressalva", "profissional", "assunto", "necessidade", "pergunta", "perguntas", "resposta", "respostas",
  "pagina", "paginas", "comparavel", "comparaveis", "consulta", "consultas", "tratam", "formulando", "encontradas",
]);

const ehGenerico = (termo: string) => RADAR_GENERIC_MATCH_TERMS.has(termo);
const tematicas = (valor: string) => palavras(valor).filter(termo => !ehGenerico(termo));

/* ===================== a diluição: o termo de fundo ===================== */

/**
 * O TERMO QUE ESTÁ EM TODA PARTE NÃO APONTA PARA LUGAR NENHUM — §2.
 *
 * Este é o defeito que produziu 219 trechos numa única pauta. "pele" aparece em
 * 232 dos 2302 segmentos de um material sobre skincare: ela é o PANO DE FUNDO
 * do vídeo, não evidência de nada. Um trecho escolhido porque disse "pele" foi
 * escolhido porque o vídeo é sobre pele — o que não seleciona coisa alguma.
 *
 * A medida é do MATERIAL, não de uma lista: nada aqui sabe o que é "pele" nem o
 * que é "acne". Num vídeo que mal fala de pele, "pele" volta a distinguir — e é
 * por isso que a regra é contada a cada execução, sobre os segmentos daquelas
 * fontes.
 *
 * DOIS LIMITES, e o segundo é o que protege corpus pequeno: para ser diluído, o
 * termo precisa aparecer em MUITOS segmentos e numa FATIA grande deles. Sem o
 * piso absoluto, num transcript de 20 segmentos qualquer palavra dita duas
 * vezes viraria fundo, e a pauta inteira cairia para NOT_FOUND.
 */
export const RADAR_DILUTED_TERM_MIN_SEGMENTS = 40;
export const RADAR_DILUTED_TERM_SHARE = 0.05;

export function radarDilutedCorpusTerms(sources: readonly RadarMatchableSource[]): Set<string> {
  const segmentos = sources.flatMap(item => item.segments);
  const limite = Math.max(RADAR_DILUTED_TERM_MIN_SEGMENTS, Math.ceil(segmentos.length * RADAR_DILUTED_TERM_SHARE));

  const frequencia = new Map<string, number>();
  for (const segmento of segmentos) {
    for (const termo of new Set(palavras(segmento.text))) frequencia.set(termo, (frequencia.get(termo) || 0) + 1);
  }
  return new Set([...frequencia.entries()].filter(([, vezes]) => vezes >= limite).map(([termo]) => termo));
}

/* ================== a relação: o que a pauta PERGUNTA ================== */

/**
 * O TÍTULO É O CONTRATO SEMÂNTICO — VIDEOS_3.4 · §1, e ele manda.
 *
 * "O que causa acne?" e "Quais são os tipos de acne?" têm o mesmo assunto e
 * pedem evidências diferentes. Um trecho que diz "quem tem acne sofre" toca o
 * assunto das duas e não responde nenhuma.
 *
 * ESTA É A AUTORIDADE QUE FALTAVA NA m3. Lá a guia (`whatToLookFor`) decidia
 * sozinha o estado da pauta, e o resultado foi uma inversão: "O que causa
 * acne?" chegou a SUPPORTED sem que nenhuma passagem explicasse causa alguma —
 * bastou o vídeo trazer ressalva profissional, exceção e erro comum, que é o
 * que aquela guia pedia. A guia continua valendo para procurar, qualificar,
 * ranquear e dizer o que falta. O que ela não pode mais é compensar a ausência
 * do objetivo que o título declarou.
 *
 * A ESPÉCIE DA INTENÇÃO SAI DO PRÓPRIO TÍTULO — dele, da pergunta e do título
 * da seção. Nada aqui sabe o que é acne; o que está escrito abaixo é como o
 * PORTUGUÊS expressa causa, agravamento, classificação, procedimento,
 * identificação e definição. É vocabulário de língua, não de domínio: a mesma
 * tabela serve para marcenaria e para dermatologia.
 */
export const RADAR_BRIEF_TITLE_INTENTS = ["CAUSE", "AGGRAVATION", "CLASSIFICATION", "PROCEDURE", "IDENTIFICATION", "DEFINITION", "OPEN"] as const;
export type RadarBriefTitleIntentKind = typeof RADAR_BRIEF_TITLE_INTENTS[number];

/*
 * O QUE FICOU DE FORA DESTAS LISTAS, E POR QUÊ.
 *
 * "então", "antes", "sempre", "vezes", "segundo", "resultado", "mostra": todas
 * pareciam pistas e nenhuma é. São marcadores de fala — aparecem em 213, 114,
 * 65 segmentos deste material — e admiti-las fazia a relação passar por
 * presença de conversa, não de conteúdo. Um trecho sobre lavar o cabelo virou
 * "procedimento de skincare" por causa de "antes" e "então".
 */
const INTENCAO_PISTAS: Record<Exclude<RadarBriefTitleIntentKind, "OPEN">, string[]> = {
  CAUSE: [
    "causa", "causas", "causada", "causado", "causam", "causar", "causou", "provoca", "provocam", "provocar",
    "gera", "geram", "gerar", "origem", "motivo", "motivos", "razao", "devido", "responsavel", "responsaveis",
    "resulta", "desencadeia", "fator", "fatores", "influencia", "influenciam", "culpa", "surge", "surgem",
    /*
     * CONTRIBUIÇÃO É CAUSA — §1. "o excesso de sebo pode CONTRIBUIR para" é o
     * exemplo que o gate cita como candidato causal legítimo, e ele estava
     * caindo fora porque "contribui" morava só no agravamento.
     */
    "contribui", "contribuem", "contribuir", "contribuicao",
    /* EN/ES — a fonte fica no idioma original, e a intenção também se diz nele. */
    "cause", "causes", "caused", "because", "due", "reason", "origin", "triggers", "debido", "razon", "origen",
  ],
  AGGRAVATION: [
    "piora", "pioram", "piorar", "pior", "agrava", "agravam", "agravar", "aumenta", "aumentam", "aumentar",
    "aumento", "intensifica", "prejudica", "atrapalha", "estimula", "estimulam", "excesso", "exagero",
    "contribui", "favorece", "potencializa", "fator", "fatores",
    "worse", "worsen", "worsens", "increase", "increases", "excess", "peor", "empeora", "exceso",
  ],
  CLASSIFICATION: [
    "tipo", "tipos", "existe", "existem", "chamado", "chamada", "chamam",
    "conhecido", "conhecida", "classificacao", "classifica", "categoria", "categorias", "grau", "graus",
    "nivel", "niveis", "leve", "moderada", "moderado", "grave", "severa", "diferentes", "divide", "dividida", "varia",
    "type", "types", "kind", "kinds", "called", "known", "level", "levels", "mild", "severe", "llamado",
  ],
  PROCEDURE: [
    "passo", "passos", "etapa", "etapas", "ordem", "primeiro", "depois",
    "usar", "usa", "use", "uso", "usando", "aplicar", "aplica", "aplique", "passar", "passa", "passe",
    "lavar", "lava", "lave", "limpar", "limpa", "secar", "faca", "comeca", "comeco", "comecar", "termina",
    "rotina", "manha", "noite", "diariamente", "quantidade", "dica", "dicas", "controlar", "controle",
    "order", "step", "steps", "first", "then", "start", "starts", "apply", "using", "wash", "routine",
    "primero", "luego", "paso", "pasos", "rutina", "lavar", "limpiar",
  ],
  IDENTIFICATION: [
    "sinal", "sinais", "aparece", "aparecem", "surge", "surgem", "visivel", "visiveis", "percebe",
    "observa", "identifica", "reconhece", "regiao", "area", "local", "zona",
    "exemplo", "exemplos", "caso", "casos", "distingue", "diferenca",
    "sign", "signs", "appears", "visible", "notice", "example", "examples", "senal", "senales", "ejemplo",
  ],
  DEFINITION: ["significa", "chama", "chamado", "chamada", "definido", "conceito", "basicamente", "resumindo", "means", "definition", "llamado"],
};

const INTENCAO_ROTULO: Record<RadarBriefTitleIntentKind, string> = {
  CAUSE: "causa", AGGRAVATION: "agravamento", CLASSIFICATION: "classificação",
  PROCEDURE: "procedimento", IDENTIFICATION: "identificação", DEFINITION: "definição",
  OPEN: "relação declarada pela pauta",
};

/*
 * A ORDEM DECIDE OS EMPATES, e ela não é arbitrária.
 *
 * "Skincare para pele oleosa: como fazer para controlar brilho e acne?" traz
 * `controlar` (procedimento) e `acne`. Pergunta-se COMO fazer — então a
 * evidência que serve é a da execução, não a da causa. Causa e agravamento vêm
 * primeiro porque suas marcas são mais específicas: quem escreve "o que causa"
 * está pedindo causa, e nada mais.
 */
const INTENCAO_PADROES: Array<{ kind: Exclude<RadarBriefTitleIntentKind, "OPEN">; padrao: RegExp }> = [
  { kind: "CAUSE", padrao: /\b(o que|que) causa|causas? d[aeo]|\bpor que\b|\bde onde vem\b|\borigem\b|\bmotivo/ },
  { kind: "AGGRAVATION", padrao: /\b(o que|que) (piora|agrava|aumenta|prejudica)|\bpiora\b|\bagrava\b|\bprejudica\b/ },
  { kind: "CLASSIFICATION", padrao: /\btipos?\b|\bcategorias?\b|\bclassifica|\bgraus?\b|\bquais sao os\b/ },
  { kind: "PROCEDURE", padrao: /\bcomo (fazer|faco|posso|usar|aplicar|montar|cuidar|controlar|tratar)|passo a passo|\brotina\b|\bordem d/ },
  { kind: "IDENTIFICATION", padrao: /\bsinais\b|como (identificar|reconhecer)|\bonde\b.*\baparec|\bcomo saber\b/ },
  { kind: "DEFINITION", padrao: /\bo que (e|sao)\b|\bsignifica\b|\bconceito\b/ },
];

export type RadarBriefTitleIntent = { kind: RadarBriefTitleIntentKind; label: string; cues: Set<string> };

/**
 * A RELAÇÃO DA PAUTA, derivada da pauta — §2 e §3.
 *
 * Quando nenhuma forma é reconhecida, a relação não é abandonada: ela passa a
 * ser o que a própria pauta declarou procurar (`whatToLookFor`) mais o
 * vocabulário da pergunta. Desligar o portão no caso desconhecido devolveria a
 * m2 pela porta dos fundos — toda ocorrência do assunto virando evidência.
 */
export function radarBriefTitleIntent(brief: RadarFrozenBriefInput): RadarBriefTitleIntent {
  const enunciado = radarMatchNormalize([brief.topic, ...brief.questions, brief.relatedSectionTitle || ""].join(" "));
  const encontrado = INTENCAO_PADROES.find(item => item.padrao.test(enunciado));

  if (encontrado) return { kind: encontrado.kind, label: INTENCAO_ROTULO[encontrado.kind], cues: new Set(INTENCAO_PISTAS[encontrado.kind]) };

  /*
   * O QUE A PAUTA PROCURA VIRA A RELAÇÃO — e só aqui `whatToLookFor` participa
   * do portão. Ele nunca cria assunto (§3): qualifica o que o assunto já abriu.
   */
  const pedido = new Set([...brief.whatToLookFor.flatMap(palavras), ...brief.questions.flatMap(palavras)]);
  return { kind: "OPEN", label: INTENCAO_ROTULO.OPEN, cues: pedido };
}

/**
 * QUÃO PERTO O OBJETIVO DO TÍTULO PRECISA ESTAR DO ASSUNTO PARA SER RESPOSTA.
 *
 * Há duas distâncias, e elas decidem coisas diferentes:
 *
 *   GUIA (10 palavras)     o trecho TOCA o objetivo — pode ser candidato;
 *   RESPOSTA (5 palavras)  o trecho RESPONDE o objetivo — sustenta a pauta.
 *
 * "o excesso de sebo pode contribuir para a acne" tem causa e assunto na mesma
 * respiração. Já "…a acne da pessoa. Mudando de assunto, a origem disso tudo
 * está no verão" tem as duas palavras na mesma passagem e não afirma nada sobre
 * causa de acne — é vizinhança, não frase.
 */
export const RADAR_TITLE_ANSWER_PROXIMITY_WORDS = 5;

export type RadarBriefTitleIntentReading = {
  kind: RadarBriefTitleIntentKind;
  label: string;
  /** As pistas do objetivo presentes perto do assunto. */
  cues: string[];
  /** O trecho TOCA o objetivo do título. Sem isto não há candidato. */
  matched: boolean;
  /** O trecho RESPONDE o objetivo. Sem pelo menos um destes, a pauta é NOT_FOUND. */
  answers: boolean;
};

/**
 * O TÍTULO CONFERIDO CONTRA UM TRECHO — §2, e é a MESMA conta nas duas pontas.
 *
 * Como os critérios da guia, esta função depende só da pauta e do texto: a
 * execução a usa para decidir o que grava, e a leitura de volta a usa para
 * reconstituir o mesmo veredito sobre o trecho gravado. Nada de corpus, nada de
 * coluna nova, nada que envelheça de um lado só.
 *
 * INTENÇÃO ABERTA NÃO VIRA PASSE LIVRE. Quando o título não declara objetivo
 * reconhecível, quem responde por ele é a guia — e é o único caso em que
 * `whatToLookFor` decide sozinho, porque não há contrato para violar.
 */
export function radarBriefTitleIntentMatch(input: { brief: RadarFrozenBriefInput; text: string }): RadarBriefTitleIntentReading {
  const intencao = radarBriefTitleIntent(input.brief);
  const sequencia = radarMatchNormalize(input.text).split(" ").filter(Boolean);
  const assunto = radarBriefSubjectTerms(input.brief);

  const ondeAssunto = sequencia.map((termo, posicao) => (assunto.has(termo) ? posicao : -1)).filter(posicao => posicao >= 0);
  const encontradas = sequencia
    .map((termo, posicao) => ({ termo, posicao }))
    .filter(item => intencao.cues.has(item.termo));

  const perto = (limite: number) => encontradas.filter(item => ondeAssunto.some(onde => Math.abs(onde - item.posicao) <= limite));
  const naJanela = perto(RADAR_BRIEF_GUIDE_PROXIMITY_WORDS);
  const naFrase = perto(RADAR_TITLE_ANSWER_PROXIMITY_WORDS);

  return {
    kind: intencao.kind, label: intencao.label,
    cues: [...new Set(naJanela.map(item => item.termo))],
    matched: naJanela.length > 0,
    answers: naFrase.length > 0,
  };
}

/**
 * O TRECHO RESPONDE A PAUTA? — uma definição, usada nas duas pontas.
 *
 * Com título declarado, responder é ter o objetivo dele colado no assunto.
 * Com título ABERTO — nenhum objetivo reconhecível no enunciado — quem responde
 * por ele é a guia, e é o único caso em que `whatToLookFor` decide sozinho:
 * não há contrato semântico para violar.
 *
 * Duas cópias desta regra seriam duas verdades, e a segunda apareceria só
 * depois do F5, quando a tela trocasse de estado sem ninguém ter clicado.
 */
export function radarExtractAnswersTitle(input: { brief: RadarFrozenBriefInput; text: string }): boolean {
  const titulo = radarBriefTitleIntentMatch(input);
  if (titulo.kind !== "OPEN") return titulo.answers;
  return radarBriefCriteriaMatched(input).length > 0;
}

/**
 * O ASSUNTO DA PAUTA, sem o filtro do corpus.
 *
 * Marca ONDE a pauta está dentro de um trecho. A especificidade do assunto —
 * quem pode ABRIR uma janela — é outra conta, e essa depende do material.
 */
function radarBriefSubjectTerms(brief: RadarFrozenBriefInput): Set<string> {
  return new Set([
    ...[brief.topic, ...brief.questions, brief.relatedSectionTitle || ""].flatMap(tematicas),
    ...(brief.entities || []).flatMap(item => tematicas(item)),
  ]);
}

/* ======================= os termos de uma pauta ======================== */

/* =========== a guia: o que a pauta MANDA PROCURAR no material =========== */

/**
 * `whatToLookFor` É O CONTRATO DE RECUPERAÇÃO — §1.B, §2 e §3.
 *
 * A pauta congelada não diz apenas de QUE ela trata: ela diz o que procurar no
 * vídeo. "A ordem real dos passos", "erros comuns durante a execução", "quanto
 * tempo cada parte leva" — cada um desses é um CRITÉRIO, e o casamento existe
 * para atendê-los, não para achar ocorrências do assunto.
 *
 * Era isso que o matcher não usava. Com o assunto sozinho, três vídeos
 * pertinentes produziram 509 trechos: busca lexical com outro nome.
 *
 * CADA CRITÉRIO É AVALIADO SEPARADAMENTE, e cada trecho declara quais sustenta.
 * Daí sai o que a tela mostra — o que foi encontrado, e o que continua
 * faltando. Uma pauta com quatro critérios e dois atendidos é PARCIAL, e a
 * frase "2 de 4 aspectos" diz mais do que qualquer contagem de ocorrência.
 *
 * A TABELA ABAIXO É DE PORTUGUÊS, NÃO DE DOMÍNIO. Ela sabe como a língua
 * expressa sequência, execução, erro, duração, sinal, lugar, exemplo,
 * distinção e ressalva. Não sabe o que é acne, e não pode saber: a mesma
 * tabela serve para marcenaria.
 */
export const RADAR_BRIEF_CRITERION_KINDS = [
  "ORDER", "EXECUTION", "ERROR", "DURATION", "QUANTITY",
  "SIGNS", "LOCATION", "EXAMPLE", "DISTINCTION", "CAVEAT", "OPEN",
] as const;
export type RadarBriefCriterionKind = typeof RADAR_BRIEF_CRITERION_KINDS[number];

const CRITERIO_PISTAS: Record<Exclude<RadarBriefCriterionKind, "OPEN">, string[]> = {
  ORDER: [
    "primeiro", "segundo", "terceiro", "ultimo", "depois", "antes", "comeco", "comeca", "comecar",
    "inicio", "termina", "final", "seguida", "sequencia", "ordem", "etapa", "etapas", "passo", "passos",
    "first", "then", "next", "last", "step", "steps", "order", "primero", "luego", "paso", "pasos",
  ],
  EXECUTION: [
    "usar", "uso", "usa", "use", "usando", "aplicar", "aplico", "aplica", "aplique", "aplicando",
    "passar", "passo", "passa", "passe", "lavar", "lavo", "lava", "lave", "limpar", "limpa", "limpo",
    "esfregar", "espalhar", "espalho", "coloco", "colocar", "misturar", "secar", "enxaguar", "massagear",
    "faco", "fazer", "apply", "using", "wash", "clean", "aplicar", "lavar",
  ],
  ERROR: [
    "erro", "erros", "errado", "errada", "engano", "evite", "evitar", "nunca", "jamais",
    "cuidado", "problema", "exagero", "exagerar", "demais", "pior", "prejudica", "atrapalha",
    "mistake", "wrong", "avoid", "error",
  ],
  DURATION: [
    "minuto", "minutos", "segundos", "hora", "horas", "dia", "dias", "semana", "semanas",
    "mes", "meses", "tempo", "demora", "demorar", "dura", "durar", "leva", "levar",
    "rapido", "devagar", "imediato", "minutes", "hours", "weeks", "takes",
  ],
  QUANTITY: [
    "quantidade", "pouco", "pouca", "colher", "gota", "gotas", "camada", "camadas",
    "porcao", "dose", "grama", "gramas", "ervilha", "amount",
  ],
  SIGNS: [
    "sinal", "sinais", "visivel", "visiveis", "aparece", "aparecem", "surge", "surgem",
    "percebe", "observa", "aspecto", "textura",
    "marca", "marcas", "mancha", "manchas", "vermelho", "vermelha", "inchado", "inchada",
    "sign", "signs", "visible", "appears",
  ],
  LOCATION: [
    "onde", "regiao", "regioes", "area", "areas", "local", "locais", "zona", "zonas",
    "lugar", "lugares", "lado", "canto", "superficie", "where", "area", "zone",
  ],
  EXAMPLE: [
    "exemplo", "exemplos", "caso", "casos", "paciente", "pacientes", "cliente", "clientes",
    "aconteceu", "atendi", "vivi", "historia", "relato", "aluna", "aluno", "example", "examples",
  ],
  DISTINCTION: [
    "diferenca", "diferencas", "diferente", "diferentes", "distingue", "distinguir",
    "confunde", "confundir", "parecido", "parecida", "parecidos", "contrario", "oposto",
    "enquanto", "versus", "difference", "unlike",
  ],
  CAVEAT: [
    /*
     * "sempre", "importante" e "atenção" saíram: são ênfase de fala, não
     * ressalva. Com elas, "é muito importante a hidratação" passava por
     * "a ressalva do profissional".
     */
    "depende", "ressalva", "excecao", "excecoes", "salvo", "individual",
    "varia", "consulte", "procure", "profissional", "avaliacao", "contraindicado",
    "depends", "however",
  ],
};

/*
 * A ORDEM DECIDE OS EMPATES, e ela não é arbitrária.
 *
 * "erros comuns durante a execução" contém "execução" — se EXECUTION viesse
 * antes, o critério do ERRO seria lido como o critério da execução, e o vídeo
 * que explica o passo a passo apareceria como se explicasse o que dá errado.
 */
const CRITERIO_PADROES: Array<{ kind: Exclude<RadarBriefCriterionKind, "OPEN">; padrao: RegExp }> = [
  { kind: "ERROR", padrao: /\berros?\b|\berrad|\bengano\b|\bo que nao\b/ },
  { kind: "DURATION", padrao: /\bquanto tempo\b|\btempo\b|\bdemora\b|\bdura(cao)?\b|\bfrequencia\b/ },
  { kind: "QUANTITY", padrao: /\bquantidade\b|\bquanto (usar|aplicar|colocar)\b|\bdose\b/ },
  { kind: "ORDER", padrao: /\bordem\b|\bsequencia\b|passo a passo|\bprimeiro\b|\betapas?\b.*\bordem\b/ },
  { kind: "DISTINCTION", padrao: /\bdistingue\b|\bdiferen|\bparecid|\bconfund/ },
  { kind: "CAVEAT", padrao: /\bressalva\b|\bregra n[ao]o vale\b|\bexce[cs]|\bdepende\b|\bprofissional\b/ },
  { kind: "EXAMPLE", padrao: /\bexemplos?\b|\bcasos? reais?\b|\bna pratica\b/ },
  { kind: "SIGNS", padrao: /\bsinais?\b|\bvisive|\baparencia\b|\bcomo (e|sao)\b/ },
  { kind: "LOCATION", padrao: /\bonde\b|\bregi[ao]|\blocal\b|\bzona\b|\bem que parte\b/ },
  { kind: "EXECUTION", padrao: /\bo que se faz\b|cada etapa|como (se )?(faz|aplica|usa)|\bexecu|\betapas?\b/ },
];

export type RadarBriefCriterion = {
  /** Estável dentro da pauta: `c1`, `c2`… A identidade humana é o rótulo. */
  id: string;
  /** O texto da pauta, intacto. É ele que a tela mostra. */
  label: string;
  kind: RadarBriefCriterionKind;
  cues: Set<string>;
};

/**
 * OS CRITÉRIOS DE UMA PAUTA — direto do que ela declarou procurar.
 *
 * Sem `whatToLookFor` a pauta não fica sem guia: cai na forma da pergunta, que
 * é o que existia antes. Deixar o portão aberto no caso vazio devolveria a
 * busca lexical pela porta dos fundos.
 */
export function radarBriefCriteria(brief: RadarFrozenBriefInput): RadarBriefCriterion[] {
  const itens = (brief.whatToLookFor || []).map(item => item.trim()).filter(Boolean);

  if (itens.length) {
    return itens.map((label, indice) => {
      const normalizado = radarMatchNormalize(label);
      const kind = CRITERIO_PADROES.find(item => item.padrao.test(normalizado))?.kind ?? "OPEN";
      /*
       * AS PALAVRAS DO PRÓPRIO CRITÉRIO SÓ VALEM QUANDO ELE NÃO TEM ESPÉCIE.
       *
       * "a textura do produto" não cai em espécie nenhuma, e é sobre textura
       * que ela manda procurar — ali as palavras dela são a guia. Já em "quanto
       * tempo cada parte leva" a espécie é DURAÇÃO, e o que sobra é enchimento:
       * admitir "cada" fez "depende de cada casa" contar como evidência de
       * quanto tempo a rotina leva.
       */
      const pistas = kind === "OPEN" ? new Set(tematicas(label)) : new Set(CRITERIO_PISTAS[kind]);
      return { id: `c${indice + 1}`, label, kind, cues: pistas.size ? pistas : new Set(palavras(label)) };
    });
  }

  const relacao = radarBriefTitleIntent(brief);
  return [{ id: "c1", label: `o que a pauta pergunta (${relacao.label})`, kind: "OPEN", cues: relacao.cues }];
}

/**
 * O QUE O OBJETIVO AUDIOVISUAL PREFERE — §1.C, e nunca como âncora.
 *
 * `narrativePurpose` diz por que um VÍDEO ajuda: "ver a execução ensina o que o
 * texto só descreve" pede demonstração; "mostrar os sinais é mais direto que
 * descrevê-los" pede observação. Isso não escolhe assunto e não abre janela —
 * desempata, na hora de escolher quais poucos trechos vão para a tela.
 */
const PREFERENCIA_PADROES: Array<{ padrao: RegExp; kinds: RadarBriefCriterionKind[] }> = [
  { padrao: /sequencia pratica|ver a execu|demonstra|mostrar como|passo a passo/, kinds: ["ORDER", "EXECUTION"] },
  { padrao: /caracteristicas observaveis|mostrar os sinais|ver o que|visual/, kinds: ["SIGNS", "LOCATION"] },
  { padrao: /julgamento profissional|nuance|quem pratica|experiencia/, kinds: ["CAVEAT", "DISTINCTION", "EXAMPLE"] },
];

export function radarBriefAudiovisualPreference(brief: RadarFrozenBriefInput): RadarBriefCriterionKind[] {
  const proposito = radarMatchNormalize(brief.narrativePurpose || "");
  return PREFERENCIA_PADROES.find(item => item.padrao.test(proposito))?.kinds || [];
}

/**
 * QUAIS CRITÉRIOS UM TRECHO SUSTENTA — e é a MESMA conta nas duas pontas.
 *
 * A execução usa esta função para decidir o que grava; a leitura de volta usa
 * ela para reconstruir o que cada trecho gravado cobria. Se fossem duas
 * contas, o F5 mudaria a resposta da tela — e a coluna `matched_criteria` que
 * não existe no banco seria a origem do problema, não a solução.
 *
 * Por isso ela NÃO depende do corpus: só da pauta e do texto do trecho.
 *
 * A PROXIMIDADE É O QUE IMPEDE A COINCIDÊNCIA. "quanto tempo" numa ponta da
 * passagem e "acne" na outra não é evidência de quanto tempo a acne leva.
 */
export function radarBriefCriteriaMatched(input: { brief: RadarFrozenBriefInput; text: string }): string[] {
  const criterios = radarBriefCriteria(input.brief);
  const sequencia = radarMatchNormalize(input.text).split(" ").filter(Boolean);
  if (!sequencia.length) return [];

  /* O assunto, sem o filtro do corpus: aqui ele só marca ONDE a pauta está. */
  const assunto = radarBriefSubjectTerms(input.brief);
  const ondeAssunto = sequencia.map((termo, posicao) => (assunto.has(termo) ? posicao : -1)).filter(posicao => posicao >= 0);
  /* Saída antecipada, não regra: sem assunto, a comparação abaixo já reprova tudo. */
  if (!ondeAssunto.length) return [];

  return criterios
    .filter(criterio => sequencia.some((termo, posicao) =>
      criterio.cues.has(termo) && ondeAssunto.some(onde => Math.abs(onde - posicao) <= RADAR_BRIEF_GUIDE_PROXIMITY_WORDS)))
    .map(criterio => criterio.label);
}

export type RadarBriefTerms = {
  /**
   * O NÚCLEO: o assunto que a pauta declarou no próprio enunciado.
   *
   * É a régua da cobertura, e é medida SEM o corpus de propósito: a leitura de
   * volta lê trechos gravados, não transcripts, e precisa chegar ao mesmo
   * estado que a execução chegou.
   */
  nucleo: Set<string>;
  /** O que pode CRIAR uma correspondência. Núcleo menos o que está diluído. */
  ancoras: Set<string>;
  /** Frases do enunciado — "pele oleosa" vale onde "pele" sozinha não vale. */
  frases: string[];
  /** Reforço: pesa no ranking, nunca abre janela. */
  reforco: Set<string>;
  /** Entidades que sobreviveram ao filtro, com o texto original preservado. */
  entidades: Array<{ original: string; normalizado: string; primaria: boolean }>;
  perguntas: Array<{ original: string; nucleo: Set<string> }>;
  relacao: RadarBriefTitleIntent;
};

/**
 * FRASES DO ENUNCIADO — o par que diz o que a palavra sozinha não diz.
 *
 * "pele oleosa" e "brilho da pele" são assunto; "pele" é fundo. Os bigramas e
 * trigramas contíguos do enunciado recuperam essa especificidade sem que
 * ninguém precise listar domínio nenhum: a frase é da pauta, e ela só conta
 * quando aparece inteira e contígua no trecho.
 */
function frasesDoEnunciado(valores: string[]): string[] {
  const frases = new Set<string>();
  for (const valor of valores) {
    const sequencia = radarMatchNormalize(valor).split(" ").filter(Boolean);
    for (let tamanho = 2; tamanho <= 3; tamanho += 1) {
      for (let inicio = 0; inicio + tamanho <= sequencia.length; inicio += 1) {
        const janela = sequencia.slice(inicio, inicio + tamanho);
        const uteis = janela.filter(item => item.length >= 3 && !VAZIAS.has(item) && !ehGenerico(item));
        /* Uma frase precisa de DOIS termos de assunto; "de pele" não é frase. */
        if (uteis.length >= 2) frases.add(janela.join(" "));
      }
    }
  }
  return [...frases];
}

/**
 * Os termos da pauta, separados pelo PAPEL de cada um — §2 e §3.
 *
 * `evidenceNeeded` continua fora do pool inteiro: ele conta quantas páginas
 * trataram da necessidade e por quantas consultas foram encontradas. É meta
 * sobre a investigação, e nenhuma palavra dele fala do assunto.
 */
export function radarBriefMatchTerms(
  brief: RadarFrozenBriefInput,
  contexto: { diluted?: Set<string>; briefs?: readonly RadarFrozenBriefInput[] } = {},
): RadarBriefTerms {
  const diluidos = contexto.diluted || new Set<string>();
  const enunciado = [brief.topic, ...brief.questions, brief.relatedSectionTitle || ""];
  const nucleo = new Set(enunciado.flatMap(tematicas));

  /*
   * A ENTIDADE HERDADA DO ARTIGO NÃO É O ASSUNTO DESTA PAUTA — §8.
   *
   * As quatro pautas do artigo real chegaram com `oleosa` em `entities`: é a
   * entidade do ARTIGO, copiada em todas. Deixá-la criar correspondência é o
   * que fazia "O que causa acne?" receber trecho que só falava de pele oleosa —
   * o exemplo que o gate cita como proibido.
   *
   * A regra não olha para o significado: uma entidade que aparece em METADE OU
   * MAIS das pautas da mesma investigação não distingue pauta nenhuma, e por
   * isso deixa de abrir janela. Ela continua reforçando. Quando a entidade está
   * no enunciado da própria pauta, nada disso se aplica — ali ela é o assunto.
   */
  const outras = (contexto.briefs || []).filter(item => item.briefId !== brief.briefId);
  const compartilhada = (normalizado: string) => {
    if (!outras.length) return false;
    const vezes = outras.filter(item => item.entities.some(entidade => radarMatchNormalize(entidade) === normalizado)).length + 1;
    return vezes >= Math.max(2, Math.ceil(((contexto.briefs || []).length) / 2));
  };

  const entidades = brief.entities
    .map(item => ({ original: item, normalizado: radarMatchNormalize(item) }))
    .filter(item => item.normalizado.length >= 3 && !ehGenerico(item.normalizado))
    .map(item => ({
      ...item,
      primaria: !diluidos.has(item.normalizado)
        && (item.normalizado.split(" ").length > 1 || nucleo.has(item.normalizado) || !compartilhada(item.normalizado)),
    }));

  const ancoras = new Set([
    ...[...nucleo].filter(termo => !diluidos.has(termo)),
    ...entidades.filter(item => item.primaria).map(item => item.normalizado),
  ]);

  return {
    nucleo,
    ancoras,
    frases: frasesDoEnunciado([...enunciado, ...brief.entities]),
    reforco: new Set([
      ...brief.whatToLookFor.flatMap(palavras),
      ...[...nucleo].filter(termo => diluidos.has(termo)),
      ...entidades.filter(item => !item.primaria).map(item => item.normalizado),
    ]),
    entidades,
    perguntas: brief.questions
      .map(item => ({ original: item, nucleo: new Set(tematicas(item)) }))
      .filter(item => item.nucleo.size > 0),
    relacao: radarBriefTitleIntent(brief),
  };
}

/* ============================ o portão ================================= */

/**
 * A ÚNICA PORTA POR ONDE UM TRECHO ENTRA — §13 do Gate 3.
 *
 * Recebe índices de segmentos e devolve o trecho ancorado neles, ou `null`.
 * Os tempos e o texto saem dos SEGMENTOS, nunca do que o chamador afirmou: se
 * amanhã a proposta vier de um modelo, o texto que ele "citou" é descartado e
 * o que vale é o que está gravado.
 *
 * Índice fora da faixa, lista vazia ou segmento sem tempo derrubam a proposta
 * inteira. Evidência meio ancorada não é evidência.
 */
export function anchorRadarExtract(input: {
  segments: readonly RadarTranscriptSegment[];
  candidate: {
    videoBriefId: string;
    videoSourceId: string;
    segmentIndexes: number[];
    reasonForRelevance: string;
    matchedQuestions?: string[];
    matchedEntities?: string[];
    supportType: RadarExtractSupportType;
    confidence: number;
    limitations?: string[];
  };
  sourceLanguage: string | null;
  processingVersion: number;
}): RadarRelevantExtract | null {
  const indices = [...new Set(input.candidate.segmentIndexes)].sort((a, b) => a - b);
  if (!indices.length) return null;

  const ancorados = indices.map(indice => input.segments[indice]);
  if (ancorados.some(item => !item || typeof item.startMs !== "number" || typeof item.endMs !== "number" || !item.text?.trim())) return null;

  const startMs = Math.min(...ancorados.map(item => item.startMs));
  const endMs = Math.max(...ancorados.map(item => item.endMs));
  if (!(endMs >= startMs)) return null;

  return {
    videoBriefId: input.candidate.videoBriefId,
    videoSourceId: input.candidate.videoSourceId,
    segmentIndexes: indices,
    startMs,
    endMs,
    /* O TEXTO É DOS SEGMENTOS. O que o chamador escreveu não é consultado. */
    originalText: ancorados.map(item => item.text.trim()).join(" "),
    sourceLanguage: input.sourceLanguage,
    reasonForRelevance: input.candidate.reasonForRelevance,
    matchedQuestions: input.candidate.matchedQuestions || [],
    matchedEntities: input.candidate.matchedEntities || [],
    /*
     * O PORTÃO NÃO CONHECE A PAUTA — ele só ancora. Quem sabe quais critérios
     * o trecho sustenta é quem tem a pauta em mãos, e é lá que a lista entra.
     */
    matchedCriteria: [],
    answersTitle: false,
    supportType: input.candidate.supportType,
    confidence: Math.max(0, Math.min(1, input.candidate.confidence)),
    limitations: input.candidate.limitations || [],
    provenance: { processingVersion: input.processingVersion, anchoredToSegments: true },
  };
}

/* ========================= o casamento em si =========================== */

/**
 * A JANELA — porque o segmento sozinho não carrega uma ideia.
 *
 * Os segmentos reais deste material têm sete palavras e quatro segundos e meio:
 * "e aí quem tem pele oleosa sabe". Exigir assunto E relação dentro de um
 * segmento assim reprovaria toda evidência verdadeira; aceitar o segmento
 * isolado como trecho devolveria fragmentos ilegíveis.
 *
 * A janela abre em volta da ocorrência do assunto e é medida nos dois eixos:
 * segmentos e tempo. O que fecha primeiro manda.
 */
export const RADAR_EXTRACT_WINDOW_RADIUS = 2;
export const RADAR_EXTRACT_WINDOW_MAX_SEGMENTS = 10;
export const RADAR_EXTRACT_WINDOW_MAX_MS = 45_000;

/**
 * QUÃO PERTO O ASSUNTO E A GUIA PRECISAM ESTAR — §2 e §5.
 *
 * Medido em PALAVRAS, não em segmentos. "o tipo de sebo que a pessoa produz… a
 * pele que tem tendência acne" tem `tipo` e `acne` no mesmo segmento e não diz
 * nada sobre tipos de acne: são dois assuntos que se cruzaram na mesma frase
 * longa. Perto do assunto, "quanto tempo" é uma afirmação sobre ele; longe, é
 * coincidência de vizinhança.
 *
 * A CONTA INCLUI AS PREPOSIÇÕES, e por isso o número não é pequeno: em
 * "para pele oleosa de manhã começo pela limpeza, depois aplico o hidratante",
 * `aplico` está a sete palavras de `oleosa` e fala exatamente dela. Contar só
 * palavras plenas mediria melhor e tornaria o número ilegível no texto.
 */
export const RADAR_BRIEF_GUIDE_PROXIMITY_WORDS = 10;

/** Quantos extratos EDITORIAIS uma pauta pode ter, somando todas as fontes. */
export const RADAR_MAX_EDITORIAL_EXTRACTS_PER_BRIEF = 3;

/**
 * O DESCONTO DA DIVERSIDADE — §6.
 *
 * Não é uma cota: é um empurrão. Diante de qualidades parecidas, a segunda
 * evidência da mesma fonte perde para a primeira de outra; diante de uma
 * diferença real de qualidade, o desconto não salva a fonte pior.
 */
export const RADAR_EXTRACT_DIVERSITY_DISCOUNT = 1.5;

/** Acima disto, dois candidatos estão dizendo a mesma coisa. */
export const RADAR_EXTRACT_DUPLICATE_SIMILARITY = 0.6;

/**
 * QUAIS FONTES PARTICIPAM — §2 do Gate 3, e a recusa é por motivo.
 *
 * Só o que o artigo SELECIONOU e o que já tem texto. Uma fonte da biblioteca
 * não selecionada não entra; uma selecionada sem texto também não, e as duas
 * ausências são coisas diferentes.
 */
export function radarMatchableSources(sources: readonly RadarMatchableSource[]) {
  const elegiveis = sources.filter(item =>
    item.selectedForArticle && item.registrationStatus !== "ARCHIVED" && item.textState === "TEXT_READY");
  const semTexto = sources.filter(item =>
    item.selectedForArticle && item.registrationStatus !== "ARCHIVED" && item.textState !== "TEXT_READY");
  return { elegiveis, semTexto };
}

type Candidato = {
  fonte: RadarMatchableSource;
  indices: number[];
  /** A janela normalizada, para comparar termos. */
  texto: string;
  /** A colagem EXATA dos segmentos — o texto que seria gravado. */
  original: string;
  termos: Set<string>;
  ancoras: string[];
  frases: string[];
  /** Os rótulos de `whatToLookFor` que este trecho sustenta. */
  criterios: string[];
  reforco: string[];
  entidades: string[];
  perguntas: string[];
  /** O trecho é do tipo que o objetivo audiovisual da pauta prefere. */
  naPreferencia: boolean;
  /** As pistas do objetivo do título encontradas perto do assunto. */
  intencao: string[];
  /** O trecho RESPONDE o objetivo do título, e não apenas o toca. */
  respondeAoTitulo: boolean;
  pontuacao: number;
};

/** As janelas contíguas de uma lista de índices, unindo o que se sobrepõe. */
function unirJanelas(indices: number[], total: number): number[][] {
  const janelas: number[][] = [];
  for (const indice of [...new Set(indices)].sort((a, b) => a - b)) {
    const inicio = Math.max(0, indice - RADAR_EXTRACT_WINDOW_RADIUS);
    const fim = Math.min(total - 1, indice + RADAR_EXTRACT_WINDOW_RADIUS);
    const ultima = janelas[janelas.length - 1];
    /*
     * §4 · JANELAS QUE SE TOCAM VIRAM UMA. Cinco ocorrências na mesma passagem
     * produziam cinco extratos quase idênticos; aqui elas produzem um trecho.
     * O teto existe para a passagem longa não virar um bloco sem recorte.
     */
    if (ultima && inicio <= ultima[ultima.length - 1] + 1 && fim - ultima[0] + 1 <= RADAR_EXTRACT_WINDOW_MAX_SEGMENTS) {
      for (let passo = ultima[ultima.length - 1] + 1; passo <= fim; passo += 1) ultima.push(passo);
      continue;
    }
    const janela: number[] = [];
    for (let passo = inicio; passo <= fim; passo += 1) janela.push(passo);
    janelas.push(janela);
  }
  return janelas;
}

/** Corta a janela pelo tempo real: o teto de segmentos não conhece pausa. */
function limitarPorTempo(janela: number[], segmentos: readonly RadarTranscriptSegment[], centro: number): number[] {
  const dentro = janela.filter(indice => segmentos[indice]);
  if (!dentro.length) return dentro;
  const referencia = segmentos[centro] || segmentos[dentro[0]];
  return dentro.filter(indice =>
    segmentos[indice].endMs >= referencia.startMs - RADAR_EXTRACT_WINDOW_MAX_MS
    && segmentos[indice].startMs <= referencia.endMs + RADAR_EXTRACT_WINDOW_MAX_MS);
}

const semelhanca = (a: Set<string>, b: Set<string>) => {
  const intersecao = [...a].filter(item => b.has(item)).length;
  const uniao = new Set([...a, ...b]).size;
  return uniao ? intersecao / uniao : 0;
};

/**
 * O DUPLO PORTÃO — §2, e nenhum dos dois lados basta sozinho.
 *
 *   AFINIDADE COM O ASSUNTO   o trecho fala do assunto ESPECÍFICO da pauta;
 *   CRITÉRIO DA GUIA          e atende pelo menos um item de `whatToLookFor`.
 *
 * Sem o primeiro, um vídeo de notebook casava com skincare. Sem o segundo,
 * qualquer menção ao assunto virava evidência — e foi assim que três vídeos
 * pertinentes produziram 509 trechos.
 *
 * Nenhum dos dois sozinho serve, e é literal: "quem tem pele oleosa sabe que
 * fica com brilho" tem o assunto inteiro e não diz nada sobre a ordem dos
 * passos; "de manhã começo pela limpeza, depois aplico" tem a ordem inteira e,
 * fora de um contexto de pele oleosa, fala de outra coisa.
 */
function candidatosDaFonte(input: {
  brief: RadarFrozenBriefInput;
  termos: RadarBriefTerms;
  fonte: RadarMatchableSource;
}): Candidato[] {
  const { fonte, termos } = input;
  const segmentos = fonte.segments;
  if (!segmentos.length) return [];

  const normalizados = segmentos.map(item => radarMatchNormalize(item.text));
  const conjuntos = normalizados.map(item => new Set(item.split(" ").filter(termo => termo.length >= 3 && !VAZIAS.has(termo))));

  /* Onde o ASSUNTO aparece. Só isto abre uma janela. */
  const ocorrencias: number[] = [];
  normalizados.forEach((texto, indice) => {
    const temAncora = [...termos.ancoras].some(termo => conjuntos[indice].has(termo));
    const temFrase = termos.frases.some(frase => texto.includes(frase));
    if (temAncora || temFrase) ocorrencias.push(indice);
  });
  if (!ocorrencias.length) return [];

  const candidatos: Candidato[] = [];
  for (const janelaBruta of unirJanelas(ocorrencias, segmentos.length)) {
    const centro = ocorrencias.find(indice => janelaBruta.includes(indice)) ?? janelaBruta[0];
    const janela = limitarPorTempo(janelaBruta, segmentos, centro);
    if (!janela.length) continue;

    const texto = janela.map(indice => normalizados[indice]).join(" ");
    const conjunto = new Set(janela.flatMap(indice => [...conjuntos[indice]]));

    const ancoras = [...termos.ancoras].filter(termo => conjunto.has(termo));
    const frases = termos.frases.filter(frase => texto.includes(frase));
    if (!ancoras.length && !frases.length) continue;

    /*
     * O SEGUNDO PORTÃO É O TÍTULO — VIDEOS_3.4 · §2.
     *
     * O texto avaliado é EXATAMENTE o que seria gravado: a colagem dos
     * segmentos reais, não a versão normalizada da janela. É o mesmo texto que
     * a leitura de volta vai reavaliar, e é isso que faz as duas pontas
     * chegarem ao mesmo veredito.
     *
     * A GUIA DEIXOU DE SER PORTÃO e virou qualificação. Na m3 ela barrava — e
     * barrava errado: para "O que causa acne?", cuja guia só pedia ressalva,
     * exceção e erro comum, a passagem que de fato explicava causa não tinha
     * como entrar. O contrato agora é o título; a guia diz o que mais o trecho
     * traz, ranqueia e aponta o que falta.
     */
    const original = janela.map(indice => segmentos[indice].text.trim()).join(" ");
    const titulo = radarBriefTitleIntentMatch({ brief: input.brief, text: original });
    const criterios = radarBriefCriteriaMatched({ brief: input.brief, text: original });

    /*
     * §2 · SEM O OBJETIVO DO TÍTULO, NÃO HÁ CANDIDATO — e nenhum critério da
     * guia compensa isso. Com o título ABERTO (nenhum objetivo reconhecível no
     * enunciado), quem responde por ele é a guia: é o único caso em que
     * `whatToLookFor` decide sozinho, porque não há contrato para violar.
     */
    if (titulo.kind === "OPEN" ? !criterios.length : !titulo.matched) continue;

    const entidades = termos.entidades.filter(item => texto.includes(item.normalizado)).map(item => item.original);
    const reforco = [...termos.reforco].filter(termo => conjunto.has(termo));

    /*
     * O OBJETIVO AUDIOVISUAL DESEMPATA — §1.C. A pauta que existe porque "ver a
     * execução ensina o que o texto só descreve" prefere a passagem que mostra
     * a execução. Isso não cria candidato: ordena os que já existem.
     */
    const preferidos = radarBriefAudiovisualPreference(input.brief);
    const naPreferencia = radarBriefCriteria(input.brief)
      .some(criterio => criterios.includes(criterio.label) && preferidos.includes(criterio.kind));

    /*
     * A pergunta continua registrada quando o trecho fala dela — é informação
     * honesta sobre o que ele toca. O ESTADO da pauta, porém, não sai mais
     * daqui: sai da cobertura dos critérios.
     */
    const perguntas = termos.perguntas
      .filter(item => [...item.nucleo].filter(termo => conjunto.has(termo) || frases.some(frase => frase.includes(termo))).length
        >= Math.max(Math.min(2, item.nucleo.size), Math.ceil(item.nucleo.size * 0.5)))
      .map(item => item.original);

    /*
     * RESPONDER O TÍTULO É OUTRA COISA DE TOCAR NELE — §3 e §4.
     *
     * Com o título aberto, responder é atender a guia; com título declarado, é
     * ter o objetivo colado no assunto. A ressalva profissional que não explica
     * causa nenhuma ENRIQUECE um candidato causal — e não sustenta a pauta.
     */
    const respondeAoTitulo = radarExtractAnswersTitle({ brief: input.brief, text: original });

    candidatos.push({
      fonte, indices: janela, texto, original, termos: conjunto,
      ancoras, frases, criterios, reforco, entidades, perguntas, naPreferencia,
      intencao: titulo.cues, respondeAoTitulo,
      pontuacao: pontuar({ ancoras, frases, criterios, reforco, naPreferencia, respondeAoTitulo, segmentos: janela.length }),
    });
  }
  return candidatos;
}

/**
 * O RANKING — §5, e o que ele recusa a premiar é tão importante quanto o resto.
 *
 * Tudo é contado em termos DISTINTOS. Um trecho que diz "acne" oito vezes não
 * cobre mais assunto do que um que diz uma vez: repetição é ênfase do falante,
 * não densidade de evidência. Era assim que a passagem mais repetitiva do vídeo
 * ganhava de longe da mais informativa.
 */
function pontuar(input: {
  ancoras: string[]; frases: string[]; criterios: string[]; reforco: string[];
  naPreferencia: boolean; respondeAoTitulo: boolean; segmentos: number;
}): number {
  const teto = (valor: number, maximo: number) => Math.min(valor, maximo);
  return 0
    /* §5.1 · afinidade temática forte. */
    + 2.0 * teto(input.ancoras.length, 3)
    + 1.5 * teto(input.frases.length, 2)
    /*
     * VIDEOS_3.4 · RESPONDER O TÍTULO É O QUE MAIS VALE — e por mais do que
     * qualquer critério isolado da guia: um trecho que explica a causa serve à
     * pauta da causa mais do que três que trazem ressalva, exceção e erro.
     */
    + 4.0 * (input.respondeAoTitulo ? 1 : 0)
    /* §5.2 e §5.3 · cobrir um item da guia vale muito; cobrir dois, mais. */
    + 3.0 * teto(input.criterios.length, 3)
    + 0.5 * teto(input.reforco.length, 4)
    /* §1.C · o tipo de passagem que a pauta existe para mostrar. */
    + 1.0 * (input.naPreferencia ? 1 : 0)
    /* §5.4 · janela larga dilui: o trecho longo contém tudo e prova pouco. */
    - 0.5 * (input.segmentos > RADAR_EXTRACT_WINDOW_RADIUS * 2 + 3 ? 1 : 0);
}

/**
 * A SELEÇÃO EDITORIAL — §6. Dos candidatos, poucos; e poucos diferentes.
 *
 * O limite não é de pesquisa: os candidatos todos foram olhados. Ele é do que
 * se APRESENTA e se GRAVA. Três trechos quase idênticos da mesma passagem não
 * são três evidências — são uma, repetida três vezes, ocupando o lugar de duas
 * que diriam outra coisa.
 *
 * Uma pauta terminar com um único trecho é resultado legítimo.
 */
function selecionar(candidatos: Candidato[]): Candidato[] {
  /*
   * QUEM DECIDE SE ISTO VIRA EVIDÊNCIA É `classificar` — VIDEOS_3.4 · §3.
   *
   * A seleção escolhe os melhores; a classificação é que recusa a pauta inteira
   * quando nenhum trecho responde o objetivo do título, e devolve `extracts`
   * vazio. Uma segunda guarda aqui faria a mesma coisa num lugar diferente — e
   * duas guardas para uma regra são duas chances de elas discordarem.
   *
   * O enriquecimento depende disso: a passagem que só toca o objetivo pode
   * ocupar uma vaga ao lado da que responde, e é a classificação que garante
   * que ela nunca fique sozinha.
   */
  const escolhidos: Candidato[] = [];
  const restantes = [...candidatos].sort((a, b) =>
    b.pontuacao - a.pontuacao
    || a.fonte.videoSourceId.localeCompare(b.fonte.videoSourceId)
    || a.indices[0] - b.indices[0]);

  while (escolhidos.length < RADAR_MAX_EDITORIAL_EXTRACTS_PER_BRIEF && restantes.length) {
    const comDesconto = restantes.map(item => ({
      item,
      efetiva: item.pontuacao - (escolhidos.some(pronto => pronto.fonte.videoSourceId === item.fonte.videoSourceId) ? RADAR_EXTRACT_DIVERSITY_DISCOUNT : 0),
    }));
    comDesconto.sort((a, b) =>
      b.efetiva - a.efetiva
      || a.item.fonte.videoSourceId.localeCompare(b.item.fonte.videoSourceId)
      || a.item.indices[0] - b.item.indices[0]);

    const melhor = comDesconto[0].item;
    restantes.splice(restantes.indexOf(melhor), 1);
    if (escolhidos.some(pronto => semelhanca(pronto.termos, melhor.termos) >= RADAR_EXTRACT_DUPLICATE_SIMILARITY)) continue;
    escolhidos.push(melhor);
  }

  /* A ordem de leitura é a do vídeo, não a da pontuação. */
  return escolhidos.sort((a, b) =>
    a.fonte.videoSourceId.localeCompare(b.fonte.videoSourceId) || a.indices[0] - b.indices[0]);
}

/**
 * O CASAMENTO — determinístico, sem provider, e conservador de propósito.
 *
 * NÃO USA IA NESTE GATE. O portão `anchorRadarExtract` existe para que uma
 * proposta de modelo possa ser acrescentada depois sem nunca produzir trecho
 * sem âncora — mas o que roda aqui é comparação de termos sobre texto gravado.
 */
export function matchRadarVideoBriefs(input: {
  briefs: readonly RadarFrozenBriefInput[];
  sources: readonly RadarMatchableSource[];
}): { coverage: RadarBriefCoverage[]; skippedWithoutText: string[]; candidatesFound: number } {
  const { elegiveis, semTexto } = radarMatchableSources(input.sources);
  /* A diluição é medida UMA vez, sobre o material desta execução. */
  const diluted = radarDilutedCorpusTerms(elegiveis);
  let candidatesFound = 0;

  const coverage = input.briefs.map(brief => {
    const termos = radarBriefMatchTerms(brief, { diluted, briefs: input.briefs });

    const candidatos = elegiveis.flatMap(fonte => candidatosDaFonte({ brief, termos, fonte }));
    candidatesFound += candidatos.length;

    const extracts: RadarRelevantExtract[] = [];
    for (const escolhido of selecionar(candidatos)) {
      /*
       * O QUE O TRECHO SUSTENTA, pela régua da pauta — §3.
       *
       * Dois critérios ou mais: ele responde o que a pauta foi procurar. Um
       * critério com a entidade nomeada: menção qualificada. Um critério só:
       * cobre o assunto. O enum é o que a coluna já aceita; o que mudou é a
       * régua que decide qual deles é verdade.
       */
      const supportType: RadarExtractSupportType = escolhido.criterios.length >= 2
        ? "ANSWERS_QUESTION"
        : escolhido.entidades.length ? "MENTIONS_ENTITY" : "COVERS_TOPIC";

      const assunto = [...new Set([...escolhido.frases, ...escolhido.ancoras])];
      const razao = `Cobre: ${escolhido.criterios.join(" · ")}.`;

      /*
       * A CONFIANÇA É UMA MEDIDA DO QUE FOI ENCONTRADO, e fica limitada: o
       * casamento é lexical, e um número alto sugeriria uma leitura de sentido
       * que ninguém fez.
       */
      const confianca = Math.min(0.8, 0.25 + escolhido.criterios.length * 0.15
        + (escolhido.naPreferencia ? 0.1 : 0)
        + Math.min(escolhido.frases.length, 2) * 0.05 + Math.min(escolhido.ancoras.length, 3) * 0.05);

      const limitacoes = ["Casamento por termos sobre o transcript gravado; nenhuma leitura de sentido foi feita."];
      if (fonteEstrangeira(escolhido.fonte)) limitacoes.push(`O trecho está em ${escolhido.fonte.languageCode} e não foi traduzido.`);

      const trecho = anchorRadarExtract({
        segments: escolhido.fonte.segments,
        candidate: {
          videoBriefId: brief.briefId, videoSourceId: escolhido.fonte.videoSourceId,
          segmentIndexes: escolhido.indices, reasonForRelevance: razao,
          matchedQuestions: escolhido.perguntas,
          /* O assunto coberto. Os critérios NÃO vêm daqui: são recalculados. */
          matchedEntities: [...new Set([...escolhido.entidades, ...assunto, ...escolhido.frases.flatMap(frase => frase.split(" "))])],
          supportType, confidence: confianca, limitations: limitacoes,
        },
        sourceLanguage: escolhido.fonte.languageCode,
        processingVersion: escolhido.fonte.processingVersion,
      });
      if (trecho) extracts.push({ ...trecho, matchedCriteria: escolhido.criterios, answersTitle: escolhido.respondeAoTitulo });
    }

    return { videoBriefId: brief.briefId, ...classificar(brief, extracts) };
  });

  return { coverage, skippedWithoutText: semTexto.map(item => item.videoSourceId), candidatesFound };
}

const fonteEstrangeira = (fonte: RadarMatchableSource) => Boolean(fonte.languageCode && !/^pt/i.test(fonte.languageCode));

/**
 * O ESTADO DA PAUTA — §7, e QUANTIDADE NÃO DECIDE NADA.
 *
 * Na m2 dois trechos bastavam para sair de `NOT_FOUND`, e 219 trechos não
 * diziam mais do que dois: o número media o transcript. Aqui o estado mede
 * COBERTURA — o quanto da necessidade declarada a evidência alcança.
 *
 *   NOT_FOUND   nenhum candidato passou assunto + relação;
 *   PARTIAL     há evidência específica, e ela responde parte;
 *   SUPPORTED   a evidência cobre materialmente o que a pauta pede.
 *
 * A leitura de volta chega ao MESMO estado: ela lê os trechos gravados e
 * pergunta a esta função. Por isso nada aqui depende do transcript nem do
 * corpus — só da pauta e do que cada trecho registrou ter coberto.
 */
function classificar(brief: RadarFrozenBriefInput, extracts: RadarRelevantExtract[]): Omit<RadarBriefCoverage, "videoBriefId"> {
  const fontes = [...new Set(extracts.map(item => item.videoSourceId))];
  const criterios = radarBriefCriteria(brief).map(item => item.label);
  const intencao = radarBriefTitleIntent(brief);

  /*
   * OS VEREDITOS CHEGAM PRONTOS — e há um só lugar que calcula cada um.
   *
   * Quem chama esta função preenche `matchedCriteria` e `answersTitle` antes:
   * a execução, com o que o candidato sustentou; a leitura de volta,
   * reconstituindo do texto gravado. Um terceiro cálculo aqui dentro seria
   * redundância invisível — e é onde as duas pontas começam a divergir sem que
   * nenhum teste perceba.
   */
  const cobertos = new Set(extracts.flatMap(item => item.matchedCriteria));
  const matchedCriteria = criterios.filter(item => cobertos.has(item));
  const missingCriteria = criterios.filter(item => !cobertos.has(item));
  const respondem = extracts.filter(item => item.answersTitle);

  /*
   * §3 e §6 · SEM RESPOSTA AO TÍTULO, É NOT_FOUND — e a frase diz por quê.
   *
   * A seleção já recusa gravar trecho quando nada responde a pauta, então
   * aqui `extracts` vazio significa uma de duas coisas: o material não tocou
   * o assunto, ou tocou e não respondeu. A segunda é a mais comum e a mais
   * enganosa — dizer PARCIAL para ela venderia assunto relacionado como
   * cobertura parcial.
   */
  if (!extracts.length || !respondem.length) {
    return {
      state: "NOT_FOUND", extracts: [], usefulSourceIds: [],
      criteria: criterios, matchedCriteria: [], missingCriteria: criterios,
      reason: intencao.kind === "OPEN"
        ? `Nenhuma passagem atende o que esta pauta manda procurar: ${criterios.join(" · ")}.`
        : `Há conteúdo relacionado ao tema, mas nenhuma passagem responde diretamente ao objetivo desta pauta (${intencao.label}).`,
    };
  }

  if (missingCriteria.length) {
    return {
      state: "PARTIAL", extracts, usefulSourceIds: fontes,
      criteria: criterios, matchedCriteria, missingCriteria,
      reason: `${respondem.length} trecho(s) respondem o objetivo da pauta; ${matchedCriteria.length} de ${criterios.length} aspecto(s) da guia encontrado(s), falta: ${missingCriteria.join(" · ")}.`,
    };
  }

  return {
    state: "SUPPORTED", extracts, usefulSourceIds: fontes,
    criteria: criterios, matchedCriteria, missingCriteria,
    reason: `Objetivo da pauta respondido em ${respondem.length} trecho(s) · ${criterios.length} de ${criterios.length} aspecto(s) da guia encontrado(s) em ${fontes.length} fonte(s).`,
  };
}
/* ====================== a identidade da extração ======================= */

/**
 * A VERSÃO DO MATCHER ENTRA NA IDENTIDADE DA EXECUÇÃO.
 *
 * A m1 produziu dez trechos falsos: vocabulário operacional abrindo janelas
 * entre assuntos sem relação. A m2 fechou esse portão e abriu outro: passou a
 * gravar TODA ocorrência do assunto, e uma investigação de skincare terminou
 * com 509 trechos. Corrigir a regra sem mudar a impressão digital deixaria a
 * execução errada valendo para sempre — mesmo bundle, mesmas fontes, mesmas
 * versões de processamento, então "reutiliza a existente".
 *
 * Subir a versão faz nascer uma execução NOVA, que supera a anterior pelo
 * mecanismo que já existe. A antiga não é apagada: ela continua sendo o que
 * aquela regra concluiu.
 */
export const RADAR_VIDEO_MATCHER_VERSION = 4;

export function radarExtractRunFingerprint(sources: readonly RadarMatchableSource[]): string {
  const fontes = radarMatchableSources(sources).elegiveis
    .map(item => `${item.videoSourceId}@v${item.processingVersion}`)
    .sort()
    .join("|") || "sem-fonte";
  return `m${RADAR_VIDEO_MATCHER_VERSION}:${fontes}`;
}

/**
 * A COBERTURA A PARTIR DO QUE ESTÁ GRAVADO.
 *
 * A tela não recalcula o casamento para saber o estado de uma pauta: ela lê os
 * trechos persistidos e pergunta ao MESMO classificador. Uma pauta sem trecho
 * nenhum é `NOT_FOUND` — e por isso ela não precisa (nem pode) existir como
 * linha na tabela de trechos.
 */
export function radarCoverageFromExtracts(input: {
  briefs: readonly RadarFrozenBriefInput[];
  extracts: readonly RadarRelevantExtract[];
}): RadarBriefCoverage[] {
  return input.briefs.map(brief => {
    /*
     * OS VEREDITOS SÃO RECONSTITUÍDOS AQUI — §3 e VIDEOS_3.4 · §2.
     *
     * O banco devolve o texto do trecho; a pauta congelada devolve a guia. A
     * conta é a mesma que a execução fez, sobre os mesmos dois insumos, então o
     * F5 mostra o que a execução mostrou. Nada disso precisou de coluna nova.
     */
    const extracts = input.extracts
      .filter(item => item.videoBriefId === brief.briefId)
      .map(item => ({
        ...item,
        matchedCriteria: item.matchedCriteria?.length ? item.matchedCriteria : radarBriefCriteriaMatched({ brief, text: item.originalText }),
        answersTitle: item.answersTitle || radarExtractAnswersTitle({ brief, text: item.originalText }),
      }));
    return { videoBriefId: brief.briefId, ...classificar(brief, extracts) };
  });
}

/* ==================== o que falta para poder casar ===================== */

export const RADAR_MATCHING_READINESS_STATES = [
  /** Não há artigo aberto: a camada do artigo inteira não existe. */
  "NO_ARTICLE",
  /** A investigação existe mas não foi finalizada. Sem congelamento, sem pauta. */
  "INVESTIGATION_NOT_FINALIZED",
  /** Finalizada, e ela não pediu apoio audiovisual. Resposta, não falha. */
  "NO_VIDEO_BRIEFS",
  /** Há pauta, faltam fontes: nenhuma selecionada com texto pronto. */
  "NO_READY_SOURCES",
  "READY",
] as const;
export type RadarMatchingReadinessState = typeof RADAR_MATCHING_READINESS_STATES[number];

export type RadarMatchingReadiness = {
  state: RadarMatchingReadinessState;
  canRun: boolean;
  /** O que está acontecendo, para quem opera. Nunca um código. */
  reason: string;
  readySourceCount: number;
};

/**
 * O QUE FALTA PARA CASAR — uma decisão, dois consumidores.
 *
 * A coluna das pautas e o botão dizem a MESMA coisa porque leem daqui. Quando
 * eram duas leituras, a coluna dizia "a investigação atual não produziu pauta"
 * enquanto o botão continuava aceso: duas frases sobre o mesmo fato, uma delas
 * errada.
 *
 * E as quatro ausências são DISTINTAS. "Ainda não finalizei a pesquisa",
 * "finalizei e ela não pediu vídeo", "pediu mas não escolhi fonte" e "escolhi
 * mas o texto não está pronto" pedem quatro ações diferentes de quem opera —
 * colapsá-las numa só transformaria um próximo passo claro em adivinhação.
 *
 * NENHUMA DELAS É ERRO. A investigação que não pede apoio audiovisual está
 * certa; o que seria errado é inventar pauta para ter o que casar.
 */
export function radarMatchingReadiness(input: {
  articleId: string | null;
  /** Existe bundle CONGELADO? Blueprint vivo não conta: o recorte se amarra ao congelado. */
  investigationFinalized: boolean;
  /** Quantas pautas o bundle congelado preservou. */
  frozenBriefCount: number;
  sources: readonly RadarMatchableSource[];
}): RadarMatchingReadiness {
  const { elegiveis, semTexto } = radarMatchableSources(input.sources);
  const readySourceCount = elegiveis.length;

  if (!input.articleId) {
    return { state: "NO_ARTICLE", canRun: false, readySourceCount, reason: "Selecione um artigo para casar as pautas dele com o conteúdo." };
  }
  if (!input.investigationFinalized) {
    return {
      state: "INVESTIGATION_NOT_FINALIZED", canRun: false, readySourceCount,
      reason: "Pesquisa ainda não finalizada. Finalize a investigação para gerar pautas audiovisuais quando houver necessidade.",
    };
  }
  if (input.frozenBriefCount <= 0) {
    return {
      state: "NO_VIDEO_BRIEFS", canRun: false, readySourceCount,
      reason: "A investigação finalizada não identificou necessidade de apoio audiovisual.",
    };
  }
  if (!readySourceCount) {
    return {
      state: "NO_READY_SOURCES", canRun: false, readySourceCount,
      reason: semTexto.length
        ? `${semTexto.length} fonte(s) selecionada(s) ainda sem texto pronto. Extraia o texto delas para poder casar com as pautas.`
        : "Nenhuma fonte com texto pronto está selecionada para este artigo. Marque na biblioteca as que ele vai usar.",
    };
  }

  return {
    state: "READY", canRun: true, readySourceCount,
    reason: `${input.frozenBriefCount} pauta(s) · ${readySourceCount} fonte(s) com texto pronto.`,
  };
}

/** O resumo que a coluna da esquerda mostra quando nenhuma pauta está aberta. */
export function summarizeRadarBriefCoverage(coverage: readonly RadarBriefCoverage[]) {
  const conta = (estado: RadarBriefCoverageState) => coverage.filter(item => item.state === estado).length;
  return {
    briefs: coverage.length,
    supported: conta("SUPPORTED"),
    partial: conta("PARTIAL"),
    notFound: conta("NOT_FOUND"),
    extracts: coverage.reduce((total, item) => total + item.extracts.length, 0),
    sources: new Set(coverage.flatMap(item => item.usefulSourceIds)).size,
  };
}
