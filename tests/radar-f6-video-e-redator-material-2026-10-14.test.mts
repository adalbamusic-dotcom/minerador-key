import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RADAR_AUTHORITY_SOURCES_VERSION,
  RadarAuthoritySourcesRecordSchema,
  type RadarAuthoritySourcesRecord,
  type RadarAuthorityVerifiedSource,
} from "../lib/radar/authority-sources-contract.ts";
import { buildRadarWritingExportArticle, type RadarWritingArticleContext } from "../lib/radar/portable-writing-export.ts";
import { radarPortableWritingArticles, radarPortableWritingExport } from "../lib/radar/portable-writing-batch.ts";
import {
  radarWritingMaterialClosingOf,
  radarWritingMaterialCompetitiveBlock,
  radarWritingMaterialOf,
} from "../lib/radar/portable-writing-material.ts";
import { buildRadarVideoExportArticle, radarPortableVideoExport, radarVideoPlan } from "../lib/radar/portable-video-export.ts";
import { radarVideoLongTemplate, radarVideoShortTarget, radarVideoTimeMarkers } from "../lib/radar/video-production.ts";
import { radarHumanVoiceVideoRule } from "../lib/radar/human-voice-guideline.ts";
import {
  WRITER_SILO_LINKS_UPDATE_LABEL,
  writerMaterialChecklist,
  writerMaterialChecklistForMcp,
  writerMaterialForFoundations,
  writerMaterialForMcp,
} from "../lib/redator/writer-material.ts";
import { writerMaterialOfAssembly } from "../lib/server/writer-material.ts";
import { PLATFORM_OPERATIONS } from "../lib/agent/platform-catalog.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import { ARTIGO, EXPORTADO_EM, LEITURA_DAS_LENTES } from "./radar-portable-writing-fixtures.mts";
import {
  PUBLICACAO_DO_CASO_REAL,
  SILO_DO_CASO_REAL,
  contextoDoCasoReal,
  entradaDoCasoRealComSerp,
  plantaDoCasoReal,
} from "./fixtures/silo-interligado-caso-real-2026-10-14.mts";

/*
 * ===== 2026-10-14 · F6 · O VÍDEO EM 4 PARTES E O REDATOR LÊ O MATERIAL NOVO (SDD silo interligado) =====
 *
 * Autorização do dono (2026-10-14): "pode sim" — o Redator e o CSV de vídeo leem
 * o que só chegava pelo CSV de escrita (análise competitiva, diferencial,
 * fechamento em 4 tempos, malha e trilha do Silo, fontes de autoridade e
 * afirmações YMYL sem fonte, regras de título da F1). Acréscimo do dono, mesmo
 * dia: "sobre a saída do vídeo, eu estava pensando em 4 partes: tem um vídeo
 * maior … e deixar as diretrizes para storytelling; mas também ter versões
 * fatiadas, vídeos curtos para as redes sociais de ~15 segundos cada … e eles
 * mesmos podem servir para criar os slides ou carrossel".
 *
 * Provas, sobre o caso real (Suporte "captação de pacientes dentista", Silo de 8)
 * e um caso de saúde (fontes X e uma afirmação de saúde sem fonte):
 *   - o material é a MESMA linha do CSV "Para escrever" (nenhuma montagem paralela);
 *   - o checklist "a aplicar" e o aviso "Links do Silo atualizados disponíveis"
 *     sem tocar no documento;
 *   - o MCP no teto (brief, fundamentos, documento) e a montagem do servidor
 *     (o documento é de UM pacote);
 *   - o vídeo nas 4 partes, pelo mesmo núcleo; o CSV "Para escrever" intacto.
 * Sem rede, sem IA, sem banco.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => { idasAoServidor.push(String(entrada)); return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")); },
  writable: true, configurable: true,
});

const linhas = (texto: string) => texto.split("\n");
const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
const fonteDe = (arquivo: string) => semComentarios(readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8"));

/* ============================== as fixtures ============================== */

