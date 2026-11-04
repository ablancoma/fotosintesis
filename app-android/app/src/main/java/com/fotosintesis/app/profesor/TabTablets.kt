package com.fotosintesis.app.profesor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fotosintesis.app.data.Api
import com.fotosintesis.app.data.TabletEstado
import com.fotosintesis.app.ui.Colores
import kotlinx.coroutines.delay

/** Panel de tablets: se refresca solo cada 5 segundos */
@Composable
fun TabTablets(api: Api) {
    var tablets by remember { mutableStateOf<List<TabletEstado>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var reintento by remember { mutableIntStateOf(0) }

    LaunchedEffect(reintento) {
        while (true) {
            try {
                tablets = api.tablets()
                error = null
            } catch (e: Exception) {
                error = e.message
            }
            delay(5000)
        }
    }

    val lista = tablets
    when {
        lista == null && error != null -> ErrorConexion(null) { reintento++ }
        lista == null -> Cargando()
        else -> {
            val conDatos = lista.filter { it.bateria != null && it.estado == "ok" }
            val cargando = lista.count { it.cargando }
            val bajas = conDatos.count { (it.bateria ?: 0.0) < 30 }
            val media = if (conDatos.isNotEmpty()) conDatos.sumOf { it.bateria ?: 0.0 } / conDatos.size else 0.0

            LazyVerticalGrid(
                columns = GridCells.Adaptive(88.dp),
                modifier = Modifier.fillMaxSize().padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Resumen("${lista.size}", "tablets", Colores.Oscuro, Modifier.weight(1f))
                        Resumen("${media.toInt()}%", "media", Colores.deBateria(media), Modifier.weight(1f))
                        Resumen("$bajas", "por debajo del 30%", Colores.Rojo, Modifier.weight(1f))
                        Resumen("$cargando", "cargando ⚡", Colores.Sol, Modifier.weight(1f))
                    }
                }
                if (error != null) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Text("⚠️ Sin conexión: mostrando los últimos datos", color = Colores.Rojo, fontSize = 13.sp)
                    }
                }
                items(lista, key = { it.id }) { t -> CasillaTablet(t) }
            }
        }
    }
}

@Composable
private fun Resumen(valor: String, texto: String, color: Color, modifier: Modifier) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(10.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(valor, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = color)
            Text(texto, fontSize = 11.sp, color = Colores.Gris, maxLines = 1)
        }
    }
}

@Composable
private fun CasillaTablet(t: TabletEstado) {
    val sinDatos = t.estado != "ok" || t.bateria == null
    val color = if (sinDatos) Colores.Gris else Colores.deBateria(t.bateria)
    Card(colors = CardDefaults.cardColors(containerColor = color)) {
        Column(Modifier.padding(vertical = 10.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(t.id + if (!t.simulada) " 📱" else "", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text(
                if (t.bateria == null) "—" else "${t.bateria.toInt()}%" + if (t.cargando) " ⚡" else "",
                color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold
            )
            Text(
                when {
                    t.minutosDesdeLectura == null -> "sin datos"
                    sinDatos -> "hace ${t.minutosDesdeLectura} min"
                    t.temperatura != null -> "${t.temperatura.toInt()} ºC"
                    else -> ""
                },
                color = Color.White, fontSize = 11.sp
            )
        }
    }
}
