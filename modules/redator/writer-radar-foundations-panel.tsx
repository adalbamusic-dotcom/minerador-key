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
 *
 * SDD do Assunto, F4.2 · com Assunto, o primeiro bloco é o tronco: a nota,
 * onde virar, a seção da virada, a direção do H1, o destino e o alerta, lidos
 * das linhas do envio pela mesma projeção. Sem Assunto, o bloco não existe.
 *
 * ===== 2026-10-09 · O ARTIGO-MODELO É A REFERÊNCIA (regra do piloto) =====
 *
 * O painel mostrava a "Estrutura sugerida", o "Formato vencedor", o "Gancho",
 * o "Tom" e a "Linguagem" do blueprint antigo do YouTube, e nunca o
 * artigo-modelo. Saíram. Com a Marca conhecida, o painel pede ao servidor a
 * MESMA projeção do artigo-modelo que os fundamentos e o pacote da seção
 * recebem (`GET /api/redator/article-blueprint`): H1, promessa, seções,
 * fechamento e a leitura seguinte, com a virada do Assunto pela planta. Sem
 * planta concluída, o estado explícito "ausente", com o motivo e o caminho
 * (organizar no Radar). A camada de vídeo mostra só o observado, com a régua
 * que fez a fotografia; a review da Amazon congelada aparece quando existe.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ContentDocument } from "@/lib/arquiteto/contracts";
import { radarFoundationsOf, radarFoundationsSubjectOf, type RadarFoundations, type RadarFoundationsSubject } from "@/lib/redator/radar-foundations";
import { WRITER_BLUEPRINT_CONTINUATION_LABEL, type WriterArticleBlueprintFoundation } from "@/lib/redator/writer-evidence-catalog";
import { parseBrandRef } from "@/lib/tenant-routing";

const titulo = "text-[12px] font-bold uppercase text-text-muted";
const bloco = "mt-3 rounded border border-divider p-2 text-[12px] leading-5 text-foreground/85";
const rotulo = "text-[12px] uppercase tracking-wide text-text-muted";
const chip = "inline-block rounded border border-divider px-1.5 py-0.5 text-[12px] text-foreground/85";
/* 2026-10-09 · texto de leitura (o artigo-modelo e o seu estado), 14px como o bloco do Assunto. */
const blocoDeLeitura = "mt-3 rounded border border-divider p-2 text-sm leading-6 text-foreground/85";
const acao = "mt-2 inline-block rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary hover:border-action-accent";
/* 2026-10-09 (correção) · as saídas que eram decisão de formato de vídeo na camada antiga (a decisão hoje é a do plano do vídeo). */
const SAIDAS_DE_FORMATO_DE_VIDEO: ReadonlySet<string> = new Set(["SHORTS", "YOUTUBE_VIDEO"]);

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

function CampoDoAssunto({ rotulo: nome, children, testid }: { rotulo: string; children: React.ReactNode; testid: string }) {
  return <div data-radar-subject-field={testid}>
    <dt className="font-semibold text-foreground">{nome}</dt>
    <dd>{children}</dd>
  </div>;
}

/*
 * O TRONCO NO TOPO. Texto de leitura, então 14px (sistema visual §3), e o
 * mesmo desenho do bloco do Assunto no artigo-modelo do Radar.
 */
