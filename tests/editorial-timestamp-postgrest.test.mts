import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PersistedDocumentSchema, PersistedEditorialWorkspaceSchema } from "../lib/editorial/persistence-contracts.ts";
import { OperationalPublicationSchema } from "../lib/editorial/operational-flow.ts";
import { SavedGridViewSchema } from "../lib/editorial/data-grid.ts";

/**
 * O DOCUMENTO EXISTIA NO BANCO E A TELA DIZIA QUE NÃO HAVIA NADA.
 *
 * O Radar enviou, o serviço gravou, o readback passou e `content_documents`
 * guardou um v2 íntegro. Mesmo assim o Redator abria vazio.
 *
 * A causa não estava no documento: estava no FORMATO DA DATA. O PostgREST
 * devolve `timestamptz` com deslocamento — `2026-09-18T03:51:49.236599+00:00`
 * — e `z.string().datetime()` só aceita `Z`. Enquanto a tabela esteve vazia o
 * defeito não aparecia, porque `documents: []` passa em qualquer schema. O
 * PRIMEIRO documento real derrubou a validação da mesa inteira.
 *
 * O repositório já tinha a resposta: `isoDate()` normaliza, e o
 * `WorkflowRepository` a usa desde sempre — é por isso que o Radar continuava
 * carregando enquanto o Redator não. O que faltava era aplicá-la aos campos de
 * COLUNA dos outros leitores.
 *
 * Um fixture escrito com "Z" na mão esconde exatamente este defeito, então
 * aqui o valor é o que o PostgREST devolve de verdade.
 */

/** O formato observado na resposta real do PostgREST deste projeto. */
const POSTGREST = "2026-09-18T03:51:49.236599+00:00";
/** O mesmo instante como a aplicação o escreve. Precisa continuar valendo. */
const APLICACAO = "2026-09-18T03:51:49.236Z";

const read = (relative: string) => readFileSync(new URL("../" + relative, import.meta.url), "utf8");
const REPOS = "lib/server/editorial-repositories.ts";

const executable = (source: string) =>
  source.split("\n").filter(line => {
    const trimmed = line.trim();
    return !trimmed.startsWith("*") && !trimmed.startsWith("/*") && !trimmed.startsWith("//");
  }).join("\n");

const documentoV1 = {
  schemaVersion: 1 as const,
  id: "doc-1", title: "Documento", status: "planejado" as const,
  contentPlanRef: { entityId: "plan", versionId: "plan-v1", contentHash: `sha256:${"a".repeat(64)}` },
  brandDnaRef: { entityId: "brand", versionId: "brand-v1", contentHash: `sha256:${"a".repeat(64)}` },
  keywordDnaRefs: [{ entityId: "kw", versionId: "kw-v1", contentHash: `sha256:${"a".repeat(64)}` }],
  siloDnaRef: { entityId: "silo", versionId: "silo-v1", contentHash: `sha256:${"a".repeat(64)}` },
  articleDnaRef: { entityId: "art", versionId: "art-v1", contentHash: `sha256:${"a".repeat(64)}` },
  serpSnapshotRefs: [], evidenceRefs: [], sourceIds: [], linkMap: [], instructions: [], blocks: [],
  editorContent: null,
  metadata: {
    slug: "documento", principalKeyword: "k", metaTitle: "", metaDescription: "",
    socialTitle: "", socialDescription: "", canonical: null,
    indexationStatus: "noindex" as const, plannedImages: [],
  },
};

/* ---- 1 · o contrato precisa aceitar o que o banco devolve -------------- */

test("01 · o documento persistido aceita o timestamp COM deslocamento", () => {
  const registro = {
    document: documentoV1, lockVersion: 1, contentHash: "sha256:x",
    updatedAt: POSTGREST, userState: null,
  };
  assert.equal(PersistedDocumentSchema.safeParse(registro).success, true,
    "o formato do PostgREST não pode ser recusado: é o único que o banco produz");
});

