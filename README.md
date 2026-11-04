# 🌱 Fotosíntesis — Hack4Edu 2026 · Reto 02 «Aprender sin conexión»

> La escuela que convierte la luz en aprendizaje. Para aprender sin conexión hacen falta dos cosas: **contenido descargado** y **batería**.
> Fotosíntesis planifica ambas: mira el sol de mañana, decide qué tablets cargar primero
> y cuándo descargar los contenidos, y un asistente con IA se lo explica al profesor.
> Todo queda guardado en la tablet para cuando se va internet.

---

## 📁 Estructura (cada persona toca SOLO su carpeta)

```
fotosintesis/
├── frontend/         👤 Persona 1 — la página del profesor
│   ├── index.html
│   ├── estilos.css
│   └── app.js        ← aquí se CONECTAN las tres partes
├── planificador/     👤 Persona 2 — tiempo (Open-Meteo) + qué cargar y cuándo
│   └── planificador.js
├── ia/               👤 Persona 3 — IA (Gemini) + modo sin conexión
│   └── ia.js
├── shared/datos/     📄 datos de ejemplo (escuela, tablets, horario) — de todos
├── config.ejemplo.js 🔑 plantilla para la clave de la IA
└── README.md
```

**Ya funciona todo conectado desde el minuto 1** con datos de ejemplo.
Cada uno mejora su parte sin romper la de los demás, siempre que respete el *contrato* (abajo).

---

## ▶️ Cómo abrirlo (5 minutos)

1. Instalad **Visual Studio Code** y la extensión **Live Server** (de Ritwick Dey).
2. Abrid la carpeta `fotosintesis` en VS Code.
3. Clic derecho en `frontend/index.html` → **Open with Live Server**.
   *(No funciona con doble clic sobre el archivo: hace falta Live Server.)*
4. **IA (opcional al principio):** copiad `config.ejemplo.js` como `config.js` y poned
   vuestra clave gratuita de https://aistudio.google.com/apikey.
   Sin clave, la app funciona igual con mensajes de plantilla.

---

## 🤝 El contrato: cómo se hablan las tres partes

**No cambiéis el nombre ni la forma de estas funciones sin avisar al grupo.**

### planificador/planificador.js (Persona 2)
```js
obtenerPrevisionSolar(latitud, longitud)  // → array de 24 números (W/m² de mañana, hora a hora)
calcularPlan(tablets, horario, escuela, prevision)  // → objeto plan (formato abajo)
```

### ia/ia.js (Persona 3)
```js
explicarPlan(plan, escuela, idioma)          // → texto para el profesor
responderPregunta(pregunta, plan, escuela)   // → texto
guardarOffline(plan, mensaje)                // guarda en la tablet
cargarOffline()                              // → { plan, mensaje, fecha } o null
```

### Formato del `plan`
```js
{
  franjas: [ { hora: 9, energia_disponible_wh: 168, cargas: [ { tablet: "T11", wh: 10 } ] } ],
  clases: [ { id: "C1", asignatura: "Matemáticas", hora: 9,
              tablets_listas: 8, tablets_total: 10, tablets_no_listas: ["T03","T07"] } ],
  precargas: [ { contenido: "ciencias-ciclo-agua-video", tablets: ["T12"],
                 hora_descarga: 8, para_clase: "C2" } ]
}
```
Si necesitáis un campo nuevo: **añadidlo** (no quitéis ninguno) y avisad.

---

## 🌿 Cómo trabajar con Git sin pisarnos

```bash
# Una vez, al empezar
git clone https://github.com/<usuario>/fotosintesis.git
cd fotosintesis

# Cada vez que empiezas una tarea
git checkout main
git pull                          # traer lo último
git checkout -b feat/mi-tarea     # rama nueva (ej: feat/panel, feat/voraz, feat/gemini)

# Mientras trabajas (a menudo)
git add .
git commit -m "Qué he hecho"
git push -u origin feat/mi-tarea

# En GitHub: botón "Compare & pull request" → otro compañero lo revisa → Merge
```

**Reglas:**
- Nadie sube directo a `main`.
- Pull requests pequeños y varias veces al día.
- Cada uno solo toca su carpeta → casi nunca habrá conflictos.
- `config.js` nunca se sube (ya está en `.gitignore`).

---

## ✅ Tareas por persona

**Persona 1 — Frontend**
- [ ] Mejorar el diseño (logo, colores del equipo)
- [ ] Al pasar el ratón por una barra de energía, mostrar qué tablets se cargan
- [ ] Marcar en rojo las tablets que no llegarán a su clase
- [ ] Selector de idioma (español / portugués / inglés) que se pase a `explicarPlan`

**Persona 2 — Planificador**
- [ ] Comprobar que Open-Meteo devuelve datos reales para la escuela
- [ ] Revisar el algoritmo: ¿prioriza bien? ¿y si dos clases empiezan a la vez?
- [ ] Extra si sobra tiempo: plantearlo como programación lineal (PuLP o Solver) para el pitch

**Persona 3 — IA y sin conexión**
- [ ] Conseguir la clave de Gemini y probar `explicarPlan`
- [ ] Afinar el *prompt* para que los mensajes sean claros y cortos
- [ ] Que la IA proponga alternativas pedagógicas si faltan tablets
- [ ] Extra: que la página funcione al recargar sin internet (Service Worker)

**Todos — mañana a las 16:00:** congelar funcionalidades y ensayar la demo.

---

## 🎬 Guion de la demo
1. Escuela de Chiwamba (Malawi), 30 tablets, un panel solar de 400 W.
2. Pulsar **☁️ Día nublado** → aparecen avisos: clases sin tablets suficientes.
3. El asistente explica qué cargar primero y propone trabajar en grupos.
4. Pulsar **📴 Cortar internet** → la app sigue mostrando el plan guardado.
