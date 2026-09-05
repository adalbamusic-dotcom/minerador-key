"use client";

import { useState } from "react";
import type { RadarR3Model } from "@/lib/radar/r3-workbench";
import { radarR6TopicOriginLabel } from "@/lib/radar/r6-sequential";
import type { RadarR6ExpertEvidenceInput, RadarR6ExpertTopicContext } from "@/lib/radar/r6-sequential";
import type { RadarExpertEvidence } from "@/lib/radar/analysis-contracts";
import type { RadarR4ExistingContentKind, RadarR4ExistingContentState } from "@/lib/radar/r4-queue";
import { ExpertContributionPanel } from "./expert-contribution-panel";
import { RadarExpertBriefPanel } from "./radar-expert-brief-panel";

type RadarR3SpecialistPanelProps = {
  model: RadarR3Model;
  onTopicChange?: (articleId: string, topicId: string, text: string) => void;
  onTopicRemove?: (articleId: string, topicId: string) => void;
  onTopicMove?: (articleId: string, topicId: string, direction: -1 | 1) => void;
  onTopicAdd?: (articleId: string, text: string) => void;
  onTopicReview?: (articleId: string, topicId: string) => void;
  onTopicUndo?: (articleId: string) => void;
  onTopicRedo?: (articleId: string) => void;
  canUndoTopics?: boolean;
  canRedoTopics?: boolean;
  onTopicAdjacent?: (direction: "previous" | "next") => void;
  topicQueuePosition?: number;
  topicQueueTotal?: number;
  onExistingContentAdd?: (articleId: string, input: { kind: RadarR4ExistingContentKind; label: string; reference: string; state: RadarR4ExistingContentState }) => void;
  onExistingContentStateChange?: (articleId: string, contentId: string, state: RadarR4ExistingContentState) => void;
  /** Fixture médica só pode ser aberta por testes explícitos; nunca é renderizada no artigo real. */
  showLocalFixture?: boolean;
  expertContext?: RadarR6ExpertTopicContext | null;
  onExpertEvidenceChange?: (articleId: string, evidence: RadarR6ExpertEvidenceInput[], summary: { contributionCount: number; pendingCount: number; remote: true; canonicalEvidence: RadarExpertEvidence[]; blockedEvidenceCount: number }) => void;
};

const inset = "rounded-md border border-divider bg-surface-subtle p-3";
const button = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:text-text-muted";
const contentKinds: Array<{ value: RadarR4ExistingContentKind; label: string }> = [
  { value: "YOUTUBE", label: "YouTube" },
  { value: "PODCAST", label: "Podcast" },
  { value: "VIDEO", label: "Vídeo" },
  { value: "AUDIO", label: "Áudio" },
  { value: "DOCUMENT", label: "Documento" },
];

function existingContentStateLabel(state: RadarR4ExistingContentState) {
  return ({ LINK_REGISTERED: "Link registrado", AWAITING_FILE: "Arquivo aguardando", IGNORED_FOR_ARTICLE: "Ignorado para este artigo" } as Record<RadarR4ExistingContentState, string>)[state];
}

