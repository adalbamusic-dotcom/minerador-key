"use client";

import React from "react";
import {
  describeSerpPaidPlan,
  serpPaidPlanOptions,
  type SerpPaidPlan,
  type SerpPaidPlanChoice,
} from "@/lib/arquiteto/serp-lens-plan";

/**
 * O PLANO DE CHAMADAS PAGAS, ANTES DE PAGAR (adendo das 4 lentes, A6).
 *
 * "Validar SERP", "Validar SERP dos silos" e "Consultar nas 4 lentes" pagavam
 * no clique. Agora a rota devolve o plano — quantas consultas faltam em cada
 * lente e quanto isso custa — e esta prévia é a única porta para o pagamento:
 * nada é pago até a pessoa escolher uma saída. Cancelar não paga nada.
 *
 * O número de cada botão é o que vai como autorização; a rota recusa pagar
 * além dele. Lentes antigas (mais de 7 dias entre as lentes da mesma
 * consulta) só são recoletadas se a pessoa escolher isso aqui.
 */
export function SerpPaidPlanDialog({
  title,
  plan,
  allowPrimaryOnly = true,
  allowCacheOnly = false,
  buttonClassName,
  primaryButtonClassName,
  onChoose,
  onCancel,
}: {
  title: string;
  plan: SerpPaidPlan;
  /** Só a formação e a territorial sabem validar sem as extras. */
  allowPrimaryOnly?: boolean;
  /**
   * Formação (D6): cancelar o PAGAMENTO não cancela a análise. O botão de
   * cancelar vira "Cancelar pagamento" e segue só com o cache, sem custo.
   */
  allowCacheOnly?: boolean;
  buttonClassName: string;
  primaryButtonClassName: string;
  onChoose: (choice: SerpPaidPlanChoice) => void;
  onCancel: () => void;
}) {
  const texto = describeSerpPaidPlan(plan);
  const [principal, ...outras] = serpPaidPlanOptions(plan, { allowPrimaryOnly });
  const somenteCache: SerpPaidPlanChoice = { authorizedPaidQueries: 0, payMissingExtraLenses: false, recollectStaleLenses: false, cacheOnly: true };
  /*
   * D6 — com o cache ilegível, "analisar só com o cache" não tem o que ler:
   * cada bloco voltaria 503. A saída gratuita some; ficam coletar com o custo
   * máximo, tentar ler o cache de novo ou cancelar sem pagar.
   */
  const ofereceSomenteCache = allowCacheOnly && !plan.cacheUnavailable;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div data-testid="architect-serp-paid-plan" className="flex max-h-[86vh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-lg border border-divider bg-surface-elevated p-4 shadow-xl">
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">{title}</p>
          {texto.cacheWarning && <p className="mt-1 text-sm leading-6 text-warning" data-testid="architect-serp-paid-plan-cache-warning">{texto.cacheWarning}</p>}
          <p className="mt-1 text-sm leading-6 text-foreground" data-testid="architect-serp-paid-plan-headline">{texto.headline}</p>
          {texto.cost && <p className="text-sm leading-6 text-text-muted">{texto.cost}</p>}
          {texto.conditional && <p className="text-sm leading-6 text-text-muted">{texto.conditional}</p>}
          {texto.dates && <p className="text-sm leading-6 text-warning" data-testid="architect-serp-paid-plan-dates">{texto.dates}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded border border-divider">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface text-text-muted">
              <tr>
                <th className="px-2 py-1 font-semibold">Lente</th>
                <th className="px-2 py-1 font-semibold">No cache</th>
                <th className="px-2 py-1 font-semibold">A pagar</th>
                <th className="px-2 py-1 font-semibold">Não pagas</th>
                <th className="px-2 py-1 font-semibold">Antigas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/70">
              {plan.perLens.map(linha => (
                <tr key={linha.lens}>
                  <td className="px-2 py-1 text-foreground">{linha.lens}</td>
                  <td className="px-2 py-1 text-foreground/85">{linha.hits}</td>
                  <td className="px-2 py-1 text-foreground/85">
                    {linha.misses}
                    {linha.conditionalMisses > 0 ? ` (${linha.conditionalMisses} condicionais)` : ""}
                  </td>
                  <td className="px-2 py-1 text-text-muted">{linha.unpaidMisses}</td>
                  <td className={`px-2 py-1 ${linha.staleByDate > 0 ? "text-warning" : "text-text-muted"}`}>{linha.staleByDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {plan.missingDetails?.length && !plan.cacheUnavailable ? (
          <div className="min-h-0 max-h-36 overflow-auto rounded border border-divider bg-surface p-2 text-sm" data-testid="architect-serp-plan-missing-details">
            <p className="font-semibold text-foreground">Lentes que faltam para esta formação</p>
            <ul className="mt-1 space-y-1">
              {plan.missingDetails.map((item, index) => (
                <li key={`${item.article}:${item.keyword}:${item.lens}:${index}`} className="text-text-muted">
                  <span className="text-keyword">{item.keyword}</span> · {item.lens} · {item.reason}
                  {item.article !== item.keyword ? ` · artigo: ${item.article}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-sm leading-6 text-text-muted">
          Nada é pago antes da sua escolha. “No cache” conta entradas pela metadata; o corpo é conferido ao analisar. Uma lente ausente fica declarada no parecer.
          {plan.perLens.length > 1 ? " As quatro lentes valem também para artigo de uma keyword só: o parecer antigo marcado “sem par” fica incompleto, faltando lentes, até as extras serem coletadas, e bloqueia a conclusão daquele artigo." : ""}
          {ofereceSomenteCache ? " Cancelar o pagamento não cancela a análise: os artigos com evidência completa no cache recebem parecer, sem custo, e os que dependem de coleta ficam pendentes com o motivo." : ""}
          {allowCacheOnly && plan.cacheUnavailable ? " Com o cache ilegível não dá para analisar sem custo: colete com o custo máximo, tente ler o cache de novo ou cancele sem pagar nada." : ""}
        </p>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={ofereceSomenteCache ? () => onChoose(somenteCache) : onCancel} className={buttonClassName} data-testid="architect-serp-paid-plan-cancel">
            {ofereceSomenteCache ? "Cancelar pagamento · analisar com o cache (US$ 0)" : "Cancelar"}
          </button>
          {plan.cacheUnavailable ? (
            <button type="button" onClick={() => onChoose({ ...somenteCache, cacheOnly: false, retryCacheRead: true })} className={buttonClassName} data-testid="architect-serp-paid-plan-retry-cache">
              Tentar ler o cache de novo
            </button>
          ) : null}
          {outras.map(opcao => (
            <button key={opcao.id} type="button" onClick={() => onChoose(opcao.choice)} className={buttonClassName} data-testid={`architect-serp-paid-plan-${opcao.id}`}>
              {opcao.label}
            </button>
          ))}
          <button type="button" onClick={() => onChoose(principal.choice)} className={primaryButtonClassName} data-testid="architect-serp-paid-plan-all">
            {principal.label}
          </button>
        </div>
      </div>
    </div>
  );
}
