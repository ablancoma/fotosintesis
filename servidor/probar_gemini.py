"""
Comprueba si el asistente puede usar Gemini.

    cd servidor && source .venv/bin/activate && python probar_gemini.py

Lee la clave de servidor/.env, prueba los modelos de Gemini y dice cuál funciona o qué falla.
"""
from app import ia

print("Probando Gemini…")
r = ia.estado()
if r["ok"]:
    print(f"✅ Gemini funciona con el modelo {r['modelo']}")
    print(f"   Respuesta: {r['respuesta']}")
else:
    print(f"❌ {r['motivo']}")
    print("   Clave gratis en https://aistudio.google.com/apikey → pégala en servidor/.env así:")
    print("   GEMINI_API_KEY=tu_clave")
