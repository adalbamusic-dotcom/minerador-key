/**
 * ===== A LEITURA EDITORIAL DO YOUTUBE — RADAR_BLUEPRINT_CANONICAL_1 §10-13 =====
 *
 * ======================== O QUE ESTE MÓDULO CORRIGE ========================
 *
 * A aba de YouTube mostrava 38 cards de concorrente, faixas de duração e
 * contagens de padrão. Tudo verdadeiro, e nada disso responde a pergunta de
 * quem abre a tela: O QUE EU PRODUZO?
 *
 * "7 títulos usam rotina" é observação. "Use promessa específica antes da
 * palavra rotina, porque a repetição já saturou o formato" é o que permite
 * escrever. Este módulo faz a segunda coisa, a partir da primeira.
 *
 * ===================== O QUE ELE NÃO PODE FAZER =====================
 *
 * A SERP do YouTube devolve TÍTULO, canal, duração, posição, visualizações e
 * data. Ela não abre vídeo nenhum. Então:
 *
 *   - não existe "gancho observado". O gancho é recomendação, vive em
 *     `recommended` e carrega o sinal que o originou;
 *   - não existe estrutura de roteiro concorrente. O roteiro é DIREÇÃO
 *     editorial derivada da intenção e do formato dominante;
 *   - título de concorrente nunca vira recomendação. Copiar o que está lá é
 *     entregar o problema que a pessoa veio resolver.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem IA.
 */

import {
  RadarCompetitiveBlueprintSchema,
  recomendacao,
  sinalObservado,
  type RadarArticleApplication,
  type RadarBlueprintRecommendation,
  type RadarObservedSignal,
  type RadarResearchRef,
  type RadarShortPlan,
  type RadarYoutubeCanonicalBlueprint,
  type RadarYoutubeScriptSection,
} from "./competitive-blueprint.ts";
import type { RadarYoutubeBlueprint } from "./youtube-blueprint.ts";
import type { RadarMultimodalBlueprint } from "./multimodal-blueprint.ts";

/* ================== §10 · títulos: do padrão à direção ================== */

/**
 * O QUE CADA PADRÃO DE TÍTULO PEDE — e o que fazer quando ele já saturou.
 *
 * A leitura não é "copie o padrão dominante". Um formato que 13 de 38 já usam
 * deixou de diferenciar: repeti-lo entrega mais um item indistinguível. A
 * direção sai da tensão entre o que domina e o que falta.
 */
const DIRECAO_POR_PADRAO: Record<string, { quandoDomina: string; quandoAusente: string; objetivo: string }> = {
  ROTINA: {
    quandoDomina: "Mantenha a palavra rotina, mas ponha a promessa específica ANTES dela — o formato já saturou e sozinho não diferencia.",
    quandoAusente: "Abra espaço para o enquadramento de rotina: a busca trata a intenção como sequência, e ninguém está nomeando isso.",
    objetivo: "ser reconhecido no formato que a busca espera sem virar mais um da lista.",
  },
  PASSO_A_PASSO: {
    quandoDomina: "Prometa a ordem E o critério: só numerar passos repete o que já existe em quantidade.",
    quandoAusente: "Prometa a sequência explicitamente — a intenção é de execução e ninguém está entregando ordem.",
    objetivo: "capturar quem busca execução, não explicação.",
  },
  AUTORIDADE: {
    quandoDomina: "A autoridade profissional já é o padrão da página: diferencie pelo recorte, não pelo crachá.",
    quandoAusente: "Declare a autoridade no título: a amostra é dominada por criadores sem credencial visível.",
    objetivo: "responder à expectativa de confiança desta intenção.",
  },
  NAO_FACA: {
    quandoDomina: "O alerta já está saturado: use-o como segundo elemento, depois da promessa positiva.",
    quandoAusente: "Um recorte de erro comum está livre — a amostra só promete acerto.",
    objetivo: "capturar a busca de quem já tentou e falhou.",
  },
  LISTA: {
    quandoDomina: "Número no título já é comum aqui: troque a quantidade por critério de escolha.",
    quandoAusente: "Uma lista enumerada está livre neste recorte.",
    objetivo: "dar previsibilidade de escopo a quem decide pelo título.",
  },
  PERGUNTA: {
    quandoDomina: "A pergunta direta já é comum: use-a só se a sua resposta contrariar o consenso da amostra.",
    quandoAusente: "Formular como pergunta espelha como a busca é digitada, e ninguém está fazendo isso.",
    objetivo: "casar com a formulação da intenção.",
  },
  TRANSFORMACAO: {
    quandoDomina: "A promessa de resultado está em toda parte: ancore em prazo e condição para não virar mais uma.",
    quandoAusente: "Prometer a mudança observável está livre nesta amostra.",
    objetivo: "dar ao espectador uma razão concreta para ficar.",
  },
  COMPARACAO: {
    quandoDomina: "A comparação já é o formato: diferencie pelo critério de decisão, não pelos itens comparados.",
    quandoAusente: "Um recorte comparativo está livre — a intenção tem escolha embutida.",
    objetivo: "atender quem está decidindo, não aprendendo.",
  },
};

