import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  matchRadarVideoBriefs,
  radarBriefAudiovisualPreference,
  radarBriefCriteria,
  radarBriefCriteriaMatched,
  radarBriefMatchTerms,
  radarCoverageFromExtracts,
  radarDilutedCorpusTerms,
  radarExtractRunFingerprint,
  RADAR_DILUTED_TERM_MIN_SEGMENTS,
  RADAR_DILUTED_TERM_SHARE,
  RADAR_EXTRACT_DIVERSITY_DISCOUNT,
  RADAR_MAX_EDITORIAL_EXTRACTS_PER_BRIEF,
  RADAR_BRIEF_GUIDE_PROXIMITY_WORDS,
  RADAR_VIDEO_MATCHER_VERSION,
  type RadarFrozenBriefInput,
  type RadarMatchableSource,
} from "../lib/radar/video-brief-matching.ts";
import { comProductShell, montarRadar, React } from "./radar-dom-harness.mts";

/*
 * ====  VÍDEOS · GATE 3.3 — PRECISÃO EDITORIAL DO CASAMENTO  ==========
 *
 * O controle negativo da m2 passou: notebook × skincare deu quatro NOT_FOUND.
 * O controle POSITIVO é que revelou o defeito oposto — três vídeos reais sobre
 * pele oleosa produziram 509 trechos gravados, um para cada ocorrência lexical
 * do assunto. O número não descrevia a evidência: descrevia o transcript.
 *
 * ============== O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ================
 *
 *   que o termo de fundo do material ("pele", em 232 dos 2302 segmentos)
 *   volte a abrir janela sozinho;
 *
 *   que a entidade herdada do ARTIGO ("oleosa", copiada nas quatro pautas)
 *   sustente uma pauta cujo enunciado não a nomeia;
 *
 *   que mencionar o assunto valha como responder o que a pauta pergunta;
 *
 *   que candidato volte a ser confundido com extrato editorial.
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
const rota = () => ler("../app/api/editorial/radar-video-matching/route.ts");

/* ===================== as pautas reais do artigo ===================== */

const pauta = (patch: Partial<RadarFrozenBriefInput> & { briefId: string; topic: string }): RadarFrozenBriefInput => ({
  narrativePurpose: "", whatToLookFor: [], relatedSectionId: null, relatedSectionTitle: patch.topic,
  questions: [], entities: [], evidenceNeeded: "", priority: "MEDIUM",
  ...patch,
});

/**
 * AS QUATRO PAUTAS COMO O BUNDLE CONGELADO REAL AS PRESERVOU.
 *
 * Repare em `entities`: as quatro carregam "oleosa", que é a entidade do
 * ARTIGO copiada em todas. É ela que, na m2, fazia "O que causa acne?" receber
 * trecho que só falava de pele oleosa.
 */
const PAUTAS_REAIS: RadarFrozenBriefInput[] = [
  pauta({
    briefId: "video:de58b182", topic: "Skincare para pele oleosa: como fazer para controlar brilho e acne?",
    questions: ["Skincare para pele oleosa: como fazer para controlar brilho e acne?"],
    entities: ["oleosa", "brilho"],
    narrativePurpose: "A necessidade e uma sequencia pratica: ver a execucao ensina o que o texto so descreve.",
    whatToLookFor: ["a ordem real dos passos", "o que se faz em cada etapa", "erros comuns durante a execução", "quanto tempo cada parte leva"],
    evidenceNeeded: "6 de 10 página(s) comparável(is) tratam desta necessidade, 3 delas formulando-a como pergunta, encontradas por 4 consultas.",
  }),
  pauta({
    briefId: "video:3047fef2", topic: "TIPOS DE ACNE",
    questions: ["Quais são os tipos de acne?"], entities: ["oleosa", "tipo"],
    narrativePurpose: "A necessidade envolve caracteristicas observaveis: mostrar os sinais e mais direto que descreve-los.",
    whatToLookFor: ["os sinais visíveis", "onde eles aparecem", "exemplos reais", "o que distingue de casos parecidos"],
  }),
  pauta({
    briefId: "video:d64b3cb4", topic: "O que causa acne?",
    questions: ["O que causa acne?"], entities: ["oleosa"],
    narrativePurpose: "A afirmacao depende de julgamento profissional: a explicacao de quem pratica acrescenta nuance.",
    whatToLookFor: ["a ressalva do profissional", "o caso em que a regra não vale", "o erro comum de quem lê sobre o assunto"],
  }),
  pauta({
    briefId: "video:b8ba78db", topic: "O que piora a oleosidade no rosto?",
    questions: ["O que piora a oleosidade no rosto?"], entities: ["oleosa", "rosto"],
    whatToLookFor: ["os sinais visíveis", "onde eles aparecem"],
  }),
];

const fonte = (patch: Partial<RadarMatchableSource> & { videoSourceId: string }): RadarMatchableSource => ({
  displayName: null, textState: "TEXT_READY", selectedForArticle: true,
  registrationStatus: "REGISTERED", languageCode: "pt", processingVersion: 1,
  transcriptText: "", segments: [],
  ...patch,
});

/** Um transcript com a forma do real: segmentos de ~7 palavras, ~4s cada. */
function transcrever(linhas: string[], inicio = 0): RadarMatchableSource["segments"] {
  return linhas.map((text, indice) => ({ text, startMs: inicio + indice * 4_500, endMs: inicio + (indice + 1) * 4_500 }));
}

/**
 * O MATERIAL EM QUE "PELE" É FUNDO.
 *
 * Quarenta e poucos segmentos, "pele" em boa parte deles — a mesma proporção
 * que o vídeo real tem. É este pano de fundo que a m2 tratava como evidência.
 */
const FALA_DE_PELE = Array.from({ length: 44 }, (_, indice) =>
  indice % 2 === 0 ? "e a pele da gente muda com o tempo" : "entao a pele pede atencao todo dia");

/* ==========  §2 · O PRIMEIRO PORTÃO: ASSUNTO ESPECÍFICO  ============ */

