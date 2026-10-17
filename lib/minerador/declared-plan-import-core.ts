import type { SupabaseClient } from "@supabase/supabase-js";
import { contentHash } from "../arquiteto/versioning.ts";
import { EDITORIAL_GROUP_COLOR_LABELS, EDITORIAL_GROUP_COLORS, editorialGroupNameKey, isEditorialGroupColor, isEditorialGroupsSchemaMissing, normalizeEditorialGroupName, type EditorialGroupColor } from "../editorial/editorial-groups.ts";
import {
  declareEditorialGroupPlan,
  ensureEditorialGroupForColor,
  listEditorialGroupSummaries,
  readActiveEditorialGroupIdForColor,
  readEditorialGroupPlan,
  updateEditorialGroup,
  type EditorialGroupPlanRow,
} from "../editorial/editorial-groups-store.ts";
import {
  DECLARED_PLAN_LEFTOVER_LABELS,
  DECLARED_PLAN_SCOPE_MAX,
  SUBJECT_ENTRY_TITLE_MAX,
  declaredPlanLeftoverReason,
  declaredPrincipalLock,
  normalizeDeclaredArticleSlug,
  normalizeDeclaredPhraseKey,
  normalizeDeclaredSiloSlug,
  parseDeclaredPlanText,
  readDeclaredSiloPlan,
  sameDeclaredArticleContent,
  sameSubjectEntry,
  validateParsedDeclaredPlan,
  type DeclaredArticlePlan,
  type DeclaredPlanLock,
  type DeclaredPlanLockChoice,
  type DeclaredPlanRefusal,
  type DeclaredPlanRole,
  type DeclaredPrincipalLockOrigin,
  type DeclaredSiloPlan,
  type ParsedDeclaredPlan,
  type ParsedPlanArticle,
  type SubjectEntry,
} from "./declared-plan.ts";
import { importKeywordsWithCore, importSubjectsWithCore, type SubjectImportChannel } from "./keyword-import-core.ts";
import { assignKeywordGroupWithCore } from "./keyword-group-core.ts";
import { isKeywordPublished } from "./keyword-lifecycle.ts";
import { DECLARED_PLAN_LEFTOVER_BLOCKED, classifyDeclaredPlanLeftovers } from "./declared-plan-leftovers.ts";
import {
  declaredPrincipalReciprocity,
  isKeywordSubjectActorId,
  resolveDeclaredPrincipal,
  resolveKeywordSubject,
  setDeclaredPrincipal,
  setKeywordSubject,
} from "./keyword-subject.ts";
import { PLAN_LOCK_ARCHITECT_HINT, PLAN_LOCK_CHOICE_LABELS, PLAN_LOCK_PUBLISHED_REFUSAL, keywordLockVolume, planLockChange, resolveKeywordPlanLock } from "./keyword-plan-lock.ts";
import { readSiteOrigin } from "./publication-link.ts";
import { importSubjectDiscoveryWithCore } from "./subject-discovery-import.ts";
import { SUBJECT_CONVERSION_KEY, convertedTitleIndex, isConvertibleLegacySubject, readSubjectConversion, setSubjectConversion, type ConvertedTitle } from "./subject-conversion.ts";
import { validateSubjectDestination } from "./subject-destination.ts";
import { SUBJECT_RECOVERED_LABEL, recoverSubjectFromHistory, type RecoveredSubjectRow } from "./subject-recovery.ts";
import { withdrawForPlanReplacementWithCore } from "./declared-plan-withdraw-core.ts";

/**
 * ===== CADASTRAR ASSUNTOS — O NÚCLEO ÚNICO (card, rota e MCP) =====
 *
 * SDD `docs/compartilhado/sdd-cadastro-assunto-na-keyword-2026-10-13.md`
 * (cadastro único; o Assunto mora na keyword; trava por volume ou à mão) sobre
 * a SDD do plano declarado de 2026-10-12 (§6.1-2, F4). `preview` não escreve
 * nada; `apply` faz, numa sequência só e com releitura:
 *
 *   1. garante o grupo da cor e grava o Silo planejado nele
 *      (`editorial_groups.plan`, `plan_version`, `plan_hash`);
 *   2. declara o Assunto DENTRO da keyword de cada linha pelo núcleo de sempre
 *      (`importSubjectsWithCore`: cria a keyword nova como `bruto`, declara a
 *      existente) — nenhuma linha "Assunto" solta nasce; o título é texto do
 *      cadastro (`keyword_subject.entry`);
 *   3. no plano anterior ao cadastro único (Assunto numa linha, principal em
 *      outra), a forma gravada é mantida: o Assunto continua na linha dele e a
 *      principal nova, se houver, entra pelo import de sempre;
 *   4. etiqueta tudo com o grupo (`assignKeywordGroupWithCore`) e as
 *      sustentações da Pesquisa por Assunto sem grupo (D5);
 *   5. grava `keyword_subject.plan` (ordem, papel, escopo, principal, trava
 *      manual) e a marca recíproca `keyword_declared_principal` — no cadastro
 *      único, a keyword aponta para si mesma;
 *   6. relê e confere a reciprocidade. Sucesso só depois disso.
 *
 * Acréscimo (`planMode` ausente ou "append", o padrão): as linhas enviadas são
 * casadas com os artigos já gravados do grupo; a casada que não mudou fica como
 * está (não volta a "Em revisão"); nenhum artigo sai por aqui ("Tirar do
 * plano" é o caminho).
 *
 * 2026-10-13 · SUBSTITUIR O PLANO (`planMode: "replace"`, só no destino "Silo
 * existente"; SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md` §5.2, F1,
 * D1 decidida pelo dono): as linhas enviadas SÃO o plano novo inteiro. A
 * prévia classifica em quatro listas — fica igual, muda, entra, sai — com o
 * motivo de cada uma e um `decisionHash`; o Pilar pode sair (o plano novo traz
 * outro) e o Assunto pode mudar de keyword. Aplicar exige o MESMO
 * `decisionHash` e faz, com releitura a cada passo: (a) "Sai" pelo núcleo de
 * "Tirar do plano" (`withdrawForPlanReplacementWithCore`: marcador de
 * liberação, versão v+1 do plano com o que fica), (b) o plano novo por este
 * mesmo caminho (v+2). Nada é apagado.
 *
 * Destino "artigo publicado": o Assunto (título e detalhes) é declarado NA
 * keyword publicada (URL, slug, canonical e principal intocados — AGENTS §11) e
 * as keywords das linhas entram como sustentações dele pelo núcleo da Pesquisa
 * por Assunto (`importSubjectDiscoveryWithCore`, origem `cadastro`).
 *
 * Nada pago, nada apagado: sobras de imports anteriores aparecem na prévia.
 */

type Client = Pick<SupabaseClient, "from">;
type Semantic = Record<string, unknown>;

const ID_CHUNK = 200;
const PAGE = 1000;
const LIVE_COLUMNS = "id,keyword,status,group_id,volume_search,results_allintitle";
const SUBJECT_SCAN_COLUMNS = "id,ks:analise_semantica->keyword_subject";
const CONVERSION_SCAN_COLUMNS = "id,keyword,ks:analise_semantica->keyword_subject,kc:analise_semantica->keyword_subject_conversion";

/**
 * O grupo do cadastro. A COR é a forma de sempre (§9.1-A, F6): a cor que já tem
 * grupo ativo leva o cadastro para ele; a cor sem grupo ganha o grupo pelo
 * MESMO caminho do mover por cor (`ensureEditorialGroupForColor`). `new` é o
 * mesmo que `color`; `existing` é o uuid (compatibilidade).
 */
export type DeclaredPlanGroupChoice =
  | { mode: "existing"; groupId: string }
  | { mode: "color"; color: EditorialGroupColor | string; name?: string | null }
  | { mode: "new"; name?: string | null; color: EditorialGroupColor | string };

/**
 * O destino do cadastro (SDD 2026-10-13 §3.4). Ausente = o comportamento do
 * plano de 2026-10-12 (Silo do texto/estrutura na cor escolhida, em acréscimo).
 */
export type SubjectCadastroDestination =
  | { kind: "new_silo" }
  | { kind: "existing_silo"; groupId: string }
  | { kind: "published"; url: string };

/**
 * 2026-10-13 · CONVERTER O ASSUNTO DO FORMATO ANTERIOR (SDD
 * `sdd-conversao-assunto-legado-2026-10-13.md` §5): o artigo `order` do cadastro
 * é a conversão da linha-título `fromKeywordId` (o Assunto anterior, sem plano).
 * O Assunto passa a morar na keyword do artigo (`principal`); a linha-título não
 * é tocada. `articleId` = o artigo do Arquiteto cujo `subject` apontava para ela.
 */
export type SubjectConversionRequest = { order: number; fromKeywordId: string; articleId?: string | null };

/**
 * O cadastro já estruturado (card e MCP): `subject` = título do Assunto, `principal` = a keyword que o carrega.
 * 2026-10-16 · `slug` (opcional) = o slug do artigo, do jeito que o dono escreveu ("/planos-de-internet/x/",
 * URL ou "x"); ausente = mantém o gravado (como a trava); `null` = tira o slug declarado.
 */
export type StructuredDeclaredPlan = {
  silo?: { name: string; slug?: string | null; objective?: string | null } | null;
  articles: Array<{ order: number; subject: string; principal?: string | null; role: DeclaredPlanRole; scope: string; lock?: DeclaredPlanLockChoice | null; slug?: string | null }>;
};

export type DeclaredPlanSubjectState = "new" | "existing" | "existing_subject" | "other_plan" | "published";
export type DeclaredPlanPrincipalState =
  | "missing"
  | "new"
  | "existing_with_volume"
  | "existing_without_volume"
  | "same_as_subject"
  | "same_as_subject_without_volume"
  | "is_other_subject"
  | "declared_elsewhere"
  | "published";

export const DECLARED_PLAN_SUBJECT_STATE_LABELS: Record<DeclaredPlanSubjectState, string> = {
  new: "novo",
  existing: "já existe",
  existing_subject: "já existe como Assunto",
  other_plan: "já é Assunto de outro plano",
  published: "já existe, publicado",
};

export const DECLARED_PLAN_PRINCIPAL_STATE_LABELS: Record<DeclaredPlanPrincipalState, string> = {
  missing: "sem keyword",
  new: "nova (entra como Bruto)",
  existing_with_volume: "já existe, com volume",
  existing_without_volume: "já existe, sem volume (aprova sem volume pela D2-bis)",
  same_as_subject: "a própria keyword do Assunto, com volume",
  same_as_subject_without_volume: "a própria keyword do Assunto, sem volume",
  is_other_subject: "já carrega o Assunto de outro artigo",
  declared_elsewhere: "já é a principal declarada de outro Assunto",
  published: "já publicada (tem página própria)",
};

/** Estados da keyword que impedem gravar. */
const PRINCIPAL_BLOCKING: ReadonlySet<DeclaredPlanPrincipalState> = new Set(["is_other_subject", "declared_elsewhere", "published"]);

/** O formato do artigo: o Assunto dentro da keyword (cadastro único) ou o anterior (Assunto em linha própria). */
export type DeclaredPlanShape = "cadastro" | "legacy";

export const DECLARED_PLAN_SHAPE_LABELS: Record<DeclaredPlanShape, string> = {
  cadastro: "Assunto dentro da keyword",
  legacy: "Assunto anterior ao cadastro único (continua na linha dele)",
};

export type DeclaredPlanLockPreview = {
  choice: DeclaredPlanLockChoice;
  state: DeclaredPlanLock;
  origin: DeclaredPrincipalLockOrigin;
  label: string;
};

export type DeclaredPlanPreviewArticle = {
  order: number;
  role: DeclaredPlanRole;
  scope: string;
  line: number;
  /** O título do Assunto (o que o dono escreveu). */
  title: string;
  shape: DeclaredPlanShape;
  /** O que acontece com este artigo ao aplicar. */
  change: "new" | "changed" | "unchanged";
  subject: { phrase: string; state: DeclaredPlanSubjectState; label: string; keywordId: string | null; status: string | null; groupId: string | null };
  /** A keyword que carrega o Assunto (no cadastro único) ou a principal declarada (no formato anterior). */
  principal: { phrase: string | null; state: DeclaredPlanPrincipalState; label: string; keywordId: string | null; status: string | null; volumeValidated: boolean; volume: number | null; groupId: string | null };
  lock: DeclaredPlanLockPreview | null;
  /**
   * 2026-10-16 · o slug declarado do artigo que vai ser gravado (o último
   * segmento), e o caminho inteiro quando veio no texto. `null` = sem slug
   * declarado (o Arquiteto forma pela principal). Ausente no destino publicado.
   */
  slug?: string | null;
  slugPath?: string | null;
  /** Por que este artigo impede gravar (vazio = pode). */
  problems: string[];
  /** Itens aprovados deste artigo que voltam para "Em revisão" ao gravar (R2). */
  approvedToReview: number;
  /** 2026-10-13 · conversão do formato anterior: a linha-título que deixa de carregar o Assunto. Ausente = cadastro comum. */
  conversion?: { fromKeywordId: string; fromPhrase: string; articleId: string | null } | null;
};

/** 2026-10-13 · Silo existente: acrescentar (o padrão de sempre) ou substituir o plano gravado pelo plano novo inteiro. */
export type DeclaredPlanMode = "append" | "replace";

export const DECLARED_PLAN_MODE_LABELS: Record<DeclaredPlanMode, string> = {
  append: "Acrescentar",
  replace: "Substituir o plano",
};

/** Uma linha das quatro listas da substituição, com o motivo. */
export type DeclaredPlanReplaceItem = {
  order: number;
  role: DeclaredPlanRole;
  title: string;
  keyword: string | null;
  /** A keyword que carrega (ou carregava) o Assunto. */
  keywordId: string | null;
  reasons: string[];
};

export type DeclaredPlanReplaceLeaving = DeclaredPlanReplaceItem & {
  /** `article`: artigo do plano gravado, sai por "Tirar do plano". `orphan_mark`: marca de principal deste grupo sem Assunto no plano (perdeu o Assunto antes), fora do plano novo: a marca sai. */
  kind: "article" | "orphan_mark";
  principalKeywordId: string | null;
  /** Aprovadas (Assunto e principal) que voltam a "Em revisão": o plano sai do pacote aprovado. */
  approvedToReview: number;
};

export type DeclaredPlanReplacePreview = {
  /** Cobre as quatro listas: aplicar só com o MESMO hash (a decisão humana foi sobre esta prévia). */
  decisionHash: string;
  same: DeclaredPlanReplaceItem[];
  changed: DeclaredPlanReplaceItem[];
  entering: DeclaredPlanReplaceItem[];
  leaving: DeclaredPlanReplaceLeaving[];
  /** Assunto do formato anterior (linha-título sem plano) nesta cor, fora do plano novo: fica como está (converter é "Converter formato anterior"; excluir não é daqui). */
  legacyOutside: Array<{ keywordId: string; keyword: string }>;
  /** A versão do plano depois da retirada (`null` quando nada do gravado fica) e depois do plano novo. */
  nextPlanVersions: { withdrawal: number | null; plan: number };
  effects: string[];
};

export type DeclaredPlanPreview = {
  destination: { kind: SubjectCadastroDestination["kind"] | "plan"; url: string | null; publishedKeyword: { keywordId: string; keyword: string } | null };
  silo: ParsedDeclaredPlan["silo"];
  siloPlan: DeclaredSiloPlan | null;
  unparsed: ParsedDeclaredPlan["unparsed"];
  refusals: DeclaredPlanRefusal[];
  notices: string[];
  group:
    | { mode: "existing"; groupId: string; name: string; color: EditorialGroupColor; hadPlan: boolean; planVersion: number; samePlan: boolean }
    | { mode: "new"; name: string; color: EditorialGroupColor | null };
  articles: DeclaredPlanPreviewArticle[];
  /** Artigos já gravados no plano do grupo que esta prévia não mexe (ficam como estão). */
  keptArticles: Array<{ order: number; title: string; keyword: string | null; role: DeclaredPlanRole }>;
  /** Keywords já gravadas que são sobra de import: não fazem parte do plano (D9: lixeira é ato do dono). */
  leftovers: Array<{
    keywordId: string;
    keyword: string;
    reason: "silo_name" | "pasted_label";
    label: string;
    /** Aditivo (SDD acelerar-fluxo 2026-10-13, item 9): não publicada e nunca enviada ao Arquiteto. */
    deletable?: boolean;
    blockedReason?: string | null;
  }>;
  supports: { total: number; withoutGroup: number; inOtherGroup: number };
  approvedToReview: number;
  /** Impedimentos: com qualquer um, `apply` recusa. */
  blockers: string[];
  canApply: boolean;
  planHash: string | null;
  /** 2026-10-13 · só no modo "Substituir o plano" (ausente no acréscimo: o corpo de sempre). */
  planMode?: "replace";
  replace?: DeclaredPlanReplacePreview;
};

