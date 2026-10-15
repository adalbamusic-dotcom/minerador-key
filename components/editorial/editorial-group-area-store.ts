"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  activeEditorialGroupsOfColor,
  EDITORIAL_GROUP_CHOICE_ALL,
  EDITORIAL_GROUP_URL_NONE,
  EDITORIAL_GROUP_URL_PARAM,
  editorialGroupAreaStorageKey,
  editorialGroupChoiceFromLegacyId,
  editorialGroupScreenFilterKey,
  editorialGroupsCacheStorageKey,
  parseEditorialGroupChoice,
  parseEditorialGroupsCache,
  resolveEditorialGroupScreenFilter,
  serializeEditorialGroupChoice,
  serializeEditorialGroupsCache,
  type EditorialGroupArea,
  type EditorialGroupChoice,
  type EditorialGroupColor,
  type EditorialGroupScreenFilter,
  type EditorialGroupSummary,
} from "@/lib/editorial/editorial-groups";

/**
 * ETIQUETA DE GRUPO — ESTADO DE CLIENTE LEVE, COMPARTILHADO PELA TOPBAR E PELAS
 * PLANILHAS (2026-10-12, adendo do §9.1 da SDD do plano declarado e grupos).
 *
 * Pedido do dono: "coloca umas cores prefixados e pronto (…) tem que funcionar
 * de forma independente em cada área, mas não pode atrapalhar o carregamento".
 *
 * 1. ESCOLHA POR ÁREA. `brandId + área` → a COR ("laranja"), "todos" ou
 *    "sem-grupo". Lembrada em `localStorage`
 *    (`minerador-key:grupo-ativo:${brandId}:${area}`), só conveniência, com
 *    try/catch em tudo — nada aqui é limpo. A URL (`?grupo=`) da página aberta
 *    manda: é lida ANTES do primeiro uso (para a planilha não carregar o recorte
 *    errado e depois o certo) e reescrita a cada escolha. O uuid antigo de
 *    `?grupo=` é aceito e vira a cor do grupo quando a lista chega.
 * 2. LISTA DE GRUPOS DA MARCA, UMA VEZ POR SESSÃO, EM SEGUNDO PLANO. O cache de
 *    apresentação (`minerador-key:grupos:${brandId}`: id, cor, nome, status)
 *    entra na hora; o `GET /api/editorial/groups` corre por trás e corrige. As
 *    três áreas leem a MESMA lista (uma requisição por marca). Depois de
 *    escrever (mover, garantir a cor), a lista é relida.
 * 3. FILTRAR NUNCA ESCREVE. Só mover/etiquetar chama `ensureColorGroup`, que
 *    garante no servidor o grupo daquela cor.
 *
 * O que é de uma marca nunca aparece em outra: tudo é indexado pelo `brandId`.
 */

export type BrandGroupsStatus = "idle" | "loading" | "ready" | "error" | "unavailable";

export type BrandGroupsState = {
  brandId: string | null;
  status: BrandGroupsStatus;
  /** De onde vieram os grupos: nada ainda, o cache local (sem contagens) ou o servidor. */
  source: "none" | "cache" | "server";
  groups: readonly EditorialGroupSummary[];
  ungroupedKeywordCount: number | null;
};

type StoredChoice = EditorialGroupChoice | { legacyGroupId: string };

const IDLE: BrandGroupsState = Object.freeze({ brandId: null, status: "idle", source: "none", groups: Object.freeze([]) as readonly EditorialGroupSummary[], ungroupedKeywordCount: null });

const listeners = new Set<() => void>();
const brands = new Map<string, BrandGroupsState>();
const choices = new Map<string, StoredChoice>();
const inflight = new Map<string, Promise<BrandGroupsState>>();
/**
 * 2026-10-14 · defeito do dono: a cor escolhida numa marca (`?grupo=azul`)
 * passou para outra marca que não tem essa cor, e a lista ficou "0 artigos".
 * Quando a lista DO SERVIDOR desta marca chega sem a cor escolhida, a área
 * volta para "Todos os grupos" (memória e URL; a lembrança local não é tocada)
 * e guarda aqui qual cor faltou, para o aviso curto. Escolher de novo apaga.
 */
