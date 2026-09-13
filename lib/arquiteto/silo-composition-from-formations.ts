/**
 * A ARQUITETURA DO SILO, DERIVADA DAS FORMAÇÕES CONGELADAS.
 *
 * Quando a última formação do Silo fecha, ninguém mais precisa decidir nada: a
 * composição já está toda gravada em `concludedFormations` — Principal,
 * membros e papéis de cada Article, congelados no momento em que a pessoa
 * clicou. O que falta é arranjar isso como Silo: quem é o Pilar, quem são os
 * Suportes e em que ordem se lê.
 *
 * Este módulo NÃO recalcula formação. Ele lê o que foi congelado e organiza.
 * Nenhum agrupamento, nenhuma Principal, nenhum papel é revisto aqui — se
 * fosse, o que a pessoa aprovou não seria o que iria para o acervo.
 *
 * SOBRE O PILAR SER DERIVADO.
 *
 * A doutrina anterior deste projeto era categórica: "Pilar nasce nulo e só a
 * decisão humana o preenche". Ela existia porque o Pilar era escolhido ANTES
 * de as formações existirem, sobre candidatos que ainda podiam mudar — e
 * deixar volume ou ordem decidirem ali seria estrutura editorial saindo de uma
 * heurística.
 *
 * Aqui o chão é outro: as formações estão fechadas, e a pessoa fechou cada uma
 * delas. O Pilar deixa de ser um palpite sobre o futuro e passa a ser uma
 * leitura do que já foi decidido — o Article que cobre mais buscas do Silo.
 * A regra é declarada, determinística e reversível pela fase Silos.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

export type ConcludedFormationInput = {
  candidateRef: string;
  principalKeywordId: string;
  members: readonly { keywordId: string; role: "principal" | "secundaria" | "reforco" }[];
  formationBaseHash: string;
  /** ArticleDNA já materializado, quando existe. */
  materializedArticleId: string | null;
};

export type SiloCompositionFromFormations = {
  /** A formação que lidera o Silo. `null` só quando não há formação. */
  pillarCandidateRef: string | null;
  supportCandidateRefs: string[];
  /** Ordem de leitura: Pilar primeiro, suportes na ordem derivada. */
  narrativeOrder: string[];
  /** Por que este é o Pilar. A tela e o replay leem daqui. */
  pillarReason: string;
  /** Quantas buscas o Silo cobre, somando as formações. */
  coveredKeywordCount: number;
};

/**
 * §3 — Pilar, Suportes e ordem, sem botão e sem recálculo.
 *
 * O critério é COBERTURA: o Article que reúne mais buscas do Silo é o que mais
 * responde por ele. Empate cai no volume da Principal, e o último desempate é
 * o `candidateRef` — não porque ele signifique algo, mas porque a mesma
 * entrada precisa produzir a mesma arquitetura em qualquer execução.
 */
export function resolveSiloCompositionFromFormations(input: {
  formations: readonly ConcludedFormationInput[];
  /** Volume da Principal de cada formação, quando conhecido. */
  principalVolumeByKeywordId?: ReadonlyMap<string, number | null>;
}): SiloCompositionFromFormations {
  if (!input.formations.length) {
    return {
      pillarCandidateRef: null,
      supportCandidateRefs: [],
      narrativeOrder: [],
      pillarReason: "Nenhuma formação concluída: o Silo não tem arquitetura interna a derivar.",
      coveredKeywordCount: 0,
    };
  }

  const volumeDe = (formation: ConcludedFormationInput) =>
    input.principalVolumeByKeywordId?.get(formation.principalKeywordId) ?? null;

  const ordenadas = [...input.formations].sort((esquerda, direita) => {
    const porCobertura = direita.members.length - esquerda.members.length;
    if (porCobertura !== 0) return porCobertura;
    const porVolume = (volumeDe(direita) ?? 0) - (volumeDe(esquerda) ?? 0);
    if (porVolume !== 0) return porVolume;
    return esquerda.candidateRef.localeCompare(direita.candidateRef);
  });

  const pilar = ordenadas[0];
  const suportes = ordenadas.slice(1).map(item => item.candidateRef);
  const empatePorCobertura = ordenadas.filter(item => item.members.length === pilar.members.length).length > 1;

  return {
    pillarCandidateRef: pilar.candidateRef,
    supportCandidateRefs: suportes,
    narrativeOrder: [pilar.candidateRef, ...suportes],
    pillarReason: empatePorCobertura
      ? `Cobre ${pilar.members.length} busca(s) do Silo, e o empate de cobertura foi desfeito pelo volume da Principal.`
      : `Cobre ${pilar.members.length} busca(s) do Silo — mais que qualquer outra formação concluída.`,
    coveredKeywordCount: input.formations.reduce((total, item) => total + item.members.length, 0),
  };
}

