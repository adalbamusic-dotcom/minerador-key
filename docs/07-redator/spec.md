# Spec — Redator
## 1. Propósito
Produzir um ContentDocument a partir do dossiê canônico do Radar e, quando fizer sentido, derivar um roteiro de vídeo ou carrossel da mesma origem. ContentPlan aprovado continua aceito apenas no caminho histórico.
## 2. Responsabilidades
Abrir o pacote do Radar, realizar artigo, roteiro e carrossel, produzir/revisar imagens, preservar proveniência, revisar metadados e encaminhar o pacote final a Publicações.
## 3. Fora de responsabilidade
Não cria arquitetura, plano nem publica externamente.
## 4. Entidades
ContentDocument, versão de documento, estado de usuário, comentário e PublicationRecord.
## 5. Jornada
O Radar envia o artigo e seu dossiê ao Redator; o documento abre em `/{brandRef}/redator`. O usuário pode escrever o artigo ou derivar roteiro e carrossel, revisar e salvar cada entregável separadamente.
## 6. Regras de negócio
Documento v2 recebido do Radar não exige ContentPlan; guarda origem, dossiê, pendências e `lock_version`. Documento v1 com ContentPlan continua legível. Roteiro e carrossel referenciam documento e hash de origem, sem modificar o dossiê recebido.
## 7. Estados
Rascunho, em produção, revisão necessária, pronto para Publicações e entregue a Publicações. Aprovação de DNA, investigação e publicação externa continuam eixos separados.
## 8. Ações
Abrir, editar, salvar, comentar, analisar com o Guardião, solicitar escrita por seção, solicitar melhoria de trecho, gerar/registrar prompt, anexar ou substituir imagem, retocar conteúdo, exportar pacote e enviar a Publicações. O Redator não gerencia conexão MCP, não aprova DNA e não publica externamente.
## 9. Entradas
ArticleDNA e dossiê aprovado do Radar, documento e estado do usuário; ContentPlan aprovado somente no caminho histórico.
## 10. Saídas
ContentDocument, roteiro, carrossel, ativos visuais, metadados e pacote para Publicações. O pacote pode ter read models DOCX/PDF sem substituir o documento canônico.
## 11. Contratos com outros módulos
Consome diretamente o pacote do Radar, preserva a leitura histórica do Planejador e fornece documento aprovado a Publicações.
## 12. Proteções
Proveniência, permissão, lock otimista e isolamento por marca.
## 13. Casos de borda
Documento não encontrado, concorrência, persistência indisponível e restauração não interpretada como digitação.
## 14. Arquitetura técnica atual aprovada
`WriterPage`, `professional-writer.tsx`, repositório de documentos e rota de workflow.
## 15. Critérios de aceite
Salvar confirma persistência sem perder conteúdo; propostas de IA não alteram o documento sem confirmação humana; o Guardião identifica pendências por seção; aprovação server-side rejeita findings bloqueantes; e a transferência libera somente documento válido e aprovado.
## 16. Fora do escopo atual
Publicação externa e revisão colaborativa completa.
## 17. Arquivos pertencentes ao módulo
`app/(brand)/[brandRef]/redator/page.tsx`, `components/editorial/professional-writer.tsx`.
## 18. Arquivos compartilhados consumidos
Contexto, contratos, repositórios e Tiptap extensions.
## 19. Arquivos proibidos sem autorização
Mudanças fora do Redator que não sejam explicitamente autorizadas por SDD e pelo escopo da tarefa.

## 20. Guardião e propostas assistidas
O Guardião determinístico analisa a cópia atual do documento por hash e produz findings de headings, completude, repetição, fontes, links internos e metadados. A análise não equivale a aprovação. Escrita por seção e melhoria de trecho são propostas isoladas, limitadas ao alvo e sempre exigem revisão humana antes da aplicação.

## 21. Entregáveis derivados e MCP

Roteiro (`video_script`) e carrossel (`carousel`) têm conteúdo, lock e versões próprios em `writer_deliverables`, sempre vinculados ao `ContentDocument` e ao hash da origem. Cenas e slides podem carregar referências de fonte e direção visual. `writer_media_assets` distingue prompt registrado de arquivo de imagem efetivamente anexado e confirmado em armazenamento privado. Nenhum prompt prova que a imagem foi gerada.

O MCP é uma porta de ferramentas para a agência e marca delegadas. Pode ler documento/dossiê, executar Guardião, salvar rascunhos e registrar/anexar mídia. Verifica escopo, autorização atual, lock e readback no servidor. Não aprova, publica, exclui nem altera DNA ou SERP. Credencial delegada é revogável e não é senha de ChatGPT ou Claude. A conexão remota desses clientes depende de HTTPS e autorização OAuth compatível; o endpoint local com bearer não prova essa integração.

## 22. Diretriz de produto — MCP da Agência e Redator de produção

Esta é a regra de destino aprovada em 2026-09-18 e substitui a interpretação de que o Redator deveria emitir credenciais ou coletar briefing de roteiro/carrossel.

- A Agência, em `/agencias/{agencyRef}/integracoes`, é responsável por conexão MCP, OAuth, consentimento, escopos, marcas autorizadas, expiração, revogação, auditoria e saúde do endpoint.
- O Redator não exibe a aba `Conectar IA` nem administra credencial. Ele recebe apenas a identidade já autorizada e trabalha no conteúdo.
- A plataforma não mantém uma conta geral de ChatGPT/Claude. Cada agência conecta o cliente autorizado segundo a política de acesso da Agência.
- Roteiro e carrossel são documentos realizados. `channel` não é dado necessário e não deve ser exigido ou exibido como campo de produção.
- Campos como objetivo, público, duração, abertura, legenda e CTA podem existir como resultado do documento ou metadado derivado, mas não como formulário vazio que bloqueia a redação.
- Prompts, imagens, retoques e texto devem estar vinculados ao artigo, bloco, cena ou slide correspondente.
- O destino é Publicações e pós-produção. Não há integração de publicação direta em redes sociais neste escopo.
- A implementação deve ser aditiva, preservar versões atuais e diferenciar `VERIFICADO_NO_CODIGO`, `CONFIRMADO_POR_TESTE`, `PERSISTENCIA_REMOTA`, `VALIDADO_MANUALMENTE`, `PENDENTE` e `BLOQUEADO`.
