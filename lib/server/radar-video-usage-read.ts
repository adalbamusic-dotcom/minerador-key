import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { radarVideoUsageOf, type RadarVideoUsage } from "@/lib/radar/video-library";
import type { RadarPortableVideoUsageInput } from "@/lib/radar/portable-annex-context";

/**
 * ===== O MODO DE USO DOS VÍDEOS, LIDO À PARTE — Adendo B (D6), 2026-10-02 =====
 *
 * `usage` e `usage_note` vivem em `radar_article_video_sources`, a mesma tabela
 * dos vínculos. Elas são lidas numa CONSULTA SEPARADA e tolerante, e não na
 * leitura dos vínculos, por um motivo só: se a coluna não existir (42703, a
 * migration 20261002120000 ainda não aplicada) ou o banco recusar, a aba
 * Vídeos e o export continuam exatamente como antes — sem modos, sem quebrar.
 *
 * A leitura é CONTEXTO, nunca condição. O mesmo desenho de
 * `radar-article-blueprint-read.ts`.
 */

export type RadarArticleVideoUsageMap = Map<string, { usage: RadarVideoUsage | null; note: string | null }>;

const avisar = (onde: string, erro: unknown) => console.warn(`[radar-video-usage] ${onde}`, {
  message: erro instanceof Error ? erro.message.slice(0, 240) : typeof erro === "object" && erro && "message" in erro ? String((erro as { message: unknown }).message).slice(0, 240) : "falha desconhecida",
  code: typeof erro === "object" && erro && "code" in erro ? String((erro as { code: unknown }).code) : null,
});

const textoOuNulo = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor.trim() : null);

/**
 * OS MODOS DE UM ARTIGO, para a tela.
 *
 * `null` = leitura indisponível (a tela não oferece o seletor). Um mapa vazio
 * = lido, e nenhum vínculo ativo tem modo.
 */
export async function readRadarArticleVideoUsages(
  client: SupabaseClient,
  brandId: string,
  articleId: string | null,
): Promise<RadarArticleVideoUsageMap | null> {
  if (!articleId) return null;
  try {
    const leitura = await client.from("radar_article_video_sources")
      .select("video_source_id,usage,usage_note")
      .eq("brand_id", brandId)
      .eq("article_id", articleId)
      .eq("status", "ACTIVE");
    if (leitura.error) {
      avisar("article_usage_read_failed", leitura.error);
      return null;
    }
    const mapa: RadarArticleVideoUsageMap = new Map();
    for (const linha of (leitura.data || []) as unknown as Array<Record<string, unknown>>) {
      mapa.set(String(linha.video_source_id), { usage: radarVideoUsageOf(linha.usage), note: textoOuNulo(linha.usage_note) });
    }
    return mapa;
  } catch (erro) {
    avisar("article_usage_read_failed", erro);
    return null;
  }
}

/** O teto da prévia de texto que o Contexto pode levar. Nunca a transcrição. */
const PREVIA = 600;

/**
 * OS MODOS DO LOTE, para o export — UMA leitura de vínculos para todos os artigos.
 *
 * Só os vínculos ATIVOS com modo entram; sem nenhum, nada mais é lido e o
 * export sai byte a byte como antes. Os metadados vêm de `radar_video_sources`
 * (título, endereço, canal, duração, descrição). O começo do texto corrente só
 * é lido para Contexto SEM descrição — é o único modo em que ele serve, e
 * mesmo assim curto.
 *
 * Nada aqui entra no pacote congelado nem no hash: é leitura ao vivo, como a
 * voz da marca. Mudar o modo não refinaliza nada nem orfana o artigo-modelo.
 */
