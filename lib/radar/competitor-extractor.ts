import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { RadarExtractionPageSchema, RadarObservedLinkSchema, type RadarExtractionPage } from "./analysis-contracts.ts";
import { z } from "zod";

const MAX_HTML_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 15_000;
const STOP_WORDS = new Set("a ao aos as com como da das de do dos e em para por que se sem no na nos nas um uma uns umas o os ou este esta isso e sao seu sua seus suas pela pelas pelo pelos nao mais menos muito cada entre sobre ate tambem ja foi ser artigo conteudo guia fazer onde quando porque".split(/\s+/));

export class CompetitorExtractionError extends Error {
  readonly code: "invalid_url" | "private_destination" | "redirect_limit" | "timeout" | "invalid_content_type" | "invalid_html" | "fetch_failed"
    /* O que a ORIGEM respondeu. Sem isto, uma página de erro virava concorrente. */
    | "not_found" | "gone" | "access_blocked" | "too_many_requests" | "http_server_error" | "http_client_error";
  readonly status: number;
  constructor(code: CompetitorExtractionError["code"], message: string, status = 422) {
    super(message);
    this.name = "CompetitorExtractionError";
    this.code = code;
    this.status = status;
  }
}

function privateIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function privateIpv6(value: string) {
  const normalized = value.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

/**
 * O que cada faixa de status significa para a extração.
 *
 * `2xx` segue. Todo o resto vira erro NOMEADO, com o status da origem
 * preservado — é ele que diz depois se a falha merece nova tentativa (429 e
 * 5xx) ou se é recusa estável (401, 403, 404, 410 e demais 4xx).
 *
 * `Retry-After` não é honrado nesta versão: o retry vive no cliente e não
 * carrega atraso. O status é preservado para quando isso mudar.
 */
export function assertResponseStatus(status: number) {
  if (status >= 200 && status < 300) return;
  if (status === 404) throw new CompetitorExtractionError("not_found", "A pagina do concorrente nao existe (404).", 404);
  if (status === 410) throw new CompetitorExtractionError("gone", "A pagina foi removida pela origem (410).", 410);
  if (status === 401 || status === 403) throw new CompetitorExtractionError("access_blocked", "A origem recusou o acesso a pagina.", status);
  if (status === 429) throw new CompetitorExtractionError("too_many_requests", "A origem pediu para reduzir o ritmo (429).", 429);
  if (status >= 500 && status < 600) throw new CompetitorExtractionError("http_server_error", "A origem respondeu com erro de servidor.", status);
  throw new CompetitorExtractionError("http_client_error", "A origem respondeu com erro e a pagina nao pode ser lida.", status);
}

export function validateExternalUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CompetitorExtractionError("invalid_url", "A URL do concorrente e invalida.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new CompetitorExtractionError("invalid_url", "Somente URLs HTTP e HTTPS podem ser extraidas.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "local" || hostname.endsWith(".local") || hostname === "metadata.google.internal") throw new CompetitorExtractionError("private_destination", "A URL aponta para um destino local ou reservado.");
  const kind = isIP(hostname);
  if ((kind === 4 && privateIpv4(hostname)) || (kind === 6 && privateIpv6(hostname))) throw new CompetitorExtractionError("private_destination", "IPs privados, loopback e reservados nao podem ser extraidos.");
  url.username = "";
  url.password = "";
  return url;
}

async function assertResolvedDestination(url: URL, lookupImpl: typeof lookup) {
  if (isIP(url.hostname)) return;
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookupImpl(url.hostname, { all: true }) as Array<{ address: string }>;
  } catch {
    throw new CompetitorExtractionError("private_destination", "Nao foi possivel validar o destino DNS do concorrente.");
  }
  if (addresses.some(entry => (isIP(entry.address) === 4 && privateIpv4(entry.address)) || (isIP(entry.address) === 6 && privateIpv6(entry.address)))) throw new CompetitorExtractionError("private_destination", "O dominio resolve para um IP privado ou reservado.");
}

function attr(tag: string, name: string) {
  const found = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return found?.[1]?.trim() || "";
}

function stripMarkup(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<!--([\s\S]*?)-->/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
}

function tags(html: string, name: string) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "gi"))].map(match => stripMarkup(match[1] || "")).filter(Boolean);
}