const fallbacks = new Map<string, EditorialGroupColor>();
/**
 * As escolhas HERDADAS (vindas da URL ou da lembrança local ao abrir a área),
 * as únicas que a regra acima derruba. A escolha feita nesta sessão — clicar
 * numa cor, acompanhar a troca de cor do grupo, a cor de um uuid antigo — vale
 * mesmo sem grupo ainda (mover para a cor cria o grupo dela).
 */
const herdadas = new Set<string>();

const emit = () => { for (const listener of [...listeners]) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const choiceKey = (brandId: string, area: EditorialGroupArea) => `${brandId}:${area}`;

/* ------------------------------ armazenamento ------------------------------ */

function lerLocal(chave: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarLocal(chave: string, valor: string) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(chave, valor);
  } catch {
    /* Aba privada ou armazenamento bloqueado: só não lembra. */
  }
}

/** A área da página aberta (`/{brandRef}/{area}`), para a URL valer só nela. */
function areaDaPagina(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.location.pathname.split("/").filter(Boolean)[1] || null;
  } catch {
    return null;
  }
}

function lerUrl(area: EditorialGroupArea): string | null {
  if (areaDaPagina() !== area) return null;
  try {
    return new URL(window.location.href).searchParams.get(EDITORIAL_GROUP_URL_PARAM);
  } catch {
    return null;
  }
}

