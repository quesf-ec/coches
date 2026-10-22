"""Sella el CSS, el JS y los modelos de coches/ con un sello de su contenido.

El sello es un hash de todo lo que hay en coches/ salvo index.html. Así cambia
solo cuando cambia el juego, y cada versión nueva pide sus archivos con URL
nueva: los navegadores no se quedan con la versión anterior.

Lo corre el hook de commit (.githooks/pre-commit). Para activarlo, una vez por
clon:  git config core.hooksPath .githooks

Uso: python3 tools/sella-coches.py   (reescribe coches/index.html si hace falta)
"""
import hashlib
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
JUEGO = RAIZ / 'coches'
PAGINA = JUEGO / 'index.html'
PATRON = re.compile(r'(coches\.(?:css|js))\?v=[^"\']*')


def sello():
    h = hashlib.sha256()
    for f in sorted(p for p in JUEGO.rglob('*') if p.is_file() and p != PAGINA):
        h.update(str(f.relative_to(JUEGO)).encode())
        h.update(f.read_bytes())
    return h.hexdigest()[:10]


def main():
    s = sello()
    texto = PAGINA.read_text(encoding='utf-8')
    nuevo, n = PATRON.subn(lambda m: f'{m.group(1)}?v={s}', texto)
    if n != 2:
        sys.exit(f'coches/index.html: se esperaban 2 referencias a coches.css/js y hay {n}')
    if nuevo != texto:
        PAGINA.write_text(nuevo, encoding='utf-8')
        print(f'sello de coches/: {s} (actualizado)')
        return
    print(f'sello de coches/: {s} (sin cambios)')


if __name__ == '__main__':
    main()
