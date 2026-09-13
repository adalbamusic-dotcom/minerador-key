import { Window } from "happy-dom";

/**
 * O DOM MÍNIMO PARA PROVAR UM CLIQUE DE VERDADE.
 *
 * Até aqui os testes de tela liam markup estático: eles provavam que o botão
 * certo aparece em cada estado, e não que clicar nele executa o handler certo.
 * A diferença importa exatamente onde erra em silêncio — um `onClick` ligado ao
 * handler errado renderiza igual e passa em toda varredura de string.
 *
 * POR QUE `happy-dom` E NADA MAIS.
 *
 * O projeto não tinha nenhuma infraestrutura de DOM: nem jsdom, nem
 * testing-library, nem test-renderer, nem runner com ambiente de navegador —
 * verificado em `package.json` e em `node_modules`. Esta é a menor dependência
 * de DESENVOLVIMENTO que fecha a lacuna. Nada de `@testing-library/*`: o
 * disparo usa `element.click()` nativo e `React.act`, que já vêm com o React.
 *
 * `navigator` é getter-only no Node 24 — atribuir lança, e por isso cada global
 * entra por `defineProperty`.
 */
const janela = new Window({ url: "http://localhost/" });
const origem = janela as unknown as Record<string, unknown>;

const GLOBAIS = [
  "window", "document", "navigator", "location",
  "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "HTMLButtonElement",
  "Element", "Node", "Event", "MouseEvent", "CustomEvent", "KeyboardEvent", "InputEvent",
  "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
];

for (const chave of GLOBAIS) {
  Object.defineProperty(globalThis, chave, { value: origem[chave], writable: true, configurable: true });
}
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true, configurable: true });

const React = await import("react");
const { createRoot } = await import("react-dom/client");

const doc = () => (globalThis as unknown as { document: Document }).document;

/**
 * ESCREVER NO CAMPO SEM O REACT IGNORAR.
 *
 * O React guarda o último valor de cada input num rastreador instalado sobre a
 * própria propriedade `value` do elemento. Atribuir `campo.value = x`
 * atravessa esse rastreador: ele registra a mudança, conclui que nada mudou
 * quando o evento chega, e `onChange` nunca dispara — o teste passaria a
 * medir o silêncio. Escrever pelo setter do PROTÓTIPO contorna o rastreador,
 * que é o que um teclado real faz.
 */
function escreverValor(elemento: HTMLElement, valor: string) {
  const janelaGlobal = globalThis as unknown as { HTMLInputElement: typeof HTMLInputElement; HTMLSelectElement: typeof HTMLSelectElement; HTMLTextAreaElement: typeof HTMLTextAreaElement };
  const prototipo = elemento.tagName === "SELECT" ? janelaGlobal.HTMLSelectElement.prototype
    : elemento.tagName === "TEXTAREA" ? janelaGlobal.HTMLTextAreaElement.prototype
    : janelaGlobal.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototipo, "value")?.set;
  if (setter) setter.call(elemento, valor);
  else (elemento as unknown as { value: string }).value = valor;
}

export type RadarDomScreen = {
  container: HTMLElement;
  /** Renderiza (ou re-renderiza) a árvore e espera o React assentar. */
  render: (element: React.ReactElement) => Promise<void>;
  /** O elemento com este `data-testid`, ou `null`. */
  query: (testId: string) => HTMLElement | null;
  /** O elemento com este `data-testid`. Falha alto quando não existe. */
  get: (testId: string) => HTMLElement;
  /** Todos com este `data-testid`. */
  all: (testId: string) => HTMLElement[];
  /** Um clique REAL: o evento sobe pela delegação do React. */
  click: (target: HTMLElement | string) => Promise<void>;
  /** Dois cliques sem esperar entre eles — o caso do usuário ansioso. */
  doubleClick: (target: HTMLElement | string) => Promise<void>;
  /** Digita num input/textarea disparando o evento que o React escuta. */
  type: (target: HTMLElement, value: string) => Promise<void>;
  /** Escolhe uma opção de `<select>`. */
  select: (target: HTMLElement, value: string) => Promise<void>;
  text: () => string;
  html: () => string;
  destroy: () => void;
};

export async function montarRadar(): Promise<RadarDomScreen> {
  const container = doc().createElement("div");
  doc().body.appendChild(container);
  const root = createRoot(container);

  const query = (testId: string) => container.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
  const resolver = (target: HTMLElement | string) => {
    const elemento = typeof target === "string" ? query(target) : target;
    if (!elemento) throw new Error(`Elemento não encontrado no DOM: ${String(target)}`);
    return elemento;
  };

  return {
    container,
    render: async (element: React.ReactElement) => { await React.act(async () => { root.render(element); }); },
    query,
    get: (testId: string) => {
      const elemento = query(testId);
      if (!elemento) throw new Error(`Elemento não encontrado no DOM: ${testId}`);
      return elemento;
    },
    all: (testId: string) => [...container.querySelectorAll(`[data-testid="${testId}"]`)] as HTMLElement[],
    click: async (target: HTMLElement | string) => { await React.act(async () => { resolver(target).click(); }); },
    /*
     * DOIS CLIQUES DENTRO DO MESMO TIQUE.
     *
     * O guarda precisa fechar a porta ANTES do primeiro `await`: estado de
     * render chega tarde demais. Disparar os dois dentro de um `act` só é
     * justamente o cenário que o estado de render não cobriria.
     */
    doubleClick: async (target: HTMLElement | string) => {
      await React.act(async () => { const elemento = resolver(target); elemento.click(); elemento.click(); });
    },
    type: async (target: HTMLElement, value: string) => {
      await React.act(async () => {
        escreverValor(target, value);
        target.dispatchEvent(new (globalThis as unknown as { Event: typeof Event }).Event("input", { bubbles: true }));
      });
    },
    select: async (target: HTMLElement, value: string) => {
      await React.act(async () => {
        escreverValor(target, value);
        target.dispatchEvent(new (globalThis as unknown as { Event: typeof Event }).Event("change", { bubbles: true }));
      });
    },
    text: () => container.textContent || "",
    html: () => container.innerHTML,
    destroy: () => { React.act(() => { root.unmount(); }); container.remove(); },
  };
}

/**
 * O MESMO CONTEXTO QUE O `ProductShell` DÁ — e nada além dele.
 *
 * `InfoHint` monta um `Tooltip.Root` do Radix, que exige um `Tooltip.Provider`
 * acima. Na aplicação ele vem do `ProductShell`; montar um painel isolado no
 * teste não tem esse ancestral, e o componente lança. Envolver aqui reproduz a
 * árvore real em vez de afrouxar o componente para o teste passar.
 */
const Tooltip = await import("@radix-ui/react-tooltip");

export function comProductShell(elemento: React.ReactElement): React.ReactElement {
  return React.createElement(Tooltip.Provider, { delayDuration: 300, skipDelayDuration: 150, children: elemento });
}

export { React };
