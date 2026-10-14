import type { SupabaseClient } from "@supabase/supabase-js";
import { contentHash } from "../arquiteto/versioning.ts";
import { isEditorialGroupsSchemaMissing, type EditorialGroupColor } from "../editorial/editorial-groups.ts";
import { clearEditorialGroupPlan, declareEditorialGroupPlan, readEditorialGroupPlan, type EditorialGroupPlanRow } from "../editorial/editorial-groups-store.ts";
import { readDeclaredArticlePlan, readDeclaredPrincipalMark, readDeclaredSiloPlan, type DeclaredArticlePlan, type DeclaredPlanRole, type DeclaredSiloPlan } from "./declared-plan.ts";
import { declaredPlanHash } from "./declared-plan-import-core.ts";
import { isKeywordSubjectActorId, recordKeywordSubjectRelease, resolveDeclaredPrincipal, resolveKeywordSubject, setDeclaredPrincipal, setKeywordSubject, type KeywordSubjectRelease } from "./keyword-subject.ts";
import { recoverSubjectFromHistory } from "./subject-recovery.ts";

/**
 * ===== TIRAR DO PLANO — O NÚCLEO (tela; SDD 2026-10-12 §6.1-5) =====
 *
 * Retira UM artigo (Assunto) do plano declarado do Silo, sem retirar o Assunto
 * e sem apagar nada. É o "sair do plano" que a SDD exige antes de mover um
 * Assunto ou principal de plano para outro grupo (`KEYWORD_PLAN_ANCHORED`).
 *
 * `list` mostra os artigos do plano do grupo; `preview` diz o que muda e
 * devolve o `decisionHash`; `apply` só grava com o MESMO `decisionHash` (a
 * decisão humana foi tomada sobre aquela prévia) e relê tudo:
 *
 *   1. o grupo: `editorial_groups.plan` com um artigo a menos e `plan_hash` do
 *      plano restante (o mesmo hash que reimportar o texto restante daria) →
 *      `plan_version + 1`, evento `plan_changed` com `withdrawal`, pelo
 *      `declareEditorialGroupPlan` de sempre (trava otimista, releitura);
 *   2. a principal declarada perde a marca recíproca (`setDeclaredPrincipal`
 *      com `null`) — antes do Assunto, para nunca sobrar exceção D2-bis sem plano;
 *   3. o Assunto perde `keyword_subject.plan` (`setKeywordSubject` com
 *      `plan: null`): continua declarado, com a mesma nota e o mesmo destino;
 *   4. releitura: plano fora do Assunto, marca fora da principal, grupo na versão nova.
 *
 * Reaplicar depois de uma falha no meio é seguro: o grupo já com o hash do
 * plano restante não muda de novo (`changed: false`), e as escritas que já
 * aconteceram não se repetem.
 *
 * O que NÃO faz (de propósito): não muda `group_id` (a keyword continua no
 * grupo — no Arquiteto, em "Keywords não agrupadas" do grupo quando não está
 * em artigo); não mexe em ArticleDNA, SiloDNA ou SiloPage (o Arquiteto só
 * obedece ao pacote aprovado; o artigo que já existe continua até o humano
 * decidir, e aparece como "Fora do plano" depois da reaprovação); não tira o
 * Pilar sozinho (o Silo precisa de um — trocar o Pilar é "Substituir o plano"
 * no cadastro, que usa estas mesmas escritas: `withdrawForPlanReplacementWithCore`); não
 * reescreve os outros Assuntos do plano (eles não voltam para revisão).
 * Nada pago.
 */

type Client = Pick<SupabaseClient, "from">;
type Semantic = Record<string, unknown>;

const PAGE = 1000;
const inFlight = new Set<string>();

export type DeclaredPlanWithdrawRefusalCode =
  | "ACTOR_REQUIRED"
  | "BRAND_REQUIRED"
  | "GROUP_WITHOUT_PLAN"
  | "NOT_IN_PLAN"
  | "PILLAR_CANNOT_LEAVE"
  | "LAST_ARTICLE"
  | "DECISION_REQUIRED"
  | "DECISION_STALE"
  | "WITHDRAW_IN_PROGRESS"
  | "WRITE_REFUSED"
  | "WRITE_NOT_CONFIRMED"
  | "GROUP_REFUSED"
  | "GROUPS_NOT_AVAILABLE";

export type DeclaredPlanArticleView = {
  order: number;
  role: DeclaredPlanRole;
  scope: string;
  subject: { keywordId: string; phrase: string; status: string | null };
  principal: { keywordId: string; phrase: string; status: string | null; sameAsSubject: boolean } | null;
  /** O Pilar não sai do plano sozinho. */
  canWithdraw: boolean;
  /** Por que não pode (vazio = pode). */
  withdrawBlocker: string | null;
};

export type DeclaredPlanGroupView = {
  id: string;
  name: string;
  color: EditorialGroupColor;
  planVersion: number;
  siloName: string | null;
  articleCount: number;
};

