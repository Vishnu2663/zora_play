package com.miloplay.tvbuddy.firetv;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Hosts Milo (milo/dist, copied into assets/) in Android's WebView on Fire OS.
 *
 * Remote mapping:
 *  - D-pad arrows and centre reach the page natively as ArrowUp/Down/Left/Right and Enter.
 *  - Back is intercepted and sent to the page as an Escape keydown, so Milo's own
 *    Back logic runs (games -> menu -> home; on Home, press twice to leave).
 *  - Play/Pause is sent as MediaPlayPause (pauses/resumes songs).
 * The page asks to exit through window.ReactNativeWebView.postMessage('{"type":"exit"}'),
 * the same message the Vega shell understands.
 */
public class MainActivity extends Activity {
    private static final String START_URL = "file:///android_asset/index.html";
    private WebView web;
    private boolean shown;
    private FrameLayout root;
    private View splash;
    private final java.util.ArrayList<ObjectAnimator> splashAnims = new java.util.ArrayList<>();
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(0xFF6EC6F2); // sky colour: avoids a white flash before the page paints
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        web.setAlpha(0f); // the splash window background shows until the page has painted

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                    // settings / chosen character
        s.setMediaPlaybackRequiresUserGesture(false);    // Milo can speak without a tap
        s.setAllowFileAccess(true);                      // file:///android_asset/audio/...
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);

        web.addJavascriptInterface(new Bridge(), "ReactNativeWebView");
        web.setWebViewClient(new WebViewClient() {
            // Children's app: never navigate away from the bundled page.
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith("file:///android_asset/");
            }

            // The page itself says {"type":"ready"} once it has settled and its opening is about to play (App.tsx), so the smooth
            // native splash stays up while the page boots, instead of the page's first (heavy) frames being seen.
            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !url.startsWith("file:///android_asset/");
            }
        });

        root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        buildSplash();
        setContentView(root);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.requestFocus();
        String q = getIntent() != null ? getIntent().getStringExtra("q") : null; // debug only: adb ... --es q "?perf=nosky"
        // The TV app always shows the light, flat buddies (?2d): smooth on every Fire TV stick, from the 1 GB ones up.
        // (Debug: adb ... --es q "?perf=nosky" adds a perf switch.)
        web.loadUrl(START_URL + "?2d" + (q != null && q.startsWith("?perf=") ? "&" + q.substring(1) : ""));
        ui.postDelayed(this::reveal, 6000); // safety net: never stay on the splash
    }

    /**
     * Animated intro shown while the WebView boots: the same artwork as the window background
     * (so there is no blue flash), slowly zooming, with three bouncing dots.
     */
    private void buildSplash() {
        FrameLayout layer = new FrameLayout(this);
        ImageView art = new ImageView(this);
        art.setImageResource(R.drawable.splash_art);
        art.setScaleType(ImageView.ScaleType.FIT_XY);
        layer.addView(art, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout dots = new LinearLayout(this);
        dots.setOrientation(LinearLayout.HORIZONTAL);
        dots.setClipChildren(false);
        layer.setClipChildren(false);
        float d = getResources().getDisplayMetrics().density;
        int size = (int) (14 * d);
        for (int i = 0; i < 3; i++) {
            View dot = new View(this);
            GradientDrawable g = new GradientDrawable();
            g.setShape(GradientDrawable.OVAL);
            g.setColor(0xFFFFFFFF);
            dot.setBackground(g);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(size, size);
            lp.setMargins(size / 2, 0, size / 2, 0);
            dots.addView(dot, lp);
            ObjectAnimator bounce = ObjectAnimator.ofFloat(dot, View.TRANSLATION_Y, 0f, -size * 1.2f, 0f);
            bounce.setDuration(700);
            bounce.setStartDelay(i * 150L);
            bounce.setRepeatCount(ValueAnimator.INFINITE);
            bounce.setInterpolator(new LinearInterpolator());
            bounce.start();
            splashAnims.add(bounce);
        }
        FrameLayout.LayoutParams dlp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        dlp.bottomMargin = (int) (24 * d);
        layer.addView(dots, dlp);

        splash = layer;
        root.addView(layer, new FrameLayout.LayoutParams(-1, -1));
    }

    /** Crossfades from the splash to the page. */
    private void reveal() {
        if (shown || web == null) return;
        shown = true;
        // No cross-fade: blending two full-screen layers is what makes weak sticks stutter. The splash artwork
        // matches the page background, so an instant swap is invisible and the page's own intro takes over.
        web.setAlpha(1f);
        for (ObjectAnimator a : splashAnims) a.cancel();
        splashAnims.clear();
        if (splash != null) {
            root.removeView(splash);
            splash = null;
        }
    }

    /** Receives {"type":"exit"} from the page when Back is pressed twice on Home. */
    private final class Bridge {
        @JavascriptInterface
        public void postMessage(String message) {
            if (message != null && message.contains("\"ready\"")) {
                runOnUiThread(MainActivity.this::reveal);
            } else if (message != null && message.contains("\"exit\"")) {
                runOnUiThread(MainActivity.this::finish);
            }
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String key = null;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_BACK:
                key = "Escape";
                break;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                key = "MediaPlayPause";
                break;
            default:
                break;
        }
        if (key != null && web != null) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                web.evaluateJavascript(
                    "window.dispatchEvent(new KeyboardEvent('keydown',{key:'" + key + "',bubbles:true}));", null);
            }
            return true; // consumed: the page decides what Back means
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) {
            // Leaving the screen (Home button, screensaver): the page stops its own audio on
            // 'visibilitychange' (App.tsx); this also pauses any <audio> immediately.
            web.evaluateJavascript("document.querySelectorAll('audio').forEach(function(a){a.pause();});", null);
            web.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
