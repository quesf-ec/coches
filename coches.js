/* Coches de madera · la bajada del Panecillo. Un kart de los de antes, sin
   motor: el coche corre lo que le da la cuesta, y en las subidas se empuja
   pateando el suelo.

   El motor es el pseudo-3D de los juegos de carreras de 16 bits: la calle es
   una tira de segmentos de SEG unidades, cada uno con su curva y su altura, y
   cada fotograma se proyectan los VISTA siguientes desde la cámara. La curva
   no mueve la calle, desplaza la proyección; la altura sí está en el mundo,
   y por eso las crestas tapan lo que viene detrás.

   Todo lo que se ve —casas, iglesias, coches, la Virgen— se pinta una vez al
   cargar en lienzos pequeños y se dibuja escalado. No se pide ni una imagen.
   De mal.js solo hace falta el sprite de iconos para el HUD. */
(() => {
  'use strict';

  // ─── la física ──────────────────────────────────────────────────
  const SEG = 200;              // largo de un segmento
  const ANCHO = 1700;           // medio ancho de la calle
  const CAM_ALTO = 820;         // la cámara va bajita: es un coche de niño
  const VISTA = 260;            // segmentos que se dibujan hacia delante
  const FRANJA = 3;             // segmentos por franja de bordillo
  const VMAX = SEG * 60;        // la velocidad de referencia: 72 km/h
  const KMH = 72 / VMAX;
  const TOPE = VMAX * 1.16;     // lo más que da una cuesta
  const TOPE_TURBO = VMAX * 1.32;
  const G = 10500;              // lo que tira la cuesta por unidad de pendiente
  const ROCE = 260;             // rulimanes contra el asfalto
  const AIRE = 2.6e-5;          // y el aire, que crece con el cuadrado
  const PATADA = 3000;          // empujón al patear el suelo…
  const PATADA_HASTA = VMAX * 0.5;  // …que no sirve de nada pasada esta velocidad
  const FRENO = 9000;
  const FUERA = 5200;           // la vereda y el pasto frenan
  const FUERA_HASTA = VMAX * 0.22;
  const CENTRIFUGA = 0.3;
  const GIRO = 2.1;
  const TURBO = 7000, TURBO_T = 1.7;
  const COCHE_W = 0.34;         // el ancho de un coche, en medios anchos de calle
  const NIEBLA = '#C9DCE6';

  const raiz = document.documentElement;
  const $ = (s) => document.querySelector(s);
  const limita = (v, a, b) => Math.min(Math.max(v, a), b);
  const mezcla = (a, b, p) => a + (b - a) * p;
  const suave = (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);
  const quieto = matchMedia('(prefers-reduced-motion: reduce)');
  const tactilMQ = matchMedia('(pointer: coarse)');

  // Un azar con semilla: la pista y sus casas salen iguales en cada carga.
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

  // ─── los sprites, pintados a mano ───────────────────────────────
  function lienzo(w, h, pinta) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    pinta(c.getContext('2d'), w, h);
    return c;
  }
  const TINTA = '#2A2118';

  function casa(pared, marco, pisos, r) {
    const hp = 92, alero = 44, w = 260, h = pisos * hp + alero;
    return lienzo(w, h, (c) => {
      // el tejado de teja
      c.fillStyle = '#A8442C';
      c.beginPath(); c.moveTo(0, alero); c.lineTo(16, 8); c.lineTo(w - 16, 8); c.lineTo(w, alero); c.closePath(); c.fill();
      c.save(); c.clip();
      c.strokeStyle = 'rgba(60,20,10,.35)'; c.lineWidth = 3;
      for (let x = 4; x < w; x += 11) { c.beginPath(); c.moveTo(x, 8); c.lineTo(x + (x - w / 2) * 0.08, alero); c.stroke(); }
      c.restore();
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(16, 8, w - 32, 5);
      // la pared
      c.fillStyle = pared; c.fillRect(6, alero, w - 12, h - alero);
      c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(6, alero, w - 12, 9);
      // el zócalo de piedra
      c.fillStyle = '#9C9488'; c.fillRect(6, h - 20, w - 12, 20);
      c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(6, h - 20, w - 12, 3);
      for (let k = 0; k < pisos; k++) {
        const y0 = alero + k * hp;
        const abajo = k === pisos - 1;
        if (abajo) {
          // la puerta de madera, con arco
          const pw = 50, px = w / 2 - pw / 2, py = y0 + 22;
          c.fillStyle = marco; c.beginPath();
          c.moveTo(px - 6, h - 20); c.lineTo(px - 6, py + 18); c.arc(w / 2, py + 18, pw / 2 + 6, Math.PI, 0); c.lineTo(px + pw + 6, h - 20); c.fill();
          c.fillStyle = '#6B4423'; c.beginPath();
          c.moveTo(px, h - 20); c.lineTo(px, py + 18); c.arc(w / 2, py + 18, pw / 2, Math.PI, 0); c.lineTo(px + pw, h - 20); c.fill();
          c.strokeStyle = '#4A2E17'; c.lineWidth = 2; c.beginPath(); c.moveTo(w / 2, py); c.lineTo(w / 2, h - 20); c.stroke();
          // dos ventanas con reja
          for (const vx of [34, w - 34 - 36]) {
            c.fillStyle = marco; c.fillRect(vx - 4, y0 + 22, 44, 50);
            c.fillStyle = '#2E3A44'; c.fillRect(vx, y0 + 26, 36, 42);
            c.strokeStyle = '#1C1C1C'; c.lineWidth = 2;
            for (let b = vx + 6; b < vx + 36; b += 8) { c.beginPath(); c.moveTo(b, y0 + 26); c.lineTo(b, y0 + 68); c.stroke(); }
          }
        } else {
          // tres balcones con su baranda
          for (let v = 0; v < 3; v++) {
            const vx = 26 + v * 76, vw = 56;
            c.fillStyle = marco; c.fillRect(vx - 4, y0 + 16, vw + 8, 62);
            c.fillStyle = '#3A4A57'; c.fillRect(vx, y0 + 20, vw, 54);
            c.fillStyle = 'rgba(190,220,240,.35)'; c.fillRect(vx + 4, y0 + 24, vw / 2 - 6, 22);
            c.strokeStyle = marco; c.lineWidth = 3; c.beginPath(); c.moveTo(vx + vw / 2, y0 + 20); c.lineTo(vx + vw / 2, y0 + 74); c.stroke();
            // la baranda sale de la pared
            c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(vx - 8, y0 + 80, vw + 16, 6);
            c.fillStyle = marco; c.fillRect(vx - 10, y0 + 54, vw + 20, 4); c.fillRect(vx - 10, y0 + 76, vw + 20, 5);
            c.lineWidth = 2; c.strokeStyle = marco;
            for (let b = vx - 6; b <= vx + vw + 8; b += 7) { c.beginPath(); c.moveTo(b, y0 + 56); c.lineTo(b, y0 + 77); c.stroke(); }
          }
        }
      }
      // macetas en algún balcón
      if (pisos > 1 && r() < 0.6) {
        c.fillStyle = '#D6382B';
        for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(30 + r() * 200, alero + 52 + 5, 5, 0, 7); c.fill(); }
      }
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; c.strokeRect(6, alero, w - 12, h - alero);
    });
  }

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

  const farol = () => lienzo(60, 260, (c) => {
    c.fillStyle = '#1E1E22';
    c.fillRect(26, 70, 8, 180); c.fillRect(18, 236, 24, 24); c.fillRect(22, 226, 16, 12);
    c.strokeStyle = '#1E1E22'; c.lineWidth = 4; c.beginPath(); c.moveTo(30, 90); c.quadraticCurveTo(10, 80, 18, 64); c.stroke();
    c.beginPath(); c.moveTo(14, 26); c.lineTo(46, 26); c.lineTo(40, 66); c.lineTo(20, 66); c.closePath(); c.fill();
    c.fillStyle = '#FFE08A'; c.beginPath(); c.moveTo(19, 31); c.lineTo(41, 31); c.lineTo(37, 61); c.lineTo(23, 61); c.closePath(); c.fill();
    c.fillStyle = '#1E1E22'; c.beginPath(); c.moveTo(10, 28); c.lineTo(30, 8); c.lineTo(50, 28); c.fill();
  });

  const eucalipto = (r) => lienzo(240, 420, (c, w, h) => {
    c.fillStyle = '#BFAE96'; c.beginPath(); c.moveTo(108, h); c.lineTo(114, 120); c.lineTo(126, 120); c.lineTo(134, h); c.fill();
    c.strokeStyle = 'rgba(90,70,50,.4)'; c.lineWidth = 2;
    for (let y = 150; y < h; y += 26) { c.beginPath(); c.moveTo(112, y); c.lineTo(130, y + 10); c.stroke(); }
    const verdes = ['#55745A', '#5F7F62', '#6E8F6C', '#7FA07A', '#8BA88A'];
    for (let k = 0; k < 26; k++) {
      c.fillStyle = verdes[k % verdes.length];
      const x = 120 + (r() - 0.5) * 170, y = 40 + r() * 230;
      c.beginPath(); c.ellipse(x, y, 26 + r() * 22, 34 + r() * 30, 0, 0, 7); c.fill();
    }
  });

  const palmera = () => lienzo(200, 380, (c, w, h) => {
    c.strokeStyle = '#8E7656'; c.lineWidth = 14; c.beginPath(); c.moveTo(100, h); c.quadraticCurveTo(90, 200, 104, 80); c.stroke();
    c.strokeStyle = '#6F5B40'; c.lineWidth = 2;
    for (let y = h - 10; y > 90; y -= 12) { c.beginPath(); c.moveTo(92, y); c.lineTo(108, y - 4); c.stroke(); }
    c.strokeStyle = '#4E7A3E'; c.lineCap = 'round';
    for (let k = 0; k < 9; k++) {
      const a = Math.PI + k * Math.PI / 8;
      c.lineWidth = 12; c.beginPath(); c.moveTo(104, 80);
      c.quadraticCurveTo(104 + Math.cos(a) * 60, 80 + Math.sin(a) * 60 - 20, 104 + Math.cos(a) * 95, 80 + Math.sin(a) * 40 + 40);
      c.stroke();
    }
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

  // La gente que mira: cuatro o cinco con un cartel, que esto es fiesta.
  const ROPA = ['#D6382B', '#1B5FAA', '#F5A623', '#2E7D4F', '#6B2D7B', '#E9E4D8', '#3B4A6B', '#C2185B'];
  const PIEL = ['#8D5A3B', '#A86E48', '#C68B5E', '#7A4A2E'];
  const CARTELES = ['¡DALE!', 'GUAMBRA', '¡VAMOS!', 'QUITO', '¡ÑAÑO!', 'A TODO'];
  const publico = (r) => lienzo(220, 150, (c, w, h) => {
    const n = 4 + Math.floor(r() * 2);
    const cartel = Math.floor(r() * n);
    for (let k = 0; k < n; k++) {
      const x = 22 + k * (w - 44) / (n - 1) + (r() - 0.5) * 8, alto = 70 + r() * 30;
      c.fillStyle = elige(r, ROPA);
      c.beginPath(); c.moveTo(x - 18, h); c.lineTo(x - 15, h - alto + 18); c.quadraticCurveTo(x, h - alto + 8, x + 15, h - alto + 18); c.lineTo(x + 18, h); c.fill();
      c.fillStyle = elige(r, PIEL); c.beginPath(); c.arc(x, h - alto, 12, 0, 7); c.fill();
      if (r() < 0.4) { c.fillStyle = TINTA; c.fillRect(x - 16, h - alto - 10, 32, 4); c.fillRect(x - 10, h - alto - 20, 20, 11); }
      else { c.fillStyle = '#2A2420'; c.beginPath(); c.arc(x, h - alto - 4, 12, Math.PI, 0); c.fill(); }
      if (k === cartel) {
        c.strokeStyle = '#6B4423'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 14, h - alto + 20); c.lineTo(x + 14, h - alto - 30); c.stroke();
        c.fillStyle = '#FFF8E6'; c.fillRect(x - 20, h - alto - 64, 76, 36);
        c.strokeStyle = TINTA; c.lineWidth = 2; c.strokeRect(x - 20, h - alto - 64, 76, 36);
        c.fillStyle = '#D6382B'; c.font = '800 15px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(elige(r, CARTELES), x + 18, h - alto - 46);
      } else if (r() < 0.5) {
        c.strokeStyle = c.fillStyle = elige(r, PIEL); c.lineWidth = 6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x + 12, h - alto + 24); c.lineTo(x + 22, h - alto - 14); c.stroke();
      }
    }
  });

  const senal = (lado) => lienzo(100, 190, (c) => {
    c.fillStyle = '#8A8F94'; c.fillRect(46, 80, 8, 110);
    c.save(); c.translate(50, 52); c.rotate(Math.PI / 4);
    c.fillStyle = '#F5C518'; c.fillRect(-32, -32, 64, 64);
    c.strokeStyle = TINTA; c.lineWidth = 4; c.strokeRect(-28, -28, 56, 56);
    c.restore();
    c.strokeStyle = TINTA; c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(50 - 8 * lado, 72); c.quadraticCurveTo(50 - 8 * lado, 44, 50 + 10 * lado, 40); c.stroke();
    c.fillStyle = TINTA; c.beginPath(); c.moveTo(50 + 18 * lado, 40); c.lineTo(50 + 6 * lado, 30); c.lineTo(50 + 6 * lado, 50); c.fill();
  });

  const muro = () => lienzo(240, 60, (c, w, h) => {
    c.fillStyle = '#9A9385'; c.fillRect(0, 10, w, h - 10);
    c.fillStyle = '#B3AC9D'; c.fillRect(0, 6, w, 8);
    c.strokeStyle = 'rgba(40,30,20,.35)'; c.lineWidth = 2;
    for (let y = 22; y < h; y += 14) for (let x = (y % 28 ? 0 : 20); x < w; x += 40) c.strokeRect(x, y - 12, 40, 14);
  });

  const hueco = () => lienzo(140, 42, (c, w, h) => {
    c.fillStyle = '#5E564C'; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, 7); c.fill();
    c.fillStyle = '#231F1B'; c.beginPath(); c.ellipse(w / 2, h / 2 + 3, w / 2 - 12, h / 2 - 7, 0, 0, 7); c.fill();
    c.strokeStyle = '#3C3630'; c.lineWidth = 2; c.beginPath(); c.moveTo(4, h / 2); c.lineTo(-2, h / 2 - 6); c.moveTo(w - 4, h / 2); c.lineTo(w + 2, h / 2 + 6); c.stroke();
  });

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

  // El coche de madera visto desde atrás: tabla, rulimanes y el guagua.
  // `pie` saca una pierna a patear (−1 izquierda, 1 derecha, 2 las dos
  // abajo, que es frenar con la suela).
  function coche(p, pie) {
    return lienzo(200, 190, (c, w, h) => {
      c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(w / 2, h - 10, 92, 10, 0, 0, 7); c.fill();
      const pierna = (s, abajo) => {
        const x = w / 2 + s * 40;
        c.strokeStyle = '#2F3A4F'; c.lineWidth = 16; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, 118); c.lineTo(x + s * 22, abajo ? 168 : 160); c.stroke();
        c.fillStyle = '#F3F1EC'; c.beginPath(); c.ellipse(x + s * 24, abajo ? 176 : 168, 14, 9, 0, 0, 7); c.fill();
        c.strokeStyle = TINTA; c.lineWidth = 2; c.stroke();
      };
      if (pie === 2) { pierna(-1, true); pierna(1, true); }
      else if (pie) pierna(pie, false);
      // los rulimanes de atrás
      for (const x of [20, w - 20]) {
        c.fillStyle = '#4A4E53'; c.fillRect(x - 13, 140, 26, 36);
        c.fillStyle = '#A7ADB3'; c.fillRect(x - 9, 144, 18, 28);
        c.fillStyle = '#2A2A2A'; c.fillRect(x - 3, 150, 6, 16);
      }
      c.fillStyle = '#3A3A3A'; c.fillRect(20, 152, w - 40, 6);
      // la tabla
      c.fillStyle = p.tabla; c.fillRect(12, 128, w - 24, 26);
      c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(12, 128, w - 24, 6);
      c.strokeStyle = 'rgba(80,45,15,.45)'; c.lineWidth = 1.5;
      for (let y = 138; y < 154; y += 6) { c.beginPath(); c.moveTo(14, y); c.bezierCurveTo(60, y - 3, 120, y + 3, w - 14, y); c.stroke(); }
      c.strokeStyle = TINTA; c.lineWidth = 3; c.strokeRect(12, 128, w - 24, 26);
      c.fillStyle = '#FFF8E6'; c.font = '800 18px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(p.num), w / 2, 142);
      // el cuerpo, de espaldas
      c.fillStyle = p.ropa;
      c.beginPath(); c.moveTo(56, 130); c.lineTo(60, 70); c.quadraticCurveTo(w / 2, 52, w - 60, 70); c.lineTo(w - 56, 130); c.closePath(); c.fill();
      c.strokeStyle = TINTA; c.lineWidth = 3; c.stroke();
      // los brazos, adelante a la soga
      c.strokeStyle = p.ropa; c.lineWidth = 14; c.lineCap = 'round';
      c.beginPath(); c.moveTo(62, 80); c.lineTo(44, 116); c.moveTo(w - 62, 80); c.lineTo(w - 44, 116); c.stroke();
      c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(64, 112, w - 128, 16);
      if (p.bufanda) {
        c.strokeStyle = p.bufanda; c.lineWidth = 9;
        c.beginPath(); c.moveTo(78, 66); c.quadraticCurveTo(w / 2, 76, w - 78, 66); c.moveTo(w / 2 + 18, 70); c.lineTo(w / 2 + 32, 104); c.stroke();
      }
      // la cabeza y el casco
      c.fillStyle = '#2A2420'; c.beginPath(); c.arc(w / 2, 42, 24, 0, 7); c.fill();
      if (p.trenza) { c.strokeStyle = '#2A2420'; c.lineWidth = 9; c.beginPath(); c.moveTo(w / 2, 58); c.quadraticCurveTo(w / 2 + 6, 80, w / 2 - 4, 96); c.stroke(); }
      if (p.sombrero) {
        c.fillStyle = p.casco; c.beginPath(); c.ellipse(w / 2, 30, 40, 9, 0, 0, 7); c.fill();
        c.fillRect(w / 2 - 22, 6, 44, 24); c.fillStyle = TINTA; c.fillRect(w / 2 - 22, 22, 44, 5);
      } else {
        c.fillStyle = p.casco; c.beginPath(); c.arc(w / 2, 40, 27, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(w / 2 + 27, 50); c.lineTo(w / 2 - 27, 50); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(w / 2 - 4, 14, 8, 36);
        c.strokeStyle = TINTA; c.lineWidth = 3; c.stroke();
      }
    });
  }

  // ─── los competidores ───────────────────────────────────────────
  const TU = { nombre: 'Tú', casco: '#D6382B', ropa: '#F3F1EC', tabla: '#C8955A', num: 1, bufanda: '#1B5FAA' };
  const RIVALES = [
    { nombre: 'El Chulla', casco: '#1B1B1F', ropa: '#3B4A6B', tabla: '#B98250', num: 7, hab: 0.97, sombrero: true },
    { nombre: 'La Guambra Pao', casco: '#E01B6A', ropa: '#F5A623', tabla: '#D2A26A', num: 11, hab: 0.955, trenza: true },
    { nombre: 'Evaristo', casco: '#5A3A22', ropa: '#8C3B2E', tabla: '#A87445', num: 3, hab: 0.94, sombrero: true, bufanda: '#F5C518' },
    { nombre: 'La Ñaña Vicky', casco: '#1B5FAA', ropa: '#6B2D7B', tabla: '#C99358', num: 5, hab: 0.93, trenza: true },
    { nombre: 'Don Lucho', casco: '#2E7D4F', ropa: '#D9D4C7', tabla: '#B07B48', num: 21, hab: 0.915 },
  ];

  // ─── la pista ───────────────────────────────────────────────────
  const ZONAS = {
    panecillo: { nombre: 'El Panecillo', calle: 'asfalto', lado: 'pasto' },
    ambato: { nombre: 'La bajada de la Ambato', calle: 'asfalto', lado: 'vereda' },
    bulevar: { nombre: 'Bulevar 24 de Mayo', calle: 'asfalto', lado: 'vereda' },
    ronda: { nombre: 'La Ronda', calle: 'adoquin', lado: 'vereda' },
    garcia: { nombre: 'La García Moreno', calle: 'adoquin', lado: 'vereda' },
    plaza: { nombre: 'Plaza Grande', calle: 'adoquin', lado: 'plaza' },
  };
  const COLOR = {
    asfalto: { claro: '#6F6B67', oscuro: '#68645F', borde: ['#E6E1D6', '#A39D92'], linea: '#F2C744' },
    adoquin: { claro: '#8E7E6B', oscuro: '#827260', borde: ['#C2B9A9', '#958D80'], junta: 'rgba(45,32,22,.38)' },
    pasto: { claro: '#7BA44F', oscuro: '#6F9846' },
    vereda: { claro: '#D3CBBB', oscuro: '#C8BFAD' },
    plaza: { claro: '#DCD4C4', oscuro: '#CFC6B4' },
  };

  const segmentos = [];
  const tramos = [];            // dónde empieza cada zona
  let zona = 'panecillo';
  let salidaI = 0, metaI = 0;

  function pon(curva, y) {
    const n = segmentos.length;
    const y0 = n ? segmentos[n - 1].p2.mundo.y : 0;
    segmentos.push({
      i: n, curva, zona, y,
      p1: { mundo: { y: y0, z: n * SEG }, cam: {}, pant: {} },
      p2: { mundo: { y, z: (n + 1) * SEG }, cam: {}, pant: {} },
      claro: Math.floor(n / FRANJA) % 2 === 0,
      sprites: [], portal: null, clip: 0,
    });
  }
  function nuevaZona(z) { zona = z; tramos.push({ zona: z, i: segmentos.length }); }
  // Un tramo entra en la curva, la sostiene y sale; la altura cambia en
  // línea recta y luego se suaviza toda junta, para que las pendientes se
  // encadenen sin escalones entre tramo y tramo.
  function tramo(ent, sost, sal, curva, alto) {
    const n0 = segmentos.length;
    const y0 = n0 ? segmentos[n0 - 1].y : 0, total = ent + sost + sal;
    let k = 0;
    const y = () => y0 + alto * SEG * (++k / total);
    for (let n = 0; n < ent; n++) pon(suave(0, curva, n / ent), y());
    for (let n = 0; n < sost; n++) pon(curva, y());
    for (let n = 0; n < sal; n++) pon(suave(curva, 0, n / sal), y());
  }

  function construye() {
    nuevaZona('panecillo');
    tramo(0, 50, 0, 0, 0);
    salidaI = 30;
    tramo(20, 40, 20, 0, -14);
    tramo(25, 45, 25, -5, -22);
    tramo(25, 45, 25, 6, -24);
    tramo(20, 30, 20, -3, -12);
    tramo(30, 60, 30, 7, -30);     // la horquilla: aquí se frena o se sale
    tramo(25, 40, 25, -5, -20);
    tramo(20, 30, 20, 2, -8);
    nuevaZona('ambato');
    tramo(30, 130, 30, 0, -95);    // la empinada
    tramo(20, 20, 20, 0, 8);       // el lomo de burro del final
    tramo(25, 40, 25, 3, -14);
    nuevaZona('bulevar');
    tramo(30, 90, 30, -2, -16);
    tramo(25, 40, 25, 3, -6);
    nuevaZona('ronda');
    tramo(15, 25, 15, -4, 7);
    tramo(15, 25, 15, 5, -10);
    tramo(15, 25, 15, -4, 6);
    tramo(15, 25, 15, 4, -9);
    tramo(15, 20, 15, -2, 3);
    nuevaZona('garcia');
    tramo(30, 150, 30, 0, 36);     // la subida, a patada limpia
    tramo(20, 30, 20, 3, 5);
    nuevaZona('plaza');
    metaI = segmentos.length + 70;
    tramo(10, 110, 10, 0, 0);
    tramo(0, VISTA + 60, 0, 0, 0);

    // Suavizar las alturas: dos pasadas de media móvil.
    let ys = segmentos.map((s) => s.y);
    for (let pasada = 0; pasada < 2; pasada++) {
      const R = 22, sal = new Array(ys.length);
      for (let i = 0; i < ys.length; i++) {
        let t = 0, c = 0;
        for (let k = i - R; k <= i + R; k++) { t += ys[limita(k, 0, ys.length - 1)]; c++; }
        sal[i] = t / c;
      }
      ys = sal;
    }
    segmentos.forEach((s, i) => {
      s.p2.mundo.y = ys[i];
      s.p1.mundo.y = i ? ys[i - 1] : ys[0];
    });
    segmentos[salidaI].portal = 'salida';
    segmentos[metaI].portal = 'meta';
    decora();
  }

  const SPR = {};
  function pintaSprites() {
    const r = azar(7);
    const paredes = ['#F6F3EC', '#F6F3EC', '#F2EBDD', '#EAD9B0', '#E3C37A', '#BFD3E2', '#F3E3D3', '#CDE0C5'];
    const marcos = ['#1F4E9E', '#1F4E9E', '#2E6B3A', '#7A3B26', '#1F4E9E'];
    SPR.casas = [];
    for (let k = 0; k < 10; k++) SPR.casas.push(casa(paredes[k % paredes.length], elige(r, marcos), 2 + (k % 3 === 0 ? 1 : 0), r));
    SPR.compania = compania(); SPR.torres = torres(); SPR.catedral = catedral(); SPR.palacio = palacio();
    SPR.farol = farol(); SPR.palmera = palmera(); SPR.virgen = virgen(); SPR.muro = muro();
    SPR.eucaliptos = [eucalipto(r), eucalipto(r), eucalipto(r)];
    SPR.publico = [publico(r), publico(r), publico(r), publico(r)];
    SPR.senal = { '-1': senal(-1), '1': senal(1) };
    SPR.hueco = hueco(); SPR.colada = colada();
    for (const p of [TU, ...RIVALES]) {
      p.spr = { quieto: coche(p, 0), izq: coche(p, -1), der: coche(p, 1), freno: coche(p, 2) };
    }
  }

  // Lo que va a los lados y lo que hay en la calle. `w` es el ancho en
  // medios anchos de calle; `x`, el centro; `cw`, el ancho con el que se
  // choca, si no es todo (de un eucalipto solo choca el tronco).
  function sprite(i, img, x, w, extra) {
    const s = segmentos[i];
    if (s) s.sprites.push(Object.assign({ img, x, w }, extra));
  }

  function decora() {
    const r = azar(2024);
    const zonaDe = (z) => {
      const t = tramos.findIndex((q) => q.zona === z);
      return [tramos[t].i, t + 1 < tramos.length ? tramos[t + 1].i : metaI + 40];
    };
    // El Panecillo: eucaliptos, muros, la Virgen y los letreros de curva.
    const [p0, p1] = zonaDe('panecillo');
    sprite(salidaI + 18, SPR.virgen, -3.4, 2.6, { choca: true, cw: 0.6 });
    for (let i = p0; i < p1; i += 9) {
      if (i > salidaI + 8 && i < salidaI + 30) continue;
      sprite(i, elige(r, SPR.eucaliptos), -(2.1 + r() * 2.4), 1.5 + r() * 0.5, { choca: true, cw: 0.22 });
      sprite(i + 4, elige(r, SPR.eucaliptos), 2.1 + r() * 2.4, 1.5 + r() * 0.5, { choca: true, cw: 0.22 });
    }
    for (let i = p0 + 60; i < p1; i += 7) { sprite(i, SPR.muro, -1.68, 1.1, { choca: true }); sprite(i + 3, SPR.muro, 1.68, 1.1, { choca: true }); }
    for (let i = p0 + 2; i < salidaI + 6; i += 5) {
      sprite(i, elige(r, SPR.publico), -1.78, 1.3); sprite(i + 2, elige(r, SPR.publico), 1.78, 1.3);
    }
    // Avisos de curva: donde una curva fuerte empieza a cerrarse.
    for (let i = p0 + 40; i < metaI; i++) {
      const c = segmentos[i].curva, ant = segmentos[i - 1].curva;
      if (Math.abs(c) >= 3.5 && Math.abs(ant) < 3.5 && Math.abs(c) > Math.abs(ant)) {
        const s = Math.sign(c);
        for (const k of [-30, -18]) sprite(i + k, SPR.senal[String(s)], -s * 1.35, 0.55, { choca: true });
      }
    }
    for (let i = p0 + 120; i < p1; i += 70) sprite(i, elige(r, SPR.publico), (r() < 0.5 ? -1 : 1) * 1.8, 1.3);

    // El centro: casas seguidas a los dos lados, faroles y gente.
    const centro0 = zonaDe('ambato')[0];
    for (let i = centro0; i < metaI + VISTA; i += 13) {
      const z = segmentos[i].zona;
      if (z === 'plaza') continue;
      for (const s of [-1, 1]) {
        const w = 2.1 + r() * 0.4;
        sprite(i + (s > 0 ? 6 : 0), elige(r, SPR.casas), s * (1.3 + w / 2), w, { choca: true });
      }
    }
    for (let i = centro0 + 4; i < metaI + 40; i += 11) { sprite(i, SPR.farol, -1.13, 0.22, { choca: true }); sprite(i + 5, SPR.farol, 1.13, 0.22, { choca: true }); }
    const [b0, b1] = zonaDe('bulevar');
    for (let i = b0; i < b1; i += 6) sprite(i + 3, elige(r, SPR.publico), (r() < 0.5 ? -1 : 1) * 1.58, 0.9);
    const [r0, r1] = zonaDe('ronda');
    for (let i = r0; i < r1; i += 9) sprite(i + 2, elige(r, SPR.publico), (r() < 0.5 ? -1 : 1) * 1.56, 0.85);
    // Las iglesias, en lugar de una casa.
    const quita = (i, s) => {
      for (let k = i - 14; k < i + 14; k++) {
        const seg = segmentos[k];
        if (seg) seg.sprites = seg.sprites.filter((p) => !(SPR.casas.includes(p.img) && Math.sign(p.x) === s));
      }
    };
    const [b0b] = zonaDe('bulevar');
    quita(b0b + 70, 1); sprite(b0b + 70, SPR.torres, 1.3 + 2.0, 4.0, { choca: true });
    const [g0, g1] = zonaDe('garcia');
    quita(g0 + 110, -1); sprite(g0 + 110, SPR.compania, -(1.3 + 1.9), 3.8, { choca: true });
    segmentos[g0 + 60].portal = 'arco';       // el Arco de la Reina
    // La Plaza Grande: la Catedral, Carondelet, palmeras y el gentío.
    for (let i = g1; i < metaI + VISTA; i += 8) {
      sprite(i, SPR.palmera, -(1.75 + r() * 0.5), 1.1, { choca: true, cw: 0.2 });
      if (i < metaI + 20) sprite(i + 4, elige(r, SPR.publico), 1.6, 0.95);
    }
    for (let i = g1 + 4; i < metaI + 30; i += 5) sprite(i, elige(r, SPR.publico), -1.58, 0.9);
    sprite(g1 + 20, SPR.catedral, 1.3 + 2.6, 5.2, { choca: true });
    sprite(metaI + 40, SPR.palacio, 0, 6.5);
    sprite(g1 + 10, SPR.palacio, -(1.3 + 4.2) - 1.2, 6.0, { choca: true });

    // En la calle: huecos y coladas.
    for (let i = centro0 + 40; i < metaI - 30; i += 45 + Math.floor(r() * 40)) {
      sprite(i, SPR.hueco, (r() - 0.5) * 1.3, 0.34, { tipo: 'hueco' });
    }
    for (let i = p0 + 140; i < p1; i += 110) sprite(i, SPR.hueco, (r() - 0.5) * 1.2, 0.3, { tipo: 'hueco' });
    const coladas = [p0 + 210, p0 + 470, centro0 + 260, zonaDe('bulevar')[0] + 120, r0 + 90, g0 + 20, g0 + 130];
    for (const i of coladas) {
      const lado = r() < 0.5 ? -1 : 1;
      for (let k = 0; k < 3; k++) sprite(i + k * 4, SPR.colada, lado * (0.15 + k * 0.25) * (k % 2 ? -1 : 1), 0.22, { tipo: 'colada' });
    }
  }

  // ─── el estado ──────────────────────────────────────────────────
  const lienzoEl = $('#pista');
  const ctx = lienzoEl.getContext('2d');
  let W = 0, H = 0, F = 0, HOR = 0, DPR = 1;
  const PROF = 1 / Math.tan((100 / 2) * Math.PI / 180);
  const JUG_Z = CAM_ALTO * PROF;

  const j = {};                 // el jugador
  let coches = [];
  let estado = 'portada';       // portada · cuenta · carrera · llegada · pausa
  let antes = 'carrera';
  let reloj = 0, cuenta = 0, tLlegada = 0;
  let inclina = 0, cieloX = 0, montesX = 0, laderasX = 0;
  let zonaActual = '';
  let sacudida = 0;
  const polvo = [];
  const teclas = { izq: false, der: false, patada: false, freno: false };

  function reinicia() {
    for (const s of segmentos) for (const p of s.sprites) { p.tomada = false; p.golpe = 0; }
    const z0 = salidaI * SEG;
    const parrilla = (k) => ({ x: k % 2 ? 0.42 : -0.42, d: z0 - Math.floor(k / 2) * SEG * 4 - (k % 2) * SEG * 1.4 });
    coches = RIVALES.map((p, k) => {
      const g = parrilla(k);
      return { p, x: g.x, carril: g.x, d: g.d, v: 0, llegada: 0, golpe: 0 };
    });
    const g = parrilla(5);
    Object.assign(j, { x: g.x, d: g.d, v: 0, aliento: 1, turbo: 0, llegada: 0, pie: 0, tPie: 0, golpe: 0 });
    reloj = 0; inclina = 0; zonaActual = ''; sacudida = 0; polvo.length = 0;
  }

  // ─── el sonido ──────────────────────────────────────────────────
  // Ruido filtrado que rueda, con un trémolo que en el empedrado se vuelve
  // traqueteo. Y unos pocos golpes cortos. Nada que cargar.
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
  function sonidoRodar(dt) {
    if (!son.ctx) return;
    const sp = estado === 'carrera' || estado === 'llegada' ? j.v / VMAX : 0;
    const empedrado = ZONAS[segmentoEn(j.d).zona].calle === 'adoquin';
    const t = son.ctx.currentTime;
    son.rodar.gain.setTargetAtTime(Math.min(0.32, sp * 0.3), t, 0.05);
    son.filtro.frequency.setTargetAtTime(180 + sp * 900, t, 0.05);
    son.lfo.frequency.setTargetAtTime(5 + sp * 34, t, 0.05);
    son.lfoAmp.gain.setTargetAtTime(empedrado ? 0.45 : 0.06, t, 0.1);
  }

  // ─── la simulación ──────────────────────────────────────────────
  const segmentoEn = (z) => segmentos[limita(Math.floor(z / SEG), 0, segmentos.length - 1)];
  const pendiente = (s) => (s.p2.mundo.y - s.p1.mundo.y) / SEG;
  const solapa = (x1, w1, x2, w2, p) => {
    const m = (p || 1) / 2;
    return !((x1 + w1 * m) < (x2 - w2 * m) || (x1 - w1 * m) > (x2 + w2 * m));
  };
  // Lo que aguanta una curva sin sacarte: la fuerza que te tira hacia fuera
  // crece con la velocidad al cuadrado, y el volante solo con la velocidad,
  // así que el giro empata con la curva justo en VMAX / (CENTRIFUGA · curva).
  const topeCurva = (c) => (Math.abs(c) < 1 ? TOPE : Math.min(TOPE, VMAX / (CENTRIFUGA * Math.abs(c)) * 0.98));

  function avisa(texto, dur) {
    const el = $('#aviso');
    el.textContent = texto; el.classList.add('is-on');
    clearTimeout(avisa.t); avisa.t = setTimeout(() => el.classList.remove('is-on'), dur || 1600);
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
      if (cuenta <= 0) { estado = 'carrera'; }
      return;
    }
    if (estado !== 'carrera' && estado !== 'llegada') return;
    if (estado === 'carrera') reloj += dt;

    const seg = segmentoEn(j.d);
    const sp = j.v / VMAX;
    const pend = pendiente(seg);
    const z = ZONAS[seg.zona];

    if (seg.zona !== zonaActual) {
      zonaActual = seg.zona;
      $('#h-zona').textContent = z.nombre;
      if (reloj > 1) avisa(z.nombre);
    }

    // Dirección y fuerza que tira hacia fuera en la curva.
    const mando = estado === 'llegada' ? 0 : (teclas.izq ? -1 : 0) + (teclas.der ? 1 : 0);
    const dx = dt * GIRO * Math.max(sp, 0.32);
    j.x += mando * dx;
    j.x -= dx * sp * seg.curva * CENTRIFUGA;
    j.giro = mezcla(j.giro || 0, mando, Math.min(1, dt * 10));

    // La cuesta, el roce y el aire.
    let a = -G * pend - ROCE - AIRE * j.v * j.v;
    const pateando = estado === 'carrera' && teclas.patada && !teclas.freno;
    if (pateando && j.v < PATADA_HASTA) {
      const fuerza = j.aliento > 0.02 ? 1 : 0.45;
      a += PATADA * fuerza * (1.6 - j.v / PATADA_HASTA);
      j.aliento = Math.max(0, j.aliento - dt * 0.12);
      j.tPie -= dt;
      if (j.tPie <= 0) { j.tPie = 0.2; j.pie = j.pie === -1 ? 1 : -1; tono(110, 0.08, 'sine', 0.2, 60); if (j.v > 400) echaPolvo(j.pie, 1); }
    } else {
      j.aliento = Math.min(1, j.aliento + dt * (j.v > PATADA_HASTA ? 0.14 : 0.09));
      j.pie = 0;
    }
    const frena = teclas.freno || estado === 'llegada';
    if (frena) {
      a -= j.v > 50 ? FRENO * (estado === 'llegada' ? 0.35 : 1) : 0;
      if (j.v > 1500 && Math.random() < 0.5) echaPolvo(0, 0.6);
    }
    if (j.turbo > 0) { j.turbo -= dt; a += TURBO; }
    const fuera = Math.abs(j.x) > 1;
    if (fuera && j.v > FUERA_HASTA) {
      a -= FUERA;
      sacudida = Math.max(sacudida, 0.5);
      if (Math.random() < 0.3) echaPolvo(Math.sign(j.x), 0.8);
    }
    j.v = limita(j.v + a * dt, 0, j.turbo > 0 ? TOPE_TURBO : TOPE);
    if (j.v > TOPE && j.turbo <= 0) j.v = Math.max(TOPE, j.v - 4000 * dt);
    j.x = limita(j.x, -2.4, 2.4);
    const dAntes = j.d;
    j.d += j.v * dt;

    // Choques con lo que hay a los lados y con lo que hay en la calle.
    const segN = segmentoEn(j.d);
    for (const s of [segN, segmentos[segN.i + 1]]) {
      if (!s) continue;
      for (const p of s.sprites) {
        if (p.tomada) continue;
        if (p.tipo === 'colada' && solapa(j.x, COCHE_W, p.x, p.w * 1.6)) {
          p.tomada = true; j.turbo = TURBO_T;
          j.aliento = Math.min(1, j.aliento + 0.35);
          tono(660, 0.12, 'triangle', 0.2); setTimeout(() => tono(990, 0.18, 'triangle', 0.2), 90);
          avisa('¡Colada morada!', 900);
        } else if (p.tipo === 'hueco' && solapa(j.x, COCHE_W, p.x, p.w, 0.8) && reloj - (p.golpe || -9) > 1) {
          p.golpe = reloj; j.v *= 0.55; sacudida = 1.4; golpe(0.7, 400); avisa('¡Hueco!', 700);
        } else if (p.choca && fuera && solapa(j.x, COCHE_W, p.x, p.cw || p.w, 0.9)) {
          j.v = Math.min(j.v, VMAX * 0.12);
          j.x -= Math.sign(j.x) * 0.2;
          j.d = dAntes; sacudida = 1.2; golpe(0.9, 300);
        }
      }
    }

    // Los rivales: la misma cuesta, su propia maña.
    for (const c of coches) actualizaRival(c, dt);
    // Con el jugador: si le alcanzas, te quedas a su velocidad; si te
    // alcanza él, te empuja.
    for (const c of coches) {
      const dd = c.d - j.d;
      if (Math.abs(dd) < SEG * 0.9 && solapa(j.x, COCHE_W, c.x, COCHE_W, 0.85)) {
        if (dd > 0 && j.v > c.v) {
          j.v = c.v * 0.94; j.d = c.d - SEG * 0.9; sacudida = 0.8; golpe(0.5, 900);
        } else if (dd < 0 && c.v > j.v) {
          c.v = j.v * 0.95; j.v += 400; c.d = j.d - SEG * 0.9;
        }
        c.x += (c.x > j.x ? 1 : -1) * dt * 1.5;
      }
    }

    if (j.golpe > 0) j.golpe -= dt;
    sacudida = Math.max(0, sacudida - dt * 2.4);
    for (let k = polvo.length - 1; k >= 0; k--) { const p = polvo[k]; p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t <= 0) polvo.splice(k, 1); }

    const metaZ = metaI * SEG;
    if (estado === 'carrera' && j.d >= metaZ) {
      j.llegada = reloj; estado = 'llegada'; tLlegada = 0;
      const delante = coches.filter((c) => c.llegada).length;
      j.puesto = delante + 1;
      tono(523, 0.15, 'triangle', 0.2); setTimeout(() => tono(659, 0.15, 'triangle', 0.2), 140); setTimeout(() => tono(784, 0.4, 'triangle', 0.22), 280);
    }
    if (estado === 'llegada') {
      tLlegada += dt;
      if (tLlegada > 2.2 && $('#llegada').hidden) muestraLlegada();
    }
  }

  function actualizaRival(c, dt) {
    const seg = segmentoEn(c.d);
    if (estado === 'carrera' || estado === 'llegada') {
      const hab = c.p.hab;
      let a = -G * pendiente(seg) - ROCE - AIRE * c.v * c.v / hab;
      // Patean sin cansarse, pero más flojo que tú: tú tienes el aliento.
      if (c.v < PATADA_HASTA) a += PATADA * 0.72 * hab * (1.6 - c.v / PATADA_HASTA);
      // Un poco de goma: nadie se escapa del todo ni se queda solo atrás.
      const ventaja = c.d - j.d;
      if (estado === 'carrera') {
        if (ventaja > SEG * 30) a -= 900;
        else if (ventaja < -SEG * 30) a += 350;
      }
      // Mira la curva que viene y frena para no salirse.
      let peor = 0;
      for (let k = 0; k < 30; k += 3) { const s = segmentos[seg.i + k]; if (s) peor = Math.max(peor, Math.abs(s.curva)); }
      const tope = topeCurva(peor) * (0.86 + 0.08 * hab);
      c.v += a * dt;
      if (c.v > tope) c.v = Math.max(tope, c.v - FRENO * 0.7 * dt);
      c.v = limita(c.v, 0, TOPE);
    }
    // El carril: esquiva al que va delante más lento, y si no, vuelve al suyo.
    let esquiva = 0;
    for (const o of [j, ...coches]) {
      if (o === c) continue;
      const dd = o.d - c.d;
      if (dd > 0 && dd < SEG * 14 && c.v > o.v && Math.abs(o.x - c.x) < COCHE_W * 1.1) {
        esquiva = o.x > c.x || c.x > 0.6 ? -1 : 1;
        if (c.x < -0.6) esquiva = 1;
        break;
      }
    }
    if (esquiva) c.x += esquiva * dt * 1.4;
    else {
      if (Math.random() < dt * 0.15) c.carril = (Math.random() - 0.5) * 1.2;
      c.x += limita(c.carril - c.x, -dt * 0.4, dt * 0.4);
    }
    c.x = limita(c.x, -0.8, 0.8);
    // Entre rivales, el de atrás se queda a la velocidad del de delante.
    for (const o of coches) {
      if (o === c) continue;
      const dd = o.d - c.d;
      if (dd > 0 && dd < SEG * 0.8 && solapa(c.x, COCHE_W, o.x, COCHE_W, 0.8) && c.v > o.v) c.v = o.v * 0.98;
    }
    c.d = Math.min(c.d + c.v * dt, (segmentos.length - VISTA) * SEG);
    if (!c.llegada && c.d >= metaI * SEG) c.llegada = reloj;
  }

  function echaPolvo(lado, fuerza) {
    if (quieto.matches || polvo.length > 60) return;
    const base = HOR + F;
    polvo.push({
      x: W / 2 + lado * F * 0.18 + (Math.random() - 0.5) * 20, y: base - 4,
      vx: (lado || (Math.random() - 0.5)) * 60 * fuerza, vy: -30 - Math.random() * 40,
      r: 6 + Math.random() * 8 * fuerza, t: 0.6, t0: 0.6,
    });
  }

  // ─── el dibujo ──────────────────────────────────────────────────
  function proyecta(p, camX, camY, camZ) {
    p.cam.x = -camX;
    p.cam.y = p.mundo.y - camY;
    p.cam.z = p.mundo.z - camZ;
    const e = p.pant.escala = PROF / p.cam.z;
    p.pant.x = W / 2 + e * p.cam.x * F;
    p.pant.y = HOR + inclina - e * p.cam.y * F;
    p.pant.w = e * ANCHO * F;
  }

  function poligono(x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill();
  }

  function dibujaSegmento(s, n) {
    // El borde de lejos sube medio píxel y el segmento de delante tapa al de
    // atrás: si no, entre segmento y segmento queda una raya del suavizado.
    const a = s.p1.pant, b = { x: s.p2.pant.x, y: s.p2.pant.y - 0.6, w: s.p2.pant.w };
    const z = ZONAS[s.zona];
    const calle = COLOR[z.calle], lado = COLOR[z.lado];
    ctx.fillStyle = s.claro ? lado.claro : lado.oscuro;
    ctx.fillRect(0, b.y, W, a.y - b.y);
    const r1 = a.w * 0.1, r2 = b.w * 0.1;
    const borde = calle.borde[s.claro ? 0 : 1];
    poligono(a.x - a.w - r1, a.y, a.x - a.w, a.y, b.x - b.w, b.y, b.x - b.w - r2, b.y, borde);
    poligono(a.x + a.w + r1, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x + b.w + r2, b.y, borde);
    poligono(a.x - a.w, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x - b.w, b.y, s.claro ? calle.claro : calle.oscuro);
    if (calle.linea && s.claro) {
      const l1 = a.w * 0.025, l2 = b.w * 0.025;
      poligono(a.x - l1, a.y, a.x + l1, a.y, b.x + l2, b.y, b.x - l2, b.y, calle.linea);
    }
    if (calle.junta && n < 140) {
      // El empedrado: una junta de lado a lado y unas cuantas a lo largo.
      ctx.fillStyle = calle.junta;
      ctx.fillRect(a.x - a.w, a.y - Math.max(1, a.w * 0.004), a.w * 2, Math.max(1, a.w * 0.006));
      if (n < 70) {
        for (const f of [-0.6, -0.2, 0.2, 0.6]) {
          const o = (s.i % 2 ? 0.1 : 0);
          const x1 = a.x + a.w * (f + o), x2 = b.x + b.w * (f + o), g1 = Math.max(0.6, a.w * 0.004), g2 = Math.max(0.6, b.w * 0.004);
          poligono(x1 - g1, a.y, x1 + g1, a.y, x2 + g2, b.y, x2 - g2, b.y, calle.junta);
        }
      }
    }
    // La neblina de la mañana se come lo lejano.
    const niebla = n / VISTA;
    if (niebla > 0.45) {
      ctx.globalAlpha = Math.min(0.9, ((niebla - 0.45) / 0.55) ** 1.6);
      ctx.fillStyle = NIEBLA; ctx.fillRect(0, b.y, W, a.y - b.y);
      ctx.globalAlpha = 1;
    }
  }

  function dibujaImagen(img, escala, x, y, w, clip, alfa) {
    const dw = w * escala * ANCHO * F;
    if (dw < 1.5) return;
    const dh = dw * img.height / img.width;
    const dx = x - dw / 2, dy = y - dh;
    if (dx > W || dx + dw < 0) return;
    const corte = Math.max(0, dy + dh - clip);
    if (corte >= dh) return;
    if (alfa < 1) ctx.globalAlpha = alfa;
    ctx.drawImage(img, 0, 0, img.width, img.height * (1 - corte / dh), dx, dy, dw, dh - corte);
    ctx.globalAlpha = 1;
  }

  // Lo que cruza la calle de lado a lado: la salida, la meta y el Arco de
  // la Reina. Se dibuja con la proyección del segmento, como un sprite.
  function dibujaPortal(s, alfa) {
    const p = s.p1.pant, e = p.escala;
    if (p.w < 4) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, s.clip); ctx.clip();
    ctx.globalAlpha = alfa;
    const alto = e * 2600 * F;
    const x = p.x, y = p.y, w = p.w;
    if (s.portal === 'arco') {
      const ext = w * 1.55, inn = w * 1.08, tope = y - alto * 1.25, luz = y - alto * 0.62;
      ctx.fillStyle = '#F2EEE5';
      ctx.beginPath();
      ctx.rect(x - ext, tope, ext * 2, y - tope);
      ctx.moveTo(x - inn, y); ctx.lineTo(x - inn, luz); ctx.ellipse(x, luz, inn, alto * 0.22, 0, Math.PI, 0); ctx.lineTo(x + inn, y); ctx.closePath();
      ctx.fill('evenodd');
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x + inn, tope, ext - inn, y - tope);
      ctx.fillStyle = '#A8442C';
      ctx.beginPath(); ctx.moveTo(x - ext - w * 0.08, tope); ctx.lineTo(x - ext + w * 0.2, tope - alto * 0.2); ctx.lineTo(x + ext - w * 0.2, tope - alto * 0.2); ctx.lineTo(x + ext + w * 0.08, tope); ctx.fill();
      ctx.fillStyle = '#1F4E9E';
      ctx.fillRect(x - w * 0.18, tope + alto * 0.12, w * 0.36, alto * 0.18);
      if (w > 60) {
        ctx.fillStyle = TINTA; ctx.font = `800 ${Math.round(w * 0.075)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('ARCO DE LA REINA', x, luz - alto * 0.3);
      }
    } else {
      const meta = s.portal === 'meta';
      const px = w * 1.18, pw = Math.max(2, w * 0.05), bh = alto * 0.22;
      ctx.fillStyle = '#6B4423';
      ctx.fillRect(x - px - pw, y - alto, pw * 2, alto); ctx.fillRect(x + px - pw, y - alto, pw * 2, alto);
      const by = y - alto;
      if (meta) {
        const n = 16, c = (px * 2) / n;
        for (let k = 0; k < n; k++) for (let f = 0; f < 2; f++) {
          ctx.fillStyle = (k + f) % 2 ? '#FFFFFF' : TINTA;
          ctx.fillRect(x - px + k * c, by + f * bh / 2, c + 0.5, bh / 2 + 0.5);
        }
      } else {
        ctx.fillStyle = '#D6382B'; ctx.fillRect(x - px, by, px * 2, bh);
        ctx.fillStyle = '#1F4E9E'; ctx.fillRect(x - px, by + bh * 0.82, px * 2, bh * 0.18);
      }
      if (bh > 10) {
        const t = meta ? 'META · PLAZA GRANDE' : 'SALIDA · EL PANECILLO';
        ctx.font = `800 ${Math.round(bh * 0.5)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(t).width;
        if (meta) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x - tw / 2 - bh * 0.3, by + bh * 0.12, tw + bh * 0.6, bh * 0.76); }
        ctx.fillStyle = meta ? TINTA : '#FFFFFF';
        ctx.fillText(t, x, by + bh * 0.5);
      }
    }
    ctx.restore();
  }

  function dibujaCoche(img, escala, x, y, clip, giro, salto, nombre) {
    const dw = COCHE_W * escala * ANCHO * F;
    if (dw < 2) return;
    const dh = dw * img.height / img.width;
    if (y - dh > clip) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, clip); ctx.clip();
    ctx.translate(x, y - salto);
    ctx.rotate(giro * 0.07);
    ctx.drawImage(img, -dw / 2, -dh, dw, dh);
    ctx.restore();
    if (nombre && dw > 46 && dw < 220 && y - dh - 6 < clip) {
      ctx.font = `700 ${Math.round(limita(dw * 0.13, 10, 15))}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(42,33,24,.85)'; ctx.fillStyle = '#FFFFFF';
      ctx.strokeText(nombre, x, y - dh - 4); ctx.fillText(nombre, x, y - dh - 4);
    }
  }

  // ─── el fondo: el Pichincha y las laderas con sus casitas ───────
  const FONDO = {};
  function pintaFondo() {
    const r = azar(99);
    const LW = 2400;
    const onda = (x, ks) => ks.reduce((t, [k, a, f]) => t + a * Math.sin((x / LW) * Math.PI * 2 * k + f), 0);
    FONDO.montes = lienzo(LW, 420, (c, w, h) => {
      const g = c.createLinearGradient(0, 60, 0, h);
      g.addColorStop(0, '#7E98AC'); g.addColorStop(1, '#9DB3BF');
      c.fillStyle = g; c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        const pico = 150 * Math.exp(-(((x - 700) / 260) ** 2)) + 90 * Math.exp(-(((x - 1050) / 180) ** 2)) + 70 * Math.exp(-(((x - 1900) / 300) ** 2));
        c.lineTo(x, 300 - pico - onda(x, [[3, 22, 0.4], [7, 10, 1.3], [13, 5, 2.1]]));
      }
      c.lineTo(w, h); c.fill();
      // el poco de nieve que a veces tiene arriba
      c.fillStyle = 'rgba(255,255,255,.55)';
      c.beginPath(); c.moveTo(640, 160); c.lineTo(700, 140); c.lineTo(760, 165); c.lineTo(720, 160); c.lineTo(690, 172); c.fill();
    });
    FONDO.laderas = lienzo(LW, 300, (c, w, h) => {
      const borde = (x) => 120 - onda(x, [[2, 40, 0.9], [5, 18, 2.4], [11, 8, 0.2]]);
      c.fillStyle = '#8FA675'; c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) c.lineTo(x, borde(x));
      c.lineTo(w, h); c.fill();
      // las casitas que trepan por la ladera
      const tonos = ['#F2EEE5', '#EAD9B0', '#E8C9C0', '#C9DCE6', '#F3E3D3', '#D8D2C2', '#E6B98F'];
      for (let k = 0; k < 1400; k++) {
        const x = r() * w, y0 = borde(x) + 10, y = y0 + r() ** 0.7 * (h - y0);
        const s = 4 + (y / h) * 7;
        c.fillStyle = elige(r, tonos); c.fillRect(x, y, s * 1.4, s);
        c.fillStyle = '#A8442C'; c.fillRect(x - 1, y - 2, s * 1.4 + 2, 2.5);
      }
    });
    FONDO.nubes = lienzo(LW, 200, (c, w) => {
      c.fillStyle = 'rgba(255,255,255,.85)';
      for (let k = 0; k < 9; k++) {
        const x = (k / 9) * w + r() * 120, y = 40 + r() * 100, s = 30 + r() * 30;
        for (let b = 0; b < 5; b++) { c.beginPath(); c.ellipse(x + b * s * 0.7, y + Math.sin(b) * 8, s, s * 0.55, 0, 0, 7); c.fill(); }
      }
    });
  }

  function capa(img, desplaza, base, alto) {
    const ew = alto / img.height * img.width;
    let x = -((desplaza * ew) % ew);
    if (x > 0) x -= ew;
    for (; x < W; x += ew) ctx.drawImage(img, x, base - alto, ew + 1, alto);
  }

  function dibujaFondo() {
    const hor = HOR + inclina;
    const cielo = ctx.createLinearGradient(0, 0, 0, Math.max(1, hor));
    cielo.addColorStop(0, '#5E9BD0'); cielo.addColorStop(0.7, '#A9CBE2'); cielo.addColorStop(1, '#DCE9EF');
    ctx.fillStyle = cielo; ctx.fillRect(0, 0, W, Math.max(0, hor) + 2);
    const u = Math.max(W, H);
    capa(FONDO.nubes, cieloX, hor - u * 0.12, u * 0.14);
    capa(FONDO.montes, montesX, hor + u * 0.01, u * 0.2);
    capa(FONDO.laderas, laderasX, hor + u * 0.03, u * 0.13);
    ctx.fillStyle = '#9DB08A'; ctx.fillRect(0, hor + u * 0.03 - 1, W, H);
  }

  function dibuja() {
    const segBase = segmentoEn(j.d - JUG_Z);
    const posicion = j.d - JUG_Z;
    const pctBase = (posicion % SEG) / SEG;
    const segJ = segmentoEn(j.d);
    const pctJ = (j.d % SEG) / SEG;
    const jugY = mezcla(segJ.p1.mundo.y, segJ.p2.mundo.y, pctJ);

    // La cámara cabecea con la cuesta: mira hacia abajo cuando se baja.
    const adelante = segmentos[Math.min(segJ.i + 14, segmentos.length - 1)];
    // Solo a medias: si compensara del todo, la bajada se vería plana.
    const objetivo = limita((pendiente(segJ) * 0.4 + pendiente(adelante) * 0.6) * F * 0.45, -H * 0.2, H * 0.16);
    inclina = mezcla(inclina, objetivo, 0.08);

    const tiembla = sacudida * 4 + (ZONAS[segJ.zona].calle === 'adoquin' ? j.v / VMAX * 1.8 : 0);
    const ox = quieto.matches ? 0 : (Math.random() - 0.5) * tiembla;
    const oy = quieto.matches ? 0 : (Math.random() - 0.5) * tiembla;

    ctx.save();
    ctx.translate(ox, oy);
    dibujaFondo();

    let maxy = H;
    let x = 0, dx = -(segBase.curva * pctBase);
    const fin = Math.min(segmentos.length, segBase.i + VISTA);
    for (let i = segBase.i, n = 0; i < fin; i++, n++) {
      const s = segmentos[i];
      s.clip = maxy;
      proyecta(s.p1, j.x * ANCHO - x, jugY + CAM_ALTO, posicion);
      proyecta(s.p2, j.x * ANCHO - x - dx, jugY + CAM_ALTO, posicion);
      x += dx; dx += s.curva;
      s.visto = !(s.p1.cam.z <= PROF || s.p2.pant.y >= s.p1.pant.y || s.p2.pant.y >= maxy);
      if (s.visto) maxy = s.p1.pant.y;
    }
    // La calle se pinta de lejos a cerca, para que cada segmento tape el
    // borde suavizado del de detrás.
    for (let i = fin - 1; i >= segBase.i; i--) if (segmentos[i].visto) dibujaSegmento(segmentos[i], i - segBase.i);

    // De atrás hacia delante: los sprites, los coches y al final tú.
    const porSeg = new Map();
    for (const c of coches) {
      const i = Math.floor(c.d / SEG);
      if (!porSeg.has(i)) porSeg.set(i, []);
      porSeg.get(i).push(c);
    }
    const t = performance.now() / 1000;
    // Los huecos son planos, están en el suelo: van antes que todo lo que
    // está de pie, o el de detrás de la cámara taparía las ruedas.
    for (let i = fin - 1; i >= segBase.i; i--) {
      const s = segmentos[i];
      if (s.p1.cam.z <= PROF) continue;
      for (const p of s.sprites) {
        if (p.tipo !== 'hueco') continue;
        const e = s.p1.pant.escala;
        dibujaImagen(p.img, e, s.p1.pant.x + e * p.x * ANCHO * F, s.p1.pant.y + e * F * 30, p.w, s.clip, 1);
      }
    }
    for (let i = fin - 1; i >= segBase.i; i--) {
      const s = segmentos[i];
      const n = i - segBase.i;
      if (s.p1.cam.z <= PROF) continue;
      const alfa = n > VISTA * 0.6 ? Math.max(0, 1 - (n - VISTA * 0.6) / (VISTA * 0.4)) : 1;
      const e = s.p1.pant.escala;
      const orden = s.sprites.slice().sort((a, b) => Math.abs(b.x) - Math.abs(a.x));
      for (const p of orden) {
        if (p.tomada || p.tipo === 'hueco') continue;
        const sx = s.p1.pant.x + e * p.x * ANCHO * F;
        let sy = s.p1.pant.y;
        if (p.tipo === 'colada') sy -= e * F * (180 + Math.sin(t * 4 + i) * 50);
        dibujaImagen(p.img, e, sx, sy, p.w, s.clip, alfa);
      }
      if (s.portal) dibujaPortal(s, alfa);
      const aqui = porSeg.get(i);
      if (aqui) {
        for (const c of aqui) {
          const pct = (c.d % SEG) / SEG;
          const ce = mezcla(s.p1.pant.escala, s.p2.pant.escala, pct);
          const cx = mezcla(s.p1.pant.x, s.p2.pant.x, pct) + ce * c.x * ANCHO * F;
          const cy = mezcla(s.p1.pant.y, s.p2.pant.y, pct);
          const pataleo = c.v < PATADA_HASTA && estado === 'carrera' ? (Math.floor(t * 5 + c.p.num) % 2 ? 'izq' : 'der') : 'quieto';
          dibujaCoche(c.p.spr[pataleo], ce, cx, cy, s.clip, 0, 0, c.p.nombre);
        }
      }
      if (s === segJ) {
        const e2 = PROF / JUG_Z;
        const camY = mezcla(segJ.p1.cam.y, segJ.p2.cam.y, pctJ);
        const py = HOR + inclina - e2 * camY * F;
        const empedrado = ZONAS[segJ.zona].calle === 'adoquin';
        const salto = quieto.matches ? 0 : (Math.random() * (empedrado ? 2.6 : 0.8) * (j.v / VMAX)) + sacudida * 3;
        const img = (teclas.freno && estado === 'carrera') || estado === 'llegada' ? TU.spr.freno : j.pie === -1 ? TU.spr.izq : j.pie === 1 ? TU.spr.der : TU.spr.quieto;
        dibujaCoche(img, e2, W / 2, py, H * 2, j.giro, salto, '');
      }
    }

    // Polvo de las suelas.
    for (const p of polvo) {
      ctx.globalAlpha = (p.t / p.t0) * 0.55;
      ctx.fillStyle = '#E8DCC6';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - p.t / p.t0), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Rayas de velocidad en los bordes cuando la cosa se pone seria.
    const sp = j.v / VMAX;
    if (!quieto.matches && (sp > 0.95 || j.turbo > 0)) {
      const fuerza = j.turbo > 0 ? 1 : (sp - 0.95) / 0.2;
      ctx.strokeStyle = j.turbo > 0 ? 'rgba(180,120,220,.5)' : 'rgba(255,255,255,.4)';
      ctx.lineWidth = 2;
      const cx = W / 2, cy = HOR + inclina;
      for (let k = 0; k < 14 * fuerza; k++) {
        const a = Math.random() * Math.PI * 2, r0 = Math.max(W, H) * (0.45 + Math.random() * 0.2);
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.7);
        ctx.lineTo(cx + Math.cos(a) * r0 * 1.25, cy + Math.sin(a) * r0 * 0.875); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ─── el HUD ─────────────────────────────────────────────────────
  const hud = {
    puesto: $('#h-puesto'), tiempo: $('#h-tiempo'), vel: $('#h-vel'),
    aliento: $('#h-aliento > i'), alientoBarra: $('#h-aliento'), ruta: $('#h-ruta > i'), turbo: $('#h-turbo'),
  };
  const formato = (t) => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  };
  let ultimoHud = {};
  function pintaHud() {
    const puesto = estado === 'llegada' ? j.puesto : 1 + coches.filter((c) => c.d > j.d).length;
    const datos = {
      puesto: String(puesto),
      tiempo: formato(estado === 'llegada' ? j.llegada : reloj),
      vel: String(Math.round(j.v * KMH)),
      aliento: `${Math.round(j.aliento * 100)}%`,
      ruta: `${Math.round(limita((j.d - salidaI * SEG) / ((metaI - salidaI) * SEG), 0, 1) * 100)}%`,
    };
    if (datos.puesto !== ultimoHud.puesto) hud.puesto.textContent = datos.puesto;
    if (datos.tiempo !== ultimoHud.tiempo) hud.tiempo.textContent = datos.tiempo;
    if (datos.vel !== ultimoHud.vel) hud.vel.textContent = datos.vel;
    if (datos.aliento !== ultimoHud.aliento) {
      hud.aliento.style.width = datos.aliento;
      hud.alientoBarra.style.setProperty('--mal-relleno-medidor', j.aliento < 0.2 ? 'var(--mal-error, #D6382B)' : '');
    }
    if (datos.ruta !== ultimoHud.ruta) hud.ruta.style.width = datos.ruta;
    hud.turbo.hidden = !(j.turbo > 0);
    ultimoHud = datos;
  }

  // ─── la llegada ─────────────────────────────────────────────────
  const PUESTOS = ['Primer puesto', 'Segundo puesto', 'Tercer puesto', 'Cuarto puesto', 'Quinto puesto', 'Sexto puesto'];
  const FRASES = [
    'Llegaste primero a la Plaza Grande. Ni el Chulla te vio pasar.',
    'Segundo, por una tabla. La próxima, más patada en la García Moreno.',
    'Al podio. La horquilla del Panecillo se puede bajar más rápido.',
    'Cuarto. Las coladas moradas no están de adorno.',
    'Quinto. Frena antes de las curvas, no en medio.',
    'Último, pero entero, que en coche de madera ya es bastante.',
  ];
  function muestraLlegada() {
    const p = j.puesto;
    $('#l-puesto').textContent = PUESTOS[p - 1];
    $('#l-desc').textContent = `Bajaste en ${formato(j.llegada)}. ${FRASES[p - 1]}`;
    $('#disco-trofeo').style.display = p <= 3 ? '' : 'none';
    $('#disco-coche').setAttribute('transform', p <= 3 ? '' : 'translate(-30 -86) scale(1.4)');
    // La tabla: los que llegaron con su tiempo; a los que faltan se les
    // calcula lo que les queda a la velocidad que llevan.
    const filas = coches.map((c) => ({
      nombre: c.p.nombre,
      t: c.llegada || reloj + Math.max(0, metaI * SEG - c.d) / Math.max(c.v, 3000),
    }));
    filas.push({ nombre: 'Tú', t: j.llegada, tu: true });
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
    try { record = parseFloat(localStorage.getItem('coches-record')); } catch (e) { /* sin almacenamiento */ }
    if (!record || j.llegada < record) {
      try { localStorage.setItem('coches-record', String(j.llegada)); } catch (e) { /* sin almacenamiento */ }
      if (record) $('#l-kicker').textContent = 'Plaza Grande · ¡récord nuevo!';
      else $('#l-kicker').textContent = 'Plaza Grande';
    } else $('#l-kicker').textContent = `Plaza Grande · tu récord: ${formato(record)}`;
    $('#hud').hidden = true; $('#mandos').hidden = true;
    $('#llegada').hidden = false;
    $('#llegada').focus();
  }

  function muestraRecord() {
    let record = null;
    try { record = parseFloat(localStorage.getItem('coches-record')); } catch (e) { /* sin almacenamiento */ }
    $('#record').textContent = record ? `Tu mejor bajada: ${formato(record)}` : '';
  }

  // ─── el flujo ───────────────────────────────────────────────────
  function empieza() {
    arrancaSonido();
    reinicia();
    $('#portada').hidden = true; $('#pausa').hidden = true; $('#llegada').hidden = true;
    $('#hud').hidden = false;
    $('#mandos').hidden = !esTactil;
    estado = 'cuenta'; cuenta = 3; actualiza.n = null;
    $('#h-zona').textContent = ZONAS.panecillo.nombre;
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
  $('#llegada').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); empieza(); } });
  $('#b-sonido').addEventListener('click', (e) => {
    son.mudo = !son.mudo;
    e.currentTarget.setAttribute('aria-pressed', String(son.mudo));
    e.currentTarget.setAttribute('aria-label', son.mudo ? 'Activar el sonido' : 'Silenciar');
    e.currentTarget.style.opacity = son.mudo ? 0.5 : '';
    if (son.salida) son.salida.gain.value = son.mudo ? 0 : 0.8;
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pausa(); });

  // Teclado.
  const MAPA = {
    ArrowLeft: 'izq', KeyA: 'izq', ArrowRight: 'der', KeyD: 'der',
    ArrowUp: 'patada', KeyW: 'patada', Space: 'patada', ArrowDown: 'freno', KeyS: 'freno',
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') { estado === 'pausa' ? sigue() : pausa(); return; }
    const t = MAPA[e.code];
    if (!t) return;
    if (estado === 'portada' || estado === 'llegada' || estado === 'pausa') return;
    e.preventDefault();
    teclas[t] = true;
  });
  addEventListener('keyup', (e) => { const t = MAPA[e.code]; if (t) teclas[t] = false; });
  addEventListener('blur', () => { for (const k in teclas) teclas[k] = false; });

  // Mandos táctiles: cada dedo tiene su botón y lo suelta donde quiera.
  let esTactil = tactilMQ.matches;
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
    const on = (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); teclas[t] = true; b.classList.add('is-on'); };
    const off = () => { teclas[t] = false; b.classList.remove('is-on'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('lostpointercapture', off);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ─── el tamaño y el bucle ───────────────────────────────────────
  function mide() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    lienzoEl.width = Math.round(W * DPR); lienzoEl.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    HOR = H * (W < H ? 0.42 : 0.5);
    F = Math.min(W / 2, (H - HOR) * 0.82);
  }
  addEventListener('resize', mide);

  let previo = performance.now(), acum = 0;
  const PASO = 1 / 60;
  function bucle(ahora) {
    const dt = Math.min(0.1, (ahora - previo) / 1000);
    previo = ahora;
    if (estado !== 'pausa') {
      acum += dt;
      while (acum >= PASO) { actualiza(PASO); acum -= PASO; }
      const segJ = segmentoEn(j.d);
      const sp = j.v / VMAX;
      cieloX += dt * 0.004 + segJ.curva * sp * dt * 0.0016;
      montesX += segJ.curva * sp * dt * 0.0035;
      laderasX += segJ.curva * sp * dt * 0.006;
      dibuja();
      if (estado === 'carrera' || estado === 'llegada') pintaHud();
      sonidoRodar(dt);
    }
    requestAnimationFrame(bucle);
  }

  pintaSprites();
  construye();
  pintaFondo();
  reinicia();
  mide();
  muestraRecord();
  raiz.classList.add('coches-listo');
  requestAnimationFrame(bucle);

  // Para probar desde la consola sin jugar entero.
  window.coches = {
    estado: () => ({ estado, reloj, v: j.v, d: j.d, x: j.x, puesto: j.puesto, zona: segmentoEn(j.d).zona, metaZ: metaI * SEG }),
    curva: (z) => segmentoEn(z).curva, topeCurva, empieza, teclas,
  };
})();
