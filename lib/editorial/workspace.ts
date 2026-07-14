export function updateBrandWorkspace<T>(workspaces: Record<string, T>, brandId: string, fallback: () => T, updater: (current: T) => T) {
  if (!brandId) return workspaces;
  return { ...workspaces, [brandId]: updater(workspaces[brandId] ?? fallback()) };
}
