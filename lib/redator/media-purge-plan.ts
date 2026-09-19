/**
 * ===== AS REGRAS DA PURGA DE MÍDIA — DECISÃO, NUNCA EXECUÇÃO =====
 *
 * Este módulo **não apaga nada e não sabe apagar nada**. Ele não importa
 * cliente de banco, não importa Storage e não tem `server-only`. Ele responde
 * três perguntas e devolve estruturas:
 *
 *   1. esta linha pode ser purgada agora?
 *   2. o que o resultado do Storage significa?
 *   3. em que ordem a fila pode ser consumida sem quebrar vínculo?
 *
 * A separação é deliberada. Enquanto a rota não existir, o repositório não tem
 * caminho algum que remova arquivo ou linha — e a ausência de purga continua
 * sendo o modo seguro. O que existe aqui é a decisão, exercitável por teste.
 *
 * ==================== IDADE NUNCA BASTA ====================
 *
 * `purge_after` não é "criado há 48h". Ele só nasce quando uma substituição
 * confirmada declarou um sucessor, e o CHECK do banco o amarra a
 * `superseded_at + 48h`. Uma linha velha e corrente não tem `purge_after`, e
 * por isso nunca entra nesta fila.
 *
 * ==================== ARQUIVO PRIMEIRO, LINHA DEPOIS ====================
 *
 * SQL não apaga objeto de Storage. Se a linha sumisse antes do arquivo, sobraria
 * objeto órfão no bucket — sem dono, sem rastro e sem ninguém para reclamá-lo.
 * Na ordem inversa, uma falha no meio deixa linha sem arquivo: recuperável, e a
 * próxima execução resolve. Entre perder o rastro e repetir trabalho, repete-se
 * o trabalho.
 */

/** Só o que a decisão precisa. O que não está aqui não influencia. */
export type PurgeCandidate = {
  assetId: string;
  storagePath: string | null;
  supersededAt: string | null;
  purgeAfter: string | null;
  replacedByAssetId: string | null;
};

export type PurgeRefusal =
  /** Corrente. Nunca elegível, por mais antigo que seja. */
  | "not_superseded"
  /** Substituído, mas a janela de 48h ainda corre. */
  | "window_open"
  /** Substituído sem janela declarada: estado incoerente, não se apaga no escuro. */
  | "no_purge_after"
  /** Em janela sem sucessor declarado: idem. */
  | "no_successor"
  /** Outra linha ainda aponta para esta. Apagar quebraria a declaração dela. */
  | "referenced_by_remaining";

export type PurgeDecision =
  | { eligible: true; assetId: string; storagePath: string | null }
  | { eligible: false; assetId: string; refusal: PurgeRefusal };

/**
 * ===== AS QUATRO CONDIÇÕES, NA ORDEM EM QUE IMPORTAM =====
 *
 * `not_superseded` vem primeiro porque é a regra que protege o trabalho vivo:
 * quem ainda ocupa uma posição não pode ser candidato, e essa resposta não
 * depende de mais nada.
 */
export function planAssetPurge(candidate: PurgeCandidate, now: Date | string): PurgeDecision {
  const { assetId } = candidate;

  if (!candidate.supersededAt) return { eligible: false, assetId, refusal: "not_superseded" };
  if (!candidate.replacedByAssetId) return { eligible: false, assetId, refusal: "no_successor" };
  if (!candidate.purgeAfter) return { eligible: false, assetId, refusal: "no_purge_after" };

  const limite = new Date(candidate.purgeAfter).getTime();
  const agora = (now instanceof Date ? now : new Date(now)).getTime();
  if (!Number.isFinite(limite) || agora < limite) return { eligible: false, assetId, refusal: "window_open" };

  /*
   * `storagePath` nulo não é recusa: é uma linha que nunca teve arquivo. Não há
   * objeto para remover, e a limpeza segue direto para a linha.
   */
  return { eligible: true, assetId, storagePath: candidate.storagePath };
}

