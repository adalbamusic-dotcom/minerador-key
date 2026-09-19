# Proposta de SDD — acesso do Redator por MCP

**Estado:** proposta histórica parcialmente sucedida pela SDD autorizada `docs/07-redator/propostas/sdd-redator-multiformato-mcp-2026-09-18.md`. O bearer local, o schema de entregáveis e o endpoint local já foram implementados; OAuth remoto, consentimento e conexão ChatGPT/Claude continuam pendentes. Este documento não é um relato de validação funcional.  
**Proprietário do primeiro corte:** Redator. **Fronteira compartilhada:** autenticação e delegação por Plataforma/Agência/Marca.  
**Ambiente de prova:** `localhost:3000`; sem deploy neste corte.

## 1. Evidência atual e problema

Em 2026-09-18, o navegador local abriu um `ContentDocument` v2 recebido do Radar para “skincare para pele oleosa”, com origem da análise `9ec975a1-3886-49ba-a5eb-ecf449bcee4e` e ArticleDNA `7dc5cad8-804d-4da9-9949-88c6c0b964b8`. Uma edição temporária recebeu confirmação de salvamento no servidor e reapareceu após F5. O texto de teste foi removido, salvo e a remoção também reapareceu após F5. O teste mudou o estado operacional do documento de `planejado` para `escrevendo`; conteúdo editorial final não foi criado. Não houve conferência em segundo navegador nem aprovação/publicação.

O documento v2 contém `radarOrigin` e `importedContext.dossier`, com pacote, perfil, contexto de keywords e pendências. A UI atual mostra origem e IDs, mas não oferece leitura estruturada desse dossiê. A aprovação do documento usa o Guardião; ela não deve resolver pendências proprietárias do Radar por inferência.

## 2. Decisão proposta

Começar com um **servidor MCP de ferramentas, sem widget**, que opere os mesmos serviços de domínio do Redator. O modelo roda na conta escolhida pela agência (por exemplo, ChatGPT ou Claude); a plataforma não armazena a senha dessa conta nem precisa chamar uma API de modelo para esse fluxo. Um único gateway pode servir várias agências, mas cada chamada valida usuário delegado, agência ativa, `brandId`, permissão e escopo. O dado editorial continua tenantizado por `brandId`.

O servidor MCP é uma porta para operações existentes, não uma segunda autoridade editorial. Não recebe SQL livre, `service_role` do cliente, credenciais de provider, acesso direto ao filesystem nem capacidade de alterar ArticleDNA ou o dossiê do Radar. Nenhum texto gerado pelo modelo recebe aprovação automática.

## 3. Contrato de ferramentas — primeiro corte

| Ferramenta proposta | Entrada mínima | Saída verificável | Efeito |
| --- | --- | --- | --- |
| `list_writer_documents` | marca, filtros de estado, cursor | IDs, títulos, origem, estado e versão | leitura |
| `get_writer_brief` | marca, documento, versão esperada | ArticleDNA e dossiê do Radar em seções nomeadas, evidências, lacunas, decisões pendentes, instruções de formato e proveniência | leitura |
| `get_writer_document` | marca, documento | ContentDocument, blocos, metadados, `lockVersion`, hash e status | leitura |
| `propose_writer_draft` | marca, documento, versão esperada, proposta estruturada | diff por seção, fontes citadas, avisos de evidência e resultado do Guardião | proposta sem mutação canônica |
| `save_writer_draft` | marca, documento, `expectedLockVersion`, conteúdo estruturado, `idempotencyKey` | versão/lock remoto confirmado por readback ou conflito explícito | escrita de rascunho |
| `get_writer_guardian` | marca, documento e hash | findings determinísticos e bloqueios | leitura/análise sem aprovação |

`get_writer_brief` deve declarar ausências como ausências; não inventar principal, URL, fonte, afirmação de especialista, produto ou evidência. O dossiê grande pode ser lido em partes com paginação/seleção de seções, mantendo IDs e hashes. O contrato de saída precisa ser legível para modelo e humano, sem reduzir tudo a um prompt Markdown opaco.

