import "server-only";

import type { ArticleDNA, SiloDNA, VersionEnvelope } from "@/lib/arquiteto/contracts";
import type { DeclaredPlanWithdrawResult } from "@/lib/minerador/declared-plan-withdraw-core";
import type { ApproveAndSendResult } from "@/lib/minerador/approve-and-send-core";

/**
 * "TIRAR DO PLANO" NUMA CONFIRMAÇÃO (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 15, D13).
 *
 * Antes eram três atos em duas áreas: tirar do plano (Minerador), reaprovar e
 * reenviar (Minerador) e "Retirar artigo do Silo" (Arquiteto). A prévia agora
 * lista os efeitos nos dois módulos, e confirmar executa cada passo pelo
 * núcleo do dono, com releitura e estado derivado por passo (retomável):
 *
 *  1. `withdrawFromDeclaredPlanWithCore` (Minerador; plano vN+1) — já fora do
 *     plano (NOT_IN_PLAN) conta como feito ao retomar;
 *  2. o encadeamento único "aprovar → enviar" (item 2) para as keywords que
 *     voltaram a "Em revisão" — quem não puder ser aprovada volta com o motivo;
 *  3. marcado por padrão quando o artigo está num Silo: "retirar o artigo do
 *     Silo" pelo núcleo do Arquiteto (`handleSiloArticleWithdrawal`); sem a
 *     permissão do Arquiteto, os passos do Minerador rodam e a resposta diz o
 *     que ficou para o Arquiteto. Artigo que já saiu do Silo = feito.
 *
 * Orquestração com dependências injetadas: nada aqui escreve sozinho.
 */

export type WithdrawChainDeps = {
  withdraw: (mode: "preview" | "apply", decisionHash?: string | null) => Promise<DeclaredPlanWithdrawResult>;
  /** Aprovar e enviar (o encadeamento do item 2), já com prévia+hash internos. */
  approveAndSend: (keywordIds: readonly string[]) => Promise<ApproveAndSendResult>;
  /** O artigo do Assunto e o Silo onde ele está (ou nulo). */
  locateArticle: () => Promise<{ articleId: string; label: string; siloId: string; isPillar: boolean } | null>;
  /** O Arquiteto pode retirar (edit + approve)? */
  canWithdrawFromSilo: () => Promise<boolean>;
  withdrawFromSilo: (input: { siloId: string; articleId: string; mode: "preview" | "apply" }) => Promise<{ ok: boolean; message: string }>;
};

export type WithdrawChainPreview = {
  mode: "preview";
  minerador: Extract<DeclaredPlanWithdrawResult, { mode: "preview" }>;
  arquiteto: { articleId: string; label: string; siloId: string; canWithdraw: boolean; reason: string | null } | null;
  effects: string[];
  decisionHash: string;
};

export type WithdrawChainStep = { step: "plan" | "approve_and_send" | "silo"; outcome: "done" | "already" | "skipped" | "refused" | "failed"; message: string };

export type WithdrawChainApplied = { mode: "apply"; steps: WithdrawChainStep[]; complete: boolean; message: string };

export async function previewWithdrawChain(deps: WithdrawChainDeps, options: { reapproveAndSend: boolean; withdrawFromSilo: boolean }): Promise<WithdrawChainPreview | Extract<DeclaredPlanWithdrawResult, { ok: false }>> {
  const minerador = await deps.withdraw("preview");
  if (!minerador.ok) return minerador;
  if (minerador.mode !== "preview") throw new Error("A prévia do plano voltou num formato inesperado.");
  const artigo = await deps.locateArticle();
  let arquiteto: WithdrawChainPreview["arquiteto"] = null;
  if (artigo) {
    const pode = await deps.canWithdrawFromSilo();
    const previa = pode ? await deps.withdrawFromSilo({ siloId: artigo.siloId, articleId: artigo.articleId, mode: "preview" }) : { ok: false, message: "Quem confirma não tem a permissão de editar e aprovar no Arquiteto: a retirada do Silo fica para quem tem (Arquiteto → Silos → Retirar artigo do Silo)." };
    arquiteto = { articleId: artigo.articleId, label: artigo.label, siloId: artigo.siloId, canWithdraw: previa.ok, reason: previa.ok ? null : previa.message };
  }
  const effects = [
    ...minerador.effects,
    options.reapproveAndSend
      ? `${minerador.approvedToReview} item(ns) que voltam a "Em revisão" são reaprovados e reenviados ao Arquiteto no mesmo clique (quem não puder ser aprovado volta com o motivo).`
      : `${minerador.approvedToReview} item(ns) ficam em "Em revisão" (reaprovar e enviar depois, no Minerador).`,
    ...(arquiteto
      ? [options.withdrawFromSilo
        ? arquiteto.canWithdraw ? `O artigo “${arquiteto.label}” sai do Silo no Arquiteto (ArticleDNA preservado; as keywords voltam a "não agrupadas").` : `O artigo “${arquiteto.label}” continua no Silo: ${arquiteto.reason}`
        : `O artigo “${arquiteto.label}” continua no Silo (desmarcado).`]
      : ["O artigo não está em Silo no Arquiteto: nada a retirar lá."]),
  ];
  return { mode: "preview", minerador, arquiteto, effects, decisionHash: minerador.decisionHash };
}

