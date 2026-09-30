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
  /** `list_core`: leitura da lista pelo código (núcleo do slug), depois da IA. */
  evidenceBasis: "serp" | "editorial_and_candidate_serp" | "editorial_ai" | "list_core" | null;
  /** Em `editorial_ai` e `list_core`: a frase de motivo de cada keyword que entrou. */
  aiReasons?: { keywordId: string; reason: string }[];
  /** A composição escolhida pela IA ainda não tem as quatro lentes no cache: passo 2 (pago, com prévia). */
  needsValidation?: boolean;
};
/**
 * Uma escolha da IA já conferida pelas barreiras do código (a IA tem a menor
 * autoridade). `rank` é a ordem de preferência dela para o alvo (0 = primeira).
 */
export type ImprovementEditorialPick = { targetId: string; keywordId: string; role: "principal" | "secundaria"; reason: string; rank: number };
export const IMPROVEMENT_AI_LABEL = "Leitura da IA — confira";
export const IMPROVEMENT_LIST_CORE_LABEL = "Lista · núcleo do slug";
/** Composição escolhida na lista (IA ou código), sem par da SERP: o parecer da composição decide antes de gravar. */
export const isListReading = (p: Pick<ImprovementProposal, "evidenceBasis">) => p.evidenceBasis === "editorial_ai" || p.evidenceBasis === "list_core";
/** No máximo 3 keywords da lista por alvo; o artigo nunca passa de 6. */
export const IMPROVEMENT_AI_MAX_PER_TARGET = 3;
export const IMPROVEMENT_ARTICLE_MAX_KEYWORDS = 6;
const key = (value: string | null | undefined) => normalizeKeyword(value ?? "");
const knownEqual = (a: string | null, b: string | null) => Boolean(a && b && key(a) === key(b));
// This alias only normalizes an editorial concept in the clinical context. It
// is not enough to establish SERP compatibility or distinct coverage.
const clinicalConcept = (v: string | null) => key(v).replace(/captar clientes|atrair clientes|atrair pacientes|captar pacientes|captacao de pacientes|captacao de clientes/g, "captacao pacientes");
const unknown = (v: string | null) => !v || /indetermin|pendente|amb.gu|n.o definido/i.test(v);

const SLUG_STOPWORDS = new Set(["de", "da", "do", "das", "dos", "para", "com", "sem", "e", "o", "a", "os", "as", "em", "no", "na", "um", "uma", "como", "que", "por", "vs"]);
export const slugWords = (value: string) => key(value).split(/[^a-z0-9]+/).filter(word => word.length > 2 && !SLUG_STOPWORDS.has(word)).map(word => word.replace(/s$/, ""));
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

/** Uma cabeça genérica (até 2 palavras de conteúdo) acima disso não se ranqueia com uma página de nicho. */
export const BROAD_HEAD_MAX_VOLUME = 5000;
const SLUG_SPLITTERS = new Set(["para", "sem", "vs", "com"]);
/**
 * O núcleo do assunto do slug: as duas últimas palavras de conteúdo antes do
 * público/nicho ("para …", "sem …"). checklist-de-plano-de-marketing-para-
 * clinica-de-estetica → plano, marketing; como-atrair-pacientes-para-clinica →
 * atrair, paciente.
 */
export function slugCoreWords(slug: string | null): string[] {
  const last = (slug ?? "").split("/").filter(Boolean).at(-1) ?? "";
  const tokens = key(last.replace(/-/g, " ")).split(/[^a-z0-9]+/).filter(Boolean);
  const cut = tokens.findIndex(token => SLUG_SPLITTERS.has(token));
  const left = (cut > 0 ? tokens.slice(0, cut) : tokens).join(" ");
  return slugWords(left).slice(-2);
}
/**
 * Decisão do dono (2026-09-30): publicado Livre sem volume pode ganhar uma
 * principal MAIS AMPLA com volume, desde que ela leve o núcleo do assunto do
 * slug. Cabeça genérica de 2 palavras com volume enorme ("agência de
 * marketing", 18.100) continua fora: a página de nicho não ranqueia nela.
 */