const fonte = (patch: Partial<RadarAuthorityVerifiedSource> & Pick<RadarAuthorityVerifiedSource, "id" | "url" | "entity" | "kind" | "claim">): RadarAuthorityVerifiedSource => ({
  domain: new URL(patch.url).hostname.replace(/^www\./, ""), origin: "concorrente", title: "", excerpt: "", publishedAt: null,
  checkedAt: "2026-10-14T12:00:00.000Z", claimId: null, ymyl: false, citedByCompetitors: 1, matchedTerms: [], ...patch,
});
const registro = (verified: RadarAuthorityVerifiedSource[], ymylClaims: RadarAuthoritySourcesRecord["ymylClaims"] = []): RadarAuthoritySourcesRecord => RadarAuthoritySourcesRecordSchema.parse({
  version: RADAR_AUTHORITY_SOURCES_VERSION, status: "CHECKED", unavailableReason: null, checkedAt: "2026-10-14T12:00:00.000Z",
  list: { origin: "padrao", brandDnaVersionId: null, domains: 26 }, candidates: verified.length, checked: verified.length, notChecked: 0, limit: 8,
  verified, failures: [], ymylClaims, notes: [], cost: { providerCalls: 0, aiCalls: 0, pageFetches: verified.length, robotsFetches: 1 },
});
const CFO = "https://website.cfo.org.br/codigo-de-etica/";
const GOV = "https://www.gov.br/saude/pt-br/assuntos/saude-bucal";
const SEM_FONTE = "Dosagem de anestésico local para implante";
/* O caso de saúde: o caso real com duas fontes de autoridade conferidas e uma afirmação de saúde sem fonte. */
const entradaDeSaude = (): RadarPortableExportInput => ({
  ...entradaDoCasoRealComSerp(),
  authoritySources: registro([
    fonte({ id: "X1", url: CFO, entity: "Conselho Federal de Odontologia (CFO)", kind: "conselho", claim: "regras do CRO para publicidade", claimId: "claim:cro", excerpt: "É vedado anunciar resultados de tratamento." }),
    fonte({ id: "X2", url: GOV, entity: "Ministério da Saúde", kind: "governo", claim: "saúde bucal na atenção primária", claimId: "claim:sb", ymyl: true, excerpt: "A saúde bucal integra a atenção primária." }),
  ], [
    { claimId: "claim:sb", claim: "saúde bucal na atenção primária", relevance: "HIGH", sourceIds: ["X2"] },
    { claimId: "claim:dose", claim: SEM_FONTE, relevance: "HIGH", sourceIds: [] },
  ]),
});

const linhaDoCaso = (entrada: RadarPortableExportInput = entradaDoCasoRealComSerp(), contexto: RadarWritingArticleContext = contextoDoCasoReal()) => buildRadarWritingExportArticle(entrada, contexto);

/* ============================== 1 · o material é a linha do CSV ============================== */

test("F6 · material · caso real: os blocos saem da MESMA linha do CSV 'Para escrever' (L, T, análise competitiva, fechamento, título)", () => {
  const artigo = linhaDoCaso();
  const material = radarWritingMaterialOf(artigo.uncutRow);
  assert.ok(material);
  /* A malha do Silo: 5 L no corpo e 3 T na trilha, os 8 destinos do Silo — as mesmas linhas da coluna links_internos. */
  assert.deepEqual(material.links.map(item => item.id), ["L1", "L2", "L3", "L4", "L5", "T1", "T2", "T3"]);
  const doCsv = linhas(artigo.row.links_internos).filter(item => /^[LT]\d+ · /.test(item));
  assert.deepEqual(material.links.map(item => item.line), doCsv, "o mesmo texto do CSV, linha a linha");
  assert.equal(material.links[0].label, "Pilar \"leads qualificados\"");
  assert.equal(material.links[0].url, "https://marca-exemplo.com.br/leads-sem-trafego-pago/qualificados");
  assert.equal(material.links[0].section, "Captação de pacientes dentista sem anúncios começa pelo orgânico");
  assert.ok(material.linkRules.some(item => item.startsWith("Malha do Silo (regras 2026-10-14): este artigo (Suporte) liga a 8 de 8 destinos do Silo")));
  /* A análise competitiva: o ângulo e os 4 blocos (a coluna cobrir_e_superar). */
  assert.equal(material.angle, "O checklist do que a clínica já tem antes de qualquer canal.");
  assert.deepEqual(material.competitive, linhas(artigo.row.cobrir_e_superar).filter(Boolean));
  assert.ok(radarWritingMaterialCompetitiveBlock(material, 3).some(item => item.startsWith("O que o CRO não permite postar?")));
  assert.ok(radarWritingMaterialCompetitiveBlock(material, 4).some(item => item.startsWith("listicle \"N dicas\"")));
  /* O fechamento: a planta gravada (sem os 4 campos) leva a virada, a linha dos 4 tempos e o CTA aprovado. */
  assert.ok(material.closing.some(item => item.startsWith("- Fechamento em 4 tempos: dor")));
  assert.equal(radarWritingMaterialClosingOf(material)?.cta, "Vamos planejar a presença orgânica da sua clínica no Google?");
  /* Título e keyword: as regras K1–K9, sem os textos da planta (que estão no articleBlueprint). */
  assert.ok(material.titleAndKeyword.some(item => item.startsWith("Título pela SERP (regras de keyword 2026-10-14")));
  assert.ok(material.titleAndKeyword.some(item => item.startsWith("- Keyword no corpo (K7)")));
  assert.equal(material.titleAndKeyword.some(item => /^(?:H1|SEO title|Meta description):/.test(item)), false);
  /* A linha de antes do teto não vai ao CSV nem ao JSON do artigo (os snapshots continuam byte a byte). */
  assert.equal(JSON.stringify(artigo).includes("uncutRow"), false);
});

