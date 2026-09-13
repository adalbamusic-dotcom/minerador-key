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
 * temática. O que eles não podem mais é CRIAR uma.
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

/**
 * Os termos que a pauta procura, separados pelo PAPEL que cada um tem.
 *
 * `ancoras` e `entidades` são os únicos que abrem uma correspondência; o resto
 * só a fortalece. `evidenceNeeded` saiu inteiro do pool: ele descreve quantas
 * páginas trataram da necessidade e por quantas consultas foram encontradas —
 * é meta sobre a investigação, e nenhuma palavra dele fala do assunto.
 */
export function radarBriefMatchTerms(brief: RadarFrozenBriefInput) {
  return {
    /** O assunto, sem o vocabulário operacional. Só isto inicia um match. */
    ancoras: new Set([...tematicas(brief.topic), ...brief.questions.flatMap(tematicas)]),
    /** Reforço: aparece no que a pauta pede, mas não prova assunto nenhum. */
    reforco: new Set(brief.whatToLookFor.flatMap(palavras)),
    /*
     * Entidade genérica não é entidade. `tipo` chegou aqui como "entidade" da
     * pauta TIPOS DE ACNE — e é exatamente o termo que casava com qualquer
     * vídeo do mundo.
     */
    entidades: brief.entities
      .map(item => ({ original: item, normalizado: radarMatchNormalize(item) }))
      .filter(item => item.normalizado.length >= 3 && !ehGenerico(item.normalizado)),
    /*
     * A pergunta guarda os termos INTEIROS de propósito.
     *
     * Ela não cria correspondência — só qualifica um segmento que a âncora já
     * aprovou. Ali dentro, "ordem" e "passos" deixam de ser genéricos e voltam
     * a ser o que a pauta está perguntando.
     */
    perguntas: brief.questions
      .map(item => ({ original: item, termos: new Set(palavras(item)) }))
      .filter(item => item.termos.size > 0),
  };
}

/* ============================ o portão ================================= */

/**
 * A ÚNICA PORTA POR ONDE UM TRECHO ENTRA — §13.
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
    supportType: input.candidate.supportType,
    confidence: Math.max(0, Math.min(1, input.candidate.confidence)),
    limitations: input.candidate.limitations || [],
    provenance: { processingVersion: input.processingVersion, anchoredToSegments: true },
  };
}

/* ========================= o casamento em si =========================== */

/** Janelas de segmentos consecutivos — um trecho legível, sem inventar corte. */
function agrupar(indices: number[]): number[][] {
  const janelas: number[][] = [];
  for (const indice of [...indices].sort((a, b) => a - b)) {
    const ultima = janelas[janelas.length - 1];
    if (ultima && indice - ultima[ultima.length - 1] <= 1) ultima.push(indice);
    else janelas.push([indice]);
  }
  return janelas;
}

/**
 * QUAIS FONTES PARTICIPAM — §2, e a recusa é por motivo.
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

/**
 * O CASAMENTO — determinístico, sem provider, e conservador de propósito.
 *
 * A relevância é medida contra o que a PAUTA declarou procurar: as perguntas,
 * as entidades e os termos do tópico. Um segmento que não toca nada disso não
 * entra — e uma pauta sem nenhum toque volta `NOT_FOUND`, que é resposta.
 *
 * NÃO USA IA NESTE GATE. O portão `anchorRadarExtract` existe para que uma
 * proposta de modelo possa ser acrescentada depois sem nunca produzir trecho
 * sem âncora — mas o que roda aqui é comparação de termos sobre texto gravado.
 */
