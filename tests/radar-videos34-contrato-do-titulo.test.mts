import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  matchRadarVideoBriefs,
  radarBriefTitleIntent,
  radarBriefTitleIntentMatch,
  radarCoverageFromExtracts,
  radarExtractAnswersTitle,
  radarExtractRunFingerprint,
  RADAR_BRIEF_GUIDE_PROXIMITY_WORDS,
  RADAR_MAX_EDITORIAL_EXTRACTS_PER_BRIEF,
  RADAR_TITLE_ANSWER_PROXIMITY_WORDS,
  RADAR_VIDEO_MATCHER_VERSION,
  type RadarFrozenBriefInput,
  type RadarMatchableSource,
} from "../lib/radar/video-brief-matching.ts";

/*
 * ====  VÍDEOS · GATE 3.4 — O TÍTULO É O CONTRATO SEMÂNTICO  ==========
 *
 * A m3 acertou a precisão e errou a autoridade: `whatToLookFor` passou a
 * governar o estado da pauta sozinho, e o resultado foi uma inversão que o
 * dado real mostrou de cara —
 *
 *   "O que causa acne?"   chegou a SUPPORTED sem uma linha sobre causa;
 *   "TIPOS DE ACNE"       foi dada por atendida sem nenhum tipo de acne.
 *
 * As duas pautas tinham guias que o vídeo atendia (ressalva, exceção, erro
 * comum; sinais, onde aparecem, exemplos). Nenhuma delas respondia o título.
 *
 * A REGRA CANÔNICA que este arquivo guarda:
 *
 *   title           CONTRATO SEMÂNTICO OBRIGATÓRIO
 *   whatToLookFor   GUIA DE RECUPERAÇÃO E QUALIFICAÇÃO
 *   whyVideoHelps   CONTEXTO AUDIOVISUAL
 *
 * Nenhum critério da guia compensa a ausência do objetivo do título.
 *
 * PROVIDER_CALLS = 0 · domínio puro, sem rede, sem banco, sem modelo.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8");
const dominio = () => ler("../lib/radar/video-brief-matching.ts");
const painel = () => ler("../modules/radar/radar-r3-videos-panel.tsx");

/* ================= as quatro pautas reais do artigo ================== */

const pauta = (patch: Partial<RadarFrozenBriefInput> & { briefId: string; topic: string }): RadarFrozenBriefInput => ({
  narrativePurpose: "", whatToLookFor: [], relatedSectionId: null, relatedSectionTitle: patch.topic,
  questions: [], entities: [], evidenceNeeded: "", priority: "MEDIUM",
  ...patch,
});

const A_CAUSA = pauta({
  briefId: "video:d64b3cb4", topic: "O que causa acne?",
  questions: ["O que causa acne?"], entities: ["oleosa"],
  /*
   * A GUIA DESTA PAUTA NÃO PEDE CAUSA — e é esse o ponto. Ela pede ressalva,
   * exceção e erro comum, que o vídeo tem de sobra. Na m3 isso bastava.
   */
  whatToLookFor: ["a ressalva do profissional", "o caso em que a regra não vale", "o erro comum de quem lê sobre o assunto"],
});

const OS_TIPOS = pauta({
  briefId: "video:3047fef2", topic: "TIPOS DE ACNE",
  questions: ["Quais são os tipos de acne?"], entities: ["oleosa", "tipo"],
  whatToLookFor: ["os sinais visíveis", "onde eles aparecem", "exemplos reais", "o que distingue de casos parecidos"],
});

const O_QUE_PIORA = pauta({
  briefId: "video:b8ba78db", topic: "O que piora a oleosidade no rosto?",
  questions: ["O que piora a oleosidade no rosto?"], entities: ["oleosa", "rosto"],
  whatToLookFor: ["os sinais visíveis", "onde eles aparecem"],
});

const A_ROTINA = pauta({
  briefId: "video:de58b182", topic: "Skincare para pele oleosa: como fazer para controlar brilho e acne?",
  questions: ["Skincare para pele oleosa: como fazer para controlar brilho e acne?"],
  entities: ["oleosa", "brilho"],
  narrativePurpose: "A necessidade e uma sequencia pratica: ver a execucao ensina o que o texto so descreve.",
  whatToLookFor: ["a ordem real dos passos", "o que se faz em cada etapa", "erros comuns durante a execução", "quanto tempo cada parte leva"],
});

