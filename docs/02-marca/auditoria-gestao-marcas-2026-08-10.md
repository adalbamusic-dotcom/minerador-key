# Auditoria e refinamento da gestão de Marcas da Agência

Data: 2026-08-10  
Módulo proprietário: Interface Planner / Marca

## Resultado

`READY_FOR_BRAND_MANAGEMENT_SMOKE`

O cadastro operacional foi convertido para um modal único, com listagem e cards como conteúdo principal. O lifecycle permanece separado:

`BRAND_LIFECYCLE_NEEDS_SDD`

Não há contrato atual suficiente para implementar standby, arquivamento ou exclusão definitiva.

## Formulário

- Componente canônico: `modules/conta/agency-brand-create-modal.tsx`.
- Campos preservados: nome da Marca, website, nicho operacional e localização/área de atuação.
- O mesmo modal é aberto por `Cadastrar Marca` e `Cadastrar primeira Marca`.
- Sucesso só ocorre após resposta real da rota server-side; o modal fecha e a listagem é recarregada pela navegação.
- Erro mantém o modal e os valores digitados.
- O cadastro não cria BrandDNA, pipeline editorial ou membership artificial.

## Auditoria de legado

- **REUTILIZADO:** `app/api/agencies/[agencyRef]/brands/route.ts`, `lib/server/agency-workspace.ts` e `lib/server/admin-brand-creation.ts` continuam sendo o caminho canônico de persistência.
- **REUTILIZADO:** `modules/marca/brand-page.tsx` mantém a edição operacional dentro da Marca por `?secao=configuracoes`; `?secao=equipe` permanece o caminho de colaboradores.
- **LEGADO AINDA CONSUMIDO:** `app/api/marcas/route.ts` e `modules/marca/brand-page.tsx` continuam necessários para edição operacional da Marca e consumidores existentes. Não foram removidos.
- **ÓRFÃO CONFIRMADO:** o formulário histórico completo de `app/(admin)/admin/marcas/page.tsx` foi encontrado no commit `96ed581`; no checkout atual essa rota apenas redireciona para o painel administrativo. Uploads, silos dinâmicos e diretrizes legadas não foram restaurados no modal.
- **PENDENTE DE DECISÃO:** eventual limpeza do endpoint global de DELETE e da edição de diretrizes legadas. Esta tarefa não removeu código antigo.

## Lifecycle encontrado

`public.marcas.status` aceita somente `active`, `suspended` e `inactive`, conforme `0005_tenant_ownership_and_rls.sql`. O vínculo `agency_brands.status` aceita `active`, `inactive` e `removed`, conforme `0014_agency_foundation.sql`.

Não foi encontrado estado canônico `standby`, `paused` ou `archived` para Marca. `suspended` existe, mas seus consumidores e semântica atuais não autorizam reinterpretá-lo automaticamente como standby.

O banco possui proteção contra exclusão de Marca com conteúdo publicado em `0001_protect_publicado.sql`, mas isso não constitui contrato de exclusão segura de todas as dependências. Não foi criado botão de DELETE na gestão da Agência.

## Ações dos cards

O menu secundário oferece somente:

- editar cadastro, pela rota canônica da Marca;
- administrar colaboradores, pela rota canônica existente.

Permissões da Agência ficam indicadas como próxima fase porque não há tela própria autorizada nesta tarefa. Standby, arquivamento e exclusão não são oferecidos até existir SDD, contrato de estados, guards, dependências, RLS e confirmação forte.

## Campos do formulário histórico

- Nome, website, nicho e localização: cadastro operacional inicial.
- Diretrizes e declarações: dados legados da Marca; não equivalem a BrandDNA aprovado.
- Uploads de TXT/MD/DOCX: materiais/documentos e extração legada.
- Silos dinâmicos: estrutura editorial/legada, fora do cadastro inicial.
- Propósito, público, posicionamento, voz, keywords e SERP: BrandDNA/estratégia/editorial, fora do modal.

## Validação

- 41 testes direcionados passaram.
- TypeScript passou.
- ESLint focalizado passou sem erros; testes ignorados pelo padrão global foram validados pelo runner de testes.
- `git diff --check` passou; os avisos são somente conversão LF/CRLF do checkout.
- Build e smoke visual autenticado ainda são gates separados.
- Nenhuma migration, SQL remoto, alteração de dados, provider, e-mail, commit, push ou deploy foi executado.
