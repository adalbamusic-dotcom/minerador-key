import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pruneRadarAnalysisHistory, radarAnalysisVersionsToPreserve } from "../lib/radar/analysis-history-pruning.ts";
import { compactRadarResearchForRead, radarResearchIsFrozen } from "../lib/radar/research-read-model.ts";

/**
 * A listagem do workflow para de baixar as corridas históricas.
 *
 * Medido em 2026-09-21, em bytes de fio: `editorial_workflow_items` tem 10 MB
 * em 3 linhas de estágio `radar`, 98,7% em `analysisVersions`.
 *
 * A poda e a compactação já existiam — e rodavam DEPOIS do download, no
 * servidor Next. Economizavam banda do navegador, não egresso da Supabase:
 * os 10 MB já tinham saído. O corte precisa acontecer na consulta.
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

const SEM_COMENTARIO = /^[ \t]*--.*$/gm;

const migration = readFileSync(
  new URL("../supabase/migrations/20260921060000_listagem_workflow_sem_corridas.sql", import.meta.url),
  "utf8",
).replace(SEM_COMENTARIO, "");

function versao(numero: number, status: string) {
  return {
    versionId: `v${numero}`,
    versionNumber: numero,
    payload: {
      status,
      extractions: [{ url: "https://exemplo.test/1", body: "peso" }],
      competitiveReport: { resumo: "peso" },
      youtubeSearch: { items: ["peso"] },
      amazonSearch: { items: ["peso"] },
      observedSummary: { total: 51 },
    },
  };
}

test("a view esvazia exatamente os campos que a poda em TS esvazia", () => {
  // A fonte da verdade é a poda: se um quinto campo pesado entrar nela, este
  // teste acusa a view desatualizada em vez de deixar o egresso voltar.
  const historico = [versao(1, "draft"), versao(2, "draft")];
  const podado = pruneRadarAnalysisHistory(historico as never);

  const antiga = historico[0].payload as Record<string, unknown>;
  const antigaPodada = (podado[0] as { payload: Record<string, unknown> }).payload;
  const esvaziados = Object.keys(antiga).filter(
    campo => JSON.stringify(antiga[campo]) !== JSON.stringify(antigaPodada[campo]),
  );

  assert.ok(esvaziados.length > 0, "a poda realmente esvazia algo");
  for (const campo of esvaziados) {
    assert.ok(
      migration.includes(`ARRAY['payload','${campo}']`),
      `a view precisa esvaziar ${campo}, que a poda em TS esvazia`,
    );
  }

  // E nada além disso: a view não pode ser mais agressiva que a poda.
  const naView = [...migration.matchAll(/ARRAY\['payload','([a-zA-Z]+)'\]/g)].map(m => m[1]);
  assert.deepEqual([...naView].sort(), [...esvaziados].sort(), "view e poda esvaziam o mesmo conjunto");

  // Mesma semântica: vira vazio, não some. Uma versão sem a chave falharia a
  // validação em vez de carregar leve.
  assert.deepEqual(antigaPodada.extractions, []);
  assert.equal(antigaPodada.competitiveReport, null);
  assert.equal(antigaPodada.observedSummary, antiga.observedSummary, "o resumo sobrevive: é dele que sai a contagem");
});

test("a view preserva um SUPERCONJUNTO do que a poda preserva", () => {
  // A propriedade que sustenta o desenho: o SQL nunca pode tirar o que o TS
  // guardaria. Se tirasse, seria perda de dado na leitura.
  const historico = [versao(1, "draft"), versao(2, "approved"), versao(3, "approved"), versao(4, "draft")];
  const preservadasTs = radarAnalysisVersionsToPreserve(historico as never);

  // TS: a corrente (4) e a ÚLTIMA aprovada (3).
  assert.deepEqual([...preservadasTs].sort(), ["v3", "v4"]);

  // A view: a corrente e TODAS as aprovadas — v2, v3 e v4. Superconjunto.
  assert.match(migration, /'status' = 'approved'/, "toda aprovada passa inteira");
  assert.match(migration, /max\(\(maior\.valor ->> 'versionNumber'\)::numeric\)/, "a corrente é a de maior número");

  // Sem número legível não se decide o que é histórico: preserva.
  assert.match(migration, /versionNumber' IS NULL/, "versão sem número é preservada");
});

test("a poda em TS continua rodando depois: é ela quem decide", () => {
  const repo = readFileSync(new URL("../lib/server/editorial-repositories.ts", import.meta.url), "utf8");
  const limpo = repo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(limpo, /lerDe\(fonteDaListagemWorkflow\)/, "a listagem lê da view");
  assert.match(limpo, /viewDeWorkflowAusente\(error\)/, "e reconhece a view ausente");
  assert.match(limpo, /fonteDaListagemWorkflow = WORKFLOW_TABELA/, "recuando para a tabela");

  // A view é otimização, não decisão. Sem a poda depois, uma divergência
  // entre as duas regras viraria conteúdo a mais viajando — ou pior, a menos.
  assert.match(limpo, /pruneRadarAnalysisHistory\(/, "a poda continua no caminho de leitura");
  assert.match(limpo, /compactRadarResearchForRead\(/, "a compactação também");

  // O readback por artigo NÃO passa pela view: é dele que nasce toda escrita.
  assert.match(limpo, /from\("editorial_workflow_items"\)\.select\("\*"\)/, "byArticle lê a tabela inteira");
});

/* ============ a compactação da investigação congelada ============ */

