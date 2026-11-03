# Coches de madera

Juego de carreras de las fiestas de Quito. Se sirve en `una.red/coches/` (Cloudflare lo lee de
este repo, publicado en GitHub Pages). Los enlaces relativos (`../ds/`, `../perfil/`,
`../favicon.svg`) suponen ese origen: el perfil compartido y el sistema de diseño salen de `una.red`.

- `tools/sella-coches.py`: sella el CSS, el JS y los modelos con un hash. Lo corre el hook de commit
  (`git config core.hooksPath .githooks`, una vez por clon).
- `tools/calles.py`: trae las calles de OpenStreetMap para `pistas/`.
