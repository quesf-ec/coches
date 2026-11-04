"""Trae las calles de verdad de Quito para las pistas de coches/.

Baja de OpenStreetMap lo que hay alrededor de cada receta, cose sus calles en
un solo trazado siguiendo los puntos de paso, les pone altura con un modelo
de terreno (Open Topo Data, SRTM de 30 m) y escribe pistas/<id>.json:
puntos en metros, cada ~5 m, con la altura relativa al primero, más dónde
empieza cada calle, para que el juego ponga sus zonas y diga su nombre.

Trae también lo que hay a los lados, para que el escenario no tenga
agujeros: los edificios (su planta, su altura por `height` o por pisos, y si
es iglesia), las calles que se cruzan, los parques y las plazas, el terreno
en una rejilla alrededor del trazado y los lugares con nombre por donde pasa
(iglesias, plazas, parques, museos, miradores), que el juego levanta en 3D y
anuncia al pasar. Y actualiza pistas/indice.json, la lista de trazados que
hay, que es lo único que el juego pide al cargar.

Uso:
  python3 tools/calles.py panecillo            una receta
  python3 tools/calles.py --todas              todas
  python3 tools/calles.py panecillo --sin-altura   sin pedir alturas (todo plano)
  python3 tools/calles.py panecillo --sin-edificios   solo la calle
  python3 tools/calles.py panecillo --overpass     el mapa por Overpass en vez de la API

El mapa sale por defecto de la API principal de OpenStreetMap
(api.openstreetmap.org, /api/0.6/map), en teselas de ~650 m que se guardan
en ~/.cache/coches-calles: una receta pide solo las que toca, y la segunda
vez no pide nada. Con --overpass lo pide a overpass-api.de. Las alturas, a
api.opentopodata.org (de repuesto, api.open-elevation.com), y también se
guardan. No usa nada que no venga con Python.

El JSON que sale:
  { "id", "origen": [lat, lon], "largo": metros, "cerrada": bool,
    "puntos": [[x, z, y], ...],          x al este, z al sur, y hacia arriba
    "calles": [[s, "nombre"], ...],      en qué metro empieza cada calle
    "edificios": [{"p": [[x, z], ...], "h": alto, "y": suelo, "tipo": "casa" | "iglesia", "nombre"?}, ...],
    "vias": [{"t": tipo, "n"?: nombre, "s"?: "piedra", "p": [[x, z], ...]}, ...],   las otras calles
    "verdes": [{"t": "parque" | "bosque" | "plaza", "p": [[x, z], ...]}, ...],
    "terreno": {"x0", "z0", "paso", "nx", "nz", "y": [alto | null, ...]},   fila a fila (z), relativo
    "lugares": [[s, x, z, "nombre", "tipo"], ...] }   lo que tiene nombre, por metro
"""
import argparse
import contextlib
import heapq
import json
import math
import os
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SALIDA = RAIZ / 'pistas'
OSM_API = 'https://api.openstreetmap.org/api/0.6/map.json'
OVERPASS = 'https://overpass-api.de/api/interpreter'
ALTURAS = 'https://api.opentopodata.org/v1/srtm30m'
ALTURAS_REPUESTO = 'https://api.open-elevation.com/api/v1/lookup'
CACHE = pathlib.Path(os.environ.get('XDG_CACHE_HOME', pathlib.Path.home() / '.cache')) / 'coches-calles'
AGENTE = 'coches-de-madera/1 (github.com/quesf-ec/coches)'
PASO = 5.0             # metros entre puntos del trazado que se guarda
TESELA = 0.006         # grados por lado de cada tesela del mapa (~670 m)
MARGEN = 0.004         # grados alrededor de los pasos donde se buscan las calles
RADIO_EDIFICIOS = 90   # metros a cada lado del trazado donde se traen edificios
RADIO_VIAS = 130       # las otras calles
RADIO_VERDES = 160     # parques y plazas
RADIO_LUGARES = 60     # lugares con nombre
RADIO_TERRENO = 330    # la rejilla del terreno, más allá de la niebla
PASO_TERRENO = 30      # metros entre alturas de la rejilla (lo que da el SRTM)

