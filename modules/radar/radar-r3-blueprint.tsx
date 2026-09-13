"use client";

import {
  buildRadarBlueprintSummary,
  RADAR_FACTUAL_STATUS_LABEL, RADAR_SECTION_PLACEMENT_LABEL, RADAR_SECTION_PRIORITY_LABEL,
  RADAR_SPECIALIST_CONTRIBUTION_LABEL,
  type RadarEditorialBlueprint, type RadarSpecialistBrief, type RadarVideoBrief,
} from "@/lib/radar/editorial-blueprint";

/**
 * O DOSSIÊ EDITORIAL, EM LINGUAGEM DE REUNIÃO.
 *
 * Os cards da Pesquisa dizem o que o Radar ENCONTROU: 3 conceitos, 13
 * perguntas, 45 diferenciações, 19 fontes. São verdadeiros e servem para
 * auditar a investigação. Nenhum deles responde "então como este artigo deve
 * ser construído?" — e essa é a pergunta que quem opera faz.
 *
 * Esta tela mostra a outra leitura: quais blocos narrativos a evidência
 * sustenta, o que cada um precisa responder, por que ele entra, onde o
 * especialista é necessário e onde um vídeo ajuda.
 *
 * HUMAN-FIRST, LITERALMENTE (§28). Nenhum `conceptId`, `claimId`, `sourceId`,
 * hash ou enum técnico aparece na primeira leitura. O que se vê aqui pode ser
 * lido em voz alta numa reunião editorial sem tradução.
 *
 * E NÃO É O CONTENTPLAN. Os títulos são nomes de trabalho, a posição é
 * tendência observada, e não existe contagem de palavras. A estrutura final
 * continua sendo decisão do Planejador.
 */

const bloco = "rounded-md border border-divider bg-surface-subtle p-3";
const secao = "rounded-md border border-divider bg-surface p-3";

const TOM: Record<string, string> = {
  ESSENTIAL: "text-success", RECOMMENDED: "text-context-accent", OPTIONAL: "text-text-muted",
  HIGH: "text-warning", MEDIUM: "text-context-accent", LOW: "text-text-muted",
};

