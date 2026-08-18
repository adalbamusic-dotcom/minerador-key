# Adendo SDD — Historical Import Guard do handoff Minerador → Arquiteto

**Módulo proprietário:** Fundação compartilhada / Minerador → Arquiteto  
**Base:** `docs/compartilhado/sdd-persistencia-canonica-pipeline-editorial.md`  
**Status:** Aprovado para implementação local  
**Implementação:** Local parcial; escritor histórico bloqueado por decisão de autorização  
**Operações remotas:** Nenhuma  
**Classificação:** `READY_FOR_EXCEPTIONAL_OPERATION_GRANTS_LOCAL_IMPLEMENTATION`

> **Decisão posterior — 2026-08-12:** este adendo permanece como registro da
> tentativa de recovery histórico, mas sua semântica operacional foi substituída
> pelo rebase canônico do patrimônio do Minerador. `0031` continua congelada e
> nenhuma operação por grant será implementada. Marcadores
> `historical_import_protected` existentes são candidatos a transição controlada
> para `received` pelo bootstrap idempotente da Brand, após preflight e aprovação
> humana; eles não bloqueiam mais a entrada no novo fluxo. Esta anotação não
> remove a infraestrutura 0030 nem autoriza operação remota.

## 1. Problema e evidências

Há marcadores locais `architectImportedKeywordIds` para aproximadamente cinquenta keywords históricas da Brand Adalba. Eles registram que essas keywords já passaram pelo Arquiteto, mas o conteúdo editorial correspondente não foi recuperado e não será reconstruído.

No estado remoto relatado para a Brand, há 89 `keywords_kgr`, 72 elegíveis, nenhum `editorial_workflow_items` e nenhum item `architect`/`keyword`; há dois ArticleDNA canônicos posteriores, que não comprovam nem recuperam o conteúdo histórico perdido.

O contrato atual materializa todo item de `editorial_workflow_items` com `stage = architect` no workspace, sem filtrar `state`. O estado operacional atual conhecido é `received`. Assim, reutilizar o workflow operacional para registrar legado recriaria indevidamente trabalho ativo no Arquiteto.

## 2. Decisão proposta

Formalizar o estado:

```text
historical_import_protected
```

Semântica proposta:

- registro histórico e terminal para a importação normal;
- guarda canônico de anti-duplicação;
- não operacional e não materializável no workspace do Arquiteto;
- não implica ArticleDNA, SiloDNA, SiloPage, ContentPlan ou qualquer objeto downstream;
- não reconstrói payload, artigo, agrupamento ou conteúdo perdido.

`historical_import_protected` não é promoção de uma importação antiga para um handoff ativo. É somente a persistência do fato histórico de que a keyword não pode voltar a entrar como nova.

## 3. Estados que não devem ser confundidos

| Conceito | Autoridade e significado |
|---|---|
| `received` | Handoff operacional atual Minerador → Arquiteto; pode aparecer no workspace. |
| `historical_import_protected` | Guarda histórica canônica; bloqueia reimportação e não aparece como trabalho. |
| Publicado/protegido | Proteção editorial existente do Minerador ou conteúdo publicado; independente do guard histórico. |
| `architectImportedKeywordIds` | Evidência local de recuperação durante a transição; não é autoridade canônica permanente. |

## 4. Identidade e unicidade

Um guard futuro deve referenciar somente a identidade canônica:

```text
marca_id = Brand autorizada
subject_type = keyword
subject_id = keywords_kgr.id
stage = architect
state = historical_import_protected
```

Não são permitidos texto da keyword, slug, nome, lista, posição ou owner como substitutos de `subject_id`.

A migration 0027 já declara a unicidade:

```text
(marca_id, subject_type, subject_id, stage)
```

Ela permite uma única linha tanto para um handoff operacional quanto para um guard histórico da mesma keyword. Isso é compatível com a anti-duplicação, mas impede a coexistência dos dois estados. Portanto, não há transição automática de `historical_import_protected` para `received` e qualquer recuperação futura exige decisão humana e contrato separado.

## 5. Contrato futuro do workspace

Após aprovação e implementação, `stage = architect` não poderá ser o único critério de projeção do workspace. O read model deverá materializar apenas os estados explicitamente operacionais, inicialmente `received`, e excluir `historical_import_protected`.

O guard não gera linha de trabalho, item não agrupado, seleção, ArticleDNA ou overlay de artefato. A ausência de workspace não reduz a proteção contra reimportação.

## 6. Contrato futuro do handoff normal

`POST /api/arquiteto/handoff` continua exclusivo para entrada operacional nova.

| Estado encontrado para a identidade canônica | Resultado futuro |
|---|---|
| Nenhum workflow/guard | Cria `received`. |
| `received` | Mantém idempotência operacional. |
| `historical_import_protected` | Rejeita a importação normal com `HISTORICAL_IMPORT_PROTECTED`; não retorna `UNCHANGED` como se fosse handoff ativo. |

O endpoint não cria guard histórico nem recebe o marcador local como prova.

## 7. Autoridade futura da UI

O modal **Importar do Minerador** deverá distinguir:

- **Já importado no Arquiteto:** workflow operacional canônico;
- **Importação histórica protegida:** guard canônico `historical_import_protected`;
- **Publicado:** proteção editorial independente;
- **Disponível para importação:** keyword aprovada/publicada sem workflow operacional e sem guard histórico.

Keywords com guard histórico não terão checkbox nem importação normal. A UI não deve sugerir reimportar, reconstruir ou reconciliar o conteúdo editorial perdido.

## 8. Recuperação histórica limitada

Não haverá backfill de conteúdo nem criação de ArticleDNA, SiloDNA, SiloPage, ContentPlan, Radar, Planejador, Redator ou Publicações para o legado.

