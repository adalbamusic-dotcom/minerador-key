/**
 * LISTA LEVE DAS KEYWORDS — F6 da SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`
 * (item 4, §8.3 regras 5–7; D5: projeção por view).
 *
 * A planilha do Processador lia o `analise_semantica` inteiro de cada keyword
 * (AdalbaPro: ~2,0 MB para mostrar ~47 kB de colunas). A view
 * `minerador_keywords_lista_leve` (migration `20261016120000_listas_leves.sql`)
 * devolve, no lugar dele, `analise_leve`: o MESMO objeto sem os blocos pesados
 * que nenhuma coluna, filtro ou ordenação lê, e com os blocos pesados que a
 * planilha lê reduzidos às sub-chaves que os resolvers do Minerador leem.
 *
 * A lista de chaves NÃO é escolhida à mão: saiu do registro de leitura dos
 * resolvers da planilha sobre as linhas reais (Proxy que anota cada caminho
 * lido) e é PROVADA pelo teste de paridade
 * (`tests/listas-leves-paridade-2026-10-13.test.mts`): para cada linha,
 * `resolver(linha inteira) === resolver(projeção)`, coluna a coluna. A SQL da
 * view repete esta MESMA lista — outro teste lê a migration e compara.
 *
 * TRÊS REGRAS QUE TORNAM A LISTA LEVE SEGURA:
 *
 * 1. MARCA. A linha leve carrega `__lista_leve` dentro do `analise_semantica`.
 *    O spread `{ ...item.analise_semantica, x }` de qualquer escritor LEVA a
 *    marca junto; `assertFullKeywordSemanticForWrite` recusa a gravação. Nenhum
 *    caminho de escrita grava a partir da lista leve (R10 da SDD egress).
 * 2. APROVAÇÃO. A assinatura do pacote aprovado cobre o DNA inteiro e não pode
 *    ser calculada sobre a projeção. A view devolve `dna_hash` (md5 do conteúdo
 *    que a assinatura lê) e a tela guarda o VEREDITO (diverge · não diverge)
 *    calculado na linha inteira, por `id + dna_hash`. Sem veredito guardado, a
 *    linha é lida inteira (nunca "aprovada" por suposição).
 * 3. DETALHE POR ID. O painel do DNA, a seleção (que comanda as ações) e cada
 *    ação de uma linha trocam a linha leve pela linha inteira, lida por id.
 */

type Semantic = Record<string, unknown>;

/** A marca da linha leve, dentro do `analise_semantica`. Nunca existe no banco. */
export const LISTA_LEVE_KEY = "__lista_leve" as const;

/** A view leve (migration M-L). Sem ela, a tela lê a listagem de antes. */
export const MINERADOR_LIGHT_LIST_VIEW = "minerador_keywords_lista_leve" as const;

/** Versão do contrato da projeção: muda junto com a SQL da view. */
export const KEYWORD_LIGHT_PROJECTION_VERSION = 1 as const;

/**
 * Colunas que a tela pede à view. `analise_leve` vira `analise_semantica` com a
 * marca; `dna_hash` vai para a marca. Nenhuma coluna da tabela fica de fora.
 */
export const MINERADOR_LIGHT_LIST_COLUMNS = "id,brand_id,keyword,location,results_allintitle,volume_search,kgr_score,intent,status,created_at,lista_id,volume_source,group_id,deleted_at,purge_after,deleted_by,analise_leve,dna_hash" as const;

/**
 * O FORMATO da projeção, em árvore. Em cada objeto, a chave vale pelo nome
 * exato ou, sem ele, por `"*"`:
 *   `true`   copia o valor inteiro (como estiver, inclusive `null`);
 *   `false`  ou ausente sem `"*"` — a chave sai;
 *   objeto   o valor, se for objeto, é projetado pela sub-árvore (se não for
 *            objeto — array, texto, número, `null` —, vai inteiro).
 *
 * Na raiz, `"*": true`: toda chave pequena fica (uma chave nova no DNA aparece
 * na lista sem migration). Saem os blocos que só a escrita, o painel ou o CSV
 * leem; os pesados que a linha lê ficam só com as sub-chaves que os resolvers
 * leem (registro de leitura sobre as 326 keywords vivas de 2026-10-14). As
 * séries de medição (`MEASUREMENT_SERIES_PATHS`) saem, como na listagem de antes.
 *
 * A MESMA árvore está, como literal jsonb, na função
 * `public.minerador_keyword_analise_leve` da migration `20261016120000_listas_leves.sql`;
 * o teste de paridade compara as duas.
 */
