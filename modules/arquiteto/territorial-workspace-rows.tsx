"use client";

import React from "react";
import type { TerritorialGroup, TerritorialHeaderRow, TerritorialKeywordRow, TerritorialSurface } from "@/lib/arquiteto/territorial-surface";
import type { TerritorialProcessCell } from "@/lib/arquiteto/territorial-review";

/**
 * Projeção territorial das linhas da planilha do Arquiteto (modo Silos).
 *
 * Recebe o row-model pronto — nenhuma regra de domínio vive aqui. Compartilha a
 * mesa/shell da tabela: não é uma segunda planilha, é outra projeção de linha.
 *
 * A unidade é Territory/estrutura → KeywordDNA. Semântica de Article (artigo em
 * formação, keyword principal, definição do artigo) não é projetada nesta aba.
 */

/**
 * Cabeçalho e linhas compartilham ESTE grid, não o colgroup de Article: as
 * colunas territoriais são outras. Alinhamento garantido por template único.
 */
const TERRITORIAL_GRID =
  "grid grid-cols-[minmax(13rem,1.7fr)_6rem_minmax(10rem,1.1fr)_7rem_minmax(11rem,1.2fr)_8rem_10rem] items-baseline gap-x-4";

/** Ordem canônica das colunas territoriais. */
const TERRITORIAL_COLUMNS = [
  "Unidade",
  "Origem",
  "Página / Slug",
  "Estado",
  "Processamento",
  "Decisão",
  "Status",
] as const;

const GROUP_LABELS: Record<TerritorialGroup["kind"], string> = {
  existing_structures: "Estruturas existentes",
  territories: "Silos",
  unassigned: "Sem silo",
  ambiguous: "Ambíguas · em revisão",
  inconsistent: "Inconsistências",
};

const STATE_LABELS: Record<string, string> = {
  // Vale para silo candidato e para estrutura existente: para o usuário, os
  // dois são Silo. "Em estrutura existente" mentia sobre o silo recém-criado.
  existing_silo_match: "Associada ao silo",
  expand_existing_silo: "Pode fortalecer estrutura",
  new_silo_candidate: "Candidata a novo silo",
  ambiguous_silo: "Ambígua",
  conflicting_silo: "Em conflito",
  unassigned: "Sem silo",
};

/**
 * Rótulos de UI para a origem. Só existe entrada para fonte que o read-model
 * realmente produz — inventar "Site / Sitemap" aqui anunciaria uma fonte que
 * ainda não é lida. Valor desconhecido atravessa verbatim.
 */
const ORIGIN_LABELS: Record<string, string> = {
  silo_dna: "Arquiteto",
  silo_page: "Arquiteto",
  territory_record: "Arquiteto",
  article_dna: "Arquiteto",
  published_keyword: "Publicado",
  brand_registry: "Cadastro da Marca",
  // Um label curto por linha: "Site / Sitemap" repetido em várias colunas
  // virava ruído sem informar nada a mais.
  site_catalog: "Site",
  "silo_dna+site_catalog": "Arquiteto + Site / Sitemap",
  "published_keyword+site_catalog": "Publicado + Site / Sitemap",
  "brand_registry+site_catalog": "Cadastro da Marca + Site / Sitemap",
  existing: "Estrutura existente",
  manual_strategic: "Manual",
  discovered: "Detectado",
};

/** Rótulo honesto por procedência do slug. */
const SLUG_LABELS: Record<string, string> = {
  page: "Página",
  // Identidade já no ar; o Arquiteto não a propõe nem a altera.
  published: "Página publicada",
  confirmed: "Slug confirmado",
  proposal: "Slug proposto",
  none: "Slug",
};

const STATUS_LABELS: Record<string, string> = {
  candidate: "Candidato",
  confirmed: "Confirmado",
  consolidated: "Consolidado",
  rejected: "Rejeitado",
  superseded: "Substituído",
  archived: "Arquivado",
  publicado: "Publicado",
  recebida: "Recebida",
  // O status é da KEYWORD, não do silo: "aprovado" é decisão da mineração e
  // não promete formação de artigo, que agora depende de Silo confirmado.
  aprovado: "Aprovada na mineração",
};

/**
 * Frase humana para cada bloqueio de confirmação.
 *
 * O código do domínio continua sendo a verdade; aqui ele vira pergunta que a
 * pessoa consegue responder. Código sem frase aparece como está, em vez de
 * sumir da tela.
 */
