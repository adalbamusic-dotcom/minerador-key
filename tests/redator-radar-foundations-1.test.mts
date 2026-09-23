/**
 * ===== REDATOR_DOSSIER_SURFACE_1 · consumir o dossiê já importado do Radar =====
 *
 * COMPORTAMENTAL (A–E) — a projeção `radarFoundationsOf`, sem React e sem banco.
 * ESTRUTURAL (F–K) — lê as telas e os contratos e prova que a fiação é essa:
 * o painel nos três ambientes, a recomendação sem poder de bloqueio, o dossiê
 * fora do entregável.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
/* Leitor de evidências, Fase 1: o catálogo puro roda nesta suíte (test:redator) sem mexer no package.json. */
import "./writer-evidence-catalog.test.mts";
import "./writer-evidence-pacote.test.mts";
import { RADAR_FOUNDATIONS_BUNDLE_PATHS, radarEditorialOutputLabel, radarFoundationsOf, radarFoundationsOfDossier } from "../lib/redator/radar-foundations.ts";
import { VideoScriptPayloadSchema, CarouselPayloadSchema, newWriterDeliverable } from "../lib/redator/multiformat-contracts.ts";
import { RADAR_WRITER_MAY_NOT } from "../lib/redator/writer-handoff.ts";
import { RadarWriterDossierSchema, type ContentDocument } from "../lib/arquiteto/contracts.ts";
import {
  WRITER_GUARDIAN_SELECT, WRITER_SEED_BUNDLE_PATHS_PER_QUERY, WRITER_SEED_BUNDLE_SELECTS, WRITER_SEED_DOCUMENT_SELECT,
  writerGuardianViewFromRow, writerSeedDossierFromRows, writerSeedHeadFromRow,
} from "../lib/redator/writer-document-reads.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const semComentarios = (texto: string) => texto.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

/* ======================= a fixtura: a forma REAL do bundle do artigo de YouTube ======================= */

const sinal = (statement: string, count: number | null = null) => ({ id: `s:${statement.slice(0, 8)}`, statement, grade: "OBSERVED_SERP", evidence: "amostra", count });
const recomendacao = (statement: string) => ({ id: `r:${statement.slice(0, 8)}`, statement, objective: "obj", sourceSignal: "13 de 38 títulos" });

const bundleYoutube = () => ({
  bundleVersion: 3, bundleId: "bundle:a260a09c", bundleHash: "bundle-hash:a260a09c",
  binding: { brandId: "marca-1", articleId: "artigo-yt", articleDnaVersionId: "dna-1", articleDnaContentHash: "sha256:x" },
  observedAt: "2026-09-14T23:49:44.887Z",
  primaryResearchProfile: "YOUTUBE",
  researchSources: ["YOUTUBE_SERP"],
  research: {
    google: null,
    youtube: { role: "PRIMARY", frozenAt: "2026-09-14T23:49:44.887Z", refs: [], counts: { queries: 3, items: 38 }, limitations: ["SHORTS · A SERP não devolveu nenhum vídeo curto para estas consultas."] },
    amazon: null,
  },
  competitiveBlueprint: {
    profile: "YOUTUBE",
    observed: {
      comparableVideos: 38, longForm: 38, shorts: 0,
      titlePatterns: [sinal("Títulos usam o enquadramento \"Rotina\".", 13)],
      recurrentChannels: [sinal("O canal \"Dra. Marina Hayashida\" aparece mais de uma vez.", 14)],
      durationRange: "Entre 416s e 949s na coorte dominante.", viewsRange: null, recency: null,
      crossQuery: [], googleSupport: [], gaps: [sinal("Não há Shorts disputando estas consultas.")],
      sufficiency: "38 vídeo(s) comparáveis sustentam a leitura.",
    },
    recommended: {
      format: "Rotina", durationDirection: "Entre 416s e 949s na coorte dominante.",
      titleDirections: [recomendacao("Mantenha a palavra rotina, mas ponha a promessa específica.")],
      hookDirection: recomendacao("Abra contrariando a promessa que a amostra repete."),
      script: [
        { block: "Gancho", objective: "Capturar a intenção nos primeiros segundos.", direction: "Diga o que o vídeo entrega antes de dizer quem você é.", sourceSignal: "38 concorrentes" },
        { block: "Rotina", objective: "Entregar a sequência.", direction: "Passo a passo, na ordem de aplicação.", sourceSignal: "13 títulos" },
      ],
      tone: "Didático com ritmo.", languageDirection: "Use a formulação da busca.", technicalLevel: "Intermediário", authorityDirection: null, shorts: [], articleApplication: [],
    },
  },
  crossSerp: null,
  editorialOutputs: [{
    output: "ARTICLE",
    objective: "Cobrir a intenção no formato que as duas buscas tratam como principal.",
    reason: "A SERP do YouTube tem 38 long-form e 0 Short(s) disputando a mesma intenção.",
    sourceSignals: ["A SERP tem 6 resultado(s) orgânico(s): texto continua disputando."],
  }],
  observed: null,
  serpStanding: { authoritative: true, current: true, sufficient: true, valid: true, reason: "SERP vigente, suficiente e válida." },
  conflicts: [],
  limitations: ["SHORTS · A SERP não devolveu nenhum vídeo curto para estas consultas.", "Nenhum vídeo foi assistido ou transcrito."],
  video: { summary: { briefs: 6, supported: 5, partial: 0, notFound: 1, extracts: 5, sources: 6 } },
  specialist: null,
});

