import type { ReactNode } from "react";

export type InlineLabelClusterProps = {
  label: ReactNode;
  info?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  labelClassName?: string;
};

/**
 * Shared, non-wrapping composition for a label and its nearby affordances.
 * Spacing is owned by the visual system CSS tokens, not by consumers.
 */
export function InlineLabelCluster({ label, info, trailing, className = "", labelClassName = "" }: InlineLabelClusterProps) {
  return (
    <span className={`inline-label-cluster ${className}`.trim()}>
      <span className={`inline-label-cluster__label ${labelClassName}`.trim()}>{label}</span>
      {info ? <span className="inline-label-cluster__info">{info}</span> : null}
      {trailing ? <span className="inline-label-cluster__control">{trailing}</span> : null}
    </span>
  );
}
