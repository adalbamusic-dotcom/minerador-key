# ADR-010 — Cockpit hidratado do Planejador

## Status

Aceita para a sprint de implementação local de 2026-07-20.

## Contexto

O ContentPlan v2 já era o contrato definitivo, mas a superfície do Planejador mostrava contagens e referências técnicas sem uma composição editorial inspectável. Havia dados suficientes no workspace local para resolver ArticleDNA, keywords, silos, Radar, versões e documento, sem reconstruir módulos vizinhos.

## Decisão

O Planejador terá uma camada própria e pura de hidratação (`lib/planejador/hydration.ts`) e uma rota dedicada `/planejador/[contentPlanId]`. Rótulos editoriais virão de dados hidratados; referências ausentes mostrarão `Referência não hidratada` e diagnóstico técnico separado. A grade principal continua operacional e passa a exibir resumo hidratado.

O gabarito e os itens de planejamento são extensões opcionais do ContentPlan v2. O `ContentDocument` recebe um `writingBrief` opcional com a versão e a estrutura do plano, sem alterar o editor Tiptap nem escrever o artigo.

## Consequências

- Radar observado, recomendação do Planejador e decisão humana ficam separáveis na inspeção.
- Ausência de Radar, fonte ou keyword não é preenchida por inferência.
- Save sem mudança material preserva a versão; mudança material cria sucessora.
- A transferência ao Redator preserva proveniência e pode ser repetida sem criar outra unidade.
- Persistência remota, migration, coleta paga e publicação continuam fora desta sprint.

## Rollback

Remover os arquivos novos do Planejador e os campos aditivos do contrato/documento, revertendo somente seus hunks. Não usar reset, checkout destrutivo ou limpeza de recovery.
