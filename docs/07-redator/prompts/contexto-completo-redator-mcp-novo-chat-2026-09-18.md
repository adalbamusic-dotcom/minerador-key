# Prompt de contexto completo — Redator, MCP e integração da Agência

Use este documento como contexto inicial para um novo chat de arquitetura, auditoria e implementação do Redator e do MCP do Minerador Key.

## Papel do novo agente

Você está trabalhando no repositório:

`C:\Users\scalb\Documentos\adalba-pro\minerador-key`

O módulo proprietário da produção é o **Redator**. A conexão e a governança do MCP pertencem à **Agência**. Minerador, Arquiteto e Radar são módulos anteriores, com contratos já estabelecidos, e não devem ser alterados neste corte sem dependência técnica comprovada, SDD e autorização específica.

Antes de editar qualquer arquivo, leia:

- `AGENTS.md`;
- `docs/00-produto/invariantes.md`;
- `docs/00-produto/glossario.md`;
- `docs/00-produto/fluxo-oficial.md`;
- `docs/00-produto/pipeline-editorial-papeis-handoffs.md`;
- `docs/compartilhado/regras-de-trabalho-e-documentacao.md`;
- `docs/compartilhado/sistema-visual.md`;
- `docs/07-redator/spec.md`;
- `docs/07-redator/estado-atual.md`;
- `docs/07-redator/backlog.md`;
- `docs/07-redator/relatorio-mcp-e-revisao-de-produto-2026-09-18.md`;
- `docs/07-redator/propostas/sdd-redesign-redator-mcp-agencia-2026-09-18.md`.

Use a precedência canônica do repositório: invariantes e ADRs, depois SDD, spec, comportamento confirmado no código, estado atual, backlog e pareceres.

## Decisão de produto

O Redator é uma estação de **realização editorial**. Ele não é um formulário para o usuário planejar um roteiro ou carrossel e não é uma tela para cadastrar credenciais de IA.

O fluxo desejado é:

```text
Marca → Minerador → Arquiteto → Radar → Redator → Publicações
```

O Radar já deve entregar o pacote de pesquisa e decisão necessário para a redação. O Planejador pode existir como área futura de planejamento de marca, produtos, serviços e campanhas, mas não pode bloquear a passagem de um pacote completo do Radar para o Redator.

O Redator deve receber e transformar esse pacote em:

1. artigo final;
2. roteiro com storyboard;
3. carrossel;
4. capa e imagens de respiro;
5. imagens de cenas e slides;
6. metadados, links, chamadas e instruções editoriais;
7. pacote final para Publicações e pós-produção.

O usuário quer que a IA possa operar esse trabalho por ChatGPT, Claude ou outro cliente autorizado via MCP, mas a IA não deve substituir a autoridade da plataforma nem aprovar artefatos estruturais.

## O que o pacote do Radar fornece

O pacote de entrada pode conter, conforme o artigo:

- ArticleDNA canônico;
- KeywordDNA e referências das keywords;
- SiloDNA e SiloPage;
- InternalLinkGraph;
- SERP e snapshots;
- evidências, fontes e concorrentes;
- intenção de busca e formato editorial;
- orientação semântica e estrutural;
- oportunidades de links internos e externos;
- evidências de especialista e de marca;
- pendências, lacunas e conflitos;
- metadados e restrições preservadas.

O Redator deve interpretar esses dados e produzir o conteúdo. Não deve reescrever silenciosamente ArticleDNA, KeywordDNA, SiloDNA, InternalLinkGraph, SERP ou decisões humanas anteriores. Se houver conflito, deve sinalizar para revisão.

## O que já existe tecnicamente

A fundação técnica do MCP já foi implementada e deve ser auditada antes de qualquer substituição:

- importação direta do Radar sem exigir ContentPlan;
- `ContentDocument` v2 com dossiê do Radar;
- entregáveis derivados de roteiro e carrossel;
- prompts e ativos de imagem separados;
- delegações MCP por ator, agência e marca;
- escopo e revogação server-side;
- locks otimistas;
- versões imutáveis e hashes;
- readback remoto;
- gravação atômica de artigo, entregáveis e ativos;
- endpoint local `/api/mcp/redator`;
- ferramentas de leitura de documento, briefing, Guardião, entregáveis, prompts e mídia;
- upload e anexação de ativos;
- auditoria das chamadas;
- migrations já aplicadas para fundamento multiformato, delegações, gravação atômica de entregáveis e rascunho atômico de artigo.

Arquivos técnicos relevantes:

