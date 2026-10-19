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
  | "read_paid"
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
  /**
   * D2(a) (SDD 2026-10-12 §17): das `paidQueries`, as que só coletariam a SERP
   * de uma principal declarada já coberta pelo parecer das sustentações. São
   * opcionais (D2(b)): não fazem do "Validar no Google" o próximo passo.
   */
  optionalPaidQueries?: number;
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
  /**
   * F3 · LER ANTES DE BUSCAR: a leitura que custa (IA e/ou medição no Google
   * Ads) que ainda falta, com o botão que diz o que chama e a frase "já temos ·
   * falta · custa". Ausente = nada a pagar para ler.
   */
  paidReading?: { button: string; sentence: string } | null;
};

export const IMPROVEMENT_NO_PENDING_SENTENCE = "Nada a fazer nos publicados agora. Veja artigos novos em Sobras.";
export const IMPROVEMENT_NOTHING_ANYWHERE_SENTENCE = "Nada a fazer nos publicados nem nas Sobras agora. Para formar artigos novos, use “Processar artigos” logo abaixo.";
/** Ids dos blocos da aba Artigos para onde o botão de `none` leva. */
/* ------------------- análise anterior e mensagem humana ------------------- */

/**
 * A ANÁLISE ANTERIOR NÃO É O ESTADO ATUAL (2026-10-14, caso WifiConecta).
 *
 * Com a etiqueta em "todos", o painel abria mostrando a análise antiga (os
 * Assuntos do laranja, de antes do recadastro) como se fosse a de agora. A
 * execução lida do servidor ao abrir fica RECOLHIDA ("Análise anterior de
 * <data>") quando: é de outro recorte que o da etiqueta, ou a mesa mudou depois
 * dela. Gravação aceita e em andamento (`applying`) ou com a vez ocupada nunca
 * é recolhida: é compromisso, e o painel continua dela.
 */
export function improvementRunIsPrevious(input: {
  run: { state: string; createdAt?: string | null; leaseUntil?: string | null; groupScope?: { requested: string } | null };
  activeGroupRequested: string | null;
  /** A última mudança da mesa do Arquiteto (itens recebidos), quando conhecida. */
  mesaChangedAt?: string | null;
  now?: number;
}): boolean {
  const { run } = input;
  if (run.state === "applying") return false;
  if (run.leaseUntil && Date.parse(run.leaseUntil) > (input.now ?? Date.now())) return false;
  const recorteDaExecucao = run.groupScope?.requested ?? "todos";
  const recorteAtivo = input.activeGroupRequested ?? "todos";
  if (recorteDaExecucao !== recorteAtivo) return true;
  const criada = run.createdAt ? Date.parse(run.createdAt) : NaN;
  const mudou = input.mesaChangedAt ? Date.parse(input.mesaChangedAt) : NaN;
  return Number.isFinite(criada) && Number.isFinite(mudou) && mudou > criada;
}

