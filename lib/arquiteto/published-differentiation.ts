/**
 * DIFERENCIAR PUBLICADOS QUE DISPUTAM O MESMO ASSUNTO — detecção e ângulos.
 *
 * SDD aprovada: docs/04-arquiteto/sdd-diferenciacao-publicados-canibalizados-2026-09-27.md
 * (Q1 a IA propõe ângulos com a menor autoridade; Q2 teto de US$ 0,50 por
 * grupo e uma confirmação por rodada; Q3 página que ranqueia não troca a
 * principal). Regras de base: regras-serp-e-assuntos-2026-09-26 A, D2.1,
 * D2.2, D2.3 e D6.
 *
 * Este arquivo faz as duas etapas GRÁTIS:
 *
 *   3.1 Detectar  grupos de publicados da mesma marca que dividem a SERP, pelo
 *                 cache já pago. A medida é a MESMA de "mesmo assunto"
 *                 (`serp-subject-overlap.ts`): Forte = 3 ou mais páginas em
 *                 comum no top 10 (união das 4 lentes). O grupo é o componente
 *                 conexo dos pares Fortes; os pares Prováveis (2 páginas,
 *                 confirmadas pelas palavras — a régua da troca, D2.1) ficam
 *                 anotados, sem formar grupo.
 *   3.2 Ângulos   o que separa os slugs (autoridade 1), o DNA (2), e a IA
 *                 (4, a menor, opcional). O que o Google associa à URL
 *                 (`ranked_keywords`, 3) só chega na rodada paga.
 *
 * Nada aqui apaga, funde, redireciona, muda URL, slug, canonical ou marca.
 * Domínio puro: sem React, sem banco, sem rede, sem provider.
 */
import { z } from "zod";
import type { ArticleFormationKeyword } from "./article-formation.ts";
import { MAX_ARTICLE_KEYWORDS } from "./article-formation.ts";
import type { PublishedPrimaryPost } from "./published-primary-swap.ts";
import { PUBLISHED_PRIMARY_POST_LABELS } from "./published-primary-swap.ts";
import { measureAnchorConvergence } from "./serp-subject-convergence.ts";
import {
  SERP_SUBJECT_CANONICAL_LENS_LABEL,
  SERP_SUBJECT_THRESHOLDS,
  normalizeSerpDomain,
  normalizeSerpPageUrl,
  type KeywordSerpFootprint,
  type SerpSubjectIndex,
} from "./serp-subject-overlap.ts";

/* ------------------------------ persistência ------------------------------ */

/**
 * A proposta mora em `editorial_workflow_items` (coluna `subject_type` é texto
 * livre desde a 0027: nenhuma migration). O estágio do Arquiteto, no banco, é
 * `architect` — o CHECK da coluna `stage` não aceita "arquiteto".
 */
export const DIFFERENTIATION_SUBJECT_TYPE = "differentiation_proposal" as const;
export const DIFFERENTIATION_STAGE = "architect" as const;
export const DIFFERENTIATION_CONTRACT_VERSION = "published-differentiation-v1" as const;

/**
 * Estados da linha da proposta (`state` da tabela). A prévia vale UMA rodada:
 * `planned` → `running` (reservada pela trava de `lock_version` ANTES de
 * pagar) → `proposed` → `applied`/`partially_applied`. Rodar de novo exige uma
 * prévia nova, pedida na tela ("Planejar nova rodada"); a avaliação anterior
 * vai para o histórico da proposta, nunca some.
 */
export const DIFFERENTIATION_ROW_STATES = ["planned", "running", "proposed", "applied", "partially_applied", "kept"] as const;
export type DifferentiationRowState = (typeof DIFFERENTIATION_ROW_STATES)[number];

/** Rodada reservada há mais que isto sem terminar é tida como interrompida. */
export const DIFFERENTIATION_RUNNING_STALE_MS = 30 * 60 * 1000;

/** O resumo da proposta que a detecção devolve por grupo (colunas estreitas). */
export type DifferentiationProposalSummary = {
  state: DifferentiationRowState;
  /** Há avaliação paga gravada (a tela a reabre sem cobrar). */
  hasRun: boolean;
  executedAt: string | null;
  runningSince: string | null;
};

/* --------------------------------- entrada -------------------------------- */

