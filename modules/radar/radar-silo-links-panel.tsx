"use client";

import { useState } from "react";
import type { RadarSiloLinksArticle, RadarSiloLinksReading } from "@/lib/server/radar-silo-links";
import { RADAR_STORED_ZIP_MIME, radarStoredZipOfTexts } from "@/lib/radar/stored-zip";

/**
 * ===== 2026-10-14 · F5 · O PAINEL "MALHA X/Y" DO SILO E OS LINKS A ATIVAR (só leitura) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §6.5 e
 * D10. No painel do artigo do Radar: "Conferir links do Silo" lê a malha de cada
 * artigo do Silo pelo mesmo núcleo do CSV "Para escrever" (POST
 * /api/editorial/radar-silo-links), cruza com a publicação de hoje e com os links
 * das páginas publicadas (só GET) e mostra a malha no ar (X/Y), os links a ativar
 * (destino que estava novo e foi ao ar) e o que falta em cada página publicada,
 * com o `-links.csv` de cada artigo para baixar. Nada é gravado; nenhuma IA;
 * nenhum custo; a página publicada, a URL, o slug e o canonical nunca mudam.
 */

const botao = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const botaoPrincipal = "inline-flex min-h-10 items-center justify-center rounded-md border border-context-accent px-3 py-2 text-sm font-medium text-foreground transition-colors hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const bloco = "rounded-md border border-divider bg-surface-subtle p-3";

type Leitura = RadarSiloLinksReading & { success: true };

function baixar(conteudo: Blob, nome: string) {
  const url = URL.createObjectURL(conteudo);
  const ancora = document.createElement("a");
  ancora.href = url;
  ancora.download = nome;
  document.body.appendChild(ancora);
  ancora.click();
  ancora.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const papelENumero = (artigo: RadarSiloLinksArticle) =>
  `${artigo.position ? `${String(artigo.position).padStart(2, "0")} · ` : ""}${artigo.role ?? "artigo"}`;

function resumoDoArtigo(artigo: RadarSiloLinksArticle): string {
  const partes = [
    artigo.published ? (artigo.mesh ? `malha ${artigo.mesh.placed}/${artigo.mesh.required} na página` : "página não lida agora") : "ainda não publicado",
    `${artigo.counts.ativar} a ativar`,
    ...(artigo.published ? [`${artigo.counts.falta_na_pagina} faltam na página`] : [`${artigo.counts.escrever_com_link} com o link na escrita`]),
    ...(artigo.counts.conferir ? [`${artigo.counts.conferir} a conferir`] : []),
    `${artigo.counts.aguardar_destino} aguardam o destino`,
  ];
  return partes.join(" · ");
}

export function RadarSiloLinksPanel({ brandId, articleId }: { brandId: string; articleId: string }) {
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");

  const conferir = async () => {
    setLendo(true);
    setErro("");
    try {
      const resposta = await fetch("/api/editorial/radar-silo-links", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ brandId, articleId, scope: "silo" }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok || !corpo?.success) throw new Error(corpo?.error || "Não foi possível ler os links do Silo agora.");
      setLeitura(corpo as Leitura);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível ler os links do Silo agora.");
    } finally {
      setLendo(false);
    }
  };

  const baixarTodos = () => {
    if (!leitura?.articles.length) return;
    const pacote = radarStoredZipOfTexts(leitura.articles.map(artigo => ({ name: artigo.filename, text: artigo.csv })), { modifiedAt: new Date(leitura.exportedAt) });
    baixar(new Blob([pacote.slice().buffer as ArrayBuffer], { type: RADAR_STORED_ZIP_MIME }), `links-do-silo-${leitura.exportedAt.slice(0, 10)}.zip`);
  };

  const desteArtigo = leitura?.articles.find(artigo => artigo.articleId === articleId) ?? null;

  return <section className="space-y-3 rounded-md border border-divider bg-surface p-3" data-testid="radar-silo-links">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground">Links do Silo · links a ativar e o que falta nas páginas</h3>
        <p className="mt-1 text-sm leading-6 text-text-muted">Lê a malha de cada artigo do Silo (a mesma do CSV &quot;Para escrever&quot;), a publicação de hoje e os links das páginas publicadas. Só leitura: sem IA, sem custo. A lista nunca altera a página, a URL, o slug nem o canonical.</p>
      </div>
      <button type="button" className={leitura ? botao : botaoPrincipal} disabled={lendo} onClick={() => void conferir()} data-testid="radar-silo-links-conferir">{lendo ? "Lendo as páginas…" : leitura ? "Conferir de novo" : "Conferir links do Silo"}</button>
    </div>
    {erro && <p className="text-sm text-warning" role="status">{erro}</p>}
    {leitura && <>
      <p className="text-sm font-semibold leading-6 text-foreground" data-testid="radar-silo-links-malha">{leitura.summary.line}</p>
      <p className="text-sm leading-6 text-text-muted">{leitura.notice}</p>
      {desteArtigo && <div className={bloco} data-testid="radar-silo-links-a-ativar">
        <p className="text-sm font-semibold text-foreground">Links a ativar deste artigo ({desteArtigo.toActivate.length})</p>
        {desteArtigo.toActivate.length
          ? <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-text-muted">{desteArtigo.toActivate.map(item => <li key={item.id}><strong className="text-foreground">{item.id}</strong> · {item.target} · âncora: {item.anchor} · {item.where}{item.url ? ` → ${item.url}` : ""}</li>)}</ul>
          : <p className="mt-1 text-sm text-text-muted">Nenhum: nenhum destino que estava novo na planta foi ao ar desde então.</p>}
      </div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={botao} disabled={!leitura.articles.length} onClick={baixarTodos} data-testid="radar-silo-links-zip">Baixar os -links.csv do Silo (.zip)</button>
      </div>
      <ul className="space-y-2">{leitura.articles.map(artigo => <li key={artigo.articleId} className={bloco}>
        <details>
          <summary className="cursor-pointer text-sm leading-6 text-foreground"><strong className="font-semibold">{papelENumero(artigo)} · {artigo.article}</strong> — {resumoDoArtigo(artigo)}</summary>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-text-muted">{artigo.items.map(item => <li key={item.id}>
            <strong className="text-foreground">{item.id}</strong> · {item.situationLabel} · {item.target} · {item.obligation} · âncora: {item.anchor} · {item.where}{item.url ? ` → ${item.url}` : ""}
          </li>)}</ul>
        </details>
        <button type="button" className={`${botao} mt-2`} onClick={() => baixar(new Blob([artigo.csv], { type: "text/csv;charset=utf-8" }), artigo.filename)}>Baixar {artigo.filename}</button>
      </li>)}</ul>
      {leitura.withoutRow.length > 0 && <div className={bloco}>
        <p className="text-sm font-semibold text-foreground">Fora desta lista ({leitura.withoutRow.length})</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-text-muted">{leitura.withoutRow.map(item => <li key={item.articleId}>{item.title}: {item.reason}</li>)}</ul>
      </div>}
    </>}
  </section>;
}