export function carriesSlugCore(slug: string | null, candidate: Pick<ImprovementKeyword, "keyword" | "volume">): boolean {
  const core = slugCoreWords(slug);
  if (!core.length) return false;
  const words = new Set(slugWords(candidate.keyword));
  if (!core.every(word => words.has(word))) return false;
  const broadHead = words.size <= 2 && (candidate.volume ?? 0) > BROAD_HEAD_MAX_VOLUME;
  return !broadHead;
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

/*
 * LEITURA EDITORIAL DA IA NA LISTA (decisão do dono, 2026-09-30).
 * A IA só sugere; estas barreiras decidem. Nenhuma depende da SERP: a SERP
 * volta a valer no parecer da composição final, antes de gravar.
 */
const CORE_ALIASES: Record<string, string> = { atrair: "captar", captacao: "captar", conquistar: "captar", conseguir: "captar", ganhar: "captar", paciente: "cliente" };
const NICHE_ALIASES: Record<string, string> = { consultorio: "clinica" };
const aliased = (words: readonly string[], aliases: Record<string, string>) => new Set(words.map(word => aliases[word] ?? word));
/** O público/nicho declarado depois de "para": "marketing para veterinários" → veterinario. */
function nicheWords(value: string): Set<string> {
  const tokens = key(value.replace(/[-/]/g, " ")).split(/[^a-z0-9]+/).filter(Boolean);
  const at = tokens.indexOf("para");
  return at < 0 ? new Set() : aliased(slugWords(tokens.slice(at + 1).join(" ")), NICHE_ALIASES);
}
/*
 * Busca local (caso real, 2026-09-30): "agência de marketing em são paulo"
 * entrou em "agência de marketing para clínica de estética". Quem busca pela
 * cidade quer um fornecedor ali; não é o público do artigo.
 */
const LOCAL_PLACES = /\b(sao paulo|rio de janeiro|belo horizonte|porto alegre|curitiba|brasilia|salvador|recife|fortaleza|campinas|goiania|florianopolis|manaus|belem|vitoria|natal|joao pessoa|maceio|aracaju|teresina|sao luis|cuiaba|campo grande|londrina|santos|sorocaba|ribeirao preto|uberlandia|osasco|guarulhos|abc|sp|rj|bh|zona (sul|norte|leste|oeste)|perto de mim|proximo a mim)\b/;
function localSearchOf(keyword: string): string | null {
  return key(keyword).match(LOCAL_PLACES)?.[0] ?? null;
}
/** O slug publicado (ou o do Assunto); sem slug, o próprio tema. */
const targetSubjectText = (target: ImprovementTarget) => target.slug ?? target.theme.replace(/\//g, " ");

/** Motivo pelo qual uma keyword da lista NÃO pode entrar no alvo; `null` quando pode. */
export function editorialAiBarrier(target: ImprovementTarget, candidate: ImprovementKeyword): string | null {
  if (candidate.external) return "Keyword fora da lista da marca: recusada.";
  if (candidate.published) return "Keyword já publicada: fica com a própria página.";
  if (!candidate.volumeValidated || !(candidate.volume! > 0)) return "Sem volume validado no Google Ads: nunca entra por leitura da IA.";
  if (candidate.ownerId && candidate.ownerId !== target.id) return "Já pertence a outro ArticleDNA aprovado ou formação decidida.";
  if (target.memberIds.includes(candidate.id)) return "Já está neste artigo.";
  /*
   * SECUNDÁRIA É REFORÇO, NÃO TROCA DE PRINCIPAL (dono, 2026-09-30).
   * As regras de principal (núcleo inteiro do slug, entidade do slug, intenção
   * da Lógica) barravam as escolhas certas da IA: "como captar clientes" por
   * rótulo de intenção, "tráfego orgânico" num artigo "sem tráfego pago" por
   * não levar o núcleo. Aqui ficam só as barreiras duras; a intenção diferente
   * é aviso (D2.3) e as regras de principal valem em `editorialAiPrincipalBlock`.
   */
  const fit = improvementEditorialFit(target, candidate);
  if (fit.conflict && /restrição editorial/.test(fit.reason)) return fit.reason;
  const words = slugWords(candidate.keyword);
  if (new Set(words).size <= 2 && candidate.volume! > BROAD_HEAD_MAX_VOLUME) return `Cabeça genérica (volume ${candidate.volume}): uma página de nicho não ranqueia nela.`;
  const subject = targetSubjectText(target);
  const local = localSearchOf(candidate.keyword);
  if (local && !key(`${target.theme} ${subject.replace(/-/g, " ")}`).includes(local)) return `Busca local (“${local}”): quem busca quer um serviço nessa região, não o assunto deste artigo.`;
  /*
   * Serve quando leva o núcleo inteiro ("como captar clientes") OU divide com o
   * assunto uma palavra que não é só do nicho ("tráfego orgânico" num artigo
   * sem tráfego pago; "sem redes sociais"). Não serve quando só repete o nicho
   * ("clínica de estética facial" é quem procura a clínica) ou pega metade do
   * núcleo com o nicho ("plano de saúde para clínica").
   */
  const assunto = aliased(slugWords(`${target.theme} ${subject.replace(/-/g, " ")}`), CORE_ALIASES);
  const present = aliased(words, CORE_ALIASES);
  const core = aliased(slugCoreWords(subject), CORE_ALIASES);
  const niche = new Set([...nicheWords(subject), ...nicheWords(target.theme)].map(word => CORE_ALIASES[word] ?? word));
  const fullCore = core.size > 0 && [...core].every(word => present.has(word));
  const beyondNiche = [...present].some(word => assunto.has(word) && !core.has(word) && !niche.has(word));
  if (!fullCore && !beyondNiche) return "Só repete o público ou metade do assunto do artigo: outro tema.";
  const candidateNiche = nicheWords(candidate.keyword);
  const targetNiche = new Set([...nicheWords(subject), ...nicheWords(target.theme)]);
  const targetAll = aliased(slugWords(`${target.theme} ${subject.replace(/-/g, " ")}`), NICHE_ALIASES);
  if (candidateNiche.size && targetNiche.size && ![...candidateNiche].some(word => targetNiche.has(word) || targetAll.has(word))) return "Outro nicho declarado na keyword: não é o público deste artigo.";
  return null;
}

/**
 * Principal nova pela leitura da IA: só com Posto Livre, principal atual sem
 * volume, página que não ranqueia (leitura conhecida) e candidata que leva o
 * núcleo do slug. Travado, Posto desconhecido e página que ranqueia ficam.
 */
export function editorialAiPrincipalBlock(target: ImprovementTarget, current: ImprovementKeyword | undefined, candidate: ImprovementKeyword, blocksSwap: boolean | null | undefined): string | null {
  if (target.post === "locked") return "o Posto é Travado";
  if (target.post !== "free") return "o Posto não foi declarado";
  if (current?.volumeValidated) return "a principal atual já tem volume";
  if (target.kind !== "published") return null;
  if (blocksSwap === true) return "a página aparece no Google (página que ranqueia não troca de principal)";
  if (blocksSwap !== false) return "não deu para reler se a página ranqueia";
  if (classifySlugFit(target.slug ?? "", candidate.keyword).fit === "contradicts") return "ela troca a entidade do slug publicado";
  if (!carriesSlugCore(target.slug, candidate) && !coversSlugSubject(target.slug, candidate.keyword)) return "ela não leva o núcleo do slug publicado";
  return null;
}

/** O aviso de SEO quando a principal nova é mais ampla que o slug publicado (mesma frase nos dois caminhos). */
function broaderPrincipalReason(keyword: string): string {
  return `Principal mais ampla, com volume: "${keyword}" leva o núcleo do assunto da página; o nicho do slug continua no texto e a antiga fica como secundária.`;
}
/**
 * Assunto sem principal e sem papel "principal" vindo da IA: a escolha que
 * leva o núcleo do assunto, com mais volume e menos palavras (menos palavras
 * de ligação — "como atrair clientes" antes de "como atrair os clientes"),
 * mantendo o alinhamento principal ↔ slug do conteúdo novo. Empate: a ordem da IA.
 */
function subjectPrincipalPick(target: ImprovementTarget, picks: readonly ImprovementEditorialPick[], byId: ReadonlyMap<string, ImprovementKeyword>): ImprovementEditorialPick | undefined {
  const core = aliased(slugCoreWords(targetSubjectText(target)), CORE_ALIASES);
  const score = (pick: ImprovementEditorialPick) => {
    const candidate = byId.get(pick.keywordId)!;
    const present = aliased(slugWords(candidate.keyword), CORE_ALIASES);
    return { core: [...core].every(word => present.has(word)) ? 1 : 0, volume: candidate.volume ?? 0, words: key(candidate.keyword).split(/\s+/).filter(Boolean).length };
  };
  return [...picks].sort((a, b) => {
    const x = score(a), y = score(b);
    return y.core - x.core || y.volume - x.volume || x.words - y.words || a.rank - b.rank;
  })[0];
}

function editorialAiProposal(target: ImprovementTarget, picks: readonly ImprovementEditorialPick[], byId: ReadonlyMap<string, ImprovementKeyword>, blocksSwap: boolean | null | undefined, basis: "editorial_ai" | "list_core" = "editorial_ai"): ImprovementProposal {
  const current = target.primaryId ? byId.get(target.primaryId) : undefined;
  const reasons = [target.kind === "published" ? "URL, slug, canonical e Silo publicados preservados." : "Assunto declarado mantido como fundamento, fora das seis keywords."];
  const wanted = picks.find(pick => pick.role === "principal");
  // Assunto sem principal precisa de uma: a que leva o núcleo, com mais volume e menos palavras.
  const chosen = wanted ?? (!target.primaryId ? subjectPrincipalPick(target, picks, byId) : undefined);
  let principalId = target.primaryId;
  if (chosen) {
    const candidate = byId.get(chosen.keywordId)!;
    const block = editorialAiPrincipalBlock(target, current, candidate, blocksSwap);
    if (!block) principalId = candidate.id;
    else if (wanted && basis === "editorial_ai") reasons.push(`A IA sugeriu “${candidate.keyword}” como principal, mas ${block}: entra como secundária.`);
    else if (wanted) reasons.push(`“${candidate.keyword}” entra como secundária: ${block}.`);
  }
  const addIds = picks.map(pick => pick.keywordId);
  const novaPrincipal = principalId && principalId !== target.primaryId ? byId.get(principalId) : undefined;
  if (novaPrincipal && target.kind === "published" && !coversSlugSubject(target.slug, novaPrincipal.keyword)) reasons.push(broaderPrincipalReason(novaPrincipal.keyword));
  if (principalId !== target.primaryId && current) reasons.push(`Principal com volume escolhida na lista; “${current.keyword}” fica como secundária.`);
  reasons.push(basis === "list_core"
    ? "Leitura da lista pelo código: keywords com volume que são o núcleo do slug. Para gravar, o parecer da SERP da composição final continua obrigatório."
    : "Sugestão da IA na lista existente, conferida pelas barreiras do código. Para gravar, o parecer da SERP da composição final continua obrigatório.");
  return {
    targetId: target.id, kind: target.kind, theme: target.theme, currentPrimaryId: target.primaryId, principalId,
    memberIds: [...new Set([...target.memberIds, ...addIds])], addIds, removeIds: [],
    transfers: addIds.filter(id => byId.get(id)?.territoryRef !== target.territoryRef),
    angle: angleOf(byId.get(principalId ?? "")), exclusions: [], reasons, status: "ready", evidenceBasis: basis,
    aiReasons: picks.map(pick => ({ keywordId: pick.keywordId, reason: pick.reason })),
  };
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
  /** Escolhas da IA já validadas; valem só para quem ficou sem proposta pronta pela SERP. */
  editorialPicks?: readonly ImprovementEditorialPick[];
  /** Por publicado: `true` a página ranqueia (não troca principal), `false` não ranqueia, `null` leitura indisponível. */
  ranking?: Readonly<Record<string, boolean | null>>;
  /** `false` só no passo 1 do prepare (pares da SERP), antes de a IA ler: a leitura da lista pelo código vem depois dela. */
  listReading?: boolean;
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
    const old = target.primaryId ? byId.get(target.primaryId) : null;
    // Publicado Livre sem volume: a busca mais ampla que leva o núcleo do slug vale como fundamento editorial.
    const broaderCore = target.kind === "published" && target.post === "free" && !old?.volumeValidated && carriesSlugCore(target.slug, candidate);
    if (!editorial.fits && !broaderCore && !(evidence && evidence.sharedPages >= 3)) return [];
    // Complete market evidence is mandatory for final approval. The weaker old
    // phrase is not an obligatory overlap anchor when it has no demand.
    if (!evidence?.complete) return [];
    // Without shared pages, the page itself must vouch: the candidate has to fit
    // the published slug ("agência de marketing" does not fit a cosmetics page).
    const fitsSlug = target.kind !== "published" || coversSlugSubject(target.slug, candidate.keyword);
    const fallback = !old?.volumeValidated && !evidence.anchorConclusive && ((editorial.fits && fitsSlug) || broaderCore);
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
    const novaPrincipal = principalId && principalId !== target.primaryId ? byId.get(principalId) : null;
    if (novaPrincipal && target.kind === "published" && !coversSlugSubject(target.slug, novaPrincipal.keyword)) reasons.push(broaderPrincipalReason(novaPrincipal.keyword));
    if (principalId && principalId !== target.primaryId) reasons.push(proof && proof.sharedPages < 2 ? "Nova principal sustentada pelo fundamento editorial e pela SERP completa da candidata; não por coincidência com a frase antiga." : "Principal com demanda medida e compatibilidade de SERP.");
    return { targetId: target.id, kind: target.kind, theme: target.theme, currentPrimaryId: target.primaryId, principalId, memberIds: members, addIds: added, removeIds, transfers: added.filter(id => byId.get(id)?.territoryRef !== target.territoryRef), angle: angleOf(byId.get(principalId ?? "")), exclusions: [], reasons,
      status: !target.territoryRef ? "insufficient_evidence" : (added.length || principalId !== target.primaryId) && principalId ? "ready" : old?.volumeValidated ? "adequate" : eligible.some(e => e.targetId === target.id) ? "no_alternative" : "insufficient_evidence",
      evidenceBasis: added.length || principalId !== target.primaryId ? proof && proof.sharedPages >= 2 ? "serp" : "editorial_and_candidate_serp" : null,
    } as ImprovementProposal;
  });
  // Ordem do dono: 1 pares da SERP (acima) → 2 leitura da IA na lista → 3 busca nova.
  // A IA só completa quem ficou sem proposta pronta; uma keyword vai para um alvo só.
  const picks = input.editorialPicks ?? [];
  if (picks.length) {
    const taken = new Set(proposals.filter(p => p.status === "ready").flatMap(p => p.memberIds));
    const open = input.targets.filter((target, index) => target.territoryRef && proposals[index].status !== "ready");
    const edges = picks.flatMap(pick => {
      const target = open.find(t => t.id === pick.targetId), candidate = byId.get(pick.keywordId);
      if (!target || !candidate || taken.has(candidate.id) || editorialAiBarrier(target, candidate)) return [];
      return [{ targetId: target.id, keywordId: candidate.id, tier: 0, score: IMPROVEMENT_AI_MAX_PER_TARGET - pick.rank, volume: candidate.volume ?? 0 }];
    });
    const chosen = allocateReinforcementChoices({ targets: open.map(t => ({ id: t.id, capacity: Math.max(0, Math.min(IMPROVEMENT_AI_MAX_PER_TARGET, IMPROVEMENT_ARTICLE_MAX_KEYWORDS - t.memberIds.length)) })), edges });
    for (const target of open) {
      const mine = picks.filter(pick => pick.targetId === target.id && chosen.get(pick.keywordId) === target.id && edges.some(e => e.targetId === target.id && e.keywordId === pick.keywordId)).sort((a, b) => a.rank - b.rank);
      if (mine.length) proposals[input.targets.indexOf(target)] = editorialAiProposal(target, mine, byId, input.ranking?.[target.id]);
    }
  }
  guardCannibalPairs(input.targets, proposals, byId, () => true);
  if (input.listReading === false) return proposals;
  /*
   * 4 · LEITURA DA LISTA PELO CÓDIGO (dono, 2026-09-30: "não está se
   * aproveitando bem das keywords da lista"). Quem ficou sem proposta pronta —
   * inclusive o par barrado pela trava acima — recebe as keywords livres, com
   * volume, que SÃO o núcleo do slug e levam uma palavra literal dele: "como
   * atrair clientes" (720) vai para "como atrair pacientes…", "como captar
   * clientes" (390) para "como captar clientes…". A IA tinha dado "captar"
   * para os dois e a trava barrou os dois.
   */
  const taken = new Set(proposals.filter(p => p.status === "ready").flatMap(p => p.memberIds));
  const pool = input.keywords.filter(k => !k.external && !k.published && k.volumeValidated && (k.volume ?? 0) > 0 && !k.ownerId && !taken.has(k.id));
  const open = input.targets.filter((target, index) => target.territoryRef && proposals[index].status !== "ready");
  /*
   * A IA também é COMPLETADA (caso real "como captar clientes…"): ela escolheu
   * "como captar um cliente" + "como captar mais clientes" e deixou de fora
   * "como captar clientes" (390), que é o núcleo do slug. O que a IA escolheu
   * fica; a lista completa até 3 entradas, e a SERP da composição decide.
   */
  const complement = input.targets.filter((target, index) => proposals[index].status === "ready" && proposals[index].evidenceBasis === "editorial_ai" && proposals[index].addIds.length < IMPROVEMENT_AI_MAX_PER_TARGET);
  const room = (target: ImprovementTarget) => {
    const current = proposals[input.targets.indexOf(target)];
    const members = open.includes(target) ? target.memberIds.length : current.memberIds.length;
    const used = open.includes(target) ? 0 : current.addIds.length;
    return Math.max(0, Math.min(IMPROVEMENT_AI_MAX_PER_TARGET - used, IMPROVEMENT_ARTICLE_MAX_KEYWORDS - members));
  };
  const readers = [...open, ...complement];
  const corePicks = readers.flatMap(target => slugCoreListPicks(target, pool));
  if (corePicks.length) {
    const chosen = allocateReinforcementChoices({
      targets: readers.map(t => ({ id: t.id, capacity: room(t) })),
      edges: corePicks.map(pick => ({ targetId: pick.targetId, keywordId: pick.keywordId, tier: 0, score: IMPROVEMENT_AI_MAX_PER_TARGET - pick.rank, volume: byId.get(pick.keywordId)?.volume ?? 0 })),
    });
    const fresh = new Set<number>();
    for (const target of readers) {
      const mine = corePicks.filter(pick => pick.targetId === target.id && chosen.get(pick.keywordId) === target.id).sort((a, b) => a.rank - b.rank)
        .map((pick, rank) => ({ ...pick, rank, role: rank === 0 ? "principal" as const : "secundaria" as const }));
      if (!mine.length) continue;
      const index = input.targets.indexOf(target);
      if (open.includes(target)) proposals[index] = editorialAiProposal(target, mine, byId, input.ranking?.[target.id], "list_core");
      else {
        const p = proposals[index], ids = mine.map(pick => pick.keywordId);
        p.addIds = [...p.addIds, ...ids];
        p.memberIds = [...new Set([...p.memberIds, ...ids])];
        p.transfers = [...p.transfers, ...ids.filter(id => byId.get(id)?.territoryRef !== target.territoryRef)];
        p.aiReasons = [...(p.aiReasons ?? []), ...mine.map(pick => ({ keywordId: pick.keywordId, reason: `${IMPROVEMENT_LIST_CORE_LABEL}: ${pick.reason}` }))];
        p.reasons.push(`A leitura da lista pelo código completou a da IA com ${mine.map(pick => `“${byId.get(pick.keywordId)?.keyword}”`).join(", ")} (núcleo do slug).`);
      }
      fresh.add(index);
    }
    guardCannibalPairs(input.targets, proposals, byId, (i, j) => fresh.has(i) || fresh.has(j));
  }
  for (const p of proposals) { p.exclusions = [...new Set(p.exclusions)]; p.reasons = [...new Set(p.reasons)]; }
  return proposals;
}

