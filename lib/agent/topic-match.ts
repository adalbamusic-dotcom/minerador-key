/**
 * ===== O TEMA PEDIDO JÁ EXISTE NA MARCA? =====
 *
 * Domínio puro. Compara o tema pedido no chat com o que a marca já tem —
 * Assuntos, keywords, artigos, silos, páginas publicadas — e diz onde ele
 * aparece.
 *
 * ==================== POR PALAVRAS, E DITO ASSIM ====================
 *
 * A correspondência é LÉXICA: palavras em comum, sem acento, sem as palavras
 * vazias do português. Não entende sinônimo. Por isso toda resposta declara
 * `match: "lexical"` — a IA que recebe sabe que "nenhum resultado" não prova
 * que o tema é inédito, e confere com o usuário antes de criar silo novo. É a
 * mesma honestidade da F3.1 do Assunto, que procura o Assunto nas páginas
 * pelas palavras e diz isso.
 */

const PALAVRAS_VAZIAS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "por", "para", "pra", "com", "sem", "e", "ou", "que", "como", "qual", "quais", "se", "ao", "aos", "the", "and", "of",
  "mais", "menos", "muito", "sobre", "entre", "ate", "seu", "sua", "seus", "suas", "meu", "minha", "é", "ser",
]);

export function normalizeTopicText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Tokens significativos: sem acento, sem palavra vazia, sem número solto de 1 dígito. */
export function topicTokens(value: string): string[] {
  const tokens = normalizeTopicText(value).split(" ").filter(Boolean)
    .filter(token => !PALAVRAS_VAZIAS.has(token) && !/^\d$/.test(token));
  return [...new Set(tokens)];
}

/**
 * Plural simples do português: "cremes" casa com "creme", "clinicas" com
 * "clinica". Sem isso, o tema no singular não acharia o artigo no plural.
 */
function raiz(token: string): string {
  if (token.length > 4 && token.endsWith("oes")) return `${token.slice(0, -3)}ao`;
  if (token.length > 4 && token.endsWith("aes")) return `${token.slice(0, -3)}ao`;
  if (token.length > 4 && token.endsWith("is")) return `${token.slice(0, -2)}l`;
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

/**
 * QUANTO O CANDIDATO COBRE O TEMA — de 0 a 1.
 *
 * É a fração dos tokens do TEMA que aparecem no candidato. Não é Jaccard de
 * propósito: um artigo "skincare para pele oleosa no verão" cobre inteiro o
 * tema "pele oleosa", e Jaccard puniria o artigo por ser mais específico.
 */
export function topicCoverage(topic: string, candidate: string): number {
  const alvo = topicTokens(topic).map(raiz);
  if (!alvo.length) return 0;
  const disponiveis = new Set(topicTokens(candidate).map(raiz));
  return alvo.filter(token => disponiveis.has(token)).length / alvo.length;
}

export type TopicCandidateKind = "subject" | "keyword" | "article" | "silo" | "silo_page" | "published_page";

export type TopicCandidate = {
  kind: TopicCandidateKind;
  id: string;
  /** O texto comparado: frase, promessa do artigo, nome do silo, título da página. */
  text: string;
  /** Onde está no pipeline — vai de volta para a IA como veio. */
  where: string;
  extra?: Record<string, unknown>;
};

/**
 * `score`: quanto o candidato cobre o TEMA — decide "mesmo tema".
 * `fit`: quanto o tema cobre o CANDIDATO — só conta para silo e página do
 * silo, que são mais amplos que o tema: "rotina para pele sensível" cabe em
 * "Cuidados com a pele" sem que o silo cubra o tema inteiro.
 */
export type TopicMatch = TopicCandidate & { score: number; fit: number };

const AMPLOS: ReadonlySet<TopicCandidateKind> = new Set(["silo", "silo_page"]);

export const TOPIC_MATCH_THRESHOLDS = {
  /** A partir daqui o candidato aparece. */
  related: 0.5,
  /** A partir daqui é o mesmo tema. */
  same: 0.99,
} as const;

export type TopicLookup = {
  topic: string;
  match: "lexical";
  /** Mesmo tema: cobre todos os tokens do pedido. */
  same: TopicMatch[];
  /** Relacionado: cobre metade ou mais. */
  related: TopicMatch[];
  /** O que a IA faz com o resultado — em palavras, para não interpretar sozinha. */
  reading: string;
};

export function lookupTopic(topic: string, candidates: readonly TopicCandidate[], limit = 12): TopicLookup {
  const arredondar = (value: number) => Math.round(value * 100) / 100;
  const pontuados = candidates
    .map(candidate => ({
      ...candidate,
      score: arredondar(topicCoverage(topic, candidate.text)),
      fit: AMPLOS.has(candidate.kind) ? arredondar(topicCoverage(candidate.text, topic)) : 0,
    }))
    .filter(item => item.score >= TOPIC_MATCH_THRESHOLDS.related || item.fit >= TOPIC_MATCH_THRESHOLDS.related)
    .sort((a, b) => Math.max(b.score, b.fit) - Math.max(a.score, a.fit) || a.kind.localeCompare(b.kind));

  const same = pontuados.filter(item => item.score >= TOPIC_MATCH_THRESHOLDS.same).slice(0, limit);
  const related = pontuados.filter(item => item.score < TOPIC_MATCH_THRESHOLDS.same).slice(0, limit);

  const temArtigoOuPublicado = same.some(item => item.kind === "article" || item.kind === "published_page");
  const temSilo = [...same, ...related].some(item => item.kind === "silo" || item.kind === "silo_page");

  const reading = !topicTokens(topic).length
    ? "O tema não tem palavras significativas para comparar. Peça ao usuário uma frase mais descritiva."
    : temArtigoOuPublicado
      ? "Já existe artigo ou página publicada sobre este tema. Não crie outro (canibalização): trabalhe o existente ou escolha outra intenção."
      : same.length
        ? "O tema já existe na marca (como Assunto, keyword ou silo), mas ainda não como artigo. Continue a partir do que existe."
        : temSilo
          ? "Não há artigo sobre o tema, mas há silo relacionado. Avalie com o usuário se o artigo entra como Suporte desse silo."
          : related.length
            ? "Só há correspondências parciais. Confira com o usuário se alguma é o mesmo tema antes de criar algo novo."
            : "Nada encontrado pelas palavras. Isso não prova que o tema é inédito (a busca não entende sinônimos): confirme com o usuário e, se for novo, proponha um silo.";

  return { topic, match: "lexical", same, related, reading };
}
