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
