# SDD — Publicações: exportação, publicação manual e atualizações

- **Status:** autorizado pelo pedido de continuidade; implementação nesta tarefa
- **Data:** 2026-07-20
- **Módulo proprietário:** Publicações
- **Escopo:** receber, organizar, exportar e registrar publicações; CMS externo continua manual
- **Mudança remota:** nenhuma migration, schema remoto ou escrita externa

## 1. Estado encontrado na auditoria

### Já existe

- `app/(brand)/[brandRef]/publicacoes/page.tsx` apenas delega para `PublicationsPage`.
- `modules/publicacoes` possui a superfície funcional atual da planilha; `components/product/operational-pages.tsx` é referência histórica da extração da planilha baseada em `OperationalDataGrid`, abas Biblioteca/Fila/Publicados/Atualizações e seletor de aprovados.
- `OperationalPublicationSchema` e `PublicationWorkflowStateSchema` já representam o item operacional, incluindo `ready_to_export`, `queued`, `exported`, `published` e `update_due`.
- `createPublicationDraft` cria um registro local vinculado a Planner, ContentPlan, ContentDocument, ArticleDNA, silo e marca.
- `PublicationRepository` persiste em `publication_records`, com chave idempotente `(marca_id, article_id)`, `lock_version` e sincronização de status do documento.
- O comando `import_publications` só aceita publicação em estado `approved` e já tem validação de marca, permissão e concorrência.
- `PublicationRecordSchema` existe apenas no bundle mock de `lib/editorial/operational-contracts.ts`; não é a representação persistida usada pela tela.

### Ainda não existe

- exportação de arquivo real a partir do documento;
- fila operacional acionável após a importação;
- destino editável com distinção entre destino e URL final;
- registro de publicação manual com URL final validada;
- atualização/reedição com histórico próprio;
- histórico operacional persistido no registro;
- diferenciação visual/operacional completa entre artigo e `silo_page`.

### Evidência e baseline

- Os testes atuais `test:operational`, `test:editorial` e `test:redator` passaram antes da alteração.
- O worktree já possui alterações locais extensas e não relacionadas a esta tarefa. Nenhum reset, limpeza ou rollback global será usado.
- Hashes SHA-256 pré-alteração dos arquivos centrais foram registrados no relatório da execução:
  - `components/product/operational-pages.tsx` (baseline histórico): `E339B13D63F506D720020FD88F1738E6D3D07C7571C3AECAF53CD77BC5C54447`
  - `components/editorial-pipeline-context.tsx`: `59DB4D4D3B4151F6D576FBFA65973B8C436AFB97E0DF2D41E3368BF7B9100D69`
  - `lib/editorial/operational-flow.ts`: `BB2CF8AD769CC2921325F12E6EAEC4A95ED04A8A32E7D46A2A1610072E434064`
  - `lib/editorial/persistence-contracts.ts`: `088FCED93638722B6ABDBEE4EC159D87EFF8381A38285475BB724B69E1711A04`
  - `lib/server/editorial-repositories.ts`: `59CD9ACF252D2C1F16D46747E6BA4FF7963F8DBA8009D234CB34EE0EE42E099C`
  - `tests/operational-flow.test.mts`: `2C24F2468C5541091720FB44F4097ED58874164E86AA96490991C3B3F7EE28D2`

## 2. Contrato e modelo de dados

`OperationalPublication` continua sendo o contrato de fila compartilhado e passa a carregar, de forma aditiva e retrocompatível, os metadados exclusivos de Publicações:

- `destinationUrl`: URL final informada manualmente, inicialmente `null`;
- `publishedAt`: momento do registro manual da publicação;
- `publishedDocumentHash`: hash do documento exportado/registrado quando disponível;
- `lastExportedAt`, `lastExportFileName`, `lastExportFormat` e `lastExportDocumentHash`;
- `updateRequestedAt` e `updateRequested`: pedido de atualização sem retirar o item do estado `published`;
- `history`: eventos operacionais append-only dentro do `payload`.

O estado `published` permanece quando uma atualização é solicitada. Isso preserva o published guard já usado pelo Redator para slug, canonical e keyword principal; a aba Atualizações deriva de `updateRequested`, sem transformar um publicado em um rascunho desprotegido. O estado `update_due` permanece aceito pelo contrato para compatibilidade, mas não será usado para representar uma simples solicitação de reedição.

Os campos estruturais não são editáveis por Publicações e o servidor rejeita alterações de marca, artigo, slug, vínculo de documento/plano, unidade editorial e URL final já registrada depois de publicado.

## 3. Fluxo proposto

`aprovado → pronto para exportar → fila → exportado → publicado`

1. A importação existente recebe somente ContentDocument aprovado e muda o registro para `ready_to_export`.
2. Publicações coloca explicitamente o item na fila.
3. A UI gera download real local em Markdown e manifesto JSON/CSV sem chamar CMS ou IA.
4. Após o download confirmado pelo navegador, o registro passa a `exported` e guarda arquivo, formato, hash e evento.
5. O usuário informa destino e URL final reais; só então a ação manual registra `published`.
6. Um publicado pode receber `request_update` e `reedit`; ambos preservam os campos estruturais e a URL publicada, registram histórico e deixam a decisão humana explícita.
7. Nova exportação/publicação pode limpar o pedido de atualização somente mediante ação explícita.

Artigos e `silo_page` usam o mesmo fluxo, mas exibem o tipo da unidade e não compartilham identificadores. Não há geração de URL, alteração automática de slug/canonical/keyword, publicação automática ou envio externo.

## 4. Exportações

