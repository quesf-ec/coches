/* Coches de madera · la bajada del Panecillo, en 3D.

   Lo gracioso de un coche de madera no es la velocidad: es que van dos. Uno
   maneja con los pies y la soga; el otro empuja, se trepa atrás cuando la
   cosa ya rueda y se baja a empujar en las subidas. Si se baja cuando no
   debe, se queda corriendo detrás. Y en las rampas, en los huecos y contra
   los puestos de la vereda, se caen los dos.

   El mundo: una calle que sigue una línea central muestreada cada metro,
   con su rumbo, su curvatura, su altura y su ancho. Todo lo demás —el
   asfalto, las veredas, las casas, los faroles, los coches y la gente— se
   coloca en coordenadas de calle: `s` (metros recorridos) y `x` (metros a
   la derecha del centro). No hay motor de física: la cuesta empuja, el
   roce y el aire frenan, y las caídas son tumbos animados a mano.

   Los modelos:
   · la tripulación, con los dos cuerpos base de Modo Incógnito (cabezones,
     sin textura, se pintan por vértice con los colores de cada coche);
   · la gente que se cruza, con el genérico, el policía y el ministro de
     Estado Decepción;
   · las animaciones (montado, correr, rol, golpe, salto), de Estado
     Decepción, que comparte esqueleto con los de Modo Incógnito;
   · las casas coloniales y los puestos, de la maqueta de Quito de Estado
     Decepción (quito.glb). */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as clonaEsqueleto } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Los modelos se piden con el mismo sello que trae este módulo: si la página
// estrena versión, estrenan URL también ellos.
const SELLO = new URL(import.meta.url).search;
const modeloUrl = (n) => new URL(`modelos/${n}.glb${SELLO}`, import.meta.url).href;

// ─── la física, en metros y segundos ───────────────────────────────
const G = 9.8;
const CUESTA = 1.25;          // la cuesta tira un poco más que en la vida: es un juego
const ROCE = 0.15;            // rulimanes contra el asfalto…
const ROCE_PIEDRA = 0.22;     // …y contra el empedrado, que frena y traquetea
const AIRE = 0.0032;
const TOPE = 22;              // ~80 km/h, lo más que da una cuesta
const TOPE_TURBO = 25;
const EMPUJE = 3.6;           // lo que empuja el que va atrás…
const CORRE = 7.5;            // …y lo más rápido que corre: más allá, no alcanza
const FRENO = 7;
const FUERA = 4;              // la vereda frena
const GIRO = 0.42;            // el volante: metros de lado por cada m/s
const CENTRIFUGA = 0.62;      // la curva te saca a v² · curvatura
const KAPPA = 0.008;          // de «curva 7» a curvatura en 1/m
const ACERA = 1.6;
const BORDILLO = 0.13;
const TABLA = 0.24;           // altura de la tabla sobre la calle
const ADULTO = 1.68;

const $ = (s) => document.querySelector(s);
const limita = (v, a, b) => Math.min(Math.max(v, a), b);
const mezcla = (a, b, p) => a + (b - a) * p;
const suave = (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);
const quieto = matchMedia('(prefers-reduced-motion: reduce)');
const tactilMQ = matchMedia('(pointer: coarse)');

function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const elige = (r, lista) => lista[Math.floor(r() * lista.length)];

// ─── los pintores de lienzo (fachadas, carteles, la Virgen) ────────
function lienzo(w, h, pinta) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  pinta(c.getContext('2d'), w, h);
  return c;
}
const TINTA = '#2A2118';
function cupula(c, x, y, r, color, linterna) {
  c.fillStyle = color; c.beginPath(); c.arc(x, y, r, Math.PI, 0); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2;
  for (let k = -2; k <= 2; k++) { c.beginPath(); c.ellipse(x, y, Math.abs(k) * r / 3, r, 0, Math.PI, 0); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.ellipse(x - r * 0.35, y - r * 0.55, r * 0.18, r * 0.3, -0.5, 0, 7); c.fill();
  c.fillStyle = linterna; c.fillRect(x - r * 0.14, y - r - r * 0.32, r * 0.28, r * 0.34);
  c.beginPath(); c.arc(x, y - r - r * 0.32, r * 0.16, Math.PI, 0); c.fill();
  c.strokeStyle = TINTA; c.lineWidth = 3;
  c.beginPath(); c.moveTo(x, y - r - r * 0.5); c.lineTo(x, y - r - r * 0.85); c.moveTo(x - r * 0.1, y - r - r * 0.72); c.lineTo(x + r * 0.1, y - r - r * 0.72); c.stroke();
}

function arcos(c, x0, y, ancho, alto, n, fondo) {
  const paso = ancho / n;
  c.fillStyle = fondo;
  for (let k = 0; k < n; k++) {
    const cx = x0 + paso * k + paso / 2, rw = paso * 0.34;
    c.beginPath(); c.moveTo(cx - rw, y); c.lineTo(cx - rw, y - alto + rw); c.arc(cx, y - alto + rw, rw, Math.PI, 0); c.lineTo(cx + rw, y); c.fill();
  }
}

// La Compañía: fachada de piedra labrada y la cúpula dorada detrás.
const compania = () => lienzo(440, 560, (c, w, h) => {
  cupula(c, w / 2, 190, 112, '#D9A93A', '#C8952A');
  cupula(c, 70, 250, 40, '#C8952A', '#B07E22');
  cupula(c, w - 70, 250, 40, '#C8952A', '#B07E22');
  c.fillStyle = '#A8977A'; c.fillRect(20, 230, w - 40, h - 230);
  c.fillStyle = '#B9A88A'; c.beginPath(); c.moveTo(60, 230); c.lineTo(w / 2, 168); c.lineTo(w - 60, 230); c.fill();
  // las columnas salomónicas, con su vuelta dorada
  for (const x of [60, 120, w - 120, w - 60]) {
    c.fillStyle = '#8E7D60'; c.fillRect(x - 11, 270, 22, h - 300);
    c.strokeStyle = '#D9A93A'; c.lineWidth = 3;
    for (let y = 274; y < h - 34; y += 16) { c.beginPath(); c.moveTo(x - 11, y); c.lineTo(x + 11, y + 10); c.stroke(); }
  }
  c.fillStyle = '#5A3A1E'; c.beginPath(); c.moveTo(w / 2 - 44, h); c.lineTo(w / 2 - 44, h - 120); c.arc(w / 2, h - 120, 44, Math.PI, 0); c.lineTo(w / 2 + 44, h); c.fill();
  c.strokeStyle = '#D9A93A'; c.lineWidth = 4; c.stroke();
  c.fillStyle = '#6E5E44'; c.beginPath(); c.arc(w / 2, 300, 26, 0, 7); c.fill();
  c.strokeStyle = '#D9A93A'; c.stroke();
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(20, h - 18, w - 40, 18);
});

// Las dos torres blancas, como las de San Francisco.
const torres = () => lienzo(460, 600, (c, w, h) => {
  const torre = (x) => {
    c.fillStyle = '#F1EEE6'; c.fillRect(x, 120, 110, h - 120);
    c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(x + 84, 120, 26, h - 120);
    arcos(c, x + 12, 220, 86, 70, 2, '#3B3633');
    arcos(c, x + 12, 340, 86, 58, 2, '#3B3633');
    c.fillStyle = '#E9E4D8'; c.beginPath(); c.moveTo(x - 6, 124); c.lineTo(x + 55, 40); c.lineTo(x + 116, 124); c.fill();
    c.fillStyle = '#3F6F8F'; c.beginPath(); c.arc(x + 55, 60, 18, Math.PI, 0); c.fill();
    c.strokeStyle = TINTA; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 55, 42); c.lineTo(x + 55, 14); c.moveTo(x + 46, 24); c.lineTo(x + 64, 24); c.stroke();
  };
  torre(10); torre(w - 120);
  c.fillStyle = '#F6F3EC'; c.fillRect(120, 230, w - 240, h - 230);
  c.fillStyle = '#E9E4D8'; c.beginPath(); c.moveTo(114, 234); c.lineTo(w / 2, 170); c.lineTo(w - 114, 234); c.fill();
  c.fillStyle = '#C9C2B4'; c.beginPath(); c.arc(w / 2, 300, 30, 0, 7); c.fill();
  c.fillStyle = '#3F6F8F'; c.beginPath(); c.arc(w / 2, 300, 20, 0, 7); c.fill();
  c.fillStyle = '#5A3A1E'; c.beginPath(); c.moveTo(w / 2 - 50, h); c.lineTo(w / 2 - 50, h - 130); c.arc(w / 2, h - 130, 50, Math.PI, 0); c.lineTo(w / 2 + 50, h); c.fill();
  c.fillStyle = '#B5AE9F'; c.fillRect(0, h - 26, w, 26);
  c.fillStyle = 'rgba(0,0,0,.15)'; for (let y = h - 26; y < h; y += 7) c.fillRect(0, y, w, 2);
});

// La Catedral: muro blanco largo, cúpulas de azulejo verde y el campanario.
const catedral = () => lienzo(560, 420, (c, w, h) => {
  cupula(c, 330, 150, 70, '#2F7D5B', '#D9A93A');
  cupula(c, 200, 170, 44, '#2F7D5B', '#D9A93A');
  c.fillStyle = '#F4F1EA'; c.fillRect(440, 30, 90, h - 30);
  arcos(c, 450, 120, 70, 60, 1, '#3B3633');
  c.fillStyle = '#A8442C'; c.beginPath(); c.moveTo(434, 34); c.lineTo(485, 0); c.lineTo(536, 34); c.fill();
  c.fillStyle = '#F7F4ED'; c.fillRect(0, 170, 450, h - 170);
  c.fillStyle = '#A8442C'; c.fillRect(0, 160, 450, 14);
  arcos(c, 10, h - 30, 430, 120, 6, '#4A403A');
  c.fillStyle = 'rgba(0,0,0,.06)'; c.fillRect(0, 170, 450, 10);
  c.fillStyle = '#B5AE9F'; c.fillRect(0, h - 30, w, 30);
});

// Carondelet: la arquería blanca y la bandera arriba.
const palacio = () => lienzo(600, 380, (c, w, h) => {
  c.fillStyle = '#F7F5F0'; c.fillRect(0, 90, w, h - 90);
  c.fillStyle = '#E5E0D4'; c.fillRect(0, 84, w, 14);
  c.strokeStyle = TINTA; c.lineWidth = 4; c.beginPath(); c.moveTo(w / 2, 90); c.lineTo(w / 2, 0); c.stroke();
  c.fillStyle = '#F5C518'; c.fillRect(w / 2 + 2, 4, 64, 22);
  c.fillStyle = '#1F4E9E'; c.fillRect(w / 2 + 2, 26, 64, 11);
  c.fillStyle = '#D6382B'; c.fillRect(w / 2 + 2, 37, 64, 11);
  for (let k = 0; k < 9; k++) {
    const x = 22 + k * 64;
    c.fillStyle = '#3A4A57'; c.fillRect(x, 120, 40, 60);
    c.fillStyle = '#F7F5F0'; c.fillRect(x - 6, 182, 52, 5);
    c.strokeStyle = '#4A4A4A'; c.lineWidth = 2;
    for (let b = x - 4; b < x + 46; b += 6) { c.beginPath(); c.moveTo(b, 168); c.lineTo(b, 182); c.stroke(); }
  }
  arcos(c, 0, h - 10, w, 150, 9, '#5C524A');
  c.fillStyle = '#C9C2B4'; c.fillRect(0, h - 12, w, 12);
});




// La Virgen del Panecillo: aluminio, alas abiertas, sobre el mundo.
const virgen = () => lienzo(360, 640, (c, w, h) => {
  c.fillStyle = '#8D8A85'; c.fillRect(70, h - 120, 220, 120);
  c.fillStyle = '#9E9B95'; c.fillRect(100, h - 170, 160, 54);
  c.fillStyle = '#7C7974'; for (let y = h - 120; y < h; y += 20) c.fillRect(70, y, 220, 3);
  c.fillStyle = '#AEB7BE'; c.beginPath(); c.arc(180, h - 205, 46, 0, 7); c.fill();
  c.strokeStyle = '#87929B'; c.lineWidth = 3; c.beginPath(); c.ellipse(180, h - 205, 46, 14, 0, 0, 7); c.stroke();
  c.beginPath(); c.ellipse(180, h - 205, 16, 46, 0, 0, 7); c.stroke();
  const plata = c.createLinearGradient(80, 0, 280, 0);
  plata.addColorStop(0, '#9FAAB2'); plata.addColorStop(0.5, '#E2E7EA'); plata.addColorStop(1, '#8E99A1');
  // las alas
  c.fillStyle = plata;
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(180, 240);
    c.quadraticCurveTo(180 + s * 150, 120, 180 + s * 170, 30);
    c.quadraticCurveTo(180 + s * 120, 170, 180 + s * 40, 330); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(80,90,100,.5)'; c.lineWidth = 2;
    for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(180 + s * 30, 250 + k * 10); c.lineTo(180 + s * (60 + k * 22), 80 + k * 30); c.stroke(); }
  }
  // el manto
  c.beginPath(); c.moveTo(150, 200); c.quadraticCurveTo(120, 330, 128, h - 248); c.lineTo(232, h - 248); c.quadraticCurveTo(240, 330, 210, 200); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(80,90,100,.35)';
  for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(160 + k * 10, 220); c.lineTo(140 + k * 20, h - 252); c.stroke(); }
  c.beginPath(); c.arc(180, 182, 24, 0, 7); c.fill();
  c.fillStyle = '#C9D1D6'; c.beginPath(); c.moveTo(170, 160); c.lineTo(180, 136); c.lineTo(190, 160); c.fill();
  // la corona de estrellas
  c.fillStyle = '#E2E7EA';
  for (let k = 0; k < 9; k++) { const a = Math.PI + k * Math.PI / 8; c.beginPath(); c.arc(180 + Math.cos(a) * 46, 170 + Math.sin(a) * 46, 4, 0, 7); c.fill(); }
});

const CARTELES = ['¡DALE!', 'GUAMBRA', '¡VAMOS!', 'QUITO', '¡ÑAÑO!', 'A TODO', '¡FIESTA!'];




// La colada morada: el turbo de la casa.
const colada = () => lienzo(110, 140, (c, w, h) => {
  const halo = c.createRadialGradient(w / 2, 80, 6, w / 2, 80, 56);
  halo.addColorStop(0, 'rgba(255,240,255,.9)'); halo.addColorStop(1, 'rgba(200,120,230,0)');
  c.fillStyle = halo; c.fillRect(0, 20, w, h - 20);
  c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.moveTo(30, 48); c.lineTo(80, 48); c.lineTo(72, 128); c.lineTo(38, 128); c.closePath(); c.fill();
  c.fillStyle = '#5B1F6B'; c.beginPath(); c.moveTo(32, 62); c.lineTo(78, 62); c.lineTo(72, 124); c.lineTo(38, 124); c.closePath(); c.fill();
  c.fillStyle = '#7E3593'; c.fillRect(33, 62, 44, 6);
  c.fillStyle = '#D6382B'; c.beginPath(); c.arc(46, 66, 5, 0, 7); c.arc(62, 64, 4, 0, 7); c.fill();
  c.strokeStyle = TINTA; c.lineWidth = 3; c.beginPath(); c.moveTo(30, 48); c.lineTo(38, 128); c.lineTo(72, 128); c.lineTo(80, 48); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3; c.lineCap = 'round';
  for (const x of [44, 56, 68]) { c.beginPath(); c.moveTo(x, 40); c.quadraticCurveTo(x - 6, 28, x, 18); c.stroke(); }
});

