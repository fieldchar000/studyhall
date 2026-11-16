package com.studyhall.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BauerPlugin.class); // "Hey Bauer" voice briefings
        super.onCreate(savedInstanceState);
    }
}
