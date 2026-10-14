import "server-only";
import {
  radarExportNeedsArticleBlueprint,
  radarExportNeedsArticleBlueprintIds,
  radarPortableExportMissingBlueprints,
  radarPortableExportNeedsBlueprintBody,
  type RadarPortableExportMissingBlueprint,
} from "@/lib/radar/portable-export-batch";
import { radarPortableVideoExport } from "@/lib/radar/portable-video-export";
import { radarPortableWritingExport } from "@/lib/radar/portable-writing-batch";
import { radarSerpRawExport, radarSerpRawPositionOf } from "@/lib/radar/serp-raw-export";
import { assembleRadarPortableExport, radarReadPublishedStructure, type RadarPortableExportAssembly } from "./radar-portable-export-core";
import type { EditorialGroupLabel } from "@/lib/editorial/editorial-group-scope";

/**
 * ===== 2026-10-09 · O MATERIAL DO MCP PELO MESMO NÚCLEO DA ROTA DE EXPORT =====
 *
 * `get_article_for_writing` (CSV "Para escrever") e `get_video_material` (CSV
 * para vídeo e redes sociais) entregam o MESMO arquivo que a tela baixa, de um
 * artigo: a mesma montagem (`assembleRadarPortableExport`, com as mesmas
 * chaves que a rota liga em cada modo), a MESMA regra do artigo-modelo
 * obrigatório (`radarPortableExportMissingBlueprints`, antes de qualquer
 * projeção) e as MESMAS projeções puras (`radarPortableWritingExport`,
 * `radarPortableVideoExport`), na ordem de `app/api/editorial/radar-export/route.ts`.
 *
 * Regra do dono: o processo antigo é substituído, nunca fica de alternativa.
 * Sem a planta concluída, o resultado é o estado explícito
 * `needs_article_blueprint` (o que falta, pelo título, e o teto do custo de
 * organizar) — nunca um arquivo pelo modelo editorial antigo. A recusa da
 * função pura de escrita (lançada) e a de vídeo (devolvida) viram o mesmo
 * estado.
 *
 * PROVIDER_CALLS = 0, por construção: só leituras do que o Radar congelou. O
 * modo vídeo lê também o resumo orgânico das lentes extras no cache (grátis),
 * como a rota no mesmo modo.
 */

export type RadarMcpMaterialMode = "writing" | "video";

export type RadarMcpMaterial =
  | {
    status: "ready";
    mode: RadarMcpMaterialMode;
    csv: string;
    filename: string | null;
    exportedAt: string;
    /** Só no modo "writing": artigos com `pode_escrever` = "Não". */
    blocked: number;
    /** Só no modo "video": artigos sem a pesquisa do YouTube gravada (a coluna pode_gravar diz). */
    withoutYoutube: number;
    /** 2026-10-12 · F6 · Aditivo, só no modo "writing" com um artigo: o grupo (cor e nome) dele, ou null. */
    group?: EditorialGroupLabel | null;
  }
  | {
    status: "needs_article_blueprint";
    mode: RadarMcpMaterialMode;
    missing: RadarPortableExportMissingBlueprint[];
    /** O teto do custo de organizar o que falta: até 2 chamadas de IA por artigo. */
    maxAiCalls: number;
    message: string;
  }
  | { status: "refused"; mode: RadarMcpMaterialMode; code: string; reason: string };

/** O que a projeção pura precisa da montagem (a rota lê os mesmos campos). */
export type RadarMcpMaterialAssembly = Pick<RadarPortableExportAssembly, "exportedAt" | "montadas" | "recusados" | "publicacoes" | "lentes" | "plano" | "planoDaSelecao" | "brandVoice">
  /* 2026-10-12 · F6 · o grupo de cada artigo (a montagem real sempre o traz; ausente = sem a linha do grupo). */
  & Partial<Pick<RadarPortableExportAssembly, "grupos">>;

