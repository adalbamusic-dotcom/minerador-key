"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildCanonicalWorkflowWorkspaceItems,
  loadCanonicalArquitetoWorkspace,
  previewRemoteSiloUndo,
  undoRemoteSiloCandidate,
  type CanonicalWorkspaceSnapshot,
  type RemoteSiloUndoPreview,
} from "@/lib/arquiteto/canonical-workspace";
import { resolveTerritoryUndoOutcome, territoryUndoLabel, TERRITORY_UNDO_ACTION_LABEL } from "@/lib/arquiteto/territory-undo";
import { typedConfirmationMatches } from "@/lib/lifecycle/typed-confirmation";

/*
 * ===== "DESFAZER SILO" — O DIÁLOGO DE SEMPRE, FORA DO CORPO DA ABA =====
 *
 * O botão "Desfazer Silo" da aba Silos (`territorial-workspace-rows.tsx`) e o
 * lote "Desfazer os Silos sugeridos" abrem ESTE diálogo (antes ele morava no
 * corpo de `arquiteto-workspace.tsx`; saiu daqui para o clique ser testado na
 * tela, sem mudar a função). Um Silo por requisição, cada um com o seu lock;
 * UMA releitura no fim diz o desfecho de cada. Sucesso só para o que a
 * releitura confirmou.
 *
 * 2026-10-18 · O SILO INTEIRO (decisão do dono "Manter em duas etapas"):
 * consolidado, do plano declarado, com par ou artigos aprovados. O diálogo
 * pede a prévia ao servidor (nada pago, nada gravado), mostra o que sai — os
 * artigos (Pilar incluído), o par, o grafo, o território e o grupo — e só
 * habilita a confirmação com o nome do Silo digitado (`typedConfirmationMatches`,
 * a mesma regra do servidor). O lote nunca leva o Silo inteiro.
 */

export type SiloUndoReading = {
  label: string;
  keywordCount: number;
  refusals: string[];
  declaredPlan: { groupLabel: string; siloName: string } | null;
  /** O Silo sai inteiro (prévia + confirmação forte); `null` = Silo sugerido, o de sempre. */
  wholeSilo: string | null;
};

export type SiloUndoTarget = {
  ref: string;
  label: string;
  expectedLock: number;
  expectedMemberIds: string[];
  /** Só no Silo inteiro. */
  confirmation?: { decisionHash: string; typedName: string } | null;
  expectedGoneArticleIds?: string[];
  expectedGoneSiloIds?: string[];
};

export type SiloUndoRunResult = { tone: "success" | "warning" | "error"; message: string; snapshot: CanonicalWorkspaceSnapshot | null };

export type SiloUndoDeps = {
  preview?: typeof previewRemoteSiloUndo;
  undo?: typeof undoRemoteSiloCandidate;
  reload?: (brandId: string) => Promise<CanonicalWorkspaceSnapshot>;
};

const semRef = (texto: string, nome: string) => texto.replace(/territory:[0-9a-f-]{36}/gi, nome).trim();

/**
 * O lote (um ou vários Silos): grava cada um pelo PATCH canônico de sempre e
 * relê a mesa UMA vez. O desfecho vem da releitura (`resolveTerritoryUndoOutcome`).
 */
