import type { RadarWritingExportRow } from "./portable-writing-export.ts";

/**
 * ===== 2026-10-14 · F6 · O MATERIAL NOVO DO CSV "PARA ESCREVER", PARA O REDATOR E O VÍDEO =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §18.1,
 * fase F6 e "Redator lê o material novo". Autorização do dono (2026-10-14): "pode
 * sim" — o Redator e o CSV de vídeo passam a ler o que até aqui só chegava pelo
 * CSV de escrita:
 *
 *   - a análise competitiva (ângulo, base, só os melhores, ganho de informação,
 *     SEO antigo a não copiar, até 4 perguntas que valem resposta, termos para
 *     variar a keyword) — a coluna cobrir_e_superar;
 *   - o diferencial da marca e o fechamento em 4 tempos (dor → mudança →
 *     facilidade → diagnóstico, o CTA único) — a coluna estrutura;
 *   - a malha do Silo e a trilha "Continue no Silo" (L e T, aplicadas na leitura,
 *     D6) — a coluna links_internos;
 *   - as fontes externas de autoridade verificadas (X) e as afirmações de saúde
 *     sem fonte — a coluna fontes_e_especialista;
 *   - as regras de título e keyword da F1 (K1–K9) — a coluna titulo_e_seo e o
 *     bloco "Voz e SEO pela SERP" da estrutura.
 *
 * O MESMO NÚCLEO, SEM MONTAGEM PARALELA. Este módulo não decide nada: ele lê a
 * LINHA que `buildRadarWritingExportArticle` montou para o CSV (a `uncutRow`, a
 * mesma antes do teto de planilha) e separa os blocos pelas linhas que o CSV já
 * escreve. O que o CSV diz é o que o Redator e o vídeo leem, palavra por palavra;
 * mudar o texto de uma linha do CSV muda aqui junto (os testes do caso real
 * travam os rótulos).
 *
 * Domínio puro: sem banco, sem rede, sem IA.
 */

/** A versão do material (entra na resposta do MCP e no painel). */
export const RADAR_WRITING_MATERIAL_VERSION = "2026-10-14";

/** Um item do checklist: um link interno (L no corpo, T na trilha) ou uma fonte externa de autoridade (X). */
export type RadarWritingMaterialItem = {
  /** "L1", "T2", "X1": o mesmo id do CSV. */
  id: string;
  kind: "corpo" | "trilha" | "fonte";
  /** A instrução inteira, como o CSV a escreve. */
  line: string;
  /** O destino do link ou o endereço da fonte; null quando o CSV não dá endereço. */
  url: string | null;
  /** O destino ("Pilar \"leads qualificados\"") ou a entidade da fonte. */
  label: string | null;
  /** A seção onde o item entra, quando o CSV a diz. */
  section: string | null;
  /** Só nos links: o destino já está no ar (com destino novo, a âncora fica como texto simples até ele ir ao ar). */
  published?: boolean;
};

export type RadarWritingMaterial = {
  version: typeof RADAR_WRITING_MATERIAL_VERSION;
  /** De onde o material sai: a linha do CSV "Para escrever" do artigo, pelo mesmo núcleo. */
  source: "csv-para-escrever";
  /** O ângulo de diferenciação do artigo. */
  angle: string | null;
  /** A coluna cobrir_e_superar, linha a linha: ângulo, os 4 blocos, as perguntas, os termos para variar, o "Não cobrir". */
  competitive: string[];
  /** O diferencial da marca (planta organizada nas regras 2026-10-14b ou depois) e os sinais de autoridade local. */
  brandEdge: string[];
  /** O fechamento em 4 tempos e o CTA único (o diagnóstico). */
  closing: string[];
  /** As regras de título e keyword (K1–K9) que valem para este artigo. */
  titleAndKeyword: string[];
  /** As regras dos links (cabeçalho, malha do Silo, trilha). */
  linkRules: string[];
  /** Os links internos do corpo (L) e da trilha "Continue no Silo" (T). */
  links: RadarWritingMaterialItem[];
  /** As regras das fontes externas de autoridade (faixa no corpo, âncora no nome da entidade). */
  authorityRules: string[];
  /** As fontes de autoridade verificadas que viram link (X). */
  authority: RadarWritingMaterialItem[];
  /** As fontes que ficam só como referência, sem link. */
  authorityReferences: string[];
  /** As afirmações de saúde sem fonte verificada (YMYL): não afirmar como fato. */
  ymylWithoutSource: string[];
};

