/**
 * ===== 2026-10-08 · O ARTIGO-MODELO PARA QUEM ESCREVE (Redator e MCP) =====
 *
 * Rodada de revisão dos entregáveis (desenho 2026-10-08, item E1). O CSV real
 * de 08/10 mostrou três defeitos que também chegavam ao Redator pela projeção
 * do artigo-modelo aprovado (`writerArticleBlueprintFoundation`):
 *
 *   - o nome antigo de produto ("Google Meu Negócio") ia para a IA que escreve,
 *     inclusive em artigo-modelo montado antes da regra do nome atual;
 *   - a frase da planta que AFIRMA efeito comercial, comportamento do público
 *     ou mecanismo de plataforma sem fonte ("Um site otimizado converte
 *     visitantes em agendamentos") chegava como texto a seguir, sem aviso;
 *   - no artigo publicado, o mapa da atualização (para onde vai cada H2 de
 *     hoje) ficava só no Radar.
 *
 * Aqui a planta lida do banco ganha, ANTES da projeção compacta:
 *
 *   - os nomes atuais (`radarArticleBlueprintWithCurrentNames`, a mesma troca
 *     do export) — a keyword que traz o nome antigo o preserva;
 *   - `needsSource`: as frases que a régua por frase do Radar
 *     (`radarSentenceNeedsSource`) marca — promessa, ângulo, título e meta,
 *     direção da abertura, fechamento e, por seção, resposta que abre,
 *     explicação, prática e as afirmações que a planta liga a fonte oficial
 *     sem fonte do pacote. A tese que NEGA o efeito passa (polaridade), e a
 *     frase coberta por fonte do pacote também;
 *   - `publishedMap`: o mapa da atualização lido pela régua do Radar
 *     (`radarArticleBlueprintPublishedMapReading`), numa frase concluída por
 *     H2 de hoje.
 *
 * Os três são ADITIVOS: sem nome antigo, sem frase marcada e sem página lida,
 * a projeção sai byte a byte como antes. Vale para artigo-modelo antigo, porque
 * é leitura, não gravação.
 *
 * ===== 2026-10-09 · O PROCESSO DO PILOTO NO REDATOR (regra do dono) =====
 *
 * "Tudo que é de processos antigos tem que ser substituído pelos novos
 * processos dos pilotos." A planta que o Redator lê passa pela MESMA leitura do
 * CSV (`radarArticleBlueprintPayloadReading`, com as fontes do pacote da planta
 * e as exclusões que os reajustes gravaram no ArticleDNA), e a trava de fonte é
 * a do CSV, inteira:
 *
 *   - `radarPendingClaims(p, planta)` com as AFIRMAÇÕES DO PACOTE (o que o
 *     mercado repete sem fonte e o que a fonte contradiz, de
 *     `observed.authorityEvidence`), e não mais só as da planta (`null`);
 *   - `radarClaimCommonStems(p, planta)`: as raízes da principal que estão em
 *     metade ou mais das seções não ligam uma frase a uma afirmação — as seções
 *     que viram capítulos, cenas e lâminas são conferidas pela mesma régua;
 *   - o mapa da atualização vale também na planta ANTIGA (sem a página que a IA
 *     viu) quando quem chama leu a página publicada agora (`currentStructure`),
 *     como o CSV faz;
 *   - o próximo passo que CHAMA sai na leitura; o que sobra em
 *     `closing.nextStep` é a leitura seguinte, OPCIONAL, nunca segunda chamada
 *     (`WRITER_BLUEPRINT_CONTINUATION_LABEL`).
 *
 * Por que módulo próprio, e não dentro de `writer-evidence-catalog.ts`: a régua
 * do Radar importa `portable-writing-export.ts`, que importa o catálogo do
 * Redator e usa `WRITER_EVIDENCE_LIMITS` no topo do módulo — importar a régua
 * de dentro do catálogo fecharia o ciclo e quebraria a carga. Quem chama é só o
 * servidor (fundamentos, pacote da seção e semeadura).
 *
 * Domínio puro: sem banco, sem rede, sem IA.
 */

