/**
 * DIFERENCIAR PUBLICADOS — aplicar a proposta por decisão humana (SDD §5).
 *
 * "Aceitar grupo" grava, para cada página que tem ArticleDNA, UMA versão nova
 * pelos MESMOS gravadores da troca de principal (`decidePublishedPrimarySwap` +
 * `buildPublishedSwapArticlePayload`) e com os campos que o ArticleDNA JÁ tem —
 * nenhum campo novo no schema `.strict()`:
 *
 *   excludedSubjects       o ângulo das irmãs ("não abordar");
 *   differentiation        a nota de diferenciação, com o prefixo
 *                          `Diferenciação: ` — ela desce ao Redator nos
 *                          fundamentos (`WRITER_ARTICLE_DNA_FOUNDATION_FIELDS`)
 *                          e nas linhas de `editorialContext` do envio do Radar;
 *   internalLinks          a sugestão de link entre as irmãs, com o prefixo
 *                          `Link interno sugerido: ` (o InternalLinkGraph grava
 *                          sugestão só pela Proposal IA do grafo, que ainda não
 *                          tem tela: a sugestão fica aqui e no payload);
 *   nearbyArticleIds       os artigos irmãos;
 *   alerts                 o registro da decisão.
 *
 * O que não dá para gravar agora volta como passo seguinte, nunca em silêncio:
 *   - keyword nova que ainda não está no Minerador → `ingest` (vai ao
 *     Processador pela rota de import da Pesquisa por Assunto; o Minerador mede
 *     e aprova — ele é o dono da ingestão);
 *   - keyword do Minerador que não está no artigo → `formation` (entra pelo
 *     writer da formação, `planAddKeywordsToCandidate`, na tela do Arquiteto);
 *   - a troca da principal só é gravada quando a nova já está no ArticleDNA, o
 *     Posto (relido agora) é Livre e a página não ranqueia (Q3).
 *
 * URL, slug, canonical e marca são copiados da versão atual, sempre. Nenhuma
 * keyword some: a antiga principal vira secundária (D2.1) e nada é removido.
 *
 * Domínio puro: sem banco, sem rede.
 */
import { ArticleDNASchema, type ArticleDNA } from "./contracts.ts";
import { canonicalJson } from "./versioning.ts";
import {
  decidePublishedPrimarySwap,
  proposePublishedPrimarySwap,
  type PublishedPrimaryPost,
} from "./published-primary-swap.ts";
import { buildSerpSubjectIndex, type KeywordSerpFootprint } from "./serp-subject-overlap.ts";
import {
  formationKeywordOfPage,
  rankingBlocksSwap,
  type DifferentiationGroupMember,
  type DifferentiationRanking,
} from "./published-differentiation.ts";
import type { DifferentiationChoice, DifferentiationPageResult } from "./published-differentiation-run.ts";
import { buildPublishedSwapArticlePayload } from "../../modules/arquiteto/serp-subject-model.ts";
import { normalizeKeyword } from "../minerador/keyword-import-core.ts";
import { DIFFERENTIATION_EDITORIAL_LINES_MAX, DIFFERENTIATION_LINK_PREFIX, DIFFERENTIATION_NOTE_PREFIX, differentiationEditorialLines } from "./differentiation-note.ts";
import type { SubjectDiscoverySource } from "../minerador/subject-discovery-plan.ts";

/* --------------------------------- prefixos --------------------------------- */

export { DIFFERENTIATION_EDITORIAL_LINES_MAX, DIFFERENTIATION_LINK_PREFIX, DIFFERENTIATION_NOTE_PREFIX, differentiationEditorialLines };
/** Teto de uma linha da nota: cabe na projeção dos fundamentos do Redator. */
export const DIFFERENTIATION_NOTE_MAX_CHARS = 240;

const cortar = (texto: string, maximo = DIFFERENTIATION_NOTE_MAX_CHARS) => texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto;
const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export type DifferentiationSibling = {
  keywordId: string;
  keyword: string;
  url: string | null;
  /** O ângulo da irmã; `null` quando o slug dela não tem palavra própria. */
  angle: string | null;
  articleId: string | null;
};

