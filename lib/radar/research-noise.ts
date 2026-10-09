/**
 * ===== 2026-10-08 · O RUÍDO DE PESQUISA — régua pura (P1 da rodada dos 8 CSVs do Silo "Leads sem Tráfego Pago") =====
 *
 * Os oito CSVs "para escrever" do Silo saíram com a pesquisa cheia de coisa
 * que não é do artigo:
 *
 *   - "Citadas pelo mercado": aviso de cookie (cookiedatabase), selo e
 *     credenciamento (BBB, Fin, Govtech), consulta de CPF/CNPJ, e-MEC e
 *     autenticação de diploma, tutorial do W3C sobre texto alternativo, jogo de
 *     aposta hospedado num .gov.br ("jogo da fortuna tiger", "betano"), LAI e
 *     LGPD de rodapé e o portal da CVM num artigo sobre atrair cliente;
 *   - "Perguntas a responder": "Deseja receber e-mails…", cashback em compras
 *     num artigo para a clínica, "Como é o processo entre Pacientes e
 *     Psicólogo?" num artigo de dentista, rotatividade de funcionários,
 *     "…: conclusão", "E então, …?";
 *   - cabeçalhos de concorrente que são título de OUTRO post ("65 mensagens de
 *     Dia do Cliente…", "Reforma Tributária na prática: o que sua empresa
 *     precisa revisar agora", "Como fazer um pitch…? Guia para…"), cromo do site
 *     ("Populares", "NOSSOS TELEFONES", "50% OFF na implantação", "Prévia do
 *     ícone do site") e encerramento ("gostou de saber…", "tudo certo sobre…").
 *
 * Aqui só a RÉGUA: funções puras, sem I/O, que recebem o texto e o contexto do
 * artigo por parâmetro (núcleo, temas, público, domínio da página, domínios dos
 * concorrentes) e dizem se é ruído — e por quê, para teste e diagnóstico. Quem
 * monta a lista aplica. Vale para qualquer marca e assunto: nenhuma regra cita
 * a AdalbaPro, o Silo ou a clínica; o núcleo e o público é que mudam o que é
 * ruído (artigo SOBRE LGPD fica com a LGPD; artigo de loja fica com a loja).
 *
 * Não muda conceito, hash nem pacote: é leitura de apresentação.
 */

export type RadarResearchNoiseContext = {
  /** Keyword principal, complementares, Assunto e tópicos obrigatórios: o núcleo do artigo. */
  core?: ReadonlyArray<string | null | undefined>;
  /** Temas que o artigo trata (H2/H3 da estrutura, cobertura obrigatória): ampliam o "toca o tema". */
  topics?: ReadonlyArray<string | null | undefined>;
  /** O leitor do artigo e/ou o público da marca, em texto livre. */
  audience?: string | ReadonlyArray<string | null | undefined> | null;
  /** Domínio da página de onde veio o texto (autopromoção). */
  domain?: string | null;
  /** Domínios dos concorrentes lidos: as marcas deles (produto de terceiro, institucional do concorrente). */
  competitorDomains?: ReadonlyArray<string | null | undefined>;
};

/* ============================== normalização ============================== */

/* Caracteres invisíveis que vêm no texto extraído ("‌19 exemplos…" começa com U+200C). */
const INVISIVEIS = /[­​-‏⁠﻿]/g;

/** Sem acento, minúsculo, sem invisíveis; a pontuação fica (dois-pontos, "?", "%", "|"). */
const leve = (texto: string | null | undefined) => String(texto || "")
  .replace(INVISIVEIS, "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Só letras e números, separados por um espaço: a forma das réguas por palavra. */
const plano = (texto: string | null | undefined) => leve(texto).replace(/[^a-z0-9]+/g, " ").trim();

const juntar = (valor: string | ReadonlyArray<string | null | undefined> | null | undefined) =>
  (typeof valor === "string" ? [valor] : [...(valor || [])]).filter((item): item is string => Boolean(item)).join(" · ");

/* Palavras funcionais do português (3+ letras; as de 1 e 2 já caem pelo tamanho). */
const FUNCIONAIS = new Set([
  "aos", "das", "dos", "nas", "nos", "num", "numa", "uma", "umas", "uns", "para", "pra", "por", "pelo", "pela", "pelos", "pelas", "com",
  "sem", "que", "mas", "seu", "sua", "seus", "suas", "meu", "minha", "nosso", "nossa", "voce", "voces", "ele", "ela", "eles", "elas",
  "isso", "isto", "como", "qual", "quais", "quando", "onde", "porque", "quem", "nao", "sim", "mais", "menos", "muito", "muita", "ate",
  "entre", "sobre", "apos", "antes", "depois", "tambem", "ser", "ter", "estar", "esta", "este", "essa", "esse", "estes", "essas", "esses",
  "sao", "foi", "vai", "seja", "sejam", "tem", "tudo", "todo", "toda", "todos", "todas", "cada", "outro", "outra", "outros", "outras",
]);
/* Verbos e adjetivos que não dizem assunto: "Como ganhar dinheiro com IA" não toca "como ganhar um cliente". */
const GENERICAS = new Set([
  "fazer", "faz", "faca", "ganhar", "conseguir", "usar", "utilizar", "saber", "criar", "ver", "dar", "ficar", "deixar", "poder", "pode",
  "podem", "dever", "deve", "devo", "precisar", "precisa", "querer", "quer", "comecar", "aumentar", "melhorar", "ajudar", "ajuda", "novo",
  "nova", "novos", "novas", "melhor", "melhores", "dica", "dicas", "guia", "forma", "formas", "maneira", "maneiras", "passo", "passos",
  "estrategia", "estrategias", "exemplo", "exemplos", "importante", "principal", "principais", "certo", "certa", "ideal", "bom", "boa",
  "grande", "pequeno", "pequena", "empresa", "empresas", "negocio", "negocios", "pessoa", "pessoas", "coisa", "coisas", "vez", "vezes",
]);

/* Raiz conservadora (plural, gênero e "-ção/-ções"): "clientes" e "cliente" conversam; "internet" e "interno", não. */
function raiz(palavra: string): string {
  let r = palavra;
  if (r.length > 4 && r.endsWith("coes")) r = `${r.slice(0, -4)}c`;
  else if (r.length > 4 && r.endsWith("cao")) r = `${r.slice(0, -3)}c`;
  else if (r.length > 4 && r.endsWith("ais")) r = `${r.slice(0, -3)}al`;
  else if (r.length > 4 && r.endsWith("eis")) r = `${r.slice(0, -3)}el`;
  else if (r.length > 4 && r.endsWith("oes")) r = `${r.slice(0, -3)}o`;
  if (r.length > 4 && r.endsWith("s")) r = r.slice(0, -1);
  if (r.length > 4 && /[aeo]$/.test(r)) r = r.slice(0, -1);
  return r;
}

function raizesDeConteudo(texto: string): Set<string> {
  return new Set(plano(texto).split(" ")
    .filter(palavra => palavra.length >= 3 && !/^\d+$/.test(palavra) && !FUNCIONAIS.has(palavra) && !GENERICAS.has(palavra))
    .map(raiz));
}

/* ============================== domínio e marca ============================== */

/* Sufixos de dois níveis: "ibge.gov.br" e "cielo.com.br" são o site; "blog.cielo.com.br" é o mesmo site. */
const SUFIXO_DUPLO = new Set([
  "com.br", "net.br", "org.br", "gov.br", "edu.br", "art.br", "adv.br", "med.br", "ind.br", "blog.br", "eco.br", "eti.br", "inf.br",
  "jus.br", "leg.br", "mp.br", "tv.br", "app.br", "dev.br", "co.uk", "org.uk", "ac.uk", "gov.uk", "com.ar", "com.mx", "com.pt",
  "com.au", "com.co", "com.pe", "com.uy", "co.jp",
]);

/** 2026-10-08 · O site de um endereço ou host ("blog.cielo.com.br/x" → "cielo.com.br"): a unidade da recorrência por domínio. */
export function radarRegistrableDomain(endereco: string | null | undefined): string {
  const host = String(endereco || "").trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/^www\d*\./, "").replace(/\.$/, "");
  const partes = host.split(".").filter(Boolean);
  if (partes.length <= 2) return partes.join(".");
  return partes.slice(SUFIXO_DUPLO.has(partes.slice(-2).join(".")) ? -3 : -2).join(".");
}