const BLOCKER_LABELS: Record<string, string> = {
  EMPTY_TERRITORY: "o silo ainda não tem nenhuma keyword;",
  TERRITORY_WITHOUT_KEYWORDS: "o silo ainda não tem nenhuma keyword;",
  TERRITORY_WITHOUT_CENTRAL_ENTITY: "falta definir a entidade central;",
  TERRITORY_WITHOUT_MACRO_INTENT: "falta definir a intenção macro;",
  TERRITORY_WITHOUT_BOUNDARY: "falta definir o que entra na fronteira;",
  TERRITORY_NARRATIVE_UNRESOLVED: "falta resolver a narrativa (continuidade e alinhamento com a marca);",
  TERRITORY_WITHOUT_DECISION: "o silo não está num estado que permita confirmar;",
  ORPHAN_TERRITORY_REF: "há keyword apontando para um silo que não existe;",
  UNASSIGNED_WITHOUT_REASON: "há keyword sem silo e sem motivo registrado;",
  DUPLICATE_EXISTING_SILO_ANCHOR: "duas âncoras apontam para o mesmo silo existente;",
  CROSS_BRAND_MEMBERSHIP: "há keyword de outra marca associada;",
  PUBLISHED_PROTECTION_VIOLATION: "a mudança fere a proteção de página publicada;",
  PARTIAL_MEMBERSHIP_OPERATION: "há operação de membership pela metade;",
  DUPLICATE_KEYWORD_MEMBERSHIP: "há keyword associada a mais de um silo;",
  TERRITORIAL_CONFLICT_OPEN: "há conflito de silo em aberto;",
};

const blockerLabel = (blocker: { code: string; detail: string | null }) =>
  BLOCKER_LABELS[blocker.code] || blocker.detail || blocker.code;

const stateLabel = (value: string | null) => (value ? GROUP_LABELS[value as TerritorialGroup["kind"]] ?? STATE_LABELS[value] ?? value : "—");
const originLabel = (value: string | null) => (value ? ORIGIN_LABELS[value] ?? value : null);
const statusLabel = (value: string | null) => (value ? STATUS_LABELS[value] ?? value : null);

/** Célula que não inventa dado: ausência vira travessão, nunca texto plausível. */
function Cell({ value, className = "" }: { value: string | null; className?: string }) {
  const text = value && value.trim() ? value : "—";
  return (
    <span className={`truncate ${value ? className : "text-text-muted"}`} title={text}>
      {text}
    </span>
  );
}

/**
 * Cabeçalho do modo Silos. Vive na MESMA `<thead>` da planilha; o modo Artigos
 * e o modo Links mantêm os seus cabeçalhos intactos.
 */
export function TerritorialWorkspaceHeader({ selectAll = null }: {
  /** §8 — "selecionar todos" do lote; ausente = tabela sem seleção. */
  selectAll?: { checked: boolean; onChange: (marcar: boolean) => void } | null;
} = {}) {
  return (
    <tr className="text-xs font-semibold text-text-muted" data-testid="architect-territorial-head">
      <th colSpan={99} className="border-b border-divider px-3 py-2 text-left">
        <div className={TERRITORIAL_GRID}>
          {TERRITORIAL_COLUMNS.map((column, index) => (
            <span key={column} className="flex min-w-0 items-center gap-2 truncate">
              {index === 0 && selectAll && (
                <input
                  type="checkbox"
                  checked={selectAll.checked}
                  onChange={event => selectAll.onChange(event.target.checked)}
                  aria-label="Selecionar todas as keywords do lote"
                  data-testid="architect-keyword-select-all"
                  className="h-3.5 w-3.5 shrink-0 accent-module-accent"
                />
              )}
              <span className="truncate">{column}</span>
            </span>
          ))}
        </div>
      </th>
    </tr>
  );
}

/**
 * Linha da página do Silo — unidade editorial própria dentro da MESMA mesa.
 *
 * É a raiz do universo, não um artigo nem uma keyword: por isso ganha badge e
 * superfície próprias. Usa os tokens do design system; nenhuma paleta nova, e
 * nada de roxo/violeta/índigo.
 */
/**
 * Alvos que não são um silo existente. Sentinelas explícitas porque string
 * vazia no `<select>` já significa "nada escolhido".
 */
