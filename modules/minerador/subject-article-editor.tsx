"use client";

import { useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { InfoHint } from "@/components/info-hint";
import { internalButton, internalButtonPrimary, internalField } from "@/components/editorial/internal-page-visual";
import { DECLARED_PLAN_SCOPE_MAX, SUBJECT_ENTRY_TITLE_MAX } from "@/lib/minerador/declared-plan";
import type { DeclaredPlanPreview } from "@/lib/minerador/declared-plan-import-core";
import { keywordSubjectBasisLabel, principalSubjectStanding, readKeywordSubjectBasis, resolveKeywordSubject } from "@/lib/minerador/keyword-subject";
import type { SubjectArticleView } from "@/lib/minerador/subject-article-view";
import { cadastroReapprovalIds, requestCadastroReapproval } from "./subject-cadastro-follow-up";

/**
 * OS CAMPOS DO ASSUNTO, EDITÁVEIS NO PAINEL DO KEYWORDDNA (SDD
 * `docs/compartilhado/sdd-assunto-pela-principal-e-volume-2026-10-18.md` §8, F3; APROVADA).
 *
 * Mora DENTRO do bloco "Assunto deste artigo" do painel de sempre (nenhum painel,
 * rota ou etapa nova). Grava pelo MESMO núcleo do card "Cadastrar Assuntos"
 * (`/api/minerador/marcas/[brandId]/plans/import`): o Assunto sem plano pelo destino
 * "Keyword (sem Silo)"; o do plano pelo destino "Silo existente" (acréscimo, a mesma
 * linha). "Revisar mudança" é a prévia (antes → depois, nada gravado); "Gravar" manda o
 * MESMO pedido com o `importRequestId`; o sucesso só aparece depois da releitura da
 * planilha. A keyword aprovada volta a "Em revisão" pelo pacote e "Reaprovar" (o
 * follow-up de sempre, `…/plans/reapprove`) só pede a Lógica.
 *
 * - volume baixo (1 a 39) ou com volume, sem Assunto: "Usar como Assunto do artigo";
 *   gravado, é obrigatório (só "Tirar do plano" libera — o gatilho do banco repõe);
 * - sem Assunto: "Cadastrar Assunto" (caso "Keyword sem Silo");
 * - volume 0 sem Assunto: o painel diz que ele vira o Assunto no "Aprovar e enviar"
 *   (o gravador automático é um só: aquela confirmação).
 */

type Row = { id: string; keyword: string; status?: string | null; volume_search?: number | null; volume_source?: string | null; analise_semantica?: Record<string, unknown> | null };
type Refusal = { message: string; blockers: string[] };

const ROUTE = (brandId: string) => `/api/minerador/marcas/${encodeURIComponent(brandId)}/plans/import`;
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

export const SUBJECT_EDITOR_TEXTS = {
  edit: "Editar Assunto",
  useLow: "Usar como Assunto do artigo",
  register: "Cadastrar Assunto",
  review: "Revisar mudança",
  save: "Gravar",
  reapprove: "Reaprovar (só a Lógica)",
  copyNote: "Copiar a nota antiga para Detalhes",
  zeroWaits: "Volume 0: ao “Aprovar e enviar”, esta keyword vira o Assunto do artigo (o título é o texto dela; você o corrige aqui depois).",
} as const;

async function call(brandId: string, body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; refusal: Refusal }> {
  const response = await fetch(ROUTE(brandId), { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
  if (!response || !response.ok || data.success !== true) {
    const diagnostic = data.diagnostic && typeof data.diagnostic === "object" ? data.diagnostic as Record<string, unknown> : {};
    return { ok: false, refusal: { message: typeof data.message === "string" ? data.message : response ? "O Assunto não pôde ser gravado agora." : "Sem conexão com o servidor. Nada foi gravado.", blockers: strings(diagnostic.blockers) } };
  }
  return { ok: true, data };
}

export function SubjectArticleEditor({ brandId, keyword, view, onApplied }: {
  brandId: string;
  keyword: Row;
  view: SubjectArticleView | null;
  /** Relê as linhas tocadas na planilha (a mesma releitura do card); devolve quando terminou. */
  onApplied: (keywordIds: string[]) => Promise<void> | void;
}) {
  const ids = { title: useId(), details: useId() };
  const semantic = keyword.analise_semantica || {};
  const assunto = resolveKeywordSubject(semantic);
  const plano = assunto.plan;
  const standing = useMemo(() => principalSubjectStanding({ volume_search: keyword.volume_search ?? null, volume_source: keyword.volume_source ?? null, analise_semantica: semantic }, new Date()), [keyword.volume_search, keyword.volume_source, semantic]);
  const basis = keywordSubjectBasisLabel(readKeywordSubjectBasis(semantic));
  const temAssunto = view?.kind === "subject";
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [mode, setMode] = useState<"edit" | "low" | "register">("edit");
  const [phase, setPhase] = useState<"idle" | "previewing" | "applying" | "rereading" | "done">("idle");
  const [preview, setPreview] = useState<{ body: Record<string, unknown>; importRequestId: string; result: DeclaredPlanPreview } | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [reapprove, setReapprove] = useState<string | null>(null);
  const busyRef = useRef(false);
  const busy = phase === "previewing" || phase === "applying" || phase === "rereading";

  if (view && view.kind !== "subject") return null;
  if (standing.outOfScope === "silo_page" && !temAssunto) return null;

  const abrir = (qual: "edit" | "low" | "register") => {
    setMode(qual);
    setTitle(temAssunto ? (view as Extract<SubjectArticleView, { kind: "subject" }>).title : keyword.keyword);
    setDetails(temAssunto ? (view as Extract<SubjectArticleView, { kind: "subject" }>).details ?? "" : assunto.note ?? "");
    setPreview(null);
    setRefusal(null);
    setReapprove(null);
    setPhase("idle");
    setOpen(true);
  };

  const pedido = (): Record<string, unknown> => {
    const article = { order: plano?.order ?? 1, subject: title.replace(/\s+/g, " ").trim(), principal: plano ? (plano.declaredPrincipal?.phrase ?? keyword.keyword) : keyword.keyword, role: plano?.role ?? "Suporte", scope: details.replace(/\s+/g, " ").trim() };
    if (plano) return { plan: { silo: null, articles: [article] }, group: { mode: "existing", groupId: plano.groupId }, destination: { kind: "existing_silo", groupId: plano.groupId } };
    return { plan: { silo: null, articles: [article] }, destination: { kind: "keyword", keywordId: keyword.id, ...(mode === "low" ? { basis: "low" } : {}) } };
  };

  const revisar = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase("previewing");
    setRefusal(null);
    try {
      const body = pedido();
      const answer = await call(brandId, { mode: "preview", ...body });
      if (!answer.ok) { setRefusal(answer.refusal); setPreview(null); return; }
      setPreview({ body, importRequestId: crypto.randomUUID(), result: answer.data as unknown as DeclaredPlanPreview });
    } finally {
      busyRef.current = false;
      setPhase(current => current === "previewing" ? "idle" : current);
    }
  };

  const gravar = async () => {
    if (!preview?.result.canApply || busyRef.current) return;
    busyRef.current = true;
    setPhase("applying");
    setRefusal(null);
    try {
      const answer = await call(brandId, { mode: "apply", ...preview.body, importRequestId: preview.importRequestId });
      if (!answer.ok) { setRefusal(answer.refusal); setPhase("idle"); return; }
      const failed = typeof answer.data.failed === "number" ? answer.data.failed : 0;
      if (failed) { setRefusal({ message: "A releitura não confirmou o Assunto gravado. Nada foi dado como concluído: gere a prévia de novo.", blockers: [] }); setPhase("idle"); return; }
      setPhase("rereading");
      await onApplied([keyword.id]);
      setPhase("done");
    } finally {
      busyRef.current = false;
    }
  };

  const reaprovar = async () => {
    if (!preview || busyRef.current) return;
    busyRef.current = true;
    try {
      const alvo = cadastroReapprovalIds(preview.result);
      const resultado = await requestCadastroReapproval(brandId, alvo.length ? alvo : [keyword.id]);
      setReapprove(resultado.ok ? `${resultado.approved} reaprovada(s)${resultado.unchanged ? `, ${resultado.unchanged} já estava(m) aprovada(s)` : ""}${resultado.refused.length ? ` · não puderam: ${resultado.refused.map(item => `${item.keyword || item.id} (${item.reason})`).join("; ")}` : ""}.` : resultado.message);
      await onApplied([keyword.id]);
    } finally {
      busyRef.current = false;
    }
  };

  const artigo = preview?.result.articles[0];
  const antes = artigo?.before ?? null;
  const notaAntiga = assunto.note && !assunto.entry?.details ? assunto.note : null;

  return (
    <div data-subject-article-editor className="mt-2 flex min-w-0 flex-col gap-2 border-t border-divider pt-2 text-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-text-muted" data-subject-article-standing={standing.volumeState}>{standing.sentence}</span>
        <InfoHint title="Assunto pela principal" description="Volume 0 (ou sem média no Google Ads): vira o Assunto fixo no “Aprovar e enviar” e a principal fica livre no Arquiteto. Volume baixo (1 a 39): opção de usar a keyword como Assunto; a principal fica. Com volume: o Assunto só se você cadastrar. URL, slug e canonical nunca mudam." />
      </div>
      {basis ? <p className="text-text-muted" data-subject-article-basis>Origem: {basis}</p> : null}
      {!open ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {temAssunto ? (
            <span className="inline-flex items-center gap-1">
              <button type="button" className={internalButton} data-subject-article-edit onClick={() => abrir("edit")}>{SUBJECT_EDITOR_TEXTS.edit}</button>
              <InfoHint title={SUBJECT_EDITOR_TEXTS.edit} description="Corrige o título (gramática e semântica) e os detalhes do Assunto, mesmo com a Revisão Humana concluída. Abre a prévia (antes → depois); gravar passa pelo núcleo do cadastro e relê. A keyword aprovada volta a “Em revisão” e “Reaprovar” só pede a Lógica." />
            </span>
          ) : standing.volumeState === "low" || standing.volumeState === "with_volume" ? (
            <span className="inline-flex items-center gap-1">
              <button type="button" className={internalButton} data-subject-article-use-low onClick={() => abrir("low")}>{SUBJECT_EDITOR_TEXTS.useLow}</button>
              <InfoHint title={SUBJECT_EDITOR_TEXTS.useLow} description="A keyword passa a ser o Assunto do artigo (o título nasce do texto dela, editável). A principal fica fixa como principal e o Arquiteto só acrescenta reforço. Depois de gravado, o Assunto é obrigatório: não sai por aqui." />
            </span>
          ) : standing.volumeState === "zero" ? (
            <span className="text-text-muted" data-subject-article-zero-waits>{SUBJECT_EDITOR_TEXTS.zeroWaits}</span>
          ) : null}
          {!temAssunto && standing.volumeState !== "low" && standing.volumeState !== "with_volume" ? (
            <span className="inline-flex items-center gap-1">
              <button type="button" className={internalButton} data-subject-article-register onClick={() => abrir("register")}>{SUBJECT_EDITOR_TEXTS.register}</button>
              <InfoHint title={SUBJECT_EDITOR_TEXTS.register} description="Cadastra o Assunto (título e detalhes) dentro desta keyword, sem Silo e sem trava — o destino “Keyword (sem Silo)” do card Cadastrar Assuntos, pelo mesmo núcleo." />
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2" data-subject-article-form={mode}>
          <label htmlFor={ids.title} className="flex items-center gap-1 font-medium text-foreground">Título do Assunto<InfoHint title="Título do Assunto" description="Uma linha, até 300 caracteres. Viaja até o H1 e o CSV; o slug e o canonical de página publicada não mudam." /></label>
          <input id={ids.title} value={title} maxLength={SUBJECT_ENTRY_TITLE_MAX} disabled={busy || phase === "done"} onChange={event => { setTitle(event.target.value); setPreview(null); }} className={internalField} data-subject-article-title-input />
          <label htmlFor={ids.details} className="flex items-center gap-1 font-medium text-foreground">Detalhes<InfoHint title="Detalhes" description={plano ? "No plano de Silo, os detalhes são o escopo do artigo (viram a promessa no Arquiteto). Uma linha, até 1.200 caracteres." : "Uma linha, até 1.200 caracteres. A nota antiga (formato anterior) pode ser copiada para cá."} /></label>
          <input id={ids.details} value={details} maxLength={DECLARED_PLAN_SCOPE_MAX} disabled={busy || phase === "done"} onChange={event => { setDetails(event.target.value); setPreview(null); }} className={internalField} data-subject-article-details-input />
          {notaAntiga && details !== notaAntiga ? (
            <span className="inline-flex items-center gap-1">
              <button type="button" className={internalButton} data-subject-article-copy-note disabled={busy} onClick={() => { setDetails(notaAntiga); setPreview(null); }}>{SUBJECT_EDITOR_TEXTS.copyNote}</button>
              <InfoHint title={SUBJECT_EDITOR_TEXTS.copyNote} description="A nota do formato anterior fica só leitura; isto apenas preenche o campo Detalhes (nada é gravado antes da prévia)." />
            </span>
          ) : null}
          {preview ? (
            <div className="rounded-md border border-divider px-3 py-2" data-subject-article-preview>
              <p className="font-semibold text-foreground">Prévia (nada gravado)</p>
              <p className="text-foreground" data-subject-article-before-after>
                {antes ? <>Antes: “{antes.title ?? "—"}”{antes.details ? ` · ${antes.details}` : ""} → </> : <>Novo Assunto: </>}
                Depois: “{artigo?.title ?? title}”{artigo?.scope ? ` · ${artigo.scope}` : ""}
              </p>
              {preview.result.notices.map(nota => <p key={nota} className="text-text-muted">{nota}</p>)}
              {preview.result.blockers.length ? <p className="text-warning" data-subject-article-blockers>Não pode gravar: {preview.result.blockers.join(" · ")}</p> : null}
            </div>
          ) : null}
          {refusal ? (
            <p role="alert" className="flex items-start gap-2 text-danger" data-subject-article-refusal><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Nada foi gravado: {refusal.message}{refusal.blockers.length ? ` (${refusal.blockers.join(" · ")})` : ""}</p>
          ) : null}
          {phase === "done" ? (
            <p role="status" className="flex items-center gap-2 font-semibold text-success" data-subject-article-saved><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />Assunto gravado e conferido na releitura.</p>
          ) : null}
          {reapprove ? <p role="status" className="text-foreground" data-subject-article-reapproved>{reapprove}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {phase !== "done" ? <button type="button" className={internalButton} disabled={busy} onClick={() => setOpen(false)}>Cancelar</button> : null}
            {phase !== "done" ? (
              <span className="inline-flex items-center gap-1">
                <button type="button" className={internalButton} disabled={busy || !title.trim()} onClick={() => void revisar()} data-subject-article-review>
                  {phase === "previewing" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{SUBJECT_EDITOR_TEXTS.review}
                </button>
                <InfoHint title={SUBJECT_EDITOR_TEXTS.review} description="Mostra o antes → depois pelo núcleo do cadastro. Nada é gravado e nada é pago." />
              </span>
            ) : null}
            {phase !== "done" ? (
              <span className="inline-flex items-center gap-1">
                <button type="button" className={internalButtonPrimary} disabled={busy || !preview?.result.canApply} onClick={() => void gravar()} data-subject-article-save>
                  {phase === "applying" || phase === "rereading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{SUBJECT_EDITOR_TEXTS.save}
                </button>
                <InfoHint title={SUBJECT_EDITOR_TEXTS.save} description="Grava o Assunto mostrado na prévia (o mesmo pedido), com compare-and-swap, e relê a planilha antes de dizer que gravou." />
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <button type="button" className={internalButtonPrimary} onClick={() => void reaprovar()} data-subject-article-reapprove>{SUBJECT_EDITOR_TEXTS.reapprove}</button>
                <InfoHint title={SUBJECT_EDITOR_TEXTS.reapprove} description="O follow-up de sempre do cadastro: roda a Lógica (grátis) e reaprova pelo núcleo da planilha. Enviar ao Arquiteto continua no “Aprovar e enviar”." />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