export const KEYWORD_LIGHT_SHAPE = {
  // Raiz por LISTA DE PERMISSÃO: as 47 chaves que os resolvers da planilha leem ou
  // sondam (registro de leitura sobre as 326 keywords vivas das 4 marcas,
  // 2026-10-14). Chave nova lida pela planilha entra aqui E na migration (o
  // teste de paridade com a fixture acusa a falta).
  "*": false,
  allintitle_last_error: true,
  allintitle_measurement: { measuredAt: true, measured_at: true, provider: true, resultsAllintitle: true, results_allintitle: true, status: true },
  aprovacao: { approvedAt: true, approvedBy: true, contentHash: true, signature: true, version: true },
  dataforseo_keyword_overview: { executor: true, externalIntent: true, external_intent: true, keywordDifficulty: true, keyword_difficulty: true, mainIntent: true, main_intent: true, operationRequestId: true, provider: true },
  dataforseo_keyword_overview_last_error: true,
  dataforseo_keyword_overview_measurement: true,
  discovery_import: {
    source: true,
    lastMeasurement: true,
    dataforseo_keyword_overview: true,
    dataforseo_keyword_overview_measurement: true,
    importedMetrics: true,
    keywordOverview: true,
    metrics: true,
    sourceSnapshot: {
      measuredAt: true,
      provider: true,
      providerVersion: true,
      allintitleProvider: true,
      allintitle_provider: true,
      currencyCode: true,
      currency_code: true,
      dataforseo_keyword_overview: true,
      dataforseo_keyword_overview_measurement: true,
      importedMetrics: true,
      // Série mensal fora, como na listagem de antes (MEASUREMENT_SERIES_PATHS).
      metrics: { "*": true, monthlySearchVolumes: false },
      sourceData: { importedMetrics: true },
    },
  },
  dna_origem: true,
  evidencia_serp: { collectedAt: true, contentHash: true, funnel: true, intent: true, invalidada: true, lentes: true, semanticState: true, version: true, versionId: true },
  funnel: true,
  funnel_canonico: true,
  funnel_human: true,
  funnel_humano: true,
  funnel_revisado: true,
  // Proveniência da conclusão (quem/quando) fica no painel; o resto da revisão a linha lê.
  human_review: { "*": true, completedAt: false, completedBy: false },
  intencao_humana: true,
  intencao_principal: true,
  intencao_revisada: true,
  keyword_declared_principal: true,
  keyword_overview_measurement: true,
  keyword_page_type: true,
  keyword_page_type_stance: true,
  keyword_subject: true,
  keyword_subject_actor: true,
  keyword_subject_at: true,
  keyword_subject_conversion: true,
  keyword_subject_origin: true,
  kgrApplicability: true,
  kgr_aplicabilidade: true,
  kgr_aplicavel: true,
  kgr_applicability: true,
  kgr_decisao: true,
  kgr_decisao_origem: true,
  logicInputHash: true,
  logicProcessedAt: true,
  logicProcessorVersion: true,
  // A completude da Lógica (filtro "Com processo") confere estado E valor de cada campo.
  logical_output_contract: { version: true, fields: { "*": { state: true, value: true } } },
  niche: true,
  nicho: true,
  nicho_canonico: true,
  nicho_humano: true,
  nicho_override: true,
  nicho_revisado: true,
  primary_keyword_policy: true,
  // Histórico do vínculo fica no painel.
  site_origin: { "*": true, publication_link_history: false },
  volume_eligibility: { averageMonthlySearches: true, measuredAt: true, provider: true, status: true },
  volume_measurement: { averageCpcMicros: true, averageMonthlySearches: true, currencyCode: true, currency_code: true, match: true, measuredAt: true, provider: true, rawVolume: true, status: true },
} as const;