/** As projeções puras do arquivo; injetáveis só para teste. */
export type RadarMcpMaterialProjections = {
  writing: typeof radarPortableWritingExport;
  video: typeof radarPortableVideoExport;
};

const PROJECOES: RadarMcpMaterialProjections = { writing: radarPortableWritingExport, video: radarPortableVideoExport };

/** A recusa lançada pela função pura de escrita (`RadarWritingNeedsArticleBlueprintError`), lida pelo código: os ids que faltam. */
function idsDaRecusaLancada(erro: unknown): string[] | null {
  const lido = erro as { code?: unknown; articleIds?: unknown } | null;
  if (!lido || typeof lido !== "object" || lido.code !== "needs_article_blueprint" || !Array.isArray(lido.articleIds)) return null;
  return radarExportNeedsArticleBlueprintIds(lido);
}

function precisaDaPlanta(mode: RadarMcpMaterialMode, montagem: RadarMcpMaterialAssembly, ids: readonly string[] | null): RadarMcpMaterial {
  const corpo = radarPortableExportNeedsBlueprintBody({ missing: radarPortableExportMissingBlueprints(montagem.montadas, ids, { mode }), refused: montagem.recusados });
  return { status: "needs_article_blueprint", mode, missing: corpo.missingArticleBlueprints, maxAiCalls: corpo.maxAiCalls, message: corpo.error };
}

/**
 * A DECISÃO, PURA, SOBRE A MONTAGEM — a mesma sequência da rota: sem montado,
 * a recusa de antes; sem a planta concluída de algum montado, o estado
 * explícito; com todas, o arquivo.
 */
export function radarMcpMaterialOf(
  mode: RadarMcpMaterialMode,
  montagem: RadarMcpMaterialAssembly,
  projecoes: RadarMcpMaterialProjections = PROJECOES,
): RadarMcpMaterial {
  /* A regra do artigo-modelo vem antes de qualquer projeção, como na rota. */
  /* 2026-10-09 (correção) · com o modo, a mesma regra da rota (no "writing", o vídeo como perfil primário não pede planta). */
  const semArtigoModelo = radarPortableExportMissingBlueprints(montagem.montadas, null, { mode });
  if (semArtigoModelo.length) return precisaDaPlanta(mode, montagem, null);

  if (!montagem.montadas.length) {
    const recusa = montagem.recusados[0];
    return {
      status: "refused", mode,
      code: recusa?.code ?? "radar_export_empty",
      reason: recusa?.reason ?? "O artigo não tem investigação finalizada para exportar.",
    };
  }

  if (mode === "video") {
    /* 2026-10-11 · com as publicações, como a rota: a identidade de publicação do artigo da linha (a mesma do CSV para escrever). */
    const video = projecoes.video({ articles: montagem.montadas, today: montagem.exportedAt, brandVoice: montagem.brandVoice, selectionPlan: montagem.planoDaSelecao, publications: montagem.publicacoes });
    if (radarExportNeedsArticleBlueprint(video)) return precisaDaPlanta(mode, montagem, radarExportNeedsArticleBlueprintIds(video));
    return { status: "ready", mode, csv: video.csv, filename: video.filename, exportedAt: montagem.exportedAt, blocked: 0, withoutYoutube: video.withoutYoutube };
  }

  let escrita: ReturnType<typeof radarPortableWritingExport>;
  try {
    escrita = projecoes.writing({
      articles: montagem.montadas, lenses: montagem.lentes, plan: montagem.plano, selectionPlan: montagem.planoDaSelecao,
      publications: montagem.publicacoes, today: montagem.exportedAt, brandVoice: montagem.brandVoice,
      ...(montagem.grupos?.size ? { groups: montagem.grupos } : {}),
    });
  } catch (erro) {
    const ids = idsDaRecusaLancada(erro);
    if (ids) return precisaDaPlanta(mode, montagem, ids);
    throw erro;
  }
  if (radarExportNeedsArticleBlueprint(escrita)) return precisaDaPlanta(mode, montagem, radarExportNeedsArticleBlueprintIds(escrita));
  const grupo = montagem.montadas.length === 1 ? montagem.grupos?.get(montagem.montadas[0].articleId) ?? null : null;
  return { status: "ready", mode, csv: escrita.csv ?? "", filename: escrita.filename, exportedAt: montagem.exportedAt, blocked: escrita.blocked, withoutYoutube: 0, group: grupo };
}

