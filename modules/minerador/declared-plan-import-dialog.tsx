"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, ListOrdered, Loader2, X } from "lucide-react";
import { GLOBAL_TOPBAR_ACTION_CONTROL } from "@/components/global-topbar-control";
import { internalButton, internalButtonPrimary, internalField } from "@/components/editorial/internal-page-visual";
import { EditorialGroupDot, EditorialGroupTag } from "@/components/editorial/group-tag";
import {
  EDITORIAL_GROUP_COLORS,
  EDITORIAL_GROUP_COLOR_CLASSES,
  EDITORIAL_GROUP_COLOR_LABELS,
  EDITORIAL_GROUP_NAME_MAX,
  editorialGroupCountLabel,
  type EditorialGroupColor,
  type EditorialGroupSummary,
} from "@/lib/editorial/editorial-groups";
import type { DeclaredPlanApplyArticle, DeclaredPlanPreview } from "@/lib/minerador/declared-plan-import-core";

/**
 * IMPORTAR PLANO DO SILO — a tela (SDD 2026-10-12 §9 item 4, F4).
 *
 * A tela não grava nada sozinha: fala só com a rota
 * `POST /api/minerador/marcas/[brandId]/plans/import`, o mesmo núcleo do MCP.
 *
 *   1. "Gerar prévia" (`mode: "preview"`) não escreve nada; cada prévia ganha
 *      um `importRequestId` novo, gerado uma vez;
 *   2. "Declarar plano" (`mode: "apply"`) manda o MESMO texto e o MESMO grupo
 *      da prévia, com esse `importRequestId`, e só fica habilitado com
 *      `canApply`;
 *   3. qualquer mudança no texto ou no grupo descarta a prévia (é preciso
 *      gerar outra antes de declarar);
 *   4. o resultado só aparece depois da resposta do `apply` (a rota relê e
 *      confere a reciprocidade); a planilha é relida pelo `onApplied`.
 *
 * `409 GROUPS_NOT_AVAILABLE` (migration dos grupos ausente) esconde o recurso.
 */

const PLAN_IMPORT_ROUTE = (brandId: string) => `/api/minerador/marcas/${encodeURIComponent(brandId)}/plans/import`;

const PLAN_TEXT_PLACEHOLDER = [
  "Silo 1 — Planos de internet, preços e contratação",
  "Nome: Planos e contratação",
  "Slug: /planos-de-internet/",
  "Objetivo: Ajudar quem vai contratar internet a escolher o plano certo.",
  "",
  "1. Como escolher o melhor plano de internet residencial",
  "Artigo pilar • Palavra-chave: melhor plano de internet residencial",
  "Descrição do que o artigo cobre, numa linha só.",
  "",
  "2. Título do artigo 2",
  "Palavra-chave: principal do artigo 2",
  "Descrição do artigo 2.",
].join("\n");

type GroupChoice = { mode: "existing"; groupId: string } | { mode: "new"; name: string | null; color: EditorialGroupColor };
type PlanRequest = { text: string; group: GroupChoice };

type ApplyResult = {
  groupId: string;
  planVersion: number;
  articles: DeclaredPlanApplyArticle[];
  createdSubjectIds: string[];
  createdPrincipalIds: string[];
  supportsStamped: number;
  reciprocityConfirmed: number;
  failed: number;
  notices: string[];
};

type Refusal = { code: string; message: string; blockers: string[] };

/** Os ids que a tela relê depois do `apply` (mesmo caminho do import de Assuntos). */
export type DeclaredPlanAppliedIds = {
  subjectIds: string[];
  createdSubjectIds: string[];
  principalIds: string[];
};

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

async function postPlanImport(brandId: string, body: Record<string, unknown>): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; refusal: Refusal }> {
  const response = await fetch(PLAN_IMPORT_ROUTE(brandId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
  if (!response || !response.ok || data.success !== true) {
    const diagnostic = data.diagnostic && typeof data.diagnostic === "object" ? data.diagnostic as Record<string, unknown> : {};
    return {
      ok: false,
      refusal: {
        code: typeof data.code === "string" ? data.code : response ? `HTTP_${response.status}` : "NETWORK_ERROR",
        message: typeof data.message === "string" ? data.message : response ? "O plano do Silo não pôde ser importado agora." : "Sem conexão com o servidor. Nada foi gravado.",
        blockers: strings(diagnostic.blockers),
      },
    };
  }
  return { ok: true, body: data };
}

/** O botão ao lado de "Colar keywords" e "Importar CSV" (mesma geometria compacta). */
export function DeclaredPlanImportButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={GLOBAL_TOPBAR_ACTION_CONTROL} onClick={onClick} aria-label="Importar plano do Silo" title="Importar plano do Silo" data-minerador-declared-plan-import>
      <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden xl:inline">Importar plano do Silo</span>
    </button>
  );
}

