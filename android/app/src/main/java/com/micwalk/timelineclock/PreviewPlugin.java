package com.micwalk.timelineclock;

import android.app.Activity;
import android.net.Uri;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * TC Preview only (src/services/native/previewPlugin.ts): Settings' "Change preview" opens the
 * same "Which preview?" dialog as the launcher shortcut, from inside the app.
 */
@CapacitorPlugin(name = "Preview")
public class PreviewPlugin extends Plugin {

    /** The live site's host, read once from the bundled config. */
    private String liveHost;

    /**
     * TC Preview: a navigation to the live site (the offline page's retry, its Retry button) loads
     * the same path on the chosen preview. Capacitor would otherwise open it in the browser, as an
     * outside address, since the app's own site is the preview.
     */
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        if (!BuildConfig.PREVIEW || url == null || !"https".equals(url.getScheme())) return null;
        if (liveHost == null) {
            String live = SiteChoice.liveUrl(getContext());
            liveHost = live == null ? "" : Uri.parse(live).getHost();
        }
        String site = bridge.getServerUrl();
        if (liveHost == null || liveHost.isEmpty() || site == null || !liveHost.equalsIgnoreCase(url.getHost())) return null;
        Uri siteUri = Uri.parse(site);
        if (liveHost.equalsIgnoreCase(siteUri.getHost())) return null;
        String target = url.buildUpon().authority(siteUri.getAuthority()).build().toString();
        WebView webView = bridge.getWebView();
        webView.post(() -> webView.loadUrl(target));
        Diag.log(getContext(), "live site link loads the preview: " + siteUri.getHost());
        return true;
    }

    @PluginMethod
    public void choose(PluginCall call) {
        if (!BuildConfig.PREVIEW) {
            call.reject("Not a preview build");
            return;
        }
        Activity activity = getActivity();
        if (!(activity instanceof MainActivity)) {
            call.reject("No activity");
            return;
        }
        activity.runOnUiThread(((MainActivity) activity)::chooseSite);
        call.resolve();
    }
}
