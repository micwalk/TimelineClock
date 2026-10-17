package com.micwalk.timelineclock;

import android.app.Activity;
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
