import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RADAR_SOURCE_VERIFICATION_BATCH, RADAR_SOURCE_VERIFICATION_ERROR,
  RadarSourceVerificationRequestSchema, radarSourceVerificationBatches, radarSourceVerificationErrorMessage,
} from "../lib/radar/source-verification-request.ts";
import { buildRadarSourceVerificationPlan, radarSourceClassificationFromRecord, radarSourceId, radarSourceVerificationTargets } from "../lib/radar/source-authority.ts";
import { verifyRadarSources } from "../lib/radar/source-verification.ts";
import { buildRadarEvidenceClaims } from "../lib/radar/claim-evidence.ts";
import { buildRadarExternalSourceResearch } from "../lib/radar/link-and-source-research.ts";
import { buildRadarSemanticConceptModel } from "../lib/radar/semantic-concept-model.ts";
import { radarExtractionFailureIsRecoverable } from "../lib/radar/extraction-retry.ts";
import { RadarAnalysisPayloadSchema } from "../lib/radar/analysis-contracts.ts";
import type { RadarExtractionPage, RadarObservedLink } from "../lib/radar/analysis-contracts.ts";

/*
 * ======  GATE 12.1 · A VERIFICAÇÃO DE FONTES DENTRO DO ANALYZE  =======
 *
 * A verificação não é um quarto botão. Quem clicou em ANALISAR CONCORRÊNCIA
 * pediu a leitura inteira: as páginas, as citações delas, e o que essas fontes
 * são. Tudo dentro da MESMA operação iniciada pela pessoa.
 *
 * E o servidor nunca recebe um endereço para buscar. Ele recebe um domínio, e
 * resolve o endereço a partir da análise persistida — porque a alternativa é
 * transformar a rota num proxy para qualquer destino alcançável de dentro da
 * nossa rede.
 *
 * Nenhum teste chama rede: `fetchImpl` e `lookupImpl` são stubs locais.
 */

/* ============================== a fixture =============================== */

const link = (patch: Partial<RadarObservedLink>): RadarObservedLink => ({
  destinationUrl: "https://www.aad.org/public/diseases/oily-skin",
  destinationDomain: "www.aad.org",
  kind: "EXTERNAL", anchorText: "American Academy of Dermatology",
  surroundingText: "A produção de sebo é regulada por hormônios.",
  sectionHeading: "Causas da pele oleosa", rel: [], target: null, order: 0,
  ...patch,
});

const pagina = (id: string, headings: string[], links: RadarObservedLink[]): RadarExtractionPage => ({
  id: `page:${id}`, url: `https://dominio-${id.toLowerCase()}.com.br/artigo/pele-oleosa`, status: "success",
  fetchedAt: "2026-09-10T10:00:00.000Z", title: `Concorrente ${id}`, metaDescription: "", canonical: null,
  h1: ["Pele oleosa"], h2: headings, h3: [], wordCount: 1600,
  internalLinkCount: 0, externalLinkCount: links.filter(item => item.kind === "EXTERNAL").length,
  listCount: 1, tableCount: 0, faqCount: 0, imageCount: 2, blockquoteCount: 0, comparisonCount: 0,
  hasDates: true, author: "Dra. Ana Souza", structuredDataTypes: ["Article"], recurringTerms: [],
  boldCount: 3, italicCount: 0, paragraphCount: 12, paragraphWordCounts: [70],
  headingOutline: [{ level: 1, text: "Pele oleosa" }, ...headings.map(text => ({ level: 2 as const, text }))],
  introWordCount: 60, introText: "Abertura.", closingWordCount: 40, closingText: "Fecho.", hasClosing: true,
  emphasizedTerms: [], keywordPlacement: null, observedLinks: links, error: null,
});

/** Dez comparáveis: a AAD citada por seis, o PubMed por duas, Instagram por três. */
const PAGINAS = Array.from({ length: 10 }, (_, index) => pagina(`A${index}`,
  ["Causas da pele oleosa", "Pode usar ácido salicílico na gravidez?"],
  index < 6
    ? [link({}), link({ order: 1, destinationUrl: "https://www.instagram.com/marca", destinationDomain: "www.instagram.com", anchorText: "Instagram", sectionHeading: null })]
    : index < 8
      ? [link({ destinationUrl: "https://pubmed.ncbi.nlm.nih.gov/12345/", destinationDomain: "pubmed.ncbi.nlm.nih.gov", anchorText: "estudo" })]
      : [link({ destinationUrl: "https://www.aad.org/public/everyday-care", anchorText: "guia da AAD" })]));

