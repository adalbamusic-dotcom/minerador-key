import {
  MAX_ARTICLE_KEYWORDS,
  buildArticleFormationUniverse,
  type ArticleCandidate,
  type ArticleFormationKeyword,
  type ArticleFormationUniverse,
} from "./article-formation.ts";

/**
 * O QUE MUDA SE EU MOVER ESTA KEYWORD?
 *
 * A revisão humana da formação não é um formulário: é uma decisão editorial
 * tomada com consequência à vista. Mover uma busca de um artigo para outro
 * muda a coerência dos DOIS artigos, e quem decide precisa ver isso ANTES de
 * aplicar, não descobrir depois no readback.
 *
 * O simulador não tem cálculo próprio. Ele reaproveita exatamente a mesma
 * leitura que descreve o cenário corrente — `buildArticleFormationUniverse` —
 * rodada duas vezes: uma com a composição de agora, outra com a composição
 * proposta. O "depois" não é estimativa: é o mesmo read-model olhando outra
 * arrumação das mesmas keywords.
 *
 * Por isso não existe score novo aqui. Coerência, intenção e centralidade
 * vêm com os motivos que a própria leitura escreveu, e a conclusão cita os
 * números que aparecem na tela. Um número sem frase seria pedir confiança
 * cega numa decisão que é do humano.
 *
 * NADA AQUI MATERIALIZA. O simulador é puro: não persiste, não chama rede e
 * não cria ArticleDNA. Ele responde uma pergunta e devolve texto.
 */

/* ------------------------------ o cenário -------------------------------- */

/**
 * Um artigo do cenário corrente.
 *
 * `slot` é a identidade estável da composição durante a simulação. O
 * `candidateRef` do read-model deriva da Principal e MUDA quando ela troca —
 * usá-lo para parear antes/depois faria a troca de Principal parecer um
 * artigo destruído e outro criado.
 */
export type ScenarioGroup = {
  slot: string;
  principalKeywordId: string;
  keywordIds: string[];
};

export type ScenarioKeyword = ArticleFormationKeyword & {
  /** Resultados observados; leitura comparativa, nunca critério de agrupamento. */
  results?: number | null;
  funnel?: string | null;
  /** Aplicabilidade upstream do KGR, quando o Minerador a entregou. */
  applicability?: string | null;
  /** Identidade publicada protegida — Principal travada ao slug no ar. */
  protectedPublication?: boolean;
  /** Veredito da SERP vigente para esta busca, quando já executada. */
  serpVerdict?: string | null;
};

export const SCENARIO_CHANGE_KINDS = [
  "change_principal",
  "set_role",
  "move_keyword",
  "split_keyword",
  "merge_candidates",
  "remove_keyword",
  "move_to_silo",
] as const;

export type ScenarioChangeKind = (typeof SCENARIO_CHANGE_KINDS)[number];

export type ScenarioChange =
  | { kind: "change_principal"; candidateRef: string; keywordId: string }
  | { kind: "set_role"; candidateRef: string; keywordId: string; role: "secundaria" | "reforco" }
  | { kind: "move_keyword"; keywordId: string; fromCandidateRef: string; toCandidateRef: string }
  | { kind: "split_keyword"; candidateRef: string; keywordId: string }
  | { kind: "merge_candidates"; leftCandidateRef: string; rightCandidateRef: string }
  | { kind: "remove_keyword"; candidateRef: string; keywordId: string }
  | { kind: "move_to_silo"; keywordId: string; fromCandidateRef: string; targetSiloRef: string };

/**
 * A composição de agora, do jeito que o formador canônico entregou.
 *
 * O excedente do teto viaja junto: ele pertence ao mesmo assunto e sumir da
 * simulação faria o "antes" descrever um artigo que não é o da mesa.
 */
