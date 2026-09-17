import type { RadarCompetitiveBlueprint, RadarObservedSignal } from "./competitive-blueprint.ts";
import type { RadarCompetitiveObservedModel } from "./competitive-observed-model.ts";
import type { RadarPortableEditorial } from "./portable-read-model.ts";
import { radarPortableFlatSections } from "./portable-read-model.ts";

/**
 * ===== A RADIOGRAFIA COMPETITIVA — RADAR_PORTABLE_EXPORT_1.1 · §7 e §16 =====
 *
 * ==================== O QUE ESTE ARQUIVO CORRIGE ====================
 *
 * O CSV anterior levava "SERP suficiente", "38 vídeos", "48 produtos". São
 * verdades sobre a COLETA, e nenhuma delas ajuda a escrever: quem lê fica
 * sabendo que houve pesquisa, não o que a pesquisa encontrou.
 *
 * Aqui a evidência vira leitura editorial: o que os resultados respondem, como
 * eles se estruturam, o que perguntam, o que já está saturado, o que ninguém
 * cobre — e o que o nosso conteúdo precisa fazer de diferente por causa disso.
 *
 * ==================== A FONTE É O BLUEPRINT CANÔNICO ====================
 *
 * Todo sinal sai de `blueprint.observed`, onde cada item é
 * `{ statement, evidence, count }` com grau observacional provado pelo contrato
 * (`assertRadarBlueprintSeparation`). Nada aqui conclui: a síntese ORGANIZA o
 * que já foi observado e assinado.
 *
 * Por isso os três perfis produzem radiografia com a mesma gramática — o Google
 * lê páginas, o YouTube lê vídeos, a Amazon lê prateleira, e o escritor lê a
 * mesma estrutura nos três.
 *
 * ==================== SÓ EVIDÊNCIA REALMENTE COLETADA ====================
 *
 * Seção sem sinal não aparece. Um "## Lacunas e oportunidades" seguido de nada
 * ensina a pular a seção — e é exatamente quando ela tem conteúdo que ela
 * passaria batido.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

const linhaDoSinal = (sinal: RadarObservedSignal): string =>
  `- ${sinal.statement}${sinal.evidence ? ` _(${sinal.evidence})_` : ""}`;

const bloco = (titulo: string, linhas: readonly string[]): string[] =>
  linhas.length ? ["", `## ${titulo}`, "", ...linhas] : [];

const sinais = (titulo: string, lista: readonly RadarObservedSignal[], limite = 8): string[] =>
  bloco(titulo, lista.slice(0, limite).map(linhaDoSinal));

/* ============================== §7 · a radiografia ============================== */

