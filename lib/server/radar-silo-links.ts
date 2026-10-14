import "server-only";

/**
 * ===== 2026-10-14 · F5 · LINKS A ATIVAR E "ATUALIZAR LINKS DO SILO", PELO MESMO NÚCLEO DO CSV =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §6.5 e
 * D10. A tela do Radar (painel do artigo, rota `/api/editorial/radar-silo-links`),
 * o .zip da exportação por artigo (`<NN>-<papel>-<slug>-links.csv`) e o MCP
 * (`get_silo_links_update`) leem daqui.
 *
 * Nenhuma montagem paralela: a MESMA montagem do export (`assembleRadarPortableExport`
 * com o Silo da seleção e a página publicada lida — só GET, a mesma busca do CSV,
 * agora também com os links internos dela), a MESMA linha do CSV "Para escrever"
 * (`radarPortableWritingArticles`) e o material dela (`radarWritingMaterialOf`). O
 * grafo é lido pela fonte de sempre (o que o artigo levou ao Radar e a adoção do
 * grafo novo): o Radar se adapta ao Arquiteto.
 *
 * Só leitura: SELECT e o GET das páginas publicadas. Nada é gravado, nenhuma IA,
 * nenhum provider pago. A página publicada nunca é alterada.
 */

import { radarPortableExportMissingBlueprints } from "@/lib/radar/portable-export-batch";
import { radarPortableWritingArticles } from "@/lib/radar/portable-writing-batch";
import { radarWritingMaterialOf } from "@/lib/radar/portable-writing-material";
import {
  RADAR_SILO_LINKS_NEVER_EDITS,
  radarSiloLinksCsv,
  radarSiloLinksFilename,
  radarSiloLinksSiloSummary,
  radarSiloLinksUpdateOf,
  type RadarSiloLinksSiloSummary,
  type RadarSiloLinksUpdate,
} from "@/lib/radar/silo-links-update";
import { assembleRadarPortableExport, radarReadPublishedStructure, type RadarPortableExportAssembly } from "@/lib/server/radar-portable-export-core";

export type RadarSiloLinksArticle = RadarSiloLinksUpdate & { filename: string; csv: string };

export type RadarSiloLinksReading = {
  exportedAt: string;
  siloLabel: string | null;
  articles: RadarSiloLinksArticle[];
  /** Os artigos do Silo sem linha agora (sem investigação finalizada ou sem artigo-modelo), pelo título, com o motivo. */
  withoutRow: Array<{ articleId: string; title: string; reason: string }>;
  summary: RadarSiloLinksSiloSummary;
  /** "A lista não altera a página…": dita com a lista em todo lugar. */
  notice: string;
};

const SEM_PLANTA = "sem o artigo-modelo da SERP concluído: organize-o no Radar para a malha dele sair";

/**
 * A LISTA SOBRE UMA MONTAGEM JÁ FEITA (puro sobre a montagem; o teste passa a de
 * fixture): a linha de cada artigo pelo mesmo núcleo do CSV, o material dela, a
 * publicação de hoje (com os links da página lida) e a planta congelada.
 */
