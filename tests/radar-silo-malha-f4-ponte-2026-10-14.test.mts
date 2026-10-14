import assert from "node:assert/strict";
import test from "node:test";
import type { InternalLinkGraph } from "../lib/arquiteto/contracts.ts";
import { buildStructuralLinkConnections, type StructuralLinkUnit } from "../lib/arquiteto/internal-link-structure.ts";
import { anchorRepeatsTargetKeyword } from "../lib/arquiteto/link-anchor-ai.ts";
import { relevantEdgesForArticle } from "../lib/arquiteto/radar-handoff-context.ts";
import { radarAnchorRepeatsKeyword } from "../lib/radar/natural-anchor.ts";
import { buildRadarWritingExportArticle } from "../lib/radar/portable-writing-export.ts";
import { RADAR_SILO_MESH_LIMITS, radarSiloMeshGraphPriorities, radarSiloMeshPlan } from "../lib/radar/silo-link-mesh.ts";
import { VERSAO } from "./radar-portable-writing-fixtures.mts";
import { SILO_DO_CASO_REAL, contextoDoCasoReal, entradaDoCasoReal } from "./fixtures/silo-interligado-caso-real-2026-10-14.mts";

/*
 * ===== 2026-10-14 · F4 · A MALHA DO ARQUITETO CHEGA AO RADAR (a ponte) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §6,
 * §11 e §14 (F4), D1–D3 decididas pelo dono em 2026-10-14. O Radar já lia o
 * `priority` do grafo (F2, `lib/radar/silo-link-mesh.ts`); com a malha gravada
 * pelo Arquiteto (F4):
 *   - a linha T do irmão deixa de dizer "fora do grafo aprovado" e diz "pedido
 *     pelo grafo aprovado", com o priority do grafo;
 *   - o teto de 12 irmãos na trilha (D3) vale também para o irmão do grafo (a
 *     única mudança na régua do Radar nesta fase); o obrigatório nunca é cortado;
 *   - a régua da âncora natural do Arquiteto diz o mesmo que a do Radar.
 * Sem rede, sem IA, sem banco.
 */

Object.defineProperty(globalThis, "fetch", {
  value: () => Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")),
  writable: true, configurable: true,
});

/* ============================== a régua da âncora: Arquiteto = Radar ============================== */

test("F4 · ponte · a âncora natural do Arquiteto diz o mesmo que a do Radar (keyword do destino, inteira ou contida)", () => {
  const keywords = ["captação de pacientes dentista", "empresa de captação de pacientes", "promoções para estética", "leads", "Instagram não traz pacientes"];
  const casos = [
    "captação de pacientes dentista", "Captações de Paciente Dentista", "captação de pacientes", "a empresa de captação de pacientes certa",
    "promoção para estética", "promoções", "leads", "os leads da clínica", "instagram", "o instagram não traz pacientes hoje",
    "pacientes que chegam sem anúncio", "", "estética",
  ];
  for (const caso of casos) {
    assert.equal(anchorRepeatsTargetKeyword(caso, keywords), radarAnchorRepeatsKeyword(caso, keywords), `"${caso}"`);
  }
});

/* ============================== o teto da trilha com a malha no grafo ============================== */

test("F4 · ponte · D3 · Silo de 30 com a malha no grafo: a trilha do Suporte leva no máximo 12 irmãos + a SiloPage; o Pilar sem teto", () => {
  const alvos = [
    { id: "K1", role: "Pilar", label: "pilar do silo", fromGraph: true, priority: "HIGH", position: 1 },
    ...Array.from({ length: 28 }, (_, indice) => ({ id: `K${indice + 2}`, role: "Suporte", label: `assunto ${indice + 2}`, fromGraph: true, priority: indice % 3 ? "LOW" : "MEDIUM", position: indice + 2 })),
    { id: "K30", role: "SiloPage", label: "SiloPage \"Silo\"", fromGraph: true, priority: "LOW", position: null },
  ];
  const plano = radarSiloMeshPlan({ articleRole: "Suporte", articleKeywords: ["outro assunto"], sections: [{ text: "nada a ver", linked: [] }], targets: alvos, insertHigh: true });
  const irmaosNaTrilha = plano.trail.filter(item => item.id !== "K1" && item.id !== "K30");
  assert.equal(irmaosNaTrilha.length, RADAR_SILO_MESH_LIMITS.trailSiblings);
  assert.ok(irmaosNaTrilha.slice(0, 10).every(item => item.priority === "MEDIUM"), "os de assunto próximo (MEDIUM) entram antes dos distantes");
  assert.equal(plano.outOfTrail.length, 28 - 12, "o resto fica a dois cliques, pelo Pilar e pela SiloPage");
  assert.equal(plano.trail[plano.trail.length - 1].id, "K30", "a SiloPage fecha a trilha");
  assert.ok(plano.targets.find(item => item.id === "K1")?.inBody, "o Pilar (HIGH) vai ao corpo, nunca é cortado");
  const doPilar = radarSiloMeshPlan({
    articleRole: "Pilar", articleKeywords: ["pilar do silo"], sections: [{ text: "nada a ver", linked: [] }],
    targets: alvos.slice(1).map(item => ({ ...item, priority: item.role === "Suporte" ? "HIGH" : item.priority })), insertHigh: true,
  });
  assert.equal(doPilar.outOfTrail.length, 0, "a trilha do Pilar não tem teto");
});

