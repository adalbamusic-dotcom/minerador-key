import { radarCleanCompetitorHeading } from "./heading-cleanup.ts";
import { radarSemanticStems } from "./semantic-concept-model.ts";

/**
 * ===== O QUE OS CONCORRENTES LIDOS COBREM — pelos H2/H3 deles (2026-10-02) =====
 *
 * A investigação lê as páginas comparáveis (H1/H2/H3 na ordem, `headingOutline`),
 * mas o pacote só levava os conceitos agrupados pelo modelo semântico — que
 * agrupa de forma estrita: no artigo do Instagram, 6 páginas com mediana de 16
 * H2 viraram 13 conceitos, quase todos de 1 página, e o esqueleto da SERP saiu
 * com UMA seção ("stories"). A IA do artigo-modelo pendurava tudo nela.
 *
 * Aqui, os temas: cada H2/H3 limpo (sem numeração de listicle, sem verbo de
 * comando, sem as palavras da keyword) vira um conjunto de raízes; o tema é a
 * raiz que mais páginas compartilham; o rótulo é o cabeçalho mais comum do
 * grupo. "Crie uma conta comercial" e "Tenha uma conta comercial" caem juntos;
 * a contagem é de PÁGINAS, não de cabeçalhos.
 *
 * Leitura AO LADO do congelamento: não muda conceito, hash nem pacote — é o
 * mesmo material extraído, lido de outro jeito para quem escreve. Domínio puro.
 */

export type RadarCompetitorOutlinePage = {
  url: string;
  title: string;
  domain: string;
  headings: ReadonlyArray<{ level: number; text: string }>;
};

export type RadarCompetitorTopic = {
  id: string;
  label: string;
  /** Páginas comparáveis que tratam o tema (H2 ou H3). */
  pages: number;
  sampleSize: number;
  /** Até 3 cabeçalhos dos concorrentes, limpos, como exemplo do que cobrem. */
  headings: string[];
  domains: string[];
};

/* Verbos de comando dos listicles e palavras que não dizem o tema (sem acento). */
const VERBOS = new Set([
  "crie", "criar", "tenha", "ter", "use", "usar", "utilize", "faca", "fazer", "aposte", "invista", "produza", "monte",
  "defina", "conheca", "entenda", "explore", "aproveite", "otimize", "publique", "poste", "mantenha", "siga", "domine",
  "saiba", "descubra", "veja", "aprenda", "comece", "melhore", "trabalhe", "ofereca", "interaja", "responda", "mostre",
  "divulgue", "analise", "acompanhe", "busque", "seja", "esteja", "garanta", "escolha", "conte", "foque", "capriche",
  "adote", "teste", "aumente", "atraia", "conquiste", "transforme", "gere", "tenham", "invista", "valorize", "planeje",
]);
const VAZIAS = new Set([
  "como", "para", "pelo", "pela", "pelos", "pelas", "com", "sem", "sobre", "seu", "sua", "seus", "suas", "dos", "das",
  "nos", "nas", "uma", "uns", "umas", "que", "mais", "muito", "muita", "melhor", "melhores", "dica", "dicas", "forma",
  "formas", "maneira", "maneiras", "estrategia", "estrategias", "passo", "passos", "guia", "completo", "completa",
  "ideia", "ideias", "atrativa", "atrativo", "atrativas", "atrativos", "relevante", "relevantes", "qualidade", "certa",
  "certo", "bom", "boa", "bons", "boas", "ideal", "eficiente", "eficientes", "estrategico", "estrategica", "perfeito",
  "perfeita", "incrivel", "novo", "nova", "novos", "novas", "principal", "principais", "importante", "importantes",
  "simples", "rapido", "rapida", "facil", "faceis", "otimo", "otima", "util", "uteis", "poderoso", "poderosa", "sucesso",
  "resultado", "resultados", "voce", "isso", "esse", "essa", "este", "esta", "por", "porque", "quais", "qual", "quando",
  "onde", "the", "and", "for", "you", "your", "how", "what", "why", "tudo", "todo", "toda", "todos", "todas",
]);
/* Cabeçalho que não é tema: navegação, encerramento, pergunta retórica de fecho. */
const RUIDO = /^(conclus|considera[cç][oõ]es finais|leia tamb|veja tamb|sum[aá]rio|[ií]ndice|introdu|refer[eê]ncias|perguntas frequentes|faq|d[uú]vidas frequentes|compartilh|coment[aá]rios?|newsletter|sobre o autor|sobre n[oó]s|posts? relacionad|artigos? relacionad|conte[uú]dos? relacionad|aprendeu|gostou|deixe|inscreva|assine|baixe|fale conosco|fale com a gente|fale com a nossa equipe|contato|tabela de conte|redes sociais|siga-nos|nos siga|siga a gente|categorias|posts recentes|[uú]ltimos posts|mais lidos)/i;

