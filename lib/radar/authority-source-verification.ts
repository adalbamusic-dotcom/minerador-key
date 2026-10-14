/**
 * ===== 2026-10-14 · FONTES EXTERNAS DE AUTORIDADE — A CONFERÊNCIA (FASE A, SERVIDOR) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §16.2.
 *
 * Conferir uma fonte é abrir a página dela, uma vez, e só dentro da operação que a
 * pessoa iniciou ("Analisar concorrência · e finaliza" e o lote "Pesquisar e
 * finalizar"). Nada pago, nenhuma IA:
 *   - as MESMAS guardas da extração de concorrentes (`fetchGuardedExternalResponse`:
 *     URL validada, destino DNS conferido a cada salto, redirect com teto, timeout);
 *   - user-agent identificado e o robots.txt do site respeitado (uma leitura por site);
 *   - teto por artigo (`RADAR_AUTHORITY_LIMITS`): no máximo 8 fontes, 3 por vez,
 *     6 s por página;
 *   - a página tem de existir (2xx), ser HTML, continuar no domínio declarado depois
 *     dos redirecionamentos e trazer um trecho que trate de uma afirmação do artigo.
 *
 * O que fica gravado é metadado e um trecho curto — nunca a página.
 */
import type { lookup } from "node:dns/promises";
import { CompetitorExtractionError, assertResponseStatus, fetchGuardedExternalResponse, readGuardedBody, stripHtmlMarkup } from "./competitor-extractor.ts";
import {
  RADAR_AUTHORITY_LIMITS,
  RADAR_AUTHORITY_SOURCES_VERSION,
  RadarAuthoritySourcesRecordSchema,
  radarAuthorityHost,
  radarEffectiveAuthorityList,
  radarHostBelongsTo,
  type RadarAuthorityFailure,
  type RadarAuthorityLimits,
  type RadarAuthoritySourcesRecord,
  type RadarAuthorityVerifiedSource,
} from "./authority-sources-contract.ts";
import {
  buildRadarAuthorityCandidates,
  radarAuthorityClaimInputs,
  radarAuthorityMatchClaim,
  radarAuthoritySerpInputOf,
  radarAuthorityTitleIsEntity,
  type RadarAuthorityCandidate,
} from "./authority-sources.ts";
import { buildRadarEvidenceClaims, radarClaimNeedsFactualSupport, type RadarEvidenceClaim } from "./claim-evidence.ts";
import { buildRadarSemanticConceptModel } from "./semantic-concept-model.ts";
import { radarLinkObservations } from "./link-and-source-research.ts";
import type { RadarExtractionPage } from "./analysis-contracts.ts";

/** Quem bate à porta, dito no cabeçalho. O token é o que o robots.txt pode citar. */
export const RADAR_AUTHORITY_ROBOTS_TOKEN = "MineradorKey-FontesBot";
export const RADAR_AUTHORITY_USER_AGENT = `${RADAR_AUTHORITY_ROBOTS_TOKEN}/1.0 (conferencia pontual de fontes citadas em artigos; um acesso por fonte; respeita robots.txt)`;

type Lookup = typeof lookup;

/* ================================ robots.txt ================================ */

