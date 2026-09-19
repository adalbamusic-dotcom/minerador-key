"use client";

/**
 * ===== FUNDAMENTOS DO RADAR — REDATOR_DOSSIER_SURFACE_1 =====
 *
 * O mesmo painel nos três ambientes (artigo, roteiro, carrossel), lendo a
 * mesma projeção. No roteiro e no carrossel ele ocupa o painel direito enquanto
 * nenhuma cena está aberta; ao abrir uma cena, o painel passa à mídia dela.
 *
 * SOMENTE LEITURA. Nada aqui grava, chama provider ou IA. A recomendação
 * editorial é exibida como recomendação — ela não decide qual aba existe.
 */

import { useMemo } from "react";
import type { ContentDocument } from "@/lib/arquiteto/contracts";
import { radarFoundationsOf, type RadarFoundations } from "@/lib/redator/radar-foundations";

const titulo = "text-[12px] font-bold uppercase text-text-muted";
const bloco = "mt-3 rounded border border-divider p-2 text-[12px] leading-5 text-foreground/85";
const rotulo = "text-[12px] uppercase tracking-wide text-text-muted";
const chip = "inline-block rounded border border-divider px-1.5 py-0.5 text-[12px] text-foreground/85";

function Lista({ itens, vazio }: { itens: readonly string[]; vazio?: string }) {
  if (!itens.length) return vazio ? <p className="text-text-muted">{vazio}</p> : null;
  return <ul className="list-disc space-y-0.5 pl-4">{itens.map((item, indice) => <li key={`${indice}:${item.slice(0, 24)}`}>{item}</li>)}</ul>;
}

function Secao({ nome, children, testid }: { nome: string; children: React.ReactNode; testid: string }) {
  return <section className={bloco} data-radar-foundations-section={testid}>
    <p className={rotulo}>{nome}</p>
    <div className="mt-1 space-y-1">{children}</div>
  </section>;
}