function plano(pages = PAGINAS) {
  const semantic = buildRadarSemanticConceptModel({
    pages, keywordTexts: ["skincare para pele oleosa"], centralEntities: ["pele oleosa"],
  });
  return buildRadarSourceVerificationPlan({
    candidates: buildRadarExternalSourceResearch({ pages, semantic }).evidenceCandidates,
    claims: buildRadarEvidenceClaims({ semantic }),
  });
}

/* ======  A, B, C e D · SÓ O ANALYZE ACIONA A VERIFICAÇÃO  =========== */

const PAGINA_DO_RADAR = readFileSync("modules/radar/radar-page.tsx", "utf8");

test("GATE 12.1 · A, B e C — nem montagem, nem reload, nem START verificam fonte", () => {
  /*
   * A busca vive DENTRO de `analyzeSerpSelection`, que só roda por clique.
   * Fora dela não existe caminho: nenhum efeito, nenhuma montagem, nenhuma
   * troca de aba chega até a rota.
   */
  const analyze = PAGINA_DO_RADAR.slice(
    PAGINA_DO_RADAR.indexOf("const analyzeSerpSelection = async"),
    PAGINA_DO_RADAR.indexOf("const reviewSerpForArticle = async"),
  );
  assert.match(analyze, /verify-sources/, "a verificação acontece no ANALYZE");

  /* Um único ponto de CHAMADA — a etiqueta do log não conta como caminho. */
  const chamadas = PAGINA_DO_RADAR.split("radar-analysis/verify-sources\", {").length - 1;
  assert.equal(chamadas, 1, "existe exatamente um ponto de chamada, e ele é o ANALYZE");

  /* O START não verifica: a subetapa não existe no caminho da coleta. */
  const start = PAGINA_DO_RADAR.slice(
    PAGINA_DO_RADAR.indexOf("const startDeepResearch = async"),
    PAGINA_DO_RADAR.indexOf("const analyzeSerpSelection = async"),
  );
  assert.equal(/verify-sources/.test(start), false, "START sozinho não verifica fonte");

  /* E nenhum efeito de montagem chama a rota. */
  for (const bloco of PAGINA_DO_RADAR.split("useEffect(")) {
    assert.equal(/verify-sources/.test(bloco.slice(0, 1200)), false, "nenhum efeito busca fonte");
  }
});

test("GATE 12.1 · D — a verificação é subetapa, não um quarto botão", () => {
  /* A Fase 1 continua com três ações. */
  const acoes = readFileSync("lib/radar/serp-phase1.ts", "utf8");
  assert.match(acoes, /START_RESEARCH \| ANALYZE_COMPETITION \| FINALIZE_SERP \| NONE|"START_RESEARCH" \| "ANALYZE_COMPETITION" \| "FINALIZE_SERP" \| "NONE"/);
  for (const inventado of ["VERIFY_SOURCES", "ANALYZE_AUTHORITY", "RUN_EEAT"]) {
    assert.equal(acoes.includes(inventado), false, `NEW_REQUIRED_USER_ACTION = NO — ${inventado}`);
  }
  const workbench = readFileSync("modules/radar/radar-r3-workbench.tsx", "utf8");
  assert.equal(/Verificar fontes|Analisar autoridade/.test(workbench), false, "nenhum botão novo na tela");

  /* E o progresso aparece dentro da mesma operação. */
  assert.match(PAGINA_DO_RADAR, /Verificando \$\{planoDeFontes\.length\} fonte\(s\) relevante\(s\)…/);
  assert.match(PAGINA_DO_RADAR, /Consolidando evidências…/);
});

/* ======  E e F · O CLIENTE NÃO ESCOLHE O ENDEREÇO  ================== */

