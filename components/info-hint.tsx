"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";

export type InfoHintProps = {
  title?: string;
  description: string;
  children?: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
};

const defaultSide = "top" as const;
const defaultAlign = "center" as const;

const defaultTriggerClassName = "info-hint-inline-trigger inline-flex shrink-0 items-center justify-center rounded-md text-pending transition-colors hover:bg-pending/10 hover:text-pending focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pending/50";
const contentClassName = "z-50 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-divider bg-surface-elevated px-3 py-2 font-normal text-foreground shadow-md outline-none";

export function InfoHintGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
      <circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M6 3.25V6.25 M6 8.75v0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function resolveCustomTrigger(children: ReactNode): ReactElement {
  let child: ReactNode;
  try {
    child = Children.only(children);
  } catch {
    throw new Error("InfoHint children deve ser um único elemento React compatível com Tooltip.Trigger asChild.");
  }
  if (!isValidElement(child)) {
    throw new Error("InfoHint children deve ser um único elemento React compatível com Tooltip.Trigger asChild.");
  }
  return child;
}

export function InfoHint({
  title,
  description,
  children,
  side = defaultSide,
  align = defaultAlign,
}: InfoHintProps) {
  const customTrigger = children === undefined ? null : resolveCustomTrigger(children);
  const triggerLabel = title ? `Mais informações sobre ${title}` : "Mais informações";

  return (
    <Tooltip.Root>
      {customTrigger ? (
        <Tooltip.Trigger asChild>{customTrigger}</Tooltip.Trigger>
      ) : (
        <Tooltip.Trigger type="button" aria-label={triggerLabel} className={defaultTriggerClassName}>
          <InfoHintGlyph />
        </Tooltip.Trigger>
      )}
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={8}
          avoidCollisions
          onEscapeKeyDown={event => event.stopPropagation()}
          className={contentClassName}
        >
          {title ? <p className="text-sm font-semibold leading-5 text-pending">{title}</p> : null}
          <p className={title ? "mt-1 text-sm leading-5 text-foreground/85" : "text-sm leading-5 text-foreground/85"}>{description}</p>
          <Tooltip.Arrow className="fill-pending" width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