export type DeclaredPlanWithdrawResult =
  | { ok: true; mode: "list"; group: DeclaredPlanGroupView; articles: DeclaredPlanArticleView[] }
  | {
      ok: true;
      mode: "preview";
      group: DeclaredPlanGroupView;
      article: DeclaredPlanArticleView;
      remainingArticles: number;
      nextPlanVersion: number;
      /** Itens aprovados (Assunto e principal) que voltam para "Em revisão" (o plano sai do pacote aprovado). */
      approvedToReview: number;
      effects: string[];
      decisionHash: string;
    }
  | {
      ok: true;
      mode: "apply";
      group: DeclaredPlanGroupView;
      subjectKeywordId: string;
      principalKeywordId: string | null;
      planVersion: number;
      /** O grupo já estava com este plano restante (reaplicar depois de uma falha no meio). */
      groupAlreadyUpdated: boolean;
      readback: { subjectPlanRemoved: true; subjectStillDeclared: true; principalMarkRemoved: boolean | null; groupPlanHash: string };
      notices: string[];
    }
  | { ok: false; code: DeclaredPlanWithdrawRefusalCode; reason: string };

type PlanRow = { id: string; keyword: string; status: string | null; groupId: string | null; plan: DeclaredArticlePlan | null; principalMark: ReturnType<typeof readDeclaredPrincipalMark> };

const refuse = (code: DeclaredPlanWithdrawRefusalCode, reason: string): DeclaredPlanWithdrawResult => ({ ok: false, code, reason });

/** Os Assuntos com plano deste grupo e as principais declaradas, numa varredura só (caminhos JSON, sem o jsonb inteiro). */
async function readPlanRows(client: Client, brandId: string): Promise<PlanRow[]> {
  const rows: PlanRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await client.from("minerador_keywords")
      .select("id,keyword,status,group_id,sp:analise_semantica->keyword_subject->plan,dp:analise_semantica->keyword_declared_principal")
      .eq("brand_id", brandId).is("deleted_at", null).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (page.error) throw page.error;
    const data = (page.data || []) as unknown as Array<Record<string, unknown>>;
    for (const row of data) {
      const plan = readDeclaredArticlePlan(row.sp);
      const principalMark = readDeclaredPrincipalMark(row.dp);
      if (!plan && !principalMark) continue;
      rows.push({
        id: String(row.id),
        keyword: typeof row.keyword === "string" ? row.keyword : "",
        status: typeof row.status === "string" ? row.status : null,
        groupId: typeof row.group_id === "string" ? row.group_id : null,
        plan,
        principalMark,
      });
    }
    if (data.length < PAGE) return rows;
  }
}

async function readSemantic(client: Client, brandId: string, keywordId: string): Promise<Semantic | null> {
  const result = await client.from("minerador_keywords").select("id,analise_semantica").eq("brand_id", brandId).eq("id", keywordId).is("deleted_at", null).maybeSingle();
  if (result.error) throw result.error;
  const row = result.data as { id?: unknown; analise_semantica?: unknown } | null;
  if (!row || String(row.id) !== keywordId) return null;
  return row.analise_semantica && typeof row.analise_semantica === "object" && !Array.isArray(row.analise_semantica) ? row.analise_semantica as Semantic : {};
}

async function writeSemantic(client: Client, brandId: string, keywordId: string, semantic: Semantic): Promise<boolean> {
  const update = await client.from("minerador_keywords").update({ analise_semantica: semantic }).eq("id", keywordId).eq("brand_id", brandId).is("deleted_at", null).select("id");
  return !update.error && ((update.data || []) as Array<{ id: unknown }>).some(row => String(row.id) === keywordId);
}

type Loaded = {
  groupRow: EditorialGroupPlanRow;
  siloPlan: DeclaredSiloPlan;
  group: DeclaredPlanGroupView;
  articles: DeclaredPlanArticleView[];
  plansBySubject: Map<string, DeclaredArticlePlan>;
};

async function load(input: { brandId: string; keywordsClient: Client; groupsClient: Client; groupId: string }): Promise<Loaded | DeclaredPlanWithdrawResult> {
  const lido = await readEditorialGroupPlan(input.groupsClient, input.brandId, input.groupId);
  if (!lido.ok) return refuse("GROUPS_NOT_AVAILABLE", lido.message);
  const groupRow = lido.group;
  const siloPlan = groupRow ? readDeclaredSiloPlan(groupRow.plan) : null;
  if (!groupRow || !siloPlan || groupRow.origin !== "declared_plan") return refuse("GROUP_WITHOUT_PLAN", "Este grupo não tem plano declarado do Silo nesta marca.");
  const rows = await readPlanRows(input.keywordsClient, input.brandId);
  const byId = new Map(rows.map(row => [row.id, row]));
  const doPlano = rows.filter(row => row.plan && row.plan.groupId === groupRow.id).sort((a, b) => a.plan!.order - b.plan!.order || a.id.localeCompare(b.id));
  const plansBySubject = new Map(doPlano.map(row => [row.id, row.plan!]));
  const articles: DeclaredPlanArticleView[] = doPlano.map(row => {
    const plan = row.plan!;
    const principalId = plan.declaredPrincipal?.keywordId ?? null;
    const principalRow = principalId ? byId.get(principalId) : undefined;
    const pilar = plan.role === "Pilar";
    return {
      order: plan.order,
      role: plan.role,
      scope: plan.scope,
      subject: { keywordId: row.id, phrase: row.keyword, status: row.status },
      principal: principalId ? { keywordId: principalId, phrase: principalRow?.keyword || plan.declaredPrincipal!.phrase, status: principalRow?.status ?? null, sameAsSubject: principalId === row.id } : null,
      canWithdraw: !pilar && doPlano.length > 1,
      withdrawBlocker: pilar
        ? "O Pilar não sai do plano sozinho: o Silo precisa de um Pilar. Para trocar o Pilar, use Cadastrar Assuntos → Silo existente → “Substituir o plano”, com outro artigo como Pilar."
        : doPlano.length <= 1 ? "É o único artigo do plano: um plano sem artigos não existe." : null,
    };
  });
  return {
    groupRow,
    siloPlan,
    group: { id: groupRow.id, name: groupRow.name, color: groupRow.color, planVersion: groupRow.planVersion, siloName: siloPlan.siloName, articleCount: siloPlan.articleCount },
    articles,
    plansBySubject,
  };
}

