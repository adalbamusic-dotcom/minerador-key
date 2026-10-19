"use client";

import { useEffect, useMemo, useState } from "react";
import { useNoticeBridge } from "@/components/global-notice-center";
import { InfoHint } from "@/components/info-hint";
import {
  RADAR_ARCHITECT_ADOPT_BUTTON,
  RADAR_ARCHITECT_ADOPT_LINKS_BUTTON,
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
 *
 * 2026-10-14 · LINKS: quando o grafo de links aprovado vigente do Silo é mais
 * novo que o transportado, o artigo aparece também como "Atualização
 * disponível do Arquiteto · links" (o que entra, o que sai, a obrigação e quem
 * aponta para ele). Adotar troca só os links: sem reenviar e sem refazer a
 * pesquisa, também em item finalizado ou enviado ao Redator. A marcação é por
 * atualização (o mesmo artigo pode ter as duas).
 */

const botao = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const botaoPrincipal = "inline-flex min-h-10 items-center justify-center rounded-md border border-context-accent px-3 py-2 text-sm font-medium text-foreground transition-colors hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const bloco = "rounded-md border border-divider bg-surface-subtle p-3";

type Desfecho = { articleId: string; status: string; updateKind?: string; title?: string; reason?: string; from?: number; to?: number; fromGraphVersion?: number | null; toGraphVersion?: number; redo?: string[]; refreeze?: boolean };

/** 2026-10-18 · O "i" do botão de adotar: o que a confirmação faz, inclusive o congelamento novo. */
export const RADAR_ARCHITECT_ADOPT_HINT = "Leva os artigos marcados à versão nova do Arquiteto sem reenviar nada. Se a investigação já estava congelada e a principal ficou, a mesma confirmação segue sozinha: pesquisa só o que falta (cache primeiro, 4 lentes), congela de novo pelo \"Finalizar\" de sempre e organiza o artigo-modelo. O custo de cada artigo está na prévia, em \"Custo\". A investigação antiga fica no histórico.";

/** A marcação é por atualização: o mesmo artigo pode ter a versão nova do ArticleDNA e os links novos. */
const tipoDe = (item: Pick<RadarArchitectUpdatePreviewItem, "updateKind">) => item.updateKind ?? "article_dna";
const chaveDe = (item: Pick<RadarArchitectUpdatePreviewItem, "updateKind" | "articleId">) => `${tipoDe(item)}:${item.articleId}`;

/** O texto de um desfecho confirmado pelo servidor. */
function textoDoDesfecho(item: Desfecho): string {
  if (item.status !== "adopted") return `${item.title || item.articleId}: ${item.reason}`;
  if (item.updateKind === "links") return `${item.title}: links do grafo v${item.toGraphVersion} (era ${typeof item.fromGraphVersion === "number" ? `v${item.fromGraphVersion}` : "o do envio"}). A pesquisa e o pacote ficam.`;
  if (item.refreeze) return `${item.title}: agora na v${item.to} (era v${item.from}). Investigação reaberta: o congelamento novo segue agora (pesquisa do que falta, análise, congelamento e artigo-modelo) — acompanhe na faixa do lote.`;
  return `${item.title}: agora na v${item.to} (era v${item.from}).${item.redo?.length ? ` Para refazer: ${item.redo.join(" ")}` : ""}`;
}

/** A prévia da marca (só leitura): os itens do Radar atrás de uma versão aprovada mais nova do ArticleDNA. */
async function lerAtualizacoesDoArquiteto(brandId: string, sinal: AbortSignal): Promise<RadarArchitectUpdatePreviewItem[]> {
  /* 2026-10-18 · a tela continua o congelamento novo: a investigação congelada (principal igual) é adotável aqui. */
  const resposta = await fetch(`/api/editorial/radar-architect-update?brandId=${encodeURIComponent(brandId)}&continueOnScreen=1`, { headers: { Accept: "application/json" }, signal: sinal });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !corpo?.ok) throw new Error(corpo?.error || "Não foi possível ler as atualizações do Arquiteto.");
  return Array.isArray(corpo.items) ? corpo.items as RadarArchitectUpdatePreviewItem[] : [];
}

