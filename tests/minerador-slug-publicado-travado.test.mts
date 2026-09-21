import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyApproval, approvedPackageDiverged, readApprovalRecord } from "../lib/minerador/approved-package.ts";
import { PUBLICATION_IDENTITY_LOCK_HISTORY_KEY } from "../lib/minerador/publication-link.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";

/**
 * O endereço da página publicada não se mexe.
 *
 * `protect_published_keyword` já recusava mudança de status, keyword,
 * lista_id e location na publicada, e TENTAVA proteger slug e canonical — mas
 * pelas colunas `slug` e `canonical`, que não existem nesta tabela. Os dois
 * ramos eram código morto guardado por `old_json ? 'slug'`, sempre falso. O
 * slug e o canônico moram dentro de `analise_semantica`, que aquele gatilho
 * não olha. REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

/** O cabeçalho da migration cita os símbolos que este teste procura. */
const migration = readFileSync(
  new URL("../supabase/migrations/20260921050000_slug_publicado_nao_se_mexe.sql", import.meta.url),
  "utf8",
).replace(/^\s*--.*$/gm, "");

const IDENTIDADE = [
  ["slug_sugerido"],
  ["site_origin", "canonicalUrl"],
  ["site_origin", "declaredCanonicalUrl"],
  ["site_origin", "resolvedUrl"],
  ["site_origin", "sourceUrl"],
];

test("congela slug e as três fontes de endereço, não só o canônico", () => {
  for (const caminho of IDENTIDADE) {
    const literal = `ARRAY['${caminho.join("','")}']`;
    assert.ok(migration.includes(literal), `congela ${caminho.join(".")}`);
  }

  // A URL que a tela mostra sai de declaredCanonicalUrl || resolvedUrl ||
  // sourceUrl. Congelar só o canonicalUrl deixaria mover o endereço exibido
  // com o canônico intacto — a trava pareceria funcionar e não funcionaria.
  assert.equal(
    (migration.match(/ARRAY\['(slug_sugerido|site_origin)/g) || []).length,
    IDENTIDADE.length,
    "nem mais nem menos do que a identidade declarada",
  );

  assert.match(migration, /jsonb_set\(resultado, caminho, antes, true\)/, "o valor ANTIGO é que permanece");
});

test("a tentativa fica registrada, não some", () => {
  assert.match(migration, /'field', array_to_string\(caminho, '\.'\)/);
  assert.match(migration, /'previous', antes/);
  assert.match(migration, /'attempted', coalesce\(depois/);
  assert.match(migration, /publication_identity_lock_history/);

  // Sem teto, uma rotina que insista na sobrescrita engorda a linha a cada
  // passada — e a linha inteira viaja na listagem.
  assert.match(migration, /jsonb_array_length\(historico\) - 50/, "o histórico tem teto");
});

test("não restaura folha quando o bloco pai sumiu", () => {
  // Restaurar a folha inventaria estrutura que o escritor não mandou — o
  // mesmo cuidado do gatilho de séries.
  assert.match(
    migration,
    /CONTINUE WHEN array_length\(caminho, 1\) > 1\s*AND resultado #> caminho\[1:array_length\(caminho, 1\) - 1\] IS NULL/,
  );
});

test("usa a leitura barata da publicação, não a que cruza o editorial", () => {
  assert.match(migration, /minerador_keyword_is_published\(OLD\.status, OLD\.analise_semantica\)/);
  // `lifecycle_keyword_is_published` cruza publication_records e artefatos
  // editoriais: são vários joins por LINHA ATUALIZADA.
  assert.doesNotMatch(migration, /lifecycle_keyword_is_published/, "a versão cara não entra no caminho de escrita");

  assert.match(migration, /BEFORE UPDATE ON public\.minerador_keywords/, "congela antes de gravar");
  assert.match(
    migration,
    /WHEN \(OLD\.analise_semantica IS DISTINCT FROM NEW\.analise_semantica\)/,
    "só roda quando a semântica muda",
  );
});

test("uma tentativa bloqueada NÃO derruba a aprovação: nada mudou", async () => {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: "Informativa",
    nicho: "Estética",
    funnel: "TOFU",
    slug_sugerido: "qual-pomada-e-boa-para-queimadura",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-09-19T10:00:00.000Z" },
    allintitle_measurement: { provider: "dataforseo", status: "success", resultsAllintitle: 336, measuredAt: "2026-09-19T10:01:00.000Z" },
    kgr_aplicabilidade: "applicable",
  };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: "Informativa", niche: "Estética", funnel: "TOFU" });

  const input = { keywordId: "kw-1", brandId: "brand-1", keyword: "qual pomada é boa para queimadura", intent: "Informativa", volumeSearch: 90, resultsAllintitle: 336, kgrScore: 3.7333, listaId: null };
  const aprovada = await applyApproval({ ...input, semantic, approvedAt: "2026-09-20T12:00:00.000Z", approvedBy: "human-1" });
  assert.ok(readApprovalRecord(aprovada));
  assert.equal(approvedPackageDiverged({ ...input, semantic: aprovada }), false);

  // O gatilho barrou uma sobrescrita e anotou. A keyword está como estava.
  const comRegistro = {
    ...aprovada,
    [PUBLICATION_IDENTITY_LOCK_HISTORY_KEY]: [
      { field: "slug_sugerido", previous: "qual-pomada-e-boa-para-queimadura", attempted: "pomada-queimadura", blockedAt: "2026-09-21T10:00:00.000Z" },
    ],
  };
  assert.equal(approvedPackageDiverged({ ...input, semantic: comRegistro }), false, "o registro da tentativa não é divergência");

  // Mas o slug mudando DE VERDADE continua sendo divergência.
  assert.equal(
    approvedPackageDiverged({ ...input, semantic: { ...aprovada, slug_sugerido: "pomada-queimadura" } }),
    true,
    "mudança real do slug ainda rebaixa",
  );
});
