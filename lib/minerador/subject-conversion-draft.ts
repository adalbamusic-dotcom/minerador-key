import { DECLARED_PLAN_SCOPE_MAX, normalizeDeclaredPhraseKey, normalizeDeclaredSiloSlug, type DeclaredPlanRole } from "./declared-plan.ts";
import { resolveKeywordSubject } from "./keyword-subject.ts";
import { convertedTitleIndex, isConvertibleLegacySubject, readSubjectConversion } from "./subject-conversion.ts";

/**
 * ===== CONVERTER O FORMATO ANTERIOR — O RASCUNHO DA TELA (puro) =====
 *
 * SDD `docs/compartilhado/sdd-conversao-assunto-legado-2026-10-13.md` §5 e §9.
 *
 * Monta, para um grupo, as linhas que o dono revisa antes de converter: cada
 * Assunto do formato anterior (a linha-título, sem plano), o artigo do
 * Arquiteto que ele sustenta, a keyword SUGERIDA para carregar o Assunto (a
 * principal vigente do artigo, D3) e as alternativas; o Silo e a ordem do
 * SiloDNA vigente (D2, D7); os detalhes pré-preenchidos com a promessa vigente
 * (D8). Só sugere: nada é gravado aqui; quem grava é o núcleo do cadastro.
 */

export type ConversionDraftKeyword = {
  id: string;
  keyword: string;
  status: string | null;
  groupId: string | null;
  volume: number | null;
  semantic: Record<string, unknown> | null | undefined;
};

export type ConversionDraftArticle = {
  articleId: string;
  versionNumber: number;
  principalKeywordId: string;
  secondaryKeywordIds: readonly string[];
  narrativeReinforcementIds: readonly string[];
  subjectKeywordId: string | null;
  promise: string | null;
  hierarchy: string | null;
};

export type ConversionDraftSilo = {
  name: string;
  slug: string | null;
  objective: string | null;
  pillarArticleId: string | null;
  narrativeOrder: readonly string[];
  articleIds: readonly string[];
};

export type ConversionKeywordOption = {
  keywordId: string;
  keyword: string;
  volume: number | null;
  relation: "principal" | "outside" | "support";
  allowed: boolean;
  reason: string | null;
};

export type ConversionDraftRow = {
  order: number;
  role: DeclaredPlanRole;
  title: string;
  fromKeywordId: string;
  articleId: string | null;
  articleVersion: number | null;
  scope: string;
  suggestedKeywordId: string | null;
  suggestedKeyword: string | null;
  options: ConversionKeywordOption[];
};

export type ConversionDraft = {
  silo: { name: string; slug: string | null; objective: string | null } | null;
  rows: ConversionDraftRow[];
  /** Artigos do Silo sem Assunto: com o plano do grupo, saem do Silo antes de "Aplicar o plano" (D5). */
  outsidePlan: Array<{ articleId: string; principal: string | null; reason: string }>;
  /** Linhas-título já convertidas (T → K), para a tela mostrar o histórico. */
  converted: Array<{ fromKeywordId: string; fromPhrase: string; keywordId: string; keyword: string | null; articleId: string | null }>;
  notices: string[];
};

const OPTIONS_MAX = 12;
const STOP = new Set(["de", "da", "do", "das", "dos", "e", "ou", "a", "o", "as", "os", "um", "uma", "para", "por", "com", "em", "no", "na", "nos", "nas", "que", "qual", "como", "quando", "sua", "seu", "meu", "minha", "vale", "pena"]);

function termos(texto: string): Set<string> {
  return new Set(normalizeDeclaredPhraseKey(texto).split(/[^a-z0-9]+/).filter(termo => termo.length > 2 && !STOP.has(termo)));
}

function overlap(left: Set<string>, right: Set<string>): number {
  let total = 0;
  for (const termo of left) if (right.has(termo)) total += 1;
  return total;
}

/** Quebras de linha, inclusive os separadores Unicode que colam de editores (mesma lista de `keyword-subject.ts`). */
const SEPARADORES = ["\r", "\n", String.fromCharCode(0x2028), String.fromCharCode(0x2029)];

function linhaUnica(texto: string | null | undefined): string {
  let saida = texto || "";
  for (const separador of SEPARADORES) saida = saida.split(separador).join(" ");
  return saida.replace(/\s+/g, " ").trim().slice(0, DECLARED_PLAN_SCOPE_MAX);
}

function sustentacoesDe(keywords: readonly ConversionDraftKeyword[], titleId: string): Set<string> {
  const ids = new Set<string>();
  for (const keyword of keywords) {
    const bloco = keyword.semantic?.subject_discovery;
    const lista = bloco && typeof bloco === "object" && Array.isArray((bloco as Record<string, unknown>).subjectKeywordIds) ? (bloco as { subjectKeywordIds: unknown[] }).subjectKeywordIds : [];
    if (lista.includes(titleId)) ids.add(keyword.id);
  }
  return ids;
}

