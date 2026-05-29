Ótimo: agora tudo funcionou de forma nativa no Android TV novo/TCL.

Não mexa mais na lógica do player, ExoPlayer, HLS, fonte, CDN, timeout ou sanitização.

Novo ajuste é APENAS VISUAL/UI:

Problema:
Depois que o player nativo passou a funcionar, o layout do menu/overlay/card que aparece no player mudou.
Quero manter o funcionamento nativo, mas deixar o layout visual idêntico ao da versão desktop/html.

Objetivo:
- Android TV novo/TCL continua usando ExoPlayer nativo.
- NÃO voltar para WebView/HLS.js.
- NÃO montar video HTML.
- NÃO quebrar som.
- NÃO quebrar Canais.
- Apenas deixar o overlay/menu/card do player nativo com o mesmo visual da versão desktop/html.

Auditoria:
1. Comparar o layout atual do player nativo com o layout desktop/html:
   - card de informações;
   - menu/controles;
   - título;
   - logo;
   - botão voltar;
   - botão tentar novamente;
   - overlay de loading;
   - overlay de erro;
   - card que aparece ao trocar canal;
   - card que aparece sobre o player.

2. Localizar onde o layout do player nativo é definido:
   - ExoPlayerActivity.java
   - layout XML do player, se existir;
   - PlayerView custom controls;
   - NativePlayerPlugin;
   - overlays React que aparecem antes/depois da Activity;
   - LiveTV.tsx overlays;
   - Player.tsx/VOD overlays.

3. Localizar onde está o layout correto desktop/html:
   - LiveTV.tsx;
   - componentes Pito;
   - ChannelInfoOverlay;
   - PlayerImpl;
   - Player.tsx;
   - componentes de overlay/card usados no HTML.

4. Copiar apenas o visual/comportamento do overlay/menu/card do desktop/html para o fluxo nativo, sem trocar a engine.

Regras obrigatórias:
1. Não trocar ExoPlayer por WebView.
2. Não fazer fallback HTML na TCL.
3. Não reativar o player gigante do WebView.
4. Não alterar sourceSanitizer, SOURCE_POLICY, CDN, HLS timeout, auto-zap, failed TTL.
5. Não alterar a lógica que fez o player nativo funcionar.
6. Não mexer no catálogo.
7. Não mexer no layout geral fora do player.

Resultado esperado:
- Na TCL Android TV novo:
  - player continua nativo;
  - vídeo toca com som;
  - sem ícone gigante do WebView;
  - menu/card/overlay visualmente igual ao desktop/html;
  - controles continuam funcionando no controle remoto;
  - erro de canal segue mostrando mensagem correta;
  - botão/tela de voltar continuam funcionando.

Entrega:
- Informe quais arquivos controlam o layout nativo.
- Informe quais arquivos foram usados como referência do layout desktop/html.
- Faça alteração visual mínima.
- Rode build e instale na TCL.
- Teste filme, série e canal.


shell em segundo plano concluído
Check final state of TV Aparecida channel
TV Aparecida also dead → 18s watchdog → clean error. Two dead channels in a row, both handled gracefully. The TCL native path is fully validated. Now Fire Stick (was the only thing pending — install retry + driving).

Executado
Install native APK on Fire Stick, drive to LiveTV, capture HLS.js logs
Antes de mexer no layout do menu/card do player, faça um commit deste estado funcional.

Objetivo do commit:
Salvar o ponto em que:
- Android TV novo/TCL está usando player nativo corretamente;
- VOD/Filmes/Séries funcionam no ExoPlayer;
- Canais funcionam no ExoPlayer;
- conteúdo abre com som;
- não aparece o player gigante do WebView;
- erros de edge/CDN morto são tratados sem loading infinito;
- Fire Stick/legacy continua separado;
- SOURCE_POLICY/sanitização está estabilizada.

Depois do commit, aí sim vamos mexer apenas no visual do overlay/menu/card.

Comandos sugeridos:

git status
git add .
git commit -m "fix: stabilize native TV player and LiveTV edge handling"

Depois do commit, me informe:
- hash do commit;
- arquivos alterados;
- se ficou algo untracked;
- se o working tree ficou clean.

Parando teste Fire (ADB instável). Indo direto pro commit. Primeiro: status + diff + log em paralelo.


Executado 3 comandos
Status visto. .env ignorado (seguro). Estagiando modificações + deletions + 5 novos arquivos (utils policy/mask/sanitizer/test + MovieRow.css), excluindo screenshots/logs/scripts de debug não relacionados.

Executado
Stage tracked changes + new util files, verify
80 files staged (21 mods, 1 rename, ~55 png deletions, 4 new utils, 1 new CSS). Committing now.

