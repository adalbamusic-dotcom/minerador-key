import { ArticleDNASchema, type ArticleDNA } from "../../lib/arquiteto/contracts.ts";
import {
  SERP_SUBJECT_DILEMMA_LABELS,
  SERP_SUBJECT_DILEMMA_TONES,
  NO_DEMAND_MESSAGE,
  NO_SERP_PAIR_IN_BATCH_MESSAGE,
  REINFORCEMENT_SEARCH_ACTION_LABEL,
  type AnchorSerpDiagnosis,
  type ReinforcementSearchOutcome,
  type SerpSubjectDilemmaState,
} from "../../lib/arquiteto/serp-subject-diagnosis.ts";
import { PUBLISHED_PRIMARY_POST_LABELS, publishedPrimaryPostOf, type PublishedPrimaryPost, type PublishedPrimarySwapOutcome } from "../../lib/arquiteto/published-primary-swap.ts";
import {
  SERP_SUBJECT_LENS_LABELS,
  normalizeSerpPageUrl,
  type KeywordSerpFootprint,
  type SerpSubjectIndex,
  type SerpSubjectStrength,
} from "../../lib/arquiteto/serp-subject-overlap.ts";

/**
 * MESMO ASSUNTO NO GOOGLE — O MODELO DA TELA (D2.1 e D2.2).
 *
 * Pedido do dono (2026-09-26): "caprichar essa resposta do sistema a estes
 * dilemas, que vai ter muito". O domínio (`serp-subject-diagnosis.ts`) diz
 * O QUE aconteceu com cada publicado e cada Assunto; este arquivo diz COMO a
 * tela fala disso: uma frase curta e acionável por dilema, os botões, a
 * evidência por lente ao expandir e o resumo do lote.
 *
 *   Reforçado             "Reforçado com N keywords que dividem a SERP"
 *   Troca proposta        "Troca da principal sugerida: <nova> (volume X,
 *                         Y páginas em comum). URL e slug continuam."
 *                         Aplicar troca / Manter
 *   Par em outro Silo     "O par está no Silo <X>: trazer?"
 *   Par em outro artigo   "O Google junta <par> a este artigo, mas ela já
 *                         está em <outro>" + Abrir o artigo (decisão sua)
 *   Sem par no lote       "Nenhuma keyword deste lote trata do mesmo
 *                         assunto no Google" + Buscar reforço
 *   Tema sem demanda      quando a busca de reforço já rodou sem demanda
 *
 * Nada aqui grava. A troca é decisão humana, gravada como NOVA VERSÃO do
 * ArticleDNA pela porta de versão que já existe (AGENTS §11), com os campos
 * que o schema já aceita (`primaryKeywordCandidates`/`primaryKeywordDecision`):
 * nenhum formato novo de ArticleDNA.
 *
 * Puro: sem React, sem rede, sem storage (os leitores de storage recebem o
 * valor já lido).
 */

/* ------------------------------ leitura do cache ------------------------------ */

/** O teto por pedido de `POST /api/arquiteto/serp-subject` (`SERP_SUBJECT_MAX_KEYWORDS`). */
export const SERP_SUBJECT_READ_BATCH = 600;

export type SerpSubjectReadTarget = {
  keywordId: string;
  keyword: string;
  /** Publicado e Assunto primeiro: são as âncoras que a mesa precisa medir. */
  priority: "published" | "subject" | "free";
};

export type SerpSubjectReadPlan = {
  batches: Array<Array<{ keywordId: string; keyword: string }>>;
  total: number;
  /** Muda quando muda o conjunto pedido: a tela relê só então. */
  signature: string;
};

const ORDEM_PRIORIDADE: Record<SerpSubjectReadTarget["priority"], number> = { published: 0, subject: 1, free: 2 };

/**
 * O pedido da SERP da mesa, em lotes de até 600 ids. Deduplicado, sem frase
 * vazia, âncoras primeiro. Nada é cortado: o que passa de 600 vai no lote
 * seguinte.
 */
export function planSerpSubjectRead(targets: readonly SerpSubjectReadTarget[], batchSize: number = SERP_SUBJECT_READ_BATCH): SerpSubjectReadPlan {
  const vistos = new Map<string, SerpSubjectReadTarget>();
  for (const alvo of targets) {
    const keyword = alvo.keyword.replace(/\s+/g, " ").trim();
    if (!alvo.keywordId || !keyword) continue;
    const anterior = vistos.get(alvo.keywordId);
    if (!anterior || ORDEM_PRIORIDADE[alvo.priority] < ORDEM_PRIORIDADE[anterior.priority]) vistos.set(alvo.keywordId, { ...alvo, keyword });
  }
  const ordenados = [...vistos.values()].sort((left, right) => ORDEM_PRIORIDADE[left.priority] - ORDEM_PRIORIDADE[right.priority]
    || left.keywordId.localeCompare(right.keywordId));
  const tamanho = Math.max(1, Math.floor(batchSize));
  const batches: SerpSubjectReadPlan["batches"] = [];
  for (let inicio = 0; inicio < ordenados.length; inicio += tamanho) {
    batches.push(ordenados.slice(inicio, inicio + tamanho).map(item => ({ keywordId: item.keywordId, keyword: item.keyword })));
  }
  return { batches, total: ordenados.length, signature: ordenados.map(item => `${item.keywordId}=${item.keyword}`).join("|") };
}

export type SerpSubjectEgress = { queries: number; entriesRead: number; approxBytes: number };

export type SerpSubjectReadResponse = {
  footprints: KeywordSerpFootprint[];
  withoutSerp: string[];
  /** `collectedAt` vem na lente que existe mas não serve (vencida): separa "venceu" de "nunca coletada". */
  missingLenses: Array<{ keywordId: string; lens: string; reason: string; collectedAt?: string | null }>;
  egress: SerpSubjectEgress;
  targetingReadFailed: boolean;
};

/** Junta as respostas dos lotes. Uma keyword aparece uma vez; o egress soma. */
export function mergeSerpSubjectReads(responses: readonly SerpSubjectReadResponse[]): SerpSubjectReadResponse {
  const footprints = new Map<string, KeywordSerpFootprint>();
  const semSerp = new Set<string>();
  const lacunas = new Map<string, { keywordId: string; lens: string; reason: string; collectedAt?: string | null }>();
  const egress: SerpSubjectEgress = { queries: 0, entriesRead: 0, approxBytes: 0 };
  let targetingReadFailed = false;
  for (const resposta of responses) {
    for (const pegada of resposta.footprints || []) footprints.set(pegada.keywordId, pegada);
    for (const keywordId of resposta.withoutSerp || []) semSerp.add(keywordId);
    for (const lacuna of resposta.missingLenses || []) lacunas.set(`${lacuna.keywordId}\u0000${lacuna.lens}`, lacuna);
    egress.queries += Number(resposta.egress?.queries) || 0;
    egress.entriesRead += Number(resposta.egress?.entriesRead) || 0;
    egress.approxBytes += Number(resposta.egress?.approxBytes) || 0;
    targetingReadFailed = targetingReadFailed || Boolean(resposta.targetingReadFailed);
  }
  for (const keywordId of footprints.keys()) semSerp.delete(keywordId);
  return { footprints: [...footprints.values()], withoutSerp: [...semSerp].sort(), missingLenses: [...lacunas.values()], egress, targetingReadFailed };
}