- `lib/redator/multiformat-contracts.ts`;
- `lib/server/writer-deliverables.ts`;
- `lib/server/writer-mcp-delegation.ts`;
- `app/api/mcp/redator/route.ts`;
- `app/api/redator/deliverables/route.ts`;
- `app/api/redator/mcp-delegations/route.ts`;
- `app/api/redator/media-upload/route.ts`;
- `modules/redator/writer-derived-environment.tsx`;
- `modules/redator/writer-mcp-connections.tsx`;
- `components/editorial/professional-writer.tsx`.

O MCP local foi testado com credencial temporária no Supabase real: leitura do perfil, documento e dossiê; depois a credencial foi revogada. Nenhum artigo foi alterado nesse smoke test.

Status técnico já verificado anteriormente:

- testes direcionados do Redator: aprovados;
- testes MCP: aprovados;
- TypeScript: aprovado;
- build: aprovado;
- lint direcionado: aprovado;
- testes amplos ainda possuem falhas pré-existentes em outros módulos e não devem ser atribuídos automaticamente a esta frente.

## O problema atual da interface

As telas atuais de Roteiro e Carrossel mostram formulários com campos como:

- Título;
- Canal;
- Objetivo;
- Público;
- Duração;
- Abertura;
- Legenda;
- Chamada final;
- cenas ou slides vazios;
- prompts e imagens soltos em uma seção separada.

Isso não representa o objetivo do produto. O usuário não quer preencher um briefing antes de a IA trabalhar. Ele quer abrir o resultado produzido, revisar, retocar, substituir imagens, ajustar o texto e enviar o pacote pronto para Publicações.

O campo `Canal` não deve ser obrigatório nem fazer parte do centro do contrato. A plataforma não publicará diretamente em YouTube, Instagram ou outras redes nesta etapa. O material será entregue para pós-produção.

A seção “Prompts e imagens” também precisa mudar de posição conceitual. Um prompt não é uma imagem criada. Cada prompt e cada ativo devem ficar vinculados ao bloco que orientam:

- bloco ou seção do artigo;
- cena do roteiro;
- slide do carrossel;
- capa ou imagem de respiro.

Cada ativo precisa ter estado, hash, alt text, proveniência, vínculo e ações de revisão.

## Fronteira correta entre Agência, Redator e Publicações

### Agência — Integrações

A página:

`/agencias/{agencyRef}/integracoes`

é a autoridade para:

- conectar ChatGPT, Claude ou outro cliente MCP;
- administrar OAuth e consentimento;
- escolher escopos de leitura e escrita;
- associar a conexão à agência e às marcas permitidas;
- revogar credenciais;
- acompanhar expiração, último uso, auditoria e saúde do endpoint;
- limitar o que a IA pode fazer.

Não deve existir uma conta global de IA compartilhada entre agências. Cada agência deve controlar suas próprias conexões e autorizações.

### Redator

O Redator deve ter três ambientes de produção:

**Artigo** — documento completo com texto, estrutura, SEO, links, metadados, capa, respiros, imagens e revisão.

**Roteiro** — roteiro já produzido com cenas, narração, direção visual, storyboard, duração quando aplicável e imagens associadas. Não deve exigir canal.

**Carrossel** — sequência de slides já produzidos com texto, hierarquia visual, CTA, imagens e alt text. Não deve exigir canal.

O Redator pode oferecer ferramentas para:

- retocar texto;
- regenerar ou substituir uma imagem;
- anexar arquivo gerado no ChatGPT ou Claude;
- reorganizar blocos, cenas ou slides;
- editar alt text;
- revisar prompts;
- comparar versões;
- salvar rascunho;
- preparar envio para Publicações.

### Publicações

Publicações recebe um pacote editorial contendo:

- documento do artigo, roteiro ou carrossel;
- versões e hashes;
- imagens e seus vínculos;
- prompts e proveniência;
- metadados;
- links;
- alt text;
- pendências ou avisos;
- formato de exportação, como Markdown, HTML, DOCX ou PDF quando implementado.

Publicações é a etapa de pós-produção. O Redator não deve publicar diretamente em redes sociais.

## O que o MCP é e o que não é

MCP é o protocolo que permite a um cliente de IA chamar ferramentas autorizadas do Redator. Ele é uma porta segura para a IA trabalhar dentro do tenant correto.

O MCP deve permitir que a IA:

- leia o pacote do Radar;
- analise evidências, objetivos, intenção e diretrizes;
- escreva o artigo;
- produza roteiro e storyboard;
- produza carrossel;
- escreva prompts de imagens;
- anexar imagens geradas fora da plataforma;
- salvar rascunhos e versões;
- revisar e montar o pacote para Publicações.

O MCP não pode:

- aprovar ArticleDNA, SiloDNA ou InternalLinkGraph;
- alterar a principal ou o slug sem autoridade do Arquiteto;
- inventar evidências, fontes, especialistas, links ou produtos;
- publicar externamente;
- apagar documentos ou versões;
- trocar marca ou agência;
- contornar locks, escopos, readback ou histórico;
- tratar prompt como prova de imagem gerada.