test("GATE 12.1 · E — o contrato do pedido não tem campo de URL", () => {
  const aceito = RadarSourceVerificationRequestSchema.safeParse({
    brandId: "b", articleId: "a", analysisVersionId: "v1", articleDnaVersionId: "dna-v1",
    sourceIds: ["source:12345678"],
  });
  assert.equal(aceito.success, true);

  /* `.strict()` recusa na porta em vez de ignorar em silêncio. */
  const comUrl = RadarSourceVerificationRequestSchema.safeParse({
    brandId: "b", articleId: "a", analysisVersionId: "v1", articleDnaVersionId: "dna-v1",
    sourceIds: ["source:12345678"], url: "http://169.254.169.254/latest/meta-data/",
  });
  assert.equal(comUrl.success, false, "CLIENT_CAN_CHOOSE_SOURCE_URL = NO");

  const contrato = readFileSync("lib/radar/source-verification-request.ts", "utf8");
  const schema = contrato.slice(contrato.indexOf("RadarSourceVerificationRequestSchema = z.object"), contrato.indexOf("export type RadarSourceVerificationRequest"));
  assert.equal(/\burl\b\s*:/.test(schema), false, "não existe campo por onde um endereço entre");
  assert.match(schema, /sourceIds: z\.array/);
});

test("GATE 12.1 · E — o destino sai do plano persistido, e trocar a URL é impossível", () => {
  const atual = plano();
  const aad = atual.find(item => item.candidateUrl.includes("oily-skin"))!;

  const resolvido = radarSourceVerificationTargets({ plan: atual, requestedSourceIds: [radarSourceId("https://www.aad.org/public/diseases/oily-skin")] });
  assert.equal(resolvido.targets[0].candidateUrl, aad.candidateUrl, "SERVER_RESOLVES_PERSISTED_SOURCE");
  assert.ok(resolvido.targets[0].candidateUrl.startsWith("https://www.aad.org/"));

  /* O que a rota busca é o alvo resolvido — o corpo não participa disso. */
  const rota = readFileSync("app/api/editorial/radar-analysis/verify-sources/route.ts", "utf8");
  assert.match(rota, /const pages = persistida\.payload\.extractions;/, "as páginas vêm do que está gravado");
  assert.match(rota, /verifyRadarSources\(\{ targets \}\)/, "e o fetch recebe só os alvos resolvidos");
  assert.equal(/input\.(url|destinationUrl|candidateUrl)/.test(rota), false, "nenhum endereço do corpo chega ao fetch");
});

