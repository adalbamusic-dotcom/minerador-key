"use client";

import type { KeywordContextualPresentation } from "@/lib/minerador/keyword-contextual-presentation";
import {
  projectKeywordDnaForArchitect,
  type KeywordDnaProjectionField,
  type KeywordDnaProjectionInput,
  type KeywordDnaProjectionSection,
} from "@/lib/arquiteto/keyword-dna-projection";

/**
 * Projeção somente leitura da KeywordDNA recebida do Minerador.
 *
 * Fechado: resumo horizontal denso. Aberto: ficha vertical por tópicos com
 * todo o DNA recebido. Nenhum controle de edição existe aqui — o Minerador
 * constrói, o Arquiteto consome.
 */
const FIELD_TONE_CLASSES = {
  keyword: "text-keyword",
  "identity-new": "text-identity-new",
  "identity-published": "text-identity-published",
} as const;

function fieldToneClass(field: KeywordDnaProjectionField, unresolvedClass = "text-text-muted") {
  if (field.unresolved) return unresolvedClass;
  return field.tone ? FIELD_TONE_CLASSES[field.tone] : "text-foreground";
}

function SummaryGrid({ fields }: { fields: KeywordDnaProjectionField[] }) {
  if (!fields.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 xl:grid-cols-6">
      {fields.map(item => (
        <div key={item.label} className="min-w-0">
          <dt className="break-words text-text-muted">{item.label}</dt>
          <dd className={`mt-0.5 break-words font-medium ${fieldToneClass(item)}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Ficha vertical: pares label/valor empilhados, no máximo duas colunas. */
function ProfileFields({ fields }: { fields: KeywordDnaProjectionField[] }) {
  if (!fields.length) return null;
  return (
    <dl className="mt-2 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {fields.map(item => (
        <div key={item.label} className={`min-w-0 ${item.wide ? "sm:col-span-2" : ""}`}>
          <dt className="break-words text-text-muted">{item.label}</dt>
          <dd className={`mt-0.5 whitespace-pre-wrap break-words font-medium leading-6 ${fieldToneClass(item)}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProfileSection({ section }: { section: KeywordDnaProjectionSection }) {
  return (
    <section data-section={section.id} aria-label={section.title} className="border-t border-divider pt-3">
      <p className="text-sm font-semibold uppercase tracking-wide text-foreground">{section.title}</p>
      {section.fields.length
        ? <ProfileFields fields={section.fields} />
        : <p className="mt-1 text-sm leading-6 text-text-muted">{section.emptyNote}</p>}
    </section>
  );
}

export function KeywordDnaReadonlyPanel({
  keyword,
  role,
  presentation,
  headerExtra,
}: {
  keyword: KeywordDnaProjectionInput;
  role?: string;
  presentation?: KeywordContextualPresentation | null;
  headerExtra?: React.ReactNode;
}) {
  const projection = projectKeywordDnaForArchitect(keyword, presentation);

  return (
    <section
      data-testid="architect-keyword-dna-readonly"
      aria-label={`Perfil somente leitura de ${projection.keyword || "keyword"}`}
      className="rounded-md border border-divider bg-surface-subtle p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {role && <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">{role}</p>}
          <p className="mt-0.5 break-words text-base font-semibold text-keyword">{projection.keyword || "—"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md border px-2 py-1 text-sm font-medium ${projection.upstreamApproved ? "border-success/40 bg-success-soft text-success" : "border-divider text-text-muted"}`}>Minerador · {projection.upstreamStatusLabel}</span>
          {headerExtra}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <SummaryGrid fields={projection.summaryPrimary} />
        {projection.summarySecondary.length > 0 && <SummaryGrid fields={projection.summarySecondary} />}
      </div>

      <details className="mt-3 border-t border-divider pt-2">
        <summary className="cursor-pointer text-sm font-semibold text-text-muted hover:text-foreground">Ver perfil completo da keyword</summary>
        <div className="mt-3 space-y-4">
          <p className="text-sm leading-6 text-text-muted">Fatos recebidos do Minerador nesta versão. A edição pertence ao Minerador.</p>

          {projection.indeterminateDimensions.length > 0 && (
            <section data-section="dimensoes-indeterminadas" aria-label="Dimensões indeterminadas" className="rounded-md border border-divider bg-surface p-2">
              <p className="text-sm leading-6 text-text-muted">Algumas dimensões permanecem indeterminadas pela evidência disponível: {projection.indeterminateDimensions.join(" · ")}. Isso não é erro e não bloqueia o trabalho do Arquiteto.</p>
            </section>
          )}

          {projection.sections.map(item => <ProfileSection key={item.id} section={item} />)}

          <section data-section="apresentacao-contextual" aria-label="Apresentação contextual da marca" className="border-t border-divider pt-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-foreground">Apresentação contextual da marca</p>
            {projection.presentation.available ? (
              <>
                <p className="mt-1 text-sm text-text-muted">
                  {projection.presentation.versionNumber !== null ? `Apresentação contextual · v${projection.presentation.versionNumber}` : "Apresentação contextual recebida"}
                  {projection.presentation.brandVoiceApplied ? " · Voz da Marca aplicada" : ""}
                </p>
                {projection.presentation.text
                  ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{projection.presentation.text}</p>
                  : <p className="mt-2 text-sm leading-6 text-text-muted">{projection.presentation.note}</p>}
                <ProfileFields fields={projection.presentation.provenance} />
              </>
            ) : (
              <p className="mt-1 text-sm leading-6 text-text-muted">{projection.presentation.note}</p>
            )}
          </section>

          {projection.technical.length > 0 && (
            <details data-section="proveniencia-tecnica" className="border-t border-divider pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-text-muted hover:text-foreground">Proveniência técnica</summary>
              <div className="mt-2 space-y-2">
                {projection.technical.map(item => (
                  <div key={item.label} className="min-w-0">
                    <p className="break-words text-sm text-text-muted">{item.label}</p>
                    <pre className="mt-0.5 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded border border-divider bg-surface p-2 font-mono text-xs text-foreground">{item.value}</pre>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </details>
    </section>
  );
}