const DIRECAO_NEUTRA = {
  quandoDomina: "Este enquadramento domina a amostra: use-o com um recorte que a amostra não cobre.",
  quandoAusente: "Este enquadramento está livre na amostra.",
  objetivo: "diferenciar sem sair da intenção.",
};

/**
 * AS DIREÇÕES DE TÍTULO — de 2 a 4, e nunca um título de concorrente.
 *
 * Duas vêm do que DOMINA (com a ressalva de saturação) e duas do que está
 * AUSENTE. Só as dominantes produziriam mais do mesmo; só as ausentes
 * ignorariam o que a busca reconhece como resposta.
 */
export function radarYoutubeTitleDirections(input: {
  blueprint: RadarYoutubeBlueprint;
  primaryKeyword: string | null;
}): RadarBlueprintRecommendation[] {
  const coortes = [input.blueprint.observed.longForm, input.blueprint.observed.shorts];
  const contagem = new Map<string, { label: string; count: number }>();
  for (const coorte of coortes) {
    for (const padrao of coorte.titlePatterns) {
      const atual = contagem.get(padrao.id);
      contagem.set(padrao.id, { label: padrao.label, count: (atual?.count || 0) + padrao.count });
    }
  }
  const total = input.blueprint.observed.comparableSize || 1;
  const ordenados = [...contagem.entries()].sort((esquerda, direita) => direita[1].count - esquerda[1].count);

  const direcoes: RadarBlueprintRecommendation[] = [];

  /* Os dois que dominam — e a direção diz que dominar já não diferencia. */
  for (const [id, dados] of ordenados.slice(0, 2)) {
    if (!dados.count) continue;
    const regra = DIRECAO_POR_PADRAO[id] || DIRECAO_NEUTRA;
    direcoes.push(recomendacao(
      `title:${id}`,
      regra.quandoDomina,
      regra.objetivo,
      `${dados.count} de ${total} títulos comparáveis usam o enquadramento "${dados.label}".`,
    ));
  }

  /*
   * E os que a amostra NÃO usa. Uma lacuna de enquadramento é a informação mais
   * acionável que esta leitura produz: é onde dá para ser o primeiro.
   */
  const ausentes = Object.keys(DIRECAO_POR_PADRAO).filter(id => !(contagem.get(id)?.count));
  for (const id of ausentes.slice(0, 2)) {
    const regra = DIRECAO_POR_PADRAO[id];
    direcoes.push(recomendacao(
      `title:gap:${id}`,
      regra.quandoAusente,
      regra.objetivo,
      `Nenhum dos ${total} títulos comparáveis usa este enquadramento.`,
    ));
  }

  /* A keyword entra como restrição, não como título pronto. */
  if (input.primaryKeyword && direcoes.length) {
    direcoes.push(recomendacao(
      "title:keyword",
      `A formulação "${input.primaryKeyword}" precisa aparecer reconhecível no título — reescrita, não colada.`,
      "ser encontrado pela busca que originou esta investigação.",
      "É a keyword principal do artigo, e é como as pessoas digitam a intenção.",
    ));
  }

  return direcoes.slice(0, 4);
}

