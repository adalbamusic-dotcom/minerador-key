/**
 * ===== 2026-10-08 · P0-A · O ARTIGO-MODELO VALE PELA INVESTIGAÇÃO CONGELADA, NÃO PELO HASH DO DOSSIÊ AO VIVO =====
 *
 * O artigo-modelo era preso ao `bundleHash` do dossiê montado AO VIVO, e esse
 * hash inclui o modelo observado inteiro (`lib/radar/evidence-bundle.ts`). Uma
 * mudança de CÓDIGO na leitura da amostra (recorte pela seleção, URL pedida,
 * filtros) muda o hash sem que a investigação mude — e todo artigo-modelo
 * concluído sumia do CSV (7 dos 8 "Para escrever" do Silo de 2026-10-08), o
 * Redator deixava de recebê-lo e o encadeamento automático pagaria a IA de novo.
 *
 * A regra (desenho de 2026-10-08, P0-A):
 *
 *   1. hash exato do dossiê → usa (como sempre);
 *   2. senão, o CONCLUÍDO mais recente organizado sobre o congelamento vigente
 *      e sobre o mesmo ArticleDNA → usa;
 *   3. investigação re-congelada (outro `frozenAt`) ou ArticleDNA novo → não usa.
 *
 * A identidade estável é a do congelamento — `frozenAt` e o `bundleId` do pacote
 * congelado (`finalizedBundle`), que não mudam enquanto a investigação não é
 * refeita — mais a versão do ArticleDNA. A versão nova grava essa identidade no
 * payload (`investigationRef`, aditivo, nenhuma coluna nova). A versão antiga,
 * sem ela, é conferida pelo relógio: organizada depois do congelamento vigente
 * e enquanto a versão do ArticleDNA era a mesma. A família do mesmo
 * `bundle_hash` conta pela primeira versão dela: a edição feita hoje de uma
 * planta organizada antes do re-congelamento continua sendo daquela investigação.
 *
 * Módulo puro (sem servidor, sem banco): o leitor do export, o `ifMissing`, a
 * aprovação, o Redator e o painel usam as MESMAS funções.
 *
 * 2026-10-09 · A AMAZON CONGELADA ENTRA NO VÍNCULO, DE FORMA ADITIVA. A versão
 * nova grava também `amazonFrozenAt` (o congelamento da Amazon na organização;
 * null = sem Amazon). Com a chave dos dois lados, um congelamento NOVO da Amazon
 * desliga a planta (o bloco comercial precisa entrar nela). A versão gravada
 * antes, sem a chave, continua vinculada como era — nenhuma planta concluída se
 * desliga por causa desta regra.
 */

/** O que a versão nova grava no payload: sobre qual investigação congelada e qual ArticleDNA a planta foi organizada. */
export type RadarArticleBlueprintInvestigationRef = {
  /** O instante do congelamento do perfil primário — o mesmo `observedAt` do dossiê. */
  frozenAt: string;
  /** Google: a identidade própria do pacote congelado (`finalizedBundle.bundleId`). Nulo nos outros perfis. */
  frozenBundleId: string | null;
  /** Google: o hash do pacote congelado (`finalizedBundle.bundleHash`), para o painel. Informativo: a regra usa `frozenAt` e `frozenBundleId`. */
  frozenBundleHash: string | null;
  /** O ArticleDNA do dossiê sobre o qual a planta foi organizada. */
  articleDnaVersionId: string;
  articleDnaContentHash: string | null;
  /**
   * 2026-10-09 · O CONGELAMENTO DA AMAZON TAMBÉM PRENDE A PLANTA (aditivo). O
   * instante da investigação da Amazon congelada (`amazonFrozenInvestigation.finalizedAt`)
   * quando a planta foi organizada; `null` = não havia Amazon congelada. AUSENTE
   * (a chave nem existe) = versão gravada antes desta regra: ela continua
   * vinculada, sem conferência da Amazon (congelamento é sagrado). Com a chave
   * dos dois lados, um congelamento NOVO da Amazon desliga a planta, para o
   * bloco comercial entrar na planta reorganizada.
   */
  amazonFrozenAt?: string | null;
};