`save_writer_draft` preserva IDs e referências canônicas, aplica o mesmo schema e lock otimista da UI, registra ator/delegação/modelo/cliente, compara hash no readback e nunca anuncia sucesso com fallback local. Aprovar, enviar a Publicações, publicar, apagar, reprocessar SERP ou alterar DNAs ficam fora do primeiro corte.

## 4. Identidade, permissões e auditoria

- O usuário conecta o cliente MCP à sua conta da plataforma. O token é emitido para o gateway, com audience, prazo e escopos próprios; não se reutiliza cookie de navegador como credencial de agente.
- A delegação é vinculada a `actorUserId`, `agencyId`, `brandId`, cliente e escopos (`writer.read`, `writer.propose`, depois `writer.draft.write`). A marca deve pertencer à agência operacional autorizada na hora de **cada** chamada; trocar `brandId` no argumento não concede acesso.
- O gateway executa autorização server-side e usa os serviços de domínio existentes. `service_role` pode permanecer privado na camada administrativa do servidor, jamais no token, no cliente MCP ou na saída da ferramenta.
- Revogação, expiração e histórico de ferramenta são necessários antes de abrir escrita externa. Registrar `requestId`, documento, versão/hash anterior e posterior, resultado e ator delegado; não registrar o dossiê completo ou segredo em logs.
- O desenho final de OAuth/Delegation e eventual migration pertencem à SDD global e exigem aprovação própria. Nenhuma conta falsa em `auth.users` para representar IA.

## 5. Compatibilidade, implantação e retorno

As rotas e o editor atuais continuam funcionando sem MCP. O pacote do Radar e os documentos v1/v2 não mudam neste primeiro corte; o adaptador de leitura expõe `importedContext.dossier` existente. O servidor MCP começa desabilitado por configuração, depois é testado localmente com cliente MCP de desenvolvimento. ChatGPT conectado exige um endpoint MCP remoto ou túnel adequado; `localhost:3000` sozinho não é endpoint acessível ao serviço. A possibilidade de escrita depende também das permissões do plano/workspace do cliente escolhido, a confirmar na conta da agência.

Rollback: desabilitar a conexão/ferramentas MCP e revogar delegações sem modificar documentos nem retirar a UI humana. Se um salvamento falhar, preservar documento e devolver conflito/erro; nenhuma limpeza de dados para esconder falha.

## 6. Gates de implementação

1. Fechar a homologação local Radar → Redator: mesmo documento e hash após F5 e segunda sessão; idempotência do envio; lote misto; erros com causa nomeada.
2. Entregar no Redator uma leitura humana do dossiê, evidências e pendências que será a mesma fonte das ferramentas; corrigir textos abaixo de 14 px segundo o sistema visual.
3. Aprovar a SDD global de Agent Runtime/Delegation/MCP Gateway, com protocolo de autenticação, escopos, revogação, tenancy, rate limit e observabilidade.
4. Implementar as ferramentas de leitura e proposta com fixtures de documento v1/v2, dados incompletos e acesso entre marcas/agências; testar o protocolo localmente.
5. Liberar escrita de rascunho só depois de provar lock concorrente, idempotência, readback remoto, trilha de auditoria e ausência de promoção automática.
6. Testar a conexão real do cliente escolhido e seus limites de plano; decidir HTTPS/túnel e eventual deploy em gate separado.

## 7. Fora do corte

Automação de ponta a ponta desde Minerador, geração/armazenamento de imagens, roteiros, carrosséis e publicação externa são fases posteriores. Cada uma exige contrato de entrada/saída e ferramentas próprias; não deve ser obtida concedendo ao MCP acesso irrestrito ao monólito. O cliente de chat pode gerar texto e imagens na própria conversa; a plataforma só as receberá mediante operação explícita de anexar ativo, com proveniência e vínculo ao documento.