import {
  radarArticleBlueprintPayloadReading,
  radarArticleBlueprintPublishedMapLine,
  radarArticleBlueprintPublishedMapReading,
  radarArticleBlueprintReading,
  radarArticleBlueprintWithCurrentNames,
  type RadarArticleBlueprintAi,
  type RadarArticleBlueprintPayload,
  type RadarArticleBlueprintPublishedStructure,
} from "../radar/article-blueprint.ts";
import { radarClaimCommonStems, radarPendingClaims, radarSentenceNeedsSource, type RadarPendingClaim } from "../radar/pending-claims.ts";
import type { RadarResearchScopeExclusion } from "../radar/article-research-context.ts";
import type { RadarWritingProjections } from "../radar/portable-writing-export.ts";
import {
  writerArticleBlueprintFoundation,
  type WriterArticleBlueprintFoundation,
  type WriterBlueprintPublishedMapItem,
  type WriterBlueprintSourceNeed,
} from "./writer-evidence-catalog.ts";

/**
 * A versão da leitura desta rodada. Entra na identidade da fatia
 * `radar.blueprint/<id>`: a versão aprovada é imutável, mas a leitura com os
 * nomes atuais muda o que a fatia devolve — o etag de antes não vale mais.
 *
 * 2026-10-09b · a leitura passou a usar as fontes do pacote da planta e as
 * exclusões do ArticleDNA (a mesma do CSV): a fatia muda de novo.
 */
export const WRITER_BLUEPRINT_READING_RULES = "2026-10-09b";

export const WRITER_BLUEPRINT_FOR_WRITING_LIMITS = Object.freeze({
  /** Frases marcadas fora das seções (promessa, ângulo, título, abertura, fechamento). */
  topNeeds: 8,
  /** Frases marcadas por seção. */
  sectionNeeds: 6,
  sentenceChars: 240,
  publishedMapItems: 20,
  currentChars: 160,
  lineChars: 300,
});

/** As keywords do artigo, como o dossiê as traz (`keywordContext`). */
export type WriterBlueprintKeywords = { principal?: string | null; secondary?: readonly string[] | null };

/** 2026-10-09 · As exclusões dos reajustes no ArticleDNA e o núcleo do artigo (a mesma opção da leitura do CSV). */
export type WriterBlueprintExclusions = { items: readonly RadarResearchScopeExclusion[]; core: readonly string[] };

/**
 * 2026-10-09 · O que a leitura da planta usa além dela. Todos opcionais: sem
 * eles, a leitura de antes (o rótulo de tema, a demonstração, o H3 repetido, a
 * promessa e o próximo passo que chama).
 */
export type WriterBlueprintReadingOptions = {
  /** `payload.sources` da versão aprovada: só a fonte do pacote da planta sustenta um link externo. */
  sources?: unknown;
  /** As exclusões do ArticleDNA: a seção (ou o H3) que cobre um assunto excluído sai, como no CSV. */
  exclusions?: WriterBlueprintExclusions | null;
};

/**
 * 2026-10-09 · As afirmações do pacote para a trava (`radarPendingClaims`).
 * Quem tem a projeção inteira do export (a semeadura, pela montagem do CSV) a
 * passa; quem só tem o dossiê (fundamentos, pacote da seção) passa
 * `observed.authorityEvidence` do pacote congelado.
 */
export type WriterBlueprintClaimContext = {
  projections?: Pick<RadarWritingProjections, "dna" | "autoridade" | "serp"> | null;
  authorityEvidence?: unknown;
};

export type WriterArticleBlueprintForWritingInput = Parameters<typeof writerArticleBlueprintFoundation>[0] & {
  /** `payload.publishedStructure` da versão aprovada (a página que a IA viu ao montar). Ausente em versão antiga. */
  publishedStructure?: unknown;
  /**
   * 2026-10-09 · A página publicada lida AGORA (H1 e H2), como o CSV a lê: vale
   * sobre a da planta (é a de hoje) e dá o mapa também à planta antiga.
   */
  currentStructure?: unknown;
  keywords?: WriterBlueprintKeywords | null;
  /** 2026-10-09 · `payload.sources` da versão aprovada (a leitura compartilhada e a trava). */
  sources?: unknown;
  exclusions?: WriterBlueprintExclusions | null;
  claims?: WriterBlueprintClaimContext | null;
};

