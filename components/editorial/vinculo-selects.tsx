"use client";
import { keywordPageTypeChoices } from "@/lib/minerador/keyword-page-type";
import {
  VINCULO_MIXED_LABEL,
  VINCULO_MIXED_VALUE,
  VINCULO_POST_SELECT_OPTIONS,
  vinculoPublishedCurrentPageTypeOption,
} from "@/lib/minerador/vinculo-screen";
import { NATIVE_SELECT_THEME } from "@/lib/ui/native-select-theme";

/**
 * OS SELECTS DO VÍNCULO (pedido do dono, 2026-09-24; revisto em 2026-10-13).
 *
 * Um componente só para o card REVISÃO HUMANA e para o painel "Vínculo das
 * selecionadas" do rodapé: Posto de principal e Potencial de página, com os
 * mesmos rótulos, valores e estilos. O Assunto saiu do Vínculo (2026-10-13):
 * mora na keyword, entra por "Cadastrar Assuntos" e o painel da keyword o
 * mostra só leitura. Não há "Não mudar". Em grupo, o
 * valor `VINCULO_MIXED_VALUE` mostra "Valores diferentes" como opção
 * desabilitada: o humano vê que as selecionadas divergem e não consegue
 * escolher o marcador.
 *
 * Os selects não gravam: quem usa decide o que `onChange` faz (a Revisão
 * despacha a ação da keyword; o painel guarda a escolha até "Aplicar").
 */

const ROW_CLASS = "flex min-w-0 flex-wrap items-center justify-between gap-2";
const LABEL_CLASS = "text-sm font-medium text-text-muted";
export const VINCULO_SELECT_CLASS = `h-8 rounded-md border border-divider bg-surface-subtle px-2 text-sm font-semibold text-foreground outline-none hover:border-context-accent/60 focus:border-context-accent focus:ring-2 focus:ring-context-accent/30 disabled:cursor-not-allowed disabled:opacity-60 ${NATIVE_SELECT_THEME}`;
export const VINCULO_POST_TITLE = "Livre: a keyword pode ser primária ou secundária de qualquer página, e pode perder a vaga. Travado ao slug: ela é a primária desta URL e não se solta dela.";
export const VINCULO_PAGE_TYPE_TITLE = "Potencial: pode vir a ser este tipo. Declarado: vai ser este tipo, travado como decisão sua. Na publicada, o tipo já é declaração.";

type VinculoSelectProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Só onde um nome acessível próprio já existia; o rótulo visível nomeia o select. */
  "aria-label"?: string;
  describedBy?: string;
  className?: string;
};

function MixedOption({ value }: { value: string }) {
  return value === VINCULO_MIXED_VALUE ? <option value={VINCULO_MIXED_VALUE} disabled>{VINCULO_MIXED_LABEL}</option> : null;
}

export function VinculoPostSelect({ id, value, onChange, disabled = false, "aria-label": ariaLabel, describedBy, className = "" }: VinculoSelectProps) {
  return <div data-vinculo-select="post" className={`${ROW_CLASS} ${className}`.trim()}>
    <label className={LABEL_CLASS} htmlFor={id}>Posto de principal</label>
    <select
      id={id}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      value={value}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
      className={VINCULO_SELECT_CLASS}
      title={VINCULO_POST_TITLE}
    >
      <MixedOption value={value} />
      {VINCULO_POST_SELECT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </div>;
}

export function VinculoPageTypeSelect({
  id,
  value,
  onChange,
  disabled = false,
  "aria-label": ariaLabel,
  ariaContext,
  describedBy,
  className = "",
  published = false,
  currentValue,
}: VinculoSelectProps & {
  published?: boolean;
  /**
   * Complemento do nome acessível, depois do rótulo visível ("Potencial de
   * página na revisão humana"): o nome começa pelo que se lê na tela.
   */
  ariaContext?: string;
  /**
   * O valor que a keyword (ou o grupo) tem gravado. Na publicada sem tipo
   * determinado, ele não está entre os 4 declarados e entra como opção
   * própria. Ausente, vale `value`.
   */
  currentValue?: string | null;
}) {
  const visibleLabel = published ? "A página publicada é" : "Potencial de página";
  const current = vinculoPublishedCurrentPageTypeOption(currentValue === undefined ? value : currentValue, published);
  return <div data-vinculo-select="page_type" className={`${ROW_CLASS} ${className}`.trim()}>
    <label className={LABEL_CLASS} htmlFor={id}>{visibleLabel}</label>
    <select
      id={id}
      aria-label={ariaLabel ?? (ariaContext ? `${visibleLabel} ${ariaContext}` : undefined)}
      aria-describedby={describedBy}
      value={value}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
      className={VINCULO_SELECT_CLASS}
      title={VINCULO_PAGE_TYPE_TITLE}
    >
      <MixedOption value={value} />
      {current ? <option value={current.value}>{current.label}</option> : null}
      {published
        ? keywordPageTypeChoices({ published: true }).map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)
        : <>
          <optgroup label="Potencial">
            {keywordPageTypeChoices().filter(choice => choice.stance === "potential").map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </optgroup>
          <optgroup label="Declarado">
            {keywordPageTypeChoices().filter(choice => choice.stance === "declared").map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </optgroup>
        </>}
    </select>
  </div>;
}