test("F6 · material · o lote que o servidor usa (radarPortableWritingArticles) dá a mesma linha do CSV da seleção", () => {
  const montada = { articleId: ARTIGO, entrada: entradaDoCasoRealComSerp(), lentes: [], blueprint: plantaDoCasoReal() } as never;
  const entrada = { articles: [montada], lenses: LEITURA_DAS_LENTES, plan: null, selectionPlan: null, publications: new Map(), today: EXPORTADO_EM, brandVoice: { kind: "none" as const } };
  const [linha] = radarPortableWritingArticles(entrada);
  const csv = radarPortableWritingExport(entrada).csv || "";
  for (const celula of [linha.article.row.cobrir_e_superar, linha.article.row.links_internos]) {
    assert.ok(csv.includes(celula.split("\n")[0].replace(/"/g, "\"\"")), "a linha do material é a do CSV");
  }
});

test("F6 · material · caso de saúde: as fontes X (âncora no nome da entidade) e a afirmação de saúde sem fonte", () => {
  const material = radarWritingMaterialOf(linhaDoCaso(entradaDeSaude()).uncutRow)!;
  assert.deepEqual(material.authority.map(item => [item.id, item.label, item.url]), [["X2", "Ministério da Saúde", GOV], ["X1", "Conselho Federal de Odontologia (CFO)", CFO]]);
  assert.ok(material.authorityRules[0].startsWith("Links externos de autoridade (verificados pelo Radar"));
  assert.ok(material.ymylWithoutSource.some(item => item.includes(SEM_FONTE)));
});

/* ============================== 2 · o checklist e o aviso dos links novos ============================== */

test("F6 · Redator · documento novo: tudo 'a aplicar', sem aviso; documento antigo: 'Links do Silo atualizados disponíveis' e o texto intacto", () => {
  const material = radarWritingMaterialOf(linhaDoCaso().uncutRow)!;
  const vazio = writerMaterialChecklist(material, { blocks: [], editorContent: null });
  assert.equal(vazio.counts.applied, 0);
  assert.equal(vazio.counts.toApply, 8);
  assert.equal(vazio.siloLinksUpdate, null, "sem texto, só o checklist");

  /* O documento escrito com os links antigos (o Pilar e a SiloPage, como antes da malha). */
  const antigo = {
    blocks: [{ id: "b1", type: "paragraph", text: "Texto já escrito.", provenance: { keywordDnaRefs: [], evidenceRefs: [], sourceIds: [] } }],
    editorContent: { type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "contatos qualificados", marks: [{ type: "link", attrs: { href: "https://marca-exemplo.com.br/leads-sem-trafego-pago/qualificados/" } }] },
      { type: "text", text: " e o mapa do tema", marks: [{ type: "link", attrs: { href: "https://www.marca-exemplo.com.br/leads-sem-trafego-pago" } }] },
    ] }] },
  };
  const antes = JSON.stringify(antigo);
  const lido = writerMaterialChecklist(material, antigo);
  assert.equal(JSON.stringify(antigo), antes, "leitura aditiva: o documento não muda");
  assert.deepEqual(lido.links.filter(item => item.status === "aplicado").map(item => item.id), ["L1", "L5"]);
  assert.ok(lido.siloLinksUpdate);
  assert.equal(lido.siloLinksUpdate.label, WRITER_SILO_LINKS_UPDATE_LABEL);
  assert.deepEqual(lido.siloLinksUpdate.items.map(item => item.id), ["L2", "L3", "L4", "T1", "T2", "T3"]);
  assert.match(lido.siloLinksUpdate.note, /O texto não é reescrito sozinho/);
});

