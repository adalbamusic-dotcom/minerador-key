/**
 * ===== A MESA DO ARQUITETO RELÊ SÓ O QUE MUDOU (2026-10-14) =====
 *
 * SDD `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
 * item 4, F2 ("releitura por id em vez de leitura dupla"). Antes, cada ação do
 * Arquiteto relia o `GET /api/arquiteto/workspace` inteiro — ~42 pontos que
 * pedem a recarga da mesa e ~21 releituras diretas, muitas vezes as duas na
 * mesma ação (AdalbaPro: ~20 MB por leitura).
 *
 * Agora a leitura inteira devolve, junto, as MARCAS de sincronização que o
 * servidor calcula a partir dos metadados (sem `payload`): `lock_version` e
 * `updated_at` de cada item, a versão vigente de cada artefato, a impressão de
 * cada keyword (colunas da lista + o grupo + os blocos pequenos do DNA que
 * mudam numa decisão — Assunto/plano/trava, aprovação, Lógica, revisão humana,
 * KD, volume elegível, tipo de página) e um hash de cada coleção pequena e de
 * cada lista derivada (elegibilidade, status, ordem). Depois de uma ação, a
 * tela manda as marcas que tem (`POST /api/arquiteto/workspace/delta`) e o
 * servidor devolve só as linhas cujas marcas mudaram, já na forma da leitura
 * inteira; a tela troca essas linhas e monta o MESMO snapshot.
 *
 * Domínio puro (Node e navegador): hash, diferença de marcas e a fusão.
 */

/** As marcas que o servidor calcula; a tela só guarda e devolve. */
export type ArchitectSyncMarks = {
  v: 1;
  /** Item `keyword/architect` recebido → `lock|updated_at[|r:…]` (o `r` muda quando a liberação por artigo rejeitado muda). */
  items: Record<string, string>;
  /** Keyword viva da marca → impressão da linha da lista + blocos pequenos do DNA. */
  kw: Record<string, string>;
  /** `tipo:entityId` → `versionId` da vigente, só dos artefatos que a mesa devolve. */
  art: Record<string, string>;
  /** Parecer da formação (`candidateRef`) → `id|lock|updated_at`. */
  serp: Record<string, string>;
  /** Hash das coleções pequenas, das listas derivadas e das ordens. */
  hashes: Record<string, string>;
};

export type ArchitectSyncPatch = {
  v: 1;
  items?: { set: Record<string, string>; remove: string[] };
  kw?: { set: Record<string, string>; remove: string[] };
  art?: { set: Record<string, string>; remove: string[] };
  serp?: { set: Record<string, string>; remove: string[] };
  hashes: Record<string, string>;
};

export type ArchitectKeyedChanges<T> = { upsert: T[]; remove: string[]; order?: string[] };

/** O que mudou, na forma da leitura inteira. Seção ausente = não mudou. */
export type ArchitectWorkspaceDeltaChanges = {
  workflowItems?: ArchitectKeyedChanges<Record<string, unknown>>;
  /** Linhas inteiras das keywords recebidas relidas (a tela recorta pelas recebidas depois da fusão). */
  keywords?: { upsert: Array<Record<string, unknown>> };
  availableKeywords?: { upsert: Array<Record<string, unknown>>; remove: string[] };
  importEligibility?: Array<Record<string, unknown>>;
  articleDnas?: ArchitectKeyedChanges<Record<string, unknown>>;
  siloDnas?: ArchitectKeyedChanges<Record<string, unknown>>;
  siloPages?: ArchitectKeyedChanges<Record<string, unknown>>;
  aiReviews?: ArchitectKeyedChanges<Record<string, unknown>>;
  statuses?: Array<{ versionId: string; status: string }>;
  brandSiloCatalog?: unknown[];
  territories?: unknown[];
  siloWorkingCopies?: unknown[];
  territorialSerp?: unknown[];
  territorialAi?: unknown[];
  articleFormationSerp?: ArchitectKeyedChanges<Record<string, unknown>>;
  architectureMarker?: unknown;
  articleFormationMarker?: unknown;
};

/**
 * FNV-1a de 64 bits (dois acumuladores de 32), em hexadecimal. Só identifica
 * mudança; não é segurança. O mesmo em Node e no navegador, síncrono.
 */
export function syncHash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a ^= code; a = Math.imul(a, 0x01000193) >>> 0;
    b ^= code; b = Math.imul(b, 0x5bd1e995) >>> 0; b ^= b >>> 15;
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