export async function runSiloUndo(input: {
  brandId: string;
  targets: readonly SiloUndoTarget[];
  onProgress?: (progress: { done: number; total: number }) => void;
  deps?: SiloUndoDeps;
}): Promise<SiloUndoRunResult> {
  const undo = input.deps?.undo ?? undoRemoteSiloCandidate;
  const reload = input.deps?.reload ?? ((brandId: string) => loadCanonicalArquitetoWorkspace(brandId));
  const recusas: string[] = [];
  const tentados: SiloUndoTarget[] = [];
  for (const [indice, alvo] of input.targets.entries()) {
    input.onProgress?.({ done: indice + 1, total: input.targets.length });
    tentados.push(alvo);
    try {
      await undo({ brandId: input.brandId, territoryRef: alvo.ref, expectedLock: alvo.expectedLock, confirmation: alvo.confirmation ?? null });
    } catch (error) {
      const bruto = error instanceof Error ? error.message : "";
      recusas.push(semRef(bruto, alvo.label) || `${alvo.label} não pôde ser desfeito.`);
    }
  }
  let canonical: CanonicalWorkspaceSnapshot;
  try {
    canonical = await reload(input.brandId);
  } catch (error) {
    return { tone: "error", message: `Não deu para conferir o resultado: ${error instanceof Error ? error.message : "falha na releitura"}. Recarregue antes de tentar de novo.`, snapshot: null };
  }
  const membrosRelidos = new Map<string, string[]>();
  const refs = new Set(tentados.map(alvo => alvo.ref));
  for (const entry of buildCanonicalWorkflowWorkspaceItems(canonical.workflowItems, canonical.keywords, input.brandId)) {
    const ref = (entry as Record<string, unknown>).territoryRef;
    if (typeof ref === "string" && refs.has(ref)) membrosRelidos.set(ref, [...(membrosRelidos.get(ref) || []), String((entry as Record<string, unknown>).id)]);
  }
  const artigosNaMesa = canonical.articleDnas.map(version => String(version.payload.articleId));
  const silosNaMesa = canonical.siloDnas.map(version => String(version.payload.siloId));
  const desfeitos: string[] = [];
  const pendentes: string[] = [];
  for (const alvo of tentados) {
    const relido = canonical.territories.find(item => item.territoryRef === alvo.ref);
    const nome = relido ? territoryUndoLabel(relido.territory) : alvo.label;
    const inteiro = Boolean(alvo.confirmation);
    const veredito = resolveTerritoryUndoOutcome({
      territoryRef: alvo.ref,
      readbackLifecycle: relido?.territory.lifecycleStatus ?? null,
      expectedMemberIds: alvo.expectedMemberIds,
      readbackMemberIds: membrosRelidos.get(alvo.ref) || [],
      ...(inteiro ? { expectedGoneArticleIds: alvo.expectedGoneArticleIds || [], readbackArticleIds: artigosNaMesa, expectedGoneSiloIds: alvo.expectedGoneSiloIds || [], readbackSiloIds: silosNaMesa } : {}),
    });
    if (veredito.outcome === "applied") {
      desfeitos.push(inteiro
        ? `${nome} (Silo inteiro: ${(alvo.expectedGoneArticleIds || []).length} artigo(s), o par e ${alvo.expectedMemberIds.length} keyword(s) em sem Silo)`
        : `${nome} (${alvo.expectedMemberIds.length} keyword(s) em sem Silo)`);
    } else if (veredito.outcome === "partial") {
      pendentes.push(veredito.remaining.length
        ? `${nome}: ficou pela metade (${veredito.remaining.length} keyword(s) ainda no Silo). Tente de novo.`
        : veredito.remainingArticles.length || veredito.remainingSilos.length
          ? `${nome}: ficou pela metade (${veredito.remainingArticles.length} artigo(s)${veredito.remainingSilos.length ? " e o par" : ""} ainda na mesa). Abra a prévia de novo.`
          : `${nome}: as keywords já saíram do Silo; falta marcar o Silo como desfeito. Tente de novo.`);
    }
  }
  const partes = [
    desfeitos.length ? `Silo(s) desfeito(s) e conferido(s) na releitura: ${desfeitos.join(" · ")}. Nada foi apagado.` : "",
    ...pendentes,
    ...recusas,
  ].filter(Boolean);
  return {
    tone: recusas.length || pendentes.length ? (desfeitos.length ? "warning" : "error") : "success",
    message: partes.join(" ") || "Nenhum Silo foi desfeito.",
    snapshot: canonical,
  };
}

