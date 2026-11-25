package com.micwalk.timelineclock;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * A tap on a list widget's row (TodoListWidget): its box ticks it done (kept for the page, dated
 * now; the widget redraws it ticked) and the rest of the row opens the app at it. An activity, not
 * a broadcast, so opening the app is allowed; it shows nothing and is gone at once.
 */
public class TodoWidgetActionActivity extends Activity {

    static final String EXTRA_TODO = "todo";
    static final String EXTRA_WHAT = "what";
    static final String DONE = "done";
    static final String OPEN = "open";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent in = getIntent();
        String id = in == null ? null : in.getStringExtra(EXTRA_TODO);
        String what = in == null ? null : in.getStringExtra(EXTRA_WHAT);
        if (DONE.equals(what) && id != null && !id.isEmpty()) {
            TodoWidgetStore.addDone(this, id, System.currentTimeMillis());
            Diag.log(this, "todo ticked on a widget");
            TodoListWidget.refreshAll(this);
        } else {
            TodoWidgetStore.setOpen(this, id == null ? "" : id);
            startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        }
        finish();
        overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, 0);
    }
}
