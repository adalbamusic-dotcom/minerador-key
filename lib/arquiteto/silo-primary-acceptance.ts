/**
 * O ACEITE DA PROPOSTA DA SERP PARA A PRIMÁRIA DO SILO (adendo das 4 lentes, A9).
 *
 * A SERP propõe; a primária só passa a existir quando uma pessoa aceita. Este
 * módulo é a porta dessa escrita, e ela tem três travas:
 *
 *   1. quem aceitou e quando vêm do SERVIDOR (ator da sessão, hora do
 *      servidor) — o navegador não declara nenhum dos dois;
 *   2. a precedência humano > publicado > SERP vale também na escrita: uma
 *      primária humana ou publicada nunca é trocada por aqui;
 *   3. a proposta foi calculada sobre uma primária; se ela mudou desde então,
 *      o aceite é recusado em vez de gravar sobre outro estado;
 *   4. só vale para a origem LISTA NOVA: Silo publicado ou existente não
 *      recebe primária pela SERP, mesmo sem primária declarada;
 *   5. a keyword aceita precisa estar neste Silo, na marca ativa — lido do
 *      banco, não do navegador.
 *
 * A criação de território também não aceita primária `serp` nem humana.
 *
 * E a porta genérica (`territoryUpdates`) deixa de poder mudar a primária: sem
 * isso, qualquer cliente regravaria a primária com um `confirmedBy` inventado.
 *
 * A leitura do banco aqui é estreita — só `payload->territory->primaryKeyword`
 * do território endereçado, filtrado pela marca — e só roda no servidor.
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TerritoryPrimaryKeywordSchema, type TerritoryPrimaryKeyword } from "./territory.ts";
import { TERRITORY_SUBJECT_TYPE, TERRITORY_WORKFLOW_STAGE } from "./territory-record.ts";

/** A evidência da SERP que sustentou a proposta, como o território a grava. */
export const SerpPrimaryEvidenceSchema = z.object({
  competitorOverlap: z.number().int().nonnegative(),
  devicesAgreeing: z.number().int().nonnegative(),
  devicesObserved: z.number().int().nonnegative(),
  score: z.number(),
}).strict();
export type SerpPrimaryEvidence = z.infer<typeof SerpPrimaryEvidenceSchema>;

/**
 * O que o navegador manda ao aceitar: a keyword proposta, a primária sobre a
 * qual a proposta foi calculada e a evidência mostrada. Sem ator e sem hora.
 */
export const SerpPrimaryAcceptanceSchema = z.object({
  keywordId: z.string().min(1),
  /** A primária vigente quando a proposta foi mostrada; `null` = não havia. */
  previousKeywordId: z.string().min(1).nullable(),
  evidence: SerpPrimaryEvidenceSchema,
}).strict();
export type SerpPrimaryAcceptance = z.infer<typeof SerpPrimaryAcceptanceSchema>;

/* ------------------- a origem "lista nova" (quem pode ser eleito) --------- */

/**
 * Onde o Silo está, como o território GRAVADO diz. No servidor vem da leitura
 * estreita da linha; na mesa, do território remoto. Nunca do corpo do aceite.
 */
export type SerpPrimaryTerritoryOrigin = {
  publicationProtection?: string | null;
  territoryKind?: string | null;
};

export type SerpPrimaryOriginRefusalCode =
  | "PUBLISHED_SILO_WITHOUT_DECLARATION"
  | "EXISTING_SILO_NOT_LIST_ORIGIN"
  | "TERRITORY_ORIGIN_UNKNOWN";

const PROTECOES_CONHECIDAS = new Set(["unpublished", "protected"]);
const TIPOS_DA_LISTA_NOVA = new Set(["new", "expansion"]);

/**
 * A eleição pela SERP é a origem 1, LISTA NOVA. Um Silo com página no ar
 * (`protected`) ou que já existe no acervo (`existing`) tem outra origem: a
 * declaração publicada ou o Silo canônico. Nele a SERP só informa — aceitar
 * por aqui inverteria publicado > SERP (AGENTS §11).
 *
 * Fecha no desconhecido: proteção `unknown` ou ausente não libera o aceite.
 */
