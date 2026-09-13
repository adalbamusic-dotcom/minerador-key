/**
 * AUDITORIA READ-ONLY DA IDENTIDADE DAS SILOPAGES.
 *
 * Este script NÃO ESCREVE NADA e não chama provider nenhum. Ele roda, sobre os
 * dados reais, as MESMAS funções que a consolidação usa —
 * `resolveSiloPagePublicationIdentity` e `resolveSiloPageApprovalReadiness` —
 * para responder por que `SILO_PAGE_APPROVED = 0/3` sem ninguém precisar
 * clicar em nada para descobrir.
 *
 * A pergunta que ele separa: a página está bloqueada porque falta decisão
 * humana, ou porque o artefato gravado nunca recebeu o que a varredura do site
 * já tinha observado?
 *
 *   npm run audit:silopage -- <marcaId>
 */

import { createClient } from "@supabase/supabase-js";
import type { SiloDNA, SiloPage, VersionEnvelope } from "../lib/arquiteto/contracts.ts";
import { resolveSiloPagePublicationIdentity } from "../lib/arquiteto/silo-page-publication-identity.ts";
import { siloPageApprovalPreflight } from "../lib/arquiteto/silo-page-approval.ts";
import { CURRENT_SCENARIO_REQUIRES_PUBLISHED_VERIFICATION } from "../lib/arquiteto/publication-scenario.ts";