/**
 * Das keywords da composição, as que o Google junta com a principal: par
 * "forte" ou "parcial" em 2 ou mais das 4 lentes do parecer. A principal fica
 * sempre. `null` quando o parecer não traz as lentes por par.
 */
export function serpSupportedMembers(lenses: unknown, principalId: string, ids: readonly string[]): string[] | null {
  const perLens = (lenses && typeof lenses === "object" && Array.isArray((lenses as { perLens?: unknown }).perLens)) ? (lenses as { perLens: unknown[] }).perLens : null;
  if (!perLens?.length) return null;
  const pairsOf = (lens: unknown) => Array.isArray((lens as { pairs?: unknown })?.pairs) ? (lens as { pairs: { left?: unknown; right?: unknown; level?: unknown }[] }).pairs : [];
  const together = (id: string) => perLens.filter(lens => pairsOf(lens).some(pair =>
    ((pair.left === principalId && pair.right === id) || (pair.right === principalId && pair.left === id)) && (pair.level === "forte" || pair.level === "parcial"))).length;
  return ids.filter(id => id === principalId || together(id) >= 2);
}

/** Keywords livres com volume que são o núcleo do slug e levam uma palavra literal dele. */
const CORE_FILLERS = new Set(["mais", "novo"]);
export function slugCoreListPicks(target: ImprovementTarget, pool: readonly ImprovementKeyword[]): ImprovementEditorialPick[] {
  const literal = slugCoreWords(targetSubjectText(target));
  if (literal.length < 2) return [];
  const core = aliased(literal, CORE_ALIASES);
  return pool.flatMap(candidate => {
    const words = slugWords(candidate.keyword);
    const present = aliased(words, CORE_ALIASES);
    // O núcleo inteiro (com sinônimos) e nada além dele: "como atrair clientes pelo instagram" é outro ângulo.
    if (![...core].every(word => present.has(word)) || ![...present].every(word => core.has(word) || CORE_FILLERS.has(word))) return [];
    // A palavra de ação do slug tem de estar escrita: "como captar clientes" não completa a página de "atrair".
    const own = words.filter(word => literal.includes(word)).length;
    if (!words.includes(literal[0]) || editorialAiBarrier(target, candidate)) return [];
    return [{ candidate, own }];
  })
    .sort((a, b) => b.own - a.own || (b.candidate.volume ?? 0) - (a.candidate.volume ?? 0) || a.candidate.keyword.length - b.candidate.keyword.length || a.candidate.id.localeCompare(b.candidate.id))
    .slice(0, IMPROVEMENT_AI_MAX_PER_TARGET)
    .map((item, rank) => ({ targetId: target.id, keywordId: item.candidate.id, role: rank === 0 ? "principal" as const : "secundaria" as const, reason: `Leva o núcleo do slug (${literal.join(" + ")}), com volume ${item.candidate.volume}.`, rank }));
}

