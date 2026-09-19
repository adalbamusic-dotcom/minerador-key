# Redator por MCP — ambiente local e conexão remota

**Proprietário:** Agência para a conexão; Redator para as ferramentas. **Estado em 2026-09-19:** transporte e leitura autenticada validados no localhost; registro de clientes foi movido para as Integrações da Agência; conexão ChatGPT/Claude/Gemini ainda não homologada.

## Porta local

`http://localhost:3000/api/mcp/redator` aceita Streamable HTTP (GET/POST/DELETE). O servidor exige `Authorization: Bearer <credencial delegada>`, valida usuário, agência, marca, escopo e permissão atual em cada chamada, e registra a ferramenta e o resultado. Sem token responde 401. O `Host` padrão aceita somente `localhost:3000` e `127.0.0.1:3000`; outros hosts exigem configuração explícita de `MCP_ALLOWED_HOSTS`. Origem de navegador não é cliente MCP autorizado.

A gestão agora fica em `/agencias/{agencyRef}/integracoes`. A Agência registra o cliente (ChatGPT, Claude, Gemini ou outro), vê o endpoint e emite a credencial por Marca. O Redator não deve ser usado para criar credenciais. O valor não é salvo em `localStorage`; o banco guarda somente o hash. Para testar leitura sem modificar artigos, conceder apenas `writer.read`. Nunca colar a credencial em um documento, issue, captura de tela ou log. A credencial usada na prova de 2026-09-18 foi revogada.

Ferramentas de leitura: perfil da conexão, lista de documentos, documento, dossiê do Radar, Guardião e entregáveis. Ferramentas de escrita: salvar rascunho de artigo, salvar roteiro/carrossel, registrar prompt e anexar imagem. Nenhuma ferramenta aprova, publica, exclui ou altera DNA. O artigo continua em `ContentDocument`; roteiro e carrossel são derivados com versões e lock próprios.

## Provas já feitas

- `pnpm run test:redator` e `pnpm run test:redator:mcp` validam contratos, inicialização MCP, catálogo/anotações e recusas sem lock/ferramenta inexistente.
- Um cliente HTTP local com token temporário `writer.read` executou `initialize`, `tools/list`, perfil, lista e briefing: 1 documento e dossiê presente. Após revogação, a mesma credencial recebeu 401 `delegation_invalid`.
- `writer_save_article_draft` passou no banco com uma fixture dentro de `BEGIN`/`ROLLBACK`: estado e versão imutável foram gravados juntos, repetição do mesmo hash não duplicou versão e conteúdo diferente com lock antigo foi recusado. A checagem após `ROLLBACK` encontrou zero fixtures. A ferramenta MCP de escrita autenticada ainda não foi testada ponta a ponta.
- O banco manteve 1 documento anterior e 0 entregáveis derivados. A prova deixou 1 registro de delegação **revogada** e sua trilha de auditoria, sem conteúdo editorial novo.

## Gate ChatGPT/Claude

`localhost` não é acessível diretamente por um cliente remoto. O projeto Supabase atualmente responde HTTP 404 `feature_disabled` em `/.well-known/oauth-authorization-server/auth/v1`. A documentação do Supabase oferece OAuth 2.1 com Authorization Code + PKCE S256 e descoberta automática para MCP. Antes de conectar uma conta ChatGPT/Claude: habilitar esse recurso no projeto, definir a página de consentimento e a associação explícita entre cliente OAuth, usuário, agência e marca; publicar os metadados do recurso protegido; verificar audience/escopos a cada chamada; e expor uma URL HTTPS de teste. A credencial bearer local não substitui esse fluxo. Não houve deploy.

## Imagens

O MCP registra o briefing e pode receber uma imagem PNG/JPEG/WebP já produzida por um cliente. O servidor verifica formato, tamanho, hash, armazenamento privado e readback. O registro do prompt, sozinho, não declara a imagem gerada. A geração no próprio chat depende do cliente de IA; a plataforma não chama uma API de imagem neste corte.