const HASH = (letra: string) => `sha256:${letra.repeat(64)}`;
const referencia = (entidade: string, letra = "a") => ({ entityId: entidade, versionId: `${entidade}-v1`, contentHash: HASH(letra) });
const vinculosComuns = () => ({
  brandDnaRef: referencia("brand"), keywordDnaRefs: [referencia("kw-1"), referencia("kw-2", "c")],
  siloDnaRef: referencia("silo"), articleDnaRef: referencia("artigo-yt"),
});
const origemRadar = () => ({
  radarItemId: "radar-1", articleId: "artigo-yt", analysisVersionId: "analise-3", analysisVersionNumber: 3,
  evidenceBundleHash: "bundle-hash:a260a09c", articleDnaVersionId: "artigo-yt-v1", articleDnaContentHash: HASH("a"),
  siloDnaVersionId: null, importedAt: "2026-09-19T03:20:09.000Z", importedBy: "ator-1",
});
const vinculosV1 = () => ({ ...vinculosComuns(), contentPlanRef: referencia("plano") });

const documentoV2 = (bundle: unknown = bundleYoutube(), dossierExtra: Record<string, unknown> = {}): ContentDocument => ({
  schemaVersion: 2, id: "doc-yt", title: "skin care noturno", blocks: [], status: "planejado",
  ...vinculosComuns(), radarOrigin: origemRadar(),
  importedContext: {
    source: "radar", capturedAt: "2026-09-19T03:20:09.000Z", pendingDecisions: [],
    dossier: {
      bundleId: "bundle:a260a09c", bundleHash: "bundle-hash:a260a09c", researchProfile: "YOUTUBE",
      keywordContext: { principal: "skin care noturno", secondary: ["rotina noturna"], narrativeReinforcements: ["pele descansada"], resolution: "resolvida" },
      writerMayNot: [...RADAR_WRITER_MAY_NOT], bundle, ...dossierExtra,
    },
  },
} as unknown as ContentDocument);

/* ======================= COMPORTAMENTAL ======================= */

test("A · o dossiê do artigo de YouTube vira fundamentos completos para o roteiro", () => {
  const f = radarFoundationsOf(documentoV2());
  assert.ok(f, "documento com dossiê precisa projetar fundamentos");
  assert.equal(f.profile, "YOUTUBE");
  assert.equal(f.profileLabel, "YouTube");
  assert.equal(f.observedAt, "2026-09-14T23:49:44.887Z");

  /* recomendação editorial + razões */
  assert.equal(f.recommendations.length, 1);
  assert.equal(f.recommendations[0].output, "ARTICLE");
  assert.equal(f.recommendations[0].label, "Artigo");
  assert.match(f.recommendations[0].reason || "", /38 long-form e 0 Short/);
  assert.equal(f.recommendations[0].sourceSignals.length, 1);

  /* pesquisa YouTube: consultas, vídeos observados, long-form × shorts */
  assert.deepEqual(f.research.map(c => [c.source, c.role, c.queries, c.items]), [["youtube", "PRIMARY", 3, 38]]);
  assert.ok(f.youtube);
  assert.equal(f.youtube.comparableVideos, 38);
  assert.equal(f.youtube.longForm, 38);
  assert.equal(f.youtube.shorts, 0);
  assert.equal(f.youtube.durationRange, "Entre 416s e 949s na coorte dominante.");
  assert.deepEqual(f.youtube.recurrentChannels, ["O canal \"Dra. Marina Hayashida\" aparece mais de uma vez."]);
  assert.deepEqual(f.youtube.titlePatterns, ["Títulos usam o enquadramento \"Rotina\"."]);

  /* blueprint multimodal */
  assert.equal(f.youtube.format, "Rotina");
  assert.equal(f.youtube.hookDirection?.statement, "Abra contrariando a promessa que a amostra repete.");
  assert.deepEqual(f.youtube.script.map(p => p.block), ["Gancho", "Rotina"]);
  assert.equal(f.multimodal?.youtubeLongForm, 38);

  /* SERP/evidências disponíveis */
  assert.deepEqual(f.evidence.sources, ["YOUTUBE_SERP"]);
  assert.deepEqual(f.evidence.videoLibrary, { briefs: 6, supported: 5, partial: 0, notFound: 1 });
  assert.equal(f.evidence.specialist, false);

  /* limitações, sem repetição literal */
  assert.equal(f.limitations.length, 2);
  assert.equal(new Set(f.limitations).size, f.limitations.length);

  /* writerMayNot e keyword viajam intactos */
  assert.deepEqual(f.writerMayNot, [...RADAR_WRITER_MAY_NOT]);
  assert.equal(f.keyword.principal, "skin care noturno");
  assert.deepEqual(f.keyword.secondary, ["rotina noturna"]);
});

