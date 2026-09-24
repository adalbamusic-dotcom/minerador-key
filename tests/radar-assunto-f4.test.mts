import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

import {
  RADAR_WRITER_MAY_NOT,
  RADAR_WRITER_MAY_NOT_SUBJECT,
  radarWriterMayNotFor,
  radarWriterMayNotWithSubject,
} from "../lib/redator/writer-handoff.ts";
import { runGuardian, type GuardianDocument } from "../lib/redator/guardian.ts";
import { WRITER_ARTICLE_DNA_FOUNDATION_FIELDS } from "../lib/redator/writer-evidence-catalog.ts";
import { buildRadarPortableExportRow } from "../lib/radar/portable-export.ts";
import { radarPortableEditorialOf, radarPortableFlatSections } from "../lib/radar/portable-read-model.ts";
import { RADAR_SUBJECT_MUST_COVER_REASON, RADAR_SUBJECT_NO_SIGNAL, radarSubjectTurnTitle } from "../lib/radar/declared-subject.ts";
import {
  RADAR_WRITING_EXPORT_COLUMNS,
  RADAR_WRITING_EXPORT_LIMITS,
  RADAR_WRITING_SUBJECT_H1_NO_SIGNAL,
  RADAR_WRITING_SUBJECT_WORKING_TITLE,
  buildRadarWritingExportArticle,
  type RadarWritingArticleContext,
  type RadarWritingExportRow,
} from "../lib/radar/portable-writing-export.ts";
import { radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import type { RadarEditorialArticleModel, RadarEditorialSubjectTurn } from "../lib/radar/editorial-article-model.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import {
  ARTIGO,
  EXPORTADO_EM,
  LEITURA_DAS_LENTES,
  PUBLICACAO_SEM_POLITICA,
  contextoDePesquisa,
  entradaAmazon,
  entradaGoogle,
  entradaGoogleSaude,
  entradaYoutube,
  montadasDoSilo,
  montadasDoSiloSaude,
  planoDoSilo,
  vistaDoGoogleSobre,
} from "./radar-portable-writing-fixtures.mts";

/*
 * ===== SDD do Assunto, F4 · Redator e export =====
 *
 * F4.1 fundamentos e writerMayNot; F4.2 guardião (avisa, não bloqueia);
 * F4.3 CSV "Para escrever" (P9). Sem Assunto, tudo byte a byte igual.
 * Fixtures com `subject`: nenhum artigo real tem Assunto ainda.
 *
 * PROVIDER_CALLS = 0: a rede é recusada abaixo.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const sha = (texto: string) => createHash("sha256").update(texto).digest("hex");

const CONTEXTO: RadarWritingArticleContext = { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null };

type Assunto = { phrase: string; note: string | null; destinationUrl: string | null };

const CONSULTA: Assunto = {
  phrase: "Consulta dermatológica online",
  note: "A marca atende por teleconsulta.",
  destinationUrl: "https://careglow.com.br/consulta-online?utm_source=newsletter",
};
const ORDEM: Assunto = { phrase: "Ordem dos ácidos no rosto", note: null, destinationUrl: null };

function contextoCom(assunto: Assunto): RadarArticleResearchContext {
  const base = contextoDePesquisa();
  return { ...base, article: { ...base.article, subject: { ...assunto } } } as RadarArticleResearchContext;
}

function entradaCom(assunto: Assunto, ajustar?: (turn: RadarEditorialSubjectTurn) => RadarEditorialSubjectTurn): RadarPortableExportInput {
  const contexto = contextoCom(assunto);
  const vista = vistaDoGoogleSobre(contexto);
  const modelo = vista.articleModel as RadarEditorialArticleModel;
  assert.ok(modelo.declaredSubject, "a F3 monta a virada no artigo-modelo");
  const articleModel = ajustar ? { ...modelo, declaredSubject: ajustar(modelo.declaredSubject) } : modelo;
  return entradaGoogle({ articleModel, googleObserved: vista.observed, researchContext: contexto });
}

const linha = (entrada: RadarPortableExportInput): RadarWritingExportRow => buildRadarWritingExportArticle(entrada, CONTEXTO).row;
const linhasDe = (celula: string) => celula.split("\n");

function dentroDosLimites(row: RadarWritingExportRow) {
  for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) {
    const limite = coluna === "estrutura" ? RADAR_WRITING_EXPORT_LIMITS.structureChars : RADAR_WRITING_EXPORT_LIMITS.cellChars;
    assert.ok(row[coluna].length <= limite, `${coluna}: ${row[coluna].length} > ${limite}`);
  }
  const total = RADAR_WRITING_EXPORT_COLUMNS.reduce((soma, coluna) => soma + row[coluna].length, 0);
  assert.ok(total <= RADAR_WRITING_EXPORT_LIMITS.articleChars, `artigo: ${total}`);
}

/* ============================ sem Assunto ============================ */