/** O custo da leitura, dito em português: nenhuma chamada paga, só egress do banco. */
export function serpSubjectEgressLabel(egress: SerpSubjectEgress | null | undefined): string {
  if (!egress) return "Leitura do cache ainda não feita.";
  const kb = egress.approxBytes >= 1024 * 1024
    ? `${(egress.approxBytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(0, Math.round(egress.approxBytes / 1024))} KB`;
  return `Leitura do cache: ${egress.queries} consulta(s) ao banco, ${egress.entriesRead} entrada(s), cerca de ${kb}. Nenhuma chamada paga ao provider.`;
}

/* ------------------------ a leitura guardada na sessão ------------------------ */

/**
 * A LEITURA DO CACHE NÃO SE REPETE A CADA ABERTURA DA ABA.
 *
 * Na AdalbaPro, cada leitura custa perto de 1 MB de egress (estimativa). A
 * resposta fica no `sessionStorage` desta aba, por marca, com a assinatura do
 * conjunto pedido e a hora: reabrir a aba Artigos ou recarregar a página
 * dentro de 20 minutos reaproveita, sem nova consulta ao banco. Muda o
 * conjunto de keywords, passa o prazo ou o dono pede "Reler o cache de SERP":
 * lê de novo. É estado de apresentação (AGENTS §10) — nunca fonte de decisão
 * gravada; a troca relê o que precisa no servidor.
 */
export const SERP_SUBJECT_SESSION_PREFIX = "arquiteto:serp-mesmo-assunto:";
export const SERP_SUBJECT_SESSION_MAX_AGE_MS = 20 * 60 * 1000;

export function serializeSerpSubjectSession(input: { signature: string; savedAt: string; data: SerpSubjectReadResponse }): string {
  return JSON.stringify({ v: 1, signature: input.signature, savedAt: input.savedAt, data: input.data });
}

export function readSerpSubjectSession(raw: string | null | undefined, input: { signature: string; now: Date; maxAgeMs?: number }): { savedAt: string; data: SerpSubjectReadResponse } | null {
  if (!raw) return null;
  try {
    const lido = JSON.parse(raw) as { v?: unknown; signature?: unknown; savedAt?: unknown; data?: SerpSubjectReadResponse };
    if (lido?.v !== 1 || lido.signature !== input.signature || typeof lido.savedAt !== "string") return null;
    const quando = Date.parse(lido.savedAt);
    const idade = input.now.getTime() - quando;
    if (!Number.isFinite(quando) || idade < 0 || idade > (input.maxAgeMs ?? SERP_SUBJECT_SESSION_MAX_AGE_MS)) return null;
    const data = lido.data;
    if (!data || !Array.isArray(data.footprints) || !Array.isArray(data.withoutSerp) || !Array.isArray(data.missingLenses)) return null;
    return { savedAt: lido.savedAt, data };
  } catch {
    return null;
  }
}

/** O rótulo da leitura reaproveitada: nenhuma consulta nova ao banco. */
export function serpSubjectSessionLabel(savedAt: string, now: Date): string {
  const minutos = Math.max(0, Math.round((now.getTime() - Date.parse(savedAt)) / 60000));
  return `Leitura do cache reaproveitada desta sessão (feita há ${minutos} min): nenhuma consulta nova ao banco e nenhuma chamada paga. "Reler o cache de SERP" lê de novo.`;
}

/* ------------------------------- a evidência ------------------------------- */

export type SerpSubjectEvidencePage = {
  page: string;
  /** Lentes em que a página aparece no top 10 da âncora. */
  anchorLenses: string[];
  /** Lentes em que a página aparece no top 10 da outra keyword. */
  otherLenses: string[];
};

export type SerpSubjectEvidencePair = {
  keywordId: string;
  keyword: string;
  /** Onde a outra keyword está em relação ao artigo. */
  relation: "member" | "substitute" | "pair_elsewhere" | "blocked_by_dna" | "published_overlap";
  strength: SerpSubjectStrength;
  sharedPageCount: number;
  pages: SerpSubjectEvidencePage[];
  /** Lentes em que as duas trazem a mesma página no mesmo aparelho. */
  lensesAgreeing: string[];
  missingLensesAnchor: string[];
  missingLensesOther: string[];
  reason: string;
};

const RELACAO_ROTULO: Record<SerpSubjectEvidencePair["relation"], string> = {
  member: "no artigo",
  substitute: "substituta proposta",
  pair_elsewhere: "fora do artigo",
  blocked_by_dna: "DNA separa",
  published_overlap: "outro publicado",
};
export const SERP_SUBJECT_EVIDENCE_RELATION_LABELS: Readonly<Record<SerpSubjectEvidencePair["relation"], string>> = Object.freeze(RELACAO_ROTULO);

function lentesDaPagina(footprint: KeywordSerpFootprint | null): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const leitura of footprint?.lenses || []) {
    for (const url of leitura.urls || []) {
      const pagina = normalizeSerpPageUrl(url);
      if (!pagina) continue;
      const lentes = mapa.get(pagina) || [];
      if (!lentes.includes(leitura.lens)) lentes.push(leitura.lens);
      mapa.set(pagina, lentes);
    }
  }
  const ordem = new Map(SERP_SUBJECT_LENS_LABELS.map((lens, index) => [lens, index]));
  for (const lentes of mapa.values()) lentes.sort((left, right) => (ordem.get(left) ?? 99) - (ordem.get(right) ?? 99));
  return mapa;
}

/**
 * As páginas em comum entre a âncora e cada outra keyword, com as lentes em
 * que cada página aparece dos dois lados. É o que a tela mostra ao expandir.
 */
export function serpSubjectEvidencePairs(input: {
  index: SerpSubjectIndex | null;
  anchorKeywordId: string;
  others: ReadonlyArray<{ keywordId: string; keyword: string; relation: SerpSubjectEvidencePair["relation"] }>;
}): SerpSubjectEvidencePair[] {
  if (!input.index) return [];
  const ancora = lentesDaPagina(input.index.footprint(input.anchorKeywordId));
  const vistos = new Set<string>();
  const pares: SerpSubjectEvidencePair[] = [];
  for (const outra of input.others) {
    if (outra.keywordId === input.anchorKeywordId || vistos.has(outra.keywordId)) continue;
    vistos.add(outra.keywordId);
    const medida = input.index.overlap(input.anchorKeywordId, outra.keywordId);
    const daOutra = lentesDaPagina(input.index.footprint(outra.keywordId));
    pares.push({
      keywordId: outra.keywordId,
      keyword: outra.keyword,
      relation: outra.relation,
      strength: medida.strength,
      sharedPageCount: medida.strength === "unknown" ? 0 : medida.sharedPageCount,
      pages: medida.sharedPages.map(page => ({ page, anchorLenses: ancora.get(page) || [], otherLenses: daOutra.get(page) || [] })),
      lensesAgreeing: [...medida.lensesAgreeing],
      missingLensesAnchor: [...medida.missingLensesLeft],
      missingLensesOther: [...medida.missingLensesRight],
      reason: medida.reason,
    });
  }
  return pares;
}

