import assert from "node:assert/strict";
import test from "node:test";
import { montarRadar, React } from "./radar-dom-harness.mts";
import { OperationalDataGrid, ROLAGEM_GRAVADA_APOS_MS } from "../components/editorial/operational-data-grid.tsx";
import { gridViewStorageKey } from "../lib/editorial/data-grid.ts";

/*
 * ====== 2026-10-08 · ROLAR A PLANILHA NÃO ESCREVE NO STORAGE A CADA EVENTO ======
 *
 * O dono: "o scroll está muito lento". O `onScroll` da planilha gravava a
 * posição no localStorage — escrita síncrona — em TODO evento de rolagem.
 * Agora a posição espera a rolagem parar (ROLAGEM_GRAVADA_APOS_MS) e é gravada
 * uma vez; a posição restaurada ao voltar é a mesma de antes. A planilha é
 * compartilhada (Minerador, Arquiteto, Radar): a regra vale para todos.
 */

type Linha = { id: string; nome: string };
const LINHAS: Linha[] = Array.from({ length: 30 }, (_, k) => ({ id: `linha-${k}`, nome: `Linha ${k}` }));
const COLUNAS = [{ id: "nome", header: "Nome", value: (linha: Linha) => linha.nome }];
const CHAVE = `${gridViewStorageKey("dono", "marca-1", "radar")}:scroll`;
const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/*
 * O espião troca o `window.localStorage` inteiro por um que conta e repassa.
 * Atribuir `localStorage.setItem = …` gravaria um item chamado "setItem" (é
 * assim que Storage trata propriedades), e o espião nunca veria nada.
 */
function espiarGravacoes() {
  const janela = (globalThis as unknown as { window: Window }).window;
  const descritor = Object.getOwnPropertyDescriptor(janela, "localStorage");
  const real = janela.localStorage;
  const gravacoes: string[] = [];
  const espiao = {
    getItem: (chave: string) => real.getItem(chave),
    setItem: (chave: string, valor: string) => { if (chave === CHAVE) gravacoes.push(valor); real.setItem(chave, valor); },
    removeItem: (chave: string) => real.removeItem(chave),
    clear: () => real.clear(),
    key: (indice: number) => real.key(indice),
    get length() { return real.length; },
  };
  Object.defineProperty(janela, "localStorage", { value: espiao, configurable: true, writable: true });
  return {
    gravacoes,
    restaurar: () => {
      if (descritor) Object.defineProperty(janela, "localStorage", descritor);
      else delete (janela as unknown as Record<string, unknown>).localStorage;
    },
  };
}

const planilha = () => React.createElement(OperationalDataGrid<Linha>, { module: "radar", userId: "dono", brandId: "marca-1", rows: LINHAS, columns: COLUNAS });

test("60 eventos de rolagem seguidos gravam a posição uma vez — a última", async () => {
  const tela = await montarRadar();
  const espiao = espiarGravacoes();
  try {
    await tela.render(planilha());
    await React.act(async () => { await esperar(ROLAGEM_GRAVADA_APOS_MS + 50); });
    espiao.gravacoes.length = 0;
    const rolagem = tela.container.querySelector("section[aria-label='Planilha radar'] div.overflow-auto") as HTMLElement;
    assert.ok(rolagem, "o contêiner de rolagem da planilha sumiu");
    await React.act(async () => {
      for (let evento = 1; evento <= 60; evento += 1) {
        rolagem.scrollTop = evento * 7;
        rolagem.dispatchEvent(new (globalThis as unknown as { Event: typeof Event }).Event("scroll"));
      }
    });
    assert.ok(espiao.gravacoes.length <= 1, `${espiao.gravacoes.length} gravações durante a rolagem — voltou a gravar por evento`);
    await React.act(async () => { await esperar(ROLAGEM_GRAVADA_APOS_MS + 50); });
    assert.ok(espiao.gravacoes.length >= 1 && espiao.gravacoes.length <= 2, `${espiao.gravacoes.length} gravações no total`);
    assert.equal(espiao.gravacoes.at(-1), String(rolagem.scrollTop), "a posição gravada não é a última");
  } finally {
    espiao.restaurar();
    tela.destroy();
  }
});