type Linha = Record<string, unknown>;

const registro = (valor: unknown): Linha | null => (valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Linha : null);
const registrosDe = (valor: unknown): Linha[] => (Array.isArray(valor) ? valor : []).map(registro).filter((item): item is Linha => Boolean(item));
const textoDe = (valor: unknown): string => (typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "");
const textosDe = (valor: unknown): string[] => (Array.isArray(valor) ? valor : []).map(textoDe).filter(Boolean);

const cortar = (valor: string, limite: number) => {
  const caracteres = [...valor];
  return caracteres.length > limite ? `${caracteres.slice(0, limite - 1).join("").trimEnd()}…` : valor;
};

const keywordsDe = (keywords: WriterBlueprintKeywords | null | undefined): string[] =>
  [textoDe(keywords?.principal), ...textosDe(keywords?.secondary)].filter(Boolean);

/** 2026-10-09 · As fontes do pacote da planta, com a forma que a leitura e a trava conferem; `null` = não informadas. */
export function writerBlueprintSourcesOf(valor: unknown): RadarArticleBlueprintPayload["sources"] | null {
  if (!Array.isArray(valor)) return null;
  return registrosDe(valor)
    .map(item => ({ id: textoDe(item.id), url: textoDe(item.url), title: textoDe(item.title), claim: textoDe(item.claim) }))
    .filter(item => item.id);
}

/**
 * A PLANTA COM OS NOMES ATUAIS E A LEITURA DO CSV, tolerante ao que o banco
 * devolveu. A troca e a leitura são as do Radar; aqui só a guarda: planta sem
 * forma de objeto passa como veio, e forma inesperada dentro dela (versão muito
 * antiga) não derruba a leitura.
 */
export function writerBlueprintWithCurrentNames(
  blueprint: unknown,
  keywords: WriterBlueprintKeywords | null | undefined = null,
  opcoes: WriterBlueprintReadingOptions = {},
): unknown {
  if (!registro(blueprint)) return blueprint;
  let comNomes: unknown = blueprint;
  try {
    comNomes = radarArticleBlueprintWithCurrentNames({ blueprint } as unknown as Pick<RadarArticleBlueprintPayload, "blueprint">, keywordsDe(keywords)).blueprint;
  } catch {
    return blueprint;
  }
  /*
   * 2026-10-09 (correção) · A MESMA LEITURA DO CSV PARA ESCREVER. O Redator lia
   * a planta gravada: o rótulo de tema continuava "precisa de fonte", a promessa
   * levava a moldura e o público duplo, o H3 repetia o H2 de outra seção e o
   * "Próximo passo" podia ser uma segunda chamada. A leitura é a do Radar
   * (`radarArticleBlueprintReading`); o próximo passo que CHAMA ("Acesse a
   * página…") sai, e o que só aponta a leitura seguinte fica — opcional, e o
   * Redator o diz assim. Planta com forma inesperada fica só com os nomes atuais.
   *
   * 2026-10-09 · COM AS FONTES DO PACOTE, a função compartilhada inteira
   * (`radarArticleBlueprintPayloadReading`): só a fonte que o pacote da planta
   * tem sustenta um link externo, como no CSV e no vídeo. E as exclusões do
   * ArticleDNA tiram a seção que cobre um assunto excluído.
   */
  const fontes = writerBlueprintSourcesOf(opcoes.sources);
  const exclusions = opcoes.exclusions?.items.length ? { exclusions: opcoes.exclusions } : {};
  try {
    if (fontes) {
      const payload = { blueprint: comNomes, sources: fontes } as unknown as RadarArticleBlueprintPayload;
      return radarArticleBlueprintPayloadReading(payload, { withoutCallInNextStep: true, ...exclusions }).blueprint;
    }
    return radarArticleBlueprintReading(comNomes as RadarArticleBlueprintAi, { withoutCallInNextStep: true, ...exclusions }).blueprint;
  } catch {
    return comNomes;
  }
}

/*
 * As frases de um texto da planta. A régua é por frase: "Precisa, e o gel-creme
 * resolve. Pacientes procuram no Google, não no Instagram." tem uma frase que
 * pede fonte, e é ela que vai na lista, não o parágrafo inteiro.
 */
