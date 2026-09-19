/**
 * Backfill do registro de aprovação das keywords aprovadas antes do contrato.
 *
 * Uma keyword `aprovado` sem `analise_semantica.aprovacao` não produz pacote:
 * `buildApprovedPackage` devolve null e o Arquiteto cai na linha viva — que é
 * justamente o que o contrato de aprovação versionada existe para eliminar.
 *
 * O que o backfill afirma é verdade por construção: o estado ATUAL da keyword
 * é o que o Arquiteto vem lendo desde sempre, porque até agora ele lia a linha
 * viva. Congelar esse mesmo estado como "o que foi aprovado" não muda nada do
 * que alguém vê; só passa a existir um retrato para comparar daqui em diante.
 *
 * A trava de aprovação NÃO é aplicada retroativamente. Desaprovar 29 keywords
 * que o usuário já aprovou seria o Dev revogando decisão humana.
 *
 * Uso:
 *   node --env-file-if-exists=.env.local ... scripts/minerador-backfill-aprovacao.mts            (dry-run)
 *   node ... scripts/minerador-backfill-aprovacao.mts --apply                                    (grava)
 */
import { createClient } from "@supabase/supabase-js";
import { applyApproval, readApprovalRecord, resolveApprovalReadiness } from "../lib/minerador/approved-package.ts";

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

const { data, error } = await supabase
  .from("minerador_keywords")
  .select("id,brand_id,keyword,status,intent,volume_search,results_allintitle,kgr_score,lista_id,analise_semantica")
  .eq("status", "aprovado")
  .is("deleted_at", null);
if (error) throw error;

const rows = (data || []) as Row[];
const pendentes = rows.filter(row => !readApprovalRecord(row.analise_semantica));

console.log(`aprovadas: ${rows.length} · já com registro: ${rows.length - pendentes.length} · a preencher: ${pendentes.length}`);

// Diagnóstico honesto: quantas dessas NÃO passariam na trava de hoje. Elas são
// preenchidas assim mesmo — o backfill registra o passado, não o julga.
const naoPassariam = pendentes.filter(row => !resolveApprovalReadiness({
  semantic: row.analise_semantica,
  intent: row.intent,
  volumeSearch: row.volume_search,
  resultsAllintitle: row.results_allintitle,
}).ok);
console.log(`dessas, não passariam na trava de hoje: ${naoPassariam.length}`);
for (const row of naoPassariam.slice(0, 10)) {
  const faltando = resolveApprovalReadiness({
    semantic: row.analise_semantica,
    intent: row.intent,
    volumeSearch: row.volume_search,
    resultsAllintitle: row.results_allintitle,
  }).missing.join(", ");
  console.log(`  · ${row.keyword} — falta ${faltando}`);
}

// `process.exit` com o cliente Supabase aberto derruba o libuv com assert; o
// fluxo normal encerra sozinho quando não há o que gravar.
if (!APPLY) console.log("\nDRY-RUN. Nada foi gravado. Use --apply para registrar.");

let gravadas = 0;
for (const row of APPLY ? pendentes : []) {
  const semantic = await applyApproval({
    keywordId: row.id,
    brandId: row.brand_id,
    keyword: row.keyword,
    intent: row.intent,
    volumeSearch: row.volume_search,
    resultsAllintitle: row.results_allintitle,
    kgrScore: row.kgr_score,
    listaId: row.lista_id,
    semantic: row.analise_semantica,
    approvedAt: new Date().toISOString(),
    approvedBy: "backfill:aprovacao-versionada-2026-09-18",
  });
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
// Readback: a afirmação só vale depois de reler do banco.
const { data: readback, error: readbackError } = await supabase
  .from("minerador_keywords")
  .select("id,analise_semantica")
  .eq("status", "aprovado")
  .is("deleted_at", null);
if (readbackError) throw readbackError;
const semRegistro = (readback || []).filter(row => !readApprovalRecord((row as { analise_semantica: Record<string, unknown> | null }).analise_semantica)).length;

console.log(`gravadas: ${gravadas} · aprovadas ainda sem registro após readback: ${semRegistro}`);
if (semRegistro > 0) throw new Error("O readback encontrou aprovada sem registro; o backfill não pode ser declarado completo.");
console.log("BACKFILL_APROVACAO = OK");
}