const marcaId = process.argv[2];
if (!marcaId) {
  console.error("uso: npm run audit:silopage -- <marcaId>");
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

/* ------------------------------- leitura --------------------------------- */

const [artefatos, marca, catalogo] = await Promise.all([
  supabase.from("editorial_artifact_versions")
    .select("version_id, entity_id, artifact_type, version_number, content_hash, status, payload")
    .eq("marca_id", marcaId)
    .in("artifact_type", ["silo_dna", "silo_page"])
    .order("version_number", { ascending: true }),
  supabase.from("marcas").select("site_url").eq("id", marcaId).maybeSingle(),
  supabase.from("brand_site_catalog_entries").select("*").eq("marca_id", marcaId),
]);
if (artefatos.error) falhar("artefatos", artefatos.error);
if (marca.error) falhar("marca", marca.error);
if (catalogo.error) falhar("catalogo", catalogo.error);

type Row = {
  version_id: string; entity_id: string; artifact_type: string;
  version_number: number; content_hash: string; status: string; payload: Record<string, unknown>;
};
const linhas = (artefatos.data || []) as Row[];
const siteUrl = (marca.data as { site_url?: string | null } | null)?.site_url ?? null;
const entradas = (catalogo.data || []) as Array<Record<string, unknown>>;

const DESCARTADOS = new Set(["rejected", "superseded"]);
const vigente = (tipo: string, entityId: string) => {
  const vivas = linhas.filter(linha => linha.artifact_type === tipo && linha.entity_id === entityId && !DESCARTADOS.has(linha.status));
  return {
    latest: vivas.at(-1) ?? null,
    approved: vivas.filter(linha => linha.status === "approved").at(-1) ?? null,
  };
};

const semBarras = (valor: unknown) => String(valor ?? "").trim().replace(/^\/+|\/+$/g, "");

console.log("=".repeat(78));
console.log(`PREFLIGHT READ-ONLY DAS SILOPAGES — marca ${marcaId}`);
console.log(`site_url declarado pela Brand: ${siteUrl || "— (sem origem declarada)"}`);
console.log(`catálogo do site: ${entradas.length} entrada(s)`);
console.log(`PUBLISHED_VERIFICATION_REQUIRED_NOW = ${CURRENT_SCENARIO_REQUIRES_PUBLISHED_VERIFICATION ? "YES" : "NO"}`);
console.log("=".repeat(78));

const paginas = [...new Set(linhas.filter(linha => linha.artifact_type === "silo_page").map(linha => linha.entity_id))];

let prontas = 0;
const resumo: string[] = [];

for (const entityId of paginas) {
  const { latest, approved } = vigente("silo_page", entityId);
  if (!latest) continue;
  const pagina = latest.payload as unknown as SiloPage;
  const slug = semBarras(pagina.slug);
  const dna = vigente("silo_dna", String(pagina.siloId));

  /*
   * O casamento com o catálogo é pelo caminho, não pela URL inteira: o slug
   * gravado na SiloPage não carrega host, e comparar strings de origens
   * diferentes acusaria "não existe" sobre uma página que está lá.
   */
  const entrada = entradas.find(item => semBarras(String(item.normalized_url ?? "").replace(/^[^/]*\//, "")) === slug) || null;

  const identidade = resolveSiloPagePublicationIdentity({
    slug,
    brandSiteUrl: siteUrl,
    observation: entrada
      ? {
        verificationStatus: String(entrada.verification_status ?? "") as never,
        resolvedUrl: (entrada.resolved_url as string | null) ?? null,
        declaredCanonicalUrl: (entrada.declared_canonical_url as string | null) ?? null,
        normalizedCanonicalUrl: (entrada.normalized_canonical_url as string | null) ?? null,
        lastVerifiedAt: (entrada.last_seen_at as string | null) ?? null,
      }
      : null,
    current: { publicationStatus: pagina.publicationStatus, publishedUrl: pagina.publishedUrl, canonical: pagina.canonical },
  });

  const siloDna = (dna.latest?.payload ?? null) as unknown as SiloDNA;
  const base = {
    brandId: marcaId,
    territoryRef: String(siloDna?.territoryRef ?? ""),
    siloId: String(pagina.siloId),
    siloPageVersion: { versionId: latest.version_id, contentHash: latest.content_hash },
    siloDna,
    siloDnaVersion: { versionId: dna.latest?.version_id ?? "" },
    // O mesmo cenário que o servidor aplica: a auditoria não pode ser mais
    // permissiva nem mais severa que a portaria real.
    publishedVerificationRequired: CURRENT_SCENARIO_REQUIRES_PUBLISHED_VERIFICATION,
  };

  /* O que a portaria diria HOJE, sobre o artefato como está gravado. */
  const comoEsta = siloPageApprovalPreflight({ ...base, siloPage: pagina });

  /* E o que ela diria se o artefato recebesse a identidade já observada. */
  const comIdentidade = siloPageApprovalPreflight({
    ...base,
    siloPage: {
      ...pagina,
      canonical: identidade.canonical,
      publicationStatus: identidade.publicationStatus,
      publishedUrl: identidade.publishedUrl,
      publicationVerification: identidade.publicationVerification,
    },
  });

  console.log("");
  console.log("-".repeat(78));
  console.log(`SILO_PAGE      ${entityId}`);
  console.log(`  silo         ${String(pagina.siloId)}  ·  SiloDNA ${dna.approved ? `v${dna.approved.version_number} approved` : "sem versão aprovada"}`);
  console.log(`  versão       v${latest.version_number} status=${latest.status}  ·  aprovada: ${approved ? `v${approved.version_number}` : "— (nunca)"}`);
  console.log(`  slug                     ${slug || "—"}`);
  console.log(`  declaredCanonical        ${pagina.canonical ?? "—"}`);
  console.log(`  resolvedCanonical        ${identidade.canonical ?? "—"}`);
  console.log(`  canonicalSource          ${identidade.canonicalIsPlanned ? "PLANNED (origem da Brand + slug)" : entrada ? "CATALOG" : "—"}`);
  console.log(`  published                ${pagina.publicationStatus}`);
  console.log(`  catalogEntryId           ${entrada ? String(entrada.id ?? "—") : "— (sem entrada)"}`);
  console.log(`  catalogStatus            ${entrada ? String(entrada.verification_status ?? "—") : "—"}`);
  console.log(`  normalizedUrl            ${entrada ? String(entrada.normalized_url ?? "—") : "—"}`);
  console.log(`  publicationIdentityState ${identidade.publicationVerification.status}`);
  console.log(`  motivo                   ${identidade.reason}`);
  console.log(`  APPROVAL_READY (gravado)         ${comoEsta.state === "approved" ? "YES" : "NO"}`);
  for (const bloqueio of comoEsta.blockers) console.log(`     · ${bloqueio.code}: ${bloqueio.detail}`);
  console.log(`  APPROVAL_READY (com identidade)  ${comIdentidade.state === "approved" ? "YES" : "NO"}`);
  for (const bloqueio of comIdentidade.blockers) console.log(`     · ${bloqueio.code}: ${bloqueio.detail}`);

  if (comIdentidade.state === "approved") prontas += 1;
  resumo.push(`${slug || entityId}: gravado=${comoEsta.state === "approved" ? "READY" : "BLOCKED"} · com identidade=${comIdentidade.state === "approved" ? "READY" : "BLOCKED"}`);
}

console.log("");
console.log("=".repeat(78));
console.log("SAÍDA CONSOLIDADA");
for (const linha of resumo) console.log(`  ${linha}`);
console.log(`SILO_PAGES_ANALISADAS                  = ${paginas.length}`);
console.log(`APPROVAL_READY_COM_IDENTIDADE          = ${prontas}/${paginas.length}`);
console.log("NO_WRITES          = YES");
console.log("PROVIDER_CALLS     = 0");