const fonte = (patch: Partial<RadarMatchableSource> & { videoSourceId: string }): RadarMatchableSource => ({
  displayName: null, textState: "TEXT_READY", selectedForArticle: true,
  registrationStatus: "REGISTERED", languageCode: "pt", processingVersion: 1,
  transcriptText: "", segments: [],
  ...patch,
});

const transcrever = (linhas: string[]): RadarMatchableSource["segments"] =>
  linhas.map((text, indice) => ({ text, startMs: indice * 4_500, endMs: (indice + 1) * 4_500 }));

/* ==========  §1 · A INTENÇÃO SAI DO TÍTULO  ======================== */

test("VÍDEOS 3.4 · o objetivo semântico é derivado do título, e a tabela não conhece domínio", () => {
  assert.equal(radarBriefTitleIntent(A_CAUSA).kind, "CAUSE");
  assert.equal(radarBriefTitleIntent(OS_TIPOS).kind, "CLASSIFICATION");
  assert.equal(radarBriefTitleIntent(O_QUE_PIORA).kind, "AGGRAVATION");
  assert.equal(radarBriefTitleIntent(A_ROTINA).kind, "PROCEDURE");

  /*
   * "Não hardcodar dermatologia" — §1. Se a tabela soubesse o que é acne, o
   * matcher deixaria de servir a qualquer outra marca deste produto.
   */
  const fonteDoDominio = dominio();
  const inicio = fonteDoDominio.indexOf("const INTENCAO_PISTAS");
  const fim = fonteDoDominio.indexOf("const INTENCAO_ROTULO");
  assert.ok(inicio > 0 && fim > inicio, "a tabela tem começo e fim conhecidos");
  /*
   * A VERIFICAÇÃO É SOBRE AS PISTAS, NÃO SOBRE O COMENTÁRIO.
   *
   * O comentário da tabela cita "o excesso de sebo pode contribuir para" — é o
   * exemplo que explica por que `contribuir` entrou na lista da causa. Proibir
   * a palavra no arquivo inteiro proibiria explicar a decisão.
   */
  const tabela = fonteDoDominio.slice(inicio, fim).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const proibido of ["acne", "pele", "oleos", "skincare", "sebo", "espinha", "cravo", "poro"]) {
    assert.ok(!tabela.includes(proibido), `a tabela de intenções não conhece "${proibido}"`);
  }
});

/* ==========  §2 e §4 · O CONTRATO, NOS CASOS QUE O GATE NOMEIA  ==== */

test("VÍDEOS 3.4 · CAUSE exige evidência causal — assunto relacionado não serve", () => {
  /* §4 · "pele oleosa precisa de cuidados" → NÃO serve para a pauta da causa. */
  const semCausa = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["quem tem pele oleosa precisa de cuidados", "e a acne aparece em muita gente"]),
  })];
  const nada = matchRadarVideoBriefs({ briefs: [A_CAUSA], sources: semCausa });
  assert.equal(nada.coverage[0].state, "NOT_FOUND", "CAUSE_REQUIRES_CAUSAL_EVIDENCE = YES");
  assert.deepEqual(nada.coverage[0].extracts, []);
  assert.match(nada.coverage[0].reason, /nenhuma passagem responde diretamente ao objetivo desta pauta \(causa\)/);

  /* §4 · "o excesso de sebo pode contribuir para..." → candidato causal. */
  const comCausa = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["o excesso de sebo pode contribuir para a acne", "e por isso a limpeza importa tanto"]),
  })];
  const casou = matchRadarVideoBriefs({ briefs: [A_CAUSA], sources: comCausa });
  assert.ok(casou.coverage[0].extracts.length >= 1, "a passagem causal entra");
  assert.ok(casou.coverage[0].extracts[0].answersTitle, "e ela responde o objetivo do título");
});