/**
 * O congelamento vigente, como o leitor o conhece. `articleDnaFrom`/`articleDnaUntil`
 * só servem à versão antiga, sem a referência gravada: quando a versão do
 * ArticleDNA passou a valer (o envelope) e quando a seguinte a substituiu.
 */
export type RadarArticleBlueprintCurrentInvestigation = RadarArticleBlueprintInvestigationRef & {
  articleDnaFrom: string | null;
  articleDnaUntil: string | null;
};

/** O que a regra precisa de cada versão: os metadados da linha e a referência lida do payload (ausente na versão antiga). */
export type RadarArticleBlueprintVersionMeta = {
  id: string;
  bundleHash: string;
  versionNumber: number;
  state: string;
  createdAt?: string | null;
  investigationRef?: unknown;
};

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);

const instante = (valor: string | null | undefined): number => (valor ? Date.parse(valor) : Number.NaN);

/** Os dois instantes descrevem o mesmo momento (o texto pode vir com `Z` ou com `+00:00`). */
const mesmoInstante = (a: string, b: string): boolean => {
  if (a === b) return true;
  const [x, y] = [instante(a), instante(b)];
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
};

/** A referência gravada no payload, validada; `null` = versão antiga (ou gravação fora da forma). */
export function radarArticleBlueprintInvestigationRefOf(valor: unknown): RadarArticleBlueprintInvestigationRef | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const ref = valor as Record<string, unknown>;
  const frozenAt = texto(ref.frozenAt);
  const articleDnaVersionId = texto(ref.articleDnaVersionId);
  if (!frozenAt || !articleDnaVersionId) return null;
  return {
    frozenAt,
    frozenBundleId: texto(ref.frozenBundleId),
    frozenBundleHash: texto(ref.frozenBundleHash),
    articleDnaVersionId,
    articleDnaContentHash: texto(ref.articleDnaContentHash),
    /* 2026-10-09 · a chave só existe na versão gravada com a regra da Amazon: ausente, a versão continua sem a conferência. */
    ...("amazonFrozenAt" in ref ? { amazonFrozenAt: texto(ref.amazonFrozenAt) } : {}),
  };
}

/** A referência que a versão grava (sem os campos que só servem à conferência da versão antiga). */
export function radarArticleBlueprintInvestigationRefToStore(atual: RadarArticleBlueprintInvestigationRef): RadarArticleBlueprintInvestigationRef {
  return {
    frozenAt: atual.frozenAt,
    frozenBundleId: atual.frozenBundleId,
    frozenBundleHash: atual.frozenBundleHash,
    articleDnaVersionId: atual.articleDnaVersionId,
    articleDnaContentHash: atual.articleDnaContentHash,
    /* 2026-10-09 · o congelamento da Amazon vigente na organização (null = sem Amazon congelada); quem não o conhece não grava a chave. */
    ...(atual.amazonFrozenAt !== undefined ? { amazonFrozenAt: atual.amazonFrozenAt } : {}),
  };
}

/**
 * 2026-10-09 · O MESMO CONGELAMENTO DA AMAZON. Só confere quando os dois lados
 * conhecem a Amazon (a chave existe na versão gravada E quem lê sabe o
 * congelamento vigente): a versão gravada antes desta regra, e o leitor que não
 * lê a Amazon (o Redator, o painel antigo), passam como antes. Sem Amazon dos
 * dois lados (null e null) é o mesmo; Amazon congelada depois da planta (null ×
 * instante), re-congelada (outro instante) ou reaberta (instante × null) desliga.
 */
export function radarArticleBlueprintSameAmazonFreeze(
  ref: Pick<RadarArticleBlueprintInvestigationRef, "amazonFrozenAt">,
  atual: Pick<RadarArticleBlueprintInvestigationRef, "amazonFrozenAt">,
): boolean {
  if (ref.amazonFrozenAt === undefined || atual.amazonFrozenAt === undefined) return true;
  if (ref.amazonFrozenAt === null || atual.amazonFrozenAt === null) return ref.amazonFrozenAt === atual.amazonFrozenAt;
  return mesmoInstante(ref.amazonFrozenAt, atual.amazonFrozenAt);
}

