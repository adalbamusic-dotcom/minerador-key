/**
 * ===== AS OPERAÇÕES DE CENA, E A IDENTIDADE QUE ELAS PRESERVAM =====
 *
 * Puro: sem I/O, sem React, sem `server-only`. Toda operação recebe a lista e
 * devolve outra, sem mutar a entrada.
 *
 * ==================== POR QUE ISTO É UM MÓDULO PRÓPRIO ====================
 *
 * `sceneId` não é detalhe de implementação: é a âncora da mídia.
 *
 *   anchor_kind = script_scene
 *   anchor_ref  = sceneId
 *
 * Se reordenar uma cena trocasse o id, a imagem dela ficaria ancorada numa
 * posição que não existe mais — e o índice único da M3 passaria a proteger um
 * fantasma. Por isso `order` e `id` são coisas separadas: a ordem é recalculada
 * a cada operação, o id **nunca** é reatribuído.
 *
 * Deixar isso dentro do componente significaria provar a estabilidade clicando.
 * Aqui ela é exercitável por teste.
 */

/** O mínimo que as operações precisam ver. O resto da cena passa intacto. */
export type CenaBase = { id: string; order: number };

/** Recalcula `order` pela posição no array. Nunca toca em `id`. */
function renumerar<T extends CenaBase>(cenas: readonly T[]): T[] {
  return cenas.map((cena, indice) => (cena.order === indice ? cena : { ...cena, order: indice }));
}

/**
 * Gera id. Recebe o gerador de propósito: o teste injeta um determinístico, e o
 * navegador passa `crypto.randomUUID`. Sortear aqui dentro faria o teste
 * depender de aleatoriedade para provar unicidade.
 */
export type GeradorDeId = () => string;

export function novaCena(id: string, order: number) {
  return {
    id, order, title: "", durationSeconds: 0,
    narration: "", onScreenText: "", visualDirection: "", technicalDirection: "",
    storyboard: null, sourceRefs: [] as never[],
  };
}

export function adicionarCena<T extends CenaBase>(cenas: readonly T[], nova: T): T[] {
  return renumerar([...cenas, nova]);
}

/** Edita uma cena por id. As outras saem idênticas, inclusive na referência. */
export function editarCena<T extends CenaBase>(cenas: readonly T[], id: string, patch: Partial<T>): T[] {
  return cenas.map(cena => (cena.id === id ? { ...cena, ...patch, id: cena.id } : cena));
}

/**
 * Remove por id e renumera.
 *
 * As demais MANTÊM os ids — só `order` se ajusta. É o que garante que apagar a
 * cena 2 não faça a mídia da cena 3 apontar para o lugar errado.
 */
export function removerCena<T extends CenaBase>(cenas: readonly T[], id: string): T[] {
  return renumerar(cenas.filter(cena => cena.id !== id));
}

/**
 * Duplica logo abaixo da original, com id NOVO.
 *
 * Id novo é obrigatório: duas cenas com o mesmo id disputariam a mesma âncora,
 * e o índice único da M3 recusaria a segunda imagem sem explicar por quê.
 *
 * A cópia não leva o `storyboard` da original: o briefing visual descreve uma
 * imagem que já ocupa a âncora da cena original, e copiá-lo sugeriria que a
 * cópia já tem imagem — que ela não tem.
 */
export function duplicarCena<T extends CenaBase & { storyboard?: unknown }>(
  cenas: readonly T[], id: string, novoId: GeradorDeId,
): T[] {
  const indice = cenas.findIndex(cena => cena.id === id);
  if (indice < 0) return [...cenas];
  const copia = { ...cenas[indice], id: novoId(), storyboard: null } as T;
  return renumerar([...cenas.slice(0, indice + 1), copia, ...cenas.slice(indice + 1)]);
}

/**
 * Move uma posição para cima ou para baixo.
 *
 * Troca a POSIÇÃO no array e renumera `order`. Nenhum id muda — e é essa a
 * razão de a função existir em vez de o componente reordenar à mão.
 */
export function moverCena<T extends CenaBase>(cenas: readonly T[], id: string, deslocamento: number): T[] {
  const indice = cenas.findIndex(cena => cena.id === id);
  const destino = indice + deslocamento;
  if (indice < 0 || destino < 0 || destino >= cenas.length) return [...cenas];
  const copia = [...cenas];
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return renumerar(copia);
}

/** A ordem de leitura: `order` manda, não a posição no array. */
export function cenasEmOrdem<T extends CenaBase>(cenas: readonly T[]): T[] {
  return [...cenas].sort((a, b) => a.order - b.order);
}

/**
 * Os ids, na ordem. Existe para o teste comparar antes e depois de uma
 * operação sem depender do conteúdo das cenas.
 */
export function idsEmOrdem<T extends CenaBase>(cenas: readonly T[]): string[] {
  return cenasEmOrdem(cenas).map(cena => cena.id);
}
