# Spec — Marca

## Regra compartilhada de Site/Sitemap

Candidates observadas no Site carregam `sourceFields`, coerência de slug, papel sugerido e `qualificationStatus`, mas sempre `isKgr: false`. A aba não confirma principal, volume, intenção ou aprovação; a importação explícita para o Minerador grava a origem como `bruto` e preserva a marca.
## 1. Propósito
Manter o contexto por marca que delimita todo o pipeline. **Verificado no código.**
## 2. Responsabilidades
O contexto canônico vem de `/{brandRef}` e é validado no servidor; a seleção local é apenas compatibilidade de navegação legada.
Selecionar marca, editar contexto e convidar colaboradores autorizados.
## 3. Fora de responsabilidade
Não classifica keywords nem aprova artefatos editoriais.
## 4. Entidades
Marca, silos existentes, convite, papel e BrandDNA.
## 5. Jornada
Usuário autenticado seleciona marca e consulta/edita dados em `/{brandRef}/`.
## 6. Regras de negócio
Cliente é limitado à sua marca; convites são validados pelo servidor. **Verificado no código.**
## 7. Estados
Carregando perfil/marca, pronto, salvando, sucesso e erro.
## 8. Ações
Selecionar, atualizar marca e criar convite.
## 9. Entradas
Sessão, marca, localização, nicho, diretrizes e silos.
## 10. Saídas
Contexto de marca para os módulos seguintes.
## 11. Contratos com outros módulos
`BrandProvider` e snapshot editorial recebem a marca selecionada.
## 12. Proteções
Isolamento por `marca_id`; troca de marca por cliente é bloqueada no provider.
## 13. Casos de borda
Sem sessão, sem marca e configuração server-side ausente.
## 14. Arquitetura técnica atual aprovada
`BrandPage`, `BrandProvider`, `/api/marcas`, `/api/marca/brand-dna` e `/api/editorial/invitations`. BrandDNA usa `BrandDNASchema`/`VersionedBrandDNASchema`, versões imutáveis e eventos de aprovação humana. **Verificado no código; persistência remota depende da migration 0002 não aplicada nesta tarefa.**
## 15. Critérios de aceite
Dados persistem somente para a marca autorizada.
## 16. Fora do escopo atual
Persistência própria de materiais, Skills e prompts; gestão completa de memberships, permissões, aceite e revogação; ponte oficial de `activeBrandDnaVersionId`.
## 17. Arquivos pertencentes ao módulo
`app/(brand)/[brandRef]/page.tsx`, `app/api/marca/**`, `components/marca/**`, `lib/marca/**` e a renderização da seção Marca em `components/product-shell.tsx`.
## 18. Arquivos compartilhados consumidos
`components/brand-context.tsx`, `components/editorial-pipeline-context.tsx`.
## 19. Arquivos proibidos sem autorização
Migrations e telas de Minerador/Arquiteto.
## 20. Aba Site e Sitemap

A tela `/{brandRef}/?secao=site` concentra a configuracao do endereco principal da marca. O valor e normalizado localmente para `http`/`https`, salvo pelo endpoint legado `/api/marcas` com os demais campos preservados e nao e confundido com BrandDNA.

A implementação local também oferece ações explícitas de Site/Sitemap para preview, catálogo, verificação e importação seletiva, sempre brand-scoped, sem sincronização automática ao carregar. A migration 0004, persistência remota dedicada, confirmação online autenticada e provider externo continuam pendentes; nenhuma dessas pendências autoriza inferir publicação, canonical, DNA ou aprovação.

## 21. Atualização do fluxo Site e Sitemap — 2026-07-21

O fluxo aprovado no SDD `propostas/site-e-sitemap.md` agora possui implementação local e APIs server-side para cadastrar, testar e sincronizar sitemaps, manter catálogo deduplicado, verificar páginas por ação explícita, extrair candidatos determinísticos e preparar importação seletiva. A aba não sincroniza nem verifica ao carregar.

O catálogo local é isolado por `brandId`, preserva ausências como `stale` e não cria DNA, plano, documento editorial ou aprovação. Keywords enviadas passam pelo destino existente do Minerador, são idempotentes e entram sem volume, KGR, intenção ou aprovação inventados. A persistência remota dedicada está descrita na migration 0004, ainda não aplicada.


## 22. Regra permanente de navegação e revisão Site e Sitemap

A seção Site e Sitemap usa `/{brandRef}/?secao=site` como fonte de verdade. Painéis auxiliares podem ser identificados por `painel=importacao` ou `painel=catalogo`; ações locais não podem remover `secao=site` nem forçar reload ou refresh global.

A revisão de importação é visível, começa sem autorização implícita e mantém seleções independentes para keywords e conteúdos. A confirmação de keywords é distinta do registro de conteúdo legado. Conteúdo legado não é enviado ao Minerador e não cria DNA editorial.

O estado local do workspace é isolado por marca e o carregamento não pode depender da URL do site, pois salvar o endereço não deve apagar catálogo, candidatos, filtros, prévias, seleções, lotes ou eventos.
## 23. Site/Sitemap — importação real para o Minerador

- A lista de destino deve vir de `listas_kgr` filtrada pela marca ativa; nenhuma lista local pode representar a lista do Minerador.
- A confirmação usa `importSiteKeywordsToMinerador` e `keywords_kgr` como fonte única de identidade, deduplicação e ID técnico.
- Cada nova keyword entra como `bruto`, com texto, `lista_id` e proveniência `analise_semantica.site_origin`; métricas, intenção, KGR, DNA e aprovação não são inventados.
- O lote local só recebe resultado final depois da resposta persistida; resposta sem `persisted: true` é erro explícito e não pode produzir sucesso visual.
- A principal sugerida é apenas uma inferência determinística de convergência entre slug, H1 e título; confirmação permanece humana.
