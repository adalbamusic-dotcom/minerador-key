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

/** O teto da prévia de texto de um vídeo selecionado. Nunca a transcrição inteira. */
const PREVIA = 600;
/**
 * 2026-10-02 · O teto do CORPO lido para escolher o trecho ligado ao tema (CSV
 * de vídeo). O começo da fala costuma ser saudação ("olá pessoal, sejam bem
 * vindos"); o trecho útil está adiante. 20 mil caracteres cobrem uns 15 minutos
 * de fala, só dos vídeos que a marca selecionou com modo.
 */
const CORPO = 20_000;

/**
 * OS MODOS DO LOTE, para o export — UMA leitura de vínculos para todos os artigos.
 *
 * Só os vínculos ATIVOS com modo entram; sem nenhum, nada mais é lido e o
 * export sai byte a byte como antes. Os metadados vêm de `radar_video_sources`
 * (título, endereço, canal, duração, descrição).
 *
 * Revisão de 2026-10-02 (pedido do dono): o começo do texto corrente é lido
 * para Contexto E Sugestão de pauta, com ou sem descrição — a descrição do
 * YouTube costuma ser promocional e não diz do que o vídeo trata; ela fica só
 * como último recurso. A leitura continua UMA para o lote e curta (prévia de
 * 600 caracteres, cortada de novo na projeção). Apoio, Citação e Incorporar
 * continuam sem prévia: eles levam o trecho casado.
 *
 * 2026-10-02 · Revisão da frente: a prévia passa a ser lida para TODO modo
 * (o CSV de vídeo diz do que cada vídeo selecionado trata), e só da versão
 * corrente de cada fonte. No CSV para escrever nada muda: Apoio, Citação e
 * Incorporar seguem levando o trecho casado, não a prévia.
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

    /*
     * Prévia do texto: o começo da transcrição CORRENTE de cada vídeo com modo.
     *
     * 2026-10-02 · revisão da frente: a leitura trazia `transcript_text` INTEIRO
     * de TODAS as versões de processamento só para guardar 600 caracteres. Agora
     * são duas consultas, presas à marca e a ORIGINAL_TRANSCRIPT: a primeira lê
     * só os números de versão (sem texto) e escolhe a maior por fonte; a segunda
     * lê o texto só dessas versões, cortado assim que chega. O banco não corta
     * texto pelo PostgREST: o corte é aqui, antes de qualquer outro uso.
     *
     * 2026-10-02 · E PARA TODO MODO (pedido do dono, CSV de vídeo): quem grava
     * precisa saber do que cada vídeo selecionado trata, também em Apoio,
     * Citação e Incorporar. O resumo do CSV para escrever continua só de
     * Contexto e Sugestão de pauta (`portable-annex-context`): os outros modos
     * seguem levando o trecho casado.
     */
    const precisamDePrevia = [...new Set(comModo.map(linha => linha.videoSourceId))];
    const previas = new Map<string, string>();
    const corpos = new Map<string, string>();
    if (precisamDePrevia.length) {
      const versoes = await client.from("radar_video_source_texts")
        .select("id,video_source_id,processing_version")
        .eq("brand_id", brandId)
        .eq("content_kind", "ORIGINAL_TRANSCRIPT")
        .in("video_source_id", precisamDePrevia)
        .order("processing_version", { ascending: false });
      if (versoes.error) avisar("export_usage_text_read_failed", versoes.error);
      else {
        /* A maior versão por fonte: a corrente. */
        const corrente = new Map<string, { id: string; versao: number }>();
        for (const linha of (versoes.data || []) as unknown as Array<Record<string, unknown>>) {
          const fonte = String(linha.video_source_id);
          const versao = Number(linha.processing_version);
          if (!linha.id || !Number.isFinite(versao)) continue;
          const atual = corrente.get(fonte);
          if (!atual || versao > atual.versao) corrente.set(fonte, { id: String(linha.id), versao });
        }
        const escolhidas = new Map([...corrente.entries()].map(([fonte, item]) => [item.id, fonte]));
        if (escolhidas.size) {
          const textos = await client.from("radar_video_source_texts")
            .select("id,video_source_id,transcript_text")
            .eq("brand_id", brandId)
            .eq("content_kind", "ORIGINAL_TRANSCRIPT")
            .in("id", [...escolhidas.keys()]);
          if (textos.error) avisar("export_usage_text_read_failed", textos.error);
          else {
            for (const linha of (textos.data || []) as unknown as Array<Record<string, unknown>>) {
              /* Só a versão escolhida, e da fonte que a escolheu. */
              const fonte = escolhidas.get(String(linha.id));
              if (!fonte || fonte !== String(linha.video_source_id) || previas.has(fonte)) continue;
              const bruto = typeof linha.transcript_text === "string" ? linha.transcript_text.slice(0, CORPO) : "";
              const texto = textoOuNulo(bruto);
              if (texto) {
                const corrido = texto.replace(/\s+/g, " ");
                previas.set(fonte, corrido.slice(0, PREVIA));
                corpos.set(fonte, corrido);
              }
            }
          }
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
        textBody: corpos.get(linha.videoSourceId) ?? null,
      });
      saida.set(linha.articleId, lista);
    }
  } catch (erro) {
    avisar("export_usage_read_failed", erro);
    return new Map();
  }
  return saida;
}