export async function applyWithdrawChain(deps: WithdrawChainDeps, input: { decisionHash: string | null; reapproveAndSend: boolean; withdrawFromSilo: boolean; reviewKeywordIds: readonly string[] }): Promise<WithdrawChainApplied> {
  const steps: WithdrawChainStep[] = [];
  // 1 · o plano (Minerador)
  const plano = await deps.withdraw("apply", input.decisionHash);
  if (plano.ok && plano.mode === "apply") steps.push({ step: "plan", outcome: "done", message: `Plano v${plano.planVersion} gravado e relido.${plano.notices.length ? ` ${plano.notices.join(" ")}` : ""}` });
  else if (!plano.ok && plano.code === "NOT_IN_PLAN") steps.push({ step: "plan", outcome: "already", message: "O artigo já estava fora do plano (retomada)." });
  else {
    steps.push({ step: "plan", outcome: "refused", message: plano.ok ? "Resposta inesperada do plano." : plano.reason });
    return { mode: "apply", steps, complete: false, message: `Nada foi feito: ${steps[0].message}` };
  }
  // 2 · reaprovar e reenviar (o encadeamento único)
  if (input.reapproveAndSend && input.reviewKeywordIds.length) {
    try {
      const resultado = await deps.approveAndSend(input.reviewKeywordIds);
      const foram = resultado.counts.approved_and_sent + resultado.counts.sent;
      const naoForam = resultado.results.filter(line => !["approved_and_sent", "sent", "unchanged"].includes(line.outcome));
      steps.push({ step: "approve_and_send", outcome: naoForam.length ? "refused" : "done", message: `${foram} keyword(s) reaprovada(s) e enviada(s)${naoForam.length ? `; ${naoForam.map(line => `“${line.keyword}”: ${line.reason || line.outcome}`).join("; ")}` : ""}.` });
    } catch (error) {
      steps.push({ step: "approve_and_send", outcome: "failed", message: `A reaprovação não foi feita: ${error instanceof Error ? error.message : "falha"}. O plano já foi gravado; aprove e envie pelo Minerador.` });
    }
  } else steps.push({ step: "approve_and_send", outcome: "skipped", message: "Reaprovar e reenviar ficou para depois (desmarcado ou nada voltou a Em revisão)." });
  // 3 · retirar do Silo (Arquiteto)
  if (input.withdrawFromSilo) {
    const artigo = await deps.locateArticle();
    if (!artigo) steps.push({ step: "silo", outcome: "already", message: "O artigo não está em Silo no Arquiteto." });
    else if (!(await deps.canWithdrawFromSilo())) steps.push({ step: "silo", outcome: "skipped", message: "Sem a permissão do Arquiteto: a retirada do Silo fica para quem tem (Arquiteto → Silos → Retirar artigo do Silo)." });
    else {
      try {
        const retirada = await deps.withdrawFromSilo({ siloId: artigo.siloId, articleId: artigo.articleId, mode: "apply" });
        steps.push({ step: "silo", outcome: retirada.ok ? "done" : "refused", message: retirada.message });
      } catch (error) {
        steps.push({ step: "silo", outcome: "failed", message: `A retirada do Silo não foi confirmada: ${error instanceof Error ? error.message : "falha"}. Repita “Tirar do plano”: os passos feitos não se repetem.` });
      }
    }
  } else steps.push({ step: "silo", outcome: "skipped", message: "O artigo continua no Silo (desmarcado)." });
  const complete = steps.every(step => step.outcome === "done" || step.outcome === "already" || step.outcome === "skipped");
  return { mode: "apply", steps, complete, message: steps.map(step => step.message).join(" ") };
}

/** O artigo do Assunto e o Silo vigente que o contém. */
export function locateSubjectArticle(input: { subjectKeywordId: string; articleDnas: readonly VersionEnvelope<ArticleDNA>[]; siloDnas: readonly VersionEnvelope<SiloDNA>[] }): { articleId: string; label: string; siloId: string; isPillar: boolean } | null {
  const artigos = input.articleDnas.filter(version => version.payload.subject?.keywordId === input.subjectKeywordId || version.payload.principalKeywordId === input.subjectKeywordId);
  const maisNovo = artigos.reduce<VersionEnvelope<ArticleDNA> | null>((atual, version) => (!atual || version.versionNumber > atual.versionNumber ? version : atual), null);
  if (!maisNovo) return null;
  const articleId = maisNovo.payload.articleId;
  const vigentes = new Map<string, VersionEnvelope<SiloDNA>>();
  for (const version of input.siloDnas) {
    const atual = vigentes.get(version.payload.siloId);
    if (!atual || version.versionNumber > atual.versionNumber) vigentes.set(version.payload.siloId, version);
  }
  for (const silo of vigentes.values()) {
    const pilar = silo.payload.pillarArticleId === articleId;
    if (pilar || silo.payload.supportArticleIds.includes(articleId)) {
      return { articleId, label: maisNovo.payload.subject?.phrase || maisNovo.payload.promise || articleId, siloId: silo.payload.siloId, isPillar: pilar };
    }
  }
  return null;
}
