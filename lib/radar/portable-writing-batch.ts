import {
  radarPortableExportLensLookupsFor,
  type RadarPortableExportAssembledArticle,
  type RadarPortableExportLensReading,
  type RadarPortableExportSiloFile,
} from "./portable-export-batch.ts";
import type { RadarSiloExportPlan, RadarSiloExportWritingContext } from "./portable-silo-export.ts";
import {
  buildRadarWritingExportArticle,
  buildRadarWritingTopRow,
  radarWritingExportArchiveFilename,
  radarWritingExportBatchFilename,
  radarWritingExportCsv,
  radarWritingExportSiloFilename,
  type RadarWritingExportArticle,
  type RadarWritingPublication,
} from "./portable-writing-export.ts";

/**
 * ===== A MONTAGEM DO LOTE NO FORMATO "PARA ESCREVER" — a ponte pura da rota =====
 *
 * A rota já montou, para cada artigo finalizado, a MESMA entrada do formato
 * completo (`RadarPortableExportAssembledArticle`), leu as lentes UMA vez para
 * o lote e, no export por silo, fez o plano. Esta ponte só troca a projeção:
 * as linhas saem por `buildRadarWritingExportArticle`, e cada arquivo abre com
 * a linha de topo ("Silo" ou "Marca").
 *
 * Nenhuma leitura, nenhum relógio, nenhuma coleta: o que a rota não leu não
 * existe aqui. A página publicada vem do ArticleDNA que a rota JÁ leu (mesma
 * marca, mesmo artigo), passada pelo mapa `publications`.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

export type RadarPortableWritingExportResult = {
  /** Artigos que viraram linha (sem contar as linhas de topo). */
  exported: number;
  /** Artigos com `pode_escrever` = "Não". */
  blocked: number;
  /** Só no dossiê avulso: o CSV do lote. */
  csv: string | null;
  filename: string | null;
  /** Só no export por silo: um CSV por silo, com o mesmo resumo do formato completo. */
  files: RadarPortableExportSiloFile[] | null;
  archiveFilename: string | null;
};

const enderecoDoSite = (artigos: readonly RadarPortableExportAssembledArticle[], silo: RadarSiloExportWritingContext | null): string | null =>
  silo?.siloPage?.publishedUrl || silo?.siloPage?.canonical
  || artigos.map(item => item.entrada.researchContext?.silo?.siloPageCanonical || item.entrada.article.canonical || null).find(Boolean)
  || null;

export function radarPortableWritingExport(input: {
  articles: readonly RadarPortableExportAssembledArticle[];
  lenses: RadarPortableExportLensReading;
  plan: Pick<RadarSiloExportPlan, "files" | "delivery"> | null;
  publications?: ReadonlyMap<string, RadarWritingPublication>;
  today: string;
}): RadarPortableWritingExportResult {
  const lentesDe = radarPortableExportLensLookupsFor(input.lenses.lookups);
  const porId = new Map(input.articles.map(artigo => [artigo.articleId, artigo]));

  const montar = (
    artigo: RadarPortableExportAssembledArticle,
    topo: "Silo" | "Marca",
    posicao: number,
    silo: RadarSiloExportWritingContext | null,
  ): RadarWritingExportArticle => buildRadarWritingExportArticle({
    ...artigo.entrada,
    serpLenses: {
      keywords: artigo.lentes,
      lookups: lentesDe(artigo.lentes),
      readFailed: input.lenses.readFailed,
      ...(artigo.lentesCongeladas ? { frozen: artigo.lentesCongeladas } : {}),
    },
  }, {
    topRowLabel: topo,
    filePosition: posicao,
    silo,
    articleId: artigo.articleId,
    publication: input.publications?.get(artigo.articleId) ?? null,
  });

  if (!input.plan) {
    const artigos = input.articles.map((artigo, indice) => montar(artigo, "Marca", indice + 1, null));
    const topo = buildRadarWritingTopRow({ label: "Marca", silo: null, articles: artigos, siteUrl: enderecoDoSite(input.articles, null) });
    return {
      exported: artigos.length,
      blocked: artigos.filter(item => item.verdict === "Não").length,
      csv: artigos.length ? radarWritingExportCsv([topo, ...artigos.map(item => item.row)]) : "",
      filename: radarWritingExportBatchFilename({
        articles: input.articles.map(item => ({ slug: item.entrada.article.slug, keyword: item.entrada.article.principalKeyword })),
        today: input.today,
      }),
      files: null,
      archiveFilename: null,
    };
  }

  let exportados = 0;
  let bloqueados = 0;
  const files: RadarPortableExportSiloFile[] = input.plan.files.map(arquivo => {
    const silo = arquivo.writing ?? null;
    const topo = arquivo.kind === "silo" ? "Silo" : "Marca";
    const doArquivo = arquivo.articleIds
      .map(articleId => porId.get(articleId))
      .filter((artigo): artigo is RadarPortableExportAssembledArticle => Boolean(artigo));
    const artigos = doArquivo.map((artigo, indice) => montar(artigo, topo, indice + 1, silo));
    exportados += artigos.length;
    bloqueados += artigos.filter(item => item.verdict === "Não").length;
    const linhaDeTopo = buildRadarWritingTopRow({
      label: topo,
      silo: arquivo.kind === "silo" ? silo : null,
      articles: artigos,
      siteUrl: enderecoDoSite(doArquivo, silo),
    });
    return {
      filename: radarWritingExportSiloFilename(arquivo.filename),
      csv: radarWritingExportCsv([linhaDeTopo, ...artigos.map(item => item.row)]),
      silo: {
        name: arquivo.siloLabel,
        kind: arquivo.kind,
        partial: arquivo.partial,
        exported: artigos.length,
        total: arquivo.total,
        pending: arquivo.pending.map(membro => ({
          title: membro.title || membro.principalKeyword || membro.slug || "artigo sem título conhecido",
          status: membro.statusLabel,
          reason: membro.reason,
        })),
        warnings: arquivo.warnings,
      },
    };
  });

  return {
    exported: exportados,
    blocked: bloqueados,
    csv: null,
    filename: null,
    files,
    archiveFilename: input.plan.delivery.kind === "zip" ? radarWritingExportArchiveFilename(input.today) : null,
  };
}
