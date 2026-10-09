import { radarSemanticStems } from "./semantic-concept-model.ts";
import { radarUbiquitousStems } from "./intent-adherence.ts";
import {
  RADAR_WRITING_FUNCTION_WORDS,
  radarWritingCompareKey,
  radarWritingDecodeEntities,
  radarWritingUnsupportedClaims,
  type RadarWritingProjections,
} from "./portable-writing-export.ts";
import type { RadarArticleBlueprintPayload } from "./article-blueprint.ts";

/**
 * ===== 2026-10-07 · A TRAVA DE FONTE EM TODO TEXTO PUBLICÁVEL (pedido do dono) =====
 *
 * O CSV real de vídeo publicava na Lâmina 2 "O algoritmo prioriza conteúdo que
 * gera interação…" enquanto o capítulo 1 marcava a MESMA afirmação como "fonte
 * a obter". Seis réguas diferentes sabiam que a frase pedia fonte; nenhuma
 * conferia o texto que vai para a lâmina, a legenda e a ideia do corte.
 *
 * Aqui fica a régua única, com duas funções:
 *
 *   - `radarPendingClaims` junta as afirmações que pedem fonte: (a) os links
 *     externos da planta do artigo-modelo (até 2 por seção; `source` nulo é
 *     fonte a obter, `X` é fonte do pacote); (b) o que o mercado repete sem
 *     fonte (`radarWritingUnsupportedClaims`, usada como está — ela tem outros
 *     consumidores); (c) o que a fonte contradiz no mercado.
 *   - `radarClaimGate` diz, para UMA frase, se ela está livre, se tem fonte ou
 *     se fica travada — e por quê. Além das afirmações listadas, (d) um
 *     detector da regra 17 da planta: frase afirmativa sobre plataforma,
 *     algoritmo ou recurso, sem fonte.
 *
 * A trava só tira a frase do texto PUBLICÁVEL e diz o motivo; nos campos de
 * produção ela continua, como fala delimitada. Não apaga nada, não reescreve e
 * não censura a tese de quem fala: frase sem afirmação de plataforma passa.
 *
 * 2026-10-08 · o detector (d) lê o SENTIDO — plataforma, efeito comercial
 * (conversão) e comportamento do público, com a polaridade — e a régua por
 * frase `radarSentenceNeedsSource` serve a todo entregável (CSV para escrever,
 * CSV de vídeo, Redator). Limite declarado: comportamento do público dito na
 * voz passiva, sem o público como sujeito ("o conteúdo é consumido de
 * passagem"), continua fora do detector.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

export type RadarPendingClaimOrigin =
  /** Link externo da planta do artigo-modelo. */
  | "PLANTA"
  /** Afirmação que o mercado repete e o pacote não sustenta. */
  | "MERCADO_SEM_FONTE"
  /** Afirmação que o mercado repete e a fonte contradiz ou condiciona. */
  | "MERCADO_X_FONTE";

export type RadarPendingClaim = {
  texto: string;
  origem: RadarPendingClaimOrigin;
  /** A fonte do pacote (id X da planta) quando a planta a ligou; `null` = fonte a obter. */
  fonte: { id: string; url: string; titulo: string } | null;
  /** O índice da seção da planta (0 = primeira) quando a afirmação veio de um link externo dela. */
  secao: number | null;
};

export type RadarClaimGate =
  | { estado: "LIVRE" }
  | { estado: "COM_FONTE"; afirmacao: RadarPendingClaim }
  | { estado: "TRAVADA"; afirmacao: RadarPendingClaim | null; motivo: string };

const texto = (valor: unknown): string => (typeof valor === "string" ? radarWritingDecodeEntities(valor.trim()).replace(/\s+/g, " ") : "");

/*
 * ===== 2026-10-09 (correção) · O RÓTULO DE TEMA NÃO É AFIRMAÇÃO — E ISSO SE DECIDE NA ORIGEM =====
 *
 * A planta real de leads ligava a "fonte oficial" rótulos de tema
 * ("Definição de lead qualificado conforme fontes do setor", "Estatísticas
 * sobre conversão de leads qualificados", "Diferença entre lead qualificado e
 * interessado"): nada afirmam, e a trava casava a meta inteira com eles. As
 * colunas do CSV filtravam o rótulo só para elas; o CSV de vídeo e o Redator
 * montavam as afirmações sem o filtro — a mesma frase saía livre num
 * entregável e "precisa de fonte" no outro. Agora (a) pula, aqui, o link SEM
 * fonte do pacote que é rótulo de tema: todo consumidor recebe a mesma lista.
 *
 * E o rótulo é decidido pela CABEÇA, de lista fechada (a revisão mostrou que
 * "forma de título + sem verbo da lista" tratava como rótulo "Resolução do CFM
 * proíbe fotos de antes e depois", "Clínicas com perfil completo recebem mais
 * ligações" e "Queda no alcance orgânico do Instagram" — afirmação normativa,
 * de efeito e de direção, que pedem fonte). Rótulo é:
 *   - cabeça de rótulo de lista fechada (Definição, Estatísticas, Dados,
 *     Passos, Etapas, Diferença, Lista, Exemplos, Tipos, Métricas, Riscos,
 *     Benefícios, Critérios, Dicas, Erros…), com "Principais", "Boas" ou
 *     "Passo a passo" antes, seguida logo de preposição; ou
 *   - "Como", "Quando" ou "Onde" + infinitivo;
 * e, nos dois casos, sem número e sem verbo finito. Na dúvida, é afirmação: o
 * link fica e a frase que o repete continua travando.
 */