export function DeclaredPlanImportDialog({
  brandId,
  groups,
  onClose,
  onApplied,
  onUnavailable,
}: {
  brandId: string;
  /** Os grupos ATIVOS da marca, para "Grupo existente". */
  groups: readonly EditorialGroupSummary[];
  onClose: () => void;
  onApplied: (applied: DeclaredPlanAppliedIds) => void;
  /** A rota respondeu GROUPS_NOT_AVAILABLE: o recurso some da tela. */
  onUnavailable: () => void;
}) {
  const [text, setText] = useState("");
  const [groupMode, setGroupMode] = useState<"new" | "existing">("new");
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [color, setColor] = useState<EditorialGroupColor>(EDITORIAL_GROUP_COLORS[0]);
  const [phase, setPhase] = useState<"idle" | "previewing" | "applying">("idle");
  const [preview, setPreview] = useState<{ request: PlanRequest; importRequestId: string; result: DeclaredPlanPreview } | null>(null);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const ids = { text: useId(), name: useId(), title: useId() };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Mudou o texto ou o grupo: a prévia anterior não vale mais. */
  const invalidate = () => {
    setPreview(null);
    setApplied(null);
    setRefusal(null);
  };

  const currentRequest = (): PlanRequest | null => {
    if (!text.trim()) return null;
    if (groupMode === "existing") return groupId ? { text, group: { mode: "existing", groupId } } : null;
    return { text, group: { mode: "new", name: newName.trim() || null, color } };
  };

  const handlePreview = async (event?: FormEvent) => {
    event?.preventDefault();
    const request = currentRequest();
    if (!request || busyRef.current) return;
    busyRef.current = true;
    setPhase("previewing");
    setRefusal(null);
    setApplied(null);
    setPreview(null);
    try {
      const answer = await postPlanImport(brandId, { mode: "preview", text: request.text, group: request.group });
      if (!mountedRef.current) return;
      if (!answer.ok) {
        if (answer.refusal.code === "GROUPS_NOT_AVAILABLE") { onUnavailable(); onClose(); return; }
        setRefusal(answer.refusal);
        return;
      }
      const result = answer.body as unknown as DeclaredPlanPreview & { mode?: unknown };
      if (result.mode !== "preview" || !Array.isArray(result.articles)) {
        setRefusal({ code: "UNEXPECTED_RESPONSE", message: "A prévia voltou num formato inesperado. Nada foi gravado.", blockers: [] });
        return;
      }
      // Padrão do nome do grupo novo = o nome do Silo (o mesmo que a rota já usou na prévia).
      const resolvedRequest: PlanRequest = request.group.mode === "new" && !request.group.name && result.group.mode === "new" && result.group.name
        ? { text: request.text, group: { ...request.group, name: result.group.name } }
        : request;
      if (resolvedRequest !== request && resolvedRequest.group.mode === "new") setNewName(resolvedRequest.group.name || "");
      setPreview({ request: resolvedRequest, importRequestId: crypto.randomUUID(), result });
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setPhase("idle");
    }
  };

  const handleApply = async () => {
    if (!preview || !preview.result.canApply || applied || busyRef.current) return;
    busyRef.current = true;
    setPhase("applying");
    setRefusal(null);
    try {
      const answer = await postPlanImport(brandId, {
        mode: "apply",
        text: preview.request.text,
        group: preview.request.group,
        importRequestId: preview.importRequestId,
      });
      if (!mountedRef.current) return;
      if (!answer.ok) {
        if (answer.refusal.code === "GROUPS_NOT_AVAILABLE") { onUnavailable(); onClose(); return; }
        setRefusal(answer.refusal);
        return;
      }
      const body = answer.body;
      if (body.mode !== "apply" || !Array.isArray(body.articles)) {
        setRefusal({ code: "UNEXPECTED_RESPONSE", message: "A resposta da gravação veio num formato inesperado. Confira a planilha antes de repetir.", blockers: [] });
        return;
      }
      const result: ApplyResult = {
        groupId: typeof body.groupId === "string" ? body.groupId : "",
        planVersion: count(body.planVersion),
        articles: body.articles as DeclaredPlanApplyArticle[],
        createdSubjectIds: strings(body.createdSubjectIds),
        createdPrincipalIds: strings(body.createdPrincipalIds),
        supportsStamped: count(body.supportsStamped),
        reciprocityConfirmed: count(body.reciprocityConfirmed),
        failed: count(body.failed),
        notices: strings(body.notices),
      };
      setApplied(result);
      const subjectIds = [...new Set(result.articles.map(article => article.subjectKeywordId).filter((id): id is string => Boolean(id)))];
      const principalIds = [...new Set(result.articles.map(article => article.principalKeywordId).filter((id): id is string => Boolean(id)))];
      onApplied({ subjectIds, createdSubjectIds: result.createdSubjectIds, principalIds });
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setPhase("idle");
    }
  };

  const busy = phase !== "idle";
  const canPreview = !busy && Boolean(currentRequest());
  const result = preview?.result ?? null;
  const declaredCount = applied ? applied.articles.filter(article => article.outcome === "declared").length : 0;
  const unchangedCount = applied ? applied.articles.filter(article => article.outcome === "unchanged").length : 0;
  const failures = applied ? applied.articles.filter(article => article.outcome === "failed") : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 font-sans" role="dialog" aria-modal="true" aria-labelledby={ids.title} data-minerador-declared-plan-dialog>
      <div className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-divider bg-surface-elevated shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-divider px-4 py-3">
          <div className="min-w-0">
            <h2 id={ids.title} className="text-base font-semibold text-foreground">Importar plano do Silo</h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">Cole o plano, escolha o grupo e gere a prévia. A prévia não grava nada; nada é pago e nada é apagado.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Fechar" title="Fechar">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <form onSubmit={event => void handlePreview(event)} className="flex flex-col gap-4" aria-label="Plano do Silo">
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.text} className="text-sm font-medium text-foreground">Plano do Silo (texto colado ou tabela)</label>
              <textarea
                id={ids.text}
                autoFocus
                value={text}
                onChange={event => { setText(event.target.value); invalidate(); }}
                rows={10}
                maxLength={60000}
                spellCheck={false}
                placeholder={PLAN_TEXT_PLACEHOLDER}
                className={`${internalField} min-h-48 resize-y leading-6`}
              />
              <p className="text-sm text-text-muted">Formato: “Silo 1 — …”, “Nome:”, “Slug:”, “Objetivo:” e, por artigo, “1. Título”, a linha “Artigo pilar • Palavra-chave: …” (ou só “Palavra-chave: …”) e a descrição. A tabela “# | Assunto | Keyword principal | Papel | Descrição” também vale.</p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Grupo do plano</legend>
              <div className="flex flex-wrap gap-2">
                <label className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-foreground transition-colors focus-within:ring-2 focus-within:ring-module-accent/30 ${groupMode === "new" ? "border-module-accent/50 bg-selected" : "border-divider hover:bg-surface-subtle"}`}>
                  <input type="radio" name="declared-plan-group-mode" value="new" checked={groupMode === "new"} onChange={() => { setGroupMode("new"); invalidate(); }} className="sr-only" />
                  Grupo novo
                </label>
                <label className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-module-accent/30 ${groups.length === 0 ? "cursor-not-allowed border-divider text-text-muted opacity-60" : groupMode === "existing" ? "cursor-pointer border-module-accent/50 bg-selected text-foreground" : "cursor-pointer border-divider text-foreground hover:bg-surface-subtle"}`}>
                  <input type="radio" name="declared-plan-group-mode" value="existing" checked={groupMode === "existing"} disabled={groups.length === 0} onChange={() => { setGroupMode("existing"); invalidate(); }} className="sr-only" />
                  Grupo existente{groups.length === 0 ? " (nenhum grupo ativo nesta marca)" : ""}
                </label>
              </div>

              {groupMode === "new" ? (
                <div className="flex flex-col gap-3">
                  <div className="flex max-w-md flex-col gap-1">
                    <label htmlFor={ids.name} className="text-sm font-medium text-text-muted">Nome do grupo</label>
                    <input
                      id={ids.name}
                      value={newName}
                      maxLength={EDITORIAL_GROUP_NAME_MAX}
                      onChange={event => { setNewName(event.target.value); invalidate(); }}
                      className={internalField}
                    />
                    <p className="text-sm text-text-muted">Em branco, o grupo recebe o nome do Silo da prévia.</p>
                  </div>
                  <fieldset className="flex flex-col gap-1">
                    <legend className="mb-1 text-sm font-medium text-text-muted">Cor do grupo</legend>
                    <div className="flex flex-wrap gap-1">
                      {EDITORIAL_GROUP_COLORS.map(option => (
                        <label key={option} className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded border px-2 text-sm text-foreground transition-colors focus-within:ring-2 focus-within:ring-module-accent/30 ${color === option ? EDITORIAL_GROUP_COLOR_CLASSES[option].chip : "border-divider hover:bg-surface-subtle"}`}>
                          <input type="radio" name="declared-plan-group-color" value={option} checked={color === option} onChange={() => { setColor(option); invalidate(); }} className="sr-only" />
                          <EditorialGroupDot color={option} />
                          {EDITORIAL_GROUP_COLOR_LABELS[option]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              ) : (
                <div className="flex max-h-48 flex-col gap-1 overflow-y-auto" role="radiogroup" aria-label="Grupo existente">
                  {groups.map(group => (
                    <label key={group.id} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-foreground transition-colors focus-within:ring-2 focus-within:ring-module-accent/30 ${groupId === group.id ? "border-module-accent/50 bg-selected" : "border-divider hover:bg-surface-subtle"}`}>
                      <input type="radio" name="declared-plan-group-id" value={group.id} checked={groupId === group.id} onChange={() => { setGroupId(group.id); invalidate(); }} className="sr-only" />
                      <EditorialGroupDot color={group.color} />
                      <span className="min-w-0 flex-1 break-words font-medium">{group.name}</span>
                      <span className="shrink-0 text-text-muted">{EDITORIAL_GROUP_COLOR_LABELS[group.color]} · {editorialGroupCountLabel(group)}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={!canPreview} className={internalButton}>
                {phase === "previewing" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Gerar prévia
              </button>
              {!text.trim() ? <span className="text-sm text-text-muted">Cole o plano para gerar a prévia.</span> : null}
            </div>
          </form>

          {refusal ? (
            <div role="alert" className="mt-4 rounded-md border border-danger/40 px-3 py-2 text-sm leading-6" data-declared-plan-refusal>
              <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />Nada foi gravado: {refusal.message}</p>
              {refusal.blockers.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
                  {refusal.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}

          {result ? <PlanPreview result={result} /> : null}

          {applied ? (
            <div role="status" className={`mt-4 rounded-md border px-3 py-2 text-sm leading-6 ${applied.failed > 0 ? "border-warning/40" : "border-success/40"}`} data-declared-plan-applied>
              <p className={`flex items-center gap-2 font-semibold ${applied.failed > 0 ? "text-warning" : "text-success"}`}>
                {applied.failed > 0 ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                {declaredCount} artigo(s) declarado(s){unchangedCount > 0 ? `, ${unchangedCount} sem mudança` : ""}, reciprocidade confirmada em {applied.reciprocityConfirmed}; falhas: {applied.failed}.
              </p>
              <p className="text-foreground">Plano gravado no grupo (v{applied.planVersion}). {applied.createdSubjectIds.length} Assunto(s) e {applied.createdPrincipalIds.length} principal(is) criados; {applied.supportsStamped} sustentação(ões) receberam o grupo.</p>
              {failures.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
                  {failures.map(article => <li key={article.order}>Artigo {article.order}: {article.reason || "falhou sem motivo informado."}</li>)}
                </ul>
              ) : null}
              {applied.notices.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-text-muted">
                  {applied.notices.map(notice => <li key={notice}>{notice}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-divider px-4 py-3">
          {result && !result.canApply && !applied ? <span className="mr-auto text-sm text-danger">Corrija os impedimentos e gere a prévia de novo.</span> : null}
          <button type="button" onClick={onClose} disabled={busy} className={internalButton}>{applied ? "Fechar" : "Cancelar"}</button>
          <button type="button" onClick={() => void handleApply()} disabled={busy || !result?.canApply || Boolean(applied)} className={internalButtonPrimary} data-declared-plan-apply>
            {phase === "applying" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Declarar plano
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanPreview({ result }: { result: DeclaredPlanPreview }) {
  const silo = result.silo;
  const slugInvalid = Boolean(silo.rawSlug) && !silo.slug;
  return (
    <section className="mt-4 flex flex-col gap-4 border-t border-divider pt-4" aria-label="Prévia do plano" data-declared-plan-preview>
      {result.blockers.length ? (
        <div role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-sm leading-6" data-declared-plan-blockers>
          <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{result.blockers.length} impedimento(s): o plano não pode ser declarado assim</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
            {result.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <dl className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-x-2"><dt className="text-text-muted">Silo</dt><dd className="font-semibold text-foreground">{silo.name || "sem nome"}</dd></div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-text-muted">Slug</dt>
            <dd>{silo.slug ? <span className="text-identity-slug">{silo.slug}</span> : <span className="text-text-muted">sem slug</span>}{slugInvalid ? <span className="text-danger"> · inválido: “{silo.rawSlug}”</span> : null}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2"><dt className="text-text-muted">Objetivo</dt><dd className="text-foreground">{silo.objective || "sem objetivo"}</dd></div>
        </dl>
        <dl className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <dt className="text-text-muted">Grupo</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {result.group.color && result.group.name ? <EditorialGroupTag name={result.group.name} color={result.group.color} /> : <span className="text-text-muted">{result.group.name || "sem nome"}</span>}
              <span className="text-text-muted">{result.group.mode === "new" ? "novo" : result.group.hadPlan ? (result.group.samePlan ? `já tem este plano (v${result.group.planVersion})` : `troca o plano v${result.group.planVersion}`) : "existente, sem plano"}</span>
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2"><dt className="text-text-muted">Artigos</dt><dd className="text-foreground">{result.articles.length}</dd></div>
          <div className="flex flex-wrap gap-x-2"><dt className="text-text-muted">Voltam a “Em revisão”</dt><dd className={result.approvedToReview > 0 ? "text-pending" : "text-foreground"}>{result.approvedToReview} item(ns) aprovado(s)</dd></div>
          <div className="flex flex-wrap gap-x-2"><dt className="text-text-muted">Sustentações</dt><dd className="text-foreground">{result.supports.total} da Pesquisa por Assunto · {result.supports.withoutGroup} sem grupo recebem o grupo · {result.supports.inOtherGroup} em outro grupo não mudam</dd></div>
        </dl>
      </div>

      <div className="overflow-x-auto rounded-md border border-divider">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-surface text-text-muted">
            <tr>
              <th scope="col" className="w-12 px-2 py-2 font-semibold">#</th>
              <th scope="col" className="w-20 px-2 py-2 font-semibold">Papel</th>
              <th scope="col" className="px-2 py-2 font-semibold">Assunto</th>
              <th scope="col" className="px-2 py-2 font-semibold">Principal</th>
              <th scope="col" className="px-2 py-2 font-semibold">Escopo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {result.articles.map(article => (
              <tr key={`${article.order}:${article.line}`} className="align-top">
                <td className="px-2 py-2 text-foreground">{article.order}</td>
                <td className={`px-2 py-2 ${article.role === "Pilar" ? "font-semibold text-foreground" : "text-foreground"}`}>{article.role}</td>
                <td className="px-2 py-2">
                  <span className="text-keyword">{article.subject.phrase}</span>
                  <span className="block text-text-muted">{article.subject.label}</span>
                </td>
                <td className="px-2 py-2">
                  {article.principal.phrase ? <span className="text-keyword">{article.principal.phrase}</span> : null}
                  {/* O rótulo do núcleo já diz "sem volume (D2-bis: aprova sem volume)" quando é o caso. */}
                  <span className={`block ${article.principal.state === "existing_without_volume" ? "text-pending" : "text-text-muted"}`}>
                    {article.principal.label}
                  </span>
                  {article.problems.length ? (
                    <ul className="mt-1 space-y-1 text-danger">
                      {article.problems.map(problem => <li key={problem}>{problem}</li>)}
                    </ul>
                  ) : null}
                </td>
                <td className="px-2 py-2 text-foreground">{article.scope || <span className="text-text-muted">sem descrição</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.unparsed.length ? (
        <div className="text-sm leading-6">
          <p className="font-semibold text-foreground">Linhas não entendidas ({result.unparsed.length}) — ficaram de fora, nada foi adivinhado</p>
          <ul className="mt-1 space-y-1">
            {result.unparsed.map(item => <li key={`${item.line}:${item.text}`} className="text-foreground"><span className="text-text-muted">Linha {item.line}:</span> {item.text} <span className="text-text-muted">— {item.reason}</span></li>)}
          </ul>
        </div>
      ) : null}

      {result.leftovers.length ? (
        <div className="text-sm leading-6">
          <p className="font-semibold text-foreground">Sobras de imports anteriores ({result.leftovers.length})</p>
          <ul className="mt-1 space-y-1">
            {result.leftovers.map(item => <li key={item.keywordId}><span className="text-keyword">{item.keyword}</span> <span className="text-text-muted">— não faz parte do plano ({item.label})</span></li>)}
          </ul>
        </div>
      ) : null}

      {result.notices.length ? (
        <div className="text-sm leading-6">
          <p className="font-semibold text-foreground">Avisos</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-text-muted">
            {result.notices.map(notice => <li key={notice}>{notice}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