function textura(canvas, repite) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repite) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Las superficies de la calle, pintadas una vez.
function texturasSuelo() {
  const r = azar(5);
  const ruido = (c, w, h, base, n, tonos) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let k = 0; k < n; k++) { c.fillStyle = elige(r, tonos); c.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3); }
  };
  return {
    // 10 m de ancho por 8 de largo: la raya del centro, cuatro metros sí y cuatro no.
    asfalto: textura(lienzo(256, 256, (c, w, h) => {
      ruido(c, w, h, '#7C7872', 1600, ['#726E68', '#88837C', '#6A6660', '#918C84']);
      c.fillStyle = '#F2C744'; c.fillRect(w / 2 - 3, 0, 6, h / 2);
    }), true),
    // El empedrado: 2 × 2 m, piedras de 25 cm en hileras trabadas.
    adoquin: textura(lienzo(256, 256, (c, w, h) => {
      c.fillStyle = '#66584A'; c.fillRect(0, 0, w, h);
      const tonos = ['#AC9881', '#A08C76', '#B7A38C', '#97846F', '#BEAA92', '#A6937D'];
      for (let fila = 0; fila < 8; fila++) {
        const off = fila % 2 ? 16 : 0;
        for (let col = -1; col < 9; col++) {
          c.fillStyle = elige(r, tonos);
          const x = col * 32 + off + 2, y = fila * 32 + 2;
          c.beginPath(); c.roundRect(x, y, 28, 28, 7); c.fill();
          c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(x + 4, y + 4, 12, 5);
        }
      }
    }), true),
    vereda: textura(lienzo(256, 256, (c, w, h) => {
      ruido(c, w, h, '#D3CBBB', 900, ['#C9C0AE', '#DAD3C5', '#C4BBA9']);
      c.strokeStyle = 'rgba(90,80,65,.45)'; c.lineWidth = 3;
      for (let k = 0; k <= 4; k++) { c.beginPath(); c.moveTo(0, k * 64); c.lineTo(w, k * 64); c.moveTo(k * 64, 0); c.lineTo(k * 64, h); c.stroke(); }
    }), true),
    pasto: textura(lienzo(256, 256, (c, w, h) => ruido(c, w, h, '#76A04B', 2500, ['#6C9644', '#82AC55', '#668E40', '#8DB45E'])), true),
    plaza: textura(lienzo(256, 256, (c, w, h) => {
      ruido(c, w, h, '#DCD4C4', 800, ['#D2CAB9', '#E3DCCE']);
      c.strokeStyle = 'rgba(90,80,65,.35)'; c.lineWidth = 3;
      for (let k = 0; k <= 2; k++) { c.beginPath(); c.moveTo(0, k * 128); c.lineTo(w, k * 128); c.moveTo(k * 128, 0); c.lineTo(k * 128, h); c.stroke(); }
    }), true),
    madera: textura(lienzo(128, 128, (c, w, h) => {
      c.fillStyle = '#C8955A'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(110,65,25,.45)'; c.lineWidth = 2;
      for (let y = 6; y < h; y += 9) { c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(40, y - 4, 90, y + 4, w, y); c.stroke(); }
    }), true),
  };
}

// ─── la pista ──────────────────────────────────────────────────────
const ZONAS = {
  panecillo: { nombre: 'El Panecillo', calle: 'asfalto', lado: 'pasto', hw: 4.0 },
  ambato: { nombre: 'La bajada de la Ambato', calle: 'asfalto', lado: 'vereda', hw: 3.6 },
  bulevar: { nombre: 'Bulevar 24 de Mayo', calle: 'asfalto', lado: 'vereda', hw: 4.5 },
  ronda: { nombre: 'La Ronda', calle: 'adoquin', lado: 'vereda', hw: 3.4 },
  garcia: { nombre: 'La García Moreno', calle: 'adoquin', lado: 'vereda', hw: 3.4 },
  plaza: { nombre: 'Plaza Grande', calle: 'adoquin', lado: 'plaza', hw: 5.0 },
};
const CENTRO = new Set(['ambato', 'bulevar', 'ronda', 'garcia', 'plaza']);

const P = { x: [], z: [], y: [], th: [], k: [], hw: [], zona: [], pend: [] };
const tramos = [];
let N = 0, SALIDA = 0, META = 0;

function construyePista() {
  let x = 0, z = 0, y = 0, th = 0, zona = 'panecillo';
  const metro = (k, dy) => {
    P.x.push(x); P.z.push(z); P.y.push(y); P.th.push(th); P.k.push(k); P.zona.push(zona); P.hw.push(ZONAS[zona].hw);
    th -= k; x += Math.sin(th); z += Math.cos(th); y += dy;
  };
  const tramo = (ent, sost, sal, c, dy) => {
    const total = ent + sost + sal, paso = dy / total;
    for (let n = 0; n < ent; n++) metro(suave(0, c, n / ent) * KAPPA, paso);
    for (let n = 0; n < sost; n++) metro(c * KAPPA, paso);
    for (let n = 0; n < sal; n++) metro(suave(c, 0, n / sal) * KAPPA, paso);
  };
  const nueva = (zz) => { zona = zz; tramos.push({ zona: zz, i: P.x.length }); };

  nueva('panecillo');
  tramo(0, 40, 0, 0, 0);
  SALIDA = 34;
  tramo(12, 20, 12, 0, -5);
  tramo(14, 22, 14, -5, -6);
  tramo(14, 22, 14, 6, -6);
  tramo(16, 30, 16, 7, -7);       // la horquilla: se frena antes o se sale
  tramo(14, 20, 14, -5, -5);
  tramo(10, 14, 10, 2, -3);
  nueva('ambato');
  tramo(18, 80, 18, 0, -22);      // la empinada
  tramo(10, 10, 10, 0, 1.2);      // el lomo del final
  tramo(15, 24, 15, 3, -3);
  nueva('bulevar');
  tramo(18, 54, 18, -2, -3);
  tramo(15, 24, 15, 3, -1);
  nueva('ronda');
  tramo(9, 15, 9, -4, 0.8);
  tramo(9, 15, 9, 5, -2.5);
  tramo(9, 15, 9, -4, 0.6);
  tramo(9, 15, 9, 4, -2.5);
  tramo(9, 12, 9, -2, 0);
  nueva('garcia');
  tramo(12, 36, 12, 0, 2.6);      // la subida: aquí se empuja
  tramo(10, 14, 10, 3, 0);
  nueva('plaza');
  META = P.x.length + 40;
  tramo(6, 66, 6, 0, 0);
  tramo(0, 160, 0, 0, 0);
  N = P.x.length;

  // Las alturas y los anchos se suavizan: la pendiente cambia sin escalones
  // y la calle se ensancha o se estrecha a lo largo de unos metros.
  const suaviza = (arr, R, pasadas) => {
    let a = arr.slice();
    for (let p = 0; p < pasadas; p++) {
      const b = new Array(a.length);
      for (let i = 0; i < a.length; i++) {
        let t = 0, c = 0;
        for (let k = i - R; k <= i + R; k++) { t += a[limita(k, 0, a.length - 1)]; c++; }
        b[i] = t / c;
      }
      a = b;
    }
    return a;
  };
  P.y = suaviza(P.y, 12, 2);
  P.hw = suaviza(P.hw, 8, 1);
  for (let i = 0; i < N; i++) P.pend[i] = (P.y[Math.min(i + 1, N - 1)] - P.y[Math.max(i - 1, 0)]) / 2;
}

const M = { x: 0, z: 0, y: 0, th: 0, k: 0, hw: 4, zona: 'panecillo', pend: 0 };
function muestra(s) {
  const i = limita(Math.floor(s), 0, N - 2), f = limita(s - i, 0, 1);
  M.x = mezcla(P.x[i], P.x[i + 1], f); M.z = mezcla(P.z[i], P.z[i + 1], f);
  M.y = mezcla(P.y[i], P.y[i + 1], f); M.th = mezcla(P.th[i], P.th[i + 1], f);
  M.k = P.k[i]; M.hw = mezcla(P.hw[i], P.hw[i + 1], f); M.zona = P.zona[i]; M.pend = mezcla(P.pend[i], P.pend[i + 1], f);
  return M;
}
// Un punto del mundo a partir de (s, x, altura sobre la calle). La derecha
// del que baja es (−cos θ, 0, sin θ): con θ = 0 se mira hacia +Z.
function punto(s, x, h, out) {
  const m = muestra(s);
  return (out || new THREE.Vector3()).set(m.x - Math.cos(m.th) * x, m.y + h, m.z + Math.sin(m.th) * x);
}
const zonaEn = (s) => P.zona[limita(Math.floor(s), 0, N - 1)];

// ─── el mundo ──────────────────────────────────────────────────────
const lienzoEl = $('#pista');
const render = new THREE.WebGLRenderer({ canvas: lienzoEl, antialias: true, powerPreference: 'high-performance' });
render.outputColorSpace = THREE.SRGBColorSpace;
// La luz de una mañana de diciembre en Quito: tono neutro (los demás
// aplastan el color), un estudio blanco de fondo que da relleno y brillo a
// todo, y un sol con sombra que va con el jugador.
render.toneMapping = THREE.NeutralToneMapping;
render.toneMappingExposure = 1.12;
render.shadowMap.enabled = true;
render.shadowMap.type = THREE.PCFSoftShadowMap;
const escena = new THREE.Scene();
const NIEBLA = 0xD6E6EE;
escena.background = new THREE.Color(0xB4D5EC);
escena.fog = new THREE.Fog(NIEBLA, 80, 360);
escena.environment = new THREE.PMREMGenerator(render).fromScene(new RoomEnvironment(), 0.04).texture;
escena.environmentIntensity = 0.55;
const camara = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
escena.add(new THREE.HemisphereLight(0xE8F3FF, 0xC9B99C, 1.35));
const sol = new THREE.DirectionalLight(0xFFF0D6, 2.6);
const SOL = new THREE.Vector3(-26, 52, 20);
sol.castShadow = true;
sol.shadow.mapSize.set(1024, 1024);
Object.assign(sol.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 140 });
sol.shadow.bias = -0.0006;
sol.shadow.normalBias = 0.03;
escena.add(sol, sol.target);
// El sol (y su caja de sombra) sigue a quien se mira.
function sigueSol(p) {
  sol.position.copy(p).add(SOL);
  sol.target.position.copy(p);
}
const mate = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, o));

let TEX;
const MAT = {};

// Una cinta a lo largo de la calle entre dos bordes (x, altura) que dependen
// de la muestra. Con ella salen la calzada, los bordillos, las veredas y el
// terreno de los lados.
function cinta(i0, i1, borde, uv, mat) {
  const pos = [], uvs = [], idx = [];
  const a = new THREE.Vector3();
  for (let i = i0; i <= i1; i++) {
    for (let lado = 0; lado < 2; lado++) {
      const [x, h] = borde(i, lado);
      punto(i, x, h, a);
      pos.push(a.x, a.y, a.z);
      const [u, v] = uv(i, x);
      uvs.push(u, v);
    }
    if (i > i0) {
      const b = (i - i0) * 2;
      idx.push(b - 2, b, b - 1, b - 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  escena.add(m);
  return m;
}

function construyeCalle() {
  TEX = texturasSuelo();
  const lam = (t, extra) => mate(Object.assign({ map: t, side: THREE.DoubleSide }, extra));
  MAT.asfalto = lam(TEX.asfalto); MAT.adoquin = lam(TEX.adoquin); MAT.vereda = lam(TEX.vereda);
  MAT.pasto = lam(TEX.pasto); MAT.plaza = lam(TEX.plaza);
  MAT.bordillo = mate({ color: 0xB9B0A0, side: THREE.DoubleSide });
  MAT.madera = mate({ map: TEX.madera });

  // Por tramos de zona: cada una con su calzada y su lado.
  const uvCalle = { asfalto: (i, x) => [x / 10 + 0.5, i / 8], adoquin: (i, x) => [x / 2, i / 2] };
  let i0 = 0;
  for (let i = 1; i <= N; i++) {
    if (i < N && P.zona[i] === P.zona[i0]) continue;
    const i1 = Math.min(i, N - 1), z = ZONAS[P.zona[i0]];
    const hw = (k) => P.hw[k];
    cinta(i0, i1, (k, l) => [l ? hw(k) : -hw(k), 0], uvCalle[z.calle], MAT[z.calle]);
    for (const s of [-1, 1]) {
      cinta(i0, i1, (k, l) => [s * hw(k), l ? BORDILLO : 0], (k) => [0, k], MAT.bordillo);
      const acera = z.lado === 'pasto' ? MAT.pasto : MAT.vereda;
      cinta(i0, i1, (k, l) => [s * (hw(k) + (l ? ACERA : 0)), BORDILLO], (k, x) => [x / 1.6, k / 1.6], acera);
      const lejos = z.lado === 'pasto' ? 45 : 14;
      cinta(i0, i1, (k, l) => [s * (hw(k) + ACERA + (l ? lejos : 0)), l ? (z.lado === 'pasto' ? -5 : BORDILLO) : BORDILLO],
        (k, x) => [x / 4, k / 4], MAT[z.lado]);
    }
    i0 = i;
  }
}

// El Pichincha y las laderas: un cilindro pintado que viaja con la cámara.
let panorama;
function construyePanorama() {
  const r = azar(99);
  const W = 4096, H = 1024, LW = W;
  const onda = (x, ks) => ks.reduce((t, [k, a, f]) => t + a * Math.sin((x / LW) * Math.PI * 2 * k + f), 0);
  const c = lienzo(W, H, (c) => {
    const cielo = c.createLinearGradient(0, 0, 0, H * 0.62);
    cielo.addColorStop(0, '#5E9BD0'); cielo.addColorStop(0.75, '#A9CBE2'); cielo.addColorStop(1, '#DCE9EF');
    c.fillStyle = cielo; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,.85)';
    for (let k = 0; k < 14; k++) {
      const x = r() * W, y = 90 + r() * 220, s = 40 + r() * 50;
      for (let b = 0; b < 5; b++) { c.beginPath(); c.ellipse(x + b * s * 0.7, y + Math.sin(b) * 10, s, s * 0.5, 0, 0, 7); c.fill(); }
    }
    const base = H * 0.62;
    const g = c.createLinearGradient(0, base - 300, 0, base);
    g.addColorStop(0, '#7E98AC'); g.addColorStop(1, '#9DB3BF');
    c.fillStyle = g; c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const pico = 230 * Math.exp(-(((x - 1300) / 420) ** 2)) + 140 * Math.exp(-(((x - 1800) / 300) ** 2)) + 120 * Math.exp(-(((x - 3300) / 500) ** 2));
      c.lineTo(x, base - 40 - pico - onda(x, [[3, 30, 0.4], [7, 14, 1.3], [13, 6, 2.1]]));
    }
    c.lineTo(W, H); c.fill();
    const borde = (x) => base - 10 - onda(x, [[2, 50, 0.9], [5, 22, 2.4], [11, 9, 0.2]]) - 40;
    c.fillStyle = '#8FA675'; c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) c.lineTo(x, borde(x));
    c.lineTo(W, H); c.fill();
    const tonos = ['#F2EEE5', '#EAD9B0', '#E8C9C0', '#C9DCE6', '#F3E3D3', '#D8D2C2', '#E6B98F'];
    for (let k = 0; k < 2600; k++) {
      const x = r() * W, y0 = borde(x) + 8, y = y0 + r() ** 0.7 * (H - y0);
      const s = 3 + ((y - y0) / (H - y0)) * 7;
      c.fillStyle = elige(r, tonos); c.fillRect(x, y, s * 1.4, s);
      c.fillStyle = '#A8442C'; c.fillRect(x - 1, y - 2, s * 1.4 + 2, 2.5);
    }
  });
  const g = new THREE.CylinderGeometry(780, 780, 520, 48, 1, true);
  const m = new THREE.MeshBasicMaterial({ map: textura(c), side: THREE.BackSide, fog: false, depthWrite: false });
  panorama = new THREE.Mesh(g, m);
  panorama.renderOrder = -1;
  escena.add(panorama);
}

