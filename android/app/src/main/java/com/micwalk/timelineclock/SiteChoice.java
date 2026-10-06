package com.micwalk.timelineclock;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.text.InputType;
import android.util.Log;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;
import com.getcapacitor.CapConfig;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.function.Consumer;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * TC Preview only (BuildConfig.PREVIEW): which site the app loads. The choice (a pull
 * request's Netlify deploy preview, typed as its PR number) is saved, and the bundled
 * Capacitor config is loaded with server.url swapped for it, so nothing about a PR is baked
 * into the APK. The real app always loads the live site.
 */
final class SiteChoice {

    /** "Change preview" (the app icon's long-press shortcut) opens the chooser with this action. */
    static final String ACTION_CHOOSE = "com.micwalk.timelineclock.CHOOSE_SITE";

    private static final String TAG = "SiteChoice";
    private static final String PREFS = "site_choice";
    private static final String KEY_URL = "url";
    private static final String CONFIG_FILE = "capacitor.config.json";

    private SiteChoice() {}

    /** The saved address, or null before the first choice. */
    static String saved(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_URL, null);
    }

    private static void save(Context context, String url) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_URL, url).apply();
    }

    /** The bundled config (capacitor.config.json), or null if it can't be read. */
    private static JSONObject bundledConfig(Context context) {
        try (InputStream in = context.getAssets().open(CONFIG_FILE)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
        } catch (IOException | JSONException e) {
            Log.e(TAG, "Could not read the bundled config", e);
            return null;
        }
    }

    /** The live site's address (server.url in the bundled config). */
    static String liveUrl(Context context) {
        JSONObject config = bundledConfig(context);
        JSONObject server = config == null ? null : config.optJSONObject("server");
        return server == null ? null : server.optString("url", null);
    }

    /**
     * The bundled config with server.url set to `url`, written to the app's files and loaded
     * from there. Null if anything fails (the app then loads the live site).
     */
    static CapConfig configFor(Context context, String url) {
        try {
            JSONObject config = bundledConfig(context);
            if (config == null) return null;
            JSONObject server = config.optJSONObject("server");
            if (server == null) {
                server = new JSONObject();
                config.put("server", server);
            }
            server.put("url", url);
            File dir = new File(context.getFilesDir(), "site-choice");
            if (!dir.isDirectory() && !dir.mkdirs()) return null;
            try (OutputStream out = new FileOutputStream(new File(dir, CONFIG_FILE))) {
                out.write(config.toString().getBytes(StandardCharsets.UTF_8));
            }
            return CapConfig.loadFromFile(context, dir.getAbsolutePath());
        } catch (IOException | JSONException | RuntimeException e) {
            Log.e(TAG, "Could not build the config for " + url, e);
            return null;
        }
    }

    /** Long-press the app icon › "Change preview". */
    static void addShortcut(Context context) {
        try {
            Intent intent = new Intent(context, MainActivity.class).setAction(ACTION_CHOOSE);
            ShortcutInfoCompat shortcut = new ShortcutInfoCompat.Builder(context, "choose-site")
                .setShortLabel("Change preview")
                .setLongLabel("Load another pull request's preview")
                .setIcon(IconCompat.createWithResource(context, R.mipmap.ic_launcher))
                .setIntent(intent)
                .build();
            ShortcutManagerCompat.pushDynamicShortcut(context, shortcut);
        } catch (RuntimeException e) {
            Log.w(TAG, "Could not add the Change preview shortcut", e);
        }
    }

    /**
     * Asks which preview to load. `onChosen` gets the new address after it is saved;
     * `onClosed` runs when the dialog goes away either way.
     */
    static void showChooser(Activity activity, Consumer<String> onChosen, Runnable onClosed) {
        String live = liveUrl(activity);
        String current = saved(activity);

        EditText input = new EditText(activity);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("PR number, e.g. 6");
        input.setText(SiteAddress.editable(current, live));
        input.setSelectAllOnFocus(true);
        FrameLayout box = new FrameLayout(activity);
        int pad = Math.round(20 * activity.getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad / 2, pad, 0);
        box.addView(input);

        String now = current == null ? "Nothing chosen yet: showing the live site." : "Now showing " + SiteAddress.describe(current, live) + ".";
        AlertDialog dialog = new AlertDialog.Builder(activity)
            .setTitle("Which preview?")
            .setMessage(
                now +
                "\n\nType a pull request's number to load its Netlify deploy preview (or paste a preview address). " +
                "To change it later, long-press the app icon › Change preview."
            )
            .setView(box)
            .setPositiveButton("Open", null)
            .setNeutralButton("Live site", null)
            .setNegativeButton("Cancel", null)
            .create();
        dialog.setOnDismissListener(d -> onClosed.run());
        dialog.setOnShowListener(d -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                String url = SiteAddress.parse(input.getText().toString(), live);
                if (url == null) {
                    Toast.makeText(activity, "Type a PR number, or a timelineclockapp preview address", Toast.LENGTH_LONG).show();
                    return;
                }
                choose(activity, dialog, url, onChosen);
            });
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> {
                if (live != null) choose(activity, dialog, live, onChosen);
            });
        });
        dialog.show();
    }

    private static void choose(Activity activity, AlertDialog dialog, String url, Consumer<String> onChosen) {
        save(activity, url);
        dialog.dismiss();
        onChosen.accept(url);
    }
}