O único dado recuperável é o fato de que uma keyword real da Brand já foi importada historicamente e deve ser bloqueada. Cada marcador local continua como candidato de recuperação até revisão explícita contra:

- `keywords_kgr` da mesma Brand;
- status atual da keyword;
- workflow canônico eventualmente existente;
- decisão humana por ID técnico.

Nenhum conjunto de keywords elegíveis pode ser promovido automaticamente a histórico. Os marcadores locais não serão apagados antes da reconciliação canônica autorizada.

## 9. Escritor futuro do guard

Uma fase posterior poderá criar uma operação separada do handoff normal, com os seguintes requisitos:

- server-side, autenticada e autorizada para a Brand;
- seleção humana explícita de IDs de `keywords_kgr`;
- validação de pertencimento à mesma Brand;
- auditada e idempotente;
- sem SQL manual como fluxo operacional;
- sem promoção automática dos marcadores ou de todas as keywords elegíveis.

Essa operação não está autorizada por este documento e não foi implementada.

### Elegibilidade e proteção de publicado

`keyword.status = publicado` continua sob a proteção canônica de conteúdo publicado. Não deve receber `historical_import_protected` apenas para duplicar essa proteção.

Um candidato real a uma recuperação histórica futura precisa reunir, cumulativamente:

- marcador histórico válido;
- keyword pertencente à Brand-alvo;
- keyword não publicada e não protegida por outra regra canônica;
- ausência de workflow canônico já existente.

Mesmo diante desses critérios, a recuperação permanece rara, humana, auditada e não repetível silenciosamente.

## 10. Keyword workflow boundary

- `subject_type = keyword` é permitido somente como entrada do estágio `architect`;
- `historical_import_protected` pertence exclusivamente à fronteira Minerador → Arquiteto;
- `received` de keyword representa entrada operacional no Arquiteto;
- após a formação do ArticleDNA, o próximo handoff usa a entidade de artigo prevista pelo contrato do pipeline;
- keyword não pode avançar como unidade operacional para Radar, Planejador, Redator ou Publicações;
- referências de keyword permanecem apenas como proveniência dentro do ArticleDNA e de suas entidades sucessoras.

Esta regra não altera a arquitetura dos módulos seguintes nesta etapa.

## 11. Consumidores impactados na implementação futura

- modal **Importar do Minerador**;
- `POST /api/arquiteto/handoff`;
- `GET /api/arquiteto/workspace`;
- `lib/server/arquiteto-workspace.ts`;
- `lib/arquiteto/canonical-workspace.ts`;
- lógica de idempotência do handoff;
- `architectImportedKeywordIds` somente durante a transição de recuperação.

Radar, Planejador, Redator e Publicações não participam deste adendo.

## 12. Compatibilidade, riscos e rollback

### Compatibilidade com 0027

O schema 0027 possui os quatro campos de identidade necessários e aceita o novo estado como texto não vazio. A persistência do guard não exige nova coluna, tabela, índice ou constraint. Uma migration futura só será necessária se uma decisão posterior exigir enumeração ou restrição física dos valores de `state`.

### Riscos que a implementação deverá prevenir

- guard aparecer como trabalho atual;
- duplicação de workflow para a mesma keyword;
- classificar as 72 elegíveis como históricas sem evidência;
- perda de marcadores antes da persistência canônica;
- desbloqueio acidental de keyword histórica;
- confundir proteção de publicado com historical guard.

### Rollback futuro

Este adendo é documental; rollback não se aplica nesta etapa. Uma futura reversão não poderá apagar silenciosamente o guard nem a evidência de decisão. Deverá ser uma operação auditada, explícita e aprovada separadamente.

## 13. Critérios de aceite da implementação local

- guard histórico remoto não aparece no workspace e bloqueia o handoff normal;
- enquanto o guard remoto não estiver criado, o marcador local antigo continua bloqueando somente a importação local corrente;
- guard não cria artefato editorial nem duplica workflow;
- `received` permanece visível no workspace e converge entre navegadores;
- publicado continua protegido independentemente do guard;
- nova keyword sem guard e sem workflow continua importável pelo handoff normal.

## 14. Escritor histórico e autorização pendente

A auditoria local de 2026-08-12 confirmou que não existe capability ou composição de autorização com semântica exata para recuperação histórica por Brand.

- `arquiteto:create` autoriza o handoff editorial normal e não pode ser ampliada para esta operação;
- `arquiteto` e `brand_data` são capabilities operacionais amplas: no contrato de Agency, cada uma concede todas as ações do módulo correspondente;
- `marca:manage` e `arquiteto:manage` também são permissões amplas de gestão cotidiana, não uma autorização excepcional e auditável de recovery;
- Admin global administra a plataforma, mas não recebe vínculo operacional editorial com uma Brand por esse papel sozinho;
- uma Agency não substitui a Brand como tenant e não deve receber este poder por inferência de uma capability operacional existente.

Portanto, o escritor histórico permanece bloqueado até a fundação aprovada em `docs/compartilhado/sdd-autorizacao-excepcional-recovery-historico-minerador-arquiteto.md` ser implementada localmente e aplicada remotamente em gate próprio. O grant é temporal, explícito por Brand e não cria acesso canônico; a delegação para owner/admin da Brand, suporte de Admin global e eventual actor de Agency depende sempre de grant ativo e acesso canônico atual. Nenhum desses atores recebe bypass automático no estado atual.

## 15. Limites deste adendo

Não autoriza migration, SQL remoto, criação de guards, backfill, limpeza de LocalStorage, reimportação de keywords antigas, commit, push ou deploy. O filtro, o bloqueio do handoff e a proteção transitória local são a implementação local autorizada.