function AssuntoDoArtigo({ assunto }: { assunto: RadarFoundationsSubject }) {
  return <section className="mt-3 rounded border border-divider p-2 text-sm leading-6 text-foreground/85" data-radar-foundations-section="subject">
    <h3 className="text-sm font-semibold text-foreground">Assunto (tronco){assunto.phrase ? `: ${assunto.phrase}` : ""}</h3>
    {assunto.note && <p className="text-text-muted" data-radar-subject-field="note">{assunto.note}</p>}
    <dl className="mt-1.5 space-y-1.5">
      {assunto.turn && <CampoDoAssunto rotulo="Onde fazer a virada" testid="turn">{assunto.turn}</CampoDoAssunto>}
      {assunto.section && <CampoDoAssunto rotulo="Seção da virada" testid="section">
        {assunto.section}
        {assunto.sectionIsWorkingTitle && <span className="mt-0.5 block text-warning" data-radar-subject-working-title="">
          Esse título é de trabalho do Radar: reescreva-o para o leitor antes de usá-lo no artigo.
        </span>}
      </CampoDoAssunto>}
      {assunto.h1 && <CampoDoAssunto rotulo="Direção do H1" testid="h1">{assunto.h1}</CampoDoAssunto>}
      {assunto.destination && <CampoDoAssunto rotulo="Destino da chamada" testid="destination">{assunto.destination}</CampoDoAssunto>}
    </dl>
    {assunto.alert && <p className="mt-1.5 text-warning" data-radar-subject-field="alert">Alerta do Radar: {assunto.alert}</p>}
    {assunto.others.length > 0 && <ul className="mt-1.5 list-disc space-y-0.5 pl-4" data-radar-subject-field="others">
      {assunto.others.map((linha, indice) => <li key={`${indice}:${linha.slice(0, 24)}`}>{linha}</li>)}
    </ul>}
    <p className="mt-1.5 text-text-muted">Onde virar é sugestão do Radar; a decisão é de quem redige. O artigo faz a virada da principal para o Assunto, sem trocá-lo nem removê-lo.</p>
  </section>;
}

/* ===================== 2026-10-09 · o artigo-modelo ===================== */

type LeituraDaPlanta =
  | { estado: "lendo" }
  | { estado: "approved"; blueprint: WriterArticleBlueprintFoundation; editorialContext: string[] | null }
  | { estado: "absent"; motivo: string }
  | { estado: "erro"; motivo: string };

/** A Marca do painel: a que quem chama passa ou, sem ela, a do endereço (`/{brandRef}/…`). */
function marcaDoEndereco(caminho: string | null): { brandRef: string; brandId: string } | null {
  const segmento = (caminho || "").split("/").filter(Boolean)[0] ?? "";
  if (!segmento) return null;
  try {
    return { brandRef: segmento, brandId: parseBrandRef(segmento).brandId };
  } catch {
    return null;
  }
}

function ArtigoModelo({ leitura, radarHref }: { leitura: LeituraDaPlanta; radarHref: string | null }) {
  if (leitura.estado === "lendo") {
    return <section className={blocoDeLeitura} data-radar-foundations-section="article-blueprint" data-radar-article-blueprint-state="lendo">
      <h3 className="text-sm font-semibold text-foreground">Artigo-modelo da SERP</h3>
      <p className="text-text-muted">Lendo o artigo-modelo concluído deste pacote…</p>
    </section>;
  }
  if (leitura.estado !== "approved") {
    return <section className={blocoDeLeitura} data-radar-foundations-section="article-blueprint" data-radar-article-blueprint-state={leitura.estado}>
      <h3 className="text-sm font-semibold text-foreground">Artigo-modelo da SERP: {leitura.estado === "absent" ? "ausente" : "não lido agora"}</h3>
      <p className={leitura.estado === "absent" ? "text-warning" : "text-danger"}>{leitura.motivo}</p>
      {leitura.estado === "absent" && <>
        <p className="mt-1 text-text-muted">O roteiro, os cortes, o carrossel e as seções saem do artigo-modelo concluído. Sem ele, nada é montado por outra estrutura.</p>
        {radarHref && <Link href={radarHref} className={acao} data-radar-article-blueprint-organize="">
          Organizar o artigo-modelo no Radar
        </Link>}
        <p className="mt-1 text-text-muted">No Radar, o botão diz o custo antes do clique (até 2 chamadas de IA por artigo).</p>
      </>}
    </section>;
  }
  const planta = leitura.blueprint;
  const fontes = (planta.needsSource?.length ?? 0) + planta.sections.reduce((soma, secao) => soma + (secao.needsSource?.length ?? 0), 0);
  return <section className={blocoDeLeitura} data-radar-foundations-section="article-blueprint" data-radar-article-blueprint-state="approved">
    <h3 className="text-sm font-semibold text-foreground">Artigo-modelo da SERP · v{planta.version ?? "?"}</h3>
    <p className="text-text-muted">A referência do artigo, do roteiro e do carrossel: as seções, os capítulos e as lâminas seguem esta planta.</p>
    {planta.h1 && <p className="mt-1"><span className="font-semibold text-foreground">H1:</span> {planta.h1}</p>}
    {planta.promise && <p><span className="font-semibold text-foreground">Promessa:</span> {planta.promise}</p>}
    <ol className="mt-1 list-decimal space-y-0.5 pl-5" data-radar-article-blueprint-sections="">
      {planta.sections.map((secao, indice) => <li key={`${indice}:${secao.h2.slice(0, 24)}`}>
        <span className="text-foreground">{secao.h2}</span>
        {secao.readerQuestion && <span className="block text-text-muted">{secao.readerQuestion}</span>}
      </li>)}
    </ol>
    {planta.closing?.cta && <p className="mt-1"><span className="font-semibold text-foreground">CTA (a única chamada):</span> {planta.closing.cta}</p>}
    {planta.closing?.nextStep && <p data-radar-article-blueprint-continuation=""><span className="font-semibold text-foreground">{WRITER_BLUEPRINT_CONTINUATION_LABEL}:</span> {planta.closing.nextStep}</p>}
    {fontes > 0 && <p className="mt-1 text-text-muted">{fontes} frase(s) da planta só entram com fonte do pacote; sem ela, saem delimitadas ou ficam fora do texto.</p>}
    {(planta.publishedMap?.length ?? 0) > 0 && <>
      <p className={`mt-1 ${rotulo}`}>Mapa da página publicada</p>
      <Lista itens={(planta.publishedMap ?? []).map(item => `"${item.current}" ${item.line}`)}/>
    </>}
  </section>;
}

