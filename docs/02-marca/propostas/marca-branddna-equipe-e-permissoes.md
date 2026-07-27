# SDD — Marca, BrandDNA, equipe e permissões

- **Status:** Corte 1 implementado; validação remota/manual pendente
- **Data:** 2026-07-20
- **Módulo proprietário:** Marca
- **Escopo:** `app/(brand)/[brandRef]`, `modules/marca`, `app/api/marca`, `components/marca`, `lib/marca`, testes e documentação de Marca

## 1. Decisão e objetivo

Consolidar Marca como fonte de contexto organizacional e autorização por marca, preservando compatibilidade com o cadastro legado em `marcas` e com os consumidores editoriais. O primeiro corte implementável deste SDD fecha o ciclo do BrandDNA: carregar versões remotas quando a persistência estiver disponível, salvar uma nova versão imutável como rascunho e registrar aprovação humana separadamente. O fallback local é explicitamente recuperação/draft e nunca é reportado como persistência confirmada.

Materiais, Skills e prompts continuam sendo contratos locais até haver schema próprio aplicado. O SDD registra essa limitação para impedir que a UI os apresente como persistidos.

## 2. Estado encontrado

### Verificado no código

- `app/(brand)/[brandRef]/page.tsx` delega para `BrandPage` em `modules/marca/brand-page.tsx`.
- `components/brand-context.tsx` carrega marcas por `/api/marcas`, força a marca única para `cliente` e mantém `selected_brand_id` em `localStorage`.
- `app/api/marcas/route.ts` protege leitura por `requireSessionProfile`/`listMarcasForProfile`; POST e PUT continuam restritos ao administrador legado.
- `lib/arquiteto/contracts.ts` já define `BrandDNASchema` e `VersionedBrandDNASchema` com posicionamento, público, voz, objetivos, diferenciais, claims proibidos e princípios editoriais.
- `supabase/migrations/0002_operational_editorial_flow.sql` prevê `editorial_artifact_versions` com `artifact_type = 'brand_dna'`, eventos de status append-only e autorização por módulo/ação.
- `app/api/editorial/invitations/route.ts` cria convites com validação Zod e autorização `marca:manage`; o repositório persiste token somente como hash e não envia e-mail.
- `BrandSkill`, `BrandPrompt`, `BrandMaterial`, convites e estados do pipeline são contratos ou estado local no provider. Não foi localizada persistência própria para materiais, Skills e prompts.

### Não confirmado / limitações

- A migration 0002 não foi aplicada nem validada contra o banco nesta tarefa.
- Não existe ponte de Marca para ler/salvar `brand_dna` em `editorial_artifact_versions`.
- Não existe ponte de Marca para atualizar `marcas.active_brand_dna_version_id`; a versão aprovada vigente é derivada dos eventos até existir coluna/contrato próprio.
- `docs/compartilhado/autenticacao-e-permissoes.md` e `docs/compartilhado/persistencia-local.md` existem e registram a fronteira atual de autorização e recovery local.
- A listagem e mutação remota de membros/permissões não estão expostas em API exclusiva de Marca. O workspace editorial lista convites quando a migration está disponível; os métodos de membros e permissões permanecem vazios.

## 3. Entidades e contratos

### Marca

O cadastro legado permanece a fonte compatível de `id`, `nome`, `site_url`, `nicho`, `localizacao`, `dna_diretrizes` e `silos_existentes`. O contrato canônico futuro deve acrescentar status, proprietário, locale, país, timezone e domínios sem remover os campos legados.

### BrandDNA

O contrato vigente é `BrandDNASchema`/`VersionedBrandDNASchema` em `lib/arquiteto/contracts.ts`. Cada versão possui identidade, número, hash, predecessor, origem, razão, autor e payload. O status é externo, em `editorial_version_status_events`; versões aprovadas são imutáveis e uma alteração cria sucessora.

### Materiais, Skills e prompts

Os schemas atuais em `lib/editorial/operational-contracts.ts` são mantidos como contratos de consumo. Até schema próprio, a origem deve permanecer `local`, `legacy` ou `mock` conforme o caso; não será adicionada uma afirmação de persistência remota.