/**
 * §5 — o que ainda falta materializar.
 *
 * Rodar de novo não pode criar sucessora no-op: formação que já virou
 * ArticleDNA sai da lista, e uma segunda passada sobre o mesmo Silo não tem o
 * que fazer.
 */
export function formationsAwaitingMaterialization(
  formations: readonly ConcludedFormationInput[],
): ConcludedFormationInput[] {
  return formations.filter(item => !item.materializedArticleId);
}

/**
 * §4/§10 — O PLANO DO FECHAMENTO CANÔNICO, SEM ESCREVER NADA.
 *
 * A ordem NÃO foi assumida: ela saiu da auditoria dos contratos, registrada em
 * `silo-closure-readiness.ts`. `ArticleDNA` não tem campo apontando para
 * `SiloDNA` — `siloId` é anulável e `territoryRef` carrega o pai —, enquanto
 * `SiloDNA.articleReferences` e `SiloPage.siloDnaRef` exigem versão e artefato
 * existente. Logo:
 *
 *   ArticleDNA  →  SiloDNA  →  SiloPage
 *
 * Nenhum canônico vazio, nenhuma sucessora só para acertar referência.
 */
export type CanonicalSiloClosurePlan =
  | {
    state: "BLOCKED";
    blockers: { code: string; detail: string }[];
  }
  | {
    state: "READY";
    /** 1º: os ArticleDNA, que não dependem de ninguém. */
    materializationOrder: string[];
    /** 2º: o SiloDNA, sobre artigos que já existem. */
    pillarFormationRef: string;
    supportFormationRefs: string[];
    narrativeOrder: string[];
    pillarReason: string;
    /** 3º: a SiloPage, pareada ao SiloDNA na mesma transação. */
    expectedArticles: number;
    expectedSiloDna: 1;
    expectedSiloPage: 1;
  };

export function buildCanonicalSiloClosurePlan(input: {
  formations: readonly ConcludedFormationInput[];
  /** Bloqueios do Silo, já resolvidos por `resolveSiloClosureReadiness`. */
  blockers: readonly { code: string; detail: string }[];
  principalVolumeByKeywordId?: ReadonlyMap<string, number | null>;
}): CanonicalSiloClosurePlan {
  if (input.blockers.length) {
    return { state: "BLOCKED", blockers: input.blockers.map(item => ({ ...item })) };
  }
  if (!input.formations.length) {
    return {
      state: "BLOCKED",
      blockers: [{ code: "NO_CONCLUDED_FORMATION", detail: "Nenhuma formação concluída para fechar o Silo." }],
    };
  }

  const composicao = resolveSiloCompositionFromFormations({
    formations: input.formations,
    principalVolumeByKeywordId: input.principalVolumeByKeywordId,
  });
  if (!composicao.pillarCandidateRef) {
    return {
      state: "BLOCKED",
      blockers: [{ code: "PILLAR_NOT_DERIVED", detail: composicao.pillarReason }],
    };
  }

  return {
    state: "READY",
    // Só quem ainda não virou artefato entra na fila; reexecutar não recria.
    materializationOrder: formationsAwaitingMaterialization(input.formations).map(item => item.candidateRef),
    pillarFormationRef: composicao.pillarCandidateRef,
    supportFormationRefs: composicao.supportCandidateRefs,
    narrativeOrder: composicao.narrativeOrder,
    pillarReason: composicao.pillarReason,
    expectedArticles: input.formations.length,
    expectedSiloDna: 1,
    expectedSiloPage: 1,
  };
}

