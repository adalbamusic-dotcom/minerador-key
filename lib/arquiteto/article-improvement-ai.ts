import { z } from "zod";
import {
  editorialAiBarrier,
  IMPROVEMENT_AI_MAX_PER_TARGET,
  IMPROVEMENT_ARTICLE_MAX_KEYWORDS,
  type ImprovementEditorialPick,
  type ImprovementKeyword,
  type ImprovementProposal,
  type ImprovementTarget,
} from "./article-improvement.ts";

/**
 * LEITURA EDITORIAL DA IA NA LISTA EXISTENTE — "Melhorar publicados e formar
 * Assuntos" (decisão do dono, 2026-09-30: "Sim, lista primeiro").
 *
 * Ordem: 1 pares da SERP → 2 IA na lista → 3 busca nova no Google Ads.
 * A IA recebe, numa chamada só, os alvos que ficaram sem proposta pronta e a
 * lista livre da marca com volume validado; devolve de 1 a 3 keywords por
 * alvo, com papel e uma frase de motivo. Ela tem a MENOR autoridade: ids fora
 * do pedido são recusados, as barreiras do código valem sobre qualquer
 * resposta, e nada é gravado sem o clique do dono. Para gravar, o parecer da
 * SERP da composição final continua obrigatório.
 */

/**
 * Limite de tempo da chamada: cabe na preparação (a rota tem 120 s; o tempo da
 * IA sai do orçamento da busca gratuita). Ids curtos (A1, K1) e uma frase por
 * escolha mantêm a resposta pequena o bastante para esse limite.
 */
export const IMPROVEMENT_AI_TIMEOUT_MS = 40_000;
/** A lista enviada é limitada para o pedido caber num lote só. */
export const IMPROVEMENT_AI_MAX_LIST = 200;
/**
 * Alvos por chamada. Cada escolha custa ~50 tokens de saída (apelidos, papel e
 * uma frase curta): 12 alvos × 3 escolhas ≈ 1.800 tokens, o que cabe no teto
 * de saída abaixo e, na velocidade usual da DeepSeek sem Thinking, perto dos
 * 40 s. Com 30 alvos a resposta passava do teto e saía truncada (JSON
 * quebrado = leitura perdida). Quem passar disso fica para outra preparação.
 */
export const IMPROVEMENT_AI_MAX_TARGETS = 12;
export const IMPROVEMENT_AI_MAX_TOKENS = 2000;
/** Apelidos curtos no pedido; o código traduz de volta. Apelido desconhecido = id inventado. */
export type ImprovementAiAliases = { targets: Record<string, string>; keywords: Record<string, string> };
const MAX_STORED_REJECTIONS = 40;
const MAX_REASON_LENGTH = 240;

/**
 * O envelope que a camada de IA confere: só `{ picks: [...] }`. Cada escolha é
 * conferida uma a uma em `validateImprovementAiPicks` — uma escolha malformada
 * (papel "secundária" com acento, motivo longo, campo a mais) é recusada ou
 * normalizada sozinha, sem derrubar as boas.
 */
export const ImprovementAiResponseSchema = z.object({ picks: z.array(z.unknown()).max(400) }).passthrough();
const ImprovementAiPickSchema = z.object({
  targetId: z.string().trim().min(1).max(160),
  keywordId: z.string().trim().min(1).max(160),
  role: z.string().max(40),
  reason: z.string().max(2000),
}).passthrough();
/** "Secundária", " PRINCIPAL " → secundaria, principal; qualquer outro papel é recusado. */
function aiRole(value: string): "principal" | "secundaria" | null {
  const plain = value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return plain === "principal" || plain === "secundaria" ? plain : null;
}
function aiReason(value: string): string | null {
  const plain = value.replace(/\s+/g, " ").trim();
  if (plain.length < 3) return null;
  return plain.length > MAX_REASON_LENGTH ? `${plain.slice(0, MAX_REASON_LENGTH - 1).trimEnd()}…` : plain;
}

/** `keyword`/`theme` guardam o texto para a tela mostrar a recusa sem depender da lista projetada. */
export type ImprovementAiRejection = { targetId: string | null; keywordId: string | null; reason: string; keyword?: string | null; theme?: string | null };
/** O que a execução guarda da IA: responde uma vez por execução, nunca de novo no collect. */
export type ImprovementEditorialAi = {
  status: "answered" | "failed" | "off" | "skipped";
  askedTargetIds: string[];
  listSize: number;
  picks: ImprovementEditorialPick[];
  rejected: ImprovementAiRejection[];
  rejectedCount: number;
  message?: string;
};

/** Todos os alvos que a IA poderia ler: sem proposta pronta pela SERP, com Silo e com vaga. */
export function improvementAiEligibleTargets(targets: readonly ImprovementTarget[], proposals: readonly ImprovementProposal[]): ImprovementTarget[] {
  return targets.filter(target => {
    const proposal = proposals.find(p => p.targetId === target.id);
    return target.territoryRef && proposal?.status !== "ready" && target.memberIds.length < IMPROVEMENT_ARTICLE_MAX_KEYWORDS;
  });
}
/**
 * Os que vão nesta chamada (até `IMPROVEMENT_AI_MAX_TARGETS`). Primeiro os
 * artigos com menos keywords: sem isso, a chamada lia sempre os mesmos 12
 * primeiros e os demais nunca eram lidos, mesmo depois de os 12 melhorarem.
 */