export function scenarioGroupsOf(universe: ArticleFormationUniverse): ScenarioGroup[] {
  return universe.candidates.map(candidate => ({
    slot: candidate.candidateRef,
    principalKeywordId: candidate.principalKeywordId,
    keywordIds: [
      ...candidate.keywords.map(item => item.keywordId),
      ...candidate.overflowKeywordIds,
    ],
  }));
}

/* --------------------------- aplicar a proposta -------------------------- */

export type ScenarioRefusal = { code: string; detail: string };

const clone = (groups: readonly ScenarioGroup[]): ScenarioGroup[] =>
  groups.map(group => ({ ...group, keywordIds: [...group.keywordIds] }));

const slotOf = (groups: readonly ScenarioGroup[], candidateRef: string) =>
  groups.find(group => group.slot === candidateRef) || null;

/**
 * Aplica a proposta sobre a composição, sem tocar em nada persistido.
 *
 * As recusas são de contrato, não de gosto: um artigo sem Principal e uma
 * composição que atravessa Silos não são "piores" — são inválidos, e a tela
 * precisa dizer isso antes de mostrar qualquer comparação.
 */
export function applyScenarioChange(
  groups: readonly ScenarioGroup[],
  change: ScenarioChange,
): { groups: ScenarioGroup[]; refusal: ScenarioRefusal | null; touched: string[] } {
  const proximo = clone(groups);
  const recusa = (code: string, detail: string) => ({ groups: clone(groups), refusal: { code, detail }, touched: [] });

  if (change.kind === "move_to_silo") {
    // §11 — atravessar Silo não é arrastar keyword entre artigos. O pai
    // territorial muda primeiro; o artigo do outro Silo é recalculado depois.
    return recusa(
      "CROSS_SILO_REQUIRES_TERRITORIAL_DECISION",
      "Mover para outro Silo passa pela decisão de membership territorial; o artigo do Silo de destino é recalculado depois.",
    );
  }

  if (change.kind === "set_role") {
    const grupo = slotOf(proximo, change.candidateRef);
    if (!grupo) return recusa("CANDIDATE_NOT_FOUND", "O artigo desta revisão não existe no cenário corrente.");
    if (grupo.principalKeywordId === change.keywordId) {
      return recusa("PRINCIPAL_HAS_NO_ROLE", "A Principal não vira secundária nem reforço: troque a Principal primeiro.");
    }
    // Papel não muda composição: o efeito é editorial, e a comparação dirá isso.
    return { groups: proximo, refusal: null, touched: [grupo.slot] };
  }

  if (change.kind === "change_principal") {
    const grupo = slotOf(proximo, change.candidateRef);
    if (!grupo) return recusa("CANDIDATE_NOT_FOUND", "O artigo desta revisão não existe no cenário corrente.");
    if (!grupo.keywordIds.includes(change.keywordId)) {
      return recusa("KEYWORD_NOT_IN_CANDIDATE", "Esta busca não pertence ao artigo; mova-a antes de torná-la Principal.");
    }
    grupo.principalKeywordId = change.keywordId;
    return { groups: proximo, refusal: null, touched: [grupo.slot] };
  }

  if (change.kind === "move_keyword") {
    const origem = slotOf(proximo, change.fromCandidateRef);
    const destino = slotOf(proximo, change.toCandidateRef);
    if (!origem || !destino) return recusa("CANDIDATE_NOT_FOUND", "Origem ou destino não existem no cenário corrente.");
    if (origem.slot === destino.slot) return recusa("SAME_CANDIDATE", "A busca já pertence a este artigo.");
    if (!origem.keywordIds.includes(change.keywordId)) {
      return recusa("KEYWORD_NOT_IN_CANDIDATE", "Esta busca não pertence ao artigo de origem.");
    }
    if (destino.keywordIds.length >= MAX_ARTICLE_KEYWORDS) {
      return recusa("CEILING_REACHED", `O artigo de destino já tem ${MAX_ARTICLE_KEYWORDS} buscas: o teto é estratégico, não meta a preencher.`);
    }
    if (origem.principalKeywordId === change.keywordId && origem.keywordIds.length > 1) {
      return recusa("PRINCIPAL_WOULD_LEAVE", "Mover a Principal deixaria o artigo de origem sem quem o lidera: troque a Principal antes.");
    }
    origem.keywordIds = origem.keywordIds.filter(id => id !== change.keywordId);
    destino.keywordIds.push(change.keywordId);
    const restantes = proximo.filter(group => group.keywordIds.length > 0);
    return { groups: restantes, refusal: null, touched: [origem.slot, destino.slot] };
  }

  if (change.kind === "split_keyword") {
    const grupo = slotOf(proximo, change.candidateRef);
    if (!grupo) return recusa("CANDIDATE_NOT_FOUND", "O artigo desta revisão não existe no cenário corrente.");
    if (grupo.keywordIds.length < 2) return recusa("ALREADY_ALONE", "Esta busca já é um artigo próprio.");
    if (grupo.principalKeywordId === change.keywordId) {
      return recusa("PRINCIPAL_WOULD_LEAVE", "Separar a Principal deixaria o artigo de origem sem quem o lidera: troque a Principal antes.");
    }
    grupo.keywordIds = grupo.keywordIds.filter(id => id !== change.keywordId);
    const novo: ScenarioGroup = {
      slot: `${grupo.slot}::split:${change.keywordId}`,
      principalKeywordId: change.keywordId,
      keywordIds: [change.keywordId],
    };
    proximo.push(novo);
    return { groups: proximo, refusal: null, touched: [grupo.slot, novo.slot] };
  }

  if (change.kind === "merge_candidates") {
    const esquerda = slotOf(proximo, change.leftCandidateRef);
    const direita = slotOf(proximo, change.rightCandidateRef);
    if (!esquerda || !direita) return recusa("CANDIDATE_NOT_FOUND", "Um dos artigos não existe no cenário corrente.");
    if (esquerda.slot === direita.slot) return recusa("SAME_CANDIDATE", "Um artigo não se junta a si mesmo.");
    const total = new Set([...esquerda.keywordIds, ...direita.keywordIds]).size;
    if (total > MAX_ARTICLE_KEYWORDS) {
      return recusa("CEILING_REACHED", `Juntar formaria ${total} buscas em um artigo e o teto é ${MAX_ARTICLE_KEYWORDS}.`);
    }
    esquerda.keywordIds = [...new Set([...esquerda.keywordIds, ...direita.keywordIds])];
    return {
      groups: proximo.filter(group => group.slot !== direita.slot),
      refusal: null,
      touched: [esquerda.slot, direita.slot],
    };
  }

  // remove_keyword
  const grupo = slotOf(proximo, change.candidateRef);
  if (!grupo) return recusa("CANDIDATE_NOT_FOUND", "O artigo desta revisão não existe no cenário corrente.");
  if (grupo.principalKeywordId === change.keywordId) {
    return recusa("PRINCIPAL_WOULD_LEAVE", "Remover a Principal deixaria o artigo sem quem o lidera: troque a Principal antes.");
  }
  if (!grupo.keywordIds.includes(change.keywordId)) {
    return recusa("KEYWORD_NOT_IN_CANDIDATE", "Esta busca não pertence ao artigo.");
  }
  grupo.keywordIds = grupo.keywordIds.filter(id => id !== change.keywordId);
  return { groups: proximo, refusal: null, touched: [grupo.slot] };
}

