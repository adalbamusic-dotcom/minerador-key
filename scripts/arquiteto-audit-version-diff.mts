/**
 * AUDITORIA READ-ONLY — CANÔNICA APROVADA vs PROPOSTA EM EDIÇÃO.
 *
 * Este script NÃO ESCREVE NADA. Ele responde uma pergunta só: a versão mais
 * nova de um artefato mudou alguma coisa que importe, ou é uma proposta
 * redundante que só está escondendo a versão aprovada na tela?
 *
 * A distinção é a mesma de `canonical-version-authority`: proposta em
 * andamento não invalida a aprovada. Aqui ela é medida campo a campo, sobre os
 * dados reais, para que ninguém precise aprovar nada "para limpar a interface".
 *
 *   npm run audit:versoes -- <marcaId> [filtro]
 *
 * O filtro casa com entity_id, slug ou principalKeywordId (substring).
 */

import { createClient } from "@supabase/supabase-js";
import type { ArticleDNA } from "../lib/arquiteto/contracts.ts";
import { articleEditorialDiff } from "../lib/arquiteto/article-editorial-diff.ts";

const marcaId = process.argv[2];
if (!marcaId) {
  console.error("uso: npm run audit:versoes -- <marcaId> [filtro]");
  process.exit(1);
}
const filtro = (process.argv[3] || "").toLocaleLowerCase("pt-BR");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const artefatos = await supabase
  .from("editorial_artifact_versions")
  .select("version_id, entity_id, artifact_type, version_number, previous_version_id, content_hash, status, payload, created_at")
  .eq("marca_id", marcaId)
  .in("artifact_type", ["article_dna", "silo_page"])
  .order("version_number", { ascending: true });
if (artefatos.error) {
  console.error("[artefatos]", artefatos.error);
  process.exit(1);
}

type Row = {
  version_id: string; entity_id: string; artifact_type: string; version_number: number;
  previous_version_id: string | null; content_hash: string; status: string;
  payload: Record<string, unknown>; created_at: string;
};
const linhas = (artefatos.data || []) as Row[];

/** O status canônico é a COLUNA da própria versão; os eventos estão esparsos. */
const DESCARTADOS = new Set(["rejected", "superseded"]);

const porEntidade = new Map<string, Row[]>();
for (const linha of linhas) {
  const chave = `${linha.artifact_type}|${linha.entity_id}`;
  const lista = porEntidade.get(chave);
  if (lista) lista.push(linha);
  else porEntidade.set(chave, [linha]);
}

/* Campos que mudam a decisão editorial. `alerts` e carimbos ficam de fora: */
/* eles mudam a cada gravação e diriam "mudou" sobre um no-op.              */
const CAMPOS_ARTICLE = [
  "principalKeywordId", "secondaryKeywordIds", "narrativeReinforcementIds",
  "territoryRef", "siloId", "suggestedSlug", "canonical",
  "architectureStatus", "primaryKeywordPolicy", "classification",
  "unitClassification", "unitPurpose", "serpAssessmentRef", "kgrIdentity",
  "publishedIdentityRef",
] as const;
const CAMPOS_SILO_PAGE = [
  "siloId", "slug", "canonical", "h1", "seoTitle", "publishedIdentityRef", "sections",
] as const;

const papeisDe = (payload: Record<string, unknown>) => {
  const referencias = Array.isArray(payload.keywordReferences) ? payload.keywordReferences : [];
  return referencias
    .map(item => {
      const ref = item as Record<string, unknown>;
      return `${String(ref.keywordId)}:${String(ref.role)}`;
    })
    .sort()
    .join(",");
};

const texto = (valor: unknown) => {
  if (valor === undefined) return "—";
  if (valor === null) return "null";
  return JSON.stringify(valor);
};

const encurtar = (valor: string) => (valor.length > 110 ? `${valor.slice(0, 107)}…` : valor);

console.log("=".repeat(78));
console.log(`DIFF READ-ONLY — marca ${marcaId}${filtro ? ` · filtro "${filtro}"` : ""}`);
console.log("=".repeat(78));

let analisadas = 0;
let apenasUnitType = 0;
let comDiffSubstantivo = 0;
let semProposta = 0;