// ─── las piezas de quito.glb, asentadas para usarlas sueltas ───────
// Cada casa viene donde estaba en la maqueta: a un lado de la calle y con
// la fachada mirando al centro (+X si está a la izquierda, −X si a la
// derecha). Se gira para que la fachada mire a +Z, se apoya en y = 0, se
// centra en x y se deja la cara de delante en z = 0. Lo mismo con los
// puestos y los cajones, que ya vienen en el origen.
function asienta(original, giro) {
  const o = original.clone(true);
  o.position.set(0, 0, 0); o.rotation.set(0, giro, 0); o.scale.set(1, 1, 1);
  const g = new THREE.Group(); g.add(o);
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  o.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -b.max.z);
  g.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(g);
  return { g, ancho: b2.max.x - b2.min.x, fondo: b2.max.z - b2.min.z, alto: b2.max.y };
}

// Todo lo que se repite cien veces se funde en una malla por material: si
// no, cada casa son veintinueve llamadas de dibujo y el teléfono se ahoga.
class Fundidor {
  constructor() { this.cubos = new Map(); }
  pon(objeto, matriz) {
    objeto.updateMatrixWorld(true);
    objeto.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(matriz, o.matrixWorld));
      const mat = mats[0];
      if (!this.cubos.has(mat)) this.cubos.set(mat, []);
      this.cubos.get(mat).push(g);
    });
  }
  funde() {
    for (const [mat, gs] of this.cubos) {
      for (let k = 0; k < gs.length; k += 400) {
        const m = new THREE.Mesh(mergeGeometries(gs.slice(k, k + 400)), mat);
        m.receiveShadow = true;
        escena.add(m);
      }
    }
    this.cubos.clear();
  }
}

// Una matriz que pone un objeto de fachada en (s, x) mirando hacia `mira`
// (−1: hacia la izquierda del que baja, 1: hacia la derecha, 0: hacia delante).
function matrizEn(s, x, h, mira, extraGiro) {
  const m = muestra(s);
  const p = punto(s, x, h);
  // Hacia delante es (sin θ, 0, cos θ); a la derecha (−cos θ, 0, sin θ).
  let dx, dz;
  if (mira === 0) { dx = Math.sin(m.th); dz = Math.cos(m.th); }
  else { dx = -Math.cos(m.th) * mira; dz = Math.sin(m.th) * mira; }
  const giro = Math.atan2(dx, dz) + (extraGiro || 0);
  return new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), giro), new THREE.Vector3(1, 1, 1));
}

// Lo que hay en la calle y se puede chocar: { s, x, r, tipo }.
const obstaculos = [];

function construyeDecorado(quito) {
  const r = azar(2024);
  const casas = [];
  const piezas = {};
  quito.scene.updateMatrixWorld(true);
  quito.scene.traverse((o) => {
    if (/^casa_colonial/.test(o.name) && o.parent && /centro_historico/.test(o.parent.name)) {
      const b = new THREE.Box3().setFromObject(o);
      casas.push(asienta(o, (b.min.x + b.max.x) / 2 < 0 ? -Math.PI / 2 : Math.PI / 2));
    }
    for (const n of ['obstaculo_muro', 'obstaculo_salto']) if (!piezas[n] && o.name.startsWith(n)) piezas[n] = asienta(o, 0);
  });
  quito.scene.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) { m.metalness = 0; m.roughness = Math.max(m.roughness, 0.8); } });
  const f = new Fundidor();
  const zonaDe = (z) => {
    const t = tramos.findIndex((q) => q.zona === z);
    return [tramos[t].i, t + 1 < tramos.length ? tramos[t + 1].i : N];
  };

  // Las fachadas grandes, pintadas en lienzo: van en cajas y dejan hueco.
  const reservas = [];
  const fachada = (canvas, s, lado, ancho, alto, fondo) => {
    const mat = [mate({ color: 0xEDE7DA }), mate({ color: 0xEDE7DA }),
      mate({ color: 0xA8442C }), mate({ color: 0xEDE7DA }),
      mate({ map: textura(canvas), transparent: true, alphaTest: 0.5 }), mate({ color: 0xEDE7DA })];
    const caja = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, fondo), mat);
    const hw = muestra(s).hw;
    caja.applyMatrix4(new THREE.Matrix4().makeTranslation(0, alto / 2 - 0.4, -fondo / 2));
    caja.applyMatrix4(matrizEn(s, lado * (hw + ACERA), BORDILLO, -lado));
    escena.add(caja);
    reservas.push({ s0: s - ancho / 2 - 2, s1: s + ancho / 2 + 2, lado });
  };
  const [b0] = zonaDe('bulevar');
  const [g0, g1] = zonaDe('garcia');
  const [pl0] = zonaDe('plaza');
  fachada(torres(), b0 + 70, 1, 16, 21, 12);
  fachada(compania(), g0 + 100, -1, 15, 19, 14);
  fachada(catedral(), pl0 + 16, 1, 26, 19.5, 14);
  fachada(palacio(), pl0 + 20, -1, 30, 19, 14);

  // Las casas, seguidas a los dos lados de todo el centro.
  const c0 = zonaDe('ambato')[0];
  for (const lado of [-1, 1]) {
    let s = c0 + 2;
    while (s < N - 5) {
      const casa = elige(r, casas);
      const medio = s + casa.ancho / 2;
      if (zonaEn(medio) === 'plaza' && medio > pl0 + 50) break;
      if (!reservas.some((q) => q.lado === lado && medio > q.s0 && medio < q.s1)) {
        const hw = muestra(medio).hw;
        f.pon(casa.g, matrizEn(medio, lado * (hw + ACERA), -0.4, -lado));
      }
      s += casa.ancho + 0.15;
    }
  }

  // Faroles de hierro en todo el centro.
  const poste = new THREE.CylinderGeometry(0.06, 0.09, 3.6, 6).translate(0, 1.8, 0);
  const brazo = new THREE.BoxGeometry(0.06, 0.06, 0.6).translate(0, 3.5, 0.3);
  const farol = new THREE.BoxGeometry(0.22, 0.32, 0.22).translate(0, 3.3, 0.58);
  const geoFarol = mergeGeometries([poste.toNonIndexed(), brazo.toNonIndexed()]);
  const negro = mate({ color: 0x1E1E22 });
  const luz = new THREE.MeshBasicMaterial({ color: 0xFFE08A });
  const fF = new Fundidor();
  for (let s = c0 + 6; s < META + 40; s += 13) {
    for (const lado of [-1, 1]) {
      const ss = s + (lado > 0 ? 6 : 0);
      const hw = muestra(ss).hw;
      const m = matrizEn(ss, lado * (hw + 0.35), BORDILLO, -lado);
      fF.pon(new THREE.Mesh(geoFarol, negro), m);
      fF.pon(new THREE.Mesh(farol, luz), m);
      obstaculos.push({ s: ss, x: lado * (hw + 0.35), r: 0.15, tipo: 'farol' });
    }
  }
  fF.funde();

  // Los puestos de la vereda, que se meten un poco en la calle.
  for (const [z, paso] of [['bulevar', 34], ['ronda', 40], ['plaza', 20]]) {
    const [z0, z1] = zonaDe(z);
    for (let s = z0 + 12; s < Math.min(z1, META - 6); s += paso + r() * 12) {
      const lado = r() < 0.5 ? -1 : 1, hw = muestra(s).hw;
      const x = lado * (hw - 0.25);
      f.pon(piezas.obstaculo_muro.g, matrizEn(s, x, 0, 0, Math.PI / 2 * lado));
      obstaculos.push({ s, x, r: 0.6, largo: 1.0, tipo: 'puesto' });
    }
  }
  // Cajones sueltos en la García Moreno. Girados, lo ancho va a lo largo de
  // la calle: de lado ocupan 1,2 m.
  for (const [z, n] of [['garcia', 3]]) {
    const [z0, z1] = zonaDe(z);
    for (let k = 0; k < n; k++) {
      const s = z0 + 20 + (k + r() * 0.6) * (z1 - z0 - 40) / n, hw = muestra(s).hw;
      const x = (r() - 0.5) * (hw - 1) * 2;
      f.pon(piezas.obstaculo_salto.g, matrizEn(s, x, 0, 0, Math.PI / 2));
      obstaculos.push({ s, x, r: 0.6, largo: 0.8, tipo: 'cajon' });
    }
  }
  f.funde();

  // El Panecillo: eucaliptos, muros de piedra y la Virgen.
  const [p0, p1] = zonaDe('panecillo');
  const tronco = new THREE.CylinderGeometry(0.18, 0.28, 9, 6).translate(0, 4.5, 0);
  const copa = new THREE.IcosahedronGeometry(2.2, 0);
  const matTronco = mate({ color: 0xBFAE96 });
  const verdes = [0x5F7F62, 0x6E8F6C, 0x55745A, 0x7FA07A].map((c) => mate({ color: c, flatShading: true }));
  const fP = new Fundidor();
  for (let s = p0; s < p1 + 30; s += 7) {
    if (s > SALIDA - 6 && s < SALIDA + 8) continue;
    for (const lado of [-1, 1]) {
      const hw = muestra(s).hw, x = lado * (hw + ACERA + 1.5 + r() * 9);
      const m = matrizEn(s + r() * 4, x, BORDILLO - 0.2, 0, r() * 6);
      fP.pon(new THREE.Mesh(tronco, matTronco), m);
      for (let k = 0; k < 3; k++) {
        const t = new THREE.Matrix4().makeTranslation((r() - 0.5) * 2.2, 8 + r() * 2.5, (r() - 0.5) * 2.2);
        const e = 0.8 + r() * 0.6;
        t.multiply(new THREE.Matrix4().makeScale(e, e * 1.25, e));
        fP.pon(new THREE.Mesh(copa, elige(r, verdes)), m.clone().multiply(t));
      }
    }
  }
  const muro = new THREE.BoxGeometry(5.2, 0.7, 0.5).translate(0, 0.35, 0);
  const matMuro = mate({ color: 0x9A9385 });
  for (let s = p0 + 45; s < p1; s += 6) {
    for (const lado of [-1, 1]) {
      const hw = muestra(s).hw;
      fP.pon(new THREE.Mesh(muro, matMuro), matrizEn(s, lado * (hw + ACERA + 0.25), BORDILLO, 0, Math.PI / 2));
    }
  }
  fP.funde();
  const v = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura(virgen()), fog: false }));
  v.scale.set(15, 26.7, 1);
  v.position.copy(punto(SALIDA + 55, -32, 13.3));
  escena.add(v);

  // La gente que mira, en filas sobre la vereda (o en el pasto, arriba).
  const lugares = [];
  const fila = (s0, lado, n) => {
    for (let k = 0; k < n; k++) {
      const s = s0 + (k - n / 2) * 0.8 + r() * 0.3;
      if (s > SALIDA - 3 && s < SALIDA + 3) continue;
      lugares.push({ s, lado, fondo: r() });
    }
  };
  for (let s = 4; s < SALIDA + 10; s += 5) { fila(s, -1, 5); fila(s + 2.5, 1, 5); }
  for (const [z, paso, n] of [['panecillo', 40, 4], ['ambato', 22, 4], ['bulevar', 8, 6], ['ronda', 10, 4], ['garcia', 14, 4], ['plaza', 5, 7]]) {
    const [z0, z1] = zonaDe(z);
    for (let s = z0 + (z === 'panecillo' ? SALIDA + 30 : 4); s < Math.min(z1, META + 30); s += paso + r() * 4) fila(s, r() < 0.5 ? -1 : 1, n);
  }
  publico = construyePublico(lugares, r);

  // Banderines de colores cruzando las calles del centro.
  const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.16, 0, 0), new THREE.Vector3(0.16, 0, 0), new THREE.Vector3(0, -0.38, 0)]);
  tri.computeVertexNormals();
  const banderas = [];
  for (let s = c0 + 20; s < META + 30; s += 16 + r() * 8) {
    const hw = muestra(s).hw, ancho = hw + ACERA - 0.3;
    for (let k = 1; k < 18; k++) {
      const f2 = k / 18, x = -ancho + f2 * ancho * 2;
      const h = 6 - Math.sin(f2 * Math.PI) * 1.1;
      banderas.push(matrizEn(s, x, h, 0));
    }
  }
  const mB = new THREE.InstancedMesh(tri, mate({ side: THREE.DoubleSide }), banderas.length);
  const tonosB = ['#D6382B', '#1B5FAA', '#F5C518', '#2E7D4F', '#E01B6A', '#F3F1EC', '#6B2D7B'];
  banderas.forEach((m, k) => { mB.setMatrixAt(k, m); mB.setColorAt(k, new THREE.Color(tonosB[k % tonosB.length])); });
  escena.add(mB);

  // La salida, la meta y el Arco de la Reina, de lado a lado.
  const portal = (s, texto, meta) => {
    const hw = muestra(s).hw, ancho = (hw + 0.6) * 2;
    const grupo = new THREE.Group();
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 8).translate(0, 2.5, 0), mate({ color: 0x6B4423 }));
    const p1 = palo.clone(); p1.position.x = hw + 0.6; grupo.add(p1);
    const p2 = palo.clone(); p2.position.x = -(hw + 0.6); grupo.add(p2);
    const c = lienzo(1024, 128, (c, w, h) => {
      if (meta) { for (let k = 0; k < 32; k++) for (let f2 = 0; f2 < 2; f2++) { c.fillStyle = (k + f2) % 2 ? '#fff' : TINTA; c.fillRect(k * 32, f2 * 64, 32, 64); } }
      else { c.fillStyle = '#D6382B'; c.fillRect(0, 0, w, h); c.fillStyle = '#1F4E9E'; c.fillRect(0, h - 22, w, 22); }
      c.font = '800 64px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const tw = c.measureText(texto).width;
      if (meta) { c.fillStyle = '#fff'; c.fillRect(w / 2 - tw / 2 - 24, 14, tw + 48, h - 28); }
      c.fillStyle = meta ? TINTA : '#fff'; c.fillText(texto, w / 2, h / 2 + 2);
    });
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(ancho, ancho / 8), mate({ map: textura(c), side: THREE.DoubleSide }));
    tela.position.y = 4.6;
    grupo.add(tela);
    grupo.applyMatrix4(matrizEn(s, 0, 0, 0, Math.PI));
    escena.add(grupo);
  };
  portal(SALIDA, 'SALIDA · EL PANECILLO', false);
  portal(META, 'META · PLAZA GRANDE', true);
  {
    const s = g0 + 55, hw = muestra(s).hw, ancho = (hw + ACERA) * 2 + 2;
    const blanco = mate({ color: 0xF2EEE5 });
    const grupo = new THREE.Group();
    const pilar = new THREE.BoxGeometry(1.4, 9, 3.4).translate(0, 4.5, 0);
    for (const l of [-1, 1]) { const m = new THREE.Mesh(pilar, blanco); m.position.x = l * (hw + ACERA + 0.5); grupo.add(m); }
    const cArco = lienzo(512, 160, (c, w, h) => {
      c.fillStyle = '#F2EEE5'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1F4E9E'; c.fillRect(w / 2 - 40, 24, 80, 46);
      c.fillStyle = TINTA; c.font = '800 30px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText('ARCO DE LA REINA', w / 2, 120);
    });
    const dintel = new THREE.Mesh(new THREE.BoxGeometry(ancho, 3, 3.4),
      [blanco, blanco, mate({ color: 0xA8442C }), blanco, mate({ map: textura(cArco) }), mate({ map: textura(cArco) })]);
    dintel.position.y = 7.5;
    grupo.add(dintel);
    const techo = new THREE.Mesh(new THREE.BoxGeometry(ancho + 0.6, 0.5, 4.2), mate({ color: 0xA8442C }));
    techo.position.y = 9.2;
    grupo.add(techo);
    grupo.applyMatrix4(matrizEn(s, 0, 0, 0));
    escena.add(grupo);
  }

  // En la calle: rampas de tabla, huecos y coladas.
  const rampa = (() => {
    const forma = new THREE.Shape();
    forma.moveTo(-1.2, 0); forma.lineTo(1.2, 0); forma.lineTo(1.2, 0.45); forma.closePath();
    const g = new THREE.ExtrudeGeometry(forma, { depth: 1.8, bevelEnabled: false });
    g.translate(0, 0, -0.9); g.rotateY(-Math.PI / 2);
    return g;
  })();
  const rampas = [[zonaDe('ambato')[0] + 150, 0], [b0 + 40, -1.6], [b0 + 120, 1.4], [zonaDe('ronda')[0] + 40, 0], [p0 + 62, 1.2]];
  for (const [s, x] of rampas) {
    const m = new THREE.Mesh(rampa, MAT.madera);
    m.applyMatrix4(matrizEn(s, x, 0, 0));
    escena.add(m);
    obstaculos.push({ s, x, r: 0.9, largo: 1.2, tipo: 'rampa' });
  }
  const matHueco = new THREE.MeshBasicMaterial({ color: 0x2A241E });
  const geoHueco = new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2).scale(1, 1, 0.7);
  for (let s = p0 + 120; s < META - 20; s += 38 + r() * 40) {
    const hw = muestra(s).hw, x = (r() - 0.5) * (hw - 0.8) * 2;
    const m = new THREE.Mesh(geoHueco, matHueco);
    m.applyMatrix4(matrizEn(s, x, 0.02, 0));
    escena.add(m);
    obstaculos.push({ s, x, r: 0.45, largo: 0.4, tipo: 'hueco' });
  }
  const matColada = new THREE.SpriteMaterial({ map: textura(colada()) });
  for (const s0 of [p0 + 150, p0 + 262, c0 + 110, b0 + 80, zonaDe('ronda')[0] + 90, g0 + 15, g0 + 75]) {
    const lado = r() < 0.5 ? -1 : 1;
    for (let k = 0; k < 3; k++) {
      const s = s0 + k * 3, x = lado * (k - 1) * 1.3;
      const sp = new THREE.Sprite(matColada);
      sp.scale.set(0.55, 0.7, 1);
      sp.position.copy(punto(s, x, 0.9));
      escena.add(sp);
      obstaculos.push({ s, x, r: 0.4, largo: 0.5, tipo: 'colada', sp, base: sp.position.y });
    }
  }
  obstaculos.sort((a, b) => a.s - b.s);
  void g1;
}

