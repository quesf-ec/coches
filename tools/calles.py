"""Trae las calles de verdad de Quito para las pistas de coches/.

Pide a OpenStreetMap (por Overpass) las calles de cada receta, las cose en
un solo trazado siguiendo los puntos de paso, les pone altura con un modelo
de terreno (Open Topo Data, SRTM de 30 m) y escribe coches/pistas/<id>.json:
puntos en metros, cada ~5 m, con la altura relativa al primero, más dónde
empieza cada calle, para que el juego ponga sus zonas.

Uso:
  python3 tools/calles.py panecillo            una receta
  python3 tools/calles.py --todas              todas
  python3 tools/calles.py panecillo --sin-altura   sin pedir alturas (todo plano)

Necesita salida a overpass-api.de y api.opentopodata.org (o, de repuesto,
api.open-elevation.com). No usa nada que no venga con Python.

El JSON que sale:
  { "id", "origen": [lat, lon], "largo": metros, "cerrada": bool,
    "puntos": [[x, z, y], ...],          x al este, z al sur, y hacia arriba
    "calles": [[s, "nombre"], ...] }     en qué metro empieza cada calle
"""
import argparse
import heapq
import json
import math
import pathlib
import sys
import time
import urllib.parse
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / 'coches' / 'pistas'
OVERPASS = 'https://overpass-api.de/api/interpreter'
ALTURAS = 'https://api.opentopodata.org/v1/srtm30m'
ALTURAS_REPUESTO = 'https://api.open-elevation.com/api/v1/lookup'
PASO = 5.0          # metros entre puntos del trazado que se guarda

# El centro histórico y sus laderas, para no traer medio Quito.
CAJA = (-0.2420, -78.5330, -0.1980, -78.4880)   # sur, oeste, norte, este

# ─── las recetas ──────────────────────────────────────────────────
# `calles`: expresión regular con los nombres (como están en OSM).
# `pasos`: [lat, lon] por donde tiene que ir el trazado, en orden; el primero
# es la salida y el último la meta. Si `cerrada`, el último vuelve al primero.
RECETAS = {
    'panecillo': {
        'calles': r'Melchor de Benavides|Bah[ií]a de Car[aá]quez|Ambato|24 de Mayo|Morales|Garc[ií]a Moreno',
        'pasos': [[-0.22920, -78.51880], [-0.22520, -78.51640], [-0.22250, -78.51280], [-0.22030, -78.51200]],
    },
    'panecillo-vuelta': {
        # La vuelta al cerro por la Benavides, que da la vuelta entera.
        'calles': r'Melchor de Benavides',
        'pasos': [[-0.22920, -78.51880], [-0.23050, -78.51650], [-0.22760, -78.51550]],
        'cerrada': True,
    },
    'guapulo': {
        'calles': r'Camino de Orellana|Conquistadores|Leonidas Plaza|Francisco Compte|Gonz[aá]lez Su[aá]rez',
        'pasos': [[-0.19920, -78.47980], [-0.19980, -78.47700], [-0.20070, -78.47560]],
    },
    'sanjuan': {
        'calles': r'Venezuela|Carchi|Imbabura|Rocafuerte|Cuenca|Bol[ií]var',
        'pasos': [[-0.21420, -78.50720], [-0.21800, -78.51080], [-0.22050, -78.51440], [-0.22090, -78.51420]],
    },
}


def pide(url, datos=None, intentos=3):
    """GET o POST con reintentos; devuelve el JSON."""
    for n in range(intentos):
        try:
            cuerpo = urllib.parse.urlencode(datos).encode() if datos else None
            req = urllib.request.Request(url, data=cuerpo, headers={'User-Agent': 'coches-de-madera/1 (una.red)'})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as err:  # noqa: BLE001 — da igual cuál, se reintenta
            if n == intentos - 1:
                raise
            print(f'  …{err}; otra vez en {2 ** n} s', file=sys.stderr)
            time.sleep(2 ** n)
    return None


def trae_calles(receta):
    s, o, n, e = CAJA
    consulta = f'[out:json][timeout:90];way["highway"]["name"~"{receta["calles"]}"]({s},{o},{n},{e});out geom;'
    datos = pide(OVERPASS, {'data': consulta})
    vias = [w for w in datos['elements'] if w.get('type') == 'way' and w.get('geometry')]
    if not vias:
        sys.exit('Overpass no devolvió ninguna calle: revisa los nombres de la receta')
    return vias


def metros(lat0, lon0):
    """Proyección plana alrededor de un origen: x al este, z al sur."""
    kx = 111320 * math.cos(math.radians(lat0))
    kz = 110540
    return lambda lat, lon: ((lon - lon0) * kx, -(lat - lat0) * kz)


