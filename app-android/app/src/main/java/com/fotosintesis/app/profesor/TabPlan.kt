package com.fotosintesis.app.profesor

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fotosintesis.app.data.Api
import com.fotosintesis.app.data.ClasePlan
import com.fotosintesis.app.data.Instruccion
import com.fotosintesis.app.data.Plan
import com.fotosintesis.app.ui.Colores
import kotlinx.coroutines.launch

/** Plan de mañana: energía, estado de las clases e instrucciones de carga */
@Composable
fun TabPlan(api: Api, nublado: Boolean, alCambiarNublado: (Boolean) -> Unit) {
    val alcance = rememberCoroutineScope()
    var plan by remember { mutableStateOf<Plan?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var recargar by remember { mutableIntStateOf(0) }
    var calculando by remember { mutableStateOf(false) }

    LaunchedEffect(nublado, recargar) {
        try {
            plan = api.plan(nublado)
            error = null
        } catch (e: Exception) {
            error = e.message
        }
    }

    val p = plan
    when {
        p == null && error != null -> ErrorConexion(null) { recargar++ }
        p == null -> Cargando()
        else -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // ---- Controles ----
            item {
                Card(colors = CardDefaults.cardColors(containerColor = Colores.SolSuave)) {
                    Row(Modifier.padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("☁️ Simular día nublado", Modifier.weight(1f), color = Colores.Oscuro)
                        Switch(checked = nublado, onCheckedChange = alCambiarNublado)
                        Spacer(Modifier.width(12.dp))
                        OutlinedButton(enabled = !calculando, onClick = {
                            calculando = true
                            alcance.launch {
                                try { plan = api.recalcular(nublado) } catch (e: Exception) { error = e.message }
                                calculando = false
                            }
                        }) { Text(if (calculando) "…" else "🔄 Recalcular") }
                    }
                }
            }

            // ---- Energía del día ----
            item { TarjetaEnergia(p) }

            // ---- Clases ----
            item { Titulo("📚 Clases de mañana") }
            items(p.clases) { c -> FilaClase(c) }

            // ---- Instrucciones ----
            item {
                val hechas = p.instrucciones.count { it.hecha }
                Titulo("🔌 Instrucciones para el profesor  ($hechas/${p.instrucciones.size} hechas)")
            }
            items(p.instrucciones, key = { it.id }) { ins ->
                FilaInstruccion(ins) { marcada ->
                    plan = p.copy(instrucciones = p.instrucciones.map { if (it.id == ins.id) it.copy(hecha = marcada) else it })
                    alcance.launch { try { api.marcarHecha(ins.id, marcada) } catch (e: Exception) {} }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun Titulo(texto: String) {
    Text(texto, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = Colores.Oscuro,
        modifier = Modifier.padding(top = 6.dp))
}

@Composable
private fun TarjetaEnergia(p: Plan) {
    val fuente = when (p.fuentePrevision) {
        "prevision" -> if (p.origenPrevision == "profesor") "📱 Previsión traída por el profesor" else "🌐 Previsión descargada por el servidor"
        "estimada" -> "📈 Previsión estimada (la guardada es antigua)"
        else -> "☀️ Día típico (aún no hay previsión)"
    }
    Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text("${p.energiaSolarWh} Wh", fontSize = 26.sp, fontWeight = FontWeight.Bold, color = Colores.Sol)
                Spacer(Modifier.width(8.dp))
                Text("de energía solar prevista para el ${p.dia}", color = Colores.Gris, fontSize = 13.sp)
            }
            Text(fuente, color = Colores.Gris, fontSize = 12.sp)
            Spacer(Modifier.height(10.dp))
            // Gráfico de barras sencillo: energía por hora (6:00 – 19:00)
            val horas = (6..19).toList()
            val max = (p.solarPorHora.maxOrNull() ?: 1.0).coerceAtLeast(1.0)
            Row(Modifier.fillMaxWidth().height(90.dp), horizontalArrangement = Arrangement.spacedBy(3.dp),
                verticalAlignment = Alignment.Bottom) {
                horas.forEach { h ->
                    val valor = p.solarPorHora.getOrElse(h) { 0.0 }
                    Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.Bottom,
                        horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(Modifier.fillMaxWidth().fillMaxHeight((valor / max).toFloat().coerceIn(0.02f, 1f) * 0.8f)
                            .background(Colores.Sol, RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp)))
                        Text("$h", fontSize = 9.sp, color = Colores.Gris)
                    }
                }
            }
        }
    }
}

@Composable
private fun FilaClase(c: ClasePlan) {
    val completa = c.listas >= c.nTablets
    Card(colors = CardDefaults.cardColors(containerColor = if (completa) Colores.VerdeSuave else Colores.RojoSuave)) {
        Row(Modifier.padding(14.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("${c.hora} · ${c.asignatura}", fontWeight = FontWeight.SemiBold, color = Colores.Oscuro)
                Text("${NOMBRE_ACTIVIDAD[c.actividad] ?: c.actividad} · gasta ~${c.consumoPctHora}%/h",
                    fontSize = 12.sp, color = Colores.Gris)
            }
            Text((if (completa) "✅ " else "⚠️ ") + "${c.listas}/${c.nTablets}", fontWeight = FontWeight.Bold,
                color = if (completa) Colores.Verde else Colores.Rojo)
        }
    }
}

@Composable
private fun FilaInstruccion(ins: Instruccion, alMarcar: (Boolean) -> Unit) {
    val fondo = when (ins.tipo) {
        "aviso" -> Colores.RojoSuave
        "clase" -> Colores.SolSuave
        else -> Color.White
    }
    val emoji = when (ins.tipo) { "aviso" -> "⚠️"; "clase" -> "📦"; else -> "🔌" }
    Card(
        modifier = Modifier.fillMaxWidth().clickable(enabled = ins.tipo != "aviso") { alMarcar(!ins.hecha) },
        colors = CardDefaults.cardColors(containerColor = fondo)
    ) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(ins.hora, fontWeight = FontWeight.Bold, color = Colores.Oscuro, modifier = Modifier.width(52.dp))
            Text(emoji, fontSize = 18.sp)
            Spacer(Modifier.width(8.dp))
            Text(
                ins.texto, Modifier.weight(1f), fontSize = 14.sp,
                color = if (ins.hecha) Colores.Gris else Colores.Oscuro,
                textDecoration = if (ins.hecha) TextDecoration.LineThrough else null
            )
            if (ins.tipo != "aviso") Checkbox(checked = ins.hecha, onCheckedChange = { alMarcar(it) })
        }
    }
}
