import { RADAR_SPECIALIST_CLASSIFICATION_LABELS, RADAR_SPECIALIST_DECISION_LABELS } from "./specialist-contribution-review.ts";
import { radarSpecialistDecisionIsActive } from "./specialist-contribution-review.ts";
import type { RadarSpecialistEvidenceLayer } from "./specialist-evidence.ts";
import type { RadarVideoEvidenceLayer } from "./video-evidence.ts";
import { RADAR_VIDEO_USAGE_HINT, RADAR_VIDEO_USAGE_LABEL, type RadarVideoUsage } from "./video-library.ts";

/**
 * ===== OS ANEXOS, PROJETADOS DO CANÔNICO — PARITY_1 · §3, §4 e §9 =====
 *
 * ==================== O QUE MUDOU NO PARITY_1 ====================
 *
 * Até aqui este módulo NORMALIZAVA: ele lia contribuição e casamento do banco e
 * inventava um formato só dele. Isso fazia do export uma SEGUNDA AUTORIDADE —
 * duas verdades sobre a mesma resposta de especialista, e a primeira divergência
 * apareceria num artigo já escrito.
 *
 * Agora ele PROJETA. A entrada são as camadas canônicas do bundle V3
 * (`RadarVideoEvidenceLayer`, `RadarSpecialistEvidenceLayer`) — as MESMAS que o
 * Planejador recebe. O que este arquivo faz é escolher o que sai para fora da
 * plataforma e escrever isso em português.
 *
 * ==================== DUAS COISAS QUE NÃO SÃO A MESMA ====================
 *
 * A PESQUISA DE YOUTUBE lê a SERP de vídeo: títulos, canais, duração, posição.
 * Ninguém assiste nada, e é por isso que ela nunca afirma o que um vídeo diz.
 *
 * A BIBLIOTECA DE VÍDEOS da marca é outra coisa: fontes que uma pessoa
 * escolheu, com texto extraído, casadas contra as pautas da investigação. Aqui
 * existe conteúdo — trechos ancorados em tempo, conferíveis no vídeo.
 *
 * ==================== A PRIVACIDADE SAI AQUI — §3 e §4 ====================
 *
 * A camada canônica carrega identidade de domínio porque o Planejador audita
 * com ela. O CSV vai para FORA da plataforma: `videoSourceId`, `contributionId`,
 * `briefId`, `requirementId` e a proveniência do canal não atravessam.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

const lista = (itens: readonly string[]): string[] => itens.filter(Boolean).map(item => `- ${item}`);

const tempo = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/* ============================ §3 · a biblioteca ============================ */

export type RadarPortableVideoExtract = {
  sourceTitle: string;
  text: string;
  startLabel: string;
  endLabel: string;
  whyRelevant: string;
  supports: string[];
  answersQuestion: string[];
  limitations: string[];
  /*
   * 2026-10-02 · O modo de uso da fonte deste trecho (Adendo B). As três chaves
   * só EXISTEM quando o dono escolheu um modo: sem modo, o trecho sai byte a
   * byte como antes. O endereço é público (YouTube); o id da fonte não sai.
   */
  usage?: RadarVideoUsage;
  usageLabel?: string;
  sourceUrl?: string | null;
  /**
   * 2026-10-02 · O canal (ou autor) do vídeo, para a citação ser atribuída a
   * ele. Como as três chaves acima, só existe quando o dono escolheu um modo.
   */
  sourceChannel?: string | null;
};

/**
 * 2026-10-02 · UM VÍDEO SELECIONADO COM MODO DE USO (Adendo B, D6).
 *
 * Lido AO VIVO no export (fora do pacote congelado e do hash), um por vínculo
 * ativo com modo. "Não usar" nunca chega aqui: ele some da projeção.
 */
