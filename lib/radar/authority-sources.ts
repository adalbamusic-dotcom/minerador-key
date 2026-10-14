/**
 * ===== 2026-10-14 · FONTES EXTERNAS DE AUTORIDADE — CANDIDATAS, CASAMENTO E LEITURA (FASE A) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §16.2.
 *
 * DE ONDE VEM CADA CANDIDATA (nenhuma URL inventada, nada pago):
 *   (a) os links externos que as páginas concorrentes JÁ citam (as extrações gravadas);
 *   (b) os endereços da SERP JÁ coletada (orgânicos, fontes do resumo de IA, fontes de
 *       "Pessoas também perguntam" e do painel de entidade) que pertencem a um domínio
 *       da lista de autoridades da Marca;
 *   (c) só para a Wikipédia (quando ela está na lista): o verbete da entidade central do
 *       artigo, montado pela regra fixa do site (`/wiki/Entidade`) — ele só vale depois
 *       de aberto e conferido (o título precisa ser a entidade; desambiguação recusa).
 *
 * O CASAMENTO AFIRMAÇÃO ↔ TRECHO é por raízes de palavras, sem IA: a afirmação é o
 * conceito que o mercado repete (`claim-evidence.ts`), e o trecho é o parágrafo da
 * fonte que contém a maior parte dessas raízes. Sem trecho que trate de uma
 * afirmação, a fonte não sustenta nada e vira falha nomeada ("não sustenta").
 *
 * Módulo puro: sem fetch, sem banco, sem relógio. Quem abre as páginas é
 * `authority-source-verification.ts` (servidor).
 */
import {
  RADAR_AUTHORITY_KIND_LABEL,
  RADAR_AUTHORITY_ORIGIN_LABEL,
  RADAR_DEFAULT_AUTHORITY_DOMAINS,
  radarAuthorityEntryFor,
  radarAuthorityHost,
  radarHostBelongsTo,
  type RadarAuthorityDomain,
  type RadarAuthorityKind,
  type RadarAuthorityOrigin,
  type RadarAuthoritySourcesRecord,
} from "./authority-sources-contract.ts";
import { radarLinkObservations } from "./link-and-source-research.ts";
import { classifyRadarSourceAuthority, radarSourceCanSupportFact } from "./source-authority.ts";
import { radarSemanticStems } from "./semantic-concept-model.ts";
import { radarNormalizedUrl } from "./research-reference.ts";
import type { RadarEvidenceClaim } from "./claim-evidence.ts";
import type { RadarExtractionPage } from "./analysis-contracts.ts";

/* ================================ candidatas ================================ */

export type RadarAuthorityCandidate = {
  url: string;
  host: string;
  /** O endereço final precisa pertencer a este domínio (redirecionar para fora recusa). */
  expectedDomain: string;
  entity: string;
  kind: RadarAuthorityKind;
  origin: RadarAuthorityOrigin;
  /** Quantas páginas concorrentes lidas citam este endereço. */
  citedByCompetitors: number;
  /** As afirmações cujas seções, nos concorrentes, citam este domínio. */
  claimIds: string[];
  /** Só no verbete montado pela entidade: o nome que o título precisa ter. */
  expectedEntity: string | null;
  /** Menor primeiro. */
  priority: number;
};

/** O que a candidatura lê da SERP já coletada (só endereços; nada é recoletado). */
export type RadarAuthoritySerpInput = {
  organic?: ReadonlyArray<{ url: string }>;
  aiOverview?: ReadonlyArray<{ url: string | null }>;
  peopleAlsoAsk?: ReadonlyArray<{ sourceUrl: string | null }>;
  knowledgeGraphSources?: ReadonlyArray<{ url: string }>;
};

