import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { keywordPageTypeChoices, setKeywordPageType } from "../lib/minerador/keyword-page-type.ts";
import { setKeywordSubject } from "../lib/minerador/keyword-subject.ts";
import {
  KEYWORD_VINCULO_NO_SUBJECT_LABEL,
  KEYWORD_VINCULO_SUBJECT_DECLARED_LABEL,
  KEYWORD_VINCULO_SUBJECT_DECLARED_WITHOUT_NOTE_LABEL,
  keywordVinculoChoiceLabels,
  keywordVinculoChoicesSummary,
  keywordVinculoSummary,
  resolveKeywordVinculo,
} from "../lib/minerador/keyword-vinculo.ts";
import { planVinculoBatchChoices, type VinculoBatchKeyword } from "../lib/minerador/vinculo-batch.ts";
import {
  EMPTY_VINCULO_BATCH_CHOICES,
  VINCULO_MIXED_LABEL,
  VINCULO_MIXED_VALUE,
  VINCULO_POST_SELECT_OPTIONS,
  VINCULO_SUBJECT_SELECT_OPTIONS,
  chooseVinculoBatchSelect,
  commonVinculoSelectValues,
  describeVinculoBatchChoicesConfirmation,
  vinculoBatchActionsFromChoices,
  vinculoBatchChoiceToSelect,
  vinculoBatchPostDisabled,
  vinculoBatchSelectValue,
  vinculoPublishedCurrentPageTypeOption,
  vinculoSelectToBatchChoice,
  vinculoSelectValues,
} from "../lib/minerador/vinculo-screen.ts";
import { keywordTableMinimumWidth, resolveKeywordTableResponsiveWidths } from "../modules/minerador/keyword-table/use-keyword-table-responsive-widths.ts";

