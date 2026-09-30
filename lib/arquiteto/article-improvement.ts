import { allocateReinforcementChoices } from "./reinforcement-allocation.ts";
import { intentComparisonKey, type KeywordDnaSignals } from "./keyword-dna-signals.ts";
import { classifySlugFit } from "./published-slug-fit.ts";
import { normalizeKeyword } from "../minerador/keyword-import-core.ts";

export const ARTICLE_IMPROVEMENT_VERSION = 1;
export const ARTICLE_IMPROVEMENT_LABEL = "Melhorar publicados e formar Assuntos";
export type ImprovementKeyword = {
  id: string; keyword: string; volume: number | null; volumeValidated: boolean;
  signals: KeywordDnaSignals; ownerId: string | null; published: boolean;
  territoryRef: string | null; external: boolean;
};
export type ImprovementTarget = {
  id: string; kind: "published" | "subject"; theme: string; note: string | null;
  primaryId: string | null; post: "free" | "locked" | "unknown";
  memberIds: string[]; territoryRef: string | null; slug: string | null;
  url: string | null; canonical: string | null; signals: KeywordDnaSignals;
  siloContext?: { centralEntity: string | null; macroIntent: string | null; slug: string | null };
};
/** Evidence is supplied by the canonical cache reader, never inferred from volume. */
export type ImprovementEvidence = {
  targetId: string; keywordId: string; complete: boolean;
  sharedPages: number; contradiction: boolean; anchorConclusive: boolean;
};
export type ImprovementProposal = {
  targetId: string; kind: ImprovementTarget["kind"]; theme: string;
  currentPrimaryId: string | null; principalId: string | null; memberIds: string[];
  addIds: string[]; removeIds: string[]; transfers: string[];
  angle: string; exclusions: string[]; reasons: string[];
  status: "ready" | "adequate" | "insufficient_evidence" | "no_alternative";
  evidenceBasis: "serp" | "editorial_and_candidate_serp" | null;
};
const key = (value: string | null | undefined) => normalizeKeyword(value ?? "");
const knownEqual = (a: string | null, b: string | null) => Boolean(a && b && key(a) === key(b));
// This alias only normalizes an editorial concept in the clinical context. It
// is not enough to establish SERP compatibility or distinct coverage.
const clinicalConcept = (v: string | null) => key(v).replace(/captar clientes|atrair clientes|atrair pacientes|captar pacientes|captacao de pacientes|captacao de clientes/g, "captacao pacientes");
const unknown = (v: string | null) => !v || /indetermin|pendente|amb.gu|n.o definido/i.test(v);

const SLUG_STOPWORDS = new Set(["de", "da", "do", "das", "dos", "para", "com", "sem", "e", "o", "a", "os", "as", "em", "no", "na", "um", "uma", "como", "que", "por", "vs"]);
const slugWords = (value: string) => key(value).split(/[^a-z0-9]+/).filter(word => word.length > 2 && !SLUG_STOPWORDS.has(word)).map(word => word.replace(/s$/, ""));
/**
 * Without shared Google pages, a new principal must cover the subject the
 * published slug promises: at least 3/4 of its content words. "agência de
 * marketing" does not cover agencia-de-marketing-para-cosmeticos (no
 * "cosméticos"), even though all its words are inside the slug.
 */
export function coversSlugSubject(slug: string | null, keyword: string): boolean {
  const last = (slug ?? "").split("/").filter(Boolean).at(-1) ?? "";
  const required = [...new Set(slugWords(last.replace(/-/g, " ")))];
  if (!required.length) return false;
  const present = new Set(slugWords(keyword));
  return required.filter(word => present.has(word)).length / required.length >= 0.75;
}

