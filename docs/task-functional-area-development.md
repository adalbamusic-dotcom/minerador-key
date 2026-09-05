# Task — FUNCTIONAL_AREA_DEVELOPMENT

## Estado

```text
DATABASE_REFRESH = COMPLETE
GLOBAL_FOUNDATION = READY
READY_FOR_FRESH_AREA_DEVELOPMENT = YES
```

O Master Refresh foi encerrado. A baseline canônica é de 2026-08-17, com
fingerprint `f058b86b56e6d99ab24dac967241c221`. As migrations 0043 e 0044 estão
fechadas. Banco, Auth, Agency/Brand, Vault e integrações canônicas são
infraestrutura congelada.

## Escopo da nova fase

Desenvolver as estações funcionais na ordem:

`Marca → Minerador → Arquiteto → Radar → Planejador → Redator → Publicações`

Cada área deve permanecer tenantizada por `brandId`, preservar proveniência,
usar contratos internos canônicos e evoluir sem alterar a fundação global por
conveniência local.

## Evidência já registrada

O Minerador possui os seguintes smokes reais registrados pelo usuário:

- Google Ads Discovery;
- Google Ads Historical Metrics;
- DataForSEO Allintitle;
- importação Manual/CSV;
- importação para o Processador;
- Nicho/Intenção;
- Perfil da keyword.

Isso não homologa automaticamente Marca, Arquiteto, Radar, Planejador,
Redator ou Publicações.

## Primeiro gate

Escolher a primeira área funcional e definir seu módulo proprietário, contrato
atual, persistência real, testes direcionados, smoke manual e limites. Não
iniciar auditoria geral do banco como preparação da área.

## Preservar na interface

`technical canonical name != display label`.

Labels devem usar linguagem de produto, enquanto `BrandDNA`, `KeywordDNA`,
`ArticleDNA`, `SiloDNA`, `ContentPlan`, `ContentDocument` e
`PublicationRecord` permanecem nomes técnicos internos.