/*
 * Plataforma de uso geral não é "o site do concorrente" nem "produto de
 * terceiro", mesmo quando um resultado da SERP mora nela: "Como atrair clientes
 * pelo Instagram?" é canal, não produto do concorrente.
 */
const PLATAFORMAS = new Set([
  "wikipedia.org", "youtube.com", "instagram.com", "facebook.com", "linkedin.com", "google.com", "google.com.br", "twitter.com", "x.com",
  "tiktok.com", "pinterest.com", "reddit.com", "medium.com", "wordpress.com", "blogspot.com", "apple.com", "microsoft.com", "amazon.com",
  "amazon.com.br", "whatsapp.com",
]);

const INSTITUCIONAIS = new Set(["gov", "edu", "jus", "mil", "leg", "mp", "def"]);
const SUFIXOS_DE_DOMINIO = new Set(["com", "br", "net", "org", "gov", "edu", "co", "io", "info", "biz", "app", "pt", "us", "uk", "es", "ar", "mx", "tv", "me", "ind", "adv", "med", "art"]);

/**
 * 2026-10-08 · A marca de um domínio: o nome antes do sufixo ("bagy" em
 * www.bagy.com.br). Nome curto (menos de 4 letras) não conta. Morava em
 * `competitor-topics.ts`, que a reexporta com a mesma assinatura.
 */
export function radarCompetitorBrandOf(dominio: string | null | undefined): string | null {
  const partes = leve(dominio).replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, "").split(".").filter(Boolean);
  /* 2026-10-08 (revisão) · domínio de órgão não tem marca: "saude" em saude.gov.br é o assunto da fonte, não autopromoção. */
  if (partes.some(parte => INSTITUCIONAIS.has(parte))) return null;
  while (partes.length > 1 && SUFIXOS_DE_DOMINIO.has(partes[partes.length - 1])) partes.pop();
  const marca = (partes[partes.length - 1] || "").replace(/[^a-z0-9]/g, "");
  return marca.length >= 4 ? marca : null;
}

