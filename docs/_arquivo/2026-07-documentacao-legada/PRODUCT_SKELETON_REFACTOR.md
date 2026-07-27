# Reorganização Oficial do Produto

Data: 2026-07-11
Estado: implementação concluída localmente

## Estado anterior

O produto possuía as rotas principais `/perfil`, `/minerador`, `/arquiteto` e
`/admin/marcas`. O menu era um dropdown compacto e expunha uma seção provisória
“Inteligência Editorial” com sete páginas técnicas em
`/inteligencia/[etapa]`: marca, keywords, artigos, silos, SERP, planejamento e
documentos.

`/perfil` misturava cadastro da empresa e diretrizes da marca. O Minerador já
exibia `analise_semantica` na expansão da keyword. O Arquiteto já possuía
acordeões de KeywordDNA, edição de briefing, geração de ArticleDNA/SiloDNA,
proteção de publicados e aceite local. As páginas provisórias reutilizavam os
contratos versionados, a leitura autorizada de `/api/inteligencia`, badges,
proveniência, mocks de SERP/produto e o `EditorialPipelineProvider`.

Dados reais: marca, listas/silos, keywords vinculadas e briefings. Dados locais:
ArticleDNA, SiloDNA, eventos e contexto selecionado. Dados simulados: SERP,
ProductEvidenceDNA, ContentPlan e ContentDocument, sempre identificados.

Limitações: reload descarta decisões locais; não existem equipe, permissões
delegadas, Skills, fontes externas, links planejados ou publicações persistidas;
não há APIs externas, Tiptap ou integração de publicação.

## Nova arquitetura planejada

| Módulo | Entidade principal | Responsabilidade |
|---|---|---|
| Admin | plataforma/empresa | empresas, acesso delegado, consumo e falhas |
| Marca | organização | BrandDNA, materiais, Skills, equipe e configuração |
| Minerador | keyword | pesquisa, KeywordDNA e aprovação |
| Arquiteto | artigo/silo | arquitetura, ArticleDNA e SiloDNA |
| Radar | pesquisa/evidência | SERP, produtos, fontes e originalidade |
| Planejador | ContentPlan | ordem concreta, links, fontes, prompts e imagens |
| Redator | ContentDocument | conteúdo e Guardião por seção |
| Publicações | conteúdo | biblioteca, fila, publicados e atualizações |
| Conta | usuário | identidade, autenticação e preferências pessoais |

## Mapa de migração

| Origem | Destino | Decisão |
|---|---|---|
| `/perfil` | `/marca?secao=configuracoes` | Reaproveitar o formulário existente |
| `/inteligencia/marca` | `/marca` | Extrair visão da marca |
| `/inteligencia/keywords` | `/minerador` | Incorporar painel de KeywordDNA |
| `/inteligencia/artigos` | `/arquiteto` | Incorporar resumo de ArticleDNA |
| `/inteligencia/silos` | `/arquiteto?painel=silo` | Incorporar resumo de SiloDNA |
| `/inteligencia/serp` | `/radar` | Reaproveitar SERP/evidências |
| `/inteligencia/planejamento` | `/planejador` | Reaproveitar ContentPlan |
| `/inteligencia/documentos` | `/redator` | Reaproveitar ContentDocument |

## Permissões e compatibilidade

Administração só será visível e acessível a administradores. APIs continuarão
validando sessão e marca junto à fonte dos dados. Como ainda não existe modelo
persistido de equipe, o papel `cliente` vinculado será tratado como responsável
legado e manterá a edição já existente da própria marca. Papéis futuros e
acessos delegados serão somente contratos e estados locais nesta sprint.

## Registro de arquivos

### Criados

- `components/product-shell.tsx`: navegação lateral oficial.
- `components/product/operational-pages.tsx`: Marca, Radar, Planejador,
  Redator, Publicações, Conta e Admin.
- `components/editorial/dna-panels.tsx`: KeywordDNA, ArticleDNA e SiloDNA
  incorporados às planilhas.
- Rotas curtas `/marca`, `/conta`, `/radar`, `/planejador`, `/redator`,
  `/publicacoes` e `/admin`.
- `lib/editorial/operational-contracts.ts`: contratos locais de Skills,
  prompts, materiais, acesso delegado, links, âncoras, fontes, Guardião,
  imagens e publicações.

### Alterados

- Layouts de workspace e admin passaram a usar o `ProductShell`.
- `AppMenu` foi reduzido a compatibilidade de contadores; não contém mais
  navegação paralela.
