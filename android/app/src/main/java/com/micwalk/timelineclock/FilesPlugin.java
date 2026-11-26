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
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Saving a file the user picks the place for (src/services/native/filesPlugin.ts): a backup export.
 * The WebView ignores a page's download links, so the page hands the text here and Android's own
 * "Save to…" picker (Storage Access Framework) asks where it goes. No storage permission needed.
 *
 * The text waits in a file of the app's while the picker is open, not in the call: Capacitor keeps
 * the call's data in the activity's saved state (twice) while another activity is in front, and
 * Android caps that state at about 1 MB, so a big backup crashed the app as the picker opened and
 * the picked file stayed empty. From the file it is written even if Android restarted the app
 * meanwhile. Not the cache: Android clears that when storage runs low, picker open or not.
 */
@CapacitorPlugin(name = "Files")
public class FilesPlugin extends Plugin {

    /** Where the text waits while the picker is open (not backed up, never cleared by Android). */
    private static final String PENDING = "pending-save";

    private File pending() {
        return new File(getContext().getNoBackupFilesDir(), PENDING);
    }

    /** save({ name, text, mimeType }) → { saved: false } when the picker was cancelled. */
    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("name", "backup.json");
        String mimeType = call.getString("mimeType", "application/json");
        String text = call.getString("text", "");
        try (OutputStream out = new FileOutputStream(pending())) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            Diag.log(getContext(), "file save failed (holding the text): " + e);
            call.reject("Could not save the file", e);
            return;
        }
        // Keep the saved state small (see above): the text waits in the file now.
        call.getData().remove("text");
        Diag.log(getContext(), "file save: " + text.length() + " chars");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "picked");
    }

    /** `call` is null when Android restarted the app while the picker was open: the file is still written. */
    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        File pending = pending();
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        Diag.log(getContext(), "file picked: result " + result.getResultCode() + (uri == null ? ", no place" : "") + (call == null ? ", app restarted" : ""));
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            pending.delete();
            if (call == null) return;
            JSObject out = new JSObject();
            out.put("saved", false);
            call.resolve(out);
            return;
        }
        try (InputStream in = new FileInputStream(pending);
             OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (stream == null) throw new IllegalStateException("No stream for " + uri);
            byte[] buffer = new byte[64 * 1024];
            for (int n; (n = in.read(buffer)) > 0; ) stream.write(buffer, 0, n);
        } catch (Exception e) {
            Diag.log(getContext(), "file save failed: " + e);
            if (call != null) call.reject("Could not save the file", e);
            return;
        } finally {
            pending.delete();
        }
        Diag.log(getContext(), "file saved");
        if (call == null) return;
        JSObject out = new JSObject();
        out.put("saved", true);
        call.resolve(out);
    }
}
