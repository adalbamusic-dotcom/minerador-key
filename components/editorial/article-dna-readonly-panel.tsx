"use client";

import {
  projectArticleDnaForArchitect,
  type ArticleDnaProjectionField,
  type ArticleDnaProjectionInput,
  type ArticleDnaProjectionSection,
} from "@/lib/arquiteto/article-dna-projection";

/**
 * Ficha somente leitura da definição do artigo.
 *
 * Mesmo padrão do perfil da KeywordDNA: resumo compacto sempre visível e ficha
 * vertical por tópicos dentro do accordion. Os controles humanos ficam na aba
 * Revisão; aqui nada é editável.
 */
const FIELD_TONE_CLASSES = {
  keyword: "text-keyword",
  "identity-new": "text-identity-new",
  "identity-published": "text-identity-published",
} as const;

function toneClass(field: ArticleDnaProjectionField) {
  if (field.unresolved) return "text-text-muted";
  return field.tone ? FIELD_TONE_CLASSES[field.tone] : "text-foreground";
}

function SummaryGrid({ fields }: { fields: ArticleDnaProjectionField[] }) {
  if (!fields.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3 xl:grid-cols-6">
      {fields.map(item => (
        <div key={item.label} className="min-w-0">
          <dt className="break-words text-text-muted">{item.label}</dt>
          <dd className={`mt-0.5 break-words font-medium ${toneClass(item)}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProfileFields({ fields }: { fields: ArticleDnaProjectionField[] }) {
  if (!fields.length) return null;
  return (
    <dl className="mt-2 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {fields.map(item => (
        <div key={item.label} className={`min-w-0 ${item.wide ? "sm:col-span-2" : ""}`}>
          <dt className="break-words text-text-muted">{item.label}</dt>
          <dd className={`mt-0.5 whitespace-pre-wrap break-words font-medium leading-6 ${toneClass(item)}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProfileSection({ section }: { section: ArticleDnaProjectionSection }) {
  return (
    <section data-section={section.id} aria-label={section.title} className="border-t border-divider pt-3">
      <p className="text-sm font-semibold uppercase tracking-wide text-foreground">{section.title}</p>
      {section.fields.length
        ? <ProfileFields fields={section.fields} />
        : <p className="mt-1 text-sm leading-6 text-text-muted">{section.emptyNote}</p>}
    </section>
  );
}

export function ArticleDnaReadonlyPanel({ definition }: { definition: ArticleDnaProjectionInput }) {
  const projection = projectArticleDnaForArchitect(definition);

  return (
    <section
      data-testid="architect-article-dna-readonly"
      aria-label="Definição do artigo · somente leitura"
      className="rounded-md border border-divider bg-surface-subtle p-3"
    >
      <p className="text-sm font-semibold text-foreground">Definição do artigo</p>
      <div className="mt-2"><SummaryGrid fields={projection.summary} /></div>

      <details className="mt-3 border-t border-divider pt-2">
        <summary className="cursor-pointer text-sm font-semibold text-text-muted hover:text-foreground">Ver definição completa do artigo</summary>
        <div className="mt-3 space-y-4">
          {projection.available
            ? <>
              <p className="text-sm leading-6 text-text-muted">Estado consolidado da definição. As decisões humanas ficam na aba Revisão.</p>
              {projection.sections.map(item => <ProfileSection key={item.id} section={item} />)}

              {projection.notes.length > 0 && (
                <section data-section="notas-article" aria-label="Notas e alertas" className="border-t border-divider pt-3">
                  <p className="text-sm font-semibold uppercase tracking-wide text-foreground">Notas e alertas</p>
                  <p className="mt-1 text-sm leading-6 text-text-muted">Informação herdada da formação; não bloqueia a aprovação do artigo.</p>
                  <ul className="mt-1 space-y-1 text-sm leading-6 text-text-muted">
                    {projection.notes.map((note, index) => <li key={`${index}-${note}`}>• {note}</li>)}
                  </ul>
                </section>
              )}

              {projection.technical.length > 0 && (
                <details data-section="proveniencia-tecnica-article" className="border-t border-divider pt-3">
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
            </>
            : <p className="text-sm leading-6 text-text-muted">{projection.emptyNote}</p>}
        </div>
      </details>
    </section>
  );
}
