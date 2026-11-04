package com.fotosintesis.app.tablet

import android.content.Context
import android.os.Build
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.fotosintesis.app.data.Api
import com.fotosintesis.app.data.Bateria
import com.fotosintesis.app.data.ColaLecturas
import com.fotosintesis.app.data.ErrorServidor
import com.fotosintesis.app.data.Preferencias
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

/**
 * Lee la batería, la mete en la cola y envía la cola al servidor.
 * Si el servidor no responde, las lecturas se quedan en la cola para el siguiente intento.
 */
object EnvioBateria {

    /** Devuelve un texto con el resultado, para mostrarlo en pantalla */
    suspend fun leerYEnviar(context: Context): String {
        val prefs = Preferencias(context)
        val cola = ColaLecturas(context)
        cola.agregar(Bateria.leer(context))

        return try {
            val api = Api(prefs.servidor)
            var tabletId = prefs.tabletId ?: api.registrar(prefs.deviceId(), Build.MODEL).also { prefs.tabletId = it }
            val pendientes = cola.leer()
            try {
                api.enviarLecturas(tabletId, pendientes)
            } catch (e: ErrorServidor) {
                if (e.codigo != 404) throw e
                // El servidor no conoce esta tablet (p. ej. base de datos nueva): volver a registrarse
                tabletId = api.registrar(prefs.deviceId(), Build.MODEL).also { prefs.tabletId = it }
                api.enviarLecturas(tabletId, pendientes)
            }
            cola.vaciar()
            val hora = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"))
            prefs.ultimoEnvio = hora
            "Enviado a las $hora (${pendientes.length()} lectura${if (pendientes.length() == 1) "" else "s"})"
        } catch (e: Exception) {
            "Sin conexión con el servidor. ${cola.tamano()} lectura(s) guardadas para enviar después."
        }
    }

    /** Programa el envío automático cada 15 minutos (el mínimo que permite Android) */
    fun programar(context: Context) {
        val tarea = PeriodicWorkRequestBuilder<BateriaWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork("envio_bateria", ExistingPeriodicWorkPolicy.KEEP, tarea)
    }

    fun cancelar(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork("envio_bateria")
    }
}

/** La tarea que Android ejecuta cada 15 minutos, aunque la app esté cerrada */
class BateriaWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        EnvioBateria.leerYEnviar(applicationContext)
        return Result.success()     // aunque falle, la lectura queda en la cola
    }
}