const linhasDe = (celula: string | null | undefined): string[] =>
  String(celula ?? "").replace(/^'/, "").split("\n").map(linha => linha.trimEnd());

/* O bloco que começa na linha que casa e vai até a primeira linha em branco. */
function blocoDesde(linhas: readonly string[], abre: RegExp): string[] {
  const inicio = linhas.findIndex(linha => abre.test(linha));
  if (inicio < 0) return [];
  const bloco: string[] = [];
  for (const linha of linhas.slice(inicio)) {
    if (!linha.trim()) break;
    bloco.push(linha);
  }
  return bloco;
}

const comecaCom = (linhas: readonly string[], ...prefixos: string[]): string[] =>
  linhas.filter(linha => prefixos.some(prefixo => linha.startsWith(prefixo)));

/* As partes de uma linha de link: "L1 · âncora: … → Pilar "x" → https://… (situação) · onde: seção "…"". */
function itemDeLink(linha: string, kind: "corpo" | "trilha"): RadarWritingMaterialItem {
  const id = linha.match(/^([LT]\d+) · /)?.[1] ?? "";
  const partes = linha.split(" → ");
  const url = partes.slice(1).map(parte => parte.match(/^(https?:\/\/[^\s)]+)/)?.[1] ?? null).find(Boolean) ?? null;
  const destino = partes[1] ?? "";
  const label = destino.replace(/ \((?:[^()]|\([^()]*\))*\)(?: · .*)?$/, "").replace(/ · .*$/, "").trim() || null;
  const section = linha.match(/· onde: seção "([^"]+)"/)?.[1] ?? null;
  return { id, kind, line: linha, url, label, section, published: /\(publicado\)/.test(linha) };
}

/* As partes de uma linha de fonte: "- X1 · Entidade (tipo) · https://… · sustenta "…" · âncora …: "…" · na seção "…"". */
function itemDeFonte(linha: string): RadarWritingMaterialItem {
  const sem = linha.replace(/^- /, "");
  const id = sem.match(/^(X\d+) · /)?.[1] ?? "";
  const url = sem.match(/(https?:\/\/[^\s)]+)/)?.[1] ?? null;
  const entidade = sem.split(" · ")[1] ?? "";
  const label = entidade.replace(/ \([^()]*\)$/, "").trim() || null;
  const section = sem.match(/(?:na seção|seção sugerida:) "([^"]+)"/)?.[1] ?? null;
  return { id, kind: "fonte", line: sem, url, label, section };
}

/**
 * O MATERIAL DE UM ARTIGO, pela linha do CSV. `null` sem linha (artigo sem
 * artigo-modelo, que o CSV também não monta) ou quando a linha é só de
 * identidade (investigação feita para vídeo).
 */
