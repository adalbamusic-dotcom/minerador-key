/**
 * RECUPERAR NÃO É COLETAR.
 *
 * Uma coleta real que já voltou do DataForSEO pode estar gravada em
 * `editorial_serp_snapshots` e ao mesmo tempo ausente da tela — foi o que
 * aconteceu quando a gravação do cache do navegador tinha poder de veto sobre
 * o estado em memória. Nesse cenário a pesquisa já foi paga e perguntar ao
 * provider de novo cobra duas vezes pelo mesmo dado.
 *
 * Este módulo decide QUAL snapshot já persistido responde por um artigo, sem
 * nenhuma chamada a provider. Ele é a autoridade da recuperação; a rota apenas
 * o consulta.
 */

import type { SerpCollectionRecord } from "../editorial/contracts.ts";

export type RadarSerpRecoveryOutcome =
  | { state: "RECOVERED"; record: SerpCollectionRecord; reason: string }
  | { state: "NOTHING_PERSISTED"; record: null; reason: string }
  | { state: "OTHER_ARTICLE_DNA_VERSION"; record: null; reason: string };

/**
 * O último snapshot REAL já persistido para este artigo, na versão pedida.
 *
 * Três recusas explícitas, porque cada uma significa uma coisa diferente para
 * quem opera:
 *
 * - nada persistido: a coleta não chegou a ser gravada; refazer é legítimo;
 * - existe, mas de outra versão do ArticleDNA: o fundamento mudou, e aproveitar
 *   descreveria o artigo antigo sob o carimbo do novo;
 * - recuperado: existe e serve — e nenhuma unidade paga é gasta.
 *
 * `simulado` e `origin !== "real"` nunca entram: recuperar um mock como se
 * fosse coleta paga seria pior do que não recuperar nada.
 */
export function recoverRadarSerpSnapshot(input: {
  records: readonly SerpCollectionRecord[];
  articleId: string;
  articleDnaVersionId: string;
}): RadarSerpRecoveryOutcome {
  const doArtigo = input.records.filter(record =>
    record.input.articleId === input.articleId
    && record.origin === "real"
    && !record.isMock
    && Boolean(record.research));

  if (!doArtigo.length) {
    return { state: "NOTHING_PERSISTED", record: null, reason: "Não há coleta real gravada remotamente para este artigo." };
  }

  const naVersao = doArtigo.filter(record => record.research?.articleDnaVersionId === input.articleDnaVersionId);
  if (!naVersao.length) {
    return {
      state: "OTHER_ARTICLE_DNA_VERSION",
      record: null,
      reason: `Existem ${doArtigo.length} coleta(s) real(is) gravada(s), mas de outra versão do ArticleDNA. Recuperá-las descreveria um artigo que já mudou.`,
    };
  }

  /*
   * A ORDEM VEM DA VERSÃO DO SNAPSHOT, NÃO DA ORDEM DE CHEGADA.
   *
   * A leitura remota já vem ordenada, mas depender disso deixaria a escolha do
   * "mais recente" nas mãos de um `ORDER BY` distante. `version` é o número que
   * a própria cadeia de snapshots mantém.
   */
  const escolhido = naVersao
    .slice()
    .sort((esquerda, direita) => (esquerda.research?.version || 0) - (direita.research?.version || 0))
    .at(-1)!;

  return {
    state: "RECOVERED",
    record: escolhido,
    reason: `SERP real v${escolhido.research?.version || 1} recuperada do que já está gravado. Nenhuma consulta nova foi feita ao provider.`,
  };
}
