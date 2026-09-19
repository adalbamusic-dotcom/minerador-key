# SDD — Redesign do Redator e integração MCP da Agência

**Estado:** implementação local parcial em 2026-09-19; OAuth remoto e aplicação da migration continuam pendentes.  
**Proprietários:** Agência para integração MCP; Redator para produção editorial.  
**Dependências:** OAuth/HTTPS, contratos atuais do Redator, Publicações e armazenamento privado.  
**Não altera:** Minerador, Arquiteto ou Radar.

## Problema

A primeira fundação do MCP colocou uma credencial local na aba do Redator e modelou roteiro/carrossel como formulários com canal, objetivo, público e duração. Isso permite testes técnicos, mas não representa a intenção do produto: a IA deve produzir o conteúdo e o Redator deve apresentar, revisar e entregar esse conteúdo.

## Decisão proposta

1. Mover a gestão da conexão MCP para a Integração da Agência.
2. Remover `Conectar IA` do Redator depois que a paridade de conexão e revogação estiver disponível na Agência.
3. Manter um único servidor MCP por plataforma com autorização por agência, marca, ator e escopo; não criar uma conta global de modelo.
4. Reorientar Artigo, Roteiro e Carrossel para documentos de produção.
5. Retirar `channel` do contrato de roteiro/carrossel. O canal é responsabilidade de pós-produção e não é necessário para o conteúdo.
6. Manter prompts, imagens, retoques e arquivos como partes do documento ou de seus ativos vinculados.
7. Entregar ao módulo Publicações um pacote final com conteúdo, imagens, metadados, links, proveniência e versões.

## Compatibilidade

As linhas já gravadas em `writer_deliverables` permanecem legíveis. Durante a transição, `channel` pode ser aceito como campo legado na leitura, mas deve deixar de ser exibido, editado ou exigido na nova UI. Uma migração destrutiva não é necessária. O serviço pode normalizar o campo legado para `null` ou mantê-lo fora do novo read model, sem reescrever a versão histórica.

`writer_mcp_delegations` continua útil como trilha, mas a emissão deve ser chamada pela área da Agência. O token local atual deve ser marcado como desenvolvimento e não apresentado como conexão ChatGPT/Claude pronta.

## Dados e contratos

O contrato de produção deve separar:

- `sourceDocumentHash` e referências do Radar, somente leitura;
- conteúdo produzido do artigo, roteiro ou carrossel;
- ativos visuais por `documentId`, `deliverableId`, `blockId` ou `sceneId`/`slideId`;
- metadados finais do documento;
- estado de produção e estado de revisão;
- versões imutáveis, lock, hash e readback.

Não colocar no dossiê do Radar campos de redação. Não colocar em `ContentDocument` a credencial ou a configuração OAuth.

## Nova UI

`/agencias/{agencyRef}/integracoes` recebe um painel “MCP para produção editorial”, com marcas autorizadas, cliente, escopos, consentimento, revogação, expiração, auditoria e endpoint.

O primeiro corte já entrega o registro do cliente, o endpoint Streamable HTTP,
os escopos e a emissão/revogação de delegações por Marca. O cadastro usa as
conexões de integração existentes e não cria uma tabela paralela. O provider
fica `pending` até a conexão externa ser configurada; o segredo não é aceito
na UI. A migration de catálogo é
`supabase/migrations/20260919035046_agency_mcp_provider_catalog.sql` e ainda
precisa de aplicação remota explícita.

`/{brandRef}/redator` recebe três abas de produção. Artigo usa o editor; Roteiro e Carrossel usam uma tela de documento com conteúdo produzido. A seção de mídia fica ao lado ou junto do bloco correspondente. O botão principal é salvar/revisar/enviar para Publicações, não criar credencial.

## Handoff para Publicações

O envio exige:

`validar origem → validar hash → verificar pendências → salvar versão → ler de volta → montar pacote → ler Publicações → sucesso`.

O pacote não declara publicação externa nem chamada de rede social. Ele marca o material como pronto para pós-produção.

## Segurança

OAuth 2.1 com PKCE, audience, scopes e consentimento ficam no gateway da Agência. O Redator só recebe a identidade autorizada. O servidor verifica tenant, escopo, lock e hash em cada chamada. Nenhum token entra em localStorage, payload editorial, prompt ou log.

## Testes obrigatórios

- UI da Agência cria, lista, revoga e respeita escopo por marca.
- Redator não renderiza a aba de conexão.
- Documento de artigo, roteiro e carrossel carrega após F5 e segunda sessão.
- Conteúdo produzido é salvo com versão, lock e readback.
- Arquivo inválido, ativo de outra marca e ativo de outra cena são recusados.
- Repetição da mesma operação não duplica versão.
- Publicações recebe o pacote completo e não exige ContentPlan.
- Testes existentes de Radar, Arquiteto e Minerador continuam verdes.

## Rollback

Ocultar as novas superfícies e manter as tabelas já criadas. Não apagar versões históricas nem remover o contrato v2. Qualquer mudança de schema deve ser aditiva e acompanhada de leitura compatível.

## Aprovação necessária

Este SDD descreve o destino. A implementação deve começar com auditoria do código, consumidores e banco e só depois apresentar o mapa de arquivos, o plano de migração e os testes ao responsável pelo produto.