test("GATE 12.1 · F — domínio fora do plano é recusado", () => {
  const recusado = radarSourceVerificationTargets({ plan: plano(), requestedSourceIds: ["source:00000000", "source:deadbeef"] });

  assert.equal(recusado.targets.length, 0);
  assert.deepEqual(recusado.refused.map(item => item.code), ["SOURCE_UNKNOWN", "SOURCE_UNKNOWN"]);
  assert.equal(RADAR_SOURCE_VERIFICATION_ERROR.SOURCE_UNKNOWN, "SOURCE_UNKNOWN");
  assert.match(radarSourceVerificationErrorMessage(RADAR_SOURCE_VERIFICATION_ERROR.SOURCE_UNKNOWN, ""), /não está no plano de verificação/);

  const rota = readFileSync("app/api/editorial/radar-analysis/verify-sources/route.ts", "utf8");
  assert.match(rota, /if \(refused\.length\) \{/, "a rota recusa antes de buscar qualquer coisa");
});

/* =========  3 · A ROTA VALIDA IDENTIDADE E FUNDAMENTO  ============== */

test("GATE 12.1 · a rota valida sessão, marca, artigo, versão e ArticleDNA", () => {
  const rota = readFileSync("app/api/editorial/radar-analysis/verify-sources/route.ts", "utf8");

  assert.match(rota, /requireCanonicalSessionProfile/, "autenticação");
  assert.match(rota, /assertEditorialPermission\(profile, input\.brandId, "radar", "edit"\)/, "permissão por marca");
  assert.match(rota, /linha\.marca_id === input\.brandId && linha\.article_id === input\.articleId/, "marca e artigo");
  assert.match(rota, /versoes\.find\(version => version\.versionId === input\.analysisVersionId\)/, "a versão pedida");
  assert.match(rota, /persistida\.payload\.articleDnaVersionId !== input\.articleDnaVersionId/, "o fundamento");
  assert.match(rota, /ARTICLE_DNA_MISMATCH/);
  assert.match(rota, /ANALYSIS_UNKNOWN/);
});

/* =====  5 e G · SELEÇÃO AUTOMÁTICA E DEDUPLICAÇÃO  ================= */

test("GATE 12.1 · a seleção é automática, priorizada, e o ruído fica de fora", () => {
  const atual = plano();
  const dominios = atual.map(item => item.domain);

  assert.ok(dominios.includes("www.aad.org"), "recorrente e ligada a afirmação sensível");
  assert.ok(dominios.includes("pubmed.ncbi.nlm.nih.gov"), "potencial fonte primária");
  assert.equal(dominios.includes("www.instagram.com"), false, "SOURCE_SELECTION_AUTOMATIC: rede social fora");
  assert.ok(["HIGH", "MEDIUM"].includes(atual[0].priority), "a mais sensível vem primeiro");
  assert.ok(atual.every((item, index) => index === 0 || item.priority !== "HIGH" || atual[index - 1].priority === "HIGH"), "a ordem respeita a prioridade");
  assert.ok(atual.every(item => item.reason.length > 10));
});

test("GATE 12.1 · G — a mesma URL não é buscada duas vezes", async () => {
  const buscadas: string[] = [];
  const html = "<html><head><title>t</title></head><body><h1>t</h1>" + "<p>corpo com texto suficiente para a extracao terminar bem.</p>".repeat(6) + "</body></html>";
  const resposta = (url: string) => ({
    ok: true, status: 200, url,
    headers: new Headers({ "content-type": "text/html" }),
    text: async () => html, arrayBuffer: async () => new TextEncoder().encode(html).buffer,
  }) as unknown as Response;

  const alvo = plano().find(item => item.candidateUrl.includes("oily-skin"))!;
  const resultado = await verifyRadarSources({
    targets: [alvo, alvo, { ...alvo }],
    fetchImpl: (async (entrada: unknown) => { buscadas.push(String(entrada)); return resposta(alvo.candidateUrl); }) as unknown as typeof fetch,
    lookupImpl: (async () => [{ address: "93.184.216.34" }]) as never,
    now: "2026-09-10T10:00:00.000Z",
  });

  assert.equal(buscadas.length, 1, "SOURCE_DEDUPLICATION");
  assert.equal(resultado.verified.length, 1);
});

/* ======  H, I, J e K · RETRY, LIMITAÇÃO E PENDÊNCIA ZERO  ========= */

test("GATE 12.1 · H e I — 429 e 5xx voltam para a fila; 404 vira limitação", () => {
  /* A mesma classificação da extração: nenhum segundo critério de retry. */
  assert.equal(radarExtractionFailureIsRecoverable({ code: "too_many_requests", status: 429 }), true);
  assert.equal(radarExtractionFailureIsRecoverable({ code: "http_server_error", status: 503 }), true);
  assert.equal(radarExtractionFailureIsRecoverable({ code: "timeout", status: 504 }), true);
  assert.equal(radarExtractionFailureIsRecoverable({ code: "not_found", status: 404 }), false);
  assert.equal(radarExtractionFailureIsRecoverable({ code: "access_blocked", status: 403 }), false);

  /* E o cliente usa exatamente essa autoridade na subetapa. */
  const analyze = PAGINA_DO_RADAR.slice(PAGINA_DO_RADAR.indexOf("const analyzeSerpSelection = async"), PAGINA_DO_RADAR.indexOf("const reviewSerpForArticle = async"));
  assert.match(analyze, /radarExtractionFailureIsRecoverable\(\{ code: falha\.code, status: falha\.status \}\)/);
  assert.match(analyze, /tentativasDeFonte/);
  assert.match(analyze, /RADAR_EXTRACTION_MAX_ATTEMPTS/);
});

test("GATE 12.1 · J e K — uma fonte que falha não aborta, e nada fica pendente", async () => {
  const html = "<html><head><title>t</title></head><body><h1>t</h1>" + "<p>corpo com texto suficiente para a extracao terminar bem.</p>".repeat(6) + "</body></html>";
  const alvos = plano();
  const resultado = await verifyRadarSources({
    targets: alvos,
    fetchImpl: (async (entrada: unknown) => {
      const url = String(entrada);
      if (url.includes("pubmed")) return { ok: false, status: 404, url, headers: new Headers({ "content-type": "text/html" }), text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
      return { ok: true, status: 200, url, headers: new Headers({ "content-type": "text/html" }), text: async () => html, arrayBuffer: async () => new TextEncoder().encode(html).buffer } as unknown as Response;
    }) as unknown as typeof fetch,
    lookupImpl: (async () => [{ address: "93.184.216.34" }]) as never,
    now: "2026-09-10T10:00:00.000Z",
  });

  assert.ok(resultado.verified.length > 0, "as demais continuam");
  const falha = resultado.failures.find(item => item.url.includes("pubmed"))!;
  assert.equal(falha.code, "not_found");
  assert.ok(resultado.limitations.some(item => /não puderam ser verificadas/.test(item)), "e a falha vira limitação declarada");

  /* SOURCE_PENDING = 0: toda selecionada terminou verificada ou como falha. */
  assert.equal(resultado.verified.length + resultado.failures.length, alvos.length);
});

/* =========  9, L, R · PERSISTÊNCIA, READBACK E BUNDLE  ============= */

test("GATE 12.1 · L — a verificação é gravada na versão e lida de volta", () => {
  const analyze = PAGINA_DO_RADAR.slice(PAGINA_DO_RADAR.indexOf("const analyzeSerpSelection = async"), PAGINA_DO_RADAR.indexOf("const reviewSerpForArticle = async"));
  assert.match(analyze, /verifiedSources: fontesVerificadas, sourceVerificationFailures: falhasDeFonte/, "PERSISTENCE");
  assert.match(analyze, /createRadarAnalysisSuccessor/, "numa versão sucessora, append-only");

  /* READBACK: a leitura da aba usa o que ficou gravado, não o que o cliente montou. */
  assert.match(PAGINA_DO_RADAR, /verifiedSources: analysis\?\.payload\.verifiedSources \|\| \[\]/, "READBACK_REQUIRED");

  /* E o campo é aditivo: análise gravada antes deste corte continua parseando. */
  const legado = {
    schemaVersion: 1, brandId: "b", articleId: "a", articleDnaVersionId: "dna",
    serpSnapshotId: "s", serpSnapshotVersion: 1, serpSnapshotHash: "h",
    mode: "competitive_full",
    modeRecommendation: { suggestedMode: "competitive_full", reasons: ["fixture"], confidence: "medium", ruleSource: "minerador_kgr_strict" },
    modeHumanReason: "", serpDecisions: [], selectedCompetitorIds: [], extractionIds: [], extractions: [],
    benchmark: null, semanticTerms: [], structuralDecisions: [], competitiveness: null, keywordDecisions: [],
    plannerPackage: null, status: "draft", humanNotes: [], approvedAt: null, approvedBy: null,
  };
  const parseado = RadarAnalysisPayloadSchema.parse(legado);
  assert.deepEqual(parseado.verifiedSources, [], "ausência declarada, nunca fonte inventada");
  assert.deepEqual(parseado.sourceVerificationFailures, []);
});

test("GATE 12.1 · R — a fonte verificada volta do registro sem reescrever a regra", () => {
  const registro = {
    domain: "www.aad.org", url: "https://www.aad.org/public/diseases/oily-skin",
    sourceType: "PROFESSIONAL_ORGANIZATION", classificationReason: "A página verificada declara-se organização.",
    confidence: "MEDIUM" as const, signals: ["dados estruturados de organização"],
    provenance: "https://www.aad.org/... · verificada.",
  };
  const classificacao = radarSourceClassificationFromRecord(registro);

  assert.equal(classificacao.type, "PROFESSIONAL_ORGANIZATION");
  assert.equal(classificacao.verified, true, "gravada como verificada é porque foi lida");
  assert.equal(classificacao.provenance, registro.provenance);

  /* Um tipo desconhecido no registro não vira autoridade por descuido. */
  const forjado = radarSourceClassificationFromRecord({ ...registro, sourceType: "SUPREME_AUTHORITY" });
  assert.equal(forjado.type, "UNKNOWN");
});

/* ======  M, N, O, P e Q · O QUE MUDA E O QUE NÃO MUDA  =========== */

test("GATE 12.1 · O — a página baixada não inventa o que ela diz sobre a afirmação", () => {
  const rota = readFileSync("app/api/editorial/radar-analysis/verify-sources/route.ts", "utf8");
  for (const inventado of ["SUPPORTS", "CONTRADICTS", "QUALIFIES", "supportType"]) {
    assert.equal(rota.includes(inventado), false, `SUPPORT_TYPE_INVENTED = NO — ${inventado}`);
  }
  /* Sem interpretação, o estado é INSUFFICIENT — e isso vive no domínio. */
  const evidencia = readFileSync("lib/radar/source-authority.ts", "utf8");
  assert.match(evidencia, /input\.reading\?\.supportType \|\| "INSUFFICIENT"/);

  /* E nenhum adaptador de IA foi ligado em silêncio. */
  assert.equal(/deepseek|openai|anthropic|gerarInterpretacao/i.test(rota), false);
});

test("GATE 12.1 · P e Q — a SERP e o ArticleDNA não são tocados pela verificação", () => {
  const rota = readFileSync("app/api/editorial/radar-analysis/verify-sources/route.ts", "utf8");

  /* A rota lê e devolve. Ela não grava nada em lugar nenhum. */
  assert.equal(/\.save\(|\.upsert\(|\.update\(|\.insert\(/.test(rota), false, "SERP_EVIDENCE_MUTATED = NO");
  assert.equal(/articleDna|SiloDna|internalLinkGraph/i.test(rota.replace(/articleDnaVersionId/g, "")), false, "ARTICLE_UPSTREAM_MUTATED = NO");

  /* E o que ela devolve é fonte — não recorrência, conceito nem classificação de concorrente. */
  const resposta = rota.slice(rota.indexOf("return NextResponse.json({"), rota.indexOf("} catch (error)"));
  for (const daSerp of ["recurrence", "competitorClass", "concepts", "organicResults"]) {
    assert.equal(resposta.includes(daSerp), false, `a verificação não devolve ${daSerp}`);
  }
});

test("GATE 12.1 · M e N — a evidência verificada reconstrói autoridade e especialista", () => {
  /* A rota não tem regra própria: ela chama as autoridades do Gate 11 e 12. */
  const rota = readFileSync("app/api/editorial/radar-analysis/verify-sources/route.ts", "utf8");
  assert.match(rota, /buildRadarSemanticConceptModel/);
  assert.match(rota, /buildRadarExternalSourceResearch/);
  assert.match(rota, /buildRadarEvidenceClaims/);
  assert.match(rota, /buildRadarSourceVerificationPlan/);
  assert.equal(/classifyRadarSourceAuthority\(\{/.test(rota), false, "a classificação vem da verificação, não é refeita aqui");

  /* E a reconstrução acontece na leitura única, com a mesma autoridade. */
  const view = readFileSync("lib/radar/deep-research-view.ts", "utf8");
  assert.match(view, /verifiedSources: \(input\.verifiedSources \|\| \[\]\)\.map\(radarSourceClassificationFromRecord\)/);
  const modelo = readFileSync("lib/radar/competitive-observed-model.ts", "utf8");
  assert.match(modelo, /sources: input\.verifiedSources/, "AUTHORITY_EVIDENCE_REBUILT");
  assert.match(modelo, /buildRadarAuthorityEvidence\(\{/, "SPECIALIST_REQUIREMENTS_REBUILT pela mesma autoridade");
});

/* ==============  S · NENHUM PROVIDER REAL NOS TESTES  ============= */

test("GATE 12.1 · S — o lote e a mensagem de erro são contrato, e nada aqui chama rede", () => {
  assert.equal(RADAR_SOURCE_VERIFICATION_BATCH, 12);
  assert.deepEqual(radarSourceVerificationBatches(["a", "b", "c"], 2), [["a", "b"], ["c"]]);
  assert.match(radarSourceVerificationErrorMessage(RADAR_SOURCE_VERIFICATION_ERROR.ARTICLE_DNA_MISMATCH, ""), /fundamentos do artigo mudaram/);

  const contrato = readFileSync("lib/radar/source-verification-request.ts", "utf8");
  const codigo = contrato.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const proibido of ["fetch(", "supabase", "Repository", "process.env"]) {
    assert.equal(codigo.includes(proibido), false, `${proibido} não pode existir no contrato`);
  }
});
