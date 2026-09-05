# SDD — Google Cloud Media APIs compartilhadas da Plataforma

**Módulo proprietário:** Plataforma / Admin / Integrações globais  
**Consumidores previstos:** qualquer módulo com contrato funcional aprovado; Radar é o primeiro consumidor previsto, mas não é alterado nesta etapa  
**Data:** 2026-08-25  
**Status:** implementação local preparada; migration, configuração remota e smoke real pendentes de operação manual

Esta SDD complementa `docs/compartilhado/sdd-arquitetura-integracoes-plataforma-agencia-marca.md`.
Ela registra a fundação compartilhada para Speech-to-Text, Cloud Storage e
YouTube Data API v3 sem criar integrações, permissões ou quotas específicas de
módulo.

## 1. Objetivo e limites

O Admin global governa a infraestrutura da Plataforma. A Agency recebe
disponibilidade conforme plano, período e quota; a Brand consome somente dentro
do contexto autorizado; os módulos não controlam Connection, credential,
grant, binding, quota, provider ou disponibilidade.

O escopo local é:

- provider/Connection global para Google Cloud Speech e Storage;
- provider/Connection global separado para YouTube Data API;
- capabilities `google_cloud.speech_transcription`,
  `google_cloud.storage_media` e `youtube.video_metadata`;
- operações server-side compartilhadas e fail-closed;
- configuração e health check explícitos no Admin;
- contratos de segredo no Secret Store canônico.

Ficam fora: Telegram completo, bot global, OAuth de canal do YouTube,
yt-dlp, FFmpeg, download de vídeo, transcrição automática, alteração do
Radar, ArticleDNA, RadarEvidencePackage, Google Ads, DataForSEO, DeepSeek,
Auth, tenantização e pipeline editorial.

## 2. Auditoria do package manager

O repositório usa `pnpm` por convenção documental e possui somente
`pnpm-lock.yaml`. Não há `packageManager` em `package.json`, nem
`package-lock.json` ou outro lockfile concorrente.

Na auditoria local de 2026-08-25:

```text
@google-cloud/speech  = não declarado e não resolve em node_modules
@google-cloud/storage = não declarado e não resolve em node_modules
googleapis             = já declarado; não será instalado novamente
```

O agente não executa instalação, não recria lockfile e não limpa
`node_modules`. A instalação manual correta, depois desta etapa, é:

```bash
pnpm add @google-cloud/speech @google-cloud/storage
```

Até essa operação manual, os adapters oficiais permanecem explicitamente
indisponíveis e as operações retornam erro sanitizado; testes usam clients
injetados/fakes.

## 3. Providers, Connections e segredos

Os providers canônicos são `google_cloud` e `youtube_data`.

`google_cloud` possui uma Connection global de produção que pode servir
Speech e Storage. Seu Secret Store guarda o JSON de Service Account somente no
servidor sob o contrato `GOOGLE_CLOUD_SERVICE_ACCOUNT`. O bucket é metadado
operacional sanitizado da Connection, não segredo.

`youtube_data` possui uma Connection global de produção com uma API key
restrita para leitura pública, sob o contrato `YOUTUBE_DATA_API_KEY`. A
Service Account Google Cloud não é presumida como credencial do YouTube.

Salvar a credencial leva a Connection para `pending`; somente um health check
explícito pode marcar `ready`. GETs, DTOs, logs, usage metadata, erros,
browser, localStorage e sessionStorage nunca recebem segredo.

Não são permitidas Connections próprias de Agency/Brand para essas APIs nesta
etapa. O contrato atual de Connections próprias da Agency continua restrito
às frentes já aprovadas de IA/SERP.

## 4. Capabilities e unidades

Capabilities são recursos, não módulos:

| capability | provider | operation_kind | unidade inicial |
| --- | --- | --- | --- |
| `google_cloud.speech_transcription` | `google_cloud` | `speech_transcription` | `request` |
| `google_cloud.storage_media` | `google_cloud` | `storage_media` | `request` |
| `youtube.video_metadata` | `youtube_data` | `youtube_video_metadata` | `request` |

Não serão criadas chaves `radar.speech`, `radar.storage`, `radar.youtube`,
nem grants/quota por módulo. A migration sucessora somente amplia o CHECK do
catálogo; não cadastra dados remotos automaticamente.

## 5. Operação compartilhada de Speech-to-Text

O executor server-side aceita contexto de `brandId`, origem e metadados de
áudio normalizados. Suporta:

1. áudio curto via reconhecimento síncrono;
2. áudio longo via `gs://` e operação assíncrona/batch.

O idioma padrão inicial é `pt-BR`, mas encoding e sample rate vêm do metadata
detectado/normalizado. O contrato não presume `OGG_OPUS` ou `16000 Hz`.
Nenhum consumidor chama o SDK diretamente; o client pode ser injetado nos
testes e o carregamento oficial falha fechado quando o pacote não está
instalado.

## 6. Operação compartilhada de Storage