test("B · sem dossiê não há fundamentos — e nada explode", () => {
  assert.equal(radarFoundationsOf(null), null);
  assert.equal(radarFoundationsOf(undefined), null);
  const v1 = { schemaVersion: 1, id: "doc-v1", title: "antigo", blocks: [], status: "planejado" } as unknown as ContentDocument;
  assert.equal(radarFoundationsOf(v1), null);
  const semDossie = documentoV2();
  (semDossie as { importedContext: { dossier: unknown } }).importedContext.dossier = null;
  assert.equal(radarFoundationsOf(semDossie), null);
});

test("C · bundle parcial ou malformado projeta o que tem, sem lançar", () => {
  const f = radarFoundationsOf(documentoV2({ primaryResearchProfile: "YOUTUBE", research: { youtube: { role: "PRIMARY", counts: "não é objeto" } }, editorialOutputs: "nada", limitations: [1, null, "só esta"] }));
  assert.ok(f);
  assert.equal(f.youtube, null);
  assert.equal(f.multimodal, null);
  assert.deepEqual(f.recommendations, []);
  assert.deepEqual(f.research.map(c => [c.source, c.queries, c.items]), [["youtube", 0, 0]]);
  assert.deepEqual(f.limitations, ["só esta"]);
  assert.equal(f.evidence.videoLibrary, null);
  /* Perfil desconhecido não derruba a projeção: cai no Google, que é o padrão do Radar. */
  const g = radarFoundationsOf(documentoV2({}, { researchProfile: "MARTE" }));
  assert.equal(g?.profile, "GOOGLE");
});

test("D · mustAnswer/mustCover quando existirem: do blueprint, senão do modelo observado do Google", () => {
  const doBlueprint = radarFoundationsOf(documentoV2({
    ...bundleYoutube(),
    competitiveBlueprint: { profile: "GOOGLE", observed: {}, recommended: { mustAnswer: ["Pode usar hidratante à noite?"], mustCover: ["textura leve"] } },
  }));
  assert.deepEqual(doBlueprint?.mustAnswer, ["Pode usar hidratante à noite?"]);
  assert.deepEqual(doBlueprint?.mustCover, ["textura leve"]);

  const doObservado = radarFoundationsOf(documentoV2({
    ...bundleYoutube(),
    competitiveBlueprint: null,
    observed: {
      questions: [{ id: "q1", canonicalQuestion: "Qual a ordem da rotina?" }, { id: "q2", canonicalQuestion: 42 }],
      concepts: { recurrent: [{ id: "c1", canonicalLabel: "ácido salicílico" }] },
      sample: { comparablePages: 12, observedResults: 30 },
    },
  }));
  assert.deepEqual(doObservado?.mustAnswer, ["Qual a ordem da rotina?"]);
  assert.deepEqual(doObservado?.mustCover, ["ácido salicílico"]);
  assert.equal(doObservado?.evidence.observedPages, 12);

  /* Sem nenhum dos dois: listas vazias, e a seção simplesmente não aparece. */
  assert.deepEqual(radarFoundationsOf(documentoV2())?.mustAnswer, []);
  assert.deepEqual(radarFoundationsOf(documentoV2())?.mustCover, []);
});

test("E · o rótulo da saída cobre os enums do multimodal e da Amazon, e não inventa para o resto", () => {
  assert.equal(radarEditorialOutputLabel("ARTICLE"), "Artigo");
  assert.equal(radarEditorialOutputLabel("YOUTUBE_VIDEO"), "Vídeo de YouTube");
  assert.notEqual(radarEditorialOutputLabel("COMPARISON"), "COMPARISON");
  assert.equal(radarEditorialOutputLabel("SAIDA_INEXISTENTE"), "SAIDA_INEXISTENTE");
});

/* ======================= ESTRUTURAL ======================= */