function Numero({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return <div>
    <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
    <dd className={`mt-0.5 text-sm font-medium ${tone || "text-foreground"}`}>{value}</dd>
  </div>;
}

/** O resumo da primeira camada — §21. */
export function RadarBlueprintSummaryCard({ blueprint }: { blueprint: RadarEditorialBlueprint }) {
  const resumo = buildRadarBlueprintSummary(blueprint);
  const tom = { success: "text-success", warning: "text-warning", neutral: "text-text-muted" }[resumo.readinessTone];

  return <details className={secao} data-testid="radar-blueprint">
    <summary className="cursor-pointer">
      <span className="text-base font-semibold text-foreground">Blueprint editorial</span>
      <span className={`ml-2 text-sm ${tom}`} data-testid="radar-blueprint-readiness">{resumo.readinessLabel}</span>
    </summary>

    <p className="mt-2 max-w-4xl text-sm leading-6 text-foreground" data-testid="radar-blueprint-objective">{resumo.objective}</p>

    <dl className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5" data-testid="radar-blueprint-summary">
      <Numero label="Blocos editoriais" value={resumo.sections} />
      <Numero label="Perguntas essenciais" value={resumo.essentialQuestions} />
      <Numero label="Links planejados" value={resumo.plannedLinks} />
      <Numero label="Pontos para especialista" value={resumo.specialistPoints} />
      <Numero label="Oportunidades de vídeo" value={resumo.videoOpportunities} />
    </dl>

    <div className="mt-3">
      <RadarBlueprintDetail blueprint={blueprint} />
    </div>
  </details>;
}

/** O blueprint aberto — §22. Leitura corrida, sem identificadores. */
export function RadarBlueprintDetail({ blueprint }: { blueprint: RadarEditorialBlueprint }) {
  return <div className="space-y-2.5" data-testid="radar-blueprint-detail">
    <div className={bloco}>
      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Numero label="Intenção" value={blueprint.article.intent || "Não declarada"} />
        <Numero label="Funil" value={blueprint.article.funnel || "Não declarado"} />
        <Numero label="Papel no Silo" value={blueprint.article.siloRole || "Não declarado"} />
        <Numero label="Principal" value={blueprint.article.principal || "Não resolvida"} />
      </dl>
    </div>

    {/* ABERTURA — o que a amostra mostra sobre começar. Não é a introdução. */}
    <div className={bloco} data-testid="radar-blueprint-opening">
      <h4 className="text-sm font-semibold text-foreground">Abertura</h4>
      <ul className="mt-1.5 space-y-1 text-sm leading-6 text-foreground">
        {blueprint.opening.directives.map(item => <li key={item}>→ {item}</li>)}
      </ul>
      <p className="mt-1 text-xs leading-5 text-text-muted">{blueprint.opening.evidence}</p>
    </div>

    {/*
      * OS BLOCOS, COM O PORQUÊ AO LADO.
      *
      * "Por que entra" é o campo que transforma um sumário em decisão editorial
      * auditável: alguém pode discordar dele com evidência.
      */}
    {blueprint.sections.map((item, index) => <div key={item.id} className={bloco} data-testid="radar-blueprint-section">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">{index + 1}. {item.workingTitle}</h4>
        <span className="text-xs text-text-muted">
          <span className={TOM[item.priority]}>{RADAR_SECTION_PRIORITY_LABEL[item.priority]}</span>
          {" · "}{RADAR_SECTION_PLACEMENT_LABEL[item.placement]}
        </span>
      </div>

      <p className="mt-1 text-sm leading-6 text-text-muted">Por que entra: {item.purpose}</p>

      {item.questions.length > 0 && <div className="mt-2">
        <span className="text-xs uppercase tracking-wide text-text-muted">Precisa responder</span>
        <ul className="mt-1 space-y-1 text-sm leading-6 text-foreground">
          {item.questions.map(pergunta => <li key={pergunta.id}>
            {pergunta.text}
            <span className="block text-xs leading-5 text-text-muted">{pergunta.answerRequirement}</span>
          </li>)}
        </ul>
      </div>}

      {item.definitions.length > 0 && <p className="mt-2 text-sm leading-6 text-foreground">
        Definir antes de aprofundar: {item.definitions.map(definicao => definicao.term).join(" · ")}
      </p>}

      <dl className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Numero label="Mercado" value={`${item.marketEvidence.pages} de ${item.marketEvidence.sampleSize} página(s)`} />
        <Numero label="Evidência factual" value={RADAR_FACTUAL_STATUS_LABEL[item.factualStatus]} />
        <Numero label="Links" value={item.internalLinks.length ? `${item.internalLinks.length} destino(s)` : "Nenhum"} />
        <Numero label="Especialista" value={item.specialistRequirementIds.length ? "Revisão necessária" : "Não necessário"} />
      </dl>

      {item.internalLinks.length > 0 && <ul className="mt-2 space-y-1 text-sm leading-6 text-text-muted">
        {item.internalLinks.map(link => <li key={link.nodeId}>
          {link.destination} · âncora “{link.anchor}”{link.unresolved ? " · sem contexto natural nesta rodada" : ` · ${link.occurrences} ocorrência(s)`}
        </li>)}
      </ul>}

      {item.differentiation && <p className="mt-2 text-sm leading-6 text-context-accent">Diferenciação: {item.differentiation}</p>}
      {item.limitations.map(limitacao => <p key={limitacao} className="mt-1 text-sm leading-6 text-warning">{limitacao}</p>)}
    </div>)}

    {blueprint.closing && <div className={bloco} data-testid="radar-blueprint-closing">
      <h4 className="text-sm font-semibold text-foreground">Fechamento</h4>
      <ul className="mt-1.5 space-y-1 text-sm leading-6 text-foreground">
        {blueprint.closing.directives.map(item => <li key={item}>→ {item}</li>)}
      </ul>
      <p className="mt-1 text-xs leading-5 text-text-muted">{blueprint.closing.evidence}</p>
    </div>}

    {/* DIFERENCIAÇÃO — três leituras distintas, nunca uma obrigação. */}
    <div className={bloco} data-testid="radar-blueprint-differentiation">
      <h4 className="text-sm font-semibold text-foreground">Diferenciação</h4>
      <p className="mt-1 text-sm leading-6 text-text-muted">O mercado cobre: {blueprint.differentiation.marketCovers.join(" · ") || "nada recorrente"}</p>
      <p className="mt-1 text-sm leading-6 text-text-muted">Pouco coberto: {blueprint.differentiation.underCovered.join(" · ") || "nada observado"}</p>
      <p className="mt-1 text-sm leading-6 text-foreground">Oportunidade própria: {blueprint.differentiation.ownOpportunities.join(" · ") || "nenhuma declarada pelo artigo"}</p>
    </div>

    {blueprint.unresolvedLinks.length > 0 && <div className={bloco} data-testid="radar-blueprint-unresolved-links">
      <h4 className="text-sm font-semibold text-foreground">Relações sem contexto sustentado</h4>
      <p className="mt-1 text-sm leading-6 text-text-muted">A relação existe na arquitetura aprovada e esta rodada não encontrou onde aplicá-la com fundamento. Não é para remover o link.</p>
      <ul className="mt-1.5 space-y-1 text-sm leading-6 text-foreground">
        {blueprint.unresolvedLinks.map(link => <li key={`${link.direction}:${link.nodeId}`}>{link.destination} · {link.reason}</li>)}
      </ul>
    </div>}

    {blueprint.limitations.length > 0 && <div className={bloco} data-testid="radar-blueprint-limitations">
      <h4 className="text-sm font-semibold text-foreground">Limitações da investigação</h4>
      <ul className="mt-1.5 space-y-1 text-sm leading-6 text-text-muted">
        {blueprint.limitations.map(item => <li key={item}>{item}</li>)}
      </ul>
    </div>}
  </div>;
}

/**
 * A PAUTA DO ESPECIALISTA — §14, pronta para um profissional ler.
 *
 * "1 ponto preparado" não é pauta: é contagem. O profissional precisa do tema,
 * da pergunta, do porquê, do que se espera dele e de onde isso entra no artigo.
 * É este texto que um dia vai pelo Telegram — e ele já nasce legível.
 */
export function RadarSpecialistBriefList({ briefs }: { briefs: readonly RadarSpecialistBrief[] }) {
  if (!briefs.length) {
    return <p className="text-sm leading-6 text-text-muted" data-testid="radar-specialist-briefs-empty">
      Nenhuma afirmação desta investigação exige revisão profissional.
    </p>;
  }

  return <div className="space-y-2.5" data-testid="radar-specialist-briefs">
    {briefs.map(brief => <div key={brief.requirementId} className={bloco} data-testid="radar-specialist-brief">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">{brief.topic}</h4>
        <span className={`text-xs ${TOM[brief.priority]}`}>Prioridade {brief.priority === "HIGH" ? "alta" : brief.priority === "MEDIUM" ? "média" : "baixa"}</span>
      </div>

      <p className="mt-2 text-sm uppercase tracking-wide text-text-muted">O artigo precisa esclarecer</p>
      <p className="text-sm leading-6 text-foreground">{brief.question}</p>

      <p className="mt-2 text-sm uppercase tracking-wide text-text-muted">Por que pedimos sua revisão</p>
      <p className="text-sm leading-6 text-foreground">{brief.whyNeeded}</p>
      {brief.evidenceContext && <p className="mt-1 text-sm leading-6 text-text-muted">{brief.evidenceContext}</p>}

      <p className="mt-2 text-sm uppercase tracking-wide text-text-muted">O que precisamos de você</p>
      <ul className="mt-1 space-y-0.5 text-sm leading-6 text-foreground">
        {brief.expectedContribution.map(tipo => <li key={tipo}>☐ {RADAR_SPECIALIST_CONTRIBUTION_LABEL[tipo]}</li>)}
      </ul>

      {brief.relatedSectionTitle && <p className="mt-2 text-sm leading-6 text-text-muted">
        Contexto no futuro artigo: {brief.relatedSectionTitle}
      </p>}
    </div>)}
    {/*
      * PREPARADO NÃO É ENVIADO — §15.
      *
      * A pauta chega aqui sozinha ao finalizar a pesquisa. Nada saiu para o
      * profissional: o envio é outra decisão, e ele ainda não existe.
      */}
    <p className="text-sm leading-6 text-text-muted" data-testid="radar-specialist-briefs-state">
      Pauta preparada pela investigação. Nenhum pedido foi enviado.
    </p>
  </div>;
}

/**
 * A PAUTA DE VÍDEOS — §16, e ela não obriga vídeo nenhum.
 *
 * O Radar não pesquisa YouTube aqui e não sugere vídeo para todo conceito. Ele
 * indica onde material audiovisual enriqueceria a narrativa — processo a
 * demonstrar, sinal a reconhecer, comparação a ver lado a lado — e o que
 * procurar nele.
 *
 * Isso também prepara o futuro: quando a engine de vídeo existir, ela saberá o
 * que procurar naquela transcrição, em vez de transcrever vinte minutos e
 * jogar texto no sistema.
 */
/**
 * A PAUTA COMO ELA FOI CONGELADA — VIDEOS 3.1.
 *
 * O tipo deixou de ser o `RadarVideoBrief` do blueprint vivo e passou a ser a
 * projeção única que a página monta a partir de
 * `frozenBundle.blueprint.videoBriefSnapshots`. Enquanto eram dois, o bloco de
 * cima descrevia a investigação atual e o de baixo a congelada — e ninguém via
 * a diferença até o primeiro congelamento.
 */
export type RadarVideoBriefReading = {
  briefId: string;
  topic: string;
  narrativePurpose: string;
  whatToLookFor: string[];
  relatedSectionTitle: string | null;
  evidenceNeeded: string;
  provenance: Array<{ source: string; detail: string }>;
};

export function RadarVideoBriefList({ briefs }: { briefs: readonly RadarVideoBriefReading[] }) {
  if (!briefs.length) {
    return <p className="text-sm leading-6 text-text-muted" data-testid="radar-video-briefs-empty">
      Esta investigação não encontrou necessidade que ganhe com material audiovisual.
    </p>;
  }

  return <div className="space-y-2.5" data-testid="radar-video-briefs">
    {briefs.map(brief => <div key={brief.briefId} className={bloco} data-testid="radar-video-brief">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">{brief.topic}</h4>
        <span className="text-xs text-text-muted">Nenhum material associado</span>
      </div>

      <p className="mt-2 text-sm uppercase tracking-wide text-text-muted">Por que um vídeo pode ajudar</p>
      <p className="text-sm leading-6 text-foreground">{brief.narrativePurpose}</p>

      <p className="mt-2 text-sm uppercase tracking-wide text-text-muted">O que procurar no material</p>
      <ul className="mt-1 space-y-0.5 text-sm leading-6 text-foreground">
        {brief.whatToLookFor.map(item => <li key={item}>— {item}</li>)}
      </ul>

      {brief.relatedSectionTitle && <p className="mt-2 text-sm leading-6 text-text-muted">
        Complementa o bloco: {brief.relatedSectionTitle}
      </p>}
      <p className="mt-1 text-xs leading-5 text-text-muted">{brief.evidenceNeeded}</p>
      {/* §2 · a proveniência congelada continua visível; ausência não vira linha vazia. */}
      {brief.provenance.length > 0 && <p className="mt-1 text-xs leading-5 text-text-muted" data-testid="radar-video-brief-provenance">
        Origem: {brief.provenance.map(origem => `${origem.source}${origem.detail ? ` (${origem.detail})` : ""}`).join(" · ")}
      </p>}
    </div>)}
  </div>;
}