export type RadarPortableVideoSelected = {
  title: string;
  url: string | null;
  channel: string | null;
  duration: string | null;
  usage: Exclude<RadarVideoUsage, "NOT_USED">;
  usageLabel: string;
  /** O que o modo pede a quem escreve, em uma frase. */
  usageHint: string;
  /** A nota curta do dono, quando há. */
  note: string | null;
  /** A seção da pauta que este vídeo sustentou no casamento (sugestão para Incorporar). */
  section: string | null;
  /** O trecho casado desta fonte, com tempo (Apoio, Citação, Incorporar). Nunca a transcrição. */
  excerpt: { text: string; startLabel: string; endLabel: string } | null;
  /** Do que o vídeo trata (Contexto e Sugestão de pauta): começo da transcrição ou, sem ela, a descrição, curto. */
  summary: string | null;
  /**
   * 2026-10-02 · De onde o resumo saiu: o começo da TRANSCRIÇÃO (fala do vídeo)
   * ou a DESCRIÇÃO do canal (texto promocional, último recurso). Opcional: sem
   * ela, a linha diz "Do que trata", como antes.
   */
  summarySource?: "TRANSCRIPT" | "DESCRIPTION";
  /**
   * 2026-10-02 · O começo da transcrição corrente, curto, em QUALQUER modo
   * (o CSV de vídeo diz do que cada vídeo selecionado trata). Opcional e
   * ausente sem transcrição; o CSV para escrever não o usa: nele, Apoio,
   * Citação e Incorporar seguem levando o trecho casado.
   */
  transcriptStart?: string;
  /** 2026-10-02 · Aditivo: o corpo da transcrição (com teto), só para o CSV de vídeo escolher o trecho do tema. */
  transcriptBody?: string;
};

/** O que o export lê do banco para cada vínculo com modo. Tem o id: fica do lado de dentro. */
export type RadarPortableVideoUsageInput = {
  videoSourceId: string;
  usage: RadarVideoUsage;
  note: string | null;
  title: string | null;
  url: string | null;
  channel: string | null;
  duration: string | null;
  description: string | null;
  /** O começo do texto corrente, já curto. 2026-10-02 · lido para todo modo, só da versão corrente. */
  textPreview: string | null;
  /**
   * 2026-10-02 · Aditivo: o corpo da transcrição corrente, com teto (20 mil
   * caracteres no leitor), para o CSV de vídeo escolher o trecho ligado ao tema.
   * Ausente ou nulo = a linha de antes.
   */
  textBody?: string | null;
};

export type RadarPortableVideoContext = {
  /** `NO_LIBRARY` e `NO_MATCHING` pedem ações diferentes — §14. */
  state: "NO_LIBRARY" | "NO_MATCHING" | "MATCHED";
  note: string;
  briefs: Array<{
    topic: string;
    narrativePurpose: string;
    whatToLookFor: string[];
    relatedSection: string | null;
    coverage: string;
    reason: string;
    matchedCriteria: string[];
    missingCriteria: string[];
    extracts: RadarPortableVideoExtract[];
  }>;
  sources: Array<{ title: string; languageCode: string | null }>;
  summary: { briefs: number; supported: number; partial: number; notFound: number; extracts: number; sources: number };
  /**
   * 2026-10-02 · Os vídeos selecionados com modo de uso (Adendo B). OPCIONAL e
   * ausente sem modo nenhum: quem não conhece ignora, e a saída de antes não muda.
   */
  selected?: RadarPortableVideoSelected[];
};

const COBERTURA: Record<string, string> = {
  SUPPORTED: "Sustentada pelo material da biblioteca",
  PARTIAL: "Parcialmente sustentada",
  NOT_FOUND: "Não encontrada no material disponível",
};

const SEM_BIBLIOTECA = "Nenhum vídeo da biblioteca foi selecionado e casado com as pautas deste artigo.";

