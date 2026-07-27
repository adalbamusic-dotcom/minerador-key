
# Plano de Implementação: Fluxo de Login (Next.js & Extensão Chrome)

Este plano descreve as alterações necessárias para adicionar suporte a autenticação por e-mail e senha tanto no painel Next.js quanto na extensão do Chrome. Ambas as conexões utilizarão o Supabase Auth como provedor, integrado ao NextAuth no lado web.

---

## 1. Aplicação Next.js

### [MODIFY] [app/api/auth/\[...nextauth\]/route.ts](file:///c:/Users/Adalba/Documents/adalba-pro/minerador-key/app/api/auth/[...nextauth]/route.ts)
- Adicionar o `CredentialsProvider` nas configurações do NextAuth.
- Implementar a função `authorize` para validar o e-mail e a senha diretamente na API do Supabase Auth (`/auth/v1/token?grant_type=password`).
- Atualizar os callbacks `jwt` e `session` para capturar o `access_token` retornado do login com e-mail/senha do Supabase.

### [MODIFY] [app/page.tsx](file:///c:/Users/Adalba/Documents/adalba-pro/minerador-key/app/page.tsx)
- Atualizar a interface do estado "Desconectado" para oferecer duas abas de login:
  - **Aba 1 (Padrão)**: Entrar com o Google (NextAuth).
  - **Aba 2**: Entrar com E-mail e Senha (aciona o `signIn("credentials", ...)` do NextAuth).
- Exibir feedbacks visuais apropriados em caso de falha de login (ex: e-mail ou senha incorretos).

---

## 2. Extensão do Chrome

### [MODIFY] [minerador-extensao/popup.html](file:///c:/Users/Adalba/Documents/adalba-pro/minerador-key/minerador-extensao/popup.html)
- Adicionar uma seção de login contendo inputs de `E-mail`, `Senha` e botão `Entrar`.
- Adicionar uma seção de perfil mostrando o usuário logado com o botão `Sair` (Logout).
- Ocultar a interface de mineração até que o usuário esteja devidamente autenticado.

### [MODIFY] [minerador-extensao/popup.js](file:///c:/Users/Adalba/Documents/adalba-pro/minerador-key/minerador-extensao/popup.js)
- No carregamento inicial, verificar se há uma sessão ativa salva no `chrome.storage.local`.
- Se existir uma sessão, exibir a tela de mineração e o e-mail do usuário.
- Se não existir, exibir o formulário de login.
- Implementar a rotina de login no botão "Entrar":
  - Faz requisição para a API de autenticação do Supabase.
  - Se sucesso, salva o token e e-mail no `chrome.storage.local` e renderiza a tela de mineração.
  - Trata erros de login (credenciais inválidas).
- Implementar o botão "Sair" para deletar a sessão do storage local.

### [MODIFY] [minerador-extensao/background.js](file:///c:/Users/Adalba/Documents/adalba-pro/minerador-key/minerador-extensao/background.js)
- Atualizar a função `executeMining` para ler o token de acesso do `chrome.storage.local` antes de salvar as palavras-chave no Supabase.
- Enviar o token do usuário logado no cabeçalho `Authorization: Bearer <token>`, permitindo a aplicação de políticas de segurança de linha (RLS) no Supabase.

---

## Plano de Verificação

### Testes Manuais (Next.js)
1. Iniciar o servidor local: `npm run dev`.
2. Acessar `http://localhost:3000`.
3. Tentar logar com e-mail/senha utilizando as credenciais cadastradas (`<ADMIN_EMAIL>` / `@mineKEYproject26!`).
4. Verificar se a sessão é criada corretamente e o dashboard é exibido.

### Testes Manuais (Extensão)
1. Recarregar a extensão no Chrome.
2. Abrir o popup da extensão (deve mostrar o formulário de login).
3. Entrar com `<ADMIN_EMAIL>` / `@mineKEYproject26!`.
4. Verificar se a interface transiciona para o minerador e exibe seu e-mail.
5. Rodar uma mineração de teste e checar se os dados continuam sendo salvos no Supabase com sucesso.
6. Clicar em "Sair" e verificar se volta para a tela de login.

