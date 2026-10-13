"use client";

/**
 * ===== "ATUALIZAR O ASSUNTO DOS ARTIGOS" — A TELA (2026-10-13) =====
 *
 * SDD `docs/compartilhado/sdd-conversao-assunto-legado-2026-10-13.md` §7.
 * Depois que o Minerador converteu o Assunto do formato anterior (a keyword do
 * artigo passou a carregá-lo) e a reenviou, cada artigo cujo Assunto ainda
 * aponta para a linha-título mostra a troca. Dois passos: prévia → "Atualizar o
 * Assunto dos artigos". A confirmação leva o `decisionHash` da prévia: o que a
 * pessoa viu é o que é gravado (versão nova do ArticleDNA; as anteriores ficam
 * no histórico). Sucesso só depois da resposta relida do servidor.
 */

import { useState } from "react";

export const SUBJECT_CONVERSION_ROUTE = "/api/arquiteto/subject-conversion" as const;
export const SUBJECT_CONVERSION_ACTION_LABEL = "Conversões pendentes do Assunto" as const;
export const SUBJECT_CONVERSION_CONFIRM_LABEL = "Atualizar o Assunto dos artigos" as const;

type Item = { articleId: string; fromPhrase: string; toPhrase: string; versionNumber: number; state: "ready" | "blocked"; reason: string | null; changes: string[]; outcome?: string };
type Preview = { state: "PREVIEW"; items: Item[]; ready: number; blocked: number; decisionHash: string };

type Props = {
  brandId: string;
  classNames: { button: string; primaryButton: string };
  notify: (type: "success" | "error" | "warning", message: string) => void;
  onApplied: () => void;
};

async function post(body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; code: string | null; error: string }> {
  const response = await fetch(SUBJECT_CONVERSION_ROUTE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = response ? await response.json().catch(() => null) as { success?: boolean; data?: unknown; error?: string; code?: string } | null : null;
  if (!response || !response.ok || !json?.success) return { ok: false, code: json?.code ?? null, error: json?.error || "A atualização do Assunto não respondeu de forma conclusiva; nada foi gravado." };
  return { ok: true, data: json.data as Record<string, unknown> };
}

export function SubjectConversionPanel({ brandId, classNames, notify, onApplied }: Props) {
  const [aberto, setAberto] = useState(false);
  const [previa, setPrevia] = useState<Preview | null>(null);
  const [vazio, setVazio] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const fechar = () => { setAberto(false); setPrevia(null); setVazio(null); };

  const abrirPrevia = async () => {
    setAberto(true);
    setPrevia(null);
    setVazio(null);
    setOcupado(true);
    try {
      const answer = await post({ brandId, mode: "preview" });
      if (!answer.ok) {
        if (answer.code === "NOTHING_TO_CONVERT") setVazio(answer.error);
        else { notify("error", answer.error); setAberto(false); }
        return;
      }
      setPrevia(answer.data as unknown as Preview);
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async () => {
    if (!previa || !previa.ready) return;
    setOcupado(true);
    try {
      const answer = await post({ brandId, mode: "apply", articleIds: previa.items.filter(item => item.state === "ready").map(item => item.articleId), decisionHash: previa.decisionHash });
      if (!answer.ok) { notify("error", answer.error); return; }
      const converted = Number(answer.data.converted) || 0;
      const failed = Number(answer.data.failed) || 0;
      notify(failed ? "warning" : "success", `${converted} artigo(s) com o Assunto atualizado, confirmados pela releitura (versão nova do ArticleDNA; as anteriores ficam no histórico).${failed ? ` ${failed} falharam: abra a prévia de novo para ver o motivo.` : " Com o plano do grupo, use “Aplicar o plano declarado ao Silo” na aba Silos."}`);
      fechar();
      onApplied();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="subject-conversion">
      <button type="button" className={classNames.button} disabled={ocupado} onClick={() => void abrirPrevia()} aria-expanded={aberto}>
        {SUBJECT_CONVERSION_ACTION_LABEL}
      </button>
      {aberto && (
        <div className="rounded-md border border-module-accent/40 bg-module-accent/5 p-3" role="region" aria-label={SUBJECT_CONVERSION_ACTION_LABEL}>
          {vazio ? <p className="text-sm text-text-muted">{vazio}</p> : !previa ? (
            <p className="text-sm text-text-muted">Montando a prévia…</p>
          ) : <>
            <p className="text-sm font-semibold text-foreground">Prévia · {previa.ready} artigo(s) prontos{previa.blocked ? `, ${previa.blocked} com impedimento` : ""}</p>
            <ul className="mt-1 space-y-2 text-sm leading-6">
              {previa.items.map(item => (
                <li key={item.articleId} className={item.state === "ready" ? "text-foreground" : "text-warning"}>
                  <span className="font-medium">“{item.fromPhrase}”</span> → keyword <span className="text-keyword">{item.toPhrase}</span> · versão nova v{item.versionNumber + 1}
                  {item.state === "blocked" && item.reason ? <span className="block">{item.reason}</span> : null}
                  {item.changes.length ? <ul className="list-disc pl-5 text-text-muted">{item.changes.map(change => <li key={change}>{change}</li>)}</ul> : null}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-text-muted">A principal, o slug e as keywords do artigo não mudam; a linha-título fica arquivada em “Keywords não agrupadas” (não vai para a lixeira).</p>
          </>}
          <div className="mt-3 flex flex-wrap gap-2">
            {previa && previa.ready > 0 && (
              <button type="button" className={classNames.primaryButton} disabled={ocupado} onClick={() => void confirmar()}>
                {ocupado ? "Gravando…" : SUBJECT_CONVERSION_CONFIRM_LABEL}
              </button>
            )}
            <button type="button" className={classNames.button} disabled={ocupado} onClick={fechar}>{previa?.ready ? "Cancelar" : "Fechar"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