/* ===================== §10 · o gancho, que é RECOMENDAÇÃO ===================== */

/**
 * O GANCHO RECOMENDADO — e o contrato não tem onde guardá-lo como observação.
 *
 * Esta é a linha que mais tenta ser cruzada: dizer "os concorrentes abrem
 * assim" quando ninguém abriu vídeo nenhum. O que a amostra mostra é o que os
 * títulos PROMETEM; o gancho é o que derivamos dessa promessa.
 */
export function radarYoutubeHookDirection(input: {
  blueprint: RadarYoutubeBlueprint;
  primaryQuestion: string | null;
}): RadarBlueprintRecommendation | null {
  const dominante = [...input.blueprint.observed.longForm.titlePatterns, ...input.blueprint.observed.shorts.titlePatterns]
    .sort((esquerda, direita) => direita.count - esquerda.count)[0];
  if (!dominante) return null;

  if (input.primaryQuestion) {
    return recomendacao(
      "hook:question",
      `Abra pela dúvida que a busca faz — "${input.primaryQuestion}" — e prometa a resposta nos primeiros segundos, sem introdução de canal.`,
      "reter quem chegou com uma pergunta específica, antes que ele volte para a lista.",
      `A pergunta aparece na busca do Google para a mesma intenção, e o enquadramento dominante nos títulos é "${dominante.label}".`,
    );
  }

  return recomendacao(
    "hook:promise",
    `Abra contrariando a promessa que a amostra repete ("${dominante.label}"): diga o que muda em relação ao que a pessoa já viu.`,
    "justificar a escolha deste vídeo entre resultados que prometem a mesma coisa.",
    `${dominante.count} título(s) comparáveis usam o enquadramento "${dominante.label}".`,
  );
}

/* ====================== §11 · o roteiro, em blocos ====================== */

/**
 * A ESTRUTURA RECOMENDADA — o que cada bloco resolve, não o texto dele.
 *
 * O Radar não escreve o vídeo. Escrever aqui produziria copy sem contexto de
 * marca, chegando ao Redator para competir com o trabalho dele em vez de
 * alimentá-lo.
 *
 * Os blocos condicionais existem porque nem toda intenção pede todos: uma
 * ressalva de segurança sem evidência que a sustente seria alarme inventado.
 */