/* 2026-10-02 · Quando os únicos trechos casados são de vídeos marcados "Não usar" (Adendo B). */
const SO_NAO_USAR = "Os trechos casados vêm de vídeos marcados como \"Não usar\" no Radar: nenhum deles entra neste artigo.";
const COBERTURA_SO_NAO_USAR = "Sem trecho utilizável: o vídeo que sustentava esta pauta está marcado como \"Não usar\"";

/* A ordem de leitura de quem escreve: o que entra no texto primeiro, o que só orienta depois. */
const ORDEM_DOS_MODOS: Record<RadarPortableVideoSelected["usage"], number> = { EMBED: 0, QUOTE: 1, SUPPORT: 2, TOPIC_SUGGESTION: 3, CONTEXT: 4 };

const curto = (valor: string, limite: number): string => {
  const limpo = valor.replace(/\s+/g, " ").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1).trimEnd()}…` : limpo;
};

/**
 * OS SELECIONADOS COM MODO — 2026-10-02 (Adendo B, D6).
 *
 * Um por vínculo ativo com modo, "Não usar" fora. O trecho (Apoio, Citação,
 * Incorporar) é o do casamento desta fonte — o que responde o título primeiro —
 * e nunca a transcrição: até 400 caracteres.
 *
 * Revisão de 2026-10-02 (pedido do dono): o resumo (Contexto, Sugestão de
 * pauta) é o COMEÇO DA TRANSCRIÇÃO, até 300 caracteres — a descrição do YouTube
 * costuma ser promocional ("inscreva-se", links, cupom) e não diz do que o
 * vídeo trata. A descrição só entra sem transcrição, e mais curta (160).
 */
const RESUMO_DA_TRANSCRICAO = 300;
const RESUMO_DA_DESCRICAO = 160;
function radarPortableVideoSelected(
  usages: readonly RadarPortableVideoUsageInput[],
  layer: RadarVideoEvidenceLayer | null,
): RadarPortableVideoSelected[] {
  const nomeNaCamada = new Map((layer?.sources || []).map(item => [item.videoSourceId, item.displayName]));
  return usages
    .filter((item): item is RadarPortableVideoUsageInput & { usage: RadarPortableVideoSelected["usage"] } => item.usage !== "NOT_USED")
    .map(item => {
      const trechos = (layer?.results || []).flatMap(resultado => resultado.extracts
        .filter(trecho => trecho.videoSourceId === item.videoSourceId)
        .map(trecho => ({ secao: resultado.relatedSectionTitle, trecho })));
      const melhor = trechos.find(entrada => entrada.trecho.answersTitle) || trechos[0] || null;
      const comTrecho = item.usage === "SUPPORT" || item.usage === "QUOTE" || item.usage === "EMBED";
      const comResumo = item.usage === "CONTEXT" || item.usage === "TOPIC_SUGGESTION";
      const daTranscricao = comResumo && item.textPreview ? curto(item.textPreview, RESUMO_DA_TRANSCRICAO) : null;
      const daDescricao = comResumo && !daTranscricao && item.description ? curto(item.description, RESUMO_DA_DESCRICAO) : null;
      /* 2026-10-02 · o começo da fala em qualquer modo, para o CSV de vídeo; a chave só existe com transcrição. */
      const comecoDaFala = item.textPreview?.trim() ? curto(item.textPreview, RESUMO_DA_TRANSCRICAO) : null;
      return {
        title: item.title || nomeNaCamada.get(item.videoSourceId) || "Vídeo da biblioteca",
        url: item.url,
        channel: item.channel,
        duration: item.duration,
        usage: item.usage,
        usageLabel: RADAR_VIDEO_USAGE_LABEL[item.usage],
        usageHint: RADAR_VIDEO_USAGE_HINT[item.usage],
        note: item.note ? curto(item.note, 500) : null,
        section: melhor?.secao ?? null,
        excerpt: comTrecho && melhor
          ? { text: curto(melhor.trecho.originalText, 400), startLabel: tempo(melhor.trecho.startMs), endLabel: tempo(melhor.trecho.endMs) }
          : null,
        summary: daTranscricao || daDescricao,
        ...(daTranscricao ? { summarySource: "TRANSCRIPT" as const } : daDescricao ? { summarySource: "DESCRIPTION" as const } : {}),
        ...(comecoDaFala ? { transcriptStart: comecoDaFala } : {}),
        ...(item.textBody?.trim() ? { transcriptBody: item.textBody } : {}),
      };
    })
    .sort((a, b) => ORDEM_DOS_MODOS[a.usage] - ORDEM_DOS_MODOS[b.usage] || a.title.localeCompare(b.title, "pt-BR"));
}

/**
 * UMA LINHA POR VÍDEO COM MODO — a mesma frase no CSV "para escrever", no CSV
 * de vídeo e no formato completo (2026-10-02). Sem transcrição: só o trecho
 * casado, curto, com o tempo.
 *
 * 2026-10-02 · `planSections` é OPCIONAL e só o CSV "para escrever" o passa,
 * quando há artigo-modelo aprovado: as seções em que o plano pôs este vídeo
 * (Incorporar, Citação, Apoio). Lista vazia = o plano não o pôs em seção
 * nenhuma; `null` (o padrão) = sem plano a consultar, e a linha é a de antes.
 */
export function radarPortableVideoUsageLine(item: RadarPortableVideoSelected, planSections: readonly string[] | null = null): string {
  const citavel = item.usage === "EMBED" || item.usage === "QUOTE" || item.usage === "SUPPORT";
  const noPlano = citavel && planSections ? planSections.filter(Boolean) : [];
  const secoesDoPlano = ` · seção do artigo-modelo ${noPlano.map(secao => `"${secao}"`).join(", ")}`;
  /*
   * 2026-10-02 · CADA VÍDEO DIZ O CANAL. O vídeo selecionado pode ser de outro
   * canal, e Citação e Apoio são atribuídos a ele; sem canal registrado na
   * biblioteca, a linha diz isso em vez de calar.
   */
  const canal = item.channel?.trim() ? ` · canal: ${item.channel.trim()}` : " · canal não registrado na biblioteca";
  const partes = [`${item.usageLabel} · "${item.title}"${item.url ? ` (${item.url})` : ""}${canal} — ${item.usageHint}`];
  if (item.usage === "EMBED") {
    if (noPlano.length) partes.push(secoesDoPlano);
    else if (planSections) {
      partes.push(item.section
        ? ` · seção sugerida "${item.section}" (o artigo-modelo não pôs o vídeo em seção nenhuma)`
        : " · seção: a que o vídeo responde (o artigo-modelo não indicou)");
    } else partes.push(item.section ? ` · seção sugerida "${item.section}"` : " · seção: a que o vídeo responde (definir no artigo-modelo)");
  }
  if (item.usage === "SUPPORT" || item.usage === "QUOTE") {
    partes.push(item.excerpt
      ? `: (${item.excerpt.startLabel}–${item.excerpt.endLabel}) "${item.excerpt.text}"`
      : " (nenhum trecho casado: escolher no vídeo e anotar o tempo)");
    if (noPlano.length) partes.push(secoesDoPlano);
  } else if (item.usage === "EMBED" && item.excerpt) {
    partes.push(` · ponto alto: ${item.excerpt.startLabel}–${item.excerpt.endLabel}`);
  }
  if (item.usage === "TOPIC_SUGGESTION") partes.push(" (passa pela SERP e pelo artigo-modelo; não é citável)");
  /* 2026-10-02 · o resumo diz de onde veio: fala do vídeo (começo da transcrição) ou texto do canal. */
  if (item.summary) {
    partes.push(item.summarySource === "TRANSCRIPT"
      /* 2026-10-08 (correção da revisão) · D10: a regra concluída, não "conferir antes de usar". */
      ? `. Começo da transcrição (fala do vídeo, transcrição automática: cite só o que o vídeo confirma): "${item.summary}"`
      : item.summarySource === "DESCRIPTION"
        ? `. Descrição do canal (sem transcrição; texto do canal, não fala do vídeo): ${item.summary}`
        : `. Do que trata: ${item.summary}`);
  }
  if (item.note) partes.push(` · Nota do dono: ${item.note}`);
  return partes.join("");
}

/**
 * `usages` é OPCIONAL (2026-10-02, Adendo B): sem ele, ou sem modo nenhum, a
 * projeção sai byte a byte como antes. Com ele:
 *
 *   - "Não usar" SOME: os trechos casados dessa fonte e a própria fonte saem
 *     da projeção. O casamento gravado e a impressão digital dele não mudam —
 *     a decisão é de uso, não de evidência;
 *   - cada trecho de fonte com modo leva o modo (e o endereço do vídeo);
 *   - `selected` lista os vídeos com modo, mesmo os que nenhuma pauta casou.
 */
export function radarPortableVideoContext(
  layer: RadarVideoEvidenceLayer | null,
  usages: readonly RadarPortableVideoUsageInput[] | null = null,
): RadarPortableVideoContext {
  const modos = new Map((usages || []).map(item => [item.videoSourceId, item]));
  const naoUsar = new Set((usages || []).filter(item => item.usage === "NOT_USED").map(item => item.videoSourceId));
  const selected = usages?.length ? radarPortableVideoSelected(usages, layer) : [];
  const comSelecionados = (contexto: RadarPortableVideoContext): RadarPortableVideoContext =>
    (selected.length ? { ...contexto, selected } : contexto);

  if (!layer) {
    return comSelecionados({
      state: "NO_LIBRARY",
      note: SEM_BIBLIOTECA,
      briefs: [], sources: [],
      summary: { briefs: 0, supported: 0, partial: 0, notFound: 0, extracts: 0, sources: 0 },
    });
  }

  /* §3 · o NOME da fonte. O id dela fica na camada canônica, onde é auditado. */
  const nomes = new Map(layer.sources.map(item => [item.videoSourceId, item]));

  let removidos = 0;
  const briefs = layer.results.map(resultado => {
    const usaveis = resultado.extracts.filter(trecho => !naoUsar.has(trecho.videoSourceId));
    removidos += resultado.extracts.length - usaveis.length;
    return {
      topic: resultado.topic,
      narrativePurpose: resultado.narrativePurpose,
      whatToLookFor: [...resultado.whatToLookFor],
      relatedSection: resultado.relatedSectionTitle,
      coverage: resultado.extracts.length && !usaveis.length ? COBERTURA_SO_NAO_USAR : COBERTURA[resultado.state] || COBERTURA.NOT_FOUND,
      reason: resultado.reason,
      matchedCriteria: [...resultado.matchedCriteria],
      missingCriteria: [...resultado.missingCriteria],
      extracts: usaveis.map(trecho => {
        const base: RadarPortableVideoExtract = {
          sourceTitle: nomes.get(trecho.videoSourceId)?.displayName || "Fonte da biblioteca",
          text: trecho.originalText,
          startLabel: tempo(trecho.startMs),
          endLabel: tempo(trecho.endMs),
          whyRelevant: trecho.reasonForRelevance,
          supports: [...trecho.matchedCriteria],
          answersQuestion: [...trecho.matchedQuestions],
          limitations: [...trecho.limitations],
        };
        const modo = modos.get(trecho.videoSourceId);
        /* 2026-10-02 · com modo, o trecho leva também o canal, para a atribuição. */
        return modo && modo.usage !== "NOT_USED"
          ? { ...base, usage: modo.usage, usageLabel: RADAR_VIDEO_USAGE_LABEL[modo.usage], sourceUrl: modo.url, sourceChannel: modo.channel }
          : base;
      }),
    };
  });

  const fontes = layer.sources.filter(item => !naoUsar.has(item.videoSourceId));
  const trechos = removidos ? briefs.reduce((soma, brief) => soma + brief.extracts.length, 0) : layer.summary.extracts;

  return comSelecionados({
    state: trechos ? "MATCHED" : "NO_MATCHING",
    note: trechos
      ? "Os trechos abaixo vêm de vídeos que a marca selecionou e cujo texto foi extraído. Cada um está ancorado no tempo e pode ser conferido no vídeo."
      : removidos
        ? SO_NAO_USAR
        : "As pautas foram casadas contra o material selecionado e nenhum trecho sustentou nenhuma delas.",
    briefs,
    sources: fontes.map(item => ({
      title: item.displayName || "Fonte da biblioteca",
      languageCode: item.languageCode,
    })),
    summary: removidos || fontes.length !== layer.sources.length
      ? { ...layer.summary, extracts: trechos, sources: fontes.length }
      : { ...layer.summary },
  });
}

/* 2026-10-02 · O bloco dos modos de uso, no fim do Markdown; ausente sem modo. */
const blocoDosModos = (contexto: RadarPortableVideoContext): string[] => (contexto.selected?.length
  ? ["", "## Modo de uso escolhido no Radar (decisão do dono)", ...lista(contexto.selected.map(item => radarPortableVideoUsageLine(item)))]
  : []);

export function radarVideoContextMarkdown(contexto: RadarPortableVideoContext): string {
  if (contexto.state === "NO_LIBRARY") return [`# Vídeos da biblioteca\n\n${contexto.note}`, ...blocoDosModos(contexto)].join("\n");

  return [
    "# Vídeos da biblioteca",
    "",
    contexto.note,
    ...contexto.briefs.flatMap(brief => [
      "",
      `## ${brief.topic}`,
      `Função na narrativa: ${brief.narrativePurpose}`,
      ...(brief.relatedSection ? [`Aplicar em: ${brief.relatedSection}`] : []),
      `Cobertura: ${brief.coverage}. ${brief.reason}`,
      ...(brief.missingCriteria.length ? ["Ainda não encontrado:", ...lista(brief.missingCriteria)] : []),
      ...brief.extracts.flatMap(trecho => [
        "",
        `### Trecho de "${trecho.sourceTitle}" (${trecho.startLabel}–${trecho.endLabel})`,
        `> ${trecho.text.replaceAll("\n", " ")}`,
        `Por que serve: ${trecho.whyRelevant}`,
        ...(trecho.supports.length ? [`Sustenta: ${trecho.supports.join(" · ")}`] : []),
        ...(trecho.limitations.length ? ["Cuidado:", ...lista(trecho.limitations)] : []),
        ...(trecho.usage && trecho.usageLabel ? [`Modo de uso (escolhido no Radar): ${trecho.usageLabel} — ${RADAR_VIDEO_USAGE_HINT[trecho.usage]}`] : []),
      ]),
    ]),
    ...blocoDosModos(contexto),
    "",
    "Os trechos acima são citações do material original. Use-os como evidência; não os apresente como texto próprio sem atribuição.",
  ].join("\n").trim();
}