/** Um publicado da marca, como o servidor o leu (Vínculo, DNA e ArticleDNA). */
export type DifferentiationPage = {
  keywordId: string;
  keyword: string;
  url: string | null;
  canonical: string | null;
  /** O caminho publicado (sem domínio). Nunca muda. */
  slug: string | null;
  post: PublishedPrimaryPost;
  volume: number | null;
  /** Volume medido pelo Google Ads (não é estimativa do Labs). */
  volumeValidated: boolean;
  intent: string | null;
  /** Entidade central e problema do KeywordDNA, quando declarados. */
  entity: string | null;
  problem: string | null;
  /** O ArticleDNA do artigo publicado, quando existe. */
  articleId: string | null;
  /** Keywords do artigo hoje (principal + apoio). Sem ArticleDNA: nulo. */
  articleKeywordCount: number | null;
};

/* -------------------------------- hash leve -------------------------------- */

/**
 * Impressão digital síncrona (FNV-1a de 64 bits em duas metades). Serve para
 * identificar o grupo e a SERP que o formou — não é segurança. O hash que
 * autoriza pagamento é o `contentHash` (SHA-256) do plano.
 */
export function differentiationFingerprint(value: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let indice = 0; indice < value.length; indice += 1) {
    const codigo = value.charCodeAt(indice);
    a = Math.imul(a ^ codigo, 0x01000193) >>> 0;
    b = Math.imul(b ^ codigo, 0x5bd1e995) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

/* ------------------------------- palavras ------------------------------- */

/** Palavras que não separam um slug de outro. "sem" fica: "sem anúncios" é ângulo. */
const PALAVRAS_VAZIAS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "para", "pra", "com", "em", "no", "na", "nos", "nas",
  "e", "ou", "um", "uma", "uns", "umas", "como", "que", "por", "pelo", "pela", "sua", "seu", "suas", "seus",
  "ao", "aos", "mais", "voce", "sobre", "qual", "quais", "the",
]);

const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Singular leve: "clínicas" e "clínica" são a mesma palavra para o ângulo. */
function raiz(palavra: string): string {
  if (palavra.length > 4 && palavra.endsWith("oes")) return `${palavra.slice(0, -3)}ao`;
  if (palavra.length > 4 && palavra.endsWith("s") && !palavra.endsWith("ss")) return palavra.slice(0, -1);
  return palavra;
}

type Palavra = { original: string; token: string | null };