/** O plano restante: o Silo do grupo e os artigos que ficam, no formato do hash do import. */
async function remainingPlan(loaded: Loaded, subjectKeywordId: string): Promise<{ siloPlan: DeclaredSiloPlan; planHash: string; remaining: number }> {
  return remainingPlanWithout(loaded, new Set([subjectKeywordId]));
}

/** O mesmo, sem VÁRIOS artigos (a parte "Sai" da substituição do plano). */
async function remainingPlanWithout(loaded: Loaded, subjectKeywordIds: ReadonlySet<string>): Promise<{ siloPlan: DeclaredSiloPlan; planHash: string; remaining: number }> {
  const ficam = loaded.articles.filter(article => !subjectKeywordIds.has(article.subject.keywordId));
  const planHash = await declaredPlanHash({
    silo: { heading: null, name: loaded.siloPlan.siloName, slug: loaded.siloPlan.siloSlug, rawSlug: loaded.siloPlan.siloSlug, objective: loaded.siloPlan.objective },
    articles: ficam.map(article => ({
      order: article.order,
      subject: article.subject.phrase,
      principal: article.principal ? (loaded.plansBySubject.get(article.subject.keywordId)?.declaredPrincipal?.phrase ?? article.principal.phrase) : null,
      role: article.role,
      scope: article.scope,
      line: article.order,
    })),
  });
  return { siloPlan: { ...loaded.siloPlan, articleCount: ficam.length }, planHash, remaining: ficam.length };
}

async function decisionHashOf(loaded: Loaded, subjectKeywordId: string): Promise<string> {
  return contentHash({
    groupId: loaded.groupRow.id,
    planVersion: loaded.groupRow.planVersion,
    planHash: loaded.groupRow.planHash,
    subjectKeywordId,
    plan: loaded.plansBySubject.get(subjectKeywordId) ?? null,
  });
}

type Refused = { ok: false; code: DeclaredPlanWithdrawRefusalCode; reason: string };

/** 0 — ensaio sem gravar: a escrita que tira o plano do Assunto fecha o contrato (com o marcador)? */
async function rehearseArticleRelease(client: Client, brandId: string, actorUserId: string, subjectKeywordId: string, release: KeywordSubjectRelease, now: string): Promise<{ ok: true } | Refused> {
  const ensaioAssunto = await readSemantic(client, brandId, subjectKeywordId);
  if (!ensaioAssunto) return { ok: false, code: "NOT_IN_PLAN", reason: "O Assunto não foi encontrado nesta marca (pode estar na lixeira). Recarregue." };
  const ensaioAtual = resolveKeywordSubject(ensaioAssunto);
  const ensaio = setKeywordSubject(ensaioAssunto, { note: ensaioAtual.note, destinationUrl: ensaioAtual.destinationUrl, destinationCheck: ensaioAtual.destinationCheck, plan: null, actorId: actorUserId, changedAt: now, origin: "review", release });
  if (!ensaio.ok) return { ok: false, code: "WRITE_REFUSED", reason: `Nada foi gravado: ${ensaio.reason}` };
  return { ok: true };
}

/**
 * 2, 3 e 4 — as escritas de keyword de UM artigo que sai do plano, depois de o
 * grupo estar na versão `planVersion`: a principal declarada perde a marca que
 * aponta para o Assunto (antes do Assunto, para nunca sobrar exceção D2-bis sem
 * plano), o Assunto perde o plano com o marcador de liberação (continua
 * declarado, com a mesma nota, o mesmo destino e o mesmo título) e as duas são
 * relidas. Usado pela retirada avulsa e pela substituição do plano (o mesmo
 * caminho de "Tirar do plano").
 */
