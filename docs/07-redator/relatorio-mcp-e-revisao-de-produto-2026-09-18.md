# Relatório — MCP da agência e função real do Redator

**Data:** 2026-09-18  
**Módulo proprietário:** Redator, com a conexão MCP pertencendo à Agência  
**Origem:** revisão do usuário a partir das telas do Redator e da página de Integrações da Agência  
**Estado:** diagnóstico e diretriz de redesign; a revisão visual ainda não foi implementada

## Decisão de produto

O Redator é uma estação de realização editorial. Ele recebe o pacote canônico do Radar, escreve o artigo, produz roteiros e carrosséis derivados, cria ou recebe as imagens, permite revisão e entrega os resultados à área de Publicações.

O Redator não é um formulário para planejar um roteiro ou carrossel. Objetivo, público, duração, canal e chamada final pertencem ao contexto editorial ou são decisões que o próprio Redator pode inferir e materializar durante a produção. Não devem aparecer como um conjunto de campos vazios que o usuário precisa preencher antes de começar.

O Planejador deixa de ser uma passagem obrigatória entre Radar e Redator. A rota canônica continua sendo:

```text
Marca → Minerador → Arquiteto → Radar → Redator → Publicações
```

O Planejador pode permanecer como área futura de planejamento inicial de marca, produtos, serviços e campanhas, mas não deve bloquear um pacote finalizado do Radar nem ser usado como autoridade para o conteúdo que o Redator já recebeu.

## O que foi implementado até agora

### Confirmado no código e no banco

- O Radar pode entregar diretamente um `ContentDocument` v2 sem `ContentPlan`.
- O dossiê canônico do Radar viaja com o documento, preservando ArticleDNA, KeywordDNA, SiloDNA, evidências, links, instruções e pendências.
- Roteiro e carrossel são entregáveis derivados com hash, lock, versão e vínculo ao documento do artigo.
- Prompts e arquivos de imagem ficam separados: `prompt_ready` não significa imagem gerada.
- O MCP local oferece leitura do documento, briefing, Guardião, roteiros/carrosséis, prompts e anexos.
- A escrita usa escopo, autorização server-side, lock otimista e readback.
- A nova gravação do rascunho do artigo também cria a versão imutável na mesma transação.
- O banco remoto recebeu as migrations do fundamento multiformato, delegações MCP, gravação atômica de entregáveis e gravação atômica de rascunho de artigo.
- A conexão local usa credencial delegada por ator, agência e marca, com hash, expiração, revogação, auditoria e limite de chamadas.
- O protocolo MCP foi testado localmente; uma credencial de leitura temporária leu o documento e o dossiê no Supabase real e depois foi revogada.

### Não concluído

- O OAuth do Supabase ainda está desativado; portanto a conexão de ChatGPT ou Claude pela internet ainda não está homologada.
- A conexão remota precisa de endpoint HTTPS, descoberta OAuth, consentimento e associação explícita entre usuário, agência e marca.
- A escrita MCP autenticada ainda não foi homologada de ponta a ponta com uma fixture própria.
- Roteiro e carrossel ainda aparecem como formulários de planejamento. Essa interface não representa o produto desejado.
- Os entregáveis ainda não estão apresentados como documentos finais prontos para Publicações.
- A vinculação de cada imagem a uma cena, slide ou bloco do artigo ainda é parcial.
- Não existe ainda exportação final documentada para DOCX/PDF com ativos e metadados associados.
- A aba `Conectar IA` no Redator administra uma credencial local de desenvolvimento. Isso não corresponde à fronteira de integração desejada.

## Diagnóstico das telas

As telas mostram quatro problemas funcionais, além de questões de acabamento:

1. `Canal`, `Objetivo`, `Público`, `Duração`, `Abertura`, `Legenda` e `Chamada final` aparecem como entradas manuais principais. O usuário precisa ver e editar o conteúdo produzido, não preencher um briefing antes de a IA trabalhar.
2. `Prompts e imagens` aparece como um formulário solto. O prompt deveria aparecer junto do bloco, cena ou slide que ele orienta, com a imagem produzida, estado da revisão, substituição e retoque.
3. `Conectar IA` aparece como uma aba operacional do Redator, embora credenciais, consentimento, escopos e revogação sejam governança da Agência.
4. O destino “Publicações” aparece como uma navegação, mas a tela não deixa claro que o resultado é um pacote editorial realizado, com documento, imagens, metadados e versões prontas para pós-produção.

A correção não é simplesmente apagar campos. É trocar o eixo da interface: de formulário de entrada para documento de trabalho e resultado produzido.

## Fronteiras definitivas

### Agência → Integrações

A página `/agencias/{agencyRef}/integracoes` é a dona da conexão MCP. Ela deve administrar:

- cliente autorizado e método de conexão;
- OAuth, consentimento e expiração;
- escopos de leitura e escrita;
- vínculo da conexão à agência e às marcas autorizadas;
- revogação, auditoria, último uso e limites;
- endpoint MCP e estado de saúde da conexão;
- indicação de que a IA está autorizada para produzir conteúdo no Redator.

Essa página não deve expor segredo bruto depois da emissão nem permitir que uma marca veja a conexão de outra agência.

