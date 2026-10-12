import type { SupabaseClient } from "@supabase/supabase-js";
import { contentHash } from "../arquiteto/versioning.ts";
import { EDITORIAL_GROUP_COLORS, isEditorialGroupColor, isEditorialGroupsSchemaMissing, normalizeEditorialGroupName, type EditorialGroupColor } from "../editorial/editorial-groups.ts";
import {
  createDeclaredPlanGroup,
  declareEditorialGroupPlan,
  listEditorialGroupSummaries,
  readEditorialGroupPlan,
  type EditorialGroupPlanRow,
} from "../editorial/editorial-groups-store.ts";
import {
  DECLARED_PLAN_LEFTOVER_LABELS,
  declaredPlanLeftoverReason,
  declaredSiloPlanOf,
  normalizeDeclaredPhraseKey,
  normalizeDeclaredSiloSlug,
  parseDeclaredPlanText,
  validateParsedDeclaredPlan,
  type DeclaredArticlePlan,
  type DeclaredPlanRefusal,
  type DeclaredPlanRole,
  type DeclaredSiloPlan,
  type ParsedDeclaredPlan,
  type ParsedPlanArticle,
} from "./declared-plan.ts";
import { importKeywordsWithCore, importSubjectsWithCore, type SubjectImportChannel } from "./keyword-import-core.ts";
import { assignKeywordGroupWithCore } from "./keyword-group-core.ts";
import { isKeywordPublished } from "./keyword-lifecycle.ts";
import {
  declaredPrincipalReciprocity,
  isKeywordSubjectActorId,
  resolveDeclaredPrincipal,
  resolveKeywordSubject,
  setDeclaredPrincipal,
  setKeywordSubject,
} from "./keyword-subject.ts";
import { deriveProcessorRevalidation } from "./processor-revalidation.ts";

/**
 * ===== IMPORTAR PLANO DO SILO — O NÚCLEO ÚNICO (tela e MCP) =====
 *
 * SDD 2026-10-12 §6.1-2 (F4 = Fase B do plano). `preview` não escreve nada;
 * `apply` faz, numa sequência só e com releitura:
 *
 *   1. cria o grupo do plano, ou grava o plano no grupo escolhido
 *      (`editorial_groups.plan`, `plan_version`, `plan_hash`);
 *   2. declara os Assuntos pelo núcleo de sempre (`importSubjectsWithCore`);
 *   3. importa as principais que ainda não existem pelo import de sempre
 *      (`importKeywordsWithCore`, origem "lista colada");
 *   4. etiqueta Assuntos e principais com o grupo (`assignKeywordGroupWithCore`,
 *      o escritor único de `group_id`) e as sustentações da Pesquisa por
 *      Assunto que ainda não têm grupo (D5: a de outro grupo não muda);
 *   5. grava `keyword_subject.plan` no Assunto e a marca recíproca
 *      `keyword_declared_principal` na principal, na mesma passada;
 *   6. relê e confere a reciprocidade. Sucesso só depois disso.
 *
 * Nada pago, nada apagado: as sobras de imports anteriores (o nome do Silo
 * colado como keyword, a frase com o rótulo) aparecem na prévia como "não faz
 * parte do plano"; mandar para a lixeira é ato do dono (D9).
 */

type Client = Pick<SupabaseClient, "from">;
type Semantic = Record<string, unknown>;

const ID_CHUNK = 200;
const PAGE = 1000;
const LIVE_COLUMNS = "id,keyword,status,group_id,volume_search,results_allintitle";

export type DeclaredPlanGroupChoice =
  | { mode: "existing"; groupId: string }
  | { mode: "new"; name?: string | null; color: EditorialGroupColor | string };

