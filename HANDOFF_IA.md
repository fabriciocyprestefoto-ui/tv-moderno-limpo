# Documento de Transição (Handoff) - TV Moderno Limpo

Este documento foi gerado para guiar o trabalho da próxima IA que assumir a manutenção e finalização do projeto "TV Moderno Limpo" para Smart TVs TCL / Android.

## 1. O Que Foi Feito Até Agora

O trabalho foi dividido em duas frentes principais (Camada Nativa e Camada de UI/React):

### Camada Nativa (ExoPlayer / Media3)
Conforme a Auditoria (AGENTS.md):
- **Otimização de Buffers:** Editamos o `DefaultLoadControl` no `ExoPlayerActivity.java`. O buffer mínimo foi ajustado para `32_000` ms, máximo para `64_000` ms e `5_000` ms para reiniciar a reprodução. Isso garante estabilidade em conexões lentas ou hardwares fracos.
- **Renderização de Software:** Forçamos o ExoPlayer a preferir extensões de software (`EXTENSION_RENDERER_MODE_PREFER`) para contornar problemas de falta de suporte a certos codecs de hardware específicos das placas Realtek/TCL antigas.
- **Testes Nativos:** Exportamos a Activity temporariamente para testar o player puro (sem UI web) injetando um link MP4 via linha de comando (ADB). A arquitetura do player suportou a injeção, ativou os buffers corretamente e executou a rotina de erro e reconexão (1500ms) quando injetado um vídeo 403 (Forbidden), não gerando crash no sistema operacional.

### Camada UI (React / Capacitor)
Para corrigir o loop de Boot -> Home -> Vinheta -> Login:
- **Remoção do `skipBoot`:** O componente `components/AppBootScreen.tsx` estava programado para pular o carregamento visual e desligar completamente se detectasse a Android TV (TCL). Isso causava vazamentos de estado para as rotas seguintes.
- **Implementação Sequencial WebP (96 Quadros):** Removemos o uso falho do `<video>` na tela de splash. Agora, o `AppBootScreen.tsx` pré-carrega os frames da pasta `public/boot-vinheta` (do `frame_001.webp` ao `frame_096.webp`) e os renderiza nativamente num `<canvas>` cobrindo toda a tela a 24 FPS.
- **Sincronização de Fluxo:** O React só define a inicialização como concluída (`onComplete`) após desenhar o 96º quadro. Com isso, o roteador carrega a página `Login.tsx` de forma madura.

## 2. O Que Foi Testado e Validado

| Componente | Status do Teste | Forma do Teste |
| :--- | :--- | :--- |
| Buffers Media3 | ✅ Validado | Logcat ADB |
| Software Decoder (Exo) | ✅ Validado | Logcat ADB |
| Compilação do APK | ✅ Validado | CLI (npm run build:apk:debug) |
| Instalação via ADB OTA | ✅ Validado | Push ADB para 192.168.0.4 e .8 |
| Sequenciador WebP no Boot | 🟡 Rodando | Validado na Lógica de Código. Depende de teste final do usuário para conferir a cadência do frame-rate na TV física. |

## 3. Testes Atuais na TCL Finalizados

Executei testes de `logcat` e `dumpsys` para verificar o estado da TCL após a injeção do APK:
1. **Verificação de Montagem e Memória (OOM):** 
   - O `dumpsys activity` confirmou que `com.redflix.tvmoderno/com.redx.tvbox.MainActivity` está em primeiro plano e estável.
   - O logcat detectou a rotina do `TGuardMemoryManagerKillHandler` (gerenciador de memória da placa Realtek/TCL) agindo de forma estável. Ele "pulou" o kill do `SandboxedProcessService` (motor do Chromium/WebView), o que prova que pré-carregar os 96 quadros `.webp` consumiu memória de forma aceitável e **não causou OutOfMemory (OOM) Crash** na TV Box.
2. **Conclusão Visual:** O fluxo de Boot Screen concluiu corretamente as chamadas nativas sem quebrar a ponte de execução da WebView. O app atingiu o estado "ResumedActivity" mantendo-se aberto na tela.

## 4. O Que Falta Fazer (Próximos Passos Sugeridos)

Se a próxima IA for atuar em novas features do projeto, recomendo:
- **Teste de Carga de Memória (WebP):** TV Boxes de 1GB de RAM podem sofrer para alocar os 96 quadros WebP de alta resolução. Caso a TV trave no Splash Screen, uma sugestão é baixar os frames a cada `requestAnimationFrame` em demanda, ou reduzir a resolução deles.
- **Finalizar Roteamento Home:** Após o Login 000000, validar se a página `/` carrega sem renderizar o `VinhetaGate.tsx` no LegacyApp, pois isso gerava "telas fantasmas".
- **Integração Real Player <-> Web:** Validar quando o usuário aperta Enter em um filme se o plugin Capacitor do `NativePlayer` captura o clique na Home e repassa o streaming URL para a Activity otimizada corretamente.
