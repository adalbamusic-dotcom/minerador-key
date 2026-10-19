import type { SupabaseClient } from "@supabase/supabase-js";
import { contentHash } from "../arquiteto/versioning.ts";
import {
  checkDeleteConfirmation,
  deleteConfirmationRequirement,
  type DeleteConfirmationRequirement,
  type DeleteConfirmationTyped,
} from "../lifecycle/typed-confirmation.ts";
import {
  GROUP_DELETE_ALL_AREA_REASONS,
  GROUP_DELETE_ALL_BLOCK_SIZE,
  groupDeleteAllReasonMessage,
  KEYWORD_DELETE_PLAN_NOT_AVAILABLE_MESSAGE,
  type GroupDeleteAllOutReason,
  type GroupDeleteAllPreview,
} from "./group-delete-all.ts";
import {
  applyGroupDeleteAllWithCore,
  groupDeleteRefusalMessage,
  groupDeleteRpcErrorCode,
  previewGroupDeleteAllWithCore,
} from "./group-delete-all-core.ts";
import type { PlanAfterColorDeletionResult } from "./declared-plan-withdraw-core.ts";
import { architectDismantleFailureMessage, type ArchitectDismantlePort, type ArchitectDismantlePreview } from "./architect-dismantle.ts";
import {
  isKeywordSubjectActorId,
  KEYWORD_DELETE_SUBJECT_COLUMNS,
  keywordCarriesDeclaredPlan,
  keywordDeleteSubjectSemantic,
} from "./keyword-subject.ts";

/**
 * ===== A EXCLUSÃO DO MINERADOR (selecionar → Excluir) — O NÚCLEO (2026-10-17) =====
 *
 * Pedido do dono (17/10): "não está deixando apagar no Minerador, ele tem que
 * deixar apagar todo o grupo, isso está no contrato global" — e, em 14/10, "só
 * com selecionar já está bom". SDD `docs/compartilhado/sdd-linha-unica-do-minerador-2026-10-16.md`
 * (APROVADA), P-4: "a mesma confirmação forte e com hash nos dois casos".
 *
 * É a exclusão de SEMPRE (as rotas `keywords/delete/preview` e
 * `keywords/delete`, o botão Excluir, "Apagar Duplicadas" e "Excluir as sobras"
 * do cadastro), agora com prévia, `decisionHash` e a regra única da confirmação.
 * Nada de porta nova: a keyword selecionada que CARREGA O PLANO
 * (`keywordCarriesDeclaredPlan`: Assunto que o banco recusaria apagar sozinho, ou
 * a principal declarada de um Assunto) sai pelo MESMO núcleo de "Excluir tudo da
 * cor" (`group-delete-all-core.ts`, com as selecionadas daquela cor): a RPC da
 * M-E libera o Assunto (marcador da exclusão da cor, que o gatilho já aceita) e
 * exclui na mesma transação; o plano do grupo ganha a versão nova (ou fica
 * limpo); o histórico do grupo registra; e, se a cor inteira foi selecionada e
 * nada ficou, a cor é liberada (D7) — o mesmo resultado de "Excluir tudo da cor".
 * As outras keywords saem pela RPC de sempre (`lifecycle_delete_minerador_keywords`).
 *
 * Regras de sempre: não publicada = DELETE definitivo; publicada = lixeira de
 * 24 h, só com a declaração (`allowRecoverable`); documento no Redator fica fora;
 * blocos de até 100, cada um tudo-ou-nada; sucesso só depois da releitura. A
 * cor de uma keyword do plano sem a M-E no banco: a do plano fica fora (com a
 * explicação) e o resto sai como sempre. O MCP NÃO chama isto (`AGENTS.md` §17.1).
 */

export type KeywordDeleteClient = Pick<SupabaseClient, "from" | "rpc">;

/** O teto da seleção numa decisão (a execução vai em blocos de 100). */
export const KEYWORD_DELETE_MAX_IDS = 1000;
export const KEYWORD_DELETE_RPC = "lifecycle_delete_minerador_keywords" as const;
export const KEYWORD_DELETE_PREVIEW_RPC = "lifecycle_preview_minerador_keywords" as const;

export type KeywordDeleteOutReason = GroupDeleteAllOutReason | "not_live" | "plan_without_color" | "plan_delete_unavailable" | "group_unavailable";
export type KeywordDeleteItem = { id: string; keyword: string };
export type KeywordDeleteOut = KeywordDeleteItem & { reason: KeywordDeleteOutReason; message: string; path: string | null; groupId: string | null };
type LifecycleMode = "hard" | "recoverable" | "blocked";