/** O plano já estruturado (MCP): o mesmo contrato do texto colado, sem o parser. */
export type StructuredDeclaredPlan = {
  silo: { name: string; slug?: string | null; objective?: string | null };
  articles: Array<{ order: number; subject: string; principal?: string | null; role: DeclaredPlanRole; scope: string }>;
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
  missing: "sem principal declarada",
  new: "nova (entra como Bruto)",
  existing_with_volume: "já existe, com volume",
  existing_without_volume: "já existe, sem volume (D2-bis: aprova sem volume)",
  same_as_subject: "igual ao Assunto, com volume",
  same_as_subject_without_volume: "igual ao Assunto, sem volume",
  is_other_subject: "é o Assunto de outro artigo",
  declared_elsewhere: "já é a principal declarada de outro Assunto",
  published: "já publicada (tem página própria)",
};

/** Estados da principal que impedem gravar o plano. */
const PRINCIPAL_BLOCKING: ReadonlySet<DeclaredPlanPrincipalState> = new Set(["same_as_subject_without_volume", "is_other_subject", "declared_elsewhere", "published"]);

export type DeclaredPlanPreviewArticle = {
  order: number;
  role: DeclaredPlanRole;
  scope: string;
  line: number;
  subject: { phrase: string; state: DeclaredPlanSubjectState; label: string; keywordId: string | null; status: string | null; groupId: string | null };
  principal: { phrase: string | null; state: DeclaredPlanPrincipalState; label: string; keywordId: string | null; status: string | null; volumeValidated: boolean; groupId: string | null };
  /** Por que este artigo impede gravar (vazio = pode). */
  problems: string[];
  /** Itens aprovados deste artigo que voltam para "Em revisão" ao gravar (R2). */
  approvedToReview: number;
};

export type DeclaredPlanPreview = {
  silo: ParsedDeclaredPlan["silo"];
  siloPlan: DeclaredSiloPlan | null;
  unparsed: ParsedDeclaredPlan["unparsed"];
  refusals: DeclaredPlanRefusal[];
  notices: string[];
  group:
    | { mode: "existing"; groupId: string; name: string; color: EditorialGroupColor; hadPlan: boolean; planVersion: number; samePlan: boolean }
    | { mode: "new"; name: string; color: EditorialGroupColor | null };
  articles: DeclaredPlanPreviewArticle[];
  /** Keywords já gravadas que são sobra de import: não fazem parte do plano (D9: lixeira é ato do dono). */
  leftovers: Array<{ keywordId: string; keyword: string; reason: "silo_name" | "pasted_label"; label: string }>;
  supports: { total: number; withoutGroup: number; inOtherGroup: number };
  approvedToReview: number;
  /** Impedimentos: com qualquer um, `apply` recusa. */
  blockers: string[];
  canApply: boolean;
  planHash: string | null;
};

export type DeclaredPlanApplyArticle = {
  order: number;
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
  | "GROUPS_NOT_AVAILABLE";

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
    } & Pick<DeclaredPlanPreview, "silo" | "siloPlan" | "leftovers">)
  | { ok: false; code: DeclaredPlanImportRefusalCode; reason: string; blockers?: string[] };

type LiveRow = { id: string; keyword: string; status: string | null; group_id: string | null; volume_search: number | null; results_allintitle: number | null };

const inFlight = new Set<string>();

function asRecord(value: unknown): Semantic {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Semantic : {};
}

function blocos<T>(lista: readonly T[], tamanho = ID_CHUNK): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) saida.push(lista.slice(i, i + tamanho));
  return saida;
}

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

/** O plano estruturado (MCP) passa pelas MESMAS recusas do texto colado. */
export function parsedPlanFromStructured(plan: StructuredDeclaredPlan): ParsedDeclaredPlan {
  const rawSlug = typeof plan.silo.slug === "string" && plan.silo.slug.trim() ? plan.silo.slug.trim() : null;
  const silo: ParsedDeclaredPlan["silo"] = {
    heading: null,
    name: (plan.silo.name || "").trim() || null,
    slug: rawSlug ? normalizeDeclaredSiloSlug(rawSlug) : null,
    rawSlug,
    objective: typeof plan.silo.objective === "string" && plan.silo.objective.trim() ? plan.silo.objective.replace(/\s+/g, " ").trim() : null,
  };
  const articles: ParsedPlanArticle[] = plan.articles.map((article, index) => ({
    order: article.order,
    subject: (article.subject || "").replace(/\s+/g, " ").trim(),
    principal: typeof article.principal === "string" && article.principal.trim() ? article.principal.replace(/\s+/g, " ").trim() : null,
    role: article.role,
    scope: (article.scope || "").replace(/\s+/g, " ").trim(),
    line: index + 1,
  }));
  const { refusals, notices } = validateParsedDeclaredPlan({ silo, articles });
  return { silo, articles, unparsed: [], refusals, notices };
}