Para conexão remota, audite a implementação com base na documentação oficial de servidor MCP e autenticação OAuth 2.1/PKCE da OpenAI:

- https://developers.openai.com/pt-BR/plugins/build/mcp-server
- https://developers.openai.com/pt-BR/plugins/build/auth

O endpoint local atual não deve ser apresentado como conexão remota de ChatGPT ou Claude pronta. É necessário HTTPS, autenticação, consentimento, escopo e associação de tenant.

## Contratos e estados

Separar sempre:

1. estado do artefato estrutural;
2. estado de produção do conteúdo;
3. estado de revisão;
4. estado de entrega a Publicações;
5. estado de publicação externa.

Exemplo válido:

```text
ArticleDNA: aprovado
SERP: vigente
ContentDocument: em produção
Roteiro: revisão necessária
Carrossel: salvo
Publicações: não enviado
Publicação externa: não iniciado
```

O conteúdo só pode ser marcado como pronto para Publicações depois de:

`validar origem → validar referências → verificar pendências → salvar versão → readback remoto → montar pacote → readback de Publicações`.

Sucesso de uma chamada HTTP não é confirmação suficiente.

## Regras de segurança e governança

- A autorização é server-side.
- A identidade canônica é agência, marca e ator autenticado.
- Nenhum token bruto fica no navegador, localStorage, prompt ou log.
- O cliente não decide a marca nem o escopo.
- Dados de agências e marcas nunca se misturam.
- Escritas usam lock, hash, versionamento e readback.
- Operações repetidas devem ser idempotentes.
- A IA não aprova nem publica.
- Não criar API de provedor de modelo ou imagem apenas para preencher a interface.
- Não tocar Minerador, Arquiteto ou Radar sem dependência comprovada.
- Não executar migration, SQL remoto, deploy, push, limpeza ou homologação real sem autorização específica do usuário.

## Tarefa para o novo agente

Faça primeiro uma auditoria completa, sem implementar o redesign imediatamente.

Mapeie:

1. Agência → conexão → OAuth/delegação → MCP → Redator → Publicações;
2. rotas, tabelas, migrations, schemas e serviços envolvidos;
3. consumidores e contratos preservados;
4. divergências entre a interface atual e o produto desejado;
5. campos que são briefing legado e campos que já representam conteúdo final;
6. vínculo de prompts e ativos às cenas, slides e blocos;
7. caminho de envio a Publicações;
8. readback, lock, hash e idempotência;
9. limitações do endpoint MCP local;
10. necessidade real de migration.

Classifique cada achado como:

- código;
- contrato;
- banco;
- UI;
- autenticação;
- autorização;
- readback;
- documentação;
- pendência de homologação.

Depois entregue uma proposta mínima e aditiva, incluindo:

- mapa de arquivos a alterar;
- consumidores preservados;
- compatibilidade com dados legados;
- necessidade ou não de migration;
- rollback;
- testes automatizados;
- critérios de homologação manual;
- separação entre o que já está verificado e o que ainda é hipótese.

Não remover a aba ou tabelas atuais antes de provar paridade e compatibilidade. Não tratar o documento como autorização para alterar o banco remoto. Se houver mudança estrutural, escreva ou atualize uma SDD antes do código.

## Critérios de conclusão

Só considerar a frente concluída quando:

- a conexão MCP for administrada pela Agência;
- o Redator não mantiver uma segunda tela de credenciais;
- Artigo, Roteiro e Carrossel mostrarem trabalho produzido;
- `Canal` não for obrigatório nem central;
- imagens estiverem vinculadas aos blocos, cenas ou slides;
- o MCP puder ler e salvar dentro do escopo correto;
- cada escrita tiver lock, hash e readback;
- Publicações receber o pacote completo sem ContentPlan;
- Radar, Arquiteto e Minerador continuarem preservados;
- F5 e outra sessão mostrarem o mesmo estado remoto;
- a homologação manual do usuário ainda estiver explicitamente separada dos testes automatizados.

Ao responder, diferencie sempre:

```ini
VERIFICADO_NO_CODIGO = YES/NO
CONFIRMADO_POR_TESTE = YES/NO
PERSISTENCIA_REMOTA = YES/NO
VALIDADO_MANUALMENTE = YES/NO
MIGRATION_NECESSARIA = YES/NO/EM_AUDITORIA
MCP_REMOTO_HOMOLOGADO = YES/NO
PENDENCIAS = ...
```

Não declarar que o MCP está pronto apenas porque o endpoint local responde ou porque a tela renderiza. A conclusão exige contrato, autorização, persistência, readback e validação da interface.
