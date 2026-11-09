package co.asistencia.oficina;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;

/** Almacenamiento nativo: oficinas, conexión con Google y marcas pendientes. */
final class Prefs {
    static final String OFFICES = "offices";
    static final String SYNC_URL = "sync_url";
    static final String SYNC_TOKEN = "sync_token";
    static final String LAST_DATE = "last_date";
    static final String PENDING_WEB = "pending_web";       // marcas que la interfaz aún no ha leído
    static final String PENDING_UPLOAD = "pending_upload"; // marcas que aún no se envían a Google

    private Prefs() {}

    static SharedPreferences get(Context ctx) {
        return ctx.getSharedPreferences("asistencia", Context.MODE_PRIVATE);
    }

    static JSONArray array(Context ctx, String key) {
        try {
            return new JSONArray(get(ctx).getString(key, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static void putArray(Context ctx, String key, JSONArray arr) {
        get(ctx).edit().putString(key, arr.toString()).apply();
    }

    static String str(Context ctx, String key) {
        return get(ctx).getString(key, "");
    }
}
