/**
 * ===== REPARAR O CONGELAMENTO — cirúrgico e por perfil (SDD diretriz editorial, Adendo E, 2026-10-02) =====
 *
 * Quando a LEITURA muda depois do congelamento (o código que lê a amostra foi
 * corrigido), a fotografia gravada deixa de bater com o dossiê de hoje e o
 * pacote fica bloqueado. Este domínio decide, só lendo, o que o botão de
 * reparo faz em cada perfil:
 *
 *   - NOTHING: a fotografia já corresponde à leitura atual — nada a gravar;
 *   - REFREEZE: o material gravado basta — refazer a fotografia de graça;
 *   - RECOLLECT: o material gravado não basta — zerar o perfil e coletar (pago);
 *   - NOT_FINALIZED: não há fotografia — o botão não se aplica.
 *
 * Domínio puro: quem chama lê o servidor, projeta e ensaia; aqui só a regra, a
 * comparação sem carimbos de tempo e as frases. Vale para qualquer página,
 * marca e assunto.
 */

export type RadarRefreezeProfile = "GOOGLE" | "YOUTUBE" | "AMAZON";
export type RadarRefreezeMode = "NOTHING" | "REFREEZE" | "RECOLLECT" | "NOT_FINALIZED";

export type RadarRefreezeDiagnosis = {
  profile: RadarRefreezeProfile;
  mode: RadarRefreezeMode;
  headline: string;
  /** O que divergiu entre a fotografia e a leitura de hoje (REFREEZE). */
  differences: string[];
  /** Por que o material gravado não basta (RECOLLECT) ou por que não se aplica. */
  reason: string | null;
  /** O que acontece se confirmar — dito ANTES da escrita. */
  consequences: string[];
};

export const RADAR_REFREEZE_PROFILE_LABEL: Record<RadarRefreezeProfile, string> = {
  GOOGLE: "Google",
  YOUTUBE: "YouTube",
  AMAZON: "Amazon",
};

export const radarRefreezeButtonLabel = (profile: RadarRefreezeProfile) => `Reparar congelamento (${RADAR_REFREEZE_PROFILE_LABEL[profile]})`;

const PROVIDER: Record<RadarRefreezeProfile, string> = {
  GOOGLE: "a pesquisa do Google (SERP e leitura das páginas)",
  YOUTUBE: "a pesquisa do YouTube",
  AMAZON: "a pesquisa da Amazon e o apoio do Google",
};

const OUTROS: Record<RadarRefreezeProfile, string> = {
  GOOGLE: "YouTube, Amazon, Vídeos e Especialista não são tocados",
  YOUTUBE: "Google, Amazon, Vídeos e Especialista não são tocados",
  AMAZON: "Google, YouTube, Vídeos e Especialista não são tocados",
};

/*
 * ============ A COMPARAÇÃO NÃO OLHA O RELÓGIO ============
 *
 * Refazer a fotografia hoje muda `generatedAt`, `finalizedAt` e o hash mesmo
 * quando nada mais muda. Comparar com eles diria "divergiu" sempre — e o botão
 * gravaria uma versão nova a cada clique. Carimbos de momento, de autor e de
 * identidade saem da comparação.
 */
const CHAVES_DE_CARIMBO = new Set([
  "generatedAt", "frozenAt", "finalizedAt", "finalizedBy", "frozenBy", "analyzedAt", "createdAt",
  "bundleHash", "bundleId", "contentHash", "observedAt", "frozenVersion",
]);

function semCarimbo(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(semCarimbo);
  if (!valor || typeof valor !== "object") return valor;
  return Object.fromEntries(Object.entries(valor as Record<string, unknown>)
    .filter(([chave]) => !CHAVES_DE_CARIMBO.has(chave))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, item]) => [chave, semCarimbo(item)]));
}

export const radarRefreezeComparable = (valor: unknown): string => JSON.stringify(semCarimbo(valor ?? null));

/**
 * O QUE MUDOU, PELO CAMINHO — até dois níveis ("recommended.gaps"). Os rótulos
 * traduzem o caminho para quem lê; caminho sem rótulo sai como está.
 */
