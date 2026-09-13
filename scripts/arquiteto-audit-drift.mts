/**
 * MATRIZ DE DRIFT — O CENÁRIO APROVADO CONTRA A WORKING COPY DE HOJE.
 *
 * O baseline é o ArticleDNA APROVADO: ele é o histórico imutável do que o
 * humano fechou. A projeção corrente é PROPOSTA — um candidato que a tela
 * mostra hoje não é o Article, por mais convincente que pareça.
 *
 * Inverter isso seria concluir que "skin care barato" virou artigo só porque
 * o agrupador o desenha agora.
 *
 * Somente SELECT. Nenhum provider, nenhuma escrita.
 *
 *   npm run audit:drift -- <marcaId>
 */

import { createClient } from "@supabase/supabase-js";
import { buildCanonicalWorkflowWorkspaceItems } from "../lib/arquiteto/canonical-workspace.ts";
import { buildSiloScopedProvisionalGroups } from "../lib/arquiteto/article-formation-scope.ts";
import { buildArticleFormationUniverse } from "../lib/arquiteto/article-formation.ts";
import { resolveArticleFormationState } from "../lib/arquiteto/article-formation-decision.ts";

const marcaId = process.argv[2];
if (!marcaId) {
  console.error("uso: npm run audit:drift -- <marcaId>");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

const [itensRes, kwRes, artefatosRes] = await Promise.all([
  supabase.from("editorial_workflow_items").select("marca_id, subject_type, subject_id, stage, state, payload, updated_at").eq("marca_id", marcaId),
  supabase.from("minerador_keywords").select("*").eq("brand_id", marcaId).is("deleted_at", null),
  supabase.from("editorial_artifact_versions").select("entity_id, version_id, version_number, status, payload").eq("marca_id", marcaId).eq("artifact_type", "article_dna"),
]);
for (const [nome, res] of [["workflow", itensRes], ["keywords", kwRes], ["artefatos", artefatosRes]] as const) {
  if (res.error) { console.error(`[${nome}]`, res.error.message); process.exit(1); }
}

type Row = { marca_id: string; subject_type: string; subject_id: string; stage: string; state: string; payload: Record<string, unknown>; updated_at: string };
const linhas = (itensRes.data || []) as Row[];
const keywordRows = (kwRes.data || []) as Array<Record<string, unknown> & { id: string; keyword: string }>;
const nomeKw = new Map(keywordRows.map(k => [String(k.id), String(k.keyword)]));

/* ------------------------- baseline: os aprovados ------------------------ */

const aprovadas = ((artefatosRes.data || []) as Array<{ entity_id: string; version_id: string; version_number: number; status: string; payload: Record<string, unknown> }>)
  .filter(row => row.status === "approved");
const vigentes = new Map<string, (typeof aprovadas)[number]>();
for (const row of aprovadas) {
  const atual = vigentes.get(row.entity_id);
  if (!atual || row.version_number > atual.version_number) vigentes.set(row.entity_id, row);
}
// O corte são os que declaram território: os outros dois são acervo à parte.
const baseline = [...vigentes.values()].filter(row => texto(row.payload.territoryRef));

/* --------------------------- a working copy ------------------------------ */

const assignmentPorKeyword = new Map(linhas
  .filter(row => row.subject_type === "keyword")
  .map(row => [row.subject_id, { payload: row.payload, updatedAt: row.updated_at }]));

const masterList = buildCanonicalWorkflowWorkspaceItems(
  linhas.map(row => ({ marcaId: row.marca_id, subjectType: row.subject_type, subjectId: row.subject_id, stage: row.stage, state: row.state, payload: row.payload })) as never,
  keywordRows as never, marcaId,
) as unknown as Array<Record<string, unknown>>;
const naMasterList = new Set(masterList.map(k => String(k.id)));

const territorios = linhas.filter(row => row.subject_type === "territory")
  .map(row => ({ ref: row.subject_id, t: (row.payload?.territory ?? row.payload) as Record<string, unknown> }));
const nomeTerr = new Map(territorios.map(item => [item.ref, texto(item.t.name) || item.ref]));
const statusTerr = new Map(territorios.map(item => [item.ref, texto(item.t.lifecycleStatus) || "?"]));
const confirmados = territorios.filter(item => ["confirmed", "consolidated"].includes(statusTerr.get(item.ref) || ""));

/* --------------------------- a projeção corrente ------------------------- */

const porSilo = new Map<string, Array<Record<string, unknown>>>();
for (const k of masterList) {
  const ref = texto(k.territoryRef); if (!ref) continue;
  porSilo.set(ref, [...(porSilo.get(ref) || []), k]);
}
const grupos = buildSiloScopedProvisionalGroups({
  silos: confirmados.map(item => {
    const slugState = item.t.slugState as { publishedSlug?: string; confirmed?: string; proposals?: Array<{ slug: string }> } | undefined;
    const slug = slugState?.publishedSlug || slugState?.confirmed || slugState?.proposals?.[0]?.slug || null;
    return { siloRef: item.ref, siloLabel: texto(item.t.name) || "Silo", siloSlug: slug ? (slug.startsWith("/") ? slug : `/${slug}`) : null };
  }),
  keywordsBySiloRef: porSilo as never,
});

type Candidato = { candidateRef: string; principalKeywordId: string; keywords: Array<{ keywordId: string; role: string }> };
const candidatos: Candidato[] = [];
for (const item of confirmados) {
  const escopo = grupos.find(g => g.siloRef === item.ref);
  if (!escopo) continue;
  const universe = buildArticleFormationUniverse({
    siloRef: item.ref, siloLabel: escopo.siloLabel, siloSlug: escopo.siloSlug,
    groups: escopo.groups.map(g => ({ principalKeywordId: String(g.principalSuggestion.keywordId), keywordIds: g.keywords.map(k => String(k.id)) })),
    siloContext: { centralEntity: texto(item.t.centralEntity), macroIntent: texto(item.t.macroIntent), boundaryIncludes: [], narrative: texto(item.t.narrative) },
    keywords: (porSilo.get(item.ref) || []).map(k => {
      const semantic = (k.analise_semantica || {}) as Record<string, unknown>;
      const formacao = resolveArticleFormationState(k);
      return { keywordId: String(k.id), keyword: String(k.keyword || ""), intent: texto(semantic.intencao_principal) || texto(k.intent), volume: (k.volume_search as number | null) ?? null, isPublished: Boolean(k.isPublished),
        // O agrupamento humano manda: sem isto o universo reagrupa por
        // similaridade e inventa um drift que a tela não tem.
        humanFormationRef: formacao.formationRef, humanRole: formacao.decision?.role ?? null };
    }) as never,
  }) as unknown as { candidates: Candidato[] };
  candidatos.push(...universe.candidates);
}

/* ------------------------------ a matriz --------------------------------- */

console.log("=".repeat(96));
console.log(`MATRIZ DE DRIFT — marca ${marcaId}`);
console.log(`baseline (ArticleDNA aprovados com território) = ${baseline.length}   ·   candidatos projetados hoje = ${candidatos.length}`);
console.log("PROVIDER_CALLS = 0 · REMOTE_WRITES = 0");
console.log("=".repeat(96));

let exatos = 0, comDrift = 0, naoProjetados = 0;
const semExplicacao: string[] = [];

for (const row of baseline.sort((a, b) => a.entity_id.localeCompare(b.entity_id))) {
  const dna = row.payload as { articleId: string; principalKeywordId: string; keywordReferences: Array<{ keywordId: string; role: string }>; territoryRef?: string; siloId?: string | null; suggestedSlug?: string };
  const membrosAprovados = dna.keywordReferences.map(r => r.keywordId);
  const principalAprovada = dna.principalKeywordId;
  const territorioAprovado = texto(dna.territoryRef);

  const candidato = candidatos.find(c => c.keywords.some(k => k.keywordId === principalAprovada))
    || candidatos.find(c => membrosAprovados.some(id => c.keywords.some(k => k.keywordId === id)));

  const membrosAtuais = candidato?.keywords.map(k => k.keywordId) ?? [];
  const faltando = membrosAprovados.filter(id => !membrosAtuais.includes(id));
  const adicionados = membrosAtuais.filter(id => !membrosAprovados.includes(id));
  const mudancasTerritorio = membrosAprovados
    .map(id => ({ id, atual: texto(assignmentPorKeyword.get(id)?.payload?.territoryRef) }))
    .filter(item => item.atual !== territorioAprovado);

  const status = !candidato ? "NOT_PROJECTED"
    : faltando.length === 0 && adicionados.length === 0 && candidato.principalKeywordId === principalAprovada ? "MATCH"
    : candidato.principalKeywordId !== principalAprovada && faltando.length === 0 && adicionados.length === 0 ? "PRINCIPAL_DRIFT"
    : mudancasTerritorio.length ? "TERRITORY_DRIFT"
    : adicionados.length ? "REGROUPED"
    : "MEMBERSHIP_DRIFT";

  if (status === "MATCH") exatos += 1;
  else if (status === "NOT_PROJECTED") { naoProjetados += 1; comDrift += 1; }
  else comDrift += 1;

  console.log("");
  console.log("-".repeat(96));
  console.log(`APPROVED   ${nomeKw.get(principalAprovada) ?? dna.articleId}   [v${row.version_number}]`);
  console.log(`  members  ${membrosAprovados.map(id => nomeKw.get(id) ?? id).join(" · ")}`);
  console.log(`  silo     ${nomeTerr.get(territorioAprovado || "") ?? territorioAprovado} (${statusTerr.get(territorioAprovado || "") ?? "?"})`);
  console.log(`  CURRENT  ${candidato ? `principal=${nomeKw.get(candidato.principalKeywordId) ?? candidato.principalKeywordId}` : "NÃO PROJETADO"}`);
  if (candidato) console.log(`  members  ${membrosAtuais.map(id => nomeKw.get(id) ?? id).join(" · ")}`);
  if (faltando.length) console.log(`  FALTAM   ${faltando.map(id => nomeKw.get(id) ?? id).join(" · ")}`);
  if (adicionados.length) console.log(`  ENTRARAM ${adicionados.map(id => nomeKw.get(id) ?? id).join(" · ")}`);
  for (const item of mudancasTerritorio) {
    const a = assignmentPorKeyword.get(item.id);
    const p = (a?.payload || {}) as Record<string, unknown>;
    console.log(`  MOVEU    ${nomeKw.get(item.id) ?? item.id}: ${nomeTerr.get(territorioAprovado || "") ?? "?"} → ${nomeTerr.get(item.atual || "") ?? item.atual ?? "sem Silo"} (${statusTerr.get(item.atual || "") ?? "?"})`);
    console.log(`           cluster=${p.clusterId ?? "—"} role=${p.role ?? "—"} manualEdit=${p.manualEdit ?? false} manualEditAt=${p.manualEditAt ?? "—"} updatedAt=${a?.updatedAt ?? "—"}`);
  }
  for (const id of membrosAprovados) {
    if (naMasterList.has(id)) continue;
    semExplicacao.push(`${nomeKw.get(id) ?? id} não chega ao masterList`);
  }
  console.log(`  STATUS   ${status}`);
}

console.log("");
console.log("=".repeat(96));
console.log(`APPROVED_ARTICLES_EXACT_MATCH   = ${exatos}/${baseline.length}`);
console.log(`APPROVED_ARTICLES_DRIFTED       = ${comDrift}/${baseline.length}`);
console.log(`APPROVED_ARTICLES_NOT_PROJECTED = ${naoProjetados}/${baseline.length}`);
console.log(`WORKING_COPY_DRIFT_SCOPE        = ${comDrift > baseline.length / 2 ? "GLOBAL" : "LOCAL"}`);
if (semExplicacao.length) console.log(`SEM EXPLICAÇÃO: ${[...new Set(semExplicacao)].join(" · ")}`);
console.log("SAFE_TO_REPROCESS_ARTICLES = NO   SAFE_TO_CONCLUDE_FORMATION = NO");
