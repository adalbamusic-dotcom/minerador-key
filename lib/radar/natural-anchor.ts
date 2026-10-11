/**
 * ===== 2026-10-11 · A ÂNCORA NATURAL DO LINK INTERNO — uma régua só para todo entregável =====
 *
 * Caso real (CSV "Para escrever" de "como atrair um cliente", 2026-10-11): cada
 * link levava como âncora a keyword principal INTEIRA do destino ("tráfego pago
 * vs orgânico para clínica de estética", "campanhas de marketing para clínica
 * de estética sem anúncios"), repetida em todos os artigos do Silo — salada de
 * keywords e sinal de canibalização. O dono: "não é para utilizar as keywords
 * inteiras como texto âncora, era só para utilizar alguns trechos deles que
 * fazem sentido na narração do texto nesse trecho em específico, e tudo tem que
 * ser natural".
 *
 * A regra, uma só (pedido do artigo-modelo, conferência da planta nova, leitura
 * da planta gravada, CSV "Para escrever", CSV de vídeo, Redator e MCP):
 *   - a âncora é um trecho natural da IDEIA do destino, que cabe na frase;
 *   - nunca é a keyword principal inteira do destino (nem a contém inteira com
 *     4 palavras ou mais), comparada sem acento, caixa e plural;
 *   - varia: a mesma âncora não se repete para o mesmo destino em outra seção
 *     nem em outro artigo do mesmo Silo.
 *
 * A troca é determinística: primeiro o conceito de âncora do grafo aprovado
 * para aquele destino (o "universo permitido de formulação" do Arquiteto,
 * `anchorConcepts`), recortado quando ele próprio traz a keyword inteira; senão,
 * um recorte do rótulo do destino (sem o interrogativo do começo e sem o trecho
 * "para <público>"). O grafo e os DNAs são só lidos: o Arquiteto não se adapta
 * ao Radar.
 *
 * Domínio puro: sem banco, sem rede, sem IA.
 */

/*
 * A régua usa `radarWritingCompareKey` só dentro das funções (na chamada): o
 * ciclo de carga com o export fica sem efeito. As frases da regra moram num
 * módulo sem dependência (`natural-anchor-rule.ts`), porque entram em
 * constantes de topo de outros módulos.
 */
import { radarWritingCompareKey } from "./portable-writing-export.ts";

export { RADAR_NATURAL_ANCHOR_PROMPT_RULE, RADAR_NATURAL_ANCHOR_RULE } from "./natural-anchor-rule.ts";

/** Quem leu quais âncoras para cada destino: a variedade no lote do Silo (a chave do destino → as âncoras usadas). */
export type RadarAnchorLedger = Map<string, Set<string>>;

/** "keyword": era a keyword inteira do destino; "repeated": repetia a âncora já usada para ele; "taken": já levava a outro destino. */
export type RadarNaturalAnchorReason = "keyword" | "repeated" | "taken";

export type RadarNaturalAnchorResult = {
  anchor: string;
  /** A âncora mudou (era a keyword inteira do destino ou repetia uma âncora já usada para ele). */
  changed: boolean;
  reason: RadarNaturalAnchorReason | null;
  /** Os conceitos do grafo, na forma natural, que não são a âncora escolhida (as "outras formulações"). */
  alternatives: string[];
};

const t = (valor: unknown): string => (typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "");

/* O plural não distingue: "promoções" e "promoção", "leads" e "lead", "clientes" e "cliente". */
function singular(palavra: string): string {
  if (palavra.length <= 3) return palavra;
  if (/(?:oes|aes)$/.test(palavra)) return `${palavra.slice(0, -3)}ao`;
  if (/ns$/.test(palavra)) return `${palavra.slice(0, -2)}m`;
  if (/[rz]es$/.test(palavra)) return palavra.slice(0, -2);
  if (/[aeou]is$/.test(palavra) && palavra.length > 4) return `${palavra.slice(0, -2)}l`;
  if (/s$/.test(palavra) && !/ss$/.test(palavra)) return palavra.slice(0, -1);
  return palavra;
}

/** A chave de comparação da âncora: `radarWritingCompareKey`, palavra a palavra no singular. */
export function radarAnchorKey(valor: string | null | undefined): string {
  return radarWritingCompareKey(valor).split(" ").filter(Boolean).map(singular).join(" ");
}

const palavrasDe = (valor: string): string[] => radarWritingCompareKey(valor).split(" ").filter(Boolean);