async function releaseArticleKeywords(input: { client: Client; brandId: string; actorUserId: string; article: DeclaredPlanArticleView; release: KeywordSubjectRelease; now: string; planVersion: number }): Promise<{ ok: true; principalMarkRemoved: boolean | null; notices: string[] } | Refused> {
  const { client, brandId, actorUserId, article, release, now, planVersion } = input;
  const subjectKeywordId = article.subject.keywordId;
  const principalId = article.principal && !article.principal.sameAsSubject ? article.principal.keywordId : null;
  const notices: string[] = [];
  const falhou = (code: DeclaredPlanWithdrawRefusalCode, reason: string): Refused => ({ ok: false, code, reason });

  // 2 — a principal declarada perde a marca que aponta para este Assunto.
  let principalMarkRemoved: boolean | null = null;
  if (principalId) {
    const semantic = await readSemantic(client, brandId, principalId);
    if (!semantic) return falhou("WRITE_NOT_CONFIRMED", `O grupo já está no plano v${planVersion}, mas a principal “${article.principal!.phrase}” não pôde ser lida. Gere a prévia e confirme de novo (é seguro).`);
    const marca = resolveDeclaredPrincipal(semantic).mark;
    if (marca && marca.subjectKeywordId === subjectKeywordId) {
      const retirada = setDeclaredPrincipal(semantic, { mark: null, actorId: actorUserId, changedAt: now });
      if (!retirada.ok) return falhou("WRITE_REFUSED", retirada.reason);
      if (retirada.changed && !await writeSemantic(client, brandId, principalId, retirada.semantic)) {
        return falhou("WRITE_NOT_CONFIRMED", `O grupo já está no plano v${planVersion}, mas a marca da principal “${article.principal!.phrase}” não foi confirmada. Gere a prévia e confirme de novo (é seguro).`);
      }
    } else if (marca) {
      notices.push(`“${article.principal!.phrase}” é a principal declarada de outro Assunto e continua como está.`);
    }
  }

  // 3 — o Assunto perde o plano (continua declarado, com a mesma nota e o mesmo destino).
  const subjectSemantic = await readSemantic(client, brandId, subjectKeywordId);
  if (!subjectSemantic) return falhou("WRITE_NOT_CONFIRMED", `O grupo já está no plano v${planVersion}, mas o Assunto não pôde ser lido. Gere a prévia e confirme de novo (é seguro).`);
  const atual = resolveKeywordSubject(subjectSemantic);
  const semPlano = setKeywordSubject(subjectSemantic, { note: atual.note, destinationUrl: atual.destinationUrl, destinationCheck: atual.destinationCheck, plan: null, actorId: actorUserId, changedAt: now, origin: "review", release });
  if (!semPlano.ok) return falhou("WRITE_REFUSED", semPlano.reason);
  let proximo = semPlano.semantic;
  if (article.principal?.sameAsSubject) {
    const marca = resolveDeclaredPrincipal(proximo).mark;
    if (marca && marca.subjectKeywordId === subjectKeywordId) {
      const retirada = setDeclaredPrincipal(proximo, { mark: null, actorId: actorUserId, changedAt: now });
      if (!retirada.ok) return falhou("WRITE_REFUSED", retirada.reason);
      proximo = retirada.semantic;
    }
  }
  if (proximo !== subjectSemantic && !await writeSemantic(client, brandId, subjectKeywordId, proximo)) {
    return falhou("WRITE_NOT_CONFIRMED", `O grupo já está no plano v${planVersion}, mas o plano do Assunto não foi retirado (releitura). Gere a prévia e confirme de novo (é seguro).`);
  }

  // 4 — releitura.
  const relidoAssunto = await readSemantic(client, brandId, subjectKeywordId);
  const assunto = resolveKeywordSubject(relidoAssunto);
  if (!relidoAssunto || assunto.plan || !assunto.declared) return falhou("WRITE_NOT_CONFIRMED", "A releitura não confirmou o Assunto sem plano (e ainda declarado).");
  if (principalId) {
    const relidaPrincipal = await readSemantic(client, brandId, principalId);
    const marca = relidaPrincipal ? resolveDeclaredPrincipal(relidaPrincipal).mark : null;
    principalMarkRemoved = !marca || marca.subjectKeywordId !== subjectKeywordId;
    if (!principalMarkRemoved) return falhou("WRITE_NOT_CONFIRMED", "A releitura ainda encontrou a marca de principal declarada apontando para este Assunto.");
  } else if (article.principal?.sameAsSubject) {
    principalMarkRemoved = !resolveDeclaredPrincipal(relidoAssunto).mark;
  }
  return { ok: true, principalMarkRemoved, notices };
}

/* ======================================== substituir o plano (cadastro) */

export type PlanReplacementWithdrawResult =
  | {
      ok: true;
      /** A versão do plano com os artigos que saíram (`v+1`); `null` quando nada do plano gravado fica (um plano sem artigos não existe). */
      planVersion: number | null;
      groupAlreadyUpdated: boolean;
      withdrawn: Array<{ subjectKeywordId: string; principalKeywordId: string | null; order: number; role: DeclaredPlanRole }>;
      /** Keywords com a marca de principal deste grupo sem Assunto no plano (perderam o Assunto antes) que ficaram fora do plano novo: a marca saiu. */
      orphanMarksCleared: string[];
      notices: string[];
    }
  | Refused;

/**
 * 2026-10-13 · SUBSTITUIR O PLANO (SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`
 * §5.2, F1; D1 decidida pelo dono). A parte "Sai" da substituição, chamada só
 * pelo núcleo do cadastro (`importDeclaredPlanWithCore` com `planMode:
 * "replace"`), depois de conferir o `decisionHash` da prévia das quatro listas.
 * É o "Tirar do plano" de sempre para VÁRIOS artigos numa versão só do plano:
 *
 *   0. ensaio de todas as escritas (recusa aqui não grava nada);
 *   1. o grupo: plano com os artigos que ficam (`v+1`), pelo
 *      `declareEditorialGroupPlan` de sempre — idempotente pelo hash; quando
 *      nada do plano gravado fica, não há versão intermediária (o plano novo
 *      vira a próxima);
 *   2. por artigo que sai: as mesmas escritas e releituras da retirada avulsa
 *      (marcador `tirar_do_plano`), inclusive o Pilar (o plano novo traz outro;
 *      a recusa do Pilar continua valendo na retirada avulsa);
 *   3. as marcas de principal órfãs deste grupo que ficaram fora do plano novo
 *      perdem a marca; se o histórico as ofereceria como "Recuperado do
 *      histórico", a liberação fica registrada nele (não voltam sozinhas).
 *
 * Reaplicar depois de falha no meio é seguro: o artigo que já saiu não está
 * mais no plano (é ignorado) e o grupo com o hash restante não muda de novo.
 * Nada é apagado; `group_id` não muda; ArticleDNA, SiloDNA e SiloPage não são
 * tocados (o Arquiteto mostra "Fora do plano" até o dono decidir lá).
 */