test("VÍDEOS 3.3 · o termo que está em todo o material não abre janela sozinha", () => {
  const material = [fonte({ videoSourceId: "f1", segments: transcrever(FALA_DE_PELE) })];
  const diluidos = radarDilutedCorpusTerms(material);

  /*
   * A MEDIDA É DO MATERIAL, NÃO DE UMA LISTA. Nada aqui sabe o que é "pele":
   * ela é fundo porque aparece em 44 dos 44 segmentos.
   */
  assert.ok(diluidos.has("pele"), "num material que fala de pele o tempo todo, 'pele' é fundo");

  /* E num material que mal a menciona, ela volta a distinguir. */
  const raro = [fonte({ videoSourceId: "f2", segments: transcrever([...Array.from({ length: 60 }, () => "vamos falar de outra coisa agora"), "aqui sim a pele aparece uma vez"]) })];
  assert.equal(radarDilutedCorpusTerms(raro).has("pele"), false, "a mesma palavra, outro material, outro papel");

  /* Os dois limites existem, e o piso protege corpus pequeno. */
  assert.equal(radarDilutedCorpusTerms([fonte({ videoSourceId: "f3", segments: transcrever(["a pele", "a pele", "a pele"]) })]).size, 0, "três segmentos não diluem nada");
  assert.ok(RADAR_DILUTED_TERM_MIN_SEGMENTS >= 20 && RADAR_DILUTED_TERM_SHARE > 0 && RADAR_DILUTED_TERM_SHARE < 0.5);

  /*
   * §8 · O EXEMPLO DO GATE, LITERAL.
   *
   * "ideal de começar os cuidados com a pele" não pode sustentar a pauta de
   * skincare para pele oleosa: "pele" e "cuidados" são genéricos demais.
   */
  const soPele = [fonte({
    videoSourceId: "f1",
    segments: transcrever([...FALA_DE_PELE, "o ideal de comecar os cuidados com a pele", "e usar o que funciona para voce"]),
  })];
  const resultado = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: soPele });
  assert.deepEqual(resultado.coverage[0].extracts, [], "GENERIC_TOPIC_ONLY_MATCHES = 0");
  assert.equal(resultado.coverage[0].state, "NOT_FOUND");
  assert.equal(resultado.candidatesFound, 0, "nem candidato ele vira");

  /* A mesma passagem COM o assunto específico entra. */
  const comAssunto = [fonte({
    videoSourceId: "f1",
    segments: transcrever([...FALA_DE_PELE, "quem tem pele oleosa sente aquele brilho", "o ideal e usar o produto na zona T primeiro"]),
  })];
  const entrou = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: comAssunto });
  assert.ok(entrou.coverage[0].extracts.length >= 1, "'pele oleosa' e 'brilho' são assunto, e o trecho entra");
});

test("VÍDEOS 3.3 · a entidade herdada do artigo não sustenta a pauta que não a nomeia", () => {
  /*
   * §8 · "Para 'O que causa acne?', menção a pele oleosa sozinha NÃO basta."
   *
   * "oleosa" chega em `entities` das QUATRO pautas — é do artigo, não desta.
   * O enunciado de "O que causa acne?" não a nomeia, então ela não abre janela
   * ali; nas pautas cujo enunciado fala de oleosidade, ela continua sendo o
   * assunto.
   */
  const causa = radarBriefMatchTerms(PAUTAS_REAIS[2], { briefs: PAUTAS_REAIS });
  assert.equal(causa.ancoras.has("oleosa"), false, "entidade do artigo não é âncora desta pauta");
  assert.ok(causa.ancoras.has("acne"), "o assunto do enunciado é");
  assert.ok(causa.reforco.has("oleosa"), "ela continua pesando no ranking");

  const daOleosidade = radarBriefMatchTerms(PAUTAS_REAIS[0], { briefs: PAUTAS_REAIS });
  assert.ok(daOleosidade.ancoras.has("oleosa"), "onde o enunciado a nomeia, ela é assunto");

  /* E o efeito disso no casamento, com material que só fala de oleosidade. */
  const material = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["quem tem pele oleosa produz mais sebo", "e isso provoca aquele brilho na testa", "por causa do calor tambem piora"]),
  })];
  const { coverage } = matchRadarVideoBriefs({ briefs: PAUTAS_REAIS, sources: material });
  const doCausa = coverage.find(item => item.videoBriefId === "video:d64b3cb4")!;
  assert.equal(doCausa.state, "NOT_FOUND", "sem acne no trecho, a pauta da causa de acne não recebe nada");
  assert.deepEqual(doCausa.extracts, []);
});

/* ==========  §1.B e §2 · O SEGUNDO PORTÃO: A GUIA DA PAUTA  ======== */

