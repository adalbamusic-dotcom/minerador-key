import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  matchRadarVideoBriefs, radarBriefMatchTerms, radarExtractRunFingerprint,
  RADAR_GENERIC_MATCH_TERMS, RADAR_VIDEO_MATCHER_VERSION,
  type RadarFrozenBriefInput, type RadarMatchableSource,
} from "../lib/radar/video-brief-matching.ts";

/*
 * ======  VÍDEOS · GATE 3.2 — A ÂNCORA TEMÁTICA  ========================
 *
 * O smoke negativo real fez o que devia: ele encontrou o defeito.
 *
 * Quatro pautas sobre acne e oleosidade, dois transcripts sobre notebook, e o
 * matcher devolveu 10 trechos e PARTIAL em várias pautas. Nenhum deles era
 * sobre skincare.
 *
 * A CAUSA, lida nos dados reais congelados deste artigo:
 *
 *   whatToLookFor  "a ordem real dos passos" · "erros comuns durante a
 *                  execução" · "quanto tempo cada parte leva" · "os sinais
 *                  visíveis" · "exemplos reais"
 *   evidenceNeeded "6 de 10 página(s) comparável(is) tratam desta necessidade,
 *                  3 delas formulando-a como pergunta, encontradas por 4
 *                  consultas"
 *   entities       ["oleosa", "tipo"]        ← `tipo` como ENTIDADE
 *
 * Nenhuma dessas palavras fala de acne: falam do FORMATO da evidência e da
 * própria investigação. A regra antiga abria janela com dois termos quaisquer
 * do pool, e um vídeo de notebook tem "passos", "tempo", "erro" e "tipo" de
 * sobra.
 *
 * A REGRA NOVA separa duas decisões que estavam fundidas:
 *
 *   CRIAR a correspondência     → só entidade do assunto ou termo temático
 *   QUALIFICAR o que já é dela  → aí o vocabulário inteiro volta a valer
 *
 * Sem IA. O portão de ancoragem não foi tocado.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const painel = () => readFileSync(new URL("../modules/radar/radar-r3-videos-panel.tsx", import.meta.url), "utf8");

const fonte = (patch: Partial<RadarMatchableSource> & { videoSourceId: string }): RadarMatchableSource => ({
  displayName: "Fonte", textState: "TEXT_READY", selectedForArticle: true,
  registrationStatus: "REGISTERED", languageCode: "pt", processingVersion: 1,
  transcriptText: "", segments: [],
  ...patch,
});

/* ===== As QUATRO pautas reais, como o bundle 2be6e384 as congelou ===== */

const PAUTAS_REAIS: RadarFrozenBriefInput[] = [
  {
    briefId: "video:de58b182", topic: "Skincare para pele oleosa: como fazer para controlar brilho e acne?",
    narrativePurpose: "", whatToLookFor: ["a ordem real dos passos", "o que se faz em cada etapa", "erros comuns durante a execução", "quanto tempo cada parte leva"],
    relatedSectionId: null, relatedSectionTitle: null,
    questions: ["Skincare para pele oleosa: como fazer para controlar brilho e acne?"],
    entities: ["oleosa", "brilho"],
    evidenceNeeded: "6 de 10 página(s) comparável(is) tratam desta necessidade, 3 delas formulando-a como pergunta, encontradas por 4 consultas.",
    priority: "HIGH",
  },
  {
    briefId: "video:3047fef2", topic: "TIPOS DE ACNE",
    narrativePurpose: "", whatToLookFor: ["os sinais visíveis", "onde eles aparecem", "exemplos reais", "o que distingue de casos parecidos"],
    relatedSectionId: null, relatedSectionTitle: null,
    questions: ["Quais são os tipos de acne?"], entities: ["oleosa", "tipo"],
    evidenceNeeded: "4 de 10 página(s) comparável(is) tratam desta necessidade, 3 delas formulando-a como pergunta, encontradas por 4 consultas.",
    priority: "HIGH",
  },
  {
    briefId: "video:d64b3cb4", topic: "O que causa acne?",
    narrativePurpose: "", whatToLookFor: ["a ressalva do profissional", "o caso em que a regra não vale", "o erro comum de quem lê sobre o assunto"],
    relatedSectionId: null, relatedSectionTitle: null,
    questions: ["O que causa acne?"], entities: ["oleosa"],
    evidenceNeeded: "3 de 10 página(s) comparável(is) tratam desta necessidade, 2 delas formulando-a como pergunta, encontradas por 4 consultas.",
    priority: "MEDIUM",
  },
  {
    briefId: "video:b8ba78db", topic: "O que piora a oleosidade no rosto?",
    narrativePurpose: "", whatToLookFor: ["os sinais visíveis", "onde eles aparecem", "exemplos reais", "o que distingue de casos parecidos"],
    relatedSectionId: null, relatedSectionTitle: null,
    questions: ["O que piora a oleosidade no rosto?"], entities: ["oleosa", "rosto"],
    evidenceNeeded: "1 de 10 página(s) comparável(is) tratam desta necessidade, 1 delas formulando-a como pergunta.",
    priority: "MEDIUM",
  },
];