const migracaoCompacta = readFileSync(
  new URL("../supabase/migrations/20260921070000_listagem_workflow_compacta_congelada.sql", import.meta.url),
  "utf8",
).replace(SEM_COMENTARIO, "");

/*
 * 2026-10-02 · o corpo vigente mora em 20261002130000: a compactação passou a
 * ser POR PERFIL. A antiga esvaziava toda corrida quando QUALQUER fotografia
 * existia — e um artigo do Google finalizado perdia, na listagem, a pesquisa
 * do YouTube ainda viva (a tela dizia "Nenhuma coleta ainda" sobre 51 vídeos).
 */
const migracaoPorPerfil = readFileSync(
  new URL("../supabase/migrations/20261002130000_compactacao_por_perfil.sql", import.meta.url),
  "utf8",
).replace(SEM_COMENTARIO, "");

/** Só o corpo da função de compactação, na versão vigente. */
const corpoCompactacao = migracaoPorPerfil.slice(
  migracaoPorPerfil.indexOf("CREATE OR REPLACE FUNCTION public.editorial_radar_versao_compactada"),
  migracaoPorPerfil.indexOf("COMMENT ON FUNCTION public.editorial_radar_versao_compactada"),
);

function investigacaoCongelada() {
  return {
    finalizedBundle: { resumo: "congelado" },
    amazonFrozenInvestigation: { resumo: "congelado" },
    youtubeFrozenInvestigation: { resumo: "congelado" },
    amazonSearch: { items: ["peso"] },
    youtubeSearch: { items: ["peso"] },
    extractions: [{ url: "https://exemplo.test/1", body: "peso" }],
    competitiveReport: { resumo: "peso" },
    observedSummary: { total: 51 },
  };
}

test("a view compacta exatamente o que a compactação em TS compacta", () => {
  const antes = investigacaoCongelada() as Record<string, unknown>;
  const depois = compactRadarResearchForRead(antes as never) as Record<string, unknown>;

  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  const mudados = [...chaves].filter(campo => JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo]));

  for (const campo of mudados) {
    assert.ok(corpoCompactacao.includes(`ARRAY['${campo}']`), `a view precisa tratar ${campo}`);
  }

  // E nada além: `competitiveReport` é da PODA, não da compactação. Esvaziá-lo
  // aqui tiraria de uma versão corrente conteúdo que a tela abre.
  // `ARRAY['payload']` fica de fora: é o caminho do invólucro da versão, por
  // onde o payload compactado é reinserido, não um campo que se esvazia.
  const naView = [...corpoCompactacao.matchAll(/ARRAY\['([a-zA-Z]+)'\]/g)]
    .map(m => m[1])
    .filter(campo => campo !== "payload");
  assert.deepEqual([...new Set(naView)].sort(), [...mudados].sort(), "view e TS compactam o mesmo conjunto");
  assert.ok(!mudados.includes("competitiveReport"), "a compactação não mexe no relatório competitivo");
  assert.equal(depois.observedSummary, antes.observedSummary, "o resumo sobrevive: é dele que sai a contagem");
});

test("a marca COMPACT acompanha a perda — nem a mais, nem a menos", () => {
  const compactada = compactRadarResearchForRead(investigacaoCongelada() as never) as Record<string, unknown>;
  assert.equal(compactada.researchTransport, "COMPACT", "perdeu conteúdo: marca");
  assert.match(corpoCompactacao, /'researchTransport'\], '"COMPACT"'::jsonb/, "a view marca junto");

  // Esvaziar sem marcar e marcar sem esvaziar são os dois erros graves.
  // Não congelada: intacta, sem marca.
  const viva = { amazonSearch: { items: [1] }, extractions: [{ a: 1 }] };
  assert.equal(radarResearchIsFrozen(viva), false);
  assert.equal((compactRadarResearchForRead(viva as never) as Record<string, unknown>).researchTransport, undefined);
  // A view só reescreve o payload quando algum perfil de fato perde conteúdo.
  assert.match(
    corpoCompactacao,
    /WHEN tira_amostra OR tira_amazon OR tira_youtube THEN jsonb_set\(p_versao, ARRAY\['payload'\], pl, true\)\s+ELSE p_versao/,
    "a view devolve intacta a versão sem perda",
  );

  // Congelada sem nada a perder: intacta e SEM marca. Marcar aqui recusaria
  // escrita legítima, porque a base não é lossy.
  const congeladaVazia = { finalizedBundle: { x: 1 }, amazonSearch: null, youtubeSearch: null, extractions: [] };
  const semPerda = compactRadarResearchForRead(congeladaVazia as never) as Record<string, unknown>;
  assert.equal(semPerda.researchTransport, undefined, "nada perdido, nada marcado");

  // NULL não pode virar compactação: payload ausente faria `jsonb_typeof`
  // devolver NULL, e um NULL em `NOT congelada` cairia no ELSE.
  assert.match(corpoCompactacao, /coalesce\(/, "os sinais são coalescidos para false");
});

