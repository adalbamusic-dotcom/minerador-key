/**
 * A KEYWORD CABE NO SLUG PUBLICADO? (correção de 2026-09-28, Defeito 2)
 *
 * Na troca da principal de uma página publicada, URL, slug e canonical nunca
 * mudam. A substituta boa é a que diz o que o slug diz: "como atrair
 * pacientes" cabe em `como-atrair-pacientes-para-clinica`. A que TROCA a
 * entidade do slug — "para o consultório" onde o slug diz "para clínica" —
 * deixaria a página com a URL de uma coisa e a principal de outra.
 *
 *   fits          todas as palavras de conteúdo da keyword estão no slug;
 *   neutral       acrescenta ou omite algo, sem trocar o complemento do slug;
 *   contradicts   o slug e a keyword têm complemento ("para X", "no X", "em X")
 *                 sem nenhuma palavra em comum: a entidade foi trocada.
 *
 * Domínio puro: sem banco, sem rede. Heurística de palavras — a SERP continua
 * sendo quem diz se as duas são o mesmo assunto.
 */

export type SlugFit = "fits" | "neutral" | "contradicts";

const VAZIAS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "para", "pra", "com", "em", "no", "na", "nos", "nas",
  "e", "ou", "um", "uma", "uns", "umas", "como", "que", "por", "pelo", "pela", "sua", "seu", "suas", "seus",
  "ao", "aos", "mais", "voce", "sobre", "qual", "quais", "the",
]);
/** Preposições que abrem o complemento de destino/lugar: "para clínica", "no consultório", "em SP". */
const ABRE_COMPLEMENTO = new Set(["para", "pra", "no", "na", "nos", "nas", "em"]);

const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const raiz = (palavra: string) => palavra.length > 4 && palavra.endsWith("oes")
  ? `${palavra.slice(0, -3)}ao`
  : palavra.length > 4 && palavra.endsWith("s") && !palavra.endsWith("ss") ? palavra.slice(0, -1) : palavra;

function palavras(frase: string): string[] {
  return semAcento(frase.replace(/[-_/]+/g, " ")).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function conteudo(lista: readonly string[]): string[] {
  return [...new Set(lista.filter(palavra => !VAZIAS.has(palavra)).map(raiz))];
}

/**
 * O complemento de destino/lugar: tudo o que vem depois da PRIMEIRA preposição
 * que abre complemento. Um slug com dois complementos
 * (`...-para-clinica-em-sp`) tem complemento "clinica sp"; a keyword
 * "...para clínica" divide "clinica" com ele e não troca a entidade.
 */
function complemento(lista: readonly string[]): string[] {
  const primeira = lista.findIndex(palavra => ABRE_COMPLEMENTO.has(palavra));
  return primeira >= 0 ? conteudo(lista.slice(primeira + 1)) : [];
}

/**
 * Só o último segmento: o slug é a página, não a pasta do Silo. A tela e o
 * servidor às vezes guardam em `slug` o caminho inteiro
 * (`/captacao-de-pacientes/como-atrair-pacientes-para-clinica`); as palavras
 * da pasta ("captação de pacientes") não podem contar como slug.
 */
function ultimoSegmento(valor: string): string | null {
  let caminho = valor.trim();
  if (/^https?:\/\//i.test(caminho)) {
    try {
      caminho = new URL(caminho).pathname;
    } catch {
      // não é URL válida: segue como texto
    }
  }
  const ultimo = caminho.split(/[?#]/)[0].replace(/\/+$/, "").split("/").filter(Boolean).pop();
  if (!ultimo) return null;
  try {
    return decodeURIComponent(ultimo);
  } catch {
    return ultimo;
  }
}

/** O texto do slug a partir do slug declarado ou do último segmento da URL/canonical. */
export function slugTextOf(identity: { slug?: string | null; url?: string | null; canonical?: string | null }): string | null {
  for (const endereco of [identity.slug, identity.url, identity.canonical]) {
    if (!endereco || !endereco.trim()) continue;
    const ultimo = ultimoSegmento(endereco);
    if (ultimo) return ultimo;
  }
  return null;
}

export type SlugFitReading = {
  fit: SlugFit;
  /** Frase curta em português, para o motivo da recusa ou da ordem. */
  reason: string;
};

export function classifySlugFit(slug: string | null | undefined, keyword: string): SlugFitReading {
  const segmento = slug ? ultimoSegmento(slug) : null;
  if (!segmento) return { fit: "neutral", reason: "sem slug para comparar" };
  const doSlug = palavras(segmento);
  const daKeyword = palavras(keyword);
  const s = conteudo(doSlug);
  const k = conteudo(daKeyword);
  if (!s.length || !k.length) return { fit: "neutral", reason: "sem palavras para comparar com o slug" };
  const extras = k.filter(token => !s.includes(token));
  const cs = complemento(doSlug);
  const ck = complemento(daKeyword);
  if (cs.length && ck.length && !ck.some(token => cs.includes(token))) {
    return { fit: "contradicts", reason: `troca a entidade do slug: o slug diz "${cs.join(" ")}" e ela diz "${ck.join(" ")}"` };
  }
  if (!extras.length && k.length >= Math.min(2, s.length)) return { fit: "fits", reason: "cabe no slug publicado" };
  return { fit: "neutral", reason: extras.length ? `acrescenta "${extras.join(" ")}" ao slug` : "cobre só parte do slug" };
}