export async function withdrawForPlanReplacementWithCore(input: {
  brandId: string;
  actorUserId: string;
  keywordsClient: Client;
  groupsClient: Client;
  groupId: string;
  subjectKeywordIds: readonly string[];
  orphanMarkKeywordIds?: readonly string[];
  decisionHash: string;
  now?: string;
}): Promise<PlanReplacementWithdrawResult> {
  const brandId = typeof input.brandId === "string" ? input.brandId.trim() : "";
  if (!brandId) return { ok: false, code: "BRAND_REQUIRED", reason: "A marca ativa é necessária para mexer no plano." };
  if (!isKeywordSubjectActorId(input.actorUserId)) return { ok: false, code: "ACTOR_REQUIRED", reason: "Substituir o plano exige o usuário autenticado (auth.users.id)." };
  if (!input.decisionHash) return { ok: false, code: "DECISION_REQUIRED", reason: "Gere a prévia e confirme a substituição sobre ela." };
  const actorUserId = input.actorUserId.trim();
  const lockKey = `${brandId}:${input.groupId}`;
  if (inFlight.has(lockKey)) return { ok: false, code: "WITHDRAW_IN_PROGRESS", reason: "Este plano já está sendo alterado. Aguarde o resultado." };
  inFlight.add(lockKey);
  try {
    const loaded = await load({ brandId, keywordsClient: input.keywordsClient, groupsClient: input.groupsClient, groupId: input.groupId });
    if ("ok" in loaded) return loaded as Refused;
    const now = input.now || new Date().toISOString();
    const notices: string[] = [];
    const pedidos = new Set(input.subjectKeywordIds);
    // O que já saiu (reaplicação) é ignorado: só o que ainda está no plano sai.
    const saem = loaded.articles.filter(article => pedidos.has(article.subject.keywordId));
    const releaseOf = (detalhe: string): KeywordSubjectRelease => ({
      requestId: `tirar-do-plano:substituir:${input.decisionHash}:${crypto.randomUUID()}`,
      reason: `Substituir o plano: ${detalhe} sai do plano v${loaded.group.planVersion} do grupo “${loaded.group.name}”.`,
      actorId: actorUserId,
      at: now,
      via: "tirar_do_plano",
    });
    const marcadores = new Map(saem.map(article => [article.subject.keywordId, releaseOf(`artigo ${article.order} (${article.role})`)]));

    // 0 — ensaio de todas as escritas antes de qualquer gravação.
    for (const article of saem) {
      const ensaio = await rehearseArticleRelease(input.keywordsClient, brandId, actorUserId, article.subject.keywordId, marcadores.get(article.subject.keywordId)!, now);
      if (!ensaio.ok) return ensaio;
    }

    // 1 — o grupo, com os artigos que ficam (v+1), quando sobra algum.
    let planVersion: number | null = null;
    let groupAlreadyUpdated = true;
    if (saem.length) {
      const saiIds = new Set(saem.map(article => article.subject.keywordId));
      const ficam = loaded.articles.filter(article => !saiIds.has(article.subject.keywordId));
      if (ficam.length) {
        const restante = await remainingPlanWithout(loaded, saiIds);
        const gravado = await declareEditorialGroupPlan(input.groupsClient, {
          brandId,
          actorUserId,
          groupId: loaded.groupRow.id,
          plan: restante.siloPlan as unknown as Record<string, unknown>,
          planHash: restante.planHash,
          eventPayload: {
            replacement: { decisionHash: input.decisionHash },
            withdrawals: saem.map(article => ({ subjectKeywordId: article.subject.keywordId, subjectPhrase: article.subject.phrase, order: article.order, role: article.role, principalKeywordId: article.principal?.keywordId ?? null })),
          },
        });
        if (!gravado.ok) return { ok: false, code: gravado.code === "GROUPS_NOT_AVAILABLE" ? "GROUPS_NOT_AVAILABLE" : "GROUP_REFUSED", reason: gravado.message };
        planVersion = gravado.group.planVersion;
        groupAlreadyUpdated = !gravado.changed;
      } else {
        notices.push("Nenhum artigo do plano gravado fica: a retirada não tem versão própria (um plano sem artigos não existe); o plano novo vira a próxima versão.");
      }
    }

    // 2 — por artigo que sai: o caminho de "Tirar do plano" (inclusive o Pilar).
    const withdrawn: Array<{ subjectKeywordId: string; principalKeywordId: string | null; order: number; role: DeclaredPlanRole }> = [];
    for (const article of saem) {
      const solta = await releaseArticleKeywords({ client: input.keywordsClient, brandId, actorUserId, article, release: marcadores.get(article.subject.keywordId)!, now, planVersion: planVersion ?? loaded.group.planVersion });
      if (!solta.ok) return solta;
      notices.push(...solta.notices);
      withdrawn.push({ subjectKeywordId: article.subject.keywordId, principalKeywordId: article.principal?.keywordId ?? null, order: article.order, role: article.role });
    }

    // 3 — as marcas órfãs deste grupo que ficaram fora do plano novo.
    const orphanMarksCleared: string[] = [];
    for (const keywordId of new Set(input.orphanMarkKeywordIds ?? [])) {
      const semantic = await readSemantic(input.keywordsClient, brandId, keywordId);
      if (!semantic) continue;
      const marca = resolveDeclaredPrincipal(semantic).mark;
      if (!marca || marca.groupId !== loaded.groupRow.id || loaded.plansBySubject.has(marca.subjectKeywordId)) continue;
      const semMarca = setDeclaredPrincipal(semantic, { mark: null, actorId: actorUserId, changedAt: now });
      if (!semMarca.ok) return { ok: false, code: "WRITE_REFUSED", reason: semMarca.reason };
      let proximo = semMarca.semantic;
      if (!resolveKeywordSubject(semantic).declared && recoverSubjectFromHistory({ keywordId, keyword: "", semantic, groupId: loaded.groupRow.id })) {
        const registrada = recordKeywordSubjectRelease(proximo, { actorId: actorUserId, changedAt: now, release: releaseOf("a linha recuperada do histórico") });
        if (!registrada.ok) return { ok: false, code: "WRITE_REFUSED", reason: registrada.reason };
        proximo = registrada.semantic;
      }
      if (!await writeSemantic(input.keywordsClient, brandId, keywordId, proximo)) return { ok: false, code: "WRITE_NOT_CONFIRMED", reason: "A marca de principal de uma keyword fora do plano novo não foi retirada (releitura). Gere a prévia e confirme de novo (é seguro)." };
      const relida = await readSemantic(input.keywordsClient, brandId, keywordId);
      if (!relida || resolveDeclaredPrincipal(relida).mark) return { ok: false, code: "WRITE_NOT_CONFIRMED", reason: "A releitura ainda encontrou a marca de principal numa keyword fora do plano novo. Gere a prévia e confirme de novo (é seguro)." };
      orphanMarksCleared.push(keywordId);
    }

    return { ok: true, planVersion, groupAlreadyUpdated, withdrawn, orphanMarksCleared, notices };
  } catch (error) {
    if (isEditorialGroupsSchemaMissing(error)) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: "Os grupos ainda não estão disponíveis neste banco (migration 20261013120000 não aplicada)." };
    throw error;
  } finally {
    inFlight.delete(lockKey);
  }
}

