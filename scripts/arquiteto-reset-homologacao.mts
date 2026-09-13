/**
 * RESET DA HOMOLOGAÇÃO DO ARQUITETO — destrutivo e escopado.
 *
 * Apaga PERMANENTEMENTE o estado editorial do Arquiteto de UMA marca, para
 * recomeçar a homologação do zero. Autorizado explicitamente pelo Planejador
 * para a marca de teste; não existe caminho de volta.
 *
 * A trava principal não é a confirmação: é o ESCOPO.
 *
 * `editorial_artifact_versions` guarda, na mesma tabela e sob a mesma marca,
 * artefatos que NÃO são do Arquiteto — `keyword_semantic_qualification`,
 * `keyword_contextual_presentation` e `brand_skill`. Na marca de teste eles são
 * mais da metade das linhas. Um delete por `marca_id` destruiria o trabalho do
 * Minerador junto, e o §2 do corte manda preservá-lo. Por isso o filtro é por
 * TIPO, sempre.
 *
 * Também fica de fora tudo que tem `stage` de outro módulo: item do Radar é
 * mesa do Radar, e esta operação não decide por ela.
 *
 * Padrão é ENSAIO. Só `--confirm` executa:
 *
 *   npm run reset:arquiteto -- <marcaId>
 *   npm run reset:arquiteto -- <marcaId> --confirm
 */

import { createClient } from "@supabase/supabase-js";

