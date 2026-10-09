import { radarSemanticStem } from "./semantic-concept-model.ts";
import { radarWritingCompareKey } from "./portable-writing-export.ts";
/* 2026-10-09 · a voz da marca entra no guarda das sugestões (defeito 5). */
import { radarBrandVoiceExclusionOf, type RadarBrandVoiceExclusion } from "./brand-voice.ts";

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
  /* 2026-10-08 (correção) · "E os outros canais orgânicos?" tirava "tipos de tráfego orgânico" só pelo "outros". */
  "outro", "outra", "outros", "outras",
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
  /*
   * 2026-10-08 (correção) · a mesma palavra genérica de research-noise e do modelo
   * editorial: "Como usar os 4 Ps do marketing em sua estratégia" tirava, pela
   * raiz "estrategi", a seção "Para que serve uma estratégia de marketing digital?".
   */
  "estrategia", "estrategias",
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

/*
 * ===== 2026-10-09 · O QUE UMA SUGESTÃO NÃO PODE SUGERIR (defeitos 3c, 5 e 6 dos 8 CSVs do Silo) =====
 *
 * Nos CSVs reais de 09/10, as sugestões contradiziam o próprio arquivo:
 *   - 3(c): "Diferencial possível: 'Como identificar leads qualificados'" ao lado
 *     da nota que o põe fora; "Sustentar…", temas e perguntas sugeriam o que o
 *     "Não cobrir" proíbe;
 *   - 5: "Diferenciar em 'Ative o Instagram Shopping'" com a voz da marca
 *     proibindo Instagram Shopping;
 *   - 6: "Sustentar 'como atrair um cliente' como diferencial" e "Sustentar
 *     'como ganhar um cliente'…" — sustentar a própria keyword não é diferencial.
 *
 * Duas réguas puras, para quem monta "Como superar", temas, perguntas e o
 * brief do artigo-modelo:
 *   - `radarSuggestionGuard`: a sugestão toca um rótulo do "Não cobrir" (a
 *     régua única acima, rótulo a rótulo, para dizer qual) ou uma exclusão da
 *     voz da marca (`radarBrandVoiceExclusions`)? A voz vem primeiro: é
 *     exclusão dura, vale até contra o que a SERP mostra;
 *   - `radarSuggestionRestatesKeyword`: o assunto da sugestão É a principal ou
 *     uma complementar (as mesmas raízes, sem palavra vazia, verbo de abertura
 *     nem palavra de formato)? "Como ganhar clientes pelo Instagram" não é
 *     "como ganhar um cliente": tem assunto a mais.
 * Os rótulos passados ao guarda são os que FICARAM no "Não cobrir" (depois de
 * a planta vencer o item genérico, regra 3a); quem monta decide a lista.
 *
 * A sugestão pode vir inteira ("Sustentar \"X\" como diferencial.",
 * "Diferencial possível: \"X\", … aprofunde na seção \"Y\""): o assunto é o
 * PRIMEIRO trecho entre aspas — a seção onde aprofundar não é o que se sugere.
 * Sem aspas, o texto todo (tema, pergunta).
 */
const assuntoDaSugestao = (sugestao: string | null | undefined): string => {
  const valor = String(sugestao || "").trim();
  return /["“]([^"”]+)["”]/.exec(valor)?.[1]?.trim() || valor;
};

export type RadarSuggestionVeto =
  | { kind: "VOZ_DA_MARCA"; label: string; rule: string }
  | { kind: "NAO_COBRIR"; label: string };

export function radarSuggestionGuard(input: {
  /** Os rótulos que ficaram no "Não cobrir" (fora do escopo, outro artigo do Silo, fronteira do Silo). */
  labels: ReadonlyArray<string | null | undefined>;
  /** O núcleo do artigo: principal, complementares e Assunto (não distinguem um rótulo). */
  core: ReadonlyArray<string | null | undefined>;
  /** As exclusões da voz da marca (`radarBrandVoiceExclusions`). */
  voice?: ReadonlyArray<RadarBrandVoiceExclusion>;
}): (sugestao: string | null | undefined) => RadarSuggestionVeto | null {
  /*
   * O molde que o modelo editorial pendura na pergunta ("… na prática no dia a
   * dia?") não é assunto: sem ele, "Como identificar um lead qualificado na
   * prática no dia a dia?" alcança "Como identificar leads qualificados". O
   * rótulo dito ao leitor continua o original.
   */
  const semMolde = (rotulo: string) => rotulo.replace(/\s+(?:no dia a dia|na pr[aá]tica)\b/gi, "").trim();
  const porRotulo = [...new Set(input.labels.map(rotulo => String(rotulo || "").trim()).filter(Boolean))]
    .map(rotulo => ({ rotulo, toca: radarOutOfScopeMatcher({ labels: [semMolde(rotulo) || rotulo], core: input.core }) }));
  const voz = input.voice || [];
  return sugestao => {
    const assunto = assuntoDaSugestao(sugestao);
    if (!assunto) return null;
    const exclusao = radarBrandVoiceExclusionOf(assunto, voz);
    if (exclusao) return { kind: "VOZ_DA_MARCA", label: exclusao.label, rule: exclusao.rule };
    const tocado = porRotulo.find(item => item.toca(assunto));
    return tocado ? { kind: "NAO_COBRIR", label: tocado.rotulo } : null;
  };
}

/** 2026-10-09 · A keyword (principal ou complementar) que a sugestão só repete, ou null. */
export function radarSuggestionRestatesKeyword(
  sugestao: string | null | undefined,
  keywords: ReadonlyArray<string | null | undefined>,
): string | null {
  const genericas = raizesQueNaoDistinguem();
  /* O radical não é uniforme no número ("cliente" fica "cliente", "clientes" vira "client"): sem o "s" e a vogal final, os dois conversam. */
  const uniforme = (raiz: string) => raiz.replace(/s$/, "").replace(/(?<=.{4})[aeo]$/, "");
  const assunto = (valor: string | null | undefined) =>
    [...new Set([...raizesDe(valor)].filter(raiz => !genericas.has(raiz)).map(uniforme))].sort().join(" ");
  const citado = assuntoDaSugestao(sugestao);
  const chave = radarWritingCompareKey(citado);
  const daSugestao = assunto(citado);
  if (!chave) return null;
  for (const keyword of keywords) {
    if (!radarWritingCompareKey(keyword)) continue;
    if (radarWritingCompareKey(keyword) === chave || (daSugestao && assunto(keyword) === daSugestao)) return String(keyword).trim();
  }
  return null;
}
