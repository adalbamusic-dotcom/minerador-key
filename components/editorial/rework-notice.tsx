"use client";

/**
 * O AVISO DA GUARDA DE RETRABALHO (F5) — SDD 2026-10-12 §10.4.
 *
 * Fica ACIMA do botão da operação e diz, antes do clique, o que o servidor já
 * sabe: "Já feito com os mesmos insumos em 12/10 às 17:30 — …", "A mesma
 * recusa aconteceu em 12/10 às 17:41: …" ou "Isto contradiz o plano
 * declarado: …". Um componente só para todas as operações do Arquiteto
 * (sistema visual: token `warning`, texto ≥ 14px, `InfoHint` para o que mudar).
 *
 * "Refazer mesmo assim" (D11) só aparece quando o servidor aceita override
 * (`canOverride`): nunca para a contradição do plano nem caminho paralelo. O
 * motivo é obrigatório; quem decide é o servidor (409 sem motivo).
 */
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { InfoHint } from "@/components/info-hint";
import { REWORK_OVERRIDE_REASON_MIN, type ReworkView } from "@/lib/editorial/rework-guard";

const DEFAULT_BUTTON = "inline-flex min-h-9 items-center gap-1.5 rounded border border-warning/50 px-3 text-sm font-semibold text-warning transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/50 disabled:opacity-40";

const TITLES: Record<ReworkView["verdict"], string> = {
  fresh: "",
  same_inputs_reuse: "Já feito com os mesmos insumos",
  same_refusal: "A mesma recusa já aconteceu",
  contradicts_declared: "Contradiz o plano declarado",
  parallel_path: "Fora do caminho canônico",
};

export type ReworkNoticeProps = {
  rework: ReworkView | null | undefined;
  /** "Refazer mesmo assim": recebe o motivo dito. Sem ele, o botão não aparece. */
  onOverride?: (reason: string) => void;
  /** "Abrir resultado" do registro anterior, quando a tela sabe abrir. */
  onOpenResult?: () => void;
  /** O que mudar para a recusa não se repetir (InfoHint). */
  changeHint?: string;
  busy?: boolean;
  buttonClassName?: string;
  testId?: string;
};

export function ReworkNotice({ rework, onOverride, onOpenResult, changeHint, busy = false, buttonClassName = DEFAULT_BUTTON, testId = "rework-notice" }: ReworkNoticeProps) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  if (!rework || rework.verdict === "fresh") return null;
  const motivo = reason.trim();
  const podeRefazer = Boolean(onOverride) && rework.canOverride && (rework.verdict === "same_inputs_reuse" || rework.verdict === "same_refusal");
  const dica = changeHint ?? (rework.verdict === "same_refusal"
    ? "Mude um insumo (o que a recusa pede) e a operação roda de novo sozinha. Repetir sem mudar nada repetiria a mesma recusa."
    : rework.verdict === "contradicts_declared"
      ? "A principal, o papel e a lista do Assunto vêm do plano declarado no Minerador. Para mudar, mude o plano lá: aqui não há “refazer mesmo assim”."
      : rework.verdict === "parallel_path"
        ? "Dentro de um grupo com plano declarado, artigo novo nasce do Assunto do plano (o caminho de sempre)."
        : "Repetir com os mesmos insumos só com um motivo: o servidor recusa sem ele.");
  return (
    <div role="status" className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm leading-6" data-testid={testId} data-rework-verdict={rework.verdict}>
      <p className="flex items-center gap-1.5 font-semibold text-warning">
        <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        {TITLES[rework.verdict]}
        <InfoHint title="O que fazer" description={dica} />
      </p>
      <p className="mt-1 text-foreground">{rework.message}</p>
      {(onOpenResult || podeRefazer) && !asking && (
        <div className="mt-2 flex flex-wrap gap-2">
          {onOpenResult && <button type="button" className={buttonClassName} disabled={busy} onClick={onOpenResult}>Abrir resultado</button>}
          {podeRefazer && <button type="button" className={buttonClassName} disabled={busy} onClick={() => setAsking(true)}>Refazer mesmo assim</button>}
        </div>
      )}
      {podeRefazer && asking && (
        <div className="mt-2 grid gap-2">
          <label className="grid gap-1 text-sm text-foreground">
            Motivo para refazer com os mesmos insumos (obrigatório)
            <input
              type="text"
              value={reason}
              maxLength={500}
              onChange={event => setReason(event.target.value)}
              className="min-h-9 rounded-md border border-divider bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
              data-testid={`${testId}-reason`}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClassName} disabled={busy} onClick={() => { setAsking(false); setReason(""); }}>Cancelar</button>
            <button type="button" className={buttonClassName} disabled={busy || motivo.length < REWORK_OVERRIDE_REASON_MIN} onClick={() => { onOverride!(motivo); setAsking(false); setReason(""); }}>Refazer com este motivo</button>
          </div>
        </div>
      )}
    </div>
  );
}