/** 2026-10-13 · o que a substituição fez antes de gravar o plano novo (só no modo "Substituir o plano"). */
export type DeclaredPlanReplaceApplied = {
  /** A versão com os artigos que saíram (v+1); `null` quando nada do plano gravado ficou. */
  withdrawalPlanVersion: number | null;
  withdrawn: Array<{ subjectKeywordId: string; principalKeywordId: string | null; order: number; role: DeclaredPlanRole }>;
  orphanMarksCleared: string[];
};

export type DeclaredPlanApplyArticle = {
  order: number;
  title?: string;
  subjectKeywordId: string | null;
  principalKeywordId: string | null;
  outcome: "declared" | "unchanged" | "failed";
  reason: string | null;
};

export type DeclaredPlanImportRefusalCode =
  | "ACTOR_REQUIRED"
  | "BRAND_REQUIRED"
  | "PLAN_REQUIRED"
  | "IMPORT_REQUEST_REQUIRED"
  | "IMPORT_REQUEST_IN_PROGRESS"
  | "PLAN_BLOCKED"
  | "GROUP_REFUSED"
  | "GROUPS_NOT_AVAILABLE"
  /** 2026-10-13 · "Substituir o plano": aplicar sem a prévia, sobre prévia velha, ou a retirada ("Sai") parou no meio. */
  | "DECISION_REQUIRED"
  | "DECISION_STALE"
  | "WITHDRAWAL_FAILED"
  /** 2026-10-16 · o texto traz mais de um Silo e `siloName` não escolheu um deles (os Silos vão em `blockers`). */
  | "SILO_CHOICE_REQUIRED";

export type DeclaredPlanImportResult =
  | ({ ok: true; mode: "preview" } & DeclaredPlanPreview)
  | ({
      ok: true;
      mode: "apply";
      groupId: string;
      planVersion: number;
      articles: DeclaredPlanApplyArticle[];
      createdSubjectIds: string[];
      createdPrincipalIds: string[];
      groupAssignment: { moved: number; unchanged: number; refused: number };
      supportsStamped: number;
      reciprocityConfirmed: number;
      failed: number;
      notices: string[];
      /** Só no modo "Substituir o plano". */
      planMode?: "replace";
      replaced?: DeclaredPlanReplaceApplied;
    } & Pick<DeclaredPlanPreview, "silo" | "siloPlan" | "leftovers" | "destination">)
  | { ok: false; code: DeclaredPlanImportRefusalCode; reason: string; blockers?: string[] };

type LiveRow = { id: string; keyword: string; status: string | null; group_id: string | null; volume_search: number | null; results_allintitle: number | null };

/** Um artigo já gravado no plano do grupo (lido do Assunto com `plan.groupId`). */
type StoredArticle = {
  subjectId: string;
  subjectKeyword: string;
  plan: DeclaredArticlePlan;
  entry: SubjectEntry | null;
  shape: DeclaredPlanShape;
  title: string;
};

const inFlight = new Set<string>();

function asRecord(value: unknown): Semantic {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Semantic : {};
}

function blocos<T>(lista: readonly T[], tamanho = ID_CHUNK): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) saida.push(lista.slice(i, i + tamanho));
  return saida;
}

const chave = normalizeDeclaredPhraseKey;

async function readLiveRows(client: Client, brandId: string): Promise<LiveRow[]> {
  const rows: LiveRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await client.from("minerador_keywords").select(LIVE_COLUMNS).eq("brand_id", brandId).is("deleted_at", null).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as unknown as Array<Record<string, unknown>>;
    for (const row of data) {
      rows.push({
        id: String(row.id),
        keyword: typeof row.keyword === "string" ? row.keyword : "",
        status: typeof row.status === "string" ? row.status : null,
        group_id: typeof row.group_id === "string" ? row.group_id : null,
        volume_search: typeof row.volume_search === "number" ? row.volume_search : null,
        results_allintitle: typeof row.results_allintitle === "number" ? row.results_allintitle : null,
      });
    }
    if (data.length < PAGE) return rows;
  }
}

async function readSemantics(client: Client, brandId: string, ids: readonly string[]): Promise<Map<string, Semantic>> {
  const out = new Map<string, Semantic>();
  for (const bloco of blocos([...new Set(ids)])) {
    const result = await client.from("minerador_keywords").select("id,analise_semantica").eq("brand_id", brandId).in("id", bloco).is("deleted_at", null);
    if (result.error) throw result.error;
    for (const row of (result.data || []) as Array<{ id: unknown; analise_semantica?: unknown }>) out.set(String(row.id), asRecord(row.analise_semantica));
  }
  return out;
}

/**
 * Os artigos JÁ GRAVADOS no plano do grupo: os Assuntos vivos da marca cujo
 * `keyword_subject.plan.groupId` é o grupo. Lê só o `keyword_subject` (estreito).
 */
async function readStoredArticles(client: Client, brandId: string, groupId: string | null, keywordOf: (id: string) => string): Promise<StoredArticle[]> {
  if (!groupId) return [];
  const out: StoredArticle[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await client.from("minerador_keywords").select(SUBJECT_SCAN_COLUMNS).eq("brand_id", brandId).is("deleted_at", null).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as unknown as Array<{ id: unknown; ks?: unknown }>;
    for (const row of data) {
      const resolved = resolveKeywordSubject({ keyword_subject: row.ks });
      if (!resolved.declared || !resolved.plan || resolved.plan.groupId !== groupId) continue;
      const subjectId = String(row.id);
      const subjectKeyword = keywordOf(subjectId);
      out.push({
        subjectId,
        subjectKeyword,
        plan: resolved.plan,
        entry: resolved.entry,
        shape: resolved.plan.declaredPrincipal?.keywordId === subjectId ? "cadastro" : "legacy",
        title: resolved.entry?.title || subjectKeyword,
      });
    }
    if (data.length < PAGE) return out.sort((a, b) => a.plan.order - b.plan.order);
  }
}

/**
 * 2026-10-13 · CONVERSÃO (SDD `sdd-conversao-assunto-legado-2026-10-13.md` §6):
 * o índice T → K da marca (linhas-título já convertidas). Lê só o Assunto e o
 * bloco de conversão (estreito). Uma linha-título convertida nunca é adotada de
 * novo como Assunto do formato anterior.
 */
async function readConvertedTitles(client: Client, brandId: string): Promise<Map<string, ConvertedTitle>> {
  const rows: Array<{ id: string; keyword: string | null; semantic: Record<string, unknown> }> = [];
  for (let from = 0; ; from += PAGE) {
    const page = await client.from("minerador_keywords").select(CONVERSION_SCAN_COLUMNS).eq("brand_id", brandId).is("deleted_at", null).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as unknown as Array<{ id: unknown; keyword?: unknown; ks?: unknown; kc?: unknown }>;
    for (const row of data) if (row.kc) rows.push({ id: String(row.id), keyword: typeof row.keyword === "string" ? row.keyword : null, semantic: { [SUBJECT_CONVERSION_KEY]: row.kc, keyword_subject: row.ks } });
    if (data.length < PAGE) return convertedTitleIndex(rows);
  }
}

/** As sustentações da Pesquisa por Assunto dos Assuntos do plano (proveniência `subject_discovery`). */
async function readSupportRows(client: Client, brandId: string, subjectIds: ReadonlySet<string>): Promise<Array<{ id: string; groupId: string | null }>> {
  if (!subjectIds.size) return [];
  const out: Array<{ id: string; groupId: string | null }> = [];
  for (let from = 0; ; from += PAGE) {
    const page = await client.from("minerador_keywords")
      .select("id,group_id,sd:analise_semantica->subject_discovery->subjectKeywordIds")
      .eq("brand_id", brandId).is("deleted_at", null).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as unknown as Array<{ id: unknown; group_id?: unknown; sd?: unknown }>;
    for (const row of data) {
      const ids = Array.isArray(row.sd) ? row.sd.filter((id): id is string => typeof id === "string") : [];
      if (ids.some(id => subjectIds.has(id)) && !subjectIds.has(String(row.id))) out.push({ id: String(row.id), groupId: typeof row.group_id === "string" ? row.group_id : null });
    }
    if (data.length < PAGE) return out;
  }
}

/** O cadastro estruturado (card e MCP) passa pelas MESMAS recusas do texto colado. */
export function parsedPlanFromStructured(plan: StructuredDeclaredPlan): ParsedDeclaredPlan {
  const rawSlug = typeof plan.silo?.slug === "string" && plan.silo.slug.trim() ? plan.silo.slug.trim() : null;
  const silo: ParsedDeclaredPlan["silo"] = {
    heading: null,
    name: (plan.silo?.name || "").trim() || null,
    slug: rawSlug ? normalizeDeclaredSiloSlug(rawSlug) : null,
    rawSlug,
    objective: typeof plan.silo?.objective === "string" && plan.silo.objective.trim() ? plan.silo.objective.replace(/\s+/g, " ").trim() : null,
  };
  const articles: ParsedPlanArticle[] = plan.articles.map((article, index) => {
    // 2026-10-16 · o slug do artigo pela MESMA normalização do texto colado (ausente = mantém o gravado; null = tira).
    const rawSlug = article.slug === undefined ? undefined : typeof article.slug === "string" && article.slug.trim() ? article.slug.trim() : null;
    const endereco = rawSlug ? normalizeDeclaredArticleSlug(rawSlug) : null;
    return {
      order: article.order,
      subject: (article.subject || "").replace(/\s+/g, " ").trim(),
      principal: typeof article.principal === "string" && article.principal.trim() ? article.principal.replace(/\s+/g, " ").trim() : null,
      role: article.role,
      scope: (article.scope || "").replace(/\s+/g, " ").trim(),
      line: index + 1,
      ...(article.lock ? { lock: article.lock } : {}),
      ...(rawSlug !== undefined ? { rawSlug, slug: endereco?.slug ?? null, slugPath: endereco?.path ?? null } : {}),
    };
  });
  const { refusals, notices } = validateParsedDeclaredPlan({ silo, articles });
  return { silo, articles, unparsed: [], refusals, notices };
}

/** A identidade do plano: muda quando o texto declarado (ou a trava manual) muda, nunca pelos ids. */
export async function declaredPlanHash(parsed: Pick<ParsedDeclaredPlan, "silo" | "articles">): Promise<string> {
  return contentHash({
    silo: { name: parsed.silo.name, slug: parsed.silo.slug, objective: parsed.silo.objective },
    articles: [...parsed.articles].sort((a, b) => a.order - b.order).map(article => ({
      order: article.order,
      subject: normalizeDeclaredPhraseKey(article.subject),
      principal: article.principal ? normalizeDeclaredPhraseKey(article.principal) : null,
      role: article.role,
      scope: article.scope,
      // 2026-10-13 · a trava manual é significado; "auto" (ou nada) mantém o hash de antes.
      ...(article.lock === "locked" || article.lock === "free" ? { lock: article.lock } : {}),
      // 2026-10-16 · o slug declarado também é significado; sem slug, o hash é o de antes.
      ...(article.slug ? { slug: article.slug } : {}),
    })),
  });
}

function volumeOf(row: LiveRow | null, semantic: Semantic): { validated: boolean; value: number | null } {
  if (!row) return { validated: false, value: null };
  // A mesma leitura do select "Posto de principal" da keyword do plano (`keyword-plan-lock.ts`).
  return keywordLockVolume({ semantic, volumeSearch: row.volume_search, resultsAllintitle: row.results_allintitle });
}