const SNAPSHOT = {
  silo: { sha: "7cf012e0982db8f717c248bbbc928adf3fec32b6be99712fd24cddc3ba327a24", len: 17024 },
  saude: { sha: "795bc3856be698a7f6bfefdb31f0fb68c3945714f000dbbb34129b8526209016", len: 21180 },
  artigos: {
    google: "095e0b55626c737aac16acf21cb56760cd9cb632572adc6ed44aba0215ee93be",
    amazon: "13aaa813adb1fee8a2024b73378acc29e44f2040ba38c6d80a566652c4548ccf",
    youtube: "0b0118248360fabc79e06be63916b91bd3f6aadd0c6b99fb06d3c4baabd5137a",
    saude: "f982919fa98efd3b1fbf56e2ad1c6371566d997f3147c26c087ac1299a967c5d",
  },
};

test("F4.4 · sem Assunto, as 13 colunas são byte a byte as do snapshot de antes da F4", () => {
  const silo = radarPortableWritingExport({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: planoDoSilo(), today: EXPORTADO_EM });
  assert.equal(silo.files?.length, 1);
  assert.equal(silo.files![0].csv.length, SNAPSHOT.silo.len);
  assert.equal(sha(silo.files![0].csv), SNAPSHOT.silo.sha, "o CSV por silo mudou sem Assunto");

  const saude = radarPortableWritingExport({
    articles: montadasDoSiloSaude(), lenses: LEITURA_DAS_LENTES, plan: planoDoSilo(), today: EXPORTADO_EM,
    publications: new Map([[ARTIGO, PUBLICACAO_SEM_POLITICA]]),
  });
  assert.equal(saude.files![0].csv.length, SNAPSHOT.saude.len);
  assert.equal(sha(saude.files![0].csv), SNAPSHOT.saude.sha, "o CSV do silo de saúde mudou sem Assunto");

  const artigos: Record<keyof typeof SNAPSHOT.artigos, RadarPortableExportInput> = {
    google: entradaGoogle(), amazon: entradaAmazon(true), youtube: entradaYoutube(), saude: entradaGoogleSaude(),
  };
  for (const [nome, entrada] of Object.entries(artigos) as Array<[keyof typeof SNAPSHOT.artigos, RadarPortableExportInput]>) {
    assert.equal(sha(JSON.stringify(buildRadarWritingExportArticle(entrada, CONTEXTO))), SNAPSHOT.artigos[nome], `${nome} mudou sem Assunto`);
  }
});

test("F4.4 · J: o modo técnico não ganha as linhas do Assunto", () => {
  const tecnico = JSON.stringify(buildRadarPortableExportRow(entradaCom(CONSULTA)));
  for (const marca of ["Tronco (Assunto)", "Assunto (tronco)", "Direção do H1", "Assunto em H2/H3", "Assunto no H1", "Virada: ", "Título de trabalho do Radar"]) {
    assert.equal(tecnico.includes(marca), false, marca);
  }
});

/* ============================ com Assunto ============================ */

test("F4.3 · artigo: \"Assunto (tronco)\" logo abaixo da keyword principal, e o Assunto entre o que não se altera", () => {
  const artigo = linhasDe(linha(entradaCom(CONSULTA)).artigo);
  const principal = artigo.findIndex(item => item.startsWith("Keyword principal: "));
  assert.equal(artigo[principal], "Keyword principal: skincare facial");
  assert.equal(artigo[principal + 1], "Assunto (tronco): Consulta dermatológica online");
  const naoAltere = artigo.find(item => item.startsWith("Não altere: ")) || "";
  assert.match(naoAltere, /a keyword principal; o papel no Silo; .*; o Assunto declarado \(não troque nem remova\)\.$/);

  const sem = linhasDe(linha(entradaGoogle()).artigo);
  assert.deepEqual(artigo.filter(item => !item.startsWith("Assunto (tronco): ") && !item.startsWith("Não altere: ")), sem.filter(item => !item.startsWith("Não altere: ")),
    "o resto da coluna fica como era");
});