type Shape = boolean | { readonly [key: string]: Shape };

function asRecord(value: unknown): Semantic | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Semantic : null;
}

function keepByShape(value: unknown, shape: Shape): unknown {
  if (shape === true) return value;
  const record = asRecord(value);
  if (!record || typeof shape !== "object") return value;
  const result: Semantic = {};
  for (const [key, child] of Object.entries(record)) {
    const rule: Shape | undefined = key in shape ? shape[key] : shape["*"];
    if (rule === undefined || rule === false) continue;
    result[key] = keepByShape(child, rule);
  }
  return result;
}

/**
 * A projeção da view, em TypeScript (a mesma regra da SQL): usada pelos testes
 * de paridade e pela medição. A tela nunca projeta uma linha inteira que já
 * tem: a projeção é do banco.
 */
export function projectKeywordSemanticForList(semantic: Semantic | null | undefined): Semantic {
  return projectKeywordSemanticWithShape(semantic, KEYWORD_LIGHT_SHAPE as Shape);
}

/** A mesma projeção com outro formato (medição e testes). */
export function projectKeywordSemanticWithShape(semantic: Semantic | null | undefined, shape: Shape): Semantic {
  const source = { ...(asRecord(semantic) || {}) };
  delete source[LISTA_LEVE_KEY];
  return keepByShape(source, shape) as Semantic;
}

export type KeywordLightShape = Shape;

export type LightListMarker = {
  v: typeof KEYWORD_LIGHT_PROJECTION_VERSION;
  /** md5 do conteúdo que a assinatura da aprovação lê (colunas + DNA), calculado no banco. */
  dnaHash: string;
  /** Veredito da aprovação calculado na linha INTEIRA; ausente = sem registro de aprovação. */
  approvalDiverged?: boolean;
};

/** A marca da linha leve, ou `null` (linha inteira). */
export function readLightListMarker(semantic: unknown): LightListMarker | null {
  const marker = asRecord(asRecord(semantic)?.[LISTA_LEVE_KEY]);
  if (!marker || marker.v !== KEYWORD_LIGHT_PROJECTION_VERSION || typeof marker.dnaHash !== "string") return null;
  return {
    v: KEYWORD_LIGHT_PROJECTION_VERSION,
    dnaHash: marker.dnaHash,
    ...(typeof marker.approvalDiverged === "boolean" ? { approvalDiverged: marker.approvalDiverged } : {}),
  };
}

/** A linha (ou o `analise_semantica`) é a leve? Qualquer marca conta, até uma inválida. */
export function isLightKeywordSemantic(semantic: unknown): boolean {
  const record = asRecord(semantic);
  return Boolean(record && LISTA_LEVE_KEY in record);
}

export const LIGHT_ROW_WRITE_REFUSAL = "O DNA desta keyword ainda não foi carregado inteiro (a planilha mostra só as colunas). Nada foi gravado: abra a linha ou selecione-a e repita." as const;

/**
 * Toda gravação de `analise_semantica` a partir da tela passa por aqui: a
 * marca da lista leve (que viaja em qualquer spread) RECUSA a gravação.
 */
export function assertFullKeywordSemanticForWrite(...semantics: unknown[]): void {
  if (semantics.some(isLightKeywordSemantic)) throw new Error(LIGHT_ROW_WRITE_REFUSAL);
}

export type LightListViewRow = {
  id: string;
  analise_leve?: Semantic | null;
  dna_hash?: string | null;
  [column: string]: unknown;
};

/**
 * Linha da view → linha da planilha: `analise_leve` vira `analise_semantica`
 * com a marca. `approvalDiverged` é o veredito guardado para este `dna_hash`
 * (ou ausente quando a linha não tem registro de aprovação).
 */
