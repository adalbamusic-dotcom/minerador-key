/**
 * CACHE TEMPORÁRIO DE SERP — o contrato, compartilhado por todos os módulos.
 *
 * A mesma keyword era paga várias vezes: o Minerador consulta a SERP completa
 * para qualificar, e depois o Arquiteto consultava de novo para agrupar, e de
 * novo para validar a formação. Nada era reaproveitado entre etapas.
 *
 * Este contrato define UMA entrada por consulta — keyword × localidade ×
 * idioma × lente × endpoint —, válida por um tempo. Quem precisa de SERP
 * pergunta ao cache primeiro; só a entrada ausente ou vencida vira chamada
 * paga. Quem paga grava; todos os outros reaproveitam.
 *
 * DUAS CAMADAS, porque há dois tipos de leitor:
 *
 *   observation  ~1 KB. Domínios, blocos, perguntas, buscas relacionadas,
 *                citações do AI Overview. É o que o AGRUPAMENTO lê — e só isso
 *                trafega quando se agrupa (regra R8 da SDD de egress).
 *   body         o corpo do provider PODADO: só os campos que os três
 *                leitores reais tocam. Quem precisa normalizar com a própria
 *                intenção esperada lê o corpo e normaliza de novo.
 *
 * Por que o corpo e não o snapshot normalizado: o `diagnostic` do snapshot
 * depende de quem pergunta (intenção esperada, tópicos exigidos). Guardar o
 * normalizado entregaria a um artigo o veredito calculado para outro.
 *
 * Domínio puro: sem storage, sem rede, sem dependência de servidor.
 */

import { z } from "zod";

export const SERP_CACHE_SUBJECT_TYPE = "serp_cache_entry" as const;
/**
 * Dono: o Minerador, que é quem primeiro paga a SERP de cada keyword.
 * `minerador` também é o único estágio sem leitor amplo: `architect` entraria
 * no reset de homologação, `radar` na listagem do Radar como "incompatível".
 */
export const SERP_CACHE_STAGE = "minerador" as const;
export const SERP_CACHE_CONTRACT_VERSION = "serp-cache-v1" as const;

/* --------------------------------- lentes --------------------------------- */

export const SerpCacheDeviceSchema = z.enum(["desktop", "mobile"]);
export const SerpCacheOperatingSystemSchema = z.enum(["windows", "macos", "android", "ios"]);

export const SerpCacheLensSchema = z.object({
  device: SerpCacheDeviceSchema,
  /**
   * SEMPRE explícito. Medido em 2026-09-23: a DataForSEO devolve no eco da
   * tarefa (`task.data.os`) o sistema que usou — e `desktop` sem `os` volta
   * como `windows`. Aqui o sistema nunca é suposto: quem pede diz qual lente.
   */
  operatingSystem: SerpCacheOperatingSystemSchema,
}).strict();
export type SerpCacheLens = z.infer<typeof SerpCacheLensSchema>;

/**
 * As quatro lentes do produto. Artigo publicado precisa posicionar em todos
 * os sistemas e aparelhos — e nas respostas de IA, que variam com eles.
 */
export const SERP_CACHE_LENSES: readonly SerpCacheLens[] = [
  { device: "desktop", operatingSystem: "windows" },
  { device: "desktop", operatingSystem: "macos" },
  { device: "mobile", operatingSystem: "android" },
  { device: "mobile", operatingSystem: "ios" },
];

/** A lente que o Minerador já pagava: `desktop` sem `os` é `windows`, pelo eco do provider. */
export const SERP_CACHE_CANONICAL_LENS: SerpCacheLens = SERP_CACHE_LENSES[0];

/** O mesmo rótulo de `serpLensOf`: `desktop-windows`, `mobile-ios`… */
export const serpCacheLensLabel = (lens: SerpCacheLens) => `${lens.device}-${lens.operatingSystem}`;

/** Mesmo aparelho e mesmo sistema. */
export const sameSerpCacheLens = (a: SerpCacheLens, b: SerpCacheLens) => a.device === b.device && a.operatingSystem === b.operatingSystem;

