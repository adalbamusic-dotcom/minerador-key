import assert from "node:assert/strict";
import test from "node:test";
import {
  RADAR_ARTICLE_BLUEPRINT_NEW_DESTINATION,
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarArticleBlueprintPendingNotes,
  radarArticleBlueprintPrompt,
  radarSanitizeArticleBlueprint,
} from "../lib/radar/article-blueprint.ts";
import { radarAnchorKey, radarAnchorRepeatsKeyword } from "../lib/radar/natural-anchor.ts";
import { buildRadarWritingExportArticle, type RadarWritingPublication } from "../lib/radar/portable-writing-export.ts";
import type { RadarSiloExportWritingContext } from "../lib/radar/portable-silo-export.ts";
import {
  RADAR_SILO_MESH_LIMITS,
  RADAR_SILO_MESH_PLACEMENT,
  radarSiloMeshGraphPriorities,
  radarSiloMeshPlan,
  radarSiloMeshPriority,
} from "../lib/radar/silo-link-mesh.ts";
import { ARTIGO } from "./radar-portable-writing-fixtures.mts";
import { respostaDaPlanta } from "./radar-piloto-planta-fixtures-2026-10-09.mts";
import {
  ARTIGO_DO_PILAR,
  CASO_REAL_ANTES,
  PUBLICACAO_DO_CASO_REAL,
  SILO_DO_CASO_REAL,
  contextoDoCasoReal,
  contextoDoPilarDoCasoReal,
  entradaDoCasoReal,
  entradaDoPilarDoCasoReal,
  plantaDoCasoReal,
  plantaDoPilarDoCasoReal,
} from "./fixtures/silo-interligado-caso-real-2026-10-14.mts";

