# Las calles de verdad

Aquí van los trazados reales de Quito, uno por archivo, que escribe
`tools/calles.py` a partir de OpenStreetMap y de un modelo de terreno (Open
Topo Data, SRTM de 30 m). Todas las pistas del juego corren por ellos:

| Archivo | Pista | Por dónde |
|---|---|---|
| `panecillo.json` | La bajada del Panecillo | la Melchor de Aymerich, la Necochea, la Mariscal Sucre, la Chimborazo, la Barahona, la Ambato y la García Moreno hasta la Plaza Grande (2,3 km) |
| `subida.json` | La subida del Panecillo | la Melchor de Aymerich hasta la Virgen (se sale a los 420 m) |
| `panecillo-vuelta.json` | La vuelta al Panecillo | la vuelta de la Melchor de Aymerich alrededor de la Virgen, con la horquilla en V del cruce (659 m) |
| `guapulo.json` | La cuesta de Guápulo | el Pasaje Stubel, la Rafael León Larrea, el Camino de Orellana y la Leonidas Plaza hasta el santuario (1,3 km, 159 m abajo) |
| `sanjuan.json` | La bajada de San Juan | la Venezuela desde la Basílica, la Rocafuerte y la Benalcázar junto a San Francisco (1,8 km) |
| `centro-vuelta.json` | La vuelta a la Plaza Grande | Venezuela, Espejo, García Moreno y Mejía: dos manzanas con la plaza dentro (576 m) |
| `tobogan.json` | La bajada grande | la Olmedo hasta el Teatro Sucre, la Guayaquil, la Manabí de vuelta arriba y la Cuenca (991 m) |

```
python3 tools/calles.py panecillo        # → pistas/panecillo.json
python3 tools/calles.py --todas
```

El mapa sale de la API principal de OpenStreetMap (`/api/0.6/map`), en
teselas de ~670 m que se guardan en `~/.cache/coches-calles`; con
`--overpass` sale de Overpass. Las alturas también se guardan ahí: la segunda
vez no se pide nada.

Cada JSON trae los puntos en metros (`x` al este, `z` al sur, `y` hacia
arriba, relativa al primero), cada ~5 m, dónde empieza cada calle y lo que
hay alrededor:

```json
{ "id": "panecillo", "origen": [lat, lon], "largo": 2342.2, "cerrada": false,
  "puntos": [[x, z, y], ...], "calles": [[0, "Melchor de Aymerich"], ...],
  "edificios": [{ "p": [[x, z], ...], "h": 9.6, "y": -12.4, "tipo": "casa" }, ...],
  "vias": [{ "t": "residential", "n": "Chile", "s": "piedra", "p": [[x, z], ...] }, ...],
  "verdes": [{ "t": "parque", "p": [[x, z], ...] }, ...],
  "terreno": { "x0": -360, "z0": -900, "paso": 30, "nx": 54, "nz": 47, "y": [12.5, null, ...] },
  "lugares": [[340, x, z, "Iglesia de La Compañía", "place_of_worship"], ...] }
```

- Los **edificios** son los de OpenStreetMap a 90 m del trazado: su planta,
  su altura (`height`, o los pisos × 3,2 m, o según su tipo) y su suelo. El
  juego los levanta en 3D con ventanas por piso y techo de teja o de losa,
  los baja hasta el suelo de verdad, corre hacia atrás los que se meten en la
  calle y pinta la fachada de los que tienen nombre (la Catedral, la Compañía,
  el Palacio, San Francisco, el santuario de Guápulo).
- Las **vías** son las otras calles a 130 m: se dibujan sobre el terreno, y
  donde llegan a la pista dejan su bocacalle abierta.
- Los **verdes** son los parques, bosques y plazas a 160 m: tiñen el terreno
  y llevan árboles.
- El **terreno** es una rejilla de alturas cada 30 m hasta 330 m del trazado,
  más allá de la niebla: el juego levanta con ella un suelo continuo, cosido a
  la calle, para que no se vean agujeros. Donde no hay casa de verdad delante,
  pone una de la maqueta; más allá de las casas, bloques de ciudad.
- Los **lugares** con nombre (iglesias, plazas, parques, museos, miradores)
  se anuncian al pasar, igual que el nombre de cada calle.

`indice.json` es la lista de trazados que hay; la escribe el programa y es lo
único que el juego pide al cargar. Una pista con `real: 'x'` usa `x.json` si
está en el índice; si no, sus `tramos` a mano (o lo generado en código).

Las zonas (cómo es la calle y qué hay a los lados) salen del nombre de cada
calle con `callesZonas: [[expresión, zona], ...]` (la última es la de por
defecto), de los metros con `zonas: [[zona, metro], ...]`, o de las dos:
`zonasExtra` pone zonas por metro encima de las de los nombres. Las esquinas
de OpenStreetMap se redondean (unos 13 m de radio) y, tras la meta, la calle
sigue 110 m recta para frenar.

Si el trazado es `cerrada` y la pista dice `vueltas: n`, es un circuito: la
vuelta se repite, el decorado se arma una sola vez y lo que hay en la calle
(puestos, rampas, coladas) está en cada vuelta. Con `desfase: m`, la línea va
m metros más allá del primer punto, para no salir en plena esquina.

Las recetas (qué calles y por dónde) están en el propio `tools/calles.py`.
