import { allocateReinforcementChoices } from "./reinforcement-allocation.ts";
import { intentComparisonKey, type KeywordDnaSignals } from "./keyword-dna-signals.ts";
import { classifySlugFit } from "./published-slug-fit.ts";
import { normalizeKeyword } from "../minerador/keyword-import-core.ts";
import type { GoogleAdsHistoricalMetric } from "../google/ads/contracts.ts";

export const ARTICLE_IMPROVEMENT_VERSION = 1;
export const ARTICLE_IMPROVEMENT_LABEL = "Melhorar publicados e formar Assuntos";
export type ImprovementKeyword = {
  id: string; keyword: string; volume: number | null; volumeValidated: boolean;
  signals: KeywordDnaSignals; ownerId: string | null; published: boolean;
  territoryRef: string | null; external: boolean;
  /**
   * Volume antigo (outra era/provider) medido AGORA no Google Ads, no preparo,
   * só em leitura. F4 (SDD 2026-10-13, item 2): o Arquiteto não grava a
   * medição; a proposta que depende dela fica "Precisa do Minerador" e a
   * medição vai como sugestão ao Minerador, que a grava pelo clique do dono.
   */
  volumePendingWrite?: boolean;
  /** Já medida no Google Ads (mesmo sem média): não é medida de novo no preparo. */
  googleAdsMeasured?: boolean;
  /**
   * F3 · LER ANTES DE BUSCAR (D4): "o Google Ads não tem média" registrado há
   * menos de 30 dias (no Minerador ou nesta preparação) — conta como medida.
   */
  noAverageAt?: string;
  /** F3 — medida no Google Ads NESTA preparação (com a autorização dita na prévia). */
  measuredNowAt?: string;
  /**
   * F3 · MEDIR UMA VEZ: a medição do Google Ads feita na preparação (só para a
   * keyword com volume, cuja gravação fica pendente). F4: ela vai, guardada no
   * servidor, na sugestão ao Minerador, que a grava pelo núcleo do "Medir
   * volume" no clique do dono, sem chamar o Google Ads de novo.
   * A conta do Google Ads vai mascarada (só os 4 últimos dígitos, como no Minerador).
   */
  measurement?: ImprovementStoredMeasurement;
  /** F3 — a ideia da busca nova já existe no Minerador com volume medido: "já temos", não é medida de novo. */
  knownInMinerador?: { keywordId: string };
};
/** A medição guardada na execução para ser gravada depois sem nova chamada (F3). */
export type ImprovementStoredMeasurement = { metric: GoogleAdsHistoricalMetric; requestId: string | null };
export type ImprovementTarget = {
  id: string; kind: "published" | "subject"; theme: string; note: string | null;
  primaryId: string | null; post: "free" | "locked" | "unknown";
  memberIds: string[]; territoryRef: string | null; slug: string | null;
  url: string | null; canonical: string | null; signals: KeywordDnaSignals;
  siloContext?: { centralEntity: string | null; macroIntent: string | null; slug: string | null };
  /**
   * F4 (SDD 2026-10-12 §6.2-7; ADR-022 D1-bis) — a principal declarada no plano
   * do Silo, lida do pacote aprovado do Assunto. Fixa: a melhoria nunca a troca
   * (`needsPrimary` falso), mesmo sem volume.
   */
  declaredPrincipalId?: string | null;
  /**
   * 2026-10-13 · a keyword do plano (travada OU livre). Livre, a melhoria pode
   * trocá-la; ela continua valendo para o parecer pelas sustentações (D2(a)).
   */
  planPrincipalId?: string | null;
  /** F4 — o DNA vigente ainda não tem a promessa e o papel do plano (D8: versão nova). */
  declaredPlanPending?: boolean;
  /**
   * F5 · PLANILHA PRIMEIRO (SDD 2026-10-13, item 5) — "Trocar principal" do
   * artigo do plano com trava LIVRE: a keyword que o humano escolheu entre as
   * candidatas da regra única. Ausente = a melhoria decide como sempre.
   */
  chosenPrincipalId?: string | null;
  /** F5 — a escolha foi recusada para esta linha (travada, fora das candidatas…): a proposta não fica pronta. */
  principalChoiceRefusal?: string | null;
  /**
   * 2026-10-16 · §15 do roteiro do grupo com plano (SDD da linha única): o slug
   * e os detalhes (escopo) declarados no plano aprovado. São sementes e régua da
   * linha de copy do artigo; o artigo ainda não formado não tem `slug`.
   */
  planSlug?: string | null;
  planScope?: string | null;
  /** 2026-10-17 · o papel do artigo no plano (Pilar ou Suporte): só o Pilar recebe a cabeça mais ampla do Silo. */
  planRole?: "Pilar" | "Suporte" | null;
};
/**
 * 2026-10-16 · O que a SERP da principal, JÁ no cache (grátis), mostra: as
 * perguntas ("as pessoas também perguntam"), as buscas relacionadas e os
 * títulos do top 10, somados nas 4 lentes. É a evidência do reforço (§15, passo 4).
 */
export type ImprovementSerpVocabulary = { keywordId: string; questions: string[]; relatedSearches: string[]; titles: string[]; lenses: number;
  /** 2026-10-17 · os domínios concorrentes da SERP (observação do cache): de onde sai o nome das marcas/operadoras. */
  domains?: string[] };
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
  /**
   * `list_core`: leitura da lista pelo código (núcleo do slug), depois da IA.
   * `copy_line` (2026-10-16, §15): escolhida pela linha de copy do artigo
   * (Assunto, slug, detalhes do plano, DNA) com a evidência da SERP da principal
   * em cache; a SERP própria da candidata não é exigida.
   */
  evidenceBasis: "serp" | "editorial_and_candidate_serp" | "editorial_ai" | "list_core" | "copy_line" | null;
  /** Em `editorial_ai` e `list_core`: a frase de motivo de cada keyword que entrou. */
  aiReasons?: { keywordId: string; reason: string }[];
  /** A composição escolhida pela IA ainda não tem as quatro lentes no cache: passo 2 (pago, com prévia). */
  needsValidation?: boolean;
  /**
   * "Atualizar o DNA com a SERP" (2026-10-01): a composição não muda; o DNA
   * aprovado ganha a classificação, a intenção e o funil que a SERP vigente
   * dele decidiu. `recordVersionId` é o parecer (`serpAssessmentRef`) lido.
   */
  serpRefresh?: { recordVersionId: string; intent: string; funnel: string; detail: string };
  /**
   * F4 · O ARQUITETO SÓ LÊ (SDD 2026-10-13, item 2): a proposta precisaria de
   * keyword nova, de medição gravada ou da Lógica no Minerador. Ela não é
   * aceitável aqui ("Precisa do Minerador"); a sugestão vai para a caixa
   * "Sugestões do Arquiteto" do Minerador (`article-improvement-minerador.ts`).
   */
  needsMinerador?: { newKeywordIds: string[]; measureKeywordIds: string[]; logicKeywordIds: string[] };
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
/** A composição veio da linha de copy (§15): faltando a SERP da principal no cache, a linha pede a coleta paga só dela. */
export const isCopyLineReading = (p: Pick<ImprovementProposal, "evidenceBasis">) => p.evidenceBasis === "copy_line";
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
 *
 * 2026-10-17 · com a entidade do DNA (artigo do plano e Assunto): a entidade
 * que o slug escreve entra no núcleo, na ordem do slug. como-escolher-plano-
 * internet-residencial + entidade "plano" → plano, internet, residencial (o
 * "como escolher" é o ângulo do Assunto, não o núcleo). Sem entidade, o de sempre.
 */
export function slugCoreWords(slug: string | null, entity?: string | null): string[] {
  const last = (slug ?? "").split("/").filter(Boolean).at(-1) ?? "";
  const tokens = key(last.replace(/-/g, " ")).split(/[^a-z0-9]+/).filter(Boolean);
  const cut = tokens.findIndex(token => SLUG_SPLITTERS.has(token));
  const left = (cut > 0 ? tokens.slice(0, cut) : tokens).join(" ");
  const base = slugWords(left).slice(-2);
  if (!entity) return base;
  const daEntidade = new Set(slugWords(entity));
  return [...new Set(slugWords(left).filter(word => base.includes(word) || daEntidade.has(word)))];
}
/**
 * Decisão do dono (2026-09-30): publicado Livre sem volume pode ganhar uma
 * principal MAIS AMPLA com volume, desde que ela leve o núcleo do assunto do
 * slug. Cabeça genérica de 2 palavras com volume enorme ("agência de
 * marketing", 18.100) continua fora: a página de nicho não ranqueia nela.
 * 2026-10-17 · a MESMA régua vale para o artigo do plano e o Assunto Livre sem
 * volume (`entity` = a entidade do DNA do artigo; ver `slugCoreWords`).
 */
