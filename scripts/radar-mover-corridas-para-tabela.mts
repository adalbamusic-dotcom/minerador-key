/**
 * Move as corridas brutas de cada versão de análise para `radar_analysis_runs`.
 *
 * Medido em 2026-09-21: a maior linha de `editorial_workflow_items` tem
 * 8032 kB. `appendRadarAnalysis` lê a linha inteira, acrescenta UMA versão e
 * regrava tudo — ~8 MB de descida mais ~8 MB de subida por análise nova.
 *
 * O script tem DOIS passos, separados de propósito:
 *
 *   --apply        copia as corridas para a tabela. Nada é removido do
 *                  payload: o dado fica nos dois lugares, e a reidratação na
 *                  leitura vira no-op. Reversível por construção.
 *
 *   --esvaziar     só depois que a leitura e a escrita já passam pela tabela,
 *                  esvazia as corridas do payload do workflow. É aqui que a
 *                  economia acontece, e é aqui que não há volta sem o passo
 *                  anterior ter funcionado.
 *
 * O readback não confere se gravou: confere se a FUSÃO devolve a versão
 * idêntica à original, campo a campo. Copiar sem conseguir reconstruir seria
 * pior do que não copiar.
 *
 * Uso:
 *   npm run radar:mover-corridas                (dry-run)
 *   npm run radar:mover-corridas -- --apply     (copia)
 *   npm run radar:mover-corridas -- --esvaziar  (esvazia o payload)
 */
import { createClient } from "@supabase/supabase-js";
import { hasInlineAnalysisRun, mergeAnalysisRun, splitAnalysisRun } from "../lib/radar/analysis-run-storage.ts";

const APPLY = process.argv.includes("--apply");
const ESVAZIAR = process.argv.includes("--esvaziar");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");
if (APPLY && ESVAZIAR) throw new Error("Um passo de cada vez: --apply copia, --esvaziar remove. Nunca juntos.");

const supabase = createClient(url, key, { auth: { persistSession: false } });

type Registro = Record<string, unknown>;

type Linha = {
  id: string;
  marca_id: string;
  article_id: string | null;
  payload: Registro | null;
  lock_version: number;
};

function versoesDe(payload: Registro | null): Registro[] {
  const lista = payload?.analysisVersions;
  return Array.isArray(lista) ? lista.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Registro[] : [];
}

const { data, error } = await supabase
  .from("editorial_workflow_items")
  .select("id,marca_id,article_id,payload,lock_version")
  .eq("stage", "radar");
if (error) throw error;
const linhas = (data || []) as Linha[];

console.log(`linhas de estágio radar: ${linhas.length}`);

let versoesTotais = 0;
let comCorrida = 0;
let copiadas = 0;
let esvaziadas = 0;
const falhas: string[] = [];

for (const linha of linhas) {
  const versoes = versoesDe(linha.payload);
  versoesTotais += versoes.length;

  const corridas: Array<{ versionId: string; run: Registro; original: Registro }> = [];
  for (const versao of versoes) {
    const versionId = typeof versao.versionId === "string" ? versao.versionId : null;
    if (!versionId) {
      falhas.push(`${linha.id}: versão sem versionId — não dá para endereçar a corrida`);
      continue;
    }
    if (!hasInlineAnalysisRun(versao)) continue;
    comCorrida += 1;
    const { run } = splitAnalysisRun(versao);
    corridas.push({ versionId, run, original: versao });
  }

  const peso = Math.round(JSON.stringify(linha.payload || {}).length / 1024);
  console.log(`  ${linha.article_id || linha.id}: ${versoes.length} versões, ${corridas.length} com corrida, ${peso} kB`);

  if (!APPLY || corridas.length === 0) continue;

  const { error: erroGravacao } = await supabase.from("radar_analysis_runs").upsert(
    corridas.map(item => ({
      workflow_item_id: linha.id,
      version_id: item.versionId,
      marca_id: linha.marca_id,
      article_id: linha.article_id,
      payload: item.run,
    })),
    { onConflict: "workflow_item_id,version_id" },
  );
  if (erroGravacao) throw erroGravacao;

  // READBACK: a fusão tem de devolver a versão idêntica à original.
  const { data: gravadas, error: erroLeitura } = await supabase
    .from("radar_analysis_runs")
    .select("version_id,payload")
    .eq("workflow_item_id", linha.id);
  if (erroLeitura) throw erroLeitura;
  const porVersao = new Map((gravadas || []).map(item => [String(item.version_id), item.payload as Registro]));

  for (const item of corridas) {
    const guardada = porVersao.get(item.versionId);
    if (!guardada) {
      falhas.push(`${linha.id}/${item.versionId}: corrida não voltou na leitura`);
      continue;
    }
    const { light } = splitAnalysisRun(item.original);
    const refeita = mergeAnalysisRun(light, guardada);
    if (JSON.stringify(refeita) !== JSON.stringify(item.original)) {
      falhas.push(`${linha.id}/${item.versionId}: a fusão NÃO devolve a versão original`);
      continue;
    }
    copiadas += 1;
  }
}

if (ESVAZIAR) {
  console.log("\nesvaziando as corridas do payload do workflow...");
  for (const linha of linhas) {
    const versoes = versoesDe(linha.payload);
    if (versoes.length === 0) continue;

    // Só esvazia o que já está guardado: uma corrida sem linha na tabela
    // lateral não pode sair do payload, ou some.
    const { data: gravadas, error: erroLeitura } = await supabase
      .from("radar_analysis_runs")
      .select("version_id")
      .eq("workflow_item_id", linha.id);
    if (erroLeitura) throw erroLeitura;
    const guardadas = new Set((gravadas || []).map(item => String(item.version_id)));

    let mudou = false;
    const leves = versoes.map(versao => {
      const versionId = typeof versao.versionId === "string" ? versao.versionId : null;
      if (!versionId || !hasInlineAnalysisRun(versao)) return versao;
      if (!guardadas.has(versionId)) {
        falhas.push(`${linha.id}/${versionId}: corrida no payload SEM linha na tabela — não esvaziada`);
        return versao;
      }
      mudou = true;
      return splitAnalysisRun(versao).light;
    });
    if (!mudou) continue;

    const novoPayload = { ...(linha.payload || {}), analysisVersions: leves };
    const { error: erroEscrita } = await supabase
      .from("editorial_workflow_items")
      .update({ payload: novoPayload })
      .eq("id", linha.id)
      .eq("lock_version", linha.lock_version);
    if (erroEscrita) throw erroEscrita;
    esvaziadas += 1;
    const antes = Math.round(JSON.stringify(linha.payload || {}).length / 1024);
    const depois = Math.round(JSON.stringify(novoPayload).length / 1024);
    console.log(`  ${linha.article_id || linha.id}: ${antes} kB -> ${depois} kB`);
  }
}

console.log(`\nversões: ${versoesTotais} · com corrida no payload: ${comCorrida}`);
if (APPLY) console.log(`copiadas e conferidas pela fusão: ${copiadas}`);
if (ESVAZIAR) console.log(`linhas esvaziadas: ${esvaziadas}`);
if (falhas.length) {
  console.log(`\nFALHAS (${falhas.length}):`);
  for (const falha of falhas.slice(0, 20)) console.log(`  · ${falha}`);
  process.exitCode = 1;
} else if (APPLY || ESVAZIAR) {
  console.log("sem falhas.");
}
if (!APPLY && !ESVAZIAR) console.log("\nDRY-RUN. Nada foi gravado. Use --apply para copiar.");
