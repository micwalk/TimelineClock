package com.micwalk.timelineclock;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Quick add (docs/prd_todo_import_widgets.md §3): a small box over the home screen, from the
 * quick-add widget or the list widget's ＋. Type or dictate with the keyboard's mic ("buy milk
 * tomorrow at three then call mom"); Add opens the app, whose Todos tab reads it and shows each
 * todo before adding (owner 2026-11-25: open with the preview). Reading it is the page's job
 * (src/domain/todoImport.ts), so the app and a browser read it the same way.
 */
public class QuickAddActivity extends Activity {

    private EditText box;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle(R.string.quick_add_title);
        float dp = getResources().getDisplayMetrics().density;
        int pad = Math.round(16 * dp);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, Math.round(8 * dp));

        TextView hint = new TextView(this);
        hint.setText(R.string.quick_add_hint);
        hint.setTextSize(13);
        root.addView(hint);

        box = new EditText(this);
        box.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_AUTO_CORRECT);
        box.setImeOptions(EditorInfo.IME_ACTION_DONE);
        box.setRawInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES | InputType.TYPE_TEXT_FLAG_AUTO_CORRECT);
        box.setHorizontallyScrolling(false);
        box.setMaxLines(6);
        box.setMinLines(2);
        box.setGravity(Gravity.TOP | Gravity.START);
        box.setHint(R.string.quick_add_placeholder);
        box.setOnEditorActionListener((v, actionId, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN;
            if (actionId == EditorInfo.IME_ACTION_DONE || enter) {
                add();
                return true;
            }
            return false;
        });
        root.addView(box, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout buttons = new LinearLayout(this);
        buttons.setGravity(Gravity.END);
        Button cancel = new Button(this, null, android.R.attr.borderlessButtonStyle);
        cancel.setText(android.R.string.cancel);
        cancel.setOnClickListener(v -> finish());
        Button add = new Button(this, null, android.R.attr.borderlessButtonStyle);
        add.setText(R.string.quick_add_add);
        add.setOnClickListener(v -> add());
        buttons.addView(cancel);
        buttons.addView(add);
        root.addView(buttons);

        setContentView(root, new ViewGroup.LayoutParams(Math.round(340 * dp), ViewGroup.LayoutParams.WRAP_CONTENT));
        getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        box.requestFocus();
    }

    /** Leaves the text for the page and opens the app on it; empty does nothing. */
    private void add() {
        String text = box.getText().toString().trim();
        if (text.isEmpty()) {
            finish();
            return;
        }
        TodoWidgetStore.addText(this, text);
        Diag.log(this, "quick add from a widget");
        startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        finish();
    }
}
