package com.rescueai.disasterrescue;

import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // High-contrast clean bar and background colors
        getWindow().getDecorView().setBackgroundColor(Color.parseColor("#F8FAFC"));
        getWindow().setStatusBarColor(Color.parseColor("#4F46E5"));
        getWindow().setNavigationBarColor(Color.parseColor("#1E293B"));

        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            webView.setBackgroundColor(Color.parseColor("#F8FAFC"));

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowContentAccess(true);

            boolean isDebuggable = 0 != (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE);
            if (isDebuggable) {
                WebView.setWebContentsDebuggingEnabled(true);
                settings.setAllowFileAccess(true);
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
            } else {
                WebView.setWebContentsDebuggingEnabled(false);
                settings.setAllowFileAccess(false);
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            }

            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setGeolocationEnabled(true);
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);

            webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
            webView.setHorizontalScrollBarEnabled(false);
        }

        // Native smartphone back navigation callback
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript(
                        "(function() { if (window.handleSmartphoneBack && window.handleSmartphoneBack()) { return true; } return false; })()",
                        value -> {
                            if (!"\"true\"".equals(value) && !"true".equals(value)) {
                                setEnabled(false);
                                getOnBackPressedDispatcher().onBackPressed();
                                setEnabled(true);
                            }
                        }
                    );
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });
    }
}