export function radarWritingMaterialOf(linha: RadarWritingExportRow | null | undefined): RadarWritingMaterial | null {
  if (!linha || !String(linha.estrutura || "").trim()) return null;
  const cobrir = linhasDe(linha.cobrir_e_superar).filter(item => item.trim());
  const estrutura = linhasDe(linha.estrutura);
  const titulo = linhasDe(linha.titulo_e_seo).filter(item => item.trim());
  const links = linhasDe(linha.links_internos).filter(item => item.trim());
  const fontes = linhasDe(linha.fontes_e_especialista);

  const angulo = cobrir.find(item => item.startsWith("Ângulo deste artigo:"))?.replace(/^Ângulo deste artigo:\s*/, "")
    || linhasDe(linha.promessa_e_leitor).find(item => item.startsWith("Ângulo:"))?.replace(/^Ângulo:\s*/, "")
    || null;

  /* O fechamento: o bloco dos 4 campos (planta nova) ou a virada gravada com a linha dos 4 tempos do bloco de voz; depois o CTA. */
  const quatroCampos = blocoDesde(estrutura, /^Fechamento em 4 tempos \(/);
  const fechamento = [
    ...(quatroCampos.length ? quatroCampos : [...comecaCom(estrutura, "Fechamento: "), ...comecaCom(estrutura, "- Fechamento em 4 tempos:")]),
    ...comecaCom(estrutura, "Da página publicada, entra no fechamento"),
    ...comecaCom(estrutura, "CTA (a única chamada)", "CTA: ", "- Oferta de diagnóstico da Skill", "Fala aprovada do especialista"),
  ];

  /* As fontes de autoridade: a regra, os X que viram link, as referências e as afirmações de saúde sem fonte. */
  const regrasDasFontes = comecaCom(fontes, "Links externos de autoridade", "Fontes externas de autoridade");
  const linhasX = fontes.filter(item => /^- X\d+ · /.test(item));
  const referencias = linhasX.filter(item => / — /.test(item) && !/ · sustenta "/.test(item)).map(item => item.replace(/^- /, ""));
  const linkaveis = linhasX.filter(item => / · sustenta "/.test(item));
  const ymyl = comecaCom(fontes, "Afirmações de saúde sem fonte verificada");

  return {
    version: RADAR_WRITING_MATERIAL_VERSION,
    source: "csv-para-escrever",
    angle: angulo,
    competitive: cobrir,
    brandEdge: [...blocoDesde(estrutura, /^Diferencial da marca \(/), ...comecaCom(estrutura, "- Autoridade local:")],
    closing: fechamento,
    titleAndKeyword: [
      ...titulo.filter(item => !/^(?:H1|Alternativas|SEO title|Meta description):/.test(item)),
      ...comecaCom(estrutura, "- Abertura (K5)", "- H2 sem keyword no começo (K6)", "- A keyword principal está em", "- Os H2 \"", "- Keyword no corpo (K7)", "- H2 (K6):"),
    ],
    linkRules: [
      ...links.filter(item => !/^[LT]\d+ · /.test(item)),
      ...comecaCom(estrutura, "Trilha \"Continue no Silo\" (depois do fechamento"),
    ],
    links: links.filter(item => /^[LT]\d+ · /.test(item)).map(item => itemDeLink(item, item.startsWith("T") ? "trilha" : "corpo")),
    authorityRules: regrasDasFontes,
    authority: linkaveis.map(itemDeFonte),
    authorityReferences: referencias,
    ymylWithoutSource: ymyl,
  };
}

/**
 * OS 4 TEMPOS DO FECHAMENTO, separados (para o arco do vídeo): da planta nova, os
 * 4 campos; da planta gravada, a virada inteira em `turn` (sem inventar a
 * divisão) e o CTA aprovado. Os textos são os do CSV.
 */
export type RadarWritingMaterialClosing = {
  pain: string | null;
  structureShift: string | null;
  ease: string | null;
  /** O CTA único: o diagnóstico (planta nova) ou o CTA aprovado da planta gravada. */
  cta: string | null;
  /** A virada da planta gravada, inteira (sem os 4 campos). */
  turn: string | null;
  /** A oferta de diagnóstico da Skill de voz, quando a linha a traz. */
  offer: string | null;
};

const depoisDe = (linhas: readonly string[], prefixo: string): string | null => {
  const achada = linhas.find(linha => linha.startsWith(prefixo));
  return achada ? achada.slice(prefixo.length).trim() || null : null;
};

export function radarWritingMaterialClosingOf(material: Pick<RadarWritingMaterial, "closing"> | null | undefined): RadarWritingMaterialClosing | null {
  const linhas = material?.closing || [];
  if (!linhas.length) return null;
  return {
    pain: depoisDe(linhas, "- Dor: "),
    structureShift: depoisDe(linhas, "- Mudança para a estrutura própria: "),
    ease: depoisDe(linhas, "- Facilidade (quem faz é a marca): "),
    cta: depoisDe(linhas, "CTA (a única chamada) — diagnóstico: ") ?? depoisDe(linhas, "CTA: "),
    turn: depoisDe(linhas, "Fechamento: "),
    offer: depoisDe(linhas, "- Oferta de diagnóstico da Skill de voz da Marca (D8): "),
  };
}

/** Os itens de um bloco numerado da análise competitiva ("3. O que ninguém entrega…"), sem o "- " da lista. */
export function radarWritingMaterialCompetitiveBlock(material: Pick<RadarWritingMaterial, "competitive"> | null | undefined, numero: 1 | 2 | 3 | 4): string[] {
  const linhas = material?.competitive || [];
  const inicio = linhas.findIndex(linha => linha.startsWith(`${numero}. `));
  if (inicio < 0) return [];
  const itens: string[] = [];
  for (const linha of linhas.slice(inicio + 1)) {
    if (!linha.startsWith("- ")) break;
    itens.push(linha.slice(2));
  }
  return itens;
}

/** As perguntas que valem resposta (até 4), como o CSV as lista depois do rótulo "Perguntas que valem resposta". */
export function radarWritingMaterialQuestions(material: Pick<RadarWritingMaterial, "competitive"> | null | undefined): string[] {
  const linhas = material?.competitive || [];
  const inicio = linhas.findIndex(linha => linha.startsWith("Perguntas que valem resposta"));
  if (inicio < 0) return [];
  const itens: string[] = [];
  /* A lista vai até o próximo bloco (o CSV abre cada bloco com um rótulo terminado em ":"). */
  for (const linha of linhas.slice(inicio + 1)) {
    if (!linha.trim() || (!linha.startsWith("- ") && /:$/.test(linha)) || /^(?:Termos e entidades|Não cobrir)/.test(linha)) break;
    itens.push(linha.replace(/^- /, ""));
  }
  return itens;
}

/** O endereço como chave de comparação: sem protocolo, sem "www.", sem barra final, sem consulta, sem caixa. */
export function radarWritingMaterialUrlKey(url: string | null | undefined): string {
  return String(url ?? "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
}
