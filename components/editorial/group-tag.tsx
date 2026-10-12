import { EDITORIAL_GROUP_COLOR_CLASSES, EDITORIAL_GROUP_COLOR_LABELS, type EditorialGroupColor } from "@/lib/editorial/editorial-groups";

/**
 * Bolinha de cor do grupo (sistema-visual §5.0.2). Decorativa: o nome do grupo
 * sempre vem escrito ao lado.
 */
export function EditorialGroupDot({ color, className = "" }: { color: EditorialGroupColor; className?: string }) {
  return <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${EDITORIAL_GROUP_COLOR_CLASSES[color].dot} ${className}`} />;
}

/**
 * Etiqueta do grupo na linha: bolinha + NOME, fundo suave do token e texto em
 * `foreground` (≥ 14 px). Nunca só a cor; nunca badge de status.
 */
export function EditorialGroupTag({ name, color, className = "" }: { name: string; color: EditorialGroupColor; className?: string }) {
  return (
    <span
      data-editorial-group-tag
      title={`Grupo: ${name} (${EDITORIAL_GROUP_COLOR_LABELS[color]})`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded border px-1.5 py-0.5 text-sm font-medium leading-tight text-foreground ${EDITORIAL_GROUP_COLOR_CLASSES[color].chip} ${className}`}
    >
      <EditorialGroupDot color={color} />
      <span className="min-w-0 break-words">{name}</span>
    </span>
  );
}