test("F4.3 · promessa_e_leitor: tronco e virada ANTES da abertura; o lugar é o mesmo da estrutura; a chamada observada fica", () => {
  const entrada = entradaCom(CONSULTA);
  assert.equal(entrada.articleModel?.declaredSubject?.turnSection.placement, "COVERAGE_POINT", "o fixture deixa a virada como ponto a cobrir");
  const promessa = linhasDe(linha(entrada).promessa_e_leitor);
  const tronco = promessa.findIndex(item => item.startsWith("Tronco (Assunto): "));
  const abertura = promessa.findIndex(item => item.startsWith("Abertura: "));
  assert.ok(tronco > 0 && abertura === tronco + 2, "tronco e virada, nessa ordem, logo antes da abertura");
  assert.equal(promessa[tronco], "Tronco (Assunto): Consulta dermatológica online — A marca atende por teleconsulta.");
  assert.equal(promessa[tronco + 1],
    "Virada: como ponto a cobrir em \"Como montar a rotina de skincare facial no dia a dia?\" (lugar deixado pelo Radar sem sinal na SERP; quem redige pode mudar), levar o leitor de skincare facial a Consulta dermatológica online; destino: https://careglow.com.br/consulta-online.");
  const estrutura = linhasDe(linha(entrada).estrutura);
  assert.ok(estrutura.includes("## Como montar a rotina de skincare facial no dia a dia?"), "o anfitrião nomeado é o da estrutura");

  const destino = promessa.findIndex(item => item.startsWith("Destino da chamada: "));
  const chamada = promessa.findIndex(item => item.startsWith("Chamada final: "));
  assert.ok(chamada > 0 && destino === chamada + 1, "o destino fica logo abaixo da chamada final observada");
  assert.equal(promessa[destino], "Destino da chamada: Levar o leitor a https://careglow.com.br/consulta-online.");

  const sem = linhasDe(linha(entradaGoogle()).promessa_e_leitor);
  assert.deepEqual(promessa.filter((_, indice) => indice !== tronco && indice !== tronco + 1 && indice !== destino), sem,
    "o resto da célula, inclusive a chamada final observada, fica igual");
  assert.ok(sem.some(item => item.startsWith("Chamada final: ")));
  assert.equal(sem.some(item => item.startsWith("Destino da chamada")), false);
});

test("F4.3 · promessa_e_leitor: com bloco observado que já trata o Assunto, a virada é nele, nunca \"sem sinal\"", () => {
  const rotina: Assunto = { phrase: "Rotina de skincare facial", note: null, destinationUrl: null };
  const entrada = entradaCom(rotina);
  const turn = entrada.articleModel?.declaredSubject;
  assert.ok(turn);
  assert.equal(turn.turnSection.source, "OBSERVED_GROUP");
  assert.equal(turn.suggestedPosition, null);
  const contagem = `${turn.turnSection.pages} de ${turn.turnSection.sampleSize} página(s)`;
  assert.equal(turn.suggestedPositionLabel, `Na seção "${turn.turnSection.heading}": é o bloco da amostra que já trata o Assunto (em ${contagem}).`);
  assert.notEqual(turn.suggestedPositionLabel, RADAR_SUBJECT_NO_SIGNAL);

  const promessa = linhasDe(linha(entrada).promessa_e_leitor);
  const virada = promessa.find(item => item.startsWith("Virada: ")) || "";
  assert.equal(virada,
    `Virada: na seção "${turn.turnSection.heading}" (a amostra já trata o Assunto em ${contagem}), levar o leitor de skincare facial a Rotina de skincare facial.`);
  assert.equal(virada.includes("sem sinal"), false);
  assert.equal(promessa.some(item => item.startsWith("Destino da chamada")), false, "sem destino, sem linha de destino");
});

test("F4.3 · promessa_e_leitor: com posição sugerida pelo Radar, \"depois de <seção>\"; sem destino, sem \"destino:\"", () => {
  const promessa = linhasDe(linha(entradaCom(ORDEM)).promessa_e_leitor);
  assert.ok(promessa.includes("Tronco (Assunto): Ordem dos ácidos no rosto."));
  assert.ok(promessa.includes("Virada: depois de \"Afinal, qual a ordem dos produtos?\", levar o leitor de skincare facial a Ordem dos ácidos no rosto."));
  assert.equal(promessa.some(item => item.includes("destino:")), false);
});