const TARGET_NONE = "none";
const TARGET_NEW = "new";

/** Contexto do grupo, para a linha citar o vínculo sem repeti-lo em colunas. */
type GroupContext = {
  origin: string | null;
  label: string | null;
  status: string | null;
};

/** Decisão humana de Silo para uma keyword. */
export type SiloAssignmentControls = {
  territories: { territoryRef: string; label: string }[];
  structures: { siloId: string; label: string }[];
  busyKeywordId: string | null;
  onAssign: (
    keywordId: string,
    target: { kind: "territory"; territoryRef: string } | { kind: "existing_structure"; siloId: string } | { kind: "unassigned" },
  ) => void;
  onCreateSilo: () => void;
};

/** Promoção humana de página publicada a silo candidato. */
export type SiteStructureControls = {
  busyUrl: string | null;
  onUseAsSilo: (normalizedUrl: string) => void;
};

/** Confirmação humana do universo. Não consolida SiloDNA nem SiloPage. */
export type SiloConfirmationControls = {
  busyRef: string | null;
  onConfirm: (territoryRef: string) => void;
  /** Abre a definição do contexto — sem ela o silo nunca fica confirmável. */
  onDefineContext: (territoryRef: string) => void;
};

/** Processamento em uma célula: quatro naturezas, sem parágrafo. */
function ProcessCells({ cells }: { cells: readonly TerritorialProcessCell[] }) {
  if (!cells.length) return <span className="truncate text-text-muted">—</span>;
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2" data-testid="architect-process-cells">
      {cells.map(cell => (
        <span
          key={cell.process}
          title={`${cell.label}: ${cell.detail}`}
          // `stale`/erro precisa ser VISÍVEL, não só tooltip: é o aviso de que
          // existe algo a reexecutar antes de decidir.
          className={cell.tone === "ok" ? "text-success" : cell.tone === "warn" ? "text-warning" : "text-text-muted"}
        >
          {cell.label} {cell.tone === "ok" ? "✓" : cell.tone === "warn" ? "!" : "—"}
        </span>
      ))}
    </span>
  );
}

