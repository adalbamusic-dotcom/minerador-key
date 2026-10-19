export function normalizeTypedConfirmation(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

export function typedConfirmationMatches(value: string, confirmationName: string): boolean {
  const normalizedName = confirmationName.trim();
  return normalizedName.length > 0
    && normalizeTypedConfirmation(value) === normalizeTypedConfirmation(normalizedName);
}

/*
 * ===== A CONFIRMAÇÃO DA EXCLUSÃO — UMA REGRA SÓ (2026-10-17) =====
 *
 * SDD `docs/compartilhado/sdd-linha-unica-do-minerador-2026-10-16.md` (APROVADA),
 * P-4: "a mesma confirmação forte e com hash nos dois casos" — a exclusão comum
 * (selecionar → Excluir) e "Excluir tudo da cor". A tela e o servidor conferem
 * por ESTA função; nenhuma das duas exclusões tem regra própria.
 *
 *   - Simples (como sempre): o nome digitado — uma keyword, o nome dela; várias,
 *     "N keywords selecionadas".
 *   - Forte: quando a exclusão mexe no plano do Silo (keyword que carrega
 *     Assunto do plano), quando passa de DELETE_STRONG_CONFIRMATION_ABOVE
 *     keywords ou quando é a cor inteira: o nome de cada cor cujo plano muda,
 *     "apaga de vez" se há exclusão definitiva e o nome de cada publicada que vai
 *     para a lixeira de 24 h.
 */

/** O texto da confirmação forte quando há exclusão definitiva. */
export const DELETE_HARD_PHRASE = "apaga de vez" as const;
/** Acima disto, a exclusão comum pede a confirmação forte, mesmo sem plano. */
export const DELETE_STRONG_CONFIRMATION_ABOVE = 10;

export type DeleteConfirmationRequirement = {
  /** A confirmação simples (o nome digitado de sempre); `null` quando vale a forte. */
  selectionName: string | null;
  /** Forte: o nome de cada cor cujo plano muda (em "Excluir tudo da cor", a cor). */
  colorWords: string[];
  /** Forte: "apaga de vez" quando há exclusão definitiva. */
  hardPhrase: string | null;
  /** Forte: o nome de cada publicada que vai para a lixeira de 24 h. */
  publishedNames: Array<{ id: string; keyword: string }>;
};

export type DeleteConfirmationTyped = {
  /** A confirmação simples. */
  selection?: unknown;
  /** O nome digitado de cada cor, pela palavra da cor ("amarelo" → o que foi digitado). */
  colors?: Record<string, unknown> | null;
  phrase?: unknown;
  /** O nome digitado de cada publicada, por id. */
  publishedNames?: Record<string, unknown> | null;
};

export type DeleteConfirmationCheck =
  | { ok: true }
  | { ok: false; code: "CONFIRMATION_REQUIRED"; missing: string[]; message: string };

const digitado = (value: unknown) => (typeof value === "string" ? normalizeTypedConfirmation(value) : "");

/** Quando a exclusão pede a confirmação forte e o que ela pede. */
export function deleteConfirmationRequirement(input: {
  selectionName: string;
  colorWords: readonly string[];
  hardCount: number;
  recoverable: ReadonlyArray<{ id: string; keyword: string }>;
  /** "Excluir tudo da cor" é sempre forte. */
  alwaysStrong?: boolean;
}): DeleteConfirmationRequirement {
  const total = input.hardCount + input.recoverable.length;
  const colorWords = [...new Set(input.colorWords.map(word => word.trim()).filter(Boolean))];
  const forte = input.alwaysStrong === true || colorWords.length > 0 || total > DELETE_STRONG_CONFIRMATION_ABOVE;
  if (!forte) return { selectionName: input.selectionName, colorWords: [], hardPhrase: null, publishedNames: [] };
  return {
    selectionName: null,
    colorWords,
    hardPhrase: input.hardCount > 0 ? DELETE_HARD_PHRASE : null,
    publishedNames: input.recoverable.map(item => ({ id: item.id, keyword: item.keyword })),
  };
}

/** Confere o que foi digitado contra a regra (a tela e o servidor chamam a MESMA). */
export function checkDeleteConfirmation(requirement: DeleteConfirmationRequirement, typed: DeleteConfirmationTyped): DeleteConfirmationCheck {
  const faltam: string[] = [];
  if (requirement.selectionName !== null && !typedConfirmationMatches(typeof typed.selection === "string" ? typed.selection : "", requirement.selectionName)) {
    faltam.push(`“${requirement.selectionName}”`);
  }
  const cores = typed.colors && typeof typed.colors === "object" ? typed.colors : {};
  for (const cor of requirement.colorWords) {
    if (digitado(cores[cor]) !== normalizeTypedConfirmation(cor)) faltam.push(`o nome da cor (“${cor}”)`);
  }
  if (requirement.hardPhrase && digitado(typed.phrase) !== normalizeTypedConfirmation(requirement.hardPhrase)) faltam.push(`“${requirement.hardPhrase}”`);
  const nomes = typed.publishedNames && typeof typed.publishedNames === "object" ? typed.publishedNames : {};
  for (const publicada of requirement.publishedNames) {
    if (digitado(nomes[publicada.id]) !== normalizeTypedConfirmation(publicada.keyword)) faltam.push(`o nome da publicada “${publicada.keyword}”`);
  }
  if (!faltam.length) return { ok: true };
  return { ok: false, code: "CONFIRMATION_REQUIRED", missing: faltam, message: `Nada foi excluído: falta digitar ${faltam.join(", ")}.` };
}