function gravarUrl(area: EditorialGroupArea, choice: EditorialGroupChoice) {
  if (areaDaPagina() !== area) return;
  try {
    const url = new URL(window.location.href);
    const valor = serializeEditorialGroupChoice(choice);
    if ((url.searchParams.get(EDITORIAL_GROUP_URL_PARAM) || null) === valor) return;
    if (valor) url.searchParams.set(EDITORIAL_GROUP_URL_PARAM, valor);
    else url.searchParams.delete(EDITORIAL_GROUP_URL_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* A URL é conveniência de compartilhamento; a escolha continua valendo. */
  }
}

/* ------------------------------ grupos da marca ------------------------------ */

const doCache = (brandId: string, entry: { id: string; color: EditorialGroupColor; name: string; status: "active" | "archived" }): EditorialGroupSummary => ({
  id: entry.id, marcaId: brandId, name: entry.name, color: entry.color, origin: "manual", status: entry.status,
  siloId: null, planVersion: 0, lockVersion: 1, updatedAt: "", keywordCount: 0, articleCount: 0,
});

function definir(brandId: string, next: BrandGroupsState) {
  brands.set(brandId, next);
  emit();
}

async function lerDoServidor(brandId: string): Promise<BrandGroupsState> {
  const anterior = brands.get(brandId);
  const response = await fetch(`/api/editorial/groups?marcaId=${encodeURIComponent(brandId)}`, { cache: "no-store" }).catch(() => null);
  const body = response ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
  if (response && response.status === 409 && body.code === "GROUPS_NOT_AVAILABLE") {
    return { brandId, status: "unavailable", source: "none", groups: [], ungroupedKeywordCount: null };
  }
  if (!response || !response.ok || body.success !== true || !Array.isArray(body.groups)) {
    return { brandId, status: "error", source: anterior?.source ?? "none", groups: anterior?.groups ?? [], ungroupedKeywordCount: anterior?.ungroupedKeywordCount ?? null };
  }
  const groups = (body.groups as EditorialGroupSummary[]).filter(group => group && group.marcaId === brandId);
  gravarLocal(editorialGroupsCacheStorageKey(brandId), serializeEditorialGroupsCache(groups));
  return { brandId, status: "ready", source: "server", groups, ungroupedKeywordCount: typeof body.ungroupedKeywordCount === "number" ? body.ungroupedKeywordCount : null };
}

/**
 * Garante a leitura da lista desta marca: o cache local entra na hora e a
 * leitura do servidor corre uma vez (as chamadas simultâneas dividem a mesma).
 * `force` relê mesmo já lida (depois de escrever).
 */
export function loadBrandEditorialGroups(brandId: string, options: { force?: boolean } = {}): Promise<BrandGroupsState> {
  const atual = brands.get(brandId);
  if (atual && !options.force && atual.status !== "idle" && atual.status !== "error") return inflight.get(brandId) ?? Promise.resolve(atual);
  if (atual?.status === "unavailable" && options.force) return Promise.resolve(atual);
  const emVoo = inflight.get(brandId);
  if (emVoo && !options.force) return emVoo;
  if (!atual) {
    const cache = parseEditorialGroupsCache(lerLocal(editorialGroupsCacheStorageKey(brandId)));
    brands.set(brandId, cache
      ? { brandId, status: "loading", source: "cache", groups: cache.map(entry => doCache(brandId, entry)), ungroupedKeywordCount: null }
      : { brandId, status: "loading", source: "none", groups: [], ungroupedKeywordCount: null });
  }
  const leitura = lerDoServidor(brandId).then(resultado => {
    if (inflight.get(brandId) === leitura) inflight.delete(brandId);
    // Uma marcação de "indisponível" vinda da planilha não é desfeita por uma leitura velha.
    if (brands.get(brandId)?.status !== "unavailable") definir(brandId, resultado);
    return brands.get(brandId) ?? resultado;
  });
  inflight.set(brandId, leitura);
  emit();
  return leitura;
}

export const refreshBrandEditorialGroups = (brandId: string) => loadBrandEditorialGroups(brandId, { force: true });

/** A planilha descobriu que a coluna/tabela de grupos não existe (M1 ausente): o recurso some. */
export function markBrandEditorialGroupsUnavailable(brandId: string) {
  definir(brandId, { brandId, status: "unavailable", source: "none", groups: [], ungroupedKeywordCount: null });
}

/** Junta um grupo recém-garantido à lista (a releitura completa vem por trás). */
function incluirGrupo(brandId: string, group: EditorialGroupSummary) {
  const atual = brands.get(brandId);
  if (!atual || atual.status === "unavailable") return;
  const groups = [...atual.groups.filter(item => item.id !== group.id), group];
  definir(brandId, { ...atual, groups });
}

export type EnsureColorGroupResult = { ok: true; group: EditorialGroupSummary } | { ok: false; code: string; message: string };

/**
 * Mover/etiquetar por cor: garante no servidor o grupo daquela cor
 * (`POST /api/editorial/groups { marcaId, color }`) e devolve o grupo. Nunca é
 * chamado por filtrar.
 */
export async function ensureEditorialColorGroup(brandId: string, color: EditorialGroupColor): Promise<EnsureColorGroupResult> {
  const response = await fetch("/api/editorial/groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ marcaId: brandId, color }),
  }).catch(() => null);
  const body = response ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
  const group = body.group as EditorialGroupSummary | undefined;
  if (!response || !response.ok || body.success !== true || !group || group.marcaId !== brandId || group.color !== color) {
    if (response?.status === 409 && body.code === "GROUPS_NOT_AVAILABLE") markBrandEditorialGroupsUnavailable(brandId);
    return { ok: false, code: typeof body.code === "string" ? body.code : "GROUP_ENSURE_FAILED", message: typeof body.message === "string" ? body.message : "Não foi possível preparar o grupo desta cor." };
  }
  incluirGrupo(brandId, group);
  void refreshBrandEditorialGroups(brandId);
  return { ok: true, group };
}

/* ------------------------------ escolha por área ------------------------------ */

