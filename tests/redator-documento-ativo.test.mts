/**
 * ===== O DOCUMENTO ATIVO: F5 (6A.10) E HIDRATAÇÃO (6A.12) =====
 *
 * O 6A.9 fechou o roubo durante a sessão. O 6A.10 fez a escolha atravessar o F5
 * com `content_document_user_states.last_opened_at`. O 6A.12 fecha o que sobrou:
 * a janela em que a lista de documentos já chegou e o mapa de user states não.
 *
 * A recuperação local restaura `documents` do navegador sem restaurar os user
 * states. Nessa janela `documents[0]` parecia um fallback legítimo, virava o
 * documento ativo, e o efeito da tela gravava `last_opened_at` nele. Ao vivo,
 * um único carregamento gravou dois documentos.
 *
 * COMPORTAMENTAL — a regra, com um modelo de sessão que registra CADA gravação.
 * ESTRUTURAL     — a tela e o contexto, com asserções que impedem a volta.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  mostRecentlyOpenedId, newlyArrivedIds, resolveActiveDocument, shouldPersistLastOpened,
  type ActiveDocumentOrigin, type UserDocumentState,
} from "../lib/redator/active-document.ts";

const fonte = (caminho: string) => readFile(new URL(caminho, import.meta.url), "utf8");
const TELA = "../components/editorial/professional-writer.tsx";
const CONTEXTO = "../components/editorial-pipeline-context.tsx";

/** Comentário que explica uma ausência casa com a busca pela ausência. */
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ==========================================================================
 * UM MODELO DE SESSÃO
 *
 * Três coisas que o modelo precisa ter para os marcadores fazerem sentido:
 *
 *   `recarregar()`  joga fora exatamente o que o F5 joga — a escolha em
 *                   memória — e devolve os user states ao estado "não chegou".
 *   `hidratar()`    é a leitura do workspace assentando.
 *   `gravacoes`     o log de POSTs. Sem ele dá para afirmar "A ficou ativo" sem
 *                   perceber que B foi gravado no caminho, que era o defeito.
 *
 * Campos declarados e atribuídos à mão: `test:redator` roda em `node --test`
 * com remoção nativa de tipos, que recusa propriedade de parâmetro.
 * ========================================================================== */
class Sessao {
  selectedId = "";
  /** Antes da leitura assentar, ninguém sabe o que foi aberto. */
  userStatesReady = false;
  gravacoes: Array<{ id: string; quando: string }> = [];
  private ultimoAtivo = "";

  availableIds: string[];
  userStates: Record<string, UserDocumentState>;
  urlDocumentId: string | null;

  constructor(
    availableIds: string[],
    userStates: Record<string, UserDocumentState> = {},
    urlDocumentId: string | null = null,
  ) {
    this.availableIds = availableIds;
    this.userStates = userStates;
    this.urlDocumentId = urlDocumentId;
  }

  resolver() {
    return resolveActiveDocument({
      selectedId: this.selectedId, urlDocumentId: this.urlDocumentId,
      userStates: this.userStates, userStatesReady: this.userStatesReady,
      availableIds: this.availableIds,
    });
  }

  /**
   * Um ciclo do efeito da tela. Ele só dispara quando o documento ativo muda —
   * é o que a lista de dependências `[selected?.id, …]` faz — e então grava, se
   * a regra permitir.
   */
  render(quando: string) {
    const ativo = this.resolver();
    const mudou = ativo.id !== this.ultimoAtivo;
    this.ultimoAtivo = ativo.id;
    if (mudou && shouldPersistLastOpened({
      origin: ativo.origin, documentId: ativo.id, userStatesReady: this.userStatesReady,
    })) {
      this.gravacoes.push({ id: ativo.id, quando });
      this.userStates[ativo.id] = { lastOpenedAt: quando };
    }
    return ativo;
  }

  /** A leitura do workspace assentou. */
  hidratar(states: Record<string, UserDocumentState> = {}) {
    this.userStates = { ...this.userStates, ...states };
    this.userStatesReady = true;
  }

  /** A pessoa clica num documento da lista. */
  clicar(id: string, quando: string) {
    this.selectedId = id;
    return this.render(quando);
  }

  /** Um handoff do Radar entrega algo novo: entra na lista, no topo. */
  handoff(id: string) {
    this.availableIds = [id, ...this.availableIds];
  }