/* ============================== o caso real, ponta a ponta ============================== */

/** O grafo do Silo "Leads sem Tráfego Pago" depois da F4, com os nós no formato do Arquiteto. */
function grafoDaMalha(): InternalLinkGraph {
  const silo = SILO_DO_CASO_REAL();
  const unidades: StructuralLinkUnit[] = [
    { nodeId: "silo-page:leads", nodeType: "SILO_PAGE", architecturalRole: null, label: silo.label },
    ...silo.members.map(membro => ({
      nodeId: `article:${membro.articleId}`,
      nodeType: "ARTICLE_DNA" as const,
      architecturalRole: membro.role === "Pilar" ? "PILAR" as const : "SUPORTE" as const,
      label: membro.principalKeyword || membro.title || membro.articleId,
    })),
  ];
  const edges = buildStructuralLinkConnections(unidades).map((conexao, indice) => ({
    edgeId: `edge:${indice}`, ...conexao, anchorConcepts: ["a ideia do destino"], origin: "ai" as const,
    createdBy: "ator", createdAt: "2026-10-14T00:00:00.000Z", provenance: { source: "link-anchor-ai", references: [] },
  }));
  return {
    graphId: "arquiteto:internal-links:leads", graphVersionId: "grafo-v2", contentHash: "hash-v2", workflowStatus: "approved",
    nodes: unidades.map(unidade => ({
      nodeId: unidade.nodeId, nodeType: unidade.nodeType, architecturalRole: unidade.architecturalRole, snapshot: { label: unidade.label, siloId: "leads" },
      articleDnaVersionRef: unidade.nodeType === "ARTICLE_DNA" ? { entityId: unidade.nodeId.slice(8), versionId: unidade.nodeId === `article:${silo.members[2].articleId}` ? VERSAO : `v-${unidade.nodeId}`, contentHash: "h" } : null,
      siloPageVersionRef: null,
    })),
    edges,
  } as unknown as InternalLinkGraph;
}

const trilhaDe = (texto: string) => texto.split("\n").filter(linha => /^T\d+ · /.test(linha));

test("F4 · ponte · caso real (Suporte \"captação de pacientes dentista\"): com a malha no grafo, nenhuma linha diz \"fora do grafo aprovado\"", () => {
  /* Antes (F2, grafo de hoje sem S↔S): os irmãos da trilha saem "fora do grafo aprovado". */
  const antes = buildRadarWritingExportArticle(entradaDoCasoReal(), contextoDoCasoReal()).row.links_internos;
  assert.ok(trilhaDe(antes).some(linha => /fora do grafo aprovado/.test(linha)), "o retrato de antes da F4");

  /* Depois: as arestas deste artigo no grafo da malha, como o envio ao Radar as leva (`relevantEdgesForArticle`). */
  const relevantes = relevantEdgesForArticle({ graph: grafoDaMalha(), articleDnaVersionId: VERSAO });
  assert.ok(relevantes);
  const saida = relevantes!.edges.filter(edge => edge.direction === "outbound");
  assert.equal(saida.length, 8, "o Pilar, os 6 irmãos e a SiloPage");
  assert.equal(saida.filter(edge => edge.relationType === "SUPPORT_TO_SUPPORT").length, 6);
  const prioridades = radarSiloMeshGraphPriorities(saida);
  assert.equal(prioridades.byArticleId.size, 7);
  assert.equal(prioridades.siloPage, "LOW");

  const entrada = entradaDoCasoReal();
  const comMalha = { ...entrada, researchContext: { ...entrada.researchContext!, internalLinks: relevantes } } as typeof entrada;
  const depois = buildRadarWritingExportArticle(comMalha, contextoDoCasoReal()).row.links_internos;
  assert.doesNotMatch(depois, /fora do grafo aprovado/);
  const irmaosNaTrilha = trilhaDe(depois).filter(linha => /→ Suporte "/.test(linha));
  assert.ok(irmaosNaTrilha.length > 0);
  assert.ok(irmaosNaTrilha.every(linha => /pedido pelo grafo aprovado/.test(linha)), irmaosNaTrilha.join("\n"));
  /* Os 7 irmãos e a SiloPage continuam todos entre corpo e trilha (nada some). */
  for (const membro of SILO_DO_CASO_REAL().members.filter(item => item.inThisFile === false)) {
    assert.ok(depois.includes(`"${membro.principalKeyword}"`), `${membro.principalKeyword} no corpo ou na trilha`);
  }
  assert.match(depois, /SiloPage "Leads sem Tráfego Pago"/);
});
