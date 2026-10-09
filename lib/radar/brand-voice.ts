/**
 * ===== A VOZ DA MARCA NOS ENTREGÁVEIS DO RADAR (SDD diretriz editorial, Adendo C — 2026-10-02) =====
 *
 * A Skill `brand_voice` é da Marca. Vale a regra canônica da Marca (spec §24,
 * `resolveBrandSkill`): a versão CORRENTE não arquivada — rascunho, aguardando
 * aprovação ou ativa — está disponível a todas as áreas. O Radar não a congela
 * no pacote da SERP (mudaria o hash a cada ajuste de voz): lê a corrente quando
 * monta o entregável e diz qual versão usou e em que estado ela está.
 *
 * Este módulo é a régua pura: em que assunto do entregável cada seção da Skill
 * entra, e o que dizer quando não há Skill ativa. Sem fetch, sem banco.
 */

export type RadarBrandVoiceSection = { heading: string; body: string };

/** A Skill corrente, como o servidor a leu. */
export type RadarBrandVoice = {
  versionId: string;
  version: number;
  name: string;
  contentHash: string;
  /** Estado de tela da Marca: "draft" | "pending_approval" | "active". */
  status: string;
  title: string;
  sections: RadarBrandVoiceSection[];
  /** O Markdown inteiro, para quem lê tudo (o artigo-modelo). */
  markdown: string;
};

/** O que o entregável sabe da voz: disponível (corrente não arquivada), nenhuma, ou ilegível. */
export type RadarBrandVoiceState =
  | { kind: "available"; voice: RadarBrandVoice }
  | { kind: "none" }
  | { kind: "unreadable"; reason: string };

/** A referência que fica gravada em quem usou a voz (artigo-modelo, linha do CSV). */
export type RadarBrandVoiceRef = { versionId: string; version: number; name: string; contentHash: string; status?: string };

export const radarBrandVoiceRef = (voice: RadarBrandVoice): RadarBrandVoiceRef =>
  ({ versionId: voice.versionId, version: voice.version, name: voice.name, contentHash: voice.contentHash, status: voice.status });

const ESTADO: Record<string, string> = { draft: "em rascunho", pending_approval: "aguardando aprovação", active: "ativa" };
export const radarBrandVoiceStatusLabel = (status: string | undefined) => ESTADO[status || ""] || "estado desconhecido";

/**
 * OS ASSUNTOS DO ENTREGÁVEL — a Skill de cada marca tem os títulos que quiser.
 *
 * A ordem importa: o primeiro que casa leva a seção ("Fontes, experiência e
 * autoridade" é de fontes, não de leitor). Título que não casa vai para a voz,
 * que é lida por inteiro: nada da Skill se perde.
 */
export type RadarBrandVoiceSlot = "visual" | "links" | "sources" | "structure" | "research" | "title" | "reader" | "voice";

const REGRAS: ReadonlyArray<[RadarBrandVoiceSlot, RegExp]> = [
  ["visual", /visual|imagem|imagens|fotografia|ilustra/],
  ["links", /\blinks?\b|publicad|url/],
  ["sources", /fonte|autoridade|e-?e-?a-?t|evid[eê]ncia/],
  ["structure", /constru[cç][aã]o|estrutura|transi[cç][aã]o|comercial|\bcta\b|faq|dados estruturados|formato do artigo/],
  ["research", /serp|janela|pesquisa|recursos|inadequad|exclus|n[aã]o cobrir|evitar temas/],
  ["title", /keyword|palavra-chave|t[ií]tulo|abertura|responder|h1/],
  ["reader", /miss[aã]o|p[uú]blico|leitor|leitora|persona|identidade|oferta|servi[cç]o|quem somos/],
];

const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function radarBrandVoiceSlotOf(heading: string): RadarBrandVoiceSlot {
  const chave = semAcento(heading);
  for (const [slot, regra] of REGRAS) if (regra.test(chave) || regra.test(heading.toLowerCase())) return slot;
  return "voice";
}

/** As seções da Skill agrupadas por assunto, na ordem em que a marca as escreveu. */
export function radarBrandVoiceBySlot(voice: RadarBrandVoice): Record<RadarBrandVoiceSlot, RadarBrandVoiceSection[]> {
  const saida: Record<RadarBrandVoiceSlot, RadarBrandVoiceSection[]> = { visual: [], links: [], sources: [], structure: [], research: [], title: [], reader: [], voice: [] };
  for (const secao of voice.sections) {
    if (!secao.body.trim()) continue;
    saida[radarBrandVoiceSlotOf(secao.heading)].push(secao);
  }
  return saida;
}