def cose(vias, pasos, cerrada):
    """Une las vías en un trazado que pasa por los pasos, por el camino más
    corto entre cada dos. Lo ya recorrido cuesta cinco veces más, para que
    una vuelta no vuelva por donde vino."""
    lat0, lon0 = pasos[0]
    proy = metros(lat0, lon0)
    nodos = {}     # (lat, lon) redondeado → [x, z]
    aristas = {}   # nodo → [(vecino, largo, nombre)]
    def nodo(p):
        k = (round(p['lat'], 7), round(p['lon'], 7))
        if k not in nodos:
            nodos[k] = proy(p['lat'], p['lon'])
        return k
    for w in vias:
        nombre = w['tags'].get('name', '')
        geo = w['geometry']
        for a, b in zip(geo, geo[1:]):
            ka, kb = nodo(a), nodo(b)
            (xa, za), (xb, zb) = nodos[ka], nodos[kb]
            d = math.hypot(xb - xa, zb - za)
            aristas.setdefault(ka, []).append((kb, d, nombre))
            aristas.setdefault(kb, []).append((ka, d, nombre))

    def cercano(lat, lon):
        x, z = proy(lat, lon)
        return min(nodos, key=lambda k: (nodos[k][0] - x) ** 2 + (nodos[k][1] - z) ** 2)

    usadas = set()
    def camino(a, b):
        dist = {a: 0.0}; prev = {}; cola = [(0.0, a)]
        while cola:
            d, u = heapq.heappop(cola)
            if u == b:
                break
            if d > dist.get(u, math.inf):
                continue
            for v, largo, nombre in aristas.get(u, []):
                coste = d + largo * (5 if frozenset((u, v)) in usadas else 1)
                if coste < dist.get(v, math.inf):
                    dist[v] = coste; prev[v] = (u, nombre); heapq.heappush(cola, (coste, v))
        if b not in prev and a != b:
            sys.exit('no hay camino entre dos pasos: las calles de la receta no se tocan')
        ruta = []
        u = b
        while u != a:
            p, nombre = prev[u]
            ruta.append((u, nombre)); usadas.add(frozenset((p, u))); u = p
        ruta.reverse()
        return ruta

    puntos_paso = [cercano(*p) for p in pasos]
    if cerrada:
        puntos_paso.append(puntos_paso[0])
    trazado = [(puntos_paso[0], None)]
    for a, b in zip(puntos_paso, puntos_paso[1:]):
        trazado += camino(a, b)
    # A metros, con la calle de cada tramo.
    xs = [nodos[k] for k, _ in trazado]
    nombres = [n for _, n in trazado]
    return xs, nombres, (lat0, lon0), proy


def remuestrea(xs, nombres, paso):
    """Puntos cada `paso` metros a lo largo del trazado, y dónde cambia la calle."""
    puntos = []; calles = []; s = 0.0; restante = 0.0; ultima = None
    for (a, b), nombre in zip(zip(xs, xs[1:]), nombres[1:]):
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        if d == 0:
            continue
        if nombre and nombre != ultima:
            calles.append([round(s, 1), nombre]); ultima = nombre
        t = restante
        while t <= d:
            f = t / d
            puntos.append([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
            t += paso
        restante = t - d
        s += d
    puntos.append(list(xs[-1]))
    return puntos, calles, s


def alturas(puntos, proy_inv):
    """La altura de cada punto, en tandas de 100 (lo que admite el servicio)."""
    ys = []
    for i in range(0, len(puntos), 100):
        tanda = puntos[i:i + 100]
        locs = '|'.join(f'{lat:.6f},{lon:.6f}' for lat, lon in (proy_inv(x, z) for x, z in tanda))
        try:
            d = pide(f'{ALTURAS}?locations={urllib.parse.quote(locs, safe=",|")}')
            ys += [r['elevation'] or 0 for r in d['results']]
        except Exception:  # noqa: BLE001
            d = pide(f'{ALTURAS_REPUESTO}?locations={urllib.parse.quote(locs, safe=",|")}')
            ys += [r['elevation'] or 0 for r in d['results']]
        print(f'  alturas: {min(i + 100, len(puntos))}/{len(puntos)}', file=sys.stderr)
        time.sleep(1.1)   # un pedido por segundo, que es lo que piden
    return ys


def receta_a_json(id_, receta, con_altura=True):
    print(f'{id_}: pidiendo calles…', file=sys.stderr)
    vias = trae_calles(receta)
    print(f'  {len(vias)} tramos de calle', file=sys.stderr)
    xs, nombres, (lat0, lon0), proy = cose(vias, receta['pasos'], receta.get('cerrada', False))
    puntos, calles, largo = remuestrea(xs, nombres, PASO)
    print(f'  {largo:.0f} m, {len(puntos)} puntos, calles: {", ".join(c[1] for c in calles)}', file=sys.stderr)
    kx = 111320 * math.cos(math.radians(lat0))
    inv = lambda x, z: (lat0 - z / 110540, lon0 + x / kx)  # noqa: E731
    ys = alturas(puntos, inv) if con_altura else [0.0] * len(puntos)
    y0 = ys[0]
    salida = {
        'id': id_, 'origen': [lat0, lon0], 'largo': round(largo, 1), 'cerrada': receta.get('cerrada', False),
        'puntos': [[round(x, 2), round(z, 2), round(y - y0, 2)] for (x, z), y in zip(puntos, ys)],
        'calles': calles,
    }
    SALIDA.mkdir(exist_ok=True)
    (SALIDA / f'{id_}.json').write_text(json.dumps(salida, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'  → coches/pistas/{id_}.json (baja {y0 - min(ys):.0f} m, sube {max(ys) - y0:.0f} m)', file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('recetas', nargs='*', help=' '.join(RECETAS))
    ap.add_argument('--todas', action='store_true')
    ap.add_argument('--sin-altura', action='store_true')
    a = ap.parse_args()
    ids = list(RECETAS) if a.todas else a.recetas
    if not ids:
        ap.error('di qué receta, o --todas')
    for id_ in ids:
        if id_ not in RECETAS:
            sys.exit(f'no hay receta «{id_}»; hay: {", ".join(RECETAS)}')
        receta_a_json(id_, RECETAS[id_], not a.sin_altura)


if __name__ == '__main__':
    main()
