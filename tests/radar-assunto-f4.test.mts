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
  radarWritingCellLimit,
  RADAR_WRITING_SUBJECT_H1_NO_SIGNAL,
  RADAR_WRITING_SUBJECT_WORKING_TITLE,
  buildRadarWritingExportArticle,
  radarWritingStripHeadingTemplate,
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
import { buildRadarArticleBlueprintBrief, radarArticleBlueprintPrompt } from "../lib/radar/article-blueprint.ts";
import { comPlanta, comPlantas } from "./radar-piloto-planta-fixtures-2026-10-09.mts";

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

/*
 * 2026-10-09 · regra do dono: o CSV "Para escrever" sai só com o artigo-modelo
 * concluído (a planta que a IA organizaria sobre o pacote, montada pela
 * bancada). As linhas do Assunto que a coluna promessa e o título legados
 * escreviam (tronco, virada, direção do H1) viraram matéria-prima do GERADOR:
 * elas vão ao pedido do artigo-modelo (`pedidoDe`), e a coluna artigo diz o
 * Assunto e o destino da virada.
 */
const linha = (entrada: RadarPortableExportInput): RadarWritingExportRow => buildRadarWritingExportArticle(entrada, comPlanta(entrada, CONTEXTO)).row;
const pedidoDe = (entrada: RadarPortableExportInput) => {
  const brief = buildRadarArticleBlueprintBrief({ entrada, silo: null, articleId: ARTIGO, publication: null });
  return { brief, user: radarArticleBlueprintPrompt(brief).user.split("\n") };
};
const linhasDe = (celula: string) => celula.split("\n");
const tudoDe = (row: RadarWritingExportRow) => RADAR_WRITING_EXPORT_COLUMNS.map(coluna => row[coluna]).join("\n");

function dentroDosLimites(row: RadarWritingExportRow) {
  for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) {
    const limite = radarWritingCellLimit(coluna);
    assert.ok(row[coluna].length <= limite, `${coluna}: ${row[coluna].length} > ${limite}`);
  }
  const total = RADAR_WRITING_EXPORT_COLUMNS.reduce((soma, coluna) => soma + row[coluna].length, 0);
  assert.ok(total <= RADAR_WRITING_EXPORT_LIMITS.articleChars, `artigo: ${total}`);
}

/* ============================ sem Assunto ============================ */

/*
 * 2026-10-02 · snapshot renovado: a única diferença conferida linha a linha é a
 * URL limpa de cada orgânico em serp_resumida (antes só o domínio). Amazon e
 * YouTube, sem orgânicos, ficaram idênticos.
 *
 * 2026-10-02 · snapshot renovado de novo (frente B, coerência do CSV para
 * qualquer tipo de página). Conferido linha a linha contra a saída anterior;
 * mudou SÓ o pretendido, e nada do Assunto:
 *   - regra geral 2 e, no publicado, coluna artigo e prompt: a MESMA frase do
 *     FAQ legado (`RADAR_WRITING_LEGACY_FAQ`);
 *   - serp_resumida: o sistema da coleta principal ("desktop · Windows"), a
 *     lista das páginas comparáveis que embasaram as medidas e, com lentes, a
 *     configuração de cada lente (rótulo, observada em / sem observação);
 *   - promessa_e_leitor do silo: "(sem link aprovado no grafo: …)" ao lado do
 *     próximo artigo e da SiloPage quando o plano de links não os alcança;
 *   - plano_visual do Suporte comercial (uma seção só): "uma capa e 2
 *     respiro(s)", com o respiro 2 declarado para a estrutura final.
 * YouTube (linha só de identidade) ficou idêntico.
 */
/*
 * 2026-10-02 · D10 · renovado: a única diferença é a frase dos prompts de imagem
 * ("com artigo-modelo aprovado no Radar (feito a partir da SERP)" → "com
 * artigo-modelo da SERP organizado no Radar"); conferido revertendo só essa
 * frase, com o qual o snapshot anterior volta a bater.
 */
