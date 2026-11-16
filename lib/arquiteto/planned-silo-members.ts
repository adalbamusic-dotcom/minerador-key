import { plannedSiloSourceIsCurrent, type PlannedSiloCurrentSource, type PlannedSiloSourceRef, type PlannedSiloSubjectProof } from "./planned-silo-member.ts";

/** Leitura estrita da composição planejada; não grava nem escolhe artigos. */
export type PlannedSiloMember = {
  memberKey: string;
  anchorKind: "subject_keyword" | "existing_article";
  anchorId: string;
  role: "Pilar" | "Suporte";
  order: number;
};

export type PlannedSiloArticle = {
  versionId: string;
  contentHash: string;
  /** Corrente deve ser determinado pela autoridade do workspace, não pelo navegador. */
  current: boolean;
  effectiveStatus: string | null;
  payload: {
    brandId: string;
    articleId: string;
    siloId: string | null;
    hierarchy: string;
    subject?: { keywordId: string } | null;
    keywordReferences: readonly { keywordId: string }[];
    siloMembershipRef?: { siloDnaVersionId: string; siloDnaContentHash: string; memberKey: string };
  };
};

export type PlannedSiloResolution =
  | { ok: true; members: { member: PlannedSiloMember; article: PlannedSiloArticle }[] }
  | { ok: false; reasons: string[] };

/**
 * Exige par aprovado e corrente e um único ArticleDNA aprovado e corrente por
 * âncora, ligado à versão/hash da estrutura. Não usa nome ou slug como chave.
 */
export function resolvePlannedSiloMembers(input: {
  brandId: string;
  silo: { versionId: string; contentHash: string; effectiveStatus: string | null; current: boolean;
    payload: { brandId: string; siloId: string; compositionBasis?: string; compositionSourceRef?: PlannedSiloSourceRef; plannedMembers?: readonly PlannedSiloMember[]; keywordPackageRefs?: readonly PlannedSiloSubjectProof[] } };
  page: { effectiveStatus: string | null; current: boolean; payload: { brandId: string; siloId: string; compositionBasis?: string; plannedMemberKeys?: readonly string[];
    siloDnaRef: { versionId: string; contentHash: string; entityId: string } } };
  articles: readonly PlannedSiloArticle[];
  sourceCurrent: PlannedSiloCurrentSource | null;
}): PlannedSiloResolution {
  const { brandId, silo, page } = input;
  const reasons: string[] = [];
  const members = silo.payload.plannedMembers ?? [];
  if (!brandId || silo.payload.brandId !== brandId || page.payload.brandId !== brandId) reasons.push("O Silo e a página precisam pertencer à marca ativa.");
  if (!silo.current || silo.effectiveStatus !== "approved" || !page.current || page.effectiveStatus !== "approved") reasons.push("A estrutura e a página do Silo precisam estar vigentes e aprovadas.");
  if (!plannedSiloSourceIsCurrent({ brandId, source: silo.payload.compositionSourceRef, expectedSubjectProofs: silo.payload.keywordPackageRefs, current: input.sourceCurrent })) reasons.push("O plano ou os Assuntos de origem do Silo mudaram ou não puderam ser confirmados.");
  if (silo.payload.compositionBasis !== "planned_members" || page.payload.compositionBasis !== "planned_members" || silo.payload.siloId !== page.payload.siloId || page.payload.siloDnaRef.versionId !== silo.versionId || page.payload.siloDnaRef.contentHash !== silo.contentHash || page.payload.siloDnaRef.entityId !== silo.payload.siloId) reasons.push("A página não corresponde à versão aprovada da estrutura do Silo.");
  const keys = members.map(member => member.memberKey);
  const pageKeys = page.payload.plannedMemberKeys ?? [];
  const identity = (member: PlannedSiloMember) => JSON.stringify([brandId, member.anchorKind, member.anchorId]);
  if (!members.length || members.some((member, index) => !member.anchorId || !Number.isSafeInteger(member.order) || member.order < 1 || (index > 0 && members[index - 1].order >= member.order) || !["subject_keyword", "existing_article"].includes(member.anchorKind) || !["Pilar", "Suporte"].includes(member.role)) || new Set(keys).size !== keys.length || new Set(members.map(identity)).size !== members.length || members.some(member => member.memberKey !== identity(member)) || members.filter(member => member.role === "Pilar").length !== 1 || new Set(members.map(member => member.order)).size !== members.length || pageKeys.length !== keys.length || pageKeys.some((key, index) => key !== keys[index])) reasons.push("A composição planejada do Silo é incompleta ou ambígua.");

  const resolved: { member: PlannedSiloMember; article: PlannedSiloArticle }[] = [];
  for (const member of members) {
    const matching = input.articles.filter(article => article.current && article.payload.brandId === brandId && article.payload.siloMembershipRef?.memberKey === member.memberKey);
    if (matching.length !== 1) {
      reasons.push(`O membro ${member.memberKey} precisa ter exatamente um artigo vigente nesta marca.`);
      continue;
    }
    const article = matching[0];
    const ref = article.payload.siloMembershipRef!;
    const anchorMatches = member.anchorKind === "existing_article" ? article.payload.articleId === member.anchorId
      : article.payload.subject?.keywordId ? article.payload.subject.keywordId === member.anchorId
        : article.payload.keywordReferences.some(item => item.keywordId === member.anchorId);
    if (article.effectiveStatus !== "approved" || article.payload.siloId !== silo.payload.siloId || article.payload.hierarchy !== member.role || ref.siloDnaVersionId !== silo.versionId || ref.siloDnaContentHash !== silo.contentHash || !anchorMatches) {
      reasons.push(`O membro ${member.memberKey} não corresponde a um artigo aprovado e vinculado à estrutura atual.`);
      continue;
    }
    resolved.push({ member, article });
  }
  // A single ArticleDNA cannot satisfy two members, even if an inconsistent
  // snapshot claims that two versions of the same article are current.
  if (new Set(resolved.map(item => item.article.payload.articleId)).size !== resolved.length || new Set(resolved.map(item => item.article.versionId)).size !== resolved.length) {
    reasons.push("Um artigo vigente não pode ocupar mais de uma posição no Silo.");
  }
  return reasons.length ? { ok: false, reasons } : { ok: true, members: resolved };
}
