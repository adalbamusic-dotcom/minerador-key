/*
 * BLOCOS EM SEQUÊNCIA — helper puro, sem React, sem rede e sem banco.
 *
 * Pedido do dono (2026-09-25), ao importar ~200 keywords (4 Silos publicados,
 * 21 artigos publicados e ~130 livres): "só aumenta os limites e coloca em
 * sequências". As rotas do Arquiteto têm teto por pedido — 20 artigos na SERP
 * da formação, 10 dúvidas na SERP dos silos, 6 dúvidas na IA dos silos — e o
 * cliente mandava tudo de uma vez: acima do teto, a rota recusava o pedido
 * inteiro (400) e nada era processado.
 *
 * Aqui o lote vira blocos que cabem no teto e andam um depois do outro:
 *
 * - o PLANO de cada bloco é lido primeiro (modo `plan`: não paga, não resolve
 *   credencial) e a pessoa confirma UMA vez a soma dos blocos;
 * - cada bloco executa com a autorização do PRÓPRIO plano, e o orçamento do
 *   servidor continua por pedido — nenhum bloco paga a conta de outro;
 * - falha de um bloco não para os outros: os itens dele viram falha nomeada e
 *   o resto segue;
 * - o andamento diz "bloco N de M · faltam R".
 *
 * Nada aqui corta item em silêncio: o que não coube em bloco nenhum volta
 * nomeado (`leftoverSiloCandidates`, `oversized`) para a tela dizer.
 */

import {
  applyBatchOutcomes,
  createBatchProgress,
  finalizeBatchProgress,
  formatBatchProgress,
  type BatchItemOutcome,
  type BatchProgressSnapshot,
} from "../ui/batch-progress.ts";
import { mergeSerpPaidPlans, type SerpPaidPlan, type SerpPaidPlanChoice } from "./serp-lens-plan.ts";

/** Teto de `groups` e de `siloCandidates` por pedido em `/api/arquiteto/serp`. */
export const FORMATION_SERP_BLOCK_SIZE = 20;
/** Teto de `questions` por pedido em `/api/arquiteto/territorial-serp`. */
export const TERRITORIAL_SERP_BLOCK_SIZE = 10;
/** Teto de `questions` por pedido em `/api/arquiteto/territorial-ai`. */
export const TERRITORIAL_AI_BLOCK_SIZE = 6;
/**
 * Teto de keywords citáveis por dúvida na IA dos silos. Espelha
 * `knownKeywordIds` da rota: acima dele a dúvida não é enviada, e a tela diz.
 */
export const TERRITORIAL_AI_KEYWORD_LIMIT = 500;
/**
 * Os tetos POR DÚVIDA da rota `/api/arquiteto/territorial-ai`, um por lista.
 * A rota os importa daqui: cliente e servidor medem com a mesma régua, e a
 * dúvida que estoura qualquer um deles é dita pelo nome antes do envio —
 * mandar o bloco faria a rota recusar as seis dúvidas juntas com um 400.
 */
export const TERRITORIAL_AI_QUESTION_LIMITS = {
  architectureFacts: TERRITORIAL_AI_KEYWORD_LIMIT + 20,
  logicFacts: TERRITORIAL_AI_KEYWORD_LIMIT,
  knownTargetRefs: 80,
  knownKeywordIds: TERRITORIAL_AI_KEYWORD_LIMIT,
  publishedIdentity: 20,
  serpFacts: 30,
} as const;

/* ------------------------------ formação -------------------------------- */

export type FormationSerpBlock<Group, Candidate> = {
  index: number;
  groups: Group[];
  siloCandidates: Candidate[];
};

/**
 * Divide os artigos (e as candidatas a Silo que vão junto) em blocos de até
 * `size` cada.
 *
 * Todo bloco leva pelo menos um artigo — a rota exige. As candidatas são
 * repartidas em fatias de até `size`, uma por bloco; quando há mais fatias de
 * candidatas que artigos para carregá-las, os artigos são espalhados em mais
 * blocos (menores) antes de sobrar alguma. O que ainda sobra volta nomeado.
 */
