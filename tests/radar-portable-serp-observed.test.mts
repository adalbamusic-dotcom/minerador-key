import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeDataForSeoSerpResponse } from "../lib/server/dataforseo-serp-normalizer.ts";
import { serpCacheObservationFromBody } from "../lib/server/serp-cache-observation.ts";
import {
  SERP_CACHE_LENSES,
  SerpCacheMetaSchema,
  serpCacheLensLabel,
  serpCacheSubjectId,
  type SerpCacheLens,
  type SerpCacheObservation,
} from "../lib/editorial/serp-cache.ts";
import { SerpCollectionRecordSchema, type SerpCollectionRecord } from "../lib/editorial/contracts.ts";
import { RadarSerpDecisionSchema } from "../lib/radar/analysis-contracts.ts";
import { RadarDeepResearchQuerySchema, radarQueryEvidenceFrom } from "../lib/radar/deep-research.ts";
import type { SerpResearchSnapshot, SerpSearchInput } from "../lib/radar/serp/contracts.ts";
import {
  RADAR_PORTABLE_SERP_CELL_BUDGET,
  RADAR_PORTABLE_THIRD_PARTY_EXCERPT_LIMIT,
  RADAR_PORTABLE_THIRD_PARTY_NOTICE,
  radarPortableLinkedSerpRecord,
  radarPortableNewerSerpCollection,
  radarPortableSerpLensRequests,
  radarPortableSerpLenses,
  radarPortableSerpLensesColumns,
  radarPortableSerpObserved,
  radarPortableSerpObservedColumns,
  type RadarPortableAuxiliaryQuery,
  type RadarPortableSerpLensLookup,
  type RadarPortableSerpObservedInput,
} from "../lib/radar/portable-serp-observed.ts";

/*
 * ===== A SERP NO EXPORT PORTÁTIL — serp_observed_* e serp_lenses_* =====
 *
 * ==================== O PEDIDO ====================
 *
 * O CSV do Radar é saída final: quem escreve com outra ferramenta ou outra IA
 * precisa dos mesmos dados que o Redator tem por artigo — e da SERP que a
 * investigação analisou. Esta suíte prova as quatro colunas contra coletas
 * REAIS do repositório:
 *
 *   dataforseo-google-skincare-facial-advanced-desktop-windows.json  (maior)
 *   dataforseo-google-skin-care-noturno.json                          (auxiliar)
 *
 * As duas passam pelo MESMO normalizador da coleta do Radar, e o corpo
 * advanced passa pelo MESMO cálculo de observação do cache de SERP.
 *
 * ==================== O QUE NÃO PODE ACONTECER ====================
 *
 * Id, UUID, hash, provider, endpoint ou chave posicional no arquivo; trecho de
 * terceiro inteiro ou sem marca; ausência escondida ou atribuída ao Google
 * quando é da coleta; lente faltante calada; célula acima do teto.
 *
 * PROVIDER_CALLS = 0, com sentinela no fim.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ============================== a bancada real ============================== */

const lerFixture = async (nome: string) =>
  JSON.parse(await readFile(new URL(`./fixtures/${nome}`, import.meta.url), "utf8")) as Record<string, unknown>;

const CORPO_ADVANCED = await lerFixture("dataforseo-google-skincare-facial-advanced-desktop-windows.json");
/* A fixture do "noturno" é a tarefa já desembrulhada; o normalizador pede o envelope. */
const TAREFA_NOTURNO = await lerFixture("dataforseo-google-skin-care-noturno.json");
const CORPO_NOTURNO = { version: "0.1", status_code: 20000, status_message: "Ok.", tasks: [TAREFA_NOTURNO] };

const ID_DA_TAREFA = String((CORPO_ADVANCED.tasks as Array<{ id: string }>)[0].id);

/* Ids com cara de produção: é isso que não pode vazar. */
const MARCA = "5d1f6c2a-8b3e-4c7a-9f10-2b6e8d4a1c33";
const ARTIGO = "a7e2c1d4-3b5f-4e6a-8c9d-0f1e2a3b4c5d";
const DNA_DO_ARTIGO = "c3b2a1f0-9e8d-4c7b-a6f5-e4d3c2b1a0f9";
const KEYWORD = "e1d2c3b4-a5f6-4e7d-8c9b-0a1f2e3d4c5b";
const KEYWORD_DNA = "f0e1d2c3-b4a5-4f6e-9d8c-7b6a5f4e3d2c";
const KEYWORD_SECUNDARIA = "b9a8f7e6-d5c4-4b3a-8f2e-1d0c9b8a7f6e";
const REVISOR = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const entrada = (keyword: string, keywordId = KEYWORD): SerpSearchInput => ({
  brandId: MARCA, articleId: ARTIGO, articleDnaVersionId: DNA_DO_ARTIGO,
  keywordId, keywordDnaVersionId: KEYWORD_DNA, keyword,
  location: "2076", language: "pt", device: "desktop", operatingSystem: "windows",
  expectedIntent: "informacional", expectedFormat: "Suporte",
  requiredTopics: ["limpeza"], articleEntities: ["sérum"],
  resultLimit: 100, version: 1, previousSnapshotId: null,
});

const snapshotDe = (corpo: unknown, keyword: string, collectedAt = "2026-09-23T09:00:00.000Z", keywordId = KEYWORD) =>
  normalizeDataForSeoSerpResponse(corpo, entrada(keyword, keywordId), { locationCode: 2076, languageCode: "pt" }, collectedAt, ID_DA_TAREFA);

const SNAPSHOT = snapshotDe(CORPO_ADVANCED, "skincare facial");
const SNAPSHOT_AUXILIAR = snapshotDe(CORPO_NOTURNO, "skin care noturno", "2026-09-23T09:05:00.000Z", KEYWORD_SECUNDARIA);

/**
 * O MODO `regular`, DERIVADO DA COLETA REAL.
 *
 * Medido no provider em 2026-09-20: o `regular` lista os blocos em
 * `item_types` e não entrega o conteúdo deles. Aqui é a mesma coleta advanced
 * com os itens não orgânicos retirados e `item_types` intacto — exatamente a
 * forma que o `regular` devolve.
 */
