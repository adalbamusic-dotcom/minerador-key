import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

/*
 * O REDATOR RECEBE O ARTIGO-MODELO APROVADO E A VOZ DA MARCA — 2026-10-02.
 *
 * SDD docs/05-radar/sdd-diretriz-editorial-pela-serp-2026-10-02.md, Adendo A
 * (D5: "só o aprovado vai ao CSV e ao Redator") e Adendo C (voz da marca;
 * regra canônica da Marca, spec §24: a versão CORRENTE não arquivada da Skill
 * `brand_voice`, rascunho incluído). O dono pediu a voz "inclusive para ser
 * útil nos CTAs e demais coisas".
 *
 * Os dois são LIDOS AO VIVO por Marca + artigo + pacote — nunca gravados no
 * documento. Aqui o PostgREST é falso: o `fetch` do cliente é injetado (e o
 * global só para o cliente operacional da semeadura), cada consulta fica
 * registrada com tabela, colunas e filtros, e nada sai da máquina. Nenhuma IA,
 * nenhum crédito.
 */

const URL_FALSA = "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_URL = URL_FALSA;
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";

const { readWriterEvidence, readWriterEvidenceManifest, readWriterFoundations, readWriterSectionMaterial, WriterEvidenceError } = await import("../lib/server/writer-evidence-reader.ts");
const { readWriterEvidenceHead } = await import("../lib/server/writer-evidence-document.ts");
const {
  WRITER_EVIDENCE_LIMITS, fitWriterFoundations, parseWriterEvidenceSourceKey, writerArticleBlueprintFoundation, writerBrandVoiceFoundation,
  writerEvidenceEnvelope, writerEvidenceHierarchyOf, writerEvidenceJsonBytes, writerEvidenceOwnerOf,
} = await import("../lib/redator/writer-evidence-catalog.ts");
const { WriterAiAlertSchema, WriterSectionProviderSchema, buildWriterSectionEvidencePackage, writerBlueprintForSection, writerSectionSourceOf } = await import("../lib/redator/writer-section-evidence.ts");
const { resolveWriterDivergenceTarget } = await import("../lib/redator/writer-evidence-divergence.ts");
const { IMPROVE_SYSTEM_PROMPT, SECTION_WRITING_SYSTEM_PROMPT, buildSectionWritingPrompt, createSectionPromptContext } = await import("../lib/redator/prompts.ts");
const { CAROUSEL_SEED_SYSTEM_PROMPT, SCRIPT_SEED_SYSTEM_PROMPT, buildCarouselSeedPrompt, buildScriptSeedPrompt, seedContextLines } = await import("../lib/redator/deliverable-seed.ts");
const { radarFoundationsOf } = await import("../lib/redator/radar-foundations.ts");
const { ContentDocumentSchema } = await import("../lib/arquiteto/contracts.ts");
const { writerSeedDocument } = await import("../lib/server/writer-seed.ts");
const { bundleDoRadar, documentoV2ComDossie } = await import("./editorial-documento-e1-fixtures.mts");

type Linha = Record<string, unknown>;

/* ================================ identidades ================================ */

const brandA = "aaaaaaaa-0000-4000-8000-000000000001";
const brandB = "bbbbbbbb-0000-4000-8000-000000000002";
const documentId = "writer:doc-artigo-modelo";
const articleId = "artigo-e1";
const BUNDLE = "bundle-hash:e1";
const plantaAprovada = "cccccccc-0000-4000-8000-000000000003";
const plantaRascunho = "cccccccc-0000-4000-8000-000000000004";
const plantaDeOutroPacote = "cccccccc-0000-4000-8000-000000000002";
const plantaDaOutraMarca = "cccccccc-0000-4000-8000-000000000009";
const vozV1 = "dddddddd-0000-4000-8000-000000000001";
const vozV2 = "dddddddd-0000-4000-8000-000000000002";
const vozDaOutraMarca = "dddddddd-0000-4000-8000-000000000009";
const HASH = (letra: string) => `sha256:${letra.repeat(64)}`;

const CTA_DA_MARCA = "Agende uma avaliação com a dermatologista da Care Glow pelo link da página de consulta.";
const CTA_DA_PLANTA = "Convide o leitor a agendar a avaliação noturna da Care Glow.";
const VOZ_DA_OUTRA_MARCA = "VOZ-DA-OUTRA-MARCA-NUNCA-SAI";
const PLANTA_DA_OUTRA_MARCA = "PLANTA-DA-OUTRA-MARCA-NUNCA-SAI";
const PESO_DA_EVIDENCIA = "PESO-DA-EVIDENCIA-DA-PLANTA";

/* ================================== fixtures ================================= */

function planta(h1: string, extra: Partial<{ cta: string; secoes: number }> = {}) {
  const secoes = [
    { h2: "Limpeza: o primeiro passo da noite", readerQuestion: "Como limpar a pele à noite?", answerFirst: "Comece com um gel de limpeza suave e água morna.", h3: ["Gel ou sabonete?"],
      internalLinks: [{ candidate: "K1", anchor: "rotina de skin care", reason: "o Pilar do Silo" }] },
    { h2: "Hidratação para pele oleosa", readerQuestion: "Pele oleosa precisa de hidratante?", answerFirst: "Precisa, e o gel-creme leve resolve sem pesar.", h3: ["Textura gel-creme", "Quanto aplicar"],
      internalLinks: [{ candidate: "K2", anchor: "consulta online", reason: "página comercial da marca" }, { candidate: "K9", anchor: "candidato inexistente", reason: "fora do pacote" }] },
    { h2: "Protetor e retinol: o que fica para a manhã", readerQuestion: "Retinol vai de noite ou de dia?", answerFirst: "Retinol é da noite; o protetor é da manhã.", h3: [], internalLinks: [] },
  ];
  const sections = Array.from({ length: extra.secoes ?? secoes.length }, (_, indice) => ({
    ...secoes[indice % secoes.length],
    ...(indice >= secoes.length ? { h2: `Seção extra ${indice} ${"h".repeat(200)}`, answerFirst: "r".repeat(600) } : {}),
    explain: [], paragraphs: 3, bold: [], terms: [], evidence: ["S1"], specialist: null, video: null, externalLinks: [], image: null, practical: null,
  }));
  return {
    schemaVersion: 1,
    blueprint: {
      keywordPlan: { reading: "A principal e a secundária pedem a mesma rotina.", principalPlacement: ["H1"], complementary: [], slugNote: null },
      reader: "Quem tem pele oleosa e pouco tempo à noite",
      promise: "Uma rotina noturna simples que cabe em cinco minutos",
      angle: { statement: "A ordem certa vale mais que o produto caro", evidence: ["S1"] },
      title: { h1, alternatives: [], seoTitle: "Skin care noturno: rotina em 5 passos", metaDescription: "Monte a rotina noturna para pele oleosa na ordem certa." },
      opening: { readerQuestion: "Qual a ordem certa dos produtos à noite?", direction: "Responder a ordem no primeiro parágrafo.", evidence: [] },
      sections,
      closing: { turn: "Quem quer ir além da rotina precisa de avaliação.", specialist: null, cta: extra.cta ?? CTA_DA_PLANTA, nextStep: "Ler o guia da rotina matinal" },
      visual: [{ slot: "CAPA", section: null, concept: "pia", prompt: "pia com produtos", alt: "pia", caption: "rotina" }],
      eeat: [], warnings: [],
    },
    measures: {
      serp: { comparablePages: 8, words: { median: 1500, p25: 1200, p75: 1800 }, h2: 6, h3: 4, paragraphs: 20, images: 3, lists: 2 },
      plan: { sections: sections.length, h3: 3, paragraphs: 9, bold: 0, images: 1, respites: 0, internalLinks: 3, externalLinks: 0, wordsMin: 1200, wordsMax: 1800 },
    },
    linkCandidates: [
      { id: "K1", label: "Rotina de skin care", role: "Pilar", destination: "/rotina-de-skin-care", status: "PLANNED", fromGraph: true },
      { id: "K2", label: "Página da marca /consulta-online", role: "Página da marca (Skill de voz)", destination: "https://careglow.com.br/consulta-online", status: "PUBLISHED", fromGraph: false },
    ],
    sources: [],
    evidence: [{ id: "S1", kind: "resultado orgânico", text: `${PESO_DA_EVIDENCIA} ${"e".repeat(300)}` }],
    brandVoice: { versionId: vozV2, version: 2, name: "Voz Care Glow", contentHash: HASH("v"), status: "draft" },
  };
}