export function SiloUndoDialog({
  brandId,
  refs,
  bulk,
  readings,
  excludedNote,
  lockOf,
  expectedMembersOf,
  busy,
  onBusyChange,
  onClose,
  onDone,
  classes,
  deps,
}: {
  brandId: string;
  refs: readonly string[];
  bulk: boolean;
  readings: ReadonlyMap<string, SiloUndoReading>;
  excludedNote: string | null;
  /** O lock vigente do território (do snapshot remoto); `null` = não está no snapshot. */
  lockOf: (ref: string) => number | null;
  /** As keywords que estão no Silo agora (a releitura confere que saíram). */
  expectedMembersOf: (ref: string) => string[];
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onDone: (result: SiloUndoRunResult) => void;
  classes: { cancel: string; confirm: string };
  deps?: SiloUndoDeps;
}) {
  const itens = refs.map(ref => ({ ref, leitura: readings.get(ref) })).filter((item): item is { ref: string; leitura: SiloUndoReading } => Boolean(item.leitura));
  // O Silo inteiro é um por vez, nunca pelo lote.
  const inteiro = !bulk && itens.length === 1 && itens[0].leitura.wholeSilo !== null && itens[0].leitura.refusals.length === 0 ? itens[0] : null;
  const podem = inteiro ? [] : itens.filter(item => item.leitura.refusals.length === 0 && item.leitura.wholeSilo === null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [previa, setPrevia] = useState<RemoteSiloUndoPreview | null>(null);
  const [previaErro, setPreviaErro] = useState<string | null>(null);
  const [digitado, setDigitado] = useState("");
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);

  const refInteiro = inteiro?.ref ?? null;
  useEffect(() => {
    if (!refInteiro) return;
    let vivo = true;
    const lock = lockOf(refInteiro);
    if (lock === null) { setPreviaErro("Este Silo não está no snapshot remoto; recarregue."); return; }
    (deps?.preview ?? previewRemoteSiloUndo)({ brandId, territoryRef: refInteiro, expectedLock: lock })
      .then(lida => { if (vivo) setPrevia(lida); })
      .catch(error => { if (vivo) setPreviaErro(semRef(error instanceof Error ? error.message : "", readings.get(refInteiro)?.label ?? "Silo") || "A prévia não pôde ser lida agora."); });
    return () => { vivo = false; };
    // A prévia é pedida uma vez por abertura do diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refInteiro, brandId]);

  const silo = previa?.wholeSilo ?? null;
  const nomeConfere = Boolean(silo && typedConfirmationMatches(digitado, silo.confirmationName));

  const confirmar = async (alvos: SiloUndoTarget[]) => {
    if (busy || !alvos.length) return;
    onBusyChange(true);
    try {
      const resultado = await runSiloUndo({ brandId, targets: alvos, onProgress: setProgress, deps });
      onDone(resultado);
    } finally {
      onBusyChange(false);
      setProgress(null);
      onClose();
    }
  };
  const alvoDe = (ref: string, label: string): SiloUndoTarget | null => {
    const lock = lockOf(ref);
    return lock === null ? null : { ref, label, expectedLock: lock, expectedMemberIds: expectedMembersOf(ref) };
  };
  const confirmarSugeridos = () => {
    const alvos = podem.map(item => alvoDe(item.ref, item.leitura.label));
    const semLock = podem.filter((_, indice) => !alvos[indice]).map(item => `${item.leitura.label}: não está no snapshot remoto; recarregue.`);
    if (semLock.length && !alvos.some(Boolean)) { onDone({ tone: "error", message: semLock.join(" "), snapshot: null }); onClose(); return; }
    void confirmar(alvos.filter((alvo): alvo is SiloUndoTarget => Boolean(alvo)));
  };
  const confirmarInteiro = () => {
    if (!inteiro || !silo || !nomeConfere || !previa) return;
    const alvo = alvoDe(inteiro.ref, inteiro.leitura.label);
    if (!alvo) return;
    void confirmar([{
      ...alvo,
      confirmation: { decisionHash: silo.decisionHash, typedName: digitado },
      expectedGoneArticleIds: silo.articles.map(article => article.articleId),
      expectedGoneSiloIds: [...new Set(silo.pair.map(item => item.siloId).filter((id): id is string => Boolean(id)))],
    }]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="dialog" aria-modal="true" aria-label="Confirmar desfazer Silo" data-testid="architect-undo-silo-dialog"
      onKeyDown={event => { if (event.key === "Escape" && !busy) onClose(); }}>
      <div className="flex max-h-[86vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-lg border border-divider bg-surface-elevated p-4 shadow-xl">
        <p className="text-base font-semibold text-foreground">{inteiro ? `Desfazer o Silo inteiro · ${inteiro.leitura.label}` : itens.length > 1 || bulk ? `Desfazer os Silos sugeridos (${podem.length})` : TERRITORY_UNDO_ACTION_LABEL}</p>
        {inteiro ? (
          <>
            <p className="text-sm leading-6 text-text-muted">{inteiro.leitura.wholeSilo} Decisão sua, sobre a prévia do servidor: nada é apagado e nada é pago.</p>
            {!previa && !previaErro && <p role="status" className="text-sm leading-6 text-text-muted" data-testid="architect-undo-silo-preview-loading">Lendo a prévia no servidor…</p>}
            {previaErro && <p role="alert" className="text-sm leading-6 text-danger" data-testid="architect-undo-silo-preview-error">{`Não pode ser desfeito agora: ${previaErro}`}</p>}
            {silo && (
              <>
                <ul className="grid gap-1 text-sm leading-6 text-foreground" data-testid="architect-undo-silo-preview">
                  {silo.lines.map((linha, indice) => <li key={`${indice}:${linha}`} className="rounded border border-divider bg-surface px-3 py-1">{linha}</li>)}
                </ul>
                <label className="grid gap-1 text-sm leading-6 text-foreground">
                  <span>{`Para confirmar, digite o nome do Silo: “${silo.confirmationName}”`}</span>
                  <input
                    type="text"
                    value={digitado}
                    onChange={event => setDigitado(event.target.value)}
                    disabled={busy}
                    data-testid="architect-undo-silo-typed"
                    className="min-h-8 rounded border border-divider bg-surface-subtle px-2 text-sm text-foreground outline-none focus-visible:border-module-accent/45 focus-visible:ring-2 focus-visible:ring-module-accent/25"
                  />
                </label>
              </>
            )}
          </>
        ) : (
          <>
            <p className="text-sm leading-6 text-text-muted">O Silo sai da aba Silos (fica guardado como rejeitado; nada é apagado). As keywords dele voltam para “sem Silo” e continuam na mesa.</p>
            {bulk && excludedNote && <p className="text-sm leading-6 text-warning" data-testid="architect-undo-silo-plan-excluded">{excludedNote}</p>}
            <ul className="grid gap-2 text-sm leading-6">
              {itens.map(({ ref, leitura }) => (
                <li key={ref} className="rounded border border-divider bg-surface px-3 py-2">
                  <span className="font-semibold text-foreground">{leitura.label}</span>
                  {leitura.refusals.length === 0
                    ? leitura.wholeSilo === null
                      ? <span className="text-text-muted">{` · ${leitura.keywordCount} keyword(s) voltam para sem Silo`}</span>
                      : <span className="block text-warning">{`Não entra no lote: ${leitura.wholeSilo}`}</span>
                    : <span className="block text-warning">{`Não pode ser desfeito: ${leitura.refusals.join(" ")}`}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        {progress && (
          <p role="status" className="text-sm leading-6 text-foreground" data-testid="architect-undo-silo-progress">
            {`Desfazendo ${progress.done} de ${progress.total}… Depois a tela relê o banco para conferir.`}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" ref={cancelRef} disabled={busy} onClick={onClose} className={classes.cancel}>Cancelar</button>
          {inteiro ? (
            silo && (
              <button type="button" disabled={busy || !nomeConfere} onClick={confirmarInteiro} className={classes.confirm} data-testid="architect-undo-silo-confirm"
                title={nomeConfere ? "Desfaz o Silo inteiro, conferido na releitura" : `Digite “${silo.confirmationName}” para confirmar`}>
                {busy ? "Desfazendo…" : "Desfazer o Silo inteiro"}
              </button>
            )
          ) : podem.length > 0 && (
            <button type="button" disabled={busy} onClick={confirmarSugeridos} className={classes.confirm} data-testid="architect-undo-silo-confirm">
              {busy ? "Desfazendo…" : podem.length > 1 ? `Desfazer ${podem.length} Silos` : TERRITORY_UNDO_ACTION_LABEL}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
