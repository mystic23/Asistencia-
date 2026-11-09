package co.asistencia.oficina;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;

/** Muestra la interfaz (la misma app web) y le da acceso a las funciones nativas. */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/www/index.html";
    private static final int REQ_FG = 1, REQ_BG = 2, REQ_NOTIF = 3;

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setGeolocationEnabled(true);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                openExternal(u); // correo, mapas, enlaces web
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                cb.invoke(origin, Geofences.hasFine(MainActivity.this), false);
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidApp");
        web.loadUrl(START);

        Geofences.register(this);
        if (!Geofences.hasFine(this) || !Geofences.hasBackground(this)) askPermissions();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.evaluateJavascript("window.onNativeResume && window.onNativeResume()", null);
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private void openExternal(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    /** Pide los permisos en cadena: ubicación → ubicación "todo el tiempo" → notificaciones. */
    private void askPermissions() {
        if (!Geofences.hasFine(this)) {
            requestPermissions(new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_FG);
        } else if (!Geofences.hasBackground(this)) {
            // En Android 11+ esto abre la pantalla de ajustes: elegir "Permitir todo el tiempo".
            requestPermissions(new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION}, REQ_BG);
        } else if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        Geofences.register(this);
        if (granted && code != REQ_NOTIF) askPermissions();
        else if (!granted && code == REQ_FG && Build.VERSION.SDK_INT >= 33) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
        }
        web.evaluateJavascript("window.onNativeResume && window.onNativeResume()", null);
    }

    /** Funciones que la interfaz web puede llamar como window.AndroidApp.* */
    private class Bridge {
        @JavascriptInterface
        public String permissionStatus() {
            if (!Geofences.hasFine(MainActivity.this)) return "need_fine";
            if (!Geofences.hasBackground(MainActivity.this)) return "need_background";
            return "ok";
        }

        @JavascriptInterface
        public void requestPermissions() {
            runOnUiThread(() -> {
                if (Geofences.hasFine(MainActivity.this) && !Geofences.hasBackground(MainActivity.this)
                        && !shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                        && Build.VERSION.SDK_INT >= 30) {
                    // Si Android ya no muestra el diálogo, abre los ajustes de la app.
                    startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.fromParts("package", getPackageName(), null)));
                } else {
                    askPermissions();
                }
            });
        }

        @JavascriptInterface
        public void setOffices(String json) {
            try {
                Prefs.putArray(MainActivity.this, Prefs.OFFICES, new JSONArray(json));
                Geofences.register(MainActivity.this);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void setSync(String url, String token) {
            Prefs.get(MainActivity.this).edit()
                    .putString(Prefs.SYNC_URL, url == null ? "" : url)
                    .putString(Prefs.SYNC_TOKEN, token == null ? "" : token)
                    .apply();
        }

        @JavascriptInterface
        public String takeCheckins() {
            return Checkins.take(MainActivity.this);
        }

        @JavascriptInterface
        public void markedToday() {
            Checkins.markedToday(MainActivity.this);
        }

        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (PackageManager.NameNotFoundException e) {
                return "";
            }
        }
    }
}
