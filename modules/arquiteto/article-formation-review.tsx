"use client";

import React from "react";
import type {
  PrincipalComparison,
  ScenarioChange,
  ScenarioComparison,
} from "@/lib/arquiteto/formation-scenario";

/**
 * REVISÃO DA FORMAÇÃO — um painel no lugar de quatro motores.
 *
 * Lógica, SERP, IA e Revisão continuam existindo; deixam de ser quatro abas
 * que o humano precisa visitar em ordem para descobrir o que o Arquiteto já
 * concluiu. O painel sintetiza as quatro fontes e faz UMA pergunta editorial:
 * este agrupamento descreve mesmo uma única página?
 *
 * A parte central não é o cenário — é a CONSEQUÊNCIA. Toda proposta humana
 * passa por antes/depois antes de ser aplicada, com os efeitos derivados nos
 * dois artigos envolvidos e uma frase que explica cada número. Aplicar sem ver
 * o efeito seria pedir uma decisão editorial às cegas.
 *
 * Nada aqui materializa ArticleDNA: são alterações do cenário de formação.
 */

/**
 * Estados da Lógica e da IA.
 *
 * A SERP NÃO usa este vocabulário: ela não tem "não necessária" na formação
 * de Article novo. Dizer que a evidência de mercado é dispensável é afirmar
 * que a hipótese determinística basta — e é essa afirmação que o contrato
 * proíbe. O estado da SERP vem do gate, com nome próprio.
 */
export type EvidenceState = "ok" | "nao_necessaria" | "pendente" | "falhou";

const EVIDENCE_MARK: Record<EvidenceState, string> = {
  ok: "✓",
  nao_necessaria: "—",
  pendente: "…",
  falhou: "△",
};

const EVIDENCE_LABEL: Record<EvidenceState, string> = {
  ok: "concluída",
  nao_necessaria: "opcional",
  pendente: "pendente",
  falhou: "falhou",
};

const EVIDENCE_TONE: Record<EvidenceState, string> = {
  ok: "text-success",
  nao_necessaria: "text-text-muted",
  pendente: "text-warning",
  falhou: "text-danger",
};

/** O gate da SERP tem tom próprio: ele é a evidência principal. */
const SERP_TONE: Record<string, string> = {
  current: "text-success",
  processing: "text-warning",
  missing: "text-warning",
  stale: "text-warning",
  inconclusive: "text-warning",
  divergent: "text-danger",
  failed: "text-danger",
};

const SERP_MARK: Record<string, string> = {
  current: "◉",
  processing: "…",
  missing: "!",
  stale: "!",
  inconclusive: "?",
  divergent: "△",
  failed: "△",
};

const DIRECTION_TONE: Record<ScenarioComparison["effects"][number]["direction"], string> = {
  sobe: "text-success",
  desce: "text-warning",
  igual: "text-text-muted",
};

const VERDICT_TONE: Record<ScenarioComparison["verdict"], string> = {
  melhora: "text-success",
  piora: "text-warning",
  neutra: "text-text-muted",
  recusada: "text-danger",
};

function Snapshot({ title, articles }: { title: string; articles: ScenarioComparison["before"] }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold uppercase tracking-wider text-text-muted">{title}</p>
      {articles.length === 0
        ? <p className="mt-1 text-sm leading-6 text-text-muted">Nenhum artigo deste lado da comparação.</p>
        : articles.map(article => (
          <div key={article.slot} className="mt-2 rounded-md border border-divider bg-surface-subtle p-2">
            <p className="text-sm font-semibold text-foreground">{article.label}</p>
            <p className="mt-0.5 text-sm leading-6 text-text-muted">
              Coerência {article.coherence.value} · Intenção {article.intent.value} ·{" "}
              Centralidade {article.centrality.value} · {article.keywordCount} keyword(s)
            </p>
            <p className="text-sm leading-6 text-text-muted">{article.coherence.reasons[0] || "sem observação registrada"}</p>
          </div>
        ))}
    </div>
  );
}

