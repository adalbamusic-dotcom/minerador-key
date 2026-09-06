/**
 * AUDITORIA READ-ONLY DA BASE DE FORMAÇÃO — PELA AUTORIDADE, NÃO POR RÉPLICA.
 *
 * Tentar reconstruir `formationBaseHash` montando a base à mão falhou duas
 * vezes, e por um bom motivo: a base não sai do ArticleDNA. Ela é produzida em
 * tempo de execução por uma cadeia de funções puras que partem das keywords
 * vivas, do território confirmado e do agrupamento canônico.
 *
 * Este script NÃO reimplementa nada. Ele carrega o mesmo estado remoto que a
 * tela carrega e chama exatamente as mesmas funções, na mesma ordem:
 *
 *   loadCanonicalArquitetoWorkspace + listTerritoryWorkflowItems
 *     → buildSiloScopedProvisionalGroups
 *     → buildArticleFormationUniverse
 *     → articleSerpBaseOf
 *     → articleSerpBaseHash
 *     → comparação com o assessment persistido
 *
 * Somente SELECT. Nenhum provider. Nada é escrito.
 *
 *   npm run audit:formation -- <marcaId> [filtroDaKeyword]
 */

import { createClient } from "@supabase/supabase-js";
import { buildCanonicalWorkflowWorkspaceItems } from "../lib/arquiteto/canonical-workspace.ts";
import { buildSiloScopedProvisionalGroups } from "../lib/arquiteto/article-formation-scope.ts";
import { buildArticleFormationUniverse } from "../lib/arquiteto/article-formation.ts";
import { resolveArticleFormationState } from "../lib/arquiteto/article-formation-decision.ts";
import { articleSerpBaseHash, articleSerpBaseOf } from "../lib/arquiteto/article-serp-gate.ts";

const marcaId = process.argv[2];
const filtro = (process.argv[3] || "").toLowerCase();
if (!marcaId) {
  console.error("uso: npm run audit:formation -- <marcaId> [filtroDaKeyword]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários.");
  process.exit(1);
}

/*
 * As leituras são SELECT direto porque `lib/server/*` importa sem extensão e
 * o runner de ESM não resolve isso. Carregar linhas não é autoridade — o que
 * precisa ser a autoridade é o CÁLCULO, e ele vem de `lib/arquiteto`, os
 * mesmos módulos que a tela usa.
 */
const supabase = createClient(url, key, { auth: { persistSession: false } });

const [itensRes, keywordsRes] = await Promise.all([
  supabase.from("editorial_workflow_items").select("marca_id, subject_type, subject_id, stage, state, payload").eq("marca_id", marcaId),
  supabase.from("minerador_keywords").select("*").eq("brand_id", marcaId).is("deleted_at", null),
]);
if (itensRes.error) { console.error("[workflow]", itensRes.error.message); process.exit(1); }
if (keywordsRes.error) { console.error("[keywords]", keywordsRes.error.message); process.exit(1); }

type Row = { marca_id: string; subject_type: string; subject_id: string; stage: string; state: string; payload: Record<string, unknown> };
const linhas = (itensRes.data || []) as Row[];
const workflowItems = linhas.map(row => ({
  marcaId: row.marca_id, subjectType: row.subject_type, subjectId: row.subject_id,
  stage: row.stage, state: row.state, payload: row.payload,
}));

// A MESMA função que a tela usa para montar o masterList — inclusive o
// territoryRef, que vem do `assignment` do item de workflow, não da keyword.
const masterList = buildCanonicalWorkflowWorkspaceItems(
  workflowItems as never,
  (keywordsRes.data || []) as never,
  marcaId,
) as unknown as Array<Record<string, unknown>>;

const territorios = linhas
  .filter(row => row.subject_type === "territory")
  .map(row => ({ territoryRef: row.subject_id, territory: (row.payload?.territory ?? row.payload) as Record<string, unknown> }));

const serpItems = linhas
  .filter(row => row.subject_type === "article_formation_serp_assessment")
  .map(row => ({ candidateRef: row.subject_id, state: row.state, payload: row.payload }));

const texto = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor.trim() : null);

/** Mesma leitura de intenção que `scenarioKeywords` faz na tela. */
const intentDe = (keyword: Record<string, unknown>) => {
  const semantic = (keyword.analise_semantica || {}) as Record<string, unknown>;
  return texto(semantic.intencao_principal) || texto(keyword.intent);
};

const confirmados = territorios.filter(item => {
  const status = texto(item.territory.lifecycleStatus);
  return status === "confirmed" || status === "consolidated";
});

const porSilo = new Map<string, Array<Record<string, unknown>>>();
for (const keyword of masterList) {
  const ref = texto(keyword.territoryRef) || texto(keyword.territory_ref);
  if (!ref) continue;
  porSilo.set(ref, [...(porSilo.get(ref) || []), keyword]);
}

const grupos = buildSiloScopedProvisionalGroups({
  silos: confirmados.map(item => {
    const t = item.territory as { name?: string; centralEntity?: string; slugState?: { publishedSlug?: string | null; confirmed?: string | null; proposals?: Array<{ slug: string }> } };
    const slug = t.slugState?.publishedSlug || t.slugState?.confirmed || t.slugState?.proposals?.[0]?.slug || null;
    return {
      siloRef: item.territoryRef,
      siloLabel: t.name || t.centralEntity || "Silo sem nome",
      siloSlug: slug ? (slug.startsWith("/") ? slug : `/${slug}`) : null,
    };
  }),
  keywordsBySiloRef: porSilo as never,
});