/**
 * A escolha da área, lida na primeira vez: a URL da página aberta, senão a
 * lembrança desta área, senão "todos". O uuid antigo fica pendente até a lista
 * de grupos chegar (e então vira a cor).
 */
function escolhaGuardada(brandId: string, area: EditorialGroupArea): StoredChoice {
  const chave = choiceKey(brandId, area);
  const guardada = choices.get(chave);
  if (guardada !== undefined) return guardada;
  const inicial = parseEditorialGroupChoice(lerUrl(area))
    ?? parseEditorialGroupChoice(lerLocal(editorialGroupAreaStorageKey(brandId, area)))
    ?? EDITORIAL_GROUP_CHOICE_ALL;
  choices.set(chave, inicial);
  herdadas.add(chave);
  return inicial;
}

/**
 * A página desta área acabou de abrir: um `?grupo=` válido na URL vale (sem
 * virar lembrança, como antes); sem ele, a escolha da área vai para a URL.
 */
function adotarUrl(brandId: string, area: EditorialGroupArea) {
  const chave = choiceKey(brandId, area);
  const daUrl = parseEditorialGroupChoice(lerUrl(area));
  const atual = escolhaGuardada(brandId, area);
  if (daUrl) {
    const igual = typeof daUrl === "string" ? daUrl === atual : typeof atual !== "string" && atual.legacyGroupId === daUrl.legacyGroupId;
    if (!igual) {
      choices.set(chave, daUrl);
      herdadas.add(chave);
      emit();
    }
    return;
  }
  if (typeof atual === "string") gravarUrl(area, atual);
}

/** Troca a escolha da área: lembra, reescreve a URL (se a página é desta área) e avisa quem lê. */
export function setEditorialGroupAreaChoice(brandId: string, area: EditorialGroupArea, choice: EditorialGroupChoice) {
  const chave = choiceKey(brandId, area);
  const atual = choices.get(chave);
  const tinhaAviso = fallbacks.delete(chave);
  herdadas.delete(chave);
  gravarLocal(editorialGroupAreaStorageKey(brandId, area), choice);
  gravarUrl(area, choice);
  if (atual === choice) { if (tinhaAviso) emit(); return; }
  choices.set(chave, choice);
  emit();
}

/**
 * A cor escolhida não existe nesta marca (lista do servidor, grupos ativos):
 * a área volta para "Todos os grupos" e o `?grupo=` sai da URL. A lembrança
 * local não é escrita nem limpa. O aviso fica até a próxima escolha.
 */
function voltarParaTodasAsCores(brandId: string, area: EditorialGroupArea, missing: EditorialGroupColor) {
  const chave = choiceKey(brandId, area);
  if (choices.get(chave) !== missing || !herdadas.has(chave)) return;
  herdadas.delete(chave);
  fallbacks.set(chave, missing);
  choices.set(chave, EDITORIAL_GROUP_CHOICE_ALL);
  gravarUrl(area, EDITORIAL_GROUP_CHOICE_ALL);
  emit();
}

/** Fecha o aviso "a cor X não existe nesta marca" sem mudar a escolha. */
export function dismissEditorialGroupColorFallback(brandId: string, area: EditorialGroupArea) {
  if (fallbacks.delete(choiceKey(brandId, area))) emit();
}

/**
 * A cor escolhida que não existe na lista do SERVIDOR desta marca (nenhum
 * grupo ativo dela). Só com a lista do servidor: o cache local pode estar
 * atrasado. "todos", "sem-grupo" e o uuid antigo nunca caem aqui.
 */
export function editorialGroupChoiceMissingInBrand(choice: StoredChoice, groups: Pick<BrandGroupsState, "status" | "source" | "groups">): EditorialGroupColor | null {
  if (typeof choice !== "string" || choice === EDITORIAL_GROUP_CHOICE_ALL || choice === EDITORIAL_GROUP_URL_NONE) return null;
  if (groups.status !== "ready" || groups.source !== "server") return null;
  return activeEditorialGroupsOfColor(groups.groups, choice).length === 0 ? choice : null;
}

