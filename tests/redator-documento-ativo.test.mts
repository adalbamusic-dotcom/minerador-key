/**
 * ===== CORTE 6A.10 · O DOCUMENTO ATIVO SOBREVIVE AO F5 =====
 *
 * O 6A.9 fechou o roubo DURANTE a sessão, mas usava
 * `moduleState.redator.selectedId` como persistência — e ele não é: é estado
 * React do contexto, e volta a `{}` a cada carregamento. No F5 a resolução caía
 * em `documents[0]`, o mais recente, e o handoff do Radar tomava o lugar.
 *
 * A autoridade que atravessa o recarregamento é
 * `content_document_user_states.last_opened_at`, por usuário, já gravada pela
 * tela e já carregada no workspace.
 *
 * COMPORTAMENTAL — a regra, com um modelo explícito de reload.
 * ESTRUTURAL     — a tela, com asserções que impedem o defeito de voltar.
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

/** Comentário que explica uma ausência casa com a busca pela ausência. */
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ==========================================================================
 * UM MODELO DE SESSÃO — o que sobrevive ao reload e o que não
 *
 * A distinção é o ponto inteiro desta rodada, então ela precisa estar no teste,
 * não só na cabeça de quem lê. `recarregar()` joga fora exatamente o que o F5
 * joga: a escolha em memória. `userStates` fica, porque vem do servidor.
 * ========================================================================== */
class Sessao {
  selectedId = "";
  availableIds: string[];
  userStates: Record<string, UserDocumentState>;
  urlDocumentId: string | null;

  /*
   * Campos declarados e atribuídos à mão, não por parâmetro do construtor:
   * `test:redator` roda no `node --test` com remoção nativa de tipos, que recusa
   * o que exige transformação — e propriedade de parâmetro é exatamente isso.
   */
  constructor(
    availableIds: string[],
    userStates: Record<string, UserDocumentState> = {},
    urlDocumentId: string | null = null,
  ) {
    this.availableIds = availableIds;
    this.userStates = userStates;
    this.urlDocumentId = urlDocumentId;
  }

  /** O que a tela resolveria agora. */
  resolver() {
    return resolveActiveDocument({
      selectedId: this.selectedId, urlDocumentId: this.urlDocumentId,
      userStates: this.userStates, availableIds: this.availableIds,
    });
  }

  /** Resolve E persiste, como o efeito da tela faz quando a origem é legítima. */
  abrir(quando: string) {
    const ativo = this.resolver();
    if (ativo.id && shouldPersistLastOpened(ativo.origin)) {
      this.userStates[ativo.id] = { lastOpenedAt: quando };
    }
    return ativo;
  }

  /** A pessoa clica num documento da lista. */
  clicar(id: string, quando: string) {
    this.selectedId = id;
    return this.abrir(quando);
  }

  /** Um handoff do Radar entrega algo novo: entra na lista, no topo. */
  handoff(id: string) {
    this.availableIds = [id, ...this.availableIds];
  }

  /** F5: a memória da sessão some; o estado de usuário, não. */
  recarregar() {
    this.selectedId = "";
  }
}

/* ======================= COMPORTAMENTAL ======================= */

test("01 · COMPORTAMENTAL · A aberto, F5, A continua ativo", () => {
  const s = new Sessao(["A", "B"]);
  s.clicar("A", "2026-09-19T10:00:00.000Z");

  s.recarregar();
  assert.deepEqual(s.resolver(), { id: "A", origin: "last_opened" },
    "o que atravessa o F5 é o lastOpenedAt, não a memória");
});

test("02 · COMPORTAMENTAL · A aberto, B chega mais recente, F5, A continua", () => {
  /* O caso que motivou quatro readbacks seguidos. */
  const s = new Sessao(["A"]);
  s.clicar("A", "2026-09-19T10:00:00.000Z");

  s.handoff("B");                       // B entra no topo: updated_at mais novo
  assert.equal(s.availableIds[0], "B", "a lista realmente reordenou");

  /* Ainda na mesma sessão: a escolha segura. */
  assert.deepEqual(s.resolver(), { id: "A", origin: "session" });

  /* E depois do F5, quem segura é o estado persistido. */
  s.recarregar();
  assert.deepEqual(s.resolver(), { id: "A", origin: "last_opened" });

  /* SEGUNDO F5 — o enunciado pede explicitamente. */
  s.abrir("2026-09-19T10:05:00.000Z");
  s.recarregar();
  assert.deepEqual(s.resolver(), { id: "A", origin: "last_opened" });
});