export function serpPrimaryOriginRefusal(
  territory: SerpPrimaryTerritoryOrigin | null | undefined,
): { code: SerpPrimaryOriginRefusalCode; reason: string } | null {
  const protecao = territory?.publicationProtection ?? null;
  const tipo = territory?.territoryKind ?? null;
  if (protecao === "protected") {
    return { code: "PUBLISHED_SILO_WITHOUT_DECLARATION", reason: "Este Silo tem página publicada: a primária dele vem da declaração publicada, não da SERP. A leitura da SERP fica só como informação." };
  }
  if (tipo === "existing") {
    return { code: "EXISTING_SILO_NOT_LIST_ORIGIN", reason: "Este Silo já existe no acervo: a eleição pela SERP vale só para lista nova. A leitura da SERP fica só como informação." };
  }
  if (!protecao || !PROTECOES_CONHECIDAS.has(protecao) || !tipo || !TIPOS_DA_LISTA_NOVA.has(tipo)) {
    return { code: "TERRITORY_ORIGIN_UNKNOWN", reason: "Não se sabe se este Silo está publicado ou de onde ele veio: sem isso a proposta da SERP não pode ser aceita." };
  }
  return null;
}

export type SerpPrimaryAcceptanceRefusal =
  | "INCOMPLETE_ACCEPTANCE"
  | "INVALID_EVIDENCE"
  | "HUMAN_PRIMARY_PREVAILS"
  | "PUBLISHED_PRIMARY_PREVAILS"
  | SerpPrimaryOriginRefusalCode
  | "KEYWORD_NOT_IN_SILO"
  | "PRIMARY_CHANGED_SINCE_PROPOSAL"
  | "NO_CHANGE";

export type SerpPrimaryAcceptanceResult =
  | { ok: true; primary: TerritoryPrimaryKeyword }
  | { ok: false; code: SerpPrimaryAcceptanceRefusal; reason: string };

/**
 * Materializa a primária aceita — ou diz por que não.
 *
 * `electedAt` é a hora do aceite: a proposta é derivada (recalcular o mesmo
 * cenário dá a mesma proposta) e o carimbo de tempo nasce onde há escrita,
 * como na declaração publicada.
 */
export function acceptSerpPrimaryProposal(input: {
  current: TerritoryPrimaryKeyword | null | undefined;
  acceptance: SerpPrimaryAcceptance;
  actorUserId: string;
  confirmedAt: string;
  /** O território endereçado e a origem dele, lidos do banco pelo servidor. */
  territoryRef: string;
  territory: SerpPrimaryTerritoryOrigin | null;
  /**
   * O `territoryRef` gravado na keyword aceita, lido do banco pela marca
   * ativa. `null` = a keyword não está nesta marca ou não está em Silo.
   */
  keywordTerritoryRef: string | null;
}): SerpPrimaryAcceptanceResult {
  const atual = input.current ?? null;
  const { acceptance } = input;
  if (!input.actorUserId.trim() || !input.confirmedAt.trim() || !acceptance.keywordId.trim()) {
    return { ok: false, code: "INCOMPLETE_ACCEPTANCE", reason: "O aceite exige keyword, ator da sessão e hora: sem os três não há decisão registrável." };
  }
  const { devicesAgreeing, devicesObserved } = acceptance.evidence;
  if (devicesObserved < 1 || devicesAgreeing > devicesObserved) {
    return { ok: false, code: "INVALID_EVIDENCE", reason: "A evidência do aceite não é coerente: nenhuma lente observada, ou mais lentes concordando do que observadas." };
  }
  // Precedência humano > publicado > SERP, também na escrita.
  if (atual?.electedBy === "human") {
    return { ok: false, code: "HUMAN_PRIMARY_PREVAILS", reason: "A primária deste Silo foi eleita por decisão humana registrada; a proposta da SERP não a substitui." };
  }
  if (atual?.electedBy === "published_declaration") {
    return { ok: false, code: "PUBLISHED_PRIMARY_PREVAILS", reason: "A primária deste Silo vem da página publicada; a SERP só registra a discordância, nunca troca a primária publicada." };
  }
  // Só lista nova: Silo publicado ou existente não recebe primária pela SERP.
  const foraDaOrigem = serpPrimaryOriginRefusal(input.territory);
  if (foraDaOrigem) return { ok: false, code: foraDaOrigem.code, reason: foraDaOrigem.reason };
  // Só uma keyword DESTE Silo, da marca ativa, pode ser a primária dele.
  if (!input.territoryRef.trim() || input.keywordTerritoryRef !== input.territoryRef) {
    return { ok: false, code: "KEYWORD_NOT_IN_SILO", reason: "A keyword aceita não pertence a este Silo nesta marca: nada foi gravado." };
  }
  if ((atual?.keywordId ?? null) !== acceptance.previousKeywordId) {
    return { ok: false, code: "PRIMARY_CHANGED_SINCE_PROPOSAL", reason: "A primária do Silo mudou desde que a proposta foi calculada; recarregue e revise a proposta de novo." };
  }
  if (atual?.keywordId === acceptance.keywordId) {
    // §9 — nada muda, nada é gravado.
    return { ok: false, code: "NO_CHANGE", reason: "A keyword proposta já é a primária deste Silo: não há o que aceitar." };
  }

  const primary = TerritoryPrimaryKeywordSchema.parse({
    electedBy: "serp",
    keywordId: acceptance.keywordId,
    evidence: acceptance.evidence,
    electedAt: input.confirmedAt,
    confirmedBy: {
      actorUserId: input.actorUserId,
      confirmedAt: input.confirmedAt,
      ...(atual ? { replacedKeywordId: atual.keywordId } : {}),
    },
  });
  return { ok: true, primary };
}

