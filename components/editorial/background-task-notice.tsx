"use client";

import { CheckCircle2, Loader2, TriangleAlert, X } from "lucide-react";
import type { EditorialBackgroundTask } from "@/lib/editorial/background-tasks";

export function BackgroundTaskNotice({ tasks, onDismiss }: {
  tasks: EditorialBackgroundTask[];
  onDismiss: (id: string) => void;
}) {
  if (!tasks.length) return null;
  return <aside className="fixed bottom-14 right-4 z-[70] flex w-[min(390px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" aria-label="Tarefas do Arquiteto">
    {tasks.map(task => {
      const running = task.status === "queued" || task.status === "running";
      const failed = task.status === "failed";
      const percent = Math.round((task.current / Math.max(1, task.total)) * 100);
      return <div key={task.id} className={`rounded-md border bg-[#0b0c10] px-3 py-2.5 shadow-2xl ${failed ? "border-rose-900/70" : task.status === "completed" ? "border-emerald-900/70" : "border-context-accent/30"}`}>
        <div className="flex items-start gap-2">
          {running ? <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-context-accent"/>
            : failed ? <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400"/>
              : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400"/>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[10px] font-bold text-slate-200">{task.label}</p>
              {!running && <button type="button" onClick={() => onDismiss(task.id)} className="text-slate-600 hover:text-white" aria-label={`Fechar aviso de ${task.label}`}><X className="h-3 w-3"/></button>}
            </div>
            <p className={`mt-0.5 text-[9px] ${failed ? "text-rose-400" : task.status === "completed" ? "text-emerald-400" : "text-slate-500"}`}>{task.error || task.message}</p>
            {running && <div className="mt-2 h-1 overflow-hidden rounded bg-slate-900"><div className="h-full bg-context-accent transition-[width]" style={{ width: `${percent}%` }}/></div>}
          </div>
        </div>
      </div>;
    })}
  </aside>;
}
