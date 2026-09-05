"use client";

import { useMemo, useState } from "react";
import {
  EXPERT_CONTRIBUTION_FIXTURE,
  EXPERT_CONTRIBUTION_STATUS_LABEL,
  EXPERT_CONTRIBUTION_STATUS_ORDER,
  EXISTING_CONTENT_STATUS_LABEL,
  EXISTING_CONTENT_STATUS_ORDER,
  countSelectedExpertEvidence,
  moveExpertQuestion,
  resetExpertQuestions,
  type ExpertContributionStatus,
  type ExpertEvidenceDecision,
  type ExpertQuestion,
  type ExistingContentStatus,
} from "./expert-contribution-fixture";

type ExpertContributionPanelProps = {
  article: {
    title: string;
    principal: string | null;
    intent: string;
    silo: string | null;
    publication: string;
    serpStatus: string;
    versionNumber: number;
  };
  radarNeed: string;
  serpAnalyzed: boolean;
};

const button = "inline-flex min-h-10 items-center justify-center rounded-lg border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = `${button} border-context-accent bg-selected`;
const section = "rounded-xl border border-divider bg-surface p-5";
const inset = "rounded-lg border border-divider bg-surface-subtle p-4";

const decisionLabels: Record<ExpertEvidenceDecision, string> = {
  pending: "Aguardando decisão",
  main: "Evidência principal",
  support: "Evidência de apoio",
  quote: "Usar como citação",
  exclude: "Não utilizar",
};

const kindLabels: Record<string, string> = { audio: "Áudio", text: "Texto", pdf: "PDF", docx: "DOCX" };

function statusIndex(status: ExpertContributionStatus) {
  return EXPERT_CONTRIBUTION_STATUS_ORDER.indexOf(status);
}

function statusTone(status: ExpertContributionStatus, current: ExpertContributionStatus) {
  if (status === current) return "border-context-accent bg-selected text-foreground";
  if (statusIndex(status) < statusIndex(current)) return "border-success/60 bg-success-soft text-foreground";
  return "border-divider text-text-muted";
}