/*
 * 2026-10-08 · renovado (Grupo C da rodada dos entregáveis). Conferido linha a
 * linha contra a saída anterior (cópia de HEAD no scratchpad, carregador de
 * redirecionamento): as 26 linhas que mudaram são só as pretendidas —
 *   - C8: a regra geral 4 e o movimento "Experiência" sem o marcador
 *     "[RELATO DA MARCA — preencher]" (sem relato e sem inventá-lo);
 *   - C9: o destino planejado ou não resolvido dito como instrução concluída e
 *     condicional ("o link entra com a URL final quando o destino estiver no
 *     ar…; senão, a âncora fica como texto simples"), sem "marque a âncora" nem
 *     "use o slug planejado".
 * Amazon e YouTube ficaram idênticos.
 */
/*
 * 2026-10-08 · renovado de novo (correção da revisão, D10 nas esperas antigas).
 * Prova: as cópias com SÓ estas frases revertidas (carregador de
 * redirecionamento, no scratchpad) devolvem exatamente o snapshot anterior —
 * silo, silo de saúde e as quatro linhas. As frases:
 *   - "SEO title: a definir; …" e "Meta description: a definir; …" → "escreva
 *     com cerca de …";
 *   - "Citadas pelo mercado, não verificadas (conferir antes de citar)" → "sem
 *     verificação no pacote (só como referência delimitada, nunca como fonte da
 *     afirmação)";
 *   - especialista: "Aplicar em: a definir" → "onde couber no texto, como
 *     orientação"; "conferir antes de usar; sem ponto de aplicação definido" →
 *     "use só como orientação geral, sem apresentá-la como resposta a essa
 *     pergunta; sem ponto de aplicação no pacote: entra onde couber, como
 *     orientação".
 * YouTube (linha só de identidade) ficou idêntico.
 */
/*
 * 2026-10-08 · renovado (P0-B e P1 da rodada dos 8 CSVs do Silo "Leads sem
 * Tráfego Pago"). Prova: as cópias de HEAD de portable-writing-export,
 * editorial-article-model e portable-writing-batch (carregador de
 * redirecionamento, no scratchpad) devolvem exatamente o snapshot anterior; a
 * diferença conferida linha a linha (silo 26, saúde 30, Google 22, saúde 26
 * linhas) é só a pretendida:
 *   - estrutura: o título de cada seção é a pergunta do leitor, sem o molde
 *     ("## Como montar a rotina de skincare facial?", "## Qual a ordem dos
 *     produtos?", "## Skincare facial para pele oleosa", "## O que causa acne?"),
 *     sem a linha "Responde:" repetida, com a linha "Títulos de trabalho: …";
 *   - fechamento e chamada do modelo sem o "no dia a dia";
 *   - promessa_e_leitor: "Próximo passo do leitor" (próximo artigo OU SiloPage,
 *     com "peça ao Arquiteto") → "Continuação (não é uma segunda chamada)", com
 *     o L aprovado ou "cite sem link";
 *   - plano visual e links: a seção nomeada pelo mesmo título da estrutura.
 * Amazon e YouTube ficaram idênticos.
 */
/*
 * 2026-10-09 · renovado (coerência final dos 8 CSVs: defeitos 2 e 10). Prova:
 * a cópia com SÓ portable-writing-export e portable-writing-batch de HEAD (no
 * scratchpad, com o carregador de pacotes do repositório) devolve exatamente o
 * snapshot anterior (os seis hashes); a diferença conferida linha a linha
 * (silo 10 linhas, saúde 10) é só a pretendida:
 *   - a "Continuação (não é uma segunda chamada): no fechamento…" sai da coluna
 *     promessa_e_leitor e vira "- Leitura seguinte (opcional, não é uma
 *     chamada): …" no corpo da seção dela, na coluna estrutura (defeito 10);
 *   - a base única tem nome: "Páginas comparáveis lidas pela investigação (a
 *     base das medidas e das contagens deste arquivo: 12 páginas comparáveis, de
 *     12 sites)" e "(…; base: 12 páginas comparáveis, de 12 sites)" na referência
 *     da SERP (defeito 2).
 * Amazon e YouTube ficaram idênticos.
 */
