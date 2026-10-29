/* Coches de madera · la bajada del Panecillo, en 3D.

   Lo gracioso de un coche de madera no es la velocidad: es que van dos. Uno
   maneja con los pies y la soga; el otro empuja a pie, pegado al coche, y
   se sube solo cuando la cosa ya rueda. En las subidas hay que bajarlo a
   empujar. Y en las rampas y contra los puestos de la vereda, se caen los
   dos.

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
const CUESTA = 1.8;           // la cuesta tira bastante más que en la vida: es un juego
const ROCE = 0.12;            // rulimanes contra el asfalto…
const ROCE_PIEDRA = 0.22;     // …y contra el empedrado, que frena y traquetea
const AIRE = 0.0018;
const TOPE = 40;              // ~145 km/h, lo más que da la bajada grande
const TOPE_TURBO = 46;
const EMPUJE = 7.5;           // lo que empuja el que va atrás…
const CORRE = 10;             // …y lo más rápido que corre
const ENGANCHE = CORRE + 0.8; // a esta velocidad, el de atrás se sube solo
const FRENO = 11;
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




// La Basílica del Voto Nacional: gótica, de piedra gris, con dos torres de aguja.
const basilica = () => lienzo(480, 720, (c, w, h) => {
  const piedra = '#A39F97', sombra = '#827E76';
  const torre = (x) => {
    c.fillStyle = piedra; c.fillRect(x, 180, 110, h - 180);
    c.fillStyle = sombra; c.fillRect(x + 84, 180, 26, h - 180);
    for (const y of [250, 380]) {
      c.fillStyle = '#3B3633'; c.beginPath();
      c.moveTo(x + 35, y + 80); c.lineTo(x + 35, y + 24); c.lineTo(x + 55, y); c.lineTo(x + 75, y + 24); c.lineTo(x + 75, y + 80); c.fill();
    }
    c.fillStyle = sombra; c.beginPath(); c.moveTo(x - 4, 184); c.lineTo(x + 55, 6); c.lineTo(x + 114, 184); c.fill();
    c.fillStyle = piedra; c.beginPath(); c.moveTo(x + 8, 184); c.lineTo(x + 55, 36); c.lineTo(x + 66, 184); c.fill();
  };
  torre(10); torre(w - 120);
  c.fillStyle = piedra; c.fillRect(120, 300, w - 240, h - 300);
  c.fillStyle = sombra; c.beginPath(); c.moveTo(114, 304); c.lineTo(w / 2, 214); c.lineTo(w - 114, 304); c.fill();
  // el rosetón
  c.fillStyle = '#3F6F8F'; c.beginPath(); c.arc(w / 2, 390, 46, 0, 7); c.fill();
  c.strokeStyle = '#D9A93A'; c.lineWidth = 3;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.beginPath(); c.moveTo(w / 2, 390); c.lineTo(w / 2 + Math.cos(a) * 46, 390 + Math.sin(a) * 46); c.stroke(); }
  c.strokeStyle = TINTA; c.lineWidth = 4; c.beginPath(); c.arc(w / 2, 390, 46, 0, 7); c.stroke();
  // la puerta ojival
  c.fillStyle = '#4A3424'; c.beginPath();
  c.moveTo(w / 2 - 50, h); c.lineTo(w / 2 - 50, h - 120); c.lineTo(w / 2, h - 196); c.lineTo(w / 2 + 50, h - 120); c.lineTo(w / 2 + 50, h); c.fill();
  c.fillStyle = '#B5AE9F'; c.fillRect(0, h - 24, w, 24);
});

// El Santuario de Guápulo: fachada blanca, la torre a un lado y la cúpula detrás.
const santuario = () => lienzo(460, 560, (c, w, h) => {
  cupula(c, w * 0.42, 220, 100, '#C8742E', '#E8DCC6');
  c.fillStyle = '#F4F1EA'; c.fillRect(30, 236, w - 150, h - 236);
  c.fillStyle = '#E9E4D8'; c.beginPath(); c.moveTo(24, 240); c.lineTo((w - 120) / 2 + 15, 176); c.lineTo(w - 114, 240); c.fill();
  c.fillStyle = '#F4F1EA'; c.fillRect(w - 120, 116, 100, h - 116);
  c.fillStyle = 'rgba(0,0,0,.07)'; c.fillRect(w - 44, 116, 24, h - 116);
  arcos(c, w - 110, 236, 80, 70, 2, '#3B3633');
  cupula(c, w - 70, 122, 46, '#C8742E', '#E8DCC6');
  c.fillStyle = '#5A3A1E'; c.beginPath(); c.moveTo(150, h); c.lineTo(150, h - 130); c.arc(195, h - 130, 45, Math.PI, 0); c.lineTo(240, h); c.fill();
  c.fillStyle = '#3F6F8F'; c.beginPath(); c.arc(195, 310, 26, 0, 7); c.fill();
  c.fillStyle = '#B5AE9F'; c.fillRect(0, h - 22, w, 22);
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

// El halo de un farol encendido, para la noche.
const halo = () => lienzo(64, 64, (c, w, h) => {
  const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,225,140,.9)'); g.addColorStop(0.35, 'rgba(255,190,90,.35)'); g.addColorStop(1, 'rgba(255,170,60,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
});

// ─── los fuegos artificiales ───────────────────────────────────────
// Un puñado de cohetes a la vez: cada uno, cuarenta y ocho chispas de un
// color que salen de un punto, caen y se apagan. Todo en un solo Points.
const fuegos = { n: 6, k: 64, activos: [], points: null, mats: null, datos: null, siguiente: 0 };
function preparaFuegos() {
  const total = fuegos.n * fuegos.k;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
  const mat = new THREE.PointsMaterial({ size: 3.6, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, map: textura(halo()), alphaTest: 0.02 });
  fuegos.points = new THREE.Points(geo, mat);
  fuegos.points.frustumCulled = false;
  fuegos.points.visible = false;
  escena.add(fuegos.points);
  fuegos.datos = Array.from({ length: fuegos.n }, () => ({ vivo: false, t: 0, x: 0, y: 0, z: 0, vel: new Float32Array(fuegos.k * 3), color: new THREE.Color() }));
}
function lanzaCohete(centroS) {
  const d = fuegos.datos.find((q) => !q.vivo); if (!d) return;
  const r = Math.random;
  // Lejos y no muy alto, para que quepan en el encuadre de la carrera.
  const p = punto(centroS + 90 + r() * 150, (r() - 0.5) * 70, 14 + r() * 16);
  Object.assign(d, { vivo: true, t: 0, x: p.x, y: p.y, z: p.z });
  d.color.setHSL(r(), 0.9, 0.6);
  for (let i = 0; i < fuegos.k; i++) {
    const th = r() * Math.PI * 2, ph = Math.acos(2 * r() - 1), v = 6 + r() * 6;
    d.vel[i * 3] = Math.sin(ph) * Math.cos(th) * v; d.vel[i * 3 + 1] = Math.cos(ph) * v; d.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * v;
  }
  if (son.ctx && !son.mudo) { tono(300 + r() * 200, 0.5, 'sine', 0.08, 90); setTimeout(() => golpe(0.25, 1200), 60); }
}
function animaFuegos(dt, centroS) {
  if (!noche || !fuegos.points) { if (fuegos.points) fuegos.points.visible = false; return; }
  fuegos.points.visible = true;
  fuegos.siguiente -= dt;
  if (fuegos.siguiente <= 0) { lanzaCohete(centroS); fuegos.siguiente = 0.7 + Math.random() * 1.6; }
  const pos = fuegos.points.geometry.attributes.position, col = fuegos.points.geometry.attributes.color;
  fuegos.datos.forEach((d, n) => {
    if (d.vivo) { d.t += dt; if (d.t > 1.7) d.vivo = false; }
    const apaga = d.vivo ? Math.max(0, 1 - d.t / 1.7) : 0;
    for (let i = 0; i < fuegos.k; i++) {
      const idx = n * fuegos.k + i;
      if (!d.vivo) { pos.setXYZ(idx, 0, -999, 0); col.setXYZ(idx, 0, 0, 0); continue; }
      const t = d.t;
      pos.setXYZ(idx, d.x + d.vel[i * 3] * t, d.y + d.vel[i * 3 + 1] * t - 4 * t * t, d.z + d.vel[i * 3 + 2] * t);
      const chispa = apaga * (1.1 + 0.6 * Math.sin(t * 30 + i));
      col.setXYZ(idx, d.color.r * chispa, d.color.g * chispa, d.color.b * chispa);
    }
  });
  pos.needsUpdate = true; col.needsUpdate = true;
}

// ─── las estampitas ────────────────────────────────────────────────
// El álbum de las Fiestas: estampitas escondidas por las pistas, tres por
// pista, que se guardan al tocarlas. Cada una lleva un dibujo (uno de los
// pintores de fachadas, o uno propio) y dónde está.
const ICONOS = {
  banderin: (c, w, h) => {
    c.strokeStyle = TINTA; c.lineWidth = 4; c.beginPath(); c.moveTo(6, 20); c.quadraticCurveTo(w / 2, 46, w - 6, 20); c.stroke();
    const col = ['#D6382B', '#1B5FAA', '#F5C518', '#2E7D4F', '#E01B6A', '#F3F1EC'];
    for (let k = 0; k < 6; k++) {
      const t = (k + 0.5) / 6, x = 6 + (w - 12) * t, y = 20 + 26 * 4 * t * (1 - t);
      c.fillStyle = col[k]; c.beginPath(); c.moveTo(x - 9, y); c.lineTo(x + 9, y); c.lineTo(x, y + 26); c.closePath(); c.fill(); c.stroke();
    }
  },
  guagua: (c, w, h) => {
    c.fillStyle = '#E2B13C'; c.strokeStyle = TINTA; c.lineWidth = 4;
    c.beginPath(); c.ellipse(w / 2, h * 0.62, w * 0.26, h * 0.3, 0, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.arc(w / 2, h * 0.3, w * 0.18, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#F3F1EC'; c.beginPath(); c.ellipse(w / 2, h * 0.64, w * 0.14, h * 0.2, 0, 0, 7); c.fill();
    c.fillStyle = TINTA; c.beginPath(); c.arc(w / 2 - 7, h * 0.28, 2.5, 0, 7); c.arc(w / 2 + 7, h * 0.28, 2.5, 0, 7); c.fill();
    c.strokeStyle = '#D6382B'; c.lineWidth = 3; c.beginPath(); c.moveTo(w / 2 - 12, h * 0.52); c.lineTo(w / 2 + 12, h * 0.52); c.stroke();
  },
  canelazo: (c, w, h) => {
    c.fillStyle = '#C8955A'; c.strokeStyle = TINTA; c.lineWidth = 4;
    c.beginPath(); c.moveTo(w * 0.28, h * 0.3); c.lineTo(w * 0.72, h * 0.3); c.lineTo(w * 0.66, h * 0.88); c.lineTo(w * 0.34, h * 0.88); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#E8862C'; c.fillRect(w * 0.31, h * 0.34, w * 0.38, h * 0.1);
    c.beginPath(); c.moveTo(w * 0.72, h * 0.42); c.quadraticCurveTo(w * 0.95, h * 0.5, w * 0.7, h * 0.7); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 3; c.lineCap = 'round';
    for (const x of [w * 0.42, w * 0.52, w * 0.62]) { c.beginPath(); c.moveTo(x, h * 0.24); c.quadraticCurveTo(x - 5, h * 0.15, x, h * 0.06); c.stroke(); }
  },
  chiva: (c, w, h) => {
    c.fillStyle = '#D6382B'; c.strokeStyle = TINTA; c.lineWidth = 4;
    c.fillRect(w * 0.1, h * 0.3, w * 0.8, h * 0.4); c.strokeRect(w * 0.1, h * 0.3, w * 0.8, h * 0.4);
    c.fillStyle = '#F5C518'; c.fillRect(w * 0.1, h * 0.2, w * 0.8, h * 0.12); c.strokeRect(w * 0.1, h * 0.2, w * 0.8, h * 0.12);
    c.fillStyle = '#1B5FAA'; for (let k = 0; k < 3; k++) c.fillRect(w * (0.18 + k * 0.24), h * 0.36, w * 0.16, h * 0.2);
    c.fillStyle = '#2E7D4F'; c.fillRect(w * 0.1, h * 0.52, w * 0.8, h * 0.06);
    c.fillStyle = '#333'; for (const x of [w * 0.28, w * 0.72]) { c.beginPath(); c.arc(x, h * 0.74, w * 0.09, 0, 7); c.fill(); c.stroke(); }
  },
  cohete: (c, w, h) => {
    const cx = w / 2, cy = h * 0.4;
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      c.strokeStyle = ['#F5C518', '#D6382B', '#43D9FF', '#E01B6A'][k % 4]; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); c.lineTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34); c.stroke();
      c.fillStyle = c.strokeStyle; c.beginPath(); c.arc(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40, 4, 0, 7); c.fill();
    }
    c.strokeStyle = TINTA; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, h * 0.95); c.quadraticCurveTo(cx + 10, h * 0.7, cx, cy + 10); c.stroke();
  },
  cometa: (c, w, h) => {
    c.fillStyle = '#1B5FAA'; c.strokeStyle = TINTA; c.lineWidth = 4;
    c.beginPath(); c.moveTo(w / 2, 8); c.lineTo(w * 0.85, h * 0.4); c.lineTo(w / 2, h * 0.7); c.lineTo(w * 0.15, h * 0.4); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#F5C518'; c.beginPath(); c.moveTo(w / 2, 8); c.lineTo(w * 0.85, h * 0.4); c.lineTo(w / 2, h * 0.4); c.closePath(); c.fill();
    c.fillStyle = '#D6382B'; c.beginPath(); c.moveTo(w / 2, h * 0.7); c.lineTo(w * 0.15, h * 0.4); c.lineTo(w / 2, h * 0.4); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(w / 2, 8); c.lineTo(w / 2, h * 0.7); c.moveTo(w * 0.15, h * 0.4); c.lineTo(w * 0.85, h * 0.4); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(w / 2, h * 0.7); c.quadraticCurveTo(w * 0.3, h * 0.85, w * 0.45, h * 0.98); c.stroke();
  },
  corona: (c, w, h) => {
    c.fillStyle = '#E2B13C'; c.strokeStyle = TINTA; c.lineWidth = 4;
    c.beginPath(); c.moveTo(w * 0.15, h * 0.8); c.lineTo(w * 0.12, h * 0.35); c.lineTo(w * 0.33, h * 0.55); c.lineTo(w / 2, h * 0.2); c.lineTo(w * 0.67, h * 0.55); c.lineTo(w * 0.88, h * 0.35); c.lineTo(w * 0.85, h * 0.8); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#D6382B'; for (const x of [w * 0.3, w / 2, w * 0.7]) { c.beginPath(); c.arc(x, h * 0.68, 5, 0, 7); c.fill(); c.stroke(); }
  },
  hornado: (c, w, h) => {
    c.fillStyle = '#C8955A'; c.strokeStyle = TINTA; c.lineWidth = 4;
    c.beginPath(); c.ellipse(w / 2, h * 0.7, w * 0.42, h * 0.16, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#D9A066'; c.beginPath(); c.ellipse(w / 2, h * 0.5, w * 0.3, h * 0.22, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#E8B98A'; c.beginPath(); c.ellipse(w * 0.72, h * 0.46, w * 0.12, h * 0.1, 0, 0, 7); c.fill(); c.stroke();
    c.fillStyle = TINTA; c.beginPath(); c.arc(w * 0.76, h * 0.45, 2, 0, 7); c.arc(w * 0.8, h * 0.45, 2, 0, 7); c.fill();
    c.fillStyle = '#F5C518'; for (const x of [w * 0.25, w * 0.4]) { c.beginPath(); c.arc(x, h * 0.72, 6, 0, 7); c.fill(); c.stroke(); }
  },
  capirote: (c, w, h) => {
    c.fillStyle = '#5B2A86'; c.strokeStyle = TINTA; c.lineWidth = 4;
    c.beginPath(); c.moveTo(w / 2, 6); c.lineTo(w * 0.8, h * 0.62); c.lineTo(w * 0.2, h * 0.62); c.closePath(); c.fill(); c.stroke();
    c.fillRect(w * 0.26, h * 0.62, w * 0.48, h * 0.34); c.strokeRect(w * 0.26, h * 0.62, w * 0.48, h * 0.34);
    c.fillStyle = TINTA; c.beginPath(); c.ellipse(w * 0.42, h * 0.5, 4, 6, 0, 0, 7); c.ellipse(w * 0.58, h * 0.5, 4, 6, 0, 0, 7); c.fill();
  },
  gallo: (c, w, h) => {
    c.fillStyle = '#E2B13C'; c.strokeStyle = TINTA; c.lineWidth = 4;
    c.beginPath(); c.ellipse(w * 0.46, h * 0.6, w * 0.28, h * 0.2, -0.3, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.arc(w * 0.66, h * 0.32, w * 0.13, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#D6382B'; c.beginPath(); c.moveTo(w * 0.58, h * 0.2); c.lineTo(w * 0.64, h * 0.08); c.lineTo(w * 0.7, h * 0.2); c.lineTo(w * 0.76, h * 0.1); c.lineTo(w * 0.78, h * 0.22); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#F5C518'; c.beginPath(); c.moveTo(w * 0.78, h * 0.33); c.lineTo(w * 0.92, h * 0.37); c.lineTo(w * 0.78, h * 0.41); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#1B5FAA'; c.beginPath(); c.moveTo(w * 0.2, h * 0.55); c.quadraticCurveTo(w * 0.02, h * 0.2, w * 0.18, h * 0.12); c.quadraticCurveTo(w * 0.3, h * 0.3, w * 0.3, h * 0.5); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = TINTA; c.beginPath(); c.arc(w * 0.68, h * 0.3, 2.5, 0, 7); c.fill();
  },
  chulla: (c, w, h) => {
    c.fillStyle = '#2B2129'; c.strokeStyle = TINTA; c.lineWidth = 4;
    c.beginPath(); c.ellipse(w / 2, h * 0.22, w * 0.3, h * 0.05, 0, 0, 7); c.fill(); c.stroke();
    c.fillRect(w * 0.36, h * 0.06, w * 0.28, h * 0.16); c.strokeRect(w * 0.36, h * 0.06, w * 0.28, h * 0.16);
    c.fillStyle = '#E8B98A'; c.beginPath(); c.arc(w / 2, h * 0.36, w * 0.13, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#4A4A4A'; c.beginPath(); c.moveTo(w * 0.3, h * 0.52); c.lineTo(w * 0.7, h * 0.52); c.lineTo(w * 0.74, h * 0.95); c.lineTo(w * 0.26, h * 0.95); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#F3F1EC'; c.beginPath(); c.moveTo(w * 0.42, h * 0.52); c.lineTo(w * 0.58, h * 0.52); c.lineTo(w / 2, h * 0.72); c.closePath(); c.fill();
    c.fillStyle = '#D6382B'; c.fillRect(w * 0.47, h * 0.54, w * 0.06, h * 0.16);
    c.strokeStyle = TINTA; c.lineWidth = 3; c.beginPath(); c.moveTo(w * 0.72, h * 0.6); c.lineTo(w * 0.9, h * 0.9); c.stroke();
  },
  vaca: (c, w, h) => {
    c.fillStyle = '#F3F1EC'; c.strokeStyle = TINTA; c.lineWidth = 4;
    c.beginPath(); c.roundRect(w * 0.18, h * 0.42, w * 0.6, h * 0.3, 10); c.fill(); c.stroke();
    c.fillStyle = TINTA; c.beginPath(); c.ellipse(w * 0.36, h * 0.52, 9, 7, 0.4, 0, 7); c.ellipse(w * 0.6, h * 0.62, 8, 6, -0.3, 0, 7); c.fill();
    c.fillStyle = '#F3F1EC'; c.beginPath(); c.roundRect(w * 0.7, h * 0.32, w * 0.22, h * 0.2, 6); c.fill(); c.stroke();
    c.strokeStyle = TINTA; c.lineWidth = 4; for (const x of [w * 0.26, w * 0.4, w * 0.58, w * 0.72]) { c.beginPath(); c.moveTo(x, h * 0.72); c.lineTo(x, h * 0.9); c.stroke(); }
    c.fillStyle = '#C8955A'; c.beginPath(); c.moveTo(w * 0.74, h * 0.32); c.lineTo(w * 0.7, h * 0.18); c.lineTo(w * 0.8, h * 0.3); c.closePath(); c.fill(); c.stroke();
    for (let k = 0; k < 7; k++) { const a = -0.3 - k * 0.35, x = w * 0.45 + Math.cos(a) * 34, y = h * 0.4 + Math.sin(a) * 26; c.strokeStyle = ['#F5C518', '#D6382B', '#43D9FF'][k % 3]; c.lineWidth = 3; c.beginPath(); c.moveTo(w * 0.45, h * 0.4); c.lineTo(x, y); c.stroke(); }
  },
  castillo: (c, w, h) => {
    c.strokeStyle = '#C8955A'; c.lineWidth = 5; c.beginPath(); c.moveTo(w * 0.5, h * 0.95); c.lineTo(w * 0.5, h * 0.08); c.stroke();
    for (const y of [0.3, 0.52, 0.74]) { c.beginPath(); c.moveTo(w * 0.22, h * y); c.lineTo(w * 0.78, h * y); c.stroke(); }
    c.strokeStyle = TINTA; c.lineWidth = 2; c.beginPath(); c.moveTo(w * 0.5, h * 0.95); c.lineTo(w * 0.5, h * 0.08); c.stroke();
    for (const [x, y, col] of [[0.25, 0.3, '#F5C518'], [0.75, 0.3, '#43D9FF'], [0.25, 0.52, '#E01B6A'], [0.75, 0.52, '#F5C518'], [0.5, 0.74, '#D6382B']]) {
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(w * x, h * y); c.lineTo(w * x + Math.cos(a) * 14, h * y + Math.sin(a) * 14); c.stroke(); }
      c.fillStyle = '#fff'; c.beginPath(); c.arc(w * x, h * y, 3, 0, 7); c.fill();
    }
  },
  tabla: (c, w, h) => {
    c.fillStyle = '#C8955A'; c.strokeStyle = TINTA; c.lineWidth = 4;
    c.beginPath(); c.roundRect(w * 0.1, h * 0.4, w * 0.8, h * 0.18, 4); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(110,65,25,.6)'; c.lineWidth = 2; for (const y of [0.46, 0.52]) { c.beginPath(); c.moveTo(w * 0.12, h * y); c.lineTo(w * 0.88, h * y); c.stroke(); }
    c.fillStyle = '#333'; c.strokeStyle = TINTA; c.lineWidth = 4; for (const x of [0.22, 0.78]) { c.beginPath(); c.arc(w * x, h * 0.68, w * 0.08, 0, 7); c.fill(); c.stroke(); }
  },
  rulimanes: (c, w, h) => {
    c.strokeStyle = TINTA; c.lineWidth = 4;
    for (const [x, y, r] of [[0.35, 0.45, 0.22], [0.68, 0.6, 0.17]]) {
      c.fillStyle = '#8C9096'; c.beginPath(); c.arc(w * x, h * y, w * r, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#D9DCE0'; c.beginPath(); c.arc(w * x, h * y, w * r * 0.55, 0, 7); c.fill(); c.stroke();
      c.fillStyle = TINTA; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; c.beginPath(); c.arc(w * x + Math.cos(a) * w * r * 0.78, h * y + Math.sin(a) * w * r * 0.78, 3, 0, 7); c.fill(); }
    }
  },
  soga: (c, w, h) => {
    c.strokeStyle = TINTA; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(w * 0.15, h * 0.3); c.bezierCurveTo(w * 0.3, h * 0.9, w * 0.6, h * 0.1, w * 0.85, h * 0.7); c.stroke();
    c.strokeStyle = '#D9C7A0'; c.lineWidth = 5; c.beginPath(); c.moveTo(w * 0.15, h * 0.3); c.bezierCurveTo(w * 0.3, h * 0.9, w * 0.6, h * 0.1, w * 0.85, h * 0.7); c.stroke();
    c.strokeStyle = 'rgba(110,65,25,.6)'; c.lineWidth = 2; for (let t = 0.05; t < 1; t += 0.08) { const x = w * (0.15 + 0.7 * t); c.beginPath(); c.moveTo(x - 3, h * 0.5 - 6); c.lineTo(x + 3, h * 0.5 + 6); c.stroke(); }
  },
  farol: (c, w, h) => {
    c.strokeStyle = TINTA; c.lineWidth = 4; c.fillStyle = '#333';
    c.beginPath(); c.moveTo(w / 2, h * 0.95); c.lineTo(w / 2, h * 0.3); c.stroke();
    c.fillStyle = '#F5C518'; c.beginPath(); c.moveTo(w * 0.36, h * 0.12); c.lineTo(w * 0.64, h * 0.12); c.lineTo(w * 0.7, h * 0.42); c.lineTo(w * 0.3, h * 0.42); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#333'; c.beginPath(); c.moveTo(w * 0.3, h * 0.12); c.lineTo(w / 2, h * 0.02); c.lineTo(w * 0.7, h * 0.12); c.closePath(); c.fill(); c.stroke();
    const halo = c.createRadialGradient(w / 2, h * 0.27, 4, w / 2, h * 0.27, 40); halo.addColorStop(0, 'rgba(255,230,120,.7)'); halo.addColorStop(1, 'rgba(255,230,120,0)');
    c.fillStyle = halo; c.fillRect(0, 0, w, h);
    c.fillStyle = '#F3F1EC'; c.fillRect(w * 0.44, h * 0.84, w * 0.12, h * 0.1);
  },
};
const CROMOS = [
  { id: 'virgen', nombre: 'La Virgen de Quito', desc: 'La única Virgen con alas: la del Panecillo, de aluminio y 41 metros.', pista: 'panecillo', zona: 'panecillo', d: 200, x: -2.2, fachada: 'virgen' },
  { id: 'chulla', nombre: 'El Chulla Quiteño', desc: 'Terno, sombrero y bastón: el personaje de la canción y de la ciudad.', pista: 'panecillo', zona: 'garcia', d: 40, x: 1.8, icono: 'chulla' },
  { id: 'farol', nombre: 'Los faroles de La Ronda', desc: 'La calle de los artesanos, con sus faroles encendidos en las Fiestas.', pista: 'panecillo', zona: 'ronda', d: 25, x: -1.9, icono: 'farol' },
  { id: 'santuario', nombre: 'El Santuario de Guápulo', desc: 'Del siglo XVII, al pie de la cuesta, mirando al valle.', pista: 'guapulo', zona: 'guapulo', d: 120, x: 2, fachada: 'santuario' },
  { id: 'canelazo', nombre: 'El canelazo', desc: 'Naranjilla, canela y un chorro de puntas: lo que calienta la noche.', pista: 'guapulo', zona: 'mirador', d: 70, x: -1.6, icono: 'canelazo' },
  { id: 'guagua', nombre: 'La guagua de pan', desc: 'El pan con forma de niño que se come en noviembre con la colada.', pista: 'guapulo', zona: 'guapulo', d: 280, x: -2.1, icono: 'guagua' },
  { id: 'basilica', nombre: 'La Basílica del Voto Nacional', desc: 'Neogótica y con gárgolas de iguanas y tortugas, al norte del centro.', pista: 'sanjuan', zona: 'basilica', d: 30, x: 2.2, fachada: 'basilica' },
  { id: 'colada', nombre: 'La colada morada', desc: 'Mora, mortiño, piña y harina de maíz negro: morada y espesa.', pista: 'sanjuan', zona: 'venezuela', d: 100, x: 1.7, fachada: 'colada' },
  { id: 'chiva', nombre: 'La chiva', desc: 'El bus abierto, con banda arriba, que recorre la ciudad en las Fiestas.', pista: 'sanjuan', zona: 'rocafuerte', d: 110, x: -1.8, icono: 'chiva' },
  { id: 'banderin', nombre: 'Los banderines', desc: 'Rojo y azul, los colores de Quito, cruzando las calles.', pista: 'vuelta', zona: 'panecillo', d: 100, x: 2.4, icono: 'banderin' },
  { id: 'cometa', nombre: 'La cometa', desc: 'En agosto el Panecillo se llena de cometas; alguna queda para noviembre.', pista: 'vuelta', zona: 'miradorpanecillo', d: 70, x: -2.4, icono: 'cometa' },
  { id: 'hornado', nombre: 'El hornado', desc: 'Chancho entero al horno, con mote y agrio, en cualquier mercado.', pista: 'vuelta', zona: 'cumbre', d: 90, x: 2.2, icono: 'hornado' },
  { id: 'capirote', nombre: 'El cucurucho', desc: 'El penitente morado de la procesión de Viernes Santo.', pista: 'subida', zona: 'subida', d: 60, x: 2.3, icono: 'capirote' },
  { id: 'gallo', nombre: 'El Gallo de la Catedral', desc: 'La veleta de la Catedral que, según la leyenda, bajó a picotear a un borracho.', pista: 'subida', zona: 'subida', d: 160, x: -2.3, icono: 'gallo' },
  { id: 'corona', nombre: 'La Reina de Quito', desc: 'Cada año, antes de las Fiestas, se elige una; la corona es lo de menos.', pista: 'subida', zona: 'cumbre', d: 25, x: 1.9, icono: 'corona' },
  { id: 'tabla', nombre: 'La tabla', desc: 'Tres tablones, dos ejes y rulimanes: el coche entero, hecho en casa.', pista: 'tobogan', zona: 'cumbre', d: 40, x: -2.6, icono: 'tabla' },
  { id: 'rulimanes', nombre: 'Los rulimanes', desc: 'Las ruedas de verdad: rodamientos de camión, que chillan en el empedrado.', pista: 'tobogan', zona: 'valle', d: 100, x: 2.6, icono: 'rulimanes' },
  { id: 'soga', nombre: 'La soga', desc: 'El volante: una soga atada al eje de adelante y, con suerte, un freno de madera.', pista: 'tobogan', zona: 'trepada', d: 250, x: -2.4, icono: 'soga' },
  { id: 'cohete', nombre: 'Los fuegos artificiales', desc: 'La noche del 5 de diciembre el cielo de Quito se llena de luces.', pista: 'noche-vuelta', zona: 'panecillo', d: 60, x: -2.3, icono: 'cohete' },
  { id: 'vaca', nombre: 'La vaca loca', desc: 'Un armazón de vaca cargado de cohetes que alguien se pone y sale a corretear a la gente.', pista: 'noche-sanjuan', zona: 'rocafuerte', d: 60, x: 1.9, icono: 'vaca' },
  { id: 'castillo', nombre: 'El castillo', desc: 'La torre de carrizo con ruedas de fuegos que se enciende de abajo arriba.', pista: 'noche-guapulo', zona: 'guapulo', d: 200, x: -2, icono: 'castillo' },
];
const COLORES_PISTA = { tobogan: '#C8301E', 'noche-tobogan': '#1D1850', panecillo: '#5B2A86', guapulo: '#1B5FAA', sanjuan: '#D6382B', vuelta: '#2E7D4F', subida: '#E8862C', 'noche-vuelta': '#1D1850', 'noche-guapulo': '#1D1850', 'noche-sanjuan': '#1D1850' };
// La estampita dibujada: marco de color, el dibujo y el nombre abajo.
const cromoCanvas = (cr) => lienzo(220, 300, (c, w, h) => {
  const col = COLORES_PISTA[cr.pista] || '#5B2A86';
  c.fillStyle = col; c.beginPath(); c.roundRect(0, 0, w, h, 16); c.fill();
  c.fillStyle = '#FBF6E8'; c.beginPath(); c.roundRect(10, 10, w - 20, h - 20, 10); c.fill();
  c.fillStyle = '#EFE6CF'; c.fillRect(18, 18, w - 36, h - 92);
  c.strokeStyle = TINTA; c.lineWidth = 3; c.strokeRect(18, 18, w - 36, h - 92);
  c.save(); c.beginPath(); c.rect(18, 18, w - 36, h - 92); c.clip();
  if (cr.fachada) {
    const f = { virgen, colada, torres, compania, catedral, palacio, basilica, santuario }[cr.fachada]();
    const esc = Math.min((w - 52) / f.width, (h - 108) / f.height);
    c.drawImage(f, w / 2 - f.width * esc / 2, 18 + (h - 92 - f.height * esc) / 2, f.width * esc, f.height * esc);
  } else if (ICONOS[cr.icono]) {
    c.translate(18 + (w - 36) / 2 - 55, 18 + (h - 92) / 2 - 55); ICONOS[cr.icono](c, 110, 110);
  }
  c.restore();
  c.fillStyle = TINTA; c.font = '800 20px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const palabras = cr.nombre.split(' '); const lineas = [];
  let linea = '';
  for (const p of palabras) { if (c.measureText(`${linea} ${p}`).width > w - 40 && linea) { lineas.push(linea); linea = p; } else linea = linea ? `${linea} ${p}` : p; }
  lineas.push(linea);
  lineas.forEach((l, k) => c.fillText(l, w / 2, h - 52 + (k - (lineas.length - 1) / 2) * 24));
  c.fillStyle = col; c.font = '700 12px system-ui, sans-serif'; c.fillText('FIESTAS DE QUITO', w / 2, h - 18);
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
    // La tabla del coche: tres tablones con veta, junta oscura y clavos.
    tablones: textura(lienzo(256, 256, (c, w, h) => {
      c.fillStyle = '#C8955A'; c.fillRect(0, 0, w, h);
      for (let t = 0; t < 3; t++) {
        const x0 = t * w / 3;
        c.strokeStyle = 'rgba(110,65,25,.4)'; c.lineWidth = 2;
        for (let y = 4 + t * 3; y < h; y += 10) { c.beginPath(); c.moveTo(x0 + 4, y); c.bezierCurveTo(x0 + 30, y - 3, x0 + 55, y + 3, x0 + w / 3 - 4, y); c.stroke(); }
        c.fillStyle = 'rgba(60,35,15,.55)'; c.fillRect(x0, 0, 3, h);
        c.fillStyle = '#6E6A66'; for (const y of [18, h - 18]) { c.beginPath(); c.arc(x0 + w / 6, y, 4, 0, 7); c.fill(); }
      }
    }), true),
  };
}

// ─── la pista ──────────────────────────────────────────────────────
// Cada zona dice cómo es su calle y qué hay a los lados: casas, faroles,
// puestos, cajones, árboles, banderines, peatones y cuánto público (cada
// cuántos metros una fila, y de cuántos).
const ZONAS = {
  panecillo: { nombre: 'El Panecillo', calle: 'asfalto', lado: 'pasto', hw: 5.0, arboles: true, publico: [40, 4] },
  ambato: { nombre: 'La bajada de la Ambato', calle: 'asfalto', lado: 'vereda', hw: 4.6, casas: true, faroles: true, banderas: true, peatones: true, publico: [22, 4] },
  bulevar: { nombre: 'Bulevar 24 de Mayo', calle: 'asfalto', lado: 'vereda', hw: 5.5, casas: true, faroles: true, banderas: true, peatones: true, puestos: 34, publico: [8, 6] },
  ronda: { nombre: 'La Ronda', calle: 'adoquin', lado: 'vereda', hw: 4.4, casas: true, faroles: true, banderas: true, peatones: true, puestos: 40, publico: [10, 4] },
  garcia: { nombre: 'La García Moreno', calle: 'adoquin', lado: 'vereda', hw: 4.4, casas: true, faroles: true, banderas: true, peatones: true, cajones: 3, publico: [14, 4] },
  plaza: { nombre: 'Plaza Grande', calle: 'adoquin', lado: 'plaza', hw: 6.0, casas: true, faroles: true, banderas: true, peatones: true, puestos: 20, publico: [5, 7] },
  miradorpanecillo: { nombre: 'El mirador del Panecillo', calle: 'asfalto', lado: 'pasto', hw: 4.8, arboles: true, publico: [30, 4] },
  mirador: { nombre: 'El Mirador de Guápulo', calle: 'asfalto', lado: 'pasto', hw: 4.8, arboles: true, publico: [30, 4] },
  guapulo: { nombre: 'La cuesta de Guápulo', calle: 'adoquin', lado: 'vereda', hw: 4.0, casas: true, faroles: true, banderas: true, peatones: true, publico: [12, 4] },
  plazaguapulo: { nombre: 'Plaza de Guápulo', calle: 'adoquin', lado: 'plaza', hw: 5.6, casas: true, faroles: true, banderas: true, peatones: true, puestos: 18, publico: [5, 6] },
  basilica: { nombre: 'La Basílica', calle: 'adoquin', lado: 'plaza', hw: 5.6, casas: true, faroles: true, publico: [6, 6] },
  venezuela: { nombre: 'La bajada de la Venezuela', calle: 'asfalto', lado: 'vereda', hw: 4.6, casas: true, faroles: true, banderas: true, peatones: true, publico: [16, 4] },
  rocafuerte: { nombre: 'La Rocafuerte', calle: 'adoquin', lado: 'vereda', hw: 4.2, casas: true, faroles: true, banderas: true, peatones: true, puestos: 22, cajones: 2, publico: [10, 4] },
  sanfrancisco: { nombre: 'Plaza de San Francisco', calle: 'adoquin', lado: 'plaza', hw: 6.5, casas: true, faroles: true, banderas: true, peatones: true, publico: [5, 7] },
  subida: { nombre: 'La subida del Panecillo', calle: 'asfalto', lado: 'pasto', hw: 4.8, arboles: true, publico: [14, 5] },
  tobogan: { nombre: 'El tobogán', calle: 'asfalto', lado: 'pasto', hw: 5.8, arboles: true, publico: [16, 5] },
  valle: { nombre: 'El valle', calle: 'asfalto', lado: 'pasto', hw: 5.6, arboles: true, publico: [10, 6] },
  trepada: { nombre: 'La trepada', calle: 'asfalto', lado: 'pasto', hw: 5.4, arboles: true, publico: [12, 5] },
  cumbre: { nombre: 'La cumbre', calle: 'asfalto', lado: 'pasto', hw: 5.2, arboles: true, publico: [6, 6] },
};

// Las pistas. Cada una es una lista de tramos: el nombre de una zona la
// empieza; [entrada, sostén, salida, curva, desnivel] es un tramo en metros
// (curva de −7 a 7, desnivel total en metros); ['salida', s] y ['meta', d]
// marcan dónde se sale y a cuántos metros de ahí está la meta. Los hitos,
// las rampas y las coladas se dan por zona y metros desde que empieza.
const PISTAS = [
  {
    id: 'panecillo', nombre: 'La bajada del Panecillo', salida: 'EL PANECILLO', meta: 'PLAZA GRANDE',
    lema: 'De la Virgen a la Plaza Grande: las curvas del Panecillo, la Ambato empinada, La Ronda y la subida de la García Moreno.',
    tramos: ['panecillo', [0, 40, 0, 0, 0], ['salida', 34], [12, 20, 12, 0, -6], [14, 22, 14, -5, -8], [14, 22, 14, 5, -9],
      [16, 30, 16, 5, -14], [14, 20, 14, -4, -7], [10, 14, 10, 2, -3],
      'ambato', [18, 56, 18, 0, -26], [10, 10, 10, 0, 1.2], [15, 24, 15, 3, -3],
      'bulevar', [18, 54, 18, -2, -3], [15, 24, 15, 3, -1],
      'ronda', [9, 15, 9, -4, 0.8], [9, 15, 9, 5, -2.5], [9, 15, 9, -4, 0.6], [9, 15, 9, 4, -2.5], [9, 12, 9, -2, 0],
      'garcia', [12, 36, 12, 0, 2.6], [10, 14, 10, 3, 0],
      'plaza', ['meta', 40], [6, 66, 6, 0, 0], [0, 160, 0, 0, 0]],
    hitos: [['virgen', 'panecillo', 89, -32], ['torres', 'bulevar', 70, 1], ['compania', 'garcia', 80, -1], ['arco', 'garcia', 40],
      ['catedral', 'plaza', 16, 1], ['palacio', 'plaza', 20, -1]],
    rampas: [['ambato', 150, 0], ['bulevar', 40, -1.6], ['bulevar', 120, 1.4], ['ronda', 40, 0], ['panecillo', 62, 1.2]],
    coladas: [['panecillo', 150], ['panecillo', 262], ['ambato', 110], ['bulevar', 80], ['ronda', 90], ['garcia', 15], ['garcia', 60]],
  },
  {
    id: 'guapulo', nombre: 'La cuesta de Guápulo', salida: 'MIRADOR DE GUÁPULO', meta: 'SANTUARIO DE GUÁPULO',
    lema: 'Del mirador al santuario por la cuesta más empinada de Quito: horquillas de piedra y una recta que da miedo.',
    tramos: ['mirador', [0, 40, 0, 0, 0], ['salida', 34], [10, 30, 10, 0, -4], [12, 20, 12, -4, -5],
      'guapulo', [10, 14, 10, 6, -7], [10, 14, 10, -6, -7], [10, 16, 10, 7, -8], [10, 14, 10, -6, -7],
      [12, 36, 12, 0, -18],
      [10, 10, 10, 0, 1.5],
      [10, 14, 10, 6, -7], [10, 14, 10, -5, -6], [10, 18, 10, 4, -6],
      [10, 24, 10, 0, 2.5],
      'plazaguapulo', ['meta', 40], [6, 60, 6, 0, 0], [0, 160, 0, 0, 0]],
    hitos: [['santuario', 'plazaguapulo', 30, 1]],
    rampas: [['guapulo', 182, 0], ['mirador', 60, -1.2]],
    coladas: [['mirador', 50], ['guapulo', 60], ['guapulo', 232], ['guapulo', 300]],
  },
  {
    id: 'sanjuan', nombre: 'La bajada de San Juan', salida: 'LA BASÍLICA', meta: 'SAN FRANCISCO',
    lema: 'De la Basílica a la Plaza de San Francisco: la Venezuela en picada y los puestos de la Rocafuerte.',
    tramos: ['basilica', [0, 40, 0, 0, 0], ['salida', 34], [10, 20, 10, 0, -2],
      'venezuela', [14, 50, 14, 0, -22], [10, 20, 10, -3, -4], [12, 40, 12, 0, -12], [10, 16, 10, 4, -4],
      'rocafuerte', [9, 15, 9, 4, -2], [9, 15, 9, -4, -2], [9, 22, 9, 0, 2.2], [9, 15, 9, 3, -3], [9, 15, 9, -2, -1],
      'sanfrancisco', ['meta', 45], [6, 70, 6, 0, 0], [0, 160, 0, 0, 0]],
    hitos: [['basilica', 'basilica', 18, -1], ['torres', 'sanfrancisco', 30, 1]],
    rampas: [['venezuela', 70, 0], ['venezuela', 150, 1.4], ['rocafuerte', 80, -1]],
    coladas: [['basilica', 50], ['venezuela', 30], ['venezuela', 120], ['rocafuerte', 60], ['rocafuerte', 140]],
  },
  {
    id: 'tobogan', nombre: 'La bajada grande', salida: 'LA CUMBRE', meta: 'LA CUMBRE', real: 'tobogan', vueltas: 3,
    lema: 'Tres vueltas: una recta inmensa cuesta abajo, la curva del valle y, con ese impulso, la trepada de vuelta. Lo que falte lo empuja el de atrás.',
    zonas: [['tobogan', 0], ['valle', 310], ['trepada', 460], ['cumbre', 780]],
    hitos: [['cerro', null, 45, 180, 28, 20]],
    rampas: [['tobogan', 150, -3.2], ['tobogan', 240, 3.2]],
    coladas: [['valle', 60], ['trepada', 180], ['cumbre', 60]],
  },
  {
    id: 'vuelta', nombre: 'La vuelta al Panecillo', salida: 'EL PANECILLO', meta: 'EL PANECILLO', real: 'panecillo-vuelta', vueltas: 2, arbolesLado: -1,
    lema: 'Dos vueltas al cerro por la carretera que lo rodea: la Virgen siempre a la vista y el que empuja, sin descanso en las subidas.',
    zonas: [['panecillo', 0], ['miradorpanecillo', 130], ['cumbre', 230], ['panecillo', 330]],
    hitos: [['cerro', null, 0, 0, 40, 30]],
    rampas: [['panecillo', 70, 0], ['miradorpanecillo', 50, -1.2], ['cumbre', 60, 1.2]],
    coladas: [['panecillo', 40], ['miradorpanecillo', 20], ['cumbre', 20], ['panecillo', 360]],
  },
  {
    id: 'subida', nombre: 'La subida del Panecillo', salida: 'LA AMBATO', meta: 'LA VIRGEN', premio: true,
    lema: 'Al revés: de la Ambato a la Virgen, cuesta arriba todo el rato. Aquí el que empuja es el motor.',
    tramos: ['ambato', [0, 40, 0, 0, 0], ['salida', 34], [10, 20, 10, 0, 2],
      'subida', [12, 22, 12, -6, 7], [12, 22, 12, 6, 7], [12, 26, 12, 0, 6], [12, 22, 12, -5, 6], [10, 16, 10, 3, 3],
      'cumbre', ['meta', 30], [0, 60, 0, 0, 0], [0, 160, 0, 0, 0]],
    hitos: [['virgen', 'cumbre', 70, -18]],
    rampas: [],
    coladas: [['subida', 40], ['subida', 120], ['subida', 190]],
  },
  // La noche de las Fiestas: las mismas calles a oscuras, con los faroles
  // encendidos y fuegos artificiales. Heredan todo de su pista de día.
  {
    id: 'noche-tobogan', base: 'tobogan', noche: true, nombre: 'La bajada grande de noche',
    lema: 'La recta inmensa a oscuras, con los faroles abajo y los cohetes arriba.',
  },
  {
    id: 'noche-vuelta', base: 'vuelta', noche: true, nombre: 'La vuelta al Panecillo de noche',
    lema: 'El cerro a oscuras, la Virgen iluminada y los cohetes del 5 de diciembre encima.',
  },
  {
    id: 'noche-guapulo', base: 'guapulo', noche: true, nombre: 'Guápulo de noche',
    lema: 'La cuesta con los faroles encendidos y el valle lleno de luces abajo.',
  },
  {
    id: 'noche-sanjuan', base: 'sanjuan', noche: true, nombre: 'San Juan de noche',
    lema: 'La Basílica a contraluz y la Venezuela en picada, entre cohetes y chivas.',
  },
];
for (const p of PISTAS) if (p.base) Object.assign(p, { ...PISTAS.find((q) => q.id === p.base), ...p });

let P = {};
const tramos = [];
let N = 0, SALIDA = 0, META = 0;
// En un circuito, lo que mide una vuelta y hasta dónde llega el decorado
// (una vuelta: las demás pasan por el mismo sitio).
let LARGO_VUELTA = 0, DECO_INI = 0, DECO_FIN = 0;
// Un filtro de caja cíclico: para la vuelta de un circuito, donde el final
// sigue en el principio.
function suavizaCiclico(arr, R, pasadas) {
  let a = arr.slice(); const n = a.length;
  for (let p = 0; p < pasadas; p++) {
    const b = new Array(n);
    for (let i = 0; i < n; i++) { let t = 0; for (let k = -R; k <= R; k++) t += a[(i + k + n * 8) % n]; b[i] = t / (2 * R + 1); }
    a = b;
  }
  return a;
}
// Las calles de verdad, de coches/pistas/*.json (las trae tools/calles.py),
// y las generadas en código con la misma forma (un trazado en metros).
const DATOS_REALES = {};
const GENERADAS = {
  // La vuelta al cerro: un anillo con tres lóbulos alrededor del Panecillo,
  // que sube y baja. Unos 430 m la vuelta; tres vueltas, dos minutos.
  // La bajada grande: una recta inmensa cuesta abajo, una curva en el valle
  // y la trepada de vuelta, que con el impulso casi se sube entera; arriba,
  // otra curva y la línea. Unos 940 m la vuelta.
  tobogan: () => {
    const puntos = [];
    const pon = (x, z, y) => puntos.push([x, z, y]);
    // la recta de bajada, de (0, 20) a (0, 340), 56 m abajo (18 %)
    for (let i = 0; i < 64; i++) pon(0, 20 + i * 5, -56 * (i / 64));
    // la curva del valle: media vuelta de radio 45 alrededor de (45, 340), 2 m abajo
    for (let i = 0; i <= 28; i++) { const a = Math.PI - (i / 28) * Math.PI; pon(45 + Math.cos(a) * 45, 340 + Math.sin(a) * 45, -56 - 2 * (i / 28)); }
    // la trepada, de (90, 340) a (90, 20), 44 m arriba (14 %)
    for (let i = 1; i < 64; i++) pon(90, 340 - i * 5, -58 + 44 * (i / 64));
    // la curva de arriba: media vuelta alrededor de (45, 20), 14 m arriba, hasta la línea
    for (let i = 0; i < 28; i++) { const a = -(i / 28) * Math.PI; pon(45 + Math.cos(a) * 45, 20 + Math.sin(a) * 45, -14 + 14 * (i / 28)); }
    return { id: 'tobogan', origen: [0, 0], largo: 922, cerrada: true, puntos, calles: [] };
  },
  'panecillo-vuelta': () => {
    const puntos = [];
    for (let k = 0; k < 120; k++) {
      const a = (k / 120) * Math.PI * 2;
      const r = 62 + 14 * Math.sin(3 * a) + 5 * Math.sin(5 * a + 1);
      puntos.push([Math.cos(a) * r, Math.sin(a) * r, 5 * Math.sin(2 * a + 0.4) + 2 * Math.sin(5 * a)]);
    }
    return { id: 'panecillo-vuelta', origen: [0, 0], largo: 430, cerrada: true, puntos, calles: [] };
  },
};

// Una pista sobre una calle de verdad: el trazado viene en metros, cada
// pocos metros, y aquí se muestrea cada metro. Si es un circuito, la vuelta
// se repite `vueltas` veces, con 40 m antes de la línea y 220 después.
function construyePistaReal(def) {
  const d = DATOS_REALES[def.real];
  if (!d) return false;
  const pts = d.puntos.slice();
  const cerrada = !!(d.cerrada && def.vueltas);
  if (cerrada) pts.push(pts[0]);
  const vuelta = [];
  let resto = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az, ay] = pts[i], [bx, bz, by] = pts[i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-6) continue;
    for (let t = resto; t < l; t += 1) {
      const f = t / l;
      vuelta.push([ax + (bx - ax) * f, az + (bz - az) * f, ay + (by - ay) * f]);
    }
    resto = (resto - l) % 1 + 1; if (resto >= 1) resto -= 1;
  }
  if (!cerrada) vuelta.push(pts[pts.length - 1]);
  const largo = vuelta.length;
  // En un circuito la altura y la curva se suavizan sobre la vuelta, en
  // redondo, antes de repetirla: así cada vuelta es idéntica y la calle
  // cierra sin escalón.
  let lapY = null, lapK = null;
  if (cerrada) {
    lapY = suavizaCiclico(vuelta.map((p) => p[2]), 25, 3);
    const ths = vuelta.map((p, m) => { const sg = vuelta[(m + 1) % largo], an = vuelta[(m - 1 + largo) % largo]; return Math.atan2(sg[0] - an[0], sg[1] - an[1]); });
    const giro = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
    lapK = suavizaCiclico(ths.map((t, m) => giro(t, ths[(m + 1) % largo])), 4, 2);
  }
  const zonaDe = (m) => { let z = def.zonas[0][0]; for (const [n, desde] of def.zonas) if (m >= desde) z = n; return z; };
  let desde, hasta;
  if (cerrada) {
    LARGO_VUELTA = largo;
    desde = -40; hasta = largo * def.vueltas + 220;
    SALIDA = 40; META = 40 + largo * def.vueltas;
  } else {
    desde = 0; hasta = largo;
    SALIDA = def.salidaM ?? 30; META = Math.min(def.metaM ?? largo - 40, largo - 10);
  }
  let zona = '';
  for (let i = desde; i < hasta; i++) {
    const m = ((i % largo) + largo) % largo;
    const [x, z, y] = vuelta[m];
    const sig = cerrada ? vuelta[(m + 1) % largo] : vuelta[Math.min(m + 1, largo - 1)];
    const ant = cerrada ? vuelta[(m - 1 + largo) % largo] : vuelta[Math.max(m - 1, 0)];
    const th = Math.atan2(sig[0] - ant[0], sig[1] - ant[1]);
    const zn = zonaDe(m);
    // En el circuito, la línea abre un tramo aunque la zona siga: así
    // «metros desde que empieza la zona» cuentan desde la línea.
    if (zn !== zona || (cerrada && i === 0)) { zona = zn; tramos.push({ zona, i: P.x.length }); }
    P.x.push(x); P.z.push(z); P.y.push(cerrada ? lapY[m] : y); P.th.push(th); P.zona.push(zona); P.hw.push(ZONAS[zona].hw); P.k.push(cerrada ? lapK[m] : 0);
  }
  // Sin saltos de 2π en el rumbo, y la curva es lo que gira cada metro.
  for (let i = 1; i < P.th.length; i++) {
    while (P.th[i] - P.th[i - 1] > Math.PI) P.th[i] -= Math.PI * 2;
    while (P.th[i] - P.th[i - 1] < -Math.PI) P.th[i] += Math.PI * 2;
  }
  if (!cerrada) for (let i = 0; i + 1 < P.th.length; i++) P.k[i] = P.th[i] - P.th[i + 1];
  return true;
}

function construyePista(def) {
  P = { x: [], z: [], y: [], th: [], k: [], hw: [], zona: [], pend: [] };
  tramos.length = 0;
  LARGO_VUELTA = 0;
  if (def.real) {
    if (!construyePistaReal(def)) return false;
    N = P.x.length;
    DECO_INI = LARGO_VUELTA ? SALIDA : 0;
    DECO_FIN = LARGO_VUELTA ? SALIDA + LARGO_VUELTA : N;
    // La curva se suaviza (una calle de OSM va a tramos rectos) y la
    // altura, más que en las pistas inventadas: el terreno viene a 30 m.
    // (En el circuito ya vienen suavizadas en redondo.)
    if (!LARGO_VUELTA) { P.k = suavizaArr(P.k, 4, 2); P.y = suavizaArr(P.y, 25, 3); }
    P.hw = suavizaArr(P.hw, 8, 1);
    for (let i = 0; i < N; i++) P.pend[i] = (P.y[Math.min(i + 1, N - 1)] - P.y[Math.max(i - 1, 0)]) / 2;
    return true;
  }
  let x = 0, z = 0, y = 0, th = 0, zona = def.tramos[0];
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
  for (const p of def.tramos) {
    if (typeof p === 'string') { zona = p; tramos.push({ zona: p, i: P.x.length }); }
    else if (p[0] === 'salida') SALIDA = p[1];
    else if (p[0] === 'meta') META = P.x.length + p[1];
    else tramo(...p);
  }
  N = P.x.length;
  DECO_INI = 0; DECO_FIN = N;

  // Las alturas y los anchos se suavizan: la pendiente cambia sin escalones
  // y la calle se ensancha o se estrecha a lo largo de unos metros.
  P.y = suavizaArr(P.y, 12, 2);
  P.hw = suavizaArr(P.hw, 8, 1);
  for (let i = 0; i < N; i++) P.pend[i] = (P.y[Math.min(i + 1, N - 1)] - P.y[Math.max(i - 1, 0)]) / 2;
  return true;
}
// Un filtro de caja: cada valor, la media de los 2R+1 de alrededor, varias veces.
function suavizaArr(arr, R, pasadas) {
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
escena.fog = new THREE.Fog(NIEBLA, 55, 300);
escena.environment = new THREE.PMREMGenerator(render).fromScene(new RoomEnvironment(), 0.04).texture;
escena.environmentIntensity = 0.55;
const camara = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
const hemi = new THREE.HemisphereLight(0xE8F3FF, 0xC9B99C, 1.35);
escena.add(hemi);
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
// Todo lo que es de la pista (calle, casas, público, rampas…) va aquí, y se
// vacía al cambiar de pista. Los coches, la gente y el fondo se quedan.
const mundo = new THREE.Group();
escena.add(mundo);
// Se liberan geometrías y, de los materiales, solo los de esta pista: los
// compartidos (la calle, las casas del GLB) llevan la marca y se quedan.
function limpiaMundo() {
  const vistos = new Set();
  mundo.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry && !o.isSprite) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      if (!m || vistos.has(m) || m.userData.compartido) continue;
      vistos.add(m);
      if (m.map && !m.map.userData.compartido) m.map.dispose();
      m.dispose();
    }
  });
  mundo.clear();
}

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
  mundo.add(m);
  return m;
}

function preparaMateriales() {
  TEX = texturasSuelo();
  const lam = (t, extra) => mate(Object.assign({ map: t, side: THREE.DoubleSide }, extra));
  MAT.asfalto = lam(TEX.asfalto); MAT.adoquin = lam(TEX.adoquin); MAT.vereda = lam(TEX.vereda);
  MAT.pasto = lam(TEX.pasto); MAT.plaza = lam(TEX.plaza);
  MAT.bordillo = mate({ color: 0xB9B0A0, side: THREE.DoubleSide });
  MAT.raya = new THREE.MeshBasicMaterial({ color: 0xEDE9DF, side: THREE.DoubleSide });
  MAT.madera = mate({ map: TEX.madera });
  for (const m of Object.values(MAT)) m.userData.compartido = true;
  for (const t of Object.values(TEX)) if (t && t.userData) t.userData.compartido = true;
}

function construyeCalle() {
  // Por tramos de zona: cada una con su calzada y su lado.
  const uvCalle = { asfalto: (i, x) => [x / 10 + 0.5, i / 8], adoquin: (i, x) => [x / 2, i / 2] };
  // En un circuito, una sola vuelta de calzada: la vuelta cierra sobre sí.
  const FIN = LARGO_VUELTA ? DECO_FIN : N;
  let i0 = DECO_INI;
  for (let i = i0 + 1; i <= FIN; i++) {
    if (i < FIN && P.zona[i] === P.zona[i0]) continue;
    const i1 = Math.min(i, N - 1), z = ZONAS[P.zona[i0]];
    const hw = (k) => P.hw[k];
    cinta(i0, i1, (k, l) => [l ? hw(k) : -hw(k), 0], uvCalle[z.calle], MAT[z.calle]);
    // En el asfalto, la raya blanca del borde.
    if (z.calle === 'asfalto') for (const s of [-1, 1]) cinta(i0, i1, (k, l) => [s * (hw(k) - (l ? 0.22 : 0.34)), 0.004], (k) => [0, k], MAT.raya);
    for (const s of [-1, 1]) {
      cinta(i0, i1, (k, l) => [s * hw(k), l ? BORDILLO : 0], (k) => [0, k], MAT.bordillo);
      const acera = z.lado === 'pasto' ? MAT.pasto : MAT.vereda;
      cinta(i0, i1, (k, l) => [s * (hw(k) + (l ? ACERA : 0)), BORDILLO], (k, x) => [x / 1.6, k / 1.6], acera);
      // El terreno de los lados cae pronto: así una curva de más arriba no
      // deja su pasto flotando sobre la de más abajo.
      const lejos = z.lado === 'pasto' ? 30 : 14;
      cinta(i0, i1, (k, l) => [s * (hw(k) + ACERA + (l ? lejos : 0)), l ? (z.lado === 'pasto' ? -11 : BORDILLO) : BORDILLO],
        (k, x) => [x / 4, k / 4], MAT[z.lado]);
    }
    i0 = i;
  }
}

// De día o de noche: el cielo, la niebla, las luces y el panorama cambian
// juntos. Los faroles ya son de material sin luz, así que de noche brillan.
let noche = false;
const panoramas = {};
function ambienta(esNoche) {
  noche = esNoche;
  escena.background.set(esNoche ? 0x0E1230 : 0xB4D5EC);
  escena.fog.color.set(esNoche ? 0x161B3C : NIEBLA);
  escena.fog.near = esNoche ? 40 : 55; escena.fog.far = esNoche ? 230 : 300;
  hemi.color.set(esNoche ? 0x3E4C9E : 0xE8F3FF); hemi.groundColor.set(esNoche ? 0x16142A : 0xC9B99C); hemi.intensity = esNoche ? 0.5 : 1.35;
  sol.color.set(esNoche ? 0x9FB0FF : 0xFFF0D6); sol.intensity = esNoche ? 0.4 : 2.6;
  escena.environmentIntensity = esNoche ? 0.14 : 0.55;
  render.toneMappingExposure = esNoche ? 0.92 : 1.12;
  if (panorama) {
    if (!panoramas[esNoche ? 'noche' : 'dia']) panoramas[esNoche ? 'noche' : 'dia'] = textura(pintaPanorama(esNoche));
    panorama.material.map = panoramas[esNoche ? 'noche' : 'dia'];
    panorama.material.needsUpdate = true;
  }
}

// El Pichincha y las laderas: un cilindro pintado que viaja con la cámara.
let panorama;
function pintaPanorama(esNoche) {
  const r = azar(99);
  const W = 4096, H = 1024, LW = W;
  const onda = (x, ks) => ks.reduce((t, [k, a, f]) => t + a * Math.sin((x / LW) * Math.PI * 2 * k + f), 0);
  // Un fondo de foto desenfocada. Cada capa (nubes, montes, laderas con sus
  // casitas) se dibuja sin filtro en su propio lienzo y se desenfoca UNA vez
  // al componerla: un filtro por cada casita tarda minutos. Donde el
  // navegador no tiene filtro, queda igual de suave.
  const base = H * 0.62;
  const borde = (x) => base - 10 - onda(x, [[2, 50, 0.9], [5, 22, 2.4], [11, 9, 0.2]]) - 40;
  const c = lienzo(W, H, (ctx, w, h) => {
    const cielo = ctx.createLinearGradient(0, 0, 0, H * 0.62);
    if (esNoche) { cielo.addColorStop(0, '#05081A'); cielo.addColorStop(0.6, '#141B45'); cielo.addColorStop(1, '#3B2E60'); }
    else { cielo.addColorStop(0, '#7FB4DE'); cielo.addColorStop(0.7, '#CFE3F0'); cielo.addColorStop(1, '#EEF4F6'); }
    ctx.fillStyle = cielo; ctx.fillRect(0, 0, w, h);
    if (esNoche) {
      // Estrellas, y una luna.
      for (let k = 0; k < 700; k++) { const a = 0.4 + r() * 0.6; ctx.fillStyle = `rgba(255,250,230,${a})`; const sz = r() < 0.1 ? 3 : 2; ctx.fillRect(r() * w, r() * H * 0.5, sz, sz); }
      ctx.fillStyle = '#FFF4CC'; ctx.beginPath(); ctx.arc(2600, 150, 42, 0, 7); ctx.fill();
      ctx.fillStyle = '#141B45'; ctx.beginPath(); ctx.arc(2618, 138, 36, 0, 7); ctx.fill();
    }
  });
  const ctx2 = c.getContext('2d');
  const capa = (pinta, px) => {
    const o = lienzo(W, H, (oc) => pinta(oc));
    ctx2.filter = `blur(${px}px)`;
    ctx2.drawImage(o, 0, 0);
    ctx2.filter = 'none';
  };
  capa((oc) => {
    oc.fillStyle = esNoche ? 'rgba(80,90,140,.35)' : 'rgba(255,255,255,.8)';
    for (let k = 0; k < 14; k++) {
      const x = r() * W, y = 80 + r() * 200, sz = 60 + r() * 60;
      oc.beginPath(); oc.ellipse(x, y, sz * 1.6, sz * 0.5, 0, 0, 7); oc.fill();
    }
  }, 36);
  capa((oc) => {
    oc.fillStyle = esNoche ? '#0B0F26' : '#9DB7C8'; oc.beginPath(); oc.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const pico = 230 * Math.exp(-(((x - 1300) / 420) ** 2)) + 140 * Math.exp(-(((x - 1800) / 300) ** 2)) + 120 * Math.exp(-(((x - 3300) / 500) ** 2));
      oc.lineTo(x, base - 40 - pico - onda(x, [[3, 30, 0.4], [7, 14, 1.3], [13, 6, 2.1]]));
    }
    oc.lineTo(W, H); oc.fill();
  }, 22);
  capa((oc) => {
    oc.fillStyle = esNoche ? '#13173A' : '#9AB08A'; oc.beginPath(); oc.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) oc.lineTo(x, borde(x));
    oc.lineTo(W, H); oc.fill();
    // De día, casitas; de noche, las luces de las laderas, que es lo que
    // se ve de Quito desde cualquier cerro.
    const tonos = esNoche ? ['#FFD27A', '#FFB347', '#FFF3C4', '#FFE08A', '#F7C56B'] : ['#F2EEE5', '#EAD9B0', '#E8C9C0', '#C9DCE6', '#F3E3D3', '#D8D2C2', '#E6B98F'];
    for (let k = 0; k < (esNoche ? 1400 : 900); k++) {
      const x = r() * W, y0 = borde(x) + 8, y = y0 + r() ** 0.7 * (H - y0);
      const sz = esNoche ? 2 + ((y - y0) / (H - y0)) * 4 : 4 + ((y - y0) / (H - y0)) * 8;
      oc.fillStyle = elige(r, tonos); oc.fillRect(x, y, sz * 1.4, sz);
    }
  }, esNoche ? 6 : 10);
  const bruma = ctx2.createLinearGradient(0, base - 240, 0, base + 60);
  if (esNoche) { bruma.addColorStop(0, 'rgba(22,27,60,0)'); bruma.addColorStop(1, 'rgba(22,27,60,.85)'); }
  else { bruma.addColorStop(0, 'rgba(226,238,244,0)'); bruma.addColorStop(1, 'rgba(226,238,244,.9)'); }
  ctx2.fillStyle = bruma; ctx2.fillRect(0, base - 240, W, 300);
  return c;
}
function construyePanorama() {
  panoramas.dia = textura(pintaPanorama(false));
  const g = new THREE.CylinderGeometry(780, 780, 520, 48, 1, true);
  const m = new THREE.MeshBasicMaterial({ map: panoramas.dia, side: THREE.BackSide, fog: false, depthWrite: false });
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
        mundo.add(m);
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

// Las piezas de quito.glb se asientan una vez: las dieciséis casas, el
// puesto y el cajón.
let CASAS = [], PIEZAS = {};
function preparaQuito(quito) {
  quito.scene.updateMatrixWorld(true);
  quito.scene.traverse((o) => {
    if (/^casa_colonial/.test(o.name) && o.parent && /centro_historico/.test(o.parent.name)) {
      const b = new THREE.Box3().setFromObject(o);
      CASAS.push(asienta(o, (b.min.x + b.max.x) / 2 < 0 ? -Math.PI / 2 : Math.PI / 2));
    }
    for (const n of ['obstaculo_muro', 'obstaculo_salto']) if (!PIEZAS[n] && o.name.startsWith(n)) PIEZAS[n] = asienta(o, 0);
  });
  quito.scene.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) { m.metalness = 0; m.roughness = Math.max(m.roughness, 0.8); m.userData.compartido = true; if (m.map) m.map.userData.compartido = true; } });
}

// Las fachadas grandes pintadas en lienzo: [pintor, ancho, alto, fondo].
const FACHADAS = {
  torres: [() => torres(), 16, 21, 12], compania: [() => compania(), 15, 19, 14], catedral: [() => catedral(), 26, 19.5, 14],
  palacio: [() => palacio(), 30, 19, 14], basilica: [() => basilica(), 20, 30, 16], santuario: [() => santuario(), 18, 22, 14],
};

function construyeDecorado(def) {
  const r = azar(2024 + def.id.length * 97);
  const f = new Fundidor();
  const halos = [];
  // En un circuito el decorado se arma una vez: las vueltas pasan por ahí.
  const corridas = tramos.map((t, k) => ({ zona: t.zona, z0: Math.max(t.i, DECO_INI), z1: Math.min(k + 1 < tramos.length ? tramos[k + 1].i : N, DECO_FIN) }))
    .filter((cr) => cr.z0 < cr.z1);
  const enZona = (z, d) => { const t = tramos.find((q) => q.zona === z && q.i >= DECO_INI); return (t ? t.i : DECO_INI) + d; };
  const hasta = (z1, extra) => Math.min(z1, META + extra, N - 5, DECO_FIN);

  // Las fachadas grandes: van en cajas y dejan hueco entre las casas.
  const reservas = [];
  const fachada = (canvas, s, lado, ancho, alto, fondo) => {
    const mat = [mate({ color: 0xEDE7DA }), mate({ color: 0xEDE7DA }),
      mate({ color: 0xA8442C }), mate({ color: 0xEDE7DA }),
      mate({ map: textura(canvas), transparent: true, alphaTest: 0.5 }), mate({ color: 0xEDE7DA })];
    const caja = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, fondo), mat);
    const hw = muestra(s).hw;
    caja.applyMatrix4(new THREE.Matrix4().makeTranslation(0, alto / 2 - 0.4, -fondo / 2));
    caja.applyMatrix4(matrizEn(s, lado * (hw + ACERA), BORDILLO, -lado));
    mundo.add(caja);
    reservas.push({ s0: s - ancho / 2 - 2, s1: s + ancho / 2 + 2, lado });
  };
  for (const [tipo, z, d, lado] of def.hitos) {
    if (!FACHADAS[tipo]) continue;
    const [pinta, ancho, alto, fondo] = FACHADAS[tipo];
    fachada(pinta(), enZona(z, d), lado, ancho, alto, fondo);
  }

  // Las casas, seguidas a los dos lados donde la zona las tiene.
  for (const cr of corridas) {
    if (!ZONAS[cr.zona].casas) continue;
    for (const lado of [-1, 1]) {
      let s = cr.z0 + 2;
      while (s < hasta(cr.z1, 60)) {
        const casa = elige(r, CASAS);
        const medio = s + casa.ancho / 2;
        if (!reservas.some((q) => q.lado === lado && medio > q.s0 && medio < q.s1)) {
          const hw = muestra(medio).hw;
          f.pon(casa.g, matrizEn(medio, lado * (hw + ACERA), -0.4, -lado));
        }
        s += casa.ancho + 0.15;
      }
    }
  }

  // Faroles de hierro.
  const poste = new THREE.CylinderGeometry(0.06, 0.09, 3.6, 6).translate(0, 1.8, 0);
  const brazo = new THREE.BoxGeometry(0.06, 0.06, 0.6).translate(0, 3.5, 0.3);
  const farol = new THREE.BoxGeometry(0.22, 0.32, 0.22).translate(0, 3.3, 0.58);
  const geoFarol = mergeGeometries([poste.toNonIndexed(), brazo.toNonIndexed()]);
  const negro = mate({ color: 0x1E1E22 });
  const luz = new THREE.MeshBasicMaterial({ color: 0xFFE08A });
  const fF = new Fundidor();
  for (const cr of corridas) {
    if (!ZONAS[cr.zona].faroles) continue;
    for (let s = cr.z0 + 6; s < hasta(cr.z1, 40); s += 13) {
      for (const lado of [-1, 1]) {
        const ss = s + (lado > 0 ? 6 : 0);
        if (ss < SALIDA + 4 && ss > SALIDA - 4) continue;
        const hw = muestra(ss).hw;
        const m = matrizEn(ss, lado * (hw + 0.35), BORDILLO, -lado);
        fF.pon(new THREE.Mesh(geoFarol, negro), m);
        fF.pon(new THREE.Mesh(farol, luz), m);
        obstaculos.push({ s: ss, x: lado * (hw + 0.35), r: 0.15, tipo: 'farol' });
        if (def.noche) halos.push(punto(ss, lado * (hw + 0.35), 4.35));
      }
    }
  }
  fF.funde();
  // De noche, cada farol lleva su halo cálido.
  if (halos.length) {
    const matHalo = new THREE.SpriteMaterial({ map: textura(halo()), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 });
    for (const p of halos) { const sp = new THREE.Sprite(matHalo); sp.scale.set(4.2, 4.2, 1); sp.position.copy(p); mundo.add(sp); }
  }

  // Los puestos de la vereda, que se meten un poco en la calle, y los cajones
  // sueltos (girados: lo ancho va a lo largo de la calle; de lado ocupan 1,2 m).
  for (const cr of corridas) {
    const zz = ZONAS[cr.zona];
    if (zz.puestos) {
      for (let s = cr.z0 + 12; s < Math.min(cr.z1, META - 6); s += zz.puestos + r() * 12) {
        const lado = r() < 0.5 ? -1 : 1, hw = muestra(s).hw;
        const x = lado * (hw - 0.25);
        f.pon(PIEZAS.obstaculo_muro.g, matrizEn(s, x, 0, 0, Math.PI / 2 * lado));
        obstaculos.push({ s, x, r: 0.6, largo: 1.0, tipo: 'puesto' });
      }
    }
    for (let k = 0; k < (zz.cajones || 0); k++) {
      const s = cr.z0 + 20 + (k + r() * 0.6) * (cr.z1 - cr.z0 - 40) / zz.cajones, hw = muestra(s).hw;
      if (s > META - 6) continue;
      const x = (r() - 0.5) * (hw - 1) * 2;
      f.pon(PIEZAS.obstaculo_salto.g, matrizEn(s, x, 0, 0, Math.PI / 2));
      obstaculos.push({ s, x, r: 0.6, largo: 0.8, tipo: 'cajon' });
    }
  }
  f.funde();

  // El rótulo de cada calle, al empezar la zona, en una placa azul.
  const matPoste = mate({ color: 0x2A2A2E });
  for (const cr of corridas) {
    const zz = ZONAS[cr.zona];
    if (!zz.casas || cr.z1 - cr.z0 < 30) continue;
    const s = cr.z0 + 10, hw = muestra(s).hw, lado = cr.z0 % 2 ? 1 : -1;
    const grupo = new THREE.Group();
    grupo.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6).translate(0, 1.3, 0), matPoste));
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), mate({ map: textura(lienzo(352, 90, (c, w, h) => {
      c.fillStyle = '#1F4E9E'; c.fillRect(0, 0, w, h); c.strokeStyle = '#F3F1EC'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = '#F3F1EC'; c.font = '700 40px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(zz.nombre.replace(/^(La|El) (bajada|cuesta|subida) de (la )?/i, ''), w / 2, h / 2 + 2);
    })), side: THREE.DoubleSide }));
    placa.position.set(0, 2.45, 0); grupo.add(placa);
    grupo.applyMatrix4(matrizEn(s, lado * (hw + ACERA - 0.3), BORDILLO, -lado));
    mundo.add(grupo);
  }
  // Una pileta en cada plaza, a un lado, con su chorro.
  for (const cr of corridas) {
    if (ZONAS[cr.zona].lado !== 'plaza' || cr.z1 - cr.z0 < 60) continue;
    const s = cr.z0 + 30, hw = muestra(s).hw;
    const pileta = new THREE.Group();
    pileta.add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.6, 16).translate(0, 0.3, 0), mate({ color: 0xA9A196 })));
    pileta.add(new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.08, 16).translate(0, 0.58, 0), mate({ color: 0x5FA8C8, roughness: 0.2, metalness: 0.1 })));
    pileta.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 1.6, 10).translate(0, 1.3, 0), mate({ color: 0xA9A196 })));
    pileta.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 16).translate(0, 2.1, 0), mate({ color: 0xA9A196 })));
    pileta.applyMatrix4(matrizEn(s, -(hw + ACERA + 3.2), BORDILLO, 0));
    mundo.add(pileta);
  }

  // Los cerros: eucaliptos, arrayanes redondos, arbustos y muros de piedra.
  const tronco = new THREE.CylinderGeometry(0.18, 0.28, 9, 6).translate(0, 4.5, 0);
  const troncoBajo = new THREE.CylinderGeometry(0.16, 0.22, 3.2, 6).translate(0, 1.6, 0);
  const copa = new THREE.IcosahedronGeometry(2.2, 0);
  const copaRedonda = new THREE.IcosahedronGeometry(2.4, 1);
  const arbusto = new THREE.IcosahedronGeometry(0.7, 0);
  const matTronco = mate({ color: 0xBFAE96 });
  const verdes = [0x5F7F62, 0x6E8F6C, 0x55745A, 0x7FA07A].map((c) => mate({ color: c, flatShading: true }));
  const muro = new THREE.BoxGeometry(5.2, 0.7, 0.5).translate(0, 0.35, 0);
  const matMuro = mate({ color: 0x9A9385 });
  const fP = new Fundidor();
  for (const cr of corridas) {
    if (!ZONAS[cr.zona].arboles) continue;
    for (let s = cr.z0; s < Math.min(cr.z1 + (LARGO_VUELTA ? 0 : 30), N - 5); s += 7) {
      if (s > SALIDA - 6 && s < SALIDA + 8) continue;
      for (const lado of [-1, 1]) {
        // En un anillo, los árboles van por fuera: por dentro se ve el cerro.
        if (def.arbolesLado && lado !== def.arbolesLado) continue;
        const hw = muestra(s).hw, x = lado * (hw + ACERA + 1.5 + r() * 9);
        const m = matrizEn(s + r() * 4, x, BORDILLO - 0.2, 0, r() * 6);
        if (r() < 0.3) {
          // Un arrayán: bajo y redondo.
          fP.pon(new THREE.Mesh(troncoBajo, matTronco), m);
          const e = 0.7 + r() * 0.4;
          fP.pon(new THREE.Mesh(copaRedonda, elige(r, verdes)), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 3.6, 0).multiply(new THREE.Matrix4().makeScale(e, e * 0.9, e))));
        } else {
          fP.pon(new THREE.Mesh(tronco, matTronco), m);
          for (let k = 0; k < 3; k++) {
            const t = new THREE.Matrix4().makeTranslation((r() - 0.5) * 2.2, 8 + r() * 2.5, (r() - 0.5) * 2.2);
            const e = 0.8 + r() * 0.6;
            t.multiply(new THREE.Matrix4().makeScale(e, e * 1.25, e));
            fP.pon(new THREE.Mesh(copa, elige(r, verdes)), m.clone().multiply(t));
          }
        }
        // Arbustos al pie, junto a la calle.
        if (r() < 0.5) { const e = 0.7 + r() * 0.8; fP.pon(new THREE.Mesh(arbusto, elige(r, verdes)), matrizEn(s + r() * 5, lado * (hw + ACERA + 0.6 + r() * 1.2), BORDILLO + 0.3 * e, 0).multiply(new THREE.Matrix4().makeScale(e, e * 0.8, e))); }
      }
    }
    for (let s = Math.max(cr.z0, SALIDA + 11); s < cr.z1; s += 6) {
      for (const lado of [-1, 1]) {
        const hw = muestra(s).hw;
        fP.pon(new THREE.Mesh(muro, matMuro), matrizEn(s, lado * (hw + ACERA + 0.25), BORDILLO, 0, Math.PI / 2));
      }
    }
  }
  fP.funde();
  // El cerro: una loma de pasto con la Virgen encima, para el circuito que
  // le da la vuelta. [tipo, zona, d, x, radio, alto]; con zona null, d y x
  // son coordenadas del mundo (el centro del anillo generado es 0, 0).
  for (const [tipo, z, d, x, radio, alto] of def.hitos) {
    if (tipo !== 'cerro') continue;
    const g = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(radio, alto, radio);
    const pos = g.attributes.position;
    const r2 = azar(7);
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y > 0.5) pos.setY(i, y + (r2() - 0.5) * 1.6); }
    g.computeVertexNormals();
    const loma = new THREE.Mesh(g, mate({ color: 0x7FA86A, flatShading: true }));
    if (z === null) loma.position.set(d, -9, x); else loma.position.copy(punto(enZona(z, d), x, -0.6));
    loma.receiveShadow = true;
    mundo.add(loma);
    // Un camino de piedra que sube en espiral y, arriba, el pedestal.
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 2.2, 10), mate({ color: 0xC9C2B4 }));
    pedestal.position.copy(loma.position).y += alto - 0.4;
    mundo.add(pedestal);
    const v = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura(virgen()), fog: false }));
    v.scale.set(12, 21.3, 1);
    v.position.copy(loma.position).y += alto + 11;
    mundo.add(v);
  }
  for (const [tipo, z, d, x] of def.hitos) {
    if (tipo !== 'virgen') continue;
    const v = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura(virgen()), fog: false }));
    v.scale.set(15, 26.7, 1);
    v.position.copy(punto(enZona(z, d), x, 13.3));
    mundo.add(v);
  }

  // La gente que mira, en filas sobre la vereda (o en el pasto, arriba).
  const lugares = [];
  const fila = (s0, lado, n) => {
    for (let k = 0; k < n; k++) {
      const s = s0 + (k - n / 2) * 0.8 + r() * 0.3;
      if (s > SALIDA - 3 && s < SALIDA + 3) continue;
      lugares.push({ s, lado, fondo: r() });
    }
  };
  for (let s = LARGO_VUELTA ? SALIDA + 4 : 4; s < SALIDA + 10; s += 5) { fila(s, -1, 5); fila(s + 2.5, 1, 5); }
  if (!LARGO_VUELTA) for (let s = META - 14; s < META + 16; s += 5) { fila(s, -1, 6); fila(s + 2.5, 1, 6); }
  corridas.forEach((cr, k) => {
    const [paso, n] = ZONAS[cr.zona].publico || [0, 0];
    if (!paso) return;
    for (let s = cr.z0 + (k === 0 ? SALIDA + 30 : 4); s < hasta(cr.z1, 30); s += paso + r() * 4) fila(s, r() < 0.5 ? -1 : 1, n);
  });
  publico = construyePublico(lugares, r);

  // Banderines de colores cruzando las calles.
  const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.16, 0, 0), new THREE.Vector3(0.16, 0, 0), new THREE.Vector3(0, -0.38, 0)]);
  tri.computeVertexNormals();
  const banderas = [];
  for (const cr of corridas) {
    if (!ZONAS[cr.zona].banderas) continue;
    for (let s = cr.z0 + 12; s < hasta(cr.z1, 30); s += 16 + r() * 8) {
      const hw = muestra(s).hw, ancho = hw + ACERA - 0.3;
      for (let k = 1; k < 18; k++) {
        const f2 = k / 18, x = -ancho + f2 * ancho * 2;
        banderas.push(matrizEn(s, x, 6 - Math.sin(f2 * Math.PI) * 1.1, 0));
      }
    }
  }
  if (banderas.length) {
    const mB = new THREE.InstancedMesh(tri, mate({ side: THREE.DoubleSide }), banderas.length);
    const tonosB = ['#D6382B', '#1B5FAA', '#F5C518', '#2E7D4F', '#E01B6A', '#F3F1EC', '#6B2D7B'];
    banderas.forEach((m, k) => { mB.setMatrixAt(k, m); mB.setColorAt(k, new THREE.Color(tonosB[k % tonosB.length])); });
    mundo.add(mB);
  }

  // La salida y la meta, de lado a lado.
  const portal = (s, texto, meta) => {
    const hw = muestra(s).hw, ancho = (hw + 0.6) * 2;
    const grupo = new THREE.Group();
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 8).translate(0, 2.5, 0), mate({ color: 0x6B4423 }));
    const p1 = palo.clone(); p1.position.x = hw + 0.6; grupo.add(p1);
    const p2 = palo.clone(); p2.position.x = -(hw + 0.6); grupo.add(p2);
    const c = lienzo(1024, 128, (c, w, h) => {
      if (meta) { for (let k = 0; k < 32; k++) for (let f2 = 0; f2 < 2; f2++) { c.fillStyle = (k + f2) % 2 ? '#fff' : TINTA; c.fillRect(k * 32, f2 * 64, 32, 64); } }
      else { c.fillStyle = '#D6382B'; c.fillRect(0, 0, w, h); c.fillStyle = '#1F4E9E'; c.fillRect(0, h - 22, w, 22); }
      c.font = '800 56px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const tw = c.measureText(texto).width;
      if (meta) { c.fillStyle = '#fff'; c.fillRect(w / 2 - tw / 2 - 24, 14, tw + 48, h - 28); }
      c.fillStyle = meta ? TINTA : '#fff'; c.fillText(texto, w / 2, h / 2 + 2);
    });
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(ancho, ancho / 8), mate({ map: textura(c), side: THREE.DoubleSide }));
    tela.position.y = 4.6;
    grupo.add(tela);
    grupo.applyMatrix4(matrizEn(s, 0, 0, 0, Math.PI));
    mundo.add(grupo);
  };
  if (LARGO_VUELTA) portal(SALIDA, `META · ${def.meta}`, true);
  else { portal(SALIDA, `SALIDA · ${def.salida}`, false); portal(META, `META · ${def.meta}`, true); }

  // El Arco de la Reina, donde la pista lo tiene.
  for (const [tipo, z, d] of def.hitos) {
    if (tipo !== 'arco') continue;
    const s = enZona(z, d), hw = muestra(s).hw, ancho = (hw + ACERA) * 2 + 2;
    const blanco = mate({ color: 0xF2EEE5 });
    const grupo = new THREE.Group();
    const pilar = new THREE.BoxGeometry(1.4, 9, 3.4).translate(0, 4.5, 0);
    for (const l of [-1, 1]) { const m = new THREE.Mesh(pilar, blanco); m.position.x = l * (hw + ACERA + 0.5); grupo.add(m); }
    const cArco = lienzo(512, 160, (c, w) => {
      c.fillStyle = '#F2EEE5'; c.fillRect(0, 0, w, 160);
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
    mundo.add(grupo);
  }

  // En la calle: rampas de tabla y coladas.
  const rampa = (() => {
    const forma = new THREE.Shape();
    forma.moveTo(-1.2, 0); forma.lineTo(1.2, 0); forma.lineTo(1.2, 0.45); forma.closePath();
    const g = new THREE.ExtrudeGeometry(forma, { depth: 1.8, bevelEnabled: false });
    g.translate(0, 0, -0.9); g.rotateY(-Math.PI / 2);
    return g;
  })();
  for (const [z, d, x] of def.rampas) {
    const s = enZona(z, d);
    const m = new THREE.Mesh(rampa, MAT.madera);
    m.applyMatrix4(matrizEn(s, x, 0, 0));
    mundo.add(m);
    obstaculos.push({ s, x, r: 0.9, largo: 1.2, tipo: 'rampa' });
  }
  const matColada = new THREE.SpriteMaterial({ map: textura(colada()) });
  for (const [z, d] of def.coladas) {
    const s0 = enZona(z, d), lado = r() < 0.5 ? -1 : 1;
    for (let k = 0; k < 3; k++) {
      const s = s0 + k * 3, x = lado * (k - 1) * 1.3;
      const sp = new THREE.Sprite(matColada);
      sp.scale.set(0.55, 0.7, 1);
      sp.position.copy(punto(s, x, 0.9));
      mundo.add(sp);
      obstaculos.push({ s, x, r: 0.4, largo: 0.5, tipo: 'colada', sp, base: sp.position.y });
    }
  }
  // Las estampitas de esta pista, flotando y girando a un lado de la calle.
  // Las que ya están en el álbum se ven apagadas.
  for (const cr of CROMOS) {
    if (cr.pista !== def.id) continue;
    const s = enZona(cr.zona, cr.d);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.02), new THREE.MeshBasicMaterial({ map: textura(cromoCanvas(cr)), side: THREE.DoubleSide, transparent: true }));
    m.position.copy(punto(s, cr.x, 1.05));
    if (prog.album.includes(cr.id)) m.material.opacity = 0.35;
    mundo.add(m);
    obstaculos.push({ s, x: cr.x, r: 0.5, largo: 0.7, tipo: 'cromo', id: cr.id, mesh: m, base: m.position.y });
  }
  // En un circuito, lo que hay en la calle está en cada vuelta: mismas
  // piezas, otro metro.
  if (LARGO_VUELTA) {
    const base = obstaculos.filter((o) => o.s >= DECO_INI && o.s < DECO_FIN);
    for (let v = 1; v < def.vueltas; v++) for (const o of base) obstaculos.push({ ...o, s: o.s + v * LARGO_VUELTA });
  }
  obstaculos.sort((a, b) => a.s - b.s);
}

// Cambia de pista: vacía el mundo y lo arma de nuevo con la calle, el
// decorado y la gente de la pista nueva, y pone a todos en la parrilla.
let pistaActual = null;
function cargaPista(id) {
  const def = PISTAS.find((p) => p.id === id);
  if (!construyePista(def)) return false;
  limpiaMundo();
  obstaculos.length = 0;
  ambienta(!!def.noche);
  construyeCalle();
  if (CASAS.length) construyeDecorado(def);
  pistaActual = def;
  reinicia();
  return true;
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
    mundo.add(m);
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
      mundo.add(letrero);
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
  { id: 'cantuna', nombre: 'Cantuña y el Diablo', lema: 'El Diablo empuja; Cantuña ya escondió la piedra.', piloto: 'cantuna', empuja: 'diablo', tabla: '#A87445', placa: '#D3271F', num: 6, stats: [3, 5, 2], hab: 0.97 },
  { id: 'gallo', nombre: 'El Gallo y Don Ramón', lema: 'Don Ramón le gritó al Gallo de la Catedral. Ahora maneja el Gallo.', piloto: 'gallo', empuja: 'borracho', tabla: '#C8955A', placa: '#B98325', num: 3, stats: [5, 1, 3], hab: 0.96 },
  { id: 'guarichas', nombre: 'Las Guarichas', lema: 'Fueron a la guerra de la Independencia: una bajada no las asusta.', piloto: 'guaricha', empuja: 'guaricha2', tabla: '#B98250', placa: '#1F4E9E', num: 9, stats: [2, 4, 5], hab: 0.94 },
  { id: 'mamanegra', nombre: 'La Mamá Negra y el Ángel', lema: 'Desde Latacunga, con el Ángel de la Estrella empujando.', piloto: 'mamanegra', empuja: 'angel', tabla: '#D2A26A', placa: '#E01B6A', num: 11, stats: [4, 2, 4], hab: 0.93 },
];
const STATS = ['Velocidad', 'Empuje', 'Giro'];
// Las pinturas de la tabla: se ganan con las estampitas y con la Copa de
// la Noche. La de madera es la de siempre (el color de cada pareja).
const PINTURAS = [
  { id: 'madera', nombre: 'Madera', lema: 'La tabla como viene del aserradero.' },
  { id: 'fiesta', nombre: 'Rojo de fiesta', lema: 'Pintada con el rojo de las banderitas.', color: 0xC8301E },
  { id: 'anil', nombre: 'Añil', lema: 'El azul de las puertas del centro.', color: 0x1E4FA0 },
  { id: 'morada', nombre: 'Colada morada', lema: 'Morada como la colada, y con el mismo brillo.', color: 0x6B2D7B },
  { id: 'oro', nombre: 'Dorada', lema: 'La tabla de los campeones de la noche.', color: 0xE2B13C, metal: true },
];
function aplicaPintura() {
  for (const cc of carros) { cc.cruce.tabla.material.color.set(cc.cruce.eq.tabla); cc.cruce.tabla.material.metalness = 0; cc.cruce.tabla.material.roughness = 0.85; }
  const p = PINTURAS.find((q) => q.id === prog.pintura) || PINTURAS[0];
  if (p.color && cocheJ) { cocheJ.tabla.material.color.set(p.color); if (p.metal) { cocheJ.tabla.material.metalness = 0.7; cocheJ.tabla.material.roughness = 0.3; } }
}
const ALTO = 1.25;

const persona = (id) => {
  const d = PERSONAJES[id];
  return new Persona(d.base, { altura: ALTO, colores: d.pinta, metal: d.metal, piezas: d.piezas, tambalea: d.tambalea });
};

function construyeCoche(eq) {
  const g = new THREE.Group();
  // La tabla, de tres tablones, con un listón a cada lado y un asiento.
  const tabla = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 1.9), mate({ map: TEX.tablones, color: eq.tabla }));
  tabla.position.y = TABLA;
  g.add(tabla);
  const oscura = mate({ map: TEX.madera, color: 0x8A5A2E });
  for (const l of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 1.7), oscura); r.position.set(l * 0.32, TABLA + 0.07, -0.05); g.add(r); }
  const asiento = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.34), oscura); asiento.position.set(0, TABLA + 0.055, 0.3); g.add(asiento);
  // Las ruedas: llanta de caucho y cubo de metal, sobre ejes negros.
  const metal = mate({ color: 0x8C9096, metalness: 0.4, roughness: 0.5 });
  const caucho = mate({ color: 0x2A2A2C, roughness: 0.95 });
  const eje = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.04, 0.05), mate({ color: 0x3A3A3A }));
  const llanta = new THREE.TorusGeometry(0.085, 0.032, 8, 16).rotateY(Math.PI / 2);
  const cubo = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10).rotateZ(Math.PI / 2);
  const ruedas = [];
  const delante = new THREE.Group(); delante.position.set(0, 0.1, 0.78); g.add(delante);
  const atras = new THREE.Group(); atras.position.set(0, 0.1, -0.78); g.add(atras);
  for (const grupo of [delante, atras]) {
    grupo.add(eje.clone());
    for (const l of [-1, 1]) {
      const w = new THREE.Group(); w.position.x = l * 0.41;
      w.add(new THREE.Mesh(llanta, caucho), new THREE.Mesh(cubo, metal));
      grupo.add(w); ruedas.push(w);
    }
  }
  // La soga del volante: del eje de delante a las manos del que maneja.
  const sogaMat = mate({ color: 0xD9C7A0 });
  for (const l of [-1, 1]) {
    const soga = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5), sogaMat);
    soga.position.set(l * 0.28, 0.28, 0.5); soga.rotation.x = -1.05; soga.rotation.z = l * 0.35;
    g.add(soga);
  }
  // La palanca del freno, a la derecha, con su pomo rojo.
  const palanca = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.42, 6), mate({ color: 0x3A3A3A }));
  palanca.position.set(0.36, TABLA + 0.22, 0.05); palanca.rotation.x = 0.5; g.add(palanca);
  const pomo = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mate({ color: 0xD6382B }));
  pomo.position.set(0.36, TABLA + 0.41, -0.05); g.add(pomo);
  // Los tacos donde se apoyan los ejes, y el número atrás.
  const taco = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), mate({ map: TEX.madera }));
  for (const z of [0.78, -0.78]) { const t = taco.clone(); t.position.set(0, 0.17, z); g.add(t); }
  // El banderín con el color de la pareja, atrás, para verlo en la carrera.
  const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 5), metal);
  mastil.position.set(-0.3, TABLA + 0.45, -0.85); g.add(mastil);
  const bandera = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(0, 0.66, 0), new THREE.Vector3(0.34, 0.8, 0)]),
    new THREE.MeshBasicMaterial({ color: eq.placa, side: THREE.DoubleSide }));
  bandera.geometry.computeVertexNormals();
  bandera.position.set(-0.3, TABLA, -0.85); bandera.rotation.y = Math.PI / 2; g.add(bandera);
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
  return { g, ruedas, delante, sombra, conductor, empujador, eq, tabla };
}
// El fantasma: un coche traslúcido con la misma pareja, que repite el récord.
function construyeFantasma(eq) {
  const cc = construyeCoche(eq);
  for (const raiz of [cc.g, cc.conductor.obj, cc.empujador.obj]) {
    raiz.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.castShadow = false;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const nuevos = ms.map((m) => { const n = m.clone(); n.transparent = true; n.opacity = 0.38; n.depthWrite = false; return n; });
      o.material = Array.isArray(o.material) ? nuevos : nuevos[0];
    });
  }
  cc.sombra.visible = false;
  cc.conductor.pon('montado', { fundido: 0 }); cc.empujador.pon('montado', { fundido: 0 });
  return cc;
}

// ─── el estado ─────────────────────────────────────────────────────
const j = {};          // el jugador y su coche
const e = {};          // su empujador
const c = {};          // su conductor, cuando sale volando
let rivales = [];
let peatones = [];
let estado = 'cargando';      // cargando · titulo · menu · elegir · cuenta · carrera · llegada · pausa · premio · podio
let antes = 'carrera';
const foto = { s: 0, x: 0, h: 2, giro: 0 };
// El fantasma del récord: dónde iba el coche cada décima de segundo.
const fantasma = { trazo: [], datos: null, coche: null, t: 0 };
const fantasmaClave = (id) => `coches3d-fantasma-${id}`;
const cromosNuevos = [];
let reloj = 0, cuenta = 0, tLlegada = 0, zonaActual = '', sacudida = 0, tPeaton = 0, llegadaVista = false, vueltaActual = 1;
const vueltaDe = (s) => LARGO_VUELTA ? limita(Math.floor((s - SALIDA) / LARGO_VUELTA) + 1, 1, pistaActual.vueltas) : 1;
const teclas = { izq: false, der: false, empuja: false, freno: false };
let cocheJ, carros = [], eqJ;
// Lo que la pareja elegida cambia de la física: velocidad, empuje y giro.
const ST = { tope: 1, empuje: 1, giro: 1 };

function reinicia() {
  for (const o of obstaculos) { o.tomada = false; o.golpe = -9; if (o.sp) o.sp.visible = true; if (o.mesh) { o.mesh.visible = true; o.mesh.material.opacity = prog.album.includes(o.id) ? 0.35 : 1; } }
  cromosNuevos.length = 0;
  const grilla = (k) => ({ x: k % 2 ? 1.9 : -1.9, s: SALIDA - 2 - Math.floor(k / 2) * 5 - (k % 2) * 1.8 });
  // El jugador sale último, como en todo kart que se respete.
  rivales.forEach((rv, k) => {
    const p = grilla(k);
    Object.assign(rv, { s: p.s, x: p.x, carril: p.x, v: 0, llegada: 0, empuja: true });
  });
  const p = grilla(rivales.length);
  Object.assign(j, { s: p.s, x: p.x, v: 0, vx: 0, h: 0, vh: 0, aire: false, volcado: 0, turbo: 0, coladas: 0, giro: 0, puesto: rivales.length + 1, llegada: 0 });
  Object.assign(e, { estado: 'empujando', s: j.s - 1.3, x: j.x, t: 0, tSube: -9 });
  Object.assign(c, { suelto: false, s: 0, x: 0, v: 0 });
  for (const pe of peatones) pe.estado = 'libre';
  reloj = 0; zonaActual = ''; sacudida = 0; tPeaton = 1; vueltaActual = 1;
  Object.assign(pasos, { ultimo: 0, combo: 0, burst: 0, tIzq: -9, tDer: -9, prevEmp: false, pulsos: [], unPie: 0, sesgo: 0 });
  demoPaso = 0;
  fantasma.trazo = [];
  // En la contrarreloj los rivales se esconden, y sale el fantasma si hay récord.
  const solo = modo === 'tiempo';
  for (const rv of rivales) { rv.cruce.g.visible = !solo; rv.cruce.conductor.obj.visible = !solo; rv.cruce.empujador.obj.visible = !solo; if (solo) rv.s = -999; }
  if (fantasma.coche) { fantasma.coche.g.visible = false; fantasma.coche.conductor.obj.visible = false; fantasma.coche.empujador.obj.visible = false; }
  fantasma.datos = null;
  if (solo && pistaActual) {
    try { if (prog.records[pistaActual.id]) fantasma.datos = JSON.parse(localStorage.getItem(fantasmaClave(pistaActual.id)) || 'null'); } catch (err) { /* sin almacenamiento */ }
    if (fantasma.datos && fantasma.datos.length > 2) {
      if (!fantasma.coche) fantasma.coche = construyeFantasma(eqJ);
      fantasma.coche.g.visible = true; fantasma.coche.conductor.obj.visible = true; fantasma.coche.empujador.obj.visible = true;
    } else fantasma.datos = null;
  }
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
  son.salida = a.createGain(); son.salida.gain.value = ajustes.sonido ? 0.8 : 0; son.salida.connect(a.destination);
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
// ─── la música ─────────────────────────────────────────────────────
// Un sanjuanito de chip: melodía pentatónica en la menor con un rondador
// (triángulo con vibrato), bajo de sierra, bombo y chasquido. Las notas se
// escriben por corcheas («-» alarga, «.» calla) y se programan con un poco
// de adelanto sobre el reloj del AudioContext, que es como se hace.
const NOTAS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hz = (t) => { const m = /^([A-G])(#?)(\d)$/.exec(t); return 440 * Math.pow(2, ((NOTAS[m[1]] + (m[2] ? 1 : 0) + (m[3] - 4) * 12) - 9) / 12); };
const CANCIONES = {
  menu: {
    bpm: 100,
    melodia: 'E5 E5 D5 C5 A4 A4 C5 D5 E5 E5 G5 E5 D5 C5 A4 - C5 C5 D5 E5 G5 E5 D5 C5 A4 C5 D5 C5 A4 - - . ' +
      'E5 G5 A5 G5 E5 D5 C5 D5 E5 E5 D5 C5 A4 C5 A4 G4 A4 A4 C5 D5 E5 D5 C5 A4 G4 A4 C5 A4 A4 - - . ',
    bajo: 'A2 - A2 - A2 - A2 - G2 - G2 - A2 - A2 - C3 - C3 - G2 - G2 - A2 - E2 - A2 - A2 - ' +
      'A2 - A2 - G2 - G2 - A2 - A2 - F2 - E2 - A2 - A2 - G2 - G2 - A2 - E2 - A2 - A2 - ',
    bombo: 'x . x . ', chas: '. x . x ',
  },
  carrera: {
    bpm: 136,
    melodia: 'A4 C5 E5 E5 D5 C5 D5 E5 A4 C5 E5 G5 E5 D5 C5 - A4 C5 E5 E5 D5 C5 D5 E5 G5 E5 D5 C5 A4 - - . ' +
      'E5 G5 A5 A5 G5 E5 G5 A5 E5 G5 A5 C6 A5 G5 E5 - D5 E5 D5 C5 A4 C5 D5 E5 C5 A4 G4 A4 A4 - - . ',
    bajo: 'A2 A2 A2 - A2 A2 A2 - G2 G2 G2 - G2 G2 G2 - C3 C3 C3 - C3 C3 C3 - A2 A2 E2 - E2 E2 E2 - ' +
      'A2 A2 A2 - A2 A2 A2 - F2 F2 F2 - G2 G2 G2 - A2 A2 A2 - D3 D3 D3 - E2 E2 E2 - A2 A2 A2 - ',
    bombo: 'x . x x ', chas: '. x . x ',
  },
};
const musica = { nombre: null, paso: 0, t: 0, timer: null, gain: null, ctx: null };  // ctx: otro contexto, para las pruebas
function musicaInstrumentos() {
  if (musica.gain) return;
  const a = musica.ctx || son.ctx;
  musica.gain = a.createGain(); musica.gain.gain.value = ajustes.musica || musica.ctx ? 0.32 : 0; musica.gain.connect(musica.ctx ? a.destination : son.salida);
}
function musicaNota(f, t, dur, tipo, vol, filtro) {
  const a = musica.ctx || son.ctx, o = a.createOscillator(), g = a.createGain();
  o.type = tipo; o.frequency.setValueAtTime(f, t);
  if (tipo === 'triangle') { const v = a.createOscillator(), vg = a.createGain(); v.frequency.value = 5.5; vg.gain.value = f * 0.006; v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + dur + 0.05); }
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (filtro) { const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filtro; o.connect(fl); fl.connect(g); } else o.connect(g);
  g.connect(musica.gain); o.start(t); o.stop(t + dur + 0.05);
}
function musicaGolpe(t, bombo) {
  const a = musica.ctx || son.ctx;
  if (bombo) {
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(musica.gain); o.start(t); o.stop(t + 0.2);
  } else {
    const sr = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    if (!musica.ruido || musica.ruido.sampleRate !== a.sampleRate) { musica.ruido = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = musica.ruido.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    sr.buffer = musica.ruido; f.type = 'highpass'; f.frequency.value = 5000;
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    sr.connect(f); f.connect(g); g.connect(musica.gain); sr.start(t, Math.random() * 1.5); sr.stop(t + 0.06);
  }
}
function musicaTick() {
  const a = musica.ctx || son.ctx;
  if (!a) return;
  musicaTickHasta(a.currentTime + 0.15);
}
function musicaTickHasta(limite) {
  const c = CANCIONES[musica.nombre];
  if (!c) return;
  const corchea = 30 / c.bpm;
  const mel = c.melodia.trim().split(/\s+/), bajo = c.bajo.trim().split(/\s+/), bombo = c.bombo.trim().split(/\s+/), chas = c.chas.trim().split(/\s+/);
  const largo = (tok, i) => { let n = 1; while (tok[(i + n) % tok.length] === '-') n++; return n; };
  while (musica.t < limite) {
    const i = musica.paso % mel.length, t = musica.t;
    if (mel[i] !== '-' && mel[i] !== '.') musicaNota(hz(mel[i]), t, corchea * largo(mel, i) * 0.95, 'triangle', 0.22);
    const b = bajo[musica.paso % bajo.length];
    if (b !== '-' && b !== '.') musicaNota(hz(b), t, corchea * largo(bajo, musica.paso % bajo.length) * 0.9, 'sawtooth', 0.16, 420);
    if (bombo[musica.paso % bombo.length] === 'x') musicaGolpe(t, true);
    if (chas[musica.paso % chas.length] === 'x') musicaGolpe(t, false);
    musica.paso++; musica.t += corchea;
  }
}
// Toca una canción (si no es la que suena ya); con null, se calla.
function tocaMusica(nombre) {
  if (musica.nombre === nombre) return;
  if (musica.timer) { clearInterval(musica.timer); musica.timer = null; }
  musica.nombre = nombre;
  if (!nombre || !(musica.ctx || son.ctx)) return;
  musicaInstrumentos();
  musica.paso = 0; musica.t = (musica.ctx || son.ctx).currentTime + 0.08;
  musica.timer = setInterval(musicaTick, 40);
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
const stats = { vuelcos: 0, atropellos: 0, saltos: 0, choques: 0 };
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

// ─── el que empuja: a pie, pisando ──────────────────────────────
// Cuando el coche va lento, el de atrás se baja y empuja a pie. La flecha
// izquierda mueve su pie izquierdo y la derecha el derecho: cuantos más pasos
// por segundo, más empuja. Alternando, empuja recto. Dos veces el mismo pie
// sube el otro a la tabla y empuja solo con ese, de un lado: el coche se va
// hacia el lado contrario. Los dos lados a la vez, o la tecla de arriba, son
// el empujón fuerte, pero solo a pie y gastando una colada morada guardada:
// sale disparado y se sube al carro. Cuando el coche ya va rápido, se trepa solo.
const pasos = { ultimo: 0, combo: 0, mejor: 0, prevIzq: false, prevDer: false, prevEmp: false,
  tIzq: -9, tDer: -9, pulsos: [], burst: 0, unPie: 0, sesgo: 0 };
const COLADAS_MAX = 3;       // coladas que se pueden guardar para el empujón
const PASOS_VENTANA = 1;     // segundos que cuentan para el ritmo
const PASOS_TOPE = 4;        // pasos en ese segundo para el empuje entero
const DOBLE_VENTANA = 0.1;   // los dos lados en una décima son a la vez
const BAJA_EMPUJE = 4;       // por debajo de esta velocidad se baja a empujar (m/s)

// Cuánto empuja lo que pisa, de 0 a 1: los pasos del último segundo.
function ritmo() {
  const corte = reloj - PASOS_VENTANA;
  while (pasos.pulsos.length && pasos.pulsos[0].t < corte) pasos.pulsos.shift();
  let n = 0;
  for (const q of pasos.pulsos) n += q.peso;
  return Math.min(1, n / PASOS_TOPE);
}

function pasaPasos(dt) {
  const subeIzq = teclas.izq && !pasos.prevIzq, subeDer = teclas.der && !pasos.prevDer;
  const subeEmp = teclas.empuja && !pasos.prevEmp;
  pasos.prevIzq = teclas.izq; pasos.prevDer = teclas.der; pasos.prevEmp = teclas.empuja;
  pasos.burst = Math.max(0, pasos.burst - dt);
  pasos.sesgo = Math.sign(pasos.sesgo) * Math.max(0, Math.abs(pasos.sesgo) - dt * 1.4);
  if (subeIzq) pasos.tIzq = reloj;
  if (subeDer) pasos.tDer = reloj;
  if (!subeIzq && !subeDer && !subeEmp) return;
  if (j.aire || j.volcado > 0) return;
  const doble = subeEmp
    || (subeIzq && teclas.der && reloj - pasos.tDer < DOBLE_VENTANA)
    || (subeDer && teclas.izq && reloj - pasos.tIzq < DOBLE_VENTANA);
  if (doble) {
    pasos.tIzq = pasos.tDer = -9;
    // Sin colada guardada, o ya a bordo, no hay empujón: solo un golpe sordo.
    if (e.estado !== 'empujando' || !(j.coladas > 0)) { tono(140, 0.08, 'triangle', 0.08); return; }
    j.coladas--;
    j.v = Math.min(j.v + 6 * ST.empuje, TOPE_TURBO * ST.tope);
    j.turbo = Math.max(j.turbo, 1.2);
    pasos.burst = 0.5; pasos.unPie = 0; pasos.sesgo = 0;
    sacudida = Math.max(sacudida, 0.6);
    e.estado = 'a_bordo'; e.tSube = reloj; cocheJ.empujador.pon('montado');
    tono(520, 0.12, 'triangle', 0.18); setTimeout(() => tono(880, 0.14, 'triangle', 0.16), 80);
    avisa('¡Empujón de colada!', 800);
    return;
  }
  if (e.estado !== 'empujando') return;   // a bordo, los pies no cuentan
  const lado = subeIzq ? -1 : 1;
  const alterna = lado !== pasos.ultimo;
  pasos.pulsos.push({ t: reloj, peso: alterna ? 1 : 0.8 });
  if (alterna) {
    pasos.unPie = 0;
    pasos.combo++;
    pasos.mejor = Math.max(pasos.mejor, pasos.combo);
    pasos.burst = 0.35;
    tono(440 + Math.min(pasos.combo, 12) * 30, 0.05, 'square', 0.07);
  } else {
    // El mismo pie otra vez: el otro sube a la tabla y empuja de un lado,
    // así que el coche se va hacia el lado contrario.
    pasos.unPie = lado;
    pasos.sesgo = -lado;
    pasos.combo = 0;
    tono(300, 0.06, 'triangle', 0.08);
  }
  pasos.ultimo = lado;
  // El pie que se pisa, adelante: el compás del cuerpo se va al paso en unas décimas.
  const r = cocheJ.carrera || (cocheJ.carrera = { fase: 0, inclina: 0 });
  const obj = lado < 0 ? Math.PI / 2 : (3 * Math.PI) / 2;
  r.obj = obj + 2 * Math.PI * Math.round((r.fase - obj) / (2 * Math.PI));
  r.lleva = 0.3;
}

function actualizaEmpujador(dt) {
  switch (e.estado) {
    case 'a_bordo':
      // Va lento: se baja a empujar. Un momento tras subirse no, para que el impulso no lo baje.
      if (!j.aire && j.volcado <= 0 && j.v < BAJA_EMPUJE && reloj - (e.tSube ?? -9) > 1.2) {
        e.estado = 'empujando'; cocheJ.empujador.pon('correr');
        tono(320, 0.08, 'triangle', 0.15);
      }
      break;
    case 'empujando':
      if (j.aire || j.volcado > 0) break;
      if (j.v >= ENGANCHE) {
        e.estado = 'a_bordo'; e.tSube = reloj; cocheJ.empujador.pon('montado');
        pasos.unPie = 0;
        tono(520, 0.1, 'triangle', 0.15);
      }
      break;
    case 'piso':
      e.t -= dt;
      e.v = Math.max(0, (e.v || 0) - 12 * dt);
      e.s += e.v * dt;
      if (e.t <= 0) {
        Object.assign(e, { estado: 'empujando', s: j.s - 1.3, x: j.x });
        cocheJ.empujador.pon('correr');
      }
      break;
  }
}

function actualiza(dt) {
  if (modo === 'demo' && (estado === 'carrera' || estado === 'cuenta')) pilotoDemo();
  if (estado === 'cuenta') {
    cuenta -= dt;
    const n = Math.ceil(cuenta);
    if (n !== actualiza.n) {
      actualiza.n = n;
      const el = $('#cuenta');
      el.classList.remove('is-sale'); void el.offsetWidth;
      el.textContent = n > 0 ? String(n) : pistaActual.premio ? '¡A subir!' : LARGO_VUELTA ? '¡A correr!' : '¡A bajar!';
      el.dataset.n = Math.max(0, n);
      el.classList.add('is-sale');
      tono(n > 0 ? 440 : 880, n > 0 ? 0.18 : 0.45, 'square', 0.12);
    }
    if (cuenta <= 0) estado = 'carrera';
    return;
  }
  if (estado !== 'carrera' && estado !== 'llegada') return;
  if (estado === 'carrera') {
    reloj += dt;
    // El trazo de esta carrera, por si sale récord.
    if (fantasma.trazo.length < Math.floor(reloj * 10) + 1) fantasma.trazo.push([+j.s.toFixed(2), +j.x.toFixed(2), +j.h.toFixed(2)]);
  }

  const m = muestra(j.s);
  const hw = m.hw, pend = m.pend, k = m.k, zona = m.zona;
  if (zona !== zonaActual) {
    zonaActual = zona;
    if (reloj > 1) avisa(ZONAS[zona].nombre);
  }
  if (LARGO_VUELTA && estado === 'carrera' && vueltaDe(j.s) !== vueltaActual) {
    vueltaActual = vueltaDe(j.s);
    avisa(vueltaActual === pistaActual.vueltas ? '¡Última vuelta!' : `Vuelta ${vueltaActual}`, 1300);
    tono(880, 0.15, 'square', 0.12, 1320);
    pintaRutaTitulo();
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
    if (estado === 'carrera') pasaPasos(dt);
    // Mientras se empuja, un toque es un paso y no gira: el volante entra
    // solo cuando el lado se sostiene más de una décima, y sube en un cuarto.
    const sost = (k, t0) => !teclas[k] ? 0 : e.estado === 'empujando' ? limita((reloj - t0 - 0.12) / 0.25, 0, 1) : 1;
    const mando = estado === 'llegada' ? 0 : limita(sost('der', pasos.tDer) - sost('izq', pasos.tIzq) + pasos.sesgo * 0.8, -1, 1);
    j.giro = mezcla(j.giro, mando, Math.min(1, dt * 10));
    const piedra = ZONAS[zona].calle === 'adoquin';
    let a = -AIRE * j.v * j.v;
    if (!j.aire) {
      a += -G * CUESTA * pend - (piedra ? ROCE_PIEDRA : ROCE);
      // Empuja lo que pisa: cuantos pasos por segundo, tanto empuje.
      if (e.estado === 'empujando') a += EMPUJE * ST.empuje * ritmo() * Math.max(0, 1 - j.v / CORRE);
      if (teclas.freno || estado === 'llegada') a -= j.v > 0.2 ? FRENO * (estado === 'llegada' ? 0.4 : 1) : 0;
      // En la vereda se frena; si se queda casi parado ahí, el de atrás lo
      // arrastra de vuelta a la calle.
      if (Math.abs(j.x) > hw) { a -= FUERA * Math.min(1, 0.3 + j.v / 8); sacudida = Math.max(sacudida, 0.4); if (j.v < 4) j.x -= Math.sign(j.x) * dt * 1.6; }
      // El volante responde desde parado, sube con la velocidad y no se va de
      // las manos en la bajada grande; la curva saca a v² · curvatura.
      const vg = Math.min(j.v, 30);
      j.vx = j.giro * GIRO * ST.giro * limita(j.v, 4.5, 24) - CENTRIFUGA * vg * vg * k;
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
      if (o.tipo === 'cromo' && dx < 1.0) {
        for (const q of obstaculos) if (q.tipo === 'cromo' && q.id === o.id) q.tomada = true;   // también en las otras vueltas
        o.mesh.visible = false;
        const cr = CROMOS.find((q) => q.id === o.id);
        if (modo !== 'demo' && !prog.album.includes(o.id)) { prog.album.push(o.id); cromosNuevos.push(o.id); guarda(); }
        avisa(`¡Estampita: ${cr.nombre}!`, 1400);
        jingle([784, 988, 1175, 1568], 0.07, 'triangle');
      } else if (o.tipo === 'colada' && dx < 0.8 && !j.aire) {
        // La colada se guarda: es el empujón fuerte, para cuando se empuja a pie.
        o.tomada = true; if (!LARGO_VUELTA) o.sp.visible = false;
        j.coladas = Math.min(COLADAS_MAX, (j.coladas || 0) + 1);
        tono(660, 0.12, 'triangle', 0.2); setTimeout(() => tono(990, 0.18, 'triangle', 0.2), 90);
        avisa(j.coladas > 1 ? `¡Colada morada! ×${j.coladas}` : '¡Colada morada!', 900);
      } else if (o.tipo === 'rampa' && dx < o.r && !j.aire && j.v > 3) {
        j.aire = true; j.h = 0.45; j.vh = Math.min(6, j.v * 0.32);
        o.golpe = reloj; tono(200, 0.2, 'sine', 0.2, 400); stats.saltos++;
      } else if ((o.tipo === 'farol' || o.tipo === 'puesto' || o.tipo === 'cajon') && dx < o.r + 0.35 && j.h < 0.5 && reloj - o.golpe > 1) {
        o.golpe = reloj;
        if (j.v > 5) volcar(o.tipo === 'puesto' ? '¡Al puesto de la señora!' : o.tipo === 'cajon' ? '¡El cajón!' : '¡Contra el farol!');
        else { j.v = 0.5; j.x += Math.sign(j.x - o.x || 1) * 0.3; golpe(0.6, 400); stats.choques++; }
      }
    }
  }

  // Los rivales, los peatones y los choques entre coches. En la
  // contrarreloj no hay rivales: solo el fantasma, que no choca.
  if (modo !== 'tiempo') for (const rv of rivales) actualizaRival(rv, dt);
  if (modo !== 'tiempo') for (const rv of rivales) {
    const ds = rv.s - j.s, dx = Math.abs(rv.x - j.x);
    if (Math.abs(ds) < 1.9 && dx < 0.72 && j.volcado <= 0) {
      if (ds > 0 && j.v > rv.v) { j.v = rv.v * 0.93; j.s = rv.s - 1.9; sacudida = 0.7; golpe(0.5, 900); }
      else if (ds < 0 && rv.v > j.v) { rv.v = j.v * 0.95; rv.s = j.s - 1.9; j.v += 0.4; }
      rv.x += (rv.x > j.x ? 1 : -1) * dt * 1.5;
    }
  }
  actualizaPeatones(dt);

  sacudida = Math.max(0, sacudida - dt * 2.4);
  for (const o of obstaculos) {
    if (Math.abs(o.s - j.s) > 120) continue;
    if (o.sp && o.sp.visible) o.sp.position.y = o.base + Math.sin(reloj * 4 + o.s) * 0.12;
    if (o.mesh && o.mesh.visible) { o.mesh.position.y = o.base + Math.sin(reloj * 3 + o.s) * 0.1; o.mesh.rotation.y = reloj * 2.2; }
  }

  if (estado === 'carrera' && j.s >= META) {
    j.llegada = reloj; estado = 'llegada'; tLlegada = 0;
    j.puesto = 1 + rivales.filter((rv) => rv.llegada).length;
    tono(523, 0.15, 'triangle', 0.2); setTimeout(() => tono(659, 0.15, 'triangle', 0.2), 140); setTimeout(() => tono(784, 0.4, 'triangle', 0.22), 280);
  }
  if (estado === 'llegada') {
    tLlegada += dt;
    if (tLlegada > 2.4 && !llegadaVista) { llegadaVista = true; if (modo === 'demo') terminaDemo(); else trasCarrera(); }
  }
}

function actualizaRival(rv, dt) {
  const m = muestra(rv.s);
  const hab = rv.cruce.eq.hab * 0.97;
  let a = -G * CUESTA * m.pend - (ZONAS[m.zona].calle === 'adoquin' ? ROCE_PIEDRA : ROCE) - AIRE * rv.v * rv.v / hab;
  // Su empujador se baja en las subidas y cuando hay que arrancar.
  const debe = rv.v < CORRE - 1.2 && (m.pend > 0.01 || rv.v < 3);
  if (debe !== rv.empuja) {
    rv.empuja = debe;
    rv.cruce.empujador.pon(debe ? 'correr' : 'montado');
  }
  // Cuesta arriba empujan con todo: si no, en la subida no hay carrera.
  if (rv.empuja) a += EMPUJE * (m.pend > 0.01 ? 1 : 0.85) * hab * Math.max(0, 1 - rv.v / CORRE) + (rv.v < 1 ? 1 : 0);
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
  if (tPeaton <= 0 && estado === 'carrera' && ZONAS[zonaEn(j.s + 30)].peatones && j.s + 40 < META) {
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
function enCoche(persona, coche, z, pose, corre) {
  const off = persona.apoyo(pose);
  // Corriendo, el de atrás va y viene un poco, rebota y se inclina hacia
  // delante: se ve que corre de verdad y no que flota.
  let dz = 0, dy = 0;
  if (corre) { dz = Math.sin(corre.fase) * 0.2; dy = Math.abs(Math.sin(corre.fase)) * 0.1; }
  _v.set(0, (pose === 'montado' ? TABLA + 0.03 + off - persona.pie : 0) + dy, z + dz);
  coche.localToWorld(_v);
  persona.obj.position.copy(_v);
  persona.obj.quaternion.copy(coche.quaternion);
  if (corre) persona.obj.rotateX(corre.inclina);
  if (persona.tambalea) persona.obj.rotateZ(Math.sin(performance.now() / 260) * 0.14);
}

// El compás de la carrera del que empuja: más rápido cuanto más rápido va el
// coche, y más inclinado cuanto más lento (arrancar es empujar con el cuerpo).
function pasoCarrera(cc, v, dt) {
  const r = cc.carrera || (cc.carrera = { fase: 0, inclina: 0 });
  r.fase += dt * (9 + Math.min(v, CORRE) * 1.6);
  // Tras un paso del jugador, el compás se acomoda al pie que pisó.
  if (r.lleva > 0) { r.lleva -= dt; r.fase = mezcla(r.fase, r.obj, Math.min(1, dt * 16)); }
  r.inclina = 0.3 + 0.22 * (1 - Math.min(1, v / CORRE));
  return r;
}

function colocaCoche(cc, s, x, h, giro, vuelco, v, dt) {
  colocaEnCalle(cc.g, s, x, h, -giro * 0.18, vuelco);
  cc.g.updateMatrixWorld(true);
  cc.delante.rotation.y = -giro * 0.35;
  for (const w of cc.ruedas) w.rotation.x += (v * dt) / 0.11;
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
  if (e.estado === 'piso') colocaEnCalle(cocheJ.empujador.obj, e.s, e.x, 0, 0);
  else if (e.estado === 'a_bordo') enCoche(cocheJ.empujador, cocheJ.g, -0.5, 'montado');
  else {
    enCoche(cocheJ.empujador, cocheJ.g, -1.3, 'correr', pasoCarrera(cocheJ, j.v, dt));
    // Con un pie en la tabla va de lado, más arriba y ladeado sobre ella.
    if (pasos.unPie) { const q = cocheJ.empujador.obj; q.translateX(-pasos.unPie * 0.28); q.translateY(0.12); q.rotateZ(pasos.unPie * 0.22); }
    cocheJ.empujador.acciones.correr.timeScale = 1.1 + Math.min(1, j.v / CORRE) * 1.1 + (pasos.burst > 0 ? 0.6 : 0);
  }

  // El fantasma, donde iba el récord en este segundo.
  if (fantasma.coche && fantasma.datos) {
    const tr = fantasma.datos, i = Math.min(Math.floor(reloj * 10), tr.length - 1), f = Math.min(1, reloj * 10 - i);
    const a = tr[i], b = tr[Math.min(i + 1, tr.length - 1)];
    const s = mezcla(a[0], b[0], f), x = mezcla(a[1], b[1], f), h = mezcla(a[2], b[2], f);
    colocaCoche(fantasma.coche, s, x, h, 0, 0, (b[0] - a[0]) * 10, dt);
    enCoche(fantasma.coche.conductor, fantasma.coche.g, 0.32, 'montado');
    enCoche(fantasma.coche.empujador, fantasma.coche.g, -0.5, 'montado');
    fantasma.coche.conductor.mixer.update(dt); fantasma.coche.empujador.mixer.update(dt);
  }
  // Los rivales.
  for (const rv of rivales) {
    colocaCoche(rv.cruce, rv.s, rv.x, 0, 0, 0, rv.v, dt);
    enCoche(rv.cruce.conductor, rv.cruce.g, 0.32, 'montado');
    if (rv.empuja) { enCoche(rv.cruce.empujador, rv.cruce.g, -1.3, 'correr', pasoCarrera(rv.cruce, rv.v, dt)); rv.cruce.empujador.acciones.correr.timeScale = 1.1 + Math.min(1, rv.v / CORRE) * 1.1; }
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
  // Alta y atrás, mirando más adelante que el coche: se ve venir la curva y
  // el de atrás no tapa la calle.
  // Cada buen paso la acerca un pelo: se siente el empujón.
  const empujon = pasos.burst / 0.35;
  const lejos = 4.8 + j.v * 0.035 - empujon * 0.4;
  const objetivo = punto(camS - lejos, j.x * 0.75, 2.6 + j.v * 0.01 - empujon * 0.08);
  // La cámara no se mete bajo la calle en las bajadas fuertes.
  const suelo = muestra(camS - lejos).y + 1.4;
  if (objetivo.y < suelo) objetivo.y = suelo;
  const mira = punto(camS + 8 + j.v * 0.12, j.x * 0.5, 0.5 + j.h * 0.5);
  // Si la cámara quedó lejos (al empezar o tras un salto de tiempo), se
  // pone en su sitio de golpe: deslizarse cien metros la mete en las casas.
  if (camara.position.distanceToSquared(objetivo) > 225) camara.position.copy(objetivo);
  else camara.position.lerp(objetivo, Math.min(1, dt * 6));
  const tiembla = Math.max(sacudida, j.v > 26 ? (j.v - 26) / 40 : 0);
  if (tiembla > 0 && !quieto.matches) camara.position.add(_v.set((Math.random() - 0.5) * tiembla * 0.12, (Math.random() - 0.5) * tiembla * 0.12, 0));
  camara.lookAt(mira);
  camara.rotateZ(-j.giro * 0.035);   // se ladea un poco con el volante
  const fov = 62 + 16 * Math.min(1, j.v / 36) + (j.turbo > 0 ? 6 : 0) + empujon * 2;
  if (Math.abs(camara.fov - fov) > 0.05) { camara.fov = mezcla(camara.fov, fov, Math.min(1, dt * 3)); camara.updateProjectionMatrix(); }
  panorama.position.set(camara.position.x, camara.position.y + 30, camara.position.z);
  sigueSol(cocheJ.g.position);
}

// En los menús, la cámara vuela despacio sobre la pista, de la salida a la meta.
function dibujaVuelo(t) {
  camara.clearViewOffset();
  const largo = Math.max(60, META - SALIDA);
  const s = SALIDA + (t * 7) % largo;
  punto(s, Math.sin(t * 0.2) * 1.5, 5.5, camara.position);
  camara.lookAt(punto(s + 20, 0, 1.2));
  if (Math.abs(camara.fov - 55) > 0.1) { camara.fov = 55; camara.updateProjectionMatrix(); }
  panorama.position.set(camara.position.x, camara.position.y + 30, camara.position.z);
  sigueSol(punto(s, 0, 0));
  if (publico) publico.coloca(t, s);
}

// Al elegir pareja, la cámara gira despacio alrededor de ella, como en la
// pantalla de selección de un kart.
function dibujaPortada(t) {
  const centro = cocheJ ? cocheJ.g.position.clone().add(_v.set(0, 0.75, 0)) : punto(SALIDA - 4, 0, 1);
  const ang = t * 0.35 + 0.6;
  camara.position.set(centro.x + Math.sin(ang) * 3.6, centro.y + 0.9, centro.z + Math.cos(ang) * 3.6);
  camara.lookAt(centro);
  // Que la pareja quede fuera del panel: a la derecha en pantalla ancha,
  // arriba en el teléfono.
  const W = innerWidth, H = innerHeight;
  if (W >= H) camara.setViewOffset(W, H, -W * 0.2, 0, W, H);
  else camara.setViewOffset(W, H, 0, H * 0.3, W, H);
  camara.fov = 50; camara.updateProjectionMatrix();
  panorama.position.set(camara.position.x, camara.position.y + 30, camara.position.z);
  sigueSol(centro);
  if (publico) publico.coloca(t, j.s);
}

// ─── el HUD ────────────────────────────────────────────────────────
const hud = {
  puesto: $('#h-puesto'), tiempo: $('#h-tiempo'), vel: $('#h-vel'),
  empujador: $('#h-empujador'), ruta: $('#h-ruta'), turbo: $('#h-turbo'), velo: $('#velo'),
  pasos: $('#h-pasos'), coladas: $('#h-coladas'), pieIzq: $('#h-pie-izq'), pieDer: $('#h-pie-der'), racha: $('#h-racha'),
  caja: $('.coches-puesto'), puntos: [],
};
// Un punto por coche en la línea de la carrera, con su color y su número.
function armaRuta() {
  hud.ruta.textContent = '';
  $('#hud').classList.toggle('sin-rivales', modo === 'tiempo');
  hud.puntos = [{ eq: eqJ, tu: true }, ...(modo === 'tiempo' ? [] : rivales.map((rv) => ({ eq: rv.cruce.eq, rv })))].map((q) => {
    const el = document.createElement('i');
    el.className = 'coches-punto' + (q.tu ? ' es-tu' : '');
    el.style.setProperty('--c', q.eq.placa);
    el.textContent = q.eq.num;
    el.title = q.eq.nombre;
    hud.ruta.append(el);
    return { ...q, el, ultimo: '' };
  });
  pintaRutaTitulo();
}
function pintaRutaTitulo() {
  const partes = [modo === 'tiempo' ? `Contrarreloj · ${pistaActual.nombre}` : pistaActual.nombre];
  if (LARGO_VUELTA) partes.push(`vuelta ${vueltaActual} de ${pistaActual.vueltas}`);
  if (modo === 'copa' && copa) partes.push(`${copa.k + 1} de ${COPAS[copa.id].pistas.length}`);
  $('#h-pista').textContent = partes.join(' · ');
}
const formato = (t) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};
const ESTADOS_EMPUJADOR = { a_bordo: 'A bordo', empujando: 'Empujando', piso: 'En el piso' };
let ultimoHud = {};
function pintaHud() {
  const puesto = estado === 'llegada' ? j.puesto : 1 + rivales.filter((rv) => rv.s > j.s).length;
  const datos = {
    puesto: String(puesto),
    tiempo: formato(estado === 'llegada' ? j.llegada : reloj),
    vel: String(Math.round(j.v * 3.6)),
    empujador: ESTADOS_EMPUJADOR[e.estado],
  };
  if (datos.puesto !== ultimoHud.puesto) {
    // Al ganar un puesto, el número salta.
    if (+datos.puesto < +ultimoHud.puesto) { hud.caja.classList.remove('is-sube'); void hud.caja.offsetWidth; hud.caja.classList.add('is-sube'); }
    hud.puesto.textContent = datos.puesto;
  }
  if (datos.tiempo !== ultimoHud.tiempo) hud.tiempo.textContent = datos.tiempo;
  if (datos.vel !== ultimoHud.vel) hud.vel.textContent = datos.vel;
  if (datos.empujador !== ultimoHud.empujador) {
    hud.empujador.textContent = datos.empujador;
    hud.empujador.dataset.estado = e.estado;
  }
  for (const q of hud.puntos) {
    const pos = `${(limita(((q.rv ? q.rv.s : j.s) - SALIDA) / (META - SALIDA), 0, 1) * 100).toFixed(1)}%`;
    if (pos !== q.ultimo) { q.el.style.left = pos; q.ultimo = pos; }
  }
  const nc = j.coladas || 0;
  const coladas = !(nc > 0 || j.turbo > 0) ? '' : e.estado === 'empujando' && nc > 0 ? `◀+▶ ×${nc}` : nc > 0 ? `Colada ×${nc}` : 'Colada';
  if (coladas !== ultimoHud.coladas) {
    hud.turbo.hidden = !coladas; hud.coladas.textContent = coladas;
    hud.turbo.classList.toggle('is-lista', e.estado === 'empujando' && nc > 0);
    ultimoHud.coladas = coladas;
  }
  // Los pies: se enciende el que toca (los dos, antes del primer paso), la
  // racha en medio, y la píldora se ilumina con cada buen paso.
  const pisa = e.estado === 'empujando' && estado === 'carrera';
  if (pisa !== ultimoHud.pisa) { hud.pasos.hidden = !pisa; ultimoHud.pisa = pisa; }
  if (pisa) {
    const toca = -pasos.ultimo;
    if (toca !== ultimoHud.toca) { hud.pieIzq.classList.toggle('is-toca', toca <= 0); hud.pieDer.classList.toggle('is-toca', toca >= 0); ultimoHud.toca = toca; }
    const racha = pasos.unPie ? 'Un pie' : pasos.combo > 1 ? `×${pasos.combo}` : '¡Pisa!';
    if (racha !== ultimoHud.racha) { hud.racha.textContent = racha; ultimoHud.racha = racha; }
    const bien = pasos.burst > 0;
    if (bien !== ultimoHud.bien) { hud.pasos.classList.toggle('is-bien', bien); ultimoHud.bien = bien; }
    const unPie = !!pasos.unPie;
    if (unPie !== ultimoHud.unPie) { hud.pasos.classList.toggle('is-un-pie', unPie); ultimoHud.unPie = unPie; }
  }
  // Las rayas de velocidad, cuando de verdad va rápido.
  const velo = quieto.matches ? 0 : limita((j.v - 22) / 16, 0, 0.75) + (j.turbo > 0 ? 0.2 : 0);
  if (velo !== ultimoHud.velo) hud.velo.style.opacity = velo.toFixed(2);
  datos.velo = velo;
  ultimoHud = datos;
}

// ─── el progreso ───────────────────────────────────────────────────
// Lo ganado se guarda en el navegador: la mejor medalla y el récord de cada
// pista, las pistas que ya se corrieron, las parejas abiertas y el mejor
// puesto en la Copa.
// Los ajustes: sonido, música y el modo píxel. Se guardan aparte del progreso.
const AJUSTES = 'coches3d-ajustes';
const ajustes = { sonido: true, musica: true, pixel: false };
try { Object.assign(ajustes, JSON.parse(localStorage.getItem(AJUSTES) || '{}')); } catch (err) { /* sin almacenamiento */ }
const guardaAjustes = () => { try { localStorage.setItem(AJUSTES, JSON.stringify(ajustes)); } catch (err) { /* sin almacenamiento */ } };
function aplicaAjustes() {
  son.mudo = !ajustes.sonido;
  if (son.salida) son.salida.gain.value = son.mudo ? 0 : 0.8;
  if (musica.gain) musica.gain.gain.value = ajustes.musica ? 0.32 : 0;
  const b = $('#b-sonido');
  b.setAttribute('aria-pressed', String(son.mudo));
  b.setAttribute('aria-label', son.mudo ? 'Activar el sonido' : 'Silenciar');
  b.style.opacity = son.mudo ? 0.5 : '';
  document.body.classList.toggle('pixel', ajustes.pixel);
  mide();
  for (const el of document.querySelectorAll('#opciones [data-ajuste]')) el.setAttribute('aria-pressed', String(!!ajustes[el.dataset.ajuste]));
}
const GUARDA = 'coches3d-progreso';
const progresoBase = () => ({ medallas: {}, records: {}, parejas: ['cucuruchos', 'guarichas'], pistas: ['tobogan', 'panecillo'], copa: 0, copas: {}, album: [], pinturas: ['madera'], pintura: 'madera' });
let prog = progresoBase();
try { const p = JSON.parse(localStorage.getItem(GUARDA) || 'null'); if (p) prog = Object.assign(progresoBase(), p); } catch (err) { /* sin almacenamiento */ }
// Guardados de antes de que hubiera varias copas.
if (prog.copa && !prog.copas.fiestas) prog.copas.fiestas = prog.copa;
const guarda = () => { try { localStorage.setItem(GUARDA, JSON.stringify(prog)); } catch (err) { /* sin almacenamiento */ } };

// Qué se gana y cómo. Las pistas de la Copa se abren para la carrera suelta
// en cuanto se corren; la de premio, ganando la Copa.
const DESBLOQUEOS = [
  { tipo: 'pareja', id: 'cantuna', cuando: (p) => p.medallas.panecillo <= 3, como: 'con una medalla en La bajada del Panecillo' },
  { tipo: 'pareja', id: 'gallo', cuando: (p) => p.medallas.guapulo <= 3, como: 'con una medalla en La cuesta de Guápulo' },
  { tipo: 'pareja', id: 'mamanegra', cuando: (p) => p.medallas.sanjuan <= 3, como: 'con una medalla en La bajada de San Juan' },
  { tipo: 'pista', id: 'vuelta', cuando: (p) => p.copa >= 1, como: 'al terminar la Copa de las Fiestas' },
  { tipo: 'pista', id: 'subida', cuando: (p) => p.copa === 1, como: 'ganando la Copa de las Fiestas' },
  { tipo: 'pintura', id: 'fiesta', cuando: (p) => p.album.length >= 4, como: 'con cuatro estampitas' },
  { tipo: 'pintura', id: 'anil', cuando: (p) => p.album.length >= 9, como: 'con nueve estampitas' },
  { tipo: 'pintura', id: 'morada', cuando: (p) => p.album.length >= 14, como: 'con catorce estampitas' },
  { tipo: 'pintura', id: 'oro', cuando: (p) => p.copas.noche === 1, como: 'ganando la Copa de la Noche' },
];
const COPAS = {
  fiestas: { nombre: 'Copa de las Fiestas', pistas: ['tobogan', 'panecillo', 'guapulo', 'sanjuan'], campeones: '¡Campeones de las Fiestas!', ruta: 'la bajada grande, el Panecillo, Guápulo y San Juan' },
  noche: { nombre: 'Copa de la Noche', pistas: ['noche-tobogan', 'noche-vuelta', 'noche-guapulo', 'noche-sanjuan'], campeones: '¡Campeones de la Noche!', ruta: 'la bajada grande, la vuelta al cerro, Guápulo y San Juan, de noche' },
};
const copaAbierta = (id) => id === 'fiestas' || prog.copa === 1;
const PUNTOS = [10, 7, 5, 3, 1];
const listaDe = (tipo) => (tipo === 'pareja' ? prog.parejas : tipo === 'pista' ? prog.pistas : prog.pinturas);
const abierta = (tipo, id) => listaDe(tipo).includes(id);
const comoSeGana = (tipo, id) => {
  const d = DESBLOQUEOS.find((q) => q.tipo === tipo && q.id === id);
  return d ? `Se gana ${d.como}.` : tipo === 'pista' ? 'Se abre corriéndola en su Copa.' : 'Todavía no se gana.';
};

// ─── los dibujos de los premios ────────────────────────────────────
const METAL = { 1: ['#E2B13C', '#B88A2A'], 2: ['#C9CDD2', '#9AA0A6'], 3: ['#C98A4E', '#9C6630'] };
const SVG = {
  medalla: (n, tam = 150) => {
    const [a, b] = METAL[n];
    return `<svg width="${tam}" height="${tam}" viewBox="0 0 150 150" aria-hidden="true">
      <path d="M50 8h22l14 46H64zM100 8H78L64 54h22z" fill="#D6382B" stroke="${TINTA}" stroke-width="3"/>
      <circle cx="75" cy="95" r="42" fill="${a}" stroke="${TINTA}" stroke-width="4"/>
      <circle cx="75" cy="95" r="30" fill="none" stroke="${b}" stroke-width="5"/>
      <text x="75" y="109" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="40" fill="${TINTA}">${n}</text></svg>`;
  },
  trofeo: (n = 1, tam = 150) => {
    const [a, b] = METAL[n] || METAL[1];
    return `<svg width="${tam}" height="${tam}" viewBox="0 0 150 150" aria-hidden="true">
      <path d="M44 22h62v26c0 22-14 38-31 38S44 70 44 48z" fill="${a}" stroke="${TINTA}" stroke-width="4"/>
      <path d="M44 30H28c0 16 8 27 19 30M106 30h16c0 16-8 27-19 30" fill="none" stroke="${TINTA}" stroke-width="4"/>
      <path d="M66 86h18v16H66zM52 102h46v14H52z" fill="${b}" stroke="${TINTA}" stroke-width="4"/>
      <rect x="40" y="116" width="70" height="14" rx="3" fill="#6B4423" stroke="${TINTA}" stroke-width="4"/></svg>`;
  },
  coche: (tam = 150) => `<svg width="${tam}" height="${tam}" viewBox="0 0 150 150" aria-hidden="true">
      <rect x="18" y="78" width="114" height="18" rx="3" fill="#C8955A" stroke="${TINTA}" stroke-width="3"/>
      <path d="M26 83h98M26 90h98" stroke="#9E6D3A" stroke-width="1.5"/>
      <circle cx="34" cy="104" r="10" fill="#8C9096" stroke="${TINTA}" stroke-width="3"/>
      <circle cx="116" cy="104" r="10" fill="#8C9096" stroke="${TINTA}" stroke-width="3"/></svg>`,
  candado: (tam = 150) => `<svg width="${tam}" height="${tam}" viewBox="0 0 150 150" aria-hidden="true">
      <path d="M50 70V48a25 25 0 0 1 50 0" fill="none" stroke="${TINTA}" stroke-width="9" stroke-linecap="round" transform="rotate(-24 100 70)"/>
      <rect x="38" y="66" width="74" height="60" rx="10" fill="#F5C518" stroke="${TINTA}" stroke-width="4"/>
      <circle cx="75" cy="92" r="8" fill="${TINTA}"/><rect x="72" y="96" width="6" height="16" fill="${TINTA}"/></svg>`,
  vacia: (tam) => `<svg width="${tam}" height="${tam}" viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="95" r="42" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="10 9" opacity=".35"/></svg>`,
};

// ─── el premio: la llegada, lo que se abre y el final ──────────────
// Se encolan y se muestran uno tras otro; tocar pasa al siguiente.
let colaPremios = [], trasPremios = null;
function muestraPremio(p) {
  estado = 'premio';             // tapa la pantalla entera: no se dibuja nada detrás
  tocaMusica(null);
  $('#p-disco').innerHTML = p.disco;
  $('#p-kicker').textContent = p.kicker || '';
  $('#p-nombre').textContent = p.nombre;
  $('#p-desc').textContent = p.desc || '';
  const lista = $('#p-lista');
  lista.textContent = '';
  for (const f of p.lista || []) {
    const li = document.createElement('li');
    if (f.tu) li.className = 'es-tu';
    const n = document.createElement('span'); n.textContent = f.texto;
    const t = document.createElement('span'); t.textContent = f.valor;
    li.append(n, t); lista.append(li);
  }
  $('#p-creditos').hidden = !p.creditos;
  $('#p-pie').textContent = p.pie || 'Toca para seguir';
  const pieza = $('#p-pieza');
  pieza.classList.remove('premio__pieza--entra'); void pieza.offsetWidth; pieza.classList.add('premio__pieza--entra');
  for (const id of ['portada', 'elegir', 'medallas', 'copa', 'pausa']) $('#' + id).hidden = true;
  $('#hud').hidden = true; $('#mandos').hidden = true;
  $('#premio').hidden = false;
  $('#premio').focus({ preventScroll: true });
  if (p.fanfarria) jingle(FANFARRIA, 0.11); else jingle([660, 880], 0.1, 'triangle');
}
function siguientePremio() {
  const p = colaPremios.shift();
  if (p) { muestraPremio(p); return; }
  $('#premio').hidden = true;
  const f = trasPremios; trasPremios = null;
  if (f) f();
}

// ─── después de cada carrera ───────────────────────────────────────
const PUESTOS = ['Primer puesto', 'Segundo puesto', 'Tercer puesto', 'Cuarto puesto', 'Quinto puesto'];
const FRASES = [
  'Ni el Chulla los vio pasar.',
  'Segundos, por una tabla.',
  'Al podio, que con coche de madera ya es hazaña.',
  'Cuartos. La próxima, más empuje en la subida.',
  'Últimos, pero enteros los dos, que en coche de madera ya es bastante.',
];
let modo = 'suelta', copa = null, pistaSuelta = 'panecillo';
function trasCarrera() {
  const def = pistaActual;
  if (modo === 'tiempo') { trasContrarreloj(def); return; }
  const p = j.puesto;
  // El orden de llegada: a los que no llegaron se les calcula lo que les falta.
  // Tu puesto manda: se te pone ahí aunque un rival haya cruzado en la misma décima.
  const filas = rivales.map((rv) => ({ id: rv.cruce.eq.id, nombre: rv.cruce.eq.nombre, t: rv.llegada || reloj + Math.max(0, META - rv.s) / Math.max(rv.v, 4) }));
  filas.sort((a, b) => a.t - b.t);
  filas.splice(p - 1, 0, { id: eqJ.id, nombre: `${eqJ.nombre} (tú)`, t: j.llegada, tu: true });
  // Lo que se guarda.
  const record = prog.records[def.id];
  const recordNuevo = !record || j.llegada < record;
  if (recordNuevo) { prog.records[def.id] = j.llegada; guardaFantasma(def.id); }
  if (p <= 3 && !(prog.medallas[def.id] <= p)) prog.medallas[def.id] = p;
  if (!prog.pistas.includes(def.id)) prog.pistas.push(def.id);
  const premios = [{
    disco: p <= 3 ? SVG.medalla(p) : SVG.coche(),
    fanfarria: p <= 3,
    kicker: `${def.nombre} · ${recordNuevo ? '¡récord nuevo!' : `récord ${formato(record)}`}`,
    nombre: PUESTOS[p - 1],
    desc: `${def.premio ? 'Subieron' : LARGO_VUELTA ? 'Dieron las vueltas' : 'Bajaron'} en ${formato(j.llegada)}. ${FRASES[p - 1]}`,
    lista: filas.map((f, k) => ({ texto: `${k + 1}. ${f.nombre}`, valor: formato(f.t), tu: f.tu })),
  }];
  let despues = abreElegir;
  if (modo === 'copa') {
    filas.forEach((f, k) => { copa.ultimos[f.id] = PUNTOS[k]; copa.puntos[f.id] += PUNTOS[k]; });
    const laCopa = COPAS[copa.id];
    if (copa.k < laCopa.pistas.length - 1) despues = muestraTablaCopa;
    else {
      const tabla = tablaCopa();
      const puesto = tabla.findIndex((f) => f.id === eqJ.id) + 1;
      if (copa.id === 'fiestas' && (!prog.copa || puesto < prog.copa)) prog.copa = puesto;
      if (!prog.copas[copa.id] || puesto < prog.copas[copa.id]) prog.copas[copa.id] = puesto;
      premios.push({
        disco: puesto <= 3 ? SVG.trofeo(puesto) : SVG.coche(),
        kicker: `${laCopa.nombre} · el final`,
        nombre: puesto === 1 ? laCopa.campeones : puesto <= 3 ? `${PUESTOS[puesto - 1]} en la Copa` : 'Fuera del podio de la Copa',
        desc: puesto === 1
          ? `Corrieron ${laCopa.ruta}, y ganaron con ${copa.puntos[eqJ.id]} puntos. Quito entero los vio pasar.`
          : `Hicieron ${copa.puntos[eqJ.id]} puntos. La Copa se vuelve a correr cuando quieran.`,
        lista: tabla.map((f, k) => ({ texto: `${k + 1}. ${f.nombre}`, valor: `${f.puntos} pts`, tu: f.id === eqJ.id })),
        creditos: true,
        pie: 'Toca para seguir',
      });
      const nombreCopa = laCopa.nombre;
      despues = () => muestraPodio(tabla, nombreCopa);
      copa = null; modo = 'suelta';
    }
  }
  // Las estampitas nuevas.
  cromosNuevos.forEach((id, k) => {
    const cr = CROMOS.find((q) => q.id === id);
    premios.push({
      disco: `<img src="${cromoCanvas(cr).toDataURL()}" width="110" height="150" alt="" style="border-radius:8px">`,
      kicker: `Estampita ${prog.album.length - cromosNuevos.length + k + 1} de ${CROMOS.length}`,
      nombre: cr.nombre,
      desc: cr.desc,
    });
  });
  // Lo que se abre.
  for (const d of DESBLOQUEOS) {
    if (abierta(d.tipo, d.id) || !d.cuando(prog)) continue;
    listaDe(d.tipo).push(d.id);
    const cosa = (d.tipo === 'pareja' ? EQUIPOS : d.tipo === 'pista' ? PISTAS : PINTURAS).find((q) => q.id === d.id);
    premios.push({
      disco: SVG.candado(),
      kicker: d.tipo === 'pareja' ? 'Pareja nueva' : d.tipo === 'pista' ? 'Pista nueva' : 'Pintura nueva',
      nombre: cosa.nombre,
      desc: cosa.lema,
    });
  }
  guarda();
  colaPremios = premios;
  trasPremios = despues;
  siguientePremio();
}

// ─── el podio ──────────────────────────────────────────────────────
// Al acabar la Copa, los tres primeros posan en la meta con la gente
// saltando, y la cámara les da la vuelta. Los otros dos miran de lejos.
let podioS = 0;
function muestraPodio(tabla, nombreCopa) {
  $('#podio-kicker').textContent = nombreCopa || 'Copa de las Fiestas';
  estado = 'podio';
  podioS = META - 7;
  const sitio = [[0, 0], [-1.9, -2.6], [1.9, -3.4], [-1.2, -14], [1.4, -16]];
  tabla.forEach((f, k) => {
    const [x, ds] = sitio[k];
    if (f.id === eqJ.id) { Object.assign(j, { s: podioS + ds, x, v: 0, volcado: 0, aire: false, h: 0, giro: 0 }); Object.assign(e, { estado: 'a_bordo' }); Object.assign(c, { suelto: false }); }
    else { const rv = rivales.find((r) => r.cruce.eq.id === f.id); Object.assign(rv, { s: podioS + ds, x, v: 0, empuja: false }); }
  });
  for (const cc of [cocheJ, ...rivales.map((rv) => rv.cruce)]) { cc.conductor.pon('montado'); cc.empujador.pon('montado'); }
  const ol = $('#podio-nombres');
  ol.textContent = '';
  tabla.slice(0, 3).forEach((f, k) => {
    const li = document.createElement('li');
    if (f.id === eqJ.id) li.className = 'es-tu';
    li.innerHTML = `<b>${k + 1}</b><span></span><em>${f.puntos} pts</em>`;
    li.querySelector('span').textContent = f.nombre;
    ol.append(li);
  });
  $('#podio-titulo').textContent = tabla[0].id === eqJ.id ? '¡Campeones!' : 'El podio';
  pantalla('podio');
  tocaMusica('menu');
  $('#podio').focus({ preventScroll: true });
  if (tabla[0].id === eqJ.id) jingle(FANFARRIA, 0.13);
}
function dibujaPodio(t) {
  camara.clearViewOffset();
  const centro = punto(podioS - 1, 0, 1.0);
  // De frente, para verles la cara; se mece de un lado al otro.
  const ang = Math.sin(t * 0.25) * 0.9;
  const m = muestra(podioS);
  const base = punto(podioS - 1, 0, 0);
  camara.position.set(base.x + Math.sin(m.th + ang) * 7, base.y + 2.4, base.z + Math.cos(m.th + ang) * 7);
  camara.lookAt(centro);
  if (Math.abs(camara.fov - 50) > 0.1) { camara.fov = 50; camara.updateProjectionMatrix(); }
  panorama.position.set(camara.position.x, camara.position.y + 30, camara.position.z);
  sigueSol(centro);
  if (publico) publico.coloca(t, podioS + 2);
}

// La contrarreloj: solo contra el reloj y contra el fantasma del récord.
function guardaFantasma(id) {
  try { localStorage.setItem(fantasmaClave(id), JSON.stringify(fantasma.trazo)); } catch (err) { /* sin almacenamiento */ }
}
function trasContrarreloj(def) {
  const record = prog.records[def.id];
  const recordNuevo = !record || j.llegada < record;
  const antes = record;
  if (recordNuevo) { prog.records[def.id] = j.llegada; guardaFantasma(def.id); }
  if (!prog.pistas.includes(def.id)) prog.pistas.push(def.id);
  const dif = antes ? j.llegada - antes : 0;
  const premios = [{
    disco: recordNuevo ? SVG.trofeo(1) : SVG.coche(),
    fanfarria: recordNuevo,
    kicker: `Contrarreloj · ${def.nombre}`,
    nombre: recordNuevo ? (antes ? '¡Récord nuevo!' : '¡Primer tiempo!') : 'Sin récord',
    desc: recordNuevo
      ? (antes ? `${formato(j.llegada)}: ${formato(-dif)} menos que el fantasma. El fantasma ya es este.` : `${formato(j.llegada)}. La próxima vez, el fantasma va a ir delante.`)
      : `${formato(j.llegada)}: ${formato(dif)} más que el récord (${formato(antes)}).`,
    lista: [{ texto: 'Este tiempo', valor: formato(j.llegada), tu: true }, { texto: 'El récord', valor: formato(prog.records[def.id]) }],
  }];
  cromosNuevos.forEach((id, k) => {
    const cr = CROMOS.find((q) => q.id === id);
    premios.push({ disco: `<img src="${cromoCanvas(cr).toDataURL()}" width="110" height="150" alt="" style="border-radius:8px">`, kicker: `Estampita ${prog.album.length - cromosNuevos.length + k + 1} de ${CROMOS.length}`, nombre: cr.nombre, desc: cr.desc });
  });
  for (const d of DESBLOQUEOS) {
    if (abierta(d.tipo, d.id) || !d.cuando(prog)) continue;
    listaDe(d.tipo).push(d.id);
    const cosa = (d.tipo === 'pareja' ? EQUIPOS : d.tipo === 'pista' ? PISTAS : PINTURAS).find((q) => q.id === d.id);
    premios.push({ disco: SVG.candado(), kicker: d.tipo === 'pareja' ? 'Pareja nueva' : d.tipo === 'pista' ? 'Pista nueva' : 'Pintura nueva', nombre: cosa.nombre, desc: cosa.lema });
  }
  guarda();
  colaPremios = premios;
  trasPremios = abreElegir;
  siguientePremio();
}

// ─── la Copa ───────────────────────────────────────────────────────
function tablaCopa() {
  return EQUIPOS.map((q) => ({ id: q.id, nombre: q.id === eqJ.id ? `${q.nombre} (tú)` : q.nombre, puntos: copa.puntos[q.id], ultimos: copa.ultimos[q.id] || 0 }))
    .sort((a, b) => b.puntos - a.puntos);
}
function muestraTablaCopa() {
  estado = 'menu';
  $('#copa-kicker').textContent = `${COPAS[copa.id].nombre} · después de la carrera ${copa.k + 1} de ${COPAS[copa.id].pistas.length}`;
  const ol = $('#copa-tabla');
  ol.textContent = '';
  tablaCopa().forEach((f, k) => {
    const li = document.createElement('li');
    if (f.id === eqJ.id) li.className = 'es-tu';
    const n = document.createElement('span'); n.textContent = `${k + 1}. ${f.nombre}`;
    const t = document.createElement('span'); t.textContent = `${f.puntos} pts (+${f.ultimos})`;
    li.append(n, t); ol.append(li);
  });
  const sig = PISTAS.find((q) => q.id === COPAS[copa.id].pistas[copa.k + 1]);
  $('#b-copa-sigue span').textContent = `Siguiente: ${sig.nombre}`;
  pantalla('copa');
  $('#b-copa-sigue').focus({ preventScroll: true });
}
function sigueCopa() {
  copa.k++;
  cargaPista(COPAS[copa.id].pistas[copa.k]);
  empieza();
}

// ─── las pantallas ─────────────────────────────────────────────────
const CAPAS = ['titulo', 'portada', 'ayuda', 'elegir', 'medallas', 'album', 'opciones', 'creditos', 'copa', 'pausa', 'podio'];
function pantalla(id, sinCortina) {
  for (const p of CAPAS) $('#' + p).hidden = p !== id;
  $('#premio').hidden = true;
  $('#hud').hidden = true; $('#mandos').hidden = true;
  if (!sinCortina) cortina();
}
// El barrido entre pantallas, como el de la consola.
function cortina() {
  const el = $('#cortina');
  el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on');
}
// La pantalla de título: pulsa start.
let demoTimer = null, demoAntes = null;
function aTitulo() {
  estado = 'titulo';
  modo = 'suelta'; copa = null;
  tocaMusica(null);
  pantalla('titulo');
  $('#titulo').focus({ preventScroll: true });
  // Si nadie toca nada, al rato la consola se pone a jugar sola.
  clearTimeout(demoTimer);
  if (cocheJ) demoTimer = setTimeout(empiezaDemo, 25000);
}
function empiezaDemo() {
  if (estado !== 'titulo') return;
  const r = azar(Math.floor(performance.now()));
  const pista = elige(r, PISTAS);
  demoAntes = eqJ;
  modo = 'demo';
  cargaPista(pista.id);
  eligePareja(elige(r, EQUIPOS).id);
  empieza();
  $('#mandos').hidden = true;
  $('#demo').hidden = false;
}
function terminaDemo() {
  if (modo !== 'demo') return;
  $('#demo').hidden = true;
  for (const k in teclas) teclas[k] = false;
  if (son.ctx) son.ctx.resume();
  modo = 'suelta';
  // La pareja del jugador vuelve a ser la suya.
  if (demoAntes) { cargaPista(pistaSuelta); eligePareja(demoAntes.id); }
  aTitulo();
}
// El piloto de la demo: mira la curva que viene, esquiva lo que hay en la
// calle y empuja cuando va lento.
let demoPaso = 0;
function pilotoDemo() {
  let peor = 0;
  for (let d = 0; d < 35; d += 2) peor = Math.max(peor, Math.abs(P.k[limita(Math.floor(j.s + d), 0, N - 1)]));
  let objetivo = -Math.sign(P.k[limita(Math.floor(j.s + 10), 0, N - 1)]) * 0.8;
  for (const o of obstaculos) {
    if (o.s < j.s + 2) continue;
    if (o.s > j.s + 25) break;
    if (o.tipo === 'colada' || o.tipo === 'cromo') { objetivo = o.x; continue; }
    if (o.tipo === 'farol') continue;
    if (Math.abs(o.x - objetivo) < 1.4) objetivo = o.x > 0 ? o.x - 1.8 : o.x + 1.8;
  }
  const hw = muestra(j.s).hw; objetivo = limita(objetivo, -(hw - 0.9), hw - 0.9);
  teclas.izq = j.x > objetivo + 0.15 && !j.aire; teclas.der = j.x < objetivo - 0.15 && !j.aire;
  teclas.freno = j.v > GIRO / (CENTRIFUGA * Math.max(peor, 1e-4)) * 0.95;
  if (e.estado === 'empujando' && !teclas.freno && reloj >= demoPaso) { demoPaso = reloj + 0.3; pasos.pulsos.push({ t: reloj, peso: 1 }); }
}
function desdeTitulo() {
  if (estado !== 'titulo' || $('#b-copa').disabled) return;
  clearTimeout(demoTimer);
  arrancaSonido();
  jingle([523, 659, 784, 1047], 0.09);
  aMenu();
}
// Un arpegio corto, para los menús y los premios.
function jingle(notas, paso, tipo) {
  notas.forEach((f, k) => setTimeout(() => tono(f, paso * 2.2, tipo || 'square', 0.09), k * paso * 1000));
}
const FANFARRIA = [523, 523, 523, 659, 784, 659, 784, 1047];
function aMenu() {
  estado = 'menu';
  copa = null; modo = 'suelta';
  if (son.ctx) son.ctx.resume();
  tocaMusica('menu');
  pintaPortada();
  pantalla('portada');
  $('#b-copa').focus({ preventScroll: true });
}
// El mapa de la pista, en la pantalla de elegir: el trazado visto desde
// arriba, con la salida en verde y la meta a cuadros.
function dibujaMapa() {
  const cv = $('#mapa'); if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const FIN = LARGO_VUELTA ? SALIDA + LARGO_VUELTA : META;
  for (let i = SALIDA; i <= FIN; i++) { x0 = Math.min(x0, P.x[i]); x1 = Math.max(x1, P.x[i]); z0 = Math.min(z0, P.z[i]); z1 = Math.max(z1, P.z[i]); }
  const esc = Math.min((W - 24) / Math.max(1, x1 - x0), (H - 24) / Math.max(1, z1 - z0));
  const px = (i) => 12 + (P.x[i] - x0) * esc + ((W - 24) - (x1 - x0) * esc) / 2;
  const py = (i) => 12 + (P.z[i] - z0) * esc + ((H - 24) - (z1 - z0) * esc) / 2;
  const traza = () => { g.beginPath(); for (let i = SALIDA; i <= FIN; i += 2) i === SALIDA ? g.moveTo(px(i), py(i)) : g.lineTo(px(i), py(i)); if (LARGO_VUELTA) g.closePath(); };
  g.lineCap = 'round'; g.lineJoin = 'round';
  traza(); g.strokeStyle = TINTA; g.lineWidth = 9; g.stroke();
  traza(); g.strokeStyle = '#F3F1EC'; g.lineWidth = 5; g.stroke();
  traza(); g.strokeStyle = '#E2B13C'; g.lineWidth = 1; g.setLineDash([3, 4]); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#5DBB4F'; g.strokeStyle = TINTA; g.lineWidth = 2;
  g.beginPath(); g.arc(px(SALIDA), py(SALIDA), 5, 0, Math.PI * 2); g.fill(); g.stroke();
  const mx = px(LARGO_VUELTA ? SALIDA : META - 1), my = py(LARGO_VUELTA ? SALIDA : META - 1);
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { g.fillStyle = (a + b) % 2 ? '#fff' : TINTA; g.fillRect(mx - 5 + a * 5, my - 5 + b * 5, 5, 5); }
  g.strokeRect(mx - 5, my - 5, 10, 10);
}
function pintaPortada() {
  const medallas = PISTAS.filter((q) => prog.medallas[q.id] <= 3).length;
  const copaTxt = prog.copa ? ` · en la Copa: ${prog.copa}.º` : '';
  const bn = $('#b-copa-noche');
  bn.classList.toggle('is-cerrada', !copaAbierta('noche'));
  bn.setAttribute('aria-disabled', String(!copaAbierta('noche')));
  bn.title = copaAbierta('noche') ? '' : 'Se abre ganando la Copa de las Fiestas';
  $('#progreso').textContent = `Medallas: ${medallas} de ${PISTAS.length} · parejas: ${prog.parejas.length} de ${EQUIPOS.length} · estampitas: ${prog.album.length} de ${CROMOS.length}${copaTxt}`;
}
function abreElegir() {
  tocaMusica('menu');
  const id = modo === 'copa' ? COPAS[copa.id].pistas[copa.k] : pistaSuelta;
  if (!pistaActual || pistaActual.id !== id) cargaPista(id);
  if (!abierta('pareja', eqJ.id)) eligePareja(prog.parejas[0]);
  else eligePareja(eqJ.id);
  pintaElegir();
  estado = 'elegir';
  pantalla('elegir');
  ponPaso('pareja');
}
// El elegir va en dos pasos: primero la pareja y la pintura, luego la pista.
// Cada paso cabe en la pantalla sin bajar. En Copa solo hay pareja.
let pasoElegir = 'pareja';
function ponPaso(paso) {
  const enCopa = modo === 'copa';
  pasoElegir = enCopa ? 'pareja' : paso;
  const esPareja = pasoElegir === 'pareja';
  $('#paso-pareja').hidden = !esPareja;
  $('#paso-pista').hidden = esPareja;
  $('#etapa-pareja').classList.toggle('is-activo', esPareja);
  $('#etapa-pista').classList.toggle('is-activo', !esPareja);
  $('#etapas-elegir').hidden = enCopa;
  $('#elegir-titulo').textContent = esPareja ? (enCopa ? 'Elige tu pareja para toda la Copa' : 'Elige tu pareja') : 'Elige la pista';
  $('#b-siguiente').hidden = enCopa || !esPareja;
  $('#b-empezar').hidden = !(enCopa || !esPareja);
  $(esPareja && !enCopa ? '#b-siguiente' : '#b-empezar').focus({ preventScroll: true });
}
function pintaElegir() {
  const enCopa = modo === 'copa';
  $('#elegir-kicker').textContent = enCopa ? `${COPAS[copa.id].nombre} · carrera 1 de ${COPAS[copa.id].pistas.length}` : modo === 'tiempo' ? 'Contrarreloj' : 'Carrera suelta';
  for (const b of document.querySelectorAll('#parejas .chip')) {
    const ok = abierta('pareja', b.dataset.id);
    b.classList.toggle('is-cerrada', !ok);
    b.setAttribute('aria-checked', String(b.dataset.id === eqJ.id));
  }
  const cajaP = $('#pinturas');
  cajaP.textContent = '';
  for (const q of PINTURAS) {
    const b = document.createElement('button');
    const ok = abierta('pintura', q.id);
    b.type = 'button'; b.className = 'chip' + (ok ? '' : ' is-cerrada');
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(q.id === (prog.pintura || 'madera')));
    b.innerHTML = '<svg class="icono icono--s coches-candado" aria-hidden="true"><use href="#i-candado"/></svg>';
    b.append(q.nombre);
    b.addEventListener('click', () => {
      if (!ok) { $('#pintura-lema').textContent = `${q.nombre}: ${comoSeGana('pintura', q.id)}`; return; }
      prog.pintura = q.id; guarda(); aplicaPintura();
      $('#pintura-lema').textContent = q.lema;
      for (const o of cajaP.children) o.setAttribute('aria-checked', String(o === b));
    });
    cajaP.append(b);
  }
  $('#pintura-lema').textContent = (PINTURAS.find((q) => q.id === prog.pintura) || PINTURAS[0]).lema;
  const caja = $('#pistas');
  caja.textContent = '';
  for (const q of PISTAS) {
    const b = document.createElement('button');
    const ok = abierta('pista', q.id);
    b.type = 'button'; b.className = 'chip' + (ok ? '' : ' is-cerrada');
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(q.id === pistaSuelta));
    b.innerHTML = (prog.medallas[q.id] ? SVG.medalla(prog.medallas[q.id], 18) + ' ' : '') + q.nombre;
    b.addEventListener('click', () => {
      if (!ok) { $('#pista-lema').textContent = `${q.nombre}: ${comoSeGana('pista', q.id)}`; return; }
      pistaSuelta = q.id;
      cargaPista(q.id);
      eligePareja(eqJ.id);
      pintaElegir();
      const n = $('#pistas [aria-checked="true"]'); if (n) n.focus({ preventScroll: true });
    });
    caja.append(b);
  }
  const actual = PISTAS.find((q) => q.id === pistaSuelta);
  if (!enCopa) { $('#pista-lema').textContent = (modo === 'tiempo' && prog.records[actual.id] ? `Récord: ${formato(prog.records[actual.id])}. ` : '') + actual.lema; dibujaMapa(); }
}
// El álbum: todas las estampitas, las que faltan en sombra con una pista.
function pintaAlbum() {
  const caja = $('#album-lista');
  caja.textContent = '';
  for (const cr of CROMOS) {
    const li = document.createElement('li');
    const tiene = prog.album.includes(cr.id);
    li.className = tiene ? 'coches-cromo' : 'coches-cromo is-cerrada';
    const pista = PISTAS.find((p) => p.id === cr.pista);
    if (tiene) {
      const c = cromoCanvas(cr); c.setAttribute('role', 'img'); c.setAttribute('aria-label', cr.nombre);
      li.append(c);
    } else {
      const c = lienzo(220, 300, (g, w, h) => {
        g.fillStyle = '#2A2140'; g.beginPath(); g.roundRect(0, 0, w, h, 16); g.fill();
        g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 10); g.fill();
        g.fillStyle = 'rgba(255,255,255,.35)'; g.font = '800 96px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', w / 2, h / 2 - 10);
      });
      li.append(c);
    }
    const p = document.createElement('p'); p.className = 'caption';
    const zona = ZONAS[cr.zona].nombre, baja = (t) => t.replace(/^(La|El|Las|Los) /, (m) => m.toLowerCase());
    p.textContent = tiene ? cr.desc : pista && pista.nombre !== zona ? `Está en ${baja(pista.nombre)}, por ${baja(zona)}.` : `Está en ${baja(pista ? pista.nombre : zona)}.`;
    const b = document.createElement('b'); b.textContent = tiene ? cr.nombre : '¿?';
    li.append(b, p);
    caja.append(li);
  }
  $('#album-cuenta').textContent = `${prog.album.length} de ${CROMOS.length}`;
}
function pintaMedallas() {
  const ul = $('#lista-pistas');
  ul.textContent = '';
  for (const q of PISTAS) {
    const li = document.createElement('li');
    const med = prog.medallas[q.id];
    const rec = prog.records[q.id];
    li.innerHTML = `<span class="coches-lista__icono">${med ? SVG.medalla(med, 40) : SVG.vacia(40)}</span>
      <span><b></b><br><span class="caption"></span></span>`;
    li.querySelector('b').textContent = q.nombre;
    li.querySelector('.caption').textContent = abierta('pista', q.id)
      ? (rec ? `Récord: ${formato(rec)}${med ? ` · ${PUESTOS[med - 1].toLowerCase()}` : ' · sin medalla'}` : 'Sin correr todavía')
      : comoSeGana('pista', q.id);
    ul.append(li);
  }
  const ul2 = $('#lista-parejas');
  ul2.textContent = '';
  for (const q of EQUIPOS) {
    const li = document.createElement('li');
    const ok = abierta('pareja', q.id);
    li.innerHTML = `<span class="coches-lista__icono">${ok ? '<svg class="icono" aria-hidden="true"><use href="#i-check"/></svg>' : '<svg class="icono" aria-hidden="true"><use href="#i-candado"/></svg>'}</span>
      <span><b></b><br><span class="caption"></span></span>`;
    li.querySelector('b').textContent = q.nombre;
    li.querySelector('.caption').textContent = ok ? q.lema : comoSeGana('pareja', q.id);
    if (!ok) li.classList.add('is-cerrada');
    ul2.append(li);
  }
  $('#copa-mejor').textContent = Object.keys(COPAS).map((id) => `${COPAS[id].nombre}: ${prog.copas[id] ? PUESTOS[prog.copas[id] - 1].toLowerCase() : copaAbierta(id) ? 'sin terminar' : 'cerrada'}`).join(' · ') + '.';
}

// ─── elegir pareja ─────────────────────────────────────────────────
function eligePareja(id) {
  eqJ = EQUIPOS.find((q) => q.id === id);
  cocheJ = carros.find((c2) => c2.cruce.eq === eqJ).cruce;
  rivales = carros.filter((c2) => c2.cruce !== cocheJ);
  ST.tope = 0.94 + 0.03 * eqJ.stats[0];
  ST.empuje = 0.85 + 0.075 * eqJ.stats[1];
  ST.giro = 0.9 + 0.05 * eqJ.stats[2];
  aplicaPintura();
  if (fantasma.coche) { for (const r of [fantasma.coche.g, fantasma.coche.conductor.obj, fantasma.coche.empujador.obj]) escena.remove(r); fantasma.coche = null; }
  reinicia();
  // En la parrilla, los de atrás están listos para empujar.
  for (const cc of carros) { cc.cruce.conductor.pon('montado', { fundido: 0 }); cc.cruce.empujador.pon('correr', { fundido: 0 }); }
  Object.assign(e, { estado: 'empujando' });
  if (modo !== 'demo') try { localStorage.setItem('coches3d-pareja', id); } catch (err) { /* sin almacenamiento */ }
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
    b.innerHTML = '<svg class="icono icono--s coches-candado" aria-hidden="true"><use href="#i-candado"/></svg>';
    b.append(q.nombre);
    b.addEventListener('click', () => {
      if (estado !== 'elegir') return;
      if (!abierta('pareja', q.id)) {
        $('#pareja-nombre').textContent = q.nombre;
        $('#pareja-lema').textContent = comoSeGana('pareja', q.id);
        $('#pareja-stats').textContent = '';
        return;
      }
      eligePareja(q.id);
    });
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
  pantalla(null);
  $('#hud').hidden = false;
  $('#mandos').hidden = !esTactil;
  estado = 'cuenta'; cuenta = 3; actualiza.n = null; llegadaVista = false;
  tocaMusica('carrera');
  armaRuta();
  ultimoHud = {};
  camS = j.s;
  punto(camS - 5.4, j.x * 0.8, 2.25, camara.position);
  camara.clearViewOffset();
  camara.fov = 60; camara.updateProjectionMatrix();
}
function pausa() {
  if (modo === 'demo') { terminaDemo(); return; }
  if (estado !== 'carrera' && estado !== 'cuenta') return;
  antes = estado; estado = 'pausa';
  $('#pausa').hidden = false;
  $('#b-seguir').focus({ preventScroll: true });
  if (son.ctx) son.ctx.suspend();
}
function sigue() {
  if (estado !== 'pausa') return;
  estado = antes; $('#pausa').hidden = true;
  if (son.ctx) son.ctx.resume();
}

function empiezaCopa(id) {
  if (!copaAbierta(id)) { avisa('Se abre ganando la Copa de las Fiestas', 1600); return; }
  modo = 'copa';
  copa = { id, k: 0, puntos: Object.fromEntries(EQUIPOS.map((q) => [q.id, 0])), ultimos: {} };
  abreElegir();
}
$('#b-copa').addEventListener('click', () => empiezaCopa('fiestas'));
$('#b-copa-noche').addEventListener('click', () => empiezaCopa('noche'));
$('#b-suelta').addEventListener('click', () => { modo = 'suelta'; abreElegir(); });
$('#b-tiempo').addEventListener('click', () => { modo = 'tiempo'; abreElegir(); });
$('#b-medallas').addEventListener('click', () => { pintaMedallas(); pantalla('medallas'); $('#b-volver-medallas').focus({ preventScroll: true }); });
$('#b-album').addEventListener('click', () => { pintaAlbum(); pantalla('album'); $('#b-volver-album').focus({ preventScroll: true }); });
$('#b-volver-album').addEventListener('click', aMenu);
$('#b-ayuda').addEventListener('click', () => { pantalla('ayuda'); $('#b-volver-ayuda').focus({ preventScroll: true }); });
$('#b-volver-ayuda').addEventListener('click', aMenu);
$('#titulo').addEventListener('click', desdeTitulo);
$('#podio').addEventListener('click', aMenu);
$('#podio').addEventListener('keydown', (ev) => { if (ev.repeat) return; if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); aMenu(); } });
// Los menús suenan: un blip al moverse, otro al elegir.
document.addEventListener('focusin', (ev) => { if (ev.target.matches('.btn, .chip') && estado !== 'carrera') tono(1100, 0.04, 'square', 0.05); });
document.addEventListener('click', (ev) => { if (ev.target.closest('.btn, .chip') && estado !== 'carrera') tono(620, 0.1, 'square', 0.07, 1240); });
// Y se recorren con las flechas, como con el mando: arriba y abajo entre
// botones, izquierda y derecha dentro de una fila de fichas.
function navegaMenu(ev) {
  const capa = CAPAS.map((id) => $('#' + id)).find((el) => !el.hidden);
  if (!capa) return false;
  const todos = [...capa.querySelectorAll('button:not(:disabled)')].filter((b) => b.offsetParent !== null);
  if (!todos.length) return false;
  const act = document.activeElement;
  const grupo = act && act.matches('.chip') ? [...act.parentElement.querySelectorAll('.chip')] : null;
  const lateral = ev.code === 'ArrowLeft' || ev.code === 'ArrowRight';
  const atras = ev.code === 'ArrowLeft' || ev.code === 'ArrowUp';
  let lista = todos, k = todos.indexOf(act);
  if (grupo && lateral) { lista = grupo; k = grupo.indexOf(act); }
  else if (grupo) {
    // Salta la fila de fichas entera.
    const fuera = todos.filter((b) => !grupo.includes(b) || b === act);
    lista = fuera; k = fuera.indexOf(act);
  }
  const sig = lista[(k + (atras ? -1 : 1) + lista.length) % lista.length];
  if (sig) { sig.focus({ preventScroll: true }); if (sig.matches('.chip[role="radio"]') && lateral) sig.click(); }
  return true;
}
$('#b-volver-medallas').addEventListener('click', aMenu);
$('#b-siguiente').addEventListener('click', () => ponPaso('pista'));
$('#b-volver-elegir').addEventListener('click', () => (pasoElegir === 'pista' ? ponPaso('pareja') : aMenu()));
$('#b-empezar').addEventListener('click', empieza);
$('#b-pausa').addEventListener('click', pausa);
$('#b-seguir').addEventListener('click', sigue);
$('#b-reintentar').addEventListener('click', () => { if (son.ctx) son.ctx.resume(); empieza(); });
$('#b-salir').addEventListener('click', aMenu);
$('#b-copa-sigue').addEventListener('click', sigueCopa);
$('#b-copa-deja').addEventListener('click', aMenu);
$('#premio').addEventListener('click', siguientePremio);
$('#premio').addEventListener('keydown', (ev) => { if (ev.repeat) return; if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); siguientePremio(); } });
$('#b-sonido').addEventListener('click', () => { ajustes.sonido = !ajustes.sonido; guardaAjustes(); aplicaAjustes(); });
for (const el of document.querySelectorAll('#opciones [data-ajuste]')) {
  el.addEventListener('click', () => { ajustes[el.dataset.ajuste] = !ajustes[el.dataset.ajuste]; guardaAjustes(); aplicaAjustes(); });
}
// Borrar el progreso pide dos toques: el primero cambia el texto del botón.
$('#b-borrar').addEventListener('click', (ev) => {
  const b = ev.currentTarget;
  if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.querySelector('span').textContent = '¿Seguro? Toca otra vez'; return; }
  prog = progresoBase(); guarda();
  try { localStorage.removeItem('coches3d-pareja'); for (const q of PISTAS) localStorage.removeItem(fantasmaClave(q.id)); } catch (err) { /* sin almacenamiento */ }
  fantasma.datos = null;
  eligePareja(prog.parejas[0]); pistaSuelta = 'panecillo';
  b.dataset.seguro = ''; b.querySelector('span').textContent = 'Progreso borrado';
  pintaPortada();
});
$('#b-opciones').addEventListener('click', () => { const b = $('#b-borrar'); b.dataset.seguro = ''; b.querySelector('span').textContent = 'Borrar el progreso'; pantalla('opciones'); $('#opciones [data-ajuste]').focus({ preventScroll: true }); });
$('#b-volver-opciones').addEventListener('click', aMenu);
$('#b-creditos').addEventListener('click', () => { pantalla('creditos'); $('#b-volver-creditos').focus({ preventScroll: true }); });
$('#b-volver-creditos').addEventListener('click', aMenu);
document.addEventListener('visibilitychange', () => { if (document.hidden) pausa(); });
// Si el teléfono se pone de pie, sale el cartel de girarlo: la carrera se pausa.
const verticalMQ = matchMedia('(orientation: portrait) and (pointer: coarse)');
verticalMQ.addEventListener('change', (ev) => { if (ev.matches) { for (const k in teclas) teclas[k] = false; pausa(); } });

