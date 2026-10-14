import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RADAR_AUTHORITY_SOURCES_VERSION,
  RadarAuthoritySourcesRecordSchema,
  radarAuthoritySourcesUnavailable,
  type RadarAuthoritySourcesRecord,
  type RadarAuthorityVerifiedSource,
} from "../lib/radar/authority-sources-contract.ts";
import {
  RADAR_AUTHORITY_BODY_LINKS,
  RADAR_AUTHORITY_WRITING_RULES_VERSION,
  radarAuthorityAnchor,
  radarAuthorityBodyLinkRange,
  radarAuthorityLinksInPlan,
  radarAuthorityWritingOf,
} from "../lib/radar/authority-sources-writing.ts";
import {
  RADAR_ARTICLE_BLUEPRINT_RULES_VERSION,
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarArticleBlueprintPrompt,
  radarArticleBlueprintRulesNoticeText,
  radarArticleBlueprintYmylWithoutSource,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import { buildRadarEvidenceBundleFromAnalysis } from "../lib/radar/evidence-bundle-runtime.ts";
import { radarPortableAuthorityRequirementsMarkdown } from "../lib/radar/portable-dossier-gaps.ts";
import { RADAR_WRITING_EXPORT_COLUMNS, buildRadarWritingExportArticle, type RadarWritingArticleContext } from "../lib/radar/portable-writing-export.ts";
import { PLATFORM_OPERATIONS } from "../lib/agent/platform-catalog.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import { ARTIGO, entradaGoogle } from "./radar-portable-writing-fixtures.mts";
import { respostaDaPlanta } from "./radar-piloto-planta-fixtures-2026-10-09.mts";
import {
  PRINCIPAL_NATURAL_DO_CASO,
  PUBLICACAO_DO_CASO_REAL,
  SILO_DO_CASO_REAL,
  contextoDoCasoReal,
  entradaDoCasoRealComSerp,
  plantaDoCasoReal,
} from "./fixtures/silo-interligado-caso-real-2026-10-14.mts";

/*
 * ===== 2026-10-14c · F-B · FONTES EXTERNAS DE AUTORIDADE NO TEXTO (SDD silo interligado §16.2) =====
 *
 * Autorização do dono (2026-10-14): links externos de autoridade no corpo dos
 * artigos — Google, governo (Ministério da Saúde etc.) e Wikipédia em português —,
 * porque aumentam autoridade e credibilidade; o nicho dele é saúde (YMYL).
 *
 * Provas, sobre o caso real (Suporte "captação de pacientes dentista") e sobre um
 * caso de saúde (bruxismo, com uma afirmação de saúde COM e outra SEM fonte
 * verificada):
 *   - a régua única (quem vira link, a âncora no nome da entidade, a faixa 2–5);
 *   - o pacote congelado leva o registro da Fase A (e o hash de antes sem ele);
 *   - o pedido (regra 7 nova, as fontes X com o trecho e a afirmação, a lista YMYL);
 *   - a conferência (faixa 2–5, a afirmação de saúde sem fonte conferida);
 *   - o CSV "Para escrever" (o núcleo de get_article_for_writing): a coluna
 *     fontes_e_especialista curta, os links na estrutura, nenhuma URL inventada,
 *     a planta gravada lida sem IA e sem mudar o payload (D6).
 * Sem rede, sem IA, sem banco.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => { idasAoServidor.push(String(entrada)); return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")); },
  writable: true, configurable: true,
});

const linhas = (texto: string) => texto.split("\n");
const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

/* ============================== as fixtures ============================== */

const fonte = (patch: Partial<RadarAuthorityVerifiedSource> & Pick<RadarAuthorityVerifiedSource, "id" | "url" | "entity" | "kind" | "claim">): RadarAuthorityVerifiedSource => ({
  domain: new URL(patch.url).hostname.replace(/^www\./, ""), origin: "concorrente", title: "", excerpt: "", publishedAt: null,
  checkedAt: "2026-10-14T12:00:00.000Z", claimId: null, ymyl: false, citedByCompetitors: 1, matchedTerms: [], ...patch,
});

const registro = (verified: RadarAuthorityVerifiedSource[], ymylClaims: RadarAuthoritySourcesRecord["ymylClaims"] = []): RadarAuthoritySourcesRecord => RadarAuthoritySourcesRecordSchema.parse({
  version: RADAR_AUTHORITY_SOURCES_VERSION, status: "CHECKED", unavailableReason: null, checkedAt: "2026-10-14T12:00:00.000Z",
  list: { origin: "padrao", brandDnaVersionId: null, domains: 26 }, candidates: verified.length + 1, checked: verified.length + 1, notChecked: 0, limit: 8,
  verified,
  failures: [{ url: "https://www.anvisa.gov.br/sumiu", domain: "anvisa.gov.br", entity: "Anvisa", kind: "governo", origin: "resumo_ia", code: "not_found", reason: "a página não existe (404)", status: 404 }],
  ymylClaims, notes: [], cost: { providerCalls: 0, aiCalls: 0, pageFetches: verified.length + 1, robotsFetches: 2 },
});

/* --- o caso real: o CFO (o resumo de IA cita), a Ajuda do Google, a Wikipédia e um blog do mercado --- */
const CFO = "https://website.cfo.org.br/codigo-de-etica/";
const GOOGLE = "https://support.google.com/business/answer/7091";
const WIKI = "https://pt.wikipedia.org/wiki/Otimiza%C3%A7%C3%A3o_para_motores_de_busca";
const BLOG = "https://blog-de-marketing-exemplo.com.br/trafego-organico";
const REGISTRO_DO_CASO = () => registro([
  fonte({ id: "X1", url: CFO, entity: "Conselho Federal de Odontologia (CFO)", kind: "conselho", origin: "resumo_ia", title: "Código de Ética Odontológica", claim: "regras do CRO para publicidade", claimId: "claim:cro", excerpt: "É vedado ao cirurgião-dentista anunciar resultados de tratamento e usar imagens de antes e depois na publicidade." }),
  fonte({ id: "X2", url: GOOGLE, entity: "Ajuda do Google", kind: "documentacao_google", origin: "serp_organico", title: "Dicas para melhorar a classificação local no Google", claim: "Perfil da Empresa no Google", claimId: "claim:perfil", excerpt: "Os resultados locais se baseiam principalmente em relevância, distância e destaque do Perfil da Empresa." }),
  fonte({ id: "X3", url: WIKI, entity: "Wikipédia", kind: "enciclopedia", origin: "entidade_wikipedia", title: "Otimização para motores de busca", claim: "Definição e contexto de \"busca orgânica\"", excerpt: "A otimização para motores de busca é o processo de melhorar a posição de páginas nos resultados orgânicos." }),
  fonte({ id: "X4", url: BLOG, entity: "blog-de-marketing-exemplo.com.br", kind: "mercado", title: "Tráfego orgânico", claim: "tráfego orgânico leva tempo", citedByCompetitors: 2 }),
]);
const entradaDoCasoComFontes = (): RadarPortableExportInput => ({ ...entradaDoCasoRealComSerp(), authoritySources: REGISTRO_DO_CASO() });

/* --- o caso de saúde: bruxismo, com uma afirmação de saúde COM fonte (PubMed) e outra SEM --- */
const GOV = "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/b/bruxismo";
const PUBMED = "https://pubmed.ncbi.nlm.nih.gov/9999/";
const AFIRMACAO_SEM_FONTE = "Dosagem de relaxante muscular para bruxismo";
const REGISTRO_DE_SAUDE = () => registro([
  fonte({ id: "X1", url: GOV, entity: "Ministério da Saúde", kind: "governo", title: "Bruxismo", claim: "Causas do bruxismo", claimId: "claim:causas", excerpt: "Entre as causas do bruxismo estão o estresse, a ansiedade e alterações do sono." }),
  fonte({ id: "X2", url: PUBMED, entity: "PubMed", kind: "cientifica", title: "Bruxism treatment in pregnancy", claim: "Tratamento do bruxismo na gravidez", claimId: "claim:gravidez", ymyl: true, excerpt: "O tratamento do bruxismo na gravidez priorizou placas oclusais e cuidados não medicamentosos." }),
], [
  { claimId: "claim:gravidez", claim: "Tratamento do bruxismo na gravidez", relevance: "HIGH", sourceIds: ["X2"] },
  { claimId: "claim:dose", claim: AFIRMACAO_SEM_FONTE, relevance: "HIGH", sourceIds: [] },
]);
const entradaDeSaude = (comRegistro = true): RadarPortableExportInput => {
  const base = entradaGoogle();
  return {
    ...base,
    article: { ...base.article, principalKeyword: "bruxismo", secondaryKeywords: [], siloName: null, articleRole: null, slug: "bruxismo", mustCover: [], audience: "Adultos que rangem os dentes e querem entender o tratamento.", promise: null },
    ...(comRegistro ? { authoritySources: REGISTRO_DE_SAUDE() } : {}),
  };
};
const contextoAvulso = (blueprint: RadarArticleBlueprintPayload | null): RadarWritingArticleContext => ({ topRowLabel: "Marca", filePosition: 1, silo: null, articleId: ARTIGO, publication: null, blueprint });

/* ============================== 1 · a régua única ============================== */

test("F-B · régua: só a fonte verificada de autoridade vira link (saúde primeiro); o mercado fica como referência; a âncora traz o nome da entidade", () => {
  const caso = radarAuthorityWritingOf(REGISTRO_DO_CASO())!;
  assert.deepEqual(caso.linkable.map(item => [item.id, item.anchor]), [
    ["X1", "segundo o Conselho Federal de Odontologia"],
    ["X2", "segundo a Ajuda do Google"],
    ["X3", "a Wikipédia define"],
  ]);
  assert.deepEqual(caso.references.map(item => [item.id, item.url]), [["X4", BLOG]], "a citada pelo mercado continua só referência");
  const saude = radarAuthorityWritingOf(REGISTRO_DE_SAUDE())!;
  assert.deepEqual(saude.linkable.map(item => [item.id, item.anchor, item.ymyl]), [
    ["X2", "um estudo indexado no PubMed", true],
    ["X1", "segundo o Ministério da Saúde", false],
  ], "a de saúde abre a fila");
  assert.deepEqual(saude.ymylWithoutSource, [AFIRMACAO_SEM_FONTE]);
  assert.ok(saude.supportedClaims.includes("Tratamento do bruxismo na gravidez"));
  /* As âncoras de cada tipo. */
  assert.equal(radarAuthorityAnchor({ entity: "Anvisa", kind: "governo" }), "segundo a Anvisa");
  assert.equal(radarAuthorityAnchor({ entity: "IBGE", kind: "governo" }), "segundo o IBGE");
  assert.equal(radarAuthorityAnchor({ entity: "Organização Mundial da Saúde (OMS)", kind: "governo" }), "segundo a Organização Mundial da Saúde");
  assert.equal(radarAuthorityAnchor({ entity: "Google Search Central (documentação oficial)", kind: "documentacao_google" }), "segundo a documentação do Google");
  /* Página comercial nunca vira link, mesmo de domínio que o dono pôs na lista. */
  const comercial = radarAuthorityWritingOf(registro([fonte({ id: "X1", url: "https://loja-exemplo.com.br/produto/placa-de-bruxismo", entity: "Loja", kind: "lista_da_marca", claim: "placa de bruxismo" })]))!;
  assert.equal(comercial.linkable.length, 0);
  assert.match(comercial.references[0].reason, /comercial/);
  /* Concorrente comercial da SERP na lista da Marca também não. */
  const concorrente = radarAuthorityWritingOf(registro([fonte({ id: "X1", url: "https://www.prospectaodonto.com.br/blog", entity: "Prospecta", kind: "lista_da_marca", claim: "captação" })]), { competitorDomains: ["prospectaodonto.com.br"] })!;
  assert.match(concorrente.references[0].reason, /concorrente da SERP/);
  /* Sem registro, nada; sem conferência, dito. */
  assert.equal(radarAuthorityWritingOf(null), null);
  assert.equal(radarAuthorityWritingOf(radarAuthoritySourcesUnavailable("timeout", "2026-10-14T12:00:00.000Z"))!.status, "UNAVAILABLE");
});

test("F-B · limite: de 2 a 5 links no corpo com fontes verificadas; menos só quando houver menos; nunca inventar", () => {
  assert.deepEqual(radarAuthorityBodyLinkRange(0), { min: 0, max: 0 });
  assert.deepEqual(radarAuthorityBodyLinkRange(1), { min: 1, max: 1 });
  assert.deepEqual(radarAuthorityBodyLinkRange(3), { min: 2, max: 3 });
  assert.deepEqual(radarAuthorityBodyLinkRange(8), { min: RADAR_AUTHORITY_BODY_LINKS.min, max: RADAR_AUTHORITY_BODY_LINKS.max });
  const secao = (h2: string, links: Array<string | null> = []) => ({ h2, readerQuestion: `${h2}?`, answerFirst: h2, h3: [], explain: [], practical: null, externalLinks: links.map(source => ({ claim: `afirmação de ${h2}`, sourceType: "oficial", source })) });
  const sete = Array.from({ length: 7 }, (_, indice) => ({ id: `X${indice + 1}`, claim: `tema ${indice + 1}`, entity: `Entidade ${indice + 1}`, kind: "governo" as const, ymyl: indice === 6 }));
  /* 7 fontes e 7 links: fechando, ficam 5 — a de saúde (X7) fica. */
  const demais = [secao("A", ["X1", "X2"]), secao("B", ["X3", "X4"]), secao("C", ["X5", "X6"]), secao("D", ["X7"])];
  const aberta = radarAuthorityLinksInPlan(demais, sete);
  assert.match(aberta.notes[0], /^Links externos de autoridade: 7 no corpo; o teto é 5/);
  const fechada = radarAuthorityLinksInPlan(demais, sete, { close: true });
  assert.equal(fechada.count, 5);
  assert.ok(fechada.sections.some(item => item.externalLinks.some(link => link.source === "X7")), "a de saúde fica");
  assert.equal(fechada.removed.length, 2);
  /* 3 fontes e nenhum link: fechando, entram 2, na seção que trata da afirmação. */
  const tres = [{ id: "X1", claim: "regras do conselho", entity: "Conselho", kind: "conselho" as const }, { id: "X2", claim: "perfil no Google", entity: "Ajuda do Google", kind: "documentacao_google" as const }, { id: "X3", claim: "busca orgânica", entity: "Wikipédia", kind: "enciclopedia" as const }];
  const vazias = [secao("O que o conselho permite"), secao("O perfil no Google"), secao("Como medir")];
  assert.match(radarAuthorityLinksInPlan(vazias, tres).notes[0], /0 no corpo; com 3 fonte\(s\) X verificada\(s\) no pacote, ponha de 2 a 3/);
  const posta = radarAuthorityLinksInPlan(vazias, tres, { close: true });
  assert.deepEqual(posta.added, [{ id: "X1", section: "O que o conselho permite" }, { id: "X2", section: "O perfil no Google" }]);
  /* 1 fonte: 1 link basta; nenhuma fonte de autoridade: nada muda (nunca inventa). */
  assert.equal(radarAuthorityLinksInPlan([secao("A", ["X1"])], [tres[0]]).notes.length, 0);
  const semFonte = radarAuthorityLinksInPlan(vazias, [{ id: "X1", claim: "fonte de antes, sem entidade" }], { close: true });
  assert.equal(semFonte.notes.length, 0);
  assert.deepEqual(semFonte.sections.map(item => item.externalLinks.length), [0, 0, 0]);
});

/* ============================== 2 · o pacote congelado ============================== */

test("F-B · pacote congelado: o registro da Fase A viaja no dossiê como foi gravado; sem ele (ou fora do contrato), o hash é o de antes", () => {
  const base = {
    payload: { finalizedBundle: { frozenAt: "2026-10-14T13:00:00.000Z", frozenBy: "u", limitations: [] } },
    article: { brandId: "m", articleId: "artigo-1", articleDnaVersionId: "dna-1", articleDnaContentHash: `sha256:${"a".repeat(64)}` },
    competitiveBlueprint: null, observedAt: "2026-10-14T13:00:00.000Z",
  };
  const antes = buildRadarEvidenceBundleFromAnalysis(base as never) as { ok: true; bundle: Record<string, unknown> & { bundleHash: string } };
  assert.ok(antes.ok);
  assert.equal("authoritySources" in antes.bundle, false);
  const comRegistro = buildRadarEvidenceBundleFromAnalysis({ ...base, payload: { ...base.payload, authoritySources: REGISTRO_DE_SAUDE() } } as never) as typeof antes;
  assert.deepEqual(comRegistro.bundle.authoritySources, REGISTRO_DE_SAUDE());
  assert.notEqual(comRegistro.bundle.bundleHash, antes.bundle.bundleHash, "conteúdo novo, identidade nova");
  const invalido = buildRadarEvidenceBundleFromAnalysis({ ...base, payload: { ...base.payload, authoritySources: { status: "OK" } } } as never) as typeof antes;
  assert.equal(invalido.bundle.bundleHash, antes.bundle.bundleHash, "registro fora do contrato não entra");
  /* O formato completo diz as fontes conferidas (a conferência chave a chave do dossiê). */
  const completo = radarPortableAuthorityRequirementsMarkdown({ profile: "GOOGLE", observed: null, authoritySources: REGISTRO_DE_SAUDE() });
  assert.match(completo, /^## Fontes externas de autoridade conferidas$/m);
  assert.match(completo, /^- X2 · PubMed \(científica\) · https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/9999\/ · sustenta "Tratamento do bruxismo na gravidez" · afirmação de saúde \(YMYL\)$/m);
  assert.equal(radarPortableAuthorityRequirementsMarkdown({ profile: "GOOGLE", observed: null }).includes("Fontes externas"), false);
  /* E o export liga o registro do pacote à entrada (o núcleo da rota e do MCP). */
  const nucleo = semComentarios(readFileSync("lib/server/radar-portable-export-core.ts", "utf8"));
  assert.match(nucleo, /bundle\.authoritySources \? \{ authoritySources: bundle\.authoritySources \} : \{\}/);
});

/* ============================== 3 · o pedido ============================== */

const briefDoCaso = () => buildRadarArticleBlueprintBrief({ entrada: entradaDoCasoComFontes(), silo: SILO_DO_CASO_REAL(), articleId: ARTIGO, publication: PUBLICACAO_DO_CASO_REAL });

test("F-B · pedido: a regra 7 (2 a 5, na frase, âncora com a entidade, nenhuma URL fora das X, YMYL) e as fontes X com o trecho e a afirmação", () => {
  const brief = briefDoCaso();
  assert.deepEqual(brief.sources.map(item => [item.id, item.entity, item.url]), [["X1", "Conselho Federal de Odontologia (CFO)", CFO], ["X2", "Ajuda do Google", GOOGLE], ["X3", "Wikipédia", WIKI]]);
  const { system, user } = radarArticleBlueprintPrompt(brief);
  assert.match(system, /^7\. Links externos \(regras 2026-10-14c\): só onde uma afirmação precisa de reforço, e só com a fonte X do pacote/m);
  assert.match(system, /ponha de 2 a 5 links externos no corpo \(menos só quando houver menos fontes X\), cada um na seção e na frase que ele sustenta/);
  assert.match(system, /a âncora é natural, com o nome da entidade \('segundo o Ministério da Saúde', 'a Wikipédia define…'\)/);
  assert.match(system, /Nunca uma URL fora das fontes X, nunca link para concorrente comercial/);
  assert.match(system, /SAÚDE \(YMYL\): a afirmação de saúde listada sem fonte verificada não é afirmada como fato/);
  assert.match(user, /^- X1 · Conselho Federal de Odontologia \(CFO\) \(conselho profissional\) · https:\/\/website\.cfo\.org\.br\/codigo-de-etica\/ · sustenta "regras do CRO para publicidade" · trecho: "É vedado ao cirurgião-dentista anunciar resultados[^"]*" · âncora no nome da entidade: "segundo o Conselho Federal de Odontologia"$/m);
  const bloco = user.slice(user.indexOf("## Fontes verificadas (id X)"), user.indexOf("\n\n", user.indexOf("## Fontes verificadas (id X)")));
  assert.equal(bloco.includes(BLOG), false, "a do mercado não é fonte X");
  /* Caso de saúde: a lista das afirmações de saúde sem fonte vai ao pedido. */
  const saude = buildRadarArticleBlueprintBrief({ entrada: entradaDeSaude(), silo: null, articleId: ARTIGO, publication: null });
  assert.deepEqual(saude.ymylWithoutSource, [AFIRMACAO_SEM_FONTE]);
  assert.match(radarArticleBlueprintPrompt(saude).user, /^## Afirmações de saúde SEM fonte verificada \(YMYL: não afirmar como fato; delimitar ou omitir\)\n- Dosagem de relaxante muscular para bruxismo$/m);
  /* Sem o registro, o pacote é o de antes (sem a chave, sem fonte X nova). */
  const semRegistro = buildRadarArticleBlueprintBrief({ entrada: entradaDeSaude(false), silo: null, articleId: ARTIGO, publication: null });
  assert.equal("ymylWithoutSource" in semRegistro, false);
  assert.equal(semRegistro.sources.some(item => item.entity), false);
});

/* ============================== 4 · a conferência (caso real) ============================== */

const H2 = [
  "Por que a agenda sobe com o anúncio e cai quando ele para",
  "O que o paciente da sua região vê quando procura um dentista",
  "As perguntas da recepção que viram páginas, e o que o CRO permite publicar",
  "Como saber se está funcionando: do clique ao paciente na cadeira",
];
const RESPOSTAS = [
  "A agenda depende do anúncio quando o consultório não é achado sem ele.",
  "Ele vê o Perfil da Empresa no Google, as avaliações e o site.",
  "As dúvidas da recepção viram páginas, dentro das regras do CRO para publicidade.",
  "Meça do clique ao agendamento, não só as visitas.",
];
function respostaDoCaso(brief: ReturnType<typeof briefDoCaso>, links: Array<Array<{ claim: string; source: string | null }>>) {
  const ai = RadarArticleBlueprintAiSchema.parse(respostaDaPlanta(brief, { title: { principalNatural: PRINCIPAL_NATURAL_DO_CASO, h1: "Captação de pacientes para dentista com estrutura própria", alternatives: ["Menos dicas, mais estrutura no consultório", "Seu consultório aparece na região? O diagnóstico antes da campanha"], seoTitle: "Captação de pacientes para dentista sem depender de anúncio", metaDescription: "O que o paciente vê quando procura dentista perto dele e o que fazer primeiro." } }));
  ai.sections = H2.map((h2, indice) => ({ ...(ai.sections[indice] ?? ai.sections[0]), h2, readerQuestion: `${h2}?`, answerFirst: RESPOSTAS[indice], externalLinks: (links[indice] || []).map(link => ({ ...link, sourceType: "oficial" })) }));
  return ai;
}

test("F-B · conferência (caso real): 1 link de autoridade com 3 fontes X → pendência; fechando, a fonte que falta entra na seção que trata da afirmação, sem IA; URL de fonte inventada vira 'a obter'", () => {
  const brief = briefDoCaso();
  const ai = respostaDoCaso(brief, [[], [], [{ claim: "O Conselho Federal de Odontologia veda anunciar resultado de tratamento.", source: "X1" }], [{ claim: "Uma fonte inventada.", source: "X9" }]]);
  const aberta = radarSanitizeArticleBlueprint(ai, brief);
  assert.ok(aberta.notes.some(nota => /^Links externos de autoridade: 1 no corpo; com 3 fonte\(s\) X verificada\(s\) no pacote, ponha de 2 a 3/.test(nota)), aberta.notes.join("\n"));
  assert.ok(aberta.notes.some(nota => /fonte externa "X9" não existe no pacote/.test(nota)));
  const { payload, notes } = radarSanitizeArticleBlueprint(ai, brief, { close: true });
  assert.equal(payload.rulesVersion, RADAR_ARTICLE_BLUEPRINT_RULES_VERSION);
  assert.equal(RADAR_ARTICLE_BLUEPRINT_RULES_VERSION, "2026-10-14c"); /* 2026-10-14c · SDD silo interligado · F-B · decisão do dono: fontes externas de autoridade no texto. */
  const comFonte = payload.blueprint.sections.flatMap(secao => secao.externalLinks.filter(link => link.source).map(link => [secao.h2, link.source]));
  assert.deepEqual(comFonte, [[H2[1], "X2"], [H2[2], "X1"]], notes.join("\n"));
  assert.ok(notes.some(nota => nota === `Links externos de autoridade: X2 (Ajuda do Google) entrou na seção "${H2[1]}", na frase que sustenta "Perfil da Empresa no Google" (sem IA; regra 7).`));
  /* As fontes X da planta são as conferidas (a do mercado nunca), com a entidade e a âncora. */
  assert.deepEqual(payload.sources.map(item => item.url), [CFO, GOOGLE, WIKI]);
  assert.equal(payload.sources[0].anchor, "segundo o Conselho Federal de Odontologia");
  assert.equal(payload.measures.plan.externalLinks, 3, "2 links de autoridade e a afirmação da fonte inventada, delimitada");
});

/* ============================== 5 · o CSV "Para escrever" (o núcleo de get_article_for_writing) ============================== */

const URL_EM = /https?:\/\/[^\s)"]+/g;

test("F-B · caso real · ANTES → DEPOIS: a coluna fontes_e_especialista (curta) e a estrutura com os links X na frase; nenhuma URL fora das verificadas", () => {
  /* ANTES: o pacote sem a conferência (o CSV real de 14/10). */
  const antes = buildRadarWritingExportArticle(entradaDoCasoRealComSerp(), contextoDoCasoReal()).row;
  assert.ok(linhas(antes.fontes_e_especialista).includes("Fontes verificadas: nenhuma nesta investigação."));
  assert.doesNotMatch(antes.fontes_e_especialista, /Links externos de autoridade/);
  /* DEPOIS (planta nova, regras 2026-10-14c). */
  const brief = briefDoCaso();
  const planta = { ...radarSanitizeArticleBlueprint(respostaDoCaso(brief, [[], [], [{ claim: "O Conselho Federal de Odontologia veda anunciar resultado de tratamento.", source: "X1" }]]), brief, { close: true }).payload, approval: "APPROVED" as const };
  const linha = buildRadarWritingExportArticle(entradaDoCasoComFontes(), contextoDoCasoReal({ blueprint: planta })).row;
  const fontes = linhas(linha.fontes_e_especialista);
  assert.ok(fontes.includes("Links externos de autoridade (verificados pelo Radar; regras 2026-10-14c): de 2 a 3 no corpo, cada um na frase que ele sustenta, com âncora no nome da entidade; nenhuma outra URL externa. O trecho de cada fonte está no arquivo -serp.csv."), linha.fontes_e_especialista);
  assert.ok(fontes.includes(`- X1 · Conselho Federal de Odontologia (CFO) (conselho profissional) · ${CFO} · sustenta "regras do CRO para publicidade" · âncora no nome da entidade: "segundo o Conselho Federal de Odontologia" · na seção "${H2[2]}"`));
  assert.ok(fontes.includes(`- X2 · Ajuda do Google (documentação Google) · ${GOOGLE} · sustenta "Perfil da Empresa no Google" · âncora no nome da entidade: "segundo a Ajuda do Google" · na seção "${H2[1]}"`));
  assert.ok(fontes.includes(`- X4 · blog-de-marketing-exemplo.com.br · ${BLOG} — citada pelo mercado, fora da lista de autoridades da Marca: só referência, sem link`));
  assert.doesNotMatch(linha.fontes_e_especialista, /Fontes verificadas: nenhuma nesta investigação/);
  assert.doesNotMatch(linha.fontes_e_especialista, /trecho:/, "formato curto: o trecho fica no -serp.csv e no painel");
  const estrutura = linhas(linha.estrutura);
  assert.ok(estrutura.includes(`- Link externo X1 (Conselho Federal de Odontologia (CFO)): na frase "O Conselho Federal de Odontologia veda anunciar resultado de tratamento", âncora no nome da entidade ("segundo o Conselho Federal de Odontologia") → ${CFO}`), linha.estrutura);
  assert.ok(estrutura.includes(`- Link externo X2 (Ajuda do Google): na frase "Perfil da Empresa no Google", âncora no nome da entidade ("segundo a Ajuda do Google") → ${GOOGLE}`));
  /* Nenhuma URL inventada: todo link externo da estrutura e toda fonte X da coluna é uma das verificadas. */
  const verificadas = new Set([CFO, GOOGLE, WIKI]);
  for (const item of estrutura.filter(texto => texto.startsWith("- Link externo"))) for (const url of item.match(URL_EM) || []) assert.ok(verificadas.has(url), url);
  for (const item of fontes.filter(texto => /^- X\d+ · /.test(texto) && !texto.includes("só referência"))) for (const url of item.match(URL_EM) || []) assert.ok(verificadas.has(url), url);
  assert.equal(`${linha.estrutura}\n${linha.links_internos}`.includes(BLOG), false, "a do mercado nunca vira link");
  assert.deepEqual(Object.keys(linha), [...RADAR_WRITING_EXPORT_COLUMNS], "as 13 colunas, na mesma ordem");
  assert.equal(idasAoServidor.length, 0, "nada sai para a rede");
});

test("F-B · D6 · planta gravada (2026-10-11c) lida com o pacote novo: lista as fontes disponíveis com a seção sugerida, sem IA e sem mudar o payload nem o hash", () => {
  const planta = plantaDoCasoReal();
  const antes = JSON.stringify(planta);
  const linha = buildRadarWritingExportArticle(entradaDoCasoComFontes(), contextoDoCasoReal({ blueprint: planta })).row;
  assert.equal(JSON.stringify(planta), antes, "a planta gravada não muda");
  const fontes = linhas(linha.fontes_e_especialista);
  const x1 = fontes.find(item => item.startsWith("- X1 · Conselho Federal de Odontologia (CFO)"));
  assert.ok(x1, linha.fontes_e_especialista);
  /* A planta gravada não tem seção que trate das regras do CRO (só "publicação" em comum): nenhuma seção é inventada. */
  assert.doesNotMatch(x1!, /seção sugerida/);
  assert.ok(fontes.some(item => item.startsWith("- X3 · Wikipédia (enciclopédia)")));
  /* Com a seção que trata da afirmação (2 raízes em comum), a sugestão sai. */
  const comSecao = plantaDoCasoReal();
  comSecao.blueprint.sections[3] = { ...comSecao.blueprint.sections[3], answerFirst: "Antes de publicar, confira as regras do CRO para publicidade." };
  const sugerida = linhas(buildRadarWritingExportArticle(entradaDoCasoComFontes(), contextoDoCasoReal({ blueprint: comSecao })).row.fontes_e_especialista).find(item => item.startsWith("- X1 · "));
  assert.match(sugerida!, new RegExp(`seção sugerida: "${comSecao.blueprint.sections[3].h2}"`));
  assert.match(linha.estrutura, /^Links externos de autoridade \(regras 2026-10-14c; esta planta é anterior a elas\): use de 2 a 3 das fontes X da coluna fontes_e_especialista, cada uma na frase que ela sustenta/m);
  assert.doesNotMatch(linha.estrutura, /^- Link externo X\d/m, "os links nas frases só organizando de novo");
  /* O aviso da tela diz o que a 2026-10-14c acrescenta e o que a leitura já faz. */
  assert.match(radarArticleBlueprintRulesNoticeText({ rulesVersion: "2026-10-14b" })!, /^Esta versão foi montada com as regras de 2026-10-14b\. As de 2026-10-14c acrescentam as fontes externas de autoridade no texto/);
  assert.match(radarArticleBlueprintRulesNoticeText({ rulesVersion: "2026-10-11c" })!, /As de 2026-10-14c acrescentam as fontes externas de autoridade no texto[^]*já listam/);
  assert.equal(radarArticleBlueprintRulesNoticeText({ rulesVersion: RADAR_AUTHORITY_WRITING_RULES_VERSION }), null);
});

/* ============================== 6 · o caso de saúde (YMYL) ============================== */

const H2_SAUDE = ["Por que o bruxismo aparece", "Bruxismo na gravidez: o que muda no cuidado", "Remédio para bruxismo: quando o dentista indica", "Como saber se a placa está funcionando"];
function respostaDeSaude(brief: ReturnType<typeof buildRadarArticleBlueprintBrief>) {
  const ai = RadarArticleBlueprintAiSchema.parse(respostaDaPlanta(brief, { title: { principalNatural: "bruxismo", h1: "Ranger os dentes à noite: o que é bruxismo e como tratar", alternatives: ["Bruxismo sem susto: o que verificar", "Você range os dentes? O diagnóstico antes da placa"], seoTitle: "O que é bruxismo e como o tratamento funciona", metaDescription: "Por que o bruxismo aparece e o que o dentista verifica." } }, { semLinks: true }));
  const corpo = [
    { answerFirst: "As causas do bruxismo incluem estresse, ansiedade e alterações do sono.", explain: ["O dentista avalia o desgaste dos dentes."], externalLinks: [{ claim: "As causas do bruxismo incluem estresse e ansiedade.", sourceType: "governo", source: "X1" }] },
    { answerFirst: "O tratamento do bruxismo na gravidez prioriza placas oclusais e cuidados sem remédio.", explain: [], externalLinks: [] },
    { answerFirst: "Quem decide remédio é o profissional, depois da avaliação.", explain: ["A dosagem de relaxante muscular para bruxismo é de 10 mg à noite."], externalLinks: [] },
    { answerFirst: "Observe a dor ao acordar e o desgaste nas consultas.", explain: [], externalLinks: [] },
  ];
  ai.sections = H2_SAUDE.map((h2, indice) => ({ ...(ai.sections[indice] ?? ai.sections[0]), h2, readerQuestion: `${h2}?`, ...corpo[indice] }));
  return ai;
}

test("F-B · saúde (YMYL): a afirmação COM fonte verificada ganha o link (PubMed); a SEM fonte não é afirmada — pendência, e fechando fica delimitada; o CSV marca a frase", () => {
  const brief = buildRadarArticleBlueprintBrief({ entrada: entradaDeSaude(), silo: null, articleId: ARTIGO, publication: null });
  assert.deepEqual(brief.sources.filter(item => item.entity).map(item => [item.id, item.ymyl]), [["X2", true], ["X1", false]]);
  const ai = respostaDeSaude(brief);
  const aberta = radarSanitizeArticleBlueprint(ai, brief);
  assert.ok(aberta.notes.some(nota => nota.startsWith(`Seção "${H2_SAUDE[2]}" afirma "A dosagem de relaxante muscular para bruxismo é de 10 mg à noite." — afirmação de saúde sem fonte verificada (YMYL): delimite ou omita`)), aberta.notes.join("\n"));
  assert.ok(aberta.notes.some(nota => /^Links externos de autoridade: 1 no corpo; com 2 fonte\(s\) X verificada\(s\) no pacote, ponha de 2 a 2[^]*X2 \(PubMed, na seção "Bruxismo na gravidez/.test(nota)), aberta.notes.join("\n"));
  const { payload } = radarSanitizeArticleBlueprint(ai, brief, { close: true });
  const daSecao = (h2: string) => payload.blueprint.sections.find(secao => secao.h2 === h2)!.externalLinks;
  assert.deepEqual(daSecao(H2_SAUDE[1]).map(link => link.source), ["X2"], "a afirmação de saúde COM fonte ganha o link da fonte verificada");
  assert.deepEqual(daSecao(H2_SAUDE[2]).map(link => [link.claim, link.source]), [[AFIRMACAO_SEM_FONTE, null]], "a SEM fonte fica delimitada, sem link");
  /* A régua pura também: a frase coberta pela fonte X da seção passa. */
  const conferida = radarArticleBlueprintYmylWithoutSource(payload.blueprint.sections, [AFIRMACAO_SEM_FONTE, "Tratamento do bruxismo na gravidez"], payload.sources);
  assert.equal(conferida.notes.length, 0, "depois de fechar, nada pendente (a delimitada e a sustentada)");

  /* O CSV: o link do PubMed na frase com a âncora; a dosagem marcada e listada; a coluna de fontes diz a de saúde sem fonte. */
  const linha = buildRadarWritingExportArticle(entradaDeSaude(), contextoAvulso({ ...payload, approval: "APPROVED" })).row;
  const estrutura = linhas(linha.estrutura);
  assert.ok(estrutura.includes(`- Link externo X2 (PubMed): na frase "Tratamento do bruxismo na gravidez", âncora no nome da entidade ("um estudo indexado no PubMed") → ${PUBMED}`), linha.estrutura);
  assert.ok(estrutura.includes(`- Link externo X1 (Ministério da Saúde): na frase "As causas do bruxismo incluem estresse e ansiedade", âncora no nome da entidade ("segundo o Ministério da Saúde") → ${GOV}`));
  assert.ok(estrutura.some(item => item.startsWith("- Explicar: A dosagem de relaxante muscular para bruxismo é de 10 mg à noite") && item.includes("(precisa de fonte:")), linha.estrutura);
  assert.ok(estrutura.includes(`- Sem link externo: "${AFIRMACAO_SEM_FONTE}" fica delimitada no texto (precisa de fonte: oficial de saúde).`));
  assert.match(linha.fontes_e_especialista, /^Afirmações de saúde sem fonte verificada \(YMYL; não afirme como fato: delimite ou omita\): "Dosagem de relaxante muscular para bruxismo"\.$/m);
  for (const item of estrutura.filter(texto => texto.startsWith("- Link externo"))) for (const url of item.match(URL_EM) || []) assert.ok([GOV, PUBMED].includes(url), url);
  /* Sem o registro, a coluna é a de antes (sem a lista de saúde nova). */
  assert.doesNotMatch(buildRadarWritingExportArticle(entradaDeSaude(false), contextoAvulso({ ...payload, approval: "APPROVED" })).row.fontes_e_especialista, /Afirmações de saúde sem fonte verificada \(YMYL;/);
});

/* ============================== 7 · a estrutura e o catálogo ============================== */

test("F-B · a mesma régua no pedido, na conferência e no CSV; get_article_for_writing pelo mesmo núcleo; catálogo (AGENTS §17.1)", () => {
  const blueprint = semComentarios(readFileSync("lib/radar/article-blueprint.ts", "utf8"));
  assert.match(blueprint, /radarAuthorityLinksInPlan\(malhaDaPlanta\.sections, brief\.sources/);
  const escrita = semComentarios(readFileSync("lib/radar/portable-writing-export.ts", "utf8"));
  assert.match(escrita, /fontesDeAutoridade: radarAuthorityWritingOf\(input\.authoritySources/);
  const mcp = semComentarios(readFileSync("lib/server/radar-mcp-material.ts", "utf8"));
  assert.match(mcp, /assembleRadarPortableExport/, "o MCP monta pelo mesmo núcleo do export");
  /* A régua única não abre página nem chama IA. */
  const regua = semComentarios(readFileSync("lib/radar/authority-sources-writing.ts", "utf8"));
  assert.equal(/\bfetch\(|generateStructuredAI|supabase/.test(regua), false);
  const texto = JSON.stringify(PLATFORM_OPERATIONS);
  assert.ok(texto.includes("Fontes externas de autoridade no texto (2026-10-14c"), "a nota da F-B no catálogo");
  /* A ferramenta não muda (o E0 trava a fonte do handler): ela já entrega "fontes, autoridade", e o CSV dela é o do núcleo. */
  const ferramenta = readFileSync("lib/server/platform-mcp-tools.ts", "utf8");
  const descricao = ferramenta.slice(ferramenta.indexOf("registerTool(\"get_article_for_writing\""), ferramenta.indexOf("registerTool(\"get_article_for_writing\"") + 1500);
  assert.match(descricao, /perguntas, fontes, autoridade/);
});
