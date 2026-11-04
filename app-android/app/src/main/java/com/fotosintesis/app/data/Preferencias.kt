package com.fotosintesis.app.data

import android.annotation.SuppressLint
import android.content.Context
import android.provider.Settings

/**
 * Lo que la app recuerda entre aperturas (se guarda en el propio dispositivo).
 */
class Preferencias(context: Context) {
    private val prefs = context.getSharedPreferences("fotosintesis", Context.MODE_PRIVATE)
    private val appContext = context.applicationContext

    /** "tablet" o "profesor"; null si aún no se ha elegido */
    var modo: String?
        get() = prefs.getString("modo", null)
        set(valor) = prefs.edit().putString("modo", valor).apply()

    /** Dirección del servidor, p. ej. http://192.168.1.50:8000 (en el emulador: http://10.0.2.2:8000) */
    var servidor: String
        get() = prefs.getString("servidor", SERVIDOR_EMULADOR) ?: SERVIDOR_EMULADOR
        set(valor) = prefs.edit().putString("servidor", normalizarUrl(valor)).apply()

    /** Nombre que el servidor asignó a esta tablet (T01, T02...) */
    var tabletId: String?
        get() = prefs.getString("tablet_id", null)
        set(valor) = prefs.edit().putString("tablet_id", valor).apply()

    /** Último envío correcto (texto para mostrar) */
    var ultimoEnvio: String?
        get() = prefs.getString("ultimo_envio", null)
        set(valor) = prefs.edit().putString("ultimo_envio", valor).apply()

    /** Identificador único del dispositivo (no identifica al alumno, solo a la tablet) */
    @SuppressLint("HardwareIds")
    fun deviceId(): String =
        Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID) ?: "desconocido"

    fun olvidarTodo() = prefs.edit().clear().apply()

    companion object {
        const val SERVIDOR_EMULADOR = "http://10.0.2.2:8000"

        fun normalizarUrl(url: String): String {
            var u = url.trim().trimEnd('/')
            if (!u.startsWith("http://") && !u.startsWith("https://")) u = "http://$u"
            if (u.count { it == ':' } < 2) u = "$u:8000"   // si no pone puerto, usamos el 8000
            return u
        }
    }
}
