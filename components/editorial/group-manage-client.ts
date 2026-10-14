"use client";

import { followEditorialGroupColorChange, refreshBrandEditorialGroups } from "@/components/editorial/editorial-group-area-store";
import { EDITORIAL_GROUP_AREAS, type EditorialGroupColor, type EditorialGroupSummary } from "@/lib/editorial/editorial-groups";
import type { GroupHistoryEntry } from "@/lib/editorial/group-history";
import type { DeclaredPlanArticleView, DeclaredPlanGroupView } from "@/lib/minerador/declared-plan-withdraw-core";
import { GROUP_DELETE_ALL_DONE_EVENT, type GroupDeleteAllDoneDetail, type GroupDeleteAllPreview, type GroupDeleteAllTyped } from "@/lib/minerador/group-delete-all";
import type { GroupDeleteAllApplyResult } from "@/lib/minerador/group-delete-all-core";

/**
 * GERENCIAR A COR, HISTÓRICO DO GRUPO E TIRAR DO PLANO — chamadas da tela
 * (2026-10-12). Nada aqui roda no carregamento da área: cada função é chamada
 * por um clique (abrir o histórico, gravar, gerar a prévia).
 *
 * Sucesso só depois da releitura: o servidor relê o que gravou, e a tela relê
 * a lista de grupos da marca e confere o grupo nela antes de dizer "feito".
 */

type Json = Record<string, unknown>;

async function chamar(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: Json }> {
  const response = await fetch(url, { cache: "no-store", ...init }).catch(() => null);
  const body = response ? await response.json().catch(() => ({})) as Json : {};
  return { ok: Boolean(response && response.ok && body.success === true), status: response?.status ?? 0, body };
}

const mensagem = (body: Json, padrao: string) => (typeof body.message === "string" && body.message ? body.message : padrao);

export type ManageColorGroupResponse =
  | { ok: true; action: "edit" | "release"; group: EditorialGroupSummary; summary: string[]; confirmed: boolean }
  | { ok: false; code: string; message: string };

/**
 * "Gerenciar" uma cor: nome (opcional), trocar para uma cor livre ou liberar.
 * Depois de gravar, relê a lista de grupos e confere o grupo nela; ao trocar a
 * cor, a escolha das áreas que olhavam a cor antiga acompanha o grupo.
 */
export async function manageEditorialColorGroup(brandId: string, input: {
  group: Pick<EditorialGroupSummary, "id" | "color" | "lockVersion">;
  name?: string | null;
  color?: EditorialGroupColor;
  release?: boolean;
}): Promise<ManageColorGroupResponse> {
  const { ok, body } = await chamar("/api/editorial/groups", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      marcaId: brandId,
      groupId: input.group.id,
      lockVersion: input.group.lockVersion,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.release ? { release: true } : {}),
    }),
  });
  const group = body.group as EditorialGroupSummary | undefined;
  if (!ok || !group || group.marcaId !== brandId || group.id !== input.group.id) {
    return { ok: false, code: typeof body.code === "string" ? body.code : "GROUP_MANAGE_FAILED", message: mensagem(body, "Não foi possível gravar a mudança no grupo.") };
  }
  const relida = await refreshBrandEditorialGroups(brandId);
  const naLista = relida.groups.find(item => item.id === group.id);
  const confirmed = relida.status === "ready" && Boolean(naLista) && naLista!.name === group.name && naLista!.color === group.color && naLista!.status === group.status;
  if (input.color && input.color !== input.group.color && group.color === input.color) followEditorialGroupColorChange(brandId, input.group.color, input.color, EDITORIAL_GROUP_AREAS);
  return { ok: true, action: body.action === "release" ? "release" : "edit", group, summary: Array.isArray(body.summary) ? body.summary.filter((item): item is string => typeof item === "string") : [], confirmed };
}

export type GroupHistoryResponse =
  | { ok: true; entries: GroupHistoryEntry[]; ledgerRead: boolean; viewerUserId: string | null }
  | { ok: false; message: string };