export function WriterRadarFoundationsPanel({ document, compact = false, brandId = null }: { document: ContentDocument | null | undefined; compact?: boolean; /** 2026-10-09 · A Marca do documento, para ler o artigo-modelo; sem ela, a do endereço. */ brandId?: string | null }) {
  const fundamentos: RadarFoundations | null = useMemo(() => radarFoundationsOf(document), [document]);
  const caminho = usePathname();
  const doEndereco = useMemo(() => marcaDoEndereco(caminho), [caminho]);
  const marca = brandId || doEndereco?.brandId || null;
  const documentId = document?.id ?? null;
  const articleId = document?.schemaVersion === 2 ? document.radarOrigin?.articleId ?? null : null;
  const radarHref = doEndereco && articleId ? `/${doEndereco.brandRef}/radar/${encodeURIComponent(articleId)}` : null;
  const temDossie = Boolean(fundamentos);
  const [lida, setLida] = useState<{ chave: string; leitura: LeituraDaPlanta } | null>(null);
  const chave = marca && documentId && temDossie ? `${marca}:${documentId}` : null;

  useEffect(() => {
    if (!chave || !marca || !documentId) return;
    let vivo = true;
    void (async () => {
      try {
        const resposta = await fetch(`/api/redator/article-blueprint?brandId=${encodeURIComponent(marca)}&documentId=${encodeURIComponent(documentId)}`, { cache: "no-store" });
        const corpo = await resposta.json().catch(() => null) as { state?: string; blueprint?: WriterArticleBlueprintFoundation; editorialContext?: string[] | null; reason?: string; error?: string } | null;
        if (!vivo) return;
        if (!resposta.ok) setLida({ chave, leitura: { estado: "erro", motivo: corpo?.error || "a leitura falhou agora; tente de novo." } });
        else if (corpo?.state === "approved" && corpo.blueprint) setLida({ chave, leitura: { estado: "approved", blueprint: corpo.blueprint, editorialContext: corpo.editorialContext ?? null } });
        /* 2026-10-09 (correção) · a leitura das plantas falhou no servidor: "não lido agora", sem o link de organizar (que é pago). */
        else if (corpo?.state === "unreadable") setLida({ chave, leitura: { estado: "erro", motivo: corpo.reason || "a leitura falhou agora; tente de novo." } });
        else setLida({ chave, leitura: { estado: "absent", motivo: corpo?.reason || "nenhum artigo-modelo concluído para este pacote." } });
      } catch {
        if (vivo) setLida({ chave, leitura: { estado: "erro", motivo: "a leitura falhou agora; tente de novo." } });
      }
    })();
    return () => { vivo = false; };
  }, [chave, marca, documentId]);

  const leitura: LeituraDaPlanta | null = !chave ? null : lida?.chave === chave ? lida.leitura : { estado: "lendo" };
  /* 2026-10-09 · com a planta lida, a virada do Assunto é a dela (as linhas do envio podem ser da régua antiga). */
  const linhasDoAssunto = leitura?.estado === "approved" && leitura.editorialContext ? leitura.editorialContext : fundamentos?.editorialContext;
  const assunto = useMemo(() => radarFoundationsSubjectOf(linhasDoAssunto ? { editorialContext: linhasDoAssunto } : null), [linhasDoAssunto]);

  if (!fundamentos) {
    return <div data-radar-foundations="ausente" className="rounded border border-dashed border-divider p-3 text-[12px] text-text-muted">
      Este documento não veio do Radar com dossiê. Importe-o pelo Radar para ver os fundamentos aqui.
    </div>;
  }

  const { youtube, multimodal, review, evidence } = fundamentos;
  /* 2026-10-09 (correção) · a decisão de formato de vídeo é a do plano: Shorts × vídeo longo da camada antiga não aparece. */
  const recomendacoes = fundamentos.recommendations.filter(item => !SAIDAS_DE_FORMATO_DE_VIDEO.has(item.output));

  return <div data-radar-foundations="presente" data-radar-foundations-profile={fundamentos.profile} className={compact ? "" : "mb-3"}>
    <h2 className={titulo}>Fundamentos do Radar</h2>
    <p className="mt-1 text-[12px] text-text-muted">
      Investigação {fundamentos.profileLabel}
      {fundamentos.observedAt ? ` · congelada em ${new Date(fundamentos.observedAt).toLocaleString("pt-BR")}` : ""}
    </p>

    {assunto && <AssuntoDoArtigo assunto={assunto}/>}

    {leitura && <ArtigoModelo leitura={leitura} radarHref={radarHref}/>}

    {/*
      * ===== A RECOMENDAÇÃO É RECOMENDAÇÃO — NÃO GATE =====
      * 2026-10-09 (correção) · e é matéria-prima: ela vem do blueprint anterior ao
      * artigo-modelo. A saída de formato de vídeo (Shorts × vídeo longo) sai daqui —
      * o formato é o do plano do vídeo, pela amostra pertinente; mostrar as duas
      * dava duas decisões de formato na mesma tela.
      */}
    <Secao nome="Recomendação editorial (matéria-prima do artigo-modelo)" testid="recommendation">
      {recomendacoes.length
        ? recomendacoes.map(item => <div key={item.output} data-radar-editorial-output={item.output}>
          <p><span className={chip}>{item.label}</span> <span className="text-text-muted">sugestão do blueprint anterior — a estrutura e o formato são os do artigo-modelo</span></p>
          {item.objective && <p>{item.objective}</p>}
          {item.reason && <p className="text-text-muted">Razão: {item.reason}</p>}
          <Lista itens={item.sourceSignals}/>
        </div>)
        : <p className="text-text-muted">{fundamentos.recommendations.length
          ? "O formato do vídeo é o do plano do vídeo, pela amostra pertinente do YouTube (CSV de vídeo e semeadura do roteiro e do carrossel)."
          : "O Radar não registrou recomendação de saída para esta investigação."}</p>}
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

    {/*
      * 2026-10-09 · A CAMADA DE VÍDEO, SÓ O OBSERVADO: perfil YouTube ou o vídeo
      * acrescentado ao Google. O formato, o gancho, o roteiro e os cortes saem
      * do artigo-modelo pela leitura do CSV de vídeo (semeadura e CSV), não daqui.
      */}
    {youtube && <Secao nome={youtube.role === "PRIMARY" ? "Pesquisa YouTube" : "Pesquisa YouTube (o artigo também vira vídeo)"} testid="youtube">
      <p>{youtube.comparableVideos} vídeo(s) comparáveis · <strong className="text-foreground">{youtube.longForm} long-form × {youtube.shorts} shorts</strong></p>
      <p className="text-text-muted" data-radar-foundations-youtube-ruler={youtube.ruler}>
        {youtube.ruler === "PERTINENTE"
          ? "Amostra pertinente (mesmo público, público vizinho ou tema geral), pela régua de 2026-10-09."
          : "Amostra inteira: fotografia congelada antes da régua de 2026-10-09, lida como foi gravada."}
      </p>
      {youtube.durationRange && <p>Duração: {youtube.durationRange}</p>}
      {youtube.recurrentChannels.length > 0 && <><p className={rotulo}>Canais recorrentes</p><Lista itens={youtube.recurrentChannels}/></>}
      {youtube.titlePatterns.length > 0 && <><p className={rotulo}>Padrões de título</p><Lista itens={youtube.titlePatterns}/></>}
      {youtube.gaps.length > 0 && <><p className={rotulo}>Lacunas</p><Lista itens={youtube.gaps}/></>}
      <p className="text-text-muted">O roteiro, os cortes e o carrossel seguem o artigo-modelo: os capítulos são as seções dele, e o formato sai da amostra pertinente.</p>
    </Secao>}

    {multimodal && multimodal.crossSerp.length > 0 && <Secao nome="Cruzamento de SERPs" testid="cross-serp">
      <p>{multimodal.crossSerp.map(item => `${item.signal} ${item.count}`).join(" · ")}</p>
    </Secao>}

    {/* 2026-10-09 · a review da Amazon congelada (perfil ou acréscimo ao Google). Os produtos da shortlist vêm do servidor (CSV e fonte do MCP). */}
    {review && <Secao nome={review.role === "PRIMARY" ? "Pesquisa Amazon" : "Review (Amazon congelada)"} testid="review">
      <p>{review.products} produto(s) observado(s){review.intent ? ` · ${review.intent}` : ""}{review.output ? ` · saída: ${review.output}` : ""}</p>
      {review.comparisonAxes.length > 0 && <p>Critérios de comparação: {review.comparisonAxes.join(" · ")}</p>}
      {review.priceBands.length > 0 && <><p className={rotulo}>Faixas de preço observadas</p><Lista itens={review.priceBands}/></>}
      {review.sufficiency && <p className="text-text-muted">{review.sufficiency}</p>}
    </Secao>}

    <Secao nome="SERP e evidências" testid="evidence">
      <p>Fontes: {evidence.sources.length ? evidence.sources.join(" · ") : "nenhuma registrada"}</p>
      {evidence.observedPages !== null && <p>Páginas comparáveis: {evidence.observedPages}</p>}
      {evidence.serpStanding && <p className="text-text-muted">{evidence.serpStanding}</p>}
      <p>Biblioteca de vídeos: {evidence.videoLibrary ? `${evidence.videoLibrary.supported} sustentado(s) · ${evidence.videoLibrary.partial} parcial(is) · ${evidence.videoLibrary.notFound} não encontrado(s)` : "sem camada de vídeo"}</p>
      <p>Especialista: {evidence.specialist ? "camada presente" : "sem camada"}</p>
    </Secao>

    {/*
      * 2026-10-09 (correção) · o que a SERP mostrou, como EVIDÊNCIA: a lista vem do
      * blueprint antigo (só sem ruído) e não aplica o "Não cobrir" nem as exclusões
      * do ArticleDNA. O que responder e cobrir é o que as seções do artigo-modelo
      * dizem; aqui não é exigência.
      */}
    {(fundamentos.mustAnswer.length > 0 || fundamentos.mustCover.length > 0) && <Secao nome="Perguntas e conceitos da SERP (evidência)" testid="coverage">
      {fundamentos.mustAnswer.length > 0 && <><p className={rotulo}>Perguntas observadas</p><Lista itens={fundamentos.mustAnswer}/></>}
      {fundamentos.mustCover.length > 0 && <><p className={rotulo}>Conceitos observados</p><Lista itens={fundamentos.mustCover}/></>}
      <p className="text-text-muted">Evidência, não estrutura: o que o texto responde e cobre está nas seções do artigo-modelo, que já tiram o que o Arquiteto excluiu.</p>
    </Secao>}

    <Secao nome="Limitações" testid="limitations">
      <Lista itens={fundamentos.limitations} vazio="Nenhuma limitação declarada."/>
    </Secao>

    <Secao nome="O Redator não pode" testid="writer-may-not">
      <Lista itens={fundamentos.writerMayNot} vazio="Sem restrições registradas."/>
    </Secao>
  </div>;
}
