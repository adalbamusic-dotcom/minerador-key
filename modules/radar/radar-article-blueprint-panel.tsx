"use client";

import { useCallback, useEffect, useState } from "react";
import type { RadarArticleBlueprintEdit, RadarArticleBlueprintPayload } from "@/lib/radar/article-blueprint";

/**
 * ===== O ARTIGO-MODELO NA TELA (SDD diretriz editorial, Adendo A, D5 — 2026-10-02) =====
 *
 * "IA analisa → aplica na cópia → humano revisa e aprova." Gerar é um clique
 * explícito, com o custo dito antes; o que a IA devolve aparece inteiro — medidas,
 * keywords, seções, links, imagens — com as correções do servidor; o dono edita
 * (outra versão) e aprova. Só a versão aprovada vai ao CSV.
 */

type Versao = {
  id: string;
  versionNumber: number;
  state: "DRAFT" | "APPROVED";
  origin: "ai" | "human_edit";
  payload: RadarArticleBlueprintPayload;
  validation: string[];
  createdAt: string;
  approvedAt: string | null;
};

type SecaoEditada = { h2: string; readerQuestion: string; answerFirst: string; remove: boolean };

const botao = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const botaoPrincipal = "inline-flex min-h-10 items-center justify-center rounded-md border border-context-accent px-3 py-2 text-sm font-medium text-foreground transition-colors hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const campo = "mt-1 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm leading-6 text-foreground";
const bloco = "rounded-md border border-divider bg-surface-subtle p-3";

const rotuloDoEstado = (versao: Versao) => versao.state === "APPROVED"
  ? "Aprovado — vai ao CSV"
  : versao.origin === "human_edit" ? "Editado — aguardando aprovação" : "Rascunho da IA — aguardando revisão";

type Leitura = { versions: Versao[] } | { error: string; missingTable: boolean };

/** Só busca; quem chama aplica o resultado (o efeito não muda estado antes da resposta). */
async function lerVersoes(brandId: string, articleId: string): Promise<Leitura> {
  try {
    const resposta = await fetch(`/api/editorial/radar-article-blueprint?brandId=${encodeURIComponent(brandId)}&articleId=${encodeURIComponent(articleId)}`, { cache: "no-store" });
    const corpo = await resposta.json().catch(() => ({})) as { success?: boolean; versions?: Versao[]; error?: string };
    if (!resposta.ok || !corpo.success) {
      const semTabela = /radar_article_blueprints|does not exist|schema cache/i.test(corpo.error || "");
      return {
        missingTable: semTabela,
        error: semTabela ? "O artigo-modelo ainda não tem tabela no banco: aplique a migration 20261002120000 antes de usar." : corpo.error || "Não foi possível ler o artigo-modelo.",
      };
    }
    return { versions: corpo.versions || [] };
  } catch {
    return { error: "Sem resposta do servidor ao ler o artigo-modelo.", missingTable: false };
  }
}

