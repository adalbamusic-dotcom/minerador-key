/**
 * 2026-10-11 · A REGRA DA ÂNCORA NATURAL, em texto — a MESMA frase no pedido do
 * artigo-modelo, no CSV "Para escrever", no Redator e no MCP. Módulo sem
 * dependência: a regra entra em constantes de topo de outros módulos (as regras
 * gerais do CSV) sem fechar ciclo de carga com a régua (`natural-anchor.ts`).
 *
 * 2026-10-11c · KEYWORDS PROIBIDAS POR DESTINO (regra do dono: "não pode repetir
 * as keywords de jeito nenhum… vai virar uma salada de keywords em todos os
 * artigos"). A âncora não é nenhuma keyword do destino (principal,
 * complementares e reforços do ArticleDNA dele; da SiloPage, o nome do Silo) nem
 * frase que contenha inteira uma delas; a ideia do destino vai nas palavras da
 * própria frase. Sem formulação válida, o entregável não inventa âncora: diz a
 * instrução (`radarFreeAnchorInstruction`).
 */

/** A regra dita a quem escreve (CSV, Redator e MCP). */
export const RADAR_NATURAL_ANCHOR_RULE =
  "A âncora de cada link interno diz, com as palavras da própria frase, a ideia do destino (em geral 2 a 4 palavras): nunca é uma keyword do destino (a principal, as complementares e os reforços dele; da página do Silo, o nome do Silo) nem frase que contenha inteira uma delas, para o Silo não virar uma repetição de keywords; um trecho curto de uma keyword que caiba na narração é permitido; e varia: a mesma âncora não se repete para o mesmo destino em outra seção nem em outro artigo do mesmo Silo.";

/** A mesma regra, no pedido do artigo-modelo (a IA recebe, em cada candidato K, as keywords do destino e os conceitos de âncora do grafo aprovado). */
export const RADAR_NATURAL_ANCHOR_PROMPT_RULE =
  "A ÂNCORA diz a ideia do destino com as palavras da frase da seção (em geral 2 a 4 palavras), como quem escreve naturalmente: nunca escreva como âncora uma keyword do destino (as dadas em 'keywords do destino, nunca âncora' no candidato K) nem frase que contenha inteira uma delas; prefira a ideia dita na frase a um recorte da keyword; os conceitos de âncora do grafo são referência de sentido (o conceito que é keyword do destino também não serve); não repita a mesma âncora para o mesmo destino em outra seção.";

/**
 * A instrução que ocupa o lugar da âncora quando a régua não acha formulação
 * válida (todo conceito e recorte é keyword do destino ou a contém): a planta
 * nova a grava no campo da âncora, e os entregáveis a dizem como instrução.
 */
export const RADAR_FREE_ANCHOR_INSTRUCTION = "escreva com as palavras da sua frase a ideia do destino, em 2 a 4 palavras";

/** A instrução com a ideia do destino entre parênteses (o "por quê" do link ou o assunto do destino). */
export function radarFreeAnchorInstruction(ideia?: string | null): string {
  const limpa = typeof ideia === "string" ? ideia.replace(/\s+/g, " ").trim().replace(/[.;:,\s]+$/, "") : "";
  return limpa ? `escreva com as palavras da sua frase a ideia do destino (${limpa}), em 2 a 4 palavras` : RADAR_FREE_ANCHOR_INSTRUCTION;
}

const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** A âncora gravada é a instrução (não um texto de âncora). */
export function radarAnchorIsFree(anchor: string | null | undefined): boolean {
  return typeof anchor === "string" && semAcento(anchor).startsWith("escreva com as palavras da");
}

/**
 * 2026-10-11c · Para o Redator e o MCP (os campos que eles recebem): cada link
 * da planta traz em `avoidAsAnchor` as keywords do destino que não podem ser
 * âncora; a âncora gravada é exemplo, e a que diz "escreva com as palavras da
 * sua frase…" é instrução.
 */
export const RADAR_NATURAL_ANCHOR_WRITER_NOTE =
  "Em cada link interno da planta, avoidAsAnchor lista as keywords do destino que nunca são âncora; a âncora da planta é exemplo, e quando ela diz \"escreva com as palavras da sua frase a ideia do destino\", escreva a ideia do destino com as palavras da frase.";
