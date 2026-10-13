import { ArticleDNASchema, type ArticleDNA, type DeclaredSubject } from "./contracts.ts";
import { applyDeclaredPlanToArticleDna } from "./declared-plan-formation.ts";
import { planSubjectAttachment, readArchitectSubjectStandings, sameDeclaredSubject, type ArchitectSubjectStanding } from "./declared-subject.ts";

/**
 * ===== ATUALIZAR O ASSUNTO DO ARTIGO (CONVERSÃO) — DOMÍNIO PURO =====
 *
 * SDD `docs/compartilhado/sdd-conversao-assunto-legado-2026-10-13.md` §7.
 *
 * Depois que o Minerador converteu o Assunto (a keyword K passou a carregá-lo,
 * com o bloco `keyword_subject_conversion` apontando para a linha-título T) e K
 * foi reaprovada e reenviada, o artigo cujo `subject` aponta para T ganha uma
 * VERSÃO NOVA com `subject` = K (pacote de K), o plano aplicado (papel e
 * promessa) e a referência do pacote de K atualizada quando K é membro.
 *
 * Não é "soltar e prender": a troca de T por K é UMA versão (a regra "um
 * Assunto por unidade" continua). As versões anteriores ficam no histórico;
 * mesmo Assunto do mesmo pacote = sem versão nova. Domínio puro: sem rede,
 * sem storage; quem grava é o servidor, pelo writer e pelas guardas de sempre.
 */

type RecordLike = Record<string, unknown>;

export type SubjectConversionArticle = { entityId: string; versionId: string; versionNumber: number; contentHash: string; payload: ArticleDNA };

export type PendingSubjectConversion = {
  articleId: string;
  versionId: string;
  versionNumber: number;
  contentHash: string;
  fromKeywordId: string;
  fromPhrase: string;
  toKeywordId: string;
  toPhrase: string;
  /** `ready` = pode gravar; `blocked` = o motivo diz o que falta. */
  state: "ready" | "blocked";
  reason: string | null;
  /** A versão nova pronta (só com `ready`). */
  next: ArticleDNA | null;
  /** O que muda, em frases curtas, para a prévia. */
  changes: string[];
};

export type SubjectReanchorResult =
  | { ok: true; value: ArticleDNA; changed: boolean; changes: string[] }
  | { ok: false; reason: string };

/**
 * Troca o Assunto do artigo da linha-título T para a keyword K, numa versão só.
 *
 * Exige: o `subject` vigente é T (ou já é K — então é idempotente); K não é
 * secundária nem reforço; o plano de K (quando há) é aplicado sem contradizer a
 * principal travada. A referência de K em `keywordReferences` passa a citar o
 * pacote aprovado novo.
 */
export function reanchorSubjectOnArticleDna(article: ArticleDNA, input: {
  fromKeywordId: string;
  subject: DeclaredSubject;
  standing: Pick<ArchitectSubjectStanding, "plan" | "keywordId" | "planLock">;
}): SubjectReanchorResult {
  const atual = article.subject ?? null;
  if (atual && atual.keywordId === input.subject.keywordId) {
    if (sameDeclaredSubject(atual, input.subject)) return { ok: true, value: article, changed: false, changes: [] };
  } else if (!atual || atual.keywordId !== input.fromKeywordId) {
    return { ok: false, reason: "O Assunto vigente do artigo não é a linha-título convertida; nada a trocar." };
  }
  const apoio = new Set([...article.secondaryKeywordIds, ...article.narrativeReinforcementIds]);
  if (apoio.has(input.subject.keywordId)) {
    return { ok: false, reason: "A keyword que carrega o Assunto é secundária ou reforço deste artigo: o Assunto não pode ser apoio do mesmo artigo. Converta pela principal e use \"Melhorar artigos\" para promover outra keyword." };
  }
  const changes: string[] = [];
  if (!atual || atual.keywordId !== input.subject.keywordId) changes.push(`Assunto: “${atual?.phrase ?? "—"}” passa a morar na keyword “${input.standing.plan?.declaredPrincipal?.phrase ?? input.subject.keywordId}”.`);
  if (atual && atual.phrase !== input.subject.phrase) changes.push(`Título do Assunto: “${atual.phrase}” → “${input.subject.phrase}”.`);
  const references = article.keywordReferences.map(reference => reference.keywordId === input.subject.keywordId
    ? { ...reference, approvedPackageRef: input.subject.approvedPackageRef }
    : reference);
  let next: ArticleDNA = { ...article, subject: input.subject, keywordReferences: references };
  const comPlano = applyDeclaredPlanToArticleDna(next, input.standing);
  if (!comPlano.ok) return { ok: false, reason: comPlano.reason };
  if (comPlano.changed) {
    if (comPlano.value.hierarchy !== article.hierarchy) changes.push(`Papel: ${article.hierarchy} → ${comPlano.value.hierarchy} (plano do grupo).`);
    if (comPlano.value.promise !== article.promise) changes.push("Promessa: passa a ser os detalhes do Assunto no plano.");
  }
  next = comPlano.value;
  const parsed = ArticleDNASchema.safeParse(next);
  if (!parsed.success) return { ok: false, reason: `O ArticleDNA recusou a troca: ${parsed.error.issues[0]?.message || "campo inválido"}.` };
  return { ok: true, value: parsed.data, changed: true, changes };
}

