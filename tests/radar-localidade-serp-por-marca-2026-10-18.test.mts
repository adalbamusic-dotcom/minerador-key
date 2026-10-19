import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * ===== 2026-10-18 · A LOCALIDADE DA SERP POR MARCA (L1–L3) =====
 *
 * SDD `docs/compartilhado/sdd-localidade-serp-por-marca-2026-10-18.md` (aprovada pelo
 * dono em 2026-10-18). Fixtures, zero rede, zero chamada paga.
 *
 *   L1 · catálogo e resolvedor (vazio, "Brasil", nulo, leitura falha, texto
 *        desconhecido, "São Paulo" solto, a entrada a confirmar, a entrada ativa
 *        de fixture), isolamento por `brandId`, chave do cache por localidade e o
 *        rótulo do snapshot;
 *   L2 · cada ponto da SERP Google orgânica chama o resolvedor e nenhum lê o
 *        ambiente direto (forma da linha, com os comentários limpos); a config
 *        recebe a localidade; o que fica nacional continua nacional; a mesa
 *        mostra a SERP antiga NACIONAL marcada; a prévia de custo diz a cidade;
 *        o campo "Localização" da Marca diz a localidade que a SERP usa;
 *   L3 · o D11 geográfico (outra cidade ou UF do gazetteer do IBGE) na mesma
 *        régua: amostra relevante, medidas e `relevancia_d11` da SERP crua.
 */

const {
  BRAND_SERP_LOCATIONS,
  BRAND_SERP_NATIONAL,
  BRAND_SERP_SAO_PAULO_CITY,
  BRAND_SERP_LOCATION_CATALOG_VERSION,
  acceptedBrandSerpLocationLabels,
  brandSerpLocationHelperText,
  brandSerpPlanLocation,
  brandSerpTargetOf,
  resolveBrandSerpLocation,
  withBrandSerpLocation,
} = await import("../lib/marca/brand-serp-location.ts");
const { BRAND_SERP_LOCATION_COLUMNS, resolveBrandSerpTarget } = await import("../lib/server/brand-serp-target.ts");
const { SERP_CACHE_CANONICAL_LENS, SERP_CACHE_LENSES, SERP_CACHE_STAGE, SERP_CACHE_SUBJECT_TYPE, serpCacheEntryServes, serpCacheLensLabel, serpCacheSubjectId } = await import("../lib/editorial/serp-cache.ts");
const { readSerpSubjectFootprints } = await import("../lib/server/arquiteto-serp-subject-store.ts");
const { mergeSerpSubjectReads, serpSubjectNationalFallbackLabel, serpSubjectNationalFallbackStatus } = await import("../modules/arquiteto/serp-subject-model.ts");
const { mineradorSerpTargetCodes, serpTargetCodesFor } = await import("../lib/arquiteto/serp-lens-targeting.ts");
const { describeSerpPaidPlan, mergeSerpPaidPlans, buildSerpPaidPlan } = await import("../lib/arquiteto/serp-lens-plan.ts");
const { subjectDiscoverySerpRequests } = await import("../lib/minerador/subject-discovery-search.ts");
const { DATAFORSEO_LABS_LOCATION_CODE } = await import("../lib/minerador/dataforseo-labs-keyword-research-core.ts");
const { normalizeDataForSeoSerpResponse } = await import("../lib/server/dataforseo-serp-normalizer.ts");
const { buildDataForSeoSerpOperationRequest } = await import("../lib/server/dataforseo-serp-operation.ts");
const { radarCompetitiveRelevanceReasons, buildRadarCompetitiveReading, radarCompetitiveReadingInputOf } = await import("../lib/radar/competitive-reading.ts");
const { radarTerritoryOtherLocality, RADAR_TERRITORY_CITIES, RADAR_TERRITORY_UFS } = await import("../lib/radar/territory-gazetteer.ts");
const { radarSerpRawRows, radarSerpRawExport } = await import("../lib/radar/serp-raw-export.ts");

const NACIONAL = { locationCode: 2076, languageCode: "pt" };
const MARCA_A = "11111111-1111-4111-8111-111111111111";
const MARCA_B = "22222222-2222-4222-8222-222222222222";
/** A entrada da capital ATIVA, só na fixture: o catálogo real a mantém "a confirmar" até a L4. */
const SP_CONFERIDA = { ...BRAND_SERP_SAO_PAULO_CITY, codeConfirmation: { source: "fixture do teste", checkedAt: "2026-10-18" } };
const CATALOGO_COM_SP = [BRAND_SERP_NATIONAL, SP_CONFERIDA];
const SP = SP_CONFERIDA.territory!;

const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const ler = (caminho: string) => semComentarios(readFileSync(new URL(caminho, import.meta.url), "utf8"));

/* ------------------------------ um banco em memória ------------------------------ */