test("03 · COMPORTAMENTAL · handoff novo NÃO ganha lastOpenedAt automaticamente", () => {
  const s = new Sessao(["A"]);
  s.clicar("A", "2026-09-19T10:00:00.000Z");
  s.handoff("B");

  /* A tela resolve e persiste várias vezes: rerender, reordenação, reload. */
  s.abrir("2026-09-19T10:01:00.000Z");
  s.recarregar();
  s.abrir("2026-09-19T10:02:00.000Z");

  assert.equal(s.userStates.B, undefined,
    "B nunca foi aberto; ser o mais recente da lista não pode dar um último aberto a ele");
  assert.ok(s.userStates.A?.lastOpenedAt, "A continua sendo o aberto");
});

test("04 · COMPORTAMENTAL · a URL vence o lastOpenedAt", () => {
  const s = new Sessao(["A", "B"], {
    A: { lastOpenedAt: "2026-09-19T10:00:00.000Z" },
  }, "B");

  /* Sem escolha nesta sessão, a URL manda — mesmo com A tendo sido o último. */
  assert.deepEqual(s.resolver(), { id: "B", origin: "url" });

  /* E depois de aberto por URL, B passa a ter o seu próprio lastOpenedAt. */
  s.abrir("2026-09-19T11:00:00.000Z");
  assert.equal(s.userStates.B?.lastOpenedAt, "2026-09-19T11:00:00.000Z");

  /*
   * A escolha da sessão vence a URL — e isto é a divergência declarada do
   * enunciado. Sem ela, quem abre `?documentId=B` ficaria preso em B: clicar em
   * A na lista não teria efeito, porque a URL não muda ao clicar.
   */
  s.clicar("A", "2026-09-19T11:01:00.000Z");
  assert.deepEqual(s.resolver(), { id: "A", origin: "session" });
});

test("05 · COMPORTAMENTAL · a escolha da sessão sobrevive à lista mudar", () => {
  const s = new Sessao(["A", "B"]);
  s.clicar("A", "2026-09-19T10:00:00.000Z");

  s.handoff("C");
  s.handoff("D");
  s.availableIds = ["D", "C", "B", "A"];   // reordenação completa

  assert.deepEqual(s.resolver(), { id: "A", origin: "session" });
});

test("06 · COMPORTAMENTAL · lastOpenedAt obsoleto não deixa a tela sem seleção", () => {
  /* O documento que a pessoa usava foi removido. */
  const s = new Sessao(["B", "C"], {
    SUMIU: { lastOpenedAt: "2026-09-19T10:00:00.000Z" },
  });
  assert.deepEqual(s.resolver(), { id: "B", origin: "fallback" });

  /* Com um estado válido junto do obsoleto, o válido vence. */
  const t = new Sessao(["B", "C"], {
    SUMIU: { lastOpenedAt: "2026-09-19T12:00:00.000Z" },
    C: { lastOpenedAt: "2026-09-19T10:00:00.000Z" },
  });
  assert.deepEqual(t.resolver(), { id: "C", origin: "last_opened" });

  /*
   * O mesmo para as duas autoridades de cima: uma seleção ou uma URL que
   * apontam para o que não existe mais são ignoradas, e a resolução desce.
   */
  const u = new Sessao(["B", "C"], { C: { lastOpenedAt: "2026-09-19T10:00:00.000Z" } }, "TAMBEM_SUMIU");
  u.selectedId = "SUMIU";
  assert.deepEqual(u.resolver(), { id: "C", origin: "last_opened" });

  /* E sem nada válido em lugar nenhum, o primeiro da lista — nunca vazio. */
  const v = new Sessao(["B", "C"], {}, "SUMIU");
  v.selectedId = "SUMIU_TAMBEM";
  assert.deepEqual(v.resolver(), { id: "B", origin: "fallback" });
});

test("07 · COMPORTAMENTAL · sem estado anterior, o primeiro da lista", () => {
  assert.deepEqual(new Sessao(["B", "A"]).resolver(), { id: "B", origin: "fallback" });
  assert.deepEqual(new Sessao([]).resolver(), { id: "", origin: "none" });

  /* Estado sem `lastOpenedAt` não conta como estado. */
  assert.deepEqual(new Sessao(["B", "A"], { A: {} }).resolver(), { id: "B", origin: "fallback" });
  assert.deepEqual(new Sessao(["B", "A"], { A: { lastOpenedAt: null } }).resolver(),
    { id: "B", origin: "fallback" });
});

