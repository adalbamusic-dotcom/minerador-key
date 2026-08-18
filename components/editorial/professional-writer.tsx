/* eslint-disable jsx-a11y/alt-text -- lucide's Image icon is not an HTML img element. */
"use client";

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
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronLeft, ChevronRight, Columns3, Eraser, ExternalLink, FileText, Fullscreen, Heading1, Heading2, Heading3, Heading4, Image, Italic, Link2, List, ListOrdered, MessageSquare, Minus, Pilcrow, Plus, Quote, Search, Sparkles, Strikethrough, Table2, UnderlineIcon, WandSparkles } from "lucide-react";
import { useEditorialPipeline } from "@/components/editorial-pipeline-context";
import { useSupabaseSession } from "@/components/auth/supabase-session-context";
import { useBrand } from "@/components/brand-context";
import { ContentDocumentSchema, type ContentDocument } from "@/lib/arquiteto/contracts";
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

const tool = "inline-flex h-7 min-w-7 items-center justify-center rounded border border-slate-800 bg-[#0b0c10] px-1.5 text-[9px] text-slate-400 hover:border-indigo-700 hover:text-white disabled:opacity-30";
type SaveState = "idle" | "dirty" | "saving" | "saved_server" | "saved_local" | "conflict" | "error";

export function ProfessionalWriter({ initialArticleId = null, initialDocumentId = null }: { initialArticleId?: string | null; initialDocumentId?: string | null }) {
  const pipeline = useEditorialPipeline(); const { selectedBrandId } = useBrand();
  const { actorUserId } = useSupabaseSession();
  const documents = Object.values(pipeline.documents); const preferred = initialDocumentId ? pipeline.documents[initialDocumentId] : documents.find(item => item.articleDnaRef.entityId === initialArticleId);
  const [selectedId, setSelectedId] = useState(preferred?.id || pipeline.moduleState.redator?.selectedId || documents[0]?.id || "");
  const [leftOpen, setLeftOpen] = useState(true); const [rightOpen, setRightOpen] = useState(true); const [fullscreen, setFullscreen] = useState(false); const [importOpen, setImportOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle"); const [pending, setPending] = useState<ContentDocument | null>(null); const [saveMessage, setSaveMessage] = useState("");
  const [guardianReport, setGuardianReport] = useState<GuardianReport | null>(null); const [sectionProposal, setSectionProposal] = useState<RedatorSectionProposal | null>(null); const [improveProposal, setImproveProposal] = useState<RedatorImproveProposal | null>(null); const [aiBusy, setAiBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null); const createVersionRef = useRef(false); const selected = pipeline.documents[selectedId] || preferred || documents[0] || null;
  const publication = selected ? pipeline.operationalPublications.find(item => item.documentId === selected.id) : null; const published = publication?.state === "published";
  const availablePlans = pipeline.plannerItems.filter(item => ["approved", "sent_writer"].includes(item.state)).map(item => { const alreadyImported = item.state === "sent_writer" || documents.some(document => document.articleDnaRef.entityId === item.articleId); return { ...item, alreadyImported }; });
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

  useEffect(() => { if (!selected || !editor || !recoveryKey) return; const timer = window.setTimeout(() => { const raw = window.localStorage.getItem(recoveryKey); if (!raw) return;
      try { const recovered = ContentDocumentSchema.parse(JSON.parse(raw)); editor.commands.setContent(contentDocumentToTiptapSeed(recovered)); pipeline.updateDocumentLocal(recovered); setSaveState("saved_local"); setSaveMessage("Rascunho de recuperação local restaurado."); } catch { /* recuperação inválida é ignorada */ }
    }, 0); return () => window.clearTimeout(timer); }, [editor, selected?.id, recoveryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!selected) return; const timer = window.setTimeout(() => { const state = pipeline.documentUserStates[selected.id]; if (!state) return; setLeftOpen(state.leftPanelOpen); setRightOpen(state.rightPanelOpen); scrollRef.current?.scrollTo({ top: state.scrollTop }); }, 0); return () => window.clearTimeout(timer); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!pending || !actorUserId || !recoveryKey) return; const actorAtStart = actorUserId; const timer = window.setTimeout(async () => { setSaveState("saving"); setSaveMessage("Salvando…"); const hash = await contentHash(pending);
      try { const response = await fetch("/api/editorial/documents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrandId, documentId: pending.id, expectedLockVersion: pipeline.documentLocks[pending.id] || 1, document: pending, contentHash: hash, createVersion: createVersionRef.current, changeReason: createVersionRef.current ? "Marco editorial criado pelo usuário." : "Autosave editorial." }) }); const body = await response.json();
        if (actorUserId !== actorAtStart) return;
        if (response.ok) { pipeline.updateDocumentLocal(pending, body.lockVersion); window.localStorage.removeItem(recoveryKey); setSaveState("saved_server"); setSaveMessage(body.version ? `Versão ${body.version.versionNumber} criada e salva.` : `Salvo no servidor às ${new Date(body.updatedAt).toLocaleTimeString("pt-BR")}.`); createVersionRef.current = false; editCheckpointRef.current = false; setPending(null); return; }
        if (response.status === 409) { setSaveState("conflict"); setSaveMessage("Outra sessão alterou este documento. Recarregue antes de sobrescrever."); return; }
        window.localStorage.setItem(recoveryKey, JSON.stringify(pending)); setSaveState("saved_local"); setSaveMessage(body.code === "persistence_unavailable" ? "Salvo somente como recuperação local; migration ainda não aplicada." : "Servidor indisponível; recuperação local criada.");
      } catch { if (actorUserId !== actorAtStart) return; window.localStorage.setItem(recoveryKey, JSON.stringify(pending)); setSaveState("saved_local"); setSaveMessage("Sem conexão; recuperação local criada."); }
    }, 1200); return () => window.clearTimeout(timer); }, [actorUserId, pending, recoveryKey, selectedBrandId, pipeline]);

  useEffect(() => { if (!selected) return; pipeline.setModuleState("redator", { selectedId: selected.id }); const timer = window.setTimeout(() => { void fetch("/api/editorial/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: selectedBrandId, documentId: selected.id, cursorPosition: editor?.state.selection.from || null, scrollTop: scrollRef.current?.scrollTop || 0, leftPanelOpen: leftOpen, rightPanelOpen: rightOpen }) }); }, 500); return () => window.clearTimeout(timer); }, [selected?.id, leftOpen, rightOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id: string) => { setSelectedId(id); setPending(null); setGuardianReport(null); setSectionProposal(null); setImproveProposal(null); setSaveState("idle"); };
  const requestStatus = (status: "em_revisao" | "aprovado") => { if (!selected) return; if (status === "aprovado" && localGuardian?.blockingCount) { setSaveState("error"); setSaveMessage(`Aprovação bloqueada: ${localGuardian.blockingCount} achado(s) crítico(s) no Guardião.`); return; } history.capture(`Mudar status de ${selected.title} para ${status}`); const updated = ContentDocumentSchema.parse({ ...selected, status }); createVersionRef.current = true; setPending(updated); pipeline.updateDocumentLocal(updated); setSaveState("dirty"); setSaveMessage(status === "em_revisao" ? "Preparando envio para revisão…" : "Preparando versão aprovada…"); };
  const importFromPlanner = async (ids: string[]) => { history.capture(`Importar ${ids.length} artigo(s) do Planejador`); let firstDocumentId = ""; for (const id of ids) { const result = await pipeline.startWriting(id); if (!firstDocumentId) firstDocumentId = result.documentId; } if (firstDocumentId) setSelectedId(firstDocumentId); setImportOpen(false); setSaveMessage(`${ids.length} artigo(s) importado(s) do Planejador.`); };
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
      setSectionProposal(body.proposal as RedatorSectionProposal); setSaveMessage("Proposta pronta para revisão humana; nada foi aplicado.");
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
      setImproveProposal(body.proposal as RedatorImproveProposal); setSaveMessage("Melhoria pronta para revisão humana; nada foi aplicado.");
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
      canUndo: () => Boolean(editor?.can().chain().undo().run()),
      canRedo: () => Boolean(editor?.can().chain().redo().run()),
      undo: () => { editor?.chain().focus().undo().run(); },
      redo: () => { editor?.chain().focus().redo().run(); },
      undoLabel: "Desfazer edição",
      redoLabel: "Refazer edição",
      historyLabel: "Histórico do documento",
      undoTitle: "Desfazer edição no documento",
      redoTitle: "Refazer edição no documento",
      historyTitle: count => `Histórico do documento (${count})`,
      open: () => window.dispatchEvent(new CustomEvent("global-topbar-history", { detail: { module: "redator" } })),
    },
    actions: <div className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto xl:overflow-visible" data-redator-topbar-actions>
      {selected ? <WorkflowStatusBadge status={selected.status} /> : null}
      <span className={`${GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY} max-w-56 shrink-0 truncate ${saveState === "conflict" || saveState === "error" ? "text-danger" : saveState === "saved_server" ? "text-success" : "text-warning"}`} role="status" title={saveMessage || "Pronto"}>{saveMessage || "Pronto"}</span>
      <span className={`${GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY} shrink-0 tabular-nums text-text-muted`} aria-label={`${wordCount} palavras`}>{wordCount} palavras</span>
      <button type="button" onClick={() => setImportOpen(true)} className={`${GLOBAL_TOPBAR_ACTION_CONTROL} text-positive-soft/85`} title="Importar artigos aprovados do Planejador">
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Importar do Planejador</span>
      </button>
      <button type="button" onClick={() => setFullscreen(value => !value)} className={GLOBAL_TOPBAR_ACTION_CONTROL} title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}>
        <Fullscreen className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{fullscreen ? "Sair da tela cheia" : "Tela cheia"}</span>
      </button>
      <Link href="/publicacoes" className={GLOBAL_TOPBAR_ACTION_CONTROL}>Publicações</Link>
    </div>,
  }), [editor, fullscreen, history.entries.length, saveMessage, saveState, selected?.status, wordCount]);
  const globalTopbarControlsRef = useRef<GlobalTopbarModuleControls>(globalTopbarControls);

  useEffect(() => {
    registerControls(globalTopbarControlsRef.current);
    return () => unregisterControls("redator");
  }, [registerControls, unregisterControls]);

  useEffect(() => {
    globalTopbarControlsRef.current = globalTopbarControls;
    updateControls(globalTopbarControls);
  }, [globalTopbarControls, updateControls]);

  return <div className={`${fullscreen ? "fixed inset-x-0 bottom-0 top-10 z-30" : "h-screen"} flex min-h-0 flex-col bg-[#07080b]`}>
    <HistoryControls moduleId="redator" showHistory={false} showUndoRedo={false} visualVariant="semantic" entries={history.entries} canUndo={history.canUndo} canRedo={history.canRedo} onUndo={history.undo} onRedo={history.redo} onRestore={history.restore} compact presentation="popover"/>
    <Toolbar editor={editor} addBlock={addBlock} promptLink={promptLink} onImprove={requestImproveProposal} aiBusy={aiBusy}/>
    <div className={`grid min-h-0 flex-1 ${leftOpen && rightOpen ? "grid-cols-[260px_minmax(0,1fr)_300px]" : leftOpen ? "grid-cols-[260px_minmax(0,1fr)]" : rightOpen ? "grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-1"}`}>
      {leftOpen && <aside className="min-h-0 overflow-auto border-r border-slate-850 bg-[#090a0e] p-3"><div className="flex items-center justify-between"><h2 className="text-[9px] font-bold uppercase text-slate-500">Rascunhos e fundamentos</h2><button className={tool} onClick={() => setLeftOpen(false)}><ChevronLeft className="h-3 w-3"/></button></div><div className="mt-2 space-y-1">{documents.map(item => <button key={item.id} onClick={() => choose(item.id)} className={`block w-full rounded border p-2 text-left text-[9px] ${item.id === selected?.id ? "border-indigo-700 bg-indigo-950/20 text-white" : "border-slate-850 text-slate-500"}`}><strong className="block truncate">{item.title}</strong><span>{item.status}</span></button>)}</div>{!documents.length && <p className="mt-3 text-[10px] text-slate-600">Nenhum rascunho disponível. Aprove um ContentPlan no Planejador.</p>}{selected && <><h3 className="mt-4 text-[9px] font-bold uppercase text-slate-600">Outline</h3>{selected.blocks.filter(block => block.type === "heading").map(block => <div key={block.id} className="mt-1 flex items-center gap-1"><button onClick={() => globalThis.document.querySelector(`[data-block-id="${block.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className="min-w-0 flex-1 truncate text-left text-[9px] text-slate-400">{"level" in block ? `H${block.level}` : ""} {"text" in block ? block.text : ""}</button><button className={tool} disabled={aiBusy} onClick={() => void requestSectionProposal(block.id)} title="Propor escrita para esta seção"><Sparkles className="h-3 w-3"/></button></div>)}<div className="mt-4 space-y-1 text-[9px] text-slate-600"><p>ContentPlan: {selected.contentPlanRef.versionId}</p><p>ArticleDNA: {selected.articleDnaRef.versionId}</p><p>SiloDNA: {selected.siloDnaRef.versionId}</p><p>KeywordDNAs: {selected.keywordDnaRefs.length}</p></div></>}</aside>}
      <main ref={scrollRef} className="min-h-0 overflow-auto bg-[#17181d] p-5">{!leftOpen && <button className={`${tool} fixed left-12 top-24 z-20`} onClick={() => setLeftOpen(true)}><ChevronRight className="h-3 w-3"/></button>}<div className="mx-auto min-h-[calc(100vh-150px)] w-full max-w-[880px] bg-white px-14 py-12 text-slate-900 shadow-2xl">{sectionProposal && <div className="mb-5 rounded border border-indigo-200 bg-indigo-50 p-3 text-xs"><strong>Proposta de seção — revisão humana</strong><p className="mt-1 text-slate-600">{sectionProposal.paragraphs.length} parágrafo(s) aguardando aplicação.</p><div className="mt-2 flex gap-2"><button className="rounded bg-indigo-600 px-2 py-1 text-white" onClick={applySectionProposal}>Aplicar como texto editável</button><button className="rounded border border-slate-300 px-2 py-1" onClick={() => setSectionProposal(null)}>Descartar</button></div></div>}{improveProposal && <div className="mb-5 rounded border border-amber-200 bg-amber-50 p-3 text-xs"><strong>Melhoria de trecho — revisão humana</strong><p className="mt-1 text-slate-600">{improveProposal.replacementText}</p><div className="mt-2 flex gap-2"><button className="rounded bg-amber-600 px-2 py-1 text-white" onClick={applyImproveProposal}>Aplicar melhoria</button><button className="rounded border border-slate-300 px-2 py-1" onClick={() => setImproveProposal(null)}>Descartar</button></div></div>}{selected ? <EditorContent editor={editor} className="professional-editor"/> : <div className="flex min-h-[55vh] items-center justify-center text-center text-sm text-slate-400"><div><FileText className="mx-auto mb-3 h-8 w-8"/><p>Nenhum ContentDocument disponível.</p><Link href="/planejador" className="mt-3 inline-block text-indigo-600 underline">Abrir Planejador</Link></div></div>}</div></main>
      {rightOpen && <aside className="min-h-0 overflow-auto border-l border-slate-850 bg-[#090a0e] p-3"><div className="flex items-center justify-between"><h2 className="text-[9px] font-bold uppercase text-slate-500">Guardião</h2><div className="flex gap-1"><button className={tool} disabled={!selected || aiBusy} onClick={() => void analyseGuardian()} title="Analisar documento"><WandSparkles className="h-3 w-3"/></button><button className={tool} onClick={() => setRightOpen(false)}><ChevronRight className="h-3 w-3"/></button></div></div>{selected && <MetadataPanel document={selected} published={published} onChange={metadata}/>}<div className="mt-3 rounded border border-slate-850 p-2 text-[9px]"><strong className={localGuardian?.blockingCount ? "text-red-400" : "text-emerald-400"}>{guardianReport ? "Análise atual" : "Prévia local"}</strong><p className="mt-1 text-slate-500">{localGuardian?.blockingCount || 0} bloqueio(s) · {localGuardian?.warningCount || 0} aviso(s)</p><p className="mt-1 text-slate-600">A análise não aprova o documento.</p></div><h3 className="mt-4 text-[9px] font-bold uppercase text-slate-600">Achados por seção</h3><div className="mt-2 space-y-2">{displayedFindings.map(finding => <button key={finding.id} onClick={() => globalThis.document.querySelector(`[data-block-id="${finding.sectionId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className="w-full rounded border border-amber-900/40 p-2 text-left text-[9px]"><strong className="text-amber-400">{finding.category} · {finding.severity}</strong><p>{finding.message}</p><p className="text-slate-500">{finding.suggestion}</p></button>)}{!displayedFindings.length && <p className="text-[9px] text-slate-600">Nenhum achado no momento.</p>}</div></aside>}
      {!rightOpen && <button className={`${tool} fixed right-2 top-24 z-20`} onClick={() => setRightOpen(true)}><ChevronLeft className="h-3 w-3"/></button>}
    </div>
    {selected && <footer className="flex shrink-0 items-center justify-between gap-3 overflow-x-auto border-t border-indigo-900/60 bg-[#0b0c10] px-3 py-2"><div className="flex shrink-0 items-center gap-2"><WorkflowStatusBadge status={selected.status}/><span className="text-[9px] text-slate-500">KeywordDNAs: {selected.keywordDnaRefs.length} · ArticleDNA {selected.articleDnaRef.versionId} · SiloDNA {selected.siloDnaRef.versionId}</span></div><div className="flex shrink-0 items-center gap-2"><button className={tool} disabled={selected.status === "aprovado"} onClick={() => requestStatus("em_revisao")}>Enviar para aprovação</button><button className={tool} disabled={selected.status !== "em_revisao"} onClick={() => requestStatus("aprovado")}>Aprovar para Publicações</button></div></footer>}
    <WorkflowImportDialog open={importOpen} title="Importar artigos aprovados do Planejador" description="Todos os ContentPlans aprovados aparecem aqui. Os já importados continuam visíveis e identificados." rows={availablePlans} label={item => item.title} details={item => <span className="mt-1 block text-slate-500">/{item.slug} · {item.intent}</span>} disabled={item => item.alreadyImported} status={item => item.alreadyImported ? "sent_writer" : "approved"} onClose={() => setImportOpen(false)} onImport={importFromPlanner}/>
  </div>;
}

function Toolbar({ editor, addBlock, promptLink, onImprove, aiBusy }: { editor: Editor | null; addBlock: (kind: string, label: string, data: object) => void; promptLink: () => void; onImprove: () => void; aiBusy: boolean }) {
  const action = (label: string, icon: React.ReactNode, run: () => void, active = false) => <button key={label} className={`${tool} ${active ? "border-indigo-500 bg-indigo-950/40 text-white" : ""}`} onClick={run} disabled={!editor} title={label}>{icon}</button>;
  return <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-850 bg-[#0a0b0f] p-1.5">{[1,2,3,4].map(level => action(`H${level}`, level === 1 ? <Heading1 className="h-3 w-3"/> : level === 2 ? <Heading2 className="h-3 w-3"/> : level === 3 ? <Heading3 className="h-3 w-3"/> : <Heading4 className="h-3 w-3"/>, () => editor?.chain().focus().toggleHeading({ level: level as 1|2|3|4 }).run(), Boolean(editor?.isActive("heading", { level }))))}{action("Parágrafo", <Pilcrow className="h-3 w-3"/>, () => editor?.chain().focus().setParagraph().run(), Boolean(editor?.isActive("paragraph")))}{action("Negrito", <Bold className="h-3 w-3"/>, () => editor?.chain().focus().toggleBold().run(), Boolean(editor?.isActive("bold")))}{action("Itálico", <Italic className="h-3 w-3"/>, () => editor?.chain().focus().toggleItalic().run(), Boolean(editor?.isActive("italic")))}{action("Sublinhado", <UnderlineIcon className="h-3 w-3"/>, () => editor?.chain().focus().toggleUnderline().run(), Boolean(editor?.isActive("underline")))}{action("Tachado", <Strikethrough className="h-3 w-3"/>, () => editor?.chain().focus().toggleStrike().run(), Boolean(editor?.isActive("strike")))}{action("Lista", <List className="h-3 w-3"/>, () => editor?.chain().focus().toggleBulletList().run())}{action("Lista numerada", <ListOrdered className="h-3 w-3"/>, () => editor?.chain().focus().toggleOrderedList().run())}{action("Citação", <Quote className="h-3 w-3"/>, () => editor?.chain().focus().toggleBlockquote().run())}{action("Tabela", <Table2 className="h-3 w-3"/>, () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}{action("Link", <Link2 className="h-3 w-3"/>, promptLink)}{action("Alinhar à esquerda", <AlignLeft className="h-3 w-3"/>, () => editor?.chain().focus().setTextAlign("left").run())}{action("Centralizar", <AlignCenter className="h-3 w-3"/>, () => editor?.chain().focus().setTextAlign("center").run())}{action("Alinhar à direita", <AlignRight className="h-3 w-3"/>, () => editor?.chain().focus().setTextAlign("right").run())}<span className="mx-1 h-5 border-l border-slate-800"/>{action("Link interno", <Columns3 className="h-3 w-3"/>, () => { const target = window.prompt("ID do artigo de destino"); const anchor = window.prompt("Âncora sugerida"); if (target && anchor) addBlock("internal_link", `Link interno: ${anchor}`, { targetArticleId: target, anchor }); })}{action("Fonte externa", <ExternalLink className="h-3 w-3"/>, () => { const claim = window.prompt("Afirmação que precisa de fonte"); const url = window.prompt("URL validada (opcional)", ""); if (claim) addBlock("external_source", `Fonte externa: ${claim}`, { sourceId: crypto.randomUUID(), claim, url: url || null }); })}{action("CTA", <Minus className="h-3 w-3"/>, () => { const text = window.prompt("Texto do CTA"); if (text) addBlock("CTA", `CTA: ${text}`, { text, objective: "Definir objetivo" }); })}{action("Produto", <FileText className="h-3 w-3"/>, () => addBlock("product_block", "Bloco de produto pendente", { productEvidenceId: "pending", title: "Produto", summary: "Evidência pendente" }))}{action("Comparação", <Table2 className="h-3 w-3"/>, () => addBlock("comparison", "Comparação editorial", { title: "Comparação", columns: ["Critério", "Opção"], rows: [] }))}{action("Briefing de imagem", <Image className="h-3 w-3"/>, () => addBlock("image_brief", "Briefing de imagem", { objective: "Definir objetivo", format: "editorial", requiredElements: [], avoid: [] }))}{action("Comentário", <MessageSquare className="h-3 w-3"/>, () => { const body = window.prompt("Comentário sobre o trecho selecionado"); if (body) editor?.chain().focus().setMark("editorialComment", { commentId: crypto.randomUUID(), body }).run(); })}{action("Localizar", <Search className="h-3 w-3"/>, () => { const query = window.prompt("Localizar no documento"); if (query) [...globalThis.document.querySelectorAll(".professional-editor *")].find(element => element.textContent?.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")))?.scrollIntoView({ behavior: "smooth", block: "center" }); })}{action("Melhorar trecho", <Sparkles className="h-3 w-3"/>, onImprove, false)}{action("Limpar formatação", <Eraser className="h-3 w-3"/>, () => editor?.chain().focus().unsetAllMarks().clearNodes().run())}{aiBusy && <span className="px-2 text-[9px] text-indigo-300">IA preparando proposta…</span>}</div>;
}

function MetadataPanel({ document, published, onChange }: { document: ContentDocument; published: boolean; onChange: (key: keyof ContentDocument["metadata"], value: string | string[]) => void }) {
  const fields: Array<[keyof ContentDocument["metadata"], string, boolean]> = [["slug","Slug",true],["principalKeyword","Keyword principal",true],["metaTitle","Meta title",false],["metaDescription","Meta description",false],["socialTitle","Título social",false],["socialDescription","Descrição social",false],["canonical","Canonical",true]];
  return <div className="mt-3 space-y-2"><h3 className="text-[9px] font-bold uppercase text-slate-600">Metadados</h3>{fields.map(([key,label,structural]) => <label key={key} className="block text-[8px] text-slate-600">{label}<input value={String(document.metadata[key] || "")} disabled={published && structural} onChange={event => onChange(key,event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-800 bg-black px-2 text-[9px] text-slate-300 disabled:cursor-not-allowed disabled:text-amber-600"/></label>)}<p className="text-[8px] text-slate-600">Indexação interna: noindex. A aplicação pública futura pertence ao destino editorial.</p>{published && <p className="text-[8px] text-amber-400">Slug, principal e canonical protegidos porque o artigo está publicado.</p>}</div>;
}
