# Spec — Conta
## 1. Propósito
Exibir a área de conta do usuário autenticado.
## 2. Responsabilidades
A rota contextual `/{brandRef}/conta` continua pertencendo ao ator autenticado: não lê senha, sessões ou preferências de outro membro.
Apresentar dados operacionais da conta e navegar para configurações de marca quando aplicável.
## 3. Fora de responsabilidade
Não administra marcas de terceiros nem altera pipeline editorial.
## 4. Entidades
Sessão, perfil e marca selecionada.
## 5. Jornada
Usuário abre `/{brandRef}/conta` e consulta informações disponíveis.
## 6. Regras de negócio
Sessão e contexto de marca delimitam o que pode ser exibido.
## 7. Estados
Carregando, autenticado, sem sessão e erro.
## 8. Ações
Consultar conta e navegar para configuração.
## 9. Entradas
Sessão e `BrandProvider`.
## 10. Saídas
Visão de conta.
## 11. Contratos com outros módulos
Consome autenticação e Marca; não produz artefato editorial.
## 12. Proteções
Não expor dados de outra marca/usuário.
## 13. Casos de borda
Sessão ausente e sem marca selecionada.
## 14. Arquitetura técnica atual aprovada
`AccountPage` e rota `/{brandRef}/conta`; `/perfil` redireciona para configuração de Marca. **Verificado no código.**
## 15. Critérios de aceite
Área respeita sessão e não executa mutações inesperadas.
## 16. Fora do escopo atual
Preferências avançadas e gestão de segurança de conta.
## 17. Arquivos pertencentes ao módulo
`app/(brand)/[brandRef]/conta/page.tsx`, `app/(brand)/[brandRef]/page.tsx`.
## 18. Arquivos compartilhados consumidos
`modules/conta/account-page.tsx`, sessão e `BrandProvider`.
## 19. Arquivos proibidos sem autorização
Autorização compartilhada, Marca e módulos editoriais.