# ─── las recetas ──────────────────────────────────────────────────
# `calles`: expresión regular con los nombres (como están en OSM).
# `pasos`: [lat, lon] por donde tiene que ir el trazado, en orden; el primero
# es la salida y el último la meta. Si `cerrada`, el último vuelve al primero.
RECETAS = {
    'panecillo': {
        # Del lomo oriental del cerro, con la Virgen arriba a la izquierda, por
        # las curvas de la Melchor de Aymerich; abajo, la vuelta grande por la
        # General Necochea y la Mariscal Sucre; la Rafael Barahona y la Ambato
        # cuesta abajo, y la García Moreno, que cruza la quebrada de La Ronda y
        # sube hasta la Plaza Grande.
        'calles': r'^(Melchor de Aymerich|General Necochea|Avenida Mariscal Sucre|Chimborazo|Rafael Barahona|Ambato|García Moreno)$',
        'pasos': [[-0.22882, -78.51688], [-0.22450, -78.52142], [-0.22370, -78.51900], [-0.22400, -78.51720], [-0.21945, -78.51215]],
    },
    'subida': {
        # La Melchor de Aymerich al revés: del lomo oriental, por el sur del
        # cerro y la horquilla del suroeste, hasta la Virgen.
        'calles': r'^Melchor de Aymerich$',
        'pasos': [[-0.22815, -78.51682], [-0.23170, -78.52050], [-0.22885, -78.51910]],
    },
    'panecillo-vuelta': {
        # La única vuelta que hay arriba del cerro: la Melchor de Aymerich
        # alrededor de la Virgen, con la horquilla en V del cruce del oeste.
        'calles': r'^Melchor de Aymerich$',
        'pasos': [[-0.22862, -78.51811], [-0.22862, -78.51921], [-0.22904, -78.51894], [-0.22856, -78.51883]],
        'cerrada': True,
    },
    'guapulo': {
        # Del Pasaje Stubel (el lomo tras el Hotel Quito, con el Mirador de
        # Guápulo en la esquina) por la Rafael León Larrea al Camino de Orellana,
        # cortando su horquilla de arriba por el atajo de 15 m sin nombre (de ahí
        # el «|)» de la regex, que admite vías sin nombre); las dos horquillas del
        # Camino, la de la Leonidas Plaza Lasso y su picada hasta la plaza del
        # santuario.
        'calles': r'^(Pasaje Stubel|Rafael León Larrea|Camino de Orellana|Leonidas Plaza Lasso|)$',
        'pasos': [[-0.20061, -78.47916], [-0.20357, -78.47924], [-0.20361, -78.47912], [-0.20259, -78.47871], [-0.20215, -78.47830],
                  [-0.20020, -78.47754], [-0.19958, -78.47732], [-0.20027, -78.47723], [-0.20074, -78.47562]],
    },
    'centro-vuelta': {
        # Dos manzanas con la Plaza Grande dentro: la Venezuela abajo, la
        # Espejo, la García Moreno arriba y la Mejía. Cuatro esquinas rectas.
        'calles': r'^(Venezuela|Espejo|García Moreno|José Mejía)$',
        'pasos': [[-0.21950, -78.51103], [-0.22068, -78.51200], [-0.22014, -78.51273], [-0.21889, -78.51167], [-0.21938, -78.51093]],
        'cerrada': True,
    },
    'sanjuan': {
        # De la Basílica por la Venezuela, que pasa por la Plaza Grande, hasta
        # Santo Domingo; la Rocafuerte y, a lo largo de la Plaza de San
        # Francisco, la Benalcázar.
        'calles': r'^(Venezuela|Vicente Rocafuerte|Sebastián de Benalcázar)$',
        'pasos': [[-0.21359, -78.50626], [-0.21809, -78.50992], [-0.22255, -78.51355], [-0.22323, -78.51411], [-0.22208, -78.51560],
                  [-0.22059, -78.51432]],
    },
    'tobogan': {
        # La bajada grande: la Olmedo recta hasta La Marín, la Guayaquil en el
        # valle, la Manabí de vuelta arriba y la Cuenca. Un circuito.
        'calles': r'^(Olmedo|Guayaquil|Manabí|Cuenca)$',
        'pasos': [[-0.21720, -78.51249], [-0.21925, -78.50973], [-0.21883, -78.50899], [-0.21651, -78.51190]],
        'cerrada': True,
    },
}