export function splitFormationSerpBlocks<Group, Candidate>(
  groups: readonly Group[],
  siloCandidates: readonly Candidate[],
  size = FORMATION_SERP_BLOCK_SIZE,
): { blocks: FormationSerpBlock<Group, Candidate>[]; leftoverSiloCandidates: Candidate[] } {
  const teto = Number.isFinite(size) && size >= 1 ? Math.floor(size) : 1;
  if (!groups.length) return { blocks: [], leftoverSiloCandidates: [...siloCandidates] };
  const blocosDeArtigos = Math.ceil(groups.length / teto);
  const blocosDeCandidatas = Math.ceil(siloCandidates.length / teto);
  const total = Math.min(groups.length, Math.max(blocosDeArtigos, blocosDeCandidatas));
  const blocks: FormationSerpBlock<Group, Candidate>[] = [];
  // Distribuição equilibrada: os primeiros blocos levam um artigo a mais.
  const base = Math.floor(groups.length / total);
  const comUmAMais = groups.length % total;
  let cursor = 0;
  for (let index = 0; index < total; index += 1) {
    const tamanho = base + (index < comUmAMais ? 1 : 0);
    blocks.push({
      index,
      groups: groups.slice(cursor, cursor + tamanho),
      siloCandidates: siloCandidates.slice(index * teto, index * teto + teto),
    });
    cursor += tamanho;
  }
  return { blocks, leftoverSiloCandidates: siloCandidates.slice(total * teto) };
}

/* ------------------------------ autorização ----------------------------- */

/**
 * A escolha da pessoa foi feita sobre a SOMA dos blocos; cada bloco executa
 * com o número exato do plano dele, na mesma opção:
 *
 *   recoletar     — faltas + lentes antigas do bloco;
 *   só principal  — as faltas da lente principal do bloco;
 *   tudo          — as faltas do bloco.
 *
 * Somando os blocos dá o número que a pessoa viu na confirmação.
 */
export function choiceForSerpBlock(choice: SerpPaidPlanChoice, blockPlan: SerpPaidPlan): SerpPaidPlanChoice {
  if (choice.recollectStaleLenses) {
    return { authorizedPaidQueries: blockPlan.paidQueries + blockPlan.recollectableQueries, payMissingExtraLenses: true, recollectStaleLenses: true };
  }
  if (!choice.payMissingExtraLenses) {
    return { authorizedPaidQueries: blockPlan.primaryPaidQueries, payMissingExtraLenses: false, recollectStaleLenses: false };
  }
  return { authorizedPaidQueries: blockPlan.paidQueries, payMissingExtraLenses: choice.payMissingExtraLenses, recollectStaleLenses: false };
}

/* -------------------------------- runner -------------------------------- */

export type PaidBlockFailure = {
  blockIndex: number;
  itemIds: string[];
  stage: "plan" | "execute";
  reason: string;
};

/** O que sai da fase de plano: o plano de cada bloco (ou a falha) e a soma. */
export type PaidBlockPlanning<Block> = {
  blocks: readonly Block[];
  itemIdsOf: (block: Block) => string[];
  /** `null` no bloco cujo plano falhou: ele não é executado. */
  plans: readonly (SerpPaidPlan | null)[];
  /** A soma dos planos que voltaram: é o que a pessoa confirma, uma vez. */
  merged: SerpPaidPlan;
  planFailures: PaidBlockFailure[];
};

export type PaidBlockExecution<Result> = {
  results: { blockIndex: number; result: Result }[];
  blockFailures: PaidBlockFailure[];
  snapshot: BatchProgressSnapshot;
};

export type PaidBlockExecute<Block, Result> = (
  block: Block,
  choice: SerpPaidPlanChoice,
  context: { blockIndex: number; blockCount: number },
) => Promise<{ result: Result; outcomes: readonly BatchItemOutcome[] }>;

function descreverErro(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "erro sem mensagem";
}

/**
 * FASE 1 — o plano de todos os blocos, sem pagar nada.
 *
 * Com UM bloco só, o comportamento é o de antes: falha do plano sobe como
 * exceção (quem chamou já sabe dizer o erro). Com vários, o bloco cujo plano
 * falhou fica fora da execução e vira falha nomeada; só quando TODOS os
 * planos falham o erro sobe.
 */
export async function planPaidSerpBlocks<Block>(input: {
  blocks: readonly Block[];
  itemIdsOf: (block: Block) => string[];
  plan: (block: Block, blockIndex: number) => Promise<SerpPaidPlan>;
  describeError?: (error: unknown) => string;
}): Promise<PaidBlockPlanning<Block>> {
  const describe = input.describeError || descreverErro;
  const plans: (SerpPaidPlan | null)[] = [];
  const planFailures: PaidBlockFailure[] = [];
  let primeiroErro: unknown = null;
  for (let blockIndex = 0; blockIndex < input.blocks.length; blockIndex += 1) {
    const block = input.blocks[blockIndex];
    try {
      plans.push(await input.plan(block, blockIndex));
    } catch (error) {
      if (input.blocks.length === 1) throw error;
      primeiroErro ??= error;
      plans.push(null);
      planFailures.push({ blockIndex, itemIds: input.itemIdsOf(block), stage: "plan", reason: describe(error) });
    }
  }
  const planejados = plans.filter((plan): plan is SerpPaidPlan => plan !== null);
  if (!planejados.length) throw primeiroErro ?? new Error("Nenhum bloco pôde ser planejado.");
  return { blocks: input.blocks, itemIdsOf: input.itemIdsOf, plans, merged: mergeSerpPaidPlans(planejados), planFailures };
}

