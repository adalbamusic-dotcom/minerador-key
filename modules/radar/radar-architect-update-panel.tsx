"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RADAR_ARCHITECT_ADOPT_BUTTON,
  RADAR_ARCHITECT_UPDATE_LABEL,
  radarArchitectAdoptionDecisionHash,
  radarArchitectUpdatesBySilo,
  type RadarArchitectUpdatePreviewItem,
} from "@/lib/radar/architect-update";

/**
 * ===== F5 · "ATUALIZAÇÃO DISPONÍVEL DO ARQUITETO" (SDD acelerar-fluxo 2026-10-13, item 14) =====
 *
 * Quando o Arquiteto aprova uma versão nova de um artigo que já está no Radar,
 * a faixa diz quantos itens estão atrás e abre a prévia: por Silo, o que mudou
 * (principal, papel, promessa/escopo, Assunto, keywords), o que continua
 * valendo, o que fica para refazer e o custo. A adoção é decisão humana: marcar
 * (o Silo inteiro ou item a item — desmarcar é a recusa por item) e uma
 * confirmação. A prévia é leitura; só "Adotar a versão nova" grava, e o
 * servidor relê antes de dizer que adotou.
 *
 * O rótulo é do eixo de transferência e NÃO é o "Atualização disponível" da
 * publicação. O Arquiteto não é tocado.
 */

const botao = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const botaoPrincipal = "inline-flex min-h-10 items-center justify-center rounded-md border border-context-accent px-3 py-2 text-sm font-medium text-foreground transition-colors hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const bloco = "rounded-md border border-divider bg-surface-subtle p-3";

type Desfecho = { articleId: string; status: string; title?: string; reason?: string; from?: number; to?: number; redo?: string[] };

/** A prévia da marca (só leitura): os itens do Radar atrás de uma versão aprovada mais nova do ArticleDNA. */
async function lerAtualizacoesDoArquiteto(brandId: string, sinal: AbortSignal): Promise<RadarArchitectUpdatePreviewItem[]> {
  const resposta = await fetch(`/api/editorial/radar-architect-update?brandId=${encodeURIComponent(brandId)}`, { headers: { Accept: "application/json" }, signal: sinal });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !corpo?.ok) throw new Error(corpo?.error || "Não foi possível ler as atualizações do Arquiteto.");
  return Array.isArray(corpo.items) ? corpo.items as RadarArchitectUpdatePreviewItem[] : [];
}

