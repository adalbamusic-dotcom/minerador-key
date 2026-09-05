import type { RadarR3Model } from "@/lib/radar/r3-workbench";

type RadarR3ContentDossierProps = {
  model: RadarR3Model["content"];
};

const inset = "rounded-md border border-divider bg-surface-subtle p-3";

export function RadarR3ContentDossier({ model }: RadarR3ContentDossierProps) {
  return <section className="space-y-4" aria-label="Dossiê de conteúdo do Radar">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className={inset}><p className="text-xs text-text-muted">ArticleDNA</p><p className="mt-1 text-sm font-semibold text-foreground">{model.articleDnaVersion}</p><p className="mt-1 text-xs text-text-muted">Preservado do Arquiteto</p></div>
      <div className={inset}><p className="text-xs text-text-muted">Principal</p><p className="mt-1 break-words text-sm font-semibold text-foreground">{model.principal}</p><p className="mt-1 text-xs text-text-muted">Keyword recebida</p></div>
      <div className={inset}><p className="text-xs text-text-muted">Necessidades</p><p className="mt-1 text-sm font-semibold text-foreground">{model.needs}</p><p className="mt-1 text-xs text-text-muted">Observadas no relatório</p></div>
      <div className={inset}><p className="text-xs text-text-muted">Evidências / fontes</p><p className="mt-1 text-sm font-semibold text-foreground">{model.evidenceCount} / {model.sourceCount}</p><p className="mt-1 text-xs text-text-muted">Amostra e URLs observadas</p></div>
    </div>
    <div className="overflow-x-auto rounded-md border border-divider">
      <table className="min-w-[44rem] w-full text-left text-sm" aria-label="Dados do dossiê de conteúdo">
        <thead className="bg-surface-subtle text-xs uppercase tracking-wide text-text-muted"><tr><th className="px-3 py-2 font-semibold">Área</th><th className="px-3 py-2 font-semibold">Dado</th><th className="px-3 py-2 font-semibold">Valor</th><th className="px-3 py-2 font-semibold">Fonte</th><th className="px-3 py-2 font-semibold">Estado</th></tr></thead>
        <tbody className="divide-y divide-divider">{model.rows.map((row, index) => <tr key={`${row.area}:${row.data}:${index}`} className="align-top"><td className="px-3 py-3 font-medium text-foreground">{row.area}</td><td className="px-3 py-3 text-text-muted">{row.data}</td><td className="max-w-[22rem] px-3 py-3 text-foreground">{row.value}</td><td className="max-w-[18rem] px-3 py-3 text-text-muted">{row.source}</td><td className="px-3 py-3 text-text-muted">{row.state}</td></tr>)}</tbody>
      </table>
    </div>
    <details className="rounded-md border border-divider bg-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">Proveniência / detalhes técnicos</summary>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs text-text-muted">brandId</dt><dd className="mt-1 break-all text-sm text-foreground">{model.technical.brandId}</dd></div>
        <div><dt className="text-xs text-text-muted">articleId</dt><dd className="mt-1 break-all text-sm text-foreground">{model.technical.articleId}</dd></div>
        <div><dt className="text-xs text-text-muted">articleDnaVersionId</dt><dd className="mt-1 break-all text-sm text-foreground">{model.technical.articleDnaVersionId}</dd></div>
        <div><dt className="text-xs text-text-muted">SiloDNA ID</dt><dd className="mt-1 break-all text-sm text-foreground">{model.technical.siloId || "Não vinculado"}</dd></div>
        <div><dt className="text-xs text-text-muted">Snapshot SERP</dt><dd className="mt-1 break-all text-sm text-foreground">{model.technical.snapshotId || "Não disponível"}</dd></div>
        <div><dt className="text-xs text-text-muted">Provider</dt><dd className="mt-1 break-words text-sm text-foreground">{model.technical.provider || "Não disponível"}</dd></div>
        <div><dt className="text-xs text-text-muted">ArticleDNA entityId</dt><dd className="mt-1 break-all text-sm text-foreground">{model.technical.articleDnaEntityId || "Não disponível"}</dd></div>
        <div><dt className="text-xs text-text-muted">ArticleDNA hash</dt><dd className="mt-1 break-all text-sm text-foreground">{model.technical.articleDnaHash || "Não disponível"}</dd></div>
      </dl>
    </details>
    {model.rows.some(row => row.data === "Perguntas preparadas") && <p className="rounded-md border border-divider bg-surface-subtle p-3 text-sm text-text-muted">As perguntas preparadas são solicitações ao especialista. Elas não são evidências e só poderão virar ExpertEvidence depois de uma contribuição recebida e revisada.</p>}
    <p className="text-sm text-text-muted">O dossiê é uma leitura consolidada. Ele não altera ArticleDNA, KeywordDNA, SiloDNA ou decisões humanas anteriores.</p>
  </section>;
}