export function ArticleFormationReviewPanel({
  articleLabel,
  candidateRef,
  scenario,
  evidence,
  serp,
  conclusion,
  keywords,
  moveTargets,
  mergeTargets,
  siloTargets,
  onAcceptSerp,
  pendingDecisions,
  unitTypeControl,
  closure,
  onApproveArticle,
  materialized,
  preview,
  principalComparison,
  busy,
  readOnlyReason,
  onPreview,
  onApply,
  onCancel,
}: {
  articleLabel: string;
  /** Artigo aberto; toda proposta nasce amarrada a ele. */
  candidateRef: string;
  /** Cenário corrente do artigo, do jeito que a mesa o exibe. */
  scenario: { principal: string; secundarias: string[]; reforcos: string[] };
  /**
   * Lógica e IA. A SERP não está aqui: ela vem em `serp`, porque tem
   * precedência de leitura e um vocabulário que não admite dispensa.
   */
  evidence: { logic: EvidenceState; ai: EvidenceState };
  /** Gate da SERP para a composição de AGORA. */
  serp: {
    state: string;
    label: string;
    reason: string;
    blocksConclusion: boolean;
    /**
     * O parecer legível do mercado observado.
     *
     * Duas perguntas separadas de propósito: quem encabeça a página, e se
     * estas buscas cabem em uma página só. Uma Principal boa num grupo que
     * precisa ser dividido é resultado normal — achatar as duas num veredito
     * só esconderia metade do achado.
     */
    parecer: {
      principalVerdict: string;
      principalAlternative: string | null;
      principalReason: string;
      groupVerdict: string;
      groupReason: string;
      outsiders: readonly { keyword: string; reason: string }[];
      observedIntent: string;
      dominantType: string;
      viabilityText: string;
      distinctDomains: number;
      recommendation: string;
    } | null;
    /** A pessoa precisa decidir: a evidência existe e não é conclusiva. */
    awaitsHuman: boolean;
  };
  /**
   * Registrar que a composição fica como está, apesar do parecer.
   *
   * É uma decisão editorial concreta — "eu li a evidência e mantenho" — e não
 * um "ignorar SERP". As outras saídas já existem como ações de revisão:
   * trocar Principal, separar, mover, juntar, mudar papel.
   */
  onAcceptSerp: (reason: string) => void;
  /**
   * Fechamento do artigo.
   *
   * Ele vivia na aba `Revisão` do antigo seletor de processos. Quando a fase
   * Artigos trocou aquelas quatro abas por este painel, o único caminho de
   * aprovação do ArticleDNA saiu do fluxo junto — e sem ArticleDNA aprovado
   * a etapa Silos nunca forma working copy, o que trava Links e Radar.
   *
   * Aprovar aqui não é decorativo: é o que diz que esta definição está
   * fechada e pode virar arquitetura.
   */
  /**
   * Decisões obrigatórias que ainda travam o fechamento.
   *
   * Elas viviam no checklist da aba `Revisão`. Trocar as quatro abas por
   * este painel levou junto o checklist inteiro — e com ele o caminho de
   * resolver o que impede aprovar. Um botão desabilitado sem o controle que
   * o destrava é um beco sem saída.
   */
  pendingDecisions: readonly {
    id: string;
    title: string;
    what: string;
    how: string;
    resolved: boolean;
  }[];
  /** Controle do tipo de unidade editorial, quando ele está pendente. */
  unitTypeControl: {
    value: string;
    options: readonly { value: string; label: string }[];
    onChange: (value: string) => void;
    onConfirm: () => void;
  } | null;
  closure: {
    /** "v5 aprovada · revisão atual com 2 pendências" — os dois tempos juntos. */
    headline: string;
    revisionPending: boolean;
    approved: boolean;
    readyForApproval: boolean;
    statusLabel: string;
    pendingCount: number;
    blockers: readonly string[];
  } | null;
  onApproveArticle: () => void;
  /** Por que este agrupamento descreve uma página só — em texto. */
  conclusion: string[];
  keywords: readonly { keywordId: string; label: string; role: "principal" | "secundaria" | "reforco" }[];
  /** Artigos do MESMO Silo; mover atravessa Silo nenhum. */
  moveTargets: readonly { candidateRef: string; label: string }[];
  mergeTargets: readonly { candidateRef: string; label: string }[];
  /** Outros Silos confirmados — o destino vira decisão territorial, não move. */
  siloTargets: readonly { siloRef: string; label: string }[];
  /**
   * ArticleDNA vigente deste artigo, quando a formação já foi concluída.
   *
   * O painel não some depois de concluir: ele passa a dizer o que ficou
   * gravado. Sumir faria a tela esquecer a decisão no exato momento em que
   * ela virou contrato.
   */
  materialized: {
    versionNumber: number;
    statusLabel: string;
    siloLabel: string;
    slug: string | null;
    evidence: { logic: EvidenceState; serp: EvidenceState; ai: EvidenceState; human: number };
  } | null;
  /** Proposta em avaliação; `null` quando nada foi proposto ainda. */
  preview: ScenarioComparison | null;
  principalComparison: PrincipalComparison | null;
  busy: boolean;
  /** Publicado protegido não recompõe por aqui. */
  readOnlyReason: string | null;
  onPreview: (change: ScenarioChange) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const [mergeTarget, setMergeTarget] = React.useState("");
  const [serpReason, setSerpReason] = React.useState("");

  return (
    <section aria-label={`Revisão da formação de ${articleLabel}`} data-testid="architect-formation-review">
      <p className="text-sm font-semibold uppercase tracking-wider text-module-accent">
        {materialized ? "Formação concluída" : "Revisão da formação"}
      </p>

      {/* §9 — depois de concluir, o painel diz o que ficou gravado. Uma nova
          mudança estrutural não reescreve o ArticleDNA aprovado em silêncio:
          ela sucede a versão vigente pelo mecanismo canônico. */}
      {materialized && (
        <div className="mt-2 rounded-md border border-positive-soft/40 bg-positive-soft/5 p-2" data-testid="architect-review-materialized">
          <p className="text-sm leading-6 text-foreground">
            ArticleDNA v{materialized.versionNumber} · {materialized.statusLabel} · Silo {materialized.siloLabel}
            {materialized.slug ? ` · /${materialized.slug}` : ""}
          </p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Evidências usadas: Lógica {EVIDENCE_LABEL[materialized.evidence.logic]} · SERP{" "}
            {EVIDENCE_LABEL[materialized.evidence.serp]} · IA {EVIDENCE_LABEL[materialized.evidence.ai]} ·{" "}
            {materialized.evidence.human} revisão(ões) humana(s).
          </p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Uma nova mudança estrutural não altera esta versão: ela cria a próxima, com a anterior preservada.
          </p>
        </div>
      )}

      {/* ------------------------------ cenário ----------------------------- */}
      <div className="mt-3" data-testid="architect-review-scenario">
        <p className="text-sm font-semibold text-foreground">Cenário atual</p>
        <dl className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-text-muted">Principal</dt>
            <dd className="mt-0.5 break-words font-medium text-keyword">{scenario.principal}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Secundárias</dt>
            <dd className="mt-0.5 break-words font-medium text-foreground">
              {scenario.secundarias.length ? scenario.secundarias.join(" · ") : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Reforços</dt>
            <dd className="mt-0.5 break-words font-medium text-foreground">
              {scenario.reforcos.length ? scenario.reforcos.join(" · ") : "—"}
            </dd>
          </div>
        </dl>
      </div>

      {/* ----------------------------- evidências --------------------------- */}
      <div className="mt-3" data-testid="architect-review-evidence">
        <p className="text-sm font-semibold text-foreground">Evidências</p>
        {/* A SERP vem primeiro porque é a única evidência EXTERNA: a Lógica
            é hipótese sobre texto e a IA é interpretação. Quando as duas
            contradizem o mercado, é a hipótese que precisa se explicar. */}
        <ul className="mt-1 space-y-0.5 text-sm leading-6">
          <li className={SERP_TONE[serp.state] || "text-text-muted"} data-testid="architect-review-serp">
            <span className="mr-1.5 inline-block w-4 font-semibold">{SERP_MARK[serp.state] || "—"}</span>
            SERP · {serp.label} · <span className="font-semibold uppercase tracking-wider">evidência principal</span>
            <span className="block pl-5 text-text-muted">{serp.reason}</span>
          </li>
          {([["Lógica", evidence.logic], ["IA", evidence.ai]] as const).map(([nome, estado]) => (
            <li key={nome} className={EVIDENCE_TONE[estado]}>
              <span className="mr-1.5 inline-block w-4 font-semibold">{EVIDENCE_MARK[estado]}</span>
              {nome} · {EVIDENCE_LABEL[estado]}
            </li>
          ))}
        </ul>
      </div>

      {/* §9 — o que o mercado mostrou, em texto, antes da hipótese. */}
      {serp.parecer && (
        <div className="mt-3 rounded-md border border-divider bg-surface-subtle p-2" data-testid="architect-review-serp-parecer">
          <p className="text-sm font-semibold text-foreground">Parecer da SERP</p>

          <p className="mt-2 text-sm leading-6 text-text-muted">Principal</p>
          <p className="text-sm leading-6 text-foreground">
            {serp.parecer.principalReason}
            {serp.parecer.principalAlternative
              ? ` → revisar: "${serp.parecer.principalAlternative}" cobre melhor o grupo.`
              : ""}
          </p>

          <p className="mt-2 text-sm leading-6 text-text-muted">Grupo</p>
          <p className="text-sm leading-6 text-foreground">{serp.parecer.groupReason}</p>
          {serp.parecer.outsiders.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-sm leading-6 text-warning" data-testid="architect-review-serp-outsiders">
              {serp.parecer.outsiders.map(item => (
                <li key={item.keyword}>
                  <span className="text-foreground">{item.keyword}</span> — {item.reason}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-sm leading-6 text-text-muted">Mercado observado</p>
          <p className="text-sm leading-6 text-foreground">
            Intenção {serp.parecer.observedIntent} · tipo dominante {serp.parecer.dominantType} ·{" "}
            {serp.parecer.distinctDomains} domínio(s) distinto(s)
          </p>
          <p className="text-sm leading-6 text-text-muted">{serp.parecer.viabilityText}</p>

          <p className="mt-2 text-sm leading-6 text-foreground" data-testid="architect-review-serp-recommendation">
            <span className="font-semibold">Recomendação:</span> {serp.parecer.recommendation}
          </p>

          {/* §4 — a saída é a ação editorial concreta. A recomendação da SERP
              aponta qual delas; os controles são os que já existem abaixo, e
              não há botão de "aplicar SERP" nem de "ignorar SERP". */}
          {serp.awaitsHuman && (
            <div className="mt-3 border-t border-divider pt-2" data-testid="architect-serp-resolution">
              <p className="text-sm leading-6 text-text-muted">
                Para seguir, altere a composição usando os controles abaixo — ou registre que ela fica
                como está, dizendo por quê.
              </p>
              <label className="mt-2 block text-sm text-text-muted" htmlFor="architect-serp-accept-reason">
                Motivo da decisão
                <textarea
                  id="architect-serp-accept-reason"
                  data-testid="architect-serp-accept-reason"
                  value={serpReason}
                  onChange={event => setSerpReason(event.target.value)}
                  disabled={busy}
                  placeholder="Ex.: a evidência é fraca, mas a composição responde a mesma necessidade editorial."
                  className="mt-1 min-h-16 w-full rounded border border-divider bg-surface px-2 py-1.5 text-sm text-foreground"
                />
              </label>
              <button
                type="button"
                disabled={busy || serpReason.trim().length < 8}
                data-testid="architect-serp-accept"
                onClick={() => { onAcceptSerp(serpReason.trim()); setSerpReason(""); }}
                title={serpReason.trim().length < 8 ? "Descreva o motivo da decisão." : "Registrar a decisão para esta composição"}
                className="mt-2 min-h-9 rounded border border-divider px-3 text-sm font-semibold text-text-muted transition-colors hover:border-module-accent/40 hover:text-foreground disabled:opacity-40"
              >
                Manter composição
              </button>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                A decisão vale para esta composição. Se ela mudar, a evidência e a decisão deixam de
                valer sozinhas e a SERP precisa ser refeita.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3" data-testid="architect-review-conclusion">
        <p className="text-sm font-semibold text-foreground">Conclusão</p>
        {conclusion.length === 0
          ? <p className="mt-1 text-sm leading-6 text-text-muted">Sem observação registrada para esta composição.</p>
          : conclusion.map(frase => <p key={frase} className="mt-1 text-sm leading-6 text-foreground">{frase}</p>)}
      </div>

      {/* ------------------------- controles humanos ------------------------ */}
      {readOnlyReason ? (
        <p className="mt-3 text-sm leading-6 text-text-muted" data-testid="architect-review-readonly">{readOnlyReason}</p>
      ) : (
        <div className="mt-4 border-t border-divider pt-3" data-testid="architect-review-controls">
          <p className="text-sm font-semibold text-foreground">Revisar composição</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Toda proposta mostra o efeito antes de ser aplicada. Nenhuma delas cria ArticleDNA.
          </p>
          <ul className="mt-2 space-y-2">
            {keywords.map(item => (
              <li key={item.keywordId} className="rounded-md border border-divider bg-surface-subtle p-2" data-testid="architect-review-keyword">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words text-sm font-medium text-keyword">{item.label}</span>
                  <span className="shrink-0 rounded-md border border-divider px-2 py-0.5 text-xs font-medium text-text-muted">
                    {item.role === "principal" ? "Principal" : item.role === "secundaria" ? "Secundária" : "Reforço"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {item.role !== "principal" && (
                    <button
                      type="button"
                      disabled={busy}
                      data-testid="architect-review-make-principal"
                      onClick={() => onPreview({ kind: "change_principal", candidateRef, keywordId: item.keywordId })}
                      className="min-h-8 rounded border border-divider px-2 text-sm text-text-muted transition-colors hover:border-module-accent/40 hover:text-foreground disabled:opacity-40"
                    >
                      Tornar principal
                    </button>
                  )}
                  {item.role !== "principal" && (
                    <select
                      disabled={busy}
                      value={item.role}
                      aria-label={`Papel de ${item.label}`}
                      data-testid="architect-review-set-role"
                      onChange={event => onPreview({
                        kind: "set_role",
                        candidateRef,
                        keywordId: item.keywordId,
                        role: event.target.value === "reforco" ? "reforco" : "secundaria",
                      })}
                      className="min-h-8 rounded border border-divider bg-surface px-1.5 text-sm text-text-muted"
                    >
                      <option value="secundaria">Secundária</option>
                      <option value="reforco">Reforço</option>
                    </select>
                  )}
                  {item.role !== "principal" && (
                    <button
                      type="button"
                      disabled={busy}
                      data-testid="architect-review-split"
                      onClick={() => onPreview({ kind: "split_keyword", candidateRef, keywordId: item.keywordId })}
                      className="min-h-8 rounded border border-divider px-2 text-sm text-text-muted transition-colors hover:border-warning/40 hover:text-foreground disabled:opacity-40"
                    >
                      Separar como artigo
                    </button>
                  )}
                  {item.role !== "principal" && (
                    <button
                      type="button"
                      disabled={busy}
                      data-testid="architect-review-remove"
                      onClick={() => onPreview({ kind: "remove_keyword", candidateRef, keywordId: item.keywordId })}
                      className="min-h-8 rounded border border-divider px-2 text-sm text-text-muted transition-colors hover:border-warning/40 hover:text-foreground disabled:opacity-40"
                    >
                      Remover deste artigo
                    </button>
                  )}
                  {item.role !== "principal" && moveTargets.length > 0 && (
                    <select
                      disabled={busy}
                      value=""
                      aria-label={`Mover ${item.label} para outro artigo do mesmo Silo`}
                      data-testid="architect-review-move"
                      onChange={event => {
                        if (event.target.value) {
                          onPreview({ kind: "move_keyword", keywordId: item.keywordId, fromCandidateRef: candidateRef, toCandidateRef: event.target.value });
                        }
                      }}
                      className="min-h-8 rounded border border-divider bg-surface px-1.5 text-sm text-text-muted"
                    >
                      <option value="">Mover para outro artigo…</option>
                      {moveTargets.map(target => (
                        <option key={target.candidateRef} value={target.candidateRef}>{target.label}</option>
                      ))}
                    </select>
                  )}
                  {/* §11 — outro Silo não é destino de arrasto: vira decisão de
                      membership territorial, e o artigo de lá é recalculado. */}
                  {siloTargets.length > 0 && (
                    <span
                      className="text-sm leading-6 text-text-muted"
                      data-testid="architect-review-silo-readonly"
                      title="Mover um artigo entre Silos é mudança estrutural de membership e pertence à fase Silos."
                    >
                      Silo definido na fase Silos
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {mergeTargets.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="architect-review-merge">
              <label className="text-sm text-text-muted" htmlFor="architect-review-merge-target">Juntar com:</label>
              <select
                id="architect-review-merge-target"
                disabled={busy}
                value={mergeTarget}
                onChange={event => setMergeTarget(event.target.value)}
                className="min-h-8 min-w-0 flex-1 rounded border border-divider bg-surface px-2 text-sm text-foreground"
              >
                <option value="">Selecione um artigo deste Silo</option>
                {mergeTargets.map(target => (
                  <option key={target.candidateRef} value={target.candidateRef}>{target.label}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !mergeTarget}
                data-testid="architect-review-merge-preview"
                onClick={() => onPreview({ kind: "merge_candidates", leftCandidateRef: candidateRef, rightCandidateRef: mergeTarget })}
                className="min-h-8 shrink-0 rounded border border-divider px-2 text-sm text-text-muted transition-colors hover:border-module-accent/40 hover:text-foreground disabled:opacity-40"
              >
                Ver efeito
              </button>
            </div>
          )}
        </div>
      )}

      {/* --------------------- decisões que travam o fechamento -------------- */}
      {pendingDecisions.length > 0 && (
        <div className="mt-4 border-t border-divider pt-3" data-testid="architect-review-decisions">
          <p className="text-sm font-semibold text-foreground">Decisões pendentes</p>
          <ul className="mt-2 space-y-2">
            {pendingDecisions.map(decision => (
              <li key={decision.id} className="rounded-md border border-warning/35 bg-warning-soft p-2" data-testid="architect-review-decision">
                <p className="text-sm font-semibold text-foreground">{decision.title}</p>
                <p className="mt-1 text-sm leading-6 text-text-muted">O que falta: {decision.what}</p>
                <p className="text-sm leading-6 text-text-muted">Como resolver: {decision.how}</p>
              </li>
            ))}
          </ul>

          {unitTypeControl && (
            <div className="mt-2 flex flex-wrap items-end gap-2" data-testid="architect-review-unit-type">
              <label className="text-sm text-text-muted" htmlFor="architect-review-unit-type-select">
                Tipo de unidade
                <select
                  id="architect-review-unit-type-select"
                  value={unitTypeControl.value}
                  disabled={busy}
                  onChange={event => unitTypeControl.onChange(event.target.value)}
                  className="mt-1 block min-h-9 rounded border border-divider bg-surface px-2 text-sm text-foreground"
                >
                  {unitTypeControl.options.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy}
                data-testid="architect-review-unit-type-confirm"
                onClick={unitTypeControl.onConfirm}
                className="min-h-9 rounded border border-divider px-3 text-sm font-semibold text-text-muted transition-colors hover:border-module-accent/40 hover:text-foreground disabled:opacity-40"
              >
                Registrar tipo
              </button>
            </div>
          )}
        </div>
      )}

      {/* ------------------------- fechamento do artigo ---------------------- */}
      {closure && (
        <div className="mt-4 border-t border-divider pt-3" data-testid="architect-article-approval">
          <p className="text-sm font-semibold text-foreground">Fechamento do artigo</p>
          {/* A VERSÃO APROVADA E A REVISÃO CORRENTE SÃO TEMPOS DIFERENTES.
              Colapsá-las em "Aprovado" escondia o botão exatamente quando
              havia pendência sobre uma versão já aprovada — a pessoa lia
              "Aprovado · 2 pendências" e não tinha ato para fechar a segunda. */}
          <p className="mt-1 text-sm leading-6 text-foreground" data-testid="architect-article-headline">
            {closure.headline}
          </p>
          {closure.approved && (
            <p className="mt-1 text-sm leading-6 text-success" data-testid="architect-article-approved">
              A versão aprovada permanece válida e não é reescrita. Fechar a revisão atual cria uma sucessora.
            </p>
          )}
          {closure.revisionPending ? (
            <p className="mt-2 text-sm leading-6 text-warning" data-testid="architect-revision-pending">
              Resolva as decisões abaixo para poder fechar esta revisão.
            </p>
          ) : (
            <>
              <button
                type="button"
                disabled={busy || !closure.readyForApproval}
                data-testid="architect-approve-article"
                onClick={onApproveArticle}
                className="mt-2 min-h-9 rounded border border-positive-soft/45 px-3 text-sm font-semibold text-positive-soft transition-colors hover:bg-positive-soft/10 disabled:opacity-40"
              >
                Aprovar ArticleDNA
              </button>
              {!closure.readyForApproval && closure.blockers.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm leading-6 text-text-muted" data-testid="architect-approval-blockers">
                  {closure.blockers.map(blocker => <li key={blocker}>• {blocker}</li>)}
                </ul>
              )}
            </>
          )}
          {closure.revisionPending && closure.blockers.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm leading-6 text-text-muted" data-testid="architect-approval-blockers">
              {closure.blockers.map(blocker => <li key={blocker}>• {blocker}</li>)}
            </ul>
          )}
          <p className="mt-2 text-sm leading-6 text-text-muted">
            A aprovação fecha a definição deste artigo. Silo, categoria e briefing do Planejador não são decididos aqui.
          </p>
        </div>
      )}

      {/* --------------------------- antes / depois ------------------------- */}
      {preview && (
        <div className="mt-4 rounded-md border border-module-accent/35 bg-module-accent/5 p-3" data-testid="architect-review-comparison">
          <p className="text-sm font-semibold text-foreground">{preview.description}</p>

          {preview.refusal ? (
            <p className="mt-2 text-sm leading-6 text-danger" data-testid="architect-review-refusal">
              {preview.refusal.detail}
            </p>
          ) : (
            <>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <Snapshot title="Antes" articles={preview.before} />
                <Snapshot title="Depois" articles={preview.after} />
              </div>

              <p className="mt-3 text-sm font-semibold text-foreground">Efeitos derivados</p>
              <ul className="mt-1 space-y-0.5 text-sm leading-6" data-testid="architect-review-effects">
                {preview.effects.map(effect => (
                  <li key={`${effect.slot}-${effect.metric}`} className={DIRECTION_TONE[effect.direction]}>
                    <span className="text-foreground">{effect.label}</span> · {effect.metric}:{" "}
                    {effect.before} → {effect.after}
                    <span className="block text-text-muted">{effect.explanation}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* §10 — trocar quem lidera é decisão comparada, não sugestão aceita. */}
          {principalComparison && (
            <div className="mt-3" data-testid="architect-review-principal-comparison">
              <p className="text-sm font-semibold text-foreground">Principal atual vs. Principal proposta</p>
              {principalComparison.refusal ? (
                <p className="mt-1 text-sm leading-6 text-danger">{principalComparison.refusal.detail}</p>
              ) : (
                <>
                  <div className="mt-1 overflow-x-auto">
                    <table className="w-full min-w-[420px] text-left text-sm">
                      <thead>
                        <tr className="text-text-muted">
                          <th scope="col" className="py-1 pr-3 font-medium">Critério</th>
                          <th scope="col" className="py-1 pr-3 font-medium">Atual</th>
                          <th scope="col" className="py-1 font-medium">Proposta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {principalComparison.criteria.map(item => (
                          <tr key={item.criterion} className="align-top">
                            <th scope="row" className="py-1 pr-3 font-normal text-text-muted">{item.criterion}</th>
                            <td className={`py-1 pr-3 ${item.favors === "atual" ? "text-success" : "text-foreground"}`}>{item.current}</td>
                            <td className={`py-1 ${item.favors === "proposta" ? "text-success" : "text-foreground"}`}>
                              {item.proposed}
                              <span className="block text-text-muted">{item.explanation}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-text-muted">{principalComparison.reading}</p>
                </>
              )}
            </div>
          )}

          <p className={`mt-3 text-sm leading-6 ${VERDICT_TONE[preview.verdict]}`} data-testid="architect-review-verdict">
            {preview.conclusion}
          </p>

          {/* O simulador é determinístico: ele diz o que a leitura prevê, não
              o que o mercado devolve. Aplicar a mudança envelhece a evidência
              deste artigo, e concluir passa a exigir SERP nova. */}
          {!preview.refusal && (
            <p className="mt-1 text-sm leading-6 text-warning" data-testid="architect-review-serp-warning">
              Esta comparação é determinística. Ao aplicar, a evidência SERP destes artigos deixa de
              representar a composição e precisa ser atualizada antes da conclusão.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {!preview.refusal && (
              <button
                type="button"
                disabled={busy}
                data-testid="architect-review-apply"
                onClick={onApply}
                className="min-h-9 rounded border border-module-accent/50 bg-module-accent/10 px-3 text-sm font-semibold text-module-accent transition-colors hover:bg-module-accent/20 disabled:opacity-40"
              >
                {busy ? "Aplicando…" : "Aplicar ao cenário"}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              data-testid="architect-review-cancel"
              onClick={onCancel}
              className="min-h-9 rounded border border-divider px-3 text-sm font-semibold text-text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              {preview.refusal ? "Fechar" : "Descartar proposta"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
