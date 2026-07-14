import { z } from "zod";

export const GridSortSchema = z.object({ columnId: z.string(), direction: z.enum(["asc", "desc"]) });
export const GridOrderModeSchema = z.enum(["automatic", "manual"]);
export const GridPageSizeSchema = z.union([z.literal(25), z.literal(50), z.literal(100), z.literal(200), z.literal("all")]);
export const SavedGridViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  userId: z.string().min(1),
  brandId: z.string().min(1),
  module: z.string().min(1),
  search: z.string(),
  filters: z.record(z.string(), z.string()),
  sort: GridSortSchema.nullable(),
  visibleColumns: z.array(z.string()),
  columnWidths: z.record(z.string(), z.number().int().min(64).max(800)),
  pageSize: GridPageSizeSchema,
  grouping: z.string().nullable(),
  orderMode: GridOrderModeSchema,
  manualOrder: z.array(z.string()),
  isDefault: z.boolean(),
  updatedAt: z.string().datetime(),
});
export const SavedGridViewListSchema = z.array(SavedGridViewSchema);
export type SavedGridView = z.infer<typeof SavedGridViewSchema>;

export function gridViewStorageKey(userId: string, brandId: string, module: string) {
  return `minerador-pro:grid-views:${userId}:${brandId}:${module}`;
}

export function selectAllVisible(current: ReadonlySet<string>, visibleIds: string[], checked: boolean) {
  const next = new Set(current);
  visibleIds.forEach(id => checked ? next.add(id) : next.delete(id));
  return next;
}

export function selectionState(selected: ReadonlySet<string>, visibleIds: string[]) {
  const selectedVisible = visibleIds.filter(id => selected.has(id)).length;
  return { checked: visibleIds.length > 0 && selectedVisible === visibleIds.length, indeterminate: selectedVisible > 0 && selectedVisible < visibleIds.length, selectedVisible };
}

export function reorderIds(ids: string[], draggedId: string, targetId: string, hasAutomaticSort: boolean) {
  if (hasAutomaticSort || draggedId === targetId) return ids;
  const from = ids.indexOf(draggedId); const to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return ids;
  const next = [...ids]; const [dragged] = next.splice(from, 1); next.splice(to, 0, dragged);
  return next;
}

export function applyGridQuery<T extends { id: string }>(rows: T[], options: {
  search: string;
  searchText: (row: T) => string;
  filters: Record<string, string>;
  filterValue: (row: T, columnId: string) => unknown;
  sort: { columnId: string; direction: "asc" | "desc" } | null;
  manualOrder: string[];
}) {
  const query = options.search.trim().toLocaleLowerCase("pt-BR");
  const filtered = rows.filter(row => {
    if (query && !options.searchText(row).toLocaleLowerCase("pt-BR").includes(query)) return false;
    return Object.entries(options.filters).every(([columnId, expected]) => !expected || String(options.filterValue(row, columnId) ?? "") === expected);
  });
  if (options.sort) {
    const { columnId, direction } = options.sort;
    return [...filtered].sort((a, b) => String(options.filterValue(a, columnId) ?? "").localeCompare(String(options.filterValue(b, columnId) ?? ""), "pt-BR", { numeric: true }) * (direction === "asc" ? 1 : -1));
  }
  const position = new Map(options.manualOrder.map((id, index) => [id, index]));
  return [...filtered].sort((a, b) => (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

export function saveGridView(views: SavedGridView[], candidate: SavedGridView) {
  const parsed = SavedGridViewSchema.parse(candidate);
  const without = views.filter(view => view.id !== parsed.id).map(view => parsed.isDefault ? { ...view, isDefault: false } : view);
  return SavedGridViewListSchema.parse([...without, parsed]);
}

export function removeGridView(views: SavedGridView[], id: string) {
  return views.filter(view => view.id !== id);
}

export function defaultGridView(views: SavedGridView[]) {
  return views.find(view => view.isDefault) ?? null;
}