/* ------------------------------ comparação ------------------------------- */

export type ArticleSnapshot = {
  slot: string;
  /** Rótulo humano: a mesa nunca mostra id cru. */
  label: string;
  principalKeywordId: string;
  keywordCount: number;
  roles: { principal: string; secundarias: string[]; reforcos: string[] };
  coherence: { value: number; reasons: string[] };
  intent: { value: number; reasons: string[] };
  centrality: { value: number; reasons: string[] };
  risk: ArticleCandidate["cannibalizationRisk"];
  conflicts: string[];
};

export type ScenarioEffect = {
  slot: string;
  label: string;
  metric: string;
  before: string;
  after: string;
  direction: "sobe" | "desce" | "igual";
  /** §9 — todo número exibido chega com a frase que o justifica. */
  explanation: string;
};

export type ScenarioComparison = {
  change: ScenarioChange;
  description: string;
  refusal: ScenarioRefusal | null;
  before: ArticleSnapshot[];
  after: ArticleSnapshot[];
  effects: ScenarioEffect[];
  verdict: "melhora" | "piora" | "neutra" | "recusada";
  conclusion: string;
};

type SimulationInput = {
  universe: ArticleFormationUniverse;
  keywords: readonly ScenarioKeyword[];
  siloContext?: Parameters<typeof buildArticleFormationUniverse>[0]["siloContext"];
  keywordLabels: ReadonlyMap<string, string>;
  change: ScenarioChange;
};

