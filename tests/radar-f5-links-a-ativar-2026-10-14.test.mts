import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRadarWritingExportArticle, type RadarWritingPublication } from "../lib/radar/portable-writing-export.ts";
import { radarWritingMaterialOf } from "../lib/radar/portable-writing-material.ts";
import { buildRadarVideoExportArticle, radarVideoPlan, type RadarVideoPlan } from "../lib/radar/portable-video-export.ts";
import {
  RADAR_SILO_LINKS_COLUMNS,
  radarSiloLinkAnchorOf,
  radarSiloLinksCsv,
  radarSiloLinksFilename,
  radarSiloLinksSiloSummary,
  radarSiloLinksUpdateOf,
} from "../lib/radar/silo-links-update.ts";
import { radarVideoCompetitorReferenceLines, radarVideoShortCarouselRuleLines, radarVideoShortCarousels } from "../lib/radar/video-production.ts";
import { radarHeadingStartsWithKeyword } from "../lib/radar/human-voice-guideline.ts";
import {
  buildCarouselSeedPrompt,
  buildShortCarouselsSeedPrompt,
  carouselPayloadFromShortsSeed,
  ProviderShortCarouselsSeedSchema,
  SEED_SHORT_CAROUSELS_SECTION_TITLE,
  seedContextLines,
  seedPartsCount,
  seedShortCarousels,
} from "../lib/redator/deliverable-seed.ts";
import { CarouselPayloadSchema, newWriterDeliverable } from "../lib/redator/multiformat-contracts.ts";
import { WRITER_MATERIAL_STATUS_LABEL, writerMaterialChecklist } from "../lib/redator/writer-material.ts";
import { radarSiloLinksMemberIds, radarSiloLinksOfAssembly, radarSiloLinksRead } from "../lib/server/radar-silo-links.ts";
import { PLATFORM_OPERATIONS } from "../lib/agent/platform-catalog.ts";
import { ARTIGO, EXPORTADO_EM, LEITURA_DAS_LENTES } from "./radar-portable-writing-fixtures.mts";
import {
  ARTIGO_DO_PILAR,
  PREFIXO_DO_CASO,
  PUBLICACAO_DO_CASO_REAL,
  SILO_DO_CASO_REAL,
  contextoDoCasoReal,
  contextoDoPilarDoCasoReal,
  entradaDoCasoRealComSerp,
  entradaDoPilarDoCasoReal,
  plantaDoCasoReal,
  plantaDoPilarDoCasoReal,
} from "./fixtures/silo-interligado-caso-real-2026-10-14.mts";

/*
 * ===== 2026-10-14 · F5 · LINKS A ATIVAR, "ATUALIZAR LINKS DO SILO" E AS PENDÊNCIAS DA F6 (SDD silo interligado) =====
 *
 * Autorização do dono (2026-10-14): "pode concluir as pendências, vou testar
 * depois". SDD §6.5, §10, D10 e §15 (F5: "links a ativar com destino que vai ao
 * ar; publicado sem link lista o que falta").
 *
 * O caso real: o Silo "Leads sem Tráfego Pago" (8 artigos), o Suporte 3
 * "captação de pacientes dentista" PUBLICADO, com a malha incompleta na página
 * (só 2 dos 8 links); o Pilar "leads qualificados" e "como captar um cliente",
 * que estavam novos, vão ao ar. Mais: o Redator ("destino no ar: ative o link"),
 * o carrossel por curto e a estrutura e as entidades dos concorrentes no gabarito
 * do vídeo longo. Sem rede, sem IA, sem banco.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => { idasAoServidor.push(String(entrada)); return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")); },
  writable: true, configurable: true,
});

const semComentarios = (fonte: string) => fonte.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
const fonteDe = (arquivo: string) => semComentarios(readFileSync(new URL(`../${arquivo}`, import.meta.url), "utf8"));

/* ============================== as fixtures ============================== */

