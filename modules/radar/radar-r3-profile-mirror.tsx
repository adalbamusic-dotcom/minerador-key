import type { RadarR3Model } from "@/lib/radar/r3-workbench";
import { RadarR3ContentDossier } from "./radar-r3-content-dossier";
import { ArticleSubjectLine } from "@/components/editorial/article-subject-line";
import { radarR4AmazonStatusLabel, radarR4SerpStatusLabel } from "@/lib/radar/r4-queue";

/*
 * 2026-10-08 · A PESQUISA DO PERFIL É A MESMA DA COLUNA "PESQUISA".
 *
 * O card SERP lia a curadoria legada (Principais/Pendentes por resultado) e a
 * fila R4 ("Aguardando revisão SERP") ao lado de uma investigação finalizada
 * com "26 de 38 analisada(s)": duas autoridades na mesma tela. Quem tem a
 * investigação canônica (a planilha) monta esta leitura UMA vez e a passa; sem
 * ela, o card continua o de antes.
 */
export type RadarR3ProfileResearch = {
  statusLabel: string;
  detail: string;
  analyzed: number | null;
  references: number | null;
};

type RadarR3ProfileMirrorProps = {
  model: RadarR3Model;
  articleHref: string | null;
  architectHref: string | null;
  research?: RadarR3ProfileResearch | null;
};

const disclosure = "cursor-pointer py-2 text-sm font-medium text-foreground hover:text-module-accent focus-visible:ring-2 focus-visible:ring-focus";

export function RadarR3ProfileMirror({ model, architectHref, research = null }: RadarR3ProfileMirrorProps) {
  const r4 = model.r4;
  const serpStatus = research?.statusLabel ?? (r4?.serp.state ? radarR4SerpStatusLabel(r4.serp.state) : model.serp.status);
  const serpDetail = research?.detail ?? `${model.serp.provider} · ${model.serp.resultCount} resultado(s)`;
  const publication = model.article?.payload.publishedIdentityRef ? "Publicado e protegido" : model.publication;

  return <section className="space-y-2 rounded-md border border-divider bg-surface p-3" aria-label="Painel do artigo no Radar" data-testid="radar-r3-profile-mirror">
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <h2 className="break-words text-lg font-semibold text-foreground">{model.title}</h2>
        <ArticleSubjectLine phrase={model.researchContext?.article.subject?.phrase} className="mt-1"/>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-text-muted">
          <span>{model.silo} · {model.hierarchy}</span>
          <span>{publication}</span>
          <span>ArticleDNA {model.articleDnaVersion}</span>
        </p>
      </div>
      {architectHref && <a className="inline-flex min-h-10 items-center rounded-md border border-divider px-3 py-2 text-sm text-foreground hover:border-module-accent hover:text-module-accent focus-visible:ring-2 focus-visible:ring-focus" href={architectHref}>Ver no Arquiteto</a>}
    </header>

    <details className="border-t border-divider" data-testid="radar-article-foundations-details">
      <summary className={disclosure}>Ver fundamentos do Article</summary>
      <RadarR3ContentDossier model={model.content} article={model.article}
        editorialContext={model.editorialContext} researchContext={model.researchContext} />
    </details>

    <details className="border-t border-divider">
      <summary className={disclosure}>Investigação <span className="font-normal text-text-muted">· {serpStatus} · {serpDetail}</span></summary>
      <div className="grid gap-x-6 gap-y-3 pb-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <section className="space-y-1 text-text-muted">
          <h3 className="font-semibold text-foreground">SERP</h3>
          <p>Última coleta · {model.serp.latestCollection}</p>
          <p>{research ? `${research.analyzed ?? "—"} analisadas · ${research.references ?? "—"} referências` : `${model.serp.primaryCount} principais · Pendentes ${model.serp.pendingCount}`}</p>
          <p>{model.mode} · {model.nextAction}</p>
        </section>
        <section className="space-y-1 text-text-muted">
          <h3 className="font-semibold text-foreground">Conteúdo</h3>
          <p>{model.content.needs} necessidades · {model.content.evidenceCount} evidências · {model.content.sourceCount} fontes</p>
        </section>
        <section className="space-y-1 text-text-muted">
          <h3 className="font-semibold text-foreground">Amazon</h3>
          <p>{r4 ? radarR4AmazonStatusLabel(r4.amazon) : model.amazon.label}</p>
          <p>{model.amazon.detail}</p>
          <p>{model.amazon.productCount} produtos · {model.amazon.reviewCount} reviews · {model.amazon.criteriaCount} critérios</p>
        </section>
        <section className="space-y-1 text-text-muted">
          <h3 className="font-semibold text-foreground">Especialista</h3>
          <p>{model.specialist.expert} · {model.specialist.channel} · {model.specialist.status}</p>
          <p>{model.specialist.requestsSent} pedidos · {model.specialist.contributionsReceived} recebidas · {model.specialist.reviewedEvidence} revisadas</p>
          {r4?.topics.items.length ? <p>{r4.topics.items.length} pauta(s) local(is) · {r4.topics.state}</p> : null}
        </section>
        <section className="space-y-1 text-text-muted sm:col-span-2 xl:col-span-4">
          <h3 className="font-semibold text-foreground">Relatório / decisão</h3>
          <p>{model.report.status} · {model.report.needs} necessidades · {model.report.approved ? "Aprovado" : "Aguardando decisão humana"} · {model.report.sentToWriter ? "Redator recebeu" : "Ainda não enviado"}</p>
          {model.report.summary && <p>{model.report.summary}</p>}
          {model.lastActivity && <p>Atualizado em {model.lastActivity}</p>}
        </section>
      </div>
    </details>
  </section>;
}
