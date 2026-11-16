import { linkMeshPreviewCanConfirm } from "@/lib/arquiteto/silo-link-mesh";

/** O botão existente da prévia: a confirmação pertence à seleção mostrada. */
export function LinksMeshPreviewConfirm(props: {
  preview: { fingerprint: string; silos: readonly { preview: unknown; blocker: string | null; estimate?: boolean }[] };
  currentFingerprint: string;
  canProcess: boolean;
  label: string;
  className: string;
  onConfirm: () => void;
}) {
  const ready = props.canProcess && linkMeshPreviewCanConfirm({ ...props.preview, currentFingerprint: props.currentFingerprint });
  return <button type="button" data-testid="architect-links-mesh-preview-confirm" onClick={props.onConfirm} disabled={!ready} className={props.className}>{props.label}</button>;
}
