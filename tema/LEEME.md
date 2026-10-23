# La piel de Coches de madera

Variante del tema `juegos` de [mal-ds](../../ds/). No es un sistema aparte:
hereda todo `mal.css` —roles, escala, componentes— y le cambia la piel para
que parezca un juego de karts de PlayStation (Crash Team Racing, Sonic R):
letras gordas, amarillas y en cursiva con contorno de tinta; paneles azul
noche un poco torcidos; botones naranja que brillan al elegirlos; rayos
detrás de todo lo que se gana.

```html
<html lang="es" data-marca="juegos" data-variante="coches" data-tema="claro">
<link rel="stylesheet" href="../ds/mal/mal.css">
<link rel="stylesheet" href="coches.css">        <!-- la maqueta del juego -->
<link rel="stylesheet" href="tema/tema.css">     <!-- la piel: va al final -->
```

`data-tema="claro"` porque el mundo 3D es de día; los paneles son oscuros
por decisión propia, no por el tema del sistema.

## Qué cambia

| Capa | En `juegos` | En `coches` |
|---|---|---|
| Marca | rosa mexicano y talavera, en degradado holográfico | naranja con brillo arriba; azul para lo secundario; amarillo para lo elegido |
| Superficies | crema y blanco | azul noche con rayas diagonales casi invisibles |
| Tinta | `#2b2129` | `#180D3A`: el contorno de todas las letras |
| Display | Syne 800 | **Bangers**: cómic y kart, siempre en mayúsculas y con contorno |
| Rótulos | JetBrains Mono | **Bungee**: letra de letrero |
| Texto | Inter | Inter (igual) |
| Forma | radio ×1,3, borde 2 px | borde de tinta de 3 px, todo inclinado (`skewX(-6deg)`) y los paneles girados −1,2° |
| Sombra | dura, en rosa | dura, en tinta: el botón se hunde hasta ella al pulsar |

## Las piezas

- **Pantalla de título**: el logo con degradado amarillo‑naranja y contorno
  (por `background-clip:text` + `drop-shadow`), «pulsa una tecla» parpadeando
  y el pie, sobre el sobrevuelo de la pista.
- **Panel**: caja de noche, girada, con el banderín naranja del título
  colgando por encima del borde. El scroll lo hace la capa, no el panel,
  para que el banderín sobresalga.
- **Botones**: inclinados; el que arranca, naranja; el resto, azul. Al
  elegirlos con el teclado, un triángulo amarillo late a su izquierda.
- **Fichas**: azules; la elegida, amarilla; las cerradas, a rayas.
- **Cualidades**: tacos de cian inclinados.
- **Premio**: rayos amarillos sobre morado y un disco de oro.
- **Podio**: los tres primeros sobre tarjetas de noche; el tuyo, amarillo.
- **HUD**: el puesto enorme con «º», el tiempo en una píldora de tinta, la
  velocidad y las etiquetas inclinadas; los mandos, discos azules y uno
  naranja.
- **Cuenta atrás**: 3 rojo, 2 amarillo, 1 verde y «¡A bajar!» cian.

## Las fuentes

En `fuentes/`, subconjunto latin de Google Fonts, con su licencia al lado:

- Bangers, de Vernon Adams — SIL Open Font License 1.1.
- Bungee, de David Jonathan Ross — SIL Open Font License 1.1.

Ninguna de las dos trae flechas: donde hay teclas (← →) se queda Inter.
