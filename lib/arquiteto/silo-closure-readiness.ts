/**
 * QUANDO O SILO PODE FECHAR SOZINHO.
 *
 * O ciclo que este módulo desfaz:
 *
 *   Concluir formação        exigia SiloDNA canônico
 *   SiloDNA canônico         exigia formações concluídas
 *
 * A ordem correta é a do produto: confirmar arquitetura fecha o Silo de
 * TRABALHO; as formações fecham contra ele; e só quando o lote inteiro
 * estabiliza o Silo canônico nasce — sem botão novo, como consequência
 * determinística do último `Concluir formação`.
 *
 * Este módulo NÃO consolida nada. Ele responde uma pergunta e diz por quê.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

/**
 * §2/§10 — A MATRIZ DE REFERÊNCIAS, AUDITADA NOS CONTRATOS REAIS.
 *
 *   ENTIDADE          CAMPO              →            NULL?  VERSÃO?  EXIGE ARTEFATO?
 *   ArticleDNA        siloId             Silo         SIM    não      não
 *   ArticleDNA        territoryRef       Território   opc.   não      não
 *   ArticleDNA        (→ SiloDNA)        —            NÃO EXISTE ESSE CAMPO
 *   SiloWorkingCopy   articleRefs[]      ArticleDNA   vazio  SIM      SIM
 *   SiloDNA           articleReferences  ArticleDNA   vazio  SIM      SIM
 *   SiloDNA           pillarArticleId    ArticleDNA   SIM    não      não
 *   SiloPage          siloDnaRef         SiloDNA      NÃO    SIM      SIM (schema + gatilho 0027)
 *
 * A linha que decide tudo: **ArticleDNA não referencia SiloDNA**. `siloId` é
 * string anulável e `territoryRef` é quem carrega o pai no fluxo Silo-first —
 * `resolveCanonicalSiloIdForTerritory` resolve o Silo a partir dele na leitura.
 *
 * Portanto NÃO existe dependência circular, e a ordem real é:
 *
 *   ArticleDNA  →  SiloDNA  →  SiloPage
 *
 * O ArticleDNA não precisa de ninguém. O SiloDNA precisa dos ArticleDNA com
 * versão e hash. A SiloPage precisa da versão do SiloDNA.
 *
 * Consequência direta, e é o §3: nenhum SiloDNA vazio precisa nascer para
 * satisfazer ordem de referência, e nenhuma sucessora precisa existir só para
 * trocar ref. Uma versão de cada, com o conteúdo definitivo.
 */
export const SILO_CLOSURE_BLOCKERS = [
  /** Ainda há formação ativa que ninguém concluiu. */
  "FORMATIONS_PENDING",
  /** A SERP contestou a fronteira: a decisão volta para a fase Silos. */
  "SILO_RECONSIDERATION_REQUIRED",
  /** Dois candidatos ainda disputam o mesmo assunto ou o mesmo endereço. */
  "CANNIBALIZATION_UNRESOLVED",
  /** Alguma formação concluída não passou nos gates da própria conclusão. */
  "FORMATION_BLOCKED",
  /** O Silo já é canônico: fechar de novo criaria um segundo par. */
  "ALREADY_CONSOLIDATED",
  /**
   * O insumo está em movimento: keyword do Território em revisão no
   * Minerador, ou reaprovada depois da formação. Fechar agora congelaria um
   * Silo que já nasce velho — e é mais barato impedir aqui do que propagar
   * por três camadas depois. Nenhum dos outros cinco olha para o insumo.
   */
  "KEYWORD_PACKAGE_STALE",
] as const;
export type SiloClosureBlocker = (typeof SILO_CLOSURE_BLOCKERS)[number];

/**
 * §1 — A CONTAGEM ACUMULADA, COM UMA AUTORIDADE SÓ.
 *
 * A avaliação pós-`Concluir formação` olhava apenas as conclusões DAQUELA
 * execução. Com uma formação já concluída no remoto e outra fechando agora, o
 * Silo lia "1 de 5" quando são 2 — e o fechamento nunca chegaria, porque a
 * última conclusão continuaria vendo só a si mesma.
 *
 * O estado do Silo é o conjunto REMOTO mais o que acabou de fechar. Esta
 * função é quem responde as três listas, e ninguém as recalcula por conta.
 */