/*
 * 2026-10-09 · renovado (regra do dono: o CSV "Para escrever" sai só pela planta
 * concluída). Sem planta a linha é recusada, então o snapshot passa a ser o da
 * linha COM a planta da bancada (`radar-piloto-planta-fixtures-2026-10-09.mts`):
 * título, promessa, estrutura, links e plano visual saem da planta; "Como
 * superar" sai do que a planta decidiu. O que o snapshot guarda continua sendo a
 * invariante da F4: sem Assunto, nenhuma linha dele (conferido acima, coluna a
 * coluna) e o pedido do artigo-modelo sem as linhas do Assunto. YouTube (linha
 * só de identidade, sem planta) ficou idêntico ao hash anterior.
 */
const SNAPSHOT = {
  silo: { sha: "5fc8511af93b43bfc065e16a0db1a9f75705a6b17727531de649ce229e7876ef", len: 22014 },
  saude: { sha: "947069ff78a8b433622715db6b8d4a688e601aa8c21032280215b6348c776ac7", len: 25819 },
  artigos: {
    google: "c79eeb9d8ade1ec8473c75fa07e99627dcdfa57d752009fb18dea4d843e66688",
    amazon: "37fd29dd34ef784dce6822f835c28d96b9e9af485d9bba61ca84d87fad4d6b0b",
    youtube: "0b0118248360fabc79e06be63916b91bd3f6aadd0c6b99fb06d3c4baabd5137a",
    saude: "82f260612a31a1b3d8aef0005b8538efc5cb39d0435d0e733ad9333620c6eabd",
  },
};

test("F4.4 · sem Assunto, as 13 colunas são byte a byte as do snapshot de antes da F4", () => {
  /* 2026-10-09 · cada artigo com a planta concluída dele (a investigação de vídeo como perfil primário não pede planta). */
  const escrita = planoDoSilo().files[0].writing;
  const silo = radarPortableWritingExport({ articles: comPlantas(montadasDoSilo(), escrita), lenses: LEITURA_DAS_LENTES, plan: planoDoSilo(), today: EXPORTADO_EM });
  assert.equal(silo.files?.length, 1);
  const SEM_ASSUNTO = /Assunto \(tronco\)|Virada do Assunto|Tronco \(Assunto\)|Direção do H1|destino da virada/;
  assert.doesNotMatch(silo.files![0].csv, SEM_ASSUNTO);
  assert.equal(silo.files![0].csv.length, SNAPSHOT.silo.len);
  assert.equal(sha(silo.files![0].csv), SNAPSHOT.silo.sha, "o CSV por silo mudou sem Assunto");

  const saude = radarPortableWritingExport({
    articles: comPlantas(montadasDoSiloSaude(), escrita), lenses: LEITURA_DAS_LENTES, plan: planoDoSilo(), today: EXPORTADO_EM,
    publications: new Map([[ARTIGO, PUBLICACAO_SEM_POLITICA]]),
  });
  assert.doesNotMatch(saude.files![0].csv, SEM_ASSUNTO);
  assert.equal(saude.files![0].csv.length, SNAPSHOT.saude.len);
  assert.equal(sha(saude.files![0].csv), SNAPSHOT.saude.sha, "o CSV do silo de saúde mudou sem Assunto");

  const artigos: Record<keyof typeof SNAPSHOT.artigos, RadarPortableExportInput> = {
    google: entradaGoogle(), amazon: entradaAmazon(true), youtube: entradaYoutube(), saude: entradaGoogleSaude(),
  };
  for (const [nome, entrada] of Object.entries(artigos) as Array<[keyof typeof SNAPSHOT.artigos, RadarPortableExportInput]>) {
    const artigo = buildRadarWritingExportArticle(entrada, comPlanta(entrada, CONTEXTO));
    assert.doesNotMatch(JSON.stringify(artigo), SEM_ASSUNTO, nome);
    assert.equal(sha(JSON.stringify(artigo)), SNAPSHOT.artigos[nome], `${nome} mudou sem Assunto`);
  }
  /* Sem Assunto, o pedido do artigo-modelo também não ganha as linhas dele. */
  assert.equal(pedidoDe(entradaGoogle()).user.some(item => /^(Assunto \(tronco\)|Virada do Assunto|H1 com o Assunto)/.test(item)), false);
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
  /* 2026-10-09 · o destino da virada (que a coluna promessa legada dizia) sai aqui, ao lado do Assunto. */
  assert.equal(artigo[principal + 1], "Assunto (tronco): Consulta dermatológica online — destino da virada: https://careglow.com.br/consulta-online");
  const naoAltere = artigo.find(item => item.startsWith("Não altere: ")) || "";
  assert.match(naoAltere, /a keyword principal; o papel no Silo; .*; o Assunto declarado \(não troque nem remova\)\.$/);

  const sem = linhasDe(linha(entradaGoogle()).artigo);
  assert.deepEqual(artigo.filter(item => !item.startsWith("Assunto (tronco): ") && !item.startsWith("Não altere: ")), sem.filter(item => !item.startsWith("Não altere: ")),
    "o resto da coluna fica como era");
});