for (const [chave, versoes] of porEntidade) {
  const [tipo, entityId] = chave.split("|");
  const vivas = versoes.filter(linha => !DESCARTADOS.has(linha.status));
  if (!vivas.length) continue;

  const ultima = vivas.at(-1)!;
  const aprovadas = vivas.filter(linha => linha.status === "approved");
  const canonica = aprovadas.at(-1) ?? null;

  const alvo = [
    entityId,
    String(ultima.payload.suggestedSlug || ultima.payload.slug || ""),
    String(ultima.payload.principalKeywordId || ""),
  ].join(" ").toLocaleLowerCase("pt-BR");
  if (filtro && !alvo.includes(filtro)) continue;

  const proposta = canonica && ultima.version_id !== canonica.version_id && ultima.version_number > canonica.version_number
    ? ultima
    : null;

  analisadas += 1;
  console.log("");
  console.log("-".repeat(78));
  console.log(`${tipo.toUpperCase().padEnd(12)} ${entityId}`);
  console.log(`  slug          ${String(ultima.payload.suggestedSlug || ultima.payload.slug || "—")}`);
  console.log(`  LATEST_VERSION            v${ultima.version_number}  ${ultima.version_id}  status=${ultima.status}`);
  console.log(`  LATEST_APPROVED_VERSION   ${canonica ? `v${canonica.version_number}  ${canonica.version_id}` : "— (nunca aprovada)"}`);
  console.log(`  WORKING_PROPOSED_VERSION  ${proposta ? `v${proposta.version_number}  status=${proposta.status}` : "— (nenhuma)"}`);
  console.log(`  CANONICAL_VERSION_USED_BY_HANDOFF = ${canonica ? `v${canonica.version_number}` : "NENHUMA"}`);

  if (!proposta || !canonica) {
    semProposta += 1;
    continue;
  }

  /*
   * Para ArticleDNA a autoridade é `articleEditorialDiff` — a MESMA que a
   * conclusão consulta antes de gravar. Se a auditoria usasse sua própria
   * lista, ela poderia dizer "mudou" sobre o que a mesa trata como no-op.
   */
  const editorial = tipo === "article_dna"
    ? articleEditorialDiff({
      canonical: canonica.payload as unknown as ArticleDNA,
      candidate: proposta.payload as unknown as ArticleDNA,
    })
    : null;

  const campos = tipo === "silo_page" ? CAMPOS_SILO_PAGE : CAMPOS_ARTICLE;
  const diferencas: string[] = [];
  for (const campo of campos) {
    const antes = texto(canonica.payload[campo]);
    const depois = texto(proposta.payload[campo]);
    if (antes !== depois) diferencas.push(`${campo}\n      antes  ${encurtar(antes)}\n      depois ${encurtar(depois)}`);
  }
  if (tipo === "article_dna") {
    const antes = papeisDe(canonica.payload);
    const depois = papeisDe(proposta.payload);
    if (antes !== depois) diferencas.push(`keywordReferences(papéis)\n      antes  ${encurtar(antes)}\n      depois ${encurtar(depois)}`);
  }

  // Bruto x editorial: a diferença entre "o hash mudou" e "a decisão mudou".
  const soUnitType = editorial ? !editorial.substantive : false;

  console.log(`  DIFF v${canonica.version_number} → v${proposta.version_number}: ${diferencas.length || "nenhuma"} campo(s)`);
  for (const diferenca of diferencas) console.log(`    · ${diferenca}`);
  if (editorial) {
    console.log(`  CAMPOS_EDITORIAIS_ALTERADOS = ${editorial.changedFields.length ? editorial.changedFields.join(", ") : "nenhum"}`);
  }
  console.log(`  CREATED_ONLY_BY_TIMESTAMP_OR_UNIT_TYPE = ${soUnitType ? "YES" : "NO"}`);
  console.log(`  HAS_SUBSTANTIVE_EDITORIAL_DIFF         = ${editorial ? (editorial.substantive ? "YES" : "NO") : (diferencas.length ? "YES" : "NO")}`);
  console.log(`  CONCLUIR_FORMACAO_CRIARIA_SUCESSORA    = ${editorial ? (editorial.substantive ? "YES" : "NO — NO_NEW_VERSION") : "—"}`);

  if (soUnitType) apenasUnitType += 1;
  else if (diferencas.length) comDiffSubstantivo += 1;
  else apenasUnitType += 0;
}

console.log("");
console.log("=".repeat(78));
console.log("SAÍDA CONSOLIDADA");
console.log(`ENTIDADES_ANALISADAS                   = ${analisadas}`);
console.log(`SEM_PROPOSTA_ACIMA_DA_APROVADA         = ${semProposta}`);
console.log(`PROPOSTA_APENAS_UNIT_TYPE              = ${apenasUnitType}`);
console.log(`PROPOSTA_COM_DIFF_SUBSTANTIVO          = ${comDiffSubstantivo}`);
console.log("NO_WRITES          = YES");
console.log("NO_PROVIDER_CALLS  = YES");