// ─── el público ────────────────────────────────────────────────────
// Muñecos de bulto, como de juguete: piernas, cuerpo con los brazos
// arriba, piel (cabeza y manos) y sombrero. Cuatro mallas instanciadas para
// todos; cuando pasa la carrera, saltan. Algunos llevan cartel.
let publico = null;
function construyePublico(lugares, r) {
  const n = lugares.length;
  const pierna = new THREE.CylinderGeometry(0.1, 0.12, 0.74, 7).translate(0, 0.37, 0);
  const gPiernas = mergeGeometries([pierna.clone().translate(-0.1, 0, 0), pierna.clone().translate(0.1, 0, 0)]);
  const brazo = new THREE.CylinderGeometry(0.06, 0.075, 0.55, 7);
  const gCuerpo = mergeGeometries([
    new THREE.CylinderGeometry(0.2, 0.27, 0.64, 10).translate(0, 1.06, 0),
    brazo.clone().rotateZ(0.55).translate(-0.33, 1.45, 0),
    brazo.clone().rotateZ(-0.55).translate(0.33, 1.45, 0),
  ]);
  const gPiel = mergeGeometries([
    new THREE.SphereGeometry(0.19, 14, 10).translate(0, 1.57, 0),
    new THREE.SphereGeometry(0.075, 8, 6).translate(-0.48, 1.69, 0),
    new THREE.SphereGeometry(0.075, 8, 6).translate(0.48, 1.69, 0),
  ]);
  const gSombrero = mergeGeometries([
    new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16).translate(0, 1.71, 0),
    new THREE.CylinderGeometry(0.15, 0.18, 0.2, 14).translate(0, 1.82, 0),
  ]);
  const crea = (geo) => {
    const m = new THREE.InstancedMesh(geo, mate({ roughness: 0.7 }), n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    escena.add(m);
    return m;
  };
  const mallas = [crea(gPiernas), crea(gCuerpo), crea(gPiel), crea(gSombrero)];
  const ropa = ['#D6382B', '#1B5FAA', '#F5A623', '#2E7D4F', '#6B2D7B', '#F3F1EC', '#E01B6A', '#00A3A3', '#F5C518', '#8C3B2E'];
  const pantalon = ['#2F3A4F', '#3B4A6B', '#1C1A18', '#5A4632', '#2E3B2E'];
  const piel = ['#8D5A3B', '#A86E48', '#C68B5E', '#7A4A2E', '#E0A88A'];
  const sombrero = ['#2A2420', '#F3F1EC', '#5A3A22', '#1C1A18'];
  const cartel = CARTELES.map((t) => new THREE.MeshStandardMaterial({ map: textura(lienzo(160, 90, (c, w, h) => {
    c.fillStyle = '#FFF8E6'; c.fillRect(0, 0, w, h); c.strokeStyle = TINTA; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = '#D6382B'; c.font = '800 34px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, w / 2, h / 2 + 2);
  })), side: THREE.DoubleSide, roughness: 0.8 }));
  const geoCartel = new THREE.PlaneGeometry(0.9, 0.5);
  const datos = lugares.map((l, k) => {
    const hw = muestra(l.s).hw;
    const x = l.lado * (hw + 0.5 + l.fondo * 0.9);
    const base = matrizEn(l.s, x, BORDILLO, -l.lado, (r() - 0.5) * 0.5);
    const e = 0.9 + r() * 0.22;
    base.multiply(new THREE.Matrix4().makeScale(e, e, e));
    const conSombrero = r() < 0.55;
    mallas[0].setColorAt(k, new THREE.Color(elige(r, pantalon)));
    mallas[1].setColorAt(k, new THREE.Color(elige(r, ropa)));
    mallas[2].setColorAt(k, new THREE.Color(elige(r, piel)));
    mallas[3].setColorAt(k, new THREE.Color(elige(r, sombrero)));
    let letrero = null;
    if (r() < 0.12) {
      letrero = new THREE.Mesh(geoCartel, elige(r, cartel));
      escena.add(letrero);
    }
    return { s: l.s, base, conSombrero, fase: r() * 7, ritmo: 6 + r() * 4, letrero };
  });
  const _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), cero = new THREE.Matrix4().makeScale(0, 0, 0);
  const coloca = (t, sJ) => {
    datos.forEach((d, k) => {
      const cerca = Math.abs(d.s - sJ) < 45;
      const y = cerca ? Math.abs(Math.sin(t * d.ritmo + d.fase)) * 0.22 : 0;
      _m.copy(d.base).multiply(_t.makeTranslation(0, y, 0));
      for (let i = 0; i < 3; i++) mallas[i].setMatrixAt(k, _m);
      mallas[3].setMatrixAt(k, d.conSombrero ? _m : cero);
      if (d.letrero) {
        d.letrero.matrixAutoUpdate = false;
        d.letrero.matrix.copy(_m).multiply(_t.makeTranslation(0, 2.25, 0.1));
        d.letrero.matrixWorldNeedsUpdate = true;
      }
    });
    for (const m of mallas) m.instanceMatrix.needsUpdate = true;
  };
  coloca(0, -999);
  for (const m of mallas) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  return { coloca };
}

// ─── la gente ──────────────────────────────────────────────────────
const MODELOS = {};
const CLIPS = {};

// Los clips de Estado Decepción traen posición y escala por hueso; la escala
// pisaría la complexión y la posición de la cadera movería el cuerpo por su
// cuenta. Aquí el cuerpo lo mueve el juego, así que solo quedan los giros.
function limpiaClip(c) {
  const k = c.clone();
  k.tracks = k.tracks.filter((t) => t.name.endsWith('.quaternion'));
  return k;
}

// Los cuerpos base de Modo Incógnito vienen sin textura: se pintan por
// vértice según el hueso que más pesa en cada uno. En la cabeza, la mitad
// de arriba y la nuca son pelo (o casco).
function pintaCuerpo(malla, colores, metal) {
  const g = malla.geometry = malla.geometry.clone();
  const pos = g.getAttribute('position'), si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight');
  const nombres = malla.skeleton.bones.map((b) => b.name);
  const n = pos.count, region = new Array(n);
  let yMin = Infinity, yMax = -Infinity, zMin = Infinity, zMax = -Infinity;
  for (let i = 0; i < n; i++) {
    let b = 0, w = -1;
    for (let k = 0; k < 4; k++) { const x = sw.getComponent(i, k); if (x > w) { w = x; b = si.getComponent(i, k); } }
    const nm = nombres[b] || '';
    region[i] = /hand/i.test(nm) ? 'piel' : /head|neck/i.test(nm) ? 'cabeza' : /foot|toe/i.test(nm) ? 'zapatos'
      : /leg|hips/i.test(nm) ? 'pantalon' : 'ropa';
    if (region[i] === 'cabeza') {
      const y = pos.getY(i), z = pos.getZ(i);
      yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
    }
  }
  const col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    let r = region[i];
    if (r === 'cabeza') {
      const y = (pos.getY(i) - yMin) / (yMax - yMin), z = (pos.getZ(i) - zMin) / (zMax - zMin);
      // Estos cuerpos miran a +Z: la nuca es la z baja.
      r = y > 0.6 || (z < 0.38 && y > 0.25) ? 'pelo' : 'piel';
    }
    c.set(colores[r]);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // El gallo de la Catedral es de metal: brilla.
  malla.material = mate(metal ? { vertexColors: true, metalness: 0.6, roughness: 0.32 } : { vertexColors: true, roughness: 0.75 });
}

class Persona {
  constructor(base, { altura, colores, frente, metal, piezas, tambalea }) {
    const fuente = MODELOS[base];
    this.obj = new THREE.Group();
    const dentro = clonaEsqueleto(fuente.scene);
    dentro.rotation.y = frente || 0;
    dentro.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.frustumCulled = false;
        o.castShadow = true;
        if (colores) pintaCuerpo(o, colores, metal);
        else if (o.material) o.material = mate({ map: o.material.map, color: o.material.color });
      }
    });
    this.obj.add(dentro);
    this.dentro = dentro;
    this.mixer = new THREE.AnimationMixer(dentro);
    this.acciones = {};
    for (const [n, c] of Object.entries(CLIPS)) this.acciones[n] = this.mixer.clipAction(c);
    if (fuente.animations[0]) this.acciones.andar = this.mixer.clipAction(limpiaClip(fuente.animations[0]));
    // La estatura: se mide de pie, en reposo.
    this.obj.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(dentro, true);
    const e = altura / (b.max.y - b.min.y);
    dentro.scale.multiplyScalar(e);
    this.pie = -b.min.y * e;
    dentro.position.y = this.pie;
    this.actual = null;
    this.tambalea = tambalea;
    escena.add(this.obj);
    // Lo que se le cuelga encima —sombrero, cuernos, pico, botella— se pone
    // en reposo, en el sitio de la cabeza o de la mano, y se engancha a ese
    // hueso: a partir de ahí lo sigue en todas las poses.
    if (piezas) {
      this.obj.updateMatrixWorld(true);
      this.huesos = {};
      dentro.traverse((o) => { if (o.isBone) this.huesos[o.name] = o; });
      const A = anclas(this, altura);
      for (const p of piezas) p(this, A);
    }
  }
  pon(nombre, { fundido = 0.18, una = false, vel = 1 } = {}) {
    const a = this.acciones[nombre];
    if (!a) return;
    a.timeScale = vel;
    if (this.actual === nombre) return;
    const antes = this.acciones[this.actual];
    a.reset();
    a.setLoop(una ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = una;
    a.play();
    if (antes) a.crossFadeFrom(antes, fundido, false);
    this.actual = nombre;
    if (this.faldas) for (const f of this.faldas) f.visible = nombre === 'correr' || nombre === 'andar' || nombre === 'salto';
  }
  // Cuánto hay que subir el cuerpo para que, en una pose, lo más bajo toque
  // el suelo: sentado, son las nalgas; corriendo, los pies.
  apoyo(nombre) {
    this._apoyos = this._apoyos || {};
    if (this._apoyos[nombre] !== undefined) return this._apoyos[nombre];
    const antes = this.actual;
    for (const a of Object.values(this.acciones)) a.stop();
    const a = this.acciones[nombre];
    a.reset().play(); this.mixer.update(0.4);
    const y0 = this.dentro.position.y;
    this.dentro.position.y = 0;
    this.obj.position.set(0, 0, 0); this.obj.rotation.set(0, 0, 0);
    this.obj.updateMatrixWorld(true);
    const b = new THREE.Box3();
    this.dentro.traverse((o) => { if (o.isSkinnedMesh) b.expandByObject(o, true); });
    this.dentro.position.y = y0;
    a.stop();
    this.actual = null;
    if (antes) this.pon(antes, { fundido: 0 });
    return (this._apoyos[nombre] = -b.min.y);
  }
}