type Linha = Record<string, unknown>;
function caminhoDe(linha: Linha, expressao: string): unknown {
  const partes = expressao.split(/->>?/);
  let atual: unknown = linha;
  for (const parte of partes) {
    if (atual === null || atual === undefined) return null;
    atual = Array.isArray(atual) ? atual[Number(parte)] : (atual as Linha)[parte];
  }
  return atual ?? null;
}
class Consulta {
  filtros: Array<{ coluna: string; valor: unknown; tipo: "eq" | "in" | "is" }> = [];
  colunas = "*";
  constructor(private banco: Banco, readonly tabela: string) {}
  select(colunas: string) { this.colunas = colunas; return this; }
  eq(coluna: string, valor: unknown) { this.filtros.push({ coluna, valor, tipo: "eq" }); return this; }
  is(coluna: string, valor: unknown) { this.filtros.push({ coluna, valor, tipo: "is" }); return this; }
  in(coluna: string, valor: unknown[]) { this.filtros.push({ coluna, valor, tipo: "in" }); return this; }
  private linhas() {
    this.banco.chamadas.push({ tabela: this.tabela, colunas: this.colunas, filtros: this.filtros });
    if (this.banco.falhar.has(this.tabela)) return { data: null, error: { message: "banco fora" } };
    const todas = (this.banco.tabelas[this.tabela] || []).filter(linha => this.filtros.every(({ coluna, valor, tipo }) =>
      tipo === "in" ? (valor as unknown[]).includes(linha[coluna]) : tipo === "is" ? (linha[coluna] ?? null) === valor : linha[coluna] === valor));
    const projetar = (linha: Linha) => this.colunas === "*" ? structuredClone(linha) : Object.fromEntries(this.colunas.split(",").map(item => {
      const [apelido, expressao] = item.includes(":") ? item.split(":") : [item, item];
      return [apelido, structuredClone(caminhoDe(linha, expressao))];
    }));
    return { data: todas.map(projetar), error: null };
  }
  async maybeSingle() { const lido = this.linhas(); return { data: lido.data?.[0] ?? null, error: lido.error }; }
  then<T>(resolve: (valor: { data: Linha[] | null; error: { message: string } | null }) => T, reject?: (erro: unknown) => T) { return Promise.resolve(this.linhas()).then(resolve, reject); }
}
class Banco {
  tabelas: Record<string, Linha[]> = { marcas: [], editorial_workflow_items: [] };
  chamadas: Array<{ tabela: string; colunas: string; filtros: Consulta["filtros"] }> = [];
  falhar = new Set<string>();
  from(tabela: string) { return new Consulta(this, tabela); }
  marca(id: string, localizacao: string | null) { this.tabelas.marcas.push({ id, nome: `Marca ${id.slice(0, 4)}`, localizacao, site_url: "https://exemplo.com.br" }); return this; }
}

const cliente = (banco: Banco) => banco as unknown as Parameters<typeof resolveBrandSerpTarget>[0];
const AGORA = new Date("2026-10-18T12:00:00.000Z");
const metaDa = (keyword: string, codigos: { locationCode: number; languageCode: string }, lens: { device: string; operatingSystem: string }, collectedAt = "2026-10-10T12:00:00.000Z") => ({
  keyword, normalizedKeyword: keyword.trim().toLocaleLowerCase("pt-BR"), ...codigos, lens, endpoint: "advanced", depth: 20,
  collectedAt, providerRequestId: "req-1", keywordId: null, collectedBy: "arquiteto",
});
function semearCache(banco: Banco, marca: string, keyword: string, codigos: { locationCode: number; languageCode: string }, urls: string[]) {
  for (const lens of SERP_CACHE_LENSES) {
    const query = { keyword, ...codigos, lens, endpoint: "advanced" as const };
    banco.tabelas.editorial_workflow_items.push({
      marca_id: marca, subject_type: SERP_CACHE_SUBJECT_TYPE, stage: SERP_CACHE_STAGE, subject_id: serpCacheSubjectId(query),
      payload: { meta: metaDa(keyword, codigos, lens), observation: { competitorDomains: urls.map(url => new URL(url).hostname) }, digest: { organic: urls.map(url => ({ url })) } },
    });
  }
}

/* ===================================== L1 ===================================== */

test("L1 · catálogo: vazio, nulo e 'Brasil' são nacionais, sem aviso; 'São Paulo' solto é ambíguo; texto desconhecido fica guardado e não vale", () => {
  for (const valor of ["", "   ", null, undefined, 42]) {
    const lida = resolveBrandSerpLocation(valor);
    assert.equal(lida.status, "empty");
    assert.equal(lida.entry.scope, "national");
    assert.equal(lida.warning, null);
  }
  for (const valor of ["Brasil", "brasil", "BR", "Brasil inteiro"]) {
    const lida = resolveBrandSerpLocation(valor);
    assert.equal(lida.status, "national", valor);
    assert.equal(lida.entry.label, "Brasil");
    assert.equal(lida.warning, null);
  }
  const solto = resolveBrandSerpLocation("São Paulo");
  assert.equal(solto.status, "ambiguous");
  assert.equal(solto.entry.scope, "national");
  assert.match(solto.warning!, /ambíguo \(estado ou cidade\)/);
  assert.match(solto.warning!, /“São Paulo \(cidade\)”/);
  const desconhecido = resolveBrandSerpLocation("Grande SP e ABC");
  assert.equal(desconhecido.status, "unmatched");
  assert.equal(desconhecido.rawValue, "Grande SP e ABC", "o texto do campo é guardado como está");
  assert.match(desconhecido.warning!, /não está no catálogo e não é usado na SERP; o texto fica guardado/);
  assert.equal(BRAND_SERP_LOCATION_CATALOG_VERSION, "2026-10-18-br-sp", "versão com São Paulo (cidade) ativa (L4)");
});

test("L4 · 'São Paulo (cidade)' ATIVA: código 1001773 conferido no CSV público da DataForSEO (2026-10-18)", () => {
  assert.equal(BRAND_SERP_SAO_PAULO_CITY.codeConfirmation?.checkedAt, "2026-10-18");
  assert.match(BRAND_SERP_SAO_PAULO_CITY.codeConfirmation!.source, /1001773,"Sao Paulo,State of Sao Paulo,Brazil",20106,BR,City/);
  assert.equal(BRAND_SERP_SAO_PAULO_CITY.locationCode, 1001773);
  assert.deepEqual(acceptedBrandSerpLocationLabels(), ["Brasil", "São Paulo (cidade)"]);
  const real = resolveBrandSerpLocation("São Paulo (cidade)");
  assert.equal(real.status, "matched");
  assert.equal(real.entry.locationCode, 1001773);
  for (const valor of ["São Paulo (cidade)", "sao paulo (cidade)", "Cidade de São Paulo", "São Paulo - cidade"]) {
    const ativa = resolveBrandSerpLocation(valor, CATALOGO_COM_SP);
    assert.equal(ativa.status, "matched", valor);
    assert.equal(ativa.entry.locationCode, 1001773);
  }
});