export function matchRadarVideoBriefs(input: {
  briefs: readonly RadarFrozenBriefInput[];
  sources: readonly RadarMatchableSource[];
}): { coverage: RadarBriefCoverage[]; skippedWithoutText: string[] } {
  const { elegiveis, semTexto } = radarMatchableSources(input.sources);

  const coverage = input.briefs.map(brief => {
    const termos = radarBriefMatchTerms(brief);
    const extracts: RadarRelevantExtract[] = [];

    for (const fonte of elegiveis) {
      /*
       * SEM SEGMENTOS NÃO HÁ TRECHO. Uma fonte cujo texto veio sem tempos
       * (unidade indeterminada, ou transcrição fornecida pelo humano) tem o
       * texto preservado, mas não há onde ancorar um recorte — e recortar sem
       * âncora é exatamente o que este gate proíbe.
       */
      if (!fonte.segments.length) continue;

      const porIndice = new Map<number, { perguntas: string[]; entidades: string[]; termos: number }>();
      fonte.segments.forEach((segmento, indice) => {
        const normalizado = radarMatchNormalize(segmento.text);
        const conjunto = new Set(palavras(segmento.text));

        const entidades = termos.entidades.filter(item => normalizado.includes(item.normalizado)).map(item => item.original);
        const ancoras = [...termos.ancoras].filter(termo => conjunto.has(termo)).length;

        /*
         * ÂNCORA TEMÁTICA OU NADA — a correção do smoke negativo.
         *
         * Duas decisões diferentes, e era misturá-las que produzia os dez
         * falsos positivos:
         *
         *   CRIAR a correspondência  → só entidade do assunto ou termo temático
         *   QUALIFICAR o que já é dela → aí sim o vocabulário todo vale
         *
         * Por isso a pergunta é avaliada DEPOIS deste portão, e com os termos
         * dela inteiros: "Qual a ordem dos passos da rotina?" pergunta sobre
         * ordem e passos, e dentro de um segmento que já falou de rotina essas
         * palavras voltam a ser substância. Fora dele, não criam nada — que é o
         * que impedia um vídeo de notebook de casar com skincare.
         */
        if (!entidades.length && !ancoras) return;

        const perguntas = termos.perguntas
          .filter(item => [...item.termos].filter(termo => conjunto.has(termo)).length >= Math.max(2, Math.ceil(item.termos.size * 0.5)))
          .map(item => item.original);
        const reforco = [...termos.reforco].filter(termo => conjunto.has(termo)).length;

        porIndice.set(indice, { perguntas, entidades, termos: ancoras + reforco });
      });

      for (const janela of agrupar([...porIndice.keys()])) {
        const dados = janela.map(indice => porIndice.get(indice)!);
        const perguntas = [...new Set(dados.flatMap(item => item.perguntas))];
        const entidades = [...new Set(dados.flatMap(item => item.entidades))];
        const forca = dados.reduce((total, item) => total + item.termos, 0);

        const supportType: RadarExtractSupportType = perguntas.length ? "ANSWERS_QUESTION" : entidades.length ? "MENTIONS_ENTITY" : "COVERS_TOPIC";
        const razao = perguntas.length
          ? `Responde: ${perguntas.join(" · ")}`
          : entidades.length
            ? `Cita ${entidades.join(", ")}, que a pauta pede.`
            : `Fala do que a pauta procura em "${brief.topic}".`;

        /*
         * A CONFIANÇA É UMA MEDIDA DO QUE FOI ENCONTRADO, e fica limitada: o
         * casamento é lexical, e um número alto sugeriria uma leitura de
         * sentido que ninguém fez.
         */
        const confianca = Math.min(0.8, 0.25 + perguntas.length * 0.2 + entidades.length * 0.15 + Math.min(forca, 4) * 0.05);

        const limitacoes = ["Casamento por termos sobre o transcript gravado; nenhuma leitura de sentido foi feita."];
        if (fonte.languageCode && !/^pt/i.test(fonte.languageCode)) {
          limitacoes.push(`O trecho está em ${fonte.languageCode} e não foi traduzido.`);
        }

        const trecho = anchorRadarExtract({
          segments: fonte.segments,
          candidate: {
            videoBriefId: brief.briefId, videoSourceId: fonte.videoSourceId,
            segmentIndexes: janela, reasonForRelevance: razao,
            matchedQuestions: perguntas, matchedEntities: entidades,
            supportType, confidence: confianca, limitations: limitacoes,
          },
          sourceLanguage: fonte.languageCode,
          processingVersion: fonte.processingVersion,
        });
        if (trecho) extracts.push(trecho);
      }
    }

    return { videoBriefId: brief.briefId, ...classificar(brief, extracts) };
  });

  return { coverage, skippedWithoutText: semTexto.map(item => item.videoSourceId) };
}

