# Backlog — Admin
## Agora
- **Objetivo:** validar manualmente autorização e proteção de exclusão de marcas publicadas.
  - **Módulo proprietário:** Admin
  - **Arquivos permitidos:** testes e documentação Admin
  - **Arquivos proibidos:** migrations e outros módulos
  - **Dependências:** ambiente de teste autorizado
  - **Riscos:** exclusão de dados
  - **Critério de aceite:** cenários autorizados e bloqueados registrados
  - **Testes obrigatórios:** `test:authz` e validação manual controlada
## Próximo
- **Objetivo:** detalhar critérios da visão administrativa com produto.
  - **Módulo proprietário:** Admin
  - **Arquivos permitidos:** `docs/01-admin/**`
  - **Arquivos proibidos:** código funcional
  - **Dependências:** decisão de produto
  - **Riscos:** escopo indevido
  - **Critério de aceite:** spec aprovada
  - **Testes obrigatórios:** revisão documental
## Depois
Nenhuma tarefa aprovada.
## Bloqueado
Validação real de persistência depende de ambiente autorizado.
## Descartado
Reescrita administrativa nesta sprint.
## Concluídos recentes
Auditoria documental inicial em 2026-07-20.
## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas foram movidas para modules/admin; consumidores e contratos foram mantidos.
- Pendente: validacao manual autenticada e qualquer persistencia remota fora do escopo local.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/admin; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.

## Shell global e build de selecionar-marca — 2026-07-23
- Concluído localmente: ProductShell global, atalhos tenantizados, troca de marca sem sair de Admin e separação Server/Client em `/selecionar-marca`.
- Concluído localmente: ignores explícitos para artefatos gerados sem ocultar `modules/**`.
- Pendente: build completo após o encerramento autorizado do servidor Next; lint global ainda registra dívida preexistente de 82 erros e 31 avisos em módulos e rotas API.

## Concluído — owner Auth selecionável — 2026-07-26
- Busca server-side por nome/e-mail com paginação, normalização e status de confirmação.
- Seleção real separada do texto digitado, bloqueio de criação sem `selectedOwner.id` e revalidação server-side por `auth.admin.getUserById`.
- Testes focados e validações locais executados; validação autenticada manual e persistência remota continuam pendentes.