const CABECA_DE_ROTULO: ReadonlySet<string> = new Set([
  "definicao", "definicoes", "conceito", "conceitos", "estatistica", "estatisticas", "dados", "numeros", "passo", "passos", "etapa", "etapas",
  "fases", "diferenca", "diferencas", "lista", "listas", "exemplo", "exemplos", "tipo", "tipos", "metrica", "metricas", "indicador", "indicadores",
  "risco", "riscos", "beneficio", "beneficios", "vantagens", "desvantagens", "cuidados", "criterio", "criterios", "dicas", "estrategias",
  "ferramentas", "fontes", "referencias", "regras", "normas", "comparacao", "comparativo", "panorama", "importancia", "erros", "mitos",
  "praticas", "tecnicas", "formas", "maneiras", "modelos", "casos", "estudos", "pesquisas", "tendencias", "custos", "objetivos", "principios",
  "requisitos", "impacto", "impactos", "efeitos", "causas", "sinais", "motivos", "razoes", "guia", "checklist", "resumo", "historico", "evolucao",
]);
/* O qualificador que pode vir antes da cabeça ("Principais erros de…", "Boas práticas para…"). */
const QUALIFICADOR_DE_ROTULO: ReadonlySet<string> = new Set(["principais", "melhores", "boas", "diferentes", "novas", "novos", "ultimas", "ultimos"]);
const PREPOSICAO_DE_ROTULO: ReadonlySet<string> = new Set([
  "de", "do", "da", "dos", "das", "para", "pra", "sobre", "entre", "conforme", "em", "no", "na", "nos", "nas", "com", "por",
  "pelo", "pela", "pelos", "pelas", "e", "ou", "x", "vs", "versus", "contra", "sem", "ao", "aos",
]);
/* Os verbos finitos acentuados que, sem acento, viram outra palavra ("é" → "e", "está" → "esta"). */
const VERBOS_ACENTUADOS: ReadonlySet<string> = new Set(["é", "há", "são", "está", "estão", "têm", "será", "serão", "terá", "terão", "poderá", "deverá", "irá", "dá", "vê", "lê", "crê", "põe", "mantém", "obtém", "contém", "retém", "detém", "constrói", "destrói"]);
const VERBOS_FINITOS: ReadonlySet<string> = new Set([
  "sao", "foi", "foram", "era", "eram", "seria", "seriam", "estava", "estavam", "fica", "ficam", "tem", "tinha", "tinham", "havia", "houve",
  "pode", "podem", "poderia", "deve", "devem", "deveria", "precisa", "precisam", "costuma", "costumam", "vai", "vao", "consegue", "conseguem",
  "faz", "fazem", "traz", "trazem", "atrai", "atraem", "gera", "geram", "aumenta", "aumentam", "reduz", "reduzem", "diminui", "diminuem",
  "melhora", "melhoram", "piora", "pioram", "ajuda", "ajudam", "mostra", "mostram", "indica", "indicam", "aponta", "apontam", "revela", "revelam",
  "garante", "garantem", "permite", "permitem", "leva", "levam", "converte", "convertem", "favorece", "favorecem", "influencia", "influenciam",
  "depende", "dependem", "funciona", "funcionam", "procura", "procuram", "busca", "buscam", "prefere", "preferem", "confia", "confiam",
  "usa", "usam", "acessa", "acessam", "compra", "compram", "vende", "vendem", "cresce", "crescem", "cai", "caem", "sobe", "sobem", "chega", "chegam",
  "passa", "passam", "vira", "viram", "exige", "exigem", "oferece", "oferecem", "cria", "criam", "deixa", "deixam", "representa", "representam",
  "significa", "significam", "afeta", "afetam", "impacta", "impactam", "libera", "liberam", "entrega", "entregam", "atinge", "atingem",
  "alcanca", "alcancam", "amplia", "ampliam", "eleva", "elevam", "dobra", "dobram", "estimula", "estimulam", "incentiva", "incentivam",
  "facilita", "facilitam", "dificulta", "dificultam", "acelera", "aceleram", "impede", "impedem", "evita", "evitam", "resolve", "resolvem",
  "substitui", "substituem", "complementa", "complementam", "vale", "valem", "rende", "rendem", "retorna", "retornam", "volta", "voltam",
  "atende", "atendem", "recomenda", "recomendam", "sugere", "sugerem", "afirma", "afirmam", "diz", "dizem", "explica", "explicam",
  "define", "definem", "considera", "consideram", "avalia", "avaliam", "mede", "medem", "registra", "registram", "exibe", "exibem",
  "tende", "tendem", "compromete", "comprometem", "prejudica", "prejudicam", "beneficia", "beneficiam", "reforca", "reforcam",
  "sustenta", "sustentam", "demonstra", "demonstram", "comprova", "comprovam", "confirma", "confirmam", "envolve", "envolvem",
  "inclui", "incluem", "possui", "possuem", "mantem", "obtem", "produz", "produzem", "conduz", "conduzem", "merece", "merecem",
  "conta", "contam", "basta", "bastam", "serve", "servem", "custa", "custam", "atrapalha", "atrapalham", "limita", "limitam",
  "existe", "existem", "leem", "veem", "vem", "dao", "agrega", "agregam", "decide", "decidem", "escolhe", "escolhem", "pesquisa", "pesquisam",
  "proibe", "proibem", "veda", "vedam", "segue", "seguem", "viola", "violam", "concentra", "concentram", "engaja", "engajam", "recebe", "recebem",
  "perde", "perdem", "ganha", "ganham", "obriga", "obrigam", "autoriza", "autorizam", "regula", "regulam", "determina", "determinam",
]);
/* Terminação de verbo conjugado (presente plural, pretérito, -izar, -ecer); os nomes comuns com a mesma terminação ficam de fora. */
const SUFIXO_VERBAL = /(?:izam?|ificam?|ecem?|aram|eram|iram|avam?|ou|eu|iu|am|em)$/;
const SUFIXO_DE_NOME = /(?:gem|gram|omem|ovem|uvem|quem|alem|porem|tambem|ninguem|alguem)$|^(?:ordem|desordem)$/;
const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "");
const ehVerboFinito = (palavra: string): boolean => {
  if (VERBOS_ACENTUADOS.has(palavra)) return true;
  const chave = semAcento(palavra);
  if (VERBOS_FINITOS.has(chave)) return true;
  return chave.length >= 5 && SUFIXO_VERBAL.test(chave) && !SUFIXO_DE_NOME.test(chave);
};

/** 2026-10-09 (correção) · O texto é rótulo de tema (cabeça de lista fechada ou "Como" + infinitivo, sem verbo finito nem número), não afirmação. */
export function radarClaimIsTopicLabel(valor: string | null | undefined): boolean {
  const limpo = texto(valor).normalize("NFC").replace(/[.;:!?\s]+$/, "");
  if (!limpo || /\d/.test(limpo) || /[.;!?]\s/.test(limpo)) return false;
  const palavras = limpo.toLocaleLowerCase("pt-BR").split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
  if (!palavras.length || palavras.length > 14 || palavras.some(ehVerboFinito)) return false;
  const chaves = palavras.map(semAcento);
  /* "Como gerar leads qualificados": título de seção, não afirmação. */
  if (["como", "quando", "onde"].includes(chaves[0])) return chaves.length >= 2 && /(?:ar|er|ir|or)$/.test(chaves[1]);
  /* "Passo a passo para…", "Boas práticas para…", "Principais erros de…". */
  const cabeca = chaves[0] === "passo" && chaves[1] === "a" && chaves[2] === "passo" ? 2 : QUALIFICADOR_DE_ROTULO.has(chaves[0]) ? 1 : 0;
  if (!CABECA_DE_ROTULO.has(chaves[cabeca] ?? "")) return false;
  return [cabeca + 1, cabeca + 2].some(indice => PREPOSICAO_DE_ROTULO.has(chaves[indice] ?? ""));
}

/* 2026-10-08 · `p` aceita null (aditivo): sem as projeções do pacote, só os links da planta (a) — (b) e (c) vêm do pacote. */
export function radarPendingClaims(p: RadarWritingProjections | null, planta: RadarArticleBlueprintPayload | null): RadarPendingClaim[] {
  const saida: RadarPendingClaim[] = [];
  const fontes = new Map((planta?.sources || []).map(fonte => [fonte.id, fonte]));
  /* (a) todos os links externos de todas as seções — o vídeo lia só o primeiro (`externalLinks[0]`). */
  for (const [indice, secao] of (planta?.blueprint.sections || []).entries()) {
    for (const link of secao.externalLinks || []) {
      const afirmacao = texto(link.claim);
      if (!afirmacao) continue;
      const fonte = link.source ? fontes.get(link.source) ?? null : null;
      /* 2026-10-09 (correção) · o rótulo de tema sem fonte do pacote não é afirmação: não trava frase nenhuma, em entregável nenhum. */
      if (!fonte && radarClaimIsTopicLabel(afirmacao)) continue;
      saida.push({ texto: afirmacao, origem: "PLANTA", fonte: fonte ? { id: fonte.id, url: fonte.url, titulo: fonte.title } : null, secao: indice });
    }
  }
  /*
   * (b) a MESMA régua do CSV para escrever: só afirmação que pede fonte, e só a que não tem.
   * 2026-10-07 (revisão) · a afirmação que a fonte CONTRADIZ também sai dessa
   * régua (ela só conta SUPPORTS): ela é dita uma vez, em (c), com o motivo
   * certo — "sem fonte" era falso para quem tem fonte contrária.
   */
  if (!p) return saida;
  const emConflito = new Set((p.autoridade?.marketVsFactConflicts || []).map(conflito => radarWritingCompareKey(texto(conflito.canonicalClaim))));
  for (const item of radarWritingUnsupportedClaims(p.autoridade, p.serp)) {
    const afirmacao = texto(item.afirmacao);
    if (afirmacao && !emConflito.has(radarWritingCompareKey(afirmacao))) saida.push({ texto: afirmacao, origem: "MERCADO_SEM_FONTE", fonte: null, secao: null });
  }
  /* (c) o que a fonte contradiz ou condiciona: o mercado repete, e reproduzir induz ao erro. */
  for (const conflito of p.autoridade?.marketVsFactConflicts || []) {
    const afirmacao = texto(conflito.canonicalClaim);
    if (afirmacao) saida.push({ texto: afirmacao, origem: "MERCADO_X_FONTE", fonte: null, secao: null });
  }
  return saida;
}

/*
 * As raízes que a afirmação e a frase dividem precisam DISTINGUIR o assunto:
 * palavra de função, auxiliar e pronome não contam, e a raiz da principal que
 * aparece em quase toda seção da planta ("instagram" num artigo sobre
 * Instagram) também não — senão toda frase do artigo "casaria" com toda
 * afirmação.
 */
const GENERICAS: ReadonlySet<string> = new Set([
  "pode", "podem", "deve", "devem", "esta", "estao", "voce", "voces", "cada", "todo", "toda", "todos", "todas",
  "ainda", "mesmo", "mesma", "entre", "quem", "hoje", "aqui", "tambem", "apenas", "fazer", "sendo", "seja", "isso",
]);

