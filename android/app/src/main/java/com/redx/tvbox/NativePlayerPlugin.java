package com.redx.tvbox;

import android.content.Intent;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

    private static final String TAG = "RED-X-Plugin";

    @PluginMethod
    public void play(PluginCall call) {
        Log.i(TAG, "NativePlayer.play() invocado");

        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            Log.e(TAG, "play() rejeitado: URL vazia");
            call.reject("URL é obrigatória");
            return;
        }
        Log.i(TAG, "URL: " + maskUrlForLog(url));

        String title = call.getString("title", "");
        String year = call.getString("year", "");
        String logo = call.getString("logo", "");
        String type = call.getString("type", "movie");
        String poster = call.getString("poster", "");
        String introUrl = call.getString("introUrl", "");
        int position = call.getInt("position", 0);
        boolean isLive = call.getBoolean("isLive", false) || "live".equalsIgnoreCase(type);
        Log.i(TAG, "[NativePlayer] start " + (isLive ? "live" : "vod") + " url=" + maskUrlForLog(url));

        android.app.Activity activity = getActivity();
        if (activity == null) {
            Log.e(TAG, "play() rejeitado: Activity nula");
            call.reject("Activity nula no NativePlayer");
            return;
        }

        // Media3 1.2.0 minSdk=19 — funciona em Android 4.4+. Não precisa fork
        // ExoPlayer 2.x. Atividade única reduz superfície de bug e evita conflito
        // de classpath (com.google.android.exoplayer2 vs androidx.media3).
        Intent intent = new Intent(activity, ExoPlayerActivity.class);
        intent.putExtra(ExoPlayerActivity.EXTRA_URL, url);
        intent.putExtra(ExoPlayerActivity.EXTRA_TITLE, title);
        if (year != null && !year.isEmpty()) {
            intent.putExtra(ExoPlayerActivity.EXTRA_YEAR, year);
        }
        if (logo != null && !logo.isEmpty()) {
            intent.putExtra(ExoPlayerActivity.EXTRA_LOGO, logo);
        }
        intent.putExtra(ExoPlayerActivity.EXTRA_TYPE, type);
        if (poster != null && !poster.isEmpty()) {
            intent.putExtra(ExoPlayerActivity.EXTRA_POSTER, poster);
        }
        if (introUrl != null && !introUrl.isEmpty()) {
            intent.putExtra(ExoPlayerActivity.EXTRA_INTRO_URL, introUrl);
        }
        intent.putExtra(ExoPlayerActivity.EXTRA_POSITION, position);
        intent.putExtra(ExoPlayerActivity.EXTRA_IS_LIVE, isLive);

        JSObject headersObj = call.getObject("headers");
        if (headersObj != null) {
            String[] flat = flattenHeaders(headersObj);
            if (flat.length > 0) {
                intent.putExtra(ExoPlayerActivity.EXTRA_HEADERS, flat);
            }
        }

        // Pausa qualquer media HTML5 residual sem esconder o WebView.
        // Esconder o WebView antes do launch causa tela preta caso a Activity nao abra
        // ou feche cedo por erro de runtime.
        try {
            final android.webkit.WebView wv = getBridge() != null ? getBridge().getWebView() : null;
            if (wv != null) {
                wv.post(() -> {
                    try {
                        wv.evaluateJavascript(
                            "(function(){try{document.querySelectorAll('video').forEach(v=>{try{v.pause();v.removeAttribute('src');v.load();}catch(e){}});}catch(e){}})();",
                            null);
                        wv.setVisibility(android.view.View.VISIBLE);
                    } catch (Exception ignored) {}
                });
            }
        } catch (Exception ignored) {}

        intent.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION);
        Log.i(TAG, "Lançando ExoPlayerActivity (Media3) via NativePlayer");
        activity.runOnUiThread(() -> {
            try {
                Log.i(TAG, "startActivityForResult: antes");
                startActivityForResult(call, intent, "playerActivityResult");
                Log.i(TAG, "startActivityForResult: depois");
            } catch (Exception e) {
                Log.e(TAG, "startActivityForResult falhou", e);
                restoreWebViewVisibility();
                call.reject("startActivityForResult: " + e.getMessage());
            }
        });
    }

    @ActivityCallback
    private void playerActivityResult(PluginCall call, ActivityResult result) {
        // Restaura WebView ao voltar
        restoreWebViewVisibility();

        if (call == null) {
            Log.w(TAG, "playerActivityResult: call null");
            return;
        }
        Intent data = result.getData();
        int resultCode = result.getResultCode();

        if (resultCode == android.app.Activity.RESULT_CANCELED) {
            JSObject ret = new JSObject();
            ret.put("position", 0);
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        if (data != null && data.getBooleanExtra(ExoPlayerActivity.RESULT_ERROR, false)) {
            String message = data.getStringExtra(ExoPlayerActivity.RESULT_ERROR_MESSAGE);
            if (message == null || message.trim().isEmpty()) {
                message = "Canal indisponível ou servidor não respondeu.";
            }
            call.reject(message);
            return;
        }

        int position = 0;
        if (data != null && data.hasExtra(ExoPlayerActivity.RESULT_POSITION)) {
            position = data.getIntExtra(ExoPlayerActivity.RESULT_POSITION, 0);
        }
        String action = "";
        if (data != null && data.hasExtra(ExoPlayerActivity.RESULT_ACTION)) {
            action = data.getStringExtra(ExoPlayerActivity.RESULT_ACTION);
        }

        JSObject ret = new JSObject();
        ret.put("position", position);
        ret.put("cancelled", false);
        if (action != null && !action.isEmpty()) {
            ret.put("action", action);
        }
        call.resolve(ret);
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

    private void restoreWebViewVisibility() {
        try {
            final android.webkit.WebView wv = getBridge() != null ? getBridge().getWebView() : null;
            if (wv != null) {
                wv.post(() -> {
                    try { wv.setVisibility(android.view.View.VISIBLE); } catch (Exception ignored) {}
                });
            }
        } catch (Exception ignored) {}
    }

    private String[] flattenHeaders(JSObject obj) {
        List<String> pairs = new ArrayList<>();
        try {
            JSONArray names = obj.names();
            if (names == null) return new String[0];
            for (int i = 0; i < names.length(); i++) {
                String key = names.getString(i);
                Object val = obj.get(key);
                if (val == null) continue;
                pairs.add(key);
                pairs.add(String.valueOf(val));
            }
        } catch (JSONException ignored) { }
        return pairs.toArray(new String[0]);
    }
}