test("VÍDEOS 3.4 · a guia cheia não compensa um título sem resposta", () => {
  /*
   * §2 · O CASO QUE INVERTEU A m3, RECONSTRUÍDO.
   *
   * Este material atende os TRÊS critérios da guia de "O que causa acne?" —
   * ressalva do profissional, exceção à regra e erro comum — e não explica
   * causa nenhuma. Na m3 isso era SUPPORTED. Aqui é ausência de resposta.
   */
  const soAGuia = [fonte({
    videoSourceId: "f1",
    segments: transcrever([
      "para acne depende muito de cada caso individual",
      "o profissional avalia e varia bastante",
      "o erro comum de quem tem acne e desistir cedo",
      "e evitar o hidratante achando que atrapalha",
    ]),
  })];
  const { coverage } = matchRadarVideoBriefs({ briefs: [A_CAUSA], sources: soAGuia });

  assert.equal(coverage[0].state, "NOT_FOUND", "whatToLookFor nunca cria SUPPORTED sozinho");
  assert.deepEqual(coverage[0].extracts, [], "e nada é gravado: assunto relacionado não é evidência parcial");
  assert.deepEqual(coverage[0].matchedCriteria, []);
});

test("VÍDEOS 3.4 · CLASSIFICATION exige classificação — 'o tipo de sebo' não serve", () => {
  /* §4 · o exemplo literal do gate. */
  const tipoDeOutraCoisa = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["o tipo de sebo que a pessoa produz muda bastante", "e quem tem acne sofre com isso"]),
  })];
  const nada = matchRadarVideoBriefs({ briefs: [OS_TIPOS], sources: tipoDeOutraCoisa });
  assert.notEqual(nada.coverage[0].state, "SUPPORTED");
  assert.equal(nada.coverage[0].extracts.some(item => item.answersTitle && /tipo de sebo/.test(item.originalText)), false);

  /* §4 · "acne comedoniana…, acne inflamatória…" → candidato forte. */
  const classificando = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["existem basicamente tres tipos de acne", "a leve a moderada e a grave", "cada uma pede um cuidado diferente"]),
  })];
  const casou = matchRadarVideoBriefs({ briefs: [OS_TIPOS], sources: classificando });
  assert.ok(casou.coverage[0].extracts.some(item => item.answersTitle), "CLASSIFICATION_REQUIRES_CLASSIFICATION_EVIDENCE = YES");
});

test("VÍDEOS 3.4 · AGGRAVATION e PROCEDURE exigem o que seus títulos pedem", () => {
  /* Agravamento: sem "piora/aumenta" perto do assunto, não há resposta. */
  const soDescreve = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["a oleosidade do rosto aparece visivel na zona T", "e a marca fica na regiao da testa"]),
  })];
  assert.equal(matchRadarVideoBriefs({ briefs: [O_QUE_PIORA], sources: soDescreve }).coverage[0].state, "NOT_FOUND");

  const agrava = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["o calor aumenta a oleosidade visivel do rosto", "e a marca aparece mais na regiao da testa"]),
  })];
  const casou = matchRadarVideoBriefs({ briefs: [O_QUE_PIORA], sources: agrava });
  assert.ok(casou.coverage[0].extracts.some(item => item.answersTitle), "AGGRAVATION_REQUIRES_AGGRAVATION_EVIDENCE = YES");

  /* Procedimento: falar do assunto sem executar nada não responde. */
  const soFalaDoTema = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["quem tem pele oleosa sabe que fica com brilho", "e isso incomoda bastante todo mundo"]),
  })];
  assert.equal(matchRadarVideoBriefs({ briefs: [A_ROTINA], sources: soFalaDoTema }).coverage[0].state, "NOT_FOUND");

  const executa = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["para pele oleosa comeco pela limpeza de manha", "depois aplico o hidratante bem leve"]),
  })];
  const feito = matchRadarVideoBriefs({ briefs: [A_ROTINA], sources: executa });
  assert.ok(feito.coverage[0].extracts.some(item => item.answersTitle), "PROCEDURE_REQUIRES_PROCEDURAL_EVIDENCE = YES");
});