test("cada corrida só sai quando a fotografia DO SEU perfil existe (2026-10-02)", () => {
  // O caso que quebrou: Google finalizado + pesquisa do YouTube viva, sem
  // fotografia própria. A corrida viva é a única cópia; tirá-la escondia a
  // coleta e o botão de finalizar depois de recarregar.
  const googleCongeladoYoutubeVivo = {
    finalizedBundle: { resumo: "congelado" },
    youtubeSearch: { state: "COLLECTED", items: ["51 vídeos"] },
    extractions: [{ url: "https://exemplo.test/1", body: "peso" }],
  };
  const lida = compactRadarResearchForRead(googleCongeladoYoutubeVivo as never) as Record<string, unknown>;
  assert.deepEqual(lida.youtubeSearch, googleCongeladoYoutubeVivo.youtubeSearch, "a corrida viva do YouTube passa inteira");
  assert.deepEqual(lida.extractions, [], "a amostra do Google, congelada, sai");
  assert.equal(lida.researchTransport, "COMPACT", "algo saiu: marca");

  // O mesmo vale para a Amazon e para o caminho inverso (YouTube congelado,
  // Google ainda em coleta: a amostra fica).
  const amazonViva = { youtubeFrozenInvestigation: { x: 1 }, youtubeSearch: { items: [1] }, amazonSearch: { items: [2] } };
  const lidaAmazon = compactRadarResearchForRead(amazonViva as never) as Record<string, unknown>;
  assert.equal(lidaAmazon.youtubeSearch, null, "a corrida do YouTube congelado sai");
  assert.deepEqual(lidaAmazon.amazonSearch, amazonViva.amazonSearch, "a da Amazon viva fica");
  const googleVivo = { youtubeFrozenInvestigation: { x: 1 }, extractions: [{ a: 1 }] };
  const lidaGoogle = compactRadarResearchForRead(googleVivo as never) as Record<string, unknown>;
  assert.deepEqual(lidaGoogle.extractions, googleVivo.extractions, "sem finalizedBundle a amostra do Google fica");
  assert.equal(lidaGoogle.researchTransport, undefined, "nada saiu, nada marcado");

  // A view casa cada campo com a SUA fotografia — nunca com um "congelada" global.
  assert.match(corpoCompactacao, /'youtubeFrozenInvestigation'\) = 'object'\s+AND jsonb_typeof\(pl -> 'youtubeSearch'\) = 'object', false\) AS tira_youtube/);
  assert.match(corpoCompactacao, /'amazonFrozenInvestigation'\) = 'object'\s+AND jsonb_typeof\(pl -> 'amazonSearch'\) = 'object', false\) AS tira_amazon/);
  assert.match(corpoCompactacao, /'finalizedBundle'\) = 'object'\s+AND jsonb_typeof\(pl -> 'extractions'\) = 'array'/);
  assert.match(corpoCompactacao, /CASE WHEN tira_youtube\s+THEN jsonb_set\(pl, ARRAY\['youtubeSearch'\]/);
  assert.match(corpoCompactacao, /CASE WHEN tira_amazon\s+THEN jsonb_set\(pl, ARRAY\['amazonSearch'\]/);
  assert.match(corpoCompactacao, /CASE WHEN tira_amostra\s+THEN jsonb_set\(pl, ARRAY\['extractions'\]/);
  assert.doesNotMatch(corpoCompactacao, /congelada/, "o sinal global antigo não volta");

  // A migration só troca o corpo: mesma assinatura, mesmo search_path fixo.
  assert.match(corpoCompactacao, /SET search_path = pg_catalog, public, pg_temp/);
  const rollback = readFileSync(
    new URL("../supabase/rollback/20261002130000_compactacao_por_perfil.rollback.sql", import.meta.url),
    "utf8",
  );
  assert.match(rollback, /CREATE OR REPLACE FUNCTION public\.editorial_radar_versao_compactada\(p_versao jsonb\)/);
  assert.match(rollback, /WHEN NOT congelada THEN p_versao/, "o rollback devolve o corpo antigo");
});

test("a trava existe mesmo: base COMPACT não gera versão nova", () => {
  // É isto que dá peso ao teste acima. Sem esta recusa, esvaziar campos na
  // leitura seria só economia; com ela, marcar errado tem consequência.
  const contratos = readFileSync(new URL("../lib/radar/analysis-contracts.ts", import.meta.url), "utf8");
  const limpo = contratos.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(limpo, /researchTransport === "COMPACT"[\s\S]{0,80}RadarCompactBaseError/);
});

test("poda e compactação entram na mesma ordem do repositório", () => {
  // Na ordem inversa, a compactação veria a corrida ainda cheia numa versão
  // histórica e a marcaria como COMPACT — travando escrita sem motivo.
  assert.match(
    migracaoCompacta,
    /editorial_radar_versao_compactada\(\s*CASE/,
    "a compactação embrulha o resultado da poda",
  );
});
