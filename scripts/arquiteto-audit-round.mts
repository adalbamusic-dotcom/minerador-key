/**
 * AUDITORIA READ-ONLY DA RODADA DE HOMOLOGAÇÃO.
 *
 * Este script NÃO ESCREVE NADA. Ele responde a pergunta que libera (ou não) a
 * execução do fresh contra o remoto: depois de reiniciar, algum artefato da
 * rodada anterior continuaria aparecendo como estado CORRENTE?
 *
 * Limpar a cópia de trabalho não basta. `canonical-version-authority` resolve
 * "a última aprovada", e sem a fronteira da rodada ela encontraria o SiloDNA e
 * o ArticleDNA da rodada passada. A resposta que interessa é
 * `OLD_APPROVED_ARTIFACTS_VISIBLE_AS_CURRENT = NO`.
 *
 *   npm run audit:rodada -- <marcaId>
 */

import { createClient } from "@supabase/supabase-js";
import {
  HOMOLOGATION_ROUND_SUBJECT_TYPE,
  activeHomologationRound,
  oldApprovedArtifactsVisibleAsCurrent,
  scopeArtifactsToActiveRound,
  type HomologationRound,
} from "../lib/arquiteto/homologation-round.ts";
import { HOMOLOGATION_FRESH_SUBJECTS } from "../lib/arquiteto/homologation-fresh.ts";

const marcaId = process.argv[2];
if (!marcaId) {
  console.error("uso: npm run audit:rodada -- <marcaId>");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const [itens, artefatos] = await Promise.all([
  supabase.from("editorial_workflow_items").select("subject_type, stage, payload").eq("marca_id", marcaId),
  supabase.from("editorial_artifact_versions")
    .select("entity_id, artifact_type, version_number, status, created_at")
    .eq("marca_id", marcaId)
    .order("version_number", { ascending: true }),
]);
if (itens.error) { console.error("[itens]", itens.error); process.exit(1); }
if (artefatos.error) { console.error("[artefatos]", artefatos.error); process.exit(1); }

const linhas = (itens.data || []) as Array<{ subject_type: string; stage: string; payload: unknown }>;
const versoes = (artefatos.data || []) as Array<{ entity_id: string; artifact_type: string; version_number: number; status: string; created_at: string }>;

const round = activeHomologationRound(
  linhas.filter(row => row.subject_type === HOMOLOGATION_ROUND_SUBJECT_TYPE).map(row => row.payload as HomologationRound),
);

/* O modo é do ambiente, não do banco: aqui ele apenas descreve o que valeria. */
const homologationMode = String(process.env.ARQUITETO_HOMOLOGATION_MODE || "").trim().toLowerCase() === "true";

const contarTrabalho = (subjectType: string) =>
  linhas.filter(row => row.stage === "architect" && row.subject_type === subjectType).length;

/** Canônica = última APROVADA por entidade, como a mesa resolve. */
const canonicasDe = (artifactType: string) => {
  const porEntidade = new Map<string, { createdAt: string; versionNumber: number; entityId: string }>();
  for (const row of versoes) {
    if (row.artifact_type !== artifactType || row.status !== "approved") continue;
    const atual = porEntidade.get(row.entity_id);
    if (!atual || row.version_number > atual.versionNumber) {
      porEntidade.set(row.entity_id, { createdAt: row.created_at, versionNumber: row.version_number, entityId: row.entity_id });
    }
  }
  return [...porEntidade.values()];
};

const articleDnas = canonicasDe("article_dna");
const siloDnas = canonicasDe("silo_dna");
const siloPages = canonicasDe("silo_page");
const todasCanonicas = [...articleDnas, ...siloDnas, ...siloPages];

const ativos = (lista: typeof todasCanonicas) =>
  scopeArtifactsToActiveRound({ artifacts: lista, round, homologationMode }).active.length;

console.log("=".repeat(78));
console.log(`RODADA DE HOMOLOGAÇÃO — marca ${marcaId}`);
console.log(`ARQUITETO_HOMOLOGATION_MODE = ${homologationMode ? "YES" : "NO"}`);
console.log("=".repeat(78));
console.log(`ACTIVE_HOMOLOGATION_ROUND_ID  = ${round?.roundId ?? "— (nenhuma rodada declarada)"}`);
console.log(`ROUND_STARTED_AT              = ${round?.startedAt ?? "—"}`);
console.log(`PREVIOUS_ROUND_ID             = ${round?.previousRoundId ?? "—"}`);
console.log("");
console.log("ESTADO DE TRABALHO DA RODADA ATIVA");
for (const subjectType of Object.keys(HOMOLOGATION_FRESH_SUBJECTS)) {
  console.log(`  ${subjectType.padEnd(28)} = ${contarTrabalho(subjectType)}`);
}
console.log("");
console.log("ARTEFATOS CANÔNICOS APROVADOS");
console.log(`  ACTIVE_ARTICLES             = ${ativos(articleDnas)}   (histórico: ${articleDnas.length})`);
console.log(`  ACTIVE_SILOS                = ${ativos(siloDnas)}   (histórico: ${siloDnas.length})`);
console.log(`  ACTIVE_SILO_PAGES           = ${ativos(siloPages)}   (histórico: ${siloPages.length})`);
console.log(`  HISTORICAL_SERP_ASSESSMENTS = ${contarTrabalho("article_formation_serp_assessment") || linhas.filter(row => row.subject_type === "article_formation_serp_assessment").length}`);
console.log("");

const visiveis = oldApprovedArtifactsVisibleAsCurrent({
  round,
  homologationMode,
  currentApproved: scopeArtifactsToActiveRound({ artifacts: todasCanonicas, round, homologationMode }).active,
});
console.log(`OLD_APPROVED_ARTIFACTS_VISIBLE_AS_CURRENT = ${visiveis ? "YES" : "NO"}`);
if (!round) {
  console.log("  motivo: nenhuma rodada foi declarada ainda — a fronteira só passa a valer depois do primeiro reinício.");
} else if (!homologationMode) {
  console.log("  motivo: fora do modo de homologação o universo é o acervo inteiro, por desenho.");
}
console.log("");
console.log("NO_WRITES          = YES");
console.log("PROVIDER_CALLS     = 0");
