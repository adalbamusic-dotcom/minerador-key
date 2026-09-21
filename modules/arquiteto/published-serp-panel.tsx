"use client";

import React from "react";
import type { PublishedKeywordReadout } from "@/lib/arquiteto/published-keyword-readout";

/**
 * O QUE A SERP DIZ SOBRE ESTE GRUPO PUBLICADO.
 *
 * Painel de LEITURA. Ele não tem "aplicar": trocar a primária de uma página no
 * ar é decisão humana e tem porta própria. Aqui só aparece a evidência — quais
 * secundárias a SERP sustenta, quais não, e se alguma delas qualifica para
 * substituir a primária.
 *
 * Coleta ausente é dita como ausente. Um painel vazio que parece conclusivo é
 * pior que um painel que admite não ter olhado.
 */
export function PublishedSerpPanel({
  label,
  readout,
  gaps,
  busy,
  disabledReason,
  onCollect,
}: {
  label: string;
  readout: PublishedKeywordReadout | null;
  gaps: readonly { keywordId: string; lens: string; reason: string }[];
  busy: boolean;
  /** Por que o botão não pode ser usado agora. `null` = pode. */
  disabledReason: string | null;
  onCollect: () => void;
}) {
  return (
    <section
      className="rounded-lg border border-divider bg-surface-subtle p-3"
      data-testid="architect-published-serp-panel"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">SERP das keywords · {label}</p>
        <button
          type="button"
          disabled={busy || Boolean(disabledReason)}
          title={disabledReason || undefined}
          onClick={onCollect}
          className="rounded border border-divider px-2 py-1 text-xs text-foreground disabled:opacity-50"
          data-testid="architect-collect-keyword-serp"
        >
          {busy ? "Coletando…" : readout ? "Recoletar nas 4 lentes" : "Coletar nas 4 lentes"}
        </button>
      </div>

      {disabledReason && <p className="mt-1 text-sm text-text-muted">{disabledReason}</p>}

      {!readout ? (
        <p className="mt-2 text-sm text-text-muted">
          Nenhuma coleta para este grupo ainda. Sem SERP, o reforço e a troca de primária seriam palpite.
        </p>
      ) : (
        <div className="mt-2 grid gap-2 text-sm leading-6 text-foreground">
          <p className="text-text-muted">
            {readout.note}
            {readout.lenses.length ? ` · lentes: ${readout.lenses.join(", ")}` : ""}
          </p>

          <section className="rounded border border-divider p-2" data-testid="architect-serp-affinities">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Afinidade com a primária</p>
            {readout.affinities.length ? (
              <ul className="mt-1 grid gap-1">
                {readout.affinities.map(item => (
                  <li key={item.keywordId}>
                    <span className={item.affinity.supportsGrouping ? "text-foreground" : "text-text-muted"}>
                      {item.affinity.supportsGrouping ? "sustenta" : "não sustenta"} · &quot;{item.keyword}&quot;
                    </span>
                    <span className="text-text-muted"> — {item.affinity.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-text-muted">Nenhuma secundária apresentada para este grupo.</p>
            )}
          </section>

          <section className="rounded border border-divider p-2" data-testid="architect-serp-reinforcement">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Reforço</p>
            <p className="mt-1">{readout.reinforcement.note}</p>
            {readout.reinforcement.admitted.length > 0 && (
              <p className="text-text-muted">
                Entram: {readout.reinforcement.admitted.map(item => item.keyword).join(", ")}.
              </p>
            )}
            {readout.reinforcement.refused.map(item => (
              <p key={item.keywordId} className="text-text-muted">
                Fora: &quot;{item.keyword}&quot; — {item.reason}
              </p>
            ))}
          </section>

          <section className="rounded border border-divider p-2" data-testid="architect-serp-substitution">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Primária</p>
            <p className="mt-1">{readout.substitution.note}</p>
            {/* Pendência é pendência: nenhuma troca acontece a partir deste painel. */}
            {readout.substitution.decision?.status === "pending" && (
              <p className="text-text-muted">
                Decisão pendente de confirmação humana: {readout.substitution.decision.reason}
              </p>
            )}
            {readout.substitution.blockers.map(blocker => (
              <p key={blocker} className="text-text-muted">Bloqueio: {blocker}</p>
            ))}
          </section>

          {(readout.coverage.questions.length > 0 || readout.coverage.formatsExclusiveToLens.length > 0) && (
            <section className="rounded border border-divider p-2" data-testid="architect-serp-coverage">
              <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Cobertura do universo</p>
              <p className="mt-1 text-text-muted">{readout.coverage.summary}</p>
              <ul className="mt-1 grid gap-1 text-text-muted">
                {readout.coverage.questions.slice(0, 8).map(question => <li key={question}>· {question}</li>)}
              </ul>
              {/* O que só uma lente entrega muda o que a página precisa ter. */}
              {readout.coverage.formatsExclusiveToLens.map(entry => (
                <p key={entry.lens} className="mt-1 text-text-muted">
                  Só em {entry.lens}: {entry.only.join(", ")}.
                </p>
              ))}
            </section>
          )}
        </div>
      )}

      {gaps.length > 0 && (
        <p className="mt-2 text-sm text-text-muted" data-testid="architect-serp-gaps">
          {gaps.length} lente(s) não responderam: {gaps.map(gap => gap.lens).join(", ")}. A leitura acima é parcial.
        </p>
      )}
    </section>
  );
}
