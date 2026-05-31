package com.zhongyao.app;

import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private View loadingView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        loadingView = findViewById(R.id.loading);

        // Configure WebView
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                loadingView.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
            }
        });

        webView.setWebChromeClient(new WebChromeClient());

        // Show disclaimer on first launch
        SharedPreferences prefs = getSharedPreferences("zhongyao", MODE_PRIVATE);
        if (!prefs.getBoolean("disclaimer", false)) {
            showDisclaimer(prefs);
        } else {
            loadContent();
        }
    }

    private void showDisclaimer(SharedPreferences prefs) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        View view = getLayoutInflater().inflate(R.layout.dialog_disclaimer, null);
        builder.setView(view);
        builder.setCancelable(false);
        
        AlertDialog dialog = builder.create();
        dialog.show();

        view.findViewById(R.id.btn_confirm).setOnClickListener(v -> {
            prefs.edit().putBoolean("disclaimer", true).apply();
            dialog.dismiss();
            loadContent();
        });
    }

    private void loadContent() {
        // Try local file first, fallback to network
        try {
            webView.loadUrl("file:///android_asset/index.html");
        } catch (Exception e) {
            webView.loadUrl("https://maoshaoxing.github.io/zhongyaoxue/");
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
