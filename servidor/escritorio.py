"""
APP DE ESCRITORIO DEL PROFESOR

Arranca el servidor y abre la app en una ventana propia (sin barra de navegador).
Doble clic no: se lanza desde la terminal con

    python escritorio.py

Si la librería de ventanas (pywebview) no está instalada, se abre en el navegador.
"""
import threading
import time
import webbrowser

import httpx
import uvicorn

URL = "http://127.0.0.1:8000/"


def servidor_en_marcha() -> bool:
    try:
        return httpx.get(URL + "api/info", timeout=1).status_code == 200
    except httpx.HTTPError:
        return False


def arrancar_servidor():
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, log_level="warning")


def main():
    # Si el servidor ya está arrancado (en otra terminal), solo abrimos la ventana
    if not servidor_en_marcha():
        threading.Thread(target=arrancar_servidor, daemon=True).start()
        for _ in range(50):
            if servidor_en_marcha():
                break
            time.sleep(0.2)

    try:
        import webview   # pywebview
        webview.create_window("Fotosíntesis", URL, width=1360, height=880, min_size=(900, 640))
        webview.start()
    except ImportError:
        print("pywebview no está instalado: abriendo en el navegador (pip install pywebview)")
        webbrowser.open(URL)
        print("Servidor en marcha. Pulsa Ctrl+C para cerrar.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
