FASE 1 — AUDITORIA DO PLAYER ANDROID TV

Atue como Engenheiro Android Sênior especialista em Android TV, Jetpack Media3, ExoPlayer, WebView/Capacitor, React/TypeScript e navegação por controle remoto.

Antes de qualquer coisa, leia o arquivo AGENTS.md da raiz do projeto.

IMPORTANTE:
Nesta fase você NÃO deve alterar nenhum código.
Não instale dependências.
Não rode refatoração.
Não recrie UI.
Não aplique Compose for TV.
Não mexa em Supabase, login, layout ou P2P.
Não remova fallback.
Não quebre o fluxo legacy.

Contexto real do projeto:

O aplicativo é híbrido:

React / TypeScript / Capacitor / WebView
+
ponte nativa Android
+
player nativo ExoPlayer/Media3 para Android novo quando disponível.

O projeto começou com a ideia de 2 APKs separados:
1. Legacy para Fire Stick / Android antigo / TV Box fraca usando WebView + HLS.js + fallback.
2. Moderno para TCL / Google TV / Android TV novo usando player nativo ExoPlayer/Media3.

Depois evoluiu para um único projeto com comportamento separado por flags/gates/runtime.

Arquitetura correta atual:

1. Fluxo Legacy:
- Fire Stick antigo;
- Android antigo;
- TV Box fraca;
- WebView + HLS.js + fallback;
- deve continuar funcionando.

2. Fluxo Moderno:
- TCL;
- Google TV;
- Android TV novo;
- deve usar player nativo ExoPlayer/Media3 quando disponível;
- WebView deve servir apenas para UI, catálogo e navegação;
- WebView/Chromium não deve assumir o vídeo indevidamente.

Objetivo desta auditoria:

Faça uma varredura na base de código e responda, sem alterar nada:

1. Onde está a lógica que decide entre fluxo legacy e fluxo moderno?
2. Quais flags, gates, runtime checks ou bridges fazem essa separação?
3. Filmes estão corretamente roteados para ExoPlayer/Media3 no fluxo moderno?
4. Séries/episódios estão corretamente roteados para ExoPlayer/Media3 no fluxo moderno?
5. Canais ao vivo estão corretamente roteados para ExoPlayer/Media3 no fluxo moderno?
6. Existe algum ponto onde filmes, séries ou canais ainda caem no WebView acidentalmente no Android novo?
7. O projeto já utiliza androidx.media3:media3-exoplayer?
8. Quais dependências atuais existem no build.gradle, libs.versions.toml ou arquivos equivalentes?
9. Existe DefaultLoadControl customizado no código nativo?
10. Os buffers estão adequados para TV Box com rede instável?
   Referência desejada:
   - buffer mínimo próximo de 32s;
   - buffer máximo próximo de 64s;
   - buffer para iniciar/reiniciar próximo de 5s.
11. Existe DefaultRenderersFactory customizado?
12. Existe uso de EXTENSION_RENDERER_MODE_PREFER ou alternativa parecida?
13. O ciclo de vida do player está correto?
   Verificar:
   - onPause;
   - onResume, se existir;
   - onDestroy;
   - release();
   - pause();
14. A tela é mantida ligada durante reprodução?
   Verificar FLAG_KEEP_SCREEN_ON ou equivalente.
15. O onShowCustomView, WebChromeClient ou equivalente está bloqueado/controlado no fluxo moderno?
16. Existe risco do Chromium/WebView assumir fullscreen por cima do player nativo?
17. Como está o comportamento do D-Pad/foco no player?
18. Como está o comportamento do botão Voltar/Back quando o player nativo está aberto?
19. Existe algum risco de loading infinito?
20. Existe algum risco de uma correção no Android novo quebrar o Android antigo?

Arquivos para verificar com atenção:

- pages/Player.tsx
- pages/LiveTV.tsx
- pages/AdultoPage.tsx
- components/LiveTVVideo.tsx
- components/VinhetaGate.tsx
- src/services/nativePlayerService.ts
- src/services/tvModernoBridge.ts
- src/config/runtimeFlags.ts
- src/types.ts
- android/app/build.gradle
- android/build.gradle
- gradle/libs.versions.toml
- android/app/src/main/AndroidManifest.xml
- android/app/src/main/java/
- qualquer arquivo com:
  - ExoPlayer
  - Media3
  - NativePlayer
  - MainActivity
  - WebView
  - WebChromeClient
  - onShowCustomView
  - fullscreen
  - HLS
  - Hls.js
  - fallback
  - Capacitor bridge

Formato obrigatório da resposta:

1. Resumo geral da auditoria
2. Mapa do fluxo legacy
3. Mapa do fluxo moderno
4. Onde o projeto decide entre legacy e moderno
5. Situação de filmes
6. Situação de séries/episódios
7. Situação de canais ao vivo
8. Dependências Media3/ExoPlayer encontradas
9. Configuração atual de buffer
10. Configuração atual de renderização/decoder
11. Ciclo de vida do player
12. WebView/onShowCustomView/fullscreen
13. D-Pad/foco/back button
14. Problemas encontrados
15. Correção mínima recomendada
16. Risco para Android antigo
17. Próximo prompt seguro para aplicar a correção

Não altere código nesta fase.
Apenas audite e entregue o relatório.