  /** F5: a memória da sessão some e a leitura recomeça do zero. */
  recarregar() {
    this.selectedId = "";
    this.userStatesReady = false;
    this.ultimoAtivo = "";
  }

  /** Só os ids gravados, na ordem. */
  get gravados() { return this.gravacoes.map(item => item.id); }
}

/** Uma sessão já hidratada, para os casos que não são sobre hidratação. */
const hidratada = (ids: string[], states: Record<string, UserDocumentState> = {}, url: string | null = null) => {
  const s = new Sessao(ids, states, url);
  s.userStatesReady = true;
  return s;
};

/* ============ COMPORTAMENTAL · 6A.12 · HIDRATAÇÃO ============ */

test("01 · a lista já chegou e os user states não: NADA é gravado", () => {
  /*
   * DOCS_READY_USER_STATES_PENDING_DOES_NOT_PERSIST_FALLBACK
   *
   * O cenário exato da recuperação local: `documents` veio do navegador, o mapa
   * de user states não. Antes, aqui, `documents[0]` virava ativo e era gravado.
   */
  const s = new Sessao(["B", "A"]);
  const ativo = s.render("2026-09-19T10:00:00.000Z");

  assert.deepEqual(ativo, { id: "", origin: "pending" }, "a resposta honesta é 'ainda não sei'");
  assert.deepEqual(s.gravados, [], "nenhuma gravação durante a hidratação");
  assert.equal(s.userStates.B, undefined, "o primeiro da lista não foi tocado");
});

test("02 · hidratou com A: A vence e SÓ A é gravado", () => {
  /* PERSISTED_SELECTION_AFTER_HYDRATION_WINS + ONE_MOUNT_WRITES_ONLY_FINAL_ACTIVE_DOCUMENT */
  const s = new Sessao(["B", "A"]);          // B encabeça a lista: é o mais recente
  s.render("2026-09-19T10:00:00.000Z");      // ainda pendente
  assert.deepEqual(s.gravados, []);

  s.hidratar({ A: { lastOpenedAt: "2026-09-19T09:00:00.000Z" } });
  const ativo = s.render("2026-09-19T10:00:01.000Z");

  assert.deepEqual(ativo, { id: "A", origin: "last_opened" });
  assert.deepEqual(s.gravados, ["A"], "uma montagem grava um documento só: o ativo final");
  assert.equal(s.userStates.B, undefined, "B nunca foi aberto e continua sem lastOpenedAt");
});

test("03 · hidratou realmente vazio: aí o fallback é legítimo, e grava UMA vez", () => {
  /* LOADED_EMPTY_USER_STATE_ALLOWS_FALLBACK */
  const s = new Sessao(["B", "A"]);
  s.render("2026-09-19T10:00:00.000Z");
  assert.deepEqual(s.gravados, [], "pendente não grava");

  s.hidratar({});                             // a leitura voltou: não há nada mesmo
  const ativo = s.render("2026-09-19T10:00:01.000Z");

  assert.deepEqual(ativo, { id: "B", origin: "fallback" });
  assert.deepEqual(s.gravados, ["B"], "uma única gravação legítima");

  /* E renders seguintes não repetem a gravação. */
  s.render("2026-09-19T10:00:02.000Z");
  s.render("2026-09-19T10:00:03.000Z");
  assert.deepEqual(s.gravados, ["B"]);
});

test("04 · a escolha da sessão resolve antes da hidratação", () => {
  /* EXPLICIT_SESSION_SELECTION_CAN_RESOLVE_EARLY */
  const s = new Sessao(["B", "A"]);
  assert.equal(s.userStatesReady, false);

  const ativo = s.clicar("A", "2026-09-19T10:00:00.000Z");
  assert.deepEqual(ativo, { id: "A", origin: "session" }, "não faz sentido travar quem já escolheu");
  assert.deepEqual(s.gravados, ["A"], "escolha explícita pode ser registrada de imediato");
});

test("05 · a URL resolve antes da hidratação", () => {
  /* EXPLICIT_URL_SELECTION_CAN_RESOLVE_EARLY */
  const s = new Sessao(["B", "A"], {}, "A");
  const ativo = s.render("2026-09-19T10:00:00.000Z");

  assert.deepEqual(ativo, { id: "A", origin: "url" });
  assert.deepEqual(s.gravados, ["A"]);

  /* Uma URL que não existe na lista não resolve nada: volta a esperar. */
  const t = new Sessao(["B", "A"], {}, "SUMIU");
  assert.deepEqual(t.render("2026-09-19T10:00:00.000Z"), { id: "", origin: "pending" });
  assert.deepEqual(t.gravados, []);
});

