import assert from "node:assert/strict";
import test from "node:test";
import { VersionedSiloDNASchema, type SiloDNA, type VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { RADAR_IMPORT_NO_SILO_LABEL, radarImportSiloGroups } from "../lib/radar/import-silo-groups.ts";

/*
 * ===== A IMPORTAÇÃO DO RADAR AGRUPADA POR SILO — 2026-10-07 =====
 *
 * ==================== O QUE ESTA SUÍTE GUARDA ====================
 *
 * - siloId DECLARADO no ArticleDNA vence composição e território (2026-10-07,
 *   passada dos revisores): é a precedência de `resolveCanonicalSiloForArticle`
 *   e é o declarado que vira `RadarItem.siloId` — a chave do CSV por silo;
 * - COMPOSIÇÃO vence territoryRef: artigo na composição de um silo pertence a
 *   ele mesmo quando o território aponta para outro;
 * - mais de um SiloDNA do MESMO silo usa o mais recente (versionNumber);
 * - sem silo resolvido → "Sem silo", SEMPRE por último, com a MESMA grafia do
 *   arquivo do export;
 * - dentro do grupo: Pilar → ordem narrativa → o resto na ordem de chegada —
 *   a mesma regra do export por silo, para o grupo da importação bater com o
 *   arquivo exportado;
 * - rótulo NUNCA é o id cru: silo sem nome vira "Silo sem nome N", e quem
 *   CONSOME um N é o mesmo silo que consome no export (nome que limpa para
 *   vazio também anda o contador).
 *
 * A bancada usa o schema real do SiloDNA (VersionedSiloDNASchema.parse): uma
 * fixture inventada testaria a fantasia do contrato, não o contrato.
 */

const uuid = (numero: number) => `4e1b${String(numero).padStart(4, "0")}-6a2c-4d3e-8b7f-${String(numero).padStart(12, "0")}`;
const hash = (numero: number) => `sha256:${numero.toString(16).padStart(64, "0")}`;

const MARCA = uuid(1);
const S1 = uuid(101); /* Crescimento: pilar + ordem narrativa */
const S2 = uuid(102); /* Autoridade: vem antes de Crescimento no alfabeto */
const S3 = uuid(103); /* sem nome: "Silo sem nome 1" */
const S4 = uuid(104); /* Território: recebe linha só pelo territoryRef */
const S5 = uuid(105); /* duas versões: a mais recente decide */

const A1 = uuid(201), A2 = uuid(202), A3 = uuid(203);
const B1 = uuid(211);
const C1 = uuid(221);
const D1 = uuid(231);
const E1 = uuid(241); /* não está em composição nenhuma; tem o território de S4 */
const F1 = uuid(251); /* não está em lugar nenhum: "Sem silo" */
const G1 = uuid(261); /* estava na v1 de S5 e saiu na v2 */
const H1 = uuid(262); /* entrou na v2 de S5 */

const T4 = `territory:${uuid(304)}`;

let sequencia = 1000;
function siloDna(input: {
  siloId: string;
  name?: string;
  territoryRef?: string;
  pillar: string | null;
  supports: string[];
  order?: string[];
  versionNumber?: number;
}): VersionEnvelope<SiloDNA> {
  sequencia += 1;
  const membros = [input.pillar, ...input.supports].filter((id): id is string => Boolean(id));
  const versionNumber = input.versionNumber ?? 1;
  return VersionedSiloDNASchema.parse({
    versionId: uuid(sequencia), entityId: input.siloId, versionNumber, previousVersionId: null,
    contentHash: hash(sequencia), origin: "human" as const, changeReason: "bancada",
    createdAt: `2026-09-${String(10 + versionNumber).padStart(2, "0")}T10:00:00.000Z`, createdBy: uuid(999),
    payload: {
      schemaVersion: 1,
      formationStatus: "formed",
      siloId: input.siloId,
      brandId: MARCA,
      ...(input.name ? { name: input.name } : {}),
      ...(input.territoryRef ? { territoryRef: input.territoryRef } : {}),
      centralEntity: "pele oleosa",
      objective: "Construir autoridade em cuidados com pele oleosa.",
      audience: "Pessoas com pele oleosa que querem uma rotina simples.",
      macroProblem: "Brilho excessivo sem saber por onde começar.",
      dominantIntent: "informacional",
      pillarArticleId: input.pillar,
      supportArticleIds: input.supports,
      articleReferences: membros.map((articleId, indice) => ({
        articleId, articleDnaVersionId: uuid(600 + indice), articleDnaContentHash: hash(600 + indice),
        role: articleId === input.pillar ? "Pilar" as const : "Suporte" as const,
      })),
      articleRoles: membros.map(articleId => ({ articleId, role: articleId === input.pillar ? "Pilar" : "Suporte", reason: "bancada" })),
      narrativeOrder: input.order ?? membros,
      linkMap: [],
      boundary: "Pele oleosa no rosto; acne clínica fica fora.",
      includedTopics: ["limpeza"], excludedTopics: [],
      nearbySiloIds: [], possibleConflicts: [], gaps: [], nextContents: [], confidence: 0.8, humanPendingDecisions: [],
    },
  }) as VersionEnvelope<SiloDNA>;
}

const registro = (...versoes: VersionEnvelope<SiloDNA>[]): Record<string, VersionEnvelope<SiloDNA>> =>
  Object.fromEntries(versoes.map(versao => [versao.versionId, versao]));

const crescimento = siloDna({ siloId: S1, name: "Crescimento", pillar: A1, supports: [A2, A3], order: [A1, A3, A2] });
const autoridade = siloDna({ siloId: S2, name: "Autoridade", pillar: B1, supports: [] });
const semNome = siloDna({ siloId: S3, pillar: C1, supports: [] });
const territorio = siloDna({ siloId: S4, name: "Território", territoryRef: T4, pillar: D1, supports: [] });

test("composição vence territoryRef: artigo listado no silo não muda de grupo pelo território", () => {
  const resultado = radarImportSiloGroups({
    /* A2 está na composição de Crescimento, mas declara o território de "Território". */
    rows: [
      { id: "linha-a2", articleId: A2, territoryRef: T4 },
      { id: "linha-e1", articleId: E1, territoryRef: T4 },
    ],
    siloVersions: registro(crescimento, territorio),
  });
  const porRotulo = new Map(resultado.groups.map(grupo => [grupo.label, grupo.rowIds]));
  assert.deepEqual(porRotulo.get("Crescimento"), ["linha-a2"]);
  assert.deepEqual(porRotulo.get("Território"), ["linha-e1"]);
});

test("mais de um SiloDNA do mesmo silo usa o mais recente — na composição e no rótulo", () => {
  const v1 = siloDna({ siloId: S5, name: "Velho", pillar: G1, supports: [H1], versionNumber: 1 });
  const v2 = siloDna({ siloId: S5, name: "Novo", pillar: H1, supports: [], versionNumber: 2 });
  const resultado = radarImportSiloGroups({
    rows: [
      { id: "linha-h1", articleId: H1 },
      { id: "linha-g1", articleId: G1 }, /* saiu da composição na v2: não herda o grupo da v1 */
    ],
    siloVersions: registro(v1, v2),
  });
  const rotulos = resultado.groups.map(grupo => grupo.label);
  assert.ok(rotulos.includes("Novo"), "o rótulo vem da versão mais recente");
  assert.ok(!rotulos.includes("Velho"), "a versão antiga não empresta rótulo nem composição");
  const novo = resultado.groups.find(grupo => grupo.label === "Novo")!;
  assert.deepEqual(novo.rowIds, ["linha-h1"]);
  const semSilo = resultado.groups.at(-1)!;
  assert.equal(semSilo.label, RADAR_IMPORT_NO_SILO_LABEL);
  assert.deepEqual(semSilo.rowIds, ["linha-g1"]);
});

test("grupos em ordem alfabética pt-BR e Sem silo sempre por último", () => {
  const resultado = radarImportSiloGroups({
    rows: [
      { id: "linha-f1", articleId: F1 }, /* chega primeiro e mesmo assim fica por último */
      { id: "linha-a1", articleId: A1 },
      { id: "linha-b1", articleId: B1 },
    ],
    siloVersions: registro(crescimento, autoridade),
  });
  assert.deepEqual(resultado.groups.map(grupo => grupo.label), ["Autoridade", "Crescimento", RADAR_IMPORT_NO_SILO_LABEL]);
  assert.deepEqual(resultado.orderedRowIds, ["linha-b1", "linha-a1", "linha-f1"]);
});

test("dentro do grupo: pilar primeiro, depois a ordem narrativa, depois o resto na ordem de chegada", () => {
  const resultado = radarImportSiloGroups({
    /* Chegam embaralhadas: suporte fora da ordem, pilar por último, e uma linha do território no fim. */
    rows: [
      { id: "linha-a2", articleId: A2 },
      { id: "linha-a3", articleId: A3 },
      { id: "linha-a1", articleId: A1 },
    ],
    siloVersions: registro(crescimento),
  });
  /* A composição de Crescimento é A1 (pilar) → A3 → A2 (narrativeOrder), como no export por silo. */
  assert.deepEqual(resultado.orderedRowIds, ["linha-a1", "linha-a3", "linha-a2"]);
});

test("linha do grupo que não está na composição fica depois, na ordem de chegada", () => {
  const extra1 = uuid(271), extra2 = uuid(272);
  const resultado = radarImportSiloGroups({
    rows: [
      { id: "linha-x2", articleId: extra2, territoryRef: T4 },
      { id: "linha-d1", articleId: D1 },
      { id: "linha-x1", articleId: extra1, territoryRef: T4 },
    ],
    siloVersions: registro(territorio),
  });
  /* D1 é o pilar do silo do território; as linhas que chegaram só pelo território preservam a chegada. */
  assert.deepEqual(resultado.orderedRowIds, ["linha-d1", "linha-x2", "linha-x1"]);
});

test("silo sem nome vira 'Silo sem nome N' e o rótulo nunca contém id cru", () => {
  const resultado = radarImportSiloGroups({
    rows: [{ id: "linha-c1", articleId: C1 }],
    siloVersions: registro(semNome),
  });
  assert.equal(resultado.groups.length, 1);
  assert.equal(resultado.groups[0].label, "Silo sem nome 1");
  for (const grupo of resultado.groups) {
    assert.ok(!grupo.label.includes(S3), "o rótulo não pode vazar o siloId");
    assert.ok(!grupo.label.includes(C1), "o rótulo não pode vazar o articleId");
  }
});

/*
 * 2026-10-07 · Passada dos revisores: o siloId DECLARADO no ArticleDNA é o
 * PRIMEIRO critério da resolução real (`resolveCanonicalSiloForArticle`,
 * lib/arquiteto/radar-handoff-context.ts) e é ele que vira `RadarItem.siloId`
 * — a chave do CSV por silo. Agrupar só pela composição mostrava o artigo num
 * grupo diferente do arquivo que o export entrega depois.
 */
test("siloId declarado no ArticleDNA vence composição e território — a precedência da importação real", () => {
  const S6 = uuid(106), S7 = uuid(107);
  const M1 = uuid(281), N1 = uuid(283);
  const alfa = siloDna({ siloId: S6, name: "Alfa", pillar: N1, supports: [], versionNumber: 1 });
  /* Beta é MAIS RECENTE e a composição dele contém M1: sem o declarado, a composição ganharia. */
  const beta = siloDna({ siloId: S7, name: "Beta", pillar: M1, supports: [], versionNumber: 3 });
  const resultado = radarImportSiloGroups({
    rows: [{ id: "linha-m1", articleId: M1, siloId: S6 }],
    siloVersions: registro(alfa, beta),
  });
  assert.deepEqual(resultado.groups.map(grupo => grupo.label), ["Alfa"], "o declarado é quem vira RadarItem.siloId na importação real");
  assert.deepEqual(resultado.groups[0].rowIds, ["linha-m1"]);
});

test("siloId declarado sem SiloDNA correspondente cai para a composição, como na resolução real", () => {
  const S7 = uuid(107);
  const M1 = uuid(281);
  const beta = siloDna({ siloId: S7, name: "Beta", pillar: M1, supports: [] });
  const resultado = radarImportSiloGroups({
    /* A declaração aponta para um silo que não está em siloVersions: não vira grupo fantasma. */
    rows: [{ id: "linha-m1", articleId: M1, siloId: uuid(900) }],
    siloVersions: registro(beta),
  });
  assert.deepEqual(resultado.groups.map(grupo => grupo.label), ["Beta"]);
});

/*
 * 2026-10-07 · Passada dos revisores: no export quem consome um N é todo silo
 * cujo nome LIMPA para vazio ("!!!", só emoji) — o rótulo continua sendo o
 * name que alguém deu, mas o contador anda (portable-silo-export.ts,
 * `numeroSemNome`). Sem a mesma régua aqui, o dono importava o grupo
 * "Silo sem nome 1" e o CSV entregava "Silo sem nome 2" para o MESMO silo.
 */
test("quem consome 'Silo sem nome N' é o mesmo silo do export: nome que limpa para vazio anda o contador", () => {
  const S8 = uuid(108), P1 = uuid(282);
  const ruido = siloDna({ siloId: S8, name: "!!!", pillar: P1, supports: [] });
  const resultado = radarImportSiloGroups({
    /* "!!!" chega primeiro, como chegaria no export: consome o N 1 sem trocar o rótulo. */
    rows: [
      { id: "linha-p1", articleId: P1 },
      { id: "linha-c1", articleId: C1 },
    ],
    siloVersions: registro(ruido, semNome),
  });
  const rotulos = resultado.groups.map(grupo => grupo.label);
  assert.ok(rotulos.includes("!!!"), "o rótulo continua sendo o name que alguém deu ao silo");
  assert.ok(rotulos.includes("Silo sem nome 2"), `o silo mudo recebe o MESMO N do arquivo exportado — rótulos: ${rotulos.join(" · ")}`);
  assert.ok(!rotulos.includes("Silo sem nome 1"), "o N 1 foi consumido pelo silo de nome só-pontuação, como no export");
});

test("toda linha aparece exatamente uma vez em orderedRowIds", () => {
  const resultado = radarImportSiloGroups({
    rows: [
      { id: "linha-a1", articleId: A1 },
      { id: "linha-b1", articleId: B1 },
      { id: "linha-f1", articleId: F1 },
      { id: "linha-e1", articleId: E1, territoryRef: T4 },
    ],
    siloVersions: registro(crescimento, autoridade, territorio),
  });
  assert.deepEqual([...resultado.orderedRowIds].sort(), ["linha-a1", "linha-b1", "linha-e1", "linha-f1"]);
  assert.equal(new Set(resultado.orderedRowIds).size, resultado.orderedRowIds.length);
});
