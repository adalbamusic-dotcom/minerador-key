import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { projectKeywordDnaForArchitect } from "../lib/arquiteto/keyword-dna-projection.ts";
import { readArticleKgrDecision } from "../lib/arquiteto/article-kgr-decision.ts";
import type { KeywordContextualPresentation } from "../lib/minerador/keyword-contextual-presentation.ts";

const presentationText = "A Care Glow deve apresentar o cleansing oil da Hada Labo como um tema de cuidado com a pele que merece contexto antes de qualquer indicação.";

const presentation = {
  schemaVersion: "v1",
  id: "kcp-1",
  brandId: "brand-1",
  keywordId: "kw-main",
  input: {
    keyword: "cleansing oil hada labo",
    inputKeywordDnaRef: null,
    brandDnaVersionRef: null,
    appliedSkillRefs: [{ definitionKey: "voz-da-marca", versionId: "skill-1", versionNumber: 3, contentHash: "skill-hash", lifecycleStatus: "approved" }],
  },
  output: { text: presentationText },
  provenance: {
    provider: "deepseek",
    model: "deepseek-chat",
    operationRequestId: "op-1",
    executionRequestId: null,
    generatedAt: "2026-08-28T22:59:00.000Z",
    actorUserId: "user-1",
  },
  lifecycle: { version: 2, contentHash: "presentation-hash-0001", createdAt: "2026-08-28T22:59:00.000Z", createdBy: "user-1", supersedesVersionId: null },
} as KeywordContextualPresentation;

const readyKeyword = {
  id: "kw-main",
  keyword: "cleansing oil hada labo",
  brand_id: "brand-1",
  status: "aprovado",
  volume_search: 18100,
  results_allintitle: 402,
  kgr_score: 0.0222,
  keywordDnaRef: { entityId: "kw-main", versionId: "kdna-v1", contentHash: "kdna-hash" },
  analise_semantica: {
    kgr_aplicabilidade: "applicable",
    kgr_decisao: "SIM",
    kgr_decisao_origem: "human",
    entidade_central: "cleansing oil hada labo",
    modificadores: "nenhum modificador explícito",
    publico: "pessoas montando rotina de limpeza",
    problema_percebido: "não sabe se o cleansing oil serve para a própria pele",
    resultado_desejado: "escolher com critério",
    confianca: 0.34,
    ambiguidade: "sim",
    campo_legado_sem_secao: "valor preservado",
  },
  canonicalWorkflow: {
    state: "received",
    payload: {
      semanticQualification: { versionId: "ksq-1", contentHash: "hash-1", intent: "transacional", funnel: null, semanticState: "non_conclusive", collectedAt: "2026-08-29T00:00:00.000Z" },
      contextualPresentation: { versionId: "kcp-1", versionNumber: 2, contentHash: "presentation-hash-0001", keywordId: "kw-main", brandId: "brand-1", generatedAt: "2026-08-28T22:59:00.000Z" },
    },
  },
};

const legacyIncompleteKeyword = {
  id: "kw-legacy",
  keyword: "keyword legada",
  brand_id: "brand-1",
  status: "aprovado",
  volume_search: 320,
  results_allintitle: null,
  kgr_score: null,
  analise_semantica: { entidade_central: "keyword legada" },
  canonicalWorkflow: { payload: { semanticQualification: null, contextualPresentation: null } },
};

const readonlyPanel = readFileSync("components/editorial/keyword-dna-readonly-panel.tsx", "utf8");
const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");
const sectionIds = (keyword: typeof readyKeyword) => new Set(projectKeywordDnaForArchitect(keyword).sections.map(item => item.id));

test("o resumo horizontal mostra volume, resultados, intenção, funil, KGR e aplicabilidade", () => {
  const projection = projectKeywordDnaForArchitect(readyKeyword, presentation);
  const primary = projection.summaryPrimary.map(item => item.label);
  const byLabel = new Map(projection.summaryPrimary.map(item => [item.label, item.value]));

  assert.deepEqual(primary, ["Volume", "Resultados", "Intenção", "Funil", "KGR", "Aplicabilidade"]);
  assert.equal(byLabel.get("Volume"), "18.100");
  assert.equal(byLabel.get("Resultados"), "402");
  assert.equal(byLabel.get("KGR"), "0,022");
  assert.equal(byLabel.get("Aplicabilidade"), "Aplicável");
});

