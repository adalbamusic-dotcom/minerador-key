import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DECLARED_PRINCIPAL_APPROVAL_REASON, SUBJECT_APPROVAL_REASON, resolveApprovalReadiness } from "../lib/minerador/approved-package.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import { setDeclaredPrincipal, setKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import {
  SUBJECT_ARTICLE_EDIT_HINT,
  SUBJECT_ARTICLE_ORPHAN_HINT,
  resolveSubjectArticleView,
  subjectArticlePositionLabel,
} from "../lib/minerador/subject-article-view.ts";

/**
 * O ASSUNTO SAIU DO VÍNCULO E APARECE SÓ LEITURA NO PAINEL DA KEYWORD
 * (pedido do dono, 2026-10-13: "apagar essa questão do Assunto/tema do
 * Vínculo, tanto da coluna como dos seletores, porque na planilha já não vai
 * mais existir assuntos, só keywords e dentro dessas keywords estão os
 * assuntos"; "falta colocar no painel do DNA das keywords o assunto/tema e
 * essas keywords têm que ser tratadas como qualquer keyword").
 *
 * Fixtures puras; nenhuma rede, nenhum banco, nenhum provider.
 */

const ACTOR = "3f0c9a52-8b1e-4c7d-9f2a-5e6b7c8d9e0f";
const AT = "2026-10-13T12:00:00.000Z";
const GROUP = "07fec332-4b0a-43cb-af19-cedfd9b24897";
const KW = "c66d4c43-77dd-4d82-a601-ee8b09c9c771";
const OTHER = "4339882e-6fe7-49b7-a7ea-975ecaef5b82";
const INTENT = "Informativa";

const groupOf = (id: string) => (id === GROUP ? { color: "azul", name: "Wi-Fi e fibra óptica" } : null);

function cadastro(input: { lock?: "locked" | "free"; details?: string } = {}): Record<string, unknown> {
  const plan = { groupId: GROUP, planVersion: 1, order: 3, role: "Suporte" as const, scope: input.details ?? "Compara fibra e cabo; para quem vai contratar.", declaredPrincipal: { keywordId: KW, phrase: "internet fibra óptica" }, ...(input.lock ? { lock: input.lock } : {}) };
  const subject = setKeywordSubject({}, { actorId: ACTOR, changedAt: AT, origin: "import", plan, entry: { title: "Internet fibra óptica ou internet comum: qual a diferença?", source: "cadastro" } });
  assert.ok(subject.ok);
  const mark = setDeclaredPrincipal(subject.semantic, { mark: { subjectKeywordId: KW, groupId: GROUP, planVersion: 1 }, actorId: ACTOR, changedAt: AT });
  assert.ok(mark.ok);
  return mark.semantic;
}

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

test("cadastro único: título, detalhes, papel/posição, grupo e trava LIVRE sem volume medido", () => {
  const view = resolveSubjectArticleView({ keywordId: KW, keyword: "internet fibra óptica", semantic: cadastro(), volume: { validated: false, value: null }, groupOf });
  assert.ok(view && view.kind === "subject");
  if (!view || view.kind !== "subject") return;
  assert.equal(view.format, "cadastro");
  assert.equal(view.title, "Internet fibra óptica ou internet comum: qual a diferença?", "o título é o do cadastro, não o texto da keyword");
  assert.equal(view.details, "Compara fibra e cabo; para quem vai contratar.");
  assert.equal(subjectArticlePositionLabel(view), "Suporte · artigo 3");
  assert.deepEqual(view.group, { color: "azul", name: "Wi-Fi e fibra óptica" });
  assert.equal(view.lock?.state, "free");
  assert.equal(view.lock?.label, "Livre · sem volume medido");
  assert.match(view.lock?.reason || "", /pode propor outra principal/);
  assert.equal(view.principalElsewhere, null);
  assert.equal(view.hint, SUBJECT_ARTICLE_EDIT_HINT);
  assert.equal(SUBJECT_ARTICLE_EDIT_HINT, "Para mudar, use Cadastrar Assuntos → Silo existente.");
});

test("cadastro único: com Volume validado > 0 a trava é automática; trava manual vence", () => {
  const travada = resolveSubjectArticleView({ keywordId: KW, keyword: "internet fibra óptica", semantic: cadastro(), volume: { validated: true, value: 880 }, groupOf });
  assert.ok(travada && travada.kind === "subject");
  assert.equal(travada?.kind === "subject" && travada.lock?.label, "Travada · pelo volume medido");
  const zero = resolveSubjectArticleView({ keywordId: KW, keyword: "internet fibra óptica", semantic: cadastro(), volume: { validated: true, value: 0 }, groupOf });
  assert.equal(zero?.kind === "subject" && zero.lock?.state, "free", "medido 0 = sem volume");
  const manual = resolveSubjectArticleView({ keywordId: KW, keyword: "internet fibra óptica", semantic: cadastro({ lock: "locked" }), volume: null, groupOf });
  assert.equal(manual?.kind === "subject" && manual.lock?.label, "Travada · escolhida à mão");
});