/** O radical não é uniforme ("prioriza" → "prioriz", "priorizam" → "priorizam"): mesma raiz quando uma começa pela outra. */
const mesmaRaiz = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));

const raizesDistintivas = (frase: string, comuns: ReadonlySet<string>): string[] =>
  radarSemanticStems(texto(frase)).filter(raiz => !RADAR_WRITING_FUNCTION_WORDS.has(raiz) && !GENERICAS.has(raiz) && !comuns.has(raiz));

const emComum = (da: readonly string[], com: readonly string[]) => da.filter(raiz => com.some(outra => mesmaRaiz(raiz, outra)));

/*
 * 2026-10-09 (correção) · onde um trecho da frase termina e outro começa: ";", ":", vírgula, travessão, "mas",
 * "porém", "enquanto", "pois", "porque", e " e " que abre sujeito novo ("… e o pago traz…"). A vírgula conta: "…
 * converter 3 vezes mais, segundo o atendimento de quem trabalha com estética" é a afirmação mais a atribuição.
 */
const QUEBRA_DE_ORACAO_COORDENADA = /\s*[;:,—–]\s*|\s+(?:mas|por[eé]m|enquanto|pois|porque)\s+|\s+e\s+(?=(?:o|a|os|as|um|uma|seu|sua|seus|suas)\s)/i;

/**
 * As raízes da principal que estão em metade ou mais das seções da planta:
 * cenário do artigo, não assunto de uma afirmação. Sem planta, as da própria
 * principal — o export sem planta só confere a promessa e as afirmações do
 * mercado, e "instagram" sozinho não liga uma à outra.
 */
export function radarClaimCommonStems(p: RadarWritingProjections, planta: RadarArticleBlueprintPayload | null): ReadonlySet<string> {
  const daPrincipal = new Set(radarSemanticStems(texto(p.dna.principalKeyword)));
  const secoes = (planta?.blueprint.sections || []).map(secao => [secao.h2, secao.readerQuestion, secao.answerFirst, ...secao.explain].map(texto).join(" "));
  if (secoes.length < 2) return daPrincipal;
  return new Set([...radarUbiquitousStems(secoes, 0.5, 2)].filter(raiz => daPrincipal.has(raiz)));
}

/*
 * (d) O DETECTOR DA REGRA 17 DA PLANTA: "se for afirmação sobre plataforma,
 * algoritmo ou comportamento do público, ponha um link externo com fonte a
 * obter". Pega a frase que AFIRMA um efeito de um mecanismo da plataforma
 * ("Hashtags e geolocalização ajudam a ser encontrado") ou de conversão ("Um
 * site otimizado converte visitantes em agendamentos"). A recomendação que só
 * NOMEIA o recurso ("Aplique táticas como … uso de hashtags relevantes") não
 * afirma efeito nenhum e passa — o detector pede mecanismo E efeito.
 *
 * 2026-10-07 (revisão) · três buracos do detector:
 *   - a PLATAFORMA como sujeito de um verbo de ordenar, entregar ou punir não
 *     contava como mecanismo: "O Instagram prioriza vídeos curtos", "O
 *     Instagram penaliza links na legenda" e "O Instagram mostra seu conteúdo
 *     primeiro para quem…" passavam. "Mostra" só conta com o "primeiro", "antes"
 *     ou "para quem" de quem ordena — "O Instagram mostra os bastidores da
 *     clínica" é uso da plataforma, não afirmação sobre ela;
 *   - "têm mais alcance" e "o alcance caiu" não tinham verbo da lista;
 *   - preço, recurso e funcionalidade travavam sem plataforma nenhuma na frase
 *     ("O preço da consulta aparece no site da clínica"): agora só com ela.
 * E o motivo da conversão é o dela: "converte visitantes em agendamentos" é
 * afirmação sobre o comportamento do público, não sobre plataforma.
 */
const MECANISMO = /\b(algoritm\w*|engajament\w*|hashtags?|geolocaliza\w*|anuncios?|impulsionament\w*|entrega (?:de|do|dos|das|da) (?:conteud|post|public|stor|reel)\w*|entrega organica)\b|(?<!\bao )\balcance\b/;
const RECURSO = /\b(funcionalidades?|recursos?|precos?)\b/;
const PLATAFORMA = /\b(instagram|tiktok|youtube|google|facebook|linkedin|whatsapp|reels?|stories|feed)\b/;
/* 2026-10-08 (correção) · "dá mais alcance" ("O Reels dá mais alcance que o carrossel") entrou como efeito. */
const EFEITO = /\b(prioriz\w*|favorec\w*|ajud\w*|aument\w*|ampli\w*|reduz\w*|diminu\w*|penaliz\w*|entreg(?:a|am)|mostr(?:a|am)|garant\w*|ger(?:a|am)|melhor(?:a|am)|impulsion(?:a|am)|derrub\w*|limit(?:a|am)|distribu\w*|recomend(?:a|am)|privilegi\w*|valoriz\w*|alcanc(?:a|am)|aparec\w*|cust(?:a|am)|cobr(?:a|am)|permit\w*|liber(?:a|am)|disponive\w*|oferec\w*|funcion(?:a|am)|dobr(?:a|am)|multiplic\w*|cresc\w*|caem?|sobem?|cai|caiu|cairam|tem (?:mais|menos)|d(?:a|ao) (?:mais|menos))\b/;
/* O que a plataforma FAZ com o conteúdo (ordenar, entregar, punir), dito com ela como sujeito, até duas palavras antes do verbo. 2026-10-08 (correção) · o verbo num grupo: com modal antes ("pode priorizar"), é possibilidade. */
const PLATAFORMA_ORDENA = /\b(?:instagram|tiktok|youtube|google|facebook|linkedin|reels?|stories|feed)(?:\s+\S+){0,2}?\s+(?<verbo>prioriz\w*|favorec\w*|penaliz\w*|privilegi\w*|valoriz\w*|distribu\w*|recomend(?:a|am)|impulsion(?:a|am)|derrub\w*|limit(?:a|am)|reduz\w*|diminu\w*|aument\w*|ampli\w*|alcanc(?:a|am)|entreg(?:a|am)|tem (?:mais|menos)|d(?:a|ao) (?:mais|menos)|caiu|cairam|mostr(?:a|am)(?:\s+\S+){0,3}?\s+(?:primeiro|antes|para quem))\b/;
/*
 * ===== 2026-10-08 · A TRAVA POR SENTIDO, NÃO POR FRASE LITERAL =====
 *
 * No CSV de vídeo de 08/10, "Um site otimizado converte visitantes em
 * agendamentos" foi travada, mas "canais que convertem, como o site e o
 * WhatsApp" passou (lâmina 4 e corte 2): a conversão só contava com objeto
 * logo depois do verbo. E "Pacientes com dor ou necessidade procuram no
 * Google, não no Instagram" — comportamento do público sem fonte — não tinha
 * régua nenhuma (era o limite declarado no topo).
 *
 * O detector lê três sentidos:
 *   - PLATAFORMA: o de antes, mais a FINALIDADE dela ("foi feito para", "não
 *     serve para", "só serve para") com plataforma ou canal na frase — nos dois
 *     sentidos, como o mecanismo: é o absoluto da regra 17;
 *   - CONVERSAO: o EFEITO comercial afirmado — "convert(e|em)" conjugado, com
 *     ou sem objeto ("canais que convertem"), e verbo de efeito com objeto
 *     comercial ("gera agendamentos", "traz pacientes", "enche a agenda",
 *     "leva a agendamentos", "transforma seguidores em pacientes");
 *   - COMPORTAMENTO: o público como sujeito, no começo da oração, de buscar,
 *     decidir, escolher, confiar, chegar por… ("Pacientes com dor procuram no
 *     Google"), e o contraste "procura(m) no X, não no Y" com qualquer sujeito.
 *
 * A POLARIDADE vale para o efeito comercial e o comportamento: a frase que NEGA
 * o efeito ("O Instagram, sozinho, não enche a agenda", "Instagram não traz
 * pacientes") não afirma nada que peça fonte — é a tese do dono, e passa. A
 * negação conta ANTES do verbo, na mesma oração (até cinco palavras, sem
 * atravessar vírgula, ponto e vírgula, dois-pontos, parêntese ou travessão):
 * "procuram no Google, não no Instagram" nega o lugar, não o verbo, e trava.
 *
 * O que passa: orientação (imperativo, "deve", infinitivo de finalidade — "A
 * bio deve deixar claro quem você atende e como agendar", "para gerar
 * autoridade"), efeito delimitado por modal ("pode converter"), efeito sobre
 * o que não é resultado comercial ("gera confiança") e pergunta.
 */
