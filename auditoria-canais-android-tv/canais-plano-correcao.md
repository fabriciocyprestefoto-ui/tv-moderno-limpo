# Plano de Correcao - Canais Android TV (minimo e seguro)

## Escopo
- Apenas navegacao/foco da tela Canais no fluxo Android TV moderno.
- Sem alterar desktop.
- Sem alterar TV antiga.
- Sem trocar ExoPlayer/Media3.
- Sem refatoracao estrutural.

## Correcao aplicada (minima)
- Arquivo: pages/LiveTV.tsx
- Ajuste no botao de erro "Tentar novamente":
  - `autoFocus={!useNativeLivePlayer}`
  - `tabIndex={useNativeLivePlayer ? -1 : 0}`

## Justificativa tecnica
- Em TV moderna, `autoFocus` no overlay de erro concorria com a navegacao por D-pad da pagina.
- Remover captura forcada de foco no fluxo nativo elimina o sequestro de Enter/foco sem impactar os handlers de navegação existentes.
- A logica de retry continua disponivel por click e no fluxo nao-nativo.

## Validacao executada
1. `npm run build`
2. `npx cap copy android`
3. `android/gradlew.bat assembleDebug`
4. `adb -s 192.168.0.4:5555 install -r app-debug.apk`
5. Reproducao na TCL com keyevents via ADB + verificacao via CDP e logcat.

## Resultado
- Navegacao D-pad em Canais voltou a responder de forma consistente no fluxo Android TV moderno.

## Plano de contingencia (se voltar a ocorrer)
1. Logar transicoes de `focusedSection`, `focusedChannelIndex` e `isMenuVisible` apenas em build interno.
2. Instrumentar `window.__dispatchTVKey__` para contabilizar perda de eventos por tecla.
3. Se necessario, tratar Enter no overlay de erro para delegar ao handler da tela quando `useNativeLivePlayer=true`.