/** A SERP gravada, na forma que a candidatura lê (aceita o snapshot do Radar). */
export function radarAuthoritySerpInputOf(research: {
  organicResults?: ReadonlyArray<{ url: string }>;
  peopleAlsoAsk?: ReadonlyArray<{ sourceUrl: string | null }>;
  knowledgeGraph?: { sources?: ReadonlyArray<{ url: string }> } | null;
  serpFeatures?: { aiOverview?: { references?: ReadonlyArray<{ url: string | null }> } } | null;
} | null | undefined): RadarAuthoritySerpInput | null {
  if (!research) return null;
  return {
    organic: research.organicResults || [],
    aiOverview: research.serpFeatures?.aiOverview?.references || [],
    peopleAlsoAsk: research.peopleAlsoAsk || [],
    knowledgeGraphSources: research.knowledgeGraph?.sources || [],
  };
}

const PRIORIDADE_DA_ORIGEM: Record<RadarAuthorityOrigin, number> = {
  concorrente: 1,
  resumo_ia: 2,
  pessoas_perguntam: 2,
  painel_entidade: 2,
  serp_organico: 3,
  entidade_wikipedia: 4,
};

/** O verbete da Wikipédia em português pela regra fixa do site. Nunca uma URL "sugerida". */
export function radarWikipediaArticleUrl(entity: string): string | null {
  const nome = entity.trim().replace(/\s+/g, " ");
  if (!nome || nome.split(" ").length > 4) return null;
  const titulo = `${nome.charAt(0).toLocaleUpperCase("pt-BR")}${nome.slice(1)}`.replace(/ /g, "_");
  return `https://pt.wikipedia.org/wiki/${encodeURIComponent(titulo).replace(/%2F/g, "/")}`;
}

/**
 * AS CANDIDATAS, EM ORDEM DE PRIORIDADE — sem teto aqui (o teto é da conferência).
 *
 * Primeiro o que está na lista de autoridades (e, dentro dela, o que sustenta
 * afirmação sensível); depois o que o mercado cita fora da lista, só quando a
 * natureza da fonte é factual (governo, ciência, academia) ou vários concorrentes a
 * citam. Rede social, marketplace e página comercial nunca entram.
 */
