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

## 20. Autenticação manual
Os formulários ativos de login e cadastro usam o componente compartilhado PasswordField. Login utiliza autocomplete current-password; senha e confirmação de cadastro utilizam new-password. Cada campo controla visibilidade independentemente, sem registrar ou enviar a senha ao Admin.

O cadastro cria somente a identidade Auth. Não há tela ativa de redefinição de senha nem de conclusão de convite nesta etapa; o aceite completo de convite permanece pendente em backlog.

## 21. Contrato R4 do shell e Conta pessoal

`/conta` é a rota pessoal canônica da identidade autenticada. O `proxy` não
pode tratá-la como destino tenant legacy nem encaminhá-la para
`/selecionar-marca`. A cadeia real é `app/(personal)/conta/page.tsx`,
`getCanonicalPersonalAccount()` e `PersonalAccountPage`; a área não exige Brand,
Agency ou seleção de contexto.

`ProductShell` pode ser instanciado por layouts de route groups diferentes, mas
o estado visual `expanded` pertence ao `ShellVisualProvider` persistente sob
`Providers`. `mobileOpen` permanece local ao drawer e pode fechar após
navegação mobile. Autorizações, contexto de rota, Brand operacional e
revalidação server-side permanecem separados desse estado visual.

## 22. Contrato R5 de estabilidade visual do shell

O layout raiz le `minerador-key-shell-expanded` e
`minerador-key-operational-brand` por `cookies()` no servidor. O primeiro
cookie inicializa a expansao sem depender da hidratacao; o segundo e somente
uma dica de navegacao e so e aceito depois de `listCanonicalAccessibleBrands`
confirmar o escopo operacional. Dica ausente ou invalida nao cria autorizacao
nem Brand ativa.

`localStorage` permanece como compatibilidade de preferencias antigas, mas nao
substitui o estado inicial server-readable quando o cookie existe. O shell nao
usa timeout, overlay ou opacity para esconder carregamento. O controle de
expansao e externo ao fluxo e revela seu indicador apenas em hover ou
`focus-visible`.

O label visual global e `Perfil`, mas a rota pessoal permanece `/conta`.
`ROUTE_AGENCY_SINGULAR_REVIEW` fica registrado como divida: a rota atual e
`/agencias/{agencyRef}` e uma possivel forma futura `/agencia/{agencyRef}` nao
faz parte desta fase.

## 23. Evolução funcional da identidade pessoal

Perfil cuida da pessoa; Agência e Marca continuam cuidando da organização e do
trabalho. O nome editável reutiliza `auth.users.user_metadata.full_name`, com
confirmação por readback. A página pessoal, a sessão compartilhada e o avatar
da `GlobalTopbar` consomem a mesma identidade Auth; o papel global e o e-mail
continuam somente informativos.

O avatar remoto usa o bucket exclusivo `profile-avatars`, com escrita,
alteração e remoção limitadas ao caminho do próprio `auth.uid()`. A entrada é
JPEG/PNG/WEBP, o processamento produz WEBP 256×256 e a única referência
persistida é `auth.users.user_metadata.avatar_url`. Perfil, `GlobalTopbar` e
`ProfilePopover` leem essa mesma identidade; o sucesso exige readback do objeto
Storage e do metadata Auth. Não existe dependência de Brand ou Agency.
