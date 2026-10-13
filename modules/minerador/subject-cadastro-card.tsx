"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, ListOrdered, Loader2, Plus, Trash2, X } from "lucide-react";
import { GLOBAL_TOPBAR_ACTION_CONTROL } from "@/components/global-topbar-control";
import { internalButton, internalButtonPrimary, internalField } from "@/components/editorial/internal-page-visual";
import { EditorialGroupDot, EditorialGroupTag } from "@/components/editorial/group-tag";
import {
  EDITORIAL_GROUP_COLORS,
  EDITORIAL_GROUP_COLOR_CLASSES,
  EDITORIAL_GROUP_COLOR_LABELS,
  editorialGroupCountLabel,
  type EditorialGroupColor,
  type EditorialGroupSummary,
} from "@/lib/editorial/editorial-groups";
import { DECLARED_PLAN_SCOPE_MAX, SUBJECT_ENTRY_TITLE_MAX, parseDeclaredPlanText, type DeclaredPlanLockChoice, type DeclaredPlanRole } from "@/lib/minerador/declared-plan";
import type { DeclaredPlanApplyArticle, DeclaredPlanCardRow, DeclaredPlanPreview } from "@/lib/minerador/declared-plan-import-core";

/**
 * CADASTRAR ASSUNTOS — O CARD ÚNICO (SDD
 * `docs/compartilhado/sdd-cadastro-assunto-na-keyword-2026-10-13.md` §3.1).
 *
 * Substitui "Colar Assuntos" do Processador e "Importar plano do Silo": é a
 * única porta para o Assunto. No topo, a COR e o DESTINO (Silo novo, Silo
 * existente ou artigo publicado); em cada linha, o Assunto (título), a
 * keyword que o carrega, os detalhes, o papel/posição e a trava. O Assunto
 * mora DENTRO da keyword: nenhuma linha "Assunto" solta nasce.
 *
 * A tela não grava nada sozinha: fala só com
 * `/api/minerador/marcas/[brandId]/plans/import` (o mesmo núcleo do MCP
 * `declare_silo_plan`). "Gerar prévia" não escreve; "Cadastrar" manda o MESMO
 * pedido da prévia com o `importRequestId` dela e só fica habilitado com
 * `canApply`; qualquer mudança descarta a prévia; o resultado só aparece depois
 * da resposta relida. `409 GROUPS_NOT_AVAILABLE` esconde o recurso.
 */

const CADASTRO_ROUTE = (brandId: string) => `/api/minerador/marcas/${encodeURIComponent(brandId)}/plans/import`;

type Destino = "new_silo" | "existing_silo" | "published";
type Linha = {
  key: string;
  order: number;
  role: DeclaredPlanRole;
  title: string;
  keyword: string;
  details: string;
  lock: DeclaredPlanLockChoice;
  /** Já gravada no plano do Silo existente: não sai pelo card ("Tirar do plano" é o caminho). */
  stored: boolean;
  storedLockLabel: string | null;
};
type GroupChoice = { mode: "existing"; groupId: string } | { mode: "new"; name: null; color: EditorialGroupColor };
type CadastroRequest = {
  plan: { silo: { name: string; slug: string | null; objective: string | null } | null; articles: Array<{ order: number; subject: string; principal: string | null; role: DeclaredPlanRole; scope: string; lock: DeclaredPlanLockChoice }> };
  group: GroupChoice;
  destination: { kind: "new_silo" } | { kind: "existing_silo"; groupId: string } | { kind: "published"; url: string };
};
type ApplyResult = { groupId: string; planVersion: number; articles: DeclaredPlanApplyArticle[]; createdSubjectIds: string[]; createdPrincipalIds: string[]; reciprocityConfirmed: number; failed: number; notices: string[] };
type Refusal = { code: string; message: string; blockers: string[] };

/** Os ids que a tela relê depois do `apply`. */
export type DeclaredPlanAppliedIds = {
  subjectIds: string[];
  createdSubjectIds: string[];
  principalIds: string[];
};