function canonicalUrl(html: string, base: URL) {
  const tag = html.match(/<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/i);
  if (!tag) return null;
  try {
    return new URL(attr(tag[0], "href"), base).toString();
  } catch {
    return null;
  }
}

function extractTerms(pageId: string, body: string) {
  const counts = new Map<string, number>();
  const words = body.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-zà-ÿ]{4,}/gi) || [];
  for (const word of words) {
    const term = word.toLocaleLowerCase("pt-BR");
    if (!STOP_WORDS.has(term)) counts.set(term, (counts.get(term) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([term, frequency]) => ({ term, frequency, pageCount: 1, sources: ["body" as const], pageIds: [pageId] }));
}

function parseStructuredData(html: string) {
  return [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(match => {
    try {
      const parsed = JSON.parse(match[1] || "{}");
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }).flatMap(item => typeof item === "object" && item ? [String((item as Record<string, unknown>)["@type"] || "").trim()] : []).filter(Boolean);
}

async function readBody(response: Response) {
  const reader = response.body?.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_HTML_BYTES) throw new CompetitorExtractionError("invalid_html", "A pagina excedeu o tamanho maximo permitido.");
      chunks.push(part.value);
    }
  } else {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_HTML_BYTES) throw new CompetitorExtractionError("invalid_html", "A pagina excedeu o tamanho maximo permitido.");
    chunks.push(buffer);
  }
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(output);
}

const contarPalavras = (value: string) => value.split(/\s+/).filter(Boolean).length;

/** Parágrafos na ordem do documento. Vazios e ruído curto não contam como parágrafo. */
function paragraphTexts(html: string) {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(match => stripMarkup(match[1]))
    .filter(text => contarPalavras(text) >= 3);
}

/** A hierarquia como o documento a escreve — ordem preservada, sem reordenar por nível. */
function headingOutline(html: string) {
  return [...html.matchAll(/<h([123])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map(match => ({ level: Number(match[1]) as 1 | 2 | 3, text: stripMarkup(match[2]) }))
    .filter(item => item.text)
    .slice(0, 200);
}

/* ------------------------- os links, como escritos ----------------------- */

/** Quantos links de uma página entram na observação. Acima disso, é vitrine. */
const MAX_OBSERVED_LINKS = 300;
/** O contexto é para entender o porquê, não para guardar a página de novo. */
const MAX_CONTEXT_CHARS = 240;
const BLOCOS = ["p", "li", "td", "blockquote", "figcaption"] as const;

/**
 * O BLOCO QUE CONTÉM O LINK — parágrafo, item de lista, célula.
 *
 * Uma janela cega de caracteres corta frase no meio e mistura o fim de um
 * parágrafo com o começo do próximo. Achar o bloco que envolve a âncora
 * devolve a frase inteira que justifica a citação, e só ela. Quando o
 * documento não tem bloco identificável, a janela é o que sobra — e ela é
 * declaradamente pior.
 */
function contextoDoLink(html: string, indice: number): string {
  let inicio = -1;
  for (const tag of BLOCOS) inicio = Math.max(inicio, html.lastIndexOf(`<${tag}`, indice));
  const fim = BLOCOS
    .map(tag => html.indexOf(`</${tag}>`, indice))
    .filter(posicao => posicao > indice)
    .sort((left, right) => left - right)[0] ?? -1;

  const dentroDoBloco = inicio >= 0 && fim > inicio && fim - inicio < 4000;
  const trecho = dentroDoBloco
    ? html.slice(inicio, fim)
    : html.slice(Math.max(0, indice - 400), indice + 400);
  return stripMarkup(trecho).slice(0, MAX_CONTEXT_CHARS);
}

/** O texto da âncora como a página o escreveu; se não houver, o que ela oferece. */
function textoDaAncora(atributos: string, interno: string): string | null {
  const escrito = stripMarkup(interno);
  if (escrito) return escrito.slice(0, 200);
  const aria = attr(atributos, "aria-label");
  if (aria) return aria.slice(0, 200);
  const alt = interno.match(/<img\b[^>]*>/i);
  const descricao = alt ? attr(alt[0], "alt") : "";
  return descricao ? descricao.slice(0, 200) : null;
}

function observedLinks(html: string, base: URL) {
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map(match => ({ indice: match.index ?? 0, texto: stripMarkup(match[2] || "") }))
    .filter(item => item.texto);

  const secaoDe = (indice: number) => {
    let atual: string | null = null;
    for (const heading of headings) {
      if (heading.indice > indice) break;
      atual = heading.texto;
    }
    return atual;
  };

  const observados: Array<z.infer<typeof RadarObservedLinkSchema>> = [];
  let ordem = 0;
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (observados.length >= MAX_OBSERVED_LINKS) break;
    const atributos = match[1] || "";
    const href = attr(atributos, "href");
    if (!href) continue;

    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      /* href quebrado não vira observação: não há destino para descrever. */
      continue;
    }

    /*
     * CAPTURAR NÃO É NAVEGAR.
     *
     * `mailto:`, `tel:`, `javascript:` e `data:` são registrados como
     * observação do que a página faz — e nunca poderão virar candidata a
     * fonte. Ignorá-los em silêncio esconderia que a página tem contato ou
     * script no meio do conteúdo.
     */
    const web = ["http:", "https:"].includes(url.protocol);
    const kind = !web ? "NON_WEB" as const : url.hostname === base.hostname ? "INTERNAL" as const : "EXTERNAL" as const;
    const indice = match.index ?? 0;

    observados.push({
      destinationUrl: web ? url.toString() : `${url.protocol}${url.pathname || ""}`.slice(0, 300),
      destinationDomain: web ? url.hostname : "",
      kind,
      anchorText: textoDaAncora(atributos, match[2] || ""),
      surroundingText: contextoDoLink(html, indice),
      sectionHeading: secaoDe(indice),
      rel: (attr(atributos, "rel") || "").toLowerCase().split(/\s+/).filter(Boolean),
      target: attr(atributos, "target") || null,
      order: ordem++,
    });
  }
  return observados;
}