/*
 * 2026-10-09 · o tronco, a virada e o destino vão ao PEDIDO do artigo-modelo
 * (a planta decide onde e como); a coluna promessa é a da planta (leitor,
 * promessa e ângulo) e não ganha linha legada do Assunto.
 */
test("F4.3 · promessa_e_leitor: tronco e virada ANTES da abertura; o lugar é o mesmo da estrutura; a chamada observada fica", () => {
  const entrada = entradaCom(CONSULTA);
  assert.equal(entrada.articleModel?.declaredSubject?.turnSection.placement, "COVERAGE_POINT", "o fixture deixa a virada como ponto a cobrir");
  const { brief, user } = pedidoDe(entrada);
  const tronco = user.findIndex(item => item.startsWith("Assunto (tronco): "));
  assert.ok(tronco > 0, user.join("\n"));
  assert.equal(user[tronco], "Assunto (tronco): Consulta dermatológica online — A marca atende por teleconsulta · destino da virada: https://careglow.com.br/consulta-online (o fechamento leva a ele)");
  const host = entrada.articleModel!.declaredSubject!.turnSection.hostHeading!;
  assert.equal(user[tronco + 1], `Virada do Assunto (leitura do Radar na SERP): como ponto a cobrir em "${host}" (lugar deixado pelo Radar sem sinal na SERP; a planta pode mudar)`);
  assert.ok(brief.skeleton.some(item => item.heading === host), "o anfitrião nomeado é uma seção do esqueleto");

  const promessa = linhasDe(linha(entrada).promessa_e_leitor);
  assert.deepEqual(promessa.map(item => item.split(":")[0]), ["Leitor", "Promessa", "Ângulo"], "a promessa é a da planta");
  assert.equal(promessa.some(item => /^(Tronco|Virada|Destino da chamada|Chamada final)/.test(item)), false);
  assert.deepEqual(promessa, linhasDe(linha(entradaGoogle()).promessa_e_leitor), "a coluna fica igual: o Assunto está no pedido e na coluna artigo");
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

  const { user } = pedidoDe(entrada);
  const virada = user.find(item => item.startsWith("Virada do Assunto")) || "";
  assert.equal(virada, `Virada do Assunto (leitura do Radar na SERP): na seção "${turn.turnSection.heading}" (a amostra já trata o Assunto em ${contagem})`);
  assert.equal(virada.includes("sem sinal"), false);
  assert.ok(user.includes("Assunto (tronco): Rotina de skincare facial"), "sem destino, sem 'destino da virada'");
  assert.ok(linhasDe(linha(entrada).artigo).includes("Assunto (tronco): Rotina de skincare facial"));
});

test("F4.3 · promessa_e_leitor: com posição sugerida pelo Radar, \"depois de <seção>\"; sem destino, sem \"destino:\"", () => {
  const entrada = entradaCom(ORDEM);
  const { user } = pedidoDe(entrada);
  assert.ok(user.includes("Assunto (tronco): Ordem dos ácidos no rosto"));
  const depois = entrada.articleModel!.declaredSubject!.suggestedPosition!.afterHeading;
  assert.ok(user.includes(`Virada do Assunto (leitura do Radar na SERP): depois de "${depois}"`), user.join("\n"));
  assert.equal(user.some(item => item.includes("destino da virada")), false);
  assert.equal(tudoDe(linha(entrada)).includes("destino da virada"), false);
});

