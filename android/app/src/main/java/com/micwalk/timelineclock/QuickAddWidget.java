package com.micwalk.timelineclock;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.ArrayMap;
import android.util.SizeF;
import android.widget.RemoteViews;
import java.util.Map;

/** The quick-add widget (docs/prd_todo_import_widgets.md §3): 1×1 (a ＋) or wider; one tap opens QuickAddActivity. */
public class QuickAddWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, views(c));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager manager, int id, Bundle options) {
        manager.updateAppWidget(id, views(c));
    }

    /** Just the ＋ at 1×1; "＋ Add todo 🎙" from 2 cells wide (the launcher picks by size). */
    private static RemoteViews views(Context c) {
        RemoteViews small = new RemoteViews(c.getPackageName(), R.layout.widget_quick_add_small);
        small.setOnClickPendingIntent(R.id.widget_quick_add, quickAdd(c));
        RemoteViews wide = new RemoteViews(c.getPackageName(), R.layout.widget_quick_add);
        wide.setOnClickPendingIntent(R.id.widget_quick_add, quickAdd(c));
        Map<SizeF, RemoteViews> bySize = new ArrayMap<>();
        bySize.put(new SizeF(40f, 40f), small);
        bySize.put(new SizeF(110f, 40f), wide);
        return new RemoteViews(bySize);
    }

    /** Opens quick add (also the list widget's ＋). */
    static PendingIntent quickAdd(Context c) {
        Intent i = new Intent(c, QuickAddActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