function regraCasa(regra: string, caminho: string): boolean {
  const ancorada = regra.endsWith("$");
  const corpo = (ancorada ? regra.slice(0, -1) : regra).split("*").map(parte => parte.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${corpo}${ancorada ? "$" : ""}`).test(caminho);
}

/**
 * O robots.txt permite este caminho para este robô? Grupo específico do token
 * vence o `*`; dentro do grupo, a regra mais longa vence, e no empate o Allow.
 * Sem regra que case, permitido.
 */
export function radarRobotsAllows(robotsTxt: string, path: string, token = RADAR_AUTHORITY_ROBOTS_TOKEN): boolean {
  type Grupo = { agentes: string[]; regras: Array<{ permite: boolean; caminho: string }> };
  const grupos: Grupo[] = [];
  let atual: Grupo | null = null;
  let ultimaFoiAgente = false;
  for (const bruta of robotsTxt.split(/\r?\n/)) {
    const linha = bruta.replace(/#.*$/, "").trim();
    const doisPontos = linha.indexOf(":");
    if (doisPontos < 0) continue;
    const chave = linha.slice(0, doisPontos).trim().toLowerCase();
    const valor = linha.slice(doisPontos + 1).trim();
    if (chave === "user-agent") {
      if (!atual || !ultimaFoiAgente) { atual = { agentes: [], regras: [] }; grupos.push(atual); }
      atual.agentes.push(valor.toLowerCase());
      ultimaFoiAgente = true;
      continue;
    }
    ultimaFoiAgente = false;
    if (!atual) continue;
    if (chave === "allow" || chave === "disallow") atual.regras.push({ permite: chave === "allow", caminho: valor });
  }
  const nome = token.toLowerCase();
  const especificos = grupos.filter(grupo => grupo.agentes.some(agente => agente !== "*" && nome.includes(agente)));
  const valem = especificos.length ? especificos : grupos.filter(grupo => grupo.agentes.includes("*"));
  let melhor: { permite: boolean; tamanho: number } | null = null;
  for (const regra of valem.flatMap(grupo => grupo.regras)) {
    if (!regra.caminho) continue;
    if (!regraCasa(regra.caminho, path)) continue;
    const tamanho = regra.caminho.length;
    if (!melhor || tamanho > melhor.tamanho || (tamanho === melhor.tamanho && regra.permite)) melhor = { permite: regra.permite, tamanho };
  }
  return melhor ? melhor.permite : true;
}

/* ============================ o HTML da fonte ============================ */

const decodificar = (texto: string) => texto
  .replace(/&#(\d+);/g, (_, codigo) => String.fromCharCode(Number(codigo)))
  .replace(/&#x([0-9a-f]+);/gi, (_, codigo) => String.fromCharCode(parseInt(codigo, 16)))
  .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
  .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ccedil;/gi, "ç").replace(/&atilde;/gi, "ã").replace(/&otilde;/gi, "õ")
  .replace(/&ecirc;/gi, "ê").replace(/&ocirc;/gi, "ô").replace(/&acirc;/gi, "â").replace(/\s+/g, " ").trim();

/** Os parágrafos de conteúdo (p, li, dd, blockquote), sem marcação, na ordem. */
export function radarAuthorityParagraphs(html: string): string[] {
  const semRuido = html.replace(/<(script|style|noscript|nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ");
  return [...semRuido.matchAll(/<(p|li|dd|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map(match => decodificar(stripHtmlMarkup(match[2] || "")))
    .filter(texto => texto.length >= 40)
    .map(texto => texto.slice(0, 2000))
    .slice(0, 400);
}

const atributo = (tag: string, nome: string) => tag.match(new RegExp(`${nome}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1]?.trim() || "";

/** O título que a página declara (<title>, senão og:title, senão o H1). */
export function radarAuthorityTitle(html: string): string {
  const titulo = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (titulo && decodificar(stripHtmlMarkup(titulo))) return decodificar(stripHtmlMarkup(titulo));
  const og = html.match(/<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*>/i)?.[0];
  if (og && atributo(og, "content")) return decodificar(atributo(og, "content"));
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return h1 ? decodificar(stripHtmlMarkup(h1)) : "";
}

/** A data que a página declara (atualização antes de publicação); `null` sem declaração. */
export function radarAuthorityPageDate(html: string): string | null {
  const candidatos: string[] = [];
  for (const propriedade of ["article:modified_time", "og:updated_time", "article:published_time"]) {
    const tag = html.match(new RegExp(`<meta\\b[^>]*(property|name)\\s*=\\s*["']${propriedade}["'][^>]*>`, "i"))?.[0];
    if (tag && atributo(tag, "content")) candidatos.push(atributo(tag, "content"));
  }
  const ld = html.match(/"date(Modified|Published)"\s*:\s*"([^"]+)"/i)?.[2];
  if (ld) candidatos.push(ld);
  const tempo = html.match(/<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i)?.[1];
  if (tempo) candidatos.push(tempo);
  for (const valor of candidatos) {
    const instante = new Date(valor);
    if (!Number.isNaN(instante.getTime())) return instante.toISOString().slice(0, 10);
  }
  return null;
}

/* ============================== os motivos ============================== */

