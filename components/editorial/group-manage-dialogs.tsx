"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { EditorialGroupDot, EditorialGroupTag } from "@/components/editorial/group-tag";
import {
  applyDeclaredPlanWithdrawChain,
  type DeclaredPlanWithdrawChainOptions,
  type DeclaredPlanWithdrawChainStep,
  loadDeclaredPlanArticles,
  loadEditorialGroupHistory,
  manageEditorialColorGroup,
  previewDeclaredPlanWithdraw,
  type DeclaredPlanWithdrawPreview,
} from "@/components/editorial/group-manage-client";
import {
  activeEditorialGroupsOfColor,
  EDITORIAL_GROUP_COLOR_LABELS,
  EDITORIAL_GROUP_COLORS,
  editorialGroupCountLabel,
  type EditorialGroupColor,
  type EditorialGroupSummary,
} from "@/lib/editorial/editorial-groups";
import { editorialGroupReleaseBlockers, isColorDefaultGroupName } from "@/lib/editorial/editorial-group-manage";
import { formatHistoryCost, type GroupHistoryEntry } from "@/lib/editorial/group-history";
import type { DeclaredPlanArticleView, DeclaredPlanGroupView } from "@/lib/minerador/declared-plan-withdraw-core";

/**
 * GERENCIAR A COR E HISTÓRICO DO GRUPO — os dois diálogos abertos pelo menu da
 * etiqueta de cor da topbar (2026-10-12; SDD §9.1-A e §10.4).
 *
 * Sistema visual (§5.0.2, §6, §11): a cor nunca aparece sozinha (bolinha + nome),
 * texto ≥ 14 px, botões com área de 36–40 px, tokens existentes. Nada aqui
 * escreve sem um clique; sucesso só depois da releitura.
 */

const BOTAO = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-divider px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent disabled:cursor-not-allowed disabled:opacity-50";
const BOTAO_PRIMARIO = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-action-accent px-3 text-sm font-semibold text-foreground transition-colors hover:bg-action-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent disabled:cursor-not-allowed disabled:opacity-50";
const CAMPO = "min-h-10 w-full rounded-md border border-divider bg-surface-subtle px-3 text-sm text-foreground outline-none transition-colors placeholder:text-text-muted hover:border-module-accent/45 focus-visible:border-module-accent focus-visible:ring-2 focus-visible:ring-module-accent/30";

type Aviso = { tone: "success" | "warning" | "danger"; text: string } | null;

const TOM: Record<"success" | "warning" | "danger" | "neutral", string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-text-muted",
};

function Dialogo({ titleId, title, subtitle, onClose, busy, children, footer }: {
  titleId: string;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const fechar = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") fechar(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [fechar]);
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) fechar(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-divider bg-surface-elevated text-foreground shadow-lg">
        <header className="flex items-start justify-between gap-3 border-b border-divider p-4">
          <div className="min-w-0">
            <h2 id={titleId} className="flex flex-wrap items-center gap-2 text-base font-semibold">{title}</h2>
            {subtitle ? <div className="mt-1 text-sm leading-5 text-text-muted">{subtitle}</div> : null}
          </div>
          <button type="button" onClick={fechar} disabled={busy} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent disabled:opacity-50" aria-label="Fechar"><X className="h-4 w-4" aria-hidden="true" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-divider p-4">{footer}</footer> : null}
      </section>
    </div>
  );
}

function AvisoLinha({ aviso, testId }: { aviso: Aviso; testId: string }) {
  if (!aviso) return null;
  return <p role={aviso.tone === "danger" ? "alert" : "status"} data-testid={testId} className={`text-sm leading-5 ${TOM[aviso.tone]}`}>{aviso.text}</p>;
}

/* ============================== GERENCIAR A COR ============================== */