test("VÍDEOS 3.3 · a guia vem de whatToLookFor, e sem ela atendida não há candidato", () => {
  /*
   * CADA ITEM DA PAUTA VIRA UM CRITÉRIO, com a espécie certa — §1.B e §3.
   *
   * "erros comuns durante a execução" tem a palavra "execução" dentro: se a
   * espécie fosse decidida por ela, o critério do ERRO seria lido como o da
   * execução, e um vídeo que ensina o passo a passo apareceria como se
   * explicasse o que dá errado.
   */
  const daRotina = radarBriefCriteria(PAUTAS_REAIS[0]);
  assert.deepEqual(daRotina.map(item => item.label), PAUTAS_REAIS[0].whatToLookFor, "os rótulos são os da pauta, intactos");
  assert.deepEqual(daRotina.map(item => item.kind), ["ORDER", "EXECUTION", "ERROR", "DURATION"]);

  const dosTipos = radarBriefCriteria(PAUTAS_REAIS[1]);
  assert.deepEqual(dosTipos.map(item => item.kind), ["SIGNS", "LOCATION", "EXAMPLE", "DISTINCTION"]);

  const daCausa = radarBriefCriteria(PAUTAS_REAIS[2]);
  assert.deepEqual(daCausa.map(item => item.kind), ["CAVEAT", "CAVEAT", "ERROR"]);

  /*
   * NADA DE DOMÍNIO NAS PISTAS. A tabela é de PORTUGUÊS: se ela conhecesse
   * acne, o matcher deixaria de servir a qualquer outra marca.
   */
  const tabela = dominio().slice(dominio().indexOf("const CRITERIO_PISTAS"), dominio().indexOf("const CRITERIO_PADROES"));
  assert.ok(tabela.length > 500, "a tabela foi encontrada");
  for (const proibido of ["acne", "pele", "oleos", "skincare", "sebo", "espinha"]) {
    assert.ok(!tabela.includes(proibido), `a tabela de critérios não conhece "${proibido}"`);
  }

  /*
   * §2 · O ASSUNTO SOZINHO NÃO BASTA — o exemplo do gate, literal.
   *
   * "quem tem pele oleosa sabe que fica com brilho" é assunto puro: pode servir
   * a brilho/oleosidade e não diz nada sobre a ordem dos passos.
   */
  const soAssunto = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["quem tem pele oleosa sabe que fica com brilho", "e isso incomoda bastante todo mundo"]),
  })];
  const semGuia = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: soAssunto });
  assert.equal(semGuia.candidatesFound, 0, "sem atender critério nenhum, não há candidato");
  assert.equal(semGuia.coverage[0].state, "NOT_FOUND");
  assert.match(semGuia.coverage[0].reason, /nenhuma passagem responde diretamente ao objetivo desta pauta \(procedimento\)/, "e o motivo diz que o objetivo do título não foi respondido");

  /*
   * §2 · E A GUIA SOZINHA TAMBÉM NÃO BASTA.
   *
   * "de manhã começo pela limpeza, depois aplico" é a ordem inteira — de outra
   * coisa. Fora de um contexto de pele oleosa, não é evidência desta pauta.
   */
  const soGuia = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["de manha comeco pela limpeza da casa", "depois aplico o produto no chao"]),
  })];
  assert.equal(matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: soGuia }).candidatesFound, 0);

  /* As duas coisas juntas, e perto uma da outra: aí é candidato. */
  const juntas = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["para pele oleosa de manha comeco pela limpeza", "depois aplico o hidratante leve"]),
  })];
  const casou = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: juntas });
  assert.ok(casou.coverage[0].extracts.length >= 1);
  assert.deepEqual(casou.coverage[0].matchedCriteria, ["a ordem real dos passos", "o que se faz em cada etapa"]);
  assert.deepEqual(casou.coverage[0].missingCriteria, ["erros comuns durante a execução", "quanto tempo cada parte leva"]);
  assert.ok(RADAR_BRIEF_GUIDE_PROXIMITY_WORDS >= 3 && RADAR_BRIEF_GUIDE_PROXIMITY_WORDS <= 12, "a proximidade é declarada e curta");
});

test("VÍDEOS 3.3 · cada trecho declara os critérios que sustenta, e são os reais", () => {
  /*
   * §3 · A pauta tem quatro critérios; nenhum trecho precisa cobrir todos, e
   * cada um diz quais cobre. É isso que a tela transforma em ✓ e –.
   */
  const material = [fonte({
    videoSourceId: "f1",
    segments: transcrever([
      "para pele oleosa comeco pela limpeza de manha",
      "depois aplico o hidratante bem leve",
      "vamos falar de outra coisa agora",
      "mudando de assunto completamente aqui",
      "nada a ver com o tema",
      "seguindo em frente na prosa",
      "o erro comum de quem tem pele oleosa",
      "e lavar o rosto sem parar nunca",
    ]),
  })];
  const { coverage } = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: material });

  const primeiro = coverage[0].extracts.find(item => /comeco pela limpeza/.test(item.originalText))!;
  assert.ok(primeiro, "a passagem da ordem entrou");
  assert.deepEqual(primeiro.matchedCriteria, ["a ordem real dos passos", "o que se faz em cada etapa"]);
  assert.match(primeiro.reasonForRelevance, /^Cobre: a ordem real dos passos · o que se faz em cada etapa\.$/);

  const doErro = coverage[0].extracts.find(item => /erro comum/.test(item.originalText))!;
  assert.ok(doErro, "a passagem do erro entrou");
  assert.ok(doErro.matchedCriteria.includes("erros comuns durante a execução"));

  /* A pauta soma o que os trechos sustentam — e o que ninguém sustentou. */
  assert.ok(coverage[0].matchedCriteria.includes("erros comuns durante a execução"));
  assert.deepEqual(coverage[0].missingCriteria, ["quanto tempo cada parte leva"]);
  assert.match(coverage[0].reason, /3 de 4 aspecto\(s\) da guia encontrado\(s\), falta: quanto tempo cada parte leva\./);
  assert.equal(coverage[0].state, "PARTIAL");
});

test("VÍDEOS 3.3 · a conta dos critérios é a mesma nas duas pontas, e ela exige o assunto perto", () => {
  const daRotina = PAUTAS_REAIS[0];

  /* Assunto e guia na mesma frase: o critério é atendido. */
  assert.deepEqual(
    radarBriefCriteriaMatched({ brief: daRotina, text: "para pele oleosa comeco pela limpeza de manha" }),
    ["a ordem real dos passos"],
  );

  /*
   * A MESMA GUIA, SEM O ASSUNTO NA FRASE: nada. É a metade do portão que impede
   * "primeiro eu lavo a louça" de virar evidência de rotina de skincare.
   */
  assert.deepEqual(radarBriefCriteriaMatched({ brief: daRotina, text: "primeiro eu lavo a louca depois seco" }), []);

  /*
   * E O ENCHIMENTO DO CRITÉRIO NÃO É PISTA — §1.B.
   *
   * "quanto tempo cada parte leva" é DURAÇÃO. As palavras que sobram dela —
   * "cada", "parte" — não dizem nada: admiti-las fez "depende de cada casa"
   * contar como evidência de quanto tempo a rotina leva.
   */
  assert.deepEqual(radarBriefCriteriaMatched({ brief: daRotina, text: "na pele oleosa depende de cada casa e de cada parte" }), []);
  /* Já a duração de verdade, ao lado do assunto, conta. */
  assert.deepEqual(
    radarBriefCriteriaMatched({ brief: daRotina, text: "o produto na pele oleosa demora uns dois minutos" }),
    ["quanto tempo cada parte leva"],
  );

  /* Sem `whatToLookFor`, a guia cai na forma da pergunta — e não some. */
  const semGuiaDeclarada = radarBriefCriteria({ ...daRotina, whatToLookFor: [] });
  assert.equal(semGuiaDeclarada.length, 1);
  assert.ok(semGuiaDeclarada[0].cues.size > 0, "o portão continua existindo");
});

