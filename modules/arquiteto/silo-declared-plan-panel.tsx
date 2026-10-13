"use client";

/**
 * ===== "APLICAR O PLANO DECLARADO AO SILO" — A TELA (2026-10-12) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §11 passo 7.
 * Aparece em cada Silo consolidado, na aba Silos. Dois passos, nesta ordem:
 * prévia do que muda (Pilar, suportes, ordem, nome, objetivo, slug) →
 * "Confirmar o plano no Silo". Quem decide recusas e o que muda é o servidor;
 * aqui só se desenha. A confirmação leva o `decisionHash` da prévia: o que a
 * pessoa viu é o que é gravado.
 *
 * Sucesso só depois da resposta do servidor, que relê o par antes de
 * responder. A mesa é recarregada pelo chamador (`onApplied`).
 */

import { useState } from "react";
import { ReworkNotice } from "@/components/editorial/rework-notice";
import type { ReworkView } from "@/lib/editorial/rework-guard";
import {
  SILO_DECLARED_PLAN_ACTION_LABEL,
  SILO_DECLARED_PLAN_CONFIRM_LABEL,
  SILO_DECLARED_PLAN_ROUTE,
} from "@/lib/arquiteto/silo-declared-plan-application";

type Preview = {
  state: "READY" | "UNCHANGED" | "WITHDRAW_THEN_APPLY";
  siloDnaVersionId?: string;
  decisionHash: string;
  changes?: string[];
  warnings?: string[];
  /** SDD acelerar 2026-10-13, item 10: os artigos fora do plano, com "retirar do Silo" marcado. */
  withdrawals?: Array<{ articleId: string; label: string; ok: boolean; reason: string | null }>;
  plan?: { changes: string[]; warnings: string[] } | null;
  planRefusal?: string | null;
  /** F5 — o aviso da guarda de retrabalho (ausente = nunca feito). */
  rework?: ReworkView;
};

type Props = {
  brandId: string;
  siloId: string;
  classNames: { button: string; primaryButton: string };
  notify: (type: "success" | "error" | "warning", message: string) => void;
  onApplied: () => void;
  /** Depois de aplicar: "Processar links de novo" neste Silo (troca para Links internos e roda o processamento). */
  onProcessLinks?: (siloId: string) => void;
};

async function post(body: Record<string, unknown>) {
  const response = await fetch(SILO_DECLARED_PLAN_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null) as { success?: boolean; data?: unknown; error?: string } | null;
  if (!response.ok || !json?.success) throw new Error(json?.error || "A aplicação do plano não respondeu de forma conclusiva; nada foi declarado.");
  return json.data as Record<string, unknown>;
}