/** Quem a tela mede contra a âncora: membros, substituta, pares, barradas e publicados vizinhos. */
export function evidenceTargetsOf(diagnosis: AnchorSerpDiagnosis): Array<{ keywordId: string; keyword: string; relation: SerpSubjectEvidencePair["relation"] }> {
  const alvos: Array<{ keywordId: string; keyword: string; relation: SerpSubjectEvidencePair["relation"] }> = [];
  if (diagnosis.swap?.substitute) alvos.push({ keywordId: diagnosis.swap.substitute.keywordId, keyword: diagnosis.swap.substitute.keyword, relation: "substitute" });
  for (const membro of diagnosis.members) {
    if (membro.basis === "anchor") continue;
    alvos.push({ keywordId: membro.keywordId, keyword: membro.keyword, relation: "member" });
  }
  for (const par of diagnosis.pairsElsewhere) alvos.push({ keywordId: par.keywordId, keyword: par.keyword, relation: "pair_elsewhere" });
  for (const barrada of diagnosis.blockedByDna) alvos.push({ keywordId: barrada.keywordId, keyword: barrada.keyword, relation: "blocked_by_dna" });
  for (const outra of diagnosis.publishedOverlaps) alvos.push({ keywordId: outra.keywordId, keyword: outra.keyword, relation: "published_overlap" });
  return alvos;
}

/* -------------------------------- a troca -------------------------------- */

/** A troca já aplicada que o ArticleDNA registra: principal publicada substituída por decisão humana. */
export type AppliedPublishedSwap = { previousKeywordId: string; selectedKeywordId: string; decidedAt: string | null; actorId: string | null };

export function appliedPublishedSwapOf(payload: Pick<ArticleDNA, "principalKeywordId" | "primaryKeywordDecision" | "keywordReferences"> | null | undefined): AppliedPublishedSwap | null {
  const decisao = payload?.primaryKeywordDecision;
  if (!payload || !decisao || decisao.status !== "confirmed") return null;
  const anterior = decisao.previousKeywordId;
  const escolhida = decisao.selectedKeywordId;
  if (!anterior || !escolhida || anterior === escolhida || escolhida !== payload.principalKeywordId) return null;
  if (!payload.keywordReferences.some(reference => reference.keywordId === anterior)) return null;
  return { previousKeywordId: anterior, selectedKeywordId: escolhida, decidedAt: decisao.decidedAt ?? null, actorId: decisao.actorId ?? null };
}

/**
 * A principal pela qual o ArticleDNA se reconcilia com o candidato da mesa.
 *
 * A formação ancora o artigo publicado na keyword publicada. Depois da troca
 * (D2.1), o ArticleDNA tem outra principal e a antiga como secundária — sem
 * isto, a reconciliação por principal o mandaria ao acervo como "outra
 * principal", e o artigo que acabou de receber a troca sumiria da mesa. A
 * identidade é a da página publicada: mesma URL, mesmo slug, mesmas keywords.
 */
export function reconciliationPrincipalKeywordId(
  payload: Pick<ArticleDNA, "principalKeywordId" | "primaryKeywordDecision" | "keywordReferences">,
  publishedKeywordIds: ReadonlySet<string>,
): string {
  const troca = appliedPublishedSwapOf(payload);
  return troca && publishedKeywordIds.has(troca.previousKeywordId) ? troca.previousKeywordId : String(payload.principalKeywordId);
}

export type PublishedSwapReadiness = { ready: true } | { ready: false; reason: string };

/**
 * A troca pode ser aplicada AGORA? Ela é gravada como nova versão do ArticleDNA
 * do artigo publicado, então precisa dele — e da substituta dentro dele.
 */
export function publishedSwapReadiness(input: {
  diagnosis: AnchorSerpDiagnosis;
  article: Pick<ArticleDNA, "principalKeywordId" | "keywordReferences" | "primaryKeywordDecision"> | null;
  currentPost: PublishedPrimaryPost;
}): PublishedSwapReadiness {
  const troca = input.diagnosis.swap;
  if (!troca || troca.state !== "proposed" || !troca.substitute) return { ready: false, reason: "Não há troca proposta para este artigo." };
  if (input.currentPost !== "free") {
    return { ready: false, reason: input.currentPost === "locked"
      ? "O Posto agora está \"Travado ao slug\": a principal fica e o artigo só recebe reforço."
      : "O Posto da principal não está declarado: declare \"Livre\" na Revisão Humana do Minerador antes de trocar." };
  }
  if (!input.article) {
    return { ready: false, reason: "A troca é gravada como nova versão do ArticleDNA deste artigo, que ainda não existe: conclua a formação dele (Concluir formação) e volte aqui." };
  }
  const aplicada = appliedPublishedSwapOf(input.article);
  if (aplicada && aplicada.previousKeywordId === troca.publishedKeywordId) {
    return { ready: false, reason: "A troca já foi aplicada neste artigo." };
  }
  if (input.article.principalKeywordId !== troca.publishedKeywordId) {
    return { ready: false, reason: "O ArticleDNA deste artigo já tem outra principal: recarregue a mesa antes de decidir." };
  }
  if (!input.article.keywordReferences.some(reference => reference.keywordId === troca.substitute!.keywordId)) {
    return { ready: false, reason: `"${troca.substitute.keyword}" ainda não está no ArticleDNA deste artigo: traga-a para o artigo e conclua a formação com ela dentro, depois aplique a troca.` };
  }
  return { ready: true };
}

/**
 * O ArticleDNA da NOVA versão depois da troca aceita.
 *
 * Muda só o que a troca muda: a nova principal assume, a antiga vira
 * secundária, os reforços narrativos ficam onde estavam. URL, slug,
 * canonical, marca e identidade publicada são copiados da versão atual, sem
 * exceção. O resultado passa pelo schema — se ele recusar (por exemplo, a
 * antiga é o Assunto do artigo e não pode ser secundária), nada é gravado.
 *
 * AS MÉTRICAS DA PRINCIPAL ACOMPANHAM A TROCA. `primaryKeywordMetrics`,
 * `volumeStrategy`, `keywordStrategy` e `kgrIdentity` descrevem a
 * principal; copiá-los da versão anterior faria o export, o Silo e a
 * consolidação lerem o volume da antiga (na troca de dentistas, 70 no lugar
 * de 210). O conjunto de keywords não muda — só os papéis —, então o volume
 * combinado fica; o da principal, o das secundárias e a identidade KGR são
 * refeitos. Métrica que não se conhece vira `null`, nunca o número da antiga.
 * A identidade KGR confirmada volta a candidata: o par principal–slug mudou e
 * pede confirmação humana de novo (o slug publicado continua o mesmo).
 */
export type PublishedSwapSubstituteMetrics = {
  volume: number | null;
  resultCount: number | null;
  kgrScore: number | null;
};

const numeroOuNulo = (valor: unknown) => typeof valor === "number" && Number.isFinite(valor) ? valor : null;
const somaConhecida = (valores: ReadonlyArray<number | null>) => {
  const conhecidos = valores.filter((valor): valor is number => typeof valor === "number" && Number.isFinite(valor));
  return conhecidos.length ? conhecidos.reduce((total, valor) => total + valor, 0) : null;
};
const statusKgr = (kgr: number | null): "qualified" | "not_qualified" | "unknown" =>
  kgr === null ? "unknown" : kgr >= 0 && kgr < 0.25 ? "qualified" : "not_qualified";
