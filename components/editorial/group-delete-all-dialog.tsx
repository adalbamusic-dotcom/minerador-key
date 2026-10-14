"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { EditorialGroupTag } from "@/components/editorial/group-tag";
import {
  GROUP_DIALOG_BUTTON,
  GROUP_DIALOG_BUTTON_DANGER,
  GROUP_DIALOG_FIELD,
  GroupDialogFrame,
  GroupDialogNoticeLine,
  type GroupDialogNotice,
} from "@/components/editorial/group-dialog-frame";
import { applyGroupDeleteAll, previewGroupDeleteAll } from "@/components/editorial/group-manage-client";
import type { EditorialGroupColor, EditorialGroupSummary } from "@/lib/editorial/editorial-groups";
import {
  checkGroupDeleteAllConfirmation,
  GROUP_DELETE_ALL_ACTION_LABEL,
  GROUP_DELETE_ALL_URL_PARAM,
  type GroupDeleteAllPreview,
} from "@/lib/minerador/group-delete-all";
import type { GroupDeleteAllApplyResult } from "@/lib/minerador/group-delete-all-core";

/**
 * EXCLUIR TUDO DA COR X (F7; SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 6, D6/D7/D8). Aberto pelo "Gerenciar a cor" da etiqueta (só no Minerador)
 * ou pelo link `?excluir_tudo_da_cor=<cor>` vindo de outra área.
 *
 * 1. Área: só o Minerador executa; Arquiteto, Radar, Redator e Publicações
 *    aparecem com o motivo e os itens da cor (sem exclusão — D8; o Arquiteto não
 *    exclui keyword — F4).
 * 2. Prévia grátis (lida ao abrir): apagar de vez · lixeira de 24 h · ficam fora
 *    (com o motivo e o caminho) · Assuntos liberados · o plano depois · a cor no fim.
 * 3. Confirmação forte: o nome da cor e "apaga de vez" (quando há DELETE) e o
 *    nome de cada publicada incluída. O servidor confere a MESMA regra.
 * 4. Execução em blocos de até 100, recusa por bloco, releitura e histórico;
 *    o relatório diz o que saiu, o que ficou e se a cor ficou livre.
 *
 * Sem a migration M-E, o botão fica desabilitado com a explicação.
 */

/** O link do Minerador que abre este diálogo, a partir da rota atual (`/{brandRef}/…`). */
export function groupDeleteAllMineradorHref(pathname: string, color: EditorialGroupColor): string | null {
  const brandRef = pathname.split("/").filter(Boolean)[0];
  if (!brandRef || brandRef === "admin") return null;
  return `/${brandRef}/minerador?${GROUP_DELETE_ALL_URL_PARAM}=${encodeURIComponent(color)}`;
}

type Previa = { preview: GroupDeleteAllPreview; decisionHash: string };

function Lista({ titulo, quantidade, aberta = false, children, testId }: { titulo: string; quantidade: number; aberta?: boolean; children: ReactNode; testId: string }) {
  return (
    <details open={aberta} className="rounded-md border border-divider" data-group-delete-all-list={testId}>
      <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent">
        <span>{titulo}</span>
        <span className="tabular-nums text-text-muted">{quantidade}</span>
      </summary>
      <div className="max-h-64 overflow-y-auto border-t border-divider px-3 py-2">{children}</div>
    </details>
  );
}

