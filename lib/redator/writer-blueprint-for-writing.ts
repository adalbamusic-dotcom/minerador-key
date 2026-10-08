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
 *     H2 de hoje. Só existe na planta que leu a página publicada.
 *
 * Os três são ADITIVOS: sem nome antigo, sem frase marcada e sem página lida,
 * a projeção sai byte a byte como antes. Vale para artigo-modelo antigo, porque
 * é leitura, não gravação.
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
  radarArticleBlueprintPublishedMapLine,
  radarArticleBlueprintPublishedMapReading,
  radarArticleBlueprintWithCurrentNames,
  type RadarArticleBlueprintPayload,
  type RadarArticleBlueprintPublishedStructure,
} from "../radar/article-blueprint.ts";
import { radarPendingClaims, radarSentenceNeedsSource } from "../radar/pending-claims.ts";
import { radarSemanticStems } from "../radar/semantic-concept-model.ts";
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
 */
export const WRITER_BLUEPRINT_READING_RULES = "2026-10-08";

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

export type WriterArticleBlueprintForWritingInput = Parameters<typeof writerArticleBlueprintFoundation>[0] & {
  /** `payload.publishedStructure` da versão aprovada (a página que a IA viu ao montar). Ausente em versão antiga. */
  publishedStructure?: unknown;
  keywords?: WriterBlueprintKeywords | null;
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

/**
 * A PLANTA COM OS NOMES ATUAIS, tolerante ao que o banco devolveu. A troca é a
 * do Radar; aqui só a guarda: planta sem forma de objeto passa como veio, e
 * forma inesperada dentro dela (versão muito antiga) não derruba a leitura.
 */
export function writerBlueprintWithCurrentNames(blueprint: unknown, keywords: WriterBlueprintKeywords | null | undefined = null): unknown {
  if (!registro(blueprint)) return blueprint;
  try {
    return radarArticleBlueprintWithCurrentNames({ blueprint } as unknown as Pick<RadarArticleBlueprintPayload, "blueprint">, keywordsDe(keywords)).blueprint;
  } catch {
    return blueprint;
  }
}

/*
 * As frases de um texto da planta. A régua é por frase: "Precisa, e o gel-creme
 * resolve. Pacientes procuram no Google, não no Instagram." tem uma frase que
 * pede fonte, e é ela que vai na lista, não o parágrafo inteiro.
 */
const frasesDe = (valor: string): string[] =>
  valor.split(/(?<=[.!?…])\s+(?=["“(]?[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ0-9])/u).map(frase => frase.trim()).filter(Boolean);

/**
 * AS FRASES QUE SÓ ENTRAM COM FONTE, pela régua por frase do Radar. O que a
 * planta liga a uma fonte do pacote passa (a fonte vem só como id: a projeção
 * não lê `payload.sources`, e o id basta para a régua saber que há fonte).
 */
function frasesQuePedemFonte(planta: Linha, keywords: WriterBlueprintKeywords | null | undefined): { topo: WriterBlueprintSourceNeed[]; porSecao: WriterBlueprintSourceNeed[][] } {
  const L = WRITER_BLUEPRINT_FOR_WRITING_LIMITS;
  /* As seções na ordem do banco (o índice é o da régua: "mesma seção" do link externo). */
  const brutas = Array.isArray(planta.sections) ? planta.sections : [];
  const secoesDaRegua = brutas.map(item => ({
    externalLinks: registrosDe(registro(item)?.externalLinks).map(link => ({ claim: textoDe(link.claim), source: textoDe(link.source) || null })),
  }));
  const fontes = [...new Set(secoesDaRegua.flatMap(secao => secao.externalLinks.map(link => link.source)).filter((id): id is string => Boolean(id)))]
    .map(id => ({ id, url: "", title: "" }));
  const pendentes = radarPendingClaims(null, { blueprint: { sections: secoesDaRegua }, sources: fontes } as unknown as RadarArticleBlueprintPayload);
  const comuns = new Set(radarSemanticStems(textoDe(keywords?.principal)));

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
    for (const link of secoesDaRegua[indice].externalLinks) {
      if (!link.source && link.claim) marcar(lista, vistas, "externalLinks", link.claim, indice, L.sectionNeeds);
    }
    return lista;
  });
  return { topo, porSecao };
}

/**
 * O MAPA DA ATUALIZAÇÃO, numa frase concluída por H2 de hoje. Só a planta que
 * leu a página publicada (`publishedStructure`) tem de onde partir; a antiga
 * fica sem mapa — o CSV para escrever, que lê a página no ar, faz o casamento.
 */
function mapaDaAtualizacao(planta: Linha, publicada: unknown, keywords: WriterBlueprintKeywords | null | undefined): WriterBlueprintPublishedMapItem[] {
  const L = WRITER_BLUEPRINT_FOR_WRITING_LIMITS;
  const lida = registro(publicada);
  const h2 = textosDe(lida?.h2);
  if (!h2.length || !Array.isArray(planta.sections)) return [];
  const estrutura: RadarArticleBlueprintPublishedStructure = { h1: textoDe(lida?.h1) || null, h2 };
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
    return radarArticleBlueprintPublishedMapReading({ blueprint, publishedStructure: estrutura } as unknown as Parameters<typeof radarArticleBlueprintPublishedMapReading>[0], null, { keywords: keywordsDe(keywords) })
      .slice(0, L.publishedMapItems)
      .map(item => ({ current: cortar(item.current, L.currentChars), kind: item.kind, section: item.section, line: cortar(radarArticleBlueprintPublishedMapLine(item), L.lineChars) }));
  } catch {
    return [];
  }
}

/**
 * A PROJEÇÃO DA PLANTA PARA QUEM ESCREVE: a mesma `writerArticleBlueprintFoundation`
 * sobre a planta com os nomes atuais, mais as frases que pedem fonte e o mapa
 * da atualização — cada um só quando existe. `null` nos mesmos casos da
 * projeção (planta sem seções).
 */
export function writerArticleBlueprintForWriting(input: WriterArticleBlueprintForWritingInput): WriterArticleBlueprintFoundation | null {
  const { publishedStructure, keywords, ...base } = input;
  const blueprint = writerBlueprintWithCurrentNames(base.blueprint, keywords);
  const projetada = writerArticleBlueprintFoundation({ ...base, blueprint });
  const planta = registro(blueprint);
  if (!projetada || !planta) return projetada;

  const { topo, porSecao } = frasesQuePedemFonte(planta, keywords);
  /* As seções projetadas são as brutas com forma de objeto e H2 — a mesma ordem, o mesmo filtro. */
  const comH2 = (Array.isArray(planta.sections) ? planta.sections : [])
    .map((item, indice) => ({ secao: registro(item), indice }))
    .filter(({ secao }) => Boolean(secao && textoDe(secao.h2)))
    .map(({ indice }) => indice);
  const sections = projetada.sections.map((secao, posicao) => {
    const marcadas = porSecao[comH2[posicao] ?? -1] ?? [];
    return marcadas.length ? { ...secao, needsSource: marcadas } : secao;
  });
  const mapa = mapaDaAtualizacao(planta, publishedStructure, keywords);
  const mudouSecao = sections.some((secao, posicao) => secao !== projetada.sections[posicao]);
  if (!topo.length && !mudouSecao && !mapa.length) return projetada;
  return {
    ...projetada,
    sections: mudouSecao ? sections : projetada.sections,
    ...(topo.length ? { needsSource: topo } : {}),
    ...(mapa.length ? { publishedMap: mapa } : {}),
  };
}