export async function withdrawFromDeclaredPlanWithCore(input: {
  brandId: string;
  actorUserId: string;
  /** Cliente do usuário (RLS de `minerador_keywords`), como o import do plano. */
  keywordsClient: Client;
  /** Cliente operacional: as tabelas de grupo só aceitam escrita do servidor. */
  groupsClient: Client;
  mode: "list" | "preview" | "apply";
  groupId: string;
  subjectKeywordId?: string | null;
  decisionHash?: string | null;
  now?: string;
}): Promise<DeclaredPlanWithdrawResult> {
  const brandId = typeof input.brandId === "string" ? input.brandId.trim() : "";
  if (!brandId) return refuse("BRAND_REQUIRED", "A marca ativa é necessária para mexer no plano.");
  if (!isKeywordSubjectActorId(input.actorUserId)) return refuse("ACTOR_REQUIRED", "Tirar do plano exige o usuário autenticado (auth.users.id).");
  const actorUserId = input.actorUserId.trim();
  const lockKey = input.mode === "apply" ? `${brandId}:${input.groupId}` : null;
  if (lockKey) {
    if (inFlight.has(lockKey)) return refuse("WITHDRAW_IN_PROGRESS", "Este plano já está sendo alterado. Aguarde o resultado.");
    inFlight.add(lockKey);
  }
  try {
    const loaded = await load({ brandId, keywordsClient: input.keywordsClient, groupsClient: input.groupsClient, groupId: input.groupId });
    if ("ok" in loaded) return loaded;
    if (input.mode === "list") return { ok: true, mode: "list", group: loaded.group, articles: loaded.articles };

    const subjectKeywordId = typeof input.subjectKeywordId === "string" ? input.subjectKeywordId.trim() : "";
    const article = loaded.articles.find(item => item.subject.keywordId === subjectKeywordId);
    if (!article) return refuse("NOT_IN_PLAN", "Este Assunto não está no plano deste grupo (pode ter saído em outra sessão). Recarregue.");
    if (!article.canWithdraw) return refuse(article.role === "Pilar" ? "PILLAR_CANNOT_LEAVE" : "LAST_ARTICLE", article.withdrawBlocker || "Este artigo não pode sair do plano.");
    const restante = await remainingPlan(loaded, subjectKeywordId);
    const decisionHash = await decisionHashOf(loaded, subjectKeywordId);
    const aprovados = [article.subject.status, article.principal && !article.principal.sameAsSubject ? article.principal.status : null].filter(status => status === "aprovado").length;

    if (input.mode === "preview") {
      const effects = [
        `O Assunto “${article.subject.phrase}” continua declarado e no grupo “${loaded.group.name}”; saem dele a ordem (${article.order}º), o papel (${article.role}) e o escopo do plano.`,
        article.principal
          ? article.principal.sameAsSubject
            ? "A própria frase do Assunto deixa de ser a principal declarada."
            : `“${article.principal.phrase}” deixa de ser a principal declarada: para aprovar de novo, ela passa a precisar de Volume (a exceção D2-bis só vale dentro do plano).`
          : "Este artigo não tinha principal declarada.",
        `O plano do grupo passa de v${loaded.group.planVersion} para v${loaded.group.planVersion + 1}, com ${restante.remaining} artigo(s). Os outros Assuntos do plano não são regravados (não voltam para revisão).`,
        aprovados
          ? `${aprovados} item(ns) aprovado(s) voltam para “Em revisão” (o plano sai do pacote aprovado). Reaprove no Minerador e envie de novo ao Arquiteto.`
          : "Nenhum item aprovado volta para revisão.",
        "No Arquiteto nada muda até a reaprovação e o novo envio: o artigo deste Assunto, se já existir, continua como está e passa a aparecer como “Fora do plano”. Para soltar as keywords dele, use “Retirar artigo do Silo” (elas voltam para “Keywords não agrupadas” do grupo).",
        "Nada é apagado: as keywords ficam no grupo, o histórico do Assunto e do grupo guarda a mudança.",
      ];
      return { ok: true, mode: "preview", group: loaded.group, article, remainingArticles: restante.remaining, nextPlanVersion: loaded.group.planVersion + 1, approvedToReview: aprovados, effects, decisionHash };
    }

    // apply — só a decisão tomada sobre a prévia vigente.
    if (!input.decisionHash) return refuse("DECISION_REQUIRED", "Gere a prévia e confirme a retirada sobre ela.");
    if (input.decisionHash !== decisionHash) return refuse("DECISION_STALE", "O plano mudou desde a prévia. Gere a prévia de novo antes de confirmar.");
    const now = input.now || new Date().toISOString();
    const notices: string[] = [];
    /*
     * 2026-10-13 · "O ASSUNTO NUNCA SE PERDE": esta é uma das duas portas que
     * LIBERAM a retirada. O marcador vai na MESMA escrita do Assunto; sem ele, o
     * banco repõe o plano (gatilho `minerador_keywords_preserva_assunto`).
     * `requestId` novo a cada confirmação: o banco só aceita marcador novo.
     */
    const release: KeywordSubjectRelease = {
      requestId: `tirar-do-plano:${decisionHash}:${crypto.randomUUID()}`,
      reason: `Tirar do plano: artigo ${article.order} (${article.role}) sai do plano v${loaded.group.planVersion} do grupo “${loaded.group.name}”.`,
      actorId: actorUserId,
      at: now,
      via: "tirar_do_plano",
    };

    // 0 — ensaio sem gravar: as duas escritas de keyword fecham o contrato? Recusa aqui não deixa nada pela metade.
    const ensaio = await rehearseArticleRelease(input.keywordsClient, brandId, actorUserId, subjectKeywordId, release, now);
    if (!ensaio.ok) return refuse(ensaio.code, ensaio.reason);

    // 1 — o grupo (idempotente pelo hash do plano restante).
    const gravado = await declareEditorialGroupPlan(input.groupsClient, {
      brandId,
      actorUserId,
      groupId: loaded.groupRow.id,
      plan: restante.siloPlan as unknown as Record<string, unknown>,
      planHash: restante.planHash,
      eventPayload: { withdrawal: { subjectKeywordId, subjectPhrase: article.subject.phrase, order: article.order, role: article.role, principalKeywordId: article.principal?.keywordId ?? null } },
    });
    if (!gravado.ok) return refuse(gravado.code === "GROUPS_NOT_AVAILABLE" ? "GROUPS_NOT_AVAILABLE" : "GROUP_REFUSED", gravado.message);

    // 2, 3 e 4 — as escritas de keyword (principal sem a marca, Assunto sem o plano) e a releitura delas.
    const solta = await releaseArticleKeywords({ client: input.keywordsClient, brandId, actorUserId, article, release, now, planVersion: gravado.group.planVersion });
    if (!solta.ok) return refuse(solta.code, solta.reason);
    notices.push(...solta.notices);
    const principalMarkRemoved = solta.principalMarkRemoved;
    const grupoRelido = await readEditorialGroupPlan(input.groupsClient, brandId, loaded.groupRow.id);
    if (!grupoRelido.ok) return refuse("GROUPS_NOT_AVAILABLE", grupoRelido.message);
    if (!grupoRelido.group || grupoRelido.group.planHash !== restante.planHash) return refuse("WRITE_NOT_CONFIRMED", "A releitura do grupo não encontrou o plano restante.");

    return {
      ok: true,
      mode: "apply",
      group: { ...loaded.group, planVersion: grupoRelido.group.planVersion, articleCount: restante.remaining },
      subjectKeywordId,
      principalKeywordId: article.principal?.keywordId ?? null,
      planVersion: grupoRelido.group.planVersion,
      groupAlreadyUpdated: !gravado.changed,
      readback: { subjectPlanRemoved: true, subjectStillDeclared: true, principalMarkRemoved, groupPlanHash: grupoRelido.group.planHash },
      notices,
    };
  } catch (error) {
    if (isEditorialGroupsSchemaMissing(error)) return refuse("GROUPS_NOT_AVAILABLE", "Os grupos ainda não estão disponíveis neste banco (migration 20261013120000 não aplicada).");
    throw error;
  } finally {
    if (lockKey) inFlight.delete(lockKey);
  }
}

