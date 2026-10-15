import { React } from "./radar-dom-harness.mts";
import { PlanArticleTableRow, PlanRowActions, PlanRowSeals, PlanSheetOperations, usePlanArticleSheet } from "../modules/arquiteto/plan-article-sheet.tsx";
import { ArticlesFormationBar } from "../modules/arquiteto/articles-formation-bar.tsx";
import { planOrderedGroupItems, planRowsWithoutArticle, splitTableSelectionForPlan, type PlanSheetArticle, type PlanSheetRow } from "../lib/arquiteto/plan-article-sheet.ts";
import type { EditorialGroupScreenFilter } from "../lib/editorial/editorial-groups.ts";
import type { ArchitectSubjectStanding } from "../lib/arquiteto/declared-subject.ts";

/*
 * A MESA DA ABA ARTIGOS, montada com as MESMAS peças que a aba usa
 * (`usePlanArticleSheet`, `ArticlesFormationBar`, `PlanSheetOperations`,
 * `PlanArticleTableRow`, `PlanRowSeals`, `PlanRowActions` e a ordem/seleção
 * do domínio): uma barra, uma tabela. Sem rede real, sem provider, sem custo.
 * 2026-10-14 (noite): extraída do teste "uma tabela só" para os testes das
 * etapas do plano ("Consolidar o Silo do plano").
 */

const h = React.createElement;
export const COLUNAS = ["index", "selection", "expand", "article", "keyword", "keywordCount", "siloRole", "articleDefinition", "silo", "actions", "approval", "status"];
const VAZIO = new Set<string>();

/** O artigo da mesa, na forma mínima: o Assunto dele diz se é do plano (o mesmo critério da aba). */
export type ArtigoDaMesa = { id: string; keyword: string; subjectKeywordId: string | null; published?: boolean };
export type Registro = { processar: string[][]; concluir: string[][]; links: number; pares: Array<{ groupId: string; territoryRef: string; pillarKeywordId: string | null }>; aplicados: number };
export const novoRegistro = (): Registro => ({ processar: [], concluir: [], links: 0, pares: [], aplicados: 0 });

export function MesaDoPlano({ marca, keywords, standings, articles, mesa, filtro, registro, groupOf, keywordGroupOf, siloConsolidado = false, parDoSilo, hasPublished = false }: {
  marca: string;
  keywords: readonly Record<string, unknown>[];
  /** Como na aba: o Assunto lido do pacote aprovado, à parte da linha (a linha que veio do ArticleDNA não traz a semântica). */
  standings?: ReadonlyMap<string, ArchitectSubjectStanding>;
  articles: readonly PlanSheetArticle[];
  mesa: readonly ArtigoDaMesa[];
  filtro: EditorialGroupScreenFilter;
  registro: Registro;
  groupOf: (id: string) => { color: string; name: string } | null;
  keywordGroupOf: (id: string) => string | null;
  siloConsolidado?: boolean;
  parDoSilo?: (input: { groupId: string; territoryRef: string; pillarKeywordId: string | null }) => Promise<{ ok: boolean; message: string }>;
  hasPublished?: boolean;
}) {
  const sheet = usePlanArticleSheet({
    brandId: marca, brandRef: "wificonecta--d4fa133a", keywords, standings, groupOf, keywordGroupOf, filter: filtro, articles, radarArticleIds: VAZIO,
    onApplied: () => { registro.aplicados += 1; },
    siloConsolidatedOf: () => siloConsolidado,
    consolidateSiloPair: async input => { registro.pares.push(input); return parDoSilo ? parDoSilo(input) : { ok: true, message: "SiloDNA v1 e SiloPage v1 gravados e relidos, com o Pilar e a ordem do plano." }; },
    onGoToLinks: () => { registro.links += 1; },
  });
  const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set());
  const planRowOf = (art: ArtigoDaMesa): PlanSheetRow | null => !art.published && art.subjectKeywordId ? sheet.rowByKeywordId.get(art.subjectKeywordId) ?? null : null;
  const representadas = new Set(mesa.map(planRowOf).filter((row): row is PlanSheetRow => Boolean(row)).map(row => row.keywordId));
  const soDoPlano = planRowsWithoutArticle(sheet.rows, representadas);
  const divisao = splitTableSelectionForPlan({ articles: mesa, selectedArticleIds: selecionados, idOf: art => art.id, planRowOf, planOnlyRows: soDoPlano, selectedPlanKeywordIds: sheet.selected });
  const escopo = { selectedCount: divisao.regularArticleIds.size, reason: divisao.regularArticleIds.size ? null : "Selecione pelo menos um artigo." };
  const itens = planOrderedGroupItems({ articles: mesa, planRows: soDoPlano, idOf: art => art.id, planRowOf });
  const alternar = (id: string) => setSelecionados(atual => { const proximo = new Set(atual); if (proximo.has(id)) proximo.delete(id); else proximo.add(id); return proximo; });
  return h(React.Fragment, null,
    h(ArticlesFormationBar, {
      formationBusy: false, processed: false, selectionScope: escopo, planTargets: divisao.planTargets, planSheet: sheet,
      onProcess: async () => { registro.processar.push([...divisao.regularArticleIds]); },
      onConfirm: async () => { registro.concluir.push([...divisao.regularArticleIds]); },
      improvementOpen: false, onToggleImprovement: () => undefined, buttonClassName: "button", primaryButtonClassName: "primary", hasPublished,
    }),
    h(PlanSheetOperations, { sheet, buttonClassName: "button", primaryButtonClassName: "primary", controlClassName: "control", dangerButtonClassName: "danger" }),
    h("table", { "data-architect-table": "articles" }, h("tbody", null, itens.map(item => item.kind === "plan"
      ? h(PlanArticleTableRow, { key: item.key, sheet, row: item.row, columns: COLUNAS, buttonClassName: "button" })
      : h("tr", { key: item.key, "data-testid": "mesa-article-row", "data-article-id": item.article.id },
        h("td", null, h("input", { type: "checkbox", "aria-label": `Selecionar ${item.article.keyword}`, checked: selecionados.has(item.article.id), onChange: () => alternar(item.article.id), "data-article-selection": item.article.id })),
        h("td", null, item.article.keyword, item.planRow ? h(PlanRowSeals, { row: item.planRow, result: sheet.results.get(item.planRow.keywordId) ?? null }) : null),
        h("td", null, item.planRow ? h(PlanRowActions, { sheet, row: item.planRow, buttonClassName: "button" }) : null))))),
  );
}

/** Os rótulos que o dono mandou tirar da aba (2026-10-14): nenhum pode aparecer fora da barra. */
export const ROTULOS_REMOVIDOS = [/Ir para “Artigos do plano”/, /Abrir “Melhorar publicados”/, /Marcar toda a cor/, /Validar SERP \(\d+\)/, /Trocar principal/, /Concluir formação \(\d+\)/, /Próximo passo/, /Melhorar publicados · recolhido/, /Detalhes técnicos/, /mude a trava no Minerador/, /Volume de outra fonte/];
