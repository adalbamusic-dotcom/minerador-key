"use client";

/**
 * ===== CORTE 4 · A IMAGEM, NA POSIÇÃO EM QUE ELA VIVE =====
 *
 * ==================== O DEFEITO QUE ISTO FECHA ====================
 *
 * O painel anterior mostrava só o seletor de posição e mandava "registrar o
 * prompt e anexar a imagem" — apontando para controles que não existiam no
 * ambiente Artigo. As duas metades do fluxo estavam em telas diferentes:
 * briefing e upload no ambiente derivado, âncora e substituição aqui. Nenhuma
 * completa. Resultado: a mídia era inalcançável ponta a ponta, e a homologação
 * não tinha como acontecer.
 *
 * Agora a posição é o assunto, e tudo o que se faz com ela acontece aqui.
 *
 * ==================== NÃO É SEÇÃO GLOBAL, NÃO É BARRA ====================
 *
 * Sem posição selecionada não há painel. Nenhum `<header>`, nenhum `<footer>`,
 * nenhuma faixa horizontal: o painel lateral direito é o lugar, e é um só.
 *
 * ==================== A ORDEM É A DO SERVIDOR ====================
 *
 *   criar briefing sucessor SEM âncora
 *   → upload → hash → readback do Storage
 *   → ancoragem (posição vazia) OU substituição (posição ocupada)
 *   → readback
 *   → recarregar o estado
 *
 * Nenhum passo é pulado e nenhum arquivo antigo é sobrescrito. Trocar imagem
 * cria um ativo novo; o antigo vira histórico com janela de 48h.
 */

import { useState } from "react";
import type { MediaAnchorKind } from "@/lib/redator/media-anchor";
import {
  actionsFor, anchorStateFor, type AnchorState, type MediaAnchorTarget, type PanelAsset,
} from "@/lib/redator/media-anchor-targets";

const botao = "inline-flex h-7 items-center justify-center rounded border border-divider bg-surface-subtle px-2 text-[9px] font-bold text-foreground/75 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";
const campo = "h-7 w-full rounded border border-divider bg-surface-subtle px-2 text-[10px] text-foreground outline-none transition-colors hover:border-module-accent/25 focus:border-module-accent/45";

/** O papel que cada posição usa em `writer_media_assets.role`. */
const ROLE_POR_ANCHOR: Record<MediaAnchorKind, string> = {
  article_cover: "cover",
  article_block: "article_block",
  script_scene: "storyboard",
  carousel_slide: "slide",
};

type Etapa = "parado" | "briefing" | "enviando" | "conferindo" | "ancorando" | "concluido" | "erro";

const TEXTO_DA_ETAPA: Record<Etapa, string> = {
  parado: "",
  briefing: "Registrando briefing no servidor…",
  enviando: "Enviando arquivo…",
  conferindo: "Conferindo formato, hash e releitura do armazenamento…",
  ancorando: "Ocupando a posição e confirmando na leitura remota…",
  concluido: "Pronto. Imagem confirmada nesta posição.",
  erro: "",
};

export type { MediaAnchorTarget, PanelAsset };

