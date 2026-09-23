import { VersionedRadarAnalysisSchema, type RadarAnalysisVersion } from "./analysis-contracts.ts";

/**
 * ===== A LEITURA DO ARTIGO NO EXPORT: só a versão usada é reidratada =====
 *
 * ==================== O CUSTO QUE ISTO CORTA (E4 da SDD de egress) ====================
 *
 * A rota do export lia cada artigo com `findByArticle`, que traz a linha e as
 * corridas de TODAS as versões de análise, para usar uma só: a corrente.
 * Medido em 2026-09-23 no item mais pesado da Care Glow: 0,90 MB de linha mais
 * 7,32 MB de corridas, das quais só 1,60 MB eram da corrente.
 *
 * `findByArticleHydratingVersions` lê a mesma linha e só a corrida escolhida.
 * O `pick` abaixo escolhe a MESMA versão que a rota escolhia.
 *
 * ==================== A REGRA ANTIGA, E POR QUE ELA SE MANTÉM ====================
 *
 * A rota fazia assim: validava TODAS as versões reidratadas no contrato, ficava
 * com as válidas e pegava a de maior `versionNumber`, a primeira do array no
 * empate (o sort é estável). Aqui:
 *
 *   1. `versionId` e `versionNumber` ficam na parte leve (a corrida só leva
 *      extractions, competitiveReport, youtubeSearch e amazonSearch). Uma
 *      versão sem id em texto, ou sem número inteiro positivo, NUNCA passa no
 *      contrato, reidratada ou não. Ela sai da escolha sem ler corrida nenhuma.
 *   2. Entre as outras, fica a de maior número, a primeira do array no empate.
 *      Nenhuma válida pode ter número maior que ela, nem vir antes dela com o
 *      mesmo número.
 *   3. Se ela, reidratada, passa no contrato, é exatamente a que a rota
 *      pegava. Se não passa, a rota pegava a PRÓXIMA válida, cuja corrida não
 *      foi lida. Aí a leitura volta ao caminho antigo, inteiro (`reread`), e a
 *      resposta continua sendo a mesma. É o caso raro e custa o que custava
 *      antes, mais a linha.
 *
 * Domínio puro: sem banco, sem fetch, sem relógio.
 */

type Registro = Record<string, unknown>;

const registro = (valor: unknown): Registro | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Registro : null;

/** O índice da versão que o export usa, ou -1 quando nenhuma pode passar no contrato. */
export function radarPortableExportCurrentVersionIndex(versoes: ReadonlyArray<unknown>): number {
  let escolhida = -1;
  let maior = 0;
  versoes.forEach((versao, indice) => {
    const lida = registro(versao);
    if (!lida) return;
    const { versionId, versionNumber } = lida;
    if (typeof versionId !== "string" || versionId.length === 0) return;
    if (typeof versionNumber !== "number" || !Number.isInteger(versionNumber) || versionNumber <= 0) return;
    if (escolhida === -1 || versionNumber > maior) {
      escolhida = indice;
      maior = versionNumber;
    }
  });
  return escolhida;
}

/** O `pick` de `findByArticleHydratingVersions`: no máximo um id, o da versão usada. */
export function radarPortableExportCurrentVersionPick(versoes: ReadonlyArray<Registro>): string[] {
  const indice = radarPortableExportCurrentVersionIndex(versoes);
  const id = indice >= 0 ? registro(versoes[indice])?.versionId : null;
  return typeof id === "string" ? [id] : [];
}

export type RadarPortableExportCurrentReading =
  /** A versão usada, reidratada e validada. */
  | { kind: "current"; analysis: RadarAnalysisVersion }
  /** Linha ausente, de outra marca ou de outro artigo, ou sem versão que possa passar no contrato. */
  | { kind: "none" }
  /** A versão escolhida não passou no contrato: só a leitura antiga, inteira, sabe qual é a próxima. */
  | { kind: "reread" };

/**
 * A análise corrente a partir da linha lida com `radarPortableExportCurrentVersionPick`.
 *
 * As guardas de linha são as da leitura antiga (`radarStartPorts.loadRadarState`):
 * a linha precisa ser da marca e do artigo pedidos, e `analysisVersions` fora
 * de forma vale como lista vazia.
 */
export function radarPortableExportCurrentAnalysisOfRow(input: {
  row: unknown;
  brandId: string;
  articleId: string;
}): RadarPortableExportCurrentReading {
  const linha = registro(input.row);
  if (!linha || linha.marca_id !== input.brandId || linha.article_id !== input.articleId) return { kind: "none" };
  const bruto = registro(linha.payload)?.analysisVersions;
  const versoes = Array.isArray(bruto) ? bruto : [];
  const indice = radarPortableExportCurrentVersionIndex(versoes);
  if (indice < 0) return { kind: "none" };
  const lida = VersionedRadarAnalysisSchema.safeParse(versoes[indice]);
  return lida.success ? { kind: "current", analysis: lida.data } : { kind: "reread" };
}

/**
 * A regra antiga, inteira: a de maior número entre as válidas, a primeira do
 * array no empate. É ela que responde quando a leitura estreita pede `reread`.
 */
export function radarPortableExportLatestAnalysis(
  analyses: ReadonlyArray<RadarAnalysisVersion> | null | undefined,
): RadarAnalysisVersion | null {
  return analyses?.slice().sort((esquerda, direita) => direita.versionNumber - esquerda.versionNumber)[0] || null;
}