/**
 * O ESTADO DA PAUTA — e ausência NÃO é erro (§11).
 *
 * `SUPPORTED` exige que a pauta tenha sido atendida naquilo que ela pediu:
 * se ela fez perguntas, alguma foi respondida. Encontrar menções sem responder
 * nada é `PARTIAL`, e dizer o contrário venderia cobertura que não existe.
 */
function classificar(brief: RadarFrozenBriefInput, extracts: RadarRelevantExtract[]): Omit<RadarBriefCoverage, "videoBriefId"> {
  const fontes = [...new Set(extracts.map(item => item.videoSourceId))];
  if (!extracts.length) {
    return {
      state: "NOT_FOUND", extracts, usefulSourceIds: [],
      reason: "Nenhuma fonte selecionada trouxe trecho para esta pauta. Isso não é falha: pode faltar fonte, ou o assunto não estar nos vídeos escolhidos.",
    };
  }

  const respondidas = new Set(extracts.flatMap(item => item.matchedQuestions));
  const entidades = new Set(extracts.flatMap(item => item.matchedEntities));
  const exigePergunta = brief.questions.length > 0;
  const atendida = exigePergunta ? respondidas.size > 0 : entidades.size > 0 || extracts.length >= 2;

  if (!atendida) {
    return {
      state: "PARTIAL", extracts, usefulSourceIds: fontes,
      reason: exigePergunta
        ? `${extracts.length} trecho(s) tocam o assunto, mas nenhuma das ${brief.questions.length} pergunta(s) da pauta foi respondida.`
        : `${extracts.length} trecho(s) tocam o assunto sem cobrir o que a pauta pede como evidência.`,
    };
  }

  const faltando = exigePergunta ? brief.questions.filter(item => !respondidas.has(item)) : [];
  if (faltando.length) {
    return {
      state: "PARTIAL", extracts, usefulSourceIds: fontes,
      reason: `${respondidas.size} de ${brief.questions.length} pergunta(s) respondida(s); falta: ${faltando.join(" · ")}.`,
    };
  }

  return {
    state: "SUPPORTED", extracts, usefulSourceIds: fontes,
    reason: `${fontes.length} fonte(s) útil(eis) · ${extracts.length} trecho(s)${exigePergunta ? ` · ${respondidas.size} pergunta(s) respondida(s)` : ""}.`,
  };
}

/* ====================== a identidade da extração ======================= */

/**
 * O QUE TORNA DUAS EXECUÇÕES A MESMA — §8.
 *
 * Não é o relógio: é o MATERIAL. Quais fontes participaram e em que versão de
 * transcript cada uma estava. Rodar de novo com exatamente o mesmo material
 * devolve a execução que já existe, em vez de criar recorte duplicado.
 *
 * A versão entra de propósito: reprocessar o vídeo muda a impressão digital, e
 * aí nasce uma execução NOVA — a anterior é superada, nunca sobrescrita.
 */
/**
 * A VERSÃO DO MATCHER ENTRA NA IDENTIDADE DA EXECUÇÃO.
 *
 * A v1 produziu dez trechos falsos: vocabulário operacional abrindo janelas
 * entre assuntos sem relação. Corrigir a regra sem mudar a impressão digital
 * deixaria a execução errada valendo para sempre — mesmo bundle, mesmas fontes,
 * mesmas versões de processamento, então "reutiliza a existente".
 *
 * Subir a versão faz nascer uma execução NOVA, que supera a anterior pelo
 * mecanismo que já existe. A antiga não é apagada: ela continua sendo o que
 * aquela regra concluiu.
 */
export const RADAR_VIDEO_MATCHER_VERSION = 2;

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
  return input.briefs.map(brief => ({
    videoBriefId: brief.briefId,
    ...classificar(brief, input.extracts.filter(item => item.videoBriefId === brief.briefId)),
  }));
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