/** A identidade do plano: muda quando o texto declarado muda, nunca pelos ids. */
export async function declaredPlanHash(parsed: Pick<ParsedDeclaredPlan, "silo" | "articles">): Promise<string> {
  return contentHash({
    silo: { name: parsed.silo.name, slug: parsed.silo.slug, objective: parsed.silo.objective },
    articles: [...parsed.articles].sort((a, b) => a.order - b.order).map(article => ({
      order: article.order,
      subject: normalizeDeclaredPhraseKey(article.subject),
      principal: article.principal ? normalizeDeclaredPhraseKey(article.principal) : null,
      role: article.role,
      scope: article.scope,
    })),
  });
}

type Classified = {
  preview: DeclaredPlanPreview;
  liveByKey: Map<string, LiveRow>;
  semantics: Map<string, Semantic>;
  groupRow: EditorialGroupPlanRow | null;
  parsed: ParsedDeclaredPlan;
};

async function classify(input: {
  brandId: string;
  keywordsClient: Client;
  groupsClient: Client;
  parsed: ParsedDeclaredPlan;
  group: DeclaredPlanGroupChoice;
}): Promise<Classified | { ok: false; code: "GROUPS_NOT_AVAILABLE"; reason: string }> {
  const { brandId, parsed } = input;
  const blockers: string[] = parsed.refusals.map(refusal => refusal.message);
  const notices = [...parsed.notices];
  const siloPlan = declaredSiloPlanOf(parsed);
  const planHash = parsed.refusals.length ? null : await declaredPlanHash(parsed);

  // Grupo escolhido ou novo.
  let groupRow: EditorialGroupPlanRow | null = null;
  let groupPreview: DeclaredPlanPreview["group"];
  if (input.group.mode === "existing") {
    const lido = await readEditorialGroupPlan(input.groupsClient, brandId, input.group.groupId);
    if (!lido.ok) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: lido.message };
    groupRow = lido.group;
    if (!groupRow) {
      blockers.push("O grupo escolhido não existe nesta marca.");
      groupPreview = { mode: "new", name: siloPlan?.siloName || "", color: null };
    } else {
      if (groupRow.status !== "active") blockers.push(`O grupo "${groupRow.name}" está arquivado: reative-o antes de declarar o plano nele.`);
      const samePlan = Boolean(groupRow.plan && planHash && groupRow.planHash === planHash);
      if (groupRow.plan && !samePlan) notices.push(`O grupo "${groupRow.name}" já tem plano (v${groupRow.planVersion}): gravar troca para v${groupRow.planVersion + 1}.`);
      groupPreview = { mode: "existing", groupId: groupRow.id, name: groupRow.name, color: groupRow.color, hadPlan: Boolean(groupRow.plan), planVersion: groupRow.planVersion, samePlan };
    }
  } else {
    const name = normalizeEditorialGroupName(input.group.name || siloPlan?.siloName || "") || "";
    const color = isEditorialGroupColor(input.group.color) ? input.group.color : null;
    if (!name) blockers.push("Dê um nome ao grupo (padrão: o nome do Silo).");
    if (!color) blockers.push(`Escolha a cor do grupo: ${EDITORIAL_GROUP_COLORS.join(", ")}.`);
    const listing = await listEditorialGroupSummaries(input.groupsClient, brandId);
    if (!listing.ok) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: listing.message };
    if (name && listing.groups.some(group => group.status === "active" && normalizeDeclaredPhraseKey(group.name) === normalizeDeclaredPhraseKey(name))) {
      blockers.push(`Já existe um grupo ativo "${name}" nesta marca: escolha-o em "grupo existente" ou dê outro nome.`);
    }
    groupPreview = { mode: "new", name, color };
  }
  const targetGroupId = groupRow?.id ?? null;

  const live = await readLiveRows(input.keywordsClient, brandId);
  const liveByKey = new Map<string, LiveRow>();
  for (const row of live) {
    const key = normalizeDeclaredPhraseKey(row.keyword);
    if (key && !liveByKey.has(key)) liveByKey.set(key, row);
  }
  const matchedIds = parsed.articles.flatMap(article => [article.subject, article.principal]).map(phrase => phrase ? liveByKey.get(normalizeDeclaredPhraseKey(phrase))?.id : undefined).filter((id): id is string => Boolean(id));
  const semantics = await readSemantics(input.keywordsClient, brandId, matchedIds);

  const subjectIdsOfPlan = new Set(parsed.articles.map(article => liveByKey.get(normalizeDeclaredPhraseKey(article.subject))?.id).filter((id): id is string => Boolean(id)));
  let approvedToReview = 0;
  const articles: DeclaredPlanPreviewArticle[] = parsed.articles.map(article => {
    const problems: string[] = [];
    const subjectRow = liveByKey.get(normalizeDeclaredPhraseKey(article.subject)) ?? null;
    const subjectSemantic = subjectRow ? semantics.get(subjectRow.id) ?? {} : {};
    const subject = resolveKeywordSubject(subjectSemantic);
    let subjectState: DeclaredPlanSubjectState = "new";
    if (subjectRow) {
      if (subject.plan && subject.plan.groupId !== targetGroupId) subjectState = "other_plan";
      else if (isKeywordPublished({ status: subjectRow.status, semantic: subjectSemantic })) subjectState = "published";
      else subjectState = subject.declared ? "existing_subject" : "existing";
    }
    if (subjectState === "other_plan") problems.push(`O Assunto "${article.subject}" já pertence ao plano de outro grupo: tire-o daquele plano antes.`);
    if (subjectState === "published") notices.push(`Artigo ${article.order}: o Assunto já está publicado; declarar o plano não muda URL, slug nem canonical.`);
    if (subjectRow && targetGroupId === null && subjectRow.group_id) notices.push(`Artigo ${article.order}: o Assunto está em outro grupo e passa para o grupo novo.`);
    if (subjectRow && targetGroupId && subjectRow.group_id && subjectRow.group_id !== targetGroupId) notices.push(`Artigo ${article.order}: o Assunto está em outro grupo e passa para este.`);

    let principalState: DeclaredPlanPrincipalState = "missing";
    let principalRow: LiveRow | null = null;
    let volumeValidated = false;
    if (article.principal) {
      const sameAsSubject = normalizeDeclaredPhraseKey(article.principal) === normalizeDeclaredPhraseKey(article.subject);
      principalRow = sameAsSubject ? subjectRow : liveByKey.get(normalizeDeclaredPhraseKey(article.principal)) ?? null;
      const principalSemantic = principalRow ? semantics.get(principalRow.id) ?? {} : {};
      volumeValidated = principalRow ? deriveProcessorRevalidation({ semantic: principalSemantic, volumeSearch: principalRow.volume_search, resultsAllintitle: principalRow.results_allintitle }).volume.validated : false;
      if (sameAsSubject) principalState = volumeValidated ? "same_as_subject" : "same_as_subject_without_volume";
      else if (!principalRow) principalState = "new";
      else {
        const mark = resolveDeclaredPrincipal(principalSemantic).mark;
        const outroAssunto = resolveKeywordSubject(principalSemantic).declared;
        if (outroAssunto) principalState = "is_other_subject";
        else if (mark && mark.subjectKeywordId !== subjectRow?.id && !subjectIdsOfPlan.has(mark.subjectKeywordId)) principalState = "declared_elsewhere";
        else if (isKeywordPublished({ status: principalRow.status, semantic: principalSemantic })) principalState = "published";
        else principalState = volumeValidated ? "existing_with_volume" : "existing_without_volume";
      }
      if (PRINCIPAL_BLOCKING.has(principalState)) {
        problems.push(principalState === "same_as_subject_without_volume"
          ? `Artigo ${article.order}: a principal é a própria frase do Assunto, sem Volume validado — o Assunto só é principal com Volume (ADR-022, D1). Escolha outra principal.`
          : `Artigo ${article.order}: a principal "${article.principal}" ${DECLARED_PLAN_PRINCIPAL_STATE_LABELS[principalState]}.`);
      }
    }
    const aprovados = [subjectRow, principalRow && principalRow !== subjectRow ? principalRow : null].filter((row): row is LiveRow => Boolean(row) && row!.status === "aprovado");
    approvedToReview += aprovados.length;
    blockers.push(...problems);
    return {
      order: article.order,
      role: article.role,
      scope: article.scope,
      line: article.line,
      subject: { phrase: article.subject, state: subjectState, label: DECLARED_PLAN_SUBJECT_STATE_LABELS[subjectState], keywordId: subjectRow?.id ?? null, status: subjectRow?.status ?? null, groupId: subjectRow?.group_id ?? null },
      principal: { phrase: article.principal, state: principalState, label: DECLARED_PLAN_PRINCIPAL_STATE_LABELS[principalState], keywordId: principalRow?.id ?? null, status: principalRow?.status ?? null, volumeValidated, groupId: principalRow?.group_id ?? null },
      problems,
      approvedToReview: aprovados.length,
    };
  });

  const planKeys = new Set(parsed.articles.flatMap(article => [article.subject, article.principal]).filter((phrase): phrase is string => Boolean(phrase)).map(normalizeDeclaredPhraseKey));
  const leftovers = live
    .filter(row => !planKeys.has(normalizeDeclaredPhraseKey(row.keyword)))
    .map(row => ({ row, reason: declaredPlanLeftoverReason(row.keyword, parsed) }))
    .filter((item): item is { row: LiveRow; reason: "silo_name" | "pasted_label" } => Boolean(item.reason))
    .map(item => ({ keywordId: item.row.id, keyword: item.row.keyword, reason: item.reason, label: DECLARED_PLAN_LEFTOVER_LABELS[item.reason] }));
  if (leftovers.length) notices.push(`${leftovers.length} keyword(s) já gravada(s) parecem sobra de import (nome do Silo ou rótulo colado): ficam fora do plano; mande para a lixeira se quiser (recuperável).`);

  const supports = await readSupportRows(input.keywordsClient, brandId, subjectIdsOfPlan);
  const supportsInfo = {
    total: supports.length,
    withoutGroup: supports.filter(item => !item.groupId).length,
    inOtherGroup: supports.filter(item => item.groupId && item.groupId !== targetGroupId).length,
  };
  if (supportsInfo.inOtherGroup) notices.push(`${supportsInfo.inOtherGroup} sustentação(ões) da Pesquisa por Assunto estão em outro grupo e não mudam (um grupo por keyword).`);
  if (approvedToReview) notices.push(`${approvedToReview} item(ns) aprovado(s) voltam para "Em revisão" ao gravar o plano (o plano entra no pacote aprovado); a reaprovação só pede a Lógica.`);

  const uniqueBlockers = [...new Set(blockers)];
  return {
    preview: {
      silo: parsed.silo,
      siloPlan,
      unparsed: parsed.unparsed,
      refusals: parsed.refusals,
      notices: [...new Set(notices)],
      group: groupPreview,
      articles,
      leftovers,
      supports: supportsInfo,
      approvedToReview,
      blockers: uniqueBlockers,
      canApply: uniqueBlockers.length === 0 && Boolean(siloPlan) && Boolean(planHash),
      planHash,
    },
    liveByKey,
    semantics,
    groupRow,
    parsed,
  };
}

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
  importRequestId?: string | null;
  channel?: SubjectImportChannel;
  brandSiteUrl?: string | null;
  now?: string;
}): Promise<DeclaredPlanImportResult> {
  const brandId = typeof input.brandId === "string" ? input.brandId.trim() : "";
  if (!brandId) return { ok: false, code: "BRAND_REQUIRED", reason: "A marca ativa é necessária para importar o plano." };
  if (!isKeywordSubjectActorId(input.actorUserId)) return { ok: false, code: "ACTOR_REQUIRED", reason: "Declarar o plano exige o usuário autenticado (auth.users.id)." };
  const actorUserId = input.actorUserId.trim();
  const parsed = input.plan ? parsedPlanFromStructured(input.plan) : typeof input.text === "string" && input.text.trim() ? parseDeclaredPlanText(input.text) : null;
  if (!parsed) return { ok: false, code: "PLAN_REQUIRED", reason: "Cole o texto do plano do Silo." };
  const importRequestId = typeof input.importRequestId === "string" && input.importRequestId.trim() ? input.importRequestId.trim() : null;
  if (input.mode === "apply" && !importRequestId) return { ok: false, code: "IMPORT_REQUEST_REQUIRED", reason: "O envio precisa de um importRequestId." };

  const lockKey = input.mode === "apply" ? `${brandId}:${importRequestId}` : null;
  if (lockKey) {
    if (inFlight.has(lockKey)) return { ok: false, code: "IMPORT_REQUEST_IN_PROGRESS", reason: "Este plano já está sendo gravado. Aguarde o resultado." };
    inFlight.add(lockKey);
  }
  try {
    const classified = await classify({ brandId, keywordsClient: input.keywordsClient, groupsClient: input.groupsClient, parsed, group: input.group });
    if ("ok" in classified) return classified;
    if (input.mode === "preview") return { ok: true, mode: "preview", ...classified.preview };
    if (!classified.preview.canApply) return { ok: false, code: "PLAN_BLOCKED", reason: "O plano tem impedimentos: corrija e gere a prévia de novo.", blockers: classified.preview.blockers };
    return await applyPlan({ ...input, brandId, actorUserId, importRequestId: importRequestId!, classified, now: input.now || new Date().toISOString() });
  } catch (error) {
    if (isEditorialGroupsSchemaMissing(error)) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: "Os grupos ainda não estão disponíveis neste banco (migration 20261013120000 não aplicada)." };
    throw error;
  } finally {
    if (lockKey) inFlight.delete(lockKey);
  }
}