- **Pacote Markdown:** conteúdo e front matter operacional para publicação manual.
- **Manifesto JSON:** registro completo e referências, sem segredos.
- **Planilha CSV:** linhas da seleção atual com status, unidade, slug, destino, URL, exportação e última atualização.

O download é criado no navegador com `Blob` e `URL.createObjectURL`; `URL.revokeObjectURL` ocorre após o clique. A persistência registra a exportação somente depois da criação do arquivo. Ausência de documento impede o pacote de conteúdo e não altera estado.

## 5. Destino, URL e publicação manual

- `destination` continua sendo o rótulo do destino escolhido pelo usuário.
- `destinationUrl` é a URL final publicada e precisa ser uma URL absoluta válida.
- A aplicação não testa nem inventa a URL e não faz request ao CMS.
- `publishedAt` e `publishedDocumentHash` permitem confirmar qual versão foi registrada.
- URL final registrada é protegida; correção exige fluxo humano posterior fora desta tarefa.

## 6. Persistência e API

- O payload JSONB existente de `publication_records` recebe somente campos aditivos.
- Será criada a rota proprietária `app/api/publicacoes/route.ts` para ações de fila, exportação registrada, publicação manual e atualização.
- A rota revalida sessão, marca, permissão `publicacoes`, estado permitido e `lock_version` no servidor.
- `PublicationRepository` recebe apenas métodos aditivos de leitura pontual e atualização otimista do registro existente.
- Quando a persistência estiver indisponível, a UI mantém o resultado apenas no fallback local e o sinaliza; não afirma salvamento remoto.
- O workspace existente continua carregando `publication_records`; registros antigos recebem defaults pelo schema.

## 7. Arquivos afetados

### Exclusivos de Publicações

- `app/(brand)/[brandRef]/publicacoes/page.tsx`
- `app/api/publicacoes/route.ts`
- `components/publicacoes/publications-workspace.tsx`
- `lib/publicacoes/contracts.ts`
- `lib/publicacoes/domain.ts`
- `lib/publicacoes/export.ts`
- testes direcionados de Publicações
- `docs/08-publicacoes/**`

### Compartilhados, alteração aditiva indispensável

- `lib/editorial/operational-flow.ts`: defaults e metadados retrocompatíveis no registro operacional.
- `lib/server/editorial-repositories.ts`: `find`/atualização otimista e proteção server-side.

### Consultados sem alteração

- `lib/editorial/persistence-contracts.ts`
- `components/editorial-pipeline-context.tsx`
- `components/editorial/operational-data-grid.tsx`
- `lib/arquiteto/contracts.ts`
- `lib/redator/contracts.ts` e editor Tiptap
- `supabase/migrations/0002_operational_editorial_flow.sql`

Não serão alterados Redator, Tiptap, Planejador, Radar, Arquiteto, migrations, schema remoto, autenticação ou `OperationalDataGrid`.

## 8. Consumidores e compatibilidade

- Redator continua criando e sincronizando `OperationalPublication`; campos novos têm defaults.
- Contexto editorial continua hidratando a mesma lista e mantém o fallback por marca.
- Workspace e repositório continuam aceitando registros antigos.
- A rota de Publicações é a única responsável por transições operacionais novas.
- O bundle mock de `PublicationRecordSchema` permanece compatível e não será tratado como persistência real.

## 9. Riscos e controles

| Risco | Controle |
| --- | --- |
| sobrescrever publicado | comparação server-side de campos protegidos e URL final |
| declarar exportação sem arquivo | registrar somente após `Blob`/download criado |
| inventar destino/URL | formulário manual, URL obrigatória para publicar, sem integração externa |
| perder ação em concorrência | `lock_version`, resposta 409 e rollback do otimista local |
| confundir pedido de atualização com rascunho | `published` permanece protegido; `updateRequested` é ortogonal |
| misturar marcas | rota e repositório conferem `marca_id` e permissão |
| quebrar registros antigos | campos aditivos com defaults e teste de parse legado |
| transformar `silo_page` em artigo | `unitType` preservado e exibido em todas as exportações |

## 10. Testes

- transições válidas e inválidas da fila;
- importação idempotente preservada;
- exportação Markdown/JSON/CSV determinística e sem URL inventada;
- publicação exige destino e URL válida;
- pedido de atualização preserva estado/slug/URL protegidos;
- reedição registra evento sem mudar campos estruturais;
- artigo e `silo_page` permanecem diferenciados;
- registro legado recebe defaults;
- concorrência e proteção server-side cobertas por inspeção de contrato/repositório;
- testes atuais de Operacional, Editorial e Redator continuam passando;
- TypeScript, lint direcionado, build e inspeção de diff;
- nenhum teste chama IA paga, rede externa, Supabase remoto ou CMS.

## 11. Rollback

Rollback é por arquivo/hunk desta tarefa, preservando as alterações locais pré-existentes. Remover os arquivos exclusivos de Publicações e reverter apenas os hunks aditivos nos contratos/repositório compartilhados. Não usar `git reset`, `git checkout` ou limpeza de dados. Como não há migration nem alteração remota, não existe rollback remoto.

## 12. Limitações

- O download confirma a criação do arquivo no navegador, não a ingestão pelo CMS.
- A URL final só é considerada registrada quando fornecida manualmente e persistida; a existência pública dela não é verificada.
- A persistência remota depende de a migration operacional já estar aplicada e acessível; isso continua pendente de validação manual.
- O histórico dentro do payload é operacional e não substitui uma tabela append-only dedicada; criar essa tabela exigiria nova SDD/migration.
