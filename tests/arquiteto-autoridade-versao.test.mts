import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canonicalRevisionState,
  groupVersionAuthorities,
  resolveVersionAuthority,
} from "../lib/arquiteto/canonical-version-authority.ts";

/**
 * PROPOSTA NÃO REBAIXA APROVADA.
 *
 * A leitura da mesa colapsava a lista de versões com `Object.fromEntries` sobre
 * a ordem crescente de `version_number`: sobrava a mais nova, aprovada ou não.
 * Registrar uma classificação criava v14 `proposed` e o v13 aprovado sumia da
 * tela como se nunca tivesse existido.
 */

const v = (versionNumber: number) => ({ versionId: `v${versionNumber}`, versionNumber });
const status = (mapa: Record<string, string>) => (versionId: string) => mapa[versionId] ?? null;

test("aprovada v13 com proposta v14: a canônica continua sendo v13", () => {
  const autoridade = resolveVersionAuthority({
    versions: [v(13), v(14)],
    statusOf: status({ v13: "approved", v14: "proposed" }),
  });
  assert.equal(autoridade.canonical?.versionNumber, 13);
  assert.equal(autoridade.workingProposal?.versionNumber, 14);
  // `latest` continua sendo a base de qualquer sucessora: numerar a partir da
  // canônica com uma proposta mais nova colidiria de versão.
  assert.equal(autoridade.latest?.versionNumber, 14);
});

test("sem proposta, canônica e latest são a mesma versão", () => {
  const autoridade = resolveVersionAuthority({ versions: [v(1), v(2)], statusOf: status({ v1: "proposed", v2: "approved" }) });
  assert.equal(autoridade.canonical?.versionNumber, 2);
  assert.equal(autoridade.workingProposal, null);
  assert.equal(autoridade.latest?.versionNumber, 2);
});

test("nunca aprovada: não há canônica, e a proposta é nomeada", () => {
  const autoridade = resolveVersionAuthority({ versions: [v(1)], statusOf: status({ v1: "proposed" }) });
  assert.equal(autoridade.canonical, null);
  assert.equal(autoridade.workingProposal?.versionNumber, 1);
});

test("rejeitada e superseded saem da disputa", () => {
  const autoridade = resolveVersionAuthority({
    versions: [v(1), v(2), v(3)],
    statusOf: status({ v1: "approved", v2: "superseded", v3: "rejected" }),
  });
  assert.equal(autoridade.canonical?.versionNumber, 1);
  assert.equal(autoridade.workingProposal, null, "descartadas não são revisão em andamento");
  assert.equal(autoridade.latest?.versionNumber, 1);
});

test("proposta ANTERIOR à aprovada é história, não revisão em andamento", () => {
  const autoridade = resolveVersionAuthority({ versions: [v(4), v(5)], statusOf: status({ v4: "proposed", v5: "approved" }) });
  assert.equal(autoridade.canonical?.versionNumber, 5);
  assert.equal(autoridade.workingProposal, null);
});

test("agrupar por entidade dá uma autoridade por artefato", () => {
  const versoes = [
    { versionId: "a1", versionNumber: 1, entityId: "article:1" },
    { versionId: "a2", versionNumber: 2, entityId: "article:1" },
    { versionId: "b1", versionNumber: 1, entityId: "article:2" },
  ];
  const mapa = groupVersionAuthorities({
    versions: versoes,
    entityIdOf: version => version.entityId,
    statusOf: status({ a1: "approved", a2: "proposed", b1: "proposed" }),
  });
  assert.equal(mapa.get("article:1")?.canonical?.versionId, "a1");
  assert.equal(mapa.get("article:1")?.workingProposal?.versionId, "a2");
  assert.equal(mapa.get("article:2")?.canonical, null);
});

/* ============ proposta em curso ≠ aprovada invalidada =================== */

test("proposta em andamento NÃO invalida a aprovada nem barra o consumo", () => {
  const estado = canonicalRevisionState({
    authority: resolveVersionAuthority({ versions: [v(13), v(14)], statusOf: status({ v13: "approved", v14: "proposed" }) }),
  });
  assert.equal(estado.workingProposalExists, true);
  assert.equal(estado.canonicalIsStale, false, "existir versão mais nova não é invalidação");
  assert.equal(estado.usableDownstream, true, "Links e Radar continuam podendo usar a aprovada");
  assert.equal(estado.headline, "v13 aprovada · revisão v14 em andamento");
});