const marcaId = process.argv[2];
const confirmar = process.argv.includes("--confirm");
if (!marcaId) {
  console.error("uso: npm run reset:arquiteto -- <marcaId> [--confirm]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const falhar = (contexto: string, error: unknown) => {
  console.error(`[${contexto}]`, error);
  process.exit(1);
};

/** Artefatos versionados que pertencem ao Arquiteto. Só estes saem. */
const ARQUITETO_ARTIFACT_TYPES = ["article_dna", "silo_dna", "silo_page", "article_architecture_ai_review"] as const;

/** Tipos que ficam: são de outra mesa e o corte manda preservar. */
const PRESERVED_ARTIFACT_TYPES = ["keyword_semantic_qualification", "keyword_contextual_presentation", "brand_skill"] as const;

/** Tabelas do grafo, na ordem em que as dependências permitem apagar. */
const GRAPH_TABLES = [
  "internal_link_graph_edges",
  "internal_link_graph_nodes",
  "internal_link_graph_proposals",
  "internal_link_graph_working_copies",
  "internal_link_graphs",
] as const;

/** SERP do Arquiteto: chaveada por `article_id` da mesa. */
const SERP_TABLES = ["editorial_serp_reviews", "editorial_serp_snapshots"] as const;

const contar = async (tabela: string, aplicar: (query: ReturnType<typeof supabase.from>) => unknown) => {
  const query = supabase.from(tabela).select("*", { count: "exact", head: true }).eq("marca_id", marcaId);
  const result = await (aplicar(query as never) as never as Promise<{ count: number | null; error: unknown }>);
  if (result.error) falhar(`contagem ${tabela}`, result.error);
  return result.count ?? 0;
};

console.log("=".repeat(78));
console.log(`RESET DO ARQUITETO — marca ${marcaId}`);
console.log(confirmar ? "MODO: EXECUÇÃO REAL (--confirm)" : "MODO: ENSAIO (nada será apagado)");
console.log("=".repeat(78));

/* ---------------------------- o que sai ---------------------------------- */

const versoes = await supabase
  .from("editorial_artifact_versions")
  .select("version_id, artifact_type")
  .eq("marca_id", marcaId)
  .in("artifact_type", ARQUITETO_ARTIFACT_TYPES as unknown as string[]);
if (versoes.error) falhar("versões", versoes.error);
const versionIds = (versoes.data || []).map(row => String(row.version_id));

const porTipo = new Map<string, number>();
for (const row of versoes.data || []) porTipo.set(String(row.artifact_type), (porTipo.get(String(row.artifact_type)) || 0) + 1);

const eventos = versionIds.length
  ? await supabase.from("editorial_version_status_events").select("id", { count: "exact", head: true }).in("version_id", versionIds)
  : { count: 0, error: null };
if (eventos.error) falhar("eventos", eventos.error);

const workflowArquiteto = await contar("editorial_workflow_items", query => (query as never as { eq: (a: string, b: string) => unknown }).eq("stage", "architect"));

console.log("");
console.log("SERÁ APAGADO");
console.log(`  editorial_version_status_events            ${eventos.count ?? 0}  (só dos artefatos do Arquiteto)`);
for (const tipo of ARQUITETO_ARTIFACT_TYPES) {
  console.log(`  editorial_artifact_versions · ${tipo.padEnd(30)} ${porTipo.get(tipo) || 0}`);
}
console.log(`  editorial_workflow_items · stage=architect  ${workflowArquiteto}`);
for (const tabela of GRAPH_TABLES) console.log(`  ${tabela.padEnd(42)} ${await contar(tabela, query => query)}`);
for (const tabela of SERP_TABLES) console.log(`  ${tabela.padEnd(42)} ${await contar(tabela, query => query)}`);

/* --------------------------- o que fica ---------------------------------- */

console.log("");
console.log("SERÁ PRESERVADO");
for (const tipo of PRESERVED_ARTIFACT_TYPES) {
  const total = await contar("editorial_artifact_versions", query => (query as never as { eq: (a: string, b: string) => unknown }).eq("artifact_type", tipo));
  console.log(`  editorial_artifact_versions · ${tipo.padEnd(30)} ${total}   (Minerador/Brand — não é desta mesa)`);
}
const outroEstagio = await supabase
  .from("editorial_workflow_items")
  .select("stage", { count: "exact", head: true })
  .eq("marca_id", marcaId)
  .neq("stage", "architect");
if (outroEstagio.error) falhar("outros estágios", outroEstagio.error);
console.log(`  editorial_workflow_items · outros estágios  ${outroEstagio.count ?? 0}   (Radar/Planejador decidem por eles)`);
console.log("  minerador_keywords, marcas, memberships    intocados");

/* ------------------------- a sonda de permissão -------------------------- */

/*
 * DELETE pode estar negado ao `service_role`, e é o caso aqui.
 *
 * Descobrir isso no meio da execução deixaria o reset pela metade — algumas
 * tabelas limpas, outras não, e o cenário num estado que ninguém pediu. A
 * sonda roda um delete que casa com NADA em cada tabela: ela prova a permissão
 * sem apagar uma linha sequer.
 */
const NADA = "00000000-0000-0000-0000-000000000000";
const TABELAS_ALVO = [
  ["editorial_version_status_events", "version_id"],
  ["editorial_artifact_versions", "marca_id"],
  ["editorial_workflow_items", "marca_id"],
  ...GRAPH_TABLES.map(tabela => [tabela, "marca_id"] as const),
  ...SERP_TABLES.map(tabela => [tabela, "marca_id"] as const),
] as const;

const semPermissao: string[] = [];
for (const [tabela, coluna] of TABELAS_ALVO) {
  const { error } = await supabase.from(tabela).delete().eq(coluna, NADA);
  if (error && (error as { code?: string }).code === "42501") semPermissao.push(tabela);
  else if (error) falhar(`sonda ${tabela}`, error);
}

if (semPermissao.length) {
  console.log("");
  console.log(`BLOQUEIO: o service_role não tem DELETE em ${semPermissao.length} tabela(s).`);
  console.log("Nada foi apagado. O proprietário do banco precisa conceder:");
  console.log("");
  for (const tabela of semPermissao) console.log(`  GRANT DELETE ON public.${tabela} TO service_role;`);
  console.log("");
  console.log("Depois disso, rode o ensaio de novo e só então o --confirm.");
  process.exit(1);
}

if (!confirmar) {
  console.log("");
  console.log("Permissões conferidas: DELETE disponível em todas as tabelas do escopo.");
  console.log("Ensaio concluído. Nada foi apagado.");
  console.log(`Para executar: npm run reset:arquiteto -- ${marcaId} --confirm`);
  process.exit(0);
}

/* ---------------------------- a execução --------------------------------- */

console.log("");
console.log("EXECUTANDO…");

const apagar = async (rotulo: string, executar: () => Promise<{ error: unknown }>) => {
  const { error } = await executar();
  if (error) falhar(rotulo, error);
  console.log(`  ✓ ${rotulo}`);
};

/*
 * Eventos primeiro: eles apontam para as versões.
 *
 * Esta tabela pode não conceder DELETE ao `service_role` — é o caso do
 * ambiente de homologação (42501). Isso NÃO impede o reset: o status canônico
 * que a mesa lê é a coluna `status` da própria versão, e um evento cujo
 * `version_id` deixou de existir é inerte. O que não pode acontecer é a falta
 * de permissão passar despercebida, então ela é reportada por extenso.
 */
const eventosNaoRemovidos: string[] = [];
if (versionIds.length) {
  for (let i = 0; i < versionIds.length; i += 200) {
    const lote = versionIds.slice(i, i + 200);
    const { error } = await supabase.from("editorial_version_status_events").delete().in("version_id", lote);
    if (!error) {
      console.log(`  ✓ status events ${i + 1}–${i + lote.length}`);
      continue;
    }
    const codigo = (error as { code?: string }).code;
    if (codigo !== "42501") falhar("status events", error);
    eventosNaoRemovidos.push(`${i + 1}–${i + lote.length}`);
  }
  if (eventosNaoRemovidos.length) {
    console.log(`  ! editorial_version_status_events: sem permissão de DELETE (42501). ${eventos.count ?? 0} evento(s) ficam órfãos e inertes.`);
  }
}

await apagar("editorial_artifact_versions (só tipos do Arquiteto)", () =>
  supabase.from("editorial_artifact_versions").delete()
    .eq("marca_id", marcaId)
    .in("artifact_type", ARQUITETO_ARTIFACT_TYPES as unknown as string[]) as never);

await apagar("editorial_workflow_items (stage=architect)", () =>
  supabase.from("editorial_workflow_items").delete().eq("marca_id", marcaId).eq("stage", "architect") as never);

for (const tabela of GRAPH_TABLES) {
  await apagar(tabela, () => supabase.from(tabela).delete().eq("marca_id", marcaId) as never);
}
for (const tabela of SERP_TABLES) {
  await apagar(tabela, () => supabase.from(tabela).delete().eq("marca_id", marcaId) as never);
}

/* ---------------------------- o readback --------------------------------- */

console.log("");
console.log("READBACK");
const restanteVersoes = await supabase
  .from("editorial_artifact_versions")
  .select("artifact_type", { count: "exact", head: true })
  .eq("marca_id", marcaId)
  .in("artifact_type", ARQUITETO_ARTIFACT_TYPES as unknown as string[]);
const restanteWorkflow = await contar("editorial_workflow_items", query => (query as never as { eq: (a: string, b: string) => unknown }).eq("stage", "architect"));
const preservadas = await supabase
  .from("editorial_artifact_versions")
  .select("artifact_type", { count: "exact", head: true })
  .eq("marca_id", marcaId)
  .in("artifact_type", PRESERVED_ARTIFACT_TYPES as unknown as string[]);

console.log(`ARQUITETO_ARTIFACTS_AFTER_RESET = ${restanteVersoes.count ?? 0}`);
console.log(`ARQUITETO_WORKFLOW_AFTER_RESET  = ${restanteWorkflow}`);
for (const tabela of [...GRAPH_TABLES, ...SERP_TABLES]) {
  console.log(`${tabela.padEnd(38)} = ${await contar(tabela, query => query)}`);
}
console.log(`MINERADOR_ARTIFACTS_PRESERVED   = ${preservadas.count ?? 0}`);
console.log(`STATUS_EVENTS_ORFAOS            = ${eventosNaoRemovidos.length ? (eventos.count ?? 0) : 0}`);
console.log(`OTHER_STAGE_ITEMS_PRESERVED     = ${outroEstagio.count ?? 0}`);
