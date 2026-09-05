# Backlog global — pós-refresh

## Referência de auditoria — 2026-09-04

- [x] Revisão geral do checkout, arquitetura, contratos de banco, APIs e funcionalidades: [relatório](auditorias/revisao-geral-plataforma-2026-09-04.md) e [inventário técnico](auditorias/inventario-tecnico-2026-09-04.md).
- [ ] Triar os achados de autorização por documento/versão/ação e as incompatibilidades de Site/Sitemap, pelos gates e módulos proprietários aplicáveis.
- [ ] Classificar e resolver as falhas locais de TypeScript, lint e testes registradas no relatório antes de declarar aprovação global.

Esta auditoria não alterou código, banco ou o estado funcional dos módulos; não reabre o refresh nem autoriza operações remotas. A sequência funcional abaixo permanece vigente.

## Estado

```text
DATABASE_REFRESH = COMPLETE
GLOBAL_FOUNDATION = READY
READY_FOR_FRESH_AREA_DEVELOPMENT = YES
BASELINE = 2026-08-17 / f058b86b56e6d99ab24dac967241c221
```

A fundação global está congelada. Não reabrir banco, Auth, Agency/Brand,
integrações ou migrations para resolver uma necessidade isolada de módulo.
Uma mudança transversal exige evidência nova, SDD/adendo aplicável e gate
próprio.

## Fase vigente

`FUNCTIONAL_AREA_DEVELOPMENT`

1. Marca
2. Minerador
3. Arquiteto
4. Radar
5. Planejador
6. Redator
7. Publicações

## Pendências funcionais

- [ ] Escolher e preparar a primeira área funcional.
- [ ] Validar cada área com seus próprios testes e smoke, preservando
  `brandId`, isolamento tenantizado e proveniência.
- [ ] Registrar manualmente o resultado de cada área sem transformar um smoke
  em homologação global.

## Fora do backlog funcional

- [ ] Não iniciar nova reforma ampla do banco.
- [ ] Não reabrir o Master Refresh, 0043 ou 0044.
- [ ] Não remover ou recriar infraestrutura global sem decisão estrutural
  separada.