// ─── lo que se les cuelga ──────────────────────────────────────────
// Las anclas, en reposo y en metros: la base y la punta de la cabeza (los
// huesos Head y head_end), la cara (headfront), la cadera, el pecho y las
// manos. H es el alto de la cabeza; a, el del cuerpo.
function anclas(p, alto) {
  const w = (n) => { const b = p.huesos[n]; return b ? b.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(); };
  const cabeza = w('Head'), tope = w('head_end'), cara = w('headfront');
  const H = tope.y - cabeza.y;
  const centro = new THREE.Vector3((cabeza.x + tope.x) / 2, (cabeza.y + tope.y) / 2, cara.z - H * 0.45);
  return { a: alto, H, cabeza, tope, cara, centro, cadera: w('Hips'), pecho: w('Spine02'), manoD: w('RightHand'), manoI: w('LeftHand') };
}
function pega(p, hueso, malla, x, y, z) {
  malla.position.set(x, y, z);
  malla.castShadow = true;
  p.obj.add(malla);
  (p.huesos[hueso] || p.dentro).attach(malla);
  return malla;
}
const esfera = (r, col, extra) => new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mate(Object.assign({ color: col }, extra)));
const PIEZA = {
  // El capirote del cucurucho, con sus dos huecos para los ojos.
  capirote: (col) => (p, A) => {
    const base = A.cabeza.y - A.H * 0.1, alto = A.H * 2.8, rad = A.H * 0.64;
    pega(p, 'Head', new THREE.Mesh(new THREE.ConeGeometry(rad, alto, 20), mate({ color: col })), A.centro.x, base + alto / 2, A.centro.z);
    const ojoY = A.cara.y + A.H * 0.05, enY = rad * (1 - (ojoY - base) / alto);
    for (const l of [-1, 1]) {
      const o = esfera(A.H * 0.075, 0x111111); o.scale.z = 0.35;
      pega(p, 'Head', o, A.centro.x + l * A.H * 0.16, ojoY, A.centro.z + enY * 0.97);
    }
  },
  falda: (col, corta) => (p, A) => {
    const arriba = A.cadera.y + A.a * 0.04, abajo = A.a * (corta ? 0.3 : 0.1), h = arriba - abajo;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(A.a * 0.11, A.a * 0.2, h, 18, 1, true), mate({ color: col, side: THREE.DoubleSide }));
    pega(p, 'Hips', m, A.cadera.x, abajo + h / 2, A.cadera.z);
    // Sentado, la falda giraría con la cadera y apuntaría hacia delante:
    // solo se ve de pie. Las piernas van pintadas del mismo color.
    (p.faldas = p.faldas || []).push(m);
  },
  sombrero: (col, cinta, ala = 0.9, copa = 0.5) => (p, A) => {
    const y = A.tope.y - A.H * 0.18;
    pega(p, 'Head', new THREE.Mesh(new THREE.CylinderGeometry(A.H * ala, A.H * ala, A.H * 0.06, 24), mate({ color: col })), A.centro.x, y, A.centro.z);
    pega(p, 'Head', new THREE.Mesh(new THREE.CylinderGeometry(A.H * 0.42, A.H * 0.5, A.H * copa, 20), mate({ color: col })), A.centro.x, y + A.H * copa / 2, A.centro.z);
    if (cinta) pega(p, 'Head', new THREE.Mesh(new THREE.CylinderGeometry(A.H * 0.505, A.H * 0.505, A.H * 0.1, 20), mate({ color: cinta })), A.centro.x, y + A.H * 0.09, A.centro.z);
  },
  // El de Don Ramón, de tres picos, con uno hacia delante.
  tricornio: (col) => (p, A) => {
    const y = A.tope.y - A.H * 0.12;
    pega(p, 'Head', new THREE.Mesh(new THREE.CylinderGeometry(A.H * 0.95, A.H * 0.95, A.H * 0.12, 3), mate({ color: col })), A.centro.x, y, A.centro.z);
    pega(p, 'Head', new THREE.Mesh(new THREE.CylinderGeometry(A.H * 0.45, A.H * 0.5, A.H * 0.3, 16), mate({ color: col })), A.centro.x, y + A.H * 0.18, A.centro.z);
  },
  cuernos: (col) => (p, A) => {
    for (const l of [-1, 1]) {
      const c = pega(p, 'Head', new THREE.Mesh(new THREE.ConeGeometry(A.H * 0.11, A.H * 0.55, 10), mate({ color: col, roughness: 0.5 })), A.centro.x + l * A.H * 0.3, A.tope.y - A.H * 0.02, A.centro.z + A.H * 0.1);
      c.rotation.set(0.25, 0, -l * 0.45);
    }
  },
  cola: (col) => (p, A) => {
    const o = A.cadera, a = A.a;
    const curva = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, -0.08 * a), new THREE.Vector3(0, -0.12 * a, -0.3 * a),
      new THREE.Vector3(0, 0.02 * a, -0.5 * a), new THREE.Vector3(0, 0.2 * a, -0.55 * a),
    ]);
    const g = new THREE.TubeGeometry(curva, 24, a * 0.018, 8);
    pega(p, 'Hips', new THREE.Mesh(g, mate({ color: col })), o.x, o.y, o.z);
    const punta = new THREE.Mesh(new THREE.ConeGeometry(a * 0.045, a * 0.09, 4), mate({ color: col }));
    pega(p, 'Hips', punta, o.x, o.y + 0.25 * a, o.z - 0.55 * a);
  },
  barbita: (col) => (p, A) => {
    const b = new THREE.Mesh(new THREE.ConeGeometry(A.H * 0.1, A.H * 0.3, 8), mate({ color: col }));
    b.rotation.x = Math.PI;
    pega(p, 'Head', b, A.cara.x, A.cabeza.y + A.H * 0.02, A.cara.z - A.H * 0.05);
  },
  // El gallo: cresta, pico, barbas y la cola de plumas.
  gallo: () => (p, A) => {
    for (let k = 0; k < 3; k++) {
      const c = esfera(A.H * (0.17 - k * 0.02), 0xD6382B); c.scale.x = 0.45;
      pega(p, 'Head', c, A.centro.x, A.tope.y + A.H * (0.05 - k * 0.03), A.centro.z + A.H * (0.25 - k * 0.22));
    }
    const pico = new THREE.Mesh(new THREE.ConeGeometry(A.H * 0.13, A.H * 0.42, 10), mate({ color: 0xF5C518, metalness: 0.3, roughness: 0.4 }));
    pico.rotation.x = Math.PI / 2;
    pega(p, 'Head', pico, A.cara.x, A.cara.y, A.cara.z + A.H * 0.2);
    const barba = esfera(A.H * 0.1, 0xD6382B); barba.scale.y = 1.5;
    pega(p, 'Head', barba, A.cara.x, A.cara.y - A.H * 0.25, A.cara.z + A.H * 0.02);
    const tonos = [0xD9A93A, 0xB5452B, 0x2E4A3A, 0xD9A93A, 0xB5452B];
    tonos.forEach((col, k) => {
      const f = esfera(1, col, { metalness: 0.5, roughness: 0.35 });
      f.scale.set(A.a * 0.03, A.a * 0.2, A.a * 0.07);
      const ang = (k - 2) * 0.32;
      f.rotation.set(-0.45, 0, ang);
      // De la espalda y no de la cadera: sentado, la cadera gira y las plumas
      // le quedaban delante.
      pega(p, 'Spine', f, A.cadera.x + Math.sin(ang) * A.a * 0.12, A.cadera.y + A.a * 0.2, A.cadera.z - A.a * 0.17);
    });
  },
  nariz: () => (p, A) => pega(p, 'Head', esfera(A.H * 0.12, 0xE0453A), A.cara.x, A.cara.y - A.H * 0.05, A.cara.z + A.H * 0.07),
  botella: (mano, col = 0x2E7D4F) => (p, A) => {
    const m = A[mano === 'RightHand' ? 'manoD' : 'manoI'], hueso = mano;
    const vidrio = mate({ color: col, roughness: 0.15, metalness: 0.1 });
    pega(p, hueso, new THREE.Mesh(new THREE.CylinderGeometry(A.a * 0.035, A.a * 0.035, A.a * 0.13, 12), vidrio), m.x, m.y + A.a * 0.02, m.z);
    pega(p, hueso, new THREE.Mesh(new THREE.CylinderGeometry(A.a * 0.013, A.a * 0.02, A.a * 0.07, 10), vidrio), m.x, m.y + A.a * 0.11, m.z);
  },
  fusil: () => (p, A) => {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(A.a * 0.014, A.a * 0.02, A.a * 0.75, 8), mate({ color: 0x4A3220 }));
    f.rotation.z = 0.75;
    pega(p, 'Spine02', f, A.pecho.x, A.pecho.y, A.pecho.z - A.a * 0.12);
  },
  trenza: (col) => (p, A) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(A.H * 0.07, A.H * 0.05, A.H * 0.9, 8), mate({ color: col }));
    pega(p, 'Head', t, A.centro.x, A.cabeza.y - A.H * 0.3, A.centro.z - A.H * 0.5);
  },
  alas: () => (p, A) => {
    for (const l of [-1, 1]) {
      const w = esfera(1, 0xFFFFFF, { roughness: 0.5 });
      w.scale.set(A.a * 0.03, A.a * 0.32, A.a * 0.19);
      w.rotation.set(-0.3, 0, l * 0.55);
      pega(p, 'Spine02', w, A.pecho.x + l * A.a * 0.16, A.pecho.y + A.a * 0.12, A.pecho.z - A.a * 0.13);
    }
  },
  estrella: () => (p, A) => {
    const forma = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const r = (k % 2 ? 0.45 : 1) * A.H * 0.32, ang = k * Math.PI / 5;
      if (k) forma.lineTo(Math.sin(ang) * r, Math.cos(ang) * r); else forma.moveTo(0, r);
    }
    const g = new THREE.ExtrudeGeometry(forma, { depth: A.H * 0.08, bevelEnabled: false }).translate(0, 0, -A.H * 0.04);
    pega(p, 'Head', new THREE.Mesh(g, mate({ color: 0xF5C518, metalness: 0.7, roughness: 0.3 })), A.centro.x, A.tope.y + A.H * 0.5, A.centro.z);
  },
  // El tocado de la Mamá Negra, con cintas de colores colgando atrás.
  tocado: () => (p, A) => {
    const y = A.tope.y - A.H * 0.2;
    pega(p, 'Head', new THREE.Mesh(new THREE.CylinderGeometry(A.H * 0.58, A.H * 0.52, A.H * 0.7, 20), mate({ color: 0xF5C518 })), A.centro.x, y + A.H * 0.3, A.centro.z);
    pega(p, 'Head', esfera(A.H * 0.2, 0xD6382B), A.centro.x, y + A.H * 0.7, A.centro.z + A.H * 0.3);
    ['#D6382B', '#1B5FAA', '#2E7D4F', '#E01B6A', '#F3F1EC', '#6B2D7B'].forEach((col, k) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(A.H * 0.1, A.H * 1.3, A.H * 0.02), mate({ color: col }));
      const ang = (k - 2.5) * 0.25;
      pega(p, 'Head', c, A.centro.x + Math.sin(ang) * A.H * 0.5, y - A.H * 0.3, A.centro.z - Math.cos(ang) * A.H * 0.5);
    });
  },
  muneca: () => (p, A) => {
    const m = A.manoI;
    pega(p, 'LeftHand', new THREE.Mesh(new THREE.CylinderGeometry(A.a * 0.04, A.a * 0.06, A.a * 0.14, 10), mate({ color: 0xE01B6A })), m.x, m.y + A.a * 0.04, m.z);
    pega(p, 'LeftHand', esfera(A.a * 0.04, 0xC68B5E), m.x, m.y + A.a * 0.14, m.z);
  },
};

// Las parejas. El primero maneja; el segundo empuja.
const PERSONAJES = {
  cucurucho: { base: 'base-chico', pinta: { piel: '#C68B5E', pelo: '#5B2A86', ropa: '#5B2A86', pantalon: '#5B2A86', zapatos: '#1C1A18' }, piezas: [PIEZA.capirote('#5B2A86'), PIEZA.falda('#5B2A86')] },
  cucurucha: { base: 'base-chica', pinta: { piel: '#A86E48', pelo: '#6E3597', ropa: '#6E3597', pantalon: '#6E3597', zapatos: '#1C1A18' }, piezas: [PIEZA.capirote('#6E3597'), PIEZA.falda('#6E3597')] },
  cantuna: { base: 'base-chico', pinta: { piel: '#A86E48', pelo: '#1C1A18', ropa: '#B0302A', pantalon: '#F3F1EC', zapatos: '#C9A26B' }, piezas: [PIEZA.sombrero('#2A2420', '#B0302A'), PIEZA.trenza('#1C1A18')] },
  diablo: { base: 'base-chico', pinta: { piel: '#D3271F', pelo: '#1C1A18', ropa: '#1C1A18', pantalon: '#1C1A18', zapatos: '#1C1A18' }, piezas: [PIEZA.cuernos('#F2E6C8'), PIEZA.cola('#D3271F'), PIEZA.barbita('#1C1A18')] },
  gallo: { base: 'base-chico', metal: true, pinta: { piel: '#D9A93A', pelo: '#D9A93A', ropa: '#C8952A', pantalon: '#B98325', zapatos: '#8C6A22' }, piezas: [PIEZA.gallo()] },
  borracho: { base: 'base-chico', tambalea: true, pinta: { piel: '#E0A88A', pelo: '#ECE6DA', ropa: '#2F6A44', pantalon: '#1C1A18', zapatos: '#1C1A18' }, piezas: [PIEZA.tricornio('#1C1A18'), PIEZA.nariz(), PIEZA.botella('RightHand')] },
  guaricha: { base: 'base-chica', pinta: { piel: '#A86E48', pelo: '#1C1A18', ropa: '#1F4E9E', pantalon: '#D6382B', zapatos: '#2A2420' }, piezas: [PIEZA.falda('#D6382B'), PIEZA.sombrero('#F3F1EC', '#1F4E9E', 0.75, 0.35), PIEZA.trenza('#1C1A18'), PIEZA.fusil()] },
  guaricha2: { base: 'base-chica', pinta: { piel: '#8D5A3B', pelo: '#2A2420', ropa: '#F5C518', pantalon: '#2E7D4F', zapatos: '#2A2420' }, piezas: [PIEZA.falda('#2E7D4F'), PIEZA.sombrero('#5A3A22', '#F5C518', 0.75, 0.35), PIEZA.trenza('#2A2420'), PIEZA.fusil()] },
  mamanegra: { base: 'base-chica', pinta: { piel: '#C68B5E', pelo: '#1C1A18', ropa: '#E01B6A', pantalon: '#1B5FAA', zapatos: '#F3F1EC' }, piezas: [PIEZA.falda('#F5A623'), PIEZA.tocado(), PIEZA.muneca(), PIEZA.botella('RightHand', 0xF3F1EC)] },
  angel: { base: 'base-chica', pinta: { piel: '#E0A88A', pelo: '#F5C518', ropa: '#F7F5F0', pantalon: '#F7F5F0', zapatos: '#F5C518' }, piezas: [PIEZA.falda('#F7F5F0'), PIEZA.alas(), PIEZA.estrella()] },
};
// stats de 1 a 5, como en los karts: velocidad, empuje y giro.
const EQUIPOS = [
  { id: 'cucuruchos', nombre: 'Los Cucuruchos', lema: 'La procesión baja a ochenta por hora.', piloto: 'cucurucho', empuja: 'cucurucha', tabla: '#9C7BC0', placa: '#5B2A86', num: 1, stats: [3, 3, 3], hab: 0.95 },
  { id: 'cantuna', nombre: 'Cantuña y el Diablo', lema: 'El diablo empuja; Cantuña ya escondió la piedra.', piloto: 'cantuna', empuja: 'diablo', tabla: '#A87445', placa: '#D3271F', num: 6, stats: [3, 5, 2], hab: 0.97 },
  { id: 'gallo', nombre: 'El Gallo y Don Ramón', lema: 'Don Ramón le gritó al gallo de la Catedral. Ahora maneja el gallo.', piloto: 'gallo', empuja: 'borracho', tabla: '#C8955A', placa: '#B98325', num: 3, stats: [5, 1, 3], hab: 0.96 },
  { id: 'guarichas', nombre: 'Las Guarichas', lema: 'Fueron a la guerra de la Independencia: una bajada no las asusta.', piloto: 'guaricha', empuja: 'guaricha2', tabla: '#B98250', placa: '#1F4E9E', num: 9, stats: [2, 4, 5], hab: 0.94 },
  { id: 'mamanegra', nombre: 'La Mamá Negra y el Ángel', lema: 'Desde Latacunga, con el Ángel de la Estrella empujando.', piloto: 'mamanegra', empuja: 'angel', tabla: '#D2A26A', placa: '#E01B6A', num: 11, stats: [4, 2, 4], hab: 0.93 },
];
const STATS = ['Velocidad', 'Empuje', 'Giro'];
const ALTO = 1.25;

