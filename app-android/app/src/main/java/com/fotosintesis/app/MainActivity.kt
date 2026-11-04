package com.fotosintesis.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.fotosintesis.app.data.Preferencias
import com.fotosintesis.app.profesor.PantallaProfesor
import com.fotosintesis.app.tablet.PantallaTablet
import com.fotosintesis.app.ui.TemaFotosintesis

/**
 * Una sola app con dos modos:
 *   - TABLET:   monitor de batería (lo que se instala en las tablets de los alumnos)
 *   - PROFESOR: panel, plan de carga, horario, previsión y asistente
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = Preferencias(this)

        setContent {
            TemaFotosintesis {
                var modo by remember { mutableStateOf(prefs.modo) }
                when (modo) {
                    "tablet" -> PantallaTablet(alCambiarModo = { prefs.modo = null; modo = null })
                    "profesor" -> PantallaProfesor(alCambiarModo = { prefs.modo = null; modo = null })
                    else -> PantallaInicio(alElegir = { modo = it })
                }
            }
        }
    }
}