/**
 * ===== O VÍNCULO ENTRE PREDECESSOR E SUCESSOR RESTRINGE A ORDEM =====
 *
 * `replaced_by_asset_id` é `ON DELETE RESTRICT` e aponta do predecessor para o
 * sucessor. Apagar o SUCESSOR enquanto o predecessor existir viola a restrição
 * — o banco recusa com 23503.
 *
 * Na prática o predecessor tem `purge_after` mais antigo e sai primeiro, então
 * a ordem cronológica já resolve o caso comum. Mas se o predecessor for pulado
 * — porque a janela dele ainda corre, ou porque o Storage falhou —, o sucessor
 * não pode ser apagado nesta passada. Esta função é quem diz isso ANTES de
 * tentar, para o erro não chegar como 23503 cru.
 */
export function referencedByRemaining(assetId: string, remaining: readonly PurgeCandidate[]): boolean {
  return remaining.some(outra => outra.assetId !== assetId && outra.replacedByAssetId === assetId);
}

/**
 * A fila inteira, decidida de uma vez.
 *
 * `remaining` são as linhas que CONTINUARÃO existindo — as que não serão
 * apagadas nesta passada. Uma linha referenciada por alguma delas é adiada, não
 * recusada para sempre: quando o predecessor sair, ela passa.
 */
export function planPurgeQueue(input: {
  candidates: readonly PurgeCandidate[];
  /** Todas as linhas conhecidas da marca, para resolver referências. */
  allRows: readonly PurgeCandidate[];
  now: Date | string;
}): PurgeDecision[] {
  const { candidates, allRows, now } = input;

  /* Cronológica: o predecessor, com janela mais antiga, sempre antes. */
  const ordenados = [...candidates].sort((a, b) =>
    String(a.purgeAfter ?? "").localeCompare(String(b.purgeAfter ?? "")));

  const decididos: PurgeDecision[] = [];
  const serao_apagados = new Set<string>();

  for (const candidato of ordenados) {
    const decisao = planAssetPurge(candidato, now);
    if (!decisao.eligible) { decididos.push(decisao); continue; }

    /* Quem sobra depois desta passada, descontando o que já foi decidido apagar. */
    const sobrando = allRows.filter(linha =>
      linha.assetId !== candidato.assetId && !serao_apagados.has(linha.assetId));

    if (referencedByRemaining(candidato.assetId, sobrando)) {
      decididos.push({ eligible: false, assetId: candidato.assetId, refusal: "referenced_by_remaining" });
      continue;
    }

    serao_apagados.add(candidato.assetId);
    decididos.push(decisao);
  }

  return decididos;
}

/* ==========================================================================
 * AS GUARDAS EXTRAS DA MÍDIA — o sucessor precisa estar de pé
 * ========================================================================== */

/** A linha inteira que as guardas de mídia precisam ver. */
export type MediaPurgeRow = PurgeCandidate & {
  brandId: string;
  documentId: string;
  anchorKind: string | null;
  anchorRef: string | null;
  status: "prompt_ready" | "uploaded" | "reviewed";
};

export type MediaPurgeRefusal =
  | PurgeRefusal
  /** Um elo de `replaced_by_asset_id` aponta para linha que não existe. */
  | "successor_missing"
  /** Algum elo cruza marca, documento ou posição. */
  | "successor_scope_mismatch"
  /** A cadeia volta sobre si mesma: A → B → A. */
  | "chain_cycle"
  /** A cadeia termina sem chegar a um ativo corrente. */
  | "chain_no_current"
  /** A cadeia é absurdamente longa — sinal de dado corrompido. */
  | "chain_too_long"
  /** A âncora tem zero ou mais de um corrente. Não se apaga no escuro. */
  | "anchor_current_ambiguous";

export type MediaPurgeDecision =
  | { eligible: true; assetId: string; storagePath: string | null; successorAssetId: string; currentAssetId: string; chainLength: number }
  | { eligible: false; assetId: string; refusal: MediaPurgeRefusal };

/** Corrente = ancorado, não substituído e com arquivo. A condição do índice único. */
export function isCurrentMediaRow(linha: MediaPurgeRow): boolean {
  return Boolean(linha.anchorKind) && !linha.supersededAt
    && (linha.status === "uploaded" || linha.status === "reviewed");
}

/** Guarda contra dado corrompido: nenhuma posição real encadeia tanto. */
const LIMITE_DA_CADEIA = 64;