/** "Histórico do grupo": só quando o dono abre (nunca no carregamento da área). */
export async function loadEditorialGroupHistory(brandId: string, groupIds: readonly string[]): Promise<GroupHistoryResponse> {
  if (!groupIds.length) return { ok: true, entries: [], ledgerRead: true, viewerUserId: null };
  const query = new URLSearchParams({ marcaId: brandId });
  for (const id of groupIds.slice(0, 10)) query.append("groupId", id);
  const { ok, body } = await chamar(`/api/editorial/groups/history?${query.toString()}`);
  if (!ok || !Array.isArray(body.entries)) return { ok: false, message: mensagem(body, "Não foi possível ler o histórico do grupo agora.") };
  return { ok: true, entries: body.entries as GroupHistoryEntry[], ledgerRead: body.ledgerRead !== false, viewerUserId: typeof body.viewerUserId === "string" ? body.viewerUserId : null };
}

export type DeclaredPlanListResponse =
  | { ok: true; group: DeclaredPlanGroupView; articles: DeclaredPlanArticleView[] }
  | { ok: false; code: string; message: string };

export async function loadDeclaredPlanArticles(brandId: string, groupId: string): Promise<DeclaredPlanListResponse> {
  const { ok, body } = await chamar(`/api/minerador/marcas/${encodeURIComponent(brandId)}/plans/withdraw?groupId=${encodeURIComponent(groupId)}`);
  if (!ok || !Array.isArray(body.articles) || !body.group) return { ok: false, code: typeof body.code === "string" ? body.code : "PLAN_READ_FAILED", message: mensagem(body, "Não foi possível ler o plano do grupo.") };
  return { ok: true, group: body.group as DeclaredPlanGroupView, articles: body.articles as DeclaredPlanArticleView[] };
}

export type DeclaredPlanWithdrawPreview = {
  group: DeclaredPlanGroupView;
  article: DeclaredPlanArticleView;
  remainingArticles: number;
  nextPlanVersion: number;
  approvedToReview: number;
  effects: string[];
  decisionHash: string;
  /** SDD acelerar 2026-10-13, item 15: os efeitos nos dois módulos (com `chain`). */
  chain?: { effects: string[]; arquiteto: { articleId: string; label: string; siloId: string; canWithdraw: boolean; reason: string | null } | null };
};

/** "Tirar do plano" numa confirmação (item 15): reaprovar+enviar e retirar do Silo, marcados por padrão. */
export type DeclaredPlanWithdrawChainOptions = { reapproveAndSend: boolean; withdrawFromSilo: boolean };
export type DeclaredPlanWithdrawChainStep = { step: "plan" | "approve_and_send" | "silo"; outcome: "done" | "already" | "skipped" | "refused" | "failed"; message: string };

export async function previewDeclaredPlanWithdraw(brandId: string, groupId: string, subjectKeywordId: string, chain?: DeclaredPlanWithdrawChainOptions): Promise<{ ok: true; preview: DeclaredPlanWithdrawPreview } | { ok: false; code: string; message: string }> {
  const { ok, body } = await chamar(`/api/minerador/marcas/${encodeURIComponent(brandId)}/plans/withdraw`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ groupId, subjectKeywordId, mode: "preview", ...(chain ? { chain } : {}) }),
  });
  if (!ok || typeof body.decisionHash !== "string") return { ok: false, code: typeof body.code === "string" ? body.code : "PLAN_PREVIEW_FAILED", message: mensagem(body, "Não foi possível montar a prévia.") };
  return { ok: true, preview: body as unknown as DeclaredPlanWithdrawPreview };
}

export async function applyDeclaredPlanWithdraw(brandId: string, groupId: string, subjectKeywordId: string, decisionHash: string): Promise<{ ok: true; planVersion: number; notices: string[] } | { ok: false; code: string; message: string }> {
  const { ok, body } = await chamar(`/api/minerador/marcas/${encodeURIComponent(brandId)}/plans/withdraw`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ groupId, subjectKeywordId, mode: "apply", decisionHash }),
  });
  const readback = body.readback as { subjectPlanRemoved?: unknown } | undefined;
  if (!ok || readback?.subjectPlanRemoved !== true || typeof body.planVersion !== "number") return { ok: false, code: typeof body.code === "string" ? body.code : "PLAN_WITHDRAW_FAILED", message: mensagem(body, "A retirada não foi confirmada.") };
  void refreshBrandEditorialGroups(brandId);
  return { ok: true, planVersion: body.planVersion, notices: Array.isArray(body.notices) ? body.notices.filter((item): item is string => typeof item === "string") : [] };
}