/** O motivo de cada falha, em português, como a tela e o arquivo de SERP crua mostram. */
export function radarAuthorityFailureReason(code: string, status: number | null, detail = ""): string {
  switch (code) {
    case "not_found": return "a página não existe (404)";
    case "gone": return "a página foi removida pelo site (410)";
    case "access_blocked": return `o site recusou o acesso${status ? ` (${status})` : ""}`;
    case "too_many_requests": return "o site pediu para reduzir o ritmo (429)";
    case "http_server_error": return `o site respondeu com erro${status ? ` (${status})` : ""}`;
    case "http_client_error": return `o site respondeu com erro${status ? ` (${status})` : ""}`;
    case "timeout": return `o site não respondeu dentro do limite de ${Math.round(RADAR_AUTHORITY_LIMITS.pageTimeoutMs / 1000)} s`;
    case "redirect_limit": return "redirecionamentos demais";
    case "outro_dominio": return `redirecionou para outro domínio${detail ? ` (${detail})` : ""}, fora do domínio declarado`;
    case "robots": return "o robots.txt do site não permite esta leitura";
    case "robots_indisponivel": return "o robots.txt do site não respondeu; a página não foi aberta";
    case "invalid_content_type": return "não é página HTML (por exemplo, PDF)";
    case "invalid_html": return "a resposta não é HTML legível ou é grande demais";
    case "private_destination": return "o endereço aponta para destino privado ou reservado";
    case "invalid_url": return "o endereço não é válido";
    case "nao_sustenta": return "a página abriu, mas nenhum trecho dela trata de uma afirmação do artigo";
    case "entidade_diferente": return `o verbete aberto não é a entidade do artigo${detail ? ` (título: ${detail})` : ""}`;
    default: return "a fonte não pôde ser aberta";
  }
}

/* ============================== a conferência ============================== */

