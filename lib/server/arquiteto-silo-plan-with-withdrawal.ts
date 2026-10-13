import "server-only";

import { createHash } from "node:crypto";
import { stableJson } from "@/lib/arquiteto/silo-declared-plan-application";
import type { SiloDNA, VersionEnvelope } from "@/lib/arquiteto/contracts";
import { handleSiloDeclaredPlan, type SiloDeclaredPlanApplied, type SiloDeclaredPlanDeps, type SiloDeclaredPlanPreview, type SiloDeclaredPlanResult } from "./arquiteto-silo-declared-plan";
import { handleSiloArticleWithdrawal, type SiloArticleWithdrawalDeps, type SiloArticleWithdrawalResult } from "./arquiteto-silo-article-withdrawal";

/**
 * "APLICAR O PLANO AO SILO" JÁ COM A RETIRADA (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 10, D10).
 *
 * Antes, o artigo fora do plano recusava a aplicação ("Retire pelo 'Retirar
 * artigo do Silo' antes") e eram dois atos com duas prévias. Agora a prévia
 * lista os artigos fora do plano com "retirar do Silo" marcado e mostra o
 * plano como ele ficará depois da retirada. UM `decisionHash` cobre os dois.
 *
 * Aplicar: a retirada pelo núcleo de sempre (`handleSiloArticleWithdrawal`:
 * evento `rejected`, par v+1, releitura; ArticleDNA preservado, keywords de
 * volta a "não agrupadas"), artigo a artigo; só com TODAS confirmadas o plano é
 * aplicado pelo núcleo de sempre (`handleSiloDeclaredPlan`: par v+2, releitura).
 * Falha numa retirada para tudo: o plano não é aplicado e a resposta diz o que
 * ficou feito. Desmarcar um artigo = a recusa de hoje (nada é gravado).
 * Cada núcleo registra a sua linha na guarda de retrabalho.
 */

export const PLAN_WITHDRAWAL_REASON = "Fora do plano declarado do grupo: retirado ao aplicar o plano ao Silo." as const;

export type PlanWithWithdrawalRequest = {
  siloId: string;
  mode: "preview" | "apply";
  /** Os artigos fora do plano que a pessoa deixou marcados para retirar. Ausente = todos. */
  withdrawArticleIds?: string[] | null;
  decisionHash?: string | null;
};

export type PlanWithdrawalLine = { articleId: string; label: string; ok: boolean; reason: string | null; changes: string[]; warnings: string[] };

export type PlanWithWithdrawalPreview = {
  mode: "preview";
  state: "WITHDRAW_THEN_APPLY";
  siloId: string;
  decisionHash: string;
  withdrawals: PlanWithdrawalLine[];
  /** O plano como fica DEPOIS da retirada (simulado; nada gravado). */
  plan: Pick<SiloDeclaredPlanPreview, "siloName" | "pillar" | "narrativeOrder" | "changes" | "warnings"> | null;
  planRefusal: string | null;
};

export type PlanWithWithdrawalApplied = {
  mode: "apply";
  state: "APPLIED" | "STOPPED";
  siloId: string;
  withdrawals: Array<{ articleId: string; outcome: "withdrawn" | "refused" | "failed"; message: string | null }>;
  plan: SiloDeclaredPlanApplied | null;
  message: string;
};

export type PlanWithWithdrawalResult = SiloDeclaredPlanResult | PlanWithWithdrawalPreview | PlanWithWithdrawalApplied;

const hash = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");

function latestSilo(versions: readonly VersionEnvelope<SiloDNA>[], siloId: string) {
  return versions.filter(version => version.payload.siloId === siloId).reduce<VersionEnvelope<SiloDNA> | null>((atual, version) => (!atual || version.versionNumber > atual.versionNumber ? version : atual), null);
}

/** O SiloDNA vigente sem os artigos retirados — só para simular a prévia do plano. */
function withoutArticles(silo: VersionEnvelope<SiloDNA>, ids: ReadonlySet<string>): VersionEnvelope<SiloDNA> {
  return {
    ...silo,
    payload: {
      ...silo.payload,
      pillarArticleId: silo.payload.pillarArticleId && ids.has(silo.payload.pillarArticleId) ? null : silo.payload.pillarArticleId,
      supportArticleIds: silo.payload.supportArticleIds.filter(id => !ids.has(id)),
      articleReferences: silo.payload.articleReferences.filter(reference => !ids.has(reference.articleId)),
    } as SiloDNA,
  };
}