/* ============================== 3 · o MCP no teto ============================== */

test("F6 · MCP · brief inteiro (≤ 14 kB, o corte dito), fundamentos no que sobra e documento só com o checklist", () => {
  const material = radarWritingMaterialOf(linhaDoCaso(entradaDeSaude()).uncutRow)!;
  const leitura = { state: "ready" as const, articleId: ARTIGO, material };
  const brief = writerMaterialForMcp(leitura, { blocks: [] });
  assert.equal(brief.state, "ready");
  assert.ok(Buffer.byteLength(JSON.stringify(brief), "utf8") <= 14_000);
  assert.ok(Array.isArray(brief.links) && Array.isArray(brief.authority) && Array.isArray(brief.closing));
  /* Num teto pequeno, cede primeiro o guia e por último os links e as fontes, e diz onde ler inteiro. */
  const apertado = writerMaterialForMcp(leitura, { blocks: [] }, 4_000);
  const cortes = (apertado.trimmed as Array<{ field: string; readAt: string }>);
  assert.ok(cortes.length && cortes[0].field === "titleAndKeyword" && /get_article_for_writing/.test(cortes[0].readAt), JSON.stringify(cortes));
  /* Nos fundamentos sem espaço: o ponteiro, nunca em silêncio. */
  assert.deepEqual(writerMaterialForFoundations(leitura, null, 24_000, 24_576), { state: "ready", readAt: "get_writer_brief", reason: "o material novo não coube nos fundamentos: leia-o inteiro em get_writer_brief (writerMaterial)" });
  /* No documento: só o checklist curto. */
  const doc = writerMaterialChecklistForMcp(leitura, { blocks: [] });
  assert.deepEqual(Object.keys(doc).sort(), ["authority", "checklist", "links", "readAt", "siloLinksUpdate", "state", "version"]);
  /* Sem material: o estado e o motivo. */
  assert.deepEqual(writerMaterialForMcp({ state: "other_investigation", articleId: ARTIGO, reason: "outro pacote" }, null), { state: "other_investigation", reason: "outro pacote" });
});

test("F6 · servidor · a montagem do CSV, a conferência do pacote (o documento é de UM pacote) e a planta obrigatória", () => {
  const CONGELADO = "2026-10-14T10:00:00.000Z";
  const montagem = (planta: unknown, congeladoEm = CONGELADO) => ({
    exportedAt: EXPORTADO_EM, identificacao: [], recusados: [], publicacoes: new Map([[ARTIGO, PUBLICACAO_DO_CASO_REAL]]), lentes: LEITURA_DAS_LENTES,
    plano: null, planoDaSelecao: { files: [{ articleIds: [ARTIGO], writing: SILO_DO_CASO_REAL() }] }, brandVoice: { kind: "none" }, grupos: new Map(),
    montadas: [{ articleId: ARTIGO, entrada: entradaDoCasoRealComSerp(), lentes: [], blueprint: planta }],
    congelamentos: new Map([[ARTIGO, { frozenAt: congeladoEm, frozenBundleId: null, frozenBundleHash: null, articleDnaVersionId: "dna-1", articleDnaContentHash: null, articleDnaFrom: null, articleDnaUntil: null }]]),
  }) as never;
  const pedido = { articleId: ARTIGO, bundleObservedAt: "2026-10-14T10:00:00+00:00", articleDnaVersionId: "dna-1" };
  const pronto = writerMaterialOfAssembly(montagem(plantaDoCasoReal()), pedido);
  assert.equal(pronto.state, "ready");
  assert.deepEqual(pronto.state === "ready" ? pronto.material.links.map(item => item.id) : [], ["L1", "L2", "L3", "L4", "L5", "T1", "T2", "T3"], "o Silo da seleção, como get_article_for_writing");
  assert.equal(writerMaterialOfAssembly(montagem(plantaDoCasoReal(), "2026-10-15T10:00:00.000Z"), pedido).state, "other_investigation");
  assert.equal(writerMaterialOfAssembly(montagem(null), pedido).state, "needs_article_blueprint");
  assert.equal(writerMaterialOfAssembly(montagem(plantaDoCasoReal()), { ...pedido, articleDnaVersionId: "dna-2" }).state, "other_investigation");
});

