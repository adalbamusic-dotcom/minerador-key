import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStructuralLinkConnections,
  structuralLinkBlockers,
  type StructuralLinkUnit,
} from "../lib/arquiteto/internal-link-structure.ts";

const raiz: StructuralLinkUnit = {
  nodeId: "silo-page:s1", nodeType: "SILO_PAGE", architecturalRole: null, label: "Anti-idade e Retinol",
};
const pilar: StructuralLinkUnit = {
  nodeId: "article:pilar", nodeType: "ARTICLE_DNA", architecturalRole: "PILAR", label: "retinol creamy antes e depois",
};
const suporte = (id: string, label: string): StructuralLinkUnit => ({
  nodeId: `article:${id}`, nodeType: "ARTICLE_DNA", architecturalRole: "SUPORTE", label,
});

/* -------------------- Silo raso continua tendo esqueleto ------------------ */

test("Silo com SiloPage e Pilar, sem suporte, tem grafo", () => {
  // Duas páginas linkáveis são arquitetura. Exigir um Article de suporte
  // confundia "sem profundidade" com "sem estrutura", e deixava o Article fora
  // do Radar por uma dívida que já estava registrada no SiloDNA.
  assert.deepEqual(structuralLinkBlockers([raiz, pilar]), []);

  const conexoes = buildStructuralLinkConnections([raiz, pilar]);
  assert.equal(conexoes.length, 2, "raiz→Pilar e Pilar→raiz");
  const tipos = conexoes.map(item => item.relationType).sort();
  assert.deepEqual(tipos, ["ARTICLE_TO_SILO_PAGE", "SILO_PAGE_TO_ARTICLE"]);
  // Nenhum suporte é inventado para o grafo existir.
  assert.equal(conexoes.some(item => item.relationType.includes("SUPPORT")), false);
});

test("uma página sozinha não forma grafo, e o motivo é dito", () => {
  const impedimentos = structuralLinkBlockers([raiz]);
  assert.match(impedimentos.join(" "), /Pilar/);
  assert.equal(buildStructuralLinkConnections([raiz]).length, 0);
});

test("sem Pilar não há verticalização a derivar", () => {
  const impedimentos = structuralLinkBlockers([raiz, suporte("a", "um artigo")]);
  assert.match(impedimentos.join(" "), /não tem Pilar/);
});

/* --------------------- Silo com profundidade: o mesmo -------------------- */

test("o esqueleto do Silo profundo cobre raiz, Pilar e suportes sem cartesiano", () => {
  const unidades = [raiz, pilar, suporte("s1", "um suporte"), suporte("s2", "outro suporte")];
  const conexoes = buildStructuralLinkConnections(unidades);

  const contagem = conexoes.reduce<Record<string, number>>((acc, item) => {
    acc[item.relationType] = (acc[item.relationType] || 0) + 1;
    return acc;
  }, {});
  assert.equal(contagem.SILO_PAGE_TO_ARTICLE, 3, "raiz abre pelo Pilar e lista os dois suportes");
  assert.equal(contagem.ARTICLE_TO_SILO_PAGE, 1, "só o Pilar volta para a raiz");
  assert.equal(contagem.PILLAR_TO_SUPPORT, 2);
  assert.equal(contagem.SUPPORT_TO_PILLAR, 2);
  // Suporte↔Suporte é julgamento editorial sobre o conteúdo, não organograma.
  assert.equal(contagem.SUPPORT_TO_SUPPORT, undefined);
});

test("toda conexão explica a si mesma em linguagem de arquitetura", () => {
  const conexoes = buildStructuralLinkConnections([raiz, pilar, suporte("s1", "um suporte")]);
  for (const conexao of conexoes) {
    assert.ok(conexao.reason.length > 20, `motivo curto demais: ${conexao.reason}`);
    assert.doesNotMatch(conexao.reason, /nodeId|article:|silo-page:/, "o motivo não mostra identificador cru");
  }
});