async function montarPrevia(planDeps: SiloDeclaredPlanDeps, withdrawalDeps: SiloArticleWithdrawalDeps, request: PlanWithWithdrawalRequest): Promise<SiloDeclaredPlanResult | PlanWithWithdrawalPreview> {
  // A prévia de sempre (com o aviso da guarda de retrabalho; prévia não grava linha da guarda).
  const direto = await handleSiloDeclaredPlan(planDeps, { siloId: request.siloId, mode: "preview" });
  if (direto.state !== "REFUSED" || direto.code !== "NON_PLAN_ARTICLES" || !direto.articleIds?.length) return direto;
  const fora = direto.articleIds;
  const marcados = new Set(request.withdrawArticleIds ?? fora);
  const withdrawals: PlanWithdrawalLine[] = [];
  for (const articleId of fora) {
    const previa = await handleSiloArticleWithdrawal({ ...withdrawalDeps, rework: undefined }, { siloId: request.siloId, articleId, reason: PLAN_WITHDRAWAL_REASON, mode: "preview" });
    withdrawals.push(previa.state === "REFUSED"
      ? { articleId, label: articleId, ok: false, reason: previa.message, changes: [], warnings: [] }
      : { articleId, label: previa.mode === "preview" ? previa.article.label : articleId, ok: true, reason: null, changes: previa.mode === "preview" ? previa.changes : [], warnings: previa.mode === "preview" ? previa.warnings : [] });
  }
  const inputs = await planDeps.readInputs();
  const silo = latestSilo(inputs.siloDnas, request.siloId);
  const retirar = new Set(fora.filter(id => marcados.has(id)));
  let plan: PlanWithWithdrawalPreview["plan"] = null;
  let planRefusal: string | null = null;
  if (silo) {
    const simulado = await handleSiloDeclaredPlan({
      ...planDeps,
      rework: undefined,
      readInputs: async () => ({ ...inputs, siloDnas: [...inputs.siloDnas.filter(version => version.versionId !== silo.versionId), withoutArticles(silo, retirar)] }),
    }, { siloId: request.siloId, mode: "preview" });
    if (simulado.state === "REFUSED") planRefusal = simulado.message;
    else if (simulado.mode === "preview") plan = { siloName: simulado.siloName, pillar: simulado.pillar, narrativeOrder: simulado.narrativeOrder, changes: simulado.changes, warnings: simulado.warnings };
  } else planRefusal = "Este Silo não tem SiloDNA nesta marca.";
  const decisionHash = hash({
    contract: "plan-with-withdrawal@1",
    siloId: request.siloId,
    siloDnaVersionId: silo?.versionId ?? null,
    withdraw: [...retirar].sort(),
    articleVersions: inputs.articleDnas.filter(version => retirar.has(version.payload.articleId)).map(version => version.versionId).sort(),
    plan,
  });
  return { mode: "preview", state: "WITHDRAW_THEN_APPLY", siloId: request.siloId, decisionHash, withdrawals, plan, planRefusal };
}

