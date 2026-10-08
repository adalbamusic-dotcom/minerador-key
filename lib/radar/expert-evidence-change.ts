/**
 * ====== 2026-10-08 · O AVISO DO ESPECIALISTA SÓ VIRA ESTADO QUANDO ALGO MUDOU ======
 *
 * O DONO VIU: "o selector e o scroll estão muito lentos, parece um computador
 * dos anos 80". Com a área Especialista aberta num artigo ainda não
 * finalizado, a tela entrava num laço de render que não parava — medido na
 * bancada do scratchpad: 6 s parado com a área aberta, 98% da thread ocupada.
 *
 * O LAÇO:
 *
 *   RadarPage renderiza → a lista de pontos de revisão chega ao painel como
 *   array NOVO (mesmo conteúdo) → o efeito do painel avisa
 *   `onExpertEvidenceChange` → o Radar grava os três mapas com objetos novos,
 *   mesmo conteúdo → RadarPage renderiza de novo → …
 *
 * A REGRA QUE FECHA O LAÇO: aviso com o MESMO conteúdo devolve o MESMO estado
 * (a mesma referência), e o React descarta o render. Aviso com qualquer
 * diferença real continua virando estado novo, exatamente como antes.
 *
 * "Mesmo conteúdo" é igualdade de DADO PURO — texto, número, booleano, null,
 * lista e objeto simples —, campo a campo, com o mesmo conjunto de chaves. Não
 * há tolerância nem "parecido": ordem diferente numa lista, chave a mais ou a
 * menos, `undefined` contra ausente, tudo isso conta como mudança. Objeto que
 * não é dado puro (Date, Map, instância de classe) só é igual a si mesmo. A
 * comparação pode errar para o lado de gravar de novo — nunca para o lado de
 * esconder uma mudança.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

const temPropria = (objeto: object, chave: string) => Object.prototype.hasOwnProperty.call(objeto, chave);

function dadoSimples(valor: object): boolean {
  const prototipo = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
}

/** Igualdade por conteúdo de dado puro. Na dúvida, diferente. */
export function radarSameData(esquerda: unknown, direita: unknown): boolean {
  if (Object.is(esquerda, direita)) return true;
  if (typeof esquerda !== "object" || typeof direita !== "object" || esquerda === null || direita === null) return false;
  if (Array.isArray(esquerda) || Array.isArray(direita)) {
    if (!Array.isArray(esquerda) || !Array.isArray(direita) || esquerda.length !== direita.length) return false;
    for (let indice = 0; indice < esquerda.length; indice += 1) {
      if (!radarSameData(esquerda[indice], direita[indice])) return false;
    }
    return true;
  }
  if (!dadoSimples(esquerda) || !dadoSimples(direita)) return false;
  const chavesDaEsquerda = Object.keys(esquerda);
  if (chavesDaEsquerda.length !== Object.keys(direita).length) return false;
  for (const chave of chavesDaEsquerda) {
    if (!temPropria(direita, chave)) return false;
    if (!radarSameData((esquerda as Record<string, unknown>)[chave], (direita as Record<string, unknown>)[chave])) return false;
  }
  return true;
}

/**
 * O redutor dos mapas por artigo do Radar.
 *
 * Conteúdo igual ao que já está gravado para o artigo → devolve `current`
 * (mesma referência: o React não renderiza). Conteúdo novo → mapa novo com o
 * artigo trocado, como o `{ ...current, [articleId]: next }` de sempre.
 */
export function radarArticleDataUpdate<Valor>(current: Record<string, Valor>, articleId: string, next: Valor): Record<string, Valor> {
  if (temPropria(current, articleId) && radarSameData(current[articleId], next)) return current;
  return { ...current, [articleId]: next };
}

/** O que o painel do Especialista avisa a quem o hospeda. */
export type RadarExpertEvidenceNotice = {
  articleId: string;
  evidence: unknown;
  summary: unknown;
};

/**
 * O aviso trouxe algo novo em relação ao último?
 *
 * Sem aviso anterior, sim — o primeiro aviso sempre conta. Depois, só quando o
 * conteúdo difere em qualquer campo.
 */
export function radarExpertEvidenceChanged(previous: RadarExpertEvidenceNotice | null | undefined, next: RadarExpertEvidenceNotice): boolean {
  if (!previous) return true;
  return !radarSameData(previous, next);
}