test("VÍDEOS 3.4 · a ressalva enriquece um candidato causal, e não sustenta a pauta sozinha", () => {
  /*
   * §4 · A REGRA QUE SEPARA AS DUAS COISAS.
   *
   * A mesma passagem de ressalva: sozinha, não grava nada; ao lado de uma
   * passagem causal, entra como enriquecimento e completa a guia.
   */
  const soRessalva = transcrever([
    "para acne depende muito de cada caso individual",
    "o profissional avalia e varia bastante",
  ]);
  assert.deepEqual(matchRadarVideoBriefs({ briefs: [A_CAUSA], sources: [fonte({ videoSourceId: "f1", segments: soRessalva })] }).coverage[0].extracts, []);

  const comCausaAntes = transcrever([
    "o excesso de sebo pode contribuir para a acne",
    "conversa solta que nao interessa aqui",
    "outro bloco sem relacao alguma",
    "intervalo de silencio no meio",
    "pausa para respirar um pouco",
    "nota irrelevante de passagem",
    "para acne depende muito de cada caso individual",
    "o profissional avalia e varia bastante",
  ]);
  const { coverage } = matchRadarVideoBriefs({ briefs: [A_CAUSA], sources: [fonte({ videoSourceId: "f1", segments: comCausaAntes })] });

  assert.ok(coverage[0].extracts.some(item => item.answersTitle && /contribuir para a acne/.test(item.originalText)), "a causal responde");
  assert.ok(coverage[0].extracts.length >= 1);
  assert.equal(coverage[0].state, "PARTIAL");
});

/* ==========  §3 e §6 · O ESTADO E A FRASE  ========================= */

test("VÍDEOS 3.4 · assunto relacionado vira NOT_FOUND com a frase certa, não PARCIAL", () => {
  const relacionado = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["a acne incomoda muita gente por ai", "e todo mundo ja passou por isso"]),
  })];
  const { coverage } = matchRadarVideoBriefs({ briefs: [A_CAUSA], sources: relacionado });

  assert.equal(coverage[0].state, "NOT_FOUND");
  assert.match(coverage[0].reason, /^Há conteúdo relacionado ao tema, mas nenhuma passagem responde diretamente ao objetivo desta pauta \(causa\)\.$/);
  assert.deepEqual(coverage[0].missingCriteria, A_CAUSA.whatToLookFor, "e o que a guia pedia continua listado");
});

test("VÍDEOS 3.4 · a proximidade da resposta é mais curta que a da guia", () => {
  /*
   * §2 · TOCAR E RESPONDER SÃO DISTÂNCIAS DIFERENTES.
   *
   * Na primeira, causa e assunto estão na mesma frase. Na segunda, estão na
   * mesma passagem e falam de coisas distintas — e é aí que a m3 teria dito
   * que a pauta foi respondida.
   */
  assert.ok(RADAR_TITLE_ANSWER_PROXIMITY_WORDS < RADAR_BRIEF_GUIDE_PROXIMITY_WORDS);

  const naFrase = radarBriefTitleIntentMatch({ brief: A_CAUSA, text: "o excesso de sebo pode contribuir para a acne" });
  assert.equal(naFrase.matched, true);
  assert.equal(naFrase.answers, true);

  const soNaPassagem = radarBriefTitleIntentMatch({
    brief: A_CAUSA,
    text: "a acne incomoda muita gente e a origem daquilo era outra",
  });
  assert.equal(soNaPassagem.matched, true, "o objetivo aparece na passagem");
  assert.equal(soNaPassagem.answers, false, "e ainda assim não responde");
  assert.equal(radarExtractAnswersTitle({ brief: A_CAUSA, text: "a acne incomoda muita gente e a origem daquilo era outra" }), false);

  /*
   * E O EFEITO DISSO NA PAUTA INTEIRA: tocar não é responder.
   *
   * Este material tem o assunto e tem a palavra da causa na mesma passagem, a
   * distância de vizinhança. Aceitar isso como resposta devolveria a inversão
   * que a m3 produziu, só que por outro caminho.
   */
  const soToca = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["a acne incomoda muita gente", "e a origem daquilo era outra"]),
  })];
  const tocou = matchRadarVideoBriefs({ briefs: [A_CAUSA], sources: soToca });
  assert.ok(tocou.candidatesFound > 0, "houve candidato: o objetivo aparece na passagem");
  assert.equal(tocou.coverage[0].state, "NOT_FOUND", "mas nenhum responde, e a pauta não é atendida");
  assert.deepEqual(tocou.coverage[0].extracts, [], "e nada é gravado");
});

/* ==========  §7 · O LIMITE, E A PREFERÊNCIA PELO FORTE  ============ */