export function ExpertContributionPanel({ article, radarNeed, serpAnalyzed }: ExpertContributionPanelProps) {
  const fixture = EXPERT_CONTRIBUTION_FIXTURE;
  const [status, setStatus] = useState<ExpertContributionStatus>("questions_preparation");
  const [questions, setQuestions] = useState<ExpertQuestion[]>(() => resetExpertQuestions());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [decisions, setDecisions] = useState<Record<string, ExpertEvidenceDecision>>(() => Object.fromEntries(fixture.evidence.map(evidence => [evidence.id, evidence.decision])));
  const [confirmation, setConfirmation] = useState<"not_requested" | "awaiting" | "confirmed" | "correction_requested">("not_requested");
  const [followupPrepared, setFollowupPrepared] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [notice, setNotice] = useState("");
  const [existingContentStatus, setExistingContentStatus] = useState<ExistingContentStatus>("registered");

  const selectedEvidenceCount = useMemo(() => countSelectedExpertEvidence(decisions), [decisions]);
  const hasReceivedMaterials = statusIndex(status) >= statusIndex("contribution_received");
  const coveredNeeds = serpAnalyzed ? selectedEvidenceCount : 0;
  const totalNeeds = serpAnalyzed ? fixture.evidence.length : 0;
  const remainingNeeds = serpAnalyzed ? Math.max(0, totalNeeds - coveredNeeds) : 0;

  const cycleExistingContent = () => {
    const currentIndex = EXISTING_CONTENT_STATUS_ORDER.indexOf(existingContentStatus);
    const next = EXISTING_CONTENT_STATUS_ORDER[Math.min(currentIndex + 1, EXISTING_CONTENT_STATUS_ORDER.length - 1)];
    setExistingContentStatus(next);
    setNotice(`Estado local do conteúdo existente: ${EXISTING_CONTENT_STATUS_LABEL[next]}.`);
  };

  const beginEdit = (question: ExpertQuestion) => {
    setEditingId(question.id);
    setEditingText(question.text);
    setNotice("");
  };

  const saveEdit = () => {
    const value = editingText.trim();
    if (!editingId || !value) return;
    setQuestions(current => current.map(question => question.id === editingId ? { ...question, text: value } : question));
    setEditingId(null);
    setEditingText("");
    setNotice("Pergunta alterada apenas nesta sessão.");
  };

  const addQuestion = () => {
    const value = newQuestion.trim();
    if (!value) return;
    setQuestions(current => [...current, { id: `expert-question-local-${current.length + 1}`, text: value, origin: "Adicionada pelo usuário interno" }]);
    setNewQuestion("");
    setNotice("Pergunta adicionada apenas nesta sessão.");
  };

  const removeQuestion = (questionId: string) => {
    setQuestions(current => current.filter(question => question.id !== questionId));
    if (editingId === questionId) setEditingId(null);
    setNotice("Pergunta removida apenas desta preparação local.");
  };

  const approveTopics = () => {
    if (!questions.length) return;
    setStatus("ready_to_send");
    setNotice("Tópicos aprovados pelo usuário interno. O envio ainda é simulado.");
  };

  const sendToExpert = () => {
    if (status !== "ready_to_send") return;
    setStatus("awaiting_expert");
    setNotice("Envio simulado. Nenhuma mensagem externa foi enviada.");
  };

  const simulateReceived = () => {
    if (status !== "awaiting_expert") return;
    setStatus("contribution_received");
    setNotice("Contribuições de fixture recebidas. Nenhum arquivo externo foi processado.");
  };

  const finalizeContribution = () => {
    if (!hasReceivedMaterials) return;
    setStatus("awaiting_review");
    setNotice("Contribuição finalizada localmente e encaminhada para revisão humana.");
  };

  const markReviewed = () => {
    if (status !== "awaiting_review") return;
    setStatus("reviewed");
    setNotice("Contribuição marcada como revisada. Isso não aprova publicação nem altera o workflow global.");
  };

  const discardContribution = () => {
    setStatus("questions_preparation");
    setQuestions(resetExpertQuestions());
    setDecisions(Object.fromEntries(fixture.evidence.map(evidence => [evidence.id, evidence.decision])));
    setConfirmation("not_requested");
    setFollowupPrepared(false);
    setEditingId(null);
    setDiscardPrompt(false);
    setNotice("A contribuição local foi descartada e a fixture foi restaurada.");
  };

  return (
    <section className="space-y-5" aria-labelledby="expert-contribution-title">
      <div className={section} id="expert-overview">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wide text-module-accent">Evidência adicional</p>
            <h2 id="expert-contribution-title" className="mt-1 text-xl font-semibold text-foreground">Contribuição do especialista</h2>
            <p className="mt-2 max-w-3xl text-base leading-6 text-text-muted">Fonte adicional de evidência para responder às necessidades identificadas pelo Radar. A fala original, a transcrição e a organização editorial permanecem separadas.</p>
          </div>
          <span className="rounded-full border border-context-accent px-3 py-2 text-sm text-context-accent">{EXPERT_CONTRIBUTION_STATUS_LABEL[status]}</span>
        </div>
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Seções das evidências adicionais"><a className={button} href="#expert-overview">Visão geral</a><a className={button} href="#expert-existing-content">Conteúdo existente</a><a className={button} href="#expert-requests">Solicitações</a><a className={button} href="#expert-contributions">Contribuições</a><a className={button} href="#expert-review">Revisão</a></nav>
        <p className="mt-3 rounded-lg border border-pending bg-pending-soft p-3 text-sm text-foreground">Fixture local para validação da experiência. Telegram global, binding e persistência remota de contribuições continuam bloqueados até o Planner Geral liberar a fundação estrutural.</p>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <div className={inset}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{fixture.expert.name}</h3>
                <p className="mt-1 text-base text-text-muted">{fixture.expert.specialty}</p>
              </div>
              <span className="rounded-full border border-success px-3 py-1 text-sm text-success">{fixture.expert.channel} · Conectado</span>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div><dt className="text-sm text-text-muted">Pauta</dt><dd className="mt-1 text-base text-foreground">{article.title}</dd></div>
              <div><dt className="text-sm text-text-muted">Principal</dt><dd className="mt-1 text-base text-foreground">{article.principal || "Não recebida"}</dd></div>
              <div><dt className="text-sm text-text-muted">Intenção</dt><dd className="mt-1 text-base text-foreground">{article.intent || "Não recebida"}</dd></div>
              <div><dt className="text-sm text-text-muted">Silo</dt><dd className="mt-1 text-base text-foreground">{article.silo || "Não relacionado"}</dd></div>
            </dl>
          </div>
          <div className={inset}>
            <h3 className="text-lg font-semibold text-foreground">Contexto disponível</h3>
            <ul className="mt-3 space-y-2 text-base text-text-muted">
              {[
                `ArticleDNA · v${article.versionNumber}`,
                "Keywords recebidas no artigo",
                `Silo · ${article.silo || "não relacionado"}`,
                `Situação · ${article.publication}`,
                `Relatório SERP · ${article.serpStatus}`,
              ].map(item => <li key={item} className="border-b border-divider pb-2 last:border-0 last:pb-0">{item}</li>)}
            </ul>
          </div>
        </div>

        <ol className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Etapas locais da contribuição">
          {EXPERT_CONTRIBUTION_STATUS_ORDER.map((item, index) => <li key={item} className={`rounded-lg border p-3 ${statusTone(item, status)}`}>
            <span className="text-sm">{index + 1}. </span><span className="text-sm font-medium">{EXPERT_CONTRIBUTION_STATUS_LABEL[item]}</span>
          </li>)}
        </ol>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={section} aria-label="Cobertura das necessidades SERP">
          <div><h3 className="text-lg font-semibold text-foreground">Cobertura</h3><p className="mt-1 text-base text-text-muted">A evidência adicional complementa a análise SERP; não substitui a amostra.</p></div>
          {!serpAnalyzed ? <p className="mt-4 rounded-lg border border-pending bg-pending-soft p-4 text-base text-foreground">Necessidades SERP · Aguardando análise</p> : <dl className="mt-4 grid gap-3 sm:grid-cols-3"><div className={inset}><dt className="text-sm text-text-muted">Necessidades SERP</dt><dd className="mt-1 text-2xl font-semibold text-foreground">{totalNeeds}</dd></div><div className={inset}><dt className="text-sm text-text-muted">Cobertas por material</dt><dd className="mt-1 text-2xl font-semibold text-foreground">{coveredNeeds}</dd></div><div className={inset}><dt className="text-sm text-text-muted">Ainda precisam de resposta</dt><dd className="mt-1 text-2xl font-semibold text-foreground">{remainingNeeds}</dd></div></dl>}
        </section>
        <section className={section} id="expert-existing-content" aria-label="Conteúdo existente">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-foreground">Conteúdo já produzido</h3><p className="mt-1 text-base text-text-muted">Registro local de palestra, podcast ou vídeo. Não há download, YouTube ou processamento externo nesta etapa.</p></div><span className="rounded-full border border-divider px-3 py-1 text-sm text-text-muted">{EXISTING_CONTENT_STATUS_LABEL[existingContentStatus]}</span></div>
          <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" className={button} onClick={() => { setExistingContentStatus("registered"); setNotice("Material local registrado para este artigo."); }}>Adicionar material</button><button type="button" className={button} onClick={cycleExistingContent} disabled={existingContentStatus === "ignored_for_article"}>Avançar estado local</button><label className="text-sm text-text-muted">Estado<select className="ml-2 min-h-10 rounded-lg border border-divider bg-surface-elevated px-2 text-sm text-foreground" value={existingContentStatus} onChange={event => setExistingContentStatus(event.target.value as ExistingContentStatus)}>{EXISTING_CONTENT_STATUS_ORDER.map(item => <option key={item} value={item}>{EXISTING_CONTENT_STATUS_LABEL[item]}</option>)}</select></label></div>
          <p className="mt-3 text-sm text-text-muted">Uma fonte existente só entra na organização editorial após ser recebida e revisada.</p>
        </section>
      </div>

      {serpAnalyzed ? <div className={section} id="expert-requests">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-lg font-semibold text-foreground">Tópicos para o especialista</h3><p className="mt-1 text-base text-text-muted">Perguntas preparadas a partir das lacunas da amostra. Edite, adicione, remova ou reordene antes de aprovar.</p></div>
          <span className="text-base text-text-muted">{questions.length} pergunta(s)</span>
        </div>
        <div className="mt-4 space-y-3">
          {questions.map((question, index) => <div key={question.id} className={inset}>
            {editingId === question.id ? <div className="space-y-3">
              <label className="block text-base text-foreground">Editar pergunta<textarea value={editingText} onChange={event => setEditingText(event.target.value)} rows={3} className="mt-2 min-h-20 w-full rounded-lg border border-divider bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus" /></label>
              <div className="flex flex-wrap gap-2"><button type="button" className={primaryButton} onClick={saveEdit}>Salvar pergunta</button><button type="button" className={button} onClick={() => setEditingId(null)}>Cancelar edição</button></div>
            </div> : <>
              <div className="flex flex-wrap items-start justify-between gap-3"><p className="text-base font-medium text-foreground"><span className="mr-2 text-context-accent">{index + 1}.</span>{question.text}</p><div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => beginEdit(question)}>Editar</button><button type="button" className={button} aria-label={`Mover pergunta ${index + 1} para cima`} disabled={index === 0} onClick={() => setQuestions(current => moveExpertQuestion(current, question.id, -1))}>↑</button><button type="button" className={button} aria-label={`Mover pergunta ${index + 1} para baixo`} disabled={index === questions.length - 1} onClick={() => setQuestions(current => moveExpertQuestion(current, question.id, 1))}>↓</button><button type="button" className={button} onClick={() => removeQuestion(question.id)}>Excluir</button></div></div>
              <p className="mt-3 text-sm text-text-muted"><span className="font-medium text-foreground">Origem:</span> {question.origin}</p>
            </>}
          </div>)}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="expert-new-question">Nova pergunta</label><input id="expert-new-question" value={newQuestion} onChange={event => setNewQuestion(event.target.value)} className="min-h-10 flex-1 rounded-lg border border-divider bg-surface-elevated px-3 py-2 text-base text-foreground focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus" placeholder="Adicionar pergunta" /><button type="button" className={button} onClick={addQuestion} disabled={!newQuestion.trim()}>Adicionar pergunta</button><button type="button" className={button} onClick={() => setQuestions(resetExpertQuestions())}>Restaurar fixture</button></div>
        <div className="mt-5 flex flex-wrap gap-2"><button type="button" className={primaryButton} onClick={approveTopics} disabled={!questions.length || status !== "questions_preparation"}>Aprovar tópicos</button>{status === "ready_to_send" && <button type="button" className={primaryButton} onClick={sendToExpert}>Enviar ao especialista</button>}{status === "awaiting_expert" && <button type="button" className={primaryButton} onClick={simulateReceived}>Simular recebimento</button>}</div>
        {status === "awaiting_expert" && <p className="mt-3 rounded-lg border border-pending bg-pending-soft p-3 text-base text-foreground">Envio simulado. Nenhuma mensagem externa foi enviada. Aguarde ou simule o recebimento da fixture.</p>}
      </div> : <section className={section}><h3 className="text-lg font-semibold text-foreground">Perguntas necessárias</h3><p className="mt-2 text-base text-text-muted">Aguardando análise SERP. As perguntas só serão mostradas quando houver uma necessidade observada.</p></section>}

      <div className={section} id="expert-contributions">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-foreground">Contribuições recebidas</h3><p className="mt-1 text-base text-text-muted">Um áudio não encerra a pauta. Todos os materiais pertencem ao mesmo ExpertBrief da fixture.</p></div><span className="text-base text-text-muted">{hasReceivedMaterials ? `${fixture.contributions.length} materiais` : "Aguardando envio"}</span></div>
        {hasReceivedMaterials ? <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fixture.contributions.map(item => <article key={item.id} className={inset}><div className="flex items-start justify-between gap-3"><div><h4 className="text-base font-semibold text-foreground">{item.label}</h4><p className="mt-1 text-sm text-text-muted">{kindLabels[item.kind]}{item.duration ? ` · ${item.duration}` : ""}</p></div><span className="rounded-full border border-success px-2 py-1 text-sm text-success">Recebido</span></div><p className="mt-3 text-base text-text-muted">{item.detail}</p></article>)}</div>
          <div className="mt-5 flex flex-wrap gap-2"><button type="button" className={primaryButton} onClick={finalizeContribution} disabled={status === "reviewed" || status === "awaiting_review"}>Finalizar contribuição</button>{status === "awaiting_review" && <button type="button" className={primaryButton} onClick={markReviewed}>Marcar como revisada</button>}</div>
        </> : <div className="mt-4 rounded-lg border border-divider bg-surface-subtle p-4 text-base text-text-muted">Depois do envio simulado, os materiais recebidos aparecerão aqui para transcrição e organização local.</div>}
      </div>

      {hasReceivedMaterials && <>
        <div className={section}>
          <div><h3 className="text-lg font-semibold text-foreground">Transcrição fiel</h3><p className="mt-1 text-base text-text-muted">Fonte: {fixture.transcript.source} · {fixture.transcript.range}</p></div>
          <blockquote className="mt-4 border-l-2 border-context-accent pl-4 text-base leading-7 text-foreground">“{fixture.transcript.text}”</blockquote>
          <p className="mt-4 rounded-lg border border-pending bg-pending-soft p-3 text-base text-foreground">Esta transcrição representa a fala original e não é substituída pela organização editorial.</p>
        </div>

        <div className={section}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-foreground">Organização da contribuição</h3><p className="mt-1 text-base text-text-muted">Classificação local para revisão humana. Não é uma nova transcrição.</p></div><span className="text-base text-text-muted">{selectedEvidenceCount} selecionada(s)</span></div>
          <div className="mt-4 space-y-4">{fixture.evidence.map(evidence => { const decision = decisions[evidence.id] || "pending"; return <article key={evidence.id} className={inset}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-base font-semibold text-foreground">{evidence.topic}</h4><p className="mt-1 text-sm text-text-muted">{evidence.evidenceType} · {evidence.sourceLabel} · {evidence.sourceRange}</p></div><span className="rounded-full border border-divider px-3 py-1 text-sm text-text-muted">{decisionLabels[decision]}</span></div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2"><div><h5 className="text-base font-medium text-foreground">Fala original</h5><p className="mt-2 text-base leading-6 text-text-muted">“{evidence.originalText}”</p></div><div><h5 className="text-base font-medium text-foreground">Organização editorial</h5><p className="mt-2 text-base leading-6 text-text-muted">{evidence.organizationText}</p></div></div>
            <div className="mt-4 rounded-lg border border-context-accent bg-selected p-3"><p className="text-sm font-medium text-context-accent">Necessidade do Radar</p><p className="mt-1 text-base text-foreground">{evidence.radarNeed || radarNeed}</p><p className="mt-2 text-sm text-text-muted"><span className="font-medium text-foreground">Contribuição disponível:</span> {evidence.organizationText}</p></div>
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={decision === "main" ? primaryButton : button} onClick={() => setDecisions(current => ({ ...current, [evidence.id]: "main" }))}>Usar como evidência principal</button><button type="button" className={decision === "support" ? primaryButton : button} onClick={() => setDecisions(current => ({ ...current, [evidence.id]: "support" }))}>Usar como apoio</button><button type="button" className={decision === "quote" ? primaryButton : button} onClick={() => setDecisions(current => ({ ...current, [evidence.id]: "quote" }))}>Usar como citação</button><button type="button" className={decision === "exclude" ? primaryButton : button} onClick={() => setDecisions(current => ({ ...current, [evidence.id]: "exclude" }))}>Não utilizar</button></div>
            {decision === "quote" && <div className="mt-4 rounded-lg border border-pending bg-pending-soft p-3"><p className="text-sm font-medium text-foreground">Trecho literal</p><p className="mt-1 text-base leading-6 text-foreground">“{evidence.originalText}”</p><p className="mt-2 text-sm text-text-muted">A citação usa exatamente a fala original; a organização não a substitui.</p></div>}
          </article>; })}</div>
        </div>

        <div className={section}>
          <div><h3 className="text-lg font-semibold text-foreground">Lacunas ainda abertas</h3><p className="mt-1 text-base text-text-muted">Perguntas sem resposta continuam visíveis para uma próxima rodada.</p></div>
          <div className="mt-4 rounded-lg border border-pending bg-pending-soft p-4"><p className="text-base text-foreground">Sem evidência do especialista: {fixture.openQuestion}</p><button type="button" className={`${button} mt-3`} onClick={() => { setFollowupPrepared(true); setNotice("Pergunta complementar preparada apenas localmente."); }}>{followupPrepared ? "Pergunta complementar preparada" : "Preparar pergunta complementar"}</button></div>
        </div>
      </>}

      <div className={section} id="expert-review">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-foreground">Confirmação do especialista</h3><p className="mt-1 text-base text-text-muted">A confirmação verifica se a interpretação representa corretamente a contribuição. Não é aprovação para publicação.</p></div><span className="text-base text-text-muted">{confirmation === "not_requested" ? "Ainda não solicitada" : confirmation === "awaiting" ? "Aguardando confirmação" : confirmation === "confirmed" ? "Confirmada" : "Correção solicitada"}</span></div>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={button} disabled={!hasReceivedMaterials || confirmation === "confirmed"} onClick={() => setConfirmation("awaiting")}>Solicitar confirmação</button>{confirmation === "awaiting" && <><button type="button" className={primaryButton} onClick={() => setConfirmation("confirmed")}>Simular confirmação</button><button type="button" className={button} onClick={() => setConfirmation("correction_requested")}>Simular correção solicitada</button></>}</div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-divider bg-surface-subtle p-4"><p className="text-base text-text-muted">Resumo: {questions.length} perguntas · {hasReceivedMaterials ? fixture.contributions.length : 0} contribuições · 2 evidências · {selectedEvidenceCount} selecionada(s) · {followupPrepared ? 0 : 1} pendência(s)</p>{discardPrompt ? <div className="flex flex-wrap gap-2"><span className="self-center text-base text-text-muted">Descartar somente o estado local?</span><button type="button" className={button} onClick={() => setDiscardPrompt(false)}>Cancelar</button><button type="button" className={primaryButton} onClick={discardContribution}>Confirmar descarte</button></div> : <button type="button" className={button} onClick={() => setDiscardPrompt(true)}>Descartar contribuição</button>}</div>
      {notice && <p className="rounded-lg border border-context-accent bg-selected p-3 text-base text-foreground" role="status">{notice}</p>}
    </section>
  );
}