test("formato anterior: a frase da linha é o Assunto, a principal em outra linha, travada pela declaração", () => {
  const plan = { groupId: GROUP, planVersion: 2, order: 1, role: "Pilar" as const, scope: "Escopo do pilar.", declaredPrincipal: { keywordId: OTHER, phrase: "planos de internet residencial" } };
  const legacy = setKeywordSubject({}, { actorId: ACTOR, changedAt: AT, origin: "import", plan });
  assert.ok(legacy.ok);
  const view = resolveSubjectArticleView({ keywordId: KW, keyword: "Como escolher o melhor plano de internet?", semantic: legacy.semantic, volume: { validated: false, value: null }, groupOf });
  assert.ok(view && view.kind === "subject");
  if (!view || view.kind !== "subject") return;
  assert.equal(view.format, "anterior");
  assert.equal(view.title, "Como escolher o melhor plano de internet?");
  assert.equal(subjectArticlePositionLabel(view), "Pilar · artigo 1");
  assert.deepEqual(view.principalElsewhere, { keywordId: OTHER, phrase: "planos de internet residencial" });
  assert.equal(view.lock?.label, "Travada · declarada antes do cadastro único");

  // A principal dessa linha antiga mostra de quem ela é.
  const principal = setDeclaredPrincipal({}, { mark: { subjectKeywordId: KW, groupId: GROUP, planVersion: 2 }, actorId: ACTOR, changedAt: AT });
  assert.ok(principal.ok);
  const principalView = resolveSubjectArticleView({ keywordId: OTHER, keyword: "planos de internet residencial", semantic: principal.semantic, groupOf, keywordTextOf: id => (id === KW ? "Como escolher o melhor plano de internet?" : null) });
  assert.ok(principalView && principalView.kind === "principal_of_subject");
  assert.equal(principalView?.kind === "principal_of_subject" && principalView.subjectTitle, "Como escolher o melhor plano de internet?");
});

test("Assunto anterior sem plano (o laranja da WifiConecta) e Assunto de página publicada", () => {
  const solto = setKeywordSubject({}, { actorId: ACTOR, changedAt: AT, origin: "import" });
  assert.ok(solto.ok);
  const view = resolveSubjectArticleView({ keywordId: KW, keyword: "Claro, Vivo ou TIM: qual internet residencial escolher?", semantic: solto.semantic });
  assert.ok(view && view.kind === "subject");
  assert.equal(view?.kind === "subject" && view.withoutPlan, true);
  assert.equal(view?.kind === "subject" && view.lock, null, "sem plano, sem trava");
  assert.equal(view?.kind === "subject" && subjectArticlePositionLabel(view), null);

  const publicado = setKeywordSubject({}, { actorId: ACTOR, changedAt: AT, origin: "import", entry: { title: "Reforço do guia de fibra", source: "cadastro", details: "Detalhes do publicado." } });
  assert.ok(publicado.ok);
  const pub = resolveSubjectArticleView({ keywordId: KW, keyword: "internet fibra", semantic: publicado.semantic });
  assert.equal(pub?.kind === "subject" && pub.details, "Detalhes do publicado.");
  assert.equal(pub?.kind === "subject" && pub.lock?.state, "protected");
});

test("marca de principal órfã (Assunto retirado pelo Vínculo antigo): o painel avisa e mostra o último título", () => {
  const withdrawnLike = {
    ...cadastro(),
    keyword_subject: null,
  };
  const view = resolveSubjectArticleView({ keywordId: KW, keyword: "internet fibra óptica", semantic: withdrawnLike, groupOf });
  assert.ok(view && view.kind === "orphan_mark");
  assert.equal(view?.kind === "orphan_mark" && view.lastTitle, "Internet fibra óptica ou internet comum: qual a diferença?");
  assert.equal(view?.kind === "orphan_mark" && view.hint, SUBJECT_ARTICLE_ORPHAN_HINT);
  assert.deepEqual(view?.group, { color: "azul", name: "Wi-Fi e fibra óptica" });
  assert.equal(resolveSubjectArticleView({ keywordId: KW, keyword: "x", semantic: { nicho: "y" } }), null, "keyword comum: nada a mostrar");
});