/**
 * FASE 2 — depois da escolha da pessoa, os blocos em sequência.
 *
 * Cada bloco executa com a autorização do PRÓPRIO plano (`choiceForSerpBlock`)
 * e o orçamento do servidor continua por pedido. Exceção de um bloco vira
 * falha dos itens dele e o próximo bloco segue — nunca repete o bloco: rota
 * paga não pode cobrar duas vezes.
 */
export async function executePaidSerpBlocks<Block, Result>(input: {
  label: string;
  planning: PaidBlockPlanning<Block>;
  choice: SerpPaidPlanChoice;
  execute: PaidBlockExecute<Block, Result>;
  onProgress?: (snapshot: BatchProgressSnapshot) => void;
  describeError?: (error: unknown) => string;
  yieldToUi?: () => Promise<void>;
  now?: () => number;
}): Promise<PaidBlockExecution<Result>> {
  const { blocks, itemIdsOf, plans, planFailures } = input.planning;
  const describe = input.describeError || descreverErro;
  const yieldToUi = input.yieldToUi || (() => new Promise<void>(resolve => setTimeout(resolve, 0)));
  const blockCount = blocks.length;
  const total = blocks.reduce((soma, block) => soma + itemIdsOf(block).length, 0);
  let snapshot = createBatchProgress(input.label, total, blockCount);
  const emit = () => input.onProgress?.(snapshot);
  // Os blocos sem plano contam como falha desde já: o andamento não mente o total.
  for (const failure of planFailures) {
    snapshot = applyBatchOutcomes(snapshot, failure.itemIds, failure.itemIds.map(id => ({ id, status: "failed" as const, reason: failure.reason })));
  }
  emit();
  const blockFailures: PaidBlockFailure[] = [...planFailures];
  const results: { blockIndex: number; result: Result }[] = [];
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const plan = plans[blockIndex];
    if (!plan) continue;
    const block = blocks[blockIndex];
    const itemIds = itemIdsOf(block);
    snapshot = { ...snapshot, inFlight: snapshot.inFlight + itemIds.length, chunksStarted: blockIndex + 1, chunkStartedAtMs: (input.now || Date.now)() };
    emit();
    try {
      const { result, outcomes } = await input.execute(block, choiceForSerpBlock(input.choice, plan), { blockIndex, blockCount });
      results.push({ blockIndex, result });
      snapshot = applyBatchOutcomes(snapshot, itemIds, outcomes);
    } catch (error) {
      const reason = describe(error);
      blockFailures.push({ blockIndex, itemIds, stage: "execute", reason });
      snapshot = applyBatchOutcomes(snapshot, itemIds, itemIds.map(id => ({ id, status: "failed" as const, reason })));
    }
    emit();
    if (blockIndex < blockCount - 1) await yieldToUi();
  }
  snapshot = finalizeBatchProgress(snapshot);
  emit();
  blockFailures.sort((left, right) => left.blockIndex - right.blockIndex);
  return { results, blockFailures, snapshot };
}

/**
 * Plano de todos os blocos → UMA confirmação → execução bloco a bloco.
 * `ask` devolvendo `null` cancela sem executar bloco nenhum.
 */
export async function runPaidSerpBlocks<Block, Result>(input: {
  label: string;
  blocks: readonly Block[];
  itemIdsOf: (block: Block) => string[];
  plan: (block: Block, blockIndex: number) => Promise<SerpPaidPlan>;
  ask: (merged: SerpPaidPlan) => Promise<SerpPaidPlanChoice | null>;
  execute: PaidBlockExecute<Block, Result>;
  onProgress?: (snapshot: BatchProgressSnapshot) => void;
  describeError?: (error: unknown) => string;
  yieldToUi?: () => Promise<void>;
  now?: () => number;
}): Promise<{ status: "cancelled" } | ({ status: "ran" } & PaidBlockExecution<Result>)> {
  const planning = await planPaidSerpBlocks(input);
  const choice = await input.ask(planning.merged);
  if (!choice) return { status: "cancelled" };
  const execution = await executePaidSerpBlocks({ ...input, planning, choice });
  return { status: "ran", ...execution };
}

