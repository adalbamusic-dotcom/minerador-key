"use client";

/**
 * ===== CORTE 6A · ROTEIRO É DOCUMENTO PRODUZIDO, NÃO FICHA PREENCHIDA =====
 *
 * ==================== O DEFEITO QUE ISTO FECHA ====================
 *
 * A aba abria como formulário técnico: Canal, Público, Objetivo, Duração,
 * Abertura, Chamada final — seis campos de briefing antes de qualquer cena. O
 * conteúdo que importa, a cena, vinha depois e em grade de rótulos.
 *
 * Quem produz roteiro pensa em CENAS, em sequência, de cima para baixo. A tela
 * agora é isso: uma pilha de cenas legíveis, cada uma uma unidade delimitada.
 *
 * ==================== OS METADADOS NÃO SUMIRAM ====================
 *
 * Canal, público, objetivo e os outros continuam existindo no contrato e nos
 * dados já gravados — nada foi removido do schema. Eles saíram do CAMINHO: vivem
 * num bloco recolhido, abaixo das cenas, para quem precisar. Um campo opcional
 * que abre a tela é um campo que manda.
 *
 * ==================== A IDENTIDADE DA CENA É SAGRADA ====================
 *
 * Todas as operações passam por `lib/redator/script-scenes.ts`, que preserva
 * `sceneId` em edição, remoção e reordenação. A mídia ancora em
 * `script_scene + sceneId`: id trocado é imagem órfã.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Sparkles, Trash2 } from "lucide-react";
import { newWriterDeliverable, WriterDeliverablePayloadSchema, type WriterDeliverablePayload } from "@/lib/redator/multiformat-contracts";
import { WriterMediaAnchorPanel } from "@/modules/redator/writer-media-anchor-panel";
import { WriterRadarFoundationsPanel } from "@/modules/redator/writer-radar-foundations-panel";
import type { ContentDocument } from "@/lib/arquiteto/contracts";
import { carouselAnchorTargets, mediaRowsToPanelAssets, scriptAnchorTargets } from "@/lib/redator/media-anchor-targets";
import { adicionarCena, cenasEmOrdem, duplicarCena, editarCena, moverCena, novaCena, removerCena } from "@/lib/redator/script-scenes";
import { actionButtonLabel, describeActionFailure, progressMessage, type DeliverableAction, type FeedbackTone } from "@/lib/redator/action-feedback";
import { radarWriterDossierOfDocument } from "@/lib/redator/radar-foundations";

type Kind = WriterDeliverablePayload["kind"];

/**
 * ===== CORTE 6A.1 · O QUE A BARRA PRECISA SABER =====
 *
 * Os controles do entregável vivem na GlobalTopbar, junto com os do artigo — a
 * tela não ganha faixa nova nem repete botão no corpo. Mas a lógica continua
 * aqui, onde mora o estado: o pai recebe um objeto com o estado e os gatilhos,
 * e só desenha. Duas implementações de "salvar" seriam duas verdades.
 */
export type WriterDeliverableBar = {
  kind: Kind;
  /** `none` = o entregável ainda não existe no servidor; não há o que finalizar. */
  estado: "none" | "draft" | "approved";
  ocupado: boolean;
  mensagem: string;
  /**
   * ===== CORTE 6A.8 · O TOM É O QUE TORNA A FALHA VISÍVEL =====
   *
   * Antes a barra só recebia texto, e o desenho pintava tudo de `muted`. Um 409
   * em "Reabrir para edição" ficava indistinguível de "Sem alterações
   * pendentes". O tom vem de `lib/redator/action-feedback.ts`, a mesma tabela
   * que o Artigo usa — não uma segunda convenção.
   */
  tom: FeedbackTone;
  /** Qual ação está em curso, para rotular o botão certo e travar só ele. */
  acaoEmCurso: DeliverableAction | null;
  salvar: () => void;
  finalizar: () => void;
  reabrir: () => void;
};
type Stored = { id: string; kind: Kind; status: string; payload: WriterDeliverablePayload; contentHash: string; lockVersion: number; updatedAt: string };
type Media = { id: string; role: string; status: string; prompt: string; alt_text: string; storage_path: string | null };
/** Cena ou slide, lidos pela mesma pilha. O contrato é validado no save. */
type ParteEditavel = { id: string; order: number } & Record<string, unknown>;
/** Campo de texto de uma parte, sem espalhar `String(x ?? "")` pela tela. */
const texto = (valor: unknown) => String(valor ?? "");