test("F4.3 · titulo_e_seo: a direção do H1 segue a sugestão do Radar, e a principal continua dona do H1", () => {
  const titulo = (entrada: RadarPortableExportInput) => linhasDe(linha(entrada).titulo_e_seo);
  const sem = titulo(entradaGoogle());

  const zeroDeN = entradaCom(CONSULTA).articleModel?.declaredSubject;
  assert.ok(zeroDeN?.alert, "0 de N páginas: o alerta está ligado");
  assert.equal(zeroDeN?.h1Complement.titlePages, 0);
  assert.equal(zeroDeN?.h1Complement.headingPages, 0);
  assert.equal(zeroDeN?.h1Complement.label, RADAR_SUBJECT_NO_SIGNAL, "o modelo e o CSV dizem o mesmo: sem sinal");
  const semSinal = titulo(entradaCom(CONSULTA));
  assert.ok(semSinal.includes(RADAR_WRITING_SUBJECT_H1_NO_SIGNAL), "0 de N é sem sinal na SERP");
  assert.equal(semSinal.some(item => item.startsWith("Assunto em H2/H3")), false, "0 de N nunca vira \"Assunto em H2/H3\"");
  assert.deepEqual(semSinal.filter(item => item !== RADAR_WRITING_SUBJECT_H1_NO_SIGNAL), sem);

  assert.ok((entradaCom(ORDEM).articleModel?.declaredSubject?.h1Complement.headingPages ?? 0) > 0, "a amostra trata o Assunto em H2/H3");
  const emH2 = titulo(entradaCom(ORDEM));
  assert.ok(emH2.includes("Assunto em H2/H3 — o H1 é da principal."));
  assert.deepEqual(emH2.filter(item => item !== "Assunto em H2/H3 — o H1 é da principal."), sem);

  const comComplemento = titulo(entradaCom(CONSULTA, turn => ({
    ...turn, h1Complement: { suggested: true, complement: turn.phrase, titlePages: 7, headingPages: 3, sampleSize: 12, label: "rótulo do Radar" },
  })));
  assert.ok(comComplemento.includes("Direção do H1: skincare facial + complemento \"Consulta dermatológica online\" (sugestão do Radar; a decisão é de quem redige)."));
  assert.equal(comComplemento.some(item => item.startsWith("Assunto em H2/H3")), false);

  const semLeitura = titulo(entradaCom(CONSULTA, turn => ({
    ...turn, h1Complement: { suggested: false, complement: null, titlePages: null, headingPages: null, sampleSize: 0, label: RADAR_SUBJECT_NO_SIGNAL },
  })));
  assert.ok(semLeitura.includes(RADAR_WRITING_SUBJECT_H1_NO_SIGNAL));
  assert.equal(semLeitura.some(item => item.startsWith("Assunto em H2/H3")), false, "sem sinal, nunca \"Assunto em H2/H3\"");
});