const LOCK_LABELS: Record<DeclaredPlanLockChoice, string> = { auto: "Automática (pelo volume)", locked: "Travada", free: "Livre" };
const DESTINO_LABELS: Record<Destino, string> = { new_silo: "Silo novo", existing_silo: "Silo existente", published: "Artigo publicado" };

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
let sequencia = 0;
const novaChave = () => `linha-${Date.now()}-${(sequencia += 1)}`;
const linhaVazia = (order: number, role: DeclaredPlanRole): Linha => ({ key: novaChave(), order, role, title: "", keyword: "", details: "", lock: "auto", stored: false, storedLockLabel: null });
const groupOfColor = (groups: readonly EditorialGroupSummary[], color: EditorialGroupColor) => groups.find(group => group.status === "active" && group.color === color) ?? null;

async function callCadastro(brandId: string, init: { method: "POST"; body: Record<string, unknown> } | { method: "GET"; groupId: string }): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; refusal: Refusal }> {
  const url = init.method === "GET" ? `${CADASTRO_ROUTE(brandId)}?groupId=${encodeURIComponent(init.groupId)}` : CADASTRO_ROUTE(brandId);
  const response = await fetch(url, init.method === "GET"
    ? { method: "GET", cache: "no-store" }
    : { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify(init.body) }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
  if (!response || !response.ok || data.success !== true) {
    const diagnostic = data.diagnostic && typeof data.diagnostic === "object" ? data.diagnostic as Record<string, unknown> : {};
    return {
      ok: false,
      refusal: {
        code: typeof data.code === "string" ? data.code : response ? `HTTP_${response.status}` : "NETWORK_ERROR",
        message: typeof data.message === "string" ? data.message : response ? "O cadastro não pôde ser feito agora." : "Sem conexão com o servidor. Nada foi gravado.",
        blockers: strings(diagnostic.blockers),
      },
    };
  }
  return { ok: true, body: data };
}

/** O botão ao lado de "Colar keywords" e "Importar CSV" (mesma geometria compacta). */
export function SubjectCadastroButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={GLOBAL_TOPBAR_ACTION_CONTROL} onClick={onClick} aria-label="Cadastrar Assuntos" title="Cadastrar Assuntos" data-minerador-subject-cadastro>
      <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden xl:inline">Cadastrar Assuntos</span>
    </button>
  );
}