export function buildRadarAuthorityCandidates(input: {
  pages: readonly RadarExtractionPage[];
  serp?: RadarAuthoritySerpInput | null;
  list: readonly RadarAuthorityDomain[];
  claims?: readonly RadarEvidenceClaim[];
  centralEntities?: readonly string[];
}): RadarAuthorityCandidate[] {
  const claims = input.claims || [];
  const sensiveis = new Set(claims.filter(claim => claim.ymyl.relevance === "MATERIAL" || claim.ymyl.relevance === "HIGH").map(claim => claim.claimId));
  const afirmacoesDoDominio = (host: string) => claims
    .filter(claim => claim.observedSourceDomains.some(dominio => radarHostBelongsTo(radarAuthorityHost(`https://${dominio}/`), host) || radarHostBelongsTo(host, radarAuthorityHost(`https://${dominio}/`))))
    .map(claim => claim.claimId);

  const porUrl = new Map<string, RadarAuthorityCandidate>();
  const guardar = (candidata: RadarAuthorityCandidate) => {
    const chave = radarNormalizedUrl(candidata.url);
    if (!chave) return;
    const atual = porUrl.get(chave);
    if (!atual) { porUrl.set(chave, candidata); return; }
    porUrl.set(chave, {
      ...(atual.priority <= candidata.priority ? atual : candidata),
      citedByCompetitors: Math.max(atual.citedByCompetitors, candidata.citedByCompetitors),
      claimIds: [...new Set([...atual.claimIds, ...candidata.claimIds])],
    });
  };

  /* ---------- (a) o que os concorrentes citam ---------- */
  const citacoes = radarLinkObservations({ pages: input.pages })
    .filter(link => link.kind === "EXTERNAL" && (link.category === "CONTENT_REFERENCE" || link.category === "UNKNOWN"));
  const porDestino = new Map<string, typeof citacoes>();
  for (const link of citacoes) porDestino.set(link.normalizedDestination, [...(porDestino.get(link.normalizedDestination) || []), link]);

  for (const ocorrencias of porDestino.values()) {
    const url = ocorrencias[0].destinationUrl;
    const host = radarAuthorityHost(url);
    if (!host) continue;
    const citantes = new Set(ocorrencias.map(item => item.sourcePageId)).size;
    const claimIds = afirmacoesDoDominio(host);
    const daLista = radarAuthorityEntryFor(url, input.list);
    if (daLista) {
      guardar({
        url, host, expectedDomain: daLista.domain, entity: daLista.entity, kind: daLista.kind, origin: "concorrente",
        citedByCompetitors: citantes, claimIds, expectedEntity: null,
        priority: claimIds.some(id => sensiveis.has(id)) ? 0 : PRIORIDADE_DA_ORIGEM.concorrente,
      });
      continue;
    }
    /* Fora da lista: só referência de conteúdo, e só fonte de natureza factual ou recorrente. */
    if (!ocorrencias.some(item => item.category === "CONTENT_REFERENCE")) continue;
    const natureza = classifyRadarSourceAuthority({ domain: host, url });
    if (["SOCIAL", "MARKETPLACE", "COMMERCIAL"].includes(natureza.type)) continue;
    const factual = radarSourceCanSupportFact(natureza.type);
    if (!factual && citantes < 2) continue;
    guardar({
      url, host, expectedDomain: host, entity: host, kind: "mercado", origin: "concorrente",
      citedByCompetitors: citantes, claimIds, expectedEntity: null,
      priority: factual ? 5 : 6,
    });
  }

  /* ---------- (b) a SERP já coletada, só nos domínios da lista ---------- */
  const daSerp = (url: string | null | undefined, origin: RadarAuthorityOrigin) => {
    if (!url) return;
    const entradaDaLista = radarAuthorityEntryFor(url, input.list);
    if (!entradaDaLista) return;
    const host = radarAuthorityHost(url);
    guardar({
      url, host, expectedDomain: entradaDaLista.domain, entity: entradaDaLista.entity, kind: entradaDaLista.kind, origin,
      citedByCompetitors: 0, claimIds: afirmacoesDoDominio(host), expectedEntity: null,
      priority: PRIORIDADE_DA_ORIGEM[origin],
    });
  };
  for (const item of input.serp?.aiOverview || []) daSerp(item.url, "resumo_ia");
  for (const item of input.serp?.peopleAlsoAsk || []) daSerp(item.sourceUrl, "pessoas_perguntam");
  for (const item of input.serp?.knowledgeGraphSources || []) daSerp(item.url, "painel_entidade");
  for (const item of input.serp?.organic || []) daSerp(item.url, "serp_organico");

  /* ---------- (c) o verbete da entidade central, se a Wikipédia está na lista ---------- */
  const wikipedia = input.list.find(item => radarHostBelongsTo("pt.wikipedia.org", item.domain) && !item.pathPrefix) || null;
  const jaTemWikipedia = [...porUrl.values()].some(item => radarHostBelongsTo(item.host, "pt.wikipedia.org"));
  const entidade = (input.centralEntities || []).map(item => item.trim()).find(Boolean) || null;
  if (wikipedia && !jaTemWikipedia && entidade) {
    const url = radarWikipediaArticleUrl(entidade);
    if (url) guardar({
      url, host: "pt.wikipedia.org", expectedDomain: "pt.wikipedia.org", entity: wikipedia.entity, kind: wikipedia.kind, origin: "entidade_wikipedia",
      citedByCompetitors: 0, claimIds: [], expectedEntity: entidade, priority: PRIORIDADE_DA_ORIGEM.entidade_wikipedia,
    });
  }

  return [...porUrl.values()].sort((a, b) => a.priority - b.priority || b.citedByCompetitors - a.citedByCompetitors || a.url.localeCompare(b.url));
}

