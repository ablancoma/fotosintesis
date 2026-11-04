package com.fotosintesis.app.data

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/** Una lectura de batería tal como la envía la tablet al servidor */
data class LecturaBateria(
    val bateria: Float,       // %
    val cargando: Boolean,
    val temperatura: Float?,  // ºC
    val ts: String            // fecha y hora local, ISO "2026-11-05T09:15:00"
)

/**
 * Lee la batería con la API de Android (BatteryManager).
 * ACTION_BATTERY_CHANGED es un aviso "pegajoso": Android guarda el último estado y nos lo da al momento.
 */
object Bateria {
    private val formato = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")

    fun leer(context: Context): LecturaBateria {
        val intent: Intent? = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val nivel = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val escala = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val estado = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val temperaturaDecimas = intent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE) ?: Int.MIN_VALUE

        val porcentaje = if (nivel >= 0 && escala > 0) nivel * 100f / escala else 0f
        val cargando = estado == BatteryManager.BATTERY_STATUS_CHARGING || estado == BatteryManager.BATTERY_STATUS_FULL
        val temperatura = if (temperaturaDecimas != Int.MIN_VALUE) temperaturaDecimas / 10f else null

        return LecturaBateria(porcentaje, cargando, temperatura, LocalDateTime.now().format(formato))
    }
}
