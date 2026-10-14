import type { ApproveAndSendDeps, ApproveAndSendEntry, ApproveAndSendLine, ApproveAndSendResult, ApproveAndSendRow } from "../minerador/approve-and-send-core.ts";
import { approvalBlockerLabel } from "../minerador/approval-blockers.ts";
import { approvedPackageDiverged, readApprovalRecord } from "../minerador/approved-package.ts";
import { EDITORIAL_GROUP_COLORS, isEditorialGroupColor, type EditorialGroupColor } from "../editorial/editorial-groups.ts";

/**
 * "IMPORTAR DO MINERADOR" NO ARQUITETO — LISTA LEVE E O MESMO CAMINHO DO
 * "APROVAR E ENVIAR" (pedido do dono, 2026-10-13; SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, itens 1, 2 e 6).
 *
 * O modal abria recarregando a mesa INTEIRA do Arquiteto (MB de ArticleDNA,
 * pareceres de SERP e pacotes aprovados) só para listar nomes, e escondia as
 * keywords não aprovadas: na WifiConecta as 58 aprovadas já estavam no
 * Arquiteto e as 6 que faltavam (brutas) nem apareciam — não havia o que
 * marcar. E, quando havia, o envio de sempre recusava o lote inteiro (409) por
 * uma keyword só, com o aviso escondido atrás do modal.
 *
 * Aqui fica só a parte pura:
 * - a lista leve: id, keyword, grupo, status e um estado curto por linha;
 * - o portão é o do "Aprovar e enviar" (`previewApproveAndSend` sobre a
 *   leitura do Minerador e o handoff parcial do Arquiteto) — este arquivo só
 *   traduz as linhas dele para o estado curto da lista;
 * - a escolha por cor e o progresso por etapa.
 *
 * F4 · O ARQUITETO SÓ LÊ (SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 2; D2): o modal NÃO aprova. A etapa de aprovar fica SEMPRE fechada
 * (`withoutArquitetoApproval`): só importa o que já está aprovado; a que
 * precisa de aprovação fica "precisa aprovar no Minerador" e o botão
 * "Aprovar no Minerador (N)" abre o "Aprovar e enviar" do Minerador, filtrado
 * na cor, com as linhas marcadas. Nada de cliente operacional (service role).
 */

/**
 * `refresh` (2026-10-14, caso WifiConecta, azul): já está no Arquiteto, mas o
 * Minerador tem um pacote aprovado MAIS NOVO (reaprovada depois do envio, por
 * exemplo com Assunto e plano). Importar atualiza o item recebido com o pacote
 * vigente — leitura do que o Minerador decidiu; as decisões do Arquiteto ficam.
 */
export type ArquitetoImportState = "send" | "refresh" | "approve_in_minerador" | "in_arquiteto" | "out";

export type ArquitetoImportItem = {
  id: string;
  keyword: string;
  groupId: string | null;
  /** Status no Minerador, em minúsculas ("aprovado", "bruto", …). */
  status: string;
  state: ArquitetoImportState;
  /** Motivo curto de "fora"; `null` nos outros estados. */
  reason: string | null;
  /** Motivo inteiro, só quando difere do curto (fica para o "expandir"). */
  detail: string | null;
};

/** Os campos de cada linha — nada além disto sai para o navegador. */
export const ARQUITETO_IMPORT_ITEM_FIELDS = ["id", "keyword", "groupId", "status", "state", "reason", "detail"] as const;

/** Quantas keywords passam pelo portão numa leitura (o mesmo teto da rota do Minerador). */
export const ARQUITETO_IMPORT_GATE_LIMIT = 500;

export type ArquitetoImportPoolRow = {
  id: string;
  keyword: string;
  status: string | null;
  group_id: string | null;
  /** `analise_semantica->aprovacao->>contentHash`, lido por caminho JSON (só o texto do hash). */
  approval_hash?: string | null;
};

const normalizar = (value: string | null | undefined) => (value || "").trim().toLocaleLowerCase("pt-BR");