/**
 * Texto do andamento: "bloco 2 de 7 · faltam 95" enquanto anda; o resumo
 * final ("Concluído: X ok, Y com falha") quando fecha.
 */
export function formatSerpBlockProgress(snapshot: BatchProgressSnapshot): string {
  if (snapshot.status !== "running") return formatBatchProgress(snapshot);
  return `bloco ${Math.max(1, snapshot.chunksStarted)} de ${Math.max(1, snapshot.chunkCount)} · faltam ${snapshot.remaining}`;
}

/** Prefixo das mensagens de falha: com um bloco só, nada muda. */
export function serpBlockPrefix(blockIndex: number, blockCount: number): string {
  return blockCount > 1 ? `Bloco ${blockIndex + 1} de ${blockCount}: ` : "";
}

/* ------------------------------- IA dos silos ------------------------------ */

/**
 * As keywords que a IA pode citar numa dúvida: as do ESCOPO aberto — as do
 * Silo da dúvida, as do Silo comparado e as que a hipótese da lógica cita para
 * ele —, não a mesa inteira. É o mesmo conjunto que aparece nos fatos do
 * prompt: a IA só cita o que viu.
 */
export function territorialAiKeywordScope(input: {
  territoryRef: string | null;
  comparedTerritoryRef?: string | null;
  keywords: readonly { id: string; territoryRef: string | null }[];
  hypothesisKeywordIds?: readonly string[];
}): string[] {
  const refs = new Set([input.territoryRef, input.comparedTerritoryRef ?? null].filter((ref): ref is string => Boolean(ref)));
  const escopo = new Set<string>();
  for (const keyword of input.keywords) {
    if (keyword.territoryRef && refs.has(keyword.territoryRef)) escopo.add(String(keyword.id));
  }
  for (const id of input.hypothesisKeywordIds ?? []) if (id) escopo.add(String(id));
  return [...escopo];
}

/**
 * Separa as dúvidas que cabem no teto de keywords das que não cabem, e divide
 * as que cabem em blocos de `blockSize`. A que não cabe volta nomeada: mandar
 * cortada faria a IA propor sobre um Silo que ela não viu inteiro.
 */
type TerritorialAiQuestionLists = { knownKeywordIds: readonly string[] } & {
  [List in Exclude<keyof typeof TERRITORIAL_AI_QUESTION_LIMITS, "knownKeywordIds">]?: readonly unknown[];
};

/** Quais listas da dúvida passam do teto da rota, já em texto: "logicFacts 612/500". */
export function territorialAiQuestionOverflow(
  question: TerritorialAiQuestionLists,
  keywordLimit: number = TERRITORIAL_AI_KEYWORD_LIMIT,
): string[] {
  const estouros: string[] = [];
  for (const [lista, teto] of Object.entries(TERRITORIAL_AI_QUESTION_LIMITS) as Array<[keyof typeof TERRITORIAL_AI_QUESTION_LIMITS, number]>) {
    const limite = lista === "knownKeywordIds" ? keywordLimit : teto;
    const tamanho = (question[lista] as readonly unknown[] | undefined)?.length ?? 0;
    if (tamanho > limite) estouros.push(`${lista} ${tamanho}/${limite}`);
  }
  return estouros;
}

export function splitTerritorialAiQuestions<Question extends TerritorialAiQuestionLists>(
  questions: readonly Question[],
  options: { blockSize?: number; keywordLimit?: number } = {},
): { blocks: Question[][]; oversized: Question[]; overflow: Array<{ question: Question; lists: string[] }> } {
  const blockSize = Math.max(1, Math.floor(options.blockSize ?? TERRITORIAL_AI_BLOCK_SIZE));
  const limite = Math.max(1, Math.floor(options.keywordLimit ?? TERRITORIAL_AI_KEYWORD_LIMIT));
  const overflow = questions
    .map(question => ({ question, lists: territorialAiQuestionOverflow(question, limite) }))
    .filter(item => item.lists.length > 0);
  const fora = new Set(overflow.map(item => item.question));
  const cabem = questions.filter(question => !fora.has(question));
  const oversized = overflow.map(item => item.question);
  const blocks: Question[][] = [];
  for (let inicio = 0; inicio < cabem.length; inicio += blockSize) blocks.push(cabem.slice(inicio, inicio + blockSize));
  return { blocks, oversized, overflow };
}