### Redator

O Redator deve oferecer três ambientes de produção, todos baseados no pacote do Radar:

- **Artigo:** editor de documento com estrutura, texto, evidências, links, metadados, CTA, capa e respiros.
- **Roteiro:** documento de roteiro com cenas já produzidas, narração, direção visual, instruções técnicas, storyboard e imagens associadas. Não deve pedir canal.
- **Carrossel:** documento visual com slides já produzidos, títulos, textos, CTA, direção visual e imagens associadas. Não deve pedir canal.

Esses ambientes podem permitir retoque humano, regeneração de uma imagem, troca de arquivo, reorganização de bloco e revisão de texto. O resultado é um conteúdo editorial, não uma publicação direta em redes sociais.

### Publicações

Publicações recebe o pacote final de cada formato. O pacote pode conter documento HTML/Markdown estruturado, exportação DOCX/PDF, metadados SEO, imagens, prompts/proveniência, links e histórico de versões. A pós-produção acontece depois, fora da integração MCP inicial.

### Radar

O Radar permanece intocado neste corte. Continua dono da investigação, das evidências, da SERP, do dossiê e da entrega ao Redator. O Redator interpreta e realiza o conteúdo sem reescrever ArticleDNA, KeywordDNA, SiloDNA, InternalLinkGraph ou a decisão factual do Radar.

## Conceito correto do MCP

MCP é a porta padronizada pela qual ChatGPT, Claude ou outro cliente autorizado conversa com os serviços do Redator. Ele não é um segundo editor, não é uma conta global de IA e não deve ser uma aba de preenchimento do Redator.

O cliente de IA fica fora da plataforma. A plataforma mantém a identidade, a marca, a permissão, o dossiê, os documentos, os arquivos e o histórico. Cada chamada do MCP deve ser autorizada pelo servidor e limitada à agência e à marca da credencial.

O modelo pode:

- ler o documento e o pacote do Radar;
- analisar Guardião e pendências;
- produzir ou revisar artigo, roteiro e carrossel;
- gerar prompts de capa, respiros, cenas e slides;
- receber imagens geradas no chat;
- salvar rascunhos e versões;
- preparar o pacote para Publicações.

O modelo não pode:

- aprovar ArticleDNA, SiloDNA, InternalLinkGraph ou investigação;
- publicar fora da plataforma;
- mudar a marca, o escopo ou a proveniência;
- inventar evidência, fonte, link, produto ou especialista;
- apagar conteúdo ou substituir uma versão sem lock e readback.

O servidor MCP deve continuar usando ferramentas específicas, com descrições que expliquem quando cada uma deve ser chamada, schemas explícitos, anotações honestas e autorização no servidor. A documentação oficial da OpenAI recomenda esse desenho, uma ferramenta de perfil somente leitura para distinguir contas e OAuth 2.1/PKCE para dados privados [criar servidor MCP](https://developers.openai.com/pt-BR/plugins/build/mcp-server) e [autenticar usuários](https://developers.openai.com/pt-BR/plugins/build/auth).

## Modelo de interface desejado

No topo do Redator devem permanecer apenas o estado do trabalho, controles do editor e acesso a Publicações. A aba `Conectar IA` deve sair do Redator.

O artigo, o roteiro e o carrossel devem parecer documentos em produção. O usuário deve encontrar o texto, cenas e slides produzidos, com controles de revisão e retoque. Campos auxiliares podem existir como metadados colapsáveis ou leitura derivada, mas não como formulário principal vazio.

Cada bloco visual deve mostrar, no mesmo contexto:

- função da imagem;
- prompt usado;
- imagem atual ou estado “aguardando imagem”;
- gerar novamente, anexar, substituir, ajustar e remover;
- texto alternativo;
- proveniência e vínculo ao artigo, cena ou slide.

O estado precisa diferenciar `não iniciado`, `em produção`, `salvo`, `revisão necessária`, `pronto para Publicações` e `conflito`. A cor não deve ser a única indicação, seguindo o sistema visual compartilhado.

## Critérios de aceite do redesign

- A agência consegue autorizar e revogar a conexão MCP na página de Integrações.
- O Redator não exibe credenciais nem oferece uma segunda conexão por marca.
- O artigo recebido do Radar abre com dossiê, estrutura e evidências preservados.
- Roteiro e carrossel abrem como documentos produzidos, sem campo de canal.
- A IA consegue salvar uma versão de artigo, roteiro ou carrossel com lock e readback.
- Cada imagem fica vinculada ao bloco editorial correto e é conferida por hash no armazenamento privado.
- O usuário consegue revisar ou retocar texto e imagem antes de enviar a Publicações.
- Publicações recebe o documento e seus ativos sem depender do Planejador.
- O Radar não recebe alterações e nenhum DNA é reescrito pelo Redator.
- A mesma operação repetida não duplica versões nem entregáveis.
- O fluxo é legível após F5 e em outra sessão autorizada.

## Estado documental

Este relatório substitui a interpretação anterior que tratava `Conectar IA` como uma função própria do Redator e os campos de roteiro/carrossel como briefing de entrada. A implementação atual permanece preservada para auditoria e migração aditiva; nenhuma coluna é apagada por este documento.