/** A structured editorial match needs entity plus problem, audience or outcome. */
export function improvementEditorialFit(target: ImprovementTarget, candidate: ImprovementKeyword): { fits: boolean; reason: string; conflict?: boolean; conflictKind?: "intent" } {
  if (target.kind === "published" && classifySlugFit(target.slug ?? "", candidate.keyword).fit === "contradicts") return { fits: false, conflict: true, reason: "A candidata contradiz a entidade do slug publicado." };
  const a = target.signals, b = candidate.signals;
  const intentA = intentComparisonKey(a.intent), intentB = intentComparisonKey(b.intent);
  if (a.audience && b.audience && !knownEqual(a.audience, b.audience)) return { fits: false, conflict: true, reason: "Públicos distintos no DNA; não há evidência para reuni-los." };
  const restrictive = /sem (anuncios|redes sociais|trafego pago)|organico|gratuito/;
  const aRestriction = key(`${target.theme} ${target.note ?? ""} ${a.modifiers.join(" ")}`).match(restrictive)?.[0];
  if (aRestriction && /trafego pago|anuncios pagos/.test(key(candidate.keyword)) && !key(candidate.keyword).includes("sem")) return { fits: false, conflict: true, reason: "A candidata contraria a restrição editorial do tema." };
  if (!unknown(intentA) && !unknown(intentB) && intentA !== intentB && a.semanticState === "conclusive" && b.semanticState === "conclusive") return { fits: false, conflict: true, conflictKind: "intent", reason: "Intenções conclusivas divergentes no DNA." };
  const clinical = /clinica|pacientes|consultorio/.test(key(`${target.theme} ${a.audience ?? ""}`));
  const sameConcept = (left: string | null, right: string | null) => Boolean(left && right && (knownEqual(left, right) || clinical && clinicalConcept(left) === clinicalConcept(right)));
  const entity = sameConcept(a.centralEntity, b.centralEntity);
  const need = sameConcept(a.perceivedProblem, b.perceivedProblem) || sameConcept(a.desiredResult, b.desiredResult);
  return { fits: entity && need, reason: entity && need ? "Entidade e necessidade coincidem no DNA; validar a SERP da candidata." : "O DNA ainda não demonstra entidade e necessidade compatíveis." };
}

/** Used for risk detection only. It does not decide semantic grouping. */
function collisionKey(target: ImprovementTarget): string {
  return key(target.theme).replace(/captar clientes|captacao de clientes|atrair pacientes|captar pacientes/g, "captacao pacientes");
}
const angleOf = (candidate: ImprovementKeyword | undefined) => candidate
  ? [candidate.signals.perceivedProblem, ...candidate.signals.modifiers, candidate.signals.desiredResult].filter(Boolean).map(String).join(" · ") || candidate.keyword
  : "";