function SiloPageRow({
  header,
  siteControls,
  confirmControls,
  processing,
  decisionLabel,
  details,
}: {
  header: TerritorialHeaderRow;
  siteControls?: SiteStructureControls | null;
  confirmControls?: SiloConfirmationControls | null;
  processing?: readonly TerritorialProcessCell[];
  decisionLabel?: string | null;
  /** Evidência longa vive aqui, não na linha principal. */
  details?: readonly { label: string; value: string }[];
}) {
  // Estrutura observada no site NÃO é a página do silo: o badge separa as duas
  // sem esconder nenhuma. O que distingue é o TIPO, não a origem: um silo
  // promovido do site continua sendo Silo, com procedência Site.
  const observadaNoSite = header.kind === "structure" && header.origin === "site_catalog";
  const [aberto, setAberto] = React.useState(false);
  const slugKind = header.slugKind ?? "none";
  return (
    <>
      <tr data-testid={observadaNoSite ? "architect-site-structure-row" : "architect-silo-page-row"} className="border-b border-divider/60 bg-module-accent/5">
        <td colSpan={99} className="px-3 py-2">
          <div className={`${TERRITORIAL_GRID} text-sm`}>
            {/* Unidade */}
            <span className="flex min-w-0 items-baseline gap-2">
              <button
                type="button"
                onClick={() => setAberto(valor => !valor)}
                data-testid="architect-row-expand"
                aria-expanded={aberto}
                className="shrink-0 text-text-muted transition-colors hover:text-foreground"
              >
                {aberto ? "▾" : "▸"}
              </button>
              <span className="shrink-0 rounded border border-module-accent/50 bg-module-accent/10 px-1.5 text-xs font-bold uppercase tracking-widest text-module-accent">
                {observadaNoSite ? "Estrutura" : "Silo"}
              </span>
              <span className="truncate font-semibold text-foreground" title={header.label}>{header.label}</span>
            </span>
            {/* Origem — uma vez só na linha. */}
            <Cell value={originLabel(header.origin)} />
            {/* Página / Slug, com procedência do slug ao lado. */}
            <span className="flex min-w-0 items-baseline gap-1.5" data-testid="architect-structure-page">
              <span className="truncate text-foreground" title={header.slug || "—"}>{header.slug || "—"}</span>
              {header.slug && (
                <span className={`shrink-0 text-xs ${slugKind === "published" || slugKind === "page" ? "text-positive-soft" : "text-text-muted"}`}>
                  {slugKind === "published" || slugKind === "page" ? "Publicada" : "Proposto"}
                </span>
              )}
            </span>
            {/* Estado do PRÓPRIO objeto. */}
            <Cell
              value={observadaNoSite ? "Disponível" : statusLabel(header.lifecycleStatus)}
              className="text-foreground"
            />
            {/* Processamento */}
            <ProcessCells cells={processing || []} />
            {/* Decisão humana — recomendação de SERP/IA não entra aqui. */}
            <span
              className={`truncate ${decisionLabel === "Registrada" ? "text-success" : "text-text-muted"}`}
              data-testid="architect-silo-decision"
            >
              {decisionLabel || "—"}
            </span>
            {/* Status */}
            <span className={`truncate ${header.isPublished ? "text-positive-soft" : "text-text-muted"}`} data-testid="architect-structure-protection">
              {header.isPublished ? "Publicado · protegido" : "Sem publicação"}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {header.confirmation && confirmControls && (
              <button
                type="button"
                onClick={() => confirmControls.onConfirm(header.ref)}
                disabled={!header.confirmation.ready || Boolean(confirmControls.busyRef)}
                title={header.confirmation.ready ? "Confirmar este silo" : header.confirmation.blockers.map(blockerLabel).join(" ")}
                data-testid="architect-confirm-silo"
                className="min-h-8 rounded border border-positive-soft/45 px-2.5 text-sm font-semibold text-positive-soft transition-colors hover:bg-positive-soft/10 disabled:opacity-40"
              >
                {confirmControls.busyRef === header.ref ? "Confirmando…" : "Confirmar Silo"}
              </button>
            )}
            {header.confirmation && confirmControls && (
              <button
                type="button"
                onClick={() => confirmControls.onDefineContext(header.ref)}
                data-testid="architect-define-silo-context"
                className="min-h-8 rounded border border-divider px-2.5 text-sm font-medium text-text-muted transition-colors hover:border-module-accent/40 hover:text-foreground"
              >
                Definir contexto
              </button>
            )}
            {observadaNoSite && siteControls && (
              <button
                type="button"
                onClick={() => siteControls.onUseAsSilo(header.ref)}
                disabled={Boolean(siteControls.busyUrl)}
                data-testid="architect-use-as-silo"
                className="min-h-8 rounded border border-module-accent/40 px-2.5 text-sm font-semibold text-module-accent transition-colors hover:bg-module-accent/10 disabled:opacity-40"
              >
                {siteControls.busyUrl === header.ref ? "Usando…" : "Usar como Silo"}
              </button>
            )}
          </div>
        </td>
      </tr>
      {aberto && (
        <tr data-testid="architect-row-details" className="border-b border-divider/60 bg-surface-subtle">
          <td colSpan={99} className="px-3 py-2">
            <dl className="grid gap-x-6 gap-y-1 text-sm leading-6 sm:grid-cols-2">
              {(details || []).map(item => (
                <div key={item.label} className="flex min-w-0 gap-2">
                  <dt className="shrink-0 text-text-muted">{item.label}:</dt>
                  <dd className="min-w-0 break-words text-foreground">{item.value}</dd>
                </div>
              ))}
              {header.canonical && (
                <div className="flex min-w-0 gap-2">
                  <dt className="shrink-0 text-text-muted">Canonical:</dt>
                  <dd className="min-w-0 break-words text-foreground">{header.canonical}</dd>
                </div>
              )}
              <div className="flex min-w-0 gap-2">
                <dt className="shrink-0 text-text-muted">Conteúdo:</dt>
                <dd className="text-foreground" data-testid="architect-silo-page-counts">{header.keywordCount} keyword(s) · {header.articleCount} artigo(s)</dd>
              </div>
            </dl>
            {header.confirmation && !header.confirmation.ready && header.confirmation.blockers.length > 0 && (
              <p className="mt-1 text-sm leading-6 text-text-muted" data-testid="architect-confirm-blockers">
                Falta para confirmar: {header.confirmation.blockers.map(blockerLabel).join(" ")}
              </p>
            )}
            <p className="mt-1 text-sm leading-6 text-text-muted">
              {observadaNoSite
                ? "Página observada no site; relação com silo ainda não definida."
                : `${SLUG_LABELS[slugKind]} · página raiz do universo editorial deste silo.`}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function SiloDecisionControl({ row, controls }: { row: TerritorialKeywordRow; controls: SiloAssignmentControls }) {
  const [choice, setChoice] = React.useState("");
  const busy = controls.busyKeywordId === row.keywordId;
  const disabled = busy || Boolean(controls.busyKeywordId);

  const apply = () => {
    if (!choice) return;
    if (choice === TARGET_NEW) { controls.onCreateSilo(); return; }
    if (choice === TARGET_NONE) { controls.onAssign(row.keywordId, { kind: "unassigned" }); return; }
    const [prefix, ...rest] = choice.split("|");
    const value = rest.join("|");
    if (prefix === "t") controls.onAssign(row.keywordId, { kind: "territory", territoryRef: value });
    else if (prefix === "s") controls.onAssign(row.keywordId, { kind: "existing_structure", siloId: value });
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <select
        value={choice}
        disabled={disabled}
        onChange={event => setChoice(event.target.value)}
        aria-label={`Escolher silo para ${row.keywordId}`}
        data-testid="architect-silo-choice"
        className="min-h-8 rounded border border-divider bg-surface px-2 text-sm text-foreground disabled:opacity-50"
      >
        <option value="">Escolher silo…</option>
        {controls.territories.length > 0 && (
          <optgroup label="Silos">
            {controls.territories.map(item => (
              <option key={item.territoryRef} value={`t|${item.territoryRef}`}>{item.label}</option>
            ))}
          </optgroup>
        )}
        {controls.structures.length > 0 && (
          <optgroup label="Estruturas existentes">
            {controls.structures.map(item => (
              <option key={item.siloId} value={`s|${item.siloId}`}>{item.label}</option>
            ))}
          </optgroup>
        )}
        <option value={TARGET_NONE}>Manter sem silo</option>
        <option value={TARGET_NEW}>Criar novo silo…</option>
      </select>
      <button
        type="button"
        onClick={apply}
        disabled={disabled || !choice}
        data-testid="architect-silo-apply"
        className="min-h-8 rounded border border-module-accent/40 px-2.5 text-sm font-semibold text-module-accent transition-colors hover:bg-module-accent/10 disabled:opacity-40"
      >
        {busy ? "Aplicando…" : "Aplicar"}
      </button>
      {/* Sugestão é sugestão: aparece, não seleciona. */}
      {row.hypothesis?.state === "existing_silo_match" && (
        <span className="text-sm text-text-muted" data-testid="architect-silo-suggestion">
          Sugestão da Lógica: {row.hypothesis.evidence[0] || "afinidade registrada"}
        </span>
      )}
    </div>
  );
}

/** Fato atual, hipótese e decisão humana precisam ser visualmente distintos. */
function KeywordRow({
  row,
  keywordLabel,
  keywordLabelFor,
  context,
  controls,
  proposed,
  selection,
  dna,
  expandida = false,
  onToggleExpand,
}: {
  row: TerritorialKeywordRow;
  keywordLabel: string;
  keywordLabelFor: (keywordId: string) => string;
  context: GroupContext;
  controls: SiloAssignmentControls | null;
  proposed?: ProposedDestination | null;
  selection?: KeywordSelectionControls | null;
  dna?: KeywordDnaInspection | null;
  expandida?: boolean;
  onToggleExpand?: (keywordId: string) => void;
}) {
  const hypothesis = row.hypothesis;
  const head = hypothesis?.headKeywordId ?? null;
  const hypothesisLabel = !hypothesis
    ? "—"
    : hypothesis.universeRole === "context_of_new_silo" && head
      ? `Relacionado ao silo candidato ${keywordLabelFor(head)}`
      : hypothesis.universeRole === "narrative_head"
        ? `Candidata a novo silo: ${keywordLabel}`
        : stateLabel(hypothesis.state);
  // Sem território declarado não há origem nem status a herdar do grupo.
  const hasMembership = Boolean(row.territoryRef || row.existingSiloId);
  return (
    <tr data-testid="architect-territorial-keyword-row" className="border-b border-divider/60">
      <td colSpan={99} className="px-3 py-2">
        <div className={`${TERRITORIAL_GRID} text-sm`}>
          {/* Unidade */}
          <span className="flex min-w-0 items-center gap-2">
            {selection && (
              <input
                type="checkbox"
                checked={selection.selected.has(row.keywordId)}
                onChange={() => selection.onToggle(row.keywordId)}
                aria-label={`Selecionar ${keywordLabel}`}
                data-testid="architect-keyword-select"
                className="h-3.5 w-3.5 shrink-0 accent-module-accent"
              />
            )}
            {onToggleExpand && (
              <button
                type="button"
                onClick={() => onToggleExpand(row.keywordId)}
                aria-expanded={expandida}
                aria-label={`${expandida ? "Recolher" : "Expandir"} KeywordDNA de ${keywordLabel}`}
                data-testid="architect-keyword-expand"
                className="shrink-0 rounded px-1 text-xs text-text-muted transition-colors hover:text-foreground"
              >
                {expandida ? "▾" : "▸"}
              </button>
            )}
            <span className="shrink-0 rounded border border-divider px-1.5 text-xs font-bold uppercase tracking-widest text-text-muted">Keyword</span>
            <span className="truncate font-medium text-keyword" title={keywordLabel}>{keywordLabel}</span>
          </span>
          {/* Origem da keyword é o Minerador; o silo aparece no detalhe. */}
          <Cell value="Minerador" />
          {/* Keyword não tem página própria. */}
          <Cell value={null} />
          <Cell value={stateLabel(row.membershipState)} className="text-foreground" />
          {/* Processamento é do silo, não da keyword. */}
          <Cell value={null} />
          {/* Só decisão HUMANA conta nesta coluna. */}
          <span
            className={`truncate ${row.decisionSource === "human" ? "text-success" : "text-text-muted"}`}
            data-testid="architect-territorial-decision"
          >
            {row.decisionSource === "human"
              ? row.membershipState === "unassigned" ? "Mantida sem silo" : "Registrada"
              : "Pendente"}
          </span>
          {/* Status da própria keyword. O "publicado" do silo é do silo. */}
          <Cell value={statusLabel(row.keywordStatus)} />
        </div>
        {/* Vínculo e hipótese saem da linha principal: uma linha, uma leitura. */}
        {(hasMembership || hypothesis) && (
          <p className="mt-1 text-sm leading-6 text-text-muted" data-testid="architect-keyword-detail">
            {hasMembership && context.label ? `Silo: ${context.label}` : ""}
            {hasMembership && context.label && hypothesis ? " · " : ""}
            {hypothesis ? <span className="text-warning" data-testid="architect-territorial-hypothesis">{hypothesisLabel}</span> : null}
          </p>
        )}
        {proposed && (
          <p className="mt-1 text-sm leading-6" data-testid="architect-keyword-proposed">
            <span className="text-text-muted">Atual: </span>
            <span className="text-foreground">{hasMembership && context.label ? context.label : "Sem silo"}</span>
            <span className="text-text-muted"> · Proposto: </span>
            <span className="font-semibold text-module-accent">{proposed.silo}</span>
            <span className="text-text-muted"> · {proposed.status}</span>
            {proposed.basis ? <span className="block text-text-muted">Base: {proposed.basis}</span> : null}
          </p>
        )}
        {row.decisionReason ? <p className="mt-1 text-sm leading-6 text-text-muted">{row.decisionReason}</p> : null}
        {expandida && dna && (
          <div
            className="mt-2 grid gap-3 rounded border border-module-accent/30 bg-surface p-3 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="architect-keyword-dna-panel"
          >
            <DnaBloco titulo="Identidade" linhas={dna.identidade} />
            <DnaBloco titulo="Estratégia" linhas={dna.estrategia} />
            <DnaBloco titulo="Semântica" linhas={dna.semantica} />
            <DnaBloco titulo="Arquitetura" linhas={dna.arquitetura} />
            <DnaBloco titulo="Proveniência" linhas={dna.proveniencia} />
            {/* §10 — leitura. O Arquiteto não reescreve o DNA do Minerador. */}
            <p className="text-sm leading-6 text-text-muted sm:col-span-2 lg:col-span-3">
              KeywordDNA é somente leitura aqui: ele vem do Minerador e o Arquiteto não o reescreve.
              Dado incorreto se corrige na origem.
            </p>
          </div>
        )}
        {expandida && !dna && (
          <p className="mt-2 text-sm leading-6 text-warning" data-testid="architect-keyword-dna-missing">
            Esta keyword não trouxe KeywordDNA canônico do Minerador.
          </p>
        )}
        {controls ? <SiloDecisionControl row={row} controls={controls} /> : null}
      </td>
    </tr>
  );
}

/**
 * §5 — O DESTINO PROPOSTO, POR KEYWORD.
 *
 * A row lia só a membership gravada, então depois de processar ela
 * continuava dizendo "Sem silo" para as nove — enquanto o resumo já
 * mostrava a proposta com nove destinos. Duas leituras da mesma tela.
 *
 * Isto NÃO finge que a associação foi aprovada: o estado atual continua
 * onde estava, e a proposta aparece ao lado, marcada como pendente.
 */
export type ProposedDestination = { silo: string; status: string; basis?: string };

/**
 * §8 — SELEÇÃO NA ABA SILOS É INSPEÇÃO, NÃO ESCOPO DE PROCESSAMENTO.
 *
 * `Processar arquitetura` continua lendo o LOTE INTEIRO: ele precisa enxergar
 * as fronteiras entre todas as keywords para decidir onde uma começa e a outra
 * acaba. A seleção serve para a pessoa inspecionar e para as ações operacionais
 * que vierem depois — nunca para quebrar a visão global do motor.
 */
export type KeywordSelectionControls = {
  selected: ReadonlySet<string>;
  onToggle: (keywordId: string) => void;
  onToggleAll: (keywordIds: readonly string[], marcar: boolean) => void;
};

/**
 * §9/§10 — O KEYWORDDNA COMO LEITURA.
 *
 * O Arquiteto não reescreve o DNA recebido do Minerador. Este painel existe
 * para a pessoa CONFERIR em que dado a proposta se apoiou; dado errado é
 * problema upstream, e se resolve no Minerador.
 */
export type KeywordDnaInspection = {
  identidade: { label: string; value: string }[];
  estrategia: { label: string; value: string }[];
  semantica: { label: string; value: string }[];
  arquitetura: { label: string; value: string }[];
  proveniencia: { label: string; value: string }[];
};

function DnaBloco({ titulo, linhas }: { titulo: string; linhas: { label: string; value: string }[] }) {
  if (!linhas.length) return null;
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-widest text-module-accent">{titulo}</p>
      <dl className="mt-1 grid gap-0.5">
        {linhas.map(linha => (
          <div key={linha.label} className="flex flex-wrap gap-1.5 text-sm leading-6">
            <dt className="text-text-muted">{linha.label}:</dt>
            <dd className="min-w-0 break-words font-medium text-foreground">{linha.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Cabeçalho de SEÇÃO — um por tipo, não um por registro. */
function SectionRow({
  kind,
  count,
  collapsed,
  onToggle,
}: {
  kind: TerritorialGroup["kind"];
  count: number;
  collapsed: boolean;
  onToggle: (() => void) | null;
}) {
  return (
    <tr data-testid="architect-territorial-section" className="bg-surface-subtle">
      <td colSpan={99} className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3">
          <span className="text-sm font-bold uppercase tracking-widest text-warning">
            {GROUP_LABELS[kind]} · {count}
          </span>
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              data-testid="architect-section-toggle"
              className="min-h-7 rounded border border-divider px-2 text-sm text-text-muted transition-colors hover:text-foreground"
            >
              {collapsed ? "Expandir" : "Recolher"}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function TerritorialWorkspaceRows({
  surface,
  keywordLabelFor,
  controls = null,
  siteControls = null,
  confirmControls = null,
  processingByRef = null,
  decisionByRef = null,
  detailsByRef = null,
  proposedByKeywordId = null,
  selection = null,
  dnaByKeywordId = null,
}: {
  surface: TerritorialSurface;
  /** Texto da KeywordDNA; o componente não vai buscar dado por conta própria. */
  keywordLabelFor: (keywordId: string) => string;
  /** Ausente = leitura pura; presente = decisão humana habilitada. */
  controls?: SiloAssignmentControls | null;
  /** Ação de promover página publicada a silo candidato. */
  siteControls?: SiteStructureControls | null;
  /** §5 — destino que a working proposal dá a cada keyword. */
  proposedByKeywordId?: ReadonlyMap<string, ProposedDestination> | null;
  /** §8 — seleção para inspeção; NÃO limita o processamento arquitetural. */
  selection?: KeywordSelectionControls | null;
  /** §9 — o KeywordDNA de cada keyword, para o painel expandido. */
  dnaByKeywordId?: ReadonlyMap<string, KeywordDnaInspection> | null;
  /** Ação de confirmar o silo. */
  confirmControls?: SiloConfirmationControls | null;
  /** Estados dos quatro processos por silo; read-model de UI. */
  processingByRef?: ReadonlyMap<string, readonly TerritorialProcessCell[]> | null;
  /** Decisão HUMANA por silo. Recomendação de SERP/IA não entra aqui. */
  decisionByRef?: ReadonlyMap<string, string> | null;
  /** Evidência longa, exibida só na expansão. */
  detailsByRef?: ReadonlyMap<string, readonly { label: string; value: string }[]> | null;
}) {
  // Recolher é conveniência de leitura: nenhum dado sai da mesa nem da busca.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  /* §9 — a expansão é da tela: nada aqui muda dado nenhum. */
  const [expandidas, setExpandidas] = React.useState<Set<string>>(new Set());
  const alternarExpansao = React.useCallback((keywordId: string) => {
    setExpandidas(anterior => {
      const proximo = new Set(anterior);
      if (proximo.has(keywordId)) proximo.delete(keywordId); else proximo.add(keywordId);
      return proximo;
    });
  }, []);

  if (surface.emptyState.isEmpty) {
    return (
      <tr data-testid="architect-territorial-empty">
        <td colSpan={99} className="px-3 py-6 text-sm leading-6 text-text-muted">
          {surface.emptyState.message}
        </td>
      </tr>
    );
  }

  // Uma seção por tipo, preservando a ordem em que a superfície entregou.
  const sections: Array<{ kind: TerritorialGroup["kind"]; groups: TerritorialGroup[] }> = [];
  for (const group of surface.groups) {
    const current = sections.find(section => section.kind === group.kind);
    if (current) current.groups.push(group);
    else sections.push({ kind: group.kind, groups: [group] });
  }

  return (
    <>
      {sections.map(section => {
        // A contagem da seção é do que ela realmente organiza: silos e
        // estruturas contam registros; grupos de keyword contam keywords.
        const isStructural = section.kind === "existing_structures" || section.kind === "territories";
        const count = isStructural
          ? section.groups.length
          : section.groups.reduce((total, group) => total + group.rows.length, 0);
        const isCollapsed = collapsed.has(section.kind);
        return (
          <React.Fragment key={section.kind}>
            <SectionRow
              kind={section.kind}
              count={count}
              collapsed={isCollapsed}
              onToggle={section.kind === "existing_structures"
                ? () => setCollapsed(previous => {
                  const next = new Set(previous);
                  if (next.has(section.kind)) next.delete(section.kind);
                  else next.add(section.kind);
                  return next;
                })
                : null}
            />
            {!isCollapsed && section.groups.map((group, index) => {
              const header = group.header;
              const context: GroupContext = {
                origin: originLabel(header?.origin ?? null),
                label: header?.label ?? null,
                status: statusLabel(header ? (header.isPublished ? "publicado" : header.lifecycleStatus) : null),
              };
              return (
                <React.Fragment key={`${group.kind}:${header?.ref ?? index}`}>
                  {header && (
                    <SiloPageRow
                      header={header}
                      siteControls={siteControls}
                      confirmControls={confirmControls}
                      processing={processingByRef?.get(header.ref)}
                      decisionLabel={decisionByRef?.get(header.ref) ?? null}
                      details={detailsByRef?.get(header.ref)}
                    />
                  )}
                  {group.rows.map(row => (
                    <KeywordRow
                      key={`${group.kind}:${row.keywordId}`}
                      row={row}
                      keywordLabel={keywordLabelFor(row.keywordId)}
                      keywordLabelFor={keywordLabelFor}
                      context={context}
                      controls={controls}
                      proposed={proposedByKeywordId?.get(row.keywordId) ?? null}
                      selection={selection}
                      dna={dnaByKeywordId?.get(row.keywordId) ?? null}
                      expandida={expandidas.has(row.keywordId)}
                      onToggleExpand={alternarExpansao}
                    />
                  ))}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}
