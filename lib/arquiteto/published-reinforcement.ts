/**
 * REFORÇAR PUBLICADOS — O PLANO DE UMA CONFIRMAÇÃO SÓ (2026-09-28).
 *
 * SDD: `docs/04-arquiteto/sdd-reforcar-publicados-2026-09-28.md` (aprovada pelo
 * dono em 2026-09-28).
 *
 * O dono via "sucesso" em Processar e "conclua a formação e volte aqui" em todo
 * cartão de publicado: o único caminho que grava ArticleDNA na mesa ("Concluir
 * formação") recusa publicados (sem slug → `PUBLISHED_COLLISION`). Este módulo
 * planeja, por página publicada, TUDO o que o botão "Reforçar publicados" grava
 * numa confirmação só:
 *
 *   1. as keywords novas escolhidas da busca em lote (import no Minerador,
 *      Lógica, Volume do Google Ads, aprovação humana, envio ao Arquiteto e o
 *      Silo do publicado) — pelos MESMOS núcleos das telas;
 *   2. a composição do artigo no item de workflow (`articleFormationRef` +
 *      decisão humana "move"), com quem vem de outro Silo mudando de Silo;
 *   3. o ArticleDNA do publicado: o PRIMEIRO, quando ainda não existe (o mesmo
 *      construtor determinístico com `publishedAnchorId` + a guarda do
 *      publicado), ou a SUCESSORA com as keywords novas;
 *   4. a troca da principal aceita, só com Posto Livre relido, página que não
 *      ranqueia (Q3) e a substituta dentro do artigo (a antiga vira secundária).
 *
 * Regras duras: URL, slug, canonical e marca copiados (nunca mudam); teto de 6;
 * nenhuma keyword some (o que o ArticleDNA já tem continua lá); Posto Travado
 * só secundárias; keyword sem volume do Google Ads nunca entra; duas publicadas
 * nunca se fundem; decisão humana noutro artigo não é desfeita; o schema
 * `.strict()` do ArticleDNA não ganha campo.
 *
 * Domínio puro: sem banco, sem rede. Quem grava é o servidor, com releitura.
 */
import { ArticleDNASchema, type ArchitectKeyword, type ArticleDNA, type ProvisionalArticleGroup, type SiloDNA, type VersionEnvelope, type VersionReference } from "./contracts.ts";
import { articleKeywordReference, deterministicArticleDnaPayload } from "./adapters.ts";
import { guardPublishedArticleProposal } from "./published-guard.ts";
import { bindArticleParentForMaterialization } from "./article-silo-materialization.ts";
import { MAX_ARTICLE_KEYWORDS } from "./article-formation.ts";
import {
  decidePublishedPrimarySwap,
  type PublishedPrimaryPost,
  type PublishedPrimarySwapProposal,
} from "./published-primary-swap.ts";
import { rankingBlocksSwap, type DifferentiationPage, type DifferentiationRanking } from "./published-differentiation.ts";
import type { SerpSuggestionLevel } from "./serp-subject-suggestions.ts";
import type { SubjectDiscoverySource } from "../minerador/subject-discovery-plan.ts";
import { buildPublishedSwapArticlePayload } from "../../modules/arquiteto/serp-subject-model.ts";
import { serpCompositionMismatch, type SerpArticleRole, type SerpAssessmentComposition } from "./published-formation-serp.ts";
import { classifySlugFit, slugTextOf } from "./published-slug-fit.ts";

/* -------------------------------- constantes -------------------------------- */

export const PUBLISHED_REINFORCEMENT_ACTION_LABEL = "Reforçar publicados";
/** Páginas por confirmação. */
export const PUBLISHED_REINFORCEMENT_MAX_PAGES = 30;
/** O texto da confirmação quando há keyword nova: o dono aprova no Minerador. */
export const PUBLISHED_REINFORCEMENT_APPROVAL_TEXT = "Ao confirmar, você aprova estas keywords no Minerador (Lógica e Volume do Google Ads medidos agora) e as coloca nos artigos publicados. URL, slug e canonical não mudam.";

/* ---------------------------------- fatos ---------------------------------- */

/** Uma keyword como o servidor a leu agora (item de workflow do Arquiteto e Minerador). */
export type ReinforcementKeywordFacts = {
  keywordId: string;
  keyword: string;
  /** Item de workflow do Arquiteto (`subject_type = keyword`, `stage = architect`). */
  workflowItemId: string | null;
  lockVersion: number | null;
  /** O item está `received` (o Arquiteto recebeu a keyword). */
  received: boolean;
  territoryRef: string | null;
  /** A formação humana em que ela está (`articleFormationRef`). */
  formationRef: string | null;
  isPublished: boolean;
  volume: number | null;
  /** Volume do Google Ads maior que zero (a coluna Volume do Minerador). */
  volumeValidated: boolean;
  /** O papel decidido por humano na formação (`articleFormationDecision.role`), quando há. */
  formationRole?: "principal" | "secundaria" | "reforco" | null;
  /** O ArticleDNA vigente de OUTRO artigo em que ela já está (id do artigo), quando está. */
  otherArticleId?: string | null;
};

/** Uma keyword nova escolhida no resultado da busca em lote desta página. */
export type ReinforcementNewKeyword = {
  keyword: string;
  normalizedKeyword: string;
  adsVolume: number;
  level: SerpSuggestionLevel;
  sharedPageCount: number;
  origins: SubjectDiscoverySource[];
  evidence: string[];
  /** A busca que a trouxe (operationRequestId da rodada): vira o `searchId` do import. */
  searchId: string;
  /** Já existe no Minerador desta marca (relido agora): segue o caminho a partir da Lógica. */
  existingKeywordId: string | null;
};

export type ReinforcementArticle = {
  articleId: string;
  versionId: string;
  versionNumber: number;
  payload: ArticleDNA;
};