/**
 * A nota de diferenciação de uma página, uma linha por irmã. Exemplo:
 * `Diferenciação: ângulo "captar clientes"; não cobrir "atrair pacientes" — é
 * do artigo "como atrair pacientes para clínica de estética"
 * (https://…); linkar para ele.`
 */
export function differentiationNoteLines(input: { angle: string; siblings: readonly DifferentiationSibling[] }): string[] {
  return input.siblings.map(irma => cortar([
    `${DIFFERENTIATION_NOTE_PREFIX}ângulo "${input.angle}"`,
    irma.angle ? `; não cobrir "${irma.angle}" — é do artigo "${irma.keyword}"` : `; não repetir o artigo "${irma.keyword}"`,
    irma.url ? ` (${irma.url}); linkar para ele.` : "; linkar para ele.",
  ].join("")));
}

const acrescentar = (lista: readonly string[], novos: readonly string[]) => {
  const saida = [...lista];
  for (const item of novos) if (item && !saida.includes(item)) saida.push(item);
  return saida;
};

/**
 * Os campos de diferenciação sobre a versão atual. Não apaga nada do que já
 * estava (decisão humana anterior preservada): só acrescenta o que falta.
 * `changed: false` quando tudo já estava lá — nova versão só com mudança real.
 */
export function withDifferentiationFields(input: {
  current: ArticleDNA;
  angle: string;
  siblings: readonly DifferentiationSibling[];
  decidedAt: string;
  groupId: string;
}): { payload: ArticleDNA; changed: boolean } {
  const { current } = input;
  const assunto = current.subject ? semAcento(current.subject.phrase) : null;
  const excluidos = input.siblings
    .map(irma => irma.angle)
    .filter((angulo): angulo is string => Boolean(angulo))
    .filter(angulo => semAcento(angulo) !== assunto && semAcento(angulo) !== semAcento(input.angle));
  const jaExcluidos = new Set(current.excludedSubjects.map(semAcento));
  const excludedSubjects = [...current.excludedSubjects, ...excluidos.filter(angulo => { const normal = semAcento(angulo); if (jaExcluidos.has(normal)) return false; jaExcluidos.add(normal); return true; })];
  const differentiation = acrescentar(current.differentiation, differentiationNoteLines({ angle: input.angle, siblings: input.siblings }));
  const internalLinks = acrescentar(current.internalLinks, input.siblings.filter(irma => irma.url).map(irma => cortar(`${DIFFERENTIATION_LINK_PREFIX}"${irma.keyword}" — ${irma.url}${irma.angle ? ` (ângulo "${irma.angle}")` : ""}`)));
  const nearbyArticleIds = acrescentar(current.nearbyArticleIds, input.siblings.map(irma => irma.articleId).filter((id): id is string => Boolean(id) && id !== current.articleId));
  const semMudanca = canonicalJson({ excludedSubjects, differentiation, internalLinks, nearbyArticleIds })
    === canonicalJson({ excludedSubjects: current.excludedSubjects, differentiation: current.differentiation, internalLinks: current.internalLinks, nearbyArticleIds: current.nearbyArticleIds });
  if (semMudanca) return { payload: current, changed: false };
  const alerta = `Diferenciação decidida por humano em ${input.decidedAt.slice(0, 10)}: ângulo "${input.angle}" (grupo ${input.groupId}). URL, slug e canonical preservados.`;
  const payload = ArticleDNASchema.parse({
    ...current,
    excludedSubjects,
    differentiation,
    internalLinks,
    nearbyArticleIds,
    alerts: current.alerts.includes(alerta) ? current.alerts : [...current.alerts, alerta],
  });
  return { payload, changed: true };
}

/* ---------------------------------- plano ---------------------------------- */

export type DifferentiationIngestItem = {
  keyword: string;
  origins: SubjectDiscoverySource[];
  evidence: string[];
};