export function WriterMediaAnchorPanel({ brandId, documentId, targets, assets, onChanged, readOnly = false }: {
  brandId: string | null;
  documentId: string | null;
  /** As posições deste ambiente: capa e blocos, ou cenas, ou slides. */
  targets: readonly MediaAnchorTarget[];
  assets: readonly PanelAsset[];
  onChanged: () => void | Promise<void>;
  /**
   * ===== CORTE 6A.7 · CONSULTAR SIM, ALTERAR NÃO =====
   *
   * Entregável finalizado continua abrindo o painel: dá para ver a imagem,
   * o briefing e o texto alternativo. O que some são as ações que MUDAM —
   * anexar, substituir, editar alt, editar briefing — e no lugar delas fica
   * dito o que fazer para voltar a poder.
   *
   * Isto é a camada de cortesia, não a de segurança: o servidor recusa as
   * mesmas mutações por conta própria, em `writer-media-guard.ts`.
   */
  readOnly?: boolean;
}) {
  const [selecionado, setSelecionado] = useState("");
  const [etapa, setEtapa] = useState<Etapa>("parado");
  const [mensagem, setMensagem] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [prompt, setPrompt] = useState("");
  const [alt, setAlt] = useState("");
  const [proporcao, setProporcao] = useState("16:9");
  const [editandoBriefing, setEditandoBriefing] = useState(false);

  if (!brandId || !documentId || targets.length === 0) return null;

  /*
   * ===== UMA POSIÇÃO SÓ NÃO SE ESCOLHE DUAS VEZES =====
   *
   * No ambiente derivado o painel recebe a âncora da cena JÁ selecionada no
   * documento — uma só. Pedir "selecione uma posição" ali seria mandar escolher
   * de novo o que acabou de ser escolhido.
   *
   * Derivado, não sincronizado por efeito: quando a cena aberta muda, `targets`
   * muda, e a seleção efetiva acompanha sozinha.
   */
  const alvoUnico = targets.length === 1 ? `${targets[0].kind}:${targets[0].ref}` : "";
  const selecionadoEfetivo = alvoUnico || selecionado;
  const target = targets.find(t => `${t.kind}:${t.ref}` === selecionadoEfetivo) ?? null;
  const estado: AnchorState | null = target ? anchorStateFor(target, assets) : null;
  const acoes = estado ? actionsFor(estado) : [];
  const ocupada = Boolean(estado?.current);

  const chamarAncora = async (corpo: Record<string, unknown>) => {
    const resposta = await fetch("/api/redator/media-anchor", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(descreverFalha(dados));
    return dados;
  };

  /*
   * Erro do servidor vira frase, não código cru. `refusal` e `reason` são
   * nomeados justamente para que a tela consiga dizer o que houve — conflito de
   * posição e falha de releitura são coisas diferentes, e quem opera precisa
   * saber qual das duas aconteceu.
   */
  const descreverFalha = (dados: Record<string, unknown>) => {
    if (dados.status === "unavailable") return "A operação de mídia não está disponível neste ambiente.";
    if (dados.refusal === "anchor_taken") return "Conflito: esta posição já foi ocupada por outra imagem. Recarregue e substitua.";
    if (dados.refusal === "predecessor_not_current") return "Conflito: a imagem desta posição já foi substituída por outra pessoa. Recarregue.";
    if (dados.refusal === "successor_file_unconfirmed") return "O arquivo ainda não foi confirmado pelo servidor; a troca não aconteceu.";
    if (dados.refusal) return `Recusado pelo servidor: ${dados.refusal}`;
    if (typeof dados.reason === "string" && dados.reason.includes("readback")) {
      return "A releitura remota não confirmou a troca. A imagem anterior continua no lugar.";
    }
    if (dados.reason) return `Falhou na confirmação: ${dados.reason}`;
    return String(dados.error || dados.code || "Não foi possível concluir.");
  };

  const recarregar = async () => { setPreviewUrl(""); await onChanged(); };

  /** [Registrar briefing] — o prompt sozinho. Não afirma que a imagem existe. */
  const registrarBriefing = async () => {
    if (!target) return;
    setEtapa("briefing"); setMensagem("");
    try {
      const resposta = await fetch("/api/redator/deliverables", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId, documentId, deliverableId: null, role: ROLE_POR_ANCHOR[target.kind],
          objective: objetivo.trim(), prompt: prompt.trim(), altText: alt, aspectRatio: proporcao.trim(),
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(descreverFalha(dados));
      setEtapa("parado");
      setMensagem("Briefing registrado. A imagem ainda precisa ser gerada e anexada.");
      await recarregar();
      return String(dados.id);
    } catch (erro) {
      setEtapa("erro"); setMensagem(erro instanceof Error ? erro.message : "Falha ao registrar briefing.");
      return null;
    }
  };

  /**
   * [Anexar imagem] / [Substituir imagem] — a sequência inteira, numa ação.
   *
   * Pedir que a pessoa orquestrasse briefing, upload e ancoragem em três
   * cliques separados seria transferir a ordem do servidor para a mão de quem
   * escreve — e é justamente a ordem que protege a imagem que já está no ar.
   */
  const anexarArquivo = async (arquivo: File) => {
    if (!target) return;
    setMensagem(""); setEtapa("briefing");
    try {
      /* 1. sucessor SEM âncora — sempre novo, nunca sobrescreve o antigo. */
      const semArquivo = estado?.briefings[0] ?? null;
      let assetId = semArquivo?.id ?? null;
      if (!assetId) {
        const criado = await registrarBriefingInterno();
        if (!criado) return;
        assetId = criado;
      }

      /* 2. upload: o servidor confere magic bytes, hash e relê do Storage. */
      setEtapa("enviando");
      const form = new FormData();
      form.set("brandId", brandId); form.set("documentId", documentId);
      form.set("assetId", assetId); form.set("file", arquivo);
      const envio = await fetch("/api/redator/media-upload", { method: "POST", body: form });
      const recibo = await envio.json();
      if (!envio.ok) throw new Error(descreverFalha(recibo));

      /* 3. só com hash confirmado a posição é tocada. */
      setEtapa("conferindo");
      if (!recibo.fileHash) throw new Error("O servidor não confirmou o hash do arquivo; nada foi trocado.");

      setEtapa("ancorando");
      if (estado?.current) {
        await chamarAncora({ action: "replace", brandId,
          predecessorAssetId: estado.current.id, successorAssetId: assetId });
        setMensagem("Imagem substituída. A anterior entrou na janela de 48 horas.");
      } else {
        await chamarAncora({ action: "anchor", brandId, assetId,
          anchorKind: target.kind, anchorRef: target.ref });
        setMensagem("Imagem ancorada nesta posição.");
      }

      setEtapa("concluido");
      setObjetivo(""); setPrompt(""); setAlt("");
      await recarregar();
    } catch (erro) {
      setEtapa("erro");
      setMensagem(erro instanceof Error ? erro.message : "Falha ao anexar imagem.");
    }
  };

  /* Igual ao botão, mas sem mexer na etapa: usado dentro do fluxo completo. */
  const registrarBriefingInterno = async (): Promise<string | null> => {
    if (!target) return null;
    if (!objetivo.trim() || !prompt.trim()) {
      setEtapa("erro");
      setMensagem("Preencha objetivo e prompt antes de anexar: o briefing é o que dá contexto à imagem.");
      return null;
    }
    const resposta = await fetch("/api/redator/deliverables", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId, documentId, deliverableId: null, role: ROLE_POR_ANCHOR[target.kind],
        objective: objetivo.trim(), prompt: prompt.trim(), altText: alt, aspectRatio: proporcao.trim(),
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) { setEtapa("erro"); setMensagem(descreverFalha(dados)); return null; }
    return String(dados.id);
  };

  /** Preview por URL assinada de curta duração. O bucket segue privado. */
  const verImagem = async () => {
    if (!estado?.current) return;
    setMensagem("");
    try {
      const dados = await chamarAncora({ action: "preview", brandId, assetId: estado.current.id });
      setPreviewUrl(String(dados.url));
    } catch (erro) {
      setMensagem(erro instanceof Error ? erro.message : "Não foi possível carregar a imagem.");
    }
  };

  const salvarAlt = async () => {
    if (!estado?.current) return;
    setMensagem("");
    try {
      await chamarAncora({ action: "update_brief", brandId, assetId: estado.current.id, altText: alt });
      setMensagem("Texto alternativo salvo e confirmado na leitura remota.");
      await onChanged();
    } catch (erro) {
      setMensagem(erro instanceof Error ? erro.message : "Falha ao salvar o texto alternativo.");
    }
  };

  const salvarBriefing = async () => {
    if (!estado?.current) return;
    setMensagem("");
    try {
      await chamarAncora({ action: "update_brief", brandId, assetId: estado.current.id,
        objective: objetivo.trim() || estado.current.objective, prompt: prompt.trim() || estado.current.prompt });
      setMensagem("Briefing atualizado.");
      setEditandoBriefing(false);
      await onChanged();
    } catch (erro) {
      setMensagem(erro instanceof Error ? erro.message : "Falha ao atualizar o briefing.");
    }
  };

  const ocupado = etapa === "briefing" || etapa === "enviando" || etapa === "conferindo" || etapa === "ancorando";

  return <section className="mb-3 rounded border border-divider bg-surface-subtle p-2" data-writer-media-anchor-panel>
    <h2 className="text-[9px] font-bold uppercase text-slate-500">Imagem por posição</h2>

    {/* Com uma posição só, o seletor some: ele não teria o que escolher. */}
    {alvoUnico ? null : <>
    <label className="mt-1 block text-[9px] text-text-muted" htmlFor="redator-media-target">Posição</label>
    <select id="redator-media-target" data-redator-media-target className={`${campo} mt-0.5`}
      value={selecionado}
      onChange={event => {
        setSelecionado(event.target.value); setPreviewUrl(""); setMensagem("");
        setEtapa("parado"); setEditandoBriefing(false);
        const alvo = targets.find(t => `${t.kind}:${t.ref}` === event.target.value);
        const atual = alvo ? anchorStateFor(alvo, assets).current : null;
        /* Ao abrir uma posição ocupada, os campos já vêm com o que está lá. */
        setAlt(atual?.altText ?? ""); setObjetivo(atual?.objective ?? ""); setPrompt(atual?.prompt ?? "");
        void onChanged();
      }}>
      <option value="">Selecione uma posição…</option>
      {[...new Set(targets.map(t => t.group))].map(grupo =>
        <optgroup key={grupo} label={grupo}>
          {targets.filter(t => t.group === grupo).map(t =>
            /* O rótulo é humano; o id técnico vive no `value`. */
            <option key={`${t.kind}:${t.ref}`} value={`${t.kind}:${t.ref}`}>{t.label}</option>)}
        </optgroup>)}
    </select></>}

    {!target ? <p className="mt-2 text-[9px] text-text-muted">Escolha onde a imagem vai morar.</p> : <>
      <p className="mt-2 truncate text-[9px] font-bold text-foreground/80" title={target.label}>{target.label}</p>

      {ocupada ? <>
        <p className="mt-1 text-[9px] text-success" data-media-estado-atual>
          Imagem atual nesta posição · hash {estado?.current?.fileHash?.slice(0, 12)}…
        </p>
        {previewUrl
          /* eslint-disable-next-line @next/next/no-img-element -- URL assinada de 60s; o otimizador precisaria de host permanente. */
          ? <img src={previewUrl} alt={estado?.current?.altText || target.label}
              className="mt-2 w-full rounded border border-divider" data-media-preview/>
          : <button type="button" className={`${botao} mt-2 w-full`} onClick={() => void verImagem()} data-media-ver>Ver imagem</button>}
      </> : <p className="mt-1 text-[9px] text-text-muted" data-media-estado-vazio>Nenhuma imagem ocupa esta posição.</p>}

      {/* ===== BRIEFING ===== */}
      {(!ocupada || editandoBriefing) && <div className="mt-2 space-y-1">
        <input className={campo} placeholder="Objetivo da imagem" value={objetivo} readOnly={readOnly}
          onChange={event => setObjetivo(event.target.value)} aria-label="Objetivo da imagem"/>
        <textarea className={`${campo} min-h-16 py-1`} placeholder="Prompt" value={prompt} readOnly={readOnly}
          onChange={event => setPrompt(event.target.value)} aria-label="Prompt"/>
        <input className={campo} placeholder="Proporção" value={proporcao} readOnly={readOnly}
          onChange={event => setProporcao(event.target.value)} aria-label="Proporção"/>
      </div>}

      {/* ===== TEXTO ALTERNATIVO ===== */}
      {(ocupada || !ocupada) && <div className="mt-1">
        <input className={campo} placeholder="Texto alternativo" value={alt} readOnly={readOnly}
          onChange={event => setAlt(event.target.value)} aria-label="Texto alternativo"/>
      </div>}

      {/* =====
        * AÇÕES — somem inteiras quando o entregável está finalizado.
        *
        * Desabilitar em vez de esconder deixaria quatro botões cinzas sem dizer
        * por quê. O aviso abaixo diz.
        * ===== */}
      {readOnly && <p className="mt-2 rounded border border-divider bg-surface-subtle p-1.5 text-[9px] text-text-muted"
        data-media-somente-leitura>
        Entregável finalizado: a mídia está em consulta.
        <strong> Reabra para edição</strong> para alterar a imagem, o briefing ou o texto alternativo.
      </p>}

      {!readOnly && <div className="mt-2 flex flex-wrap gap-1">
        {acoes.includes("registrar_briefing") && <button type="button" className={botao} disabled={ocupado}
          onClick={() => void registrarBriefing()} data-media-registrar>Registrar briefing</button>}

        {(acoes.includes("anexar_imagem") || acoes.includes("substituir_imagem")) && <label
          className={`${botao} cursor-pointer`} data-media-anexar>
          {ocupada ? "Substituir imagem" : "Anexar imagem"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={ocupado}
            onChange={event => { const f = event.target.files?.[0]; event.target.value = ""; if (f) void anexarArquivo(f); }}/>
        </label>}

        {acoes.includes("editar_alt") && <button type="button" className={botao} disabled={ocupado}
          onClick={() => void salvarAlt()} data-media-alt>Editar alt text</button>}

        {acoes.includes("editar_briefing") && <button type="button" className={botao} disabled={ocupado}
          onClick={() => editandoBriefing ? void salvarBriefing() : setEditandoBriefing(true)} data-media-briefing>
          {editandoBriefing ? "Salvar briefing" : "Editar briefing"}
        </button>}
      </div>}

      {/* ===== PROGRESSO E ERRO ===== */}
      {ocupado && <p className="mt-2 text-[9px] text-context-accent" role="status" data-media-progresso>{TEXTO_DA_ETAPA[etapa]}</p>}
      {etapa === "concluido" && !mensagem && <p className="mt-2 text-[9px] text-success" role="status">{TEXTO_DA_ETAPA.concluido}</p>}
      {mensagem && <p className={`mt-2 text-[9px] ${etapa === "erro" ? "text-danger" : "text-success"}`} role="status" data-media-mensagem>{mensagem}</p>}

      {/*
        * O predecessor aparece como HISTÓRICO, nunca como segunda imagem atual.
        * `anchorStateFor` só chama de `current` quem tem âncora, arquivo e
        * `superseded_at` nulo — a mesma condição do índice único da M3.
        */}
      {estado && estado.superseded.length > 0 && <p className="mt-2 text-[9px] text-text-muted" data-media-historico>
        {estado.superseded.length} versão(ões) anterior(es) nesta posição, em janela de recuperação.
      </p>}
    </>}
  </section>;
}
