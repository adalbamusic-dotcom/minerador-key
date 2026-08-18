import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { CheckSquare, Minus, Square } from "lucide-react";

export function KeywordSelectionHeader({ allSelected, someSelected, onToggle, resizeHandle }: { allSelected: boolean; someSelected: boolean; onToggle: () => void; resizeHandle?: ReactNode }) {
  return <th className="relative w-8 border-r border-divider/70 px-3 py-2 text-center">
    <button type="button" role="checkbox" aria-checked={someSelected ? "mixed" : allSelected} aria-label="Selecionar ou desmarcar keywords visíveis" onClick={onToggle} className="inline-block align-middle transition-colors hover:text-module-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent">
      {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-module-accent"/> : someSelected ? <Minus className="h-3.5 w-3.5 text-module-accent"/> : <Square className="h-3.5 w-3.5"/>}
    </button>
    {resizeHandle}
  </th>;
}

export function KeywordSelectionCell({ id, keyword, selected, onPointerDown, onClick }: {
  id: string;
  keyword: string;
  selected: boolean;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return <td className="w-8 select-none border-r border-divider/70 px-0 py-1 text-center">
    <div data-keyword-selection-id={id} data-keyword-selection-handle="true" className="flex w-full select-none items-center justify-center" aria-label={`Área de pintura da keyword ${keyword}`}>
    <button type="button" role="checkbox" aria-checked={selected} aria-label={`${selected ? "Desmarcar" : "Selecionar"} keyword ${keyword}`} onPointerDown={onPointerDown} onClick={onClick} className="inline-block cursor-pointer touch-none select-none align-middle text-foreground/55 transition-colors hover:text-module-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent">
      {selected ? <CheckSquare className="h-3.5 w-3.5 text-module-accent"/> : <Square className="h-3.5 w-3.5"/>}
      </button>
    </div>
  </td>;
}
