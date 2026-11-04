package com.fotosintesis.app.tablet

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fotosintesis.app.data.Bateria
import com.fotosintesis.app.data.Preferencias
import com.fotosintesis.app.ui.BotonPildora
import com.fotosintesis.app.ui.Colores
import com.fotosintesis.app.ui.Grupo
import com.fotosintesis.app.ui.Separador
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Cada cuánto se envía mientras la pantalla está abierta (para que la demo se vea "en directo") */
private const val SEGUNDOS_DEMO = 20L

/**
 * MODO TABLET: muestra su nombre y su batería, y la envía al servidor.
 * Con la app cerrada, el envío sigue cada 15 minutos (WorkManager).
 */
@Composable
fun PantallaTablet(alCambiarModo: () -> Unit) {
    val context = LocalContext.current
    val prefs = remember { Preferencias(context) }
    val alcance = rememberCoroutineScope()

    var tabletId by remember { mutableStateOf(prefs.tabletId) }
    var lectura by remember { mutableStateOf(Bateria.leer(context)) }
    var estado by remember { mutableStateOf("Conectando con el servidor…") }
    var conectado by remember { mutableStateOf(false) }

    suspend fun enviar() {
        lectura = Bateria.leer(context)
        estado = EnvioBateria.leerYEnviar(context)
        conectado = estado.startsWith("Enviado")
        tabletId = prefs.tabletId
    }

    LaunchedEffect(Unit) {
        EnvioBateria.programar(context)
        while (true) {
            enviar()
            delay(SEGUNDOS_DEMO * 1000)
        }
    }

    val pct = lectura.bateria.toDouble()
    val color = Colores.deBateria(pct)

    Column(
        modifier = Modifier.fillMaxSize().background(Colores.Fondo).systemBarsPadding()
            .verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Tablet", fontSize = 17.sp, color = Colores.Texto2)
        Text(tabletId ?: "—", fontSize = 88.sp, fontWeight = FontWeight.Bold, color = Colores.Texto, letterSpacing = (-2).sp)
        Spacer(Modifier.height(28.dp))

        // Pila grande al estilo iOS
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.width(150.dp).height(66.dp).border(4.dp, Colores.Texto3, RoundedCornerShape(16.dp)).padding(7.dp)
            ) {
                Box(Modifier.fillMaxHeight().fillMaxWidth((pct / 100).toFloat().coerceIn(0.03f, 1f))
                    .clip(RoundedCornerShape(9.dp)).background(color))
            }
            Box(Modifier.width(8.dp).height(24.dp).clip(RoundedCornerShape(topEnd = 4.dp, bottomEnd = 4.dp)).background(Colores.Texto3))
        }
        Spacer(Modifier.height(16.dp))
        Text("${pct.toInt()}%", fontSize = 48.sp, fontWeight = FontWeight.Bold, color = color)
        Text(if (lectura.cargando) "⚡ Cargando" else "Sin cargar", fontSize = 17.sp, color = Colores.Texto2)

        Spacer(Modifier.height(32.dp))
        Grupo(Modifier.widthIn(max = 460.dp)) {
            FilaDato("Servidor", if (conectado) "Conectado" else "Sin conexión", if (conectado) Colores.Verde else Colores.Rojo)
            Separador()
            FilaDato("Último envío", prefs.ultimoEnvio ?: "—")
            lectura.temperatura?.let {
                Separador()
                FilaDato("Temperatura de la batería", "${"%.1f".format(it)} ºC")
            }
        }
        Text(
            estado + "\nSe envía sola cada 15 minutos, también con la app cerrada.",
            fontSize = 13.sp, color = Colores.Texto2, textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 10.dp).widthIn(max = 460.dp)
        )
        Spacer(Modifier.height(24.dp))
        BotonPildora("Enviar ahora", Modifier.widthIn(min = 200.dp)) { alcance.launch { enviar() } }
        TextButton(onClick = {
            EnvioBateria.cancelar(context)
            alCambiarModo()
        }) { Text("Cambiar modo o servidor", color = Colores.Azul) }
    }
}

@Composable
private fun FilaDato(nombre: String, valor: String, colorValor: androidx.compose.ui.graphics.Color = Colores.Texto2) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(nombre, fontSize = 16.sp, color = Colores.Texto, modifier = Modifier.weight(1f))
        Text(valor, fontSize = 16.sp, color = colorValor)
    }
}