/* ============================================= excluir tudo da cor (F7) */

export type PlanAfterColorDeletionResult =
  | { ok: true; outcome: "none" | "unchanged" | "reduced" | "cleared"; planVersion: number | null; remaining: number; eventRecorded: boolean }
  | Refused;

/**
 * 2026-10-14 · F7 "EXCLUIR TUDO DA COR" (SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`
 * §10.2 item 4b e D7). Chamado DEPOIS da exclusão e da releitura das keywords:
 * a RPC `lifecycle_delete_group_keywords` já liberou o Assunto (com o marcador
 * da exclusão da cor) e excluiu na mesma transação. Aqui o plano do grupo
 * acompanha o que ficou VIVO no plano (a mesma leitura de "Tirar do plano"):
 *
 *   - nenhum Assunto do plano saiu → nada muda (`none`/`unchanged`);
 *   - saiu algum e sobra artigo → plano restante (`v+1`) pelo
 *     `declareEditorialGroupPlan` de sempre (idempotente pelo hash);
 *   - não sobra artigo → plano limpo (`clearEditorialGroupPlan`: um plano sem
 *     artigos não existe; a reativação da cor começa sem plano).
 *
 * Reaplicar é seguro: o plano é recalculado do que está no banco. Não escreve
 * em keyword (a liberação já foi feita pela RPC, na transação da exclusão).
 */