export function radarRefreezeDifferences(antes: unknown, depois: unknown, rotulos: Readonly<Record<string, string>> = {}): string[] {
  const a = semCarimbo(antes ?? null);
  const d = semCarimbo(depois ?? null);
  if (JSON.stringify(a) === JSON.stringify(d)) return [];
  const objeto = (valor: unknown): Record<string, unknown> | null => (valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null);
  const oa = objeto(a);
  const od = objeto(d);
  if (!oa || !od) return [rotulos[""] || "A fotografia mudou com a leitura atual."];
  const caminhos: string[] = [];
  for (const chave of [...new Set([...Object.keys(oa), ...Object.keys(od)])].sort()) {
    if (JSON.stringify(oa[chave]) === JSON.stringify(od[chave])) continue;
    const fa = objeto(oa[chave]);
    const fd = objeto(od[chave]);
    if (fa && fd && !rotulos[chave]) {
      for (const sub of [...new Set([...Object.keys(fa), ...Object.keys(fd)])].sort()) {
        if (JSON.stringify(fa[sub]) !== JSON.stringify(fd[sub])) caminhos.push(`${chave}.${sub}`);
      }
    } else caminhos.push(chave);
  }
  return [...new Set(caminhos.map(caminho => rotulos[caminho] || rotulos[caminho.split(".")[0]] || `Mudou: ${caminho}`))];
}

/** A investigação do Google projetada como reaberta: sem fotografia e sem o carimbo de finalização. */
export function radarReopenedGooglePatch<R extends Record<string, unknown>>(deepResearch: R | null | undefined): { finalizedBundle: null; deepResearch: R | null } {
  return {
    finalizedBundle: null,
    deepResearch: deepResearch ? { ...deepResearch, finalizedAt: null, finalizedBy: null, conclusion: null } : null,
  };
}

function consequencias(profile: RadarRefreezeProfile, mode: RadarRefreezeMode): string[] {
  if (mode === "REFREEZE") {
    return [
      `Grava uma versão nova da investigação ${RADAR_REFREEZE_PROFILE_LABEL[profile]} com a leitura de hoje sobre o material já coletado: nenhuma chamada ao provider. A versão anterior fica no histórico.`,
      ...(profile === "GOOGLE"
        ? ["São duas gravações: reabrir e congelar. O ensaio já confirmou que o congelamento passa; se a segunda falhar mesmo assim, a investigação fica reaberta (nada se perde) e \"Finalizar pesquisa\" conclui."]
        : []),
      "O pacote muda de identidade: o artigo-modelo da SERP é organizado de novo (1 chamada de IA, mais 1 se a resposta vier cortada ou precisar de correção) e sai concluído para o CSV, o Redator e o MCP.",
      ...(profile === "AMAZON"
        /* 2026-10-09 (correção) · a planta organizada desde 2026-10-09 se prende ao congelamento da Amazon (amazonFrozenAt). */
        ? ["Na Amazon, o artigo-modelo organizado desde 2026-10-09 se prende ao congelamento da Amazon: recongelar desliga essa planta, e a reorganização custa até 2 chamadas de IA (dito no botão do Radar antes do clique)."]
        : []),
      "Se o pacote já foi enviado ao Redator, ele passa a mostrar \"Atualização disponível\".",
      `URL, slug, canonical, keyword principal, papel e Silo não mudam; ${OUTROS[profile]}.`,
    ];
  }
  if (mode === "RECOLLECT") {
    return [
      `Zera só ${PROVIDER[profile]} deste artigo e começa a coleta de novo: CHAMADA PAGA ao provider (cota da marca). ${OUTROS[profile].charAt(0).toUpperCase()}${OUTROS[profile].slice(1)}.`,
      "A coleta só começa depois de o servidor confirmar o reset.",
      ...(profile === "GOOGLE"
        ? ["A SERP pode vir do cache (4 lentes, 30 dias); as páginas são lidas de novo. Curadoria, análise e finalização seguem como numa pesquisa nova (finaliza sozinha sem pendência)."]
        : ["A finalização segue como numa coleta nova (sozinha, sem pendência)."]),
      "Depois, o artigo-modelo da SERP é organizado de novo (1 chamada de IA, mais 1 se precisar de correção) e sai concluído.",
      "URL, slug, canonical, keyword principal, papel e Silo não mudam.",
    ];
  }
  return [];
}