/*
 * ===== 2026-10-14 · A SERP CRUA DE UM ARTIGO, PELO MESMO NÚCLEO DA TELA =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §16.1.
 * `get_article_serp_raw` entrega o MESMO `<NN>-<papel>-<slug>-serp.csv` que a
 * exportação "para escrever" da tela põe no .zip: a mesma montagem (com o Silo da
 * seleção, o resumo orgânico das lentes extras e as páginas lidas) e a mesma
 * função pura (`radarSerpRawExport`). Não pede o artigo-modelo: é a SERP já
 * coletada, não a planta. PROVIDER_CALLS = 0: só leituras do que o Radar congelou
 * e do cache.
 */
export type RadarMcpSerpRaw =
  | { status: "ready"; csv: string; filename: string; exportedAt: string; rows: number }
  | { status: "refused"; code: string; reason: string };

export function radarMcpSerpRawOf(montagem: Pick<RadarPortableExportAssembly, "exportedAt" | "montadas" | "recusados" | "lentes" | "planoDaSelecao">): RadarMcpSerpRaw {
  if (!montagem.montadas.length) {
    const recusa = montagem.recusados[0];
    return { status: "refused", code: recusa?.code ?? "radar_export_empty", reason: recusa?.reason ?? "O artigo não tem investigação finalizada para exportar." };
  }
  const [arquivo] = radarSerpRawExport({ articles: montagem.montadas, lookups: montagem.lentes.lookups, today: montagem.exportedAt, positionOf: radarSerpRawPositionOf(montagem.planoDaSelecao) });
  return { status: "ready", csv: arquivo.csv, filename: arquivo.filename, exportedAt: montagem.exportedAt, rows: arquivo.rows };
}

export async function radarMcpSerpRawForArticle(input: {
  brandId: string;
  articleId: string;
  supabase: Parameters<typeof assembleRadarPortableExport>[0]["supabase"];
  actorUserId: string;
}): Promise<RadarMcpSerpRaw> {
  const montagem = await assembleRadarPortableExport({
    brandId: input.brandId,
    articleIds: [input.articleId],
    supabase: input.supabase,
    actorUserId: input.actorUserId,
    selectionSiloContext: true,
    videoLensDigests: true,
    serpRawPages: true,
  });
  return radarMcpSerpRawOf(montagem);
}

/**
 * Um artigo, montado como a rota monta no modo pedido: o Silo da seleção nos
 * dois modos (`selectionSiloContext`), a estrutura da página publicada lida
 * (só GET) e, só no vídeo, o resumo orgânico das lentes extras.
 *
 * A leitura do artigo-modelo que falha (`blueprint_unavailable`, 503) sobe como
 * veio: nada é montado sem a planta.
 */
export async function radarMcpMaterialForArticle(input: {
  brandId: string;
  articleId: string;
  mode: RadarMcpMaterialMode;
  supabase: Parameters<typeof assembleRadarPortableExport>[0]["supabase"];
  actorUserId: string;
}): Promise<RadarMcpMaterial> {
  const montagem = await assembleRadarPortableExport({
    brandId: input.brandId,
    articleIds: [input.articleId],
    supabase: input.supabase,
    actorUserId: input.actorUserId,
    readPublishedStructure: radarReadPublishedStructure,
    selectionSiloContext: true,
    videoLensDigests: input.mode === "video",
  });
  return radarMcpMaterialOf(input.mode, montagem);
}
