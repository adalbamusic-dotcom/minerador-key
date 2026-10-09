import assert from "node:assert/strict";
import test from "node:test";
import { buildRadarVideoEvidenceLayer, type RadarVideoEvidenceLayer } from "../lib/radar/video-evidence.ts";
import {
  radarPortableVideoContext,
  radarPortableVideoUsageLine,
  type RadarPortableVideoUsageInput,
} from "../lib/radar/portable-annex-context.ts";
import type { RadarVideoUsage } from "../lib/radar/video-library.ts";
import {
  RADAR_WRITING_EXPORT_COLUMNS,
  RADAR_WRITING_EXPORT_LIMITS,
  radarWritingCellLimit,
  RADAR_WRITING_LEGACY_FAQ,
  RADAR_WRITING_NO_APPROVED_LINK,
  buildRadarWritingExportArticle,
  radarWritingOutOfScopeMatcher,
  radarWritingRhetoricalHeading,
  radarWritingRhetoricalQuestion,
  radarWritingUnitOf,
  type RadarWritingArticleContext,
  type RadarWritingExportRow,
} from "../lib/radar/portable-writing-export.ts";
import { radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import { buildRadarVideoExportArticle, radarPortableVideoExport } from "../lib/radar/portable-video-export.ts";
import { readRadarVideoUsagesForExport } from "../lib/server/radar-video-usage-read.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import {
  ARTIGO,
  EXPORTADO_EM,
  LEITURA_DAS_LENTES,
  PUBLICACAO_SEM_POLITICA,
  entradaAmazon,
  entradaGoogle,
  entradaGoogleSaude,
  montadasDoSilo,
  montadasDoSiloSaude,
  planoDoSilo,
} from "./radar-portable-writing-fixtures.mts";

/*
 * ===== A COERÊNCIA DO CSV "PARA ESCREVER" E DO DE VÍDEO (2026-10-02) =====
 *
 * Pedido do dono: "todas essas melhorias, regras e diretrizes têm que ser
 * aplicáveis para qualquer tipo de artigo ou landing page". O caso que abriu a
 * frente foi um CSV real (Instagram, público de clínicas); nada aqui é preso a
 * ele: cada régua é provada com marcas, assuntos e tipos de página diferentes.
 *
 *   1 · fecho retórico de concorrente fora de TODA lista;
 *   2 · o "não cobrir" alcança pergunta, movimento e termo que o TOCAM;
 *   3 · conflito que o export já resolve não vira ressalva;
 *   4 · uma frase só para o FAQ legado, nos três lugares;
 *   5 · o próximo passo do leitor nunca inventa link;
 *   6 · vídeos selecionados com canal, e transcrição antes da descrição;
 *   7 · SERP rastreável: comparáveis e configuração das lentes;
 *   8 · capa + 2 ou 3 respiros, sem reduzir a regra em silêncio;
 *   9 · o tipo da unidade (landing page, página de serviço, review).
 *
 * PROVIDER_CALLS = 0 e AI_CALLS = 0: só fixtures, e a rede é recusada.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const AVULSO: RadarWritingArticleContext = { topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null };
const linha = (entrada: RadarPortableExportInput, contexto: RadarWritingArticleContext = AVULSO): RadarWritingExportRow =>
  buildRadarWritingExportArticle(entrada, contexto).row;
const tudo = (row: RadarWritingExportRow) => RADAR_WRITING_EXPORT_COLUMNS.map(coluna => row[coluna]).join("\n");

type Observado = Record<string, unknown> & {
  questions: unknown[];
  gaps: unknown[];
  differentiations?: unknown[];
  concepts: Record<string, unknown> & { all: unknown[] };
};
type Modelo = Record<string, unknown> & { sections: Array<Record<string, unknown>>; candidates?: unknown[] };

/** A entrada do Pilar com o pacote mexido: o que o Radar observou e o modelo do artigo. */
function entradaCom(mexer: { observado?: (observado: Observado) => Observado; modelo?: (modelo: Modelo) => Modelo; artigo?: Partial<RadarPortableExportInput["article"]> }): RadarPortableExportInput {
  const base = entradaGoogle();
  const observado = mexer.observado ? mexer.observado(structuredClone(base.googleObserved) as unknown as Observado) : base.googleObserved;
  const modelo = mexer.modelo ? mexer.modelo(structuredClone(base.articleModel) as unknown as Modelo) : base.articleModel;
  return {
    ...base,
    /* Um título utilizável: sem ele, a linha sai "Com ressalva" por outro motivo e esconderia o que se mede aqui. */
    articleModel: { ...(modelo as unknown as Record<string, unknown>), titleSuggestion: "Skincare facial: como montar a rotina passo a passo" } as never,
    googleObserved: observado as never,
    article: { ...base.article, ...(mexer.artigo || {}) },
  };
}

const pergunta = (canonicalQuestion: string, pages: number, status = "MARKET_QUESTION_UNDERCOVERED") =>
  ({ canonicalQuestion, status, pages, sampleSize: 12, declaredByArticle: false, evidence: `${pages} de 12` });
const conceito = (canonicalLabel: string, sourceCount: number) =>
  ({ canonicalLabel, status: "RECURRENT", sourceCount, sampleSize: 12, queries: [], evidence: `${sourceCount} de 12` });
const lacuna = (subject: string, pagesCovering: number) =>
  ({ subject, against: "ARTICLE_DNA", pagesCovering, sampleSize: 12, queryCoverage: 1, queries: [], sources: [], confidence: "MEDIUM", evidence: `${pagesCovering} de 12 páginas` });