test("VÍDEOS 3.3 · cobrir mais critérios vence a vaga, e o objetivo audiovisual desempata", () => {
  /*
   * QUATRO PASSAGENS, TRÊS VAGAS — o ranking decide quem fica de fora.
   *
   * Provar ranking por `confidence` não prova nada: ela tem fórmula própria e
   * satura. O que se mede aqui é a SELEÇÃO, que é a decisão de verdade.
   *
   * §5.3 · A última passagem cobre DOIS critérios; as três primeiras cobrem um.
   * Ela está no fim da ordem de leitura, então só entra se cobrir mais valer
   * mais — que é exatamente a regra.
   */
  const maisCritérios = [fonte({
    videoSourceId: "f1",
    segments: transcrever([
      "na pele oleosa comeco pela agua", ...fiada("a"),
      "com pele oleosa lavo o rosto primeiro", ...fiada("b"),
      "para pele oleosa uso o tonico antes", ...fiada("c"),
      "para pele oleosa comeco pela limpeza", "depois aplico o gel matificante",
    ]),
  })];
  const { coverage } = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: maisCritérios });
  assert.equal(coverage[0].extracts.length, 3, "quatro candidatos, três vagas");
  const dois = coverage[0].extracts.filter(item => item.matchedCriteria.length >= 2);
  assert.ok(dois.length >= 1, "a passagem que cobre dois critérios ficou");
  assert.ok(
    coverage[0].extracts.some(item => /comeco pela limpeza/.test(item.originalText)),
    "e a última do material, que cobre dois, entrou apesar de vir por último",
  );

  /*
   * §1.C · E ENTRE PASSAGENS QUE COBREM O MESMO TANTO, vence a do tipo que a
   * pauta existe para mostrar. Esta existe porque "ver a execução ensina o que
   * o texto só descreve": a que MOSTRA a execução entra, e uma das três que
   * falam de relógio fica de fora — apesar de virem antes na ordem.
   */
  const empate = [fonte({
    videoSourceId: "f1",
    segments: transcrever([
      "na pele oleosa lavo e demora minutos", ...fiada("d"),
      "com pele oleosa uso e demora horas", ...fiada("e"),
      "para pele oleosa aplico e demora um dia", ...fiada("f"),
      "na pele oleosa primeiro aplico o gel",
    ]),
  })];
  const disputa = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: empate });
  assert.ok(disputa.candidatesFound >= disputa.coverage[0].extracts.length);
  assert.ok(disputa.coverage[0].extracts.length <= RADAR_MAX_EDITORIAL_EXTRACTS_PER_BRIEF);
  assert.ok(
    disputa.coverage[0].extracts.some(item => /primeiro aplico o gel/.test(item.originalText)),
    "a execução entra na frente do relógio nesta pauta",
  );

  /*
   * E OS PESOS SÃO DECLARADOS, não deduzidos do resultado.
   *
   * As duas comparações acima mostram o efeito, mas com quatro candidatos e
   * três vagas o efeito sobrevive a mudanças de peso — a diferença aparece
   * quando o material é mais disputado do que qualquer fixture razoável. O que
   * fica fixado aqui é a POLÍTICA de §5: cobrir critério é o que mais vale,
   * afinidade temática vem logo atrás, e o objetivo audiovisual só desempata.
   */
  /* As duas âncoras existem ANTES do corte: `indexOf` -1 recortaria o arquivo inteiro. */
  const fonteDoDominio = dominio();
  const inicioDaFormula = fonteDoDominio.indexOf("function pontuar(");
  const fimDaFormula = fonteDoDominio.indexOf("function selecionar(");
  assert.ok(inicioDaFormula > 0 && fimDaFormula > inicioDaFormula, "a fórmula tem começo e fim conhecidos");
  const formula = fonteDoDominio.slice(inicioDaFormula, fimDaFormula);
  assert.ok(formula.length > 200 && formula.length < 2_000, "e o recorte é a fórmula, não o arquivo");
  /*
   * VIDEOS_3.4 · a ordem dos pesos mudou junto com a autoridade: responder o
   * TÍTULO passou a valer mais do que qualquer critério isolado da guia.
   */
  assert.match(formula, /\+ 4\.0 \* \(input\.respondeAoTitulo \? 1 : 0\)/, "responder o título é o que mais pesa");
  assert.match(formula, /\+ 3\.0 \* teto\(input\.criterios\.length, 3\)/, "cobrir critério da guia vem logo atrás");
  assert.match(formula, /\+ 2\.0 \* teto\(input\.ancoras\.length, 3\)/);
  assert.match(formula, /\+ 1\.0 \* \(input\.naPreferencia \? 1 : 0\)/, "o objetivo audiovisual desempata, não decide");
  /*
   * §5 · E TODO TERMO TEM TETO. É isto que impede a passagem que repete o
   * assunto oito vezes de ganhar da que o explica uma vez: o que entra na conta
   * são listas de termos distintos, e cada uma para de crescer cedo.
   */
  for (const termo of ["ancoras", "frases", "criterios", "reforco"]) {
    assert.match(formula, new RegExp(`teto\\(input\\.${termo}\\.length, \\d\\)`), `${termo} entra com teto`);
  }
});

