/**
 * Repara `analise_semantica` corrompida pela serialização da Lógica.
 *
 * `mergeLogicalKeywordSemantic` aplicava `JSON.stringify` a toda chave não
 * textual do jsonb. Um clique em "Processar lógica" transformava
 * `site_origin`, `site_origins`, `aprovacao`, `human_review`, as medições e
 * os históricos em **string JSON**. O dado continuava no banco, e nenhum
 * leitor o reconhecia: todos checam `typeof === "object"` e devolviam `null`.
 *
 * Na tela isso apareceu como a publicação declarada sumindo de uma keyword —
 * junto com a proteção contra exclusão, que depende da mesma leitura.
 *
 * O motor foi corrigido; este script desfaz o estrago já gravado. Só toca em
 * chave que **não** é do motor e cujo texto volta a ser objeto ou array.
 *
 * Uso:
 *   npm run minerador:reparar-semantica            (dry-run)
 *   npm run minerador:reparar-semantica -- --apply (grava)
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.");

const supabase = createClient(url, key, { auth: { persistSession: false } });

/**
 * Campos do motor lógico: texto por natureza. Mesmo que pareçam JSON, ficam
 * como estão — reinterpretá-los inventaria estrutura onde há texto.
 */
const CAMPOS_DO_MOTOR = new Set([
  "dna_schema_version", "dna_origem", "dna_modelo", "dna_confianca", "dna_revisao_humana",
  "dna_campos_logicos", "intencao_principal", "intencao_ambigua", "intencao_secundaria",
  "tipo_editorial", "entidade_central", "modificadores", "publico", "problema_percebido",
  "resultado_desejado", "nivel_consciencia", "etapa_jornada", "objecao_implicita",
  "emocao_dominante", "potencial_comercial", "potencial_afiliado", "candidato_review",
  "pesquisa_produto_necessaria", "risco_canibalizacao", "intencao_local", "urgencia_tempo",
  "nicho", "funnel", "slug_sugerido", "formato_esperado",
]);

/**
 * Serializadas **de propósito**, com leitor que espera texto.
 *
 * `kgr-applicability.ts` e `primary-keyword-policy.ts` gravam estes dois
 * com `JSON.stringify` e os releem com um `parseHistory` próprio. Repará-los
 * seria trocar o formato debaixo do leitor — o oposto do conserto.
 */
const SERIALIZADAS_POR_DESENHO = new Set([
  "kgr_decisao_historico",
  "primary_keyword_policy_history",
]);

function pareceJson(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const texto = value.trim();
  return (texto.startsWith("{") && texto.endsWith("}")) || (texto.startsWith("[") && texto.endsWith("]"));
}

/** Devolve o valor reconstruído, ou `undefined` quando não há o que reparar. */
function reparar(value: unknown): unknown | undefined {
  if (!pareceJson(value)) return undefined;
  try {
    const parsed = JSON.parse(value);
    // Só aceita o que volta a ser estrutura: string que vira número ou
    // booleano não era objeto serializado, era texto.
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

type Row = { id: string; brand_id: string; keyword: string; analise_semantica: Record<string, unknown> | null };

const { data, error } = await supabase
  .from("minerador_keywords")
  .select("id,brand_id,keyword,analise_semantica")
  .is("deleted_at", null);
if (error) throw error;

const rows = (data || []) as Row[];
const planos: Array<{ row: Row; semantic: Record<string, unknown>; chaves: string[] }> = [];

for (const row of rows) {
  const semantic = row.analise_semantica || {};
  const proximo = { ...semantic };
  const chaves: string[] = [];
  for (const [chave, valor] of Object.entries(semantic)) {
    if (CAMPOS_DO_MOTOR.has(chave) || SERIALIZADAS_POR_DESENHO.has(chave)) continue;
    const reparado = reparar(valor);
    if (reparado === undefined) continue;
    proximo[chave] = reparado;
    chaves.push(chave);
  }
  if (chaves.length) planos.push({ row, semantic: proximo, chaves });
}

console.log(`keywords vivas: ${rows.length} · com chave serializada: ${planos.length}`);
for (const plano of planos) {
  console.log(`  · ${plano.row.keyword} (${plano.row.id.slice(0, 8)}) → ${plano.chaves.join(", ")}`);
}

// Quantas recuperam publicação declarada — o efeito que o usuário viu sumir.
const voltamPublicadas = planos.filter(plano => {
  const origem = plano.semantic.site_origin;
  return origem && typeof origem === "object" && (origem as Record<string, unknown>).publicationStatus === "published";
});
console.log(`dessas, com publicação declarada de volta: ${voltamPublicadas.length}`);

if (!APPLY) {
  console.log("\nDRY-RUN. Nada foi gravado. Use --apply para reparar.");
} else {
  let gravadas = 0;
  for (const plano of planos) {
    const result = await supabase
      .from("minerador_keywords")
      .update({ analise_semantica: plano.semantic })
      .eq("id", plano.row.id)
      .eq("brand_id", plano.row.brand_id)
      .is("deleted_at", null);
    if (result.error) throw result.error;
    gravadas += 1;
  }

  // Readback: a afirmação só vale depois de reler do banco.
  const readback = await supabase.from("minerador_keywords").select("id,analise_semantica").is("deleted_at", null);
  if (readback.error) throw readback.error;
  const restantes = (readback.data || []).filter(item => {
    const semantic = (item as Row).analise_semantica || {};
    return Object.entries(semantic).some(([chave, valor]) => !CAMPOS_DO_MOTOR.has(chave) && !SERIALIZADAS_POR_DESENHO.has(chave) && reparar(valor) !== undefined);
  }).length;

  console.log(`gravadas: ${gravadas} · ainda serializadas após readback: ${restantes}`);
  if (restantes > 0) throw new Error("O readback ainda encontrou chave serializada; o reparo não pode ser declarado completo.");
  console.log("REPARO_SEMANTICA = OK");
}