export type KeywordDeleteImpactItem = {
  id: string;
  keyword: string;
  isPublished: boolean;
  publicationSource: "server_canonical" | "none";
  alreadyRecoverable: boolean;
  impact: Record<string, unknown>;
};

/** Uma cor com keyword do plano na seleção: a prévia do núcleo da cor, restrita às selecionadas dela. */
export type KeywordDeleteColorView = {
  groupId: string;
  colorLabel: string;
  colorWord: string;
  keywordIds: string[];
  decisionHash: string;
  preview: GroupDeleteAllPreview;
};

export type KeywordDeletePreview = {
  ids: string[];
  /** O impacto de sempre, por keyword (`lifecycle_preview_minerador_keywords`). */
  items: KeywordDeleteImpactItem[];
  /** As publicadas que vão para a lixeira de 24 h (pedem a declaração). */
  publishedIds: string[];
  hardDeleteIds: string[];
  blockedIds: string[];
  requiresRecoverableConfirmation: boolean;
  hard: KeywordDeleteItem[];
  recoverable: KeywordDeleteItem[];
  out: KeywordDeleteOut[];
  colors: KeywordDeleteColorView[];
  /** As que saem pela RPC de sempre (sem plano). */
  free: { hard: string[]; recoverable: string[] };
  /** A exclusão das keywords do plano está no banco (M-E). */
  available: boolean;
  unavailableMessage: string | null;
  effects: string[];
  confirmation: DeleteConfirmationRequirement;
  totals: { selected: number; hard: number; recoverable: number; out: number; colors: number };
  decisionBasis: Record<string, unknown>;
  /** 2026-10-18 · o alerta do desmonte do Arquiteto para as keywords sem plano (por área). Ausente = nada a desmontar. */
  architect?: ArchitectDismantlePreview["areas"] | null;
};

export type KeywordDeleteRefusalCode =
  | "BRAND_REQUIRED"
  | "ACTOR_REQUIRED"
  | "SELECTION_REQUIRED"
  | "SELECTION_TOO_LARGE"
  | "DECISION_REQUIRED"
  | "DECISION_STALE"
  | "CONFIRMATION_REQUIRED"
  | "KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW"
  | "NOTHING_TO_DELETE"
  | "DELETE_IN_PROGRESS"
  /** 2026-10-18 · o desmonte do Arquiteto (antes das keywords) não fechou: nenhuma keyword foi excluída. */
  | "ARCHITECT_DISMANTLE_FAILED";

export type KeywordDeleteRefusal = {
  ok: false;
  code: KeywordDeleteRefusalCode;
  message: string;
  /** Em `DECISION_STALE`: a prévia nova, para o dono decidir de novo. */
  preview?: KeywordDeletePreview;
  decisionHash?: string;
  missing?: string[];
};

export const KEYWORD_DELETE_REFUSAL_STATUS: Record<KeywordDeleteRefusalCode, number> = {
  BRAND_REQUIRED: 400,
  ACTOR_REQUIRED: 401,
  SELECTION_REQUIRED: 400,
  SELECTION_TOO_LARGE: 400,
  DECISION_REQUIRED: 400,
  DECISION_STALE: 409,
  CONFIRMATION_REQUIRED: 400,
  KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW: 409,
  NOTHING_TO_DELETE: 409,
  DELETE_IN_PROGRESS: 409,
  ARCHITECT_DISMANTLE_FAILED: 409,
};

export type KeywordDeleteBlockOutcome = {
  ids: string[];
  allowRecoverable: boolean;
  outcome: "done" | "refused" | "failed";
  hardDeletedIds: string[];
  recoverableIds: string[];
  code: string | null;
  message: string | null;
};

export type KeywordDeleteColorOutcome = {
  groupId: string;
  colorLabel: string;
  outcome: "done" | "partial" | "refused";
  code: string | null;
  message: string | null;
  hardDeletedIds: string[];
  recoverableIds: string[];
  releasedSubjectIds: string[];
  plan: PlanAfterColorDeletionResult | null;
  colorFreed: boolean;
  keptBecause: string[];
  notices: string[];
};

