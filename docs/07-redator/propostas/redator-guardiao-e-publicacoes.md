# SDD — Redator, Guardião e transferência para Publicações

- **Status:** implementada nesta tarefa; validação remota/manual pendente
- **Data:** 2026-07-20
- **Módulo proprietário:** Redator
- **Módulos consumidores/consultados:** Planejador, Publicações, workflow editorial e persistência editorial
- **Mudança remota:** nenhuma migration, schema remoto ou escrita externa

## 1. Estado atual auditado

### Editor existente

- `app/(brand)/[brandRef]/redator/page.tsx` abre `WriterPage` por `articleId` ou `documentId`.
- `components/editorial/professional-writer.tsx` é um editor Tiptap real, com StarterKit, tabelas, links, alinhamento, comentários, blocos editoriais e edição humana contínua.
- `lib/arquiteto/document.ts` hidrata o documento para Tiptap e converte o JSON editado de volta para blocos com proveniência preservada por `blockId`.
- O layout já possui fundamentos à esquerda, documento no centro e Guardião/inspector à direita; não será reconstruído nem convertido em popup.

### Contrato e entrada

- `ContentDocumentSchema` está em `lib/arquiteto/contracts.ts`, versão 1, com referências versionadas, blocos, `editorContent`, metadados e status em português.
- O Planejador envia somente planos aprovados por `startWriting`; a rota server-side confere marca, item do workflow, versão do plano e gates de aprovação.
- O plano definitivo v2 é consumido sem alteração no Planejador; a abertura atual usa `createOperationalDocument`.

### Salvamento, recovery e reload

- Autosave dispara após 1,2 s e usa `PATCH /api/editorial/documents` com `expectedLockVersion`.
- O servidor salva `content_documents`, cria snapshot opcional em `content_document_versions` e sincroniza o status da publicação.
- Falha de persistência cria recovery em `localStorage` por marca e documento; recovery não é fonte única de verdade.
- `reloadOperational` hidrata documentos, locks e estado de usuário do repositório server-side. A persistência remota não foi validada manualmente nesta auditoria.
- Conflito otimista é exposto como `409` e não sobrescreve silenciosamente o documento.

### Guardião, aprovação e Publicações

- Existem contratos de `GuardianFinding`, `SectionReview`, links, fontes e publicação, além de um finding mock.
- O inspector atual mostra categorias como “aguardando análise”; não há motor real de análise nem relatório persistido no `ContentDocument`.
- Aprovação atual apenas altera `status` para `aprovado` e força um snapshot; não bloqueia findings críticos nem exige análise atual.
- `PublicationRepository` possui registro idempotente por marca/artigo e importação condicionada a `approved`, mas o caminho foi confirmado apenas por código/teste de workflow, não por navegador ou banco remoto.

### IA e prompts

- Existe `generateStructuredAI` server-side e rotas estruturadas nos módulos vizinhos.
- Não existe rota ou motor do Redator para escrita por seção, melhoria de trecho ou revisão editorial.
- Testes continuarão usando fixtures; nenhum teste chamará provedor pago.

## 2. Problemas a resolver

1. O Redator não possui uma fronteira própria para prompts e resultados de escrita.
2. O usuário não consegue pedir escrita de uma seção ou melhoria de um trecho mantendo o restante intocado.
3. O Guardião não calcula cobertura mínima, aderência estrutural, repetição, links, fontes e metadados.
4. A aprovação não possui um gate explícito de findings bloqueantes.
5. O editor não oferece uma revisão operacional clara antes do envio idempotente.
6. A versão consolidada e o recovery precisam continuar distinguíveis de edição local e de aprovação humana.

## 3. Arquitetura proposta

### Contratos do Redator

Criar `lib/redator/contracts.ts` com contratos versionados e aditivos para:

- contexto de prompt (`PromptContext`);
- pedido de escrita por seção e pedido de melhoria de trecho;
- proposta de blocos, origem e decisão humana;
- `GuardianReport`, `SectionReview` e findings normalizados;
- estado de análise por hash do documento.

O payload persistido continua sendo `ContentDocument` v1 para não exigir migration. O relatório do Guardião e as propostas de IA ficam em estado de trabalho local e são enviados como parte de uma operação explícita de salvamento quando o contrato atual permitir. Uma eventual promoção do relatório para coluna/payload persistido será uma SDD própria de persistência.

### Motor de prompts

Criar `lib/redator/prompts.ts` para montar prompts determinísticos a partir de:

- ContentPlan aprovado e sua versão;
- ArticleDNA/SiloDNA referenciados;
- seção alvo e blocos anteriores aprovados;
- fontes, links, CTA, imagens, skills e pendências;
- tom e regras da marca quando disponíveis.

O motor não chama IA, não aprova e não altera o documento. A rota de IA recebe o contexto validado, exige saída estruturada e devolve proposta limitada à seção/seleção pedida.

### Escrita por seção e melhoria

- Adicionar rotas server-side sob `app/api/redator/`.
- Validar sessão, marca, permissão `redator`, tamanho dos campos e referências versionadas.
- Escrita por seção devolve uma proposta; a UI só aplica quando o humano confirma.
- Melhoria de trecho devolve substituição proposta para o trecho selecionado; nenhum outro bloco é alterado.
- Falha, ausência de provedor ou resposta inválida não remove conteúdo existente.

