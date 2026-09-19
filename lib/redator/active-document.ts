/**
 * ===== CORTE 6A.10 · O DOCUMENTO ATIVO SOBREVIVE AO F5 =====
 *
 * ==================== O QUE O 6A.9 DEIXOU ABERTO ====================
 *
 * A regra anterior consultava `moduleState.redator.selectedId` como
 * persistência. Ela não é: `updateWorkspace` só faz `setWorkspaces`, e o
 * workspace nasce com `moduleState: {}` a cada carregamento. No F5 aquilo voltava
 * vazio, a resolução caía em `documents[0]` — o mais recente — e um handoff do
 * Radar tomava o lugar do documento em edição.
 *
 * A autoridade persistida já existia e não era usada:
 * `content_document_user_states.last_opened_at`, gravada pela própria tela,
 * lida por usuário (`.eq("user_id", userId)`) e carregada no workspace.
 *
 * ==================== A ORDEM ====================
 *
 *   1. a escolha desta sessão      só existe se a pessoa clicou
 *   2. a URL ?documentId=          entrada explícita
 *   3. o `lastOpenedAt` mais recente do usuário   ← é isto que atravessa o F5
 *   4. o primeiro da lista         só sem nenhum dos anteriores
 *
 * **Uma divergência do pedido, declarada.** O enunciado pede a URL no passo 1 e a
 * escolha da sessão no 2. Implementei ao contrário porque a ordem literal trava a
 * tela: quem abre `?documentId=A` e depois clica em B na lista continuaria em A
 * para sempre, já que a URL não muda ao clicar. O requisito que o enunciado de
 * fato enuncia — "A fica ativo mesmo se `lastOpenedAt(B) > lastOpenedAt(A)`" —
 * continua valendo: a URL vence o passo 3, que é o que importa na entrada.
 *
 * ==================== ORDENAÇÃO NÃO É AUTORIDADE ====================
 *
 * `updated_at DESC` continua ordenando a lista, e só isso. Continuidade de
 * trabalho é `lastOpenedAt`: quando a pessoa abriu, não quando o sistema mexeu.
 */

export type ActiveDocumentOrigin =
  /** A pessoa clicou nesta sessão. */
  | "session"
  /** Veio na URL. */
  | "url"
  /** O último que ela abriu, segundo o estado persistido. */
  | "last_opened"
  /** Não havia nenhum dos anteriores: o primeiro da lista. */
  | "fallback"
  /** Não há documento nenhum. */
  | "none";

export type ActiveDocument = { id: string; origin: ActiveDocumentOrigin };

/** O recorte de `documentUserStates` que a decisão precisa — do usuário corrente. */
export type UserDocumentState = { lastOpenedAt?: string | null };

/**
 * O documento aberto há menos tempo, entre os que ainda existem.
 *
 * Comparação por string ISO-8601 em UTC, que ordena lexicograficamente igual à
 * cronológica. Estado de documento que sumiu é ignorado — é o caso do §6 do
 * enunciado: referência obsoleta não pode deixar a tela sem seleção.
 */
export function mostRecentlyOpenedId(input: {
  userStates: Readonly<Record<string, UserDocumentState>>;
  availableIds: readonly string[];
}): string | null {
  let melhor: { id: string; quando: string } | null = null;
  for (const id of input.availableIds) {
    const quando = input.userStates[id]?.lastOpenedAt;
    if (!quando) continue;
    if (!melhor || quando > melhor.quando) melhor = { id, quando };
  }
  return melhor?.id ?? null;
}

export function resolveActiveDocument(input: {
  /** O que a pessoa escolheu nesta sessão. Vazio até ela clicar. */
  selectedId?: string | null;
  /** `?documentId=` da URL. */
  urlDocumentId?: string | null;
  /** `documentUserStates` do ator corrente, vindo do pipeline. */
  userStates?: Readonly<Record<string, UserDocumentState>> | null;
  /** Ids disponíveis, na ordem em que a lista os mostra. */
  availableIds: readonly string[];
}): ActiveDocument {
  const existe = (id: string | null | undefined): id is string =>
    Boolean(id) && input.availableIds.includes(id as string);

  if (existe(input.selectedId)) return { id: input.selectedId, origin: "session" };
  if (existe(input.urlDocumentId)) return { id: input.urlDocumentId, origin: "url" };

  const ultimo = mostRecentlyOpenedId({
    userStates: input.userStates ?? {}, availableIds: input.availableIds,
  });
  if (ultimo) return { id: ultimo, origin: "last_opened" };

  const primeiro = input.availableIds[0];
  return primeiro ? { id: primeiro, origin: "fallback" } : { id: "", origin: "none" };
}

/**
 * ===== QUANDO `lastOpenedAt` PODE SER ESCRITO =====
 *
 * Só quando o documento passou a ser o ativo por um motivo legítimo: a pessoa
 * escolheu, a URL mandou, ou foi o primeiro de todos e não havia estado anterior.
 *
 * O caso `last_opened` também grava — ali o documento É o que a pessoa vinha
 * usando, e confirmar não é mentir. O que NÃO pode acontecer, e era o defeito, é
 * o `fallback` ser alcançado com estado anterior válido: um handoff novo virava
 * `documents[0]`, virava ativo, e ganhava `lastOpenedAt` como se tivesse sido
 * aberto. Com o passo 3 na frente, o fallback só roda quando não há o que
 * preservar.
 *
 * `none` nunca grava: não há documento.
 */
export function shouldPersistLastOpened(origin: ActiveDocumentOrigin): boolean {
  return origin !== "none";
}

/**
 * ===== O QUE CHEGOU DEPOIS QUE A TELA ABRIU =====
 *
 * Serve para MARCAR na lista, nunca para navegar. Um item novo do Radar merece
 * um aviso discreto; não merece tomar o lugar do que está sendo editado.
 *
 * `conhecidos` é a fotografia de quando a lista apareceu pela primeira vez.
 * Enquanto ela estiver vazia — antes do primeiro carregamento — nada é "novo",
 * senão a tela inteira nasceria piscando.
 */
export function newlyArrivedIds(input: {
  conhecidos: ReadonlySet<string>;
  availableIds: readonly string[];
}): ReadonlySet<string> {
  if (input.conhecidos.size === 0) return new Set();
  return new Set(input.availableIds.filter(id => !input.conhecidos.has(id)));
}