export function EditorialGroupDeleteAllDialog({ brandId, group, onClose }: {
  brandId: string;
  group: Pick<EditorialGroupSummary, "id" | "name" | "color">;
  /** `colorFreed`: a execução terminou com a cor liberada (o diálogo de cima também fecha). */
  onClose: (saida?: { colorFreed: boolean }) => void;
}) {
  const titleId = useId();
  const corId = useId();
  const fraseId = useId();
  const [incluirPublicadas, setIncluirPublicadas] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [lendo, setLendo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<GroupDialogNotice>(null);
  const [cor, setCor] = useState("");
  const [frase, setFrase] = useState("");
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<GroupDeleteAllApplyResult | null>(null);
  const leitura = useRef(0);

  // A prévia é só leitura e grátis: lida ao abrir e a cada troca da marcação das publicadas.
  useEffect(() => {
    const minha = ++leitura.current;
    void previewGroupDeleteAll(brandId, group.id, incluirPublicadas).then(resposta => {
      if (minha !== leitura.current) return;
      setLendo(false);
      if (!resposta.ok) { setPrevia(null); setAviso({ tone: "danger", text: resposta.message }); return; }
      setPrevia({ preview: resposta.preview, decisionHash: resposta.decisionHash });
      setAviso(null);
    });
  }, [brandId, group.id, incluirPublicadas]);

  const preview = previa?.preview ?? null;
  const typed = { color: cor, phrase: frase, publishedNames: nomes };
  const conferida = preview ? checkGroupDeleteAllConfirmation(preview, typed) : null;
  const total = preview ? preview.totals.hard + preview.totals.recoverable : 0;
  const podeExecutar = Boolean(preview && preview.available && total > 0 && conferida?.ok && !busy && !resultado);
  const rotuloCor = preview?.group.colorLabel ?? group.color;

  const trocarPublicadas = (valor: boolean) => {
    setLendo(true);
    setNomes({});
    setIncluirPublicadas(valor);
  };

  const executar = async () => {
    if (!previa || !podeExecutar) return;
    setBusy(true);
    setAviso(null);
    try {
      const resposta = await applyGroupDeleteAll(brandId, group.id, { includePublished: incluirPublicadas, decisionHash: previa.decisionHash, typed });
      if (!resposta.ok) {
        if (resposta.preview && resposta.decisionHash) {
          // A cor mudou desde a prévia: nada foi excluído; a prévia nova pede a confirmação de novo.
          setPrevia({ preview: resposta.preview, decisionHash: resposta.decisionHash });
          setCor("");
          setFrase("");
          setNomes({});
        }
        setAviso({ tone: "danger", text: resposta.message });
        return;
      }
      setResultado(resposta.result);
      const r = resposta.result;
      setAviso({
        tone: r.complete ? "success" : "warning",
        text: r.complete
          ? `Feito e relido: ${r.hardDeletedIds.length} apagada(s) de vez, ${r.recoverableIds.length} na lixeira de 24 h.${r.color.freed ? ` A cor ${rotuloCor} está livre.` : ""}`
          : `Parte da operação não foi confirmada: ${r.hardDeletedIds.length} apagada(s) de vez e ${r.recoverableIds.length} na lixeira; veja o relatório. Para o que ficou, gere a prévia de novo.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const fechar = () => onClose(resultado ? { colorFreed: resultado.color.freed } : undefined);

  return (
    <GroupDialogFrame
      titleId={titleId}
      busy={busy}
      onClose={fechar}
      title={<><span>{GROUP_DELETE_ALL_ACTION_LABEL}</span><EditorialGroupTag name={group.name} color={group.color} /></>}
      subtitle="Minerador · decisão humana, sem custo. Nada é excluído antes da confirmação; o histórico do grupo registra tudo."
      footer={<>
        <button type="button" onClick={fechar} disabled={busy} className={GROUP_DIALOG_BUTTON}>{resultado ? "Fechar" : "Cancelar"}</button>
        {resultado ? null : (
          <button type="button" onClick={() => void executar()} disabled={!podeExecutar} className={GROUP_DIALOG_BUTTON_DANGER} data-group-delete-all-confirm title={preview && !preview.available ? preview.unavailableMessage ?? undefined : undefined}>
            {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Excluindo em blocos…" : `Excluir tudo da cor ${rotuloCor} (${total})`}
          </button>
        )}
      </>}
    >
      <div className="space-y-4" data-group-delete-all={group.id}>
        <GroupDialogNoticeLine aviso={aviso} testId="group-delete-all-notice" />

        <section className="space-y-2" aria-labelledby={`${titleId}-area`}>
          <h3 id={`${titleId}-area`} className="text-sm font-semibold">Área</h3>
          <div role="radiogroup" aria-label="Área da exclusão" className="space-y-1">
            {(preview?.areas ?? []).map(area => (
              <div key={area.area} className={`rounded-md border px-3 py-2 ${area.executable ? "border-module-accent bg-selected" : "border-divider"}`} data-group-delete-all-area={area.area} data-executable={area.executable ? "sim" : "nao"}>
                <div className="flex items-center gap-2 text-sm">
                  <input type="radio" name={`${titleId}-area`} className="h-4 w-4" checked={area.executable} disabled={!area.executable} readOnly aria-label={area.label} />
                  <span className="font-medium">{area.label}</span>
                  <span className="text-text-muted">{area.executable ? "executa (keywords da cor)" : `fica fora${area.items.length ? ` · ${area.items.length} item(ns) da cor` : ""}`}</span>
                </div>
                {area.reason ? <p className="mt-1 text-sm text-text-muted">{area.reason}</p> : null}
                {area.items.length ? <p className="mt-1 break-words text-sm text-text-muted">{area.items.slice(0, 8).map(item => item.label).join(" · ")}{area.items.length > 8 ? ` · e mais ${area.items.length - 8}` : ""}</p> : null}
              </div>
            ))}
          </div>
        </section>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={incluirPublicadas} disabled={busy || Boolean(resultado) || !preview || preview.publishedInColor.length === 0} onChange={event => trocarPublicadas(event.target.checked)} data-group-delete-all-include-published />
          <span>Incluir publicadas na lixeira de 24 h{preview ? ` (${preview.publishedInColor.length} publicada(s) nesta cor)` : ""}. Cada uma pede o nome digitado; fica restaurável por 24 h e prende a cor até a purga.</span>
        </label>

        {lendo && !preview ? <p className="flex items-center gap-2 text-sm text-text-muted" role="status"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Lendo a prévia (grátis)…</p> : null}

        {preview ? <>
          {!preview.available ? (
            <p className="rounded-md border border-warning/40 p-3 text-sm leading-5 text-warning" role="status" data-group-delete-all-unavailable>{preview.unavailableMessage}</p>
          ) : null}

          <p className="text-sm" data-group-delete-all-totals>
            <strong className="font-semibold">{preview.totals.hard}</strong> apagada(s) de vez · <strong className="font-semibold">{preview.totals.recoverable}</strong> na lixeira de 24 h · <strong className="font-semibold">{preview.totals.out}</strong> ficam fora · {preview.totals.blocks} bloco(s) de até 100
            {lendo ? <span className="text-text-muted"> · relendo…</span> : null}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-5" data-group-delete-all-effects>{preview.effects.map(efeito => <li key={efeito}>{efeito}</li>)}</ul>

          {preview.hard.length ? (
            <Lista titulo="Apagar de vez (não publicadas)" quantidade={preview.hard.length} testId="hard">
              <ul className="space-y-1 text-sm">{preview.hard.map(item => <li key={item.id} className="break-words text-keyword">{item.keyword}</li>)}</ul>
            </Lista>
          ) : null}

          {preview.recoverable.length ? (
            <Lista titulo="Lixeira de 24 h (publicadas) · digite o nome de cada uma" quantidade={preview.recoverable.length} aberta testId="recoverable">
              <ul className="space-y-2">
                {preview.recoverable.map(item => (
                  <li key={item.id} className="space-y-1">
                    <label htmlFor={`${titleId}-pub-${item.id}`} className="block text-sm text-text-muted">Digite <strong className="break-words font-semibold text-keyword">{item.keyword}</strong></label>
                    <input id={`${titleId}-pub-${item.id}`} value={nomes[item.id] ?? ""} disabled={busy || Boolean(resultado)} autoComplete="off" spellCheck={false} onChange={event => setNomes(atual => ({ ...atual, [item.id]: event.target.value }))} className={GROUP_DIALOG_FIELD} data-group-delete-all-published-name={item.id} />
                  </li>
                ))}
              </ul>
            </Lista>
          ) : null}

          {preview.out.length ? (
            <Lista titulo="Ficam fora (com o motivo)" quantidade={preview.out.length} aberta={preview.out.length <= 10} testId="out">
              <ul className="space-y-2">
                {preview.out.map(item => (
                  <li key={item.id} className="text-sm" data-group-delete-all-out={item.reason}>
                    <span className="break-words font-medium text-keyword">{item.keyword}</span>
                    <span className="block text-text-muted">{item.message}</span>
                    {item.path ? <span className="block text-text-muted">Caminho: {item.path}</span> : null}
                  </li>
                ))}
              </ul>
            </Lista>
          ) : null}

          {preview.releasedSubjects.length ? (
            <Lista titulo="Assuntos liberados (na mesma transação da exclusão)" quantidade={preview.releasedSubjects.length} testId="released">
              <ul className="space-y-1 text-sm">
                {preview.releasedSubjects.map(item => (
                  <li key={item.keywordId} className="break-words">{item.order ? <span className="tabular-nums text-text-muted">{item.order}º · </span> : null}{item.role ? <span className="text-text-muted">{item.role} · </span> : null}{item.title}</li>
                ))}
              </ul>
            </Lista>
          ) : null}

          {resultado ? null : preview.blocks.length ? (
            <section className="space-y-3 rounded-md border border-danger/30 p-3" aria-labelledby={`${titleId}-confirmar`}>
              <h3 id={`${titleId}-confirmar`} className="text-sm font-semibold text-danger">Confirmação</h3>
              <div className="space-y-1">
                <label htmlFor={corId} className="block text-sm text-text-muted">Digite o nome da cor: <strong className="font-semibold text-foreground">{preview.confirmation.colorWord}</strong></label>
                <input id={corId} value={cor} disabled={busy} autoComplete="off" spellCheck={false} onChange={event => setCor(event.target.value)} className={GROUP_DIALOG_FIELD} data-group-delete-all-typed-color />
              </div>
              {preview.confirmation.hardPhrase ? (
                <div className="space-y-1">
                  <label htmlFor={fraseId} className="block text-sm text-text-muted">Há exclusão definitiva. Digite: <strong className="font-semibold text-foreground">{preview.confirmation.hardPhrase}</strong></label>
                  <input id={fraseId} value={frase} disabled={busy} autoComplete="off" spellCheck={false} onChange={event => setFrase(event.target.value)} className={GROUP_DIALOG_FIELD} data-group-delete-all-typed-phrase />
                </div>
              ) : null}
              {conferida && !conferida.ok && (cor || frase) ? <p className="text-sm text-text-muted" role="status">Falta: {conferida.missing.join(", ")}.</p> : null}
            </section>
          ) : (
            <p className="text-sm text-text-muted" data-group-delete-all-nothing>Nada desta cor pode ser excluído agora: tudo fica fora (veja os motivos).</p>
          )}
        </> : null}

        {resultado ? (
          <section className="space-y-2" data-group-delete-all-result>
            <h3 className="text-sm font-semibold">Relatório</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-5">
              <li>{resultado.hardDeletedIds.length} apagada(s) de vez; {resultado.recoverableIds.length} na lixeira de 24 h (restauráveis no Minerador).</li>
              {resultado.blocks.filter(bloco => bloco.outcome !== "done").map((bloco, indice) => <li key={`recusa-${indice}`} className="text-warning">Bloco de {bloco.ids.length} recusado: {bloco.message}</li>)}
              {resultado.out.length ? <li>{resultado.out.length} ficaram fora já na prévia (com o motivo).</li> : null}
              {resultado.plan && resultado.plan.ok ? <li>{resultado.plan.outcome === "cleared" ? `Plano do Silo limpo (v${resultado.plan.planVersion}).` : resultado.plan.outcome === "reduced" ? `Plano do Silo na v${resultado.plan.planVersion}, com ${resultado.plan.remaining} artigo(s).` : "Plano do Silo sem mudança."}</li> : null}
              <li>{resultado.color.freed ? `A cor ${rotuloCor} está livre (grupo arquivado${resultado.color.siloUnlinked ? ", Silo não consolidado desligado" : ""}); ao usá-la de novo, o grupo volta sem plano.` : `A cor ${rotuloCor} continua ocupada${resultado.color.keptBecause.length ? `: ${resultado.color.keptBecause.join(" ")}` : "."}`}</li>
              <li>{resultado.readback.confirmed ? "Tudo relido no banco." : `Releitura com divergência: ${resultado.readback.divergences.slice(0, 3).join(" ")}`}</li>
              <li>{resultado.historyRecorded ? "Registrado no histórico do grupo." : "O registro no histórico do grupo não foi gravado."}</li>
              {resultado.notices.map(nota => <li key={nota} className="text-warning">{nota}</li>)}
            </ul>
          </section>
        ) : null}
      </div>
    </GroupDialogFrame>
  );
}