/** 2026-10-02 · cabeçalho de navegação, rodapé ou fecho (não é tema nem seção da página). */
export const radarIsNavigationHeading = (texto: string): boolean => RUIDO.test(texto.trim()) || texto.trim().split(/\s+/).length < 2;

/*
 * 2026-10-02 · o bloco de identidade do próprio site ("AdalbaPro - SEO técnico e
 * captação local para clínicas"): começa pelo nome do domínio e traz o separador
 * de assinatura (" - ", " | ", " – "). Uma seção que só cita a marca no meio não cai.
 */
export function radarIsSiteIdentityHeading(texto: string, hostname: string): boolean {
  const raiz = hostname.toLowerCase().replace(/^www\./, "").split(".")[0] || "";
  if (raiz.length < 3 || !/\s[-–—|]\s/.test(texto)) return false;
  const compacto = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return compacto.startsWith(raiz);
}

const semAcento = (texto: string) => texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/*
 * 2026-10-02 · O RÓTULO NEUTRO DO TEMA. O cabeçalho mais comum do grupo era
 * o nome do tema ("Use as hashtags certas") — frase de concorrente. O rótulo
 * agora é o assunto: sem o verbo de comando, o artigo e a preposição do começo
 * ("Hashtags certas", "Parcerias com influenciadores"). Os cabeçalhos dos
 * concorrentes continuam como exemplo, marcados como tal.
 */
const COMECO_SEM_ASSUNTO = new Set(["o", "a", "os", "as", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "com", "no", "na", "nos", "nas", "em", "para", "seu", "sua", "seus", "suas", "e", "se", "nao", "esqueca", "sempre", "bem", "mais"]);

export function radarCompetitorTopicLabel(cabecalho: string): string {
  const palavras = cabecalho.replace(/\s+/g, " ").trim().split(" ");
  let inicio = 0;
  while (inicio < palavras.length - 1) {
    const chave = semAcento(palavras[inicio]).replace(/[^a-z0-9]/g, "");
    if (!VERBOS.has(chave) && !COMECO_SEM_ASSUNTO.has(chave)) break;
    inicio += 1;
  }
  const resto = palavras.slice(inicio).join(" ").replace(/[?!.:;]+$/, "").trim();
  if (!resto || resto.length < 3) return cabecalho;
  return `${resto.charAt(0).toUpperCase()}${resto.slice(1)}`;
}
const chaveDoRotulo = (texto: string) => semAcento(texto).replace(/[^a-z0-9]+/g, " ").trim();

/* Variantes que o radical não junta e que os cabeçalhos usam para a mesma coisa. */
const SINONIMOS: Readonly<Record<string, string>> = { bio: "biografia", bios: "biografia", biografias: "biografia", reel: "reels", story: "stories" };

function raizesDoTema(texto: string, nucleo: ReadonlySet<string>): string[] {
  const palavras = semAcento(texto).split(/[^a-z0-9]+/)
    .map(palavra => SINONIMOS[palavra] || palavra)
    .filter(palavra => palavra.length >= 3 && !VERBOS.has(palavra) && !VAZIAS.has(palavra));
  return [...new Set(radarSemanticStems(palavras.join(" ")))].filter(raiz => raiz.length >= 3 && !nucleo.has(raiz));
}

/*
 * ===== 2026-10-08 · O RUÍDO DOS CABEÇALHOS DOS CONCORRENTES (C5 da rodada dos entregáveis) =====
 *
 * O CSV real de 08/10 ("como atrair clientes pelo instagram", público de
 * clínicas) listava como tema dos concorrentes "Transforme seus seguidores em
 * clientes com a Bagy" (a página se promovendo), "Carol" (nome solto), "Agora a
 * sua loja virtual" (chamada de loja), "Feriados e datas comemorativas de
 * setembro: calendário do mês" (conteúdo recomendado datado) e "Qual a
 * importância de ter um catálogo online" — num artigo que não é de loja. Saem,
 * para qualquer marca e assunto:
 *
 *   - AUTOPROMOÇÃO: o cabeçalho cita a marca do domínio da própria página (o
 *     nome antes do sufixo: "bagy" em bagy.com.br, "stone" em
 *     conteudo.stone.com.br), salvo quando a marca é do núcleo do artigo;
 *   - CONTEÚDO DATADO: mês do ano, "datas comemorativas", "calendário do mês",
 *     salvo quando o núcleo fala de data, calendário ou promoção;
 *   - LOJA E CATÁLOGO: "loja virtual", "e-commerce", "catálogo online", frete,
 *     carrinho…, só quando o artigo NÃO é de loja (o núcleo não fala de loja,
 *     produto, venda nem catálogo);
 *   - PALAVRA SOLTA: cabeçalho de uma palavra só que nenhuma outra página
 *     trata não diz tema ("Carol"); "Hashtags", que outras páginas tratam, fica.
 *
 * O tema legítimo de uma página só ("Destaques de forma estratégica", "Promova
 * a interação nos comentários") continua no "Tratado por 1 página só".
 */