/** Texto de um assunto: título da seção da Skill e o corpo, como a marca escreveu. */
export function radarBrandVoiceText(secoes: readonly RadarBrandVoiceSection[]): string {
  return secoes.map(secao => `${secao.heading.replace(/^\d+[.)]\s*/, "")}:\n${secao.body.trim()}`).join("\n\n");
}

/*
 * 2026-10-07 · SEÇÃO DE ENTREGA DE ARTIGO (revisão do CSV de vídeo). A Skill
 * real da marca traz "Entrega e revisão final" (H1, SEO title, meta
 * description, corpo do artigo…) e a "Instrução curta para o teste" que manda
 * ESCREVER O ARTIGO — no CSV de vídeo, as duas conflitam com a finalidade do
 * arquivo. O predicado reconhece a entrega pelo título (entrega e revisão,
 * revisão final, instrução para o teste/para o redator, checklist de entrega)
 * ou pelo corpo ("corpo do artigo" junto de "meta description"/"SEO title",
 * ou a ordem de escrever o artigo). CUIDADO com o falso positivo: "Critérios
 * antes de redigir" NÃO é entrega (a regra de coerência e bloqueio serve ao
 * vídeo), e "Voz" e "Vocabulário e estilo" ficam.
 *
 * 2026-10-07 (passada de revisão) · o plural escapava: "instrucao" não é
 * substring de "instrucoes" sem acento, e "Instruções para o redator" ficava
 * na linha de voz.
 */
const TITULO_DE_ENTREGA = /entrega e revis|revisao final|instruc(?:ao|oes)[^:\n]*para o (teste|redator)|checklist d[aeo] entrega/;
const ORDEM_DE_ESCREVER = /escrev[ae]r?[^.!?\n]*\bo artigo\b/;

export function radarBrandVoiceSectionIsArticleDelivery(secao: RadarBrandVoiceSection): boolean {
  if (TITULO_DE_ENTREGA.test(semAcento(secao.heading))) return true;
  const corpo = semAcento(secao.body);
  if (corpo.includes("corpo do artigo") && (corpo.includes("meta description") || corpo.includes("seo title"))) return true;
  return ORDEM_DE_ESCREVER.test(corpo);
}

/**
 * As URLs do PRÓPRIO site da marca citadas na Skill (ex.: a página comercial).
 * URL de outro domínio (fonte, documentação) não é destino de link interno.
 */
