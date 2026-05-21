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

public class NativeBootActivity extends Activity {
    private static final String TAG = "RedXNativeBoot";
    private static final int FRAME_COUNT = 72;
    private static final int START_FRAME = 6;
    private static final int FRAME_STEP = 2;
    private static final long FRAME_DURATION_MS = 65L;
    private static final long MAX_BOOT_MS = 8000L;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean launchedMain = false;
    private int frameIndex = START_FRAME;
    private ImageView frameView;
    private Bitmap currentFrame;

    private final Runnable fallbackLaunch = new Runnable() {
        @Override
        public void run() {
            Log.w(TAG, "fallback timeout; launching MainActivity");
            launchMain();
        }
    };

    private final Runnable frameTick = new Runnable() {
        @Override
        public void run() {
            renderNextFrame();
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

        handler.postDelayed(fallbackLaunch, MAX_BOOT_MS);
        renderNextFrame();
    }

    private void renderNextFrame() {
        if (launchedMain) return;
        if (frameIndex >= FRAME_COUNT) {
            launchMain();
            return;
        }

        try {
            String assetPath = String.format("public/boot-vinheta/frame_%03d.webp", frameIndex);
            try (InputStream stream = getAssets().open(assetPath)) {
                Bitmap nextFrame = BitmapFactory.decodeStream(stream);
                if (nextFrame == null) {
                    throw new IllegalStateException("decoded frame is null: " + assetPath);
                }
                Bitmap previousFrame = currentFrame;
                currentFrame = nextFrame;
                frameView.setImageBitmap(currentFrame);
                if (previousFrame != null && !previousFrame.isRecycled()) {
                    previousFrame.recycle();
                }
            }

            frameIndex += FRAME_STEP;
            handler.postDelayed(frameTick, FRAME_DURATION_MS);
        } catch (Exception e) {
            Log.e(TAG, "failed to render boot vinheta frame " + frameIndex, e);
            launchMain();
        }
    }

    private void launchMain() {
        if (launchedMain) return;
        launchedMain = true;
        handler.removeCallbacks(fallbackLaunch);
        handler.removeCallbacks(frameTick);
        releaseFrames();

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        finish();
        overridePendingTransition(0, 0);
    }

    private void releaseFrames() {
        try {
            if (frameView != null) {
                frameView.setImageDrawable(null);
            }
            if (currentFrame != null && !currentFrame.isRecycled()) {
                currentFrame.recycle();
            }
            currentFrame = null;
        } catch (Exception ignored) {}
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(fallbackLaunch);
        handler.removeCallbacks(frameTick);
        releaseFrames();
        super.onDestroy();
    }
}