const persona = (id) => {
  const d = PERSONAJES[id];
  return new Persona(d.base, { altura: ALTO, colores: d.pinta, metal: d.metal, piezas: d.piezas, tambalea: d.tambalea });
};

function construyeCoche(eq) {
  const g = new THREE.Group();
  const tabla = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 1.9), mate({ map: TEX.madera, color: eq.tabla }));
  tabla.position.y = TABLA;
  g.add(tabla);
  const metal = mate({ color: 0x8C9096 });
  const eje = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.04, 0.05), mate({ color: 0x3A3A3A }));
  const rueda = new THREE.CylinderGeometry(0.09, 0.09, 0.07, 12).rotateZ(Math.PI / 2);
  const ruedas = [];
  const delante = new THREE.Group(); delante.position.set(0, 0.1, 0.78); g.add(delante);
  const atras = new THREE.Group(); atras.position.set(0, 0.1, -0.78); g.add(atras);
  for (const grupo of [delante, atras]) {
    grupo.add(eje.clone());
    for (const l of [-1, 1]) { const w = new THREE.Mesh(rueda, metal); w.position.x = l * 0.38; grupo.add(w); ruedas.push(w); }
  }
  // Los tacos donde se apoyan los ejes, y el número atrás.
  const taco = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), mate({ map: TEX.madera }));
  for (const z of [0.78, -0.78]) { const t = taco.clone(); t.position.set(0, 0.17, z); g.add(t); }
  const num = lienzo(128, 64, (c, w, h) => {
    c.fillStyle = eq.placa; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.font = '800 46px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(eq.num), w / 2, h / 2 + 2);
  });
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), new THREE.MeshBasicMaterial({ map: textura(num) }));
  placa.position.set(0, TABLA + 0.02, -0.96); placa.rotation.y = Math.PI;
  g.add(placa);
  const sombra = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2).scale(0.55, 1, 1.15),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false }));
  sombra.position.y = 0.03;
  g.add(sombra);
  escena.add(g);
  g.traverse((o) => { if (o.isMesh && o !== sombra) o.castShadow = true; });
  const conductor = persona(eq.piloto);
  const empujador = persona(eq.empuja);
  conductor.pon('montado'); empujador.pon('montado');
  return { g, ruedas, delante, sombra, conductor, empujador, eq };
}

// ─── el estado ─────────────────────────────────────────────────────
const j = {};          // el jugador y su coche
const e = {};          // su empujador
const c = {};          // su conductor, cuando sale volando
let rivales = [];
let peatones = [];
let estado = 'cargando';      // cargando · portada · cuenta · carrera · llegada · pausa
let antes = 'carrera';
let reloj = 0, cuenta = 0, tLlegada = 0, zonaActual = '', sacudida = 0, tPeaton = 0;
const teclas = { izq: false, der: false, empuja: false, freno: false };
let cocheJ, carros = [], eqJ;
// Lo que la pareja elegida cambia de la física: velocidad, empuje y giro.
const ST = { tope: 1, empuje: 1, giro: 1 };

function reinicia() {
  for (const o of obstaculos) { o.tomada = false; o.golpe = -9; if (o.sp) o.sp.visible = true; }
  const grilla = (k) => ({ x: k % 2 ? 1.3 : -1.3, s: SALIDA - 2 - Math.floor(k / 2) * 4.5 - (k % 2) * 1.6 });
  // El jugador sale último, como en todo kart que se respete.
  rivales.forEach((rv, k) => {
    const p = grilla(k);
    Object.assign(rv, { s: p.s, x: p.x, carril: p.x, v: 0, llegada: 0, empuja: true });
  });
  const p = grilla(rivales.length);
  Object.assign(j, { s: p.s, x: p.x, v: 0, vx: 0, h: 0, vh: 0, aire: false, volcado: 0, turbo: 0, giro: 0, puesto: rivales.length + 1, llegada: 0 });
  Object.assign(e, { estado: 'empujando', s: j.s - 1.3, x: j.x, t: 0 });
  Object.assign(c, { suelto: false, s: 0, x: 0, v: 0 });
  for (const pe of peatones) pe.estado = 'libre';
  reloj = 0; zonaActual = ''; sacudida = 0; tPeaton = 1;
  for (const k in stats) stats[k] = 0;
}