export function radarCompetitiveRadiographyMarkdown(input: {
  blueprint: RadarCompetitiveBlueprint | null;
  /** O modelo do pipeline do Google, quando o perfil é GOOGLE. */
  observed?: RadarCompetitiveObservedModel | null;
  sampleLabel: string;
  sampleCount: number;
}): string {
  const { blueprint } = input;

  /*
   * SEM BLUEPRINT NÃO HÁ RADIOGRAFIA — e dizer isso é o dado.
   *
   * Uma coluna vazia seria lida como "a concorrência não faz nada". A frase
   * diz o que falta FAZER, porque é disso que se trata: a coleta existe e a
   * análise ainda não passou por ela.
   */
  if (!blueprint) {
    return [
      "# Radiografia competitiva",
      "",
      `A investigação ainda não produziu leitura competitiva analisada (${input.sampleCount} ${input.sampleLabel} coletado(s)).`,
      "Escreva sem assumir nada sobre o que a concorrência cobre.",
    ].join("\n");
  }

  const cabecalho = [
    "# Radiografia competitiva",
    "",
    `Amostra: ${input.sampleCount} ${input.sampleLabel}.`,
  ];

  if (blueprint.profile === "GOOGLE") {
    const visto = blueprint.observed;
    const modelo = input.observed || null;

    /*
     * O QUE JÁ ESTÁ SATURADO É O QUE A MAIORIA COBRE.
     *
     * A régua é a mesma do resto do Radar: metade da amostra, com piso de dois.
     * Escrever "todos falam de X" a partir de uma página só transformaria um
     * autor em mercado.
     */
    const maioria = Math.max(2, Math.ceil(visto.comparablePages / 2));
    const saturados = visto.recurrentConcepts.filter(item => (item.count ?? 0) >= maioria);
    const poucoCobertos = visto.recurrentConcepts.filter(item => (item.count ?? 0) > 0 && (item.count ?? 0) < maioria);

    return [
      ...cabecalho,
      ...bloco("Intenção observada", [
        ...visto.intent.map(linhaDoSinal),
        ...(blueprint.recommended.intentToSatisfy
          ? ["", `A intenção que este conteúdo precisa satisfazer: ${blueprint.recommended.intentToSatisfy}`]
          : []),
      ]),
      ...sinais("O que os resultados tendem a responder", saturados.length ? saturados : visto.recurrentConcepts),
      ...sinais("Padrões de estrutura", visto.recurringPatterns),
      ...sinais("Perguntas recorrentes", visto.questions),
      ...sinais("Entidades e conceitos importantes", visto.entities),
      ...sinais("Ângulos e formatos recorrentes", visto.formatSignals),
      ...sinais("Recursos e refinamentos que a busca oferece", visto.refinementSignals),
      ...sinais("O que já está saturado", saturados, 6),
      ...bloco("Lacunas e oportunidades", [
        ...visto.gaps.slice(0, 8).map(linhaDoSinal),
        ...poucoCobertos.slice(0, 4).map(item =>
          `- Pouco coberto pela amostra: ${item.statement} _(${item.evidence})_`),
        ...(modelo?.differentiations || []).slice(0, 4).map(item =>
          `- Espaço para diferenciar em "${item.subject}" _(${item.evidence})_`),
      ]),
      ...sinais("Onde o mercado e a evidência divergem", visto.conflicts, 5),
      ...sinais("Sustentação que a amostra exige", visto.authoritySignals, 5),
      ...sinais("Multimídia observada", visto.multimediaSignals, 4),
      ...sinais("Camada comercial observada", visto.commercialSignals, 4),
      ...bloco("O que o nosso conteúdo precisa fazer melhor", [
        `- ${blueprint.recommended.editorialAngle.statement} _(para ${blueprint.recommended.editorialAngle.objective})_`,
        ...blueprint.recommended.differentiation.slice(0, 5).map(item =>
          `- ${item.statement} _(para ${item.objective})_`),
      ]),
      ...bloco("O que a leitura NÃO alcançou", blueprint.limitations.slice(0, 8).map(item => `- ${item}`)),
    ].join("\n").trim();
  }

  if (blueprint.profile === "YOUTUBE") {
    const visto = blueprint.observed;
    const formato = [
      `- Long form: ${visto.longForm} · Shorts: ${visto.shorts}`,
      ...(visto.durationRange ? [`- Duração observada: ${visto.durationRange}`] : []),
      ...(visto.viewsRange ? [`- Faixa de visualizações: ${visto.viewsRange}`] : []),
      ...(visto.recency ? [`- Atualidade: ${visto.recency}`] : []),
    ];

    return [
      ...cabecalho,
      ...bloco("Formato que responde esta intenção", formato),
      ...sinais("Como os títulos se formulam", visto.titlePatterns),
      ...sinais("Quem já ocupa este assunto", visto.recurrentChannels, 6),
      ...sinais("O que aparece em mais de uma consulta", visto.crossQuery, 6),
      ...sinais("O que a busca de texto mostra sobre a mesma intenção", visto.googleSupport),
      ...bloco("Lacunas e oportunidades", visto.gaps.slice(0, 8).map(linhaDoSinal)),
      ...bloco("O que o nosso vídeo precisa fazer melhor", [
        ...(blueprint.recommended.hookDirection
          ? [`- ${blueprint.recommended.hookDirection.statement} _(para ${blueprint.recommended.hookDirection.objective})_`]
          : []),
        ...blueprint.recommended.titleDirections.slice(0, 4).map(item =>
          `- ${item.statement} _(para ${item.objective})_`),
      ]),
      /*
       * §9 e §18 · A LIMITAÇÃO ESTRUTURAL DESTA LEITURA, DITA EM VOZ ALTA.
       *
       * Nenhum vídeo foi assistido: a coleta lê título, canal, duração e
       * posição. Sem esta frase, "padrão de abertura" seria lido como
       * observação sobre como os vídeos abrem — e nada aqui observou isso.
       */
      ...bloco("O que a leitura NÃO alcançou", [
        ...blueprint.limitations.slice(0, 8).map(item => `- ${item}`),
      ]),
    ].join("\n").trim();
  }

  const visto = blueprint.observed;
  return [
    ...cabecalho,
    ...sinais("Como a prateleira se apresenta", visto.placementSignals, 6),
    ...sinais("Faixas de preço observadas", visto.priceSignals, 6),
    ...sinais("Reputação observada", visto.ratingSignals, 6),
    ...sinais("Sinais de compra", visto.purchaseSignals, 6),
    ...sinais("O que a loja sugere ao lado", visto.relatedSearchSignals, 6),
    ...sinais("O que a busca de texto mostra sobre a mesma intenção comercial", visto.googleSupport),
    ...bloco("O que o nosso conteúdo precisa fazer melhor", [
      ...(blueprint.recommended.editorialAngle
        ? [`- ${blueprint.recommended.editorialAngle.statement} _(para ${blueprint.recommended.editorialAngle.objective})_`]
        : []),
      ...(blueprint.recommended.commercialAngle
        ? [`- ${blueprint.recommended.commercialAngle.statement} _(para ${blueprint.recommended.commercialAngle.objective})_`]
        : []),
      ...blueprint.recommended.differentiationDirection.slice(0, 4).map(item =>
        `- ${item.statement} _(para ${item.objective})_`),
    ]),
    ...bloco("O que a leitura NÃO alcançou", blueprint.limitations.slice(0, 8).map(item => `- ${item}`)),
  ].join("\n").trim();
}