const candidatoFora = (observedLabel: string) =>
  ({ observedLabel, pages: 4, sampleSize: 12, verdict: "OUT_OF_SCOPE", reason: "O assunto pertence a outra página do site.", sectionId: null });

/* ================================ 1 ================================ */

test("1 · fecho retórico de concorrente: a régua vale para qualquer assunto, e a pergunta legítima passa", () => {
  for (const retorica of [
    "Aprendeu como atrair clientes no Instagram?", "Gostou das dicas?", "E aí, gostou do guia de implante dentário?",
    "Ficou com dúvidas sobre o clareamento?", "O que você achou deste review?", "Pronto para começar sua rotina?",
    "Entendeu a diferença entre os planos?", "O QUE VOC&Ecirc; ACHOU?",
  ]) assert.equal(radarWritingRhetoricalQuestion(retorica), true, retorica);
  for (const legitima of [
    "Como captar clientes pela internet?", "Implante dentário dói?", "Qual o melhor sérum para pele oleosa?",
    "Vale a pena contratar uma agência de tráfego?", "Quanto custa uma landing page?", "Vitamina C pode ser usada de dia?",
    /* 2026-10-02 · revisão da frente: "pronto/preparado para" sem verbo de chamada, ou com pergunta de verdade, é dúvida do leitor. */
    "Preparado para a cirurgia: o que levar?", "Pronto para consumo pode ser congelado?", "Pronto para usar: quanto tempo dura?",
  ]) assert.equal(radarWritingRhetoricalQuestion(legitima), false, legitima);
  /* A chamada para ação continua fora das LISTAS. */
  for (const chamada of ["Pronto para agendar sua avaliação?", "Você está pronto para dar o próximo passo?", "Quer saber mais sobre implantes?", "Vamos começar?"]) {
    assert.equal(radarWritingRhetoricalQuestion(chamada), true, chamada);
  }
});

test("1 · a régua da ESTRUTURA: reação ao conteúdo sai sempre; dúvida que sobrou, só de artigo e review; chamada para ação nunca", () => {
  const landing = radarWritingUnitOf({ article: { contentType: "landing_page" } as never });
  const servico = radarWritingUnitOf({ article: { contentType: "service_page" } as never });
  const review = radarWritingUnitOf({ article: { contentType: "review" } as never });
  for (const unidade of [undefined, review, landing, servico]) {
    assert.equal(radarWritingRhetoricalHeading("Gostou do guia de implante dentário?", unidade), true, `${unidade?.noun ?? "artigo"}: reação ao conteúdo`);
    assert.equal(radarWritingRhetoricalHeading("Aprendeu como montar a rotina?", unidade), true);
    assert.equal(radarWritingRhetoricalHeading("Pronto para agendar sua avaliação?", unidade), false, `${unidade?.noun ?? "artigo"}: chamada para ação é seção da página`);
    assert.equal(radarWritingRhetoricalHeading("Preparado para a cirurgia: o que levar?", unidade), false);
  }
  assert.equal(radarWritingRhetoricalHeading("Ficou com alguma dúvida?"), true, "no artigo, é fecho");
  assert.equal(radarWritingRhetoricalHeading("Ficou com alguma dúvida?", review), true, "no review, é fecho");
  assert.equal(radarWritingRhetoricalHeading("Ficou com alguma dúvida?", landing), false, "na landing page, é o convite ao contato");
  assert.equal(radarWritingRhetoricalHeading("Ainda tem dúvidas?", servico), false);
});