export const SerpCacheEndpointSchema = z.enum(["advanced", "regular"]);
export type SerpCacheEndpoint = z.infer<typeof SerpCacheEndpointSchema>;

/* -------------------------------- validade -------------------------------- */

/**
 * Validade padrão: 30 dias.
 *
 * Medido em 2026-09-23, duas consultas idênticas feitas com segundos de
 * diferença divergem na cauda (Jaccard 0,35 entre a 11ª e a 20ª posição),
 * enquanto o top 6 fica estável. Recoletar antes do prazo não traz mais
 * verdade — traz ruído, e custa. Cada consumidor pode exigir menos.
 */
export const SERP_CACHE_DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A observação compacta é SEMPRE calculada no top 10, venha a entrada de
 * uma coleta de 10 ou de 20. Comparar uma keyword medida em 20 domínios com
 * outra medida em 10 tornaria a sobreposição injusta — e o top 10 é a parte
 * estável da SERP.
 */
export const SERP_CACHE_OBSERVATION_DEPTH = 10;

/* ---------------------------------- chave --------------------------------- */

export type SerpCacheQuery = {
  keyword: string;
  locationCode: number;
  languageCode: string;
  lens: SerpCacheLens;
  endpoint: SerpCacheEndpoint;
};

/**
 * Só `trim` e minúsculas — acentos e espaços internos ficam.
 *
 * O Minerador RECUSA um corpo cuja `result.keyword` não bata com a pedida, e
 * compara ignorando caixa e acentos, mas não espaços. Unir aqui dois textos
 * que ele trata como diferentes faria um acerto de cache ser recusado. Com
 * esta regra, dois textos só dividem entrada quando são a mesma consulta.
 */
export function normalizeSerpCacheKeyword(keyword: string): string {
  return keyword.trim().toLocaleLowerCase("pt-BR");
}

