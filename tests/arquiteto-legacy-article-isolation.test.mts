import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LEGACY_REASON_LABELS,
  partitionMaterializedArticles,
  summarizeLegacyArticles,
} from "../lib/arquiteto/formation-materialization.ts";

const SILO_A = "territory:aaaaaaaa-1111-4111-8111-111111111111";
const SILO_B = "territory:bbbbbbbb-2222-4222-8222-222222222222";

const candidato = (ref: string, siloRef: string, principal: string, keywordIds: string[]) =>
  ({ candidateRef: ref, siloRef, principalKeywordId: principal, keywordIds });

/* -------------- §1 dois universos não dividem a mesma mesa --------------- */

test("ArticleDNA que descreve o cenário corrente conta como formado", () => {
  const partition = partitionMaterializedArticles({
    accepted: [{ articleId: "article-candidate:a", territoryRef: SILO_A, principalKeywordId: "k1", keywordIds: ["k1", "k2"] }],
    candidates: [candidato("article-candidate:a", SILO_A, "k1", ["k1", "k2"])],
  });
  assert.deepEqual([...partition.current], ["article-candidate:a"]);
  assert.deepEqual(partition.legacy, []);
});

test("colidir no identificador não basta: a composição precisa bater", () => {
  // O caso real da homologação: `article-candidate:<silo>:<principal>` se
  // repete quando a Principal é a mesma, mas o grupo foi refeito.
  const partition = partitionMaterializedArticles({
    accepted: [{ articleId: "article-candidate:a", territoryRef: SILO_A, principalKeywordId: "k1", keywordIds: ["k1", "k9"] }],
    candidates: [candidato("article-candidate:a", SILO_A, "k1", ["k1", "k2"])],
  });
  assert.deepEqual([...partition.current], []);
  assert.deepEqual(partition.legacy, [{ articleId: "article-candidate:a", reason: "DIFFERENT_COMPOSITION" }]);
});

test("artefato de outro Silo não entra no cenário deste", () => {
  const partition = partitionMaterializedArticles({
    accepted: [{ articleId: "legado", territoryRef: SILO_B, principalKeywordId: "k1", keywordIds: ["k1"] }],
    candidates: [candidato("article-candidate:a", SILO_A, "k1", ["k1"])],
  });
  assert.equal(partition.current.size, 0);
  assert.equal(partition.legacy[0].reason, "DIFFERENT_PARENT");
});

test("artefato sem correspondência nenhuma é acervo declarado", () => {
  const partition = partitionMaterializedArticles({
    accepted: [
      { articleId: "group-welf17", territoryRef: null, principalKeywordId: "antigo", keywordIds: ["antigo"] },
      { articleId: "article-candidate:a", territoryRef: null, principalKeywordId: "k1", keywordIds: ["k1"] },
    ],
    candidates: [candidato("article-candidate:a", SILO_A, "k1", ["k1"])],
  });
  assert.equal(partition.current.size, 1);
  assert.equal(partition.legacy.length, 1);
  assert.equal(partition.legacy[0].articleId, "group-welf17");
  assert.equal(partition.legacy[0].reason, "NO_MATCHING_CANDIDATE");
});

test("payload sem pai declarado ainda reconcilia pela composição", () => {
  // Legado anterior ao vínculo explícito: sem `territoryRef` o artefato não é
  // descartado por isso — ele é comparado pelo que descreve.
  const partition = partitionMaterializedArticles({
    accepted: [{ articleId: "article-candidate:a", territoryRef: null, principalKeywordId: "k1", keywordIds: ["k2", "k1"] }],
    candidates: [candidato("article-candidate:a", SILO_A, "k1", ["k1", "k2"])],
  });
  assert.deepEqual([...partition.current], ["article-candidate:a"]);
});