export function buildPublishedSwapArticlePayload(input: {
  current: ArticleDNA;
  outcome: Extract<PublishedPrimarySwapOutcome, { ok: true }>;
  actorId: string;
  decidedAt: string;
  substituteLabel: string;
  previousLabel: string;
  /** As métricas da nova principal, lidas do Minerador. Ausentes = desconhecidas (null), nunca as da antiga. */
  substituteMetrics?: Partial<PublishedSwapSubstituteMetrics> | null;
}): ArticleDNA {
  const { current, outcome } = input;
  const metricas: PublishedSwapSubstituteMetrics = {
    volume: numeroOuNulo(input.substituteMetrics?.volume),
    resultCount: numeroOuNulo(input.substituteMetrics?.resultCount),
    kgrScore: numeroOuNulo(input.substituteMetrics?.kgrScore),
  };
  if (!outcome.accepted) throw new Error("A troca recusada não gera versão nova: a principal continua a mesma.");
  const nova = outcome.principalKeywordId;
  const antiga = current.principalKeywordId;
  if (nova === antiga) throw new Error("A troca não muda a principal: nada a gravar.");
  if (!current.keywordReferences.some(reference => reference.keywordId === nova)) {
    throw new Error(`"${input.substituteLabel}" não está no ArticleDNA deste artigo.`);
  }
  const references = current.keywordReferences.map(reference => {
    if (reference.keywordId === nova) {
      return { ...reference, role: "principal" as const, keywordUrlRelation: "confirmed_primary" as const, humanConfirmed: true, classificationOrigin: "human" as const };
    }
    if (reference.keywordId === antiga) {
      return { ...reference, role: "secundaria" as const, keywordUrlRelation: "likely_support" as const };
    }
    return reference;
  });
  const principal = references.find(reference => reference.keywordId === nova)!;
  const outras = references.filter(reference => reference.keywordId !== nova);
  const ordenadas = [principal, ...outras];
  const secondaryKeywordIds = ordenadas.filter(reference => reference.role === "secundaria").map(reference => reference.keywordId);
  const narrativeReinforcementIds = ordenadas.filter(reference => reference.role === "reforco_narrativo").map(reference => reference.keywordId);
  const decidedAt = new Date(input.decidedAt).toISOString();
  const contexto = current.primaryKeywordPolicyContext
    ? {
      ...current.primaryKeywordPolicyContext,
      currentKeyword: input.substituteLabel,
      publishedOriginalKeyword: current.primaryKeywordPolicyContext.publishedOriginalKeyword || input.previousLabel,
      actorId: input.actorId,
      decidedAt,
      history: [
        ...(current.primaryKeywordPolicyContext.history || []),
        {
          previous: current.primaryKeywordPolicyContext.policy,
          next: current.primaryKeywordPolicyContext.policy,
          actorId: input.actorId,
          changedAt: decidedAt,
          reason: `Troca da principal (Posto Livre): "${input.substituteLabel}" assume; "${input.previousLabel}" fica como secundária. URL, slug e canonical preservados.`,
        },
      ],
    }
    : undefined;
  const alerta = `Principal publicada trocada por decisão humana (Posto Livre): "${input.substituteLabel}" no lugar de "${input.previousLabel}", que ficou como secundária. URL, slug e canonical preservados.`;

  // As métricas da principal acompanham a troca (ver o cabeçalho).
  const contribuicoes = current.volumeStrategy?.contributions.map(contribution => {
    if (contribution.keywordId === nova) {
      return { ...contribution, role: "principal" as const, contribution: "central" as const, volume: metricas.volume ?? contribution.volume, rationale: `Nova principal por decisão humana (Posto Livre), no lugar de "${input.previousLabel}".` };
    }
    if (contribution.keywordId === antiga) {
      return { ...contribution, role: "secundaria" as const, contribution: contribution.contribution === "central" ? "semantic_coverage" as const : contribution.contribution, rationale: `Principal publicada anterior; fica como secundária e mantém o slug publicado.` };
    }
    return contribution;
  });
  const volumePrincipal = metricas.volume ?? contribuicoes?.find(contribution => contribution.keywordId === nova)?.volume ?? null;
  const volumeStrategy = current.volumeStrategy && contribuicoes
    ? {
      ...current.volumeStrategy,
      primaryKeywordVolume: volumePrincipal,
      secondaryKeywordVolumeSum: somaConhecida(contribuicoes.filter(contribution => contribution.role === "secundaria").map(contribution => contribution.volume)),
      contributions: contribuicoes,
    }
    : undefined;
  const dnaIdDe = (keywordId: string) => current.volumeStrategy?.contributions.find(contribution => contribution.keywordId === keywordId)?.keywordDnaId
    || String(ordenadas.find(reference => reference.keywordId === keywordId)?.keywordDnaSnapshot?.keywordId || keywordId);
  const keywordStrategy = current.keywordStrategy
    ? {
      ...current.keywordStrategy,
      principalKeywordDnaId: dnaIdDe(nova),
      secondaryKeywordDnaIds: secondaryKeywordIds.slice(0, 5).map(dnaIdDe),
      principalVolume: volumePrincipal !== null && volumePrincipal >= 0 ? volumePrincipal : null,
      secondaryVolume: contribuicoes
        ? somaConhecida(contribuicoes.filter(contribution => contribution.role === "secundaria").map(contribution => contribution.volume))
        : null,
      principalKgrStatus: statusKgr(metricas.kgrScore),
      semanticNarrative: [
        `A principal "${input.substituteLabel}" define a intenção dominante; "${input.previousLabel}", principal publicada anterior, fica como secundária (URL, slug e canonical preservados).`,
        ...current.keywordStrategy.semanticNarrative.slice(1),
      ],
    }
    : undefined;
  const referenciaNova = ordenadas[0];
  const kgrAnterior = current.kgrIdentity;
  const kgrIdentity = kgrAnterior
    ? (() => {
      const { confirmedAt: _confirmedAt, confirmedBy: _confirmedBy, ...resto } = kgrAnterior;
      void _confirmedAt; void _confirmedBy;
      const reconfirmar = kgrAnterior.isKgrArticle;
      return {
        ...(reconfirmar ? resto : kgrAnterior),
        primaryKeywordId: nova,
        principalKeywordDnaId: dnaIdDe(nova),
        principalKeywordDnaVersionId: referenciaNova.keywordDnaVersionId,
        principalKeywordDnaContentHash: referenciaNova.keywordDnaContentHash,
        primaryVolume: metricas.volume,
        resultCount: metricas.resultCount !== null && metricas.resultCount >= 0 ? Math.round(metricas.resultCount) : null,
        kgrValue: metricas.kgrScore,
        ...(reconfirmar ? { bindingStatus: "candidate" as const, status: "candidate" as const } : {}),
      };
    })()
    : undefined;
  const primaryKeywordMetrics = current.primaryKeywordMetrics
    ? {
      volumeSearch: metricas.volume !== null && metricas.volume >= 0 ? metricas.volume : null,
      resultCount: metricas.resultCount !== null && metricas.resultCount >= 0 ? Math.round(metricas.resultCount) : null,
      kgrScore: metricas.kgrScore,
    }
    : undefined;

  return ArticleDNASchema.parse({
    ...current,
    ...(primaryKeywordMetrics ? { primaryKeywordMetrics } : {}),
    ...(volumeStrategy ? { volumeStrategy } : {}),
    ...(keywordStrategy ? { keywordStrategy } : {}),
    ...(kgrIdentity ? { kgrIdentity } : {}),
    principalKeywordId: nova,
    secondaryKeywordIds,
    narrativeReinforcementIds,
    keywordReferences: ordenadas,
    ...(contexto ? { primaryKeywordPolicyContext: contexto } : {}),
    primaryKeywordCandidates: outcome.articleDnaFields.primaryKeywordCandidates,
    primaryKeywordDecision: outcome.articleDnaFields.primaryKeywordDecision,
    alerts: current.alerts.includes(alerta) ? current.alerts : [...current.alerts, alerta],
  });
}