test("L1 · o campo 'Localização' da Marca diz a SERP que vale, os valores aceitos e o que fica nacional", () => {
  assert.match(brandSerpLocationHelperText(""), /^SERP: Brasil \(nacional\)\. Valores aceitos: Brasil, São Paulo \(cidade\)\./);
  assert.match(brandSerpLocationHelperText("São Paulo"), /SERP: Brasil \(nacional\)\. “São Paulo” sozinho é ambíguo/);
  assert.match(brandSerpLocationHelperText("São Paulo (cidade)", CATALOGO_COM_SP), /^SERP: São Paulo \(cidade\)\. Valores aceitos: Brasil, São Paulo \(cidade\)\./);
  assert.match(brandSerpLocationHelperText(""), /Volume do Google Ads, allintitle, Labs, YouTube e Amazon ficam nacionais\. Mudar a localidade não coleta nada\./);
});

test("L1 · o alvo: marca nacional = os códigos do ambiente e o rótulo 'Brasil'; marca com cidade = o código dela, o idioma do ambiente e o território", () => {
  const nacional = brandSerpTargetOf({ brandId: MARCA_B, localizacao: "Brasil", national: { locationCode: 2076, languageCode: "PT" } });
  assert.deepEqual(nacional.codes, NACIONAL);
  assert.equal(nacional.label, "Brasil");
  assert.equal(nacional.source, "national");
  assert.equal(nacional.territory, null);
  const cidade = brandSerpTargetOf({ brandId: MARCA_A, localizacao: "São Paulo (cidade)", national: NACIONAL, catalog: CATALOGO_COM_SP });
  assert.deepEqual(cidade.codes, { locationCode: 1001773, languageCode: "pt" });
  assert.deepEqual(cidade.national, NACIONAL);
  assert.equal(cidade.label, "São Paulo (cidade)");
  assert.equal(cidade.source, "brand");
  assert.equal(cidade.territory?.uf, "SP");
  /* A config: marca nacional, o MESMO objeto; cidade, só a localidade muda. */
  const config = { login: "l", password: "p", baseUrl: "https://x", timeoutMs: 1000, locationCode: 2076, languageCode: "pt" };
  assert.equal(withBrandSerpLocation(config, nacional), config);
  assert.deepEqual(withBrandSerpLocation(config, cidade), { ...config, locationCode: 1001773 });
  assert.equal(brandSerpPlanLocation(nacional), null);
  assert.deepEqual(brandSerpPlanLocation(cidade), { label: "São Paulo (cidade)", scope: "city" });
});

test("L1 · o resolvedor do servidor lê `marcas.localizacao` pelo brandId, em coluna estreita; leitura falha, linha ausente ou de outra marca = nacional", async () => {
  const banco = new Banco().marca(MARCA_A, "São Paulo (cidade)").marca(MARCA_B, "");
  const a = await resolveBrandSerpTarget(cliente(banco), MARCA_A, { national: NACIONAL, catalog: CATALOGO_COM_SP });
  assert.equal(a.source, "brand");
  assert.deepEqual(banco.chamadas[0], { tabela: "marcas", colunas: BRAND_SERP_LOCATION_COLUMNS, filtros: [{ coluna: "id", valor: MARCA_A, tipo: "eq" }] });
  assert.equal(BRAND_SERP_LOCATION_COLUMNS, "id,localizacao");
  const b = await resolveBrandSerpTarget(cliente(banco), MARCA_B, { national: NACIONAL, catalog: CATALOGO_COM_SP });
  assert.equal(b.source, "national");
  assert.deepEqual(b.codes, NACIONAL);
  /* Com o catálogo real (São Paulo ativa desde a L4), a marca A vai para a cidade. */
  const real = await resolveBrandSerpTarget(cliente(banco), MARCA_A, { national: NACIONAL });
  assert.equal(real.source, "brand");
  assert.equal(real.codes.locationCode, 1001773);
  const ausente = await resolveBrandSerpTarget(cliente(banco), "33333333-3333-4333-8333-333333333333", { national: NACIONAL, catalog: CATALOGO_COM_SP });
  assert.equal(ausente.source, "national");
  assert.equal(ausente.readFailed, false);
  banco.falhar.add("marcas");
  const falha = await resolveBrandSerpTarget(cliente(banco), MARCA_A, { national: NACIONAL, catalog: CATALOGO_COM_SP });
  assert.equal(falha.source, "national");
  assert.equal(falha.readFailed, true, "a falha é dita, nunca escondida");
  assert.deepEqual(falha.codes, NACIONAL);
  /* Sem `national`, os códigos do ambiente (2076/"pt" por padrão). */
  const doAmbiente = await resolveBrandSerpTarget(cliente(new Banco()), MARCA_B);
  assert.deepEqual(doAmbiente.codes, { locationCode: 2076, languageCode: "pt" });
});

test("L1 · isolamento: a marca A em São Paulo e a B sem localidade, mesma keyword → chaves diferentes; B continua 2076; o cache de uma não serve à outra", async () => {
  const banco = new Banco().marca(MARCA_A, "São Paulo (cidade)").marca(MARCA_B, null);
  const a = await resolveBrandSerpTarget(cliente(banco), MARCA_A, { national: NACIONAL, catalog: CATALOGO_COM_SP });
  const b = await resolveBrandSerpTarget(cliente(banco), MARCA_B, { national: NACIONAL, catalog: CATALOGO_COM_SP });
  const consulta = (codigos: { locationCode: number; languageCode: string }) => ({ keyword: "internet fibra", ...codigos, lens: SERP_CACHE_CANONICAL_LENS, endpoint: "advanced" as const });
  assert.notEqual(serpCacheSubjectId(consulta(a.codes)), serpCacheSubjectId(consulta(b.codes)));
  assert.equal(b.codes.locationCode, 2076);
  /* A entrada nacional não serve ao pedido da cidade: "outra localidade". */
  const nacional = metaDa("internet fibra", NACIONAL, SERP_CACHE_CANONICAL_LENS) as never;
  assert.deepEqual(serpCacheEntryServes(nacional, { query: consulta(a.codes), depth: 10, now: AGORA }), { serves: false, reason: "outra localidade" });
  assert.deepEqual(serpCacheEntryServes(nacional, { query: consulta(b.codes), depth: 10, now: AGORA }), { serves: true });
  /* A A8 decide só o idioma: a localidade é a base da marca. */
  assert.deepEqual(mineradorSerpTargetCodes({ languageCode: "pt", sourceGeoTargetConstants: ["geoTargetConstants/2076"] }, a.codes), a.codes);
  assert.deepEqual(serpTargetCodesFor(new Map(), "kw-solta", a.codes), a.codes);
});

