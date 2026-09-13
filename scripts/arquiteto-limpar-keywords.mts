/**
 * DEVOLVE AS KEYWORDS AO ESTADO "RECEBIDA, SEM PROCESSO".
 *
 * O reset completo depende de `DELETE`, que o `service_role` não tem. `UPDATE`
 * ele tem — e é o bastante para limpar a cópia de trabalho das keywords: o que
 * o Arquiteto escreveu no payload sai, e o que veio do Minerador fica.
 *
 * A lista é de PERMISSÃO. Reconstruo o payload SÓ com as chaves que a keyword
 * já trazia da origem; qualquer outra é processo desta mesa e cai fora. Uma
 * lista de exclusão erraria por omissão: chave nova de uma rodada futura
 * sobreviveria calada, e a keyword continuaria "processada" sem ninguém ver.
 *
 * O QUE FICA (origem, não é desta mesa):
 *
 *   state, source, brandId, decision, keywordId
 *   semanticQualification      — qualificação semântica do Minerador
 *   contextualPresentation     — apresentação contextual do Minerador
 *
 * O QUE SAI (processo do Arquiteto):
 *
 *   territoryRef, territoryAssignment, siloId, silo_id, siloName, siloCandidate
 *   clusterId, provisionalGroupId, workingArticleId
 *   role, computedSlug, computedHierarquia
 *   articleFormationRef, articleFormationDecision
 *   manualEdit, manualEditAt
 *
 * NÃO apaga linha nenhuma: as 28 keywords continuam na lista. NÃO toca em
 * `minerador_keywords`, em artefato versionado nem em item de outro estágio.
 *
 *   npm run limpar:keywords -- <marcaId>
 *   npm run limpar:keywords -- <marcaId> --confirm
 */

import { createClient } from "@supabase/supabase-js";

const marcaId = process.argv[2];
const confirmar = process.argv.includes("--confirm");
if (!marcaId) {
  console.error("uso: npm run limpar:keywords -- <marcaId> [--confirm]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

/** As únicas chaves que sobrevivem. Tudo mais é processo desta mesa. */
const CHAVES_DE_ORIGEM = ["state", "source", "brandId", "decision", "keywordId", "semanticQualification", "contextualPresentation"] as const;

const { data, error } = await supabase
  .from("editorial_workflow_items")
  .select("id, subject_id, lock_version, payload")
  .eq("marca_id", marcaId)
  .eq("subject_type", "keyword")
  .eq("stage", "architect");
if (error) {
  console.error("[leitura]", error);
  process.exit(1);
}

type Linha = { id: string; subject_id: string; lock_version: number; payload: Record<string, unknown> };
const linhas = (data || []) as Linha[];

const limpo = (payload: Record<string, unknown>) =>
  Object.fromEntries(CHAVES_DE_ORIGEM.filter(chave => chave in payload).map(chave => [chave, payload[chave]]));

const removidasPorChave = new Map<string, number>();
const paraLimpar: Array<{ linha: Linha; payload: Record<string, unknown>; removidas: string[] }> = [];

for (const linha of linhas) {
  const payload = linha.payload || {};
  const removidas = Object.keys(payload).filter(chave => !(CHAVES_DE_ORIGEM as readonly string[]).includes(chave));
  if (!removidas.length) continue;
  for (const chave of removidas) removidasPorChave.set(chave, (removidasPorChave.get(chave) || 0) + 1);
  paraLimpar.push({ linha, payload: limpo(payload), removidas });
}

console.log("=".repeat(78));
console.log(`LIMPAR KEYWORDS DO ARQUITETO — marca ${marcaId}`);
console.log(confirmar ? "MODO: EXECUÇÃO REAL (--confirm)" : "MODO: ENSAIO (nada será gravado)");
console.log("=".repeat(78));
console.log(`Keywords na lista: ${linhas.length}   ·   com processo a limpar: ${paraLimpar.length}`);
console.log("");
console.log("SAI DO PAYLOAD");
for (const [chave, total] of [...removidasPorChave].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${chave.padEnd(28)} ${total}`);
}
console.log("");
console.log("FICA NO PAYLOAD");
for (const chave of CHAVES_DE_ORIGEM) console.log(`  ${chave}`);
console.log("");
console.log("NÃO É TOCADO");
console.log("  minerador_keywords · editorial_artifact_versions · itens de outro estágio");
console.log("  nenhuma linha é apagada: as keywords continuam na lista");

if (!paraLimpar.length) {
  console.log("");
  console.log("A lista já está limpa.");
  process.exit(0);
}
if (!confirmar) {
  console.log("");
  console.log("Ensaio concluído. Nada foi gravado.");
  console.log(`Para executar: npm run limpar:keywords -- ${marcaId} --confirm`);
  process.exit(0);
}

console.log("");
console.log("EXECUTANDO…");
let gravadas = 0;
const falhas: string[] = [];
for (const item of paraLimpar) {
  /*
   * O `lock_version` entra na condição: se alguém tocou a linha entre a
   * leitura e a gravação, este update não casa e a keyword fica de fora em
   * vez de sobrescrever trabalho que não foi lido.
   */
  const { data: gravada, error: erroUpdate } = await supabase
    .from("editorial_workflow_items")
    .update({ payload: item.payload, lock_version: item.linha.lock_version + 1 })
    .eq("id", item.linha.id)
    .eq("marca_id", marcaId)
    .eq("lock_version", item.linha.lock_version)
    .select("id")
    .maybeSingle();
  if (erroUpdate) { falhas.push(`${item.linha.subject_id}: ${erroUpdate.message}`); continue; }
  if (!gravada) { falhas.push(`${item.linha.subject_id}: lock mudou entre a leitura e a gravação`); continue; }
  gravadas += 1;
}

console.log(`  ✓ ${gravadas} keyword(s) devolvidas ao estado de origem`);
for (const falha of falhas) console.log(`  ! ${falha}`);

/* ------------------------------ readback --------------------------------- */

const conferencia = await supabase
  .from("editorial_workflow_items")
  .select("payload")
  .eq("marca_id", marcaId)
  .eq("subject_type", "keyword")
  .eq("stage", "architect");
if (conferencia.error) {
  console.error("[readback]", conferencia.error);
  process.exit(1);
}
const aindaComProcesso = (conferencia.data || []).filter(row =>
  Object.keys((row.payload || {}) as Record<string, unknown>).some(chave => !(CHAVES_DE_ORIGEM as readonly string[]).includes(chave)));

console.log("");
console.log("READBACK");
console.log(`KEYWORDS_NA_LISTA        = ${(conferencia.data || []).length}`);
console.log(`KEYWORDS_COM_PROCESSO    = ${aindaComProcesso.length}`);
console.log(`KEYWORDS_LIMPAS          = ${(conferencia.data || []).length - aindaComProcesso.length}`);