export function WriterRadarFoundationsPanel({ document, compact = false }: { document: ContentDocument | null | undefined; compact?: boolean }) {
  const fundamentos: RadarFoundations | null = useMemo(() => radarFoundationsOf(document), [document]);

  if (!fundamentos) {
    return <div data-radar-foundations="ausente" className="rounded border border-dashed border-divider p-3 text-[12px] text-text-muted">
      Este documento não veio do Radar com dossiê. Importe-o pelo Radar para ver os fundamentos aqui.
    </div>;
  }

  const { youtube, multimodal, evidence } = fundamentos;

  return <div data-radar-foundations="presente" data-radar-foundations-profile={fundamentos.profile} className={compact ? "" : "mb-3"}>
    <h2 className={titulo}>Fundamentos do Radar</h2>
    <p className="mt-1 text-[12px] text-text-muted">
      Investigação {fundamentos.profileLabel}
      {fundamentos.observedAt ? ` · congelada em ${new Date(fundamentos.observedAt).toLocaleString("pt-BR")}` : ""}
    </p>

    {/* ===== A RECOMENDAÇÃO É RECOMENDAÇÃO — NÃO GATE ===== */}
    <Secao nome="Recomendação editorial" testid="recommendation">
      {fundamentos.recommendations.length
        ? fundamentos.recommendations.map(item => <div key={item.output} data-radar-editorial-output={item.output}>
          <p><span className={chip}>{item.label}</span> <span className="text-text-muted">recomendação do Radar — não limita o formato</span></p>
          {item.objective && <p>{item.objective}</p>}
          {item.reason && <p className="text-text-muted">Razão: {item.reason}</p>}
          <Lista itens={item.sourceSignals}/>
        </div>)
        : <p className="text-text-muted">O Radar não registrou recomendação de saída para esta investigação.</p>}
    </Secao>

    <Secao nome="Keyword" testid="keyword">
      <p>Principal: <strong className="text-foreground">{fundamentos.keyword.principal || "não resolvida"}</strong></p>
      {fundamentos.keyword.secondary.length > 0 && <p>Secundárias: {fundamentos.keyword.secondary.join(" · ")}</p>}
      {fundamentos.keyword.reinforcements.length > 0 && <p>Reforços: {fundamentos.keyword.reinforcements.join(" · ")}</p>}
    </Secao>

    <Secao nome="Pesquisa" testid="research">
      {fundamentos.research.length
        ? fundamentos.research.map(camada => <p key={camada.source} data-radar-research-layer={camada.source}>
          <span className={chip}>{camada.label}</span> {camada.role === "PRIMARY" ? "primária" : "apoio"} · {camada.queries} consulta(s) · {camada.items} {camada.source === "youtube" ? "vídeo(s)" : camada.source === "amazon" ? "produto(s)" : "resultado(s)"} observado(s)
        </p>)
        : <p className="text-text-muted">Sem camadas de pesquisa registradas.</p>}
    </Secao>

    {youtube && <Secao nome="Pesquisa YouTube" testid="youtube">
      <p>{youtube.comparableVideos} vídeo(s) comparáveis · <strong className="text-foreground">{youtube.longForm} long-form × {youtube.shorts} shorts</strong></p>
      {youtube.durationRange && <p>Duração: {youtube.durationRange}</p>}
      {youtube.recurrentChannels.length > 0 && <><p className={rotulo}>Canais recorrentes</p><Lista itens={youtube.recurrentChannels}/></>}
      {youtube.titlePatterns.length > 0 && <><p className={rotulo}>Padrões de título</p><Lista itens={youtube.titlePatterns}/></>}
      {youtube.gaps.length > 0 && <><p className={rotulo}>Lacunas</p><Lista itens={youtube.gaps}/></>}
    </Secao>}

    {(youtube || multimodal) && <Secao nome="Blueprint multimodal" testid="blueprint">
      {youtube?.format && <p>Formato vencedor: <strong className="text-foreground">{youtube.format}</strong></p>}
      {youtube?.hookDirection && <p>Gancho: {youtube.hookDirection.statement}</p>}
      {youtube?.tone && <p>Tom: {youtube.tone}</p>}
      {youtube?.languageDirection && <p>Linguagem: {youtube.languageDirection}</p>}
      {youtube && youtube.titleDirections.length > 0 && <><p className={rotulo}>Título</p><Lista itens={youtube.titleDirections.map(item => item.statement)}/></>}
      {youtube && youtube.script.length > 0 && <>
        <p className={rotulo}>Estrutura sugerida</p>
        <ol className="list-decimal space-y-0.5 pl-4">{youtube.script.map((parte, indice) => <li key={`${indice}:${parte.block}`}><strong className="text-foreground">{parte.block}</strong> — {parte.direction}</li>)}</ol>
      </>}
      {multimodal && multimodal.crossSerp.length > 0 && <p>Cruzamento de SERPs: {multimodal.crossSerp.map(item => `${item.signal} ${item.count}`).join(" · ")}</p>}
    </Secao>}

    <Secao nome="SERP e evidências" testid="evidence">
      <p>Fontes: {evidence.sources.length ? evidence.sources.join(" · ") : "nenhuma registrada"}</p>
      {evidence.observedPages !== null && <p>Páginas comparáveis: {evidence.observedPages}</p>}
      {evidence.serpStanding && <p className="text-text-muted">{evidence.serpStanding}</p>}
      <p>Biblioteca de vídeos: {evidence.videoLibrary ? `${evidence.videoLibrary.supported} sustentado(s) · ${evidence.videoLibrary.partial} parcial(is) · ${evidence.videoLibrary.notFound} não encontrado(s)` : "sem camada de vídeo"}</p>
      <p>Especialista: {evidence.specialist ? "camada presente" : "sem camada"}</p>
    </Secao>

    {(fundamentos.mustAnswer.length > 0 || fundamentos.mustCover.length > 0) && <Secao nome="Perguntas e cobertura" testid="coverage">
      {fundamentos.mustAnswer.length > 0 && <><p className={rotulo}>Precisa responder</p><Lista itens={fundamentos.mustAnswer}/></>}
      {fundamentos.mustCover.length > 0 && <><p className={rotulo}>Precisa cobrir</p><Lista itens={fundamentos.mustCover}/></>}
    </Secao>}

    <Secao nome="Limitações" testid="limitations">
      <Lista itens={fundamentos.limitations} vazio="Nenhuma limitação declarada."/>
    </Secao>

    <Secao nome="O Redator não pode" testid="writer-may-not">
      <Lista itens={fundamentos.writerMayNot} vazio="Sem restrições registradas."/>
    </Secao>
  </div>;
}
