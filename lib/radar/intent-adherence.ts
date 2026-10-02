import { radarSemanticStems } from "./semantic-concept-model.ts";

/**
 * ADERÊNCIA AO NÚCLEO DO ARTIGO (SDD diretriz editorial, 2026-10-02).
 *
 * "Compartilhar uma raiz com o território" deixava qualquer listicle genérico
 * virar seção, abertura ou diferencial: em "como atrair clientes pelo
 * instagram", a palavra "instagram" sozinha casava "Ative o Instagram
 * Shopping" e "Influencers de IA do Instagram". Uma raiz que aparece em quase
 * toda a amostra não distingue nada — é o cenário, não o assunto.
 *
 * Adere quem toca DUAS raízes do núcleo, ou UMA raiz distintiva (que não é
 * onipresente na amostra). Domínio puro.
 */

/** Raízes presentes em pelo menos `limiar` dos textos (só com amostra mínima). */
export function radarUbiquitousStems(textos: readonly string[], limiar = 0.5, amostraMinima = 4): Set<string> {
  if (textos.length < amostraMinima) return new Set();
  const contagem = new Map<string, number>();
  for (const texto of textos) for (const raiz of new Set(radarSemanticStems(texto))) contagem.set(raiz, (contagem.get(raiz) || 0) + 1);
  return new Set([...contagem].filter(([, vezes]) => vezes / textos.length >= limiar).map(([raiz]) => raiz));
}

export function radarAdheresToCore(input: {
  stems: Iterable<string>;
  core: ReadonlySet<string>;
  ubiquitous?: ReadonlySet<string>;
}): boolean {
  const comuns = [...new Set(input.stems)].filter(raiz => input.core.has(raiz));
  if (comuns.length >= 2) return true;
  return comuns.some(raiz => !input.ubiquitous?.has(raiz));
}

export function radarTextAdheresToCore(texto: string, core: ReadonlySet<string>, ubiquitous?: ReadonlySet<string>): boolean {
  return radarAdheresToCore({ stems: radarSemanticStems(texto), core, ubiquitous });
}
