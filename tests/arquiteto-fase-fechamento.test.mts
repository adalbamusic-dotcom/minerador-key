import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hashInternalLinkGraphBasis } from "../lib/arquiteto/internal-link-graph.ts";
import {
  readArticleSiloContract,
  resolveCanonicalSiloIdForTerritory,
} from "../lib/arquiteto/article-silo-materialization.ts";

/**
 * FECHAMENTO REAL DA PRIMEIRA PASSADA.
 *
 * Cada fase encerra o que é dela. A fase seguinte NUNCA completa o que a
 * anterior deixou pela metade — foi assim que oito ArticleDNA sem `siloId`
 * chegaram ao Radar com o pai resolvido só na memória de quem clicou.
 */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const workbench = readFileSync("modules/arquiteto/arquiteto-workbench.tsx", "utf8");

const siloDna = (overrides: Record<string, unknown> = {}) => ({
  versionId: "silo-v1",
  contentHash: "sha256:silo",
  versionNumber: 1,
  payload: { siloId: "silo:1", name: "Retinol", territoryRef: "territorio:retinol", ...overrides },
} as never);

/* ------------------------ §3 — a correspondência 1:1 --------------------- */

test("territoryRef → siloId é 1:1: zero não escolhe", () => {
  const semSilo = resolveCanonicalSiloIdForTerritory({
    territoryRef: "territorio:retinol",
    siloVersions: [],
  });
  assert.equal(semSilo.state, "NO_SILO");
  assert.match(semSilo.reason, /consolidar o Silo/);
});

test("territoryRef → siloId é 1:1: dois não desempatam", () => {
  const ambiguo = resolveCanonicalSiloIdForTerritory({
    territoryRef: "territorio:retinol",
    siloVersions: [siloDna(), siloDna({ siloId: "silo:9" })],
  });
  assert.equal(ambiguo.state, "AMBIGUOUS");
  if (ambiguo.state !== "AMBIGUOUS") return;
  // O nome dos dois é dito: escolher um em silêncio trocaria o pai do artigo.
  assert.deepEqual(ambiguo.siloIds, ["silo:1", "silo:9"]);
});

test("sem território não há de onde partir, e isso não é 'Silo ausente'", () => {
  const semTerritorio = resolveCanonicalSiloIdForTerritory({ territoryRef: null, siloVersions: [siloDna()] });
  assert.equal(semTerritorio.state, "NO_TERRITORY");
});

/* ------------- §6 — CURRENT e LEGACY são leituras diferentes ------------- */

test("LEGACY_UNRESOLVED não é confundido com LEGACY_HYDRATABLE", () => {
  const semNada = readArticleSiloContract({ articleId: "a1", siloId: null } as never);
  assert.equal(semNada.state, "LEGACY_UNRESOLVED");
  assert.equal(semNada.compliant, false);

  const semTerritorio = readArticleSiloContract({ articleId: "a1", siloId: "silo:1" } as never);
  assert.equal(semTerritorio.state, "LEGACY_UNRESOLVED");
  assert.match(semTerritorio.reason, /sem declarar o território/);
});

/* --------- §9 — o grafo se prende à VERSÃO do artigo, não ao id ---------- */

test("a base do grafo inclui versionId e contentHash do ArticleDNA", async () => {
  const base = {
    brandId: "brand:1",
    siloId: "silo:1",
    baseSiloDnaVersionRef: { entityId: "silo:1", versionId: "silo-v1", contentHash: "sha256:silo" },
    baseSiloPageVersionRef: { entityId: "silo-page:silo:1", versionId: "page-v1", contentHash: "sha256:page" },
    participatingArticleDnaVersionRefs: [
      { entityId: "article:1", versionId: "art-v5", contentHash: "sha256:antes" },
    ],
  };
  const original = await hashInternalLinkGraphBasis(base);

  // Mesma identidade lógica do artigo, versão nova: a base MUDA.
  const comSucessora = await hashInternalLinkGraphBasis({
    ...base,
    participatingArticleDnaVersionRefs: [
      { entityId: "article:1", versionId: "art-v6", contentHash: "sha256:depois" },
    ],
  });
  assert.notEqual(original, comSucessora,
    "criar sucessora do ArticleDNA invalida a base do grafo aprovado; isso é dado do plano, não surpresa");

  // E a mesma base repetida continua igual: a diferença acima é da versão,
  // não de instabilidade do hash.
  assert.equal(original, await hashInternalLinkGraphBasis({ ...base }));
});

/* ------------------ §2 — confirmar encerra as duas coisas ---------------- */

test("confirmar a arquitetura aprova SiloDNA e SiloPage", () => {
  assert.match(workspace, /statuses: \{ siloDna: "approved", siloPage: "approved" \}/);
  // A decisão é DA PÁGINA: versão e hash dela, e o SiloDNA pareado.
  assert.match(workspace, /scope: "silo_page_approval"/);
  assert.match(workspace, /siloPageVersionId: prepared\.siloPage\.versionId/);
  assert.match(workspace, /siloPageContentHash: prepared\.siloPage\.contentHash/);
  assert.match(workspace, /siloDnaVersionId: prepared\.siloDna\.versionId/);
  // O `null` fixo era o motivo de as três SiloPages ficarem em `proposed`.
  assert.doesNotMatch(workspace, /siloPageApproval: null/);
  assert.doesNotMatch(workspace, /createStatusEvent\(canonicalPage\.versionId, "proposed"/);
});

/* ---------------- §4 — sucessora, nunca overwrite, nunca reedição -------- */

test("o backfill cria sucessora preservando a versão anterior", () => {
  assert.match(workspace, /const materializeLegacyArticleSiloIds = useCallback/);
  assert.match(workspace, /versionNumber: vigente\.versionNumber \+ 1/);
  assert.match(workspace, /previousVersionId: vigente\.versionId/);
  // Fechar a fase alcança o que ficou aberto atrás: o CONFIRMAR chama.
  assert.match(workspace, /const legado = await materializeLegacyArticleSiloIds\(\);/);
});

/* ------------------- §10 — duas ações nomeadas em Links ------------------ */

test("a fase Links opera por ato, não por motor", () => {
  assert.match(workbench, /\{mode === "links" && links\?\.panel\}/);
  assert.match(workspace, /Processar links/);
  assert.match(workspace, /Confirmar links internos/);
  // Uma leitura para os dois botões.
  assert.match(workspace, /const linksPhaseReading = useMemo/);
  assert.match(workspace, /canProcess: !processBlocker/);
  assert.match(workspace, /canConfirm: !confirmBlocker/);
  // Encadear lendo o estado pegaria a cópia anterior ao `set` da etapa antes.
  assert.match(workspace, /const comEstrutura = await generateStructuralLinks\(aberta\);/);
  assert.match(workspace, /await generateLinkAnchors\(comEstrutura\);/);
});

/* --------------- §5 — a formação não emite artefato incompleto ----------- */

test("concluir formação exige Silo consolidado", () => {
  assert.match(workspace, /const materializado = materializeArticleSiloId\(\{/);
  assert.match(workspace, /Um artigo não pôde ser concluído/);
  // Recusa nomeada: o artigo não passa adiante sem pai, e o motivo é dito.
  assert.match(workspace, /siloVersions: Object\.values\(acceptedSiloDnas\)/);
});
