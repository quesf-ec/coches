# La piel de Coches de madera

Variante del tema `juegos` de [mal-ds](../../ds/). No es un sistema aparte:
hereda todo `mal.css` —roles, escala, componentes— y cambia solo lo que
hace falta para que el juego parezca hecho de lo mismo que su mundo:
**madera, cal y pintura de fiesta**.

```html
<html lang="es" data-marca="juegos" data-variante="coches" data-tema="claro">
<link rel="stylesheet" href="../ds/mal/mal.css">
<link rel="stylesheet" href="coches.css">        <!-- la maqueta del juego -->
<link rel="stylesheet" href="tema/tema.css">     <!-- la piel: va al final -->
```

`data-tema="claro"` es parte del trato: la carrera es de día y la variante
no tiene versión oscura.

## Qué cambia

| Capa | En `juegos` | En `coches` |
|---|---|---|
| Marca | rosa mexicano y talavera, en degradado holográfico | rojo y azul de las banderitas de las Fiestas, pintados sobre madera |
| Fondo y superficies | crema y blanco | cal de las fachadas (`#FFF8EA`) y cal tostada |
| Tinta | `#2b2129` | `#2A2118`, la del contorno de los dibujos del juego |
| Display | Syne 800 | **Lilita One**: gorda, redonda, se lee en movimiento |
| Rótulos | JetBrains Mono | **Bungee**: letra de letrero pintado |
| Texto | Inter | Inter (igual) |
| Forma | radio ×1,3, borde 2 px | radio ×0,6, borde de tinta de 3 px: tablas, no plástico |
| Sombra | dura, en rosa | dura, en tinta: la tabla se hunde hasta ella al pulsar |

## Los materiales

Todo sale de tres variables, sin una sola imagen:

- `--madera` y `--madera-media`: la veta son dos rayados de periodo
  distinto (para que no se vea la repetición) sobre el color de la tabla
  del coche (`#C8955A`).
- `--rodaja`: un tronco cortado, anillos con `repeating-radial-gradient`.
  Es el disco del premio.
- `--banderitas`: las banderas que cruzan la calle, cuatro conos con
  `conic-gradient`. Van en el `kicker` y arriba de la portada.
- `--clavo`: los cuatro clavos del letrero, como fondo, para que no se
  muevan cuando el panel hace scroll.

## Las piezas

- **Letrero** (`.coches-panel`): papel de cal en un marco de madera con
  cuatro clavos.
- **Botones**: tablas de madera clara; el de arrancar, pintado de rojo.
- **Fichas**: etiquetas de cal; la elegida, pintada de azul (el rojo queda
  para el botón que arranca); las cerradas, con raya discontinua.
- **Cualidades** (`.medidor`): tacos de madera llenos de ocre.
- **Premio**: rayos rojos y azules y una rodaja de tronco de disco.
- **HUD**: cifras en Lilita con borde de tinta, etiquetas en Bungee, el
  carril de la carrera de madera y los mandos como perillas.
- **Cuenta atrás**: 3 en rojo, 2 en ocre, 1 en azul y «¡A bajar!» en verde.

## Las fuentes

En `fuentes/`, subconjunto latin de Google Fonts, con su licencia al lado:

- Lilita One, de Juan Montoreano — SIL Open Font License 1.1.
- Bungee, de David Jonathan Ross — SIL Open Font License 1.1.

Bungee no trae flechas: donde hay teclas (← →) se queda Inter.
