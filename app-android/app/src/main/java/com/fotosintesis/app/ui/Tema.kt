package com.fotosintesis.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Colores de la marca (los mismos que la app de escritorio): verde noche, lima y sol */
object Colores {
    val Fondo = Color(0xFF04211A)          // verde noche
    val Superficie = Color(0xFF0A3328)     // tarjetas
    val Texto = Color(0xFFF2F0E6)          // blanco cálido
    val Texto2 = Color(0xFFA7BCB2)
    val Texto3 = Color(0xFF6F8A7E)
    val Separador = Color(0x17E8F0D6)
    val RellenoControl = Color(0x17F2F0E6)

    val Verde = Color(0xFFA6D93B)
    val VerdeHoja = Color(0xFFA6D93B)      // lima: color principal (botones)
    val SobreLima = Color(0xFF04211A)      // texto encima del lima
    val Naranja = Color(0xFFFFB547)
    val Rojo = Color(0xFFFF7A66)
    val Azul = Color(0xFFA6D93B)           // los enlaces van en lima
    val Sol = Color(0xFFF7C235)

    val VerdeSuave = Color(0x1FA6D93B)
    val NaranjaSuave = Color(0x1FFFB547)
    val SolSuave = Color(0x29F7C235)
    val RojoSuave = Color(0x1FFF7A66)

    // Nombres usados en versiones anteriores
    val Gris = Texto3
    val Oscuro = Texto

    fun deBateria(pct: Double?): Color = when {
        pct == null -> Texto3
        pct >= 60 -> Verde
        pct >= 30 -> Naranja
        else -> Rojo
    }
}

@Composable
fun TemaFotosintesis(contenido: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Colores.VerdeHoja,
            onPrimary = Colores.SobreLima,
            secondary = Colores.Sol,
            background = Colores.Fondo,
            surface = Colores.Superficie,
            onSurface = Colores.Texto,
            onBackground = Colores.Texto
        ),
        typography = Typography(
            bodyLarge = TextStyle(fontSize = 17.sp, color = Colores.Texto),
            bodyMedium = TextStyle(fontSize = 15.sp, color = Colores.Texto),
            titleLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        ),
        content = contenido
    )
}