/**
 * Do not present synonym changes as a solution to cannibalization. A pair
 * needs different evidenced coverage, with explicit reciprocal exclusions.
 */
function guardCannibalPairs(targets: readonly ImprovementTarget[], proposals: ImprovementProposal[], byId: ReadonlyMap<string, ImprovementKeyword>, include: (i: number, j: number) => boolean): void {
  for (let i = 0; i < proposals.length; i++) for (let j = i + 1; j < proposals.length; j++) {
    if (!include(i, j)) continue;
    const a = proposals[i], b = proposals[j];
    if (a.kind !== "published" || b.kind !== "published") continue;
    const ta = targets[i], tb = targets[j];
    if (collisionKey(ta) !== collisionKey(tb) && !(knownEqual(ta.signals.centralEntity, tb.signals.centralEntity) && knownEqual(ta.signals.perceivedProblem, tb.signals.perceivedProblem) && knownEqual(ta.signals.intent, tb.signals.intent))) continue;
    if (!a.angle || !b.angle || key(a.angle) === key(b.angle) || key(a.angle).replace(/captar clientes|atrair pacientes/g, "captacao") === key(b.angle).replace(/captar clientes|atrair pacientes/g, "captacao")) {
      /*
       * Diferenciar por GRUPOS DE KEYWORDS (dono, 2026-09-30): "como captar
       * clientes…" e "como atrair pacientes…" ficam distintos quando cada um
       * recebe da lista uma principal própria — que não é sinônimo da outra —
       * e nenhuma keyword em comum. Trocar só o sinônimo continua barrado.
       */
      const pa = byId.get(a.principalId ?? ""), pb = byId.get(b.principalId ?? "");
      const palavras = (k: ImprovementKeyword) => [...aliased(slugWords(k.keyword), CORE_ALIASES)].sort().join(" ");
      const compartilham = a.memberIds.some(id => id !== ta.primaryId && id !== tb.primaryId && b.memberIds.includes(id));
      const proprias = a.status === "ready" && b.status === "ready" && pa && pb && pa.id !== pb.id
        && pa.volumeValidated && pb.volumeValidated && palavras(pa) !== palavras(pb) && !compartilham;
      const verbo = !compartilham && ownSlugWordsDiffer(ta, tb, a, b, byId);
      if (proprias || verbo) {
        const nome = (p: ImprovementProposal, t: ImprovementTarget) => byId.get(p.principalId ?? "")?.volumeValidated ? byId.get(p.principalId!)!.keyword : t.theme;
        a.exclusions.push(nome(b, tb)); b.exclusions.push(nome(a, ta));
        a.reasons.push(`Diferenciado de “${b.theme}” por keywords próprias da lista: não cobrir “${nome(b, tb)}”.`);
        b.reasons.push(`Diferenciado de “${a.theme}” por keywords próprias da lista: não cobrir “${nome(a, ta)}”.`);
        continue;
      }
      for (const p of [a, b]) { p.status = "insufficient_evidence"; p.reasons.push("Risco de canibalização: ainda falta uma cobertura distinta sustentada por dados. A troca de sinônimos não resolve."); }
    } else {
      a.exclusions.push(b.angle); b.exclusions.push(a.angle);
      a.reasons.push(`Diferenciar de “${b.theme}”: não cobrir ${b.angle}.`);
      b.reasons.push(`Diferenciar de “${a.theme}”: não cobrir ${a.angle}.`);
    }
  }
}