test("desmontar no meio da rolagem grava o que estava pendente, e remontar restaura a posição", async () => {
  const tela = await montarRadar();
  const espiao = espiarGravacoes();
  try {
    await tela.render(planilha());
    /* A planilha restaura a posição anterior e aplica a visão salva; só então a pessoa rola. */
    await React.act(async () => { await esperar(ROLAGEM_GRAVADA_APOS_MS + 50); });
    espiao.gravacoes.length = 0;
    const rolagem = tela.container.querySelector("section[aria-label='Planilha radar'] div.overflow-auto") as HTMLElement;
    await React.act(async () => {
      rolagem.scrollTop = 333;
      rolagem.dispatchEvent(new (globalThis as unknown as { Event: typeof Event }).Event("scroll"));
    });
    const valorRolado = String(rolagem.scrollTop);
    assert.equal(espiao.gravacoes.length, 0, "gravou antes de a rolagem parar");
    /* Desmonta a planilha (troca a árvore) antes de a espera vencer. */
    await tela.render(React.createElement("div"));
    tela.destroy();
    assert.equal(espiao.gravacoes.at(-1), valorRolado, "a desmontagem perdeu a posição pendente");
    assert.equal((globalThis as unknown as { window: Window }).window.localStorage.getItem(CHAVE), valorRolado);
  } finally {
    espiao.restaurar();
  }
  /* Remonta: o mesmo efeito de restauração de sempre lê a chave e rola até ela. */
  const outra = await montarRadar();
  try {
    let pedido: unknown = null;
    const original = (globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement.prototype.scrollTo;
    (globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement.prototype.scrollTo = function (opcoes?: unknown) { pedido = opcoes; };
    try {
      await outra.render(planilha());
      await React.act(async () => { await esperar(20); });
    } finally {
      (globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement.prototype.scrollTo = original;
    }
    assert.deepEqual(pedido, { top: Number((globalThis as unknown as { window: Window }).window.localStorage.getItem(CHAVE)) });
  } finally {
    outra.destroy();
  }
});

/*
 * 2026-10-08 · revisão: TROCA DE MARCA COM UM EVENTO DE ROLAGEM NO MEIO.
 *
 * O navegador pode disparar `scroll` já com a chave NOVA antes da limpeza do
 * efeito — o clamp quando as linhas mudam, no mesmo commit da troca. A entrada
 * pendente da marca anterior era substituída pela nova e a última posição dela
 * nunca era gravada (o evento-a-evento antigo não tinha essa perda). Aqui um
 * `useLayoutEffect` irmão dispara esse evento no commit da troca, antes dos
 * efeitos passivos.
 */
test("troca de marca com evento de rolagem antes da limpeza: a última posição da marca anterior é gravada", async () => {
  const CHAVE_A = `${gridViewStorageKey("dono", "marca-A", "radar")}:scroll`;
  const CHAVE_B = `${gridViewStorageKey("dono", "marca-B", "radar")}:scroll`;
  const seletor = "section[aria-label='Planilha radar'] div.overflow-auto";
  function Tela({ marca }: { marca: string }) {
    React.useLayoutEffect(() => {
      if (marca !== "marca-B") return;
      const rolagem = document.querySelector(seletor) as HTMLElement | null;
      if (!rolagem) return;
      rolagem.scrollTop = 0;
      rolagem.dispatchEvent(new (globalThis as unknown as { Event: typeof Event }).Event("scroll"));
    }, [marca]);
    return React.createElement(OperationalDataGrid<Linha>, { module: "radar", userId: "dono", brandId: marca, rows: LINHAS, columns: COLUNAS });
  }
  const tela = await montarRadar();
  const armazenamento = (globalThis as unknown as { window: Window }).window.localStorage;
  armazenamento.removeItem(CHAVE_A);
  armazenamento.removeItem(CHAVE_B);
  try {
    await tela.render(React.createElement(Tela, { marca: "marca-A" }));
    await React.act(async () => { await esperar(ROLAGEM_GRAVADA_APOS_MS + 50); });
    const rolagem = tela.container.querySelector(seletor) as HTMLElement;
    await React.act(async () => {
      rolagem.scrollTop = 500;
      rolagem.dispatchEvent(new (globalThis as unknown as { Event: typeof Event }).Event("scroll"));
    });
    assert.equal(armazenamento.getItem(CHAVE_A), null, "premissa: ainda dentro da espera, nada gravado");
    await tela.render(React.createElement(Tela, { marca: "marca-B" }));
    await React.act(async () => { await esperar(ROLAGEM_GRAVADA_APOS_MS + 50); });
    assert.equal(armazenamento.getItem(CHAVE_A), "500", "a última posição da marca A se perdeu na troca de chave");
    assert.equal(armazenamento.getItem(CHAVE_B), "0", "e a da marca B é a dela");
  } finally {
    tela.destroy();
  }
});