test("VÍDEOS 3.3 · o objetivo audiovisual entra como contexto, nunca como assunto", () => {
  /* §1.C · "ver a execução ensina o que o texto só descreve" pede demonstração. */
  assert.deepEqual(radarBriefAudiovisualPreference(PAUTAS_REAIS[0]), ["ORDER", "EXECUTION"]);
  assert.deepEqual(radarBriefAudiovisualPreference(PAUTAS_REAIS[1]), ["SIGNS", "LOCATION"]);
  assert.deepEqual(radarBriefAudiovisualPreference(PAUTAS_REAIS[2]), ["CAVEAT", "DISTINCTION", "EXAMPLE"]);

  /*
   * E ELE NÃO ABRE JANELA. Um trecho que fala de "execução" e "demonstração"
   * sem tocar o assunto da pauta continua fora — se o propósito criasse
   * correspondência, toda pauta de sequência casaria com qualquer tutorial.
   */
  const semAssunto = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["a execucao pratica ensina mais que a teoria", "vou demonstrar a sequencia agora"]),
  })];
  assert.equal(matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: semAssunto }).candidatesFound, 0);
});

test("VÍDEOS 3.3 · evidenceNeeded não cria assunto nem relação", () => {
  /*
   * §3 · `evidenceNeeded` conta PÁGINAS e CONSULTAS da investigação. Um vídeo
   * que fale em "página" e "consulta" casaria com toda pauta do sistema.
   */
  const termos = radarBriefMatchTerms(PAUTAS_REAIS[0], { briefs: PAUTAS_REAIS });
  for (const palavra of ["pagina", "paginas", "comparavel", "consultas", "tratam", "formulando"]) {
    assert.equal(termos.ancoras.has(palavra), false, `"${palavra}" é meta da investigação, não assunto`);
    assert.equal(termos.relacao.cues.has(palavra), false, `"${palavra}" também não é relação`);
  }

  const meta = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["essa pagina comparavel trata da necessidade", "foram quatro consultas formulando a pergunta"]),
  })];
  assert.equal(matchRadarVideoBriefs({ briefs: PAUTAS_REAIS, sources: meta }).candidatesFound, 0);
});

/* ==========  §4 · JANELAS  ======================================== */

test("VÍDEOS 3.3 · ocorrências vizinhas viram UM trecho, e os tempos são reais", () => {
  /*
   * A m2 abria uma janela por ocorrência: cinco menções na mesma passagem
   * viravam cinco trechos quase idênticos no banco.
   */
  const repetido = [fonte({
    videoSourceId: "f1",
    segments: transcrever([
      "quem tem pele oleosa sofre com isso",
      "a pele oleosa pede cuidado diferente",
      "e a oleosa brilha mais no calor",
      "por isso o brilho aparece rapido",
      "use o produto na zona T primeiro",
    ]),
  })];
  const { coverage } = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: repetido });
  const trechos = coverage[0].extracts;
  assert.equal(trechos.length, 1, "OVERLAPPING_EXTRACTS_MERGED = YES");

  /* Os índices são reais, contíguos, e os tempos saem deles. */
  const segmentos = repetido[0].segments;
  const indices = trechos[0].segmentIndexes;
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
  assert.ok(indices.every(indice => segmentos[indice]), "todo índice aponta para segmento existente");
  assert.equal(trechos[0].startMs, segmentos[indices[0]].startMs, "TIMESTAMPS_INVENTED = 0");
  assert.equal(trechos[0].endMs, segmentos[indices[indices.length - 1]].endMs);
  assert.equal(trechos[0].originalText, indices.map(indice => segmentos[indice].text).join(" "), "UNANCHORED_EXTRACTS = 0");
});

/* ==========  §5 e §6 · RANKING E SELEÇÃO EDITORIAL  =============== */

/**
 * Passagens DIFERENTES sobre o mesmo assunto, separadas por conversa fiada.
 *
 * A separação é proposital: com a janela de raio dois, duas ocorrências a menos
 * de seis segmentos uma da outra são a MESMA passagem e viram um trecho só.
 * Para provar seleção é preciso ter de fato várias passagens distintas.
 */
const PASSAGENS = [
  ["quem tem pele oleosa reclama do brilho", "entao use o produto na zona T primeiro"],
  ["a acne aparece mais em quem tem pele oleosa", "lave o rosto duas vezes ao dia"],
  ["o brilho volta rapido no meio da tarde", "aplique o hidratante leve depois da limpeza"],
  ["skincare para pele oleosa tem ordem certa", "comeca pela limpeza e termina no protetor"],
  ["a oleosa pede textura gel no produto", "passe uma camada fina pela manha"],
  ["controlar o brilho exige rotina diaria", "use o esfoliante so uma vez na semana"],
];

/**
 * A conversa fiada entre passagens — e ela precisa ser DIFERENTE a cada vez.
 *
 * A janela abre dois segmentos para cada lado e engole o enchimento vizinho.
 * Com o mesmo enchimento repetido, duas passagens distintas ficavam parecidas
 * pelas bordas e a regra de quase-duplicata as tratava como uma só — o teste
 * provaria o corte errado.
 */
const fiada = (marca: string) => [
  `assunto ${marca} totalmente distante disso`,
  `bloco ${marca} sem relacao alguma`,
  `intervalo ${marca} de silencio`,
  `pausa ${marca} para respirar`,
  `nota ${marca} irrelevante aqui`,
];

const espalhar = (passagens: string[][]) =>
  transcrever(passagens.flatMap((item, indice) => [...item, ...fiada(String(indice))]));

