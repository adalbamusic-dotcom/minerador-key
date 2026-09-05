# Adendo SDD — vínculo de publicação separado do status editorial

Status: proposta de implementação local controlada  
Módulo proprietário: Minerador  
Data: 2026-08-20

## Problema

`publicado` ainda é tratado como status editorial em parte do Minerador. Uma
alteração acidental pode ativar proteções de conteúdo publicado sem uma
verificação técnica da página nem confirmação humana explícita.

## Proposta

- manter `status` apenas para a decisão editorial ativa;
- retirar `Publicado` dos selects ativos sem alterar valores históricos;
- reutilizar visualmente a coluna `Principal` como `Vínculo`;
- resolver `Livre`, `Candidata`, `Verificada` e `Publicada` a partir de
  evidência de URL, verificação técnica e confirmação humana;
- conservar `Publicação não verificada` para legado sem confirmação formal;
- permitir correção legada sem apagar URL, canonical, histórico ou
  proveniência;
- exigir `Conferir site` somente por ação explícita e manter a operação
  server-side, tenantizada e read-only no site;
- exigir confirmação humana antes de uma publicação formal e oferecer
  `Desvincular publicação` depois dela.

O metadata existente em `analise_semantica.site_origin`/
`site_origins` é suficiente para esta etapa; não há alteração de schema,
migration ou enum remoto.

## Consumidores e riscos

Consumidores auditados: tabela e filtros do Minerador, Perfil da Keyword,
KeywordDNA, política da principal, importação CSV/manual/Site/Sitemap,
guards de exclusão/movimentação, handoff e proteção legada.

O valor histórico `status='publicado'` continua preservado para os registros
antigos. A trigger legada continua sendo uma camada de compatibilidade; os
guards locais passam a reconhecer também uma publicação formal representada
no read-model. Uma futura proteção de banco baseada exclusivamente no novo
metadata exigiria SDD separado e não faz parte desta entrega.

## Compatibilidade e rollback

Não há backfill nem exclusão de dados. O rollback lógico consiste em deixar de
usar o read-model de vínculo e reexibir o status histórico; os campos aditivos
de evidência e histórico permanecem legíveis. A correção não reconstrói URL,
canonical ou caminho por Silo.

## Testes e gate

Serão usados fixtures/mocks locais para estados de vínculo, correção legada,
confirmação humana, papel principal/secundário, tenant, URL externa rejeitada,
persistência/readback e ausência de chamadas de provider. Nenhuma migration,
operação remota, escrita no site ou chamada paga é autorizada nesta etapa.

## Autorização

Escopo autorizado: implementação local do workflow do Minerador e seus
consumidores mínimos. Mudança estrutural de schema, trigger, tabela, enum ou
contrato remoto deve parar e ser apresentada em SDD própria.