### Equipe, convites, papéis e permissões

`CollaboratorRoleSchema`, `PermissionModuleSchema`, `PermissionActionSchema`, `ModulePermissionSchema` e `BrandInvitationSchema` são os contratos atuais. A autorização efetiva é composta por membership ativo ou grant delegado, verificada em `assertEditorialPermission` e, no banco, em `editorial_has_permission`. Convite pendente não concede acesso.

## 4. Fluxos

1. A sessão solicita `/api/marca/brand-dna?brandId=...`.
2. O servidor exige sessão, marca compatível e `marca:view`, filtra por `marca_id` e retorna versões/eventos. O cliente pode usar um draft local por marca somente quando a persistência estiver indisponível.
3. Salvar valida o payload completo, exige `marca:edit`, cria sucessora imutável e registra status `draft`.
4. Aprovar exige `marca:approve`, valida que a versão pertence à marca e registra evento humano `approved`. Não há aprovação automática.
5. A UI mostra origem e modo de persistência. `local_fallback` não é sucesso remoto.

## 5. Arquivos afetados

### Alteração autorizada neste corte

- `docs/02-marca/propostas/marca-branddna-equipe-e-permissoes.md`
- `docs/02-marca/estado-atual.md`
- `docs/02-marca/backlog.md`
- `lib/marca/contracts.ts`
- `lib/marca/domain.ts`
- `app/api/marca/brand-dna/route.ts`
- `components/marca/brand-dna-panel.tsx`
- `modules/marca/brand-page.tsx` e `modules/marca/marca-page-entry.tsx` para compor o painel dentro da seção Marca/DNA
- `tests/marca-domain.test.mts`

### Não alterar neste corte

Conta, Admin, páginas de Minerador/Arquiteto, autenticação global, migration remota, schema remoto e consumidores editoriais.

## 6. Consumidores

- `lib/arquiteto/contracts.ts` fornece o schema versionado consumido pelo pipeline.
- `components/editorial-pipeline-context.tsx` e adaptadores continuam aceitando referências de BrandDNA; nenhuma alteração de contrato consumidor é necessária.
- Módulos editoriais podem consumir a referência aprovada quando a integração de carregamento for adicionada em proposta posterior.

## 7. Riscos e controles

- **Migration ausente:** responder 503 controlado e preservar draft local sem apagar dados.
- **Mistura de marcas:** validar `brandId` no payload, na query e na autorização server-side.
- **Sobrescrita:** inserir nova versão e usar predecessor; nunca atualizar payload histórico.
- **Aprovação indevida:** endpoint separado por ação e evento humano explícito.
- **Aprovação concorrente:** a sucessão de eventos é append-only, mas ainda depende de duas escritas sem RPC transacional; uma migration/RPC futura deve tornar aprovação + supersessão atômicas.
- **Checkout sujo:** alterar apenas os arquivos listados e validar diff/diff check.

## 8. Testes

- Testes puros de derivação de BrandDNA legado, validação completa, sucessão e rejeição de marca divergente.
- `npm run test:authz` para manter a proteção de escopo de marcas.
- `npm run test:editorial` para confirmar que o contrato consumidor não regrediu.
- `git diff --check`.
- Build/typecheck e validação manual da UI permanecem dependentes do ambiente e serão reportados separadamente.

## 9. Rollback

O rollback é reversível por remoção/reversão dos arquivos deste corte. Nenhum dado remoto é excluído ou alterado pelo agente. Como a escrita remota depende de uma migration que não será aplicada aqui, não há operação de banco para desfazer nesta tarefa.

## 10. Próximas etapas

- Criar schema/migration própria para materiais, Skills e prompts com versionamento e status.
- Expor membership, papel, permissões efetivas, revogação e aceite de convite por APIs exclusivas de Marca.
- Adicionar ponte de `activeBrandDnaVersionId` ou derivação server-side oficial para todos os consumidores.
- Atualizar os documentos compartilhados ausentes somente após decisão documental específica.
