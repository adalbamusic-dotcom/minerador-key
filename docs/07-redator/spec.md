# Spec — Redator
## 1. Propósito
Permitir redação de um ContentDocument orientado por um ContentPlan aprovado.
## 2. Responsabilidades
Abrir documento, editar em Tiptap, preservar proveniência e encaminhar estado editorial quando implementado.
## 3. Fora de responsabilidade
Não cria arquitetura, plano nem publica externamente.
## 4. Entidades
ContentDocument, versão de documento, estado de usuário, comentário e PublicationRecord.
## 5. Jornada
Plano aprovado inicia escrita, abre `/{brandRef}/redator` com identificadores e apresenta editor.
## 6. Regras de negócio
Somente ContentPlan aprovado abre escrita; documento guarda referências compactas e lock_version.
## 7. Estados
Rascunho, escrita, aguardando revisão, revisão e aprovado (o ciclo completo é parcial).
## 8. Ações
Abrir, editar, salvar, comentar, analisar com o Guardião, solicitar escrita por seção, solicitar melhoria de trecho, aplicar propostas localmente e aprovar quando o documento não possuir achados bloqueantes.
## 9. Entradas
ArticleDNA, ContentPlan aprovado, documento e estado do usuário.
## 10. Saídas
ContentDocument e candidato a Publicações.
## 11. Contratos com outros módulos
Consome Planejador e fornece documento aprovado a Publicações.
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
Planejador, Publicações, migrations e fluxo compartilhado.

## 20. Guardião e propostas assistidas
O Guardião determinístico analisa a cópia atual do documento por hash e produz findings de headings, completude, repetição, fontes, links internos e metadados. A análise não equivale a aprovação. Escrita por seção e melhoria de trecho são propostas isoladas, limitadas ao alvo e sempre exigem revisão humana antes da aplicação.
