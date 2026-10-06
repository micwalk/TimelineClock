package com.micwalk.timelineclock;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    /** TC Preview: the "which preview?" dialog is open. */
    private boolean choosing = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Before the bridge starts, so alarms scheduled by the page always have their channel.
        NotificationChannels.ensure(this);
        Diag.watchMainThread(this);
        Diag.log(this, "activity created" + (savedInstanceState != null ? " (restored)" : ""));
        registerPlugin(AlarmsPlugin.class);
        registerPlugin(LiveNotificationsPlugin.class);

        String site = null;
        if (BuildConfig.PREVIEW) {
            site = SiteChoice.saved(this);
            if (site != null) {
                CapConfig chosen = SiteChoice.configFor(this, site);
                if (chosen != null) config = chosen;
            }
            // The chosen preview couldn't be loaded (Capacitor shows its offline page): offer another.
            bridgeBuilder.addWebViewListener(
                new WebViewListener() {
                    @Override
                    public void onPageCommitVisible(WebView view, String url) {
                        String errorUrl = bridge == null ? null : bridge.getErrorUrl();
                        if (errorUrl != null && url != null && url.startsWith(errorUrl)) chooseSite();
                    }
                }
            );
        }

        // The page's renderer crashing or being killed leaves a dead page: note it and reload.
        bridgeBuilder.addWebViewListener(
            new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    Diag.log(MainActivity.this, "page renderer gone" + (detail != null && detail.didCrash() ? " (crashed)" : " (killed)") + "; reloading");
                    // The WebView can't be used again: start the activity over rather than crash.
                    recreate();
                    return true;
                }
            }
        );

        super.onCreate(savedInstanceState);

        if (BuildConfig.PREVIEW) {
            SiteChoice.addShortcut(this);
            if (site == null || SiteChoice.ACTION_CHOOSE.equals(getIntent().getAction())) chooseSite();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        Alarms.appOpen = true;
        Diag.log(this, "resumed");
    }

    @Override
    public void onPause() {
        Alarms.appOpen = false;
        Diag.log(this, "paused");
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (BuildConfig.PREVIEW && intent != null && SiteChoice.ACTION_CHOOSE.equals(intent.getAction())) chooseSite();
    }

    /** TC Preview: ask which preview to load; a new choice restarts the page on it. */
    private void chooseSite() {
        if (choosing || isFinishing() || isDestroyed()) return;
        choosing = true;
        SiteChoice.showChooser(
            this,
            url -> {
                // Clear the intent so the restarted activity doesn't open the chooser again.
                setIntent(new Intent(this, MainActivity.class).setAction(Intent.ACTION_MAIN));
                recreate();
            },
            () -> choosing = false
        );
    }
}
