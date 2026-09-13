import { radarDeclaredKeywordIntent } from "@/lib/radar/editorial-identity";
import type { RadarR3Model } from "@/lib/radar/r3-workbench";
import type { RadarEditorialContext } from "@/lib/radar/editorial-context";
import type { RadarArticleResearchContext, RadarResearchKeyword } from "@/lib/radar/article-research-context";
import { buildRadarFoundationSections, buildRadarKeywordProfile, radarFieldStateLabel, type RadarProfileSection } from "@/lib/radar/foundation-profiles";
import { buildRadarArticleDnaSummary, radarKeywordLines } from "@/lib/radar/operational-view";

type RadarR3ContentDossierProps = {
  model: RadarR3Model["content"];
  editorialContext?: RadarEditorialContext;
  /** O contexto estratégico resolvido — inspeção compacta, recolhida. */
  researchContext?: RadarArticleResearchContext;
};

const inset = "rounded-md border border-divider bg-surface-subtle p-3";

const CLASSE_ROTULO: Record<string, string> = {
  AVAILABLE: "Disponível",
  LEGACY_SOURCE_MISSING: "Origem não entregou",
  HANDOFF_DROPPED: "Perdido no transporte",
  SERVER_DISCARDED: "Descartado na persistência",
  HYDRATION_DROPPED: "Perdido na hidratação",
  UI_NOT_RENDERED: "Não projetado na tela",
};

const FONTE_ROTULO: Record<string, string> = {
  ARQUITETO: "ArticleDNA",
  RADAR_ITEM: "Linha do Radar",
  HYDRATION: "Hidratação",
  NONE: "Nenhuma",
};

/**
 * O CONTEXTO RECEBIDO — inteiro, e recolhido.
 *
 * Este diagnóstico já ocupou metade da área de trabalho do Radar, aberto por
 * padrão, para dizer que o Arquiteto não entregou cinco campos. A leitura
 * continua completa e nada foi perdido; o que mudou é o lugar: diagnóstico de
 * contrato mora em detalhes técnicos, e a investigação SERP fica com a tela.
 *
 * O aviso de que ele existe vive no card de Conteúdo, como "Contexto parcial".
 */