test("08 · COMPORTAMENTAL · o mais recente entre os que existem", () => {
  const estados = {
    A: { lastOpenedAt: "2026-09-19T10:00:00.000Z" },
    B: { lastOpenedAt: "2026-09-19T12:00:00.000Z" },
    C: { lastOpenedAt: "2026-09-19T11:00:00.000Z" },
  };
  assert.equal(mostRecentlyOpenedId({ userStates: estados, availableIds: ["A", "B", "C"] }), "B");

  /* B some da lista: o próximo mais recente entre os que restam. */
  assert.equal(mostRecentlyOpenedId({ userStates: estados, availableIds: ["A", "C"] }), "C");
  assert.equal(mostRecentlyOpenedId({ userStates: {}, availableIds: ["A"] }), null);
  assert.equal(mostRecentlyOpenedId({ userStates: estados, availableIds: [] }), null);
});

test("09 · COMPORTAMENTAL · só a origem none não persiste", () => {
  for (const origin of ["session", "url", "last_opened", "fallback"] as ActiveDocumentOrigin[]) {
    assert.equal(shouldPersistLastOpened(origin), true, `${origin} é seleção real`);
  }
  assert.equal(shouldPersistLastOpened("none"), false, "sem documento não há o que gravar");
});

test("10 · COMPORTAMENTAL · o que chegou depois é marcado, não navegado", () => {
  const conhecidos = new Set(["A", "B"]);
  assert.deepEqual([...newlyArrivedIds({ conhecidos, availableIds: ["C", "A", "B"] })], ["C"]);
  assert.deepEqual([...newlyArrivedIds({ conhecidos, availableIds: ["A", "B"] })], []);
  /* Sem fotografia inicial, nada é novo — marcar a lista toda seria pior. */
  assert.deepEqual([...newlyArrivedIds({ conhecidos: new Set(), availableIds: ["A", "B"] })], []);
});

/* ======================= ESTRUTURAL ======================= */

test("11 · ESTRUTURAL · a tela usa o estado persistido, não o volátil", async () => {
  const src = semComentarios(await fonte(TELA));

  assert.match(src, /resolveActiveDocument\(\{/);
  assert.match(src, /userStates: pipeline\.documentUserStates,/);
  assert.match(src, /urlDocumentId: preferred\?\.id \?\? initialDocumentId,/);

  /*
   * ESTA é a asserção que guarda a lição do 6A.9: `moduleState` é memória React
   * e não pode voltar a ser autoridade de continuidade.
   */
  assert.doesNotMatch(src, /persistedId: pipeline\.moduleState/,
    "moduleState morre no F5; não serve como persistência");
  assert.doesNotMatch(src, /resolveActiveDocumentId/, "a API antiga saiu");
});

test("12 · ESTRUTURAL · o fallback silencioso continua fora", async () => {
  const src = semComentarios(await fonte(TELA));

  assert.doesNotMatch(src, /const selected = pipeline\.documents\[[^\]]*\] \|\| preferred \|\| documents\[0\]/,
    "o documento ativo não pode cair no primeiro da lista a cada render");
  assert.match(src, /const selected = pipeline\.documents\[ativo\.id\] \|\| null;/);
  assert.match(src, /const \[selectedId, setSelectedId\] = useState\(""\);/);
  /*
   * `localStorage` existe nesta tela e é legítimo: guarda o rascunho de
   * recuperação. O que não pode é a SELEÇÃO virar estado de navegador — ela é
   * por usuário, no servidor.
   */
  assert.doesNotMatch(src, /localStorage\.[gs]etItem\([^)]*selectedId/i,
    "a seleção não vira estado de navegador");
  assert.doesNotMatch(src, /localStorage\.[gs]etItem\([^)]*lastOpened/i);
});

test("13 · ESTRUTURAL · a gravação de lastOpenedAt é condicionada", async () => {
  const src = semComentarios(await fonte(TELA));

  /*
   * O efeito que escreve `last_opened_at = now()` só roda para origem legítima.
   * Sem a condição, uma resolução por fallback daria ao documento errado um
   * "último aberto" que ele nunca teve — o defeito observado às 07:14.
   */
  assert.match(src, /if \(!selected \|\| !shouldPersistLastOpened\(ativo\.origin\)\) return;/);
  assert.match(src, /"\/api\/editorial\/documents"/);
});

test("14 · ESTRUTURAL · o ativo é visível e o novo só é marcado", async () => {
  const src = semComentarios(await fonte(TELA));

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
