# Backlog — Publicações
## Agora
- **Objetivo:** validar manualmente com fixture a jornada completa: importação, fila, download, URL manual, atualização e reedição.
  - **Módulo proprietário:** Publicações
  - **Arquivos permitidos:** testes e `docs/08-publicacoes/**`
  - **Arquivos proibidos:** CMS externo, migrations e Redator sem SDD
  - **Dependências:** fixture de documento aprovado
  - **Riscos:** promoção indevida ou alteração estrutural
  - **Critério de aceite:** somente aprovado entra; arquivo é baixado; URL é informada pelo usuário; atualização não altera campos protegidos
  - **Testes obrigatórios:** `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/publicacoes-domain.test.mts`, `test:operational`, `test:editorial`, `test:redator`
## Próximo
- Confirmar manualmente a migration operacional, persistência/reload do payload aditivo e conflito de `lock_version`.
## Depois
- Definir SDD própria para integração externa/CMS quando houver destino e credenciais autorizados.
## Bloqueado
Primeiro documento final e destino de publicação.
## Descartado
Publicar automaticamente na ausência de aprovação humana.
## Concluídos recentes
- Auditoria documental inicial em 2026-07-20.
- SDD e implementação de fila, exportações, publicação manual, URL protegida, atualização e histórico em 2026-07-20.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/publicacoes; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.