/** O que o servidor leu de UMA página publicada, antes de planejar. */
export type PublishedReinforcementPageFacts = {
  /** Identidade (Vínculo) e Posto relido agora. */
  page: DifferentiationPage;
  /** O item de workflow da keyword publicada. */
  item: ReinforcementKeywordFacts | null;
  /** Quem já está na formação humana do publicado (mesmo `articleFormationRef`), sem o publicado. */
  members: ReinforcementKeywordFacts[];
  article: ReinforcementArticle | null;
  /** O ranqueamento relido do cache agora (Q3). `null`: não deu para reler. */
  ranking: Pick<DifferentiationRanking, "ranks" | "possiblyRanks" | "label"> | null;
  /** As keywords do Minerador escolhidas no cartão, relidas, com o nível medido agora pelo cache. */
  chosen: Array<ReinforcementKeywordFacts & { level: SerpSuggestionLevel | null; sharedPageCount: number }>;
  /** Ids pedidos que não existem nesta marca. */
  unknownIds: string[];
  newKeywords: ReinforcementNewKeyword[];
  /** Keywords novas pedidas que não estão no resultado gravado da busca desta página. */
  newMissing: string[];
  /** Keywords novas recusadas na leitura, com o motivo (ex.: rejeitada pelo dono no Minerador). */
  newRefused?: Array<{ keyword: string; reason: string }>;
  /** A troca pedida e a proposta medida agora (régua da troca, D2.1). */
  swapKeywordId: string | null;
  swapProposal: PublishedPrimarySwapProposal | null;
  /**
   * Aditivo (2026-09-28, Defeito 3): os pareceres de SERP gravados que podem
   * responder por este artigo, na ordem de preferência (o da formação humana,
   * depois o do candidato calculado da página), com a composição que cada um
   * observou. O ArticleDNA só é aprovado com o parecer DA COMPOSIÇÃO que vai
   * ser gravada — nunca com o de outra.
   */
  serpCandidates?: Array<{ reference: VersionReference; composition: SerpAssessmentComposition | null }>;
  /**
   * Aditivo (corretor 2026-09-28): de onde veio a troca. `request` = a caixinha
   * "Aceitar a troca" desta confirmação; `recorded` = a troca que você
   * confirmou numa confirmação anterior do Reforçar e ficou gravada na mesa
   * (marcador `PUBLISHED_REINFORCEMENT_SWAP_REASON`) esperando o ArticleDNA.
   */
  swapSource?: "request" | "recorded" | null;
};

/* ---------------------------------- plano ---------------------------------- */

export type ReinforcementAdd = {
  keywordId: string;
  keyword: string;
  level: SerpSuggestionLevel | null;
  sharedPageCount: number;
  /** Vem de outro Silo: muda para o Silo do publicado na mesma confirmação. */
  fromTerritoryRef: string | null;
  workflowItemId: string;
  lockVersion: number;
};

export type PublishedReinforcementPagePlan = {
  publishedKeywordId: string;
  keyword: string;
  url: string | null;
  /** O id do ArticleDNA: o que existe, ou o id da keyword publicada (primeiro DNA). */
  articleId: string;
  status: "ready" | "unchanged" | "refused";
  refusal: string | null;
  territoryRef: string | null;
  /** A formação humana já gravada, ou `null` (nasce na confirmação). */
  formationRef: string | null;
  dna: { mode: "first" | "successor" | "none"; fromVersionId: string | null; fromVersionNumber: number | null };
  /** Quem fica no artigo (já estava no ArticleDNA ou na formação). */
  keep: Array<{ keywordId: string; keyword: string }>;
  /** Keywords do Minerador que entram agora. */
  add: ReinforcementAdd[];
  /** Keywords novas que entram agora (passam pelo Minerador antes). */
  create: ReinforcementNewKeyword[];
  swap: { keywordId: string | null; keyword: string | null; state: "apply" | "refused" | "none"; reason: string };
  /** Pedidas e recusadas, com o motivo em português. */
  refused: Array<{ keyword: string; reason: string }>;
  /** O que a confirmação diz desta página, em frases simples. */
  lines: string[];
  /**
   * Aditivo (2026-09-28): o parecer de SERP que descreve a composição a gravar
   * (vai no ArticleDNA aprovado), ou `null` quando não há.
   */
  serpReference?: VersionReference | null;
  /**
   * Aditivo (2026-09-28): por que o ArticleDNA fica para a próxima
   * confirmação — a composição mudou e ainda não há parecer de SERP dela. A
   * mesa (Minerador, composição, Silo) é gravada agora; o ArticleDNA, depois
   * do "Processar artigos" (cache primeiro). `null`: o DNA é gravado agora.
   */
  dnaDeferred?: string | null;
  /** Aditivo (2026-09-28): nova versão só para levar o parecer da composição gravada. */
  serpRefresh?: boolean;
  /**
   * Aditivo (corretor 2026-09-28): a principal da troca já confirmada no
   * ArticleDNA troca a entidade do slug. A mesa NÃO é alinhada a ela (os papéis
   * ficam como estão) e a confirmação diz isso; uma nova troca pode ser pedida.
   */
  confirmedSwapContradictsSlug?: boolean;
};

/** A frase do próximo passo quando o ArticleDNA espera o parecer da composição. */
export const PUBLISHED_REINFORCEMENT_SERP_NEXT_STEP = "Próximo passo: \"Processar artigos\" para este artigo (cache primeiro: sem custo quando as 4 lentes estão no cache) e use \"Gravar reforços\" de novo (tabela \"Reforçar publicados\") para gravar o ArticleDNA.";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const lista = (nomes: readonly string[]) => nomes.map(nome => `"${nome}"`).join(", ");

/**
 * O plano de UMA página. Nada é gravado aqui.
 *
 * Recusa a página inteira quando falta o essencial (sem item no Arquiteto, sem
 * Silo, ArticleDNA de outra principal); recusa keyword a keyword o resto, com
 * o motivo. Página sem ArticleDNA ganha o primeiro mesmo sem reforço: é ele
 * que acaba com o "conclua a formação e volte aqui".
 */
