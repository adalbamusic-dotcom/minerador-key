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
 * 2026-10-16 · restauração do fluxo de sempre: a barra é a de sempre
 * (Processar artigos · Concluir formação · Melhorar publicados…) em todo
 * recorte; sem etapas do plano e sem a linha "Consolidar o Silo do plano".
 * 2026-10-17 (noite) · os 3 botões em sequência e o Silo do plano fechado no
 * mesmo ato do Concluir (`onConcluded`, registrado em `registro.silos`).
 */

const h = React.createElement;
export const COLUNAS = ["index", "selection", "expand", "article", "keyword", "keywordCount", "siloRole", "articleDefinition", "silo", "actions", "approval", "status"];
const VAZIO = new Set<string>();

/** O artigo da mesa, na forma mínima: o Assunto dele diz se é do plano (o mesmo critério da aba). */
export type ArtigoDaMesa = { id: string; keyword: string; subjectKeywordId: string | null; published?: boolean };
export type Registro = { processar: string[][]; concluir: string[][]; aplicados: number; silos: string[][] };
export const novoRegistro = (): Registro => ({ processar: [], concluir: [], aplicados: 0, silos: [] });

export function MesaDoPlano({ marca, keywords, standings, articles, mesa, filtro, registro, groupOf, keywordGroupOf, publishedCount = 0, improvementOpen = false, onToggleImprovement }: {
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
  /** Publicados no recorte (a aba conta a tabela): "Melhorar publicados…" fica habilitado para eles. */
  publishedCount?: number;
  improvementOpen?: boolean;
  onToggleImprovement?: () => void;
}) {
  const sheet = usePlanArticleSheet({
    brandId: marca, brandRef: "wificonecta--d4fa133a", keywords, standings, groupOf, keywordGroupOf, filter: filtro, articles, radarArticleIds: VAZIO,
    onApplied: () => { registro.aplicados += 1; },
    onConcluded: async groupIds => { registro.silos.push([...groupIds]); return { tone: "success", text: "Silo do plano fechado (dublê do fechamento canônico)." }; },
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
      improvementOpen, onToggleImprovement: onToggleImprovement ?? (() => undefined), buttonClassName: "button", attentionClassName: "primary", publishedCount,
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

/**
 * Os rótulos que o dono mandou tirar da aba (2026-10-14) e as portas paralelas
 * que saíram na restauração (2026-10-16): nenhum pode aparecer na mesa.
 * 2026-10-17 (noite) · e os 7 botões que o dono chamou de "totalmente inúteis".
 */
export const ROTULOS_REMOVIDOS = [/Ir para “Artigos do plano”/, /Abrir “Melhorar publicados”/, /Marcar toda a cor/, /Validar SERP/, /Trocar principal/, /Concluir formação \(\d+\)/, /Próximo passo/, /Melhorar publicados · recolhido/, /mude a trava no Minerador/, /Volume de outra fonte/,
  /1 · Formar/, /2 · Reforçar/, /3 · Linha editorial/, /4 · Links internos/, /Consolidar o Silo do plano/, /Completar sustentações e SERP/,
  /Ações do Assunto/, /Fechar “Melhorar publicados”/, /Ir para Artigos novos/, /Buscar keywords da cor/, /Buscar keywords novas no Google Ads/, /Refazer mesmo assim/];

/** Os botões visíveis da área de ações da aba Artigos (a barra e as operações das linhas do plano). */
export function botoesDaArea(container: HTMLElement): HTMLButtonElement[] {
  const area = [container.querySelector("[data-testid='architect-articles-formation-actions']"), container.querySelector("[data-testid='architect-plan-operations']"), container.querySelector("[data-testid='architect-article-improvement']")];
  return area.flatMap(parte => parte ? [...parte.querySelectorAll<HTMLButtonElement>("button")] : []).filter(botao => !botao.closest("[hidden]"));
}