export function improvementAiTargets(targets: readonly ImprovementTarget[], proposals: readonly ImprovementProposal[]): ImprovementTarget[] {
  const eligible = improvementAiEligibleTargets(targets, proposals);
  const order = new Map(eligible.map((target, index) => [target.id, index]));
  return [...eligible]
    .sort((a, b) => a.memberIds.length - b.memberIds.length || order.get(a.id)! - order.get(b.id)!)
    .slice(0, IMPROVEMENT_AI_MAX_TARGETS);
}

/**
 * A lista livre: keywords da marca já no Arquiteto, com volume do Google Ads
 * validado, sem publicação, sem dono (ArticleDNA aprovado ou formação
 * decidida) e fora das propostas prontas. Nunca ideia nova do Google Ads.
 */
export function improvementAiList(keywords: readonly ImprovementKeyword[], proposals: readonly ImprovementProposal[]): ImprovementKeyword[] {
  const taken = new Set(proposals.filter(p => p.status === "ready").flatMap(p => p.memberIds));
  return keywords
    .filter(k => !k.external && !k.published && k.volumeValidated && (k.volume ?? 0) > 0 && !k.ownerId && !taken.has(k.id))
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0) || a.id.localeCompare(b.id))
    .slice(0, IMPROVEMENT_AI_MAX_LIST);
}

export const IMPROVEMENT_AI_SYSTEM = [
  "Você faz a LEITURA EDITORIAL de uma lista de keywords já medidas (volume do Google Ads validado) para reforçar artigos publicados e Assuntos declarados de UMA marca.",
  "Para cada alvo, escolha de 1 a 3 keywords DA LISTA que a pessoa que busca aquela keyword leria naquele artigo: mesma intenção, mesmo público, mesmo nicho. Pode não escolher nenhuma — melhor vazio do que forçado.",
  "Regras:",
  "1. Use só targetId e keywordId que vieram no pedido. Nunca invente id.",
  "2. No máximo 3 keywords por alvo, respeitando as vagas do alvo. Uma keyword vai para um alvo só.",
  "3. role \"principal\" só quando o alvo diz podeTrocarPrincipal=true e a keyword resume o assunto do slug; em todos os outros casos, \"secundaria\".",
  "4. Recuse: intenção oposta (o artigo promete \"sem tráfego pago\" e a keyword é \"tráfego pago como funciona\"); público diferente (\"como atrair pacientes para clínica de estética\" ← \"clínica de estética facial\": quem busca quer uma clínica, não marketing); outro nicho (\"checklist de plano de marketing para clínica de estética\" ← \"marketing para veterinários\"); cabeça genérica de volume enorme (\"agência de marketing para cosméticos\" ← \"agência de marketing\", 18.100).",
  "5. Bons exemplos: \"como atrair clientes para consultório\" ← \"como atrair clientes\" (720) e \"como atrair os clientes\" (720); \"como captar clientes para clínica de estética\" ← \"como captar clientes\" (390).",
  "6. reason: UMA frase curta (até 12 palavras) em português do Brasil dizendo por que quem busca a keyword leria o artigo.",
  "Responda só com JSON: {\"picks\":[{\"targetId\":\"...\",\"keywordId\":\"...\",\"role\":\"principal\"|\"secundaria\",\"reason\":\"...\"}]}. Sem nada escolhido: {\"picks\":[]}.",
].join("\n");

/** Pedido único em lote: todos os alvos e a lista numa requisição. */
export function buildImprovementAiPrompt(input: {
  targets: readonly ImprovementTarget[];
  list: readonly ImprovementKeyword[];
  keywords: readonly ImprovementKeyword[];
  ranking?: Readonly<Record<string, boolean | null>>;
}): { system: string; user: string; aliases: ImprovementAiAliases } {
  const byId = new Map(input.keywords.map(k => [k.id, k]));
  const aliases: ImprovementAiAliases = { targets: {}, keywords: {} };
  const alvos = input.targets.map((target, index) => {
    aliases.targets[`A${index + 1}`] = target.id;
    const current = target.primaryId ? byId.get(target.primaryId) : undefined;
    const semVolume = !current?.volumeValidated;
    const podeTrocarPrincipal = target.post === "free" && semVolume && (target.kind === "subject" || input.ranking?.[target.id] === false);
    return {
      targetId: `A${index + 1}`,
      tipo: target.kind === "published" ? "publicado" : "assunto",
      tema: target.theme,
      ...(target.note ? { nota: target.note } : {}),
      slug: target.slug,
      principalAtual: current ? { keyword: current.keyword, volume: current.volumeValidated ? current.volume : null } : null,
      podeTrocarPrincipal,
      keywordsNoArtigo: target.memberIds.map(id => byId.get(id)?.keyword).filter((k): k is string => Boolean(k)),
      vagas: Math.max(0, Math.min(IMPROVEMENT_AI_MAX_PER_TARGET, IMPROVEMENT_ARTICLE_MAX_KEYWORDS - target.memberIds.length)),
    };
  });
  const lista = input.list.map((k, index) => {
    aliases.keywords[`K${index + 1}`] = k.id;
    return { keywordId: `K${index + 1}`, keyword: k.keyword, volume: k.volume };
  });
  return { system: IMPROVEMENT_AI_SYSTEM, user: JSON.stringify({ alvos, lista }), aliases };
}

