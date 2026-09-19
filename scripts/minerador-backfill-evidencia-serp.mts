/**
 * Backfill da evidência SERP forte nas keywords que já têm Qualificação
 * Semântica persistida.
 *
 * Até 2026-09-19 a versão vigente de `keyword_semantic_qualification` nunca
 * chegava à linha da keyword: a tabela mostrava a hipótese da Lógica mesmo
 * com a SERP concluída. A rota Resultados passou a gravar
 * `analise_semantica.evidencia_serp` a cada coleta; este script projeta a
 * versão vigente para as keywords coletadas antes disso.
 *
 * Passo 0 — re-assinatura: os registros de aprovação gravados no esquema v1
 * (semântica crua) migram para v2 (leitura canônica) sem mudar versão, autor
 * ou instante. Só migra o que ainda bate em v1; registro já divergente é
 * revisão de verdade e fica como está.
 *
 * Efeito colateral declarado: keyword APROVADA cuja SERP conclusiva muda a
 * intenção ou o funil canônicos cai em `em_revisao` — a SERP é evidência
 * forte e exige nova aprovação. SERP que não conclui nada, ou que confirma a
 * Lógica, não rebaixa. O dry-run lista quantas.
 *
 * Uso:
 *   npm run minerador:backfill-evidencia-serp            (dry-run)
 *   npm run minerador:backfill-evidencia-serp -- --apply (grava)
 */
import { createClient } from "@supabase/supabase-js";
import { KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE, parseKeywordSemanticQualification, type KeywordSemanticQualification } from "../lib/minerador/keyword-semantic-qualification.ts";
import { applySerpEvidenceRecord, readSerpEvidenceRecord } from "../lib/minerador/serp-evidence-record.ts";
import { approvedPackageDiverged, readApprovalRecord, resignApprovalRecord } from "../lib/minerador/approved-package.ts";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");

const supabase = createClient(url, key, { auth: { persistSession: false } });

type Row = {
  id: string;
  brand_id: string;
  keyword: string;
  status: string | null;
  intent: string | null;
  volume_search: number | null;
  results_allintitle: number | null;
  kgr_score: number | null;
  lista_id: string | null;
  analise_semantica: Record<string, unknown> | null;
};

// Versão vigente por keyword: a mais alta de cada entity_id.
const artifacts = await supabase
  .from("editorial_artifact_versions")
  .select("entity_id,marca_id,version_number,payload")
  .eq("artifact_type", KEYWORD_SEMANTIC_QUALIFICATION_ARTIFACT_TYPE)
  .order("version_number", { ascending: false });
if (artifacts.error) throw artifacts.error;

const vigente = new Map<string, KeywordSemanticQualification>();
for (const row of artifacts.data || []) {
  const entityId = typeof row.entity_id === "string" ? row.entity_id : "";
  if (!entityId || vigente.has(entityId)) continue;
  const parsed = parseKeywordSemanticQualification(row.payload);
  if (!parsed || parsed.keywordId !== entityId || parsed.brandId !== row.marca_id) continue;
  vigente.set(entityId, parsed);
}

const keywords = await supabase
  .from("minerador_keywords")
  .select("id,brand_id,keyword,status,intent,volume_search,results_allintitle,kgr_score,lista_id,analise_semantica")
  .is("deleted_at", null);
if (keywords.error) throw keywords.error;
const todas = (keywords.data || []) as Row[];

function packageInput(row: Row, semantic: Record<string, unknown> | null) {
  return { keywordId: row.id, brandId: row.brand_id, keyword: row.keyword, intent: row.intent, volumeSearch: row.volume_search, resultsAllintitle: row.results_allintitle, kgrScore: row.kgr_score, listaId: row.lista_id, semantic };
}

// ---------------------------------------------------------------- passo 0
const reassinaturas: Array<{ row: Row; semantic: Record<string, unknown> }> = [];
const divergentesV1: Row[] = [];
for (const row of todas) {
  if (!readApprovalRecord(row.analise_semantica)) continue;
  const result = await resignApprovalRecord(packageInput(row, row.analise_semantica));
  if (result.semantic) reassinaturas.push({ row, semantic: result.semantic });
  else if (result.reason === "diverged") divergentesV1.push(row);
}
console.log(`registros de aprovação a migrar de v1 para v2: ${reassinaturas.length} · v1 já divergentes (ficam em revisão): ${divergentesV1.length}`);
for (const row of divergentesV1.slice(0, 10)) console.log(`  · em revisão: ${row.keyword}`);