export async function readRadarVideoUsagesForExport(
  client: SupabaseClient,
  brandId: string,
  articleIds: readonly string[],
): Promise<Map<string, RadarPortableVideoUsageInput[]>> {
  const saida = new Map<string, RadarPortableVideoUsageInput[]>();
  const ids = [...new Set(articleIds)].filter(Boolean);
  if (!ids.length) return saida;
  try {
    const vinculos = await client.from("radar_article_video_sources")
      .select("article_id,video_source_id,usage,usage_note")
      .eq("brand_id", brandId)
      .eq("status", "ACTIVE")
      .in("article_id", ids);
    if (vinculos.error) {
      avisar("export_usage_read_failed", vinculos.error);
      return saida;
    }
    const comModo = ((vinculos.data || []) as unknown as Array<Record<string, unknown>>)
      .map(linha => ({
        articleId: String(linha.article_id),
        videoSourceId: String(linha.video_source_id),
        usage: radarVideoUsageOf(linha.usage),
        note: textoOuNulo(linha.usage_note),
      }))
      .filter((linha): linha is typeof linha & { usage: RadarVideoUsage } => linha.usage !== null);
    if (!comModo.length) return saida;

    const fontesIds = [...new Set(comModo.map(linha => linha.videoSourceId))];
    const metadados = new Map<string, Record<string, unknown>>();
    const fontes = await client.from("radar_video_sources")
      .select("id,video_title,display_name,normalized_url,channel_title,video_description,duration,registration_status")
      .eq("brand_id", brandId)
      .in("id", fontesIds);
    /*
     * VÍDEO ARQUIVADO NA BIBLIOTECA NÃO VAI AO ENTREGÁVEL (revisão de 2026-10-02).
     *
     * O arquivamento item a item pode deixar o vínculo ACTIVE; na tela ele só
     * aparece em "Arquivadas". Sem este corte, continuaria indo ao CSV como
     * Incorporar ou Citação sem ninguém ver.
     */
    const arquivadas = new Set<string>();
    if (fontes.error) avisar("export_usage_sources_read_failed", fontes.error);
    else for (const linha of (fontes.data || []) as unknown as Array<Record<string, unknown>>) {
      if (linha.registration_status === "ARCHIVED") arquivadas.add(String(linha.id));
      else metadados.set(String(linha.id), linha);
    }
    if (arquivadas.size) {
      for (let indice = comModo.length - 1; indice >= 0; indice -= 1) if (arquivadas.has(comModo[indice].videoSourceId)) comModo.splice(indice, 1);
      if (!comModo.length) return saida;
    }

    /* Prévia do texto: só para Contexto sem descrição, e só a versão corrente. */
    const precisamDePrevia = [...new Set(comModo
      .filter(linha => linha.usage === "CONTEXT" && !textoOuNulo(metadados.get(linha.videoSourceId)?.video_description))
      .map(linha => linha.videoSourceId))];
    const previas = new Map<string, string>();
    if (precisamDePrevia.length) {
      const textos = await client.from("radar_video_source_texts")
        .select("video_source_id,transcript_text,processing_version")
        .eq("brand_id", brandId)
        .eq("content_kind", "ORIGINAL_TRANSCRIPT")
        .in("video_source_id", precisamDePrevia)
        .order("processing_version", { ascending: false });
      if (textos.error) avisar("export_usage_text_read_failed", textos.error);
      else {
        for (const linha of (textos.data || []) as unknown as Array<Record<string, unknown>>) {
          const id = String(linha.video_source_id);
          /* A ordenação traz a maior versão primeiro; a primeira vence. */
          if (previas.has(id)) continue;
          const texto = textoOuNulo(linha.transcript_text);
          if (texto) previas.set(id, texto.replace(/\s+/g, " ").slice(0, PREVIA));
        }
      }
    }

    for (const linha of comModo) {
      const meta = metadados.get(linha.videoSourceId) || {};
      const lista = saida.get(linha.articleId) || [];
      lista.push({
        videoSourceId: linha.videoSourceId,
        usage: linha.usage,
        note: linha.note,
        /* A mesma ordem da tela (`radarVideoSourceDisplay`): o título do vídeo antes do apelido. */
        title: textoOuNulo(meta.video_title) || textoOuNulo(meta.display_name),
        url: textoOuNulo(meta.normalized_url),
        channel: textoOuNulo(meta.channel_title),
        duration: textoOuNulo(meta.duration),
        description: textoOuNulo(meta.video_description),
        textPreview: previas.get(linha.videoSourceId) ?? null,
      });
      saida.set(linha.articleId, lista);
    }
  } catch (erro) {
    avisar("export_usage_read_failed", erro);
    return new Map();
  }
  return saida;
}