export function RadarArchitectUpdatePanel({ brandId, articleIds, onAdopted }: {
  brandId: string | null;
  /** Os artigos que a planilha mostra (o recorte da cor vale aqui). */
  articleIds: readonly string[];
  /** Depois da adoção confirmada pelo servidor: o aviso e a releitura da mesa. */
  onAdopted: (message: string) => void | Promise<void>;
}) {
  const [itens, setItens] = useState<RadarArchitectUpdatePreviewItem[]>([]);
  const [aberto, setAberto] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<"" | "gravando">("");
  const [erro, setErro] = useState<string | null>(null);
  const [desfechos, setDesfechos] = useState<Desfecho[]>([]);
  const [rodada, setRodada] = useState(0);
  const chave = useMemo(() => [...articleIds].sort().join(","), [articleIds]);

  /* A prévia é lida ao abrir a planilha, quando o recorte muda e depois de adotar. Ler não grava nada. */
  useEffect(() => {
    if (!brandId) return;
    const controle = new AbortController();
    const visiveis = new Set(chave ? chave.split(",") : []);
    lerAtualizacoesDoArquiteto(brandId, controle.signal)
      .then(lidos => {
        const doRecorte = lidos.filter(item => visiveis.has(item.articleId));
        setItens(doRecorte);
        setMarcados(new Set(doRecorte.filter(item => item.adoptable).map(item => item.articleId)));
        setErro(null);
      })
      .catch(falha => {
        if ((falha as { name?: string })?.name === "AbortError") return;
        setErro(falha instanceof Error ? falha.message : "Não foi possível ler as atualizações do Arquiteto.");
      });
    return () => controle.abort();
  }, [brandId, chave, rodada]);

  const porSilo = useMemo(() => radarArchitectUpdatesBySilo(itens), [itens]);
  const selecionados = itens.filter(item => item.adoptable && marcados.has(item.articleId));

  const alternar = (articleId: string) => setMarcados(atual => {
    const proximo = new Set(atual);
    if (proximo.has(articleId)) proximo.delete(articleId); else proximo.add(articleId);
    return proximo;
  });
  const alternarSilo = (grupo: RadarArchitectUpdatePreviewItem[], marcar: boolean) => setMarcados(atual => {
    const proximo = new Set(atual);
    for (const item of grupo) if (item.adoptable) { if (marcar) proximo.add(item.articleId); else proximo.delete(item.articleId); }
    return proximo;
  });

  const adotar = async () => {
    if (!brandId || !selecionados.length) return;
    setEstado("gravando");
    setErro(null);
    try {
      const decisionHash = await radarArchitectAdoptionDecisionHash(selecionados);
      const resposta = await fetch("/api/editorial/radar-architect-update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "adopt", brandId, articleIds: selecionados.map(item => item.articleId), decisionHash }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok || !corpo?.ok) throw new Error(corpo?.error || "A adoção não foi confirmada pelo servidor.");
      const lista = (corpo.results || []) as Desfecho[];
      setDesfechos(lista);
      const adotados = lista.filter(item => item.status === "adopted").length;
      const recusados = lista.filter(item => item.status === "refused");
      const partes = [`${adotados} artigo(s) passaram a transportar a versão nova do Arquiteto (confirmado pelo servidor)`];
      if (recusados.length) partes.push(`${recusados.length} recusado(s): ${recusados.map(item => item.reason).join(" ")}`);
      await onAdopted(partes.join(" · "));
      setRodada(valor => valor + 1);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "A adoção não foi concluída.");
    } finally {
      setEstado("");
    }
  };

  if (!brandId || (!itens.length && !desfechos.length)) {
    return erro ? <p className="mt-1 text-sm text-warning" role="status" data-testid="radar-architect-update-error">{erro}</p> : null;
  }

  const ocupado = Boolean(estado);
  return <div className="mt-2 space-y-2" data-testid="radar-architect-update">
    {itens.length > 0 && <div className="flex flex-wrap items-center gap-2" role="status">
      <p className="text-sm text-pending" data-testid="radar-architect-update-count">{RADAR_ARCHITECT_UPDATE_LABEL} · {itens.length} artigo(s)</p>
      {!aberto && <button type="button" className={botao} disabled={ocupado} onClick={() => { setAberto(true); setDesfechos([]); }} data-testid="radar-architect-update-open"
        title="Mostra o que mudou e o que a adoção reaproveita. Ler não grava nada.">Ver e adotar</button>}
    </div>}
    {desfechos.length > 0 && <ul className="space-y-1 text-sm leading-6 text-foreground" data-testid="radar-architect-update-results">
      {desfechos.map(item => <li key={item.articleId}>{item.status === "adopted"
        ? `${item.title}: agora na v${item.to} (era v${item.from}).${item.redo?.length ? ` Para refazer: ${item.redo.join(" ")}` : ""}`
        : `${item.title || item.articleId}: ${item.reason}`}</li>)}
    </ul>}
    {aberto && itens.length > 0 && <div className={`${bloco} space-y-3`} role="region" aria-label={RADAR_ARCHITECT_UPDATE_LABEL} data-testid="radar-architect-update-panel">
      <p className="text-sm leading-6 text-text-muted">A prévia é leitura e não altera nada. O Radar se adapta ao Arquiteto: não reagrupa, não troca a principal por conta própria e não muda slug, canonical nem URL publicados. Desmarque o que não quer adotar agora.</p>
      {erro && <p className="text-sm text-warning" role="status" data-testid="radar-architect-update-error">{erro}</p>}
      {porSilo.map(grupo => {
        const adotaveis = grupo.items.filter(item => item.adoptable);
        const todos = adotaveis.length > 0 && adotaveis.every(item => marcados.has(item.articleId));
        return <section key={grupo.siloId ?? "sem-silo"} className="space-y-2" aria-label={`Silo ${grupo.siloName}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Silo: {grupo.siloName}</p>
            {adotaveis.length > 1 && <button type="button" className={botao} disabled={ocupado} onClick={() => alternarSilo(grupo.items, !todos)} data-testid="radar-architect-update-silo">
              {todos ? `Desmarcar o Silo (${adotaveis.length})` : `Marcar o Silo inteiro (${adotaveis.length})`}
            </button>}
          </div>
          <ul className="space-y-2">
            {grupo.items.map(item => <li key={item.articleId} className="rounded-md border border-divider p-3" data-testid="radar-architect-update-item" data-classification={item.classification}>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={item.adoptable && marcados.has(item.articleId)} disabled={!item.adoptable || ocupado} onChange={() => alternar(item.articleId)}/>
                <span><span className="font-medium">{item.title}</span> <span className="text-text-muted">· /{item.slug}</span><br/><span className="text-pending">{item.label}</span> <span className="text-text-muted">· {item.classificationLabel}</span></span>
              </label>
              {item.changes.length > 0 && <div className="mt-2">
                <p className="text-sm font-medium text-foreground">O que mudou</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">{item.changes.map(change => <li key={change.field}>{change.label}: {change.before ?? "—"} → {change.after ?? "—"}</li>)}</ul>
              </div>}
              {item.refusal
                ? <p className="mt-2 text-sm leading-6 text-warning">Não dá para adotar agora: {item.refusal.reason}</p>
                : <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <div><p className="text-sm font-medium text-foreground">Continua valendo</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">{item.plan.keeps.map(texto => <li key={texto}>{texto}</li>)}</ul></div>
                  <div><p className="text-sm font-medium text-foreground">Fica para refazer</p>{item.plan.redo.length ? <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">{item.plan.redo.map(texto => <li key={texto}>{texto}</li>)}</ul> : <p className="mt-1 text-sm text-text-muted">Nada.</p>}</div>
                  <div><p className="text-sm font-medium text-foreground">Custo</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground">{item.plan.costs.map(texto => <li key={texto}>{texto}</li>)}</ul></div>
                </div>}
            </li>)}
          </ul>
        </section>;
      })}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={botaoPrincipal} disabled={ocupado || !selecionados.length} onClick={() => void adotar()} data-testid="radar-architect-update-confirm">
          {estado === "gravando" ? "Adotando…" : `${RADAR_ARCHITECT_ADOPT_BUTTON} (${selecionados.length})`}
        </button>
        <button type="button" className={botao} disabled={estado === "gravando"} onClick={() => { setAberto(false); setErro(null); }} data-testid="radar-architect-update-close">Fechar</button>
      </div>
    </div>}
  </div>;
}