if (APPLY) {
  for (const item of reassinaturas) {
    const result = await supabase.from("minerador_keywords").update({ analise_semantica: item.semantic }).eq("id", item.row.id).eq("brand_id", item.row.brand_id).is("deleted_at", null);
    if (result.error) throw result.error;
    item.row.analise_semantica = item.semantic;
  }
} else {
  // O dry-run projeta a evidência sobre o registro já migrado, para contar
  // divergência real e não a troca de esquema.
  for (const item of reassinaturas) item.row.analise_semantica = item.semantic;
}

const rows = todas.filter(row => vigente.has(row.id));

const pendentes = rows.filter(row => {
  const qualification = vigente.get(row.id);
  const record = readSerpEvidenceRecord(row.analise_semantica);
  return qualification && (!record || record.versionId !== qualification.id);
});

const cairaoEmRevisao = pendentes.filter(row => {
  if (row.status !== "aprovado" || !readApprovalRecord(row.analise_semantica)) return false;
  const next = applySerpEvidenceRecord(row.analise_semantica, vigente.get(row.id) as KeywordSemanticQualification);
  return approvedPackageDiverged(packageInput(row, next)) === true && approvedPackageDiverged(packageInput(row, row.analise_semantica)) !== true;
});
const conclusivas = pendentes.filter(row => {
  const q = vigente.get(row.id) as KeywordSemanticQualification;
  return q.intent.strength === "conclusive" || q.funnel.strength === "conclusive";
});

console.log(`com Qualificação persistida: ${vigente.size} · keywords vivas: ${rows.length} · já com evidência vigente: ${rows.length - pendentes.length} · a projetar: ${pendentes.length}`);
console.log(`dessas, com pelo menos um eixo conclusivo: ${conclusivas.length}`);
console.log(`aprovadas que cairão em revisão pela evidência nova: ${cairaoEmRevisao.length}`);
for (const row of cairaoEmRevisao.slice(0, 15)) {
  const q = vigente.get(row.id) as KeywordSemanticQualification;
  console.log(`  · ${row.keyword} — SERP v${q.lifecycle.version}: intent=${q.intent.strength === "conclusive" ? q.intent.observedValue : "(" + q.intent.strength + ")"} funil=${q.funnel.strength === "conclusive" ? q.funnel.observedValue : "(" + q.funnel.strength + ")"}`);
}

if (!APPLY) console.log("\nDRY-RUN. Nada foi gravado. Use --apply para projetar.");

let gravadas = 0;
for (const row of APPLY ? pendentes : []) {
  const semantic = applySerpEvidenceRecord(row.analise_semantica, vigente.get(row.id) as KeywordSemanticQualification);
  const result = await supabase
    .from("minerador_keywords")
    .update({ analise_semantica: semantic })
    .eq("id", row.id)
    .eq("brand_id", row.brand_id)
    .is("deleted_at", null);
  if (result.error) throw result.error;
  gravadas += 1;
}

if (APPLY) {
  const { data: readback, error: readbackError } = await supabase
    .from("minerador_keywords")
    .select("id,analise_semantica")
    .in("id", [...vigente.keys()])
    .is("deleted_at", null);
  if (readbackError) throw readbackError;
  const desatualizadas = (readback || []).filter(row => {
    const record = readSerpEvidenceRecord((row as Row).analise_semantica);
    return !record || record.versionId !== vigente.get((row as Row).id)?.id;
  }).length;
  console.log(`gravadas: ${gravadas} · ainda sem evidência vigente após readback: ${desatualizadas}`);
  if (desatualizadas > 0) throw new Error("O readback encontrou keyword sem evidência vigente; o backfill não pode ser declarado completo.");
  console.log("BACKFILL_EVIDENCIA_SERP = OK");
}
