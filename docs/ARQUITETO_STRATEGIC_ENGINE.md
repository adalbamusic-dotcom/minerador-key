# Motor Estrategico do Arquiteto

Data: 2026-07-11

## Diagnostico da implementacao anterior

O Arquiteto fazia agrupamento dentro de `page.tsx`. O algoritmo removia stop
words, comparava sobreposicao lexical e usava publicados como ancoras. O limiar
era 50% para aproximar uma keyword de um publicado e 60% para unir keywords
novas. A principal era o publicado ou a keyword de maior volume. A hierarquia
dependia principalmente da primeira posicao do artigo no silo.

Os grupos viviam apenas no estado React. Mover, separar, desfazer e refazer eram
operacoes locais e se perdiam ao recarregar. Os dados semanticos disponiveis
vinham de `keywords_kgr.analise_semantica`. Publicados, undo/redo e a tabela
visual eram aproveitaveis.

Os botoes Revalidar Estrutura, Gerar DNA dos Artigos e Gerar DNA dos Silos
apenas aguardavam um `setTimeout`. As rotas antigas de clusterizacao e
revalidacao nao estavam ligadas a pagina e aceitavam JSON da IA sem contrato
runtime completo.

## Implementacao atual

O motor deterministico esta em `lib/arquiteto/` e produz grupos provisorios com
IDs estaveis, evidencias, confianca, alertas, principal sugerida, papeis e
hierarquia. A afinidade usa:

- 50% similaridade lexical;
- 20% compatibilidade de intencao;
- 20% entidades compartilhadas;
- 10% silo existente.

Volume e KGR influenciam apenas a ordenacao da principal. Um publicado sempre
permanece ancora. Intencoes informacional e transacional nao sao unidas
automaticamente.

O motor de conflitos aponta variacoes quase identicas, intencoes incompatíveis,
principal duplicada, artigos sobrepostos e fronteiras de silo duvidosas. Toda
saida pede decisao humana.

## Revisao por IA

As rotas estrategicas usam um unico cliente server-side para DeepSeek ou
OpenRouter. O payload e limitado, a sessao e obrigatoria e a resposta precisa
passar pelos schemas Zod. JSON invalido, incompleto, vazio, timeout ou erro do
provedor sao rejeitados. Nenhuma dessas rotas possui chamadas de escrita ao
Supabase.

Os tres botoes agora executam servicos reais:

- Revalidar Estrutura envia todos os grupos e conflitos logicos;
- Gerar DNA dos Artigos exige artigos selecionados;
- Gerar DNA dos Silos usa os silos presentes na selecao.

As respostas aparecem num painel de revisao. Rejeitar descarta. Aceitar altera
somente o estado local; mudancas de estrutura continuam no historico de
undo/redo. DNAs aceitos recebem um evento humano local. Publicados nao mudam de
silo nem deixam de ser ancoras.

## Pipeline versionado e rastreavel

O contrato consolidado e:

`BrandDNA -> KeywordDNA -> ArticleDNA -> SiloDNA -> SERP/evidencias -> ContentPlan -> ContentDocument`

BrandDNA, KeywordDNA, ArticleDNA, SiloDNA e ContentPlan usam um envelope comum
imutavel. O envelope registra entidade, numero e ID da versao, versao anterior,
origem, motivo, autor, data e SHA-256 do JSON canonico do conteudo. Metadados
transitorios nao entram no hash.

O estado nao e editado no envelope. Eventos append-only registram `draft`,
`proposed`, `approved`, `rejected` e `superseded`. Uma proposta nao substitui a
aprovada. Quando uma sucessora e aprovada, ela recebe `approved` e somente entao
a anterior recebe `superseded`.

As camadas superiores guardam referencias compactas com `entityId`,
`versionId` e `contentHash`:

- ArticleDNA aponta para as versoes exatas dos KeywordDNAs;
- SiloDNA aponta para as versoes exatas dos ArticleDNAs;
- ContentPlan fixa BrandDNA, KeywordDNAs, ArticleDNA, SiloDNA, SERP,
  originalidade e evidencias utilizadas;
- ContentDocument aponta para o ContentPlan e registra proveniencia compacta
  por bloco, sem copiar DNAs inteiros.

O hidratador nunca troca uma referencia solicitada pela versao mais nova. Ele
detecta referencia ausente, rejeitada, desatualizada, hash divergente, conteudo
adulterado e ciclos. Entradas anteriores ao pipeline recebem IDs explicitos no
formato `legacy:<entityId>:v1`; isso e compatibilidade local, nao persistencia
fingida.

Classificacoes humanas aprovadas permanecem vigentes quando SERP ou evidencias
discordam. A divergencia gera conflito, diferencas e nova versao `proposed`.
Alteracoes de marca, silo, keyword principal, slug ou canonical de artigo
publicado viram alertas `published_immutable_field` e os valores publicados sao
preservados.

`ProductEvidenceDNA` possui apenas contrato e validacao nesta fase. Fonte e
confianca sao obrigatorias; coleta, persistencia e uso editorial ficam depois
da primeira implementacao e validacao da SERP.

## SERP, originalidade e Escritor

`SerpSnapshot` descreve resultados, tipos de pagina, intencao, formatos,
entidades, perguntas, padroes, lacunas e oportunidades. Nenhum scraping foi
implementado. `SerpArchitectureImpact` permite que uma futura analise confirme,
divida ou una grupos, troque principal, mude hierarquia, cancele artigo ou
transforme keyword em reforco, sempre com aprovacao humana.

A originalidade possui tres camadas:

1. conflitos internos, ja funcionais;
2. similaridade externa, aguardando paginas da SERP;
3. originalidade estrategica, baseada em diferenciacao e evidencias exigidas.

`ContentDocument` define heading, paragraph, list, table, quote, internal link,
CTA, image brief, note e source. O adaptador gera uma semente JSON compativel
com um futuro Tiptap, mas Tiptap e o editor visual nao foram instalados. A
escrita futura sera por secao, com estados planejado, escrevendo, em revisao e
aprovado.

## Limitacoes conscientes

- Sugestoes aceitas ainda nao persistem apos recarregar.
- O repositorio de versoes e eventos desta fase e local e em memoria; nao foi
  criada migration nem persistencia.
- Nao existe coleta de SERP nem comparacao textual externa.
- O Escritor e apenas contrato e adaptador, nao uma interface de documento.
- O algoritmo anterior permanece como fallback defensivo para entrada legada.
- Nao houve migration, escrita remota, exportacao, deploy ou integracao externa.

## Proximo passo recomendado

Implementar a coleta inicial de SERP como snapshots imutaveis, com fonte, data,
localidade e hash. A primeira integracao deve apenas gerar conflitos e propostas
versionadas, nunca trocar classificacoes aprovadas. Depois da validacao humana
dos impactos da SERP, implementar a coleta real de ProductEvidenceDNA, fechar o
ContentPlan e so entao iniciar o Escritor por secao em Tiptap.
