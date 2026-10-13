"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { internalButton, internalButtonPrimary, internalField } from "@/components/editorial/internal-page-visual";
import { EDITORIAL_GROUP_COLOR_LABELS, type EditorialGroupSummary } from "@/lib/editorial/editorial-groups";
import { DECLARED_PLAN_SCOPE_MAX, SUBJECT_ENTRY_TITLE_MAX, type DeclaredPlanLockChoice, type DeclaredPlanRole } from "@/lib/minerador/declared-plan";
import type { DeclaredPlanPreview } from "@/lib/minerador/declared-plan-import-core";
import type { ConversionDraft, ConversionDraftRow } from "@/lib/minerador/subject-conversion-draft";
import type { ConversionFollowUpResult } from "@/lib/minerador/subject-conversion-core";
import { CadastroPreview, type DeclaredPlanAppliedIds } from "./subject-cadastro-card";

/**
 * CONVERTER O FORMATO ANTERIOR (SDD `docs/compartilhado/sdd-conversao-assunto-legado-2026-10-13.md`).
 *
 * Por grupo, cada Assunto do formato anterior (a linha-título) com o artigo que
 * ele sustenta, a keyword sugerida para carregar o Assunto (a principal vigente
 * do artigo), o título, os detalhes, o papel e a trava. "Gerar prévia" não
 * grava; "Converter" manda o MESMO pedido com o `importRequestId` da prévia:
 * grava o Assunto dentro da keyword pelo núcleo do card, roda a Lógica (grátis),
 * aprova (só a Lógica) e envia ao Arquiteto. A linha-título fica arquivada (não
 * vai para a lixeira). Fala só com `/api/minerador/marcas/[brandId]/plans/convert`.
 */

const ROUTE = (brandId: string) => `/api/minerador/marcas/${encodeURIComponent(brandId)}/plans/convert`;
const LOCK_LABELS: Record<DeclaredPlanLockChoice, string> = { auto: "Automática (pelo volume)", locked: "Travada", free: "Livre" };

type Linha = ConversionDraftRow & { selected: boolean; keyword: string; lock: DeclaredPlanLockChoice };
type Refusal = { code: string; message: string; blockers: string[] };
type Applied = { failed: number; articles: Array<{ order: number; outcome: string; reason: string | null; subjectKeywordId: string | null }>; followUp: ConversionFollowUpResult };

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