/**
 * §5/§6 — o fechamento já aconteceu por completo?
 *
 * Verdadeiro só quando TODA formação congelada tem ArticleDNA. Enquanto uma
 * faltar, o ciclo não fechou — e anunciar sucesso ali seria dizer que o Silo
 * está consolidado sobre artigos que não existem.
 */
export function siloClosureIsComplete(input: {
  formations: readonly ConcludedFormationInput[];
  canonicalSiloExists: boolean;
}): boolean {
  return input.canonicalSiloExists
    && input.formations.length > 0
    && formationsAwaitingMaterialization(input.formations).length === 0;
}

/**
 * §5/§7 — O ESTADO PARCIAL É LEGÍTIMO, E É RETOMÁVEL.
 *
 * A homologação produziu isto de verdade:
 *
 *   FORMATIONS = 5/5     ARTICLEDNA = 5/5     SILODNA = 0
 *
 * Não é corrupção nem meio-caminho a limpar. É o resultado honesto de uma
 * escrita não transacional que gravou os artigos e falhou no Silo — e o
 * sistema fez certo em mostrar ERRO em vez de fingir fechamento completo.
 *
 * O que faltava era reconhecer o estado pelo nome e conseguir sair dele sem
 * pedir à pessoa que refizesse `Concluir formação` — um ato que ela já
 * executou, e que reexecutado não teria o que concluir.
 *
 * Esta função NÃO escreve nada: ela responde se dá para retomar, e com qual
 * composição. Tudo o que ela lê veio do remoto.
 */
export type CanonicalClosureResumption =
  | { state: "NOT_APPLICABLE"; reason: string; blockers: { code: string; detail: string }[] }
  | { state: "COMPLETE"; reason: string }
  | {
    state: "RESUMABLE";
    /** ArticleDNA que já existem: a retomada NÃO os recria. */
    existingArticleIds: string[];
    /** Formações que ainda precisam virar ArticleDNA — normalmente vazia. */
    missingFormationRefs: string[];
    pillarArticleId: string;
    supportArticleIds: string[];
    narrativeOrder: string[];
    pillarReason: string;
    reason: string;
  };

