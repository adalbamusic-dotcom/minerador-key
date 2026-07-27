# Backlog — Planejador
## Concluído recentemente - estratégia KGR, volume e cobertura - 2026-07-21

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas foram movidas para modules/planejador; consumidores e contratos foram mantidos.
- Pendente: validacao manual autenticada e qualquer persistencia remota fora do escopo local.
- SDD `propostas/estrategia-kgr-volume-e-cobertura.md` criado antes da alteração estrutural.
- Snapshot opcional de estratégia no ContentPlan, derivado de ArticleDNA, com principal, apoios, volume conhecido, KGR, hierarquia, slug e mapa de cobertura.
- Cockpit exibe o painel interpretativo e mantém apoio como cobertura possível, não como H2 automático.
- Fixtures de principal única, volume parcial, conflito KGR e cobertura por tópico adicionadas e aprovadas.
- Pendente: validação visual autenticada, persistência remota e correção independente do erro anterior em `lib/minerador/site-sync-adapter.ts`.

## Agora
- **Objetivo:** validar manualmente um ContentPlan v2 completo com carga real/fixture aprovada.
  - **Módulo proprietário:** Planejador
  - **Arquivos permitidos:** `docs/06-planejador/**`
  - **Arquivos proibidos:** domínio compartilhado e Redator sem SDD
  - **Dependências:** decisão editorial humana
  - **Riscos:** congelar regra incompleta
  - **Critério de aceite:** estrutura, fontes, links, CTA, imagens, metadados e evento de aprovação conferidos no navegador
  - **Testes obrigatórios:** fixtures de ContentPlan e uma revisão manual sem chamada paga
## Próximo
- Confirmar persistência remota dos sucessores e eventos de aprovação depois da migration vigente.
- Hidratar destinos de links internos e fontes aprovadas sem expor IDs técnicos como copy.
## Depois
- Executar a validação manual do cockpit com um artigo real e confirmar reload, sucessora, aprovação e transferência idempotente.
- Confirmar persistência remota dos sucessores e eventos depois da migration vigente.
- Validar no navegador a troca das cinco etapas, o resumo fixo, a próxima ação e o editor central com dados reais.
## Bloqueado
Decisões editoriais pendentes.
## Descartado
Avançar mock como plano aprovado.
## Concluídos recentes
- Auditoria documental inicial em 2026-07-20.
- SDD e implementação do ContentPlan definitivo, com testes direcionados, em 2026-07-20.
- SDD e implementação inicial do cockpit hidratado, gabarito e briefing de transferência, com 75 testes direcionados, em 2026-07-20.
- Organização guiada em cinco etapas, resumo/progresso e editor central de outline, com 77 testes e build, em 2026-07-20.
- Correção de seleção do cockpit para ContentPlans legados sem `planning`, com regressão automatizada e 78 testes focados, em 2026-07-20.

## Concluido recentemente — integridade editorial — 2026-07-20

## Concluido recentemente - contexto estrategico e identidade publicada - 2026-07-21

- SDD `propostas/contexto-estrategico-identidade-publicada.md` criado.
- Contexto da marca filtrado por marca, selecao explicita e aplicacao idempotente na copia de trabalho; origem e conflitos ficam registrados.
- `publishedIdentityRef` opcional adicionado ao ArticleDNA; PublicationRecord/OperationalPublication continua a fonte canonica e divergencias permanecem protegidas.
- Roteiro manual criado; 145 testes direcionados, typecheck e ESLint direcionado passaram.

- SDD `propostas/integridade-editorial-e-protecao-de-publicados.md` e roteiro manual adicionados.
- Hidratação keyword/Radar, separação Silo/SiloDNA e resolução de publicação implementadas sem reescrever DNAs.
- Guarda de sucessora e aprovação protege identidade publicada; estado desconhecido/conflitante não vira `Novo`.
- 83 testes focados, typecheck, ESLint direcionado e build Next.js passaram; diff-check sem erros.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/planejador; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.