/**
 * Roda a MESMA leitura do cenário sobre outra arrumação das mesmas keywords.
 *
 * A revisão humana anterior é neutralizada de propósito nos dois lados: se o
 * "antes" honrasse `humanFormationRef` e o "depois" não, a diferença mediria a
 * origem da composição em vez de medir a mudança proposta.
 */
function readGroups(
  input: SimulationInput,
  groups: readonly ScenarioGroup[],
): Map<string, ArticleCandidate> {
  const universo = buildArticleFormationUniverse({
    siloRef: input.universe.siloRef,
    siloLabel: input.universe.siloLabel,
    siloSlug: input.universe.siloSlug,
    ...(input.siloContext ? { siloContext: input.siloContext } : {}),
    groups: groups.map(group => ({ principalKeywordId: group.principalKeywordId, keywordIds: group.keywordIds })),
    keywords: input.keywords.map(keyword => ({ ...keyword, humanFormationRef: null, humanRole: null })),
    // Cópia própria: a leitura carimba `matchedKeywordId` no que recebe, e a
    // simulação não pode escrever no read-model que a mesa está exibindo.
    publishedArticles: input.universe.publishedArticles.map(item => ({ ...item })),
  });

  const porSlot = new Map<string, ArticleCandidate>();
  for (const candidate of universo.candidates) {
    const grupo = groups.find(item => item.keywordIds.includes(candidate.principalKeywordId));
    if (grupo) porSlot.set(grupo.slot, candidate);
  }
  return porSlot;
}

const snapshotOf = (
  slot: string,
  candidate: ArticleCandidate,
  labels: ReadonlyMap<string, string>,
): ArticleSnapshot => {
  const nome = (keywordId: string) => labels.get(keywordId) || keywordId;
  return {
    slot,
    label: nome(candidate.principalKeywordId),
    principalKeywordId: candidate.principalKeywordId,
    keywordCount: candidate.keywords.length + candidate.overflowKeywordIds.length,
    roles: {
      principal: nome(candidate.principalKeywordId),
      secundarias: candidate.keywords.filter(item => item.role === "secundaria").map(item => nome(item.keywordId)),
      reforcos: candidate.keywords.filter(item => item.role === "reforco").map(item => nome(item.keywordId)),
    },
    coherence: candidate.scores.coherence,
    intent: candidate.scores.intent,
    centrality: candidate.scores.centrality,
    risk: candidate.cannibalizationRisk,
    conflicts: candidate.conflicts,
  };
};