const linhaDaPlanta = (id: string, marca: string, versao: number, estado: "DRAFT" | "APPROVED", hash: string, h1: string, extra: Parameters<typeof planta>[1] = {}) => ({
  id, brand_id: marca, article_id: articleId, bundle_hash: hash, version_number: versao, state: estado, origin: "ai",
  payload: planta(h1, extra), validation: [], created_by: "ator-1", created_at: "2026-10-02T10:00:00+00:00",
  approved_by: estado === "APPROVED" ? "ator-1" : null, approved_at: estado === "APPROVED" ? "2026-10-02T11:00:00+00:00" : null,
});

const SECOES_DA_VOZ = [
  { heading: "1. Missão e público", key: "missao", body: "Falamos com quem tem pele oleosa e pouco tempo." },
  { heading: "2. Construção do artigo e transição comercial", key: "construcao", body: "A transição para a oferta acontece só depois de resolver a dúvida do leitor." },
  { heading: "3. CTA e oferta", key: "cta", body: CTA_DA_MARCA },
  { heading: "4. Tom de voz e vocabulário", key: "voz", body: "Direta, acolhedora, sem promessa de resultado. Nunca use 'milagre'." },
  { heading: "5. Fontes e autoridade", key: "fontes", body: "Cite a SBD quando falar de ativos." },
  { heading: "6. Imagens", key: "imagens", body: "Sem antes e depois." },
];

function skill(marca: string, versao: number, extra: Partial<{ body: string; versionId: string }> = {}) {
  const secoes = extra.body ? SECOES_DA_VOZ.map(secao => ({ ...secao, body: extra.body! })) : SECOES_DA_VOZ;
  return {
    schemaVersion: 1, brandId: marca, definitionKey: "brand_voice", name: "Voz Care Glow",
    originalMarkdown: `# Voz Care Glow\n\n${secoes.map(secao => `## ${secao.heading}\n${secao.body}`).join("\n\n")}`,
    normalizedContent: { definitionKey: "brand_voice", title: "Voz Care Glow", sections: secoes, sectionDiagnostics: [], extraSections: [] },
    structureDiagnostics: [], sourceFilename: "voz.md", contentHash: HASH(String(versao)), version: versao, status: "draft",
    provenance: { importedBy: "ator-1", importedAt: "2026-10-01T10:00:00.000Z", sourceByteSize: 900, previousContentHash: null, previousVersion: versao > 1 ? versao - 1 : null },
    ...(extra.versionId ? { versionId: extra.versionId } : {}),
  };
}

const versaoDaVoz = (versionId: string, marca: string, versao: number, payload: Linha) => ({
  version_id: versionId, entity_id: `${marca}:brand_voice`, marca_id: marca, artifact_type: "brand_skill", version_number: versao, status: "draft",
  content_hash: HASH(String(versao)), created_at: `2026-10-0${versao}T10:00:00+00:00`, payload,
});

function tabelas(): Record<string, Linha[]> {
  return {
    content_documents: [{
      id: documentId, marca_id: brandA, article_id: articleId, content_hash: "hash-doc", status: "escrevendo", updated_at: "2026-09-23T10:00:00+00:00",
      article_dna_version_id: "artigo-e1-v1", lock_version: 1, payload: documentoV2ComDossie(documentId, bundleDoRadar(2_000)),
    }],
    radar_article_blueprints: [
      linhaDaPlanta(plantaDeOutroPacote, brandA, 2, "APPROVED", "bundle-hash:antigo", "Planta do congelamento antigo"),
      linhaDaPlanta(plantaAprovada, brandA, 3, "APPROVED", BUNDLE, "Rotina de skin care noturno em 5 passos"),
      linhaDaPlanta(plantaRascunho, brandA, 4, "DRAFT", BUNDLE, "Rascunho que ninguém aprovou"),
      linhaDaPlanta(plantaDaOutraMarca, brandB, 9, "APPROVED", BUNDLE, PLANTA_DA_OUTRA_MARCA),
    ],
    editorial_artifact_versions: [
      versaoDaVoz(vozV1, brandA, 1, skill(brandA, 1)),
      versaoDaVoz(vozV2, brandA, 2, skill(brandA, 2)),
      versaoDaVoz(vozDaOutraMarca, brandB, 5, skill(brandB, 5, { body: VOZ_DA_OUTRA_MARCA })),
    ],
    editorial_version_status_events: [
      { id: "ev-1", version_id: vozV1, status: "approved", occurred_at: "2026-10-01T11:00:00+00:00" },
      { id: "ev-2", version_id: vozDaOutraMarca, status: "approved", occurred_at: "2026-10-01T11:00:00+00:00" },
    ],
  };
}

/* =============================== PostgREST falso ============================== */

type Registro = { table: string; method: string; select: string | null; params: URLSearchParams; responseBytes: number };
const registros: Registro[] = [];
let banco = tabelas();
/* Tabelas que respondem como no remoto sem a migration (PGRST205) ou com falha transitória. */
let tabelaAusente: string | null = null;
let falhaDaVoz = false;