const INSTITUCIONAIS = new Set(["gov", "edu", "jus", "mil", "leg", "mp", "def"]);
const SUFIXOS_DE_DOMINIO = new Set(["com", "br", "net", "org", "gov", "edu", "co", "io", "info", "biz", "app", "pt", "us", "uk", "es", "ar", "mx", "tv", "me", "ind", "adv", "med", "art"]);

/** 2026-10-08 · A marca de um domínio: o nome antes do sufixo ("bagy" em www.bagy.com.br). Nome curto (menos de 4 letras) não conta. */
export function radarCompetitorBrandOf(dominio: string | null | undefined): string | null {
  const partes = semAcento(dominio || "").replace(/^www\./, "").split(".").filter(Boolean);
  /* 2026-10-08 (revisão) · domínio de órgão não tem marca: "saude" em saude.gov.br é o assunto da fonte, não autopromoção. */
  if (partes.some(parte => INSTITUCIONAIS.has(parte))) return null;
  while (partes.length > 1 && SUFIXOS_DE_DOMINIO.has(partes[partes.length - 1])) partes.pop();
  const marca = (partes[partes.length - 1] || "").replace(/[^a-z0-9]/g, "");
  return marca.length >= 4 ? marca : null;
}

/* A marca aparece como palavra, ou como duas ou três palavras juntas ("Vetline Brasil" em vetlinebrasil.com.br). */
function citaAMarca(texto: string, marca: string): boolean {
  const palavras = semAcento(texto).split(/[^a-z0-9]+/).filter(Boolean);
  for (let i = 0; i < palavras.length; i += 1) {
    let junto = "";
    for (let j = i; j < Math.min(palavras.length, i + 3); j += 1) {
      junto += palavras[j];
      if (junto === marca) return true;
      if (junto.length >= marca.length) break;
    }
  }
  return false;
}

const MESES = "janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
/* 2026-10-08 (revisão) · sem acento, "março" é "marco" ("marco zero"): ele só conta como mês com contexto de data. */
const MESES_SEM_AMBIGUIDADE = MESES.replace("marco|", "");
const MARCO_DATADO = "(?:de|em) marco|marco (?:de )?\\d{4}";
const DATADO = new RegExp(`\\b(?:${MESES_SEM_AMBIGUIDADE}|${MARCO_DATADO}|datas comemorativas|calendario do mes)\\b`);
const NUCLEO_DATADO = new RegExp(`\\b(?:${MESES}|datas?|calendarios?|promoc\\w*|sazona\\w*|feriados?|comemorativ\\w*)\\b`);
const DE_LOJA = /\b(?:lojas? (?:virtua\w*|online|on line|propria)|sua loja|e ?commerce|catalogos? (?:online|on line|digita\w*|de produtos)|frete|checkout|carrinho|dropshipping|marketplace|instagram shopping)\b/;
const NUCLEO_DE_LOJA = /\b(?:lojas?|e ?commerce|catalogos?|produtos?|vend\w*|marketplace|dropshipping|shopping|frete)\b/;

/** 2026-10-08 · O cabeçalho é ruído da página, não tema: autopromoção, conteúdo datado ou loja num artigo que não é de loja. */
export function radarCompetitorHeadingIsNoise(cabecalho: string, contexto: { domain?: string | null; core?: readonly string[] } = {}): boolean {
  const texto = semAcento(cabecalho);
  const nucleo = semAcento((contexto.core || []).join(" "));
  const marca = radarCompetitorBrandOf(contexto.domain);
  if (marca && citaAMarca(texto, marca) && !citaAMarca(nucleo, marca)) return true;
  if (DATADO.test(texto) && !NUCLEO_DATADO.test(nucleo)) return true;
  return DE_LOJA.test(texto) && !NUCLEO_DE_LOJA.test(nucleo);
}

/**
 * Os esboços das páginas COMPARÁVEIS, das extrações gravadas. A lista de
 * comparáveis é a do modelo observado (a mesma do "Páginas comparáveis lidas"
 * do CSV); sem ela, nenhuma página — nunca a amostra inteira, que mistura
 * vitrine, fórum e vídeo.
 */