test("VÍDEOS 3.3 · no máximo três trechos por pauta, e repetir palavra não promove", () => {
  const resultado = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: [fonte({ videoSourceId: "f1", segments: espalhar(PASSAGENS) })] });
  assert.ok(resultado.candidatesFound > RADAR_MAX_EDITORIAL_EXTRACTS_PER_BRIEF, "o material sustentava mais");
  assert.equal(resultado.coverage[0].extracts.length, RADAR_MAX_EDITORIAL_EXTRACTS_PER_BRIEF, "MAX_EDITORIAL_EXTRACTS_PER_BRIEF = 3");
  assert.equal(RADAR_MAX_EDITORIAL_EXTRACTS_PER_BRIEF, 3);

  /*
   * §5 · REPETIÇÃO NÃO É DENSIDADE.
   *
   * A passagem que grita "oleosa" oito vezes não cobre mais assunto do que a
   * que diz uma vez e explica. Se a repetição pontuasse, a parte mais
   * repetitiva do vídeo venceria sempre a mais informativa.
   */
  const repetitiva = transcrever([
    "oleosa oleosa oleosa oleosa oleosa oleosa",
    "oleosa oleosa oleosa entao use isso",
    "vamos mudar de assunto por aqui",
    "mais um pouco de conversa solta",
    "nada a ver com o tema agora",
    "seguindo adiante sem assunto",
    "quem tem pele oleosa sente o brilho na testa",
    "e o jeito e usar o produto na zona T primeiro",
  ]);
  const comparacao = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: [fonte({ videoSourceId: "f1", segments: repetitiva })] });
  const escolhidos = comparacao.coverage[0].extracts;
  assert.ok(escolhidos.length >= 1);
  const melhor = [...escolhidos].sort((a, b) => b.confidence - a.confidence)[0];
  assert.match(melhor.originalText, /brilho/, "a passagem que cobre mais assunto vence a que repete um termo");
});

test("VÍDEOS 3.3 · entre qualidades parecidas, fontes diferentes na frente", () => {
  /*
   * TRÊS PASSAGENS NUM VÍDEO, UMA NOUTRO — e a do outro é um pouco pior.
   *
   * As três primeiras mostram a execução, que é o que esta pauta existe para
   * ver (§1.C), e por isso pontuam um pouco mais. A quarta cobre um critério
   * que NENHUMA delas cobre: os erros comuns.
   *
   * Sem o desconto, a ordenação dá as três vagas ao primeiro vídeo e a pauta
   * termina com 2 de 4 aspectos. Com ele, a quarta entra e a pauta chega a 3 de
   * 4 — é isto que a diversidade compra, e não simpatia por variedade.
   */
  const mostramAExecucao = [
    ["para pele oleosa comeco pela limpeza", "depois aplico gel matificante"],
    ["na pele oleosa primeiro vem tonico", "use hidratante bem leve"],
    ["com pele oleosa inicio pelo sabonete", "passo protetor solar fluido"],
  ];
  const mostraOErro = [["na pele oleosa o erro comum e lavar", "o rosto muitas vezes por dia"]];

  const duasFontes = [
    fonte({ videoSourceId: "aaa", segments: espalhar(mostramAExecucao) }),
    fonte({ videoSourceId: "bbb", segments: espalhar(mostraOErro) }),
  ];
  const { coverage, candidatesFound } = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: duasFontes });

  assert.equal(candidatesFound, 4, "as quatro passagens qualificam");
  assert.equal(coverage[0].extracts.length, 3);
  assert.deepEqual([...new Set(coverage[0].extracts.map(item => item.videoSourceId))].sort(), ["aaa", "bbb"]);
  assert.deepEqual([...coverage[0].usefulSourceIds].sort(), ["aaa", "bbb"]);
  /* E o que a segunda voz trouxe é um critério que a primeira não cobria. */
  assert.ok(coverage[0].matchedCriteria.includes("erros comuns durante a execução"));
  assert.equal(coverage[0].matchedCriteria.length, 3);
  assert.ok(RADAR_EXTRACT_DIVERSITY_DISCOUNT > 0, "o desconto é declarado, e é ele que abre a vaga");
});

test("VÍDEOS 3.3 · três trechos praticamente iguais não ocupam as três vagas", () => {
  /*
   * §6 · A MESMA FRASE REPETIDA NÃO É TRÊS EVIDÊNCIAS.
   *
   * Um palestrante que volta ao mesmo ponto três vezes produzia, na m2, três
   * linhas quase idênticas no banco — ocupando o lugar de outra coisa que o
   * vídeo dizia. A passagem diferente no fim é o que deveria estar lá.
   */
  const repetida = ["quem tem pele oleosa reclama do brilho", "use sabonete adequado primeiro"];
  const outra = ["pele oleosa acumula brilho rapido", "passe tonico adstringente pela manha"];
  const material = [fonte({ videoSourceId: "f1", segments: espalhar([repetida, repetida, repetida, outra]) })];

  const { coverage, candidatesFound } = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[0]], sources: material });
  assert.equal(candidatesFound, 4, "as quatro passagens qualificam");
  assert.equal(coverage[0].extracts.length, 2, "as três iguais valem por uma");
  assert.ok(coverage[0].extracts.some(item => /tonico adstringente/.test(item.originalText)), "e a passagem diferente entra");
});

/* ==========  §7 · O ESTADO NÃO É CONTAGEM  ======================== */