export type KeywordDeleteApplyResult = {
  ok: true;
  mode: "apply";
  decisionHash: string;
  hardDeletedIds: string[];
  recoverableIds: string[];
  releasedSubjectIds: string[];
  /** O que ficou fora já na prévia (com o motivo). */
  out: KeywordDeleteOut[];
  colors: KeywordDeleteColorOutcome[];
  /** Os blocos das keywords sem plano (a RPC de sempre). */
  blocks: KeywordDeleteBlockOutcome[];
  readback: { confirmed: boolean; divergences: string[] };
  /** Tudo o que a prévia pôs para sair saiu, e tudo foi relido. */
  complete: boolean;
  notices: string[];
  /** 2026-10-18 · o que o desmonte do Arquiteto fez antes das keywords sem plano. */
  architect: { applied: string[] };
};

const inFlight = new Set<string>();
const refuse = (code: KeywordDeleteRefusalCode, message: string, extra: Partial<KeywordDeleteRefusal> = {}): KeywordDeleteRefusal => ({ ok: false, code, message, ...extra });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const texts = (value: unknown): string[] => (Array.isArray(value) ? value.map(text).filter((item): item is string => Boolean(item)) : []);
const chunks = <T,>(items: readonly T[], size: number): T[][] => {
  const saida: T[][] = [];
  for (let inicio = 0; inicio < items.length; inicio += size) saida.push(items.slice(inicio, inicio + size));
  return saida;
};

function baseChecks(input: { brandId: unknown; actorUserId: unknown; keywordIds: unknown }): KeywordDeleteRefusal | null {
  if (typeof input.brandId !== "string" || !input.brandId.trim()) return refuse("BRAND_REQUIRED", "A marca ativa é necessária.");
  if (!isKeywordSubjectActorId(input.actorUserId)) return refuse("ACTOR_REQUIRED", "Excluir exige o usuário autenticado (auth.users.id).");
  const ids = Array.isArray(input.keywordIds) ? input.keywordIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())) : [];
  if (!ids.length) return refuse("SELECTION_REQUIRED", "Selecione as keywords a excluir.");
  if (new Set(ids).size > KEYWORD_DELETE_MAX_IDS) return refuse("SELECTION_TOO_LARGE", `São mais de ${KEYWORD_DELETE_MAX_IDS} keywords: exclua em partes.`);
  return null;
}

/** O código da recusa de um bloco da RPC de sempre (a função de sempre não "falta": isso é falha de transação). */
function commonBlockCode(error: unknown): string {
  const code = groupDeleteRpcErrorCode(error);
  return code === "GROUP_DELETE_NOT_AVAILABLE" || code === "GROUP_DELETE_OUTSIDE_GROUP" || code === "GROUP_DELETE_INVALID" ? "KEYWORD_DELETE_TRANSACTION_FAILED" : code;
}