/* ------------------------- o Posto relido na hora de gravar ------------------------- */

/**
 * O Posto lido AGORA do Minerador, na hora de aplicar a troca.
 *
 * A mesa monta o Posto a partir da lista em memória. Se o dono travou o Posto
 * em outra aba e voltou sem recarregar, a memória ainda diz "Livre". Por isso
 * a troca relê `primary_keyword_policy` de cada publicada (só essa coluna,
 * pela marca ativa, sob RLS) antes de gravar, e só grava se o Posto relido
 * for "Livre" E igual ao que a mesa mostrou. Padrão não é declaração: sem
 * política gravada, o Posto é desconhecido e nada é aplicado.
 */
export function freshPublishedPostOf(row: { primary_keyword_policy?: unknown } | null | undefined): PublishedPrimaryPost {
  const politica = row?.primary_keyword_policy;
  return publishedPrimaryPostOf(typeof politica === "string" && politica.trim() ? politica : null);
}

export function freshPostRefusal(input: { shown: PublishedPrimaryPost; fresh: PublishedPrimaryPost | null }): string | null {
  if (input.fresh === null) return "o Posto não pôde ser relido agora; nada foi gravado — tente de novo";
  if (input.fresh !== "free") {
    return input.fresh === "locked"
      ? "o Posto foi travado (\"Travado ao slug\") depois que a mesa foi lida; a troca não foi aplicada — recarregue a mesa"
      : "o Posto não está mais declarado; declare \"Livre\" na Revisão Humana do Minerador antes de trocar";
  }
  if (input.shown !== "free") return "o Posto mudou depois que a mesa foi lida; recarregue a mesa antes de decidir";
  return null;
}

/* ----------------------- "Manter": estado de apresentação ----------------------- */

/**
 * "Manter" não grava versão (nova versão só com mudança real, AGENTS §9). A
 * escolha fica neste navegador, por marca, como estado de apresentação: a
 * sugestão sai do caminho e volta se a substituta mudar. Nunca é autoridade.
 */
export const KEPT_SWAPS_STORAGE_PREFIX = "arquiteto:troca-principal-mantida:";
export const keptSwapKey = (publishedKeywordId: string, substituteKeywordId: string) => `${publishedKeywordId}>${substituteKeywordId}`;

export function readKeptSwaps(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const lido = JSON.parse(raw);
    return new Set(Array.isArray(lido) ? lido.filter((item): item is string => typeof item === "string" && item.includes(">")).slice(0, 500) : []);
  } catch {
    return new Set();
  }
}

export function serializeKeptSwaps(kept: ReadonlySet<string>): string {
  return JSON.stringify([...kept].sort().slice(0, 500));
}

/* ------------------------- "Buscar reforço" já rodou? ------------------------- */

export type ReinforcementSearchRecordLike = {
  savedAt: string;
  config: { phrase: string; destinationUrl: string; subjectKeywordId: string | null };
  result: { candidates: ReadonlyArray<{ googleAds: { averageMonthlySearches: number | null } | null }> };
};

const normalizarFrase = (value: string | null | undefined) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * A última "Buscar reforço" de cada âncora, lida da lista local da Pesquisa
 * por Assunto (só leitura; nada é apagado). Assunto casa pelo id; publicado,
 * pela frase e pela URL do artigo como página de destino.
 */
export function reinforcementSearchOutcomes(input: {
  records: readonly ReinforcementSearchRecordLike[];
  anchors: ReadonlyArray<{ kind: "published" | "subject"; anchorKeywordId: string; phrase: string; destinationUrl: string | null }>;
}): Map<string, ReinforcementSearchOutcome> {
  const resultado = new Map<string, ReinforcementSearchOutcome & { savedAtMs: number }>();
  for (const ancora of input.anchors) {
    const frase = normalizarFrase(ancora.phrase);
    const destino = normalizeSerpPageUrl(ancora.destinationUrl);
    for (const registro of input.records) {
      const casa = ancora.kind === "subject"
        ? registro.config.subjectKeywordId === ancora.anchorKeywordId
        : Boolean(destino) && normalizeSerpPageUrl(registro.config.destinationUrl) === destino && normalizarFrase(registro.config.phrase) === frase;
      if (!casa) continue;
      const quando = Date.parse(registro.savedAt);
      if (!Number.isFinite(quando)) continue;
      const anterior = resultado.get(ancora.anchorKeywordId);
      if (anterior && anterior.savedAtMs >= quando) continue;
      const candidatas = registro.result.candidates || [];
      resultado.set(ancora.anchorKeywordId, {
        searchedAt: new Date(quando).toISOString(),
        candidateCount: candidatas.length,
        candidatesWithDemand: candidatas.filter(item => (item.googleAds?.averageMonthlySearches ?? 0) > 0).length,
        savedAtMs: quando,
      });
    }
  }
  return new Map([...resultado.entries()].map(([id, item]) => [id, { searchedAt: item.searchedAt, candidateCount: item.candidateCount, candidatesWithDemand: item.candidatesWithDemand }]));
}

/* ------------------------------- o cartão ------------------------------- */

export type SerpSubjectCardState = SerpSubjectDilemmaState | "swap_applied" | "swap_kept";
export type SerpSubjectTone = "success" | "info" | "warning" | "neutral";

export const SERP_SUBJECT_CARD_STATE_LABELS: Readonly<Record<SerpSubjectCardState, string>> = Object.freeze({
  ...SERP_SUBJECT_DILEMMA_LABELS,
  swap_applied: "Troca aplicada",
  swap_kept: "Principal mantida",
});

const TONS: Record<SerpSubjectCardState, SerpSubjectTone> = {
  ...SERP_SUBJECT_DILEMMA_TONES,
  swap_applied: "success",
  swap_kept: "neutral",
};

/** O tom no vocabulário do sistema visual: tokens, nunca cor crua. */
export const SERP_SUBJECT_TONE_CLASSES: Readonly<Record<SerpSubjectTone, { badge: string; accent: string }>> = Object.freeze({
  success: { badge: "border-success/40 bg-success/10 text-success", accent: "border-l-success/60" },
  info: { badge: "border-context-accent/40 bg-context-accent/10 text-context-accent", accent: "border-l-context-accent/60" },
  warning: { badge: "border-warning/40 bg-warning/10 text-warning", accent: "border-l-warning/60" },
  neutral: { badge: "border-divider bg-surface text-text-muted", accent: "border-l-divider" },
});

export type SerpSubjectCardAction =
  | { kind: "apply_swap"; label: string; disabledReason: string | null }
  | { kind: "keep_swap"; label: string }
  | { kind: "review_swap"; label: string }
  | { kind: "bring_pair"; label: string; proposals: AnchorSerpDiagnosis["crossSilo"] }
  | { kind: "search_reinforcement"; label: string; href: string | null }
  | { kind: "collect_serp"; label: string }
  | { kind: "open_minerador"; label: string; href: string | null }
  /** Abre na mesa o artigo que ficou com o par (ou este, para liberar vaga): a decisão é feita lá, com "Mover para…". */
  | { kind: "open_article"; label: string; siloRef: string; principalKeywordId: string };