/* ========================== afirmação ↔ trecho ========================== */

export type RadarAuthorityClaimInput = { claimId: string | null; claim: string; ymyl: boolean; preferred: boolean };

export type RadarAuthorityMatch = { claimId: string | null; claim: string; ymyl: boolean; excerpt: string; matchedTerms: string[] };

const cortar = (valor: string, limite: number) => (valor.length > limite ? `${valor.slice(0, limite - 1).trimEnd()}…` : valor);

/** As afirmações do artigo na forma que o casamento lê (as do domínio da fonte primeiro). */
export function radarAuthorityClaimInputs(claims: readonly RadarEvidenceClaim[], preferredIds: readonly string[] = []): RadarAuthorityClaimInput[] {
  const preferidas = new Set(preferredIds);
  return claims.map(claim => ({
    claimId: claim.claimId,
    claim: claim.canonicalClaim,
    ymyl: claim.ymyl.relevance === "MATERIAL" || claim.ymyl.relevance === "HIGH",
    preferred: preferidas.has(claim.claimId),
  }));
}

/** A frase (ou as duas) do parágrafo com mais raízes casadas, cortada. */
function trechoDe(paragrafo: string, raizes: ReadonlySet<string>, limite: number): string {
  const frases = paragrafo.split(/(?<=[.!?;])\s+/).filter(Boolean);
  if (frases.length <= 1) return cortar(paragrafo, limite);
  let melhor = 0;
  let pontos = -1;
  frases.forEach((frase, indice) => {
    const valor = radarSemanticStems(frase).filter(raiz => raizes.has(raiz)).length;
    if (valor > pontos) { pontos = valor; melhor = indice; }
  });
  const escolhida = frases[melhor];
  const comProxima = escolhida.length < 140 && frases[melhor + 1] ? `${escolhida} ${frases[melhor + 1]}` : escolhida;
  return cortar(comProxima, limite);
}

/**
 * QUAL AFIRMAÇÃO ESTA FONTE SUSTENTA, E COM QUE TRECHO — sem IA.
 *
 * Cada afirmação vira raízes; cada parágrafo da fonte também. Casa quando o
 * parágrafo contém ao menos 60% das raízes da afirmação (e no mínimo duas, ou
 * todas quando a afirmação tem até duas). Vence a maior cobertura, com leve
 * preferência pela afirmação cuja seção, nos concorrentes, já citava esta fonte.
 * Sem afirmação casada, a entidade central serve de "definição e contexto" — se a
 * fonte a explica. Sem nada, `null`: a fonte não sustenta o artigo.
 */
export function radarAuthorityMatchClaim(input: {
  paragraphs: readonly string[];
  claims: readonly RadarAuthorityClaimInput[];
  entity?: string | null;
  excerptChars?: number;
}): RadarAuthorityMatch | null {
  const limite = input.excerptChars ?? 300;
  const paragrafos = input.paragraphs.map(texto => ({ texto, raizes: new Set(radarSemanticStems(texto)) })).filter(item => item.raizes.size);
  let melhor: { pontos: number; claim: RadarAuthorityClaimInput; paragrafo: string; casadas: string[]; raizes: Set<string> } | null = null;
  for (const claim of input.claims) {
    const raizes = radarSemanticStems(claim.claim);
    if (!raizes.length) continue;
    for (const paragrafo of paragrafos) {
      const casadas = raizes.filter(raiz => paragrafo.raizes.has(raiz));
      const cobertura = casadas.length / raizes.length;
      const basta = raizes.length <= 2 ? casadas.length === raizes.length : casadas.length >= 2 && cobertura >= 0.6;
      if (!basta) continue;
      const pontos = cobertura + (claim.preferred ? 0.15 : 0) + (claim.ymyl ? 0.05 : 0);
      if (!melhor || pontos > melhor.pontos) melhor = { pontos, claim, paragrafo: paragrafo.texto, casadas, raizes: new Set(raizes) };
    }
  }
  if (melhor) {
    return {
      claimId: melhor.claim.claimId,
      claim: melhor.claim.claim,
      ymyl: melhor.claim.ymyl,
      excerpt: trechoDe(melhor.paragrafo, melhor.raizes, limite),
      matchedTerms: melhor.casadas.slice(0, 12),
    };
  }
  const entidade = (input.entity || "").trim();
  const daEntidade = radarSemanticStems(entidade);
  if (entidade && daEntidade.length) {
    const achado = paragrafos.find(item => daEntidade.every(raiz => item.raizes.has(raiz)));
    if (achado) {
      return {
        claimId: null,
        claim: `Definição e contexto de "${entidade}"`,
        ymyl: false,
        excerpt: trechoDe(achado.texto, new Set(daEntidade), limite),
        matchedTerms: daEntidade.slice(0, 12),
      };
    }
  }
  return null;
}