export function radarYoutubeScript(input: {
  blueprint: RadarYoutubeBlueprint;
  questions: readonly string[];
  hasAuthorityGap: boolean;
}): RadarYoutubeScriptSection[] {
  const total = input.blueprint.observed.comparableSize || 0;
  const blocos: RadarYoutubeScriptSection[] = [
    {
      block: "Gancho",
      objective: "Capturar a intenção nos primeiros segundos.",
      direction: "Diga o que o vídeo entrega antes de dizer quem você é. Apresentação de canal na abertura custa a retenção que a amostra disputa.",
      sourceSignal: `A amostra tem ${total} concorrente(s) comparáveis para a mesma busca: a decisão de ficar é tomada antes do primeiro corte.`,
    },
    {
      block: "Abertura",
      objective: "Estabelecer para quem é e o que será respondido.",
      direction: "Delimite o caso coberto. Prometer tudo faz o espectador específico abandonar.",
      sourceSignal: "A intenção declarada do artigo delimita o público desta peça.",
    },
    {
      block: "Bloco 1 · fundamento",
      objective: "Dar o porquê antes do como.",
      direction: "Explique o mecanismo que faz a recomendação funcionar. Sem ele, o passo a passo vira lista para decorar.",
      sourceSignal: "O enquadramento dominante da amostra é instrucional: o fundamento é o que a maioria pula.",
    },
    {
      block: "Bloco 2 · aplicação",
      objective: "Entregar a execução, na ordem.",
      direction: "Mostre acontecendo. Descrever o passo é o que o texto já faz melhor; o vídeo existe para demonstrar.",
      sourceSignal: "É o formato que a busca reconhece como resposta para esta intenção.",
    },
  ];

  /* Erros e objeções entram quando a busca mostra que existem dúvidas abertas. */
  if (input.questions.length) {
    blocos.push({
      block: "Bloco 3 · erros e objeções",
      objective: "Responder as dúvidas que a busca já faz.",
      direction: `Trate as perguntas observadas de frente: ${input.questions.slice(0, 3).join(" · ")}.`,
      sourceSignal: `${input.questions.length} pergunta(s) aparecem na busca do Google para a mesma intenção.`,
    });
  }

  if (input.hasAuthorityGap) {
    blocos.push({
      block: "Ressalva",
      objective: "Declarar o limite do que dá para afirmar.",
      direction: "Diga o que depende de avaliação profissional. A amostra tem autoridade escassa e a ressalva é o diferencial disponível.",
      sourceSignal: "A leitura da amostra apontou escassez de autoridade profissional entre os concorrentes.",
    });
  }

  blocos.push(
    {
      block: "Conclusão",
      objective: "Fechar a promessa feita no gancho.",
      direction: "Retome o que foi prometido e diga o que mudou. Resumo genérico devolve o espectador ao ponto de partida.",
      sourceSignal: "A promessa do gancho é a dívida que o fechamento paga.",
    },
    {
      block: "CTA",
      objective: "Dar o próximo passo, um só.",
      direction: "Um pedido por vez, ligado ao que o vídeo entregou. Dois CTAs dividem a ação e não convertem nenhuma.",
      sourceSignal: "Derivado da estrutura editorial, não observado na amostra.",
    },
  );

  return blocos;
}

/* ==================== §11 · tom, linguagem e autoridade ==================== */

export function radarYoutubeCommunication(blueprint: RadarYoutubeBlueprint) {
  const shorts = blueprint.observed.shorts.videoCount;
  const longForm = blueprint.observed.longForm.videoCount;
  const curtoDomina = shorts > longForm;

  return {
    tone: curtoDomina
      ? "Direto e sem rodeio: a amostra é dominada por peças curtas, e o espectador chega esperando resposta imediata."
      : "Didático com ritmo: a amostra sustenta peças longas, e há espaço para desenvolver o fundamento.",
    languageDirection: "Use a formulação da busca, não o vocabulário técnico do setor. Quem procura ainda não conhece o nome correto do que precisa.",
    technicalLevel: curtoDomina
      ? "Superficial na explicação, preciso na instrução: o formato curto não sustenta teoria."
      : "Intermediário: explique o mecanismo, sem exigir vocabulário prévio.",
    authorityDirection: blueprint.recommended.gaps.some(item => item.kind === "AUTORIDADE_ESCASSA")
      ? "Declare a credencial ou a fonte: a amostra é escassa em autoridade e isso está disponível como diferencial."
      : "A amostra já tem autoridade visível; competir por credencial não diferencia — diferencie pelo recorte.",
  };
}

/* ======================== §12 · o plano de Shorts ======================== */

/**
 * OS SHORTS — um por sinal, nunca por cota.
 *
 * "Sempre 4 Shorts" produziria peças sem pergunta para responder, e elas
 * chegariam ao Planejador com a mesma aparência das que têm origem. Cada peça
 * aqui aponta para o bloco da busca que a justifica.
 */
