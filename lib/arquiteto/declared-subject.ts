/**
 * O ASSUNTO NO ARQUITETO — fase B da F2 (SDD 2026-09-24,
 * `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md`).
 *
 * O Assunto é a frase que o HUMANO declarou no Minerador como tronco de um ou
 * mais artigos. No Arquiteto ele vira `subject` do ArticleDNA e do SiloDNA:
 * um snapshot tirado do PACOTE APROVADO que o handoff entregou, nunca da linha
 * viva do Minerador.
 *
 * Este módulo responde, sem rede, sem storage e sem provider:
 *
 *   LEITURA       o que o pacote aprovado diz do Assunto (`readArchitectSubjectStanding`),
 *                 sempre pelo resolver do Minerador (`keywordDnaFromPackage`,
 *                 `resolveKeywordSubject`, `readSubjectDiscoveryBlock`);
 *   PRENDER       o plano de prender o Assunto num artigo ou num Silo, e o
 *                 ato de prender e soltar no ArticleDNA, no SiloDNA e na
 *                 cópia de trabalho (`subjectKeywordId` do ARTIGO, separado de
 *                 `clusterId`);
 *   CONSERVAÇÃO   `isAnchoredSubject`: o predicado único que todos os cálculos
 *                 de "incorporada", "não agrupada" e "sem território" usam;
 *   SUGESTÕES     a ordem determinística das keywords JÁ recebidas pelo
 *                 Arquiteto para sustentar um Assunto (F2.4, com a emenda da
 *                 F1b: `subject_discovery.subjectKeywordIds` é o primeiro sinal);
 *   RÓTULOS       os textos que a tela mostra, num lugar só.
 *
 * O que ele NÃO faz: declarar Assunto (é do Minerador, P4), trocar a principal
 * (D1), ou prender por conta própria. Sugestão e Silo só PROPÕEM; prender é
 * ato humano, com `attachedBy` = `auth.users.id` (AGENTS.md §9).
 */

import { keywordDnaFromPackage, type KeywordDna } from "../minerador/keyword-dna.ts";
import type { ApprovedKeywordPackage } from "../minerador/approved-package.ts";
import { isKeywordSubjectActorId, KEYWORD_SUBJECT_LABEL, resolveKeywordSubject } from "../minerador/keyword-subject.ts";
import { deriveProcessorRevalidation } from "../minerador/processor-revalidation.ts";
import { readSubjectDiscoveryBlock } from "../minerador/subject-discovery-import.ts";
import { normalizeKeyword } from "../minerador/keyword-import-core.ts";
import {
  ArticleDNASchema,
  DeclaredSubjectSchema,
  SiloDNASchema,
  type ApprovedPackageRef,
  type ArticleDNA,
  type DeclaredSubject,
  type SiloDNA,
} from "./contracts.ts";
import { readApprovedPackageRef } from "./keyword-package-alignment.ts";
import { intentComparisonKey } from "./keyword-dna-signals.ts";

type RecordLike = Record<string, unknown>;

const asRecord = (value: unknown): RecordLike | null => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as RecordLike;
  // `analise_semantica` já chegou como texto em linhas antigas: lido, não descartado.
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as RecordLike : null;
    } catch {
      return null;
    }
  }
  return null;
};

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/* ------------------------------------------------------------------ rótulos */

/** Assunto declarado, ainda sem artigo: fica em "Keywords não agrupadas" com este selo (§10). */
export const SUBJECT_AWAITING_SUPPORT_LABEL = "Assunto · aguardando sustentação" as const;
/** O mesmo texto do Minerador: a declaração tem um nome só nas duas telas. */
export const SUBJECT_DECLARED_LABEL = KEYWORD_SUBJECT_LABEL;
/** Filtro da mesa (F2.2). */
export const SUBJECT_FILTER_LABEL = "Assuntos" as const;
/** Botão de prender e de soltar. */
export const SUBJECT_ATTACH_ACTION_LABEL = "Prender Assunto" as const;
export const SUBJECT_DETACH_ACTION_LABEL = "Soltar Assunto" as const;
/** Sugestão vinda do Silo: o artigo confirma. */
export const SUBJECT_SILO_SUGGESTION_ACTION_LABEL = "Confirmar Assunto do Silo" as const;

/** `Assunto · tronco de 1 artigo` / `Assunto · tronco de 3 artigos`. */
export function subjectTrunkLabel(articleCount: number): string {
  const total = Math.max(0, Math.trunc(articleCount));
  return `Assunto · tronco de ${total} ${total === 1 ? "artigo" : "artigos"}`;
}

/**
 * O selo de conservação de uma keyword declarada Assunto.
 *
 * Ancorado em N artigos: sai de "não agrupadas" e mostra o tronco. Sem artigo:
 * fica em "não agrupadas" com "aguardando sustentação". Sem declaração: `null`.
 */