/** A âncora É a keyword inteira do destino, ou a contém inteira com 4 palavras ou mais. */
export function radarAnchorRepeatsKeyword(anchor: string, keywords: readonly (string | null | undefined)[]): boolean {
  const chave = radarAnchorKey(anchor);
  if (!chave) return false;
  const longa = palavrasDe(anchor).length >= 4;
  return keywords.some(keyword => {
    const alvo = radarAnchorKey(keyword);
    if (!alvo) return false;
    return chave === alvo || (longa && ` ${chave} `.includes(` ${alvo} `));
  });
}

/* Palavras que não abrem nem fecham uma âncora natural. */
const LIGACAO = new Set(["de", "do", "da", "dos", "das", "para", "pra", "com", "em", "no", "na", "nos", "nas", "e", "o", "a", "os", "as", "um", "uma", "uns", "umas", "ao", "aos", "por", "pelo", "pela", "vs", "versus", "x"]);
const ligacao = (palavra: string) => LIGACAO.has(radarWritingCompareKey(palavra));

const INTERROGATIVO = /^(?:como|o\s+que|oque|por\s*que|porque|qual|quais|quando|onde|quanto|quantos|quantas)\s+(?:(?:é|e|são|sao)\s+)?/i;
/* O trecho "para <público ou contexto>": até "sem", "vs", "versus", "x", "com" ou o fim. */
const PARA_O_PUBLICO = /\s+para\s+.+?(?=\s+(?:sem|vs\.?|versus|x|com)\s|$)/i;

/*
 * O rótulo em Título ("Leads sem Tráfego Pago", o nome do Silo) vira texto de
 * frase; sigla e nome próprio solto ("Instagram não traz pacientes") ficam.
 */
function comoFrase(valor: string): string {
  const palavras = valor.split(" ");
  const longas = palavras.filter(palavra => palavra.length > 3);
  const maiusculas = longas.filter(palavra => /^\p{Lu}\p{Ll}/u.test(palavra));
  if (maiusculas.length < 2 || maiusculas.length * 5 < longas.length * 3) return valor;
  return palavras.map(palavra => (/^\p{Lu}{2,}$/u.test(palavra) ? palavra : palavra.toLocaleLowerCase("pt-BR"))).join(" ");
}