/*
 * 2026-10-08 (correção da revisão) · o detector errava nos dois sentidos:
 *   - travava ORIENTAÇÃO: o próximo passo real do artigo ("Acesse a página … e
 *     descubra como aparecer no Google quando o paciente procura"), "Entenda o
 *     que seus clientes procuram", "Use hashtags locais para ajudar quem está
 *     perto…", "Evite dizer que o algoritmo prioriza vídeos curtos" e o efeito
 *     com modal ("Hashtags podem ajudar…"); travava a TESE negada quando o
 *     efeito comercial tinha mecanismo na frase ("O engajamento não garante
 *     pacientes" virava plataforma, antes da polaridade); travava a finalidade
 *     do GUIA ("Este guia foi pensado para quem usa o Instagram") e o público
 *     que só DEFINE o sujeito ("Quem busca atrair clientes… precisa de um perfil
 *     claro", "Pacientes que procuram tratamento merecem respostas claras");
 *   - deixava passar efeito comercial do caso real e formas comuns: "poucos se
 *     tornam pacientes", "recebem mais pacientes", "fecham mais", "a agenda
 *     enche", "capta pacientes", "faz a agenda encher", "dá mais alcance".
 * As regras, uma a uma:
 *   - "quando" não abre sujeito de comportamento: a oração temporal é condição,
 *     não afirmação ("aparecer no Google quando o paciente procura");
 *   - frase que ORIENTA (abre com imperativo) não afirma o que o público
 *     procura em "o que …" ("Entenda o que seus clientes procuram");
 *   - frase que orienta CONTRA ("Evite…", "Não prometa…", "Nunca diga…") não
 *     afirma o que manda evitar; só a causa que ela dá ("porque …", "pois …",
 *     depois de ponto e vírgula) passa pelo detector;
 *   - o efeito de plataforma no infinitivo depois de modal ou de "para" é
 *     possibilidade ou finalidade, não afirmação ("podem ampliar", "para ajudar");
 *   - o efeito COMERCIAL dito com mecanismo na frase é decidido pela
 *     polaridade da conversão, não pelo "nos dois sentidos" da plataforma;
 *   - a finalidade é da plataforma só quando ela (ou o pronome que a retoma, ou
 *     a frase que abre por ela) é o sujeito;
 *   - o público que só define o sujeito ("quem procura X", "pacientes que
 *     procuram X") seguido de verbo normativo (precisa, deve, merece, quer) e
 *     "buscar/procurar + infinitivo" (tentar) não afirmam comportamento.
 * Limites declarados: imperativo positivo com afirmação de plataforma ou
 * comportamento numa oração relativa ("Use stories, que o algoritmo
 * prioriza") continua travando — é afirmação; e a lista de imperativos é
 * curta (os de orientação comuns em artigo), sem pretender cobrir a língua.
 */
const CONVERSAO = /\bconvert(?:e|em|eu|eram|ia|iam)\b/g;
const OBJETO_COMERCIAL = "(?:agendamentos?|agenda|pacientes?|clientes?|vendas?|consultas?|leads?|faturamento|compras?|conversao|conversoes|orcamentos?|contratos?|negocios?)";
const DETERMINANTE = "(?:mais|muitos|muitas|novos|novas|o|a|os|as|seu|sua|seus|suas|um|uma|bons|boas|de|em)";
const EFEITO_COMERCIAL = new RegExp(
  `\\b(?:ger(?:a|am|ou|aram)|traz(?:em)?|trouxe(?:ram)?|ench(?:e|em)|lot(?:a|am)|aument(?:a|am)|multiplic(?:a|am)|dobr(?:a|am)|garant(?:e|em)|atra(?:i|em)|lev(?:a|am) a|result(?:a|am) em|vir(?:a|am)|(?:se\\s+)?torn(?:a|am|ou|aram)|capt(?:a|am|ou|aram)|fech(?:a|am|ou|aram))(?:\\s+${DETERMINANTE}){0,3}\\s+${OBJETO_COMERCIAL}\\b`,
  "g",
);
const TRANSFORMA = new RegExp(`\\btransform(?:a|am)(?:\\s+\\S+){1,3}?\\s+em(?:\\s+${DETERMINANTE}){0,2}\\s+${OBJETO_COMERCIAL}\\b`, "g");
/* 2026-10-08 (correção) · o efeito comercial em outras formas: "recebem mais pacientes" (só com quantificador — "recebe pacientes de segunda a sexta" é rotina), "fecham mais", "a agenda enche", "faz a agenda encher". */
const RECEBE_MAIS = new RegExp(`\\breceb(?:e|em|eu|eram)\\s+(?:mais|menos|muitos|muitas|novos|novas|o dobro de)(?:\\s+${DETERMINANTE})?\\s+${OBJETO_COMERCIAL}\\b`, "g");
const FECHA_MAIS = /\bfech(?:a|am|ou|aram)\s+mais\b/g;
const AGENDA_ENCHE = /\b(?:a|sua)\s+agenda(?:\s+\S+){0,2}?\s+(?<verbo>ench(?:e|eu)|lot(?:a|ou)|fic(?:a|ou)\s+(?:cheia|lotada))\b/g;
const FAZ_A_AGENDA = /\bfaz(?:em)?\s+(?:a|sua)\s+agenda\s+(?:encher|lotar)\b/g;
/* "a procura", "da busca", "na pesquisa": substantivo, não o público agindo. */
const NAO_E_VERBO = "(?<!\\b(?:a|da|na|pela|uma|sua|de|do|no|o)\\s)";
const PUBLICO = "(?:pacientes?|clientes?|pessoas|usuarios?|consumidores?|leitores?|leitoras?|publico|seguidores?|compradores?|internautas|maioria|quem)";
const VERBO_DO_PUBLICO = "(?:procur(?:a|am|ou|aram)|busc(?:a|am|ou|aram)|pesquis(?:a|am|ou|aram)|decid(?:e|em|iu|iram)|escolh(?:e|em|eu|eram)|prefer(?:e|em)|confi(?:a|am)|desconfi(?:a|am)|compram|agendam|marcam|clic(?:a|am)|ignor(?:a|am)|abandon(?:a|am)|desist(?:e|em)|cheg(?:a|am)\\s+(?:pelo|pela|por|via|ao))";
/*
 * O público no começo da oração (com artigo ou quantificador) e o verbo até cinco palavras depois, sem atravessar pontuação: "ao paciente", "para quem" não são sujeito.
 * 2026-10-08 (correção) · "quando" saiu de quem abre o sujeito (oração temporal é condição); os grupos dizem quem abriu, o público e o meio, para as exceções abaixo.
 */
const COMPORTAMENTO = new RegExp(
  `(?<abre>^|[,;:(]\\s*|\\b(?:que|e|mas|porque|pois|hoje|ja)\\s+)(?:(?:os|as|o|a|muitos|muitas|seus|suas|todos os|todas as|a maioria dos|a maioria das|grande parte dos|grande parte das)\\s+)?(?<publico>${PUBLICO})\\b(?<meio>(?:\\s+[^\\s,;:.!?()]+){0,5}?)\\s+${NAO_E_VERBO}(?<verbo>${VERBO_DO_PUBLICO})\\b`,
  "g",
);
const CONTRASTE_DE_BUSCA = new RegExp(`${NAO_E_VERBO}\\b(?:procur|busc|pesquis)(?:a|am|ou|aram)\\b[^,;:.!?]*?,?\\s+(?:e\\s+)?nao\\s+(?:no|na|nos|nas|pelo|pela|em)\\b`);
/* 2026-10-08 (correção) · a finalidade com a plataforma ou o canal como SUJEITO: até duas palavras antes, o pronome que a retoma, ou a oração coordenada de uma frase que abre por ela. */
const PLATAFORMA_OU_CANAL = "(?:instagram|tiktok|youtube|google|facebook|linkedin|whatsapp|reels?|stories|feed|site|blog|plataforma|redes? socia(?:l|is))";
const FINALIDADE_VERBO = "(?:(?:nao\\s+)?(?:foi|e|sao|foram)\\s+(?:\\S+\\s+)?(?:feit|desenhad|criad|pensad)(?:o|a|os|as)\\s+para|(?:nao|so)\\s+serv(?:e|em)\\s+para)";
const FINALIDADE_DO_SUJEITO = new RegExp(`\\b${PLATAFORMA_OU_CANAL}(?:\\s+\\S+){0,2}?\\s+${FINALIDADE_VERBO}\\b`);
const FINALIDADE_DO_PRONOME = new RegExp(`\\b${PLATAFORMA_OU_CANAL}\\b.*\\b(?:ele|ela|eles|elas)\\s+${FINALIDADE_VERBO}\\b`);
const FINALIDADE_COORDENADA = new RegExp(`^(?:(?:o|a|os|as|um|uma|seu|sua)\\s+)?${PLATAFORMA_OU_CANAL}\\b.*[,;]\\s*(?:(?:mas|e|porem)\\s+)?${FINALIDADE_VERBO}\\b`);
const QUEBRA_DE_ORACAO = /[,;:()—–]/;
const NEGA_O_VERBO = /^(?:nao|nunca|nem|jamais|nenhum|nenhuma|sem|ilusao|mito|falso|engano)$/;
/*
 * 2026-10-08 (correção) · o efeito de plataforma no infinitivo, depois de modal ou de "para": possibilidade ou finalidade, não afirmação.
 * 2026-10-09 · e depois de "como" e de "aprenda a"/"ensina a": o que se ensina a fazer. A meta e o H1 reais de tráfego
 * ("… e como reduzir a dependência de anúncios na sua clínica") travavam como "afirmação sobre plataforma".
 */
