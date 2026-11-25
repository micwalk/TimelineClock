package com.micwalk.timelineclock;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import java.time.ZoneId;
import java.util.List;

/**
 * The todo list widget (docs/prd_todo_import_widgets.md §4): the page's todos (TodoWidgetStore's
 * snapshot), filtered per widget by status and days ahead (TodoWidgetFilter; set in
 * TodoWidgetConfigActivity, its ⚙). A row's box ticks it done; the rest of the row opens the app
 * at it (TodoWidgetActionActivity). The header opens the Todos tab, its ＋ quick add.
 */
public class TodoListWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager manager, int[] ids) {
        for (int id : ids) update(c, manager, id);
    }

    @Override
    public void onDeleted(Context c, int[] ids) {
        for (int id : ids) TodoWidgetStore.forget(c, id);
    }

    /** Redraws every list widget (the page wrote new todos, or one was ticked). */
    static void refreshAll(Context c) {
        AppWidgetManager manager = AppWidgetManager.getInstance(c);
        int[] ids = manager.getAppWidgetIds(new ComponentName(c, TodoListWidget.class));
        for (int id : ids) update(c, manager, id);
    }

    static void update(Context c, AppWidgetManager manager, int widgetId) {
        int statuses = TodoWidgetStore.statuses(c, widgetId);
        int days = TodoWidgetStore.days(c, widgetId);
        List<TodoWidgetFilter.Row> rows = TodoWidgetFilter.rows(
            TodoWidgetStore.snapshot(c), statuses, days, System.currentTimeMillis(), TodoWidgetStore.pendingDone(c), ZoneId.systemDefault());

        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_todo_list);
        v.setTextViewText(R.id.widget_todo_title, c.getString(R.string.todo_widget_title));
        v.setTextViewText(R.id.widget_todo_summary, TodoWidgetFilter.summary(statuses, days));
        v.setOnClickPendingIntent(R.id.widget_todo_header, action(c, widgetId, "", TodoWidgetActionActivity.OPEN, false));
        v.setOnClickPendingIntent(R.id.widget_todo_add, QuickAddWidget.quickAdd(c));
        v.setOnClickPendingIntent(R.id.widget_todo_settings, settings(c, widgetId));

        RemoteViews.RemoteCollectionItems.Builder items = new RemoteViews.RemoteCollectionItems.Builder().setViewTypeCount(1);
        long n = 0;
        for (TodoWidgetFilter.Row r : rows) {
            RemoteViews row = new RemoteViews(c.getPackageName(), R.layout.widget_todo_row);
            row.setTextViewText(R.id.widget_row_box, r.ticked ? "☑" : "☐");
            row.setTextViewText(R.id.widget_row_name, r.name);
            row.setTextColor(R.id.widget_row_name, c.getColor(r.ticked ? R.color.widget_dim : R.color.widget_ink));
            row.setTextColor(R.id.widget_row_box, c.getColor(r.ticked ? R.color.widget_ok : R.color.widget_todo));
            row.setTextViewText(R.id.widget_row_sub, r.sub);
            row.setViewVisibility(R.id.widget_row_sub, r.sub.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);
            row.setOnClickFillInIntent(R.id.widget_row, new Intent().putExtra(TodoWidgetActionActivity.EXTRA_TODO, r.id).putExtra(TodoWidgetActionActivity.EXTRA_WHAT, TodoWidgetActionActivity.OPEN));
            if (!r.ticked) {
                row.setOnClickFillInIntent(R.id.widget_row_box, new Intent().putExtra(TodoWidgetActionActivity.EXTRA_TODO, r.id).putExtra(TodoWidgetActionActivity.EXTRA_WHAT, TodoWidgetActionActivity.DONE));
            }
            items.addItem(n++, row);
        }
        v.setRemoteAdapter(R.id.widget_todo_list, items.build());
        v.setEmptyView(R.id.widget_todo_list, R.id.widget_todo_empty);
        v.setPendingIntentTemplate(R.id.widget_todo_list, action(c, widgetId, null, null, true));
        manager.updateAppWidget(widgetId, v);
    }

    /** A tap's PendingIntent: the rows' template (mutable, filled in per row), or the header's. */
    private static PendingIntent action(Context c, int widgetId, String todo, String what, boolean template) {
        Intent i = new Intent(c, TodoWidgetActionActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
        if (todo != null) i.putExtra(TodoWidgetActionActivity.EXTRA_TODO, todo);
        if (what != null) i.putExtra(TodoWidgetActionActivity.EXTRA_WHAT, what);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (template ? PendingIntent.FLAG_MUTABLE : PendingIntent.FLAG_IMMUTABLE);
        return PendingIntent.getActivity(c, widgetId * 2 + (template ? 1 : 0), i, flags);
    }

    private static PendingIntent settings(Context c, int widgetId) {
        Intent i = new Intent(c, TodoWidgetConfigActivity.class)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(c, 100_000 + widgetId, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