/** JSON com chaves ordenadas: dois objetos iguais dão o mesmo texto, em qualquer ordem de chave. */
export function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

/** As chaves cuja marca mudou (inclui as novas) e as que sumiram. */
export function diffSyncMarks(current: Record<string, string>, known: Record<string, string> | undefined) {
  const anteriores = known || {};
  const changed = Object.keys(current).filter(key => anteriores[key] !== current[key]);
  const removed = Object.keys(anteriores).filter(key => !(key in current));
  return { changed, removed };
}

/** O remendo das marcas: só o que mudou em cada mapa, e os hashes inteiros (são poucos). */
export function syncPatchOf(current: ArchitectSyncMarks, known: ArchitectSyncMarks | null | undefined): ArchitectSyncPatch {
  const patch: ArchitectSyncPatch = { v: 1, hashes: current.hashes };
  for (const mapa of ["items", "kw", "art", "serp"] as const) {
    const { changed, removed } = diffSyncMarks(current[mapa], known?.[mapa]);
    if (changed.length || removed.length) patch[mapa] = { set: Object.fromEntries(changed.map(key => [key, current[mapa][key]])), remove: removed };
  }
  return patch;
}

export function applySyncPatch(base: ArchitectSyncMarks, patch: ArchitectSyncPatch): ArchitectSyncMarks {
  const next: ArchitectSyncMarks = { v: 1, items: { ...base.items }, kw: { ...base.kw }, art: { ...base.art }, serp: { ...base.serp }, hashes: { ...patch.hashes } };
  for (const mapa of ["items", "kw", "art", "serp"] as const) {
    const parte = patch[mapa];
    if (!parte) continue;
    for (const key of parte.remove) delete next[mapa][key];
    Object.assign(next[mapa], parte.set);
  }
  return next;
}

export function isArchitectSyncMarks(value: unknown): value is ArchitectSyncMarks {
  if (!value || typeof value !== "object") return false;
  const marks = value as Record<string, unknown>;
  const mapa = (item: unknown) => Boolean(item) && typeof item === "object" && !Array.isArray(item);
  return marks.v === 1 && mapa(marks.items) && mapa(marks.kw) && mapa(marks.art) && mapa(marks.serp) && mapa(marks.hashes);
}

/** A forma da leitura inteira que a fusão conhece (o `data` do GET, já validado). */
export type ArchitectWorkspaceData = {
  workflowItems: Array<Record<string, unknown>>;
  importEligibility: Array<Record<string, unknown>>;
  keywords: Array<Record<string, unknown>>;
  availableKeywords: Array<Record<string, unknown>>;
  articleDnas: unknown[];
  siloDnas: unknown[];
  siloPages: unknown[];
  aiReviews: unknown[];
  statuses: Array<{ versionId: string; status: string }>;
  brandSiloCatalog: unknown[];
  territories: unknown[];
  siloWorkingCopies: unknown[];
  territorialSerp: unknown[];
  articleFormationSerp: Array<Record<string, unknown>>;
  territorialAi: unknown[];
  architectureMarker: unknown;
  articleFormationMarker: unknown;
} & Record<string, unknown>;

const text = (value: unknown) => (typeof value === "string" ? value : "");

function mergeKeyed<T>(
  base: readonly T[],
  changes: ArchitectKeyedChanges<T> | undefined,
  keyOf: (item: T) => string,
): { ok: true; items: T[] } | { ok: false; reason: string } {
  if (!changes) return { ok: true, items: [...base] };
  const porChave = new Map(base.map(item => [keyOf(item), item]));
  for (const key of changes.remove) porChave.delete(key);
  const novas: string[] = [];
  for (const item of changes.upsert) {
    const key = keyOf(item);
    if (!porChave.has(key)) novas.push(key);
    porChave.set(key, item);
  }
  if (!changes.order) {
    /* Sem ordem nova, nenhuma chave nova pode ter entrado (a ordem teria mudado). */
    if (novas.length) return { ok: false, reason: "chave nova sem ordem" };
    return { ok: true, items: base.filter(item => porChave.has(keyOf(item))).map(item => porChave.get(keyOf(item)) as T) };
  }
  const ordenadas: T[] = [];
  for (const key of changes.order) {
    const item = porChave.get(key);
    if (!item) return { ok: false, reason: `a ordem cita ${key}, que a fusão não tem` };
    ordenadas.push(item);
  }
  if (ordenadas.length !== porChave.size) return { ok: false, reason: "a ordem não cobre todas as linhas" };
  return { ok: true, items: ordenadas };
}

