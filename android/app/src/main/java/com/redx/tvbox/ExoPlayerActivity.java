package com.redx.tvbox;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import java.util.HashMap;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.Map;

/**
 * Player nativo fullscreen baseado em Media3 ExoPlayer.
 *
 * Substitui o WebView <video> nas reproduções encaminhadas pelo NativePlayerPlugin.
 * Suporta VOD (filmes/séries) e Live/HLS no fluxo TV moderno, mantendo o fallback
 * HTML5/WebView controlado no lado React para Firestick/Android antigo.
 *
 * Recebe via Intent extras:
 *   url           (String, obrigatório)  URL do stream (m3u8, mp4, mkv, etc.)
 *   title         (String)               Título exibido durante buffer/erro.
 *   type          (String)               "live" | "movie" | "series" — controla seek/resume.
 *   poster        (String)               URL de pôster mostrado enquanto buffer.
 *   position      (int, segundos)        Posição inicial (ignorada se type=live).
 *   isLive        (boolean)              Legacy — sinônimo de type=live.
 *   introUrl      (String)               Vinheta tocada antes do main stream (file:// ou https).
 *   headers       (String[] ou JSON)     Pares chave/valor ou objeto JSON simples.
 *
 * Devolve em RESULT_OK:
 *   position      (int, segundos)        Posição final para watchProgress.
 *   action        (String)               Opcional: "channelUp" | "channelDown" para LiveTV.
 */
public class ExoPlayerActivity extends Activity {

    private static final String TAG = "RED-X-Player";

    public static final String EXTRA_URL        = "url";
    public static final String EXTRA_TITLE      = "title";
    public static final String EXTRA_YEAR       = "year";
    public static final String EXTRA_LOGO       = "logo";
    public static final String EXTRA_TYPE       = "type";
    public static final String EXTRA_POSTER     = "poster";
    public static final String EXTRA_POSITION   = "position";
    public static final String EXTRA_IS_LIVE    = "isLive";
    public static final String EXTRA_HEADERS    = "headers";
    /** URL opcional de vinheta tocada antes do main stream (file:// ou https). */
    public static final String EXTRA_INTRO_URL  = "introUrl";
    /** URL secundaria usada quando a primaria falhar (hibrido P2P->m3u8 ou m3u8->backup). */
    public static final String EXTRA_FALLBACK_URL = "fallbackUrl";
    /** Força TextureView (fallback automático em retry após falha de renderização). */
    public static final String EXTRA_USE_TEXTURE_VIEW = "useTextureView";

    /** Fabricantes/modelos onde SurfaceView causa tela preta — usar TextureView por padrão. */
    private static boolean shouldUseTextureViewForDevice() {
        String mfg  = android.os.Build.MANUFACTURER == null ? "" : android.os.Build.MANUFACTURER.toLowerCase();
        String brand = android.os.Build.BRAND == null ? "" : android.os.Build.BRAND.toLowerCase();
        String model = android.os.Build.MODEL == null ? "" : android.os.Build.MODEL.toLowerCase();
        // TCL/Realtek: o decoder OMX.realtek.video.decoder TRAVA ao configurar contra
        // uma surface de TextureView (player fica em STATE_BUFFERING para sempre, sem erro).
        // SurfaceView funciona — a "tela preta" antiga é resolvida com setZOrderMediaOverlay
        // aplicado no buildLayout. Portanto TCL NÃO deve usar TextureView.
        // FireStick / Fire TV: SurfaceView e overlays do WebView variam bastante por firmware.
        if (mfg.contains("amazon") || brand.contains("amazon") || model.startsWith("aft") || model.contains("fire tv")) return true;
        // Google TV reference devices (Chromecast com Google TV, Sabrina)
        if (model.contains("chromecast") || model.contains("sabrina")) return true;
        // Allwinner / Rockchip TV boxes velhos
        if (mfg.contains("allwinner") || mfg.contains("rockchip")) return true;
        return false;
    }

    public static final String RESULT_POSITION  = "position";
    public static final String RESULT_ACTION    = "action";

    private static final int  MAX_RETRIES          = 3;
    private static final int  MAX_RETRIES_LIVE      = 7;
    private static final long RETRY_BASE_DELAY_MS   = 1500L;
    private static final long RETRY_MAX_DELAY_MS    = 30_000L;
    private static final long INTRO_STALL_TIMEOUT_MS = 9_000L;
    private static final long MAIN_STALL_TIMEOUT_MS = 30_000L;

    // Vinheta pré-VOD: sequência de frames .webp (mesma do boot NativeBootActivity).
    // Substitui o antigo asset:///public/vinheta-tv.mp4 que travava em STATE_BUFFERING
    // no decoder Realtek do TCL. Renderizada como overlay ImageView, não como item
    // de playlist do ExoPlayer.
    private static final int  INTRO_FRAME_COUNT       = 72;
    private static final int  INTRO_START_FRAME       = 6;
    private static final int  INTRO_FRAME_STEP        = 2;
    private static final long INTRO_FRAME_DURATION_MS = 65L;
    private static final long INTRO_OVERLAY_MAX_MS    = 4_000L;
    private static final String INTRO_FRAME_PATH      = "public/boot-vinheta/frame_%03d.webp";

    private ExoPlayer   player;
    private PlayerView  playerView;
    private FrameLayout root;

    // IMP-06 (PRD §15.2): cache HLS/progressivo compartilhado entre instâncias da Activity.
    // 256 MB LRU. Só VOD usa (live não cacheia). Reduz re-download em back/resume.
    private static final long CACHE_MAX_BYTES = 256L * 1024L * 1024L;
    private static SimpleCache sharedCache;

