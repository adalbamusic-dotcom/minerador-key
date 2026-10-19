import { allocateReinforcementChoices } from "./reinforcement-allocation.ts";
import { intentComparisonKey, type KeywordDnaSignals } from "./keyword-dna-signals.ts";
import { classifySlugFit } from "./published-slug-fit.ts";
import { normalizeKeyword } from "../minerador/keyword-import-core.ts";
import { normalizeBrandSerpLocationText, type BrandSerpTerritory } from "../marca/brand-serp-location.ts";
import type { GoogleAdsHistoricalMetric } from "../google/ads/contracts.ts";
import { principalSubjectStanding, resolveKeywordSubject, subjectPhraseOf } from "../minerador/keyword-subject.ts";

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
   * 2026-10-18 · SDD `sdd-assunto-pela-principal-e-volume-2026-10-18.md` §6.1: o servidor sabe que o volume desta
   * keyword é DESCONHECIDO (nunca medida, "sem média" vencida, outro provider). Desconhecido = nada se decide sobre a
   * principal ("Meça no Minerador (Volume)"). Ausente = o de sempre: sem volume validado conta como volume 0.
   */
  volumeUnknown?: boolean;
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
  /**
   * 2026-10-19 · a intenção que a SERP mostrou para esta keyword (`evidencia_serp` CONCLUSIVA e com as 4 lentes, do KeywordDNA, a mesma
   * leitura da mesa: `serpEvidenceAxisValue`). Ausente = a SERP não decidiu a intenção dela; o rótulo do DNA não
   * basta para tirar uma secundária do publicado (régua c, SDD 2026-10-18 §6.3-c).
   */
  observedIntent?: string | null;
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
  /**
   * 2026-10-18 · o Pilar do MESMO plano (a principal atual, o slug e a entidade do DNA dele), lido pelo servidor em todas
   * as linhas do recorte, antes do filtro por `targetIds`: é o núcleo do Pilar/Silo que a regra da cabeça reserva ao
   * Pilar (`suporteReservaAoPilar`). Ausente = o Pilar desta leitura, no mesmo Silo; sem nenhum, a regra de antes.
   */
  planPillar?: { keyword: string | null; slug: string | null; entity: string | null } | null;
  /**
   * 2026-10-18 · O ASSUNTO PELA PRINCIPAL (SDD `sdd-assunto-pela-principal-e-volume-2026-10-18.md` §6.3-a): a keyword que
   * é o Assunto do artigo — no publicado, a PÁGINA (o Assunto dela, lido do pacote aprovado do Minerador) — e o estado do
   * volume dela pela régua única do Minerador (`principalSubjectStanding`). Ausente = o publicado sem Assunto, como antes.
   */
  principalSubject?: { keywordId: string; volumeState: "zero" | "low" | "with_volume" | "unknown" } | null;
  /** 2026-10-18 · a keyword que o ArticleDNA vigente já tem como `subject` (`null` = sem Assunto no DNA). */
  currentSubjectKeywordId?: string | null;
  /** 2026-10-18 · o alvo já tem ArticleDNA (o primeiro DNA do publicado nasce com a página entre as keywords; a página vira o Assunto na versão seguinte). */
  articleExists?: boolean;
  /** 2026-10-19 · a intenção que a SERP mostrou para a keyword do alvo (a página ou a do Assunto), como em `ImprovementKeyword.observedIntent`. */
  observedIntent?: string | null;
  /**
   * 2026-10-19 · o território da localidade da marca (`resolveBrandSerpTarget`, SDD localidade D11): a busca com a
   * cidade da própria marca não é "busca local" de fora. Ausente/`null` = marca nacional, a régua de antes.
   */
  brandTerritory?: BrandSerpTerritory | null;
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
  /**
   * 2026-10-18 · SDD do Assunto pela principal §6.3-d/e/f: a keyword que fica como o `subject` do ArticleDNA nesta
   * versão (no publicado, a página). Quando ela não é a principal, sai das keywords (`removeIds`) e continua no artigo
   * como o Assunto; URL, slug e canonical não mudam. Ausente = o Assunto do DNA não muda por esta proposta.
   */
  subjectKeywordId?: string | null;
  /**
   * 2026-10-19 · CANIBALIZAÇÃO ENTRE OS ARTIGOS DO GRUPO (cobrança do dono: "muitas keywords que deveriam estar aqui
   * estão em outros artigos que nada têm a ver"): a keyword que JÁ estava em outro artigo publicado do recorte e serve
   * ao Assunto deste (`movedIn`), ou que sai deste para o artigo dela (`movedOut`). As duas linhas são gravadas na mesma
   * confirmação: a de origem primeiro (o gravador confere). Ausente = nada muda de artigo.
   */
  movedIn?: { keywordId: string; fromTargetId: string }[];
  movedOut?: { keywordId: string; toTargetId: string }[];
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
/** 2026-10-19 · a mesma intenção pelo normalizador único ("Informativo" = "Informativa"). */
const sameIntent = (a: string | null, b: string | null) => { const x = intentComparisonKey(a), y = intentComparisonKey(b); return Boolean(x && y && x === y); };
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

/**
 * 2026-10-19 · O MESMO PÚBLICO ESCRITO NO SINGULAR OU NO PLURAL (caso real do verde: "Responsável por clinica" ×
 * "Responsável por clinicas" tirava "agencia de marketing para clinicas" de "agência de marketing para clínica de
 * estética" por "públicos distintos"). Mesma régua de `slugWords`: sem acento, caixa, palavras de ligação e o "s" final.
 */
// O público mais específico do mesmo ("Responsável por clinica estetica" ⊂ "Responsável por clinica") é o mesmo público.
const sameAudience = (a: string, b: string) => {
  if (knownEqual(a, b)) return true;
  const x = new Set(slugWords(a)), y = new Set(slugWords(b));
  if (!x.size || !y.size) return false;
  const [menor, maior] = x.size <= y.size ? [x, y] : [y, x];
  return [...menor].every(word => maior.has(word));
};

/** A structured editorial match needs entity plus problem, audience or outcome. */
export function improvementEditorialFit(target: ImprovementTarget, candidate: ImprovementKeyword): { fits: boolean; reason: string; conflict?: boolean; conflictKind?: "intent" } {
  // 2026-10-19 · a cidade da marca não troca a entidade do slug (SDD 2026-10-18 R12: "julgada pela intenção na SERP de São Paulo, não pela palavra").
  if (target.kind === "published" && classifySlugFit(target.slug ?? "", withoutBrandLocality(candidate.keyword, target.brandTerritory)).fit === "contradicts") return { fits: false, conflict: true, reason: "A candidata contradiz a entidade do slug publicado." };
  const a = target.signals, b = candidate.signals;
  const intentA = intentComparisonKey(a.intent), intentB = intentComparisonKey(b.intent);
  if (a.audience && b.audience && !sameAudience(a.audience, b.audience)) return { fits: false, conflict: true, reason: "Públicos distintos no DNA; não há evidência para reuni-los." };
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
/** 2026-10-19 · a keyword sem a localidade da marca ("agencia de marketing em são paulo" → "agencia de marketing"); sem território, igual. */
export function withoutBrandLocality(keyword: string, territory: BrandSerpTerritory | null | undefined): string {
  if (!territory) return keyword;
  const formas = [territory.city, ...territory.aliases, territory.uf].map(normalizeBrandSerpLocationText).filter(Boolean).sort((x, y) => y.length - x.length);
  let texto = normalizeBrandSerpLocationText(keyword);
  for (const forma of formas) texto = texto.replace(new RegExp(`(^| )(?:(?:em|de|no|na|do|da) )?` + forma + `(?= |$)`, "g"), " ");
  const limpo = texto.replace(/ +/g, " ").trim();
  return limpo && limpo !== normalizeBrandSerpLocationText(keyword) ? limpo : keyword;
}
/** 2026-10-19 · o lugar é a localidade da própria marca (cidade, apelidos do catálogo ou a UF)? Leitor: `resolveBrandSerpTarget`. */
export function isBrandLocality(local: string, territory: BrandSerpTerritory | null | undefined): boolean {
  if (!territory) return false;
  const lugar = normalizeBrandSerpLocationText(local);
  return [territory.city, ...territory.aliases, territory.uf].map(normalizeBrandSerpLocationText).filter(Boolean).includes(lugar);
}
/**
 * 2026-10-19 · A BUSCA LOCAL DE FORA (RF13 com a localidade da marca, SDD `sdd-localidade-serp-por-marca-2026-10-18.md`
 * D11: "resultado de outra cidade é fora do território"). O lugar que a keyword cita só barra quando não está no alvo
 * E não é a cidade da marca: "agencia de marketing em são paulo" na AdalbaPro (São Paulo, cidade) é do mercado dela.
 * Uma régua só para o reforço, a leitura da IA e a régua c.
 */
export function foreignLocalSearch(target: Pick<ImprovementTarget, "brandTerritory">, keyword: string, targetText: string): string | null {
  const local = localSearchOf(keyword);
  if (!local || key(targetText).includes(local) || isBrandLocality(local, target.brandTerritory)) return null;
  return local;
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
  // 2026-10-17 (noite) · a mesma regra da linha de copy: a que nega uma entidade do artigo é outra intenção.
  const textoDoAlvo = `${target.theme} ${targetSubjectText(target).replace(/-/g, " ")}`;
  const nega = negaOAssunto(textoDoAlvo, copyWords(textoDoAlvo), candidate.keyword);
  if (nega) return `Contradiz o Assunto: ${nega}.`;
  const words = slugWords(candidate.keyword);
  if (new Set(words).size <= 2 && candidate.volume! > BROAD_HEAD_MAX_VOLUME) return `Cabeça genérica (volume ${candidate.volume}): uma página de nicho não ranqueia nela.`;
  const subject = targetSubjectText(target);
  const local = foreignLocalSearch(target, candidate.keyword, `${target.theme} ${subject.replace(/-/g, " ")}`);
  if (local) return `Busca local (“${local}”): quem busca quer um serviço nessa região, não o assunto deste artigo.`;
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
  // 2026-10-18 · a régua do Assunto pela principal (SDD 2026-10-18 §6.3-b/c): volume 0 libera; a candidata precisa caber no Assunto.
  const porVolume = principalSwapByVolume(target, current ?? null);
  if (porVolume) {
    const naoCabe = principalFitsSubject(target, candidate);
    return naoCabe ? `ela não cabe no Assunto (${naoCabe})` : null;
  }
  if (target.post === "locked") return "o Posto é Travado";
  if (target.post !== "free") return "o Posto não foi declarado";
  if (current?.volumeValidated) return "a principal atual já tem volume";
  if (current && (target.kind === "subject" || target.principalSubject) && principalSwapStanding(target, current) === "unknown") return "o volume da principal atual é desconhecido (meça no Minerador)";
  // 2026-10-17 · Principal de identidade: a que está no título ou no slug fica; a IA só traz reforço. (2026-10-18: só enquanto o volume não é 0.)
  if (identityHoldsPrincipal(target, current)) return "a principal atual é a identidade do assunto (está no título ou no slug) e fica";
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
  const current = improvementCurrentPrincipal(target, byId);
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
  // 2026-10-18 · a troca pela régua do volume (SDD do Assunto pela principal §6.3-b) diz o porquê e o destino da antiga.
  if (novaPrincipal && principalSwapByVolume(target, current)) reasons.push(principalSubjectSwapReason(target, current, novaPrincipal, blocksSwap));
  else {
    if (novaPrincipal && target.kind === "published" && !coversSlugSubject(target.slug, novaPrincipal.keyword)) reasons.push(broaderPrincipalReason(novaPrincipal.keyword));
    if (principalId !== target.primaryId && current) reasons.push(`Principal com volume escolhida na lista; “${current.keyword}” fica como secundária.`);
  }
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
/*
 * 2026-10-17 · A MESMA BUSCA (dono, teste no amarelo: "internet residencial vivo", "vivo residencial internet",
 * "internet da vivo residencial" e "internet residencial da vivo" ocupavam as 4 vagas de "Claro, Vivo ou TIM").
 * Variante da mesma busca = as mesmas palavras, sem as de ligação (preposição, artigo, "ou", "mais"), plural ou
 * singular, qualquer ordem. A palavra de intenção ("melhor", "bom", "vale a pena") faz OUTRA busca: "melhores planos
 * de internet residencial" não é variante de "planos de internet residencial". Num artigo, entram no máximo
 * `SAME_SEARCH_MAX_PER_ARTICLE` variantes da mesma busca: as de maior volume.
 */
const VARIANT_CONNECTORS = new Set(["de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "em", "no", "na", "nos", "nas", "um", "uma", "uns", "umas", "para", "pra", "por", "pelo", "pela", "pelos", "pelas", "ao", "aos", "com", "ou", "vs", "versus", "mais", "eu", "voce", "se", "me"]);
const VARIANT_ALIASES: Record<string, string> = { boa: "bom", melhore: "melhor" };
export const SAME_SEARCH_MAX_PER_ARTICLE = 2;
export function sameSearchKey(value: string | null | undefined): string {
  const palavras = key((value ?? "").replace(/[-/]/g, " ")).split(/[^a-z0-9]+/).filter(word => word.length >= 2 && !VARIANT_CONNECTORS.has(word)).map(copyStem).map(word => VARIANT_ALIASES[word] ?? word);
  return [...new Set(palavras)].sort().join(" ");
}
/*
 * 2026-10-17 · AS ENTIDADES QUE O ASSUNTO ENUMERA (dono: "o reforço tem que cobrir as entidades do título/slug de
 * forma equilibrada"). O título que abre com uma lista — "Claro, Vivo ou TIM para casa: …", "Internet, TV Box e
 * streaming: …" — compara ou junta essas entidades. Lido só do texto do Assunto: a cabeça (antes de ":" ou "?", até
 * "para"/"sem"/"com"), com vírgula, "ou" ou "vs", cada item com 1 a 3 palavras de conteúdo. Lista com número
 * ("300, 500, 600 Mega ou 1 Giga") é de valores, não de entidades. Sem lista, nenhuma entidade (o de sempre).
 */
export function assuntoEntityList(title: string | null | undefined): { label: string; words: Set<string> }[] {
  const cabeca = (title ?? "").split(/[:?!]/)[0] ?? "";
  const ate = cabeca.split(/\s+(?:para|pra|sem|com)\s+/i)[0] ?? "";
  if (!/,|\s(?:ou|vs|versus)\s/i.test(ate)) return [];
  const itens = ate.split(/,|\s+(?:e|ou|vs|versus)\s+/i).map(item => item.trim()).filter(Boolean);
  if (itens.length < 2 || itens.some(item => /\d/.test(item))) return [];
  const lista = itens.map(item => ({ label: item, words: copyWords(item) }));
  return lista.every(item => item.words.size >= 1 && item.words.size <= 3) ? lista : [];
}
export const assuntoEntityItems = (title: string | null | undefined): Set<string>[] => assuntoEntityList(title).map(item => item.words);
/*
 * 2026-10-17 · AS FACETAS DO ASSUNTO: "Instalação de internet: taxas, prazo e quando chega a primeira fatura" — a
 * cabeça ("Instalação de internet") e a lista depois dos dois-pontos. Só com lista (vírgula ou "e"/"ou"); a frase
 * solta depois dos dois-pontos ("como comparar onde você mora") não é faceta.
 */
function assuntoFacets(title: string | null | undefined): { head: string; facets: string[] } | null {
  const [cabeca, ...resto] = (title ?? "").split(":");
  const depois = resto.join(":").replace(/[?!.]+\s*$/, "").trim();
  if (!cabeca?.trim() || !depois || !/,|\s(?:e|ou)\s/i.test(depois)) return null;
  const facets = depois.split(/,|\s+(?:e|ou)\s+/i).map(item => item.trim()).filter(item => copyWords(item).size > 0);
  return facets.length >= 2 ? { head: cabeca.trim(), facets } : null;
}
/*
 * 2026-10-17 (noite) · A CANDIDATA QUE NEGA O ASSUNTO NÃO ENTRA (coordenador: "tv box sem internet" no artigo "Internet,
 * TV Box e streaming: quando compensa contratar tudo junto?" é outra intenção — usar o TV box sem internet). "sem X"
 * contradiz o artigo quando X é uma entidade dele (principal, slug, Assunto) e o artigo não diz ele mesmo "sem X";
 * "sem fio" contradiz o artigo de internet a cabo; "grátis" contradiz o artigo de contratar (plano, combo, assinatura).
 */
const NEGACAO_SINONIMOS: Record<string, string[]> = { fio: ["fio", "cabo", "cabead", "cabeament"] };
const PALAVRAS_DE_CONTRATAR = copyWords("contratar contratação contrato assinar assinatura plano combo pacote");
const PALAVRAS_DE_GRATIS = new Set(["gratis", "gratuito", "gratuita", "gratuitos", "gratuitas"]);
function negaOAssunto(textoDoArtigo: string, palavrasDoArtigo: ReadonlySet<string>, frase: string): string | null {
  const tokens = key(frase.replace(/[-/]/g, " ")).split(/[^a-z0-9]+/).filter(Boolean);
  const texto = key(textoDoArtigo.replace(/[-/]/g, " "));
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] !== "sem") continue;
    const negada = tokens.slice(i + 1).find(token => copyWords(token).size > 0);
    if (!negada || texto.includes(`sem ${negada}`)) continue;
    const raiz = [...copyWords(negada)][0];
    if ((NEGACAO_SINONIMOS[raiz] ?? [raiz]).some(word => palavrasDoArtigo.has(word))) return `sem ${negada}`;
  }
  if (tokens.some(token => PALAVRAS_DE_GRATIS.has(token)) && ![...PALAVRAS_DE_GRATIS].some(word => texto.includes(word)) && [...palavrasDoArtigo].some(word => PALAVRAS_DE_CONTRATAR.has(word))) return "grátis";
  return null;
}
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
  /** 2026-10-17 · as entidades que o Assunto enumera (`assuntoEntityItems`), cada uma com as palavras dela. */
  entities: Set<string>[];
  /** 2026-10-17 · o assunto comum do Silo (o slug do Silo e as palavras da principal de dois ou mais artigos dele): não distingue um artigo do outro. */
  common: Set<string>;
};
/** A linha de copy de um alvo: Assunto + slug + detalhes do plano + principal + DNA (+ a SERP da principal em cache). */
export function improvementCopyLine(target: ImprovementTarget, byId: ReadonlyMap<string, ImprovementKeyword>, vocabulary?: ImprovementSerpVocabulary | null, context: { common?: ReadonlySet<string> } = {}): ImprovementCopyLine {
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
  const common = new Set([...copyWords(lastSlugSegment(target.siloContext?.slug ?? null)), ...(context.common ?? [])]);
  const entities = target.kind === "subject" ? assuntoEntityItems(target.theme) : [];
  return { principalText, principal: copyWords(principalText), slug, entity, words, vocabulary: { related, questions, titles, words: new Set([...related, ...questions, ...titles].flatMap(set => [...set])) }, entities, common };
}
/**
 * 2026-10-17 · As entidades enumeradas pelo Assunto que a frase nomeia (índices de `line.entities`). Uma entidade que
 * é só o assunto comum do Silo ("internet") conta para a comparação, mas sozinha não distingue o artigo.
 */