async function applyPlan(input: {
  brandId: string;
  actorUserId: string;
  keywordsClient: Client;
  groupsClient: Client;
  group: DeclaredPlanGroupChoice;
  importRequestId: string;
  channel?: SubjectImportChannel;
  brandSiteUrl?: string | null;
  classified: Classified;
  now: string;
}): Promise<DeclaredPlanImportResult> {
  const { brandId, actorUserId, keywordsClient, groupsClient, classified, now } = input;
  const { preview, parsed } = classified;
  const notices: string[] = [];

  // 1 — o grupo e o Silo planejado.
  const siloPlan = preview.siloPlan!;
  const planHash = preview.planHash!;
  let groupId: string;
  let planVersion: number;
  if (input.group.mode === "existing") {
    const gravado = await declareEditorialGroupPlan(groupsClient, { brandId, actorUserId, groupId: input.group.groupId, plan: siloPlan as unknown as Record<string, unknown>, planHash });
    if (!gravado.ok) return gravado.code === "GROUPS_NOT_AVAILABLE" ? { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: gravado.message } : { ok: false, code: "GROUP_REFUSED", reason: gravado.message };
    groupId = gravado.group.id;
    planVersion = gravado.group.planVersion;
  } else {
    const criado = await createDeclaredPlanGroup(groupsClient, { brandId, actorUserId, name: preview.group.name, color: input.group.color, plan: siloPlan as unknown as Record<string, unknown>, planHash });
    if (!criado.ok) return criado.code === "GROUPS_NOT_AVAILABLE" ? { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: criado.message } : { ok: false, code: "GROUP_REFUSED", reason: criado.message };
    groupId = criado.group.id;
    planVersion = criado.group.planVersion;
  }

  // 2 — os Assuntos, pelo núcleo de sempre (cria as novas; declara as existentes).
  const existingSubjectIds = preview.articles.map(article => article.subject.keywordId).filter((id): id is string => Boolean(id));
  const subjects = await importSubjectsWithCore({
    brandId,
    actorUserId,
    supabase: keywordsClient as SupabaseClient,
    mode: "apply",
    source: "manual",
    items: parsed.articles.map(article => ({ keyword: article.subject })),
    declareExistingIds: existingSubjectIds,
    importRequestId: `${input.importRequestId}:assuntos`,
    brandSiteUrl: input.brandSiteUrl ?? null,
    ...(input.channel ? { channel: input.channel } : {}),
    now,
  });
  if (!subjects.ok) return { ok: false, code: "PLAN_BLOCKED", reason: subjects.reason };

  // 3 — as principais que ainda não existem, pelo import de sempre.
  const novasPrincipais = preview.articles.filter(article => article.principal.state === "new" && article.principal.phrase).map(article => article.principal.phrase!);
  const principals = novasPrincipais.length
    ? await importKeywordsWithCore({
      brandId,
      actorUserId,
      supabase: keywordsClient as SupabaseClient,
      items: novasPrincipais.map(keyword => ({ keyword, source: "discovery" as const, discoverySource: "manual" as const, locations: [], extractionBatchId: `${input.importRequestId}:principais` })),
      now,
    })
    : null;

  // Releitura: as frases do plano viram ids.
  const live = await readLiveRows(keywordsClient, brandId);
  const byKey = new Map<string, LiveRow>();
  for (const row of live) {
    const key = normalizeDeclaredPhraseKey(row.keyword);
    if (key && !byKey.has(key)) byKey.set(key, row);
  }
  const idOf = (phrase: string | null) => phrase ? byKey.get(normalizeDeclaredPhraseKey(phrase))?.id ?? null : null;
  const pares = parsed.articles.map(article => ({
    article,
    subjectId: idOf(article.subject),
    principalId: article.principal ? (normalizeDeclaredPhraseKey(article.principal) === normalizeDeclaredPhraseKey(article.subject) ? idOf(article.subject) : idOf(article.principal)) : null,
  }));

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
    if (refused) notices.push(`${refused} Assunto(s) ou principal(is) não mudaram de grupo: ${etiqueta.refused.map(item => item.message).concat(etiqueta.notConfirmed.length ? ["releitura não confirmou"] : []).join(" ")}`);
  }
  // As sustentações da Pesquisa por Assunto sem grupo herdam o grupo do plano (D5: a de outro grupo fica).
  const supports = await readSupportRows(keywordsClient, brandId, new Set(pares.map(par => par.subjectId).filter((id): id is string => Boolean(id))));
  const semGrupo = supports.filter(item => !item.groupId).map(item => item.id).filter(id => !anchorIds.includes(id));
  let supportsStamped = 0;
  if (semGrupo.length) {
    const etiqueta = await assignKeywordGroupWithCore({ brandId, actorUserId, keywordIds: semGrupo, groupId, keywordsClient, groupsClient });
    if (etiqueta.ok) supportsStamped = etiqueta.moved.length;
  }

  // 5 — o plano no Assunto e a marca recíproca na principal, na mesma passada.
  const ids = [...new Set([...anchorIds, ...pares.flatMap(par => {
    const anterior = par.subjectId ? resolveKeywordSubject(classified.semantics.get(par.subjectId) ?? {}).plan?.declaredPrincipal?.keywordId : null;
    return anterior ? [anterior] : [];
  })])];
  const semantics = await readSemantics(keywordsClient, brandId, ids);
  const results: DeclaredPlanApplyArticle[] = [];
  const write = async (keywordId: string, semantic: Semantic) => {
    const update = await keywordsClient.from("minerador_keywords").update({ analise_semantica: semantic }).eq("id", keywordId).eq("brand_id", brandId).is("deleted_at", null).select("id");
    return !update.error && ((update.data || []) as Array<{ id: unknown }>).some(row => String(row.id) === keywordId);
  };
  for (const par of pares) {
    const { article, subjectId, principalId } = par;
    if (!subjectId) { results.push({ order: article.order, subjectKeywordId: null, principalKeywordId: principalId, outcome: "failed", reason: "O Assunto não foi encontrado na releitura." }); continue; }
    if (article.principal && !principalId) { results.push({ order: article.order, subjectKeywordId: subjectId, principalKeywordId: null, outcome: "failed", reason: "A principal não foi encontrada na releitura." }); continue; }
    const subjectSemantic = semantics.get(subjectId);
    if (!subjectSemantic) { results.push({ order: article.order, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: "Não foi possível ler o DNA atual do Assunto; nada foi gravado." }); continue; }
    const atual = resolveKeywordSubject(subjectSemantic);
    const plan: DeclaredArticlePlan = {
      groupId,
      planVersion,
      order: article.order,
      role: article.role,
      scope: article.scope,
      declaredPrincipal: principalId && article.principal ? { keywordId: principalId, phrase: byKey.get(normalizeDeclaredPhraseKey(article.principal))?.keyword || article.principal } : null,
    };
    const comPlano = setKeywordSubject(subjectSemantic, { note: atual.note, destinationUrl: atual.destinationUrl, destinationCheck: atual.destinationCheck, plan, actorId: actorUserId, changedAt: now, origin: "import" });
    if (!comPlano.ok) { results.push({ order: article.order, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: comPlano.reason }); continue; }
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
        if (!marcada.ok) { results.push({ order: article.order, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: marcada.reason }); continue; }
        subjectNext = marcada.semantic;
        mudou = mudou || marcada.changed;
      } else {
        const principalSemantic = semantics.get(principalId);
        if (!principalSemantic) { results.push({ order: article.order, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: "Não foi possível ler o DNA atual da principal; nada foi gravado." }); continue; }
        const marcada = setDeclaredPrincipal(principalSemantic, { mark, actorId: actorUserId, changedAt: now });
        if (!marcada.ok) { results.push({ order: article.order, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: marcada.reason }); continue; }
        if (marcada.changed && !await write(principalId, marcada.semantic)) { results.push({ order: article.order, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: "A marca da principal declarada não foi confirmada." }); continue; }
        mudou = mudou || marcada.changed;
      }
    }
    if (subjectNext !== subjectSemantic && !await write(subjectId, subjectNext)) { results.push({ order: article.order, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: "failed", reason: "O plano do Assunto não foi confirmado." }); continue; }
    results.push({ order: article.order, subjectKeywordId: subjectId, principalKeywordId: principalId, outcome: mudou ? "declared" : "unchanged", reason: null });
  }

  // 6 — releitura e reciprocidade.
  const releitura = await readSemantics(keywordsClient, brandId, anchorIds);
  let reciprocityConfirmed = 0;
  for (const result of results) {
    if (result.outcome === "failed" || !result.subjectKeywordId) continue;
    const subjectSemantic = releitura.get(result.subjectKeywordId) ?? {};
    const plan = resolveKeywordSubject(subjectSemantic).plan;
    if (!plan || plan.groupId !== groupId || plan.planVersion !== planVersion) {
      result.outcome = "failed";
      result.reason = "A releitura não encontrou o plano gravado no Assunto.";
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
    silo: preview.silo,
    siloPlan: preview.siloPlan,
    leftovers: preview.leftovers,
    groupId,
    planVersion,
    articles: results,
    createdSubjectIds: subjects.createdIds,
    createdPrincipalIds,
    groupAssignment: { moved, unchanged, refused },
    supportsStamped,
    reciprocityConfirmed,
    failed,
    notices: [...preview.notices, ...notices],
  };
}
