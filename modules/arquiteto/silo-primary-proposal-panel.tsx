"use client";

import React from "react";
import type { SiloPrimarySerpProposal, SiloPrimarySerpProposalState } from "@/lib/arquiteto/silo-primary-keyword";

/**
 * A PRIMÁRIA DO SILO PELA SERP — PROPOSTA, NUNCA APLICADA (adendo das 4 lentes, A9).
 *
 * Origem 1, lista nova: a SERP das quatro lentes compara as candidatas entre
 * si e propõe quem lidera. O painel mostra a proposta, a evidência e o que a
 * precedência permite. A primária só é gravada quando a pessoa aceita, com um
 * segundo passo que diz o antes e o depois; primária humana ou publicada nunca
 * é trocada por aqui — a discordância aparece, e só.
 */

const ESTADO: Record<SiloPrimarySerpProposalState, { label: string; tone: string }> = {
  PROPOSED: { label: "Proposta pendente de decisão humana", tone: "text-pending" },
  DISSENT_ONLY: { label: "A SERP discorda da primária atual", tone: "text-pending" },
  CONCURS: { label: "A SERP confirma a primária atual", tone: "text-foreground" },
  REFUSED: { label: "Nenhuma candidata forte", tone: "text-text-muted" },
  NO_EVIDENCE: { label: "Sem SERP das candidatas", tone: "text-text-muted" },
  OUT_OF_ORIGIN: { label: "Silo fora da lista nova: a SERP só informa", tone: "text-text-muted" },
};

const ORIGEM: Record<string, string> = {
  serp: "eleita pela SERP",
  published_declaration: "declarada pela página publicada",
  human: "decisão humana",
};

const BLOQUEIO: Record<string, string> = {
  HUMAN_PRIMARY_PREVAILS: "A decisão humana registrada prevalece sobre a SERP.",
  PUBLISHED_PRIMARY_PREVAILS: "A primária publicada prevalece: a SERP não troca a primária de uma página no ar.",
  PRIMARY_POLICY_LOCKED: "Primária publicada travada no Minerador.",
  SUBSTITUTION_VOLUME_NOT_MET: "O volume não supera a primária publicada com a folga exigida.",
  SUBSTITUTION_VOLUME_MISSING: "Sem o volume das duas keywords não há comparação com a primária publicada.",
  PUBLISHED_SILO_WITHOUT_DECLARATION: "Silo com página publicada: a primária vem da declaração publicada, não da SERP.",
  EXISTING_SILO_NOT_LIST_ORIGIN: "Silo que já existe no acervo: a eleição pela SERP vale só para lista nova.",
  TERRITORY_ORIGIN_UNKNOWN: "Não se sabe se o Silo está publicado: nada pode ser aceito por aqui.",
};

export function SiloPrimaryProposalPanel({
  proposal,
  busy,
  buttonClassName,
  primaryButtonClassName,
  onAccept,
}: {
  proposal: SiloPrimarySerpProposal;
  busy: boolean;
  buttonClassName: string;
  primaryButtonClassName: string;
  onAccept: () => void;
}) {
  const [confirmando, setConfirmando] = React.useState(false);
  const estado = ESTADO[proposal.state];
  const bloqueiosLegiveis = proposal.state === "REFUSED"
    ? proposal.blockers
    : proposal.blockers.map(codigo => BLOQUEIO[codigo]).filter(Boolean);

  return (
    <section className="rounded-lg border border-divider bg-surface-subtle p-3" data-testid="architect-silo-primary-proposal">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Primária do Silo · proposta da SERP</p>
        <span className={`text-sm ${estado.tone}`} data-testid="architect-silo-primary-proposal-state">{estado.label}</span>
      </div>

      <p className="mt-1 text-sm leading-6 text-text-muted" data-testid="architect-silo-primary-proposal-lenses">{proposal.summary}</p>

      {proposal.current && (
        <p className="mt-1 text-sm leading-6 text-text-muted">
          Atual: <span className="text-keyword">{proposal.current.label}</span> · {ORIGEM[proposal.current.electedBy] || proposal.current.electedBy}
        </p>
      )}
      {proposal.proposed && proposal.state !== "CONCURS" && (
        <p className="mt-1 text-sm leading-6 text-text-muted">
          {proposal.decision ? "Proposta" : "A SERP aponta"}: <span className="text-keyword">{proposal.proposed.label}</span>
          {" · "}{proposal.proposed.evidence.competitorOverlap} domínio(s) do universo · nota {proposal.proposed.evidence.score}
        </p>
      )}

      <p className="mt-1 text-sm leading-6 text-foreground">{proposal.reason}</p>

      {bloqueiosLegiveis.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-sm leading-6 text-text-muted" data-testid="architect-silo-primary-proposal-blockers">
          {bloqueiosLegiveis.map(bloqueio => <li key={bloqueio}>· {bloqueio}</li>)}
        </ul>
      )}

      {proposal.ranking.length > 1 && (
        <ul className="mt-1 space-y-0.5 text-sm leading-6 text-text-muted" data-testid="architect-silo-primary-proposal-candidates">
          {proposal.ranking.slice(0, 6).map(candidata => (
            <li key={candidata.keywordId}>
              · <span className="text-keyword">{candidata.label}</span> · nota {candidata.score} · {candidata.devicesAgreeing}/{candidata.devicesObserved} lente(s) · {candidata.strong ? "forte" : "fraca"}
            </li>
          ))}
        </ul>
      )}

      {proposal.decision?.status === "pending" && (
        <p className="mt-1 text-sm leading-6 text-pending" data-testid="architect-silo-primary-proposal-pending">
          Nada foi gravado: a SERP propõe e a decisão é sua.
        </p>
      )}

      {proposal.canAccept && proposal.proposed && !confirmando && (
        <div className="mt-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmando(true)}
            className={primaryButtonClassName}
            data-testid="architect-silo-primary-accept"
          >
            Aceitar como primária do Silo
          </button>
        </div>
      )}

      {confirmando && proposal.proposed && (
        <div className="mt-2 rounded border border-module-accent/40 bg-surface p-2" data-testid="architect-silo-primary-accept-impact">
          <p className="text-sm leading-6 text-foreground">
            Antes: {proposal.current ? <span className="text-keyword">{proposal.current.label}</span> : "sem primária"}
            {" → "}Depois: <span className="text-keyword">{proposal.proposed.label}</span>, eleita pela SERP e aceita por você.
          </p>
          <p className="text-sm leading-6 text-text-muted">
            Grava só a primária do Silo, com o seu usuário e a hora. Não muda membership, slug, URL nem canonical.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => { setConfirmando(false); onAccept(); }}
              className={primaryButtonClassName}
              data-testid="architect-silo-primary-accept-confirm"
            >
              {busy ? "Registrando…" : "Registrar decisão"}
            </button>
            <button type="button" onClick={() => setConfirmando(false)} className={buttonClassName}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
