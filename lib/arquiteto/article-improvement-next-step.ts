/**
 * O PRÓXIMO PASSO da melhoria dos publicados, em UMA frase e UM botão.
 *
 * O painel "Melhorar publicados e formar Assuntos" tinha até cinco botões e
 * um parágrafo com os três passos: a pessoa não sabia qual apertar. Esta
 * função lê o estado que o painel já tem e escolhe o único ato que faz o
 * trabalho andar. Não muda nenhuma regra: os mesmos atos continuam lá, só a
 * ordem de leitura mudou.
 *
 * Precedência: o que ficou pela metade vem antes de começar de novo; validar
 * vem antes de gravar (1 → 2 → 3); linhas prontas desmarcadas pedem a
 * marcação (não "nada a fazer"); sem nada pendente, a frase manda para as
 * Sobras quando elas existem, ou para "Artigos novos" quando não existem —
 * nunca para um lugar vazio.
 */

export type ImprovementNextStepKind =
  | "working"
  | "prepare"
  | "resume_collect"
  | "resume_apply"
  | "refresh"
  | "validate"
  | "apply"
  | "select"
  | "none";

export type ImprovementNextStep = {
  kind: ImprovementNextStepKind;
  sentence: string;
  button: string;
  /** Só em `none`: o id do bloco da aba para onde o botão leva. */
  anchorId?: string;
};

export type ImprovementNextStepInput = {
  /** Há análise guardada (ou recém-feita) para esta marca. */
  hasRun: boolean;
  /** Estado da execução no servidor. */
  state: string | null;
  /** Outra execução segura a vez no servidor agora. */
  leaseActive: boolean;
  /** A pessoa já aceitou um lote (a gravação retoma sem nova confirmação). */
  accepted: boolean;
  /** Consultas pagas que ainda faltam validar. */
  paidQueries: number;
  /** Teto estimado do custo dessas consultas, em US$. */
  costMaxUsd: number;
  /** Linhas prontas e marcadas para gravar. */
  selectedCount: number;
  /** Linhas prontas para gravar, marcadas ou não. */
  readyCount?: number;
  /** A aba mostra Sobras (grupos ou keywords sem volume) agora. */
  hasLeftovers?: boolean;
  /** A tela está processando agora (a validação continua sozinha). */
  busy?: boolean;
  /** Andamento da validação: grupos feitos e total, quando o servidor informa. */
  collectProgress?: { done: number; total: number | null } | null;
  /** Andamento da gravação: artigos gravados e total aceito. */
  applyProgress?: { done: number; total: number } | null;
};

export const IMPROVEMENT_NO_PENDING_SENTENCE = "Nada a fazer nos publicados agora. Veja artigos novos em Sobras.";
export const IMPROVEMENT_NOTHING_ANYWHERE_SENTENCE = "Nada a fazer nos publicados nem nas Sobras agora. Para formar artigos novos, use “Processar artigos” logo abaixo.";
/** Ids dos blocos da aba Artigos para onde o botão de `none` leva. */
export const ARTICLES_SOBRAS_ANCHOR = "architect-sobras";
export const ARTICLES_NEW_ANCHOR = "architect-articles-new";

/** `numbered: false` tira o número quando o botão NÃO é o próximo passo. */
export function improvementValidateLabel(paidQueries: number, costMaxUsd: number, numbered = true): string {
  return `${numbered ? "2 · " : ""}Validar no Google (${paidQueries} consultas, até US$ ${costMaxUsd.toFixed(2)})`;
}

export function improvementApplyLabel(selectedCount: number, numbered = true): string {
  return `${numbered ? "3 · " : ""}Gravar melhorias (${selectedCount})`;
}

export function resolveImprovementNextStep(input: ImprovementNextStepInput): ImprovementNextStep {
  const done = input.state === "complete";
  // Enquanto a tela trabalha, dizer "parou no meio" com o botão desabilitado confundia: diga o que está acontecendo.
  if (input.busy && input.hasRun && input.state === "collecting") {
    const p = input.collectProgress;
    const andamento = p ? (p.total ? ` ${p.done} de ${p.total} grupos validados.` : ` ${p.done} grupo(s) validado(s).`) : "";
    return { kind: "working", sentence: `Validando no Google, um grupo por vez.${andamento} Pode levar alguns minutos; não feche a aba.`, button: "Validando…" };
  }
  if (input.busy && input.hasRun && input.accepted && !done) {
    const p = input.applyProgress;
    return { kind: "working", sentence: `Gravando as melhorias, um artigo por vez.${p ? ` ${p.done} de ${p.total} artigos gravados.` : ""} Não feche a aba.`, button: "Gravando…" };
  }
  if (input.hasRun && input.state === "collecting") {
    return { kind: "resume_collect", sentence: "A validação parou no meio. O que já foi pago está guardado e não é cobrado de novo.", button: "Continuar" };
  }
  if (input.hasRun && input.leaseActive) {
    return { kind: "refresh", sentence: "Uma execução está em andamento no servidor. Toque para ver como está.", button: "Ver andamento" };
  }
  if (input.hasRun && input.accepted && !done) {
    return { kind: "resume_apply", sentence: "A gravação das melhorias que você aceitou parou no meio. Ela continua de onde parou.", button: "Continuar" };
  }
  if (!input.hasRun) {
    return { kind: "prepare", sentence: "Comece aqui: busque keywords com volume para cada publicado e Assunto. O Google Ads é grátis; a leitura da IA usa a Connection DeepSeek da marca.", button: "1 · Buscar keywords (grátis)" };
  }
  if (input.paidQueries > 0 && !input.accepted) {
    return { kind: "validate", sentence: "Confira no Google as keywords com volume antes de gravar. Você vê o custo antes.", button: improvementValidateLabel(input.paidQueries, input.costMaxUsd) };
  }
  if (input.selectedCount > 0 && !done) {
    return { kind: "apply", sentence: `${input.selectedCount} melhoria(s) pronta(s). Confira na tabela abaixo e grave.`, button: improvementApplyLabel(input.selectedCount) };
  }
  const ready = input.readyCount ?? 0;
  if (ready > 0 && !done && !input.accepted) {
    return { kind: "select", sentence: `${ready} melhoria(s) pronta(s). Marque na tabela abaixo as que quer gravar.`, button: improvementApplyLabel(0) };
  }
  if (input.hasLeftovers === false) {
    return { kind: "none", sentence: IMPROVEMENT_NOTHING_ANYWHERE_SENTENCE, button: "Ir para Artigos novos", anchorId: ARTICLES_NEW_ANCHOR };
  }
  return { kind: "none", sentence: IMPROVEMENT_NO_PENDING_SENTENCE, button: "Ver Sobras", anchorId: ARTICLES_SOBRAS_ANCHOR };
}