/* Campos declarados (sem propriedade de parâmetro: `node --test` recusa tipo não apagável). */
class Falha extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly detail: string;
  constructor(code: string, status: number | null = null, detail = "") {
    super(code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<never>((_, rejeitar) => { timer = setTimeout(() => rejeitar(new Falha("timeout", 504)), ms); });
  return Promise.race([promessa, prazo]).finally(() => { if (timer) clearTimeout(timer); });
}

export type RadarAuthorityVerificationInput = {
  candidates: readonly RadarAuthorityCandidate[];
  claims: readonly RadarEvidenceClaim[];
  centralEntities?: readonly string[];
  list: { origin: "marca" | "padrao"; brandDnaVersionId: string | null; domains: number };
  notes?: readonly string[];
  fetchImpl?: typeof fetch;
  lookupImpl?: Lookup;
  now?: string;
  limits?: Partial<RadarAuthorityLimits>;
};

/**
 * ABRE E CONFERE AS CANDIDATAS (até o teto), e devolve o registro que a versão da
 * análise grava. Uma fonte que falha vira falha nomeada; nenhuma derruba as outras.
 */
export async function verifyRadarAuthoritySources(input: RadarAuthorityVerificationInput): Promise<RadarAuthoritySourcesRecord> {
  const limites: RadarAuthorityLimits = { ...RADAR_AUTHORITY_LIMITS, ...(input.limits || {}) };
  const agora = input.now || new Date().toISOString();
  const alvo = input.candidates.slice(0, limites.maxSources);
  const entidade = (input.centralEntities || []).map(item => item.trim()).find(Boolean) || null;
  type Robots = { estado: "sem_regras" | "indisponivel" } | { estado: "regras"; texto: string };
  const robots = new Map<string, Promise<Robots>>();
  let paginasAbertas = 0;
  let robotsLidos = 0;

  /* Um robots.txt por site, mesmo com várias fontes do mesmo site ao mesmo tempo. */
  const lerRobots = (origem: string): Promise<Robots> => {
    const guardado = robots.get(origem);
    if (guardado) return guardado;
    const promessa = (async (): Promise<Robots> => {
      robotsLidos += 1;
      try {
        const { response } = await comPrazo(fetchGuardedExternalResponse(`${origem}/robots.txt`, {
          fetchImpl: input.fetchImpl, lookupImpl: input.lookupImpl, timeoutMs: limites.robotsTimeoutMs,
          userAgent: RADAR_AUTHORITY_USER_AGENT, accept: "text/plain,*/*;q=0.5",
        }), limites.robotsTimeoutMs + 500);
        /* 4xx: o site não publica regras — a convenção é "permitido". */
        if (response.status >= 400 && response.status < 500) return { estado: "sem_regras" };
        if (response.status < 200 || response.status >= 300) return { estado: "indisponivel" };
        return { estado: "regras", texto: await comPrazo(readGuardedBody(response), limites.robotsTimeoutMs) };
      } catch {
        /* Sem robots legível por erro de rede ou de servidor: a página não é aberta (o conservador). */
        return { estado: "indisponivel" };
      }
    })();
    robots.set(origem, promessa);
    return promessa;
  };

  const robotsPermite = async (url: URL): Promise<"permite" | "recusa" | "indisponivel"> => {
    const lido = await lerRobots(url.origin);
    if (lido.estado !== "regras") return lido.estado === "sem_regras" ? "permite" : "indisponivel";
    return radarRobotsAllows(lido.texto, `${url.pathname}${url.search}`) ? "permite" : "recusa";
  };

  type Resultado = { candidata: RadarAuthorityCandidate; ok: Omit<RadarAuthorityVerifiedSource, "id"> | null; falha: RadarAuthorityFailure | null };

  const conferir = async (candidata: RadarAuthorityCandidate): Promise<Resultado> => {
    const falhar = (code: string, status: number | null = null, detail = ""): Resultado => ({
      candidata, ok: null,
      falha: { url: candidata.url, domain: candidata.host || candidata.expectedDomain, entity: candidata.entity, kind: candidata.kind, origin: candidata.origin, code, reason: radarAuthorityFailureReason(code, status, detail), status },
    });
    let endereco: URL;
    try { endereco = new URL(candidata.url); } catch { return falhar("invalid_url"); }
    try {
      const permissao = await robotsPermite(endereco);
      if (permissao === "recusa") return falhar("robots");
      if (permissao === "indisponivel") return falhar("robots_indisponivel");
      paginasAbertas += 1;
      const html = await comPrazo((async () => {
        const { url: final, response } = await fetchGuardedExternalResponse(candidata.url, {
          fetchImpl: input.fetchImpl, lookupImpl: input.lookupImpl, timeoutMs: limites.pageTimeoutMs, userAgent: RADAR_AUTHORITY_USER_AGENT,
          /* Redirecionar para fora do domínio declarado encerra aqui: o outro site não é aberto. */
          stopRedirectWhen: proximo => !radarHostBelongsTo(radarAuthorityHost(proximo.toString()), candidata.expectedDomain),
        });
        const hostFinal = radarAuthorityHost(final.toString());
        if (!radarHostBelongsTo(hostFinal, candidata.expectedDomain)) throw new Falha("outro_dominio", response.status, hostFinal);
        assertResponseStatus(response.status);
        const tipo = response.headers.get("content-type") || "";
        if (!/text\/html|application\/xhtml\+xml/i.test(tipo)) throw new CompetitorExtractionError("invalid_content_type", "A resposta nao e HTML compativel.");
        const corpo = await readGuardedBody(response);
        if (!/<html\b|<body\b/i.test(corpo)) throw new CompetitorExtractionError("invalid_html", "A resposta nao contem HTML reconhecivel.");
        return { corpo, final: final.toString() };
      })(), limites.pageTimeoutMs + 1000);

      const titulo = radarAuthorityTitle(html.corpo).slice(0, limites.titleChars);
      if (candidata.expectedEntity && !radarAuthorityTitleIsEntity(titulo, candidata.expectedEntity)) return falhar("entidade_diferente", null, titulo);
      const casamento = radarAuthorityMatchClaim({
        paragraphs: radarAuthorityParagraphs(html.corpo),
        claims: radarAuthorityClaimInputs(input.claims, candidata.claimIds),
        entity: candidata.expectedEntity || entidade,
        excerptChars: limites.excerptChars,
      });
      if (!casamento) return falhar("nao_sustenta");
      return {
        candidata, falha: null,
        ok: {
          url: html.final,
          domain: radarAuthorityHost(html.final) || candidata.host,
          entity: candidata.entity,
          kind: candidata.kind,
          origin: candidata.origin,
          title: titulo,
          excerpt: casamento.excerpt,
          publishedAt: radarAuthorityPageDate(html.corpo),
          checkedAt: agora,
          claim: casamento.claim,
          claimId: casamento.claimId,
          ymyl: casamento.ymyl,
          citedByCompetitors: candidata.citedByCompetitors,
          matchedTerms: casamento.matchedTerms,
        },
      };
    } catch (error) {
      if (error instanceof Falha) return falhar(error.code, error.status, error.detail);
      if (error instanceof CompetitorExtractionError) return falhar(error.code, error.status && error.status !== 422 ? error.status : null);
      return falhar("fetch_failed");
    }
  };

  /* Um conjunto pequeno de cada vez — educado com os sites, previsível no tempo. */
  const resultados: Resultado[] = new Array(alvo.length);
  let proxima = 0;
  const trabalhador = async () => {
    while (proxima < alvo.length) {
      const indice = proxima;
      proxima += 1;
      resultados[indice] = await conferir(alvo[indice]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limites.concurrency, alvo.length) }, trabalhador));

  const verified: RadarAuthorityVerifiedSource[] = resultados
    .filter(item => item.ok)
    .map((item, indice) => ({ id: `X${indice + 1}`, ...(item.ok as Omit<RadarAuthorityVerifiedSource, "id">) }));
  const failures = resultados.filter(item => item.falha).map(item => item.falha as RadarAuthorityFailure);
  const ymylClaims = input.claims.filter(radarClaimNeedsFactualSupport).map(claim => ({
    claimId: claim.claimId,
    claim: claim.canonicalClaim,
    relevance: claim.ymyl.relevance,
    sourceIds: verified.filter(item => item.claimId === claim.claimId).map(item => item.id),
  }));

  return RadarAuthoritySourcesRecordSchema.parse({
    version: RADAR_AUTHORITY_SOURCES_VERSION,
    status: "CHECKED",
    unavailableReason: null,
    checkedAt: agora,
    list: input.list,
    candidates: input.candidates.length,
    checked: alvo.length,
    notChecked: Math.max(0, input.candidates.length - alvo.length),
    limit: limites.maxSources,
    verified,
    failures,
    ymylClaims,
    notes: [...(input.notes || [])],
    cost: { providerCalls: 0, aiCalls: 0, pageFetches: paginasAbertas, robotsFetches: robotsLidos },
  });
}

