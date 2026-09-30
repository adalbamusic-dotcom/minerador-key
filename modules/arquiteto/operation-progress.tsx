"use client";
import { useEffect, useState } from "react";

/**
 * PROGRESSO DE ETAPA LONGA, NO PADRÃO DA PLATAFORMA.
 *
 * Texto, contador e barra. Com total conhecido, a barra enche; sem total, ela
 * pulsa e o tempo decorrido mostra que está andando. Mesmo visual do progresso
 * de "Melhorar publicados" — agora compartilhado, para toda etapa longa do
 * Arquiteto dizer a mesma coisa do mesmo jeito (pedido do dono, 2026-09-30).
 */
export const elapsedText = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};

export function OperationProgress({ label, startedAt, now, done = null, total = null, unit = "", note = null, testId = "architect-operation-progress" }: {
  label: string;
  /** Início da etapa; ausente = o momento em que a barra apareceu. */
  startedAt?: number;
  /** Relógio externo; sem ele, o componente conta sozinho enquanto está na tela. */
  now?: number;
  done?: number | null;
  total?: number | null;
  unit?: string;
  note?: string | null;
  testId?: string;
}) {
  const [montado] = useState(() => Date.now());
  const inicio = startedAt ?? montado;
  const [relogio, setRelogio] = useState(() => Date.now());
  useEffect(() => {
    if (typeof now === "number") return;
    const timer = setInterval(() => setRelogio(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [now]);
  const agora = typeof now === "number" ? now : relogio;
  const known = typeof done === "number" && typeof total === "number" && total > 0;
  const percent = known ? Math.min(100, Math.round((done! / total!) * 100)) : null;
  return <div className="mt-2" data-testid={testId}>
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="font-semibold text-module-accent">{label}…</span>
      <span className="tabular-nums text-foreground">{percent === null ? elapsedText(agora - inicio) : `${percent}%`}</span>
    </div>
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={known ? `${done} de ${total} ${unit}` : "em andamento"} className="mt-1 h-1.5 overflow-hidden rounded-full bg-divider">
      <div className={`h-full rounded-full bg-module-accent transition-[width] duration-300 ${percent === null ? "w-1/3 motion-safe:animate-pulse motion-reduce:animate-none" : ""}`} style={percent === null ? undefined : { width: `${Math.max(percent, 3)}%` }} />
    </div>
    <p className="mt-1 text-sm tabular-nums text-text-muted">
      {known ? `${done} de ${total} ${unit}` : "Em andamento"} · {elapsedText(agora - inicio)}{note ? ` · ${note}` : ""}
    </p>
  </div>;
}