function extrair(linha: Linha, expressao: string): unknown {
  const partes = expressao.split(/(->>|->)/);
  let valor: unknown = linha[partes[0]];
  let comoTexto = false;
  for (let indice = 1; indice < partes.length; indice += 2) {
    const chave = partes[indice + 1];
    if (valor && typeof valor === "object") valor = Array.isArray(valor) ? (/^\d+$/.test(chave) ? valor[Number(chave)] : undefined) : (valor as Linha)[chave];
    else valor = undefined;
    comoTexto = partes[indice] === "->>";
  }
  if (valor === undefined) return null;
  if (comoTexto && valor !== null) return typeof valor === "object" ? JSON.stringify(valor) : String(valor);
  return valor;
}

function projetar(linha: Linha, select: string | null): Linha {
  if (!select || select === "*") return linha;
  return Object.fromEntries(select.split(",").map(coluna => {
    const [apelido, expressao] = coluna.includes(":") ? [coluna.slice(0, coluna.indexOf(":")), coluna.slice(coluna.indexOf(":") + 1)] : [coluna, coluna];
    return [apelido, extrair(linha, expressao)];
  }));
}

const listaDoIn = (valor: string) => valor.slice(1, -1).split(",").map(item => item.replace(/^"|"$/g, ""));

function filtrar(linhas: Linha[], params: URLSearchParams): Linha[] {
  let saida = linhas;
  for (const [chave, valor] of params.entries()) {
    if (["select", "order", "limit", "offset"].includes(chave)) continue;
    const ponto = valor.indexOf(".");
    const operador = valor.slice(0, ponto);
    const alvo = valor.slice(ponto + 1);
    saida = saida.filter(linha => {
      const atual = extrair(linha, chave);
      if (operador === "eq") return atual !== null && String(atual) === alvo;
      if (operador === "in") return atual !== null && listaDoIn(alvo).includes(String(atual));
      if (operador === "is") return alvo === "null" ? atual === null : false;
      if (operador === "gt") return atual !== null && Date.parse(String(atual)) > Date.parse(alvo);
      throw new Error(`operador não suportado no falso: ${operador}`);
    });
  }
  const ordem = params.get("order");
  if (ordem) {
    const chaves = ordem.split(",").map(parte => { const [coluna, direcao] = parte.split("."); return { coluna, desc: direcao === "desc" }; });
    saida = [...saida].sort((a, b) => {
      for (const { coluna, desc } of chaves) {
        const [x, y] = [a[coluna] as string | number, b[coluna] as string | number];
        if (x === y) continue;
        return (x < y ? -1 : 1) * (desc ? -1 : 1);
      }
      return 0;
    });
  }
  return saida;
}

const resposta = (corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) =>
  new Response(corpo === null ? null : JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", ...cabecalhos } });

async function falso(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const pedido = entrada instanceof Request ? entrada : new Request(entrada, init);
  const url = new URL(pedido.url);
  const tabela = url.pathname.replace(/^\/rest\/v1\//, "");
  const metodo = pedido.method.toUpperCase();
  const select = url.searchParams.get("select");
  const registro: Registro = { table: tabela, method: metodo, select, params: url.searchParams, responseBytes: 0 };
  registros.push(registro);
  /* As funções SQL do leitor não existem aqui: o leitor tem de funcionar sem elas. */
  if (tabela.startsWith("rpc/")) return resposta({ code: "PGRST202", message: `Could not find the function public.${tabela.slice(4)}`, details: null, hint: null }, 404);
  if (metodo !== "GET" && metodo !== "HEAD") throw new Error(`o leitor não pode escrever: ${metodo} ${tabela}`);
  if (tabela === tabelaAusente) return resposta({ code: "PGRST205", message: `Could not find the table 'public.${tabela}' in the schema cache`, details: null, hint: null }, 404);
  if (falhaDaVoz && tabela === "editorial_artifact_versions" && url.searchParams.get("entity_id") === `eq.${brandA}:brand_voice`) {
    return resposta({ code: "57014", message: "canceling statement due to statement timeout", details: null, hint: null }, 500);
  }
  const todas = filtrar(banco[tabela] ?? [], url.searchParams);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limite = url.searchParams.get("limit");
  const pagina = todas.slice(offset, limite ? offset + Number(limite) : undefined).map(linha => projetar(linha, select));
  const cabecalhos: Record<string, string> = {};
  if ((pedido.headers.get("prefer") || "").includes("count=exact")) cabecalhos["Content-Range"] = pagina.length ? `${offset}-${offset + pagina.length - 1}/${todas.length}` : `*/${todas.length}`;
  if (metodo === "HEAD") return new Response(null, { status: 200, headers: cabecalhos });
  if ((pedido.headers.get("accept") || "").includes("vnd.pgrst.object")) {
    if (pagina.length !== 1) return resposta({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null }, 406);
    registro.responseBytes = Buffer.byteLength(JSON.stringify(pagina[0]));
    return resposta(pagina[0], 200, cabecalhos);
  }
  registro.responseBytes = Buffer.byteLength(JSON.stringify(pagina));
  return resposta(pagina, 200, cabecalhos);
}

/* O cliente operacional da semeadura usa o `fetch` global: só o endereço falso é interceptado. */
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const endereco = entrada instanceof Request ? entrada.url : String(entrada);
  return endereco.startsWith(URL_FALSA) ? falso(entrada, init) : fetchOriginal(entrada, init);
}) as typeof fetch;

const cliente = createClient(URL_FALSA, "chave-de-teste", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: falso as typeof fetch } });
const contexto = (brandId = brandA) => ({ brandId, client: cliente, now: () => new Date("2026-10-02T12:00:00.000Z") });

function reiniciar(alterar?: (atual: Record<string, Linha[]>) => void) {
  registros.length = 0;
  banco = tabelas();
  tabelaAusente = null;
  falhaDaVoz = false;
  alterar?.(banco);
}

async function erroDe(promessa: Promise<unknown>): Promise<InstanceType<typeof WriterEvidenceError>> {
  try { await promessa; } catch (erro) { if (erro instanceof WriterEvidenceError) return erro; throw erro; }
  throw new Error("esperava WriterEvidenceError");
}

/** R4 e R5: toda consulta filtra a Marca e nenhuma pede `payload` nu. */
function conferirLeitura(marca = brandA) {
  for (const registro of registros) {
    if (registro.table.startsWith("rpc/")) continue;
    for (const coluna of (registro.select || "").split(",")) {
      const expressao = coluna.includes(":") ? coluna.slice(coluna.indexOf(":") + 1) : coluna;
      assert.ok(!["payload", "payload->payload", "*"].includes(expressao), `${registro.table} leu ${coluna}`);
      assert.doesNotMatch(expressao, /originalMarkdown/, `${registro.table} baixou o Markdown inteiro da Skill`);
    }
    if (registro.table === "editorial_version_status_events") { assert.ok(registro.params.get("version_id")?.startsWith("in."), "eventos só por ids"); continue; }
    const filtro = registro.params.get("marca_id") ?? registro.params.get("brand_id");
    assert.ok(filtro === `eq.${marca}` || filtro === `in.(${marca})`, `${registro.table} sem filtro de Marca: ${registro.params.toString()}`);
  }
}