export function planPublishedReinforcementPage(facts: PublishedReinforcementPageFacts): PublishedReinforcementPagePlan {
  const { page } = facts;
  const base = {
    publishedKeywordId: page.keywordId,
    keyword: page.keyword,
    url: page.url,
    articleId: facts.article?.articleId ?? page.keywordId,
    territoryRef: facts.item?.territoryRef ?? null,
    formationRef: facts.item?.formationRef ?? null,
  };
  const recusar = (motivo: string): PublishedReinforcementPagePlan => ({
    ...base, status: "refused", refusal: motivo,
    dna: { mode: "none", fromVersionId: null, fromVersionNumber: null },
    keep: [], add: [], create: [], swap: { keywordId: null, keyword: null, state: "none", reason: "" }, refused: [],
    lines: [`"${page.keyword}": nada será gravado. ${motivo}`],
  });

  if (!page.url) return recusar("A página não tem URL no Vínculo do Minerador: declare a URL antes.");
  if (!facts.item || !facts.item.received || !facts.item.workflowItemId) return recusar("A keyword publicada ainda não está no Arquiteto: envie-a pelo Minerador antes.");
  if (!facts.item.territoryRef) return recusar("O publicado ainda não tem Silo confirmado no Arquiteto: confirme o Silo dele na aba Silos antes.");
  if (facts.article) {
    const decisao = facts.article.payload.primaryKeywordDecision;
    const dela = facts.article.payload.principalKeywordId === page.keywordId
      || (decisao?.status === "confirmed" && decisao.previousKeywordId === page.keywordId);
    if (!dela) return recusar("O ArticleDNA encontrado tem outra principal: recarregue a mesa antes.");
  }
  // A formação gravada do publicado pertence a ele: outra principal decidida por
  // humano, ou membro já no ArticleDNA de outro artigo, faria a mesma keyword
  // morar em dois ArticleDNAs. Nada é desfeito em silêncio.
  // Exceção (2026-09-28): a principal da formação é a da troca pedida agora,
  // ou a da troca já confirmada no ArticleDNA — as duas são decisão humana
  // sobre ESTE artigo, e a página continua sendo ele.
  const trocaConfirmada = facts.article?.payload.primaryKeywordDecision?.status === "confirmed" && facts.article.payload.primaryKeywordDecision.previousKeywordId === page.keywordId
    ? facts.article.payload.principalKeywordId
    : null;
  const outraPrincipal = facts.members.find(item => item.formationRole === "principal" && item.keywordId !== facts.swapKeywordId && item.keywordId !== trocaConfirmada);
  if (outraPrincipal) return recusar(`A formação gravada deste publicado tem "${outraPrincipal.keyword}" como principal, por decisão sua: confirme a composição na mesa antes.`);
  const emOutroArtigo = facts.members.filter(item => item.otherArticleId);
  if (emOutroArtigo.length) return recusar(`${lista(emOutroArtigo.map(item => item.keyword))} já ${emOutroArtigo.length === 1 ? "está" : "estão"} no ArticleDNA de outro artigo: tire de lá antes (uma keyword mora num artigo só).`);

  const territorio = facts.item.territoryRef;
  const refused: PublishedReinforcementPagePlan["refused"] = [];
  const nomes = new Map<string, string>([[page.keywordId, page.keyword], ...facts.members.map(item => [item.keywordId, item.keyword] as const)]);

  // Quem fica: o que o ArticleDNA já tem (nenhuma keyword some) e a formação gravada.
  const doArtigo = facts.article ? facts.article.payload.keywordReferences.map(reference => String(reference.keywordId)) : [];
  const ficam = [...new Set([...doArtigo, ...facts.members.map(item => item.keywordId)])].filter(id => id !== page.keywordId);
  // O texto das keywords que só o ArticleDNA conhece (ex.: a principal de uma troca já aplicada).
  for (const referencia of facts.article?.payload.keywordReferences || []) {
    const snapshot = referencia.keywordDnaSnapshot?.sourceKeywordSnapshot as { keyword?: unknown } | undefined;
    if (!nomes.has(String(referencia.keywordId)) && typeof snapshot?.keyword === "string" && snapshot.keyword.trim()) nomes.set(String(referencia.keywordId), snapshot.keyword.trim());
  }
  const keep = ficam.map(id => ({ keywordId: id, keyword: nomes.get(id) ?? id }));
  const composicao = new Set<string>([page.keywordId, ...ficam]);
  // Teto de 6 também para o que já está gravado (ArticleDNA + formação): nada entra por cima dele.
  if (composicao.size > MAX_ARTICLE_KEYWORDS) {
    return recusar(`O ArticleDNA e a composição gravada na mesa somam ${composicao.size} keywords, acima do teto de ${MAX_ARTICLE_KEYWORDS}: tire ${composicao.size - MAX_ARTICLE_KEYWORDS} na mesa antes.`);
  }
  /*
   * A TROCA JÁ CONFIRMADA QUE CONTRADIZ O SLUG (corretor 2026-09-28).
   *
   * A troca de 2026-09-28 pôs "como atrair pacientes para o consultório" como
   * principal de /como-atrair-pacientes-para-clinica: a URL diz uma entidade e
   * a principal diz outra. A régua nova só evita as próximas; esta já está no
   * ArticleDNA. O Reforçar não a consolida na mesa sem dizer isso, e aceita
   * uma nova troca para uma keyword que caiba no slug (decisão humana, nova
   * versão, a página continua sendo o artigo).
   */
  const slugDaPagina = slugTextOf({ slug: page.slug ?? null, url: page.url, canonical: page.canonical ?? null });
  const contradicaoDaTroca = trocaConfirmada ? classifySlugFit(slugDaPagina, nomes.get(trocaConfirmada) ?? "") : null;
  const trocaConfirmadaContradiz = contradicaoDaTroca?.fit === "contradicts";
  const avisoDaTroca = trocaConfirmadaContradiz
    ? `A principal atual, "${nomes.get(trocaConfirmada!) ?? trocaConfirmada}", não combina com o slug publicado "${slugDaPagina}": ${contradicaoDaTroca!.reason}. A troca já confirmada não é alinhada na mesa sem uma nova decisão sua: troque por uma keyword que caiba no slug ("Aceitar a troca" na tabela) ou mantenha como está.`
    : null;

  for (const id of facts.unknownIds) refused.push({ keyword: id, reason: "Não existe nesta marca." });
  for (const frase of facts.newMissing) refused.push({ keyword: frase, reason: "Não está no resultado gravado da busca desta página: rode a busca de novo." });
  for (const item of facts.newRefused || []) refused.push(item);

  const add: ReinforcementAdd[] = [];
  const vistos = new Set<string>(composicao);
  for (const escolhida of facts.chosen) {
    if (vistos.has(escolhida.keywordId)) continue;
    vistos.add(escolhida.keywordId);
    const motivo = escolhida.isPublished
      ? "É a principal de outra página publicada: duas publicadas nunca se fundem."
      : !escolhida.received || !escolhida.workflowItemId || escolhida.lockVersion === null
        ? "Ainda não está no Arquiteto: envie-a pelo Minerador antes."
        : !escolhida.volumeValidated
          ? "Sem volume do Google Ads: não reforça nada."
          : escolhida.formationRef && escolhida.formationRef !== facts.item.formationRef
            ? "Está em outro artigo por decisão sua: tire-a de lá antes."
            : escolhida.otherArticleId
              ? "Já está no ArticleDNA de outro artigo: tire-a de lá antes."
              : !escolhida.level
              ? "O Google não junta esta keyword ao artigo (menos de 2 páginas em comum no top 10, ou sem SERP no cache)."
              : null;
    if (motivo) { refused.push({ keyword: escolhida.keyword, reason: motivo }); continue; }
    add.push({
      keywordId: escolhida.keywordId,
      keyword: escolhida.keyword,
      level: escolhida.level,
      sharedPageCount: escolhida.sharedPageCount,
      fromTerritoryRef: escolhida.territoryRef && escolhida.territoryRef !== territorio ? escolhida.territoryRef : null,
      workflowItemId: escolhida.workflowItemId!,
      lockVersion: escolhida.lockVersion!,
    });
  }
  const create: ReinforcementNewKeyword[] = [];
  const novasVistas = new Set<string>();
  for (const nova of facts.newKeywords) {
    if (novasVistas.has(nova.normalizedKeyword)) continue;
    novasVistas.add(nova.normalizedKeyword);
    if (!(nova.adsVolume > 0)) { refused.push({ keyword: nova.keyword, reason: "Sem volume do Google Ads: não reforça nada." }); continue; }
    if (nova.existingKeywordId && vistos.has(nova.existingKeywordId)) continue;
    create.push(nova);
  }

  // Teto de 6: quem já está conta primeiro; o excesso é recusado, na ordem pedida.
  let vagas = Math.max(0, MAX_ARTICLE_KEYWORDS - composicao.size);
  const addNoTeto = add.filter(item => { if (vagas > 0) { vagas -= 1; return true; } refused.push({ keyword: item.keyword, reason: `Passa do teto de ${MAX_ARTICLE_KEYWORDS} keywords do artigo.` }); return false; });
  const createNoTeto = create.filter(item => { if (vagas > 0) { vagas -= 1; return true; } refused.push({ keyword: item.keyword, reason: `Passa do teto de ${MAX_ARTICLE_KEYWORDS} keywords do artigo.` }); return false; });

  // A troca: Posto Livre relido, sem ranquear, substituta no artigo, régua da troca (D2.1).
  const finais = new Set([...composicao, ...addNoTeto.map(item => item.keywordId)]);
  let swap: PublishedReinforcementPagePlan["swap"] = { keywordId: null, keyword: null, state: "none", reason: "" };
  if (facts.swapKeywordId) {
    const nome = facts.swapProposal?.substitute?.keywordId === facts.swapKeywordId ? facts.swapProposal.substitute.keyword : nomes.get(facts.swapKeywordId) ?? addNoTeto.find(item => item.keywordId === facts.swapKeywordId)?.keyword ?? facts.swapKeywordId;
    const recusarTroca = (reason: string) => { swap = { keywordId: facts.swapKeywordId, keyword: nome, state: "refused", reason }; };
    const post: PublishedPrimaryPost = page.post;
    const jaTrocada = facts.article?.payload.primaryKeywordDecision?.status === "confirmed" && facts.article.payload.principalKeywordId !== page.keywordId;
    // Refazer a troca só quando a principal de agora contradiz o slug (e para outra keyword).
    if (jaTrocada && (!trocaConfirmadaContradiz || facts.swapKeywordId === trocaConfirmada)) recusarTroca("A troca da principal já foi aplicada neste artigo.");
    else if (post === "locked") recusarTroca("Posto \"Travado ao slug\": a principal fica; o artigo só recebe secundárias.");
    else if (post !== "free") recusarTroca("O Posto não está declarado: declare \"Livre\" no Minerador antes de trocar.");
    else if (!facts.ranking) recusarTroca("Não deu para reler a SERP da página agora: a principal fica. Tente de novo depois.");
    else if (rankingBlocksSwap(facts.ranking)) recusarTroca("A página aparece no Google: a principal fica (página que ranqueia não troca de principal).");
    else if (!finais.has(facts.swapKeywordId)) recusarTroca(`"${nome}" não está no artigo nesta confirmação: marque-a como reforço também.`);
    else if (!facts.swapProposal || facts.swapProposal.state !== "proposed" || facts.swapProposal.substitute?.keywordId !== facts.swapKeywordId) {
      // O motivo desta keyword, quando a régua a recusou (ex.: troca a entidade do slug); senão, a nota geral.
      recusarTroca(facts.swapProposal?.rejected.find(item => item.keywordId === facts.swapKeywordId)?.reason || facts.swapProposal?.note || "A régua da troca não aceita esta keyword agora (volume do Google Ads maior e SERP em comum).");
    } else {
      const deQuem = facts.swapSource === "recorded" ? "Troca que você confirmou na confirmação anterior do Reforçar (gravada na mesa, esperando o ArticleDNA): " : "";
      const refeita = jaTrocada ? ` "${nomes.get(trocaConfirmada!) ?? trocaConfirmada}", que contradiz o slug, deixa de ser a principal e fica como secundária.` : "";
      swap = { keywordId: facts.swapKeywordId, keyword: nome, state: "apply", reason: `${deQuem}"${nome}" assume a principal; "${page.keyword}" fica como secundária.${refeita}` };
    }
  }

  // Membros da formação gravada que o ArticleDNA ainda não tem (a composição
  // foi gravada numa confirmação anterior, antes do parecer): entram agora.
  const pendentesNoDna = facts.article ? ficam.filter(id => !doArtigo.includes(id)) : [];
  // A principal da formação gravada que é a troca pedida só vale se a troca
  // passar agora pela régua: senão a decisão humana dela ficaria desfeita.
  const principalDaMesa = facts.members.find(item => item.formationRole === "principal" && item.keywordId === facts.swapKeywordId && item.keywordId !== trocaConfirmada);
  if (principalDaMesa && swap.state !== "apply") {
    return recusar(`A formação gravada deste publicado tem "${principalDaMesa.keyword}" como principal, por decisão sua, e a troca não passa agora: ${swap.reason || "a régua da troca não a aceita"} Confirme a composição na mesa antes.`);
  }
  const mudaComposicao = addNoTeto.length > 0 || createNoTeto.length > 0 || pendentesNoDna.length > 0;
  let dnaMode: PublishedReinforcementPagePlan["dna"]["mode"] = !facts.article ? "first" : mudaComposicao || swap.state === "apply" ? "successor" : "none";

  /*
   * O PARECER DE SERP DA COMPOSIÇÃO QUE VAI SER GRAVADA (Defeito 3).
   *
   * A aprovação leva a evidência SERP do artigo. Ela precisa descrever esta
   * composição (as mesmas keywords e a mesma principal, depois da troca):
   * gravar o parecer de 1 keyword num artigo de 5 é aprovar o que ninguém
   * confrontou com o mercado. Sem o parecer desta composição, a mesa é gravada
   * agora e o ArticleDNA espera o "Processar artigos" (cache primeiro).
   */
  const principalFinal = swap.state === "apply" && swap.keywordId ? swap.keywordId : facts.article?.payload.principalKeywordId ?? page.keywordId;
  /*
   * Os papéis da composição a gravar (corretor 2026-09-28): os do ArticleDNA,
   * senão os da decisão humana na mesa ("reforco" → reforço narrativo), e a
   * principal final. O parecer precisa ter visto os mesmos papéis nas keywords
   * que consultou — não só a mesma lista e a mesma principal.
   */
  const papelNoArtigo = new Map((facts.article?.payload.keywordReferences || []).map(reference => [String(reference.keywordId), reference.role as SerpArticleRole]));
  const papelNaMesa = new Map(facts.members.map(item => [item.keywordId, item.formationRole] as const));
  const papeisDe = (ids: readonly string[], principal: string, doArtigoSo = false): Record<string, SerpArticleRole> => Object.fromEntries(ids.map(id => [id,
    id === principal ? "principal"
      : papelNoArtigo.get(id) === "reforco_narrativo" || (!doArtigoSo && !papelNoArtigo.has(id) && papelNaMesa.get(id) === "reforco") ? "reforco_narrativo" : "secundaria"]));
  const idsDoAlvo = [...new Set([...composicao, ...addNoTeto.map(item => item.keywordId)])];
  const alvo = { keywordIds: idsDoAlvo, principalKeywordId: principalFinal, roles: papeisDe(idsDoAlvo, principalFinal) };
  // `serpCandidates` ausente = chamador de domínio que não confere a SERP
  // (o servidor sempre manda a lista, mesmo vazia).
  const confereSerp = facts.serpCandidates !== undefined;
  const candidatosSerp = facts.serpCandidates || [];
  const doAlvo = createNoTeto.length ? null : candidatosSerp.find(item => serpCompositionMismatch(item.composition, alvo) === null) ?? null;
  let serpRefresh = false;
  /*
   * A troca já confirmada no ArticleDNA e a mesa dizendo o contrário (a página
   * "principal", a nova principal "secundaria" — a gravação de 2026-09-28 fez
   * isso): a confirmação alinha os papéis na mesa, pela mesma rota da mesa.
   * Sem isso a próxima formação ancorava na página e desfazia a troca.
   */
  // A troca confirmada que contradiz o slug NÃO é alinhada na mesa (nem com nova troca pedida agora).
  const alinharTroca = confereSerp && trocaConfirmada !== null && !trocaConfirmadaContradiz && swap.state !== "apply"
    && (facts.item.formationRole === "principal" || facts.members.find(item => item.keywordId === trocaConfirmada)?.formationRole !== "principal");
  const comAviso = (motivo: string) => avisoDaTroca && swap.state !== "apply" ? `${avisoDaTroca} ${motivo}` : motivo;
  let motivoDoDnaVigente: string | null = null;
  if (confereSerp && dnaMode === "none" && facts.article) {
    // O ArticleDNA vigente leva um parecer de OUTRA composição (ex.: gravado
    // antes desta correção): nova versão só para levar o parecer certo — ou,
    // sem ele ainda, o motivo e o caminho, em vez de "nada muda" em silêncio.
    const atual = facts.article.payload.serpAssessmentRef;
    const idsDoArtigo = facts.article.payload.keywordReferences.map(reference => String(reference.keywordId));
    const composicaoDoArtigo = { keywordIds: idsDoArtigo, principalKeywordId: facts.article.payload.principalKeywordId, roles: papeisDe(idsDoArtigo, facts.article.payload.principalKeywordId, true) };
    const atualDescreve = Boolean(atual) && candidatosSerp.some(item => item.reference.versionId === atual!.versionId && serpCompositionMismatch(item.composition, composicaoDoArtigo) === null);
    const atualConhecido = Boolean(atual) && candidatosSerp.some(item => item.reference.versionId === atual!.versionId);
    // O porquê, dito: outras keywords, outra principal, outros papéis (ex.: o de 2026-09-28 em "tráfego pago": reforço × secundária).
    const porqueAtual = atualConhecido ? serpCompositionMismatch(candidatosSerp.find(item => item.reference.versionId === atual!.versionId)!.composition, composicaoDoArtigo) : null;
    const detalhe = porqueAtual ? ` — ${porqueAtual}` : "";
    if (!atualDescreve && doAlvo && atual?.versionId !== doAlvo.reference.versionId) { dnaMode = "successor"; serpRefresh = true; }
    else if (!atualDescreve && !doAlvo && atualConhecido && alinharTroca) {
      motivoDoDnaVigente = `O ArticleDNA v${facts.article.versionNumber} foi aprovado com o parecer da SERP de outra composição (${plural(composicaoDoArtigo.keywordIds.length, "keyword", "keywords")} no artigo)${detalhe}: a nova versão leva o parecer desta composição depois do "Processar artigos".`;
    } else if (!atualDescreve && !doAlvo && atualConhecido) {
      return { ...recusar(comAviso(`O ArticleDNA v${facts.article.versionNumber} foi aprovado com o parecer da SERP de outra composição (${plural(composicaoDoArtigo.keywordIds.length, "keyword", "keywords")} no artigo)${detalhe}. Rode "Processar artigos" para este artigo (cache primeiro: sem custo quando as 4 lentes estão no cache) e use "Gravar reforços" de novo (tabela "Reforçar publicados"): a nova versão leva o parecer desta composição.`)), refused };
    }
  }
  const mesaMuda = addNoTeto.length > 0 || createNoTeto.length > 0 || alinharTroca
    || (swap.state === "apply" && facts.members.find(item => item.keywordId === swap.keywordId)?.formationRole !== "principal");
  let dnaDeferred: string | null = motivoDoDnaVigente;
  if (confereSerp && dnaMode !== "none" && !doAlvo) {
    const primeiroMotivo = candidatosSerp.length ? serpCompositionMismatch(candidatosSerp[0].composition, alvo) : null;
    const motivo = !candidatosSerp.length
      ? "O artigo ainda não tem parecer da SERP gravado."
      : createNoTeto.length
        ? "Entram keywords novas: o parecer da SERP gravado não as confrontou."
        : `${primeiroMotivo ? `${primeiroMotivo[0].toUpperCase()}${primeiroMotivo.slice(1)}` : "O parecer da SERP gravado não descreve esta composição"}.`;
    if (!mesaMuda) return { ...recusar(comAviso(`${motivo} Rode "Processar artigos" para este artigo (cache primeiro: sem custo quando as 4 lentes estão no cache) e abra a prévia de novo.`)), refused };
    dnaDeferred = motivo;
  }
  // A troca confirmada que contradiz o slug, sem nada a gravar agora: recusada com o aviso (nunca "nada muda" calado).
  if (avisoDaTroca && swap.state !== "apply" && dnaMode === "none" && !alinharTroca) return { ...recusar(avisoDaTroca), refused };
  const status: PublishedReinforcementPagePlan["status"] = dnaMode === "none" && !alinharTroca ? "unchanged" : "ready";

  const lines: string[] = [];
  if (dnaDeferred) lines.push(`"${page.keyword}": grava agora a composição na mesa; o ArticleDNA fica para a próxima confirmação. ${dnaDeferred}`);
  else if (serpRefresh) lines.push(`"${page.keyword}": nova versão do ArticleDNA (v${(facts.article?.versionNumber ?? 0) + 1}) só para levar o parecer da SERP desta composição, aprovada por você.`);
  else if (dnaMode === "first") lines.push(`"${page.keyword}": cria o ArticleDNA do publicado (versão 1), aprovado por você.`);
  else if (dnaMode === "successor") lines.push(`"${page.keyword}": nova versão do ArticleDNA (v${(facts.article?.versionNumber ?? 0) + 1}), aprovada por você.`);
  else lines.push(`"${page.keyword}": nada muda (o ArticleDNA já tem tudo o que foi marcado).`);
  if (avisoDaTroca && swap.state !== "apply") lines.push(avisoDaTroca);
  if (alinharTroca) lines.push(`Alinha na mesa a troca já confirmada no ArticleDNA: "${nomes.get(trocaConfirmada!) ?? trocaConfirmada}" principal e "${page.keyword}" secundária (a próxima formação não desfaz a troca).`);
  if (pendentesNoDna.length) lines.push(`Entram no ArticleDNA ${plural(pendentesNoDna.length, "keyword que já estava", "keywords que já estavam")} na composição gravada: ${lista(pendentesNoDna.map(id => nomes.get(id) ?? id))}.`);
  if (addNoTeto.length) lines.push(`Entram ${plural(addNoTeto.length, "keyword do Minerador", "keywords do Minerador")}: ${lista(addNoTeto.map(item => item.keyword))}.`);
  const outroSilo = addNoTeto.filter(item => item.fromTerritoryRef);
  if (outroSilo.length) lines.push(`${plural(outroSilo.length, "delas muda", "delas mudam")} para o Silo do publicado.`);
  const importadas = createNoTeto.filter(item => !item.existingKeywordId);
  const jaNoMinerador = createNoTeto.filter(item => item.existingKeywordId);
  if (importadas.length) lines.push(`Entram ${plural(importadas.length, "keyword nova", "keywords novas")} (importadas no Minerador e aprovadas por você): ${lista(importadas.map(item => item.keyword))}.`);
  if (jaNoMinerador.length) lines.push(`Entram ${plural(jaNoMinerador.length, "keyword que já está no Minerador", "keywords que já estão no Minerador")} (aprovadas por você e enviadas ao Arquiteto): ${lista(jaNoMinerador.map(item => item.keyword))}.`);
  if (swap.state === "apply") lines.push(`Troca da principal: ${swap.reason}`);
  if (swap.state === "refused") lines.push(`Troca da principal não será feita: ${swap.reason}`);
  if (refused.length) lines.push(`Ficam de fora: ${refused.map(item => `"${item.keyword}" (${item.reason})`).join("; ")}`);
  if (dnaDeferred) lines.push(PUBLISHED_REINFORCEMENT_SERP_NEXT_STEP);
  lines.push("URL, slug e canonical não mudam.");

  return {
    ...base,
    status,
    refusal: null,
    dna: { mode: dnaMode, fromVersionId: facts.article?.versionId ?? null, fromVersionNumber: facts.article?.versionNumber ?? null },
    keep,
    add: addNoTeto,
    create: createNoTeto,
    swap,
    refused,
    lines,
    serpReference: doAlvo?.reference ?? null,
    dnaDeferred,
    serpRefresh,
    ...(trocaConfirmadaContradiz ? { confirmedSwapContradictsSlug: true } : {}),
  };
}

