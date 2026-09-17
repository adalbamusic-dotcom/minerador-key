import { radarSemanticStems } from "./semantic-concept-model.ts";
import { radarAmazonDedupeProducts, type RadarAmazonEditorialIntent, type RadarAmazonResearchTarget } from "./amazon-editorial-target.ts";
import type { RadarAmazonUniverseEntry } from "./amazon-search-model.ts";

/**
 * ===== AS TRÊS CAMADAS — AMAZON_EDITORIAL_TARGET_1.1 · §2, §3 e §7 =====
 *
 * ==================== O QUE A COLETA REAL MOSTROU ====================
 *
 * `TOP_VALUE` com `categoryQuery = "Serum Nivea"` devolveu 59 produtos, e o
 * ranking de custo-benefício rodou sobre os 59. Entre eles:
 *
 *     NIVEA Q10 Sérum Antissinais           ← o artigo queria isto
 *     Dove Sérum Hidratante Corporal 380ml  ← sérum de outra marca
 *     Garnier Uniform & Matte Sérum         ← sérum de outra marca
 *     NIVEA Creme para Mãos Reparação       ← Nivea, e não é sérum
 *     NIVEA Tônico Facial Controle Brilho   ← Nivea, e não é sérum
 *     NIVEA Hidratante Labial Amora Shine   ← nem de longe
 *
 * O `TOP_BEST` com `"Nivea"` foi pior: 56 produtos misturando hidratante
 * labial, sabonete íntimo, creme de mãos, sérum facial e loção corporal, e o
 * artigo prometia "os 4 melhores". Melhores para quê? Não existe decisão de
 * compra em que um sabonete íntimo concorra com um sérum antissinais.
 *
 * ==================== TRÊS COISAS, TRÊS NOMES ====================
 *
 *     RAW_UNIVERSE          tudo que a Amazon devolveu — evidência, intacta
 *          ↓  compatibilidade com o ALVO
 *     ELIGIBLE_CANDIDATES   o que pode ser comparado entre si
 *          ↓  critério do INTENT + desiredCount
 *     EDITORIAL_SHORTLIST   o que entra no artigo
 *
 * O defeito que isto fecha é a identidade `rawUniverse === comparableProducts`.
 * Os 59 continuam existindo e continuam visíveis (§3 e §28): o que eles deixam
 * de ser é "produtos comparáveis para o artigo".
 *
 * ==================== §8 · HEURÍSTICA DECLARADA, NUNCA FATO ====================
 *
 * O provider não entrega marca nem categoria estruturadas. A compatibilidade é
 * TEXTUAL, sobre o título observado, determinística e marcada como tal. Ela
 * decide o que o Radar compara; ela nunca vira uma afirmação sobre o produto.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

export type RadarAmazonEligibility = {
  /** §3 · o universo bruto continua contado, e nada nele é perdido. */
  rawCount: number;
  eligible: RadarAmazonUniverseEntry[];
  /** Cada exclusão com o motivo em português — §28. */
  excluded: Array<{ asin: string; title: string; reason: string }>;
  /** Como a compatibilidade foi decidida, para a tela poder dizer. */
  method: "TARGET_PRODUCTS" | "CLASS_AND_BRAND" | "NO_FILTER";
  /** §8 · o aviso que viaja com o número. */
  notes: string[];
};