const doArtigoModelo = () => registros.filter(registro => registro.table === "radar_article_blueprints");

const PROXIMO_PASSO_DE_SEMPRE = "Leia get_writer_evidence_manifest e, para a seção que está escrevendo, read_writer_evidence com a sourceKey do manifesto. As perguntas orientam a cobertura dentro do texto — nunca uma seção de FAQ.";

/* ================================ catálogo puro ================================ */

test("catálogo · radar.blueprint/<id> é chave do Radar, exige id, e fica ABAIXO da evidência (planta de IA aprovada)", () => {
  const lida = parseWriterEvidenceSourceKey(`radar.blueprint/${plantaAprovada}#blueprint.sections.1`);
  assert.equal(lida?.family, "radar.blueprint");
  assert.equal(lida?.ref, plantaAprovada);
  assert.deepEqual(lida?.path, ["blueprint", "sections", "1"]);
  assert.equal(parseWriterEvidenceSourceKey("radar.blueprint"), null, "sem id, fora da gramática");
  assert.equal(parseWriterEvidenceSourceKey("radar.bundle.observed")?.family, "radar.bundle", "o dossiê continua com o prefixo dele");
  assert.equal(writerEvidenceOwnerOf("radar.blueprint"), "radar");
  const nivel = writerEvidenceHierarchyOf({ family: "radar.blueprint", serpAuthoritative: true });
  assert.equal(nivel.level, "AI_INTERPRETATION");
  assert.match(nivel.note ?? "", /aprovada pelo dono/);
  assert.match(nivel.note ?? "", /não é evidência/);
  const envelope = writerEvidenceEnvelope({
    sourceKey: `radar.blueprint/${plantaAprovada}`, family: "radar.blueprint", origin: { entityId: null, versionId: null, contentHash: null, collectedAt: null, status: null },
    posteriorAoPacote: true, hierarchy: { level: "CURRENT_SUFFICIENT_SERP", note: null }, etag: "e", page: null,
  });
  assert.equal(envelope.frozen, false, "a planta não é o dossiê congelado");
  assert.notEqual(envelope.hierarchyLevel, "CURRENT_SUFFICIENT_SERP", "nem pedindo, a planta vira SERP vigente");
});

test("catálogo · a projeção da planta resolve o link pelo candidato, corta o texto e aponta onde ler inteiro", () => {
  const bruto = planta("Rotina de skin care noturno em 5 passos");
  const projetada = writerArticleBlueprintFoundation({
    id: plantaAprovada, versionNumber: 3, approvedAt: "2026-10-02T11:00:00+00:00",
    blueprint: { ...bruto.blueprint, promise: "p".repeat(900) }, plan: bruto.measures.plan, linkCandidates: bruto.linkCandidates, brandVoice: bruto.brandVoice,
  })!;
  assert.equal(projetada.readAt, `radar.blueprint/${plantaAprovada}`);
  assert.equal(projetada.h1, "Rotina de skin care noturno em 5 passos");
  assert.equal(projetada.openingQuestion, "Qual a ordem certa dos produtos à noite?");
  assert.equal([...(projetada.promise ?? "")].length, 401, "400 caracteres e a reticência");
  assert.deepEqual(projetada.sections[0].internalLinks, [{ anchor: "rotina de skin care", label: "Rotina de skin care", destination: "/rotina-de-skin-care", status: "PLANNED" }]);
  assert.deepEqual(projetada.sections[1].internalLinks[1], { anchor: "candidato inexistente", label: null, destination: null, status: null }, "candidato fora do pacote não ganha destino inventado");
  assert.equal(projetada.closing?.cta, CTA_DA_PLANTA);
  assert.equal(projetada.closing?.nextStep, "Ler o guia da rotina matinal");
  assert.equal(projetada.plan?.wordsMin, 1200);
  assert.deepEqual(projetada.voiceUsed, { versionId: vozV2, version: 2, name: "Voz Care Glow" });
  assert.equal(JSON.stringify(projetada).includes(PESO_DA_EVIDENCIA), false, "a evidência da planta fica para a fatia");
  assert.equal(writerArticleBlueprintFoundation({ id: "x", versionNumber: 1, approvedAt: null, blueprint: { title: {} }, plan: null, linkCandidates: [], brandVoice: null }), null, "sem seções, fora do contrato");
});

test("catálogo · a voz sai em dois trechos pela régua do Radar: CTA e transição comercial; voz e vocabulário — com o estado dito", () => {
  const voz = writerBrandVoiceFoundation({ versionId: vozV2, versionNumber: 2, name: "Voz Care Glow", lifecycle: "draft", title: "Voz Care Glow", sections: SECOES_DA_VOZ });
  assert.equal(voz.readAt, `brand.skill/${vozV2}`);
  assert.equal(voz.status, "draft");
  assert.equal(voz.statusLabel, "em rascunho", "rascunho vale (spec da Marca §24) e o texto diz");
  assert.ok(voz.cta?.includes(CTA_DA_MARCA), voz.cta ?? "");
  assert.ok(voz.cta?.includes("transição para a oferta"));
  assert.ok(voz.cta?.includes("Falamos com quem tem pele oleosa"), "o leitor e a oferta também servem ao CTA");
  assert.ok((voz.cta ?? "").indexOf("Falamos") > (voz.cta ?? "").indexOf(CTA_DA_MARCA), "o que fala de CTA vem na frente");
  assert.match(voz.voice ?? "", /Nunca use 'milagre'/);
  assert.deepEqual(voz.otherSections, ["Fontes e autoridade", "Imagens"]);
  assert.equal(writerBrandVoiceFoundation({ versionId: vozV2, versionNumber: 2, name: "x", lifecycle: "approved", title: null, sections: [] }).statusLabel, "ativa");
  const longa = writerBrandVoiceFoundation({ versionId: vozV2, versionNumber: 2, name: "x", lifecycle: "proposed", title: null, sections: [{ heading: "CTA", key: "c", body: "c".repeat(5_000) }] });
  assert.ok([...(longa.cta ?? "")].length <= 1_201, "trecho cortado");
  assert.equal(longa.statusLabel, "aguardando aprovação");
});