test("L1 · o rótulo do snapshot é o do que foi pedido (fecha o 'São Paulo' falso da SERP nacional); o hash usa os códigos", () => {
  const corpo = { status_code: 20000, tasks: [{ id: "t1", status_code: 20000, result: [{ keyword: "internet fibra", items: [{ type: "organic", rank_absolute: 1, title: "Internet fibra", url: "https://www.exemplo.com.br/internet", description: "Planos." }] }] }] };
  const busca = (location: string) => ({ brandId: MARCA_A, articleId: "artigo-1", articleDnaVersionId: "v1", keywordId: "kw-1", keywordDnaVersionId: "kv1", keyword: "internet fibra",
    location, language: "pt", device: "desktop" as const, operatingSystem: "windows" as const, expectedIntent: "", expectedFormat: "", requiredTopics: [], articleEntities: [], resultLimit: 10, version: 1, previousSnapshotId: null });
  const nacional = brandSerpTargetOf({ brandId: MARCA_B, localizacao: "São Paulo", national: NACIONAL });
  const cidade = brandSerpTargetOf({ brandId: MARCA_A, localizacao: "São Paulo (cidade)", national: NACIONAL, catalog: CATALOGO_COM_SP });
  assert.equal(normalizeDataForSeoSerpResponse(corpo, busca(nacional.label), nacional.codes, "2026-10-18T12:00:00.000Z", "t1").location, "Brasil", "a AdalbaPro tem 'São Paulo' no campo, mas a SERP é nacional: o rótulo diz Brasil");
  const daCidade = normalizeDataForSeoSerpResponse(corpo, busca(cidade.label), cidade.codes, "2026-10-18T12:00:00.000Z", "t1");
  assert.equal(daCidade.location, "São Paulo (cidade)");
  /* O pedido ao provider leva o código da marca. */
  const pedido = buildDataForSeoSerpOperationRequest({ keyword: "internet fibra", ...cidade.codes, device: "desktop", operatingSystem: "windows", resultLimit: 20, operationRequestId: "op-1", payloadDepth: "advanced" });
  assert.equal(pedido.body[0].location_code, 1001773);
});

/* ===================================== L2 ===================================== */

const PONTOS_DA_SERP_ORGANICA = [
  "../lib/server/arquiteto-serp-http.ts",
  "../app/api/arquiteto/keyword-serp/route.ts",
  "../app/api/arquiteto/territorial-serp/route.ts",
  "../app/api/arquiteto/serp-subject/route.ts",
  "../lib/server/arquiteto-differentiation-store.ts",
  "../app/api/arquiteto/cannibalization/run/route.ts",
  "../app/api/arquiteto/published-reinforcement/search/run/route.ts",
  "../app/api/editorial/serp/route.ts",
  "../lib/server/radar-support-research.ts",
  "../lib/server/radar-portable-export-core.ts",
];