const semAspas = (valor: string) => t(valor).replace(/^SiloPage\s+/i, "").replace(/^["“”']+|["“”']+$/g, "").trim();

const aparar = (palavras: string[]): string[] => {
  const saida = [...palavras];
  while (saida.length && ligacao(saida[0])) saida.shift();
  while (saida.length && ligacao(saida[saida.length - 1])) saida.pop();
  return saida;
};

/** O primeiro recorte: sem o interrogativo do começo e sem o trecho "para <público>". */
export function radarAnchorTrim(valor: string): string {
  const base = comoFrase(semAspas(valor));
  const semPergunta = base.replace(INTERROGATIVO, "").trim() || base;
  const semPara = semPergunta.replace(PARA_O_PUBLICO, "").trim();
  return semPara || semPergunta;
}

/**
 * OS RECORTES DO RÓTULO DO DESTINO, na ordem de preferência. Nenhum é o rótulo
 * inteiro: o primeiro tira o interrogativo e o "para <público>"; depois, o
 * trecho antes de "sem" (com 2 palavras ou mais) e o "sem …"; sem "sem", o
 * sujeito antes do "não", a
 * pergunta com o verbo dela ("como captar") e, por fim, a palavra que dá nome
 * ao assunto.
 */
export function radarAnchorCuts(rotulo: string): string[] {
  const base = comoFrase(semAspas(rotulo));
  const chaveDoRotulo = radarAnchorKey(base);
  const saida: string[] = [];
  const adicionar = (valor: string | null | undefined) => {
    const limpo = t(valor);
    const chave = radarAnchorKey(limpo);
    if (!chave || chave === chaveDoRotulo || saida.some(item => radarAnchorKey(item) === chave)) return;
    saida.push(limpo);
  };
  const aparado = radarAnchorTrim(base);
  adicionar(aparado);
  const palavras = aparado.split(" ").filter(Boolean);
  const sem = aparado.match(/^(.+?)\s+(sem\s+.+)$/i);
  if (sem) {
    /*
     * "<algo> sem <condição>": o trecho antes do "sem" (quando tem 2 palavras ou
     * mais) e o "sem …" — a ideia do destino está na condição. Cortar no meio
     * ("leads sem tráfego") ou ficar só com a palavra solta ("leads") perde a
     * ideia: não entram.
     */
    const antes = aparar(sem[1].split(" "));
    if (antes.length >= 2) adicionar(antes.join(" "));
    adicionar(sem[2]);
  } else {
    /*
     * 2026-10-11 (correção) · "<sujeito> não <predicado>": o sujeito é a ideia do
     * destino ("Instagram não traz pacientes" → "Instagram", que cabe em "o
     * Instagram sozinho…"). Cortar a primeira ou a última palavra do rótulo saiu:
     * quebrava termo composto ("rotina de skin care" → "rotina de skin") e
     * tirava o sujeito ("não traz pacientes").
     */
    const nao = palavras.findIndex(palavra => radarWritingCompareKey(palavra) === "nao");
    if (nao > 0) {
      const sujeito = aparar(palavras.slice(0, nao));
      if (sujeito.length && sujeito.join(" ").length >= 4) adicionar(sujeito.join(" "));
    } else if (palavras.length >= 3 && !palavras.some(palavra => ligacao(palavra))) {
      /* Sem preposição, o rótulo é um nome composto com um qualificador no fim ("skin care nivea" → "skin care"); com preposição, o núcleo abaixo decide. */
      const semUltima = aparar(palavras.slice(0, -1));
      if (semUltima.length >= 2) adicionar(semUltima.join(" "));
      /* O qualificador sozinho ("noturno") é a saída quando o nome composto já leva a outro destino desta planta. */
      const ultima = palavras[palavras.length - 1];
      if (ultima.length >= 5) adicionar(ultima);
    }
  }
  /* A pergunta com o verbo dela ("como captar"), quando o rótulo é "como captar um cliente": cabe em "veja como captar um contato". */
  if (/^como\s/i.test(base) && palavras.length >= 2 && !ligacao(palavras[0])) adicionar(`como ${palavras[0]}`);
  if (!sem) {
    const nucleo = aparar(aparado.split(/\s+(?:de|do|da|dos|das|para|com|em|no|na|nos|nas)\s+/i)[0].split(" "));
    if (nucleo.length) adicionar(nucleo.join(" "));
    if (palavras.length === 2) adicionar(palavras[0]);
  }
  return saida;
}

/** Os conceitos de âncora do grafo na forma natural (recortados quando trazem a keyword inteira), sem a keyword inteira do destino. */
export function radarNaturalAnchorFormulations(input: { targetKeywords: readonly (string | null | undefined)[]; graphConcepts?: readonly (string | null | undefined)[] | null }): string[] {
  const saida: string[] = [];
  for (const conceito of input.graphConcepts || []) {
    const bruto = comoFrase(semAspas(t(conceito)));
    if (!bruto) continue;
    const natural = !radarAnchorRepeatsKeyword(bruto, input.targetKeywords) ? bruto : radarAnchorTrim(bruto);
    if (!natural || radarAnchorRepeatsKeyword(natural, input.targetKeywords)) continue;
    if (saida.some(item => radarAnchorKey(item) === radarAnchorKey(natural))) continue;
    saida.push(natural);
  }
  /* O mais curto com 2 palavras ou mais vem primeiro; uma palavra só, por último. */
  return saida
    .map((item, indice) => ({ item, indice, palavras: palavrasDe(item).length }))
    .sort((a, b) => Number(a.palavras < 2) - Number(b.palavras < 2) || a.palavras - b.palavras || a.indice - b.indice)
    .map(({ item }) => item);
}

/**
 * A RÉGUA. `anchor` é a âncora que a planta traz; `targetLabel`, o nome do
 * destino (a principal do membro ou o nome do Silo); `targetKeywords`, as
 * keywords do destino que a âncora não pode repetir inteiras (o rótulo entra
 * sempre); `graphConcepts`, os conceitos de âncora do grafo aprovado para esse
 * destino; `usedAnchors`, as âncoras já usadas para o mesmo destino (nesta
 * planta e no lote do Silo); `takenAnchors`, as que já levam a OUTRO destino
 * nesta planta (a mesma âncora para dois endereços confunde leitor e busca).
 *
 * A âncora natural e inédita volta como veio. A que é a keyword inteira (ou a
 * repete), a já usada para o destino e a que já leva a outro destino viram o
 * primeiro conceito do grafo, recorte da própria âncora ou recorte do rótulo
 * que passa na régua e está livre; sem livre, a keyword inteira vira o primeiro recorte que passa na
 * régua (repetir é melhor que a keyword inteira) e a âncora natural fica.
 */
export function radarNaturalAnchor(input: {
  anchor: string;
  targetLabel: string;
  targetKeywords?: readonly (string | null | undefined)[] | null;
  graphConcepts?: readonly (string | null | undefined)[] | null;
  usedAnchors?: Iterable<string> | null;
  takenAnchors?: Iterable<string> | null;
}): RadarNaturalAnchorResult {
  const original = t(input.anchor);
  const rotulo = semAspas(input.targetLabel);
  const keywords = [rotulo, ...(input.targetKeywords || [])].filter((item): item is string => Boolean(t(item)));
  const usadas = new Set([...(input.usedAnchors || [])].map(radarAnchorKey).filter(Boolean));
  const tomadas = new Set([...(input.takenAnchors || [])].map(radarAnchorKey).filter(Boolean));
  const formulacoes = radarNaturalAnchorFormulations({ targetKeywords: keywords, graphConcepts: input.graphConcepts });
  const alternativas = (escolhida: string) => formulacoes.filter(item => radarAnchorKey(item) !== radarAnchorKey(escolhida));
  const chave = radarAnchorKey(original);
  const repete = radarAnchorRepeatsKeyword(original, keywords);
  const usada = usadas.has(chave);
  const tomada = tomadas.has(chave);
  if (original && !repete && !usada && !tomada) return { anchor: original, changed: false, reason: null, alternatives: alternativas(original) };
  /* A ordem: o conceito do grafo; a própria âncora recortada (sem interrogativo nem "para <público>": "como gerar leads qualificados" → "gerar leads qualificados"); o recorte do rótulo. */
  const opcoes = [...formulacoes, radarAnchorTrim(original), ...radarAnchorCuts(rotulo)].filter(item => t(item) && !radarAnchorRepeatsKeyword(item, keywords));
  const livre = (item: string) => !usadas.has(radarAnchorKey(item)) && !tomadas.has(radarAnchorKey(item)) && radarAnchorKey(item) !== chave;
  const escolhida = opcoes.find(livre)
    ?? (repete ? opcoes.find(item => !tomadas.has(radarAnchorKey(item))) ?? opcoes[0] : undefined);
  if (!escolhida) return { anchor: original, changed: false, reason: null, alternatives: alternativas(original) };
  return { anchor: escolhida, changed: true, reason: repete ? "keyword" : usada ? "repeated" : "taken", alternatives: alternativas(escolhida) };
}

/* ============================== o grafo aprovado ============================== */

/** Uma aresta do grafo aprovado como o contexto de pesquisa a traz (`researchContext.internalLinks.edges`). */
export type RadarAnchorGraphEdge = {
  targetNodeId: string;
  relationType: string;
  anchorConcepts: readonly string[];
  direction: "outbound" | "inbound";
};

/** Os conceitos de âncora das arestas de SAÍDA deste artigo: por articleId do destino e os da SiloPage. */
export type RadarAnchorGraphConcepts = { byArticleId: ReadonlyMap<string, string[]>; siloPage: string[] };

/*
 * Só as arestas de SAÍDA: o conceito da aresta de entrada descreve ESTE artigo
 * (a âncora que o vizinho usa para chegar aqui), não o destino — usá-lo num
 * link de saída aplicaria ao contrário a decisão do Arquiteto.
 */
export function radarAnchorGraphConcepts(edges: readonly RadarAnchorGraphEdge[] | null | undefined): RadarAnchorGraphConcepts {
  const byArticleId = new Map<string, string[]>();
  const siloPage: string[] = [];
  for (const aresta of edges || []) {
    if (aresta.direction !== "outbound") continue;
    const conceitos = (aresta.anchorConcepts || []).map(t).filter(Boolean);
    if (!conceitos.length) continue;
    const no = t(aresta.targetNodeId);
    if (aresta.relationType === "ARTICLE_TO_SILO_PAGE" || no.startsWith("silo-page:")) {
      for (const conceito of conceitos) if (!siloPage.includes(conceito)) siloPage.push(conceito);
      continue;
    }
    const articleId = no.startsWith("article:") ? no.slice("article:".length) : no;
    if (!articleId) continue;
    const atuais = byArticleId.get(articleId) || [];
    byArticleId.set(articleId, [...atuais, ...conceitos.filter(conceito => !atuais.includes(conceito))]);
  }
  return { byArticleId, siloPage };
}

/** A chave do destino no livro de âncoras: a SiloPage é uma só; o artigo, pelo último trecho do endereço ou, sem ele, pelo nome. */
export function radarAnchorDestinationKey(candidate: { role: string; destination: string | null; label: string }): string {
  if (candidate.role === "SiloPage") return "silopage";
  const caminho = t(candidate.destination).replace(/[?#].*$/, "").replace(/\/+$/, "");
  const ultimo = radarWritingCompareKey(caminho.split("/").pop() || "");
  return ultimo ? `slug:${ultimo}` : `nome:${radarAnchorKey(semAspas(candidate.label))}`;
}
