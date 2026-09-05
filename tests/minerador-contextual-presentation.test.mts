import assert from "node:assert/strict";
import test from "node:test";
import type { BrandDNA, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import {
  CONTEXTUAL_PRESENTATION_SYSTEM_PROMPT,
  buildContextualPresentationPrompt,
  buildKeywordDnaPresentationContext,
  parseContextualPresentation,
} from "../lib/minerador/presentation-brief.ts";
import { buildBrandAIContextForPresentation } from "../lib/marca/brand-ai-context.ts";
import { getBrandContextPack } from "../lib/marca/brand-context-pack.ts";
import { importBrandSkill } from "../lib/marca/brand-skill-domain.ts";
import { careGlowSkillFile } from "./care-glow-skill.fixture.ts";

const brandId = "11111111-1111-4111-8111-111111111111";
const keywordId = "22222222-2222-4222-8222-222222222222";

async function activeVoiceSkill(inputBrandId = brandId) {
  return {
    ...(await importBrandSkill({
      brandId: inputBrandId,
      definitionKey: "brand_voice",
      name: "Voz Care Glow",
      filename: careGlowSkillFile.filename,
      markdown: careGlowSkillFile.content,
      byteSize: careGlowSkillFile.byteSize,
      mimeType: careGlowSkillFile.mimeType,
      importedBy: "actor",
      now: "2026-08-28T12:00:00.000Z",
    })),
    status: "active" as const,
    versionId: "33333333-3333-4333-8333-333333333333",
  };
}

function approvedBrandDna(inputBrandId = brandId): VersionEnvelope<BrandDNA> {
  return {
    versionId: "44444444-4444-4444-8444-444444444444",
    entityId: "brand:" + inputBrandId,
    versionNumber: 1,
    previousVersionId: null,
    contentHash: "legacy:brand-dna-v1",
    origin: "human",
    changeReason: "fixture",
    createdAt: "2026-08-28T12:00:00.000Z",
    createdBy: "actor",
    payload: {
      schemaVersion: 1,
      brandId: inputBrandId,
      positioning: "Cuidado estético responsável e baseado em informação clara.",
      audience: ["Pessoas que pesquisam cuidados estéticos."],
      voice: ["Clara", "prudente", "acolhedora"],
      businessObjectives: ["Orientar uma decisão consciente."],
      differentiators: ["Explicação responsável."],
      prohibitedClaims: ["Resultado garantido."],
      editorialPrinciples: ["Não prometer além das evidências."],
    },
  };
}

function keyword(overrides: Record<string, unknown> = {}) {
  const semantic: Record<string, unknown> = {
    intencao_principal: "informational",
    funnel: "TOFU",
    nicho: "cuidados estéticos",
    entidade_central: "cuidados com a pele",
    modificadores: ["em casa", "com segurança"],
    publico: "pessoas interessadas em cuidados estéticos",
    problema_percebido: "dúvida sobre como começar",
    resultado_desejado: "entender opções com segurança",
    nivel_consciencia: "consciente do problema",
    etapa_jornada: "descoberta",
    tipo_editorial: "guide",
    objecoes: ["medo de promessas exageradas"],
  };
  semantic.logical_output_contract = buildLogicalOutputContract({
    semantic,
    intent: "informational",
    funnel: "TOFU",
  });
  return {
    id: keywordId,
    brand_id: brandId,
    keyword: "como cuidar da pele com segurança",
    location: "Brasil",
    intent: "informational",
    volume_search: 1200,
    results_allintitle: 24,
    kgr_score: 0.02,
    analise_semantica: semantic,
    ...overrides,
  };
}

function presentationPrompt(input = keyword(), withSkill = true) {
  const pack = getBrandContextPack({
    brandId,
    module: "minerador",
    purpose: "keyword-contextual-presentation",
    approvedBrandDna: approvedBrandDna(),
    skills: withSkill ? [activeVoiceSkillFixture] : [],
  });
  const brandContext = buildBrandAIContextForPresentation(pack);
  const keywordDna = buildKeywordDnaPresentationContext(input);
  return { prompt: buildContextualPresentationPrompt({ keywordDna, brandContext }), keywordDna, brandContext };
}

let activeVoiceSkillFixture: Awaited<ReturnType<typeof activeVoiceSkill>>;

test.before(async () => {
  activeVoiceSkillFixture = await activeVoiceSkill();
});

test("A · apresentação usa o tema e o contexto editorial, sem dado operacional de SEO", () => {
  const { prompt } = presentationPrompt();
  assert.match(prompt, /como cuidar da pele com segurança/);
  assert.match(prompt, /Audiência registrada: pessoas interessadas em cuidados estéticos/);
  assert.match(prompt, /Problema percebido registrado: dúvida sobre como começar/);
  // Volume, Resultados, KGR, KD, Intenção, Funil e SERP pertencem a outros
  // contratos do Processador e não entram nos fatos enviados nesta camada.
  const facts = prompt.slice(prompt.indexOf("## TEMA E CONTEXTO EDITORIAL"), prompt.indexOf("## CONTEXTO DISPONÍVEL DA MARCA"));
  for (const forbidden of [/Volume/, /Resultados/, /KGR/, /Intenção/, /Funil/, /SERP/, /Nicho/]) {
    assert.doesNotMatch(facts, forbidden);
  }
  assert.doesNotMatch(prompt, /idade específica|renda específica|taxa de conversão/i);
});

test("B · campo editorial ausente vira não informado, sem invenção", () => {
  const input = keyword({ analise_semantica: { nicho: "cuidados estéticos" } });
  const { prompt } = presentationPrompt(input, false);
  assert.match(prompt, /Audiência registrada: não informado/);
  assert.match(prompt, /Problema percebido registrado: não informado/);
  assert.match(prompt, /Quando um dado estiver não informado/);
});

test("C · a leitura canônica de Intenção continua no read-model, fora do prompt", () => {
  const { keywordDna, prompt } = presentationPrompt();
  assert.equal(keywordDna.canonical.intent, "informational");
  assert.equal(keywordDna.canonical.intentState, "resolved");
  assert.doesNotMatch(prompt, /Intenção/);
});

test("D · a leitura canônica de Funil continua no read-model, fora do prompt", () => {
  const { keywordDna, prompt } = presentationPrompt();
  assert.equal(keywordDna.canonical.funnel, "TOFU");
  assert.equal(keywordDna.canonical.funnelState, "resolved");
  assert.doesNotMatch(prompt, /Funil/);
});

test("E · intenção/funil inconclusivos continuam desconhecidos e fora do prompt", () => {
  const semantic: Record<string, unknown> = {
    intencao_principal: "ambígua",
    funnel: "ambíguo",
  };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic });
  const { keywordDna, prompt } = presentationPrompt(keyword({
    intent: null,
    analise_semantica: semantic,
  }), false);
  assert.equal(keywordDna.canonical.intent, null);
  assert.equal(keywordDna.canonical.funnel, null);
  assert.doesNotMatch(prompt, /Intenção canônica/);
  assert.doesNotMatch(prompt, /Funil canônico/);
  assert.match(CONTEXTUAL_PRESENTATION_SYSTEM_PROMPT, /não classifique intenção de busca, funil, nicho ou SERP/);
});

