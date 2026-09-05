import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../components/info-hint.tsx", import.meta.url), "utf8");

test("InfoHint usa o amarelo canônico apenas na assinatura contextual", () => {
  assert.match(source, /text-pending transition-colors/);
  assert.match(source, /hover:bg-pending\/10 hover:text-pending/);
  assert.match(source, /focus-visible:ring-2 focus-visible:ring-pending\/50/);
  assert.match(source, /text-sm font-semibold leading-5 text-pending/);
  assert.match(source, /text-sm leading-5 text-foreground\/85/);
  assert.match(source, /Tooltip\.Arrow className="fill-pending"/);
  assert.doesNotMatch(source, /bg-pending(?:\s|\")/);
  assert.doesNotMatch(source, /bg-warning|text-warning|border-warning/);
});

test("InfoHint mantém Quiet UI, largura responsiva e collision handling", () => {
  assert.match(source, /w-80 max-w-\[calc\(100vw-2rem\)\]/);
  assert.match(source, /border border-divider bg-surface-elevated/);
  assert.match(source, /sideOffset=\{8\}/);
  assert.match(source, /collisionPadding=\{8\}/);
  assert.match(source, /avoidCollisions/);
  assert.match(source, /onEscapeKeyDown=\{event => event\.stopPropagation\(\)\}/);
});

test("InfoHint mantém ícone opcional e trigger de controle sem reimplementar interação", () => {
  assert.match(source, /children\?: ReactNode/);
  assert.match(source, /Tooltip\.Trigger asChild/);
  assert.match(source, /<svg width="12" height="12"/);
  assert.match(source, /InfoHintGlyph/);
  assert.match(source, /<Tooltip\.Trigger type="button"/);
  assert.doesNotMatch(source, /querySelector|data-target|onMouseOver/);
});