test("F · DOSSIER_VISIBLE_IN_SCRIPT = YES · DOSSIER_VISIBLE_IN_CAROUSEL = YES — o ambiente derivado mostra o painel sem cena aberta", async () => {
  const ambiente = semComentarios(await fonte("../modules/redator/writer-derived-environment.tsx"));
  assert.match(ambiente, /import \{ WriterRadarFoundationsPanel \} from "@\/modules\/redator\/writer-radar-foundations-panel"/);
  /* Roteiro e carrossel são o MESMO componente, discriminado por `kind`: um painel serve aos dois. */
  assert.match(ambiente, /cenaSelecionada\s*\?\s*<WriterMediaAnchorPanel[\s\S]*?:\s*<>[\s\S]*?<WriterRadarFoundationsPanel document=\{document\} compact\/>/,
    "sem cena aberta o painel direito precisa ser o dossiê; com cena aberta, a mídia dela");
  assert.match(ambiente, /document\?: ContentDocument \| null/);
  /* Metadados opcionais continuam recolhidos e secundários. */
  assert.match(ambiente, /useState\(false\)[\s\S]*?setMetadadosAbertos|setMetadadosAbertos\] = useState\(false\)/);
  assert.match(ambiente, /<summary[^>]*>Metadados opcionais<\/summary>/);
});

test("G · DOSSIER_VISIBLE_IN_ARTICLE = YES — o artigo lê a MESMA projeção", async () => {
  const writer = semComentarios(await fonte("../components/editorial/professional-writer.tsx"));
  assert.match(writer, /import \{ WriterRadarFoundationsPanel \} from "@\/modules\/redator\/writer-radar-foundations-panel"/);
  assert.match(writer, /<WriterRadarFoundationsPanel document=\{selected\}\/>/);
  /* E o ambiente derivado recebe o documento de origem — não uma cópia. */
  assert.match(writer, /<WriterDerivedEnvironment[^>]*document=\{selected\}/);
  const painel = semComentarios(await fonte("../modules/redator/writer-radar-foundations-panel.tsx"));
  assert.match(painel, /radarFoundationsOf\(document\)/, "o painel lê a projeção compartilhada, não o bundle cru");
  for (const secao of ["recommendation", "research", "youtube", "blueprint", "evidence", "coverage", "limitations", "writer-may-not"]) {
    assert.ok(painel.includes(`testid="${secao}"`), `seção ${secao} ausente do painel`);
  }
});

test("H · EDITORIAL_OUTPUT_BLOCKS_DERIVED_FORMATS = NO — recomendação é exibida, não decide aba", async () => {
  const writer = semComentarios(await fonte("../components/editorial/professional-writer.tsx"));
  const ambiente = semComentarios(await fonte("../modules/redator/writer-derived-environment.tsx"));
  /* As três abas existem sempre; nenhuma condição sobre a recomendação do Radar. */
  assert.match(writer, /\[\["article", "Artigo"\], \["video_script", "Roteiro e storyboard"\], \["carousel", "Carrossel"\]\]/);
  assert.equal(/editorialOutput|recommendations|radarFoundationsOf/.test(writer), false, "a tela do artigo passou a decidir formato pela recomendação");
  assert.equal(/editorialOutput|recommendations|radarFoundationsOf/.test(ambiente), false, "o ambiente derivado passou a decidir pela recomendação");
  const painel = semComentarios(await fonte("../modules/redator/writer-radar-foundations-panel.tsx"));
  assert.match(painel, /não limita o formato/);
  /* Um documento cuja recomendação é ARTICLE ainda produz roteiro e carrossel. */
  const f = radarFoundationsOf(documentoV2());
  assert.equal(f?.recommendations[0].output, "ARTICLE");
  assert.equal(newWriterDeliverable("video_script", { documentId: "doc-yt", title: "Roteiro", sourceDocumentHash: "h" }).kind, "video_script");
  assert.equal(newWriterDeliverable("carousel", { documentId: "doc-yt", title: "Carrossel", sourceDocumentHash: "h" }).kind, "carousel");
});

test("I · RAW_DOSSIER_DUPLICATED_IN_DELIVERABLE = NO — o entregável continua sendo só o produto derivado", () => {
  const roteiro = newWriterDeliverable("video_script", { documentId: "doc-yt", title: "Roteiro", sourceDocumentHash: "h" });
  for (const chave of ["dossier", "bundle", "foundations", "importedContext"]) assert.equal(chave in roteiro, false, `${chave} vazou para o entregável`);
  assert.deepEqual(Object.keys(roteiro).sort(), ["audience", "channel", "closingCta", "documentId", "durationSeconds", "kind", "notes", "objective", "openingHook", "scenes", "schemaVersion", "sourceDocumentHash", "title"]);
  /* E o contrato recusa o dossiê se alguém tentar gravá-lo. */
  assert.equal(VideoScriptPayloadSchema.safeParse({ ...roteiro, dossier: {} }).success, false);
  const carrossel = newWriterDeliverable("carousel", { documentId: "doc-yt", title: "C", sourceDocumentHash: "h" });
  assert.equal(CarouselPayloadSchema.safeParse({ ...carrossel, bundle: {} }).success, false);
});