/** O título do verbete é a entidade? (sem o sufixo do site; desambiguação nunca é). */
export function radarAuthorityTitleIsEntity(title: string, entity: string): boolean {
  const limpo = title.replace(/\s+[–—-]\s+Wikip[ée]dia.*$/i, "").trim();
  if (/desambigua/i.test(limpo)) return false;
  const doTitulo = new Set(radarSemanticStems(limpo));
  const daEntidade = radarSemanticStems(entity);
  return daEntidade.length > 0 && daEntidade.every(raiz => doTitulo.has(raiz));
}

/* ======================= as citadas pelos concorrentes ======================= */

export type RadarCompetitorCitedSource = {
  url: string;
  domain: string;
  /** O nome da entidade quando o domínio está na lista padrão de autoridades. */
  entity: string | null;
  kind: RadarAuthorityKind;
  citedByCompetitors: number;
  anchors: string[];
  sections: string[];
};

/**
 * TODAS AS FONTES QUE OS CONCORRENTES CITAM (referência de conteúdo, externa), para
 * o arquivo de SERP crua — sem filtro de autoridade e sem verificação: é o retrato.
 */
export function radarCompetitorCitedSources(pages: readonly RadarExtractionPage[] | null | undefined, list: readonly RadarAuthorityDomain[] = RADAR_DEFAULT_AUTHORITY_DOMAINS, limit = 40): RadarCompetitorCitedSource[] {
  const citacoes = radarLinkObservations({ pages: pages || [] }).filter(link => link.kind === "EXTERNAL" && link.category === "CONTENT_REFERENCE");
  const porDestino = new Map<string, typeof citacoes>();
  for (const link of citacoes) porDestino.set(link.normalizedDestination, [...(porDestino.get(link.normalizedDestination) || []), link]);
  return [...porDestino.values()]
    .map(ocorrencias => {
      const url = ocorrencias[0].destinationUrl;
      const daLista = radarAuthorityEntryFor(url, list);
      return {
        url,
        domain: radarAuthorityHost(url) || ocorrencias[0].destinationDomain,
        entity: daLista?.entity ?? null,
        kind: daLista?.kind ?? "mercado" as RadarAuthorityKind,
        citedByCompetitors: new Set(ocorrencias.map(item => item.sourcePageId)).size,
        anchors: [...new Set(ocorrencias.map(item => item.anchorText).filter((valor): valor is string => Boolean(valor)))].slice(0, 3),
        sections: [...new Set(ocorrencias.map(item => item.sectionHeading).filter((valor): valor is string => Boolean(valor)))].slice(0, 3),
      };
    })
    .sort((a, b) => b.citedByCompetitors - a.citedByCompetitors || a.url.localeCompare(b.url))
    .slice(0, limit);
}

/* ============================ a leitura da tela ============================ */

