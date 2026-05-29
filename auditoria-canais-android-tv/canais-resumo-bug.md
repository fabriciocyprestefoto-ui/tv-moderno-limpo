# Resumo Técnico do Bug - Canais (Android TV nova / TCL)

Data: 2026-05-28
Dispositivo auditado: TCL Android TV (192.168.0.4:5555)
Pacote: com.redflix.tvmoderno

## Objetivo da auditoria
Diagnosticar por que a navegacao via controle remoto (D-pad) na tela Canais aparentava nao funcionar no fluxo Android TV moderno.

## Reproducao executada via ADB
1. App aberto na TCL e conectado via ADB.
2. Navegacao para /canais feita via CDP no WebView em execucao no dispositivo.
3. Sequencias D-pad injetadas via `adb shell input keyevent`.
4. Coleta de logcat e estado de DOM/foco (CDP) antes e depois.

## Evidencias principais coletadas
- Eventos D-pad chegam ao JS da tela Canais (captura runtime):
  - keys recebidas: ["ArrowDown","ArrowDown","ArrowRight","Enter"]
- Antes da correcao, havia cenario recorrente com foco preso no botao "Tentar novamente" (overlay de erro), com sintomas de navegacao inconsistente.
- O bridge nativo estava ativo e funcional:
  - MainActivity intercepta e injeta keyevent (dispatchKeyEvent + injectKeyEvent).
- Abertura de player/canal continuava funcional pelo caminho nativo quando Enter era processado no contexto correto.

### Evidencia de comandos (amostra)
- CDP (estado antes):
  - `{"path":"/canais","livetv":true,"menuVisible":true,"focused":{"tag":"BUTTON","focusText":"Tentar novamente"}}`
- ADB keyevents + CDP (captura de teclas):
  - `{"path":"/canais","keys":["ArrowDown","ArrowDown","ArrowRight","Enter"],"focusTag":"BODY"}`
- Pos-correcao (estado inicial em /canais):
  - `{"path":"/canais","focusTag":"BUTTON","focusText":"VOLTAR"}`

## Causa raiz identificada
Na tela Canais, quando `liveStreamError` era exibido, o botao "Tentar novamente" estava com `autoFocus` no fluxo TV moderno, capturando foco do DOM e competindo com a navegacao por estado interno (`focusedSection`, `focusedChannelIndex`).

Em TV moderna, o fluxo de D-pad depende do handler global da pagina (`window.addEventListener('keydown', ..., {capture:true})`), mas com foco inicial preso no botao de erro o comportamento percebido ficava "travado"/inconsistente para o usuario.

## Correcao minima aplicada
Arquivo alterado: pages/LiveTV.tsx

Bloco do botao "Tentar novamente" (overlay de erro):
- `autoFocus` passou de sempre ligado para condicional:
  - `autoFocus={!useNativeLivePlayer}`
- `tabIndex` passou a ser:
  - `tabIndex={useNativeLivePlayer ? -1 : 0}`

Efeito: no fluxo Android TV moderno (nativo), o botao de erro nao sequestra foco inicial; no fluxo nao-nativo (web/legacy), comportamento anterior e mantido.

## Validacao pos-correcao (ADB)
- Build gerada e instalada na TCL com sucesso (`assembleDebug` + `adb install -r`).
- Reteste em /canais:
  - foco inicial voltou para navegacao da tela (ex.: "VOLTAR"), nao no botao de erro.
  - D-pad voltou a produzir mudanca de estado/selecoes da tela.
  - Enter voltou a seguir o fluxo esperado da pagina, sem se prender ao botao de erro por foco forcado.

## Status
Bug auditado, reproduzido, corrigido com mudanca minima e validado via ADB.
