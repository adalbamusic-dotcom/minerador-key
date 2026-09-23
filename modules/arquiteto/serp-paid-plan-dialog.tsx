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
  buttonClassName,
  primaryButtonClassName,
  onChoose,
  onCancel,
}: {
  title: string;
  plan: SerpPaidPlan;
  /** Só a formação e a territorial sabem validar sem as extras. */
  allowPrimaryOnly?: boolean;
  buttonClassName: string;
  primaryButtonClassName: string;
  onChoose: (choice: SerpPaidPlanChoice) => void;
  onCancel: () => void;
}) {
  const texto = describeSerpPaidPlan(plan);
  const [principal, ...outras] = serpPaidPlanOptions(plan, { allowPrimaryOnly });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div data-testid="architect-serp-paid-plan" className="flex max-h-[86vh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-lg border border-divider bg-surface-elevated p-4 shadow-xl">
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">{title}</p>
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

        <p className="text-sm leading-6 text-text-muted">
          Nada é pago antes da sua escolha. Uma lente que falta e não é paga não entra no parecer e fica declarada nele.
        </p>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className={buttonClassName} data-testid="architect-serp-paid-plan-cancel">
            Cancelar
          </button>
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