export function RadarArchitectUpdatePanel({ brandId, articleIds, onAdopted }: {
  brandId: string | null;
  /** Os artigos que a planilha mostra (o recorte da cor vale aqui). */
  articleIds: readonly string[];
  /**
   * Depois da adoção confirmada pelo servidor: o aviso e a releitura da mesa.
   * 2026-10-18 · `refreezeArticleIds`: os artigos reabertos que a página leva
   * ao congelamento novo pelo "Pesquisar e finalizar" de sempre.
   */
  onAdopted: (message: string, refreezeArticleIds?: string[]) => void | Promise<void>;
}) {
  const [itens, setItens] = useState<RadarArchitectUpdatePreviewItem[]>([]);
  const [aberto, setAberto] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<"" | "gravando">("");
  const [erro, setErro] = useState<string | null>(null);
  /* 2026-10-18 · todos os avisos no sino (regra do dono): a falha de leitura e a da adoção vão para o sino; as linhas da tela saíram. */
  useNoticeBridge({ notice: erro || "", module: "radar", area: "Radar · Atualização do Arquiteto", title: "Radar · Atualização do Arquiteto", fallbackSeverity: "ERROR" });
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
        setMarcados(new Set(doRecorte.filter(item => item.adoptable).map(chaveDe)));
        setErro(null);
      })
      .catch(falha => {
        if ((falha as { name?: string })?.name === "AbortError") return;
        setErro(falha instanceof Error ? falha.message : "Não foi possível ler as atualizações do Arquiteto.");
      });
    return () => controle.abort();
  }, [brandId, chave, rodada]);

  const porSilo = useMemo(() => radarArchitectUpdatesBySilo(itens), [itens]);
  const selecionados = itens.filter(item => item.adoptable && marcados.has(chaveDe(item)));
  const artigosComAtualizacao = new Set(itens.map(item => item.articleId)).size;
  const comLinks = new Set(itens.filter(item => tipoDe(item) === "links").map(item => item.articleId)).size;
  const selecionaVersao = selecionados.some(item => tipoDe(item) === "article_dna");
  const selecionaLinks = selecionados.some(item => tipoDe(item) === "links");
  const textoDoBotao = selecionaVersao && selecionaLinks ? `${RADAR_ARCHITECT_ADOPT_BUTTON} e os links` : selecionaLinks ? RADAR_ARCHITECT_ADOPT_LINKS_BUTTON : RADAR_ARCHITECT_ADOPT_BUTTON;

  const alternar = (chave: string) => setMarcados(atual => {
    const proximo = new Set(atual);
    if (proximo.has(chave)) proximo.delete(chave); else proximo.add(chave);
    return proximo;
  });
  const alternarSilo = (grupo: RadarArchitectUpdatePreviewItem[], marcar: boolean) => setMarcados(atual => {
    const proximo = new Set(atual);
    for (const item of grupo) if (item.adoptable) { if (marcar) proximo.add(chaveDe(item)); else proximo.delete(chaveDe(item)); }
    return proximo;
  });

  const adotar = async () => {
    if (!brandId || !selecionados.length) return;
    setEstado("gravando");
    setErro(null);
    try {
      const decisionHash = await radarArchitectAdoptionDecisionHash(selecionados);
      const linkArticleIds = selecionados.filter(item => tipoDe(item) === "links").map(item => item.articleId);
      const resposta = await fetch("/api/editorial/radar-architect-update", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          action: "adopt", brandId,
          articleIds: selecionados.filter(item => tipoDe(item) === "article_dna").map(item => item.articleId),
          ...(linkArticleIds.length ? { linkArticleIds } : {}),
          decisionHash,
          continueOnScreen: true,
        }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok || !corpo?.ok) throw new Error(corpo?.error || "A adoção não foi confirmada pelo servidor.");
      const lista = (corpo.results || []) as Desfecho[];
      setDesfechos(lista);
      const adotados = lista.filter(item => item.status === "adopted" && item.updateKind !== "links").length;
      const linksAdotados = lista.filter(item => item.status === "adopted" && item.updateKind === "links").length;
      const recusados = lista.filter(item => item.status === "refused");
      const partes = [
        ...(adotados || !linksAdotados ? [`${adotados} artigo(s) passaram a transportar a versão nova do Arquiteto (confirmado pelo servidor)`] : []),
        ...(linksAdotados ? [`${linksAdotados} artigo(s) passaram a transportar os links novos do Arquiteto, sem refazer a pesquisa (confirmado pelo servidor)`] : []),
      ];
      if (recusados.length) partes.push(`${recusados.length} recusado(s): ${recusados.map(item => item.reason).join(" ")}`);
      const congelarDeNovo = lista.filter(item => item.status === "adopted" && item.updateKind !== "links" && item.refreeze).map(item => item.articleId);
      if (congelarDeNovo.length) partes.push(`${congelarDeNovo.length} com a investigação reaberta: o congelamento novo segue agora, pelo "Pesquisar e finalizar" de sempre`);
      await onAdopted(partes.join(" · "), congelarDeNovo);
      setRodada(valor => valor + 1);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "A adoção não foi concluída.");
    } finally {
      setEstado("");
    }
  };

  if (!brandId || (!itens.length && !desfechos.length)) return null;

  const ocupado = Boolean(estado);
  return <div className="mt-2 space-y-2" data-testid="radar-architect-update">
    {itens.length > 0 && <div className="flex flex-wrap items-center gap-2" role="status">
      <p className="text-sm text-pending" data-testid="radar-architect-update-count">{RADAR_ARCHITECT_UPDATE_LABEL} · {artigosComAtualizacao} artigo(s){comLinks ? ` · links novos em ${comLinks}` : ""}</p>
      {!aberto && <button type="button" className={botao} disabled={ocupado} onClick={() => { setAberto(true); setDesfechos([]); }} data-testid="radar-architect-update-open"
        title="Mostra o que mudou e o que a adoção reaproveita. Ler não grava nada.">Ver e adotar</button>}
    </div>}
    {desfechos.length > 0 && <ul className="space-y-1 text-sm leading-6 text-foreground" data-testid="radar-architect-update-results">
      {desfechos.map(item => <li key={`${item.updateKind ?? "article_dna"}:${item.articleId}`}>{textoDoDesfecho(item)}</li>)}
    </ul>}
    {aberto && itens.length > 0 && <div className={`${bloco} space-y-3`} role="region" aria-label={RADAR_ARCHITECT_UPDATE_LABEL} data-testid="radar-architect-update-panel">
      <p className="text-sm leading-6 text-text-muted">A prévia é leitura e não altera nada. O Radar se adapta ao Arquiteto: não reagrupa, não troca a principal por conta própria e não muda slug, canonical nem URL publicados. Links novos não pedem pesquisa nova: links não mudam a SERP. Desmarque o que não quer adotar agora.</p>
      {porSilo.map(grupo => {
        const adotaveis = grupo.items.filter(item => item.adoptable);
        const todos = adotaveis.length > 0 && adotaveis.every(item => marcados.has(chaveDe(item)));
        return <section key={grupo.siloId ?? "sem-silo"} className="space-y-2" aria-label={`Silo ${grupo.siloName}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Silo: {grupo.siloName}</p>
            {adotaveis.length > 1 && <button type="button" className={botao} disabled={ocupado} onClick={() => alternarSilo(grupo.items, !todos)} data-testid="radar-architect-update-silo">
              {todos ? `Desmarcar o Silo (${adotaveis.length})` : `Marcar o Silo inteiro (${adotaveis.length})`}
            </button>}
          </div>
          <ul className="space-y-2">
            {grupo.items.map(item => <li key={chaveDe(item)} className="rounded-md border border-divider p-3" data-testid="radar-architect-update-item" data-classification={item.classification} data-update-kind={tipoDe(item)}>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={item.adoptable && marcados.has(chaveDe(item))} disabled={!item.adoptable || ocupado} onChange={() => alternar(chaveDe(item))}/>
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
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={botaoPrincipal} disabled={ocupado || !selecionados.length} onClick={() => void adotar()} data-testid="radar-architect-update-confirm">
          {estado === "gravando" ? "Adotando…" : `${textoDoBotao} (${selecionados.length})`}
        </button>
        <InfoHint title={RADAR_ARCHITECT_ADOPT_BUTTON} description={RADAR_ARCHITECT_ADOPT_HINT} side="top" align="start" />
        <button type="button" className={botao} disabled={estado === "gravando"} onClick={() => { setAberto(false); setErro(null); }} data-testid="radar-architect-update-close">Fechar</button>
      </div>
    </div>}
  </div>;
}
