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
  "puntos": [[x, z, y], ...], "calles": [[0, "Avenida General Melchor de Benavides"], ...] }
```

En `coches.js`, una pista los usa con `real: 'panecillo'` en vez de `tramos`,
y pone sus zonas por metro: `zonas: [['panecillo', 0], ['ambato', 620], ...]`.
Si el trazado es `cerrada` y la pista dice `vueltas: 3`, es un circuito: la
vuelta se repite tres veces, el decorado se arma una sola vez y lo que hay en
la calle (puestos, rampas, coladas) está en cada vuelta.

Las recetas (qué calles y por dónde) están en el propio `tools/calles.py`.