const publicacao = (slug: string, published: boolean): RadarWritingPublication => ({ published, publishedUrl: published ? `${PREFIXO_DO_CASO}/${slug}` : null, canonical: null, slug, principalPolicy: null });
/** O Silo HOJE: o Pilar e "como captar um cliente", que estavam novos, foram ao ar; promoções, atrair e a SiloPage continuam novos. */
const SILO_HOJE = () => new Map<string, RadarWritingPublication>([
  [ARTIGO_DO_PILAR, publicacao("qualificados", true)],
  ["sup-instagram", publicacao("instagram-nao-traz-pacientes", true)],
  [ARTIGO, PUBLICACAO_DO_CASO_REAL],
  ["sup-promocoes", publicacao("promocoes-para-estetica", false)],
  ["sup-captar", publicacao("como-captar-um-cliente", true)],
  ["sup-trafego", publicacao("trafego-pago-vs-organico-para-clinica-de-estetica", true)],
  ["sup-campanhas", publicacao("campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios", true)],
  ["sup-atrair", publicacao("como-atrair-um-cliente", false)],
]);
/** O Silo ANTES: igual, mas o Pilar e "como captar um cliente" ainda não estavam no ar. */
const SILO_ANTES = () => new Map([...SILO_HOJE(), [ARTIGO_DO_PILAR, publicacao("qualificados", false)], ["sup-captar", publicacao("como-captar-um-cliente", false)]]);
/** Os links internos da página publicada do Suporte, lidos agora: só 2 da malha (Instagram e tráfego pago vs orgânico) e o contato. */
const LINKS_DA_PAGINA = [`${PREFIXO_DO_CASO}/instagram-nao-traz-pacientes`, `${PREFIXO_DO_CASO}/trafego-pago-vs-organico-para-clinica-de-estetica/`, "https://marca-exemplo.com.br/contato"];

const materialDoSuporte = (silo: Map<string, RadarWritingPublication>) =>
  radarWritingMaterialOf(buildRadarWritingExportArticle(entradaDoCasoRealComSerp(), contextoDoCasoReal({ siloPublications: silo })).uncutRow)!;

const listaDoSuporte = (silo: Map<string, RadarWritingPublication>, pageLinks: readonly string[] | null = LINKS_DA_PAGINA) => radarSiloLinksUpdateOf({
  articleId: ARTIGO, article: "captação de pacientes dentista", role: "Suporte", position: 3,
  material: materialDoSuporte(silo),
  source: { published: true, url: PUBLICACAO_DO_CASO_REAL.publishedUrl, pageLinks },
  blueprintCandidates: plantaDoCasoReal().linkCandidates,
});

/* ============================== 1 · links a ativar (destino novo que vai ao ar) ============================== */

test("F5 · links a ativar · caso real: o Pilar estava novo na planta e foi ao ar → L1 'ativar' (âncora, seção e URL); antes, 'aguardar o destino'", () => {
  const antes = listaDoSuporte(SILO_ANTES());
  const l1Antes = antes.items.find(item => item.id === "L1")!;
  assert.equal(l1Antes.situation, "aguardar_destino");
  assert.equal(l1Antes.targetPublished, false);
  assert.equal(antes.toActivate.length, 0);

  const hoje = listaDoSuporte(SILO_HOJE());
  assert.deepEqual(hoje.toActivate.map(item => item.id), ["L1"], "só o destino que a planta gravou como novo e foi ao ar");
  const l1 = hoje.toActivate[0];
  assert.equal(l1.target, "Pilar \"leads qualificados\"");
  assert.equal(l1.plannedInBlueprint, true);
  assert.equal(l1.url, `${PREFIXO_DO_CASO}/qualificados`);
  assert.equal(l1.anchor, "contatos qualificados");
  assert.equal(l1.anchorIsExample, true);
  assert.deepEqual(l1.forbidden, ["leads qualificados"], "a âncora nunca é a keyword do destino");
  assert.equal(l1.obligation, "obrigatório no corpo", "Suporte → Pilar é obrigatório no corpo");
  assert.match(l1.where, /^no corpo, seção "Captação de pacientes dentista sem anúncios começa pelo orgânico", na frase que trata de: /);
  assert.equal(l1.action, "Destino no ar: ative o link — a âncora que ficou como texto simples vira link para a URL");
});

/* ============================== 2 · "Atualizar links do Silo" (publicado com a malha incompleta) ============================== */