/**
 * O par se separa pelas palavras que só um dos slugs tem ("captar" × "atrair").
 * Cada lado que muda recebe só keywords com uma palavra própria do seu slug e
 * sem o verbo do outro; o Google já trata "como captar clientes" e "como
 * atrair clientes" como grupos diferentes. Dar "captar" para a página de
 * "atrair" continua barrado.
 */
function ownSlugWordsDiffer(ta: ImprovementTarget, tb: ImprovementTarget, a: ImprovementProposal, b: ImprovementProposal, byId: ReadonlyMap<string, ImprovementKeyword>): boolean {
  const ca = slugCoreWords(targetSubjectText(ta)), cb = slugCoreWords(targetSubjectText(tb));
  const onlyA = ca.filter(word => !cb.includes(word)), onlyB = cb.filter(word => !ca.includes(word));
  if (!onlyA.length || !onlyB.length) return false;
  const entradas = (p: ImprovementProposal) => p.status !== "ready" ? [] : [...new Set([...p.addIds, ...(p.principalId && p.principalId !== p.currentPrimaryId ? [p.principalId] : [])])];
  const ea = entradas(a), eb = entradas(b);
  if (!ea.length && !eb.length) return false;
  const leva = (ids: string[], own: string[], otherVerb: string | undefined) => ids.every(id => {
    const words = slugWords(byId.get(id)?.keyword ?? "");
    return words.some(word => own.includes(word)) && !(otherVerb && words.includes(otherVerb));
  });
  const verboDe = (core: string[], only: string[]) => only.includes(core[0]) ? core[0] : undefined;
  return leva(ea, onlyA, verboDe(cb, onlyB)) && leva(eb, onlyB, verboDe(ca, onlyA));
}
