/**
 * VERIFICAR UMA FONTE É NAVEGAR — e navegar tem dono, hora e regra.
 *
 * O Gate 11 capturou destinos sem visitá-los: href não é conteúdo. Para avaliar
 * uma afirmação de consequência, porém, saber que a AAD foi citada não basta —
 * é preciso ver o que ela diz e o que ela é.
 *
 * TRÊS CONDIÇÕES, TODAS OBRIGATÓRIAS:
 *
 *   1. SÓ DENTRO DO ANALYZE ACIONADO PELA PESSOA. Nenhuma montagem, reload,
 *      troca de aba ou render busca fonte. Esta função é chamada por quem
 *      processa a ação; ela não se agenda sozinha.
 *
 *   2. O DESTINO NASCE DA CANDIDATA PERSISTIDA. O cliente manda o domínio da
 *      candidata, e o endereço é resolvido a partir do plano de verificação —
 *      que veio dos links realmente observados. Não existe campo por onde uma
 *      URL arbitrária entre.
 *
 *   3. OS MESMOS GUARDAS DA EXTRAÇÃO. SSRF, destino privado, status HTTP antes
 *      do corpo, limite de redirect, content-type e timeout: tudo reutilizado
 *      de `extractCompetitorPage`, porque duplicar guarda de segurança é criar
 *      a versão que será esquecida na próxima correção.
 *
 * O que sai daqui é metadado e resumo compacto. Nunca o artigo da fonte.
 */

import { extractCompetitorPage, CompetitorExtractionError } from "./competitor-extractor.ts";
import { classifyRadarSourceAuthority, type RadarSourceClassification, type RadarSourceVerificationTarget } from "./source-authority.ts";

import type { RadarExtractionPage } from "./analysis-contracts.ts";

export type RadarVerifiedSource = {
  domain: string;
  url: string;
  classification: RadarSourceClassification;
  page: RadarExtractionPage;
};

export type RadarSourceVerificationFailure = {
  domain: string;
  url: string;
  code: string;
  status: number | null;
  message: string;
};

export type RadarSourceVerificationResult = {
  verified: RadarVerifiedSource[];
  failures: RadarSourceVerificationFailure[];
  limitations: string[];
};

/**
 * Busca as fontes escolhidas, uma vez cada.
 *
 * A deduplicação já veio do plano; aqui a garantia é de que a mesma URL não é
 * buscada duas vezes nem que uma falha derrube a rodada inteira — uma fonte
 * bloqueada vira limitação declarada, não exceção que apaga as outras.
 */
export async function verifyRadarSources(input: {
  targets: readonly RadarSourceVerificationTarget[];
  fetchImpl?: typeof fetch;
  lookupImpl?: Parameters<typeof extractCompetitorPage>[1] extends { lookupImpl?: infer T } ? T : never;
  now?: string;
}): Promise<RadarSourceVerificationResult> {
  const verified: RadarVerifiedSource[] = [];
  const failures: RadarSourceVerificationFailure[] = [];
  const limitations: string[] = [];
  const visitadas = new Set<string>();

  for (const target of input.targets) {
    if (visitadas.has(target.candidateUrl)) continue;
    visitadas.add(target.candidateUrl);

    try {
      const page = await extractCompetitorPage(target.candidateUrl, {
        fetchImpl: input.fetchImpl,
        lookupImpl: input.lookupImpl,
        now: input.now,
      });
      verified.push({
        domain: target.domain,
        url: page.url,
        classification: classifyRadarSourceAuthority({ domain: target.domain, url: page.url, verifiedPage: page }),
        page,
      });
    } catch (error) {
      const tipado = error instanceof CompetitorExtractionError ? error : null;
      failures.push({
        domain: target.domain,
        url: target.candidateUrl,
        code: tipado?.code || "fetch_failed",
        status: tipado?.status ?? null,
        message: tipado?.message || "A fonte não pôde ser verificada.",
      });
    }
  }

  if (failures.length) {
    limitations.push(`${failures.length} fonte(s) não puderam ser verificadas (${[...new Set(failures.map(item => item.code))].join(", ")}); a natureza delas permanece lida apenas pelo endereço.`);
  }
  const semAutoria = verified.filter(item => !item.page.author).length;
  if (semAutoria) limitations.push(`${semAutoria} fonte(s) verificada(s) não identificam autoria — a credencial de quem escreveu não pôde ser observada.`);
  const semData = verified.filter(item => !item.page.hasDates).length;
  if (semData) limitations.push(`${semData} fonte(s) verificada(s) não expõem data: não há como saber se a informação está atualizada.`);

  return { verified, failures, limitations };
}
