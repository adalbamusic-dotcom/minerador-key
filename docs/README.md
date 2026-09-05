# Índice oficial da documentação

Este arquivo orienta a leitura e a atualização da documentação vigente. Não use `docs/_arquivo/` para orientar implementação atual: ele é histórico.

## Base documental ativa — consolidação de 2026-08-27

Os documentos abaixo existem no repositório e formam a base ativa por assunto.
Não são uma proposta pendente de implementação.

- [Pipeline editorial, papéis e handoffs](00-produto/pipeline-editorial-papeis-handoffs.md)
- [Mapa de estado atual da Plataforma](00-produto/mapa-estado-atual-plataforma.md)
- [Sistema visual canônico](compartilhado/sistema-visual.md)
- [Regras de trabalho e documentação](compartilhado/regras-de-trabalho-e-documentacao.md)
- [Contrato e estado do InternalLinkGraph](04-arquiteto/links-internos-estado-e-contrato.md)
- [Backlog futuro de agentes e MCP](compartilhado/agentes-mcp-backlog.md)

Precedência: invariantes/ADRs → SDD → spec → código/estado remoto validado → estado-atual → backlog → pareceres → histórico.

O InternalLinkGraph deve ser tratado como fundação estrutural remota pronta. A próxima frente é a experiência funcional da aba Links Internos.

Observação: o InternalLinkGraph está com fundação remota aplicada, readback e
isolamento cross-brand confirmados. A próxima frente é a experiência funcional
da aba Links Internos. O Silo Pair teve smoke transacional positivo, mas deve
permanecer documentado que o owner técnico postgres foi usado na preparação de
fixture porque service_role não possui UPDATE em
editorial_artifact_versions; isso não deve gerar grant automático.

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
| [Contrato InfoHint](compartilhado/contrato-info-hint.md) | Define o primitive compartilhado para ajuda contextual curta, acessível e sem interação interna. |
| [Contrato de ajuda contextual](compartilhado/contrato-ajuda-contextual.md) | Define o drawer compartilhado por área, escopo de rotas, contrato de conteúdo local e ausência de fallback cruzado. |
| [Operational Grid](compartilhado/operational-grid.md) | Define o padrão planejado para mesas e listas operacionais densas, com adapters por domínio. |
| [Task de adoção do Operational Grid](compartilhado/task-operational-grid-adoption.md) | Organiza a adoção gradual, os gates de evidência e os bloqueios por módulo. |
| [SDD — identidade e tenantização](compartilhado/sdd-geracao-canonica-identidade-tenant.md) | Define o destino arquitetônico de identidade UUID, tenant, owner, agência, autorização e corte de contratos legados. |
| [SDD — integrações](compartilhado/sdd-arquitetura-integracoes-plataforma-agencia-marca.md) | Define o destino arquitetônico de connections, capabilities, grants, bindings, uso, segredos e transferência. |
| [SDD — lifecycle global da Plataforma](compartilhado/sdd-lifecycle-global-plataforma-2026-08-20.md) | Define histórico de sessão, publicação canônica, impacto, delete transacional, recuperação de 24 horas, purge e cleanup controlado. |
| [Plano de cleanup da homologação 0047](compartilhado/0047-test-cleanup-plan-2026-08-20.md) | Registra a allowlist UUID, impacto, execução e readback da limpeza controlada. |
| [Runbook — homologação DeepSeek Fase 3](compartilhado/runbook-homologacao-deepseek-fase-3-2026-08-19.md) | Registra o preflight remoto read-only, o bloqueio atual e o procedimento manual futuro sem expor segredos. |
| [Plano de implementação da geração canônica](compartilhado/plano-implementacao-geracao-canonica.md) | Define o caminho por fases, gates, confirmação remota, backfill, rollback, testes e smoke. |
| [Pipeline editorial, papéis e handoffs](00-produto/pipeline-editorial-papeis-handoffs.md) | Consolida as entradas, saídas, decisões humanas e limites de cada área. |
| [Mapa de estado atual da Plataforma](00-produto/mapa-estado-atual-plataforma.md) | Consolida o estado verificado, remoto, manual e pendente sem substituir evidência. |
| [Regras de trabalho e documentação](compartilhado/regras-de-trabalho-e-documentacao.md) | Define precedência, classificação e critérios para manter documentação operacional. |
| [Contrato e estado do InternalLinkGraph](04-arquiteto/links-internos-estado-e-contrato.md) | Registra a fundação remota, o contrato tenantizado e a próxima frente funcional. |
| [Backlog futuro de agentes e MCP](compartilhado/agentes-mcp-backlog.md) | Mantém MCP e agentes como planejamento futuro, fora do runtime atual. |
| [Relatório da consolidação documental](00-produto/auditorias/consolidacao-documental-canonica-2026-08-27.md) | Registra o merge consciente, a classificação dos documentos e a limpeza de conceitos legados. |
| [Proposta de Evolução Modular](compartilhado/template-proposta-evolucao-modular.md) | Registra uma necessidade estrutural ainda não aprovada antes de qualquer implementação. |

SDD define o destino arquitetônico; plano estrutural define o caminho; `task.md` registra a execução atual; proposta modular registra uma necessidade ainda não aprovada. Histórico não orienta implementação atual.

## Histórico preservado

Os registros do corte OpenRouter → DeepSeek continuam disponíveis apenas como
histórico em [`docs/_arquivo/2026-08-documentacao-legada/`](_arquivo/2026-08-documentacao-legada/).
O índice desse arquivo identifica os substitutos canônicos ativos.

## Encerramento da fundação

O [estado global](00-produto/visao-geral.md) registra
`DATABASE_REFRESH = COMPLETE`, `GLOBAL_FOUNDATION = READY` e a baseline
`f058b86b56e6d99ab24dac967241c221`. O [backlog global](00-produto/backlog.md)
e a [task da fase funcional](task-functional-area-development.md) orientam o
desenvolvimento das áreas sem reabrir banco, Auth ou integrações.
O inventário da limpeza está em
[higiene pós-refresh](00-produto/auditorias/post-refresh-repository-hygiene-2026-08-18.md).

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
