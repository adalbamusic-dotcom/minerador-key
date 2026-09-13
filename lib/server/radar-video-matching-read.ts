import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  radarCoverageFromExtracts,
  summarizeRadarBriefCoverage,
  type RadarBriefCoverage,
  type RadarFrozenBriefInput,
  type RadarRelevantExtract,
} from "@/lib/radar/video-brief-matching";
import { readRadarExtractRun, type RadarExtractRun } from "@/lib/server/radar-video-brief-extracts";
import { WorkflowRepository } from "@/lib/server/editorial-repositories";

/**
 * O CASAMENTO GRAVADO — uma leitura, dois consumidores.
 *
 * VIDEOS_3.4.1 · o defeito que este módulo existe para não repetir: o clique
 * montava o resultado a partir da resposta do POST e a tela vivia disso. Não
 * havia leitura nenhuma ao abrir a página — então o F5 apagava um casamento que
 * estava íntegro no banco, e a tela voltava a dizer "ainda não foram casados".
 *
 * DEPOIS DE UM CASAMENTO, A AUTORIDADE É REMOTA. O que se vê tem de sair do
 * banco, tanto no clique quanto no carregamento. Duas projeções — uma para "o
 * que acabei de calcular", outra para "o que estava lá" — é o desenho que
 * produz telas que discordam de si mesmas depois de um F5.
 *
 * Esta função é a projeção única. Ela LÊ e só lê: nenhum provider, nenhuma
 * gravação, nenhum recálculo de transcript.
 */

type Cliente = SupabaseClient;

export type RadarVideoMatchingRead = {
  /** As pautas congeladas do artigo. Vazio quando não há investigação congelada. */
  briefs: RadarFrozenBriefInput[];
  frozenBundleId: string | null;
  frozenBundleHash: string | null;
  /**
   * A execução CORRENTE — a mais recente não superada para este bundle.
   *
   * `null` significa "nunca casou", e isso é diferente de "casou e não achou
   * nada": o primeiro pede uma ação, o segundo é resposta.
   */
  run: RadarExtractRun | null;
  extracts: RadarRelevantExtract[];
  coverage: RadarBriefCoverage[];
  summary: ReturnType<typeof summarizeRadarBriefCoverage>;
  /** Qual matcher produziu a execução corrente. Sai da impressão digital. */
  matcherVersion: number | null;
  inputFingerprint: string | null;
};

/**
 * QUAL MATCHER PRODUZIU AQUELA EXECUÇÃO.
 *
 * A impressão digital começa com `m<versão>:`. Ler dali evita uma coluna nova
 * para um dado que já está gravado — e mantém a resposta verdadeira para as
 * execuções antigas, inclusive a m2 de 509 trechos, que continua legível.
 */
export function radarMatcherVersionOfFingerprint(fingerprint: string | null | undefined): number | null {
  const encontrado = /^m(\d+):/.exec(String(fingerprint || ""));
  return encontrado ? Number(encontrado[1]) : null;
}

/**
 * AS PAUTAS CONGELADAS DO ARTIGO. Sem elas não há casamento.
 *
 * O caminho é o mesmo que `radar-analysis` já usa — item do workflow, versões
 * de análise dentro do payload, bundle congelado dentro da análise. Reusar o
 * `WorkflowRepository` em vez de montar a consulta aqui é o que impede as duas
 * leituras de divergirem quando a de lá mudar.
 *
 * A escolhida é a análise MAIS RECENTE que tenha bundle congelado: uma análise
 * posterior sem congelamento não apaga a evidência da anterior.
 */
export async function readRadarFrozenVideoBriefs(brandId: string, articleId: string): Promise<{
  briefs: RadarFrozenBriefInput[]; frozenBundleId: string; frozenBundleHash: string;
} | null> {
  const item = await new WorkflowRepository().findByArticle(brandId, articleId, "radar");
  if (!item) return null;

  const payload = item.payload as { analysisVersions?: Array<{ payload?: Record<string, unknown> }> } | null;
  const versoes = Array.isArray(payload?.analysisVersions) ? payload.analysisVersions : [];

  for (const versao of [...versoes].reverse()) {
    const bundle = versao?.payload?.finalizedBundle as Record<string, unknown> | null | undefined;
    const blueprint = bundle?.blueprint as Record<string, unknown> | undefined;
    const snapshots = (blueprint?.videoBriefSnapshots as RadarFrozenBriefInput[] | undefined) || [];
    if (bundle?.bundleId && snapshots.length) {
      return {
        briefs: snapshots,
        frozenBundleId: String(bundle.bundleId),
        frozenBundleHash: String(bundle.bundleHash || ""),
      };
    }
  }
  return null;
}

/**
 * O CASAMENTO DESTE ARTIGO, COMO O BANCO O TEM.
 *
 * O `frozenBundleId` NÃO vem do cliente: ele é derivado aqui, da mesma
 * investigação congelada que o casamento usou. Exigi-lo na consulta obrigava a
 * tela a saber de bundle para poder ler o próprio resultado — e uma tela que
 * ainda não carregou a investigação não sabe, o que a deixava sem como pedir.
 *
 * A supersessão é respeitada pela leitura da execução: só a corrente volta. A
 * m2 de 509 trechos continua gravada e não reaparece.
 */
export async function loadRadarVideoBriefMatching(input: {
  brandId: string;
  articleId: string;
  client?: Cliente;
}): Promise<RadarVideoMatchingRead> {
  const pautas = await readRadarFrozenVideoBriefs(input.brandId, input.articleId);

  if (!pautas) {
    return {
      briefs: [], frozenBundleId: null, frozenBundleHash: null,
      run: null, extracts: [], coverage: [],
      summary: summarizeRadarBriefCoverage([]),
      matcherVersion: null, inputFingerprint: null,
    };
  }

  const gravado = await readRadarExtractRun({
    brandId: input.brandId, articleId: input.articleId,
    frozenBundleId: pautas.frozenBundleId, client: input.client,
  });

  /*
   * SEM EXECUÇÃO, NÃO HÁ COBERTURA A CALCULAR — e a saída é antes da conta.
   *
   * Classificar pautas sem execução devolveria quatro `NOT_FOUND` com cara de
   * resultado: "casou e não achou nada" em vez de "nunca casou". São duas
   * respostas diferentes, e quem lê a tela age diferente em cada uma.
   */
  if (!gravado.run) {
    return {
      briefs: pautas.briefs,
      frozenBundleId: pautas.frozenBundleId,
      frozenBundleHash: pautas.frozenBundleHash,
      run: null, extracts: [], coverage: [],
      summary: summarizeRadarBriefCoverage([]),
      matcherVersion: null, inputFingerprint: null,
    };
  }

  const coverage = radarCoverageFromExtracts({ briefs: pautas.briefs, extracts: gravado.extracts });

  return {
    briefs: pautas.briefs,
    frozenBundleId: pautas.frozenBundleId,
    frozenBundleHash: pautas.frozenBundleHash,
    run: gravado.run,
    extracts: gravado.extracts,
    coverage,
    summary: summarizeRadarBriefCoverage(coverage),
    matcherVersion: radarMatcherVersionOfFingerprint(gravado.run.inputFingerprint),
    inputFingerprint: gravado.run.inputFingerprint,
  };
}