export function subjectConservationLabel(input: { declared: boolean; anchoredArticleCount: number }): string | null {
  if (input.anchoredArticleCount > 0) return subjectTrunkLabel(input.anchoredArticleCount);
  return input.declared ? SUBJECT_AWAITING_SUPPORT_LABEL : null;
}

/* ------------------------------------------------------------------ leitura */

/**
 * O pacote aprovado do item de workflow, inteiro, quando ele existe.
 *
 * Sem pacote não há Assunto a prender: o Arquiteto lê o que o humano aprovou,
 * e só muda quando ele aprova de novo.
 */
function approvedPackageOf(keyword: RecordLike): ApprovedKeywordPackage | null {
  const workflow = asRecord(keyword.canonicalWorkflow);
  const payload = asRecord(workflow?.payload);
  const approved = asRecord(payload?.approvedDna);
  if (!approved) return null;
  const semantic = asRecord(approved.analiseSemantica);
  const version = approved.version;
  if (!semantic || typeof approved.keywordId !== "string" || !approved.keywordId
    || typeof approved.keyword !== "string" || !approved.keyword.trim()
    || typeof version !== "number" || !Number.isInteger(version) || version <= 0
    || !text(approved.contentHash) || !text(approved.approvedAt)) return null;
  return { ...(approved as unknown as ApprovedKeywordPackage), analiseSemantica: semantic };
}

function payloadOf(keyword: RecordLike): RecordLike | null {
  return asRecord(asRecord(keyword.canonicalWorkflow)?.payload);
}

/** A keyword chegou ao Arquiteto (item de workflow recebido)? */
export function isReceivedByArchitect(keyword: RecordLike): boolean {
  const workflow = asRecord(keyword.canonicalWorkflow);
  if (!workflow) return false;
  const state = text(workflow.state);
  return state === null || state === "received";
}

/** KeywordDNA do pacote, pela autoridade do Minerador. Pacote ilegível = `null`. */
function packageDna(pkg: ApprovedKeywordPackage | null): KeywordDna | null {
  if (!pkg) return null;
  try {
    return keywordDnaFromPackage({ approvedDna: pkg });
  } catch {
    return null;
  }
}

export type ArchitectSubjectStanding = {
  keywordId: string;
  /** Marca do pacote; cai para `brand_id` da linha só sem pacote. */
  brandId: string | null;
  phrase: string;
  /** A keyword chegou ao Arquiteto. */
  received: boolean;
  /** Versão e hash do pacote aprovado em que a declaração foi lida. */
  approvedPackageRef: ApprovedPackageRef | null;
  declared: boolean;
  note: string | null;
  destinationUrl: string | null;
  /** Volume medido e validado NO PACOTE (Google Ads com data). */
  volumeValidated: boolean;
  /**
   * Assunto declarado SEM Volume validado (exceção D2): fora da formação
   * automática, da eleição da principal e do slug (F2.3). Só entra num artigo
   * como `subject`, ou como membro por ato humano explícito.
   */
  heldOutOfFormation: boolean;
};

/**
 * O que o Arquiteto sabe do Assunto de uma keyword da mesa.
 *
 * Com pacote aprovado, tudo sai dele (`keywordDnaFromPackage`). Sem pacote
 * (item anterior ao pacote versionado), a linha é lida só para dizer se há
 * declaração — e aí não há `approvedPackageRef`, então nada pode ser preso.
 */
export function readArchitectSubjectStanding(keyword: RecordLike): ArchitectSubjectStanding {
  const keywordId = String(keyword.id ?? "");
  const pkg = approvedPackageOf(keyword);
  const dna = packageDna(pkg);
  const received = isReceivedByArchitect(keyword);
  const approvedPackageRef = readApprovedPackageRef(payloadOf(keyword));

  if (pkg && dna) {
    const declared = dna.subject?.declared === true;
    const volumeValidated = dna.metrics.volume.validated;
    return {
      keywordId,
      brandId: text(pkg.brandId) ?? text(keyword.brand_id),
      phrase: pkg.keyword.trim(),
      received,
      approvedPackageRef,
      declared,
      note: declared ? dna.subject?.note ?? null : null,
      destinationUrl: declared ? dna.subject?.destinationUrl ?? null : null,
      volumeValidated,
      heldOutOfFormation: declared && !volumeValidated,
    };
  }

  const semantic = asRecord(keyword.analise_semantica);
  const subject = resolveKeywordSubject(semantic);
  const volumeValidated = deriveProcessorRevalidation({
    semantic,
    volumeSearch: keyword.volume_search,
    resultsAllintitle: keyword.results_allintitle,
  }).volume.validated;
  return {
    keywordId,
    brandId: text(keyword.brand_id),
    phrase: text(keyword.keyword) ?? "",
    received,
    approvedPackageRef: null,
    declared: subject.declared,
    note: subject.note,
    destinationUrl: subject.destinationUrl,
    volumeValidated,
    heldOutOfFormation: subject.declared && !volumeValidated,
  };
}

