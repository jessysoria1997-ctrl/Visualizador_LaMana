/* ============================================================================
   lamana.js — ELECTORES · LA MANÁ (dentro de Preinscritos)

   Bloque añadido bajo el mapa de Preinscritos. Aparece solo cuando el
   territorio seleccionado es el cantón La Maná y reúne, desde las bases del
   CNE y el distributivo del cantón (data/lamana.json, generado con
   preparar_lamana.py):

     · juntas receptoras del voto: total, femeninas y masculinas
     · recintos electorales por parroquia, en una pestaña plegable: cerrada
       al empezar; al abrirla muestra la lista y sus puntos en el mapa de
       Preinscritos, y al cerrarla retira las dos cosas

   No cambia nada de lo que ya existía: ni el panel de análisis territorial
   (electores y electores por 100 mil), ni los filtros, ni el mapa, que solo
   gana una capa de puntos mientras la pestaña de recintos está abierta.
   ========================================================================== */

const LAMANA = {
  archivo: 'data/lamana.json',
  provK: 'COTOPAXI',
  cantK: 'LA MANA',
  datos: null,
  carga: null,          // promesa de la descarga, para pedir el archivo una vez
  pintado: false,
  capa: null,           // puntos de los recintos
  visibles: false       // pestaña de recintos abierta (lista y puntos)
};

function esLaMana() {
  return typeof ESTADO !== 'undefined' &&
         ESTADO.provK === LAMANA.provK && ESTADO.cantK === LAMANA.cantK;
}