export function resolveFormationLedger(input: {
  /** Todos os candidatos ativos do Silo no cenário corrente. */
  activeCandidateRefs: readonly string[];
  /** As formações já congeladas no marcador remoto. */
  remoteConcludedRefs: readonly string[];
  /** As que fecharam nesta execução. */
  concludedInThisRun?: readonly string[];
}): {
  activeFormationRefs: string[];
  concludedFormationRefs: string[];
  remainingFormationRefs: string[];
  totalConcluded: number;
  remaining: number;
} {
  const ativos = [...new Set(input.activeCandidateRefs)];
  const concluidos = new Set([
    ...input.remoteConcludedRefs,
    ...(input.concludedInThisRun || []),
  ]);
  /*
   * Só conta quem ainda está no cenário.
   *
   * Uma conclusão de composição antiga continua gravada no marcador — é
   * histórico —, mas contá-la como cobertura do lote de agora faria o Silo
   * fechar sobre formações que ninguém mais vê na mesa.
   */
  const doCenario = ativos.filter(ref => concluidos.has(ref));
  return {
    activeFormationRefs: ativos,
    concludedFormationRefs: doCenario,
    remainingFormationRefs: ativos.filter(ref => !concluidos.has(ref)),
    totalConcluded: doCenario.length,
    remaining: ativos.length - doCenario.length,
  };
}

/**
 * O QUE BARRA O FECHAMENTO É DO PRÓPRIO SILO (2026-09-30).
 *
 * O fechamento de cada Silo recebia os pares de canibalização e as
 * contestações de fronteira da marca INTEIRA: um par de candidatos em Leads
 * sem Tráfego Pago barrava Estratégia de Negócios, com todas as formações
 * concluídas e os ArticleDNA gravados, e nenhum SiloDNA nascia em lugar
 * nenhum.
 *
 * Aqui fica só o que é deste Silo. E um par (ou uma contestação) cujos lados
 * a pessoa JÁ concluiu não barra mais: a decisão foi tomada no Concluir
 * formação, e mudar artigo aprovado é revisão do artigo, não pendência do
 * fechamento — barrar ali deixaria o Silo sem saída.
 */
export function closureGuardsForSilo<
  P extends { left: string; right: string },
  C extends { scope: { id: string }; currentSiloRef: string },
>(input: {
  siloRef: string;
  pairs: readonly P[];
  challenges: readonly C[];
  /** O Silo de cada candidato da mesa. */
  siloOfCandidate: ReadonlyMap<string, string>;
  /** Formações já congeladas (concluídas) no marcador remoto. */
  concludedCandidateRefs: ReadonlySet<string>;
}): { pairs: P[]; challenges: C[] } {
  const doSilo = (ref: string) => input.siloOfCandidate.get(ref) === input.siloRef;
  return {
    pairs: input.pairs.filter(par => doSilo(par.left) && doSilo(par.right)
      && !(input.concludedCandidateRefs.has(par.left) && input.concludedCandidateRefs.has(par.right))),
    challenges: input.challenges.filter(item => item.currentSiloRef === input.siloRef
      && !input.concludedCandidateRefs.has(item.scope.id)),
  };
}

/**
 * QUEM É ARTIGO DESTE SILO NO FECHAMENTO (2026-09-30).
 *
 * Dois impasses reais da homologação, os dois sem saída na tela:
 *
 * 1. PONTEIRO ÓRFÃO. Keyword que saiu de um artigo (ou mudou de Silo) leva
 *    junto o ponteiro da formação antiga, e a mesa monta com ela um fragmento
 *    de 1–2 buscas com o MESMO ref de uma formação concluída em OUTRO Silo.
 *    Ele nunca pode ser concluído e segurava o fechamento para sempre. Não é
 *    artigo deste Silo: não entra como ativo.
 *
 * 2. APROVADO SEM "CONCLUIR FORMAÇÃO". O publicado que ganhou o primeiro
 *    ArticleDNA pelo "Reforçar publicados" nunca passa pela conclusão. O
 *    ArticleDNA aprovado É a decisão humana: ele entra no fechamento com a
 *    composição e os papéis do próprio ArticleDNA, sem reescrever nada, e o
 *    candidato dele deixa de contar como pendente.
 */