/** O rascunho da conversão de um grupo. `keywords` = as linhas vivas da marca (o grupo e as sustentações). */
export function buildConversionDraft(input: {
  groupId: string;
  keywords: readonly ConversionDraftKeyword[];
  articles: readonly ConversionDraftArticle[];
  silo: ConversionDraftSilo | null;
}): ConversionDraft {
  const byId = new Map(input.keywords.map(keyword => [keyword.id, keyword]));
  const convertidas = convertedTitleIndex(input.keywords.map(keyword => ({ id: keyword.id, keyword: keyword.keyword, semantic: keyword.semantic })));
  const converted = [...convertidas.entries()].map(([fromKeywordId, target]) => {
    const conversao = readSubjectConversion(byId.get(target.keywordId)?.semantic);
    return { fromKeywordId, fromPhrase: conversao?.fromPhrase ?? byId.get(fromKeywordId)?.keyword ?? fromKeywordId, keywordId: target.keywordId, keyword: target.keyword, articleId: target.articleId };
  }).filter(item => byId.get(item.keywordId)?.groupId === input.groupId);

  const titulos = input.keywords.filter(keyword => keyword.groupId === input.groupId && isConvertibleLegacySubject(keyword.semantic) && !convertidas.has(keyword.id));
  const articleOfTitle = new Map<string, ConversionDraftArticle>();
  for (const article of input.articles) if (article.subjectKeywordId) articleOfTitle.set(article.subjectKeywordId, article);
  const emArtigo = new Set<string>();
  for (const article of input.articles) for (const id of [article.principalKeywordId, ...article.secondaryKeywordIds, ...article.narrativeReinforcementIds]) emArtigo.add(id);
  const tituloIds = new Set(input.keywords.filter(keyword => resolveKeywordSubject(keyword.semantic).declared).map(keyword => keyword.id));

  const rows: Array<Omit<ConversionDraftRow, "order" | "role"> & { sort: number }> = [];
  const notices: string[] = [];
  for (const titulo of titulos) {
    const artigo = articleOfTitle.get(titulo.id) ?? null;
    const termosDoTitulo = termos(titulo.keyword);
    const sustentacoes = sustentacoesDe(input.keywords, titulo.id);
    const options: ConversionKeywordOption[] = [];
    if (artigo) {
      const principal = byId.get(artigo.principalKeywordId);
      if (principal) options.push({ keywordId: principal.id, keyword: principal.keyword, volume: principal.volume, relation: "principal", allowed: true, reason: null });
      for (const id of [...artigo.secondaryKeywordIds, ...artigo.narrativeReinforcementIds]) {
        const apoio = byId.get(id);
        if (apoio) options.push({ keywordId: apoio.id, keyword: apoio.keyword, volume: apoio.volume, relation: "support", allowed: false, reason: "É secundária deste artigo: o Assunto não pode ser apoio do mesmo artigo. Converta pela principal e use “Melhorar artigos” depois." });
      }
    }
    const fora = input.keywords
      .filter(keyword => keyword.groupId === input.groupId && !emArtigo.has(keyword.id) && !tituloIds.has(keyword.id) && keyword.id !== titulo.id)
      .map(keyword => ({ keyword, score: (sustentacoes.has(keyword.id) ? 10 : 0) + overlap(termosDoTitulo, termos(keyword.keyword)) }))
      .filter(item => item.score > 0)
      .sort((left, right) => right.score - left.score || (right.keyword.volume ?? -1) - (left.keyword.volume ?? -1) || left.keyword.keyword.localeCompare(right.keyword.keyword, "pt-BR"))
      .slice(0, OPTIONS_MAX);
    for (const item of fora) options.push({ keywordId: item.keyword.id, keyword: item.keyword.keyword, volume: item.keyword.volume, relation: "outside", allowed: true, reason: null });
    const sugerida = options.find(option => option.relation === "principal") ?? options.find(option => option.allowed) ?? null;
    if (!artigo) notices.push(`“${titulo.keyword}” não tem artigo no Arquiteto: a conversão grava o Assunto na keyword escolhida; o artigo nasce depois pelo caminho normal.`);
    const ordemNoSilo = artigo && input.silo ? input.silo.narrativeOrder.indexOf(artigo.articleId) : -1;
    rows.push({
      title: titulo.keyword.trim(),
      fromKeywordId: titulo.id,
      articleId: artigo?.articleId ?? null,
      articleVersion: artigo?.versionNumber ?? null,
      scope: linhaUnica(artigo?.promise) || linhaUnica(`Cobrir com clareza o tema “${titulo.keyword.trim()}”.`),
      suggestedKeywordId: sugerida?.keywordId ?? null,
      suggestedKeyword: sugerida?.keyword ?? null,
      options,
      sort: ordemNoSilo >= 0 ? ordemNoSilo : artigo ? 1000 - Math.min(999, (byId.get(artigo.principalKeywordId)?.volume ?? 0) / 1000) : 5000,
    });
  }
  rows.sort((left, right) => left.sort - right.sort || left.title.localeCompare(right.title, "pt-BR"));
  const pilarArtigo = input.silo?.pillarArticleId ?? null;
  const indicePilar = Math.max(0, rows.findIndex(row => row.articleId && row.articleId === pilarArtigo));
  const final: ConversionDraftRow[] = rows.map(({ sort: _sort, ...row }, index) => {
    void _sort;
    return { ...row, order: index + 1, role: index === indicePilar ? "Pilar" : "Suporte" };
  });

  const outsidePlan = input.silo
    ? input.silo.articleIds
      .map(articleId => input.articles.find(article => article.articleId === articleId))
      .filter((article): article is ConversionDraftArticle => Boolean(article) && !article!.subjectKeywordId)
      .map(article => ({ articleId: article.articleId, principal: byId.get(article.principalKeywordId)?.keyword ?? null, reason: "Artigo do Silo sem Assunto: com o plano do grupo, retire-o do Silo no Arquiteto (Silos → Retirar artigo do Silo) antes de “Aplicar o plano declarado ao Silo”, ou cadastre um Assunto para ele." }))
    : [];

  return {
    silo: input.silo ? { name: input.silo.name, slug: normalizeDeclaredSiloSlug(input.silo.slug), objective: input.silo.objective } : null,
    rows: final,
    outsidePlan,
    converted,
    notices,
  };
}