test("VÍDEOS 3.4 · no máximo três, e um trecho forte vale mais que três fracos", () => {
  assert.equal(RADAR_MAX_EDITORIAL_EXTRACTS_PER_BRIEF, 3);

  const umForte = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["o excesso de sebo pode contribuir para a acne", "e por isso a limpeza importa tanto"]),
  })];
  const { coverage } = matchRadarVideoBriefs({ briefs: [A_CAUSA], sources: umForte });
  assert.equal(coverage[0].extracts.length, 1, "não se preenche três por preencher");
  assert.ok(coverage[0].extracts[0].answersTitle);
});

/* ==========  §8 · A VERSÃO  ======================================== */

test("VÍDEOS 3.4 · m4 entra na impressão digital e supera a execução m3", () => {
  assert.equal(RADAR_VIDEO_MATCHER_VERSION, 4, "MATCHER_VERSION = 4");

  const material = [fonte({ videoSourceId: "f1", processingVersion: 1 })];
  assert.equal(radarExtractRunFingerprint(material), "m4:f1@v1");
  /*
   * A m3 não é apagada: ela é SUPERADA. A impressão digital antiga nunca mais
   * é produzida, então o material idêntico deixa de "reutilizar a existente" e
   * nasce execução nova pelo mecanismo que já existe.
   */
  assert.notEqual(radarExtractRunFingerprint(material), "m3:f1@v1", "OLD_M3_RUN_SUPERSEDED = YES");
  assert.equal(radarExtractRunFingerprint(material), radarExtractRunFingerprint([{ ...material[0] }]), "SECOND_CLICK_REUSES_M4 = YES");
});

/* ==========  A LEITURA DE VOLTA  =================================== */

test("VÍDEOS 3.4 · o veredito do título é reconstituído na leitura, e o F5 não muda o estado", () => {
  const material = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["o excesso de sebo pode contribuir para a acne", "e por isso a limpeza importa tanto"]),
  })];
  const executado = matchRadarVideoBriefs({ briefs: [A_CAUSA], sources: material });
  assert.ok(executado.coverage[0].extracts.length, "houve o que gravar");

  /*
   * É ASSIM QUE O BANCO DEVOLVE: sem `answersTitle` e sem `matchedCriteria`,
   * porque nenhum dos dois é coluna. Se a leitura não os reconstituísse, o F5
   * mandaria a pauta para NOT_FOUND com o trecho gravado ali do lado.
   */
  const comoOBancoDevolve = executado.coverage.flatMap(item => item.extracts)
    .map(item => ({ ...item, matchedCriteria: [] as string[], answersTitle: false }));
  const relido = radarCoverageFromExtracts({ briefs: [A_CAUSA], extracts: comoOBancoDevolve });

  assert.equal(relido[0].state, executado.coverage[0].state, "F5_PRESERVES = YES");
  assert.equal(relido[0].reason, executado.coverage[0].reason);
  assert.ok(relido[0].extracts.every(item => item.answersTitle), "o veredito do título volta");
});

/* ==========  §6 · A TELA  ========================================= */

test("VÍDEOS 3.4 · a tela põe a resposta primeiro e distingue quem responde de quem enriquece", () => {
  const texto = painel();

  assert.match(texto, />Resposta encontrada para a pauta</);
  assert.match(texto, />Aspectos da guia encontrados</);
  assert.match(texto, />Ainda faltando</);
  assert.match(texto, /trecho\.answersTitle \? "Responde o objetivo da pauta" : "Enriquece a resposta"/);

  /* A ordem importa: a resposta vem antes dos aspectos da guia. */
  const resposta = texto.indexOf("Resposta encontrada para a pauta");
  const aspectos = texto.indexOf("Aspectos da guia encontrados");
  const faltando = texto.indexOf("Ainda faltando");
  assert.ok(resposta > 0 && aspectos > resposta && faltando > aspectos, "resposta → guia → o que falta");

  /* E a copy explica a autoridade nova sem prometer tradução. */
  assert.match(texto, /o TÍTULO da pauta decide o que conta como resposta/);
  assert.equal(/ainda não existem — são gates posteriores/.test(texto), false);
});

test("VÍDEOS 3.4 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — ${tentativasDeRede.join(", ")}`);
});