/* --------------------------------- ArticleDNA --------------------------------- */

/** O slug publicado: o último segmento do caminho da URL (nunca muda). */
export function publishedSlugOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const partes = new URL(url).pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    const ultimo = partes.pop();
    if (!ultimo) return null;
    try { return decodeURIComponent(ultimo); } catch { return ultimo; }
  } catch {
    return null;
  }
}

/** A keyword do grupo sem identidade publicada: só a principal carrega URL e canonical. */
const semIdentidade = (keyword: ArchitectKeyword): ArchitectKeyword => {
  const copia = { ...keyword } as Record<string, unknown>;
  for (const campo of ["publishedUrl", "published_url", "url", "canonical", "canonical_url"]) delete copia[campo];
  return copia as unknown as ArchitectKeyword;
};

/**
 * O PRIMEIRO ArticleDNA de um publicado: o construtor determinístico com
 * `publishedAnchorId` (articleId = a keyword publicada, identidade publicada,
 * canonical e política de principal publicada) e a guarda do publicado, que
 * trava slug, marca, canonical e principal nos valores do site. O pai é o
 * território do publicado (estágio INITIAL: sem Silo canônico, `siloId` nulo).
 */
export function buildFirstPublishedArticleDna(input: {
  brandId: string;
  page: Pick<DifferentiationPage, "keywordId" | "keyword" | "url" | "canonical">;
  territoryRef: string;
  /** A publicada primeiro; depois as de apoio, na ordem. */
  keywords: readonly ArchitectKeyword[];
  roles: Readonly<Record<string, "principal" | "secundaria" | "reforco_narrativo">>;
  siloVersions: readonly VersionEnvelope<SiloDNA>[];
}): { ok: true; payload: ArticleDNA } | { ok: false; reason: string } {
  const slug = publishedSlugOf(input.page.url);
  if (!slug) return { ok: false, reason: "A URL publicada não tem caminho para servir de slug." };
  const principal = input.keywords.find(keyword => String(keyword.id) === input.page.keywordId);
  if (!principal) return { ok: false, reason: "A keyword publicada não está entre as keywords do artigo." };
  const keywords = input.keywords.map(keyword => String(keyword.id) === input.page.keywordId
    ? { ...keyword, slug_sugerido: slug, publishedUrl: input.page.url, canonical: input.page.canonical ?? input.page.url } as ArchitectKeyword
    : semIdentidade(keyword));
  const grupo = {
    id: input.page.keywordId,
    keywordIds: keywords.map(keyword => String(keyword.id)),
    keywords,
    publishedAnchorId: input.page.keywordId,
    territoryRef: input.territoryRef,
    suggestedSiloId: null,
    suggestedSiloName: null,
    evidence: { lexical: 0.6, intent: 0.8, entities: 0.5, silo: 1, combined: 0.7 },
    confidence: 0.7,
    alerts: ["Artigo publicado reforçado por decisão humana (Reforçar publicados)."],
    principalSuggestion: {
      keywordId: input.page.keywordId,
      score: 0.7,
      breakdown: { cobertura: 0.6, intencao: 0.8, centralidadeSemantica: 0.7, aderenciaMarca: 0.5, potencialComercial: 0.5, volume: 0.5, dificuldade: 0.5, qualidadeSlug: 0.8, ancoraPublicada: 1, serp: null },
      justificativa: ["Principal publicada: a identidade da página no ar."],
      pendencias: [],
    },
    roles: Object.fromEntries(keywords.map(keyword => [String(keyword.id), input.roles[String(keyword.id)] ?? (String(keyword.id) === input.page.keywordId ? "principal" : "secundaria")])),
    suggestedHierarchy: "Suporte" as const,
  } as unknown as ProvisionalArticleGroup;
  let base: ArticleDNA;
  try {
    base = deterministicArticleDnaPayload(grupo, input.brandId);
  } catch (error) {
    return { ok: false, reason: `O ArticleDNA não pôde ser montado: ${error instanceof Error ? error.message.slice(0, 160) : "formação inválida"}.` };
  }
  const guardada = guardPublishedArticleProposal({
    articleId: base.articleId,
    isPublished: true,
    brandId: input.brandId,
    siloId: null,
    principalKeywordId: input.page.keywordId,
    slug,
    canonical: input.page.canonical ?? base.canonical ?? input.page.url,
    protectSilo: false,
  }, base);
  const vinculo = bindArticleParentForMaterialization({ article: ArticleDNASchema.parse(guardada.proposal), siloVersions: input.siloVersions, stage: "INITIAL" });
  if (!vinculo.ok) return { ok: false, reason: vinculo.reason };
  return { ok: true, payload: ArticleDNASchema.parse(vinculo.payload) };
}