/** O mesmo congelamento: mesmo instante e, quando os dois lados o têm, o mesmo pacote congelado. */
export function radarArticleBlueprintSameFreeze(
  ref: Pick<RadarArticleBlueprintInvestigationRef, "frozenAt" | "frozenBundleId">,
  atual: Pick<RadarArticleBlueprintInvestigationRef, "frozenAt" | "frozenBundleId">,
): boolean {
  if (!mesmoInstante(ref.frozenAt, atual.frozenAt)) return false;
  return !(ref.frozenBundleId && atual.frozenBundleId && ref.frozenBundleId !== atual.frozenBundleId);
}

/**
 * Quando a família da versão (as linhas do mesmo `bundle_hash`) nasceu: a
 * primeira delas. A edição copia o `bundle_hash` da versão editada.
 */
export function radarArticleBlueprintFamilyBornAt(versao: RadarArticleBlueprintVersionMeta, versoes: readonly RadarArticleBlueprintVersionMeta[]): number {
  const instantes = [versao, ...versoes.filter(item => item.bundleHash === versao.bundleHash)]
    .map(item => instante(item.createdAt ?? null)).filter(Number.isFinite);
  return instantes.length ? Math.min(...instantes) : Number.NaN;
}

/**
 * A VERSÃO FOI ORGANIZADA SOBRE A INVESTIGAÇÃO VIGENTE?
 *
 * Com a referência gravada: mesmo congelamento e mesmo ArticleDNA. Sem ela
 * (versão antiga): a família nasceu DEPOIS do congelamento vigente e DENTRO da
 * vigência da versão do ArticleDNA (depois de ela existir e antes da seguinte).
 * Faltando o relógio de qualquer lado, não vale — a dúvida não liga a planta.
 */
export function radarArticleBlueprintFitsInvestigation(
  versao: RadarArticleBlueprintVersionMeta,
  versoes: readonly RadarArticleBlueprintVersionMeta[],
  atual: RadarArticleBlueprintCurrentInvestigation,
): boolean {
  const ref = radarArticleBlueprintInvestigationRefOf(versao.investigationRef);
  if (ref) {
    if (!radarArticleBlueprintSameFreeze(ref, atual)) return false;
    if (ref.articleDnaVersionId !== atual.articleDnaVersionId) return false;
    /* 2026-10-09 · congelamento novo da Amazon desliga a versão que o conhecia (a versão sem a chave segue vinculada). */
    if (!radarArticleBlueprintSameAmazonFreeze(ref, atual)) return false;
    return !(ref.articleDnaContentHash && atual.articleDnaContentHash && ref.articleDnaContentHash !== atual.articleDnaContentHash);
  }
  const nascida = radarArticleBlueprintFamilyBornAt(versao, versoes);
  const congelada = instante(atual.frozenAt);
  const desde = instante(atual.articleDnaFrom);
  const ate = instante(atual.articleDnaUntil);
  if (!Number.isFinite(nascida) || !Number.isFinite(congelada) || !Number.isFinite(desde)) return false;
  if (!(nascida > congelada) || !(nascida > desde)) return false;
  return !(Number.isFinite(ate) && !(nascida < ate));
}

export type RadarArticleBlueprintPick = {
  id: string;
  approval: "APPROVED" | "DRAFT";
  /** `bundle` = hash exato do dossiê; `investigation` = mesmo congelamento e mesmo ArticleDNA, outro dossiê (mudança de código, especialista…). */
  basis: "bundle" | "investigation";
};

/**
 * A VERSÃO QUE VALE PARA O ARTIGO (uma marca, um artigo): a regra inteira.
 *
 * Hash exato: a concluída mais nova e, sem ela (versão antiga em rascunho), o
 * rascunho mais novo quando quem chama aceita rascunho (o export aceita; o
 * Redator e o `ifMissing`, não). Senão, a CONCLUÍDA mais nova que cabe na
 * investigação vigente. Sem investigação vigente conhecida, só o hash exato —
 * o comportamento de antes, byte a byte.
 */
