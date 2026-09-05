import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  articleRadarGateIssues,
  isSerpAssessmentComplete,
  normalizeArticleProvisionalGroup,
  normalizeArticleWorkingCopyKeyword,
  resolveArticlePhaseProcessStates,
} from "../lib/arquiteto/article-phase.ts";
import type { ProvisionalArticleGroup } from "../lib/arquiteto/contracts.ts";

const keyword = (id: string, published = false) => ({
  id,
  keyword: `keyword ${id}`,
  status: published ? "publicado" : "aprovado",
  isPublished: published,
  lista_id: "source-list-1",
  siloId: "silo-1",
  silo_id: "silo-1",
  siloName: "Silo legado",
  computedHierarquia: "Pilar",
  hierarquia: "Pilar",
});

test("a fronteira de Artigos neutraliza Silo novo e preserva vínculo de origem", () => {
  const source = keyword("new-keyword");
  const normalized = normalizeArticleWorkingCopyKeyword(source);

  assert.equal(normalized.siloId, null);
  assert.equal(normalized.silo_id, null);
  assert.equal(normalized.siloName, null);
  assert.equal(normalized.computedHierarquia, null);
  assert.equal(normalized.hierarquia, null);
  assert.equal(normalized.lista_id, "source-list-1");
});

test("publicado mantém a identidade do Silo enquanto Artigos protege o ativo", () => {
  const published = keyword("published-keyword", true);
  const normalized = normalizeArticleWorkingCopyKeyword(published);

  assert.equal(normalized.siloId, "silo-1");
  assert.equal(normalized.silo_id, "silo-1");
  assert.equal(normalized.siloName, "Silo legado");
});

test("publicado legado mantém a referência de lista usada como Silo existente", () => {
  const published = {
    ...keyword("published-legacy", true),
    siloId: null,
    silo_id: null,
  };
  const normalized = normalizeArticleProvisionalGroup({
    id: "group-legacy",
    keywordIds: ["published-legacy"],
    keywords: [published],
    publishedAnchorId: "published-legacy",
  } as unknown as ProvisionalArticleGroup);

  assert.equal(normalized.suggestedSiloId, "source-list-1");
});

test("grupo provisório não carrega Silo novo, mas preserva âncora publicada", () => {
  const group = {
    id: "group-1",
    keywordIds: ["new-keyword", "published-keyword"],
    keywords: [keyword("new-keyword"), keyword("published-keyword", true)],
    publishedAnchorId: "published-keyword",
    suggestedSiloId: "silo-old",
    suggestedSiloName: "Silo antigo",
  } as unknown as ProvisionalArticleGroup;

  const normalized = normalizeArticleProvisionalGroup(group);
  assert.equal(normalized.suggestedSiloId, "silo-1");
  assert.equal(normalized.suggestedSiloName, "Silo legado");
  assert.equal((normalized.keywords[0] as unknown as Record<string, unknown>)?.siloId, null);
});

test("SERP 3/3 com conflito é execução concluída; consulta ausente é parcial", () => {
  const complete = {
    queryCount: 3,
    queriedKeywordDnaIds: ["kw-1", "kw-2", "kw-3"],
    snapshotCount: 3,
    recommendationCount: 3,
    unassociatedRecommendationCount: 0,
  };
  assert.equal(isSerpAssessmentComplete(complete), true);
  assert.equal(isSerpAssessmentComplete({ ...complete, snapshotCount: 2 }), false);
});

test("IA concluída mantém revisão pendente até o ArticleDNA ser aprovado", () => {
  const states = resolveArticlePhaseProcessStates({
    hasArticleInput: true,
    logicProcessing: false,
    hasLogicalOutput: true,
    serpProcessing: false,
    hasSerpAssessments: true,
    serpHasIncompleteAssessment: false,
    serpHasError: false,
    aiProcessing: false,
    aiHasOutput: true,
    reviewProcessing: false,
    hasArticleDna: true,
    allArticleDnaApproved: false,
    pendingAiReview: true,
    unresolvedConflicts: 1,
  });

  assert.equal(states.logic, "completed");
  assert.equal(states.serp, "completed");
  assert.equal(states.ai, "completed");
  assert.equal(states.review, "pending");
});