export function lightKeywordRowFromView<T = Record<string, unknown>>(row: LightListViewRow, approvalDiverged?: boolean): T {
  const { analise_leve, dna_hash, ...columns } = row;
  const marker: LightListMarker = {
    v: KEYWORD_LIGHT_PROJECTION_VERSION,
    dnaHash: String(dna_hash || ""),
    ...(typeof approvalDiverged === "boolean" ? { approvalDiverged } : {}),
  };
  return { ...columns, analise_semantica: { ...(asRecord(analise_leve) || {}), [LISTA_LEVE_KEY]: marker } } as unknown as T;
}

/** A linha leve tem registro de aprovação (o bloco `aprovacao` fica na projeção)? */
export function lightRowHasApprovalRecord(semantic: unknown): boolean {
  const record = asRecord(asRecord(semantic)?.aprovacao);
  return Boolean(record && typeof record.signature === "string" && record.signature);
}

/*
 * CACHE DE APRESENTAÇÃO DO VEREDITO (AGENTS.md §10: nunca fonte canônica; nunca
 * limpo sem autorização — só as entradas desta marca saem quando a keyword some
 * da leitura inteira). Chave por ator + marca + recorte ("aprovacao").
 */
export type ApprovalVerdictCache = Record<string, { h: string; d: boolean }>;

export function approvalVerdictCacheKey(actorUserId: string, brandId: string): string {
  return `minerador:lista-leve:v${KEYWORD_LIGHT_PROJECTION_VERSION}:${actorUserId}:${brandId}:aprovacao`;
}

export function parseApprovalVerdictCache(raw: string | null | undefined): ApprovalVerdictCache {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = asRecord(parsed);
    if (!record) return {};
    const result: ApprovalVerdictCache = {};
    for (const [id, entry] of Object.entries(record)) {
      const value = asRecord(entry);
      if (value && typeof value.h === "string" && typeof value.d === "boolean") result[id] = { h: value.h, d: value.d };
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * A PRIMEIRA carga de uma marca neste navegador (cache sem a marca de início)
 * não lê a lista leve: lê a listagem de antes (o DNA sem as séries, que a
 * assinatura também não cobre), mais só `id,dna_hash` da view, e guarda os
 * vereditos. Ler leve + inteira das aprovadas custaria MAIS que a listagem
 * (AdalbaPro: 183 de 183 aprovadas). Da segunda carga em diante, a lista leve.
 */
export const APPROVAL_VERDICT_CACHE_STARTED = "__iniciado" as const;

export function approvalVerdictCacheStarted(cache: ApprovalVerdictCache): boolean {
  return APPROVAL_VERDICT_CACHE_STARTED in cache;
}

export function markApprovalVerdictCacheStarted(cache: ApprovalVerdictCache): ApprovalVerdictCache {
  return { ...cache, [APPROVAL_VERDICT_CACHE_STARTED]: { h: "", d: false } };
}

/** O veredito guardado vale só para o MESMO conteúdo (`dna_hash`). */
export function cachedApprovalVerdict(cache: ApprovalVerdictCache, id: string, dnaHash: string | null | undefined): boolean | undefined {
  const entry = cache[id];
  return entry && dnaHash && entry.h === dnaHash ? entry.d : undefined;
}

/**
 * Separa as linhas da view: as que já podem ficar leves (sem aprovação, ou com
 * veredito guardado para o mesmo conteúdo) e as que precisam da linha inteira
 * para o veredito.
 */
export function planLightListVerdicts(rows: readonly LightListViewRow[], cache: ApprovalVerdictCache): { light: Array<{ row: LightListViewRow; approvalDiverged?: boolean }>; needFull: string[] } {
  const light: Array<{ row: LightListViewRow; approvalDiverged?: boolean }> = [];
  const needFull: string[] = [];
  for (const row of rows) {
    if (!lightRowHasApprovalRecord(row.analise_leve)) { light.push({ row }); continue; }
    const verdict = cachedApprovalVerdict(cache, String(row.id), row.dna_hash);
    if (verdict === undefined || !row.dna_hash) needFull.push(String(row.id));
    else light.push({ row, approvalDiverged: verdict });
  }
  return { light, needFull };
}