/**
 * Confere a resposta: formato, ids do pedido, até 3 por alvo e as barreiras do
 * código. O papel pedido pela IA é guardado; quem decide se vira principal é
 * o plano (Posto, volume da atual, ranqueamento e núcleo do slug).
 */
export function validateImprovementAiPicks(raw: unknown, input: {
  targets: readonly ImprovementTarget[];
  keywords: readonly ImprovementKeyword[];
  listIds: readonly string[];
  /** Com apelidos, a resposta só vale por eles (a IA nunca viu os ids reais). */
  aliases?: ImprovementAiAliases;
}): { picks: ImprovementEditorialPick[]; rejected: ImprovementAiRejection[] } {
  const parsed = ImprovementAiResponseSchema.safeParse(raw);
  if (!parsed.success) return { picks: [], rejected: [{ targetId: null, keywordId: null, reason: "A resposta da IA não tem o formato pedido: ignorada." }] };
  const targets = new Map(input.targets.map(t => [t.id, t]));
  const list = new Set(input.listIds);
  const byId = new Map(input.keywords.map(k => [k.id, k]));
  const picks: ImprovementEditorialPick[] = [];
  const rejected: ImprovementAiRejection[] = [];
  const seen = new Set<string>();
  const own = (map: Record<string, string>, alias: string) => Object.prototype.hasOwnProperty.call(map, alias) ? map[alias] : undefined;
  for (const entry of parsed.data.picks) {
    // Cada escolha vale sozinha: uma malformada é recusada e as outras seguem.
    const shaped = ImprovementAiPickSchema.safeParse(entry);
    const role = shaped.success ? aiRole(shaped.data.role) : null;
    const reason = shaped.success ? aiReason(shaped.data.reason) : null;
    if (!shaped.success || !role || !reason) {
      const loose = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      rejected.push({ targetId: typeof loose.targetId === "string" ? loose.targetId.slice(0, 160) : null, keywordId: typeof loose.keywordId === "string" ? loose.keywordId.slice(0, 160) : null, reason: "Escolha fora do formato (alvo, keyword, papel principal/secundária ou motivo): recusada." });
      continue;
    }
    const raw = shaped.data;
    const item = input.aliases ? { targetId: own(input.aliases.targets, raw.targetId) ?? raw.targetId, keywordId: own(input.aliases.keywords, raw.keywordId) ?? "" } : { targetId: raw.targetId, keywordId: raw.keywordId };
    const target = input.aliases && !own(input.aliases.targets, raw.targetId) ? undefined : targets.get(item.targetId);
    const candidate = byId.get(item.keywordId);
    if (!target) { rejected.push({ targetId: raw.targetId, keywordId: raw.keywordId, keyword: candidate?.keyword ?? null, reason: "Alvo que não foi enviado à IA: recusado." }); continue; }
    if (!list.has(item.keywordId) || !candidate) { rejected.push({ targetId: target.id, keywordId: raw.keywordId, theme: target.theme, reason: "Keyword fora da lista enviada (id inventado): recusada." }); continue; }
    const pair = `${item.targetId}\u0000${item.keywordId}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    const count = picks.filter(pick => pick.targetId === target.id).length;
    const named = { targetId: target.id, keywordId: candidate.id, keyword: candidate.keyword, theme: target.theme };
    if (count >= IMPROVEMENT_AI_MAX_PER_TARGET) { rejected.push({ ...named, reason: `Mais de ${IMPROVEMENT_AI_MAX_PER_TARGET} para o mesmo alvo: valem as primeiras.` }); continue; }
    const barrier = editorialAiBarrier(target, candidate);
    if (barrier) { rejected.push({ ...named, reason: barrier }); continue; }
    picks.push({ targetId: target.id, keywordId: candidate.id, role, reason, rank: count });
  }
  return { picks, rejected };
}

/** Guarda poucas recusas (as primeiras) e o total, para a execução não inchar. */
export function editorialAiRecord(input: Omit<ImprovementEditorialAi, "rejected" | "rejectedCount"> & { rejected: readonly ImprovementAiRejection[] }): ImprovementEditorialAi {
  return { ...input, rejected: input.rejected.slice(0, MAX_STORED_REJECTIONS), rejectedCount: input.rejected.length };
}