/**
 * Pacote novo no Minerador para quem já está no Arquiteto: aprovada (ou
 * publicada) com um registro de aprovação cujo hash difere do pacote que o
 * item recebido carrega. O portão confere o resto (divergência, travas).
 */
export function hasNewerMineradorPackage(input: { status: string | null; approvalHash: string | null | undefined; receivedHash: string | null | undefined }): boolean {
  const status = normalizar(input.status);
  if (status !== "aprovado" && status !== "publicado") return false;
  if (!input.approvalHash) return false;
  return input.approvalHash !== (input.receivedHash ?? null);
}

/**
 * O estado BARATO de cada keyword viva da marca (sem `analise_semantica`):
 * já no Arquiteto (item recebido ou keyword dentro de um ArticleDNA vigente),
 * item em outro estado, rejeitada — e as demais vão ao portão (`gateIds`).
 * A recebida com pacote aprovado mais novo no Minerador também vai ao portão
 * (`refreshCandidateIds`): se ele aceitar, a linha fica "atualiza no Arquiteto".
 */
export function classifyArquitetoImportPool(input: {
  keywords: readonly ArquitetoImportPoolRow[];
  workflowStateByKeywordId: ReadonlyMap<string, string>;
  incorporatedKeywordIds: ReadonlySet<string>;
  /** O hash do pacote aprovado que cada item recebido carrega (`payload->approvedDna->>contentHash`). */
  receivedPackageHashByKeywordId?: ReadonlyMap<string, string | null>;
}): { items: ArquitetoImportItem[]; gateIds: string[]; refreshCandidateIds: string[] } {
  const gateIds: string[] = [];
  const refreshCandidateIds: string[] = [];
  const items = input.keywords.map((row): ArquitetoImportItem => {
    const base = { id: row.id, keyword: row.keyword, groupId: row.group_id || null, status: normalizar(row.status) || "desconhecido", reason: null, detail: null };
    const workflow = input.workflowStateByKeywordId.get(row.id) ?? null;
    if (workflow === "received" && input.receivedPackageHashByKeywordId?.has(row.id) && gateIds.length < ARQUITETO_IMPORT_GATE_LIMIT
      && hasNewerMineradorPackage({ status: row.status, approvalHash: row.approval_hash, receivedHash: input.receivedPackageHashByKeywordId.get(row.id) })) {
      gateIds.push(row.id);
      refreshCandidateIds.push(row.id);
      return { ...base, state: "in_arquiteto" };
    }
    if (input.incorporatedKeywordIds.has(row.id) || workflow === "received") return { ...base, state: "in_arquiteto" };
    if (workflow) return { ...base, state: "out", reason: "item do Arquiteto em outro estado", detail: `O Arquiteto já tem um item desta keyword em outro estado (${workflow}); o envio normal não o sobrescreve.` };
    if (base.status === "rejeitado") return { ...base, state: "out", reason: "rejeitada no Minerador" };
    if (gateIds.length >= ARQUITETO_IMPORT_GATE_LIMIT) return { ...base, state: "out", reason: "não conferida agora (mais de 500)", detail: `A lista confere até ${ARQUITETO_IMPORT_GATE_LIMIT} keywords por vez; importe por cor.` };
    gateIds.push(row.id);
    return { ...base, state: "out", reason: "não conferida" };
  });
  return { items, gateIds, refreshCandidateIds };
}

/* ----------------------- motivo curto (sem frase repetida) ----------------------- */

export const ARQUITETO_IMPORT_APPROVE_IN_MINERADOR_REASON = "Precisa ser aprovada no Minerador: o Arquiteto não aprova. Use “Aprovar no Minerador”, que abre o “Aprovar e enviar” de lá.";
export const ARQUITETO_IMPORT_REAPPROVE_REASON = "Aprovada e alterada depois: precisa ser reaprovada no Minerador (o Arquiteto não aprova). Use “Aprovar no Minerador”.";
const PRECISA_APROVAR_NO_MINERADOR = new Set([ARQUITETO_IMPORT_APPROVE_IN_MINERADOR_REASON, ARQUITETO_IMPORT_REAPPROVE_REASON]);

