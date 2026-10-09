import { radarCleanCompetitorHeading } from "./heading-cleanup.ts";
import { radarSemanticStems } from "./semantic-concept-model.ts";
import {
  radarCompetitorBrandOf,
  radarCompetitorHeadingIsChrome,
  radarCompetitorHeadingIsPostTitle,
  radarRegistrableDomain,
  radarResearchNeighborArea,
  radarResearchOtherProfession,
  radarResearchStoreNoise,
  radarTextCitesBrand,
  type RadarResearchNoiseContext,
} from "./research-noise.ts";

/* 2026-10-08 · a marca do domínio mudou para `research-noise.ts` (a régua pura); o nome e a assinatura continuam aqui. */
export { radarCompetitorBrandOf } from "./research-noise.ts";

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
  /**
   * Sites (domínios distintos) entre as páginas comparáveis da base que tratam
   * o tema (H2 ou H3). 2026-10-08 · antes contava páginas, e três páginas do
   * mesmo site com o mesmo menu viravam "3 de N"; o nome do campo fica.
   */
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
  /* 2026-10-08 · palavra que cola cabeçalhos sem assunto comum ("Empresa", "Poder de decisão na empresa", "Netflix Brasil"). */
  "empresa", "empresas", "negocio", "negocios", "brasil", "exemplo", "exemplos",
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
/*
 * 2026-10-08 · Expressão que é UM assunto: "provas sociais" e "redes sociais"
 * não são o mesmo tema só porque dividem "sociais" (no CSV real, "Provas
 * sociais" juntava "Utilize as redes sociais").
 */
const COMPOSTOS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:redes|midias) sociais\b|\b(?:rede|midia) social\b/g, "redessociais"],
  [/\bprovas? socia(?:l|is)\b/g, "provasocial"],
];