test("F5 · atualizar links do Silo · Suporte publicado com a malha incompleta: lista o que falta (corpo e trilha), o que já está e o que aguarda; malha 2/8", () => {
  const lista = listaDoSuporte(SILO_HOJE());
  assert.deepEqual(lista.items.map(item => `${item.id}:${item.situation}`), [
    "L1:ativar", "L2:na_pagina", "L3:na_pagina", "L4:falta_na_pagina", "L5:aguardar_destino",
    "T1:falta_na_pagina", "T2:aguardar_destino", "T3:aguardar_destino",
  ]);
  assert.deepEqual(lista.missingOnPage.map(item => item.id), ["L1", "L4", "T1"], "a ativar e faltando: o que a pessoa inclui na página");
  assert.deepEqual(lista.mesh, { placed: 2, required: 8 });
  assert.equal(lista.pageRead, true);
  /* A barra final e o "www" não enganam: o link do tráfego pago vs orgânico está na página. */
  assert.equal(lista.items.find(item => item.id === "L3")!.situation, "na_pagina");
  /* T1 ("como captar um cliente") é malha lida depois da planta: não era candidato dela, então falta na página (não "ativar"). */
  const t1 = lista.items.find(item => item.id === "T1")!;
  assert.equal(t1.plannedInBlueprint, null);
  assert.equal(t1.where, "trilha \"Continue no Silo\", no fim do artigo (depois do fechamento), item T1");
  assert.equal(t1.obligation, "trilha \"Continue no Silo\"");
  /* Página não lida agora: o que não é "ativar" vira "conferir", e a malha X/Y fica sem número (nunca inventado). */
  const semLeitura = listaDoSuporte(SILO_HOJE(), null);
  assert.deepEqual(semLeitura.items.filter(item => item.targetPublished).map(item => `${item.id}:${item.situation}`), ["L1:ativar", "L2:conferir", "L3:conferir", "L4:conferir", "T1:conferir"]);
  assert.equal(semLeitura.mesh, null);
  assert.equal(semLeitura.pageRead, false);
});