Commit feito
d77b452
Commit feito. Marcando capítulo e nova tarefa para o trabalho de UI.

Tarefas atualizadas
Native UI parity with desktop
Tarefas atualizadas
Commit report
Hash: d77b452
Subject: fix: stabilize native TV player and LiveTV edge handling
Branch: main, ahead de origin/main por 1 commit (não pushed — você não pediu).
80 files changed (1349+ / 18535− — quase tudo deletion de PNGs de debug).
Arquivos alterados (categorias)
Native (player nativo + intent + manifest): ExoPlayerActivity.java, NativePlayerPlugin.java, MainActivity.java, AndroidManifest.xml, network_security_config.xml, capacitor.config.json.
LiveTV resilience: pages/LiveTV.tsx, components/LiveTVVideo.tsx, features/livetv/pito/channelAdapter.ts, services/channelsFromSupabase.ts, services/channelsService.ts, services/nativePlayerService.ts.
VOD: pages/Player.tsx, pages/AdultoPage.tsx, services/adultoService.ts.
Novos utils (criados nesta sessão): utils/sourceUrlPolicy.ts, utils/sanitizeUrlForLog.ts, utils/sourceSanitizer.ts, utils/__tests__/sourceSanitizer.test.ts.
Outros: utils/streamUrlGuards.ts, utils/tvModernoBridge.ts, utils/imageProxy.ts, components/MovieRow.tsx, components/LazyImage.tsx, index.tsx, index.css, public/sw.js, public/data/channels.json, public/adult_content_100.json, AI_HANDOFF.md.
Rename: MovieRow.module.css → components/MovieRow.css.
Deletions: ~55 PNGs de debug (tcl-*.png, test-*.png, tv-limpo-*.png, redflix-user0-open.png).
Untracked (deliberadamente NÃO commitados)
Working tree NÃO está 100% clean. Restam só artefatos de debug deste e de sessões anteriores — não deveriam ir pro repo:

PNGs: tcl-after-*.png, tcl-canais*.png, tcl-home-final.png, tcl-source-fix*.png, test-*.png, tcl-state.png, tcl-livetv-timeout-fix.png (~31 PNGs).
Logs: tcl-livetv-logcat*.txt (5 arquivos).
Scripts debug (pré-existentes): scripts/cdp-eval.cjs, click-channel.cjs, dump-root.cjs, probe-flags.cjs, probe-live.cjs.
ui-tcl.xml.
Quer que eu adicione esses paths ao .gitignore ou apague? (Não fiz por ser destrutivo.)

.env não entrou (gitignored). Tracked tree clean — tudo de código relevante salvo no d77b452.

Recebida nova missão (UI parity nativo↔desktop). Regras travadas:

ExoPlayer/HLS/CDN/timeouts/auto-zap/failure TTL/sourceSanitizer/SOURCE_POLICY = intocados.
Só visual: overlay/menu/card/loading/erro/título/logo/voltar/retry no fluxo nativo.
Build + teste TCL (filme, série, canal).
Pronto pra começar a auditoria visual (Java HUD em ExoPlayerActivity.buildPlayerHud vs React PitoChannelInfoOverlay / LiveTV.tsx overlays / desktop Player.tsx). Posso seguir?

siga o plano

Iniciando auditoria visual em paralelo: HUD nativo Java vs overlays desktop (LiveTV header, error card, info overlay, CSS).


Executado um comando, leu um arquivo
Auditoria visual completa. Diferenças principais:

Native (atual): HUD pill roxo→magenta no rodapé (0xD94E1B78...). Error overlay: backdrop preto + texto branco + botão azul 0xFF1565C0.

Desktop (alvo):

livetv-vision-floating-header (top-right): glass escuro rgba(20,20,24,0.88) + border white/16 + radius 1.25rem, logo + nome do canal, accents cyan (#06b6d4).
livetv-vision-boot (error card): glass escuro rgba(22,22,26,0.96) + radius 2rem, badge "CANAL INDISPONÍVEL" white/45 + msg + botão red-600 (#DC2626) "TENTAR NOVAMENTE".
PitoChannelInfoOverlay: LIVE chip cyan + logo redondo branco.
Aplicando 3 edits cirúrgicos em ExoPlayerActivity.java: HUD bg roxo→glass dark, AO VIVO→chip cyan, error overlay→card vision-boot + red retry.

Editado
ExoPlayerActivity.java
+93
-27
Visual edits done (HUD glass-dark, LIVE cyan chip, vision-boot error card + red retry). Only Java changed — rebuilding APK via Gradle (web assets unchanged from TV-target build).

Executado
Gradle assembleDebug (Java-only change)
Limite de uso atingido
Você atingiu seu limite de uso. Tente novamente após o limite ser redefinido.
Ver detalhes
Limite de uso atingido
