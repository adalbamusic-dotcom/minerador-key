/* eslint-disable jsx-a11y/alt-text -- lucide's Image icon is not an HTML img element. */
"use client";

import { radarWriterImportable } from "@/lib/redator/writer-handoff";
import { radarPrimaryProfileOfAnalysis } from "@/lib/radar/evidence-bundle-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Link as LinkExtension } from "@tiptap/extension-link";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extension-placeholder";
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronLeft, ChevronRight, Columns3, Eraser, ExternalLink, FileText, Heading1, Heading2, Heading3, Heading4, Image, Italic, Link2, List, ListOrdered, MessageSquare, Minus, Pilcrow, Plus, Quote, Search, Sparkles, Strikethrough, Table2, UnderlineIcon, WandSparkles } from "lucide-react";
import { useEditorialPipeline } from "@/components/editorial-pipeline-context";
import { useSupabaseSession } from "@/components/auth/supabase-session-context";
import { useBrand } from "@/components/brand-context";
import { ContentDocumentSchema, type ContentDocument } from "@/lib/arquiteto/contracts";
import { isPartialContentDocument, recoveryOverServerDocument } from "@/lib/editorial/content-document-listing";
import { contentDocumentToTiptapSeed, tiptapJsonToContentBlocks } from "@/lib/arquiteto/document";
import { BlockIdentity, EditorialBlock, EditorialComment } from "@/lib/arquiteto/tiptap-extensions";
import { contentHash } from "@/lib/arquiteto/versioning";
import { WorkflowImportDialog, WorkflowStatusBadge } from "@/components/editorial/workflow-status";
import { HistoryControls } from "@/components/editorial/history-controls";
import { useLocalHistory } from "@/components/editorial/use-local-history";
import { useGlobalTopbarControlsRegistration, type GlobalTopbarModuleControls } from "@/components/global-topbar";
import { GLOBAL_TOPBAR_ACTION_CONTROL, GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY } from "@/components/global-topbar-control";
import { GuardianReportSchema, type GuardianReport, type RedatorImproveProposal, type RedatorSectionProposal } from "@/lib/redator/contracts";
import { runGuardian } from "@/lib/redator/guardian";
import { postRadarWriterHandoffBatch, radarWriterHandoffBatchSummary } from "@/lib/radar/writer-handoff-client";
import { WriterDerivedEnvironment, type WriterDeliverableBar } from "@/modules/redator/writer-derived-environment";
import { actionButtonLabel, feedbackClass, toneForSaveState } from "@/lib/redator/action-feedback";
import { newlyArrivedIds, resolveActiveDocument, shouldPersistLastOpened } from "@/lib/redator/active-document";
import { WriterMediaAnchorPanel } from "@/modules/redator/writer-media-anchor-panel";
import { WriterRadarFoundationsPanel } from "@/modules/redator/writer-radar-foundations-panel";
import { writerAlertRegistrationNotice } from "@/lib/redator/writer-section-evidence";
import { articleAnchorTargets, mediaRowsToPanelAssets, type PanelAsset } from "@/lib/redator/media-anchor-targets";
/* CORTE 3.5 · `Conectar IA` saiu do Redator. A autoridade de integração é /agencias/{agencyRef}/integracoes. */

const tool = "inline-flex h-7 min-w-7 items-center justify-center rounded border border-slate-800 bg-[#0b0c10] px-1.5 text-[9px] text-slate-400 hover:border-module-accent/40 hover:text-white disabled:opacity-30";
type SaveState = "idle" | "dirty" | "saving" | "saved_server" | "saved_local" | "conflict" | "error";

