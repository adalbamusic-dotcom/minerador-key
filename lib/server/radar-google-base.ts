import "server-only";
import { RADAR_FORMAT_EXTENSION_NEEDS_GOOGLE, radarGoogleBaseCommitment } from "../radar/search-mode";
import { RadarStartError, radarStartPorts, type RadarStartPorts } from "./radar-youtube-start";

/**
 * ===== O GOOGLE É A BASE, NA PORTA DAS ROTAS PAGAS — SDD Radar 2026-09-30, Parte A =====
 *
 * YouTube (vídeo) e Amazon (review) são ACRÉSCIMOS: sem o Google finalizado, e
 * sem corrida do mesmo formato já gravada, a rota recusa antes de qualquer
 * gasto. É a mesma regra que a tela usa para desabilitar o botão
 * (`radarGoogleBaseCommitment`). Fica na porta das rotas, e não dentro dos
 * orquestradores do início, porque a mecânica do início (contexto,
 * compromisso, corrida, releitura) não mudou e continua neutra de modo.
 */
export async function assertRadarGoogleBase(
  input: { brandId: string; articleId: string; mode: "YOUTUBE" | "AMAZON" },
  ports: Pick<RadarStartPorts, "loadRadarState"> = radarStartPorts,
): Promise<void> {
  const estado = await ports.loadRadarState({ brandId: input.brandId, articleId: input.articleId });
  const corrente = estado?.analyses[estado.analyses.length - 1] ?? null;
  const base = radarGoogleBaseCommitment({ mode: input.mode, payload: corrente?.payload ?? null });
  if (!base.canStart) throw new RadarStartError("radar_google_base_required", base.reason || RADAR_FORMAT_EXTENSION_NEEDS_GOOGLE, 409);
}
