import assert from "node:assert/strict";
import test from "node:test";
import {
  RADAR_ARTICLE_BLUEPRINT_RULES_VERSION,
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarArticleBlueprintPendingNotes,
  radarArticleBlueprintRulesNoticeText,
  radarSanitizeArticleBlueprint,
} from "../lib/radar/article-blueprint.ts";
import {
  radarHeadingStartsWithKeyword,
  radarKeywordCrudeFormPresent,
  radarKeywordOccurrences,
  radarKeywordWithinChars,
  radarTitleOptionsDistinct,
  radarTitleOptionsOpenedByKeyword,
  radarTitleProcessMark,
} from "../lib/radar/human-voice-guideline.ts";
import { buildRadarWritingExportArticle } from "../lib/radar/portable-writing-export.ts";
import { ARTIGO } from "./radar-portable-writing-fixtures.mts";
import { respostaDaPlanta } from "./radar-piloto-planta-fixtures-2026-10-09.mts";
import {
  CASO_REAL_ANTES,
  COMPLEMENTARES_DO_CASO,
  PRINCIPAL_DO_CASO,
  PRINCIPAL_NATURAL_DO_CASO,
  PUBLICACAO_DO_CASO_REAL,
  SILO_DO_CASO_REAL,
  contextoDoCasoReal,
  entradaDoCasoReal,
  plantaDoCasoReal,
} from "./fixtures/silo-interligado-caso-real-2026-10-14.mts";

/*
 * ===== 2026-10-14 · O CASO REAL DO DONO (SDD silo interligado, §3, §13 e §15) =====
 *
 * F0 · o "antes": o registro literal do CSV e do docx do dono (fixture
 * `tests/fixtures/silo-interligado-caso-real-2026-10-14.mts`), lido pelas réguas
 * V1–V7. O registro não muda: estes testes valem depois de toda fase.
 *
 * F1 · o "depois" (D4, D5 e D6, decididas pelo dono em 2026-10-14):
 *   - a planta GRAVADA (regras 2026-10-11c, como as 8 do Silo piloto), lida sem
 *     IA e sem mudar o payload: o título sai sem marca de processo e o CSV diz,
 *     como instrução concluída, a forma natural, as opções e os H2 que abrem pela
 *     keyword, o teto e as variações;
 *   - a planta NOVA (regras 2026-10-14), com os títulos e H2 do "depois" do §13,
 *     passa na conferência sem nota de keyword.
 * O teste "antes no código" de F0 (o CSV de 2026-10-11c com a marca no título)
 * virou o "depois" de F1 abaixo: o comportamento que ele fixava é o que a F1
 * trocou. Sem rede, sem IA, sem banco.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE"));
  },
  writable: true, configurable: true,
});

const linhaDoCaso = (extra: Parameters<typeof contextoDoCasoReal>[0] = {}) => buildRadarWritingExportArticle(entradaDoCasoReal(), contextoDoCasoReal(extra)).row;
const linhasDe = (texto: string) => texto.split("\n");
const KEYWORDS = [PRINCIPAL_DO_CASO, ...COMPLEMENTARES_DO_CASO];
const abrePorKeyword = (h2: string) => KEYWORDS.some(keyword => radarHeadingStartsWithKeyword(h2, keyword));

/* ============================== F0 · o antes, registrado ============================== */

test("F0 · antes registrado · as 9 opções de título e meta abrem pela mesma frase; H1, SEO title e meta levam \"(precisa de fonte\"", () => {
  const { csv, docx } = CASO_REAL_ANTES;
  const opcoesDoCsv = [csv.h1, ...csv.alternatives, csv.seoTitle, csv.metaDescription];
  for (const opcao of opcoesDoCsv) assert.ok(radarHeadingStartsWithKeyword(opcao, PRINCIPAL_DO_CASO), `abre pela principal: ${opcao}`);
  for (const opcao of opcoesDoCsv) assert.ok(radarKeywordCrudeFormPresent(opcao, PRINCIPAL_DO_CASO), `a forma crua: ${opcao}`);
  for (const opcao of [...docx.h1, ...docx.seoTitle]) {
    assert.ok(radarHeadingStartsWithKeyword(opcao, PRINCIPAL_DO_CASO), `o docx corrigiu a preposição, mas manteve o prefixo: ${opcao}`);
    assert.equal(radarKeywordCrudeFormPresent(opcao, PRINCIPAL_DO_CASO), false, "o docx já usa a forma natural");
  }
  assert.equal(radarTitleOptionsOpenedByKeyword([csv.h1, ...csv.alternatives], PRINCIPAL_DO_CASO), 3, "V6: a principal abre as 3 opções");
  assert.equal(radarTitleOptionsDistinct([csv.h1, ...csv.alternatives], PRINCIPAL_DO_CASO).distinct, false, "V6: as 3 começam igual");
  assert.equal(radarTitleOptionsDistinct([...docx.h1], PRINCIPAL_DO_CASO).distinct, false, "V6: as 3 do docx também");
  for (const campo of [csv.h1, csv.seoTitle, csv.metaDescription]) assert.equal(radarTitleProcessMark(campo), "(precisa de fonte…)", "V4");
  assert.equal(csv.keywordPlacement, "Keyword principal em: H1, primeiro parágrafo, H2 da seção 1");
});

