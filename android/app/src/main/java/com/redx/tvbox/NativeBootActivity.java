package com.redx.tvbox;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;

import java.io.InputStream;

/**
 * Splash nativo — cobre apenas o cold-start do WebView com um frame ESTÁTICO.
 *
 * A vinheta animada roda uma única vez no React (AppBootScreen.tsx). Aqui não
 * animamos nada: animar a sequência aqui fazia a vinheta tocar 2x (nativo + WebView).
 */
public class NativeBootActivity extends Activity {
    private static final String TAG = "RedXNativeBoot";
    /** Frame único exibido enquanto o WebView aquece. Continuidade com o 1º frame do AppBootScreen. */
    private static final String STATIC_FRAME = "public/boot-vinheta/frame_001.webp";
    /** Tempo segurando o frame estático antes de entregar à MainActivity (warm-up do WebView). */
    private static final long HOLD_MS = 1600L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean launchedMain = false;
    private ImageView frameView;
    private Bitmap staticFrame;

    private final Runnable launchRunnable = new Runnable() {
        @Override
        public void run() {
            launchMain();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(android.graphics.Color.BLACK);
        setContentView(root);

        frameView = new ImageView(this);
        frameView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        frameView.setBackgroundColor(android.graphics.Color.BLACK);
        frameView.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        root.addView(frameView);

        try (InputStream stream = getAssets().open(STATIC_FRAME)) {
            staticFrame = BitmapFactory.decodeStream(stream);
            if (staticFrame != null) {
                frameView.setImageBitmap(staticFrame);
            }
        } catch (Exception e) {
            Log.e(TAG, "failed to load static boot frame", e);
        }

        handler.postDelayed(launchRunnable, HOLD_MS);
    }

    private void launchMain() {
        if (launchedMain) return;
        launchedMain = true;
        handler.removeCallbacks(launchRunnable);

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        finish();
        overridePendingTransition(0, 0);
    }

    private void releaseFrame() {
        try {
            if (frameView != null) {
                frameView.setImageDrawable(null);
            }
            if (staticFrame != null && !staticFrame.isRecycled()) {
                staticFrame.recycle();
            }
            staticFrame = null;
        } catch (Exception ignored) {}
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(launchRunnable);
        releaseFrame();
        super.onDestroy();
    }
}