test("aprovação: tratada como qualquer keyword, com a única exceção da D2-bis (plano de Silo) e a D2 só para o Assunto anterior", () => {
  const logic = (extra: Record<string, unknown>): Record<string, unknown> => {
    const semantic: Record<string, unknown> = { dna_origem: "logico_deterministico", intencao_principal: INTENT, nicho: "Internet", funnel: "TOFU", ...extra };
    semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: INTENT, niche: "Internet", funnel: "TOFU" });
    return semantic;
  };
  // Keyword LIVRE do plano (sem volume medido): chega ao Arquiteto pela D2-bis.
  const doPlano = resolveApprovalReadiness({ semantic: logic(cadastro()), intent: INTENT, volumeSearch: null });
  assert.equal(doPlano.ok, true);
  const semLogica = resolveApprovalReadiness({ semantic: cadastro(), intent: INTENT });
  assert.equal(semLogica.reason, DECLARED_PRINCIPAL_APPROVAL_REASON);

  // Assunto do cadastro sem plano (destino publicado): regra normal — Volume é exigido.
  const publicado = setKeywordSubject(logic({}), { actorId: ACTOR, changedAt: AT, origin: "import", entry: { title: "Reforço", source: "cadastro", details: "d" } });
  assert.ok(publicado.ok);
  const normal = resolveApprovalReadiness({ semantic: publicado.semantic, intent: INTENT, volumeSearch: null });
  assert.equal(normal.ok, false);
  assert.deepEqual(normal.missing, ["volume"]);

  // Assunto anterior (frase própria, sem entry): a D2 continua, para não recusar aprovações já feitas.
  const anterior = setKeywordSubject(logic({}), { actorId: ACTOR, changedAt: AT, origin: "import" });
  assert.ok(anterior.ok);
  assert.equal(resolveApprovalReadiness({ semantic: anterior.semantic, intent: INTENT, volumeSearch: null }).ok, true);
  const anteriorSemLogica = setKeywordSubject({}, { actorId: ACTOR, changedAt: AT, origin: "import" });
  assert.ok(anteriorSemLogica.ok);
  assert.equal(resolveApprovalReadiness({ semantic: anteriorSemLogica.semantic }).reason, SUBJECT_APPROVAL_REASON);
});

test("tela: o bloco 'Assunto deste artigo' é só leitura, no painel do DNA, com Buscar sustentação e a dica do card", () => {
  const panels = stripComments(readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8"));
  const block = panels.slice(panels.indexOf("export function SubjectArticleBlock("), panels.indexOf("function TechnicalDetails("));
  assert.ok(block.length > 0);
  assert.match(block, /aria-label="Assunto deste artigo"/);
  assert.match(block, /ASSUNTO DESTE ARTIGO/);
  assert.match(block, /somente leitura/);
  assert.match(block, /data-subject-article-title/);
  assert.match(block, /data-subject-article-details/);
  assert.match(block, /data-subject-article-lock/);
  assert.match(block, /<EditorialGroupTag name=\{group\.name\} color=\{group\.color\} \/>/, "a cor do grupo com o nome escrito");
  assert.match(block, /data-subject-article-hint/);
  assert.match(block, /Buscar sustentação/);
  assert.match(block, /Nada é pago antes de você confirmar o custo\./);
  assert.doesNotMatch(block, /<input|<select|<textarea|onAction|supabase|fetch\(/, "nada grava no bloco");
  assert.doesNotMatch(block, /text-xs|text-\[(?:9|10|11|12|13)px\]|bg-(?:black|white)\b|#[0-9a-f]{3,6}/i, "14px e tokens");

  // No painel do DNA (KeywordDnaPanel), antes da Revisão Humana — não dentro do Vínculo.
  const stageSubject = panels.indexOf('data-keyword-profile-stage="subject"');
  const stageReview = panels.indexOf('data-keyword-profile-stage="human-review"');
  assert.ok(stageSubject > 0 && stageSubject < stageReview);
  assert.match(panels, /const subjectArticle = resolveSubjectArticleView\(\{/);

  // A Revisão Humana não tem mais Assunto: nem select, nem nota, nem destino, nem trava de KGR/Posto.
  const review = panels.slice(panels.indexOf("function HumanReviewPanel("), panels.indexOf("export function SubjectArticleBlock("));
  assert.doesNotMatch(review, /ReviewSubjectControl|VinculoSubject|Nota: o que é|Página de destino|subjectLabel|subjectDeclared|subjectLocksKgr|Buscar sustentação/);
  assert.doesNotMatch(panels, /function ReviewSubjectControl\(/);
  assert.match(review, /data-review-vinculo-summary/);

  // O workspace entrega o grupo e o texto pelo id, e o "Buscar sustentação" saiu da coluna.
  const workspace = stripComments(readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
  assert.match(workspace, /subjectGroupOf=\{subjectGroupOf\}/);
  assert.match(workspace, /subjectKeywordTextOf=\{subjectKeywordTextOf\}/);
  assert.doesNotMatch(workspace, /data-subject-search-link|handleSubjectReviewAction|lookupSubjectDestinationCatalog/);
});