export function radarYoutubeShortsPlan(input: {
  multimodal: RadarMultimodalBlueprint | null;
}): RadarShortPlan[] {
  const pecas = (input.multimodal?.recommended.pieces || []).filter(item => item.piece === "SHORT");

  return pecas.flatMap((peca, indice) => {
    /* Sem sinal, o Short não existe — e não se inventa um para preencher. */
    if (!peca.sourceSignal || !peca.sourceQuestion) return [];
    const pergunta = peca.sourceQuestion;
    const sequencial = /ordem|passo|sequ[êe]ncia/i.test(pergunta);
    const criterio = /o que|qual|quais/i.test(pergunta);

    return [{
      id: `short:${indice + 1}`,
      sourceSignal: peca.sourceSignal,
      sourceQuestion: pergunta,
      objective: peca.objective || "Responder uma dúvida da busca em formato curto.",
      hookDirection: sequencial
        ? "Abra afirmando que a ordem muda o resultado — a dúvida é de sequência, não de itens."
        : criterio
          ? "Abra pelo critério, não pela marca: a dúvida é de escolha."
          : "Abra pela resposta, e use o resto para sustentá-la.",
      suggestedAngle: peca.suggestedAngle || "Resposta direta nos primeiros segundos.",
      contentPromise: `Responder "${pergunta}" sem exigir o vídeo longo.`,
      ctaDirection: "Aponte para o vídeo principal ou para o artigo — o Short abre a dúvida, não a esgota.",
    }];
  });
}

/* ================= §13 · como isso vira pacote editorial ================= */

export function radarYoutubeArticleApplication(input: {
  multimodal: RadarMultimodalBlueprint | null;
  shorts: readonly RadarShortPlan[];
}): RadarArticleApplication[] {
  const aplicacoes: RadarArticleApplication[] = [];
  const observado = input.multimodal?.observed;

  if (observado) {
    aplicacoes.push({
      piece: "VIDEO_HERO",
      placement: "Topo do artigo, antes do primeiro H2.",
      role: "Responde a intenção inteira para quem prefere assistir, e segura a permanência que a busca de texto mede.",
      sourceSignal: `A busca do Google devolve peça audiovisual para esta intenção (${observado.crossSerpVideos.length} vídeo(s) cruzando as duas buscas).`,
    });
  }

  input.shorts.forEach((short, indice) => {
    aplicacoes.push({
      piece: "SHORT",
      placement: `Na seção que responde "${short.sourceQuestion}".`,
      role: "Responde a dúvida no ponto do texto em que ela aparece, sem tirar o leitor da página.",
      sourceSignal: short.sourceSignal,
    });
    void indice;
  });

  const perguntas = input.multimodal?.recommended.mustAnswer || [];
  const temas = input.multimodal?.recommended.mustCover || [];
  if (perguntas.length || temas.length) {
    aplicacoes.push({
      piece: "GOOGLE_SUPPORT",
      placement: "Distribuído entre os H2, como cobertura semântica.",
      role: `Perguntas que precisam ser respondidas (${perguntas.length}) e temas que a busca trata como parte da intenção (${temas.length}). É o que liga a peça de vídeo à descoberta por texto.`,
      sourceSignal: "Leitura de apoio do Google sobre a mesma keyword principal.",
    });
  }

  return aplicacoes;
}

/* ===================== o blueprint canônico de YouTube ===================== */

