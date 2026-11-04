"""
SIMULADOR DE TABLETS (para la demo)

Finge ser varias tablets que envían su batería al servidor, igual que haría la app Android.
Así el panel del profesor se ve lleno aunque solo tengáis 1-2 dispositivos reales.

Uso:
    python simulador.py                    # 25 tablets, una lectura cada 10 segundos
    python simulador.py --tablets 15 --intervalo 5
    python simulador.py --una-vez          # envía una sola lectura de cada una y termina
    python simulador.py --servidor http://192.168.1.50:8000
"""
import argparse
import random
import time

import httpx


class TabletSimulada:
    def __init__(self, indice: int, rnd: random.Random):
        self.device_id = f"simulada-{indice:02d}"
        self.tablet_id = None
        self.rnd = rnd
        # Por la mañana casi todas llegan con poca batería: así el plan tiene trabajo que hacer
        self.bateria = rnd.choice([3, 5, 8, 10, 12, 14, 16, 18, 20, 22, 25, 30, 35, 45, 60, 80])
        self.cargando = False
        self.temperatura = rnd.uniform(26, 33)

    def avanzar(self):
        """Cada paso: se descarga un poco o, si está enchufada, se carga."""
        if self.cargando:
            self.bateria = min(100, self.bateria + self.rnd.uniform(1.5, 3))
            if self.bateria >= 100 or self.rnd.random() < 0.05:
                self.cargando = False
        else:
            self.bateria = max(0, self.bateria - self.rnd.uniform(0, 0.6))
            if self.rnd.random() < 0.02:
                self.cargando = True
        self.temperatura += self.rnd.uniform(-0.3, 0.3) + (0.2 if self.cargando else 0)
        self.temperatura = min(max(self.temperatura, 24), 40)

    def lectura(self) -> dict:
        return {"tablet_id": self.tablet_id, "bateria": round(self.bateria, 1),
                "cargando": self.cargando, "temperatura": round(self.temperatura, 1)}


def main():
    p = argparse.ArgumentParser(description="Simulador de tablets para Fotosíntesis")
    p.add_argument("--servidor", default="http://127.0.0.1:8000")
    p.add_argument("--tablets", type=int, default=25)
    p.add_argument("--intervalo", type=float, default=10, help="segundos entre lecturas")
    p.add_argument("--una-vez", action="store_true")
    p.add_argument("--semilla", type=int, default=7)
    args = p.parse_args()

    rnd = random.Random(args.semilla)
    tablets = [TabletSimulada(i, rnd) for i in range(1, args.tablets + 1)]

    with httpx.Client(base_url=args.servidor, timeout=10) as cliente:
        for t in tablets:
            r = cliente.post("/api/tablets/registro", json={"device_id": t.device_id, "modelo": "Simulada",
                                                            "simulada": True})
            r.raise_for_status()
            t.tablet_id = r.json()["tablet_id"]
        print(f"✅ {len(tablets)} tablets simuladas registradas en {args.servidor}")

        while True:
            for t in tablets:
                t.avanzar()
            cliente.post("/api/lecturas", json=[t.lectura() for t in tablets]).raise_for_status()
            resumen = " ".join(f"{t.tablet_id}:{t.bateria:.0f}%{'⚡' if t.cargando else ''}" for t in tablets[:6])
            print(f"📤 {time.strftime('%H:%M:%S')}  {resumen} …")
            if args.una_vez:
                break
            time.sleep(args.intervalo)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nSimulador detenido.")
    except httpx.ConnectError:
        print("❌ No se puede conectar con el servidor. ¿Está arrancado? (uvicorn app.main:app --host 0.0.0.0)")