test("F0 · antes registrado · 2 de 5 H2 abrem por keyword (a principal crua e a complementar literal); 5 links; o Pilar com 3 de 7", () => {
  const { csv, silo } = CASO_REAL_ANTES;
  assert.deepEqual(csv.h2.filter(abrePorKeyword), [csv.h2[0], csv.h2[1]], "V1");
  assert.equal(csv.links.length, 5);
  assert.deepEqual([silo.articles, silo.supports, silo.pillarLinksInPlan, silo.graphPillarToSupport, silo.supportToSupportEdges], [8, 7, 3, 7, 0]);
});

/* ============================== F1 · a planta gravada, lida (D6) ============================== */

test("F1 · planta gravada · título, alternativas, SEO title e meta saem sem marca de processo; a afirmação travada continua na lista", () => {
  const gravada = plantaDoCasoReal();
  const antes = JSON.stringify(gravada);
  const linha = linhaDoCaso({ blueprint: gravada });
  const titulo = linhasDe(linha.titulo_e_seo);
  assert.equal(titulo[0], "H1: Captação de pacientes dentista sem anúncios: o que o orgânico entrega de verdade");
  assert.equal(titulo[2], "SEO title: Captação de pacientes dentista sem anúncios: o que o orgânico entrega");
  assert.equal(titulo[3], "Meta description: Captação de pacientes dentista sem anúncio: o que o orgânico entrega, o que cobra de você e por onde começar a rotina.");
  assert.doesNotMatch(linha.titulo_e_seo, /\(precisa de fonte/, "K8: nenhuma marca no título nem na meta");
  assert.match(linha.estrutura, /^Afirmações que só entram com fonte do pacote ou delimitadas \(regra geral 5\): "Captação de pacientes dentista sem anúncios: o que o orgânico entrega de verdade" \(afirmação sobre plataforma\)/m);
  assert.ok(titulo.includes("- Afirmação do título que só entra com fonte (está na lista do fim da coluna estrutura): no título publicado, escreva-a como promessa delimitada pela marca (o que ela verifica e entrega, sem efeito garantido) ou use outra opção; título e meta nunca levam marca."));
  assert.equal(JSON.stringify(gravada), antes, "o payload gravado não muda (nem o hash)");
});

test("F1 · planta gravada · a coluna de título diz a regra nova, a forma natural, as 3 opções que abrem pela keyword e os ângulos", () => {
  const titulo = linhasDe(linhaDoCaso().titulo_e_seo);
  assert.equal(titulo[4], "Keyword principal (K2, K5–K7): uma vez no H1 e uma vez no SEO title, na forma natural, em qualquer posição; no primeiro parágrafo, ela ou uma variação próxima nas primeiras ~100 palavras; em no máximo 1 H2, nunca no começo; no corpo, até 8 vezes; o resto em variações (estrutura, \"Keyword no corpo\").");
  assert.match(titulo[5], /^Título pela SERP \(regras de keyword 2026-10-14, diretriz de comunicação humana 2026-10-11\): 3 opções \(o H1 e as alternativas acima\); a keyword principal, na forma natural, aparece uma vez em cada uma, em qualquer posição, e abre no máximo 1 delas; cada opção tem um ângulo \(dor → saída; contraste com o que o topo da SERP promete/);
  assert.equal(titulo[6], "Forma natural da principal (K1): escreva \"captação de pacientes dentista\" em português correto (com a preposição e a flexão que a frase pede), uma vez no H1 e uma vez no SEO title; em título e H2, nunca a forma truncada.");
  assert.ok(titulo.includes("- Ajuste das opções: a keyword principal abre 3 das 3 opções; só 1 pode abrir por ela: nas outras, o gancho vem primeiro e a principal entra depois, natural."));
  assert.ok(titulo.some(item => item.startsWith("- Ajuste das opções: as 3 opções começam igual ou dizem o mesmo; dê a cada opção um ângulo: (a) dor → saída;")));
  assert.match(titulo[titulo.length - 1], /^Meta description pela SERP \(K4\): natural, com dor ou contraste/);
  for (const linha of titulo) {
    assert.doesNotMatch(linha, /comece pela keyword|keyword principal no começo|nos primeiros 60 caracteres;/, linha);
  }
});

test("F1 · planta gravada com a forma natural gravada · a coluna diz a natural e manda trocar a forma crua no título e no H2", () => {
  const gravada = plantaDoCasoReal({ title: { ...plantaDoCasoReal().blueprint.title, principalNatural: PRINCIPAL_NATURAL_DO_CASO } });
  const linha = linhaDoCaso({ blueprint: gravada });
  const titulo = linhasDe(linha.titulo_e_seo);
  assert.ok(titulo.includes(`Forma natural da principal (K1): "${PRINCIPAL_NATURAL_DO_CASO}"; a forma crua "${PRINCIPAL_DO_CASO}" não aparece em título nem em H2.`));
  assert.ok(titulo.includes(`- Ajuste do H1: troque a forma crua "${PRINCIPAL_DO_CASO}" pela natural "${PRINCIPAL_NATURAL_DO_CASO}".`));
  assert.match(linha.estrutura, new RegExp(`^- Abertura \\(K5\\): o primeiro parágrafo responde à busca com "${PRINCIPAL_NATURAL_DO_CASO}" ou uma variação próxima nas primeiras ~100 palavras`, "m"));
});

test("F1 · planta gravada · a estrutura diz os 2 H2 que abrem pela keyword, a abertura (K5), o teto (K7) e as complementares dentro da seção", () => {
  const estrutura = linhasDe(linhaDoCaso().estrutura);
  assert.ok(estrutura.includes("- H2 (K6): abre pela keyword \"captação de pacientes dentista\"; escreva este H2 pelo subtema ou pela pergunta da seção (\"O que é tráfego orgânico na captação de pacientes\"), com a keyword dentro da seção, não no começo do título."));
  assert.ok(estrutura.includes("- H2 (K6): abre pela keyword \"tráfego orgânico como fazer\"; escreva este H2 pelo subtema ou pela pergunta da seção (\"Como começar o tráfego orgânico sem equipe grande\"), com a keyword dentro da seção, não no começo do título."));
  assert.equal(estrutura.filter(item => item.startsWith("- H2 (K6):")).length, 2, "só os 2 H2 do registro");
  assert.ok(estrutura.some(item => item.startsWith("- H2 sem keyword no começo (K6): 2 H2 abrem pela keyword (")));
  assert.ok(estrutura.some(item => item.startsWith("- Abertura (K5): o primeiro parágrafo responde à busca com \"captação de pacientes dentista\" (na forma natural) ou uma variação próxima nas primeiras ~100 palavras")));
  assert.ok(estrutura.some(item => item.startsWith("- Keyword no corpo (K7): \"captação de pacientes dentista\" até 8 vezes no texto (2 + palavras/600, sobre até 4058 palavras do plano); o resto em variações: ")));
  assert.ok(estrutura.includes("- tráfego orgânico como fazer → dentro da seção 2 (Responde o passo a passo que a busca mostra.)"));
  assert.equal(estrutura.some(item => /^- Primeira frase do corpo|^- Primeiro H2:/.test(item)), false, "as linhas da regra antiga saíram");
});

test("F1 · planta gravada · o prompt da linha e os links do F1 (os 5 de antes; a malha é a F2)", () => {
  const linha = linhaDoCaso();
  assert.match(linha.prompt, /keyword principal natural, 1× no H1 e no SEO title, sem repetir; nenhum H2 abre por ela;/);
  assert.doesNotMatch(linha.prompt, /no começo do H1, na primeira frase, no primeiro H2/);
  assert.equal((linha.links_internos.match(/^L\d+ · /gm) || []).length, 5, "F1 não mexe nos links");
  assert.match(radarArticleBlueprintRulesNoticeText({ rulesVersion: "2026-10-11c" })!, /^Esta versão foi montada com as regras de 2026-10-11c\. As de 2026-10-14 acrescentam as regras de keyword e título 2026-10-14/);
});

/* ============================== F1 · a planta nova (conferência V1–V7) ============================== */

const briefDoCaso = () => buildRadarArticleBlueprintBrief({ entrada: entradaDoCasoReal(), silo: null, articleId: ARTIGO, publication: PUBLICACAO_DO_CASO_REAL });

/* Os títulos e os H2 do "depois" do §13 da SDD (exemplos do que as regras pedem). */
const TITULO_DEPOIS = {
  principalNatural: PRINCIPAL_NATURAL_DO_CASO,
  h1: "A agenda sobe com o anúncio e cai quando ele para? Captação de pacientes para dentista com estrutura própria",
  alternatives: [
    "Menos dicas, mais estrutura: a captação de pacientes para dentista que o Google encontra",
    "Seu consultório aparece para quem procura dentista na região? O diagnóstico antes da próxima campanha",
  ],
  seoTitle: "Captação de pacientes para dentista sem depender de anúncio",
  metaDescription: "Post, anúncio e agência e a agenda ainda oscila? Veja como site, perfil no Google e respostas às perguntas da recepção ajudam a captação de pacientes para dentista.",
};
const H2_DEPOIS = [
  "Por que a agenda sobe com o anúncio e cai quando ele para",
  "O que o paciente da sua região vê quando procura um dentista",
  "As perguntas da recepção que viram páginas, e o que o CRO permite publicar",
  "Agência de posts ou estrutura própria: como comparar quem executa",
  "Como saber se está funcionando: do clique ao paciente na cadeira",
];

function plantaNova(titulo: Record<string, unknown>, h2s: readonly string[], opcoes: { close?: boolean } = {}) {
  const brief = briefDoCaso();
  const resposta = respostaDaPlanta(brief, { title: titulo });
  const ai = RadarArticleBlueprintAiSchema.parse(resposta);
  ai.sections = h2s.map((h2, indice) => ({ ...(ai.sections[indice] ?? ai.sections[0]), h2, readerQuestion: `${h2}?` }));
  return radarSanitizeArticleBlueprint(ai, brief, opcoes);
}
const notasDeKeyword = (notas: readonly string[]) => notas.filter(nota => /\(regra 28, K\d\)|\(K\d\)/.test(nota));

test("F1 · planta nova com o depois do §13 · a principal natural 1× no H1 e no SEO title, abre no máximo 1 das 3, 3 ângulos, 0 H2 pela keyword: nenhuma nota de keyword", () => {
  const { payload, notes } = plantaNova(TITULO_DEPOIS, H2_DEPOIS);
  const titulo = payload.blueprint.title;
  assert.equal(titulo.principalNatural, PRINCIPAL_NATURAL_DO_CASO);
  assert.equal(radarKeywordOccurrences(titulo.h1, PRINCIPAL_DO_CASO), 1, "V3 no H1");
  assert.equal(radarKeywordOccurrences(titulo.seoTitle, PRINCIPAL_DO_CASO), 1, "V3 no SEO title");
  assert.ok(radarKeywordWithinChars(titulo.seoTitle, PRINCIPAL_DO_CASO), "K2: dentro dos primeiros 60");
  assert.ok(radarTitleOptionsOpenedByKeyword([titulo.h1, ...titulo.alternatives], PRINCIPAL_DO_CASO) <= 1, "V6");
  assert.ok(radarTitleOptionsDistinct([titulo.h1, ...titulo.alternatives], PRINCIPAL_DO_CASO).distinct, "K3: 3 ângulos");
  for (const opcao of [titulo.h1, ...titulo.alternatives, titulo.seoTitle, titulo.metaDescription]) assert.equal(radarKeywordCrudeFormPresent(opcao, PRINCIPAL_DO_CASO), false, `V5: ${opcao}`);
  assert.equal(payload.blueprint.sections.filter(secao => abrePorKeyword(secao.h2)).length, 0, "V1: 0 H2 pela keyword");
  assert.deepEqual(notasDeKeyword(notes), []);
  assert.equal(payload.rulesVersion, RADAR_ARTICLE_BLUEPRINT_RULES_VERSION);
  assert.equal(RADAR_ARTICLE_BLUEPRINT_RULES_VERSION, "2026-10-14c"); /* 2026-10-14c · SDD silo interligado · F-B · decisão do dono (§16.2): regras 2026-10-14c */
});

test("F1 · planta nova com o antes do CSV · a conferência aponta V1, V5 e V6 como pendência (a passada de correção resolve) e tira a marca de processo sem IA", () => {
  const titulo = {
    principalNatural: PRINCIPAL_NATURAL_DO_CASO,
    h1: CASO_REAL_ANTES.csv.h1,
    alternatives: [...CASO_REAL_ANTES.csv.alternatives],
    seoTitle: "Captação de pacientes dentista sem anúncios: o que o orgânico entrega",
    metaDescription: "Captação de pacientes dentista sem anúncio: o que o orgânico entrega e por onde começar.",
  };
  const { payload, notes } = plantaNova(titulo, CASO_REAL_ANTES.csv.h2);
  const pendentes = radarArticleBlueprintPendingNotes(notes).pending;
  const tem = (padrao: RegExp) => assert.ok(pendentes.some(item => padrao.test(item)), `${padrao}\n${pendentes.join("\n")}`);
  tem(/^A keyword principal abre 3 das 3 opções de título: ela abre no máximo 1; reescreva as outras com o gancho primeiro antes de aprovar \(regra 28, K2\)\.$/);
  tem(/^As opções de título repetem o começo ou o ângulo \(1 e 2; 1 e 3; 2 e 3\): reescreva antes de aprovar, uma por ângulo/);
  tem(/^O H1 usa a forma crua "captação de pacientes dentista": escreva "captação de pacientes para dentista" e reescreva antes de aprovar \(regra 28, K1\)\.$/);
  tem(/^O H2 "Captação de pacientes dentista sem anúncios começa pelo orgânico" começa pela keyword "captação de pacientes dentista": reescreva antes de aprovar/);
  tem(/^O H2 "Tráfego orgânico como fazer para captar pacientes no dia a dia" começa pela keyword "tráfego orgânico como fazer": reescreva antes de aprovar/);
  assert.equal(payload.blueprint.title.h1, "Captação de pacientes dentista sem anúncios: o que o orgânico entrega de verdade", "V4: a marca saiu, sem IA");
  assert.ok(notes.includes("K8: a marca de processo saiu do título, das alternativas, do SEO title ou da meta (título e meta nunca levam marca)."));
  assert.equal(notes.some(nota => /não começa pela keyword principal|nos primeiros 60 caracteres: reescreva|O primeiro H2 .* não traz a keyword/.test(nota)), false, "as notas da regra antiga saíram");
});

test("F1 · planta nova · fechando, o H1 com afirmação travada troca de lugar com a alternativa que passa (K8)", () => {
  const titulo = {
    principalNatural: PRINCIPAL_NATURAL_DO_CASO,
    h1: "Captação de pacientes para dentista: o orgânico enche a agenda da clínica",
    alternatives: [TITULO_DEPOIS.alternatives[0], TITULO_DEPOIS.h1],
    seoTitle: TITULO_DEPOIS.seoTitle,
    metaDescription: TITULO_DEPOIS.metaDescription,
  };
  const { payload, notes } = plantaNova(titulo, H2_DEPOIS, { close: true });
  assert.equal(payload.blueprint.title.h1, TITULO_DEPOIS.alternatives[0]);
  assert.deepEqual(payload.blueprint.title.alternatives, [titulo.h1, TITULO_DEPOIS.h1]);
  assert.ok(notes.includes("K8: o H1 fazia uma afirmação que só entra com fonte; a alternativa sem a afirmação virou o H1 (as opções trocaram de lugar, sem reescrever palavra)."));
  assert.deepEqual(idasAoServidor, []);
});

test("F1 · Silo do caso · o contexto da fixture é o Silo de 8 (o Pilar e 7 Suportes)", () => {
  const silo = SILO_DO_CASO_REAL();
  assert.equal(silo.members.length, 8);
  assert.equal(silo.members.filter(item => item.role === "Suporte").length, 7);
});
