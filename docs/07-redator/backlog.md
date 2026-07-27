# Backlog — Redator
## Agora
- **Objetivo:** validar manualmente a jornada do Redator com fixture e sem publicação externa.
  - **Módulo proprietário:** Redator
  - **Arquivos permitidos:** testes, `docs/07-redator/**` e validação manual do fluxo existente
  - **Arquivos proibidos:** migrations, CMS externo e publicação final
  - **Dependências:** sessão, migration vigente e fixture de ContentPlan aprovado
  - **Riscos:** confundir fallback local com persistência remota ou tratar proposta de IA como aprovação
  - **Critério de aceite:** abrir, editar por seção, analisar Guardião, salvar, recarregar, aprovar e importar de forma idempotente, sem perder conteúdo
  - **Testes obrigatórios:** `test:redator`, `test:editorial`, `test:operational`
## Próximo
- Exibir relatório do Guardião persistido junto a uma versão, quando houver decisão de persistência aprovada.
- Adicionar comentários server-side completos ao editor, aproveitando a tabela já existente.
## Depois
Nenhuma tarefa aprovada.
## Bloqueado
Validação integrada de persistência remota, provedor real e destino externo.
## Descartado
Tratar criação mock como documento aprovado.
## Concluídos recentes
- Auditoria documental inicial em 2026-07-20.
- SDD `redator-guardiao-e-publicacoes.md`, contratos de prompt, escrita por seção, melhoria de trecho, Guardião determinístico, gate server-side e testes direcionados em 2026-07-20.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/redator; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.