test("catálogo · fundamentos cortam as seções da planta depois da pesquisa de terceiros e antes do que o pacote protege", () => {
  const fundamentos = {
    fixo: "x".repeat(2_000),
    competitors: Array.from({ length: 2 }, (_, indice) => ({ url: `https://c.test/${indice}` })),
    conflicts: [{ id: "k1" }],
    articleBlueprint: { readAt: "radar.blueprint/abc", sections: Array.from({ length: 40 }, (_, indice) => ({ h2: `Seção ${indice} ${"s".repeat(900)}` })) },
  };
  const ondeLer = { competitors: "a", questions: "b", "video.results": "c", conflicts: "d", limitations: "e", "specialist.items": "f", pendingDecisions: "g" };
  const cabe = fitWriterFoundations(fundamentos, { ...ondeLer, "articleBlueprint.sections": "radar.blueprint/abc" })!;
  assert.ok(writerEvidenceJsonBytes(cabe) <= WRITER_EVIDENCE_LIMITS.foundationsMaxBytes);
  const corte = cabe.trimmed.find(item => item.field === "articleBlueprint.sections")!;
  assert.equal(corte.readAt, "radar.blueprint/abc");
  assert.equal(corte.total, 40);
  assert.deepEqual(cabe.conflicts, [{ id: "k1" }], "o conflito do pacote não paga pela planta");
  assert.equal(cabe.trimmed.some(item => item.field === "conflicts"), false);
  /* Quem chama sem a planta (o contrato de antes) não precisa declarar onde ler. */
  const semPlanta = fitWriterFoundations({ ...fundamentos }, ondeLer)!;
  assert.equal(semPlanta.trimmed.find(item => item.field === "articleBlueprint.sections")?.readAt, "radar.blueprint");
});

/* ================================= fundamentos ================================= */

test("fundamentos · sem planta aprovada e sem voz, nada muda: nenhuma chave nova, o mesmo próximo passo", async () => {
  reiniciar(atual => {
    atual.radar_article_blueprints = atual.radar_article_blueprints.filter(linha => linha.brand_id !== brandA || linha.state !== "APPROVED");
    atual.editorial_artifact_versions = atual.editorial_artifact_versions.filter(linha => linha.marca_id !== brandA);
  });
  const fundamentos = await readWriterFoundations(contexto(), documentId);
  assert.equal("articleBlueprint" in fundamentos, false);
  assert.equal("brandVoice" in fundamentos, false);
  assert.equal(fundamentos.next, PROXIMO_PASSO_DE_SEMPRE);
  assert.equal(fundamentos.absent.some(item => item.field === "articleBlueprint" || item.field === "brandVoice"), false, "a falta simples fica no manifesto");
  assert.doesNotMatch(JSON.stringify(fundamentos), new RegExp(`${PLANTA_DA_OUTRA_MARCA}|${VOZ_DA_OUTRA_MARCA}`));
  conferirLeitura();
});

test("fundamentos · com a planta aprovada do pacote e a voz corrente (rascunho), os dois chegam compactos, ≤ 24 kB, pela Marca", async () => {
  reiniciar();
  const fundamentos = await readWriterFoundations(contexto(), documentId);
  assert.ok(writerEvidenceJsonBytes(fundamentos) <= WRITER_EVIDENCE_LIMITS.foundationsMaxBytes);
  const planta = fundamentos.articleBlueprint!;
  assert.equal(planta.blueprintId, plantaAprovada, "o aprovado do pacote, não o rascunho mais novo nem o de outro congelamento");
  assert.equal(planta.version, 3);
  assert.equal(planta.h1, "Rotina de skin care noturno em 5 passos");
  assert.equal(planta.sections.length, 3);
  assert.equal(planta.closing?.cta, CTA_DA_PLANTA);
  const voz = fundamentos.brandVoice!;
  assert.equal(voz.versionId, vozV2, "a maior versão, mesmo em rascunho, é a corrente");
  assert.equal(voz.statusLabel, "em rascunho");
  assert.ok(voz.cta?.includes(CTA_DA_MARCA));
  assert.match(fundamentos.next, /articleBlueprint/);
  assert.match(fundamentos.next, /brandVoice/);
  assert.match(fundamentos.next, /nunca uma seção de FAQ/);
  assert.doesNotMatch(JSON.stringify(fundamentos), new RegExp(`${PLANTA_DA_OUTRA_MARCA}|${VOZ_DA_OUTRA_MARCA}|Rascunho que ninguém aprovou|${PESO_DA_EVIDENCIA}`));

  conferirLeitura();
  const [doPacote, ...outras] = doArtigoModelo();
  assert.equal(outras.length, 0, "achou o aprovado na primeira consulta");
  for (const [filtro, valor] of [["brand_id", brandA], ["article_id", articleId], ["bundle_hash", BUNDLE], ["state", "APPROVED"]]) {
    assert.equal(doPacote.params.get(filtro), `eq.${valor}`, filtro);
  }
  assert.equal(doPacote.params.get("limit"), "1");
  assert.ok(doPacote.responseBytes < 6_000, `${doPacote.responseBytes} B`);
  const daVoz = registros.find(registro => registro.table === "editorial_artifact_versions" && registro.params.get("entity_id") === `eq.${brandA}:brand_voice`)!;
  assert.ok(daVoz, "a voz é lida pela identidade da Skill na Marca");
  assert.match(daVoz.select ?? "", /s:payload->normalizedContent->sections/);
});

test("fundamentos · aprovado só de OUTRO congelamento: não é servido, e a ausência diz o caminho (aprovar ou reenviar)", async () => {
  reiniciar(atual => { atual.radar_article_blueprints = atual.radar_article_blueprints.filter(linha => linha.id !== plantaAprovada); });
  const fundamentos = await readWriterFoundations(contexto(), documentId);
  assert.equal("articleBlueprint" in fundamentos, false);
  const ausencia = fundamentos.absent.find(item => item.field === "articleBlueprint");
  assert.match(ausencia?.reason ?? "", /outro congelamento/);
  assert.match(ausencia?.reason ?? "", /reenvia/);
  assert.equal(doArtigoModelo().length, 2, "a segunda consulta é só de metadados");
  assert.doesNotMatch(doArtigoModelo()[1].select ?? "", /payload/);
  assert.doesNotMatch(JSON.stringify(fundamentos), /Planta do congelamento antigo/);
});