/**
 * 2026-10-12 · "Gerenciar" → "Trocar a cor": o grupo mudou de cor, então a
 * escolha de cada área que olhava a cor antiga passa a olhar a nova (o grupo é
 * o mesmo). Lembrança local e memória; a URL só na área da página aberta.
 * Área que olhava outra coisa não muda.
 */
export function followEditorialGroupColorChange(brandId: string, from: EditorialGroupColor, to: EditorialGroupColor, areas: readonly EditorialGroupArea[]) {
  for (const area of areas) {
    const naMemoria = choices.get(choiceKey(brandId, area));
    const lembrada = lerLocal(editorialGroupAreaStorageKey(brandId, area));
    // 2026-10-14 · a lista relida já não tinha a cor antiga e a área voltou para "todos" com o aviso: ela acompanha o grupo do mesmo jeito.
    const caiuDaCorAntiga = fallbacks.get(choiceKey(brandId, area)) === from;
    if (naMemoria === from || caiuDaCorAntiga || (naMemoria === undefined && lembrada === from)) setEditorialGroupAreaChoice(brandId, area, to);
    else if (lembrada === from && naMemoria !== undefined && naMemoria !== from) gravarLocal(editorialGroupAreaStorageKey(brandId, area), to);
  }
}

/** Para os testes: começa do zero (só a memória do módulo; o armazenamento local não é tocado). */
export function resetEditorialGroupAreaStoreForTests() {
  brands.clear();
  choices.clear();
  inflight.clear();
  fallbacks.clear();
  herdadas.clear();
  emit();
}

/* ---------------------------------- hooks ---------------------------------- */

/** A lista de grupos da marca (dispara a leitura em segundo plano, uma vez por sessão). */
export function useBrandEditorialGroups(brandId: string | null): BrandGroupsState {
  const state = useSyncExternalStore(
    subscribe,
    () => (brandId ? brands.get(brandId) ?? IDLE : IDLE),
    () => IDLE,
  );
  useEffect(() => {
    if (brandId) void loadBrandEditorialGroups(brandId);
  }, [brandId]);
  return state;
}

/**
 * A escolha desta área. Ao montar, a URL da página é sincronizada: se ela
 * traz `?grupo=`, ele vale; senão, a escolha lembrada vai para a URL.
 */
export function useEditorialGroupAreaChoice(brandId: string | null, area: EditorialGroupArea, groups: BrandGroupsState) {
  const stored = useSyncExternalStore(
    subscribe,
    () => (brandId ? escolhaGuardada(brandId, area) : EDITORIAL_GROUP_CHOICE_ALL),
    () => EDITORIAL_GROUP_CHOICE_ALL as StoredChoice,
  );
  useEffect(() => {
    if (brandId) adotarUrl(brandId, area);
  }, [brandId, area]);
  // uuid antigo na URL: vira a cor assim que a lista de grupos (cache ou servidor) é conhecida.
  const conhecida = groups.source !== "none" || groups.status === "ready" || groups.status === "error" || groups.status === "unavailable";
  useEffect(() => {
    if (!brandId || typeof stored === "string" || !conhecida) return;
    setEditorialGroupAreaChoice(brandId, area, editorialGroupChoiceFromLegacyId(stored.legacyGroupId, groups.groups));
  }, [brandId, area, stored, conhecida, groups.groups]);
  const setChoice = useCallback((next: EditorialGroupChoice) => {
    if (brandId) setEditorialGroupAreaChoice(brandId, area, next);
  }, [brandId, area]);
  return { stored, setChoice };
}