/**
 * O NÚCLEO DA ROTA, sobre o que está gravado: as páginas da amostra persistida, a
 * SERP do snapshot da análise e a lista da Marca. A rota só lê e autoriza.
 */
export async function radarAuthoritySourcesForAnalysis(input: {
  pages: readonly RadarExtractionPage[];
  research?: Parameters<typeof radarAuthoritySerpInputOf>[0];
  brandLines?: readonly string[] | null;
  brandDnaVersionId?: string | null;
  keywordTexts?: readonly string[];
  centralEntities?: readonly string[];
  notes?: readonly string[];
  fetchImpl?: typeof fetch;
  lookupImpl?: Lookup;
  now?: string;
  limits?: Partial<RadarAuthorityLimits>;
}): Promise<RadarAuthoritySourcesRecord> {
  const lista = radarEffectiveAuthorityList(input.brandLines);
  const notas = [
    ...(input.notes || []),
    ...(lista.invalid.length ? [`${lista.invalid.length} linha(s) da lista da Marca não são domínio e ficaram de fora: ${lista.invalid.join(" · ")}.`] : []),
    ...(input.research ? [] : ["A SERP do snapshot desta análise não foi lida: as candidatas vieram só das páginas concorrentes."]),
  ];
  const semantic = buildRadarSemanticConceptModel({ pages: input.pages, keywordTexts: input.keywordTexts || [], centralEntities: input.centralEntities || [] });
  const dominiosPorPagina = new Map<string, string[]>();
  for (const link of radarLinkObservations({ pages: input.pages })) {
    if (link.kind !== "EXTERNAL" || link.category !== "CONTENT_REFERENCE") continue;
    dominiosPorPagina.set(link.sourcePageId, [...new Set([...(dominiosPorPagina.get(link.sourcePageId) || []), link.destinationDomain])]);
  }
  const claims = buildRadarEvidenceClaims({ semantic, sourcesByPage: dominiosPorPagina });
  const candidates = buildRadarAuthorityCandidates({
    pages: input.pages,
    serp: radarAuthoritySerpInputOf(input.research),
    list: lista.entries,
    claims,
    centralEntities: input.centralEntities,
  });
  return verifyRadarAuthoritySources({
    candidates,
    claims,
    centralEntities: input.centralEntities,
    list: { origin: lista.origin, brandDnaVersionId: lista.origin === "marca" ? input.brandDnaVersionId ?? null : null, domains: lista.entries.length },
    notes: notas,
    fetchImpl: input.fetchImpl,
    lookupImpl: input.lookupImpl,
    now: input.now,
    limits: input.limits,
  });
}