test("o acervo é contado e explicado, nunca apagado", () => {
  const partition = partitionMaterializedArticles({
    accepted: [
      { articleId: "v1", territoryRef: SILO_B, principalKeywordId: "k1", keywordIds: ["k1"] },
      { articleId: "v2", territoryRef: SILO_A, principalKeywordId: "k1", keywordIds: ["k1", "k7"] },
      { articleId: "v3", territoryRef: null, principalKeywordId: "sumiu", keywordIds: ["sumiu"] },
    ],
    candidates: [candidato("article-candidate:a", SILO_A, "k1", ["k1"])],
  });
  const resumo = summarizeLegacyArticles(partition);
  assert.equal(resumo.current, 0);
  assert.equal(resumo.legacy, 3);
  for (const item of resumo.reasons) {
    assert.equal(item.label, LEGACY_REASON_LABELS[item.reason]);
    assert.ok(item.label.trim().length > 0, "todo motivo precisa ser legível");
  }
  // Nenhuma escrita: o módulo é uma leitura.
  const source = readFileSync("lib/arquiteto/formation-materialization.ts", "utf8");
  assert.doesNotMatch(source, /fetch\(|delete |supabase|persistArquitetoArtifact/);
});

/* --------------------- §1 o fluxo novo não vê o legado ------------------- */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

test("a mesa resolve ArticleDNA pela partição, não pelo dicionário cru", () => {
  assert.match(workspace, /const materializationPartition = useMemo\(\(\) => partitionMaterializedArticles\(/);
  assert.match(workspace, /const materializedArticleIds = materializationPartition\.current;/);
  // Cabeçalho, linha e mapa respondem ARTICLE ou CANDIDATO pela MESMA chave: a
  // reconciliação por composição. Duas chaves era o defeito.
  assert.match(workspace, /articleDnaForGrid\(articleEntityId, art(?:icle)?\.candidateRef\)/);
  assert.match(workspace, /materializationPartition\.matched\.get\(input\.candidateRef\)/);
  assert.doesNotMatch(workspace, /const articleDnaVersion = articleEntityId \? acceptedArticleDnas\[articleEntityId\]/);
});

test("fechamento, prontidão e consolidação leem o ArticleDNA pelo mesmo resolvedor", () => {
  // A grade lia pela composição e o fechamento pelo agrupamento provisório: a
  // linha mostrava "v3" enquanto o painel dizia "Em formação", sem artigo
  // nenhum — e nada podia ser aprovado.
  assert.match(workspace, /const articleDnaEntryFor = useCallback/);
  assert.doesNotMatch(workspace, /const version = articleId \? acceptedArticleDnas\[articleId\] : undefined;/);
  assert.doesNotMatch(workspace, /const current = articleId \? acceptedArticleDnas\[articleId\] : undefined;/);
});

test("a fase Artigos tem caminho para registrar tipo de unidade e aprovar", () => {
  // As duas ações viviam na aba `Revisão` do seletor de processos; trocar as
  // quatro abas pelo painel de revisão levou o único caminho de aprovação
  // junto, e sem ArticleDNA aprovado a etapa Silos não forma cópia de trabalho.
  const painel = readFileSync("modules/arquiteto/article-formation-review.tsx", "utf8");
  assert.match(painel, /data-testid="architect-approve-article"/);
  assert.match(painel, /data-testid="architect-review-unit-type-confirm"/);
  assert.match(workspace, /onApproveArticle=\{/);
  assert.match(workspace, /unitTypeControl=\{/);
});

test("a fase Silos tem caminho para formar cópia de trabalho e consolidar", () => {
  // Mesma classe de perda: os quatro motores da aba Silos deram lugar ao
  // painel da fase, e `formSilosWorkingCopy`/`consolidateSilos` ficaram sem
  // botão — nenhum SiloDNA ou SiloPage podia nascer.
  const painel = readFileSync("modules/arquiteto/architecture-panel.tsx", "utf8");
  assert.match(painel, /data-testid="architect-form-silo-working-copy"/);
  assert.match(painel, /data-testid="architect-consolidate-silos"/);
  assert.match(workspace, /onForm: \(\) => \{ void formSilosWorkingCopy\(\); \}/);
  assert.match(workspace, /onConsolidate: \(\) => \{ void consolidateSilos\(\); \}/);
});

test("o mapa e a seleção herdam a mesma partição", () => {
  // React Flow recebe o conjunto já filtrado.
  assert.match(workspace, /buildArticleFlowProjection\(\{ views: visibleArticleSiloViews, materializedArticleIds \}\)/);
  // Seleção só existe para candidato do cenário corrente.
  assert.match(workspace, /articleSelectionIdForCandidate\(c\.candidateRef\)/);
});

test("o painel declara o acervo em vez de escondê-lo", () => {
  const panel = readFileSync("modules/arquiteto/article-formation-panel.tsx", "utf8");
  assert.match(panel, /data-testid="architect-legacy-articles"/);
  assert.match(panel, /continuam no acervo e ficam fora deste cenário/);
  assert.match(workspace, /legacy=\{legacyArticleSummary\}/);
});

test("a partição diz qual artefato descreve cada artigo do cenário", () => {
  const partition = partitionMaterializedArticles({
    accepted: [
      { articleId: "atual", territoryRef: SILO_A, principalKeywordId: "k1", keywordIds: ["k1", "k2"] },
      { articleId: "antigo", territoryRef: SILO_A, principalKeywordId: "k1", keywordIds: ["k1"] },
    ],
    candidates: [candidato("article-candidate:a", SILO_A, "k1", ["k1", "k2"])],
  });
  // Uma chave só para a mesa inteira: a linha lê o mesmo que o cabeçalho conta.
  assert.equal(partition.matched.get("article-candidate:a"), "atual");
  assert.deepEqual([...partition.current], [...partition.matched.keys()]);
  assert.equal(partition.legacy[0].articleId, "antigo");
});

test("o vínculo com o Silo só descreve os artigos do cenário", () => {
  const trecho = workspace.slice(workspace.indexOf("const articleParentBindings"));
  const corpo = trecho.slice(0, trecho.indexOf("\n  }, ["));
  // Somar o acervo aqui faria "12 inferidos" parecer defeito do lote de hoje.
  assert.match(corpo, /legacyArticleDnaIds\.has\(String\(version\.payload\.articleId\)\)/);
});