const MAPA = {
  ArrowLeft: 'izq', KeyA: 'izq', ArrowRight: 'der', KeyD: 'der',
  ArrowUp: 'empuja', KeyW: 'empuja', Space: 'empuja', ArrowDown: 'freno', KeyS: 'freno',
};
addEventListener('keydown', (ev) => {
  if (modo === 'demo') { ev.preventDefault(); terminaDemo(); return; }
  if (estado === 'titulo') {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || /^F\d+$/.test(ev.code) || ev.repeat) return;
    if (!['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'Tab', 'Escape'].includes(ev.code)) { ev.preventDefault(); desdeTitulo(); }
    return;
  }
  if (ev.code === 'Escape' || ev.code === 'KeyP') { if (estado === 'pausa') sigue(); else pausa(); return; }
  if ((estado === 'menu' || estado === 'elegir' || estado === 'pausa') && ev.code.startsWith('Arrow')) { if (navegaMenu(ev)) ev.preventDefault(); return; }
  const t = MAPA[ev.code];
  if (!t || (estado !== 'carrera' && estado !== 'cuenta')) return;
  ev.preventDefault();
  teclas[t] = true;
});
addEventListener('keyup', (ev) => { if (modo === 'demo') return; const t = MAPA[ev.code]; if (t) teclas[t] = false; });
document.addEventListener('pointerdown', () => { if (modo === 'demo') terminaDemo(); });
addEventListener('blur', () => { for (const k in teclas) teclas[k] = false; });

// Muchos toques o clics seguidos no deben seleccionar texto ni hacer zoom:
// ni el doble clic, ni el doble toque, ni el pellizco, ni Ctrl + rueda.
document.addEventListener('dblclick', (ev) => ev.preventDefault());
document.addEventListener('selectstart', (ev) => ev.preventDefault());
for (const tipo of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(tipo, (ev) => ev.preventDefault());
document.addEventListener('wheel', (ev) => { if (ev.ctrlKey) ev.preventDefault(); }, { passive: false });
let ultimoToque = 0;
document.addEventListener('touchend', (ev) => {
  const ahora = performance.now();
  if (ahora - ultimoToque < 350) ev.preventDefault();
  ultimoToque = ahora;
}, { passive: false });
document.addEventListener('pointerdown', () => { const sel = getSelection(); if (sel && sel.rangeCount) sel.removeAllRanges(); });

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
  // En modo píxel se dibuja a un cuarto de resolución y se escala sin
  // suavizar: los dientes de sierra de la consola.
  render.setPixelRatio(ajustes.pixel ? 0.5 : Math.min(window.devicePixelRatio || 1, tactilMQ.matches ? 1.5 : 2));
  render.setSize(innerWidth, innerHeight, false);
  camara.aspect = innerWidth / innerHeight;
  // En vertical se abre el ángulo para que quepa la calzada entera.
  camara.zoom = innerWidth < innerHeight ? 0.7 : 1;
  camara.updateProjectionMatrix();
}
addEventListener('resize', mide);
// En el teléfono se juega de lado: donde el navegador deja, se bloquea.
// Pantalla completa: el navegador solo la deja con un toque o una tecla, así
// que cada uno la pide hasta que está. Ya a pantalla completa, se bloquea de lado.
function completa() {
  if (document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
    ?.then?.(() => screen.orientation?.lock?.('landscape'))?.catch?.(() => {});
}
addEventListener('pointerdown', completa);
addEventListener('keydown', completa);

let previo = performance.now(), acum = 0;
const PASO = 1 / 60;
function bucle(ahora) {
  const dt = Math.min(0.1, (ahora - previo) / 1000);
  previo = ahora;
  sonidoRodar();   // fuera de la carrera baja a cero: que no quede el siseo en los menús
  if (estado === 'premio') { requestAnimationFrame(bucle); return; }
  if (estado === 'foto') {
    // Cámara libre, para las fotos de las pruebas.
    if (cocheJ) dibujaMundo(dt);
    const m = muestra(foto.s);
    punto(foto.s, foto.x, foto.h, camara.position);
    if (foto.mira) camara.lookAt(foto.mira[0], foto.mira[1], foto.mira[2]);
    else camara.lookAt(camara.position.x + Math.sin(m.th + foto.giro) * 10, camara.position.y - 1, camara.position.z + Math.cos(m.th + foto.giro) * 10);
    camara.clearViewOffset(); camara.fov = 60; camara.updateProjectionMatrix();
    panorama.position.set(camara.position.x, camara.position.y + 30, camara.position.z);
    sigueSol(camara.position);
    if (publico) publico.coloca(ahora / 1000, foto.s);
    animaFuegos(dt, foto.s);
    render.render(escena, camara);
    requestAnimationFrame(bucle); return;
  }
  if (estado === 'menu' || estado === 'cargando' || estado === 'titulo' || estado === 'elegir' || estado === 'podio') {
    if (!N) { requestAnimationFrame(bucle); return; }
    if (cocheJ) dibujaMundo(dt);
    if (estado === 'elegir') dibujaPortada(ahora / 1000);
    else if (estado === 'podio') dibujaPodio(ahora / 1000);
    else dibujaVuelo(ahora / 1000);
    animaFuegos(dt, estado === 'elegir' || estado === 'podio' ? j.s : SALIDA + ((ahora / 1000) * 7) % Math.max(60, META - SALIDA));
    render.render(escena, camara);
  } else if (estado !== 'pausa') {
    acum += dt;
    while (acum >= PASO) { actualiza(PASO); acum -= PASO; }
    dibujaMundo(dt);
    dibujaCamara(dt);
    animaFuegos(dt, j.s);
    if (publico) publico.coloca(ahora / 1000, j.s);
    render.render(escena, camara);
    if (estado === 'carrera' || estado === 'llegada' || estado === 'cuenta') pintaHud();
  }
  requestAnimationFrame(bucle);
}

// ─── la carga ──────────────────────────────────────────────────────
async function carga() {
  const texto = $('#start span');
  const nombres = ['base-chico', 'base-chica', 'generico', 'policia', 'ministro', 'animaciones', 'quito'];
  const reales = [...new Set(PISTAS.filter((p) => p.real).map((p) => p.real))];
  let listos = 0;
  const total = nombres.length + reales.length;
  const avanza = () => { listos++; texto.textContent = `Cargando… ${Math.round((listos / total) * 100)}%`; };
  const cargador = new GLTFLoader();
  const pide = (n) => cargador.loadAsync(modeloUrl(n)).then((g) => { avanza(); return g; });
  const pideCalle = (n) => (GENERADAS[n] ? Promise.resolve(GENERADAS[n]()) : fetch(new URL(`pistas/${n}.json${SELLO}`, import.meta.url)).then((r) => r.json()))
    .then((d) => { DATOS_REALES[n] = d; avanza(); });
  const [chico, chica, generico, policia, ministro, anim, quito] = await Promise.all([...nombres.map(pide), ...reales.map(pideCalle)]);
  Object.assign(MODELOS, { 'base-chico': chico, 'base-chica': chica, generico, policia, ministro });
  for (const n of ['montado', 'correr', 'rol', 'golpe', 'salto', 'arrancar']) {
    const clip = anim.animations.find((a) => a.name === n);
    if (clip) CLIPS[n] = limpiaClip(clip);
  }
  preparaQuito(quito);
  carros = EQUIPOS.map((eq) => ({ cruce: construyeCoche(eq) }));
  peatones = ['generico', 'policia', 'ministro', 'generico', 'ministro', 'policia'].map((n) => {
    const p = new Persona(n, { altura: ADULTO * (n === 'ministro' ? 1.04 : 1) });
    p.obj.visible = false;
    return { p, estado: 'libre', s: 0, x: 0 };
  });
  let guardada = null;
  try { guardada = localStorage.getItem('coches3d-pareja'); } catch (err) { /* sin almacenamiento */ }
  eqJ = EQUIPOS.find((q) => q.id === (abierta('pareja', guardada) ? guardada : prog.parejas[0]));
  cargaPista('panecillo');
  eligePareja(eqJ.id);
  for (const id of ['b-copa', 'b-copa-noche', 'b-suelta', 'b-tiempo', 'b-medallas', 'b-album']) $('#' + id).disabled = false;
  aplicaAjustes();
  texto.textContent = tactilMQ.matches ? 'Toca para empezar' : 'Pulsa una tecla';
  $('#start').classList.add('is-lista');
  aTitulo();
}

preparaMateriales();
construyePanorama();
preparaFuegos();
cargaPista('panecillo');
mide();
pintaPortada();
pantalla('titulo', true);
requestAnimationFrame(bucle);
carga().catch((err) => {
  console.error(err);
  $('#start span').textContent = 'No cargó: recarga la página';
});

// Para probar desde la consola sin jugar entero.
window.coches = {
  estado: () => ({ estado, pista: pistaActual && pistaActual.id, modo, reloj, v: j.v, s: j.s, x: j.x, h: j.h, aire: j.aire, volcado: j.volcado, empujador: e.estado, puesto: j.puesto, zona: zonaEn(j.s), meta: META }),
  // Dibuja un fotograma y devuelve el giro del coche, para las pruebas.
  yaw: () => { dibujaMundo(0.02); return cocheJ.g.rotation.y; },
  curva: (s) => P.k[limita(Math.floor(s), 0, N - 1)], tope: (k) => GIRO / (CENTRIFUGA * Math.max(k, 1e-4)), hw: (s) => muestra(s).hw, teclas, empieza,
  // Avanza la simulación sin dibujar, para las pruebas automáticas.
  volcar: () => volcar(),
  pista: (id) => cargaPista(id), noche: () => noche, copas: COPAS, empiezaCopa,
  renderiza: () => render.render(escena, camara),
  limpia: () => { limpiaMundo(); obstaculos.length = 0; return { ...render.info.memory }; },
  memoria: () => ({ geometrias: render.info.memory.geometries, texturas: render.info.memory.textures, programas: render.info.programs.length, hijos: mundo.children.length, obstaculos: obstaculos.length }),
  cohete: (s) => lanzaCohete(s),
  fuegos: () => ({ visible: fuegos.points && fuegos.points.visible, vivos: fuegos.datos.filter((d) => d.vivo).map((d) => [Math.round(d.x), Math.round(d.y), Math.round(d.z), +d.t.toFixed(1)]), cam: camara.position.toArray().map(Math.round) }),
  // Mete una calle de verdad y su pista sin pasar por la red, para probar.
  pistaReal: (datos, def) => { DATOS_REALES[datos.id] = datos; if (!PISTAS.some((p) => p.id === def.id)) PISTAS.push(def); return cargaPista(def.id); },
  vuelta: () => vueltaActual, largoVuelta: () => LARGO_VUELTA, mapa: dibujaMapa,
  musica: () => ({ nombre: musica.nombre, paso: musica.paso, ctx: !!son.ctx }),
  // Un paso con el pie izquierdo (-1) o el derecho (1), y una pausa después.
  doble: () => { teclas.izq = teclas.der = true; window.coches.simula(0.03); teclas.izq = teclas.der = false; window.coches.simula(0); },
  ritmo: () => ritmo(),
  coladas: (n) => { if (n != null) j.coladas = n; return j.coladas || 0; },
  unPie: () => pasos.unPie,
  pisa: () => pasos.pulsos.push({ t: reloj, peso: 1 }),
  paso: (lado, espera) => { const k = lado < 0 ? 'izq' : 'der'; teclas[k] = true; window.coches.simula(0.03); teclas[k] = false; window.coches.simula(espera || 0); },
  combo: () => pasos.combo,
  demo: empiezaDemo, ajustes,
  // Pinta unos segundos de una canción sin sonar, para medir que suena.
  rindeMusica: async (nombre, seg) => {
    const off = new OfflineAudioContext(1, 44100 * seg, 44100);
    const antes = { ctx: musica.ctx, gain: musica.gain, nombre: musica.nombre, paso: musica.paso, t: musica.t };
    musica.ctx = off; musica.gain = null; musica.nombre = nombre; musica.paso = 0; musica.t = 0.05;
    musicaInstrumentos();
    const c = CANCIONES[nombre];
    musicaTickHasta(seg);
    const buf = await off.startRendering();
    const d = buf.getChannelData(0); let e = 0; for (let i = 0; i < d.length; i++) e += d[i] * d[i];
    Object.assign(musica, antes);
    return { rms: Math.sqrt(e / d.length), pico: d.reduce((m, v) => Math.max(m, Math.abs(v)), 0), pasos: Math.round(seg / (30 / c.bpm)) };
  },
  camaraEn: (s, x, h, giro, mira) => { Object.assign(foto, { s, x, h, giro: giro || 0, mira: mira || null }); pantalla(null, true); estado = 'foto'; },
  punto: (s, x, h) => punto(s, x, h).toArray(), pend: (s) => muestra(s).pend,
  fantasma: () => ({ datos: fantasma.datos ? fantasma.datos.length : 0, trazo: fantasma.trazo.length, coche: !!(fantasma.coche && fantasma.coche.g.visible) }),
  pintura: () => ({ elegida: prog.pintura, color: cocheJ ? '#' + cocheJ.tabla.material.color.getHexString() : null }),
  modo: (m) => { modo = m; },
  progreso: () => prog, album: () => prog.album.slice(), cromos: () => CROMOS.map((c) => ({ id: c.id, pista: c.pista })),
  copa: () => copa,
  peatones: () => peatones.filter((p) => p.estado !== 'libre').map((p) => ({ estado: p.estado, ds: +(p.s - j.s).toFixed(1), x: +p.x.toFixed(1) })),
  simula: (seg, piloto) => { for (let k = 0; k < seg * 60; k++) { if (piloto) piloto(); actualiza(PASO); } },
  obstaculos: () => obstaculos.map((o) => ({ s: o.s, x: o.x, tipo: o.tipo })),
  stats: () => ({ ...stats, rivales: rivales.map((rv) => [rv.cruce.eq.nombre, Math.round(rv.s), rv.llegada && rv.llegada.toFixed(1)]) }),
};
