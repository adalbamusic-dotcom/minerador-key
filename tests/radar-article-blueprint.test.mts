import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarApplyArticleBlueprintEdit,
  radarArticleBlueprintColumns,
  radarArticleBlueprintMeasures,
  radarArticleBlueprintPrompt,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintAi,
} from "../lib/radar/article-blueprint.ts";
import { radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import { ARTIGO, EXPORTADO_EM, LEITURA_DAS_LENTES, entradaGoogle, montadasDoSilo, planoDoSilo } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== O ARTIGO-MODELO (SDD diretriz editorial, Adendo A, D5 — 2026-10-02) =====
 *
 * A IA não roda aqui: a resposta dela é fixture. O que se prova é o que o
 * servidor faz com ela — conferir contra o pacote, medir pela SERP, virar CSV.
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

const silo = () => planoDoSilo().files[0].writing!;
const brief = () => buildRadarArticleBlueprintBrief({ entrada: entradaGoogle(), silo: silo(), articleId: ARTIGO, publication: null });

function respostaDaIa(): RadarArticleBlueprintAi {
  const b = brief();
  const pilar = b.linkCandidates.find(item => /pilar/i.test(item.role)) || b.linkCandidates[0];
  const secao = (h2: string, extra: Record<string, unknown> = {}) => ({
    h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta da seção.", h3: ["Um H3"], explain: ["O que explicar"],
    paragraphs: 3, bold: ["termo"], terms: ["termo LSI"], evidence: [b.evidence[0]?.id || "S1", "Z99"],
    specialist: null, video: null, internalLinks: [], externalLinks: [], image: null, practical: null, ...extra,
  });
  return RadarArticleBlueprintAiSchema.parse({
    keywordPlan: { reading: "A principal no H1; a complementar num H2.", principalPlacement: ["H1"], complementary: [], slugNote: null },
    reader: "Quem tem pele oleosa.", promise: "Uma rotina que cabe no dia.", angle: { statement: "Rotina antes de produto.", evidence: ["S1", "Z1"] },
    title: { h1: "Skincare facial: a rotina que funciona para pele oleosa", alternatives: [], seoTitle: "Skincare facial para pele oleosa", metaDescription: "Como montar a rotina." },
    opening: { readerQuestion: "Como montar uma rotina de skincare facial?", direction: "Responder em duas frases.", evidence: [] },
    sections: [
      secao("Limpeza", { internalLinks: [{ candidate: pilar.id, anchor: "cuidados com a pele", reason: "Suporte devolve ao Pilar" }], image: "R1" }),
      secao("Hidratação", { internalLinks: [{ candidate: "K99", anchor: "inventado", reason: "fora do Silo" }], externalLinks: [{ claim: "Protetor diário", sourceType: "órgão de saúde", source: "X99" }] }),
      secao("Proteção solar", { image: "R2" }),
      secao("Perguntas frequentes"),
    ],
    closing: { turn: "Constância vence produto.", specialist: "E99", cta: "Leia o guia do Silo.", nextStep: null },
    visual: [
      { slot: "CAPA", section: null, concept: "rotina", prompt: "pia com toalha", alt: "rotina", caption: "Rotina" },
      { slot: "R1", section: "Limpeza", concept: "limpeza", prompt: "espuma", alt: "limpeza", caption: "Limpeza" },
      { slot: "R2", section: "Proteção solar", concept: "protetor", prompt: "frasco sem marca", alt: "protetor", caption: "Protetor" },
    ],
    eeat: ["Autor real."], warnings: [],
  });
}

test("as medidas do artigo ideal saem das páginas comparáveis, nunca da IA", () => {
  const medidas = radarArticleBlueprintMeasures([
    { words: 1000, h2: 4, h3: 2, paragraphs: 20, images: 2, lists: 1 },
    { words: 3000, h2: 8, h3: 6, paragraphs: 40, images: 4, lists: 3 },
    { words: 2000, h2: 6, h3: 4, paragraphs: 30, images: 3, lists: 2 },
    null,
  ]);
  assert.equal(medidas.comparablePages, 3);
  assert.equal(medidas.words.median, 2000);
  assert.equal(medidas.h2, 6);
  assert.equal(medidas.paragraphs, 30);
});

test("o pedido à IA leva as evidências com id, os destinos do Silo e as regras, sem UUID", () => {
  const b = brief();
  assert.ok(b.evidence.length > 3, "evidências da SERP");
  /* Na fixture o artigo é o Pilar: os destinos são os Suportes e a SiloPage, nunca ele mesmo. */
  assert.ok(b.linkCandidates.some(item => /suporte/i.test(item.role)), "os irmãos do Silo são destinos");
  assert.ok(b.linkCandidates.some(item => item.role === "SiloPage"), "a SiloPage é destino");
  assert.equal(b.linkCandidates.some(item => /pilar/i.test(item.role)), false, "o próprio artigo não é destino");
  const { system, user } = radarArticleBlueprintPrompt(b);
  assert.match(system, /Sem seção de perguntas frequentes/);
  assert.match(system, /só para os candidatos K/);
  assert.match(user, /# Formato da resposta \(JSON\)/);
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(user), false, "nenhum endereço interno vai para a IA");
});

test("o servidor confere a resposta contra o pacote: corrige, avisa e mede", () => {
  const { payload, notes } = radarSanitizeArticleBlueprint(respostaDaIa(), brief());
  const secoes = payload.blueprint.sections;
  assert.deepEqual(secoes.map(item => item.h2), ["Limpeza", "Hidratação", "Proteção solar"], "FAQ sai");
  assert.ok(notes.some(item => /FAQ/.test(item)));
  assert.ok(secoes.every(item => !item.evidence.includes("Z99")), "id inventado sai");
  assert.equal(secoes[1].internalLinks.length, 0, "link para fora do Silo sai");
  assert.equal(secoes[1].externalLinks[0].source, null, "fonte inexistente vira 'fonte a obter'");
  assert.equal(payload.blueprint.closing.specialist, null, "especialista inventado sai");
  assert.equal(payload.measures.plan.sections, 3);
  assert.equal(payload.measures.plan.h3, 3);
  assert.equal(payload.measures.plan.internalLinks, 1);
  assert.equal(payload.measures.plan.respites, 2);
});

test("com menos de três seções válidas, a resposta é recusada", () => {
  const ai = respostaDaIa();
  ai.sections = ai.sections.slice(2);
  assert.throws(() => radarSanitizeArticleBlueprint(ai, brief()), /menos de três seções/);
});

test("a edição do dono vira outra planta, e as medidas acompanham", () => {
  const { payload } = radarSanitizeArticleBlueprint(respostaDaIa(), brief());
  const editado = radarApplyArticleBlueprintEdit(payload, { title: { h1: "Novo H1" }, sections: [{ index: 2, remove: true }, { index: 0, h2: "Limpeza do rosto" }] });
  assert.equal(editado.blueprint.title.h1, "Novo H1");
  assert.deepEqual(editado.blueprint.sections.map(item => item.h2), ["Limpeza do rosto", "Hidratação"]);
  assert.equal(editado.measures.plan.sections, 2);
  assert.equal(payload.blueprint.sections.length, 3, "a versão de antes não muda");
});

test("o artigo-modelo APROVADO vira as colunas de planta do CSV; sem ele, nada muda", () => {
  const { payload } = radarSanitizeArticleBlueprint(respostaDaIa(), brief());
  const colunas = radarArticleBlueprintColumns(payload);
  assert.match(colunas.estrutura, /^ARTIGO-MODELO APROVADO/);
  assert.match(colunas.estrutura, /Medidas do plano: 3 H2 · 3 H3/);
  assert.match(colunas.links_internos, /^Aplique somente estes 1 link/);
  assert.match(colunas.plano_visual, /Capa[\s\S]*Prompt: pia com toalha[\s\S]*ALT: rotina/);
  assert.match(colunas.titulo_e_seo, /^H1: Skincare facial/);

  const plano = planoDoSilo();
  const sem = radarPortableWritingExport({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: plano, today: EXPORTADO_EM });
  const comModelo = montadasDoSilo().map(item => item.articleId === ARTIGO ? { ...item, blueprint: payload } : item);
  const com = radarPortableWritingExport({ articles: comModelo, lenses: LEITURA_DAS_LENTES, plan: plano, today: EXPORTADO_EM });
  assert.notEqual(sem.files![0].csv, com.files![0].csv);
  assert.ok(com.files![0].csv.includes("ARTIGO-MODELO APROVADO"));
  assert.equal(sem.files![0].csv.includes("ARTIGO-MODELO APROVADO"), false);
});

test("a migration: append-only, aprovada imutável, leitura por marca, escrita só no servidor", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261002120000_radar_artigo_modelo_e_uso_de_videos.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.radar_article_blueprints/);
  assert.match(sql, /radar_article_blueprint_approved_is_immutable/);
  assert.match(sql, /USING \(public\.can_access_brand\(brand_id\)\)/);
  assert.match(sql, /GRANT SELECT ON TABLE public\.radar_article_blueprints TO authenticated;/);
  assert.equal(/GRANT[^;]*(INSERT|UPDATE)[^;]*TO authenticated/.test(sql), false);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS usage text/);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