const MODAL_OU_FINALIDADE = /^(?:pode|podem|poderia|poderiam|podera|poderao|tende|tendem|costuma|costumam|consegue|conseguem|para|pra|como|aprenda|aprendam|aprender|aprende|ensina|ensinam|ensinar|ensinamos)$/;
const INFINITIVO_DO_EFEITO = /(?:ar|er|ir)$/;
/* A causa que a frase dá: depois dela, a oração afirma por conta própria. */
const CAUSA = /\b(?:porque|pois|ja que|uma vez que|afinal)\b|;/;
/* Os imperativos de orientação comuns em artigo (sem acento: a frase já vem normalizada). */
const IMPERATIVO_DE_ORIENTACAO: ReadonlySet<string> = new Set([
  "acesse", "acompanhe", "adicione", "agende", "ajuste", "analise", "anote", "apresente", "aplique", "aposte", "aprenda", "aproveite",
  "atualize", "avalie", "busque", "cadastre", "capte", "cite", "combine", "comece", "compare", "compartilhe", "configure", "confira",
  "conheca", "considere", "construa", "converse", "convide", "crie", "defina", "deixe", "demonstre", "descreva", "descubra", "desenvolva",
  "destaque", "diga", "direcione", "divulgue", "documente", "entenda", "ensine", "escolha", "escreva", "escute", "esteja", "estimule",
  "evite", "experimente", "explique", "explore", "faca", "fale", "foque", "garanta", "grave", "identifique", "inclua", "incentive",
  "informe", "interaja", "invista", "leia", "lembre", "liste", "mantenha", "mapeie", "marque", "meca", "monte", "mostre", "observe",
  "ofereca", "organize", "ouca", "peca", "pense", "pergunte", "personalize", "pesquise", "planeje", "poste", "prefira", "prepare",
  "priorize", "procure", "programe", "promova", "publique", "reforce", "registre", "responda", "revise", "saiba", "seja", "selecione",
  "separe", "siga", "tenha", "teste", "trabalhe", "transforme", "use", "valorize", "veja", "verifique",
]);
/* Orientar CONTRA: "Evite …", "Não prometa …", "Nunca diga …" — o que vem depois é o que NÃO se diz. */
const ORIENTA_CONTRA = /^(?:evite|evitem|(?:nao|nunca|jamais)\s+(?:diga|digam|prometa|prometam|afirme|afirmem|garanta|garantam|escreva|escrevam|repita|repitam|cite|citem|use|usem|publique|publiquem|invente|inventem|atribua|atribuam|confunda|confundam|venda|vendam|trate|tratem|apresente|apresentem))\b/;
/* "buscar/procurar + infinitivo" é tentar, não comportamento de busca; o substantivo em -ar/-er não conta como infinitivo. */
const SUBSTANTIVO_EM_R: ReadonlySet<string> = new Set(["lugar", "celular", "mulher", "colher", "poder", "prazer", "lazer", "olhar", "jantar", "bar", "mar", "lar", "par", "radar", "popular", "familiar"]);
/* O verbo normativo depois do público que só define o sujeito: "Quem procura um dentista quer saber…" — "já quer" é afirmação de estado e continua. */
const VERBO_NORMATIVO = /(?<!\bja\s)\b(?:precisa|precisam|deve|devem|merece|merecem|quer|querem)\b/;

/*
 * ===== 2026-10-09 · O OBJETIVO DO QUE SE CRIA OU ENSINA NÃO É AFIRMAÇÃO (defeito 7 dos 8 CSVs do Silo) =====
 *
 * Os CSVs reais de 09/10 marcavam "precisa de fonte" em título, meta e
 * promessa que só dizem o que o artigo ensina a fazer:
 *   - H1 de promoções: "Promoções para estética: como criar ofertas que atraem
 *     pacientes sem desvalorizar a clínica";
 *   - meta de promoções: "Aprenda a criar promoções para estética que atraem
 *     pacientes…"; a promessa: "…mostrando como criar ofertas que atraem…";
 *   - o CTA de Instagram: "…construir uma presença orgânica que traz pacientes";
 *   - o "Explicar" de tráfego: "Produção de conteúdo que atrai pacientes…".
 * A oração relativa ("que atraem pacientes") descreve o OBJETIVO do que se
 * cria ou se ensina — é orientação, não afirmação de que aquilo converte.
 * Conta quando o efeito abre a oração relativa ("que <verbo>") e o
 * antecedente, na mesma oração e a até seis palavras, é objeto de:
 *   - "como + infinitivo" ("como criar ofertas que…");
 *   - "aprenda a / ensina a + infinitivo" ("Aprenda a criar promoções… que…");
 *   - verbo de criação no infinitivo, no imperativo ou nominalizado (criar,
 *     montar, planejar, fazer, escrever, elaborar, produzir, construir,
 *     desenvolver, preparar, estruturar, redigir, gravar; criação, produção…).
 * E a PERGUNTA INDIRETA depois de verbo de conferir ("para avaliar se a
 * promoção atrai o paciente certo", "Acompanhe quantos leads se tornam
 * pacientes") pergunta, não afirma. "Por que" fica de fora: "Entenda por que
 * X gera pacientes" pressupõe que gera.
 *
 * O que continua travando: "canais que convertem" sem verbo de criação ("Use o
 * Instagram como vitrine, direcionando o público para canais que convertem,
 * como o site e o WhatsApp"), o particípio que afirma ("Promoções bem
 * planejadas atraem pacientes") e o comparativo ("Faça como as clínicas que
 * lotam a agenda": "como" seguido de artigo não é "como + infinitivo" nem
 * objeto do verbo de criação).
 */
/*
 * 2026-10-09 (correção) · A ISENÇÃO ERA LARGA DEMAIS. "como + qualquer
 * infinitivo" e "aprenda a + qualquer infinitivo" isentavam "Aprenda a
 * direcionar o público para canais que convertem" e "Saiba como escolher
 * canais que convertem"; a relativa com número, prazo ou comparação ("anúncios
 * que convertem 10 vezes mais", "ofertas que lotam a agenda em uma semana")
 * também passava, e "Faça parte das clínicas que lotam a agenda" e "Construir
 * autoridade é o que traz pacientes" viravam objetivo. Agora:
 *   - só o VERBO DE CRIAÇÃO abre o objetivo ("como criar", "aprenda a criar":
 *     o "como"/"aprenda a" sozinho não basta — o verbo de criação já os cobre);
 *   - "fazer/faça parte" não é criação;
 *   - a relativa que QUANTIFICA (número, %, "vezes", "dobro", "mais que",
 *     prazo como "em uma semana") afirma um resultado: trava;
 *   - o predicativo de cópula ("é o que traz", "são os que") afirma: trava.
 */