export function SiloDeclaredPlanPanel({ brandId, siloId, classNames, notify, onApplied, onProcessLinks }: Props) {
  const [aberto, setAberto] = useState(false);
  const [previa, setPrevia] = useState<Preview | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [retirar, setRetirar] = useState<Set<string>>(new Set());
  const [aplicado, setAplicado] = useState(false);
  const foraDoPlano = previa?.withdrawals ?? [];
  const faltaRetirar = previa?.state === "WITHDRAW_THEN_APPLY" && (retirar.size < foraDoPlano.length || Boolean(previa.planRefusal));
  const mudancas = previa?.changes ?? previa?.plan?.changes ?? [];
  const avisosDaPrevia = previa?.warnings ?? previa?.plan?.warnings ?? [];

  const fechar = () => { setAberto(false); setPrevia(null); };

  const abrirPrevia = async () => {
    setAberto(true);
    setPrevia(null);
    setOcupado(true);
    try {
      const lida = await post({ brandId, siloId, mode: "preview", withdrawNonPlan: true }) as unknown as Preview;
      setPrevia(lida);
      setRetirar(new Set((lida.withdrawals ?? []).map(item => item.articleId)));
      setAplicado(false);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "A prévia do plano no Silo falhou.");
      setAberto(false);
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async () => {
    if (!previa || (previa.state !== "READY" && previa.state !== "WITHDRAW_THEN_APPLY") || faltaRetirar) return;
    setOcupado(true);
    try {
      const data = await post(previa.state === "WITHDRAW_THEN_APPLY"
        ? { brandId, siloId, mode: "apply", withdrawNonPlan: true, withdrawArticleIds: [...retirar], decisionHash: previa.decisionHash }
        : { brandId, siloId, mode: "apply", withdrawNonPlan: true, expectedSiloDnaVersionId: previa.siloDnaVersionId, decisionHash: previa.decisionHash });
      if (data.state === "STOPPED") {
        notify("warning", String(data.message ?? "A sequência parou; o plano não foi aplicado."));
        fechar();
        onApplied();
        return;
      }
      const avisos = Array.isArray(data.warnings) ? data.warnings as string[] : [];
      const vinculo = data.groupLink && typeof data.groupLink === "object" ? String((data.groupLink as { message?: unknown }).message ?? "") : "";
      notify("success", `O Silo segue o plano declarado, confirmado pela releitura (SiloDNA e SiloPage em versão nova).${vinculo ? ` ${vinculo}` : ""}${avisos.length ? ` ${avisos.join(" ")}` : ""}`);
      fechar();
      setAplicado(true);
      onApplied();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "A aplicação do plano falhou; nada foi declarado.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="mt-2 space-y-2" data-testid="silo-declared-plan">
      <button type="button" className={classNames.button} disabled={ocupado} onClick={() => void abrirPrevia()} aria-expanded={aberto}>
        {SILO_DECLARED_PLAN_ACTION_LABEL}
      </button>
      {aplicado && onProcessLinks && (
        <button type="button" className={classNames.button} data-testid="silo-declared-plan-process-links" onClick={() => { setAplicado(false); onProcessLinks(siloId); }}>
          Processar links de novo
        </button>
      )}
      {aberto && (
        <div className="rounded-md border border-module-accent/40 bg-module-accent/5 p-3" role="region" aria-label={SILO_DECLARED_PLAN_ACTION_LABEL}>
          {!previa ? (
            <p className="text-sm text-text-muted">Montando a prévia do plano no Silo…</p>
          ) : <>
            <p className="text-sm font-semibold text-foreground">Prévia · {SILO_DECLARED_PLAN_ACTION_LABEL}</p>
            {foraDoPlano.length > 0 && (
              <div className="mt-2" data-testid="silo-declared-plan-withdrawals">
                <p className="text-sm font-semibold text-foreground">Fora do plano · retirar do Silo (ArticleDNA preservado; as keywords voltam a “não agrupadas” do grupo)</p>
                <ul className="mt-1 space-y-1">
                  {foraDoPlano.map(item => (
                    <li key={item.articleId} className="flex items-start gap-2 text-sm leading-6">
                      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" aria-label={`Retirar ${item.label} do Silo`} checked={retirar.has(item.articleId)} disabled={ocupado || !item.ok}
                        onChange={event => setRetirar(current => { const next = new Set(current); if (event.target.checked) next.add(item.articleId); else next.delete(item.articleId); return next; })} />
                      <span className="text-foreground">{item.label}{!item.ok && item.reason ? <span className="text-warning"> · não pode sair: {item.reason}</span> : null}</span>
                    </li>
                  ))}
                </ul>
                {retirar.size < foraDoPlano.length && <p className="mt-1 text-sm text-warning">Com um artigo fora do plano desmarcado, o plano não pode ser aplicado (a recusa de sempre).</p>}
                {previa.planRefusal && <p className="mt-1 text-sm text-warning">{previa.planRefusal}</p>}
                <p className="mt-2 text-sm font-semibold text-foreground">Depois da retirada, o plano no Silo</p>
              </div>
            )}
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-text-muted">
              {mudancas.map(change => <li key={change}>{change}</li>)}
            </ul>
            {avisosDaPrevia.length > 0 && <p className="mt-2 text-sm leading-6 text-warning">{avisosDaPrevia.join(" ")}</p>}
            {/* F5 — a guarda de retrabalho, acima dos botões. */}
            <ReworkNotice rework={previa.rework} testId="silo-declared-plan-rework" />
            <div className="mt-3 flex flex-wrap gap-2">
              {(previa.state === "READY" || previa.state === "WITHDRAW_THEN_APPLY") && (
                <button type="button" className={classNames.primaryButton} disabled={ocupado || faltaRetirar} onClick={() => void confirmar()}>
                  {ocupado ? "Gravando…" : previa.state === "WITHDRAW_THEN_APPLY" ? `Retirar ${retirar.size} e confirmar o plano no Silo` : SILO_DECLARED_PLAN_CONFIRM_LABEL}
                </button>
              )}
              <button type="button" className={classNames.button} disabled={ocupado} onClick={fechar}>{previa.state === "UNCHANGED" ? "Fechar" : "Cancelar"}</button>
            </div>
          </>}
        </div>
      )}
    </div>
  );
}
