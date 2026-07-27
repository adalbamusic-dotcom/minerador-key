# Navegação e Interfaces do Pipeline Editorial

Data: 2026-07-11

## Navegação adotada

A área `Inteligência Editorial` complementa Perfil, Minerador e Arquiteto. Ela
usa `/inteligencia/[etapa]` com as etapas `marca`, `keywords`, `artigos`,
`silos`, `serp`, `planejamento` e `documentos`. `/inteligencia` redireciona
para a primeira etapa. Não foi criada Biblioteca Editorial porque o projeto
não possui uma estrutura anterior que pudesse ser reutilizada sem ampliar a
sprint.

O menu principal continua sendo `AppMenu`. Administradores mantêm o seletor de
marca e a Administração; clientes veem apenas a marca vinculada. A autorização
não depende do menu: o endpoint editorial valida sessão e marca antes de ler os
dados.

## Componentes e estado

`EditorialPipelineNav` mostra a etapa atual e estados derivados dos dados
reais. Badges, estados vazios, aviso de decisão humana, proveniência e aviso de
provedor não configurado são compartilhados.

`EditorialPipelineProvider` fica dentro do `BrandProvider` e separa o workspace
local por marca. ArticleDNA e SiloDNA aceitos no Arquiteto ficam disponíveis nas
novas páginas durante navegação client-side. SERP, evidências, ContentPlan e
ContentDocument simulados também ficam nesse provider. Nenhum desses dados é
gravado em `localStorage`, `sessionStorage` ou Supabase; um reload os descarta.

## Dados reais conectados

O endpoint `GET /api/inteligencia?marcaId=...` é somente leitura, seleciona
campos explícitos e carrega:

- cadastro da marca;
- silos de `listas_kgr`;
- keywords vinculadas aos silos da marca;
- briefings vinculados aos mesmos silos.

Keywords sem lista não são atribuídas à marca por inferência. O cadastro e
`dna_diretrizes` são mostrados como fonte legada, não como BrandDNA aprovado.
O adaptador de KeywordDNA legado expõe somente campos realmente encontrados;
ausências aparecem como `Não informado`.

Artigos são derivados do motor determinístico atual. Silos usam as listas
reais. Versões locais aparecem quando foram geradas e aceitas no Arquiteto.
Conteúdos publicados exibem a proteção estrutural já existente.

## Dados temporários e provedores

Foram definidos contratos substituíveis para SERP, similaridade externa e
evidências de produto. Nenhum fornecedor, chave ou chamada externa foi
adicionado. Os mocks são validados pelos mesmos contratos e só são criados
quando a pessoa aciona uma ação `Simular`. Todo resultado simulado recebe o
selo permanente `Dados simulados` e não altera o progresso real do pipeline.

O Guardião separa conflito interno, similaridade externa e originalidade
estratégica. A divergência de SERP exige decisão humana e não modifica um DNA.
O documento demonstra os blocos existentes, mais `product_block` e
`comparison`, sempre com proveniência compacta.

## Limitações e próximo passo

- Não existe persistência de versões, eventos ou decisões locais.
- Não existe coleta real de SERP, páginas concorrentes ou produtos.
- Similaridade externa é apenas contrato e estado visual.
- ContentPlan e ContentDocument ainda são demonstrações locais.
- O documento não possui editor Tiptap nem escrita por seção.
- A página monolítica do Arquiteto não foi refatorada além da integração do
  estado compartilhado e do foco de retorno.

Próxima sprint recomendada: comparar provedores de SERP e implementar um único
adaptador real em modo controlado, com custo, localidade, idioma, dispositivo,
snapshot imutável, hash e revisão humana. Só depois validar coleta externa e
evidências de produto antes de iniciar o editor visual.
