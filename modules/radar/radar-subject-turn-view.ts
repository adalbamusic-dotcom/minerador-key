import { radarIsSubjectTurnSection } from "@/lib/radar/declared-subject";

/**
 * A SEÇÃO DA VIRADA NA TELA — SDD do Assunto, F3.1.
 *
 * Com Assunto declarado e nenhum bloco da amostra que o cubra, o blueprint
 * ganha a seção sintética "Virada para <Assunto>". Ela é EXIGIDA pelo Assunto,
 * não OBSERVADA na SERP: não conta como candidato observado, não ganha número
 * na lista dos blocos da amostra e aparece com rótulo próprio.
 *
 * Sem Assunto não existe seção da virada, e cada texto aqui volta exatamente
 * ao que a tela mostrava antes.
 *
 * Domínio de tela puro: sem fetch, sem storage, sem provider.
 */

export const RADAR_SUBJECT_TURN_SCREEN_LABEL = "Exigida pelo Assunto";

type ComId = { id: string };

/** A seção é a virada do Assunto? */
export const radarIsSubjectTurnScreenSection = (section: ComId) => radarIsSubjectTurnSection(section.id);

/** Quantos blocos vieram da amostra, e quantos o Assunto exigiu. */
export function radarObservedSectionCounts(sections: readonly ComId[]): { observed: number; required: number } {
  const required = sections.filter(radarIsSubjectTurnScreenSection).length;
  return { observed: sections.length - required, required };
}

/**
 * O RÓTULO DO DISCLOSURE "Ver candidatos observados".
 *
 * O número é de candidatos OBSERVADOS. A seção da virada entra ao lado, dita
 * pelo nome, e nunca somada à contagem da amostra.
 */
export function radarCandidateEvidenceLabel(sections: readonly ComId[]): string {
  const { observed, required } = radarObservedSectionCounts(sections);
  const base = `Ver candidatos observados · ${observed}`;
  if (!required) return base;
  return `${base} · ${required} ${required === 1 ? "exigida" : "exigidas"} pelo Assunto`;
}

/**
 * A NUMERAÇÃO DOS BLOCOS DA AMOSTRA.
 *
 * Cada bloco observado recebe o seu número na ordem em que aparece; a seção da
 * virada recebe `null` e mostra o rótulo próprio no lugar do número.
 */
export function radarObservedSectionNumbers(sections: readonly ComId[]): Array<number | null> {
  let contador = 0;
  return sections.map(section => radarIsSubjectTurnScreenSection(section) ? null : ++contador);
}