export function radarArticleBlueprintPick(
  versoes: readonly RadarArticleBlueprintVersionMeta[],
  alvo: { bundleHash: string | null | undefined; investigation?: RadarArticleBlueprintCurrentInvestigation | null },
  opcoes: { drafts?: boolean } = {},
): RadarArticleBlueprintPick | null {
  const ordem = [...versoes].sort((a, b) => b.versionNumber - a.versionNumber);
  const exatas = alvo.bundleHash ? ordem.filter(item => item.bundleHash === alvo.bundleHash) : [];
  const concluida = exatas.find(item => item.state === "APPROVED");
  if (concluida) return { id: concluida.id, approval: "APPROVED", basis: "bundle" };
  const rascunho = opcoes.drafts ? exatas.find(item => item.state === "DRAFT") : undefined;
  if (rascunho) return { id: rascunho.id, approval: "DRAFT", basis: "bundle" };
  if (!alvo.investigation) return null;
  const daInvestigacao = ordem.find(item => item.state === "APPROVED" && radarArticleBlueprintFitsInvestigation(item, ordem, alvo.investigation!));
  return daInvestigacao ? { id: daInvestigacao.id, approval: "APPROVED", basis: "investigation" } : null;
}

/** O congelamento que o painel conhece (o `finalizedBundle` da página): sem ArticleDNA, a tela confere só o congelamento. */
export type RadarArticleBlueprintPanelFreeze = {
  frozenAt: string;
  bundleId?: string | null;
  bundleHash?: string | null;
  /**
   * 2026-10-08 (correção) · Aditivo: a versão do ArticleDNA que a página conhece
   * (a do artigo agora). Com ela, a versão nova (com a referência) só é do
   * vigente se foi organizada sobre esse ArticleDNA; a antiga continua sem
   * conferência de ArticleDNA, e o painel não afirma que ela vai.
   */
  articleDnaVersionId?: string | null;
  /**
   * 2026-10-09 · Aditivo: o congelamento da Amazon que a página conhece
   * (`amazonFrozenInvestigation.finalizedAt`; null = sem Amazon congelada).
   * Ausente = o painel não confere a Amazon, como antes.
   */
  amazonFrozenAt?: string | null;
};

/**
 * 2026-10-08 · P0-A · NO PAINEL (tela operacional), a versão é do congelamento
 * vigente pela referência gravada (instante e pacote congelado) ou, na versão
 * antiga, pela família nascida depois do congelamento. O ArticleDNA fica com o
 * export e o Redator, que o leem; a tela não tem a versão dele.
 */
export function radarArticleBlueprintOfPanelFreeze(
  versao: RadarArticleBlueprintVersionMeta,
  versoes: readonly RadarArticleBlueprintVersionMeta[],
  congelamento: RadarArticleBlueprintPanelFreeze,
): boolean {
  const ref = radarArticleBlueprintInvestigationRefOf(versao.investigationRef);
  if (ref) {
    if (!radarArticleBlueprintSameFreeze(ref, { frozenAt: congelamento.frozenAt, frozenBundleId: congelamento.bundleId ?? null })) return false;
    /* 2026-10-09 · com o congelamento da Amazon que a página conhece, a mesma regra do export. */
    if (!radarArticleBlueprintSameAmazonFreeze(ref, { amazonFrozenAt: congelamento.amazonFrozenAt })) return false;
    /* 2026-10-08 (correção) · com o ArticleDNA da página, a versão nova de OUTRO ArticleDNA não é do vigente (o export e o Redator a recusam). */
    return !(congelamento.articleDnaVersionId && ref.articleDnaVersionId !== congelamento.articleDnaVersionId);
  }
  const nascida = radarArticleBlueprintFamilyBornAt(versao, versoes);
  const congelada = instante(congelamento.frozenAt);
  return Number.isFinite(nascida) && Number.isFinite(congelada) && nascida > congelada;
}