// ─── el sonido (el mismo del 2D: ruido que rueda y golpes cortos) ──
const son = { ctx: null, mudo: false };
function arrancaSonido() {
  if (son.ctx) { son.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const a = new AC();
  son.ctx = a;
  son.salida = a.createGain(); son.salida.gain.value = son.mudo ? 0 : 0.8; son.salida.connect(a.destination);
  const ruido = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
  const d = ruido.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  son.ruido = ruido;
  const fuente = a.createBufferSource(); fuente.buffer = ruido; fuente.loop = true;
  son.filtro = a.createBiquadFilter(); son.filtro.type = 'bandpass'; son.filtro.frequency.value = 300; son.filtro.Q.value = 0.8;
  son.traqueteo = a.createGain(); son.traqueteo.gain.value = 0.7;
  son.lfo = a.createOscillator(); son.lfo.type = 'square'; son.lfo.frequency.value = 8;
  son.lfoAmp = a.createGain(); son.lfoAmp.gain.value = 0.05;
  son.lfo.connect(son.lfoAmp); son.lfoAmp.connect(son.traqueteo.gain);
  son.rodar = a.createGain(); son.rodar.gain.value = 0;
  fuente.connect(son.filtro); son.filtro.connect(son.traqueteo); son.traqueteo.connect(son.rodar); son.rodar.connect(son.salida);
  fuente.start(); son.lfo.start();
}
function tono(f, dur, tipo, vol, f2) {
  if (!son.ctx) return;
  const a = son.ctx, t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = tipo || 'sine'; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol || 0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(son.salida); o.start(t); o.stop(t + dur + 0.02);
}
function golpe(vol, corte) {
  if (!son.ctx) return;
  const a = son.ctx, t = a.currentTime, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = son.ruido; f.type = 'lowpass'; f.frequency.value = corte || 600;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  s.connect(f); f.connect(g); g.connect(son.salida); s.start(t, Math.random()); s.stop(t + 0.3);
}
function sonidoRodar() {
  if (!son.ctx) return;
  const sp = (estado === 'carrera' || estado === 'llegada') && !j.aire ? j.v / TOPE : 0;
  const empedrado = ZONAS[zonaEn(j.s)].calle === 'adoquin';
  const t = son.ctx.currentTime;
  son.rodar.gain.setTargetAtTime(Math.min(0.32, sp * 0.34), t, 0.05);
  son.filtro.frequency.setTargetAtTime(180 + sp * 900, t, 0.05);
  son.lfo.frequency.setTargetAtTime(5 + sp * 34, t, 0.05);
  son.lfoAmp.gain.setTargetAtTime(empedrado ? 0.45 : 0.06, t, 0.1);
}

// ─── los avisos ────────────────────────────────────────────────────
function avisa(texto, dur) {
  const el = $('#aviso');
  el.textContent = texto; el.classList.add('is-on');
  clearTimeout(avisa.t); avisa.t = setTimeout(() => el.classList.remove('is-on'), dur || 1600);
}
const PERDONES = ['¡Perdón, vecino!', '¡Cuidado, mijo!', '¡Ay, mi espalda!', '¡Guambras atrevidos!', '¡Fíjense, pues!'];

// ─── la simulación ─────────────────────────────────────────────────
const stats = { vuelcos: 0, atropellos: 0, huecos: 0, saltos: 0, choques: 0, quedado: 0 };
function volcar(motivo) {
  if (j.volcado > 0) return;
  stats.vuelcos++;
  j.volcado = 1.8; j.giroVuelco = 0; j.aire = false; j.h = 0;
  Object.assign(c, { suelto: true, s: j.s, x: j.x, v: j.v * 0.75 });
  cocheJ.conductor.pon('rol', { fundido: 0.08 });
  if (e.estado === 'a_bordo' || e.estado === 'empujando') {
    Object.assign(e, { estado: 'piso', s: j.s - 0.6, x: j.x + (Math.random() - 0.5), t: 1.1, v: j.v * 0.6 });
    cocheJ.empujador.pon('rol', { fundido: 0.08 });
  }
  j.v *= 0.3;
  sacudida = 1.6;
  golpe(0.95, 300); setTimeout(() => golpe(0.6, 500), 180);
  avisa(motivo || '¡Volcaron!', 1500);
}

function endereza() {
  const hw = muestra(j.s).hw;
  j.s = Math.max(j.s, c.s - 0.5);
  j.x = limita(c.x, -(hw - 0.7), hw - 0.7);
  j.v = 0; j.volcado = 0;
  c.suelto = false;
  cocheJ.conductor.pon('montado', { fundido: 0.2 });
}

function sueltaEmpujador(texto) {
  stats.quedado++;
  Object.assign(e, { estado: 'corriendo', s: j.s - 1.3, x: j.x });
  cocheJ.empujador.pon('correr');
  avisa(texto || '¡Se quedó el empujador!', 1400);
}

function actualizaEmpujador(dt) {
  const quiere = teclas.empuja && estado === 'carrera';
  switch (e.estado) {
    case 'a_bordo':
      if (quiere && !j.aire && j.volcado <= 0) {
        if (j.v < CORRE) {
          e.estado = 'empujando'; cocheJ.empujador.pon('correr');
          tono(320, 0.08, 'triangle', 0.15);
        } else if (reloj - (e.tAviso || -9) > 2) { e.tAviso = reloj; avisa('¡Muy rápido para bajarse!', 1100); }
      }
      break;
    case 'empujando':
      if (j.aire || j.volcado > 0) break;
      if (!quiere) {
        if (j.v < CORRE + 0.8) { e.estado = 'a_bordo'; cocheJ.empujador.pon('montado'); tono(520, 0.1, 'triangle', 0.15); }
        else sueltaEmpujador();
      } else if (j.v > CORRE + 0.6) sueltaEmpujador('¡No alcanza! ¡Se quedó!');
      break;
    case 'corriendo':
      e.s += (CORRE + 0.8) * dt;     // corre a todo lo que da para alcanzarlo
      e.x = mezcla(e.x, j.x, Math.min(1, dt * 3));
      if (e.s >= j.s - 1.35 && j.volcado <= 0 && !j.aire) {
        e.estado = quiere ? 'empujando' : 'a_bordo';
        cocheJ.empujador.pon(quiere ? 'correr' : 'montado');
        if (!quiere) avisa('¡Se trepó!', 900);
      }
      break;
    case 'piso':
      e.t -= dt;
      e.v = Math.max(0, (e.v || 0) - 12 * dt);
      e.s += e.v * dt;
      if (e.t <= 0) { e.estado = 'corriendo'; cocheJ.empujador.pon('correr'); }
      break;
  }
}

function actualiza(dt) {
  if (estado === 'cuenta') {
    cuenta -= dt;
    const n = Math.ceil(cuenta);
    if (n !== actualiza.n) {
      actualiza.n = n;
      const el = $('#cuenta');
      el.classList.remove('is-sale'); void el.offsetWidth;
      el.textContent = n > 0 ? String(n) : '¡A bajar!';
      el.classList.add('is-sale');
      tono(n > 0 ? 440 : 880, n > 0 ? 0.18 : 0.45, 'square', 0.12);
    }
    if (cuenta <= 0) estado = 'carrera';
    return;
  }
  if (estado !== 'carrera' && estado !== 'llegada') return;
  if (estado === 'carrera') reloj += dt;

  const m = muestra(j.s);
  const hw = m.hw, pend = m.pend, k = m.k, zona = m.zona;
  if (zona !== zonaActual) {
    zonaActual = zona;
    $('#h-zona').textContent = ZONAS[zona].nombre;
    if (reloj > 1) avisa(ZONAS[zona].nombre);
  }

  actualizaEmpujador(dt);

  if (j.volcado > 0) {
    j.volcado -= dt;
    j.giroVuelco += dt;
    j.v = Math.max(0, j.v - 9 * dt);
    j.s += j.v * dt;
    c.v = Math.max(0, c.v - 10 * dt);
    c.s += c.v * dt;
    if (j.volcado <= 0) endereza();
  } else {
    const mando = estado === 'llegada' ? 0 : (teclas.izq ? -1 : 0) + (teclas.der ? 1 : 0);
    j.giro = mezcla(j.giro, mando, Math.min(1, dt * 8));
    const piedra = ZONAS[zona].calle === 'adoquin';
    let a = -AIRE * j.v * j.v;
    if (!j.aire) {
      a += -G * CUESTA * pend - (piedra ? ROCE_PIEDRA : ROCE);
      if (e.estado === 'empujando') a += EMPUJE * ST.empuje * Math.max(0, 1 - j.v / CORRE) + (j.v < 1 ? 1.2 : 0);
      if (teclas.freno || estado === 'llegada') a -= j.v > 0.2 ? FRENO * (estado === 'llegada' ? 0.4 : 1) : 0;
      if (Math.abs(j.x) > hw) { a -= FUERA; sacudida = Math.max(sacudida, 0.4); }
      j.vx = mando * GIRO * ST.giro * Math.max(j.v, 2.5) - CENTRIFUGA * j.v * j.v * k;
    }
    if (j.turbo > 0) { j.turbo -= dt; a += 4.5; }
    j.v = limita(j.v + a * dt, 0, (j.turbo > 0 ? TOPE_TURBO : TOPE) * ST.tope);
    j.x += j.vx * dt;
    j.s += j.v * dt;

    // En el aire, la calle se va: en una bajada, el salto dura más.
    if (j.aire) {
      j.vh -= G * dt;
      j.h += (j.vh - pend * j.v) * dt;
      if (j.h <= 0) {
        const impacto = j.vh - pend * j.v;
        j.h = 0; j.aire = false;
        golpe(0.6, 450);
        if ((Math.abs(j.giro) > 0.5 && impacto < -3.2) || impacto < -7.5) volcar('¡No se gira en el aire!');
        else {
          sacudida = Math.max(sacudida, 0.8);
          if (e.estado === 'a_bordo' && impacto < -3 && Math.random() < 0.55) {
            Object.assign(e, { estado: 'piso', s: j.s - 0.8, x: j.x, t: 1.3, v: j.v * 0.4 });
            cocheJ.empujador.pon('rol', { fundido: 0.08 });
            avisa('¡Se cayó el empujador!', 1300);
          }
        }
      }
    }

    // Contra las paredes de las casas o los muros del Panecillo.
    const pared = hw + ACERA - 0.35;
    if (Math.abs(j.x) > pared) {
      if (j.v > 8) volcar('¡Contra la pared!');
      else { j.x = Math.sign(j.x) * pared; j.v *= 0.6; sacudida = 0.8; golpe(0.6, 400); }
    }

    // Lo que hay en la calle.
    for (const o of obstaculos) {
      if (o.s < j.s - 2) continue;
      if (o.s > j.s + 2) break;
      if (o.tomada || Math.abs(o.s - j.s) > (o.largo || 0.6)) continue;
      const dx = Math.abs(o.x - j.x);
      if (o.tipo === 'colada' && dx < 0.8 && !j.aire) {
        o.tomada = true; o.sp.visible = false; j.turbo = 1.6;
        tono(660, 0.12, 'triangle', 0.2); setTimeout(() => tono(990, 0.18, 'triangle', 0.2), 90);
        avisa('¡Colada morada!', 900);
      } else if (o.tipo === 'rampa' && dx < o.r && !j.aire && j.v > 3) {
        j.aire = true; j.h = 0.45; j.vh = Math.min(6, j.v * 0.32);
        o.golpe = reloj; tono(200, 0.2, 'sine', 0.2, 400); stats.saltos++;
      } else if (o.tipo === 'hueco' && dx < o.r + 0.2 && !j.aire && reloj - o.golpe > 1) {
        stats.huecos++; o.golpe = reloj; j.v *= 0.78; j.aire = true; j.h = 0.05; j.vh = 1.6; sacudida = 1.1;
        golpe(0.7, 380); avisa('¡Hueco!', 700);
      } else if ((o.tipo === 'farol' || o.tipo === 'puesto' || o.tipo === 'cajon') && dx < o.r + 0.35 && j.h < 0.5 && reloj - o.golpe > 1) {
        o.golpe = reloj;
        if (j.v > 5) volcar(o.tipo === 'puesto' ? '¡Al puesto de la señora!' : o.tipo === 'cajon' ? '¡El cajón!' : '¡Contra el farol!');
        else { j.v = 0.5; j.x += Math.sign(j.x - o.x || 1) * 0.3; golpe(0.6, 400); stats.choques++; }
      }
    }
  }

  // Los rivales, los peatones y los choques entre coches.
  for (const rv of rivales) actualizaRival(rv, dt);
  for (const rv of rivales) {
    const ds = rv.s - j.s, dx = Math.abs(rv.x - j.x);
    if (Math.abs(ds) < 1.9 && dx < 0.72 && j.volcado <= 0) {
      if (ds > 0 && j.v > rv.v) { j.v = rv.v * 0.93; j.s = rv.s - 1.9; sacudida = 0.7; golpe(0.5, 900); }
      else if (ds < 0 && rv.v > j.v) { rv.v = j.v * 0.95; rv.s = j.s - 1.9; j.v += 0.4; }
      rv.x += (rv.x > j.x ? 1 : -1) * dt * 1.5;
    }
  }
  actualizaPeatones(dt);

  sacudida = Math.max(0, sacudida - dt * 2.4);
  for (const o of obstaculos) if (o.sp && o.sp.visible && Math.abs(o.s - j.s) < 120) o.sp.position.y = o.base + Math.sin(reloj * 4 + o.s) * 0.12;

  if (estado === 'carrera' && j.s >= META) {
    j.llegada = reloj; estado = 'llegada'; tLlegada = 0;
    j.puesto = 1 + rivales.filter((rv) => rv.llegada).length;
    tono(523, 0.15, 'triangle', 0.2); setTimeout(() => tono(659, 0.15, 'triangle', 0.2), 140); setTimeout(() => tono(784, 0.4, 'triangle', 0.22), 280);
  }
  if (estado === 'llegada') {
    tLlegada += dt;
    if (tLlegada > 2.4 && $('#llegada').hidden) muestraLlegada();
  }
}

function actualizaRival(rv, dt) {
  const m = muestra(rv.s);
  const hab = rv.cruce.eq.hab;
  let a = -G * CUESTA * m.pend - (ZONAS[m.zona].calle === 'adoquin' ? ROCE_PIEDRA : ROCE) - AIRE * rv.v * rv.v / hab;
  // Su empujador se baja en las subidas y cuando hay que arrancar.
  const debe = rv.v < CORRE - 1.2 && (m.pend > 0.01 || rv.v < 3);
  if (debe !== rv.empuja) {
    rv.empuja = debe;
    rv.cruce.empujador.pon(debe ? 'correr' : 'montado');
  }
  if (rv.empuja) a += EMPUJE * 0.85 * hab * Math.max(0, 1 - rv.v / CORRE) + (rv.v < 1 ? 1 : 0);
  const ventaja = rv.s - j.s;
  if (estado === 'carrera') {
    if (ventaja > 40) a -= 1.2;
    else if (ventaja < -40) a += 0.5;
  }
  let peor = 0;
  for (let d = 0; d < 30; d += 3) peor = Math.max(peor, Math.abs(P.k[limita(Math.floor(rv.s + d), 0, N - 1)]));
  const tope = peor > 0.005 ? Math.min(TOPE, GIRO / (CENTRIFUGA * peor) * (0.86 + 0.08 * hab)) : TOPE;
  rv.v += a * dt;
  if (rv.v > tope) rv.v = Math.max(tope, rv.v - FRENO * 0.7 * dt);
  rv.v = limita(rv.v, 0, TOPE);
  // El carril: lejos de los puestos y de quien va delante más lento.
  let esquiva = 0;
  for (const o of [j, ...rivales]) {
    if (o === rv) continue;
    const ds = o.s - rv.s;
    if (ds > 0 && ds < 9 && rv.v > o.v && Math.abs(o.x - rv.x) < 0.9) { esquiva = o.x > rv.x || rv.x > m.hw - 1.2 ? -1 : 1; break; }
  }
  if (esquiva) rv.x += esquiva * dt * 1.6;
  else {
    if (Math.random() < dt * 0.2) rv.carril = (Math.random() - 0.5) * (m.hw - 1.4) * 2;
    rv.x += limita(rv.carril - rv.x, -dt * 0.8, dt * 0.8);
  }
  rv.x = limita(rv.x, -(m.hw - 1.1), m.hw - 1.1);
  for (const o of rivales) {
    if (o === rv) continue;
    const ds = o.s - rv.s;
    if (ds > 0 && ds < 1.8 && Math.abs(o.x - rv.x) < 0.7 && rv.v > o.v) rv.v = o.v * 0.98;
  }
  rv.s = Math.min(rv.s + rv.v * dt, N - 2);
  if (!rv.llegada && rv.s >= META) rv.llegada = reloj;
}

// Los peatones se cruzan delante, de vereda a vereda. Si les cae un coche
// encima, casi siempre saltan a tiempo; si no, ruedan y se levantan.
function actualizaPeatones(dt) {
  tPeaton -= dt;
  if (tPeaton <= 0 && estado === 'carrera' && CENTRO.has(zonaEn(j.s + 30)) && j.s + 40 < META) {
    tPeaton = 2.2 + Math.random() * 3;
    const pe = peatones.find((p) => p.estado === 'libre');
    if (pe) {
      const s = j.s + 26 + Math.random() * 18, hw = muestra(s).hw;
      const lado = Math.random() < 0.5 ? -1 : 1;
      Object.assign(pe, { estado: 'cruza', s, x: lado * (hw + 0.8), dir: -lado, t: 0, v: 1.25 + Math.random() * 0.4, salto: Math.random() < 0.7 });
      pe.p.pon('andar', { fundido: 0 });
      pe.p.obj.visible = true;
    }
  }
  for (const pe of peatones) {
    if (pe.estado === 'libre') { pe.p.obj.visible = false; continue; }
    const hw = muestra(pe.s).hw;
    if (pe.estado === 'cruza') {
      pe.x += pe.dir * pe.v * dt;
      const ds = pe.s - j.s;
      if (pe.salto && ds > 2 && ds < 7 + j.v * 0.4 && Math.abs(pe.x - j.x) < 1.3 && j.volcado <= 0) {
        pe.estado = 'esquiva'; pe.t = 0; pe.dir = pe.x > j.x ? 1 : -1;
        pe.p.pon('salto', { una: true, fundido: 0.08, vel: 1.6 });
      }
      if (Math.abs(pe.x) > hw + 1.2 && Math.sign(pe.x) === pe.dir) pe.estado = 'libre';
    } else if (pe.estado === 'esquiva') {
      pe.t += dt;
      pe.x += pe.dir * 3.6 * Math.max(0, 1 - pe.t) * dt;
      if (pe.t > 1.1) { pe.estado = 'cruza'; pe.p.pon('andar'); }
    } else if (pe.estado === 'tumbado') {
      pe.t += dt;
      pe.s += pe.vs * dt; pe.vs = Math.max(0, pe.vs - 8 * dt);
      pe.x += pe.dir * 1.5 * Math.max(0, 1 - pe.t) * dt;
      if (pe.t > 2.4) { pe.estado = 'cruza'; pe.salto = false; pe.dir = Math.sign(pe.x) || 1; pe.p.pon('andar'); }
    }
    if ((pe.estado === 'cruza' || pe.estado === 'esquiva') && Math.abs(pe.s - j.s) < 1.1 && Math.abs(pe.x - j.x) < 0.65 && j.volcado <= 0 && j.h < 0.6) {
      pe.estado = 'tumbado'; pe.t = 0; pe.vs = j.v * 0.5; pe.dir = pe.x > j.x ? 1 : -1;
      pe.p.pon('rol', { fundido: 0.06 });
      j.v *= 0.55; sacudida = 1; golpe(0.6, 700); stats.atropellos++;
      avisa(PERDONES[Math.floor(Math.random() * PERDONES.length)], 1300);
    }
    if (pe.s < j.s - 25) pe.estado = 'libre';
  }
}

// ─── el dibujo ─────────────────────────────────────────────────────
const _v = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

// Pone un grupo sobre la calle en (s, x, h), mirando hacia delante, con la
// pendiente y un giro de más.
function colocaEnCalle(obj, s, x, h, giro, alabeo) {
  const m = muestra(s);
  punto(s, x, h, obj.position);
  _e.set(-Math.atan(m.pend), m.th + (giro || 0), alabeo || 0, 'YXZ');
  obj.quaternion.setFromEuler(_e);
}

// La tripulación, sentada o empujando, va pegada al coche.
function enCoche(persona, coche, z, pose) {
  const off = persona.apoyo(pose);
  _v.set(0, pose === 'montado' ? TABLA + 0.03 + off - persona.pie : 0, z);
  coche.localToWorld(_v);
  persona.obj.position.copy(_v);
  persona.obj.quaternion.copy(coche.quaternion);
  if (persona.tambalea) persona.obj.rotateZ(Math.sin(performance.now() / 260) * 0.14);
}

function colocaCoche(cc, s, x, h, giro, vuelco, v, dt) {
  colocaEnCalle(cc.g, s, x, h, giro * 0.18, vuelco);
  cc.g.updateMatrixWorld(true);
  cc.delante.rotation.y = -giro * 0.35;
  for (const w of cc.ruedas) w.rotation.x += (v * dt) / 0.09;
  cc.sombra.visible = Math.abs(vuelco) < 0.3;
}

function dibujaMundo(dt) {
  // El coche del jugador.
  let alabeo = 0, salto = 0;
  if (j.volcado > 0) {
    const t = j.giroVuelco;
    alabeo = t < 0.6 ? t / 0.6 * Math.PI * 1.5 : t < 1.3 ? Math.PI * 1.5 : Math.PI * 1.5 + Math.min(1, (t - 1.3) / 0.5) * Math.PI * 0.5;
    salto = t < 0.6 ? Math.sin(t / 0.6 * Math.PI) * 0.9 : 0;
  }
  const temblor = quieto.matches ? 0 : (Math.random() - 0.5) * (ZONAS[zonaEn(j.s)].calle === 'adoquin' ? j.v / TOPE * 0.05 : 0.01);
  const enAcera = Math.abs(j.x) > muestra(j.s).hw ? BORDILLO : 0;
  colocaCoche(cocheJ, j.s, j.x, j.h + salto + temblor + enAcera, j.giro, alabeo, j.v, dt);
  if (c.suelto) colocaEnCalle(cocheJ.conductor.obj, c.s + 1, c.x + 0.4, 0, 0.3);
  else enCoche(cocheJ.conductor, cocheJ.g, 0.32, 'montado');
  if (e.estado === 'a_bordo') enCoche(cocheJ.empujador, cocheJ.g, -0.5, 'montado');
  else if (e.estado === 'empujando') {
    enCoche(cocheJ.empujador, cocheJ.g, -1.3, 'correr');
    cocheJ.empujador.acciones.correr.timeScale = 0.6 + j.v / CORRE * 0.8;
  } else {
    colocaEnCalle(cocheJ.empujador.obj, e.s, e.x, 0, 0, cocheJ.empujador.tambalea && e.estado === 'corriendo' ? Math.sin(performance.now() / 200) * 0.2 : 0);
    if (e.estado === 'corriendo') cocheJ.empujador.acciones.correr.timeScale = 1.3;
  }

  // Los rivales.
  for (const rv of rivales) {
    colocaCoche(rv.cruce, rv.s, rv.x, 0, 0, 0, rv.v, dt);
    enCoche(rv.cruce.conductor, rv.cruce.g, 0.32, 'montado');
    if (rv.empuja) enCoche(rv.cruce.empujador, rv.cruce.g, -1.3, 'correr');
    else enCoche(rv.cruce.empujador, rv.cruce.g, -0.5, 'montado');
  }
  // Los peatones.
  for (const pe of peatones) {
    if (pe.estado === 'libre') continue;
    const giro = pe.estado === 'tumbado' ? 0 : (pe.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    colocaEnCalle(pe.p.obj, pe.s, pe.x, Math.abs(pe.x) > muestra(pe.s).hw ? BORDILLO : 0, giro);
  }

  // Las animaciones.
  for (const cc of [cocheJ, ...rivales.map((rv) => rv.cruce)]) for (const p of [cc.conductor, cc.empujador]) p.mixer.update(dt);
  for (const pe of peatones) if (pe.estado !== 'libre') pe.p.mixer.update(dt);
}

let camS = 0;
function dibujaCamara(dt) {
  // Mientras se vuelca, la cámara se queda atrás y llega tarde: se ve el
  // tumbo entero en vez de pegada a la tabla.
  camS = j.volcado > 0 ? mezcla(camS, j.s, Math.min(1, dt * 1.5)) : j.s;
  const lejos = 5.4 + j.v * 0.06;
  const objetivo = punto(camS - lejos, j.x * 0.8, 2.25 + j.v * 0.02);
  // La cámara no se mete bajo la calle en las bajadas fuertes.
  const suelo = muestra(camS - lejos).y + 1.2;
  if (objetivo.y < suelo) objetivo.y = suelo;
  const mira = punto(camS + 7, j.x * 0.6, 0.9 + j.h * 0.5);
  // Si la cámara quedó lejos (al empezar o tras un salto de tiempo), se
  // pone en su sitio de golpe: deslizarse cien metros la mete en las casas.
  if (camara.position.distanceToSquared(objetivo) > 225) camara.position.copy(objetivo);
  else camara.position.lerp(objetivo, Math.min(1, dt * 6));
  if (sacudida > 0 && !quieto.matches) camara.position.add(_v.set((Math.random() - 0.5) * sacudida * 0.12, (Math.random() - 0.5) * sacudida * 0.12, 0));
  camara.lookAt(mira);
  const fov = 60 + 12 * Math.min(1, j.v / TOPE) + (j.turbo > 0 ? 6 : 0);
  if (Math.abs(camara.fov - fov) > 0.05) { camara.fov = mezcla(camara.fov, fov, Math.min(1, dt * 3)); camara.updateProjectionMatrix(); }
  panorama.position.set(camara.position.x, camara.position.y + 30, camara.position.z);
  sigueSol(cocheJ.g.position);
}

// La portada: la cámara gira despacio alrededor de la parrilla.
// La portada: la cámara gira despacio alrededor de la pareja elegida,
// como en la pantalla de selección de un kart.
function dibujaPortada(t) {
  const centro = cocheJ ? cocheJ.g.position.clone().add(_v.set(0, 0.75, 0)) : punto(SALIDA - 4, 0, 1);
  const ang = t * 0.35 + 0.6;
  camara.position.set(centro.x + Math.sin(ang) * 3.6, centro.y + 0.9, centro.z + Math.cos(ang) * 3.6);
  camara.lookAt(centro);
  // Que la pareja quede fuera del panel: a la derecha en pantalla ancha,
  // arriba en el teléfono.
  const W = innerWidth, H = innerHeight;
  if (W >= 900) camara.setViewOffset(W, H, -W * 0.2, 0, W, H);
  else camara.setViewOffset(W, H, 0, H * 0.3, W, H);
  camara.fov = 50; camara.updateProjectionMatrix();
  panorama.position.set(camara.position.x, camara.position.y + 30, camara.position.z);
  sigueSol(centro);
  if (publico) publico.coloca(t, j.s);
}

// ─── el HUD ────────────────────────────────────────────────────────
const hud = {
  puesto: $('#h-puesto'), tiempo: $('#h-tiempo'), vel: $('#h-vel'),
  empujador: $('#h-empujador'), ruta: $('#h-ruta > i'), turbo: $('#h-turbo'),
};
const formato = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};
const ESTADOS_EMPUJADOR = { a_bordo: 'A bordo', empujando: 'Empujando', corriendo: 'Se quedó atrás', piso: 'En el piso' };
let ultimoHud = {};
function pintaHud() {
  const puesto = estado === 'llegada' ? j.puesto : 1 + rivales.filter((rv) => rv.s > j.s).length;
  const datos = {
    puesto: String(puesto),
    tiempo: formato(estado === 'llegada' ? j.llegada : reloj),
    vel: String(Math.round(j.v * 3.6)),
    empujador: ESTADOS_EMPUJADOR[e.estado],
    ruta: `${Math.round(limita((j.s - SALIDA) / (META - SALIDA), 0, 1) * 100)}%`,
  };
  if (datos.puesto !== ultimoHud.puesto) hud.puesto.textContent = datos.puesto;
  if (datos.tiempo !== ultimoHud.tiempo) hud.tiempo.textContent = datos.tiempo;
  if (datos.vel !== ultimoHud.vel) hud.vel.textContent = datos.vel;
  if (datos.empujador !== ultimoHud.empujador) {
    hud.empujador.textContent = datos.empujador;
    hud.empujador.dataset.estado = e.estado;
  }
  if (datos.ruta !== ultimoHud.ruta) hud.ruta.style.width = datos.ruta;
  hud.turbo.hidden = !(j.turbo > 0);
  ultimoHud = datos;
}

// ─── la llegada ────────────────────────────────────────────────────
const PUESTOS = ['Primer puesto', 'Segundo puesto', 'Tercer puesto', 'Cuarto puesto', 'Quinto puesto'];
const FRASES = [
  'Llegaste primero a la Plaza Grande. Ni el Chulla te vio pasar.',
  'Segundo, por una tabla. La próxima, que el empujador se baje antes en la García Moreno.',
  'Al podio. La horquilla del Panecillo se puede bajar más rápido, y con los dos arriba.',
  'Cuarto. Los huecos de la Ambato no perdonan.',
  'Último, pero enteros los dos, que en coche de madera ya es bastante.',
];
function muestraLlegada() {
  const p = j.puesto;
  $('#l-puesto').textContent = PUESTOS[p - 1];
  $('#l-desc').textContent = `Bajaste en ${formato(j.llegada)}. ${FRASES[p - 1]}`;
  $('#disco-trofeo').style.display = p <= 3 ? '' : 'none';
  $('#disco-coche').setAttribute('transform', p <= 3 ? '' : 'translate(-30 -86) scale(1.4)');
  const filas = rivales.map((rv) => ({ nombre: rv.cruce.eq.nombre, t: rv.llegada || reloj + Math.max(0, META - rv.s) / Math.max(rv.v, 4) }));
  filas.push({ nombre: `${eqJ.nombre} (tú)`, t: j.llegada, tu: true });
  filas.sort((a, b) => a.t - b.t);
  const lista = $('#l-podio');
  lista.textContent = '';
  filas.forEach((f, k) => {
    const li = document.createElement('li');
    if (f.tu) li.className = 'es-tu';
    const n = document.createElement('span'); n.textContent = `${k + 1}. ${f.nombre}`;
    const t = document.createElement('span'); t.textContent = formato(f.t);
    li.append(n, t); lista.append(li);
  });
  let record = null;
  try { record = parseFloat(localStorage.getItem('coches3d-record')); } catch (err) { /* sin almacenamiento */ }
  if (!record || j.llegada < record) {
    try { localStorage.setItem('coches3d-record', String(j.llegada)); } catch (err) { /* sin almacenamiento */ }
    $('#l-kicker').textContent = record ? 'Plaza Grande · ¡récord nuevo!' : 'Plaza Grande';
  } else $('#l-kicker').textContent = `Plaza Grande · tu récord: ${formato(record)}`;
  $('#hud').hidden = true; $('#mandos').hidden = true;
  $('#llegada').hidden = false;
  $('#llegada').focus();
}
function muestraRecord() {
  let record = null;
  try { record = parseFloat(localStorage.getItem('coches3d-record')); } catch (err) { /* sin almacenamiento */ }
  $('#record').textContent = record ? `Tu mejor bajada: ${formato(record)}` : '';
}

// ─── elegir pareja ─────────────────────────────────────────────────
function eligePareja(id) {
  eqJ = EQUIPOS.find((q) => q.id === id);
  cocheJ = carros.find((c2) => c2.cruce.eq === eqJ).cruce;
  rivales = carros.filter((c2) => c2.cruce !== cocheJ);
  ST.tope = 0.94 + 0.03 * eqJ.stats[0];
  ST.empuje = 0.85 + 0.075 * eqJ.stats[1];
  ST.giro = 0.9 + 0.05 * eqJ.stats[2];
  reinicia();
  // En la parrilla, los de atrás están listos para empujar.
  for (const cc of carros) { cc.cruce.conductor.pon('montado', { fundido: 0 }); cc.cruce.empujador.pon('correr', { fundido: 0 }); }
  Object.assign(e, { estado: 'empujando' });
  try { localStorage.setItem('coches3d-pareja', id); } catch (err) { /* sin almacenamiento */ }
  for (const b of document.querySelectorAll('#parejas .chip')) b.setAttribute('aria-checked', String(b.dataset.id === id));
  $('#pareja-nombre').textContent = eqJ.nombre;
  $('#pareja-lema').textContent = eqJ.lema;
  $('#pareja-stats').innerHTML = STATS.map((n, k) => `<div><dt>${n}</dt><dd><div class="medidor" role="img" aria-label="${eqJ.stats[k]} de 5">${
    [1, 2, 3, 4, 5].map((v) => `<i${v <= eqJ.stats[k] ? ' class="lleno"' : ''}></i>`).join('')}</div></dd></div>`).join('');
}
{
  const caja = $('#parejas');
  for (const q of EQUIPOS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.id = q.id;
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
    b.textContent = q.nombre;
    b.addEventListener('click', () => { if (estado === 'portada') eligePareja(q.id); });
    caja.append(b);
  }
}

// ─── el flujo ──────────────────────────────────────────────────────
let esTactil = tactilMQ.matches;
function empieza() {
  if (estado === 'cargando') return;
  arrancaSonido();
  reinicia();
  for (const cc of [cocheJ, ...rivales.map((rv) => rv.cruce)]) cc.conductor.pon('montado');
  cocheJ.empujador.pon('correr');
  for (const rv of rivales) rv.cruce.empujador.pon('correr');
  $('#portada').hidden = true; $('#pausa').hidden = true; $('#llegada').hidden = true;
  $('#hud').hidden = false;
  $('#mandos').hidden = !esTactil;
  estado = 'cuenta'; cuenta = 3; actualiza.n = null;
  $('#h-zona').textContent = ZONAS.panecillo.nombre;
  camS = j.s;
  punto(camS - 5.4, j.x * 0.8, 2.25, camara.position);
  camara.clearViewOffset();
  camara.fov = 60; camara.updateProjectionMatrix();
}
function pausa() {
  if (estado !== 'carrera' && estado !== 'cuenta') return;
  antes = estado; estado = 'pausa';
  $('#pausa').hidden = false;
  $('#b-seguir').focus();
  if (son.ctx) son.ctx.suspend();
}
function sigue() {
  if (estado !== 'pausa') return;
  estado = antes; $('#pausa').hidden = true;
  if (son.ctx) son.ctx.resume();
}

$('#b-empezar').addEventListener('click', empieza);
$('#b-pausa').addEventListener('click', pausa);
$('#b-seguir').addEventListener('click', sigue);
$('#b-reintentar').addEventListener('click', empieza);
$('#llegada').addEventListener('click', empieza);
$('#llegada').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); empieza(); } });
$('#b-sonido').addEventListener('click', (ev) => {
  son.mudo = !son.mudo;
  ev.currentTarget.setAttribute('aria-pressed', String(son.mudo));
  ev.currentTarget.setAttribute('aria-label', son.mudo ? 'Activar el sonido' : 'Silenciar');
  ev.currentTarget.style.opacity = son.mudo ? 0.5 : '';
  if (son.salida) son.salida.gain.value = son.mudo ? 0 : 0.8;
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pausa(); });