test("F4.3 · titulo_e_seo: a direção do H1 segue a sugestão do Radar, e a principal continua dona do H1", () => {
  /* 2026-10-09 · a direção do H1 vai ao pedido do artigo-modelo ("H1 com o Assunto"); o título da linha é o da planta, com a principal. */
  const h1 = (entrada: RadarPortableExportInput) => pedidoDe(entrada).user.find(item => item.startsWith("H1 com o Assunto: ")) || "";
  const titulo = (entrada: RadarPortableExportInput) => linhasDe(linha(entrada).titulo_e_seo);
  const LEGADO = /^(Direção do H1|Assunto em H2\/H3|Assunto no H1)/;

  const zeroDeN = entradaCom(CONSULTA).articleModel?.declaredSubject;
  assert.ok(zeroDeN?.alert, "0 de N páginas: o alerta está ligado");
  assert.equal(zeroDeN?.h1Complement.titlePages, 0);
  assert.equal(zeroDeN?.h1Complement.headingPages, 0);
  assert.equal(zeroDeN?.h1Complement.label, RADAR_SUBJECT_NO_SIGNAL, "o modelo e o pedido dizem o mesmo: sem sinal");
  assert.equal(h1(entradaCom(CONSULTA)), "H1 com o Assunto: sem sinal na SERP — o H1 é da principal", "0 de N é sem sinal na SERP");
  const semSinal = titulo(entradaCom(CONSULTA));
  assert.ok(semSinal.includes("H1: Skincare facial: o guia prático"), "a principal continua dona do H1 da planta");
  assert.equal(semSinal.some(item => LEGADO.test(item)), false, "o título da linha é o da planta");
  assert.equal(RADAR_WRITING_SUBJECT_H1_NO_SIGNAL.includes("O H1 é da principal"), true);

  assert.ok((entradaCom(ORDEM).articleModel?.declaredSubject?.h1Complement.headingPages ?? 0) > 0, "a amostra trata o Assunto em H2/H3");
  assert.equal(h1(entradaCom(ORDEM)), "H1 com o Assunto: Assunto em H2/H3 — o H1 é da principal");

  const comComplemento = entradaCom(CONSULTA, turn => ({
    ...turn, h1Complement: { suggested: true, complement: turn.phrase, titlePages: 7, headingPages: 3, sampleSize: 12, label: "rótulo do Radar" },
  }));
  assert.equal(h1(comComplemento), "H1 com o Assunto: skincare facial + complemento \"Consulta dermatológica online\" (sugestão do Radar; o H1 continua da principal)");

  const semLeitura = entradaCom(CONSULTA, turn => ({
    ...turn, h1Complement: { suggested: false, complement: null, titlePages: null, headingPages: null, sampleSize: 0, label: RADAR_SUBJECT_NO_SIGNAL },
  }));
  assert.equal(h1(semLeitura), "H1 com o Assunto: sem sinal na SERP — o H1 é da principal", "sem sinal, nunca \"Assunto em H2/H3\"");
  assert.equal(h1(entradaGoogle()), "", "sem Assunto, sem a linha");
});

