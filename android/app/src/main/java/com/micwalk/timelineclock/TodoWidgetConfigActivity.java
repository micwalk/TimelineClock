package com.micwalk.timelineclock;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.annotation.StringRes;

/**
 * A list widget's settings (docs/prd_todo_import_widgets.md §4), when it is placed and from its
 * ⚙: which todos it shows (Now, Scheduled, Unscheduled, Done today) and how many days ahead
 * scheduled ones reach (Today, 3 days, 7 days, All).
 */
public class TodoWidgetConfigActivity extends Activity {

    private static final int[] DAYS = {1, 3, 7, 0};
    private static final int[] DAY_LABELS = {R.string.todo_widget_today, R.string.todo_widget_3days, R.string.todo_widget_7days, R.string.todo_widget_all};

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent in = getIntent();
        if (in != null) widgetId = in.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        // Backed out of: the widget isn't placed.
        setResult(RESULT_CANCELED, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }
        setTitle(R.string.todo_widget_settings);
        int statuses = TodoWidgetStore.statuses(this, widgetId);
        int days = TodoWidgetStore.days(this, widgetId);
        float dp = getResources().getDisplayMetrics().density;
        int pad = Math.round(16 * dp);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, Math.round(8 * dp));

        root.addView(heading(R.string.todo_widget_show));
        CheckBox now = check(R.string.todo_widget_now, (statuses & TodoWidgetFilter.NOW) != 0);
        CheckBox scheduled = check(R.string.todo_widget_scheduled, (statuses & TodoWidgetFilter.SCHEDULED) != 0);
        CheckBox unscheduled = check(R.string.todo_widget_unscheduled, (statuses & TodoWidgetFilter.UNSCHEDULED) != 0);
        CheckBox done = check(R.string.todo_widget_done, (statuses & TodoWidgetFilter.DONE) != 0);
        root.addView(now);
        root.addView(scheduled);
        root.addView(unscheduled);
        root.addView(done);

        root.addView(heading(R.string.todo_widget_ahead));
        RadioGroup ahead = new RadioGroup(this);
        // Generated view ids (lint: a radio button's id must be an id, not an index).
        int[] ids = new int[DAYS.length];
        int checked = -1;
        for (int k = 0; k < DAYS.length; k++) {
            RadioButton b = new RadioButton(this);
            ids[k] = View.generateViewId();
            b.setId(ids[k]);
            b.setText(DAY_LABELS[k]);
            ahead.addView(b);
            if (DAYS[k] == days) checked = ids[k];
        }
        ahead.check(checked != -1 ? checked : ids[0]);
        root.addView(ahead);

        LinearLayout buttons = new LinearLayout(this);
        buttons.setGravity(Gravity.END);
        Button save = new Button(this, null, android.R.attr.borderlessButtonStyle);
        save.setText(android.R.string.ok);
        save.setOnClickListener(v -> {
            int s = (now.isChecked() ? TodoWidgetFilter.NOW : 0) | (scheduled.isChecked() ? TodoWidgetFilter.SCHEDULED : 0)
                | (unscheduled.isChecked() ? TodoWidgetFilter.UNSCHEDULED : 0) | (done.isChecked() ? TodoWidgetFilter.DONE : 0);
            int picked = 0;
            for (int k = 0; k < ids.length; k++) if (ids[k] == ahead.getCheckedRadioButtonId()) picked = k;
            TodoWidgetStore.setFilter(this, widgetId, s == 0 ? TodoWidgetFilter.DEFAULT_STATUSES : s, DAYS[picked]);
            TodoListWidget.update(this, AppWidgetManager.getInstance(this), widgetId);
            setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
            finish();
        });
        buttons.addView(save);
        root.addView(buttons);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        setContentView(scroll, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    private TextView heading(@StringRes int text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(13);
        t.setAllCaps(true);
        t.setPadding(0, Math.round(8 * getResources().getDisplayMetrics().density), 0, 0);
        return t;
    }

    private CheckBox check(@StringRes int text, boolean on) {
        CheckBox b = new CheckBox(this);
        b.setText(text);
        b.setChecked(on);
        return b;
    }
}