export function RadarR3SpecialistPanel({ model, onTopicChange, onTopicRemove, onTopicMove, onTopicAdd, onTopicReview, onTopicUndo, onTopicRedo, canUndoTopics = false, canRedoTopics = false, onTopicAdjacent, topicQueuePosition, topicQueueTotal, onExistingContentAdd, onExistingContentStateChange, showLocalFixture = false, expertContext = null, onExpertEvidenceChange }: RadarR3SpecialistPanelProps) {
  const article = model.article;
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingTopicText, setEditingTopicText] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [contentKind, setContentKind] = useState<RadarR4ExistingContentKind>("YOUTUBE");
  const [contentLabel, setContentLabel] = useState("");
  const [contentReference, setContentReference] = useState("");
  const localContent = model.r4?.existingContent || [];
  const topics = model.r4?.topics;
  const topicStateLabel = topics?.state === "TOPICS_READY_FOR_REVIEW" ? `Proposta da IA · ${topics.reviewedIds.length}/${topics.items.length} revisada(s)` : topics?.state === "TOPICS_APPROVED" || topics?.state === "READY_TO_SEND" ? "Aprovada para envio · infraestrutura pendente" : topics?.state || "Nenhuma pauta preparada";
  return <section className="space-y-4" aria-label="Área Especialista do Radar">
    {model.r4?.specialist === "READY_TO_SEND" && <div className="rounded-md border border-warning/50 bg-warning-soft/20 p-3 text-sm text-foreground"><p className="font-semibold">Infraestrutura de contribuição aguardando fundação remota</p><p className="mt-1 text-text-muted">A pauta continua aprovada localmente e não foi enviada automaticamente.</p></div>}
    <RadarExpertBriefPanel key={`${model.articleId}:${model.articleDnaVersionId}`} brandId={model.brandId} articleId={model.articleId} articleDnaVersionId={model.articleDnaVersionId} articleTitle={model.title} articleVersion={model.articleDnaVersion} articleRole={model.hierarchy} context={expertContext} suggestedQuestions={model.r4?.topics.items || []} onExpertEvidenceChange={onExpertEvidenceChange} />
    {topics && topics.state !== "NOT_PREPARED" && <section className={inset} aria-label="Fila local de revisão de pautas">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold text-foreground">Pautas do especialista</h3><p className="mt-1 text-sm text-text-muted">{topicStateLabel}. Proposto pela IA ≠ aprovado para envio.</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-divider px-3 py-1 text-sm text-text-muted">{topicStateLabel}</span>{(canUndoTopics || canRedoTopics) && <><button type="button" className={button} onClick={() => onTopicUndo?.(model.articleId)} disabled={!canUndoTopics}>Desfazer</button><button type="button" className={button} onClick={() => onTopicRedo?.(model.articleId)} disabled={!canRedoTopics}>Refazer</button></>}</div></div>
      {topicQueueTotal && topicQueuePosition ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-divider bg-surface px-3 py-2 text-sm text-text-muted"><strong className="text-foreground">Pauta {topicQueuePosition} de {topicQueueTotal}</strong><button type="button" className={button} onClick={() => onTopicAdjacent?.("previous")} disabled={!onTopicAdjacent || topicQueuePosition <= 1}>Anterior</button><button type="button" className={button} onClick={() => onTopicAdjacent?.("next")} disabled={!onTopicAdjacent || topicQueuePosition >= topicQueueTotal}>Próxima pendente</button></div> : null}
      {topics.context && <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-sm text-text-muted">ArticleDNA</dt><dd className="mt-1 text-sm text-foreground">{topics.context.articleDna.principal}</dd></div><div><dt className="text-sm text-text-muted">Necessidades SERP</dt><dd className="mt-1 text-sm text-foreground">{topics.context.serpNeeds.length}</dd></div><div><dt className="text-sm text-text-muted">Critérios Amazon</dt><dd className="mt-1 text-sm text-foreground">{topics.context.amazonCriteria.length || "Não aplicável"}</dd></div><div><dt className="text-sm text-text-muted">Material existente</dt><dd className="mt-1 text-sm text-foreground">{topics.context.existingContent}</dd></div></dl>}
      <ol className="mt-4 space-y-2" aria-label="Tópicos preparados para revisão">{topics.items.map((topic, index) => {
        const reviewed = topics.reviewedIds.includes(topic.id);
        const provenance = topic.provenance;
        return <li key={topic.id} className="rounded-md border border-divider bg-surface-subtle p-3">{editingTopicId === topic.id ? <div className="space-y-3"><label className="block text-sm text-foreground">Editar pauta<textarea value={editingTopicText} onChange={event => setEditingTopicText(event.target.value)} rows={3} className="mt-2 min-h-20 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus" /></label><div className="flex flex-wrap gap-2"><button type="button" className={`${button} border-context-accent bg-selected`} onClick={() => { onTopicChange?.(model.articleId, topic.id, editingTopicText); setEditingTopicId(null); }}>Salvar pauta</button><button type="button" className={button} onClick={() => setEditingTopicId(null)}>Cancelar</button></div></div> : <><div className="flex flex-wrap items-start justify-between gap-3"><p className="text-sm font-medium text-foreground"><span className="mr-2 text-context-accent">{index + 1}.</span>{topic.text}</p><span className="shrink-0 text-sm text-text-muted">{reviewed ? "Revisada" : "Proposta da IA"}</span></div><p className="mt-2 text-sm text-text-muted">Origem: {radarR6TopicOriginLabel(provenance?.origins, topic.sourceType)}</p>{(provenance?.reference || topic.reference) && <p className="mt-2 text-sm text-text-muted">Referência: {provenance?.reference || topic.reference}</p>}{topic.need && <p className="mt-2 text-sm text-text-muted">Necessidade: {topic.need}</p>}{topic.justification && <p className="mt-2 text-sm text-text-muted">Motivo: {topic.justification}</p>}{provenance?.complementaryExistingContent && <p className="mt-2 text-sm text-text-muted">Origem complementar: {provenance.complementaryExistingContent}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} onClick={() => { setEditingTopicId(topic.id); setEditingTopicText(topic.text); }}>Editar</button><button type="button" className={button} disabled={index === 0} onClick={() => onTopicMove?.(model.articleId, topic.id, -1)}>Subir</button><button type="button" className={button} disabled={index === topics.items.length - 1} onClick={() => onTopicMove?.(model.articleId, topic.id, 1)}>Descer</button><button type="button" className={button} onClick={() => onTopicRemove?.(model.articleId, topic.id)}>Remover</button><button type="button" className={button} onClick={() => onTopicReview?.(model.articleId, topic.id)} disabled={!onTopicReview || reviewed}>{reviewed ? "Pauta revisada" : "Marcar como revisada"}</button></div></>}</li>;
      })}</ol>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor={`radar-r4-topic-${model.articleId}`}>Adicionar pauta</label><input id={`radar-r4-topic-${model.articleId}`} value={newTopic} onChange={event => setNewTopic(event.target.value)} className="min-h-10 flex-1 rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus" placeholder="Adicionar pauta" /><button type="button" className={button} disabled={!newTopic.trim() || !onTopicAdd} onClick={() => { onTopicAdd?.(model.articleId, newTopic); setNewTopic(""); }}>Adicionar pauta</button></div>
    </section>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className={inset}><p className="text-xs text-text-muted">Especialista</p><p className="mt-1 text-sm font-semibold text-foreground">{model.specialist.expert}</p><p className="mt-1 text-xs text-text-muted">{model.specialist.status}</p></div>
      <div className={inset}><p className="text-xs text-text-muted">Canal</p><p className="mt-1 text-sm font-semibold text-foreground">{model.specialist.channel}</p></div>
      <div className={inset}><p className="text-xs text-text-muted">Pedidos enviados</p><p className="mt-1 text-sm font-semibold text-foreground">{model.specialist.requestsSent}</p></div>
      <div className={inset}><p className="text-xs text-text-muted">Contribuições recebidas</p><p className="mt-1 text-sm font-semibold text-foreground">{model.specialist.contributionsReceived}</p></div>
      <div className={inset}><p className="text-xs text-text-muted">Evidências revisadas</p><p className="mt-1 text-sm font-semibold text-foreground">{model.specialist.reviewedEvidence} · {model.specialist.pending} pendente(s)</p></div>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      <section className={inset}><h3 className="text-sm font-semibold text-foreground">Especialista</h3><p className="mt-2 text-sm text-text-muted">{model.specialist.expert} · {model.specialist.specialty}</p><p className="mt-2 text-sm text-text-muted">A vinculação futura preserva brandId, expertId e TelegramExpertBinding explícitos.</p></section>
      <section className={inset}><h3 className="text-sm font-semibold text-foreground">Conteúdo existente</h3><p className="mt-2 text-sm text-text-muted">{model.specialist.existingContent}.</p><p className="mt-2 text-sm text-text-muted">Registre YouTube, podcast, vídeo, áudio ou documento como entrada local; nenhum download acontece aqui.</p>{localContent.length > 0 && <div className="mt-3 space-y-2">{localContent.map(item => <div key={item.id} className="rounded-md border border-divider bg-surface px-3 py-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-foreground">{item.label}</span><select aria-label={`Estado de ${item.label}`} value={item.state} onChange={event => onExistingContentStateChange?.(model.articleId, item.id, event.target.value as RadarR4ExistingContentState)} className="rounded-md border border-divider bg-surface-elevated px-2 py-1 text-sm text-foreground">{(["LINK_REGISTERED", "AWAITING_FILE", "IGNORED_FOR_ARTICLE"] as RadarR4ExistingContentState[]).map(state => <option key={state} value={state}>{existingContentStateLabel(state)}</option>)}</select></div><p className="mt-1 break-all text-sm text-text-muted">{item.reference} · {item.kind}</p></div>)}</div>}
        <div className="mt-3 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]"><label className="sr-only" htmlFor={`radar-existing-kind-${model.articleId}`}>Tipo de conteúdo existente</label><select id={`radar-existing-kind-${model.articleId}`} value={contentKind} onChange={event => setContentKind(event.target.value as RadarR4ExistingContentKind)} className="min-h-10 rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground">{contentKinds.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select><input aria-label="Rótulo ou referência do conteúdo existente" value={contentReference} onChange={event => { setContentReference(event.target.value); if (!contentLabel) setContentLabel(event.target.value); }} className="min-h-10 rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground" placeholder="URL ou referência local" /></div><div className="mt-2 flex flex-wrap gap-2"><input aria-label="Nome do conteúdo existente" value={contentLabel} onChange={event => setContentLabel(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm text-foreground" placeholder="Nome do material" /><button type="button" className={button} disabled={!contentLabel.trim() || !contentReference.trim() || !onExistingContentAdd} onClick={() => { onExistingContentAdd?.(model.articleId, { kind: contentKind, label: contentLabel, reference: contentReference, state: contentKind === "DOCUMENT" || contentKind === "AUDIO" ? "AWAITING_FILE" : "LINK_REGISTERED" }); setContentLabel(""); setContentReference(""); }}>Registrar conteúdo</button></div>
      </section>
      <section className={inset}><h3 className="text-sm font-semibold text-foreground">Pedidos</h3><p className="mt-2 text-sm text-text-muted">{model.specialist.requestsSent} pedido(s) enviado(s). Necessidade Radar atual: {model.report.needs || "a definir após análise"}.</p></section>
      <section className={inset}><h3 className="text-sm font-semibold text-foreground">Contribuições</h3><p className="mt-2 text-sm text-text-muted">{model.specialist.contributionsReceived} contribuição(ões) verificadas. Áudio, texto, documentos e transcrição entram somente após vínculo e armazenamento canônicos.</p></section>
      <section className={`${inset} md:col-span-2`}><h3 className="text-sm font-semibold text-foreground">Revisão</h3><p className="mt-2 text-sm text-text-muted">{model.specialist.reviewedEvidence} evidência(s) revisada(s) · {model.specialist.pending} pendência(s). A confirmação humana do especialista permanece distinta da aprovação editorial.</p></section>
    </div>
    {showLocalFixture ? <details className="rounded-md border border-divider bg-surface p-4"><summary className="cursor-pointer text-sm font-semibold text-foreground">Abrir fixture local da contribuição</summary><p className="mt-3 text-sm text-text-muted">Fixture demonstrativa para validar a organização da contribuição. Não representa Telegram real conectado nem cria ExpertEvidence remoto.</p>{article ? <div className="mt-4"><ExpertContributionPanel article={{ title: model.title, principal: model.keyword || null, intent: article.payload.mainIntent, silo: model.silo || null, publication: model.publication, serpStatus: model.serp.status, versionNumber: article.versionNumber }} radarNeed={model.report.summary} serpAnalyzed={Boolean(model.serp.analysis)}/></div> : <p className="mt-3 text-sm text-warning">ArticleDNA indisponível; a fixture não foi aberta.</p>}</details> : <p className="rounded-md border border-divider bg-surface-subtle p-3 text-sm text-text-muted">Fixture local disponível apenas em modo de teste explícito. Não representa Telegram real conectado.</p>}
  </section>;
}
