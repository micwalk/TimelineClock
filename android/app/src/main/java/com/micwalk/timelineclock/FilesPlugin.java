package com.micwalk.timelineclock;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Saving a file the user picks the place for (src/services/native/filesPlugin.ts): a backup export.
 * The WebView ignores a page's download links, so the page hands the text here and Android's own
 * "Save to…" picker (Storage Access Framework) asks where it goes. No storage permission needed.
 */
@CapacitorPlugin(name = "Files")
public class FilesPlugin extends Plugin {

    /** save({ name, text, mimeType }) → { saved: false } when the picker was cancelled. */
    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("name", "backup.json");
        String mimeType = call.getString("mimeType", "application/json");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            JSObject out = new JSObject();
            out.put("saved", false);
            call.resolve(out);
            return;
        }
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (stream == null) throw new IllegalStateException("No stream for " + uri);
            stream.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            Diag.log(getContext(), "file save failed: " + e);
            call.reject("Could not save the file", e);
            return;
        }
        Diag.log(getContext(), "file saved");
        JSObject out = new JSObject();
        out.put("saved", true);
        call.resolve(out);
    }
}
