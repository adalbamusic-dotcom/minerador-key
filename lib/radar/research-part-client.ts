/**
 * ===== A PORTA DA LEITURA SOB DEMANDA — RADAR_FINAL_2.1 · §4, §6 e §10 =====
 *
 * Uma função para os três perfis e para as duas partes. O perfil é parâmetro:
 * três clientes para a mesma pergunta divergiriam na primeira correção feita só
 * num deles.
 *
 * ==================== O CACHE NÃO É AUTORIDADE — §10 ====================
 *
 * A resposta traz `analysisVersionId`. Guardar a amostra sob essa chave é
 * seguro; guardá-la sob `articleId` não é — uma nova coleta produz outra versão,
 * e o cache mostraria a amostra de uma investigação sobre a fotografia de outra.
 *
 * Quando a identidade muda, o cache não é consultado. Ele acelera; não decide.
 */

import type { RadarResearchProfile } from "./research-profile.ts";
import type {
  RadarResearchLazyPart,
  RadarResearchProvenancePayload,
  RadarResearchSamplePayload,
} from "./research-read-model.ts";

export type RadarResearchPartResult<T> =
  | { ok: true; analysisVersionId: string | null; data: T }
  | { ok: false; message: string };

type Pedido = {
  brandId: string;
  articleId: string;
  profile: RadarResearchProfile;
  part: RadarResearchLazyPart;
  fetchImpl?: typeof fetch;
};

/**
 * NUNCA LANÇA.
 *
 * Um erro de leitura da amostra não pode derrubar a tela de uma investigação
 * FINALIZED: a fotografia continua válida e o Blueprint continua legível. O que
 * falha é o disclosure, e ele diz isso com um botão de tentar de novo (§11).
 */
async function buscar<T>(pedido: Pedido, extrair: (corpo: Record<string, unknown>) => T): Promise<RadarResearchPartResult<T>> {
  const chamar = pedido.fetchImpl || fetch;
  const parametros = new URLSearchParams({
    brandId: pedido.brandId,
    articleId: pedido.articleId,
    profile: pedido.profile,
    part: pedido.part,
  });

  try {
    const resposta = await chamar(`/api/editorial/radar-research-part?${parametros.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const corpo = await resposta.json().catch(() => ({} as Record<string, unknown>));

    if (!resposta.ok || corpo?.success !== true || corpo?.readbackConfirmed !== true) {
      return { ok: false, message: typeof corpo?.error === "string" ? corpo.error : "Não foi possível carregar a amostra." };
    }
    return {
      ok: true,
      analysisVersionId: typeof corpo.analysisVersionId === "string" ? corpo.analysisVersionId : null,
      data: extrair(corpo),
    };
  } catch (erro) {
    return { ok: false, message: erro instanceof Error ? erro.message : "Não foi possível carregar a amostra." };
  }
}

export const loadRadarResearchSample = (pedido: Omit<Pedido, "part">) =>
  buscar<RadarResearchSamplePayload>({ ...pedido, part: "sample" }, corpo => corpo.sample as RadarResearchSamplePayload);

export const loadRadarResearchProvenance = (pedido: Omit<Pedido, "part">) =>
  buscar<RadarResearchProvenancePayload>({ ...pedido, part: "provenance" }, corpo => corpo.provenance as RadarResearchProvenancePayload);