test("F5 · atualizar links do Silo · o -links.csv do caso real: BOM, cabeçalho, uma linha por link da malha, nome com o prefixo do artigo; nunca diz para mudar URL/slug/canonical", () => {
  const lista = listaDoSuporte(SILO_HOJE());
  const csv = radarSiloLinksCsv(lista);
  assert.ok(csv.startsWith("﻿\"artigo_de_origem\",\"pagina_de_origem\",\"id\",\"tipo\",\"situacao\",\"o_que_fazer\",\"obrigacao\",\"destino\",\"url\",\"destino_no_ar\",\"ancora\",\"nao_use_como_ancora\",\"onde_entra\",\"por_que\"\r\n"));
  assert.equal(RADAR_SILO_LINKS_COLUMNS.length, 14);
  const linhas = csv.trim().split("\r\n");
  assert.equal(linhas.length, 1 + 8);
  assert.match(linhas[1], /^"captação de pacientes dentista","https:\/\/marca-exemplo\.com\.br\/leads-sem-trafego-pago\/captacao-de-pacientes-sem-trafego-pago","L1","corpo","a ativar: o destino foi ao ar depois da planta","Destino no ar: ative o link/);
  assert.match(linhas[1], /"obrigatório no corpo","Pilar ""leads qualificados""","https:\/\/marca-exemplo\.com\.br\/leads-sem-trafego-pago\/qualificados","sim","contatos qualificados","leads qualificados"/);
  assert.equal(radarSiloLinksFilename({ slug: "captacao-de-pacientes-sem-trafego-pago", keyword: "captação de pacientes dentista", position: 3, role: "Suporte", today: EXPORTADO_EM }), "03-suporte-captacao-de-pacientes-sem-trafego-pago-links.csv");
  assert.doesNotMatch(csv, /(?:altere|mude|troque) (?:a URL|o slug|o canonical)/i);
  /* A linha "Para escrever" do artigo é a mesma com ou sem a lista: o -links.csv é arquivo próprio. */
  const linha = buildRadarWritingExportArticle(entradaDoCasoRealComSerp(), contextoDoCasoReal({ siloPublications: SILO_HOJE() })).row;
  assert.equal(JSON.stringify(linha).includes("a ativar: o destino foi ao ar"), false);
});

test("F5 · régua da âncora: o exemplo da régua natural; sem exemplo, a ideia do destino com as palavras da frase (sem IA)", () => {
  assert.deepEqual(radarSiloLinkAnchorOf("T2 · âncora: a ideia do destino em 3 a 6 palavras (o que \"promoções para estética\" aprofunda); por exemplo \"promoções\" · não use como âncora: \"promoções para estética\" → Suporte \"promoções para estética\" → https://x/y (publicado)"),
    { anchor: "promoções", isExample: true, forbidden: ["promoções para estética"], idea: "o que \"promoções para estética\" aprofunda" });
  const semExemplo = radarSiloLinkAnchorOf("L2 · âncora: escreva com as palavras da sua frase a ideia do destino (mostra por que o perfil não substitui o site), em 2 a 4 palavras · não use como âncora: \"instagram não traz pacientes\" → Suporte \"instagram não traz pacientes\" → https://x/y (publicado) · onde: seção \"S\"");
  assert.equal(semExemplo.isExample, false);
  assert.equal(semExemplo.anchor, "com as palavras da frase, a ideia do destino: mostra por que o perfil não substitui o site");
});

test("F5 · Pilar: Pilar → cada Suporte é 'obrigatório no corpo'; não publicado, o destino no ar sai 'escrever com o link' e o novo 'aguardar'", () => {
  const material = radarWritingMaterialOf(buildRadarWritingExportArticle(entradaDoPilarDoCasoReal(), contextoDoPilarDoCasoReal({ siloPublications: SILO_HOJE() })).uncutRow)!;
  const lista = radarSiloLinksUpdateOf({
    articleId: ARTIGO_DO_PILAR, article: "leads qualificados", role: "Pilar", position: 1, material,
    source: { published: false, url: null, pageLinks: null }, blueprintCandidates: plantaDoPilarDoCasoReal().linkCandidates,
  });
  const suportes = lista.items.filter(item => item.targetKind === "support");
  assert.equal(suportes.length, 7, "os 7 Suportes, entre corpo e trilha");
  assert.ok(suportes.every(item => item.required), "Pilar → Suporte é obrigatório");
  assert.ok(suportes.filter(item => item.kind === "corpo").every(item => item.obligation === "obrigatório no corpo"));
  assert.equal(lista.mesh, null);
  assert.equal(lista.pageRead, null);
  assert.equal(lista.missingOnPage.length, 0, "artigo não publicado não tem 'Atualizar links do Silo'");
  assert.ok(lista.items.every(item => ["escrever_com_link", "aguardar_destino", "ativar"].includes(item.situation)));
});

/* ============================== 3 · o painel "malha X/Y" e o servidor (mesmo núcleo) ============================== */

const montagemDoSilo = () => ({
  exportedAt: EXPORTADO_EM,
  montadas: [
    { articleId: ARTIGO_DO_PILAR, entrada: entradaDoPilarDoCasoReal(), lentes: [], blueprint: plantaDoPilarDoCasoReal() },
    { articleId: ARTIGO, entrada: entradaDoCasoRealComSerp(), lentes: [], blueprint: plantaDoCasoReal() },
  ] as never,
  recusados: [{ articleId: "sup-promocoes", code: "not_finalized", reason: "investigação não finalizada" }],
  lentes: LEITURA_DAS_LENTES,
  planoDaSelecao: { files: [{ kind: "silo", articleIds: [ARTIGO_DO_PILAR, ARTIGO], writing: SILO_DO_CASO_REAL() }] } as never,
  publicacoes: new Map([...SILO_HOJE(), [ARTIGO, { ...PUBLICACAO_DO_CASO_REAL, currentStructure: { h1: "H1", h2: [], updatedAt: null, links: LINKS_DA_PAGINA } }]]),
  brandVoice: { kind: "none" as const },
  grupos: new Map(),
});

test("F5 · servidor · a lista do Silo sai da MESMA linha do CSV (montagem do export), com a página lida e a planta congelada; malha X/Y do Silo", () => {
  const leitura = radarSiloLinksOfAssembly(montagemDoSilo());
  assert.equal(leitura.siloLabel, "Leads sem Tráfego Pago");
  assert.deepEqual(leitura.articles.map(item => [item.position, item.role, item.article]), [[1, "Pilar", "leads qualificados"], [3, "Suporte", "captação de pacientes dentista"]]);
  const suporte = leitura.articles.find(item => item.articleId === ARTIGO)!;
  assert.deepEqual(suporte.toActivate.map(item => item.id), ["L1"]);
  assert.deepEqual(suporte.mesh, { placed: 2, required: 8 });
  assert.equal(suporte.filename, "03-suporte-captacao-de-pacientes-sem-trafego-pago-links.csv");
  assert.ok(suporte.csv.startsWith("﻿\"artigo_de_origem\""));
  assert.deepEqual(leitura.withoutRow, [{ articleId: "sup-promocoes", title: "promoções para estética", reason: "investigação não finalizada" }]);
  /*
   * O Pilar foi ao ar (a página dele não foi lida nesta montagem): a planta dele
   * gravou os Suportes como novos, e os que hoje estão no ar viram "a ativar" na
   * página do Pilar — o Pilar liga a todos os Suportes.
   */
  const pilar = leitura.articles.find(item => item.articleId === ARTIGO_DO_PILAR)!;
  assert.equal(pilar.published, true);
  assert.equal(pilar.pageRead, false);
  assert.ok(pilar.toActivate.length >= 1 && pilar.toActivate.every(item => item.targetKind === "support" && item.required));
  assert.equal(leitura.summary.line, `Malha do Silo "Leads sem Tráfego Pago": 2/8 links da malha nas páginas publicadas lidas (1 de 2 página(s) lida(s), 2 artigo(s)) · ${1 + pilar.toActivate.length} a ativar · 2 faltam nas páginas${pilar.counts.conferir ? ` · ${pilar.counts.conferir} a conferir (página não lida)` : ""} · ${leitura.summary.waiting} aguardam o destino ir ao ar.`);
  assert.deepEqual([leitura.summary.placed, leitura.summary.required, leitura.summary.pagesRead, leitura.summary.published], [2, 8, 1, 2]);
  assert.match(leitura.notice, /não altera a página publicada, a URL, o slug nem o canonical/);
  assert.equal(radarSiloLinksSiloSummary({ siloLabel: null, updates: [] }).line, "Malha do Silo deste artigo: nenhum artigo publicado ainda (0 artigo(s)); a malha entra na escrita · 0 a ativar · 0 aguardam o destino ir ao ar.");
});

test("F5 · servidor · o Silo inteiro: a primeira montagem descobre os membros, a segunda monta todos (nenhuma leitura sem o Silo)", async () => {
  assert.deepEqual(radarSiloLinksMemberIds(montagemDoSilo(), ARTIGO), [ARTIGO_DO_PILAR, "sup-instagram", ARTIGO, "sup-promocoes", "sup-captar", "sup-trafego", "sup-campanhas", "sup-atrair"]);
  const pedidos: string[][] = [];
  const portas = { assemble: async (input: { articleIds: readonly string[] }) => { pedidos.push([...input.articleIds]); return montagemDoSilo() as never; } };
  await radarSiloLinksRead({ brandId: "b", articleId: ARTIGO, scope: "silo", actorUserId: "u", supabase: null as never }, portas);
  assert.equal(pedidos.length, 2);
  assert.deepEqual(pedidos[0], [ARTIGO]);
  assert.equal(pedidos[1].length, 8);
  pedidos.length = 0;
  await radarSiloLinksRead({ brandId: "b", articleId: ARTIGO, scope: "article", actorUserId: "u", supabase: null as never }, portas);
  assert.equal(pedidos.length, 1, "um artigo: uma montagem");
});

/* ============================== 4 · o Redator: "destino no ar: ative o link" ============================== */

test("F5 · Redator · checklist: com texto escrito, o link cujo destino foi ao ar e não está no texto diz 'destino no ar: ative o link'; sem texto, 'a aplicar'", () => {
  const material = materialDoSuporte(SILO_HOJE());
  const escrito = { blocks: [{ type: "paragraph", text: `Texto já escrito. Veja ${PREFIXO_DO_CASO}/instagram-nao-traz-pacientes.` }] };
  const checklist = writerMaterialChecklist(material, escrito);
  const status = Object.fromEntries(checklist.links.map(item => [item.id, item.status]));
  assert.equal(status.L1, "ativar", "Pilar no ar e fora do texto");
  assert.equal(status.L2, "aplicado");
  assert.equal(status.L5, "a_aplicar", "a SiloPage ainda não está no ar");
  assert.equal(status.T1, "ativar");
  assert.equal(WRITER_MATERIAL_STATUS_LABEL.ativar, "destino no ar: ative o link");
  assert.equal(checklist.counts.toActivate, 4, "L1 (Pilar), L3, L4 e T1: no ar e fora do texto");
  assert.equal(checklist.counts.toApply, 7);
  assert.ok(checklist.siloLinksUpdate?.items.some(item => item.id === "L1" && item.status === "ativar"));
  /* Documento vazio: nada a ativar ainda (o texto vai nascer com o link). */
  const vazio = writerMaterialChecklist(material, { blocks: [] });
  assert.ok(vazio.links.every(item => item.status === "a_aplicar"));
  assert.equal(vazio.counts.toActivate, 0);
  /* A tela usa o mesmo rótulo. */
  assert.match(fonteDe("modules/redator/writer-radar-foundations-panel.tsx"), /WRITER_MATERIAL_STATUS_LABEL\[item\.status\]/);
});

/* ============================== 5 · o carrossel do Redator, um por curto ============================== */

const planoDoCaso = (): RadarVideoPlan => {
  const contexto = contextoDoCasoReal();
  const plano = radarVideoPlan(entradaDoCasoRealComSerp(), { youtube: null, blueprint: contexto.blueprint, silo: contexto.silo, publication: contexto.publication, articleId: ARTIGO });
  assert.equal(plano.status, "ready");
  return plano as RadarVideoPlan;
};

test("F5 · carrossel por curto · a semeadura do Redator gera um carrossel por curto, pelas MESMAS lâminas do CSV de vídeo (capa = o gancho, uma ideia por lâmina, a última com o CTA)", () => {
  const plano = planoDoCaso();
  const carrosseis = seedShortCarousels(plano)!;
  assert.ok(plano.curtos && plano.curtos.length >= 2);
  assert.deepEqual(carrosseis.map(item => item.rotulo), plano.curtos!.map(item => item.rotulo), "um carrossel por curto, na ordem da série");
  for (const [indice, carrossel] of carrosseis.entries()) {
    const curto: NonNullable<RadarVideoPlan["curtos"]>[number] = plano.curtos![indice];
    assert.equal(carrossel.laminas[0].papel, "capa");
    assert.equal(carrossel.laminas[0].texto, curto.gancho, "a capa é o gancho do curto");
    assert.equal(carrossel.laminas[1].texto, curto.tela);
    assert.equal(carrossel.laminas.at(-1)!.papel, "cta");
    assert.equal(carrossel.laminas.some(item => item.papel === "ideia"), curto.ideiaMaior === true);
  }
  assert.deepEqual(carrosseis, radarVideoShortCarousels(plano.curtos!, "o CTA do artigo-modelo (o diagnóstico), a única chamada"), "a mesma régua do vídeo");
  assert.equal(seedPartsCount(plano, "carousel"), carrosseis.reduce((soma, item) => soma + item.laminas.length, 0));
  assert.notEqual(seedPartsCount(plano, "carousel"), plano.capitulos.length + 2, "não é mais uma lâmina por capítulo");
  /* A regra das lâminas no CSV de vídeo é o texto de antes, pela régua única. */
  const contexto = contextoDoCasoReal();
  const cortes = buildRadarVideoExportArticle(entradaDoCasoRealComSerp(), { position: 1, youtube: null, blueprint: contexto.blueprint, silo: contexto.silo, publication: contexto.publication, articleId: ARTIGO }).row.cortes_para_redes;
  for (const linha of radarVideoShortCarouselRuleLines(plano.curtos!)) assert.ok(cortes.includes(linha), "o CSV de vídeo escreve a mesma regra");
});

test("F5 · carrossel por curto · o pedido, a resposta e o entregável único (lâminas em sequência, notas com onde cada carrossel começa e a legenda)", () => {
  const plano = planoDoCaso();
  const carrosseis = seedShortCarousels(plano)!;
  const fonte = { title: "Captação", foundations: { keyword: { principal: null, secondary: [], reinforcements: [] }, profileLabel: "Google", observedAt: null, research: [], evidence: { sources: [], observedPages: null }, limitations: [], writerMayNot: [], multimodal: null, review: null, brandVoice: null, articleBlueprint: null, editorialContext: [] } as never, finalArticle: null, plan: plano };
  const contexto = seedContextLines(fonte).join("\n");
  assert.ok(contexto.includes(`- ${SEED_SHORT_CAROUSELS_SECTION_TITLE}: ${carrosseis.length}`));
  assert.match(contexto, /^ {2}Carrossel 1 \(curto 1\.1\), \d lâminas: 1\) capa = o gancho do curto — /m);
  const pedido = buildShortCarouselsSeedPrompt(fonte);
  assert.match(pedido, new RegExp(`^Monte ${carrosseis.length} carrossel\\(éis\\), um por curto da série, na ordem \\(1: curto 1\\.1 com \\d lâminas`));
  assert.match(buildCarouselSeedPrompt(fonte), /^Monte o carrossel com \d+ slides/, "o pedido antigo continua para a planta sem a série");
  const seed = ProviderShortCarouselsSeedSchema.parse({
    objective: "o", audience: "a", channel: "Instagram", closingCta: "Quer o diagnóstico?", notes: [],
    carousels: carrosseis.map(carrossel => ({ short: carrossel.rotulo, caption: `Legenda ${carrossel.rotulo}`, slides: carrossel.laminas.map(lamina => ({ heading: lamina.papel, body: "texto" })) })),
  });
  let n = 0;
  const base = newWriterDeliverable("carousel", { documentId: "doc", title: "Captação", sourceDocumentHash: "h" });
  const payload = CarouselPayloadSchema.parse(carouselPayloadFromShortsSeed({ base: base as never, seed, novoId: () => `id-${n++}`, plan: plano }));
  assert.equal(payload.slides.length, seedPartsCount(plano, "carousel"));
  assert.equal(payload.caption, "Legenda 1.1");
  assert.match(payload.notes[0], /^Um carrossel por curto da série \(\d+\), em sequência nas lâminas/);
  assert.match(payload.notes[1], /^Carrossel 1 \(curto 1\.1\): lâminas 1–\d · legenda: Legenda 1\.1$/);
  assert.equal(payload.notes.filter(nota => /^Carrossel \d+ \(curto /.test(nota)).length, carrosseis.length);
  /* A rota escolhe o pedido pela série e continua numa chamada só. */
  const rota = fonteDe("app/api/redator/seed/route.ts");
  assert.match(rota, /if \(seedShortCarousels\(plan\.plan\)\)/);
  assert.equal((rota.match(/generateStructuredAI\(/g) || []).length, 3, "roteiro, carrossel por curto e carrossel por capítulo: uma chamada cada, nunca duas no mesmo pedido");
});

/* ============================== 6 · o gabarito do vídeo longo: estrutura e entidades dos concorrentes ============================== */

test("F5 · vídeo longo · o gabarito traz a estrutura de títulos e as entidades dos concorrentes da SERP já lidos (o que cobrem; o que não copiar), sem coleta nova", () => {
  const contexto = contextoDoCasoReal();
  const roteiro = buildRadarVideoExportArticle(entradaDoCasoRealComSerp(), { position: 1, youtube: null, blueprint: contexto.blueprint, silo: contexto.silo, publication: contexto.publication, articleId: ARTIGO }).row.diretrizes_de_roteiro;
  assert.match(roteiro, /^Estrutura de títulos dos concorrentes da SERP \(H2\/H3 já lidos de \d+ página\(s\) comparável\(is\); referência para o gabarito, nunca roteiro — o que cobrem\): /m);
  assert.match(roteiro, /^O que não copiar da estrutura deles: a ordem e os títulos deles \(o vídeo segue os capítulos da planta\)/m);
  assert.match(roteiro, /^Entidades que os concorrentes citam \(varie a fala e o texto na tela com elas, sem repetir a keyword; entre parênteses, em quantas páginas\): .*só o mercado cita — Perfil da Empresa no Google \(4\)/m);
  assert.equal(idasAoServidor.length, 0, "nenhuma coleta");
  /* A régua pura: listicle numerado e H2 que abre pela keyword saem no "não copiar". */
  const linhas = radarVideoCompetitorReferenceLines({
    topics: [{ label: "Captação de pacientes", pages: 3, headings: ["1. Captação de pacientes dentista: o guia", "Captação de pacientes dentista no Google"] }],
    sampleSize: 5, keywords: ["captação de pacientes dentista"], entities: null, startsWithKeyword: radarHeadingStartsWithKeyword,
  });
  assert.equal(linhas[1], "O que não copiar da estrutura deles: a ordem e os títulos deles (o vídeo segue os capítulos da planta); H2 numerado de listicle (1 nos exemplos lidos); H2 que abre pela keyword (1 nos exemplos lidos).");
  assert.deepEqual(radarVideoCompetitorReferenceLines({ topics: [], sampleSize: 0, keywords: [], entities: null, startsWithKeyword: radarHeadingStartsWithKeyword }), []);
  /* Os capítulos dos vídeos concorrentes do YouTube continuam não coletados (coleta paga nova; backlog). */
  assert.match(fonteDe("lib/radar/video-production.ts"), /Capítulos dos concorrentes: a coleta do YouTube não lê a descrição nem os capítulos dos vídeos/);
});

/* ============================== 7 · as portas: tela, rota, export, MCP e catálogo ============================== */

test("F5 · estrutura · a rota e o MCP só leem (mesmo núcleo), o .zip por artigo leva o -links.csv, o painel do artigo mostra a malha, e o catálogo diz tudo", () => {
  const rota = fonteDe("app/api/editorial/radar-silo-links/route.ts");
  assert.match(rota, /export async function POST\(/);
  assert.match(rota, /assertEditorialPermission\(profile, corpo\.brandId, "radar", "view"\)/);
  assert.match(rota, /radarSiloLinksRead\(/);
  const nucleo = fonteDe("lib/server/radar-silo-links.ts");
  for (const fonte of [rota, nucleo]) assert.doesNotMatch(fonte, /\.(?:insert|update|upsert|delete)\(|generateStructuredAI|DataForSEO/i, "só leitura, sem IA e sem provider");
  assert.match(nucleo, /radarPortableWritingArticles\(/);
  assert.match(nucleo, /radarWritingMaterialOf\(/);
  assert.match(nucleo, /readPublishedStructure: radarReadPublishedStructure/);

  const exportar = fonteDe("app/api/editorial/radar-export/route.ts");
  assert.match(exportar, /radarSiloLinksOfAssembly\(\{ exportedAt, montadas, recusados, lentes, planoDaSelecao, publicacoes, brandVoice, grupos \}\)/);
  assert.match(exportar, /if \(!comSerpCrua \|\| plano\) return \[\];/, "só no .zip da exportação por artigo");
  assert.match(exportar, /siloLinks: \{ files: linksDoSilo \}/);
  assert.match(fonteDe("modules/radar/radar-page.tsx"), /\.\.\.linksDoSilo\.map\(arquivo => \(\{ name: arquivo\.filename, text: arquivo\.csv \}\)\)/);
  assert.match(fonteDe("modules/radar/radar-article-blueprint-panel.tsx"), /<RadarSiloLinksPanel brandId=\{brandId\} articleId=\{articleId\} \/>/);
  const painel = fonteDe("modules/radar/radar-silo-links-panel.tsx");
  assert.match(painel, /fetch\("\/api\/editorial\/radar-silo-links"/);
  assert.match(painel, /Conferir links do Silo/);
  assert.match(fonteDe("lib/server/radar-portable-export-core.ts"), /links: \[\.\.\.new Set\(\(pagina\.observedLinks \|\| \[\]\)\.filter\(link => link\.kind === "INTERNAL"\)/);

  const ferramentas = fonteDe("lib/server/platform-mcp-tools.ts");
  assert.match(ferramentas, /server\.registerTool\("get_silo_links_update"/);
  assert.match(ferramentas, /call\("get_silo_links_update", "platform\.read", \{ brandId \}, \[\{ module: "radar", action: "view" \}\]/);
  const operacao = PLATFORM_OPERATIONS.find(item => item.id === "radar.silo_links")!;
  assert.deepEqual(operacao.tools, ["get_silo_links_update"]);
  assert.deepEqual([...operacao.routes], ["/api/editorial/radar-silo-links"]);
  assert.equal(operacao.cost, "free");
  assert.ok((operacao.notes ?? []).some(nota => /NUNCA altera a página publicada, a URL, o slug nem o canonical/.test(nota)));
  assert.equal(idasAoServidor.length, 0);
});
