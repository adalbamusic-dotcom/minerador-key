import { radarSemanticStem } from "./semantic-concept-model.ts";
import { radarWritingCompareKey } from "./portable-writing-export.ts";

/**
 * ===== A RÉGUA ÚNICA DO "NÃO COBRIR" (2026-10-02) =====
 *
 * O mesmo CSV tinha duas réguas para a mesma pergunta — "este texto toca um
 * assunto fora do escopo?":
 *
 *   - o CSV para escrever (`radarWritingOutOfScopeMatcher`) tirava do rótulo as
 *     palavras do núcleo e os qualificadores ("melhor", "dicas") e pedia ao
 *     menos METADE das palavras que sobravam;
 *   - o artigo-modelo (`radarArticleBlueprintOutOfScopeMatcher`) tirava as
 *     palavras do núcleo e os verbos de abertura ("Ative", "Use") e pedia
 *     TODAS — e ainda aceitava a frase contida, com ou sem palavra distintiva.
 *
 * Um texto podia sair de uma coluna e ficar na outra. Agora há uma régua só,
 * usada pelo CSV para escrever, pelo artigo-modelo e pelo CSV de vídeo, para
 * qualquer marca, assunto e tipo de página:
 *
 *   1. as palavras de um rótulo fora do escopo que NÃO o distinguem saem: as do
 *      núcleo do artigo (principal, complementares e Assunto), os verbos de
 *      abertura de título e as palavras genéricas de formato ("dicas", "guia",
 *      "tutorial", "passo a passo", "melhores"…);
 *   2. o que sobra são as palavras DISTINTIVAS: o texto toca o rótulo quando
 *      traz ao menos metade delas (mínimo uma);
 *   3. rótulo sem palavra distintiva — feito só de núcleo, verbo e formato,
 *      como "Dicas de Instagram" num artigo sobre Instagram — exclui só a si
 *      mesmo, por igualdade. A palavra genérica sozinha nunca decide.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

/* As palavras que não dizem assunto: artigos, preposições, contrações e pronomes. */
const VAZIAS = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas", "de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos",
  "num", "numa", "pelo", "pela", "pelos", "pelas", "e", "ou", "que", "se", "com", "sem", "para", "pra", "por", "ao", "aos",
  "sobre", "ate", "seu", "sua", "seus", "suas", "meu", "minha", "meus", "minhas", "este", "esta", "esse", "essa",
  "isso", "isto", "como", "qual", "quais", "quando", "onde", "porque", "voce", "voces", "nosso", "nossos", "nossa",
  "aqui", "mais", "muito", "ser", "ter", "tem", "fazer", "pode", "sao", "nao", "ja", "the", "and", "for", "of",
]);

/*
 * Verbos que abrem título de concorrente ("Ative o…", "Use o…", "Aprenda a…").
 * Não distinguem assunto: "Ative o Instagram Shopping" é sobre o Shopping.
 */
const VERBOS_DE_ABERTURA = [
  "ative", "ativar", "use", "usar", "utilize", "crie", "criar", "faca", "aprenda", "saiba", "veja", "conheca",
  "descubra", "entenda", "confira", "aproveite", "invista", "comece", "defina", "escolha", "monte", "tenha", "evite",
  "aposte", "publique", "poste", "configure", "adicione", "coloque", "mantenha", "melhore", "aumente", "otimize",
];

/*
 * Palavras genéricas de formato e qualificadores: dizem a FORMA do conteúdo,
 * não o assunto. Em "As melhores ofertas de skincare", o que está fora do
 * escopo são as OFERTAS; em "Dicas de Instagram", nada além do próprio rótulo.
 */
const FORMATO_GENERICO = [
  "melhor", "melhores", "pior", "piores", "maior", "menor", "principal", "principais", "dica", "dicas",
  "guia", "guias", "tutorial", "tutoriais", "manual", "passo", "passos", "tipo", "tipos", "forma", "formas",
  "completo", "completa", "definitivo", "definitiva", "tudo", "coisa", "coisas", "ideia", "ideias",
  "truque", "truques", "segredo", "segredos", "top",
];

const raizesDe = (valor: string | null | undefined): Set<string> => new Set(
  radarWritingCompareKey(valor).split(" ").filter(palavra => palavra.length > 2 && !VAZIAS.has(palavra)).map(radarSemanticStem),
);

let naoDistinguem: Set<string> | null = null;
/* Calculado na primeira chamada: nada roda no carregamento do módulo. */
const raizesQueNaoDistinguem = () => (naoDistinguem ??= new Set([...VERBOS_DE_ABERTURA, ...FORMATO_GENERICO].map(radarSemanticStem)));

/** As palavras (raízes) que distinguem um rótulo fora do escopo do núcleo do artigo. */
export function radarOutOfScopeDistinctiveStems(rotulo: string | null | undefined, core: ReadonlyArray<string | null | undefined>): string[] {
  const doNucleo = new Set(core.flatMap(valor => [...raizesDe(valor)]));
  const genericas = raizesQueNaoDistinguem();
  return [...raizesDe(rotulo)].filter(raiz => !doNucleo.has(raiz) && !genericas.has(raiz));
}

/**
 * O "NÃO COBRIR" ALCANÇA ESTE TEXTO? `labels` são os rótulos fora do escopo
 * (do pacote, do Silo); `core` é o núcleo do artigo. Sem rótulo, nada sai.
 */
export function radarOutOfScopeMatcher(input: {
  labels: ReadonlyArray<string | null | undefined>;
  core: ReadonlyArray<string | null | undefined>;
}): (valor: string | null | undefined) => boolean {
  const doNucleo = new Set(input.core.flatMap(valor => [...raizesDe(valor)]));
  const genericas = raizesQueNaoDistinguem();
  const rotulos = input.labels
    .map(rotulo => ({ chave: radarWritingCompareKey(rotulo), distintivas: [...raizesDe(rotulo)].filter(raiz => !doNucleo.has(raiz) && !genericas.has(raiz)) }))
    .filter(rotulo => rotulo.chave);
  if (!rotulos.length) return () => false;
  return valor => {
    const chave = radarWritingCompareKey(valor);
    if (!chave) return false;
    const doTexto = raizesDe(valor);
    return rotulos.some(rotulo => rotulo.chave === chave || (rotulo.distintivas.length > 0
      && rotulo.distintivas.filter(raiz => doTexto.has(raiz)).length >= Math.max(1, Math.ceil(rotulo.distintivas.length / 2))));
  };
}
