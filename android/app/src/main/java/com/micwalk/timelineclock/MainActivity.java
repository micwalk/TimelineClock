package com.micwalk.timelineclock;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Before the bridge starts, so alarms scheduled by the page always have their channel.
        NotificationChannels.ensure(this);
        registerPlugin(LiveNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