export function RadarArticleBlueprintPanel({ brandId, articleId }: { brandId: string; articleId: string }) {
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [carregando, setCarregando] = useState(true);
  /* Sem a tabela, gerar gastaria a chamada paga sem ter onde gravar. */
  const [semTabela, setSemTabela] = useState(false);
  const [ocupado, setOcupado] = useState<"" | "generate" | "edit" | "approve">("");
  const [confirmando, setConfirmando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [rascunho, setRascunho] = useState<{ h1: string; seoTitle: string; metaDescription: string; promise: string; openingQuestion: string; secoes: SecaoEditada[] } | null>(null);

  const aplicar = useCallback((leitura: Leitura) => {
    if ("error" in leitura) { setAviso({ ok: false, texto: leitura.error }); setSemTabela(leitura.missingTable); setVersoes([]); } else { setSemTabela(false); setVersoes(leitura.versions); }
    setCarregando(false);
  }, []);
  const carregar = useCallback(async () => aplicar(await lerVersoes(brandId, articleId)), [aplicar, brandId, articleId]);

  useEffect(() => {
    let vivo = true;
    void lerVersoes(brandId, articleId).then(leitura => { if (vivo) aplicar(leitura); });
    return () => { vivo = false; };
  }, [aplicar, brandId, articleId]);

  const atual = versoes[0] || null;
  const b = atual?.payload.blueprint || null;

  const enviar = async (acao: "generate" | "edit" | "approve", extra: Record<string, unknown> = {}) => {
    setOcupado(acao);
    setAviso(null);
    try {
      const resposta = await fetch("/api/editorial/radar-article-blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: acao, brandId, articleId, ...extra }),
      });
      const corpo = await resposta.json().catch(() => ({})) as { success?: boolean; error?: string; notes?: string[] };
      if (!resposta.ok || !corpo.success) {
        setAviso({ ok: false, texto: [corpo.error || "A ação não foi concluída.", ...(corpo.notes || [])].join(" ") });
        return;
      }
      setAviso({ ok: true, texto: acao === "generate" ? "Artigo-modelo gerado. Revise, edite se precisar e aprove." : acao === "edit" ? "Edição salva como nova versão." : "Artigo-modelo aprovado: o CSV 'para escrever' passa a usá-lo." });
      setEditando(false);
      setConfirmando(false);
      await carregar();
    } catch {
      setAviso({ ok: false, texto: "Sem resposta do servidor. Atualize a área antes de tentar de novo." });
    } finally {
      setOcupado("");
    }
  };

  const abrirEdicao = () => {
    if (!b) return;
    setRascunho({
      h1: b.title.h1, seoTitle: b.title.seoTitle, metaDescription: b.title.metaDescription, promise: b.promise,
      openingQuestion: b.opening.readerQuestion,
      secoes: b.sections.map(secao => ({ h2: secao.h2, readerQuestion: secao.readerQuestion, answerFirst: secao.answerFirst, remove: false })),
    });
    setEditando(true);
  };

  const salvarEdicao = () => {
    if (!b || !rascunho || !atual) return;
    const edit: RadarArticleBlueprintEdit = {
      promise: rascunho.promise,
      title: { h1: rascunho.h1, seoTitle: rascunho.seoTitle, metaDescription: rascunho.metaDescription },
      openingQuestion: rascunho.openingQuestion,
      sections: rascunho.secoes.map((secao, index) => ({ index, ...(secao.remove ? { remove: true } : { h2: secao.h2, readerQuestion: secao.readerQuestion, answerFirst: secao.answerFirst }) })),
    };
    void enviar("edit", { blueprintId: atual.id, edit });
  };

  const candidato = (id: string) => atual?.payload.linkCandidates.find(item => item.id === id);
  const m = atual?.payload.measures;

  return <section className="mt-3 space-y-3 rounded-md border border-divider bg-surface p-3" data-testid="radar-article-blueprint">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold text-foreground">Artigo-modelo (IA)</h3>
        <p className="mt-1 text-sm leading-6 text-text-muted">A planta do artigo ideal contra a SERP: medidas, sentido das keywords, seções, links internos e externos, imagens. A IA propõe; você revisa e aprova.</p>
      </div>
      {atual && <span className="rounded-full border border-divider px-3 py-1 text-sm text-text-muted" data-testid="radar-article-blueprint-state">v{atual.versionNumber} · {rotuloDoEstado(atual)}</span>}
    </div>

    {carregando && <p className="text-sm text-text-muted">Lendo o artigo-modelo…</p>}
    {aviso && <p className={`text-sm ${aviso.ok ? "text-success" : "text-warning"}`} role="status">{aviso.texto}</p>}

    {!carregando && (confirmando
      ? <div className={bloco} data-testid="radar-article-blueprint-confirm">
        <p className="text-sm text-foreground">Isto faz <strong>1 chamada de IA</strong> (DeepSeek, cota da marca) sobre a investigação congelada. Pode levar até 3 minutos.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={botaoPrincipal} disabled={Boolean(ocupado)} onClick={() => void enviar("generate", { confirmPaid: true })}>{ocupado === "generate" ? "Gerando…" : "Confirmar e gerar"}</button>
          <button type="button" className={botao} disabled={Boolean(ocupado)} onClick={() => setConfirmando(false)}>Cancelar</button>
        </div>
      </div>
      : <div className="flex flex-wrap gap-2">
        <button type="button" className={atual ? botao : botaoPrincipal} disabled={Boolean(ocupado) || semTabela} onClick={() => setConfirmando(true)} data-testid="radar-article-blueprint-generate">{atual ? "Gerar de novo (IA)" : "Gerar artigo-modelo (IA)"}</button>
        {atual && atual.state === "DRAFT" && !editando && <button type="button" className={botao} disabled={Boolean(ocupado)} onClick={abrirEdicao}>Editar</button>}
        {atual && atual.state === "DRAFT" && !editando && <button type="button" className={botaoPrincipal} disabled={Boolean(ocupado)} onClick={() => void enviar("approve", { blueprintId: atual.id })} data-testid="radar-article-blueprint-approve">{ocupado === "approve" ? "Aprovando…" : "Aprovar artigo-modelo"}</button>}
      </div>)}

    {atual && atual.validation.length > 0 && <div className={bloco}>
      <p className="text-sm font-semibold text-foreground">O servidor conferiu a resposta da IA contra o pacote:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-text-muted">{atual.validation.map(item => <li key={item}>{item}</li>)}</ul>
    </div>}

    {editando && rascunho && <div className={`${bloco} space-y-3`} data-testid="radar-article-blueprint-edit">
      <label className="block text-sm text-foreground">H1<input className={campo} value={rascunho.h1} onChange={evento => setRascunho({ ...rascunho, h1: evento.target.value })} /></label>
      <label className="block text-sm text-foreground">SEO title<input className={campo} value={rascunho.seoTitle} onChange={evento => setRascunho({ ...rascunho, seoTitle: evento.target.value })} /></label>
      <label className="block text-sm text-foreground">Meta description<textarea className={campo} rows={2} value={rascunho.metaDescription} onChange={evento => setRascunho({ ...rascunho, metaDescription: evento.target.value })} /></label>
      <label className="block text-sm text-foreground">Promessa<textarea className={campo} rows={2} value={rascunho.promise} onChange={evento => setRascunho({ ...rascunho, promise: evento.target.value })} /></label>
      <label className="block text-sm text-foreground">Pergunta da abertura<input className={campo} value={rascunho.openingQuestion} onChange={evento => setRascunho({ ...rascunho, openingQuestion: evento.target.value })} /></label>
      {rascunho.secoes.map((secao, indice) => <fieldset key={indice} className="rounded-md border border-divider p-3">
        <legend className="px-1 text-sm font-semibold text-foreground">Seção {indice + 1}</legend>
        <label className="flex items-center gap-2 text-sm text-text-muted"><input type="checkbox" checked={secao.remove} onChange={evento => setRascunho({ ...rascunho, secoes: rascunho.secoes.map((item, i) => i === indice ? { ...item, remove: evento.target.checked } : item) })} />Remover esta seção</label>
        {!secao.remove && <>
          <label className="mt-2 block text-sm text-foreground">H2<input className={campo} value={secao.h2} onChange={evento => setRascunho({ ...rascunho, secoes: rascunho.secoes.map((item, i) => i === indice ? { ...item, h2: evento.target.value } : item) })} /></label>
          <label className="mt-2 block text-sm text-foreground">Pergunta do leitor<input className={campo} value={secao.readerQuestion} onChange={evento => setRascunho({ ...rascunho, secoes: rascunho.secoes.map((item, i) => i === indice ? { ...item, readerQuestion: evento.target.value } : item) })} /></label>
          <label className="mt-2 block text-sm text-foreground">Abre respondendo<textarea className={campo} rows={2} value={secao.answerFirst} onChange={evento => setRascunho({ ...rascunho, secoes: rascunho.secoes.map((item, i) => i === indice ? { ...item, answerFirst: evento.target.value } : item) })} /></label>
        </>}
      </fieldset>)}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={botaoPrincipal} disabled={Boolean(ocupado)} onClick={salvarEdicao}>{ocupado === "edit" ? "Salvando…" : "Salvar como nova versão"}</button>
        <button type="button" className={botao} disabled={Boolean(ocupado)} onClick={() => setEditando(false)}>Cancelar</button>
      </div>
    </div>}

    {atual && <p className="text-sm text-text-muted" data-testid="radar-article-blueprint-voice">{atual.payload.brandVoice
      ? `Voz da marca usada: Skill "${atual.payload.brandVoice.name}" v${atual.payload.brandVoice.version}.`
      : "Gerado sem Skill de voz na Marca."}</p>}

    {b && m && !editando && <div className="space-y-3" data-testid="radar-article-blueprint-view">
      <div className={bloco}>
        <p className="text-sm font-semibold text-foreground">Medidas do plano × concorrentes comparáveis ({m.serp.comparablePages})</p>
        <dl className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {([
            ["Palavras", m.plan.wordsMin && m.plan.wordsMax ? `${m.plan.wordsMin}–${m.plan.wordsMax}` : "—", m.serp.words.median ?? "—"],
            ["H2", m.plan.sections, m.serp.h2 ?? "—"],
            ["H3", m.plan.h3, m.serp.h3 ?? "—"],
            ["Parágrafos", m.plan.paragraphs, m.serp.paragraphs ?? "—"],
            ["Negritos", m.plan.bold, "—"],
            ["Imagens", `${m.plan.images} (capa + ${m.plan.respites})`, m.serp.images ?? "—"],
            ["Links internos", m.plan.internalLinks, "—"],
            ["Links externos", m.plan.externalLinks, "—"],
          ] as Array<[string, string | number, string | number]>).map(([rotulo, plano, serp]) => <div key={rotulo}>
            <dt className="text-sm text-text-muted">{rotulo}</dt>
            <dd className="text-sm font-medium text-foreground">{plano} <span className="font-normal text-text-muted">· SERP {serp}</span></dd>
          </div>)}
        </dl>
      </div>
      <div className={bloco}>
        <p className="text-sm font-semibold text-foreground">H1: {b.title.h1}</p>
        <p className="mt-1 text-sm text-text-muted">SEO title: {b.title.seoTitle}</p>
        <p className="text-sm text-text-muted">Meta: {b.title.metaDescription}</p>
        <p className="mt-2 text-sm text-foreground">Leitor: {b.reader}</p>
        <p className="text-sm text-foreground">Promessa: {b.promise}</p>
        <p className="text-sm text-foreground">Ângulo: {b.angle.statement}</p>
        <p className="mt-2 text-sm text-foreground">Keywords: {b.keywordPlan.reading}</p>
        <ul className="mt-1 list-disc pl-5 text-sm leading-6 text-text-muted">{b.keywordPlan.complementary.map(item => <li key={item.keyword}>{item.keyword} → {item.placement} ({item.reason})</li>)}</ul>
        {b.keywordPlan.slugNote && <p className="mt-1 text-sm text-warning">Slug × principal: {b.keywordPlan.slugNote}</p>}
        <p className="mt-2 text-sm text-foreground">Abertura: responder “{b.opening.readerQuestion}” — {b.opening.direction}</p>
      </div>
      <ol className="space-y-2">{b.sections.map((secao, indice) => <li key={`${indice}-${secao.h2}`} className={bloco}>
        <p className="text-sm font-semibold text-foreground">H2 · {secao.h2}</p>
        <p className="mt-1 text-sm text-text-muted">Pergunta: {secao.readerQuestion}</p>
        <p className="text-sm text-foreground">Abre respondendo: {secao.answerFirst}</p>
        {secao.h3.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm text-text-muted">{secao.h3.map(h3 => <li key={h3}>H3 · {h3}</li>)}</ul>}
        <p className="mt-1 text-sm text-text-muted">~{secao.paragraphs} parágrafo(s){secao.bold.length ? ` · negrito: ${secao.bold.join(", ")}` : ""}{secao.evidence.length ? ` · evidências: ${secao.evidence.join(", ")}` : ""}{secao.image ? ` · imagem ${secao.image}` : ""}{secao.specialist ? ` · especialista ${secao.specialist}` : ""}</p>
        {secao.internalLinks.map(link => <p key={`${link.candidate}-${link.anchor}`} className="text-sm text-foreground">Link interno: “{link.anchor}” → {candidato(link.candidate)?.label || link.candidate}{candidato(link.candidate)?.destination ? ` (${candidato(link.candidate)?.destination})` : ""}</p>)}
        {secao.externalLinks.map(link => <p key={link.claim} className="text-sm text-foreground">Link externo: {link.claim} → {link.source || `fonte a obter (${link.sourceType})`}</p>)}
      </li>)}</ol>
      <div className={bloco}>
        <p className="text-sm text-foreground">Fechamento: {b.closing.turn}{b.closing.specialist ? ` (voz do especialista ${b.closing.specialist})` : ""}</p>
        <p className="text-sm text-foreground">CTA: {b.closing.cta}</p>
        {b.closing.nextStep && <p className="text-sm text-text-muted">Próximo passo: {b.closing.nextStep}</p>}
      </div>
      <div className={bloco}>
        <p className="text-sm font-semibold text-foreground">Plano visual</p>
        <ul className="mt-1 space-y-2 text-sm leading-6 text-text-muted">{b.visual.map(item => <li key={item.slot}><strong className="text-foreground">{item.slot === "CAPA" ? "Capa" : `Respiro ${item.slot.slice(1)}`}</strong>{item.section ? ` · ${item.section}` : ""} — {item.concept}<br />Prompt: {item.prompt}<br />ALT: {item.alt} · Legenda: {item.caption}</li>)}</ul>
      </div>
    </div>}
  </section>;
}