/* ===== O transcript real: notebook, com o vocabulário que enganava ===== */

const NOTEBOOK = [
  { text: "e essa lapa de trackpad velho olha isso daqui o tamanho desse negocio", startMs: 0, endMs: 4_000 },
  { text: "vou mostrar os passos da configuracao inicial na ordem certa", startMs: 4_000, endMs: 9_000 },
  { text: "o erro comum e nao atualizar o driver logo de cara", startMs: 9_000, endMs: 13_000 },
  { text: "cada parte leva pouco tempo mas tem um tipo de ajuste que muda tudo", startMs: 13_000, endMs: 18_000 },
  { text: "os sinais visiveis de que deu certo aparecem na tela em exemplos reais", startMs: 18_000, endMs: 23_000 },
  { text: "quando eu conecto o carregador mesmo com o notebook desligado ele carrega", startMs: 23_000, endMs: 28_000 },
];

/* ==========  1 · O CONTROLE NEGATIVO  =============================== */

test("VÍDEOS 3.2 · 1 — notebook contra skincare dá NOT_FOUND nas quatro", () => {
  const { coverage } = matchRadarVideoBriefs({
    briefs: PAUTAS_REAIS,
    sources: [fonte({ videoSourceId: "notebook-a", segments: NOTEBOOK })],
  });

  assert.equal(coverage.length, 4);
  for (const pauta of coverage) {
    assert.equal(pauta.state, "NOT_FOUND", `${pauta.videoBriefId} não pode ter cobertura`);
    assert.deepEqual(pauta.extracts, [], `${pauta.videoBriefId} não pode gerar trecho`);
    assert.deepEqual(pauta.usefulSourceIds, []);
  }

  const total = coverage.reduce((soma, item) => soma + item.extracts.length, 0);
  assert.equal(total, 0, "EXTRACTS_CREATED = 0");
});

/* ==========  2 · POR QUE ELE FALHAVA  =============================== */