/** Descarga la base del cantón una sola vez; null si el archivo no está. */
function cargarLaMana() {
  if (!LAMANA.carga) {
    LAMANA.carga = fetch(LAMANA.archivo, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(j => { LAMANA.datos = j; return j; });
  }
  return LAMANA.carga;
}

/**
 * Se llama en cada repintado de Preinscritos (ver render() en app.js).
 * Muestra el bloque con La Maná seleccionado y lo retira —con sus puntos—
 * al elegir cualquier otro territorio.
 */
function actualizarLaMana() {
  const bloque = document.getElementById('bloque-lamana');
  if (!bloque) return;

  /* Cualquier fallo aquí se queda aquí: el bloque es un añadido y no debe
     interrumpir el repintado del resto de Preinscritos. */
  const aislado = (fn) => { try { fn(); } catch (e) {
    console.warn('[Dashboard] bloque de electores del cantón omitido:', e);
    bloque.hidden = true;
  } };

  if (!esLaMana()) {
    aislado(() => { bloque.hidden = true; ponerRecintos(false); });
    return;
  }

  cargarLaMana().then(d => aislado(() => {
    if (!d || !esLaMana()) { bloque.hidden = true; return; }
    if (!LAMANA.pintado) {
      pintarLaMana(d);
      const tab = document.getElementById('lm-recintos-tab');
      if (tab) tab.onclick = () => aislado(() => ponerRecintos(!LAMANA.visibles));
      LAMANA.pintado = true;
    }
    bloque.hidden = false;
    ponerRecintos(LAMANA.visibles);
  }));
}


/* ============================================================================
   CONTENIDO DEL BLOQUE
   ========================================================================== */

const lmEsc = (s) => (typeof escaparHTML === 'function')
  ? escaparHTML(s)
  : String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const lmNombreParroquia = (k) => tituloCase(k);

function pintarLaMana(d) {
  const j = d.juntas;
  const pct = (n) => j.total ? fmtPct(n * 100 / j.total) + ' de las juntas' : '—';
  const nParr = new Set(d.recintos.map(r => r.parroquia)).size;

  /* — Resumen: mismas tarjetas que los indicadores de la sección — */
  document.getElementById('lm-kpis').innerHTML = `
    <article class="kpi destacado">
      <p class="kpi-etq">Juntas receptoras</p>
      <p class="kpi-val">${fmtNum(j.total)}</p>
      <p class="kpi-sub">Total del cantón</p>
    </article>
    <article class="kpi">
      <p class="kpi-etq">Juntas femeninas</p>
      <p class="kpi-val">${fmtNum(j.femeninas)}</p>
      <p class="kpi-sub">${pct(j.femeninas)}</p>
    </article>
    <article class="kpi">
      <p class="kpi-etq">Juntas masculinas</p>
      <p class="kpi-val">${fmtNum(j.masculinas)}</p>
      <p class="kpi-sub">${pct(j.masculinas)}</p>
    </article>
    <article class="kpi">
      <p class="kpi-etq">Recintos electorales</p>
      <p class="kpi-val">${fmtNum(d.recintos.length)}</p>
      <p class="kpi-sub">En ${fmtNum(nParr)} parroquias</p>
    </article>`;

  /* — Recintos por parroquia, en una pestaña plegable —
       La cabecera es el botón: abre y cierra la lista y, con ella, los puntos
       del mapa. Empieza cerrada. */
  const porParr = new Map();
  d.recintos.forEach(r => {
    if (!porParr.has(r.parroquia)) porParr.set(r.parroquia, []);
    porParr.get(r.parroquia).push(r);
  });
  document.getElementById('lm-recintos').innerHTML = `
    <header class="lm-col-cab lm-tab-cab">
      <h3 class="lm-col-tit">
        <button type="button" class="lm-tab" id="lm-recintos-tab"
                aria-expanded="false" aria-controls="lm-recintos-cuerpo"
                title="Mostrar u ocultar los recintos en la lista y en el mapa">
          <span class="lm-tab-nombre">Recintos electorales</span>
          <span class="lm-tab-der">
            <span class="lm-cuenta">${fmtNum(d.recintos.length)}</span>
            <svg class="lm-tab-ico" width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round"
                 stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          </span>
        </button>
      </h3>
    </header>
    <div class="lm-plegable" id="lm-recintos-cuerpo" role="region" aria-labelledby="lm-recintos-tab">
      <div class="lm-plegable-in">
        ${[...porParr.entries()].map(([k, rs]) => `
          <section class="lm-grupo">
            <div class="lm-grupo-cab"><b>${lmEsc(lmNombreParroquia(k))}</b>
              <span>${fmtNum(rs.length)} ${rs.length === 1 ? 'recinto' : 'recintos'}</span></div>
            <ol class="lm-lista lm-recintos">${rs.map(r => `
              <li><div class="lm-persona"><b>${lmEsc(r.nombre)}</b></div>
                <em title="Juntas receptoras">${fmtNum(r.juntas)} JRV</em></li>`).join('')}</ol>
          </section>`).join('')}
        <p class="lm-nota">Fuente: DISTRIBUTIVO_LAMANA. JRV: juntas receptoras del voto.</p>
      </div>
    </div>`;
}


/* ============================================================================
   PUNTOS DE LOS RECINTOS EN EL MAPA
   Solo mientras la pestaña de recintos está abierta. Puntos pequeños y
   suaves: señalan la ubicación sin tapar el color del territorio.
   ========================================================================== */

const LM_PUNTO = { radio: 3.5, radioActivo: 5 };

function capaRecintos() {
  if (LAMANA.capa || !LAMANA.datos || typeof MAPA === 'undefined' || !MAPA.map) return LAMANA.capa;
  if (!MAPA.map.getPane('paneRecintos')) {
    /* Por encima de rellenos, divisiones y selección; debajo de las etiquetas. */
    MAPA.map.createPane('paneRecintos').style.zIndex = 445;
  }
  LAMANA.capa = L.layerGroup(LAMANA.datos.recintos.map(r =>
    L.circleMarker([r.lat, r.lon], {
      pane: 'paneRecintos', radius: LM_PUNTO.radio, bubblingMouseEvents: false,
      fill: true, fillColor: CONFIG.paleta.seleccion, fillOpacity: 0.72,
      stroke: true, color: '#FFFFFF', weight: 1, opacity: 0.9
    }).bindTooltip(() => `
      <div class="tt"><div class="tt-titulo">${lmEsc(r.nombre)}</div>
        <div class="tt-sub">${lmEsc(lmNombreParroquia(r.parroquia))}${r.direccion ? ' · ' + lmEsc(r.direccion) : ''}</div>
        <div class="tt-metricas">
          <div><span>Juntas receptoras</span><b>${fmtNum(r.juntas)}</b></div>
          <div><span>Femeninas · masculinas</span><b>${fmtNum(r.juntasF)} · ${fmtNum(r.juntasM)}</b></div>
          <div><span>Electores</span><b>${fmtNum(r.electores)}</b></div>
        </div></div>`,
      { sticky: true, direction: 'top', className: 'tt-wrap', opacity: 1 })
    .on('mouseover', e => e.target.setStyle({ radius: LM_PUNTO.radioActivo, fillOpacity: 0.95 }))
    .on('mouseout', e => e.target.setStyle({ radius: LM_PUNTO.radio, fillOpacity: 0.72 }))));
  return LAMANA.capa;
}

/** Abre o cierra la pestaña de recintos: lista y puntos van juntos. */
function ponerRecintos(ver) {
  LAMANA.visibles = !!ver && esLaMana() && !!LAMANA.datos;

  const col = document.getElementById('lm-recintos');
  const tab = document.getElementById('lm-recintos-tab');
  if (col) col.classList.toggle('abierto', LAMANA.visibles);
  if (tab) tab.setAttribute('aria-expanded', String(LAMANA.visibles));

  if (typeof MAPA === 'undefined' || !MAPA.map) return;
  if (LAMANA.visibles) {
    const capa = capaRecintos();
    if (capa && !MAPA.map.hasLayer(capa)) capa.addTo(MAPA.map);
  } else if (LAMANA.capa && MAPA.map.hasLayer(LAMANA.capa)) {
    MAPA.map.removeLayer(LAMANA.capa);
  }
}