/**
 * As conversões pendentes da mesa: cada artigo vigente cujo `subject` aponta
 * para uma linha-título T que alguma keyword RECEBIDA (K) agora carrega, com o
 * bloco de conversão para ESTE artigo (ou sem artigo marcado). Monta a versão
 * nova pelo mesmo `planSubjectAttachment` da guarda do servidor.
 */
export function pendingSubjectConversions(input: {
  brandId: string;
  actorUserId: string;
  attachedAt: string;
  articles: readonly SubjectConversionArticle[];
  keywords: readonly RecordLike[];
}): PendingSubjectConversion[] {
  const standings = readArchitectSubjectStandings(input.keywords);
  const rowById = new Map(input.keywords.map(row => [String(row.id ?? ""), row]));
  const portadores = new Map<string, ArchitectSubjectStanding[]>();
  for (const standing of standings.values()) {
    if (!standing.conversion || !standing.declared || standing.brandId !== input.brandId) continue;
    const lista = portadores.get(standing.conversion.fromKeywordId) ?? [];
    lista.push(standing);
    portadores.set(standing.conversion.fromKeywordId, lista);
  }
  const out: PendingSubjectConversion[] = [];
  for (const article of input.articles) {
    const payload = article.payload;
    if (payload.brandId !== input.brandId || !payload.subject) continue;
    const doArtigo = (standing: ArchitectSubjectStanding) => !standing.conversion!.articleId || standing.conversion!.articleId === payload.articleId;
    // O artigo já convertido (subject = K com o mesmo pacote) não é pendência; com pacote novo de K, é atualização.
    const candidatos = [
      ...(portadores.get(payload.subject.keywordId) ?? []),
      ...[...standings.values()].filter(standing => standing.keywordId === payload.subject!.keywordId && standing.conversion && standing.declared),
    ].filter(doArtigo);
    const k = candidatos[0];
    if (!k) continue;
    const fromKeywordId = k.conversion!.fromKeywordId;
    const base = {
      articleId: payload.articleId, versionId: article.versionId, versionNumber: article.versionNumber, contentHash: article.contentHash,
      fromKeywordId, fromPhrase: k.conversion!.fromPhrase, toKeywordId: k.keywordId, toPhrase: k.plan?.declaredPrincipal?.phrase ?? String(rowById.get(k.keywordId)?.keyword ?? k.keywordId),
    };
    const anexo = planSubjectAttachment({
      brandId: input.brandId,
      keyword: rowById.get(k.keywordId) ?? {},
      actorUserId: input.actorUserId,
      attachedAt: input.attachedAt,
      target: {
        principalKeywordId: payload.principalKeywordId,
        keywords: payload.keywordReferences.map(reference => ({ keywordId: reference.keywordId, role: reference.role })),
        excludedSubjects: payload.excludedSubjects,
      },
    });
    if (!anexo.ok) { out.push({ ...base, state: "blocked", reason: anexo.reason, next: null, changes: [] }); continue; }
    const troca = reanchorSubjectOnArticleDna(payload, { fromKeywordId, subject: anexo.subject, standing: k });
    if (!troca.ok) { out.push({ ...base, state: "blocked", reason: troca.reason, next: null, changes: [] }); continue; }
    if (!troca.changed) continue;
    out.push({ ...base, state: "ready", reason: null, next: troca.value, changes: troca.changes });
  }
  return out.sort((left, right) => left.articleId < right.articleId ? -1 : left.articleId > right.articleId ? 1 : 0);
}