test("J · a projeção e o painel não gravam nada no rascunho", async () => {
  const ambiente = semComentarios(await fonte("../modules/redator/writer-derived-environment.tsx"));
  /* O documento entra como prop de leitura; nenhuma escrita no draft menciona o dossiê. */
  const escritas = ambiente.match(/setDraft\([^)]*\)|update\("[^"]+"/g) || [];
  assert.ok(escritas.length > 0);
  for (const escrita of escritas) assert.equal(/dossier|foundations|bundle/i.test(escrita), false, `escrita no rascunho com dossiê: ${escrita}`);
  const painel = semComentarios(await fonte("../modules/redator/writer-radar-foundations-panel.tsx"));
  assert.equal(/fetch\(|setDraft|onChange=|useState\(/.test(painel), false, "o painel é somente leitura");
});

test("K · PROVIDER_CALL_REQUIRED = NO · MIGRATION_REQUIRED = NO · AI = 0", async () => {
  for (const caminho of ["../lib/redator/radar-foundations.ts", "../modules/redator/writer-radar-foundations-panel.tsx"]) {
    const texto = semComentarios(await fonte(caminho));
    assert.equal(/fetch\(|dataforseo|openai|anthropic|supabase|server-only/i.test(texto), false, `${caminho} sai do cliente`);
  }
  /* Nenhum contrato mudou: o dossiê continua no campo que já existia. */
  const contratos = await fonte("../lib/arquiteto/contracts.ts");
  assert.match(contratos, /dossier: RadarWriterDossierSchema\.nullable\(\)\.default\(null\)/);
});

/* ======================= FASE 0 · A SEMEADURA LÊ SÓ O QUE OS FUNDAMENTOS USAM ======================= */

/*
 * docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md §8.
 * A semeadura da IA interna não baixa mais o payload: pede ao PostgREST só os
 * caminhos de RADAR_FOUNDATIONS_BUNDLE_PATHS. Estes testes provam, sem banco,
 * que (1) a lista cobre tudo o que a projeção lê e (2) a projeção montada a
 * partir das consultas estreitas é idêntica à do documento inteiro.
 */

/** O operador de caminho do PostgREST: caminho ausente, ou pai que não é objeto, devolve `null`. */
function simularPostgrest(linha: Record<string, unknown>, select: string): Record<string, unknown> {
  return Object.fromEntries(select.split(",").map(coluna => {
    const [apelido, expressao] = coluna.includes(":") ? coluna.split(":") : [coluna, coluna];
    const [base, ...caminho] = expressao.split("->");
    let valor: unknown = linha[base];
    for (const chave of caminho) valor = valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>)[chave] : undefined;
    return [apelido, valor === undefined ? null : valor];
  }));
}

/** Registra cada caminho lido a partir do dossiê. Índice de array vira `*`. */
function registrarLeituras(valor: unknown, caminho: readonly string[], lidos: Set<string>): unknown {
  if (!valor || typeof valor !== "object") return valor;
  return new Proxy(valor as object, {
    get(alvo, chave, receptor) {
      const resultado = Reflect.get(alvo, chave, receptor);
      if (typeof chave !== "string") return resultado;
      if (Array.isArray(alvo) && (chave === "length" || typeof resultado === "function")) return resultado;
      const proximo = [...caminho, Array.isArray(alvo) && /^\d+$/.test(chave) ? "*" : chave];
      lidos.add(proximo.join("."));
      return registrarLeituras(resultado, proximo, lidos);
    },
  });
}

const CAMPOS_DO_DOSSIE_FORA_DO_BUNDLE = Object.keys(RadarWriterDossierSchema.shape).filter(campo => campo !== "bundle");
const DECLARADOS = RADAR_FOUNDATIONS_BUNDLE_PATHS.map(caminho => ["bundle", ...caminho].join("."));

/** Uma leitura está coberta se cai dentro de um caminho declarado, ou é um nó no caminho até ele. */
function naoCobertos(lidos: Iterable<string>): string[] {
  return [...lidos].filter(lido => {
    const [raiz] = lido.split(".");
    if (raiz !== "bundle") return !CAMPOS_DO_DOSSIE_FORA_DO_BUNDLE.includes(raiz);
    return !DECLARADOS.some(declarado => lido === declarado || lido.startsWith(`${declarado}.`) || declarado.startsWith(`${lido}.`));
  });
}

const bundleCompleto = () => ({
  ...bundleYoutube(),
  crossSerp: { signals: [{ signal: "vídeo na SERP", count: 3 }, { signal: "", count: 1 }], sources: ["WEB_SERP", 7] },
  observed: {
    questions: [{ id: "q1", canonicalQuestion: "Qual a ordem da rotina?" }, "não é objeto"],
    concepts: { recurrent: [{ id: "c1", canonicalLabel: "ácido salicílico" }], emerging: [{ id: "c2", canonicalLabel: "não lido" }] },
    sample: { observedResults: 30 },
    externalLinks: [{ url: "https://fonte.test/1" }],
  },
  specialist: { decision: "incorporada" },
  evidence: { semantic: { corpo: "não lido" } },
});

const variantesDeBundle = (): Array<[string, unknown]> => [
  ["YouTube real", bundleYoutube()],
  ["tudo preenchido", bundleCompleto()],
  ["blueprint Google com observado", { ...bundleYoutube(), competitiveBlueprint: { profile: "GOOGLE", observed: {}, recommended: { mustAnswer: ["Pode usar hidratante à noite?"], mustCover: ["textura leve"] } }, observed: { questions: [{ canonicalQuestion: "Por quê?" }], concepts: { recurrent: [{ canonicalLabel: "retinol" }] }, sample: { comparablePages: 12 } } }],
  ["malformado", { primaryResearchProfile: "YOUTUBE", research: { youtube: { role: "PRIMARY", counts: "não é objeto" } }, editorialOutputs: "nada", limitations: [1, null, "só esta"] }],
  ["pais que não são objeto", { ...bundleYoutube(), observed: [1, 2], video: "texto", competitiveBlueprint: ["lista"], serpStanding: 42, research: null }],
  ["bundle vazio", {}],
  ["bundle que é lista", [1, 2, 3]],
];

function radarWriterDossierDe(documento: ContentDocument): Record<string, unknown> {
  return (documento as unknown as { importedContext: { dossier: Record<string, unknown> } }).importedContext.dossier;
}

test("L · a lista de caminhos cobre tudo o que os fundamentos leem, em todas as formas de bundle", () => {
  for (const [nome, bundle] of variantesDeBundle()) {
    const dossie = radarWriterDossierDe(documentoV2(bundle));
    const lidos = new Set<string>();
    radarFoundationsOfDossier(registrarLeituras(dossie, [], lidos));
    assert.ok(lidos.size > 0, `${nome}: nada foi lido — o Proxy não está no caminho`);
    assert.deepEqual(naoCobertos(lidos), [], `${nome}: leitura fora de RADAR_FOUNDATIONS_BUNDLE_PATHS`);
  }
  /* Com o dossiê válido, as reservas do bundle nunca são lidas: por isso ficam fora da lista. */
  const lidos = new Set<string>();
  radarFoundationsOfDossier(registrarLeituras(radarWriterDossierDe(documentoV2(bundleCompleto())), [], lidos));
  for (const reserva of ["bundle.bundleId", "bundle.bundleHash", "bundle.primaryResearchProfile"]) assert.equal(lidos.has(reserva), false, reserva);
  assert.ok(lidos.has("bundle.observed.concepts.recurrent.*.canonicalLabel"), "o Proxy enxerga dentro das listas");
});

test("L2 · o verificador de cobertura reprova leitura nova — a prova L não é vazia", () => {
  assert.deepEqual(naoCobertos(["bundle.evidence.semantic", "bundle.observed.externalLinks.*.url", "binding"]),
    ["bundle.evidence.semantic", "bundle.observed.externalLinks.*.url", "binding"]);
  assert.deepEqual(naoCobertos(["bundle", "bundle.observed", "bundle.observed.concepts", "bundle.observed.concepts.recurrent.*.canonicalLabel", "keywordContext.principal"]), []);
});

function fundamentosPelasConsultasEstreitas(documento: ContentDocument) {
  const linha = { id: "doc", marca_id: "marca-1", content_hash: "sha256:doc", payload: JSON.parse(JSON.stringify(documento)) };
  const cabeca = writerSeedHeadFromRow(simularPostgrest(linha, WRITER_SEED_DOCUMENT_SELECT));
  assert.ok(cabeca, "o cabeçalho precisa passar no contrato");
  if (!cabeca.dossier) return { cabeca, fundamentos: null };
  const dossie = writerSeedDossierFromRows(cabeca.dossier, WRITER_SEED_BUNDLE_SELECTS.map(select => simularPostgrest(linha, select)));
  assert.ok(dossie, "as fatias são do mesmo pacote");
  return { cabeca, fundamentos: radarFoundationsOfDossier(dossie) };
}

test("M · paridade: as consultas estreitas produzem os MESMOS fundamentos que o documento inteiro", () => {
  for (const [nome, bundle] of variantesDeBundle()) {
    const documento = documentoV2(bundle);
    const { fundamentos } = fundamentosPelasConsultasEstreitas(documento);
    assert.deepEqual(fundamentos, radarFoundationsOf(JSON.parse(JSON.stringify(documento))), nome);
  }
  /* O que a rota usa do documento vem junto, e igual. */
  const { cabeca } = fundamentosPelasConsultasEstreitas(documentoV2());
  assert.deepEqual(cabeca.document, { id: "doc-yt", schemaVersion: 2, title: "skin care noturno", status: "planejado", blocks: [] });
  assert.equal(cabeca.contentHash, "sha256:doc");
});

test("M2 · sem dossiê, v1 ou dossiê fora do contrato: o mesmo desfecho da leitura inteira", () => {
  const semDossie = documentoV2();
  (semDossie as { importedContext: { dossier: unknown } }).importedContext.dossier = null;
  assert.equal(fundamentosPelasConsultasEstreitas(semDossie).cabeca.dossier, null);

  const v1 = { schemaVersion: 1, id: "doc-v1", title: "antigo", blocks: [], status: "planejado", ...vinculosV1() };
  const cabecaV1 = writerSeedHeadFromRow(simularPostgrest({ content_hash: "h", payload: v1 }, WRITER_SEED_DOCUMENT_SELECT));
  assert.equal(cabecaV1?.dossier, null);
  assert.equal(cabecaV1?.document.schemaVersion, 1);

  /* Perfil fora do enum: a leitura inteira recusava pelo schema; a estreita também. */
  const marte = documentoV2({}, { researchProfile: "MARTE" });
  assert.equal(writerSeedHeadFromRow(simularPostgrest({ content_hash: "h", payload: marte }, WRITER_SEED_DOCUMENT_SELECT)), null);
  /* Status fora do contrato também. */
  const status = { ...documentoV2(), status: "publicado" };
  assert.equal(writerSeedHeadFromRow(simularPostgrest({ content_hash: "h", payload: status }, WRITER_SEED_DOCUMENT_SELECT)), null);
  /* Fatia de outro pacote não é juntada, nem fatia faltando. */
  const linha = { content_hash: "h", payload: documentoV2(bundleCompleto()) };
  const cabeca = writerSeedHeadFromRow(simularPostgrest(linha, WRITER_SEED_DOCUMENT_SELECT));
  assert.ok(cabeca?.dossier);
  const fatias = WRITER_SEED_BUNDLE_SELECTS.map(select => simularPostgrest(linha, select));
  const trocada = [...fatias.slice(0, -1), { ...fatias[fatias.length - 1], x_bundleHash: "bundle-hash:outro" }];
  assert.equal(writerSeedDossierFromRows(cabeca.dossier, trocada), null);
  assert.equal(writerSeedDossierFromRows(cabeca.dossier, fatias.slice(1)), null, "fatia faltando não vira bundle parcial");
  assert.ok(writerSeedDossierFromRows(cabeca.dossier, fatias), "as fatias certas montam o dossiê");
});

test("M3 · vínculo com DNA ou origem fora do contrato é incompatível, como na leitura inteira", () => {
  const cabecaDe = (payload: unknown) => writerSeedHeadFromRow(simularPostgrest({ content_hash: "h", payload }, WRITER_SEED_DOCUMENT_SELECT));
  const valido = documentoV2() as unknown as Record<string, unknown>;
  assert.ok(cabecaDe(valido)?.dossier, "o documento com vínculos válidos passa");
  const semCampo = (campo: string) => Object.fromEntries(Object.entries(valido).filter(([chave]) => chave !== campo));
  for (const campo of ["brandDnaRef", "keywordDnaRefs", "siloDnaRef", "articleDnaRef", "radarOrigin"]) {
    assert.equal(cabecaDe(semCampo(campo)), null, `v2 sem ${campo}`);
  }
  assert.equal(cabecaDe({ ...valido, keywordDnaRefs: [] }), null, "KeywordDNAs vazios");
  assert.equal(cabecaDe({ ...valido, articleDnaRef: { entityId: "artigo-yt", versionId: "" } }), null, "ArticleDNA sem versão nem hash");
  assert.equal(cabecaDe({ ...valido, brandDnaRef: { ...referencia("brand"), extra: 1 } }), null, "referência com campo a mais");
  assert.equal(cabecaDe({ ...valido, radarOrigin: { ...origemRadar(), analysisVersionNumber: 0 } }), null, "origem Radar fora do contrato");
  assert.equal(cabecaDe({ ...valido, contentPlanRef: referencia("plano") }), null, "v2 com plano");

  const v1 = { schemaVersion: 1, id: "doc-v1", title: "antigo", blocks: [], status: "planejado", ...vinculosV1() };
  assert.equal(cabecaDe(v1)?.document.schemaVersion, 1);
  const v1SemPlano: Record<string, unknown> = { ...v1 };
  delete v1SemPlano.contentPlanRef;
  assert.equal(cabecaDe(v1SemPlano), null, "v1 sem plano");
  assert.equal(cabecaDe({ ...v1, radarOrigin: origemRadar() }), null, "v1 com origem Radar");
  assert.equal(cabecaDe({ ...v1, siloDnaRef: null }), null, "v1 com SiloDNA nulo");
});

test("N · forma das consultas (R16): nada de payload inteiro, bundle só por caminho, fatias pequenas e com identidade", () => {
  const colunas = (select: string) => select.split(",");
  const todas = [WRITER_SEED_DOCUMENT_SELECT, ...WRITER_SEED_BUNDLE_SELECTS, WRITER_GUARDIAN_SELECT];
  for (const select of todas) {
    assert.ok(!colunas(select).includes("payload"), `payload inteiro em ${select}`);
    for (const coluna of colunas(select)) {
      assert.doesNotMatch(coluna, /->(importedContext|dossier|bundle|observed|concepts|video)$/, `objeto grande inteiro: ${coluna}`);
    }
  }
  assert.doesNotMatch(WRITER_SEED_DOCUMENT_SELECT, /->bundle(->|,|$)/, "a primeira consulta não toca o bundle");
  for (const vinculo of ["brandDnaRef", "keywordDnaRefs", "siloDnaRef", "articleDnaRef", "radarOrigin", "contentPlanRef"]) {
    assert.ok(colunas(WRITER_SEED_DOCUMENT_SELECT).includes(`d_${vinculo}:payload->${vinculo}`), `a primeira consulta valida ${vinculo}`);
  }
  for (const select of WRITER_SEED_BUNDLE_SELECTS) {
    const caminhosDoBundle = colunas(select).filter(coluna => coluna.includes("->bundle->"));
    assert.ok(caminhosDoBundle.length >= 1 && caminhosDoBundle.length <= WRITER_SEED_BUNDLE_PATHS_PER_QUERY, select);
    assert.ok(colunas(select).includes("x_bundleHash:payload->importedContext->dossier->bundleHash"), "toda fatia confere o pacote");
  }
  assert.equal(WRITER_SEED_BUNDLE_PATHS_PER_QUERY, 5);
  /* Todo caminho declarado é pedido exatamente uma vez. */
  const pedidos = WRITER_SEED_BUNDLE_SELECTS.flatMap(select => colunas(select).filter(coluna => coluna.includes("->bundle->")))
    .map(coluna => coluna.split("->bundle->")[1].split("->").join("."));
  assert.deepEqual([...pedidos].sort(), RADAR_FOUNDATIONS_BUNDLE_PATHS.map(caminho => caminho.join(".")).sort());
  /* Nenhuma das seções pesadas do bundle entra. */
  for (const pesada of ["evidence", "internalLinks", "externalSources", "aiDiscovery", "observed.externalLinks", "observed.concepts", "video", "video.sources"]) {
    assert.ok(!pedidos.includes(pesada), pesada);
  }
});

test("N2 · Guardião: a visão estreita valida pelo schema do documento e cai no padrão como o documento inteiro", () => {
  const blocos = [{ id: "h1", type: "heading", level: 1, text: "Título", provenance: { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] } }];
  const visao = writerGuardianViewFromRow({ id: "doc", marca_id: "m", content_hash: "h", g_id: "doc", g_blocks: blocos, g_metadata: null });
  assert.equal(visao.id, "doc");
  assert.deepEqual(visao.blocks, blocos);
  assert.equal(visao.metadata.indexationStatus, "noindex", "metadados ausentes caem no padrão do schema");
  assert.throws(() => writerGuardianViewFromRow({ g_id: "doc", g_blocks: [{ id: "x", type: "inexistente" }], g_metadata: null }));
  assert.throws(() => writerGuardianViewFromRow({ g_id: null, g_blocks: [], g_metadata: null }));
});

test("O · ESTRUTURAL · a semeadura lê pelo módulo estreito, por Marca, em série — e a rota usa os fundamentos que vêm dela", async () => {
  const leitor = semComentarios(await fonte("../lib/server/writer-seed.ts"));
  assert.match(leitor, /\.select\(select\)\.eq\("id", documentId\)\.eq\("marca_id", brandId\)\.maybeSingle\(\)/);
  assert.equal(leitor.split(".select(").length - 1, 1, "uma porta de leitura só");
  assert.match(leitor, /await ler\(WRITER_SEED_DOCUMENT_SELECT\)/);
  assert.match(leitor, /for \(const select of WRITER_SEED_BUNDLE_SELECTS\) linhas\.push\(await ler\(select\)\)/);
  assert.doesNotMatch(leitor, /Promise\.all|"[^"]*\bpayload\b[^"]*"/);
  assert.match(leitor, /radarFoundationsOfDossier\(dossier\)/);

  const rota = semComentarios(await fonte("../app/api/redator/seed/route.ts"));
  assert.match(rota, /const \{ document, foundations, contentHash \} = await writerSeedDocument\(input\.brandId, input\.documentId\)/);
  assert.doesNotMatch(rota, /radarFoundationsOf\(|from "@\/lib\/redator\/radar-foundations"/);
});