export type ClosureFormation = {
  candidateRef: string;
  territoryRef: string;
  principalKeywordId: string;
  members: { keywordId: string; role: "principal" | "secundaria" | "reforco" }[];
  formationBaseHash: string;
  slug: string | null;
  fullPath: string | null;
  concludedAt: string;
  concludedBy: string;
  materializedArticleId: string | null;
};

export function closureFormationsForSilo<F extends ClosureFormation>(input: {
  territoryRef: string;
  /** Todas as formações congeladas no marcador (de todos os Silos). */
  concludedFormations: readonly F[];
  /** Candidatos da mesa neste Silo. */
  candidates: readonly { candidateRef: string; principalKeywordId: string }[];
  /** ArticleDNA aprovados da marca. */
  approvedArticles: readonly {
    versionId: string;
    createdAt: string;
    createdBy: string;
    articleId: string;
    territoryRef: string | null;
    principalKeywordId: string;
    suggestedSlug: string | null;
    references: readonly { keywordId: string; role: string }[];
  }[];
}): { activeCandidateRefs: string[]; formations: (F | ClosureFormation)[]; outOfScenario: string[] } {
  const concluidaEm = new Map(input.concludedFormations.map(item => [item.candidateRef, item.territoryRef]));
  /*
   * NUNCA UM SEGUNDO ARTIGO PARA A MESMA PRINCIPAL (2026-09-30).
   *
   * Reconcluir uma formação já materializada apagava o vínculo com o
   * ArticleDNA (`materializedArticleId: null`), e o fechamento criaria um
   * artigo novo ao lado do aprovado. Formação sem vínculo cuja Principal já
   * tem ArticleDNA aprovado neste Silo É aquele artigo: o vínculo volta, e
   * nada é materializado de novo.
   */
  const aprovadoPorPrincipal = new Map(input.approvedArticles
    .filter(article => article.territoryRef === input.territoryRef)
    .map(article => [article.principalKeywordId, article.articleId]));
  const doMarcador = input.concludedFormations
    .filter(item => item.territoryRef === input.territoryRef)
    .map(item => item.materializedArticleId || !aprovadoPorPrincipal.has(item.principalKeywordId)
      ? item
      : { ...item, materializedArticleId: aprovadoPorPrincipal.get(item.principalKeywordId)! });
  const ativos = input.candidates
    .filter(candidate => !concluidaEm.has(candidate.candidateRef) || concluidaEm.get(candidate.candidateRef) === input.territoryRef)
    .map(candidate => candidate.candidateRef);
  const materializados = new Set(doMarcador.map(item => item.materializedArticleId).filter(Boolean));
  const usados = new Set<string>();
  const doAcervo: ClosureFormation[] = input.approvedArticles
    .filter(article => article.territoryRef === input.territoryRef && !materializados.has(article.articleId))
    .map(article => {
      const candidato = input.candidates.find(candidate => ativos.includes(candidate.candidateRef)
        && !concluidaEm.has(candidate.candidateRef)
        && !usados.has(candidate.candidateRef)
        && candidate.principalKeywordId === article.principalKeywordId);
      if (candidato) usados.add(candidato.candidateRef);
      return {
        candidateRef: candidato?.candidateRef ?? `article-dna:${article.articleId}`,
        territoryRef: input.territoryRef,
        principalKeywordId: article.principalKeywordId,
        members: article.references.map(reference => ({
          keywordId: reference.keywordId,
          role: reference.role === "principal" ? "principal" as const : reference.role === "reforco_narrativo" ? "reforco" as const : "secundaria" as const,
        })),
        formationBaseHash: `article-dna:${article.versionId}`,
        slug: article.suggestedSlug,
        fullPath: null,
        concludedAt: article.createdAt,
        concludedBy: article.createdBy,
        materializedArticleId: article.articleId,
      };
    });
  return {
    activeCandidateRefs: ativos,
    formations: [...doMarcador, ...doAcervo],
    // Formação congelada que saiu do cenário: o lote mudou e a retomada espera.
    outOfScenario: doMarcador.filter(item => !ativos.includes(item.candidateRef)).map(item => item.candidateRef),
  };
}