test("a segunda linha traz CPC, KD, tendência, entidade, confiança e revisão quando existem", () => {
  const projection = projectKeywordDnaForArchitect(readyKeyword, presentation);
  const labels = projection.summarySecondary.map(item => item.label);

  assert.ok(labels.includes("Entidade"));
  assert.ok(labels.includes("Confiança"));
  assert.equal(projection.summarySecondary.find(item => item.label === "Confiança")?.value, "34%");
});

test("o perfil completo mantém todas as seções do KeywordDNA recebido", () => {
  const ids = sectionIds(readyKeyword);

  for (const id of ["identidade", "leitura-logica", "google-ads", "dataforseo", "qualificacao-semantica", "kgr-keyword", "revisao-upstream", "publicacao"]) {
    assert.ok(ids.has(id), `seção ausente: ${id}`);
  }
});

test("leitura lógica, KGR e revisão do Minerador chegam com os valores recebidos", () => {
  const projection = projectKeywordDnaForArchitect(readyKeyword, presentation);
  const logic = new Map((projection.sections.find(item => item.id === "leitura-logica")?.fields || []).map(item => [item.label, item.value]));
  const kgr = new Map((projection.sections.find(item => item.id === "kgr-keyword")?.fields || []).map(item => [item.label, item.value]));
  const review = new Map((projection.sections.find(item => item.id === "revisao-upstream")?.fields || []).map(item => [item.label, item.value]));
  const qualification = new Map((projection.sections.find(item => item.id === "qualificacao-semantica")?.fields || []).map(item => [item.label, item.value]));

  assert.equal(logic.get("Entidade central"), "cleansing oil hada labo");
  assert.equal(logic.get("Audiência"), "pessoas montando rotina de limpeza");
  assert.equal(logic.get("Ambiguidade"), "sim");
  assert.equal(kgr.get("Score"), "0,022");
  assert.equal(kgr.get("Aplicabilidade"), "Aplicável");
  assert.equal(kgr.get("Decisão registrada"), "SIM");
  assert.equal(review.get("Origem"), "Minerador");
  assert.equal(qualification.get("Estado da evidência"), "Não conclusiva");
  assert.equal(qualification.get("Intenção consolidada"), "transacional");
});

test("a Apresentação Contextual preserva texto integral, versão, hash e proveniência", () => {
  const projection = projectKeywordDnaForArchitect(readyKeyword, presentation);

  assert.equal(projection.presentation.available, true);
  assert.equal(projection.presentation.text, presentationText);
  assert.equal(projection.presentation.versionNumber, 2);
  assert.equal(projection.presentation.contentHash, "presentation-hash-0001");
  assert.equal(projection.presentation.brandVoiceApplied, true);
  const provenance = new Map(projection.presentation.provenance.map(item => [item.label, item.value]));
  assert.equal(provenance.get("Origem"), "Minerador");
  assert.equal(provenance.get("Modelo"), "deepseek-chat");
  assert.match(readonlyPanel, /Apresentação contextual da marca/);
  assert.match(readonlyPanel, /whitespace-pre-wrap/);
});

test("sem apresentação no handoff, o Arquiteto informa a ausência sem chamar IA nem criar fallback", () => {
  const projection = projectKeywordDnaForArchitect(legacyIncompleteKeyword);

  assert.equal(projection.presentation.available, false);
  assert.equal(projection.presentation.text, null);
  assert.equal(projection.presentation.note, "Não disponível para esta versão da KeywordDNA.");
  assert.equal(readonlyPanel.includes("regenerate"), false);
  assert.equal(readonlyPanel.includes("generatePresentation"), false);
});