/**
 * A SUCESSORA com as keywords que entram: acrescenta as referências (papel
 * secundária, pelo mesmo `articleKeywordReference` do construtor) e nada
 * remove. Identidade, Silo, principal e decisões anteriores são copiados.
 */
export function withReinforcementKeywords(input: {
  current: ArticleDNA;
  brandId: string;
  add: readonly ArchitectKeyword[];
  decidedAt: string;
}): { payload: ArticleDNA; changed: boolean } {
  const ja = new Set(input.current.keywordReferences.map(reference => String(reference.keywordId)));
  const novas = input.add.filter(keyword => !ja.has(String(keyword.id)));
  if (!novas.length) return { payload: input.current, changed: false };
  const referencias = [...input.current.keywordReferences, ...novas.map(keyword => articleKeywordReference(semIdentidade(keyword), "secundaria", input.brandId))];
  const acrescentar = (lista: readonly string[], itens: readonly string[]) => [...lista, ...itens.filter(item => !lista.includes(item))];
  const frases = novas.map(keyword => String(keyword.keyword));
  const alerta = `Reforço decidido por humano em ${input.decidedAt.slice(0, 10)}: ${novas.length} keyword(s) com volume entraram como secundárias. URL, slug e canonical preservados.`;
  const payload = ArticleDNASchema.parse({
    ...input.current,
    keywordReferences: referencias,
    secondaryKeywordIds: acrescentar(input.current.secondaryKeywordIds, novas.map(keyword => String(keyword.id))),
    coverage: acrescentar(input.current.coverage, frases),
    requiredTopics: acrescentar(input.current.requiredTopics, frases),
    alerts: input.current.alerts.includes(alerta) ? input.current.alerts : [...input.current.alerts, alerta],
  });
  return { payload, changed: true };
}