### Guardião

Criar motor determinístico em `lib/redator/guardian.ts`, sem chamada externa, que produza findings identificáveis por documento/seção para:

- H1 e headings do outline;
- seção sem corpo;
- cobertura de keyword/tópicos quando disponíveis;
- repetição exata de parágrafos;
- links internos e fontes planejadas ausentes;
- CTA/imagem planejada não representados;
- metadados essenciais;
- placeholders e blocos com evidência pendente.

O relatório sempre identifica limitações e marca decisão humana quando aplicável. Findings `blocked` impedem aprovação; warnings não aprovam automaticamente.

### Salvamento, versionamento e aprovação

- O autosave continua salvando conteúdo editável e usando lock otimista.
- Marco editorial cria snapshot imutável, preservando o documento anterior e o motivo.
- Aprovação exige conteúdo válido e Guardião sem bloqueios; continua sendo uma ação humana.
- Recovery local só é removido depois de resposta de salvamento confirmada.
- Não haverá limpeza de localStorage/IndexedDB, migration ou mutação de conteúdo publicado.

### Transferência

- Redator mantém a responsabilidade de solicitar a transferência.
- Publicações continua proprietária do registro de destino.
- A chamada existente de importação continua exigindo documento aprovado, marca e lock.
- Idempotência permanece por `(marca, artigo)` e reimportação não duplica registro.
- Nenhuma alteração será feita na página de Publicações; se o contrato exigir mudança incompatível, a implementação para e abre SDD conjunta.

## 4. Arquivos afetados

### Exclusivos do Redator

- `lib/redator/contracts.ts`
- `lib/redator/prompts.ts`
- `lib/redator/guardian.ts`
- `app/api/redator/section/route.ts`
- `app/api/redator/improve/route.ts`
- `app/api/redator/guardian/route.ts`
- `components/editorial/professional-writer.tsx`
- `tests/redator-domain.test.mts`
- `docs/07-redator/estado-atual.md`
- `docs/07-redator/backlog.md`

### Compartilhados consultados, sem alteração planejada

- `lib/arquiteto/contracts.ts`
- `lib/arquiteto/document.ts`
- `lib/editorial/persistence-contracts.ts`
- `lib/editorial/operational-flow.ts`
- `components/editorial-pipeline-context.tsx`
- `lib/server/editorial-repositories.ts`
- `app/api/editorial/documents/route.ts`
- `app/api/editorial/workflow/route.ts`

`app/api/editorial/documents/route.ts` recebe uma alteração aditiva indispensável: o gate server-side de aprovação chama o Guardião determinístico antes de persistir `aprovado`.

## 5. Consumidores e compatibilidade

- Planejador: somente leitura do plano aprovado; nenhum contrato de entrada é quebrado.
- Publicações: continua recebendo o registro existente após aprovação; nenhuma página ou schema é alterado.
- Tiptap: permanece o editor e o formato de trabalho humano.
- Persistência: usa tabelas existentes; nenhuma operação depende de migration nova.

## 6. Riscos e controles

| Risco | Controle |
| --- | --- |
| proposta de IA substituir conteúdo válido | proposta isolada e confirmação humana |
| relatório antigo ser usado após edição | relatório carrega hash e é invalidado após mudança |
| aprovação indevida | gate determinístico e status humano explícito |
| perda por autosave | lock otimista, recovery por documento e teste de conflito |
| duplicação em Publicações | comando existente e chave lógica marca/artigo |
| alteração de publicado | guard de slug, canonical e keyword permanece bloqueando edição |
| resposta inválida/limite de IA | Zod, limites de payload e fallback sem mutação |

## 7. Testes

- fixtures de documento/ContentPlan para prompt e Guardião;
- finding bloqueante impede aprovação;
- repetição e seção sem corpo são detectadas;
- escrita por seção e melhoria preservam blocos fora do alvo;
- saída inválida não substitui documento;
- contrato existente e fluxo operacional continuam passando;
- TypeScript/build direcionados e inspeção de diff;
- nenhum teste chama IA paga, rede externa, Supabase ou publicação real.

## 8. Snapshot e rollback

Snapshot pré-alteração: estado do worktree preservado e hashes SHA-256 dos arquivos centrais registrados na auditoria desta tarefa. Há alterações locais pré-existentes em vários módulos; rollback deve ser feito por arquivo alterado nesta SDD, nunca por reset global.

Rollback da implementação: remover os arquivos exclusivos listados e reverter somente os hunks do editor/testes/documentação desta tarefa. O contrato v1, tabelas existentes e fluxos vizinhos permanecem utilizáveis.

## 9. Limitações conhecidas

- Persistência remota e abertura ponta a ponta dependem de validação manual do usuário.
- O Guardião determinístico não prova originalidade externa, E-E-A-T ou factualidade; ele aponta pendências e exige decisão humana.
- Escrita e melhoria reais dependem de provedor configurado; fixtures cobrem o fluxo sem provedor.
- O destino CMS e publicação externa permanecem fora do escopo.