test("projeção lossless: campo recebido sem seção própria continua acessível na proveniência técnica", () => {
  const projection = projectKeywordDnaForArchitect(readyKeyword, presentation);
  const technicalLabels = projection.technical.map(item => item.label);

  assert.ok(technicalLabels.includes("campo_legado_sem_secao"));
  assert.equal(projection.technical.find(item => item.label === "campo_legado_sem_secao")?.value, "valor preservado");
  assert.ok(technicalLabels.includes("Referência da versão"));
  assert.ok(technicalLabels.includes("Payload do handoff"));
  assert.match(readonlyPanel, /Proveniência técnica/);
});

test("o painel readonly não possui nenhum controle de edição da KeywordDNA", () => {
  for (const control of ["<input", "<textarea", "onChange", "onClick", "onAction", "setKgrApplicability", "applyHumanReview", "Revisar novamente", "Concluir revisão"]) {
    assert.equal(readonlyPanel.includes(control), false, `controle proibido no painel readonly: ${control}`);
  }
  // O único <select> permitido é a decisão de papel do ARTIGO, injetada pelo
  // painel do artigo via headerExtra; o componente não cria controle próprio.
  assert.equal(readonlyPanel.includes("<select"), false);
  assert.match(readonlyPanel, /headerExtra/);
  assert.equal(workspace.includes("KeywordDnaPanel"), false);
});

test("Principal e apoio usam o mesmo componente readonly, empilhados", () => {
  assert.match(workspace, /role="Principal"/);
  assert.match(workspace, /art\.supportKeywords\.map\(\(keyword, index\) => <KeywordDnaReadonlyPanel/);
  assert.match(workspace, /presentation=\{keywordPresentations\[String\(keyword\.id\)\] \|\| null\}/);
  assert.match(readonlyPanel, /break-words/);
  assert.equal(readonlyPanel.includes("break-all"), false);
});

test("keyword aprovada com dimensões indeterminadas permanece legível e sem erro", () => {
  const projection = projectKeywordDnaForArchitect(legacyIncompleteKeyword);
  const byLabel = new Map(projection.summaryPrimary.map(item => [item.label, item.value]));

  assert.equal(projection.upstreamApproved, true);
  assert.equal(projection.upstreamStatusLabel.length > 0, true);
  assert.ok(projection.indeterminateDimensions.length > 0);
  assert.equal(readonlyPanel.includes("Dados upstream incompletos"), false);
  assert.match(readonlyPanel, /Minerador · {projection.upstreamStatusLabel}/);
  assert.match(readonlyPanel, /Algumas dimensões permanecem indeterminadas pela evidência disponível/);
  assert.equal(byLabel.get("Volume"), "320");
  assert.equal(byLabel.get("KGR"), "—");
  assert.equal(projection.sections.length, 8);
});

test("KGR da keyword e KGR do artigo continuam separados", () => {
  const article = readArticleKgrDecision({ principal: readyKeyword, principalKeywordId: readyKeyword.id });
  const before = JSON.stringify(readyKeyword);
  const projection = projectKeywordDnaForArchitect(readyKeyword, presentation);

  assert.equal(article.decision, "YES");
  assert.equal(article.source, "FULL_KGR_RULE");
  assert.equal(article.requiresHumanDecision, false);
  assert.equal(JSON.stringify(readyKeyword), before);
  assert.equal(projection.summaryPrimary.find(item => item.label === "KGR")?.value, "0,022");
  assert.equal(readonlyPanel.includes("KGR do artigo"), false);
  assert.match(workspace, /articleKgr\.requiresHumanDecision && <label/);
});

test("qualificação inconclusiva viaja como informação readonly, não como bloqueio", () => {
  const projection = projectKeywordDnaForArchitect(readyKeyword, presentation);
  const qualification = new Map((projection.sections.find(item => item.id === "qualificacao-semantica")?.fields || []).map(item => [item.label, item.value]));

  assert.equal(qualification.get("Estado da evidência"), "Não conclusiva");
  assert.equal(projection.upstreamApproved, true);
  assert.ok(projection.indeterminateDimensions.includes("Qualificação Semântica"));
});