/** "Análise anterior de 14/10 01:33 · marca inteira". */
export function improvementPreviousRunLabel(run: { createdAt?: string | null; groupScope?: { requested: string } | null }): string {
  const data = run.createdAt && Number.isFinite(Date.parse(run.createdAt))
    ? new Date(run.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "data desconhecida";
  return `Análise anterior de ${data} · ${run.groupScope ? `cor ${run.groupScope.requested}` : "marca inteira"}`;
}

const MENSAGENS_DOS_CODIGOS: Record<string, string> = {
  REWORK_SAME_REFUSAL: "Isto já foi tentado com os mesmos insumos e deu a mesma recusa; nada foi pago de novo.",
  REWORK_SAME_INPUTS: "Isto já foi feito com os mesmos insumos; o resultado anterior foi reaproveitado.",
  DECLARED_PLAN_CONTRADICTION: "Isto contradiz o plano declarado no Minerador; o plano muda lá.",
  REWORK_PARALLEL_PATH: "Este caminho é paralelo ao do plano; o artigo do plano é a linha dele na tabela de artigos (“Processar artigos” → “Concluir formação”).",
  TEMPO_ESGOTADO: "O servidor demorou demais nesta etapa. O que foi feito ficou salvo: toque de novo no mesmo botão para continuar.",
};

/**
 * O dono nunca vê o código técnico cru ("REWORK_SAME_REFUSAL: …"): o prefixo
 * em maiúsculas vira a frase humana, e o resto da mensagem (que já é humana,
 * com a data) continua.
 */
export function humanizeOperationMessage(message: string): string {
  const texto = String(message || "").trim();
  const casado = /^([A-Z][A-Z0-9_]{3,})(?::\s*|\s+[-–—]\s+|$)/.exec(texto);
  if (!casado) return texto;
  const resto = texto.slice(casado[0].length).trim();
  const frase = MENSAGENS_DOS_CODIGOS[casado[1]];
  if (frase) return resto ? `${frase} ${resto}` : frase;
  return resto || "A etapa não pôde ser concluída agora. Tente de novo.";
}

export const ARTICLES_SOBRAS_ANCHOR = "architect-sobras";
export const ARTICLES_NEW_ANCHOR = "architect-articles-new";

/**
 * 2026-10-17 · pedido do dono: o passo pago diz o que faz e quem cobra.
 * SUBSTITUI o nome "Validar no Google" (que parecia o Google Ads, grátis):
 * vale "Coletar a SERP no DataForSEO (pago: N consultas, até US$ X)". O
 * Google Ads aparece sempre como "grátis (cota do Google Ads)".
 */
export const IMPROVEMENT_SERP_STEP_NAME = "Coletar a SERP no DataForSEO";
export const GOOGLE_ADS_FREE_LABEL = "grátis (cota do Google Ads)";

/** `numbered: false` tira o número quando o botão NÃO é o próximo passo. */
export function improvementValidateLabel(paidQueries: number, costMaxUsd: number, numbered = true): string {
  return `${numbered ? "2 · " : ""}${IMPROVEMENT_SERP_STEP_NAME} (pago: ${paidQueries} consultas, até US$ ${costMaxUsd.toFixed(2)})`;
}

export function improvementApplyLabel(selectedCount: number, numbered = true): string {
  return `${numbered ? "3 · " : ""}Gravar melhorias (${selectedCount})`;
}

/**
 * O botão de gravar NA FILEIRA (sem número). "Gravar sem validar (n)" só
 * quando ainda falta validação OBRIGATÓRIA; se tudo o que falta pagar é a
 * D2(b) opcional (principal declarada já coberta pelo parecer das
 * sustentações, D2(a)), gravar não é "sem validar": é o "Gravar melhorias".
 */
export function improvementRowApplyLabel(input: { selectedCount: number; paidQueries: number; optionalPaidQueries?: number; accepted?: boolean }): string {
  if (input.accepted) return "Continuar melhorias aceitas";
  const obrigatorias = input.paidQueries - Math.max(0, input.optionalPaidQueries ?? 0);
  return obrigatorias > 0 ? `Gravar sem validar (${input.selectedCount})` : improvementApplyLabel(input.selectedCount, false);
}

export function resolveImprovementNextStep(input: ImprovementNextStepInput): ImprovementNextStep {
  const done = input.state === "complete";
  // Enquanto a tela trabalha, dizer "parou no meio" com o botão desabilitado confundia: diga o que está acontecendo.
  if (input.busy && input.hasRun && input.state === "collecting") {
    const p = input.collectProgress;
    const andamento = p ? (p.total ? ` ${p.done} de ${p.total} grupos validados.` : ` ${p.done} grupo(s) validado(s).`) : "";
    return { kind: "working", sentence: `Coletando a SERP no DataForSEO, um grupo por vez.${andamento} Pode levar alguns minutos; não feche a aba.`, button: "Coletando…" };
  }
  if (input.busy && input.hasRun && input.accepted && !done) {
    const p = input.applyProgress;
    return { kind: "working", sentence: `Gravando as melhorias, um artigo por vez.${p ? ` ${p.done} de ${p.total} artigos gravados.` : ""} Não feche a aba.`, button: "Gravando…" };
  }
  if (input.hasRun && input.state === "collecting") {
    return { kind: "resume_collect", sentence: "A coleta da SERP no DataForSEO parou no meio. O que já foi pago está guardado e não é cobrado de novo.", button: "Continuar" };
  }
  if (input.hasRun && input.leaseActive) {
    return { kind: "refresh", sentence: "Uma execução está em andamento no servidor. Toque para ver como está.", button: "Ver andamento" };
  }
  if (input.hasRun && input.accepted && !done) {
    return { kind: "resume_apply", sentence: "A gravação das melhorias que você aceitou parou no meio. Ela continua de onde parou.", button: "Continuar" };
  }
  if (!input.hasRun) {
    return { kind: "prepare", sentence: "Comece aqui: leia o que já temos de cada publicado e Assunto — DNA, volume medido, SERP em cache, Assunto, plano e trava. É grátis: a IA e o Google Ads (grátis, cota do Google Ads) só rodam depois, com a sua autorização.", button: "1 · Buscar keywords (grátis)" };
  }
  // F3 · o que custa para ler (IA, medição) vem antes de validar: a proposta muda com o que a leitura traz.
  if (input.paidReading && !input.accepted && input.state === "prepared") {
    return { kind: "read_paid", sentence: input.paidReading.sentence, button: input.paidReading.button };
  }
  if (input.paidQueries - Math.max(0, input.optionalPaidQueries ?? 0) > 0 && !input.accepted) {
    return { kind: "validate", sentence: "Falta a primeira SERP da principal: colete no DataForSEO antes de gravar. É pago; você vê as consultas e o valor máximo antes.", button: improvementValidateLabel(input.paidQueries, input.costMaxUsd) };
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

/*
 * 2026-10-18 (amarelo da WifiConecta, teste no ar) · A LEITURA GRÁTIS DO REFAZEDOR, POR ARTIGO. Com os 8 artigos já
 * formados, "Melhorar publicados…" abria e mostrava só "Já feito com os mesmos insumos… diga o motivo para refazer": o
 * dono achou que "não fez nada". Abrir o refazedor mostra, para cada artigo lido, o que ele TEM, o que FALTA e a
 * PROPOSTA (se houver); o custo aparece só quando precisa pagar, e o "já feito" só quando a pessoa pede para refazer o
 * que custa. Só leitura: nada aqui chama nem grava.
 */
export type ImprovementReadingLine = { targetId: string; theme: string; has: string; missing: string; proposal: string };
const contagem = (n: number) => `${n} keyword${n === 1 ? "" : "s"}`;
export function improvementReadingLines(input: {
  proposals: ReadonlyArray<{ targetId: string; theme: string; memberIds: readonly string[]; addIds: readonly string[]; removeIds: readonly string[]; principalId: string | null; currentPrimaryId: string | null; status: string; reasons: readonly string[]; needsValidation?: boolean; needsMinerador?: unknown }>;
  targets: ReadonlyArray<{ id: string; memberIds: readonly string[] }>;
  keywordName: (id: string | null) => string;
  /** O teto do artigo (seis: uma principal e até cinco de apoio). */
  max: number;
}): ImprovementReadingLine[] {
  return input.proposals.map(p => {
    const atuais = input.targets.find(t => t.id === p.targetId)?.memberIds.length ?? 0;
    const has = atuais ? `${contagem(atuais)} hoje` : "ainda sem ArticleDNA";
    const cabem = input.max - Math.max(atuais, 1);
    const faltas = [
      cabem > 0 ? `cabem mais ${cabem}` : `cheio (${input.max} de ${input.max})`,
      p.needsValidation ? "falta a SERP da principal (coleta paga, custo antes)" : null,
      p.needsMinerador ? "precisa do Minerador" : null,
    ].filter(Boolean);
    const troca = p.principalId && p.principalId !== p.currentPrimaryId ? `principal: ${input.keywordName(p.currentPrimaryId)} → ${input.keywordName(p.principalId)}` : null;
    const muda = [
      troca,
      p.addIds.length ? `entram ${p.addIds.length}: ${p.addIds.map(id => input.keywordName(id)).join("; ")}` : null,
      p.removeIds.length ? `saem ${p.removeIds.length}: ${p.removeIds.map(id => input.keywordName(id)).join("; ")}` : null,
    ].filter(Boolean);
    const semReforco = p.reasons.find(reason => reason.startsWith("Sem keyword de reforço encontrada"));
    const proposal = muda.length
      ? `Proposta: ${muda.join(" · ")} (${contagem(atuais)} → ${contagem(p.memberIds.length)}).`
      : semReforco ?? (cabem > 0 ? "Nenhuma keyword nova coube nesta leitura; a vaga continua aberta." : "Nada a mudar: o artigo está cheio.");
    return { targetId: p.targetId, theme: p.theme, has, missing: faltas.join("; "), proposal };
  });
}