export function EditorialGroupManageDialog({ brandId, groupId, groups, onClose }: {
  brandId: string;
  groupId: string;
  /** A lista viva de grupos da marca (relida depois de cada gravação). */
  groups: readonly EditorialGroupSummary[];
  onClose: () => void;
}) {
  const titleId = useId();
  const nomeId = useId();
  // A lista inclui os arquivados: depois de liberar, o grupo continua aqui (status "archived").
  const atual = groups.find(item => item.id === groupId) ?? null;
  const [nome, setNome] = useState(() => (atual && !isColorDefaultGroupName(atual.name, atual.color) ? atual.name : ""));
  const [corNova, setCorNova] = useState<EditorialGroupColor | null>(null);
  const [confirmarLiberar, setConfirmarLiberar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [liberado, setLiberado] = useState(false);

  if (!atual) return null;
  const rotuloCor = EDITORIAL_GROUP_COLOR_LABELS[atual.color];
  const ocupante = (color: EditorialGroupColor) => activeEditorialGroupsOfColor(groups, color).find(item => item.id !== atual.id) ?? null;
  const temPlano = atual.origin === "declared_plan" || atual.planVersion > 0;
  const bloqueiosLiberar = editorialGroupReleaseBlockers({ keywordCount: atual.keywordCount, trashedKeywordCount: 0, articleCount: atual.articleCount, hasPlan: temPlano, planVersion: atual.planVersion, siloId: atual.siloId });

  const gravar = async (pedido: { name?: string | null; color?: EditorialGroupColor; release?: boolean }) => {
    if (busy) return;
    setBusy(true);
    setAviso(null);
    try {
      const resultado = await manageEditorialColorGroup(brandId, { group: atual, ...pedido });
      if (!resultado.ok) { setAviso({ tone: "danger", text: resultado.message }); return; }
      const texto = resultado.summary.join(" ") || "Gravado.";
      if (resultado.action === "release") setLiberado(true);
      if (pedido.color) setCorNova(null);
      if (pedido.release) setConfirmarLiberar(false);
      setAviso(resultado.confirmed
        ? { tone: "success", text: `Gravado e relido. ${texto}` }
        : { tone: "warning", text: `Gravado no servidor, mas a lista de grupos ainda não mostrou a mudança. Recarregue a página. ${texto}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialogo
      titleId={titleId}
      busy={busy}
      onClose={onClose}
      title={<><span>Gerenciar a cor</span><EditorialGroupTag name={liberado ? rotuloCor : atual.name} color={atual.color} /></>}
      subtitle={liberado ? "A cor está livre." : `${editorialGroupCountLabel(atual)}. Só o grupo muda: definição, versão, status e aprovação ficam como estão.`}
      footer={<button type="button" onClick={onClose} disabled={busy} className={BOTAO}>Fechar</button>}
    >
      <div className="space-y-6" data-group-manage={atual.id}>
        <AvisoLinha aviso={aviso} testId="group-manage-notice" />
        {liberado ? null : <>
          <section className="space-y-2">
            <label htmlFor={nomeId} className="block text-sm font-semibold">Nome (opcional)</label>
            <p className="text-sm text-text-muted">Rótulo livre, por exemplo o nome do Silo. Vazio = o nome da cor ({rotuloCor}).</p>
            <div className="flex flex-wrap gap-2">
              <input id={nomeId} value={nome} maxLength={80} onChange={event => setNome(event.target.value)} placeholder={rotuloCor} className={`${CAMPO} min-w-0 flex-1`} data-group-manage-name />
              <button type="button" disabled={busy} onClick={() => void gravar({ name: nome.trim() ? nome.trim() : null })} className={BOTAO} data-group-manage-save-name>
                {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}Salvar nome
              </button>
            </div>
          </section>

          <section className="space-y-2" aria-labelledby={`${titleId}-cor`}>
            <h3 id={`${titleId}-cor`} className="text-sm font-semibold">Trocar a cor</h3>
            <p className="text-sm text-text-muted">Só para uma cor livre. As keywords e os artigos do grupo vão junto; dois grupos nunca são juntados.</p>
            <div role="radiogroup" aria-label="Cor nova do grupo" className="grid gap-1 sm:grid-cols-2">
              {EDITORIAL_GROUP_COLORS.map(color => {
                const daCor = color === atual.color;
                const outro = ocupante(color);
                const escolhida = corNova === color;
                return (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={daCor ? corNova === null : escolhida}
                    disabled={busy || daCor || Boolean(outro)}
                    data-group-manage-color={color}
                    data-group-manage-color-state={daCor ? "current" : outro ? "taken" : "free"}
                    onClick={() => setCorNova(color)}
                    className={`flex min-h-10 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent disabled:cursor-not-allowed ${escolhida ? "border-module-accent bg-selected" : "border-divider hover:bg-surface"} ${outro ? "opacity-70" : ""}`}
                  >
                    <EditorialGroupDot color={color} />
                    <span className="font-medium">{EDITORIAL_GROUP_COLOR_LABELS[color]}</span>
                    <span className="min-w-0 truncate text-text-muted">{daCor ? "atual" : outro ? `ocupada${outro.name !== EDITORIAL_GROUP_COLOR_LABELS[color] ? ` por “${outro.name}”` : ""}` : "livre"}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" disabled={busy || !corNova} onClick={() => corNova && void gravar({ color: corNova })} className={BOTAO_PRIMARIO} data-group-manage-recolor>
              {corNova ? `Trocar para ${EDITORIAL_GROUP_COLOR_LABELS[corNova]}` : "Escolha uma cor livre"}
            </button>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Liberar a cor</h3>
            {bloqueiosLiberar.length ? (
              <p className="text-sm text-text-muted" data-group-manage-release-blocked>Ainda não: o grupo tem {bloqueiosLiberar.join(", ")}. Mova as keywords e os artigos para outra cor (ou “Tirar do grupo”){temPlano ? " e tire os artigos do plano" : ""} antes.</p>
            ) : (
              <p className="text-sm text-text-muted">O grupo está vazio. Liberar arquiva o grupo (nada é apagado; o histórico fica) e deixa a cor {rotuloCor} livre.</p>
            )}
            {confirmarLiberar ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-warning">Liberar a cor {rotuloCor}?</span>
                <button type="button" disabled={busy} onClick={() => void gravar({ release: true })} className={BOTAO_PRIMARIO} data-group-manage-release-confirm>Confirmar: liberar</button>
                <button type="button" disabled={busy} onClick={() => setConfirmarLiberar(false)} className={BOTAO}>Cancelar</button>
              </div>
            ) : (
              <button type="button" disabled={busy || bloqueiosLiberar.length > 0} onClick={() => setConfirmarLiberar(true)} className={BOTAO} data-group-manage-release>Liberar a cor {rotuloCor}</button>
            )}
          </section>

          {temPlano ? <DeclaredPlanSection brandId={brandId} groupId={atual.id} /> : null}
        </>}
      </div>
    </Dialogo>
  );
}

/* =============================== TIRAR DO PLANO =============================== */

function DeclaredPlanSection({ brandId, groupId }: { brandId: string; groupId: string }) {
  const [lista, setLista] = useState<{ group: DeclaredPlanGroupView; articles: DeclaredPlanArticleView[] } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [previa, setPrevia] = useState<DeclaredPlanWithdrawPreview | null>(null);
  const [busy, setBusy] = useState(false);
  /*
   * SDD acelerar 2026-10-13, item 15 — "Tirar do plano" numa confirmação: a
   * prévia lista os efeitos no Minerador e no Arquiteto; reaprovar+enviar e
   * retirar do Silo vêm marcados. Cada passo é feito pelo núcleo do dono.
   */
  const [opcoes, setOpcoes] = useState<DeclaredPlanWithdrawChainOptions>({ reapproveAndSend: true, withdrawFromSilo: true });
  const [passos, setPassos] = useState<DeclaredPlanWithdrawChainStep[] | null>(null);

  const ler = async () => {
    setCarregando(true);
    try {
      const resultado = await loadDeclaredPlanArticles(brandId, groupId);
      if (!resultado.ok) { setAviso({ tone: "danger", text: resultado.message }); setLista(null); return; }
      setLista({ group: resultado.group, articles: resultado.articles });
    } finally {
      setCarregando(false);
    }
  };

  const gerarPrevia = async (article: DeclaredPlanArticleView) => {
    if (busy) return;
    setBusy(true);
    setAviso(null);
    try {
      const resultado = await previewDeclaredPlanWithdraw(brandId, groupId, article.subject.keywordId, opcoes);
      if (!resultado.ok) { setAviso({ tone: "danger", text: resultado.message }); return; }
      setPassos(null);
      setPrevia(resultado.preview);
    } finally {
      setBusy(false);
    }
  };

  const confirmar = async () => {
    if (!previa || busy) return;
    setBusy(true);
    try {
      const resultado = await applyDeclaredPlanWithdrawChain(brandId, groupId, previa.article.subject.keywordId, previa.decisionHash, opcoes);
      if (!resultado.ok) { setAviso({ tone: "danger", text: resultado.message }); return; }
      setPassos(resultado.steps);
      setAviso({ tone: resultado.complete ? "success" : "warning", text: resultado.complete
        ? `“${previa.article.subject.phrase}” saiu do plano; cada passo foi relido.`
        : `“${previa.article.subject.phrase}”: parte da sequência ficou pendente (veja os passos). Repita “Tirar do plano”: o que já foi feito não se repete.` });
      setPrevia(null);
      await ler();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2" data-declared-plan-section>
      <h3 className="text-sm font-semibold">Plano do Silo</h3>
      <p className="text-sm text-text-muted">“Tirar do plano” tira um artigo do plano declarado sem tirar o Assunto e sem apagar nada. O Pilar não sai sozinho.</p>
      <AvisoLinha aviso={aviso} testId="declared-plan-notice" />
      {!lista ? (
        <button type="button" disabled={carregando} onClick={() => void ler()} className={BOTAO} data-declared-plan-load>
          {carregando ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}Ver artigos do plano
        </button>
      ) : (
        <>
          <p className="text-sm">{lista.group.siloName ? `“${lista.group.siloName}” · ` : ""}plano v{lista.group.planVersion} · {lista.articles.length} artigo(s)</p>
          <ul className="rounded-md border border-divider">
            {lista.articles.map(article => (
              <li key={article.subject.keywordId} data-declared-plan-article={article.subject.keywordId} className="flex flex-wrap items-center gap-2 border-b border-divider px-3 py-2 last:border-b-0">
                <span className="shrink-0 text-sm tabular-nums text-text-muted">{article.order}º</span>
                <span className="shrink-0 rounded border border-divider px-1.5 text-sm text-text-muted">{article.role === "Pilar" ? "Pilar do plano" : "Suporte do plano"}</span>
                <span className="min-w-0 flex-1 break-words text-sm text-keyword">{article.subject.phrase}{article.principal && !article.principal.sameAsSubject ? <span className="text-text-muted"> · principal declarada “{article.principal.phrase}”</span> : null}</span>
                <button type="button" disabled={busy || !article.canWithdraw} title={article.withdrawBlocker || undefined} onClick={() => void gerarPrevia(article)} className={BOTAO} data-declared-plan-withdraw={article.subject.keywordId}>Tirar do plano</button>
                {!article.canWithdraw && article.withdrawBlocker ? <span className="basis-full text-sm text-text-muted">{article.withdrawBlocker}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {previa ? (
        <div className="space-y-2 rounded-md border border-warning/40 p-3" data-declared-plan-preview>
          <p className="text-sm font-semibold">Prévia · tirar “{previa.article.subject.phrase}” do plano</p>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-5">{(previa.chain?.effects ?? previa.effects).map(efeito => <li key={efeito}>{efeito}</li>)}</ul>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={opcoes.reapproveAndSend} disabled={busy} onChange={event => setOpcoes(atual => ({ ...atual, reapproveAndSend: event.target.checked }))} data-declared-plan-chain-reapprove />
            Reaprovar e reenviar ao Arquiteto o que voltar para “Em revisão”
          </label>
          {previa.chain?.arquiteto ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={opcoes.withdrawFromSilo} disabled={busy || !previa.chain.arquiteto.canWithdraw} onChange={event => setOpcoes(atual => ({ ...atual, withdrawFromSilo: event.target.checked }))} data-declared-plan-chain-silo />
              Retirar “{previa.chain.arquiteto.label}” do Silo no Arquiteto
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void confirmar()} className={BOTAO_PRIMARIO} data-declared-plan-confirm>
              {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}Confirmar: tirar do plano
            </button>
            <button type="button" disabled={busy} onClick={() => setPrevia(null)} className={BOTAO}>Cancelar</button>
          </div>
        </div>
      ) : null}
      {passos ? (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-5" data-declared-plan-chain-steps>
          {passos.map(passo => <li key={passo.step}><span className="font-semibold">{passo.step === "plan" ? "Plano" : passo.step === "approve_and_send" ? "Reaprovar e enviar" : "Silo no Arquiteto"}</span> · {passo.message}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

/* ============================== HISTÓRICO DO GRUPO ============================== */

const dataCurta = (iso: string) => {
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? iso : data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export function EditorialGroupHistoryDialog({ brandId, color, groupIds, groups, onClose }: {
  brandId: string;
  color: EditorialGroupColor;
  /** Os grupos ATIVOS da cor (normalmente um). */
  groupIds: readonly string[];
  groups: readonly EditorialGroupSummary[];
  onClose: () => void;
}) {
  const titleId = useId();
  const [estado, setEstado] = useState<{ entries: GroupHistoryEntry[]; ledgerRead: boolean; viewerUserId: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const chave = groupIds.join(",");

  useEffect(() => {
    let vigente = true;
    void loadEditorialGroupHistory(brandId, chave ? chave.split(",") : []).then(resultado => {
      if (!vigente) return;
      if (resultado.ok) { setEstado({ entries: resultado.entries, ledgerRead: resultado.ledgerRead, viewerUserId: resultado.viewerUserId }); setErro(null); }
      else { setEstado({ entries: [], ledgerRead: true, viewerUserId: null }); setErro(resultado.message); }
    });
    return () => { vigente = false; };
  }, [brandId, chave]);

  const nomes = groupIds.map(id => groups.find(group => group.id === id)?.name).filter((nome): nome is string => Boolean(nome));
  const ator = (entry: GroupHistoryEntry) => !entry.actorId ? "—" : entry.actorId === estado?.viewerUserId ? "Você" : `Outro membro · ${entry.actorId.slice(0, 8)}`;

  return (
    <Dialogo
      titleId={titleId}
      busy={false}
      onClose={onClose}
      title={<><span>Histórico do grupo</span><EditorialGroupTag name={nomes[0] || EDITORIAL_GROUP_COLOR_LABELS[color]} color={color} /></>}
      subtitle="Operações do grupo: tipo, data, quem fez, resultado, custo e o link do resultado. Só leitura."
      footer={<button type="button" onClick={onClose} className={BOTAO}>Fechar</button>}
    >
      {estado === null ? (
        <p className="flex items-center gap-2 text-sm text-text-muted" role="status"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Lendo o histórico…</p>
      ) : (
        <div className="space-y-3" data-group-history>
          {erro ? <p role="alert" className="text-sm text-danger">{erro}</p> : null}
          {!estado.ledgerRead ? <p className="text-sm text-warning" data-group-history-ledger-unread>O registro do guarda de retrabalho não pôde ser lido agora; aparecem só os eventos do grupo.</p> : null}
          {!estado.entries.length && !erro ? <p className="text-sm text-text-muted" data-group-history-empty>Nenhuma operação registrada ainda para este grupo.</p> : null}
          {estado.entries.length ? (
            <ul className="rounded-md border border-divider">
              {estado.entries.map(entry => {
                const custo = formatHistoryCost(entry.costUsd);
                return (
                  <li key={entry.id} data-group-history-entry={entry.source} className="grid gap-1 border-b border-divider px-3 py-2 text-sm last:border-b-0 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
                    <span className="tabular-nums text-text-muted">{dataCurta(entry.at)}</span>
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium">{entry.label}{entry.detail ? <span className="font-normal text-text-muted"> · {entry.detail}</span> : null}</p>
                      <p className="text-text-muted">
                        {ator(entry)}
                        {entry.outcome ? <> · <span className={TOM[entry.outcomeTone]}>{entry.outcome}</span></> : null}
                        {custo ? <> · custo {custo}</> : null}
                        {entry.resultHref ? <> · <a href={entry.resultHref} className="text-context-accent underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent">Abrir resultado</a></> : entry.resultRef ? <> · resultado {entry.resultRef}</> : null}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      )}
    </Dialogo>
  );
}