/* -------------------------------------------------------------- conservação */

/** Quem pode ancorar um Assunto: o ArticleDNA (`subject`) ou o artigo da cópia de trabalho (`subjectKeywordId`). */
export type SubjectAnchorCarrier = {
  subjectKeywordId?: string | null;
  subject?: { keywordId: string } | null;
  /**
   * Principal da unidade, quando se sabe. Um Assunto que é a principal de
   * alguma unidade (Q7) é membro dela: não é tronco solto e não pode sair da
   * formação automática, senão a própria unidade se desmancha.
   */
  principalKeywordId?: string | null;
};

function anchorOf(article: SubjectAnchorCarrier): string | null {
  return text(article.subject?.keywordId) ?? text(article.subjectKeywordId);
}

/**
 * A keyword é o tronco de pelo menos um artigo?
 *
 * O ÚNICO predicado da conservação (F2.3). Elegibilidade no servidor, não
 * agrupadas da mesa, partição do cenário, sobras da formação, motor legado,
 * território e proposta perguntam aqui — nenhum reimplementa.
 */
export function isAnchoredSubject(keywordId: string, articles: readonly SubjectAnchorCarrier[]): boolean {
  const id = String(keywordId);
  return articles.some(article => anchorOf(article) === id);
}

/** Em quantos artigos a keyword é tronco. */
export function countSubjectAnchors(keywordId: string, articles: readonly SubjectAnchorCarrier[]): number {
  const id = String(keywordId);
  return articles.filter(article => anchorOf(article) === id).length;
}

