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
 *   -- daqui para baixo depende de saber o que já foi aberto --
 *   3. user states ainda não chegaram → `pending`, e a tela espera   (Corte 6A.12)
 *   4. o `lastOpenedAt` mais recente do usuário   ← é isto que atravessa o F5
 *   5. o primeiro da lista         só sem nenhum dos anteriores
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
  /**
   * ===== CORTE 6A.12 · AINDA NÃO DÁ PARA SABER =====
   *
   * Os user states não chegaram. Não é "não há documento" nem "nenhum foi
   * aberto": é uma pergunta sem resposta ainda. Resolver aqui seria chutar, e o
   * chute vira gravação — foi assim que um documento que ninguém abriu ganhou
   * `lastOpenedAt`.
   */
  | "pending"
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
  /**
   * Os user states já chegaram do servidor?
   *
   * Obrigatório de propósito. Um `undefined` silencioso aqui significaria
   * "assuma que chegou", que é exatamente o defeito: `userStates` vazio porque
   * a leitura não voltou é indistinguível de vazio porque não há nada — a menos
   * que alguém diga qual dos dois é.
   */
  userStatesReady: boolean;
  /** Ids disponíveis, na ordem em que a lista os mostra. */
  availableIds: readonly string[];
}): ActiveDocument {
  const existe = (id: string | null | undefined): id is string =>
    Boolean(id) && input.availableIds.includes(id as string);

  /*
   * Seleção explícita não espera hidratação. A pessoa clicou, ou a URL mandou:
   * nenhum dos dois melhora quando os user states chegarem, e segurar a tela
   * seria travá-la à toa.
   */
  if (existe(input.selectedId)) return { id: input.selectedId, origin: "session" };
  if (existe(input.urlDocumentId)) return { id: input.urlDocumentId, origin: "url" };

  /*
   * Daqui para baixo tudo depende de saber o que já foi aberto. Sem isso, a
   * resposta honesta é "ainda não sei" — e a tela mostra carregamento em vez de
   * montar um documento provisório que ela teria de trocar em seguida.
   */
  if (!input.userStatesReady) return { id: "", origin: "pending" };

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
 * ==================== POR QUE NÃO BASTA A ORIGEM ====================
 *
 * O Corte 6A.10 decidiu isto só pela origem, com o argumento de que "o fallback
 * só é alcançado quando não há o que preservar". A leitura ao vivo desmentiu:
 * num único carregamento a tela gravou DOIS documentos, porque a recuperação
 * local restaura `documents` do navegador e **não** restaura os user states.
 * Naquela janela havia lista para cair no `documents[0]` e nenhum estado para
 * preservar — o fallback era legítimo pela origem e falso pelos fatos.
 *
 * Então a decisão precisa dos três: a origem, o documento e se a autoridade já
 * chegou.
 *
 * ==================== A REGRA ====================
 *
 *   sem documento                      → não grava
 *   `pending` ou `none`                → não grava
 *   `session` ou `url`                 → grava, mesmo antes da hidratação:
 *                                        são escolhas explícitas, e nenhuma
 *                                        delas muda quando os states chegarem
 *   `last_opened` ou `fallback`        → só depois da hidratação
 *
 * O último caso é o que fecha o defeito. As duas origens derivadas são
 * *conclusões* tiradas do mapa de user states; tirar conclusão de um mapa que
 * ainda não chegou é inventar, e aqui inventar significa escrever no banco.
 */
export function shouldPersistLastOpened(input: {
  origin: ActiveDocumentOrigin;
  documentId: string;
  userStatesReady: boolean;
}): boolean {
  if (!input.documentId) return false;
  if (input.origin === "pending" || input.origin === "none") return false;
  if (input.origin === "session" || input.origin === "url") return true;
  return input.userStatesReady;
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