export function radarSiloLinksOfAssembly(montagem: Pick<RadarPortableExportAssembly, "exportedAt" | "montadas" | "recusados" | "lentes" | "planoDaSelecao" | "publicacoes" | "brandVoice" | "grupos">): RadarSiloLinksReading {
  const semPlanta = new Set(radarPortableExportMissingBlueprints(montagem.montadas, null, { mode: "writing" }).map(item => item.articleId));
  const comPlanta = montagem.montadas.filter(item => !semPlanta.has(item.articleId));
  const linhas = comPlanta.length
    ? radarPortableWritingArticles({
      articles: comPlanta, lenses: montagem.lentes, plan: null, selectionPlan: montagem.planoDaSelecao,
      publications: montagem.publicacoes, today: montagem.exportedAt, brandVoice: montagem.brandVoice,
      ...(montagem.grupos?.size ? { groups: montagem.grupos } : {}),
    })
    : [];
  const membroDe = (articleId: string) => {
    for (const arquivo of montagem.planoDaSelecao?.files || []) {
      const membro = arquivo.writing?.members.find(item => item.articleId === articleId);
      if (membro) return { membro, silo: arquivo.writing ?? null };
    }
    return null;
  };
  const articles: RadarSiloLinksArticle[] = [];
  const withoutRow: RadarSiloLinksReading["withoutRow"] = [];
  let siloLabel: string | null = null;
  for (const montada of comPlanta) {
    const linha = linhas.find(item => item.articleId === montada.articleId)?.article ?? null;
    const material = radarWritingMaterialOf(linha?.uncutRow ?? linha?.row ?? null);
    const lugar = membroDe(montada.articleId);
    if (lugar?.silo?.kind === "silo" && !siloLabel) siloLabel = lugar.silo.label;
    const artigo = montada.entrada.article;
    const titulo = artigo.principalKeyword || lugar?.membro.title || artigo.slug || montada.articleId;
    if (!material) {
      withoutRow.push({ articleId: montada.articleId, title: titulo, reason: "a linha do CSV \"Para escrever\" não tem a malha deste artigo (investigação só de vídeo ou sem estrutura)" });
      continue;
    }
    const publicacao = montagem.publicacoes.get(montada.articleId) ?? null;
    const publicado = Boolean(publicacao?.published);
    const role = lugar?.membro.role ?? artigo.articleRole ?? null;
    const position = lugar?.membro.position ?? null;
    const update = radarSiloLinksUpdateOf({
      articleId: montada.articleId,
      article: titulo,
      role,
      position,
      material,
      source: {
        published: publicado,
        url: publicacao?.publishedUrl ?? publicacao?.canonical ?? null,
        pageLinks: publicado ? publicacao?.currentStructure?.links ?? null : null,
      },
      blueprintCandidates: montada.blueprint?.linkCandidates ?? null,
    });
    articles.push({
      ...update,
      filename: radarSiloLinksFilename({ slug: artigo.slug ?? null, keyword: artigo.principalKeyword ?? null, position, role, today: montagem.exportedAt }),
      csv: radarSiloLinksCsv(update),
    });
  }
  for (const montada of montagem.montadas.filter(item => semPlanta.has(item.articleId))) {
    withoutRow.push({ articleId: montada.articleId, title: montada.entrada.article.principalKeyword || montada.entrada.article.slug || montada.articleId, reason: SEM_PLANTA });
  }
  for (const recusa of montagem.recusados) withoutRow.push({ articleId: recusa.articleId, title: membroDe(recusa.articleId)?.membro.title || recusa.articleId, reason: recusa.reason });
  articles.sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));
  return { exportedAt: montagem.exportedAt, siloLabel, articles, withoutRow, summary: radarSiloLinksSiloSummary({ siloLabel, updates: articles }), notice: RADAR_SILO_LINKS_NEVER_EDITS };
}

/** A montagem — injetável nos testes (fixtures, sem banco nem rede). */
export type RadarSiloLinksPorts = {
  assemble: (input: { brandId: string; articleIds: readonly string[]; actorUserId: string; supabase: Parameters<typeof assembleRadarPortableExport>[0]["supabase"] }) => Promise<RadarPortableExportAssembly>;
};

export const radarSiloLinksPorts: RadarSiloLinksPorts = {
  assemble: ({ brandId, articleIds, actorUserId, supabase }) => assembleRadarPortableExport({
    brandId, articleIds, supabase, actorUserId,
    readPublishedStructure: radarReadPublishedStructure, selectionSiloContext: true, videoLensDigests: false,
  }),
};

/** Os artigos do Silo do artigo, pelo plano da seleção (a ordem do Silo). */
export function radarSiloLinksMemberIds(montagem: Pick<RadarPortableExportAssembly, "planoDaSelecao">, articleId: string): string[] {
  for (const arquivo of montagem.planoDaSelecao?.files || []) {
    const membros = arquivo.writing?.kind === "silo" ? arquivo.writing.members : null;
    if (membros?.some(item => item.articleId === articleId)) return membros.map(item => item.articleId);
  }
  return [articleId];
}

/**
 * UM ARTIGO (o .zip da exportação por artigo e o MCP) ou O SILO DELE (o painel
 * "malha X/Y"): com `silo`, a primeira montagem descobre os membros e a segunda
 * monta todos de uma vez (as leituras do lote continuam uma por lote; as páginas
 * publicadas lidas são as do teto da montagem).
 */
export async function radarSiloLinksRead(
  input: { brandId: string; articleId: string; scope: "article" | "silo"; actorUserId: string; supabase: Parameters<typeof assembleRadarPortableExport>[0]["supabase"] },
  portas: RadarSiloLinksPorts = radarSiloLinksPorts,
): Promise<RadarSiloLinksReading> {
  const primeira = await portas.assemble({ brandId: input.brandId, articleIds: [input.articleId], actorUserId: input.actorUserId, supabase: input.supabase });
  if (input.scope === "article") return radarSiloLinksOfAssembly(primeira);
  const membros = radarSiloLinksMemberIds(primeira, input.articleId);
  if (membros.length <= 1) return radarSiloLinksOfAssembly(primeira);
  const todos = await portas.assemble({ brandId: input.brandId, articleIds: membros, actorUserId: input.actorUserId, supabase: input.supabase });
  return radarSiloLinksOfAssembly(todos);
}