test("02 · o formato da própria aplicação continua valendo", () => {
  const registro = {
    document: documentoV1, lockVersion: 1, contentHash: "sha256:x",
    updatedAt: APLICACAO, userState: null,
  };
  assert.equal(PersistedDocumentSchema.safeParse(registro).success, true,
    "aceitar o deslocamento não pode custar o formato que a aplicação escreve");
});

test("03 · o estado de leitura do usuário tem o mesmo problema e a mesma cura", () => {
  const registro = {
    document: documentoV1, lockVersion: 1, contentHash: "sha256:x", updatedAt: POSTGREST,
    userState: {
      cursorPosition: 0, scrollTop: 0, leftPanelOpen: true, rightPanelOpen: true,
      lastOpenedAt: POSTGREST,
    },
  };
  assert.equal(PersistedDocumentSchema.safeParse(registro).success, true);
});

test("04 · publicação e view salva vêm das mesmas colunas", () => {
  const publicacao = {
    id: "pub-1", brandId: "brand-1", articleId: "art-1", documentId: "doc-1",
    plannerItemId: null, contentPlanVersionId: null,
    radarOrigin: { analysisVersionId: "an-1", evidenceBundleHash: "hash-1" },
    slug: "documento", title: "Documento", siloId: "silo-1", hierarchy: "pilar",
    state: "draft" as const,
    responsible: null, destination: null,
    createdAt: POSTGREST, updatedAt: POSTGREST, origin: "real" as const,
  };
  assert.equal(OperationalPublicationSchema.safeParse(publicacao).success, true);

  const view = {
    id: "view-1", name: "Minha view", userId: "user-1", brandId: "brand-1", module: "radar",
    search: "", filters: {}, sort: null, visibleColumns: [], columnWidths: {},
    pageSize: 25, grouping: null, orderMode: "manual" as const, manualOrder: [],
    isDefault: false, updatedAt: POSTGREST,
  };
  assert.equal(SavedGridViewSchema.safeParse(view).success, true);
});

/* ---- 2 · a mesa inteira não pode cair por causa da data ---------------- */

test("05 · a mesa com UM documento real continua válida", () => {
  /*
   * Este é o caso que quebrou de verdade: enquanto `documents` estava vazio,
   * qualquer schema passava. O primeiro documento derrubou a mesa inteira e o
   * Radar — que estava íntegro — sumiu junto.
   */
  const mesa = {
    mode: "server" as const,
    radarItems: [], plannerItems: [], articleVersions: [], siloVersions: [],
    versionEvents: [], contentPlans: [],
    documents: [{
      document: documentoV1, lockVersion: 1, contentHash: "sha256:x",
      updatedAt: POSTGREST, userState: null,
    }],
    publications: [], invitations: [], views: [],
    loadedAt: APLICACAO,
  };
  const resultado = PersistedEditorialWorkspaceSchema.safeParse(mesa);
  assert.equal(resultado.success, true,
    resultado.success ? "" : `a mesa foi recusada: ${JSON.stringify(resultado.error.issues.slice(0, 3))}`);
});

/* ---- 3 · a normalização mora no leitor, não em cada chamador ----------- */

test("06 · todo campo de data vindo de COLUNA passa por isoDate", () => {
  /*
   * `isoDate` já existia e o `WorkflowRepository` sempre a usou — é por isso
   * que o Radar carregava enquanto o Redator não. A regra vale para todos os
   * leitores, senão o próximo a ganhar primeira linha repete o incidente.
   */
  const fonte = executable(read(REPOS));

  const cruas = fonte
    .split("\n")
    .filter(linha => /(updatedAt|createdAt|importedAt|lastOpenedAt|expiresAt|occurredAt):\s*(row|state|data|current)\./.test(linha));

  assert.deepEqual(cruas, [],
    `campo de data lido direto da coluna, sem isoDate:\n${cruas.join("\n")}`);
});

test("07 · isoDate preserva o instante e devolve o formato da aplicação", () => {
  // A correção não pode mudar o horário — só a grafia dele.
  const normalizado = new Date(POSTGREST).toISOString();
  assert.equal(normalizado, "2026-09-18T03:51:49.236Z");
  assert.equal(new Date(normalizado).getTime(), new Date(POSTGREST).getTime(),
    "o instante precisa sobreviver à normalização");
});
