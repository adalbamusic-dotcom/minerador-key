"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, Tags, X } from "lucide-react";
import { EditorialGroupTag } from "@/components/editorial/group-tag";
import { EDITORIAL_GROUP_COLOR_CLASSES, type EditorialGroupSummary } from "@/lib/editorial/editorial-groups";
import type { ArticleGroupPreviewEntry } from "@/lib/editorial/article-group-core";
import type { ArticleGroupMoveResponse, ArticleGroupTagApplyResponse, ArticleGroupTagPreviewResponse } from "@/components/editorial/use-editorial-groups";

/**
 * CONTROLES DO GRUPO DO ARTIGO (F2) — compartilhados pelo Arquiteto e pelo
 * Radar. Mesmo visual do seletor e do rodapé do Minerador (sistema-visual
 * §5.0.2): bolinha + nome, nunca só a cor; a linha nunca é pintada.
 */

/** Faixa de 4 px da linha (célula da esquerda) — só a classe, para o grid aplicar. */
export const editorialGroupStripeClass = (group: Pick<EditorialGroupSummary, "color"> | null | undefined) =>
  group ? EDITORIAL_GROUP_COLOR_CLASSES[group.color].stripe : "";

/** A etiqueta do grupo na linha, ou nada. */
export function ArticleGroupRowTag({ group, inherited = false, className = "" }: { group: Pick<EditorialGroupSummary, "name" | "color"> | null | undefined; inherited?: boolean; className?: string }) {
  if (!group) return null;
  return <span className={`inline-flex max-w-full ${className}`} title={inherited ? "Grupo herdado das keywords (ainda sem etiqueta gravada no artigo)" : undefined}><EditorialGroupTag name={group.name} color={group.color} /></span>;
}

const MENU_ITEM = "flex min-h-9 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent";

/** Item do menu do seletor: abre a prévia de "Etiquetar artigos pelo grupo das keywords". */
export function ArticleGroupTagMenuItem({ pending, onClick }: { pending: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={MENU_ITEM} data-article-group-tag-open>
      <Tags aria-hidden="true" className="h-4 w-4 text-text-muted" />
      <span className="min-w-0 flex-1">Etiquetar artigos pelo grupo das keywords</span>
      {pending > 0 ? <span className="shrink-0 text-sm text-text-muted">{pending}</span> : null}
    </button>
  );
}

/**
 * "ETIQUETAR ARTIGOS PELO GRUPO DAS KEYWORDS" — prévia antes de gravar.
 *
 * Mostra o que cada artigo vai receber (e por quê: Assunto, principal ou a
 * maioria das keywords) e o que fica como está. "Gravar" manda só os artigos
 * da prévia; o servidor recalcula e grava só quem ainda não tem etiqueta.
 * Sucesso só depois da releitura.
 */
