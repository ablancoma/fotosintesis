"""
Comprueba qué IA puede usar el asistente.

    cd servidor && source .venv/bin/activate && python probar_ia.py

1. IA local (Gemma con Ollama, sin internet)   2. Gemini (clave en servidor/.env)
"""
from app import ia

print("Probando la IA…\n")
r = ia.estado()
o, g = r["ollama"], r["gemini"]
if o["ok"]:
    print(f"✅ IA local funcionando con {o['modelo']} (sin internet)")
else:
    print(f"❌ IA local: {o['motivo']}")
    print("   Instálala: descarga Ollama de https://ollama.com, ábrelo y ejecuta  ollama pull gemma4:e2b")
if g["ok"]:
    print(f"✅ Gemini funcionando con {g['modelo']}")
else:
    print(f"❌ Gemini: {g['motivo']}")
print()
if o["ok"]:
    print("El asistente usará la IA local.")
elif g["ok"]:
    print("El asistente usará Gemini.")
else:
    print("El asistente dará un resumen automático (la app funciona igual).")
