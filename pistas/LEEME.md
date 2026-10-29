# Las calles de verdad

Aquí van los trazados reales de Quito, uno por archivo, que escribe
`tools/calles.py` a partir de OpenStreetMap (Overpass) y de un modelo de
terreno (Open Topo Data, SRTM de 30 m):

```
python3 tools/calles.py panecillo        # → coches/pistas/panecillo.json
python3 tools/calles.py --todas
```

Cada JSON trae los puntos en metros (`x` al este, `z` al sur, `y` hacia
arriba, relativa al primero), cada ~5 m, más dónde empieza cada calle:

```json
{ "id": "panecillo", "origen": [lat, lon], "largo": 2310.5, "cerrada": false,
  "puntos": [[x, z, y], ...], "calles": [[0, "Avenida General Melchor de Benavides"], ...],
  "edificios": [{ "p": [[x, z], ...], "h": 9.6, "y": -12.4, "tipo": "casa" }, ...],
  "lugares": [[340, x, z, "Iglesia de La Compañía", "place_of_worship"], ...] }
```

Los **edificios** son los de OpenStreetMap a 70 m del trazado: su planta,
su altura (`height`, o los pisos × 3,2 m, o según su tipo) y su suelo. El
juego los levanta en 3D con ventanas por piso y techo de teja o de losa, y
corre hacia atrás los que se meten en la calle. Con edificios de verdad ya
no pone casas inventadas. Los **lugares** con nombre (iglesias, plazas,
parques, museos, miradores) se anuncian al pasar, igual que el nombre de
cada calle, que sale en la placa azul de la esquina.

`indice.json` es la lista de trazados que hay; la escribe el programa y es
lo único que el juego pide al cargar. Una pista con `real: 'x'` usa
`x.json` si está en el índice; si no, sus `tramos` a mano (o lo generado en
código), y si no tiene nada, no sale en la lista.

Con `callesZonas: [[expresión, zona], ...]` las zonas salen solas del nombre
de cada calle (la última es la de por defecto); así una pista hecha a mano
pasa a la calle de verdad sin tocar nada más.

En `coches.js`, una pista los usa con `real: 'panecillo'` en vez de `tramos`,
y pone sus zonas por metro: `zonas: [['panecillo', 0], ['ambato', 620], ...]`.
Si el trazado es `cerrada` y la pista dice `vueltas: 3`, es un circuito: la
vuelta se repite tres veces, el decorado se arma una sola vez y lo que hay en
la calle (puestos, rampas, coladas) está en cada vuelta.

Las recetas (qué calles y por dónde) están en el propio `tools/calles.py`.