function hash64(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let indice = 0; indice < text.length; indice += 1) {
    const codigo = text.charCodeAt(indice);
    h1 = Math.imul(h1 ^ codigo, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + codigo, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/**
 * A identidade da entrada no banco.
 *
 * Hexadecimal de propósito: o texto da keyword pode ter aspas ou parênteses,
 * e o `postgrest-js` não escapa aspas embutidas num filtro `.in(...)` — a SDD
 * de egress registrou uma rota derrubada assim. Uma colisão de hash não
 * serve dado errado: a leitura confere os campos da consulta gravados em
 * `meta` e trata divergência como ausência.
 */
export function serpCacheSubjectId(query: SerpCacheQuery): string {
  const canonica = JSON.stringify([
    SERP_CACHE_CONTRACT_VERSION,
    normalizeSerpCacheKeyword(query.keyword),
    query.locationCode,
    query.languageCode.trim().toLowerCase(),
    query.lens.device,
    query.lens.operatingSystem,
    query.endpoint,
  ]);
  return `serp:v1:${hash64(canonica)}`;
}

/* --------------------------------- contrato ------------------------------- */

export const SerpCacheCollectorSchema = z.enum(["minerador", "arquiteto", "radar"]);

export const SerpCacheMetaSchema = z.object({
  /** A consulta como foi enviada ao provider. */
  keyword: z.string().min(1),
  normalizedKeyword: z.string().min(1),
  locationCode: z.number().int().positive(),
  languageCode: z.string().min(1),
  lens: SerpCacheLensSchema,
  endpoint: SerpCacheEndpointSchema,
  /** Quantos resultados foram pedidos. Serve quem pede igual ou menos. */
  depth: z.number().int().positive(),
  /** Quando a SERP foi observada. É daqui que a validade é contada. */
  collectedAt: z.string().min(1),
  providerRequestId: z.string().min(1).nullable(),
  /** A keyword do acervo, quando havia uma. Some junto com ela. */
  keywordId: z.string().min(1).nullable(),
  /** Quem pagou a chamada. */
  collectedBy: SerpCacheCollectorSchema,
}).strict();
export type SerpCacheMeta = z.infer<typeof SerpCacheMetaSchema>;

export const SerpCacheObservationSchema = z.object({
  lens: z.string().min(1),
  depth: z.number().int().positive(),
  /** Orgânicos e citados pelo AI Overview: quem disputa o universo. */
  competitorDomains: z.array(z.string().min(1)),
  organicCount: z.number().int().nonnegative(),
  itemTypes: z.array(z.string().min(1)),
  questions: z.array(z.string().min(1)),
  relatedSearches: z.array(z.string().min(1)),
  /** Só os citados pela resposta de IA do Google — a visibilidade nas IAs. */
  aiOverviewDomains: z.array(z.string().min(1)),
  commercialSignals: z.boolean(),
}).strict();
export type SerpCacheObservation = z.infer<typeof SerpCacheObservationSchema>;

/* ----------------------------- digest orgânico ---------------------------- */

/**
 * O DIGEST ORGÂNICO — a entrada compacta do classificador do Minerador nas
 * lentes que não guardam corpo (adendo `docs/03-minerador/propostas/adendo-
 * derivacao-v4-quatro-lentes-2026-09-23.md`, §3).
 *
 * Top 10 orgânico com TODOS os campos que `classifyOrganicItem` lê, os
 * vendedores de `popular_products` e os tipos de bloco, na mesma janela de
 * `trimSerpBodyToDepth`. Fica numa chave PRÓPRIA do payload (`payload.digest`),
 * e não dentro da observação: quem lê em modo `observation` (a SERP por keyword
 * do Arquiteto) não passa a baixar ~5 KB a mais por lente (R8 da SDD de egress).
 *
 * Os nomes dos campos são os do provider, para o classificador ler o digest
 * pelo MESMO caminho do corpo. `faq` vira `true` (o classificador só pergunta
 * se há FAQ), `snippet` só entra quando falta a descrição (é quando ele é lido)
 * e preço e nota só guardam o que decide. Aditivo e opcional: entrada gravada
 * antes dele continua válida, e a derivação a trata como lente faltante.
 */
export const SERP_ORGANIC_DIGEST_VERSION = "organic-digest-v1" as const;
/** A mesma régua da observação: o top 10 é a parte estável da SERP. */
export const SERP_ORGANIC_DIGEST_DEPTH = SERP_CACHE_OBSERVATION_DEPTH;

const TextoDoDigest = z.string().min(1);

export const SerpOrganicDigestItemSchema = z.object({
  rank_group: z.number().optional(),
  domain: TextoDoDigest.optional(),
  url: TextoDoDigest.optional(),
  title: TextoDoDigest.optional(),
  description: TextoDoDigest.optional(),
  snippet: TextoDoDigest.optional(),
  pre_snippet: TextoDoDigest.optional(),
  extended_snippet: TextoDoDigest.optional(),
  breadcrumb: TextoDoDigest.optional(),
  website_name: TextoDoDigest.optional(),
  timestamp: TextoDoDigest.optional(),
  date: TextoDoDigest.optional(),
  is_featured_snippet: z.literal(true).optional(),
  faq: z.literal(true).optional(),
  price: z.object({ current: z.number().optional(), displayed_price: TextoDoDigest.optional() }).strict().optional(),
  rating: z.object({ value: z.number().optional() }).strict().optional(),
}).strict();
export type SerpOrganicDigestItem = z.infer<typeof SerpOrganicDigestItemSchema>;

export const SerpOrganicDigestSchema = z.object({
  version: z.literal(SERP_ORGANIC_DIGEST_VERSION),
  /** `result.keyword` como o provider devolveu: o classificador recusa SERP de outra consulta. */
  keyword: z.string(),
  depth: z.number().int().positive(),
  organic: z.array(SerpOrganicDigestItemSchema),
  /** Tipos de bloco não orgânicos da janela, com contagem, na ordem em que aparecem. */
  blocks: z.array(z.object({ type: TextoDoDigest, count: z.number().int().positive() }).strict()),
  /** Vendedores de `popular_products` da janela, distintos, na ordem em que aparecem (R5). */
  sellers: z.array(TextoDoDigest),
}).strict();
export type SerpOrganicDigest = z.infer<typeof SerpOrganicDigestSchema>;

export const SerpCachePayloadSchema = z.object({
  contractVersion: z.literal(SERP_CACHE_CONTRACT_VERSION),
  meta: SerpCacheMetaSchema,
  observation: SerpCacheObservationSchema,
  /**
   * O corpo do provider, podado por `pruneSerpBody`.
   *
   * AUSENTE na lente sem leitor de corpo (gravação `storeBody: false`): quem
   * só agrupa lê `meta` + `observation`, e gravar ~26 KB que ninguém relê
   * custaria banco sem servir ninguém. Uma leitura em modo `body` de uma
   * entrada sem corpo é FALTA — o store não a devolve —, e quem precisa do
   * corpo paga e grava a entrada completa.
   */
  body: z.record(z.string(), z.unknown()).optional(),
  /**
   * O digest orgânico da lente (ver `SerpOrganicDigestSchema`). Gravado nas
   * lentes que não são a canônica; a canônica já guarda o corpo, e o digest
   * dela é recalculado em memória quando preciso.
   */
  digest: SerpOrganicDigestSchema.optional(),
}).strict();
export type SerpCachePayload = z.infer<typeof SerpCachePayloadSchema>;

/* --------------------------------- validade ------------------------------- */

export type SerpCacheFreshness =
  | { fresh: true; ageMs: number }
  | { fresh: false; ageMs: number | null; reason: string };

export function serpCacheFreshness(meta: Pick<SerpCacheMeta, "collectedAt">, input: {
  now: Date;
  maxAgeMs?: number;
}): SerpCacheFreshness {
  const coletada = Date.parse(meta.collectedAt);
  if (!Number.isFinite(coletada)) return { fresh: false, ageMs: null, reason: "data de coleta ilegível" };
  const idade = input.now.getTime() - coletada;
  const limite = input.maxAgeMs ?? SERP_CACHE_DEFAULT_MAX_AGE_MS;
  // Coleta "no futuro" é relógio torto, não frescor: não serve.
  if (idade < 0) return { fresh: false, ageMs: idade, reason: "data de coleta no futuro" };
  return idade <= limite ? { fresh: true, ageMs: idade } : { fresh: false, ageMs: idade, reason: "validade vencida" };
}

/**
 * A entrada atende este pedido?
 *
 * Confere a CONSULTA inteira, não só a chave: é isso que transforma uma
 * colisão de hash em ausência em vez de SERP de outra keyword.
 */
export function serpCacheEntryServes(meta: SerpCacheMeta, input: {
  query: SerpCacheQuery;
  depth: number;
  now: Date;
  maxAgeMs?: number;
}): { serves: true } | { serves: false; reason: string } {
  const q = input.query;
  if (meta.normalizedKeyword !== normalizeSerpCacheKeyword(q.keyword)) return { serves: false, reason: "outra keyword na mesma chave" };
  if (meta.locationCode !== q.locationCode) return { serves: false, reason: "outra localidade" };
  if (meta.languageCode.trim().toLowerCase() !== q.languageCode.trim().toLowerCase()) return { serves: false, reason: "outro idioma" };
  if (meta.lens.device !== q.lens.device || meta.lens.operatingSystem !== q.lens.operatingSystem) return { serves: false, reason: "outra lente" };
  if (meta.endpoint !== q.endpoint) return { serves: false, reason: "outro endpoint" };
  if (meta.depth < input.depth) return { serves: false, reason: `coletada com ${meta.depth} resultados; pedido de ${input.depth}` };
  const frescor = serpCacheFreshness(meta, { now: input.now, maxAgeMs: input.maxAgeMs });
  return frescor.fresh ? { serves: true } : { serves: false, reason: frescor.reason };
}

/* ---------------------------------- poda ---------------------------------- */

type Registro = Record<string, unknown>;
const registro = (value: unknown): Registro | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Registro : null;

const manter = (fonte: Registro, campos: readonly string[]) => {
  const saida: Registro = {};
  for (const campo of campos) if (campo in fonte) saida[campo] = fonte[campo];
  return saida;
};

/*
 * OS CAMPOS QUE OS TRÊS LEITORES REAIS TOCAM.
 *
 * Medido em 2026-09-23 com um Proxy que registrou cada acesso de
 * `normalizeDataForSeoSerpResponse` (Arquiteto e Radar),
 * `buildRadarSerpFeatureIntelligence` e `deriveSerpSemanticEvidence`
 * (Minerador) sobre três corpos reais `advanced`. O corpo de ~90 KB tinha
 * `popular_products` com 38 KB, dos quais só título, preço, nota e vendedor
 * são lidos; `xpath` e `highlighted` pesavam quase o mesmo que o texto útil.
 *
 * Tipo de item que NÃO está aqui passa INTEIRO: é mais barato gravar um bloco
 * desconhecido do que um acerto de cache devolver menos que a coleta.
 * `tests/serp-cache.test.mts` prova a equivalência nos três leitores.
 */
const RAIZ = ["version", "status_code", "status_message", "time", "cost", "tasks_count", "tasks_error", "tasks"] as const;
const TAREFA = ["id", "status_code", "status_message", "data", "result"] as const;
const RESULTADO = ["keyword", "type", "se_domain", "location_code", "language_code", "datetime", "se_results_count", "item_types", "items", "refinement_chips"] as const;
const POSICAO = ["type", "rank_group", "rank_absolute"] as const;

const CAMPOS_DO_ITEM: Record<string, readonly string[]> = {
  organic: [...POSICAO, "domain", "title", "url", "description", "snippet", "pre_snippet", "extended_snippet", "breadcrumb", "website_name", "is_featured_snippet", "timestamp", "date", "sitelinks", "faq", "price", "rating"],
  ai_overview: [...POSICAO, "markdown", "references"],
  images: [...POSICAO, "items", "related_image_searches"],
  people_also_ask: [...POSICAO, "items"],
  local_pack: [...POSICAO],
  popular_products: [...POSICAO, "items"],
  related_searches: [...POSICAO, "items"],
};

const CAMPOS_DO_SUBITEM: Record<string, readonly string[]> = {
  people_also_ask_element: ["type", "question", "title", "description", "url"],
  images_element: ["type", "alt", "url"],
  popular_products_element: ["type", "title", "price", "rating", "seller"],
};

/*
 * Dentro de um subitem, o que ainda sobra de objeto. Nos produtos, `image_url`
 * e `product_identifiers` somavam 12 KB por corpo e ninguém os lê; do preço só
 * `displayed_price`, da nota só valor e votos.
 */
const CAMPOS_ANINHADOS: Record<string, Record<string, readonly string[]>> = {
  popular_products_element: { price: ["displayed_price"], rating: ["value", "votes_count"] },
};

function podarSubitens(itens: unknown): unknown {
  if (!Array.isArray(itens)) return itens;
  return itens.map(subitem => {
    const r = registro(subitem);
    if (!r) return subitem; // string solta (related_searches) passa como veio
    const tipo = typeof r.type === "string" ? r.type : "";
    const campos = CAMPOS_DO_SUBITEM[tipo];
    if (!campos) return r;
    const podado = manter(r, campos);
    for (const [campo, internos] of Object.entries(CAMPOS_ANINHADOS[tipo] || {})) {
      const objeto = registro(podado[campo]);
      // Preço em texto solto também é lido: só objeto é recortado.
      if (objeto) podado[campo] = manter(objeto, internos);
    }
    return podado;
  });
}

/** Dos chips de refinamento, só o título é lido — o `url` de cada um pesava 6 KB. */
function podarChips(chips: unknown): unknown {
  const r = registro(chips);
  if (!r) return chips;
  const saida = manter(r, ["type", "items"]);
  if (Array.isArray(saida.items)) {
    saida.items = saida.items.map(chip => {
      const c = registro(chip);
      return c ? manter(c, ["type", "title"]) : chip;
    });
  }
  return saida;
}

function podarItem(item: unknown): unknown {
  const r = registro(item);
  if (!r || typeof r.type !== "string") return item;
  const campos = CAMPOS_DO_ITEM[r.type];
  if (!campos) return r;
  const podado = manter(r, campos);
  if ("items" in podado) podado.items = podarSubitens(podado.items);
  return podado;
}

/**
 * Poda o corpo do provider ao que os leitores usam. Nunca remove ITEM — só
 * campo —, porque a posição do People Also Ask é o índice na lista.
 */
export function pruneSerpBody(body: unknown): Registro {
  const raiz = registro(body);
  if (!raiz) return {};
  const saida = manter(raiz, RAIZ);
  if (Array.isArray(raiz.tasks)) {
    saida.tasks = raiz.tasks.map(tarefa => {
      const t = registro(tarefa);
      if (!t) return tarefa;
      const tp = manter(t, TAREFA);
      if (Array.isArray(t.result)) {
        tp.result = t.result.map(resultado => {
          const r = registro(resultado);
          if (!r) return resultado;
          const rp = manter(r, RESULTADO);
          if (Array.isArray(r.items)) rp.items = r.items.map(podarItem);
          if ("refinement_chips" in rp) rp.refinement_chips = podarChips(rp.refinement_chips);
          return rp;
        });
      }
      return tp;
    });
  }
  return saida;
}

/**
 * O corpo como o provider o teria devolvido com MENOS profundidade.
 *
 * Mantém os itens até passar o N-ésimo orgânico e recalcula `item_types` para
 * o que sobrou — senão o leitor de blocos anunciaria um bloco que ficou fora.
 */
export function trimSerpBodyToDepth(body: unknown, depth: number): Registro {
  const raiz = registro(body);
  if (!raiz) return {};
  const tarefas = Array.isArray(raiz.tasks) ? raiz.tasks : [];
  return {
    ...raiz,
    tasks: tarefas.map(tarefa => {
      const t = registro(tarefa);
      if (!t || !Array.isArray(t.result)) return tarefa;
      return {
        ...t,
        result: t.result.map(resultado => {
          const r = registro(resultado);
          if (!r || !Array.isArray(r.items)) return resultado;
          const mantidos: unknown[] = [];
          let organicos = 0;
          for (const item of r.items) {
            if (organicos >= depth) break;
            mantidos.push(item);
            if (registro(item)?.type === "organic") organicos += 1;
          }
          const tipos = [...new Set(mantidos.map(item => registro(item)?.type).filter((tipo): tipo is string => typeof tipo === "string"))];
          return { ...r, items: mantidos, ...(Array.isArray(r.item_types) ? { item_types: tipos } : {}) };
        }),
      };
    }),
  };
}

/* ----------------------------- digest orgânico ---------------------------- */

const textoDoDigest = (valor: unknown) => typeof valor === "string" ? valor.trim() : "";

/** Os textos que o classificador lê, com o nome do provider. O `snippet` vem à parte. */
const TEXTOS_DO_DIGEST = ["domain", "url", "title", "description", "pre_snippet", "extended_snippet", "breadcrumb", "website_name", "timestamp", "date"] as const;

/**
 * Um orgânico reduzido ao que decide a leitura dele. Cada campo segue a regra
 * exata do classificador: texto vazio some, `is_featured_snippet` só conta
 * `true`, FAQ só conta lista não vazia, preço só conta com valor ou preço
 * exibido, e a nota conta pela presença (página `.html` com nota é produto) e
 * pelo valor numérico.
 */
function itemDoDigest(item: Registro): SerpOrganicDigestItem {
  const saida: Record<string, unknown> = {};
  if (typeof item.rank_group === "number") saida.rank_group = item.rank_group;
  for (const campo of TEXTOS_DO_DIGEST) {
    const valor = textoDoDigest(item[campo]);
    if (valor) saida[campo] = valor;
  }
  // O classificador lê o snippet só quando falta a descrição.
  const snippet = saida.description ? "" : textoDoDigest(item.snippet);
  if (snippet) saida.snippet = snippet;
  if (item.is_featured_snippet === true) saida.is_featured_snippet = true;
  if (Array.isArray(item.faq) && item.faq.length > 0) saida.faq = true;
  const preco = registro(item.price);
  if (preco) {
    const exibido = textoDoDigest(preco.displayed_price);
    const valor = {
      ...(typeof preco.current === "number" ? { current: preco.current } : {}),
      ...(exibido ? { displayed_price: exibido } : {}),
    };
    if (Object.keys(valor).length) saida.price = valor;
  }
  const nota = registro(item.rating);
  if (nota) saida.rating = typeof nota.value === "number" ? { value: nota.value } : {};
  return saida as SerpOrganicDigestItem;
}

/**
 * Monta o digest orgânico a partir do corpo do provider — cru ou podado, dá o
 * mesmo (a poda mantém todo campo lido aqui; `tests/serp-cache.test.mts`).
 *
 * A janela é a de `trimSerpBodyToDepth`: os itens até o N-ésimo orgânico. É o
 * que uma coleta de profundidade N teria devolvido. `null` quando o corpo não
 * tem resultado — não é uma SERP.
 */
export function buildSerpOrganicDigest(body: unknown, depth: number = SERP_ORGANIC_DIGEST_DEPTH): SerpOrganicDigest | null {
  const tarefas = registro(body)?.tasks;
  const tarefa = registro(Array.isArray(tarefas) ? tarefas[0] : null);
  const resultado = registro(Array.isArray(tarefa?.result) ? tarefa.result[0] : null);
  if (!resultado) return null;
  const itens = (Array.isArray(resultado.items) ? resultado.items : []).map(registro).filter((item): item is Registro => Boolean(item));
  const janela: Registro[] = [];
  let organicos = 0;
  for (const item of itens) {
    if (organicos >= depth) break;
    janela.push(item);
    if (textoDoDigest(item.type) === "organic") organicos += 1;
  }
  const blocos = new Map<string, number>();
  const vendedores: string[] = [];
  for (const item of janela) {
    const tipo = textoDoDigest(item.type);
    if (!tipo || tipo === "organic") continue;
    blocos.set(tipo, (blocos.get(tipo) || 0) + 1);
    if (tipo !== "popular_products" || !Array.isArray(item.items)) continue;
    for (const produto of item.items) {
      const vendedor = textoDoDigest(registro(produto)?.seller);
      if (vendedor && !vendedores.includes(vendedor)) vendedores.push(vendedor);
    }
  }
  return {
    version: SERP_ORGANIC_DIGEST_VERSION,
    keyword: textoDoDigest(resultado.keyword),
    depth,
    organic: janela.filter(item => textoDoDigest(item.type) === "organic").map(itemDoDigest),
    blocks: [...blocos].map(([type, count]) => ({ type, count })),
    sellers: vendedores,
  };
}

/* ---------------------------------- linha --------------------------------- */

export type SerpCacheRowInput = {
  subjectType: string;
  subjectId: string;
  stage: string;
  state: string;
  sourceEntityId: string;
  articleId: string | null;
  payload: unknown;
};

/** A entrada nunca tem estado que envelhece sozinho: "vencida" é leitura, não escrita. */
export const SERP_CACHE_ROW_STATE = "collected" as const;

export function buildSerpCacheRow(payload: SerpCachePayload): SerpCacheRowInput {
  const valido = SerpCachePayloadSchema.parse(payload);
  const subjectId = serpCacheSubjectId(valido.meta);
  return {
    subjectType: SERP_CACHE_SUBJECT_TYPE,
    subjectId,
    stage: SERP_CACHE_STAGE,
    state: SERP_CACHE_ROW_STATE,
    /*
     * Com a keyword do acervo como origem, excluir a keyword apaga as
     * entradas dela: a exclusão remove toda linha da marca cujo
     * `source_entity_id` é o id da keyword. Sem isso a entrada ficaria órfã
     * para sempre — não há purga por validade nem DELETE para o servidor.
     */
    sourceEntityId: valido.meta.keywordId ?? subjectId,
    articleId: null,
    payload: valido,
  };
}