function raizesDoTema(texto: string, nucleo: ReadonlySet<string>): string[] {
  const composto = COMPOSTOS.reduce((atual, [padrao, unico]) => atual.replace(padrao, unico), semAcento(texto));
  const palavras = composto.split(/[^a-z0-9]+/)
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
/*
 * 2026-10-08 · a marca do domínio (`radarCompetitorBrandOf`) e a régua de loja
 * moraram aqui; agora vêm de `research-noise.ts`, a régua pura que as listas do
 * CSV também usam. C5 continua como era; a loja ganhou "lojas de …" e o
 * consumo (cupom, cashback, vale-presente) fora do leitor consumidor (P1).
 */
const MESES = "janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
/* 2026-10-08 (revisão) · sem acento, "março" é "marco" ("marco zero"): ele só conta como mês com contexto de data. */
const MESES_SEM_AMBIGUIDADE = MESES.replace("marco|", "");
const MARCO_DATADO = "(?:de|em) marco|marco (?:de )?\\d{4}";
/*
 * 2026-10-08 · P1 · data comemorativa e ano também datam o cabeçalho: "Dia do
 * Cliente 2026: 11 ideias…", "65 mensagens de Dia do Cliente…", "MÊS DO
 * CLIENTE" eram tema de 6 a 8 páginas no CSV do Pilar. "Natal" fica de fora (é cidade).
 */
const COMEMORATIVAS = "dia do cliente|mes do cliente|black friday|cyber monday|dia das maes|dia dos pais|dia dos namorados|dia da mulher|dia do consumidor|dia das criancas|pascoa|carnaval";
const DATADO = new RegExp(`\\b(?:${MESES_SEM_AMBIGUIDADE}|${MARCO_DATADO}|datas comemorativas|calendario do mes|${COMEMORATIVAS}|20[2-3]\\d)\\b`);
/*
 * 2026-10-08 (correção) · o ANO também data o núcleo. Sem ele, num artigo cuja
 * principal traz o ano ("tendências de marketing digital 2026"), todo cabeçalho
 * de concorrente com o mesmo ano virava "conteúdo datado": o modelo editorial
 * ficava sem nenhuma seção e o CSV bloqueava por falta de estrutura.
 */
const NUCLEO_DATADO = new RegExp(`\\b(?:${MESES}|datas?|calendarios?|promoc\\w*|sazona\\w*|feriados?|comemorativ\\w*|${COMEMORATIVAS}|20[2-3]\\d)\\b`);

/**
 * 2026-10-08 · O cabeçalho é ruído da página, não tema: autopromoção, conteúdo
 * datado, loja num artigo que não é de loja ou (P1) cupom/cashback num artigo
 * que não é para o consumidor (`audience`, opcional: sem ele, o leitor não é o consumidor).
 */
export function radarCompetitorHeadingIsNoise(
  cabecalho: string,
  contexto: { domain?: string | null; core?: ReadonlyArray<string | null | undefined>; audience?: RadarResearchNoiseContext["audience"] } = {},
): boolean {
  const texto = semAcento(cabecalho);
  const nucleo = semAcento((contexto.core || []).filter(Boolean).join(" "));
  const marca = radarCompetitorBrandOf(contexto.domain);
  if (marca && radarTextCitesBrand(texto, marca) && !radarTextCitesBrand(nucleo, marca)) return true;
  if (DATADO.test(texto) && !NUCLEO_DATADO.test(nucleo)) return true;
  return radarResearchStoreNoise(cabecalho, { core: contexto.core, audience: contexto.audience });
}

/**
 * ===== 2026-10-08 · P1 · O CABEÇALHO QUE NÃO É TEMA NEM SEÇÃO =====
 *
 * A régua inteira para cabeçalho de concorrente, para os temas daqui e para
 * quem monta a estrutura com eles: navegação e fecho (`radarIsNavigationHeading`
 * sem a regra de uma palavra), cromo do site (menu, rodapé, tela, banner,
 * newsletter, chamada), título de post (listicle, "Guia", subtítulo de post,
 * encerramento, autopromoção, inglês, manchete de outra página), o ruído da
 * página (datado, loja, consumo), outra profissão fora do público e área
 * vizinha (gestão de pessoas, tributário) que o núcleo não trata. Lê o
 * cabeçalho como veio e sem a moldura de listicle.
 */
export function radarCompetitorHeadingIsNotTopic(cabecalho: string, contexto: RadarResearchNoiseContext = {}): boolean {
  const limpo = radarCleanCompetitorHeading(cabecalho).replace(/\s+/g, " ").trim();
  for (const texto of new Set([cabecalho.replace(/\s+/g, " ").trim(), limpo])) {
    if (RUIDO.test(texto) || radarCompetitorHeadingIsChrome(texto) || radarCompetitorHeadingIsPostTitle(texto, contexto)) return true;
  }
  if (radarCompetitorHeadingIsNoise(limpo, { domain: contexto.domain, core: contexto.core, audience: contexto.audience })) return true;
  return radarResearchOtherProfession(limpo, contexto) || radarResearchNeighborArea(limpo, contexto) !== null;
}

/* A chave do endereço: sem protocolo, "www.", consulta, âncora e barra final. */
const chaveDaUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

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
  const comparaveis = new Map((competitors || []).filter(item => item.comparable).map(item => [chaveDaUrl(item.url), item]));
  if (!comparaveis.size) return [];
  const vistos = new Set<string>();
  const saida: RadarCompetitorOutlinePage[] = [];
  for (const pagina of extractions || []) {
    const concorrente = comparaveis.get(chaveDaUrl(pagina.url));
    if (!concorrente || vistos.has(chaveDaUrl(pagina.url)) || !pagina.headingOutline?.length) continue;
    vistos.add(chaveDaUrl(pagina.url));
    saida.push({ url: pagina.url, title: concorrente.title || pagina.title || concorrente.domain, domain: concorrente.domain, headings: pagina.headingOutline });
  }
  return saida;
}

/*
 * ===== 2026-10-08 · P1 · UMA BASE SÓ, RECORRÊNCIA POR SITE E O CROMO FORA =====
 *
 * Os 8 CSVs do Silo diziam "N de 23", "N de 32", "N de 36 páginas comparáveis"
 * enquanto a lista impressa logo acima tinha 12, 18 e 19: os esboços vinham de
 * uma lista de comparáveis e o arquivo imprimia outra. E o primeiro tema do
 * Pilar era "Soluções de dados para personalizar campanhas de marketing · 19
 * de 23" — o menu de um site que aparecia em várias páginas dele, contado uma
 * vez por página. Agora:
 *
 *   - BASE ÚNICA (`basis`): a lista impressa. Só as páginas dela contam, e o
 *     "de M" é o tamanho dela. As outras páginas do esboço só servem para
 *     reconhecer o cromo. Sem `basis`, todas as páginas, como antes;
 *   - RECORRÊNCIA POR SITE: o tema conta domínios distintos (blog.cielo.com.br
 *     e www.cielo.com.br são um site), e o rótulo é o cabeçalho de mais sites;
 *   - CROMO DO SITE: o cabeçalho que se repete em duas ou mais páginas
 *     DIFERENTES do mesmo site é menu, rodapé ou "relacionados", não tema. A
 *     mesma página em dois endereços (60% dos cabeçalhos iguais) conta uma vez
 *     e não vira cromo. Custo aceito: dois artigos do mesmo site com o mesmo
 *     H2 de conteúdo perdem aquele H2 só naquele site;
 *   - A RÉGUA (`radarCompetitorHeadingIsNotTopic`): navegação, cromo, título de
 *     post, ruído da página, outra profissão e área vizinha.
 */