test("VÍDEOS 3.3 · quantidade de ocorrências não decide o estado", () => {
  /*
   * Muita menção, nenhuma resposta: continua PARTIAL. Na m2, dois trechos já
   * bastavam para sair de NOT_FOUND, e 509 não diziam mais do que dois.
   */
  const muitaMencao = transcrever(Array.from({ length: 6 }, () => [
    "a oleosidade aumenta e fica visivel no calor",
    "e incomoda bastante quem convive com isso",
    "vamos falar de outra coisa agora",
    "mudando de assunto completamente",
    "nada a ver com o tema",
    "seguindo em frente aqui",
    "conversa solta mais uma vez",
  ]).flat());
  const { coverage } = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[3]], sources: [fonte({ videoSourceId: "f1", segments: muitaMencao })] });

  assert.equal(coverage[0].state, "PARTIAL");
  assert.ok(coverage[0].extracts.length <= RADAR_MAX_EDITORIAL_EXTRACTS_PER_BRIEF);
  /*
   * §6 · SEIS PASSAGENS IDÊNTICAS NÃO COBREM MAIS DO QUE UMA.
   *
   * Esta pauta pede duas coisas — os sinais visíveis e onde eles aparecem. O
   * material repete a mesma observação seis vezes e nunca diz onde: o estado
   * é PARCIAL, e o que falta é nomeado pelo texto DA PAUTA.
   */
  assert.deepEqual(coverage[0].missingCriteria, ["onde eles aparecem"]);
  assert.match(coverage[0].reason, /1 de 2 aspecto\(s\) da guia encontrado\(s\), falta: onde eles aparecem\./);

  /* Cobrir a guia inteira é SUPPORTED — e um trecho só pode bastar. */
  const completa = transcrever([
    "o calor aumenta a oleosidade visivel do rosto",
    "e a marca aparece mais na regiao da testa",
  ]);
  const cobre = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[3]], sources: [fonte({ videoSourceId: "f1", segments: completa })] });
  assert.equal(cobre.coverage[0].state, "SUPPORTED");
  assert.deepEqual(cobre.coverage[0].missingCriteria, []);
  assert.equal(cobre.coverage[0].extracts.length, 1, "uma pauta pode terminar com um trecho só");
  assert.match(cobre.coverage[0].reason, /2 de 2 aspecto\(s\)/);
});

test("VÍDEOS 3.3 · a leitura de volta chega ao mesmo estado que a execução", () => {
  /*
   * O GET não tem transcript em mãos: ele lê os trechos gravados. Se o estado
   * dependesse do corpus, a tela mudaria de resposta depois do F5.
   */
  const material = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["quem tem pele oleosa sente o brilho", "entao use o produto na zona T primeiro", "a acne tambem melhora com isso"]),
  })];
  const executado = matchRadarVideoBriefs({ briefs: PAUTAS_REAIS, sources: material });
  assert.ok(executado.coverage.some(item => item.extracts.length), "houve o que gravar");

  /*
   * O QUE VOLTA DO BANCO NÃO TRAZ OS CRITÉRIOS — não existe coluna para eles.
   *
   * Esta é a forma EXATA em que `readRadarExtractRun` devolve um trecho:
   * `matchedCriteria` vazio. Se a leitura não reconstituísse a lista a partir
   * do texto e da pauta, o F5 apagaria os ✓ da tela e mandaria toda pauta para
   * NOT_FOUND — com os trechos gravados ali, intactos, ao lado.
   */
  const comoOBancoDevolve = executado.coverage
    .flatMap(item => item.extracts)
    .map(item => ({ ...item, matchedCriteria: [] as string[] }));
  const relido = radarCoverageFromExtracts({ briefs: PAUTAS_REAIS, extracts: comoOBancoDevolve });

  assert.deepEqual(
    relido.map(item => [item.videoBriefId, item.state, item.reason, item.matchedCriteria, item.missingCriteria]),
    executado.coverage.map(item => [item.videoBriefId, item.state, item.reason, item.matchedCriteria, item.missingCriteria]),
    "F5_PRESERVES = YES",
  );
  /* E cada trecho volta a declarar o que sustenta. */
  for (const pautaRelida of relido) {
    for (const trecho of pautaRelida.extracts) assert.ok(trecho.matchedCriteria.length > 0, "o trecho relido sabe o que cobre");
  }
});

/* ==========  §9 · A VERSÃO  ====================================== */

test("VÍDEOS 3.3 · m3 entra na impressão digital e supera a execução m2", () => {
  assert.equal(RADAR_VIDEO_MATCHER_VERSION, 4, "MATCHER_VERSION = 4");

  const material = [fonte({ videoSourceId: "f1", processingVersion: 1 })];
  assert.equal(radarExtractRunFingerprint(material), "m4:f1@v1");
  /*
   * A EXECUÇÃO m2 NÃO É APAGADA — ela é SUPERADA. A impressão digital antiga
   * ("m2:…") nunca mais é produzida, então o material idêntico deixa de
   * "reutilizar a existente" e nasce execução nova, que supera a anterior pelo
   * mecanismo que já existe.
   */
  assert.notEqual(radarExtractRunFingerprint(material), "m3:f1@v1", "OLD_M3_RUN_SUPERSEDED = YES");

  /* E o mesmo material, duas vezes, continua dando a mesma identidade. */
  assert.equal(radarExtractRunFingerprint(material), radarExtractRunFingerprint([{ ...material[0] }]), "SECOND_CLICK_REUSES_M4 = YES");
});

/* ==========  §10 e §11 · O QUE A TELA MOSTRA E O QUE ELA DIZ  ==== */

test("VÍDEOS 3.3 · a tela mostra evidência selecionada, e o transcript segue atrás do clique", () => {
  const texto = painel();

  /* §7 · a saída segue a pauta: o que foi encontrado, e o que ainda falta. */
  assert.match(texto, />Resposta encontrada para a pauta</);
  assert.match(texto, />Aspectos da guia encontrados</);
  assert.match(texto, />Ainda faltando</);
  assert.match(texto, /\{encontrados\.map\(criterio => <li[^>]*>✓ \{criterio\}<\/li>\)\}/);
  assert.match(texto, /\{faltantes\.map\(criterio => <li[^>]*>– \{criterio\}<\/li>\)\}/);

  /* §4 · a evidência é numerada: é seleção, não tudo que havia. */
  assert.match(texto, /Evidência \{posicao \+ 1\} — \{nomeDaFonte\.get\(trecho\.videoSourceId\)/);
  assert.match(texto, /\{tempoLegivel\(trecho\.startMs\)\}–\{tempoLegivel\(trecho\.endMs\)\}/);
  /* §3 · e cada trecho declara os critérios que sustenta. */
  assert.match(texto, /cobre: \$\{trecho\.matchedCriteria\.join\(" · "\)\}/);
  assert.match(texto, /trecho\.answersTitle \? "Responde o objetivo da pauta" : "Enriquece a resposta"/);

  /* O transcript inteiro continua atrás do disclosure, como estava. */
  assert.match(texto, /<summary[^>]*>Ver transcrição completa/);

  /*
   * §11 · A COPY QUE NEGAVA O CASAMENTO SAIU.
   *
   * Ela dizia "o casamento entre pauta e conteúdo… ainda não existe", impressa
   * logo acima do resultado do casamento.
   */
  assert.equal(/o casamento entre pauta e conteúdo, a tradução/i.test(texto), false, "OBSOLETE_COPY_REMOVED = YES");
  assert.equal(/ainda não existem — são gates posteriores/.test(texto), false);
  assert.match(texto, /O casamento usa as pautas da investigação para localizar e selecionar somente os trechos editorialmente relevantes/);

  /* E nada afirma tradução, que continua não existindo. */
  const visivel = texto.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/traduzido para|tradução automática|traduz os trechos/i.test(visivel), false, "nada promete tradução");
  assert.match(visivel, /não traduzido/, "a ausência de tradução continua declarada no trecho");
});