export function describeScenarioChange(
  change: ScenarioChange,
  labels: ReadonlyMap<string, string>,
): string {
  const nome = (keywordId: string) => `"${labels.get(keywordId) || keywordId}"`;
  switch (change.kind) {
    case "change_principal": return `Tornar ${nome(change.keywordId)} a Principal deste artigo`;
    case "set_role": return `Passar ${nome(change.keywordId)} para ${change.role === "secundaria" ? "secundária" : "reforço"}`;
    case "move_keyword": return `Mover ${nome(change.keywordId)} para outro artigo do mesmo Silo`;
    case "split_keyword": return `Separar ${nome(change.keywordId)} como artigo próprio`;
    case "merge_candidates": return "Juntar dois artigos deste Silo";
    case "remove_keyword": return `Remover ${nome(change.keywordId)} deste artigo`;
    case "move_to_silo": return `Mover ${nome(change.keywordId)} para outro Silo`;
  }
}

const direcao = (antes: number, depois: number) =>
  depois > antes ? "sobe" as const : depois < antes ? "desce" as const : "igual" as const;

export function simulateScenarioChange(input: SimulationInput): ScenarioComparison {
  const descricao = describeScenarioChange(input.change, input.keywordLabels);
  const atuais = scenarioGroupsOf(input.universe);
  const aplicado = applyScenarioChange(atuais, input.change);

  if (aplicado.refusal) {
    return {
      change: input.change,
      description: descricao,
      refusal: aplicado.refusal,
      before: [],
      after: [],
      effects: [],
      verdict: "recusada",
      conclusion: aplicado.refusal.detail,
    };
  }

  const antes = readGroups(input, atuais);
  const depois = readGroups(input, aplicado.groups);
  const slots = aplicado.touched;

  const snapshotsAntes: ArticleSnapshot[] = [];
  const snapshotsDepois: ArticleSnapshot[] = [];
  const effects: ScenarioEffect[] = [];

  for (const slot of slots) {
    const candidatoAntes = antes.get(slot);
    const candidatoDepois = depois.get(slot);
    const rotulo = candidatoAntes
      ? input.keywordLabels.get(candidatoAntes.principalKeywordId) || slot
      : candidatoDepois
        ? input.keywordLabels.get(candidatoDepois.principalKeywordId) || slot
        : slot;

    if (candidatoAntes) snapshotsAntes.push(snapshotOf(slot, candidatoAntes, input.keywordLabels));
    if (candidatoDepois) snapshotsDepois.push(snapshotOf(slot, candidatoDepois, input.keywordLabels));

    if (candidatoAntes && !candidatoDepois) {
      effects.push({
        slot, label: rotulo, metric: "Existência", before: "artigo do cenário", after: "deixa de existir",
        direction: "desce",
        explanation: "Todas as buscas deste artigo passaram para outro; ele sai do cenário em vez de ficar vazio.",
      });
      continue;
    }
    if (!candidatoAntes && candidatoDepois) {
      effects.push({
        slot, label: rotulo, metric: "Existência", before: "não existia", after: "artigo novo do cenário",
        direction: "sobe",
        explanation: `A busca passa a liderar conteúdo próprio: ${candidatoDepois.reason}`,
      });
    }
    if (!candidatoAntes || !candidatoDepois) continue;

    const pares: { metric: string; antes: number; depois: number; reasons: string[] }[] = [
      { metric: "Coerência", antes: candidatoAntes.scores.coherence.value, depois: candidatoDepois.scores.coherence.value, reasons: candidatoDepois.scores.coherence.reasons },
      { metric: "Intenção", antes: candidatoAntes.scores.intent.value, depois: candidatoDepois.scores.intent.value, reasons: candidatoDepois.scores.intent.reasons },
      { metric: "Centralidade", antes: candidatoAntes.scores.centrality.value, depois: candidatoDepois.scores.centrality.value, reasons: candidatoDepois.scores.centrality.reasons },
    ];
    for (const par of pares) {
      effects.push({
        slot, label: rotulo, metric: par.metric,
        before: String(par.antes), after: String(par.depois),
        direction: direcao(par.antes, par.depois),
        explanation: par.reasons[0] || "leitura mantida pelo mesmo motivo do cenário atual",
      });
    }

    const kwAntes = candidatoAntes.keywords.length + candidatoAntes.overflowKeywordIds.length;
    const kwDepois = candidatoDepois.keywords.length + candidatoDepois.overflowKeywordIds.length;
    effects.push({
      slot, label: rotulo, metric: "Keywords",
      before: String(kwAntes), after: String(kwDepois),
      direction: direcao(kwAntes, kwDepois),
      explanation: kwAntes === kwDepois
        ? "a composição continua com as mesmas buscas"
        : `o artigo passa de ${kwAntes} para ${kwDepois} busca(s) sob a mesma Principal`,
    });

    if (candidatoAntes.principalKeywordId !== candidatoDepois.principalKeywordId) {
      effects.push({
        slot, label: rotulo, metric: "Principal",
        before: input.keywordLabels.get(candidatoAntes.principalKeywordId) || candidatoAntes.principalKeywordId,
        after: input.keywordLabels.get(candidatoDepois.principalKeywordId) || candidatoDepois.principalKeywordId,
        direction: "igual",
        explanation: "quem lidera o artigo muda por decisão humana; a sugestão do formador não é aprovação",
      });
    }
  }

  /**
   * O veredito compara a média de coerência — os mesmos números da tela.
   *
   * Só entram os artigos que existem dos DOIS lados. Uma busca sozinha marca
   * 100 por definição, então incluir o artigo recém-criado faria toda separação
   * parecer melhoria e todo merge parecer piora. O artigo que nasce ou some é
   * dito à parte, em texto.
   */
  const comuns = new Set(snapshotsAntes.map(item => item.slot)
    .filter(slot => snapshotsDepois.some(item => item.slot === slot)));
  const medias = (lista: ArticleSnapshot[]) => {
    const considerados = lista.filter(item => comuns.has(item.slot));
    return considerados.length
      ? considerados.reduce((total, item) => total + item.coherence.value, 0) / considerados.length
      : 0;
  };
  const mediaAntes = medias(snapshotsAntes);
  const mediaDepois = medias(snapshotsDepois);
  const nasceu = snapshotsDepois.find(item => !comuns.has(item.slot));
  const sumiu = snapshotsAntes.find(item => !comuns.has(item.slot));
  const intencaoCaiu = snapshotsDepois.some(depoisItem => {
    const par = snapshotsAntes.find(item => item.slot === depoisItem.slot);
    return par ? depoisItem.intent.value < par.intent.value : false;
  });

  const delta = Math.round(mediaDepois - mediaAntes);
  const semEfeitoDeComposicao = input.change.kind === "set_role";

  const verdict: ScenarioComparison["verdict"] = semEfeitoDeComposicao
    ? "neutra"
    : intencaoCaiu ? "piora" : delta >= 2 ? "melhora" : delta <= -2 ? "piora" : "neutra";

  // O artigo que nasce ou some não entra na média — mas precisa ser dito.
  const ressalva = nasceu
    ? ` "${nasceu.label}" passa a existir como conteúdo próprio; a coerência ${nasceu.coherence.value} dele apenas reflete uma busca sozinha.`
    : sumiu
      ? ` "${sumiu.label}" deixa de existir como artigo separado.`
      : "";

  const conclusion = (semEfeitoDeComposicao
    ? "A mudança é de papel editorial: as mesmas buscas continuam no mesmo artigo, então coerência e intenção não se movem."
    : verdict === "melhora"
      ? `A mudança melhora a separação: a coerência média dos artigos afetados vai de ${Math.round(mediaAntes)} para ${Math.round(mediaDepois)} sem romper a intenção.`
      : verdict === "piora"
        ? intencaoCaiu
          ? "A mudança reúne buscas com intenções diferentes; manter como está parece mais consistente."
          : `A mudança reduz a coerência dos artigos afetados, de ${Math.round(mediaAntes)} para ${Math.round(mediaDepois)}; manter como está parece mais consistente.`
        : `A mudança não altera de forma relevante a leitura: a coerência média fica em ${Math.round(mediaDepois)}.`) + ressalva;

  return {
    change: input.change,
    description: descricao,
    refusal: null,
    before: snapshotsAntes,
    after: snapshotsDepois,
    effects,
    verdict,
    conclusion,
  };
}