/**
 * O ESTADO DO FECHAMENTO EM PORTUGUÊS SIMPLES, POR SILO (2026-09-30).
 *
 * Pilar, Suportes, SiloDNA e SiloPage nascem no fechamento; enquanto ele não
 * acontece, Links internos não tem base. A pessoa precisa ver QUAL Silo falta
 * e O QUÊ falta nele, não um "consolidação canônica pendente" genérico.
 */
export function describeSiloClosureReading(input: {
  label: string;
  consolidated: boolean;
  /** Candidatos do Silo ainda não concluídos, pelo nome. */
  pendingLabels: readonly string[];
  blockers: readonly { code: string; detail: string }[];
  /** Formações concluídas cuja composição saiu do cenário. */
  outOfScenarioCount: number;
  /** Há formação concluída neste Silo? */
  hasConcluded: boolean;
  planReady: boolean;
  resumable: boolean;
  resumptionReason: string | null;
}): { state: "closed" | "closing" | "waiting"; text: string } {
  if (input.consolidated) return { state: "closed", text: `${input.label}: fechado — Pilar, Suportes, SiloDNA e SiloPage gravados.` };
  const faltas: string[] = [];
  if (input.pendingLabels.length) {
    faltas.push(`falta concluir ${input.pendingLabels.length} artigo(s): ${input.pendingLabels.map(nome => `“${nome}”`).join(", ")} (aba Artigos: marque os artigos do Silo e clique em “Concluir formação”)`);
  }
  for (const bloqueio of input.blockers) {
    if (bloqueio.code === "FORMATIONS_PENDING" || bloqueio.code === "ALREADY_CONSOLIDATED") continue;
    faltas.push(bloqueio.detail);
  }
  if (input.outOfScenarioCount) {
    faltas.push(`${input.outOfScenarioCount} formação(ões) concluída(s) mudaram de composição depois: reprocesse e conclua de novo`);
  }
  if (!input.hasConcluded && !input.pendingLabels.length) faltas.push("nenhum artigo concluído neste Silo");
  if (!faltas.length && input.planReady && input.resumable) {
    return { state: "closing", text: `${input.label}: pronto — o fechamento roda sozinho (Pilar pela cobertura de buscas, os demais como Suporte).` };
  }
  if (!faltas.length && input.resumptionReason) faltas.push(input.resumptionReason);
  return { state: "waiting", text: `${input.label}: ${faltas.join(" · ") || "aguardando a releitura do acervo"}.` };
}

export type SiloClosureReadiness = {
  ready: boolean;
  blockers: { code: SiloClosureBlocker; detail: string }[];
  /** Candidatos concluídos aguardando o Silo canônico para virar ArticleDNA. */
  awaitingMaterialization: string[];
};

/**
 * §5/§6 — o Silo fecha quando o lote dele para de se mexer.
 *
 * Funciona igual para um candidato ou para o lote: quem responde é o estado do
 * SILO, não quantos a pessoa selecionou. Concluir 1 de 5 deixa 4 pendentes e o
 * Silo aberto; concluir o último fecha tudo, tenha sido um clique ou cinco.
 */
