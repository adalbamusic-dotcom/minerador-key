# Status global editorial — implementação autorizada em 2026-09-08

Proprietário: workflow global. Autorização: diretriz explícita do usuário nesta tarefa.
Reutiliza editorial_workflow_items (architect/article) e editorial_decision_events, sem tabela ou migration nova. Estados de fase permanecem nos resolvedores existentes; aprovação continua nos eventos dos artefatos.

Vocabulário global: RASCUNHO, EM_PROCESSO, DESCARTADO, PRONTO_PARA_RADAR, ENVIADO_AO_RADAR. Ausência de linha é RASCUNHO; estados operacionais legados são apresentados como EM_PROCESSO, sem regravar artefatos.
Somente Links oferece a transição explícita para PRONTO. Servidor valida versões aprovadas e relações do grafo, e o envio exige a marca remota sobre a mesma base. ENVIADO exige readback da linha Radar com a identidade/versão/hash esperados. Falhas de escrita ou histórico não produzem confirmação.

API de status é estendida aditivamente para os três estados organizacionais, preservando claims de prontidão. Resposta confirma somente operações com histórico e readback; lotes têm recusas por artigo. Consumidores: Arquiteto, endpoint editorial/workflow, contexto editorial compartilhado e importação no Radar. Não altera formação, SERP, keywords ou geração de links.
Compatibilidade: resolvedores de fase mantidos. Rollback: reverter arquivos deste corte; registros globais continuam na tabela existente. Sem SQL remoto de alteração ou homologação manual. Testes: estados, lote, vínculos incompatíveis, envio sem prontidão, readback divergente, falha de evento e isolamento de marca.