export function carriesSlugCore(slug: string | null, candidate: Pick<ImprovementKeyword, "keyword" | "volume">, entity?: string | null): boolean {
  const core = slugCoreWords(slug, entity);
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
/** O slug publicado (ou o do Assunto; 2026-10-17: ou o declarado no plano, E5); sem slug, o próprio tema. */
const targetSubjectText = (target: ImprovementTarget) => target.slug ?? target.planSlug ?? target.theme.replace(/\//g, " ");

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
  // F4 — a principal declarada no plano do Silo é fixa.
  if (target.declaredPrincipalId) return "a principal foi declarada no plano do Silo";
  if (target.post === "locked") return "o Posto é Travado";
  if (target.post !== "free") return "o Posto não foi declarado";
  if (current?.volumeValidated) return "a principal atual já tem volume";
  // 2026-10-17 · Principal de identidade: a que está no título ou no slug fica; a IA só traz reforço.
  if (targetPrincipalIsIdentity(target, current)) return "a principal atual é a identidade do assunto (está no título ou no slug) e fica";
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

/*
 * A LINHA DE COPY DO ARTIGO (dono, 2026-10-16; SDD `sdd-linha-unica-do-arquiteto-2026-10-16.md`
 * §15, passos 3b e 4): "ele tem que procurar as keywords de acordo ao assunto e
 * o slug, e tem que utilizar o conceito semântico… com a ajuda e reforço ou
 * indicação da SERP, porque a SERP é para isso".
 *
 * A linha é o que o plano e o DNA já dizem: o Assunto (título), o slug, os
 * detalhes do plano, a keyword principal e a entidade, o problema e o
 * resultado do KeywordDNA. A candidata reforça quando carrega a entidade (ou
 * reescreve a principal ou o slug), não sai do assunto e tem evidência: aparece
 * nas buscas relacionadas, nas perguntas ou nos títulos da SERP da principal JÁ
 * em cache (grátis), ou é a mesma busca dita de outro jeito. A SERP própria da
 * candidata não é exigida para reforçar; ela só é paga quando a candidata vai
 * virar a principal sem SERP (a primeira coleta, com o custo antes).
 */
const COPY_STOPWORDS = new Set([...SLUG_STOPWORDS, "qual", "quais", "pra", "pelo", "pela", "pelos", "pelas", "ate", "mais", "voce", "seu", "sua", "tem", "ter", "isso", "esse", "essa", "este", "esta", "sobre", "entre", "ser", "sao", "uns", "umas", "nos", "nas", "aos", "ao", "ou", "se", "eu", "me",
  // Modificadores genéricos de intenção: dizem COMO se busca, não DO QUE se fala (a intenção é conferida à parte).
  "melhor", "melhores", "bom", "boa", "bons", "boas", "vale", "pena"]);
const COPY_ALIASES: Record<string, string> = { melhore: "melhor" };
/** Normaliza flexão de número e gênero ("barata"/"baratos" → "barat"); só para comparar. */
const copyStem = (word: string) => { let w = word.replace(/s$/, ""); if (w.length > 4 && /[ao]$/.test(w)) w = w.slice(0, -1); return COPY_ALIASES[w] ?? w; };
export const copyWords = (value: string | null | undefined): Set<string> => new Set(key((value ?? "").replace(/[-/]/g, " ")).split(/[^a-z0-9]+/).filter(word => word.length >= 2 && !COPY_STOPWORDS.has(word)).map(copyStem));
const lastSlugSegment = (slug: string | null | undefined) => (slug ?? "").split("/").filter(Boolean).at(-1)?.replace(/-/g, " ") ?? "";
/** Pergunta, comparação ou preço: a família de intenção que a principal Livre não pode perder na troca. */
const INTENT_FAMILIES: Array<[string, RegExp]> = [
  ["pergunta", /\b(como|qual|quais|quanto|quantos|quanta|quantas|porque|por que|quando|onde|o que|vale a pena|preciso|precisa)\b/],
  ["comparacao", /\b(ou|vs|versus|melhor|melhores|comparar|comparativo|diferenca|qual)\b/],
];
const intentFamilies = (value: string) => new Set(INTENT_FAMILIES.filter(([, pattern]) => pattern.test(key(value))).map(([name]) => name));

export type ImprovementCopyLine = {
  principalText: string | null;
  principal: Set<string>; slug: Set<string>; entity: Set<string>; words: Set<string>;
  vocabulary: { related: Set<string>[]; questions: Set<string>[]; titles: Set<string>[]; words: Set<string> };
};
/** A linha de copy de um alvo: Assunto + slug + detalhes do plano + principal + DNA (+ a SERP da principal em cache). */
export function improvementCopyLine(target: ImprovementTarget, byId: ReadonlyMap<string, ImprovementKeyword>, vocabulary?: ImprovementSerpVocabulary | null): ImprovementCopyLine {
  const principal = byId.get(target.primaryId ?? "") ?? byId.get(target.planPrincipalId ?? "") ?? byId.get(target.declaredPrincipalId ?? "");
  const principalText = principal?.keyword ?? (target.kind === "published" ? target.theme : null);
  const signals = principal?.signals ?? target.signals;
  const slug = copyWords(lastSlugSegment(target.slug ?? target.planSlug ?? null));
  const entity = copyWords(target.signals.centralEntity ?? signals.centralEntity);
  const words = new Set([
    ...copyWords(principalText), ...slug, ...entity, ...copyWords(target.theme), ...copyWords(target.planScope ?? target.note),
    ...copyWords(signals.perceivedProblem), ...copyWords(signals.desiredResult), ...signals.modifiers.flatMap(modifier => [...copyWords(modifier)]),
  ]);
  const listOf = (items: readonly string[] | undefined) => (items ?? []).map(copyWords).filter(set => set.size > 0);
  const related = listOf(vocabulary?.relatedSearches), questions = listOf(vocabulary?.questions), titles = listOf(vocabulary?.titles);
  return { principalText, principal: copyWords(principalText), slug, entity, words, vocabulary: { related, questions, titles, words: new Set([...related, ...questions, ...titles].flatMap(set => [...set])) } };
}
export type ImprovementCopyMatch = { carries: boolean; fits: boolean; cover: number; serp: 0 | 1 | 2 | 3; where: "relacionadas" | "perguntas" | "títulos" | null;
  /** Palavras que só a SERP usa (nem o plano nem o DNA): a marca de uma operadora, por exemplo. Contam contra no desempate. */
  serpOnlyWords: number };
const share = (part: Set<string>, whole: Set<string>) => whole.size ? [...whole].filter(word => part.has(word)).length / whole.size : 0;
const contains = (outer: Set<string>, inner: Set<string>) => inner.size > 0 && [...inner].every(word => outer.has(word));
/** O encaixe de uma frase na linha de copy (só texto, sem volume nem dono). */
export function copyLineMatch(line: ImprovementCopyLine, phrase: string, brands?: ReadonlySet<string>): ImprovementCopyMatch {
  const words = copyWords(phrase);
  const none: ImprovementCopyMatch = { carries: false, fits: false, cover: 0, serp: 0, where: null, serpOnlyWords: 0 };
  if (!words.size) return none;
  const cover = Math.max(share(words, line.principal), share(words, line.slug));
  // A entidade inteira; quando ela é uma palavra só ("internet", "plano"), mais uma palavra da principal ou do slug.
  const entityOk = line.entity.size > 0 && contains(words, line.entity) && (line.entity.size >= 2 || [...words].some(word => !line.entity.has(word) && (line.principal.has(word) || line.slug.has(word))));
  // 2026-10-17 · a busca de UMA das marcas que o artigo compara ("internet residencial vivo" em "Claro, Vivo ou TIM"): a marca nomeada pelo artigo e o resto dentro da principal.
  const daMarcaNomeada = Boolean(brands?.size) && [...brands!].every(word => line.words.has(word)) && [...words].every(word => brands!.has(word) || line.principal.has(word) || line.slug.has(word)) && [...words].some(word => !brands!.has(word));
  const carries = entityOk || cover >= 0.75 || daMarcaNomeada;
  const same = (set: Set<string>) => set.size === words.size && contains(set, words);
  const { related, questions, titles } = line.vocabulary;
  // A relacionada que contém a candidata inteira, ou a candidata que é uma relacionada mais palavras DA LINHA ("instalação" + "internet residencial vivo").
  const naRelacionada = (set: Set<string>) => Math.min(set.size, words.size) >= 2 && (contains(set, words) || (contains(words, set) && [...words].every(word => set.has(word) || line.words.has(word))));
  const serp: ImprovementCopyMatch["serp"] = related.some(same) ? 3
    : related.some(naRelacionada) || questions.some(set => contains(set, words)) ? 2
      : titles.some(set => contains(set, words)) ? 1 : 0;
  const where = serp === 3 || (serp === 2 && related.some(naRelacionada)) ? "relacionadas" : serp === 2 ? "perguntas" : serp === 1 ? "títulos" : null;
  // Fora do assunto: palavra que nem a linha nem a SERP da principal usam (uma tolerada com evidência forte da SERP).
  const outside = [...words].filter(word => !line.words.has(word) && !line.vocabulary.words.has(word)).length;
  const serpOnlyWords = [...words].filter(word => !line.words.has(word) && line.vocabulary.words.has(word)).length;
  const onLine = serp >= 2 ? outside <= 1 && (outside === 0 || words.size >= 3) : outside === 0;
  // Sem menção na SERP, vale a mesma busca reescrita OU a entidade com todas as palavras dentro do Assunto, do slug, dos detalhes e do DNA.
  return { carries, fits: carries && onLine && (serp > 0 || cover >= 0.75 || daMarcaNomeada || (entityOk && outside === 0 && serpOnlyWords === 0)), cover, serp, where, serpOnlyWords };
}
/**
 * Secundária reforça a principal; não a engole (AGENTS.md §13: o termo de
 * maior volume e cauda menor tende a Pilar). Mais de 3× o volume da principal
 * sem ser mais longa que ela é cabeça de outro artigo, não reforço deste.
 */
export const COPY_LINE_HEAD_RATIO = 3;
function headOverPrincipal(principal: ImprovementKeyword | undefined, candidate: ImprovementKeyword): boolean {
  if (!principal?.volumeValidated || !(principal.volume! > 0)) return false;
  return candidate.volume! > COPY_LINE_HEAD_RATIO * principal.volume! && copyWords(candidate.keyword).size <= copyWords(principal.keyword).size;
}
/** Barreiras duras de qualquer reforço pela linha de copy (as de sempre: publicada, sem volume, de outro artigo, conflito do DNA, local, cabeça genérica). */
function copyLineBarrier(target: ImprovementTarget, candidate: ImprovementKeyword): string | null {
  if (candidate.published) return "publicada";
  if (!candidate.volumeValidated || !(candidate.volume! > 0)) return "sem volume";
  if (candidate.ownerId && candidate.ownerId !== target.id) return "de outro artigo";
  if (candidate.id === target.id || candidate.id === target.primaryId) return "é a principal";
  const fit = improvementEditorialFit(target, candidate);
  if (fit.conflict) return fit.reason;
  if (new Set(slugWords(candidate.keyword)).size <= 2 && candidate.volume! > BROAD_HEAD_MAX_VOLUME) return "cabeça genérica";
  const local = localSearchOf(candidate.keyword);
  if (local && !key(`${target.theme} ${lastSlugSegment(target.slug ?? target.planSlug ?? null)} ${target.planScope ?? ""}`).includes(local)) return "busca local";
  return null;
}
/** A troca da principal Livre sem volume não muda a intenção: a família (pergunta, comparação) da antiga fica, ou o DNA das duas diz a mesma. */
function keepsIntent(old: ImprovementKeyword | undefined, candidate: ImprovementKeyword): boolean {
  if (!old) return true;
  const a = intentComparisonKey(old.signals.intent), b = intentComparisonKey(candidate.signals.intent);
  if (a && b) return a === b;
  const antes = intentFamilies(old.keyword);
  if (!antes.size) return true;
  const depois = intentFamilies(candidate.keyword);
  return [...antes].some(family => depois.has(family));
}
/*
 * 2026-10-17 · PRINCIPAL DE IDENTIDADE (dono, literal): "Se o termo principal
 * tem pouco volume, mas faz sentido preservá-lo por ser a identidade do
 * assunto/tema, principalmente nos publicados mas também nos novos. As
 * keywords mais amplas podem reforçar o contexto."
 *
 * Lido dos dados, sem IA: a principal é a identidade do artigo quando está no
 * título do Assunto (todas as palavras de conteúdo dela, duas ou mais) ou
 * quando o slug foi feito dela — todas as palavras dela estão no slug e cobrem
 * ao menos metade dele ("combo internet tv streaming" em combo-internet-tv-
 * streaming-vale-a-pena), ou ela leva 3/4 das palavras do slug (a régua de
 * `coversSlugSubject`) — o slug declarado no plano, o do DNA ou o publicado. A
 * frase declarada no plano conta assim: coerente com o título ou com o slug.
 * Identidade fica como principal, com pouco ou nenhum volume (Travada ou Livre);
 * as buscas mais amplas entram como secundárias e reforçam o contexto. A troca
 * automática (Livre sem volume, principal mais ampla com o núcleo do slug,
 * reserva pela keyword mais próxima do slug, escolha da IA, D2.1 da mesa) só vale
 * quando a principal NÃO é a identidade. "Procurar outra principal", na linha do
 * plano, continua a decisão do dono.
 */
export function principalIsIdentity(input: { keyword: string | null | undefined; title?: string | null; slug?: string | null }): boolean {
  const palavras = copyWords(input.keyword);
  if (!palavras.size) return false;
  if (input.title && palavras.size >= 2 && contains(copyWords(input.title), palavras)) return true;
  if (!input.slug) return false;
  const doSlug = copyWords(lastSlugSegment(input.slug));
  if (palavras.size >= 2 && contains(doSlug, palavras) && palavras.size * 2 >= doSlug.size) return true;
  return coversSlugSubject(input.slug, input.keyword ?? "");
}
/**
 * A principal do alvo é a identidade dele? Publicado: o slug publicado (o tema do publicado é a própria keyword,
 * não um título). Assunto: o título e o slug DECLARADO no plano — o slug sugerido do DNA saiu da própria principal
 * (E4) e não prova nada.
 */
export function targetPrincipalIsIdentity(target: Pick<ImprovementTarget, "kind" | "theme" | "slug" | "planSlug">, principal: Pick<ImprovementKeyword, "keyword"> | null | undefined): boolean {
  if (!principal) return false;
  return principalIsIdentity({ keyword: principal.keyword, title: target.kind === "subject" ? target.theme : null, slug: target.kind === "published" ? target.slug : target.planSlug ?? null });
}
export const IDENTITY_PRINCIPAL_LABEL = "Principal de identidade";
/** A frase da prévia quando a principal fica por ser a identidade. */
export function identityPrincipalReason(target: Pick<ImprovementTarget, "kind">, principal: Pick<ImprovementKeyword, "keyword" | "volume" | "volumeValidated">): string {
  const volume = principal.volumeValidated && (principal.volume ?? 0) > 0 ? `volume ${principal.volume}` : "sem volume";
  return target.kind === "published"
    ? `${IDENTITY_PRINCIPAL_LABEL}: “${principal.keyword}” (${volume}) é o assunto do slug publicado e fica como principal; as buscas mais amplas entram como secundárias e reforçam o contexto (dono, 17/10).`
    : `${IDENTITY_PRINCIPAL_LABEL}: “${principal.keyword}” (${volume}) está no título e no slug do Assunto e fica como principal; as buscas mais amplas entram como secundárias e reforçam o contexto (dono, 17/10). Trocar só pela sua decisão, em “Procurar outra principal”.`;
}
/*
 * 2026-10-17 · QUANDO A PRINCIPAL NÃO É A IDENTIDADE (fora do título e do slug,
 * frase estranha), a Livre SEM volume do artigo do plano ou do Assunto pode
 * receber a proposta de troca pela busca com volume que leva o núcleo do slug
 * com a entidade do DNA (a régua do publicado Livre sem volume, decisão do dono
 * de 2026-09-30). A intenção do DNA, quando as duas a têm, precisa ser a mesma
 * (a SERP da nova principal, coletada antes de gravar, decide a intenção e o
 * funil). No Suporte, a busca que é só um pedaço da principal antiga (a cabeça
 * dela) não vale: a cabeça do Silo é do Pilar. Proposta na prévia; decide o dono.
 */
function keepsDnaIntent(old: ImprovementKeyword | undefined, candidate: ImprovementKeyword): boolean {
  const a = intentComparisonKey(old?.signals.intent), b = intentComparisonKey(candidate.signals.intent);
  return !(a && b) || a === b;
}
/** O slug do artigo do plano ou do Assunto: o do DNA formado; antes dele, o declarado no plano. */
const subjectSlugOf = (target: ImprovementTarget) => target.slug ?? target.planSlug ?? null;
export function subjectSlugCoreSwap(target: ImprovementTarget, old: ImprovementKeyword | undefined, candidate: ImprovementKeyword): boolean {
  if (target.kind !== "subject" || target.declaredPrincipalId || old?.volumeValidated || targetPrincipalIsIdentity(target, old)) return false;
  if (!candidate.volumeValidated || !(candidate.volume! > 0)) return false;
  if (!carriesSlugCore(subjectSlugOf(target), candidate, target.signals.centralEntity) || !keepsDnaIntent(old, candidate)) return false;
  if (target.planRole === "Suporte" && old) {
    const antiga = copyWords(old.keyword), dela = copyWords(candidate.keyword);
    if (dela.size < antiga.size && [...dela].every(word => antiga.has(word))) return false;
  }
  return true;
}
type CopyEdge = { targetId: string; keywordId: string; tier: number; score: number; volume: number; match: ImprovementCopyMatch; principalOk: boolean;
  /** 2026-10-17 · leva o núcleo do slug do artigo (com a entidade do DNA): vem primeiro na troca da Livre sem volume (D2, item 1). */
  slugCore: boolean };
/** As arestas da linha de copy: Assunto (todos) e publicado com principal de volume e SERP em cache (só reforço). */
/*
 * 2026-10-17 · AS MARCAS (operadoras, fabricantes…) VÊM DA PRÓPRIA SERP: o
 * domínio dos concorrentes que o Google mostra ("vivo.com.br" → vivo). A
 * palavra que está na principal de TODOS os artigos (o assunto do Silo, como
 * "internet") nunca vira marca.
 */
const OPERATOR_WORDS = new Set(["operador", "provedor", "provedore", "marca"]);
function brandWordsOf(targets: readonly ImprovementTarget[], lines: ReadonlyMap<string, ImprovementCopyLine>, vocabulary: Readonly<Record<string, ImprovementSerpVocabulary>>): Set<string> {
  const principais = [...lines.values()].map(line => line.principal).filter(set => set.size > 0);
  const deTodos = new Set(principais.length ? [...principais[0]].filter(word => principais.every(set => set.has(word))) : []);
  const marcas = new Set<string>();
  for (const target of targets) for (const dominio of vocabulary[target.id]?.domains ?? []) {
    const palavra = rotuloDoDominio(dominio);
    if (palavra && !deTodos.has(palavra)) marcas.add(palavra);
  }
  return marcas;
}
/** "https://www.vivo.com.br/…" → "vivo" (já no radical da linha de copy); null quando não parece marca. */
function rotuloDoDominio(dominio: string): string | null {
  const rotulo = dominio.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[./]/)[0] ?? "";
  if (!/^[a-z0-9]{2,20}$/.test(rotulo) || COPY_STOPWORDS.has(rotulo)) return null;
  return copyStem(rotulo);
}
/** As palavras do artigo que dizem do que ele fala: a principal, o slug e o Assunto (sem os detalhes nem a SERP). */
const nucleoDoArtigo = (target: ImprovementTarget, line: ImprovementCopyLine) => new Set([...line.principal, ...line.slug, ...copyWords(target.theme)]);
/** Quanto do conjunto de palavras o artigo contém: principal e slug pesam mais que o Assunto, que pesa mais que os detalhes. */
function afinidadeNoSilo(target: ImprovementTarget, line: ImprovementCopyLine, palavras: Set<string>): number {
  const quota = (conjunto: Set<string>) => [...palavras].filter(word => conjunto.has(word)).length / Math.max(1, palavras.size);
  return quota(new Set([...line.principal, ...line.slug])) * 3 + quota(copyWords(target.theme)) * 2 + quota(line.words) + (target.planRole === "Pilar" ? 0.1 : 0);
}
const chaveDaVariante = (palavras: Set<string>) => [...palavras].sort().join(" ");

function copyLineEdges(targets: readonly ImprovementTarget[], keywords: readonly ImprovementKeyword[], byId: ReadonlyMap<string, ImprovementKeyword>, vocabulary: Readonly<Record<string, ImprovementSerpVocabulary>>): CopyEdge[] {
  const textosDaLista = new Set(keywords.filter(k => !k.external).map(k => key(k.keyword)));
  const linhas = new Map(targets.map(target => [target.id, improvementCopyLine(target, byId, vocabulary[target.id] ?? null)]));
  const marcas = brandWordsOf(targets, linhas, vocabulary);
  const brutas = targets.flatMap(target => {
    if (!target.territoryRef) return [];
    const vocab = vocabulary[target.id] ?? null;
    const old = byId.get(target.primaryId ?? "");
    if (target.kind === "published" && !(vocab && old?.volumeValidated)) return [];
    const line = linhas.get(target.id)!;
    if (!line.principal.size && !line.slug.size && !line.entity.size) return [];
    const livre = target.kind === "subject" && !target.declaredPrincipalId && !old?.volumeValidated;
    const identidade = livre && targetPrincipalIsIdentity(target, old);
    const principalText = line.principalText ? key(line.principalText) : null;
    const doArtigo = nucleoDoArtigo(target, line);
    const nomeiaOperadoras = [...doArtigo].some(word => OPERATOR_WORDS.has(word));
    return keywords.flatMap(candidate => {
      // A ideia da busca que repete uma keyword que já está na lista (ou a própria principal) não entra de novo.
      if (candidate.external && (textosDaLista.has(key(candidate.keyword)) || key(candidate.keyword) === principalText)) return [];
      if (copyLineBarrier(target, candidate)) return [];
      // Do plano: a cabeça mais ampla que a principal, com mais volume, só vai para o Pilar (as demais regras de cabeça valem fora do plano).
      if (target.planRole ? target.planRole !== "Pilar" && (cabecaDaPrincipal(old, candidate) || headOverPrincipal(old, candidate)) : headOverPrincipal(old, candidate)) return [];
      // A busca com marca (operadora…) só vai para o artigo que nomeia aquela marca ou fala de operadoras.
      const marcasDaCandidata = [...copyWords(candidate.keyword)].filter(word => marcas.has(word));
      if (marcasDaCandidata.length && !nomeiaOperadoras && !marcasDaCandidata.every(word => doArtigo.has(word))) return [];
      const match = copyLineMatch(line, candidate.keyword, marcasDaCandidata.length ? new Set(marcasDaCandidata) : undefined);
      if (!match.fits) return [];
      // 2026-10-17 · a principal de identidade (título ou slug) fica: a candidata só reforça.
      const slugCore = livre && !identidade && subjectSlugCoreSwap(target, old, candidate);
      const principalOk = livre && !identidade && (slugCore || keepsIntent(old, candidate) && (match.cover >= 0.75 || match.serp >= 2 || contains(copyWords(candidate.keyword), line.entity)));
      /*
       * A evidência da SERP primeiro; reescrever a principal ou o slug conta; a
       * frase com as MESMAS palavras da principal (só reordenada) quase não
       * acrescenta cobertura; palavra que só a SERP usa (marca, cidade) conta
       * contra. O volume desempata no alocador.
       */
      const mesmaFrase = line.principal.size > 0 && copyWords(candidate.keyword).size === line.principal.size && contains(copyWords(candidate.keyword), line.principal);
      return [{ targetId: target.id, keywordId: candidate.id, tier: match.serp >= 2 ? 0 : 1, score: match.serp * 3 + (match.cover >= 0.75 ? 3 : 0) - (mesmaFrase ? 3 : 0) - match.serpOnlyWords * 2, volume: candidate.volume!, match, principalOk, slugCore }];
    });
  });
  /*
   * 2026-10-17 · SEM CANIBALIZAÇÃO DENTRO DO SILO (regra do dono). As variantes
   * da MESMA busca — mesmas palavras sem as de ligação, plural ou singular,
   * qualquer ordem ("plano de internet residencial", "planos de internet
   * residencial", "plano internet residencial") — vão TODAS para UM artigo do
   * Silo: o que tem a principal com essas palavras; sem isso, o que melhor as
   * contém na principal, no slug e no Assunto (o Pilar desempata). Assim uma
   * secundária nunca é variante da principal ou de uma secundária de outro
   * artigo do mesmo Silo.
   */
  const donoDaVariante = new Map<string, string>();
  const chavesDasPrincipais = new Map<string, string>();
  // A variante de uma keyword que JÁ está num artigo do Silo (secundária dele) é desse artigo: nunca de outro.
  const chavesDosMembros = new Map<string, string>();
  for (const target of targets) {
    const principal = linhas.get(target.id)?.principal;
    if (principal?.size && target.territoryRef) chavesDasPrincipais.set(`${target.territoryRef}|${chaveDaVariante(principal)}`, target.id);
    if (target.territoryRef) for (const id of target.memberIds) { const membro = byId.get(id); if (membro) chavesDosMembros.set(`${target.territoryRef}|${chaveDaVariante(copyWords(membro.keyword))}`, target.id); }
  }
  const porVariante = new Map<string, CopyEdge[]>();
  for (const edge of brutas) {
    const target = targets.find(t => t.id === edge.targetId)!;
    const chave = `${target.territoryRef}|${chaveDaVariante(copyWords(byId.get(edge.keywordId)?.keyword))}`;
    porVariante.set(chave, [...(porVariante.get(chave) ?? []), edge]);
  }
  for (const [chave, arestas] of porVariante) {
    const daPrincipal = chavesDasPrincipais.get(chave) ?? chavesDosMembros.get(chave);
    if (daPrincipal) { donoDaVariante.set(chave, daPrincipal); continue; }
    const palavras = new Set(chave.split("|")[1].split(" ").filter(Boolean));
    const melhor = [...new Set(arestas.map(edge => edge.targetId))]
      .map(id => ({ id, afinidade: afinidadeNoSilo(targets.find(t => t.id === id)!, linhas.get(id)!, palavras), serp: Math.max(...arestas.filter(edge => edge.targetId === id).map(edge => edge.match.serp)) }))
      .sort((a, b) => b.afinidade - a.afinidade || b.serp - a.serp || a.id.localeCompare(b.id))[0];
    if (melhor) donoDaVariante.set(chave, melhor.id);
  }
  /*
   * A secundária reforça ESTE artigo: leva uma palavra que é dele (da principal,
   * do slug, do Assunto ou dos detalhes) e não só o assunto comum do Silo
   * ("internet residencial wifi" não reforça "internet residencial barata"). A
   * variante da própria principal vale, mas no máximo duas (é a mesma busca).
   */
  const contagemNoSilo = new Map<string, number>();
  for (const target of targets) for (const word of linhas.get(target.id)?.principal ?? []) contagemNoSilo.set(`${target.territoryRef}|${word}`, (contagemNoSilo.get(`${target.territoryRef}|${word}`) ?? 0) + 1);
  const variantesDaPrincipal = new Map<string, number>();
  return brutas
    .filter(edge => {
      const target = targets.find(t => t.id === edge.targetId)!;
      return donoDaVariante.get(`${target.territoryRef}|${chaveDaVariante(copyWords(byId.get(edge.keywordId)?.keyword))}`) === edge.targetId;
    })
    .sort((a, b) => b.volume - a.volume)
    .filter(edge => {
      const target = targets.find(t => t.id === edge.targetId)!, line = linhas.get(target.id)!;
      const palavras = copyWords(byId.get(edge.keywordId)?.keyword);
      const daPrincipal = line.principal.size > 0 && chaveDaVariante(palavras) === chaveDaVariante(line.principal);
      if (daPrincipal) {
        const ja = variantesDaPrincipal.get(target.id) ?? 0;
        if (ja >= 2 && !edge.principalOk) return false;
        variantesDaPrincipal.set(target.id, ja + 1);
        return true;
      }
      const proprias = [...palavras].filter(word => line.words.has(word) && (contagemNoSilo.get(`${target.territoryRef}|${word}`) ?? 0) < 2);
      return proprias.length > 0;
    });
}
/** Do plano: a candidata é a cabeça mais ampla da principal (só palavras dela, menos que todas) e tem mais volume. */
function cabecaDaPrincipal(principal: ImprovementKeyword | undefined, candidate: ImprovementKeyword): boolean {
  if (!principal?.volumeValidated || !(principal.volume! > 0) || !(candidate.volume! > principal.volume!)) return false;
  const daPrincipal = copyWords(principal.keyword), daCandidata = copyWords(candidate.keyword);
  return daCandidata.size < daPrincipal.size && [...daCandidata].every(word => daPrincipal.has(word));
}
const copyReason = (candidate: ImprovementKeyword, match: ImprovementCopyMatch, principalText: string | null) => match.where
  ? `“${candidate.keyword}” (${candidate.volume}) aparece nas ${match.where} da SERP de “${principalText ?? "principal"}” (em cache, grátis).`
  : `“${candidate.keyword}” (${candidate.volume}) é a mesma busca da principal ou do slug, dita de outro jeito (Assunto, slug e DNA).`;
export const COPY_LINE_LABEL = "Linha de copy · Assunto, slug, DNA e a SERP da principal";

/**
 * As SEMENTES da busca nova no Google Ads (§15: "busca sem semente do plano ou
 * do DNA não roda"): a principal, o slug, a entidade do DNA, o Assunto e as
 * buscas relacionadas da SERP da principal (cache) que estão na linha de copy.
 * Vazio = o alvo não tem de onde semear; a busca dele não roda.
 */
export function improvementDiscoverySeeds(target: ImprovementTarget, byId: ReadonlyMap<string, ImprovementKeyword>, vocabulary: ImprovementSerpVocabulary | null | undefined, assuntoSeeds: readonly string[] = []): string[] {
  const line = improvementCopyLine(target, byId, vocabulary);
  /*
   * 2026-10-17 · nada de procurar à toa: semente de uma palavra só ("internet",
   * "plano") é cabeça genérica e não diz do que o artigo fala; e a relacionada
   * com marca (operadora) só semeia o artigo que nomeia aquela marca ou fala de
   * operadoras — a MESMA regra do alocador (as ideias dela seriam recusadas).
   */
  // As marcas que a SERP da principal mostra (rótulo do domínio dos concorrentes: "vivo.com.br" → vivo).
  const marcas = new Set((vocabulary?.domains ?? []).map(rotuloDoDominio).filter((rotulo): rotulo is string => Boolean(rotulo)));
  const doArtigo = nucleoDoArtigo(target, line);
  const nomeiaOperadoras = [...doArtigo].some(word => OPERATOR_WORDS.has(word));
  const marcasDe = (seed: string) => [...copyWords(seed)].filter(word => marcas.has(word));
  const marcaAlheia = (seed: string) => { const daSemente = marcasDe(seed); return daSemente.length > 0 && !nomeiaOperadoras && !daSemente.every(word => doArtigo.has(word)); };
  const relacionadas = (vocabulary?.relatedSearches ?? []).filter(phrase => { const daFrase = marcasDe(phrase); return !localSearchOf(phrase) && !marcaAlheia(phrase) && copyLineMatch(line, phrase, daFrase.length ? new Set(daFrase) : undefined).fits; }).slice(0, 4);
  // Pedaços do TÍTULO só quando o Assunto não tem keyword nem slug (formato antigo): "Veja o que entra na conta" trazia "entra na conta do google".
  const doTitulo = line.principalText || line.slug.size ? [] : assuntoSeeds;
  const sementes = [line.principalText, lastSlugSegment(target.slug ?? target.planSlug ?? null), target.signals.centralEntity, ...doTitulo, ...relacionadas]
    .map(seed => (seed ?? "").trim())
    .filter(seed => copyWords(seed).size > 0 && (seed === line.principalText || copyWords(seed).size >= 2) && !marcaAlheia(seed));
  const vistas = new Set<string>();
  return sementes.filter(seed => { const k = key(seed); if (vistas.has(k)) return false; vistas.add(k); return true; }).slice(0, 10);
}
/** A ideia da busca nova está na linha de copy deste alvo? (só texto; volume e dono são lidos depois) */
export function improvementIdeaOnCopyLine(target: ImprovementTarget, byId: ReadonlyMap<string, ImprovementKeyword>, vocabulary: ImprovementSerpVocabulary | null | undefined, phrase: string): boolean {
  return copyLineMatch(improvementCopyLine(target, byId, vocabulary), phrase).fits && !localSearchOf(phrase);
}

/** One allocator, whole brand, no ownership granted to discarded proposals. */
export function planArticleImprovements(input: {
  targets: readonly ImprovementTarget[]; keywords: readonly ImprovementKeyword[]; evidence: readonly ImprovementEvidence[];
  /** Escolhas da IA já validadas; valem só para quem ficou sem proposta pronta pela SERP. */
  editorialPicks?: readonly ImprovementEditorialPick[];
  /** Por publicado: `true` a página ranqueia (não troca principal), `false` não ranqueia, `null` leitura indisponível. */
  ranking?: Readonly<Record<string, boolean | null>>;
  /** `false` só no passo 1 do prepare (pares da SERP), antes de a IA ler: a leitura da lista pelo código vem depois dela. */
  listReading?: boolean;
  /** 2026-10-16 · §15: a SERP da principal de cada alvo, já em cache (grátis), por alvo. Ausente = só a linha de copy do plano e do DNA. */
  serpVocabulary?: Readonly<Record<string, ImprovementSerpVocabulary>>;
}): ImprovementProposal[] {
  const byId = new Map(input.keywords.map(k => [k.id, k]));
  const observations = new Map(input.evidence.map(e => [`${e.targetId}:${e.keywordId}`, e]));
  /** F4 — a principal declarada de um Assunto do plano pertence ao artigo dele; nunca reforça outro. */
  const declaredOwner = new Map(input.targets.filter(t => t.declaredPrincipalId).map(t => [t.declaredPrincipalId!, t.id]));
  const pairEdges = input.targets.flatMap(target => input.keywords.flatMap(candidate => {
    if (candidate.published || !candidate.volumeValidated || !(candidate.volume! > 0) || (candidate.ownerId && candidate.ownerId !== target.id)) return [];
    if (declaredOwner.has(candidate.id) && declaredOwner.get(candidate.id) !== target.id) return [];
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
  /*
   * 1b · A LINHA DE COPY (2026-10-16, §15 passos 3b e 4). Para cada par alvo ×
   * keyword fica a melhor aresta: o par da SERP (as duas SERPs no cache) ou a
   * linha de copy com a SERP da principal. A candidata que o Google contradiz
   * (zero páginas com a principal de volume) fica fora.
   */
  const copyEdges = copyLineEdges(input.targets, input.keywords, byId, input.serpVocabulary ?? {})
    .filter(edge => !(declaredOwner.has(edge.keywordId) && declaredOwner.get(edge.keywordId) !== edge.targetId) && !observations.get(`${edge.targetId}:${edge.keywordId}`)?.contradiction);
  const copyByPair = new Map(copyEdges.map(edge => [`${edge.targetId}:${edge.keywordId}`, edge]));
  const eligible = [...pairEdges];
  for (const edge of copyEdges) {
    const index = eligible.findIndex(e => e.targetId === edge.targetId && e.keywordId === edge.keywordId);
    if (index < 0) eligible.push({ targetId: edge.targetId, keywordId: edge.keywordId, tier: edge.tier, score: edge.score, volume: edge.volume });
    else if (edge.tier < eligible[index].tier || (edge.tier === eligible[index].tier && edge.score > eligible[index].score)) eligible[index] = { ...eligible[index], tier: edge.tier, score: edge.score };
  }
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
  // F4 — a principal declarada ocupa a vaga dela no artigo do plano, com ou sem volume.
  for (const t of input.targets) if (t.declaredPrincipalId) fixed.set(t.declaredPrincipalId, t.id);
  const owners = allocateReinforcementChoices({
    targets: input.targets.map(t => ({ id: t.id, capacity: Math.max(0, 6 - [...fixed.values()].filter(id => id === t.id).length), priority: (byId.get(t.primaryId ?? "")?.volumeValidated ? 10 : 0) + (t.kind === "published" ? 0 : 1) })),
    edges: eligible, fixed,
  });
  const proposals = input.targets.map(target => {
    const kept = target.memberIds.filter(id => fixed.get(id) === target.id);
    let added = [...owners].filter(([id, owner]) => owner === target.id && !kept.includes(id)).map(([id]) => id);
    const candidates = [...kept, ...added].filter(id => eligible.some(e => e.targetId === target.id && e.keywordId === id)).map(id => byId.get(id)!).sort((a, b) => (eligible.find(e => e.targetId === target.id && e.keywordId === a.id)?.tier ?? 2) - (eligible.find(e => e.targetId === target.id && e.keywordId === b.id)?.tier ?? 2) || b.volume! - a.volume!);
    const old = byId.get(target.primaryId ?? "");
    /*
     * Publicado: só a principal SEM volume é Livre para trocar (dono,
     * 2026-10-01: "só as que têm volume estão travadas ao slug"). Antes, uma
     * candidata com mais volume trocava a principal com volume ("marketing
     * digital para dentistas" 70 → "marketing para dentistas" 210). O Assunto
     * segue como antes: ganha a principal de maior volume.
     */
    // F4 — com principal declarada no plano, a melhoria nunca troca a principal (D1-bis).
    // 2026-10-17 · a principal de identidade (título ou slug) também nunca troca sozinha: as mais amplas só reforçam.
    const identidade = Boolean(old) && !target.declaredPrincipalId && targetPrincipalIsIdentity(target, old);
    const needsPrimary = target.declaredPrincipalId || identidade ? false : target.kind === "subject"
      ? !old?.volumeValidated || (candidates[0]?.volume ?? 0) > (old.volume ?? 0)
      : target.post === "free" && !old?.volumeValidated;
    /*
     * 2026-10-16 · §15 passo 3b — a Livre SEM volume do plano troca pela
     * candidata da linha de copy que mantém a entidade e a intenção: a mais
     * próxima da principal e do slug, depois a de mais evidência na SERP; o
     * volume só desempata. Sem nenhuma que mantenha a intenção, a principal fica
     * e o artigo só recebe reforço (nunca uma troca que mude o assunto).
     * SUBSTITUÍDO em 2026-10-17 como padrão (dono, "Principal de identidade"):
     * só quando a principal NÃO é a identidade do Assunto (fora do título e do
     * slug). Identidade fica, com pouco ou nenhum volume.
     */
    const livreSemVolume = target.kind === "subject" && !target.declaredPrincipalId && !old?.volumeValidated && !identidade;
    const daLinhaDeCopy = (id: string) => copyByPair.get(`${target.id}:${id}`);
    /*
     * 2026-10-17 · ORDEM (SDD da linha única §13 D2, item 1 primeiro): a que leva
     * o núcleo do slug vem antes; entre elas, no Pilar, a de cauda curta com mais
     * volume (AGENTS.md §13: "termos de maior volume e cauda menor tendem a
     * Pilar"); depois, como antes, a mais próxima da principal e do slug, a de
     * mais evidência na SERP e o volume.
     */
    const levaONucleo = (k: ImprovementKeyword) => daLinhaDeCopy(k.id)?.slugCore ?? subjectSlugCoreSwap(target, old, k);
    const pilar = target.planRole === "Pilar";
    const pelaLinha = livreSemVolume && candidates.some(k => daLinhaDeCopy(k.id))
      ? candidates.filter(k => daLinhaDeCopy(k.id) ? daLinhaDeCopy(k.id)!.principalOk : keepsIntent(old, k) || subjectSlugCoreSwap(target, old, k))
        .sort((a, b) => {
          const x = daLinhaDeCopy(a.id)?.match, y = daLinhaDeCopy(b.id)?.match, na = levaONucleo(a), nb = levaONucleo(b);
          return Number(nb) - Number(na)
            || (pilar && na && nb ? copyWords(a.keyword).size - copyWords(b.keyword).size || b.volume! - a.volume! : 0)
            || (y?.cover ?? 0) - (x?.cover ?? 0) || (y?.serp ?? 0) - (x?.serp ?? 0) || b.volume! - a.volume!;
        })
      : null;
    const principalId = target.declaredPrincipalId ?? (needsPrimary ? (pelaLinha ? pelaLinha[0]?.id ?? target.primaryId : candidates[0]?.id ?? target.primaryId) : target.primaryId);
    /*
     * 2026-10-17 · no Suporte do plano, a cabeça mais ampla que a principal não
     * fica: ela é do Pilar. Com a troca, compara com a NOVA principal (mais
     * volume e só palavras dela); sem troca e com a principal sem volume, toda
     * busca que é só um pedaço da principal ("claro internet residencial" em
     * "claro vivo ou tim internet residencial") é mais ampla que o artigo.
     */
    /*
     * 2026-10-17 · com a principal de identidade SEM volume (ela fica), as buscas
     * mais amplas que são pedaços dela reforçam o contexto (dono: "as keywords
     * mais amplas podem reforçar o contexto"); no Suporte só fica de fora o
     * pedaço que é cabeça de verdade (mais de `BROAD_HEAD_MAX_VOLUME`, a página
     * de nicho não ranqueia nela — "vivo internet residencial", 22.200): essa é
     * do Pilar. As outras regras do Silo (variante num artigo só, palavra própria
     * do artigo, marca) já valeram nas arestas.
     */
    if (target.planRole === "Suporte" && principalId) {
      const base = byId.get(principalId);
      const pedacoDa = (frase: string | undefined, k: ImprovementKeyword) => { const da = copyWords(frase), dela = copyWords(k.keyword); return dela.size < da.size && [...dela].every(word => da.has(word)); };
      const cabecaDoPedaco = (k: ImprovementKeyword) => pedacoDa(base?.keyword ?? old?.keyword, k) && (!identidade || (k.volume ?? 0) > BROAD_HEAD_MAX_VOLUME);
      added = added.filter(id => id === principalId || !(base?.volumeValidated ? cabecaDaPrincipal(base, byId.get(id)!) || headOverPrincipal(base, byId.get(id)!) : cabecaDoPedaco(byId.get(id)!)));
    }
    // Avoid churn: a weak support leaves only when there is a real replacement.
    const weak = target.memberIds.filter(id => !kept.includes(id));
    const removeIds = added.length ? weak.slice(0, Math.max(0, target.memberIds.length + added.length - 6)) : [];
    const members = [...new Set([...target.memberIds.filter(id => !removeIds.includes(id)), ...added])];
    const proof = principalId ? observations.get(`${target.id}:${principalId}`) : null;
    const reasons = [target.kind === "published" ? "URL, slug, canonical e Silo publicados preservados." : "Assunto declarado mantido como fundamento, fora das seis keywords."];
    if (target.post === "unknown" && target.kind === "published") reasons.push("Posto não declarado: principal atual preservada; só apoios podem entrar.");
    const novaPrincipal = principalId && principalId !== target.primaryId ? byId.get(principalId) : null;
    if (novaPrincipal && target.kind === "published" && !coversSlugSubject(target.slug, novaPrincipal.keyword)) reasons.push(broaderPrincipalReason(novaPrincipal.keyword));
    // 2026-10-16 · §15: o que entrou pela linha de copy (sem par da SERP com 2+ páginas) diz de onde veio, uma frase por keyword.
    const provadoPeloPar = (id: string) => { const par = observations.get(`${target.id}:${id}`); return Boolean(par?.complete && par.sharedPages >= 2 && pairEdges.some(e => e.targetId === target.id && e.keywordId === id)); };
    const pelaCopy = [...new Set([...added, ...(principalId && principalId !== target.primaryId ? [principalId] : [])])].filter(id => daLinhaDeCopy(id) && !provadoPeloPar(id));
    const linha = pelaCopy.length ? improvementCopyLine(target, byId, input.serpVocabulary?.[target.id] ?? null) : null;
    if (principalId && principalId !== target.primaryId && pelaCopy.includes(principalId)) {
      const nova = byId.get(principalId)!;
      const peloNucleo = daLinhaDeCopy(principalId)?.slugCore === true;
      const nucleo = peloNucleo ? slugCoreWords(subjectSlugOf(target), target.signals.centralEntity).join(" + ") : "";
      reasons.push(`Livre sem volume e fora da identidade (“${old?.keyword ?? target.theme}” não está no título nem no slug do Assunto): “${nova.keyword}” (${nova.volume}) assume como principal pelo Assunto, pelo slug e pelo DNA (${peloNucleo ? `leva o núcleo do slug, ${nucleo}` : "mesma entidade e mesma intenção"}); “${old?.keyword ?? target.theme}” continua no artigo como o Assunto (fundamento), e o título e o slug do plano ficam. Proposta: decisão sua na prévia.`);
    } else if (principalId && principalId !== target.primaryId) reasons.push(proof && proof.sharedPages < 2 ? "Nova principal sustentada pelo fundamento editorial e pela SERP completa da candidata; não por coincidência com a frase antiga." : "Principal com demanda medida e compatibilidade de SERP.");
    /*
     * 2026-10-17 (noite) · amarelo da WifiConecta: o artigo do plano ou do Assunto que ainda NÃO tem ArticleDNA e cuja
     * principal é a IDENTIDADE (T12) forma com ela, mesmo sem nenhuma candidata de reforço — formar o primeiro DNA é
     * mudança. Sem isto, a Livre sem volume e sem candidata saía "evidência insuficiente", com zero membros, e o
     * "Concluir formação" a recusava com "use Procurar outra principal": a regra da identidade não chegava ao Concluir.
     * A principal entra nos membros por `enforceSubjectMembership` (a de sempre).
     */
    const formaOPrimeiro = target.kind === "subject" && !target.memberIds.length && Boolean(principalId) && principalId === target.primaryId && identidade && !old?.published;
    // 2026-10-17 · a principal de identidade fica com pouco ou nenhum volume; a linha diz por quê.
    if (identidade && old && !old.volumeValidated && (target.kind === "subject" || target.post === "free") && (added.length || candidates.length || formaOPrimeiro)) reasons.push(identityPrincipalReason(target, old));
    if (livreSemVolume && pelaLinha && !pelaLinha.length && added.length) reasons.push(`Nenhuma candidata com volume mantém a intenção de “${old?.keyword ?? target.theme}” nem leva o núcleo do slug: a principal fica e o artigo só recebe reforço.`);
    for (const id of pelaCopy.filter(id => id !== principalId || principalId === target.primaryId)) reasons.push(`${COPY_LINE_LABEL}: ${copyReason(byId.get(id)!, daLinhaDeCopy(id)!.match, linha?.principalText ?? null)}`);
    const mudou = added.length || principalId !== target.primaryId || formaOPrimeiro;
    return { targetId: target.id, kind: target.kind, theme: target.theme, currentPrimaryId: target.primaryId, principalId, memberIds: members, addIds: added, removeIds, transfers: added.filter(id => byId.get(id)?.territoryRef !== target.territoryRef), angle: angleOf(byId.get(principalId ?? "")), exclusions: [], reasons,
      status: !target.territoryRef ? "insufficient_evidence" : mudou && principalId ? "ready" : old?.volumeValidated ? "adequate" : eligible.some(e => e.targetId === target.id) ? "no_alternative" : "insufficient_evidence",
      evidenceBasis: mudou ? pelaCopy.length ? "copy_line" : proof && proof.sharedPages >= 2 ? "serp" : "editorial_and_candidate_serp" : null,
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
  if (input.listReading === false) return enforceSubjectMembership(input.targets, enforceChosenPrincipals(input.targets, enforceDeclaredPrincipals(input.targets, proposals, byId), byId), byId);
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
  /*
   * 5 · PRINCIPAL SEM VOLUME COM POSTO LIVRE: troca pela keyword do artigo
   * com mais sentido com o slug (`volumelessPrincipalSwap`). Aqui, só para
   * quem ficou sem proposta pronta; quando a IA ou a lista propõem e a SERP
   * não confirma, o servidor tenta esta troca depois (refreshPlan).
   */
  input.targets.forEach((target, index) => {
    if (proposals[index].status === "ready") return;
    const troca = volumelessPrincipalSwap(target, byId, input.ranking?.[target.id], id => observations.get(`${target.id}:${id}`)?.contradiction === true);
    if (troca) proposals[index] = troca;
  });
  for (const p of proposals) { p.exclusions = [...new Set(p.exclusions)]; p.reasons = [...new Set(p.reasons)]; }
  return enforceSubjectMembership(input.targets, enforceChosenPrincipals(input.targets, enforceDeclaredPrincipals(input.targets, proposals, byId), byId), byId);
}

/** 2026-10-16 · o motivo da prévia quando a keyword do Assunto deixa de ser a principal. */
export const SUBJECT_KEYWORD_STAYS_SUBJECT_REASON = "A keyword do Assunto sai das keywords e continua no artigo como o Assunto (fundamento): o contrato do ArticleDNA não deixa o Assunto ser secundária do próprio artigo.";

/**
 * 2026-10-16 · O ARTIGO DO ASSUNTO FECHA A CONTA: a principal está entre as
 * keywords (a Livre que fica, sem artigo ainda, entra como a principal), a
 * keyword que carrega o Assunto só fica como principal (trocada, ela sai das
 * keywords e continua como o Assunto) e o teto de seis vale, tirando a última
 * entrada nova.
 */
function enforceSubjectMembership(targets: readonly ImprovementTarget[], proposals: ImprovementProposal[], byId: ReadonlyMap<string, ImprovementKeyword>): ImprovementProposal[] {
  targets.forEach((target, index) => {
    const p = proposals[index];
    if (target.kind !== "subject" || p.status !== "ready" || !p.principalId) return;
    let membros = p.memberIds.includes(p.principalId) ? [...p.memberIds] : [p.principalId, ...p.memberIds];
    const carregaOAssunto = byId.get(target.id)?.ownerId === target.id;
    if (carregaOAssunto && p.principalId !== target.id && membros.includes(target.id)) {
      membros = membros.filter(id => id !== target.id);
      if (target.memberIds.includes(target.id) && !p.removeIds.includes(target.id)) p.removeIds = [...p.removeIds, target.id];
      p.reasons = [...new Set([...p.reasons, SUBJECT_KEYWORD_STAYS_SUBJECT_REASON])];
    }
    while (membros.length > IMPROVEMENT_ARTICLE_MAX_KEYWORDS) {
      // Sai a entrada nova mais fraca (menos volume); a principal nunca.
      const sai = p.addIds.filter(id => id !== p.principalId && membros.includes(id)).sort((a, b) => (byId.get(a)?.volume ?? 0) - (byId.get(b)?.volume ?? 0))[0];
      if (!sai) break;
      const nome = byId.get(sai)?.keyword;
      membros = membros.filter(id => id !== sai);
      p.addIds = p.addIds.filter(id => id !== sai);
      p.transfers = p.transfers.filter(id => id !== sai);
      p.aiReasons = p.aiReasons?.filter(item => item.keywordId !== sai);
      if (nome) p.reasons = p.reasons.filter(reason => !(reason.startsWith(COPY_LINE_LABEL) && reason.includes(`“${nome}”`)));
    }
    p.memberIds = membros;
  });
  return proposals;
}

/** F5 — o motivo que a prévia mostra quando o humano escolheu a principal na planilha. */
export const CHOSEN_PRINCIPAL_REASON = "Troca de principal escolhida por você na linha do plano (“Procurar outra principal”, trava Livre, decisão humana).";

/**
 * F5 · PLANILHA PRIMEIRO — "TROCAR PRINCIPAL" (SDD 2026-10-13, item 5). A
 * escolha do humano vale depois de qualquer leitura (pares da SERP, IA, lista):
 * a escolhida vira a principal, a principal anterior fica como secundária (o
 * Assunto continua no artigo) e o resto da composição atual continua; nada
 * mais entra por esta troca. Principal declarada TRAVADA nunca é trocada
 * (`declaredPrincipalId` vence; a escolha chega recusada pelo servidor). A
 * SERP da composição continua decidindo no `refreshPlan`, pelo cache.
 */
function enforceChosenPrincipals(targets: readonly ImprovementTarget[], proposals: ImprovementProposal[], byId: ReadonlyMap<string, ImprovementKeyword>): ImprovementProposal[] {
  targets.forEach((target, index) => {
    const p = proposals[index];
    if (target.principalChoiceRefusal) {
      p.status = "no_alternative";
      p.reasons = [...new Set([...p.reasons, target.principalChoiceRefusal])];
      return;
    }
    const escolhida = target.chosenPrincipalId;
    if (!escolhida || target.declaredPrincipalId) return;
    const anterior = target.primaryId;
    /*
     * A keyword que carrega o Assunto (cadastro único) não pode ser secundária
     * do próprio artigo: trocada, ela sai das keywords e continua como o
     * Assunto (fundamento) — a regra de `attachSubjectToArticleDna`.
     */
    const doAssunto = (id: string) => target.kind === "subject" && id === target.id && id !== escolhida;
    const membros = [...new Set([escolhida, ...(anterior ? [anterior] : []), ...target.memberIds])].filter(id => !doAssunto(id));
    while (membros.length > IMPROVEMENT_ARTICLE_MAX_KEYWORDS) {
      const sai = [...membros].reverse().find(id => id !== escolhida && id !== anterior);
      if (!sai) break;
      membros.splice(membros.indexOf(sai), 1);
    }
    p.principalId = escolhida;
    p.memberIds = membros;
    p.addIds = membros.filter(id => !target.memberIds.includes(id));
    p.removeIds = target.memberIds.filter(id => !membros.includes(id));
    p.transfers = p.addIds.filter(id => byId.has(id) && byId.get(id)?.territoryRef !== target.territoryRef);
    p.angle = angleOf(byId.get(escolhida)) || p.angle;
    delete p.aiReasons;
    p.evidenceBasis = "editorial_and_candidate_serp";
    const nome = (id: string | null) => (id ? byId.get(id)?.keyword : null) ?? (id === target.id ? target.theme : id) ?? "nenhuma";
    p.reasons = [
      ...p.reasons.filter(reason => !/^Principal com volume escolhida na lista|^Nova principal sustentada|^Principal com demanda medida/.test(reason)),
      escolhida === anterior ? `${CHOSEN_PRINCIPAL_REASON} “${nome(escolhida)}” já é a principal.`
        : anterior && doAssunto(anterior) ? `${CHOSEN_PRINCIPAL_REASON} “${nome(anterior)}” → “${nome(escolhida)}”; a keyword do Assunto sai das keywords e o Assunto continua no artigo (fundamento).`
        : `${CHOSEN_PRINCIPAL_REASON} “${nome(anterior)}” → “${nome(escolhida)}”; “${nome(anterior)}” fica como secundária e o Assunto continua no artigo.`,
    ];
    p.reasons = [...new Set(p.reasons)];
    p.status = !target.territoryRef ? "insufficient_evidence" : escolhida === anterior && !p.addIds.length && !p.removeIds.length ? "adequate" : "ready";
  });
  return proposals;
}

/** F4 — o motivo que a prévia mostra quando a principal declarada assume. */
/* 2026-10-17 (noite) · SUBSTITUÍDO o "mesmo sem volume medido", que aparecia também na Travada COM volume (amarelo: "internet residencial barata", 1.600). */
export const DECLARED_PRINCIPAL_IMPROVEMENT_REASON = "Principal declarada no plano: fica como principal (Travada ou com volume definido).";
export const DECLARED_PLAN_PENDING_REASON = "Plano declarado: a descrição do escopo vira a promessa e o papel do plano vira a hierarquia (D8).";

/**
 * F4 — A ÚLTIMA PALAVRA É DO PLANO. Qualquer leitura acima (pares da SERP, IA,
 * núcleo do slug) pode ter proposto outra principal; aqui a declarada volta a
 * ser a principal, entra nos membros (a antiga fica como secundária) e o teto
 * de seis é respeitado tirando a última entrada nova. Sem plano, nada muda.
 */
function enforceDeclaredPrincipals(targets: readonly ImprovementTarget[], proposals: ImprovementProposal[], byId: ReadonlyMap<string, ImprovementKeyword>): ImprovementProposal[] {
  targets.forEach((target, index) => {
    const declarada = target.declaredPrincipalId;
    if (!declarada) return;
    const p = proposals[index];
    const membros = [...new Set([declarada, ...p.memberIds])];
    while (membros.length > IMPROVEMENT_ARTICLE_MAX_KEYWORDS) {
      const sai = [...p.addIds].reverse().find(id => id !== declarada && membros.includes(id));
      if (!sai) break;
      membros.splice(membros.indexOf(sai), 1);
      p.addIds = p.addIds.filter(id => id !== sai);
      p.aiReasons = p.aiReasons?.filter(item => item.keywordId !== sai);
    }
    const trocou = declarada !== target.primaryId;
    if (trocou && !p.addIds.includes(declarada) && !target.memberIds.includes(declarada)) p.addIds = [...p.addIds, declarada];
    p.principalId = declarada;
    p.memberIds = membros;
    p.transfers = p.addIds.filter(id => byId.get(id)?.territoryRef !== target.territoryRef);
    if (p.angle === "" || trocou) p.angle = angleOf(byId.get(declarada)) || p.angle;
    p.reasons = p.reasons.filter(reason => !/^Principal com volume escolhida na lista|^Nova principal sustentada|^Principal com demanda medida/.test(reason));
    p.reasons.push(trocou ? `${DECLARED_PRINCIPAL_IMPROVEMENT_REASON} “${byId.get(target.primaryId ?? "")?.keyword ?? target.theme}” fica como secundária.` : DECLARED_PRINCIPAL_IMPROVEMENT_REASON);
    if (target.declaredPlanPending) p.reasons.push(DECLARED_PLAN_PENDING_REASON);
    if (target.territoryRef && (trocou || p.addIds.length || target.declaredPlanPending)) {
      p.status = "ready";
      p.evidenceBasis = p.evidenceBasis ?? "editorial_and_candidate_serp";
    }
    p.reasons = [...new Set(p.reasons)];
  });
  return proposals;
}

/*
 * PRINCIPAL SEM VOLUME COM POSTO LIVRE TROCA PELA KEYWORD DO PRÓPRIO ARTIGO
 * COM MAIS SENTIDO COM O SLUG (dono, 2026-10-01).
 *
 * Só a principal com volume fica travada ao slug; a que não tem volume é Livre
 * para ser trocada. Assume a keyword com volume JÁ NO ARTIGO (não publicada,
 * sem outro dono) que tem mais sentido com o slug — não a de maior volume:
 * primeiro a que leva o núcleo do slug, depois a que divide mais palavras com
 * ele (sinônimos atrair/captar, paciente/cliente), depois a mais enxuta; o
 * volume só desempata. Sem palavra em comum com o slug, não troca. A página
 * fica secundária: nada entra nem sai, URL, slug e canonical ficam. Ao
 * gravar, a SERP desta composição é relida pelo cache e decide.
 */
export function volumelessPrincipalSwap(
  target: ImprovementTarget,
  byId: ReadonlyMap<string, ImprovementKeyword>,
  ranking?: boolean | null,
  contradicts: (keywordId: string) => boolean = () => false,
): ImprovementProposal | null {
  if (target.kind !== "published" || target.post !== "free" || !target.territoryRef) return null;
  const atual = byId.get(target.primaryId ?? "");
  if (atual?.volumeValidated && (atual.volume ?? 0) > 0) return null;
  // 2026-10-17 · Principal de identidade (o slug publicado foi feito dela): fica; a reserva não troca.
  if (targetPrincipalIsIdentity(target, atual)) return null;
  const doSlug = aliased(slugWords(targetSubjectText(target)), CORE_ALIASES);
  const nucleo = aliased(slugCoreWords(targetSubjectText(target)), CORE_ALIASES);
  const afinidade = (k: ImprovementKeyword) => {
    const palavras = aliased(slugWords(k.keyword), CORE_ALIASES);
    const comuns = [...palavras].filter(word => doSlug.has(word)).length;
    return { nucleo: nucleo.size > 0 && [...nucleo].every(word => palavras.has(word)) ? 1 : 0, comuns, precisao: palavras.size ? comuns / palavras.size : 0 };
  };
  const melhor = target.memberIds
    .map(id => byId.get(id))
    .filter((k): k is ImprovementKeyword => Boolean(k) && k!.id !== target.primaryId && !k!.published && k!.volumeValidated && (k!.volume ?? 0) > 0 && (!k!.ownerId || k!.ownerId === target.id) && !contradicts(k!.id))
    .map(k => ({ k, a: afinidade(k) }))
    .filter(item => item.a.comuns > 0)
    .sort((x, y) => y.a.nucleo - x.a.nucleo || y.a.comuns - x.a.comuns || y.a.precisao - x.a.precisao || (y.k.volume ?? 0) - (x.k.volume ?? 0))[0]?.k;
  if (!melhor) return null;
  return {
    targetId: target.id, kind: target.kind, theme: target.theme,
    currentPrimaryId: target.primaryId, principalId: melhor.id, memberIds: [...target.memberIds],
    addIds: [], removeIds: [], transfers: [], angle: angleOf(melhor), exclusions: [],
    reasons: [
      "URL, slug, canonical e Silo publicados preservados.",
      `Principal sem volume com Posto Livre: “${melhor.keyword}” (${melhor.volume}), já no artigo e a mais próxima do slug em sentido e palavras, assume; “${atual?.keyword ?? target.theme}” fica como secundária. Nada entra nem sai.`,
      "A SERP desta composição é relida pelo cache ao gravar e decide.",
      ...(ranking === true ? ["A página ranqueia hoje para a frase antiga: risco de ranking é aviso, não revoga o Posto Livre."] : []),
    ],
    status: "ready", evidenceBasis: "serp",
  };
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
      // 2026-10-17 · a proposta que não ficou pronta não leva keyword nenhuma: conta só o que o artigo já tem.
      const ativos = (p: ImprovementProposal, t: ImprovementTarget) => p.status === "ready" ? p.memberIds : t.memberIds;
      const compartilham = ativos(a, ta).some(id => id !== ta.primaryId && id !== tb.primaryId && ativos(b, tb).includes(id));
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