const VERBO_DE_CRIACAO = "(?:cri(?:ar|e|em)|criacao|mont(?:ar|e|em)|montagem|planej(?:ar|e|em)|planejamento|fazer(?!\\s+parte\\b)|fac(?:a|am)(?!\\s+parte\\b)|escrev(?:er|a|am)|elabor(?:ar|e|em)|elaboracao|produz(?:ir|a|am)|producao|constru(?:ir|a|am)|construcao|desenvolv(?:er|a|am)|desenvolvimento|prepar(?:ar|e|em)|estrutur(?:ar|e|em)|redig(?:ir|a|am)|grav(?:ar|e|em))";
/* O antecedente: até seis palavras na mesma oração, sem o "como" do comparativo. */
const ANTECEDENTE = "(?:\\s+(?!como\\b)[^\\s,;:.!?()—–\"“”]+){1,6}?";
const OBJETIVO_DO_QUE_SE_CRIA = new RegExp(`\\b${VERBO_DE_CRIACAO}${ANTECEDENTE}\\s+que\\s+(?:se\\s+)?$`);
/* "é o que", "são os que", "foi a que": o predicativo de cópula afirma. */
const PREDICATIVO_DE_COPULA = /\b(?:e|sao|foi|foram|era|eram|sera|serao|seria|seriam)\s+(?:o|a|os|as|aquilo|aquele|aquela|aqueles|aquelas)\s+que\s+(?:se\s+)?$/;
/* A relativa que quantifica o efeito afirma um resultado ("10 vezes mais", "30%", "mais que os anúncios", "em uma semana"). */
const RELATIVA_QUANTIFICADA = /\d|%|\b(?:vezes|dobro|triplo|metade)\b|\bmais\s+(?:que|do\s+que|de\s+\d)|\bem\s+(?:um|uma|dois|duas|tres|poucos|poucas|\d+)\s+(?:dia|dias|semana|semanas|mes|meses|hora|horas|minuto|minutos)\b/;
const VERBO_DE_CONFERIR = "(?:avali(?:ar|e|em)|verific(?:ar|a)|verifiqu(?:e|em)|confer(?:ir|e)|confir(?:a|am)|saber|saib(?:a|am)|descobr(?:ir|e)|descubr(?:a|am)|test(?:ar|e|em)|chec(?:ar|a)|chequ(?:e|em)|medir|mec(?:a|am)|entend(?:er|a|am)|perceb(?:er|a|am)|identific(?:ar|a)|identifiqu(?:e|em)|analis(?:ar|e|em)|diagnostic(?:ar|a)|diagnostiqu(?:e|em)|acompanh(?:ar|e|em)|observ(?:ar|e|em)|ver|vej(?:a|am)|cont(?:ar|e|em)|calcul(?:ar|e|em)|compar(?:ar|e|em)|pergunt(?:ar|e|em))";
const PERGUNTA_INDIRETA = new RegExp(`\\b${VERBO_DE_CONFERIR}\\s+(?:se|quant(?:o|a|os|as)|qual|quais)(?:\\s+[^\\s,;:.!?()—–\"“”]+){0,5}?\\s+$`);

/** O efeito em `posicao` descreve o objetivo do que se cria ou ensina, ou está numa pergunta indireta: orientação, não afirmação. */
function orientaPeloObjetivo(limpa: string, posicao: number): boolean {
  const antes = limpa.slice(0, posicao);
  if (PERGUNTA_INDIRETA.test(antes)) return true;
  if (!OBJETIVO_DO_QUE_SE_CRIA.test(antes) || PREDICATIVO_DE_COPULA.test(antes)) return false;
  /* 2026-10-09 (correção) · a relativa (até o fim da oração) que quantifica o efeito não é objetivo. */
  return !RELATIVA_QUANTIFICADA.test(limpa.slice(posicao).split(QUEBRA_DE_ORACAO)[0] || "");
}

const normal = (valor: string) => texto(valor).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/* A negação antes do verbo, na mesma oração: até cinco palavras para trás. */
function negadoAntes(limpa: string, posicao: number): boolean {
  const oracao = limpa.slice(0, posicao).split(QUEBRA_DE_ORACAO).pop() || "";
  return oracao.trim().split(/\s+/).filter(Boolean).slice(-5).some(palavra => NEGA_O_VERBO.test(palavra));
}

/* Alguma ocorrência AFIRMADA (sem negação antes do verbo): uma basta para pedir fonte. 2026-10-09 · nem o objetivo do que se cria, nem a pergunta indireta. */
function afirmaAlguma(limpa: string, regra: RegExp, posicaoDoVerbo: (achado: RegExpExecArray) => number = achado => achado.index): boolean {
  for (const achado of limpa.matchAll(regra)) {
    const posicao = posicaoDoVerbo(achado);
    if (!negadoAntes(limpa, posicao) && !orientaPeloObjetivo(limpa, posicao)) return true;
  }
  return false;
}

/* O infinitivo do efeito depois de modal ou de "para" (até duas palavras antes, na mesma oração). */
function delimitadoPorModal(limpa: string, posicao: number, verbo: string): boolean {
  if (!INFINITIVO_DO_EFEITO.test(verbo)) return false;
  const oracao = limpa.slice(0, posicao).split(QUEBRA_DE_ORACAO).pop() || "";
  return oracao.trim().split(/\s+/).filter(Boolean).slice(-2).some(palavra => MODAL_OU_FINALIDADE.test(palavra));
}

const abreComImperativo = (limpa: string) => {
  const primeira = (limpa.split(/\s+/)[0] || "").replace(/[^a-z-]/g, "");
  /* Ênclise com hífen ("Certifique-se", "Posicione-se") é imperativo. */
  return IMPERATIVO_DE_ORIENTACAO.has(primeira) || /^[a-z]{3,}-(?:se|o|a|os|as|lo|la|los|las|lhe|lhes)$/.test(primeira) || /^voce\s+(?:deve|precisa)\b/.test(limpa);
};

/** 2026-10-07 (revisão) · O que o detector da regra 17 acusa: afirmação sobre plataforma, sobre conversão do público, ou nada. 2026-10-08 · e sobre o comportamento do público. */
export type RadarPlatformClaimKind = "PLATAFORMA" | "CONVERSAO" | "COMPORTAMENTO";

export function radarPlatformClaimKind(frase: string): RadarPlatformClaimKind | null {
  const limpa = normal(frase);
  if (!limpa || limpa.endsWith("?")) return null;
  return sentidoDaOracao(limpa);
}

function sentidoDaOracao(limpa: string): RadarPlatformClaimKind | null {
  if (!limpa) return null;
  /* 2026-10-08 (correção) · quem orienta CONTRA não afirma o que manda evitar: só a causa que ele dá passa pelo detector. */
  if (ORIENTA_CONTRA.test(limpa)) {
    const causa = CAUSA.exec(limpa);
    return causa ? sentidoDaOracao(limpa.slice(causa.index + causa[0].length).trim()) : null;
  }
  /* O efeito comercial é decidido pela polaridade da conversão, mesmo com mecanismo na frase ("O engajamento não garante pacientes"). */
  const comerciais = new Set([...limpa.matchAll(EFEITO_COMERCIAL)].map(achado => achado.index));
  /* 2026-10-09 · o efeito que descreve o objetivo do que se cria ("Aprenda a criar anúncios que aumentam o alcance") ou que está numa pergunta indireta não afirma. */
  const efeitoDePlataforma = [...limpa.matchAll(new RegExp(EFEITO.source, "g"))]
    .some(achado => !comerciais.has(achado.index) && !delimitadoPorModal(limpa, achado.index, achado[0]) && !orientaPeloObjetivo(limpa, achado.index));
  const mecanismo = MECANISMO.test(limpa) || (RECURSO.test(limpa) && PLATAFORMA.test(limpa));
  if (mecanismo && efeitoDePlataforma) return "PLATAFORMA";
  for (const achado of limpa.matchAll(new RegExp(PLATAFORMA_ORDENA.source, "g"))) {
    const verbo = achado.groups?.verbo || "";
    const posicao = achado.index + achado[0].length - verbo.length;
    /* 2026-10-09 · "Descubra se o Instagram prioriza vídeos curtos" pergunta; a plataforma como sujeito só afirma fora da pergunta indireta. */
    if (!delimitadoPorModal(limpa, posicao, verbo.split(/\s+/)[0]) && !orientaPeloObjetivo(limpa, achado.index)) return "PLATAFORMA";
  }
  if (FINALIDADE_DO_SUJEITO.test(limpa) || FINALIDADE_DO_PRONOME.test(limpa) || FINALIDADE_COORDENADA.test(limpa)) return "PLATAFORMA";
  const verboDoGrupo = (achado: RegExpExecArray) => achado.index + achado[0].length - (achado.groups?.verbo?.length ?? 0);
  if (
    afirmaAlguma(limpa, CONVERSAO) || afirmaAlguma(limpa, EFEITO_COMERCIAL) || afirmaAlguma(limpa, TRANSFORMA) ||
    afirmaAlguma(limpa, RECEBE_MAIS) || afirmaAlguma(limpa, FECHA_MAIS) || afirmaAlguma(limpa, AGENDA_ENCHE, verboDoGrupo) || afirmaAlguma(limpa, FAZ_A_AGENDA)
  ) return "CONVERSAO";
  if (CONTRASTE_DE_BUSCA.test(limpa)) return "COMPORTAMENTO";
  const orienta = abreComImperativo(limpa);
  for (const achado of limpa.matchAll(COMPORTAMENTO)) {
    if (comportamentoAfirmado(limpa, achado, orienta)) return "COMPORTAMENTO";
  }
  return null;
}

