# Estado atual — Redator
- **Última auditoria:** 2026-07-20.
- **Funcionando:** Tiptap integrado, abertura direta por query, edição humana, blocos estruturados, proveniência por `blockId`, autosave com lock otimista e recovery local por marca/documento. **Verificado no código.**
- **Funcionando:** contratos/prompts do Redator, escrita assistida por seção, melhoria de trecho e análise determinística do Guardião possuem rotas server-side e aplicação explícita na cópia de trabalho. **Confirmado por TypeScript, lint e testes direcionados.**
- **Funcionando:** aprovação no cliente e no endpoint server-side rejeita documento com achados `blocked`; IA continua proposta e nunca aprovação. **Verificado no código.**
- **Parcial:** salvamento, criação de snapshots, reload e sincronização do registro de Publicações existem nos repositórios, mas não houve validação manual ponta a ponta com persistência remota.
- **Parcial:** escrita e melhoria reais dependem de provedor configurado; os testes usam fixtures e não chamam IA externa.
- **Simulado:** há criação mock de plano/documento no provider, distinguida por origem.
- **Local:** recovery de workflow e recovery de documento usam navegador; `localStorage` é fallback e não fonte única.
- **Persistido:** tabelas/repositórios de documento, versões, estado e comentários previstos na migration `0002`; remoto não verificado.
- **Bloqueado:** confirmação manual de persistência remota, conflito em navegador, aprovação e importação idempotente para Publicações.
- **Regressões/bugs:** nenhum confirmado nos testes direcionados desta tarefa. A validação manual continua pendente.
- **Arquivos centrais:** `components/editorial/professional-writer.tsx`, `lib/redator/contracts.ts`, `lib/redator/prompts.ts`, `lib/redator/guardian.ts`, `lib/server/editorial-repositories.ts`, `app/api/editorial/documents/route.ts`.
- **Testes:** `tests/redator-domain.test.mts`, `tests/editorial-pipeline.test.mts`, `tests/operational-flow.test.mts`, `tests/arquiteto-domain.test.mts`; TypeScript e lint direcionados passaram.
- **Última validação manual:** **Relatado pelo usuário:** primeiro documento abriu diretamente; Guardião, rotas de IA e transferência ainda não foram conferidos no navegador.
- **Diferença spec/implementação:** a estação editorial e seus gates locais/server-side estão implementados; persistência remota, provedor real e destino externo ainda não são evidência de conclusão.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/redator; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Adicionado wrapper canônico `/{brandRef}/redator`; autosave e recovery local não foram alterados.
