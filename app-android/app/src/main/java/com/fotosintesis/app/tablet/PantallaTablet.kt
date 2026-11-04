package com.fotosintesis.app.tablet

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fotosintesis.app.data.Bateria
import com.fotosintesis.app.data.Preferencias
import com.fotosintesis.app.ui.Colores
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Cada cuánto se envía mientras la pantalla está abierta (para que la demo se vea "en directo") */
private const val SEGUNDOS_DEMO = 20L

/**
 * MODO TABLET: solo muestra su nombre y su batería, y la envía al servidor.
 * Con la app cerrada, el envío sigue cada 15 minutos (WorkManager).
 */
@Composable
fun PantallaTablet(alCambiarModo: () -> Unit) {
    val context = LocalContext.current
    val prefs = remember { Preferencias(context) }
    val alcance = rememberCoroutineScope()

    var tabletId by remember { mutableStateOf(prefs.tabletId) }
    var lectura by remember { mutableStateOf(Bateria.leer(context)) }
    var estado by remember { mutableStateOf("Conectando con ${prefs.servidor}…") }

    suspend fun enviar() {
        lectura = Bateria.leer(context)
        estado = EnvioBateria.leerYEnviar(context)
        tabletId = prefs.tabletId
    }

    LaunchedEffect(Unit) {
        EnvioBateria.programar(context)
        while (true) {
            enviar()
            delay(SEGUNDOS_DEMO * 1000)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().background(Colores.Oscuro).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("🌱 Fotosíntesis", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(32.dp))
        Text(tabletId ?: "—", color = Color.White, fontSize = 96.sp, fontWeight = FontWeight.Bold)
        Text("Nombre de esta tablet", color = Colores.Gris, fontSize = 14.sp)
        Spacer(Modifier.height(40.dp))

        val pct = lectura.bateria.toDouble()
        Text(
            "${pct.toInt()}%" + if (lectura.cargando) "  ⚡ cargando" else "",
            color = Colores.deBateria(pct), fontSize = 40.sp, fontWeight = FontWeight.Bold
        )
        Spacer(Modifier.height(12.dp))
        LinearProgressIndicator(
            progress = { (pct / 100).toFloat() },
            modifier = Modifier.fillMaxWidth(0.7f).height(14.dp).background(Color.Transparent, RoundedCornerShape(7.dp)),
            color = Colores.deBateria(pct),
            trackColor = Color(0xFF3A4850)
        )
        lectura.temperatura?.let {
            Spacer(Modifier.height(8.dp))
            Text("Temperatura de la batería: ${"%.1f".format(it)} ºC", color = Colores.Gris, fontSize = 14.sp)
        }

        Spacer(Modifier.height(40.dp))
        Text(estado, color = Color.White, fontSize = 15.sp, textAlign = TextAlign.Center)
        Text("Envío automático cada 15 min, también con la app cerrada", color = Colores.Gris, fontSize = 12.sp,
            textAlign = TextAlign.Center)
        Spacer(Modifier.height(24.dp))
        Button(onClick = { alcance.launch { enviar() } }) { Text("Enviar ahora") }
        TextButton(onClick = {
            EnvioBateria.cancelar(context)
            alCambiarModo()
        }) { Text("Cambiar modo o servidor", color = Colores.Gris) }
    }
}