/* O público como sujeito AFIRMA o que faz — salvo negação, "o que" de quem orienta, tentativa ("busca atrair") ou sujeito só definido. */
function comportamentoAfirmado(limpa: string, achado: RegExpExecArray, orienta: boolean): boolean {
  const verbo = achado.groups?.verbo || "";
  const posicao = achado.index + achado[0].length - verbo.length;
  if (negadoAntes(limpa, posicao)) return false;
  /* "Entenda o que seus clientes procuram": quem orienta pergunta o que o público procura, não afirma. */
  if (orienta && /\bque\s+$/.test(achado.groups?.abre || "") && /\bo\s*$/.test(limpa.slice(0, achado.index))) return false;
  const resto = (limpa.slice(posicao + verbo.length).split(QUEBRA_DE_ORACAO)[0] || "").trim();
  const seguinte = resto.split(/\s+/)[0] || "";
  /* "busca atrair", "procura entender": tentar, não buscar. */
  if (/^(?:busc|procur)/.test(verbo) && /^[a-z]{3,}(?:ar|er|ir)$/.test(seguinte) && !SUBSTANTIVO_EM_R.has(seguinte)) return false;
  /* "Quem procura um dentista quer saber…", "Pacientes que procuram tratamento merecem…": o público só define o sujeito. */
  const defineSujeito = achado.groups?.publico === "quem" || /\bque\b/.test(achado.groups?.meio || "");
  if (defineSujeito && VERBO_NORMATIVO.test(resto)) return false;
  return true;
}

export function radarPlatformClaimWithoutSource(frase: string): boolean {
  return radarPlatformClaimKind(frase) !== null;
}

/*
 * 2026-10-07 (revisão) · A POLARIDADE NAS AFIRMAÇÕES DO MERCADO. A porta casava
 * só raízes: "Mostrar por que o Instagram, sozinho, não enche a agenda" — a
 * tese do dono, do lado da fonte — era travada como se repetisse "O Instagram
 * enche a agenda da clínica", que o mercado repete e a fonte contradiz. Frase
 * que NEGA a afirmação do mercado não a reproduz: em (b) e (c) ela fica livre e
 * ainda passa pelo detector da regra 17, que pega afirmação de plataforma sem
 * fonte nos dois sentidos. O link externo da planta (a) não muda: ali é o
 * ASSUNTO que pede fonte, afirmado ou negado. Limite declarado: negação que não
 * toca a afirmação ("enche a agenda, não importa o nicho") também libera.
 */
const NEGACAO = /\b(nao|nunca|nem|jamais|nenhum|nenhuma|sem|ilusao|mito|falso|engano)\b/;
const nega = (valor: string) => NEGACAO.test(normal(valor));

const cortar = (valor: string, limite: number) => (valor.length > limite ? `${valor.slice(0, limite - 1).trimEnd()}…` : valor);
const semPontoFinal = (valor: string) => valor.trim().replace(/[.;:\s]+$/, "");

/*
 * Curto: o motivo vai numa lista que divide a célula com cortes e carrossel
 * (teto RADAR_VIDEO_EXPORT_CELL_CHARS). 2026-10-07 (revisão) · `limite`
 * (aditivo): quando a célula aperta, quem lista encurta a afirmação citada.
 */
/*
 * 2026-10-08 · D10 no motivo do link da planta: "(fonte a obter: oficial ou
 * verificada)" era espera aberta dentro do entregável. O motivo diz a regra
 * concluída — qual fonte a afirmação pede —; quem lista diz o que acontece sem
 * ela (fora do texto publicável, delimitada na fala).
 */
function motivoDe(afirmacao: RadarPendingClaim, limite = 100): string {
  const dita = `"${cortar(semPontoFinal(afirmacao.texto), limite)}"`;
  if (afirmacao.origem === "PLANTA") return `a planta pede fonte oficial ou verificada: ${dita}`;
  if (afirmacao.origem === "MERCADO_SEM_FONTE") return `o mercado repete sem fonte: ${dita}`;
  return `a fonte contradiz ou condiciona o que o mercado repete: ${dita}`;
}

export const RADAR_PLATFORM_CLAIM_REASON = "afirmação sobre plataforma sem fonte (regra 17 da planta)";
export const RADAR_CONVERSION_CLAIM_REASON = "afirmação sobre conversão do público sem fonte (regra 17 da planta)";
/** 2026-10-08 · O sentido novo do detector: o que o público faz, afirmado sem fonte. */
export const RADAR_BEHAVIOR_CLAIM_REASON = "afirmação sobre comportamento do público sem fonte (regra 17 da planta)";

const MOTIVO_DO_SENTIDO: Readonly<Record<RadarPlatformClaimKind, string>> = {
  PLATAFORMA: RADAR_PLATFORM_CLAIM_REASON,
  CONVERSAO: RADAR_CONVERSION_CLAIM_REASON,
  COMPORTAMENTO: RADAR_BEHAVIOR_CLAIM_REASON,
};

/** 2026-10-07 (revisão) · O motivo da trava com a afirmação citada até `limite` caracteres: a lista "Fica fora" encolhe por ele. */
export function radarClaimGateReason(porta: Extract<RadarClaimGate, { estado: "TRAVADA" }>, limite = 100): string {
  if (porta.afirmacao) return motivoDe(porta.afirmacao, limite);
  return porta.motivo;
}

/**
 * A PORTA: a frase está livre, tem fonte ou fica travada.
 *
 *   - (a) link externo da MESMA seção: divide 2 ou mais raízes distintivas com
 *     a frase (a seção já disse que aquela afirmação é dela);
 *   - (b) e (c), ou link de outra seção: a frase cobre 60% ou mais das raízes
 *     da afirmação, com pelo menos 2;
 *   - (d) o detector da regra 17, quando nenhuma fonte do pacote cobre a frase.
 *
 * A afirmação pendente vence a com fonte: frase que junta duas afirmações e só
 * uma tem fonte continua pedindo fonte. Pergunta não passa pelo detector — ela
 * não afirma —, mas passa pelas afirmações listadas.
 */