test("F4.3 · estrutura: a seção da virada vem do modelo do Radar, marcada pelo motivo do Assunto; nenhuma linha inventada", () => {
  /*
   * 2026-10-09 · a seção da virada chega ao ESQUELETO do gerador como veio do
   * modelo do Radar, obrigatória (o motivo do Assunto); a estrutura da linha é
   * a da planta, sem linha legada do Assunto.
   */
  for (const assunto of [CONSULTA, ORDEM]) {
    const entrada = entradaCom(assunto);
    const { brief } = pedidoDe(entrada);
    const editorial = radarPortableEditorialOf({ profile: "GOOGLE", principalKeyword: "skincare facial", articleModel: entrada.articleModel });
    const daVirada = radarPortableFlatSections(editorial.sections).filter(secao => secao.mustCoverReasons.includes(RADAR_SUBJECT_MUST_COVER_REASON)).map(secao => secao.heading);
    assert.ok(daVirada.length >= 1, `${assunto.phrase}: o modelo marca a seção da virada`);
    for (const cabecalho of daVirada) {
      assert.equal(brief.skeleton.find(item => item.heading === cabecalho)?.mustCover, true, `${assunto.phrase}: "${cabecalho}" chega ao esqueleto, obrigatória`);
    }
    const estrutura = linhasDe(linha(entrada).estrutura);
    assert.equal(estrutura.some(item => /^(Tronco|Virada:|Assunto)/.test(item)), false, "o export não escreve linha própria na estrutura");
  }

  /* No H3, a seção sintética chega como veio do modelo, filha do bloco que a recebe. */
  const sintetica = pedidoDe(entradaCom(ORDEM)).brief.skeleton.find(item => item.heading === radarSubjectTurnTitle(ORDEM.phrase));
  assert.ok(sintetica, "a seção sintética da virada chega ao esqueleto");
  assert.equal(sintetica!.level, 3);
  assert.equal(sintetica!.mustCover, true);

  /* Como ponto a cobrir, a virada vai à frente dos pontos do anfitrião. */
  const host = entradaCom(CONSULTA).articleModel!.declaredSubject!.turnSection.hostHeading!;
  const anfitriao = pedidoDe(entradaCom(CONSULTA)).brief.skeleton.find(item => item.heading === host);
  assert.equal(anfitriao?.cover[0], "virada para Consulta dermatológica online", JSON.stringify(anfitriao));

  const sem = pedidoDe(entradaGoogle());
  assert.equal(sem.user.join("\n").includes(RADAR_SUBJECT_MUST_COVER_REASON), false);
  assert.equal(linha(entradaGoogle()).estrutura.includes(RADAR_WRITING_SUBJECT_WORKING_TITLE), false);
});

test("F4.3 · limites de caracteres respeitados com Assunto, nota no teto e destino longo", () => {
  const longo: Assunto = {
    phrase: "Consulta dermatológica online para pele oleosa com acne",
    note: "n".repeat(280),
    destinationUrl: `https://careglow.com.br/${"consulta-online/".repeat(10)}agendar`,
  };
  for (const entrada of [entradaCom(longo), entradaCom(CONSULTA), entradaCom(ORDEM)]) dentroDosLimites(linha(entrada));
  /* 2026-10-09 · a nota e o destino vão inteiros ao pedido do artigo-modelo; o destino, também à coluna artigo. */
  const tronco = pedidoDe(entradaCom(longo)).user.find(item => item.startsWith("Assunto (tronco): ")) || "";
  assert.ok(tronco.includes(`— ${"n".repeat(280)} ·`), "a nota sai inteira");
  assert.ok(tronco.includes(`destino da virada: ${longo.destinationUrl} (o fechamento leva a ele)`));
  assert.ok(linha(entradaCom(longo)).artigo.includes(`destino da virada: ${longo.destinationUrl}`));
});

test("F4.3 · Assunto só no contexto (sem artigo-modelo): tronco, virada sem posição e H1 devolvido a quem redige", () => {
  /* 2026-10-09 · sem a virada do modelo, o pedido diz que o lugar é da planta (sem sinal), e o destino sai do contexto, limpo. */
  const contexto = contextoCom(CONSULTA);
  const entrada = entradaGoogle({ researchContext: contexto });
  const row = linha(entrada);
  assert.ok(linhasDe(row.artigo).includes("Assunto (tronco): Consulta dermatológica online — destino da virada: https://careglow.com.br/consulta-online"), row.artigo);
  const { user } = pedidoDe(entrada);
  assert.ok(user.includes("Virada do Assunto (leitura do Radar na SERP): onde a planta decidir (sem sinal na SERP)"), user.join("\n"));
  assert.ok(user.includes("H1 com o Assunto: sem sinal na SERP — o H1 é da principal"));
  assert.ok(user.some(item => item.startsWith("Assunto (tronco): Consulta dermatológica online") && item.includes("destino da virada: https://careglow.com.br/consulta-online (o fechamento leva a ele)")),
    "sem artigo-modelo do Radar, a direção para o destino sai do contexto");
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