test("VÍDEOS 3.2 · 2 — vocabulário operacional não cria correspondência", () => {
  /*
   * O SEGMENTO QUE MAIS ENGANAVA: cinco termos do pool antigo numa frase só —
   * passos, ordem, tempo, tipo, parte. E zero palavras sobre o assunto.
   */
  const soGenerico = [{ text: "vou mostrar os passos na ordem e quanto tempo cada parte leva neste tipo de ajuste", startMs: 0, endMs: 5_000 }];
  const { coverage } = matchRadarVideoBriefs({ briefs: PAUTAS_REAIS, sources: [fonte({ videoSourceId: "f", segments: soGenerico })] });
  assert.deepEqual(coverage.flatMap(item => item.extracts), [], "GENERIC_TERMS_CAN_START_MATCH = NO");

  /* E o mesmo segmento COM o assunto dentro passa a valer. */
  const comAssunto = [{ text: "vou mostrar os passos na ordem para tratar a acne e a oleosidade da pele", startMs: 0, endMs: 5_000 }];
  const comTema = matchRadarVideoBriefs({ briefs: PAUTAS_REAIS, sources: [fonte({ videoSourceId: "f", segments: comAssunto })] });
  assert.ok(comTema.coverage.some(item => item.extracts.length > 0), "TOPICAL_ANCHOR_REQUIRED: com âncora, o casamento volta a acontecer");

  /*
   * `tipo` chegou como ENTIDADE da pauta TIPOS DE ACNE. Entidade genérica não
   * é entidade: era ela que casava com qualquer vídeo do mundo.
   */
  const termos = radarBriefMatchTerms(PAUTAS_REAIS[1]);
  assert.deepEqual(termos.entidades.map(item => item.normalizado), ["oleosa"], "`tipo` não é âncora");
  assert.ok(RADAR_GENERIC_MATCH_TERMS.has("tipo"));

  /* `evidenceNeeded` saiu do pool: ele fala da investigação, não do assunto. */
  for (const meta of ["pagina", "comparavel", "consulta", "necessidade"]) {
    assert.equal(termos.ancoras.has(meta), false, `"${meta}" é meta da investigação`);
    assert.equal(termos.reforco.has(meta), false);
  }
  /* E o assunto continua sendo âncora. */
  assert.ok(termos.ancoras.has("acne"));
});

/* ==========  3 · O GENÉRICO AINDA REFORÇA  ========================== */

test("VÍDEOS 3.2 · 3 — dentro de um trecho já temático, a pergunta volta a valer", () => {
  /*
   * "Qual a ordem dos passos da rotina?" pergunta sobre ordem e passos. Num
   * segmento que já falou de rotina, essas palavras são a substância — e é
   * isso que separa SUPPORTED de uma menção solta.
   */
  const pauta: RadarFrozenBriefInput = {
    briefId: "b1", topic: "Rotina para pele oleosa", narrativePurpose: "",
    whatToLookFor: ["ordem dos passos"], relatedSectionId: null, relatedSectionTitle: null,
    questions: ["Qual a ordem dos passos da rotina?"], entities: ["ácido salicílico"],
    evidenceNeeded: "demonstração prática", priority: "HIGH",
  };
  const segmentos = [{ text: "a ordem dos passos da rotina comeca pela limpeza", startMs: 0, endMs: 4_000 }];
  const { coverage } = matchRadarVideoBriefs({ briefs: [pauta], sources: [fonte({ videoSourceId: "f", segments: segmentos })] });

  assert.equal(coverage[0].extracts.length, 1, "o segmento tem âncora (rotina) e a pergunta o qualifica");
  assert.equal(coverage[0].extracts[0].supportType, "ANSWERS_QUESTION");

  /* Já o mesmo vocabulário SEM a âncora não produz nada. */
  const semAncora = [{ text: "a ordem dos passos comeca pela configuracao", startMs: 0, endMs: 4_000 }];
  const nada = matchRadarVideoBriefs({ briefs: [pauta], sources: [fonte({ videoSourceId: "f", segments: semAncora })] });
  assert.deepEqual(nada.coverage[0].extracts, [], "PARTIAL_REQUIRES_TOPIC_AFFINITY");
  assert.equal(nada.coverage[0].state, "NOT_FOUND");
});

/* ==========  4 · A EXECUÇÃO ERRADA NÃO É REUTILIZADA  ============== */