test("fundamentos · a voz mais nova recusada não devolve a anterior; a Skill de outra Marca nunca aparece", async () => {
  reiniciar(atual => { atual.editorial_version_status_events.push({ id: "ev-3", version_id: vozV2, status: "rejected", occurred_at: "2026-10-02T09:00:00+00:00" }); });
  const fundamentos = await readWriterFoundations(contexto(), documentId);
  assert.equal("brandVoice" in fundamentos, false, "a v1 aprovada não volta a ser a voz");
  const manifesto = await readWriterEvidenceManifest(contexto(), documentId);
  assert.match(new Map(manifesto.absent.map(([chave, , motivo]) => [chave, motivo])).get("brand.voice") ?? "", /nenhuma Skill de voz/);
  assert.equal((await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: `brand.skill/${vozV1}` }))).code, "source_not_in_manifest");
  assert.equal((await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: `brand.skill/${vozDaOutraMarca}` }))).code, "source_not_in_manifest");
  conferirLeitura();
});

test("fundamentos · tabela do artigo-modelo ausente ou voz que falhou: a escrita segue, com a ausência declarada, nunca 500", async () => {
  reiniciar();
  tabelaAusente = "radar_article_blueprints";
  falhaDaVoz = true;
  const fundamentos = await readWriterFoundations(contexto(), documentId);
  assert.equal("articleBlueprint" in fundamentos, false);
  assert.equal("brandVoice" in fundamentos, false);
  assert.match(fundamentos.absent.find(item => item.field === "brandVoice")?.reason ?? "", /falhou/);
  assert.doesNotMatch(JSON.stringify(fundamentos), /canceling statement/, "a mensagem do banco não vaza");
  const manifesto = await readWriterEvidenceManifest(contexto(), documentId);
  assert.match(new Map(manifesto.absent.map(([chave, , motivo]) => [chave, motivo])).get("radar.blueprint") ?? "", /migration 20261002120000_radar_artigo_modelo_e_uso_de_videos pendente/);
  const erro = await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: `radar.blueprint/${plantaAprovada}` }));
  assert.equal(erro.code, "migration_pendente");
});

/* ================================== manifesto ================================== */

test("manifesto · a linha do aprovado (dono Radar, abaixo da evidência, preso ao pacote) e a voz com versão e estado, ≤ 8 kB", async () => {
  reiniciar();
  const manifesto = await readWriterEvidenceManifest(contexto(), documentId);
  assert.ok(writerEvidenceJsonBytes(manifesto) <= WRITER_EVIDENCE_LIMITS.manifestMaxBytes, `${writerEvidenceJsonBytes(manifesto)} B`);
  const linha = manifesto.sources.find(item => item[0] === `radar.blueprint/${plantaAprovada}`)!;
  assert.ok(linha, JSON.stringify(manifesto.sources.map(item => item[0])));
  assert.equal(linha[1], "radar");
  assert.equal(linha[2], "approved");
  assert.equal(manifesto.levels[linha[3] - 1], "AI_INTERPRETATION");
  assert.equal(linha[9], false);
  assert.match(String(linha[10]), /aprovado v3, preso ao pacote entregue/);
  const voz = manifesto.sources.find(item => item[0] === `brand.skill/${vozV2}`)!;
  assert.match(String(voz[10]), /Voz da marca \(Skill brand_voice\) v2, em rascunho na Marca/);
  assert.equal(manifesto.sources.some(item => item[0] === `brand.skill/${vozV1}`), false, "só a corrente");
  assert.equal(manifesto.absent.some(([chave]) => chave === "radar.blueprint" || chave === "brand.voice"), false);
  assert.ok(doArtigoModelo().every(registro => !(registro.select || "").includes("payload")), "o manifesto não lê a planta, só metadados");
  conferirLeitura();
});

test("manifesto · sem aprovado e sem Skill de voz, as duas ausências são declaradas", async () => {
  reiniciar(atual => {
    atual.radar_article_blueprints = atual.radar_article_blueprints.filter(linha => linha.brand_id !== brandA);
    atual.editorial_artifact_versions = atual.editorial_artifact_versions.filter(linha => linha.marca_id !== brandA);
  });
  const manifesto = await readWriterEvidenceManifest(contexto(), documentId);
  const ausentes = new Map(manifesto.absent.map(([chave, , motivo]) => [chave, motivo]));
  assert.match(ausentes.get("radar.blueprint") ?? "", /nenhum artigo-modelo aprovado para este pacote/);
  assert.match(ausentes.get("brand.voice") ?? "", /nenhuma Skill de voz/);
  assert.equal(manifesto.sources.some(item => String(item[0]).startsWith("radar.blueprint/")), false);
});

/* ==================================== fatia ==================================== */

test("fatia · radar.blueprint/<id> serve o aprovado por caminho, paginado; ifNoneMatch não relê; id inventado, rascunho e outro pacote são recusados", async () => {
  reiniciar();
  const chave = `radar.blueprint/${plantaAprovada}`;
  const inteira = await readWriterEvidence(contexto(), documentId, { sourceKey: chave });
  assert.ok(!("notModified" in inteira));
  const envelope = inteira as Exclude<typeof inteira, { notModified: true }>;
  assert.equal(envelope.origin.module, "radar");
  assert.equal(envelope.origin.versionId, plantaAprovada);
  assert.equal(envelope.origin.contentHash, BUNDLE);
  assert.equal(envelope.frozen, false);
  assert.equal(envelope.posteriorAoPacote, false);
  assert.equal(envelope.hierarchyLevel, "AI_INTERPRETATION");
  assert.match(envelope.notice ?? "", /não evidência/);
  assert.equal(envelope.page?.container, "object");
  assert.ok(Object.keys(envelope.data as Linha).includes("blueprint"));

  registros.length = 0;
  const secoes = await readWriterEvidence(contexto(), documentId, { sourceKey: `${chave}#blueprint.sections`, limit: 2 });
  const pagina = secoes as Exclude<typeof secoes, { notModified: true }>;
  assert.equal(pagina.page?.container, "array");
  assert.equal(pagina.page?.total, 3);
  assert.equal(pagina.page?.next, "2");
  const doConteudo = doArtigoModelo().find(registro => (registro.select || "").includes("k_"))!;
  assert.equal(doConteudo.select, "id,bundle_hash,k_blueprint:payload->blueprint", "só a chave de topo pedida");
  assert.equal(doConteudo.params.get("id"), `eq.${plantaAprovada}`);
  assert.equal(doConteudo.params.get("state"), "eq.APPROVED");

  registros.length = 0;
  const igual = await readWriterEvidence(contexto(), documentId, { sourceKey: chave, ifNoneMatch: envelope.etag });
  assert.equal("notModified" in igual && igual.notModified, true);
  assert.equal(doArtigoModelo().some(registro => (registro.select || "").includes("k_")), false, "a aprovada é imutável: o etag responde sem baixar");

  for (const recusada of [`radar.blueprint/${plantaRascunho}`, `radar.blueprint/${plantaDeOutroPacote}`, `radar.blueprint/${plantaDaOutraMarca}`, "radar.blueprint/inventado"]) {
    registros.length = 0;
    assert.equal((await erroDe(readWriterEvidence(contexto(), documentId, { sourceKey: recusada }))).code, "source_not_in_manifest", recusada);
    assert.equal(doArtigoModelo().some(registro => (registro.select || "").includes("k_")), false, `${recusada} não leu conteúdo`);
  }
  conferirLeitura();
});