export type SerpSubjectCardView = {
  key: string;
  kind: AnchorSerpDiagnosis["kind"];
  kindLabel: string;
  anchorKeywordId: string;
  anchorLabel: string;
  siloRef: string;
  siloLabel: string;
  state: SerpSubjectCardState;
  stateLabel: string;
  tone: SerpSubjectTone;
  /** A frase principal: curta e acionável. */
  headline: string;
  /** Uma linha de contexto (Posto, URL, o par), quando ajuda a decidir. */
  subline: string | null;
  actions: SerpSubjectCardAction[];
  /** O detalhe, só ao expandir. */
  details: string[];
  serpEvidence: AnchorSerpDiagnosis["serpEvidence"];
};

export type SerpSubjectCardContext = {
  /** O Posto AGORA (Vínculo do Minerador), só para publicado. */
  post?: PublishedPrimaryPost;
  /** URL da página publicada (ou página de destino do Assunto). */
  pageUrl?: string | null;
  /** Troca já aplicada no ArticleDNA deste artigo. */
  appliedSwap?: AppliedPublishedSwap | null;
  /** O dono escolheu "Manter" para esta substituta (estado local). */
  kept?: boolean;
  /** Pode aplicar a troca agora? */
  swapReadiness?: PublishedSwapReadiness;
  /** A busca de reforço desta âncora, quando já rodou. */
  reinforcementSearch?: ReinforcementSearchOutcome | null;
  /** Link da Revisão Humana do Minerador (Posto, intenção). */
  mineradorHref?: string | null;
  /** O link de "Buscar reforço" desta âncora, quando o domínio não o trouxe na ação. */
  reinforcementHref?: string | null;
  nameOf?: (keywordId: string) => string;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const volumeBr = (valor: number) => valor.toLocaleString("pt-BR");
const cap = (texto: string) => texto ? `${texto[0].toUpperCase()}${texto.slice(1)}` : texto;

export const SWAP_APPLY_ACTION_LABEL = "Aplicar troca";
export const SWAP_KEEP_ACTION_LABEL = "Manter";
export const SWAP_REVIEW_ACTION_LABEL = "Rever a sugestão";
export const BRING_PAIR_ACTION_LABEL = "Trazer para este artigo";
export const COLLECT_SERP_ACTION_LABEL = "Coletar SERP (pago, com plano)";
export const COLLECT_SERP_AGAIN_ACTION_LABEL = "Coletar de novo (pago, com plano)";

/**
 * O cartão de um publicado ou Assunto: o estado do domínio dito como o dono
 * pediu, com os botões do dilema e o detalhe para expandir.
 */
export function serpSubjectCardView(diagnosis: AnchorSerpDiagnosis, context: SerpSubjectCardContext = {}): SerpSubjectCardView {
  const nome = context.nameOf || ((keywordId: string) => keywordId);
  const publicado = diagnosis.kind === "published";
  const buscarDoDominio = diagnosis.actions.find(action => action.kind === "search_reinforcement");
  const buscar: SerpSubjectCardAction = { kind: "search_reinforcement", label: REINFORCEMENT_SEARCH_ACTION_LABEL, href: buscarDoDominio?.search?.href ?? context.reinforcementHref ?? null };
  const swap = diagnosis.swap;
  const post = context.post ?? swap?.post ?? "unknown";
  const partesSub: string[] = [];
  if (publicado) {
    partesSub.push(post === "unknown"
      ? "Posto: não declarado (o Minerador mostra \"Travado ao slug\" por padrão, mas ninguém declarou)"
      : `Posto: ${PUBLISHED_PRIMARY_POST_LABELS[post]}`);
  }
  if (context.pageUrl) partesSub.push(context.pageUrl);

  let state: SerpSubjectCardState = diagnosis.state;
  let headline: string;
  const actions: SerpSubjectCardAction[] = [];
  const membrosSerp = diagnosis.members.filter(item => item.basis === "serp").length;
  const membrosVizinhanca = diagnosis.members.filter(item => item.basis === "serp_and_words").length;
  const membrosPalavras = diagnosis.members.filter(item => item.basis !== "anchor" && item.basis !== "serp" && item.basis !== "serp_and_words").length;
  const abrirArtigo = (action: AnchorSerpDiagnosis["actions"][number] | undefined): SerpSubjectCardAction | null => action?.kind === "open_article" && action.article
    ? { kind: "open_article", label: action.label, siloRef: action.article.siloRef, principalKeywordId: action.article.principalKeywordId }
    : null;

  const aplicada = context.appliedSwap && swap && context.appliedSwap.previousKeywordId === swap.publishedKeywordId ? context.appliedSwap : null;
  if (publicado && aplicada) {
    state = "swap_applied";
    headline = `Troca aplicada: "${nome(aplicada.selectedKeywordId)}" é a principal e "${nome(aplicada.previousKeywordId)}" ficou como secundária. URL e slug continuam.`;
  } else if (diagnosis.state === "swap_proposed" && swap?.substitute && context.kept) {
    state = "swap_kept";
    headline = `Principal mantida por você: "${swap.publishedKeyword}". A sugestão era "${swap.substitute.keyword}" (volume ${volumeBr(swap.substitute.volume)}, ${swap.substitute.sharedPageCount} páginas em comum).`;
    actions.push({ kind: "review_swap", label: SWAP_REVIEW_ACTION_LABEL });
  } else if (diagnosis.state === "swap_proposed" && swap?.substitute) {
    headline = `Troca da principal sugerida: "${swap.substitute.keyword}" (volume ${volumeBr(swap.substitute.volume)}, ${swap.substitute.sharedPageCount} páginas em comum). URL e slug continuam.`;
    partesSub.push(`"${swap.publishedKeyword}" vira secundária`);
    const prontidao = context.swapReadiness ?? { ready: false as const, reason: "Não foi possível conferir o ArticleDNA deste artigo." };
    actions.push({ kind: "apply_swap", label: SWAP_APPLY_ACTION_LABEL, disabledReason: prontidao.ready ? null : prontidao.reason });
    actions.push({ kind: "keep_swap", label: SWAP_KEEP_ACTION_LABEL });
  } else if (diagnosis.state === "reinforced") {
    const total = diagnosis.members.filter(item => item.basis !== "anchor").length;
    const alvo = publicado ? "Reforçado" : "Assunto sustentado";
    const partes = [
      membrosSerp ? `${plural(membrosSerp, "keyword que divide", "keywords que dividem")} a SERP` : "",
      membrosVizinhanca ? `${membrosVizinhanca} na vizinhança do Google (2 páginas, com palavras em comum)` : "",
      membrosPalavras ? `${membrosPalavras} só por palavras` : "",
    ].filter(Boolean);
    const juntas = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}` : partes[0] ?? "";
    headline = membrosSerp || membrosVizinhanca
      ? `${alvo} com ${juntas}`
      : `${alvo} com ${plural(total, "keyword", "keywords")} só por palavras: falta SERP no cache para confirmar`;
    headline += diagnosis.slotsLeft ? `. Cabem mais ${diagnosis.slotsLeft}.` : ". No teto de 6.";
    // Posto Livre sem substituta: a principal está ali PARA SER TROCADA — vem no título, com a ação.
    const livreSemSubstituta = publicado && post === "free" && swap?.state === "no_candidate";
    const fora = diagnosis.substituteOutsideFullArticle ?? null;
    if (livreSemSubstituta && fora) {
      headline += ` Posto Livre: a melhor substituta, "${fora.keyword}" (volume ${volumeBr(fora.volume)}), ficou fora porque o artigo está cheio — tire uma keyword para ela entrar.`;
      const abrir = abrirArtigo(diagnosis.actions.find(action => action.kind === "open_article"));
      if (abrir) actions.push(abrir);
    } else if (livreSemSubstituta) {
      headline += " Posto Livre, mas nenhuma keyword do lote serve de substituta: busque uma com volume que divida a SERP.";
    }
    if (diagnosis.crossSilo.length) actions.push({ kind: "bring_pair", label: BRING_PAIR_ACTION_LABEL, proposals: diagnosis.crossSilo });
    if ((diagnosis.slotsLeft && !diagnosis.pairsElsewhere.length && !diagnosis.crossSilo.length) || (livreSemSubstituta && !fora)) actions.push(buscar);
  } else if (diagnosis.state === "pair_in_other_silo") {
    const proposta = diagnosis.crossSilo[0];
    const par = diagnosis.pairsElsewhere.find(item => item.siloRef && item.siloRef !== diagnosis.siloRef);
    const siloDoPar = proposta?.fromSiloLabel || par?.siloLabel || "outro Silo";
    const keywordDoPar = proposta?.keyword || par?.keyword || "";
    const paginas = proposta?.sharedPageCount ?? par?.sharedPageCount ?? null;
    const mais = Math.max(diagnosis.crossSilo.length, diagnosis.pairsElsewhere.filter(item => item.siloRef && item.siloRef !== diagnosis.siloRef).length) - 1;
    if (diagnosis.crossSilo.length) {
      headline = `O par está no Silo "${siloDoPar}": trazer?`;
      actions.push({ kind: "bring_pair", label: BRING_PAIR_ACTION_LABEL, proposals: diagnosis.crossSilo });
    } else {
      headline = `O par está no Silo "${siloDoPar}"${par?.inAnchorLabel ? `, já no artigo "${par.inAnchorLabel}"` : ""}. Mover de Silo é decisão sua, na aba Silos.`;
    }
    if (keywordDoPar) partesSub.push(`"${keywordDoPar}"${paginas ? ` · ${paginas} páginas em comum` : ""}${mais > 0 ? ` · e mais ${mais}` : ""}`);
  } else if (diagnosis.state === "pair_in_other_article") {
    const noSilo = diagnosis.pairsElsewhere.filter(item => !(item.siloRef && item.siloRef !== diagnosis.siloRef)
      && (item.where === "other_anchor" || item.where === "other_article" || item.where === "leftover_same_silo"));
    const par = noSilo[0];
    const alvoDoPar = publicado ? "este artigo" : "este Assunto";
    if (par?.inAnchorLabel) {
      headline = `O Google junta "${par.keyword}" a ${alvoDoPar}, mas ela já está em "${par.inAnchorLabel}". Para onde ela vai é decisão sua.`;
      partesSub.push(`${par.sharedPageCount} páginas em comum com este${par.sharedWithHolder !== null && par.sharedWithHolder !== undefined ? `, ${par.sharedWithHolder} com aquele` : ""}${noSilo.length > 1 ? ` · e mais ${noSilo.length - 1}` : ""}`);
      if (par.inAnchorPublished && publicado) partesSub.push("os dois publicados disputam o mesmo assunto (possível canibalização)");
    } else {
      headline = `O Google junta "${par?.keyword ?? ""}" a ${alvoDoPar}, mas ela ficou fora de artigo por outra regra. Decida você.`;
    }
    const abrir = abrirArtigo(diagnosis.actions.find(action => action.kind === "open_article"));
    if (abrir) actions.push(abrir);
    actions.push(buscar);
  } else if (diagnosis.state === "pair_blocked_by_dna") {
    const primeira = diagnosis.blockedByDna[0];
    headline = `O Google junta "${primeira.keyword}" a ${publicado ? "este artigo" : "este Assunto"} (${primeira.sharedPageCount} páginas em comum), mas o DNA separa. Nada entra sozinho.`;
    if (diagnosis.blockedByDna.length > 1) partesSub.push(`e mais ${diagnosis.blockedByDna.length - 1} na mesma situação`);
    actions.push({ kind: "open_minerador", label: "Revisar a intenção no Minerador", href: context.mineradorHref ?? null }, buscar);
  } else if (diagnosis.state === "pair_without_volume") {
    const pares = diagnosis.pairsElsewhere.slice(0, 2).map(item => `"${item.keyword}"`).join(", ");
    headline = `Há par no Google (${pares}), mas sem Volume validado para ser a principal.`;
    actions.push({ kind: "open_minerador", label: "Medir volume no Minerador", href: context.mineradorHref ?? null }, buscar);
  } else if (diagnosis.state === "serp_missing") {
    const lacuna = diagnosis.serpGap ?? null;
    if (lacuna?.kind === "stale") {
      headline = `A SERP de "${diagnosis.anchorLabel}" venceu${lacuna.ageDays !== null ? ` (coletada há ${lacuna.ageDays} dias; validade de 30)` : " (validade de 30 dias)"}: sem ela, a mesa não mede o mesmo assunto e a formação volta às palavras.`;
      actions.push({ kind: "collect_serp", label: COLLECT_SERP_AGAIN_ACTION_LABEL }, buscar);
    } else {
      headline = lacuna?.kind === "never"
        ? `"${diagnosis.anchorLabel}" nunca teve a SERP coletada: não dá para medir o que o Google trata como o mesmo assunto.`
        : `Sem SERP de "${diagnosis.anchorLabel}" no cache: não dá para medir o que o Google trata como o mesmo assunto.`;
      actions.push({ kind: "collect_serp", label: COLLECT_SERP_ACTION_LABEL }, buscar);
    }
  } else if (diagnosis.state === "no_demand") {
    const busca = context.reinforcementSearch;
    headline = `${cap(NO_DEMAND_MESSAGE)}.`;
    partesSub.push(busca
      ? `A busca de reforço de ${new Date(busca.searchedAt).toLocaleDateString("pt-BR")} trouxe ${plural(busca.candidateCount, "candidata", "candidatas")}, nenhuma com volume. A decisão é sua.`
      : "A busca de reforço não achou keyword com volume. A decisão é sua.");
    actions.push({ ...buscar, label: "Buscar reforço de novo" } as SerpSubjectCardAction);
  } else {
    headline = `${cap(NO_SERP_PAIR_IN_BATCH_MESSAGE)}.`;
    partesSub.push(publicado ? "Busque pelo tema com a URL do artigo como página de destino." : "Busque pelo tema com a página de destino do Assunto.");
    actions.push(buscar);
  }
  if (publicado && post === "unknown" && state !== "swap_applied") {
    actions.push({ kind: "open_minerador", label: "Declarar o Posto no Minerador", href: context.mineradorHref ?? null });
  }

  const details = [...diagnosis.details];
  if (state === "swap_proposed" && swap) {
    for (const alternativa of swap.alternatives.slice(0, 3)) details.push(`Também qualifica: "${alternativa.keyword}" (volume ${volumeBr(alternativa.volume)}, ${alternativa.sharedPageCount} páginas em comum).`);
  }
  if (publicado && swap?.state === "no_candidate") {
    for (const recusa of swap.rejected.slice(0, 4)) details.push(`"${recusa.keyword}" não serve de substituta: ${recusa.reason}`);
  }
  if (publicado && post === "unknown" && diagnosis.swapIfDeclaredFree?.substitute && state !== "swap_applied") {
    const hipotese = diagnosis.swapIfDeclaredFree.substitute;
    partesSub.push(`se declarar "Livre": troca por "${hipotese.keyword}" (volume ${volumeBr(hipotese.volume)})`);
  }

  return {
    key: `${diagnosis.kind}:${diagnosis.anchorKeywordId}`,
    kind: diagnosis.kind,
    kindLabel: publicado ? "Artigo publicado" : "Assunto",
    anchorKeywordId: diagnosis.anchorKeywordId,
    anchorLabel: diagnosis.anchorLabel,
    siloRef: diagnosis.siloRef,
    siloLabel: diagnosis.siloLabel,
    state,
    stateLabel: SERP_SUBJECT_CARD_STATE_LABELS[state],
    tone: TONS[state],
    headline,
    subline: partesSub.length ? partesSub.join(" · ") : null,
    actions,
    details: [...new Set(details)],
    serpEvidence: diagnosis.serpEvidence,
  };
}

/* -------------------------------- o resumo -------------------------------- */

export type SerpSubjectPanelSummary = {
  total: number;
  published: number;
  subjects: number;
  reinforced: number;
  swapsSuggested: number;
  swapsApplied: number;
  swapsKept: number;
  pairsInOtherSilos: number;
  pairsInOtherArticles: number;
  withoutPair: number;
  withoutDemand: number;
  withoutSerp: number;
  blockedByDna: number;
  pairWithoutVolume: number;
  headline: string;
};

/** O resumo do lote, na ordem das perguntas do dono. */
export function summarizeSerpSubjectCards(cards: readonly SerpSubjectCardView[]): SerpSubjectPanelSummary {
  const conta = (state: SerpSubjectCardState) => cards.filter(card => card.state === state).length;
  const published = cards.filter(card => card.kind === "published").length;
  const resumo = {
    total: cards.length,
    published,
    subjects: cards.length - published,
    reinforced: conta("reinforced"),
    swapsSuggested: conta("swap_proposed"),
    swapsApplied: conta("swap_applied"),
    swapsKept: conta("swap_kept"),
    pairsInOtherSilos: conta("pair_in_other_silo"),
    pairsInOtherArticles: conta("pair_in_other_article"),
    withoutPair: conta("no_pair_in_batch"),
    withoutDemand: conta("no_demand"),
    withoutSerp: conta("serp_missing"),
    blockedByDna: conta("pair_blocked_by_dna"),
    pairWithoutVolume: conta("pair_without_volume"),
  };
  const partes = [
    resumo.reinforced ? plural(resumo.reinforced, "reforçado", "reforçados") : "",
    resumo.swapsSuggested ? plural(resumo.swapsSuggested, "troca sugerida", "trocas sugeridas") : "",
    resumo.pairsInOtherSilos ? plural(resumo.pairsInOtherSilos, "par em outro Silo", "pares em outros Silos") : "",
    resumo.pairsInOtherArticles ? plural(resumo.pairsInOtherArticles, "par em outro artigo", "pares em outros artigos") : "",
    resumo.withoutPair ? `${resumo.withoutPair} sem par no lote` : "",
    resumo.withoutDemand ? `${resumo.withoutDemand} sem demanda no Google` : "",
  ].filter(Boolean);
  return {
    ...resumo,
    headline: cards.length
      ? `${plural(published, "publicado", "publicados")} e ${plural(resumo.subjects, "Assunto", "Assuntos")}${partes.length ? `: ${partes.join(", ")}.` : "."}`
      : "Nenhum publicado nem Assunto neste lote.",
  };
}

/* ------------------------------ a ação em grupo ------------------------------ */

export type SerpSubjectBatchChoice = {
  id: string;
  kind: "swap" | "cross_silo";
  anchorKeywordId: string;
  label: string;
  /** Por que não dá para escolher agora. `null` = pode. */
  disabledReason: string | null;
  crossSilo?: { keywordId: string; keyword: string; toSiloRef: string; toSiloLabel: string; fromSiloLabel: string };
};

/** O que o dono pode aceitar de uma vez: trocas propostas e reforços de outro Silo. */
export function serpSubjectBatchChoices(input: {
  diagnoses: readonly AnchorSerpDiagnosis[];
  cards: ReadonlyMap<string, SerpSubjectCardView>;
}): SerpSubjectBatchChoice[] {
  const escolhas: SerpSubjectBatchChoice[] = [];
  const movidas = new Set<string>();
  for (const diagnostico of input.diagnoses) {
    const cartao = input.cards.get(`${diagnostico.kind}:${diagnostico.anchorKeywordId}`);
    if (!cartao) continue;
    if (cartao.state === "swap_proposed" && diagnostico.swap?.substitute) {
      const aplicar = cartao.actions.find(action => action.kind === "apply_swap");
      escolhas.push({
        id: `swap:${diagnostico.anchorKeywordId}`,
        kind: "swap",
        anchorKeywordId: diagnostico.anchorKeywordId,
        label: `Trocar a principal de "${diagnostico.anchorLabel}" por "${diagnostico.swap.substitute.keyword}" (URL e slug continuam)`,
        disabledReason: aplicar && aplicar.kind === "apply_swap" ? aplicar.disabledReason : "Troca indisponível.",
      });
    }
    for (const proposta of diagnostico.crossSilo) {
      if (movidas.has(proposta.keywordId)) continue;
      movidas.add(proposta.keywordId);
      escolhas.push({
        id: `cross:${proposta.keywordId}`,
        kind: "cross_silo",
        anchorKeywordId: diagnostico.anchorKeywordId,
        label: `Trazer "${proposta.keyword}" do Silo "${proposta.fromSiloLabel}" para "${proposta.toSiloLabel}" (reforça "${diagnostico.anchorLabel}")`,
        disabledReason: null,
        crossSilo: { keywordId: proposta.keywordId, keyword: proposta.keyword, toSiloRef: proposta.toSiloRef, toSiloLabel: proposta.toSiloLabel, fromSiloLabel: proposta.fromSiloLabel },
      });
    }
  }
  return escolhas;
}

/** O desfecho da ação em grupo, só com o que a releitura confirmou. */
export function describeSerpSubjectBatchOutcome(input: {
  swapsConfirmed: number;
  swapsRefused: ReadonlyArray<{ label: string; reason: string }>;
  movedConfirmed: number;
  movedUnchanged: number;
  movedRefused: number;
}): { tone: "success" | "warning" | "error"; message: string } {
  const partes: string[] = [];
  if (input.swapsConfirmed || input.swapsRefused.length) {
    partes.push(`${plural(input.swapsConfirmed, "troca confirmada", "trocas confirmadas")} na releitura (nova versão do ArticleDNA, em revisão)`);
  }
  if (input.movedConfirmed || input.movedUnchanged || input.movedRefused) {
    partes.push(`${plural(input.movedConfirmed, "keyword trazida", "keywords trazidas")} de outro Silo${input.movedUnchanged ? `, ${input.movedUnchanged} já estavam no destino` : ""}${input.movedRefused ? `, ${input.movedRefused} recusada(s)` : ""}`);
  }
  const recusas = input.swapsRefused.slice(0, 3).map(item => `${item.label}: ${item.reason}`);
  const falhou = input.swapsRefused.length > 0 || input.movedRefused > 0;
  const nada = !input.swapsConfirmed && !input.movedConfirmed && !input.movedUnchanged;
  return {
    tone: nada && falhou ? "error" : falhou ? "warning" : "success",
    message: `${partes.join(" · ") || "Nada foi aplicado"}.${recusas.length ? ` Não aplicado: ${recusas.join(" · ")}${input.swapsRefused.length > 3 ? " · …" : ""}.` : ""} URL, slug e canonical dos publicados não mudaram.`,
  };
}