/**
 * A CONFIRMAÇÃO DO "REFORÇAR PUBLICADOS" É A APROVAÇÃO HUMANA DO ARTIGO.
 *
 * O ArticleDNA é gravado `approved`, como o "Concluir formação" grava: a
 * arquitetura fica confirmada por humano e a evidência SERP do artigo viaja
 * junto (`serpAssessmentRef`, o parecer gravado pelo Processar). O servidor
 * revalida com `articleApprovalRevalidationIssues` antes de gravar — a mesma
 * portaria da rota de artefatos. Sem parecer de SERP, a página é recusada na
 * prévia com o motivo.
 *
 * Não chama `confirmedArticlePayload`: ele trava a política da principal
 * ("locked"), e o Posto do publicado é decisão do Minerador (Livre ou Travado),
 * que o reforço não muda.
 */
export function withHumanArticleApproval(payload: ArticleDNA, serpAssessmentRef: VersionReference | null): ArticleDNA {
  const alerta = "Arquitetura confirmada por decisão humana (Reforçar publicados); identidade publicada preservada.";
  const referencia = serpAssessmentRef ?? payload.serpAssessmentRef ?? null;
  return ArticleDNASchema.parse({
    ...payload,
    architectureStatus: "architecture_confirmed",
    ...(referencia ? { serpAssessmentRef: referencia } : {}),
    alerts: payload.alerts.includes(alerta) ? payload.alerts : [...payload.alerts, alerta],
  });
}