/** Item 15: aplica a sequência inteira (cada passo pelo núcleo do dono, com releitura). */
export async function applyDeclaredPlanWithdrawChain(brandId: string, groupId: string, subjectKeywordId: string, decisionHash: string, chain: DeclaredPlanWithdrawChainOptions): Promise<{ ok: true; steps: DeclaredPlanWithdrawChainStep[]; complete: boolean } | { ok: false; code: string; message: string }> {
  const { ok, body } = await chamar(`/api/minerador/marcas/${encodeURIComponent(brandId)}/plans/withdraw`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ groupId, subjectKeywordId, mode: "apply", decisionHash, chain }),
  });
  const resultado = body.chain as { steps?: unknown; complete?: unknown } | undefined;
  if (!ok || !resultado || !Array.isArray(resultado.steps)) return { ok: false, code: typeof body.code === "string" ? body.code : "PLAN_WITHDRAW_FAILED", message: mensagem(body, "A sequência não foi confirmada.") };
  void refreshBrandEditorialGroups(brandId);
  return { ok: true, steps: resultado.steps as DeclaredPlanWithdrawChainStep[], complete: resultado.complete === true };
}

/* ===================== EXCLUIR TUDO DA COR (F7, SDD 2026-10-13 item 6) ===================== */

export type GroupDeleteAllRefusalResponse = { ok: false; code: string; message: string; preview?: GroupDeleteAllPreview; decisionHash?: string; missing?: string[] };

const rotaExcluirCor = (brandId: string) => `/api/minerador/marcas/${encodeURIComponent(brandId)}/keywords/delete-group`;

function recusaExcluirCor(body: Json, padrao: string): GroupDeleteAllRefusalResponse {
  return {
    ok: false,
    code: typeof body.code === "string" ? body.code : "GROUP_DELETE_FAILED",
    message: mensagem(body, padrao),
    ...(body.preview && typeof body.decisionHash === "string" ? { preview: body.preview as GroupDeleteAllPreview, decisionHash: body.decisionHash } : {}),
    ...(Array.isArray(body.missing) ? { missing: body.missing.filter((item): item is string => typeof item === "string") } : {}),
  };
}

/** A prévia (grátis, só leitura): nada é excluído. */
export async function previewGroupDeleteAll(brandId: string, groupId: string, includePublished: boolean): Promise<{ ok: true; preview: GroupDeleteAllPreview; decisionHash: string } | GroupDeleteAllRefusalResponse> {
  const { ok, body } = await chamar(rotaExcluirCor(brandId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ groupId, mode: "preview", includePublished }),
  });
  if (!ok || !body.preview || typeof body.decisionHash !== "string") return recusaExcluirCor(body, "A prévia não pôde ser montada agora. Nada foi excluído.");
  return { ok: true, preview: body.preview as GroupDeleteAllPreview, decisionHash: body.decisionHash };
}

/**
 * Executa a decisão tomada sobre a prévia (confirmação forte digitada). Depois
 * da resposta RELIDA do servidor: relê a lista de grupos da marca e avisa a
 * planilha do Minerador (evento da janela) para tirar as linhas que saíram.
 */
export async function applyGroupDeleteAll(brandId: string, groupId: string, input: { includePublished: boolean; decisionHash: string; typed: GroupDeleteAllTyped }): Promise<{ ok: true; result: GroupDeleteAllApplyResult } | GroupDeleteAllRefusalResponse> {
  const { ok, body } = await chamar(rotaExcluirCor(brandId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ groupId, mode: "apply", includePublished: input.includePublished, decisionHash: input.decisionHash, typed: input.typed }),
  });
  if (!ok || body.mode !== "apply" || !Array.isArray(body.blocks)) return recusaExcluirCor(body, "A exclusão não foi confirmada. Gere a prévia de novo.");
  const result = body as unknown as GroupDeleteAllApplyResult;
  void refreshBrandEditorialGroups(brandId);
  if (typeof window !== "undefined" && (result.hardDeletedIds.length || result.recoverableIds.length)) {
    const detail: GroupDeleteAllDoneDetail = { brandId, groupId, hardDeletedIds: result.hardDeletedIds, recoverableIds: result.recoverableIds };
    window.dispatchEvent(new CustomEvent(GROUP_DELETE_ALL_DONE_EVENT, { detail }));
  }
  return { ok: true, result };
}