function corpoRegular(corpo: Record<string, unknown>) {
  const copia = structuredClone(corpo) as { tasks: Array<{ result: Array<{ items: Array<{ type: string }> }> }> };
  const resultado = copia.tasks[0].result[0];
  resultado.items = resultado.items.filter(item => item.type === "organic");
  return copia;
}
const SNAPSHOT_REGULAR = snapshotDe(corpoRegular(CORPO_ADVANCED), "skincare facial");

const registro = (research: SerpResearchSnapshot, id = research.id): SerpCollectionRecord => SerpCollectionRecordSchema.parse({
  id,
  input: { keyword: research.query, articleId: ARTIGO, location: research.location, language: research.language, device: research.device },
  status: "collected", provider: "dataforseo", origin: "real", isMock: false, snapshot: null, cost: null, error: null,
  dnaIntent: null, conflictReason: null, humanDecisionRequired: false, research,
});

const PAA = SNAPSHOT.peopleAlsoAsk;

const DECISOES = [
  { key: "organic:7", itemType: "organic", decision: "included", reason: "Concorrente direto; comparar com organic:8.", note: "", ownDomain: false, url: SNAPSHOT.organicResults.find(item => item.position === 7)!.url },
  { key: "organic:8", itemType: "organic", decision: "excluded", reason: "Página de produto, fora da intenção.", note: "", ownDomain: false },
  /* A chave é posicional: esta decisão foi gravada para OUTRA página na posição 10. */
  { key: "organic:10", itemType: "organic", decision: "included", reason: "Outra página.", note: "", ownDomain: false, url: "https://outra-pagina.com.br/qualquer" },
  { key: "organic:11", itemType: "organic", decision: "included", reason: "", note: "Página da própria marca na SERP.", ownDomain: true },
  { key: `paa:${PAA[0].position}`, itemType: "people_also_ask", decision: "included", reason: "", note: "Pergunta obrigatória na abertura.", ownDomain: false },
  { key: "related:2", itemType: "related_search", decision: "excluded", reason: "Outro artigo do silo.", note: "", ownDomain: false },
].map(item => RadarSerpDecisionSchema.parse(item));

const EVIDENCIA_AUXILIAR = radarQueryEvidenceFrom({ serpClass: "auxiliary", research: SNAPSHOT_AUXILIAR });

const CONSULTAS = [
  { queryId: "q:1", keywordId: KEYWORD, keyword: "skincare facial", role: "principal", disposition: "EXECUTE", execution: "EXECUTED", serpClass: "canonical", evidence: null, reason: "SERP principal do artigo." },
  { queryId: "q:2", keywordId: KEYWORD_SECUNDARIA, keyword: "skin care noturno", role: "secundaria", disposition: "EXECUTE", execution: "EXECUTED", serpClass: "auxiliary", evidence: EVIDENCIA_AUXILIAR, reason: "Secundária executada como SERP auxiliar." },
  /* Motivo com endereço interno por acidente: a coluna traduz, nunca repassa. */
  { queryId: "q:3", keywordId: "kw-3", keyword: "rotina facial simples", role: "reforco_narrativo", disposition: "NOT_EXECUTABLE", execution: "NOT_EXECUTED", serpClass: "auxiliary", evidence: null, reason: `Reforço sem coleta própria; ver ${KEYWORD} e organic:3 (sha256:abc123).` },
].map(item => RadarDeepResearchQuerySchema.parse(item)) as RadarPortableAuxiliaryQuery[];

/* A revisão real carrega revisor e nota interna: nenhum dos dois pode sair. */
const REVISAO = { id: "rev-1", brandId: MARCA, articleId: ARTIGO, snapshotId: SNAPSHOT.id, status: "approved" as const, notes: "NOTA INTERNA DA REVISÃO", reviewedBy: REVISOR, reviewedAt: "2026-09-23T10:00:00+00:00" };

const entradaCompleta = (extra: Partial<RadarPortableSerpObservedInput> = {}): RadarPortableSerpObservedInput => ({
  snapshot: SNAPSHOT,
  serpRole: "PRIMARY",
  frozenAt: "2026-09-23T12:00:00.000Z",
  review: REVISAO,
  serpDecisions: DECISOES,
  deepResearchQueries: CONSULTAS,
  newerCollection: null,
  ...extra,
});

/* ============================ a varredura de higiene ============================ */

const SEGREDOS = () => [
  MARCA, ARTIGO, DNA_DO_ARTIGO, KEYWORD, KEYWORD_DNA, KEYWORD_SECUNDARIA, REVISOR, ID_DA_TAREFA,
  SNAPSHOT.id, SNAPSHOT.contentHash, SNAPSHOT_AUXILIAR.id, SNAPSHOT_AUXILIAR.contentHash,
  EVIDENCIA_AUXILIAR.snapshotId, EVIDENCIA_AUXILIAR.contentHash, "NOTA INTERNA DA REVISÃO",
];

const PROIBIDOS = [
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i,
  /sha256:/i,
  /\b[0-9a-f]{64}\b/i,
  /\b(organic|paa|related|knowledge_graph):\d/,
  /dataforseo/i,
  /\bprovider/i,
  /\bendpoint/i,
  /isMock/,
  /serpSnapshotId|snapshotId|contentHash|providerRequestId|keywordId|brandId|articleId/,
  /reviewedBy|created_by/,
];

function assertHigiene(texto: string, onde: string) {
  for (const segredo of SEGREDOS()) assert.equal(texto.includes(segredo), false, `${onde}: vazou ${segredo}`);
  for (const padrao of PROIBIDOS) {
    const achado = texto.match(padrao);
    assert.equal(achado, null, `${onde}: ${padrao} casou com "${achado?.[0]}"`);
  }
}

/** Todo valor de `thirdPartyExcerpt` no JSON, onde quer que esteja. */
function trechosDoJson(valor: unknown, saida: string[] = []): string[] {
  if (Array.isArray(valor)) for (const item of valor) trechosDoJson(item, saida);
  else if (valor && typeof valor === "object") {
    for (const [chave, filho] of Object.entries(valor)) {
      if (chave === "thirdPartyExcerpt" && typeof filho === "string") saida.push(filho);
      else trechosDoJson(filho, saida);
    }
  }
  return saida;
}

/* ================================ a SERP observada ================================ */

