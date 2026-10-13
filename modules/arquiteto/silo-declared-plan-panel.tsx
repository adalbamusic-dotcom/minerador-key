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
  state: "READY" | "UNCHANGED";
  siloDnaVersionId: string;
  decisionHash: string;
  changes: string[];
  warnings: string[];
  /** F5 — o aviso da guarda de retrabalho (ausente = nunca feito). */
  rework?: ReworkView;
};

type Props = {
  brandId: string;
  siloId: string;
  classNames: { button: string; primaryButton: string };
  notify: (type: "success" | "error" | "warning", message: string) => void;
  onApplied: () => void;
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

export function SiloDeclaredPlanPanel({ brandId, siloId, classNames, notify, onApplied }: Props) {
  const [aberto, setAberto] = useState(false);
  const [previa, setPrevia] = useState<Preview | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const fechar = () => { setAberto(false); setPrevia(null); };

  const abrirPrevia = async () => {
    setAberto(true);
    setPrevia(null);
    setOcupado(true);
    try {
      setPrevia(await post({ brandId, siloId, mode: "preview" }) as unknown as Preview);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "A prévia do plano no Silo falhou.");
      setAberto(false);
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async () => {
    if (!previa || previa.state !== "READY") return;
    setOcupado(true);
    try {
      const data = await post({ brandId, siloId, mode: "apply", expectedSiloDnaVersionId: previa.siloDnaVersionId, decisionHash: previa.decisionHash });
      const avisos = Array.isArray(data.warnings) ? data.warnings as string[] : [];
      const vinculo = data.groupLink && typeof data.groupLink === "object" ? String((data.groupLink as { message?: unknown }).message ?? "") : "";
      notify("success", `O Silo segue o plano declarado, confirmado pela releitura (SiloDNA e SiloPage em versão nova).${vinculo ? ` ${vinculo}` : ""}${avisos.length ? ` ${avisos.join(" ")}` : ""}`);
      fechar();
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
      {aberto && (
        <div className="rounded-md border border-module-accent/40 bg-module-accent/5 p-3" role="region" aria-label={SILO_DECLARED_PLAN_ACTION_LABEL}>
          {!previa ? (
            <p className="text-sm text-text-muted">Montando a prévia do plano no Silo…</p>
          ) : <>
            <p className="text-sm font-semibold text-foreground">Prévia · {SILO_DECLARED_PLAN_ACTION_LABEL}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-text-muted">
              {previa.changes.map(change => <li key={change}>{change}</li>)}
            </ul>
            {previa.warnings.length > 0 && <p className="mt-2 text-sm leading-6 text-warning">{previa.warnings.join(" ")}</p>}
            {/* F5 — a guarda de retrabalho, acima dos botões. */}
            <ReworkNotice rework={previa.rework} testId="silo-declared-plan-rework" />
            <div className="mt-3 flex flex-wrap gap-2">
              {previa.state === "READY" && (
                <button type="button" className={classNames.primaryButton} disabled={ocupado} onClick={() => void confirmar()}>
                  {ocupado ? "Gravando…" : SILO_DECLARED_PLAN_CONFIRM_LABEL}
                </button>
              )}
              <button type="button" className={classNames.button} disabled={ocupado} onClick={fechar}>{previa.state === "READY" ? "Cancelar" : "Fechar"}</button>
            </div>
          </>}
        </div>
      )}
    </div>
  );
}