test("06 · um F5 não encosta no documento que não foi escolhido", () => {
  /* F5_DOES_NOT_TOUCH_UNSELECTED_DOCUMENT — o caso observado ao vivo. */
  const s = new Sessao(["A"]);
  s.hidratar();
  s.clicar("A", "2026-09-19T10:00:00.000Z");
  s.handoff("B");                              // o handoff encabeça a lista

  s.recarregar();
  s.render("2026-09-19T10:01:00.000Z");        // pendente: a lista já está aí
  s.hidratar();                                 // os states voltam do servidor
  const ativo = s.render("2026-09-19T10:01:01.000Z");

  assert.deepEqual(ativo, { id: "A", origin: "last_opened" });
  assert.deepEqual(s.gravados, ["A", "A"], "duas aberturas de A, nenhuma de B");
  assert.equal(s.userStates.B, undefined, "B não foi encostado");
});

test("07 · a decisão de gravar não depende só da origem", () => {
  const base = { documentId: "A", userStatesReady: true };

  /* Sem documento, nada grava — nem com origem boa. */
  assert.equal(shouldPersistLastOpened({ ...base, documentId: "", origin: "session" }), false);

  /* Pendente e vazio nunca gravam. */
  assert.equal(shouldPersistLastOpened({ ...base, origin: "pending" }), false);
  assert.equal(shouldPersistLastOpened({ ...base, origin: "none" }), false);

  /* Explícitas gravam com ou sem hidratação. */
  for (const origin of ["session", "url"] as ActiveDocumentOrigin[]) {
    assert.equal(shouldPersistLastOpened({ ...base, origin, userStatesReady: false }), true, origin);
    assert.equal(shouldPersistLastOpened({ ...base, origin, userStatesReady: true }), true, origin);
  }

  /*
   * ESTA é a asserção que guarda o defeito: as origens DERIVADAS são conclusões
   * tiradas do mapa de user states. Sem o mapa, não há conclusão — há chute.
   */
  for (const origin of ["last_opened", "fallback"] as ActiveDocumentOrigin[]) {
    assert.equal(shouldPersistLastOpened({ ...base, origin, userStatesReady: false }), false,
      `${origin} sem hidratação é chute, e chute vira gravação`);
    assert.equal(shouldPersistLastOpened({ ...base, origin, userStatesReady: true }), true, origin);
  }
});

/* ============ COMPORTAMENTAL · 6A.10 · O F5 ============ */

test("08 · A aberto, F5, A continua ativo", () => {
  const s = new Sessao(["A", "B"]);
  s.hidratar();
  s.clicar("A", "2026-09-19T10:00:00.000Z");

  s.recarregar();
  s.hidratar();
  assert.deepEqual(s.resolver(), { id: "A", origin: "last_opened" },
    "o que atravessa o F5 é o lastOpenedAt, não a memória");
});

test("09 · A aberto, B chega mais recente, F5, A continua", () => {
  const s = new Sessao(["A"]);
  s.hidratar();
  s.clicar("A", "2026-09-19T10:00:00.000Z");

  s.handoff("B");
  assert.equal(s.availableIds[0], "B", "a lista realmente reordenou");
  assert.deepEqual(s.resolver(), { id: "A", origin: "session" });

  s.recarregar(); s.hidratar();
  assert.deepEqual(s.resolver(), { id: "A", origin: "last_opened" });

  /* SEGUNDO F5. */
  s.render("2026-09-19T10:05:00.000Z");
  s.recarregar(); s.hidratar();
  assert.deepEqual(s.resolver(), { id: "A", origin: "last_opened" });
  assert.equal(s.userStates.B, undefined, "B nunca ganhou lastOpenedAt");
});

test("10 · a URL vence o lastOpenedAt; a sessão vence a URL", () => {
  const s = hidratada(["A", "B"], { A: { lastOpenedAt: "2026-09-19T10:00:00.000Z" } }, "B");
  assert.deepEqual(s.resolver(), { id: "B", origin: "url" });

  /*
   * A escolha da sessão vence a URL — divergência declarada do enunciado do
   * 6A.10. Sem ela, quem abre `?documentId=B` ficaria preso em B: clicar em A
   * na lista não teria efeito, porque a URL não muda ao clicar.
   */
  s.clicar("A", "2026-09-19T11:01:00.000Z");
  assert.deepEqual(s.resolver(), { id: "A", origin: "session" });
});