/*
 * ===== 2026-10-14 · F2 · LINKS OBRIGATÓRIOS DO GRAFO E TRILHA NO RADAR =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §6,
 * §11, §13 e §15 (F2); D1, D2, D3, D6 e D10, decididas pelo dono em 2026-10-14
 * ("sim, pode sim, e do MCP também é uma boa ideia, pode implementar"):
 *   - a régua pura (`lib/radar/silo-link-mesh.ts`): o priority do grafo com
 *     sentido (HIGH corpo, MEDIUM corpo se trata, LOW trilha) e o mínimo
 *     estrutural (Suporte → Pilar, Pilar → cada Suporte);
 *   - o caso real: o Suporte do CSV do dono (5 links) passa a cobrir os 7 irmãos
 *     e a SiloPage entre corpo e trilha; o Pilar (3 links para 7 Suportes) liga
 *     aos 7;
 *   - Silo grande (30 artigos): trilha com no máximo 12 irmãos + SiloPage; o
 *     Pilar sem teto; teto de 3 links por seção;
 *   - destino não publicado como texto simples até ir ao ar; âncoras naturais
 *     sem keyword do destino e sem repetir;
 *   - a leitura corrige a planta gravada sem IA e sem mudar o payload (D6); a
 *     planta nova recebe a regra no pedido e, fechando, o obrigatório no corpo.
 * Sem rede, sem IA, sem banco.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE"));
  },
  writable: true, configurable: true,
});

type Linha = ReturnType<typeof buildRadarWritingExportArticle>["row"];
const linhaDoSuporte = (extra: Parameters<typeof contextoDoCasoReal>[0] = {}) => buildRadarWritingExportArticle(entradaDoCasoReal(), contextoDoCasoReal(extra)).row;
const linhaDoPilar = (extra: Parameters<typeof contextoDoPilarDoCasoReal>[0] = {}) => buildRadarWritingExportArticle(entradaDoPilarDoCasoReal(), contextoDoPilarDoCasoReal(extra)).row;

/** Os destinos de cada L e de cada T: o papel e o nome ("Suporte \"x\"", "SiloPage \"y\""), na ordem. */
function destinos(linha: Linha): { corpo: string[]; trilha: string[] } {
  const ler = (prefixo: "L" | "T") => linha.links_internos.split("\n")
    .filter(item => new RegExp(`^${prefixo}\\d+ · `).test(item))
    .map(item => {
      const achado = item.match(/ → ((?:Pilar|Suporte|SiloPage) "[^"]+")/);
      return achado ? achado[1] : item;
    });
  return { corpo: ler("L"), trilha: ler("T") };
}

/** Quantos links cada seção da estrutura posiciona (o teto é 3). */
function linksPorSecao(linha: Linha): number[] {
  const contagem: number[] = [];
  for (const item of linha.estrutura.split("\n")) {
    if (item.startsWith("## ")) contagem.push(0);
    else if (item.startsWith("- Link interno L") && contagem.length) contagem[contagem.length - 1] += 1;
  }
  return contagem;
}

/** O exemplo de âncora de cada L e de cada T, com o destino. */
function exemplos(linha: Linha): Array<{ destino: string; ancora: string }> {
  return linha.links_internos.split("\n")
    .filter(item => /^[LT]\d+ · /.test(item))
    .flatMap(item => {
      const exemplo = item.match(/por exemplo "([^"]+)"/);
      const destino = item.match(/ → ((?:Pilar|Suporte|SiloPage) "[^"]+")/);
      return exemplo && destino ? [{ destino: destino[1], ancora: exemplo[1] }] : [];
    });
}

const SUPORTES = [
  "Suporte \"instagram não traz pacientes\"",
  "Suporte \"captação de pacientes dentista\"",
  "Suporte \"promoções para estética\"",
  "Suporte \"como captar um cliente\"",
  "Suporte \"tráfego pago vs orgânico para clínica de estética\"",
  "Suporte \"campanhas de marketing para clínica de estética sem anúncios\"",
  "Suporte \"como atrair um cliente\"",
];
const SILOPAGE = "SiloPage \"Leads sem Tráfego Pago\"";
const PILAR = "Pilar \"leads qualificados\"";

/* ============================== a régua pura (D2) ============================== */

test("F2 · D2 · o priority com sentido: HIGH corpo, MEDIUM corpo se trata, LOW trilha", () => {
  assert.deepEqual(RADAR_SILO_MESH_PLACEMENT, { HIGH: "BODY", MEDIUM: "BODY_IF_TREATED", LOW: "TRAIL" });
  assert.equal(RADAR_SILO_MESH_LIMITS.trailSiblings, 12);
  assert.equal(RADAR_SILO_MESH_LIMITS.linksPerSection, 3);
});

test("F2 · D2 · o mínimo estrutural não baixa (Suporte → Pilar e Pilar → cada Suporte são HIGH); o resto é o grafo; sem aresta, o padrão da malha", () => {
  assert.equal(radarSiloMeshPriority({ articleRole: "Suporte", targetRole: "Pilar" }), "HIGH");
  assert.equal(radarSiloMeshPriority({ articleRole: "Suporte", targetRole: "Pilar", graphPriority: "LOW" }), "HIGH", "o grafo não baixa o obrigatório");
  assert.equal(radarSiloMeshPriority({ articleRole: "Pilar", targetRole: "Suporte", graphPriority: "MEDIUM" }), "HIGH");
  assert.equal(radarSiloMeshPriority({ articleRole: "Suporte", targetRole: "Suporte" }), "MEDIUM", "D1 · irmão: corpo se trata, senão trilha");
  assert.equal(radarSiloMeshPriority({ articleRole: "Suporte", targetRole: "Suporte", graphPriority: "low" }), "LOW", "a afinidade do Arquiteto (F4) manda pelo grafo");
  assert.equal(radarSiloMeshPriority({ articleRole: "Suporte", targetRole: "SiloPage" }), "LOW");
  assert.equal(radarSiloMeshPriority({ articleRole: "Pilar", targetRole: "SiloPage" }), "MEDIUM");
  assert.equal(radarSiloMeshPriority({ articleRole: "Suporte (formação)", targetRole: "Pilar (formação)" }), "MEDIUM", "a sugestão da formação não é Pilar decidido");
  const grafo = radarSiloMeshGraphPriorities([
    { targetNodeId: "article:a", priority: "MEDIUM", direction: "outbound" },
    { targetNodeId: "article:a", priority: "HIGH", direction: "outbound" },
    { targetNodeId: "article:b", priority: "HIGH", direction: "inbound" },
    { targetNodeId: "silo-page:x", relationType: "ARTICLE_TO_SILO_PAGE", priority: "LOW", direction: "outbound" },
  ]);
  assert.equal(grafo.byArticleId.get("a"), "HIGH", "a mais forte");
  assert.equal(grafo.byArticleId.has("b"), false, "a aresta de entrada não é deste artigo");
  assert.equal(grafo.siloPage, "LOW");
});

test("F2 · a régua pura: o HIGH entra na seção que trata (o Pilar, sem ela, na primeira que cabe); o teto de 3 por seção; nada some", () => {
  const plano = radarSiloMeshPlan({
    articleRole: "Suporte",
    articleKeywords: ["tema do artigo"],
    sections: [
      { text: "Abertura geral", linked: ["X1", "X2", "X3"] },
      { text: "Promoções que funcionam", linked: [] },
    ],
    targets: [
      { id: "P", role: "Pilar", label: "pilar central" },
      { id: "S1", role: "Suporte", label: "promoções para estética", position: 3 },
      { id: "S2", role: "Suporte", label: "outro assunto distante", position: 2 },
      { id: "SP", role: "SiloPage", label: "Silo" },
    ],
    insertHigh: true,
  });
  assert.deepEqual(plano.inserted, [{ id: "P", section: 1 }], "a seção 1 está cheia (3 links): o Pilar vai à primeira que cabe");
  assert.deepEqual(plano.trail.map(item => item.id), ["S1", "S2", "SP"], "irmãos por afinidade e ordem, a SiloPage por último");
  const semInserir = radarSiloMeshPlan({
    articleRole: "Suporte", articleKeywords: [], sections: [{ text: "x", linked: [] }],
    targets: [{ id: "P", role: "Pilar", label: "pilar" }], insertHigh: false,
  });
  assert.deepEqual(semInserir.missingHigh, [{ id: "P", section: 0 }], "sem fechar, o obrigatório que falta vira pendência");
  assert.deepEqual(semInserir.trail.map(item => item.id), ["P"], "e, enquanto falta, ele não some: está na trilha");
});

/* ============================== o caso real: o Suporte ============================== */

test("F2 · caso real · o Suporte \"captação de pacientes dentista\": de 5 links para corpo + trilha cobrindo os 7 irmãos e a SiloPage", () => {
  assert.equal(CASO_REAL_ANTES.csv.links.length, 5, "antes: 5 links (L1 Pilar, L2–L4 três Suportes, L5 SiloPage)");
  const gravada = plantaDoCasoReal();
  const antes = JSON.stringify(gravada);
  const linha = linhaDoSuporte({ blueprint: gravada });
  const { corpo, trilha } = destinos(linha);
  assert.equal(corpo.length, 5, "os 5 L da planta continuam, na mesma ordem");
  assert.equal(corpo[0], PILAR, "L1 → o Pilar, no corpo (HIGH)");
  const todos = [...corpo, ...trilha];
  assert.equal(new Set(todos).size, todos.length, "cada destino uma vez só (corpo ou trilha)");
  assert.deepEqual([...todos].sort(), [PILAR, SILOPAGE, ...SUPORTES.filter(item => !item.includes("captação de pacientes dentista"))].sort(), "os 7 irmãos (o Pilar e 6 Suportes) e a SiloPage");
  assert.deepEqual(trilha, [
    "Suporte \"como captar um cliente\"",
    "Suporte \"promoções para estética\"",
    "Suporte \"como atrair um cliente\"",
  ], "a trilha: os 3 irmãos que ficaram fora (\"promoções\" era citado sem link; \"captar\" e \"atrair\" ausentes)");
  assert.match(linha.links_internos, /^Malha do Silo \(regras 2026-10-14\): este artigo \(Suporte\) liga a 8 de 8 destinos do Silo: 5 no corpo \(L\) e 3 na trilha \(T\)\./m);
  assert.match(linha.links_internos, /^Trilha "Continue no Silo" \(no fim do artigo, depois do fechamento; é navegação, não uma segunda chamada\)/m);
  assert.match(linha.estrutura, /^Trilha "Continue no Silo" \(depois do fechamento; navegação, não uma segunda chamada\): 3 destinos do Silo, T1–T3 da coluna links_internos, um por linha\.$/m);
  assert.match(linha.estrutura, / · 5 links internos \(\+ 3 destinos na trilha "Continue no Silo"\) · /);
  assert.equal(JSON.stringify(gravada), antes, "D6: a leitura não muda o payload gravado (nem o hash)");
});

test("F2 · caso real · o Pilar \"leads qualificados\": de 3 links para 7 Suportes, liga aos 7 (corpo onde a seção trata, o resto na trilha) e à SiloPage", () => {
  assert.equal(CASO_REAL_ANTES.silo.pillarLinksInPlan, 3);
  const gravada = plantaDoPilarDoCasoReal();
  assert.equal(gravada.blueprint.sections.flatMap(secao => secao.internalLinks).length, 3, "antes: 3 links na planta gravada");
  const antes = JSON.stringify(gravada);
  const linha = linhaDoPilar({ blueprint: gravada });
  const { corpo, trilha } = destinos(linha);
  const todos = [...corpo, ...trilha];
  assert.equal(new Set(todos).size, todos.length);
  for (const suporte of SUPORTES) assert.ok(todos.includes(suporte), `o Pilar liga a ${suporte}`);
  assert.ok(todos.includes(SILOPAGE), "e à SiloPage");
  assert.equal(todos.length, 8);
  assert.deepEqual(corpo.slice(0, 1), ["Suporte \"instagram não traz pacientes\""], "os links da planta continuam");
  assert.ok(corpo.includes("Suporte \"como captar um cliente\"") && corpo.includes("Suporte \"tráfego pago vs orgânico para clínica de estética\""));
  assert.ok(corpo.includes("Suporte \"promoções para estética\""), "a seção \"Promoções que atraem…\" trata do Suporte de promoções: ele entra no corpo");
  assert.ok(corpo.includes("Suporte \"campanhas de marketing para clínica de estética sem anúncios\""), "o H3 \"Campanhas de marketing sem verba de mídia\" trata dele");
  assert.ok(trilha.includes("Suporte \"captação de pacientes dentista\""), "nenhuma seção trata do recorte do dentista: trilha, sem link forçado");
  assert.equal(trilha[trilha.length - 1], SILOPAGE, "a SiloPage fecha a trilha");
  assert.match(linha.links_internos, /^Malha do Silo \(regras 2026-10-14\): este artigo \(Pilar\) liga a 8 de 8 destinos do Silo: 6 no corpo \(L\) e 2 na trilha \(T\)\./m);
  assert.match(linha.links_internos, /o Pilar lista aqui todos os Suportes que não entraram no corpo/);
  assert.match(linha.links_internos, /^T1 · .* · por quê: Suporte do Pilar \(obrigatório\): nenhuma seção trata do recorte dele ou tem lugar para o link$/m);
  for (const quantos of linksPorSecao(linha)) assert.ok(quantos <= RADAR_SILO_MESH_LIMITS.linksPerSection, `teto por seção: ${quantos}`);
  assert.equal(JSON.stringify(gravada), antes, "D6: o payload não muda");
});

/* ============================== Silo grande (≥ 15) ============================== */

const PREFIXO = "https://marca-exemplo.com.br/leads-sem-trafego-pago";
function siloGrande(total: number): RadarSiloExportWritingContext {
  const base = SILO_DO_CASO_REAL();
  const extras = Array.from({ length: total - base.members.length }, (_item, indice) => {
    const numero = indice + 9;
    const tema = ["agenda cheia", "retorno de pacientes", "avaliações no Google", "indicação de pacientes", "recepção que converte", "preço da consulta", "tratamento estético", "site da clínica", "perfil no Google", "lembrete por WhatsApp", "pacote de sessões", "pós-atendimento", "fidelização", "orçamento recusado", "primeira consulta", "lista de espera", "parcerias locais", "eventos na clínica", "conteúdo em vídeo", "depoimentos autorizados", "rotina do consultório", "equipe de atendimento"][indice % 22];
    return { articleId: `sup-${numero}`, position: numero, title: `${tema} ${numero}`, principalKeyword: `${tema} ${numero}`, slug: `tema-${numero}`, role: "Suporte", statusLabel: "fora desta seleção", inThisFile: false, reason: null };
  });
  return { ...base, members: [...base.members, ...extras] } as RadarSiloExportWritingContext;
}

test("F2 · D3 · Silo de 30 · o Suporte: o Pilar no corpo; a trilha com no máximo 12 irmãos + a SiloPage; o resto a dois cliques", () => {
  const linha = linhaDoSuporte({ silo: siloGrande(30) });
  const { corpo, trilha } = destinos(linha);
  assert.ok(corpo.includes(PILAR), "o Pilar no corpo");
  assert.ok(corpo.includes(SILOPAGE), "a SiloPage já está no corpo da planta (L5): não se repete na trilha");
  const irmaosNaTrilha = trilha.filter(item => item.startsWith("Suporte "));
  assert.equal(irmaosNaTrilha.length, RADAR_SILO_MESH_LIMITS.trailSiblings, "12 irmãos");
  assert.equal(trilha.length, RADAR_SILO_MESH_LIMITS.trailSiblings);
  /* 30 destinos (o Pilar, 28 Suportes e a SiloPage): 5 no corpo, 12 na trilha, 13 a dois cliques. */
  assert.match(linha.links_internos, /^Malha do Silo \(regras 2026-10-14\): este artigo \(Suporte\) liga a 17 de 30 destinos do Silo: 5 no corpo \(L\) e 12 na trilha \(T\); 13 irmãos ficam a dois cliques, pelo Pilar e pela SiloPage\./m);
  for (const quantos of linksPorSecao(linha)) assert.ok(quantos <= RADAR_SILO_MESH_LIMITS.linksPerSection);
  /* Sem a SiloPage no corpo, ela vem depois dos 12 irmãos (o índice completo). */
  const semSiloPageNoCorpo = plantaDoCasoReal();
  semSiloPageNoCorpo.blueprint.sections = semSiloPageNoCorpo.blueprint.sections.map(secao => ({ ...secao, internalLinks: secao.internalLinks.filter(link => link.candidate !== "K5") }));
  const outra = destinos(linhaDoSuporte({ silo: siloGrande(30), blueprint: semSiloPageNoCorpo }));
  assert.equal(outra.trilha.length, RADAR_SILO_MESH_LIMITS.trailSiblings + 1);
  assert.equal(outra.trilha[outra.trilha.length - 1], SILOPAGE, "12 irmãos + a SiloPage, índice completo");
});

test("F2 · D3 · Silo de 30 · o Pilar liga a todos os 29 Suportes (corpo + trilha, sem teto) e à SiloPage, com no máximo 3 links por seção", () => {
  const linha = linhaDoPilar({ silo: siloGrande(30) });
  const { corpo, trilha } = destinos(linha);
  const todos = [...corpo, ...trilha];
  assert.equal(todos.filter(item => item.startsWith("Suporte ")).length, 29, "os 29 Suportes");
  assert.equal(new Set(todos).size, todos.length);
  assert.ok(todos.includes(SILOPAGE));
  assert.ok(trilha.filter(item => item.startsWith("Suporte ")).length > RADAR_SILO_MESH_LIMITS.trailSiblings, "a trilha do Pilar passa de 12: sem teto");
  for (const quantos of linksPorSecao(linha)) assert.ok(quantos <= RADAR_SILO_MESH_LIMITS.linksPerSection, `teto por seção: ${quantos}`);
  assert.doesNotMatch(linha.links_internos, /a dois cliques/, "nenhum Suporte fica de fora do Pilar");
});

/* ============================== destino não publicado ============================== */

test("F2 · destino novo fica como texto simples até ir ao ar; o irmão publicado sai com a URL", () => {
  const publicado = { published: true, publishedUrl: `${PREFIXO}/como-captar-um-cliente`, canonical: null, slug: "como-captar-um-cliente", principalPolicy: null } as RadarWritingPublication;
  const linha = linhaDoSuporte({ siloPublications: new Map([["sup-captar", publicado]]) });
  const linhas = linha.links_internos.split("\n");
  const captar = linhas.find(item => /^T\d+ · .*→ Suporte "como captar um cliente"/.test(item))!;
  assert.ok(captar.includes(`→ ${PREFIXO}/como-captar-um-cliente (publicado)`), captar);
  const atrair = linhas.find(item => /^T\d+ · .*→ Suporte "como atrair um cliente"/.test(item))!;
  assert.ok(atrair.includes(`→ ${PREFIXO}/como-atrair-um-cliente (${RADAR_ARTICLE_BLUEPRINT_NEW_DESTINATION})`), atrair);
  assert.ok(linhas.some(item => item.startsWith("Destino novo (ainda não publicado): o link entra quando o destino estiver no ar") && item.includes("a âncora fica como texto simples, sem link (nunca link quebrado)")));
});

/* ============================== âncoras naturais ============================== */

test("F2 · âncoras · nenhuma é keyword do destino; nenhuma se repete entre destinos; no lote, a mesma âncora não volta para o mesmo destino", () => {
  const livro = new Map<string, Set<string>>();
  const suporte = linhaDoSuporte({ anchorLedger: livro });
  const pilar = linhaDoPilar({ anchorLedger: livro });
  for (const linha of [suporte, pilar]) {
    const lidos = exemplos(linha);
    assert.ok(lidos.length >= 6);
    for (const { destino, ancora } of lidos) {
      const nome = destino.replace(/^(?:Pilar|Suporte|SiloPage) "|"$/g, "");
      assert.equal(radarAnchorRepeatsKeyword(ancora, [nome]), false, `${ancora} → ${destino}`);
    }
    const porAncora = new Map<string, string>();
    for (const { destino, ancora } of lidos) {
      const chave = radarAnchorKey(ancora);
      assert.ok(!porAncora.has(chave) || porAncora.get(chave) === destino, `a âncora "${ancora}" leva a dois destinos`);
      porAncora.set(chave, destino);
    }
  }
  const doLote = (linha: Linha, destino: string) => exemplos(linha).filter(item => item.destino === destino).map(item => radarAnchorKey(item.ancora));
  for (const destino of [SILOPAGE, "Suporte \"como captar um cliente\"", "Suporte \"como atrair um cliente\"", "Suporte \"promoções para estética\""]) {
    const nasDuas = doLote(suporte, destino).filter(chave => doLote(pilar, destino).includes(chave));
    assert.deepEqual(nasDuas, [], `a mesma âncora para ${destino} nas duas linhas do lote`);
  }
});

/* ============================== a leitura corrige a planta gravada (D6) ============================== */

test("F2 · D6 · a planta gravada sem o link do Pilar: a leitura o põe no corpo (sem IA, sem mudar o payload)", () => {
  const gravada = plantaDoCasoReal();
  const semPilar = {
    ...gravada,
    blueprint: { ...gravada.blueprint, sections: gravada.blueprint.sections.map(secao => ({ ...secao, internalLinks: secao.internalLinks.filter(link => link.candidate !== "K1") })) },
  };
  const antes = JSON.stringify(semPilar);
  const linha = linhaDoSuporte({ blueprint: semPilar });
  const { corpo, trilha } = destinos(linha);
  assert.ok(corpo.includes(PILAR), "o Pilar volta ao corpo");
  assert.ok(!trilha.includes(PILAR));
  const doPilar = linha.links_internos.split("\n").find(item => item.includes(`→ ${PILAR}`))!;
  assert.match(doPilar, /a ideia do destino \(o Pilar, que cobre o tema inteiro do Silo\)/);
  assert.equal(JSON.stringify(semPilar), antes);
  assert.deepEqual(idasAoServidor, []);
});

test("F2 · sem o papel (outros chamadores das colunas), a leitura é a de antes: nenhuma trilha", () => {
  const linha = buildRadarWritingExportArticle(entradaDoCasoReal(), { ...contextoDoCasoReal(), silo: null, topRowLabel: "Marca" }).row;
  assert.doesNotMatch(linha.links_internos, /^T\d+ · /m, "sem Silo no arquivo, a malha usa só os candidatos da planta");
});

/* ============================== a planta nova (pedido e conferência) ============================== */

const briefComSilo = () => buildRadarArticleBlueprintBrief({ entrada: entradaDoCasoReal(), silo: SILO_DO_CASO_REAL(), articleId: ARTIGO, publication: PUBLICACAO_DO_CASO_REAL });

test("F2 · pedido · cada K grava a obrigação (priority) e a regra 6 diz a malha do Silo", () => {
  const brief = briefComSilo();
  const porRotulo = new Map(brief.linkCandidates.map(item => [item.label, item]));
  assert.equal(porRotulo.get("leads qualificados")?.priority, "HIGH");
  assert.equal(porRotulo.get("como captar um cliente")?.priority, "MEDIUM");
  assert.equal(brief.linkCandidates.find(item => item.role === "SiloPage")?.priority, "LOW");
  const { system, user } = radarArticleBlueprintPrompt(brief);
  assert.match(system, /^6\. Links internos: .* MALHA DO SILO \(cada K diz a obrigação\): o K "obrigatório no corpo" entra numa seção — o Suporte liga ao Pilar na seção que trata do tema central \(sem ela, na primeira\) e o Pilar liga a CADA Suporte/m);
  assert.match(system, /no máximo 1 irmão por seção; .* no máximo 3 links por seção\. O que não couber no corpo vai para a trilha "Continue no Silo" do fim do artigo, que o servidor monta/);
  assert.match(user, /· Pilar · leads qualificados · .* · obrigatório no corpo/);
  assert.match(user, /· Suporte · como captar um cliente · .* · no corpo só se uma seção trata do assunto dele; senão, trilha "Continue no Silo"/);
  assert.match(user, /· SiloPage · SiloPage "Leads sem Tráfego Pago" · .* · trilha "Continue no Silo"/);
});

test("F2 · conferência · sem o Pilar no corpo: sem fechar, pendência (a passada de correção tenta); fechando, o servidor o põe sem IA", () => {
  const brief = briefComSilo();
  const resposta = RadarArticleBlueprintAiSchema.parse(respostaDaPlanta(brief, {}, { semLinks: true }));
  const aberta = radarSanitizeArticleBlueprint(resposta, brief);
  const pendentes = radarArticleBlueprintPendingNotes(aberta.notes).pending;
  assert.ok(pendentes.some(nota => /^Falta o link para o Pilar \(leads qualificados\) no corpo: ponha-o .* antes de aprovar \(malha do Silo, obrigatório no corpo\)\.$/.test(nota)), pendentes.join("\n"));
  assert.equal(aberta.payload.blueprint.sections.some(secao => secao.internalLinks.length), false, "sem fechar, nada é posto");
  const fechada = radarSanitizeArticleBlueprint(resposta, brief, { close: true });
  const pilar = brief.linkCandidates.find(item => item.label === "leads qualificados")!;
  const comPilar = fechada.payload.blueprint.sections.filter(secao => secao.internalLinks.some(link => link.candidate === pilar.id));
  assert.equal(comPilar.length, 1, "o link do Pilar entrou numa seção");
  const ancora = comPilar[0].internalLinks.find(link => link.candidate === pilar.id)!.anchor;
  assert.equal(radarAnchorRepeatsKeyword(ancora, ["leads qualificados"]), false, `âncora natural: ${ancora}`);
  assert.ok(fechada.notes.some(nota => nota.startsWith("Malha do Silo: o link obrigatório para o Pilar (leads qualificados) entrou na seção ")));
  assert.equal(radarArticleBlueprintPendingNotes(fechada.notes).pending.some(nota => /Falta o link para o Pilar/.test(nota)), false, "fechada, a planta sai concluída (D10)");
  assert.equal(fechada.payload.measures.plan.internalLinks, 1);
  assert.deepEqual(fechada.payload.linkCandidates.map(item => item.priority), brief.linkCandidates.map(item => item.priority), "a obrigação fica gravada nos candidatos");
});

test("F2 · conferência do Pilar: o Suporte que uma seção trata e o Pilar não liga vira pendência; o que nenhuma trata fica para a trilha, sem pendência", () => {
  const silo = SILO_DO_CASO_REAL();
  const brief = buildRadarArticleBlueprintBrief({ entrada: entradaDoPilarDoCasoReal(), silo, articleId: ARTIGO_DO_PILAR, publication: null });
  assert.equal(brief.article.siloRole, "Pilar");
  assert.ok(brief.linkCandidates.filter(item => item.role === "Suporte").every(item => item.priority === "HIGH"), "P → cada Suporte: HIGH");
  const resposta = RadarArticleBlueprintAiSchema.parse(respostaDaPlanta(brief, {}, { semLinks: true }));
  resposta.sections = [
    { ...resposta.sections[0], h2: "Promoções que atraem sem derrubar a margem", readerQuestion: "Promoção traz contato qualificado?", h3: ["Quando a promoção vale a pena"], explain: [] },
    ...resposta.sections.slice(1),
  ];
  const { notes } = radarSanitizeArticleBlueprint(resposta, brief);
  assert.ok(notes.some(nota => /^O Pilar não liga ao Suporte "promoções para estética", que a seção "Promoções que atraem sem derrubar a margem" trata: ponha o link nela antes de aprovar/.test(nota)), notes.join("\n"));
  assert.equal(notes.some(nota => /O Pilar não liga ao Suporte "captação de pacientes dentista"/.test(nota)), false, "sem seção que o trate: trilha, sem link forçado");
});

test("F2 · nada saiu para a rede", () => {
  assert.deepEqual(idasAoServidor, []);
  assert.equal(CASO_REAL_ANTES.csv.links.length, 5);
  assert.ok(plantaDoPilarDoCasoReal().linkCandidates.length === 8);
});