/**
 * A troca aceita sobre o payload: a MESMA decisão (`decidePublishedPrimarySwap`)
 * e o MESMO payload (`buildPublishedSwapArticlePayload`) da troca da mesa.
 */
export function applyReinforcementSwap(input: {
  current: ArticleDNA;
  proposal: PublishedPrimarySwapProposal;
  page: Pick<DifferentiationPage, "keywordId" | "keyword" | "url" | "canonical"> & { slug: string | null };
  substituteVolume: number | null;
  actorId: string;
  decidedAt: string;
  /**
   * Aditivo (corretor 2026-09-28): refaz uma troca já confirmada cuja principal
   * contradiz o slug. A decisão continua sendo sobre a PÁGINA
   * (`previousKeywordId` = a página, que segue identificando o artigo); a
   * principal de agora vira secundária. `currentPrincipalLabel` é o texto dela.
   */
  redo?: { currentPrincipalLabel: string } | null;
}): { ok: true; payload: ArticleDNA } | { ok: false; reason: string } {
  const desfecho = decidePublishedPrimarySwap({
    proposal: input.proposal,
    article: {
      principalKeywordId: input.redo ? input.page.keywordId : input.current.principalKeywordId,
      keywordIds: input.current.keywordReferences.map(reference => String(reference.keywordId)),
      identity: { url: input.page.url, canonical: input.page.canonical, slug: input.page.slug },
    },
    currentPost: "free",
    accepted: true,
    actorUserId: input.actorId,
    decidedAt: input.decidedAt,
  });
  if (!desfecho.ok) return { ok: false, reason: desfecho.reason };
  if (!desfecho.accepted) return { ok: false, reason: "A troca não foi aceita." };
  try {
    const payload = buildPublishedSwapArticlePayload({
      current: input.current,
      outcome: desfecho,
      actorId: input.actorId,
      decidedAt: input.decidedAt,
      substituteLabel: input.proposal.substitute?.keyword ?? "",
      previousLabel: input.redo ? input.redo.currentPrincipalLabel : input.page.keyword,
      substituteMetrics: { volume: input.substituteVolume, resultCount: null, kgrScore: null },
    });
    return { ok: true, payload };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message.slice(0, 200) : "A troca não pôde ser montada." };
  }
}