/** One allocator, whole brand, no ownership granted to discarded proposals. */
export function planArticleImprovements(input: {
  targets: readonly ImprovementTarget[]; keywords: readonly ImprovementKeyword[]; evidence: readonly ImprovementEvidence[];
}): ImprovementProposal[] {
  const byId = new Map(input.keywords.map(k => [k.id, k]));
  const observations = new Map(input.evidence.map(e => [`${e.targetId}:${e.keywordId}`, e]));
  const eligible = input.targets.flatMap(target => input.keywords.flatMap(candidate => {
    if (candidate.published || !candidate.volumeValidated || !(candidate.volume! > 0) || (candidate.ownerId && candidate.ownerId !== target.id)) return [];
    const evidence = observations.get(`${target.id}:${candidate.id}`);
    if (evidence?.contradiction) return [];
    const editorial = improvementEditorialFit(target, candidate);
    // The canonical rule gives direct agreement of 3+ SERP pages precedence
    // over a derived intent label, while identity/editorial restrictions remain.
    if (editorial.conflict && !(editorial.conflictKind === "intent" && evidence?.complete && evidence.sharedPages >= 3)) return [];
    if (!editorial.fits && !(evidence && evidence.sharedPages >= 3)) return [];
    // Complete market evidence is mandatory for final approval. The weaker old
    // phrase is not an obligatory overlap anchor when it has no demand.
    if (!evidence?.complete) return [];
    const old = target.primaryId ? byId.get(target.primaryId) : null;
    // Without shared pages, the page itself must vouch: the candidate has to fit
    // the published slug ("agência de marketing" does not fit a cosmetics page).
    const fitsSlug = target.kind !== "published" || coversSlugSubject(target.slug, candidate.keyword);
    const fallback = !old?.volumeValidated && !evidence.anchorConclusive && editorial.fits && fitsSlug;
    if (evidence.sharedPages < 2 && !fallback && target.kind !== "subject") return [];
    return [{ targetId: target.id, keywordId: candidate.id, tier: evidence.sharedPages >= 3 ? 0 : 1, score: evidence.sharedPages + (editorial.fits ? 2 : 0), volume: candidate.volume! }];
  }));
  const fixed = new Map<string, string>();
  for (const t of input.targets) for (const id of t.memberIds) {
    const candidate = byId.get(id);
    // The published identity and confirmed primary remain protected. Weak
    // supports may be replaced in the preview; never transferred silently.
    const proof = observations.get(`${t.id}:${id}`);
    const fit = candidate ? improvementEditorialFit(t, candidate) : null;
    const fitting = candidate && (!fit?.conflict || fit.conflictKind === "intent" && proof?.complete && proof.sharedPages >= 3) && !proof?.contradiction;
    if (candidate?.published || id === t.primaryId || (fitting && candidate?.volumeValidated && candidate.volume! > 0)) fixed.set(id, t.id);
  }
  const owners = allocateReinforcementChoices({
    targets: input.targets.map(t => ({ id: t.id, capacity: Math.max(0, 6 - [...fixed.values()].filter(id => id === t.id).length), priority: (byId.get(t.primaryId ?? "")?.volumeValidated ? 10 : 0) + (t.kind === "published" ? 0 : 1) })),
    edges: eligible, fixed,
  });
  const proposals = input.targets.map(target => {
    const kept = target.memberIds.filter(id => fixed.get(id) === target.id);
    const added = [...owners].filter(([id, owner]) => owner === target.id && !kept.includes(id)).map(([id]) => id);
    const candidates = [...kept, ...added].filter(id => eligible.some(e => e.targetId === target.id && e.keywordId === id)).map(id => byId.get(id)!).sort((a, b) => (eligible.find(e => e.targetId === target.id && e.keywordId === a.id)?.tier ?? 2) - (eligible.find(e => e.targetId === target.id && e.keywordId === b.id)?.tier ?? 2) || b.volume! - a.volume!);
    const old = byId.get(target.primaryId ?? "");
    const needsPrimary = (target.kind === "subject" || target.post === "free") && (!old?.volumeValidated || (candidates[0]?.volume ?? 0) > (old.volume ?? 0));
    const principalId = needsPrimary ? candidates[0]?.id ?? target.primaryId : target.primaryId;
    // Avoid churn: a weak support leaves only when there is a real replacement.
    const weak = target.memberIds.filter(id => !kept.includes(id));
    const removeIds = added.length ? weak.slice(0, Math.max(0, target.memberIds.length + added.length - 6)) : [];
    const members = [...new Set([...target.memberIds.filter(id => !removeIds.includes(id)), ...added])];
    const proof = principalId ? observations.get(`${target.id}:${principalId}`) : null;
    const reasons = [target.kind === "published" ? "URL, slug, canonical e Silo publicados preservados." : "Assunto declarado mantido como fundamento, fora das seis keywords."];
    if (target.post === "unknown" && target.kind === "published") reasons.push("Posto não declarado: principal atual preservada; só apoios podem entrar.");
    if (principalId && principalId !== target.primaryId) reasons.push(proof && proof.sharedPages < 2 ? "Nova principal sustentada pelo fundamento editorial e pela SERP completa da candidata; não por coincidência com a frase antiga." : "Principal com demanda medida e compatibilidade de SERP.");
    return { targetId: target.id, kind: target.kind, theme: target.theme, currentPrimaryId: target.primaryId, principalId, memberIds: members, addIds: added, removeIds, transfers: added.filter(id => byId.get(id)?.territoryRef !== target.territoryRef), angle: angleOf(byId.get(principalId ?? "")), exclusions: [], reasons,
      status: !target.territoryRef ? "insufficient_evidence" : (added.length || principalId !== target.primaryId) && principalId ? "ready" : old?.volumeValidated ? "adequate" : eligible.some(e => e.targetId === target.id) ? "no_alternative" : "insufficient_evidence",
      evidenceBasis: added.length || principalId !== target.primaryId ? proof && proof.sharedPages >= 2 ? "serp" : "editorial_and_candidate_serp" : null,
    } as ImprovementProposal;
  });
  // Do not present synonym changes as a solution to cannibalization. A pair
  // needs different evidenced coverage, with explicit reciprocal exclusions.
  for (let i = 0; i < proposals.length; i++) for (let j = i + 1; j < proposals.length; j++) {
    const a = proposals[i], b = proposals[j];
    if (a.kind !== "published" || b.kind !== "published") continue;
    const ta = input.targets[i], tb = input.targets[j];
    if (collisionKey(ta) !== collisionKey(tb) && !(knownEqual(ta.signals.centralEntity, tb.signals.centralEntity) && knownEqual(ta.signals.perceivedProblem, tb.signals.perceivedProblem) && knownEqual(ta.signals.intent, tb.signals.intent))) continue;
    if (!a.angle || !b.angle || key(a.angle) === key(b.angle) || key(a.angle).replace(/captar clientes|atrair pacientes/g, "captacao") === key(b.angle).replace(/captar clientes|atrair pacientes/g, "captacao")) {
      for (const p of [a, b]) { p.status = "insufficient_evidence"; p.reasons.push("Risco de canibalização: ainda falta uma cobertura distinta sustentada por dados. A troca de sinônimos não resolve."); }
    } else {
      a.exclusions.push(b.angle); b.exclusions.push(a.angle);
      a.reasons.push(`Diferenciar de “${b.theme}”: não cobrir ${b.angle}.`);
      b.reasons.push(`Diferenciar de “${a.theme}”: não cobrir ${a.angle}.`);
    }
  }
  return proposals;
}