const field = "w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-action-accent focus:outline-none";
const button = "rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary hover:border-action-accent disabled:cursor-not-allowed disabled:opacity-50";
const iconeCena = "inline-flex h-7 w-7 items-center justify-center rounded border border-border text-text-muted transition-colors hover:border-action-accent hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30";

export function WriterDerivedEnvironment({ kind, brandId, documentId, title, document = null, onBarChange }: { kind: Kind; brandId: string | null; documentId: string | null; title: string; /** O documento de origem: os fundamentos do Radar são lidos dele, nunca copiados para o entregável. */ document?: ContentDocument | null; onBarChange?: (bar: WriterDeliverableBar | null) => void }) {
  const [draft, setDraft] = useState<WriterDeliverablePayload | null>(null);
  /*
   * Sem dossiê não há de onde semear. O botão só existe quando o documento veio
   * do Radar — oferecer "criar a partir deste contexto" sem contexto seria a
   * mesma promessa falsa que este bloco já cometeu uma vez.
   */
  const temDossie = useMemo(() => Boolean(radarWriterDossierOfDocument(document)), [document]);
  const [stored, setStored] = useState<Stored | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [sourceHash, setSourceHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tom, setTom] = useState<FeedbackTone>("neutro");
  const [acaoEmCurso, setAcaoEmCurso] = useState<DeliverableAction | null>(null);
  /** A cena aberta manda no painel de mídia. Sem ela, o painel não fala de nada. */
  const [cenaSelecionada, setCenaSelecionada] = useState("");
  const [metadadosAbertos, setMetadadosAbertos] = useState(false);

  const load = useCallback(async () => {
    if (!brandId || !documentId) return;
    try {
      const response = await fetch(`/api/redator/deliverables?brandId=${encodeURIComponent(brandId)}&documentId=${encodeURIComponent(documentId)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || body.code || "Falha ao ler entregáveis.");
      const current = (body.deliverables as Stored[]).find(item => item.kind === kind) || null;
      setStored(current);
      setSourceHash(body.sourceDocumentHash);
      setDraft(current?.payload || newWriterDeliverable(kind, { documentId, title, sourceDocumentHash: body.sourceDocumentHash }));
      setMedia(body.media || []);
    } catch (error) {
      setTom("erro");
      setMessage(error instanceof Error ? error.message : "Falha ao ler entregáveis.");
    }
  }, [brandId, documentId, kind, title]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const update = (name: string, value: string | number) => setDraft(current => current ? { ...current, [name]: value } as WriterDeliverablePayload : current);

  /*
   * `override` existe para a semeadura: ela precisa gravar um payload que ainda
   * não passou pelo `setDraft`. Ler o estado logo depois de agendá-lo devolveria
   * o valor antigo, e o rascunho gerado se perderia entre dois renders.
   *
   * O caminho de gravação continua sendo UM só — este. Semear não ganha rota de
   * escrita própria, então continua herdando a recusa de entregável finalizado e
   * o conflito de lock sem reimplementá-los.
   */
  const save = async (override?: WriterDeliverablePayload, mensagemSucesso?: string) => {
    const alvo = override ?? draft;
    if (!brandId || !documentId || !alvo) return;
    const parsed = WriterDeliverablePayloadSchema.safeParse(alvo);
    if (!parsed.success) {
      setTom("erro");
      setMessage(`Campo inválido: ${parsed.error.issues[0]?.path.join(".") || "entregável"}.`);
      return;
    }
    setBusy(true); setAcaoEmCurso("salvar"); setTom("progresso"); setMessage(progressMessage("salvar"));
    try {
      const response = await fetch("/api/redator/deliverables", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, documentId, payload: parsed.data, expectedLockVersion: stored?.lockVersion ?? null }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        /*
         * O corpo do servidor NÃO é engolido: ele sabe o motivo exato
         * (writer_lock_conflict, writer_approved_immutable, …). E nada de
         * `load()` aqui — recarregar depois de uma falha escreveria por cima do
         * rascunho que a pessoa ainda tem na tela.
         */
        const falha = describeActionFailure({ status: response.status, body });
        setTom(falha.tone); setMessage(falha.mensagem);
        return;
      }
      await load();
      setTom("sucesso");
      setMessage(mensagemSucesso ?? (body?.unchanged ? "Sem alterações a salvar." : "Rascunho salvo e confirmado no servidor."));
    } catch (error) {
      setTom("erro");
      setMessage(error instanceof Error ? error.message : "Falha ao salvar.");
    }
    finally { setBusy(false); setAcaoEmCurso(null); }
  };

  /*
   * ===== SEMEAR A PARTIR DOS FUNDAMENTOS DO RADAR =====
   *
   * Dois passos e duas autoridades, de propósito: `/api/redator/seed` propõe um
   * payload e não grava nada; `save` grava, pelo caminho que já existe. Se a
   * geração falhar, não houve escrita — o estado anterior fica intacto, que é o
   * que o enunciado pede.
   *
   * E gravar por `save` significa gravar RASCUNHO: nenhuma versão é criada,
   * nenhuma retenção começa. Gerar não é finalizar.
   */
  const semear = async () => {
    if (!brandId || !documentId || busy) return;
    /* `kind` é prop e existe sempre; `ehRoteiro` só é declarado depois da guarda de `draft`. */
    const roteiro = kind === "video_script";
    const qual: DeliverableAction = roteiro ? "semear_roteiro" : "semear_carrossel";
    setBusy(true); setAcaoEmCurso(qual); setTom("progresso"); setMessage(progressMessage(qual));
    try {
      const response = await fetch("/api/redator/seed", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, documentId, kind }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        /*
         * Aqui moram os estados operacionais: sem Connection de IA válida o
         * servidor responde 409 com código e mensagem próprios. Eles sobem
         * inteiros — inventar conteúdo seria pior do que não gerar.
         */
        const falha = describeActionFailure({ status: response.status, body });
        setTom(falha.tone); setMessage(falha.mensagem);
        return;
      }
      const proposto = WriterDeliverablePayloadSchema.safeParse(body?.payload);
      if (!proposto.success) {
        setTom("erro");
        setMessage("O modelo devolveu um entregável fora do contrato. Nada foi gravado.");
        return;
      }
      await save(proposto.data, roteiro
        ? "Roteiro criado a partir dos Fundamentos do Radar."
        : "Carrossel criado a partir dos Fundamentos do Radar.");
    } catch (error) {
      setTom("erro");
      setMessage(error instanceof Error ? error.message : "Falha ao criar a partir do contexto.");
    }
    finally { setBusy(false); setAcaoEmCurso(null); }
  };

  /*
   * ===== FINALIZAR E REABRIR — UM CAMINHO SÓ, DISCRIMINADO POR AÇÃO =====
   *
   * Roteiro e carrossel chamam a mesma rota com o mesmo corpo; `kind` é campo.
   * A tela não decide nada sobre versão ou retenção: ela dispara e mostra o que
   * o servidor confirmou depois do readback dele.
   */
  const acao = async (action: "finalize" | "reopen") => {
    if (!brandId || !documentId || !stored) return;
    const qual: DeliverableAction = action === "finalize" ? "finalizar" : "reabrir";
    setBusy(true); setAcaoEmCurso(qual); setTom("progresso"); setMessage(progressMessage(qual));
    try {
      const corpo = action === "finalize"
        ? { action, brandId, documentId, kind, expectedLockVersion: stored.lockVersion }
        : { action, brandId, documentId, kind };
      const response = await fetch("/api/redator/deliverables", { method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        /*
         * Conflito (409) e falha (401/5xx) pintam igual — para quem opera a
         * diferença que importa é "não deu certo". O que os distingue é a
         * mensagem, que vem do servidor e não é substituída por um texto genérico.
         *
         * O estado local NÃO é atualizado como sucesso, e o botão continua
         * utilizável para nova tentativa.
         */
        const falha = describeActionFailure({ status: response.status, body });
        setTom(falha.tone); setMessage(falha.mensagem);
        return;
      }
      await load();
      setTom("sucesso");
      if (action === "reopen") {
        setMessage("Reaberto para edição. A última versão finalizada continua sendo a corrente.");
        return;
      }
      /*
       * `unchanged` chega em dois casos, e a frase serve aos dois: já estava
       * finalizado, ou foi reaberto e finalizado sem edição — a M5 devolve o
       * status reusando a mesma versão. Em nenhum deles nasce versão nova.
       */
      if (body.unchanged) {
        setMessage(`Finalizado na versão ${body.versionNumber}; nenhuma versão nova foi criada.`);
        return;
      }
      /*
       * A retenção do predecessor pode falhar DEPOIS da nova versão confirmada.
       * Nesse caso a finalização valeu, e quem opera precisa saber que a versão
       * anterior ficará guardada por mais tempo — não é erro de finalização, e
       * dizer "falhou" mandaria a pessoa refazer algo que deu certo.
       */
      setMessage(body.retention?.status === "failed"
        ? `Finalizado como versão ${body.versionNumber}. A retenção da versão anterior não começou (${body.retention.code}); ela fica guardada por mais tempo.`
        : `Finalizado e confirmado no servidor como versão ${body.versionNumber}.`);
    } catch (error) {
      setTom("erro");
      setMessage(error instanceof Error ? error.message : "Falha na operação.");
    }
    finally { setBusy(false); setAcaoEmCurso(null); }
  };

  /* ====== AS OPERAÇÕES DE CENA PASSAM TODAS PELO MÓDULO PURO ====== */

  const aplicarNasCenas = (transformar: (cenas: never[]) => never[]) => setDraft(current => {
    if (!current) return current;
    if (current.kind === "video_script") return { ...current, scenes: transformar(current.scenes as never[]) } as WriterDeliverablePayload;
    return { ...current, slides: transformar(current.slides as never[]) } as WriterDeliverablePayload;
  });

  const adicionar = () => {
    const id = crypto.randomUUID();
    setDraft(current => {
      if (!current) return current;
      if (current.kind === "video_script") {
        return { ...current, scenes: adicionarCena(current.scenes, novaCena(id, current.scenes.length) as never) };
      }
      return { ...current, slides: adicionarCena(current.slides, {
        id, order: current.slides.length, heading: "", body: "", visual: null, sourceRefs: [],
      } as never) };
    });
    setCenaSelecionada(id);
  };

  const editar = (id: string, campo: string, valor: string | number) =>
    aplicarNasCenas(cenas => editarCena(cenas, id, { [campo]: valor } as never) as never[]);
  const remover = (id: string) => {
    aplicarNasCenas(cenas => removerCena(cenas, id) as never[]);
    setCenaSelecionada(atual => (atual === id ? "" : atual));
  };
  const duplicar = (id: string) => {
    const novoId = crypto.randomUUID();
    aplicarNasCenas(cenas => duplicarCena(cenas, id, () => novoId) as never[]);
    setCenaSelecionada(novoId);
  };
  const mover = (id: string, deslocamento: number) =>
    aplicarNasCenas(cenas => moverCena(cenas, id, deslocamento) as never[]);

  /*
   * O objeto é remontado quando o estado muda, e o efeito o entrega ao pai. Na
   * saída entrega `null`: uma barra órfã apontando para um ambiente que não
   * está mais na tela é pior do que barra nenhuma.
   */
  const barra = useMemo<WriterDeliverableBar>(() => ({
    kind,
    estado: !stored ? "none" : stored.status === "approved" ? "approved" : "draft",
    ocupado: busy,
    mensagem: message,
    tom,
    acaoEmCurso,
    salvar: () => void save(),
    finalizar: () => void acao("finalize"),
    reabrir: () => void acao("reopen"),
  /* eslint-disable-next-line react-hooks/exhaustive-deps -- os gatilhos são recriados a cada render por desenho; o que governa é o estado abaixo. */
  }), [kind, stored, busy, message, tom, acaoEmCurso, draft, brandId, documentId]);

  useEffect(() => {
    onBarChange?.(barra);
    return () => onBarChange?.(null);
  }, [barra, onBarChange]);

  if (!documentId) return <div className="p-6 text-sm text-text-muted">Receba um artigo do Radar antes de criar o roteiro ou carrossel.</div>;
  if (!draft) return <div className="p-6 text-sm text-text-muted">{message || "Carregando ambiente…"}</div>;

  const ehRoteiro = draft.kind === "video_script";
  /*
   * Finalizado é somente leitura na tela porque é somente leitura no servidor:
   * `writer_save_deliverable` recusa `approved` com `writer_approved_immutable`.
   * Deixar os campos editáveis só adiaria a recusa até o save, depois de a
   * pessoa ter digitado.
   */
  const finalizado = stored?.status === "approved";
  /*
   * Cena e slide têm formatos diferentes, e a tela lê os dois pela mesma
   * pilha. O tipo permissivo aqui é deliberado: a validação de verdade é o
   * `WriterDeliverablePayloadSchema` no save, que recusa campo fora do
   * contrato. Estreitar por união obrigaria a duplicar toda a renderização.
   */
  const partes = cenasEmOrdem((ehRoteiro ? draft.scenes : draft.slides) as unknown as ParteEditavel[]);
  const rotuloParte = ehRoteiro ? "Cena" : "Slide";

  /* As posições de mídia deste ambiente; o painel filtra pela cena aberta. */
  const alvos = ehRoteiro
    ? scriptAnchorTargets(draft.scenes as unknown as Record<string, unknown>[])
    : carouselAnchorTargets(draft.slides as unknown as Record<string, unknown>[]);

  return <main className="min-h-0 flex-1 overflow-auto bg-canvas text-text-primary" data-writer-derived-environment={draft.kind}>
    <div className="mx-auto flex max-w-6xl gap-6 p-4">

      {/* ===== O DOCUMENTO: LEITURA VERTICAL, CENA A CENA ===== */}
      {/*
        * ===== CORTE 6A.7 · SELECIONAR NÃO É EDITAR =====
        *
        * Havia um `fieldset disabled={finalizado}` aqui, e ele desabilitava TUDO
        * dentro — inclusive o mecanismo de seleção da cena. Elemento desabilitado
        * não dispara foco, então `cenaSelecionada` nunca era preenchida, o painel
        * de mídia nunca recebia alvo, e a tela pedia "selecione uma cena" sem
        * oferecer forma de selecionar. Beco sem saída silencioso.
        *
        * Agora: os campos de CONTEÚDO ficam `readOnly` (ainda focáveis,
        * selecionáveis, copiáveis) e os botões que MUDAM estrutura ficam
        * desabilitados. A cena continua clicável, e o painel abre para consulta.
        */}
      <fieldset className="m-0 min-w-0 flex-1 space-y-4 border-0 p-0">
        {/*
          * ===== CORTE 6A.8 · O MOTIVO INTEIRO, ONDE CABE =====
          *
          * A barra tem altura fixa e trunca. Aqui há largura e quebra de linha,
          * então a mensagem aparece completa — sem DevTools, sem tooltip, sem
          * depender de reticências.
          */}
        {tom === "erro" && message && <div role="alert" data-deliverable-erro
          className="rounded border border-danger bg-danger/10 p-3 text-sm text-danger">
          <strong className="block">A ação não foi concluída.</strong>
          <span className="mt-1 block break-words">{message}</span>
        </div>}

        <header className="border-b border-border pb-3">
          <input className="w-full bg-transparent text-2xl font-semibold outline-none" value={draft.title}
            readOnly={finalizado}
            onChange={event => update("title", event.target.value)} aria-label="Título do roteiro"
            placeholder={ehRoteiro ? "Roteiro sem título" : "Carrossel sem título"}/>
          <p className="mt-1 text-xs text-text-muted">
            <span data-deliverable-status={finalizado ? "approved" : "draft"}
              className={finalizado ? "font-semibold text-success" : "font-semibold text-text-primary"}>
              {finalizado ? "Finalizado" : "Em redação"}
            </span>
            {" · "}{ehRoteiro ? "Roteiro e storyboard" : "Carrossel"} · derivado de “{title}” ·{" "}
            {partes.length} {rotuloParte.toLowerCase()}{partes.length === 1 ? "" : "s"}
            {stored ? ` · v${stored.lockVersion}` : " · novo rascunho"}
          </p>
          {finalizado && <p className="mt-2 rounded border border-border bg-surface p-2 text-xs text-text-muted" data-finalizado-aviso>
            Este {ehRoteiro ? "roteiro" : "carrossel"} está finalizado: o conteúdo está em
            somente leitura e a mídia não aceita alteração. Você ainda pode abrir cada
            {" "}{rotuloParte.toLowerCase()} e consultar o briefing, o texto alternativo e a imagem.
            Use <strong>Reabrir para edição</strong> na barra superior para voltar a trabalhar nele —
            a última versão finalizada continua guardada.
          </p>}
          {draft.sourceDocumentHash !== sourceHash && <div className="mt-3 rounded border border-warning p-3 text-sm">
            O artigo de origem mudou. Confira a nova versão antes de atualizar a base deste {ehRoteiro ? "roteiro" : "carrossel"}.
            <button className={`${button} ml-3`} disabled={finalizado}
              onClick={() => setDraft(current => current ? { ...current, sourceDocumentHash: sourceHash } : current)}>Atualizar base após revisão</button>
          </div>}
        </header>

        {/*
          * ===== ESTADO VAZIO: O CONTEXTO JÁ ESTÁ AQUI =====
          *
          * A versão anterior deste bloco dizia que não oferecia "gerar estrutura
          * inicial" porque não havia autoridade server-side. Agora há:
          * `/api/redator/seed`, no caminho canônico de IA da plataforma. O botão
          * deixou de ser promessa falsa.
          *
          * Semear só aparece quando existe dossiê — sem contexto o botão não
          * teria do que partir. E "Começar manualmente" continua ao lado, porque
          * a geração é uma oferta, não o único caminho.
          */}
        {partes.length === 0 ? <div className="rounded border border-dashed border-border p-8 text-center" data-cenas-vazio>
          <p className="text-sm text-text-muted">Ainda não há {ehRoteiro ? "cenas" : "slides"}.</p>
          {temDossie && <>
            <p className="mt-1 text-xs text-text-muted" data-contexto-disponivel>Contexto do Radar disponível.</p>
            <button className={`${button} mt-3`} disabled={finalizado || busy} onClick={() => void semear()} data-semear>
              <Sparkles className="mr-1 inline h-4 w-4" aria-hidden="true"/>
              {actionButtonLabel({ action: ehRoteiro ? "semear_roteiro" : "semear_carrossel", emCurso: acaoEmCurso,
                rotuloParado: `Criar ${ehRoteiro ? "roteiro" : "carrossel"} a partir deste contexto` })}
            </button>
          </>}
          <button className={`${button} ${temDossie ? "mt-2" : "mt-3"}`} disabled={finalizado || busy} onClick={adicionar} data-adicionar-primeira>
            <Plus className="mr-1 inline h-4 w-4" aria-hidden="true"/>
            {temDossie ? "Começar manualmente" : `Adicionar primeira ${rotuloParte.toLowerCase()}`}
          </button>
        </div> : <>
          {partes.map((parte, indice) => {
            const aberta = cenaSelecionada === parte.id;
            /*
             * Clique E foco selecionam. O clique é o que funciona com o conteúdo
             * em somente leitura; o foco é o que funciona pelo teclado. Depender
             * só de um deixaria metade das pessoas de fora.
             */
            return <section key={parte.id} data-cena={parte.id}
              onPointerDown={() => setCenaSelecionada(parte.id)}
              onFocusCapture={() => setCenaSelecionada(parte.id)}
              aria-current={aberta ? "true" : undefined}
              className={`cursor-pointer rounded border p-4 transition-colors ${aberta ? "border-action-accent bg-surface" : "border-border bg-surface/60"}`}>

              <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-text-muted">{rotuloParte} {indice + 1}</span>
                <input className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                  readOnly={finalizado}
                  value={ehRoteiro ? texto(parte.title) : texto(parte.heading)}
                  onChange={event => editar(parte.id, ehRoteiro ? "title" : "heading", event.target.value)}
                  aria-label={`Identificação da ${rotuloParte.toLowerCase()} ${indice + 1}`}
                  placeholder={ehRoteiro ? "Identificação da cena" : "Título do slide"}/>
                {/* Reordenar NÃO troca id: a mídia continua ancorada onde estava. */}
                <button className={iconeCena} disabled={finalizado || indice === 0} onClick={() => mover(parte.id, -1)}
                  aria-label={`Mover ${rotuloParte.toLowerCase()} ${indice + 1} para cima`}><ArrowUp className="h-3.5 w-3.5"/></button>
                <button className={iconeCena} disabled={finalizado || indice === partes.length - 1} onClick={() => mover(parte.id, 1)}
                  aria-label={`Mover ${rotuloParte.toLowerCase()} ${indice + 1} para baixo`}><ArrowDown className="h-3.5 w-3.5"/></button>
                <button className={iconeCena} disabled={finalizado} onClick={() => duplicar(parte.id)}
                  aria-label={`Duplicar ${rotuloParte.toLowerCase()} ${indice + 1}`}><Copy className="h-3.5 w-3.5"/></button>
                <button className={iconeCena} disabled={finalizado} onClick={() => remover(parte.id)}
                  aria-label={`Excluir ${rotuloParte.toLowerCase()} ${indice + 1}`}><Trash2 className="h-3.5 w-3.5"/></button>
              </div>

              {ehRoteiro ? <div className="space-y-3">
                <label className="block text-sm">Fala ou narração
                  <textarea readOnly={finalizado} className={`${field} mt-1 min-h-24`} value={texto(parte.narration)}
                    onChange={event => editar(parte.id, "narration", event.target.value)}/></label>
                <label className="block text-sm">Texto na tela
                  <textarea readOnly={finalizado} className={`${field} mt-1 min-h-16`} value={texto(parte.onScreenText)}
                    onChange={event => editar(parte.id, "onScreenText", event.target.value)}
                    placeholder="Legenda, lettering ou card que aparece escrito"/></label>
                <label className="block text-sm">Direção visual
                  <textarea readOnly={finalizado} className={`${field} mt-1 min-h-16`} value={texto(parte.visualDirection)}
                    onChange={event => editar(parte.id, "visualDirection", event.target.value)}/></label>
                <details className="text-sm">
                  <summary className="cursor-pointer text-text-muted">Observação e duração</summary>
                  <label className="mt-2 block">Observação
                    <textarea readOnly={finalizado} className={`${field} mt-1`} value={texto(parte.technicalDirection)}
                      onChange={event => editar(parte.id, "technicalDirection", event.target.value)}
                      placeholder="Instrução técnica, nota de gravação, lembrete"/></label>
                  <label className="mt-2 block">Duração em segundos
                    <input type="number" min="0" readOnly={finalizado} className={`${field} mt-1`} value={Number(parte.durationSeconds ?? 0)}
                      onChange={event => editar(parte.id, "durationSeconds", Number(event.target.value))}/></label>
                </details>
              </div> : <label className="block text-sm">Conteúdo do slide
                <textarea readOnly={finalizado} className={`${field} mt-1 min-h-24`} value={texto(parte.body)}
                  onChange={event => editar(parte.id, "body", event.target.value)}/></label>}

              <p className="mt-3 text-xs text-text-muted">
                {aberta ? "Mídia desta cena no painel ao lado." : "Clique nesta cena para trabalhar a mídia dela."}
              </p>
            </section>;
          })}

          <button className={button} disabled={finalizado} onClick={adicionar} data-adicionar-cena>
            <Plus className="mr-1 inline h-4 w-4" aria-hidden="true"/>Adicionar {rotuloParte.toLowerCase()}
          </button>
        </>}

        {/*
          * ===== OS METADADOS SAÍRAM DO CAMINHO, NÃO DO CONTRATO =====
          *
          * Canal, público, objetivo, abertura e chamada continuam no schema e
          * nos dados gravados. Recolhidos, eles servem a quem precisa sem
          * decidir como a tela abre. `channel` segue OPCIONAL: nada aqui o
          * exige, e nenhum destino é preenchido automaticamente.
          */}
        <details className="rounded border border-border p-3" open={metadadosAbertos}
          onToggle={event => setMetadadosAbertos((event.target as HTMLDetailsElement).open)}
          data-metadados-opcionais>
          <summary className="cursor-pointer text-sm text-text-muted">Metadados opcionais</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm">Canal <span className="text-text-muted">(opcional)</span>
              <input readOnly={finalizado} className={`${field} mt-1`} value={draft.channel} onChange={event => update("channel", event.target.value)}/></label>
            <label className="text-sm">Público
              <input readOnly={finalizado} className={`${field} mt-1`} value={draft.audience} onChange={event => update("audience", event.target.value)}/></label>
            <label className="text-sm md:col-span-2">Objetivo
              <textarea readOnly={finalizado} className={`${field} mt-1`} value={draft.objective} onChange={event => update("objective", event.target.value)}/></label>
            {draft.kind === "video_script" && <>
              <label className="text-sm">Duração total em segundos
                <input type="number" min="0" readOnly={finalizado} className={`${field} mt-1`} value={draft.durationSeconds} onChange={event => update("durationSeconds", Number(event.target.value))}/></label>
              <label className="text-sm">Abertura
                <input readOnly={finalizado} className={`${field} mt-1`} value={draft.openingHook} onChange={event => update("openingHook", event.target.value)}/></label>
            </>}
            {draft.kind === "carousel" && <label className="text-sm md:col-span-2">Legenda
              <textarea readOnly={finalizado} className={`${field} mt-1`} value={draft.caption} onChange={event => update("caption", event.target.value)}/></label>}
            <label className="text-sm md:col-span-2">Chamada final
              <textarea readOnly={finalizado} className={`${field} mt-1`} value={draft.closingCta} onChange={event => update("closingCta", event.target.value)}/></label>
          </div>
        </details>

        {/*
          * Salvar, finalizar e reabrir moram na GlobalTopbar, com os controles
          * do artigo. Repeti-los aqui daria dois lugares para a mesma ação e um
          * deles envelheceria primeiro.
          */}
      </fieldset>

      {/* ===== O STORYBOARD DA CENA ABERTA, NO PAINEL LATERAL ===== */}
      <aside className="w-72 shrink-0" data-storyboard-lateral>
        {cenaSelecionada
          ? <WriterMediaAnchorPanel brandId={brandId} documentId={documentId}
              targets={alvos.filter(alvo => alvo.ref === cenaSelecionada)}
              assets={mediaRowsToPanelAssets(media)} onChanged={load} readOnly={finalizado}/>
          : <>
              {/*
                * ===== REDATOR_DOSSIER_SURFACE_1 · SEM CENA ABERTA, O PAINEL É O DOSSIÊ =====
                *
                * O roteiro nascia vazio ao lado de um dossiê que ninguém via. Enquanto
                * nenhuma cena está selecionada, o painel direito mostra os fundamentos
                * do Radar — lidos do documento de origem, não gravados no entregável.
                */}
              <p className="mb-3 rounded border border-dashed border-border p-3 text-xs text-text-muted">
                Selecione uma {rotuloParte.toLowerCase()} para trabalhar a mídia dela.
              </p>
              <WriterRadarFoundationsPanel document={document} compact/>
            </>}
      </aside>
    </div>
  </main>;
}