    private static synchronized SimpleCache getSharedCache(android.content.Context ctx) {
        if (sharedCache == null) {
            java.io.File cacheDir = new java.io.File(ctx.getCacheDir(), "media3-vod");
            sharedCache = new SimpleCache(
                    cacheDir,
                    new LeastRecentlyUsedCacheEvictor(CACHE_MAX_BYTES),
                    new StandaloneDatabaseProvider(ctx)
            );
        }
        return sharedCache;
    }
    private ImageView   posterView;
    private ProgressBar bufferingView;
    private TextView    loadingLabel;
    private LinearLayout errorOverlay;
    private TextView    errorText;
    private android.widget.Button retryButton;
    private Handler     mainHandler;
    private LinearLayout playerHud;
    private ImageView   hudLogo;
    private TextView    hudTitle;
    private TextView    hudYear;
    private TextView    hudCurrentTime;
    private TextView    hudRemainingTime;
    private TextView    hudDurationTime;
    private TextView    hudPlayButton;
    private TextView    hudSpeedButton;
    private TextView    hudVolumeButton;
    private SeekBar     hudSeekBar;
    private final ArrayList<TextView> hudButtons = new ArrayList<>();
    private int focusedHudButtonIndex = 2;
    private final Runnable hudTicker = new Runnable() {
        @Override public void run() {
            updateHud();
            if (mainHandler != null) mainHandler.postDelayed(this, 500L);
        }
    };
    private final Runnable introWatchdog = new Runnable() {
        @Override public void run() {
            if (!introQueuedForCurrentPlayback || player == null || isLive) return;
            int item = player.getCurrentMediaItemIndex();
            int state = player.getPlaybackState();
            if (item == 0 && state != Player.STATE_ENDED) {
                Log.w(TAG, "Vinheta travada/sem READY apos " + INTRO_STALL_TIMEOUT_MS + "ms; pulando para main stream");
                skipIntroAndPlayMain("intro_watchdog_state_" + state);
            }
        }
    };
    private final Runnable mainBufferWatchdog = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            if (player.getPlaybackState() != Player.STATE_BUFFERING) return;
            if (introQueuedForCurrentPlayback && player.getCurrentMediaItemIndex() == 0) return;
            Log.w(TAG, "Main stream travado em BUFFERING apos " + MAIN_STALL_TIMEOUT_MS + "ms");
            handleMainBufferStall();
        }
    };
    private final Runnable introFrameTick = new Runnable() {
        @Override public void run() { renderNextIntroFrame(); }
    };
    private final Runnable introOverlayMaxTimeout = new Runnable() {
        @Override public void run() { finishWebpIntro("overlay_max_timeout"); }
    };
    /** Auto-hide do HUD (delay unico de 6s, alinhado com sitepronto-novo):
     *  VOD: HUD inicia GONE; aparece quando a vinheta termina e o main stream comeca a tocar;
     *       some 6s depois; pausa mantem HUD visivel; play retoma o timer.
     *  Live: HUD inicia GONE; aparece quando o stream comeca a tocar; some 6s depois.
     */
    private static final long HUD_AUTO_HIDE_MS = 6_000L;
    private final Runnable hideHudRunnable = new Runnable() {
        @Override public void run() {
            if (playerHud == null) return;
            // VOD: nao esconde se pausado (HUD fica sempre visivel em pause)
            if (!isLive && player != null && !player.isPlaying()) return;
            playerHud.setVisibility(View.GONE);
        }
    };

    /** Bloqueia HUD enquanto vinheta toca (VOD com intro queued). Live sempre permitido. */
    private boolean hudAllowed() {
        if (player == null) return false;
        if (isLive) return true;
        if (webpIntroActive) return false;
        if (introQueuedForCurrentPlayback) {
            return player.getCurrentMediaItemIndex() >= 1;
        }
        return true;
    }

    private void diag(String msg) {
        Log.i(TAG, "DIAG " + msg);
    }

    private String              sourceUrl;
    private String              titleStr;
    private String              yearStr;
    private String              logoUrl;
    private String              typeStr;
    private String              posterUrl;
    private String              introUrl;
    private String              fallbackUrl;       // URL alternativa quando primaria falhar
    private boolean             fallbackUsed = false; // marca se ja trocou pro fallback
    private long                startPositionMs;
    private boolean             isLive;
    private Map<String, String> customHeaders;

    private int     retryCount    = 0;
    private boolean retriedAsHls  = false;
    /** True quando intro foi adicionada ao playlist na última chamada de preparePlayback. */
    private boolean introQueuedForCurrentPlayback = false;

    // ── Vinheta webp (overlay de frames) ──────────────────────────────────────
    private ImageView introOverlayView;
    private android.graphics.Bitmap introCurrentFrame;
    private int     introFrameIndex   = INTRO_START_FRAME;
    /** True enquanto a vinheta webp está visível (bloqueia HUD e segura o main stream). */
    private boolean webpIntroActive   = false;
    /** True após a vinheta webp ter tocado uma vez — evita replay em retries/fallback. */
    private boolean webpIntroConsumed = false;
    /** IMP-07 (PRD §15.2): preserva intenção do usuário (play/pause) através de onPause/onResume.
     *  Sem isso, voltar do home/background reativava play mesmo se usuário tinha pausado via HUD. */
    private boolean wasPlayingBeforePause = true;

    // Debug tracking fields
    private boolean renderedFirstFrame = false;
    private long firstBufferingTimestamp = 0;
    private long readyTimestamp = 0;
    private boolean terminalErrorShown = false;
    private boolean debugOverlayEnabled = false;
    private android.widget.TextView debugOverlayView = null;
    private android.os.Handler debugUpdateHandler = null;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        android.util.Log.i(TAG, "Activity onCreate (Media3) task=" + getTaskId()
                + " device=" + android.os.Build.MANUFACTURER + "/" + android.os.Build.BRAND + "/" + android.os.Build.MODEL);

        mainHandler = new Handler(Looper.getMainLooper());

        // Window background NULL — sem isso, SurfaceView "punch hole" mostra o BG opaco
        // em TV Box antiga (Allwinner/Rockchip/MediaTek).
        getWindow().setBackgroundDrawable(null);
        try { getWindow().getDecorView().setBackgroundColor(Color.BLACK); } catch (Exception ignored) {}

        // Fullscreen imersivo + tela ligada durante reprodução
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );

        sourceUrl = getIntent().getStringExtra(EXTRA_URL);
        if (sourceUrl == null || sourceUrl.isEmpty()) {
            Log.e(TAG, "URL vazia, abortando");
            Toast.makeText(this, "Erro: URL do stream vazia", Toast.LENGTH_LONG).show();
            setResult(Activity.RESULT_CANCELED);
            finish();
            return;
        }
        titleStr  = getIntent().getStringExtra(EXTRA_TITLE);
        if (titleStr == null) titleStr = "";
        yearStr = getIntent().getStringExtra(EXTRA_YEAR);
        if (yearStr == null) yearStr = "";
        logoUrl = getIntent().getStringExtra(EXTRA_LOGO);
        if (logoUrl == null) logoUrl = "";
        typeStr = getIntent().getStringExtra(EXTRA_TYPE);
        if (typeStr == null) typeStr = "movie";
        posterUrl = getIntent().getStringExtra(EXTRA_POSTER);
        introUrl  = getIntent().getStringExtra(EXTRA_INTRO_URL);
        introUrl = normalizeAndroidAssetUri(introUrl);
        fallbackUrl = getIntent().getStringExtra(EXTRA_FALLBACK_URL);
        // Se URL primaria for scheme nao suportado (tvbus, btp, p2p), troca imediatamente
        // pra fallback (m3u8) — ExoPlayer falha instant em scheme desconhecido.
        if (sourceUrl != null && fallbackUrl != null && !fallbackUrl.isEmpty()) {
            String lower = sourceUrl.toLowerCase();
            if (lower.startsWith("tvbus:") || lower.startsWith("btp:") || lower.startsWith("p2p:")) {
                Log.i(TAG, "Primary scheme nao suportado, indo direto pro fallback m3u8");
                sourceUrl = fallbackUrl;
                fallbackUsed = true;
            }
        }
        startPositionMs = getIntent().getIntExtra(EXTRA_POSITION, 0) * 1000L;
        isLive = getIntent().getBooleanExtra(EXTRA_IS_LIVE, false) || "live".equalsIgnoreCase(typeStr);
        if ((logoUrl == null || logoUrl.isEmpty()) && isLive && posterUrl != null && !posterUrl.isEmpty()) {
            logoUrl = posterUrl;
        }
        customHeaders = parseHeadersFromIntent(getIntent());
        Log.i(TAG, "Intent extras OK type=" + typeStr
                + " live=" + isLive
                + " posMs=" + startPositionMs
                + " intro=" + (introUrl != null && !introUrl.isEmpty())
                + " poster=" + (posterUrl != null && !posterUrl.isEmpty())
                + " url=" + sourceUrl.substring(0, Math.min(120, sourceUrl.length())));

        Log.i(TAG, "[RED_EXOPLAYER] onCreate");
        Log.i(TAG, "[RED_EXOPLAYER]   device=" + android.os.Build.MODEL + " API=" + android.os.Build.VERSION.SDK_INT);
        Log.i(TAG, "[RED_EXOPLAYER]   url=" + (sourceUrl != null ? sourceUrl.substring(0, Math.min(sourceUrl.length(), 100)) : "null"));
        Log.i(TAG, "[RED_EXOPLAYER]   fallbackUrl=" + (fallbackUrl != null ? fallbackUrl.substring(0, Math.min(fallbackUrl.length(), 80)) : "null"));
        Log.i(TAG, "[RED_EXOPLAYER]   introUrl=" + introUrl);
        Log.i(TAG, "[RED_EXOPLAYER]   type=" + typeStr + " isLive=" + isLive + " position=" + startPositionMs);
        Log.i(TAG, "[RED_PLAYBACK_CONTRACT]   streamType=" + (sourceUrl != null && sourceUrl.contains(".m3u8") ? "HLS" : sourceUrl != null && sourceUrl.startsWith("p2p://") ? "P2P" : "MP4/OTHER"));
        debugOverlayEnabled = getIntent().getBooleanExtra("debug", false) && BuildConfig.DEBUG;

        try {
            Log.i(TAG, "buildLayout: inicio");
            buildLayout();
            Log.i(TAG, "buildLayout: fim");

            // Debug overlay
            if (debugOverlayEnabled) {
                debugOverlayView = new android.widget.TextView(this);
                debugOverlayView.setTextColor(0xFF00FF00); // green
                debugOverlayView.setTextSize(11f);
                debugOverlayView.setTypeface(android.graphics.Typeface.MONOSPACE);
                debugOverlayView.setBackgroundColor(0x66000000); // 40% black
                debugOverlayView.setPadding(16, 16, 16, 16);
                debugOverlayView.setText("RED_DEBUG: initializing...");
                android.widget.FrameLayout.LayoutParams dlp = new android.widget.FrameLayout.LayoutParams(
                    android.widget.FrameLayout.LayoutParams.WRAP_CONTENT,
                    android.widget.FrameLayout.LayoutParams.WRAP_CONTENT,
                    android.view.Gravity.TOP | android.view.Gravity.START
                );
                dlp.setMargins(20, 20, 0, 0);
                root.addView(debugOverlayView, dlp);

                debugUpdateHandler = new android.os.Handler(getMainLooper());
                Runnable debugUpdater = new Runnable() {
                    @Override
                    public void run() {
                        updateDebugOverlay();
                        if (debugUpdateHandler != null) debugUpdateHandler.postDelayed(this, 1000);
                    }
                };
                debugUpdateHandler.postDelayed(debugUpdater, 1000);
            }

            diag("buildPlayer: inicio");
            buildPlayer();
            diag("buildPlayer: fim");
            diag("preparePlayback: inicio");
            preparePlayback(false);
            diag("preparePlayback: fim");
        } catch (Throwable e) {
            Log.e(TAG, "Falha ao iniciar player", e);
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            Toast.makeText(this, "Player crash: " + msg, Toast.LENGTH_LONG).show();
            showError("Erro ao iniciar reprodução: " + msg);
        }
    }

    // ───────────────────────────── Layout ─────────────────────────────

    private void buildLayout() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // Poster placeholder enquanto bufferiza
        if (posterUrl != null && !posterUrl.isEmpty()) {
            posterView = new ImageView(this);
            posterView.setLayoutParams(new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
            ));
            posterView.setScaleType(ImageView.ScaleType.CENTER_CROP);
            posterView.setAlpha(0.45f);
            root.addView(posterView);
            loadPosterAsync(posterUrl);
        }

        // Surface type: SurfaceView default (Android TV moderno). TextureView fallback
        // em fabricantes problemáticos OU quando EXTRA_USE_TEXTURE_VIEW=true
        // (set pelo retry nativo após falha de renderização).
        boolean useTextureView = getIntent().getBooleanExtra(EXTRA_USE_TEXTURE_VIEW, false)
                || shouldUseTextureViewForDevice();
        int layoutRes = useTextureView ? R.layout.redx_player_view_texture : R.layout.redx_player_view_surface;
        diag("PlayerView surface_type=" + (useTextureView ? "texture_view" : "surface_view"));
        playerView = (PlayerView) android.view.LayoutInflater.from(this)
                .inflate(layoutRes, root, false);
        playerView.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        // O APK TV moderno usa HUD nativo RedFlix. O controller padrao do Media3
        // fica desligado para nao trocar a identidade visual nem disputar foco.
        playerView.setUseController(false);
        playerView.setFocusable(true);
        playerView.setFocusableInTouchMode(true);
        playerView.setKeepScreenOn(true);
        playerView.setVisibility(View.VISIBLE);
        playerView.setTranslationZ(10f);
        playerView.setBackgroundColor(Color.BLACK);
        // SurfaceView precisa de setZOrderMediaOverlay(true) para aparecer acima do
        // fundo opaco da janela (decor preto) — sem isto a SurfaceView pode ficar
        // escondida ("tela preta com áudio") em alguns firmwares de TV Box.
        try {
            if (!useTextureView) {
                android.view.View inner = playerView.getVideoSurfaceView();
                if (inner instanceof android.view.SurfaceView) {
                    ((android.view.SurfaceView) inner).setZOrderMediaOverlay(true);
                    diag("setZOrderMediaOverlay(true) aplicado (SurfaceView)");
                }
            }
        } catch (Exception e) {
            diag("ZOrder fix erro: " + e.getMessage());
        }
        root.addView(playerView);

        // Spinner de buffer
        bufferingView = new ProgressBar(this);
        FrameLayout.LayoutParams spinParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
        );
        spinParams.gravity = android.view.Gravity.CENTER;
        bufferingView.setLayoutParams(spinParams);
        root.addView(bufferingView);

        // Label "Carregando..." abaixo do spinner
        loadingLabel = new TextView(this);
        loadingLabel.setText(titleStr != null && !titleStr.isEmpty()
                ? "Carregando " + titleStr + "…"
                : "Carregando…");
        loadingLabel.setTextColor(Color.WHITE);
        loadingLabel.setTextSize(14);
        FrameLayout.LayoutParams lblParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
        );
        lblParams.gravity = android.view.Gravity.CENTER;
        lblParams.topMargin = 120;
        loadingLabel.setLayoutParams(lblParams);
        root.addView(loadingLabel);

        // Overlay de erro fatal
        errorOverlay = new LinearLayout(this);
        errorOverlay.setOrientation(LinearLayout.VERTICAL);
        errorOverlay.setGravity(android.view.Gravity.CENTER);
        errorOverlay.setBackgroundColor(0xCC000000);
        errorOverlay.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        errorOverlay.setVisibility(View.GONE);

        errorText = new TextView(this);
        errorText.setTextColor(Color.WHITE);
        errorText.setTextSize(20);
        errorText.setPadding(48, 48, 48, 16);
        errorText.setGravity(android.view.Gravity.CENTER);
        errorOverlay.addView(errorText);

        TextView hint = new TextView(this);
        hint.setText("Pressione VOLTAR para sair");
        hint.setTextColor(0xAAFFFFFF);
        hint.setTextSize(14);
        errorOverlay.addView(hint);

        retryButton = new android.widget.Button(this);
        retryButton.setText("Tentar novamente");
        retryButton.setTextColor(Color.WHITE);
        retryButton.setBackgroundColor(0xFF1565C0);
        retryButton.setPadding(48, 24, 48, 24);
        retryButton.setFocusable(true);
        retryButton.setFocusableInTouchMode(true);
        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        btnParams.topMargin = 32;
        retryButton.setLayoutParams(btnParams);
        retryButton.setOnClickListener(v -> retryPlayback());
        errorOverlay.addView(retryButton);

        buildPlayerHud();
        root.addView(errorOverlay);
        setContentView(root);
        if (!isLive) {
            playerView.requestFocus();
        } else {
            root.setFocusableInTouchMode(true);
            root.requestFocus();
        }
    }

    private void buildPlayerHud() {
        playerHud = new LinearLayout(this);
        playerHud.setOrientation(LinearLayout.VERTICAL);
        playerHud.setPadding(dp(24), dp(18), dp(24), dp(18));
        playerHud.setBackground(makeHudBackground());
        playerHud.setFocusable(false);
        // HUD comeca GONE — so aparece quando o conteudo (apos vinheta) comeca a tocar.
        playerHud.setVisibility(View.GONE);
        playerHud.setTranslationZ(80f);

        FrameLayout.LayoutParams hudParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
        );
        hudParams.gravity = android.view.Gravity.BOTTOM | android.view.Gravity.CENTER_HORIZONTAL;
        hudParams.leftMargin = dp(18);
        hudParams.rightMargin = dp(18);
        hudParams.bottomMargin = dp(26);
        playerHud.setLayoutParams(hudParams);

        LinearLayout topRow = new LinearLayout(this);
        topRow.setOrientation(LinearLayout.HORIZONTAL);
        topRow.setGravity(android.view.Gravity.CENTER_VERTICAL);
        playerHud.addView(topRow, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        LinearLayout titleWrap = new LinearLayout(this);
        titleWrap.setOrientation(LinearLayout.HORIZONTAL);
        titleWrap.setGravity(android.view.Gravity.CENTER_VERTICAL);
        topRow.addView(titleWrap, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        hudLogo = new ImageView(this);
        hudLogo.setAdjustViewBounds(true);
        hudLogo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        hudLogo.setMaxWidth(dp(280));
        hudLogo.setVisibility(View.GONE);
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                dp(isLive ? 42 : 56)
        );
        logoParams.rightMargin = dp(14);
        titleWrap.addView(hudLogo, logoParams);
        if (logoUrl != null && !logoUrl.isEmpty()) {
            loadImageIntoAsync(logoUrl, hudLogo, true);
        }

        hudTitle = new TextView(this);
        hudTitle.setText(titleStr == null || titleStr.isEmpty() ? (isLive ? "CANAL AO VIVO" : "REDFLIX") : titleStr.toUpperCase());
        hudTitle.setTextColor(0xFFFFFFFF);
        hudTitle.setTextSize(isLive ? 24 : 30);
        hudTitle.setTypeface(Typeface.DEFAULT_BOLD);
        hudTitle.setSingleLine(true);
        hudTitle.setEllipsize(android.text.TextUtils.TruncateAt.END);
        titleWrap.addView(hudTitle, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        hudYear = new TextView(this);
        hudYear.setText(isLive ? "AO VIVO" : yearStr);
        hudYear.setTextColor(0xB8FFFFFF);
        hudYear.setTextSize(13);
        hudYear.setTypeface(Typeface.DEFAULT_BOLD);
        hudYear.setPadding(dp(14), 0, 0, 0);
        titleWrap.addView(hudYear);

        TextView watchedChip = new TextView(this);
        watchedChip.setText("  MENU  ");
        watchedChip.setTextColor(0xFFEAFBFF);
        watchedChip.setTextSize(11);
        watchedChip.setTypeface(Typeface.DEFAULT_BOLD);
        watchedChip.setLetterSpacing(0.20f);
        watchedChip.setGravity(android.view.Gravity.CENTER);
        watchedChip.setPadding(dp(18), dp(8), dp(18), dp(8));
        watchedChip.setBackground(makePillBackground());
        if (isLive) {
            topRow.addView(watchedChip);
        }

        // Live: card simples (so logo + titulo do canal). Sem timeline, seekbar e botoes
        // de controle — user pediu canal sem controles, equivalente ao info overlay do
        // sitepronto-novo LiveTV.tsx.
        if (!isLive) {
            LinearLayout timeRow = new LinearLayout(this);
            timeRow.setOrientation(LinearLayout.HORIZONTAL);
            timeRow.setGravity(android.view.Gravity.CENTER_VERTICAL);
            LinearLayout.LayoutParams timeRowParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            );
            timeRowParams.topMargin = dp(14);
            playerHud.addView(timeRow, timeRowParams);

            hudCurrentTime = makeHudTimeText(android.view.Gravity.START);
            hudRemainingTime = makeHudTimeText(android.view.Gravity.CENTER);
            hudDurationTime = makeHudTimeText(android.view.Gravity.END);
            timeRow.addView(hudCurrentTime, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            timeRow.addView(hudRemainingTime, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            timeRow.addView(hudDurationTime, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

            hudSeekBar = new SeekBar(this);
            hudSeekBar.setMax(1000);
            hudSeekBar.setProgress(0);
            hudSeekBar.setEnabled(false);
            hudSeekBar.setFocusable(false);
            hudSeekBar.setPadding(0, 0, 0, 0);
            LinearLayout.LayoutParams seekParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    dp(24)
            );
            playerHud.addView(hudSeekBar, seekParams);

            LinearLayout controlsRow = new LinearLayout(this);
            controlsRow.setOrientation(LinearLayout.HORIZONTAL);
            controlsRow.setGravity(android.view.Gravity.CENTER_VERTICAL);
            LinearLayout.LayoutParams controlsParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            );
            controlsParams.topMargin = dp(4);
            playerHud.addView(controlsRow, controlsParams);

            LinearLayout leftControls = new LinearLayout(this);
            leftControls.setOrientation(LinearLayout.HORIZONTAL);
            leftControls.setGravity(android.view.Gravity.CENTER_VERTICAL);
            controlsRow.addView(leftControls, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

            // Icones monocromaticos (Unicode geometric / arrow glyphs) — sem emojis
            // coloridos. Replica controles do sitepronto-novo (Player.tsx Row 3).
            leftControls.addView(makeHudButton("◀", false, v -> returnResultAndFinish())); // Back
            leftControls.addView(makeHudButton("⏮", false, v -> seekBy(-30_000L)));        // Rewind 30s
            hudPlayButton = makeHudButton("❚❚", true, v -> togglePlayPause());            // Play/Pause (large)
            leftControls.addView(hudPlayButton);
            leftControls.addView(makeHudButton("⏭", false, v -> seekBy(30_000L)));         // Forward 30s

            LinearLayout rightControls = new LinearLayout(this);
            rightControls.setOrientation(LinearLayout.HORIZONTAL);
            rightControls.setGravity(android.view.Gravity.CENTER_VERTICAL | android.view.Gravity.RIGHT);
            controlsRow.addView(rightControls, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

            // Cast/Elenco (mono icon: triangulo + cabeça simples). Sempre presente em VOD.
            rightControls.addView(makeHudButton("☆", false, v -> returnLiveActionAndFinish("openCast")));
            // Episodios/Temporadas: so para series.
            if ("series".equalsIgnoreCase(typeStr)) {
                rightControls.addView(makeHudButton("☰", false, v -> returnLiveActionAndFinish("openEpisodes")));
            }
            hudSpeedButton = makeHudButton("1×", false, v -> cycleSpeed());                // Speed
            rightControls.addView(hudSpeedButton);
            hudVolumeButton = makeHudButton("◉", false, v -> toggleMute());                // Volume
            rightControls.addView(hudVolumeButton);
        }

        root.addView(playerHud);
        focusHudButton(focusedHudButtonIndex);
        // scheduleHudHide() removido: HUD inicia GONE e so e revelado por onIsPlayingChanged/onMediaItemTransition.
    }

    private TextView makeHudTimeText(int gravity) {
        TextView t = new TextView(this);
        t.setTextColor(0xCCFFFFFF);
        t.setTextSize(13);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(gravity);
        t.setSingleLine(true);
        return t;
    }

    private TextView makeHudButton(String label, boolean large, View.OnClickListener listener) {
        TextView button = new TextView(this);
        button.setText(label);
        button.setTextColor(0xFFFFFFFF);
        button.setTextSize(large ? 24 : 15);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setGravity(android.view.Gravity.CENTER);
        button.setFocusable(true);
        button.setFocusableInTouchMode(true);
        button.setBackground(large ? makePlayButtonBackground() : makeRoundButtonBackground(false));
        button.setOnClickListener(listener);
        button.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) {
                int index = hudButtons.indexOf(button);
                if (index >= 0) {
                    focusedHudButtonIndex = index;
                    updateHudButtonFocus();
                    showHud();
                }
            }
        });
        int size = large ? dp(78) : dp(58);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(size, size);
        params.rightMargin = dp(12);
        button.setLayoutParams(params);
        hudButtons.add(button);
        return button;
    }

    private GradientDrawable makeHudBackground() {
        GradientDrawable bg = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[] { 0xD94E1B78, 0xCC7C3AA5, 0xD9241238 }
        );
        bg.setCornerRadius(dp(42));
        bg.setStroke(dp(1), 0x44FFFFFF);
        return bg;
    }

    private GradientDrawable makePillBackground() {
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xA4000000);
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(1), 0x33FFFFFF);
        return bg;
    }

    private GradientDrawable makeRoundButtonBackground(boolean active) {
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(active ? 0x9958D4E8 : 0x30FFFFFF);
        bg.setStroke(dp(active ? 3 : 1), active ? 0xFF67E8F9 : 0x40FFFFFF);
        return bg;
    }

    private GradientDrawable makePlayButtonBackground() {
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0x9958D4E8);
        bg.setStroke(dp(3), 0xCC67E8F9);
        return bg;
    }

    private void updateHudButtonFocus() {
        for (int i = 0; i < hudButtons.size(); i++) {
            TextView button = hudButtons.get(i);
            boolean active = i == focusedHudButtonIndex;
            boolean large = button == hudPlayButton;
            button.setBackground(large && active ? makePlayButtonBackground() : large ? makeRoundButtonBackground(false) : makeRoundButtonBackground(active));
        }
    }

    private void focusHudButton(int index) {
        if (hudButtons.isEmpty()) return;
        focusedHudButtonIndex = Math.max(0, Math.min(index, hudButtons.size() - 1));
        TextView button = hudButtons.get(focusedHudButtonIndex);
        button.requestFocus();
        updateHudButtonFocus();
    }

    private void moveHudFocus(int delta) {
        if (hudButtons.isEmpty()) return;
        int next = (focusedHudButtonIndex + delta + hudButtons.size()) % hudButtons.size();
        focusHudButton(next);
    }

    private void clickFocusedHudButton() {
        if (hudButtons.isEmpty()) return;
        hudButtons.get(focusedHudButtonIndex).performClick();
    }

    private void showHud() {
        if (!hudAllowed()) return; // nao aparece em cima da vinheta
        if (playerHud != null) playerHud.setVisibility(View.VISIBLE);
        scheduleHudHide();
    }

    private void scheduleHudHide() {
        if (mainHandler == null) return;
        // VOD pausado: nao agenda hide (HUD permanece visivel ate retomar play)
        if (!isLive && player != null && !player.isPlaying()) {
            mainHandler.removeCallbacks(hideHudRunnable);
            return;
        }
        mainHandler.removeCallbacks(hideHudRunnable);
        mainHandler.postDelayed(hideHudRunnable, HUD_AUTO_HIDE_MS);
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private String formatDuration(long millis) {
        if (millis < 0) millis = 0;
        long totalSeconds = millis / 1000L;
        long hours = totalSeconds / 3600L;
        long minutes = (totalSeconds % 3600L) / 60L;
        long seconds = totalSeconds % 60L;
        if (hours > 0) {
            return String.format(java.util.Locale.US, "%d:%02d:%02d", hours, minutes, seconds);
        }
        return String.format(java.util.Locale.US, "%d:%02d", minutes, seconds);
    }

    private void updateHud() {
        if (playerHud == null || player == null) return;
        if (isLive) {
            if (hudCurrentTime != null) hudCurrentTime.setText("AO VIVO");
            if (hudRemainingTime != null) hudRemainingTime.setText("QUALQUER TECLA ABRE O MENU");
            if (hudDurationTime != null) hudDurationTime.setText("");
            if (hudSeekBar != null) hudSeekBar.setProgress(1000);
        } else {
            long pos = Math.max(0L, player.getCurrentPosition());
            long duration = player.getDuration();
            boolean hasDuration = duration > 0 && duration != androidx.media3.common.C.TIME_UNSET;
            if (hudCurrentTime != null) hudCurrentTime.setText(formatDuration(pos));
            if (hudRemainingTime != null) {
                hudRemainingTime.setText(hasDuration ? "RESTAM " + formatDuration(Math.max(0L, duration - pos)) : "");
            }
            if (hudDurationTime != null) hudDurationTime.setText(hasDuration ? formatDuration(duration) : "");
            if (hudSeekBar != null) {
                int progress = hasDuration ? (int) Math.min(1000L, Math.max(0L, (pos * 1000L) / duration)) : 0;
                hudSeekBar.setProgress(progress);
            }
        }
        if (hudPlayButton != null) {
            hudPlayButton.setText(player.isPlaying() ? "⏸" : "▶");
        }
        if (hudSpeedButton != null) {
            hudSpeedButton.setText(formatSpeed(player.getPlaybackParameters().speed));
        }
        if (hudVolumeButton != null) {
            hudVolumeButton.setText(player.getVolume() <= 0.01f ? "🔇" : "🔊");
        }
    }

    private String formatSpeed(float speed) {
        if (Math.abs(speed - 0.5f) < 0.01f) return "0.5×";
        if (Math.abs(speed - 0.75f) < 0.01f) return "0.75×";
        if (Math.abs(speed - 1f) < 0.01f) return "1×";
        if (Math.abs(speed - 1.25f) < 0.01f) return "1.25×";
        if (Math.abs(speed - 1.5f) < 0.01f) return "1.5×";
        if (Math.abs(speed - 2f) < 0.01f) return "2×";
        return String.format(java.util.Locale.US, "%.2f×", speed);
    }

    private void seekBy(long deltaMs) {
        if (player == null || isLive) return;
        long duration = player.getDuration();
        long next = Math.max(0L, player.getCurrentPosition() + deltaMs);
        if (duration > 0 && duration != androidx.media3.common.C.TIME_UNSET) {
            next = Math.min(duration, next);
        }
        player.seekTo(next);
        updateHud();
    }

    private void togglePlayPause() {
        if (player == null || isLive) return;
        player.setPlayWhenReady(!player.isPlaying());
        updateHud();
    }

    private void cycleSpeed() {
        if (player == null || isLive) return;
        // Replica SPEED_OPTIONS do sitepronto-novo Player.tsx: [0.5, 0.75, 1, 1.25, 1.5, 2]
        float current = player.getPlaybackParameters().speed;
        float next;
        if      (current < 0.6f)  next = 0.75f;
        else if (current < 0.8f)  next = 1f;
        else if (current < 1.1f)  next = 1.25f;
        else if (current < 1.3f)  next = 1.5f;
        else if (current < 1.6f)  next = 2f;
        else                       next = 0.5f;
        player.setPlaybackSpeed(next);
        updateHud();
    }

    private void toggleMute() {
        if (player == null) return;
        player.setVolume(player.getVolume() <= 0.01f ? 1f : 0f);
        updateHud();
    }

    private void loadPosterAsync(final String url) {
        loadImageIntoAsync(url, posterView, false);
    }

    private void loadImageIntoAsync(final String url, final ImageView target, final boolean revealOnLoad) {
        if (target == null) return;
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    java.net.URL u = new java.net.URL(url);
                    java.net.HttpURLConnection conn = (java.net.HttpURLConnection) u.openConnection();
                    conn.setConnectTimeout(4000);
                    conn.setReadTimeout(4000);
                    conn.connect();
                    final android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeStream(conn.getInputStream());
                    if (bmp != null && target != null) {
                        mainHandler.post(new Runnable() {
                            @Override public void run() {
                                if (target != null) {
                                    target.setImageBitmap(bmp);
                                    if (revealOnLoad) target.setVisibility(View.VISIBLE);
                                    // Logo do filme/serie carregou: esconde o titulo de texto
                                    // (user pediu apenas logo, sem nome ao lado).
                                    if (target == hudLogo && hudTitle != null) {
                                        hudTitle.setVisibility(View.GONE);
                                    }
                                }
                            }
                        });
                    }
                } catch (Exception ignored) {
                    // Imagem best-effort — playback continua sem ela.
                }
            }
        }).start();
    }

    // ───────────────────────────── Player ─────────────────────────────

    private void buildPlayer() {
        Map<String, String> headers = buildRequestHeaders(sourceUrl);
        if (customHeaders != null && !customHeaders.isEmpty()) headers.putAll(customHeaders);

        DefaultHttpDataSource.Factory httpFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent(headers.containsKey("User-Agent")
                        ? headers.get("User-Agent")
                        : "Mozilla/5.0 (Linux; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 RedflixTV/1.0")
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(20_000)
                .setReadTimeoutMs(25_000)
                .setDefaultRequestProperties(headers);

        // Buffer otimizado pra TV Box moderna e rede instável (32-64s).
        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(32_000, 64_000, 5_000, 5_000)
                .setPrioritizeTimeOverSizeThresholds(true)
                .build();

        // DefaultDataSource.Factory: roteia http(s)://, file:///, asset:///, content:// e
        // file:///android_asset/* automaticamente — necessário para a vinheta empacotada.
        DefaultDataSource.Factory dsFactory = new DefaultDataSource.Factory(this, httpFactory);

        // CacheDataSource removido: o wrapper de cache travava o carregamento (player
        // ficava em STATE_BUFFERING sem nunca chegar a READY, tanto na vinheta local
        // quanto no stream HTTP). DefaultDataSource direto resolve http/file/asset/
        // content/rawresource sem o overhead/lock do SimpleCache.
        androidx.media3.datasource.DataSource.Factory sourceFactory = dsFactory;

        // Decoder fallback: tenta próximo decoder se primário falha (HEVC em Firestick antigo, etc.)
        // EXTENSION_RENDERER_MODE_PREFER prioriza extensões de software caso a renderização em hardware (TCL) falhe ou esteja bugada.
        androidx.media3.exoplayer.DefaultRenderersFactory renderersFactory =
                new androidx.media3.exoplayer.DefaultRenderersFactory(this)
                        .setExtensionRendererMode(androidx.media3.exoplayer.DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
                        .setEnableDecoderFallback(true)
                        .setMediaCodecSelector(
                                androidx.media3.exoplayer.mediacodec.MediaCodecSelector.DEFAULT);

        player = new ExoPlayer.Builder(this, renderersFactory)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(sourceFactory))
                .setLoadControl(loadControl)
                .build();

        playerView.setPlayer(player);
        updateHud();
        mainHandler.removeCallbacks(hudTicker);
        mainHandler.post(hudTicker);

        player.addListener(new Player.Listener() {
            @Override
            public void onMediaItemTransition(@Nullable androidx.media3.common.MediaItem mediaItem, int reason) {
                // Ativa controller ao chegar no main stream (item 1) após vinheta (item 0).
                // Não afeta Live nem VOD sem vinheta (controller já configurado em buildLayout).
                if (!isLive && player != null) {
                    if (introQueuedForCurrentPlayback && player.getCurrentMediaItemIndex() >= 1) {
                        mainHandler.removeCallbacks(introWatchdog);
                        // Aplica seek de resume AQUI — a intro já tocou; agora voltamos para
                        // a posição salva no main stream.
                        // Seek feito em preparePlayback SALTARIA a intro completamente.
                        if (startPositionMs > 0) {
                            Log.d(TAG, "Seek pós-intro: " + startPositionMs + "ms");
                            player.seekTo(startPositionMs);
                        }
                        updateHud();
                        // Vinheta acabou: revela HUD do conteudo principal e agenda hide 6s.
                        showHud();
                    }
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                // Replica logica do sitepronto-novo (ajustada conforme feedback do usuario):
                //   VOD: HUD NUNCA aparece sobre a vinheta. Aparece quando o main stream toca
                //        (onMediaItemTransition) e some em 6s. Pausa = HUD visivel sem timer.
                //   Live: HUD aparece quando o stream comeca a tocar (info overlay) e some em 6s.
                if (isPlaying) {
                    if (hudAllowed()) showHud(); // showHud cuida de visibility + schedule 6s
                } else if (!isLive) {
                    // Pausa em VOD: so mostra HUD se ja estamos no main stream (nao na vinheta)
                    if (hudAllowed()) {
                        if (playerHud != null) playerHud.setVisibility(View.VISIBLE);
                        if (mainHandler != null) mainHandler.removeCallbacks(hideHudRunnable);
                    }
                }
                updateHud();
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                diag("STATE " + stateToString(state)
                        + " item=" + (player != null ? player.getCurrentMediaItemIndex() : -1)
                        + " playWhenReady=" + (player != null && player.getPlayWhenReady()));
                if (state == Player.STATE_BUFFERING) {
                    if (firstBufferingTimestamp == 0) firstBufferingTimestamp = System.currentTimeMillis();
                    Log.i(TAG, "[RED_EXOPLAYER] STATE_BUFFERING pos=" + (player != null ? player.getCurrentPosition() : -1) + "ms buffered=" + (player != null ? player.getBufferedPosition() : -1) + "ms");
                    bufferingView.setVisibility(View.VISIBLE);
                    if (loadingLabel != null) loadingLabel.setVisibility(View.VISIBLE);
                    if (!(introQueuedForCurrentPlayback && player != null && player.getCurrentMediaItemIndex() == 0)) {
                        mainHandler.removeCallbacks(mainBufferWatchdog);
                        mainHandler.postDelayed(mainBufferWatchdog, MAIN_STALL_TIMEOUT_MS);
                    }
                } else {
                    mainHandler.removeCallbacks(mainBufferWatchdog);
                    bufferingView.setVisibility(View.GONE);
                    if (loadingLabel != null) loadingLabel.setVisibility(View.GONE);
                }
                if (state == Player.STATE_READY) {
                    readyTimestamp = System.currentTimeMillis();
                    long bufferToReady = firstBufferingTimestamp > 0 ? (readyTimestamp - firstBufferingTimestamp) : -1;
                    Log.i(TAG, "[RED_EXOPLAYER] STATE_READY pos=" + (player != null ? player.getCurrentPosition() : -1) + "ms duration=" + (player != null ? player.getDuration() : -1) + "ms buffered=" + (player != null ? player.getBufferedPosition() : -1) + "ms bufferToReadyMs=" + bufferToReady);
                    if (introQueuedForCurrentPlayback && player != null && player.getCurrentMediaItemIndex() == 0) {
                        diag("Vinheta READY");
                    }
                    playerView.setVisibility(View.VISIBLE);
                    if (posterView != null) {
                        posterView.animate().alpha(0f).setDuration(250).start();
                    }
                    retryCount = 0;
                    try {
                        androidx.media3.common.Format vf = player.getVideoFormat();
                        diag(vf == null
                            ? "READY item=" + player.getCurrentMediaItemIndex() + " SEM VIDEO"
                            : "READY item=" + player.getCurrentMediaItemIndex() + " " + vf.width + "x" + vf.height + " " + vf.codecs);
                    } catch (Exception ignored) {}
                    updateHud();
                }
                if (state == Player.STATE_ENDED && !isLive) {
                    mainHandler.removeCallbacks(introWatchdog);
                    returnResultAndFinish();
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                if (terminalErrorShown) {
                    Log.w(TAG, "Ignorando erro apos tela terminal: " + error.getErrorCodeName());
                    return;
                }
                Log.e(TAG, "ExoPlayer error: " + error.getErrorCodeName() + " (" + error.errorCode + ")", error);
                mainHandler.removeCallbacks(mainBufferWatchdog);
                Throwable cause = error.getCause();
                String causeMsg = cause != null ? cause.getClass().getSimpleName() + ": " + cause.getMessage() : "";
                handlePlaybackError(error);
            }

            @Override
            public void onRenderedFirstFrame() {
                renderedFirstFrame = true;
                Log.i(TAG, "[RED_EXOPLAYER] onRenderedFirstFrame! First video frame rendered.");
            }

            @Override
            public void onVideoSizeChanged(VideoSize videoSize) {
                Log.i(TAG, "[RED_EXOPLAYER] onVideoSizeChanged: " + videoSize.width + "x" + videoSize.height);
            }

            @Override
            public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
                Log.i(TAG, "[RED_EXOPLAYER] onPlayWhenReadyChanged: playWhenReady=" + playWhenReady + " reason=" + reason);
            }
        });
    }

    private void handlePlaybackError(PlaybackException error) {
        // Estratégia 0: erro durante a intro (item 0) — pular intro e tocar main stream.
        // Não mostrar erro ao usuário: a intro é opcional; main stream deve tocar mesmo sem ela.
        if (introQueuedForCurrentPlayback && player != null
                && player.getCurrentMediaItemIndex() == 0) {
            Log.w(TAG, "Intro falhou (" + error.getErrorCodeName() + ") — skip para main stream");
            skipIntroAndPlayMain("intro_error_" + error.getErrorCodeName());
            return;
        }

        // Estratégia 1: força HLS uma vez. O APK funcional fazia esse fallback
        // quando a URL/servidor mascarava um manifest HLS como conteúdo comum.
        if (!retriedAsHls && shouldRetryForceHls(error)) {
            retriedAsHls = true;
            Log.w(TAG, "Retry forçando HLS MIME");
            preparePlayback(true);
            return;
        }

        // Estratégia 1b: erros de renderização (TCL/Google TV/GPU driver) — re-abrir
        // Activity forçando TextureView. SurfaceView depende de hardware overlay;
        // alguns firmwares falham silenciosamente. TextureView renderiza via GPU
        // texture → sempre visível.
        if (!getIntent().getBooleanExtra(EXTRA_USE_TEXTURE_VIEW, false) && isRendererError(error)) {
            Log.w(TAG, "Renderer error — reabrindo Activity com TextureView");
            Intent retry = new Intent(getIntent());
            retry.putExtra(EXTRA_USE_TEXTURE_VIEW, true);
            if (!isLive && player != null) {
                retry.putExtra(EXTRA_POSITION, (int)(player.getCurrentPosition() / 1000));
            }
            startActivity(retry);
            finish();
            return;
        }

        // Estratégia 2: retry exponencial pra erros IO/rede.
        // Live streams recebem mais tentativas (7x) pois o live edge reconecta sozinho.
        int maxRetries = getMaxRetriesForCurrentStream();
        if (retryCount < maxRetries && isTransientError(error)) {
            retryCount++;
            long delay = Math.min(RETRY_BASE_DELAY_MS * (long) Math.pow(2, retryCount - 1), RETRY_MAX_DELAY_MS);
            Log.w(TAG, "Reconexão " + retryCount + "/" + maxRetries + " em " + delay + "ms");
            bufferingView.setVisibility(View.VISIBLE);
            mainHandler.postDelayed(new Runnable() {
                @Override public void run() {
                    if (player != null) {
                        if (!isLive) {
                            startPositionMs = player.getCurrentPosition();
                        }
                        preparePlayback(retriedAsHls);
                    }
                }
            }, delay);
            return;
        }

        // Sem mais retries na primaria — tenta fallback m3u8 antes de mostrar erro.
        if (!fallbackUsed && fallbackUrl != null && !fallbackUrl.isEmpty()
                && !fallbackUrl.equalsIgnoreCase(sourceUrl)) {
            Log.w(TAG, "Primary esgotada; trocando pro fallback m3u8: " + fallbackUrl);
            fallbackUsed = true;
            sourceUrl = fallbackUrl;
            retryCount = 0;
            retriedAsHls = false;
            if (errorOverlay != null) errorOverlay.setVisibility(View.GONE);
            if (bufferingView != null) bufferingView.setVisibility(View.VISIBLE);
            preparePlayback(false);
            return;
        }

        // Sem mais retries e sem fallback — mostrar overlay de erro.
        showError("Falha ao reproduzir: " + error.getErrorCodeName());
    }

    private boolean isPossibleHlsMimeMismatch(PlaybackException error) {
        int code = error.errorCode;
        return code == PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED
                || code == PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED
                || code == PlaybackException.ERROR_CODE_PARSING_MANIFEST_MALFORMED
                || code == PlaybackException.ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED;
    }

    private boolean shouldRetryForceHls(PlaybackException error) {
        int code = error.errorCode;
        return isPossibleHlsMimeMismatch(error)
                || code == PlaybackException.ERROR_CODE_IO_INVALID_HTTP_CONTENT_TYPE;
    }

    private boolean isRendererError(PlaybackException error) {
        int code = error.errorCode;
        return code == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED
                || code == PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED
                || code == PlaybackException.ERROR_CODE_DECODING_FAILED
                || code == PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES
                || code == PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED;
    }

    private boolean isTransientError(PlaybackException error) {
        int code = error.errorCode;
        return code == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED
                || code == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT
                || code == PlaybackException.ERROR_CODE_IO_UNSPECIFIED
                || code == PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS
                || code == PlaybackException.ERROR_CODE_IO_INVALID_HTTP_CONTENT_TYPE;
    }

    private void showError(String msg) {
        mainHandler.removeCallbacks(mainBufferWatchdog);
        terminalErrorShown = true;
        Log.e(TAG, "showError: " + msg);
        if (player != null) {
            try { player.stop(); } catch (Exception ignored) {}
        }
        if (playerView != null) playerView.setVisibility(View.GONE);
        if (errorText != null) errorText.setText(msg);
        if (errorOverlay != null) errorOverlay.setVisibility(View.VISIBLE);
        if (bufferingView != null) bufferingView.setVisibility(View.GONE);
        if (loadingLabel != null) loadingLabel.setVisibility(View.GONE);
        // Foca o botão de retry para que D-pad/ENTER funcione imediatamente
        if (retryButton != null) retryButton.requestFocus();
    }

    private void retryPlayback() {
        mainHandler.removeCallbacks(mainBufferWatchdog);
        terminalErrorShown = false;
        retryCount    = 0;
        retriedAsHls  = false;
        if (playerView != null) playerView.setVisibility(View.VISIBLE);
        if (errorOverlay != null) errorOverlay.setVisibility(View.GONE);
        if (bufferingView != null) bufferingView.setVisibility(View.VISIBLE);
        if (loadingLabel != null) loadingLabel.setVisibility(View.VISIBLE);
        preparePlayback(false);
    }

    private MediaItem buildMediaItem(String url, boolean forceHls) {
        String lower = url.toLowerCase();
        boolean isHls = forceHls
                || lower.endsWith(".m3u8")
                || lower.contains(".m3u8?")
                || lower.contains("m3u8");
        // Raw MPEG-TS (continuous .ts stream) — Media3 lida via ProgressiveMediaSource + TsExtractor.
        boolean isMpegTs = !isHls && (lower.endsWith(".ts") || lower.contains(".ts?"));

        MediaItem.Builder b = new MediaItem.Builder().setUri(Uri.parse(url));
        if (isHls) {
            b.setMimeType(MimeTypes.APPLICATION_M3U8);
            Log.d(TAG, "→ HLS: " + url.substring(0, Math.min(80, url.length())));
        } else if (isMpegTs) {
            b.setMimeType(MimeTypes.VIDEO_MP2T);
            Log.d(TAG, "→ MPEG-TS: " + url.substring(0, Math.min(80, url.length())));
        } else {
            if (lower.endsWith(".mp4") || lower.contains(".mp4?")) {
                b.setMimeType(MimeTypes.VIDEO_MP4);
            }
            Log.d(TAG, "→ progressive: " + url.substring(0, Math.min(80, url.length())));
        }
        return b.build();
    }

    private void preparePlayback(boolean forceHls) {
        if (player == null) return;
        terminalErrorShown = false;
        mainHandler.removeCallbacks(introWatchdog);
        mainHandler.removeCallbacks(mainBufferWatchdog);
        firstBufferingTimestamp = 0;
        readyTimestamp = 0;
        MediaItem main = buildMediaItem(sourceUrl, forceHls);
        player.stop();
        player.clearMediaItems();

        // Vinheta agora é overlay de frames .webp (ver startWebpIntro), não um item de
        // playlist do ExoPlayer. O main stream é sempre o item 0.
        introQueuedForCurrentPlayback = false;

        boolean useWebpIntro = !isLive && !webpIntroConsumed
                && introUrl != null && !introUrl.isEmpty();
        diag("introUrl=" + (introUrl == null ? "NULL" : introUrl) + " webpIntro=" + useWebpIntro);

        player.addMediaItem(main);
        if (!isLive && startPositionMs > 0) {
            player.seekTo(0, startPositionMs);
        }

        if (useWebpIntro) {
            // NÃO prepara/toca o player ainda: a vinheta webp roda sobre fundo preto.
            // prepare()+play são chamados em finishWebpIntro() — assim a SurfaceView do
            // vídeo (setZOrderMediaOverlay no TCL) não renderiza um frame do filme por
            // cima da vinheta.
            webpIntroConsumed = true;
            startWebpIntro();
        } else {
            player.setPlayWhenReady(true);
            player.prepare();
        }
    }

    // ───────────────────────── Vinheta webp (overlay) ─────────────────────────

    /** Inicia a vinheta de frames .webp sobre fundo preto, antes do main stream. */
    private void startWebpIntro() {
        try {
            if (introOverlayView == null) {
                introOverlayView = new ImageView(this);
                introOverlayView.setScaleType(ImageView.ScaleType.CENTER_CROP);
                introOverlayView.setBackgroundColor(Color.BLACK);
                introOverlayView.setLayoutParams(new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT));
                // Acima de playerView (z=10) e do HUD (z=80).
                introOverlayView.setTranslationZ(120f);
                root.addView(introOverlayView);
            }
            introOverlayView.setVisibility(View.VISIBLE);
            introOverlayView.bringToFront();
            webpIntroActive = true;
            introFrameIndex = INTRO_START_FRAME;
            if (bufferingView != null) bufferingView.setVisibility(View.GONE);
            if (loadingLabel != null) loadingLabel.setVisibility(View.GONE);
            if (playerHud != null) playerHud.setVisibility(View.GONE);
            mainHandler.removeCallbacks(introOverlayMaxTimeout);
            mainHandler.postDelayed(introOverlayMaxTimeout, INTRO_OVERLAY_MAX_MS);
            diag("Vinheta webp: start");
            renderNextIntroFrame();
        } catch (Exception e) {
            Log.w(TAG, "Falha ao iniciar vinheta webp", e);
            finishWebpIntro("start_error");
        }
    }

    private void renderNextIntroFrame() {
        if (!webpIntroActive || introOverlayView == null) return;
        if (introFrameIndex >= INTRO_FRAME_COUNT) {
            finishWebpIntro("frames_done");
            return;
        }
        try {
            String assetPath = String.format(java.util.Locale.US, INTRO_FRAME_PATH, introFrameIndex);
            try (java.io.InputStream stream = getAssets().open(assetPath)) {
                android.graphics.Bitmap next = android.graphics.BitmapFactory.decodeStream(stream);
                if (next == null) throw new IllegalStateException("frame null: " + assetPath);
                android.graphics.Bitmap prev = introCurrentFrame;
                introCurrentFrame = next;
                introOverlayView.setImageBitmap(introCurrentFrame);
                if (prev != null && !prev.isRecycled()) prev.recycle();
            }
            introFrameIndex += INTRO_FRAME_STEP;
            mainHandler.postDelayed(introFrameTick, INTRO_FRAME_DURATION_MS);
        } catch (Exception e) {
            Log.w(TAG, "Falha no frame " + introFrameIndex + " da vinheta webp", e);
            finishWebpIntro("frame_error");
        }
    }

    /** Encerra a vinheta webp, remove o overlay e libera o main stream. */
    private void finishWebpIntro(String reason) {
        if (!webpIntroActive && introOverlayView == null) return;
        diag("Vinheta webp fim: " + reason);
        webpIntroActive = false;
        if (mainHandler != null) {
            mainHandler.removeCallbacks(introFrameTick);
            mainHandler.removeCallbacks(introOverlayMaxTimeout);
        }
        // Agora libera o filme: prepara e toca o main stream (item 0).
        if (player != null && !isLive) {
            player.setPlayWhenReady(true);
            player.prepare();
        }
        if (introOverlayView != null) {
            introOverlayView.setVisibility(View.GONE);
            introOverlayView.setImageDrawable(null);
            if (root != null) root.removeView(introOverlayView);
            introOverlayView = null;
        }
        releaseIntroFrame();
        // HUD aparece sozinho quando o main stream começar a tocar (onIsPlayingChanged).
        updateHud();
    }

    private void releaseIntroFrame() {
        try {
            if (introCurrentFrame != null && !introCurrentFrame.isRecycled()) introCurrentFrame.recycle();
            introCurrentFrame = null;
        } catch (Exception ignored) {}
    }

    private void skipIntroAndPlayMain(String reason) {
        if (player == null) return;
        mainHandler.removeCallbacks(introWatchdog);
        mainHandler.removeCallbacks(mainBufferWatchdog);
        firstBufferingTimestamp = 0;
        readyTimestamp = 0;
        diag("skipIntroAndPlayMain reason=" + reason);
        introQueuedForCurrentPlayback = false;
        introUrl = null; // Evita re-enfileirar intro em retries futuros.
        player.stop();
        player.clearMediaItems();
        MediaItem main = buildMediaItem(sourceUrl, false);
        player.addMediaItem(main);
        if (!isLive && startPositionMs > 0) {
            player.seekTo(0, startPositionMs);
        }
        playerView.setUseController(false);
        updateHud();
        player.setPlayWhenReady(true);
        player.prepare();
    }

    private void handleMainBufferStall() {
        if (player == null) return;
        if (!fallbackUsed && fallbackUrl != null && !fallbackUrl.isEmpty()
                && !fallbackUrl.equalsIgnoreCase(sourceUrl)) {
            Log.w(TAG, "Buffer timeout; trocando para fallback: " + fallbackUrl);
            fallbackUsed = true;
            sourceUrl = fallbackUrl;
            retryCount = 0;
            retriedAsHls = false;
            introUrl = null;
            if (errorOverlay != null) errorOverlay.setVisibility(View.GONE);
            if (bufferingView != null) bufferingView.setVisibility(View.VISIBLE);
            preparePlayback(false);
            return;
        }

        int maxRetries = getMaxRetriesForCurrentStream();
        if (retryCount < maxRetries) {
            retryCount++;
            Log.w(TAG, "Buffer timeout; retry " + retryCount + "/" + maxRetries);
            preparePlayback(retriedAsHls);
            return;
        }

        showError("Tempo esgotado ao carregar o stream. Tente novamente.");
    }

    private String normalizeAndroidAssetUri(@Nullable String uri) {
        if (uri == null || uri.isEmpty()) return uri;
        if (uri.startsWith("asset:///")) {
            return "file:///android_asset/" + uri.substring("asset:///".length());
        }
        // android.resource://<pkg>/<type>/<name> → rawresource:///<resId>.
        // O scheme rawresource é resolvido de forma confiável pelo DefaultDataSource;
        // a forma android.resource:// nomeada às vezes não é roteada e o player trava.
        if (uri.startsWith("android.resource://")) {
            try {
                android.net.Uri u = android.net.Uri.parse(uri);
                java.util.List<String> seg = u.getPathSegments();
                if (seg != null && seg.size() >= 2) {
                    int resId = getResources().getIdentifier(seg.get(1), seg.get(0), getPackageName());
                    if (resId != 0) {
                        String resolved = androidx.media3.datasource.RawResourceDataSource
                                .buildRawResourceUri(resId).toString();
                        Log.i(TAG, "introUrl normalizada: " + uri + " → " + resolved);
                        return resolved;
                    }
                    Log.w(TAG, "introUrl: recurso não encontrado para " + uri);
                }
            } catch (Exception e) {
                Log.w(TAG, "normalizeAndroidAssetUri falhou para " + uri, e);
            }
        }
        return uri;
    }

    private String stateToString(int state) {
        switch (state) {
            case Player.STATE_IDLE: return "IDLE";
            case Player.STATE_BUFFERING: return "BUFFERING";
            case Player.STATE_READY: return "READY";
            case Player.STATE_ENDED: return "ENDED";
            default: return String.valueOf(state);
        }
    }

    private Map<String, String> buildRequestHeaders(String url) {
        Map<String, String> h = new HashMap<>();
        h.put("Accept", isLive
                ? "application/x-mpegURL, application/vnd.apple.mpegurl, video/mp2t, video/*, */*"
                : "*/*");
        h.put("Accept-Language", "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7");
        h.put("Connection", "keep-alive");
        if (isLive) {
            h.put("Cache-Control", "no-cache");
            h.put("Pragma", "no-cache");
            h.put("Icy-MetaData", "1");
        }
        return h;
    }

    private int getMaxRetriesForCurrentStream() {
        return isLive ? MAX_RETRIES_LIVE : MAX_RETRIES;
    }

    /** Headers chegam como String[] alternando key,value ou JSON string simples. */
    private Map<String, String> parseHeadersFromIntent(Intent intent) {
        if (intent == null) return new HashMap<>();
        try {
            Map<String, String> fromArray = parseHeaders(intent.getStringArrayExtra(EXTRA_HEADERS));
            if (!fromArray.isEmpty()) return fromArray;
        } catch (Exception e) {
            Log.w(TAG, "EXTRA_HEADERS String[] invalido; tentando JSON/string", e);
        }
        try {
            return parseHeadersJson(intent.getStringExtra(EXTRA_HEADERS));
        } catch (Exception e) {
            Log.w(TAG, "EXTRA_HEADERS JSON/string invalido; ignorando headers customizados", e);
            return new HashMap<>();
        }
    }

    /** Headers chegam como String[] alternando key,value. */
    private Map<String, String> parseHeaders(@Nullable String[] arr) {
        Map<String, String> out = new HashMap<>();
        if (arr == null || arr.length < 2) return out;
        for (int i = 0; i + 1 < arr.length; i += 2) {
            String k = arr[i];
            String v = arr[i + 1];
            if (k != null && v != null) out.put(k, v);
        }
        return out;
    }

    private Map<String, String> parseHeadersJson(@Nullable String json) throws Exception {
        Map<String, String> out = new HashMap<>();
        if (json == null || json.trim().isEmpty()) return out;
        org.json.JSONObject obj = new org.json.JSONObject(json);
        Iterator<String> keys = obj.keys();
        while (keys.hasNext()) {
            String k = keys.next();
            String v = obj.optString(k, null);
            if (k != null && v != null) out.put(k, v);
        }
        return out;
    }

    // ───────────────────────────── Lifecycle ─────────────────────────────

    @Override
    protected void onStart() {
        Log.i(TAG, "[RED_EXOPLAYER] onStart");
        super.onStart();
    }

    @Override
    protected void onPause() {
        Log.i(TAG, "[RED_EXOPLAYER] onPause");
        Log.i(TAG, "onPause");
        super.onPause();
        // IMP-07: salva intenção antes de pausar (live sempre retoma; VOD respeita user)
        if (player != null) {
            wasPlayingBeforePause = player.getPlayWhenReady();
            player.setPlayWhenReady(false);
        }
    }

    @Override
    protected void onResume() {
        Log.i(TAG, "[RED_EXOPLAYER] onResume");
        Log.i(TAG, "onResume");
        super.onResume();
        if (player != null) {
            // Live sempre retoma. VOD só retoma se estava tocando antes (preserva pausa do user).
            player.setPlayWhenReady(isLive || wasPlayingBeforePause);
        }
    }

    @Override
    protected void onStop() {
        Log.i(TAG, "[RED_EXOPLAYER] onStop");
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        Log.i(TAG, "[RED_EXOPLAYER] onDestroy");
        Log.i(TAG, "onDestroy");
        if (debugUpdateHandler != null) { debugUpdateHandler.removeCallbacksAndMessages(null); debugUpdateHandler = null; }
        if (mainHandler != null) mainHandler.removeCallbacks(introWatchdog);
        webpIntroActive = false;
        if (mainHandler != null) {
            mainHandler.removeCallbacks(introFrameTick);
            mainHandler.removeCallbacks(introOverlayMaxTimeout);
        }
        releaseIntroFrame();
        if (player != null) {
            player.release();
            player = null;
        }
        if (playerView != null) playerView.setPlayer(null);
        if (mainHandler != null) mainHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();

        // BACK ou MENU: sempre encerra (VOD e Live).
        if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_MENU) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                returnResultAndFinish();
            }
            return true;
        }

        // Live/Adulto: setas e ChannelUp/ChannelDown devolvem acao de zapping
        // para o React abrir o canal vizinho; OK/BACK/MENU voltam para a grade.
        if (isLive) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                switch (keyCode) {
                    case KeyEvent.KEYCODE_CHANNEL_UP:
                    case KeyEvent.KEYCODE_DPAD_RIGHT:
                    case KeyEvent.KEYCODE_DPAD_DOWN:
                        returnLiveActionAndFinish("channelUp");
                        return true;
                    case KeyEvent.KEYCODE_CHANNEL_DOWN:
                    case KeyEvent.KEYCODE_DPAD_LEFT:
                    case KeyEvent.KEYCODE_DPAD_UP:
                        returnLiveActionAndFinish("channelDown");
                        return true;
                    default:
                        returnResultAndFinish();
                        return true;
                }
            }
            return true;
        }

        // VOD: controles RedFlix nativos. Setas fazem seek, OK pausa/retoma.
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            if (playerView != null) playerView.requestFocus();
            showHud();
            switch (keyCode) {
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                    clickFocusedHudButton();
                    return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    moveHudFocus(-1);
                    return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    moveHudFocus(1);
                    return true;
                case KeyEvent.KEYCODE_MEDIA_REWIND:
                    seekBy(-30_000L);
                    return true;
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                    seekBy(30_000L);
                    return true;
                // FIX-06 (PRD §15.1): media keys VOD dedicated handlers
                case KeyEvent.KEYCODE_MEDIA_PLAY:
                    if (player != null && !player.isPlaying()) player.setPlayWhenReady(true);
                    return true;
                case KeyEvent.KEYCODE_MEDIA_PAUSE:
                    if (player != null && player.isPlaying()) player.setPlayWhenReady(false);
                    return true;
                case KeyEvent.KEYCODE_MEDIA_STOP:
                    returnResultAndFinish();
                    return true;
                case KeyEvent.KEYCODE_MEDIA_NEXT:
                    // Sem episódio next implementado no Activity: finaliza com action="next"
                    // para o React abrir próximo episódio se aplicável.
                    {
                        Intent res = new Intent();
                        res.putExtra(RESULT_ACTION, "next");
                        int pos = (player != null && !isLive) ? (int) (player.getCurrentPosition() / 1000) : 0;
                        res.putExtra(RESULT_POSITION, pos);
                        setResult(RESULT_OK, res);
                        pausePlayerBeforeFinish();
                        finish();
                    }
                    return true;
                case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                    {
                        Intent res = new Intent();
                        res.putExtra(RESULT_ACTION, "previous");
                        int pos = (player != null && !isLive) ? (int) (player.getCurrentPosition() / 1000) : 0;
                        res.putExtra(RESULT_POSITION, pos);
                        setResult(RESULT_OK, res);
                        pausePlayerBeforeFinish();
                        finish();
                    }
                    return true;
                case KeyEvent.KEYCODE_DPAD_UP:
                    focusHudButton(2);
                    return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    scheduleHudHide();
                    return true;
                default:
                    updateHud();
                    break;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private void returnResultAndFinish() {
        int positionSec = 0;
        if (player != null && !isLive) {
            if (webpIntroActive) {
                // Ainda na vinheta: o filme nem começou — preserva a posição de retomada.
                positionSec = (int) (startPositionMs / 1000);
            } else {
                // Main stream é sempre o item 0 (vinheta agora é overlay, não item de playlist).
                positionSec = (int) (player.getCurrentPosition() / 1000);
            }
        }
        Intent res = new Intent();
        res.putExtra(RESULT_POSITION, positionSec);
        setResult(RESULT_OK, res);
        pausePlayerBeforeFinish();
        finish();
    }

    private void returnLiveActionAndFinish(String action) {
        Intent res = new Intent();
        res.putExtra(RESULT_ACTION, action);
        // Para acoes VOD (openCast/openEpisodes) incluimos position para resume pos-painel.
        int positionSec = 0;
        if (player != null && !isLive) {
            if (webpIntroActive) {
                positionSec = (int) (startPositionMs / 1000);
            } else {
                positionSec = (int) (player.getCurrentPosition() / 1000);
            }
        }
        res.putExtra(RESULT_POSITION, positionSec);
        setResult(RESULT_OK, res);
        pausePlayerBeforeFinish();
        finish();
    }

    private void pausePlayerBeforeFinish() {
        if (player == null) return;
        try {
            player.setPlayWhenReady(false);
            player.pause();
        } catch (Exception ignored) {}
    }

    private void updateDebugOverlay() {
        if (debugOverlayView == null || player == null) return;
        String state = "UNKNOWN";
        switch (player.getPlaybackState()) {
            case Player.STATE_IDLE: state = "IDLE"; break;
            case Player.STATE_BUFFERING: state = "BUFFERING"; break;
            case Player.STATE_READY: state = "READY"; break;
            case Player.STATE_ENDED: state = "ENDED"; break;
        }
        String info = "RED_DEBUG Native Player\n"
            + "State: " + state + " | Playing: " + player.isPlaying() + "\n"
            + "Position: " + (player.getCurrentPosition()/1000) + "s / " + (player.getDuration()/1000) + "s\n"
            + "Buffered: " + (player.getBufferedPosition()/1000) + "s\n"
            + "FirstFrame: " + renderedFirstFrame + "\n"
            + "Video: " + player.getVideoSize().width + "x" + player.getVideoSize().height + "\n"
            + "Error: " + (player.getPlayerError() != null ? player.getPlayerError().getMessage() : "none");
        debugOverlayView.setText(info);
    }
}