export type RadarAuthoritySourcesView = {
  state: "ABSENT" | "UNAVAILABLE" | "CHECKED";
  headline: string;
  listNote: string;
  costNote: string;
  verified: Array<{ id: string; label: string; url: string; excerpt: string; claim: string; ymyl: boolean; meta: string }>;
  failures: Array<{ id: string; label: string; url: string; reason: string }>;
  ymylPending: string[];
  notes: Array<{ id: string; text: string }>;
  count: number;
};

/**
 * O QUE A TELA DO ARTIGO MOSTRA: quantas fontes foram conferidas, quais falharam e
 * por quê, e as afirmações de saúde que seguem sem fonte. Nada recalculado.
 */
export function radarAuthoritySourcesView(record: RadarAuthoritySourcesRecord | null | undefined): RadarAuthoritySourcesView {
  if (!record) {
    return {
      state: "ABSENT",
      headline: "Esta investigação é anterior à conferência de fontes externas de autoridade. Ela roda no próximo \"Analisar concorrência · e finaliza\" (ou no lote \"Pesquisar e finalizar\").",
      listNote: "",
      costNote: "",
      verified: [],
      failures: [],
      ymylPending: [],
      notes: [],
      count: 0,
    };
  }
  const listNote = record.list.origin === "marca"
    ? `Lista de autoridades: a da Marca (${record.list.domains} domínio(s), Identidade da marca aprovada).`
    : "Lista de autoridades: a sugerida (governo, Ministério da Saúde, Anvisa, IBGE, conselhos, OMS, SciELO, PubMed, Wikipédia e documentação do Google). Edite em Marca → Identidade da marca → Fontes de autoridade.";
  const costNote = `Custo: nenhuma chamada paga e nenhuma IA; ${record.cost.pageFetches} página(s) pública(s) aberta(s) e ${record.cost.robotsFetches} robots.txt lido(s).`;
  if (record.status === "UNAVAILABLE") {
    return {
      state: "UNAVAILABLE",
      headline: `As fontes externas não foram conferidas nesta rodada: ${record.unavailableReason || "motivo não registrado"}. A análise continua valendo.`,
      listNote, costNote, verified: [], failures: [], ymylPending: [], notes: [], count: 0,
    };
  }
  const partes = [
    `${record.checked} de ${record.candidates} candidata(s) conferida(s)`,
    `${record.verified.length} sustentam afirmação do artigo`,
    ...(record.failures.length ? [`${record.failures.length} falharam`] : []),
    ...(record.notChecked ? [`${record.notChecked} fora do teto de ${record.limit} por artigo`] : []),
  ];
  const pendentes = record.ymylClaims.filter(item => !item.sourceIds.length).map(item => item.claim);
  return {
    state: "CHECKED",
    headline: record.candidates ? `${partes.join(" · ")}.` : "Nenhuma candidata a fonte de autoridade: os concorrentes não citam e a SERP coletada não traz domínio da lista.",
    listNote,
    costNote,
    verified: record.verified.map(item => ({
      id: item.id,
      label: `${item.id} · ${item.entity}${item.title ? ` — ${item.title}` : ""}`,
      url: item.url,
      excerpt: item.excerpt,
      claim: item.claim,
      ymyl: item.ymyl,
      meta: [RADAR_AUTHORITY_KIND_LABEL[item.kind], RADAR_AUTHORITY_ORIGIN_LABEL[item.origin], ...(item.publishedAt ? [`data da página: ${item.publishedAt}`] : []), `conferida em ${item.checkedAt.slice(0, 10)}`].join(" · "),
    })),
    failures: record.failures.map((item, indice) => ({ id: `falha:${indice}`, label: `${item.entity} (${item.domain})`, url: item.url, reason: item.reason })),
    ymylPending: pendentes,
    notes: record.notes.map((text, indice) => ({ id: `nota:${indice}`, text })),
    count: record.verified.length + record.failures.length,
  };
}