const MAPA = {
  ArrowLeft: 'izq', KeyA: 'izq', ArrowRight: 'der', KeyD: 'der',
  ArrowUp: 'empuja', KeyW: 'empuja', Space: 'empuja', ArrowDown: 'freno', KeyS: 'freno',
};
addEventListener('keydown', (ev) => {
  if (ev.code === 'Escape' || ev.code === 'KeyP') { if (estado === 'pausa') sigue(); else pausa(); return; }
  const t = MAPA[ev.code];
  if (!t || estado === 'portada' || estado === 'llegada' || estado === 'pausa' || estado === 'cargando') return;
  ev.preventDefault();
  teclas[t] = true;
});
addEventListener('keyup', (ev) => { const t = MAPA[ev.code]; if (t) teclas[t] = false; });
addEventListener('blur', () => { for (const k in teclas) teclas[k] = false; });

const marcaTactil = () => {
  document.body.classList.toggle('tactil', esTactil);
  document.body.classList.toggle('con-mandos', esTactil);
};
marcaTactil();
addEventListener('touchstart', () => {
  if (esTactil) return;
  esTactil = true; marcaTactil();
  if (estado === 'carrera' || estado === 'cuenta') $('#mandos').hidden = false;
}, { passive: true });
for (const b of document.querySelectorAll('.coches-mando')) {
  const t = b.dataset.tecla;
  const on = (ev) => { ev.preventDefault(); b.setPointerCapture?.(ev.pointerId); teclas[t] = true; b.classList.add('is-on'); };
  const off = () => { teclas[t] = false; b.classList.remove('is-on'); };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off);
  b.addEventListener('lostpointercapture', off);
  b.addEventListener('contextmenu', (ev) => ev.preventDefault());
}

function mide() {
  render.setPixelRatio(Math.min(window.devicePixelRatio || 1, tactilMQ.matches ? 1.5 : 2));
  render.setSize(innerWidth, innerHeight, false);
  camara.aspect = innerWidth / innerHeight;
  // En vertical se abre el ángulo para que quepa la calzada entera.
  camara.zoom = innerWidth < innerHeight ? 0.7 : 1;
  camara.updateProjectionMatrix();
}
addEventListener('resize', mide);

let previo = performance.now(), acum = 0;
const PASO = 1 / 60;
function bucle(ahora) {
  const dt = Math.min(0.1, (ahora - previo) / 1000);
  previo = ahora;
  if (estado === 'portada' || estado === 'cargando') {
    if (cocheJ) dibujaMundo(dt);
    dibujaPortada(ahora / 1000);
    render.render(escena, camara);
  } else if (estado !== 'pausa') {
    acum += dt;
    while (acum >= PASO) { actualiza(PASO); acum -= PASO; }
    dibujaMundo(dt);
    dibujaCamara(dt);
    if (publico) publico.coloca(ahora / 1000, j.s);
    render.render(escena, camara);
    if (estado === 'carrera' || estado === 'llegada') pintaHud();
    sonidoRodar();
  }
  requestAnimationFrame(bucle);
}

// ─── la carga ──────────────────────────────────────────────────────
async function carga() {
  const boton = $('#b-empezar');
  const texto = boton.querySelector('span');
  const nombres = ['base-chico', 'base-chica', 'generico', 'policia', 'ministro', 'animaciones', 'quito'];
  let listos = 0;
  const cargador = new GLTFLoader();
  const pide = (n) => cargador.loadAsync(modeloUrl(n)).then((g) => {
    listos++;
    texto.textContent = `Cargando… ${Math.round((listos / nombres.length) * 100)}%`;
    return g;
  });
  const [chico, chica, generico, policia, ministro, anim, quito] = await Promise.all(nombres.map(pide));
  Object.assign(MODELOS, { 'base-chico': chico, 'base-chica': chica, generico, policia, ministro });
  for (const n of ['montado', 'correr', 'rol', 'golpe', 'salto', 'arrancar']) {
    const clip = anim.animations.find((a) => a.name === n);
    if (clip) CLIPS[n] = limpiaClip(clip);
  }
  construyeDecorado(quito);
  carros = EQUIPOS.map((eq) => ({ cruce: construyeCoche(eq) }));
  peatones = ['generico', 'policia', 'ministro', 'generico', 'ministro', 'policia'].map((n) => {
    const p = new Persona(n, { altura: ADULTO * (n === 'ministro' ? 1.04 : 1) });
    p.obj.visible = false;
    return { p, estado: 'libre', s: 0, x: 0 };
  });
  let guardada = null;
  try { guardada = localStorage.getItem('coches3d-pareja'); } catch (err) { /* sin almacenamiento */ }
  eligePareja(EQUIPOS.some((q) => q.id === guardada) ? guardada : EQUIPOS[0].id);
  estado = 'portada';
  boton.disabled = false;
  texto.textContent = 'A bajar';
}

construyePista();
construyeCalle();
construyePanorama();
mide();
muestraRecord();
requestAnimationFrame(bucle);
carga().catch((err) => {
  console.error(err);
  $('#b-empezar').querySelector('span').textContent = 'No cargó: recarga la página';
});

// Para probar desde la consola sin jugar entero.
window.coches = {
  estado: () => ({ estado, reloj, v: j.v, s: j.s, x: j.x, h: j.h, aire: j.aire, volcado: j.volcado, empujador: e.estado, puesto: j.puesto, zona: zonaEn(j.s), meta: META }),
  curva: (s) => P.k[limita(Math.floor(s), 0, N - 1)], tope: (k) => GIRO / (CENTRIFUGA * Math.max(k, 1e-4)), hw: (s) => muestra(s).hw, teclas, empieza,
  // Avanza la simulación sin dibujar, para las pruebas automáticas.
  volcar: () => volcar(),
  peatones: () => peatones.filter((p) => p.estado !== 'libre').map((p) => ({ estado: p.estado, ds: +(p.s - j.s).toFixed(1), x: +p.x.toFixed(1) })),
  simula: (seg, piloto) => { for (let k = 0; k < seg * 60; k++) { if (piloto) piloto(); actualiza(PASO); } },
  obstaculos: () => obstaculos.map((o) => ({ s: o.s, x: o.x, tipo: o.tipo })),
  stats: () => ({ ...stats, rivales: rivales.map((rv) => [rv.cruce.eq.nombre, Math.round(rv.s), rv.llegada && rv.llegada.toFixed(1)]) }),
};