O executor suporta upload temporário, URI `gs://`, existência/readback e
remoção quando a política do consumidor autorizar. A chave é sempre
brand-scoped e inclui `brandId`, origem e identificador único; nome de arquivo
sozinho nunca é chave global. Metadata inclui `brandId`, `source`,
`contentType`, `objectKey` e checksum quando disponível.

Não cria bucket automaticamente. O bucket é informado pelo Admin e deve ser
criado/configurado manualmente no projeto Google Cloud. O Storage é
infraestrutura transitória de processamento, não biblioteca editorial
permanente.

## 7. Operação compartilhada de YouTube metadata

O executor normaliza URL ou `videoId` no servidor e consulta somente metadados
públicos via REST server-side. Retorna `videoId`, `title`, `channelId`,
`channelTitle`, `description`, `publishedAt`, `duration` e metadata de
thumbnail. Não baixa vídeo, não usa yt-dlp/FFmpeg e não transcreve.

## 8. Autorização, Agency e Brand

Toda operação de módulo deve passar pelo resolver compartilhado existente:

```text
actor autenticado
→ Agency ativa e com acesso operacional
→ Brand autorizada e vinculada à Agency
→ capability ativa
→ grant/binding/Connection global READY
→ quota aplicável
→ usage event sanitizado
```

Agency suspensa, sem plano, expirada, bloqueada ou sem quota não consome. O
`brandId` canônico continua sendo `public.marcas.id`; não há fallback para
outra marca e nenhum módulo decide a disponibilidade.

## 9. Admin e health checks

O Admin global exibe projeto/credencial de forma sanitizada e os estados
`CONFIGURED`, `READY` e `ERROR` para Speech, Storage e YouTube. As ações são
substituir credencial/configuração e testar cada provider separadamente. Não
há chamada ao abrir a tela.

- Speech: valida autenticação e acesso mínimo sem processar mídia grande;
- Storage: valida bucket e acesso sem upload destrutivo quando possível;
- YouTube: consulta mínima usando `YOUTUBE_HEALTH_VIDEO_ID` configurado.

Ativar APIs no Google Cloud é operação manual: Cloud Speech-to-Text API,
Cloud Storage API e YouTube Data API v3. A aplicação não chama Service Usage
para habilitá-las.

## 10. Segurança e observabilidade

Segredos não aparecem em bundle cliente, respostas GET, console, logs,
usage metadata, documentação, erros ou armazenamento do navegador. Usage
continua no ledger compartilhado com operation kind próprio do ledger
(`connection_test`, `health_check`, `administrative_validation` ou
`module_operation`), sem ledger paralelo.

Falhas de credencial ausente, pacote ausente, Connection revogada/desabilitada,
bucket ausente, API não habilitada ou resposta inválida bloqueiam a operação.
Não há fallback para Serper, RapidAPI, OpenRouter ou outro provider.

## 11. Compatibilidade, rollback e dados

A mudança é aditiva no catálogo e nos contratos server-side. Migrations
históricas não são editadas. Nenhum provider, Connection, grant, binding,
quota, segredo ou dado remoto é criado automaticamente nesta implementação.

Antes de aplicar a migration, o rollback é não aplicar e não configurar o
catálogo. Depois, a reversão deve desabilitar/revogar capability e vínculos
conforme operação administrativa; não apagar usage histórico. Reversão
estrutural exige migration própria. Não existe rollback automático de segredo.

Telegram é uma integração global separada, com um Bot da Plataforma e binding
explícito por Brand/Expert. Esta SDD não cria Bot Token, webhook ou segredo
Telegram; não existe Bot próprio da Brand.

## 12. Testes e gates

Os testes locais usam fixtures, mocks e clients injetados. Devem cobrir:

- Admin-only para escrita de credential/configuração e negativa para não Admin;
- segredo nunca retornado;
- resolver de Speech, Storage e YouTube;
- operação compartilhada sem dependência de módulo;
- Agency gate, isolamento por Brand e Connection revogada;
- ausência de Connection/grant/quota de módulo;
- ausência de chamadas automáticas ao abrir o Admin;
- falha fechada sem dependência, segredo, bucket ou API;
- estados de UI em dark mode e larguras 360/768/1024/1440.

Real external calls during automated tests: `0`. Smoke real, configuração
manual e aplicação da migration são gates posteriores, executados pelo
usuário com credenciais que não devem ser compartilhadas no chat.

## 13. Operações manuais posteriores

1. instalar os dois pacotes com o package manager canônico;
2. aplicar a migration sucessora e confirmar readback;
3. habilitar manualmente as três APIs no projeto Google Cloud;
4. criar/configurar bucket e regras de retenção fora da aplicação;
5. substituir Service Account e API key no Admin;
6. executar health check explícito de cada provider;
7. confirmar provider/capability/Connection READY e distribuir conforme plano,
   Agency e quota usando o fluxo global já existente;
8. executar smoke manual separado, sem colocar segredo no browser ou no
   repositório.

Até esses gates:

```text
READY_FOR_SPEECH_MANUAL_SMOKE = NO
READY_FOR_STORAGE_MANUAL_SMOKE = NO
READY_FOR_YOUTUBE_MANUAL_SMOKE = NO
```