export type AreaGroupFilter = {
  /** A escolha (a cor, "todos" ou "sem-grupo"). Um uuid antigo ainda sem lista aparece como "todos" no botão. */
  choice: EditorialGroupChoice;
  setChoice: (next: EditorialGroupChoice) => void;
  groups: BrandGroupsState;
  /** O recurso existe nesta marca (a migration dos grupos está aplicada, até prova em contrário). */
  available: boolean;
  /** A cor escolhida ainda não sabe quais grupos mostrar (sem cache e sem resposta). */
  pending: boolean;
  /** A leitura dos grupos falhou e não há cache: a cor escolhida não pode ser resolvida agora. */
  readFailed: boolean;
  /** Recorte de TELA da escolha. */
  filter: EditorialGroupScreenFilter;
  filterKey: string;
  /**
   * 2026-10-14 · a cor escolhida não existia nesta marca e a área voltou para
   * "Todos os grupos" (aviso curto até a próxima escolha). Nulo = nada a avisar.
   */
  colorFallback: EditorialGroupColor | null;
  dismissColorFallback: () => void;
};

/**
 * A escolha da área + a lista da marca → o recorte. "todos" e "sem-grupo"
 * nunca esperam a lista; uma cor resolve pelo cache na hora e só espera
 * quando não há cache nenhum.
 */
export function useAreaGroupFilter(brandId: string | null, area: EditorialGroupArea): AreaGroupFilter {
  const groups = useBrandEditorialGroups(brandId);
  const { stored, setChoice } = useEditorialGroupAreaChoice(brandId, area, groups);
  const available = Boolean(brandId) && groups.status !== "unavailable";
  const conhecida = groups.source !== "none" || groups.status === "ready" || groups.status === "error";
  const falhou = groups.status === "error" && groups.source === "none";
  // 2026-10-14 · a cor escolhida não existe nesta marca: volta para "Todos os grupos" (sem passar pelo "0 artigos").
  const corInexistente = available && brandId && groups.brandId === brandId && herdadas.has(choiceKey(brandId, area)) ? editorialGroupChoiceMissingInBrand(stored, groups) : null;
  useEffect(() => {
    if (brandId && corInexistente) voltarParaTodasAsCores(brandId, area, corInexistente);
  }, [brandId, area, corInexistente]);
  const colorFallback = useSyncExternalStore(
    subscribe,
    () => (brandId ? fallbacks.get(choiceKey(brandId, area)) ?? null : null),
    () => null,
  );
  const dismissColorFallback = useCallback(() => { if (brandId) dismissEditorialGroupColorFallback(brandId, area); }, [brandId, area]);
  let choice: EditorialGroupChoice = EDITORIAL_GROUP_CHOICE_ALL;
  let pending = false;
  let readFailed = false;
  let filter: EditorialGroupScreenFilter = { kind: "all" };
  // Cor inexistente: já no primeiro render o recorte é "todos" enquanto a escolha volta (o efeito acima).
  if (!corInexistente && available && typeof stored !== "string") {
    // uuid antigo ainda sem a lista: não mostra nada até virar cor (ou "todos").
    pending = !falhou;
    filter = { kind: "groups", color: null, groupIds: [] };
  } else if (!corInexistente && available && typeof stored === "string") {
    const resolvido = resolveEditorialGroupScreenFilter(stored, conhecida ? groups.groups : null);
    choice = stored;
    pending = resolvido.pending;
    readFailed = falhou && stored !== EDITORIAL_GROUP_CHOICE_ALL && stored !== EDITORIAL_GROUP_URL_NONE;
    filter = resolvido.filter;
  }
  const filterKey = editorialGroupScreenFilterKey(filter);
  // A chave determina o recorte: o mesmo objeto enquanto ela não muda (os memos das planilhas dependem dele).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtroEstavel = useMemo(() => filter, [filterKey]);
  return { choice, setChoice, groups, available, pending, readFailed, filter: filtroEstavel, filterKey, colorFallback: corInexistente ?? colorFallback, dismissColorFallback };
}