export async function syncDeclaredPlanAfterColorDeletionWithCore(input: {
  brandId: string;
  actorUserId: string;
  keywordsClient: Client;
  groupsClient: Client;
  groupId: string;
  /** Os Assuntos do plano desta cor que a exclusão tirou (o que a releitura confirmou). */
  removedSubjects: ReadonlyArray<{ keywordId: string; title: string; order: number | null; role: string | null }>;
  /** Detalhe a mais no evento `plan_changed` (ex.: `via`, `decisionHash`). */
  eventPayload: Record<string, unknown>;
}): Promise<PlanAfterColorDeletionResult> {
  const brandId = typeof input.brandId === "string" ? input.brandId.trim() : "";
  if (!brandId) return { ok: false, code: "BRAND_REQUIRED", reason: "A marca ativa é necessária para mexer no plano." };
  if (!isKeywordSubjectActorId(input.actorUserId)) return { ok: false, code: "ACTOR_REQUIRED", reason: "Mexer no plano exige o usuário autenticado (auth.users.id)." };
  if (!input.removedSubjects.length) return { ok: true, outcome: "none", planVersion: null, remaining: 0, eventRecorded: true };
  const actorUserId = input.actorUserId.trim();
  const lockKey = `${brandId}:${input.groupId}`;
  if (inFlight.has(lockKey)) return { ok: false, code: "WITHDRAW_IN_PROGRESS", reason: "Este plano já está sendo alterado. Aguarde o resultado." };
  inFlight.add(lockKey);
  try {
    const loaded = await load({ brandId, keywordsClient: input.keywordsClient, groupsClient: input.groupsClient, groupId: input.groupId });
    if ("ok" in loaded) {
      const recusa = loaded as Refused;
      return recusa.code === "GROUP_WITHOUT_PLAN" ? { ok: true, outcome: "none", planVersion: null, remaining: 0, eventRecorded: true } : recusa;
    }
    const payload = { ...input.eventPayload, removedSubjects: input.removedSubjects.map(item => ({ subjectKeywordId: item.keywordId, subjectPhrase: item.title, order: item.order, role: item.role })) };
    if (!loaded.articles.length) {
      const limpo = await clearEditorialGroupPlan(input.groupsClient, { brandId, actorUserId, groupId: loaded.groupRow.id, eventPayload: payload });
      if (!limpo.ok) return { ok: false, code: limpo.code === "GROUPS_NOT_AVAILABLE" ? "GROUPS_NOT_AVAILABLE" : "GROUP_REFUSED", reason: limpo.message };
      return { ok: true, outcome: "cleared", planVersion: limpo.planVersion, remaining: 0, eventRecorded: limpo.eventRecorded };
    }
    const restante = await remainingPlanWithout(loaded, new Set());
    if (restante.planHash === loaded.groupRow.planHash) return { ok: true, outcome: "unchanged", planVersion: loaded.groupRow.planVersion, remaining: restante.remaining, eventRecorded: true };
    const gravado = await declareEditorialGroupPlan(input.groupsClient, {
      brandId,
      actorUserId,
      groupId: loaded.groupRow.id,
      plan: restante.siloPlan as unknown as Record<string, unknown>,
      planHash: restante.planHash,
      eventPayload: payload,
    });
    if (!gravado.ok) return { ok: false, code: gravado.code === "GROUPS_NOT_AVAILABLE" ? "GROUPS_NOT_AVAILABLE" : "GROUP_REFUSED", reason: gravado.message };
    const relido = await readEditorialGroupPlan(input.groupsClient, brandId, loaded.groupRow.id);
    if (!relido.ok) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: relido.message };
    if (!relido.group || relido.group.planHash !== restante.planHash) return { ok: false, code: "WRITE_NOT_CONFIRMED", reason: "A releitura do grupo não encontrou o plano restante." };
    return { ok: true, outcome: "reduced", planVersion: relido.group.planVersion, remaining: restante.remaining, eventRecorded: gravado.eventRecorded };
  } catch (error) {
    if (isEditorialGroupsSchemaMissing(error)) return { ok: false, code: "GROUPS_NOT_AVAILABLE", reason: "Os grupos ainda não estão disponíveis neste banco (migration 20261013120000 não aplicada)." };
    throw error;
  } finally {
    inFlight.delete(lockKey);
  }
}