test("VÍDEOS 3.2 · 4 — a versão do matcher entra na identidade da execução", () => {
  const fonteX = fonte({ videoSourceId: "f1", segments: NOTEBOOK });

  assert.ok(RADAR_VIDEO_MATCHER_VERSION >= 2);
  assert.match(radarExtractRunFingerprint([fonteX]), new RegExp(`^m${RADAR_VIDEO_MATCHER_VERSION}:`), "MATCHER_VERSION_IN_FINGERPRINT = YES");

  /*
   * SEM ISTO A EXECUÇÃO ERRADA VALERIA PARA SEMPRE.
   *
   * Mesmo bundle, mesmas fontes, mesmas versões de processamento: a regra de
   * idempotência devolveria a execução com os dez falsos positivos. A versão
   * muda a impressão digital, nasce execução nova, e a anterior é SUPERADA —
   * nunca apagada.
   */
  const comoSeFosseV1 = radarExtractRunFingerprint([fonteX]).replace(/^m\d+:/, "");
  assert.notEqual(radarExtractRunFingerprint([fonteX]), comoSeFosseV1, "a execução da v1 não é reutilizada");

  /* A identidade das fontes continua valendo por cima disso. */
  const outraVersao = { ...fonteX, processingVersion: 2 };
  assert.notEqual(radarExtractRunFingerprint([fonteX]), radarExtractRunFingerprint([outraVersao]));
});

/* ==========  5 · A UI SEPARA RESULTADO DE MATÉRIA-PRIMA  ========== */

test("VÍDEOS 3.2 · 5 — o transcript bruto não abre por padrão", () => {
  const fonte = painel();

  /* O resultado vem primeiro; as fontes com texto, depois. */
  const resultado = fonte.indexOf("Resultado do casamento");
  const fontes = fonte.indexOf("Fontes com texto disponível");
  assert.ok(resultado > 0 && fontes > resultado, "resultado antes da matéria-prima");

  /*
   * O TRANSCRIPT RECOLHEU.
   *
   * Setecentas e trinta e três linhas abertas por padrão empurravam o
   * resultado editorial para fora da tela. `<details>` sem `open`: nasce
   * fechado, não guarda nada e não chama ninguém.
   */
  const bloco = fonte.slice(fonte.indexOf("Ver transcrição completa") - 400, fonte.indexOf("Ver transcrição completa") + 300);
  assert.match(bloco, /<details className="mt-2">/);
  assert.equal(/<details[^>]*\bopen\b/.test(bloco), false, "RAW_TRANSCRIPT_DEFAULT_COLLAPSED = YES");
  assert.match(fonte, /data-testid=\{`radar-videos-transcript-\$\{fonte\.id\}`\}/);

  /* Duração e idioma continuam à vista, sem abrir o transcript. */
  assert.match(fonte, /Idioma original: \{texto\.languageCode \|\| "não informado"\}/);
  assert.match(fonte, /começa em \$\{tempoLegivel\(texto\.segments\[0\]\.startMs\)\}/);
  assert.match(fonte, /termina em \$\{tempoLegivel\(texto\.segments\[texto\.segments\.length - 1\]\.endMs\)\}/);
});

/* ==========  6 · O QUE ESTE GATE NÃO PODIA TOCAR  ================= */

test("VÍDEOS 3.2 · 6 — a ancoragem continua intacta", () => {
  const dominio = readFileSync(new URL("../lib/radar/video-brief-matching.ts", import.meta.url), "utf8");

  /* O portão segue derivando texto e tempos dos SEGMENTOS. */
  assert.match(dominio, /originalText: ancorados\.map\(item => item\.text\.trim\(\)\)\.join\(" "\)/);
  assert.match(dominio, /const startMs = Math\.min\(\.\.\.ancorados\.map\(item => item\.startMs\)\)/);
  assert.match(dominio, /const endMs = Math\.max\(\.\.\.ancorados\.map\(item => item\.endMs\)\)/);

  /* Nenhuma IA entrou neste hotfix. */
  assert.equal(/deepseek|openai|gpt|embedding|llm/i.test(dominio), false, "sem camada semântica");
  assert.equal(/fetch\(/.test(dominio), false, "PROVIDER_CALLS = 0");
});

test("VÍDEOS 3.2 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — ${tentativasDeRede.join(", ")}`);
});