test("11 · a escolha da sessão sobrevive à lista mudar", () => {
  const s = hidratada(["A", "B"]);
  s.clicar("A", "2026-09-19T10:00:00.000Z");
  s.handoff("C"); s.handoff("D");
  s.availableIds = ["D", "C", "B", "A"];

  assert.deepEqual(s.resolver(), { id: "A", origin: "session" });
});

test("12 · referência obsoleta não deixa a tela sem seleção", () => {
  const s = hidratada(["B", "C"], { SUMIU: { lastOpenedAt: "2026-09-19T10:00:00.000Z" } });
  assert.deepEqual(s.resolver(), { id: "B", origin: "fallback" });

  const t = hidratada(["B", "C"], {
    SUMIU: { lastOpenedAt: "2026-09-19T12:00:00.000Z" },
    C: { lastOpenedAt: "2026-09-19T10:00:00.000Z" },
  });
  assert.deepEqual(t.resolver(), { id: "C", origin: "last_opened" });

  /* Seleção e URL obsoletas também são ignoradas, e a resolução desce. */
  const u = hidratada(["B", "C"], { C: { lastOpenedAt: "2026-09-19T10:00:00.000Z" } }, "TAMBEM_SUMIU");
  u.selectedId = "SUMIU";
  assert.deepEqual(u.resolver(), { id: "C", origin: "last_opened" });

  const v = hidratada(["B", "C"], {}, "SUMIU");
  v.selectedId = "SUMIU_TAMBEM";
  assert.deepEqual(v.resolver(), { id: "B", origin: "fallback" });
});

test("13 · sem estado anterior, o primeiro da lista", () => {
  assert.deepEqual(hidratada(["B", "A"]).resolver(), { id: "B", origin: "fallback" });
  assert.deepEqual(hidratada([]).resolver(), { id: "", origin: "none" });

  /* Estado sem `lastOpenedAt` não conta como estado. */
  assert.deepEqual(hidratada(["B", "A"], { A: {} }).resolver(), { id: "B", origin: "fallback" });
  assert.deepEqual(hidratada(["B", "A"], { A: { lastOpenedAt: null } }).resolver(),
    { id: "B", origin: "fallback" });

  /* Lista vazia e sem hidratação continua sendo espera, não `none`. */
  assert.deepEqual(new Sessao([]).resolver(), { id: "", origin: "pending" });
});

test("14 · o mais recente entre os que existem", () => {
  const estados = {
    A: { lastOpenedAt: "2026-09-19T10:00:00.000Z" },
    B: { lastOpenedAt: "2026-09-19T12:00:00.000Z" },
    C: { lastOpenedAt: "2026-09-19T11:00:00.000Z" },
  };
  assert.equal(mostRecentlyOpenedId({ userStates: estados, availableIds: ["A", "B", "C"] }), "B");
  assert.equal(mostRecentlyOpenedId({ userStates: estados, availableIds: ["A", "C"] }), "C");
  assert.equal(mostRecentlyOpenedId({ userStates: {}, availableIds: ["A"] }), null);
  assert.equal(mostRecentlyOpenedId({ userStates: estados, availableIds: [] }), null);
});

test("15 · o que chegou depois é marcado, não navegado", () => {
  const conhecidos = new Set(["A", "B"]);
  assert.deepEqual([...newlyArrivedIds({ conhecidos, availableIds: ["C", "A", "B"] })], ["C"]);
  assert.deepEqual([...newlyArrivedIds({ conhecidos, availableIds: ["A", "B"] })], []);
  assert.deepEqual([...newlyArrivedIds({ conhecidos: new Set(), availableIds: ["A", "B"] })], []);
});

/* ======================= ESTRUTURAL ======================= */