test("invalidação estrutural exige motivo declarado, e aí sim bloqueia", () => {
  const estado = canonicalRevisionState({
    authority: resolveVersionAuthority({ versions: [v(13)], statusOf: status({ v13: "approved" }) }),
    staleReasons: ["O território do artigo mudou depois desta aprovação."],
  });
  assert.equal(estado.canonicalIsStale, true);
  assert.equal(estado.usableDownstream, false);
  assert.match(estado.headline, /precisa de revisão: O território do artigo mudou/);
});

test("sem versão aprovada não há o que invalidar", () => {
  const estado = canonicalRevisionState({
    authority: resolveVersionAuthority({ versions: [v(1)], statusOf: status({ v1: "proposed" }) }),
    staleReasons: ["motivo qualquer"],
  });
  assert.equal(estado.canonicalIsStale, false);
  assert.equal(estado.usableDownstream, false, "não usável porque não existe, não porque está velha");
  assert.equal(estado.headline, "Sem versão aprovada · v1 em revisão");
});

/* ====================== a mesa consome as duas leituras ================= */

test("a mesa lê a canônica aprovada, não a última gravada", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  assert.match(workspace, /groupVersionAuthorities\(\{/, "a autoridade precisa ser derivada da lista inteira");
  assert.match(workspace, /canonicalArticleVersions/, "a lista completa precisa ficar disponível");
  // `articleDnaEntryFor` passa a devolver os dois fatos separados.
  assert.match(workspace, /canonical: autoridade\?\.canonical \?\? null/);
  assert.match(workspace, /workingProposal: autoridade\?\.workingProposal \?\? null/);
});

test("o gate do Radar compara o grafo com a versão CANÔNICA do artigo", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  // Comparar com a última gravada faria uma proposta no-op bloquear o envio:
  // o grafo aprovado aponta para a versão aprovada, nunca para a proposta.
  assert.match(workspace, /node\.articleDnaVersionRef\?\.versionId === canonical\?\.versionId/);
  assert.match(workspace, /siloPageAuthorities\.get\(String\(page\.payload\.siloPageId\)\)\?\.canonical/);
});

test("Links participa com a canônica aprovada, nunca com a proposta", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const leitura = workspace.slice(workspace.indexOf("const naoConcluidos = doSilo"));
  assert.match(leitura.slice(0, 300), /!articleDnaEntryFor\(/, "a participação vem da canônica");
  assert.match(leitura.slice(0, 300), /\}\)\.canonical\)/);
  assert.ok(!leitura.slice(0, 300).includes("effectiveVersionStatus"), "não se pergunta o status da última gravada");
});

test("a coluna Aprovação deixa de ler a última versão gravada", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  /*
   * O invariante não mudou; mudou quem o sustenta. A projeção da coluna saiu
   * da tela e virou `resolveArticleRowAxes`, que lê o estado da versão
   * CANÔNICA — nunca a última gravação — e responde as duas colunas de uma
   * vez, para que elas não voltem a discordar.
   */
  assert.match(workspace, /canonicalArticleDnaStatus: articleDnaStatus === "approved" \? "approved" : null/);
  assert.doesNotMatch(workspace, /const articleApprovalStatus = useCallback/);
  assert.match(workspace, /data-testid="architect-working-proposal"/, "a revisão em andamento precisa aparecer nomeada");
  assert.match(workspace, /Revisão v\{articleRevision\.workingProposal!\.versionNumber\} em andamento/);
});

test("tipo de unidade é fato derivado, não pendência humana", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const estrategia = readFileSync("lib/arquiteto/unit-strategy.ts", "utf8");
  assert.match(workspace, /defined: editorialUnitTypeIsDerived\(unitClassification\)/);
  // Confirmar que um Article é um Article não decidia nada — e gravava uma
  // sucessora `proposed`, rebaixando o artigo.
  assert.ok(!workspace.includes(`defined: unitClassification?.status === "human_confirmed"`));
  assert.match(estrategia, /export function editorialUnitTypeIsDerived/);
  assert.match(estrategia, /return unit\.type !== "other";/, "só ambiguidade real vira decisão humana");
});