export function radarCompetitorOutlinesOf(
  extractions: ReadonlyArray<{ url: string; title?: string | null; status?: string; headingOutline?: ReadonlyArray<{ level: number; text: string }> }> | null | undefined,
  competitors: ReadonlyArray<{ url: string; domain: string; title: string; comparable: boolean }> | null | undefined,
): RadarCompetitorOutlinePage[] {
  const chave = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  const comparaveis = new Map((competitors || []).filter(item => item.comparable).map(item => [chave(item.url), item]));
  if (!comparaveis.size) return [];
  const vistos = new Set<string>();
  const saida: RadarCompetitorOutlinePage[] = [];
  for (const pagina of extractions || []) {
    const concorrente = comparaveis.get(chave(pagina.url));
    if (!concorrente || vistos.has(chave(pagina.url)) || !pagina.headingOutline?.length) continue;
    vistos.add(chave(pagina.url));
    saida.push({ url: pagina.url, title: concorrente.title || pagina.title || concorrente.domain, domain: concorrente.domain, headings: pagina.headingOutline });
  }
  return saida;
}

export function radarCompetitorTopics(input: {
  pages: readonly RadarCompetitorOutlinePage[];
  /** Keyword principal, complementares e Assunto: as palavras deles não distinguem tema. */
  core: readonly string[];
  /** Tema fora do escopo do artigo sai (a mesma régua do "não cobrir"). */
  outOfScope?: (valor: string) => boolean;
}): { topics: RadarCompetitorTopic[]; sampleSize: number; headingsRead: number } {
  const nucleo = new Set(input.core.flatMap(texto => raizesDoTema(texto, new Set())));
  const itens: Array<{ pagina: number; rotulo: string; raizes: string[]; solta: boolean }> = [];
  let lidos = 0;
  for (const [pagina, page] of input.pages.entries()) {
    for (const cabecalho of page.headings) {
      if (cabecalho.level !== 2 && cabecalho.level !== 3) continue;
      lidos += 1;
      const rotulo = radarCleanCompetitorHeading(cabecalho.text).replace(/\s+/g, " ").trim();
      if (rotulo.length < 3 || rotulo.length > 120 || RUIDO.test(rotulo)) continue;
      if (input.outOfScope?.(rotulo)) continue;
      /* 2026-10-08 · C5 · autopromoção, conteúdo datado e loja num artigo que não é de loja não são tema. */
      if (radarCompetitorHeadingIsNoise(rotulo, { domain: page.domain, core: input.core })) continue;
      const raizes = raizesDoTema(rotulo, nucleo);
      if (raizes.length) itens.push({ pagina, rotulo, raizes, solta: rotulo.split(" ").length === 1 });
    }
  }

  /* Em quantas PÁGINAS cada raiz aparece: o tema é a raiz mais compartilhada do cabeçalho. */
  const paginasDaRaiz = new Map<string, Set<number>>();
  for (const item of itens) {
    for (const raiz of item.raizes) {
      const paginas = paginasDaRaiz.get(raiz) || new Set<number>();
      paginas.add(item.pagina);
      paginasDaRaiz.set(raiz, paginas);
    }
  }
  const grupos = new Map<string, typeof itens>();
  /* 2026-10-08 · C5 · a palavra solta que nenhuma outra página trata ("Carol") não diz tema. */
  for (const item of itens.filter(item => !item.solta || item.raizes.some(raiz => (paginasDaRaiz.get(raiz)?.size || 0) >= 2))) {
    const ancora = [...item.raizes].sort((a, b) =>
      (paginasDaRaiz.get(b)?.size || 0) - (paginasDaRaiz.get(a)?.size || 0) || b.length - a.length || a.localeCompare(b))[0];
    const grupo = grupos.get(ancora) || [];
    grupo.push(item);
    grupos.set(ancora, grupo);
  }

  const topicos = [...grupos.values()].map(grupo => {
    const paginas = new Set(grupo.map(item => item.pagina));
    const contagem = new Map<string, { rotulo: string; vezes: number }>();
    for (const item of grupo) {
      const chave = chaveDoRotulo(item.rotulo);
      const atual = contagem.get(chave);
      contagem.set(chave, { rotulo: atual?.rotulo || item.rotulo, vezes: (atual?.vezes || 0) + 1 });
    }
    const rotulos = [...contagem.values()].sort((a, b) => b.vezes - a.vezes || a.rotulo.length - b.rotulo.length);
    return {
      label: radarCompetitorTopicLabel(rotulos[0].rotulo),
      pages: paginas.size,
      headings: rotulos.slice(0, 3).map(item => item.rotulo),
      domains: [...new Set([...paginas].map(indice => input.pages[indice].domain).filter(Boolean))],
      primeira: Math.min(...grupo.map(item => item.pagina)),
      tamanho: grupo.length,
    };
  }).sort((a, b) => b.pages - a.pages || b.tamanho - a.tamanho || a.primeira - b.primeira);

  return {
    topics: topicos.map((topico, indice) => ({
      id: `T${indice + 1}`, label: topico.label, pages: topico.pages, sampleSize: input.pages.length, headings: topico.headings, domains: topico.domains,
    })),
    sampleSize: input.pages.length,
    headingsRead: lidos,
  };
}