export function resolveSiloClosureReadiness(input: {
  siloRef: string;
  /** Todos os candidatos ATIVOS do Silo no cenário corrente. */
  activeCandidateRefs: readonly string[];
  /** Os que já têm formação congelada. */
  concludedCandidateRefs: readonly string[];
  /** Concluídos que ainda não viraram ArticleDNA. */
  pendingMaterializationRefs: readonly string[];
  /** Contestações de fronteira abertas para este Silo. */
  openBoundaryChallenges?: readonly { scopeLabel: string }[];
  /** Pares de canibalização ainda não resolvidos neste Silo. */
  unresolvedCannibalization?: readonly { leftLabel: string; rightLabel: string }[];
  /** Formações que a portaria da conclusão recusou, com o motivo. */
  blockedFormations?: readonly { label: string; reason: string }[];
  /** O Silo já produziu o par canônico? */
  alreadyConsolidated?: boolean;
  /** Keywords do Território em revisão ou reaprovadas — vindas de `keywordPackageClosureIssues`. */
  keywordPackageIssues?: readonly { label: string; reason: string }[];
}): SiloClosureReadiness {
  const blockers: SiloClosureReadiness["blockers"] = [];
  const concluidos = new Set(input.concludedCandidateRefs);
  const pendentes = input.activeCandidateRefs.filter(ref => !concluidos.has(ref));

  if (input.alreadyConsolidated) {
    blockers.push({
      code: "ALREADY_CONSOLIDATED",
      detail: "O Silo já tem par canônico; mudar estrutura pede sucessora, não novo par.",
    });
  }
  if (pendentes.length) {
    blockers.push({
      code: "FORMATIONS_PENDING",
      detail: `${pendentes.length} formação(ões) do Silo ainda não foram concluídas.`,
    });
  }
  for (const challenge of input.openBoundaryChallenges || []) {
    blockers.push({
      code: "SILO_RECONSIDERATION_REQUIRED",
      detail: `${challenge.scopeLabel}: a fronteira foi contestada e a decisão é da fase Silos.`,
    });
  }
  for (const par of input.unresolvedCannibalization || []) {
    blockers.push({
      code: "CANNIBALIZATION_UNRESOLVED",
      detail: `"${par.leftLabel}" e "${par.rightLabel}" ainda disputam o mesmo assunto.`,
    });
  }
  for (const insumo of input.keywordPackageIssues || []) {
    blockers.push({ code: "KEYWORD_PACKAGE_STALE", detail: `"${insumo.label}" ${insumo.reason}` });
  }
  for (const bloqueada of input.blockedFormations || []) {
    blockers.push({ code: "FORMATION_BLOCKED", detail: `${bloqueada.label}: ${bloqueada.reason}` });
  }

  return {
    ready: blockers.length === 0,
    blockers,
    awaitingMaterialization: [...input.pendingMaterializationRefs],
  };
}

/**
 * §10 — ZERO_MATERIALIZATION_CAN_BE_SUCCESS = NO.
 *
 * A mesa dizia "Formação aplicada parcialmente. 0 ArticleDNA confirmados" com
 * severidade de sucesso. Zero materializado não é aplicação parcial: ou a
 * formação fechou e está esperando o Silo canônico — o que é um estado normal
 * e precisa ser dito assim —, ou existe um bloqueio, e o bloqueio é a notícia.
 */
export function describeFormationConclusionOutcome(input: {
  concluded: number;
  materialized: number;
  awaitingCanonicalSilo: number;
  blocked: readonly { label: string; reason: string }[];
}): { severity: "success" | "warning" | "error"; message: string } {
  const bloqueios = input.blocked.map(item => `${item.label}: ${item.reason}`).join(" · ");

  if (!input.concluded) {
    return {
      severity: "error",
      message: bloqueios
        ? `Nenhuma formação foi concluída — ${bloqueios}`
        : "Nenhuma formação foi concluída: nenhum candidato selecionado passou nos gates.",
    };
  }

  const partes = [`${input.concluded} formação(ões) concluída(s)`];
  if (input.materialized) partes.push(`${input.materialized} ArticleDNA materializado(s)`);
  if (input.awaitingCanonicalSilo) {
    partes.push(`${input.awaitingCanonicalSilo} aguardando a consolidação do Silo para virar ArticleDNA`);
  }
  if (bloqueios) partes.push(`bloqueadas: ${bloqueios}`);

  return {
    // Concluir e ficar esperando o Silo é sucesso: é o fluxo desenhado.
    // Bloqueio junto rebaixa para aviso — houve trabalho e houve pendência.
    severity: input.blocked.length ? "warning" : "success",
    message: `${partes.join(" · ")}.`,
  };
}