export async function handleSiloDeclaredPlanWithWithdrawal(
  planDeps: SiloDeclaredPlanDeps,
  withdrawalDeps: SiloArticleWithdrawalDeps,
  request: PlanWithWithdrawalRequest,
): Promise<PlanWithWithdrawalResult> {
  const previa = await montarPrevia(planDeps, withdrawalDeps, request);
  // Sem artigo fora do plano: é o "Aplicar o plano" de sempre.
  if (previa.state !== "WITHDRAW_THEN_APPLY") {
    if (request.mode === "preview" || previa.state === "REFUSED") return previa;
    return handleSiloDeclaredPlan(planDeps, { siloId: request.siloId, mode: "apply", decisionHash: request.decisionHash ?? null });
  }
  if (request.mode === "preview") return previa;
  if (!request.decisionHash || request.decisionHash !== previa.decisionHash) {
    return { state: "REFUSED", code: "STALE_DECISION", message: "O Silo, os artigos ou o plano mudaram desde a prévia (ou a prévia não foi vista). Abra a prévia de novo." };
  }
  const marcados = new Set(request.withdrawArticleIds ?? previa.withdrawals.map(line => line.articleId));
  const naoRetirados = previa.withdrawals.filter(line => !marcados.has(line.articleId));
  if (naoRetirados.length) {
    return { state: "REFUSED", code: "NON_PLAN_ARTICLES", message: `Fora do plano e desmarcado: ${naoRetirados.map(line => `“${line.label}”`).join(", ")}. O plano só vale com o Silo inteiro do plano; nada foi gravado.` };
  }
  if (previa.planRefusal) return { state: "REFUSED", code: "PLAN_NOT_APPLICABLE", message: `${previa.planRefusal} Nada foi gravado.` };
  const bloqueadas = previa.withdrawals.filter(line => !line.ok);
  if (bloqueadas.length) return { state: "REFUSED", code: "NON_PLAN_ARTICLES", message: `A retirada não é possível: ${bloqueadas.map(line => `“${line.label}” (${line.reason})`).join("; ")}. Nada foi gravado.` };

  const feitas: PlanWithWithdrawalApplied["withdrawals"] = [];
  for (const line of previa.withdrawals) {
    let resultado: SiloArticleWithdrawalResult;
    try {
      resultado = await handleSiloArticleWithdrawal(withdrawalDeps, { siloId: request.siloId, articleId: line.articleId, reason: PLAN_WITHDRAWAL_REASON, mode: "apply" });
    } catch (error) {
      feitas.push({ articleId: line.articleId, outcome: "failed", message: error instanceof Error ? error.message : "falha sem mensagem" });
      return { mode: "apply", state: "STOPPED", siloId: request.siloId, withdrawals: feitas, plan: null, message: `A retirada de “${line.label}” falhou; o plano NÃO foi aplicado. ${feitas.filter(item => item.outcome === "withdrawn").length} retirada(s) anterior(es) ficaram gravadas (o Silo segue válido). Abra a prévia de novo.` };
    }
    if (resultado.state === "REFUSED") {
      feitas.push({ articleId: line.articleId, outcome: "refused", message: resultado.message });
      return { mode: "apply", state: "STOPPED", siloId: request.siloId, withdrawals: feitas, plan: null, message: `A retirada de “${line.label}” foi recusada: ${resultado.message} O plano NÃO foi aplicado.` };
    }
    feitas.push({ articleId: line.articleId, outcome: "withdrawn", message: null });
  }
  // Com as retiradas relidas, o plano pelo núcleo de sempre (prévia vigente → aplicar com o hash dela).
  const previaDoPlano = await handleSiloDeclaredPlan({ ...planDeps, rework: undefined }, { siloId: request.siloId, mode: "preview" });
  if (previaDoPlano.state === "REFUSED" || previaDoPlano.mode !== "preview") {
    return { mode: "apply", state: "STOPPED", siloId: request.siloId, withdrawals: feitas, plan: null, message: `Retirada(s) feita(s), mas o plano não pôde ser aplicado: ${previaDoPlano.state === "REFUSED" ? previaDoPlano.message : "estado inesperado"}.` };
  }
  const aplicado = await handleSiloDeclaredPlan(planDeps, { siloId: request.siloId, mode: "apply", decisionHash: previaDoPlano.decisionHash });
  if (aplicado.state !== "APPLIED") {
    return { mode: "apply", state: "STOPPED", siloId: request.siloId, withdrawals: feitas, plan: null, message: `Retirada(s) feita(s), mas o plano não foi aplicado: ${"message" in aplicado ? aplicado.message : "sem mudança"}.` };
  }
  return { mode: "apply", state: "APPLIED", siloId: request.siloId, withdrawals: feitas, plan: aplicado, message: `${feitas.length} artigo(s) retirado(s) do Silo e o plano aplicado (Pilar “${aplicado.pillar.label}”). Processe os links de novo neste Silo.` };
}
