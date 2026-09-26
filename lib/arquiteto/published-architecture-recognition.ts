import type { ArchitectureWorkingProposal } from "./architecture-working-proposal.ts";
import type { EditorialUnitDeclaration } from "./contracts.ts";
import { normalizePublishedAddress, publishedPageIdentityOf, publishedPathKey } from "./published-silo-membership.ts";
import type { BatchSiloDecision } from "./silo-decision-batch.ts";
import type { TerritoryCandidate } from "./territory.ts";

/** Only facts already declared by the published site enter the first processing pass. */
export function planPublishedArchitectureRecognition(input: {
  brandId: string;
  proposal: ArchitectureWorkingProposal;
  declarations: ReadonlyMap<string, EditorialUnitDeclaration>;
  siloHeadByArticle: ReadonlyMap<string, string>;
  territoryRefOf: (siloKey: string) => string | null;
  territoryOf: (territoryRef: string) => TerritoryCandidate | undefined;
}): { territoryRefs: string[]; decisions: BatchSiloDecision[]; conflicts: string[] } {
  const heads = new Map<string, { siloKey: string; territoryRef: string }>();
  const conflicts: string[] = [];
  const decisions: BatchSiloDecision[] = [];

  for (const assignment of input.proposal.assignments.filter(item => item.declaredBy === "published_silo_head")) {
    const declaration = input.declarations.get(assignment.keywordId);
    const identity = declaration?.source === "published" && declaration.unit === "silo"
      ? publishedPageIdentityOf({ url: declaration.url, canonical: declaration.canonical }) : null;
    const territoryRef = input.territoryRefOf(assignment.siloKey);
    const territory = territoryRef ? input.territoryOf(territoryRef) : undefined;
    const matchingPath = identity && territory
      && publishedPathKey(territory.slugState.publishedSlug) === publishedPathKey(identity.slug);
    const currentCanonical = normalizePublishedAddress(territory?.slugState.publishedCanonical);
    const declaredCanonical = normalizePublishedAddress(identity?.canonical);
    const matchingCanonical = !declaredCanonical || Boolean(currentCanonical
      && currentCanonical.host === declaredCanonical.host && currentCanonical.path === declaredCanonical.path);
    if (!identity || !territoryRef || !territory || territory.brandId !== input.brandId
      || territory.publicationProtection !== "protected" || !matchingPath || !matchingCanonical) {
      conflicts.push(`${assignment.keywordId}: Silo publicado sem identidade protegida e endereço coincidente.`);
      continue;
    }
    if ([...heads.values()].some(item => item.territoryRef === territoryRef)) {
      conflicts.push(`${assignment.keywordId}: duas cabeças publicadas apontam para o mesmo Silo.`);
      continue;
    }
    heads.set(assignment.keywordId, { siloKey: assignment.siloKey, territoryRef });
    decisions.push({ keywordId: assignment.keywordId, target: { kind: "territory", territoryRef }, declaredBySite: true });
  }

  for (const assignment of input.proposal.assignments.filter(item => item.declaredBy === "published_url")) {
    const headId = input.siloHeadByArticle.get(assignment.keywordId);
    const head = headId ? heads.get(headId) : undefined;
    if (!head || head.siloKey !== assignment.siloKey) {
      conflicts.push(`${assignment.keywordId}: o Silo do artigo publicado não foi resolvido de forma inequívoca.`);
      continue;
    }
    decisions.push({ keywordId: assignment.keywordId, target: { kind: "territory", territoryRef: head.territoryRef }, declaredBySite: true });
  }

  return { territoryRefs: [...new Set([...heads.values()].map(item => item.territoryRef))], decisions, conflicts };
}
