"use client";

import type { ReactNode } from "react";
import { InfoHint, InfoHintGlyph } from "@/components/info-hint";
import { InlineLabelCluster } from "@/components/inline-label-cluster";

type MineradorProcessActionProps = {
  title: string;
  description: string;
  label: string;
  ariaLabel: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  activeClassName?: string;
  buttonClassName?: string;
  labelClassName?: string;
};

/**
 * Ação de processo com ícone funcional e cluster textual compartilhado.
 * O InfoHint envolve o botão existente como trigger customizado, sem criar
 * nested button ou substituir o handler da ação.
 */
export function MineradorProcessAction({
  title,
  description,
  label,
  ariaLabel,
  icon,
  onClick,
  disabled = false,
  activeClassName = "",
  buttonClassName = "",
  labelClassName = "hidden lg:inline",
}: MineradorProcessActionProps) {
  return (
    <div className={`group inline-flex min-h-9 shrink-0 items-center rounded-md border border-divider bg-surface-subtle px-0.5 text-sm font-medium text-foreground transition-colors hover:border-module-accent/45 hover:bg-surface-elevated ${activeClassName}`}>
      <InfoHint title={title} description={description}>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={ariaLabel}
          className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded px-1.5 py-1 text-inherit transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-module-accent disabled:cursor-not-allowed disabled:opacity-50 sm:px-2 ${buttonClassName}`}
        >
          {icon}
          <InlineLabelCluster
            label={<span className={labelClassName}>{label}</span>}
            info={<span className="inline-flex shrink-0 items-center justify-center text-pending" aria-hidden="true"><InfoHintGlyph /></span>}
          />
        </button>
      </InfoHint>
    </div>
  );
}