test("1 · a seção de chamada para ação fica na estrutura da landing page e da página de serviço — e a de reação ao conteúdo sai", () => {
  const secao = (id: string, headingSuggestion: string) => ({ id, headingSuggestion, readerQuestion: null, childSections: [], internalLinks: [], mustCoverReasons: [] });
  const comFecho = (tipo: string | null) => entradaCom({
    artigo: { contentType: tipo },
    modelo: modelo => ({
      ...modelo,
      sections: [
        ...modelo.sections,
        { ...modelo.sections[0], ...secao("section:duvida", "Ficou com alguma dúvida sobre a rotina?") },
        { ...modelo.sections[0], ...secao("section:cta", "Pronto para agendar sua avaliação?") },
        { ...modelo.sections[0], ...secao("section:gostou", "Gostou do conteúdo sobre skincare facial?") },
      ],
    }),
  });
  for (const tipo of ["landing_page", "service_page"]) {
    const estrutura = linha(comFecho(tipo)).estrutura;
    assert.match(estrutura, /^## Pronto para agendar sua avaliação\?$/m, `${tipo}: a seção de conversão é da página`);
    assert.match(estrutura, /^## Ficou com alguma dúvida sobre a rotina\?$/m, `${tipo}: o convite ao contato é da página`);
    assert.doesNotMatch(estrutura, /Gostou do conteúdo/);
    assert.match(estrutura, /A seção de fecho retórico de concorrente ficou de fora/);
  }
  const artigo = linha(comFecho(null)).estrutura;
  assert.match(artigo, /^## Pronto para agendar sua avaliação\?$/m, "chamada para ação nunca sai da estrutura, nem no artigo");
  assert.doesNotMatch(artigo, /Ficou com alguma dúvida|Gostou do conteúdo/);
  assert.match(artigo, /2 seções de fecho retórico de concorrente ficaram de fora/);
});

test("1 · a pergunta retórica não entra em NENHUMA lista: perguntas, movimentos, SERP resumida, abertura nem estrutura", () => {
  const base = entradaGoogle();
  const snapshot = base.serpObserved!.snapshot!;
  const entrada = entradaCom({
    observado: observado => ({
      ...observado,
      questions: [
        pergunta("Aprendeu como montar a rotina de skincare facial?", 12, "ARTICLE_QUESTION_CONFIRMED"),
        pergunta("E aí, gostou das dicas de skincare?", 9),
        ...observado.questions,
      ],
      gaps: [...observado.gaps, lacuna("Gostou do conteúdo sobre skincare?", 7)],
    }),
    modelo: modelo => ({
      ...modelo,
      sections: [...modelo.sections, { ...modelo.sections[0], id: "section:fecho", headingSuggestion: "Gostou do conteúdo sobre skincare facial?", readerQuestion: null, childSections: [], internalLinks: [], mustCoverReasons: [] }],
    }),
  });
  entrada.serpObserved = {
    ...base.serpObserved!,
    snapshot: { ...snapshot, peopleAlsoAsk: [{ ...snapshot.peopleAlsoAsk[0], question: "Ficou com alguma dúvida sobre skincare?" }, ...snapshot.peopleAlsoAsk] } as never,
  };
  const row = linha(entrada);
  for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) {
    for (const trecho of row[coluna].split("\n")) {
      assert.equal(/aprendeu como montar|gostou das dicas|gostou do conteúdo|ficou com alguma dúvida/i.test(trecho), false, `${coluna}: ${trecho}`);
    }
  }
  assert.match(row.estrutura, /A seção de fecho retórico de concorrente ficou de fora/);
  assert.doesNotMatch(row.promessa_e_leitor, /Abertura: responder "(Aprendeu|E aí)/);
  assert.match(row.serp_resumida, /Pessoas também perguntam: O que é skincare para o rosto\?/, "a pergunta legítima do PAA continua");
});

/* ================================ 2 ================================ */

test("2 · o \"não cobrir\" alcança o texto que TOCA o assunto, pelas palavras que o distinguem — em qualquer marca", () => {
  /* O caso que abriu a frente: Instagram é do núcleo; "Shopping" é o que distingue. */
  const instagram = radarWritingOutOfScopeMatcher({ labels: ["Ative o Instagram Shopping"], core: ["como atrair clientes pelo instagram", "captar clientes pela internet"] });
  assert.equal(instagram("Como prospectar clientes pelo Instagram com o Instagram Shopping"), true);
  assert.equal(instagram("Ative o Instagram Shopping"), true, "o próprio rótulo");
  assert.equal(instagram("Como atrair clientes pelo Instagram com stories?"), false);

  /* Uma landing page de clínica odontológica: três palavras distinguem, e é preciso tocar ao menos duas. */
  const dental = radarWritingOutOfScopeMatcher({ labels: ["Clareamento caseiro com bicarbonato"], core: ["implante dentário preço", "implante dentário"] });
  assert.equal(dental("Clareamento com bicarbonato funciona?"), true);
  assert.equal(dental("Implante dentário dói?"), false);
  assert.equal(dental("Qual o melhor clareamento para quem tem implante?"), false, "uma de três não basta");

  /* Qualificador não distingue: o que está fora são as ofertas, não "o melhor". */
  const ofertas = radarWritingOutOfScopeMatcher({ labels: ["As melhores ofertas de skincare"], core: ["skincare facial"] });
  assert.equal(ofertas("Qual o melhor skin care para o rosto"), false);
  assert.equal(ofertas("Onde achar ofertas de skincare?"), true);

  /* Rótulo feito só de palavras do núcleo exclui só a si mesmo. */
  const nucleo = radarWritingOutOfScopeMatcher({ labels: ["Skincare facial"], core: ["skincare facial"] });
  assert.equal(nucleo("Skincare facial à noite"), false);
  assert.equal(nucleo("Skincare facial"), true);

  assert.equal(radarWritingOutOfScopeMatcher({ labels: [], core: ["x"] })("qualquer coisa"), false, "sem rótulo, nada sai");
});

test("2 · no CSV, a pergunta, o movimento e o termo que tocam o \"não cobrir\" saem; o resto fica", () => {
  const entrada = entradaCom({
    observado: observado => ({
      ...observado,
      questions: [pergunta("Vale a pena comprar kits de skincare?", 8), pergunta("Como escolher o hidratante para pele oleosa?", 7), ...observado.questions],
      gaps: [...observado.gaps, lacuna("Kits de skincare para presente", 6)],
      concepts: { ...observado.concepts, all: [...observado.concepts.all, conceito("kits de skincare noturno", 6)] },
    }),
    modelo: modelo => ({ ...modelo, candidates: [...(modelo.candidates || []), candidatoFora("Kits de skincare em promoção")] }),
  });
  const row = linha(entrada);
  const cobrir = row.cobrir_e_superar;
  assert.match(cobrir, /Não cobrir:\n- "Kits de skincare em promoção": /);
  const foraDoBloco = cobrir.slice(0, cobrir.indexOf("Não cobrir:"));
  assert.doesNotMatch(foraDoBloco, /kits? de skincare/i, "pergunta, movimento ou termo que toca o \"não cobrir\" atravessou");
  assert.match(cobrir, /^- Como escolher o hidratante para pele oleosa\?/m, "a pergunta do artigo continua");

  /* O Silo também diz o que não cobrir: "tratamento de acne com medicamento". */
  const silo = planoDoSilo().files[0].writing!;
  const comSilo = linha(entradaCom({
    observado: observado => ({ ...observado, questions: [pergunta("Qual medicamento trata a acne?", 6), pergunta("Quais são os tipos de acne?", 5), ...observado.questions] }),
  }), { ...AVULSO, topRowLabel: "Silo", silo });
  assert.doesNotMatch(comSilo.cobrir_e_superar, /Qual medicamento trata a acne/);
  assert.match(comSilo.cobrir_e_superar, /Quais são os tipos de acne\?/, "uma palavra de três (acne) não tira a pergunta");
});

/* ================================ 3 ================================ */

/*
 * 2026-10-02 · revisão da frente: o teste usava `basis: "MARKET_GAP"`, que não
 * existe no enum (`ARTICLE_DECLARES` | `SERP_EVIDENCE`), e não cobria o caminho
 * do diferencial que o ArticleDNA declara. Agora são três casos: da SERP (o
 * export resolve), declarado pelo ArticleDNA e ligado a um ponto que ele exige
 * (decisão humana, ressalva).
 */
const diferencial = (subject: string, basis: "ARTICLE_DECLARES" | "SERP_EVIDENCE") =>
  ({ subject, basis, pagesCovering: 2, sampleSize: 12, sources: [], evidence: "2 de 12" });
const diferencialForaDoEscopo = (basis: "ARTICLE_DECLARES" | "SERP_EVIDENCE", artigo?: Partial<RadarPortableExportInput["article"]>) => entradaCom({
  observado: observado => ({ ...observado, differentiations: [diferencial("Kits de skincare em promoção", basis)] }),
  modelo: modelo => ({ ...modelo, candidates: [...(modelo.candidates || []), candidatoFora("Kits de skincare em promoção")] }),
  artigo,
});
/* 2026-10-08 · D10: a nota diz a regra cumprida ("fica fora de todas as colunas"), sem "pendente". */
const NOTA_RESOLVIDA = /- Nota: o pacote também listava "Kits de skincare em promoção" como diferencial; aqui vale o "não cobrir" \(resolvido neste arquivo: fica fora de todas as colunas\)\./;

test("3 · diferencial da SERP fora do escopo: o export resolve, sai uma nota, e o veredito não ganha ressalva", () => {
  const artigo = buildRadarWritingExportArticle(diferencialForaDoEscopo("SERP_EVIDENCE"), AVULSO);
  assert.equal(artigo.verdict, "Sim", artigo.row.pode_escrever);
  assert.doesNotMatch(artigo.row.pode_escrever + artigo.row.prompt, /fora do escopo e também como diferencial|até o Radar resolver|decisão humana pendente|cabe decisão humana/);
  assert.match(artigo.row.cobrir_e_superar, NOTA_RESOLVIDA);
  assert.doesNotMatch(artigo.row.cobrir_e_superar, /Diferenciar em "Kits/);
});

test("3 · diferencial que o ArticleDNA DECLARA e o Radar marca fora do escopo: ressalva de decisão humana, nunca \"sem decisão pendente\"", () => {
  const artigo = buildRadarWritingExportArticle(diferencialForaDoEscopo("ARTICLE_DECLARES"), AVULSO);
  assert.equal(artigo.verdict, "Com ressalva", artigo.row.pode_escrever);
  assert.match(artigo.row.pode_escrever, /o ArticleDNA declara "Kits de skincare em promoção" como diferencial e o pacote do Radar o marca como fora do escopo: cabe decisão humana \(Radar ou Arquiteto\), e o diagnóstico do Radar não muda o DNA; neste texto, não o sustente como diferencial/);
  assert.doesNotMatch(artigo.row.cobrir_e_superar, NOTA_RESOLVIDA, "o que o DNA declara nunca é dito resolvido pelo export");
  assert.doesNotMatch(artigo.row.cobrir_e_superar, /sem decisão pendente|fica fora de todas as colunas/);
  assert.doesNotMatch(artigo.row.cobrir_e_superar, /Diferenciar em "Kits/, "até a decisão, não é sustentado como diferencial");
});

test("3 · diferencial da SERP ligado a um ponto que o ArticleDNA EXIGE: também é ressalva de decisão humana", () => {
  const artigo = buildRadarWritingExportArticle(diferencialForaDoEscopo("SERP_EVIDENCE", { mustCover: ["ordem dos produtos", "kits de skincare para presente"] }), AVULSO);
  assert.equal(artigo.verdict, "Com ressalva", artigo.row.pode_escrever);
  assert.match(artigo.row.pode_escrever, /o ArticleDNA exige um ponto ligado a "Kits de skincare em promoção", que o pacote do Radar marca como fora do escopo e também como diferencial: cabe decisão humana \(Radar ou Arquiteto\); neste texto, cubra o que o ArticleDNA exige/);
  assert.doesNotMatch(artigo.row.cobrir_e_superar, NOTA_RESOLVIDA);
});

/* ================================ 4 ================================ */

test("4 · FAQ legado: a MESMA frase na regra geral, na coluna artigo e no prompt do publicado", () => {
  assert.match(RADAR_WRITING_LEGACY_FAQ, /não integra o fluxo novo/);
  assert.match(RADAR_WRITING_LEGACY_FAQ, /só sai com decisão humana registrada/);
  assert.match(RADAR_WRITING_LEGACY_FAQ, /respostas úteis vão para o corpo/);
  for (const tipo of [null, "landing_page", "service_page"]) {
    const saida = radarPortableWritingExport({
      articles: montadasDoSiloSaude().map(item => ({ ...item, entrada: { ...item.entrada, article: { ...item.entrada.article, contentType: tipo } } })),
      lenses: LEITURA_DAS_LENTES, plan: planoDoSilo(), today: EXPORTADO_EM,
      publications: new Map([[ARTIGO, PUBLICACAO_SEM_POLITICA]]),
    });
    const csv = saida.files![0].csv;
    const vezes = csv.split(RADAR_WRITING_LEGACY_FAQ).length - 1;
    assert.equal(vezes, 3, `${tipo}: a frase do FAQ legado aparece na regra 2, na coluna artigo e no prompt (${vezes})`);
    assert.doesNotMatch(csv, /sem ampliar nem remover|Mantenha a seção de perguntas existente/, `${tipo}: a frase antiga voltou`);
  }
  const nova = linha(entradaGoogle());
  assert.equal(tudo(nova).includes(RADAR_WRITING_LEGACY_FAQ), false, "página nova não fala do FAQ legado na linha dela");
});

/* ================================ 5 ================================ */

/*
 * 2026-10-08 · P1 · UM CTA SÓ: o "Próximo passo do leitor" (próximo artigo OU
 * SiloPage) virou a CONTINUAÇÃO — o próximo artigo do Silo no fechamento, com
 * o link aprovado ou citado sem link; a SiloPage só no lugar dele, quando o
 * artigo é o último da ordem. Nunca "peça ao Arquiteto" (D10).
 */
test("5 · continuação do leitor: sem link aprovado para o destino, a frase diz isso — e nunca inventa link", () => {
  const silo = planoDoSilo().files[0].writing!;
  const contexto: RadarWritingArticleContext = { ...AVULSO, topRowLabel: "Silo", silo };
  const sem = linha(entradaGoogle(), contexto).promessa_e_leitor;
  assert.match(sem, new RegExp(`^Continuação \\(não é uma segunda chamada\\): no fechamento, apresente o próximo artigo do Silo, "skin care nivea", como a leitura seguinte ${RADAR_WRITING_NO_APPROVED_LINK.replace(/[()]/g, "\\$&")}\\.$`, "m"),
    "o Pilar da bancada só tem link para a SiloPage");
  assert.doesNotMatch(sem, /Próximo passo do leitor|peça ao Arquiteto|SiloPage "Cuidados com a Pele"/, "uma chamada só: a SiloPage não vira segunda saída");
  /* O Pilar de saúde tem o link aprovado para o Suporte "skin care nivea": a continuação leva o L dele. */
  const com = linha(entradaGoogleSaude(), contexto).promessa_e_leitor;
  assert.match(com, /^Continuação \(não é uma segunda chamada\): no fechamento, apresente o próximo artigo do Silo, "skin care nivea", como a leitura seguinte, com o link L\d\.$/m);
  assert.equal(com.includes(RADAR_WRITING_NO_APPROVED_LINK), false);
  /* Sem link nenhum: a continuação diz a falta, uma vez. */
  const nada = linha({ ...entradaGoogle(), internalLinks: [] }, contexto).promessa_e_leitor;
  assert.equal(nada.split(RADAR_WRITING_NO_APPROVED_LINK).length - 1, 1);
  /* Sem Silo, não há continuação a dizer. */
  assert.doesNotMatch(linha(entradaGoogle()).promessa_e_leitor, /Continuação|Próximo passo do leitor/);
});

/* ================================ 6 ================================ */

const uso = (patch: Partial<RadarPortableVideoUsageInput> & { videoSourceId: string; usage: RadarVideoUsage }): RadarPortableVideoUsageInput => ({
  note: null, title: null, url: null, channel: null, duration: null, description: null, textPreview: null, ...patch,
});
const PROMOCIONAL = `Inscreva-se no canal e ative o sininho! Cupom DENTE10 na loja. ${"Siga nas redes: @clinica. ".repeat(12)}`;

const camada = (): RadarVideoEvidenceLayer => buildRadarVideoEvidenceLayer({
  identity: { frozenBundleId: "fb1", frozenBundleHash: "sha256:fb1", matchingRunId: "run-1", inputFingerprint: "m4:vs-apoio@v1", matcherVersion: 4, matchedAt: "2026-10-02T13:00:00.000Z" },
  briefs: [{
    briefId: "vb1", topic: "Como montar a rotina?", narrativePurpose: "Mostrar a ordem dos produtos.", whatToLookFor: ["ordem dos produtos"],
    relatedSectionId: "sec-1", relatedSectionTitle: "Como montar a rotina de skincare facial no dia a dia?",
    questions: [], entities: [], evidenceNeeded: "Fala de quem pratica.", priority: "HIGH",
  }],
  coverage: [{
    videoBriefId: "vb1", state: "SUPPORTED", reason: "Um trecho responde a pauta.",
    criteria: ["ordem dos produtos"], matchedCriteria: ["ordem dos produtos"], missingCriteria: [], usefulSourceIds: ["vs-apoio"],
    extracts: [{
      videoBriefId: "vb1", videoSourceId: "vs-apoio", segmentIndexes: [1], startMs: 30000, endMs: 45000,
      originalText: "Primeiro a limpeza, depois o sérum, por último o hidratante.", sourceLanguage: "pt-BR",
      reasonForRelevance: "Responde a pauta.", matchedCriteria: ["ordem dos produtos"], answersTitle: true,
      matchedQuestions: [], matchedEntities: [], supportType: "COVERS_TOPIC" as const, confidence: 0.8, limitations: [],
      provenance: { processingVersion: 1, anchoredToSegments: true as const },
    }],
  }],
  sources: [{ videoSourceId: "vs-apoio", displayName: "Rotina em 3 passos", languageCode: "pt-BR", processingVersion: 1 }],
});

test("6 · vídeos selecionados: cada um diz o canal; Contexto e Sugestão de pauta pelo começo da transcrição, descrição só em último caso e curta", () => {
  const usos = [
    uso({ videoSourceId: "vs-apoio", usage: "SUPPORT", title: "Rotina em 3 passos", url: "https://www.youtube.com/watch?v=apoio000001", channel: "Dermato Explica" }),
    uso({ videoSourceId: "vs-ctx", usage: "CONTEXT", title: "Bastidores do consultório", channel: "Clínica Sorriso", description: PROMOCIONAL, textPreview: "Hoje eu mostro como a gente organiza a primeira consulta, do acolhimento ao plano de tratamento." }),
    uso({ videoSourceId: "vs-desc", usage: "TOPIC_SUGGESTION", title: "Dúvidas de pacientes", description: PROMOCIONAL }),
  ];
  const contexto = radarPortableVideoContext(camada(), usos);
  const porTitulo = new Map((contexto.selected || []).map(item => [item.title, item]));

  const ctx = porTitulo.get("Bastidores do consultório")!;
  assert.equal(ctx.summarySource, "TRANSCRIPT");
  assert.match(radarPortableVideoUsageLine(ctx), /· canal: Clínica Sorriso — /);
  /* 2026-10-08 (correção da revisão) · D10: a regra concluída, não "conferir antes de usar". */
  assert.match(radarPortableVideoUsageLine(ctx), /Começo da transcrição \(fala do vídeo, transcrição automática: cite só o que o vídeo confirma\): "Hoje eu mostro/);
  assert.doesNotMatch(radarPortableVideoUsageLine(ctx), /Inscreva-se|Cupom/, "a descrição promocional não entra quando há transcrição");

  const desc = porTitulo.get("Dúvidas de pacientes")!;
  assert.equal(desc.summarySource, "DESCRIPTION");
  assert.ok((desc.summary || "").length <= 160, "a descrição, último recurso, é curta");
  assert.match(radarPortableVideoUsageLine(desc), /canal não registrado na biblioteca/);
  assert.match(radarPortableVideoUsageLine(desc), /Descrição do canal \(sem transcrição; texto do canal, não fala do vídeo\)/);

  const row = linha(entradaGoogle({ videoContext: contexto }));
  assert.match(row.fontes_e_especialista, /^Vídeos selecionados pela marca \(modo de uso escolhido no Radar/m);
  assert.match(row.fontes_e_especialista, /Apoio · "Rotina em 3 passos" \(https:\/\/www\.youtube\.com\/watch\?v=apoio000001\) · canal: Dermato Explica — /);
  assert.match(row.fontes_e_especialista, /^- V1 · "Rotina em 3 passos" · canal: Dermato Explica \(00:30–00:45\)/m, "o trecho citável também leva o canal");
  assert.ok(!row.fontes_e_especialista.includes(PROMOCIONAL.trim()), "nada de texto inteiro");

  const video = buildRadarVideoExportArticle(entradaGoogle({ videoContext: contexto }), { position: 1, youtube: null }).row;
  assert.match(video.biblioteca_da_marca, /Vídeos selecionados pela marca \(modo de uso escolhido no Radar, decisão do dono\):/);
  assert.match(video.biblioteca_da_marca, /corte só de vídeo da própria marca; de outro canal, referência citada e atribuída/);
  assert.match(video.biblioteca_da_marca, /"Rotina em 3 passos" · canal: Dermato Explica 00:30–00:45/);

  /* Sem modo nenhum, a projeção não ganha nada. */
  assert.equal(JSON.stringify(radarPortableVideoContext(camada(), [])), JSON.stringify(radarPortableVideoContext(camada())));
});

type Resposta = { data?: unknown; error?: { code?: string; message: string } | null };
function clienteFalso(respostas: Record<string, Resposta>) {
  const chamadas: Array<{ tabela: string; passos: string[] }> = [];
  const cliente = {
    from(tabela: string) {
      const registro = { tabela, passos: [] as string[] };
      chamadas.push(registro);
      const construtor = {
        select: (colunas: string) => { registro.passos.push(`select:${colunas}`); return construtor; },
        eq: (coluna: string, valor: unknown) => { registro.passos.push(`eq:${coluna}=${String(valor)}`); return construtor; },
        in: (coluna: string, valores: unknown[]) => { registro.passos.push(`in:${coluna}=${valores.join("|")}`); return construtor; },
        order: (coluna: string) => { registro.passos.push(`order:${coluna}`); return construtor; },
        then: (resolver: (valor: Resposta) => unknown, rejeitar?: (erro: unknown) => unknown) => Promise.resolve(respostas[tabela] ?? { data: [], error: null }).then(resolver, rejeitar),
      };
      return construtor;
    },
  };
  return { cliente: cliente as never, chamadas };
}

/*
 * 2026-10-02 · revisão da frente (pedido do dono, CSV de vídeo): a prévia
 * passou a ser lida para TODO vídeo selecionado com modo — quem grava precisa
 * saber do que cada um trata — e só da versão CORRENTE de cada fonte, em duas
 * consultas (as versões sem texto; depois o texto só das escolhidas). O teste
 * de antes travava "só Contexto e Sugestão de pauta" e uma consulta só: era
 * exatamente o que mudou. No CSV para escrever nada muda: Incorporar, Apoio e
 * Citação seguem levando o trecho casado (provado em 6 acima e em D de
 * radar-video-usage).
 */
test("6 · a leitura do export busca o começo da transcrição corrente de cada vídeo selecionado, com ou sem descrição", async () => {
  const com = clienteFalso({
    radar_article_video_sources: { data: [
      { article_id: "artigo-1", video_source_id: "ctx", usage: "CONTEXT", usage_note: null },
      { article_id: "artigo-1", video_source_id: "pauta", usage: "TOPIC_SUGGESTION", usage_note: null },
      { article_id: "artigo-1", video_source_id: "embed", usage: "EMBED", usage_note: null },
    ], error: null },
    radar_video_sources: { data: [
      { id: "ctx", video_title: "Bastidores", normalized_url: "https://www.youtube.com/watch?v=ccccccccccc", channel_title: "Clínica Sorriso", video_description: PROMOCIONAL, duration: null },
      { id: "pauta", video_title: "Dúvidas", normalized_url: "https://www.youtube.com/watch?v=ppppppppppp", channel_title: null, video_description: "Descrição curta.", duration: null },
      { id: "embed", video_title: "Tour", normalized_url: "https://www.youtube.com/watch?v=eeeeeeeeeee", channel_title: "Clínica Sorriso", video_description: null, duration: null },
    ], error: null },
    radar_video_source_texts: { data: [
      { id: "t-ctx-1", video_source_id: "ctx", transcript_text: `Hoje eu mostro a primeira consulta. ${"palavra ".repeat(300)}`, processing_version: 1 },
      { id: "t-pauta-1", video_source_id: "pauta", transcript_text: "As pacientes perguntam se dói.", processing_version: 1 },
    ], error: null },
  });
  const lote = await readRadarVideoUsagesForExport(com.cliente, "marca-1", ["artigo-1"]);
  const textos = com.chamadas.filter(item => item.tabela === "radar_video_source_texts");
  assert.equal(textos.length, 2, "as versões, depois o texto das escolhidas");
  assert.ok(textos[0].passos.includes("in:video_source_id=ctx|pauta|embed"), `todo vídeo com modo, mesmo com descrição: ${textos[0].passos.join(" ")}`);
  assert.ok(!textos[0].passos.some(passo => passo.includes("transcript_text")), "a primeira consulta não traz texto");
  assert.ok(textos[1].passos.includes("in:id=t-ctx-1|t-pauta-1"), "o texto só das versões correntes");
  assert.ok(textos.every(item => item.passos.includes("eq:brand_id=marca-1") && item.passos.includes("eq:content_kind=ORIGINAL_TRANSCRIPT")));
  const porId = new Map((lote.get("artigo-1") || []).map(item => [item.videoSourceId, item]));
  assert.equal(porId.get("ctx")!.channel, "Clínica Sorriso");
  assert.ok((porId.get("ctx")!.textPreview || "").length <= 600, "prévia curta, nunca a transcrição inteira");
  assert.equal(porId.get("embed")!.textPreview, null, "sem transcrição na biblioteca, sem prévia");

  /* No CSV para escrever, Incorporar com prévia continua levando o trecho casado — sem resumo. */
  const embedComPrevia = radarPortableVideoContext(camada(), [uso({ videoSourceId: "vs-embed", usage: "EMBED", title: "Tour", textPreview: "Hoje eu mostro a clínica por dentro." })]).selected![0];
  assert.equal(embedComPrevia.summary, null);
  assert.equal(embedComPrevia.transcriptStart, "Hoje eu mostro a clínica por dentro.");
  assert.doesNotMatch(radarPortableVideoUsageLine(embedComPrevia), /Começo da transcrição/);
});

/* ================================ 7 ================================ */

test("7 · SERP rastreável: as páginas comparáveis que embasaram as medidas, e a configuração de cada lente", () => {
  const { files } = radarPortableWritingExport({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: planoDoSilo(), today: EXPORTADO_EM });
  const pilar = files![0].csv;
  assert.match(pilar, /Páginas comparáveis lidas pela investigação \(a base das medidas e dos ""N de M páginas"" deste arquivo; 12\):\n- Concorrente A0 · https:\/\/dominio-a0\.com\.br\/artigo\/skincare-facial/);
  assert.match(pilar, /\n- e mais 2 página\(s\) comparável\(is\), na investigação do Radar/);
  assert.match(pilar, /- Configuração de cada lente: desktop · Windows \(observada em 22\/09\/2026\); desktop · macOS \(sem observação\); celular · Android \(observada em 22\/09\/2026\); celular · iOS \(sem observação\)\./);
  assert.match(pilar, /Consulta: skincare facial · Brasil · pt · desktop · Windows · coleta de 20\/09\/2026/, "o sistema da coleta principal, gravado no pacote");

  /* Endereço de comparável com UUID de terceiro: só o domínio, como no topo orgânico. */
  const base = entradaGoogle();
  const observado = structuredClone(base.dossierGaps!.observed) as unknown as { competitors: Array<Record<string, unknown>> };
  const comparavel = observado.competitors.findIndex(item => item.comparable);
  observado.competitors[comparavel] = { ...observado.competitors[comparavel], url: "https://dominio-x.com.br/p/c0ffee00-1234-4abc-9def-00000000beef/guia" };
  const row = linha({ ...base, dossierGaps: { ...base.dossierGaps!, observed: observado as never } });
  assert.doesNotMatch(row.serp_resumida, /c0ffee00-1234/);
  /* Sem lentes no pacote, nenhuma configuração inventada. */
  assert.match(linha(entradaGoogle()).serp_resumida, /^Lentes: não conferidas neste pacote; o topo acima é da coleta principal\.$/m);
  assert.doesNotMatch(linha(entradaGoogle()).serp_resumida, /Configuração de cada lente/);
});

/* ================================ 8 ================================ */

test("8 · plano visual: capa + 2 ou 3 respiros; com menos seções, o respiro que falta é declarado, nunca cortado", () => {
  /* O Suporte comercial tem uma seção só (a de FAQ sai): antes, "uma capa e 1 respiro". */
  const curto = linha(entradaAmazon(true), { ...AVULSO, articleId: null }).plano_visual;
  assert.match(curto, /^Plano visual do pacote \(quem redige confirma\): uma capa e 2 respiro\(s\)\./);
  assert.match(curto, /Regra: capa \+ 2 ou 3 respiros\. A estrutura deste pacote só ancora 1 respiro\(s\) em seção/);
  assert.match(curto, /^Respiro 2 · definir a seção na estrutura final \(sugestão: antes do fechamento\) · 4:3/m);
  assert.match(curto, /Prompts das imagens: com artigo-modelo da SERP organizado no Radar, eles saem dele/);
  /* Com seções suficientes, nada muda: 3 respiros e nenhuma nota. */
  const cheio = linha(entradaGoogle()).plano_visual;
  assert.match(cheio, /uma capa e 3 respiro\(s\)\./);
  assert.doesNotMatch(cheio, /Regra: capa|definir a seção na estrutura final|Prompts das imagens/);
  /* Nenhuma linha com plano fica abaixo de dois respiros. */
  for (const entrada of [entradaGoogle(), entradaGoogleSaude(), entradaAmazon(true), entradaAmazon(false)]) {
    const plano = linha(entrada).plano_visual;
    if (!plano) continue;
    const respiros = Number(plano.match(/uma capa e (\d) respiro/)?.[1] ?? 0);
    assert.ok(respiros >= 2 && respiros <= 3, plano.split("\n")[0]);
  }
});

/* ================================ 9 ================================ */

test("9 · o tipo da unidade: landing page, página de serviço e review falam de si; o artigo continua como era", () => {
  assert.equal(radarWritingUnitOf({ article: { contentType: null } as never }).noun, "artigo");
  assert.equal(radarWritingUnitOf({ article: { contentType: "article" } as never }).noun, "artigo");
  assert.equal(radarWritingUnitOf({ article: { contentType: "landing_page" } as never }).noun, "landing page");
  assert.equal(radarWritingUnitOf({ article: { contentType: "service_page" } as never }).noun, "página de serviço");
  assert.equal(radarWritingUnitOf({ article: { contentType: "review" } as never }).noun, "review");

  const comTipo = (tipo: string | null) => entradaGoogle({ article: { ...entradaGoogle().article, contentType: tipo } });
  const artigo = buildRadarWritingExportArticle(comTipo(null), AVULSO);
  assert.equal("unitNoun" in artigo, false, "no artigo, o objeto não ganha chave nova");
  assert.deepEqual(buildRadarWritingExportArticle(comTipo("article"), AVULSO), artigo, "\"article\" e sem tipo são o mesmo");

  const landing = linha(comTipo("landing_page"));
  assert.match(landing.prompt, /^Escreva em português do Brasil a landing page descrita nesta linha/);
  assert.doesNotMatch(landing.prompt, /data de atualização visível/, "landing page não pede data de atualização");
  assert.match(landing.artigo, /^Formato: Landing page/m);
  assert.match(landing.plano_visual, /função: Representar visualmente a promessa principal da landing page/);

  const servico = buildRadarWritingExportArticle(comTipo("service_page"), { ...AVULSO, publication: PUBLICACAO_SEM_POLITICA });
  assert.equal(servico.unitNoun, "página de serviço");
  assert.match(servico.row.prompt, /\nNesta página de serviço:\n/);
  assert.match(servico.row.prompt, /- Página de serviço publicada: é atualização; preserve URL, slug e canonical/);

  const review = linha(comTipo("review"));
  assert.match(review.prompt, /^Escreva em português do Brasil o review descrito nesta linha/);
  assert.match(review.prompt, /com a data de atualização visível/, "review é editorial: a data continua");

  /* A linha de topo fala de "artigos e páginas" só quando o arquivo tem página. */
  const misto = radarPortableWritingExport({
    articles: montadasDoSilo().map((item, indice) => (indice === 0 ? { ...item, entrada: comTipo("landing_page") } : item)),
    lenses: LEITURA_DAS_LENTES, plan: null, today: EXPORTADO_EM,
  }).csv || "";
  assert.match(misto, /Regras gerais para todos os artigos e páginas deste arquivo/);
  assert.match(misto, /só os indicados em cada artigo ou página \(L1, L2…\)/);
  const soArtigos = radarPortableWritingExport({ articles: montadasDoSilo(), lenses: LEITURA_DAS_LENTES, plan: null, today: EXPORTADO_EM }).csv || "";
  assert.match(soArtigos, /Regras gerais para todos os artigos deste arquivo/);
  assert.doesNotMatch(soArtigos, /artigo ou página/);

  /* O CSV de vídeo leva o público à página que a linha descreve. */
  const video = radarPortableVideoExport({ articles: [{ entrada: comTipo("landing_page") }], today: EXPORTADO_EM }).csv;
  assert.match(video, /CTA para a landing page \(\/skincare-facial\)/);
  assert.match(video, /o link da landing page/);
  assert.match(video, /Cada vídeo leva o público para o artigo ou a página da marca/);
});

test("os limites de célula e de artigo continuam valendo com as linhas novas", () => {
  for (const entrada of [entradaGoogle(), entradaGoogleSaude(), entradaAmazon(true)]) {
    const row = linha(entrada, { ...AVULSO, topRowLabel: "Silo", silo: planoDoSilo().files[0].writing! });
    for (const coluna of RADAR_WRITING_EXPORT_COLUMNS) {
      const limite = radarWritingCellLimit(coluna);
      assert.ok(row[coluna].length <= limite, `${coluna}: ${row[coluna].length}`);
    }
    assert.ok(tudo(row).length <= RADAR_WRITING_EXPORT_LIMITS.articleChars + RADAR_WRITING_EXPORT_COLUMNS.length);
  }
});

test("PROVIDER_CALLS = 0 e AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