test("gate do Radar exige ArticleDNA aprovado, revisão resolvida e SERP completa", () => {
  const blocked = articleRadarGateIssues({
    selectedArticleCount: 1,
    consolidatedArticleCount: 0,
    approvedArticleCount: 0,
    pendingAiReviewCount: 1,
    unresolvedConflictCount: 1,
    missingSerpAssessmentCount: 1,
    incompleteSerpAssessmentCount: 0,
  });
  assert.ok(blocked.some(issue => /ArticleDNA/.test(issue)));
  assert.ok(blocked.some(issue => /IA/.test(issue)));
  assert.ok(blocked.some(issue => /conflitos/.test(issue)));
  assert.ok(blocked.some(issue => /SERP/.test(issue)));

  assert.deepEqual(articleRadarGateIssues({
    selectedArticleCount: 1,
    consolidatedArticleCount: 1,
    approvedArticleCount: 1,
    pendingAiReviewCount: 0,
    unresolvedConflictCount: 0,
    missingSerpAssessmentCount: 0,
    incompleteSerpAssessmentCount: 0,
  }), []);
});

test("workspace mantém uma planilha, separa o modo Artigos e restringe criação de Silo", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  // Ancorado no marcador da planilha, não em classe de layout: a largura das
  // colunas passou a ser responsiva/redimensionável e não pode travar o teste.
  assert.equal((workspace.match(/data-architect-table="articles"/g) || []).length, 1);
  // §8 — a banda nomeia a SiloPage. "Artigos em formação" era rótulo genérico:
  // o cenário é candidato; ArticleDNA materializado é Article.
  assert.doesNotMatch(workspace, /"Artigos em formação"/);
  // O cabeçalho mostra o nome que o agrupamento resolveu; ele não redecide se
  // o artigo tem Silo — pertencer vem da confirmação, não da consolidação.
  assert.match(workspace, /<span className=\{`text-sm font-semibold \$\{siloColor\.headerText\}`\}>\s*\{group\.siloName\}/);
  assert.match(workspace, /const hasCanonicalSilo = !articleMode && Boolean\(group\.siloId\)/);
  assert.match(workspace, /workspaceMode === "silos" && <button/);
  assert.match(workspace, /expandedProcessTabs\[art\.id\] \|\| "logic"/);
  assert.match(workspace, /Pendente para Silos/);

  const articleProjectionStart = workspace.indexOf('if (workspaceMode === "articles")');
  const articleProjectionEnd = workspace.indexOf("const groups = new Map", articleProjectionStart);
  const articleProjection = workspace.slice(articleProjectionStart, articleProjectionEnd);
  // A aba Artigos passou a agrupar pela SiloPage a que cada Article pertence.
  // O grupo de fallback existe para que um Article sem Silo resolvido continue
  // visível na mesa em vez de sumir entre os agrupamentos.
  assert.match(articleProjection, /articleSiloViews\.map\(view => \[view\.siloRef, view\]\)/);
  assert.match(articleProjection, /ARTIGOS SEM SILO/);
  assert.doesNotMatch(articleProjection, /Silo sem nome/);

  const logicHandler = workspace.slice(
    workspace.indexOf("const processDeterministicStructure"),
    workspace.indexOf("const formSilosWorkingCopy"),
  );
  assert.doesNotMatch(logicHandler, /createCanonicalManualSilo|SiloPage|SiloDNA/);
  assert.match(logicHandler, /if \(workspaceMode !== "articles"\)/);
  assert.doesNotMatch(logicHandler, /computedHierarquia:\s*["'](?:Pilar|Suporte)/);
  assert.match(logicHandler, /computedHierarquia: keyword\.isPublished \?.*?: null/);
});

test("planilha principal de Artigos mantém colunas canônicas e expansão independente", () => {
  const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
  const headerStart = workspace.indexOf('<thead className="sticky top-0');
  const headerEnd = workspace.indexOf("</thead>", headerStart);
  const header = workspace.slice(headerStart, headerEnd);
  const expectedColumns = [
    "Artigo",
    "Keyword principal",
    "Quantidade de keywords",
    "Revisão IA",
    "Definição do artigo",
    "Silo",
    "Ações",
    "Aprovação",
    "Status",
  ];
  // `>Coluna<` e não `>Coluna</th>`: cada cabeçalho agora carrega o handle de
  // redimensionamento depois do rótulo. A ordem canônica continua sendo o alvo.
  const positions = expectedColumns.map(column => header.indexOf(`>${column}<`));

  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual([...positions].sort((left, right) => left - right), positions);
  assert.ok(header.indexOf('>#</th>') < header.indexOf('type="checkbox"') && header.indexOf('type="checkbox"') < header.indexOf('{/* chevron */}'));
  assert.match(workspace, /data-article-expanded=\{isExpanded \? "true" : "false"\}/);
  assert.match(workspace, /isExpanded \? "border-l-2 border-l-module-accent bg-surface-elevated/);
  assert.match(workspace, /selectedArticleIds\.has\(art\.id\) \? "bg-selected/);
  assert.ok(workspace.indexOf('{!articleMode && <>') < workspace.indexOf('Cabeçalho do Silo'));
  assert.match(workspace, /Pronto para Silos/);
});
