/**
 * ====== 2026-10-08 · A INVESTIGAÇÃO DA LINHA ATRAVESSA RENDERS — COM A ENTRADA INTEIRA NA CHAVE ======
 *
 * O DONO VIU: "o selector e o scroll estão muito lentos … demora muito, mas
 * muito mesmo". MEDIDO na bancada do scratchpad (25 artigos analisados, 12
 * páginas e 36 links por página, React de desenvolvimento): clicar numa linha
 * custava de 14 a 19 s, marcar um checkbox 14 s, um aviso publicado 9 s. Cerca
 * de 90% de cada render era `buildRadarDeepResearchView` refeito para TODAS as
 * linhas — e um clique faz de 3 a 4 renders.
 *
 * O RADAR_SELECTION_LIGHT_1 decidiu que o modelo da linha vive UM render (a
 * regra C de `tests/radar-selecao-leve-1.test.mts`), para nunca mostrar o
 * estado anterior. Essa decisão continua valendo para `cacheDaLinha`,
 * `cacheDaProjecao` e `cacheDoBlueprint`. Só a view da investigação ganha
 * memória entre renders — e a chave é a ENTRADA INTEIRA dela, por identidade:
 *
 *   dono  = o RadarItem (WeakMap: item novo, conta nova — versão gravada nova,
 *           releitura, troca de estado, tudo isso troca o item);
 *   chave = [ArticleDNA, registro SERP mais recente, "rodando?", rascunho da
 *           curadoria do artigo, modo efetivo].
 *
 * Todo campo do objeto que a tela entrega a `buildRadarDeepResearchView` é
 * derivado dessas identidades (o contexto sai do item e do ArticleDNA; a
 * SERP, a seleção canônica e o diagnóstico saem do registro; extrações,
 * falhas, fontes, bundle e modelo saem da análise corrente, que é do item).
 * `tests/radar-investigacao-memo.test.mts` prende essa lista ao objeto literal
 * da página: um insumo novo fora da chave quebra o teste antes de servir dado
 * velho.
 *
 * A view é pura — "quem tem relógio informa" — e não lê relógio, rede nem
 * storage; a mesma entrada devolve a mesma leitura.
 *
 * Um memo por instância de `createRadarDeepResearchViewMemo`; como o dono é o
 * próprio item, marcas diferentes nunca compartilham entrada.
 */

/** O que decide se a view guardada ainda descreve a linha. */
export type RadarDeepResearchViewKey = {
  /** O RadarItem da linha. Identidade nova = conta nova. */
  row: object;
  /** O ArticleDNA da linha (`pipeline.articleVersions[articleId]`). */
  article: unknown;
  /** O registro SERP mais recente do artigo, como a tela o escolheu. */
  serpRecord: unknown;
  /** Coleta, análise ou ação em curso neste artigo. */
  running: boolean;
  /** As marcações locais da curadoria da pesquisa deste artigo. */
  researchDraft: unknown;
  /** O modo efetivo da linha (sessão → gravado → padrão). */
  mode: string;
};

type Guardada<Valor> = { chave: readonly unknown[]; valor: Valor };

const chaveDe = (entrada: RadarDeepResearchViewKey): readonly unknown[] =>
  [entrada.article, entrada.serpRecord, entrada.running, entrada.researchDraft, entrada.mode];

const mesmaChave = (esquerda: readonly unknown[], direita: readonly unknown[]) =>
  esquerda.length === direita.length && esquerda.every((valor, indice) => Object.is(valor, direita[indice]));

/**
 * Um memo da view da investigação por linha.
 *
 * `montar` só roda quando o item é novo para o memo ou quando qualquer
 * elemento da chave mudou de identidade; fora isso, devolve o MESMO objeto da
 * última montagem — e é essa identidade estável que também impede o laço do
 * painel do Especialista (os pontos de revisão deixam de chegar como array
 * novo a cada render).
 */
export function createRadarDeepResearchViewMemo<Valor>() {
  const guardadas = new WeakMap<object, Guardada<Valor>>();
  return function lerInvestigacaoDaLinha(entrada: RadarDeepResearchViewKey, montar: () => Valor): Valor {
    const chave = chaveDe(entrada);
    const guardada = guardadas.get(entrada.row);
    if (guardada && mesmaChave(guardada.chave, chave)) return guardada.valor;
    const valor = montar();
    guardadas.set(entrada.row, { chave, valor });
    return valor;
  };
}
