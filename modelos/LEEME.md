# De dónde salen los modelos

Ninguno se hizo para este juego: vienen de otros dos juegos de la casa, que
comparten esqueleto (los mismos nombres de huesos, `headfront` incluido) y por
eso se pueden mezclar.

| Archivo | Viene de | Para qué |
|---|---|---|
| `base-chico.glb`, `base-chica.glb` | [Modo Incógnito](https://github.com/franciscombp/modo-incognito) (`public/models/`) | la tripulación: conductor y empujador. Vienen sin textura y el juego los pinta por vértice con los colores de cada coche |
| `generico.glb`, `policia.glb`, `ministro.glb` | [Estado Decepción](https://github.com/franciscombp/estadodecepcion) (`public/modelos/personajes/`) | la gente que se cruza |
| `animaciones.glb` | Estado Decepción (`public/modelos/`) | los clips: `montado`, `correr`, `rol`, `golpe`, `salto`, `arrancar` |
| `quito.glb` | Estado Decepción (`public/modelos/`) | las dieciséis casas coloniales, los puestos y los cajones |

Los cuerpos de Modo Incógnito son obra de su equipo (César, Manu y Fran). De
Estado Decepción se usan solo personajes genéricos: los periodistas de su
redacción no salen aquí.

## Las parejas

Ningún personaje tiene modelo propio: todos son uno de los dos cuerpos base,
pintado por vértice, con piezas hechas en código y enganchadas a un hueso
(`PIEZA` en `coches.js`): el capirote del cucurucho, el sombrero de Cantuña,
los cuernos y la cola del diablo, la cresta, el pico y las plumas del gallo,
el tricornio, la nariz y la botella de Don Ramón, el fusil y la trenza de
las guarichas, el tocado y la muñeca de la Mamá Negra, las alas y la
estrella del Ángel. Se colocan en reposo, midiendo la cabeza con los huesos
`Head`, `head_end` y `headfront`, y desde ahí siguen cualquier pose.

La Mamá Negra va con la piel de la misma paleta que el resto: se la
reconoce por el traje, el tocado de cintas y la muñeca, no por la cara
pintada de negro.

Si uno de los dos juegos retoca un modelo, aquí no cambia solo: hay que volver
a copiarlo.
