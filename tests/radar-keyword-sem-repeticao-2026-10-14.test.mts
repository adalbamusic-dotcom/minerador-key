import assert from "node:assert/strict";
import test from "node:test";
import {
  RADAR_HUMAN_VOICE_SERP_RULES,
  RADAR_HUMAN_VOICE_SERP_SUMMARY,
  RADAR_KEYWORD_PRECEDENCE,
  RADAR_KEYWORD_RULES_VERSION,
  radarHeadingStartsWithKeyword,
  radarHeadingsSameOpening,
  radarHumanVoiceCatalogNote,
  radarHumanVoicePromptBlock,
  radarHumanVoiceRedatorRule,
  radarHumanVoiceVideoRule,
  radarKeywordBodyCap,
  radarKeywordCrudeDiffersFromNatural,
  radarKeywordCrudeFormPresent,
  radarKeywordNaturalPresent,
  radarKeywordOccurrences,
  radarKeywordWithinChars,
  radarTitleOptionsDistinct,
  radarTitleOptionsOpenedByKeyword,
  radarTitleProcessMark,
  radarTitleWithoutProcessMarks,
} from "../lib/radar/human-voice-guideline.ts";
import { radarArticleBlueprintReading } from "../lib/radar/article-blueprint.ts";
import { WRITER_BLUEPRINT_READING_RULES } from "../lib/redator/writer-blueprint-for-writing.ts";
import { plantaDoCasoReal } from "./fixtures/silo-interligado-caso-real-2026-10-14.mts";

/*
 * ===== 2026-10-14 · F1 · AS RÉGUAS V1–V7 (SDD silo interligado, §7.3) =====
 *
 * Casos bons e ruins, com os H2 reais das plantas do Silo piloto (§4.2 da SDD)
 * como fixture. Puras: sem rede, sem IA, sem banco.
 */

test("K1 · a forma natural casa com a crua pelas mesmas palavras de conteúdo, na mesma ordem; a crua é a sequência colada", () => {
  const crua = "captação de pacientes dentista";
  assert.equal(radarKeywordOccurrences("Captação de pacientes para dentista sem anúncio", crua), 1);
  assert.equal(radarKeywordOccurrences("Captação de pacientes dentista: captação de pacientes para dentista", crua), 2);
  assert.equal(radarKeywordOccurrences("Dentista: a captação de pacientes", crua), 0, "a ordem conta");
  assert.ok(radarKeywordNaturalPresent("Como atrair clientes sem anúncio", "como atrair um cliente"), "plural simples e funcionais");
  assert.ok(radarKeywordCrudeFormPresent("Captação de pacientes dentista sem anúncios", crua));
  assert.equal(radarKeywordCrudeFormPresent("Captação de pacientes para dentista", crua), false);
  assert.ok(radarKeywordCrudeDiffersFromNatural(crua, "captação de pacientes para dentista"));
  assert.equal(radarKeywordCrudeDiffersFromNatural("como atrair um cliente", "como atrair um cliente"), false, "a principal já gramatical");
  assert.equal(radarKeywordCrudeDiffersFromNatural(crua, null), false, "sem a natural, nada se afirma");
});

test("V1 · nenhum H2 começa pela principal nem por uma complementar (os H2 reais da §4.2)", () => {
  const ruins: Array<[string, string]> = [
    ["Leads qualificados o que é: o que muda na agenda", "leads qualificados"],
    ["Gerar leads qualificados: por onde começar", "gerar leads qualificados"],
    ["Como atrair um cliente", "como atrair um cliente"],
    ["Como conseguir mais clientes com canais e presença?", "como conseguir mais clientes"],
    ["Promoções estética que funcionam sem queimar a margem", "promoções estética"],
    ["Tráfego orgânico como fazer para captar pacientes no dia a dia", "tráfego orgânico como fazer"],
  ];
  for (const [h2, keyword] of ruins) assert.ok(radarHeadingStartsWithKeyword(h2, keyword), `${h2} abre por ${keyword}`);
  const bons: Array<[string, string]> = [
    ["Por que a agenda sobe com o anúncio e cai quando ele para", "captação de pacientes dentista"],
    ["Por que investir em tráfego orgânico e não só em anúncio", "tráfego orgânico como fazer"],
    ["O que o paciente da sua região vê quando procura um dentista", "captação de pacientes dentista"],
  ];
  for (const [h2, keyword] of bons) assert.equal(radarHeadingStartsWithKeyword(h2, keyword), false, h2);
});

test("V2 e K6 · a principal em no máximo 1 H2; dois H2 não começam pelas mesmas 2 palavras de conteúdo", () => {
  const h2s = ["Como atrair clientes no dia a dia", "Como atrair clientes pelo Instagram", "O que considerar antes"];
  assert.deepEqual(radarHeadingsSameOpening(h2s), [[0, 1]]);
  assert.equal(h2s.filter(h2 => radarKeywordOccurrences(h2, "como atrair um cliente") > 0).length, 2);
});

test("V3 · a principal natural exatamente 1 vez no H1 e no SEO title, dentro dos primeiros 60", () => {
  const principal = "captação de pacientes dentista";
  assert.equal(radarKeywordOccurrences("A agenda sobe com o anúncio e cai quando ele para? Captação de pacientes para dentista com estrutura própria", principal), 1);
  assert.ok(radarKeywordWithinChars("Captação de pacientes para dentista sem depender de anúncio", principal));
  assert.equal(radarKeywordWithinChars("O que verificar no site, no perfil e nas páginas antes: captação de pacientes para dentista", principal), false);
});

