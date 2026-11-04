package com.fotosintesis.app.profesor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fotosintesis.app.data.Api
import com.fotosintesis.app.ui.Colores
import kotlinx.coroutines.launch
import org.json.JSONObject

/** Previsión del tiempo y configuración de la escuela (valores estimados) */
@Composable
fun TabAjustes(api: Api, servidor: String, alCambiarModo: () -> Unit) {
    val alcance = rememberCoroutineScope()
    var config by remember { mutableStateOf<JSONObject?>(null) }
    var prevision by remember { mutableStateOf<JSONObject?>(null) }
    var mensaje by remember { mutableStateOf<String?>(null) }
    var ocupado by remember { mutableStateOf(false) }
    var recargar by remember { mutableIntStateOf(0) }

    LaunchedEffect(recargar) {
        try {
            config = api.config()
            prevision = api.prevision()
        } catch (e: Exception) {
            mensaje = "❌ Sin conexión con el servidor"
        }
    }

    fun cambiar(clave: String, valor: Any) {
        alcance.launch {
            try {
                api.cambiarConfig(JSONObject().put(clave, valor))
                recargar++
            } catch (e: Exception) {
                mensaje = "❌ No se pudo guardar"
            }
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // ---------------- PREVISIÓN ----------------
        Seccion("🌤️ Previsión del tiempo") {
            val p = prevision
            val origen = when {
                p == null -> "—"
                p.optString("fuente") == "tipico" -> "Aún no hay previsión: se usa un día soleado típico"
                p.optString("origen") == "profesor" -> "Traída desde el móvil del profesor"
                else -> "Descargada por el servidor"
            }
            Text(origen, color = Colores.Oscuro)
            if (p != null && !p.isNull("descargada")) {
                Text("Actualizada: ${p.optString("descargada").replace('T', ' ')} · ${p.optInt("dias_guardados")} días guardados",
                    fontSize = 12.sp, color = Colores.Gris)
            }
            Spacer(Modifier.height(8.dp))
            Button(enabled = !ocupado, modifier = Modifier.fillMaxWidth(), onClick = {
                ocupado = true
                mensaje = "Descargando con los datos del móvil…"
                alcance.launch {
                    mensaje = try {
                        val cfg = config ?: api.config()
                        val (horas, radiacion) = Api.descargarOpenMeteo(cfg.getDouble("latitud"), cfg.getDouble("longitud"))
                        api.enviarPrevision(horas, radiacion)
                        recargar++
                        "✅ Previsión de 7 días descargada y enviada al servidor"
                    } catch (e: Exception) {
                        "❌ No se pudo: ¿tiene el móvil datos y está en la wifi de la escuela?"
                    }
                    ocupado = false
                }
            }) { Text("📱 Descargar con mi móvil y enviar al servidor") }
            OutlinedButton(enabled = !ocupado, modifier = Modifier.fillMaxWidth(), onClick = {
                ocupado = true
                alcance.launch {
                    mensaje = try {
                        api.actualizarPrevisionEnServidor()
                        recargar++
                        "✅ El servidor ha descargado la previsión"
                    } catch (e: Exception) {
                        "❌ El servidor no tiene internet ahora mismo"
                    }
                    ocupado = false
                }
            }) { Text("🖥️ Que la descargue el servidor") }
            mensaje?.let { Text(it, fontSize = 13.sp, color = Colores.Oscuro) }
        }

        // ---------------- INSTALACIÓN SOLAR ----------------
        val c = config
        if (c != null) {
            Seccion("🔆 Instalación de la escuela (valores estimados)") {
                Text(c.optString("escuela_nombre") + " · " + c.optString("pais"), fontWeight = FontWeight.Medium,
                    color = Colores.Oscuro)
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Batería de almacenamiento", color = Colores.Oscuro)
                        Text("Guarda el sol sobrante para cargar a primera hora", fontSize = 12.sp, color = Colores.Gris)
                    }
                    Switch(checked = c.optBoolean("bateria_sistema_activa"),
                        onCheckedChange = { cambiar("bateria_sistema_activa", it) })
                }
                if (c.optBoolean("bateria_sistema_activa")) {
                    Contador("Capacidad de la batería", c.optInt("bateria_sistema_wh"), "Wh", 250) {
                        cambiar("bateria_sistema_wh", it)
                    }
                    Contador("Carga al empezar el día", c.optInt("bateria_sistema_nivel"), "%", 10, max = 100) {
                        cambiar("bateria_sistema_nivel", it)
                    }
                }
                Contador("Panel solar", c.optInt("panel_solar_wp"), "W", 50) { cambiar("panel_solar_wp", it) }
                Contador("Enchufes para tablets", c.optInt("n_enchufes"), "", 1, max = 40) { cambiar("n_enchufes", it) }
                Contador("Consumo del servidor", c.optInt("servidor_w"), "W", 5) { cambiar("servidor_w", it) }
                Contador("Batería de cada tablet", c.optInt("capacidad_tablet_wh"), "Wh", 5) {
                    cambiar("capacidad_tablet_wh", it)
                }
                Contador("Potencia del cargador", c.optInt("potencia_cargador_w"), "W", 5) {
                    cambiar("potencia_cargador_w", it)
                }
            }
        }

        // ---------------- APP ----------------
        Seccion("⚙️ Aplicación") {
            Text("Servidor: $servidor", color = Colores.Oscuro)
            TextButton(onClick = alCambiarModo) { Text("Cambiar modo o servidor") }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun Seccion(titulo: String, contenido: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(14.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(titulo, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = Colores.Oscuro)
            contenido()
        }
    }
}

@Composable
private fun Contador(nombre: String, valor: Int, unidad: String, paso: Int, max: Int = 100000, alCambiar: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(nombre, Modifier.weight(1f), color = Colores.Oscuro, fontSize = 14.sp)
        OutlinedButton(onClick = { alCambiar((valor - paso).coerceAtLeast(paso)) }) { Text("−") }
        Text("$valor $unidad", Modifier.width(84.dp).padding(horizontal = 4.dp), fontWeight = FontWeight.Bold,
            color = Colores.Oscuro, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        OutlinedButton(onClick = { alCambiar((valor + paso).coerceAtMost(max)) }) { Text("+") }
    }
}