const ATALHOS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^Precisa ser aprovada no Minerador/, "precisa aprovar no Minerador"],
  [/^Aprovada e alterada depois/, "alterada depois de aprovada: reaprove no Minerador"],
  [/^Não aprovada no Minerador, ou aprovada e alterada depois/, "alterada depois de aprovada: reaprove no Minerador"],
  [/^Já tem um item remoto no Arquiteto/, "item do Arquiteto em outro estado"],
  [/^A aprovação está incompleta para o envio/, "aprovação incompleta: reaprove no Minerador"],
  [/página de destino do Assunto/i, "página de destino do Assunto recusada"],
  [/^A keyword não existe mais nesta marca/, "não existe mais nesta marca"],
  [/^Conteúdo publicado é protegido/, "publicada (protegida)"],
  [/^O envio ao Arquiteto recusou/, "recusada pelo envio"],
];

function encurtar(reason: string): string {
  for (const [padrao, curto] of ATALHOS) if (padrao.test(reason)) return curto;
  const primeira = reason.split(/(?<=\.)\s/)[0].replace(/\.$/, "");
  return primeira.length > 80 ? `${primeira.slice(0, 77).trimEnd()}…` : primeira;
}

/** Uma linha da prévia → o motivo curto e o inteiro. */
export function arquitetoImportReason(line: Pick<ApproveAndSendLine, "missing" | "reasons">): { reason: string; detail: string | null } {
  const faltas = line.missing.map(approvalBlockerLabel);
  // "publicada (protegida): não muda de status" é nota, não motivo, quando há outro.
  const motivos = line.reasons.filter(reason => !/^publicada \(protegida\): não muda de status/.test(reason) || line.reasons.length === 1);
  const curtos = [...faltas, ...motivos.map(encurtar)];
  const reason = [...new Set(curtos)].join(" · ") || "sem motivo informado";
  const inteiro = [...faltas, ...line.reasons].join(" · ");
  return { reason, detail: inteiro && inteiro !== reason ? inteiro : null };
}

/** F4 (D2): a linha do portão que só falta a aprovação — vai ao "Aprovar no Minerador", nunca é aprovada aqui. */
export function arquitetoImportNeedsApprovalInMinerador(line: Pick<ApproveAndSendLine, "action" | "missing" | "reasons">): boolean {
  return line.action === "approve_and_send"
    || (line.action === "blocked" && !line.missing.length && line.reasons.length > 0 && line.reasons.every(reason => PRECISA_APROVAR_NO_MINERADOR.has(reason)));
}

/** Aplica as linhas do portão (`previewApproveAndSend`) às keywords que foram a ele. */
export function applyArquitetoImportGate(
  items: readonly ArquitetoImportItem[],
  gateIds: readonly string[],
  lines: ReadonlyArray<Pick<ApproveAndSendLine, "id" | "action" | "missing" | "reasons" | "alreadyInArquiteto" | "refreshInArquiteto">>,
  refreshCandidateIds: readonly string[] = [],
): ArquitetoImportItem[] {
  const conferidas = new Set(gateIds);
  const candidatasAAtualizar = new Set(refreshCandidateIds);
  const linhaPorId = new Map(lines.map(line => [line.id, line] as const));
  return items.map(item => {
    if (!conferidas.has(item.id)) return item;
    const line = linhaPorId.get(item.id);
    /*
     * Já no Arquiteto, com pacote novo no Minerador: o portão aceitou → "atualiza
     * no Arquiteto (pacote novo)"; recusou → continua "já no Arquiteto", com o
     * motivo no detalhe (o item recebido fica como está).
     */
    if (candidatasAAtualizar.has(item.id)) {
      if (line?.action === "send_only" && line.refreshInArquiteto) return { ...item, state: "refresh" as const, reason: null, detail: ARQUITETO_IMPORT_REFRESH_DETAIL };
      const motivo = line ? arquitetoImportReason(line) : null;
      return { ...item, state: "in_arquiteto" as const, reason: null, detail: `Há pacote aprovado mais novo no Minerador, mas ele não pode vir agora${motivo ? `: ${motivo.reason}` : ""}. O Arquiteto continua com o pacote que já tem.` };
    }
    if (!line) return { ...item, state: "out" as const, reason: "não encontrada", detail: "A keyword não voltou na conferência do servidor." };
    // F4 (D2): a aprovação é do Minerador; a linha que só precisa dela vai ao "Aprovar no Minerador".
    if (arquitetoImportNeedsApprovalInMinerador(line)) {
      return { ...item, state: "approve_in_minerador" as const, reason: "precisa aprovar no Minerador", detail: line.action === "blocked" ? line.reasons[0] : null };
    }
    if (line.action === "send_only") return { ...item, state: line.alreadyInArquiteto ? "in_arquiteto" as const : "send" as const, reason: null, detail: null };
    if (line.action === "blocked") return { ...item, state: "out" as const, ...arquitetoImportReason(line) };
    return { ...item, state: "out" as const, reason: "sem ação de envio", detail: null };
  });
}