export function ArticleGroupTaggingDialog({ open, onClose, groupById, labelFor, loadPreview, apply, onDone }: {
  open: boolean;
  onClose: () => void;
  groupById: ReadonlyMap<string, EditorialGroupSummary>;
  /** Rótulo da tela para o artigo (quando a prévia não traz a principal). */
  labelFor?: (articleId: string) => string | null;
  loadPreview: () => Promise<ArticleGroupTagPreviewResponse>;
  apply: (articleIds: readonly string[]) => Promise<ArticleGroupTagApplyResponse>;
  onDone: (message: string, tone: "success" | "warning" | "error") => void;
}) {
  const titleId = useId();
  const [entries, setEntries] = useState<ArticleGroupPreviewEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A prévia é lida UMA vez por abertura: a função pode chegar nova a cada render da tela.
  const loadPreviewRef = useRef(loadPreview);
  useEffect(() => { loadPreviewRef.current = loadPreview; }, [loadPreview]);

  useEffect(() => {
    if (!open) return;
    let vigente = true;
    void loadPreviewRef.current().then(resultado => {
      if (!vigente) return;
      if (resultado.ok) { setEntries(resultado.entries); setError(null); }
      else { setEntries([]); setError(resultado.message); }
    });
    return () => { vigente = false; setEntries(null); setError(null); };
  }, [open]);

  const fechar = useCallback(() => { if (!saving) onClose(); }, [onClose, saving]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") fechar(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [fechar, open]);

  if (!open) return null;
  const vaoReceber = (entries || []).filter(entry => entry.status === "will_tag");
  const ficam = (entries || []).filter(entry => entry.status !== "will_tag");
  const motivo = (entry: ArticleGroupPreviewEntry) => entry.reason === "subject" ? "pelo Assunto" : entry.reason === "principal" ? "pela principal" : entry.reason === "majority" ? "pela maioria das keywords" : null;

  const gravar = async () => {
    if (!vaoReceber.length || saving) return;
    setSaving(true);
    try {
      const resultado = await apply(vaoReceber.map(entry => entry.articleId));
      if (!resultado.ok) { setError(resultado.message); return; }
      const partes = [`${resultado.tagged} artigo(s) etiquetado(s) pelo grupo das keywords`];
      if (resultado.notConfirmed) partes.push(`${resultado.notConfirmed} sem confirmação do servidor — recarregue`);
      onDone(`${partes.join(" · ")}.`, resultado.notConfirmed ? "warning" : "success");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const linha = (entry: ArticleGroupPreviewEntry) => {
    const grupo = entry.groupId ? groupById.get(entry.groupId) : undefined;
    const rotulo = entry.label || labelFor?.(entry.articleId) || entry.articleId;
    return (
      <li key={entry.articleId} data-article-group-preview-row={entry.status} className="flex flex-wrap items-center gap-2 border-b border-divider px-3 py-2 last:border-b-0">
        <span className="min-w-0 flex-1 break-words text-sm text-keyword">{rotulo}</span>
        {grupo ? <EditorialGroupTag name={grupo.name} color={grupo.color} /> : null}
        <span className="shrink-0 text-sm text-text-muted">{entry.status === "will_tag" ? motivo(entry) || entry.statusLabel : entry.statusLabel}</span>
      </li>
    );
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) fechar(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-divider bg-surface-elevated text-foreground shadow-lg">
        <header className="flex items-start justify-between gap-3 border-b border-divider p-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">Etiquetar artigos pelo grupo das keywords</h2>
            <p className="mt-1 text-sm leading-5 text-text-muted">O artigo recebe o grupo do Assunto; sem ele, o da principal; sem os dois, o grupo com mais keywords do artigo. Empate não escolhe sozinho. Etiqueta já gravada fica como está. Só o grupo muda: definição, versão, status e aprovação ficam iguais.</p>
          </div>
          <button type="button" onClick={fechar} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent" aria-label="Fechar a prévia"><X className="h-4 w-4" aria-hidden="true" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {entries === null ? (
            <p className="flex items-center gap-2 text-sm text-text-muted" role="status"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Montando a prévia…</p>
          ) : (
            <div className="space-y-4">
              {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Vão receber o grupo ({vaoReceber.length})</h3>
                {vaoReceber.length ? <ul className="rounded-md border border-divider">{vaoReceber.map(linha)}</ul> : <p className="text-sm text-text-muted">Nenhum artigo sem etiqueta com grupo nas keywords.</p>}
              </div>
              {ficam.length ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Ficam como estão ({ficam.length})</h3>
                  <ul className="rounded-md border border-divider">{ficam.map(linha)}</ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-divider p-4">
          <button type="button" onClick={fechar} className="min-h-10 rounded-md border border-divider px-3 text-sm font-medium text-text-muted hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent">Cancelar</button>
          <button type="button" onClick={() => void gravar()} disabled={!vaoReceber.length || saving} data-article-group-tag-apply className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-action-accent px-3 text-sm font-semibold text-foreground hover:bg-action-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
            Gravar {vaoReceber.length} etiqueta(s)
          </button>
        </footer>
      </section>
    </div>
  );
}

const MOVE_RETURN = "__voltar_ao_grupo_das_keywords__";

/**
 * Rodapé: "Grupo ▸ Mover para <grupo> / Voltar ao grupo das keywords" para
 * os artigos selecionados — o mesmo gesto do Minerador. Muda só o grupo.
 */
export function ArticleGroupMoveSelect({ activeGroups, disabled = false, className = "", onMove }: {
  activeGroups: readonly EditorialGroupSummary[];
  disabled?: boolean;
  className?: string;
  onMove: (groupId: string | null) => void;
}) {
  return (
    <select
      defaultValue=""
      disabled={disabled}
      aria-label="Grupo dos artigos selecionados"
      data-article-group-move
      title="Mover os artigos selecionados para um grupo, ou devolvê-los ao grupo das keywords. Muda só o grupo: definição, versão, status e aprovação ficam como estão."
      onChange={event => { const escolha = event.target.value; event.currentTarget.value = ""; if (escolha) onMove(escolha === MOVE_RETURN ? null : escolha); }}
      className={`min-h-9 shrink-0 rounded border border-divider bg-surface-subtle px-2 py-1 text-sm font-medium text-foreground outline-none transition-colors hover:border-module-accent/45 focus-visible:border-module-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <option value="">Grupo</option>
      {activeGroups.length === 0 ? <option value="" disabled>Crie um grupo no seletor do topo</option> : null}
      {activeGroups.map(group => <option key={group.id} value={group.id}>Mover para {group.name}</option>)}
      <option value={MOVE_RETURN}>Voltar ao grupo das keywords</option>
    </select>
  );
}

/** A frase do resultado do mover, igual para as duas telas. */
export function articleGroupMoveNotice(result: ArticleGroupMoveResponse, destino: string | null): { message: string; tone: "success" | "warning" | "error" } {
  if (!result.ok) return { message: result.message, tone: "error" };
  const partes = [destino
    ? `${result.moved.length} artigo(s) movido(s) para o grupo "${destino}"`
    : `${result.returnedToKeywords.length} artigo(s) de volta ao grupo das keywords`];
  if (result.unchanged.length) partes.push(`${result.unchanged.length} já estava(m) assim`);
  if (result.refused.length) partes.push(`${result.refused.length} recusado(s): ${result.refused[0].message}`);
  if (result.notConfirmed.length) partes.push(`${result.notConfirmed.length} sem confirmação do servidor — recarregue`);
  return { message: `${partes.join(" · ")}.`, tone: result.refused.length || result.notConfirmed.length ? "warning" : "success" };
}
