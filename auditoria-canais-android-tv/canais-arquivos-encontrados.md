# Auditoria Canais Android TV (TCL) - Arquivos Reais Encontrados

## Núcleo da página Canais
- pages/LiveTV.tsx
- features/livetv/pito/Sidebar.tsx
- features/livetv/pito/ChannelGrid.tsx
- features/livetv/pito/ChannelInfoOverlay.tsx

## Sistema de foco/navegação (web)
- pages/LiveTV.tsx:251 (estado de foco por seção)
- pages/LiveTV.tsx:646 (handleSelectChannel / abertura de canal)
- pages/LiveTV.tsx:703 (openLiveChannel)
- pages/LiveTV.tsx:957 (handler global de keydown da tela Canais)
- hooks/useRemoteNavigation.ts (handler global do app, com bypass quando LiveTV ativo)
- hooks/useRemoteControl.tsx (normalização de teclas)

## Bridge de input Android TV
- index.html:45 (window.__dispatchTVKey__)
- index.html:85 (gate por flags de tela ativa, ex. __livetvActive)
- index.html:98 (atalho para Enter/Space no elemento focado)
- android/app/src/main/java/com/redx/tvbox/MainActivity.java:341 (dispatchKeyEvent)
- android/app/src/main/java/com/redx/tvbox/MainActivity.java:461 (injectKeyEvent)

## Branch Android novo vs desktop/legacy
- config/runtimeFlags.ts
- pages/LiveTV.tsx:264 (useNativeLivePlayer)
- pages/LiveTV.tsx:415 (pipeline HTML5 quando NAO nativo)
- pages/LiveTV.tsx:732 (pipeline NativePlayer quando nativo)

## Pontos obrigatórios verificados
- foco perdido: pages/LiveTV.tsx + validação em runtime via CDP/ADB
- overlay invisível: liveStreamError overlay em pages/LiveTV.tsx:1421
- z-index/pointer-events: pages/LiveTV.tsx:1547, 1555, 1600 + index.css (classes LiveTV)
- tabIndex: features/livetv/pito/Sidebar.tsx:44/88 e ChannelGrid.tsx:111
- keydown Arrow/Enter: pages/LiveTV.tsx:957 + index.html bridge
- input keyevent Android TV: MainActivity.java:341-449
- scrollIntoView: features/livetv/pito/ChannelGrid.tsx:38
- virtualização da grade: features/livetv/pito/ChannelGrid.tsx:71-76
- cálculo de colunas/itens visíveis: features/livetv/pito/ChannelGrid.tsx:49
- menu lateral roubando foco: estado focusedSection em pages/LiveTV.tsx
- função que abre canal/player: pages/LiveTV.tsx:646/703 e playNative em pages/LiveTV.tsx:732+