export type ChainResolution =
  | { ok: true; currentAssetId: string; length: number }
  | { ok: false; refusal: Extract<MediaPurgeRefusal, "successor_missing" | "successor_scope_mismatch" | "chain_cycle" | "chain_no_current" | "chain_too_long"> };

/**
 * ===== A CADEIA, E NÃO O SUCESSOR DIRETO =====
 *
 * ==================== O DEFEITO QUE ISTO FECHA ====================
 *
 * A versão anterior exigia que o sucessor DIRETO fosse o corrente. Numa cadeia
 * legítima `A → B → C(corrente)`, quando a janela de A vencesse o B já estaria
 * substituído — e A seria recusada com `successor_not_current` **para sempre**.
 * Retenção indefinida sobre uma troca perfeitamente válida.
 *
 * O que importa não é quem veio logo depois: é se a posição chegou a um dono
 * vivo. Se a cadeia de A desemboca no corrente daquela âncora, a substituição
 * de A foi bem sucedida — por mais elos que tenham acontecido no caminho.
 *
 * ==================== O QUE AINDA RECUSA ====================
 *
 * Elo faltando, elo em outra marca/documento/âncora, ciclo, ou cadeia que
 * termina sem corrente. Em todos esses casos o predecessor deixa de ser
 * "histórico de uma troca bem sucedida" e vira a última cópia de alguma coisa.
 * O modo de falha continua sendo reter demais.
 */
export function resolveSuccessorChain(input: {
  from: MediaPurgeRow;
  rows: readonly MediaPurgeRow[];
}): ChainResolution {
  const { from, rows } = input;
  const porId = new Map(rows.map(linha => [linha.assetId, linha]));
  const visitados = new Set<string>([from.assetId]);

  let atual = from;
  let passos = 0;

  while (atual.replacedByAssetId) {
    if (++passos > LIMITE_DA_CADEIA) return { ok: false, refusal: "chain_too_long" };

    const proximo = porId.get(atual.replacedByAssetId);
    if (!proximo) return { ok: false, refusal: "successor_missing" };

    /* Ciclo: já passamos por aqui. Seguir fecharia um laço infinito. */
    if (visitados.has(proximo.assetId)) return { ok: false, refusal: "chain_cycle" };
    visitados.add(proximo.assetId);

    /* Todo elo tem que viver na MESMA posição. Um elo fora dela quebra a prova. */
    if (proximo.brandId !== from.brandId
      || proximo.documentId !== from.documentId
      || proximo.anchorKind !== from.anchorKind
      || proximo.anchorRef !== from.anchorRef) {
      return { ok: false, refusal: "successor_scope_mismatch" };
    }

    /* Chegou ao fim da cadeia: ele é o corrente? */
    if (!proximo.supersededAt) {
      return isCurrentMediaRow(proximo)
        ? { ok: true, currentAssetId: proximo.assetId, length: passos }
        : { ok: false, refusal: "chain_no_current" };
    }
    atual = proximo;
  }

  /* A cadeia acabou sem chegar em ninguém vivo. */
  return { ok: false, refusal: "chain_no_current" };
}

/**
 * ===== AS CONDIÇÕES, NA ORDEM EM QUE IMPORTAM =====
 *
 * A base primeiro (substituído, com sucessor declarado, janela vencida, não
 * corrente), depois a integridade da CADEIA, e por fim a unicidade do corrente
 * na âncora — porque apagar histórico de uma posição com dois donos seria
 * decidir sobre um estado que ninguém entende.
 */