const frasesDe = (valor: string): string[] =>
  valor.split(/(?<=[.!?…])\s+(?=["“(]?[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ0-9])/u).map(frase => frase.trim()).filter(Boolean);

/*
 * ===== 2026-10-09 · AS AFIRMAÇÕES DO PACOTE, NA FORMA QUE A TRAVA LÊ =====
 *
 * A trava do CSV (`radarPendingClaims`) lê três coisas da projeção do export:
 * a principal (`dna.principalKeyword`), as afirmações de autoridade do pacote
 * (`autoridade`: as que pedem fonte, as sustentadas e os conflitos mercado ×
 * fonte) e as afirmações de YMYL da SERP (`serp.authorityClaims`). O Redator
 * tem as duas primeiras no dossiê congelado (`observed.authorityEvidence`);
 * aqui só a guarda da forma: afirmação sem texto, sem id ou sem a relevância
 * YMYL não entra (a régua do Radar a leria e cairia).
 */
export function writerBlueprintClaimProjections(input: { principal: string | null | undefined; authorityEvidence?: unknown }): Pick<RadarWritingProjections, "dna" | "autoridade" | "serp"> {
  const lida = registro(input.authorityEvidence);
  const claims = registrosDe(lida?.claims)
    .filter(claim => typeof claim.claimId === "string" && textoDe(claim.canonicalClaim) && typeof registro(claim.ymyl)?.relevance === "string")
    .map(claim => ({ ...claim, market: { ...(registro(claim.market) ?? {}), supportingCompetitors: registrosDe(registro(claim.market)?.supportingCompetitors) } }));
  const factualEvidence = registrosDe(lida?.factualEvidence).filter(item => typeof item.claimId === "string");
  const marketVsFactConflicts = registrosDe(lida?.marketVsFactConflicts).filter(item => textoDe(item.canonicalClaim));
  return {
    dna: { principalKeyword: textoDe(input.principal) },
    autoridade: lida ? { ...lida, claims, factualEvidence, marketVsFactConflicts } : null,
    serp: { authorityClaims: [] },
  } as unknown as Pick<RadarWritingProjections, "dna" | "autoridade" | "serp">;
}

/**
 * 2026-10-09 · A TRAVA DO CSV PARA A PLANTA DE QUEM ESCREVE: as afirmações que
 * pedem fonte (as da planta e as do pacote) e as raízes que não distinguem
 * assunto, calculadas pela régua do Radar sobre a planta LIDA.
 */
export function writerBlueprintClaimLock(input: {
  planta: Pick<RadarArticleBlueprintPayload, "blueprint" | "sources">;
  principal: string | null | undefined;
  claims?: WriterBlueprintClaimContext | null;
}): { pendentes: RadarPendingClaim[]; comuns: ReadonlySet<string> } {
  const p = (input.claims?.projections ?? writerBlueprintClaimProjections({ principal: input.principal, authorityEvidence: input.claims?.authorityEvidence })) as RadarWritingProjections;
  const planta = input.planta as RadarArticleBlueprintPayload;
  return { pendentes: radarPendingClaims(p, planta), comuns: radarClaimCommonStems(p, planta) };
}

/**
 * AS FRASES QUE SÓ ENTRAM COM FONTE, pela régua por frase do Radar. O que a
 * planta liga a uma fonte do pacote passa.
 *
 * 2026-10-09 · Com as fontes do pacote (`payload.sources`), só elas sustentam
 * (sem elas, o id gravado no link basta, como antes); e as afirmações do
 * pacote entram na trava, com as raízes comuns pela planta.
 */
function frasesQuePedemFonte(
  planta: Linha,
  keywords: WriterBlueprintKeywords | null | undefined,
  fontesDoPacote: RadarArticleBlueprintPayload["sources"] | null,
  claims: WriterBlueprintClaimContext | null | undefined,
): { topo: WriterBlueprintSourceNeed[]; porSecao: WriterBlueprintSourceNeed[][] } {
  const L = WRITER_BLUEPRINT_FOR_WRITING_LIMITS;
  /* As seções na ordem do banco (o índice é o da régua: "mesma seção" do link externo). */
  const brutas = Array.isArray(planta.sections) ? planta.sections : [];
  const secoesDaRegua = brutas.map(item => {
    const secao = registro(item);
    return {
      h2: textoDe(secao?.h2),
      readerQuestion: textoDe(secao?.readerQuestion),
      answerFirst: textoDe(secao?.answerFirst),
      explain: textosDe(secao?.explain),
      externalLinks: registrosDe(secao?.externalLinks).map(link => ({ claim: textoDe(link.claim), source: textoDe(link.source) || null })),
    };
  });
  const fontes = fontesDoPacote ?? [...new Set(secoesDaRegua.flatMap(secao => secao.externalLinks.map(link => link.source)).filter((id): id is string => Boolean(id)))]
    .map(id => ({ id, url: "", title: "", claim: "" }));
  const { pendentes, comuns } = writerBlueprintClaimLock({
    planta: { blueprint: { sections: secoesDaRegua } as unknown as RadarArticleBlueprintAi, sources: fontes },
    principal: keywords?.principal,
    claims,
  });

  const marcar = (alvo: WriterBlueprintSourceNeed[], vistas: Set<string>, campo: string, valor: unknown, secao: number | null, teto: number) => {
    for (const frase of frasesDe(textoDe(valor))) {
      if (alvo.length >= teto) return;
      const chave = frase.toLocaleLowerCase("pt-BR");
      if (vistas.has(chave)) continue;
      const veredito = radarSentenceNeedsSource(frase, { pendentes, secao, comuns });
      if (!veredito.needs) continue;
      vistas.add(chave);
      alvo.push({ field: campo, sentence: cortar(frase, L.sentenceChars), label: veredito.label });
    }
  };

  const topo: WriterBlueprintSourceNeed[] = [];
  const vistasNoTopo = new Set<string>();
  const titulo = registro(planta.title);
  const abertura = registro(planta.opening);
  const fechamento = registro(planta.closing);
  for (const [campo, valor] of [
    ["title.h1", titulo?.h1], ["title.seoTitle", titulo?.seoTitle], ["title.metaDescription", titulo?.metaDescription],
    ["promise", planta.promise], ["angle", registro(planta.angle)?.statement], ["opening.direction", abertura?.direction],
    ["closing.turn", fechamento?.turn], ["closing.cta", fechamento?.cta], ["closing.nextStep", fechamento?.nextStep],
  ] as const) marcar(topo, vistasNoTopo, campo, valor, null, L.topNeeds);

  const porSecao = brutas.map((item, indice) => {
    const secao = registro(item);
    const lista: WriterBlueprintSourceNeed[] = [];
    if (!secao) return lista;
    const vistas = new Set<string>();
    marcar(lista, vistas, "answerFirst", secao.answerFirst, indice, L.sectionNeeds);
    for (const explicacao of textosDe(secao.explain)) marcar(lista, vistas, "explain", explicacao, indice, L.sectionNeeds);
    marcar(lista, vistas, "practical", secao.practical, indice, L.sectionNeeds);
    /* A afirmação que a planta liga a fonte oficial e o pacote não tem: entra com o motivo da planta. */
    const idsDoPacote = new Set(fontes.map(fonte => fonte.id));
    for (const link of secoesDaRegua[indice].externalLinks) {
      if ((!link.source || !idsDoPacote.has(link.source)) && link.claim) marcar(lista, vistas, "externalLinks", link.claim, indice, L.sectionNeeds);
    }
    return lista;
  });
  return { topo, porSecao };
}

/** A estrutura publicada (H1 e H2) que veio do banco ou da leitura da página; `null` sem H2. */
const estruturaPublicadaDe = (valor: unknown): RadarArticleBlueprintPublishedStructure | null => {
  const lida = registro(valor);
  const h2 = textosDe(lida?.h2);
  return h2.length ? { h1: textoDe(lida?.h1) || null, h2 } : null;
};

/**
 * O MAPA DA ATUALIZAÇÃO, numa frase concluída por H2 de hoje.
 *
 * 2026-10-09 · Como o CSV: a página lida AGORA (`currentStructure`) vale sobre
 * a que a IA viu ao montar (`publishedStructure`), e dá o mapa também à planta
 * antiga, que não leu a página. Sem nenhuma das duas, sem mapa. As exclusões do
 * ArticleDNA tiram o H2 publicado do assunto excluído.
 */
function mapaDaAtualizacao(
  planta: Linha,
  publicada: unknown,
  atual: unknown,
  keywords: WriterBlueprintKeywords | null | undefined,
  exclusoes: WriterBlueprintExclusions | null | undefined,
): WriterBlueprintPublishedMapItem[] {
  const L = WRITER_BLUEPRINT_FOR_WRITING_LIMITS;
  const estrutura = estruturaPublicadaDe(atual) ?? estruturaPublicadaDe(publicada);
  if (!estrutura || !Array.isArray(planta.sections)) return [];
  /* A régua lê seções, H3 e o mapa como a planta os grava: o que vier sem forma vira vazio. */
  const blueprint = {
    ...planta,
    sections: registrosDe(planta.sections).map(secao => ({ ...secao, h2: textoDe(secao.h2), readerQuestion: textoDe(secao.readerQuestion), h3: textosDe(secao.h3) })),
    publishedMap: registrosDe(planta.publishedMap).map(item => ({
      current: textoDe(item.current),
      section: typeof item.section === "number" || item.section === null ? item.section : 0,
      reason: textoDe(item.reason),
      ...(item.origin === "ai" || item.origin === "match" ? { origin: item.origin } : {}),
    })),
  };
  try {
    return radarArticleBlueprintPublishedMapReading(
      { blueprint, publishedStructure: estrutura } as unknown as Parameters<typeof radarArticleBlueprintPublishedMapReading>[0],
      estrutura.h2,
      { keywords: keywordsDe(keywords), ...(exclusoes?.items.length ? { exclusions: exclusoes } : {}) },
    )
      .slice(0, L.publishedMapItems)
      .map(item => ({ current: cortar(item.current, L.currentChars), kind: item.kind, section: item.section, line: cortar(radarArticleBlueprintPublishedMapLine(item), L.lineChars) }));
  } catch {
    return [];
  }
}

/**
 * A PROJEÇÃO DA PLANTA PARA QUEM ESCREVE: a mesma `writerArticleBlueprintFoundation`
 * sobre a planta LIDA (nomes atuais e a leitura do CSV), mais as frases que
 * pedem fonte e o mapa da atualização — cada um só quando existe. `null` nos
 * mesmos casos da projeção (planta sem seções).
 */
export function writerArticleBlueprintForWriting(input: WriterArticleBlueprintForWritingInput): WriterArticleBlueprintFoundation | null {
  const { publishedStructure, currentStructure, keywords, sources, exclusions, claims, ...base } = input;
  const blueprint = writerBlueprintWithCurrentNames(base.blueprint, keywords, { sources, exclusions });
  const projetada = writerArticleBlueprintFoundation({ ...base, blueprint });
  const planta = registro(blueprint);
  if (!projetada || !planta) return projetada;

  const { topo, porSecao } = frasesQuePedemFonte(planta, keywords, writerBlueprintSourcesOf(sources), claims);
  /* As seções projetadas são as brutas com forma de objeto e H2 — a mesma ordem, o mesmo filtro. */
  const comH2 = (Array.isArray(planta.sections) ? planta.sections : [])
    .map((item, indice) => ({ secao: registro(item), indice }))
    .filter(({ secao }) => Boolean(secao && textoDe(secao.h2)))
    .map(({ indice }) => indice);
  const sections = projetada.sections.map((secao, posicao) => {
    const marcadas = porSecao[comH2[posicao] ?? -1] ?? [];
    return marcadas.length ? { ...secao, needsSource: marcadas } : secao;
  });
  const mapa = mapaDaAtualizacao(planta, publishedStructure, currentStructure, keywords, exclusions);
  const mudouSecao = sections.some((secao, posicao) => secao !== projetada.sections[posicao]);
  if (!topo.length && !mudouSecao && !mapa.length) return projetada;
  return {
    ...projetada,
    sections: mudouSecao ? sections : projetada.sections,
    ...(topo.length ? { needsSource: topo } : {}),
    ...(mapa.length ? { publishedMap: mapa } : {}),
  };
}