test("F4.3 · estrutura: a seção da virada vem do modelo do Radar, marcada pelo motivo do Assunto; nenhuma linha inventada", () => {
  const motivo = `- Obrigatória pelo ArticleDNA: ${RADAR_SUBJECT_MUST_COVER_REASON.replace(/\.$/, "")}.`;
  for (const assunto of [CONSULTA, ORDEM]) {
    const entrada = entradaCom(assunto);
    const estrutura = linhasDe(linha(entrada).estrutura);
    assert.ok(estrutura.includes(motivo), `${assunto.phrase}: a marcação traz o motivo próprio`);
    assert.equal(estrutura.some(item => /^(Tronco|Virada:|Assunto)/.test(item)), false, "o export não escreve linha própria na estrutura");

    const editorial = radarPortableEditorialOf({ profile: "GOOGLE", principalKeyword: "skincare facial", articleModel: entrada.articleModel });
    const doModelo = new Set(radarPortableFlatSections(editorial.sections).map(secao => secao.heading));
    for (const cabecalho of estrutura.filter(item => /^#{2,3} /.test(item)).map(item => item.replace(/^#+ /, ""))) {
      assert.ok(doModelo.has(cabecalho), `"${cabecalho}" não veio do modelo do Radar`);
    }
  }

  const h3 = linhasDe(linha(entradaCom(ORDEM)).estrutura);
  const virada = h3.indexOf(`### ${radarSubjectTurnTitle(ORDEM.phrase)}`);
  assert.ok(virada > 0, "no H3, a seção sintética aparece como veio do modelo");
  assert.equal(h3[virada + 1], RADAR_WRITING_SUBJECT_WORKING_TITLE, "o nome da seção no Radar é título de trabalho, não de publicação");
  assert.equal(h3.slice(virada + 1, virada + 5).includes(motivo), true);
  assert.equal(h3.filter(item => item === RADAR_WRITING_SUBJECT_WORKING_TITLE).length, 1, "só a seção sintética leva a marca");

  const ponto = linhasDe(linha(entradaCom(CONSULTA)).estrutura);
  const cobrir = ponto.find(item => item.startsWith("- Cobrir: virada para "));
  assert.equal(cobrir, "- Cobrir: virada para Consulta dermatológica online · Consulta dermatológica online: A marca atende por teleconsulta.",
    "como ponto a cobrir, a virada vai à frente dos pontos do anfitrião");

  const sem = linha(entradaGoogle()).estrutura;
  assert.equal(sem.includes(RADAR_SUBJECT_MUST_COVER_REASON), false);
  assert.equal(sem.includes(RADAR_WRITING_SUBJECT_WORKING_TITLE), false);
});

test("F4.3 · limites de caracteres respeitados com Assunto, nota no teto e destino longo", () => {
  const longo: Assunto = {
    phrase: "Consulta dermatológica online para pele oleosa com acne",
    note: "n".repeat(280),
    destinationUrl: `https://careglow.com.br/${"consulta-online/".repeat(10)}agendar`,
  };
  for (const entrada of [entradaCom(longo), entradaCom(CONSULTA), entradaCom(ORDEM)]) dentroDosLimites(linha(entrada));
  const promessa = linha(entradaCom(longo)).promessa_e_leitor;
  assert.ok(promessa.includes(`— ${"n".repeat(280)}.`), "a nota sai inteira");
  assert.ok(promessa.includes(`destino: ${longo.destinationUrl}.`));
});

test("F4.3 · Assunto só no contexto (sem artigo-modelo): tronco, virada sem posição e H1 devolvido a quem redige", () => {
  const contexto = contextoCom(CONSULTA);
  const row = linha(entradaGoogle({ researchContext: contexto }));
  assert.ok(linhasDe(row.artigo).includes("Assunto (tronco): Consulta dermatológica online"));
  assert.ok(linhasDe(row.promessa_e_leitor).some(item => item.startsWith("Virada: onde quem redige decidir (sem sinal na SERP)")));
  assert.ok(linhasDe(row.titulo_e_seo).includes(RADAR_WRITING_SUBJECT_H1_NO_SIGNAL));
  assert.ok(linhasDe(row.promessa_e_leitor).includes("Destino da chamada: Levar o leitor a https://careglow.com.br/consulta-online."),
    "sem artigo-modelo, a direção para o destino sai do contexto");
});

/* ============================ F4.1 ============================ */

test("F4.1 · writerMayNot: sem Assunto, a mesma lista e o mesmo hash; com Assunto, a proibição dele no fim", () => {
  assert.equal(radarWriterMayNotFor(null), RADAR_WRITER_MAY_NOT, "a mesma referência");
  assert.equal(radarWriterMayNotFor(undefined), RADAR_WRITER_MAY_NOT);
  assert.equal(radarWriterMayNotFor({ phrase: "  " }), RADAR_WRITER_MAY_NOT, "frase vazia não é Assunto");
  assert.equal(sha(JSON.stringify(radarWriterMayNotFor(null))), "f5f59f87a1a5f6b629001645071379ab22d8a1a3bc50d648008c4e91578bf101", "o hash de antes da F4");
  assert.equal(RADAR_WRITER_MAY_NOT.length, 7);

  assert.deepEqual(radarWriterMayNotFor({ phrase: "Consulta dermatológica online" }), [...RADAR_WRITER_MAY_NOT, "trocar ou remover o Assunto declarado"]);
  assert.equal(RADAR_WRITER_MAY_NOT_SUBJECT, "trocar ou remover o Assunto declarado");

  const gravada = ["Trocar a keyword principal."];
  assert.equal(radarWriterMayNotWithSubject(gravada, null), gravada, "sem Assunto, a lista gravada volta sem tocar");
  assert.deepEqual(radarWriterMayNotWithSubject(gravada, { phrase: "X" }), ["Trocar a keyword principal.", RADAR_WRITER_MAY_NOT_SUBJECT]);
  const jaTem = [...RADAR_WRITER_MAY_NOT, RADAR_WRITER_MAY_NOT_SUBJECT];
  assert.equal(radarWriterMayNotWithSubject(jaTem, { phrase: "X" }), jaTem, "não duplica");
});

test("F4.1 · o subject entra na projeção dos fundamentos, uma vez", () => {
  assert.equal(WRITER_ARTICLE_DNA_FOUNDATION_FIELDS.filter(campo => campo === "subject").length, 1);
  assert.equal(WRITER_ARTICLE_DNA_FOUNDATION_FIELDS.length, 18);
});

/* ============================ F4.2 ============================ */

function documento(blocos: Array<Record<string, unknown>>): GuardianDocument {
  return {
    id: "writer:doc-assunto",
    blocks: [
      { id: "h1", type: "heading", level: 1, text: "Skincare facial: a rotina completa" },
      { id: "p0", type: "paragraph", text: "Skincare facial é a rotina de cuidados com o rosto." },
      { id: "h2a", type: "heading", level: 2, text: "Qual a ordem dos produtos?" },
      { id: "p1", type: "paragraph", text: "Limpeza, tratamento e hidratação, nessa ordem." },
      ...blocos,
    ],
    metadata: { slug: "skincare-facial", principalKeyword: "skincare facial", metaTitle: "Skincare facial", metaDescription: "Rotina simples." },
  } as unknown as GuardianDocument;
}

const doAssunto = (relatorio: ReturnType<typeof runGuardian>) =>
  relatorio.findings.filter(item => /Assunto/.test(item.message));

test("F4.2 · guardião: sem Assunto, nada muda", () => {
  const doc = documento([]);
  const base = runGuardian(doc, "hash");
  assert.deepEqual(runGuardian(doc, "hash", { subject: null }).findings, base.findings);
  assert.deepEqual(runGuardian(doc, "hash", {}).findings, base.findings);
  assert.equal(doAssunto(base).length, 0);
});

test("F4.2 · guardião: sem a frase e sem o link, AVISA duas vezes e não bloqueia", () => {
  const doc = documento([]);
  const base = runGuardian(doc, "hash");
  const relatorio = runGuardian(doc, "hash", { subject: { phrase: CONSULTA.phrase, destinationUrl: "https://careglow.com.br/consulta-online" } });
  const avisos = doAssunto(relatorio);
  assert.equal(avisos.length, 2);
  assert.ok(avisos.every(item => item.severity === "warning"), "aviso, não bloqueio");
  assert.deepEqual(avisos.map(item => item.category).sort(), ["coverage", "cta"]);
  assert.equal(relatorio.blockingCount, base.blockingCount);
  assert.notEqual(relatorio.status, "blocked");
  assert.equal(relatorio.warningCount, base.warningCount + 2);
});

test("F4.2 · guardião: frase num H2/H3 ou termos num parágrafo, e link para o destino, calam os avisos", () => {
  const subject = { phrase: CONSULTA.phrase, destinationUrl: "https://careglow.com.br/consulta-online" };
  const noH3 = documento([
    { id: "h3", type: "heading", level: 3, text: "Quando a consulta dermatológica online resolve" },
    { id: "p2", type: "paragraph", text: "Agende em [nossa página](https://www.careglow.com.br/consulta-online/)." },
  ]);
  assert.equal(doAssunto(runGuardian(noH3, "hash", { subject })).length, 0);

  const termos = documento([
    { id: "p2", type: "paragraph", text: "Uma consulta com dermatologista, online e sem fila, ajuda — a dermatológica também." },
    { id: "fonte", type: "external_source", sourceId: "s1", claim: "Agenda", url: "https://careglow.com.br/consulta-online" },
  ]);
  assert.equal(doAssunto(runGuardian(termos, "hash", { subject })).length, 0);

  const soNoH1 = documento([]);
  soNoH1.blocks[0] = { id: "h1", type: "heading", level: 1, text: "Consulta dermatológica online" } as GuardianDocument["blocks"][number];
  const avisos = doAssunto(runGuardian(soNoH1, "hash", { subject: { phrase: CONSULTA.phrase, destinationUrl: null } }));
  assert.equal(avisos.length, 1, "H1 não conta: a conferência é H2/H3 ou parágrafo; sem destino, sem aviso de link");
  assert.equal(avisos[0].category, "coverage");

  const outroLink = documento([
    { id: "p2", type: "paragraph", text: "Consulta dermatológica online em https://careglow.com.br/outra-pagina." },
  ]);
  const soLink = doAssunto(runGuardian(outroLink, "hash", { subject }));
  assert.deepEqual(soLink.map(item => item.category), ["cta"], "link para outro endereço não é o destino");
});

test("PROVIDER_CALLS_IN_TESTS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
