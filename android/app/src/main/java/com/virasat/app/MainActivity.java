package com.virasat.app;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // A plugin in the app itself is not found by `cap sync`; register it
        // before the bridge starts so the web app sees it on first load.
        registerPlugin(VirasatDevicePlugin.class);
        super.onCreate(savedInstanceState);
        // Notes must not appear in the recent-apps thumbnail or a screenshot.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
}