- O provider editorial passou a guardar por marca contexto operacional,
  links, fontes, achados e publicações locais.
- Minerador passou a mostrar KeywordDNA estruturado na expansão da linha.
- Arquiteto passou a mostrar ArticleDNA no acordeão e SiloDNA no cabeçalho.
- Os mocks passaram a gerar links, âncoras, fonte sem URL inventada, achado do
  Guardião e registro de publicação tipado.

### Movidos ou incorporados

- O cadastro de `/perfil` foi incorporado às Configurações de `/marca`.
- Marca, SERP, Planejamento e Documento deixaram o componente técnico e foram
  incorporados respectivamente a Marca, Radar, Planejador e Redator.
- As visualizações de keywords, artigos e silos foram incorporadas às
  planilhas existentes.

### Descontinuados e removidos

- `components/editorial/editorial-stage-page.tsx`: substituído pelas páginas
  operacionais; nenhum dado ou contrato foi removido.
- `EditorialPipelineNav`: substituído pelo fluxo oficial do menu lateral.
- `components/navbar.tsx`: substituído pelo `ProductShell`; nenhum import
  permaneceu.
- `loading.tsx` e `error.tsx` da rota técnica: desnecessários porque a rota
  agora redireciona imediatamente.

Para desfazer, restaura-se o componente de etapas, o Navbar e os arquivos de
rota anteriores e remove-se o `ProductShell` dos layouts. Os contratos e o
provider podem permanecer, pois são compatíveis com o motor estratégico.

### Mantidos temporariamente

- `/api/inteligencia` permanece como nome técnico do snapshot somente leitura;
  não aparece no produto.
- `AppMenu` permanece como adaptador mínimo porque Minerador, Arquiteto e Admin
  ainda o importam para contadores/cabeçalhos.
- `/inteligencia/[etapa]` permanece apenas para redirects de compatibilidade.
- A página monolítica do Arquiteto e a planilha do Minerador mantêm suas dívidas
  legadas fora dos pontos diretamente integrados.

## Decisões iniciais

- DNAs permanecem contratos internos; não são itens do menu.
- O shell será lateral, recolhível e persistente entre rotas do App Router.
- `/inteligencia` será apenas compatibilidade, sem implementação paralela.
- Contratos operacionais serão camadas separadas dos DNAs imutáveis.
- Nenhuma escrita remota, migration ou integração externa será criada.

## Estado final por módulo

- **Marca:** visão geral, BrandDNA legado explícito, materiais, Skills/prompts,
  equipe futura e configuração existente. O cliente vinculado mantém edição
  como responsável legado.
- **Minerador:** KeywordDNA aparece dentro da expansão da keyword, com versão,
  origem e proveniência.
- **Arquiteto:** ArticleDNA e proteção de publicado aparecem no artigo;
  SiloDNA aparece como resumo compacto no silo; artigo versionado segue ao
  Radar.
- **Radar:** lista artigos aceitos, permite simulação explícita de SERP e exibe
  fontes externas sem inventar URL.
- **Planejador:** exibe ContentPlan e intenções de links com âncoras candidatas.
- **Redator:** mantém fundamentos, documento e Guardião, incluindo avaliação
  local de âncora.
- **Publicações:** possui Biblioteca, Fila, Publicados e Atualizações; dados
  reais e simulados permanecem identificados.
- **Conta:** mostra identidade da sessão sem permitir alterações da marca.
- **Admin:** possui visão geral local e acesso ao gerenciador existente; o
  layout exige perfil administrador.

## Limitações e dívidas mantidas

- Estado operacional e permissões futuras não persistem.
- Equipe, acesso delegado, Skills e materiais são apenas contratos/estados.
- SERP, evidências, fontes e publicação não possuem integração real.
- Conta não altera senha, sessões ou MFA.
- Redator não possui Tiptap nem escrita por IA.
- A edição de marca preserva o endpoint legado e o papel `cliente`; a futura
  persistência de equipe deverá substituir essa compatibilidade.
- Avisos legados de lint do Minerador e Arquiteto não foram transformados em
  objetivo da sprint.

## Próximo passo recomendado

Persistir primeiro equipe e permissões delegadas, porque isso remove a
compatibilidade ampla do papel `cliente`. Depois, implementar um provedor real
de SERP em modo controlado e transformar as evidências aprovadas em
OperationalContentPlan antes de iniciar o editor Tiptap.