export function ProfessionalWriter({ initialArticleId = null, initialDocumentId = null }: { initialArticleId?: string | null; initialDocumentId?: string | null }) {
  const pipeline = useEditorialPipeline(); const { selectedBrandId } = useBrand();
  const { actorUserId } = useSupabaseSession();
  const documents = Object.values(pipeline.documents); const preferred = initialDocumentId ? pipeline.documents[initialDocumentId] : documents.find(item => item.articleDnaRef.entityId === initialArticleId);
  /*
   * ===== CORTE 6A.9 · A SELEÇÃO COMEÇA VAZIA E É RESOLVIDA POR REGRA =====
   *
   * Isto nascia com `documents[0]?.id` dentro do `useState`. Como o inicializador
   * roda UMA vez e a lista chega assíncrona, no primeiro render ele resolvia para
   * `""` — e nunca era corrigido. Daí em diante quem mandava era o
   * `|| documents[0]` lá embaixo, a cada render, sobre uma lista ordenada por
   * `updated_at DESC`. Um handoff do Radar trocava o documento ativo em silêncio.
   */
  const [selectedId, setSelectedId] = useState("");
  const [leftOpen, setLeftOpen] = useState(true); const [rightOpen, setRightOpen] = useState(true); const [importOpen, setImportOpen] = useState(false);
  /*
   * A imagem é trabalhada na POSIÇÃO a que pertence, e a seleção da posição
   * vive DENTRO do painel — assim o mesmo componente serve artigo, roteiro e
   * carrossel sem que cada tela reimplemente o seletor.
   */
  const [mediaAssets, setMediaAssets] = useState<PanelAsset[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle"); const [pending, setPending] = useState<ContentDocument | null>(null); const [saveMessage, setSaveMessage] = useState("");
  const [guardianReport, setGuardianReport] = useState<GuardianReport | null>(null); const [sectionProposal, setSectionProposal] = useState<RedatorSectionProposal | null>(null); const [improveProposal, setImproveProposal] = useState<RedatorImproveProposal | null>(null); const [aiBusy, setAiBusy] = useState(false);
  const [writingFormat, setWritingFormat] = useState<"article" | "video_script" | "carousel">("article");
  /*
   * ===== CORTE 6A.1 · OS CONTROLES DO ENTREGÁVEL NA BARRA QUE JÁ EXISTE =====
   *
   * O ambiente derivado publica estado e gatilhos; aqui só se desenha. A lógica
   * de salvar, finalizar e reabrir continua onde mora o estado do entregável.
   */
  const [deliverableBar, setDeliverableBar] = useState<WriterDeliverableBar | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null); const createVersionRef = useRef(false);
  /* `Salvar rascunho` reusa o autosave em vez de abrir um segundo caminho de gravação. */
  const flushRef = useRef(false); const [savedAt, setSavedAt] = useState<string | null>(null);
  /*
   * A ordem é de AUTORIDADE: seleção da tela > URL > estado persistido > primeiro
   * da lista. O passo 1 é o que impede o roubo — enquanto o documento escolhido
   * existir, nada o tira de lá.
   *
   * O `|| documents[0]` que ficava aqui foi embora: ele era o fallback que
   * decidia a cada render e deixava a ordenação mandar.
   */
  /*
   * ===== CORTE 6A.10 · A CONTINUIDADE VEM DO QUE FOI ABERTO =====
   *
   * O 6A.9 usava `moduleState.redator.selectedId` como persistência. Ele não é:
   * é estado React do contexto e volta a `{}` a cada F5, e por isso a resolução
   * caía em `documents[0]` — o mais recente — e um handoff do Radar tomava o
   * lugar do documento em edição.
   *
   * A autoridade que atravessa o recarregamento é `documentUserStates`, gravada
   * pela própria tela, por usuário, e carregada do servidor no workspace.
   *
   * `updated_at DESC` volta a ser só ordenação de lista.
   */
  const documentIds = documents.map(item => item.id);
  const ativo = resolveActiveDocument({
    selectedId,
    urlDocumentId: preferred?.id ?? initialDocumentId,
    userStates: pipeline.documentUserStates,
    /*
     * ===== CORTE 6A.12 · A LISTA CHEGA ANTES DO MAPA =====
     *
     * A recuperação local restaura `documents` do navegador e não restaura os
     * user states. Sem este sinal, a resolução caía no `documents[0]` naquela
     * janela — e o efeito abaixo gravava `last_opened_at` no documento errado.
     */
    userStatesReady: pipeline.documentUserStatesReady,
    availableIds: documentIds,
  });
  /*
   * ===== E1 · SÓ O DOCUMENTO COMPLETO É EDITÁVEL =====
   *
   * A listagem da mesa traz o documento sem o pacote do Radar
   * (`importedContext.dossier.bundle`), marcado como parcial. `selected` é o
   * documento COMPLETO — o que o editor, o autosave, os metadados, o Guardião
   * e o painel de fundamentos usam — e fica nulo até o detalhe chegar do
   * servidor. Editar a cópia parcial e salvá-la levaria o pacote embora; por
   * isso nenhum caminho de edição vê a cópia parcial.
   *
   * A escolha continua sendo a da regra (`ativo.id`), sem cair no primeiro da
   * lista; muda só quando o documento vira editável.
   */
  const listado = pipeline.documents[ativo.id] || null;
  const selected = listado && !isPartialContentDocument(listado) ? listado : null;
  const idAguardandoDetalhe = listado && isPartialContentDocument(listado) ? listado.id : null;
  const [falhaDoDetalhe, setFalhaDoDetalhe] = useState<{ id: string; message: string; rascunhoLocal: boolean } | null>(null);
  const [tentativaDoDetalhe, setTentativaDoDetalhe] = useState(0);
  const { loadDocumentDetail } = pipeline;
  /*
   * O lock que a lista já conhece entra no pedido: se uma releitura da mesa
   * trouxer lock maior enquanto o detalhe voa, este efeito pede de novo e o
   * provider descarta o detalhe atrasado (o lock nunca anda para trás).
   */
  const lockDoListado = idAguardandoDetalhe ? pipeline.documentLocks[idAguardandoDetalhe] ?? 0 : 0;
  /* O rascunho de recuperação por documento, se existir, é avisado na falha — nunca aplicado sem o completo. */
  const chaveDoRascunhoAguardando = actorUserId && selectedBrandId && idAguardandoDetalhe ? `minerador-pro:document-recovery:${actorUserId}:${selectedBrandId}:${idAguardandoDetalhe}` : null;
  useEffect(() => {
    if (!idAguardandoDetalhe) return;
    let vigente = true;
    loadDocumentDetail(idAguardandoDetalhe, { minLockVersion: lockDoListado }).then(
      () => { if (vigente) setFalhaDoDetalhe(null); },
      (erro: unknown) => {
        if (!vigente) return;
        let rascunhoLocal = false;
        try { rascunhoLocal = Boolean(chaveDoRascunhoAguardando && window.localStorage.getItem(chaveDoRascunhoAguardando)); } catch { /* armazenamento indisponível: só não avisa */ }
        setFalhaDoDetalhe({ id: idAguardandoDetalhe, message: erro instanceof Error ? erro.message : "Não foi possível abrir o documento completo.", rascunhoLocal });
      });
    return () => { vigente = false; };
  }, [idAguardandoDetalhe, lockDoListado, chaveDoRascunhoAguardando, loadDocumentDetail, tentativaDoDetalhe]);
  const falhaDoDocumentoAberto = falhaDoDetalhe && falhaDoDetalhe.id === idAguardandoDetalhe ? falhaDoDetalhe.message : null;
  const rascunhoLocalGuardado = Boolean(falhaDoDetalhe && falhaDoDetalhe.id === idAguardandoDetalhe && falhaDoDetalhe.rascunhoLocal);

  /*
   * ===== A ESTABILIDADE NÃO PRECISA DE EFEITO NOVO =====
   *
   * A primeira versão disto fixava a resolução com um `setSelectedId` dentro de
   * um efeito — e o lint estava certo em recusar: `set-state-in-effect` encadeia
   * renders para sincronizar algo que já é derivável.
   *
   * O que segura a seleção é a persistência que o projeto JÁ tinha. O efeito
   * logo abaixo grava `moduleState.redator.selectedId` sempre que o documento
   * ativo muda; na volta, a regra encontra esse id e o mantém. A sequência:
   *
   *   lista vazia          → activeId ""            → nada selecionado
   *   lista chega          → activeId = primeiro    → efeito grava no moduleState
   *   handoff novo chega   → persistido ainda vale  → activeId NÃO muda
   *   pessoa clica noutro  → selectedId vence       → e vira o novo persistido
   *
   * O passo 3 é o defeito fechado: a lista reordena, o documento ativo fica.
   */

  /*
   * O que chegou DEPOIS que a tela abriu — para MARCAR na lista, nunca navegar.
   *
   * O inicializador preguiçoso roda uma vez, sem efeito e sem ref lido no
   * render. Limitação assumida: se a lista ainda não tinha carregado na
   * montagem, esta sessão não marca nada como novo. Preferi não marcar a marcar
   * errado — um "novo" falso na tela inteira seria pior que nenhum.
   */
  const [conhecidos] = useState<ReadonlySet<string>>(() => new Set(Object.keys(pipeline.documents)));
  const novos = newlyArrivedIds({ conhecidos, availableIds: documentIds });
  const publication = selected ? pipeline.operationalPublications.find(item => item.documentId === selected.id) : null; const published = publication?.state === "published";
  /*
   * ELEGÍVEL É O QUE O RADAR APROVOU — e `sent_writer` entra como já importado.
   *
   * O `id` da linha passa a ser o `articleId` porque é ele que o handoff recebe.
   * Usar o id da esteira obrigaria a traduzir de volta no clique, e a tradução
   * erraria em silêncio se a esteira tivesse duas linhas para o mesmo artigo.
   */
  const availableRadarArticles = pipeline.radarItems
    /* A esteira não decide: a finalização canônica decide — RADAR_MULTI_PROFILE_HANDOFF_1. */
    .filter(item => item.brandId === selectedBrandId && radarWriterImportable(item, radarPrimaryProfileOfAnalysis))
    .map(item => ({ ...item, id: item.articleId,
      alreadyImported: item.state === "sent_writer" || documents.some(document => document.articleDnaRef.entityId === item.articleId) }));
  const selectedRef = useRef(selected);
  const editorRef = useRef<Editor | null>(null); const editCheckpointRef = useRef(false); const restoringHistoryRef = useRef(false);
  const historyValue = useMemo(() => ({ documents: pipeline.documents, guardianFindings: pipeline.guardianFindings, operationalPublications: pipeline.operationalPublications }), [pipeline.documents, pipeline.guardianFindings, pipeline.operationalPublications]);
  const history = useLocalHistory("redator", historyValue, snapshot => {
    pipeline.restoreOperationalSnapshot("redator", snapshot);
    const restored = snapshot.documents[selectedId];
    if (restored) {
      restoringHistoryRef.current = true;
      editorRef.current?.commands.setContent(contentDocumentToTiptapSeed(restored));
      queueMicrotask(() => { restoringHistoryRef.current = false; });
    }
  }, 30, selectedBrandId || "sem-marca");
  const recoveryKey = actorUserId && selectedBrandId && selected ? `minerador-pro:document-recovery:${actorUserId}:${selectedBrandId}:${selected.id}` : null;

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const extensions = useMemo(() => [StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }), LinkExtension.configure({ openOnClick: false, autolink: true }), Underline,
    TextAlign.configure({ types: ["heading", "paragraph"] }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell,
    Placeholder.configure({ placeholder: "Escreva esta seção…" }), BlockIdentity, EditorialBlock, EditorialComment], []);

  const editor = useEditor({ extensions, immediatelyRender: false, content: selected ? contentDocumentToTiptapSeed(selected) : { type: "doc", content: [{ type: "paragraph" }] }, editable: Boolean(selected),
    onUpdate: ({ editor: instance }) => { const base = selectedRef.current; if (!base || restoringHistoryRef.current) return; if (!editCheckpointRef.current) { history.capture(`Início da edição de ${base.title}`); editCheckpointRef.current = true; } const json = instance.getJSON(); const updated = ContentDocumentSchema.parse({ ...base, editorContent: json, blocks: tiptapJsonToContentBlocks(json, base.blocks), status: "escrevendo" });
      setPending(updated); setGuardianReport(null); pipeline.updateDocumentLocal(updated); setSaveState("dirty"); setSaveMessage("Alterações aguardando autosave."); },
  }, [selected?.id]);
  useEffect(() => { editorRef.current = editor; }, [editor]);

  /*
   * PRÉ-M3 · a lista de ativos vem da MESMA leitura que o ambiente derivado usa
   * (`/api/redator/deliverables`). Nenhuma rota nova de leitura: duas listas de
   * mídia divergiriam, e divergir é como se perde o vínculo com a posição.
   */
  /*
   * A leitura acontece sob demanda — ao escolher a posição e depois de cada
   * troca —, não num efeito de montagem. Efeito que chama `setState` dispara
   * renderização em cascata, e aqui ele também buscaria mídia em todo documento
   * aberto, inclusive nos que ninguém vai ilustrar.
   */
  const loadMediaAssets = async () => {
    if (!selectedBrandId || !selected?.id) { setMediaAssets([]); return; }
    try {
      const response = await fetch(`/api/redator/deliverables?brandId=${encodeURIComponent(selectedBrandId)}&documentId=${encodeURIComponent(selected.id)}`);
      if (!response.ok) { setMediaAssets([]); return; }
      const body = await response.json();
      setMediaAssets(mediaRowsToPanelAssets(body.media));
    } catch { setMediaAssets([]); }
  };

  /*
   * O alvo é DERIVADO, e não sincronizado por efeito: ele guarda de qual
   * documento é, e deixa de valer sozinho quando o documento aberto muda. Um
   * efeito que zerasse o alvo a cada troca deixaria, por um render, a posição
   * de um documento apontando para dentro de outro.
   */

  useEffect(() => { if (!selected || !editor || !recoveryKey) return; const timer = window.setTimeout(() => { const raw = window.localStorage.getItem(recoveryKey); if (!raw) return;
      /* E1 · o pacote do Radar e a procedência vêm do servidor (`selected`); do rascunho, só o que o Redator edita. */
      try { const recovered = recoveryOverServerDocument(selected, ContentDocumentSchema.parse(JSON.parse(raw))); if (!recovered) { setSaveState("conflict"); setSaveMessage("O rascunho local deste documento é de outro pacote do Radar; ele não foi aplicado e continua guardado neste navegador."); return; } editor.commands.setContent(contentDocumentToTiptapSeed(recovered)); pipeline.updateDocumentLocal(recovered); setSaveState("saved_local"); setSaveMessage("Rascunho de recuperação local restaurado."); } catch { /* recuperação inválida é ignorada */ }
    }, 0); return () => window.clearTimeout(timer); }, [editor, selected?.id, recoveryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!selected) return; const timer = window.setTimeout(() => { const state = pipeline.documentUserStates[selected.id]; if (!state) return; setLeftOpen(state.leftPanelOpen); setRightOpen(state.rightPanelOpen); scrollRef.current?.scrollTo({ top: state.scrollTop }); }, 0); return () => window.clearTimeout(timer); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!pending || !actorUserId || !recoveryKey) return; const actorAtStart = actorUserId; const timer = window.setTimeout(async () => { setSaveState("saving"); setSaveMessage("Salvando…"); const hash = await contentHash(pending);
      try { const response = await fetch("/api/editorial/documents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrandId, documentId: pending.id, expectedLockVersion: pipeline.documentLocks[pending.id] || 1, document: pending, contentHash: hash, createVersion: createVersionRef.current, changeReason: createVersionRef.current ? "Marco editorial criado pelo usuário." : "Autosave editorial." }) }); const body = await response.json();
        if (actorUserId !== actorAtStart) return;
        if (response.ok) { flushRef.current = false; setSavedAt(new Date().toLocaleTimeString("pt-BR")); pipeline.updateDocumentLocal(pending, body.lockVersion); window.localStorage.removeItem(recoveryKey); setSaveState("saved_server"); setSaveMessage(body.version ? (body.version.reused ? `Versão ${body.version.versionNumber} já estava finalizada; nada foi criado.` : `Versão ${body.version.versionNumber} criada e salva.`) : `Salvo no servidor às ${new Date(body.updatedAt).toLocaleTimeString("pt-BR")}.`); createVersionRef.current = false; editCheckpointRef.current = false; setPending(null); return; }
        if (response.status === 409) { setSaveState("conflict"); setSaveMessage("Outra sessão alterou este documento. Recarregue antes de sobrescrever."); return; }
        window.localStorage.setItem(recoveryKey, JSON.stringify(pending)); setSaveState("saved_local"); setSaveMessage(body.code === "persistence_unavailable" ? "Salvo somente como recuperação local; migration ainda não aplicada." : "Servidor indisponível; recuperação local criada.");
      } catch { if (actorUserId !== actorAtStart) return; window.localStorage.setItem(recoveryKey, JSON.stringify(pending)); setSaveState("saved_local"); setSaveMessage("Sem conexão; recuperação local criada."); }
    }, flushRef.current ? 0 : 1200); return () => window.clearTimeout(timer); }, [actorUserId, pending, recoveryKey, selectedBrandId, pipeline]);

  /*
   * ===== A GRAVAÇÃO SÓ ACONTECE PARA SELEÇÃO LEGÍTIMA =====
   *
   * Este efeito escreve `last_opened_at = now()`. Era ele que contaminava a
   * autoridade: quando a resolução caía no fallback por reordenação, o documento
   * errado ganhava um "último aberto" que ele nunca teve — foi assim que
   * "skin care noturno" apareceu como o mais recente às 07:14.
   *
   * Com o passo do `lastOpenedAt` na frente do fallback, o fallback só é
   * alcançado quando não há o que preservar. `shouldPersistLastOpened` deixa
   * essa condição explícita em vez de implícita na ordem dos ifs.
   */
  useEffect(() => { if (!selected || !shouldPersistLastOpened({ origin: ativo.origin, documentId: ativo.id, userStatesReady: pipeline.documentUserStatesReady })) return; pipeline.setModuleState("redator", { selectedId: selected.id }); const timer = window.setTimeout(() => { void fetch("/api/editorial/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrandId, documentId: selected.id, cursorPosition: editor?.state.selection.from || null, scrollTop: scrollRef.current?.scrollTop || 0, leftPanelOpen: leftOpen, rightPanelOpen: rightOpen }) }); }, 500); return () => window.clearTimeout(timer); }, [selected?.id, leftOpen, rightOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id: string) => { setSelectedId(id); setPending(null); setGuardianReport(null); setSectionProposal(null); setImproveProposal(null); setSaveState("idle"); };
  const requestStatus = (status: "em_revisao" | "aprovado") => { if (!selected) return; if (status === "aprovado" && localGuardian?.blockingCount) { setSaveState("error"); setSaveMessage(`Aprovação bloqueada: ${localGuardian.blockingCount} achado(s) crítico(s) no Guardião.`); return; } history.capture(`Mudar status de ${selected.title} para ${status}`); const updated = ContentDocumentSchema.parse({ ...selected, status }); createVersionRef.current = true; setPending(updated); pipeline.updateDocumentLocal(updated); setSaveState("dirty"); setSaveMessage(status === "em_revisao" ? "Preparando envio para revisão…" : "Preparando versão aprovada…"); };
  /*
   * ===== SALVAR RASCUNHO — MANUAL, PELO MESMO CAMINHO DO AUTOSAVE =====
   *
   * Ele NÃO abre uma segunda rota de gravação. Monta a cópia a partir do editor,
   * marca o flush e deixa o autosave disparar na hora: dois caminhos de escrita
   * para o mesmo documento divergiriam no primeiro campo novo.
   *
   * O horário exibido é o do servidor CONFIRMADO — só é escrito quando a resposta
   * volta OK. "Salvo" sobre uma gravação que falhou é pior que nenhum aviso.
   *
   * Rascunho não cria versão: `createVersion` só é ligado na mudança de estado.
   * Salvar duas vezes o mesmo conteúdo não produz versão nova por construção.
   */
  const saveDraftNow = () => {
    const base = selectedRef.current; if (!base) return;
    const json = editorRef.current?.getJSON();
    const updated = json
      ? ContentDocumentSchema.parse({ ...base, editorContent: json, blocks: tiptapJsonToContentBlocks(json, base.blocks), status: base.status === "aprovado" ? base.status : "escrevendo" })
      : base;
    flushRef.current = true; createVersionRef.current = false;
    setPending(updated); setSaveState("saving"); setSaveMessage("Salvando no servidor…");
  };

  /*
   * ===== FINALIZAR ARTIGO — RASCUNHO → PRONTO =====
   *
   * Não publica, não copia e não cria outro documento: muda o estado editorial
   * do MESMO `content_document`. Publicações passa a mostrá-lo como PRONTO
   * porque projeta esse documento, não uma cópia dele.
   *
   * Reusa `requestStatus("aprovado")`, que já recusa quando o Guardião tem
   * achado bloqueante — um segundo gate aqui poderia discordar do primeiro.
   */
  const finalizeArticle = () => requestStatus("aprovado");

  /*
   * ===== CORTE 2 · IMPORTAR DO RADAR — UM GATILHO, NENHUMA AUTORIDADE NOVA =====
   *
   * Este botão NÃO implementa handoff. Ele lista elegíveis e chama
   * `postRadarWriterHandoff`, o mesmo cliente que o botão do Radar usa, que bate
   * na mesma rota e no mesmo `sendRadarToWriter`. Se ele montasse documento ou
   * decidisse prontidão aqui, existiriam duas traduções da mesma recusa — e a
   * tela mostraria "bloqueado" de um lado e "falhou" do outro pelo mesmo motivo.
   *
   * A idempotência é do serviço, não daqui: primeiro envio importa, repetição
   * com a mesma identidade devolve `ALREADY_IMPORTED`, e divergência de
   * identidade/hash devolve `BLOCKED_STALE` — erro explícito, nunca sobrescrita.
   */
  /*
   * ENTREGA A PUBLICAÇÕES — o sucesso vem do servidor, não da tela.
   *
   * `sendToPublications` lança quando o readback não confirma. A mensagem de
   * erro é a do servidor, e não uma tradução otimista: "não foi possível" sem
   * motivo manda quem opera procurar no lugar errado.
   */
  const sendToPublications = async () => {
    if (!selected) return;
    setAiBusy(true); setSaveMessage("Entregando a Publicações…");
    try {
      const resultado = await pipeline.sendToPublications(selected.id);
      setSaveState("saved_server");
      setSaveMessage(resultado.change === "ALREADY_SENT"
        ? "Este artigo já estava em Publicações; nada foi duplicado."
        : "Pacote entregue a Publicações e confirmado na leitura remota.");
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "A entrega a Publicações não foi confirmada.");
    } finally { setAiBusy(false); }
  };

  const importFromRadar = async (ids: string[]) => {
    if (!selectedBrandId) { setSaveMessage("Selecione uma marca antes de importar do Radar."); return; }
    history.capture(`Importar ${ids.length} artigo(s) do Radar`);
    setAiBusy(true);
    try {
      const resultados = await postRadarWriterHandoffBatch({ brandId: selectedBrandId, articleIds: ids });
      setImportOpen(false);
      setSaveMessage(radarWriterHandoffBatchSummary(resultados));
      /* A tela só recarrega o que o servidor confirmou ter criado. */
      if (resultados.some(item => item.outcome === "IMPORTED" || item.outcome === "TRANSITION_COMPLETED")) await pipeline.reloadOperational();
    } finally { setAiBusy(false); }
  };
  const addBlock = (kind: string, label: string, data: object) => { history.capture(`Inserir bloco: ${label}`); editor?.chain().focus().insertContent({ type: "editorialBlock", attrs: { blockId: crypto.randomUUID(), kind, label, data: JSON.stringify(data) } }).run(); };
  const promptLink = () => { if (!editor) return; const current = editor.getAttributes("link").href as string | undefined; const href = window.prompt("URL do link", current || "https://"); if (href === null) return; if (!href) editor.chain().focus().unsetLink().run(); else { try { new URL(href); editor.chain().focus().extendMarkRange("link").setLink({ href }).run(); } catch { setSaveMessage("URL inválida; o link não foi inserido."); } } };
  const metadata = (key: keyof ContentDocument["metadata"], value: string | string[]) => { if (!selected || (published && ["slug", "principalKeyword", "canonical"].includes(key))) return; if (!editCheckpointRef.current) { history.capture(`Editar metadados de ${selected.title}`); editCheckpointRef.current = true; } const updated = ContentDocumentSchema.parse({ ...selected, metadata: { ...selected.metadata, [key]: key === "canonical" ? value || null : value } }); setGuardianReport(null); setPending(updated); pipeline.updateDocumentLocal(updated); setSaveState("dirty"); };
  const wordCount = editor?.getText().split(/\s+/).filter(Boolean).length || 0;
  const localGuardian = selected ? runGuardian(selected, "local") : null;
  const displayedFindings = guardianReport?.findings || localGuardian?.findings || pipeline.guardianFindings.filter(finding => finding.documentId === selected?.id);

  const analyseGuardian = async () => {
    if (!selected) return;
    setAiBusy(true); setSaveMessage("Analisando o documento…");
    try {
      const hash = await contentHash(selected);
      const response = await fetch("/api/redator/guardian", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrandId, document: selected, contentHash: hash }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Não foi possível analisar o documento.");
      setGuardianReport(GuardianReportSchema.parse(body.report)); setSaveMessage("Guardião atualizado; a decisão continua humana.");
    } catch (error) { setGuardianReport(localGuardian); setSaveMessage(error instanceof Error ? error.message : "Análise local disponível; servidor indisponível."); }
    finally { setAiBusy(false); }
  };

  const requestSectionProposal = async (sectionId: string) => {
    if (!selected || aiBusy) return;
    const humanInstruction = window.prompt("Instrução opcional para esta seção", "") ?? "";
    setAiBusy(true); setSaveMessage("Preparando proposta da seção…");
    try {
      const response = await fetch("/api/redator/section", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrandId, document: selected, sectionId, humanInstruction }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Não foi possível preparar a seção.");
      setSectionProposal(body.proposal as RedatorSectionProposal); setSaveMessage(`Proposta pronta para revisão humana; nada foi aplicado.${writerAlertRegistrationNotice(body.divergences)}`);
    } catch (error) { setSaveMessage(error instanceof Error ? error.message : "Não foi possível preparar a seção."); }
    finally { setAiBusy(false); }
  };

  const requestImproveProposal = async () => {
    if (!selected || !editor || aiBusy) return;
    const { from, to } = editor.state.selection; const selectedText = editor.state.doc.textBetween(from, to, "\n");
    if (!selectedText.trim()) { setSaveMessage("Selecione um trecho antes de pedir melhoria."); return; }
    const humanInstruction = window.prompt("Como deseja melhorar o trecho?", "Melhorar clareza e naturalidade sem mudar o sentido.") ?? "";
    setAiBusy(true); setSaveMessage("Preparando melhoria do trecho…");
    try {
      const response = await fetch("/api/redator/improve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrandId, document: selected, selectedText, humanInstruction }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Não foi possível melhorar o trecho.");
      setImproveProposal(body.proposal as RedatorImproveProposal); setSaveMessage(`Melhoria pronta para revisão humana; nada foi aplicado.${writerAlertRegistrationNotice(body.divergences)}`);
    } catch (error) { setSaveMessage(error instanceof Error ? error.message : "Não foi possível melhorar o trecho."); }
    finally { setAiBusy(false); }
  };

  const applySectionProposal = () => {
    if (!editor || !sectionProposal) return;
    let insertionPosition: number | null = null;
    editor.state.doc.descendants((node, position) => { if (node.attrs?.blockId === sectionProposal.sectionId) insertionPosition = position + node.nodeSize; });
    if (insertionPosition === null) { setSaveMessage("A seção não está mais no documento; a proposta foi descartada."); setSectionProposal(null); return; }
    editor.chain().focus().insertContentAt(insertionPosition, sectionProposal.paragraphs.map(text => ({ type: "paragraph", attrs: { blockId: crypto.randomUUID() }, content: [{ type: "text", text }] }))).run();
    setSectionProposal(null); setSaveMessage("Proposta aplicada como novos parágrafos editáveis.");
  };

  const applyImproveProposal = () => { if (!editor || !improveProposal) return; editor.chain().focus().insertContent(improveProposal.replacementText).run(); setImproveProposal(null); setSaveMessage("Melhoria aplicada ao trecho selecionado; revise antes de salvar."); };

  const { registerControls, updateControls, unregisterControls } = useGlobalTopbarControlsRegistration();
  const globalTopbarControls = useMemo<GlobalTopbarModuleControls>(() => ({
    moduleId: "redator",
    history: {
      getCount: () => history.entries.length,
      canUndo: () => { const current = editorRef.current; return Boolean(current && !current.isDestroyed && current.can().chain().undo().run()); },
      canRedo: () => { const current = editorRef.current; return Boolean(current && !current.isDestroyed && current.can().chain().redo().run()); },
      undo: () => { const current = editorRef.current; if (current && !current.isDestroyed) current.chain().focus().undo().run(); },
      redo: () => { const current = editorRef.current; if (current && !current.isDestroyed) current.chain().focus().redo().run(); },
      undoLabel: "Desfazer edição",
      redoLabel: "Refazer edição",
      historyLabel: "Histórico do documento",
      undoTitle: "Desfazer edição no documento",
      redoTitle: "Refazer edição no documento",
      historyTitle: count => `Histórico do documento (${count})`,
      open: () => window.dispatchEvent(new CustomEvent("global-topbar-history", { detail: { module: "redator" } })),
    },
    /*
     * ===== TUDO DO DOCUMENTO MORA AQUI, NA BARRA QUE JÁ EXISTE =====
     *
     * Cada faixa horizontal nova empurra o documento para baixo. A tela chegou
     * a ter três: a global, a das abas e a dos controles. O centro é do texto;
     * o que sobra vai para as laterais, nunca para outra faixa.
     *
     * `tabs` troca o AMBIENTE; `actions` governa o documento. Os handlers são
     * os mesmos de antes — `saveDraftNow` e `finalizeArticle` —, não existe
     * segunda implementação de salvar ou finalizar.
     */
    tabs: <div className="flex shrink-0 items-center gap-1" data-redator-environment-tabs>
      {([["article", "Artigo"], ["video_script", "Roteiro e storyboard"], ["carousel", "Carrossel"]] as const).map(([value, label]) =>
        <button key={value} type="button" aria-current={writingFormat === value ? "page" : undefined}
          onClick={() => setWritingFormat(value)}
          className={`${GLOBAL_TOPBAR_ACTION_CONTROL} ${writingFormat === value ? "border-module-accent/50 bg-surface-elevated text-foreground" : ""}`}>{label}</button>)}
    </div>,
    /*
     * Sem `overflow-x-auto`: a barra de rolagem horizontal aparecia sob os
     * controles e roubava a altura útil da barra. A largura agora vem da
     * própria GlobalTopbar, que dá ao Redator a folga das laterais. Se ainda
     * faltar espaço, quem cede é o texto de estado do save — ele trunca — e
     * não os botões, que continuam visíveis e clicáveis. Nada de `flex-wrap`:
     * a barra tem altura fixa e uma segunda linha ficaria cortada.
     */
    actions: writingFormat !== "article"
      ? (deliverableBar ? <div className="flex items-center gap-2" data-redator-deliverable-actions>
          <span className={`${GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY} shrink-0 rounded border px-1.5 ${deliverableBar.estado === "approved" ? "border-success/40 text-success" : "border-divider text-text-muted"}`}
            data-deliverable-topbar-status={deliverableBar.estado}>
            {deliverableBar.estado === "approved" ? "Finalizado" : "Em redação"}
          </span>
          {/*
            * ===== CORTE 6A.8 · A FALHA PRECISA PARECER FALHA =====
            *
            * Isto usava sempre `text-text-muted`: um 409 em "Reabrir para edição"
            * ficava igual a "Sem alterações pendentes". Agora a cor vem de
            * `feedbackClass`, a MESMA tabela que a linha do artigo usa logo
            * abaixo, e o `title` devolve o texto inteiro que a barra trunca.
            *
            * `role="alert"` no erro para que leitores de tela anunciem sem
            * depender de foco; `role="status"` no resto, que é informativo.
            */}
          <span className={`${GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY} ${feedbackClass(deliverableBar.tom)}`}
            role={deliverableBar.tom === "erro" ? "alert" : "status"}
            title={deliverableBar.mensagem || undefined}
            data-deliverable-feedback={deliverableBar.tom}>
            {deliverableBar.mensagem || "Sem alterações pendentes"}
          </span>
          {deliverableBar.estado === "approved" ? <>
            <button type="button" className={GLOBAL_TOPBAR_ACTION_CONTROL} disabled={deliverableBar.ocupado}
              onClick={deliverableBar.reabrir}
              title="Volta para rascunho sem perder a última versão finalizada.">
              {actionButtonLabel({ action: "reabrir", emCurso: deliverableBar.acaoEmCurso,
                rotuloParado: "Reabrir para edição" })}
            </button>
            {/*
              * ===== A ENTREGA É DO ARTIGO, E O RÓTULO DIZ ISSO =====
              *
              * `sendWriterToPublications` entrega o `content_document` — ela não
              * lê `writer_deliverables` e exige o ARTIGO finalizado. Rotular
              * "Enviar a Publicações" aqui sugeriria que o roteiro vai junto, e
              * ele não vai. O botão é o mesmo de sempre, com o nome certo, e só
              * aparece quando a entrega é de fato possível.
              */}
            {selected?.status === "aprovado" && <button type="button" className={GLOBAL_TOPBAR_ACTION_CONTROL}
              disabled={aiBusy} onClick={() => void sendToPublications()}
              title="Entrega o ARTIGO a Publicações. Roteiro e carrossel não fazem parte desse pacote.">Enviar artigo a Publicações</button>}
          </> : <>
            <button type="button" className={GLOBAL_TOPBAR_ACTION_CONTROL} disabled={deliverableBar.ocupado}
              onClick={deliverableBar.salvar}
              title="Persiste no servidor e confirma a leitura remota. Salvar rascunho não cria versão.">
              {actionButtonLabel({ action: "salvar", emCurso: deliverableBar.acaoEmCurso,
                rotuloParado: "Salvar rascunho" })}
            </button>
            <button type="button" className={GLOBAL_TOPBAR_ACTION_CONTROL}
              disabled={deliverableBar.ocupado || deliverableBar.estado === "none"}
              onClick={deliverableBar.finalizar}
              title={deliverableBar.estado === "none"
                ? "Salve o rascunho antes de finalizar."
                : "Cria a versão final e marca como finalizado. Não publica."}>
              {actionButtonLabel({ action: "finalizar", emCurso: deliverableBar.acaoEmCurso,
                rotuloParado: deliverableBar.kind === "video_script" ? "Finalizar roteiro" : "Finalizar carrossel" })}
            </button>
          </>}
        </div> : null)
      : selected ? <div className="flex items-center gap-2" data-redator-document-actions>
      <WorkflowStatusBadge status={selected.status}/>
      {/* Decorativo perto do resto: some antes de qualquer controle colidir. */}
      <span className={`${GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY} hidden shrink-0 tabular-nums text-text-muted xl:inline`} aria-label={`${wordCount} palavras`}>{wordCount} palavras</span>
      {/* Estado do save: pendente, salvando, ou o horário que o servidor confirmou. */}
      {/*
        * A convenção é a mesma do entregável, e agora vem do mesmo lugar. O
        * ternário que morava aqui era a fonte original — repeti-lo do outro lado
        * teria criado duas tabelas que divergiriam no primeiro ajuste.
        */}
      <span className={`${GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY} ${feedbackClass(toneForSaveState(saveState))}`}
        role={toneForSaveState(saveState) === "erro" ? "alert" : "status"}
        title={saveMessage || undefined}
        data-artigo-feedback={toneForSaveState(saveState)}>
        {saveState === "saved_server" && savedAt ? `Salvo no servidor às ${savedAt}` : saveMessage || "Sem alterações pendentes"}
      </span>
      <button type="button" className={GLOBAL_TOPBAR_ACTION_CONTROL} disabled={saveState === "saving"} onClick={saveDraftNow} title="Persiste no servidor e confirma a leitura remota.">Salvar rascunho</button>
      <button type="button" className={GLOBAL_TOPBAR_ACTION_CONTROL} disabled={selected.status === "aprovado"} onClick={finalizeArticle} title="Marca o documento como finalizado. Não publica.">
        {selected.status === "aprovado" ? "Artigo finalizado" : "Finalizar artigo"}
      </button>
    </div> : null,
  /* eslint-disable-next-line react-hooks/exhaustive-deps -- os handlers são recriados a cada render por desenho; o que importa é o estado abaixo. */
  }), [history.entries.length, writingFormat, selected, wordCount, saveState, saveMessage, savedAt, deliverableBar, aiBusy]);
  const globalTopbarControlsRef = useRef<GlobalTopbarModuleControls>(globalTopbarControls);

  useEffect(() => {
    registerControls(globalTopbarControlsRef.current);
    return () => unregisterControls("redator");
  }, [registerControls, unregisterControls]);

  useEffect(() => {
    globalTopbarControlsRef.current = globalTopbarControls;
    updateControls(globalTopbarControls);
  }, [globalTopbarControls, updateControls]);

  return <div className="flex h-screen min-h-0 flex-col bg-[#07080b]">
    <HistoryControls moduleId="redator" showHistory={false} showUndoRedo={false} visualVariant="semantic" entries={history.entries} canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} onRestore={history.restore} compact presentation="popover"/>
    {/*
      * As abas de ambiente e os controles do documento moram na GlobalTopbar.
      * Uma barra horizontal por funcionalidade nova empurraria o documento para
      * baixo até sobrar uma faixa; o centro é do texto, e as laterais levam o
      * resto.
      */}
    {writingFormat === "article" ? <>
    <Toolbar editor={editor} addBlock={addBlock} promptLink={promptLink} onImprove={requestImproveProposal} aiBusy={aiBusy}/>
    <div className={`grid min-h-0 flex-1 ${leftOpen && rightOpen ? "grid-cols-[260px_minmax(0,1fr)_300px]" : leftOpen ? "grid-cols-[260px_minmax(0,1fr)]" : rightOpen ? "grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-1"}`}>
      {leftOpen && <aside className="min-h-0 overflow-auto border-r border-slate-850 bg-[#090a0e] p-3"><div className="flex items-center justify-between"><h2 className="text-[9px] font-bold uppercase text-slate-500">Rascunhos e fundamentos</h2><button className={tool} onClick={() => setLeftOpen(false)}><ChevronLeft className="h-3 w-3"/></button></div><div className="mt-2 space-y-1">{documents.map(item => <button key={item.id} onClick={() => choose(item.id)} aria-current={item.id === selected?.id ? "true" : undefined} data-documento-ativo={item.id === selected?.id ? "sim" : undefined} className={`block w-full rounded border p-2 text-left text-[9px] ${item.id === selected?.id ? "border-module-accent/40 bg-surface-subtle text-white" : "border-slate-850 text-slate-500"}`}><strong className="block truncate">{item.title}</strong><span>{item.status}</span>{item.id === selected?.id && <span className="ml-1 font-bold text-module-accent">· em edição</span>}{novos.has(item.id) && item.id !== selected?.id && <span className="ml-1 rounded bg-context-accent/20 px-1 font-bold text-context-accent" data-documento-novo>novo</span>}</button>)}</div>{ativo.origin === "pending"
         ? <p className="mt-3 text-[10px] text-slate-600" data-selecao-pendente>Carregando o que você abriu por último…</p>
         : !documents.length && <p className="mt-3 text-[10px] text-slate-600">Nenhum rascunho disponível. Envie uma investigação finalizada do Radar.</p>}<button type="button" onClick={() => setImportOpen(true)} className={`${tool} mt-3 w-full justify-center`} title="Lista os artigos aprovados no Radar e chama a mesma autoridade de entrega usada pelo botão do Radar."><Plus className="mr-1 h-2.5 w-2.5" aria-hidden="true"/>Importar do Radar</button>{selected && <><h3 className="mt-4 text-[9px] font-bold uppercase text-slate-600">Outline</h3>{selected.blocks.filter(block => block.type === "heading").map(block => <div key={block.id} className="mt-1 flex items-center gap-1"><button onClick={() => globalThis.document.querySelector(`[data-block-id="${block.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className="min-w-0 flex-1 truncate text-left text-[9px] text-slate-400">{"level" in block ? `H${block.level}` : ""} {"text" in block ? block.text : ""}</button><button className={tool} disabled={aiBusy} onClick={() => void requestSectionProposal(block.id)} title="Propor escrita para esta seção"><Sparkles className="h-3 w-3"/></button></div>)}<div className="mt-4 space-y-1 text-[9px] text-slate-600"><p>{selected.schemaVersion === 2 ? `Origem: Radar · análise ${selected.radarOrigin.analysisVersionId}` : `Plano editorial: ${selected.contentPlanRef.versionId}`}</p><p>Definição do artigo: {selected.articleDnaRef.versionId}</p><p>Arquitetura do silo: {selected.siloDnaRef.versionId}</p><p>Perfis das keywords: {selected.keywordDnaRefs.length}</p></div></>}</aside>}
      <main ref={scrollRef} className="min-h-0 overflow-auto bg-[#17181d] p-5">{!leftOpen && <button className={`${tool} fixed left-12 top-24 z-20`} onClick={() => setLeftOpen(true)}><ChevronRight className="h-3 w-3"/></button>}<div className="mx-auto min-h-[calc(100vh-150px)] w-full max-w-[880px] bg-white px-14 py-12 text-slate-900 shadow-2xl">{sectionProposal && <div className="mb-5 rounded border border-action-accent/30 bg-action-accent/5 p-3 text-xs"><strong>Proposta de seção — revisão humana</strong><p className="mt-1 text-slate-600">{sectionProposal.paragraphs.length} parágrafo(s) aguardando aplicação.</p><div className="mt-2 flex gap-2"><button className="rounded bg-action-accent px-2 py-1 text-white" onClick={applySectionProposal}>Aplicar como texto editável</button><button className="rounded border border-slate-300 px-2 py-1" onClick={() => setSectionProposal(null)}>Descartar</button></div></div>}{improveProposal && <div className="mb-5 rounded border border-amber-200 bg-amber-50 p-3 text-xs"><strong>Melhoria de trecho — revisão humana</strong><p className="mt-1 text-slate-600">{improveProposal.replacementText}</p><div className="mt-2 flex gap-2"><button className="rounded bg-amber-600 px-2 py-1 text-white" onClick={applyImproveProposal}>Aplicar melhoria</button><button className="rounded border border-slate-300 px-2 py-1" onClick={() => setImproveProposal(null)}>Descartar</button></div></div>}{selected ? <EditorContent editor={editor} className="professional-editor"/> : idAguardandoDetalhe ? <div className="flex min-h-[55vh] items-center justify-center text-center text-sm text-slate-400" data-documento-detalhe={falhaDoDocumentoAberto ? "falhou" : "carregando"} role={falhaDoDocumentoAberto ? "alert" : "status"}><div><FileText className="mx-auto mb-3 h-8 w-8"/>{falhaDoDocumentoAberto ? <><p>Não foi possível abrir o documento completo: {falhaDoDocumentoAberto}</p><p className="mt-1">A edição fica bloqueada até o documento completo chegar do servidor.</p>{rascunhoLocalGuardado && <p className="mt-1" data-rascunho-local-guardado>Há um rascunho local deste documento guardado neste navegador. Ele será restaurado quando o documento completo abrir.</p>}<button type="button" onClick={() => { setFalhaDoDetalhe(null); setTentativaDoDetalhe(total => total + 1); }} className="mt-3 inline-block text-action-accent underline">Tentar de novo</button></> : <p>Carregando o documento completo…</p>}</div></div> : <div className="flex min-h-[55vh] items-center justify-center text-center text-sm text-slate-400"><div><FileText className="mx-auto mb-3 h-8 w-8"/><p>Nenhum conteúdo de artigo disponível.</p><Link href="/radar" className="mt-3 inline-block text-action-accent underline">Abrir Radar</Link></div></div>}</div></main>
      {rightOpen && <aside className="min-h-0 overflow-auto border-l border-slate-850 bg-[#090a0e] p-3">{/*
        * A ENTREGA É CONTEXTUAL, E SÓ EXISTE DEPOIS DE FINALIZAR.
        *
        * Finalizar e entregar continuam sendo atos diferentes: o primeiro muda
        * o documento, o segundo cria o registro em Publicações com readback.
        * Mostrá-la antes de o documento estar pronto convidaria a clicar cedo.
        */}
       {selected?.status === "aprovado" ? <div className="mb-3 rounded border border-context-accent/30 bg-context-accent/5 p-2">
         <p className="text-[9px] text-slate-400">Artigo finalizado. A entrega cria o registro em Publicações e só confirma após a leitura remota.</p>
         <button type="button" className={`${tool} mt-2 w-full justify-center`} disabled={aiBusy} onClick={() => void sendToPublications()}>Enviar a Publicações</button>
       </div> : null}
       {/*
         * A POSIÇÃO VEM ANTES DA IMAGEM, E TUDO ACONTECE NELA.
         *
         * O painel é a superfície operacional inteira: escolher a posição,
         * registrar briefing, anexar arquivo, ver a imagem atual, editar alt e
         * substituir. Antes ele mostrava só o seletor e mandava anexar em
         * controles que não existiam neste ambiente.
         */}
       {/* REDATOR_DOSSIER_SURFACE_1 · a mesma projeção que o roteiro e o carrossel leem. */}
       {/* E1 · sem o documento completo, o painel diria "sem dossiê" — e o dossiê existe, só não chegou. */}
       {idAguardandoDetalhe
         ? <div className="rounded border border-dashed border-divider p-3 text-sm text-text-muted" data-radar-foundations="carregando">{falhaDoDocumentoAberto ? "Fundamentos do Radar indisponíveis até o documento completo abrir." : "Carregando os fundamentos do Radar…"}</div>
         : <WriterRadarFoundationsPanel document={selected}/>}
       <WriterMediaAnchorPanel brandId={selectedBrandId} documentId={selected?.id || null}
         targets={selected ? articleAnchorTargets({ documentId: selected.id, title: selected.title, blocks: selected.blocks }) : []}
         assets={mediaAssets} onChanged={loadMediaAssets}/>
       <div className="flex items-center justify-between"><h2 className="text-[9px] font-bold uppercase text-slate-500">Guardião</h2><div className="flex gap-1"><button className={tool} disabled={!selected || aiBusy} onClick={() => void analyseGuardian()} title="Analisar documento"><WandSparkles className="h-3 w-3"/></button><button className={tool} onClick={() => setRightOpen(false)}><ChevronRight className="h-3 w-3"/></button></div></div>{selected && <MetadataPanel document={selected} published={published} onChange={metadata}/>}<div className="mt-3 rounded border border-slate-850 p-2 text-[9px]"><strong className={localGuardian?.blockingCount ? "text-red-400" : "text-emerald-400"}>{guardianReport ? "Análise atual" : "Prévia local"}</strong><p className="mt-1 text-slate-500">{localGuardian?.blockingCount || 0} bloqueio(s) · {localGuardian?.warningCount || 0} aviso(s)</p><p className="mt-1 text-slate-600">A análise não aprova o documento.</p></div><h3 className="mt-4 text-[9px] font-bold uppercase text-slate-600">Achados por seção</h3><div className="mt-2 space-y-2">{displayedFindings.map(finding => <button key={finding.id} onClick={() => globalThis.document.querySelector(`[data-block-id="${finding.sectionId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className="w-full rounded border border-amber-900/40 p-2 text-left text-[9px]"><strong className="text-amber-400">{finding.category} · {finding.severity}</strong><p>{finding.message}</p><p className="text-slate-500">{finding.suggestion}</p></button>)}{!displayedFindings.length && <p className="text-[9px] text-slate-600">Nenhum achado no momento.</p>}</div></aside>}
      {!rightOpen && <button className={`${tool} fixed right-2 top-24 z-20`} onClick={() => setRightOpen(true)}><ChevronLeft className="h-3 w-3"/></button>}
    </div>

    </> : <WriterDerivedEnvironment key={`${writingFormat}:${selected?.id || ""}`} kind={writingFormat} brandId={selectedBrandId} documentId={selected?.id || null} title={selected?.title || "Novo entregável"} document={selected} onBarChange={setDeliverableBar}/>}
    <WorkflowImportDialog open={importOpen} title="Importar do Radar" description="Investigações finalizadas e aprovadas no Radar. Importar aqui é o mesmo envio que o botão “Enviar ao Redator” faz no Radar — repetir não duplica." rows={availableRadarArticles} emptyMessage="Nenhum artigo aprovado no Radar. Finalize uma investigação para que ela apareça aqui." label={item => item.title} details={item => <span className="mt-1 block text-slate-500">/{item.slug} · {item.intent}</span>} disabled={item => item.alreadyImported} disabledReason={() => "Já importado; repetir o envio não cria um segundo documento."} status={item => item.alreadyImported ? "sent_writer" : "approved"} onClose={() => setImportOpen(false)} onImport={importFromRadar}/>
  </div>;
}

function Toolbar({ editor, addBlock, promptLink, onImprove, aiBusy }: { editor: Editor | null; addBlock: (kind: string, label: string, data: object) => void; promptLink: () => void; onImprove: () => void; aiBusy: boolean }) {
  const action = (label: string, icon: React.ReactNode, run: () => void, active = false) => <button key={label} className={`${tool} ${active ? "border-module-accent/45 bg-context-accent/10 text-white" : ""}`} onClick={run} disabled={!editor} title={label}>{icon}</button>;
  return <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-850 bg-[#0a0b0f] p-1.5">{[1,2,3,4].map(level => action(`H${level}`, level === 1 ? <Heading1 className="h-3 w-3"/> : level === 2 ? <Heading2 className="h-3 w-3"/> : level === 3 ? <Heading3 className="h-3 w-3"/> : <Heading4 className="h-3 w-3"/>, () => editor?.chain().focus().toggleHeading({ level: level as 1|2|3|4 }).run(), Boolean(editor?.isActive("heading", { level }))))}{action("Parágrafo", <Pilcrow className="h-3 w-3"/>, () => editor?.chain().focus().setParagraph().run(), Boolean(editor?.isActive("paragraph")))}{action("Negrito", <Bold className="h-3 w-3"/>, () => editor?.chain().focus().toggleBold().run(), Boolean(editor?.isActive("bold")))}{action("Itálico", <Italic className="h-3 w-3"/>, () => editor?.chain().focus().toggleItalic().run(), Boolean(editor?.isActive("italic")))}{action("Sublinhado", <UnderlineIcon className="h-3 w-3"/>, () => editor?.chain().focus().toggleUnderline().run(), Boolean(editor?.isActive("underline")))}{action("Tachado", <Strikethrough className="h-3 w-3"/>, () => editor?.chain().focus().toggleStrike().run(), Boolean(editor?.isActive("strike")))}{action("Lista", <List className="h-3 w-3"/>, () => editor?.chain().focus().toggleBulletList().run())}{action("Lista numerada", <ListOrdered className="h-3 w-3"/>, () => editor?.chain().focus().toggleOrderedList().run())}{action("Citação", <Quote className="h-3 w-3"/>, () => editor?.chain().focus().toggleBlockquote().run())}{action("Tabela", <Table2 className="h-3 w-3"/>, () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}{action("Link", <Link2 className="h-3 w-3"/>, promptLink)}{action("Alinhar à esquerda", <AlignLeft className="h-3 w-3"/>, () => editor?.chain().focus().setTextAlign("left").run())}{action("Centralizar", <AlignCenter className="h-3 w-3"/>, () => editor?.chain().focus().setTextAlign("center").run())}{action("Alinhar à direita", <AlignRight className="h-3 w-3"/>, () => editor?.chain().focus().setTextAlign("right").run())}<span className="mx-1 h-5 border-l border-slate-800"/>{action("Link interno", <Columns3 className="h-3 w-3"/>, () => { const target = window.prompt("ID do artigo de destino"); const anchor = window.prompt("Âncora sugerida"); if (target && anchor) addBlock("internal_link", `Link interno: ${anchor}`, { targetArticleId: target, anchor }); })}{action("Fonte externa", <ExternalLink className="h-3 w-3"/>, () => { const claim = window.prompt("Afirmação que precisa de fonte"); const url = window.prompt("URL validada (opcional)", ""); if (claim) addBlock("external_source", `Fonte externa: ${claim}`, { sourceId: crypto.randomUUID(), claim, url: url || null }); })}{action("CTA", <Minus className="h-3 w-3"/>, () => { const text = window.prompt("Texto do CTA"); if (text) addBlock("CTA", `CTA: ${text}`, { text, objective: "Definir objetivo" }); })}{action("Produto", <FileText className="h-3 w-3"/>, () => addBlock("product_block", "Bloco de produto pendente", { productEvidenceId: "pending", title: "Produto", summary: "Evidência pendente" }))}{action("Comparação", <Table2 className="h-3 w-3"/>, () => addBlock("comparison", "Comparação editorial", { title: "Comparação", columns: ["Critério", "Opção"], rows: [] }))}{action("Briefing de imagem", <Image className="h-3 w-3"/>, () => addBlock("image_brief", "Briefing de imagem", { objective: "Definir objetivo", format: "editorial", requiredElements: [], avoid: [] }))}{action("Comentário", <MessageSquare className="h-3 w-3"/>, () => { const body = window.prompt("Comentário sobre o trecho selecionado"); if (body) editor?.chain().focus().setMark("editorialComment", { commentId: crypto.randomUUID(), body }).run(); })}{action("Localizar", <Search className="h-3 w-3"/>, () => { const query = window.prompt("Localizar no documento"); if (query) [...globalThis.document.querySelectorAll(".professional-editor *")].find(element => element.textContent?.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")))?.scrollIntoView({ behavior: "smooth", block: "center" }); })}{action("Melhorar trecho", <Sparkles className="h-3 w-3"/>, onImprove, false)}{action("Limpar formatação", <Eraser className="h-3 w-3"/>, () => editor?.chain().focus().unsetAllMarks().clearNodes().run())}{aiBusy && <span className="px-2 text-[9px] text-context-accent">IA preparando proposta…</span>}</div>;
}

function MetadataPanel({ document, published, onChange }: { document: ContentDocument; published: boolean; onChange: (key: keyof ContentDocument["metadata"], value: string | string[]) => void }) {
  const fields: Array<[keyof ContentDocument["metadata"], string, boolean]> = [["slug","Slug",true],["principalKeyword","Keyword principal",true],["metaTitle","Meta title",false],["metaDescription","Meta description",false],["socialTitle","Título social",false],["socialDescription","Descrição social",false],["canonical","Canonical",true]];
  return <div className="mt-3 space-y-2"><h3 className="text-[9px] font-bold uppercase text-slate-600">Metadados</h3>{fields.map(([key,label,structural]) => <label key={key} className="block text-[8px] text-slate-600">{label}<input value={String(document.metadata[key] || "")} disabled={published && structural} onChange={event => onChange(key,event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-800 bg-black px-2 text-[9px] text-slate-300 disabled:cursor-not-allowed disabled:text-amber-600"/></label>)}<p className="text-[8px] text-slate-600">Indexação interna: noindex. A aplicação pública futura pertence ao destino editorial.</p>{published && <p className="text-[8px] text-amber-400">Slug, principal e canonical protegidos porque o artigo está publicado.</p>}</div>;
}
