package com.micwalk.timelineclock;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** The quick-add widget (docs/prd_todo_import_widgets.md §3): one tap opens QuickAddActivity. */
public class QuickAddWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_quick_add);
            v.setOnClickPendingIntent(R.id.widget_quick_add, quickAdd(c));
            manager.updateAppWidget(id, v);
        }
    }

    /** Opens quick add (also the list widget's ＋). */
    static PendingIntent quickAdd(Context c) {
        Intent i = new Intent(c, QuickAddActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