/** A prévia da seleção (só leitura, grátis) e o `decisionHash` dela. Erro do banco sobe (a rota traduz). */
async function loadSelection(input: { client: KeywordDeleteClient; brandId: string; actorUserId: string; keywordIds: readonly string[]; architect?: ArchitectDismantlePort | null }): Promise<{ preview: KeywordDeletePreview; decisionHash: string; architectRequest: { keywordIds: string[]; linkedTerritoryRef: null; basis: Record<string, unknown> } | null }> {
  const { client, brandId, actorUserId } = input;
  const ids = [...new Set(input.keywordIds.map(id => id.trim()).filter(Boolean))];

  // 1. O impacto de sempre (o ciclo de vida), em blocos de 100.
  const items: KeywordDeleteImpactItem[] = [];
  const modos = new Map<string, LifecycleMode>();
  for (const bloco of chunks(ids, GROUP_DELETE_ALL_BLOCK_SIZE)) {
    const { data, error } = await client.rpc(KEYWORD_DELETE_PREVIEW_RPC, { p_brand_id: brandId, p_keyword_ids: bloco, p_actor_user_id: actorUserId });
    if (error) throw error;
    for (const valor of Array.isArray(asRecord(data)?.items) ? asRecord(data)!.items as unknown[] : []) {
      const impact = asRecord(valor) ?? {};
      const root = asRecord(impact.root) ?? {};
      const id = text(root.id);
      if (!id) continue;
      const modo = impact.mode;
      if (modo === "hard" || modo === "recoverable" || modo === "blocked") modos.set(id, modo);
      items.push({
        id,
        keyword: typeof root.label === "string" ? root.label : "",
        isPublished: modo === "recoverable",
        publicationSource: modo === "recoverable" ? "server_canonical" : "none",
        alreadyRecoverable: impact.recoveryState === "recoverable",
        impact,
      });
    }
  }

  // 2. As selecionadas vivas, em colunas estreitas: a cor e se carregam o plano.
  type Viva = { id: string; keyword: string; groupId: string | null; carriesPlan: boolean };
  const vivas = new Map<string, Viva>();
  for (const bloco of chunks(ids, GROUP_DELETE_ALL_BLOCK_SIZE)) {
    const { data, error } = await client.from("minerador_keywords")
      .select(`id,keyword,group_id,${KEYWORD_DELETE_SUBJECT_COLUMNS}`)
      .eq("brand_id", brandId).is("deleted_at", null).in("id", bloco);
    if (error) throw error;
    for (const row of (data || []) as unknown as Array<Record<string, unknown>>) {
      const id = text(row.id);
      if (!id) continue;
      vivas.set(id, { id, keyword: typeof row.keyword === "string" ? row.keyword : "", groupId: text(row.group_id), carriesPlan: keywordCarriesDeclaredPlan(keywordDeleteSubjectSemantic(row)) });
    }
  }
  const rotulos = new Map(items.map(item => [item.id, item.keyword]));
  const nome = (id: string) => vivas.get(id)?.keyword || rotulos.get(id) || id;

  // 3. As cores com keyword do plano na seleção: o núcleo de "Excluir tudo da cor", com as selecionadas daquela cor.
  const out: KeywordDeleteOut[] = [];
  const tratadas = new Set<string>();
  const porCor = new Map<string, string[]>();
  for (const viva of vivas.values()) if (viva.groupId) porCor.set(viva.groupId, [...(porCor.get(viva.groupId) ?? []), viva.id]);
  for (const viva of vivas.values()) {
    if (!viva.carriesPlan || viva.groupId) continue;
    out.push({ id: viva.id, keyword: viva.keyword, reason: "plan_without_color", message: "Carrega Assunto do plano, mas a keyword não tem cor: o Assunto é liberado pela cor da keyword. Fica fora (nada dela muda).", path: "Ponha a keyword na cor do plano (etiqueta de grupo) e clique Excluir de novo", groupId: null });
    tratadas.add(viva.id);
  }
  const coresDoPlano = [...new Set([...vivas.values()].filter(viva => viva.carriesPlan && viva.groupId).map(viva => viva.groupId as string))].sort();
  const colors: KeywordDeleteColorView[] = [];
  let unavailableMessage: string | null = null;
  for (const groupId of coresDoPlano) {
    const keywordIds = [...(porCor.get(groupId) ?? [])].sort();
    const previa = await previewGroupDeleteAllWithCore({ client, brandId, actorUserId, groupId, includePublished: true, keywordIds, architect: input.architect ?? null });
    if (!previa.ok || !previa.preview.available) {
      // A keyword do plano fica fora com a explicação; as outras desta cor saem pela exclusão de sempre.
      if (previa.ok) unavailableMessage = previa.preview.unavailableMessage;
      for (const id of keywordIds) {
        if (!vivas.get(id)?.carriesPlan) continue;
        out.push(previa.ok
          ? { id, keyword: nome(id), reason: "plan_delete_unavailable", message: KEYWORD_DELETE_PLAN_NOT_AVAILABLE_MESSAGE, path: "O dono aplica a migration 20261016130000 (ensaio, aplicação e conferência no cabeçalho dela)", groupId }
          : { id, keyword: nome(id), reason: "group_unavailable", message: `Carrega Assunto do plano, e o plano da cor não pôde ser lido agora: ${previa.message} Fica fora (nada dela muda).`, path: "Clique Excluir de novo", groupId });
        tratadas.add(id);
      }
      continue;
    }
    colors.push({ groupId, colorLabel: previa.preview.group.colorLabel, colorWord: previa.preview.confirmation.colorWord, keywordIds, decisionHash: previa.decisionHash, preview: previa.preview });
    for (const id of keywordIds) tratadas.add(id);
    for (const item of previa.preview.out) out.push({ ...item, groupId });
  }

  // 4. As outras: a exclusão de sempre, com as mesmas recusas por item.
  const freeHard: string[] = [];
  const freeRecoverable: string[] = [];
  const semReferencias = { architectRefs: [], plan: null };
  for (const id of ids) {
    if (tratadas.has(id)) continue;
    if (!vivas.has(id)) {
      out.push({ id, keyword: nome(id), reason: "not_live", message: "Não está mais viva (saiu em outra sessão ou já está na lixeira de 24 h).", path: "Recarregue o Minerador", groupId: null });
      continue;
    }
    const modo = modos.get(id);
    if (modo === "hard") freeHard.push(id);
    else if (modo === "recoverable") freeRecoverable.push(id);
    else {
      const reason = modo === "blocked" ? "blocked_descendant" : "lifecycle_unread";
      const texto = groupDeleteAllReasonMessage(reason, semReferencias);
      out.push({ id, keyword: nome(id), reason, message: texto.message, path: texto.path, groupId: vivas.get(id)?.groupId ?? null });
    }
  }

  /*
   * 4b. 2026-10-18 · O DESMONTE DO ARQUITETO das keywords sem plano (decisão do dono "tem que poder apagar … não interessa
   * qual seja o estado"): a keyword que está num artigo vigente sai, e o artigo sai de vigência lá ANTES (o mesmo núcleo
   * do "Desfazer Silo"). Sem a porta (chamada interna), o de antes. Leitura/permissão que falha: a coberta fica fora, dita.
   */
  let architectRequest: { keywordIds: string[]; linkedTerritoryRef: null; basis: Record<string, unknown> } | null = null;
  let architectAreas: ArchitectDismantlePreview["areas"] | null = null;
  const architectLines: string[] = [];
  const livres = [...freeHard, ...freeRecoverable];
  if (input.architect && livres.length) {
    const desmonte = await input.architect.preview({ keywordIds: livres, linkedTerritoryRef: null });
    if (desmonte.ok) {
      if (desmonte.preview.lines.length) {
        architectRequest = { keywordIds: livres, linkedTerritoryRef: null, basis: desmonte.preview.basis };
        architectAreas = desmonte.preview.areas;
        architectLines.push(...desmonte.preview.lines);
      }
    } else {
      // Sem saber o que o Arquiteto tem, nada sem plano sai às cegas: fica fora, com o porquê.
      for (const id of livres) {
        out.push({ id, keyword: nome(id), reason: "architect_unavailable", message: `A exclusão desmonta no Arquiteto o artigo que cita a keyword, e o desmonte não pôde ser preparado agora (${desmonte.message}). Fica fora (nada dela muda).`, path: "Gere a prévia de novo; se for a permissão, peça a de aprovar no Arquiteto", groupId: vivas.get(id)?.groupId ?? null });
      }
      freeHard.splice(0, freeHard.length);
      freeRecoverable.splice(0, freeRecoverable.length);
    }
  }

  const item = (id: string): KeywordDeleteItem => ({ id, keyword: nome(id) });
  const hard = [...freeHard.map(item), ...colors.flatMap(cor => cor.preview.hard)];
  const recoverable = [...freeRecoverable.map(item), ...colors.flatMap(cor => cor.preview.recoverable)];

  // 5. A regra única da confirmação.
  const nomes = items.map(entrada => entrada.keyword.trim()).filter(Boolean);
  const selectionName = nomes.length === 1 && ids.length === 1 ? nomes[0] : `${items.length || ids.length} keywords selecionadas`;
  const confirmation = deleteConfirmationRequirement({
    selectionName,
    colorWords: colors.filter(cor => cor.preview.blocks.length > 0).map(cor => cor.colorWord),
    hardCount: hard.length,
    recoverable,
  });

  // 6. As frases da prévia (o mesmo aviso da exclusão da cor, por cor).
  const effects: string[] = [];
  if (hard.length) effects.push(`${plural(hard.length, "keyword não publicada é apagada", "keywords não publicadas são apagadas")} DE VEZ (com as medições e as origens de descoberta; os eventos de decisão ficam como histórico). Não há como desfazer.`);
  if (recoverable.length) effects.push(`${plural(recoverable.length, "publicada vai", "publicadas vão")} para a lixeira de 24 h (restaurável no Minerador; depois, purga). URL, slug e canonical não são apagados.`);
  for (const cor of colors) {
    const p = cor.preview;
    const assuntos = p.releasedSubjects.length;
    const plano = p.plan.after === "reduced"
      ? `o plano do Silo passa para a v${p.plan.nextPlanVersion} com ${plural(p.plan.articlesStaying, "artigo", "artigos")}`
      : p.plan.after === "cleared" ? `o plano do Silo fica limpo (v${p.plan.nextPlanVersion}, sem artigos)` : "o plano do Silo não muda";
    const fim = p.color.freedAtEnd
      ? `no fim nada fica: a cor ${cor.colorLabel} é liberada (o mesmo resultado de “Excluir tudo da cor”)`
      : `a cor ${cor.colorLabel} continua ocupada (${p.color.keptBecause.join("; ")})`;
    effects.push(`Cor ${cor.colorLabel}: ${assuntos ? `${plural(assuntos, "keyword sai do plano", "keywords saem do plano")} (o Assunto é liberado e apagado na mesma transação)` : "nenhum Assunto do plano sai"}; ${plano}; ${fim}.`);
  }
  // 2026-10-18 · SUBSTITUÍDO "No Arquiteto, N artigos ligados continuam como histórico; Radar, Redator e Publicações não
  // mudam": o que sai lá (antes das keywords) é dito por área, pela prévia do desmonte (a das cores vem na prévia de cada cor).
  for (const cor of colors) {
    const linhas = cor.preview.areas.filter(area => area.area !== "minerador" && area.executable).flatMap(area => area.items.map(item => `${area.label} · ${item.label}`));
    if (linhas.length) effects.push(`Cor ${cor.colorLabel}, antes das keywords, sai junto: ${linhas.join(" ")}`);
  }
  if (architectLines.length) {
    effects.push("Antes das keywords sem plano, sai junto (o mesmo núcleo do “Desfazer Silo”; se algo não fechar, nenhuma keyword é excluída e o resultado diz o que foi feito):");
    effects.push(...architectLines);
  }
  if (colors.length || architectLines.length) effects.push("As versões do ArticleDNA, SiloDNA, SiloPage e do documento do Redator ficam como histórico (não são apagadas).");
  if (out.length) effects.push(`${plural(out.length, "keyword fica", "keywords ficam")} fora, com o motivo de cada uma (nada delas muda).`);
  if (freeHard.length + freeRecoverable.length > GROUP_DELETE_ALL_BLOCK_SIZE || colors.some(cor => cor.preview.blocks.length > 1)) {
    effects.push(`Execução em blocos de até ${GROUP_DELETE_ALL_BLOCK_SIZE}: cada bloco é tudo-ou-nada; um bloco recusado não desfaz os anteriores.`);
  }

  const ordenados = (lista: readonly { id: string }[]) => lista.map(entrada => entrada.id).sort();
  const decisionBasis = {
    operation: "excluir_selecao@1",
    ids: [...ids].sort(),
    free: { hard: [...freeHard].sort(), recoverable: [...freeRecoverable].sort() },
    out: out.map(entrada => `${entrada.id}:${entrada.reason}`).sort(),
    colors: colors.map(cor => `${cor.groupId}:${cor.decisionHash}`).sort(),
    confirmation,
    ...(architectRequest ? { architect: architectRequest.basis } : {}),
  };
  const preview: KeywordDeletePreview = {
    ids,
    items,
    publishedIds: ordenados(recoverable),
    hardDeleteIds: ordenados(hard),
    blockedIds: out.filter(entrada => entrada.reason === "blocked_descendant").map(entrada => entrada.id).sort(),
    requiresRecoverableConfirmation: recoverable.length > 0,
    hard,
    recoverable,
    out,
    colors,
    free: { hard: freeHard, recoverable: freeRecoverable },
    available: unavailableMessage === null,
    unavailableMessage,
    effects,
    confirmation,
    totals: { selected: ids.length, hard: hard.length, recoverable: recoverable.length, out: out.length, colors: colors.length },
    decisionBasis,
    architect: architectAreas,
  };
  return { preview, decisionHash: await contentHash(decisionBasis), architectRequest };
}