export type DifferentiationApplyPage = {
  keywordId: string;
  keyword: string;
  articleId: string | null;
  /** A versão nova, pronta para gravar; `null` quando nada muda ou não há ArticleDNA. */
  nextPayload: ArticleDNA | null;
  changeReason: string;
  swap: { applied: boolean; keyword: string | null; reason: string };
  /** Keywords do Minerador desta marca que ainda não estão no artigo: entram pela formação. */
  formation: Array<{ keywordId: string; keyword: string; role: "principal" | "secundaria" }>;
  /** Keywords novas: vão ao Processador do Minerador, que mede e aprova. */
  ingest: DifferentiationIngestItem[];
  /** Por que esta página não recebe versão agora. */
  refusal: string | null;
};

export type DifferentiationApplyPlan = {
  pages: DifferentiationApplyPage[];
  /** O Processador recebe as novas com o tema da página (mesmo formato da Pesquisa por Assunto). */
  ingestBatches: Array<{ pageKeywordId: string; subjectPhrase: string; items: DifferentiationIngestItem[] }>;
};

export type DifferentiationApplyArticle = { articleId: string; payload: ArticleDNA };

const origemPadrao: SubjectDiscoverySource = "labs_category";

function paraIngestao(escolha: DifferentiationChoice): DifferentiationIngestItem {
  const origins = escolha.origins.length ? escolha.origins : [origemPadrao];
  return { keyword: escolha.keyword, origins, evidence: escolha.evidence.slice(0, 3).map(texto => cortar(texto, 160)) };
}

/**
 * O que "Aceitar grupo" grava em cada página, e o que fica como passo seguinte.
 *
 * `currentPosts`: o Posto RELIDO agora (não o da proposta). `existingByNormalized`:
 * as keywords vivas da marca (normalizada → id). `footprints`: as pegadas
 * gravadas na rodada — a troca é medida de novo com elas, pela régua de sempre.
 */