export function resolveCanonicalClosureResumption(input: {
  /**
   * O plano JÁ construído pelo chamador.
   *
   * Recebê-lo em vez de reconstruí-lo evita que o gatilho e a retomada
   * derivem o Pilar duas vezes e cheguem a arquiteturas diferentes.
   */
  plan: CanonicalSiloClosurePlan;
  formations: readonly ConcludedFormationInput[];
  /** ArticleDNA aprovados do território, lidos do remoto. */
  remoteApprovedArticleIds: readonly string[];
  /** O par canônico já existe INTEIRO? SiloDNA sem SiloPage não é par. */
  canonicalSiloExists: boolean;
  canonicalSiloPageExists: boolean;
}): CanonicalClosureResumption {
  if (input.canonicalSiloExists && input.canonicalSiloPageExists) {
    return { state: "COMPLETE", reason: "O par canônico do Silo já existe: não há fechamento a retomar." };
  }
  if (!input.formations.length) {
    return {
      state: "NOT_APPLICABLE",
      reason: "Nenhuma formação concluída neste território.",
      blockers: [],
    };
  }

  const plano = input.plan;
  if (plano.state === "BLOCKED") {
    return {
      state: "NOT_APPLICABLE",
      reason: `O fechamento não pode ser retomado: ${plano.blockers.map(item => item.detail).join(" · ")}`,
      blockers: plano.blockers,
    };
  }

  /*
   * O artigo de uma formação é o materializado quando ele existe. Quando não,
   * o candidateRef é a identidade determinística que a materialização usa —
   * é assim que a fila do §4 e o acervo falam do mesmo artefato.
   */
  const artigoDe = (candidateRef: string) => {
    const congelada = input.formations.find(item => item.candidateRef === candidateRef);
    return congelada?.materializedArticleId || candidateRef;
  };
  const remotos = new Set(input.remoteApprovedArticleIds);
  const existentes = input.formations
    .map(item => artigoDe(item.candidateRef))
    .filter(articleId => remotos.has(articleId));
  const faltando = input.formations
    .filter(item => !remotos.has(artigoDe(item.candidateRef)))
    .map(item => item.candidateRef);

  const pilar = artigoDe(plano.pillarFormationRef);
  if (!remotos.has(pilar)) {
    /*
     * Sem o Pilar gravado não há Silo a consolidar — e trocar o Pilar por
     * outro que exista seria escolher arquitetura para contornar uma falha.
     */
    return {
      state: "NOT_APPLICABLE",
      reason: `O ArticleDNA do Pilar (${pilar}) ainda não existe no remoto: a retomada materializa antes de consolidar.`,
      blockers: [{ code: "PILLAR_ARTICLE_MISSING", detail: `ArticleDNA ${pilar} ausente no acervo canônico.` }],
    };
  }

  return {
    state: "RESUMABLE",
    existingArticleIds: existentes,
    missingFormationRefs: faltando,
    pillarArticleId: pilar,
    supportArticleIds: plano.supportFormationRefs.map(artigoDe).filter(articleId => remotos.has(articleId)),
    narrativeOrder: plano.narrativeOrder.map(artigoDe),
    pillarReason: plano.pillarReason,
    reason: `${existentes.length} ArticleDNA já existem no remoto e o Silo canônico ainda não: o fechamento pode ser retomado sem recriar artigo nenhum.`,
  };
}

/**
 * §8/§13 — O REMOTO CONFIRMA OS TRÊS, OU NÃO HOUVE FECHAMENTO.
 *
 * Sucesso parcial falso é o desfecho mais caro deste fluxo: dizer "pipeline
 * completo" com o SiloDNA gravado e a SiloPage faltando manda a fase seguinte
 * trabalhar sobre um par que não existe, e a correção custa sucessora em cada
 * artefato. Então o veredito é sobre o que o remoto DEVOLVEU, campo a campo —
 * quantidade, versão, hash, Pilar e pareamento —, e cada divergência é dita
 * com nome.
 *
 * O que esta função NÃO faz: adivinhar. Ausência de artefato é ausência, e
 * aparece como tal.
 */
export type ObservedClosureArticle = {
  articleId: string;
  versionId: string;
  contentHash: string;
  territoryRef: string | null;
  siloId: string | null;
};

export type ObservedClosureSiloDna = {
  siloId: string;
  territoryRef: string | null;
  pillarArticleId: string | null;
  supportArticleIds: readonly string[];
  articleReferences: readonly { articleId: string; articleDnaVersionId: string; articleDnaContentHash: string }[];
  versionId: string;
  contentHash: string;
};

export type ObservedClosureSiloPage = {
  siloPageId: string;
  siloId: string | null;
  siloDnaRef: { entityId: string; versionId: string; contentHash: string };
};

export type CanonicalSiloClosureVerification = {
  complete: boolean;
  expectedArticles: number;
  observedArticles: number;
  observedSiloDna: 0 | 1;
  observedSiloPage: 0 | 1;
  divergences: string[];
  /** A frase que a mesa mostra: o estado REAL, completo ou parcial. */
  summary: string;
};