const MESMA_PAGINA = 0.6;

function semelhanca(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) return 0;
  let comuns = 0;
  for (const item of a) if (b.has(item)) comuns += 1;
  return comuns / (a.size + b.size - comuns);
}

export function radarCompetitorTopics(input: {
  pages: readonly RadarCompetitorOutlinePage[];
  /** Keyword principal, complementares e Assunto: as palavras deles não distinguem tema. */
  core: readonly string[];
  /** Tema fora do escopo do artigo sai (a mesma régua do "não cobrir"). */
  outOfScope?: (valor: string) => boolean;
  /** 2026-10-08 · A lista de páginas comparáveis impressa no arquivo: a base única dos temas e do "de M". */
  basis?: ReadonlyArray<{ url: string; domain?: string | null }> | null;
  /** 2026-10-08 · O leitor do artigo e/ou o público da marca: outra profissão e consumo fora dele saem. */
  audience?: RadarResearchNoiseContext["audience"];
}): { topics: RadarCompetitorTopic[]; sampleSize: number; headingsRead: number; sampleDomains: number } {
  const nucleo = new Set(input.core.flatMap(texto => raizesDoTema(texto, new Set())));
  const daBase = input.basis ? new Set(input.basis.map(item => chaveDaUrl(item.url || "")).filter(Boolean)) : null;
  const siteDe = (page: { url: string; domain?: string | null }) => radarRegistrableDomain(page.domain || page.url);
  const doCorpo = (page: RadarCompetitorOutlinePage) => page.headings.filter(item => item.level === 2 || item.level === 3);
  const limpar = (texto: string) => radarCleanCompetitorHeading(texto).replace(/\s+/g, " ").trim();

  /* 1 · cada endereço uma vez; as páginas da base primeiro, para uma cópia de fora nunca tomar o lugar delas. */
  const enderecos = new Set<string>();
  const candidatas = input.pages
    .map((page, indice) => ({ page, indice, chave: chaveDaUrl(page.url || ""), site: siteDe(page) }))
    .filter(item => !item.chave || (!enderecos.has(item.chave) && Boolean(enderecos.add(item.chave))))
    .sort((a, b) => Number(Boolean(daBase && !daBase.has(a.chave))) - Number(Boolean(daBase && !daBase.has(b.chave))) || a.indice - b.indice);

  /* 2 · a mesma página em outro endereço do mesmo site conta uma vez. */
  const mantidas: Array<(typeof candidatas)[number] & { chaves: Set<string> }> = [];
  for (const item of candidatas) {
    const chaves = new Set(doCorpo(item.page).map(cabecalho => chaveDoRotulo(limpar(cabecalho.text))).filter(Boolean));
    if (mantidas.some(outra => outra.site === item.site && semelhanca(chaves, outra.chaves) >= MESMA_PAGINA)) continue;
    mantidas.push({ ...item, chaves });
  }

  /* 3 · o cromo: o mesmo cabeçalho em duas ou mais páginas diferentes do mesmo site. */
  const vezesNoSite = new Map<string, Map<string, number>>();
  for (const item of mantidas) {
    const doSite = vezesNoSite.get(item.site) || new Map<string, number>();
    for (const chave of item.chaves) doSite.set(chave, (doSite.get(chave) || 0) + 1);
    vezesNoSite.set(item.site, doSite);
  }
  const ehCromo = (site: string, chave: string) => (vezesNoSite.get(site)?.get(chave) || 0) >= 2;

  /* 4 · a base: a lista impressa (ou todas as páginas, sem ela), na ordem de entrada. */
  const base = mantidas.filter(item => !daBase || daBase.has(item.chave)).sort((a, b) => a.indice - b.indice);
  const itens: Array<{ site: string; dominio: string; pagina: number; rotulo: string; raizes: string[]; solta: boolean }> = [];
  let lidos = 0;
  for (const item of base) {
    const contexto: RadarResearchNoiseContext = { core: input.core, audience: input.audience, domain: item.page.domain };
    for (const cabecalho of doCorpo(item.page)) {
      lidos += 1;
      const rotulo = limpar(cabecalho.text);
      if (rotulo.length < 3 || rotulo.length > 120) continue;
      if (ehCromo(item.site, chaveDoRotulo(rotulo))) continue;
      if (input.outOfScope?.(rotulo)) continue;
      /* C5 (autopromoção, datado, loja) e P1 (navegação, cromo, título de post, outra profissão, área vizinha). */
      if (radarCompetitorHeadingIsNotTopic(cabecalho.text, contexto)) continue;
      const raizes = raizesDoTema(rotulo, nucleo);
      if (raizes.length) itens.push({ site: item.site, dominio: item.page.domain, pagina: item.indice, rotulo, raizes, solta: rotulo.split(" ").length === 1 });
    }
  }

  /* Em quantos SITES cada raiz aparece: o tema é a raiz mais compartilhada do cabeçalho. */
  const sitesDaRaiz = new Map<string, Set<string>>();
  for (const item of itens) {
    for (const raiz of item.raizes) {
      const sites = sitesDaRaiz.get(raiz) || new Set<string>();
      sites.add(item.site);
      sitesDaRaiz.set(raiz, sites);
    }
  }
  const grupos = new Map<string, typeof itens>();
  /* 2026-10-08 · C5 · a palavra solta que nenhum outro site trata ("Carol") não diz tema. */
  for (const item of itens.filter(item => !item.solta || item.raizes.some(raiz => (sitesDaRaiz.get(raiz)?.size || 0) >= 2))) {
    const ancora = [...item.raizes].sort((a, b) =>
      (sitesDaRaiz.get(b)?.size || 0) - (sitesDaRaiz.get(a)?.size || 0) || b.length - a.length || a.localeCompare(b))[0];
    const grupo = grupos.get(ancora) || [];
    grupo.push(item);
    grupos.set(ancora, grupo);
  }

  const topicos = [...grupos.values()].map(grupo => {
    const sites = new Set(grupo.map(item => item.site));
    /* O rótulo é o cabeçalho de mais SITES (o menu repetido não ganha mais pelo número de páginas). */
    const contagem = new Map<string, { rotulo: string; sites: Set<string>; vezes: number }>();
    for (const item of grupo) {
      const chave = chaveDoRotulo(item.rotulo);
      const atual = contagem.get(chave) || { rotulo: item.rotulo, sites: new Set<string>(), vezes: 0 };
      atual.sites.add(item.site);
      atual.vezes += 1;
      contagem.set(chave, atual);
    }
    const rotulos = [...contagem.values()].sort((a, b) => b.sites.size - a.sites.size || b.vezes - a.vezes || a.rotulo.length - b.rotulo.length);
    const dominios = new Map<string, string>();
    for (const item of grupo) if (item.dominio && !dominios.has(item.site)) dominios.set(item.site, item.dominio);
    return {
      label: radarCompetitorTopicLabel(rotulos[0].rotulo),
      pages: sites.size,
      headings: rotulos.slice(0, 3).map(item => item.rotulo),
      domains: [...dominios.values()],
      primeira: Math.min(...grupo.map(item => item.pagina)),
      tamanho: grupo.length,
    };
  }).sort((a, b) => b.pages - a.pages || b.tamanho - a.tamanho || a.primeira - b.primeira);

  const sampleSize = daBase ? daBase.size : input.pages.length;
  const sampleDomains = new Set(input.basis
    ? input.basis.map(item => radarRegistrableDomain(item.domain || item.url)).filter(Boolean)
    : input.pages.map(siteDe).filter(Boolean)).size;
  return {
    topics: topicos.map((topico, indice) => ({
      id: `T${indice + 1}`, label: topico.label, pages: topico.pages, sampleSize, headings: topico.headings, domains: topico.domains,
    })),
    sampleSize,
    headingsRead: lidos,
    sampleDomains,
  };
}