const serpPorCandidato = new Map(serpItems.map(item => [item.candidateRef, item]));
const intentByKeywordId = new Map<string, string | null>();
for (const lista of porSilo.values()) for (const k of lista) intentByKeywordId.set(String(k.id), intentDe(k));

console.log("=".repeat(78));
console.log(`BASE DE FORMAÇÃO — marca ${marcaId}`);
console.log("PROVIDER_CALLS = 0 · nenhuma escrita");
console.log("=".repeat(78));

for (const territorio of confirmados) {
  const t = territorio.territory as { name?: string; centralEntity?: string; macroIntent?: string; boundary?: { includes?: string[] }; narrative?: string };
  const escopo = grupos.find(item => item.siloRef === territorio.territoryRef);
  // Só texto entra: `narrative` e `boundary.includes` são estruturas no
  // território, e passar objeto onde a tokenização espera string quebra.
  const siloContext = {
    centralEntity: texto(t.centralEntity),
    macroIntent: texto(t.macroIntent),
    boundaryIncludes: (t.boundary?.includes || []).filter((v): v is string => typeof v === "string"),
    narrative: texto(t.narrative),
  };

  const universe = buildArticleFormationUniverse({
    siloRef: territorio.territoryRef,
    siloLabel: escopo?.siloLabel || t.name || "Silo",
    siloSlug: escopo?.siloSlug ?? null,
    groups: (escopo?.groups || []).map(group => ({
      principalKeywordId: String(group.principalSuggestion.keywordId),
      keywordIds: group.keywords.map(keyword => String(keyword.id)),
    })),
    siloContext,
    keywords: (porSilo.get(territorio.territoryRef) || []).map(keyword => ({
      keywordId: String(keyword.id),
      keyword: String(keyword.keyword || ""),
      intent: intentDe(keyword),
      volume: (keyword.volume_search as number | null) ?? null,
      isPublished: Boolean(keyword.isPublished),
      // O agrupamento humano manda: sem isto o universo reagrupa por
      // similaridade e inventa um drift que a tela não tem.
      humanFormationRef: resolveArticleFormationState(keyword).formationRef,
      humanRole: resolveArticleFormationState(keyword).decision?.role ?? null,
    })) as never,
  });

  for (const candidate of universe.candidates) {
    const nomes = candidate.keywords.map(item => {
      const k = (porSilo.get(territorio.territoryRef) || []).find(x => String(x.id) === item.keywordId);
      return { id: item.keywordId, text: String(k?.keyword ?? item.keywordId), role: item.role };
    });
    if (filtro && !nomes.some(n => n.text.toLowerCase().includes(filtro))) continue;

    const base = articleSerpBaseOf({ candidate, intentByKeywordId, siloContext });
    const hash = articleSerpBaseHash(base);
    const registro = serpPorCandidato.get(candidate.candidateRef);
    const p = registro?.payload as { formationBaseHash?: string; verdict?: string; humanResolution?: { formationBaseHash?: string }; interpretation?: { observedIntent?: string; verdict?: string }; assessment?: { id?: string; version?: number } } | undefined;

    const combina = p?.formationBaseHash === hash;
    const resolucaoVale = Boolean(p?.humanResolution && p.humanResolution.formationBaseHash === hash);
    /*
     * `state` já pode vir como "resolved" do store; concatenar o sufixo
     * produzia CURRENT_RESOLVED_RESOLVED. O veredito é a fonte do rótulo, e o
     * estado só diz se houve decisão humana.
     */
    const veredito = String(p?.verdict ?? p?.interpretation?.verdict ?? registro?.state ?? "").toUpperCase();
    const decidido = registro?.state === "resolved" || resolucaoVale;
    const estado = !registro ? "MISSING"
      : !combina ? "STALE"
      : registro.state === "supported" || veredito === "COMPATIBLE" ? "CURRENT_SUPPORTED"
      : `CURRENT_${veredito || "UNKNOWN"}_${decidido ? "RESOLVED" : "UNRESOLVED"}`;

    console.log("");
    console.log("-".repeat(78));
    console.log(`ARTICLE                    ${nomes.find(n => n.role === "principal")?.text ?? candidate.candidateRef}`);
    console.log(`  candidateRef             ${candidate.candidateRef}`);
    console.log(`  ACTIVE_PRINCIPAL         ${nomes.find(n => n.role === "principal")?.text ?? "—"}`);
    console.log(`  ACTIVE_KEYWORD_COUNT     ${nomes.length}`);
    for (const n of nomes) console.log(`     ${n.role.padEnd(11)} ${n.id}  ${n.text}`);
    console.log(`  ACTIVE_FORMATION_BASE_HASH ${hash}`);
    console.log(`  assessment               ${p?.assessment?.id ? `v${p.assessment.version} ${p.assessment.id.slice(-24)}` : "—"}`);
    console.log(`  assessment baseHash      ${p?.formationBaseHash ?? "—"}${combina ? "  (bate)" : registro ? "  (NÃO bate)" : ""}`);
    console.log(`  verdict / observedIntent ${p?.verdict ?? "—"} / ${p?.interpretation?.observedIntent ?? "—"}`);
    console.log(`  SERP_STATE               ${estado}`);
    console.log(`  HUMAN_RESOLUTION_REQUIRED ${estado.endsWith("_UNRESOLVED") ? "YES" : "NO"}`);
  }
}