/* ------------------------- a primária no rascunho ------------------------- */

/** JSON com as chaves ordenadas: o jsonb do banco não guarda a ordem de inserção. */
function jsonEstavel(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonEstavel).join(",")}]`;
  if (valor && typeof valor === "object") {
    const registro = valor as Record<string, unknown>;
    return `{${Object.keys(registro).filter(chave => registro[chave] !== undefined).sort()
      .map(chave => `${JSON.stringify(chave)}:${jsonEstavel(registro[chave])}`).join(",")}}`;
  }
  return JSON.stringify(valor ?? null);
}

export function samePrimaryKeyword(left: unknown, right: unknown): boolean {
  return jsonEstavel(left ?? null) === jsonEstavel(right ?? null);
}

/**
 * A porta genérica não muda a primária.
 *
 * Todo writer de território manda o território inteiro (`...territory`), e a
 * primária vai junto, igual. Um rascunho que chega com outra primária — ou
 * sem ela, o que a apagaria — é recusado: a primária do Silo só muda pelo
 * aceite explícito, com ator e hora do servidor.
 */
export function territoryPrimaryChangeRefusal(
  current: TerritoryPrimaryKeyword | null,
  draft: Record<string, unknown>,
): string | null {
  if (samePrimaryKeyword(current, draft.primaryKeyword)) return null;
  return "A primária do Silo não muda pela edição do território: ela só muda pelo aceite explícito da proposta, com o ator e a hora registrados pelo servidor.";
}

/**
 * A criação também não faz nascer primária de SERP nem humana.
 *
 * A única primária que entra na criação é a da ORIGEM 2, a declaração
 * publicada (`stampPublishedPrimary`). Uma primária `serp` — com ou sem
 * `confirmedBy` — só nasce pelo aceite; aceitar a criação com ela deixaria o
 * navegador declarar ator e hora que a porta do aceite existe para impedir.
 */
export function territoryCreatePrimaryRefusal(draft: Record<string, unknown>): string | null {
  const primaria = draft.primaryKeyword;
  if (primaria === undefined || primaria === null) return null;
  const origem = typeof primaria === "object" && !Array.isArray(primaria)
    ? (primaria as Record<string, unknown>).electedBy
    : undefined;
  if (origem === "published_declaration") return null;
  return "O Silo não nasce com primária eleita pela SERP nem por decisão humana: a primária da SERP só entra pelo aceite explícito da proposta, com o ator e a hora registrados pelo servidor.";
}

/* ------------------------- a leitura estreita (servidor) ------------------ */

/**
 * Só a primária do território endereçado e os dois campos que dizem a origem
 * dele (publicado? existente?); nunca o payload inteiro.
 */
export const TERRITORY_PRIMARY_COLUMNS = "subject_id,primaryKeyword:payload->territory->primaryKeyword,publicationProtection:payload->territory->publicationProtection,territoryKind:payload->territory->territoryKind" as const;

type ClienteLeitura = Pick<SupabaseClient, "from">;

export type TerritoryPrimaryRead =
  | { state: "found"; primaryKeyword: TerritoryPrimaryKeyword | null; origin: SerpPrimaryTerritoryOrigin }
  | { state: "missing" }
  | { state: "read_failed"; message: string };

const textoOuNull = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor : null);

/**
 * Lê a primária vigente de UM território da marca ativa.
 *
 * Falha fecha: quem chama é uma trava de escrita, e escrever sem saber o que
 * está gravado seria exatamente a troca silenciosa que a trava existe para
 * impedir.
 */
export async function readTerritoryPrimaryKeyword(
  client: ClienteLeitura,
  brandId: string,
  territoryRef: string,
): Promise<TerritoryPrimaryRead> {
  try {
    const resultado = await client
      .from("editorial_workflow_items")
      .select(TERRITORY_PRIMARY_COLUMNS)
      .eq("marca_id", brandId)
      .eq("subject_type", TERRITORY_SUBJECT_TYPE)
      .eq("stage", TERRITORY_WORKFLOW_STAGE)
      .eq("subject_id", territoryRef)
      .maybeSingle();
    if (resultado.error) return { state: "read_failed", message: resultado.error.message || "falha na leitura da primária" };
    const linha = resultado.data as unknown as {
      subject_id?: unknown;
      primaryKeyword?: unknown;
      publicationProtection?: unknown;
      territoryKind?: unknown;
    } | null;
    if (!linha || linha.subject_id !== territoryRef) return { state: "missing" };
    const origin = {
      publicationProtection: textoOuNull(linha.publicationProtection),
      territoryKind: textoOuNull(linha.territoryKind),
    };
    if (linha.primaryKeyword === null || linha.primaryKeyword === undefined) return { state: "found", primaryKeyword: null, origin };
    const primaria = TerritoryPrimaryKeywordSchema.safeParse(linha.primaryKeyword);
    if (!primaria.success) return { state: "read_failed", message: "A primária gravada no território é ilegível." };
    return { state: "found", primaryKeyword: primaria.data, origin };
  } catch (error) {
    return { state: "read_failed", message: error instanceof Error ? error.message : "falha na leitura da primária" };
  }
}

/** Só o ponteiro de Silo da keyword; nunca o payload inteiro. */
export const KEYWORD_TERRITORY_REF_COLUMNS = "subject_id,territoryRef:payload->territoryRef" as const;

export type KeywordTerritoryRefRead =
  | { state: "found"; territoryRef: string | null }
  | { state: "missing" }
  | { state: "read_failed"; message: string };

/**
 * Lê em que Silo está UMA keyword da marca ativa (o item keyword/architect,
 * único por marca e keyword). A keyword de outra marca não é achada: o filtro
 * por `marca_id` vem antes de qualquer outra coisa.
 */
export async function readKeywordTerritoryRef(
  client: ClienteLeitura,
  brandId: string,
  keywordId: string,
): Promise<KeywordTerritoryRefRead> {
  try {
    const resultado = await client
      .from("editorial_workflow_items")
      .select(KEYWORD_TERRITORY_REF_COLUMNS)
      .eq("marca_id", brandId)
      .eq("subject_type", "keyword")
      .eq("stage", "architect")
      .eq("subject_id", keywordId)
      .maybeSingle();
    if (resultado.error) return { state: "read_failed", message: resultado.error.message || "falha na leitura da keyword" };
    const linha = resultado.data as unknown as { subject_id?: unknown; territoryRef?: unknown } | null;
    if (!linha || linha.subject_id !== keywordId) return { state: "missing" };
    return { state: "found", territoryRef: textoOuNull(linha.territoryRef) };
  } catch (error) {
    return { state: "read_failed", message: error instanceof Error ? error.message : "falha na leitura da keyword" };
  }
}