/* ------------------------- a aprovação é do Minerador ------------------------- */

/**
 * F4 (D2): o Arquiteto NUNCA aprova. A linha que seria "aprovar e enviar"
 * fica bloqueada com o motivo e vai ao "Aprovar no Minerador"; as já
 * aprovadas seguem pelo envio de sempre (o handoff, que é o Arquiteto
 * receber). É o MESMO encadeamento, com a etapa de aprovar sempre fechada.
 */
export function entriesWithoutArquitetoApproval<E extends ApproveAndSendEntry>(entries: readonly E[]): E[] {
  return entries.map(entry => entry.outcome !== "ready" ? entry : {
    ...entry,
    outcome: "blocked" as const,
    blockers: [normalizar(entry.currentStatus) === "aprovado" ? ARQUITETO_IMPORT_REAPPROVE_REASON : ARQUITETO_IMPORT_APPROVE_IN_MINERADOR_REASON],
    readiness: entry.readiness ? { ...entry.readiness, missing: [] } : null,
  });
}

/** O portão do modal: as dependências do "Aprovar e enviar" com a etapa de aprovar fechada. */
export function withoutArquitetoApproval<Row extends ApproveAndSendRow, Entry extends ApproveAndSendEntry>(
  deps: ApproveAndSendDeps<Row, Entry>,
): ApproveAndSendDeps<Row, Entry> {
  return {
    ...deps,
    entries: rows => entriesWithoutArquitetoApproval(deps.entries(rows)),
    approve: async () => { throw new Error("O Arquiteto não aprova keyword: aprove no Minerador."); },
  };
}

/* ------------------- pacote novo no Minerador (mesa) ------------------- */

/**
 * "PACOTE NOVO NO MINERADOR · N KEYWORDS" (2026-10-14, caso WifiConecta, azul).
 *
 * As keywords recebidas pelo Arquiteto cujo registro de aprovação no Minerador
 * (linha viva, que a mesa já lê) é MAIS NOVO que o pacote guardado no item —
 * reaprovadas depois do envio — e não foram mexidas desde então (assinatura
 * bate). É só leitura: o aviso abre o "Importar do Minerador" já com elas
 * marcadas, que atualiza pelo MESMO núcleo do envio. Custo de leitura zero.
 */