test("V4 · marca de processo em título e meta: a removível sai na leitura; a solta é apontada", () => {
  assert.equal(radarTitleWithoutProcessMarks("Captação de pacientes dentista: o que o orgânico entrega (precisa de fonte: afirmação sobre plataforma)"), "Captação de pacientes dentista: o que o orgânico entrega");
  assert.equal(radarTitleWithoutProcessMarks("O que muda no orgânico (precisa de fonte: oficial)."), "O que muda no orgânico.");
  assert.equal(radarTitleWithoutProcessMarks("Título [completar com o gancho] TODO"), "Título");
  const limpo = "Captação de pacientes para dentista sem anúncio";
  assert.equal(radarTitleWithoutProcessMarks(limpo), limpo);
  assert.equal(radarTitleProcessMark("Ver L1 antes"), "número de link (L1…)");
  assert.equal(radarTitleProcessMark("Conta pendente"), "pendente");
  assert.equal(radarTitleProcessMark(limpo), null);
});

test("V4 na leitura da planta gravada · a marca sai sem mudar o payload; o título limpo passa igual (o mesmo objeto)", () => {
  const planta = plantaDoCasoReal();
  const marcada = { ...planta.blueprint, title: { ...planta.blueprint.title, h1: `${planta.blueprint.title.h1} (precisa de fonte: afirmação sobre plataforma)` } };
  const antes = JSON.stringify(marcada);
  const lida = radarArticleBlueprintReading(marcada);
  assert.equal(lida.blueprint.title.h1, planta.blueprint.title.h1);
  assert.equal(JSON.stringify(marcada), antes);
  const limpa = radarArticleBlueprintReading(planta.blueprint);
  assert.equal(limpa.blueprint.title, planta.blueprint.title, "sem marca, a leitura devolve o mesmo título");
});

test("V6 · a principal abre no máximo 1 das 3 opções; as 3 com ângulos distintos (começo e Jaccard)", () => {
  const principal = "como atrair um cliente";
  const iguais = ["Como atrair um cliente: o caminho prático", "Como atrair um cliente: guia para clínicas", "Como atrair um cliente: estratégias para conquistar"];
  assert.equal(radarTitleOptionsOpenedByKeyword(iguais, principal), 3, "K2: a principal abre as 3");
  /* K3 · o mesmo começo de 3 palavras de conteúdo, ou o mesmo assunto com outras palavras de ordem (Jaccard ≥ 0,5). */
  const mesmoComeco = radarTitleOptionsDistinct(["Agenda cheia sem anúncio: o caminho", "Agenda cheia sem anúncio? Veja por onde começar", "O diagnóstico antes da campanha"], principal);
  assert.deepEqual(mesmoComeco.sameOpening, [[0, 1]]);
  const mesmoAssunto = radarTitleOptionsDistinct(["Site, perfil e perguntas: o que atrai cliente", "Perguntas, perfil e site que atraem cliente", "Antes da próxima campanha"], principal);
  assert.deepEqual(mesmoAssunto.similar, [[0, 1]]);
  assert.equal(mesmoAssunto.distinct, false);
  const distintas = [
    "O feed não traz ninguém? Como atrair um cliente com o que você já sabe",
    "Menos post, mais busca: atrair cliente que procura você no Google",
    "Antes da próxima campanha: o que conferir no site e no perfil",
  ];
  assert.ok(radarTitleOptionsOpenedByKeyword(distintas, principal) <= 1);
  assert.ok(radarTitleOptionsDistinct(distintas, principal).distinct);
});

test("K7 · o teto da forma natural no corpo: 2 + palavras/600 (cerca de 7 em 3.000)", () => {
  assert.equal(radarKeywordBodyCap(3_000), 7);
  assert.equal(radarKeywordBodyCap(4_058), 8);
  assert.equal(radarKeywordBodyCap(null), 2);
});

test("fonte única · a regra nova chega ao pedido, à linha de topo, ao Redator e ao catálogo; o vídeo fica para a F6", () => {
  const [, regra28] = radarHumanVoicePromptBlock();
  assert.ok(regra28.includes(RADAR_HUMAN_VOICE_SERP_SUMMARY));
  assert.match(regra28, /Em title\.principalNatural, grave a keyword principal na forma natural/);
  assert.match(regra28, /Em semanticVariants, de 6 a 12 variações da keyword/);
  assert.doesNotMatch(regra28, /todas com a keyword principal no começo|primeira frase traz a keyword|O primeiro H2 de sections traz a keyword/);
  assert.ok(RADAR_HUMAN_VOICE_SERP_SUMMARY.includes(RADAR_KEYWORD_PRECEDENCE));
  assert.match(radarHumanVoiceRedatorRule(), /o primeiro parágrafo do artigo responde à busca com a keyword principal na forma natural/);
  assert.doesNotMatch(radarHumanVoiceRedatorRule(), /a primeira frase do artigo traz a keyword principal/);
  /* 2026-10-14c · SDD silo interligado · F-B · decisão do dono (§16.2): as regras do artigo-modelo são as de 2026-10-14c. */
  assert.match(radarHumanVoiceCatalogNote(), /regras do artigo-modelo '2026-10-14c', leitura do Redator '2026-10-14'; regras de keyword e título 2026-10-14/);
  assert.equal(WRITER_BLUEPRINT_READING_RULES, "2026-10-14");
  assert.equal(RADAR_KEYWORD_RULES_VERSION, "2026-10-14");
  /* F6 · o vídeo continua com a regra dele até a fase do vídeo (o E0 trava o CSV de vídeo). */
  assert.match(radarHumanVoiceVideoRule(), /o título começa pela keyword principal/);
  const titulo = RADAR_HUMAN_VOICE_SERP_RULES.find(regra => regra.id === "titulo")!;
  assert.match(titulo.what, /abre no máximo 1 das 3 opções/);
});