/** As palavras de uma frase, com a forma original (acentos) e o token comparável. */
function palavrasDe(frase: string): Palavra[] {
  return frase
    .replace(/[-_/]+/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(original => {
      const normal = semAcento(original);
      return { original, token: PALAVRAS_VAZIAS.has(normal) ? null : raiz(normal) };
    });
}

/** Tokens comparáveis, sem palavras vazias, sem repetição, na ordem. */
export function differentiationTokens(frase: string): string[] {
  const vistos = new Set<string>();
  const tokens: string[] = [];
  for (const palavra of palavrasDe(frase)) {
    if (!palavra.token || vistos.has(palavra.token)) continue;
    vistos.add(palavra.token);
    tokens.push(palavra.token);
  }
  return tokens;
}

/** O último segmento do caminho publicado, em palavras. Sem URL, a keyword. */
function textoDoSlug(page: Pick<DifferentiationPage, "slug" | "url" | "keyword">): string {
  const caminho = page.slug || (() => {
    try { return page.url ? new URL(page.url).pathname : null; } catch { return null; }
  })();
  const ultimo = caminho ? caminho.replace(/\/+$/, "").split("/").filter(Boolean).pop() : null;
  return ultimo ? decodeURIComponentSafe(ultimo) : page.keyword;
}

function decodeURIComponentSafe(valor: string): string {
  try { return decodeURIComponent(valor); } catch { return valor; }
}

/**
 * A ENTIDADE CENTRAL DO SLUG — o que a keyword nova precisa dividir para
 * "caber" no endereço fixo (SDD 3.3).
 *
 * Ordem: a entidade do KeywordDNA; senão, o que vem depois de "para" na
 * keyword, até a próxima preposição ("clínica de estética" em "como atrair
 * pacientes para clínica de estética sem anúncios"); senão, os tokens que
 * todo o grupo divide.
 */
export function slugEntityTokens(page: Pick<DifferentiationPage, "entity" | "keyword">, groupShared: readonly string[] = []): string[] {
  const doDna = page.entity ? differentiationTokens(page.entity) : [];
  if (doDna.length) return doDna;
  const palavras = palavrasDe(page.keyword);
  const inicio = palavras.findIndex(palavra => ["para", "pra"].includes(semAcento(palavra.original)));
  if (inicio >= 0) {
    const tokens: string[] = [];
    for (const palavra of palavras.slice(inicio + 1)) {
      const normal = semAcento(palavra.original);
      if (["sem", "com", "e", "ou", "em"].includes(normal)) break;
      if (palavra.token && !tokens.includes(palavra.token)) tokens.push(palavra.token);
    }
    if (tokens.length) return tokens;
  }
  return groupShared.length ? [...groupShared] : differentiationTokens(page.keyword);
}

/**
 * A keyword cabe no slug pela entidade: com várias palavras, a última (o
 * núcleo que especifica: "estética" em "clínica de estética", "odontológico"
 * em "consultório odontológico"). O dono deu o exemplo: "clínica de estética"
 * ou "estética".
 *
 * Entidade de UMA palavra ("clínica", "consultório") é genérica demais: com
 * `pageTokens` (as palavras da keyword publicada), a candidata precisa trazer
 * também mais uma palavra da página — "clínica veterinária" não cabe em "como
 * atrair pacientes para clínica"; "pacientes para clínica odontológica" cabe.
 */
export function fitsSlugEntity(candidate: string, entityTokens: readonly string[], pageTokens?: readonly string[] | null): boolean {
  if (!entityTokens.length) return false;
  const tokens = new Set(differentiationTokens(candidate));
  const nucleo = entityTokens[entityTokens.length - 1];
  if (!tokens.has(nucleo)) return false;
  if (entityTokens.length > 1 || !pageTokens?.length) return true;
  return pageTokens.some(token => token !== nucleo && tokens.has(token));
}

/* ------------------------------- ranqueamento ------------------------------ */

export type DifferentiationRankingHit = { lens: string; position: number | null; url: string };

/**
 * "Página que ranqueia" (Q3): a URL do próprio publicado no top 10 de alguma
 * lente, com a posição. Sem URL conhecida, qualquer página do site da marca
 * conta (conservador: a troca da principal fica bloqueada). A lente canônica
 * só guarda domínios: o site ali aparece "sem posição lida" e também segura a
 * troca, com o motivo.
 */
export type DifferentiationRanking = {
  ranks: boolean;
  /** O site aparece só nos domínios da lente canônica (posição não lida). */
  possiblyRanks: boolean;
  bestPosition: number | null;
  hits: DifferentiationRankingHit[];
  /** Outras páginas do mesmo site no top 10 (não contam como "esta página"). */
  otherSitePages: DifferentiationRankingHit[];
  /** A frase curta para a tela. */
  label: string;
};

export function readPageRanking(
  page: Pick<DifferentiationPage, "url" | "canonical">,
  footprint: KeywordSerpFootprint | null | undefined,
  brandHosts: readonly string[] = [],
): DifferentiationRanking {
  const propria = new Set([normalizeSerpPageUrl(page.url), normalizeSerpPageUrl(page.canonical)].filter((item): item is string => Boolean(item)));
  const hosts = new Set([
    ...brandHosts.map(normalizeSerpDomain),
    ...[page.url, page.canonical].map(url => normalizeSerpPageUrl(url)?.split("/")[0] ?? null),
  ].filter((item): item is string => Boolean(item)));
  const hits: DifferentiationRankingHit[] = [];
  const outras: DifferentiationRankingHit[] = [];
  let canonicaSoDominio = false;
  for (const leitura of footprint?.lenses || []) {
    (leitura.urls || []).forEach((url, indice) => {
      const normal = normalizeSerpPageUrl(url);
      if (!normal) return;
      const host = normal.split("/")[0];
      if (propria.has(normal)) hits.push({ lens: leitura.lens, position: indice + 1, url });
      else if (hosts.has(host)) outras.push({ lens: leitura.lens, position: indice + 1, url });
    });
    if (leitura.lens === SERP_SUBJECT_CANONICAL_LENS_LABEL && !(leitura.urls || []).length) {
      if ((leitura.domains || []).some(dominio => { const normal = normalizeSerpDomain(dominio); return Boolean(normal && hosts.has(normal)); })) canonicaSoDominio = true;
    }
  }
  // Sem a URL do publicado, a página do site no top 10 conta como ele.
  const semUrl = propria.size === 0;
  const efetivos = semUrl ? outras : hits;
  const ranks = efetivos.length > 0;
  const possiblyRanks = !ranks && canonicaSoDominio;
  const bestPosition = efetivos.reduce<number | null>((melhor, hit) => hit.position !== null && (melhor === null || hit.position < melhor) ? hit.position : melhor, null);
  const lentes = [...new Set(efetivos.map(hit => hit.lens))];
  const label = ranks
    ? `Ranqueia: ${bestPosition}º no top 10 (${lentes.join(", ")}).`
    : possiblyRanks
      ? `O site aparece no top 10 do ${SERP_SUBJECT_CANONICAL_LENS_LABEL}, posição não lida.`
      : "Não aparece no top 10.";
  return { ranks, possiblyRanks, bestPosition, hits: semUrl ? outras : hits, otherSitePages: semUrl ? [] : outras, label };
}

/** Página que ranqueia (ou pode ranquear) não troca a principal (Q3). */
export const rankingBlocksSwap = (ranking: Pick<DifferentiationRanking, "ranks" | "possiblyRanks">) => ranking.ranks || ranking.possiblyRanks;

/* --------------------------------- detecção --------------------------------- */

export type DifferentiationPairLevel = "strong" | "probable";

export type DifferentiationPair = {
  leftKeywordId: string;
  rightKeywordId: string;
  level: DifferentiationPairLevel;
  sharedPageCount: number;
  sharedPages: string[];
  /** O outro lado não está no grupo (Provável anotado com publicado de fora). */
  outsideGroup: boolean;
  reason: string;
};

export type DifferentiationGroupMember = {
  page: DifferentiationPage;
  ranking: DifferentiationRanking;
  /** Páginas distintas no top 10 (união das lentes). */
  pageCount: number;
  lensesWithPages: number;
};

export type DifferentiationGroup = {
  groupId: string;
  members: DifferentiationGroupMember[];
  strongPairs: DifferentiationPair[];
  probablePairs: DifferentiationPair[];
  maxSharedPages: number;
  anyRanking: boolean;
  /** Muda quando a SERP do grupo muda: "Manter como está" vale até ela mudar. */
  serpFingerprint: string;
  /** O dono escolheu "Manter como está" para esta mesma SERP. */
  kept: boolean;
  summary: string;
};

export type DifferentiationDetection = {
  groups: DifferentiationGroup[];
  /** Publicados sem páginas da SERP no cache: não dá para medir (A7). */
  withoutSerp: Array<{ keywordId: string; keyword: string }>;
  pagesMeasured: number;
  pairsMeasured: number;
};

export type DifferentiationKeptDecision = { groupId: string; serpFingerprint: string };

/** A linha do publicado na medida de convergência (palavras de apoio, D2.1). */
export function formationKeywordOfPage(page: DifferentiationPage): ArticleFormationKeyword {
  return {
    keywordId: page.keywordId,
    keyword: page.keyword,
    intent: page.intent,
    volume: page.volume,
    kgr: null,
    entity: page.entity,
    problem: page.problem,
    isPublished: true,
  };
}

const paginasDe = (footprint: KeywordSerpFootprint | null) => {
  const paginas = new Set<string>();
  let lentes = 0;
  for (const leitura of footprint?.lenses || []) {
    const urls = (leitura.urls || []).map(normalizeSerpPageUrl).filter((item): item is string => Boolean(item));
    if (urls.length) lentes += 1;
    for (const url of urls) paginas.add(url);
  }
  return { paginas: paginas.size, lentes };
};

/** O id do grupo: os publicados, em ordem. Muda se o grupo muda. */
export function differentiationGroupId(keywordIds: readonly string[]): string {
  return `dg-${differentiationFingerprint([...keywordIds].sort().join("|"))}`;
}

/**
 * Monta os grupos de publicados que disputam o mesmo assunto, só com o cache.
 *
 * `kept`: as decisões "Manter como está" gravadas. Um grupo mantido volta
 * marcado (`kept: true`) — a tela o tira do painel — até a SERP dele mudar.
 */
export function detectPublishedCannibalization(input: {
  pages: readonly DifferentiationPage[];
  serp: SerpSubjectIndex;
  brandHosts?: readonly string[];
  kept?: readonly DifferentiationKeptDecision[];
}): DifferentiationDetection {
  const vistos = new Set<string>();
  const pages = input.pages.filter(page => {
    if (vistos.has(page.keywordId)) return false;
    vistos.add(page.keywordId);
    return true;
  });
  const comSerp = pages.filter(page => input.serp.hasPages(page.keywordId));
  const withoutSerp = pages.filter(page => !input.serp.hasPages(page.keywordId)).map(page => ({ keywordId: page.keywordId, keyword: page.keyword }));
  const porId = new Map(pages.map(page => [page.keywordId, page]));

  const fortes: DifferentiationPair[] = [];
  const provaveis: DifferentiationPair[] = [];
  let pairsMeasured = 0;
  for (let i = 0; i < comSerp.length; i += 1) {
    for (let j = i + 1; j < comSerp.length; j += 1) {
      const a = comSerp[i];
      const b = comSerp[j];
      const medida = input.serp.overlap(a.keywordId, b.keywordId);
      pairsMeasured += 1;
      if (medida.strength === "strong") {
        fortes.push({ leftKeywordId: a.keywordId, rightKeywordId: b.keywordId, level: "strong", sharedPageCount: medida.sharedPageCount, sharedPages: medida.sharedPages, outsideGroup: false, reason: `${medida.sharedPageCount} páginas em comum no top 10` });
      } else if (medida.strength === "support") {
        // A régua da troca (D2.1): 2 páginas só contam com as palavras.
        const convergencia = measureAnchorConvergence(formationKeywordOfPage(a), formationKeywordOfPage(b), { serp: input.serp });
        if (convergencia.basis === "serp_and_words") {
          provaveis.push({ leftKeywordId: a.keywordId, rightKeywordId: b.keywordId, level: "probable", sharedPageCount: medida.sharedPageCount, sharedPages: medida.sharedPages, outsideGroup: false, reason: `${medida.sharedPageCount} páginas e palavras em comum no top 10` });
        }
      }
    }
  }

  // Componentes conexos dos pares Fortes.
  const pai = new Map<string, string>();
  const achar = (id: string): string => {
    let raizId = id;
    while (pai.get(raizId) && pai.get(raizId) !== raizId) raizId = pai.get(raizId)!;
    pai.set(id, raizId);
    return raizId;
  };
  for (const par of fortes) {
    for (const id of [par.leftKeywordId, par.rightKeywordId]) if (!pai.has(id)) pai.set(id, id);
    const ra = achar(par.leftKeywordId);
    const rb = achar(par.rightKeywordId);
    if (ra !== rb) pai.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
  const componentes = new Map<string, string[]>();
  for (const id of pai.keys()) {
    const raizId = achar(id);
    componentes.set(raizId, [...(componentes.get(raizId) || []), id]);
  }

  const mantidos = new Map((input.kept || []).map(item => [item.groupId, item.serpFingerprint]));
  const groups: DifferentiationGroup[] = [];
  for (const ids of componentes.values()) {
    const membrosIds = new Set(ids);
    const ordem = pages.filter(page => membrosIds.has(page.keywordId)).map(page => page.keywordId);
    const groupId = differentiationGroupId(ordem);
    const members: DifferentiationGroupMember[] = ordem.map(id => {
      const page = porId.get(id)!;
      const pegada = input.serp.footprint(id);
      const medidas = paginasDe(pegada);
      return { page, ranking: readPageRanking(page, pegada, input.brandHosts || []), pageCount: medidas.paginas, lensesWithPages: medidas.lentes };
    });
    const strongPairs = fortes.filter(par => membrosIds.has(par.leftKeywordId) && membrosIds.has(par.rightKeywordId))
      .sort((left, right) => right.sharedPageCount - left.sharedPageCount);
    const probablePairs = provaveis
      .filter(par => membrosIds.has(par.leftKeywordId) || membrosIds.has(par.rightKeywordId))
      .map(par => ({ ...par, outsideGroup: !(membrosIds.has(par.leftKeywordId) && membrosIds.has(par.rightKeywordId)) }))
      .sort((left, right) => right.sharedPageCount - left.sharedPageCount);
    const serpFingerprint = differentiationFingerprint(JSON.stringify(strongPairs.map(par => [par.leftKeywordId, par.rightKeywordId, par.sharedPages])));
    const maxSharedPages = strongPairs.reduce((maior, par) => Math.max(maior, par.sharedPageCount), 0);
    const anyRanking = members.some(member => member.ranking.ranks || member.ranking.possiblyRanks);
    const nomes = members.map(member => `"${member.page.keyword}"`);
    groups.push({
      groupId,
      members,
      strongPairs,
      probablePairs,
      maxSharedPages,
      anyRanking,
      serpFingerprint,
      kept: mantidos.get(groupId) === serpFingerprint,
      summary: `${members.length} publicados disputam o mesmo assunto no Google (até ${maxSharedPages} páginas em comum): ${nomes.join(", ")}.`,
    });
  }
  groups.sort((left, right) => right.maxSharedPages - left.maxSharedPages || right.members.length - left.members.length || left.groupId.localeCompare(right.groupId));
  return { groups, withoutSerp, pagesMeasured: comSerp.length, pairsMeasured };
}

/* ---------------------------------- ângulos ---------------------------------- */

export type DifferentiationAngleSource = "slug" | "dna" | "ranked" | "ai";

export const DIFFERENTIATION_ANGLE_SOURCE_LABELS: Readonly<Record<DifferentiationAngleSource, string>> = Object.freeze({
  slug: "o que já separa os slugs",
  dna: "o DNA da keyword",
  ranked: "o que o Google já associa à URL",
  ai: "sugestão da IA (menor autoridade)",
});

export type DifferentiationSeed = { phrase: string; source: DifferentiationAngleSource };

export type DifferentiationAngle = {
  keywordId: string;
  /** O nome do ângulo: as palavras que só esta página tem ("captar clientes"). */
  label: string;
  distinctTokens: string[];
  /** A entidade que a keyword nova precisa dividir para caber no slug. */
  entityTokens: string[];
  /** As palavras que o grupo inteiro divide (o que NÃO separa). */
  sharedTokens: string[];
  /**
   * Até 5, na ordem de autoridade. Plano v2 (2026-09-28): `ideasSeed` e
   * `relatedSeed` vão ao Google Ads como semente frase, e `ideasSeed` também
   * com a URL da página. No plano v1 iam ao `keyword_ideas` e ao
   * `related_keywords` do Labs.
   */
  seeds: DifferentiationSeed[];
  ideasSeed: string;
  relatedSeed: string;
  /** Ângulo sugerido pela IA, quando houve. Nunca decide sozinho. */
  aiLabel: string | null;
  sources: DifferentiationAngleSource[];
  note: string;
};

/** A proposta da IA, já validada contra o grupo. */
export type DifferentiationAiAngle = { keywordId: string; angle: string; seeds: string[] };

export const DIFFERENTIATION_AI_MAX_SEEDS = 5;
export const DIFFERENTIATION_AI_MIN_SEEDS = 3;

/** O formato que a IA devolve. `.strict()`: campo inventado derruba a resposta. */
export const DifferentiationAiResponseSchema = z.object({
  angles: z.array(z.object({
    keywordId: z.string().min(1).max(80),
    angle: z.string().trim().min(2).max(120),
    seeds: z.array(z.string().trim().min(2).max(80)).min(1).max(8),
  }).strict()).max(12),
}).strict();

export type DifferentiationAiRejection = { keywordId: string | null; reason: string };

/**
 * Confere a resposta da IA: id inventado é recusado; sementes repetidas, iguais
 * à keyword de uma irmã ou fora do tamanho saem; fica entre 3 e 5. A IA é a
 * autoridade mais baixa (A2): nada dela vale sem volume e sem SERP.
 */
export function validateDifferentiationAiAngles(raw: unknown, group: Pick<DifferentiationGroup, "members">): { accepted: DifferentiationAiAngle[]; rejected: DifferentiationAiRejection[] } {
  const parsed = DifferentiationAiResponseSchema.safeParse(raw);
  if (!parsed.success) return { accepted: [], rejected: [{ keywordId: null, reason: "A resposta da IA não tem o formato pedido: ignorada." }] };
  const membros = new Map(group.members.map(member => [member.page.keywordId, member.page]));
  const keywordsDoGrupo = new Set(group.members.map(member => semAcento(member.page.keyword).trim()));
  const accepted: DifferentiationAiAngle[] = [];
  const rejected: DifferentiationAiRejection[] = [];
  const usados = new Set<string>();
  for (const item of parsed.data.angles) {
    if (!membros.has(item.keywordId)) { rejected.push({ keywordId: item.keywordId, reason: "Id que não é de um publicado do grupo: recusado." }); continue; }
    if (usados.has(item.keywordId)) { rejected.push({ keywordId: item.keywordId, reason: "Segundo ângulo para a mesma página: vale o primeiro." }); continue; }
    const vistas = new Set<string>();
    const seeds = item.seeds
      .map(seed => seed.replace(/\s+/g, " ").trim())
      .filter(seed => {
        const normal = semAcento(seed);
        if (vistas.has(normal) || keywordsDoGrupo.has(normal)) return false;
        vistas.add(normal);
        return true;
      })
      .slice(0, DIFFERENTIATION_AI_MAX_SEEDS);
    if (seeds.length < DIFFERENTIATION_AI_MIN_SEEDS) { rejected.push({ keywordId: item.keywordId, reason: `A IA deu menos de ${DIFFERENTIATION_AI_MIN_SEEDS} sementes úteis: ignorada.` }); continue; }
    usados.add(item.keywordId);
    accepted.push({ keywordId: item.keywordId, angle: item.angle.replace(/\s+/g, " ").trim(), seeds });
  }
  return { accepted, rejected };
}

export const DIFFERENTIATION_AI_SYSTEM_PROMPT = [
  "Você é um estrategista de SEO em português do Brasil.",
  "Dois ou mais artigos publicados do mesmo site disputam o mesmo assunto no Google.",
  "Para cada artigo, proponha UM ângulo diferente dos outros e de 3 a 5 buscas-semente que levem a esse ângulo.",
  "Regras: o endereço (slug) não muda, então o ângulo precisa caber na entidade central do slug; os ângulos não podem se sobrepor;",
  "use buscas reais e naturais em português do Brasil; considere intenção de busca (BERT), LSI/PNL, E-E-A-T e YMYL;",
  "não invente ids: use exatamente o keywordId recebido; não repita a keyword atual de nenhum artigo.",
  "Sua proposta é a autoridade mais baixa: volume e SERP decidem depois.",
  "Responda só JSON no formato {\"angles\":[{\"keywordId\":\"...\",\"angle\":\"...\",\"seeds\":[\"...\"]}]}.",
].join(" ");

/** O pedido à IA: só o que ela precisa, sem dado de cliente além das keywords. */
export function buildDifferentiationAiPrompt(group: Pick<DifferentiationGroup, "members">, angles: readonly Pick<DifferentiationAngle, "keywordId" | "label" | "entityTokens">[]): string {
  const porId = new Map(angles.map(angle => [angle.keywordId, angle]));
  return JSON.stringify({
    tarefa: "Diferenciar artigos publicados que disputam o mesmo assunto no Google.",
    artigos: group.members.map(member => ({
      keywordId: member.page.keywordId,
      keywordAtual: member.page.keyword,
      slug: textoDoSlug(member.page),
      entidadeDoSlug: porId.get(member.page.keywordId)?.entityTokens.join(" ") || null,
      oQueJaSepara: porId.get(member.page.keywordId)?.label || null,
      problemaNoDna: member.page.problem,
    })),
  });
}

/** Junta as palavras originais cujo token está na lista, na ordem da frase. */
function frasePorTokens(frase: string, tokens: ReadonlySet<string>): string {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const palavra of palavrasDe(frase)) {
    if (!palavra.token || !tokens.has(palavra.token) || vistos.has(palavra.token)) continue;
    vistos.add(palavra.token);
    saida.push(palavra.original.toLowerCase());
  }
  return saida.join(" ");
}

/**
 * Os ângulos do grupo, na ordem de autoridade: slug, DNA e, por último, a IA.
 *
 * A semente do `keyword_ideas` é o ângulo com a entidade ("captar clientes
 * estética"); a do `related_keywords` é a primeira semente da IA ou, sem IA,
 * a própria keyword publicada (as pesquisas relacionadas do Google precisam de
 * uma busca real).
 */
export function proposeDifferentiationAngles(input: { group: Pick<DifferentiationGroup, "members">; ai?: readonly DifferentiationAiAngle[] | null }): DifferentiationAngle[] {
  const membros = input.group.members.map(member => member.page);
  const tokensPorPagina = new Map(membros.map(page => [page.keywordId, differentiationTokens(`${textoDoSlug(page)} ${page.keyword}`)]));
  const todos = membros.map(page => new Set(tokensPorPagina.get(page.keywordId)));
  const shared = [...(todos[0] || new Set<string>())].filter(token => todos.every(conjunto => conjunto.has(token)));
  const ia = new Map((input.ai || []).map(item => [item.keywordId, item]));
  return membros.map(page => {
    const proprios = tokensPorPagina.get(page.keywordId) || [];
    const irmas = new Set(membros.filter(outro => outro.keywordId !== page.keywordId).flatMap(outro => tokensPorPagina.get(outro.keywordId) || []));
    const distinctTokens = proprios.filter(token => !irmas.has(token));
    const entityTokens = slugEntityTokens(page, shared);
    const distintos = new Set(distinctTokens);
    const doSlug = frasePorTokens(`${page.keyword} ${textoDoSlug(page)}`, distintos);
    const label = doSlug || "visão geral do tema (sem palavra própria no slug)";
    // A semente paga leva o ângulo COM o tema da página: as palavras da keyword
    // publicada (sem as vazias) e as que só o slug tem ("checklist plano
    // marketing clínica estética", "atrair pacientes consultório
    // odontológico"). Sozinho, "odontológico" ou "clínica" traria ideias fora
    // do slug; o que o grupo inteiro divide é pouco quando uma irmã é curta.
    const ideasSeed = doSlug
      ? frasePorTokens(`${page.keyword} ${textoDoSlug(page)}`, new Set([...differentiationTokens(page.keyword), ...distinctTokens]))
      : page.keyword;
    const sugestao = ia.get(page.keywordId) || null;
    const relatedSeed = sugestao?.seeds[0] || page.keyword;
    const seeds: DifferentiationSeed[] = [{ phrase: ideasSeed, source: "slug" }];
    if (page.problem && page.problem.length <= 80) seeds.push({ phrase: page.problem, source: "dna" });
    for (const semente of sugestao?.seeds || []) seeds.push({ phrase: semente, source: "ai" });
    const unicas: DifferentiationSeed[] = [];
    const vistas = new Set<string>();
    for (const semente of seeds) {
      const normal = semAcento(semente.phrase).trim();
      if (!normal || vistas.has(normal)) continue;
      vistas.add(normal);
      unicas.push(semente);
    }
    const sources: DifferentiationAngleSource[] = ["slug"];
    if (page.entity || page.problem) sources.push("dna");
    if (sugestao) sources.push("ai");
    const note = distinctTokens.length
      ? `O slug já separa esta página pelas palavras "${label}".`
      : "O slug não tem palavra própria: o ângulo depende do volume e da SERP.";
    return {
      keywordId: page.keywordId,
      label,
      distinctTokens,
      entityTokens,
      sharedTokens: shared,
      seeds: unicas.slice(0, 5),
      ideasSeed,
      relatedSeed,
      aiLabel: sugestao ? sugestao.angle : null,
      sources,
      note,
    };
  });
}

/* ------------------------------ teto e postos ------------------------------ */

/** Quantas keywords novas cabem no artigo (teto de 6, D4). Sem ArticleDNA, só a principal conta. */
export function differentiationSlotsLeft(page: Pick<DifferentiationPage, "articleKeywordCount">): number {
  const atual = typeof page.articleKeywordCount === "number" && page.articleKeywordCount > 0 ? page.articleKeywordCount : 1;
  return Math.max(0, MAX_ARTICLE_KEYWORDS - atual);
}

/** A frase do Posto e do ranqueamento, dita igual na tela e no MCP. */
export function differentiationPostNote(page: Pick<DifferentiationPage, "post">, ranking: Pick<DifferentiationRanking, "ranks" | "possiblyRanks" | "label">): string {
  if (rankingBlocksSwap(ranking)) return `A página já aparece no Google (${ranking.label.replace(/\.$/, "")}): a principal fica; entram só 1 ou 2 secundárias.`;
  if (page.post === "locked") return `Posto "${PUBLISHED_PRIMARY_POST_LABELS.locked}": a principal fica; entram só 1 ou 2 secundárias, e a diferenciação fica mais fraca.`;
  if (page.post === "unknown") return `Posto não declarado: nada troca a principal até você declarar "Livre" ou "Travado ao slug" no Minerador; entram só secundárias.`;
  return "Posto Livre: pode ganhar uma principal nova com mais volume; a antiga vira secundária.";
}

/** Quantas páginas em comum contam como "o Google junta" (D2.2) — reexportado para a tela. */
export const DIFFERENTIATION_STRONG_PAGES = SERP_SUBJECT_THRESHOLDS.strongPages;

/* ------------------------------ forma compacta ------------------------------ */

/** A linha do grupo para a lista: sem as pegadas, só o que a tela e o MCP mostram. */
export function compactDifferentiationGroup(group: DifferentiationGroup, proposal?: DifferentiationProposalSummary | null) {
  return {
    // `.map(compactDifferentiationGroup)` passa o índice aqui: só objeto vale.
    proposal: proposal && typeof proposal === "object" ? proposal : null,
    groupId: group.groupId,
    summary: group.summary,
    maxSharedPages: group.maxSharedPages,
    anyRanking: group.anyRanking,
    kept: group.kept,
    serpFingerprint: group.serpFingerprint,
    members: group.members.map(member => ({
      keywordId: member.page.keywordId,
      keyword: member.page.keyword,
      url: member.page.url,
      post: member.page.post,
      volume: member.page.volume,
      volumeValidated: member.page.volumeValidated,
      articleId: member.page.articleId,
      ranking: { ranks: member.ranking.ranks, possiblyRanks: member.ranking.possiblyRanks, bestPosition: member.ranking.bestPosition, label: member.ranking.label, lenses: [...new Set(member.ranking.hits.map(hit => hit.lens))] },
    })),
    strongPairs: group.strongPairs.map(pair => ({ leftKeywordId: pair.leftKeywordId, rightKeywordId: pair.rightKeywordId, sharedPageCount: pair.sharedPageCount, sharedPages: pair.sharedPages })),
    probablePairs: group.probablePairs.map(pair => ({ leftKeywordId: pair.leftKeywordId, rightKeywordId: pair.rightKeywordId, sharedPageCount: pair.sharedPageCount, outsideGroup: pair.outsideGroup })),
  };
}

export type CompactDifferentiationGroup = ReturnType<typeof compactDifferentiationGroup>;