test("a SERP da investigação atravessa inteira: ficha, orgânicos, PAA, relacionadas, blocos e diagnóstico", () => {
  const { serp_observed_md: md, serp_observed_json: json } = radarPortableSerpObservedColumns(entradaCompleta());
  const serp = JSON.parse(json);

  /* A ficha: consulta, mercado, lente, datas e revisão — sem revisor. */
  assert.equal(serp.query, "skincare facial");
  assert.equal(serp.country, "BR");
  assert.equal(serp.device, "desktop");
  assert.equal(serp.operatingSystem, "Windows");
  assert.equal(serp.collectedAt, "2026-09-23T09:00:00.000Z");
  assert.equal(serp.frozenAt, "2026-09-23T12:00:00.000Z");
  assert.deepEqual(serp.review, { status: "aprovada", at: "2026-09-23T10:00:00.000Z" });
  assert.match(md, /Coleta: 2026-09-23 09:00 UTC/);
  assert.match(md, /Congelamento da investigação: 2026-09-23 12:00 UTC/);
  assert.match(md, /Revisão humana da SERP: aprovada em 2026-09-23 10:00 UTC/);
  assert.match(md, /Local: Brasil/);

  /* Todo orgânico gravado, com posição, título, domínio, URL, tipo em português e data. */
  assert.equal(serp.organic.length, SNAPSHOT.organicResults.length);
  for (const resultado of SNAPSHOT.organicResults) {
    assert.ok(md.includes(resultado.url), `a URL da posição ${resultado.position} sumiu do Markdown`);
    assert.ok(md.includes(`#${resultado.position} · `), `a posição ${resultado.position} sumiu`);
  }
  const cetaphil = serp.organic.find((item: { position: number }) => item.position === 8);
  assert.equal(cetaphil.date, "2024-06-07 00:00:00 +00:00");
  assert.ok(["artigo", "produto", "lista", "vídeo", "outro", "negócio local", "categoria"].includes(cetaphil.type), `tipo não traduzido: ${cetaphil.type}`);
  assert.equal(/\b(article|product|list|video|other)\b/.test(serp.organic.map((item: { type: string }) => item.type).join(" ")), false);

  /* PAA, buscas relacionadas, AI Overview e produtos: o que o Redator não via. */
  for (const pergunta of PAA) assert.ok(md.includes(pergunta.question), `pergunta do PAA sumiu: ${pergunta.question}`);
  for (const termo of SNAPSHOT.relatedSearches) assert.ok(md.includes(termo.term), `busca relacionada sumiu: ${termo.term}`);
  assert.equal(serp.features.aiOverview.shown, true);
  assert.ok(serp.features.aiOverview.citedSources.some((item: { domain: string }) => /cetaphil/.test(item.domain)), "o AI Overview perdeu quem ele cita");
  assert.ok(serp.features.products.length > 0, "os produtos sumiram");
  assert.ok(serp.features.images.length > 0, "as imagens sumiram");
  assert.ok(serp.features.formatsShown.includes("Pessoas também perguntam"));
  assert.match(md, /## Diagnóstico da SERP/);
  assert.equal(serp.diagnostic.dominantIntent, "informacional");
  assert.equal(serp.diagnostic.verdict, "coerente");

  /* O bloco que a normalização não grava por desenho é dito, não escondido. */
  assert.match(md, /O Google exibiu o bloco "pacote local \(mapa e empresas\)"; o conteúdo deste bloco não é gravado pela coleta\./);
  assert.match(md, /O texto do AI Overview não é gravado pela coleta/);

  assert.ok(serp.usage.includes("não copiar"));
  assertHigiene(md, "serp_observed_md");
  assertHigiene(json, "serp_observed_json");
});

test("higiene: nenhum id, UUID, hash, provider ou chave posicional em cenário nenhum", () => {
  const cenarios: Array<[string, RadarPortableSerpObservedInput]> = [
    ["completo", entradaCompleta()],
    ["regular", entradaCompleta({ snapshot: SNAPSHOT_REGULAR })],
    ["sem blocos", entradaCompleta({ snapshot: { ...SNAPSHOT, serpFeatures: null } })],
    ["apoio sem curadoria", entradaCompleta({ serpRole: "SUPPORT", serpDecisions: [], review: null })],
    ["sem SERP", { snapshot: null, unavailableReason: `Referência ${SNAPSHOT.id} ausente (${SNAPSHOT.contentHash}).` }],
  ];
  for (const [nome, cenario] of cenarios) {
    const colunas = radarPortableSerpObservedColumns(cenario);
    assertHigiene(colunas.serp_observed_md, `${nome} · md`);
    assertHigiene(colunas.serp_observed_json, `${nome} · json`);
    JSON.parse(colunas.serp_observed_json);
  }

  /* O motivo com endereço interno foi TRADUZIDO, não apagado. */
  const md = radarPortableSerpObservedColumns(entradaCompleta()).serp_observed_md;
  assert.match(md, /Reforço sem coleta própria; ver \(identificador interno omitido\) e orgânico na posição 3/);
});

test("trecho de terceiro: cortado em 300 caracteres e marcado, em todo lugar", () => {
  const longo = (semente: string) => Array.from({ length: 60 }, (_, indice) => `${semente} ${indice}`).join(" ");
  const comTextoLongo: SerpResearchSnapshot = {
    ...SNAPSHOT,
    organicResults: SNAPSHOT.organicResults.map(item => ({ ...item, snippet: longo(`trecho do concorrente ${item.domain}`) })),
    peopleAlsoAsk: PAA.map(item => ({ ...item, answer: longo("resposta copiada do Google") })),
    knowledgeGraph: { title: "Skincare", type: "Prática", description: longo("descrição enciclopédica"), attributes: { origem: "Coreia" }, website: "https://exemplo.org/skincare", sources: [] },
  };
  /* No nível normal, TODO trecho sai: um por orgânico, um por resposta do PAA e a descrição do painel. */
  const inteiro = radarPortableSerpObserved(entradaCompleta({ snapshot: comTextoLongo }), 0);
  const todos = trechosDoJson(inteiro);
  assert.equal(todos.length, comTextoLongo.organicResults.length + PAA.length + 1);
  for (const trecho of todos) {
    /* Até 300 com as reticências; o espaço antes delas é aparado, então 299 também vale. */
    assert.ok(trecho.length <= RADAR_PORTABLE_THIRD_PARTY_EXCERPT_LIMIT && trecho.length >= RADAR_PORTABLE_THIRD_PARTY_EXCERPT_LIMIT - 10, `trecho com ${trecho.length} caracteres`);
    assert.ok(trecho.endsWith("…"), "trecho cortado sem reticências");
  }

  /* Na coluna, o que couber — e cada trecho que sai obedece à mesma regra. */
  const { serp_observed_md: md, serp_observed_json: json } = radarPortableSerpObservedColumns(entradaCompleta({ snapshot: comTextoLongo }));
  const serp = JSON.parse(json);
  const trechos = trechosDoJson(serp);
  assert.ok(trechos.length >= 10, `trechos na coluna: ${trechos.length}`);
  for (const trecho of trechos) {
    assert.ok(trecho.length <= RADAR_PORTABLE_THIRD_PARTY_EXCERPT_LIMIT, `trecho com ${trecho.length} caracteres`);
    assert.ok(trecho.endsWith("…"), "trecho cortado sem reticências");
  }
  assert.equal(serp.organic[0].snippet.truncated, true);
  assert.ok(serp.thirdPartyNotice.startsWith(RADAR_PORTABLE_THIRD_PARTY_NOTICE));

  /* No Markdown, CADA trecho carrega a marca ao lado — é ali que alguém copia. */
  const linhasDeTrecho = md.split("\n").filter(linha => /^\s+- (Trecho|Resposta|Descrição) \(/.test(linha));
  assert.equal(linhasDeTrecho.length, trechos.length);
  for (const linha of linhasDeTrecho) {
    assert.ok(linha.includes(`(${RADAR_PORTABLE_THIRD_PARTY_NOTICE}): "`), `trecho sem marca: ${linha.slice(0, 80)}`);
    const citado = linha.slice(linha.indexOf(': "') + 3, -1);
    assert.ok(citado.length <= RADAR_PORTABLE_THIRD_PARTY_EXCERPT_LIMIT, `trecho do Markdown com ${citado.length}`);
  }

  /* O snippet real, curto, sai inteiro e sem a flag de corte. */
  const real = JSON.parse(radarPortableSerpObservedColumns(entradaCompleta()).serp_observed_json);
  const original = SNAPSHOT.organicResults[0].snippet;
  assert.equal(real.organic[0].snippet.thirdPartyExcerpt, original.replace(/\s+/g, " ").trim());
  assert.equal(real.organic[0].snippet.truncated, false);
});

test("ausência declarada: o modo regular anuncia o bloco e não entrega — a falta é da COLETA", () => {
  /* A bancada: o regular derivado anuncia PAA, AI Overview, imagens e produtos, e não traz nenhum. */
  assert.ok(SNAPSHOT_REGULAR.serpFeatures!.itemTypes.includes("people_also_ask"));
  assert.equal(SNAPSHOT_REGULAR.peopleAlsoAsk.length, 0);

  const { serp_observed_md: md, serp_observed_json: json } = radarPortableSerpObservedColumns(entradaCompleta({ snapshot: SNAPSHOT_REGULAR, serpDecisions: [] }));
  const serp = JSON.parse(json);

  for (const bloco of ["Pessoas também perguntam", "AI Overview (resposta de IA do Google)", "imagens", "produtos populares", "buscas relacionadas"]) {
    assert.ok(
      serp.absent.includes(`O Google exibiu o bloco "${bloco}", mas a coleta não trouxe o conteúdo dele: a limitação é da coleta, não da página.`),
      `ausência de "${bloco}" não declarada como limitação da coleta`,
    );
  }
  assert.equal(serp.features.aiOverview.shown, true);
  assert.equal(serp.features.aiOverview.collected, false);
  assert.match(md, /O Google exibiu, mas a coleta não trouxe o conteúdo\./);

  /*
   * NUNCA "o Google não mostrou". As limitações de `serpFeatures` foram escritas
   * a partir do conteúdo entregue e afirmariam sobre a página o que é falta da
   * coleta — por isso não atravessam.
   */
  assert.doesNotMatch(md, /o Google não (mostrou|mostra|exibiu|está tratando)/i);
  assert.doesNotMatch(md, /Esta SERP não trouxe/);
  assert.doesNotMatch(json, /não está tratando audiovisual/);

  /* Bloco que a página NÃO anunciou: "não há X gravado nesta coleta". */
  const completo = JSON.parse(radarPortableSerpObservedColumns(entradaCompleta()).serp_observed_json);
  assert.ok(completo.absent.includes("Não há bloco de vídeos gravado nesta coleta."));
  assert.ok(completo.absent.includes("Não há painel de conhecimento gravado nesta coleta."));

  /* Coleta antiga, sem registro dos blocos: não dá para afirmar nada sobre a página. */
  const antigo = radarPortableSerpObservedColumns(entradaCompleta({ snapshot: { ...SNAPSHOT_REGULAR, serpFeatures: null } })).serp_observed_md;
  assert.match(antigo, /não registrou quais blocos a página do Google exibia: a falta de AI Overview, Pessoas também perguntam, vídeos, imagens ou produtos nesta coluna não prova que o Google não os mostrou/);
  assert.match(antigo, /Não há Pessoas também perguntam gravado nesta coleta\./);
});

test("o aviso de coleta posterior: a coluna descreve a SERP da investigação, e diz que há uma mais nova", () => {
  const vinculado = registro(SNAPSHOT);
  const maisNovo = registro(snapshotDe(CORPO_ADVANCED, "skincare facial", "2026-09-25T10:00:00.000Z"));
  const registros = [maisNovo, vinculado];

  /* O vínculo sai do DOSSIÊ, nunca de "o mais recente". */
  const camada = { refs: [{ source: "WEB_SERP" as const, role: "PRIMARY_COMPETITIVE_RESEARCH" as const, ref: vinculado.id, fingerprint: SNAPSHOT.contentHash, collectedAt: null, sampleSize: 12 }] };
  const ligado = radarPortableLinkedSerpRecord(registros, camada);
  assert.equal(ligado.record?.id, vinculado.id);
  assert.equal(ligado.issue, null);

  const posterior = radarPortableNewerSerpCollection(registros, ARTIGO, ligado.record);
  assert.deepEqual(posterior, { collectedAt: "2026-09-25T10:00:00.000Z" });

  const { serp_observed_md: md, serp_observed_json: json } = radarPortableSerpObservedColumns(entradaCompleta({ snapshot: ligado.record!.research, newerCollection: posterior }));
  assert.match(md, /há coleta posterior à investigação \(2026-09-25 10:00 UTC\), não usada/i);
  assert.equal(JSON.parse(json).newerCollectionNotUsed.collectedAt, "2026-09-25T10:00:00.000Z");
  /* E a SERP da coluna continua sendo a da investigação. */
  assert.equal(JSON.parse(json).collectedAt, "2026-09-23T09:00:00.000Z");

  /* Sem coleta posterior, sem aviso. */
  assert.equal(radarPortableNewerSerpCollection([vinculado], ARTIGO, vinculado), null);
  assert.doesNotMatch(radarPortableSerpObservedColumns(entradaCompleta()).serp_observed_md, /coleta posterior/);
});

test("o vínculo recusa o que não é a SERP da investigação, e diz por quê sem id", () => {
  const vinculado = registro(SNAPSHOT);
  const referencia = (ref: string, fingerprint: string | null) => ({ refs: [{ source: "WEB_SERP" as const, role: "PRIMARY_COMPETITIVE_RESEARCH" as const, ref, fingerprint, collectedAt: null, sampleSize: 0 }] });

  const assinaturaDiferente = radarPortableLinkedSerpRecord([vinculado], referencia(vinculado.id, "f".repeat(64)));
  assert.equal(assinaturaDiferente.record, null);
  assert.match(assinaturaDiferente.issue!, /não confere com a assinatura congelada/);

  const ausente = radarPortableLinkedSerpRecord([vinculado], referencia("serp:outro", null));
  assert.equal(ausente.record, null);
  assert.match(ausente.issue!, /não está entre as coletas gravadas/);

  const semReferencia = radarPortableLinkedSerpRecord([vinculado], { refs: [] });
  assert.match(semReferencia.issue!, /não referencia uma coleta de SERP do Google/);

  /* Perfil de apoio: a assinatura é nula no dossiê, e o id basta. */
  assert.equal(radarPortableLinkedSerpRecord([vinculado], referencia(vinculado.id, null)).record?.id, vinculado.id);

  /* A coluna sem SERP diz o motivo — e o motivo não carrega id. */
  const colunas = radarPortableSerpObservedColumns({ snapshot: null, unavailableReason: ausente.issue });
  assert.match(colunas.serp_observed_md, /não está entre as coletas gravadas/);
  assert.equal(JSON.parse(colunas.serp_observed_json).available, false);
  for (const [nome, texto] of Object.entries(colunas)) assertHigiene(texto, nome);
});

test("a curadoria humana atravessa traduzida em posição e decisão", () => {
  const { serp_observed_md: md, serp_observed_json: json } = radarPortableSerpObservedColumns(entradaCompleta());
  const serp = JSON.parse(json);
  const naPosicao = (posicao: number) => serp.organic.find((item: { position: number }) => item.position === posicao);

  assert.equal(naPosicao(7).humanDecision, "incluída");
  assert.equal(naPosicao(7).reason, "Concorrente direto; comparar com orgânico na posição 8.");
  assert.equal(naPosicao(8).humanDecision, "excluída");
  /* Decisão gravada para outra página na mesma posição NÃO é aplicada. */
  assert.match(naPosicao(10).humanDecision, /outra página nesta posição; não aplicada/);
  /* Sem motivo, a observação da pessoa é o motivo. E o domínio da marca é dito. */
  assert.equal(naPosicao(11).reason, "Página da própria marca na SERP.");
  assert.equal(naPosicao(11).ownDomain, true);
  assert.match(md, /domínio da própria marca/);
  assert.equal(serp.peopleAlsoAsk[0].humanDecision, "incluída");
  assert.equal(serp.relatedSearches[1].humanDecision, "excluída");
  assert.equal(naPosicao(13).humanDecision, "sem decisão registrada");
  assert.match(md, /Sem decisão de curadoria registrada em \d+ resultado\(s\) desta lista\./);

  /* SERP de apoio (YouTube/Amazon) não tem curadoria: dito uma vez, sem linha por item. */
  const apoio = radarPortableSerpObservedColumns(entradaCompleta({ serpRole: "SUPPORT", serpDecisions: [], review: null }));
  assert.match(apoio.serp_observed_md, /Curadoria humana item a item: não registrada para esta SERP/);
  assert.match(apoio.serp_observed_md, /SERP de apoio de SEO/);
  assert.doesNotMatch(apoio.serp_observed_md, /Curadoria: /);
  /*
   * 2026-09-23 (revisão adversarial): a SERP de apoio não passa pela revisão
   * humana no desenho do Radar. "Aguardando revisão humana" prometia uma
   * revisão que nunca vai existir; a frase agora diz que não se aplica.
   */
  assert.match(apoio.serp_observed_md, /Revisão humana da SERP: não se aplica \(SERP de apoio, sem revisão humana no fluxo do Radar\)/);
  assert.doesNotMatch(apoio.serp_observed_md, /aguardando revisão humana/);
  /* A principal sem revisão gravada continua "aguardando". */
  const principalSemRevisao = radarPortableSerpObservedColumns(entradaCompleta({ review: null }));
  assert.match(principalSemRevisao.serp_observed_md, /Revisão humana da SERP: aguardando revisão humana/);

  /* Revisão ilegível não vira "aguardando": vira "não lida". */
  const ilegivel = radarPortableSerpObservedColumns(entradaCompleta({ review: null, reviewReadable: false }));
  assert.match(ilegivel.serp_observed_md, /Revisão humana da SERP: não lida nesta exportação/);
});

test("as SERPs auxiliares das secundárias saem com o top, e a consulta principal não se repete como auxiliar", () => {
  const serp = JSON.parse(radarPortableSerpObservedColumns(entradaCompleta()).serp_observed_json);
  assert.equal(serp.auxiliaryQueries.length, 2, "a principal entrou como auxiliar, ou uma auxiliar sumiu");

  const noturno = serp.auxiliaryQueries[0];
  assert.equal(noturno.query, "skin care noturno");
  assert.equal(noturno.role, "secundária");
  assert.equal(noturno.execution, "executada");
  assert.equal(noturno.collectedAt, "2026-09-23T09:05:00.000Z");
  assert.equal(noturno.results.length, EVIDENCIA_AUXILIAR.results.length);
  assert.equal(noturno.results[0].url, EVIDENCIA_AUXILIAR.results[0].url);
  assert.ok(noturno.results.every((item: { type: string }) => !/^(article|product|list|video|other)$/.test(item.type)));

  const reforco = serp.auxiliaryQueries[1];
  assert.equal(reforco.execution, "não executada");
  assert.equal(reforco.results.length, 0);
  assert.match(reforco.reason, /Reforço sem coleta própria/);
});

/* ================================ a SERP por lente ================================ */

const LENTE = (device: SerpCacheLens["device"], operatingSystem: SerpCacheLens["operatingSystem"]): SerpCacheLens => ({ device, operatingSystem });
const DESKTOP_WINDOWS = LENTE("desktop", "windows");
const MOBILE_ANDROID = LENTE("mobile", "android");

/**
 * A LENTE CELULAR, DERIVADA DA COLETA REAL.
 *
 * Sem fixture de celular no repositório, a lente Android é a mesma coleta sem
 * os três primeiros orgânicos e sem o AI Overview — um universo que diverge
 * de verdade, pelo mesmo cálculo de observação do cache.
 */
function corpoCelular(corpo: Record<string, unknown>) {
  const copia = structuredClone(corpo) as { tasks: Array<{ result: Array<{ items: Array<{ type: string }>; item_types: string[] }> }> };
  const resultado = copia.tasks[0].result[0];
  let retirados = 0;
  resultado.items = resultado.items.filter(item => {
    if (item.type === "ai_overview") return false;
    if (item.type === "organic" && retirados < 3) { retirados += 1; return false; }
    return true;
  });
  resultado.item_types = resultado.item_types.filter(tipo => tipo !== "ai_overview");
  return copia;
}

const observacao = (corpo: unknown, keyword: string, lens: SerpCacheLens): SerpCacheObservation =>
  serpCacheObservationFromBody(corpo, { keyword, locationCode: 2076, languageCode: "pt", lens, collectedAt: "2026-09-23T09:00:00.000Z" });

const meta = (keyword: string, lens: SerpCacheLens, collectedAt: string) => SerpCacheMetaSchema.parse({
  keyword, normalizedKeyword: keyword.toLowerCase(), locationCode: 2076, languageCode: "pt", lens, endpoint: "advanced",
  depth: 20, collectedAt, providerRequestId: ID_DA_TAREFA, keywordId: KEYWORD, collectedBy: "minerador",
});

const KEYWORDS_DO_ARTIGO = [
  { keyword: "skincare facial", role: "principal" as const, keywordId: KEYWORD },
  { keyword: "skin care noturno", role: "secundaria" as const, keywordId: KEYWORD_SECUNDARIA },
  /* A mesma keyword duas vezes vale uma. */
  { keyword: "Skincare Facial ", role: "secundaria" as const, keywordId: KEYWORD },
];

/** Monta o que `lookupSerpCache` devolveria, com o `subjectId` real — que também não pode sair. */
function consultasDoCache(): Array<RadarPortableSerpLensLookup & { subjectId: string }> {
  const pedidos = radarPortableSerpLensRequests({ keywords: KEYWORDS_DO_ARTIGO, locationCode: 2076, languageCode: "pt" });
  return pedidos.map(pedido => {
    const rotulo = `${pedido.query.keyword}|${serpCacheLensLabel(pedido.query.lens)}`;
    const acerto = (corpo: unknown, collectedAt: string) => ({
      request: pedido, subjectId: serpCacheSubjectId(pedido.query),
      hit: { meta: meta(pedido.query.keyword, pedido.query.lens, collectedAt), observation: observacao(corpo, pedido.query.keyword, pedido.query.lens) },
      missReason: null,
    });
    if (rotulo === "skincare facial|desktop-windows") return acerto(CORPO_ADVANCED, "2026-09-22T08:00:00+00:00");
    if (rotulo === "skincare facial|mobile-android") return acerto(corpoCelular(CORPO_ADVANCED), "2026-09-21T08:00:00.000Z");
    if (rotulo === "skin care noturno|desktop-windows") return acerto(CORPO_NOTURNO, "2026-09-20T08:00:00.000Z");
    if (rotulo === "skincare facial|mobile-ios") return { request: pedido, subjectId: serpCacheSubjectId(pedido.query), hit: null, missReason: "validade vencida" };
    return { request: pedido, subjectId: serpCacheSubjectId(pedido.query), hit: null, missReason: "sem entrada" };
  });
}

test("os pedidos ao cache: keyword × lente, advanced, top 10, sem repetir keyword", () => {
  const pedidos = radarPortableSerpLensRequests({ keywords: KEYWORDS_DO_ARTIGO, locationCode: 2076, languageCode: "pt" });
  assert.equal(pedidos.length, 2 * SERP_CACHE_LENSES.length);
  assert.ok(pedidos.every(item => item.query.endpoint === "advanced" && item.depth === 10));
  assert.deepEqual(pedidos.slice(0, 4).map(item => serpCacheLensLabel(item.query.lens)), ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"]);
  assert.equal(pedidos[4].keywordId, KEYWORD_SECUNDARIA);
});

test("cada keyword × lente é dita: data, domínios, perguntas, relacionadas, IA, sinais e blocos — ou a falta", () => {
  const { serp_lenses_md: md, serp_lenses_json: json } = radarPortableSerpLensesColumns({ keywords: KEYWORDS_DO_ARTIGO, lookups: consultasDoCache() });
  const lentes = JSON.parse(json);

  assert.deepEqual(lentes.lenses, ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"]);
  assert.equal(lentes.keywords.length, 2, "a keyword repetida entrou duas vezes");

  const principal = lentes.keywords[0];
  assert.equal(principal.keyword, "skincare facial");
  assert.equal(principal.role, "principal");
  assert.deepEqual(principal.readings.map((item: { lens: string }) => item.lens), ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"]);

  const windows = principal.readings[0];
  assert.equal(windows.observed, true);
  assert.equal(windows.collectedAt, "2026-09-22T08:00:00.000Z");
  assert.ok(windows.competitorDomains.length <= 10 && windows.competitorDomains.length > 0);
  assert.ok(windows.questions.includes("O que é skincare para o rosto?"));
  assert.ok(windows.relatedSearches.includes("Skincare noturno"));
  assert.ok(windows.aiOverviewDomains.includes("cetaphil.com.br"));
  assert.equal(windows.commercialSignals, true);
  assert.ok(windows.blocks.includes("Pessoas também perguntam"));
  assert.match(md, /### desktop-windows \(desktop · Windows\) — coletada em 2026-09-22 08:00 UTC/);

  /* Lente faltante é DITA, com o motivo — nunca some. */
  assert.match(principal.readings[1].missing, /^sem observação válida no cache: nenhuma coleta desta lente no cache$/);
  assert.match(principal.readings[3].missing, /venceu a validade do cache/);
  assert.match(md, /### desktop-macos \(desktop · macOS\) — sem observação válida no cache/);
  assert.match(md, /### mobile-ios \(celular · iOS\) — sem observação válida no cache: a observação gravada venceu a validade do cache/);

  /* A divergência: domínios que só uma lente devolve, calculados sobre a lista inteira. */
  const divergencia = principal.divergence;
  assert.equal(divergencia.observedLenses, 2);
  assert.ok(divergencia.averageDistance > 0 && divergencia.averageDistance < 1);
  const soNoDesktop = divergencia.onlyInOneLens.find((item: { lens: string }) => item.lens === "desktop-windows");
  assert.ok(soNoDesktop && soNoDesktop.domains.length > 0, "o desktop devolve domínios que o celular não devolve, e isso não foi dito");
  assert.ok(divergencia.blocksOnlyInOneLens.some((item: { lens: string; blocks: string[] }) => item.lens === "desktop-windows" && item.blocks.includes("AI Overview (resposta de IA do Google)")));
  assert.match(md, /domínio\(s\) aparecem só numa lente; distância média entre lentes 0,\d+/);
  assert.match(md, /- Só em desktop-windows: /);

  /* A secundária com uma lente só: não há divergência a medir, e isso é dito. */
  assert.match(lentes.keywords[1].divergence.statement, /Só a lente desktop-windows tem observação válida/);

  /* Nada de vocabulário cru do fornecedor nem id. */
  assert.doesNotMatch(md, /\b(people_also_ask|ai_overview|popular_products|related_searches|local_pack)\b/);
  for (const consulta of consultasDoCache()) {
    assert.equal(md.includes(consulta.subjectId), false);
    assert.equal(json.includes(consulta.subjectId), false);
  }
  assertHigiene(md, "serp_lenses_md");
  assertHigiene(json, "serp_lenses_json");
});

test("leitura do cache que falhou: toda lente é 'não lida', nunca 'sem coleta'", () => {
  const { serp_lenses_md: md, serp_lenses_json: json } = radarPortableSerpLensesColumns({ keywords: KEYWORDS_DO_ARTIGO, lookups: [], readFailed: true });
  const lentes = JSON.parse(json);
  for (const keyword of lentes.keywords) {
    for (const leitura of keyword.readings) assert.match(leitura.missing, /a leitura do cache falhou nesta exportação/);
  }
  assert.match(md, /A leitura do cache de SERP falhou nesta exportação: nenhuma lente foi lida, o que não quer dizer que não haja coleta\./);

  /* Sem keyword com texto, a coluna diz que não houve o que consultar. */
  const vazio = radarPortableSerpLenses({ keywords: [{ keyword: "  ", role: "principal" }], lookups: [] });
  assert.equal(vazio.keywords.length, 0);
  assert.ok(vazio.limitations.some(item => /não tem texto resolvido/.test(item)));
});

/* ================================== tamanhos ================================== */

test("tamanho: a maior coleta real cabe na célula sem corte nenhum", () => {
  const observada = radarPortableSerpObservedColumns(entradaCompleta());
  const lentes = radarPortableSerpLensesColumns({ keywords: KEYWORDS_DO_ARTIGO, lookups: consultasDoCache() });
  for (const [nome, texto] of Object.entries({ ...observada, ...lentes })) {
    assert.ok(texto.length <= RADAR_PORTABLE_SERP_CELL_BUDGET, `${nome} com ${texto.length} caracteres`);
  }
  /* O nível 0 é o que saiu: nenhuma lista reduzida para a coleta real. */
  assert.equal(JSON.parse(observada.serp_observed_json).cellLimitNotice, null);
  assert.equal(JSON.parse(lentes.serp_lenses_json).cellLimitNotice, null);
  assert.equal(JSON.parse(observada.serp_observed_json).organic.length, SNAPSHOT.organicResults.length);
});

test("tamanho: a SERP inflada desce de nível, continua abaixo do teto e declara cada corte", () => {
  const longo = (semente: string, n = 80) => Array.from({ length: n }, (_, indice) => `${semente}${indice}`).join(" ");
  const base = SNAPSHOT.organicResults[0];
  const inflado: SerpResearchSnapshot = {
    ...SNAPSHOT,
    organicResults: Array.from({ length: 100 }, (_, indice) => ({
      ...base, position: indice + 1, title: longo("titulo", 30),
      url: `https://www.site-${indice}.com.br/${longo("caminho", 20).replace(/ /g, "-")}`,
      domain: `site-${indice}.com.br`, snippet: longo("trecho"),
      sitelinks: Array.from({ length: 8 }, (_, link) => ({ title: longo("sitelink", 10), url: `https://www.site-${indice}.com.br/link-${link}` })),
    })),
    peopleAlsoAsk: Array.from({ length: 40 }, (_, indice) => ({ position: indice + 1, question: `${longo("pergunta", 15)}?`, answer: longo("resposta"), sourceTitle: longo("fonte", 10), sourceUrl: `https://fonte-${indice}.org/resposta`, classification: null, notes: "" })),
    relatedSearches: Array.from({ length: 80 }, (_, indice) => ({ term: `${longo("busca", 6)} ${indice}`, classification: null, notes: "" })),
  };
  const decisoes = inflado.organicResults.map(item => RadarSerpDecisionSchema.parse({ key: `organic:${item.position}`, itemType: "organic", decision: "included", reason: longo("motivo", 120).slice(0, 1000), note: "", ownDomain: false }));
  const auxiliares = Array.from({ length: 12 }, (_, indice) => RadarDeepResearchQuerySchema.parse({
    queryId: `q:${indice}`, keywordId: `k${indice}`, keyword: `consulta auxiliar ${indice}`, role: "secundaria", disposition: "EXECUTE",
    execution: "EXECUTED", serpClass: "auxiliary", reason: longo("razao", 40),
    evidence: { ...EVIDENCIA_AUXILIAR, results: Array.from({ length: 10 }, (_, posicao) => ({ position: posicao + 1, url: `https://aux-${indice}-${posicao}.com.br/${longo("p", 30).replace(/ /g, "-")}`, title: longo("titulo", 20), domain: `aux-${indice}-${posicao}.com.br`, inferredType: "article" })) },
  })) as RadarPortableAuxiliaryQuery[];

  const colunas = radarPortableSerpObservedColumns(entradaCompleta({ snapshot: inflado, serpDecisions: decisoes, deepResearchQueries: auxiliares }));
  assert.ok(colunas.serp_observed_md.length <= RADAR_PORTABLE_SERP_CELL_BUDGET, `md com ${colunas.serp_observed_md.length}`);
  assert.ok(colunas.serp_observed_json.length <= RADAR_PORTABLE_SERP_CELL_BUDGET, `json com ${colunas.serp_observed_json.length}`);
  const serp = JSON.parse(colunas.serp_observed_json);
  assert.ok(serp.cellLimitNotice, "a redução não foi declarada");
  assert.ok(serp.omitted.organic >= 80, `orgânicos omitidos: ${serp.omitted.organic}`);
  assert.match(colunas.serp_observed_md, /- Mais \d+ resultado\(s\) orgânico\(s\) omitido\(s\) nesta célula\./);
  assert.match(colunas.serp_observed_md, /- Mais \d+ pergunta\(s\) omitido\(s\) nesta célula\./);
  assert.match(colunas.serp_observed_md, /consulta\(s\) auxiliar\(es\) omitida\(s\) nesta célula/);
  /* Mesmo reduzida, a SERP principal continua com top 10. */
  assert.equal(serp.organic.length, 10);

  /* As lentes infladas: 8 keywords, 30 domínios, perguntas e buscas por lente. */
  const muitas = Array.from({ length: 10 }, (_, indice) => ({ keyword: `keyword inflada ${indice}`, role: "secundaria" as const }));
  const consultas: RadarPortableSerpLensLookup[] = muitas.flatMap((item, k) => SERP_CACHE_LENSES.map((lens, l) => ({
    request: { query: { keyword: item.keyword, lens } },
    hit: {
      meta: { collectedAt: "2026-09-22T08:00:00.000Z" },
      observation: {
        lens: serpCacheLensLabel(lens), depth: 10, organicCount: 10,
        competitorDomains: Array.from({ length: 30 }, (_, d) => `dominio-${k}-${l}-${d}-${longo("x", 3).replace(/ /g, "")}.com.br`),
        itemTypes: ["organic", "people_also_ask", "video", `bloco_raro_${l}`],
        questions: Array.from({ length: 30 }, (_, q) => `${longo("pergunta", 8)} ${q}?`),
        relatedSearches: Array.from({ length: 30 }, (_, r) => `${longo("busca", 6)} ${r}`),
        aiOverviewDomains: Array.from({ length: 20 }, (_, a) => `citado-${a}.com.br`),
        commercialSignals: true,
      },
    },
    missReason: null,
  })));
  const lentes = radarPortableSerpLensesColumns({ keywords: muitas, lookups: consultas });
  assert.ok(lentes.serp_lenses_md.length <= RADAR_PORTABLE_SERP_CELL_BUDGET, `lentes md com ${lentes.serp_lenses_md.length}`);
  assert.ok(lentes.serp_lenses_json.length <= RADAR_PORTABLE_SERP_CELL_BUDGET, `lentes json com ${lentes.serp_lenses_json.length}`);
  const leitura = JSON.parse(lentes.serp_lenses_json);
  assert.ok(leitura.cellLimitNotice);
  assert.ok(leitura.omittedKeywords > 0);
  assert.match(lentes.serp_lenses_md, /- Mais \d+ keyword\(s\) omitida\(s\) nesta célula\./);
  assert.match(lentes.serp_lenses_md, /mais \d+ omitido\(s\) nesta célula/);
  /* Bloco fora do catálogo sai legível, não cru. */
  assert.match(lentes.serp_lenses_md, /bloco não catalogado: bloco raro 0/);
});

test("tamanho: com teto apertado demais, o último recurso corta o Markdown com aviso e mantém JSON válido", () => {
  const colunas = radarPortableSerpObservedColumns(entradaCompleta(), 3000);
  assert.ok(colunas.serp_observed_md.length <= 3000, `md com ${colunas.serp_observed_md.length}`);
  assert.match(colunas.serp_observed_md, /Célula cortada aqui para caber no limite de uma célula de planilha: \d+ caractere\(s\) omitido\(s\)\./);
  const esqueleto = JSON.parse(colunas.serp_observed_json);
  assert.ok(colunas.serp_observed_json.length <= 3000);
  assert.match(esqueleto.cellLimitNotice, /não coube numa célula de planilha/);

  const lentes = radarPortableSerpLensesColumns({ keywords: KEYWORDS_DO_ARTIGO, lookups: consultasDoCache() }, 1500);
  assert.ok(lentes.serp_lenses_md.length <= 1500);
  assert.match(lentes.serp_lenses_md, /Célula cortada aqui/);
  JSON.parse(lentes.serp_lenses_json);
});

test("os níveis de corte nunca aumentam um trecho de terceiro acima de 300", () => {
  for (let nivel = 0; nivel < 4; nivel += 1) {
    for (const trecho of trechosDoJson(radarPortableSerpObserved(entradaCompleta(), nivel))) {
      assert.ok(trecho.length <= RADAR_PORTABLE_THIRD_PARTY_EXCERPT_LIMIT);
    }
  }
});

/* =============================== domínio puro =============================== */

test("o módulo é puro: sem banco, sem rede, sem servidor", async () => {
  const fonte = (await readFile(new URL("../lib/radar/portable-serp-observed.ts", import.meta.url), "utf8"))
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  assert.doesNotMatch(fonte, /server-only|supabase|lookupSerpCache|readSerpCacheEntries|\bfetch\(|lib\/server\//);
  assert.doesNotMatch(fonte, /select\(/);
});

test("PROVIDER_CALLS = 0 e AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, [], `nenhuma rede deveria ter saído; houve: ${idasAoServidor.join(", ")}`);
});