/** O que a página escolheu destacar. Frequência de destaque, não meta de negrito. */
function emphasizedTerms(html: string) {
  const termos = [...html.matchAll(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map(match => stripMarkup(match[2]))
    .filter(text => text.length > 2 && contarPalavras(text) <= 8);
  return [...new Set(termos)].slice(0, 40);
}

const normalizado = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Onde a principal recebida aparece — por localização, não por densidade.
 *
 * Sem keyword informada devolve `null`: ausência de dado é declarada, e não
 * vira "a keyword não aparece nesta página".
 */
function keywordPlacement(keyword: string | undefined, parts: { title: string; h1: string[]; h2: string[]; h3: string[]; intro: string; body: string }) {
  const alvo = normalizado(keyword || "");
  if (!alvo) return null;
  const contem = (value: string) => normalizado(value).includes(alvo);
  const corpo = normalizado(parts.body);
  const ocorrencias = alvo ? corpo.split(alvo).length - 1 : 0;
  return {
    keyword: keyword!.trim(),
    title: contem(parts.title),
    h1: parts.h1.some(contem),
    h2: parts.h2.some(contem),
    h3: parts.h3.some(contem),
    intro: contem(parts.intro),
    body: ocorrencias > 0,
    occurrences: ocorrencias,
  };
}

export async function extractCompetitorPage(rawUrl: string, options: { fetchImpl?: typeof fetch; lookupImpl?: typeof lookup; timeoutMs?: number; now?: string; keyword?: string } = {}): Promise<RadarExtractionPage> {
  const fetchImpl = options.fetchImpl || fetch;
  const lookupImpl = options.lookupImpl || lookup;
  let current = validateExternalUrl(rawUrl);
  let response: Response | null = null;
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      await assertResolvedDestination(current, lookupImpl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
      try {
        response = await fetchImpl(current, { method: "GET", redirect: "manual", headers: { Accept: "text/html,application/xhtml+xml" }, signal: controller.signal, cache: "no-store" });
      } catch {
        if (controller.signal.aborted) throw new CompetitorExtractionError("timeout", "A pagina concorrente excedeu o timeout.", 504);
        throw new CompetitorExtractionError("fetch_failed", "Nao foi possivel buscar a pagina concorrente.", 502);
      } finally {
        clearTimeout(timer);
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) throw new CompetitorExtractionError("redirect_limit", "A pagina excedeu o limite de redirects permitido.");
        current = validateExternalUrl(new URL(location, current).toString());
        continue;
      }
      break;
    }
    if (!response) throw new CompetitorExtractionError("fetch_failed", "Nenhuma resposta foi recebida.", 502);
    /*
     * O STATUS DA ORIGEM VEM ANTES DO CONTEÚDO.
     *
     * Uma página de erro 404 costuma ser HTML bem formado: título, headings,
     * parágrafos. Sem esta classificação, ela era extraída como se fosse a
     * página do concorrente e entrava no benchmark — pior do que falhar, porque
     * ninguém veria o problema.
     *
     * O redirecionamento continua onde estava, no laço acima; aqui só chega o
     * que já é resposta final.
     */
    assertResponseStatus(response.status);
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new CompetitorExtractionError("invalid_content_type", "A resposta nao e HTML compativel.");
    const html = await readBody(response);
    if (!/<html\b|<body\b/i.test(html)) throw new CompetitorExtractionError("invalid_html", "A resposta nao contem HTML reconhecivel.");
    const body = stripMarkup(html);
    const pageId = `competitor:${Buffer.from(current.toString()).toString("base64url").slice(0, 32)}`;
    const h1 = tags(html, "h1");
    const h2 = tags(html, "h2");
    const h3 = tags(html, "h3");
    /*
     * UMA LEITURA SÓ DAS ÂNCORAS.
     *
     * A contagem antiga varria o HTML por conta própria e devolvia números que
     * ninguém conseguia conferir. Agora ela SAI das observações: se a soma e a
     * lista discordarem, é porque alguém contou duas vezes — e aqui não há
     * como.
     */
    const links = observedLinks(html, current);
    const internalLinkCount = links.filter(link => link.kind === "INTERNAL").length;
    const externalLinkCount = links.filter(link => link.kind === "EXTERNAL").length;
    const paragrafos = paragraphTexts(html);
    const abertura = paragrafos[0] || "";
    const fechamento = paragrafos.length > 1 ? paragrafos[paragrafos.length - 1] : "";
    return RadarExtractionPageSchema.parse({
      id: pageId,
      url: current.toString(),
      status: h1.length && body.length > 200 ? "success" : "partial",
      fetchedAt: options.now || new Date().toISOString(),
      title: tags(html, "title")[0] || "",
      metaDescription: attr(html.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*>/i)?.[0] || "", "content"),
      canonical: canonicalUrl(html, current),
      h1, h2, h3,
      wordCount: body.split(/\s+/).filter(Boolean).length,
      internalLinkCount,
      externalLinkCount,
      listCount: tags(html, "ul").length + tags(html, "ol").length,
      tableCount: tags(html, "table").length,
      faqCount: tags(html, "details").length + (body.match(/\?/g) || []).length,
      imageCount: [...html.matchAll(/<img\b/gi)].length,
      blockquoteCount: tags(html, "blockquote").length,
      comparisonCount: (body.match(/compar|versus|\bvs\b/gi) || []).length,
      hasDates: /\b20\d{2}\b|\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/.test(body),
      author: attr(html.match(/<meta\b[^>]*name\s*=\s*["']author["'][^>]*>/i)?.[0] || "", "content") || null,
      structuredDataTypes: parseStructuredData(html),
      recurringTerms: extractTerms(pageId, body),
      boldCount: tags(html, "strong").length + tags(html, "b").length,
      italicCount: tags(html, "em").length + tags(html, "i").length,
      paragraphCount: paragrafos.length,
      paragraphWordCounts: paragrafos.map(contarPalavras).slice(0, 200),
      headingOutline: headingOutline(html),
      introWordCount: contarPalavras(abertura),
      introText: abertura.slice(0, 600),
      closingWordCount: contarPalavras(fechamento),
      closingText: fechamento.slice(0, 600),
      hasClosing: Boolean(fechamento) && paragrafos.length > 1,
      emphasizedTerms: emphasizedTerms(html),
      observedLinks: links,
      keywordPlacement: keywordPlacement(options.keyword, { title: tags(html, "title")[0] || "", h1, h2, h3, intro: abertura, body }),
      error: null,
    });
  } catch (error) {
    if (error instanceof CompetitorExtractionError) throw error;
    throw new CompetitorExtractionError("fetch_failed", "Falha nao classificada na extracao.", 502);
  }
}