/** O endereço comparável de uma URL publicada: host sem `www`, caminho sem barra final, sem query/hash. */
export function comparablePublishedUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path.toLowerCase()}`;
  } catch {
    return null;
  }
}

/* ============================================================== classificação */

type Resolved = {
  article: ParsedPlanArticle;
  shape: DeclaredPlanShape;
  stored: StoredArticle | null;
  subjectRow: LiveRow | null;
  keywordRow: LiveRow | null;
  /** A trava a gravar: `undefined` = sem trava manual. */
  nextLock: DeclaredPlanLock | undefined;
  /** 2026-10-16 · o slug declarado a gravar: `undefined` = sem slug (o Arquiteto forma pela principal). */
  nextSlug: string | undefined;
  /** O Assunto cadastrado a gravar (`undefined` = manter o gravado). */
  nextEntry: SubjectEntry | null | undefined;
  change: "new" | "changed" | "unchanged";
  /** 2026-10-13 · a conversão a gravar em K (bloco `keyword_subject_conversion`). */
  conversion?: { fromKeywordId: string; fromPhrase: string; articleId: string | null } | null;
};

type Classified = {
  preview: DeclaredPlanPreview;
  semantics: Map<string, Semantic>;
  groupRow: EditorialGroupPlanRow | null;
  parsed: ParsedDeclaredPlan;
  resolved: Resolved[];
  stored: StoredArticle[];
  /** O Silo planejado a gravar no grupo (acréscimo: os artigos gravados + os novos). */
  siloPlan: DeclaredSiloPlan | null;
  group: { mode: "existing"; groupId: string } | { mode: "new"; name: string; color: EditorialGroupColor | null };
  published: { keyword: LiveRow; title: string; details: string | null; url: string } | null;
  /** 2026-10-13 · "Substituir o plano": o que sai, para o apply (o mesmo da prévia). */
  replacement?: { leavingSubjectIds: string[]; orphanMarkKeywordIds: string[] } | null;
};

async function resolveGroupChoice(input: { brandId: string; groupsClient: Client; group: DeclaredPlanGroupChoice; destination?: SubjectCadastroDestination | null; notices: string[] }): Promise<{ ok: true; choice: DeclaredPlanGroupChoice } | { ok: false; code: "GROUPS_NOT_AVAILABLE"; reason: string }> {
  if (input.destination?.kind === "existing_silo") return { ok: true, choice: { mode: "existing", groupId: input.destination.groupId } };
  let escolha = input.group;
  if (escolha.mode !== "existing" && isEditorialGroupColor(escolha.color)) {
    const daCor = await readActiveEditorialGroupIdForColor(input.groupsClient, input.brandId, escolha.color);
    if (!daCor.ok) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: daCor.message };
    if (daCor.groupId) {
      input.notices.push(`A cor ${EDITORIAL_GROUP_COLOR_LABELS[escolha.color]} já tem grupo nesta marca: o plano vai para ele (um grupo por cor).`);
      escolha = { mode: "existing", groupId: daCor.groupId };
    }
  }
  return { ok: true, choice: escolha };
}

async function classify(input: {
  brandId: string;
  keywordsClient: Client;
  groupsClient: Client;
  parsed: ParsedDeclaredPlan;
  group: DeclaredPlanGroupChoice;
  destination?: SubjectCadastroDestination | null;
  brandSiteUrl?: string | null;
  conversions?: readonly SubjectConversionRequest[] | null;
  /** 2026-10-13 · "Substituir o plano" (só no Silo existente). */
  replace?: boolean;
  now: string;
}): Promise<Classified | { ok: false; code: "GROUPS_NOT_AVAILABLE"; reason: string }> {
  const { brandId, parsed } = input;
  const conversionByOrder = new Map((input.conversions ?? []).map(item => [item.order, item]));
  const destino = input.destination ?? null;
  const publicado = destino?.kind === "published";
  const substituir = Boolean(input.replace);
  const blockers: string[] = [];
  const notices: string[] = [];
  if (substituir && destino?.kind !== "existing_silo") blockers.push(`“${DECLARED_PLAN_MODE_LABELS.replace}” só vale no destino “Silo existente”: escolha o Silo da cor.`);
  // As recusas do plano são conferidas no plano INTEIRO (os já gravados + os do cadastro), mais abaixo.
  // 2026-10-16 · no Silo existente o Silo é o gravado: o slug tirado dos endereços dos artigos não é dito ali.
  if (!publicado) notices.push(...parsed.notices.filter(notice => !/sem "Palavra-chave:"/.test(notice) && !(destino?.kind === "existing_silo" && parsed.silo.slugDerived && /^O texto não trouxe o slug do Silo/.test(notice))));

  // O grupo: pela cor, pelo uuid, ou o grupo do Silo existente.
  const grupo = await resolveGroupChoice({ brandId, groupsClient: input.groupsClient, group: input.group, destination: destino, notices });
  if (!grupo.ok) return grupo;
  const escolha = grupo.choice;
  let groupRow: EditorialGroupPlanRow | null = null;
  let groupPreview: DeclaredPlanPreview["group"];
  if (escolha.mode === "existing") {
    const lido = await readEditorialGroupPlan(input.groupsClient, brandId, escolha.groupId);
    if (!lido.ok) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: lido.message };
    groupRow = lido.group;
    if (!groupRow) {
      blockers.push("O grupo escolhido não existe nesta marca.");
      groupPreview = { mode: "new", name: parsed.silo.name || "", color: null };
    } else {
      if (groupRow.status !== "active") blockers.push(`O grupo "${groupRow.name}" está arquivado: reative-o antes de cadastrar nele.`);
      groupPreview = { mode: "existing", groupId: groupRow.id, name: groupRow.name, color: groupRow.color, hadPlan: Boolean(groupRow.plan), planVersion: groupRow.planVersion, samePlan: false };
    }
  } else {
    const name = normalizeEditorialGroupName(escolha.name || parsed.silo.name || "") || "";
    const color = isEditorialGroupColor(escolha.color) ? escolha.color : null;
    if (!name && !publicado) blockers.push("Dê um nome ao grupo (padrão: o nome do Silo).");
    if (!color) blockers.push(`Escolha a cor do grupo: ${EDITORIAL_GROUP_COLORS.join(", ")}.`);
    const listing = await listEditorialGroupSummaries(input.groupsClient, brandId);
    if (!listing.ok) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: listing.message };
    if (name && !publicado && listing.groups.some(group => group.status === "active" && chave(group.name) === chave(name))) {
      blockers.push(`Já existe um grupo ativo "${name}" nesta marca: escolha a cor dele ou dê outro nome.`);
    }
    groupPreview = { mode: "new", name: name || (color ? EDITORIAL_GROUP_COLOR_LABELS[color] : ""), color };
  }
  const targetGroupId = groupRow?.id ?? null;

  const live = await readLiveRows(input.keywordsClient, brandId);
  const liveByKey = new Map<string, LiveRow>();
  const liveById = new Map<string, LiveRow>();
  for (const row of live) {
    liveById.set(row.id, row);
    const key = chave(row.keyword);
    if (key && !liveByKey.has(key)) liveByKey.set(key, row);
  }
  const keywordOf = (id: string) => liveById.get(id)?.keyword ?? "";

  if (publicado) {
    if (conversionByOrder.size) blockers.push("A conversão do formato anterior é para Silo (novo ou existente), não para artigo publicado.");
    return classifyPublished({ ...input, destination: destino, live, liveByKey, groupRow, groupPreview, blockers, notices });
  }

  // 2026-10-13 · as linhas-título já convertidas (T → K) nunca voltam a ser adotadas como Assunto anterior.
  const precisaIndice = conversionByOrder.size > 0 || parsed.articles.some(article => liveByKey.has(chave(article.subject)));
  const convertidas = precisaIndice ? await readConvertedTitles(input.keywordsClient, brandId) : new Map<string, ConvertedTitle>();

  const stored = await readStoredArticles(input.keywordsClient, brandId, targetGroupId, keywordOf);
  const storedPlan = groupRow ? readDeclaredSiloPlan(groupRow.plan) : null;

  // O Silo: novo (do cadastro) ou o gravado no grupo.
  let silo = parsed.silo;
  if (destino?.kind === "existing_silo") {
    if (!storedPlan) blockers.push("Este grupo ainda não tem Silo declarado: escolha \"Silo novo\".");
    else silo = { heading: null, name: storedPlan.siloName, slug: storedPlan.siloSlug, rawSlug: storedPlan.siloSlug, objective: storedPlan.objective };
    /*
     * 2026-10-13 · "Substituir o plano" (SDD §5.2, regra 4): o nome e o objetivo
     * do Silo podem mudar; o slug só muda se o Silo do grupo ainda não está
     * confirmado no Arquiteto (`editorial_groups.silo_id`) — confirmado, é do
     * Arquiteto (e publicado nunca muda, AGENTS §11).
     */
    if (substituir && storedPlan && parsed.silo.name) {
      // 2026-10-16 · o slug tirado dos endereços dos artigos (não escrito no texto) só vale quando o Silo ainda não tem slug nem foi confirmado.
      const slugDoTexto = parsed.silo.rawSlug && (!parsed.silo.slugDerived || (!storedPlan.siloSlug && !groupRow?.siloId)) ? parsed.silo.rawSlug : null;
      const slugPedido = slugDoTexto ? parsed.silo.slug : storedPlan.siloSlug;
      if (slugDoTexto && slugPedido !== storedPlan.siloSlug && groupRow?.siloId) {
        blockers.push(`O slug do Silo (${storedPlan.siloSlug ? `/${storedPlan.siloSlug}/` : "sem slug"}) já está confirmado no Arquiteto: trocar o slug é decisão de lá. Tire o "Slug:" do plano novo ou repita o atual.`);
      }
      silo = {
        heading: parsed.silo.heading,
        name: parsed.silo.name,
        slug: slugDoTexto ? parsed.silo.slug : storedPlan.siloSlug,
        rawSlug: slugDoTexto ?? storedPlan.siloSlug,
        objective: parsed.silo.objective ?? storedPlan.objective,
      };
      if (chave(storedPlan.siloName) !== chave(parsed.silo.name)) notices.push(`O Silo passa de "${storedPlan.siloName}" para "${parsed.silo.name}".`);
    }
  } else if (storedPlan && silo.name && chave(storedPlan.siloName) !== chave(silo.name)) {
    if (destino?.kind === "new_silo") blockers.push(`A cor ${groupRow ? EDITORIAL_GROUP_COLOR_LABELS[groupRow.color] : ""} já tem o Silo "${storedPlan.siloName}": escolha "Silo existente" para acrescentar artigos nele (ou "Substituir o plano" para trocar o plano inteiro), ou outra cor para um Silo novo.`);
    else notices.push(`O grupo já tem o Silo "${storedPlan.siloName}": o nome declarado passa a ser "${silo.name}".`);
  }

  // As frases do cadastro → linhas vivas; os DNAs só das que casaram.
  const matchedIds = new Set<string>(stored.map(item => item.subjectId));
  for (const item of stored) if (item.plan.declaredPrincipal) matchedIds.add(item.plan.declaredPrincipal.keywordId);
  for (const article of parsed.articles) {
    for (const phrase of [article.subject, article.principal]) {
      const id = phrase ? liveByKey.get(chave(phrase))?.id : undefined;
      if (id) matchedIds.add(id);
    }
  }
  for (const conversao of conversionByOrder.values()) matchedIds.add(conversao.fromKeywordId);
  const semantics = await readSemantics(input.keywordsClient, brandId, [...matchedIds]);

  /*
   * 1 — o artigo já gravado neste plano (cadastro pela keyword; anterior pelo
   * Assunto ou pela principal). Casado ANTES da classificação: a substituição
   * precisa saber o que sai (o gravado que nenhuma linha casou).
   */
  const usados = new Set<string>();
  const casados: Array<StoredArticle | null> = parsed.articles.map(article => {
    const title = article.subject;
    const keywordRow = article.principal ? liveByKey.get(chave(article.principal)) ?? null : null;
    const livre = (item: StoredArticle) => !usados.has(item.subjectId);
    const match = stored.find(item => livre(item) && item.shape === "cadastro" && keywordRow && item.subjectId === keywordRow.id)
      ?? stored.find(item => livre(item) && item.shape === "legacy" && (chave(item.subjectKeyword) === chave(title) || (item.entry && chave(item.entry.title) === chave(title))))
      ?? stored.find(item => livre(item) && item.shape === "legacy" && keywordRow && item.plan.declaredPrincipal?.keywordId === keywordRow.id)
      ?? null;
    if (match) usados.add(match.subjectId);
    return match;
  });
  /** 2026-10-13 · "Substituir o plano": o gravado que nenhuma linha casou SAI (pelo "Tirar do plano"). */
  const saem = substituir ? stored.filter(item => !usados.has(item.subjectId)) : [];
  const saemIds = new Set(saem.map(item => item.subjectId));
  /** O Assunto que muda de keyword: a keyword que sai → a que passa a carregar o título. */
  const assuntoPassaPara = new Map<string, string>();

  const resolved: Resolved[] = [];
  let approvedToReview = 0;
  const articles: DeclaredPlanPreviewArticle[] = parsed.articles.map((article, index) => {
    const problems: string[] = [];
    const title = article.subject;
    if (!title.trim()) problems.push(`Artigo ${article.order}: falta o Assunto (título).`);
    const keywordRow = article.principal ? liveByKey.get(chave(article.principal)) ?? null : null;

    // 0 — 2026-10-13 · conversão do formato anterior: a linha-título deixa o Assunto para a keyword do artigo.
    const conversao = conversionByOrder.get(article.order) ?? null;
    let conversion: Resolved["conversion"] = null;
    if (conversao) {
      const tituloRow = liveById.get(conversao.fromKeywordId) ?? null;
      const tituloSemantic = tituloRow ? semantics.get(tituloRow.id) ?? {} : {};
      const jaConvertida = convertidas.get(conversao.fromKeywordId);
      const kSemantic = keywordRow ? semantics.get(keywordRow.id) ?? {} : {};
      const kAssunto = resolveKeywordSubject(kSemantic);
      if (!tituloRow) problems.push(`Artigo ${article.order}: a linha-título a converter não existe mais nesta marca.`);
      else if (jaConvertida && jaConvertida.keywordId !== keywordRow?.id) problems.push(`Artigo ${article.order}: "${tituloRow.keyword}" já foi convertida para "${jaConvertida.keyword ?? jaConvertida.keywordId}". Desfaça aquela conversão antes de escolher outra keyword.`);
      else if (!jaConvertida && !isConvertibleLegacySubject(tituloSemantic)) problems.push(`Artigo ${article.order}: "${tituloRow.keyword}" não é um Assunto do formato anterior sem plano; nada a converter.`);
      if (!article.principal) problems.push(`Artigo ${article.order}: escolha a keyword que passa a carregar o Assunto.`);
      else if (tituloRow && keywordRow && keywordRow.id === tituloRow.id) problems.push(`Artigo ${article.order}: a keyword escolhida é a própria linha-título; escolha a keyword que carrega o artigo (a principal, por padrão).`);
      else if (keywordRow && kAssunto.declared && !kAssunto.entry && keywordRow.id !== tituloRow?.id) problems.push(`Artigo ${article.order}: "${keywordRow.keyword}" já é um Assunto do formato anterior; escolha outra keyword.`);
      if (tituloRow) conversion = { fromKeywordId: tituloRow.id, fromPhrase: tituloRow.keyword, articleId: conversao.articleId ?? null };
      if (tituloRow && !problems.length) notices.push(`Artigo ${article.order}: o Assunto sai da linha-título "${tituloRow.keyword}" e passa a morar em "${article.principal}"; a linha-título fica arquivada (não vai para a lixeira).`);
    }

    // 1 — o artigo já gravado neste plano (casado acima).
    const match = casados[index];
    const outraKeyword = !match ? stored.find(item => item.shape === "cadastro" && chave(item.title) === chave(title) && (!keywordRow || item.subjectId !== keywordRow.id)) : null;
    if (outraKeyword && !substituir) problems.push(`Artigo ${article.order}: o Assunto "${title}" já mora na keyword "${outraKeyword.subjectKeyword}". Para trocar a keyword, use "Tirar do plano" e cadastre de novo (ou "Substituir o plano").`);
    // 2026-10-13 · na substituição o Assunto PODE mudar de keyword: a anterior sai do plano (liberada), esta entra.
    if (outraKeyword && substituir && saemIds.has(outraKeyword.subjectId)) {
      assuntoPassaPara.set(outraKeyword.subjectId, article.principal || "");
      notices.push(`Artigo ${article.order}: o Assunto "${title}" passa de "${outraKeyword.subjectKeyword}" para "${article.principal || "(sem keyword)"}"; "${outraKeyword.subjectKeyword}" sai do plano pelo "Tirar do plano" (continua no Minerador, com o histórico).`);
    }

    // 2 — sem artigo gravado: Assunto anterior com a mesma frase é adotado; senão o Assunto mora na keyword.
    let shape: DeclaredPlanShape;
    let subjectRow: LiveRow | null;
    if (match) {
      shape = match.shape;
      subjectRow = liveById.get(match.subjectId) ?? null;
    } else {
      const titleRow = liveByKey.get(chave(title)) ?? null;
      const titleSubject = titleRow ? resolveKeywordSubject(semantics.get(titleRow.id) ?? {}) : null;
      if (!conversao && titleRow && titleSubject?.declared && !convertidas.has(titleRow.id) && (!keywordRow || titleRow.id !== keywordRow.id)) {
        shape = "legacy";
        subjectRow = titleRow;
        notices.push(`Artigo ${article.order}: "${title}" já é um Assunto gravado (anterior ao cadastro único) e continua na linha dele.`);
      } else {
        shape = "cadastro";
        subjectRow = keywordRow;
      }
    }

    const subjectSemantic = subjectRow ? semantics.get(subjectRow.id) ?? {} : {};
    const subject = resolveKeywordSubject(subjectSemantic);
    let subjectState: DeclaredPlanSubjectState = "new";
    if (subjectRow) {
      if (subject.plan && subject.plan.groupId !== targetGroupId) subjectState = "other_plan";
      else if (isKeywordPublished({ status: subjectRow.status, semantic: subjectSemantic })) subjectState = "published";
      else subjectState = subject.declared ? "existing_subject" : "existing";
    }
    if (subjectState === "other_plan") problems.push(`Artigo ${article.order}: "${subjectRow!.keyword}" já pertence ao plano de outro grupo: tire-o daquele plano antes.`);
    if (subjectState === "published" && shape === "cadastro") problems.push(`Artigo ${article.order}: a keyword "${subjectRow!.keyword}" já está publicada: para reforçar uma página publicada, use o destino "Artigo publicado".`);
    if (subjectState === "published" && shape === "legacy") notices.push(`Artigo ${article.order}: o Assunto já está publicado; declarar o plano não muda URL, slug nem canonical.`);
    if (subjectRow && subjectRow.group_id && subjectRow.group_id !== targetGroupId) notices.push(`Artigo ${article.order}: "${subjectRow.keyword}" está em outro grupo e passa para o grupo do cadastro.`);

    // 3 — a keyword (principal do artigo).
    let principalState: DeclaredPlanPrincipalState = "missing";
    let principalRow: LiveRow | null = null;
    let volume = { validated: false, value: null as number | null };
    if (!article.principal) {
      if (shape === "cadastro") problems.push(`Artigo ${article.order}: falta a keyword. O Assunto entra sempre por trás de uma keyword (mesmo sem volume).`);
    } else {
      principalRow = shape === "cadastro" ? subjectRow : keywordRow;
      const principalSemantic = principalRow ? semantics.get(principalRow.id) ?? {} : {};
      volume = volumeOf(principalRow, principalSemantic);
      const comVolume = volume.validated;
      if (!principalRow) principalState = "new";
      else if (shape === "legacy" && principalRow.id === subjectRow?.id) principalState = comVolume ? "same_as_subject" : "same_as_subject_without_volume";
      else {
        const mark = resolveDeclaredPrincipal(principalSemantic).mark;
        const declarada = resolveKeywordSubject(principalSemantic);
        const assuntoDeOutro = shape === "legacy" ? declarada.declared : declarada.declared && declarada.plan && declarada.plan.groupId !== targetGroupId;
        // 2026-10-13 · na substituição, a marca deste grupo cujo Assunto sai (ou já perdeu o plano) não prende a keyword: a retirada a solta antes.
        const marcaSolta = substituir && mark && mark.groupId === targetGroupId && !usados.has(mark.subjectKeywordId);
        const marcaDeOutro = mark && !marcaSolta && mark.subjectKeywordId !== (subjectRow?.id ?? null) && !stored.some(item => item.subjectId === mark.subjectKeywordId && (match ? item.subjectId === match.subjectId : false));
        if (assuntoDeOutro) principalState = "is_other_subject";
        else if (marcaDeOutro && shape === "cadastro" && mark && mark.subjectKeywordId !== principalRow.id) principalState = "declared_elsewhere";
        else if (marcaDeOutro && shape === "legacy") principalState = "declared_elsewhere";
        else if (isKeywordPublished({ status: principalRow.status, semantic: principalSemantic })) principalState = "published";
        else principalState = shape === "cadastro" ? (comVolume ? "same_as_subject" : "same_as_subject_without_volume") : (comVolume ? "existing_with_volume" : "existing_without_volume");
      }
      if (PRINCIPAL_BLOCKING.has(principalState) && !(shape === "cadastro" && principalState === "published")) {
        problems.push(`Artigo ${article.order}: a keyword "${article.principal}" ${DECLARED_PLAN_PRINCIPAL_STATE_LABELS[principalState]}.`);
      }
    }

    // 4 — a trava e o que muda.
    const escolha = article.lock;
    const storedLock = match?.plan.lock;
    const nextLock: DeclaredPlanLock | undefined = escolha === undefined ? storedLock : escolha === "auto" ? undefined : escolha;
    // 2026-10-16 · o slug: o do texto/linha; sem ele (ausente), o gravado fica; `null` tira.
    const nextSlug: string | undefined = article.rawSlug === undefined ? match?.plan.slug : article.slug ?? undefined;
    const nextEntry: SubjectEntry | null | undefined = shape === "cadastro"
      ? { title, source: "cadastro" }
      : chave(title) === chave(subjectRow?.keyword ?? "") ? undefined : { title, source: "cadastro" };
    const placeholder = `novo:${article.order}`;
    const subjectIdForLock = subjectRow?.id ?? placeholder;
    const principalIdForLock = shape === "cadastro" ? subjectIdForLock : principalRow?.id ?? `${placeholder}:principal`;
    const lockView = article.principal
      ? declaredPrincipalLock({ declaredPrincipal: { keywordId: principalIdForLock, phrase: article.principal }, ...(nextLock ? { lock: nextLock } : {}) }, { subjectKeywordId: subjectIdForLock, volume })
      : null;
    let change: Resolved["change"] = match ? "changed" : "new";
    if (match && subjectRow) {
      const nextContent = {
        order: article.order, role: article.role, scope: article.scope,
        declaredPrincipal: article.principal ? { keywordId: principalRow?.id ?? "", phrase: principalRow?.keyword || article.principal } : null,
        ...(nextLock ? { lock: nextLock } : {}),
        ...(nextSlug ? { slug: nextSlug } : {}),
      };
      const entryNext = nextEntry === undefined ? match.entry : nextEntry;
      if (principalRow && sameDeclaredArticleContent(match.plan, nextContent) && sameSubjectEntry(match.entry, entryNext)) change = "unchanged";
      // A conversão ainda não gravada em K muda o artigo, mesmo com o plano igual.
      if (change === "unchanged" && conversion) {
        const gravada = readSubjectConversion(semantics.get(subjectRow.id) ?? {});
        if (!gravada || gravada.fromKeywordId !== conversion.fromKeywordId || gravada.articleId !== conversion.articleId) change = "changed";
      }
    }
    if (escolha === "auto" && shape === "legacy" && !storedLock) notices.push(`Artigo ${article.order}: trava "automática" num Assunto anterior ao cadastro único = travada pela declaração.`);

    const aprovados = change === "unchanged" ? [] : [subjectRow, principalRow && principalRow !== subjectRow ? principalRow : null].filter((row): row is LiveRow => Boolean(row) && row!.status === "aprovado");
    approvedToReview += aprovados.length;
    blockers.push(...problems);
    resolved.push({ article, shape, stored: match, subjectRow, keywordRow: principalRow, nextLock, nextSlug, nextEntry, change, conversion });
    return {
      order: article.order,
      role: article.role,
      scope: article.scope,
      line: article.line,
      title,
      shape,
      change,
      slug: nextSlug ?? null,
      slugPath: nextSlug ? (article.slug === nextSlug && article.slugPath ? article.slugPath : null) : null,
      subject: { phrase: title, state: subjectState, label: shape === "cadastro" ? `${DECLARED_PLAN_SHAPE_LABELS.cadastro} · ${DECLARED_PLAN_SUBJECT_STATE_LABELS[subjectState]}` : DECLARED_PLAN_SUBJECT_STATE_LABELS[subjectState], keywordId: subjectRow?.id ?? null, status: subjectRow?.status ?? null, groupId: subjectRow?.group_id ?? null },
      principal: { phrase: article.principal, state: principalState, label: DECLARED_PLAN_PRINCIPAL_STATE_LABELS[principalState], keywordId: principalRow?.id ?? null, status: principalRow?.status ?? null, volumeValidated: volume.validated, volume: volume.value, groupId: principalRow?.group_id ?? null },
      lock: lockView ? { choice: nextLock ?? "auto", state: lockView.state, origin: lockView.origin, label: lockView.label } : null,
      problems,
      approvedToReview: aprovados.length,
      ...(conversion ? { conversion } : {}),
    };
  });

  // O plano inteiro (acréscimo): os gravados que esta prévia não mexe + os do cadastro. Na substituição: só os do cadastro.
  const kept = substituir ? [] : stored.filter(item => !usados.has(item.subjectId));
  const keptArticles: ParsedPlanArticle[] = kept.map(item => ({
    order: item.plan.order, subject: item.title, principal: item.plan.declaredPrincipal?.phrase ?? null, role: item.plan.role, scope: item.plan.scope, line: 0,
    ...(item.plan.lock ? { lock: item.plan.lock } : {}),
    ...(item.plan.slug ? { rawSlug: item.plan.slug, slug: item.plan.slug, slugPath: null } : {}),
  }));
  // 2026-10-16 · o slug efetivo de cada linha (o do texto, ou o gravado que fica) entra na conferência e no hash do plano inteiro.
  const merged: ParsedPlanArticle[] = [...keptArticles, ...parsed.articles.map((article, index) => {
    const nextSlug = resolved[index].nextSlug;
    return {
      ...article,
      lock: resolved[index].nextLock ?? "auto" as const,
      ...(article.rawSlug === undefined ? (nextSlug ? { rawSlug: nextSlug, slug: nextSlug, slugPath: null } : {}) : {}),
    };
  })];
  const mergedCheck = validateParsedDeclaredPlan({ silo, articles: merged });
  for (const refusal of mergedCheck.refusals) {
    blockers.push(kept.length && !parsed.refusals.some(item => item.message === refusal.message) ? `${refusal.message} (contando os ${kept.length} artigo(s) já gravados no plano)` : refusal.message);
  }
  if (kept.length) notices.push(`${kept.length} artigo(s) já gravado(s) neste plano não mudam: ${kept.map(item => `${item.plan.order}. ${item.title}`).join("; ")}.`);
  const siloPlanCandidate = silo.name ? { siloName: silo.name.trim(), siloSlug: silo.slug, objective: silo.objective ? silo.objective.trim() : null, articleCount: merged.length } : null;
  const siloPlan = siloPlanCandidate && siloPlanCandidate.articleCount >= 1 ? readDeclaredSiloPlan(siloPlanCandidate) : null;
  const planHash = mergedCheck.refusals.length || !siloPlan ? null : await declaredPlanHash({ silo, articles: merged });
  if (groupPreview.mode === "existing" && groupRow) groupPreview.samePlan = Boolean(groupRow.plan && planHash && groupRow.planHash === planHash);
  if (!substituir && groupRow?.plan && planHash && groupRow.planHash !== planHash) notices.push(`O plano do grupo "${groupRow.name}" passa de v${groupRow.planVersion} para v${groupRow.planVersion + 1}.`);

  const planKeys = new Set(merged.flatMap(article => [article.subject, article.principal]).filter((phrase): phrase is string => Boolean(phrase)).map(chave));
  const leftoversBase = live
    .filter(row => !planKeys.has(chave(row.keyword)))
    .map(row => ({ row, reason: declaredPlanLeftoverReason(row.keyword, { silo }) }))
    .filter((item): item is { row: LiveRow; reason: "silo_name" | "pasted_label" } => Boolean(item.reason))
    .map(item => ({ keywordId: item.row.id, keyword: item.row.keyword, reason: item.reason, label: DECLARED_PLAN_LEFTOVER_LABELS[item.reason] }));
  // 2026-10-13 · SDD acelerar-fluxo, item 9 (D9): só a sobra não publicada e nunca enviada ao Arquiteto é oferecida para exclusão.
  const leftoverDeletion = await classifyDeclaredPlanLeftovers(input.keywordsClient, brandId, leftoversBase.map(item => item.keywordId));
  const leftovers = leftoversBase.map(item => ({ ...item, ...(leftoverDeletion.get(item.keywordId) ?? { deletable: false, blockedReason: DECLARED_PLAN_LEFTOVER_BLOCKED.unknown }) }));
  if (leftovers.length) notices.push(`${leftovers.length} keyword(s) já gravada(s) parecem sobra de import (nome do Silo ou rótulo colado): ficam fora do plano. Excluir é decisão sua e apaga de vez (keyword não publicada não vai para uma lixeira recuperável).`);

  const subjectIdsOfPlan = new Set([...kept.map(item => item.subjectId), ...resolved.map(item => item.subjectRow?.id).filter((id): id is string => Boolean(id))]);
  const supports = await readSupportRows(input.keywordsClient, brandId, subjectIdsOfPlan);
  const supportsInfo = {
    total: supports.length,
    withoutGroup: supports.filter(item => !item.groupId).length,
    inOtherGroup: supports.filter(item => item.groupId && item.groupId !== targetGroupId).length,
  };
  if (supportsInfo.inOtherGroup) notices.push(`${supportsInfo.inOtherGroup} sustentação(ões) da Pesquisa por Assunto estão em outro grupo e não mudam (um grupo por keyword).`);
  if (approvedToReview) notices.push(`${approvedToReview} item(ns) aprovado(s) voltam para "Em revisão" ao gravar (o cadastro entra no pacote aprovado); a reaprovação só pede a Lógica.`);
  const livres = articles.filter(article => article.lock?.state === "free").length;
  if (livres) notices.push(`${livres} keyword(s) entram LIVRES (sem volume medido ou escolha sua): o Arquiteto pode propor outra principal pela SERP/volume; o Assunto, o papel e a ordem ficam presos ao artigo.`);

  // 2026-10-13 · "Substituir o plano": as quatro listas (com o motivo), as marcas órfãs e o decisionHash.
  let replace: DeclaredPlanReplacePreview | null = null;
  let replacement: Classified["replacement"] = null;
  if (substituir && groupRow && storedPlan) {
    const montado = await buildReplacePreview({
      keywordsClient: input.keywordsClient, brandId, groupRow, stored, saem, casados, resolved, articles, parsed, planHash, liveById, semantics, assuntoPassaPara,
    });
    replace = montado.preview;
    replacement = { leavingSubjectIds: saem.map(item => item.subjectId), orphanMarkKeywordIds: montado.orphanMarkKeywordIds };
    if (montado.notices.length) notices.push(...montado.notices);
  }

  const uniqueBlockers = [...new Set(blockers)];
  return {
    preview: {
      destination: { kind: destino?.kind ?? "plan", url: null, publishedKeyword: null },
      silo,
      siloPlan,
      unparsed: parsed.unparsed,
      refusals: parsed.refusals,
      notices: [...new Set(notices)],
      group: groupPreview,
      articles,
      keptArticles: kept.map(item => ({ order: item.plan.order, title: item.title, keyword: item.plan.declaredPrincipal?.phrase ?? null, role: item.plan.role })),
      leftovers,
      supports: supportsInfo,
      approvedToReview,
      blockers: uniqueBlockers,
      canApply: uniqueBlockers.length === 0 && Boolean(siloPlan) && Boolean(planHash) && parsed.articles.length > 0 && (!substituir || Boolean(replace)),
      planHash,
      ...(substituir ? { planMode: "replace" as const, ...(replace ? { replace } : {}) } : {}),
    },
    semantics,
    groupRow,
    parsed,
    resolved,
    stored,
    siloPlan,
    group: groupPreview.mode === "existing" ? { mode: "existing", groupId: groupPreview.groupId } : { mode: "new", name: groupPreview.name, color: groupPreview.color },
    published: null,
    replacement,
  };
}

/* ======================================= substituir o plano: as quatro listas */

type ReplaceScanRow = { id: string; keyword: string; groupId: string | null; semantic: Semantic };

/** A varredura estreita da substituição: Assunto, histórico e marca de principal (as órfãs e as linhas-título do formato anterior). */
async function readReplaceScan(client: Client, brandId: string, groupId: string): Promise<ReplaceScanRow[]> {
  const out: ReplaceScanRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await client.from("minerador_keywords").select(RECOVERY_SCAN_COLUMNS).eq("brand_id", brandId).is("deleted_at", null).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as unknown as Array<{ id: unknown; keyword?: unknown; group_id?: unknown; ks?: unknown; kh?: unknown; ka?: unknown; ko?: unknown; dp?: unknown }>;
    for (const row of data) {
      const mark = resolveDeclaredPrincipal({ keyword_declared_principal: row.dp }).mark;
      if (row.group_id !== groupId && mark?.groupId !== groupId) continue;
      out.push({
        id: String(row.id),
        keyword: typeof row.keyword === "string" ? row.keyword : "",
        groupId: typeof row.group_id === "string" ? row.group_id : null,
        semantic: { keyword_subject: row.ks, keyword_subject_history: row.kh, keyword_subject_at: row.ka, keyword_subject_origin: row.ko, keyword_declared_principal: row.dp },
      });
    }
    if (data.length < PAGE) return out;
  }
}

const lockLabel = (lock: DeclaredPlanLock | undefined | null) => PLAN_LOCK_CHOICE_LABELS[(lock ?? "auto") as DeclaredPlanLockChoice];

async function buildReplacePreview(input: {
  keywordsClient: Client;
  brandId: string;
  groupRow: EditorialGroupPlanRow;
  stored: StoredArticle[];
  saem: StoredArticle[];
  casados: Array<StoredArticle | null>;
  resolved: Resolved[];
  articles: DeclaredPlanPreviewArticle[];
  parsed: ParsedDeclaredPlan;
  planHash: string | null;
  liveById: Map<string, LiveRow>;
  semantics: Map<string, Semantic>;
  assuntoPassaPara: Map<string, string>;
}): Promise<{ preview: DeclaredPlanReplacePreview; orphanMarkKeywordIds: string[]; notices: string[] }> {
  const { groupRow, stored, saem, casados, resolved, articles, parsed, liveById } = input;
  const notices: string[] = [];
  const same: DeclaredPlanReplaceItem[] = [];
  const changed: DeclaredPlanReplaceItem[] = [];
  const entering: DeclaredPlanReplaceItem[] = [];
  const pilarNovo = parsed.articles.find(article => article.role === "Pilar") ?? null;

  resolved.forEach((item, index) => {
    const article = item.article;
    const preview = articles[index];
    const match = casados[index];
    const base: DeclaredPlanReplaceItem = { order: article.order, role: article.role, title: article.subject, keyword: article.principal, keywordId: preview.subject.keywordId, reasons: [] };
    if (match && item.change === "unchanged") {
      same.push({ ...base, reasons: ["igual ao gravado (ordem, papel, keyword, trava, detalhes e título): nada é regravado e não volta a “Em revisão”"] });
      return;
    }
    if (match) {
      const motivos: string[] = [];
      if (match.plan.order !== article.order) motivos.push(`ordem ${match.plan.order} → ${article.order}`);
      if (match.plan.role !== article.role) motivos.push(`papel ${match.plan.role} → ${article.role}`);
      const principalAntes = match.plan.declaredPrincipal;
      if ((principalAntes?.keywordId ?? null) !== (item.keywordRow?.id ?? null)) motivos.push(`keyword “${principalAntes?.phrase ?? "sem keyword"}” → “${article.principal ?? "sem keyword"}”`);
      if ((match.plan.lock ?? null) !== (item.nextLock ?? null)) motivos.push(`trava ${lockLabel(match.plan.lock)} → ${lockLabel(item.nextLock)}`);
      if (match.plan.scope !== article.scope) motivos.push("detalhes mudam");
      if ((match.plan.slug ?? null) !== (item.nextSlug ?? null)) motivos.push(`slug ${match.plan.slug ? `/${match.plan.slug}/` : "sem slug"} → ${item.nextSlug ? `/${item.nextSlug}/` : "sem slug"}`);
      const tituloDepois = item.nextEntry === undefined ? match.title : item.nextEntry?.title ?? match.title;
      if (chave(tituloDepois) !== chave(match.title)) motivos.push(`título “${match.title}” → “${tituloDepois}”`);
      if (item.conversion) motivos.push("o Assunto do formato anterior passa a morar na keyword (conversão)");
      if (!motivos.length) motivos.push("regravado na versão nova do plano");
      if (preview.approvedToReview) motivos.push(`${preview.approvedToReview} aprovada(s) voltam a “Em revisão” (a reaprovação só pede a Lógica)`);
      changed.push({ ...base, reasons: motivos });
      return;
    }
    const motivos: string[] = [];
    const veioDe = [...input.assuntoPassaPara.entries()].find(([, destino]) => destino && chave(destino) === chave(article.principal || ""));
    if (veioDe) motivos.push(`o Assunto vem de “${liveById.get(veioDe[0])?.keyword ?? veioDe[0]}” (que sai do plano)`);
    const marca = preview.subject.keywordId ? resolveDeclaredPrincipal(input.semantics.get(preview.subject.keywordId) ?? {}).mark : null;
    if (marca && marca.groupId === groupRow.id && !stored.some(gravado => gravado.subjectId === marca.subjectKeywordId)) motivos.push("volta ao plano: a keyword tinha perdido o Assunto (Recuperado do histórico)");
    if (!preview.subject.keywordId) motivos.push("keyword nova: entra como Bruto");
    if (!motivos.length) motivos.push("linha nova no plano");
    entering.push({ ...base, reasons: motivos });
  });

  const leaving: DeclaredPlanReplaceLeaving[] = saem.map(item => {
    const motivos: string[] = [];
    const destino = input.assuntoPassaPara.get(item.subjectId);
    if (destino) motivos.push(`o Assunto passa para “${destino}”`);
    else if (item.plan.role === "Pilar" && pilarNovo) motivos.push(`Pilar substituído: o plano novo traz “${pilarNovo.subject}” como Pilar`);
    else motivos.push("não está no plano novo");
    motivos.push("sai pelo “Tirar do plano”: o Assunto continua declarado na keyword, sem plano; nada é apagado");
    const principalId = item.plan.declaredPrincipal?.keywordId ?? null;
    const aprovados = [...new Set([item.subjectId, principalId].filter((id): id is string => Boolean(id)))].filter(id => liveById.get(id)?.status === "aprovado").length;
    if (aprovados) motivos.push(`${aprovados} aprovada(s) voltam a “Em revisão” (o plano sai do pacote aprovado)`);
    return {
      kind: "article",
      order: item.plan.order,
      role: item.plan.role,
      title: item.title,
      keyword: item.plan.declaredPrincipal?.phrase ?? item.subjectKeyword,
      keywordId: item.subjectId,
      principalKeywordId: principalId,
      approvedToReview: aprovados,
      reasons: motivos,
    };
  });

  // As marcas de principal deste grupo sem Assunto no plano (o Assunto se perdeu antes) e as linhas-título do formato anterior.
  const varredura = await readReplaceScan(input.keywordsClient, input.brandId, groupRow.id);
  const storedIds = new Set(stored.map(item => item.subjectId));
  const linhaIds = new Set(resolved.flatMap(item => [item.subjectRow?.id, item.keywordRow?.id]).filter((id): id is string => Boolean(id)));
  const orphanMarkKeywordIds: string[] = [];
  for (const row of varredura) {
    const mark = resolveDeclaredPrincipal(row.semantic).mark;
    if (!mark || mark.groupId !== groupRow.id || storedIds.has(mark.subjectKeywordId) || linhaIds.has(row.id)) continue;
    const recuperada = recoverSubjectFromHistory({ keywordId: row.id, keyword: row.keyword, semantic: row.semantic, groupId: groupRow.id });
    orphanMarkKeywordIds.push(row.id);
    leaving.push({
      kind: "orphan_mark",
      order: recuperada?.order ?? 0,
      role: recuperada?.role ?? "Suporte",
      title: recuperada?.title ?? row.keyword,
      keyword: row.keyword,
      keywordId: row.id,
      principalKeywordId: row.id,
      approvedToReview: liveById.get(row.id)?.status === "aprovado" ? 1 : 0,
      reasons: [
        "marca de principal deste grupo sem Assunto no plano (o Assunto se perdeu antes) e fora do plano novo: a marca sai; a keyword continua no Minerador e no grupo",
        ...(recuperada ? ["não volta mais como “Recuperado do histórico” (a decisão fica no histórico)"] : []),
      ],
    });
  }
  const candidatasTitulo = varredura.filter(row => row.groupId === groupRow.id && !linhaIds.has(row.id) && isConvertibleLegacySubject(row.semantic));
  const convertidas = candidatasTitulo.length ? await readConvertedTitles(input.keywordsClient, input.brandId) : new Map<string, ConvertedTitle>();
  const legacyOutside = candidatasTitulo.filter(row => !convertidas.has(row.id)).map(row => ({ keywordId: row.id, keyword: row.keyword }));
  if (legacyOutside.length) notices.push(`${legacyOutside.length} Assunto(s) do formato anterior nesta cor ficam fora do plano novo e ficam como estão (nada é excluído): para levá-los para uma keyword, use “Converter formato anterior”.`);

  const versao = groupRow.planVersion;
  const ficam = stored.length - saem.length;
  const withdrawal = saem.length && ficam >= 1 ? versao + 1 : null;
  const plan = withdrawal === null && groupRow.planHash && input.planHash === groupRow.planHash ? versao : (withdrawal ?? versao) + 1;
  const aprovadosQueSaem = leaving.reduce((total, item) => total + item.approvedToReview, 0);
  const effects = [
    `Fica igual: ${same.length} · Muda: ${changed.length} · Entra: ${entering.length} · Sai: ${leaving.length}.`,
    leaving.length
      ? `O que sai passa pelo “Tirar do plano” (inclusive o Pilar, quando o plano novo traz outro): o Assunto fica declarado na keyword, sem plano; a principal perde a marca. Nada é apagado: as keywords continuam no Minerador e no grupo, com o histórico.`
      : "Nada sai do plano.",
    withdrawal !== null
      ? `Uma decisão, duas versões: a retirada grava o plano v${withdrawal} (com o que fica) e o plano novo grava v${plan}.`
      : saem.length
        ? `Nada do plano gravado fica: o plano novo grava v${plan} direto (a retirada não tem versão própria).`
        : plan === versao ? `O plano continua v${versao} (sem mudança).` : `O plano novo grava v${plan}.`,
    ...(aprovadosQueSaem ? [`${aprovadosQueSaem} aprovada(s) do que sai voltam a “Em revisão”; sem o plano, a aprovação delas passa a pedir Volume (a exceção D2-bis só vale dentro do plano).`] : []),
    "No Arquiteto: o artigo que já existe para um Assunto que saiu fica “Fora do plano” até você decidir lá; depois de reaprovar e reenviar, o Arquiteto mostra “Atualização disponível”. Radar, Redator e publicados não mudam (URL, slug, canonical e principal publicada protegidos).",
  ];
  const decisionHash = await contentHash({
    groupId: groupRow.id,
    planVersion: versao,
    planHash: groupRow.planHash,
    nextPlanHash: input.planHash,
    leaving: saem.map(item => ({ subjectKeywordId: item.subjectId, plan: item.plan })),
    orphanMarks: [...orphanMarkKeywordIds].sort(),
    lines: resolved.map((item, index) => ({ order: item.article.order, subject: item.subjectRow?.id ?? null, principal: item.keywordRow?.id ?? null, change: item.change, matched: casados[index]?.subjectId ?? null })),
  });
  return {
    preview: { decisionHash, same, changed, entering, leaving, legacyOutside, nextPlanVersions: { withdrawal, plan }, effects },
    orphanMarkKeywordIds,
    notices,
  };
}

/* ============================================ destino: artigo publicado (URL) */

async function classifyPublished(input: {
  brandId: string;
  keywordsClient: Client;
  parsed: ParsedDeclaredPlan;
  destination: { kind: "published"; url: string };
  brandSiteUrl?: string | null;
  now: string;
  live: LiveRow[];
  liveByKey: Map<string, LiveRow>;
  groupRow: EditorialGroupPlanRow | null;
  groupPreview: DeclaredPlanPreview["group"];
  blockers: string[];
  notices: string[];
}): Promise<Classified> {
  const { brandId, parsed, live, liveByKey, blockers, notices } = input;
  const bruta = typeof input.destination.url === "string" ? input.destination.url.trim() : "";
  const conferida = validateSubjectDestination({ rawUrl: bruta, brandSiteUrl: input.brandSiteUrl ?? null, checkedAt: input.now });
  // Sem site declarado na marca, o domínio não é conferível aqui: vale o casamento com a keyword publicada abaixo.
  const url = !conferida.ok ? null : conferida.destinationUrl ?? (/^https:\/\//i.test(bruta) && comparablePublishedUrl(bruta) ? bruta : null);
  if (!conferida.ok) blockers.push(`URL do artigo publicado: ${conferida.reason}`);
  else if (!url) blockers.push("Informe a URL completa do artigo publicado (https://…).");

  // A keyword publicada desta URL (Vínculo/`site_origin`).
  const alvo = url ? comparablePublishedUrl(url) : null;
  const semantics = new Map<string, Semantic>();
  const candidatas: LiveRow[] = [];
  if (alvo) {
    const comOrigem = await readSiteOrigins(input.keywordsClient, brandId);
    for (const row of live) {
      const origem = comOrigem.get(row.id);
      if (!origem) continue;
      const enderecos = [origem.canonicalUrl, origem.declaredCanonicalUrl, origem.resolvedUrl, origem.sourceUrl].map(comparablePublishedUrl).filter(Boolean);
      if (!enderecos.includes(alvo)) continue;
      if (isKeywordPublished({ status: row.status, semantic: { site_origin: origem } })) candidatas.push(row);
    }
  }
  if (alvo && !candidatas.length) blockers.push("Nenhuma keyword publicada desta marca está ligada a esta URL: confira o Vínculo da página no Minerador (Perfil → publicação).");
  if (candidatas.length > 1) blockers.push(`Mais de uma keyword publicada está ligada a esta URL (${candidatas.map(row => `"${row.keyword}"`).join(", ")}): resolva o Vínculo antes.`);
  const pagina = candidatas.length === 1 ? candidatas[0] : null;
  const paginaSemantic = pagina ? (await readSemantics(input.keywordsClient, brandId, [pagina.id])).get(pagina.id) ?? {} : {};
  if (pagina) semantics.set(pagina.id, paginaSemantic);

  // Título e detalhes: um Assunto por página — a primeira linha que trouxer.
  const titulos = [...new Set(parsed.articles.map(article => article.subject).filter(Boolean))];
  const detalhes = [...new Set(parsed.articles.map(article => article.scope).filter(Boolean))];
  // 2026-10-16 · publicado: URL, slug e canonical são da página (AGENTS §11); o slug colado não é usado.
  if (parsed.articles.some(article => typeof article.rawSlug === "string" && article.rawSlug.trim())) notices.push("O slug das linhas não vale no destino “Artigo publicado”: URL, slug e canonical da página não mudam; ele foi ignorado.");
  if (!titulos.length) blockers.push("Escreva o Assunto (título) do artigo publicado na primeira linha.");
  if (titulos.length > 1 && new Set(titulos.map(chave)).size > 1) blockers.push(`Um Assunto por artigo publicado: as linhas trazem títulos diferentes (${titulos.map(item => `"${item}"`).join(", ")}). Deixe o título só na primeira linha.`);
  if (detalhes.length > 1) blockers.push("Os detalhes do Assunto vão uma vez só (na primeira linha) no destino publicado.");
  const title = titulos[0] ?? "";
  const details = detalhes[0] ?? null;
  if (title.length > SUBJECT_ENTRY_TITLE_MAX) blockers.push(`O título passa de ${SUBJECT_ENTRY_TITLE_MAX} caracteres.`);
  if (details && details.length > DECLARED_PLAN_SCOPE_MAX) blockers.push(`Os detalhes passam de ${DECLARED_PLAN_SCOPE_MAX} caracteres.`);
  const atual = pagina ? resolveKeywordSubject(paginaSemantic) : null;
  if (atual?.declared && atual.entry && chave(atual.entry.title) !== chave(title)) blockers.push(`A página já tem o Assunto "${atual.entry.title}": um Assunto por artigo. Use o mesmo título para acrescentar keywords.`);
  if (atual?.plan) blockers.push("A keyword desta página carrega um artigo de plano de Silo: acrescente pelo destino \"Silo existente\".");

  const articles: DeclaredPlanPreviewArticle[] = parsed.articles.map((article, index) => {
    const problems: string[] = [];
    const row = article.principal ? liveByKey.get(chave(article.principal)) ?? null : null;
    let state: DeclaredPlanPrincipalState = row ? "existing_without_volume" : "new";
    if (!article.principal) { state = "missing"; problems.push(`Linha ${index + 1}: falta a keyword que reforça a página.`); }
    else if (row && pagina && row.id === pagina.id) problems.push(`Linha ${index + 1}: "${row.keyword}" é a própria keyword da página publicada (protegida); escreva a keyword que vai reforçá-la.`);
    else if (row && row.status && /publicad|published/i.test(row.status)) { state = "published"; problems.push(`Linha ${index + 1}: "${row.keyword}" já tem página própria publicada.`); }
    blockers.push(...problems);
    return {
      order: index + 1, role: "Suporte", scope: index === 0 ? details ?? "" : "", line: article.line, title, shape: "cadastro", change: "new",
      subject: { phrase: title, state: atual?.declared ? "existing_subject" : pagina ? "published" : "new", label: pagina ? `Assunto da página publicada "${pagina.keyword}"` : "página não encontrada", keywordId: pagina?.id ?? null, status: pagina?.status ?? null, groupId: pagina?.group_id ?? null },
      principal: { phrase: article.principal, state, label: state === "missing" ? DECLARED_PLAN_PRINCIPAL_STATE_LABELS.missing : row ? "já existe: entra como sustentação da página" : "nova (Bruto): entra como sustentação da página", keywordId: row?.id ?? null, status: row?.status ?? null, volumeValidated: false, volume: row?.volume_search ?? null, groupId: row?.group_id ?? null },
      lock: null,
      problems,
      approvedToReview: 0,
    };
  });
  if (pagina) notices.push(`Destino: a página publicada "${pagina.keyword}" — URL, slug, canonical e principal não mudam (AGENTS §11). As keywords entram como sustentações do Assunto dela e chegam ao Arquiteto pelo caminho de "Melhorar publicados".`);
  if (articles.some(article => article.principal.keywordId)) notices.push("Keyword já aprovada não recebe a origem do cadastro (para não tirar a aprovação): o Arquiteto ainda pode usá-la pela SERP.");

  const uniqueBlockers = [...new Set(blockers)];
  return {
    preview: {
      destination: { kind: "published", url, publishedKeyword: pagina ? { keywordId: pagina.id, keyword: pagina.keyword } : null },
      silo: { heading: null, name: null, slug: null, rawSlug: null, objective: null },
      siloPlan: null,
      unparsed: parsed.unparsed,
      refusals: [],
      notices: [...new Set(notices)],
      group: input.groupPreview,
      articles,
      keptArticles: [],
      leftovers: [],
      supports: { total: 0, withoutGroup: 0, inOtherGroup: 0 },
      approvedToReview: 0,
      blockers: uniqueBlockers,
      canApply: uniqueBlockers.length === 0 && Boolean(pagina) && parsed.articles.length > 0,
      planHash: null,
    },
    semantics,
    groupRow: input.groupRow,
    parsed,
    resolved: [],
    stored: [],
    siloPlan: null,
    group: input.groupPreview.mode === "existing" ? { mode: "existing", groupId: input.groupPreview.groupId } : { mode: "new", name: input.groupPreview.name, color: input.groupPreview.color },
    published: pagina && url ? { keyword: pagina, title, details, url } : null,
  };
}

async function readSiteOrigins(client: Client, brandId: string): Promise<Map<string, NonNullable<ReturnType<typeof readSiteOrigin>>>> {
  const out = new Map<string, NonNullable<ReturnType<typeof readSiteOrigin>>>();
  for (let from = 0; ; from += PAGE) {
    const page = await client.from("minerador_keywords").select("id,so:analise_semantica->site_origin").eq("brand_id", brandId).is("deleted_at", null).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as unknown as Array<{ id: unknown; so?: unknown }>;
    for (const row of data) {
      const origem = readSiteOrigin({ site_origin: row.so });
      if (origem) out.set(String(row.id), origem);
    }
    if (data.length < PAGE) return out;
  }
}

/* ===================================================================== entrada */

export async function importDeclaredPlanWithCore(input: {
  brandId: string;
  actorUserId: string;
  /** Cliente do usuário (RLS de `minerador_keywords`), como os imports de sempre. */
  keywordsClient: Client;
  /** Cliente operacional: as tabelas de grupo só aceitam escrita do servidor. */
  groupsClient: Client;
  mode: "preview" | "apply";
  text?: string | null;
  plan?: StructuredDeclaredPlan | null;
  group: DeclaredPlanGroupChoice;
  /** 2026-10-13 · Silo novo, Silo existente ou artigo publicado. Ausente = o plano de 2026-10-12, em acréscimo. */
  destination?: SubjectCadastroDestination | null;
  importRequestId?: string | null;
  channel?: SubjectImportChannel;
  brandSiteUrl?: string | null;
  /** 2026-10-13 · conversão do formato anterior (SDD `sdd-conversao-assunto-legado-2026-10-13.md`). Ausente = cadastro comum. */
  conversions?: readonly SubjectConversionRequest[] | null;
  /**
   * 2026-10-13 · Silo existente: "append" (ausente = o comportamento de sempre)
   * ou "replace" — as linhas são o plano novo inteiro (SDD
   * `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md` §5.2). Chama-se
   * `planMode` porque `mode` já é prévia/aplicar.
   */
  planMode?: DeclaredPlanMode | null;
  /** 2026-10-13 · "Substituir o plano": o `decisionHash` da prévia das quatro listas (obrigatório no apply). */
  decisionHash?: string | null;
  /**
   * 2026-10-16 · o texto (`text`) traz vários Silos (o CSV de planejamento):
   * o nome do Silo a cadastrar agora. Sem ele, o núcleo recusa
   * (SILO_CHOICE_REQUIRED) listando os Silos. Não vale para o plano estruturado.
   */
  siloName?: string | null;
  now?: string;
}): Promise<DeclaredPlanImportResult> {
  const brandId = typeof input.brandId === "string" ? input.brandId.trim() : "";
  if (!brandId) return { ok: false, code: "BRAND_REQUIRED", reason: "A marca ativa é necessária para cadastrar Assuntos." };
  if (!isKeywordSubjectActorId(input.actorUserId)) return { ok: false, code: "ACTOR_REQUIRED", reason: "Cadastrar Assuntos exige o usuário autenticado (auth.users.id)." };
  const actorUserId = input.actorUserId.trim();
  const parsed = input.plan ? parsedPlanFromStructured(input.plan) : typeof input.text === "string" && input.text.trim() ? parseDeclaredPlanText(input.text, { siloName: input.siloName ?? null }) : null;
  if (!parsed) return { ok: false, code: "PLAN_REQUIRED", reason: "Preencha as linhas do cadastro (ou cole o plano em texto)." };
  // 2026-10-16 · um cadastro = um Silo: o texto com vários pede a escolha antes de qualquer leitura do banco.
  const escolhaDoSilo = input.plan ? null : parsed.refusals.find(refusal => refusal.code === "SILO_REPEATED" || refusal.code === "SILO_NOT_IN_TEXT");
  if (escolhaDoSilo) {
    return {
      ok: false,
      code: "SILO_CHOICE_REQUIRED",
      reason: `${escolhaDoSilo.message} Diga qual Silo cadastrar agora (siloName); o outro continua no mesmo texto para o próximo cadastro.`,
      blockers: (parsed.silos ?? []).map(silo => `${silo.name || "Silo sem nome"}: ${silo.articleCount} artigo(s)${silo.rawSlug ? `, ${silo.rawSlug}` : ""}`),
    };
  }
  const importRequestId = typeof input.importRequestId === "string" && input.importRequestId.trim() ? input.importRequestId.trim() : null;
  if (input.mode === "apply" && !importRequestId) return { ok: false, code: "IMPORT_REQUEST_REQUIRED", reason: "O envio precisa de um importRequestId." };
  const now = input.now || new Date().toISOString();

  const lockKey = input.mode === "apply" ? `${brandId}:${importRequestId}` : null;
  if (lockKey) {
    if (inFlight.has(lockKey)) return { ok: false, code: "IMPORT_REQUEST_IN_PROGRESS", reason: "Este cadastro já está sendo gravado. Aguarde o resultado." };
    inFlight.add(lockKey);
  }
  try {
    const substituir = input.planMode === "replace";
    const classified = await classify({ brandId, keywordsClient: input.keywordsClient, groupsClient: input.groupsClient, parsed, group: input.group, destination: input.destination ?? null, brandSiteUrl: input.brandSiteUrl ?? null, conversions: input.conversions ?? null, replace: substituir, now });
    if ("ok" in classified) return classified;
    if (input.mode === "preview") return { ok: true, mode: "preview", ...classified.preview };
    if (!classified.preview.canApply) return { ok: false, code: "PLAN_BLOCKED", reason: "O cadastro tem impedimentos: corrija e gere a prévia de novo.", blockers: classified.preview.blockers };
    if (classified.published) return await applyPublished({ ...input, brandId, actorUserId, importRequestId: importRequestId!, classified, now });
    if (!substituir) return await applyPlan({ ...input, brandId, actorUserId, importRequestId: importRequestId!, classified, now });

    /*
     * 2026-10-13 · "Substituir o plano": só a decisão tomada sobre a prévia das
     * quatro listas. (a) "Sai" pelo núcleo de "Tirar do plano" (v+1), relido;
     * (b) o plano novo por este mesmo caminho (v+2), relido.
     */
    const decisao = classified.preview.replace;
    if (!input.decisionHash) return { ok: false, code: "DECISION_REQUIRED", reason: "Gere a prévia das quatro listas e confirme a substituição sobre ela." };
    if (!decisao || input.decisionHash !== decisao.decisionHash) return { ok: false, code: "DECISION_STALE", reason: "O plano mudou desde a prévia. Gere a prévia de novo antes de confirmar (nada foi gravado)." };
    const saida = classified.replacement ?? { leavingSubjectIds: [], orphanMarkKeywordIds: [] };
    let replaced: DeclaredPlanReplaceApplied = { withdrawalPlanVersion: null, withdrawn: [], orphanMarksCleared: [] };
    const retiradaNotices: string[] = [];
    if (saida.leavingSubjectIds.length || saida.orphanMarkKeywordIds.length) {
      const retirada = await withdrawForPlanReplacementWithCore({
        brandId,
        actorUserId,
        keywordsClient: input.keywordsClient,
        groupsClient: input.groupsClient,
        groupId: classified.groupRow!.id,
        subjectKeywordIds: saida.leavingSubjectIds,
        orphanMarkKeywordIds: saida.orphanMarkKeywordIds,
        decisionHash: decisao.decisionHash,
        now,
      });
      if (!retirada.ok) {
        if (retirada.code === "GROUPS_NOT_AVAILABLE") return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: retirada.reason };
        return { ok: false, code: "WITHDRAWAL_FAILED", reason: `A retirada do que sai parou: ${retirada.reason} O plano novo ainda não foi gravado. Gere a prévia de novo e confirme (é seguro: o que já saiu não sai de novo).` };
      }
      replaced = { withdrawalPlanVersion: retirada.planVersion, withdrawn: retirada.withdrawn, orphanMarksCleared: retirada.orphanMarksCleared };
      retiradaNotices.push(...retirada.notices);
    }
    const gravado = await applyPlan({ ...input, brandId, actorUserId, importRequestId: importRequestId!, classified, now });
    if (!gravado.ok || gravado.mode !== "apply") {
      return gravado.ok ? gravado : { ...gravado, reason: `${replaced.withdrawn.length ? `${replaced.withdrawn.length} artigo(s) já saíram do plano (v${replaced.withdrawalPlanVersion ?? "—"}); ` : ""}${gravado.reason} Gere a prévia de novo e confirme (é seguro).` };
    }
    return { ...gravado, notices: [...gravado.notices, ...retiradaNotices], planMode: "replace", replaced };
  } catch (error) {
    if (isEditorialGroupsSchemaMissing(error)) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: "Os grupos ainda não estão disponíveis neste banco (migration 20261013120000 não aplicada)." };
    throw error;
  } finally {
    if (lockKey) inFlight.delete(lockKey);
  }
}

/** O grupo do apply: o existente, ou o da cor garantido (com o nome do Silo, quando nasce). */
async function ensureApplyGroup(input: { brandId: string; actorUserId: string; groupsClient: Client; classified: Classified; notices: string[] }): Promise<{ ok: true; groupId: string; lockVersion: number | null; rename: string | null; name: string } | { ok: false; result: DeclaredPlanImportResult }> {
  const { brandId, actorUserId, groupsClient } = input;
  const escolha = input.classified.group;
  if (escolha.mode === "existing") return { ok: true, groupId: escolha.groupId, lockVersion: input.classified.groupRow?.lockVersion ?? null, rename: null, name: input.classified.groupRow?.name ?? "" };
  if (!escolha.color) return { ok: false, result: { ok: false, code: "GROUP_REFUSED", reason: `Escolha a cor do grupo: ${EDITORIAL_GROUP_COLORS.join(", ")}.` } };
  /*
   * 2026-10-12 · F6 · a cor sem grupo ganha o grupo pelo MESMO caminho do mover
   * por cor (reativa o arquivado da cor ou cria); nunca dois grupos da mesma cor.
   */
  const garantido = await ensureEditorialGroupForColor(groupsClient, { brandId, actorUserId, color: escolha.color });
  if (!garantido.ok) return { ok: false, result: garantido.code === "GROUPS_NOT_AVAILABLE" ? { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: garantido.message } : { ok: false, code: "GROUP_REFUSED", reason: garantido.message } };
  const rename = garantido.outcome !== "existing" && escolha.name && editorialGroupNameKey(garantido.group.name) !== editorialGroupNameKey(escolha.name) ? escolha.name : null;
  return { ok: true, groupId: garantido.group.id, lockVersion: garantido.group.lockVersion ?? null, rename, name: garantido.group.name };
}

async function applyPlan(input: {
  brandId: string;
  actorUserId: string;
  keywordsClient: Client;
  groupsClient: Client;
  importRequestId: string;
  channel?: SubjectImportChannel;
  brandSiteUrl?: string | null;
  classified: Classified;
  now: string;
}): Promise<DeclaredPlanImportResult> {
  const { brandId, actorUserId, keywordsClient, groupsClient, classified, now } = input;
  const { preview, resolved } = classified;
  const notices: string[] = [];

  // 1 — o grupo e o Silo planejado.
  const siloPlan = classified.siloPlan!;
  const planHash = preview.planHash!;
  const alvo = await ensureApplyGroup({ brandId, actorUserId, groupsClient, classified, notices });
  if (!alvo.ok) return alvo.result;
  const gravado = await declareEditorialGroupPlan(groupsClient, { brandId, actorUserId, groupId: alvo.groupId, plan: siloPlan as unknown as Record<string, unknown>, planHash });
  if (!gravado.ok) return gravado.code === "GROUPS_NOT_AVAILABLE" ? { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: gravado.message } : { ok: false, code: "GROUP_REFUSED", reason: gravado.message };
  const groupId = gravado.group.id;
  const planVersion = gravado.group.planVersion;
  if (alvo.rename) {
    const renomeado = await updateEditorialGroup(groupsClient, { brandId, actorUserId, groupId, lockVersion: gravado.group.lockVersion, name: alvo.rename });
    if (!renomeado.ok) notices.push(`O grupo ficou com o nome "${gravado.group.name}": ${renomeado.message}`);
  }

  // 2 — o Assunto DENTRO da keyword (cadastro único), pelo núcleo de sempre: cria a nova, declara a existente.
  const cadastro = resolved.filter(item => item.shape === "cadastro" && item.change !== "unchanged" && item.article.principal);
  const declararExistentes = cadastro.map(item => item.subjectRow?.id).filter((id): id is string => Boolean(id));
  let createdSubjectIds: string[] = [];
  if (cadastro.length) {
    const subjects = await importSubjectsWithCore({
      brandId,
      actorUserId,
      supabase: keywordsClient as SupabaseClient,
      mode: "apply",
      source: "manual",
      items: cadastro.map(item => ({ keyword: item.article.principal! })),
      declareExistingIds: declararExistentes,
      importRequestId: `${input.importRequestId}:assuntos`,
      brandSiteUrl: input.brandSiteUrl ?? null,
      ...(input.channel ? { channel: input.channel } : {}),
      now,
    });
    if (!subjects.ok) return { ok: false, code: "PLAN_BLOCKED", reason: subjects.reason };
    createdSubjectIds = subjects.createdIds;
  }

  // 3 — no formato anterior, a principal nova (que ainda não existe) entra pelo import de sempre.
  const novasPrincipais = resolved.filter(item => item.shape === "legacy" && item.article.principal && !item.keywordRow).map(item => item.article.principal!);
  const principals = novasPrincipais.length
    ? await importKeywordsWithCore({
      brandId,
      actorUserId,
      supabase: keywordsClient as SupabaseClient,
      items: novasPrincipais.map(keyword => ({ keyword, source: "discovery" as const, discoverySource: "manual" as const, locations: [], extractionBatchId: `${input.importRequestId}:principais` })),
      now,
    })
    : null;

  // Releitura: as frases viram ids.
  const live = await readLiveRows(keywordsClient, brandId);
  const byKey = new Map<string, LiveRow>();
  for (const row of live) {
    const key = chave(row.keyword);
    if (key && !byKey.has(key)) byKey.set(key, row);
  }
  const idOf = (phrase: string | null | undefined) => phrase ? byKey.get(chave(phrase))?.id ?? null : null;
  const pares = resolved.map(item => {
    const subjectId = item.shape === "cadastro" ? idOf(item.article.principal) : item.subjectRow?.id ?? null;
    const principalId = item.article.principal ? (item.shape === "cadastro" ? subjectId : idOf(item.article.principal)) : null;
    return { item, subjectId, principalId };
  });

  // 4 — o grupo: Assuntos e principais (antes do plano, que ancora a keyword ao grupo).
  const anchorIds = [...new Set(pares.flatMap(par => [par.subjectId, par.principalId]).filter((id): id is string => Boolean(id)))];
  let moved = 0;
  let unchanged = 0;
  let refused = 0;
  if (anchorIds.length) {
    const etiqueta = await assignKeywordGroupWithCore({ brandId, actorUserId, keywordIds: anchorIds, groupId, keywordsClient, groupsClient });
    if (!etiqueta.ok) return etiqueta.code === "GROUPS_NOT_AVAILABLE" ? { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: etiqueta.message } : { ok: false, code: "GROUP_REFUSED", reason: etiqueta.message };
    moved = etiqueta.moved.length;
    unchanged = etiqueta.unchanged.length;
    refused = etiqueta.refused.length + etiqueta.notConfirmed.length;
    if (refused) notices.push(`${refused} keyword(s) não mudaram de grupo: ${etiqueta.refused.map(item => item.message).concat(etiqueta.notConfirmed.length ? ["releitura não confirmou"] : []).join(" ")}`);
  }
  // As sustentações da Pesquisa por Assunto sem grupo herdam o grupo do plano (D5: a de outro grupo fica).
  const subjectIdsOfPlan = new Set([...classified.stored.map(item => item.subjectId), ...pares.map(par => par.subjectId).filter((id): id is string => Boolean(id))]);
  const supports = await readSupportRows(keywordsClient, brandId, subjectIdsOfPlan);
  const semGrupo = supports.filter(item => !item.groupId).map(item => item.id).filter(id => !anchorIds.includes(id));
  let supportsStamped = 0;
  if (semGrupo.length) {
    const etiqueta = await assignKeywordGroupWithCore({ brandId, actorUserId, keywordIds: semGrupo, groupId, keywordsClient, groupsClient });
    if (etiqueta.ok) supportsStamped = etiqueta.moved.length;
  }

  // 5 — o plano no Assunto e a marca recíproca na principal (no cadastro único, a própria keyword).
  const ids = [...new Set([...anchorIds, ...pares.flatMap(par => {
    const anterior = par.item.stored?.plan.declaredPrincipal?.keywordId;
    return anterior ? [anterior] : [];
  })])];
  const semantics = await readSemantics(keywordsClient, brandId, ids);
  const results: DeclaredPlanApplyArticle[] = [];
  const expectedVersion = new Map<string, number>();
  const write = async (keywordId: string, semantic: Semantic) => {
    const update = await keywordsClient.from("minerador_keywords").update({ analise_semantica: semantic }).eq("id", keywordId).eq("brand_id", brandId).is("deleted_at", null).select("id");
    return !update.error && ((update.data || []) as Array<{ id: unknown }>).some(row => String(row.id) === keywordId);
  };
  for (const par of pares) {
    const { item, subjectId, principalId } = par;
    const article = item.article;
    const base = { order: article.order, title: article.subject };
    if (!subjectId) { results.push({ ...base, subjectKeywordId: null, principalKeywordId: principalId, outcome: "failed", reason: "A keyword do Assunto não foi encontrada na releitura." }); continue; }
    if (article.principal && !principalId) { results.push({ ...base, subjectKeywordId: subjectId, principalKeywordId: null, outcome: "failed", reason: "A principal não foi encontrada na releitura." }); continue; }
    if (item.change === "unchanged" && item.stored) {
      expectedVersion.set(subjectId, item.stored.plan.planVersion);
      results.push({ ...base, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "unchanged", reason: null });
      continue;
    }
    const subjectSemantic = semantics.get(subjectId);
    if (!subjectSemantic) { results.push({ ...base, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: "Não foi possível ler o DNA atual do Assunto; nada foi gravado." }); continue; }
    const atual = resolveKeywordSubject(subjectSemantic);
    const plan: DeclaredArticlePlan = {
      groupId,
      planVersion,
      order: article.order,
      role: article.role,
      scope: article.scope,
      declaredPrincipal: principalId && article.principal ? { keywordId: principalId, phrase: live.find(row => row.id === principalId)?.keyword || article.principal } : null,
      ...(item.nextLock ? { lock: item.nextLock } : {}),
      // 2026-10-16 · o slug declarado do artigo (o Arquiteto usa só no artigo novo).
      ...(item.nextSlug ? { slug: item.nextSlug } : {}),
    };
    const comPlano = setKeywordSubject(subjectSemantic, {
      note: atual.note, destinationUrl: atual.destinationUrl, destinationCheck: atual.destinationCheck, plan,
      ...(item.nextEntry !== undefined ? { entry: item.nextEntry } : {}),
      actorId: actorUserId, changedAt: now, origin: "import",
    });
    if (!comPlano.ok) { results.push({ ...base, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: comPlano.reason }); continue; }
    let subjectNext = comPlano.semantic;
    let mudou = comPlano.changed;
    // A principal antiga deste Assunto (plano anterior) perde a marca que apontava para ele.
    const antiga = atual.plan?.declaredPrincipal?.keywordId;
    if (antiga && antiga !== principalId && antiga !== subjectId) {
      const antigaSemantic = semantics.get(antiga);
      const marca = antigaSemantic ? resolveDeclaredPrincipal(antigaSemantic).mark : null;
      if (antigaSemantic && marca?.subjectKeywordId === subjectId) {
        const retirada = setDeclaredPrincipal(antigaSemantic, { mark: null, actorId: actorUserId, changedAt: now });
        if (retirada.ok && retirada.changed && await write(antiga, retirada.semantic)) notices.push(`Artigo ${article.order}: a principal anterior deixou de ser declarada.`);
      }
    }
    if (principalId) {
      const mark = { subjectKeywordId: subjectId, groupId, planVersion };
      if (principalId === subjectId) {
        const marcada = setDeclaredPrincipal(subjectNext, { mark, actorId: actorUserId, changedAt: now });
        if (!marcada.ok) { results.push({ ...base, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: marcada.reason }); continue; }
        subjectNext = marcada.semantic;
        mudou = mudou || marcada.changed;
      } else {
        const principalSemantic = semantics.get(principalId);
        if (!principalSemantic) { results.push({ ...base, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: "Não foi possível ler o DNA atual da principal; nada foi gravado." }); continue; }
        const marcada = setDeclaredPrincipal(principalSemantic, { mark, actorId: actorUserId, changedAt: now });
        if (!marcada.ok) { results.push({ ...base, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: marcada.reason }); continue; }
        if (marcada.changed && !await write(principalId, marcada.semantic)) { results.push({ ...base, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: "A marca da principal declarada não foi confirmada." }); continue; }
        mudou = mudou || marcada.changed;
      }
    }
    // 2026-10-13 · conversão: K guarda de onde o Assunto veio (a linha-título não é tocada).
    if (item.conversion) {
      const convertida = setSubjectConversion(subjectNext, { conversion: item.conversion, actorId: actorUserId, changedAt: now });
      if (!convertida.ok) { results.push({ ...base, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: convertida.reason }); continue; }
      subjectNext = convertida.semantic;
      mudou = mudou || convertida.changed;
    }
    if (subjectNext !== subjectSemantic && !await write(subjectId, subjectNext)) { results.push({ ...base, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: "O cadastro do Assunto não foi confirmado." }); continue; }
    expectedVersion.set(subjectId, planVersion);
    results.push({ ...base, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: mudou ? "declared" : "unchanged", reason: null });
  }

  // 6 — releitura e reciprocidade.
  const releitura = await readSemantics(keywordsClient, brandId, anchorIds);
  const conversaoPorOrdem = new Map(resolved.filter(item => item.conversion).map(item => [item.article.order, item.conversion!]));
  let reciprocityConfirmed = 0;
  for (const result of results) {
    if (result.outcome === "failed" || !result.subjectKeywordId) continue;
    const subjectSemantic = releitura.get(result.subjectKeywordId) ?? {};
    const lido = resolveKeywordSubject(subjectSemantic);
    const versao = expectedVersion.get(result.subjectKeywordId);
    if (!lido.plan || lido.plan.groupId !== groupId || lido.plan.planVersion !== versao) {
      result.outcome = "failed";
      result.reason = "A releitura não encontrou o plano gravado no Assunto.";
      continue;
    }
    const pedida = conversaoPorOrdem.get(result.order);
    const gravada = pedida ? readSubjectConversion(subjectSemantic) : null;
    if (pedida && (!gravada || gravada.fromKeywordId !== pedida.fromKeywordId || gravada.articleId !== pedida.articleId)) {
      result.outcome = "failed";
      result.reason = "A releitura não encontrou a conversão gravada na keyword.";
      continue;
    }
    if (!result.principalKeywordId) { reciprocityConfirmed += 1; continue; }
    const check = declaredPrincipalReciprocity({ subjectKeywordId: result.subjectKeywordId, subjectSemantic, principalKeywordId: result.principalKeywordId, principalSemantic: releitura.get(result.principalKeywordId) ?? {} });
    if (!check.ok) { result.outcome = "failed"; result.reason = check.reason; continue; }
    reciprocityConfirmed += 1;
  }
  const failed = results.filter(result => result.outcome === "failed").length;
  const createdPrincipalIds = (principals?.items || []).filter(item => item.outcome === "created" && item.keywordId).map(item => item.keywordId!);
  return {
    ok: true,
    mode: "apply",
    destination: preview.destination,
    silo: preview.silo,
    siloPlan: preview.siloPlan,
    leftovers: preview.leftovers,
    groupId,
    planVersion,
    articles: results,
    createdSubjectIds,
    createdPrincipalIds,
    groupAssignment: { moved, unchanged, refused },
    supportsStamped,
    reciprocityConfirmed,
    failed,
    notices: [...preview.notices, ...notices],
  };
}

async function applyPublished(input: {
  brandId: string;
  actorUserId: string;
  keywordsClient: Client;
  groupsClient: Client;
  importRequestId: string;
  channel?: SubjectImportChannel;
  brandSiteUrl?: string | null;
  classified: Classified;
  now: string;
}): Promise<DeclaredPlanImportResult> {
  const { brandId, actorUserId, keywordsClient, groupsClient, classified, now } = input;
  const alvoPublicado = classified.published!;
  const notices: string[] = [];
  const alvo = await ensureApplyGroup({ brandId, actorUserId, groupsClient, classified, notices });
  if (!alvo.ok) return alvo.result;
  const groupId = alvo.groupId;
  const pagina = alvoPublicado.keyword;

  // 1 — o Assunto declarado NA keyword publicada (pelo núcleo de sempre), com o título e os detalhes.
  const antes = (await readSemantics(keywordsClient, brandId, [pagina.id])).get(pagina.id) ?? {};
  if (!resolveKeywordSubject(antes).declared) {
    const declarado = await importSubjectsWithCore({
      brandId, actorUserId, supabase: keywordsClient as SupabaseClient, mode: "apply", source: "manual",
      items: [{ keyword: pagina.keyword }], declareExistingIds: [pagina.id], importRequestId: `${input.importRequestId}:pagina`,
      brandSiteUrl: input.brandSiteUrl ?? null, ...(input.channel ? { channel: input.channel } : {}), now,
    });
    if (!declarado.ok) return { ok: false, code: "PLAN_BLOCKED", reason: declarado.reason };
  }
  const semPagina = (await readSemantics(keywordsClient, brandId, [pagina.id])).get(pagina.id);
  if (!semPagina) return { ok: false, code: "PLAN_BLOCKED", reason: "A keyword da página publicada não foi relida." };
  const atual = resolveKeywordSubject(semPagina);
  const entry: SubjectEntry = { title: alvoPublicado.title, source: "cadastro", ...(alvoPublicado.details ? { details: alvoPublicado.details } : {}) };
  const comEntry = setKeywordSubject(semPagina, { note: atual.note, destinationUrl: atual.destinationUrl, destinationCheck: atual.destinationCheck, entry, actorId: actorUserId, changedAt: now, origin: "import" });
  if (!comEntry.ok) return { ok: false, code: "PLAN_BLOCKED", reason: comEntry.reason };
  if (comEntry.changed) {
    const update = await keywordsClient.from("minerador_keywords").update({ analise_semantica: comEntry.semantic }).eq("id", pagina.id).eq("brand_id", brandId).is("deleted_at", null).select("id");
    if (update.error || !((update.data || []) as Array<{ id: unknown }>).some(row => String(row.id) === pagina.id)) return { ok: false, code: "PLAN_BLOCKED", reason: "O Assunto da página publicada não foi confirmado." };
  }

  // 2 — as keywords das linhas: sustentações do Assunto da página, pelo núcleo da Pesquisa por Assunto (origem `cadastro`).
  const items = classified.parsed.articles.filter(article => article.principal).map(article => ({ keyword: article.principal!, origins: ["cadastro" as const], evidence: [] as string[] }));
  const importado = await importSubjectDiscoveryWithCore({
    brandId, actorUserId, supabase: keywordsClient as SupabaseClient,
    request: { importRequestId: input.importRequestId, searchId: input.importRequestId, subjectKeywordId: pagina.id, subjectPhrase: alvoPublicado.title.slice(0, 200), items },
    now,
  });
  if (!importado.ok) return { ok: false, code: "PLAN_BLOCKED", reason: importado.reason };

  // 3 — a cor: nas keywords das linhas e na página (se ela ainda não tem grupo).
  const linhas = importado.rows.filter(row => row.keywordId).map(row => row.keywordId!);
  const etiquetar = [...new Set([...linhas, ...(pagina.group_id ? [] : [pagina.id])])];
  let moved = 0, unchanged = 0, refused = 0;
  if (etiquetar.length) {
    const etiqueta = await assignKeywordGroupWithCore({ brandId, actorUserId, keywordIds: etiquetar, groupId, keywordsClient, groupsClient });
    if (etiqueta.ok) { moved = etiqueta.moved.length; unchanged = etiqueta.unchanged.length; refused = etiqueta.refused.length + etiqueta.notConfirmed.length; }
    else notices.push(`A cor não foi gravada: ${etiqueta.message}`);
  }
  for (const row of importado.notAffected) notices.push(`"${row.keyword}": ${row.reason ?? "origem não gravada"}`);

  // 4 — releitura: o Assunto da página com o título.
  const relido = resolveKeywordSubject((await readSemantics(keywordsClient, brandId, [pagina.id])).get(pagina.id) ?? {});
  const confirmado = relido.declared && relido.entry?.title === alvoPublicado.title;
  const results: DeclaredPlanApplyArticle[] = importado.rows.map((row, index) => ({
    order: index + 1,
    title: alvoPublicado.title,
    subjectKeywordId: pagina.id,
    principalKeywordId: row.keywordId,
    outcome: !confirmado || row.outcome === "failed" || !row.keywordId ? "failed" : row.outcome === "created" || row.outcome === "recorded" ? "declared" : "unchanged",
    reason: !confirmado ? "A releitura não encontrou o Assunto na página publicada." : row.reason,
  }));
  return {
    ok: true,
    mode: "apply",
    destination: classified.preview.destination,
    silo: classified.preview.silo,
    siloPlan: null,
    leftovers: [],
    groupId,
    planVersion: 0,
    articles: results,
    createdSubjectIds: [],
    createdPrincipalIds: importado.rows.filter(row => row.outcome === "created" && row.keywordId).map(row => row.keywordId!),
    groupAssignment: { moved, unchanged, refused },
    supportsStamped: 0,
    reciprocityConfirmed: confirmado ? 1 : 0,
    failed: results.filter(result => result.outcome === "failed").length,
    notices: [...classified.preview.notices, ...notices],
  };
}

/* ========================================== leitura compatível (card, GET) */

export type DeclaredPlanCardRow = {
  order: number;
  role: DeclaredPlanRole;
  title: string;
  keyword: string | null;
  details: string;
  lock: DeclaredPlanLockChoice;
  lockLabel: string | null;
  /** 2026-10-16 · o slug declarado do artigo (o último segmento); `null`/ausente = sem slug declarado. */
  slug?: string | null;
  shape: DeclaredPlanShape;
  subjectKeywordId: string;
  keywordId: string | null;
  /**
   * 2026-10-13 · "O ASSUNTO NUNCA SE PERDE": a linha NÃO está no plano gravado —
   * veio do histórico da keyword, que perdeu o Assunto sem liberação (caso do
   * Silo azul da WifiConecta). Nada foi regravado por ler; "Cadastrar" grava
   * pelo MESMO núcleo (`importDeclaredPlanWithCore`).
   */
  recovered?: { label: string; lostAt: string | null; lostOrigin: string | null; fromHistoryAt: string | null };
};

const RECOVERY_SCAN_COLUMNS = "id,keyword,group_id,ks:analise_semantica->keyword_subject,kh:analise_semantica->keyword_subject_history,ka:analise_semantica->keyword_subject_at,ko:analise_semantica->keyword_subject_origin,dp:analise_semantica->keyword_declared_principal";

/**
 * As keywords do grupo (pela etiqueta ou pela marca de principal) que perderam
 * o Assunto do plano: a linha do card recuperada do histórico (estreito; só lê).
 */
async function readRecoveredRows(client: Client, brandId: string, groupId: string, storedIds: ReadonlySet<string>): Promise<RecoveredSubjectRow[]> {
  const out: RecoveredSubjectRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await client.from("minerador_keywords").select(RECOVERY_SCAN_COLUMNS).eq("brand_id", brandId).is("deleted_at", null).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as unknown as Array<{ id: unknown; keyword?: unknown; group_id?: unknown; ks?: unknown; kh?: unknown; ka?: unknown; ko?: unknown; dp?: unknown }>;
    for (const row of data) {
      const id = String(row.id);
      if (storedIds.has(id) || !Array.isArray(row.kh)) continue;
      const mark = resolveDeclaredPrincipal({ keyword_declared_principal: row.dp }).mark;
      if (row.group_id !== groupId && mark?.groupId !== groupId) continue;
      const recuperada = recoverSubjectFromHistory({
        keywordId: id,
        keyword: typeof row.keyword === "string" ? row.keyword : "",
        groupId,
        semantic: { keyword_subject: row.ks, keyword_subject_history: row.kh, keyword_subject_at: row.ka, keyword_subject_origin: row.ko },
      });
      if (recuperada) out.push(recuperada);
    }
    if (data.length < PAGE) return out.sort((a, b) => a.order - b.order);
  }
}

/**
 * O plano GRAVADO de um grupo no formato do card (SDD 2026-10-13 §5): título =
 * o Assunto cadastrado (ou a frase do Assunto anterior), keyword = a principal
 * declarada, detalhes = o escopo, papel, ordem e a trava (manual gravada, ou
 * automática; no formato anterior, "Travada · declarada antes do cadastro
 * único"). É a conversão do Silo 1 da WifiConecta pela leitura: nada é
 * regravado só por ler.
 */
export async function readDeclaredPlanCardRows(input: { brandId: string; keywordsClient: Client; groupsClient: Client; groupId: string }): Promise<
  | { ok: true; group: { id: string; name: string; color: EditorialGroupColor; planVersion: number }; silo: DeclaredSiloPlan | null; rows: DeclaredPlanCardRow[] }
  | { ok: false; code: "GROUPS_NOT_AVAILABLE" | "GROUP_NOT_FOUND"; reason: string }
> {
  const lido = await readEditorialGroupPlan(input.groupsClient, input.brandId, input.groupId);
  if (!lido.ok) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: lido.message };
  if (!lido.group) return { ok: false, code: "GROUP_NOT_FOUND", reason: "O grupo não existe nesta marca." };
  const live = await readLiveRows(input.keywordsClient, input.brandId);
  const porId = new Map(live.map(row => [row.id, row]));
  const stored = await readStoredArticles(input.keywordsClient, input.brandId, lido.group.id, id => porId.get(id)?.keyword ?? "");
  const principalIds = stored.map(item => item.plan.declaredPrincipal?.keywordId).filter((id): id is string => Boolean(id));
  const semantics = await readSemantics(input.keywordsClient, input.brandId, principalIds);
  const rows: DeclaredPlanCardRow[] = stored.map(item => {
    const principalId = item.plan.declaredPrincipal?.keywordId ?? null;
    const principalRow = principalId ? porId.get(principalId) ?? null : null;
    const lock = declaredPrincipalLock(item.plan, { subjectKeywordId: item.subjectId, volume: volumeOf(principalRow, principalId ? semantics.get(principalId) ?? {} : {}) });
    return {
      order: item.plan.order,
      role: item.plan.role,
      title: item.title,
      keyword: principalRow?.keyword ?? item.plan.declaredPrincipal?.phrase ?? null,
      details: item.plan.scope,
      lock: (item.plan.lock ?? "auto") as DeclaredPlanLockChoice,
      lockLabel: lock?.label ?? null,
      slug: item.plan.slug ?? null,
      shape: item.shape,
      subjectKeywordId: item.subjectId,
      keywordId: principalId,
    };
  });
  // 2026-10-13 · as que perderam o Assunto voltam do histórico, marcadas (o dono confere e cadastra).
  const recuperadas = await readRecoveredRows(input.keywordsClient, input.brandId, lido.group.id, new Set(stored.map(item => item.subjectId)));
  const semRecuperadas = recuperadas.length ? await readSemantics(input.keywordsClient, input.brandId, recuperadas.map(item => item.keywordId)) : new Map<string, Semantic>();
  const ordensGravadas = new Set(rows.map(row => row.order));
  for (const item of recuperadas) {
    if (ordensGravadas.has(item.order)) continue;
    const row = porId.get(item.keywordId) ?? null;
    const lock = declaredPrincipalLock(
      { declaredPrincipal: { keywordId: item.keywordId, phrase: item.keyword }, ...(item.lock !== "auto" ? { lock: item.lock } : {}) },
      { subjectKeywordId: item.keywordId, volume: volumeOf(row, semRecuperadas.get(item.keywordId) ?? {}) },
    );
    rows.push({
      order: item.order,
      role: item.role,
      title: item.title,
      keyword: row?.keyword ?? item.keyword,
      details: item.details,
      lock: item.lock,
      lockLabel: lock?.label ?? null,
      slug: item.slug ?? null,
      shape: "cadastro",
      subjectKeywordId: item.keywordId,
      keywordId: item.keywordId,
      recovered: { label: SUBJECT_RECOVERED_LABEL, lostAt: item.loss.at, lostOrigin: item.loss.origin, fromHistoryAt: item.fromHistoryAt },
    });
  }
  rows.sort((a, b) => a.order - b.order);
  return { ok: true, group: { id: lido.group.id, name: lido.group.name, color: lido.group.color, planVersion: lido.group.planVersion }, silo: readDeclaredSiloPlan(lido.group.plan), rows };
}

/* ================================ a trava pelo Posto de principal (Vínculo) */

export type KeywordPlanLockItem = {
  keywordId: string;
  keyword: string;
  /** `changed`: gravada e relida · `unchanged`: já estava assim · `refused`: recusa clara · `failed`: gravação/releitura falhou. */
  outcome: "changed" | "unchanged" | "refused" | "failed";
  reason: string | null;
  /** A linha onde o plano mora (a própria keyword no cadastro único; a do Assunto no formato anterior). */
  subjectKeywordId: string | null;
  groupId: string | null;
  order: number | null;
  before: { choice: DeclaredPlanLockChoice; label: string } | null;
  after: { choice: DeclaredPlanLockChoice; label: string } | null;
  /** Aprovadas deste artigo que voltam para "Em revisão" ao gravar (a trava entra no pacote). */
  approvedToReview: number;
};

export type KeywordPlanLockResult =
  | {
    ok: true;
    mode: "preview" | "apply";
    lock: DeclaredPlanLockChoice;
    items: KeywordPlanLockItem[];
    counts: { changed: number; unchanged: number; refused: number; failed: number; approvedToReview: number };
    /** A versão nova do plano de cada grupo gravado (só no apply). */
    planVersions: Array<{ groupId: string; planVersion: number }>;
    architectHint: string;
  }
  | { ok: false; code: "ACTOR_REQUIRED" | "BRAND_REQUIRED" | "KEYWORDS_REQUIRED" | "LOCK_REQUIRED" | "IMPORT_REQUEST_REQUIRED" | "GROUPS_NOT_AVAILABLE"; reason: string };

export const KEYWORD_PLAN_LOCK_MAX = 200;

/**
 * O "POSTO DE PRINCIPAL" DA KEYWORD NÃO PUBLICADA GRAVA A TRAVA DO CADASTRO
 * (pedido do dono, 2026-10-13). Um caminho só: cada artigo pedido volta ao
 * MESMO núcleo do card (`importDeclaredPlanWithCore`, destino "Silo
 * existente", acréscimo) com a linha gravada igual e só a trava trocada — os
 * outros artigos do plano ficam como estão. O núcleo grava `plan.lock` (nova
 * versão do plano quando muda), relê e confere a reciprocidade; aqui a releitura
 * confirma a trava de cada keyword.
 *
 * Recusa por item, nunca em silêncio: publicada (o posto é o da publicação),
 * sem plano ("Para travar, cadastre o artigo em Cadastrar Assuntos."), marca
 * órfã, plano com impedimento. `preview` não grava.
 */
export async function setKeywordPlanLockWithCore(input: {
  brandId: string;
  actorUserId: string;
  keywordsClient: Client;
  groupsClient: Client;
  mode: "preview" | "apply";
  keywordIds: readonly string[];
  lock: DeclaredPlanLockChoice;
  importRequestId?: string | null;
  channel?: SubjectImportChannel;
  brandSiteUrl?: string | null;
  now?: string;
}): Promise<KeywordPlanLockResult> {
  const brandId = typeof input.brandId === "string" ? input.brandId.trim() : "";
  if (!brandId) return { ok: false, code: "BRAND_REQUIRED", reason: "A marca ativa é necessária para gravar a trava." };
  if (!isKeywordSubjectActorId(input.actorUserId)) return { ok: false, code: "ACTOR_REQUIRED", reason: "Gravar a trava exige o usuário autenticado (auth.users.id)." };
  if (input.lock !== "auto" && input.lock !== "locked" && input.lock !== "free") return { ok: false, code: "LOCK_REQUIRED", reason: "Escolha a trava: Travada, Livre ou Automática." };
  const ids = [...new Set((input.keywordIds || []).filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map(id => id.trim()))];
  if (!ids.length || ids.length > KEYWORD_PLAN_LOCK_MAX) return { ok: false, code: "KEYWORDS_REQUIRED", reason: `Escolha de 1 a ${KEYWORD_PLAN_LOCK_MAX} keywords.` };
  const importRequestId = typeof input.importRequestId === "string" && input.importRequestId.trim() ? input.importRequestId.trim() : null;
  if (input.mode === "apply" && !importRequestId) return { ok: false, code: "IMPORT_REQUEST_REQUIRED", reason: "Gravar a trava precisa de um importRequestId." };
  const now = input.now || new Date().toISOString();
  const lock = input.lock;

  const live = await readLiveRows(input.keywordsClient, brandId);
  const liveById = new Map(live.map(row => [row.id, row]));
  const semantics = await readSemantics(input.keywordsClient, brandId, ids.filter(id => liveById.has(id)));
  // A linha do Assunto do formato anterior (a principal aponta para ela pela marca recíproca).
  const subjectIds = [...semantics.values()].map(semantic => resolveDeclaredPrincipal(semantic).mark?.subjectKeywordId).filter((id): id is string => Boolean(id) && !semantics.has(id!));
  const others = subjectIds.length ? await readSemantics(input.keywordsClient, brandId, subjectIds) : new Map<string, Semantic>();
  const semanticOf = (id: string) => semantics.get(id) ?? others.get(id) ?? null;
  const lockOfKeyword = (id: string, semantic: Semantic | null) => {
    const row = liveById.get(id) ?? null;
    return resolveKeywordPlanLock({
      keywordId: id, keyword: row?.keyword ?? null, status: row?.status ?? null, semantic,
      volume: volumeOf(row, semantic ?? {}), subjectSemanticOf: semanticOf, keywordTextOf: other => liveById.get(other)?.keyword ?? null,
    });
  };

  const items: KeywordPlanLockItem[] = [];
  const bySubject = new Map<string, { groupId: string; order: number; items: KeywordPlanLockItem[] }>();
  for (const id of ids) {
    const row = liveById.get(id);
    const base: KeywordPlanLockItem = { keywordId: id, keyword: row?.keyword ?? id, outcome: "refused", reason: null, subjectKeywordId: null, groupId: null, order: null, before: null, after: null, approvedToReview: 0 };
    items.push(base);
    if (!row) { base.reason = "A keyword não existe nesta marca (ou está na lixeira)."; continue; }
    const atual = lockOfKeyword(id, semantics.get(id) ?? {});
    if (!atual) { base.reason = PLAN_LOCK_PUBLISHED_REFUSAL; continue; }
    const pedido = planLockChange(atual, lock);
    if (!pedido.ok) { base.reason = pedido.reason; continue; }
    if (atual.kind === "no_plan") { base.outcome = "unchanged"; base.reason = "Fora de plano: a keyword já é livre."; continue; }
    base.subjectKeywordId = atual.subjectKeywordId;
    base.groupId = atual.groupId;
    base.order = atual.order;
    base.before = { choice: atual.choice, label: atual.label };
    if (!pedido.changed) { base.outcome = "unchanged"; base.after = base.before; continue; }
    // A mesma conta do núcleo: a linha do Assunto e a principal (a marca recíproca leva a versão do plano) aprovadas voltam a "Em revisão".
    base.approvedToReview = [...new Set([atual.subjectKeywordId, atual.principalKeywordId])].filter(other => liveById.get(other)?.status === "aprovado").length;
    const alvo = bySubject.get(atual.subjectKeywordId) ?? { groupId: atual.groupId, order: atual.order, items: [] };
    alvo.items.push(base);
    bySubject.set(atual.subjectKeywordId, alvo);
  }

  // Por grupo: o artigo gravado, igual, com a trava pedida — pelo núcleo do cadastro.
  const groups = new Map<string, string[]>();
  for (const [subjectId, alvo] of bySubject) groups.set(alvo.groupId, [...(groups.get(alvo.groupId) ?? []), subjectId]);
  const planVersions: Array<{ groupId: string; planVersion: number }> = [];
  const keywordOf = (id: string) => liveById.get(id)?.keyword ?? "";
  for (const [groupId, subjectsOfGroup] of groups) {
    const itemsOfGroup = subjectsOfGroup.flatMap(subjectId => bySubject.get(subjectId)!.items);
    const recusar = (outcome: "refused" | "failed", reason: string) => { for (const item of itemsOfGroup) { item.outcome = outcome; item.reason = reason; } };
    const stored = await readStoredArticles(input.keywordsClient, brandId, groupId, keywordOf);
    const articles: StructuredDeclaredPlan["articles"] = [];
    for (const subjectId of subjectsOfGroup) {
      const gravado = stored.find(item => item.subjectId === subjectId);
      if (!gravado || !gravado.plan.declaredPrincipal) {
        for (const item of bySubject.get(subjectId)!.items) { item.outcome = "refused"; item.reason = "O artigo não foi encontrado no plano gravado do grupo. Abra Cadastrar Assuntos → Silo existente."; }
        continue;
      }
      const principalId = gravado.plan.declaredPrincipal.keywordId;
      articles.push({
        order: gravado.plan.order,
        subject: gravado.title,
        principal: liveById.get(principalId)?.keyword || gravado.plan.declaredPrincipal.phrase,
        role: gravado.plan.role,
        scope: gravado.plan.scope,
        lock,
        // 2026-10-16 · a linha gravada igual: o slug declarado vai junto (só a trava muda).
        ...(gravado.plan.slug ? { slug: gravado.plan.slug } : {}),
      });
    }
    if (!articles.length) continue;
    const pedidos = itemsOfGroup.filter(item => item.outcome === "refused" && item.reason === null);
    const result = await importDeclaredPlanWithCore({
      brandId,
      actorUserId: input.actorUserId,
      keywordsClient: input.keywordsClient,
      groupsClient: input.groupsClient,
      mode: input.mode,
      plan: { articles },
      group: { mode: "existing", groupId },
      destination: { kind: "existing_silo", groupId },
      importRequestId: input.mode === "apply" ? `${importRequestId}:trava:${groupId}` : null,
      ...(input.channel ? { channel: input.channel } : {}),
      brandSiteUrl: input.brandSiteUrl ?? null,
      now,
    });
    if (!result.ok) {
      if (result.code === "GROUPS_NOT_AVAILABLE") return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: result.reason };
      const motivo = [result.reason, ...(result.blockers ?? [])].join(" ");
      for (const item of pedidos) { item.outcome = result.code === "PLAN_BLOCKED" ? "refused" : "failed"; item.reason = motivo; }
      continue;
    }
    if (result.mode === "preview") {
      for (const item of pedidos) {
        const artigo = result.articles.find(article => article.order === item.order);
        item.after = artigo?.lock ? { choice: artigo.lock.choice, label: artigo.lock.label } : { choice: lock, label: PLAN_LOCK_CHOICE_LABELS[lock] };
        if (!result.canApply) { item.outcome = "refused"; item.reason = result.blockers.join(" "); }
        else { item.outcome = "changed"; item.reason = null; }
      }
      continue;
    }
    planVersions.push({ groupId: result.groupId, planVersion: result.planVersion });
    for (const item of pedidos) {
      const artigo = result.articles.find(article => article.order === item.order);
      if (!artigo || artigo.outcome === "failed") { item.outcome = "failed"; item.reason = artigo?.reason ?? "O núcleo do cadastro não devolveu este artigo."; continue; }
      item.outcome = "changed";
    }
  }

  // Releitura (apply): a trava gravada em cada keyword pedida, pela mesma leitura da tela.
  if (input.mode === "apply") {
    const gravados = items.filter(item => item.outcome === "changed");
    const relerIds = [...new Set(gravados.flatMap(item => [item.keywordId, item.subjectKeywordId!]))];
    const relidos = relerIds.length ? await readSemantics(input.keywordsClient, brandId, relerIds) : new Map<string, Semantic>();
    for (const item of gravados) {
      const plano = resolveKeywordSubject(relidos.get(item.subjectKeywordId!) ?? {}).plan;
      if (!plano || (plano.lock ?? "auto") !== lock) { item.outcome = "failed"; item.reason = "A releitura não confirmou a trava gravada."; continue; }
      const depois = resolveKeywordPlanLock({
        keywordId: item.keywordId, keyword: item.keyword, status: liveById.get(item.keywordId)?.status ?? null, semantic: relidos.get(item.keywordId) ?? {},
        volume: volumeOf(liveById.get(item.keywordId) ?? null, relidos.get(item.keywordId) ?? {}), subjectSemanticOf: id => relidos.get(id) ?? semanticOf(id),
      });
      item.after = depois && depois.kind === "plan" ? { choice: depois.choice, label: depois.label } : { choice: lock, label: PLAN_LOCK_CHOICE_LABELS[lock] };
    }
  }

  const counts = { changed: 0, unchanged: 0, refused: 0, failed: 0, approvedToReview: 0 };
  for (const item of items) { counts[item.outcome] += 1; counts.approvedToReview += item.outcome === "changed" ? item.approvedToReview : 0; }
  return { ok: true, mode: input.mode, lock, items, counts, planVersions, architectHint: PLAN_LOCK_ARCHITECT_HINT };
}