# Las vías que no son para un coche de madera: escaleras, ascensores, obras.
NO_RUEDA = {'steps', 'elevator', 'proposed', 'construction', 'platform', 'bus_stop', 'corridor', 'raceway', 'abandoned', 'razed'}


@contextlib.contextmanager
def turno(nombre):
    """De a uno: si corren varios a la vez, se turnan para pedir (y la
    caché no se pisa)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    try:
        import fcntl
    except ImportError:   # Windows: sin candado
        yield
        return
    with open(CACHE / f'{nombre}.lock', 'w') as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def escribe(f, texto):
    """Escribe entero o nada: a un temporal y luego se renombra."""
    tmp = f.with_name(f'{f.name}.{os.getpid()}.tmp')
    tmp.write_text(texto, encoding='utf-8')
    os.replace(tmp, f)


def pide(url, datos=None, intentos=4):
    """GET o POST con reintentos; devuelve el JSON."""
    for n in range(intentos):
        try:
            cuerpo = urllib.parse.urlencode(datos).encode() if datos else None
            req = urllib.request.Request(url, data=cuerpo, headers={'User-Agent': AGENTE})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except Exception as err:  # noqa: BLE001 — da igual cuál, se reintenta
            if n == intentos - 1:
                raise
            print(f'  …{err}; otra vez en {2 ** (n + 1)} s', file=sys.stderr)
            time.sleep(2 ** (n + 1))
    return None


# ─── el mapa: lo que hay en OSM en una caja, por teselas ──────────
class Mapa:
    """Los nodos, vías y relaciones de OSM de las teselas pedidas, juntos."""

    def __init__(self, overpass=False):
        self.nodos, self.vias, self.rels = {}, {}, {}
        self.teselas = set()
        self.overpass = overpass

    def cubre(self, s, o, n, e):
        """Que estén todas las teselas que tocan la caja (sur, oeste, norte, este)."""
        for i in range(math.floor(s / TESELA), math.floor(n / TESELA) + 1):
            for j in range(math.floor(o / TESELA), math.floor(e / TESELA) + 1):
                if (i, j) not in self.teselas:
                    self.teselas.add((i, j))
                    self._mete(self._tesela(i, j))

    def _tesela(self, i, j):
        CACHE.mkdir(parents=True, exist_ok=True)
        f = CACHE / f'osm_{i}_{j}.json'
        if f.exists():
            return json.loads(f.read_text(encoding='utf-8'))
        with turno('osm'):
            if f.exists():   # la bajó otro mientras se esperaba
                return json.loads(f.read_text(encoding='utf-8'))
            s, o, n, e = i * TESELA, j * TESELA, (i + 1) * TESELA, (j + 1) * TESELA
            print(f'  tesela {i},{j} ({s:.3f},{o:.3f})…', file=sys.stderr)
            if self.overpass:
                q = f'[out:json][timeout:180];(nwr({s},{o},{n},{e}););(._;>;);out body;'
                datos = pide(OVERPASS, {'data': q})
            else:
                datos = pide(f'{OSM_API}?bbox={o},{s},{e},{n}')
                time.sleep(1)   # sin prisa: la API es de todos
            escribe(f, json.dumps(datos, separators=(',', ':')))
        return datos

    def _mete(self, datos):
        for el in datos.get('elements', []):
            t = el.get('type')
            if t == 'node':
                self.nodos[el['id']] = el
            elif t == 'way':
                self.vias[el['id']] = el
            elif t == 'relation':
                self.rels[el['id']] = el

    def geo(self, via):
        """Los (lat, lon) de una vía, los que estén."""
        return [(self.nodos[r]['lat'], self.nodos[r]['lon']) for r in via.get('nodes', []) if r in self.nodos]

    def contornos(self, rel):
        """Los anillos de fuera de un multipolígono, cosidos si vienen a trozos."""
        trozos = [self.geo(self.vias[m['ref']]) for m in rel.get('members', [])
                  if m.get('type') == 'way' and m.get('role', 'outer') in ('outer', '') and m['ref'] in self.vias]
        trozos = [t for t in trozos if len(t) > 1]
        anillos = []
        while trozos:
            a = trozos.pop(0)
            cambio = True
            while a[0] != a[-1] and cambio:
                cambio = False
                for k, b in enumerate(trozos):
                    if b[0] == a[-1]:
                        a = a + b[1:]
                    elif b[-1] == a[-1]:
                        a = a + b[::-1][1:]
                    elif b[-1] == a[0]:
                        a = b + a[1:]
                    elif b[0] == a[0]:
                        a = b[::-1] + a[1:]
                    else:
                        continue
                    trozos.pop(k); cambio = True
                    break
            if a[0] == a[-1] and len(a) > 3:
                anillos.append(a)
        return anillos

    def centro(self, el):
        if el['type'] == 'node':
            return el['lat'], el['lon']
        if el['type'] == 'way':
            g = self.geo(el)
        else:
            g = [p for a in self.contornos(el) for p in a] or [p for m in el.get('members', []) if m.get('type') == 'way' and m['ref'] in self.vias for p in self.geo(self.vias[m['ref']])]
        if not g:
            return None
        return sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g)


def trae_calles(receta, mapa):
    patron = re.compile(receta['calles'])
    vias = []
    for w in mapa.vias.values():
        tags = w.get('tags', {})
        if 'highway' not in tags or tags['highway'] in NO_RUEDA or tags.get('footway') == 'sidewalk' or tags.get('area') == 'yes':
            continue
        if not patron.search(tags.get('name', '')):
            continue
        g = mapa.geo(w)
        if len(g) > 1:
            vias.append({'id': w['id'], 'tags': tags, 'geometry': [{'lat': a, 'lon': b} for a, b in g]})
    if not vias:
        sys.exit('OSM no tiene ninguna calle con esos nombres por ahí: revisa los nombres de la receta')
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
    aristas = {}   # nodo → [(vecino, largo, nombre, vía)]
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
            # Un coche de madera baja por donde sea: sin sentido único.
            aristas.setdefault(ka, []).append((kb, d, nombre, w.get('id')))
            aristas.setdefault(kb, []).append((ka, d, nombre, w.get('id')))

    def cercano(lat, lon):
        x, z = proy(lat, lon)
        return min(nodos, key=lambda k: (nodos[k][0] - x) ** 2 + (nodos[k][1] - z) ** 2)

    usadas = set()
    vias_usadas = set()
    def camino(a, b):
        dist = {a: 0.0}; prev = {}; cola = [(0.0, a)]
        while cola:
            d, u = heapq.heappop(cola)
            if u == b:
                break
            if d > dist.get(u, math.inf):
                continue
            for v, largo, nombre, wid in aristas.get(u, []):
                coste = d + largo * (5 if frozenset((u, v)) in usadas else 1)
                if coste < dist.get(v, math.inf):
                    dist[v] = coste; prev[v] = (u, nombre, wid); heapq.heappush(cola, (coste, v))
        if b not in prev and a != b:
            sys.exit('no hay camino entre dos pasos: las calles de la receta no se tocan')
        ruta = []
        u = b
        while u != a:
            p, nombre, wid = prev[u]
            ruta.append((u, nombre)); usadas.add(frozenset((p, u))); vias_usadas.add(wid); u = p
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
    return xs, nombres, (lat0, lon0), proy, vias_usadas


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


# ─── las alturas ──────────────────────────────────────────────────
def _lee_alturas():
    f = CACHE / 'alturas.json'
    return json.loads(f.read_text(encoding='utf-8')) if f.exists() else {}


def alturas(latlons):
    """La altura de cada (lat, lon), en tandas de 100 (lo que admite el
    servicio). Lo ya pedido sale de la caché, que comparten todas las recetas."""
    clave = lambda lat, lon: f'{lat:.5f},{lon:.5f}'  # noqa: E731
    guardadas = _lee_alturas()
    faltan = sorted({clave(*p) for p in latlons if clave(*p) not in guardadas})
    for i in range(0, len(faltan), 100):
        with turno('alturas'):
            guardadas = _lee_alturas()   # lo que hayan traído otros mientras
            tanda = [k for k in faltan[i:i + 100] if k not in guardadas]
            if tanda:
                locs = '|'.join(tanda)
                try:
                    d = pide(f'{ALTURAS}?locations={urllib.parse.quote(locs, safe=",|")}')
                except Exception:  # noqa: BLE001
                    d = pide(f'{ALTURAS_REPUESTO}?locations={urllib.parse.quote(locs, safe=",|")}')
                for k, r in zip(tanda, d['results']):
                    guardadas[k] = r['elevation']
                escribe(CACHE / 'alturas.json', json.dumps(guardadas))
                time.sleep(1.1)   # un pedido por segundo, que es lo que piden
        print(f'  alturas: {min(i + 100, len(faltan))}/{len(faltan)}', file=sys.stderr)
    return [guardadas.get(clave(*p)) for p in latlons]


# ─── lo que está cerca del trazado ────────────────────────────────
class Cerca:
    """El trazado en una rejilla de celdas de 20 m: dónde está su punto más
    cercano a cualquier (x, z), sin recorrerlo entero cada vez."""

    def __init__(self, puntos, celda=20.0):
        self.p, self.c = puntos, celda
        self.rej = {}
        for i, (x, z) in enumerate(puntos):
            self.rej.setdefault((math.floor(x / celda), math.floor(z / celda)), []).append(i)

    def de(self, x, z, hasta=math.inf):
        """(metro del trazado, distancia) del punto más cercano, si está a menos de `hasta`."""
        cx, cz = math.floor(x / self.c), math.floor(z / self.c)
        mejor, im = math.inf, -1
        r = 0
        while True:
            for i in range(cx - r, cx + r + 1):
                for k in range(cz - r, cz + r + 1):
                    if max(abs(i - cx), abs(k - cz)) != r:
                        continue
                    for q in self.rej.get((i, k), ()):
                        px, pz = self.p[q]
                        d = (px - x) ** 2 + (pz - z) ** 2
                        if d < mejor:
                            mejor, im = d, q
            # Lo que quede en otro anillo está a más de (r · celda).
            if im >= 0 and math.sqrt(mejor) <= r * self.c:
                break
            if r * self.c > hasta + self.c or r > 400:
                break
            r += 1
        return (im * PASO, math.sqrt(mejor)) if im >= 0 else (0.0, math.inf)


def alto_de(tags):
    """La altura de un edificio: `height`, si no los pisos, si no por su tipo."""
    for k in ('height', 'building:height'):
        try:
            return max(3.0, float(str(tags[k]).lower().replace('m', '').replace(',', '.').split(';')[0]))
        except (KeyError, ValueError):
            pass
    try:
        return max(1.0, float(tags['building:levels'])) * 3.2 + 1.0
    except (KeyError, ValueError):
        pass
    return {'church': 16, 'cathedral': 24, 'chapel': 9, 'basilica': 30, 'apartments': 15, 'commercial': 10,
            'office': 14, 'hospital': 14, 'school': 8, 'university': 12, 'house': 6.5, 'residential': 7.5,
            'garage': 3, 'roof': 4, 'shed': 3}.get(tags.get('building'), 7.5)


def poligono(geo, proy):
    pts = [proy(a, b) for a, b in geo]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts


def trae_edificios(cerca, proy, mapa):
    edificios = []
    def mete(pts, tags):
        if len(pts) < 3:
            return
        cx, cz = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
        _, d = cerca.de(cx, cz, RADIO_EDIFICIOS + 15)
        if d < 3 or d > RADIO_EDIFICIOS + 15:
            return        # en medio de la calle, o demasiado lejos
        iglesia = tags.get('building') in ('church', 'cathedral', 'chapel', 'basilica') or tags.get('amenity') == 'place_of_worship'
        e = {'p': [[round(x, 1), round(z, 1)] for x, z in pts], 'h': round(alto_de(tags), 1), 'tipo': 'iglesia' if iglesia else 'casa', '_c': (cx, cz)}
        if tags.get('name'):
            e['nombre'] = tags['name']
        edificios.append(e)
    for w in mapa.vias.values():
        tags = w.get('tags', {})
        if tags.get('building', 'no') == 'no':
            continue
        mete(poligono(mapa.geo(w), proy), tags)
    for r in mapa.rels.values():
        tags = r.get('tags', {})
        if tags.get('building', 'no') == 'no' or tags.get('type') != 'multipolygon':
            continue
        for anillo in mapa.contornos(r):
            mete(poligono(anillo, proy), tags)
    return edificios


TIPO_VIA_ANCHO = {'motorway': 8, 'trunk': 8, 'primary': 7, 'secondary': 6.5, 'tertiary': 5.5, 'unclassified': 4.5,
                  'residential': 4.5, 'living_street': 4, 'service': 3.5, 'pedestrian': 4.5, 'track': 3,
                  'footway': 2, 'path': 1.6, 'steps': 2.2, 'cycleway': 2}
PIEDRA = {'paving_stones', 'sett', 'cobblestone', 'unhewn_cobblestone', 'stone', 'paving_stones:30'}


def trae_vias(cerca, proy, mapa, propias):
    """Las otras calles: los trozos que quedan a menos de RADIO_VIAS del
    trazado y no son el trazado mismo."""
    vias = []
    for w in mapa.vias.values():
        tags = w.get('tags', {})
        t = tags.get('highway')
        if t not in TIPO_VIA_ANCHO or tags.get('footway') == 'sidewalk' or tags.get('area') == 'yes':
            continue
        pts = [proy(a, b) for a, b in mapa.geo(w)]
        trozo = []
        def cierra():
            if len(trozo) > 1:
                v = {'t': t, 'p': [[round(x, 1), round(z, 1)] for x, z in trozo]}
                if tags.get('name'):
                    v['n'] = tags['name']
                if tags.get('surface') in PIEDRA:
                    v['s'] = 'piedra'
                vias.append(v)
        for a, b in zip(pts, pts[1:]):
            # Partido cada 10 m, para cortarlo donde se mete en el trazado.
            l = math.hypot(b[0] - a[0], b[1] - a[1])
            n = max(1, math.ceil(l / 10))
            for k in range(n + 1):
                if k == 0 and trozo:
                    continue
                x, z = a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n
                _, d = cerca.de(x, z, RADIO_VIAS)
                # Sobre el trazado (es la misma calle) o lejos: se corta.
                fuera = d > RADIO_VIAS or (w['id'] in propias and d < 6)
                if fuera:
                    cierra(); trozo = []
                else:
                    trozo.append((x, z))
        cierra()
    return vias


def trae_verdes(cerca, proy, mapa):
    """Parques, bosques y plazas cerca del trazado."""
    def tipo(tags):
        if tags.get('place') == 'square' or (tags.get('highway') == 'pedestrian' and tags.get('area') == 'yes'):
            return 'plaza'
        if tags.get('landuse') in ('forest',) or tags.get('natural') in ('wood', 'scrub'):
            return 'bosque'
        if tags.get('leisure') in ('park', 'garden', 'playground', 'pitch') or tags.get('landuse') in ('grass', 'meadow', 'recreation_ground', 'village_green', 'cemetery') or tags.get('natural') == 'grassland':
            return 'parque'
        return None
    verdes = []
    def mete(pts, t):
        if len(pts) < 3:
            return
        if min(cerca.de(x, z, RADIO_VERDES)[1] for x, z in pts[::max(1, len(pts) // 24)]) > RADIO_VERDES:
            return
        verdes.append({'t': t, 'p': [[round(x, 1), round(z, 1)] for x, z in pts]})
    for w in mapa.vias.values():
        t = tipo(w.get('tags', {}))
        g = mapa.geo(w)
        if t and len(g) > 3 and g[0] == g[-1]:
            mete(poligono(g, proy), t)
    for r in mapa.rels.values():
        tags = r.get('tags', {})
        t = tipo(tags)
        if t and tags.get('type') == 'multipolygon':
            for anillo in mapa.contornos(r):
                mete(poligono(anillo, proy), t)
    return verdes


LUGAR = [('amenity', re.compile(r'^(place_of_worship|theatre|marketplace|townhall)$')),
         ('tourism', re.compile(r'^(museum|attraction|viewpoint|artwork)$')),
         ('historic', re.compile(r'.')), ('leisure', re.compile(r'^park$')), ('place', re.compile(r'^square$'))]


def trae_lugares(cerca, proy, mapa):
    lugares, vistos = [], set()
    for el in [*mapa.nodos.values(), *mapa.vias.values(), *mapa.rels.values()]:
        tags = el.get('tags')
        if not tags or not tags.get('name'):
            continue
        if not any(k in tags and pat.search(tags[k]) for k, pat in LUGAR):
            continue
        nombre = tags['name']
        if nombre in vistos:
            continue
        c = mapa.centro(el)
        if not c:
            continue
        x, z = proy(*c)
        s_, d = cerca.de(x, z, RADIO_LUGARES + 10)
        if d > RADIO_LUGARES + 10:
            continue
        vistos.add(nombre)
        tipo = next((tags[k] for k in ('amenity', 'tourism', 'leisure', 'place', 'historic') if k in tags), 'lugar')
        lugares.append([round(s_, 1), round(x, 1), round(z, 1), nombre, tipo])
    lugares.sort()
    return lugares


def rejilla(cerca, puntos, inv, y0):
    """El terreno de verdad alrededor del trazado: una altura cada
    PASO_TERRENO metros, hasta RADIO_TERRENO del trazado (null más allá)."""
    xs = [p[0] for p in puntos]; zs = [p[1] for p in puntos]
    x0 = math.floor((min(xs) - RADIO_TERRENO) / PASO_TERRENO) * PASO_TERRENO
    z0 = math.floor((min(zs) - RADIO_TERRENO) / PASO_TERRENO) * PASO_TERRENO
    nx = math.ceil((max(xs) + RADIO_TERRENO - x0) / PASO_TERRENO) + 1
    nz = math.ceil((max(zs) + RADIO_TERRENO - z0) / PASO_TERRENO) + 1
    celdas = []
    for k in range(nz):
        for i in range(nx):
            x, z = x0 + i * PASO_TERRENO, z0 + k * PASO_TERRENO
            if cerca.de(x, z, RADIO_TERRENO + PASO_TERRENO)[1] <= RADIO_TERRENO + PASO_TERRENO:
                celdas.append((k * nx + i, inv(x, z)))
    ys = alturas([ll for _, ll in celdas])
    y = [None] * (nx * nz)
    for (q, _), h in zip(celdas, ys):
        if h is not None:
            y[q] = round(h - y0, 1)
    return {'x0': x0, 'z0': z0, 'paso': PASO_TERRENO, 'nx': nx, 'nz': nz, 'y': y}


def en_rejilla(t, x, z):
    """La altura de la rejilla en (x, z), bilineal; None si cae fuera."""
    fx, fz = (x - t['x0']) / t['paso'], (z - t['z0']) / t['paso']
    i, k = math.floor(fx), math.floor(fz)
    if not (0 <= i < t['nx'] - 1 and 0 <= k < t['nz'] - 1):
        return None
    a, b = t['y'][k * t['nx'] + i], t['y'][k * t['nx'] + i + 1]
    c, d = t['y'][(k + 1) * t['nx'] + i], t['y'][(k + 1) * t['nx'] + i + 1]
    if None in (a, b, c, d):
        return None
    u, v = fx - i, fz - k
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v


def escribe_indice():
    ids = sorted(f.stem for f in SALIDA.glob('*.json') if f.stem != 'indice')
    (SALIDA / 'indice.json').write_text(json.dumps(ids, ensure_ascii=False) + '\n', encoding='utf-8')


def receta_a_json(id_, receta, con_altura=True, con_edificios=True, overpass=False):
    print(f'{id_}: bajando el mapa…', file=sys.stderr)
    mapa = Mapa(overpass)
    lats = [p[0] for p in receta['pasos']]; lons = [p[1] for p in receta['pasos']]
    mapa.cubre(min(lats) - MARGEN, min(lons) - MARGEN, max(lats) + MARGEN, max(lons) + MARGEN)
    vias = trae_calles(receta, mapa)
    print(f'  {len(vias)} tramos de calle', file=sys.stderr)
    xs, nombres, (lat0, lon0), proy, propias = cose(vias, receta['pasos'], receta.get('cerrada', False))
    puntos, calles, largo = remuestrea(xs, nombres, PASO)
    print(f'  {largo:.0f} m, {len(puntos)} puntos, calles: {", ".join(c[1] for c in calles)}', file=sys.stderr)
    kx = 111320 * math.cos(math.radians(lat0))
    inv = lambda x, z: (lat0 - z / 110540, lon0 + x / kx)  # noqa: E731
    # Lo de alrededor tiene que estar en el mapa: las teselas que toca el
    # trazado con su margen.
    m = max(RADIO_VERDES, RADIO_VIAS, RADIO_EDIFICIOS) + 20
    ll = [inv(x, z) for x, z in puntos]
    dlat, dlon = m / 110540, m / kx
    mapa.cubre(min(p[0] for p in ll) - dlat, min(p[1] for p in ll) - dlon, max(p[0] for p in ll) + dlat, max(p[1] for p in ll) + dlon)
    ys = alturas(ll) if con_altura else [0.0] * len(puntos)
    ys = [y if y is not None else 0.0 for y in ys]
    y0 = ys[0]
    cerca = Cerca(puntos)
    edificios, lugares, vias_cerca, verdes, terreno = [], [], [], [], None
    if con_altura:
        print('  el terreno alrededor…', file=sys.stderr)
        terreno = rejilla(cerca, puntos, inv, y0)
    if con_edificios:
        print('  edificios, calles, verdes y lugares…', file=sys.stderr)
        edificios = trae_edificios(cerca, proy, mapa)
        vias_cerca = trae_vias(cerca, proy, mapa, propias)
        verdes = trae_verdes(cerca, proy, mapa)
        lugares = trae_lugares(cerca, proy, mapa)
        # El suelo de cada edificio, del mismo modelo de terreno.
        if terreno:
            for e in edificios:
                y = en_rejilla(terreno, *e['_c'])
                if y is not None:
                    e['y'] = round(y, 1)
        for e in edificios:
            del e['_c']
        print(f'  {len(edificios)} edificios, {len(vias_cerca)} calles cerca, {len(verdes)} verdes, {len(lugares)} lugares: '
              f'{", ".join(l[3] for l in lugares[:8])}', file=sys.stderr)
    salida = {
        'id': id_, 'origen': [lat0, lon0], 'largo': round(largo, 1), 'cerrada': receta.get('cerrada', False),
        'puntos': [[round(x, 2), round(z, 2), round(y - y0, 2)] for (x, z), y in zip(puntos, ys)],
        'calles': calles,
        'edificios': edificios,
        'vias': vias_cerca,
        'verdes': verdes,
        'lugares': lugares,
    }
    if terreno:
        salida['terreno'] = terreno
    SALIDA.mkdir(exist_ok=True)
    (SALIDA / f'{id_}.json').write_text(json.dumps(salida, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    escribe_indice()
    print(f'  → pistas/{id_}.json (baja {y0 - min(ys):.0f} m, sube {max(ys) - y0:.0f} m)', file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('recetas', nargs='*', help=' '.join(RECETAS))
    ap.add_argument('--todas', action='store_true')
    ap.add_argument('--sin-altura', action='store_true')
    ap.add_argument('--sin-edificios', action='store_true')
    ap.add_argument('--overpass', action='store_true', help='el mapa por Overpass en vez de la API de OSM')
    a = ap.parse_args()
    ids = list(RECETAS) if a.todas else a.recetas
    if not ids:
        ap.error('di qué receta, o --todas')
    for id_ in ids:
        if id_ not in RECETAS:
            sys.exit(f'no hay receta «{id_}»; hay: {", ".join(RECETAS)}')
        receta_a_json(id_, RECETAS[id_], not a.sin_altura, not a.sin_edificios, a.overpass)


if __name__ == '__main__':
    main()