test("F6 · estrutura · o MCP (brief, fundamentos, documento) e o painel leem o material pelo mesmo núcleo; nada é gravado", () => {
  const rota = fonteDe("app/api/mcp/redator/route.ts");
  /* O documento continua numa leitura só (adendo D4): o ponteiro para o brief, sem montar o CSV. */
  const documento = rota.slice(rota.indexOf('registerTool("get_writer_document"'), rota.indexOf('registerTool("get_writer_brief"'));
  assert.match(documento, /material: WRITER_MATERIAL_DOCUMENT_POINTER/);
  assert.doesNotMatch(documento, /readWriterMaterialForMcp\(/);
  assert.match(rota, /registerTool\("get_writer_brief"[\s\S]*?readWriterMaterialForMcp\([\s\S]*?writerMaterial: writerMaterialForMcp\(material\.leitura, material\.documento\)/);
  assert.match(rota, /registerTool\("get_writer_foundations"[\s\S]*?writerMaterial: writerMaterialForFoundations\(/);
  const servidor = fonteDe("lib/server/writer-material.ts");
  assert.match(servidor, /assembleRadarPortableExport\(\{[\s\S]*?readPublishedStructure: radarReadPublishedStructure, selectionSiloContext: true/);
  assert.match(servidor, /radarPortableWritingArticles\(/);
  assert.match(servidor, /radarWritingMaterialOf\(/);
  assert.doesNotMatch(servidor, /\.(?:insert|update|upsert|delete)\(/, "só leitura");
  const painel = fonteDe("modules/redator/writer-radar-foundations-panel.tsx");
  assert.match(painel, /\/api\/redator\/article-blueprint\?brandId=\$\{encodeURIComponent\(marca\)\}&documentId=\$\{encodeURIComponent\(documentId\)\}&part=material/);
  assert.match(painel, /writerMaterialChecklist\(leitura\.material, document\)/);
  assert.match(painel, /checklist\.siloLinksUpdate\.label/);
  assert.match(fonteDe("app/api/redator/article-blueprint/route.ts"), /get\("part"\) === "material"[\s\S]*?readWriterMaterial\(/);
});

/* ============================== 4 · o vídeo em 4 partes ============================== */

const videoDoCaso = (entrada: RadarPortableExportInput = entradaDoCasoRealComSerp()) => {
  const contexto = contextoDoCasoReal();
  return buildRadarVideoExportArticle(entrada, { position: 1, youtube: null, blueprint: contexto.blueprint, silo: contexto.silo, publication: contexto.publication, articleId: ARTIGO }).row;
};

test("F6 · vídeo · parte 1: vídeo longo com o material do artigo, o arco de storytelling, os ganchos de retenção, os marcadores e o título K2/K3", () => {
  const roteiro = videoDoCaso().diretrizes_de_roteiro;
  assert.match(roteiro, /^Ângulo do vídeo \(o mesmo do artigo\): O checklist do que a clínica já tem antes de qualquer canal\.$/m);
  assert.match(roteiro, /^Ganho de informação \(o que o vídeo mostra que o topo não mostra\): [^\n]*O que o CRO não permite postar\?/m);
  assert.match(roteiro, /^O que o topo faz e o vídeo não copia: [^\n]*listicle "N dicas"/m);
  assert.match(roteiro, /^Storytelling \(arco do vídeo longo; um CTA só, o diagnóstico\):$/m);
  for (const passo of ["1. Gancho (0:00–0:15)", "2. Tensão", "3. Virada", "4. Prova e demonstração", "5. Resolução", "6. CTA único — o diagnóstico"]) assert.ok(roteiro.includes(passo), passo);
  assert.match(roteiro, /^Personagem: um caso ilustrativo, dito como ilustrativo/m);
  assert.match(roteiro, /^Ganchos de retenção entre capítulos [^\n]*1→2 "Como começar o tráfego orgânico sem equipe grande\?"/m);
  assert.match(roteiro, /^Marcadores de tempo estimados \(vídeo de ~8 min, padrão sem mediana dos longos pertinentes; conferir na edição\): 0:00 Gancho · 0:15 1\. /m);
  assert.match(roteiro, /^Título do vídeo \(regras de keyword 2026-10-14, K2\/K3\): 3 opções com ângulos diferentes [^\n]*nunca prefixo fixo/m);
  assert.doesNotMatch(roteiro, /com a principal no começo/, "a regra antiga do título saiu");
  assert.match(roteiro, /^Fechamento em 4 tempos \(o arco acima\): dor → mudança para a estrutura própria → facilidade \(a marca faz\) → diagnóstico, o CTA único/m);
  assert.match(roteiro, /"Continue no Silo" com Suporte "como captar um cliente"/, "a trilha do Silo na descrição");
  /* O gabarito do YouTube: duração, o que os 3 mais bem posicionados fazem e o SEO antigo dos títulos. */
  const longos = Array.from({ length: 6 }, (_, indice) => ({ title: indice < 2 ? `10 DICAS de captação 🦷 parte ${indice}` : `Como o consultório aparece no Google? Parte ${indice}`, channelName: `Canal ${indice}`, bestRank: indice + 1, durationSeconds: 420 + indice * 60 }));
  const gabarito = radarVideoLongTemplate(longos);
  assert.equal(gabarito.targetSeconds, 570);
  assert.match(gabarito.lines[0], /^Gabarito do YouTube \(6 vídeo\(s\) longo\(s\) pertinente\(s\) já coletado\(s\); referência, não meta\): duração mediana 9:30\.$/);
  assert.match(gabarito.lines[1], /^O que os 3 mais bem posicionados fazem \(× os outros 3\): /);
  assert.match(gabarito.lines[2], /listicle "N dicas" em 2 · [^\n]*caixa alta em 2 · emoji em 2/);
  assert.match(radarVideoTimeMarkers(["A", "B"], 600), /^Marcadores de tempo estimados \(vídeo de ~10 min, pela mediana dos longos pertinentes; /);
});

test("F6 · vídeo · partes 2 e 3: curtos de ~15 s por micro-assunto e um carrossel por curto, com o texto dele; o prompt os pede", () => {
  const row = videoDoCaso();
  const cortes = row.cortes_para_redes;
  assert.match(cortes, /^Série de curtos de ~15 s \(padrão; sem dado de Shorts pertinentes\) por micro-assunto \(o vídeo fatiado: \d+ curto\(s\) de 5 capítulo\(s\)/m);
  assert.match(cortes, /^ {3}1\.1 · Gancho do 1º segundo: "O que é tráfego orgânico na captação de pacientes\?" · Ideia: Tráfego orgânico é a visita que chega por busca, perfil e indicação, sem pagar por clique · Cena: [^\n]* · Texto na tela: "[^"]+"\.$/m);
  assert.match(cortes, /^ {3}1\.2 · [^\n]*Cena: o ponto "Quais características definem o tráfego orgânico" escrito na tela/m, "o ponto da planta vira micro-assunto");
  assert.match(cortes, /^CTA de cada curto e de cada carrossel \(um só\): o diagnóstico — /m);
  assert.match(cortes, /^Títulos de cada curto: 3 opções com ângulos diferentes/m);
  assert.match(cortes, /^Carrosséis derivados dos curtos \(Instagram e LinkedIn; um por curto, com o texto dele: capa = o gancho, uma ideia por lâmina, a última com o CTA\):$/m);
  assert.match(cortes, /^- Lâmina 1 \(capa\) = o gancho do curto · Lâmina 2 = o texto na tela dele · /m);
  assert.match(cortes, /^- Carrosséis: 1\.1, 1\.2, 2\.1/m);
  assert.match(row.storyboard_visual, /^Storyboard da série de curtos \(vertical 9:16/m);
  assert.match(row.prompt, /^Escreva o roteiro de um vídeo para o YouTube, os curtos e o carrossel sobre /m);
  assert.match(row.prompt, /^2\) Os curtos desta linha \(o vídeo fatiado por micro-assunto\): Um vídeo curto de ~15 s por micro-assunto/m);
  assert.match(row.prompt, /^3\) Carrosséis: O carrossel de cada curto/m);
  assert.match(row.cadeia_competitiva, /· curtos 1\.1(?:, 1\.\d)* \(um carrossel por curto\)$/m);
  /* A duração-alvo pela concorrência observada: a mediana dos Shorts pertinentes quando cabe em 10–30 s. */
  assert.deepEqual(radarVideoShortTarget(22), { seconds: 22, line: "~22 s (mediana dos Shorts pertinentes)" });
  assert.equal(radarVideoShortTarget(55).seconds, 15);
  /* A série do CSV é a mesma do plano que a semeadura do Redator lê. */
  const contexto = contextoDoCasoReal();
  const plano = radarVideoPlan(entradaDoCasoRealComSerp(), { youtube: null, blueprint: contexto.blueprint, silo: contexto.silo, publication: contexto.publication, articleId: ARTIGO });
  assert.equal(plano.status, "ready");
  assert.deepEqual(plano.status === "ready" ? plano.curtos?.map(curto => curto.rotulo) : [], cortes.split("\n").map(item => item.match(/^ {3}(\d+\.\d+) · /)?.[1]).filter(Boolean));
});

test("F6 · vídeo · parte 4: as fontes de autoridade (pelo nome da entidade) e a afirmação de saúde sem fonte atravessam o vídeo longo, os curtos e o prompt", () => {
  const row = videoDoCaso(entradaDeSaude());
  for (const coluna of [row.diretrizes_de_roteiro, row.cortes_para_redes]) {
    assert.match(coluna, /^Fontes de autoridade \(cite pelo nome da entidade na fala e na tela, ex\.: "segundo o Ministério da Saúde"; o endereço vai na descrição e na legenda\): X2 Ministério da Saúde \(https:\/\/www\.gov\.br\/saude\/pt-br\/assuntos\/saude-bucal\); X1 Conselho Federal de Odontologia \(CFO\) \(https:\/\/website\.cfo\.org\.br\/codigo-de-etica\/\)\.$/m);
    assert.match(coluna, new RegExp(`${SEM_FONTE}[^\\n]*— no vídeo, nos curtos e nas lâminas também\\.$`, "m"));
  }
  assert.match(row.prompt, /^Fontes de autoridade: cite pelo nome da entidade \(na fala, na tela e na lâmina\)[^\n]*afirmação de saúde sem fonte verificada não vira fato/m);
  /* Nenhuma URL externa fora das verificadas no vídeo. */
  const externas = new Set((`${row.diretrizes_de_roteiro}\n${row.cortes_para_redes}`.match(/https?:\/\/[^\s)"]+/g) || []).filter(url => !url.includes("marca-exemplo.com.br")));
  for (const url of externas) assert.ok([CFO, GOV].includes(url), url);
});

test("F6 · regra única · o vídeo ganha as regras de título da F1; o CSV 'Para escrever' não muda (o guarda de tamanho)", () => {
  assert.match(radarHumanVoiceVideoRule(), /dentro das primeiras ~60 letras \(nunca como prefixo fixo/);
  assert.match(radarHumanVoiceVideoRule(), /fontes de autoridade são citadas pelo nome da entidade/);
  /* O CSV de escrita do caso real é o mesmo com e sem o material lido (o material não acrescenta nada a ele). */
  const artigo = linhaDoCaso();
  radarWritingMaterialOf(artigo.uncutRow);
  assert.deepEqual(artigo.row, linhaDoCaso().row);
  /* As colunas do CSV de vídeo não mudaram (conteúdo novo nas de sempre). */
  const saida = radarPortableVideoExport({ articles: [{ articleId: ARTIGO, entrada: entradaDoCasoRealComSerp(), blueprint: plantaDoCasoReal() }], today: EXPORTADO_EM });
  assert.equal(saida.status, "ready");
  assert.match(saida.status === "ready" ? saida.csv : "", /^﻿"ordem","pode_gravar","tema_e_publico","intencao_e_formato","serp_youtube","perguntas_do_publico","termos_e_entidades","fatos_e_fontes","especialista","biblioteca_da_marca","diretrizes_de_roteiro","cortes_para_redes","concorrencia_curtos_e_carrossel","storyboard_visual","cadeia_competitiva","prompt"\r\n/);
});

test("F6 · catálogo (AGENTS §17.1): o vídeo em 4 partes e o material novo no Redator", () => {
  const notas = PLATFORM_OPERATIONS.flatMap(operacao => operacao.notes || []).join("\n");
  assert.match(notas, /O vídeo em 4 partes \(2026-10-14, F6 da SDD/);
  assert.match(notas, /Material novo do Radar no Redator \(2026-10-14, F6 da SDD/);
  assert.match(notas, /Links do Silo atualizados disponíveis/);
});

test("F6 · PROVIDER_CALLS = 0: nada saiu para a rede", () => {
  assert.deepEqual(idasAoServidor, []);
});