export function radarBrandVoiceOwnUrls(voice: RadarBrandVoice, siteUrl: string | null): string[] {
  const urls = [...new Set(voice.markdown.match(/https?:\/\/[^\s)>\]"']+/g) || [])].map(url => url.replace(/[.,;:]+$/, ""));
  const host = (valor: string | null) => {
    try { return valor ? new URL(valor).hostname.replace(/^www\./, "") : null; } catch { return null; }
  };
  const doSite = host(siteUrl) || host(/site:\s*(https?:\/\/\S+)/i.exec(voice.markdown)?.[1] || null);
  if (!doSite) return [];
  return urls.filter(url => host(url) === doSite && new URL(url).pathname.replace(/\/+$/, "") !== "");
}

/** A frase que o entregável usa quando a voz não entra. */
export function radarBrandVoiceAbsence(state: RadarBrandVoiceState): string | null {
  if (state.kind === "available") return null;
  if (state.kind === "unreadable") return `Voz da marca: não foi possível ler a Skill nesta exportação (${state.reason}).`;
  return "Voz da marca: não há Skill de voz na Marca (Skills e prompts); voz, tom, autor e revisor ficam por conta de quem escreve.";
}

/** O rótulo de TELA: diz o estado da Skill na Marca. Telas operacionais (Radar, Marca); entregável usa `radarBrandVoiceDeliverableLabel`. */
export const radarBrandVoiceLabel = (voice: Pick<RadarBrandVoice, "name" | "version" | "status">) =>
  `Skill "${voice.name}" v${voice.version} (${radarBrandVoiceStatusLabel(voice.status)} na Marca)`;

/*
 * 2026-10-08 · D10 NO RÓTULO DA VOZ, EM TODO ENTREGÁVEL. `radarBrandVoiceLabel`
 * diz o estado de tela da Skill ("em rascunho", "aguardando aprovação"): certo
 * nas telas operacionais, espera aberta no entregável (CSV para escrever, CSV
 * de vídeo, Redator, MCP), que sai concluído. No entregável, a versão em uso é
 * dita pelo que ela é — a corrente da Marca, a mesma regra de
 * `resolveBrandSkill` —; a ativa continua dita "ativa". Era o `rotuloDaVoz`
 * do CSV de vídeo (2026-10-07); agora é um só, para todos.
 */
export const radarBrandVoiceDeliverableLabel = (voice: Pick<RadarBrandVoice, "name" | "version" | "status">) =>
  (voice.status === "active" ? radarBrandVoiceLabel(voice) : `Skill "${voice.name}" v${voice.version} (versão corrente na Marca)`);

/**
 * 2026-10-08 · O estado dito em frase de entregável ("Versão 1 da Skill de voz,
 * corrente na Marca."): "ativa" para a ativa; qualquer outro estado — rascunho,
 * aguardando aprovação, desconhecido — é a versão "corrente", a que a Marca
 * entrega a todas as áreas. Nunca "em rascunho" nem "aguardando aprovação".
 */
export const radarBrandVoiceDeliverableStatusLabel = (status: string | undefined) => (status === "active" ? ESTADO.active : "corrente");

/**
 * A Skill da Marca, do jeito que o repositório devolve, vira a voz do Radar.
 * Sem reparsear o registro: `provenance.importedAt` vem do banco com "+00:00".
 */
export function radarBrandVoiceFromSkill(skill: {
  versionId?: string | null;
  version: number;
  name: string;
  contentHash: string;
  status: string;
  originalMarkdown: string;
  normalizedContent: { title: string | null; sections: ReadonlyArray<{ heading: string; body: string }> };
}): RadarBrandVoice | null {
  if (!skill.versionId) return null;
  return {
    versionId: skill.versionId,
    version: skill.version,
    name: skill.name,
    contentHash: skill.contentHash,
    status: skill.status,
    title: skill.normalizedContent.title || skill.name,
    sections: skill.normalizedContent.sections.map(secao => ({ heading: secao.heading, body: secao.body })),
    markdown: skill.originalMarkdown,
  };
}

/*
 * ===== 2026-10-09 · AS EXCLUSÕES DA VOZ DA MARCA VALEM EM TUDO (defeito 5 dos 8 CSVs do Silo) =====
 *
 * A Skill real da AdalbaPro diz, na seção "Recursos antigos ou inadequados":
 * "Não recomendar Instagram Shopping, ativação de loja ou tutoriais de
 * configuração desse recurso nos artigos deste projeto" e "Não transportar
 * conselhos de lojas virtuais para consultórios automaticamente". Mesmo assim
 * o CSV do artigo de Instagram mandava "Diferenciar em 'Ative o Instagram
 * Shopping': a busca mostra que só 2 de 6 página(s) cobrem": a voz ia inteira
 * na linha "Voz da marca", mas nenhuma régua lia o que ela proíbe.
 *
 * Aqui a régua pura: as exclusões que a Skill DECLARA, lidas das seções que
 * proíbem recurso ou tema (título com "recursos antigos/inadequados",
 * "inadequado", "exclusão", "evitar", "não recomendar", "proibido", "não
 * cobrir"), cada uma com o rótulo como a marca escreveu, a frase da Skill que a
 * exclui e o padrão que a reconhece num texto. Quem monta "Como superar",
 * temas, perguntas, "Não cobrir" e o brief do artigo-modelo aplica
 * (`radarBrandVoiceExclusionOf`). Vale para qualquer marca: nada aqui cita a
 * AdalbaPro; o que muda é o que a Skill de cada marca proíbe.
 *
 * Como o item vira regra:
 *   - só a frase que PROÍBE ("Não recomendar…", "Não transportar…", "Nunca
 *     sugerir…", "Evitar…") ou o item de lista numa seção de exclusão; a frase
 *     que proíbe AFIRMAÇÃO ("Não afirmar que toda clínica está proibida…") não
 *     é exclusão de tema;
 *   - o objeto vai até o primeiro complemento ("nos artigos", "para
 *     consultórios", "apenas porque…") e se separa por vírgula, "ou" e "e";
 *   - o item que retoma outro ("tutoriais de configuração DESSE recurso") é o
 *     mesmo do anterior e não vira regra própria; o item genérico
 *     ("funcionalidades apenas porque apareceram num concorrente") também não
 *     — senão toda funcionalidade sairia;
 *   - a cabeça de conselho ("conselhos de lojas virtuais") fica no rótulo e sai
 *     do padrão: o que se reconhece é "lojas virtuais" (e "e-commerce" e "loja
 *     online", o mesmo assunto);
 *   - o padrão pede TODAS as palavras distintivas do item, perto umas das
 *     outras (até três palavras entre elas), em qualquer ordem: "Ative o
 *     Instagram Shopping" e "Shopping do Instagram" casam; "Como atrair
 *     clientes pelo Instagram", não.
 * Limite declarado: "ativação de loja" reconhece pela raiz "ativ", e
 * "atividades da loja" também casa.
 */
export type RadarBrandVoiceExclusion = {
  /** O item como a Skill o escreveu ("Instagram Shopping", "ativação de loja", "conselhos de lojas virtuais"). */
  label: string;
  /** A frase da Skill que o exclui, inteira. */
  rule: string;
  /** O título da seção da Skill de onde veio. */
  section: string;
  /** O padrão sobre o texto sem acento e minúsculo (`radarBrandVoiceExclusionOf` normaliza). */
  pattern: RegExp;
  /**
   * 2026-10-09 (correção) · Aditivo: os outros nomes do mesmo recurso ("loja no
   * Instagram", "sacola do Instagram", "marcar produtos" para Instagram
   * Shopping). Valem depois de todos os padrões: o nome dito vence o sinônimo.
   */
  synonyms?: RegExp;
  /**
   * 2026-10-09 (correção) · Aditivo: a exclusão com CONDIÇÃO na Skill ("Não
   * transportar conselhos de lojas virtuais para consultórios
   * AUTOMATICAMENTE") não veta o texto que trata explicitamente de produto
   * (venda de produto próprio é objetivo legítimo para a marca).
   */
  except?: RegExp;
};

const SECAO_DE_EXCLUSAO = /recursos? (?:antigos|inadequad|desatualizad|proibid|vetad)|inadequad|exclus(?:ao|oes)|(?:^|\s)(?:o que )?evitar\b|nao recomendar|proibid|vetad|nao cobrir|fora do escopo/;
const PROIBE = /^(?:(?:nao|nunca|jamais)\s+(?:recomendar|sugerir|indicar|ensinar|usar|utilizar|citar|mencionar|incluir|transportar|propor|orientar|promover|abordar|tratar|cobrir|ativar|oferecer|divulgar)|evit(?:ar|e))\s+(?<objeto>.+)$/;
/* Onde o objeto acaba: o primeiro complemento de lugar, destino, motivo ou modo. */
const FIM_DO_OBJETO = /\s(?:nos?|nas?|neste|nesta|deste|desta|nestes|nestas|em|para|pra|apenas|so|somente|quando|porque|pois|sem|automaticamente|exceto|salvo|como se)\s|[.;:!?]/;
const RETOMA = /\b(?:desse|deste|dessa|desta|desses|destes|dessas|destas|do mesmo|da mesma|dos mesmos|das mesmas)\b/;
const CABECA_DE_CONSELHO = /^(?:conselhos?|dicas?|tutoria(?:l|is)|instruc(?:ao|oes)|orientac(?:ao|oes)|guias?|receitas?|praticas?)\s+(?:de|do|da|dos|das|para|sobre)\s+/;
const PALAVRA_VAZIA = new Set([
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "o", "a", "os", "as", "um", "uma", "e", "ou", "com", "por", "para", "que",
  "seu", "sua", "seus", "suas", "ao", "aos",
]);
const ITEM_GENERICO = new Set([
  "funcionalidade", "funcionalidades", "recurso", "recursos", "ferramenta", "ferramentas", "conteudo", "conteudos", "coisa", "coisas",
  "conselho", "conselhos", "dica", "dicas", "tutorial", "tutoriais", "configuracao", "configuracoes", "artigo", "artigos", "projeto",
  "tema", "temas", "assunto", "assuntos", "texto", "textos", "instrucao", "instrucoes",
]);
/* O mesmo assunto com outro nome: loja virtual é e-commerce e loja online. */
const LOJA_VIRTUAL_TAMBEM = "e[\\s-]?commerce|lojas?[^a-z0-9]+on[\\s-]?line";

/* Raiz curta e conservadora: "ativação" → "ativ", "lojas" → "loj", "virtuais" → "virtu" (casa "virtual"). */
const raizDaExclusao = (palavra: string): string => {
  const r = palavra.replace(/(?:acoes|icoes|acao|icao|mentos|mento|ais|eis|oes|aes|ns|es|as|os|a|o|e|s)$/, "");
  return r.length >= 3 ? r : palavra;
};
const escapar = (valor: string) => valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const permutacoes = (itens: readonly string[]): string[][] =>
  (itens.length <= 1 ? [[...itens]] : itens.flatMap((item, indice) => permutacoes(itens.filter((_, outro) => outro !== indice)).map(resto => [item, ...resto])));
const PERTO = "[^a-z0-9]+(?:[a-z0-9]+[^a-z0-9]+){0,3}?";

/*
 * 2026-10-09 (correção) · AS EXCLUSÕES SEM FALSO POSITIVO E SEM BURACO. A
 * revisão mediu, com a Skill real: "Atividades da loja de cosméticos da
 * clínica" tocava "ativação de loja" (a raiz "ativ" casava "atividades"), e
 * "e-commerce de dermocosméticos" tocava "conselhos de lojas virtuais" — a
 * frase da Skill proíbe transportar o conselho de loja virtual para o
 * consultório AUTOMATICAMENTE, não o assunto produto; e "Crie uma loja no
 * Instagram", "Marque produtos nos posts do Instagram" e "Configure a sacola
 * do Instagram" (tutoriais do recurso excluído) passavam. Agora:
 *   - a raiz nunca casa o substantivo em "-idade" ("atividade");
 *   - a exclusão com condição ("automaticamente") não veta o texto que trata
 *     explicitamente de produto;
 *   - "Instagram Shopping" (e "Facebook Shopping") reconhece os outros nomes do
 *     recurso, depois dos padrões ditos.
 */
const CONDICAO_DA_EXCLUSAO = /\b(?:automaticamente|sem criterio|sem adaptar|sem adaptacao)\b/;
const TRATA_DE_PRODUTO = /\b(?:produtos?|cosmeticos?|dermocosmeticos?|kits?|afiliad\w*|revend\w*|mercadorias?)\b/;
const sinonimosDoRecurso = (palavras: readonly string[]): RegExp | undefined => {
  const plataforma = palavras.find(palavra => palavra === "instagram" || palavra === "facebook");
  if (!plataforma || !palavras.includes("shopping")) return undefined;
  return new RegExp(`\\b(?:(?:loja|sacola|catalogo|vitrine)[^a-z0-9]+(?:no|do|da|na)[^a-z0-9]+${plataforma}|(?:marc|marq|tagu|etiquet)[a-z]*[^a-z0-9]+(?:os[^a-z0-9]+|seus[^a-z0-9]+)?produtos?|${plataforma}[^a-z0-9]+(?:shop|checkout))\\b`);
};

function padraoDoItem(palavras: readonly string[]): RegExp {
  const raizes = [...new Set(palavras.map(raizDaExclusao))].slice(0, 3).map(raiz => `${escapar(raiz)}(?!idades?\\b)[a-z0-9]*`);
  const alternativas = permutacoes(raizes).map(ordem => ordem.join(PERTO));
  const lojaVirtual = palavras.some(palavra => palavra.startsWith("loj")) && palavras.some(palavra => /^(?:virtua|online)/.test(palavra));
  return new RegExp(`\\b(?:${[...alternativas, ...(lojaVirtual ? [LOJA_VIRTUAL_TAMBEM] : [])].join("|")})\\b`);
}

const frasesDe = (corpo: string): string[] => corpo
  .split(/\n+/)
  .flatMap(linha => linha.split(/(?<=[.!?])\s+(?=\p{Lu})/u))
  .map(frase => frase.trim())
  .filter(Boolean);

/** 2026-10-09 · As exclusões que a Skill de voz declara (Instagram Shopping, ativação de loja, conselhos de lojas virtuais…). Sem Skill, nenhuma. */
export function radarBrandVoiceExclusions(voice: Pick<RadarBrandVoice, "sections"> | null | undefined): RadarBrandVoiceExclusion[] {
  const saida: RadarBrandVoiceExclusion[] = [];
  const vistas = new Set<string>();
  for (const secao of voice?.sections || []) {
    const titulo = semAcento(secao.heading.replace(/^\d+[.)]\s*/, "")).trim();
    if (!SECAO_DE_EXCLUSAO.test(titulo)) continue;
    for (const frase of frasesDe(secao.body.normalize("NFC"))) {
      const semMarcador = frase.replace(/^[-*•]\s*/, "");
      const normal = semAcento(semMarcador).replace(/["“”'‘’]/g, "").replace(/\s+/g, " ").trim();
      const proibe = PROIBE.exec(normal);
      /* Item de lista numa seção de exclusão vale por si; frase corrida só quando proíbe. */
      const objeto = proibe?.groups?.objeto ?? (semMarcador !== frase ? normal : null);
      if (!objeto) continue;
      const fim = FIM_DO_OBJETO.exec(` ${objeto}`);
      const recortado = (fim ? ` ${objeto}`.slice(0, fim.index) : objeto).trim();
      /* O rótulo sai do texto original (com acento), na mesma posição do objeto normalizado. */
      const original = semMarcador.replace(/["“”'‘’]/g, "").replace(/\s+/g, " ").trim();
      const inicio = normal.length - objeto.length;
      const rotulos = original.slice(inicio, inicio + recortado.length).split(/\s*,\s*|\s+ou\s+|\s+e\s+/);
      for (const rotulo of rotulos.map(item => item.trim()).filter(Boolean)) {
        const chave = semAcento(rotulo);
        if (RETOMA.test(chave)) continue;
        const palavras = chave.replace(CABECA_DE_CONSELHO, "").split(/[^a-z0-9]+/)
          .filter(palavra => palavra.length >= 3 && !PALAVRA_VAZIA.has(palavra) && !ITEM_GENERICO.has(palavra));
        if (!palavras.length || vistas.has(chave)) continue;
        vistas.add(chave);
        const sinonimos = sinonimosDoRecurso(palavras);
        saida.push({
          label: rotulo, rule: frase.replace(/^[-*•]\s*/, ""), section: secao.heading.replace(/^\d+[.)]\s*/, "").trim(), pattern: padraoDoItem(palavras),
          ...(sinonimos ? { synonyms: sinonimos } : {}),
          ...(CONDICAO_DA_EXCLUSAO.test(normal) ? { except: TRATA_DE_PRODUTO } : {}),
        });
      }
    }
  }
  return saida;
}

/** 2026-10-09 · A exclusão da voz que o texto toca (o primeiro item que casa), ou null. */
export function radarBrandVoiceExclusionOf(texto: string | null | undefined, exclusoes: readonly RadarBrandVoiceExclusion[]): RadarBrandVoiceExclusion | null {
  const normal = semAcento(String(texto || "")).replace(/\s+/g, " ");
  if (!normal.trim()) return null;
  /* 2026-10-09 (correção) · a exceção da condição vale para o padrão e para o sinônimo; o nome dito vence o sinônimo. */
  const vale = (exclusao: RadarBrandVoiceExclusion) => !(exclusao.except && exclusao.except.test(normal));
  return exclusoes.find(exclusao => exclusao.pattern.test(normal) && vale(exclusao))
    ?? exclusoes.find(exclusao => Boolean(exclusao.synonyms?.test(normal)) && vale(exclusao))
    ?? null;
}

/** 2026-10-09 · A linha concluída das exclusões, para o brief do artigo-modelo e o "Não cobrir": rótulos e a seção da Skill. */
export function radarBrandVoiceExclusionsLine(exclusoes: readonly RadarBrandVoiceExclusion[]): string | null {
  if (!exclusoes.length) return null;
  const secoes = [...new Set(exclusoes.map(exclusao => exclusao.section))];
  return `Exclusão da voz da marca (seção ${secoes.map(secao => `"${secao}"`).join(", ")} da Skill): não recomendar nem sugerir ${exclusoes.map(exclusao => exclusao.label).join(", ")} — em nenhuma seção, tema, pergunta ou diferencial.`;
}