export function planMediaPurge(input: {
  candidate: MediaPurgeRow;
  /** Todas as linhas conhecidas da marca — para resolver a cadeia e referências. */
  rows: readonly MediaPurgeRow[];
  now: Date | string;
}): MediaPurgeDecision {
  const { candidate, rows, now } = input;

  const base = planAssetPurge(candidate, now);
  if (!base.eligible) return { eligible: false, assetId: candidate.assetId, refusal: base.refusal };

  const cadeia = resolveSuccessorChain({ from: candidate, rows });
  if (!cadeia.ok) return { eligible: false, assetId: candidate.assetId, refusal: cadeia.refusal };

  /*
   * Exatamente um corrente na âncora. Zero significa posição órfã — e aí o
   * predecessor pode ser a única imagem que resta. Mais de um significa estado
   * que o índice único deveria impedir, e que não se resolve apagando.
   */
  const correntesNaAncora = rows.filter(linha =>
    linha.brandId === candidate.brandId
    && linha.documentId === candidate.documentId
    && linha.anchorKind === candidate.anchorKind
    && linha.anchorRef === candidate.anchorRef
    && isCurrentMediaRow(linha));
  if (correntesNaAncora.length !== 1) {
    return { eligible: false, assetId: candidate.assetId, refusal: "anchor_current_ambiguous" };
  }

  /* E o corrente precisa ser o que a cadeia alcançou, não outro qualquer. */
  if (correntesNaAncora[0].assetId !== cadeia.currentAssetId) {
    return { eligible: false, assetId: candidate.assetId, refusal: "chain_no_current" };
  }

  if (referencedByRemaining(candidate.assetId, rows.filter(l => l.assetId !== candidate.assetId))) {
    return { eligible: false, assetId: candidate.assetId, refusal: "referenced_by_remaining" };
  }

  return {
    eligible: true, assetId: candidate.assetId, storagePath: candidate.storagePath,
    successorAssetId: String(candidate.replacedByAssetId),
    currentAssetId: cadeia.currentAssetId, chainLength: cadeia.length,
  };
}

/* ==========================================================================
 * O QUE O STORAGE RESPONDEU
 * ========================================================================== */

export type StorageRemovalOutcome = "removed" | "already_absent" | "failed";

/**
 * ===== "NÃO ENCONTRADO" É SUCESSO =====
 *
 * A operação precisa ser repetível. Se uma passada anterior removeu o objeto e
 * morreu antes de apagar a linha, a próxima encontra o bucket sem o arquivo — e
 * tratar isso como erro deixaria a linha presa para sempre, com um arquivo que
 * já não existe.
 *
 * Qualquer OUTRO erro — rede, permissão, bucket errado — é `failed`, e linha
 * com `failed` NÃO é apagada. Essa distinção é a diferença entre limpar e
 * perder o rastro de um arquivo que ainda está lá.
 */
export function classifyStorageRemoval(input: {
  error?: { message?: string | null; status?: number | null; statusCode?: string | number | null } | null;
}): StorageRemovalOutcome {
  const erro = input.error;
  if (!erro) return "removed";

  const status = Number(erro.status ?? erro.statusCode ?? NaN);
  if (status === 404) return "already_absent";

  const texto = String(erro.message ?? "").toLowerCase();
  if (/not\s*found|does not exist|no such (file|key|object)|nosuchkey/.test(texto)) return "already_absent";

  return "failed";
}

/** A linha só sai depois de o arquivo comprovadamente não estar mais lá. */
export function canDeleteRowAfterStorage(outcome: StorageRemovalOutcome): boolean {
  return outcome === "removed" || outcome === "already_absent";
}

/* ==========================================================================
 * O DESFECHO POR ATIVO — nunca um booleano para o lote inteiro
 * ========================================================================== */

export type PurgeOutcome =
  | { assetId: string; result: "skipped"; refusal: PurgeRefusal }
  | { assetId: string; result: "storage_failed"; reason: string }
  | { assetId: string; result: "purged"; storage: StorageRemovalOutcome }
  | { assetId: string; result: "already_purged" }
  | { assetId: string; result: "not_eligible" }
  | { assetId: string; result: "referenced" }
  | { assetId: string; result: "blocked_by_predecessor" };

/** Um lote nunca "falha" inteiro: ele reporta o que aconteceu com cada ativo. */
export function summarizePurge(outcomes: readonly PurgeOutcome[]) {
  const por = (r: PurgeOutcome["result"]) => outcomes.filter(o => o.result === r).length;
  return {
    total: outcomes.length,
    purgados: por("purged"),
    ja_purgados: por("already_purged"),
    pulados: por("skipped"),
    nao_elegiveis: por("not_eligible"),
    referenciados: por("referenced"),
    bloqueados_por_predecessor: por("blocked_by_predecessor"),
    falhas_de_storage: por("storage_failed"),
  };
}