const entityIdOf = (item: unknown) => text((item as { entityId?: unknown })?.entityId);

/**
 * Funde as mudanças na leitura anterior. Devolve `ok: false` (e a tela relê
 * tudo) quando a fusão não fecha — nunca uma mesa pela metade.
 */
export function mergeArchitectWorkspaceDelta(
  base: ArchitectWorkspaceData,
  changes: ArchitectWorkspaceDeltaChanges,
): { ok: true; data: ArchitectWorkspaceData } | { ok: false; reason: string } {
  const workflowItems = mergeKeyed(base.workflowItems, changes.workflowItems, item => text(item.id));
  if (!workflowItems.ok) return workflowItems;
  const articleDnas = mergeKeyed(base.articleDnas, changes.articleDnas as ArchitectKeyedChanges<unknown> | undefined, entityIdOf);
  if (!articleDnas.ok) return articleDnas;
  const siloDnas = mergeKeyed(base.siloDnas, changes.siloDnas as ArchitectKeyedChanges<unknown> | undefined, entityIdOf);
  if (!siloDnas.ok) return siloDnas;
  const siloPages = mergeKeyed(base.siloPages, changes.siloPages as ArchitectKeyedChanges<unknown> | undefined, entityIdOf);
  if (!siloPages.ok) return siloPages;
  const aiReviews = mergeKeyed(base.aiReviews, changes.aiReviews as ArchitectKeyedChanges<unknown> | undefined, entityIdOf);
  if (!aiReviews.ok) return aiReviews;
  const articleFormationSerp = mergeKeyed(base.articleFormationSerp, changes.articleFormationSerp, item => text(item.candidateRef));
  if (!articleFormationSerp.ok) return articleFormationSerp;

  /* As keywords recebidas: as relidas trocam as antigas; o conjunto é o dos itens recebidos (como na leitura inteira). */
  const recebidas = new Set(workflowItems.items.filter(item => item.state === "received" && item.subjectType === "keyword").map(item => text(item.subjectId)));
  const keywordPorId = new Map(base.keywords.map(keyword => [text(keyword.id), keyword]));
  for (const keyword of changes.keywords?.upsert || []) keywordPorId.set(text(keyword.id), keyword);
  const faltando = [...recebidas].filter(id => !keywordPorId.has(id));
  if (faltando.length) return { ok: false, reason: `keyword recebida sem linha: ${faltando.slice(0, 3).join(", ")}` };
  const keywords = [...keywordPorId.values()].filter(keyword => recebidas.has(text(keyword.id)));

  let availableKeywords = base.availableKeywords;
  if (changes.availableKeywords) {
    const removidas = new Set(changes.availableKeywords.remove);
    const porId = new Map(base.availableKeywords.filter(keyword => !removidas.has(text(keyword.id))).map(keyword => [text(keyword.id), keyword]));
    for (const keyword of changes.availableKeywords.upsert) porId.set(text(keyword.id), keyword);
    availableKeywords = [...porId.values()];
  }

  return {
    ok: true,
    data: {
      ...base,
      workflowItems: workflowItems.items,
      keywords,
      availableKeywords,
      importEligibility: changes.importEligibility ?? base.importEligibility,
      articleDnas: articleDnas.items,
      siloDnas: siloDnas.items,
      siloPages: siloPages.items,
      aiReviews: aiReviews.items,
      statuses: changes.statuses ?? base.statuses,
      brandSiloCatalog: changes.brandSiloCatalog ?? base.brandSiloCatalog,
      territories: changes.territories ?? base.territories,
      siloWorkingCopies: changes.siloWorkingCopies ?? base.siloWorkingCopies,
      territorialSerp: changes.territorialSerp ?? base.territorialSerp,
      territorialAi: changes.territorialAi ?? base.territorialAi,
      articleFormationSerp: articleFormationSerp.items,
      architectureMarker: "architectureMarker" in changes ? changes.architectureMarker ?? null : base.architectureMarker,
      articleFormationMarker: "articleFormationMarker" in changes ? changes.articleFormationMarker ?? null : base.articleFormationMarker,
    },
  };
}