test("fatia · a voz que os fundamentos apontam (brand.skill/<versionId>) é alcançável e vem pela regra de parse da Marca", async () => {
  reiniciar();
  const fundamentos = await readWriterFoundations(contexto(), documentId);
  const lida = await readWriterEvidence(contexto(), documentId, { sourceKey: fundamentos.brandVoice!.readAt });
  const envelope = lida as Exclude<typeof lida, { notModified: true }>;
  assert.equal(envelope.origin.module, "marca");
  assert.equal(envelope.origin.versionId, vozV2);
  assert.equal(envelope.hierarchyLevel, "ARTICLE_DNA_HYPOTHESIS");
  assert.ok(JSON.stringify(envelope.data).includes("Voz Care Glow"));
});

/* ============================ IA interna do Redator ============================ */

test("IA interna · o pacote da seção leva a seção da planta que casa com o foco, a ordem dos H2, o CTA e a voz; ≤ 24 kB", async () => {
  reiniciar();
  const head = await readWriterEvidenceHead(contexto(), documentId);
  const material = await readWriterSectionMaterial(contexto(), head);
  const pacote = buildWriterSectionEvidencePackage(material, { kind: "section", id: "b1", label: "Hidratação da pele oleosa" })!;
  assert.ok(writerEvidenceJsonBytes(pacote) <= 24_576);
  assert.equal(pacote.articleBlueprint?.section?.h2, "Hidratação para pele oleosa");
  assert.deepEqual(pacote.articleBlueprint?.section?.internalLinks[0], { anchor: "consulta online", label: "Página da marca /consulta-online", destination: "https://careglow.com.br/consulta-online", status: "PUBLISHED" });
  assert.equal(pacote.articleBlueprint?.outline.length, 3);
  assert.equal(pacote.articleBlueprint?.closing?.cta, CTA_DA_PLANTA);
  assert.ok(pacote.brandVoice?.cta?.includes(CTA_DA_MARCA));
  const fontes = new Map(pacote.sources.map(fonte => [fonte.sourceKey, fonte.level]));
  assert.equal(fontes.get(`radar.blueprint/${plantaAprovada}`), "AI_INTERPRETATION");
  assert.equal(fontes.get(`brand.skill/${vozV2}`), "ARTICLE_DNA_HYPOTHESIS");
  assert.ok(writerSectionSourceOf(pacote, `radar.blueprint/${plantaAprovada}#blueprint.sections.1`), "a IA pode citar a planta num alerta");

  const semCasar = buildWriterSectionEvidencePackage(material, { kind: "section", id: "b9", label: "Conclusão" })!;
  assert.equal(semCasar.articleBlueprint?.section, null, "nenhuma palavra em comum: a IA não força a seção de outro H2");

  const doc = ContentDocumentSchema.parse(documentoV2ComDossie(documentId, bundleDoRadar(2_000)));
  const prompt = buildSectionWritingPrompt(createSectionPromptContext(doc, "b1", "", { package: pacote, notice: null }));
  assert.ok(prompt.includes(JSON.stringify(pacote)), "o pacote vai compacto, com a planta e a voz");

  reiniciar(atual => {
    atual.radar_article_blueprints = [];
    atual.editorial_artifact_versions = [];
  });
  const semNada = buildWriterSectionEvidencePackage(await readWriterSectionMaterial(contexto(), head), { kind: "section", id: "b1", label: "Hidratação da pele oleosa" })!;
  assert.equal("articleBlueprint" in semNada, false);
  assert.equal("brandVoice" in semNada, false);
  assert.equal(semNada.sources.some(fonte => fonte.sourceKey.startsWith("radar.blueprint/") || fonte.sourceKey.startsWith("brand.skill/")), false);
});

/*
 * 2026-10-02 · CASAMENTO SEGURO (correção da revisão). Uma palavra em comum
 * entregava a seção errada: os H2 de um artigo dividem o vocabulário do tema
 * ("pele", "noite"), e o prompt manda seguir a seção entregue — pergunta, H3 e
 * o link de outra seção. Agora só o mesmo H2 ou as palavras que distinguem a
 * seção; empate e melhoria de trecho dão `null`.
 */
test("IA interna · a seção da planta só vem com casamento seguro; palavra do tema, empate e melhoria de trecho não casam", async () => {
  reiniciar();
  const head = await readWriterEvidenceHead(contexto(), documentId);
  const material = await readWriterSectionMaterial(contexto(), head);
  const plantaLida = material.articleBlueprint!;
  const secaoPara = (label: string, kind: "section" | "improve" = "section") => writerBlueprintForSection(plantaLida, { kind, id: kind === "section" ? "b1" : null, label }).section?.h2 ?? null;

  assert.equal(secaoPara("Hidratação da pele oleosa"), "Hidratação para pele oleosa", "mesmo H2, com outra preposição");
  assert.equal(secaoPara("Hidratação para pele oleosa"), "Hidratação para pele oleosa");
  assert.equal(secaoPara("Retinol: de noite ou de manhã?"), "Protetor e retinol: o que fica para a manhã", "duas palavras que distinguem a seção");
  assert.equal(secaoPara("Quanto tempo a rotina leva à noite"), null, "'noite' é do tema e 'quanto' só aparece num H3: não é a seção de Limpeza");
  assert.equal(secaoPara("Erros comuns na pele à noite"), null, "'pele' e 'noite' estão na maioria das seções: não distinguem nenhuma");
  assert.equal(secaoPara("Conclusão"), null);
  assert.equal(secaoPara("Hidratação para pele oleosa", "improve"), null, "na melhoria o foco é o trecho, não um H2: nunca há seção da planta");

  const secao = (h2: string) => ({ h2, readerQuestion: null, answerFirst: null, h3: [], internalLinks: [] });
  const empatada = { ...plantaLida, sections: [secao("Limpeza suave"), secao("Hidratação leve"), secao("Protetor diário")] };
  assert.equal(writerBlueprintForSection(empatada, { kind: "section", id: "b1", label: "Limpeza suave e hidratação leve" }).section, null, "empate no topo é ambíguo");
  assert.equal(writerBlueprintForSection(empatada, { kind: "section", id: "b1", label: "Limpeza suave" }).section?.h2, "Limpeza suave");
  const repetida = { ...plantaLida, sections: [secao("Limpeza suave"), secao("Limpeza suave")] };
  assert.equal(writerBlueprintForSection(repetida, { kind: "section", id: "b1", label: "Limpeza suave" }).section, null, "dois H2 iguais: ambíguo");

  const pacote = buildWriterSectionEvidencePackage(material, { kind: "section", id: "b1", label: "Quanto tempo a rotina leva à noite" })!;
  assert.equal(pacote.articleBlueprint?.section, null);
  assert.equal(pacote.articleBlueprint?.outline.length, 3, "sem seção, a IA ainda vê a ordem dos H2");
  const melhoria = buildWriterSectionEvidencePackage(material, { kind: "improve", id: null, label: "Comece com um gel de limpeza suave e água morna à noite." })!;
  assert.equal(melhoria.articleBlueprint?.section, null);
});

