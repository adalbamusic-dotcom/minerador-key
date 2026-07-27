# Estado atual — Publicações
- **Última auditoria:** 2026-07-20.
- **Funcionando:** importação idempotente de aprovados, biblioteca, fila explícita, exportação local real em Markdown/JSON/CSV, registro manual de destino/URL, histórico operacional, solicitação de atualização e reedição. **Verificado no código e confirmado por testes direcionados.**
- **Protegido:** item publicado permanece em `published` durante reedição; slug, vínculo de documento/plano, unidade e URL final são protegidos server-side. A sincronização de autosave também não rebaixa um publicado. **Verificado no código.**
- **Artigos e SiloPages:** o `unitType` é preservado no registro, planilha e exportações. **Confirmado por teste.**
- **Parcial:** a importação do primeiro ContentDocument real e a jornada completa no navegador ainda não foram validadas manualmente.
- **Local:** fallback de workspace por marca e download de arquivos no navegador.
- **Persistido:** `publication_records` e `PublicationRepository` existentes recebem metadados aditivos no payload; remoto depende da migration operacional aplicada e ainda não foi verificado manualmente.
- **Simulado:** `PublicationRecordSchema` do bundle mock continua apenas demonstrativo e não é fonte de persistência.
- **Bloqueado:** publicação real em CMS, ingestão do arquivo exportado pelo CMS e validação manual da URL externa.
- **Regressões/bugs:** nenhum confirmado nos testes executados nesta tarefa.
- **Arquivos centrais:** `components/publicacoes/publications-workspace.tsx`, `lib/publicacoes/domain.ts`, `lib/publicacoes/export.ts`, `app/api/publicacoes/route.ts`, `lib/server/editorial-repositories.ts`.
- **Testes:** `tests/publicacoes-domain.test.mts`, `test:operational`, `test:editorial`, `test:redator`, TypeScript e lint direcionados.
- **Última validação manual:** ainda não verificada.
- **Diferença spec/implementação:** preparação, exportação e registro manual estão implementados; CMS externo, persistência remota confirmada e publicação pública continuam fora do escopo.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/publicacoes; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Adicionado wrapper canônico `/{brandRef}/publicacoes`; publicação manual e identidade publicada permanecem inalteradas.
