import { handleArchitectWorkspaceRead, handleArchitectWorkspacePatch } from "@/lib/server/arquiteto-workspace-http";
export const GET = handleArchitectWorkspaceRead;
export async function PATCH(request: Request) { return handleArchitectWorkspacePatch(request); }