/**
 * A DECISÃO DO BOTÃO, de um perfil.
 *
 * `blocker` é o motivo do ensaio que falhou (fundamento que mudou, corrida que
 * não confere, amostra que não congela); presente, o caminho é coletar de novo.
 * Sem bloqueio e sem diferença, nada a reparar.
 */
export function radarRefreezeDiagnosis(input: {
  profile: RadarRefreezeProfile;
  finalized: boolean;
  differences: readonly string[];
  blocker: string | null;
}): RadarRefreezeDiagnosis {
  const nome = RADAR_REFREEZE_PROFILE_LABEL[input.profile];
  const base = { profile: input.profile, differences: [...new Set(input.differences)] };
  if (!input.finalized) {
    return { ...base, mode: "NOT_FINALIZED", differences: [], headline: `A investigação ${nome} não está finalizada: não há fotografia a reparar.`, reason: "Use o botão de finalizar do perfil.", consequences: [] };
  }
  if (input.blocker) {
    return { ...base, mode: "RECOLLECT", headline: `O material gravado do ${nome} não basta para refazer a fotografia: o reparo é zerar e coletar de novo (pago).`, reason: input.blocker, consequences: consequencias(input.profile, "RECOLLECT") };
  }
  if (!base.differences.length) {
    return { ...base, mode: "NOTHING", headline: `Nada a reparar: a fotografia do ${nome} já corresponde à leitura atual.`, reason: null, consequences: [] };
  }
  /*
   * 2026-10-09 (correção) · SÓ AS LIMITAÇÕES MUDARAM. A régua de 2026-10-09 passou a
   * registrar no congelamento a consulta que falhou e o apoio do Google que falhou
   * (YouTube e Amazon): a fotografia antiga sem essas linhas aparece aqui só por
   * isso, sem a leitura do material ter mudado. A prévia diz isso, para a decisão
   * (que pode desligar o artigo-modelo e custar a reorganização) ser informada.
   */
  const soLimitacoes = base.differences.length === 1 && /limitações declaradas/.test(base.differences[0]);
  return {
    ...base, mode: "REFREEZE",
    headline: `A fotografia do ${nome} diverge da leitura de hoje e o material gravado basta: dá para recongelar sem custo de provider.`,
    reason: soLimitacoes ? "A diferença é só nas limitações declaradas: a régua de 2026-10-09 passou a registrar a consulta e o apoio que falharam. A leitura do material coletado não mudou." : null,
    consequences: consequencias(input.profile, "REFREEZE"),
  };
}

/** Os rótulos das partes do blueprint do YouTube que mudam com a leitura. */
export const RADAR_YOUTUBE_REFREEZE_LABELS: Readonly<Record<string, string>> = {
  "blueprint.recommended": "Mudou a recomendação do YouTube (estratégia, lacunas, roteiro ou títulos).",
  "blueprint.observed": "Mudou a leitura da amostra do YouTube (coortes, padrões de título, canais).",
  multimodal: "Mudou a leitura multiformato (YouTube cruzado com a SERP do Google).",
  limitations: "Mudaram as limitações declaradas.",
  runRef: "Mudou a referência da coleta (seleção de vídeos ou corrida).",
};

/** Os rótulos das partes da fotografia da Amazon que mudam com a leitura. */
export const RADAR_AMAZON_REFREEZE_LABELS: Readonly<Record<string, string>> = {
  competitiveBlueprint: "Mudou o blueprint competitivo da Amazon (critérios, shortlist ou recomendação).",
  observedSummary: "Mudou o resumo do que a amostra da Amazon mostra.",
  editorialOutput: "Mudou a saída editorial da Amazon.",
  limitations: "Mudaram as limitações declaradas.",
  supportRefs: "Mudou a referência do apoio do Google.",
  runRef: "Mudou a referência da coleta.",
};