export function buildRadarYoutubeCanonicalBlueprint(input: {
  articleId: string;
  articleDnaVersionId: string;
  articleDnaContentHash?: string | null;
  blueprint: RadarYoutubeBlueprint;
  multimodal: RadarMultimodalBlueprint | null;
  researchRefs: readonly RadarResearchRef[];
  primaryKeyword: string | null;
  generatedAt: string;
  frozenAt?: string | null;
}): RadarYoutubeCanonicalBlueprint {
  const { blueprint, multimodal } = input;
  const perguntas = multimodal?.recommended.mustAnswer || [];
  const lacunaDeAutoridade = blueprint.recommended.gaps.some(item => item.kind === "AUTORIDADE_ESCASSA");

  const observed = {
    comparableVideos: blueprint.observed.comparableSize,
    longForm: blueprint.observed.longForm.videoCount,
    shorts: blueprint.observed.shorts.videoCount,
    titlePatterns: [...blueprint.observed.longForm.titlePatterns, ...blueprint.observed.shorts.titlePatterns]
      .filter(item => item.count > 0)
      .map(item => sinalObservado(
        `pattern:${item.id}`,
        `Títulos usam o enquadramento "${item.label}".`,
        `${item.count} de ${blueprint.observed.comparableSize} títulos comparáveis.`,
        item.count,
      )),
    recurrentChannels: blueprint.observed.recurrentChannels.map(canal => sinalObservado(
      `channel:${canal.channelId || canal.channelName}`,
      `O canal "${canal.channelName}" aparece mais de uma vez.`,
      `${canal.videos} vídeo(s), melhor posição ${canal.bestRank}.`,
      canal.videos,
    )),
    durationRange: blueprint.recommended.durationSecondsRange
      ? `Entre ${blueprint.recommended.durationSecondsRange.min}s e ${blueprint.recommended.durationSecondsRange.max}s na coorte dominante.`
      : null,
    viewsRange: null,
    recency: null,
    crossQuery: blueprint.observed.crossQueryVideos.map(video => sinalObservado(
      `cross:${video.videoId}`,
      "Um vídeo aparece em mais de uma consulta.",
      `${video.occurrenceCount} consulta(s), melhor posição ${video.bestRank}.`,
      video.occurrenceCount,
    )),
    googleSupport: (multimodal?.observed.googleFeatures?.questionMap || []).map((item, indice) => sinalObservado(
      `google:q:${indice}`,
      item.question,
      `A busca do Google faz esta pergunta para a mesma intenção (${item.source}).`,
    )),
    gaps: blueprint.recommended.gaps.map((gap, indice) => sinalObservado(
      `gap:${gap.kind}:${indice}`,
      gap.statement,
      gap.evidence,
    )) as RadarObservedSignal[],
    sufficiency: blueprint.observed.comparableSize >= 4
      ? `${blueprint.observed.comparableSize} vídeo(s) comparáveis sustentam a leitura.`
      : `Amostra pequena: ${blueprint.observed.comparableSize} vídeo(s) comparáveis. A leitura é indicativa.`,
  };

  const shorts = radarYoutubeShortsPlan({ multimodal });
  const comunicacao = radarYoutubeCommunication(blueprint);

  return RadarCompetitiveBlueprintSchema.parse({
    schemaVersion: 1,
    profile: "YOUTUBE",
    articleId: input.articleId,
    articleDnaVersionId: input.articleDnaVersionId,
    articleDnaContentHash: input.articleDnaContentHash ?? null,
    researchRefs: [...input.researchRefs],
    observed,
    recommended: {
      format: blueprint.recommended.format,
      durationDirection: observed.durationRange,
      titleDirections: radarYoutubeTitleDirections({ blueprint, primaryKeyword: input.primaryKeyword }),
      hookDirection: radarYoutubeHookDirection({ blueprint, primaryQuestion: perguntas[0] || null }),
      script: radarYoutubeScript({ blueprint, questions: perguntas, hasAuthorityGap: lacunaDeAutoridade }),
      tone: comunicacao.tone,
      languageDirection: comunicacao.languageDirection,
      technicalLevel: comunicacao.technicalLevel,
      authorityDirection: comunicacao.authorityDirection,
      shorts,
      articleApplication: radarYoutubeArticleApplication({ multimodal, shorts }),
    },
    limitations: [...new Set([...blueprint.limitations, ...(multimodal?.limitations || [])])],
    provenance: { generatedAt: input.generatedAt, frozenAt: input.frozenAt ?? null },
  }) as RadarYoutubeCanonicalBlueprint;
}