/**
 * VÍNCULO: OS MESMOS SELECTS NA REVISÃO E NO RODAPÉ, E A COLUNA COM AS TRÊS
 * ESCOLHAS (pedido do dono, 2026-09-24, terceira rodada).
 *
 *  1. o painel "Vínculo das selecionadas" usa os três selects do card REVISÃO
 *     HUMANA, sem "Não mudar": cada select mostra o valor comum das
 *     selecionadas ou o marcador desabilitado "Valores diferentes", e só o
 *     select que o humano muda vira gravação;
 *  2. a coluna Vínculo mostra Posto, Potencial e Assunto, default ou escolha;
 *  3. a planilha deixa folga para as bordas externas do border-collapse, e a
 *     barra horizontal só aparece quando as colunas não cabem.
 *
 * Fixtures puras, sem rede, banco nem provider; REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const BRAND = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
const ACTOR = "3f0c9a52-8b1e-4c7d-9f2a-5e6b7c8d9e0f";
const AT = "2026-09-24T12:00:00+00:00";
const SITE = "https://clinicaexemplo.com.br";

const PUBLISHED_ORIGIN = {
  site_origin: {
    sourceUrl: `${SITE}/marketing-para-clinicas`,
    resolvedUrl: `${SITE}/marketing-para-clinicas`,
    canonicalUrl: `${SITE}/marketing-para-clinicas`,
    urlSituation: "canonical_confirmed", publicationStatus: "published",
    lastCheckedAt: "2026-09-20T23:30:00+00:00",
    publicationConfirmedBy: ACTOR, publicationConfirmedAt: "2026-09-20T23:40:00+00:00",
    siteRole: "article",
  },
};

function uuid(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function row(n: number, semantic: Record<string, unknown> = { nicho: "Clínicas" }, status = "bruto"): VinculoBatchKeyword {
  return {
    id: uuid(n), brand_id: BRAND, keyword: `keyword ${n}`, status, intent: "Informativa",
    volume_search: 100, results_allintitle: 20, kgr_score: 0.2, lista_id: null, analise_semantica: semantic,
  };
}

function declaredSubject(semantic: Record<string, unknown>): Record<string, unknown> {
  const result = setKeywordSubject(semantic, { note: "Serviço para clínicas", actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.ok(result.ok);
  return result.ok ? result.semantic : semantic;
}

function silo(semantic: Record<string, unknown> = { nicho: "Clínicas" }): Record<string, unknown> {
  return setKeywordPageType(semantic, { pageType: "silo", stance: "declared", actorId: ACTOR, changedAt: AT }).semantic;
}

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const workspace = stripComments(readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8"));
const panels = stripComments(readFileSync(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8"));
const shared = stripComments(readFileSync(new URL("../components/editorial/vinculo-selects.tsx", import.meta.url), "utf8"));
const hook = stripComments(readFileSync(new URL("../modules/minerador/keyword-table/use-keyword-table-responsive-widths.ts", import.meta.url), "utf8"));
const architect = stripComments(readFileSync(new URL("../modules/arquiteto/arquiteto-workspace.tsx", import.meta.url), "utf8"));

test("um vocabulário só: os rótulos e valores da Revisão Humana, sem Não mudar", () => {
  assert.deepEqual(VINCULO_POST_SELECT_OPTIONS.map(option => [option.value, option.label]), [["reviewable", "Livre"], ["locked", "Travado ao slug"]]);
  assert.deepEqual(VINCULO_SUBJECT_SELECT_OPTIONS.map(option => [option.value, option.label]), [["none", "Não"], ["declared", "Declarado"]]);
  assert.equal(VINCULO_MIXED_LABEL, "Valores diferentes");
  for (const source of [shared, panels, workspace]) assert.doesNotMatch(source, /Não mudar/);

  const nova = resolveKeywordVinculo({ status: "bruto", semantic: { nicho: "Clínicas" } });
  assert.deepEqual(vinculoSelectValues(nova), { post: "reviewable", page_type: "potential:article", subject: "none" }, "o default é valor do select, não ausência");
  const assunto = resolveKeywordVinculo({ status: "bruto", semantic: declaredSubject(silo()) });
  assert.deepEqual(vinculoSelectValues(assunto), { post: "reviewable", page_type: "declared:silo", subject: "declared" });

  for (const [key, value, choice] of [["post", "locked", "post:locked"], ["post", "reviewable", "post:reviewable"], ["page_type", "declared:landing_page", "page_type:declared:landing_page"], ["subject", "declared", "subject:declare"], ["subject", "none", "subject:withdraw"]] as const) {
    assert.equal(vinculoSelectToBatchChoice(key, value), choice);
    assert.equal(vinculoBatchChoiceToSelect(key, choice), value);
  }
  assert.equal(vinculoSelectToBatchChoice("post", VINCULO_MIXED_VALUE), "", "o marcador nunca vira escolha");
  assert.equal(vinculoSelectToBatchChoice("page_type", "declared:assunto"), "");
});

test("em grupo, cada select mostra o valor comum ou Valores diferentes", () => {
  const iguais = commonVinculoSelectValues([row(1), row(2)]);
  assert.deepEqual(iguais, { post: "reviewable", page_type: "potential:article", subject: "none", publishedOnly: false });
  for (const key of ["post", "page_type", "subject"] as const) assert.equal(vinculoBatchSelectValue(key, EMPTY_VINCULO_BATCH_CHOICES, iguais), iguais[key]);

  const misturadas = commonVinculoSelectValues([row(1), row(2, silo()), row(3, declaredSubject({ nicho: "Clínicas" }))]);
  assert.equal(misturadas.post, "reviewable");
  assert.equal(misturadas.page_type, null);
  assert.equal(misturadas.subject, null);
  assert.equal(vinculoBatchSelectValue("page_type", EMPTY_VINCULO_BATCH_CHOICES, misturadas), VINCULO_MIXED_VALUE);
  assert.equal(vinculoBatchSelectValue("subject", EMPTY_VINCULO_BATCH_CHOICES, misturadas), VINCULO_MIXED_VALUE);
  assert.equal(vinculoBatchSelectValue("page_type", { ...EMPTY_VINCULO_BATCH_CHOICES, page_type: "page_type:declared:silo" }, misturadas), "declared:silo", "a mudança do humano aparece no select");

  assert.equal(commonVinculoSelectValues([row(1, { ...PUBLISHED_ORIGIN }), row(2, { ...PUBLISHED_ORIGIN })]).publishedOnly, true, "todas publicadas: só os 4 declarados");
  assert.equal(commonVinculoSelectValues([row(1, { ...PUBLISHED_ORIGIN }), row(2)]).publishedOnly, false);
  assert.equal(commonVinculoSelectValues([]).publishedOnly, false);
});

test("só o select que o humano mudou vira gravação; voltar ao valor comum desfaz", () => {
  const keywords = [row(1), row(2, silo())];
  const common = commonVinculoSelectValues(keywords);
  const start = { ...EMPTY_VINCULO_BATCH_CHOICES, note: "", destination: "" };

  assert.deepEqual(vinculoBatchActionsFromChoices(start), [], "abrir o painel não grava nada");
  assert.equal(chooseVinculoBatchSelect(start, "page_type", VINCULO_MIXED_VALUE, common), start, "Valores diferentes não é escolha");

  const posto = chooseVinculoBatchSelect(start, "post", "reviewable", common);
  assert.equal(posto.post, "", "o valor que já é de todas não grava");
  const potencial = chooseVinculoBatchSelect(start, "page_type", "declared:silo", common);
  assert.equal(potencial.page_type, "page_type:declared:silo");
  assert.deepEqual(vinculoBatchActionsFromChoices(potencial), [{ kind: "page_type", pageType: "silo", stance: "declared" }], "uma ação: só o que mudou");

  const plan = planVinculoBatchChoices({ keywords, brandId: BRAND, actions: vinculoBatchActionsFromChoices(potencial) ?? [], actorId: ACTOR, changedAt: AT });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  assert.deepEqual(plan.updates.map(update => update.id), [uuid(1)], "a que já era Silo declarado fica como está");
  assert.equal(plan.updates[0].semantic.keyword_page_type_actor, ACTOR, "ator = auth.users.id");
  assert.ok(describeVinculoBatchChoicesConfirmation(plan).steps[0].details.includes("1 já estava assim."));

  const semAssuntoComum = commonVinculoSelectValues([row(1)]);
  const desfeito = chooseVinculoBatchSelect(chooseVinculoBatchSelect(start, "subject", "declared", semAssuntoComum), "subject", "none", semAssuntoComum);
  assert.equal(desfeito.subject, "", "voltar ao comum desfaz a escolha");
});

test("Assunto Declarado desliga o Posto, escolhido agora ou comum a todas", () => {
  const start = { ...EMPTY_VINCULO_BATCH_CHOICES, note: "", destination: "" };
  const novas = commonVinculoSelectValues([row(1, { ...PUBLISHED_ORIGIN })]);
  const travado = chooseVinculoBatchSelect(start, "post", "locked", novas);
  const comPosto = travado.post === "" ? chooseVinculoBatchSelect(start, "post", "reviewable", novas) : travado;
  assert.notEqual(comPosto.post, "", "um posto diferente do comum fica escolhido");
  const declarando = chooseVinculoBatchSelect(comPosto, "subject", "declared", novas);
  assert.equal(declarando.subject, "subject:declare");
  assert.equal(declarando.post, "", "Declarar limpa o Posto");
  assert.equal(vinculoBatchPostDisabled(declarando, novas), true);

  const assuntos = commonVinculoSelectValues([row(1, declaredSubject({ ...PUBLISHED_ORIGIN })), row(2, declaredSubject({ nicho: "Clínicas" }))]);
  assert.equal(assuntos.subject, "declared");
  assert.equal(vinculoBatchPostDisabled(start, assuntos), true, "todas Assunto: o Posto não se aplica, como na Revisão");
  const retirando = chooseVinculoBatchSelect(start, "subject", "none", assuntos);
  assert.equal(retirando.subject, "subject:withdraw");
  assert.equal(vinculoBatchPostDisabled(retirando, assuntos), false, "Retirar libera o Posto");
  const comPostoDepois = chooseVinculoBatchSelect(retirando, "post", "locked", assuntos);
  assert.equal(comPostoDepois.post, "post:locked");
  const deVolta = chooseVinculoBatchSelect(comPostoDepois, "subject", "declared", assuntos);
  assert.equal(deVolta.subject, "", "voltou ao comum");
  assert.equal(deVolta.post, "", "o Posto não fica escolhido atrás de um select desligado");
  assert.deepEqual(vinculoBatchActionsFromChoices(deVolta), []);
});

test("coluna Vínculo: as três escolhas, default ou do usuário, pelo resolvedor", () => {
  const nova = resolveKeywordVinculo({ status: "bruto", semantic: { nicho: "Clínicas" } });
  assert.equal(KEYWORD_VINCULO_NO_SUBJECT_LABEL, "Assunto: Não");
  assert.deepEqual(keywordVinculoChoiceLabels(nova), { post: "Livre", pageType: "Artigo · potencial", subject: "Assunto: Não" });
  assert.equal(keywordVinculoChoicesSummary(nova), "Livre · Artigo · potencial · Assunto: Não");
  assert.equal(keywordVinculoSummary(nova), "Livre · Artigo · potencial", "a frase anterior continua a mesma para quem já a usa");

  const assunto = resolveKeywordVinculo({ status: "bruto", semantic: declaredSubject(silo()) });
  assert.equal(KEYWORD_VINCULO_SUBJECT_DECLARED_LABEL, "Assunto: Declarado", "a palavra do select do Assunto");
  assert.equal(keywordVinculoChoicesSummary(assunto), "Livre · Silo · declarado · Assunto: Declarado");
  const semNota = setKeywordSubject({ nicho: "Clínicas" }, { note: null, actorId: ACTOR, changedAt: AT, origin: "review" });
  assert.ok(semNota.ok);
  const assuntoSemNota = resolveKeywordVinculo({ status: "bruto", semantic: semNota.ok ? semNota.semantic : {} });
  assert.equal(KEYWORD_VINCULO_SUBJECT_DECLARED_WITHOUT_NOTE_LABEL, "Assunto: Declarado, sem nota");
  assert.equal(keywordVinculoChoiceLabels(assuntoSemNota).subject, KEYWORD_VINCULO_SUBJECT_DECLARED_WITHOUT_NOTE_LABEL);
  assert.equal(assuntoSemNota.subjectLabel, "Assunto sem nota", "o rótulo antigo continua para quem já o lê");

  const cell = workspace.slice(
    workspace.indexOf(`<td data-keyword-vinculo-cell className="border-r border-divider/70 px-2 py-1 text-center whitespace-nowrap">`),
    workspace.indexOf("{publicationLink.action === \"correct_legacy\" && item.id && ("),
  );
  assert.ok(cell.length > 0);
  assert.match(cell, /data-keyword-vinculo-choices title=\{keywordVinculoChoicesSummary\(vinculo\)\}/, "a frase inteira no título da célula");
  assert.match(cell, /\{vinculo\.postLabel\}[\s\S]*\{vinculo\.pageTypeLabel\}[\s\S]*\{vinculo\.subjectLabel \? \(\s*<span\s+data-keyword-subject-label[\s\S]*?\{keywordVinculoChoiceLabels\(vinculo\)\.subject\}[\s\S]*?\) : \(\s*<span\s+data-keyword-vinculo-no-subject[\s\S]*?\{keywordVinculoChoiceLabels\(vinculo\)\.subject\}/, "Posto, Potencial e Assunto, nessa ordem, com a palavra do select");
  assert.doesNotMatch(cell, />\s*\{vinculo\.subjectLabel\}\s*</, "o texto do Assunto vem das três escolhas, não do rótulo antigo");
  assert.doesNotMatch(workspace, /w-\[120px\] border-r border-divider\/70 px-(?:2 py-1|3 py-2) text-center whitespace-nowrap/, "sem a largura morta de 120px: o <col> manda");
  assert.match(workspace, /Nota em branco: a coluna marca &quot;\{KEYWORD_VINCULO_SUBJECT_DECLARED_WITHOUT_NOTE_LABEL\}&quot;/);
  assert.doesNotMatch(cell, /text-\[(?:9|10|11|12|13)px\]|\btext-xs\b/, "texto de 14px");
  assert.equal((workspace.match(/resolveKeywordVinculo\(/g) || []).length, 1, "a coluna resolve uma vez; o painel lê pelo domínio");
});

test("a planilha deixa folga para as bordas do border-collapse", () => {
  const widthsBlock = workspace.slice(workspace.indexOf("const processorColumnWidths = {"), workspace.indexOf("};", workspace.indexOf("const processorColumnWidths = {")));
  const widths: Record<string, number> = {};
  for (const match of widthsBlock.matchAll(/(\w+):\s*(\d+)/g)) widths[match[1]] = Number(match[2]);
  const constraintsBlock = workspace.slice(workspace.indexOf("const processorColumnConstraints = {"), workspace.indexOf("\n};", workspace.indexOf("const processorColumnConstraints = {")));
  const constraints: Record<string, { min: number; max: number; fill?: boolean; flexible?: boolean; priority?: "protected" }> = {};
  for (const match of constraintsBlock.matchAll(/(\w+):\s*\{\s*min:\s*(\d+),\s*max:\s*(\d+)([^}]*)\}/g)) {
    constraints[match[1]] = {
      min: Number(match[2]), max: Number(match[3]),
      ...(match[4].includes("fill: true") ? { fill: true } : {}),
      ...(match[4].includes("flexible: true") ? { flexible: true } : {}),
      ...(match[4].includes('"protected"') ? { priority: "protected" as const } : {}),
    };
  }
  assert.equal(constraints.keyword?.fill, true);

  const reserve = 2;
  assert.match(workspace, /const processorTableWidthOptions = \{ edgeReserve: 2 \} as const;/);
  assert.match(workspace, /useKeywordTableResponsiveWidths\(columnResize\.widths, processorColumnConstraints, tableRef, columnResize\.resizedColumnIds, processorTableWidthOptions\)/);

  const minimum = keywordTableMinimumWidth(constraints, Object.keys(widths));
  const preferred = Object.values(widths).reduce((sum, value) => sum + value, 0);
  for (let available = minimum + reserve; available <= preferred + 400; available += 1) {
    const projected = resolveKeywordTableResponsiveWidths(widths, constraints, available, [], { edgeReserve: reserve });
    const total = Object.values(projected).reduce((sum, value) => sum + value, 0);
    assert.ok(total + reserve <= available, `${total}px + ${reserve}px de borda passam de ${available}px`);
    assert.ok(projected.keyword >= constraints.keyword.min, "a Palavra-Chave nunca fica abaixo do mínimo");
  }
  const wide = resolveKeywordTableResponsiveWidths(widths, constraints, preferred + 300, [], { edgeReserve: reserve });
  assert.equal(wide.keyword, widths.keyword + 300 - reserve, "a Palavra-Chave (fill) cede só a folga");

  for (const available of [minimum, 1300, 1600, preferred, 1920]) {
    assert.deepEqual(
      resolveKeywordTableResponsiveWidths(widths, constraints, available),
      resolveKeywordTableResponsiveWidths(widths, constraints, available, [], { edgeReserve: 0 }),
      "sem a opção, a projeção é a de antes (Arquiteto)",
    );
  }
  assert.match(architect, /useKeywordTableResponsiveWidths\(columnResize\.widths, architectColumnConstraints, articleTableRef\)/, "o Arquiteto não muda");
  assert.match(hook, /availableWidth = Math\.max\(0, availableWidth - edgeReserveOf\(options\)\);/);
});

test("a última coluna não tem borda direita: com border-collapse ela vira borda da tabela", () => {
  const statusCell = workspace.match(/<td className="relative w-\[108px\][^"]*">/g) || [];
  assert.equal(statusCell.length, 1);
  assert.doesNotMatch(statusCell[0], /border-r\b/);
  const statusHeader = workspace.match(/<th className="relative w-\[108px\] px-3 py-2 text-center whitespace-nowrap">/g) || [];
  assert.equal(statusHeader.length, 1, "o cabeçalho da última coluna também não tem");
  assert.match(workspace, /style=\{\{ minWidth: processorTableMinimumWidth \}\} className="w-full table-fixed border-collapse/, "abaixo dos mínimos a barra continua valendo");
});

test("1366px com o menu lateral aberto: as colunas cabem sem barra horizontal", () => {
  const widthsBlock = workspace.slice(workspace.indexOf("const processorColumnWidths = {"), workspace.indexOf("};", workspace.indexOf("const processorColumnWidths = {")));
  const ids = [...widthsBlock.matchAll(/(\w+):\s*\d+/g)].map(match => match[1]);
  const constraintsBlock = workspace.slice(workspace.indexOf("const processorColumnConstraints = {"), workspace.indexOf("\n};", workspace.indexOf("const processorColumnConstraints = {")));
  const constraints: Record<string, { min: number }> = {};
  for (const match of constraintsBlock.matchAll(/(\w+):\s*\{\s*min:\s*(\d+)/g)) constraints[match[1]] = { min: Number(match[2]) };
  const minimum = keywordTableMinimumWidth(constraints, ids);
  const sidebar = 240 + 1;
  const thinVerticalScrollbar = 11;
  const clientWidth = 1366 - sidebar - thinVerticalScrollbar;
  assert.ok(minimum + 2 <= clientWidth, `${minimum}px de mínimos + 2px de borda passam de ${clientWidth}px`);
  assert.ok(minimum <= 1106, `a soma dos mínimos voltou a crescer: ${minimum}px`);
  assert.equal(constraints.keyword.min, 240, "a Palavra-Chave não cedeu");
  assert.ok(constraints.cpc.min >= 72 && constraints.kgr.min >= 68, "CPC e KGR não ficaram menores que o número");
  assert.ok(constraints.results.min >= 104 && constraints.volume.min >= 96, "Resultados e Volume mantêm os mínimos protegidos");
  const preferred = Object.fromEntries([...widthsBlock.matchAll(/(\w+):\s*(\d+)/g)].map(match => [match[1], Number(match[2])]));
  const projected = resolveKeywordTableResponsiveWidths(preferred, constraints, clientWidth, [], { edgeReserve: 2 });
  const total = Object.values(projected).reduce((sum, value) => sum + value, 0);
  assert.ok(total + 2 <= clientWidth, `a projeção (${total}px) passa de ${clientWidth}px`);
});

test("publicada sem tipo determinado: o select mostra o mesmo valor da coluna", () => {
  const semTipo = { ...PUBLISHED_ORIGIN, site_origin: { ...PUBLISHED_ORIGIN.site_origin, siteRole: undefined } };
  const vinculo = resolveKeywordVinculo({ status: "bruto", semantic: semTipo });
  assert.equal(vinculo.publicationDeclared, true);
  assert.equal(vinculo.pageType.determined, false);
  assert.equal(vinculo.pageTypeLabel, "Artigo · potencial");
  const value = vinculoSelectValues(vinculo).page_type;
  const publishedValues = keywordPageTypeChoices({ published: true }).map(choice => choice.value);
  assert.ok(!publishedValues.includes(value), "o valor atual não está entre os 4 declarados");
  assert.deepEqual(vinculoPublishedCurrentPageTypeOption(value, true), { value: "potential:article", label: vinculo.pageTypeLabel }, "entra como opção, com o rótulo da coluna");
  assert.equal(vinculoPublishedCurrentPageTypeOption("declared:silo", true), null, "valor declarado já está entre as opções");
  assert.equal(vinculoPublishedCurrentPageTypeOption(value, false), null, "a nova já oferece os potenciais");
  assert.equal(vinculoPublishedCurrentPageTypeOption(VINCULO_MIXED_VALUE, true), null, "o marcador nunca vira opção");

  const common = commonVinculoSelectValues([row(1, semTipo), row(2, semTipo)]);
  assert.equal(common.publishedOnly, true);
  assert.equal(common.page_type, "potential:article");
  const trocou = chooseVinculoBatchSelect(EMPTY_VINCULO_BATCH_CHOICES, "page_type", "declared:article", common);
  assert.equal(trocou.page_type, "page_type:declared:article", "escolher Artigo · declarado é mudança de verdade");
  assert.equal(chooseVinculoBatchSelect(trocou, "page_type", "potential:article", common).page_type, "", "voltar ao valor atual desfaz");

  assert.ok(shared.includes("const current = vinculoPublishedCurrentPageTypeOption(currentValue === undefined ? value : currentValue, published);"));
  assert.ok(shared.includes("{current ? <option value={current.value}>{current.label}</option> : null}"));
  assert.match(workspace, /published=\{vinculoBatchCommon\.publishedOnly\}\s*currentValue=\{vinculoBatchCommon\.page_type\}/, "no painel, o valor comum gravado");
});

test("o nome acessível do Potencial começa pelo rótulo visível, no card e no painel", () => {
  assert.ok(shared.includes(`const visibleLabel = published ? "A página publicada é" : "Potencial de página";`));
  assert.ok(shared.includes("aria-label={ariaLabel ?? (ariaContext ? `${visibleLabel} ${ariaContext}` : undefined)}"));
  assert.match(panels, /<VinculoPageTypeSelect[\s\S]{0,200}ariaContext="na revisão humana"/);
  assert.doesNotMatch(panels, /Tipo de página na revisão humana/);
});

test("com Revisão Humana aberta na seleção, o painel avisa que mostra o valor gravado", () => {
  assert.match(workspace, /const vinculoBatchDraftCount = vinculoBatchDialogOpen \? \[\.\.\.selectedIds\]\.filter\(id => Boolean\(humanReviewDrafts\[id\]\)\)\.length : 0;/);
  assert.match(workspace, /\{vinculoBatchDraftCount > 0 && \(\s*<p data-vinculo-batch-draft-note className="mt-1 text-sm text-warning">/);
});
