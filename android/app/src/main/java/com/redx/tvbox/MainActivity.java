package com.redx.tvbox;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.os.Build;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.atomic.AtomicBoolean;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Smart TV: quando true, não interceptamos teclas — permite teclado virtual do
     * sistema funcionar.
     * AtomicBoolean: garante visibilidade E atomicidade entre UI thread e JS bridge thread.
     */
    private final AtomicBoolean inputFocused = new AtomicBoolean(false);
    private final AtomicBoolean jsBridgeInstalled = new AtomicBoolean(false);
    // Evita dupla injeção de deviceInfo em onResume + onWindowFocusChanged no mesmo ciclo
    private final AtomicBoolean deviceInfoInjectedOnResume = new AtomicBoolean(false);

    private static final int KEYCODE_DPAD_UP = 19;
    private static final int KEYCODE_DPAD_DOWN = 20;
    private static final int KEYCODE_DPAD_LEFT = 21;
    private static final int KEYCODE_DPAD_RIGHT = 22;
    private static final int KEYCODE_DPAD_CENTER = 23;
    private static final int KEYCODE_BACK = 4;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(com.redx.tvbox.NativePlayerPlugin.class);
        super.onCreate(savedInstanceState);

        // AppValidator.validate() temporariamente bypass: EXPECTED_SIGNATURE
        // hardcoded pode não bater com keystore atual → System.exit(0) no launch.
        // Reabilitar quando SHA-256 real do APK release for confirmado.
        android.util.Log.w("RED-X", "AppValidator.validate() bypass temporário");

        // Autoplay / HTML5 video: aplicar JÁ neste frame — se só rodar em Handler.post,
        // o WebView pode carregar index.html antes de setMediaPlaybackRequiresUserGesture(false)
        // e o Chromium mostra o botão nativo de play gigante em TVs novas.
        if (configureWebViewForTV()) {
            android.util.Log.d("RED-X", "WebView TV: config imediata (autoplay sem gesto)");
        }

        // Configurar WebView com retry para garantir que está pronto (bridge/WebView tardio)
        configureWebViewForTVWithRetry();
        // NOTA: injectDeviceInfo() não é chamado aqui pois a página ainda não carregou.
        // A injeção ocorre corretamente em onResume() e onWindowFocusChanged().
    }

    /**
     * Configura WebView com retry para garantir que está pronto.
     * TVs novas podem inicializar o WebView mais tarde — múltiplos retries.
     */
    private void configureWebViewForTVWithRetry() {
        Handler handler = new Handler(Looper.getMainLooper());
        final int[] attempts = { 0 };
        final int maxAttempts = 10;

        Runnable configureTask = new Runnable() {
            @Override
            public void run() {
                if (configureWebViewForTV()) {
                    android.util.Log.d("RED-X",
                            "WebView configurado com sucesso (tentativa " + (attempts[0] + 1) + ")");
                    return;
                }

                attempts[0]++;
                if (attempts[0] < maxAttempts) {
                    handler.postDelayed(this, 100); // Retry a cada 100ms
                } else {
                    android.util.Log.e("RED-X", "Falha ao configurar WebView após " + maxAttempts + " tentativas");
                }
            }
        };

        handler.post(configureTask);
        // TVs lentas: retry extra em 500ms e 1500ms (WebView pode ser criado
        // tardiamente)
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (configureWebViewForTV())
                    android.util.Log.d("RED-X", "WebView configurado (retry 500ms)");
            }
        }, 500);
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (configureWebViewForTV())
                    android.util.Log.d("RED-X", "WebView configurado (retry 1500ms)");
            }
        }, 1500);
    }

    /**
     * Configura o WebView para funcionar corretamente em TVs:
     * - Autoplay sem gesto (remove botão play gigante)
     * - Hardware acceleration
     * - Cache otimizado
     * 
     * @return true se configurado com sucesso, false caso contrário
     */
    private boolean configureWebViewForTV() {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) {
                return false;
            }

            WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();

            // CRUCIAL: Fundo TRANSPARENTE — em TV Boxes antigos o SurfaceView
            // (decodificador de vídeo)
            // é instanciado em um plano Z inferior (atrás) do WebView. Se o WebView tiver
            // fundo opaco
            // (Color.BLACK), a camada de hardware do vídeo é completamente bloqueada!
            getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            getWindow().getDecorView().setBackgroundColor(Color.TRANSPARENT);
            webView.setBackgroundColor(Color.TRANSPARENT);
            View parent = (View) webView.getParent();
            if (parent != null) {
                parent.setBackgroundColor(Color.TRANSPARENT);
            }

            // TV: navegação é por D-pad/foco — esconder scrollbars NATIVAS do WebView
            // (a barra do viewport raiz não é estilável por CSS ::-webkit-scrollbar).
            // Scroll continua funcional; remove também o glow de overscroll.
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
            webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

            // CRUCIAL: Permitir autoplay sem gesto do usuário
            settings.setMediaPlaybackRequiresUserGesture(false);
            // Validação em TV (adb): adb logcat -s RED-X:D
            // Esperado ao abrir o player: "setMediaPlaybackRequiresUserGesture(false) aplicado"
            android.util.Log.d("RED-X", "setMediaPlaybackRequiresUserGesture(false) aplicado");

            settings.setJavaScriptEnabled(true);
            // IPTV: streams frequentemente usam HTTP mesmo em app HTTPS — permitir mixed content
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            // Desabilitar acesso a arquivos locais — não necessário para app que carrega URL HTTPS
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(true);
            settings.setLoadsImagesAutomatically(true);

            // Smart TV: permitir sugestões de e-mail (autocomplete) — em Android < 8 usa
            // setSaveFormData
            if (Build.VERSION.SDK_INT < 26) {
                settings.setSaveFormData(true);
            }

            // NÃO forçar LAYER_TYPE_HARDWARE no WebView:
            // Em TV Boxes (Allwinner, Rockchip, MediaTek), LAYER_TYPE_HARDWARE impede que a
            // hardware video overlay seja visível (som funciona, tela preta).
            // O manifest já tem android:hardwareAccelerated="true" que é suficiente.
            android.util.Log.d("RED-X", "setLayerType: usando padrão do sistema (manifest hardwareAccelerated=true)");

            // Forçar configurações de viewport
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);

            // Smart TV: bridge para JS notificar quando input/textarea está focado —
            // permite teclado virtual do sistema.
            // compareAndSet(false, true): instala a bridge apenas UMA vez, mesmo se
            // configureWebViewForTV() for chamado de múltiplas threads (retry, onResume, etc.)
            if (jsBridgeInstalled.compareAndSet(false, true)) {
                webView.addJavascriptInterface(new Object() {
                    @JavascriptInterface
                    public void setInputFocused(boolean focused) {
                        inputFocused.set(focused);
                        android.util.Log.d("RED-X", "Input focused: " + focused + " — teclas "
                                + (focused ? "passam ao WebView" : "interceptadas"));
                    }

                    @JavascriptInterface
                    public void logPlayer(String message) {
                        if (message == null)
                            message = "";
                        String s = message.length() > 4000 ? message.substring(0, 4000) + "…" : message;
                        android.util.Log.d("RED-X", "Player: " + s);
                    }
                }, "RedxAndroidBridge");

                // Bridge oficial TV Moderno: web chama window.Android.openPlayer(url, title, type, poster)
                webView.addJavascriptInterface(new Object() {
                    @JavascriptInterface
                    public void openPlayer(String url, String title, String type, String poster) {
                        if (url == null || url.trim().isEmpty()) return;
                        try {
                            Intent intent = new Intent(MainActivity.this, ExoPlayerActivity.class);
                            intent.putExtra(ExoPlayerActivity.EXTRA_URL, url);
                            if (title != null)  intent.putExtra(ExoPlayerActivity.EXTRA_TITLE, title);
                            if (type != null)   intent.putExtra(ExoPlayerActivity.EXTRA_TYPE, type);
                            if (poster != null) intent.putExtra(ExoPlayerActivity.EXTRA_POSTER, poster);
                            if ("live".equalsIgnoreCase(type)) {
                                intent.putExtra(ExoPlayerActivity.EXTRA_IS_LIVE, true);
                            }
                            startActivity(intent);
                            android.util.Log.d("RED-X", "openPlayer → " + maskUrlForLog(url));
                        } catch (Exception e) {
                            android.util.Log.e("RED-X", "openPlayer failed: " + e.getMessage());
                        }
                    }

                    /** Heartbeat: web verifica disponibilidade do bridge nativo. */
                    @JavascriptInterface
                    public boolean isAvailable() { return true; }
                }, "Android");
            }

            // NOTA: WebChromeClient e WebViewClient NÃO são sobrescritos aqui — Capacitor precisa
            // dos próprios pra bridge. Bloqueio de player WebView é feito 100% no lado web:
            // - Nenhum <video> é montado quando window.Android.openPlayer existe.
            // - Vídeo abre direto no ExoPlayerActivity nativo via bridge JS.

            return true;

        } catch (Exception e) {
            android.util.Log.e("RED-X", "Erro ao configurar WebView: " + e.getMessage());
            e.printStackTrace();
            return false;
        }
    }

    private static boolean isSensitiveQueryKey(String key) {
        if (key == null) return false;
        return key.equalsIgnoreCase("token")
                || key.equalsIgnoreCase("access_token")
                || key.equalsIgnoreCase("auth")
                || key.equalsIgnoreCase("authorization")
                || key.equalsIgnoreCase("signature")
                || key.equalsIgnoreCase("sig")
                || key.equalsIgnoreCase("expires")
                || key.equalsIgnoreCase("expires_at")
                || key.equalsIgnoreCase("key")
                || key.equalsIgnoreCase("jwt");
    }

    private static String maskUrlForLog(String raw) {
        if (raw == null || raw.trim().isEmpty()) return "";
        try {
            android.net.Uri uri = android.net.Uri.parse(raw);
            if (uri.getHost() == null) {
                return raw.replaceAll("(?i)([?&](?:token|access_token|auth|authorization|signature|sig|expires|expires_at|key|jwt)=)[^&\\s]+", "$1***MASKED***");
            }
            StringBuilder out = new StringBuilder();
            out.append(uri.getHost());
            if (uri.getPort() >= 0) out.append(":").append(uri.getPort());
            String path = uri.getEncodedPath();
            if (path != null) out.append(path);
            String query = uri.getEncodedQuery();
            if (query != null && !query.isEmpty()) {
                out.append("?");
                String[] parts = query.split("&");
                for (int i = 0; i < parts.length; i++) {
                    if (i > 0) out.append("&");
                    String part = parts[i];
                    int eq = part.indexOf('=');
                    String key = eq >= 0 ? part.substring(0, eq) : part;
                    if (isSensitiveQueryKey(android.net.Uri.decode(key))) {
                        out.append(key).append("=***MASKED***");
                    } else {
                        out.append(part);
                    }
                }
            }
            return out.toString();
        } catch (Exception ignored) {
            return raw.replaceAll("(?i)([?&](?:token|access_token|auth|authorization|signature|sig|expires|expires_at|key|jwt)=)[^&\\s]+", "$1***MASKED***");
        }
    }

    /**
     * Método seguro para executar JavaScript no WebView
     */
    private void runJS(String jsCode) {
        if (getBridge() == null) return;
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(jsCode, null));
    }

    /**
     * Injetar informações do dispositivo no JavaScript
     */
    private void injectDeviceInfo() {
        try {
            int apiLevel = Build.VERSION.SDK_INT;
            String deviceModel = Build.MODEL != null ? Build.MODEL : "";
            String manufacturer = Build.MANUFACTURER != null ? Build.MANUFACTURER : "";
            boolean isFirestick = deviceModel.contains("AFT") || manufacturer.contains("Amazon");

            JSONObject d = new JSONObject();
            d.put("apiLevel", apiLevel);
            d.put("device", deviceModel);
            d.put("manufacturer", manufacturer);
            d.put("isFirestick", isFirestick);
            d.put("supportsHLS", apiLevel >= 21);
            d.put("supportsMSE", apiLevel >= 16);
            d.put("supportsHTML5", apiLevel >= 16);

            String json = d.toString();
            String jsCode = "(function(){try{var d=" + json + ";"
                    + "window.__ANDROID_VERSION__=d.apiLevel;"
                    + "window.__DEVICE_NAME__=String(d.device!=null?d.device:'');"
                    + "window.__MANUFACTURER__=String(d.manufacturer!=null?d.manufacturer:'');"
                    + "window.__DEVICE_INFO__=d;"
                    + "console.log('RED-X Device Info Injected:',d);"
                    + "}catch(e){console.error('RED-X injectDeviceInfo',e);}})();";

            runJS(jsCode);

        } catch (JSONException e) {
            android.util.Log.e("RED-X", "injectDeviceInfo JSON: " + e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * Intercepta TODAS as teclas D-pad/Back ANTES do sistema e WebView.
     * Consome ACTION_DOWN e ACTION_UP para que NENHUM evento chegue ao
     * BridgeActivity (que chama onBackPressed ao receber ACTION_UP do BACK).
     * Apenas ACTION_DOWN injeta o evento no JavaScript.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Smart TV: quando input/textarea focado, passar TODAS as teclas ao WebView —
        // teclado virtual do sistema funciona
        if (inputFocused.get()) {
            return super.dispatchKeyEvent(event);
        }

        int keyCode = event.getKeyCode();

        // Verificar se é uma tecla que gerenciamos
        // Inclui keycodes padrão + keycodes alternativos de TV Boxes brasileiras (STB,
        // Elsys, etc.)
        boolean isOurKey = false;
        String keyName = null;
        switch (keyCode) {
            case KEYCODE_DPAD_UP:
            case 268: // KEYCODE_DPAD_UP_LEFT (268) — alguns STBs/TV Boxes brasileiros
                isOurKey = true;
                keyName = "ArrowUp";
                break;
            case KEYCODE_DPAD_DOWN:
            case 270: // KEYCODE_DPAD_DOWN_LEFT (270) — alguns STBs/TV Boxes brasileiros
                isOurKey = true;
                keyName = "ArrowDown";
                break;
            case KEYCODE_DPAD_LEFT:
                isOurKey = true;
                keyName = "ArrowLeft";
                break;
            case KEYCODE_DPAD_RIGHT:
                isOurKey = true;
                keyName = "ArrowRight";
                break;
            case KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case 160: // KEYCODE_NUMPAD_ENTER
                isOurKey = true;
                keyName = "Enter";
                break;
            case KEYCODE_BACK:
                isOurKey = true;
                keyName = "Backspace";
                break;
            case 82: // KEYCODE_MENU — botão Menu do controle remoto Android TV
                isOurKey = true;
                keyName = "ContextMenu";
                break;
            case 166: // KEYCODE_CHANNEL_UP
                isOurKey = true;
                keyName = "ChannelUp";
                break;
            case 167: // KEYCODE_CHANNEL_DOWN
                isOurKey = true;
                keyName = "ChannelDown";
                break;
            case 183: // KEYCODE_PROG_RED — botão vermelho TV/STB
                isOurKey = true;
                keyName = "ColorRed";
                break;
            case 184: // KEYCODE_PROG_GREEN — botão verde TV/STB
                isOurKey = true;
                keyName = "ColorGreen";
                break;
            case 185: // KEYCODE_PROG_YELLOW — botão amarelo TV/STB
                isOurKey = true;
                keyName = "ColorYellow";
                break;
            case 186: // KEYCODE_PROG_BLUE — botão azul TV/STB
                isOurKey = true;
                keyName = "ColorBlue";
                break;
            case KeyEvent.KEYCODE_0:
                isOurKey = true;
                keyName = "0";
                break;
            case KeyEvent.KEYCODE_1:
            case KeyEvent.KEYCODE_2:
            case KeyEvent.KEYCODE_3:
            case KeyEvent.KEYCODE_4:
            case KeyEvent.KEYCODE_5:
            case KeyEvent.KEYCODE_6:
            case KeyEvent.KEYCODE_7:
            case KeyEvent.KEYCODE_8:
            case KeyEvent.KEYCODE_9:
                isOurKey = true;
                keyName = String.valueOf(keyCode - KeyEvent.KEYCODE_1 + 1);
                break;
            default:
                break;
        }

        if (!isOurKey) {
            if (BuildConfig.DEBUG) {
                android.util.Log.w("RED-X", "Key nao mapeada: " + keyCode + " (adicione ao switch para suporte)");
            }
            return super.dispatchKeyEvent(event);
        }

        // Injetar no JavaScript apenas no ACTION_DOWN (evitar duplicata de key repeat)
        if (event.getAction() == KeyEvent.ACTION_DOWN && keyName != null) {
            // Log apenas em DEBUG — em TV Box com CPU fraca, Log.d a cada tecla impacta performance
            if (BuildConfig.DEBUG) {
                android.util.Log.d("RED-X", "Key intercepted: " + keyCode + " → " + keyName);
            }
            injectKeyEvent(keyName);
        }

        // Consumir ACTION_DOWN e ACTION_UP — BridgeActivity nunca chama onBackPressed
        return true;
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Todas as teclas D-pad/Back já foram consumidas em dispatchKeyEvent
        return super.onKeyDown(keyCode, event);
    }

    /**
     * Enviar evento de tecla para o JavaScript
     */
    private void injectKeyEvent(String keyName) {
        try {
            String jsCode = "(function() { " +
                    "window.__dispatchTVKey__ && window.__dispatchTVKey__('" + keyName + "'); " +
                    "})();";

            runJS(jsCode);

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Pausar reprodução quando tela apaga ou app vai para background.
        // Sem isso, o vídeo continua tocando com a tela desligada (drena bateria em
        // celulares/tablets e viola políticas de loja).
        runJS("(function(){ try { " +
              "  var vs = document.querySelectorAll('video'); " +
              "  for (var i = 0; i < vs.length; i++) { if (!vs[i].paused) vs[i].pause(); } " +
              "  window.__redx_paused_by_system__ = true; " +
              "} catch(e){} })();");
        android.util.Log.d("RED-X", "onPause: vídeo pausado pelo sistema");
    }

    @Override
    public void onResume() {
        super.onResume();
        // Reaplicar autoplay ao voltar do background (evita botão play gigante em TVs novas)
        configureWebViewForTV();
        deviceInfoInjectedOnResume.set(true);
        injectDeviceInfo();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            // Reaplicar autoplay quando a janela ganha foco (WebView pode ter sido recriado)
            configureWebViewForTV();
            // Evitar dupla injeção: onWindowFocusChanged é chamado logo após onResume no mesmo ciclo
            if (!deviceInfoInjectedOnResume.compareAndSet(true, false)) {
                injectDeviceInfo();
            }
        }
    }
}