/* ------------------------- §10 comparar Principal ------------------------ */

export type PrincipalCriterion = {
  criterion: string;
  current: string;
  proposed: string;
  /** Quem sai na frente neste critério — ou nenhum, quando empatam. */
  favors: "atual" | "proposta" | "empate";
  explanation: string;
};

export type PrincipalComparison = {
  currentKeywordId: string;
  proposedKeywordId: string;
  criteria: PrincipalCriterion[];
  /** Recusa de contrato: identidade publicada travada não troca de Principal. */
  refusal: ScenarioRefusal | null;
  /** Leitura, nunca aprovação: quem escolhe é o humano. */
  reading: string;
};

const texto = (value: string | number | null | undefined, vazio = "não recebido") =>
  value === null || value === undefined || value === "" ? vazio : String(value);

const maior = (atual: number | null | undefined, proposta: number | null | undefined) => {
  if (atual === null || atual === undefined || proposta === null || proposta === undefined) return "empate" as const;
  return proposta > atual ? "proposta" as const : proposta < atual ? "atual" as const : "empate" as const;
};

/**
 * Duas buscas lado a lado para a decisão de quem lidera o artigo.
 *
 * Cada linha é um dado que já existe. Não há nota final: somar critérios de
 * naturezas diferentes num número só esconderia justamente o trade-off que o
 * humano precisa ver.
 */
