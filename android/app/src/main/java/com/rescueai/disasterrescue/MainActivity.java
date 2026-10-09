package com.rescueai.disasterrescue;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Enforce dark background on the activity window and system bars immediately
        getWindow().getDecorView().setBackgroundColor(Color.parseColor("#0B0F19"));
        getWindow().setStatusBarColor(Color.parseColor("#0B0F19"));
        getWindow().setNavigationBarColor(Color.parseColor("#0B0F19"));

        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            webView.setBackgroundColor(Color.parseColor("#0B0F19"));

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setGeolocationEnabled(true);
        }
    }
}
