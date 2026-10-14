import { handleArchitectWorkspaceDelta } from "@/lib/server/arquiteto-workspace-http";

/* 2026-10-14 · F2 das listas leves: a releitura do que mudou na mesa do Arquiteto (só leitura). */
export async function POST(request: Request) { return handleArchitectWorkspaceDelta(request); }
