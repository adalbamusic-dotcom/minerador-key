export const GLOBAL_WORKFLOW_STATUSES = ["RASCUNHO", "EM_PROCESSO", "DESCARTADO", "PRONTO_PARA_RADAR", "ENVIADO_AO_RADAR"] as const;
export type GlobalWorkflowStatus = typeof GLOBAL_WORKFLOW_STATUSES[number];
export const GLOBAL_WORKFLOW_LABELS: Record<GlobalWorkflowStatus,string> = { RASCUNHO:"Rascunho", EM_PROCESSO:"Em processo", DESCARTADO:"Descartado", PRONTO_PARA_RADAR:"Pronto para Radar", ENVIADO_AO_RADAR:"Enviado ao Radar" };
export function globalWorkflowStatus(value: unknown): GlobalWorkflowStatus {
 if ((GLOBAL_WORKFLOW_STATUSES as readonly unknown[]).includes(value)) return value as GlobalWorkflowStatus;
 return value == null ? "RASCUNHO" : "EM_PROCESSO";
}
export function radarReadbackMatches(row: {marca_id:string; stage:string; article_id:string; source_version_id:string; source_content_hash:string} | null, brandId:string, articleId:string, versionId:string, hash:string) {
 return !!row && row.marca_id===brandId && row.stage==="radar" && row.article_id===articleId && row.source_version_id===versionId && row.source_content_hash===hash;
}