/* ==================== §16 · a estratégia para superar a SERP ==================== */

/**
 * ===== §16 · "ESCREVA MELHOR" NÃO É ESTRATÉGIA =====
 *
 * Esta coluna existe porque a radiografia responde "o que existe" e não
 * responde "o que fazer com isso". A diferença entre as duas é a diferença
 * entre um relatório e um plano.
 *
 * Cada linha aqui nasce de um sinal CONCRETO que o Radar observou, e diz uma
 * ação. Sem sinal, sem linha: uma estratégia genérica ocuparia o campo e
 * ensinaria a ignorá-lo.
 */
export function radarSerpOutperformanceStrategyMarkdown(input: {
  blueprint: RadarCompetitiveBlueprint | null;
  observed?: RadarCompetitiveObservedModel | null;
  editorial: RadarPortableEditorial;
  mustCover: readonly string[];
}): string {
  const movimentos: string[] = [];
  const { blueprint } = input;

  if (blueprint?.profile === "GOOGLE") {
    const visto = blueprint.observed;

    /*
     * RESPONDER ANTES É A ÚNICA VANTAGEM QUE NÃO DEPENDE DE TAMANHO.
     *
     * Ela só entra quando existe uma pergunta observada para responder: sem
     * pergunta, "responda antes" não diz o que responder.
     */
    const primeiraPergunta = visto.questions[0];
    if (primeiraPergunta) {
      movimentos.push(`- Responder "${primeiraPergunta.statement}" na abertura, antes de qualquer contextualização. _(${primeiraPergunta.evidence})_`);
    }

    for (const lacuna of visto.gaps.slice(0, 4)) {
      movimentos.push(`- Cobrir o que a amostra não cobre: ${lacuna.statement} _(${lacuna.evidence})_`);
    }

    /*
     * JUNTAR O QUE APARECE FRAGMENTADO.
     *
     * Conceitos que a maioria menciona, mas que nenhuma página trata junto,
     * são a oportunidade mais barata que existe: o material já está provado
     * como relevante, e o que falta é a costura.
     */
    const maioria = Math.max(2, Math.ceil(visto.comparablePages / 2));
    const fragmentados = visto.recurrentConcepts.filter(item => (item.count ?? 0) >= maioria).slice(0, 3);
    if (fragmentados.length >= 2) {
      movimentos.push(`- Tratar num mesmo argumento o que a amostra trata em páginas separadas: ${fragmentados.map(item => `"${item.statement}"`).join(", ")}.`);
    }

    for (const conflito of visto.conflicts.slice(0, 2)) {
      movimentos.push(`- Explicar a divergência que a amostra repete sem resolver: ${conflito.statement} _(${conflito.evidence})_`);
    }

    for (const autoridade of blueprint.recommended.authorityPlan.slice(0, 3)) {
      movimentos.push(`- Sustentar com ${autoridade.sourceTypeNeeded.toLowerCase()} a afirmação "${autoridade.claim}"${autoridade.ymylRelevant ? " — é assunto YMYL, e afirmação sem lastro aqui custa caro" : ""}.`);
    }

    for (const midia of blueprint.recommended.multimediaPlan.slice(0, 2)) {
      movimentos.push(`- ${midia.statement} _(${midia.sourceSignal})_`);
    }
  }

  if (blueprint?.profile === "YOUTUBE") {
    const visto = blueprint.observed;
    for (const lacuna of visto.gaps.slice(0, 4)) {
      movimentos.push(`- Cobrir o que os vídeos observados não cobrem: ${lacuna.statement} _(${lacuna.evidence})_`);
    }
    const apoio = visto.googleSupport.slice(0, 3);
    for (const item of apoio) {
      movimentos.push(`- Responder no vídeo o que a busca de texto mostra em aberto: ${item.statement} _(${item.evidence})_`);
    }
    if (visto.titlePatterns.length) {
      movimentos.push(`- Formular o título fora do padrão que a amostra repete (${visto.titlePatterns.slice(0, 2).map(item => item.statement).join("; ")}): repetir a formulação dominante entrega o vídeo no meio da fila.`);
    }
  }

  if (blueprint?.profile === "AMAZON") {
    const visto = blueprint.observed;
    for (const eixo of blueprint.recommended.comparisonAxes.slice(0, 4)) {
      movimentos.push(`- Estruturar a comparação por "${eixo.label}" — ${eixo.objective}${eixo.caveat ? ` (ressalva: ${eixo.caveat})` : ""}. _(${eixo.sourceSignal})_`);
    }
    for (const item of visto.relatedSearchSignals.slice(0, 3)) {
      movimentos.push(`- Cobrir a dúvida adjacente que a loja sugere: ${item.statement} _(${item.evidence})_`);
    }
    for (const lacuna of blueprint.recommended.requiresEnrichment.slice(0, 3)) {
      movimentos.push(`- A comparação NÃO pode se apoiar em ${lacuna.toLowerCase().replaceAll("_", " ")}: essa camada não foi coletada, e inventá-la é o erro mais fácil deste formato.`);
    }
  }

  /*
   * ===== O QUE O ARTICLEDNA EXIGE E A CONCORRÊNCIA NÃO ENTREGA =====
   *
   * Este é o movimento mais forte que existe, e ele não depende de perfil: o
   * fundamento declarou um assunto, a estrutura recomendada o hospeda, e a
   * amostra não o cobre. É diferencial provado dos dois lados.
   */
  const corpo = radarPortableFlatSections(input.editorial.sections)
    .flatMap(secao => [secao.heading, secao.objective, ...secao.coveragePoints])
    .join(" ")
    .toLowerCase();
  const exigidosNaEstrutura = input.mustCover.filter(topico => corpo.includes(topico.toLowerCase()));
  if (exigidosNaEstrutura.length) {
    movimentos.push(`- Entregar por inteiro o que o ArticleDNA declara e a estrutura já hospeda: ${exigidosNaEstrutura.slice(0, 5).join("; ")}.`);
  }

  if (!movimentos.length) {
    return [
      "# Estratégia para superar a SERP",
      "",
      "A investigação não produziu sinal suficiente para recomendar um movimento concreto.",
      "Não improvise diferenciação: cumpra o ArticleDNA e a estrutura recomendada.",
    ].join("\n");
  }

  return ["# Estratégia para superar a SERP", "", ...movimentos].join("\n");
}
