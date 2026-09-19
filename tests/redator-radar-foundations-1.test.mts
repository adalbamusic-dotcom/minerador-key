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
import { radarEditorialOutputLabel, radarFoundationsOf } from "../lib/redator/radar-foundations.ts";
import { VideoScriptPayloadSchema, CarouselPayloadSchema, newWriterDeliverable } from "../lib/redator/multiformat-contracts.ts";
import { RADAR_WRITER_MAY_NOT } from "../lib/redator/writer-handoff.ts";
import type { ContentDocument } from "../lib/arquiteto/contracts.ts";

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

const documentoV2 = (bundle: unknown = bundleYoutube(), dossierExtra: Record<string, unknown> = {}): ContentDocument => ({
  schemaVersion: 2, id: "doc-yt", title: "skin care noturno", blocks: [], status: "planejado",
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
