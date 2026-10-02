import "server-only";
import { resolveBrandSkill } from "@/lib/marca/brand-skill-domain";
import { listPersistedBrandSkills } from "@/lib/server/brand-skills";
import { radarBrandVoiceFromSkill, type RadarBrandVoiceState } from "@/lib/radar/brand-voice";

/**
 * A VOZ DA MARCA PARA O RADAR (SDD diretriz editorial, Adendo C — 2026-10-02).
 *
 * Reaproveita o repositório da Marca e a regra canônica dela (spec da Marca §24,
 * `resolveBrandSkill`): a versão corrente não arquivada da Skill `brand_voice`.
 * Uma pergunta, uma resposta — a mesma que o Redator e a Marca dão.
 *
 * Só chamar DEPOIS de autorizar a marca: o repositório lê com service_role e
 * isola pelo `marca_id`. A leitura é contexto, não condição: falhou, o
 * entregável sai sem a voz e diz por quê.
 */
export async function readRadarBrandVoice(
  brandId: string,
  deps: { list: typeof listPersistedBrandSkills } = { list: listPersistedBrandSkills },
): Promise<RadarBrandVoiceState> {
  try {
    const versoes = await deps.list(brandId);
    const corrente = resolveBrandSkill({ skills: versoes.map(item => item.skill), brandId, definitionKey: "brand_voice" });
    const voz = corrente ? radarBrandVoiceFromSkill(corrente) : null;
    return voz ? { kind: "available", voice: voz } : { kind: "none" };
  } catch (erro) {
    console.warn("[radar-brand-voice] read_failed", { message: erro instanceof Error ? erro.message.slice(0, 240) : "falha desconhecida" });
    return { kind: "unreadable", reason: "a leitura das Skills da Marca falhou" };
  }
}
