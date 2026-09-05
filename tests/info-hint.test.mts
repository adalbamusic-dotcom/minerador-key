import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as Tooltip from "@radix-ui/react-tooltip";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InfoHint } from "../components/info-hint.tsx";

const infoHintSource = await readFile(new URL("../components/info-hint.tsx", import.meta.url), "utf8");
const productShellSource = await readFile(new URL("../components/product-shell.tsx", import.meta.url), "utf8");

function renderHint(element: ReactElement) {
  return renderToStaticMarkup(createElement(
    Tooltip.Provider,
    { delayDuration: 300, skipDelayDuration: 150, children: element },
  ));
}

test("InfoHint renderiza trigger padrão acessível sem depender do clique", () => {
  const markup = renderHint(createElement(InfoHint, {
    title: "Intenção",
    description: "Mostra o objetivo provável desta busca.",
  }));

  assert.match(markup, /aria-label="Mais informações sobre Intenção"/);
  assert.match(markup, /type="button"/);
  assert.match(markup, /<svg/);
  assert.doesNotMatch(markup, /<form|href=/);
});

test("InfoHint usa o controle existente como trigger sem criar nested button", () => {
  const markup = renderHint(createElement(
    InfoHint,
    { description: "Atualiza as métricas da keyword." },
    createElement("button", { type: "button", onClick: () => undefined }, "Atualizar"),
  ));

  assert.equal((markup.match(/<button/g) || []).length, 1);
  assert.match(markup, /Atualizar/);
});

test("InfoHint exige um único elemento quando recebe trigger customizado", () => {
  assert.throws(
    () => renderHint(createElement(InfoHint, { description: "Ajuda", children: "texto" })),
    /único elemento React/,
  );
});

test("InfoHint mantém contrato Radix, colisão, posicionamento e tokens sem estilo arbitrário", () => {
  assert.match(infoHintSource, /Tooltip\.Trigger asChild/);
  assert.match(infoHintSource, /sideOffset=\{8\}/);
  assert.match(infoHintSource, /collisionPadding=\{8\}/);
  assert.match(infoHintSource, /avoidCollisions/);
  assert.match(infoHintSource, /side\?: "top" \| "right" \| "bottom" \| "left"/);
  assert.match(infoHintSource, /align\?: "start" \| "center" \| "end"/);
  assert.match(infoHintSource, /description: string/);
  assert.doesNotMatch(infoHintSource, /Tooltip\.Provider/);
  assert.doesNotMatch(infoHintSource, /#[0-9a-f]{3,8}|\b(?:bg|text|border)-(?:black|white|purple|violet|indigo)\b/i);
});

test("ProductShell possui um único Tooltip.Provider global com delays centralizados", () => {
  assert.equal((productShellSource.match(/<Tooltip\.Provider/g) || []).length, 1);
  assert.match(productShellSource, /delayDuration=\{300\}/);
  assert.match(productShellSource, /skipDelayDuration=\{150\}/);
});