/** Todos os troncos ancorados. */
export function anchoredSubjectKeywordIds(articles: readonly SubjectAnchorCarrier[]): Set<string> {
  const ids = new Set<string>();
  for (const article of articles) {
    const id = anchorOf(article);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Keywords que um ArticleDNA incorpora: as referências E o tronco.
 *
 * É o que o servidor usa para "incorporada" e para a elegibilidade de
 * importação. Sem o tronco aqui, um Assunto ancorado voltaria a parecer
 * pendente de handoff.
 */
export function articleDnaIncorporatedKeywordIds(
  article: Pick<ArticleDNA, "keywordReferences"> & { subject?: { keywordId: string } | null },
): string[] {
  const ids = article.keywordReferences.map(reference => reference.keywordId);
  const subject = text(article.subject?.keywordId);
  return subject && !ids.includes(subject) ? [...ids, subject] : ids;
}

export type UngroupedSubjectView = {
  /** Continuam em "Keywords não agrupadas"; o Assunto sem artigo leva o selo. */
  ungrouped: Array<{ keywordId: string; label: string | null }>;
  /** Troncos ancorados: saem de "não agrupadas" e mostram "tronco de N". */
  anchored: Array<{ keywordId: string; label: string; articleCount: number }>;
};

/**
 * O cálculo de "não agrupadas" da mesa, com o Assunto (F2.3).
 *
 * Recebe as keywords que a mesa já considera não agrupadas (sem `clusterId`) e
 * devolve a partição: nenhuma some, só muda de lista.
 */
export function splitUngroupedBySubjectAnchor(input: {
  ungroupedKeywordIds: readonly string[];
  articles: readonly SubjectAnchorCarrier[];
  /** Declarado Assunto no pacote (`readArchitectSubjectStanding(...).declared`). */
  isDeclaredSubject: (keywordId: string) => boolean;
}): UngroupedSubjectView {
  const view: UngroupedSubjectView = { ungrouped: [], anchored: [] };
  for (const raw of input.ungroupedKeywordIds) {
    const keywordId = String(raw);
    const articleCount = countSubjectAnchors(keywordId, input.articles);
    if (articleCount > 0) {
      view.anchored.push({ keywordId, label: subjectTrunkLabel(articleCount), articleCount });
      continue;
    }
    view.ungrouped.push({ keywordId, label: input.isDeclaredSubject(keywordId) ? SUBJECT_AWAITING_SUPPORT_LABEL : null });
  }
  return view;
}

/**
 * Troncos soltos: Assuntos presos a pelo menos uma unidade e que não são a
 * principal de nenhuma. É o conjunto que sai da formação automática (F2.3: a
 * keyword do Assunto mantém `clusterId` vazio) e que não volta como sobra.
 */
export function trunkAnchoredKeywordIds(articles: readonly SubjectAnchorCarrier[]): Set<string> {
  const principais = new Set<string>();
  for (const article of articles) {
    const principal = text(article.principalKeywordId);
    if (principal) principais.add(principal);
  }
  const ids = new Set<string>();
  for (const id of anchoredSubjectKeywordIds(articles)) {
    if (!principais.has(id)) ids.add(id);
  }
  return ids;
}

/**
 * Os dois conjuntos que a formação, o motor e a proposta recebem.
 *
 * `heldOut`: declarados sem Volume validado — fora da formação automática.
 * `anchored`: troncos soltos (`trunkAnchoredKeywordIds`) — fora da formação
 * automática e nunca voltam como sobra.
 */
export function subjectFormationSets(input: {
  keywords: readonly RecordLike[];
  articles: readonly SubjectAnchorCarrier[];
}): { heldOut: Set<string>; anchored: Set<string> } {
  const heldOut = new Set<string>();
  for (const keyword of input.keywords) {
    if (readArchitectSubjectStanding(keyword).heldOutOfFormation) heldOut.add(String(keyword.id));
  }
  return { heldOut, anchored: trunkAnchoredKeywordIds(input.articles) };
}

/* ------------------------------------------------------------------ prender */

export const SUBJECT_ATTACH_REFUSAL_CODES = [
  "ACTOR_REQUIRED",
  "NOT_RECEIVED",
  "NO_APPROVED_PACKAGE",
  "CROSS_BRAND",
  "NOT_DECLARED",
  "SUPPORT_ROLE",
  "PRINCIPAL_WITHOUT_VOLUME",
  "EXCLUDED_SUBJECT",
  "INVALID_SUBJECT",
] as const;
export type SubjectAttachRefusalCode = (typeof SUBJECT_ATTACH_REFUSAL_CODES)[number];

export type SubjectAttachmentPlan =
  | { ok: true; subject: DeclaredSubject; subjectKeywordId: string }
  | { ok: false; code: SubjectAttachRefusalCode; reason: string };

/** O artigo (ou unidade) que vai receber o Assunto, como a formação o tem. */
export type SubjectAttachTarget = {
  principalKeywordId: string | null;
  /** Membros com papel; o Assunto não pode ser secundária nem reforço (F2.1). */
  keywords?: readonly { keywordId: string; role: string }[];
  /** `excludedSubjects` do artigo: o tronco não pode ser, ao mesmo tempo, tema excluído. */
  excludedSubjects?: readonly string[];
};

const refuse = (code: SubjectAttachRefusalCode, reason: string): SubjectAttachmentPlan => ({ ok: false, code, reason });

const SUPPORT_ROLES = new Set(["secundaria", "reforco", "reforco_narrativo", "secondary", "reinforcement"]);

/**
 * O plano de prender um Assunto. Puro: não grava nada.
 *
 * Monta o snapshot do F2.1 a partir do PACOTE APROVADO (frase, nota, destino,
 * versão e hash) com `attachedBy` = humano. Recusa, com o motivo em uma
 * frase:
 *
 *   - ator que não é `auth.users.id` (a IA nunca prende);
 *   - keyword que não chegou ao Arquiteto, ou chegou sem pacote aprovado;
 *   - keyword de outra marca (nenhum fallback, AGENTS.md §5);
 *   - keyword que o pacote não declara Assunto (retirado no Minerador);
 *   - Assunto como secundária ou reforço do mesmo artigo;
 *   - Assunto como principal sem Volume validado no pacote (Q7);
 *   - Assunto entre os temas excluídos do artigo.
 */
export function planSubjectAttachment(input: {
  brandId: string;
  keyword: RecordLike;
  actorUserId: string;
  attachedAt: string;
  target?: SubjectAttachTarget | null;
}): SubjectAttachmentPlan {
  if (!isKeywordSubjectActorId(input.actorUserId)) {
    return refuse("ACTOR_REQUIRED", "Prender o Assunto é ato humano e exige o usuário autenticado.");
  }
  const standing = readArchitectSubjectStanding(input.keyword);
  const nome = standing.phrase || standing.keywordId;
  if (!standing.received) {
    return refuse("NOT_RECEIVED", `"${nome}" ainda não chegou ao Arquiteto: envie o Assunto pelo Minerador antes de prender.`);
  }
  const lineBrand = text(input.keyword.brand_id);
  if (standing.brandId !== input.brandId || (lineBrand !== null && lineBrand !== input.brandId)) {
    return refuse("CROSS_BRAND", "Este Assunto pertence a outra marca e não pode ser preso aqui.");
  }
  if (!standing.approvedPackageRef || !approvedPackageOf(input.keyword)) {
    return refuse("NO_APPROVED_PACKAGE", `"${nome}" está sem pacote aprovado no Arquiteto: aprove no Minerador e envie de novo.`);
  }
  if (!standing.declared) {
    return refuse("NOT_DECLARED", `O pacote aprovado de "${nome}" não declara Assunto.`);
  }

  const target = input.target || null;
  if (target) {
    const member = (target.keywords || []).find(item => item.keywordId === standing.keywordId);
    if (member && SUPPORT_ROLES.has(member.role)) {
      return refuse("SUPPORT_ROLE", "O Assunto não pode ser secundária nem reforço do mesmo artigo.");
    }
    if (target.principalKeywordId === standing.keywordId && !standing.volumeValidated) {
      return refuse("PRINCIPAL_WITHOUT_VOLUME", "O Assunto só pode ser a própria principal com Volume validado no pacote aprovado.");
    }
    const phrase = normalizeKeyword(standing.phrase);
    if ((target.excludedSubjects || []).some(excluded => normalizeKeyword(excluded) === phrase)) {
      return refuse("EXCLUDED_SUBJECT", "O Assunto está entre os temas excluídos deste artigo.");
    }
  }

  const parsed = DeclaredSubjectSchema.safeParse({
    keywordId: standing.keywordId,
    approvedPackageRef: standing.approvedPackageRef,
    phrase: standing.phrase,
    note: standing.note,
    destinationUrl: standing.destinationUrl,
    attachedBy: input.actorUserId.trim(),
    attachedAt: input.attachedAt,
  });
  if (!parsed.success) {
    return refuse("INVALID_SUBJECT", `O Assunto não fecha o contrato do ArticleDNA: ${parsed.error.issues[0]?.message || "campo inválido"}.`);
  }
  return { ok: true, subject: parsed.data, subjectKeywordId: standing.keywordId };
}

/** O mesmo Assunto, lido do mesmo pacote: prender de novo não é mudança real. */
export function sameDeclaredSubject(left: DeclaredSubject | null | undefined, right: DeclaredSubject | null | undefined): boolean {
  if (!left || !right) return !left && !right;
  return left.keywordId === right.keywordId
    && left.approvedPackageRef.version === right.approvedPackageRef.version
    && left.approvedPackageRef.contentHash === right.approvedPackageRef.contentHash
    && left.phrase === right.phrase
    && left.note === right.note
    && left.destinationUrl === right.destinationUrl;
}

export type SubjectWriteResult<T> =
  | { ok: true; value: T; changed: boolean }
  | { ok: false; code: "ARTICLE_REFUSED" | "SILO_REFUSED" | "PRINCIPAL_WITHOUT_VOLUME" | "ANOTHER_SUBJECT_ATTACHED"; reason: string };

/** Uma unidade tem um Assunto só (D3): trocar exige soltar antes, por ato humano. */
export const SUBJECT_ANOTHER_ATTACHED_REASON =
  "Esta unidade já tem outro Assunto preso. Solte-o antes de prender outro: nada troca sozinho.";

/**
 * Prende o Assunto num ArticleDNA. Devolve o payload novo; quem versiona é o
 * writer canônico. Mesmo Assunto do mesmo pacote: `changed: false`, e o
 * payload volta intacto (nova versão só com mudança real). O mesmo Assunto
 * com pacote aprovado novo é atualização; OUTRO Assunto é recusado.
 *
 * `principalVolumeValidated` é obrigatório quando o Assunto é a principal
 * (Q7): o ArticleDNA não carrega Volume, então quem prende informa.
 */
export function attachSubjectToArticleDna(
  article: ArticleDNA,
  subject: DeclaredSubject,
  options: { principalVolumeValidated?: boolean } = {},
): SubjectWriteResult<ArticleDNA> {
  if (article.subject && sameDeclaredSubject(article.subject, subject)) return { ok: true, value: article, changed: false };
  if (article.subject && article.subject.keywordId !== subject.keywordId) {
    return { ok: false, code: "ANOTHER_SUBJECT_ATTACHED", reason: SUBJECT_ANOTHER_ATTACHED_REASON };
  }
  if (subject.keywordId === article.principalKeywordId && options.principalVolumeValidated !== true) {
    return { ok: false, code: "PRINCIPAL_WITHOUT_VOLUME", reason: "O Assunto só pode ser a própria principal com Volume validado no pacote aprovado." };
  }
  const parsed = ArticleDNASchema.safeParse({ ...article, subject });
  if (!parsed.success) {
    return { ok: false, code: "ARTICLE_REFUSED", reason: parsed.error.issues[0]?.message || "O ArticleDNA recusou o Assunto." };
  }
  return { ok: true, value: parsed.data, changed: true };
}

/** Solta o Assunto do ArticleDNA. Sem Assunto: `changed: false`. */
export function detachSubjectFromArticleDna(article: ArticleDNA): { value: ArticleDNA; changed: boolean } {
  if (!article.subject) return { value: article, changed: false };
  const { subject: _removed, ...rest } = article;
  void _removed;
  return { value: rest as ArticleDNA, changed: true };
}

/**
 * Prende o Assunto no SiloDNA. `centralEntity` NÃO muda: a SiloPage tira H1 e
 * title dali, e a principal continua dona do H1 (D1).
 */
export function attachSubjectToSiloDna(silo: SiloDNA, subject: DeclaredSubject): SubjectWriteResult<SiloDNA> {
  if (silo.subject && sameDeclaredSubject(silo.subject, subject)) return { ok: true, value: silo, changed: false };
  if (silo.subject && silo.subject.keywordId !== subject.keywordId) {
    return { ok: false, code: "ANOTHER_SUBJECT_ATTACHED", reason: SUBJECT_ANOTHER_ATTACHED_REASON };
  }
  const parsed = SiloDNASchema.safeParse({ ...silo, subject });
  if (!parsed.success) {
    return { ok: false, code: "SILO_REFUSED", reason: parsed.error.issues[0]?.message || "O SiloDNA recusou o Assunto." };
  }
  return { ok: true, value: parsed.data, changed: true };
}

/** Solta o Assunto do SiloDNA. */
export function detachSubjectFromSiloDna(silo: SiloDNA): { value: SiloDNA; changed: boolean } {
  if (!silo.subject) return { value: silo, changed: false };
  const { subject: _removed, ...rest } = silo;
  void _removed;
  return { value: rest as SiloDNA, changed: true };
}

/**
 * Cópia de trabalho: o vínculo é `subjectKeywordId` do ARTIGO, separado de
 * `clusterId`. A keyword do Assunto mantém `clusterId` vazio — senão viraria
 * membro, entraria no teto de 6 e bateria em duplicidade ao ser compartilhada
 * (D3).
 */
export function attachSubjectToWorkingArticle<T extends { subjectKeywordId?: string | null }>(
  article: T,
  plan: Extract<SubjectAttachmentPlan, { ok: true }>,
): { value: T; changed: boolean } {
  if (article.subjectKeywordId === plan.subjectKeywordId) return { value: article, changed: false };
  return { value: { ...article, subjectKeywordId: plan.subjectKeywordId }, changed: true };
}

export function detachSubjectFromWorkingArticle<T extends { subjectKeywordId?: string | null }>(
  article: T,
): { value: T; changed: boolean } {
  if (!article.subjectKeywordId) return { value: article, changed: false };
  return { value: { ...article, subjectKeywordId: null }, changed: true };
}

/* ---------------------------------------------------- sugestão vinda do Silo */

export type SiloSubjectSuggestion = {
  keywordId: string;
  phrase: string;
  /** Sempre `true`: o Silo sugere, o artigo confirma. */
  requiresConfirmation: true;
  reason: string;
};

/**
 * O Silo tem Assunto e o artigo novo ainda não: sugere o mesmo, e só sugere.
 * Artigo que já tem Assunto (igual ou outro) não recebe sugestão — nada troca
 * sozinho.
 */
export function suggestSubjectFromSilo(input: {
  silo: { name?: string | null; subject?: DeclaredSubject | null } | null | undefined;
  article: SubjectAnchorCarrier;
}): SiloSubjectSuggestion | null {
  const subject = input.silo?.subject;
  if (!subject || anchorOf(input.article)) return null;
  const nome = text(input.silo?.name);
  return {
    keywordId: subject.keywordId,
    phrase: subject.phrase,
    requiresConfirmation: true,
    reason: nome
      ? `O Silo "${nome}" tem o Assunto "${subject.phrase}". Confirme para prender neste artigo.`
      : `O Silo deste artigo tem o Assunto "${subject.phrase}". Confirme para prender neste artigo.`,
  };
}

/* ------------------------------------------- o Assunto preso, depois do Minerador */

export type AttachedSubjectState = "current" | "update_available" | "in_review" | "withdrawn" | "not_in_mesa";

export type AttachedSubjectStanding = {
  state: AttachedSubjectState;
  /** `null` quando está tudo em dia. O aviso nunca troca nada. */
  warning: string | null;
};

/**
 * O Assunto preso ainda é o que o Minerador aprovou?
 *
 * O artigo segue com o ÚLTIMO pacote aprovado (spec do Minerador) e mostra
 * aviso. Retirar a declaração no Minerador, reaprovar ou pôr em revisão NÃO
 * solta nem troca o Assunto: soltar é ato humano.
 */
export function resolveAttachedSubjectStanding(input: {
  subject: DeclaredSubject;
  /** A linha da mesa da keyword do Assunto; `null` quando não está mais lá. */
  keyword: RecordLike | null | undefined;
}): AttachedSubjectStanding {
  const recorded = input.subject.approvedPackageRef;
  const segue = `O artigo segue com o pacote aprovado v${recorded.version}; nada foi trocado.`;
  if (!input.keyword) {
    return { state: "not_in_mesa", warning: `A keyword do Assunto "${input.subject.phrase}" não está na mesa do Arquiteto. ${segue}` };
  }
  const standing = readArchitectSubjectStanding(input.keyword);
  const current = standing.approvedPackageRef;
  if (!current || !approvedPackageOf(input.keyword)) {
    return { state: "in_review", warning: `O Minerador está revisando o Assunto "${input.subject.phrase}". ${segue}` };
  }
  if (!standing.declared) {
    return {
      state: "withdrawn",
      warning: `O Minerador retirou a declaração do Assunto "${input.subject.phrase}". ${segue} Solte o Assunto ou mantenha-o.`,
    };
  }
  if (current.version !== recorded.version || current.contentHash !== recorded.contentHash) {
    return {
      state: "update_available",
      warning: `Há pacote aprovado novo do Assunto "${input.subject.phrase}" (v${current.version}). ${segue} Prenda de novo para atualizar.`,
    };
  }
  return { state: "current", warning: null };
}

/* ---------------------------------------------------------------- sugestões */

export const SUBJECT_SUGGESTION_SIGNALS = [
  "subject_discovery",
  "subject_discovery_phrase",
  "central_entity",
  "same_list",
  "intent_funnel",
  "note_terms",
] as const;
export type SubjectSuggestionSignal = (typeof SUBJECT_SUGGESTION_SIGNALS)[number];

export const SUBJECT_SUGGESTION_SIGNAL_LABELS: Record<SubjectSuggestionSignal, string> = {
  subject_discovery: "veio da Pesquisa por Assunto",
  subject_discovery_phrase: "pesquisa com a mesma frase",
  central_entity: "mesma entidade central da Lógica",
  same_list: "mesma lista",
  intent_funnel: "intenção e funil compatíveis com a hipótese do Assunto",
  note_terms: "termos em comum com a nota",
};

export type SubjectSupportSuggestion = {
  keywordId: string;
  keyword: string;
  signals: SubjectSuggestionSignal[];
  /** Motivo em uma frase, pronto para a tela. */
  reason: string;
  /** Evidência curta gravada pela Pesquisa por Assunto (F1b.7), quando houver. */
  discoveryEvidence: string[];
  /** Termos da nota que a keyword repete. */
  sharedNoteTerms: string[];
  /** Já é membro de algum artigo: aparece só como informação. */
  alreadyInArticle: boolean;
};

const NOTE_STOPWORDS = new Set([
  "para", "com", "sem", "por", "que", "dos", "das", "uma", "uns", "umas", "seu", "sua", "seus", "suas",
  "mais", "como", "quem", "pelo", "pela", "pelos", "pelas", "nos", "nas", "aos", "sao", "ser", "tem",
  "querem", "quer", "este", "esta", "isso", "essa", "esse", "entre", "sobre", "ate", "muito", "the", "and",
]);

/** Termos para comparar com a nota: sem acento, sem caixa, sem plural simples. */
function noteTerms(value: string): Set<string> {
  return new Set(
    value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 2 && !NOTE_STOPWORDS.has(token))
      .map(token => token.replace(/s$/, "")),
  );
}

const FUNNEL_STAGE: Record<string, number> = { tofu: 0, topo: 0, mofu: 1, meio: 1, bofu: 2, fundo: 2 };

function funnelStage(value: string | null): number | null {
  if (!value) return null;
  const key = value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim().split(/\s+/)[0];
  return key in FUNNEL_STAGE ? FUNNEL_STAGE[key] : null;
}

/**
 * Intenção igual, e funil igual ou vizinho, à hipótese do Assunto.
 *
 * Sem intenção dos dois lados não há sinal: ausência não apoia nem conflita.
 */
function intentFunnelCompatible(subject: KeywordDna, candidate: KeywordDna): boolean {
  const left = intentComparisonKey(subject.axes.intent.value);
  const right = intentComparisonKey(candidate.axes.intent.value);
  if (!left || !right || left !== right) return false;
  const subjectStage = funnelStage(subject.axes.funnel.value);
  const candidateStage = funnelStage(candidate.axes.funnel.value);
  return subjectStage === null || candidateStage === null || Math.abs(subjectStage - candidateStage) <= 1;
}

const sameText = (left: string | null, right: string | null) =>
  Boolean(left && right && normalizeKeyword(left) === normalizeKeyword(right));

/**
 * Sugestões determinísticas de sustentação para um Assunto (F2.4).
 *
 * Só olha as keywords JÁ recebidas pelo Arquiteto, com pacote aprovado: é a
 * linha que a mesa já tem inteira. Nenhuma leitura nova, nenhum provider,
 * nenhuma rede. A ordem é:
 *
 *   1. o pacote traz o Assunto em `subject_discovery.subjectKeywordIds`
 *      ("veio da Pesquisa por Assunto");
 *   2. sem o id, `searches[].subjectPhrase` igual à frase do Assunto
 *      ("pesquisa com a mesma frase") — texto do navegador, só ordena;
 *   3. mesma entidade central da Lógica;
 *   4. mesma lista;
 *   5. intenção e funil compatíveis com a hipótese da Lógica do Assunto;
 *   6. termos em comum com a NOTA do Assunto (mais termos, antes).
 *
 * Fica de fora: o próprio Assunto, keyword de outra marca, keyword não
 * recebida, outro Assunto sem Volume validado (não sustenta busca) e keyword
 * sem nenhum sinal. Sugestão não prende nada.
 */
export function suggestSubjectSupport(input: {
  brandId: string;
  /** Linha da mesa do Assunto escolhido. */
  subjectKeyword: RecordLike;
  /** Linhas da mesa (recebidas); o que não for recebido é ignorado. */
  keywords: readonly RecordLike[];
  /** Membros de artigo hoje, para a marca "já em artigo". */
  memberKeywordIds?: ReadonlySet<string>;
  limit?: number;
}): SubjectSupportSuggestion[] {
  const subjectStanding = readArchitectSubjectStanding(input.subjectKeyword);
  if (!subjectStanding.declared || subjectStanding.brandId !== input.brandId) return [];
  const subjectPkg = approvedPackageOf(input.subjectKeyword);
  const subjectDna = packageDna(subjectPkg);
  if (!subjectPkg || !subjectDna) return [];

  const subjectId = subjectStanding.keywordId;
  const subjectPhrase = normalizeKeyword(subjectStanding.phrase);
  const subjectEntity = text(subjectDna.logical.centralEntity);
  const subjectList = text(subjectPkg.listaId);
  const note = subjectStanding.note ? noteTerms(subjectStanding.note) : new Set<string>();

  type Scored = SubjectSupportSuggestion & { rank: number[]; sort: string };
  const scored: Scored[] = [];

  for (const keyword of input.keywords) {
    const keywordId = String(keyword.id ?? "");
    if (!keywordId || keywordId === subjectId) continue;
    if (!isReceivedByArchitect(keyword)) continue;
    const pkg = approvedPackageOf(keyword);
    const dna = packageDna(pkg);
    if (!pkg || !dna) continue;
    const lineBrand = text(keyword.brand_id);
    if (text(pkg.brandId) !== input.brandId || (lineBrand !== null && lineBrand !== input.brandId)) continue;
    // Outro Assunto sem Volume validado não traz leitor: não é sustentação.
    if (dna.subject?.declared === true && !dna.metrics.volume.validated) continue;

    const signals: SubjectSuggestionSignal[] = [];
    const discovery = readSubjectDiscoveryBlock(pkg.analiseSemantica);
    const byId = discovery.subjectKeywordIds.includes(subjectId);
    const byPhrase = !byId && discovery.searches.some(search => normalizeKeyword(search.subjectPhrase) === subjectPhrase);
    if (byId) signals.push("subject_discovery");
    if (byPhrase) signals.push("subject_discovery_phrase");
    const discoveryEvidence = byId || byPhrase
      ? [...new Set(discovery.searches
        .filter(search => byId ? search.subjectKeywordId === subjectId : normalizeKeyword(search.subjectPhrase) === subjectPhrase)
        .flatMap(search => search.evidence))].slice(0, 3)
      : [];

    const entity = sameText(subjectEntity, text(dna.logical.centralEntity));
    if (entity) signals.push("central_entity");
    const list = Boolean(subjectList && text(pkg.listaId) === subjectList);
    if (list) signals.push("same_list");
    const intent = intentFunnelCompatible(subjectDna, dna);
    if (intent) signals.push("intent_funnel");
    const terms = noteTerms(pkg.keyword);
    const sharedNoteTerms = [...terms].filter(term => note.has(term)).sort();
    if (sharedNoteTerms.length) signals.push("note_terms");
    if (!signals.length) continue;

    const labels = signals.map(signal => signal === "note_terms"
      ? `${SUBJECT_SUGGESTION_SIGNAL_LABELS.note_terms} (${sharedNoteTerms.join(", ")})`
      : SUBJECT_SUGGESTION_SIGNAL_LABELS[signal]);
    const reason = labels.length === 1
      ? `${labels[0][0].toUpperCase()}${labels[0].slice(1)}.`
      : `${labels[0][0].toUpperCase()}${labels[0].slice(1)}; ${labels.slice(1).join("; ")}.`;

    scored.push({
      keywordId,
      keyword: pkg.keyword.trim(),
      signals,
      reason,
      discoveryEvidence,
      sharedNoteTerms,
      alreadyInArticle: Boolean(input.memberKeywordIds?.has(keywordId)),
      rank: [byId ? 1 : 0, byPhrase ? 1 : 0, entity ? 1 : 0, list ? 1 : 0, intent ? 1 : 0, sharedNoteTerms.length],
      sort: normalizeKeyword(pkg.keyword),
    });
  }

  scored.sort((left, right) => {
    for (let index = 0; index < left.rank.length; index += 1) {
      if (left.rank[index] !== right.rank[index]) return right.rank[index] - left.rank[index];
    }
    if (left.sort !== right.sort) return left.sort < right.sort ? -1 : 1;
    return left.keywordId < right.keywordId ? -1 : left.keywordId > right.keywordId ? 1 : 0;
  });

  const limit = typeof input.limit === "number" && input.limit > 0 ? Math.trunc(input.limit) : scored.length;
  return scored.slice(0, limit).map(({ rank: _rank, sort: _sort, ...suggestion }) => {
    void _rank;
    void _sort;
    return suggestion;
  });
}