/**
 * A releitura confirma a versão: a mesma principal, as mesmas keywords
 * (nenhuma a menos), e a identidade publicada intacta (slug, canonical, marca).
 */
export function publishedReinforcementReadbackConfirms(input: { written: ArticleDNA; readback: ArticleDNA | null; previous: ArticleDNA | null }): boolean {
  const { written, readback, previous } = input;
  if (!readback) return false;
  const ids = (payload: ArticleDNA) => new Set(payload.keywordReferences.map(reference => String(reference.keywordId)));
  const escritas = ids(written);
  const relidas = ids(readback);
  const mesmas = escritas.size === relidas.size && [...escritas].every(id => relidas.has(id));
  const nenhumaSumiu = !previous || [...ids(previous)].every(id => relidas.has(id));
  return readback.principalKeywordId === written.principalKeywordId
    && readback.articleId === written.articleId
    && readback.brandId === written.brandId
    && readback.suggestedSlug === (previous?.suggestedSlug ?? written.suggestedSlug)
    && readback.canonical === (previous ? previous.canonical : written.canonical)
    && mesmas
    && nenhumaSumiu;
}

/* ---------------------------------- frases ---------------------------------- */

export type PublishedReinforcementPageOutcome = {
  publishedKeywordId: string;
  keyword: string;
  written: boolean;
  versionNumber: number | null;
  added: number;
  created: number;
  swapApplied: boolean;
  error: string | null;
  /** O que JÁ ficou gravado nesta página (Minerador, composição), mesmo quando o ArticleDNA não foi. */
  partial?: string[];
  /** Keywords que ficaram de fora durante a gravação, com o motivo (ex.: sem volume do Google Ads). */
  leftOut?: Array<{ keyword: string; reason: string }>;
  /** Aditivo (2026-09-28): a mesa foi gravada e o ArticleDNA espera o parecer da SERP desta composição (o motivo). */
  dnaDeferred?: string | null;
};

/**
 * O desfecho em português simples, dizendo o que foi gravado e o que não foi.
 * Sucesso só quando a releitura confirmou alguma gravação.
 */
export function describePublishedReinforcementOutcome(
  outcomes: readonly PublishedReinforcementPageOutcome[],
  stoppedReason: string | null,
  /** Os publicados que nem foram tentados (a gravação parou antes deles). */
  notAttempted: readonly string[] = [],
): { tone: "success" | "info" | "warning"; message: string } {
  const gravadas = outcomes.filter(item => item.written);
  const falhas = outcomes.filter(item => item.error);
  const adiadas = outcomes.filter(item => !item.written && !item.error && item.dnaDeferred);
  const soNoMinerador = outcomes.filter(item => !item.written && !item.error && !item.dnaDeferred && item.partial?.length);
  const deFora = outcomes.flatMap(item => (item.leftOut || []).map(fora => `"${fora.keyword}" (${fora.reason})`));
  const partes: string[] = [];
  if (gravadas.length) {
    const keywords = gravadas.reduce((total, item) => total + item.added + item.created, 0);
    const trocas = gravadas.filter(item => item.swapApplied).length;
    partes.push(`${plural(gravadas.length, "artigo publicado gravado", "artigos publicados gravados")} e confirmados na releitura${keywords ? `, com ${plural(keywords, "keyword nova no artigo", "keywords novas nos artigos")}` : ""}${trocas ? ` e ${plural(trocas, "troca", "trocas")} de principal` : ""}.`);
  }
  for (const item of adiadas) {
    partes.push(`"${item.keyword}": ${item.partial?.length ? `gravado e confirmado na releitura: ${item.partial.join("; ")}. ` : ""}O ArticleDNA ainda não foi gravado: ${item.dnaDeferred} ${PUBLISHED_REINFORCEMENT_SERP_NEXT_STEP}`);
  }
  for (const item of soNoMinerador) partes.push(`"${item.keyword}": o ArticleDNA não mudou. Gravado só: ${item.partial!.join("; ")}.`);
  if (!gravadas.length && !falhas.length && !soNoMinerador.length && !adiadas.length && !stoppedReason) partes.push("Nada foi gravado: os artigos já tinham tudo o que foi marcado.");
  if (deFora.length) partes.push(`Ficaram de fora: ${deFora.join("; ")}.`);
  if (falhas.length) {
    partes.push(`Não gravado: ${falhas.map(item => `"${item.keyword}" (${item.error})${item.partial?.length ? ` — já ficou gravado: ${item.partial.join("; ")}` : " — nada foi gravado nele"}`).join("; ")}.`);
  }
  if (stoppedReason) partes.push(`Parou antes do fim: ${stoppedReason}`);
  if (notAttempted.length) partes.push(`Não tentados (nada foi gravado neles): ${lista(notAttempted)}. Abra a prévia de novo para gravá-los.`);
  partes.push("URL, slug e canonical não mudaram.");
  const pendencia = falhas.length > 0 || Boolean(stoppedReason) || notAttempted.length > 0 || adiadas.length > 0;
  return { tone: gravadas.length && !pendencia ? "success" : pendencia ? "warning" : "info", message: partes.join(" ") };
}