/* ============================ §4 · o especialista ============================ */

export type RadarPortableSpecialistItem = {
  requirementQuestion: string | null;
  questionsSent: string[];
  /** O recorte declarado do que foi dito. Nunca texto novo. */
  contribution: string;
  /** A resposta original, autoridade de fidelidade. */
  fullAnswer: string;
  classification: string;
  status: string;
  approved: boolean;
  appliesTo: string;
  quote: string | null;
  limitations: string[];
  /** Tipo do ponto: REVIEW_POINT…, ou FECHAMENTO, CTA e DIRETRIZ do parecer direto. Opcional (aditivo). */
  kind?: string | null;
};

export type RadarPortableSpecialistContext = {
  state: "NONE" | "RECEIVED";
  note: string;
  items: RadarPortableSpecialistItem[];
  pending: number;
  rejected: number;
};

export const RADAR_NO_SPECIALIST = "Nenhuma contribuição especializada recebida.";

export function radarPortableSpecialistContext(layer: RadarSpecialistEvidenceLayer | null): RadarPortableSpecialistContext {
  if (!layer || !layer.items.length) {
    const pending = layer?.notApproved ?? 0;
    const rejected = layer?.rejected ?? 0;
    return {
      state: "NONE",
      /*
       * A FRASE É EXPLÍCITA DE PROPÓSITO — §14.
       *
       * Uma coluna vazia não distingue "não houve especialista" de "o export
       * esqueceu de trazer". Quem consome de fora precisa saber a diferença
       * antes de decidir escrever sem lastro profissional.
       */
      note: pending || rejected
        ? `${RADAR_NO_SPECIALIST} Há ${pending} resposta(s) aguardando decisão e ${rejected} recusada(s): nenhuma delas pode ser usada como evidência.`
        : RADAR_NO_SPECIALIST,
      items: [], pending, rejected,
    };
  }

  return {
    state: "RECEIVED",
    note: "As contribuições abaixo foram revisadas e aprovadas por uma pessoa. Cada uma responde a um ponto preparado pela investigação.",
    items: layer.items.map(item => ({
      requirementQuestion: item.requirementQuestion,
      questionsSent: [...item.sentQuestions],
      contribution: item.extractedSummary,
      fullAnswer: item.originalText,
      classification: RADAR_SPECIALIST_CLASSIFICATION_LABELS[item.classification] || item.classification,
      status: RADAR_SPECIALIST_DECISION_LABELS[item.humanDecision] || item.humanDecision,
      approved: radarSpecialistDecisionIsActive(item.humanDecision),
      appliesTo: item.editorialUse,
      quote: item.quote,
      kind: item.requirementKind || null,
      /*
       * "APOIO" NÃO SUSTENTA AFIRMAÇÃO FACTUAL, e isso precisa viajar.
       *
       * Quem marcou a contribuição como apoio decidiu que ela ORIENTA o texto.
       * Sem esta linha, ela chega lá fora com o mesmo peso de uma evidência
       * aceita — e vira afirmação atribuída a um profissional.
       */
      limitations: item.humanDecision === "SUPPORT_ONLY"
        ? ["Esta contribuição foi marcada como APOIO: ela orienta o texto, e não sustenta afirmação factual sozinha."]
        : [],
    })),
    pending: layer.notApproved,
    rejected: layer.rejected,
  };
}

export function radarSpecialistContextMarkdown(contexto: RadarPortableSpecialistContext): string {
  if (contexto.state === "NONE") return `# Especialista\n\n${contexto.note}`;

  return [
    "# Especialista",
    "",
    contexto.note,
    ...contexto.items.flatMap((item, indice) => [
      "",
      `## ${item.requirementQuestion || `Contribuição ${indice + 1}`}`,
      ...(item.questionsSent.length ? ["Perguntas enviadas:", ...lista(item.questionsSent)] : []),
      "",
      "Contribuição:",
      item.contribution,
      ...(item.quote ? ["", `Citação literal autorizada: "${item.quote}"`] : []),
      "",
      `Aplicar em: ${item.appliesTo}`,
      `Natureza: ${item.classification}`,
      `Status: ${item.status}`,
      ...(item.limitations.length ? ["", "Limitações:", ...lista(item.limitations)] : []),
    ]),
    ...(contexto.pending || contexto.rejected
      ? ["", `Fora deste dossiê: ${contexto.pending} resposta(s) aguardando decisão e ${contexto.rejected} recusada(s). Nenhuma delas pode sustentar afirmação.`]
      : []),
  ].join("\n").trim();
}