export function verifyCanonicalSiloClosure(input: {
  territoryRef: string;
  /** O que o fechamento prometeu: ArticleDNA por candidateRef, Pilar e suportes. */
  expectedArticleIds: readonly string[];
  expectedPillarArticleId: string;
  observedArticles: readonly ObservedClosureArticle[];
  observedSiloDna: ObservedClosureSiloDna | null;
  observedSiloPage: ObservedClosureSiloPage | null;
}): CanonicalSiloClosureVerification {
  const divergences: string[] = [];
  const esperados = [...new Set(input.expectedArticleIds)];
  const porId = new Map(input.observedArticles.map(item => [item.articleId, item]));
  const presentes = esperados.filter(articleId => porId.has(articleId));

  for (const articleId of esperados) {
    const observado = porId.get(articleId);
    if (!observado) {
      divergences.push(`ArticleDNA ${articleId} não foi encontrado no remoto.`);
      continue;
    }
    if (observado.territoryRef !== input.territoryRef) {
      divergences.push(`ArticleDNA ${articleId} declara território ${observado.territoryRef ?? "nenhum"}, esperado ${input.territoryRef}.`);
    }
  }

  const dna = input.observedSiloDna;
  if (!dna) {
    divergences.push("Nenhum SiloDNA canônico foi devolvido pelo remoto para este território.");
  } else {
    if (dna.territoryRef !== input.territoryRef) {
      divergences.push(`O SiloDNA declara território ${dna.territoryRef ?? "nenhum"}, esperado ${input.territoryRef}.`);
    }
    if (!dna.pillarArticleId) {
      divergences.push("O SiloDNA foi gravado sem Pilar.");
    } else if (dna.pillarArticleId !== input.expectedPillarArticleId) {
      divergences.push(`O SiloDNA aponta o Pilar ${dna.pillarArticleId}, e o fechamento derivou ${input.expectedPillarArticleId}.`);
    }
    const referenciados = new Set(dna.articleReferences.map(reference => reference.articleId));
    const faltando = esperados.filter(articleId => !referenciados.has(articleId));
    if (faltando.length) {
      divergences.push(`O SiloDNA não referencia ${faltando.length} ArticleDNA esperado(s): ${faltando.join(", ")}.`);
    }
    const sobrando = [...referenciados].filter(articleId => !esperados.includes(articleId));
    if (sobrando.length) {
      divergences.push(`O SiloDNA referencia ${sobrando.length} artigo(s) fora do fechamento: ${sobrando.join(", ")}.`);
    }
    for (const reference of dna.articleReferences) {
      const observado = porId.get(reference.articleId);
      if (!observado) continue;
      if (reference.articleDnaVersionId !== observado.versionId || reference.articleDnaContentHash !== observado.contentHash) {
        divergences.push(`A referência do SiloDNA a ${reference.articleId} aponta versão ou hash diferente do ArticleDNA gravado.`);
      }
    }
  }

  const page = input.observedSiloPage;
  if (!page) {
    divergences.push("Nenhuma SiloPage foi devolvida pelo remoto: o par canônico ficou pela metade.");
  } else if (dna) {
    if (page.siloDnaRef.versionId !== dna.versionId || page.siloDnaRef.contentHash !== dna.contentHash) {
      divergences.push("A SiloPage referencia uma versão de SiloDNA diferente da que acabou de ser gravada.");
    }
    if (page.siloId && page.siloId !== dna.siloId) {
      divergences.push(`A SiloPage declara o Silo ${page.siloId} e o SiloDNA gravado é ${dna.siloId}.`);
    }
  }

  const complete = divergences.length === 0
    && presentes.length === esperados.length
    && esperados.length > 0
    && Boolean(dna)
    && Boolean(page);

  const contagem = `ARTICLEDNA ${presentes.length}/${esperados.length} · SILODNA ${dna ? 1 : 0}/1 · SILOPAGE ${page ? 1 : 0}/1`;
  return {
    complete,
    expectedArticles: esperados.length,
    observedArticles: presentes.length,
    observedSiloDna: dna ? 1 : 0,
    observedSiloPage: page ? 1 : 0,
    divergences,
    summary: complete
      ? `Fechamento canônico confirmado pelo remoto: ${contagem}.`
      : `Fechamento canônico INCOMPLETO: ${contagem}. ${divergences.join(" ")}`.trim(),
  };
}