export function radarClaimGate(
  frase: string | null | undefined,
  pendentes: readonly RadarPendingClaim[],
  secao: number | null,
  opcoes: { comuns?: ReadonlySet<string> } = {},
): RadarClaimGate {
  const limpa = texto(frase);
  if (!limpa) return { estado: "LIVRE" };
  const comuns = opcoes.comuns || new Set<string>();
  const daFrase = raizesDistintivas(limpa, comuns);
  /* 2026-10-09 (correção) · as raízes de cada oração, para a semelhança alta do link da planta fora da seção dele. */
  const oracoesDaFrase = limpa.split(QUEBRA_DE_ORACAO_COORDENADA).map(oracao => raizesDistintivas(oracao, comuns)).filter(raizes => raizes.length);
  const mesmaSecao = (afirmacao: RadarPendingClaim) => afirmacao.secao !== null && secao !== null && afirmacao.secao === secao;
  const cobre = (afirmacao: RadarPendingClaim) => {
    const daAfirmacao = raizesDistintivas(afirmacao.texto, comuns);
    const divididas = emComum(daAfirmacao, daFrase).length;
    if (mesmaSecao(afirmacao)) return divididas >= 2;
    if (divididas < 2 || !daAfirmacao.length || divididas / daAfirmacao.length < 0.6) return false;
    /*
     * 2026-10-09 · O LINK DA PLANTA FORA DA SEÇÃO DELE PEDE SEMELHANÇA ALTA, NÃO
     * RAIZ SOLTA (defeito 7). A meta real de leads — "Entenda o que são leads
     * qualificados, a diferença para leads interessados e como gerá-los…" —
     * travava por "Diferença entre lead qualificado e interessado", o link da
     * seção 6: a meta trazia as raízes do link espalhadas entre outras oito.
     * Fora da seção que o escreveu, o link só alcança a frase que FALA dele:
     * as raízes em comum são metade ou mais das raízes distintivas da frase,
     * além dos 60% da afirmação. Na mesma seção vale a regra de antes (a seção
     * declarou que a afirmação é dela); as afirmações do mercado, (b) e (c),
     * também não mudam. A frase longa que cita a afirmação no meio de outras
     * ainda passa pelo detector por sentido (d).
     */
    if (afirmacao.origem !== "PLANTA") return true;
    /*
     * 2026-10-09 (correção) · A SEMELHANÇA ALTA É MEDIDA POR ORAÇÃO, E A
     * REPRODUÇÃO INTEIRA TRAVA SEMPRE. Medida sobre a frase inteira, ela
     * soltava dois casos: (1) no CSV real de tráfego, "O orgânico sustenta a
     * presença a longo prazo; o pago traz picos de tráfego quando necessário"
     * reafirma o link "Tráfego orgânico constrói presença estável a longo
     * prazo" numa oração e acrescenta outra — 3 de 7 raízes da frase, abaixo
     * da metade; (2) a meta, o H1 ou a promessa longa que traz INTEIRA a
     * afirmação da planta ("Descubra por que o Google responde por mais de 90%
     * das buscas no Brasil e como…") — e o detector por sentido não tem régua
     * para número. Agora a frase que traz 90% ou mais das raízes da afirmação
     * a reproduz, seja qual for o tamanho; senão, basta UMA oração (separada
     * por ";", ":", travessão, ", mas", ", e" ou " e " que abre sujeito) com
     * 60% da afirmação e metade das raízes dela. A meta de leads passa porque
     * os links dela são rótulos de tema, que (a) já não lista.
     */
    if (divididas / daAfirmacao.length >= 0.9) return true;
    return oracoesDaFrase.some(daOracao => {
      const naOracao = emComum(daAfirmacao, daOracao).length;
      return naOracao >= 2 && naOracao / daAfirmacao.length >= 0.6 && emComum(daOracao, daAfirmacao).length / daOracao.length >= 0.5;
    });
  };
  /* 2026-10-07 (revisão) · a frase que NEGA o que o mercado repete não o reproduz (a polaridade, acima); o link da planta trava nos dois sentidos. */
  const reproduz = (afirmacao: RadarPendingClaim) => afirmacao.origem === "PLANTA" || nega(limpa) === nega(afirmacao.texto);
  /* A afirmação da própria seção vem primeiro: o motivo cita o link que a seção escreveu, não o parecido de outra. */
  const ordenadas = [...pendentes.filter(mesmaSecao), ...pendentes.filter(afirmacao => !mesmaSecao(afirmacao))];
  const pendente = ordenadas.find(afirmacao => !afirmacao.fonte && cobre(afirmacao) && reproduz(afirmacao));
  if (pendente) return { estado: "TRAVADA", afirmacao: pendente, motivo: motivoDe(pendente) };
  const comFonte = ordenadas.find(afirmacao => afirmacao.fonte && cobre(afirmacao));
  if (comFonte) return { estado: "COM_FONTE", afirmacao: comFonte };
  const regra = radarPlatformClaimKind(limpa);
  if (regra) return { estado: "TRAVADA", afirmacao: null, motivo: MOTIVO_DO_SENTIDO[regra] };
  return { estado: "LIVRE" };
}

/*
 * ===== 2026-10-08 · A RÉGUA POR FRASE, PARA TODO ENTREGÁVEL =====
 *
 * O CSV para escrever, o CSV de vídeo e o Redator perguntam a mesma coisa de
 * cada frase: ela só entra com fonte? A resposta é a da porta (`radarClaimGate`)
 * — as afirmações listadas do pacote, a fonte do pacote que cobre a frase e o
 * detector por sentido, com a polaridade —, dita num formato que serve a quem
 * marca a frase no texto: "(precisa de fonte: <label>)".
 *
 *   - sem `pendentes`, vale só o detector por sentido (quem não tem o pacote à
 *     mão, como o Redator lendo o artigo-modelo, ainda pega o sentido);
 *   - frase coberta por fonte do pacote passa e leva a fonte (`source`);
 *   - a tese do dono passa pela polaridade: "O Instagram, sozinho, não enche a
 *     agenda" nega o efeito e não afirma nada que peça fonte.
 *
 * Domínio puro, como o resto do módulo. `reason` é o motivo inteiro (o mesmo da
 * lista "Fica fora" do vídeo); `label` é o curto, sem parênteses. Os dois saem
 * concluídos (D10): nada de "fonte a obter".
 */
export type RadarSentenceSourceContext = {
  /** As afirmações que pedem fonte (`radarPendingClaims`); ausente = só o detector por sentido. */
  pendentes?: readonly RadarPendingClaim[];
  /** A seção da planta onde a frase está (0 = primeira); ausente ou null = fora de seção. */
  secao?: number | null;
  /** As raízes que não distinguem assunto (`radarClaimCommonStems`). */
  comuns?: ReadonlySet<string>;
};

/** O que decidiu: livre, coberta por fonte do pacote, a afirmação listada (origem) ou o sentido detectado. */
export type RadarSentenceSourceKind = "LIVRE" | "COM_FONTE" | RadarPendingClaimOrigin | RadarPlatformClaimKind;

export type RadarSentenceSourceVerdict = {
  /** true = a frase só entra com fonte do pacote; sem ela, delimitada ou fora do texto publicável. */
  needs: boolean;
  /** O motivo inteiro (needs) ou a fonte que sustenta a frase (COM_FONTE); vazio quando livre. */
  reason: string;
  /** O motivo curto, para "(precisa de fonte: <label>)"; vazio quando a frase não precisa de fonte. */
  label: string;
  kind: RadarSentenceSourceKind;
  /** A fonte do pacote que cobre a frase: ela passa e leva a fonte. Null nos outros casos. */
  source: { id: string; url: string; titulo: string } | null;
};

const ROTULO_DA_ORIGEM: Readonly<Record<RadarPendingClaimOrigin, string>> = {
  PLANTA: "afirmação que a planta liga a fonte oficial ou verificada",
  MERCADO_SEM_FONTE: "o mercado repete sem fonte",
  MERCADO_X_FONTE: "a fonte contradiz ou condiciona o que o mercado repete",
};
const ROTULO_DO_SENTIDO: Readonly<Record<RadarPlatformClaimKind, string>> = {
  PLATAFORMA: "afirmação sobre plataforma",
  CONVERSAO: "afirmação sobre conversão do público",
  COMPORTAMENTO: "afirmação sobre comportamento do público",
};

export function radarSentenceNeedsSource(frase: string | null | undefined, contexto: RadarSentenceSourceContext = {}): RadarSentenceSourceVerdict {
  const porta = radarClaimGate(frase, contexto.pendentes || [], contexto.secao ?? null, { comuns: contexto.comuns });
  if (porta.estado === "LIVRE") return { needs: false, reason: "", label: "", kind: "LIVRE", source: null };
  if (porta.estado === "COM_FONTE") {
    const fonte = porta.afirmacao.fonte!;
    return { needs: false, reason: `fonte do pacote ${fonte.id}: ${fonte.titulo} (${fonte.url})`, label: "", kind: "COM_FONTE", source: fonte };
  }
  if (porta.afirmacao) return { needs: true, reason: radarClaimGateReason(porta), label: ROTULO_DA_ORIGEM[porta.afirmacao.origem], kind: porta.afirmacao.origem, source: null };
  /* Sem afirmação listada, a trava é do detector: o sentido sai dele (a frase não é pergunta nem vazia, ou a porta não teria travado). */
  const sentido = radarPlatformClaimKind(texto(frase)) ?? "PLATAFORMA";
  return { needs: true, reason: porta.motivo, label: ROTULO_DO_SENTIDO[sentido], kind: sentido, source: null };
}