export function mineradorPackageUpdatesOf(rows: ReadonlyArray<Record<string, unknown>>): Array<{ keywordId: string; keyword: string }> {
  const vistos = new Set<string>();
  const saida: Array<{ keywordId: string; keyword: string }> = [];
  for (const row of rows) {
    const keywordId = typeof row.id === "string" ? row.id : String(row.id ?? "");
    if (!keywordId || vistos.has(keywordId)) continue;
    const workflow = row.canonicalWorkflow && typeof row.canonicalWorkflow === "object" ? row.canonicalWorkflow as Record<string, unknown> : null;
    if (!workflow || workflow.state !== "received") continue;
    vistos.add(keywordId);
    const payload = workflow.payload && typeof workflow.payload === "object" ? workflow.payload as Record<string, unknown> : {};
    const recebido = payload.approvedDna && typeof payload.approvedDna === "object" ? (payload.approvedDna as Record<string, unknown>).contentHash : null;
    const semantic = row.analise_semantica && typeof row.analise_semantica === "object" ? row.analise_semantica as Record<string, unknown> : null;
    const registro = readApprovalRecord(semantic);
    if (!hasNewerMineradorPackage({ status: typeof row.status === "string" ? row.status : null, approvalHash: registro?.contentHash ?? null, receivedHash: typeof recebido === "string" ? recebido : null })) continue;
    const divergiu = approvedPackageDiverged({
      keywordId,
      brandId: typeof row.brand_id === "string" ? row.brand_id : null,
      keyword: typeof row.keyword === "string" ? row.keyword : "",
      intent: row.intent,
      volumeSearch: row.volume_search,
      resultsAllintitle: row.results_allintitle,
      kgrScore: row.kgr_score,
      listaId: row.lista_id,
      semantic,
    });
    if (divergiu !== false) continue;
    saida.push({ keywordId, keyword: typeof row.keyword === "string" ? row.keyword : keywordId });
  }
  return saida;
}

/** A frase do aviso na mesa. */
export function mineradorPackageUpdatesSentence(count: number): string {
  return `Pacote novo no Minerador · ${count} keyword${count === 1 ? "" : "s"}: reaprovada${count === 1 ? "" : "s"} depois do envio (Assunto, plano ou DNA mudaram). “Atualizar do Minerador” troca o pacote guardado pelo aprovado vigente; Silo, artigo e Assunto ancorado ficam como estão, e artigo já formado não é reescrito (ele passa a avisar que a keyword foi reaprovada).`;
}

/* -------------------------------- cores -------------------------------- */

/** "Atualiza no Arquiteto": o rótulo curto e o detalhe (a mesma frase no modal, na prévia e no aviso da mesa). */
export const ARQUITETO_IMPORT_REFRESH_LABEL = "atualiza no Arquiteto (pacote novo)";
export const ARQUITETO_IMPORT_REFRESH_DETAIL = "Reaprovada no Minerador depois do envio: importar troca o pacote que o Arquiteto guarda pelo aprovado vigente (Assunto, plano e DNA). As decisões do Arquiteto (Silo, artigo, Assunto ancorado) ficam; artigo já formado não é reescrito.";

/** Pode ir nesta importação: nova (`send`) ou já no Arquiteto com pacote novo (`refresh`). */
export const isArquitetoImportable = (item: Pick<ArquitetoImportItem, "state">) => item.state === "send" || item.state === "refresh";

/** O estado curto da linha da lista. */
export function arquitetoImportLineLabel(item: Pick<ArquitetoImportItem, "state" | "reason">): string {
  if (item.state === "send") return "pode importar";
  if (item.state === "refresh") return ARQUITETO_IMPORT_REFRESH_LABEL;
  if (item.state === "approve_in_minerador") return "precisa aprovar no Minerador";
  if (item.state === "in_arquiteto") return "já no Arquiteto";
  return `fora: ${item.reason || "sem motivo informado"}`;
}

export type ArquitetoImportColorSummary = { color: EditorialGroupColor; total: number; importable: number; approveInMinerador: number; inArquiteto: number; out: number; refresh: number };

/** As cinco cores, sempre na ordem das etiquetas, com as contagens (zero quando não há). */
export function summarizeArquitetoImportColors(
  items: readonly ArquitetoImportItem[],
  colorOfGroup: (groupId: string | null) => EditorialGroupColor | null,
): ArquitetoImportColorSummary[] {
  return EDITORIAL_GROUP_COLORS.map(color => {
    const daCor = items.filter(item => colorOfGroup(item.groupId) === color);
    return {
      color,
      total: daCor.length,
      importable: daCor.filter(isArquitetoImportable).length,
      approveInMinerador: daCor.filter(item => item.state === "approve_in_minerador").length,
      inArquiteto: daCor.filter(item => item.state === "in_arquiteto").length,
      out: daCor.filter(item => item.state === "out").length,
      refresh: daCor.filter(item => item.state === "refresh").length,
    };
  });
}

