/**
 * ===== O MINERADOR EXCLUI; O ARQUITETO DESMONTA ANTES (2026-10-18) =====
 *
 * Decisão do dono (literal): "sobre apagar, tem que poder apagar sim não
 * interessa qual seja o estado, isso está no contrato global, tudo tem que
 * poder ser apagado e claro com instâncias de seleção e confirmação, e alerta
 * falando o que está apagando. mas tem que poder apagar tudo sim".
 *
 * A keyword que está no ArticleDNA vigente de um artigo do Arquiteto deixa de
 * ficar fora ("architect_reference", SUBSTITUÍDO): a exclusão do Minerador
 * ("Excluir" e "Excluir tudo da cor") pede ao Arquiteto, pelo MESMO núcleo do
 * "Desfazer Silo" (`lib/server/arquiteto-territory-undo.ts`), a prévia do que
 * sai lá — o Silo inteiro quando todos os artigos dele (ou o Pilar) saem, o
 * artigo pela "Retirar artigo do Silo" quando o Silo fica com os outros, o
 * artigo sem Silo pelo evento `rejected` —, mostra isso por área na MESMA
 * prévia (o alerta) e, na confirmação forte de sempre, desmonta ANTES de
 * excluir as keywords. Se o desmonte não fecha, nenhuma keyword é excluída e o
 * resultado diz o que foi feito e o que não foi.
 *
 * Este arquivo é o CONTRATO (tipos) entre o Minerador e o Arquiteto; quem
 * implementa a porta é o servidor do Arquiteto (`architectDismantlePort`).
 * Domínio puro: sem rede.
 */

export type ArchitectDismantleAreaLines = { arquiteto: string[]; radar: string[]; redator: string[]; publicacoes: string[] };

export type ArchitectDismantlePreview = {
  /** As keywords pedidas que têm artigo vigente no Arquiteto (as que o desmonte cobre). */
  keywordIds: string[];
  /** Os artigos que saem de vigência (o ArticleDNA vigente recebe `rejected`). */
  articleIds: string[];
  /** Os Silos desfeitos inteiros. */
  territoryRefs: string[];
  /** Os artigos que perdem a etiqueta da cor. */
  untagArticleIds: string[];
  /** Os grupos desligados do Silo. */
  unlinkGroupIds: string[];
  /** O alerta, por área. */
  areas: ArchitectDismantleAreaLines;
  /** O mesmo alerta, numa lista só, na ordem da prévia. */
  lines: string[];
  /** A base do `decisionHash`: mudou qualquer coisa no Arquiteto, a decisão é outra. */
  basis: Record<string, unknown>;
};

export type ArchitectDismantleResult =
  | { ok: true; applied: string[] }
  | { ok: false; applied: string[]; notApplied: string[]; message: string };

export type ArchitectDismantlePort = {
  /** A prévia (só leitura, grátis). `ok: false` = não dá para ler/desmontar agora (o motivo vai na prévia). */
  preview(input: { keywordIds: readonly string[]; linkedTerritoryRef: string | null }): Promise<{ ok: true; preview: ArchitectDismantlePreview } | { ok: false; message: string }>;
  /** O desmonte, sobre a MESMA base da prévia (`basis`); outra base = nada é feito. */
  apply(input: { keywordIds: readonly string[]; linkedTerritoryRef: string | null; basis: Record<string, unknown> }): Promise<ArchitectDismantleResult>;
};

/** O que não precisa de desmonte: nenhuma keyword pedida está num artigo vigente. */
export const EMPTY_ARCHITECT_DISMANTLE: ArchitectDismantlePreview = {
  keywordIds: [],
  articleIds: [],
  territoryRefs: [],
  untagArticleIds: [],
  unlinkGroupIds: [],
  areas: { arquiteto: [], radar: [], redator: [], publicacoes: [] },
  lines: [],
  basis: { operation: "architect_dismantle@1", empty: true },
};

/** A frase do resultado quando o desmonte não fechou (nenhuma keyword é excluída). */
export function architectDismantleFailureMessage(result: Extract<ArchitectDismantleResult, { ok: false }>): string {
  const feito = result.applied.length ? ` Já feito no Arquiteto: ${result.applied.join(" · ")}.` : " Nada foi feito no Arquiteto.";
  const falta = result.notApplied.length ? ` Não feito: ${result.notApplied.join(" · ")}.` : "";
  return `Nada foi excluído no Minerador: o desmonte no Arquiteto não fechou (${result.message}).${feito}${falta} Gere a prévia de novo (é seguro: o que já saiu não volta a ser pedido).`;
}