/** 2026-10-08 · A marca aparece como palavra, ou como duas ou três palavras juntas ("Vetline Brasil" em vetlinebrasil.com.br). */
export function radarTextCitesBrand(texto: string | null | undefined, marca: string | null | undefined): boolean {
  if (!marca) return false;
  const palavras = plano(texto).split(" ").filter(Boolean);
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

/* ============================== réguas comuns ============================== */

/*
 * INGLÊS: palavras funcionais e de uso corrente que o português não usa.
 * "Why's it important to get new clients?", "Contact past customers" e
 * "Leverage public relations" saem; "Stories e Reels", "Guest post" e
 * "Marketing digital" ficam (estrangeirismo de uso corrente não é inglês).
 */
const INGLES = new Set([
  "the", "to", "of", "and", "is", "are", "it", "its", "how", "why", "what", "when", "where", "which", "who", "your", "you", "our", "we",
  "with", "for", "from", "get", "using", "can", "does", "should", "will", "about", "into", "this", "that", "these", "those", "an", "on",
  "at", "by", "be", "my", "their", "they", "new", "past", "important", "customers", "customer", "clients", "leverage", "public", "relations",
  "contact", "attract", "good", "more", "most", "best", "tips", "ways", "guide", "free", "now", "here", "read", "learn", "every", "day",
  "generate", "qualified", "leads", "business", "people", "make", "grow", "growth", "need", "know",
]);
const PORTUGUES = new Set([
  "de", "da", "do", "das", "dos", "para", "com", "que", "os", "as", "em", "no", "na", "nos", "nas", "como", "um", "uma", "e", "seu", "sua",
  "seus", "suas", "por", "pelo", "pela", "nao", "mais", "ao", "aos", "se", "ou", "qual", "quais", "porque", "quando", "onde", "isso",
  "este", "esta", "esse", "essa", "sobre", "sem", "entre", "ate", "tambem", "ja", "ser", "ter", "sao", "voce", "o",
]);

/** 2026-10-08 · O texto está em inglês (o artigo é em português do Brasil). */
export function radarResearchIsEnglish(texto: string | null | undefined): boolean {
  const palavras = plano(texto).split(" ").filter(Boolean);
  const en = palavras.filter(palavra => INGLES.has(palavra)).length;
  const pt = palavras.filter(palavra => PORTUGUES.has(palavra)).length;
  return (en >= 2 && pt === 0) || (en >= 3 && en > pt * 2);
}

function tocaOTema(texto: string, contexto: RadarResearchNoiseContext, ignorar: ReadonlySet<string> = new Set()): boolean {
  const doTema = raizesDeConteudo(juntar([...(contexto.core || []), ...(contexto.topics || [])]));
  if (!doTema.size) return false;
  return [...raizesDeConteudo(texto)].some(item => !ignorar.has(item) && doTema.has(item));
}

/** 2026-10-08 · O texto toca o tema do artigo: divide uma raiz de conteúdo com o núcleo ou com os temas declarados. */
export const radarResearchTouchesTheme = (texto: string | null | undefined, contexto: RadarResearchNoiseContext = {}): boolean =>
  tocaOTema(String(texto || ""), contexto);

/*
 * OUTRA PROFISSÃO FORA DO PÚBLICO. A família de cada profissão; o público é a
 * família que o núcleo e o leitor nomeiam ("captação de pacientes dentista" →
 * odontologia). Público que diz "saúde" aceita as profissões de saúde. Sem
 * profissão nenhuma no núcleo e no leitor, não há como julgar: nada sai.
 */
const PROFISSOES: ReadonlyArray<{ familia: string; saude: boolean; termos: RegExp }> = [
  { familia: "odontologia", saude: true, termos: /\b(dentistas?|odontolog\w*|ortodont\w*|implantodont\w*)\b/ },
  { familia: "estetica", saude: true, termos: /\b(estetica|esteticas|esteticistas?|harmonizacao facial|biomedic\w* estet\w*)\b/ },
  { familia: "psicologia", saude: true, termos: /\b(psicolog\w*|psicoterap\w*|psicanalis\w*|censopsi)\b/ },
  { familia: "nutricao", saude: true, termos: /\b(nutricionistas?|nutricao)\b/ },
  { familia: "fisioterapia", saude: true, termos: /\b(fisioterap\w*|pilates)\b/ },
  { familia: "medicina", saude: true, termos: /\b(medicos?|medicas?|medicina|dermatolog\w*|cardiolog\w*|pediatras?|ginecolog\w*|oftalmolog\w*)\b/ },
  { familia: "veterinaria", saude: false, termos: /\b(veterinari\w*|pet ?shops?)\b/ },
  { familia: "direito", saude: false, termos: /\b(advogad\w*|advocacia|escritorios? de advocacia)\b/ },
  { familia: "contabilidade", saude: false, termos: /\b(contador\w*|contabil|contabeis|contabilidade)\b/ },
  { familia: "imobiliario", saude: false, termos: /\b(corretor\w* de imove\w*|imobiliari\w*)\b/ },
  { familia: "beleza", saude: false, termos: /\b(saloes? de beleza|cabeleireir\w*|barbearias?|manicures?)\b/ },
  { familia: "educacao fisica", saude: false, termos: /\b(personal trainers?|educador\w* fisic\w*)\b/ },
];
const familiasDe = (texto: string) => new Set(PROFISSOES.filter(item => item.termos.test(texto)).map(item => item.familia));
/*
 * 2026-10-08 (correção) · R9 · As palavras de público e de captação, que todo
 * nicho divide ("pacientes", "clientes", "marketing"): não provam que a
 * pergunta de outra profissão trata do assunto do artigo.
 */
const DE_PUBLICO_GERAL = new Set([
  "paciente", "pacientes", "cliente", "clientes", "clinica", "clinicas", "consultorio", "consultorios", "profissional", "profissionais",
  "lead", "leads", "captacao", "captar", "atrair", "atracao", "marketing", "processo", "atendimento", "agenda", "agendamento", "servico",
  "servicos", "negocio", "negocios", "empresa", "empresas", "trafego", "digital", "online", "internet", "redes", "sociais", "instagram",
].map(raiz));

/** 2026-10-08 · O texto fala de uma profissão que não é a do público do artigo ("Pacientes e Psicólogo" num artigo de dentista). */
export function radarResearchOtherProfession(texto: string | null | undefined, contexto: RadarResearchNoiseContext = {}): boolean {
  const noTexto = familiasDe(plano(texto));
  if (!noTexto.size) return false;
  const dePublico = plano(`${juntar(contexto.core)} ${juntar(contexto.audience)}`);
  const publico = familiasDe(dePublico);
  if (/\bsaude\b/.test(dePublico)) for (const item of PROFISSOES) if (item.saude) publico.add(item.familia);
  if (!publico.size) return false;
  if ([...noTexto].some(familia => publico.has(familia))) return false;
  /*
   * 2026-10-08 (correção) · R9 · A pergunta de outra profissão que trata do
   * ASSUNTO do núcleo é do leitor: "Dentista pode aplicar botox?" num artigo de
   * toxina botulínica e harmonização facial. Conta a palavra própria do núcleo
   * ("botox"), nunca a de público ("pacientes", "marketing").
   */
  const doNucleo = raizesDeConteudo(juntar(contexto.core));
  const doAssunto = [...raizesDeConteudo(String(texto || ""))].filter(item => !DE_PUBLICO_GERAL.has(item) && !familiasDe(item).size);
  return !doAssunto.some(item => doNucleo.has(item));
}

/*
 * ÁREA VIZINHA FORA DO TEMA: gestão de pessoas e tributário aparecem nas
 * páginas de quem vende software para empresa ("Alta rotatividade de
 * funcionários na clínica", "Reforma Tributária na prática"). Só ficam quando
 * o núcleo do artigo fala delas.
 */
const AREAS_VIZINHAS: ReadonlyArray<{ area: string; termos: RegExp }> = [
  { area: "gestão de pessoas", termos: /\b(rotatividade|turnover|demissa\w*|demitir|folha de pagamento|recursos humanos|rh|clima organizacional|salari\w*|reter talentos|retencao de talentos|contratacao de (funcionari|colaborador)\w*)\b/ },
  { area: "tributário", termos: /\b(reforma tributaria|tributac\w*|tributari\w*|impostos?|simples nacional|cnpj alfanumerico|nota fiscal)\b/ },
];

/** 2026-10-08 · A área vizinha (gestão de pessoas, tributário) que o texto trata e o núcleo não; null quando não há. */
export function radarResearchNeighborArea(texto: string | null | undefined, contexto: RadarResearchNoiseContext = {}): string | null {
  const t = plano(texto);
  const nucleo = plano(juntar(contexto.core));
  return AREAS_VIZINHAS.find(item => item.termos.test(t) && !item.termos.test(nucleo))?.area ?? null;
}

/*
 * LOJA E CONSUMO NUM ARTIGO QUE NÃO É DE LOJA NEM PARA O CONSUMIDOR. "Agora a
 * sua loja virtual" e "catálogo online" saem quando o núcleo não fala de loja,
 * produto, venda nem catálogo (a régua de C5, que morava em competitor-topics);
 * cupom, cashback e "compras nas marcas" saem quando o núcleo não fala deles e
 * o leitor não é o consumidor — "promoções para estética" escrito para a
 * clínica não responde "É possível ganhar cashback?".
 */
const DE_LOJA = /\b(?:lojas? (?:virtua\w*|online|on line|propria)|sua loja|lojas? de \w+|e ?commerce|catalogos? (?:online|on line|digita\w*|de produtos)|frete|checkout|carrinho|dropshipping|marketplace|instagram shopping)\b/;
const NUCLEO_DE_LOJA = /\b(?:lojas?|e ?commerce|catalogos?|produtos?|vend\w*|marketplace|dropshipping|shopping|frete)\b/;
const DE_CONSUMO = /\b(?:cashback|cupo(?:m|ns)|vale ?presente|oferta do dia|resgat\w+ (?:o |seu )?(?:cupom|desconto|cashback)|compras? (?:nas|em|online|pela internet))\b/;
const NUCLEO_DE_CONSUMO = /\b(?:cashback|cupo(?:m|ns)|vale ?presente)\b/;
const LEITOR_DE_NEGOCIO = /\b(?:responsave\w*|don[oa]s?|gestor\w*|gerente\w*|empreendedor\w*|empresari\w*|profissiona\w*|clinicas?|consultorios?|empresas?|negocios?|agencias?|lojistas?|equipes?|vendedor\w*)\b/;
const LEITOR_CONSUMIDOR = /\b(?:consumidor\w*|cliente final|compradora?s?|quem (?:quer|procura|busca|deseja) (?:fazer|comprar|economizar)|interessad\w* em (?:fazer|comprar))\b/;

/** 2026-10-08 · O leitor do artigo é o consumidor (e não quem tem o negócio). Sem leitor, não é. */
export function radarResearchIsConsumerArticle(contexto: RadarResearchNoiseContext = {}): boolean {
  const leitor = plano(juntar(contexto.audience));
  return LEITOR_CONSUMIDOR.test(leitor) && !LEITOR_DE_NEGOCIO.test(leitor);
}

/*
 * 2026-10-08 (correção) · F11 · No artigo de PROMOÇÃO (núcleo em promoção,
 * desconto ou oferta), vale-presente e oferta do dia são mecânicas que a
 * própria clínica usa: ficam. Continuam saindo as de consumidor — cupom a usar,
 * emitir ou resgatar, cashback, compras.
 */
const NUCLEO_DE_PROMOCAO = /\b(?:promoc\w*|descontos?|ofertas?|liquidac\w*|black friday)\b/;
const INSTRUCAO_DE_CONSUMIDOR = /\b(?:cashback|cupo(?:m|ns)|resgat\w+ (?:(?:o|a|seu|sua|um|uma) )*(?:cupom|cupons|desconto|cashback|vale)|compras? (?:nas|em|online|pela internet))\b/;

/** 2026-10-08 · Loja num artigo que não é de loja, ou cupom/cashback num artigo que não é para o consumidor. */
export function radarResearchStoreNoise(texto: string | null | undefined, contexto: RadarResearchNoiseContext = {}): boolean {
  const t = plano(texto);
  const nucleo = plano(juntar(contexto.core));
  if (DE_LOJA.test(t) && !NUCLEO_DE_LOJA.test(nucleo)) return true;
  const consumo = NUCLEO_DE_PROMOCAO.test(nucleo) ? INSTRUCAO_DE_CONSUMIDOR : DE_CONSUMO;
  return consumo.test(t) && !NUCLEO_DE_CONSUMO.test(nucleo) && !radarResearchIsConsumerArticle(contexto);
}

/* ============================== cromo do site ============================== */

/*
 * RÓTULO DE NAVEGAÇÃO, MENU E RODAPÉ — o cabeçalho INTEIRO é o rótulo
 * ("Populares", "Materiais Gratuitos", "CMO News", "NOSSOS TELEFONES"). Só o
 * rótulo inteiro: "Atendimento", "Parcerias" e "Hashtags" não estão aqui, e
 * "Recursos do Instagram" não é "Recursos".
 */
const NAVEGACAO = new RegExp(`^(?:${[
  "populares", "mais populares", "posts populares", "artigos populares", "servicos", "nossos servicos", "integracoes", "integracao",
  "recursos", "recursos populares", "outros recursos", "recursos gratuitos", "recursos legais", "materiais gratuitos", "materiais ricos",
  "ferramentas gratuitas", "ebooks gratuitos", "cursos gratuitos", "empresa", "a empresa", "sobre a empresa", "conteudo", "conteudos",
  "mais conteudo", "mais conteudos", "conteudos relacionados", "mais conteudos relacionados", "materias mais lidas", "mais lidas",
  "mais lidos", "mais acessados", "mais vistos", "ultimas noticias", "noticias", "cmo news", "cmo insights", "produto", "produtos",
  "solucoes", "nossas solucoes", "planos", "planos e precos", "precos", "contato", "contatos", "nossos telefones", "telefones",
  "endereco", "enderecos", "nossas unidades", "unidades", "institucional", "suporte", "ajuda", "central de ajuda", "carreiras",
  "trabalhe conosco", "imprensa", "blog", "home", "inicio", "menu", "login", "entrar", "categorias", "tags", "arquivos", "clientes",
  "nossos clientes", "parceiros", "nossos parceiros", "consulta", "links uteis", "mapa do site", "configuracoes da galeria",
  "previa do icone do site", "politica de privacidade", "termos de uso", "aviso de privacidade", "cookies",
  /*
   * 2026-10-09 · defeito 13: "Biblioteca de Marketing" era o primeiro tema do CSV
   * de "como atrair um cliente" ("7 de 11 sites") — o menu da biblioteca de
   * materiais de um site; "Informações" e "Exclusivo pra você" iam ao "Tratado
   * por 1 site só". Rótulo inteiro, como os outros: "Crie uma biblioteca de
   * conteúdos para a clínica" continua tema.
   */
  "biblioteca", "biblioteca de marketing", "biblioteca de vendas", "biblioteca de conteudo", "biblioteca de conteudos",
  "biblioteca de materiais", "biblioteca de recursos", "informacoes", "mais informacoes", "exclusivo pra voce", "exclusivo para voce",
].join("|")})$`);
/*
 * Mensagem de tela e o aviso de cookie, em qualquer lugar do cabeçalho. Do
 * cookie, só a categoria do aviso de consentimento ("Cookies de publicidade",
 * "Cookies necessários"): "O fim dos cookies de terceiros" é assunto de mídia paga.
 */
const MENSAGEM_DE_TELA = /\b(?:voce ganhou|ganhou um presente|nao va embora|agendamento (?:efetuado|realizado|confirmado)|mensagem enviada|enviad[oa] com sucesso|efetuad[oa] com sucesso|pagina nao encontrada|erro 404|cookies (?:necessarios|essenciais|funcionais|analiticos|de publicidade|de desempenho|de marketing|de preferencia\w*|estritamente necessarios)|(?:usamos|aceitar|gerenciar|politica de) cookies|preferencias de (?:cookies|privacidade)|gerenciar consentimento)\b/;
/* Newsletter e inscrição. */
const NEWSLETTER = /\b(?:newsletter|deseja receber|quer receber|receba (?:nossos|nossas|as|os|novidades|conteudos|dicas)|e ?mails? com (?:novos|novidades|conteudos)|conteudos exclusivos|inscreva se|cadastre se|assine (?:nossa|a nossa|o nosso)|junte se a mais de|agradecemos (?:a )?sua inscricao|inscricao (?:confirmada|realizada))\b/;
/* Chamada para ação no começo do cabeçalho. */
const CHAMADA = /^(?:saiba mais|leia mais|veja mais|clique aqui|confira (?:aqui|agora)|acesse (?:aqui|agora)|baixe (?:agora|gratis|o nosso|a nossa|nosso|nossa)|fale com (?:um|uma|nosso|nossa|a gente|o time|um especialista)|solicite (?:um|uma|seu|sua|o|a)|agende (?:uma|sua|seu) (?:demonstracao|demo|reuniao|conversa)|teste gratis|experimente (?:gratis|gratuitamente|agora)|comece (?:gratis|agora|ja)|quer (?:ver|aplicar|conhecer|testar|experimentar)|assista (?:a|ao) (?:um )?video|conheca (?:outros|outras|nossos|nossas|todos|todas|mais))\b/;
/* Menu de produto do concorrente: "Software de CRM de vendas completo", "Soluções de dados para…". */
const MENU_DE_PRODUTO = /^(?:softwares?|solucao|solucoes) (?:de|para|completo|completa|gratis|gratuit[oa])\b/;
/* Faixa de plano de assinatura: "Clínicas +3 profissionais", "Consultórios 1 a 2 profissionais". */
const FAIXA_DE_PLANO = /^(?:clinicas?|consultorios?|planos?|pacotes?)\b.*\b\d+ (?:a \d+ )?profissiona\w*\b/;
/* Unidade de tempo sozinha: "Semana 1 — 1º ao 10º dia", "Resumo de 30 dias". */
const SO_TEMPO = new Set(["semana", "semanas", "dia", "dias", "mes", "meses", "ano", "anos", "hora", "horas", "minuto", "minutos", "etapa", "fase", "modulo", "aula", "parte", "capitulo", "resumo", "periodo"]);
const LIGA_TEMPO = new Set(["de", "do", "da", "dos", "das", "ao", "aos", "a", "o", "e", "em", "no", "na", "por", "para", "ate", "com"]);

/** 2026-10-08 · Por que o cabeçalho é cromo do site (menu, rodapé, tela, banner, chamada); null quando não é. */
export function radarCompetitorHeadingChromeReason(cabecalho: string | null | undefined): string | null {
  const original = String(cabecalho || "").replace(INVISIVEIS, "").trim();
  const t = plano(original);
  if (!t) return "vazio";
  if (NAVEGACAO.test(t)) return "rótulo de navegação";
  if (MENSAGEM_DE_TELA.test(t)) return "mensagem de tela ou cookie";
  if (NEWSLETTER.test(t)) return "newsletter ou inscrição";
  if (CHAMADA.test(t)) return "chamada para ação";
  if (/\bproximo passo\b/.test(t) && t.split(" ").length <= 6) return "chamada para ação";
  if (/\b\d{1,3}\s?%\s?off\b/.test(leve(original))) return "banner de oferta";
  if (MENU_DE_PRODUTO.test(t)) return "menu de produto";
  if (FAIXA_DE_PLANO.test(t)) return "faixa de plano";
  /* Assinatura de depoimento: "Eduardo S. - Paciente". */
  if (/^\p{Lu}\p{Ll}+ \p{Lu}\.\s*[-–—]\s*\S/u.test(original)) return "assinatura de depoimento";
  const palavras = t.split(" ");
  if (palavras.some(palavra => SO_TEMPO.has(palavra)) && palavras.every(palavra => SO_TEMPO.has(palavra) || LIGA_TEMPO.has(palavra) || /^\d+o?$/.test(palavra))) {
    return "unidade de tempo sem assunto";
  }
  return null;
}

/** 2026-10-08 · O cabeçalho é cromo do site: menu, rodapé, mensagem de tela, banner, newsletter ou chamada. */
export const radarCompetitorHeadingIsChrome = (cabecalho: string | null | undefined): boolean => radarCompetitorHeadingChromeReason(cabecalho) !== null;

/* ============================== título de post ============================== */

/* "65 mensagens de…", "10 dicas eficazes…", "‌19 exemplos de e-mail…": número + substantivo de listicle no começo. */
const LISTICLE = /^\d{1,3} (?:\p{L}+ )?(?:dicas|estrategias|ideias|exemplos|mensagens|tecnicas|aplicacoes|formas|maneiras|passos|erros|motivos|razoes|tendencias|frases|sugestoes|segredos|truques|taticas|acoes|perguntas|coisas|ferramentas|melhores|principais|modelos|templates|beneficios|vantagens|cursos|livros|apps|aplicativos|sites)\b/u;
/* "… em 8 passos", "… em 5 minutos". */
const EM_N_PASSOS = /\bem \d{1,3} (?:passos|etapas|dicas|minutos|dias)\b/;
/* O subtítulo depois dos dois-pontos que só título de post tem. */
const SUBTITULO_DE_POST = /^(?:(?:as |os )?\d{1,3}\b|\+?\d{1,3}\s?%|(?:o |um )?(?:guia|tutorial|passo a passo|checklist|e ?book|template)\b|(?:saiba|veja|entenda|descubra|confira|aprenda|conheca) (?:como|o que|quais|tudo|mais|por que|onde|quando)\b|tudo (?:o que|sobre)\b|o que mudou\b|o que .{0,40}\bprecisa (?:saber|revisar|fazer|mudar)\b)/;
const E_COMO_DE_POST = /\be como (?:preparar|fazer|aplicar|usar|escolher|evitar|adaptar)\b/;
/*
 * 2026-10-08 (correção) · F4 · O subtítulo de post que abre por gerúndio
 * ("Campanha de Inbound: Acelerando a geração de leads…") ou por imperativo
 * ("Como conquistar clientes: olhe para os problemas, focalize soluções").
 * "X: qual escolher?" e "X: captação ativa ou passiva?" continuam seção.
 */
const SUBTITULO_NO_GERUNDIO = /^(?!quando\b)[a-z]{2,}(?:ando|endo|indo)\b/;
const SUBTITULO_NO_IMPERATIVO = /^(?:olhe|focalize|foque|aprenda|descubra|entenda|conheca|acelere|aumente|transforme|conquiste|use|utilize|faca|crie|evite|garanta|invista|comece|pare|mude|deixe|esqueca|mantenha|potencialize|otimize|alavanque|impulsione|turbine|domine|atraia|capte|ganhe|multiplique|encontre|siga|aplique|explore|prepare|planeje|monte|organize|melhore|venda|lucre|fidelize|encante|surpreenda)\b/;
/* Encerramento de página e referência ao próprio post ("esses exemplos", "nesta seleção"). */
const ENCERRAMENTO_NO_COMECO = /^(?:afinal )?(?:conclusao|conclusoes|consideracoes finais|para finalizar|finalizando|resumindo|em resumo|concluindo)\b/;
const ENCERRAMENTO = /\b(?:gostou de saber|gostou d[oa] (?:artigo|conteudo|post|texto)|tudo certo sobre|chegamos ao fim|agora (?:que )?voce (?:ja )?sabe|ficou com (?:alguma )?duvida|o que voce achou)\b/;
const SOBRE_O_PROPRIO_POST = /\b(?:esses|estes|nesta|neste|desta|deste|nessa|nesse|dessa|desse) (?:exemplos|dicas|estrategias|ideias|selecao|lista|artigo|post|conteudo|texto|guia|material|topicos)\b/;
/* Manchete de outra página: frase longa, sem pergunta, que não toca o tema ("YouTube amplia presença na TV e…"). */
const PALAVRAS_DE_MANCHETE = 11;

/** 2026-10-08 · Por que o texto é encerramento de página (ou fala do próprio post); null quando não é. */
function motivoDeEncerramento(texto: string): string | null {
  const l = leve(texto);
  const t = plano(texto);
  if (ENCERRAMENTO_NO_COMECO.test(t) || /:\s*(?:conclusao|consideracoes finais|resumo)\b/.test(l)) return "encerramento";
  if (ENCERRAMENTO.test(t)) return "encerramento";
  if (/^e (?:entao|ai)\s*,/.test(l)) return "encerramento";
  if (SOBRE_O_PROPRIO_POST.test(t)) return "fala do próprio post";
  return null;
}

/**
 * 2026-10-08 · Por que o cabeçalho de concorrente é título de post (de outra
 * página, de card de relacionados ou da própria página), encerramento,
 * autopromoção ou inglês — e não seção nem tema; null quando não é.
 *
 * Contexto: `core` (o "Guia" e a manchete dependem do núcleo), `domain` (a
 * marca do domínio da página, para a autopromoção).
 */
export function radarCompetitorHeadingPostTitleReason(cabecalho: string | null | undefined, contexto: RadarResearchNoiseContext = {}): string | null {
  const original = String(cabecalho || "").replace(INVISIVEIS, "").replace(/\s+/g, " ").trim();
  if (!original) return null;
  const l = leve(original);
  const t = plano(original);
  const nucleo = plano(juntar(contexto.core));
  if (LISTICLE.test(t)) return "título de listicle";
  if (EM_N_PASSOS.test(t)) return "título de listicle";
  if (/\bguia\b/.test(t) && !/\bguia\b/.test(nucleo)) return "guia";
  if (/\bsaiba mais\b/.test(t)) return "chamada";
  if (/\s\|\s/.test(original)) return "título de página";
  /* Pergunta seguida de outra frase: "Como fazer um pitch…? Guia para…", "É paciente? Atenção!". */
  if (/\?\s*["“”']?\s*\p{Lu}/u.test(original.replace(/\?\s*$/, ""))) return "título de post";
  const doisPontos = l.indexOf(":");
  if (doisPontos > 0) {
    const antes = l.slice(0, doisPontos).trim();
    const depois = l.slice(doisPontos + 1).trim();
    if (SUBTITULO_DE_POST.test(depois) || E_COMO_DE_POST.test(depois)) return "título de post";
    if (antes.split(" ").length >= 2 && (SUBTITULO_NO_GERUNDIO.test(depois) || SUBTITULO_NO_IMPERATIVO.test(depois))) return "título de post";
    if (/\bna pratica$/.test(antes) && depois.split(" ").length >= 3) return "título de post";
  }
  const encerramento = motivoDeEncerramento(original);
  if (encerramento) return encerramento;
  const marca = radarCompetitorBrandOf(contexto.domain);
  if (marca && radarTextCitesBrand(original, marca) && !radarTextCitesBrand(nucleo, marca)) return "autopromoção";
  if (radarResearchIsEnglish(original)) return "inglês";
  if (!original.includes("?") && t.split(" ").length >= PALAVRAS_DE_MANCHETE && (contexto.core || []).some(Boolean) && !radarResearchTouchesTheme(original, contexto)) {
    return "manchete de outra página";
  }
  return null;
}

/** 2026-10-08 · O cabeçalho de concorrente é título de post, encerramento, autopromoção ou inglês: sai da estrutura e dos temas. */
export const radarCompetitorHeadingIsPostTitle = (cabecalho: string | null | undefined, contexto: RadarResearchNoiseContext = {}): boolean =>
  radarCompetitorHeadingPostTitleReason(cabecalho, contexto) !== null;

/* ============================== perguntas do leitor ============================== */

/*
 * 2026-10-08 (correção) · F9 · A FAMÍLIA DA SUPERSTIÇÃO: o PAA de "atrair
 * clientes" traz "Qual é a oração poderosa para chamar clientes?" e "O que é
 * bom para chamar freguês?"; as buscas relacionadas, "Simpatias para atrair
 * clientes" e "Atrair clientes urgente". Desligada quando o núcleo fala dela.
 */
const SUPERSTICAO = /\b(?:simpatias?|oracao|oracoes|reza|rezas|benzimento|benzer|feitico|feiticos|mandinga|patua|amuleto|lei da atracao|sal grosso|banho de (?:sal|arruda|canela|ervas)|o que e bom para (?:chamar|atrair)|chamar fregues\w*|(?:atrair|chamar) \w+(?: \w+)? urgente)\b/;

/**
 * 2026-10-08 · Por que a pergunta não é do leitor deste artigo; null quando é.
 *
 * Sai: newsletter e chamada, inglês, encerramento, título de post, loja ou
 * consumo num artigo que não é de loja nem para o consumidor, outra profissão
 * fora do público, área vizinha fora do tema (gestão de pessoas, tributário) e
 * pergunta sobre produto de concorrente (a marca de um domínio lido que o
 * núcleo não cita). Fica a dúvida de verdade: "O que fazer para atrair
 * clientes?", "Como gerar leads qualificados", "Qual a diferença entre
 * tráfego orgânico e pago?".
 */
export function radarReaderQuestionNoiseReason(pergunta: string | null | undefined, contexto: RadarResearchNoiseContext = {}): string | null {
  const original = String(pergunta || "").replace(INVISIVEIS, "").replace(/\s+/g, " ").trim();
  const t = plano(original);
  if (!t) return "vazia";
  if (NEWSLETTER.test(t)) return "newsletter ou inscrição";
  if (CHAMADA.test(t)) return "chamada para ação";
  if (radarResearchIsEnglish(original)) return "inglês";
  const encerramento = motivoDeEncerramento(original);
  if (encerramento) return encerramento;
  if (radarResearchStoreNoise(original, contexto)) return "loja ou consumo fora do leitor";
  if (radarResearchOtherProfession(original, contexto)) return "outra profissão";
  const area = radarResearchNeighborArea(original, contexto);
  if (area) return `fora do tema (${area})`;
  /* 2026-10-08 (correção) · F9 · superstição ("oração poderosa para chamar clientes", "lei da atração") não é dúvida de quem tem negócio. */
  if (SUPERSTICAO.test(t) && !SUPERSTICAO.test(plano(juntar(contexto.core)))) return "superstição";
  const nucleo = juntar(contexto.core);
  const marcas = [...new Set((contexto.competitorDomains || [])
    .filter(item => item && !PLATAFORMAS.has(radarRegistrableDomain(item)))
    .map(radarCompetitorBrandOf).filter((item): item is string => Boolean(item)))];
  if (marcas.some(marca => radarTextCitesBrand(original, marca) && !radarTextCitesBrand(nucleo, marca))) return "produto de terceiro";
  const titulo = radarCompetitorHeadingPostTitleReason(original, { core: contexto.core });
  if (titulo === "título de listicle" || titulo === "título de post" || titulo === "guia") return titulo;
  return null;
}

/** 2026-10-08 · A pergunta não é do leitor deste artigo (ver `radarReaderQuestionNoiseReason`). */
export const radarReaderQuestionIsNoise = (pergunta: string | null | undefined, contexto: RadarResearchNoiseContext = {}): boolean =>
  radarReaderQuestionNoiseReason(pergunta, contexto) !== null;

/* ============================== fontes citadas pelo mercado ============================== */

export type RadarMarketCitation = {
  /** A âncora com que a página citou (ou o título). */
  title?: string | null;
  url: string;
  domain?: string | null;
  /** A classe observada ("domínio oficial ou regulador", "domínio educacional ou institucional"…). */
  authorityClass?: string | null;
  /** As seções da página concorrente em que a citação aparece. */
  supports?: ReadonlyArray<string | null | undefined>;
};

/*
 * Cada régua com o que no núcleo a desliga: artigo sobre cookie fica com o
 * cookie; sobre LGPD, com a LGPD; sobre diploma, com o e-MEC.
 */
const CITACAO_DE_RODAPE: ReadonlyArray<{ motivo: string; termos: RegExp; nucleo: RegExp | null }> = [
  { motivo: "cookie ou consentimento", termos: /\b(?:cookies?|cookiedatabase|consentimento|consent|tcf|gdpr|leia mais sobre esses objetivos|politica de privacidade|privacy)\b/, nucleo: /\b(?:cookies?|consentimento|privacidade|lgpd)\b/ },
  { motivo: "selo ou credenciamento", termos: /\b(?:selos?|credenciamento|bbb|reclame ?aqui|site (?:blindado|seguro)|antifraude)\b/, nucleo: /\b(?:selos?|certificac\w*|credenciamento|reputacao)\b/ },
  /* 2026-10-09 (correção · casos-reais-F10) · "SPC Brasil" em duas palavras, Serasa e Boa Vista (o CSV real de captar citava a carta do SPC). */
  { motivo: "consulta de CPF ou CNPJ", termos: /\b(?:cpf|cnpj|pessoa (?:fisica|juridica)|spcbrasil|spc brasil|serasa|boa vista scpc)\b/, nucleo: /\b(?:cpf|cnpj|credito|inadimplen\w*)\b/ },
  { motivo: "diploma ou e-MEC", termos: /\b(?:e ?mec|emec|diplomas?|mentorweb)\b/, nucleo: /\b(?:diplomas?|faculdade\w*|graduac\w*|curso superior|ensino superior)\b/ },
  { motivo: "tutorial técnico do W3C", termos: /\b(?:w3c|w3|wai|abrir em uma nova aba)\b/, nucleo: /\b(?:acessibilidade|html|texto alternativo|alt text)\b/ },
  { motivo: "aposta ou jogo", termos: /\b(?:apostas?|betano|bet365|bet|cassino|casino|slots?|fortune tiger|fortuna tiger|tigrinho|jogo do tigre|jogo da fortuna|roleta|blaze|games)\b/, nucleo: /\b(?:apostas?|jogos?|cassino)\b/ },
  { motivo: "lei de rodapé", termos: /\b(?:lai|lgpd|lei de acesso a informacao|lei geral de protecao de dados|marco civil|l12527|l13709\w*|l12965)\b/, nucleo: /\b(?:lgpd|dados pessoais|privacidade|acesso a informacao|transparencia|marco civil)\b/ },
  /* 2026-10-09 (correção · casos-reais-F10) · a tela de login ou de controle de acesso ("/spc/controleacesso/autenticacao/entry.action") não é fonte. */
  { motivo: "página de login ou de acesso", termos: /\b(?:controleacesso|controle de acesso|autenticacao|login|logon|signin|sign in|minha conta|area do cliente|area restrita)\b/, nucleo: /\b(?:login|autenticacao|senha|area do cliente|seguranca da conta)\b/ },
];
/* Página institucional (sobre, contato, termos) — de quem for. */
const PAGINA_INSTITUCIONAL = /\b(?:sobre nos|quem somos|trabalhe conosco|fale conosco|termos de uso|central de ajuda|nossa historia|institucional)\b/;
const CAMINHO_INSTITUCIONAL = /^\/(?:sobre|sobre-nos|quem-somos|institucional|about|about-us|contato|contact|privacidade|privacy|termos|terms|carreiras|careers)(?:\/|$)/;
/* "Oficial ou regulador": a classe observada, ou o sufixo do domínio. */
const CLASSE_OFICIAL = /\b(?:oficial|regulador|governo|government)\b/;
const DOMINIO_OFICIAL = /(?:^|\.)(?:gov|jus|leg|mp|mil)(?:\.|$)/;
/*
 * Palavras de serviço do portal, que não dizem o assunto da fonte oficial:
 * "Atendimento CVM" (/canais_atendimento/consultas-reclamacoes-denuncias) não
 * toca o "atendimento" de um artigo sobre atrair cliente.
 */
const SERVICO_DO_PORTAL = new Set([
  "atendimento", "canais", "consultas", "reclamacoes", "denuncias", "ouvidoria", "noticias", "releases", "agencia", "sala", "imprensa",
  "portal", "servicos", "assuntos", "acesso", "informacao", "institucional", "contato", "perguntas", "frequentes", "index", "php", "htm",
  "html", "aspx",
].map(raiz));

function partesDaUrl(url: string): { host: string; caminho: string } {
  try {
    const endereco = new URL(url);
    let caminho = endereco.pathname;
    try { caminho = decodeURIComponent(caminho); } catch { /* caminho com % solto: o texto serve. */ }
    return { host: endereco.hostname.toLowerCase(), caminho };
  } catch {
    return { host: "", caminho: url };
  }
}

/**
 * 2026-10-08 · Por que a fonte citada pelo mercado não serve a este artigo;
 * null quando serve.
 *
 * Sai: cookie, selo e credenciamento, CPF/CNPJ, diploma e e-MEC, tutorial do
 * W3C, aposta, lei de rodapé (LAI, LGPD) fora do tema, página institucional e o
 * próprio site de um concorrente lido, outra profissão fora do público e área
 * vizinha. Domínio oficial (.gov, .jus…) sozinho não basta: o assunto da
 * citação — âncora, caminho do endereço e seções em que aparece — tem de tocar
 * o núcleo ou os temas do artigo. "odontologia estética" (cfo.org.br) num
 * artigo de dentista fica; o portal da CVM num artigo sobre atrair cliente sai.
 */
export function radarMarketCitationNoiseReason(citacao: RadarMarketCitation, contexto: RadarResearchNoiseContext = {}): string | null {
  const { host, caminho } = partesDaUrl(citacao.url || "");
  const dominio = leve(citacao.domain || host);
  const assunto = [citacao.title || "", caminho.replace(/[/_.-]+/g, " "), ...(citacao.supports || [])].join(" · ");
  const tudo = plano(`${assunto} ${dominio}`);
  const nucleo = plano(`${juntar(contexto.core)} ${juntar(contexto.topics)}`);
  for (const regra of CITACAO_DE_RODAPE) {
    if (regra.termos.test(tudo) && !(regra.nucleo && regra.nucleo.test(nucleo))) return regra.motivo;
  }
  if (PAGINA_INSTITUCIONAL.test(plano(citacao.title)) || CAMINHO_INSTITUCIONAL.test(caminho.toLowerCase())) return "página institucional";
  const marca = radarCompetitorBrandOf(dominio);
  const site = radarRegistrableDomain(dominio);
  const concorrentes = (contexto.competitorDomains || []).filter((item): item is string => Boolean(item));
  /*
   * 2026-10-08 (correção) · R6 · Órgão oficial, sociedade, associação e
   * universidade que ranqueiam na SERP continuam fonte: a Anvisa no gov.br e a
   * SBD saíam como "site do próprio concorrente" só porque o domínio também
   * estava entre os resultados. O que sai é o site comercial do concorrente
   * (ferramenta, produto); o oficial ainda passa pela régua do tema, abaixo.
   */
  const deOrgaoOuEntidade = DOMINIO_OFICIAL.test(dominio.replace(/^www\./, "")) || /(?:^|\.)(?:org|edu|ac)(?:\.[a-z]{2})?$/.test(site);
  if (!PLATAFORMAS.has(site) && !deOrgaoOuEntidade && concorrentes.some(item => radarRegistrableDomain(item) === site || (marca && radarCompetitorBrandOf(item) === marca))) {
    return "site do próprio concorrente";
  }
  if (radarResearchOtherProfession(assunto, contexto)) return "outra profissão";
  const area = radarResearchNeighborArea(assunto, contexto);
  if (area) return `fora do tema (${area})`;
  const oficial = CLASSE_OFICIAL.test(plano(citacao.authorityClass)) || DOMINIO_OFICIAL.test(dominio.replace(/^www\./, ""));
  if (oficial) {
    const doOrgao = assuntoDoOficial(citacao, caminho, assunto);
    const familias = familiasDe(plano(doOrgao));
    const publico = familiasDe(plano(`${juntar(contexto.core)} ${juntar(contexto.audience)}`));
    const daProfissao = [...familias].some(familia => publico.has(familia));
    if (!daProfissao && !tocaOTema(doOrgao, contexto, SERVICO_DO_PORTAL)) return "oficial fora do tema";
  }
  return null;
}

/*
 * ===== 2026-10-09 · O ASSUNTO DA FONTE OFICIAL É O DELA (defeito 13 dos 8 CSVs do Silo) =====
 *
 * O CSV real de "como atrair um cliente" ainda listava "CVM —
 * https://www.gov.br/cvm/pt-br" e "Atendimento CVM — …/canais_atendimento/
 * consultas-reclamacoes-denuncias" como citadas pelo mercado. A âncora e o
 * caminho diziam o órgão e o balcão do portal; quem "tocava o tema" era a
 * SEÇÃO do concorrente em que o link aparecia ("Como atrair clientes") — e a
 * seção do concorrente toca o tema sempre, porque a página é sobre ele.
 *
 * O assunto da fonte oficial é o que ELA diz: a âncora e o caminho do
 * endereço. A seção do concorrente só decide quando âncora e caminho não dizem
 * assunto nenhum: âncora "clique aqui" no endereço raiz do portal, ou o artigo
 * científico citado pelo domínio ("pmc.ncbi.nlm.nih.gov" →
 * /articles/PMC9311318/), que só a seção diz do que trata. Não contam como
 * assunto: palavra de serviço do portal ("atendimento", "canais",
 * "consultas"), de link ("clique", "aqui", "acesse"), de endereço ("articles",
 * "index", "pt", "br"), os pedaços do próprio domínio e o identificador com
 * número.
 */
const DE_LINK = new Set(["clique", "aqui", "acesse", "acessar", "link", "links", "site", "pagina", "saiba", "veja", "confira", "leia", "fonte", "fontes", "www", "gov", "http", "https"].map(raiz));
const DE_ENDERECO = new Set([
  "articles", "article", "artigo", "artigos", "post", "posts", "pagina", "paginas", "page", "pages", "index", "view", "abstract", "full", "pdf",
  "doc", "docs", "download", "downloads", "arquivo", "arquivos", "content", "conteudo", "conteudos", "html", "htm", "php", "aspx", "jsp",
].map(raiz));

/*
 * 2026-10-09 (correção · suites-R4) · LEI, RESOLUÇÃO, RDC, CÓDIGO E MANUAL NOMEIAM O
 * INSTRUMENTO, NÃO O ASSUNTO DO ARTIGO. "Código de Defesa do Consumidor" numa
 * seção "Cuidados legais nas promoções de estética", "RDC nº 96/2008" em "Regras
 * de publicidade…" e "Resolução CFM 2.336/2023" em "O que o CFM permite na
 * publicidade médica" saíam como "oficial fora do tema": a âncora falava do
 * instrumento e decidia sozinha. A fonte regulatória que nomeia o instrumento
 * volta à régua de antes (âncora, caminho E a seção em que o mercado a cita);
 * a home do órgão sem instrumento ("CVM", "Atendimento CVM") continua pela
 * âncora e sai.
 */
const INSTRUMENTO_NORMATIVO = /\b(?:lei|leis|resolucao|resolucoes|rdc|portaria|decreto|codigo|norma|normas|normativa|instrucao normativa|manual|cartilha|guia|nota tecnica|regulamento|estatuto|ccivil)\b/;

function assuntoDoOficial(citacao: RadarMarketCitation, caminho: string, comAsSecoes: string): string {
  const proprio = [citacao.title || "", caminho.replace(/[/_.-]+/g, " ")].join(" · ");
  if (INSTRUMENTO_NORMATIVO.test(plano(proprio))) return comAsSecoes;
  const doDominio = new Set(plano(`${partesDaUrl(citacao.url || "").host} ${citacao.domain || ""}`).split(" ").filter(Boolean).map(raiz));
  const dizAssunto = [...raizesDeConteudo(proprio)]
    .some(item => !SERVICO_DO_PORTAL.has(item) && !DE_LINK.has(item) && !DE_ENDERECO.has(item) && !doDominio.has(item) && !/\d/.test(item));
  return dizAssunto ? proprio : comAsSecoes;
}

/** 2026-10-08 · A fonte citada pelo mercado não serve a este artigo (ver `radarMarketCitationNoiseReason`). */
export const radarMarketCitationIsNoise = (citacao: RadarMarketCitation, contexto: RadarResearchNoiseContext = {}): boolean =>
  radarMarketCitationNoiseReason(citacao, contexto) !== null;
