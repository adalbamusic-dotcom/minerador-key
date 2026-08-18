# Task — adoção gradual do Operational Grid

Status: **Planejamento documental — não iniciada**  
Módulo proprietário: Infraestrutura compartilhada / sistema visual  
Contrato: [Operational Grid](operational-grid.md)

Esta task organiza possíveis adoções do padrão global de mesas operacionais.
Não declara migração concluída, não altera o estado de nenhum módulo e não
autoriza código, schema, persistência visual ou operação remota.

## 1. Escopo

Executar a adoção somente quando um módulo tiver fluxo real, consumidor
identificado, contrato de dados estável e validação manual possível. A ordem
planejada é:

| Fase | Escopo | Situação documental |
| --- | --- | --- |
| R0 | contrato Operational Grid | planejada nesta documentação |
| R1 | auditoria/extração de primitives do Minerador | pendente |
| R2 | Descobrir + Processar | pendente de R1 e regressões |
| R3 | Arquiteto | pendente de fluxo real testável |
| R4 | Radar | pendente de ArticleDNA, APIs e smoke real |
| R5 | Planejador | pendente de fluxo ContentPlan verificável |
| R6 | Publicações | pendente de fluxo PublicationRecord verificável |

Marca, Admin e Agência devem ser avaliados individualmente. Redator não troca
o editor Tiptap por grid; somente listas auxiliares podem ser consideradas.

## 2. R0 — documentação

Entregas:

- contrato compartilhado em `docs/compartilhado/operational-grid.md`;
- referência resumida em `docs/compartilhado/sistema-visual.md`;
- registro desta task;
- distinção entre referência do Minerador e adoção global.

Gate: documentos revisados, links válidos e nenhuma afirmação de migração
platform-wide.

## 3. R1 — auditoria da referência

Objetivo: identificar o que pode ser compartilhado sem reconstruir o
Minerador.

Pré-condições:

- contrato do Operational Grid revisado;
- comportamento atual do Minerador confirmado no código e nos testes;
- consumidores e fronteiras de domínio mapeados.

Entregas esperadas:

- inventário de componentes/handlers reutilizáveis;
- separação entre comportamento de grid e regras KeywordDNA/KGR;
- matriz de regressões de seleção, pintura, sort, reorder, resize, scroll,
  detalhe, bulk bar e isolamento por `brandId`;
- proposta de compatibilidade ou decisão de não extrair.

R1 não autoriza substituir o grid existente nem alterar o módulo proprietário.

## 4. R2–R6 — gates por consumidor

Para cada módulo, abrir uma etapa própria e registrar:

- contrato de entrada e adapter;
- colunas, row id, renderer de detalhe e ações do domínio;
- permissões já resolvidas e contexto `brandId`;
- gestos realmente necessários;
- ausência de scroll interno concorrente;
- impacto em seleção, ordenação, edição e persistência;
- rollback de composição sem apagar dados;
- testes automatizados direcionados;
- screenshot do DOM/render real;
- mouse e teclado reais;
- smoke manual autenticado;
- aprovação explícita do avanço.

Não usar build ou TypeScript como prova de interação, persistência ou
isolamento. Cada módulo deve separar evidência local, remota e manual.

## 5. Checklist de aceite

Antes de marcar qualquer fase como adotada:

- [ ] código/adapter implementado no escopo aprovado;
- [ ] testes de contrato e regressão passam;
- [ ] DOM/render real inspecionado;
- [ ] screenshot registrado;
- [ ] checkbox, Ctrl/Cmd, Shift e pintura validados quando previstos;
- [ ] texto continua selecionável e copiável;
- [ ] sort/manual order não entram em conflito;
- [ ] resize, detalhe e bulk bar validados quando previstos;
- [ ] responsividade verificada em 1440, 1024, 768 e, quando necessário,
      360px;
- [ ] scroll horizontal/vertical validado;
- [ ] aviso usa GlobalNoticeCenter;
- [ ] sucesso só aparece após persistência real, quando aplicável;
- [ ] dataset e troca de marca validados para o `brandId` correto;
- [ ] aprovação registrada antes da próxima fase.

## 6. Fora do escopo permanente desta task

Não fazer nesta task:

- editar frontend ou migrar módulos;
- criar campo de ordem, tamanho ou estado visual no banco;
- alterar schema, RLS, APIs, providers ou pipeline editorial;
- chamar IA ou provider pago;
- alterar persistência editorial;
- resolver tenant dentro da primitive;
- registrar adoção nos `estado-atual.md`/`backlog.md` dos módulos sem a fase
  correspondente concluída.

## 7. Bloqueios e decisões pendentes

- R1 depende de auditoria cuidadosa da implementação de referência.
- R2 depende de não quebrar os fluxos de Descobrir e Processar.
- R3 depende de fluxo real e testável do Arquiteto.
- R4 depende de ArticleDNA, APIs reais e smoke autorizado.
- R5 e R6 dependem dos contratos definitivos de ContentPlan e
  PublicationRecord.
- Persistência cross-device do estado visual exige decisão estrutural própria.

## 8. Estado da task

```text
TASK_CREATED = YES
R0_STATUS = DOCUMENTED
R1_STATUS = PENDING
R2_STATUS = PENDING
R3_STATUS = PENDING
R4_STATUS = PENDING
R5_STATUS = PENDING
R6_STATUS = PENDING
PLATFORM_WIDE_MIGRATION = NOT_DECLARED
CODE_CHANGE = NO
DATABASE_CHANGE = NO
REMOTE_OPERATION = NONE
```