/*
 * 2026-10-02 · A REGRA DO PROMPT MUDOU NA REVISÃO: a primeira versão deste
 * teste exigia "targetKind brand_dna" para o conflito com a voz. O registro
 * do alerta (lib/server/writer-evidence-ai.ts) não repassa versionId ao
 * resolvedor, e brand_dna sem versão grava a divergência contra o BrandDNA
 * aprovado — outro artefato. Agora a voz é a FONTE citada, nunca o alvo.
 */
test("IA interna · seção e melhoria seguem a planta e escrevem copy e CTA na voz; conflito com a voz cita a voz como fonte, nunca alvo brand_dna", () => {
  for (const sistema of [SECTION_WRITING_SYSTEM_PROMPT, IMPROVE_SYSTEM_PROMPT]) {
    assert.match(sistema, /evidence\.articleBlueprint/);
    assert.match(sistema, /evidence\.brandVoice/);
    assert.match(sistema, /CTA/);
    assert.match(sistema, /evidenceSourceKey = evidence\.brandVoice\.readAt/);
    assert.match(sistema, /não use targetKind brand_dna para a voz/);
    assert.doesNotMatch(sistema, /brand_dna quando o conflito é com a voz/);
    assert.match(sistema, /vale a evidência/);
    assert.match(sistema, /JSON/, "sem a palavra JSON o provider recusa");
    assert.match(sistema, /Não gerar nem sugerir FAQ/);
  }
  assert.match(SECTION_WRITING_SYSTEM_PROMPT, /articleBlueprint\.section é a seção da planta para ESTE H2/);
  assert.match(SECTION_WRITING_SYSTEM_PROMPT, /Quando section é null/);
  assert.match(SECTION_WRITING_SYSTEM_PROMPT, /não copie pergunta, H3 nem link de outra seção/);
  assert.match(IMPROVE_SYSTEM_PROMPT, /não acrescenta CTA, link, H3, pergunta nem afirmação que o trecho não tinha/);
  assert.doesNotMatch(IMPROVE_SYSTEM_PROMPT, /siga a pergunta do leitor/, "a melhoria não segue seção da planta");

  /* O alerta que a regra pede: a voz como fonte, o alvo no DNA do artigo — nunca o BrandDNA. */
  const alertaDaVoz = WriterAiAlertSchema.parse({ message: "a voz proíbe 'milagre' e a planta usa", targetKind: "article_dna", evidenceSourceKey: `brand.skill/${vozV2}`, versionId: vozV2 });
  assert.equal(typeof alertaDaVoz === "string" ? null : alertaDaVoz.versionId, vozV2, "o schema não descarta mais versionId (ligação no registro: pendência)");
  assert.equal(WriterSectionProviderSchema.parse({ paragraphs: ["p"], alerts: [alertaDaVoz] }).alerts.length, 1);
  const alvos = {
    articleDnaRef: { entityId: articleId, versionId: "artigo-e1-v1", contentHash: null }, siloDnaRef: { entityId: "silo", versionId: "silo-v1", contentHash: null },
    keywordDnaRefs: [], bundle: null,
    brand: { brandDna: { entityId: `brand:${brandA}`, versionId: "dna-v3", contentHash: null }, skills: [{ entityId: `${brandA}:brand_voice`, versionId: vozV2, contentHash: null }] },
  };
  const resolvido = resolveWriterDivergenceTarget(alvos, { kind: "article_dna" });
  assert.equal(resolvido.ok && resolvido.target.versionId, "artigo-e1-v1", "o alvo é o contrato do artigo, não o BrandDNA dna-v3");
});

/* ============================ roteiro e carrossel ============================ */

test("semeadura · roteiro e carrossel recebem a voz (copy e CTA) e o CTA do artigo-modelo, lidos ao vivo pela Marca; sem eles, os fundamentos do painel", async () => {
  reiniciar();
  const { foundations, document } = await writerSeedDocument(brandA, documentId);
  assert.ok(foundations);
  assert.equal(foundations.brandVoice?.versionId, vozV2);
  assert.equal(foundations.articleBlueprint?.blueprintId, plantaAprovada);
  const daPlanta = doArtigoModelo()[0];
  assert.equal(daPlanta.params.get("article_id"), `eq.${articleId}`, "o artigo vem da origem do Radar que a primeira consulta já traz");
  assert.equal(daPlanta.params.get("bundle_hash"), `eq.${BUNDLE}`);
  conferirLeitura();
  assert.equal(registros.filter(registro => registro.table === "content_documents").every(registro => !(registro.select || "").includes("radar_article")), true);

  const fonte = { title: document.title, foundations, finalArticle: null };
  const contexto = seedContextLines(fonte).join("\n");
  assert.match(contexto, /Voz da marca \(copy e CTA\): Skill "Voz Care Glow" v2 \(em rascunho na Marca\)/);
  assert.ok(contexto.includes(CTA_DA_MARCA));
  assert.ok(contexto.includes(`- CTA: ${CTA_DA_PLANTA}`));
  assert.ok(contexto.includes("- Próximo passo: Ler o guia da rotina matinal"));
  for (const prompt of [buildScriptSeedPrompt(fonte), buildCarouselSeedPrompt(fonte)]) assert.ok(prompt.includes(CTA_DA_MARCA));
  for (const sistema of [SCRIPT_SEED_SYSTEM_PROMPT, CAROUSEL_SEED_SYSTEM_PROMPT]) {
    assert.match(sistema, /Voz da marca \(copy e CTA\)/);
    assert.match(sistema, /closingCta/);
  }

  reiniciar(atual => {
    atual.radar_article_blueprints = [];
    atual.editorial_artifact_versions = [];
  });
  const sem = await writerSeedDocument(brandA, documentId);
  const completo = ContentDocumentSchema.parse(documentoV2ComDossie(documentId, bundleDoRadar(2_000)));
  assert.deepEqual(sem.foundations, radarFoundationsOf(completo), "sem voz e sem planta, os mesmos fundamentos do painel");
  const semLinhas = seedContextLines({ title: "T", foundations: sem.foundations!, finalArticle: null }).join("\n");
  assert.doesNotMatch(semLinhas, /Voz da marca|Artigo-modelo aprovado/);
});
