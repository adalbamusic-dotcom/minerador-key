import { DeleteConfirmation } from "@/components/lifecycle/delete-confirmation";

export function DangerApprovalDialog({ open, title, description, impact, verificationPhrase, confirmLabel, onCancel, onConfirm }: {
  open: boolean;
  title: string;
  description: string;
  impact: string[];
  verificationPhrase: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void | boolean | Promise<void | boolean>;
}) {
  return <DeleteConfirmation
    open={open}
    title={title}
    description={description}
    confirmationName={verificationPhrase}
    impact={impact.map((label, index) => ({ key: `danger-impact-${index}`, label }))}
    confirmLabel={confirmLabel}
    eyebrow="Aprovação de ação"
    notice={null}
    onCancel={onCancel}
    onConfirm={onConfirm}
  />;
}