export function SubjectCadastroCard({
  brandId,
  groups,
  onClose,
  onApplied,
  onUnavailable,
}: {
  brandId: string;
  /** Os grupos ATIVOS da marca (a cor que já tem grupo leva o cadastro para ele). */
  groups: readonly EditorialGroupSummary[];
  onClose: () => void;
  onApplied: (applied: DeclaredPlanAppliedIds) => void;
  onUnavailable: () => void;
}) {
  const silosExistentes = groups.filter(group => group.status === "active" && group.origin === "declared_plan" && group.planVersion > 0);
  const [destino, setDestino] = useState<Destino>("new_silo");
  const [color, setColor] = useState<EditorialGroupColor>(EDITORIAL_GROUP_COLORS[0]);
  const [siloName, setSiloName] = useState("");
  const [siloSlug, setSiloSlug] = useState("");
  const [siloObjective, setSiloObjective] = useState("");
  const [existingGroupId, setExistingGroupId] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>(() => [linhaVazia(1, "Pilar")]);
  const [colado, setColado] = useState("");
  const [colagemAviso, setColagemAviso] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "previewing" | "applying">("idle");
  const [preview, setPreview] = useState<{ request: CadastroRequest; importRequestId: string; result: DeclaredPlanPreview } | null>(null);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const ids = { title: useId(), paste: useId(), name: useId(), slug: useId(), objective: useId(), url: useId(), existing: useId() };

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

  /** Qualquer mudança: a prévia anterior não vale mais. */
  const invalidate = () => {
    setPreview(null);
    setApplied(null);
    setRefusal(null);
  };
  const mudarLinha = (key: string, patch: Partial<Linha>) => {
    setLinhas(current => current.map(linha => linha.key === key ? { ...linha, ...patch } : linha));
    invalidate();
  };
  const acrescentarLinha = () => {
    setLinhas(current => [...current, linhaVazia(Math.max(0, ...current.map(linha => linha.order)) + 1, destino === "new_silo" && !current.length ? "Pilar" : "Suporte")]);
    invalidate();
  };
  const tirarLinha = (key: string) => {
    setLinhas(current => current.filter(linha => linha.key !== key || linha.stored));
    invalidate();
  };

  /** "Colar plano em texto": o parser de sempre preenche o topo e as linhas. */
  const preencherDoTexto = () => {
    if (!colado.trim()) return;
    const lido = parseDeclaredPlanText(colado);
    if (destino === "new_silo") {
      if (lido.silo.name) setSiloName(lido.silo.name);
      if (lido.silo.rawSlug) setSiloSlug(lido.silo.rawSlug);
      if (lido.silo.objective) setSiloObjective(lido.silo.objective);
    }
    const novas = lido.articles.map(article => ({ ...linhaVazia(article.order, article.role), title: article.subject, keyword: article.principal ?? "", details: article.scope, lock: article.lock ?? "auto" as const }));
    setLinhas(current => [...current.filter(linha => linha.stored), ...novas]);
    setColagemAviso(`${novas.length} artigo(s) lido(s) do texto${lido.unparsed.length ? `; ${lido.unparsed.length} linha(s) não entendida(s) ficaram de fora` : ""}. Confira as linhas antes da prévia.`);
    invalidate();
  };

  /** Silo existente: as linhas gravadas aparecem no formato do card (leitura compatível). */
  const escolherSiloExistente = async (groupId: string) => {
    setExistingGroupId(groupId);
    invalidate();
    setLinhas([]);
    if (!groupId || busyRef.current) return;
    busyRef.current = true;
    setPhase("loading");
    try {
      const answer = await callCadastro(brandId, { method: "GET", groupId });
      if (!mountedRef.current) return;
      if (!answer.ok) {
        if (answer.refusal.code === "GROUPS_NOT_AVAILABLE") { onUnavailable(); onClose(); return; }
        setRefusal(answer.refusal);
        return;
      }
      const rows = (Array.isArray(answer.body.rows) ? answer.body.rows : []) as DeclaredPlanCardRow[];
      setLinhas(rows.map(row => ({ key: novaChave(), order: row.order, role: row.role, title: row.title, keyword: row.keyword ?? "", details: row.details, lock: row.lock, stored: true, storedLockLabel: row.lockLabel })));
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setPhase("idle");
    }
  };

  const grupoExistente = silosExistentes.find(group => group.id === existingGroupId) ?? null;
  const corEfetiva: EditorialGroupColor = destino === "existing_silo" && grupoExistente ? grupoExistente.color : color;

  const currentRequest = (): CadastroRequest | null => {
    const preenchidas = linhas.filter(linha => linha.title.trim() || linha.keyword.trim() || linha.details.trim());
    if (!preenchidas.length) return null;
    const articles = preenchidas.map(linha => ({ order: linha.order, subject: linha.title.trim(), principal: linha.keyword.trim() || null, role: destino === "published" ? "Suporte" as const : linha.role, scope: linha.details.trim(), lock: linha.lock }));
    if (destino === "existing_silo") {
      if (!existingGroupId) return null;
      return { plan: { silo: null, articles }, group: { mode: "existing", groupId: existingGroupId }, destination: { kind: "existing_silo", groupId: existingGroupId } };
    }
    const existente = groupOfColor(groups, color);
    const group: GroupChoice = existente ? { mode: "existing", groupId: existente.id } : { mode: "new", name: null, color };
    if (destino === "published") {
      if (!publishedUrl.trim()) return null;
      return { plan: { silo: null, articles }, group, destination: { kind: "published", url: publishedUrl.trim() } };
    }
    if (!siloName.trim()) return null;
    return { plan: { silo: { name: siloName.trim(), slug: siloSlug.trim() || null, objective: siloObjective.trim() || null }, articles }, group, destination: { kind: "new_silo" } };
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
      const answer = await callCadastro(brandId, { method: "POST", body: { mode: "preview", plan: request.plan, group: request.group, destination: request.destination } });
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
      setPreview({ request, importRequestId: crypto.randomUUID(), result });
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
      const answer = await callCadastro(brandId, { method: "POST", body: {
        mode: "apply",
        plan: preview.request.plan,
        group: preview.request.group,
        destination: preview.request.destination,
        importRequestId: preview.importRequestId,
      } });
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
  const publicado = destino === "published";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 font-sans" role="dialog" aria-modal="true" aria-labelledby={ids.title} data-minerador-subject-cadastro-card>
      <div className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-divider bg-surface-elevated shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-divider px-4 py-3">
          <div className="min-w-0">
            <h2 id={ids.title} className="text-base font-semibold text-foreground">Cadastrar Assuntos</h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">O Assunto mora na keyword: cada linha é um artigo, com o título, a keyword que o carrega e os detalhes. Keyword com volume medido entra travada; sem volume, livre. A prévia não grava nada; nada é pago.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Fechar" title="Fechar">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <form onSubmit={event => void handlePreview(event)} className="flex flex-col gap-4" aria-label="Cadastro de Assuntos">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Destino</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Destino do cadastro">
                {(Object.keys(DESTINO_LABELS) as Destino[]).map(option => (
                  <label key={option} data-subject-cadastro-destino={option} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-foreground transition-colors focus-within:ring-2 focus-within:ring-module-accent/30 ${destino === option ? "border-module-accent/50 bg-surface" : "border-divider hover:bg-surface-subtle"}`}>
                    <input type="radio" name="subject-cadastro-destino" value={option} checked={destino === option} disabled={busy || (option === "existing_silo" && !silosExistentes.length)} onChange={() => { setDestino(option); setLinhas(option === "existing_silo" ? [] : [linhaVazia(option === "new_silo" ? 1 : 1, option === "new_silo" ? "Pilar" : "Suporte")]); setExistingGroupId(""); invalidate(); }} className="sr-only" />
                    {DESTINO_LABELS[option]}
                  </label>
                ))}
              </div>
              {!silosExistentes.length ? <p className="text-sm text-text-muted">Ainda não há Silo cadastrado nesta marca: “Silo existente” aparece depois do primeiro cadastro.</p> : null}
            </fieldset>

            {destino === "existing_silo" ? (
              <div className="flex flex-col gap-1">
                <label htmlFor={ids.existing} className="text-sm font-medium text-foreground">Silo existente</label>
                <select id={ids.existing} value={existingGroupId} onChange={event => void escolherSiloExistente(event.target.value)} disabled={busy} className={internalField}>
                  <option value="">Escolha o Silo…</option>
                  {silosExistentes.map(group => <option key={group.id} value={group.id}>{EDITORIAL_GROUP_COLOR_LABELS[group.color]} · {group.name} · plano v{group.planVersion}</option>)}
                </select>
                <p className="text-sm text-text-muted">As linhas já gravadas aparecem abaixo e não saem por aqui (para tirar um artigo do plano, use “Tirar do plano”). Acrescente as novas; as que não mudarem ficam como estão.</p>
              </div>
            ) : (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-foreground">Cor do grupo</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do grupo">
                  {EDITORIAL_GROUP_COLORS.map(option => {
                    const existente = groupOfColor(groups, option);
                    return (
                      <label key={option} data-subject-cadastro-color={option} title={existente ? `grupo existente: ${existente.name} · ${editorialGroupCountLabel(existente)}` : "grupo novo"} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-foreground transition-colors focus-within:ring-2 focus-within:ring-module-accent/30 ${color === option ? EDITORIAL_GROUP_COLOR_CLASSES[option].chip : "border-divider hover:bg-surface-subtle"}`}>
                        <input type="radio" name="subject-cadastro-color" value={option} checked={color === option} onChange={() => { setColor(option); invalidate(); }} className="sr-only" />
                        <EditorialGroupDot color={option} />
                        <span className="font-medium">{EDITORIAL_GROUP_COLOR_LABELS[option]}</span>
                        {existente ? <span className="text-text-muted">· {existente.name}</span> : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {destino === "new_silo" ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor={ids.name} className="text-sm font-medium text-foreground">Nome do Silo</label>
                  <input id={ids.name} value={siloName} maxLength={120} onChange={event => { setSiloName(event.target.value); invalidate(); }} className={internalField} placeholder="Wi-Fi e fibra óptica" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={ids.slug} className="text-sm font-medium text-foreground">Slug</label>
                  <input id={ids.slug} value={siloSlug} maxLength={200} onChange={event => { setSiloSlug(event.target.value); invalidate(); }} className={internalField} placeholder="/wifi-e-fibra/" />
                </div>
                <div className="flex flex-col gap-1 md:col-span-1">
                  <label htmlFor={ids.objective} className="text-sm font-medium text-foreground">Objetivo</label>
                  <input id={ids.objective} value={siloObjective} maxLength={1200} onChange={event => { setSiloObjective(event.target.value); invalidate(); }} className={internalField} />
                </div>
              </div>
            ) : null}

            {publicado ? (
              <div className="flex flex-col gap-1">
                <label htmlFor={ids.url} className="text-sm font-medium text-foreground">URL do artigo publicado</label>
                <input id={ids.url} value={publishedUrl} maxLength={2048} onChange={event => { setPublishedUrl(event.target.value); invalidate(); }} className={internalField} placeholder="https://…" inputMode="url" />
                <p className="text-sm text-text-muted">URL, slug, canonical e a keyword da página não mudam. O Assunto (título e detalhes, na primeira linha) vai para a página; as keywords das linhas entram como reforço dela pelo caminho de “Melhorar publicados”.</p>
              </div>
            ) : null}

            {destino !== "existing_silo" ? (
              <details className="rounded-md border border-divider px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-foreground">Colar plano em texto</summary>
                <div className="mt-2 flex flex-col gap-2">
                  <label htmlFor={ids.paste} className="text-sm text-text-muted">Formato: “Silo 2 — …”, “Nome:”, “Slug:”, “Objetivo:” e, por artigo, “9. Título”, “Palavra-chave: …” (com “Artigo pilar •” no Pilar), a descrição e, se quiser, “Trava: travada” ou “Trava: livre”.</label>
                  <textarea id={ids.paste} value={colado} onChange={event => setColado(event.target.value)} rows={6} maxLength={60000} spellCheck={false} className={`${internalField} min-h-32 resize-y leading-6`} />
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={preencherDoTexto} disabled={busy || !colado.trim()} className={internalButton}>Preencher as linhas</button>
                    {colagemAviso ? <span className="text-sm text-text-muted" role="status">{colagemAviso}</span> : null}
                  </div>
                </div>
              </details>
            ) : null}

            <div className="overflow-x-auto rounded-md border border-divider">
              <table className="w-full min-w-[960px] text-left text-sm" data-subject-cadastro-linhas>
                <thead className="bg-surface text-text-muted">
                  <tr>
                    <th scope="col" className="w-16 px-2 py-2 font-semibold">#</th>
                    {!publicado ? <th scope="col" className="w-28 px-2 py-2 font-semibold">Papel</th> : null}
                    <th scope="col" className="px-2 py-2 font-semibold">Assunto (título)</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Keyword</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Detalhes</th>
                    {!publicado ? <th scope="col" className="w-44 px-2 py-2 font-semibold">Trava</th> : null}
                    <th scope="col" className="w-12 px-2 py-2"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {linhas.map((linha, index) => (
                    <tr key={linha.key} className="align-top" data-subject-cadastro-linha={linha.stored ? "gravada" : "nova"}>
                      <td className="px-2 py-2"><input aria-label={`Ordem da linha ${index + 1}`} type="number" min={1} max={30} value={linha.order} disabled={busy || linha.stored} onChange={event => mudarLinha(linha.key, { order: Number(event.target.value) || 0 })} className={`${internalField} w-14`} /></td>
                      {!publicado ? (
                        <td className="px-2 py-2">
                          <select aria-label={`Papel da linha ${index + 1}`} value={linha.role} disabled={busy} onChange={event => mudarLinha(linha.key, { role: event.target.value === "Pilar" ? "Pilar" : "Suporte" })} className={internalField}>
                            <option value="Pilar">Pilar</option>
                            <option value="Suporte">Suporte</option>
                          </select>
                        </td>
                      ) : null}
                      <td className="px-2 py-2"><input aria-label={`Assunto da linha ${index + 1}`} value={linha.title} maxLength={SUBJECT_ENTRY_TITLE_MAX} disabled={busy} onChange={event => mudarLinha(linha.key, { title: event.target.value })} className={internalField} placeholder={publicado && index > 0 ? "(o da primeira linha)" : "Título do artigo"} /></td>
                      <td className="px-2 py-2"><input aria-label={`Keyword da linha ${index + 1}`} value={linha.keyword} maxLength={400} disabled={busy || (linha.stored && Boolean(linha.keyword))} onChange={event => mudarLinha(linha.key, { keyword: event.target.value })} className={`${internalField} text-keyword`} placeholder="keyword" /></td>
                      <td className="px-2 py-2"><textarea aria-label={`Detalhes da linha ${index + 1}`} value={linha.details} maxLength={DECLARED_PLAN_SCOPE_MAX} rows={2} disabled={busy} onChange={event => mudarLinha(linha.key, { details: event.target.value.replace(/[\r\n]+/g, " ") })} className={`${internalField} resize-y leading-6`} placeholder={publicado && index > 0 ? "(os da primeira linha)" : "O que o artigo cobre (até 1.200)"} /></td>
                      {!publicado ? (
                        <td className="px-2 py-2">
                          <select aria-label={`Trava da linha ${index + 1}`} value={linha.lock} disabled={busy} onChange={event => mudarLinha(linha.key, { lock: event.target.value === "locked" ? "locked" : event.target.value === "free" ? "free" : "auto" })} className={internalField}>
                            {(Object.keys(LOCK_LABELS) as DeclaredPlanLockChoice[]).map(option => <option key={option} value={option}>{option === "auto" && linha.stored && linha.storedLockLabel?.includes("declarada antes") ? "Como foi declarada (travada)" : LOCK_LABELS[option]}</option>)}
                          </select>
                          {linha.storedLockLabel ? <span className="mt-1 block text-sm text-text-muted">Hoje: {linha.storedLockLabel}</span> : null}
                        </td>
                      ) : null}
                      <td className="px-2 py-2">
                        {!linha.stored ? (
                          <button type="button" onClick={() => tirarLinha(linha.key)} disabled={busy} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Tirar a linha ${index + 1}`} title="Tirar a linha">
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={acrescentarLinha} disabled={busy || (destino === "existing_silo" && !existingGroupId)} className={internalButton}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Acrescentar linha
              </button>
              <button type="submit" disabled={!canPreview} className={internalButton}>
                {phase === "previewing" || phase === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Gerar prévia
              </button>
              <span className="text-sm text-text-muted">Cor do cadastro: {EDITORIAL_GROUP_COLOR_LABELS[corEfetiva]}.</span>
            </div>
          </form>

          {refusal ? (
            <div role="alert" className="mt-4 rounded-md border border-danger/40 px-3 py-2 text-sm leading-6" data-subject-cadastro-refusal>
              <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />Nada foi gravado: {refusal.message}</p>
              {refusal.blockers.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
                  {refusal.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}

          {result ? <CadastroPreview result={result} /> : null}

          {applied ? (
            <div role="status" className={`mt-4 rounded-md border px-3 py-2 text-sm leading-6 ${applied.failed > 0 ? "border-warning/40" : "border-success/40"}`} data-subject-cadastro-applied>
              <p className={`flex items-center gap-2 font-semibold ${applied.failed > 0 ? "text-warning" : "text-success"}`}>
                {applied.failed > 0 ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                {declaredCount} linha(s) cadastrada(s){unchangedCount > 0 ? `, ${unchangedCount} sem mudança` : ""}, conferidas na releitura: {applied.reciprocityConfirmed}; falhas: {applied.failed}.
              </p>
              <p className="text-foreground">{applied.planVersion > 0 ? `Plano do Silo gravado (v${applied.planVersion}). ` : ""}{applied.createdSubjectIds.length + applied.createdPrincipalIds.length} keyword(s) nova(s) criada(s) como Bruto. A Lógica roda sozinha (grátis); depois, aprove e envie ao Arquiteto como sempre.</p>
              {failures.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
                  {failures.map(article => <li key={`${article.order}:${article.principalKeywordId}`}>Linha {article.order}: {article.reason || "falhou sem motivo informado."}</li>)}
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
          <button type="button" onClick={() => void handleApply()} disabled={busy || !result?.canApply || Boolean(applied)} className={internalButtonPrimary} data-subject-cadastro-apply>
            {phase === "applying" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Cadastrar
          </button>
        </div>
      </div>
    </div>
  );
}

function CadastroPreview({ result }: { result: DeclaredPlanPreview }) {
  const silo = result.silo;
  return (
    <section className="mt-4 flex flex-col gap-4 border-t border-divider pt-4" aria-label="Prévia do cadastro" data-subject-cadastro-preview>
      {result.blockers.length ? (
        <div role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-sm leading-6" data-subject-cadastro-blockers>
          <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{result.blockers.length} impedimento(s): o cadastro não pode ser gravado assim</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
            {result.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}
          </ul>
        </div>
      ) : null}

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {result.destination.kind === "published" ? (
          <div className="flex flex-wrap gap-x-2"><dt className="text-text-muted">Página publicada</dt><dd className="text-foreground">{result.destination.publishedKeyword ? <span className="text-keyword">{result.destination.publishedKeyword.keyword}</span> : "não encontrada"}{result.destination.url ? <span className="text-text-muted"> · {result.destination.url}</span> : null}</dd></div>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-2"><dt className="text-text-muted">Silo</dt><dd className="font-semibold text-foreground">{silo.name || "sem nome"}{silo.slug ? <span className="font-normal text-identity-slug"> · {silo.slug}</span> : null}</dd></div>
            <div className="flex flex-wrap gap-x-2"><dt className="text-text-muted">Artigos no plano</dt><dd className="text-foreground">{result.siloPlan?.articleCount ?? result.articles.length}{result.keptArticles.length ? ` (${result.keptArticles.length} já gravados não mudam)` : ""}</dd></div>
          </>
        )}
        <div className="flex flex-wrap items-center gap-x-2">
          <dt className="text-text-muted">Grupo</dt>
          <dd className="flex flex-wrap items-center gap-2">{result.group.color && result.group.name ? <EditorialGroupTag name={result.group.name} color={result.group.color} /> : <span className="text-text-muted">{result.group.name || "novo"}</span>}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2"><dt className="text-text-muted">Voltam a “Em revisão”</dt><dd className={result.approvedToReview > 0 ? "text-pending" : "text-foreground"}>{result.approvedToReview} item(ns) aprovado(s)</dd></div>
      </dl>

      <div className="overflow-x-auto rounded-md border border-divider">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead className="bg-surface text-text-muted">
            <tr>
              <th scope="col" className="w-12 px-2 py-2 font-semibold">#</th>
              <th scope="col" className="w-20 px-2 py-2 font-semibold">Papel</th>
              <th scope="col" className="px-2 py-2 font-semibold">Assunto</th>
              <th scope="col" className="px-2 py-2 font-semibold">Keyword</th>
              <th scope="col" className="w-48 px-2 py-2 font-semibold">Trava</th>
              <th scope="col" className="px-2 py-2 font-semibold">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {result.articles.map(article => (
              <tr key={`${article.order}:${article.line}:${article.principal.phrase}`} className="align-top" data-subject-cadastro-mudanca={article.change}>
                <td className="px-2 py-2 text-foreground">{article.order}</td>
                <td className={`px-2 py-2 ${article.role === "Pilar" ? "font-semibold text-foreground" : "text-foreground"}`}>{article.role}</td>
                <td className="px-2 py-2">
                  <span className="text-foreground">{article.title || <span className="text-text-muted">sem título</span>}</span>
                  <span className="block text-text-muted">{article.change === "unchanged" ? "sem mudança" : article.change === "new" ? "novo no plano" : "muda"} · {article.subject.label}</span>
                </td>
                <td className="px-2 py-2">
                  {article.principal.phrase ? <span className="text-keyword">{article.principal.phrase}</span> : null}
                  <span className="block text-text-muted">{article.principal.label}{article.principal.volumeValidated && typeof article.principal.volume === "number" ? ` · volume ${article.principal.volume}` : ""}</span>
                  {article.problems.length ? (
                    <ul className="mt-1 space-y-1 text-danger">
                      {article.problems.map(problem => <li key={problem}>{problem}</li>)}
                    </ul>
                  ) : null}
                </td>
                <td className={`px-2 py-2 ${article.lock?.state === "free" ? "text-pending" : "text-foreground"}`}>{article.lock ? article.lock.label : <span className="text-text-muted">protegida pelo publicado</span>}</td>
                <td className="px-2 py-2 text-foreground">{article.scope || <span className="text-text-muted">sem detalhes</span>}</td>
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