test("F · Skill corrente da própria Marca entra no contexto e gera appliedSkillRefs", () => {
  const { brandContext } = presentationPrompt();
  assert.equal(brandContext.appliedSkillRefs.length, 1);
  assert.equal(brandContext.appliedSkillRefs[0]?.definitionKey, "brand_voice");
  assert.match(brandContext.brandContext, /BRAND SKILL/);
  assert.match(brandContext.brandContext, /Care Glow/);
  assert.match(brandContext.brandContext, /tom/i);
});

test("G · rascunho corrente entra no contexto do Minerador com lifecycle preservado", async () => {
  const draft = { ...(await activeVoiceSkill()), status: "draft" as const };
  const pack = getBrandContextPack({
    brandId,
    module: "minerador",
    purpose: "keyword-contextual-presentation",
    skills: [draft],
  });
  assert.equal(pack.skills.length, 1);
  assert.equal(pack.skills[0]?.lifecycleStatus, "draft");
  assert.equal(pack.skills[0]?.applied, false);
});

test("H · Brand A nunca recebe Skill da Brand B", async () => {
  const foreign = await activeVoiceSkill("55555555-5555-4555-8555-555555555555");
  const pack = getBrandContextPack({
    brandId,
    module: "minerador",
    purpose: "keyword-contextual-presentation",
    skills: [foreign],
  });
  assert.deepEqual(pack.skills, []);
});

test("I · resolução continua baseada em definitionKey, não no nome", async () => {
  const renamed = { ...(await activeVoiceSkill()), name: "Tom editorial revisado" };
  const pack = getBrandContextPack({
    brandId,
    module: "minerador",
    purpose: "keyword-contextual-presentation",
    skills: [renamed],
  });
  assert.equal(pack.skills[0]?.definitionKey, "brand_voice");
  assert.equal(pack.skills[0]?.name, "Tom editorial revisado");
});

test("J · gerar a projeção não muta o KeywordDNA atual", () => {
  const input = keyword();
  const before = structuredClone(input);
  buildKeywordDnaPresentationContext(input);
  assert.deepEqual(input, before);
});

test("K · falha de saída da IA não altera o KeywordDNA", () => {
  const input = keyword();
  const before = structuredClone(input);
  assert.throws(() => parseContextualPresentation({ text: "", intent: "transactional" }));
  assert.deepEqual(input, before);
});
