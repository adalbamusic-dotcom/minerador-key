"use client";

/*
 * O SILO DO GRAFO DE LINKS (2026-10-18, amarelo da WifiConecta) — o seletor "Silo do grafo" de sempre, fora do corpo
 * da aba para ser testado na tela. A escolha que o clique no mapa fazia (o mapa saiu em 16/10):
 *  - com a etiqueta de cor, o Silo da cor que tem o par SiloDNA + SiloPage é escolhido sozinho (só leitura);
 *  - sem cor, o seletor lista só os Silos com o par;
 *  - a cor com Silo ainda sem o par diz isso (o grafo espera o fechamento do Silo no "Concluir formação").
 * Nada aqui grava: a escolha é de tela; quem processa é "Processar links" de sempre.
 */
export function LinksSiloPicker({ contexts, choice, onChange }: {
  contexts: ReadonlyArray<{ siloId: string; label: string }>;
  choice: { siloId: string | null; byColor: boolean; colorWaiting: boolean };
  onChange: (siloId: string | null) => void;
}) {
  if (!contexts.length) {
    return <p className="mt-3 rounded border border-warning/40 bg-warning/10 px-2 py-2 text-sm leading-6 text-warning" data-testid="architect-links-silo-none">Nenhum par SiloDNA + SiloPage disponível para formar o contexto do grafo.</p>;
  }
  const escolhido = contexts.find(context => context.siloId === choice.siloId) ?? null;
  if (choice.byColor && escolhido) {
    return <p className="mt-3 text-sm leading-6 text-foreground" data-testid="architect-links-silo-by-color"><span className="font-semibold text-text-muted">Silo do grafo (cor da etiqueta):</span> {escolhido.label}</p>;
  }
  return <>
    {choice.colorWaiting && <p className="mt-3 rounded border border-warning/40 bg-warning/10 px-2 py-2 text-sm leading-6 text-warning" data-testid="architect-links-silo-color-waiting">O Silo desta cor ainda não tem SiloDNA e SiloPage: ele fecha no “Concluir formação” da aba Artigos.</p>}
    <label className="mt-3 block text-sm font-semibold text-text-muted">Silo do grafo<select aria-label="Silo do InternalLinkGraph" data-testid="architect-links-silo-select" value={choice.siloId || ""} onChange={event => onChange(event.target.value || null)} className="mt-1 w-full rounded border border-divider bg-surface-elevated px-2 py-1.5 text-sm font-normal text-foreground">
      {contexts.map(context => <option key={context.siloId} value={context.siloId}>{context.label}</option>)}
    </select></label>
  </>;
}