/** Prévia grátis (só leitura): o que sai de vez, o que vai para a lixeira, o que fica fora e o plano de cada cor. */
export async function previewKeywordDeleteWithCore(input: {
  client: KeywordDeleteClient;
  brandId: string;
  actorUserId: string;
  keywordIds: readonly string[];
  /** 2026-10-18 · o desmonte do Arquiteto (a rota liga a porta do servidor do Arquiteto). */
  architect?: ArchitectDismantlePort | null;
}): Promise<{ ok: true; mode: "preview"; preview: KeywordDeletePreview; decisionHash: string } | KeywordDeleteRefusal> {
  const base = baseChecks(input);
  if (base) return base;
  const lido = await loadSelection({ client: input.client, brandId: input.brandId.trim(), actorUserId: input.actorUserId.trim(), keywordIds: input.keywordIds, architect: input.architect ?? null });
  return { ok: true, mode: "preview", preview: lido.preview, decisionHash: lido.decisionHash };
}

/** Executa a decisão tomada sobre a prévia VIGENTE (mesmo `decisionHash`), com a confirmação da regra única. */
export async function applyKeywordDeleteWithCore(input: {
  client: KeywordDeleteClient;
  brandId: string;
  actorUserId: string;
  keywordIds: readonly string[];
  /** A declaração da lixeira de 24 h: o humano viu as publicadas e confirmou. */
  allowRecoverable?: boolean;
  decisionHash?: string | null;
  typed: DeleteConfirmationTyped;
  /** Para testes: o id de cada bloco do núcleo da cor. */
  requestId?: () => string;
  /** 2026-10-18 · o desmonte do Arquiteto (a rota liga a porta do servidor do Arquiteto). */
  architect?: ArchitectDismantlePort | null;
}): Promise<KeywordDeleteApplyResult | KeywordDeleteRefusal> {
  const base = baseChecks(input);
  if (base) return base;
  const brandId = input.brandId.trim();
  const actorUserId = input.actorUserId.trim();
  const lockKey = `${brandId}:selecao`;
  if (inFlight.has(lockKey)) return refuse("DELETE_IN_PROGRESS", "Uma exclusão já está em andamento nesta marca. Aguarde o resultado.");
  inFlight.add(lockKey);
  try {
    const { preview, decisionHash, architectRequest } = await loadSelection({ client: input.client, brandId, actorUserId, keywordIds: input.keywordIds, architect: input.architect ?? null });
    if (!input.decisionHash) return refuse("DECISION_REQUIRED", "Clique Excluir para ver a prévia e confirme sobre ela.");
    if (input.decisionHash !== decisionHash) return refuse("DECISION_STALE", "A seleção mudou desde a prévia. Nada foi excluído: confira a prévia nova e confirme de novo.", { preview, decisionHash });
    // A declaração da lixeira de 24 h (o banco confere de novo em cada bloco): sem ela, nada começa.
    if (preview.recoverable.length && input.allowRecoverable !== true) {
      return refuse("KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW", "A seleção tem publicada: confirme pela remoção de 24 horas. Nada foi excluído.");
    }
    const conferida = checkDeleteConfirmation(preview.confirmation, input.typed ?? {});
    if (!conferida.ok) return refuse("CONFIRMATION_REQUIRED", conferida.message, { missing: conferida.missing });
    if (!preview.hard.length && !preview.recoverable.length) return refuse("NOTHING_TO_DELETE", "Nada da seleção pode ser excluído agora: tudo ficou fora (veja os motivos na prévia).");

    const notices: string[] = [];
    const divergences: string[] = [];

    // 0. 2026-10-18 · o desmonte do Arquiteto das keywords sem plano, ANTES de qualquer exclusão; não fechou = nada é excluído.
    let architectApplied: string[] = [];
    if (architectRequest && (preview.free.hard.length || preview.free.recoverable.length)) {
      const desmonte = await input.architect!.apply(architectRequest);
      if (!desmonte.ok) return refuse("ARCHITECT_DISMANTLE_FAILED", architectDismantleFailureMessage(desmonte));
      architectApplied = desmonte.applied;
    }

    // 1. As cores do plano: o MESMO núcleo de "Excluir tudo da cor", com as selecionadas dela.
    const colors: KeywordDeleteColorOutcome[] = [];
    for (const cor of preview.colors) {
      if (!cor.preview.blocks.length) continue;
      const feito = await applyGroupDeleteAllWithCore({
        client: input.client,
        brandId,
        actorUserId,
        groupId: cor.groupId,
        keywordIds: cor.keywordIds,
        includePublished: true,
        decisionHash: cor.decisionHash,
        typed: { color: input.typed?.colors?.[cor.colorWord], phrase: input.typed?.phrase, publishedNames: input.typed?.publishedNames },
        requestId: input.requestId,
        architect: input.architect ?? null,
      });
      if (!feito.ok) {
        colors.push({ groupId: cor.groupId, colorLabel: cor.colorLabel, outcome: "refused", code: feito.code, message: feito.message, hardDeletedIds: [], recoverableIds: [], releasedSubjectIds: [], plan: null, colorFreed: false, keptBecause: [], notices: [] });
        continue;
      }
      if (!feito.readback.confirmed) divergences.push(...feito.readback.divergences);
      colors.push({
        groupId: cor.groupId,
        colorLabel: cor.colorLabel,
        outcome: feito.complete ? "done" : "partial",
        code: null,
        message: null,
        hardDeletedIds: feito.hardDeletedIds,
        recoverableIds: feito.recoverableIds,
        releasedSubjectIds: feito.releasedSubjectIds,
        plan: feito.plan,
        colorFreed: feito.color.freed,
        keptBecause: feito.color.keptBecause,
        notices: feito.notices,
      });
      notices.push(...feito.notices);
    }

    // 2. As outras: a RPC de sempre, em blocos de 100 (cada um tudo-ou-nada; um recusado não desfaz os anteriores).
    const recuperaveis = new Set(preview.free.recoverable);
    const blocks: KeywordDeleteBlockOutcome[] = [];
    for (const bloco of chunks([...preview.free.hard, ...preview.free.recoverable], GROUP_DELETE_ALL_BLOCK_SIZE)) {
      const temPublicada = bloco.some(id => recuperaveis.has(id));
      const { data, error } = await input.client.rpc(KEYWORD_DELETE_RPC, {
        p_brand_id: brandId,
        p_keyword_ids: bloco,
        p_actor_user_id: actorUserId,
        p_allow_recoverable: input.allowRecoverable === true && temPublicada,
      });
      if (error) {
        const code = commonBlockCode(error);
        blocks.push({ ids: bloco, allowRecoverable: temPublicada, outcome: code === "KEYWORD_DELETE_TRANSACTION_FAILED" ? "failed" : "refused", hardDeletedIds: [], recoverableIds: [], code, message: groupDeleteRefusalMessage(code) });
        continue;
      }
      const resposta = asRecord(data) ?? {};
      blocks.push({ ids: bloco, allowRecoverable: temPublicada, outcome: "done", hardDeletedIds: texts(resposta.hardDeletedIds), recoverableIds: texts(resposta.recoverableIds), code: null, message: null });
    }

    // 3. Releitura das que saíram pela RPC de sempre (as das cores, o núcleo da cor já releu).
    const estado = new Map<string, { deletedAt: string | null }>();
    for (const bloco of chunks(blocks.flatMap(item => item.ids), GROUP_DELETE_ALL_BLOCK_SIZE)) {
      const { data, error } = await input.client.from("minerador_keywords").select("id,deleted_at").eq("brand_id", brandId).in("id", bloco);
      if (error) { divergences.push("A releitura das keywords não pôde ser feita agora; recarregue o Minerador para conferir."); break; }
      for (const row of (data || []) as Array<Record<string, unknown>>) if (typeof row.id === "string") estado.set(row.id, { deletedAt: text(row.deleted_at) });
    }
    const hardDeletedIds: string[] = colors.flatMap(cor => cor.hardDeletedIds);
    const recoverableIds: string[] = colors.flatMap(cor => cor.recoverableIds);
    for (const bloco of blocks) {
      if (bloco.outcome !== "done") {
        if (bloco.ids.some(id => !estado.has(id) || estado.get(id)!.deletedAt)) divergences.push("Um bloco recusado aparece alterado na releitura; recarregue o Minerador.");
        continue;
      }
      for (const id of bloco.hardDeletedIds) {
        if (estado.has(id)) divergences.push(`A keyword ${id} ainda aparece na releitura.`);
        else hardDeletedIds.push(id);
      }
      for (const id of bloco.recoverableIds) {
        if (!estado.get(id)?.deletedAt) divergences.push(`A publicada ${id} não aparece na lixeira na releitura.`);
        else recoverableIds.push(id);
      }
      const confirmadas = new Set([...bloco.hardDeletedIds, ...bloco.recoverableIds]);
      for (const id of bloco.ids) if (!confirmadas.has(id)) divergences.push(`A keyword ${id} não voltou como excluída pelo banco.`);
    }

    const complete = colors.every(cor => cor.outcome === "done") && blocks.every(bloco => bloco.outcome === "done") && !divergences.length;
    return {
      ok: true,
      mode: "apply",
      decisionHash,
      hardDeletedIds,
      recoverableIds,
      releasedSubjectIds: colors.flatMap(cor => cor.releasedSubjectIds),
      out: preview.out,
      colors,
      blocks,
      readback: { confirmed: !divergences.length, divergences },
      complete,
      notices,
      architect: { applied: architectApplied },
    };
  } finally {
    inFlight.delete(lockKey);
  }
}
