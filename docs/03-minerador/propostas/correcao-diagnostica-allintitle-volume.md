# Proposta tÃ©cnica â€” diagnÃ³stico de allintitle e volume zero

**MÃ³dulo proprietÃ¡rio:** Minerador
**Escopo:** extensÃ£o Chrome do Minerador e interface localizada de qualificaÃ§Ã£o
**Status:** implementada localmente nesta tarefa

## DiagnÃ³stico

O handshake confirma somente a ponte entre a aba do Minerador e a extensÃ£o. O controlador atual reduz falhas de navegaÃ§Ã£o, injeÃ§Ã£o, reader e retorno a `measurement_error`, portanto nÃ£o permite localizar a primeira etapa quebrada nem apresentar orientaÃ§Ã£o Ãºtil ao usuÃ¡rio.

## MudanÃ§a aditiva

- Manter o contrato de resultado e acrescentar eventos transitÃ³rios versionados de etapa, sem persistÃªncia remota.
- Cada evento inclui `batchId`, `keywordId`, `brandId`, etapa, data, versÃ£o do protocolo e, apenas para diagnÃ³stico tÃ©cnico, `tabId`.
- O controller passa a registrar/criar eventos para abrir/reutilizar aba, iniciar/finalizar navegaÃ§Ã£o, injetar reader, ler pÃ¡gina e entregar resultado. Falha preserva o resultado anterior e carrega etapa/cÃ³digo.
- O Minerador mantÃ©m um aviso operacional fechÃ¡vel: erros de allintitle/extensÃ£o/volume ficam visÃ­veis por no mÃ­nimo 12 segundos, podem ser copiados e mostram etapa/cÃ³digo sem stack trace.
- O normalizador do volume continua aceitando zero somente apÃ³s match exato e campo `avg_monthly_searches` numÃ©rico explÃ­cito; valores ausentes nÃ£o produzem patch.

## Compatibilidade e rollback

NÃ£o hÃ¡ schema, migration, API externa, mudanÃ§a de fÃ³rmula KGR nem contrato de outro mÃ³dulo. Eventos desconhecidos sÃ£o ignorados. Rollback: remover os eventos diagnÃ³sticos e restaurar o aviso compacto; nÃ£o hÃ¡ dados novos a reconciliar.

## ValidaÃ§Ã£o

Fixtures e mocks locais devem cobrir URL, reader, timeout, query divergente, consentimento/CAPTCHA/bloqueio, zero explÃ­cito e volume invÃ¡lido. Nenhuma chamada ao Google ou RapidAPI Ã© autorizada.