function EditorialContextDetails({ context }: { context: RadarEditorialContext }) {
  return <section className="mt-5 border-t border-divider pt-4" data-testid="radar-editorial-context" data-context-class={context.state}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">{context.headline}</h3>
        <p className="mt-1 max-w-4xl text-sm leading-6 text-text-muted">{context.summary}</p>
        {context.missing.length > 0 && <p className="mt-1 text-sm text-text-muted">Ausentes: {context.missing.join(" · ")}.</p>}
      </div>
      {context.owners.filter(Boolean).length > 0 && <span className="rounded-full border border-divider px-3 py-1 text-xs text-text-muted">Dono: {context.owners.filter(Boolean).join(" · ")}</span>}
    </div>
    {context.consequences.length > 0 && <ul className="mt-3 space-y-1 text-sm leading-6 text-text-muted">{context.consequences.map((item, index) => <li key={index}>{item}</li>)}</ul>}
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full text-left text-sm" data-testid="radar-editorial-context-table">
        <thead><tr className="text-xs uppercase tracking-wide text-text-muted"><th className="py-1 pr-4">Campo</th><th className="py-1 pr-4">Valor</th><th className="py-1 pr-4">Fonte</th><th className="py-1">Classificação</th></tr></thead>
        <tbody>{context.fields.map(field => <tr key={field.key} className="border-t border-divider align-top">
          <td className="py-1 pr-4 text-text-muted">{field.label}</td>
          <td className={"py-1 pr-4 " + (field.value ? "text-foreground" : "text-warning")}>{field.value || field.detail}</td>
          <td className="py-1 pr-4 text-text-muted">{FONTE_ROTULO[field.source]}</td>
          <td className="py-1 text-text-muted">{CLASSE_ROTULO[field.classification]}{field.owner ? " · " + field.owner : ""}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="mt-3 text-xs text-text-muted">{context.resolution}</p>
  </section>;
}

const ROTULO_PAPEL: Record<string, string> = { principal: "Principal", secundaria: "Secundária", reforco_narrativo: "Reforço" };

const numeroOu = (value: number | null, sufixo = "") => value === null ? "—" : `${value}${sufixo}`;

/**
 * O CONTEXTO RECEBIDO, EM UMA LINHA POR KEYWORD.
 *
 * Não é o painel gigante de volta: é a conferência do que o Arquiteto entregou
 * e o Radar resolveu — texto, papel, volume, resultados, KGR e intenção — com
 * a resolução declarada quando algo faltou. Recolhido por padrão.
 */
function KeywordLinha({ keyword }: { keyword: RadarResearchKeyword }) {
  const tomResolucao = keyword.resolution === "FULL" ? "text-text-muted" : "text-warning";
  return <tr className="border-t border-divider align-top">
    <td className="py-1 pr-4 text-text-muted">{ROTULO_PAPEL[keyword.identity.role] || keyword.identity.role}</td>
    <td className={"py-1 pr-4 " + (keyword.identity.text ? "text-foreground" : "text-warning")}>{keyword.identity.text || "texto não resolvido"}</td>
    <td className="py-1 pr-4 text-foreground">{numeroOu(keyword.strategy.volume)}</td>
    <td className="py-1 pr-4 text-foreground">{numeroOu(keyword.strategy.resultCount)}</td>
    <td className="py-1 pr-4 text-foreground">{keyword.strategy.kgrScore === null ? "—" : keyword.strategy.kgrScore.toFixed(2)}</td>
    <td className="py-1 pr-4 text-text-muted">{radarDeclaredKeywordIntent(keyword.strategy) || "—"}</td>
    <td className={"py-1 " + tomResolucao}>{keyword.resolution}</td>
  </tr>;
}

function ResearchContextDetails({ context }: { context: RadarArticleResearchContext }) {
  return <section className="mt-5 border-t border-divider pt-4" data-testid="radar-research-context" data-context-state={context.state}>
    <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Contexto recebido</h3>
    <p className="mt-1 text-sm text-text-muted">
      ArticleDNA {context.article.articleDnaVersionId.slice(0, 8)} · Keywords ({context.keywords.length}) ·
      Silo {context.silo?.siloName || context.silo?.siloId || "não resolvido"} ·
      SiloPage {context.silo?.siloPageSlug || "não resolvida"} ·
      SERP de formação {context.formationSerp ? context.formationSerp.verdict || "recebida" : "não recebida"} ·
      Links internos {context.internalLinks ? `${context.internalLinks.edges.length} relação(ões)` : "não recebidos"}
    </p>
    {context.keywords.length > 0 && <div className="mt-3 overflow-x-auto">
      <table className="min-w-full text-left text-sm" data-testid="radar-research-context-keywords">
        <thead><tr className="text-xs uppercase tracking-wide text-text-muted"><th className="py-1 pr-4">Papel</th><th className="py-1 pr-4">Keyword</th><th className="py-1 pr-4">Volume</th><th className="py-1 pr-4">Resultados</th><th className="py-1 pr-4">KGR</th><th className="py-1 pr-4">Intenção</th><th className="py-1">Resolução</th></tr></thead>
        <tbody>{context.keywords.map(keyword => <KeywordLinha key={keyword.identity.keywordId} keyword={keyword} />)}</tbody>
      </table>
    </div>}
    {context.editorialTopics.length > 0 && <p className="mt-3 text-xs text-text-muted">Tópicos editoriais: {context.editorialTopics.join(" · ")}.</p>}
    {context.limitations.length > 0 && <ul className="mt-3 space-y-1 text-xs text-warning">{context.limitations.map(item => <li key={item}>{item}</li>)}</ul>}
  </section>;
}

function Secao({ secao }: { secao: RadarProfileSection }) {
  return <div className={inset}>
    <h5 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{secao.title}</h5>
    <dl className="mt-2 grid gap-2 sm:grid-cols-2">{secao.fields.map(field => <div key={field.label}>
      <dt className="text-xs text-text-muted">{field.label}</dt>
      <dd className={"mt-0.5 break-words text-sm " + (field.state === "AVAILABLE" ? "text-foreground" : "text-text-muted italic")}>{field.value ?? radarFieldStateLabel(field.state)}</dd>
    </div>)}</dl>
  </div>;
}

/** Um par rótulo/valor do resumo. Valor essencial nunca fica em `text-muted`. */
function Fato({ label, value, tone }: { label: string; value: string | number | null; tone?: "keyword" }) {
  return <div className="min-w-0">
    <dt className="text-xs text-text-muted">{label}</dt>
    <dd className={"mt-0.5 break-words text-sm " + (value === null || value === "" ? "italic text-text-muted" : tone === "keyword" ? "text-keyword" : "text-foreground")}>{value === null || value === "" ? "Não informado" : value}</dd>
  </div>;
}

/**
 * O ARTIGO QUE ESTOU INVESTIGANDO.
 *
 * O painel do Arquiteto responde outra pergunta — "como este Article foi
 * formado?" — e por isso ele tem controles, decisões e o contrato inteiro
 * aberto. Aqui a pergunta é "qual é o artigo?", e a resposta cabe em dez
 * fatos: principal, silo, papel, intenção, funil, keywords, volume e versão.
 *
 * Nada foi removido do modelo. O que era primeira camada virou segunda.
 */
function ArticleFoundations({ context }: { context: RadarArticleResearchContext }) {
  const resumo = buildRadarArticleDnaSummary(context);
  const linhas = radarKeywordLines(context);
  const perfilPorKeyword = new Map(context.keywords.map(keyword => [keyword.identity.keywordId, keyword]));

  return <section className="rounded-md border border-divider bg-surface p-3" data-testid="radar-article-foundations" data-keyword-count={context.keywords.length}>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-foreground">Definição do artigo</h3>
      <span className={"text-xs " + (resumo.complete ? "text-text-muted" : "text-warning")} data-testid="radar-article-dna-state">{resumo.status}</span>
    </div>

    <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5" data-testid="radar-article-dna-summary">
      <Fato label="Principal" value={resumo.principal} tone="keyword" />
      <Fato label="Silo" value={resumo.silo} />
      <Fato label="Papel" value={resumo.role} />
      <Fato label="Intenção" value={resumo.intent} />
      <Fato label="Funil" value={resumo.funnel} />
      <Fato label="Keywords" value={resumo.keywordCount} />
      <Fato label="Volume principal" value={resumo.principalVolume} />
      <Fato label="Volume agregado" value={resumo.aggregateVolume} />
      <Fato label="Versão" value={resumo.version.slice(0, 8)} />
    </dl>

    {/*
      * AS KEYWORDS EM UMA LINHA CADA.
      *
      * Texto, papel e as três métricas que decidem. O perfil inteiro continua a
      * um clique — abrir seis perfis por padrão era o que empurrava a
      * investigação para fora da tela.
      */}
    <div className="mt-3 space-y-1.5" data-testid="radar-foundations-keywords">
      {linhas.map(linha => {
        const keyword = perfilPorKeyword.get(linha.keywordId);
        return <div key={linha.keywordId} className="rounded-md border border-divider bg-surface-subtle px-2.5 py-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{linha.roleLabel}</span>
            <span className={"min-w-0 flex-1 truncate text-sm " + (linha.text ? "text-keyword" : "italic text-warning")}>{linha.text || "texto não resolvido"}</span>
            <span className="text-sm text-text-muted">
              {linha.volume === null ? "volume pendente" : linha.volume}
              {linha.intent ? ` · ${linha.intent}` : ""}
              {linha.kgr === null ? "" : ` · KGR ${linha.kgr.toFixed(3)}`}
            </span>
          </div>
          {keyword && <details className="mt-1.5"><summary className="cursor-pointer text-xs text-context-accent">Ver perfil completo</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-2">{buildRadarKeywordProfile(keyword).map(secao => <Secao key={secao.title} secao={secao} />)}</div>
          </details>}
        </div>;
      })}
    </div>

    <details className="mt-3"><summary className="cursor-pointer text-sm text-context-accent">Ver Silo, hierarquia, links internos, SERP de formação e qualificação semântica</summary>
      <div className="mt-2.5 grid gap-2 md:grid-cols-2">{buildRadarFoundationSections(context).map(secao => <Secao key={secao.title} secao={secao} />)}</div>
    </details>

    {context.limitations.length > 0 && <ul className="mt-3 space-y-1 text-sm text-warning">{context.limitations.map(item => <li key={item}>{item}</li>)}</ul>}
  </section>;
}

export function RadarR3ContentDossier({ model, editorialContext, researchContext }: RadarR3ContentDossierProps) {
  const contextoParcial = Boolean(editorialContext && editorialContext.state !== "CURRENT_COMPLETE");
  return <section className="space-y-4" aria-label="Dossiê de conteúdo do Radar">
    {researchContext && <ArticleFoundations context={researchContext} />}
    {/*
      * O QUE O DOSSIÊ ACUMULOU — em uma linha, não em quatro cards.
      *
      * Versão e principal já estão na definição acima; repeti-las aqui era
      * dizer duas vezes a mesma coisa e ocupar uma faixa inteira para isso.
      */}
    <p className="text-sm text-text-muted" data-testid="radar-dossier-counts">{model.needs} necessidade(s) observada(s) · {model.evidenceCount} evidência(s) · {model.sourceCount} fonte(s).</p>
    <details className="rounded-md border border-divider bg-surface p-3">
      <summary className="cursor-pointer text-sm text-context-accent">Ver o dossiê linha a linha</summary>
      <div className="mt-2.5 overflow-x-auto rounded-md border border-divider">
        <table className="min-w-[44rem] w-full text-left text-sm" aria-label="Dados do dossiê de conteúdo">
          <thead className="bg-surface-subtle text-xs uppercase tracking-wide text-text-muted"><tr><th className="px-3 py-2 font-semibold">Área</th><th className="px-3 py-2 font-semibold">Dado</th><th className="px-3 py-2 font-semibold">Valor</th><th className="px-3 py-2 font-semibold">Fonte</th><th className="px-3 py-2 font-semibold">Estado</th></tr></thead>
          <tbody className="divide-y divide-divider">{model.rows.map((row, index) => <tr key={`${row.area}:${row.data}:${index}`} className="align-top"><td className="px-3 py-2.5 font-medium text-foreground">{row.area}</td><td className="px-3 py-2.5 text-text-muted">{row.data}</td><td className="max-w-[22rem] px-3 py-2.5 text-foreground">{row.value}</td><td className="max-w-[18rem] px-3 py-2.5 text-text-muted">{row.source}</td><td className="px-3 py-2.5 text-text-muted">{row.state}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
    <details className="rounded-md border border-divider bg-surface p-3" data-testid="radar-dossier-provenance">
      <summary className="cursor-pointer text-sm font-semibold text-foreground">Proveniência e detalhes técnicos{contextoParcial ? " · Contexto parcial" : ""}</summary>
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
      {researchContext && <ResearchContextDetails context={researchContext} />}
      {editorialContext && <EditorialContextDetails context={editorialContext} />}
      {/*
        * REGRA DO SISTEMA É DOCUMENTAÇÃO, NÃO INFORMAÇÃO OPERACIONAL.
        *
        * "O dossiê não altera ArticleDNA" é verdade e é garantia — mas quem
        * abre o Radar todo dia já sabe. Fica aqui, ao lado das versões e dos
        * hashes, para quem estiver conferindo o contrato.
        */}
      <p className="mt-4 text-sm leading-6 text-text-muted">O dossiê é uma leitura consolidada: ele não altera ArticleDNA, KeywordDNA, SiloDNA nem decisões humanas anteriores. As perguntas preparadas são solicitações ao especialista — não são evidências, e só viram ExpertEvidence depois de uma contribuição recebida e revisada.</p>
    </details>
  </section>;
}