async function call(url: string, init: RequestInit): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; refusal: Refusal }> {
  const response = await fetch(url, { cache: "no-store", ...init }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
  if (!response || !response.ok || data.success !== true) {
    const diagnostic = data.diagnostic && typeof data.diagnostic === "object" ? data.diagnostic as Record<string, unknown> : {};
    return { ok: false, refusal: { code: typeof data.code === "string" ? data.code : response ? `HTTP_${response.status}` : "NETWORK_ERROR", message: typeof data.message === "string" ? data.message : response ? "A conversão não pôde ser feita agora." : "Sem conexão com o servidor. Nada foi gravado.", blockers: strings(diagnostic.blockers) } };
  }
  return { ok: true, body: data };
}

export function SubjectConversionDialog({ brandId, groups, onClose, onApplied }: {
  brandId: string;
  groups: readonly EditorialGroupSummary[];
  onClose: () => void;
  onApplied: (applied: DeclaredPlanAppliedIds) => void;
}) {
  const ativos = groups.filter(group => group.status === "active");
  const [groupId, setGroupId] = useState(ativos.length === 1 ? ativos[0].id : "");
  const [draft, setDraft] = useState<ConversionDraft | null>(null);
  const [hasPlan, setHasPlan] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [silo, setSilo] = useState({ name: "", slug: "", objective: "" });
  const [phase, setPhase] = useState<"idle" | "loading" | "previewing" | "applying">("idle");
  const [preview, setPreview] = useState<{ body: Record<string, unknown>; importRequestId: string; result: DeclaredPlanPreview } | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const busyRef = useRef(false);
  const ids = { title: useId(), group: useId(), name: useId(), slug: useId(), objective: useId() };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busyRef.current) { event.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const invalidate = () => { setPreview(null); setApplied(null); setRefusal(null); };

  useEffect(() => {
    if (!groupId) return;
    let vivo = true;
    void (async () => {
      setPhase("loading");
      setDraft(null);
      setLinhas([]);
      invalidate();
      const answer = await call(`${ROUTE(brandId)}?groupId=${encodeURIComponent(groupId)}`, { method: "GET" });
      if (!vivo) return;
      setPhase("idle");
      if (!answer.ok) { setRefusal(answer.refusal); return; }
      const lido = answer.body.draft as ConversionDraft;
      const grupo = answer.body.group as { hasPlan?: boolean } | undefined;
      setDraft(lido);
      setHasPlan(Boolean(grupo?.hasPlan));
      setSilo({ name: lido.silo?.name ?? "", slug: lido.silo?.slug ?? "", objective: lido.silo?.objective ?? "" });
      setLinhas(lido.rows.map(row => ({ ...row, selected: Boolean(row.suggestedKeyword), keyword: row.suggestedKeyword ?? "", lock: "auto" })));
    })();
    return () => { vivo = false; };
  }, [brandId, groupId]);

  const mudar = (fromKeywordId: string, patch: Partial<Linha>) => {
    setLinhas(current => current.map(linha => linha.fromKeywordId === fromKeywordId ? { ...linha, ...patch } : linha));
    invalidate();
  };

  const pedido = () => {
    const escolhidas = linhas.filter(linha => linha.selected);
    if (!groupId || !escolhidas.length) return null;
    return {
      groupId,
      silo: hasPlan ? null : { name: silo.name.trim(), slug: silo.slug.trim() || null, objective: silo.objective.trim() || null },
      rows: escolhidas.map(linha => ({ fromKeywordId: linha.fromKeywordId, articleId: linha.articleId, order: linha.order, role: linha.role, title: linha.title.trim(), keyword: linha.keyword.trim(), scope: linha.scope.trim(), lock: linha.lock })),
    };
  };

  const gerarPrevia = async () => {
    const body = pedido();
    if (!body || busyRef.current) return;
    busyRef.current = true;
    setPhase("previewing");
    invalidate();
    try {
      const answer = await call(ROUTE(brandId), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "preview", ...body }) });
      if (!answer.ok) { setRefusal(answer.refusal); return; }
      setPreview({ body, importRequestId: crypto.randomUUID(), result: answer.body.preview as DeclaredPlanPreview });
    } finally {
      busyRef.current = false;
      setPhase("idle");
    }
  };

  const converter = async () => {
    if (!preview?.result.canApply || busyRef.current) return;
    busyRef.current = true;
    setPhase("applying");
    setRefusal(null);
    try {
      const answer = await call(ROUTE(brandId), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "apply", ...preview.body, importRequestId: preview.importRequestId }) });
      if (!answer.ok) { setRefusal(answer.refusal); return; }
      const aplicado = answer.body.applied as { failed?: number; articles?: Applied["articles"]; createdSubjectIds?: string[] } | undefined;
      const followUp = answer.body.followUp as ConversionFollowUpResult;
      const articles = Array.isArray(aplicado?.articles) ? aplicado!.articles : [];
      setApplied({ failed: typeof aplicado?.failed === "number" ? aplicado.failed : 0, articles, followUp });
      const subjectIds = [...new Set(articles.map(article => article.subjectKeywordId).filter((id): id is string => Boolean(id)))];
      onApplied({ subjectIds, createdSubjectIds: strings(aplicado?.createdSubjectIds), principalIds: subjectIds });
    } finally {
      busyRef.current = false;
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";
  const escolhidas = linhas.filter(linha => linha.selected).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 p-4 font-sans" role="dialog" aria-modal="true" aria-labelledby={ids.title} data-minerador-subject-conversion>
      <div className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-divider bg-surface-elevated shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-divider px-4 py-3">
          <div className="min-w-0">
            <h2 id={ids.title} className="text-base font-semibold text-foreground">Converter Assuntos do formato anterior</h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">No formato anterior o Assunto é uma linha própria (o título). Converter leva o Assunto para dentro da keyword que carrega o artigo (por padrão, a principal que ele já tem no Arquiteto). A linha-título fica arquivada — não vai para a lixeira. A prévia não grava nada; nada é pago.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Fechar" title="Fechar">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.group} className="text-sm font-medium text-foreground">Grupo</label>
              <select id={ids.group} value={groupId} disabled={busy} onChange={event => setGroupId(event.target.value)} className={internalField}>
                <option value="">Escolha o grupo…</option>
                {ativos.map(group => <option key={group.id} value={group.id}>{EDITORIAL_GROUP_COLOR_LABELS[group.color]} · {group.name}</option>)}
              </select>
            </div>

            {phase === "loading" ? <p className="flex items-center gap-2 text-sm text-text-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Lendo o grupo…</p> : null}

            {draft && !draft.rows.length ? (
              <p className="text-sm text-text-muted" role="status" data-subject-conversion-empty>Nenhum Assunto do formato anterior neste grupo{draft.converted.length ? ` (${draft.converted.length} já convertido(s))` : ""}.</p>
            ) : null}

            {draft && draft.rows.length ? (
              <>
                {!hasPlan ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor={ids.name} className="text-sm font-medium text-foreground">Nome do Silo</label>
                      <input id={ids.name} value={silo.name} maxLength={120} disabled={busy} onChange={event => { setSilo(current => ({ ...current, name: event.target.value })); invalidate(); }} className={internalField} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={ids.slug} className="text-sm font-medium text-foreground">Slug</label>
                      <input id={ids.slug} value={silo.slug} maxLength={200} disabled={busy} onChange={event => { setSilo(current => ({ ...current, slug: event.target.value })); invalidate(); }} className={internalField} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={ids.objective} className="text-sm font-medium text-foreground">Objetivo</label>
                      <input id={ids.objective} value={silo.objective} maxLength={1200} disabled={busy} onChange={event => { setSilo(current => ({ ...current, objective: event.target.value })); invalidate(); }} className={internalField} />
                    </div>
                    <p className="text-sm text-text-muted md:col-span-3">O grupo ainda não tem plano: a conversão grava o plano com o Silo consolidado (nome, slug e objetivo acima, editáveis).</p>
                  </div>
                ) : <p className="text-sm text-text-muted">O grupo já tem plano: os artigos convertidos entram nele (acréscimo).</p>}

                <div className="overflow-x-auto rounded-md border border-divider">
                  <table className="w-full min-w-[1040px] text-left text-sm" data-subject-conversion-linhas>
                    <thead className="bg-surface text-text-muted">
                      <tr>
                        <th scope="col" className="w-10 px-2 py-2"><span className="sr-only">Converter</span></th>
                        <th scope="col" className="w-16 px-2 py-2 font-semibold">#</th>
                        <th scope="col" className="w-28 px-2 py-2 font-semibold">Papel</th>
                        <th scope="col" className="px-2 py-2 font-semibold">Assunto (título)</th>
                        <th scope="col" className="px-2 py-2 font-semibold">Keyword que carrega</th>
                        <th scope="col" className="px-2 py-2 font-semibold">Detalhes</th>
                        <th scope="col" className="w-44 px-2 py-2 font-semibold">Trava</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-divider">
                      {linhas.map((linha, index) => (
                        <tr key={linha.fromKeywordId} className="align-top" data-subject-conversion-linha={linha.articleId ? "com-artigo" : "sem-artigo"}>
                          <td className="px-2 py-2"><input type="checkbox" aria-label={`Converter a linha ${index + 1}`} checked={linha.selected} disabled={busy} onChange={event => mudar(linha.fromKeywordId, { selected: event.target.checked })} className="h-4 w-4" /></td>
                          <td className="px-2 py-2"><input aria-label={`Ordem da linha ${index + 1}`} type="number" min={1} max={30} value={linha.order} disabled={busy} onChange={event => mudar(linha.fromKeywordId, { order: Number(event.target.value) || 0 })} className={`${internalField} w-14`} /></td>
                          <td className="px-2 py-2">
                            <select aria-label={`Papel da linha ${index + 1}`} value={linha.role} disabled={busy} onChange={event => mudar(linha.fromKeywordId, { role: (event.target.value === "Pilar" ? "Pilar" : "Suporte") as DeclaredPlanRole })} className={internalField}>
                              <option value="Pilar">Pilar</option>
                              <option value="Suporte">Suporte</option>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <input aria-label={`Assunto da linha ${index + 1}`} value={linha.title} maxLength={SUBJECT_ENTRY_TITLE_MAX} disabled={busy} onChange={event => mudar(linha.fromKeywordId, { title: event.target.value })} className={internalField} />
                            <span className="mt-1 block text-sm text-text-muted">{linha.articleId ? `Artigo no Arquiteto · v${linha.articleVersion ?? "?"}` : "Sem artigo no Arquiteto"}</span>
                          </td>
                          <td className="px-2 py-2">
                            <select aria-label={`Keyword da linha ${index + 1}`} value={linha.keyword} disabled={busy} onChange={event => mudar(linha.fromKeywordId, { keyword: event.target.value })} className={`${internalField} text-keyword`}>
                              <option value="">Escolha a keyword…</option>
                              {linha.options.map(option => (
                                <option key={option.keywordId} value={option.keyword} disabled={!option.allowed} title={option.reason ?? undefined}>
                                  {option.keyword}{typeof option.volume === "number" ? ` · ${option.volume}` : " · sem volume"}{option.relation === "principal" ? " · principal do artigo" : option.relation === "support" ? " · secundária (não pode)" : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2"><textarea aria-label={`Detalhes da linha ${index + 1}`} value={linha.scope} maxLength={DECLARED_PLAN_SCOPE_MAX} rows={2} disabled={busy} onChange={event => mudar(linha.fromKeywordId, { scope: event.target.value.replace(/[\r\n]+/g, " ") })} className={`${internalField} resize-y leading-6`} /></td>
                          <td className="px-2 py-2">
                            <select aria-label={`Trava da linha ${index + 1}`} value={linha.lock} disabled={busy} onChange={event => mudar(linha.fromKeywordId, { lock: event.target.value === "locked" ? "locked" : event.target.value === "free" ? "free" : "auto" })} className={internalField}>
                              {(Object.keys(LOCK_LABELS) as DeclaredPlanLockChoice[]).map(option => <option key={option} value={option}>{LOCK_LABELS[option]}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {draft.outsidePlan.length ? (
                  <div className="rounded-md border border-warning/40 px-3 py-2 text-sm leading-6" data-subject-conversion-outside>
                    <p className="font-semibold text-warning">Artigos do Silo sem Assunto ({draft.outsidePlan.length})</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
                      {draft.outsidePlan.map(item => <li key={item.articleId}><span className="text-keyword">{item.principal ?? item.articleId}</span> — {item.reason}</li>)}
                    </ul>
                  </div>
                ) : null}
                {draft.notices.length ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">{draft.notices.map(notice => <li key={notice}>{notice}</li>)}</ul>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void gerarPrevia()} disabled={busy || !escolhidas} className={internalButton}>
                    {phase === "previewing" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    Gerar prévia
                  </button>
                  <span className="text-sm text-text-muted">{escolhidas} de {linhas.length} selecionada(s).</span>
                </div>
              </>
            ) : null}

            {refusal ? (
              <div role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-sm leading-6" data-subject-conversion-refusal>
                <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />Nada foi gravado: {refusal.message}</p>
                {refusal.blockers.length ? <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">{refusal.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul> : null}
              </div>
            ) : null}

            {preview ? <CadastroPreview result={preview.result} /> : null}

            {applied ? (
              <div role="status" className={`rounded-md border px-3 py-2 text-sm leading-6 ${applied.failed > 0 || applied.followUp.error ? "border-warning/40" : "border-success/40"}`} data-subject-conversion-applied>
                <p className={`flex items-center gap-2 font-semibold ${applied.failed > 0 || applied.followUp.error ? "text-warning" : "text-success"}`}>
                  {applied.failed > 0 || applied.followUp.error ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  {applied.articles.filter(article => article.outcome !== "failed").length} Assunto(s) convertido(s), conferidos na releitura; enviados ao Arquiteto: {applied.followUp.sentKeywordIds.length}; falhas: {applied.failed}.
                </p>
                <p className="text-foreground">{applied.followUp.nextStep}</p>
                {applied.followUp.error ? <p className="text-warning">{applied.followUp.error}</p> : null}
                {applied.articles.filter(article => article.outcome === "failed").map(article => <p key={article.order} className="text-foreground">Linha {article.order}: {article.reason || "falhou sem motivo informado."}</p>)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-divider px-4 py-3">
          {preview && !preview.result.canApply && !applied ? <span className="mr-auto text-sm text-danger">Corrija os impedimentos e gere a prévia de novo.</span> : null}
          <button type="button" onClick={onClose} disabled={busy} className={internalButton}>{applied ? "Fechar" : "Cancelar"}</button>
          <button type="button" onClick={() => void converter()} disabled={busy || !preview?.result.canApply || Boolean(applied)} className={internalButtonPrimary} data-subject-conversion-apply>
            {phase === "applying" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Converter
          </button>
        </div>
      </div>
    </div>
  );
}