export function planDifferentiationApply(input: {
  groupId: string;
  members: readonly DifferentiationGroupMember[];
  results: readonly DifferentiationPageResult[];
  articles: ReadonlyMap<string, DifferentiationApplyArticle | null>;
  currentPosts: ReadonlyMap<string, PublishedPrimaryPost>;
  existingByNormalized: ReadonlyMap<string, string>;
  footprints: readonly KeywordSerpFootprint[];
  actorId: string;
  decidedAt: string;
  /**
   * Só estas páginas. Padrão: as "Diferenciado". Página fraca ou sem saída
   * só entra quando a pessoa a marca, e recebe só a nota do ângulo (nenhuma
   * keyword: a melhor possível dela é evidência, não proposta).
   */
  selectedPageIds?: ReadonlySet<string> | null;
  /**
   * O ranqueamento RELIDO do cache agora (Q3), como o Posto. `null` = não deu
   * para reler: nenhuma troca de principal é gravada. Ausente = só o da prévia.
   */
  currentRankings?: ReadonlyMap<string, Pick<DifferentiationRanking, "ranks" | "possiblyRanks">> | null;
}): DifferentiationApplyPlan {
  const porPagina = new Map(input.results.map(result => [result.keywordId, result]));
  const irmasDe = (keywordId: string): DifferentiationSibling[] => input.members
    .filter(member => member.page.keywordId !== keywordId)
    .map(member => {
      const resultado = porPagina.get(member.page.keywordId);
      const semPalavraPropria = !resultado || resultado.angle.startsWith("visão geral");
      return { keywordId: member.page.keywordId, keyword: member.page.keyword, url: member.page.url, angle: semPalavraPropria ? null : resultado.angle, articleId: input.articles.get(member.page.keywordId)?.articleId ?? member.page.articleId };
    });

  const pages: DifferentiationApplyPage[] = [];
  const ingestBatches: DifferentiationApplyPlan["ingestBatches"] = [];
  for (const member of input.members) {
    const page = member.page;
    const resultado = porPagina.get(page.keywordId);
    if (input.selectedPageIds ? !input.selectedPageIds.has(page.keywordId) : resultado?.state !== "differentiated") continue;
    const vazio = { keywordId: page.keywordId, keyword: page.keyword, articleId: input.articles.get(page.keywordId)?.articleId ?? page.articleId, nextPayload: null, changeReason: "", formation: [], ingest: [] };
    if (!resultado) { pages.push({ ...vazio, swap: { applied: false, keyword: null, reason: "Sem resultado da rodada para esta página." }, refusal: "Sem resultado da rodada para esta página." }); continue; }
    // Só "Diferenciado" leva keyword: o que é fraco não separa as páginas (e
    // avaliação antiga podia trazer a melhor possível em secundárias).
    const escolhas = resultado.state === "differentiated"
      ? [resultado.newPrincipal, ...resultado.secondaries].filter((item): item is DifferentiationChoice => Boolean(item))
      : [];
    const idReal = (escolha: DifferentiationChoice) => input.existingByNormalized.get(normalizeKeyword(escolha.keyword)) ?? escolha.existingKeywordId ?? null;
    const artigo = input.articles.get(page.keywordId) ?? null;
    const noArtigo = new Set(artigo?.payload.keywordReferences.map(reference => reference.keywordId) || []);

    const ingest = escolhas.filter(escolha => !idReal(escolha)).map(paraIngestao);
    const formation = escolhas
      .filter(escolha => { const id = idReal(escolha); return Boolean(id) && !noArtigo.has(id!); })
      .map(escolha => ({ keywordId: idReal(escolha)!, keyword: escolha.keyword, role: escolha === resultado.newPrincipal ? "principal" as const : "secundaria" as const }));
    if (ingest.length) ingestBatches.push({ pageKeywordId: page.keywordId, subjectPhrase: page.keyword, items: ingest });

    if (!artigo) {
      pages.push({ ...vazio, formation, ingest, swap: { applied: false, keyword: resultado.state === "differentiated" ? resultado.newPrincipal?.keyword ?? null : null, reason: "Sem ArticleDNA: conclua a formação do artigo e aplique de novo." }, refusal: "A nota e as exclusões são gravadas no ArticleDNA, que ainda não existe para esta página: conclua a formação dela (Concluir formação) e aplique de novo." });
      continue;
    }
    // O artigo precisa ser o desta página publicada (a principal ou a troca já aplicada).
    const decisao = artigo.payload.primaryKeywordDecision;
    const ehDestaPagina = artigo.payload.principalKeywordId === page.keywordId
      || (decisao?.status === "confirmed" && decisao.previousKeywordId === page.keywordId);
    if (!ehDestaPagina) {
      pages.push({ ...vazio, formation, ingest, swap: { applied: false, keyword: null, reason: "O ArticleDNA tem outra principal." }, refusal: "O ArticleDNA encontrado tem outra principal: recarregue a mesa antes de aplicar." });
      continue;
    }

    let atual = artigo.payload;
    let swap: DifferentiationApplyPage["swap"] = { applied: false, keyword: null, reason: resultado.principalNote || "Sem principal nova nesta proposta." };
    const nova = resultado.state === "differentiated" ? resultado.newPrincipal : null;
    const rankingAgora = input.currentRankings === undefined ? null : input.currentRankings?.get(page.keywordId) ?? null;
    if (nova) {
      const postoAgora = input.currentPosts.get(page.keywordId) ?? "unknown";
      const novaId = idReal(nova);
      if (postoAgora !== "free") {
        swap = { applied: false, keyword: nova.keyword, reason: postoAgora === "locked" ? "O Posto agora está \"Travado ao slug\": a principal fica." : "O Posto não está declarado: declare \"Livre\" antes de trocar." };
      } else if (rankingBlocksSwap(member.ranking) || (rankingAgora && rankingBlocksSwap(rankingAgora))) {
        swap = { applied: false, keyword: nova.keyword, reason: "A página aparece no Google: a principal fica (Q3)." };
      } else if (input.currentRankings === null || (input.currentRankings && !rankingAgora)) {
        swap = { applied: false, keyword: nova.keyword, reason: "Não deu para reler a SERP da página agora: a principal fica. Aceite de novo depois." };
      } else if (!novaId) {
        swap = { applied: false, keyword: nova.keyword, reason: `"${nova.keyword}" ainda não está no Minerador: envie ao Processador, aprove e aplique de novo.` };
      } else if (!noArtigo.has(novaId)) {
        swap = { applied: false, keyword: nova.keyword, reason: `"${nova.keyword}" ainda não está no artigo: traga-a pela formação e aplique de novo.` };
      } else if (artigo.payload.principalKeywordId !== page.keywordId) {
        swap = { applied: false, keyword: nova.keyword, reason: "A troca da principal já foi aplicada neste artigo." };
      } else {
        // A MESMA régua da troca (D2.1), medida com as pegadas da rodada.
        const pegadas = input.footprints.map(pegada => pegada.keywordId === nova.candidateId ? { ...pegada, keywordId: novaId } : pegada);
        const indice = buildSerpSubjectIndex(pegadas);
        const proposta = proposePublishedPrimarySwap({
          published: formationKeywordOfPage(page),
          post: "free",
          identity: { url: page.url, canonical: page.canonical, slug: page.slug },
          candidates: [{ keywordId: novaId, keyword: nova.keyword, intent: null, volume: nova.adsVolume, kgr: null, entity: null, problem: null, isPublished: false, volumeValidated: typeof nova.adsVolume === "number" && nova.adsVolume > 0 }],
          serp: indice,
        });
        const desfecho = proposta.state === "proposed"
          ? decidePublishedPrimarySwap({
            proposal: proposta,
            article: { principalKeywordId: atual.principalKeywordId, keywordIds: atual.keywordReferences.map(reference => reference.keywordId), identity: { url: page.url, canonical: page.canonical, slug: page.slug } },
            currentPost: "free",
            accepted: true,
            actorUserId: input.actorId,
            decidedAt: input.decidedAt,
          })
          : null;
        if (desfecho?.ok && desfecho.accepted) {
          atual = buildPublishedSwapArticlePayload({
            current: atual, outcome: desfecho, actorId: input.actorId, decidedAt: input.decidedAt,
            substituteLabel: nova.keyword, previousLabel: page.keyword,
            substituteMetrics: { volume: nova.adsVolume, resultCount: null, kgrScore: null },
          });
          swap = { applied: true, keyword: nova.keyword, reason: `"${nova.keyword}" assume a principal; "${page.keyword}" fica como secundária. URL, slug e canonical preservados.` };
        } else {
          swap = { applied: false, keyword: nova.keyword, reason: desfecho && !desfecho.ok ? desfecho.reason : proposta.note };
        }
      }
    }

    const campos = withDifferentiationFields({ current: atual, angle: resultado.angle, siblings: irmasDe(page.keywordId), decidedAt: input.decidedAt, groupId: input.groupId });
    const mudou = swap.applied || campos.changed;
    pages.push({
      ...vazio,
      articleId: artigo.articleId,
      nextPayload: mudou ? campos.payload : null,
      changeReason: swap.applied
        ? `Diferenciação (grupo ${input.groupId}): troca da principal por decisão humana e nota de diferenciação. URL, slug e canonical preservados.`
        : `Diferenciação (grupo ${input.groupId}): nota, assuntos excluídos e links sugeridos por decisão humana. URL, slug e canonical preservados.`,
      swap,
      formation,
      ingest,
      refusal: mudou ? null : "Nada mudou: a nota e as exclusões já estavam neste artigo.",
    });
  }
  return { pages, ingestBatches };
}

/** O readback confirma a versão gravada: a nota está lá e a identidade não mudou. */
export function differentiationReadbackConfirms(input: { written: ArticleDNA; readback: ArticleDNA | null; previous: ArticleDNA }): boolean {
  const { written, readback, previous } = input;
  if (!readback) return false;
  return readback.principalKeywordId === written.principalKeywordId
    && readback.suggestedSlug === previous.suggestedSlug
    && readback.canonical === previous.canonical
    && readback.brandId === previous.brandId
    && written.differentiation.every(linha => readback.differentiation.includes(linha))
    && written.excludedSubjects.every(item => readback.excludedSubjects.includes(item));
}