function namedEntities(line: ImprovementCopyLine, words: Set<string>): { all: number[]; own: number[] } {
  const all = line.entities.flatMap((items, index) => [...items].some(word => words.has(word)) ? [index] : []);
  return { all, own: all.filter(index => [...line.entities[index]].some(word => words.has(word) && !line.common.has(word))) };
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
  /*
   * 2026-10-17 · uma das ENTIDADES que o Assunto enumera, com o resto do artigo ("tim residencial internet" em "Claro,
   * Vivo ou TIM…"; "internet e tv residencial" em "Internet, TV Box e streaming…"), ou duas delas comparadas ("vivo ou
   * tim"). A entidade que é só o assunto comum do Silo não basta sozinha.
   */
  const nomeadas = namedEntities(line, words);
  const daEntidade = (word: string) => line.entities.some(items => items.has(word));
  const daEntidadeNomeada = nomeadas.own.length > 0 && (nomeadas.all.length >= 2 || [...words].some(word => !daEntidade(word) && (line.principal.has(word) || line.slug.has(word))));
  const carries = entityOk || cover >= 0.75 || daMarcaNomeada || daEntidadeNomeada;
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
  return { carries, fits: carries && onLine && (serp > 0 || cover >= 0.75 || daMarcaNomeada || ((entityOk || daEntidadeNomeada) && outside === 0 && serpOnlyWords === 0)), cover, serp, where, serpOnlyWords };
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
  if (foreignLocalSearch(target, candidate.keyword, `${target.theme} ${lastSlugSegment(target.slug ?? target.planSlug ?? null)} ${target.planScope ?? ""}`)) return "busca local";
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
/*
 * 2026-10-17 (noite) · DECISÃO DO DONO: "PILAR TROCA, SUPORTES FICAM". A exceção da T12 (principal de identidade): o
 * PILAR do plano com a principal Livre e SEM volume — mesmo quando ela é a identidade (título ou slug) — recebe a
 * proposta de troca pelo termo-cabeça com volume que leva o núcleo do slug e a centralidade do Silo (a régua de sempre:
 * principal mais ampla com o núcleo do slug, X3/X14; no Pilar, entre as que levam o núcleo, a de cauda curta e mais
 * volume, AGENTS.md §13). A antiga fica como a âncora do Assunto (§15.2); título, Assunto e slug do plano ficam.
 * Proposta na prévia; decide o dono. Os Suportes de identidade sem volume continuam com a principal (como antes); a
 * Travada nunca troca (T2/T10).
 */
/*
 * 2026-10-18 · SUBSTITUÍDO (SDD do Assunto pela principal §9): "Pilar troca, Suportes ficam". O Pilar segue a régua
 * nova (volume 0 → proposta, com a ordem do termo-cabeça: cauda curta e mais volume); o Suporte de volume 0 também
 * recebe a proposta (a faceta dele). A função continua dizendo só "é o Pilar com volume 0" (a ordem e a frase do Pilar).
 */
export function pilarTrocaPelaCabeca(target: Pick<ImprovementTarget, "kind" | "planRole" | "declaredPrincipalId"> & Partial<Pick<ImprovementTarget, "post" | "principalSubject">>, principal: (Pick<ImprovementKeyword, "volumeValidated"> & Partial<Pick<ImprovementKeyword, "volume" | "volumeUnknown" | "id">>) | null | undefined): boolean {
  return target.kind === "subject" && target.planRole === "Pilar" && Boolean(principal) && principalSwapStanding({ kind: target.kind, post: target.post ?? "free", declaredPrincipalId: target.declaredPrincipalId, principalSubject: target.principalSubject }, { volume: principal!.volume ?? null, volumeValidated: principal!.volumeValidated, volumeUnknown: principal!.volumeUnknown, id: principal!.id }) === "swap";
}
/**
 * A principal de identidade que FICA: 2026-10-18 · SUBSTITUÍDO "identidade fica com pouco ou nenhum volume" (T12) pela
 * régua do volume (`principalSwapStanding`): fica com volume definido ou com volume desconhecido; com volume 0 recebe a
 * proposta (Pilar e Suporte, publicado e novo).
 */
export function identityHoldsPrincipal(target: Pick<ImprovementTarget, "kind" | "theme" | "slug" | "planSlug" | "planRole" | "declaredPrincipalId"> & Partial<Pick<ImprovementTarget, "post" | "principalSubject">>, principal: (Pick<ImprovementKeyword, "keyword"> & Partial<Pick<ImprovementKeyword, "volumeValidated" | "volume" | "volumeUnknown" | "id">>) | null | undefined): boolean {
  if (!targetPrincipalIsIdentity(target, principal)) return false;
  if (target.kind === "published" && !target.principalSubject) return true;
  return principalSwapStanding({ kind: target.kind, post: target.post ?? "free", declaredPrincipalId: target.declaredPrincipalId, principalSubject: target.principalSubject }, principal ? { volume: principal.volume ?? null, volumeValidated: principal.volumeValidated === true, volumeUnknown: principal.volumeUnknown, id: principal.id } : null) !== "swap";
}
export const IDENTITY_PRINCIPAL_LABEL = "Principal de identidade";
/** 2026-10-17 (noite) · a frase da prévia quando o Pilar sem volume recebe (ou espera) o termo-cabeça. */
export const PILLAR_HEAD_SWAP_LABEL = "Pilar sem volume troca pelo termo-cabeça";
/** A frase da prévia quando a principal fica por ser a identidade. */
export function identityPrincipalReason(target: Pick<ImprovementTarget, "kind">, principal: Pick<ImprovementKeyword, "keyword" | "volume" | "volumeValidated">): string {
  const volume = principal.volumeValidated && (principal.volume ?? 0) > 0 ? `volume ${principal.volume}` : "sem volume";
  return target.kind === "published"
    ? `${IDENTITY_PRINCIPAL_LABEL}: “${principal.keyword}” (${volume}) é o assunto do slug publicado e fica como principal; as buscas mais amplas entram como secundárias e reforçam o contexto (dono, 17/10).`
    : `${IDENTITY_PRINCIPAL_LABEL}: “${principal.keyword}” (${volume}) está no título e no slug do Assunto e fica como principal; as buscas mais amplas entram como secundárias e reforçam o contexto (dono, 17/10). Trocar só pela sua decisão, em “Procurar outra principal”.`;
}
/*
 * 2026-10-18 · O ASSUNTO PELA PRINCIPAL E PELO VOLUME — A RÉGUA DA TROCA (SDD `sdd-assunto-pela-principal-e-volume-
 * 2026-10-18.md` §6.3-b/c, APROVADA). SUBSTITUI a régua de 17/10 "principal de identidade com pouco ou nenhum volume
 * fica (só o Pilar troca)" (T12/T13) como PORTÃO da troca, em publicado e novo, Pilar e Suporte:
 *
 *   travada (plano Travado, principal declarada fixa)            → nunca troca
 *   volume definido (Google Ads > 0, mesmo 10)                   → fica (T1); o Arquiteto só reforça
 *   volume 0 (medido 0 ou "sem média")                          → a proposta de uma principal nova COM volume
 *   desconhecido (nunca medida, "sem média" vencida)            → nada se decide ("Meça no Minerador")
 *
 * No publicado, o volume 0 da PÁGINA libera a principal sozinho (dono, 18/10), mesmo com "Travado ao slug"; a troca é
 * sempre proposta na prévia e decisão do dono; URL, slug e canonical nunca mudam. As 16 páginas trocadas no modo antigo:
 * a principal atual fica se passar na régua c abaixo; senão, a proposta de troca. `principalIsIdentity` continua só
 * para o motivo e para a SERP da principal de identidade (§42).
 */
export type PrincipalSwapStanding = "locked" | "fixed" | "swap" | "unknown";
/**
 * A principal atual do alvo. A página publicada que é um Assunto declarado fica fora da lista de keywords (é o Assunto,
 * não uma keyword a reorganizar): quando ela ainda é a principal, este é o retrato dela para a régua do volume.
 */
export function improvementCurrentPrincipal(target: ImprovementTarget, byId: ReadonlyMap<string, ImprovementKeyword>): ImprovementKeyword | undefined {
  const lida = byId.get(target.primaryId ?? "");
  if (lida || !target.principalSubject || target.primaryId !== target.principalSubject.keywordId) return lida;
  const estado = target.principalSubject.volumeState;
  return { id: target.primaryId!, keyword: target.theme, volume: null, volumeValidated: estado === "low" || estado === "with_volume", signals: target.signals, ownerId: target.id, published: true, territoryRef: target.territoryRef, external: false, ...(estado === "unknown" ? { volumeUnknown: true } : {}) };
}
/** O volume de uma keyword pela régua do §6.1 (o servidor marca o desconhecido em `volumeUnknown`). */
export function improvementVolumeState(k: Pick<ImprovementKeyword, "volume" | "volumeValidated"> & Partial<Pick<ImprovementKeyword, "volumeUnknown">> | null | undefined): "zero" | "low" | "with_volume" | "unknown" {
  if (!k) return "unknown";
  if (k.volumeValidated && (k.volume ?? 0) > 0) return (k.volume ?? 0) <= 39 ? "low" : "with_volume";
  return k.volumeUnknown ? "unknown" : "zero";
}
/** A página publicada é o Assunto do artigo e tem volume 0: a principal fica livre (a troca é decisão do dono). */
const paginaDeVolumeZero = (target: Pick<ImprovementTarget, "kind" | "principalSubject">) => target.kind === "published" && target.principalSubject?.volumeState === "zero";
export function principalSwapStanding(target: Pick<ImprovementTarget, "kind" | "post" | "declaredPrincipalId" | "principalSubject">, principal: (Pick<ImprovementKeyword, "volume" | "volumeValidated"> & Partial<Pick<ImprovementKeyword, "volumeUnknown" | "id">>) | null | undefined): PrincipalSwapStanding {
  if (target.declaredPrincipalId) return "locked";
  if (paginaDeVolumeZero(target)) return "swap";
  if (target.kind === "published" && target.post !== "free") return "locked";
  // Sem principal ainda (Assunto sem artigo), não há o que proteger: a formação escolhe a principal.
  if (!principal) return "swap";
  const estado = target.principalSubject && principal?.id === target.principalSubject.keywordId ? target.principalSubject.volumeState : improvementVolumeState(principal);
  if (estado === "low" || estado === "with_volume") return "fixed";
  return estado === "zero" ? "swap" : "unknown";
}
/*
 * RÉGUA c · A CANDIDATA PRECISA CABER NO ASSUNTO (§6.3-c): leva o núcleo do slug E não contradiz o DNA do Assunto —
 * público/nicho, restrição ("sem tráfego pago", "sem anúncios", "sem redes sociais"), localidade, intenção do
 * consumidor (preço) e grafia quebrada ("plano de e marketing"). A ampla sem o nicho, mesma intenção, pode ser a
 * principal (o nicho fica no Assunto, no título e no slug).
 */
const PUBLICO_PALAVRAS = /\b(dentistas?|odontolog\w*|medicos?|advogad\w*|psicolog\w*|nutricionistas?|fisioterapeut\w*|veterinari\w*|dermatolog\w*|feminin\w*|masculin\w*|infantil|criancas?)\b/;
const PRECO_PALAVRAS = /\b(preco|precos|valor|valores|quanto custa|custa|custo|orcamento|barato|barata)\b/;
const RESTRICOES: Array<[RegExp, RegExp]> = [
  [/\bsem (trafego pago|anuncios?|redes sociais)\b/, /\b(trafego pago|anuncios?|redes sociais|ads|facebook ads|google ads)\b/],
];
export function principalSubjectConflict(target: ImprovementTarget, candidate: Pick<ImprovementKeyword, "keyword" | "signals" | "volume" | "volumeValidated" | "id"> & Partial<ImprovementKeyword>): string | null {
  return principalSubjectConflictDetail(target, candidate)?.reason ?? null;
}
/**
 * A régua c com o TIPO do conflito (2026-10-19). `intent_dna` = a intenção só diverge no rótulo do DNA, sem a SERP
 * ter decidido a intenção das duas; `intent_serp` = a SERP (evidencia_serp conclusiva) mostrou intenções diferentes;
 * `other` = público, preço do consumidor, localidade de fora, restrição, negação do Assunto ou grafia quebrada.
 * Para ESCOLHER a principal, todo conflito barra (sem SERP, a Lógica segura a entrada automática, RF10). Para TIRAR
 * uma secundária do publicado, a intenção só vale pela SERP (régua c: "intenção pela SERP, 4 lentes").
 */
export function principalSubjectConflictDetail(target: ImprovementTarget, candidate: Pick<ImprovementKeyword, "keyword" | "signals" | "volume" | "volumeValidated" | "id"> & Partial<ImprovementKeyword>): { reason: string; kind: "intent_dna" | "intent_serp" | "other" } | null {
  const outro = (reason: string) => ({ reason, kind: "other" as const });
  const frase = key(candidate.keyword);
  const alvo = key(`${target.theme} ${(target.slug ?? target.planSlug ?? "").replace(/[-/]/g, " ")} ${target.note ?? ""} ${target.planScope ?? ""}`);
  if (/\b(de|da|do|das|dos|para|com|em|no|na) e\b(?!-)/.test(frase) || /(^|\s)[b-df-hj-np-tv-z](\s|$)/.test(frase)) return outro("grafia quebrada");
  const publico = frase.match(PUBLICO_PALAVRAS)?.[0];
  // 2026-10-19 · dentista e odontologia são o mesmo público ("captação de pacientes dentista" cabe em "…consultório odontológico").
  if (publico && !alvo.includes(publico.replace(/s$/, "")) && !(/^(dentist|odontolog)/.test(publico) && /\b(dentist|odontolog)/.test(alvo))) return outro(`outro público (“${publico}”)`);
  const preco = frase.match(PRECO_PALAVRAS)?.[0];
  if (preco && !alvo.includes(preco)) return outro(`intenção do consumidor (“${preco}”), não a do artigo`);
  // 2026-10-19 · a cidade da própria marca não é busca local de fora (SDD localidade D11).
  const local = foreignLocalSearch(target, candidate.keyword, alvo);
  if (local) return outro(`busca local (“${local}”)`);
  for (const [restricao, contraria] of RESTRICOES) {
    const doAlvo = alvo.match(restricao)?.[0];
    if (doAlvo && contraria.test(frase) && !/\bsem\b/.test(frase)) return outro(`contraria a restrição do Assunto (“${doAlvo}”)`);
  }
  const nega = negaOAssunto(`${target.theme} ${(target.slug ?? target.planSlug ?? "").replace(/-/g, " ")}`, copyWords(`${target.theme} ${target.slug ?? target.planSlug ?? ""}`), candidate.keyword);
  if (nega) return outro(`contradiz o Assunto: ${nega}`);
  const fit = improvementEditorialFit(target, candidate as ImprovementKeyword);
  /*
   * A intenção. A SERP decide quando mostrou a intenção das duas (evidencia_serp conclusiva): diferentes = conflito pela
   * SERP; iguais = nenhum conflito, mesmo com rótulos diferentes no DNA. Sem a SERP das duas, o rótulo do DNA (pelo
   * normalizador único: "Informativo" = "Informativa") diferente é conflito só do DNA.
   */
  const serpDoAssunto = intentComparisonKey(target.observedIntent), serpDela = intentComparisonKey(candidate.observedIntent);
  if (serpDoAssunto && serpDela) {
    if (serpDoAssunto !== serpDela) return { reason: `outra intenção pela SERP (${target.observedIntent} × ${candidate.observedIntent})`, kind: "intent_serp" };
  } else {
    const intencaoDoAssunto = intentComparisonKey(target.signals.intent), intencaoDela = intentComparisonKey(candidate.signals?.intent);
    if (intencaoDoAssunto && intencaoDela && intencaoDoAssunto !== intencaoDela) return { reason: `outra intenção (${target.signals.intent} × ${candidate.signals.intent})`, kind: "intent_dna" };
  }
  if (fit.conflict && fit.conflictKind !== "intent") return outro(fit.reason.replace(/\.$/, ""));
  return null;
}
/*
 * 2026-10-19 · O MODIFICADOR QUE DEFINE O ARTIGO (cobrança do dono depois da prévia do verde: "não está aplicando o SEO
 * semântico, não está aplicando a linguagem natural orgânica"). A régua c checava o núcleo do slug só pelas palavras:
 * "captação + paciente" casava com "captação de pacientes dentista" no artigo "captação de pacientes SEM TRÁFEGO PAGO".
 * No publicado cujo Assunto é a própria keyword da página (o Assunto pela principal, SDD 2026-10-18), a frase da página
 * É o tema; a principal do artigo é o mesmo tema dito com volume. Ela não pode perder nem contrariar o que define o
 * artigo — lido do Assunto e do slug, sem IA:
 *   restrição   "sem X"      → a principal diz "sem X" (ou o positivo dela: "orgânico" para "sem tráfego pago/anúncios");
 *   negação     "não X"      → a principal leva a negação ("instagram não traz pacientes" ≠ "como atrair clientes pelo instagram");
 *   comparação  "X vs Y"     → a principal leva os dois lados;
 *   nicho       "para N"     → a principal leva o público/nicho N (consultório = clínica; dentista = odontologia).
 * A ampla que perde o modificador continua podendo REFORÇAR como secundária de contexto (dono, 30/09: "tráfego
 * orgânico" num artigo sem tráfego pago); só não é a principal. SUBSTITUI, para esse publicado, a "principal mais ampla
 * com o núcleo do slug" (30/09) e "a ampla sem o nicho, mesma intenção, pode ser a principal" (SDD 2026-10-18 §6.3-c).
 */
export type SubjectDefiningModifier = { kind: "restricao" | "negacao" | "comparacao" | "nicho"; label: string; words: string[]; sides?: [string[], string[]] };
const MODIFIER_STOP = new Set(["para", "pra", "sem", "com", "vs", "versus", "e", "ou"]);
// As palavras já no radical de `copyWords` ("clínica" → clinic, "consultório" → consultori, "odontológico" → odontologic).
const NICHE_FAMILY: Record<string, string> = { consultori: "clinic", clinic: "clinic", odontologic: "odonto", odontologi: "odonto", odontolog: "odonto", dentist: "odonto", estetic: "estetic", cosmetic: "cosmetic" };
const nicheFamily = (word: string) => NICHE_FAMILY[word] ?? word;
const ORGANICO_DE = /^(trafeg|anunci|ads|pago)$/;
/** O que define o artigo cujo Assunto é a keyword da página: lido do Assunto e do último segmento do slug. */
export function subjectDefiningModifiers(target: Pick<ImprovementTarget, "theme" | "slug" | "planSlug">): SubjectDefiningModifier[] {
  const out: SubjectDefiningModifier[] = [];
  const vistos = new Set<string>();
  for (const texto of [target.theme, lastSlugSegment(target.slug ?? target.planSlug ?? null)]) {
    // As palavras como estão escritas no Assunto (o rótulo da prévia) e a forma normalizada (a comparação).
    const brutas = texto.replace(/[-/:]/g, " ").split(/\s+/).filter(Boolean);
    const tokens = brutas.map(word => key(word).replace(/[^a-z0-9]/g, ""));
    const conteudo = (start: number, max = 3) => {
      const words: string[] = []; let fim = start;
      for (let i = start; i < tokens.length && words.length < max; i++) { if (MODIFIER_STOP.has(tokens[i]) && words.length) break; const w = [...copyWords(tokens[i])][0]; if (w) words.push(w); fim = i + 1; }
      return { words, rotulo: brutas.slice(start, fim).join(" ") };
    };
    tokens.forEach((token, i) => {
      const add = (m: SubjectDefiningModifier) => { const chave = `${m.kind}|${m.words.join(" ")}`; if (!m.words.length || vistos.has(chave)) return; vistos.add(chave); out.push(m); };
      if (token === "sem") { const c = conteudo(i + 1, 2); add({ kind: "restricao", label: `${brutas[i]} ${c.rotulo}`, words: c.words }); }
      if (token === "nao") { const c = conteudo(i + 1, 2); add({ kind: "negacao", label: `${brutas[i]} ${c.rotulo}`, words: ["nao", ...c.words] }); }
      if ((token === "vs" || token === "versus") && i > 0) {
        const antes = [...copyWords(tokens[i - 1])], depois = conteudo(i + 1, 1);
        if (antes.length && depois.words.length) add({ kind: "comparacao", label: `${brutas[i - 1]} ${brutas[i]} ${depois.rotulo}`, words: [...antes, ...depois.words], sides: [antes, depois.words] });
      }
      if (token === "para" || token === "pra") { const c = conteudo(i + 1, 3); add({ kind: "nicho", label: `${brutas[i]} ${c.rotulo}`, words: c.words }); }
    });
  }
  return out;
}
/** A principal perde ou contraria o modificador que define o artigo? Devolve o motivo (régua c, 19/10) ou `null`. */
export function principalLosesDefiningModifier(target: Pick<ImprovementTarget, "theme" | "slug" | "planSlug">, candidate: Pick<ImprovementKeyword, "keyword">): string | null {
  const tokens = key(candidate.keyword.replace(/[-/]/g, " ")).split(/[^a-z0-9]+/).filter(Boolean);
  const palavras = copyWords(candidate.keyword);
  const familias = new Set([...palavras].map(nicheFamily));
  for (const m of subjectDefiningModifiers(target)) {
    if (m.kind === "restricao") {
      const disseSem = tokens.some((token, i) => token === "sem" && tokens.slice(i + 1, i + 3).some(t => m.words.includes([...copyWords(t)][0] ?? "")));
      const organico = m.words.some(word => ORGANICO_DE.test(word)) && palavras.has("organic");
      if (!disseSem && !organico) return `perde o que define o artigo (“${m.label}”)`;
    }
    if (m.kind === "negacao" && !tokens.includes("nao")) return `perde o que define o artigo (“${m.label}”: a principal sem a negação é outra intenção)`;
    if (m.kind === "comparacao" && m.sides && !(m.sides[0].some(w => palavras.has(w)) && m.sides[1].some(w => palavras.has(w)))) return `perde a comparação que define o artigo (“${m.label}”)`;
    if (m.kind === "nicho" && !m.words.some(word => familias.has(nicheFamily(word)))) return `perde o público/nicho que define o artigo (“${m.label}”)`;
  }
  return null;
}
/** O publicado cujo Assunto é a própria keyword da página (lido do pacote aprovado do Minerador). */
const assuntoEhAPagina = (target: Pick<ImprovementTarget, "kind" | "principalSubject">) => target.kind === "published" && Boolean(target.principalSubject);
/** Régua c inteira para a PRINCIPAL: cabe no Assunto e leva o núcleo do slug (com a entidade do DNA). */
export function principalFitsSubject(target: ImprovementTarget, candidate: Pick<ImprovementKeyword, "keyword" | "signals" | "volume" | "volumeValidated" | "id"> & Partial<ImprovementKeyword>): string | null {
  const conflito = principalSubjectConflict(target, candidate);
  if (conflito) return conflito;
  // Sem slug (artigo novo sem slug declarado), o título do Assunto faz as vezes do slug (a mesma régua de `targetSubjectText`).
  const slug = target.slug ?? target.planSlug ?? target.theme.split("/").join(" ");
  /*
   * 2026-10-19 · no publicado cujo Assunto é a página, o núcleo leva a entidade do DNA que o slug escreve (a régua do
   * plano, X14): "marketing-harmonizacao-facial" é marketing + harmonização + facial — "harmonização facial o que é"
   * (quem quer o procedimento) perdia o "marketing" e passava pelas duas últimas palavras.
   */
  const soComEntidade = assuntoEhAPagina(target) && slugCoreWords(slug, target.signals.centralEntity).length > 0;
  if (!carriesSlugCore(slug, candidate, target.signals.centralEntity) && (soComEntidade || !carriesSlugCore(slug, candidate))) return `não leva o núcleo do slug (${slugCoreWords(slug, target.signals.centralEntity).join(" + ") || "slug sem núcleo"})`;
  // 2026-10-19 · no publicado cujo Assunto é a página: o modificador que define o artigo (restrição, negação, comparação, nicho).
  if (assuntoEhAPagina(target) && candidate.id !== target.principalSubject?.keywordId) {
    const perde = principalLosesDefiningModifier(target, candidate);
    if (perde) return perde;
  }
  return null;
}
/**
 * No publicado com o Assunto na página de volume 0: a principal ATUAL (a do modo antigo, quando já não é a página) passa
 * na régua c? Passa → fica (dono, 18/10: "a principal atual fica se passar na régua nova"); não passa → `null` aqui e a
 * proposta de troca. Sem Assunto na página, ou a principal ainda é a página: `null` (o volume 0 da página decide).
 */
export function publishedCurrentPrincipalHolds(target: ImprovementTarget, current: ImprovementKeyword | null | undefined): boolean {
  if (!paginaDeVolumeZero(target) || !current || current.id === target.principalSubject?.keywordId) return false;
  return current.volumeValidated && (current.volume ?? 0) > 0 && !principalFitsSubject(target, current);
}
/** A troca proposta pela régua nova vale para este alvo agora (volume 0 da principal ou da página, e a atual não passa)? */
export function principalSwapByVolume(target: ImprovementTarget, current: ImprovementKeyword | null | undefined): boolean {
  // Sem principal (Assunto sem artigo), não é troca: a formação escolhe a principal pela régua de sempre.
  if (!current) return false;
  // O publicado SEM o Assunto na página espera o "Aprovar e enviar" do Minerador (o volume 0 vira o Assunto lá): até lá, a régua de antes.
  if (target.kind === "published" && !target.principalSubject) return false;
  if (principalSwapStanding(target, current) !== "swap") return false;
  return !publishedCurrentPrincipalHolds(target, current);
}
export const PAGE_BECOMES_SUBJECT_REASON = "A keyword da página publicada passa a ser o Assunto do artigo (sai das secundárias e continua no artigo como o Assunto); URL, slug e canonical não mudam (SDD 2026-10-18).";
/** A frase quando o volume 0 libera a principal mas nenhuma candidata passa na régua c (R7: nunca troca às cegas). */
export const VOLUME_ZERO_NO_CANDIDATE_LABEL = "Volume 0 sem candidata";
export function volumeZeroWithoutCandidateReason(target: ImprovementTarget, old: ImprovementKeyword | undefined): string {
  const nucleo = slugCoreWords(target.slug ?? target.planSlug ?? null, target.signals.centralEntity).join(" + ") || "o núcleo do slug";
  /*
   * 2026-10-19 · O ASSUNTO COMO FOCO (cobrança do dono: a principal sem relação com o slug não fica "por enquanto"). No
   * publicado cujo Assunto é a página, sem candidata que caiba no Assunto, a própria página (o Assunto) é o foco e a
   * principal do artigo; a vaga da principal com volume fica aberta, dita. SUBSTITUI "a principal fica por enquanto".
   */
  if (assuntoEhAPagina(target) && old?.id === target.principalSubject?.keywordId) {
    const define = subjectDefiningModifiers(target).map(m => `“${m.label}”`).join(", ");
    return `${ASSUNTO_AS_FOCUS_LABEL}: nenhuma busca com volume desta leitura leva o núcleo do slug (${nucleo})${define ? `, o que define o artigo (${define})` : ""} e cabe no Assunto. “${target.theme}” (o Assunto, volume 0) fica como o foco e a principal do artigo; a vaga da principal com volume fica aberta (nunca uma troca às cegas). A busca nova no Google Ads (grátis) procura outra; para gravar, a SERP da página na localidade da marca é coletada (custo dito antes).`;
  }
  const porque = old && old.volumeValidated && (old.volume ?? 0) > 0 ? `“${old.keyword}” não cabe no Assunto (${principalFitsSubject(target, old) ?? "régua c"})` : `“${old?.keyword ?? target.theme}” tem volume 0`;
  return `${VOLUME_ZERO_NO_CANDIDATE_LABEL}: ${porque} e fica livre, mas nenhuma busca com volume desta leitura leva o núcleo do slug (${nucleo}), cabe no Assunto${target.planRole === "Suporte" ? " e é a faceta deste Suporte (o pedaço da principal é do Pilar)" : ""}: a principal fica por enquanto e o artigo só recebe reforço (nunca troca às cegas). A busca nova no Google Ads (grátis) procura outra.`;
}
export const PRINCIPAL_SUBJECT_UNKNOWN_REASON = "Volume da principal desconhecido (nunca medida, “sem média” vencida ou outro provider): nada é decidido sobre a principal; meça no Minerador (Volume).";
export function principalSubjectSwapReason(target: ImprovementTarget, old: ImprovementKeyword | undefined, nova: ImprovementKeyword, ranking: boolean | null | undefined): string {
  const nucleo = slugCoreWords(target.slug ?? target.planSlug ?? null, target.signals.centralEntity).join(" + ");
  const antiga = old?.keyword ?? target.theme;
  const porque = old && old.volumeValidated && (old.volume ?? 0) > 0 ? `“${antiga}” não passa na régua do Assunto (${principalFitsSubject(target, old) ?? "não cabe no Assunto"})` : `“${antiga}” tem volume 0`;
  const destino = target.kind === "published" && old?.id === target.principalSubject?.keywordId ? "continua no artigo como o Assunto (a página)" : target.kind === "subject" ? "continua no artigo como o Assunto" : (principalSubjectConflictDetail(target, old ?? nova)?.kind ?? "intent_dna") !== "intent_dna" ? "sai do artigo (vai para “Keywords não agrupadas”, nunca some)" : "fica como secundária";
  return `Assunto pela principal (SDD 2026-10-18): ${porque}; “${nova.keyword}” (${nova.volume}) assume como principal — leva o núcleo do slug (${nucleo}) e cabe no Assunto (público, restrição, localidade e intenção). “${antiga}” ${destino}. Título, slug e canonical não mudam. Proposta: decisão sua na prévia.${ranking === true ? " Aviso: a página aparece no Google pela principal antiga — ela fica no título e no slug como o Assunto." : ""}`;
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
  // 2026-10-17 (noite) · o Pilar sem volume troca mesmo com a principal de identidade ("Pilar troca, Suportes ficam").
  if (target.kind !== "subject" || target.declaredPrincipalId || old?.volumeValidated || identityHoldsPrincipal(target, old)) return false;
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
/**
 * Quanto do conjunto de palavras o artigo contém. 2026-10-17 · primeiro as palavras que DISTINGUEM (fora do assunto
 * comum do Silo: "plano de internet residencial mais barato" é de "barata", não do Pilar, porque "plano", "internet" e
 * "residencial" são de todos); depois o artigo cuja principal inteira está na frase ("combo tv internet e celular"
 * leva "combo internet e celular" inteira e só acrescenta "tv"; de "combo internet tv streaming" falta "streaming");
 * por último, como antes: principal e slug pesam mais que o Assunto, que pesa mais que os detalhes (o Pilar desempata).
 */
function afinidadeNoSilo(target: ImprovementTarget, line: ImprovementCopyLine, palavras: Set<string>): number {
  const quota = (conjunto: Set<string>, de: Set<string> = palavras) => [...de].filter(word => conjunto.has(word)).length / Math.max(1, de.size);
  const doArtigo = new Set([...line.principal, ...line.slug]), doAssunto = copyWords(target.theme);
  const distintas = new Set([...palavras].filter(word => !line.common.has(word)));
  const peloQueDistingue = distintas.size ? quota(doArtigo, distintas) * 3 + quota(doAssunto, distintas) * 2 + quota(line.words, distintas) : 0;
  const contemAPrincipal = line.principal.size > 0 && contains(palavras, line.principal) ? 1 : 0;
  return peloQueDistingue * 100 + contemAPrincipal * 10 + quota(doArtigo) * 3 + quota(doAssunto) * 2 + quota(line.words) + (target.planRole === "Pilar" ? 0.1 : 0);
}
const chaveDaVariante = (palavras: Set<string>) => [...palavras].sort().join(" ");

/**
 * 2026-10-17 · O CONTEXTO DO SILO PARA A LINHA DE COPY, uma regra só para a busca nova (o que é medido) e para o
 * alocador (o que entra): as marcas que a SERP mostra e o assunto comum de cada Silo (as palavras que estão na principal
 * de dois ou mais artigos dele).
 */
export type ImprovementSiloContext = { brands: Set<string>; common: Map<string, Set<string>> };
export function improvementSiloContext(targets: readonly ImprovementTarget[], byId: ReadonlyMap<string, ImprovementKeyword>, vocabulary: Readonly<Record<string, ImprovementSerpVocabulary>>): ImprovementSiloContext {
  const base = new Map(targets.map(target => [target.id, improvementCopyLine(target, byId, vocabulary[target.id] ?? null)]));
  const contagem = new Map<string, Map<string, number>>();
  for (const target of targets) {
    if (!target.territoryRef) continue;
    const doSilo = contagem.get(target.territoryRef) ?? new Map<string, number>();
    for (const word of base.get(target.id)!.principal) doSilo.set(word, (doSilo.get(word) ?? 0) + 1);
    contagem.set(target.territoryRef, doSilo);
  }
  const common = new Map([...contagem].map(([ref, doSilo]) => [ref, new Set([...doSilo].filter(([, vezes]) => vezes >= 2).map(([word]) => word))] as const));
  return { brands: brandWordsOf(targets, base, vocabulary), common };
}
/** Por que uma candidata que cabia na linha de copy ficou de fora (a frase da prévia quando o artigo fica sem reforço). */
type CopyLineRejection = { keywordId: string; motivo: string };

function copyLineEdges(targets: readonly ImprovementTarget[], keywords: readonly ImprovementKeyword[], byId: ReadonlyMap<string, ImprovementKeyword>, vocabulary: Readonly<Record<string, ImprovementSerpVocabulary>>): { edges: CopyEdge[]; rejected: Map<string, CopyLineRejection[]>; lines: Map<string, ImprovementCopyLine> } {
  const textosDaLista = new Set(keywords.filter(k => !k.external).map(k => key(k.keyword)));
  const silo = improvementSiloContext(targets, byId, vocabulary);
  const linhas = new Map(targets.map(target => [target.id, improvementCopyLine(target, byId, vocabulary[target.id] ?? null, { common: silo.common.get(target.territoryRef ?? "") })]));
  const marcas = silo.brands;
  const rejected = new Map<string, CopyLineRejection[]>();
  const fora = (targetId: string, keywordId: string, motivo: string) => { rejected.set(targetId, [...(rejected.get(targetId) ?? []), { keywordId, motivo }]); };
  const brutas = targets.flatMap(target => {
    if (!target.territoryRef) return [];
    const vocab = vocabulary[target.id] ?? null;
    const old = improvementCurrentPrincipal(target, byId);
    // 2026-10-18 · o publicado com o Assunto na página de volume 0 (ou com a principal antiga fora da régua c) também recebe a linha de copy.
    const porVolume = principalSwapByVolume(target, old);
    if (target.kind === "published" && !(vocab && old?.volumeValidated) && !porVolume) return [];
    const line = linhas.get(target.id)!;
    if (!line.principal.size && !line.slug.size && !line.entity.size) return [];
    const livre = porVolume || (target.kind === "subject" && !target.declaredPrincipalId && !old?.volumeValidated && principalSwapStanding(target, old) !== "unknown");
    // A identidade que FICA: 2026-10-18 · só com volume definido ou desconhecido (o volume 0 recebe a proposta — SDD do Assunto pela principal).
    const identidade = livre && !porVolume && identityHoldsPrincipal(target, old);
    const principalText = line.principalText ? key(line.principalText) : null;
    const doArtigo = nucleoDoArtigo(target, line);
    const nomeiaOperadoras = [...doArtigo].some(word => OPERATOR_WORDS.has(word));
    return keywords.flatMap(candidate => {
      // A ideia da busca que repete uma keyword que já está na lista (ou a própria principal) não entra de novo.
      if (candidate.external && (textosDaLista.has(key(candidate.keyword)) || key(candidate.keyword) === principalText)) return [];
      if (copyLineBarrier(target, candidate)) return [];
      const marcasDaCandidata = [...copyWords(candidate.keyword)].filter(word => marcas.has(word));
      const match = copyLineMatch(line, candidate.keyword, marcasDaCandidata.length ? new Set(marcasDaCandidata) : undefined);
      if (!match.fits) return [];
      // 2026-10-17 (noite) · a candidata que NEGA uma entidade do artigo ("tv box sem internet") é outra intenção: fica fora, dito na prévia.
      const nega = negaOAssunto(`${line.principalText ?? ""} ${target.theme} ${lastSlugSegment(target.slug ?? target.planSlug ?? null)}`, new Set([...doArtigo, ...line.entities.flatMap(items => [...items])]), candidate.keyword);
      if (nega) { fora(target.id, candidate.id, `contradiz o Assunto: ${nega}`); return []; }
      // Do plano: a cabeça mais ampla que a principal, com mais volume, só vai para o Pilar (as demais regras de cabeça valem fora do plano).
      // 2026-10-18 · "cabeça do Pilar" = a do núcleo do Pilar/Silo; a cabeça da faceta do próprio Suporte reforça o contexto (`suporteReservaAoPilar`).
      const reservada = target.planRole ? (target.planRole !== "Pilar" ? suporteReservaAoPilar(target, targets, linhas, old, candidate) : null) : headOverPrincipal(old, candidate) ? CABECA_DO_PILAR_REASON : null;
      if (reservada) { fora(target.id, candidate.id, reservada); return []; }
      /*
       * 2026-10-17 · com a principal de identidade SEM volume num Suporte, o pedaço dela acima de `BROAD_HEAD_MAX_VOLUME`
       * ("claro internet residencial", 49.500) fica de fora ANTES de alocar — antes ele ocupava a vaga e saía depois,
       * e o artigo ficava com menos reforço do que podia (amarelo: 4 de 5 vagas).
       */
      // 2026-10-18 · vale para a principal de identidade do Suporte com ou sem a troca pelo volume 0 (o pedaço acima de 5.000 nunca é dele).
      if (targetPrincipalIsIdentity(target, old) && livre && target.planRole === "Suporte" && old && (candidate.volume ?? 0) > BROAD_HEAD_MAX_VOLUME) {
        const daPrincipal = copyWords(old.keyword), dela = copyWords(candidate.keyword);
        if (dela.size < daPrincipal.size && [...dela].every(word => daPrincipal.has(word))) { fora(target.id, candidate.id, `é cabeça (mais de ${BROAD_HEAD_MAX_VOLUME} buscas): um Suporte não ranqueia nela`); return []; }
      }
      // A busca com marca (operadora…) só vai para o artigo que nomeia aquela marca ou fala de operadoras.
      if (marcasDaCandidata.length && !nomeiaOperadoras && !marcasDaCandidata.every(word => doArtigo.has(word))) { fora(target.id, candidate.id, "cita uma marca que o artigo não nomeia"); return []; }
      // 2026-10-17 · a principal de identidade (título ou slug) fica: a candidata só reforça.
      const slugCore = livre && !identidade && (target.kind === "subject" ? subjectSlugCoreSwap(target, old, candidate) : carriesSlugCore(target.slug, candidate, target.signals.centralEntity) || carriesSlugCore(target.slug, candidate));
      // 2026-10-18 · régua c: com a troca pelo volume, a candidata a principal leva o núcleo do slug E cabe no Assunto.
      const pedacoDaAntiga = Boolean(old) && target.planRole === "Suporte" && (() => { const antiga = copyWords(old!.keyword), dela = copyWords(candidate.keyword); return dela.size < antiga.size && [...dela].every(word => antiga.has(word)); })();
      const principalOk = livre && !identidade && (porVolume ? principalFitsSubject(target, candidate) === null && !pedacoDaAntiga : slugCore || keepsIntent(old, candidate) && (match.cover >= 0.75 || match.serp >= 2 || contains(copyWords(candidate.keyword), line.entity)));
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
  /*
   * 2026-10-17 · A MESMA BUSCA ENTRA NO MÁXIMO DUAS VEZES NO ARTIGO (`sameSearchKey`), as de maior volume — vale para
   * toda variante, não só para a da principal (SUBSTITUI "a variante da própria principal vale no máximo duas vezes",
   * que deixava "internet residencial vivo", "vivo residencial internet", "internet da vivo residencial" e "internet
   * residencial da vivo" ocuparem as 4 vagas de "Claro, Vivo ou TIM").
   */
  const mesmaBusca = new Map<string, number>();
  /*
   * 2026-10-18 · A MESMA LINHA DO GOOGLE ADS NÃO OCUPA DUAS VAGAS (RF19, amarelo: "internet instalação" 880 e "instalação
   * internet" 880 levavam as 2 vagas da mesma busca e "instalação de internet" 720 sobrava). O Google Ads agrupa as
   * variantes próximas e dá o MESMO volume para cada grafia do grupo: a mesma busca com o mesmo volume é um dado só. A
   * primeira entra; a outra fica fora, dita, e não conta no teto — a segunda vaga vai para a grafia de volume próprio.
   */
  const mesmaLinhaDoAds = new Map<string, string>();
  const nomeDe = (id: string) => targets.find(t => t.id === id)?.theme ?? id;
  const filtradas = brutas
    .filter(edge => {
      const target = targets.find(t => t.id === edge.targetId)!;
      const dono = donoDaVariante.get(`${target.territoryRef}|${chaveDaVariante(copyWords(byId.get(edge.keywordId)?.keyword))}`);
      if (dono !== edge.targetId && dono) fora(edge.targetId, edge.keywordId, `é variante da mesma busca de outro artigo do Silo (“${nomeDe(dono)}”)`);
      return dono === edge.targetId;
    })
    .sort((a, b) => b.volume - a.volume)
    .filter(edge => {
      const target = targets.find(t => t.id === edge.targetId)!, line = linhas.get(target.id)!;
      const palavras = copyWords(byId.get(edge.keywordId)?.keyword);
      const chave = `${target.id}|${sameSearchKey(byId.get(edge.keywordId)?.keyword)}`;
      const linhaDoAds = `${chave}|${edge.volume}`, jaNaLinha = mesmaLinhaDoAds.get(linhaDoAds);
      if (jaNaLinha) { fora(target.id, edge.keywordId, `é a mesma linha do Google Ads de “${jaNaLinha}” (a mesma busca, o mesmo volume): não ocupa outra vaga`); return false; }
      const entra = () => { mesmaBusca.set(chave, (mesmaBusca.get(chave) ?? 0) + 1); mesmaLinhaDoAds.set(linhaDoAds, byId.get(edge.keywordId)?.keyword ?? edge.keywordId); return true; };
      // 2026-10-17 (noite) · no Pilar que troca pelo termo-cabeça, a candidata a principal também conta no teto da mesma busca (RF19): a principal nova + uma variante.
      if ((mesmaBusca.get(chave) ?? 0) >= SAME_SEARCH_MAX_PER_ARTICLE && !(edge.principalOk && !(pilarTrocaPelaCabeca(target, byId.get(target.primaryId ?? "")) && targetPrincipalIsIdentity(target, byId.get(target.primaryId ?? ""))))) { fora(target.id, edge.keywordId, `o artigo já leva ${SAME_SEARCH_MAX_PER_ARTICLE} variantes desta mesma busca`); return false; }
      const daPrincipal = line.principal.size > 0 && chaveDaVariante(palavras) === chaveDaVariante(line.principal);
      if (daPrincipal) {
        const ja = variantesDaPrincipal.get(target.id) ?? 0;
        if (ja >= 2 && !edge.principalOk) { fora(target.id, edge.keywordId, "o artigo já leva duas variantes da principal"); return false; }
        variantesDaPrincipal.set(target.id, ja + 1);
        return entra();
      }
      const proprias = [...palavras].filter(word => line.words.has(word) && (contagemNoSilo.get(`${target.territoryRef}|${word}`) ?? 0) < 2);
      if (!proprias.length) { fora(target.id, edge.keywordId, "leva só o assunto comum do Silo, nada próprio do artigo"); return false; }
      /*
       * 2026-10-17 · A PALAVRA PRÓPRIA DE OUTRO ARTIGO INDICA O ARTIGO DELE ("combo tv e celular" não reforça "Internet,
       * TV Box e streaming": "celular" é a palavra de "combo internet e celular"). Só fica quando a frase leva a principal
       * inteira deste artigo ("combo tv internet e celular" leva "combo internet e celular" inteira: é dele).
       */
      const deOutro = [...palavras].find(word => !line.words.has(word) && !line.common.has(word) && (contagemNoSilo.get(`${target.territoryRef}|${word}`) ?? 0) === 1 && targets.some(outro => outro.id !== target.id && outro.territoryRef === target.territoryRef && linhas.get(outro.id)?.principal.has(word)));
      if (deOutro && !(line.principal.size > 0 && contains(palavras, line.principal))) {
        const dono = targets.find(outro => outro.id !== target.id && outro.territoryRef === target.territoryRef && linhas.get(outro.id)?.principal.has(deOutro));
        fora(target.id, edge.keywordId, `leva palavra própria de outro artigo do Silo (“${dono?.theme ?? deOutro}”)`);
        return false;
      }
      return entra();
    });
  /*
   * 2026-10-17 · ASSUNTO QUE ENUMERA ENTIDADES: REFORÇO EQUILIBRADO POR ENTIDADE (dono: "o artigo compara 3 operadoras:
   * o reforço tem que cobrir as entidades do título/slug de forma equilibrada"). Com 2+ entidades próprias
   * (`assuntoEntityItems`), as candidatas vão em rodadas: a melhor de cada entidade (e da comparação entre elas) antes da
   * segunda de qualquer uma; dentro da entidade, uma busca nova antes da repetição da mesma busca. A rodada vira o tier
   * (o alocador atende o tier menor primeiro); fora desse caso, nada muda.
   */
  const foraDoEquilibrio = new Set<CopyEdge>();
  for (const target of targets) {
    const line = linhas.get(target.id)!;
    const proprias = line.entities.filter(items => [...items].some(word => !line.common.has(word)));
    if (proprias.length < 2) continue;
    // Nenhuma entidade passa da sua parte das vagas, mesmo quando as outras não têm candidata (a vaga fica aberta, dita).
    const vagas = Math.max(1, IMPROVEMENT_ARTICLE_MAX_KEYWORDS - Math.max(1, target.memberIds.length));
    const parte = Math.ceil(vagas / proprias.length);
    const grupos = new Map<string, CopyEdge[]>();
    for (const edge of filtradas.filter(e => e.targetId === target.id)) {
      const nomeadas = namedEntities(line, copyWords(byId.get(edge.keywordId)?.keyword)).own;
      const grupo = nomeadas.length === 1 ? `entidade:${nomeadas[0]}` : nomeadas.length > 1 ? "comparacao" : "neutra";
      grupos.set(grupo, [...(grupos.get(grupo) ?? []), edge]);
    }
    for (const [grupo, arestas] of grupos) {
      const vistas = new Set<string>();
      const ordem = arestas.map(edge => {
        const chave = sameSearchKey(byId.get(edge.keywordId)?.keyword), repete = vistas.has(chave);
        vistas.add(chave);
        return { edge, repete };
      }).sort((a, b) => Number(a.repete) - Number(b.repete) || a.edge.tier - b.edge.tier || b.edge.score - a.edge.score || b.edge.volume - a.edge.volume);
      // A rodada vem antes; na mesma rodada, uma busca nova antes da repetição da mesma busca (rodada × 3 + repete: sem sobrepor rodadas).
      ordem.forEach(({ edge, repete }, rodada) => {
        if (grupo !== "neutra" && rodada >= parte) { foraDoEquilibrio.add(edge); fora(target.id, edge.keywordId, `a parte de cada entidade do Assunto é de ${parte} vaga(s): o resto fica para as outras`); return; }
        edge.tier += rodada * 3 + (repete ? 1 : 0);
      });
    }
  }
  return { edges: filtradas.filter(edge => !foraDoEquilibrio.has(edge)), rejected, lines: linhas };
}
/**
 * 2026-10-17 · No artigo que enumera entidades, as que ficaram sem nenhuma keyword (nenhuma com volume coube nesta
 * leitura) são ditas: a parte delas fica aberta, nunca preenchida por outra entidade.
 */
function entityGapReason(target: ImprovementTarget, line: ImprovementCopyLine | undefined, memberIds: readonly string[], byId: ReadonlyMap<string, ImprovementKeyword>): string | null {
  if (!line || target.kind !== "subject") return null;
  const lista = assuntoEntityList(target.theme).filter(item => [...item.words].some(word => !line.common.has(word)));
  if (lista.length < 2) return null;
  const palavras = memberIds.filter(id => id !== target.primaryId).map(id => copyWords(byId.get(id)?.keyword));
  const semNada = lista.filter(item => !palavras.some(set => [...item.words].some(word => set.has(word) && !line.common.has(word))));
  return semNada.length ? `Equilíbrio por entidade do Assunto: ${semNada.map(item => `“${item.label}”`).join(", ")} sem keyword de reforço com volume nesta leitura; a parte de cada uma fica aberta (nunca vai para outra entidade).` : null;
}
/** Do plano: a candidata é a cabeça mais ampla da principal (só palavras dela, menos que todas) e tem mais volume. */
function cabecaDaPrincipal(principal: ImprovementKeyword | undefined, candidate: ImprovementKeyword): boolean {
  if (!principal?.volumeValidated || !(principal.volume! > 0) || !(candidate.volume! > principal.volume!)) return false;
  const daPrincipal = copyWords(principal.keyword), daCandidata = copyWords(candidate.keyword);
  return daCandidata.size < daPrincipal.size && [...daCandidata].every(word => daPrincipal.has(word));
}
const CABECA_DO_PILAR_REASON = "é mais ampla que a principal (cabeça do Pilar)";
/*
 * 2026-10-18 · A CABEÇA DO PILAR É A DO NÚCLEO DO PILAR/SILO, NÃO A DA FACETA DO SUPORTE (amarelo da WifiConecta, no
 * refazedor: o Suporte "Instalação de internet: taxas, prazo e quando chega a primeira fatura" — principal Travada
 * "instalação de internet residencial", 170 — recusava "internet instalação" 880, "instalação internet" 880 e "instalação
 * de internet" 720 como "mais ampla que a principal (cabeça do Pilar)" e ficou com 3 keywords). Com a principal de pouco
 * volume, toda busca mais ampla da MESMA faceta passava por cabeça do Pilar. No Suporte do plano, a busca mais ampla que a
 * principal (`cabecaDaPrincipal`, `headOverPrincipal`) só fica reservada ao Pilar quando não leva nenhuma palavra própria
 * deste artigo: todas as palavras dela são do núcleo do Pilar/Silo (a principal, o slug e a entidade do Pilar; a entidade
 * e o slug do Silo; o assunto comum dos artigos) — "internet residencial", "plano de internet", "planos de internet
 * residencial". A que leva a palavra própria do Suporte (a faceta dele: "instalação") é a cabeça da faceta e entra como
 * secundária de contexto (dono, 17/10: "as keywords mais amplas podem reforçar o contexto"), até `BROAD_HEAD_MAX_VOLUME`
 * (acima, um Suporte não ranqueia nela) e com as regras do Silo de sempre (variante num artigo só, no máximo 2 da mesma
 * busca, marca, palavra de outro artigo). Sem o Pilar lido — nem nesta leitura nem pelo servidor (`planPillar`) —, a regra
 * de antes: fecha para o lado seguro.
 */
function nucleoDoPilarESilo(target: ImprovementTarget, targets: readonly ImprovementTarget[], lines: ReadonlyMap<string, ImprovementCopyLine>): Set<string> | null {
  const pilares = targets
    .filter(t => t.id !== target.id && t.kind === "subject" && t.planRole === "Pilar" && Boolean(t.territoryRef) && t.territoryRef === target.territoryRef)
    .map(t => ({ keyword: lines.get(t.id)?.principalText ?? null, slug: subjectSlugOf(t), entity: t.signals.centralEntity ?? null }));
  const fontes = [...pilares, ...(target.planPillar ? [target.planPillar] : [])];
  if (!fontes.length) return null;
  return new Set([
    ...fontes.flatMap(pilar => [...copyWords(pilar.keyword), ...copyWords(lastSlugSegment(pilar.slug)), ...copyWords(pilar.entity)]),
    ...(lines.get(target.id)?.common ?? []), ...copyWords(target.siloContext?.centralEntity ?? null),
  ]);
}
/** No Suporte do plano: por que a busca mais ampla que a principal fica com o Pilar (ou fora); `null` = ela reforça o contexto deste artigo. */
function suporteReservaAoPilar(target: ImprovementTarget, targets: readonly ImprovementTarget[], lines: ReadonlyMap<string, ImprovementCopyLine>, principal: ImprovementKeyword | undefined, candidate: ImprovementKeyword): string | null {
  if (!(cabecaDaPrincipal(principal, candidate) || headOverPrincipal(principal, candidate))) return null;
  const nucleo = nucleoDoPilarESilo(target, targets, lines), line = lines.get(target.id);
  const proprias = nucleo && line ? new Set([...nucleoDoArtigo(target, line)].filter(word => !nucleo.has(word))) : null;
  if (!proprias || ![...copyWords(candidate.keyword)].some(word => proprias.has(word))) return CABECA_DO_PILAR_REASON;
  if ((candidate.volume ?? 0) > BROAD_HEAD_MAX_VOLUME) return `é cabeça (mais de ${BROAD_HEAD_MAX_VOLUME} buscas): um Suporte não ranqueia nela`;
  return null;
}
/** 2026-10-17 · o artigo tem vaga e nenhuma keyword de reforço entrou: a frase diz isso (nunca "adequado") e o motivo. */
export const NO_REINFORCEMENT_FOUND_LABEL = "Sem keyword de reforço encontrada";
export const hasNoReinforcementFound = (p: Pick<ImprovementProposal, "reasons">) => p.reasons.some(reason => reason.startsWith(NO_REINFORCEMENT_FOUND_LABEL));
function noReinforcementReason(rejeitadas: readonly CopyLineRejection[], byId: ReadonlyMap<string, ImprovementKeyword>): string {
  const vistas = new Set<string>();
  const principais = rejeitadas.filter(item => { if (vistas.has(item.keywordId) || !byId.get(item.keywordId)) return false; vistas.add(item.keywordId); return true; })
    .sort((a, b) => (byId.get(b.keywordId)!.volume ?? 0) - (byId.get(a.keywordId)!.volume ?? 0)).slice(0, 3);
  if (!principais.length) return `${NO_REINFORCEMENT_FOUND_LABEL}: nenhuma keyword com volume da lista da marca nem das ideias do Google Ads desta leitura cabe no Assunto, no slug e no DNA do artigo. A principal fica; a vaga continua aberta para a próxima leitura.`;
  return `${NO_REINFORCEMENT_FOUND_LABEL}: as que cabiam no Assunto ficaram de fora pelas regras do Silo — ${principais.map(item => `“${byId.get(item.keywordId)!.keyword}” (${byId.get(item.keywordId)!.volume}) ${item.motivo}`).join("; ")}. A principal fica; a vaga continua aberta para a próxima leitura.`;
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
/*
 * 2026-10-17 · SEMENTES POR ENTIDADE E POR FACETA DO ASSUNTO (amarelo: o Google Ads devolveu 2 ideias para "combo
 * internet tv streaming" + o slug, 6 para "instalação de internet residencial" + o slug e 13 para "claro vivo ou tim
 * internet residencial" — frase longa volta quase só ela mesma). As curtas saem do próprio plano:
 *  - por entidade enumerada no Assunto: a principal só com aquela entidade ("claro internet residencial", "vivo internet
 *    residencial", "tim internet residencial"; "combo internet tv", "combo internet streaming");
 *  - pelas facetas depois dos dois-pontos: a cabeça ("instalação de internet"), a faceta de uma palavra com a cabeça
 *    ("taxas de instalação de internet", "prazo de instalação de internet") e a de várias, curta, com o assunto da
 *    cabeça ("primeira fatura internet").
 */
const conteudo = (token: string) => copyWords(token).size > 0;
function entitySeeds(principalText: string | null, line: ImprovementCopyLine): string[] {
  const proprias = line.entities.filter(items => [...items].some(word => !line.common.has(word)));
  if (!principalText || proprias.length < 2) return [];
  const tokens = principalText.trim().split(/\s+/);
  const daPalavra = tokens.map(token => [...copyWords(token)][0] ?? null);
  return proprias.flatMap((items, index) => {
    const outras = new Set(proprias.filter((_, outro) => outro !== index).flatMap(set => [...set]));
    const sai = daPalavra.map(word => Boolean(word && outras.has(word)));
    const fica = tokens.filter((token, i) => !sai[i] && (conteudo(token) || !(sai[i - 1] || sai[i + 1])));
    return daPalavra.some((word, i) => !sai[i] && word && items.has(word)) ? [fica.join(" ")] : [];
  });
}
function facetSeeds(theme: string): string[] {
  const facetas = assuntoFacets(theme);
  if (!facetas) return [];
  const cabeca = facetas.head.toLowerCase();
  const assuntoDaCabeca = cabeca.split(/\s+/).filter(conteudo).at(-1) ?? "";
  return [cabeca, ...facetas.facets.map(faceta => {
    const tokens = faceta.toLowerCase().split(/\s+/);
    const deConteudo = tokens.filter(conteudo);
    if (deConteudo.length === 1) return `${deConteudo[0]} de ${cabeca}`;
    let inicio = tokens.length, achadas = 0;
    while (inicio > 0 && achadas < 2) { inicio--; if (conteudo(tokens[inicio])) achadas++; }
    const cauda = tokens.slice(inicio).join(" ");
    return copyWords(cauda).has([...copyWords(assuntoDaCabeca)][0] ?? "") ? cauda : `${cauda} ${assuntoDaCabeca}`.trim();
  })];
}
export function improvementDiscoverySeeds(target: ImprovementTarget, byId: ReadonlyMap<string, ImprovementKeyword>, vocabulary: ImprovementSerpVocabulary | null | undefined, assuntoSeeds: readonly string[] = [], context: { common?: ReadonlySet<string> } = {}): string[] {
  const line = improvementCopyLine(target, byId, vocabulary, context);
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
  const relacionadas = (vocabulary?.relatedSearches ?? []).filter(phrase => { const daFrase = marcasDe(phrase); return !foreignLocalSearch(target, phrase, "") && !marcaAlheia(phrase) && copyLineMatch(line, phrase, daFrase.length ? new Set(daFrase) : undefined).fits; }).slice(0, 4);
  // Pedaços do TÍTULO só quando o Assunto não tem keyword nem slug (formato antigo): "Veja o que entra na conta" trazia "entra na conta do google".
  const doTitulo = line.principalText || line.slug.size ? [] : assuntoSeeds;
  const doAssunto = target.kind === "subject" ? [...facetSeeds(target.theme), ...entitySeeds(line.principalText, line)] : [];
  const sementes = [line.principalText, lastSlugSegment(target.slug ?? target.planSlug ?? null), target.signals.centralEntity, ...doAssunto, ...doTitulo, ...relacionadas]
    .map(seed => (seed ?? "").trim())
    .filter(seed => copyWords(seed).size > 0 && (seed === line.principalText || copyWords(seed).size >= 2) && !marcaAlheia(seed));
  const vistas = new Set<string>();
  return sementes.filter(seed => { const k = key(seed); if (vistas.has(k)) return false; vistas.add(k); return true; }).slice(0, 10);
}
/**
 * A ideia da busca nova está na linha de copy deste alvo? (só texto; volume e dono são lidos depois)
 * 2026-10-17 · com o contexto do Silo, a MESMA régua do alocador: a busca com marca vale no artigo que nomeia a marca
 * (antes, "claro internet residencial" e "tim internet residencial" caíam aqui, sem medir, e o artigo "Claro, Vivo ou
 * TIM" só recebia as da Vivo, que passavam pela linha de "internet residencial barata").
 */
export function improvementIdeaOnCopyLine(target: ImprovementTarget, byId: ReadonlyMap<string, ImprovementKeyword>, vocabulary: ImprovementSerpVocabulary | null | undefined, phrase: string, silo?: ImprovementSiloContext): boolean {
  // 2026-10-19 · a cidade da marca não é busca local de fora (a mesma régua do reforço).
  if (foreignLocalSearch(target, phrase, "")) return false;
  const line = improvementCopyLine(target, byId, vocabulary, { common: silo?.common.get(target.territoryRef ?? "") });
  const marcasDaFrase = silo ? [...copyWords(phrase)].filter(word => silo.brands.has(word)) : [];
  if (marcasDaFrase.length) {
    const doArtigo = nucleoDoArtigo(target, line);
    if (![...doArtigo].some(word => OPERATOR_WORDS.has(word)) && !marcasDaFrase.every(word => doArtigo.has(word))) return false;
  }
  const match = copyLineMatch(line, phrase, marcasDaFrase.length ? new Set(marcasDaFrase) : undefined);
  if (match.fits || !match.carries) return match.fits;
  /*
   * 2026-10-17 (noite) · MEDIR É GRÁTIS (cota do Google Ads); quem decide se entra é a linha de copy com a SERP da
   * principal. A ideia que leva o artigo e tem UMA palavra fora da linha (o assunto comum do Silo não conta) também é
   * medida: a SERP da principal de identidade, coletada no mesmo "Processar artigos", decide depois ("internet e tv
   * residencial" no artigo de TV e streaming — antes ela nem era medida e o artigo ficava sem as de TV).
   */
  const palavras = copyWords(phrase);
  const fora = [...palavras].filter(word => !line.words.has(word) && !line.vocabulary.words.has(word) && !line.common.has(word)).length;
  return fora <= 1 && palavras.size >= 3;
}

/** One allocator, whole brand, no ownership granted to discarded proposals. */
/*
 * 2026-10-19 · O REFAZER DOS PUBLICADOS COM O ASSUNTO NA PÁGINA (cobrança do dono depois da prévia do verde da
 * AdalbaPro). Antes de a linha de sempre escolher principal e reforço, o recorte é reorganizado em volta do Assunto de
 * cada página — a keyword original, a do slug, que é o tema do artigo:
 *
 *   1. a principal antiga que não cabe no Assunto (régua c com o modificador que define o artigo) deixa de ser a
 *      principal: o Assunto vira o foco e a linha procura a principal com volume pela régua de sempre; sem candidata,
 *      o Assunto fica como o foco e a vaga da principal com volume fica aberta, dita na prévia (SUBSTITUI "a principal
 *      fica por enquanto", R7 da SDD 2026-10-18);
 *   2. a MESMA busca em dois artigos do recorte é canibalização (RF5, RF19): fica no artigo cuja linha a leva (o de
 *      principal com ela; senão o que melhor a cabe) e sai dos outros para "Keywords não agrupadas" (nunca some);
 *   3. a keyword que não cabe no Assunto do artigo onde está e cabe no Assunto de UM outro artigo do recorte vai para
 *      ele (a mesma régua da linha de copy, `copyLineMatch`, e a régua c; a afinidade pelo que distingue o artigo,
 *      `afinidadeNoSilo`, desempata). Só com vaga no destino; nunca em ciclo.
 *
 * Tudo é proposta na prévia (a cópia de trabalho); nada é gravado sem o Confirmar. Um núcleo só: esta função prepara os
 * alvos e as keywords que `planArticleImprovementsCore` lê, e devolve o que mudou de lugar para a prévia e o gravador.
 */
type SubjectReorganization = {
  targets: ImprovementTarget[]; keywords: ImprovementKeyword[];
  demoted: Map<string, { keywordId: string; reason: string }>;
  moves: { keywordId: string; from: string; to: string }[];
  drops: { keywordId: string; from: string; reason: string }[];
};
export const ASSUNTO_AS_FOCUS_LABEL = "Assunto como foco";
const participaDoRefazer = (t: ImprovementTarget) => assuntoEhAPagina(t) && t.articleExists !== false && Boolean(t.territoryRef);
/** A keyword que sai do artigo pela reorganização não volta por outra régua nesta mesma leitura (nem para o dono da busca). */
const FORA_PELA_REORGANIZACAO = "reorganizacao:fora";
function reorganizePublishedSubjects(targets: readonly ImprovementTarget[], keywords: readonly ImprovementKeyword[]): SubjectReorganization {
  const vazio: SubjectReorganization = { targets: [...targets], keywords: [...keywords], demoted: new Map(), moves: [], drops: [] };
  const byId = new Map(keywords.map(k => [k.id, k]));
  const novos = targets.map(t => ({ ...t, memberIds: [...t.memberIds] }));
  const participantes = novos.filter(participaDoRefazer);
  if (!participantes.length) return vazio;
  const demoted = new Map<string, { keywordId: string; reason: string }>();
  // 1 · a principal antiga que não cabe no Assunto deixa de ser a principal (fica entre as keywords, como qualquer candidata).
  for (const t of participantes) {
    const pagina = t.principalSubject!.keywordId;
    const antiga = t.primaryId && t.primaryId !== pagina ? byId.get(t.primaryId) : undefined;
    if (!antiga || t.principalSubject!.volumeState !== "zero" || principalSwapStanding(t, antiga) === "locked") continue;
    const motivo = principalFitsSubject(t, antiga);
    if (!motivo) continue;
    demoted.set(t.id, { keywordId: antiga.id, reason: motivo });
    t.primaryId = pagina;
  }
  // A linha de cada Assunto: o título e o slug da página (a principal antiga não conta: ela pode ser justamente a errada).
  const linhas = new Map(participantes.map(t => {
    const line = improvementCopyLine({ ...t, primaryId: null, planPrincipalId: null, declaredPrincipalId: null }, byId, null);
    // "sem tráfego pago" / "sem anúncios" fala de orgânico: a busca orgânica cabe na linha dele.
    if (subjectDefiningModifiers(t).some(m => m.kind === "restricao" && m.words.some(word => ORGANICO_DE.test(word)))) line.words.add("organic");
    return [t.id, line] as const;
  }));
  const comuns = new Map<string, number>();
  for (const line of linhas.values()) for (const word of line.principal) comuns.set(word, (comuns.get(word) ?? 0) + 1);
  for (const line of linhas.values()) for (const [word, vezes] of comuns) if (vezes >= 2) line.common.add(word);
  const cabeNoAssunto = (t: ImprovementTarget, k: ImprovementKeyword) => {
    const line = linhas.get(t.id)!;
    const match = copyLineMatch(line, k.keyword);
    if (!match.fits) return null;
    const conflito = principalSubjectConflictDetail(t, k);
    if (conflito && conflito.kind !== "intent_dna") return null;
    if (negaOAssunto(`${t.theme} ${lastSlugSegment(t.slug)}`, new Set([...line.principal, ...line.slug]), k.keyword)) return null;
    return match;
  };
  const membrosMoveis = (t: ImprovementTarget) => t.memberIds.filter(id => id !== t.primaryId && id !== t.principalSubject!.keywordId).map(id => byId.get(id)).filter((k): k is ImprovementKeyword => Boolean(k) && !k!.published && !k!.external);
  const vagas = (t: ImprovementTarget) => IMPROVEMENT_ARTICLE_MAX_KEYWORDS - t.memberIds.filter(id => id !== t.principalSubject!.keywordId || id === t.primaryId).length;
  const drops: SubjectReorganization["drops"] = [];
  const moves: SubjectReorganization["moves"] = [];
  const clones = new Map<string, ImprovementKeyword>();
  const move = (k: ImprovementKeyword, de: ImprovementTarget, para: ImprovementTarget) => {
    de.memberIds = de.memberIds.filter(id => id !== k.id);
    para.memberIds = [...para.memberIds, k.id];
    clones.set(k.id, { ...k, ownerId: para.id });
    moves.push({ keywordId: k.id, from: de.id, to: para.id });
  };
  const larga = (k: ImprovementKeyword, de: ImprovementTarget, reason: string) => {
    de.memberIds = de.memberIds.filter(id => id !== k.id);
    clones.set(k.id, { ...k, ownerId: FORA_PELA_REORGANIZACAO });
    drops.push({ keywordId: k.id, from: de.id, reason });
  };
  /*
   * 2 · A MESMA BUSCA EM DOIS ARTIGOS DO RECORTE (`sameSearchKey`: as mesmas palavras sem as de ligação, qualquer ordem).
   * Dono: o artigo cuja principal é essa busca; senão o artigo cuja linha a cabe (copyLineMatch + régua c), o de mais
   * cobertura, o que já leva a de mais volume. Se o dono não a leva, a grafia de mais volume vai para ele; as outras saem.
   */
  // 2a · dentro do artigo: a MESMA linha do Google Ads (a mesma busca com o mesmo volume, RF19) é um dado só — fica a que mais cabe no Assunto.
  for (const t of participantes) {
    const porLinha = new Map<string, ImprovementKeyword[]>();
    for (const k of membrosMoveis(t)) if (k.volumeValidated && (k.volume ?? 0) > 0) { const chave = `${sameSearchKey(k.keyword)}|${k.volume}`; porLinha.set(chave, [...(porLinha.get(chave) ?? []), k]); }
    const principal = byId.get(t.primaryId ?? "");
    for (const [chave, grafias] of porLinha) {
      // A principal na mesma linha do Google Ads: ela fica, e as outras grafias saem.
      if (principal?.volumeValidated && `${sameSearchKey(principal.keyword)}|${principal.volume}` === chave) {
        for (const k of grafias) larga(k, t, `é a mesma linha do Google Ads da principal “${principal.keyword}” (a mesma busca, o mesmo volume): não ocupa outra vaga (RF19)`);
        continue;
      }
      if (grafias.length < 2) continue;
      const [fica, ...resto] = [...grafias].sort((a, b) => (cabeNoAssunto(t, b)?.cover ?? -1) - (cabeNoAssunto(t, a)?.cover ?? -1) || copyWords(a.keyword).size - copyWords(b.keyword).size || a.keyword.length - b.keyword.length || a.id.localeCompare(b.id));
      for (const k of resto) larga(k, t, `é a mesma linha do Google Ads de “${fica.keyword}” (a mesma busca, o mesmo volume): não ocupa outra vaga (RF19)`);
    }
  }
  const porBusca = new Map<string, { t: ImprovementTarget; k: ImprovementKeyword }[]>();
  for (const t of participantes) for (const k of membrosMoveis(t)) { const chave = sameSearchKey(k.keyword); porBusca.set(chave, [...(porBusca.get(chave) ?? []), { t, k }]); }
  // A principal de verdade (com volume) é dona da busca dela; a página (o Assunto, volume 0) não: a grafia com volume da mesma busca vai para o artigo dela.
  const principalDe = new Map(participantes.flatMap(t => { const p = t.primaryId !== t.principalSubject!.keywordId ? byId.get(t.primaryId ?? "") : undefined; return p ? [[sameSearchKey(p.keyword), t.id] as const] : []; }));
  for (const [chave, itens] of porBusca) {
    const alvos = [...new Set(itens.map(item => item.t.id))];
    const doPrincipal = principalDe.get(chave);
    if (alvos.length < 2 && !(doPrincipal && alvos.some(id => id !== doPrincipal))) continue;
    const nota = (t: ImprovementTarget) => {
      const deles = itens.filter(item => item.t.id === t.id);
      const leituras = itens.map(item => cabeNoAssunto(t, item.k));
      return { cabe: leituras.some(Boolean) ? 1 : 0, cover: Math.max(0, ...leituras.map(m => m?.cover ?? 0)), leva: deles.length ? 1 : 0, volume: Math.max(0, ...deles.map(item => item.k.volume ?? 0)), ordem: participantes.indexOf(t) };
    };
    const dono = doPrincipal ? participantes.find(t => t.id === doPrincipal)! : [...participantes].sort((a, b) => { const x = nota(a), y = nota(b); return y.cabe - x.cabe || y.cover - x.cover || y.leva - x.leva || y.volume - x.volume || x.ordem - y.ordem; })[0];
    const doDono = itens.filter(item => item.t.id === dono.id);
    const fora = itens.filter(item => item.t.id !== dono.id).sort((a, b) => (b.k.volume ?? 0) - (a.k.volume ?? 0));
    if (!doDono.length && !doPrincipal && fora.length && vagas(dono) > 0 && cabeNoAssunto(dono, fora[0].k)) { const primeiro = fora.shift()!; move(primeiro.k, primeiro.t, dono); }
    for (const item of fora) if (item.t.memberIds.includes(item.k.id)) larga(item.k, item.t, `é a mesma busca que o artigo “${dono.theme}” já leva (canibalização entre os artigos do grupo)`);
  }
  // 3 · a keyword que não cabe no Assunto do artigo onde está e cabe no de UM outro artigo do recorte vai para ele.
  for (const a of participantes) for (const k of membrosMoveis(a)) {
    if (!k.volumeValidated || !(k.volume! > 0) || cabeNoAssunto(a, k)) continue;
    const palavras = copyWords(k.keyword);
    const destinos = participantes.filter(b => b.id !== a.id && vagas(b) > 0).flatMap(b => {
      const m = cabeNoAssunto(b, k);
      return m ? [{ b, cover: m.cover, afinidade: afinidadeNoSilo(b, linhas.get(b.id)!, palavras) }] : [];
    }).sort((x, y) => y.cover - x.cover || y.afinidade - x.afinidade);
    const [melhor, segundo] = destinos;
    if (!melhor || (segundo && segundo.cover === melhor.cover && segundo.afinidade === melhor.afinidade)) continue;
    move(k, a, melhor.b);
  }
  return { targets: novos, keywords: keywords.map(k => clones.get(k.id) ?? k), demoted, moves, drops };
}
/*
 * 2026-10-19 · A MESMA RÉGUA EM TODO CAMINHO DO PUBLICADO (AGENTS.md §0.5; coordenador: "não pode sobrar caminho velho
 * rodando ao lado"). A mesa D2.1, o "Reforçar publicados" e a diferenciação propõem a troca por
 * `proposePublishedPrimarySwap`; com o Assunto declarado na página, eles leem o Assunto e a régua c daqui — a mesma
 * `principalFitsSubject` do refazedor —, nunca a régua da identidade (T12) nem uma cópia.
 */
export type PublishedPageSubject = { keywordId: string; theme: string; slug: string | null; volumeState: "zero" | "low" | "with_volume" | "unknown"; intent?: string | null; entity?: string | null; territory?: BrandSerpTerritory | null };
const sinaisMinimos = (keywordId: string, text: string, intent: string | null | undefined, entity: string | null | undefined): KeywordDnaSignals => ({ keywordId, text, intent: intent ?? null, secondaryIntent: null, funnel: null, semanticState: null, confidence: null, centralEntity: entity ?? null, modifiers: [], perceivedProblem: null, audience: null, desiredResult: null, editorialType: null, awarenessLevel: null, journeyStage: null, cannibalizationNote: null, dnaVersionId: null, dnaContentHash: null });
/** A candidata (ou a principal atual) cabe no Assunto da página? `null` = cabe; senão, o motivo (a régua c inteira). */
export function publishedSubjectPrincipalVerdict(page: PublishedPageSubject, candidate: { keywordId: string; keyword: string; intent?: string | null; entity?: string | null; volume?: number | null }): string | null {
  const target: ImprovementTarget = { id: page.keywordId, kind: "published", theme: page.theme, note: null, primaryId: page.keywordId, post: "free", memberIds: [page.keywordId], territoryRef: null, slug: page.slug, url: null, canonical: null, signals: sinaisMinimos(page.keywordId, page.theme, page.intent, page.entity), principalSubject: { keywordId: page.keywordId, volumeState: page.volumeState }, articleExists: true, brandTerritory: page.territory ?? null };
  return principalFitsSubject(target, { id: candidate.keywordId, keyword: candidate.keyword, volume: candidate.volume ?? null, volumeValidated: (candidate.volume ?? 0) > 0, signals: sinaisMinimos(candidate.keywordId, candidate.keyword, candidate.intent, candidate.entity) });
}
/** O Assunto da página publicada lido da linha (o resolvedor do Minerador e a régua do volume de §6.1); `null` sem Assunto ou página de Silo. */
export function publishedPageSubjectFromRow(row: { id: unknown; keyword?: unknown; volume_search?: unknown; volume_source?: unknown; analise_semantica?: unknown }, slug: string | null, now = new Date()): PublishedPageSubject | null {
  const semantic = row.analise_semantica && typeof row.analise_semantica === "object" ? row.analise_semantica as Record<string, unknown> : {};
  const subject = resolveKeywordSubject(semantic);
  if (!subject.declared) return null;
  const standing = principalSubjectStanding({ volume_search: typeof row.volume_search === "number" ? row.volume_search : null, volume_source: typeof row.volume_source === "string" ? row.volume_source : null, analise_semantica: semantic }, now);
  if (standing.outOfScope) return null;
  const texto = (value: unknown) => typeof value === "string" && value.trim() && !/^pendente$/i.test(value.trim()) ? value.trim() : null;
  return { keywordId: String(row.id), theme: subjectPhraseOf(String(row.keyword ?? ""), subject), slug, volumeState: standing.volumeState, intent: texto(semantic.intencao_principal), entity: texto(semantic.entidade_central) };
}
/** Depois da linha de sempre: a prévia diz o que mudou de artigo, e o gravador sabe a ordem (a origem primeiro). */
function applySubjectReorganization(original: readonly ImprovementTarget[], reorg: SubjectReorganization, proposals: ImprovementProposal[], byId: ReadonlyMap<string, ImprovementKeyword>): ImprovementProposal[] {
  if (!reorg.demoted.size && !reorg.moves.length && !reorg.drops.length) return proposals;
  const nome = (id: string) => byId.get(id)?.keyword ?? id;
  const tema = (id: string) => original.find(t => t.id === id)?.theme ?? id;
  original.forEach((t, index) => {
    const p = proposals[index];
    if (!p) return;
    p.currentPrimaryId = t.primaryId;
    let mudou = false;
    const sai = (id: string, frase: string) => {
      p.memberIds = p.memberIds.filter(item => item !== id); p.addIds = p.addIds.filter(item => item !== id); p.transfers = p.transfers.filter(item => item !== id);
      if (t.memberIds.includes(id) && !p.removeIds.includes(id)) p.removeIds = [...p.removeIds, id];
      p.reasons.push(frase); mudou = true;
    };
    for (const d of reorg.drops.filter(d => d.from === t.id)) sai(d.keywordId, `“${nome(d.keywordId)}” sai do artigo (vai para “Keywords não agrupadas”, nunca some): ${d.reason}. Decisão sua na prévia.`);
    for (const m of reorg.moves.filter(m => m.from === t.id)) {
      const destino = proposals[original.findIndex(o => o.id === m.to)];
      if (!destino?.memberIds.includes(m.keywordId)) { sai(m.keywordId, `“${nome(m.keywordId)}” sai do artigo (vai para “Keywords não agrupadas”, nunca some): não cabe no Assunto “${t.theme}”. Decisão sua na prévia.`); continue; }
      sai(m.keywordId, `“${nome(m.keywordId)}” vai para o artigo “${tema(m.to)}”: serve ao Assunto dele, não a este (canibalização entre os artigos do grupo). As duas linhas são gravadas na mesma confirmação. Decisão sua na prévia.`);
      p.movedOut = [...(p.movedOut ?? []), { keywordId: m.keywordId, toTargetId: m.to }];
    }
    for (const m of reorg.moves.filter(m => m.to === t.id)) {
      if (!p.memberIds.includes(m.keywordId)) continue;
      if (!p.addIds.includes(m.keywordId)) p.addIds = [...p.addIds, m.keywordId];
      const k = byId.get(m.keywordId);
      const outroSilo = Boolean(k && k.territoryRef !== t.territoryRef);
      if (outroSilo && !p.transfers.includes(m.keywordId)) p.transfers = [...p.transfers, m.keywordId];
      p.reasons.push(`“${nome(m.keywordId)}” vem do artigo “${tema(m.from)}”: serve ao Assunto deste${outroSilo ? " (muda de Silo junto)" : ""}. Para gravar, aceite também “${tema(m.from)}”.`);
      p.movedIn = [...(p.movedIn ?? []), { keywordId: m.keywordId, fromTargetId: m.from }];
      mudou = true;
    }
    const rebaixada = reorg.demoted.get(t.id);
    if (rebaixada) {
      const ficou = p.memberIds.includes(rebaixada.keywordId) && p.principalId !== rebaixada.keywordId;
      p.reasons.push(`“${nome(rebaixada.keywordId)}” deixa de ser a principal: ${rebaixada.reason} (régua c; cobrança do dono de 19/10).${ficou ? " Fica como secundária de contexto." : ""}`);
      if (p.principalId === t.principalSubject?.keywordId) p.subjectKeywordId = t.principalSubject.keywordId;
      mudou = true;
    }
    if (mudou) { p.status = "ready"; p.evidenceBasis = p.evidenceBasis ?? "editorial_and_candidate_serp"; p.reasons = [...new Set(p.reasons)]; }
  });
  return proposals;
}

export function planArticleImprovements(input: {
  targets: readonly ImprovementTarget[]; keywords: readonly ImprovementKeyword[]; evidence: readonly ImprovementEvidence[];
  editorialPicks?: readonly ImprovementEditorialPick[];
  ranking?: Readonly<Record<string, boolean | null>>;
  listReading?: boolean;
  serpVocabulary?: Readonly<Record<string, ImprovementSerpVocabulary>>;
}): ImprovementProposal[] {
  const reorg = reorganizePublishedSubjects(input.targets, input.keywords);
  const proposals = planArticleImprovementsCore({ ...input, targets: reorg.targets, keywords: reorg.keywords });
  return applySubjectReorganization(input.targets, reorg, proposals, new Map(reorg.keywords.map(k => [k.id, k])));
}

function planArticleImprovementsCore(input: {
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
  const linhaDeCopy = copyLineEdges(input.targets, input.keywords, byId, input.serpVocabulary ?? {});
  const copyEdges = linhaDeCopy.edges
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
  /*
   * 2026-10-17 · a principal de identidade que ainda não está nas keywords (artigo sem DNA) já tem a vaga dela: o
   * alocador enche só as outras cinco. Antes ele enchia seis e o teto cortava depois a de menos volume — no artigo que
   * compara entidades, isso tirava justamente a comparação (o equilíbrio é decidido aqui, não no corte).
   */
  const vagaDaPrincipal = (t: ImprovementTarget) => t.kind === "subject" && Boolean(t.primaryId) && !fixed.has(t.primaryId!) && !t.declaredPrincipalId && targetPrincipalIsIdentity(t, byId.get(t.primaryId!)) ? 1 : 0;
  const owners = allocateReinforcementChoices({
    targets: input.targets.map(t => ({ id: t.id, capacity: Math.max(0, 6 - [...fixed.values()].filter(id => id === t.id).length - vagaDaPrincipal(t)), priority: (byId.get(t.primaryId ?? "")?.volumeValidated ? 10 : 0) + (t.kind === "published" ? 0 : 1) })),
    edges: eligible, fixed,
  });
  const proposals = input.targets.map(target => {
    const kept = target.memberIds.filter(id => fixed.get(id) === target.id);
    let added = [...owners].filter(([id, owner]) => owner === target.id && !kept.includes(id)).map(([id]) => id);
    const candidates = [...kept, ...added].filter(id => eligible.some(e => e.targetId === target.id && e.keywordId === id)).map(id => byId.get(id)!).sort((a, b) => (eligible.find(e => e.targetId === target.id && e.keywordId === a.id)?.tier ?? 2) - (eligible.find(e => e.targetId === target.id && e.keywordId === b.id)?.tier ?? 2) || b.volume! - a.volume!);
    const old = improvementCurrentPrincipal(target, byId);
    /*
     * Publicado: só a principal SEM volume é Livre para trocar (dono,
     * 2026-10-01: "só as que têm volume estão travadas ao slug"). Antes, uma
     * candidata com mais volume trocava a principal com volume ("marketing
     * digital para dentistas" 70 → "marketing para dentistas" 210). O Assunto
     * segue como antes: ganha a principal de maior volume.
     */
    // F4 — com principal declarada no plano, a melhoria nunca troca a principal (D1-bis).
    // 2026-10-17 · a principal de identidade (título ou slug) também nunca troca sozinha: as mais amplas só reforçam.
    const identidadeBruta = Boolean(old) && !target.declaredPrincipalId && targetPrincipalIsIdentity(target, old);
    /*
     * 2026-10-18 · O ASSUNTO PELA PRINCIPAL (SDD 2026-10-18 §6.3-b/c). SUBSTITUI "Pilar troca, Suportes ficam" (17/10,
     * noite): com volume 0 — da principal do plano/Assunto ou da PÁGINA publicada com Assunto — a proposta é de uma
     * principal nova com volume que leva o núcleo do slug e cabe no Assunto (régua c), no Pilar (termo-cabeça: cauda
     * curta, mais volume) e no Suporte (a faceta dele); publicado e novo. Volume definido fica (T1); desconhecido: nada.
     */
    const porVolume = Boolean(old) && principalSwapByVolume(target, old);
    const pilarCabeca = porVolume && target.kind === "subject" && target.planRole === "Pilar";
    const identidade = identidadeBruta && !porVolume;
    // A régua nova vale no Assunto (plano ou sem plano) e no publicado COM o Assunto na página; o publicado sem Assunto espera o Minerador.
    const naReguaNova = target.kind === "subject" || Boolean(target.principalSubject);
    const desconhecido = naReguaNova && Boolean(old) && !target.declaredPrincipalId && !old!.volumeValidated && principalSwapStanding(target, old) === "unknown";
    const needsPrimary = target.declaredPrincipalId || identidade || desconhecido ? false : porVolume ? true : target.kind === "subject"
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
    const livreSemVolume = (target.kind === "subject" || porVolume) && !target.declaredPrincipalId && (!old?.volumeValidated || porVolume) && !identidade && !desconhecido;
    const daLinhaDeCopy = (id: string) => copyByPair.get(`${target.id}:${id}`);
    /*
     * 2026-10-17 · ORDEM (SDD da linha única §13 D2, item 1 primeiro): a que leva
     * o núcleo do slug vem antes; entre elas, no Pilar, a de cauda curta com mais
     * volume (AGENTS.md §13: "termos de maior volume e cauda menor tendem a
     * Pilar"); depois, como antes, a mais próxima da principal e do slug, a de
     * mais evidência na SERP e o volume.
     */
    // 2026-10-18 · no Suporte, o pedaço da principal antiga (a cabeça dela) é do Pilar: a principal nova do Suporte é a faceta dele (§15.10).
    const pedacoDaAntiga = (k: ImprovementKeyword) => { if (!old) return false; const antiga = copyWords(old.keyword), dela = copyWords(k.keyword); return dela.size < antiga.size && [...dela].every(word => antiga.has(word)); };
    const levaONucleo = (k: ImprovementKeyword) => daLinhaDeCopy(k.id)?.slugCore ?? (target.kind === "subject" ? subjectSlugCoreSwap(target, old, k) : carriesSlugCore(target.slug, k, target.signals.centralEntity));
    const pilar = target.planRole === "Pilar";
    const pelaLinha = livreSemVolume && (porVolume || candidates.some(k => daLinhaDeCopy(k.id)))
      ? candidates.filter(k => k.id !== target.primaryId && (porVolume ? principalFitsSubject(target, k) === null && !(target.planRole === "Suporte" && pedacoDaAntiga(k)) : daLinhaDeCopy(k.id) ? daLinhaDeCopy(k.id)!.principalOk : keepsIntent(old, k) || subjectSlugCoreSwap(target, old, k)))
        .sort((a, b) => {
          const x = daLinhaDeCopy(a.id)?.match, y = daLinhaDeCopy(b.id)?.match, na = levaONucleo(a), nb = levaONucleo(b);
          return Number(nb) - Number(na)
            || (pilar && na && nb ? copyWords(a.keyword).size - copyWords(b.keyword).size || b.volume! - a.volume! : 0)
            || (y?.cover ?? 0) - (x?.cover ?? 0) || (y?.serp ?? 0) - (x?.serp ?? 0) || b.volume! - a.volume!;
        })
      : null;
    const principalId = target.declaredPrincipalId ?? (needsPrimary ? (pelaLinha ? pelaLinha[0]?.id ?? target.primaryId : pilarCabeca ? target.primaryId : candidates[0]?.id ?? target.primaryId) : target.primaryId);
    /*
     * 2026-10-17 · no Suporte do plano, a cabeça mais ampla que a principal não
     * fica: ela é do Pilar. Com a troca, compara com a NOVA principal (mais
     * volume e só palavras dela); sem troca e com a principal sem volume, toda
     * busca que é só um pedaço da principal ("claro internet residencial" em
     * "claro vivo ou tim internet residencial") é mais ampla que o artigo.
     * SUBSTITUÍDO em 2026-10-18, na parte "com volume" (amarelo, a instalação):
     * só a cabeça do núcleo do Pilar/Silo é do Pilar; a cabeça da faceta do
     * próprio Suporte reforça o contexto até 5.000 (`suporteReservaAoPilar`).
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
      // 2026-10-18 · com a principal de identidade que FICA (volume definido, desconhecido, ou volume 0 sem candidata), as mais amplas reforçam o contexto (T12, parte que continua).
      const mantemAIdentidade = identidadeBruta && principalId === target.primaryId;
      const cabecaDoPedaco = (k: ImprovementKeyword) => pedacoDa(base?.keyword ?? old?.keyword, k) && (!mantemAIdentidade || (k.volume ?? 0) > BROAD_HEAD_MAX_VOLUME);
      // 2026-10-18 · com volume, a MESMA régua das arestas: só a cabeça do núcleo do Pilar/Silo (ou acima de 5.000) sai; a da faceta do Suporte fica.
      added = added.filter(id => id === principalId || !(base?.volumeValidated ? suporteReservaAoPilar(target, input.targets, linhaDeCopy.lines, base, byId.get(id)!) : cabecaDoPedaco(byId.get(id)!)));
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
    if (porVolume && !pilarCabeca && principalId && principalId !== target.primaryId) {
      reasons.push(principalSubjectSwapReason(target, old, byId.get(principalId)!, input.ranking?.[target.id]));
    } else if (pilarCabeca && principalId && principalId !== target.primaryId) {
      const nova = byId.get(principalId)!;
      const nucleo = slugCoreWords(subjectSlugOf(target), target.signals.centralEntity).join(" + ");
      const mesmaBuscaDela = members.filter(id => id !== principalId && sameSearchKey(byId.get(id)?.keyword) === sameSearchKey(nova.keyword)).map(id => byId.get(id)!).filter(Boolean);
      reasons.push(`${PILLAR_HEAD_SWAP_LABEL}: “${nova.keyword}” (${nova.volume}) assume como principal do Pilar — é o termo-cabeça com volume que leva o núcleo do slug (${nucleo}) e a centralidade do Silo (entre as que levam o núcleo, a de cauda mais curta e mais volume; AGENTS.md §13)${mesmaBuscaDela.length ? `; ${mesmaBuscaDela.map(k => `“${k.keyword}” (${k.volume})`).join(", ")} é a mesma busca e fica como secundária` : ""}. “${old?.keyword ?? target.theme}” continua no artigo como o Assunto (âncora), e o título e o slug do plano ficam. Proposta: decisão sua na prévia (dono, 17/10: “Pilar troca, Suportes ficam”).`);
    } else if (principalId && principalId !== target.primaryId && pelaCopy.includes(principalId)) {
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
    // O Pilar de identidade sem termo-cabeça que leve o núcleo também forma com a principal de identidade (como antes).
    const formaOPrimeiro = target.kind === "subject" && !target.memberIds.length && Boolean(principalId) && principalId === target.primaryId && identidadeBruta && !old?.published;
    const identidadeFica = identidade || (pilarCabeca && principalId === target.primaryId);
    // 2026-10-17 · a principal de identidade fica com pouco ou nenhum volume; a linha diz por quê.
    if (identidadeFica && old && !old.volumeValidated && (target.kind === "subject" || target.post === "free") && (added.length || candidates.length || formaOPrimeiro)) reasons.push(identityPrincipalReason(target, old));
    if (pilarCabeca && principalId === target.primaryId) reasons.push(`${PILLAR_HEAD_SWAP_LABEL}: nenhuma busca com volume desta leitura leva o núcleo do slug (${slugCoreWords(subjectSlugOf(target), target.signals.centralEntity).join(" + ")}); a principal de identidade fica até aparecer o termo-cabeça.`);
    if (livreSemVolume && !porVolume && !pilarCabeca && pelaLinha && !pelaLinha.length && added.length) reasons.push(`Nenhuma candidata com volume mantém a intenção de “${old?.keyword ?? target.theme}” nem leva o núcleo do slug: a principal fica e o artigo só recebe reforço.`);
    for (const id of pelaCopy.filter(id => id !== principalId || principalId === target.primaryId)) reasons.push(`${COPY_LINE_LABEL}: ${copyReason(byId.get(id)!, daLinhaDeCopy(id)!.match, linha?.principalText ?? null)}`);
    if (desconhecido) reasons.push(PRINCIPAL_SUBJECT_UNKNOWN_REASON);
    if (porVolume && principalId === target.primaryId) reasons.push(volumeZeroWithoutCandidateReason(target, old));
    const mudou = added.length || principalId !== target.primaryId || formaOPrimeiro;
    /*
     * 2026-10-17 · "ADEQUADO" SÓ COM REFORÇO SUFICIENTE (amarelo: "Instalação de internet…" saiu "Já formado e adequado"
     * com 1 keyword só — a busca não tinha achado reforço). Com vaga e sem nenhuma entrada, a linha diz que não achou e
     * por quê; o status continua o de sempre (nada a gravar, ou o primeiro DNA só com a principal).
     */
    const ficaAdequado = Boolean(target.territoryRef) && !(mudou && principalId) && Boolean(old?.volumeValidated);
    const vagas = IMPROVEMENT_ARTICLE_MAX_KEYWORDS - new Set([...members, ...(principalId ? [principalId] : [])]).size;
    if (!added.length && principalId === target.primaryId && vagas > 0 && (ficaAdequado || formaOPrimeiro)) reasons.push(noReinforcementReason(linhaDeCopy.rejected.get(target.id) ?? [], byId));
    const lacuna = added.length && vagas > 0 ? entityGapReason(target, linhaDeCopy.lines.get(target.id), members, byId) : null;
    if (lacuna) reasons.push(lacuna);
    // 2026-10-17 (noite) · a que contradiz o Assunto é dita na prévia, uma frase por keyword.
    for (const item of linhaDeCopy.rejected.get(target.id) ?? []) {
      const k = byId.get(item.keywordId);
      if (k && item.motivo.startsWith("contradiz o Assunto")) reasons.push(`“${k.keyword}” (${k.volume}) fica fora: ${item.motivo}.`);
    }
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
  if (input.listReading === false) return enforcePageSubject(input.targets, enforceSubjectMembership(input.targets, enforceChosenPrincipals(input.targets, enforceDeclaredPrincipals(input.targets, proposals, byId), byId), byId), byId, observations);
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
  return enforcePageSubject(input.targets, enforceSubjectMembership(input.targets, enforceChosenPrincipals(input.targets, enforceDeclaredPrincipals(input.targets, proposals, byId), byId), byId), byId, observations);
}

/*
 * 2026-10-18 · A PÁGINA VIRA O ASSUNTO (SDD `sdd-assunto-pela-principal-e-volume-2026-10-18.md` §6.3-d/e/f/g; X12 e U12
 * SUBSTITUÍDOS em parte). Uma regra só, depois de TODAS as leituras (pares da SERP, linha de copy, IA, lista pelo código,
 * reserva do slug): com o Assunto declarado na página publicada,
 *   - trocada a principal (agora ou no modo antigo), a página sai das secundárias e fica como o `subject` do artigo
 *     (continua sendo a página: URL, slug e canonical não mudam) — a antiga não fica secundária;
 *   - a página que continua a principal com volume definido (volume baixo) é o Assunto E a principal: só reforço;
 *   - a secundária que contradiz o Assunto (público, preço do consumidor, restrição, localidade, grafia quebrada) sai do
 *     artigo e vai para "Keywords não agrupadas" (nunca some); a ampla de mesma intenção fica como contexto.
 * Tudo proposto na prévia; decisão do dono. O primeiro ArticleDNA do publicado nasce com a página entre as keywords.
 */
/*
 * 2026-10-19 · A SAÍDA POR INTENÇÃO SÓ PELA SERP (régua c da SDD 2026-10-18 §6.3-c: "não contradiz o DNA do Assunto —
 * … localidade e intenção pela SERP (4 lentes)"; C9; RF10: "a intenção que barra é a da SERP"). Caso real do verde
 * (19/10): "tráfego orgânico" (1.000), "oque é trafego organico" (590) e "tráfego pago e orgânico" (140) saíam de
 * "tráfego pago vs orgânico…" por "outra intenção (Comercial × Informativa)", sem parecer da SERP (volume 1.870 → 140).
 * Agora: a intenção que só diverge no rótulo do DNA não tira a secundária (ela fica, e a prévia diz que a SERP decide);
 * a que a SERP mostrou diferente tira — salvo com 3+ páginas em comum com a página nas 4 lentes (RF11: aí é aviso).
 */
export const INTENT_DNA_ONLY_STAYS = "fica: a intenção só diverge no rótulo do DNA e a SERP não decidiu a intenção das duas (quem tira por intenção é a SERP, régua c)";
function enforcePageSubject(targets: readonly ImprovementTarget[], proposals: ImprovementProposal[], byId: ReadonlyMap<string, ImprovementKeyword>, observations?: ReadonlyMap<string, ImprovementEvidence>): ImprovementProposal[] {
  targets.forEach((target, index) => {
    const p = proposals[index];
    const pagina = target.kind === "published" && target.articleExists !== false ? target.principalSubject?.keywordId ?? null : null;
    if (!pagina || !p.principalId || !target.territoryRef) return;
    let mudou = false;
    if (p.principalId !== pagina) {
      p.subjectKeywordId = pagina;
      if (p.memberIds.includes(pagina)) {
        p.memberIds = p.memberIds.filter(id => id !== pagina);
        if (target.memberIds.includes(pagina) && !p.removeIds.includes(pagina)) p.removeIds = [...p.removeIds, pagina];
      }
      const nomeDaPagina = byId.get(pagina)?.keyword ?? target.theme;
      p.reasons = p.reasons.filter(reason => !(reason.includes(`“${nomeDaPagina}”`) && /fica como secundária/.test(reason)) && !/^Principal mais ampla, com volume: .* a antiga fica como secundária\.$/.test(reason));
      p.reasons.push(PAGE_BECOMES_SUBJECT_REASON);
      mudou = true;
    } else {
      const estado = target.principalSubject?.volumeState;
      if (estado === "low" || estado === "with_volume") {
        p.subjectKeywordId = pagina;
        p.reasons.push("Assunto pela principal: a página é o Assunto do artigo e continua a principal (volume definido); o Arquiteto só acrescenta reforço.");
        mudou = (target.currentSubjectKeywordId ?? null) !== pagina;
      } else if (estado === "zero") {
        // 2026-10-19 · o Assunto como foco: a página (volume 0) é o Assunto e a principal, com a vaga da principal com volume aberta.
        p.subjectKeywordId = pagina;
        mudou = (target.currentSubjectKeywordId ?? null) !== pagina;
      }
    }
    for (const id of [...p.memberIds]) {
      if (id === p.principalId || id === pagina) continue;
      const k = byId.get(id);
      const detalhe = k ? principalSubjectConflictDetail(target, k) : null;
      if (!k || !detalhe) continue;
      const conflito = detalhe.reason;
      if (detalhe.kind === "intent_dna") {
        p.reasons.push(`“${k.keyword}” ${INTENT_DNA_ONLY_STAYS} (${conflito}).`);
        continue;
      }
      const par = observations?.get(`${target.id}:${id}`);
      if (detalhe.kind === "intent_serp" && par?.complete && par.sharedPages >= 3) {
        p.reasons.push(`Aviso: “${k.keyword}” — ${conflito}, mas ${par.sharedPages} páginas do top 10 coincidem com a página nas 4 lentes; fica (quem diz o assunto são as páginas).`);
        continue;
      }
      p.memberIds = p.memberIds.filter(item => item !== id);
      p.addIds = p.addIds.filter(item => item !== id);
      p.transfers = p.transfers.filter(item => item !== id);
      if (target.memberIds.includes(id) && !p.removeIds.includes(id)) p.removeIds = [...p.removeIds, id];
      p.reasons.push(`“${k.keyword}” sai do artigo (vai para “Keywords não agrupadas”, nunca some): ${conflito}. Decisão sua na prévia.`);
      mudou = true;
    }
    if (mudou && (p.subjectKeywordId ?? null) !== (target.currentSubjectKeywordId ?? null) || p.removeIds.length) {
      p.status = "ready";
      p.evidenceBasis = p.evidenceBasis ?? "editorial_and_candidate_serp";
    }
    p.reasons = [...new Set(p.reasons)];
  });
  return proposals;
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
  const atual = improvementCurrentPrincipal(target, byId);
  // 2026-10-18 · o volume 0 da página com Assunto libera a principal (mesmo "Travado ao slug"), e a candidata segue a régua c.
  const porVolume = principalSwapByVolume(target, atual ?? null);
  if (target.kind !== "published" || (target.post !== "free" && !porVolume) || !target.territoryRef) return null;
  if (atual?.volumeValidated && (atual.volume ?? 0) > 0 && !porVolume) return null;
  // 2026-10-17 · Principal de identidade (o slug publicado foi feito dela): fica; a reserva não troca. (2026-10-18: só com volume definido ou desconhecido.)
  if (!porVolume && (identityHoldsPrincipal(target, atual) || (target.principalSubject && principalSwapStanding(target, atual ?? null) === "unknown"))) return null;
  const doSlug = aliased(slugWords(targetSubjectText(target)), CORE_ALIASES);
  const nucleo = aliased(slugCoreWords(targetSubjectText(target)), CORE_ALIASES);
  const afinidade = (k: ImprovementKeyword) => {
    const palavras = aliased(slugWords(k.keyword), CORE_ALIASES);
    const comuns = [...palavras].filter(word => doSlug.has(word)).length;
    return { nucleo: nucleo.size > 0 && [...nucleo].every(word => palavras.has(word)) ? 1 : 0, comuns, precisao: palavras.size ? comuns / palavras.size : 0 };
  };
  const melhor = target.memberIds
    .map(id => byId.get(id))
    .filter((k): k is ImprovementKeyword => Boolean(k) && k!.id !== target.primaryId && !k!.published && k!.volumeValidated && (k!.volume ?? 0) > 0 && (!k!.ownerId || k!.ownerId === target.id) && !contradicts(k!.id) && (!porVolume || principalFitsSubject(target, k!) === null))
    .map(k => ({ k, a: afinidade(k) }))
    .filter(item => item.a.comuns > 0)
    .sort((x, y) => y.a.nucleo - x.a.nucleo || y.a.comuns - x.a.comuns || y.a.precisao - x.a.precisao || (y.k.volume ?? 0) - (x.k.volume ?? 0))[0]?.k;
  if (!melhor) return null;
  // 2026-10-18 · com o Assunto na página, a página sai das secundárias e fica como o Assunto (SDD do Assunto pela principal §6.3-d).
  const pagina = target.principalSubject?.keywordId ?? null;
  const viraAssunto = Boolean(pagina && pagina !== melhor.id && target.memberIds.includes(pagina));
  return {
    targetId: target.id, kind: target.kind, theme: target.theme,
    currentPrimaryId: target.primaryId, principalId: melhor.id, memberIds: viraAssunto ? target.memberIds.filter(id => id !== pagina) : [...target.memberIds],
    addIds: [], removeIds: viraAssunto ? [pagina!] : [], transfers: [], angle: angleOf(melhor), exclusions: [],
    ...(pagina && pagina !== melhor.id ? { subjectKeywordId: pagina } : {}),
    reasons: [
      "URL, slug, canonical e Silo publicados preservados.",
      porVolume ? principalSubjectSwapReason(target, atual, melhor, ranking) : `Principal sem volume com Posto Livre: “${melhor.keyword}” (${melhor.volume}), já no artigo e a mais próxima do slug em sentido e palavras, assume; “${atual?.keyword ?? target.theme}” fica como secundária. Nada entra nem sai.`,
      ...(viraAssunto ? [PAGE_BECOMES_SUBJECT_REASON] : []),
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
    if (collisionKey(ta) !== collisionKey(tb) && !(knownEqual(ta.signals.centralEntity, tb.signals.centralEntity) && knownEqual(ta.signals.perceivedProblem, tb.signals.perceivedProblem) && sameIntent(ta.signals.intent, tb.signals.intent))) continue;
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