test("16 · ESTRUTURAL · o contexto expõe a hidratação dos user states", async () => {
  const src = semComentarios(await fonte(CONTEXTO));

  /* Nasce falso: antes da leitura, ninguém sabe o que foi aberto. */
  assert.match(src, /documentUserStates: \{\}, documentUserStatesReady: false,/,
    "o workspace vazio não pode afirmar que a leitura já voltou");

  /*
   * E vira verdadeiro nos TRÊS desfechos da leitura — sucesso, resposta ruim e
   * exceção. Faltar um deixaria a tela esperando para sempre naquele caminho.
   */
  assert.equal(src.split("documentUserStatesReady: true").length - 1, 3,
    "os três pontos onde a leitura assenta precisam marcar hidratado");

  /*
   * A recuperação local restaura `documents` e NÃO restaura user states — é a
   * janela do defeito. Marcar hidratado ali reabriria o caso.
   */
  const recuperacao = src.slice(src.indexOf("documents: recovered.documents"));
  const ateOFim = recuperacao.slice(0, recuperacao.indexOf("persistenceMode: \"local_fallback\","));
  assert.doesNotMatch(ateOFim, /documentUserStatesReady/,
    "a recuperação local não traz user states; não pode dizer que trouxe");
});

test("17 · ESTRUTURAL · a tela passa a hidratação para a regra e para a gravação", async () => {
  const src = semComentarios(await fonte(TELA));

  assert.match(src, /resolveActiveDocument\(\{/);
  assert.match(src, /userStates: pipeline\.documentUserStates,/);
  assert.match(src, /userStatesReady: pipeline\.documentUserStatesReady,/);
  assert.match(src, /urlDocumentId: preferred\?\.id \?\? initialDocumentId,/);

  /*
   * A gravação recebe os três: origem, documento e hidratação. A versão antiga
   * passava só a origem, e foi assim que o fallback durante a carga gravou.
   */
  assert.match(src, /shouldPersistLastOpened\(\{ origin: ativo\.origin, documentId: ativo\.id, userStatesReady: pipeline\.documentUserStatesReady \}\)/);
  assert.doesNotMatch(src, /shouldPersistLastOpened\(ativo\.origin\)/, "a assinatura antiga saiu");
  assert.doesNotMatch(src, /persistedId: pipeline\.moduleState/, "moduleState morre no F5");
  assert.doesNotMatch(src, /resolveActiveDocumentId/, "a API antiga saiu");
});

test("18 · ESTRUTURAL · durante a espera a tela não monta documento provisório", async () => {
  const src = semComentarios(await fonte(TELA));

  assert.match(src, /ativo\.origin === "pending"/);
  assert.match(src, /data-selecao-pendente/);

  /*
   * E a mensagem de lista vazia não pode aparecer durante a espera: dizer
   * "nenhum rascunho disponível" antes de perguntar é a mesma mentira que o
   * `empty_confirmed` inicial conta no diagnóstico de carga.
   */
  const trecho = src.slice(src.indexOf("data-selecao-pendente"));
  assert.match(trecho.slice(0, 400), /Nenhum rascunho disponível/,
    "a mensagem de vazio é o ramo ALTERNATIVO da espera, não irmã dela");
});

test("19 · ESTRUTURAL · o fallback silencioso continua fora e o ativo é visível", async () => {
  const src = semComentarios(await fonte(TELA));

  assert.doesNotMatch(src, /const selected = pipeline\.documents\[[^\]]*\] \|\| preferred \|\| documents\[0\]/,
    "o documento ativo não pode cair no primeiro da lista a cada render");
  /*
   * E1 · o documento vem da regra (`ativo.id`); o editável é ESSE MESMO
   * documento quando está completo, e nulo enquanto é a cópia parcial da
   * listagem — nunca outro documento da lista.
   */
  assert.match(src, /const listado = pipeline\.documents\[ativo\.id\] \|\| null;/);
  assert.match(src, /const selected = listado && !isPartialContentDocument\(listado\) \? listado : null;/);
  assert.match(src, /const \[selectedId, setSelectedId\] = useState\(""\);/);
  assert.doesNotMatch(src, /localStorage\.[gs]etItem\([^)]*selectedId/i,
    "a seleção não vira estado de navegador");

  assert.match(src, /aria-current=\{item\.id === selected\?\.id \? "true" : undefined\}/);
  assert.match(src, /data-documento-ativo/);
  assert.match(src, /em edição/);
  assert.match(src, /novos\.has\(item\.id\) && item\.id !== selected\?\.id/);
  assert.match(src, /data-documento-novo/);

  /* `choose` só é chamado pelo clique — nenhum efeito navega. */
  assert.ok(src.includes("const choose = (id: string)"), "a declaração existe");
  assert.equal(src.split("choose(").length - 1, 1, "uma única chamada: o onClick da lista");
  assert.doesNotMatch(src, /useEffect\([^)]*\)\s*=>\s*\{[^}]*choose\(/);
});