/** Escolher a cor: marca todas as que podem ir e diz quais ficam fora (com motivo). */
export function selectArquitetoImportColor(
  items: readonly ArquitetoImportItem[],
  color: EditorialGroupColor,
  colorOfGroup: (groupId: string | null) => EditorialGroupColor | null,
): { importIds: string[]; approveInMineradorIds: string[]; out: ArquitetoImportItem[]; inArquiteto: number; refresh: number } {
  const daCor = items.filter(item => colorOfGroup(item.groupId) === color);
  return {
    importIds: daCor.filter(isArquitetoImportable).map(item => item.id),
    refresh: daCor.filter(item => item.state === "refresh").length,
    approveInMineradorIds: daCor.filter(item => item.state === "approve_in_minerador").map(item => item.id),
    out: daCor.filter(item => item.state === "out"),
    inArquiteto: daCor.filter(item => item.state === "in_arquiteto").length,
  };
}

/** O modal abre filtrado pela cor ativa na etiqueta da barra (nada quando é "Todos" ou "Sem grupo"). */
export function initialArquitetoImportColor(choice: unknown): EditorialGroupColor | null {
  return isEditorialGroupColor(choice) ? choice : null;
}

/* ------------------------------ progresso ------------------------------ */

export type ArquitetoImportPhase = "previewing" | "applying" | "rereading" | "refreshing_mesa";

export const ARQUITETO_IMPORT_PHASES: readonly ArquitetoImportPhase[] = ["previewing", "applying", "rereading", "refreshing_mesa"];

/** A etapa nomeada e a contagem ("etapa 2 de 4"), no padrão do OperationProgress. */
export function arquitetoImportProgress(phase: ArquitetoImportPhase, counts: { approve: number; send: number }): { label: string; done: number; total: number } {
  const total = ARQUITETO_IMPORT_PHASES.length;
  const done = ARQUITETO_IMPORT_PHASES.indexOf(phase) + 1;
  const vao = counts.approve + counts.send;
  const label = phase === "previewing"
    ? "Conferindo no servidor quais podem ir"
    : phase === "applying"
      ? `Importando ${vao} já aprovada(s) no Minerador para o Arquiteto (o Silo do plano é preparado junto, quando a cor tem plano)`
      : phase === "rereading"
        ? "Relendo no servidor o que chegou ao Arquiteto"
        : "Atualizando a mesa do Arquiteto";
  return { label, done, total };
}

/* ------------------------------ resultado ------------------------------ */

export type ArquitetoImportResultLine = { id: string; keyword: string; outcome: ApproveAndSendResult["results"][number]["outcome"]; reason: string | null; confirmed: boolean };

/**
 * O resultado por item, conferido na RELEITURA da lista: quem saiu como
 * enviada precisa voltar como "já no Arquiteto". As desmarcadas na prévia não
 * entram no resultado mostrado.
 */
export function confirmArquitetoImportResult(
  result: Pick<ApproveAndSendResult, "results">,
  reread: readonly Pick<ArquitetoImportItem, "id" | "state">[],
): { lines: ArquitetoImportResultLine[]; allConfirmed: boolean } {
  const relida = new Map(reread.map(item => [item.id, item.state] as const));
  const lines = result.results
    .filter(line => line.outcome !== "excluded")
    .map(line => {
      const enviada = line.outcome === "approved_and_sent" || line.outcome === "sent";
      return { id: line.id, keyword: line.keyword, outcome: line.outcome, reason: line.reason, confirmed: !enviada || relida.get(line.id) === "in_arquiteto" };
    });
  return { lines, allConfirmed: lines.every(line => line.confirmed) };
}