const normalizar = (valor: string) =>
  (valor || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * AS RAÍZES QUE PRECISAM APARECER NO TÍTULO.
 *
 * `radarSemanticStems` é o mesmo reduto conservador usado no resto do Radar —
 * "sérum", "serum" e "séruns" conversam, e "sebo" e "sebáceas" continuam sendo
 * coisas diferentes. Reimplementar aqui criaria uma segunda noção de raiz.
 */
const raizesDe = (valor: string | null | undefined) =>
  radarSemanticStems(valor || "").filter(raiz => raiz.length >= 3);

/**
 * §7 · O TÍTULO CONTÉM TODAS AS RAÍZES DO TERMO?
 *
 * TODAS, e não alguma. Com "alguma", `productClass = "sérum facial"` aceitaria
 * qualquer coisa "facial" — creme, tônico, protetor — e a lista voltaria a ser
 * a vizinhança da busca. Com todas, o que a pessoa digita é o que ela compara:
 * "sérum" compara séruns, "sérum facial" compara os que se declaram faciais.
 *
 * É uma regra previsível, e previsível é o que permite corrigir sozinho quando
 * o resultado não é o esperado.
 */
function contemTodasAsRaizes(titulo: string, termo: string | null | undefined): boolean {
  const raizes = raizesDe(termo);
  if (!raizes.length) return false;
  const corpo = normalizar(titulo);
  return raizes.every(raiz => corpo.includes(raiz));
}

/**
 * ===== §7 a §15 · OS CANDIDATOS COMPATÍVEIS COM O ALVO =====
 *
 * §9 · A ELEGIBILIDADE É POR PRODUTO (ASIN), NUNCA POR PLACEMENT.
 *
 * O mesmo ASIN pode aparecer como orgânico numa consulta e patrocinado noutra —
 * e continua sendo um produto. Descartar o patrocinado aqui jogaria fora um
 * produto real por causa de onde ele apareceu; quem pondera placement é o
 * RANKING, que é outra pergunta e outro módulo.
 */
export function radarAmazonEligibleCandidates(input: {
  intent: RadarAmazonEditorialIntent;
  target: RadarAmazonResearchTarget;
  universe: readonly RadarAmazonUniverseEntry[];
}): RadarAmazonEligibility {
  const universo = [...input.universe];
  const rawCount = universo.length;
  const notes: string[] = [];

  /*
   * ===== §13, §14 e §15 · QUANDO A PESSOA JÁ DISSE QUAIS SÃO =====
   *
   * Review, X vs Y e comparação têm os produtos escolhidos à mão. O resto da
   * SERP é CONTEXTO COMPETITIVO — ele explica o mercado em volta e não entra
   * como "produto do artigo". Acrescentar um terceiro produto a um comparativo
   * de dois seria o Radar reescrevendo a pauta.
   */
  const escolhidos = radarAmazonDedupeProducts(input.target.products)
    .map(item => item.resolvedAsin)
    .filter((valor): valor is string => Boolean(valor));

  if (escolhidos.length) {
    const pedidos = new Set(escolhidos);
    const eligible = universo.filter(produto => pedidos.has(produto.asin));
    const excluded = universo
      .filter(produto => !pedidos.has(produto.asin))
      .map(produto => ({
        asin: produto.asin,
        title: produto.title,
        reason: "Não é um dos produtos escolhidos para este artigo; permanece como contexto competitivo.",
      }));

    /*
     * UM PRODUTO ESCOLHIDO QUE A BUSCA NÃO DEVOLVEU não é ignorado.
     *
     * Ele foi resolvido por ASIN e continua sendo o objeto do artigo; o que
     * falta é a leitura de prateleira dele. Dizer isso é melhor do que entregar
     * um comparativo silenciosamente menor.
     */
    const ausentes = escolhidos.filter(asin => !universo.some(produto => produto.asin === asin));
    if (ausentes.length) {
      notes.push(`${ausentes.length} produto(s) escolhido(s) não apareceram nesta coleta da prateleira e ficaram sem leitura comercial.`);
    }

    return { rawCount, eligible, excluded, method: "TARGET_PRODUCTS", notes };
  }

  /*
   * ===== §4, §5 e §7 · DESCOBERTA: A CLASSE MANDA, A MARCA FILTRA =====
   */
  const classe = input.target.productClass;
  const marca = input.target.brandFilter;

  if (!classe && !marca) {
    /*
     * SEM CLASSE E SEM MARCA, TUDO É "ELEGÍVEL" — e isso é a verdade sobre a
     * configuração, não uma decisão editorial.
     *
     * A validação (§5) impede que um TOP chegue aqui assim. Um guia de compra
     * pode: ele mapeia critérios de uma categoria ampla, e não ranqueia.
     */
    notes.push("Nenhum tipo de produto foi declarado: todo o universo observado está sendo tratado como comparável.");
    return { rawCount, eligible: universo, excluded: [], method: "NO_FILTER", notes };
  }

  const eligible: RadarAmazonUniverseEntry[] = [];
  const excluded: RadarAmazonEligibility["excluded"] = [];

  for (const produto of universo) {
    const classeBate = classe ? contemTodasAsRaizes(produto.title, classe) : true;
    const marcaBate = marca ? contemTodasAsRaizes(produto.title, marca) : true;

    if (classeBate && marcaBate) { eligible.push(produto); continue; }

    excluded.push({
      asin: produto.asin,
      title: produto.title,
      reason: !classeBate && !marcaBate
        ? `O título não menciona "${classe}" nem "${marca}".`
        : !classeBate
          ? `O título não menciona "${classe}": é outro tipo de produto.`
          : `O título não menciona "${marca}": é de outra marca.`,
    });
  }

  /*
   * §8 · O AVISO VIAJA COM O NÚMERO, e não num rodapé.
   *
   * Quem lê "11 compatíveis" precisa saber que os 11 vieram de leitura de
   * TÍTULO. Um produto cujo título não diz a marca fica de fora mesmo sendo
   * daquela marca — e isso é uma limitação do que a coleta observa, não uma
   * afirmação sobre o produto.
   */
  notes.push(
    marca
      ? `Compatibilidade decidida por correspondência de texto no título observado (${[classe, marca].filter(Boolean).map(item => `"${item}"`).join(" e ")}). A loja não entrega marca nem categoria estruturadas.`
      : `Compatibilidade decidida por correspondência de texto no título observado ("${classe}"). A loja não entrega categoria estruturada.`,
  );

  return { rawCount, eligible, excluded, method: "CLASS_AND_BRAND", notes };
}