test("VÍDEOS 3.3 · a evidência numerada e o que falta chegam à tela", async () => {
  /*
   * PROVAR NO ARQUIVO NÃO É PROVAR NA TELA.
   *
   * Uma asserção sobre o JSX pode passar com o bloco inteiro atrás de uma
   * condição que nunca é verdadeira. Aqui a pauta é montada PARCIAL de verdade
   * e o que se lê é o texto renderizado.
   */
  const material = [fonte({
    videoSourceId: "f1",
    segments: transcrever(["a oleosidade aumenta e fica visivel no calor", "e incomoda bastante quem convive com isso"]),
  })];
  const { coverage } = matchRadarVideoBriefs({ briefs: [PAUTAS_REAIS[3]], sources: material });
  assert.equal(coverage[0].state, "PARTIAL", "a pauta está mesmo parcial");

  const tela = await montarRadar();
  const { RadarR3VideosPanel } = await import("../modules/radar/radar-r3-videos-panel.tsx");
  await tela.render(comProductShell(React.createElement(RadarR3VideosPanel, {
    articleId: "artigo-1",
    videoSources: {
      sources: [], texts: [],
      briefs: [{ briefId: PAUTAS_REAIS[3].briefId, topic: PAUTAS_REAIS[3].topic, narrativePurpose: "", whatToLookFor: [], priority: "MEDIUM", frozen: true }],
      briefsUnavailableReason: null, coverage, matching: false, investigationFinalized: true, frozenBriefCount: 1,
      loading: false, saving: false, extracting: null, lastBatch: null, error: null, readbackConfirmed: true,
    },
  } as never)));

  assert.equal(tela.get(`radar-videos-coverage-${PAUTAS_REAIS[3].briefId}`).textContent, "PARTIAL");

  /* §7 · o que foi encontrado, com as palavras da própria pauta. */
  assert.match(tela.get(`radar-videos-found-${PAUTAS_REAIS[3].briefId}`).textContent || "", /✓\s*os sinais visíveis/);
  /* §7 · o que falta, AO LADO da evidência — não no lugar dela. */
  assert.match(tela.get(`radar-videos-brief-gap-${PAUTAS_REAIS[3].briefId}`).textContent || "", /–\s*onde eles aparecem/);
  assert.match(tela.get(`radar-videos-brief-score-${PAUTAS_REAIS[3].briefId}`).textContent || "", /1 de 2 aspecto/);

  assert.match(tela.text(), /Evidência 1 —/, "a evidência é numerada na tela");
  assert.match(tela.text(), /Responde o objetivo da pauta/, "e diz o papel da evidência");
  assert.match(tela.text(), /a oleosidade aumenta e fica visivel no calor/, "e traz o texto original");

  tela.destroy();
});

test("VÍDEOS 3.3 · a rota grava só o que foi selecionado, e informa quantos candidatos havia", () => {
  const texto = rota();
  assert.match(texto, /const \{ coverage, skippedWithoutText, candidatesFound \} = matchRadarVideoBriefs/);
  assert.match(texto, /candidatesFound,/, "CANDIDATES_FOUND = informado");
  /* O que é gravado é o que a cobertura selecionou — nunca os candidatos. */
  assert.match(texto, /const extracts = coverage\.flatMap\(item => item\.extracts\);/);
  const codigo = texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal(/candidat[oe]s\)|extracts: candidat/i.test(codigo), false, "candidato nenhum chega à persistência");
});

/* ==========  O CONTROLE NEGATIVO CONTINUA VALENDO  =============== */

test("VÍDEOS 3.3 · notebook × skincare continua sem casar nada", () => {
  /*
   * O controle negativo da m2 passou, e a m3 não pode afrouxá-lo ao ficar mais
   * permissiva com janelas: vocabulário operacional em profusão, assunto zero.
   */
  const notebook = [fonte({
    videoSourceId: "nb",
    segments: transcrever([
      "o primeiro passo e abrir a tampa do notebook",
      "depois voce liga e espera o sistema",
      "esse tipo de maquina aquece bastante",
      "o erro comum e usar na cama fechando a saida de ar",
      "isso causa lentidao e piora com o tempo",
      "existem tres tipos de processador aqui",
    ]),
  })];
  const resultado = matchRadarVideoBriefs({ briefs: PAUTAS_REAIS, sources: notebook });

  assert.equal(resultado.candidatesFound, 0, "nem candidato");
  for (const pautaDaVez of resultado.coverage) assert.equal(pautaDaVez.state, "NOT_FOUND", `${pautaDaVez.videoBriefId} sem trecho`);
  assert.equal(resultado.coverage.flatMap(item => item.extracts).length, 0, "EXTRACTS_PERSISTED = 0");
});

test("VÍDEOS 3.3 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — ${tentativasDeRede.join(", ")}`);
});
