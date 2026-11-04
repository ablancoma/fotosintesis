package com.fotosintesis.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Cola de lecturas pendientes de enviar.
 * Si el servidor no responde, las lecturas se guardan aquí y se envían todas juntas la próxima vez.
 */
class ColaLecturas(context: Context) {
    private val prefs = context.getSharedPreferences("cola_lecturas", Context.MODE_PRIVATE)

    @Synchronized
    fun agregar(lectura: LecturaBateria) {
        val cola = leer()
        cola.put(JSONObject().apply {
            put("bateria", lectura.bateria.toDouble())
            put("cargando", lectura.cargando)
            if (lectura.temperatura != null) put("temperatura", lectura.temperatura.toDouble())
            put("ts", lectura.ts)
        })
        // Como mucho guardamos 500 lecturas (unos 5 días a una cada 15 min)
        while (cola.length() > 500) cola.remove(0)
        prefs.edit().putString("cola", cola.toString()).apply()
    }

    @Synchronized
    fun leer(): JSONArray = JSONArray(prefs.getString("cola", "[]"))

    @Synchronized
    fun vaciar() = prefs.edit().putString("cola", "[]").apply()

    fun tamano(): Int = leer().length()
}