export function comparePrincipalCandidates(input: {
  candidate: ArticleCandidate;
  keywords: readonly ScenarioKeyword[];
  currentKeywordId: string;
  proposedKeywordId: string;
  /** Slug proposto hoje para o artigo, quando existe. */
  suggestedSlug?: string | null;
}): PrincipalComparison {
  const buscar = (keywordId: string) => input.keywords.find(item => item.keywordId === keywordId) || null;
  const atual = buscar(input.currentKeywordId);
  const proposta = buscar(input.proposedKeywordId);

  if (!atual || !proposta) {
    return {
      currentKeywordId: input.currentKeywordId,
      proposedKeywordId: input.proposedKeywordId,
      criteria: [],
      refusal: { code: "KEYWORD_NOT_FOUND", detail: "Uma das buscas comparadas não está no lote." },
      reading: "Sem as duas buscas no lote não há comparação possível.",
    };
  }

  if (atual.protectedPublication || atual.isPublished) {
    return {
      currentKeywordId: input.currentKeywordId,
      proposedKeywordId: input.proposedKeywordId,
      criteria: [],
      refusal: {
        code: "PUBLISHED_PRINCIPAL_PROTECTED",
        detail: "A Principal deste artigo está publicada e atrelada ao endereço no ar; trocá-la mudaria a identidade da página.",
      },
      reading: "Identidade publicada protegida: a troca de Principal não é oferecida aqui.",
    };
  }

  const criteria: PrincipalCriterion[] = [
    {
      criterion: "Volume",
      current: texto(atual.volume?.toLocaleString("pt-BR")),
      proposed: texto(proposta.volume?.toLocaleString("pt-BR")),
      favors: maior(atual.volume, proposta.volume),
      explanation: "Busca com mais demanda tende a nomear melhor a página; volume sozinho não decide o assunto.",
    },
    {
      criterion: "Resultados",
      current: texto(atual.results?.toLocaleString("pt-BR")),
      proposed: texto(proposta.results?.toLocaleString("pt-BR")),
      // Menos concorrência é vantagem: aqui o menor vence.
      favors: maior(proposta.results, atual.results),
      explanation: "Menos resultados concorrentes significa disputa menor pela mesma página.",
    },
    {
      criterion: "KGR",
      current: texto(atual.kgr?.toLocaleString("pt-BR", { maximumFractionDigits: 3 })),
      proposed: texto(proposta.kgr?.toLocaleString("pt-BR", { maximumFractionDigits: 3 })),
      favors: maior(proposta.kgr, atual.kgr),
      explanation: "KGR menor indica proporção mais favorável entre resultados e demanda.",
    },
    {
      criterion: "Aplicabilidade",
      current: texto(atual.applicability),
      proposed: texto(proposta.applicability),
      favors: "empate",
      explanation: "Aplicabilidade vem do Minerador e é leitura upstream; ela não é recalculada aqui.",
    },
    {
      criterion: "Intenção",
      current: texto(atual.intent, "pendente"),
      proposed: texto(proposta.intent, "pendente"),
      favors: "empate",
      explanation: (atual.intent || "") === (proposta.intent || "")
        ? "As duas buscas têm a mesma intenção; trocar a Principal não muda o tipo de conteúdo."
        : "As intenções divergem: a Principal define qual delas a página passa a atender.",
    },
    {
      criterion: "Funil",
      current: texto(atual.funnel),
      proposed: texto(proposta.funnel),
      favors: "empate",
      explanation: "O estágio de funil da Principal orienta o tom da página inteira.",
    },
    {
      criterion: "Centralidade",
      current: texto(input.candidate.scores.centrality.value),
      proposed: "recalculada ao aplicar",
      favors: "empate",
      explanation: input.candidate.scores.centrality.reasons[0]
        || "Centralidade mede o quanto a Principal cobre as demais buscas do artigo.",
    },
    {
      criterion: "Cobertura do grupo",
      current: `${input.candidate.keywords.length} busca(s) sob a Principal atual`,
      proposed: `as mesmas ${input.candidate.keywords.length} busca(s)`,
      favors: "empate",
      explanation: "Trocar quem lidera não muda quais buscas pertencem ao artigo.",
    },
    {
      criterion: "Slug",
      current: texto(input.suggestedSlug, "sem endereço proposto"),
      proposed: "derivado da nova Principal",
      favors: "empate",
      explanation: "O endereço é derivado da Principal; trocá-la reescreve o slug proposto do conteúdo novo.",
    },
    {
      criterion: "SERP",
      current: texto(atual.serpVerdict, "não executada"),
      proposed: texto(proposta.serpVerdict, "não executada"),
      favors: "empate",
      explanation: "A SERP observa compatibilidade; ela não movimenta keywords nem escolhe a Principal.",
    },
    {
      criterion: "Proteções",
      current: atual.isPublished || atual.protectedPublication ? "publicada e protegida" : "conteúdo novo",
      proposed: proposta.isPublished || proposta.protectedPublication ? "publicada e protegida" : "conteúdo novo",
      favors: "empate",
      explanation: "Busca publicada carrega URL e canonical próprios; ela não vira Principal de conteúdo novo.",
    },
  ];

  const favoraveis = criteria.filter(item => item.favors === "proposta").length;
  const contrarias = criteria.filter(item => item.favors === "atual").length;
  const reading = favoraveis > contrarias
    ? `A proposta sai na frente em ${favoraveis} de ${favoraveis + contrarias} critério(s) comparáveis. A escolha continua sendo sua.`
    : contrarias > favoraveis
      ? `A Principal atual sai na frente em ${contrarias} de ${favoraveis + contrarias} critério(s) comparáveis. A escolha continua sendo sua.`
      : "Os critérios comparáveis empatam; a decisão é editorial, não numérica.";

  return {
    currentKeywordId: input.currentKeywordId,
    proposedKeywordId: input.proposedKeywordId,
    criteria,
    refusal: null,
    reading,
  };
}