test("L2 · forma da linha: todo ponto da SERP Google orgânica chama o resolvedor da marca e nenhum lê o ambiente direto nem rotula com o texto do cliente", () => {
  for (const ponto of PONTOS_DA_SERP_ORGANICA) {
    const fonte = ler(ponto);
    assert.match(fonte, /resolveBrandSerpTarget\(/, `${ponto}: sem o resolvedor da marca`);
    assert.doesNotMatch(fonte, /readDataForSeoTargetCodes/, `${ponto}: lê os códigos do ambiente direto`);
    assert.doesNotMatch(fonte, /location: (?:input\.location|parsed\.data\.location|"Brasil")/, `${ponto}: rotula com o texto do pedido`);
  }
  /* Um resolvedor só: o servidor lê a localidade, nunca o pedido. */
  const resolvedor = ler("../lib/server/brand-serp-target.ts");
  assert.match(resolvedor, /\.from\("marcas"\)\s*\.select\(BRAND_SERP_LOCATION_COLUMNS\)\s*\.eq\("id", brandId\)/);
  assert.doesNotMatch(resolvedor, /\.location\b|\blocation\??:/, "nenhum 'location' de pedido entra no resolvedor");
});

test("L2 · a config DataForSEO recebe a localidade da marca nos três pontos pagos do Arquiteto (a chave é o que vai ao provider)", () => {
  assert.match(ler("../lib/server/arquiteto-serp-http.ts"), /config: withBrandSerpLocation\(resolvida\.config, alvoDaMarca\)/);
  assert.equal((ler("../app/api/arquiteto/keyword-serp/route.ts").match(/dataForSeo = \{ \.\.\.dataForSeo, config: withBrandSerpLocation\(dataForSeo\.config, alvoDaMarca\) \};/g) || []).length, 2, "nas duas resoluções da config");
  assert.match(ler("../app/api/arquiteto/territorial-serp/route.ts"), /config: withBrandSerpLocation\(resolvida\.config, alvoDaMarca\)/);
  /* A guarda de retrabalho recebe o rótulo resolvido: localidade nova = composição nova. */
  assert.match(ler("../lib/server/arquiteto-serp-http.ts"), /location: alvoDaMarca\.label,\s*language: parsed\.data\.language,\s*override: parsed\.data\.reworkOverride/);
  /* O Radar: os códigos e o rótulo da marca, na canônica e na auxiliar; o apoio também. */
  const radar = ler("../app/api/editorial/serp/route.ts");
  assert.match(radar, /readRadarKeywordTargetCodes\(cliente, input\.brandId, resolved\.keywordId, alvoDaMarca\.codes\)/);
  assert.match(radar, /readRadarKeywordTargetCodes\(clienteDaAuxiliar, input\.brandId, reference\.keywordId, alvoDaMarca\.codes\)/);
  assert.equal((radar.match(/location: alvoDaMarca\.label/g) || []).length, 2);
  assert.match(ler("../lib/server/radar-support-research.ts"), /location: alvoDaMarca\.label/);
});

test("L2 · pedido ao provider (fetch falso): o núcleo das 4 lentes do Radar pede e grava na chave da cidade da marca; a config da formação casa com a chave", async () => {
  const { collectRadarSerpLensSnapshot } = await import("../lib/server/radar-serp-lenses.ts");
  const { formationSerpCodesMatch } = await import("../lib/arquiteto/dataforseo-serp-compatibility.ts");
  const cidade = brandSerpTargetOf({ brandId: MARCA_A, localizacao: "São Paulo (cidade)", national: NACIONAL, catalog: CATALOGO_COM_SP });
  const banco = new Banco();
  const pedidos: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    const [pedido] = JSON.parse(String(init?.body)) as Array<Record<string, unknown>>;
    pedidos.push(pedido);
    return new Response(JSON.stringify({ status_code: 20000, tasks: [{ id: `t-${pedidos.length}`, status_code: 20000, cost: 0.0035, data: { device: pedido.device, os: pedido.os },
      result: [{ keyword: pedido.keyword, items: [{ type: "organic", rank_absolute: 1, rank_group: 1, title: "Internet fibra em São Paulo", url: "https://www.provedor.com.br/sp", domain: "www.provedor.com.br", description: "Planos na capital." }] }] }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const config = { login: "l", password: "p", baseUrl: "https://api.exemplo.test", timeoutMs: 5000, locationCode: 2076, languageCode: "pt" };
  const coleta = await collectRadarSerpLensSnapshot({
    context: { supabase: banco as never, brandId: MARCA_A, actorUserId: "ator" },
    searchInput: { brandId: MARCA_A, articleId: "artigo-1", articleDnaVersionId: "v1", keywordId: "kw-1", keywordDnaVersionId: "kv1", keyword: "internet fibra", location: cidade.label, language: "pt", device: "desktop", operatingSystem: "windows", expectedIntent: "", expectedFormat: "", requiredTopics: [], articleEntities: [], resultLimit: 10, version: 1, previousSnapshotId: null },
    codes: cidade.codes, codesSource: "environment", cacheKeywordId: null, previous: null, recollect: false, now: AGORA, operationRequestId: "op-1",
  }, { resolveConfig: async () => ({ config: withBrandSerpLocation(config, cidade), resource: { id: "recurso" } as never }), recordUsage: async () => undefined, fetchImpl });
  assert.equal(pedidos.length, 4, "as quatro lentes pagas (cache vazio)");
  assert.ok(pedidos.every(pedido => pedido.location_code === 1001773), "o corpo leva o código da cidade da marca");
  assert.equal(coleta.research.location, "São Paulo (cidade)");
  assert.equal(coleta.research.cacheProvenance?.locationCode, 1001773);
  const lidas = banco.chamadas.filter(item => item.tabela === "editorial_workflow_items").flatMap(item => item.filtros.filter(filtro => filtro.coluna === "subject_id").flatMap(filtro => filtro.valor as string[]));
  const daCidade = SERP_CACHE_LENSES.map(lens => serpCacheSubjectId({ keyword: "internet fibra", ...cidade.codes, lens, endpoint: "advanced" }));
  assert.ok(daCidade.every(id => lidas.includes(id)), "o cache é lido na chave da cidade");
  /* A formação: a chave da marca e a config com a localidade da marca casam — nada é descartado. */
  assert.equal(formationSerpCodesMatch(cidade.codes, withBrandSerpLocation(config, cidade)), true);
  assert.equal(formationSerpCodesMatch(cidade.codes, config), false, "sem a localidade na config, a divergência descartaria o cache");
});

test("L2 · o que fica nacional: allintitle (KGR), Labs, YouTube e Amazon não usam a localidade da marca", () => {
  for (const ponto of [
    "../app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts",
    "../app/api/arquiteto/article-allintitle/route.ts",
    "../lib/minerador/dataforseo-labs-keyword-research-core.ts",
    "../app/api/editorial/radar-youtube-search/route.ts",
    "../app/api/editorial/radar-amazon-search/route.ts",
  ]) {
    assert.doesNotMatch(ler(ponto), /resolveBrandSerpTarget|brand-serp-target|withBrandSerpLocation/, `${ponto}: devia ficar nacional`);
  }
  assert.equal(DATAFORSEO_LABS_LOCATION_CODE, 2076);
  /* A marca nacional na diferenciação: a chave de sempre (Labs, Brasil); com cidade, a dela. */
  assert.equal(subjectDiscoverySerpRequests("internet fibra", null)[0].request.query.locationCode, 2076);
  assert.equal(subjectDiscoverySerpRequests("internet fibra", null, null)[0].request.query.locationCode, 2076);
  assert.equal(subjectDiscoverySerpRequests("internet fibra", null, { locationCode: 1001773, languageCode: "pt" })[0].request.query.locationCode, 1001773);
});

test("L2 · a mesa: com cidade, a lente que só tem a SERP antiga NACIONAL aparece marcada; a da cidade, quando existe, vence; sem recuo, a leitura de antes", async () => {
  const banco = new Banco();
  const CIDADE = { locationCode: 1001773, languageCode: "pt" };
  semearCache(banco, MARCA_A, "internet fibra", NACIONAL, ["https://www.nacional.com.br/a"]);
  semearCache(banco, MARCA_A, "provedor de internet", NACIONAL, ["https://www.nacional.com.br/b"]);
  semearCache(banco, MARCA_A, "provedor de internet", CIDADE, ["https://www.cidade.com.br/b"]);
  const contexto = { supabase: banco as never, brandId: MARCA_A, actorUserId: "ator" };
  const alvos = [{ keywordId: "kw-1", keyword: "internet fibra", ...CIDADE }, { keywordId: "kw-2", keyword: "provedor de internet", ...CIDADE }];

  const comRecuo = await readSerpSubjectFootprints(contexto, alvos, { now: AGORA, nationalFallback: NACIONAL });
  const kw1 = comRecuo.footprints.find(item => item.keywordId === "kw-1")!;
  assert.equal(kw1.lenses.length, 4);
  assert.ok(kw1.lenses.every(lente => lente.nationalFallback === true && lente.urls?.[0] === "https://www.nacional.com.br/a"));
  const kw2 = comRecuo.footprints.find(item => item.keywordId === "kw-2")!;
  assert.ok(kw2.lenses.every(lente => !lente.nationalFallback && lente.urls?.[0] === "https://www.cidade.com.br/b"), "a SERP da cidade vence a nacional");
  assert.equal(comRecuo.nationalFallback?.length, 4);
  assert.deepEqual([...new Set(comRecuo.nationalFallback!.map(item => item.keywordId))], ["kw-1"]);
  assert.deepEqual(comRecuo.missingLenses, []);

  const semRecuo = await readSerpSubjectFootprints(contexto, alvos, { now: AGORA });
  assert.equal(semRecuo.footprints.find(item => item.keywordId === "kw-1")!.lenses.length, 0, "sem recuo, a nacional não serve à cidade");
  assert.ok(semRecuo.missingLenses.filter(item => item.keywordId === "kw-1").every(item => item.reason === "sem entrada no cache"));
  assert.equal("nationalFallback" in semRecuo, false, "a resposta de antes, sem campo novo");

  /* A tela: a linha da leitura diz quantas keywords têm a SERP antiga marcada. */
  const juntas = mergeSerpSubjectReads([{ ...comRecuo, targetingReadFailed: false, serpLocation: "São Paulo (cidade)" }]);
  const status = serpSubjectNationalFallbackStatus(juntas);
  assert.deepEqual(status, { serpLocation: "São Paulo (cidade)", nationalFallbackKeywords: 1 });
  assert.equal(serpSubjectNationalFallbackLabel(status), " 1 keyword(s) com a SERP antiga, nacional (marcada): a marca agora é São Paulo (cidade). A coleta local é pelo botão de sempre, com o custo antes.");
  assert.deepEqual(serpSubjectNationalFallbackStatus(mergeSerpSubjectReads([{ ...semRecuo, targetingReadFailed: false }])), {}, "marca nacional: a linha de antes");
  /* A rota só pede o recuo à marca com cidade. */
  assert.match(ler("../app/api/arquiteto/serp-subject/route.ts"), /alvoDaMarca\.source === "brand" \? \{ nationalFallback: alvoDaMarca\.national \} : \{\}/);
  assert.match(ler("../modules/arquiteto/serp-subject-panels.tsx"), /\$\{serpSubjectNationalFallbackLabel\(read\)\}/);
});

test("L2 · a prévia de custo diz a cidade (marca com cidade); a marca nacional vê a prévia de antes", async () => {
  const plano = buildSerpPaidPlan({ lenses: SERP_CACHE_LENSES, slots: [{ payKey: "k", dateGroup: "k", lens: SERP_CACHE_CANONICAL_LENS, primary: true, conditional: false, payable: true, hitCollectedAt: null, missReason: "sem entrada" }], payMissingExtraLenses: true, recollectStaleLenses: false });
  const antes = describeSerpPaidPlan(plano).headline;
  assert.equal(antes, "Até 1 chamada(s) paga(s): 1 na lente principal e 0 nas lentes extras.");
  const comCidade = { ...plano, location: { label: "São Paulo (cidade)", scope: "city" as const } };
  assert.equal(describeSerpPaidPlan(comCidade).headline, `${antes} SERP de São Paulo (cidade).`);
  assert.deepEqual(mergeSerpPaidPlans([plano, comCidade]).location, { label: "São Paulo (cidade)", scope: "city" });
  assert.equal("location" in mergeSerpPaidPlans([plano, plano]), false);
  for (const ponto of ["../lib/server/arquiteto-serp-http.ts", "../app/api/arquiteto/keyword-serp/route.ts", "../app/api/arquiteto/territorial-serp/route.ts"]) {
    assert.match(ler(ponto), /brandSerpPlanLocation\(alvoDaMarca\)/, `${ponto}: a prévia não diz a localidade`);
  }
  /* A prévia de sempre (o diálogo do plano pago), renderizada: a frase com a cidade; os botões de sempre. */
  const { renderToStaticMarkup } = await import("react-dom/server");
  const React = await import("react");
  const { SerpPaidPlanDialog } = await import("../modules/arquiteto/serp-paid-plan-dialog.tsx");
  const html = (plan: typeof plano) => renderToStaticMarkup(React.createElement(SerpPaidPlanDialog, { title: "Validar no Google", plan, buttonClassName: "b", primaryButtonClassName: "p", onChoose: () => undefined, onCancel: () => undefined }));
  const daCidade = html(comCidade);
  assert.match(daCidade, /data-testid="architect-serp-paid-plan-headline">Até 1 chamada\(s\) paga\(s\): 1 na lente principal e 0 nas lentes extras\. SERP de São Paulo \(cidade\)\.</);
  const nacional = html(plano);
  assert.doesNotMatch(nacional, /SERP de /, "a marca nacional vê a prévia de antes");
  assert.equal((daCidade.match(/<button/g) || []).length, (nacional.match(/<button/g) || []).length, "nenhum botão novo");
});

test("L2 · a Marca: o campo 'Localização' de sempre mostra a SERP que vale e sugere o catálogo, sem botão nem painel novo", () => {
  const pagina = ler("../modules/marca/brand-page.tsx");
  const campo = pagina.slice(pagina.indexOf("([\"nome\", \"nicho\", \"localizacao\"] as const).map"), pagina.indexOf("O endereço do site é gerenciado"));
  assert.match(campo, /key === "localizacao" \? \{ list: "marca-localizacao-serp", "aria-describedby": "marca-localizacao-serp-ajuda" \}/);
  assert.match(campo, /<datalist id="marca-localizacao-serp">\{BRAND_SERP_LOCATIONS\.map\(entry => <option key=\{entry\.id\} value=\{entry\.label\}\/>\)\}<\/datalist>/);
  assert.match(campo, /<span id="marca-localizacao-serp-ajuda" className="mt-2 block text-sm font-normal leading-6 text-text-muted">\{brandSerpLocationHelperText\(form\.localizacao\)\}<\/span>/);
  assert.doesNotMatch(campo, /<button/, "nenhum botão novo no campo");
  assert.equal(BRAND_SERP_LOCATIONS.length, 2);
  /* O que a Marca grava continua o texto do campo: nada muda no PUT. */
  assert.match(ler("../app/api/marcas/route.ts"), /localizacao: body\.localizacao\?\.trim\(\) \|\| ""/);
});

/* ===================================== L3 ===================================== */

test("L3 · o gazetteer: as 27 UFs, as 27 capitais e os municípios de 500 mil+ do Censo 2022 (IBGE)", () => {
  assert.equal(RADAR_TERRITORY_UFS.length, 27);
  assert.equal(RADAR_TERRITORY_CITIES.filter(cidade => cidade.capital).length, 27);
  assert.equal(RADAR_TERRITORY_CITIES.length, 47, "41 municípios de 500 mil+ e as 6 capitais abaixo do corte");
  assert.ok(RADAR_TERRITORY_CITIES.some(cidade => cidade.nome === "Serra" && cidade.uf === "ES"), "o último acima do corte (520.653)");
  assert.equal(RADAR_TERRITORY_CITIES.some(cidade => cidade.nome === "Campos dos Goytacazes"), false, "o primeiro abaixo do corte (483.540) fica fora");
});

test("L3 · D11 geográfico: outra cidade ou UF sai 'fora do território: outra localidade'; nacional e a cidade da marca ficam; o nome comum precisa da UF", () => {
  const contexto = { core: ["internet fibra"], audience: "Moradores que procuram internet em casa.", location: SP };
  const motivo = (texto: string, url: string | null = null) => radarCompetitiveRelevanceReasons(texto, null, contexto, null, { url });
  assert.deepEqual(motivo("Internet fibra em Curitiba | Provedor Sul"), ["fora do território: outra localidade (Curitiba; a marca atende São Paulo (cidade))"]);
  assert.deepEqual(motivo("Melhor internet de Belo Horizonte"), ["fora do território: outra localidade (Belo Horizonte; a marca atende São Paulo (cidade))"]);
  assert.deepEqual(motivo("Comparador de planos de internet no Brasil"), []);
  assert.deepEqual(motivo("Internet fibra em São Paulo e Curitiba"), [], "cita a da marca: fica");
  assert.deepEqual(motivo("Planos de internet na capital paulista e em Campinas"), [], "o apelido do catálogo conta como a marca");
  assert.deepEqual(motivo("Promoção de Natal: internet grátis por um mês"), [], "Natal sem a UF é a data, não a cidade");
  assert.deepEqual(motivo("Internet fibra em Natal/RN"), ["fora do território: outra localidade (Natal; a marca atende São Paulo (cidade))"]);
  assert.deepEqual(motivo("Internet em Minas Gerais e Goiás"), ["fora do território: outra localidade (Minas Gerais, Goiás; a marca atende São Paulo (cidade))"]);
  assert.deepEqual(motivo("Planos residenciais", "https://www.provedor.com.br/internet-fibra-curitiba-pr"), ["fora do território: outra localidade (Curitiba; a marca atende São Paulo (cidade))"], "o caminho da URL conta");
  assert.deepEqual(motivo("Planos residenciais", "https://www.provedor.com.br/internet-fibra-sao-paulo"), []);
  assert.equal(radarTerritoryOtherLocality("Internet em Belém do Pará", null, SP), "Belém");
  /* Sem território (marca nacional): nenhum motivo geográfico, a régua de antes. */
  assert.deepEqual(radarCompetitiveRelevanceReasons("Internet fibra em Curitiba | Provedor Sul", null, { core: ["internet fibra"] }, null, { url: "https://www.provedor.com.br/curitiba" }), []);
  assert.equal(radarTerritoryOtherLocality("Internet fibra em Curitiba", null, null), null);
});

const pagina = (url: string, title: string, words: number) => ({ url, domain: new URL(url).hostname.replace(/^www\./, ""), title, bestPosition: null, words, h2: 6, concepts: ["planos", "velocidade"], headings: ["Planos", "Velocidade"] });
const LEITURA = () => ({
  principal: "internet fibra",
  core: ["provedor de internet"],
  audience: "Moradores que procuram internet em casa.",
  organic: [
    { position: 1, title: "Internet fibra em Curitiba | Provedor Sul", url: "https://www.provedorsul.com.br/curitiba", domain: "provedorsul.com.br", snippet: "Planos de internet fibra em Curitiba." },
    { position: 2, title: "Internet fibra em Belo Horizonte", url: "https://www.provedorbh.com.br/", domain: "provedorbh.com.br", snippet: "Os melhores planos em BH." },
    { position: 3, title: "Comparador de planos de internet fibra", url: "https://www.comparador.com.br/internet-fibra", domain: "comparador.com.br", snippet: "Compare os planos dos provedores do Brasil." },
  ],
  pages: [
    pagina("https://www.provedorsul.com.br/curitiba", "Internet fibra em Curitiba | Provedor Sul", 1800),
    pagina("https://www.provedorbh.com.br/", "Internet fibra em Belo Horizonte", 2000),
    pagina("https://www.comparador.com.br/internet-fibra", "Comparador de planos de internet fibra", 2200),
  ],
  concepts: [], peopleAlsoAsk: [], aiOverview: null, titlePatterns: [], marketOnlyEntities: [], recommendedAngle: null, recommendedDifferentiation: [],
});

test("L3 · a amostra relevante e a faixa de referência (D12) batem: os dois provedores de outra cidade saem marcados; o comparador nacional fica", () => {
  const comCidade = buildRadarCompetitiveReading({ ...LEITURA(), territory: SP });
  assert.equal(comCidade.sample.total, 3);
  assert.equal(comCidade.sample.relevant, 1);
  assert.deepEqual(comCidade.sample.excluded.map(item => [item.domain, item.reasons]), [
    ["provedorsul.com.br", ["fora do território: outra localidade (Curitiba; a marca atende São Paulo (cidade))"]],
    ["provedorbh.com.br", ["fora do território: outra localidade (Belo Horizonte; a marca atende São Paulo (cidade))"]],
  ]);
  assert.deepEqual(comCidade.reference.words, { min: 2200, max: 2200, median: 2200 }, "a medida sai só da amostra relevante");
  const nacional = buildRadarCompetitiveReading(LEITURA());
  assert.equal(nacional.sample.relevant, 3);
  assert.deepEqual(nacional.sample.excluded, []);
  /* A ponte do pacote: o território só entra quando a montagem o pôs (marca com cidade). */
  const entrada = { article: { principalKeyword: "internet fibra", secondaryKeywords: [], narrativeReinforcements: [], intent: null, funnel: null, siloName: null, articleRole: null, slug: null, mustCover: [] }, googleObserved: null, competitorOutlines: null, serpRawPages: null, blueprintView: null } as never;
  assert.equal("territory" in radarCompetitiveReadingInputOf(entrada, { serpObserved: null, base: null }), false);
  assert.deepEqual(radarCompetitiveReadingInputOf({ ...(entrada as object), serpTerritory: SP } as never, { serpObserved: null, base: null }).territory, SP);
});

test("L3 · a SERP crua e o CSV dizem o motivo em `relevancia_d11`; sem território, tudo 'relevante' como antes", () => {
  const organico = (position: number, title: string, url: string, snippet: string) => ({ position, title, url, domain: new URL(url).hostname.replace(/^www\./, ""), snippet, sitelinks: [], date: null, inferredType: "article", confidence: "high", manualType: null, notes: "" });
  const snapshot = {
    query: "internet fibra", country: "BR", language: "pt", location: "São Paulo (cidade)", device: "desktop", operatingSystem: "windows", collectedAt: "2026-10-18T12:00:00.000Z", status: "approved",
    organicResults: [
      organico(1, "Internet fibra em Curitiba | Provedor Sul", "https://www.provedorsul.com.br/curitiba", "Planos em Curitiba."),
      organico(2, "Internet fibra em Belo Horizonte", "https://www.provedorbh.com.br/", "Planos em BH."),
      organico(3, "Comparador de planos de internet fibra", "https://www.comparador.com.br/internet-fibra", "Compare os provedores do Brasil."),
    ],
    peopleAlsoAsk: [], relatedSearches: [], knowledgeGraph: null, diagnostic: null, serpFeatures: null,
  };
  const entrada = { article: { principalKeyword: "internet fibra", secondaryKeywords: [], narrativeReinforcements: [], audience: null }, serpObserved: { snapshot: snapshot as never } };
  const relevancia = (linhas: ReturnType<typeof radarSerpRawRows>) => linhas.filter(linha => linha.tipo === "orgânico" && linha.url).map(linha => linha.relevancia_d11);
  assert.deepEqual(relevancia(radarSerpRawRows({ ...entrada, territory: SP })), [
    "irrelevante (D11): fora do território: outra localidade (Curitiba; a marca atende São Paulo (cidade))",
    "irrelevante (D11): fora do território: outra localidade (Belo Horizonte; a marca atende São Paulo (cidade))",
    "relevante",
  ]);
  assert.deepEqual(relevancia(radarSerpRawRows(entrada)), ["relevante", "relevante", "relevante"]);
  assert.equal(JSON.stringify(radarSerpRawRows(entrada)), JSON.stringify(radarSerpRawRows({ ...entrada, territory: null })), "sem território, o arquivo de antes, byte a byte");
  /* O arquivo do lote lê o território que a montagem pôs na entrada (marca com cidade). */
  const [arquivo] = radarSerpRawExport({ articles: [{ articleId: "a1", entrada: { ...entrada, article: { ...entrada.article, slug: "internet-fibra" }, serpTerritory: SP }, lentes: [{ keyword: "internet fibra", role: "principal" }] }], lookups: [], today: "2026-10-18T12:00:00.000Z" });
  assert.match(arquivo.csv, /fora do território: outra localidade \(Curitiba; a marca atende São Paulo \(cidade\)\)/);
  assert.match(arquivo.csv, /A marca atende São Paulo \(cidade\): o resultado que cita outra cidade ou UF/);
  /* A montagem do export só põe o território na marca com cidade (a nacional não ganha campo). */
  assert.match(ler("../lib/server/radar-portable-export-core.ts"), /if \(alvoDaMarca\?\.territory\) for \(const item of montadas\) item\.entrada\.serpTerritory = alvoDaMarca\.territory;/);
  assert.equal(serpCacheLensLabel(SERP_CACHE_CANONICAL_LENS), "desktop-windows");
});
