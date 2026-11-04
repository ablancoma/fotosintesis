package com.fotosintesis.app.profesor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fotosintesis.app.data.Api
import com.fotosintesis.app.data.ClaseHorario
import com.fotosintesis.app.data.ConsumoActividad
import com.fotosintesis.app.ui.Colores
import kotlinx.coroutines.launch

/** Horario: clases con su hora, duración, tipo de actividad y cuántas tablets necesitan */
@Composable
fun TabHorario(api: Api) {
    val alcance = rememberCoroutineScope()
    var clases by remember { mutableStateOf<List<ClaseHorario>?>(null) }
    var consumo by remember { mutableStateOf<List<ConsumoActividad>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var recargar by remember { mutableIntStateOf(0) }
    var dialogo by remember { mutableStateOf(false) }

    LaunchedEffect(recargar) {
        try {
            clases = api.clases()
            consumo = api.consumo()
            error = null
        } catch (e: Exception) {
            error = e.message
        }
    }

    val lista = clases
    when {
        lista == null && error != null -> ErrorConexion(null) { recargar++ }
        lista == null -> Cargando()
        else -> LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            item {
                Button(onClick = { dialogo = true }, modifier = Modifier.fillMaxWidth()) { Text("➕ Añadir clase") }
            }
            items(lista, key = { it.id }) { c ->
                Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${c.horaInicio} · ${c.asignatura}", fontWeight = FontWeight.SemiBold, color = Colores.Oscuro)
                            Text("${NOMBRE_ACTIVIDAD[c.actividad] ?: c.actividad} · ${c.duracionMin} min · ${c.nTablets} tablets",
                                fontSize = 13.sp, color = Colores.Gris)
                        }
                        TextButton(onClick = {
                            alcance.launch {
                                try { api.borrarClase(c.id) } catch (e: Exception) { error = e.message }
                                recargar++
                            }
                        }) { Text("🗑️") }
                    }
                }
            }
            // Lo que la app ha aprendido del consumo (por tipo de actividad)
            if (consumo.isNotEmpty()) {
                item {
                    Column {
                        Spacer(Modifier.height(8.dp))
                        Text("🧠 Consumo aprendido (% de batería por hora)", fontWeight = FontWeight.SemiBold,
                            color = Colores.Oscuro)
                        Text("Empieza con un valor estimado y se ajusta con cada clase medida.",
                            fontSize = 12.sp, color = Colores.Gris)
                    }
                }
                items(consumo) { c ->
                    Card(colors = CardDefaults.cardColors(containerColor = Colores.VerdeSuave)) {
                        Row(Modifier.padding(12.dp).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(NOMBRE_ACTIVIDAD[c.actividad] ?: c.actividad, Modifier.weight(1f), color = Colores.Oscuro)
                            Text("estimado ${c.defecto.toInt()}% → ", fontSize = 13.sp, color = Colores.Gris)
                            Text("${c.prevision}%", fontWeight = FontWeight.Bold, color = Colores.Verde)
                            Text("  (${c.muestras} clases)", fontSize = 12.sp, color = Colores.Gris)
                        }
                    }
                }
            }
        }
    }

    if (dialogo) {
        DialogoNuevaClase(
            alCancelar = { dialogo = false },
            alGuardar = { asignatura, hora, duracion, actividad, n ->
                dialogo = false
                alcance.launch {
                    try { api.crearClase(asignatura, hora, duracion, actividad, n) } catch (e: Exception) { error = e.message }
                    recargar++
                }
            }
        )
    }
}

@Composable
private fun DialogoNuevaClase(
    alCancelar: () -> Unit,
    alGuardar: (String, String, Int, String, Int) -> Unit
) {
    var asignatura by remember { mutableStateOf("") }
    var hora by remember { mutableStateOf("10:00") }
    var duracion by remember { mutableStateOf("60") }
    var nTablets by remember { mutableStateOf("10") }
    var actividad by remember { mutableStateOf("ejercicios") }

    val horaValida = Regex("^([01]\\d|2[0-3]):[0-5]\\d$").matches(hora)
    val valido = asignatura.isNotBlank() && horaValida &&
            (duracion.toIntOrNull() ?: 0) > 0 && (nTablets.toIntOrNull() ?: 0) > 0

    AlertDialog(
        onDismissRequest = alCancelar,
        title = { Text("Nueva clase") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(asignatura, { asignatura = it }, label = { Text("Asignatura") }, singleLine = true)
                OutlinedTextField(hora, { hora = it }, label = { Text("Hora de inicio (HH:MM)") }, singleLine = true,
                    isError = !horaValida)
                OutlinedTextField(duracion, { duracion = it }, label = { Text("Duración (minutos)") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                OutlinedTextField(nTablets, { nTablets = it }, label = { Text("Tablets necesarias") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                Text("Tipo de actividad", fontSize = 13.sp, color = Colores.Gris)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("lectura", "ejercicios").forEach { a ->
                        FilterChip(selected = actividad == a, onClick = { actividad = a },
                            label = { Text(NOMBRE_ACTIVIDAD[a] ?: a) })
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("video", "juego").forEach { a ->
                        FilterChip(selected = actividad == a, onClick = { actividad = a },
                            label = { Text(NOMBRE_ACTIVIDAD[a] ?: a) })
                    }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = valido, onClick = {
                alGuardar(asignatura.trim(), hora, duracion.toInt(), actividad, nTablets.toInt())
            }) { Text("Guardar") }
        },
        dismissButton = { TextButton(onClick = alCancelar) { Text("Cancelar") } }
    )
}
