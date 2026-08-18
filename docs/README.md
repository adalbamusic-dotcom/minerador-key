# Índice oficial da documentação

Este arquivo orienta a leitura e a atualização da documentação vigente. Não use `docs/_arquivo/` para orientar implementação atual: ele é histórico.

## Precedência documental

1. [Invariantes](00-produto/invariantes.md) e ADRs aceitas em [decisões](00-produto/decisoes/);
2. SDDs aprovadas;
3. specs permanentes do módulo proprietário;
4. código e estado validado;
5. plano estrutural;
6. `task.md`, backlog e propostas;
7. `docs/_arquivo/` como histórico, sem precedência operacional.

Quando houver conflito, registrar a divergência e seguir a fonte de maior precedência; não inferir implementação a partir de proposta, plano ou histórico.

## Documentos canônicos compartilhados

| Documento | Finalidade |
| --- | --- |
| [SDD — fundação visual global](compartilhado/sdd-fundacao-visual-global.md) | Define o alvo compartilhado de tokens, estados, GlobalTopbar e GlobalNoticeCenter, sem declarar implementação. |
| [Sistema visual canônico](compartilhado/sistema-visual.md) | Reúne tokens, componentes, estados e regras visuais aplicáveis às interfaces atuais. |
| [Operational Grid](compartilhado/operational-grid.md) | Define o padrão planejado para mesas e listas operacionais densas, com adapters por domínio. |
| [Task de adoção do Operational Grid](compartilhado/task-operational-grid-adoption.md) | Organiza a adoção gradual, os gates de evidência e os bloqueios por módulo. |
| [SDD — identidade e tenantização](compartilhado/sdd-geracao-canonica-identidade-tenant.md) | Define o destino arquitetônico de identidade UUID, tenant, owner, agência, autorização e corte de contratos legados. |
| [SDD — integrações](compartilhado/sdd-arquitetura-integracoes-plataforma-agencia-marca.md) | Define o destino arquitetônico de connections, capabilities, grants, bindings, uso, segredos e transferência. |
| [Plano de implementação da geração canônica](compartilhado/plano-implementacao-geracao-canonica.md) | Define o caminho por fases, gates, confirmação remota, backfill, rollback, testes e smoke. |
| [Proposta de Evolução Modular](compartilhado/template-proposta-evolucao-modular.md) | Registra uma necessidade estrutural ainda não aprovada antes de qualquer implementação. |

SDD define o destino arquitetônico; plano estrutural define o caminho; `task.md` registra a execução atual; proposta modular registra uma necessidade ainda não aprovada. Histórico não orienta implementação atual.

## Leitura ao iniciar uma fase

1. Ler invariantes, glossário, fluxo oficial e ADRs aplicáveis.
2. Ler as SDDs aprovadas, o plano estrutural e a Proposta de Evolução Modular quando houver mudança estrutural solicitada.
3. Ler `spec.md`, `estado-atual.md` e `backlog.md` do módulo proprietário, além de contratos e consumidores confirmados no código.
4. Atualizar `task.md` com fase, escopo autorizado, gates, pendências e validações previstas antes da implementação.

## Atualização ao finalizar uma fase

- Atualizar `estado-atual.md` do módulo proprietário com evidência local, remota e manual separadas.
- Atualizar `backlog.md` com pendências, bloqueios e próximos gates.
- Atualizar `task.md` com o estado real da execução, decisões pendentes e validações realizadas.
- Atualizar SDD, plano ou ADR somente se a regra arquitetônica permanente tiver mudado e a alteração estiver autorizada.
- Preservar snapshots, histórico, migrations e evidências; não declarar conclusão apenas por build, TypeScript ou teste unitário.

## Navegação por produto e módulos

Comece por [visão geral](00-produto/visao-geral.md), [invariantes](00-produto/invariantes.md), [glossário](00-produto/glossario.md) e [fluxo oficial](00-produto/fluxo-oficial.md). O fluxo é `Marca → Minerador → Arquiteto → Radar → Planejador → Redator → Publicações`.

| Área | Documentos de trabalho |
| --- | --- |
| Admin | [spec](01-admin/spec.md) · [estado](01-admin/estado-atual.md) · [backlog](01-admin/backlog.md) |
| Marca | [spec](02-marca/spec.md) · [estado](02-marca/estado-atual.md) · [backlog](02-marca/backlog.md) |
| Minerador | [spec](03-minerador/spec.md) · [estado](03-minerador/estado-atual.md) · [backlog](03-minerador/backlog.md) |
| Arquiteto | [spec](04-arquiteto/spec.md) · [estado](04-arquiteto/estado-atual.md) · [backlog](04-arquiteto/backlog.md) |
| Radar | [spec](05-radar/spec.md) · [estado](05-radar/estado-atual.md) · [backlog](05-radar/backlog.md) |
| Planejador | [spec](06-planejador/spec.md) · [estado](06-planejador/estado-atual.md) · [backlog](06-planejador/backlog.md) |
| Redator | [spec](07-redator/spec.md) · [estado](07-redator/estado-atual.md) · [backlog](07-redator/backlog.md) |
| Publicações | [spec](08-publicacoes/spec.md) · [estado](08-publicacoes/estado-atual.md) · [backlog](08-publicacoes/backlog.md) |
| Conta | [spec](09-conta/spec.md) · [estado](09-conta/estado-atual.md) · [backlog](09-conta/backlog.md) |

## Regras de classificação

Registre sempre se algo foi **Verificado no código**, **Confirmado por teste**, **Validado manualmente**, **Relatado pelo usuário**, **Planejado** ou **Ainda não verificado**. Persistência local, remota e simulada devem ser diferenciadas. TypeScript, build e testes automatizados não provam interface, RLS remota, provider real ou persistência autenticada.
