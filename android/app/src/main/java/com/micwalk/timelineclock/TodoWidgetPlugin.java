package com.micwalk.timelineclock;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;

/**
 * The page's side of the todo widgets (src/services/native/todoWidgetPlugin.ts): it writes its
 * todos for them, and takes what they asked for (TodoWidgetStore).
 */
@CapacitorPlugin(name = "TodoWidget")
public class TodoWidgetPlugin extends Plugin {

    @PluginMethod
    public void setSnapshot(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("No snapshot");
            return;
        }
        TodoWidgetStore.setSnapshot(getContext(), json);
        TodoListWidget.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void drain(PluginCall call) {
        try {
            JSObject out = new JSObject();
            out.put("inbox", JSObject.fromJSONObject(TodoWidgetStore.drain(getContext())));
            call.resolve(out);
        } catch (JSONException e) {
            call.reject("Could not read the inbox", e);
        }
    }
}
