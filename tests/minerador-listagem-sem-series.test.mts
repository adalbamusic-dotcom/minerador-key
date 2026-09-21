import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { APPROVAL_SIGNATURE_SCHEME, applyApproval, approvedPackageDiverged, readApprovalRecord, resignApprovalRecord } from "../lib/minerador/approved-package.ts";
import { MEASUREMENT_SERIES_PATHS, hasMeasurementSeries, withMeasurementSeries, withoutMeasurementSeries } from "../lib/minerador/listing-payload.ts";
import { buildLogicalOutputContract } from "../lib/minerador/logical-processor.ts";
import { legadoV2 } from "./helpers/assinatura-v2-legada.mts";

/**
 * A listagem para de baixar as séries de medição — sem derrubar aprovação.
 *
 * Medido em 2026-09-21: 1 034 kB por carregamento, 98,3% em
 * `analise_semantica`, e 209 kB (20%) em quatro arrays que a tabela nunca lê.
 * Podá-los esbarrava na assinatura, que cobria a semântica inteira: leitor
 * podado assinava diferente e as 29 aprovadas apareciam divergentes. O
 * esquema v3 tira as séries do conteúdo assinado — o que a assinatura já
 * garantia por `volumeSearch`, `resultsAllintitle` e `kgrScore` continua
 * garantido. REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const LOGICA = "Comercial investigativa";

const SERIE = [
  { year: 2026, month: 8, monthlySearches: 90 },
  { year: 2026, month: 7, monthlySearches: 110 },
];

function semanticaCompleta(): Record<string, unknown> {
  const semantic: Record<string, unknown> = {
    dna_origem: "logico_deterministico",
    intencao_principal: LOGICA,
    nicho: "Estética",
    funnel: "MOFU",
    volume_measurement: { provider: "google_ads", averageMonthlySearches: 90, measuredAt: "2026-09-19T10:00:00.000Z", monthlySearchVolumes: SERIE },
    allintitle_measurement: { provider: "dataforseo", status: "success", resultsAllintitle: 336, measuredAt: "2026-09-19T10:01:00.000Z" },
    allintitle_measurement_history: [{ resultsAllintitle: 336, measuredAt: "2026-09-19T10:01:00.000Z" }],
    dataforseo_keyword_overview_history: [{ keywordDifficulty: 21, measuredAt: "2026-09-19T10:01:00.000Z" }],
    discovery_import: { source: "google_ads", sourceSnapshot: { provider: "google_ads", metrics: { averageMonthlySearches: 90, monthlySearchVolumes: SERIE } } },
    kgr_aplicabilidade: "applicable",
  };
  semantic.logical_output_contract = buildLogicalOutputContract({ semantic, intent: LOGICA, niche: "Estética", funnel: "MOFU" });
  return semantic;
}

const input = { keywordId: "kw-1", brandId: "brand-1", keyword: "sérum facial", intent: LOGICA, volumeSearch: 90, resultsAllintitle: 336, kgrScore: 3.7333, listaId: null };

test("a poda tira exatamente as quatro séries e nada mais", () => {
  const completa = semanticaCompleta();
  const podada = withoutMeasurementSeries(completa);

  assert.equal(hasMeasurementSeries(completa), true);
  assert.equal(hasMeasurementSeries(podada), false, "nenhuma série sobrou");
  assert.equal(podada.allintitle_measurement_history, undefined);
  assert.equal(podada.dataforseo_keyword_overview_history, undefined);

  // O que está ao lado da série no mesmo objeto continua inteiro: é dele que
  // a tabela tira volume e KD.
  const volume = podada.volume_measurement as Record<string, unknown>;
  assert.equal(volume.monthlySearchVolumes, undefined);
  assert.equal(volume.averageMonthlySearches, 90, "a média sobrevive à poda");
  const snapshot = ((podada.discovery_import as Record<string, unknown>).sourceSnapshot as Record<string, unknown>).metrics as Record<string, unknown>;
  assert.equal(snapshot.monthlySearchVolumes, undefined);
  assert.equal(snapshot.averageMonthlySearches, 90, "a métrica importada sobrevive");

  // E a origem da publicação nunca esteve em jogo: é dela que sai a proteção
  // contra exclusão.
  assert.deepEqual(withoutMeasurementSeries({ site_origin: { publicationStatus: "published" } }), { site_origin: { publicationStatus: "published" } });

  // A poda não muta o original.
  assert.ok(hasMeasurementSeries(completa), "a semântica de origem continua completa");
});

test("hidratar devolve as séries sem ressuscitar decisão antiga", () => {
  const completa = semanticaCompleta();
  const podada = withoutMeasurementSeries(completa);

  // Entre carregar a lista e expandir a linha, o humano mudou o nicho.
  const atual = { ...podada, nicho: "Dermocosmético" };
  const hidratada = withMeasurementSeries(atual, completa);

  assert.equal(hidratada.nicho, "Dermocosmético", "o estado da tela é quem manda");
  assert.deepEqual((hidratada.volume_measurement as Record<string, unknown>).monthlySearchVolumes, SERIE);
  assert.deepEqual(hidratada.allintitle_measurement_history, completa.allintitle_measurement_history);
  assert.equal(hasMeasurementSeries(hidratada), true);
});

test("hidratar não inventa estrutura que o escritor não mandou", () => {
  // Linha sem `discovery_import`: a série não cria o bloco do nada.
  const hidratada = withMeasurementSeries({ keyword: "x" }, semanticaCompleta());
  assert.equal(hidratada.discovery_import, undefined, "sem o bloco pai, nada é criado");
  assert.equal(hidratada.volume_measurement, undefined);
  // Mas as trilhas de raiz entram, porque não dependem de pai nenhum.
  assert.ok(Array.isArray(hidratada.allintitle_measurement_history));
});

test("a linha podada assina igual à completa: a listagem não gera divergência", async () => {
  const completa = semanticaCompleta();
  const aprovada = await applyApproval({ ...input, semantic: completa, approvedAt: "2026-09-20T12:00:00.000Z", approvedBy: "human-1" });

  const registro = readApprovalRecord(aprovada);
  assert.ok(registro?.signature.startsWith(`${APPROVAL_SIGNATURE_SCHEME}:`), "aprovação nova assina no esquema atual");
  assert.equal(approvedPackageDiverged({ ...input, semantic: aprovada }), false);

  // É ISTO que a poda precisava: a mesma linha, sem as séries, continua sendo
  // a mesma aprovação. Sem isto, as 29 aprovadas cairiam para em_revisao só
  // porque a tabela passou a saber menos.
  const podada = withoutMeasurementSeries(aprovada);
  assert.equal(approvedPackageDiverged({ ...input, semantic: podada }), false, "a linha podada NÃO diverge");
});

test("uma remedição das séries não rebaixa a aprovação; o que importa ainda rebaixa", async () => {
  const completa = semanticaCompleta();
  const aprovada = await applyApproval({ ...input, semantic: completa, approvedAt: "2026-09-20T12:00:00.000Z", approvedBy: "human-1" });

  // Chegou mais um mês na série: é medição, não significado.
  const remedida = { ...aprovada, volume_measurement: { ...(completa.volume_measurement as Record<string, unknown>), monthlySearchVolumes: [...SERIE, { year: 2026, month: 9, monthlySearches: 70 }] } };
  assert.equal(approvedPackageDiverged({ ...input, semantic: remedida }), false, "série nova não invalida o significado aprovado");

  // O que a assinatura garante continua garantido, por campo próprio.
  assert.equal(approvedPackageDiverged({ ...input, semantic: aprovada, volumeSearch: 900 }), true, "volume mudou: diverge");
  assert.equal(approvedPackageDiverged({ ...input, semantic: aprovada, resultsAllintitle: 12 }), true, "allintitle mudou: diverge");
  assert.equal(approvedPackageDiverged({ ...input, semantic: aprovada, kgrScore: 0.2 }), true, "KGR mudou: diverge");
  // E o DNA, que é o que a assinatura existe para cobrir.
  assert.equal(approvedPackageDiverged({ ...input, semantic: { ...aprovada, nicho: "Outro" } }), true, "nicho mudou: diverge");
  // Inclusive a média dentro do mesmo bloco de onde a série saiu.
  assert.equal(approvedPackageDiverged({ ...input, semantic: { ...aprovada, volume_measurement: { ...(completa.volume_measurement as Record<string, unknown>), averageMonthlySearches: 4000 } } }), true, "a média do bloco continua assinada");
});

test("registro v2 continua verificável e migra para o esquema atual", async () => {
  const completa = semanticaCompleta();
  const aprovada = await applyApproval({ ...input, semantic: completa, approvedAt: "2026-09-20T12:00:00.000Z", approvedBy: "human-1" });
  const atual = readApprovalRecord(aprovada);
  assert.ok(atual);

  // Simula o que está gravado hoje: mesma linha, assinatura no esquema antigo.
  const v2 = { ...aprovada, aprovacao: { ...atual, signature: legadoV2({ ...input, semantic: completa }) } };

  assert.equal(approvedPackageDiverged({ ...input, semantic: v2 }), false, "v2 continua verificável no esquema que declara");

  const migrado = await resignApprovalRecord({ ...input, semantic: v2 });
  assert.ok(migrado.semantic, "um v2 que ainda bate é re-assinado");
  const depois = readApprovalRecord(migrado.semantic);
  assert.ok(depois?.signature.startsWith(`${APPROVAL_SIGNATURE_SCHEME}:`));
  assert.equal(depois?.approvedAt, atual.approvedAt, "instante preservado");
  assert.equal(depois?.approvedBy, atual.approvedBy, "autor preservado");
  assert.equal(depois?.version, atual.version, "versão preservada");

  // Um v2 que já divergia é revisão de verdade: re-assinar esconderia isso.
  const recusado = await resignApprovalRecord({ ...input, semantic: { ...v2, nicho: "Outro" } });
  assert.equal(recusado.semantic, null);
  assert.equal("reason" in recusado ? recusado.reason : null, "diverged");
});

test("a migration poda exatamente os caminhos do módulo, e o gatilho os restaura", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260921030000_listagem_sem_series_de_medicao.sql", import.meta.url), "utf8");
  // Aspas dobradas: os literais moram dentro de uma string plpgsql.
  const limpo = sql.replace(/^--.*$/gm, "").replace(/''/g, "'");

  for (const caminho of MEASUREMENT_SERIES_PATHS) {
    assert.ok(limpo.includes(`#- '{${caminho.join(",")}}'`), `a view poda ${caminho.join(".")}`);
    assert.ok(limpo.includes(`ARRAY['${caminho.join("','")}']`), `o gatilho restaura ${caminho.join(".")}`);
  }

  // Nada além das quatro: uma trilha a mais na view sem estar no módulo
  // voltaria a produzir a divergência que o esquema v3 resolveu.
  assert.equal((limpo.match(/#- '\{/g) || []).length, MEASUREMENT_SERIES_PATHS.length, "a view não poda mais do que o módulo declara");
  assert.equal((limpo.match(/minerador_restaura_serie\(resultado/g) || []).length, MEASUREMENT_SERIES_PATHS.length, "o gatilho cobre as mesmas quatro");

  assert.match(limpo, /security_invoker = true/, "a view não contorna a RLS da tabela");
  assert.match(limpo, /BEFORE UPDATE ON public\.minerador_keywords/, "a preservação acontece antes da escrita");
});

test("a listagem lê a view e recua para a tabela se ela não existir", () => {
  const ws = readFileSync(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
  const limpo = ws.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(limpo, /lerDe\(fonteDaListagem\)/, "a listagem lê da fonte podada");
  assert.match(limpo, /viewDeListagemAusente\(keywordsError\)/, "e reconhece a view ausente");
  assert.match(limpo, /fonteDaListagem = MINERADOR_KEYWORDS_TABLE/, "recuando para a tabela completa");

  // Hidratação: sob demanda, da tabela, uma keyword por vez.
  assert.match(limpo, /withMeasurementSeries\(item\.analise_semantica, completo\)/, "expandir mescla as séries");
  assert.match(limpo, /hydratedKeywordIdsRef\.current = new Set\(\)/, "recarregar invalida o que fora hidratado");
});
