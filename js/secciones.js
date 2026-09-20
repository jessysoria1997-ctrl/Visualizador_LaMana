/* ============================================================================
   secciones.js — GRUPO ETARIO (en Preinscritos) · HISTÓRICO ELECTORAL

   Dos añadidos al dashboard, sin tocar lo que ya funcionaba:

     · Un bloque de grupo etario al final de la página de Preinscritos, que
       responde a los filtros de provincia y cantón de esa misma página.
     · La sección Histórico electoral, que reúne la evolución 2004–2023, los
       resultados de la última elección y dos mapas de diagnóstico.

   Sin selectores de año: los años se comparan solos dentro de cada gráfico.
   Lo demográfico es siempre 2027 y no depende de ningún año electoral.
   ========================================================================== */

const SEC = {
  activa: 'preinscritos',
  cargando: false,
  listas: { historico: false, postulantes: false, etario: false },
  filtros: {
    historico: { dignidad: 'ALCALDES', provK: '', cantK: '', parrK: '' },
    etario: { grupo: 0 }          // vive en Preinscritos; sin año, siempre 2027
  },
  /* Año y variable del mapa electoral. Viven aquí y solo afectan al mapa:
     ningún otro gráfico, tarjeta o tabla depende de ellos. */
  mapa: { anio: null, variable: 'pctValidos' },
  mapas: { electoral: null },
  /* Concejal o vocal elegido en el histórico al pasar a Preinscritos. */
  dignidadSoloHistorico: null,
  cacheParr: new Map(),
  graficos: {}
};

const HIST = { anios: [], etiquetas: {}, organizaciones: [], provincias: [],
               cantones: [], parroquias: [], votos: {}, nuloblanco: {},
               iProv: new Map(), iCant: new Map(), iParr: new Map(), iAnio: new Map() };
const POST = { anios: [], niveles: {} };
const ETARIO = { anio: 2027, grupos: [], pais: [], provincias: {}, cantones: {},
                 exterior: [] };

const AÑO_DEMOGRAFICO = 2027;   // fijo por definición
const AVISO_CANTONAL = 'Este mapa está disponible únicamente hasta nivel cantonal.';


/* ============================================================================
   ARRANQUE Y NAVEGACIÓN
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => setTimeout(prepararSecciones, 0));

async function prepararSecciones() {
  /* Espera a que haya sesión: el alcance del usuario decide qué se carga. */
  if (typeof iniciarAcceso === 'function') await iniciarAcceso();

  const nav = document.getElementById('nav-secciones');
  if (nav) {
    nav.querySelectorAll('[data-seccion]').forEach(b => {
      b.addEventListener('click', () => activarSeccion(b.dataset.seccion));
    });
  }
  /* El padrón etario pesa 10 KB y forma parte de la primera página, así que
     se trae de inmediato en vez de esperar a un cambio de sección. */
  if (await cargarBase('etario')) actualizarEtario();
}

async function activarSeccion(id) {
  if (SEC.activa === id || SEC.cargando) return;
  SEC.activa = id;

  document.querySelectorAll('[data-seccion]').forEach(b =>
    b.classList.toggle('activa', b.dataset.seccion === id));
  ['preinscritos', 'historico'].forEach(v => {
    const vista = document.getElementById('vista-' + v);
    const panel = document.getElementById('filtros-' + v);
    if (vista) vista.hidden = v !== id;
    if (panel) panel.hidden = v !== id;
  });

  if (id === 'preinscritos') {
    sincronizarHaciaPreinscritos();
    /* El mapa estuvo oculto: Leaflet necesita remedir su contenedor. */
    if (MAPA.map) setTimeout(() => MAPA.map.invalidateSize(), 30);
    if (typeof aplicarTemaDignidad === 'function') aplicarTemaDignidad();
    return;
  }

  SEC.cargando = true;
  mostrarProgreso(true);
  try {
    await cargarBase('historico');
    await cargarBase('postulantes');
    sincronizarDesdePreinscritos();
    if (typeof aplicarAlcanceEstado === 'function') aplicarAlcanceEstado();
    construirPanelHistorico();
    renderHistorico();
  } catch (e) {
    mostrarError('No se pudo abrir la sección de histórico electoral.', e);
  } finally {
    SEC.cargando = false;
    mostrarProgreso(false);
  }
}

/* ---------------------------------------------------------------------------
   SINCRONIZACIÓN ENTRE SECCIONES

   Provincia y dignidad son las mismas en ambas secciones: al cambiar de una a
   otra, la que se abre adopta la selección de la que se deja. Se hace en el
   momento del cambio y no de forma continua, para que ninguna sección repinte
   por algo que ocurre en la otra mientras está oculta.
   ------------------------------------------------------------------------- */

/** Preinscritos → Histórico. */
function sincronizarDesdePreinscritos() {
  if (typeof ESTADO === 'undefined') return;
  const f = SEC.filtros.historico;
  /* La parroquia solo sobrevive si sigue dentro del mismo cantón; Preinscritos
     no tiene selector parroquial, así que ese nivel lo conserva el histórico. */
  if (f.provK !== ESTADO.provK || f.cantK !== ESTADO.cantK) f.parrK = '';
  f.provK = ESTADO.provK;
  f.cantK = ESTADO.cantK;
  /* Concejales y vocales no existen en Preinscritos: si el histórico se dejó
     en una de ellas y allí no se cambió la dignidad, al volver se conserva. */
  const extra = SEC.dignidadSoloHistorico;
  SEC.dignidadSoloHistorico = null;
  f.dignidad = (extra && extra.pre === ESTADO.dignidad) ? extra.id : ESTADO.dignidad;
}

/** Histórico → Preinscritos. */
function sincronizarHaciaPreinscritos() {
  if (typeof ESTADO === 'undefined') return;
  const f = SEC.filtros.historico;
  /* Con concejales o vocales, Preinscritos conserva su propia dignidad y
     adopta solo el territorio. */
  const soloHistorico = esDignidadSoloHistorico(f.dignidad);
  const dignidad = soloHistorico ? ESTADO.dignidad : f.dignidad;
  SEC.dignidadSoloHistorico = soloHistorico ? { id: f.dignidad, pre: ESTADO.dignidad } : null;
  if (ESTADO.provK === f.provK && ESTADO.cantK === f.cantK &&
      ESTADO.dignidad === dignidad) return;

  ESTADO.provK = f.provK;
  ESTADO.cantK = f.cantK;
  ESTADO.dignidad = dignidad;
  ESTADO.pagina = 1;

  /* Los botones de dignidad de Preinscritos reflejan el cambio. */
  document.querySelectorAll('#sel-dignidad [data-dig]').forEach(b =>
    b.classList.toggle('activo', b.dataset.dig === ESTADO.dignidad));
  if (typeof sincronizarSelectores === 'function') sincronizarSelectores();
  if (typeof render === 'function') render({ encuadrar: true });
}


/** Descarga bajo demanda de cada base. Devuelve false si el archivo no está. */
async function cargarBase(que) {
  if (SEC.listas[que]) return true;
  const ruta = { historico: 'data/historico.json',
                 postulantes: 'data/postulantes.json',
                 etario: 'data/etario2027.json' }[que];
  try {
    const r = await fetch(ruta, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();

    if (que === 'historico') {
      Object.assign(HIST, j);
      HIST.provincias.forEach((v, i) => HIST.iProv.set(v, i));
      HIST.cantones.forEach((v, i) => HIST.iCant.set(v, i));
      HIST.parroquias.forEach((v, i) => HIST.iParr.set(v, i));
      HIST.anios.forEach((v, i) => HIST.iAnio.set(v, i));
      await sumarDignidadesHistorico();
    }
    if (que === 'postulantes') {
      Object.assign(POST, j);
      sumarPostulantesHistorico();
    }
    if (que === 'etario') Object.assign(ETARIO, j);
    SEC.listas[que] = true;
    if (typeof podarPorAlcance === 'function') podarPorAlcance();
    return true;
  } catch (e) {
    console.warn(`[Dashboard] no se pudo cargar ${ruta}:`, e);
    return false;
  }
}

/* ---------------------------------------------------------------------------
   CONCEJALES Y VOCALES DE JUNTAS PARROQUIALES

   Llegan en un archivo aparte (data/historico_dignidades.json) con los
   territorios y las organizaciones por nombre. Aquí se traducen a las mismas
   posiciones que usa historico.json y se suman como dos dignidades más: el
   mapa, los indicadores, los gráficos y las tablas las tratan exactamente
   igual que a prefectos y alcaldes.
   ------------------------------------------------------------------------- */

/* replicas: años en que una dignidad de concejales no existía en la base y se
   copió de la otra (preparar_historico_dignidades.py), para avisarlo. */
const HIST_EXTRA = { postulantes: null, replicas: {} };

async function sumarDignidadesHistorico() {
  let j;
  try {
    const r = await fetch('data/historico_dignidades.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    j = await r.json();
  } catch (e) {
    console.warn('[Dashboard] histórico sin concejales ni vocales:', e);
    return;
  }

  try {
    /* La escala de color general se fija ANTES de sumar nada: prefectos y
       alcaldes conservan exactamente los mismos colores que tenían. */
    calcularEscalasGenerales();

    const posicion = (lista, indice, nombre) => {
      if (!indice.has(nombre)) { indice.set(nombre, lista.length); lista.push(nombre); }
      return indice.get(nombre);
    };
    const iOrg = new Map(HIST.organizaciones.map((o, i) => [o, i]));
    const traducir = ([anio, p, c, r, x, y], conOrganizacion) => {
      const ai = HIST.iAnio.get(anio);
      if (ai === undefined) return null;
      const fila = [ai, posicion(HIST.provincias, HIST.iProv, p),
                    posicion(HIST.cantones, HIST.iCant, c),
                    posicion(HIST.parroquias, HIST.iParr, r)];
      return conOrganizacion ? fila.concat(posicion(HIST.organizaciones, iOrg, x), y)
                             : fila.concat(x, y);
    };

    for (const dig in (j.votos || {})) {
      if (HIST.votos[dig]) continue;             // nunca pisa una dignidad existente
      const votos = j.votos[dig].map(f => traducir(f, true)).filter(Boolean);
      const nuloblanco = ((j.nuloblanco || {})[dig] || [])
        .map(f => traducir(f, false)).filter(Boolean);
      HIST.votos[dig] = votos;
      HIST.nuloblanco[dig] = nuloblanco;
      HIST.etiquetas[dig] = (j.etiquetas || {})[dig] || dig;
    }
    HIST_EXTRA.postulantes = j.postulantes || null;
    HIST_EXTRA.replicas = j.replicas || {};
  } catch (e) {
    console.warn('[Dashboard] no se pudieron sumar concejales y vocales:', e);
  }
}

/** Postulantes de concejales y vocales, junto a los de las demás dignidades. */
function sumarPostulantesHistorico() {
  const extra = HIST_EXTRA.postulantes;
  if (!extra || !POST.niveles) return;
  for (const dig in extra) {
    if (!POST.niveles[dig]) POST.niveles[dig] = extra[dig];
  }
}

/** Dignidades que solo existen en el histórico y tienen datos para este usuario. */
function dignidadesSoloHistorico() {
  return (CONFIG.dignidadesHistorico || [])
    .filter(d => CONFIG.paleta[d.id] && (HIST.votos[d.id] || []).length);
}

const esDignidadSoloHistorico = (id) =>
  (CONFIG.dignidadesHistorico || []).some(d => d.id === id);

/** Ámbito en que se elige cada dignidad, para los textos de ayuda. */
function ambitoEleccion(dignidad) {
  const extra = (CONFIG.dignidadesHistorico || []).find(d => d.id === dignidad);
  const nivel = extra ? extra.eleccion : (dignidad === 'ALCALDES' ? 'canton' : 'provincia');
  return { provincia: 'una provincia', canton: 'un cantón', parroquia: 'una parroquia' }[nivel];
}

/**
 * Notas de concejales y vocales, que se eligen por listas:
 *  · qué territorio cubre la base, cuando el filtro es más amplio que él;
 *  · por qué hasta 2019 los votos válidos pueden superar a los votantes.
 */
function notaDignidadLista(f, etq) {
  const notas = [];
  if (!f.cantK) {
    const cubiertos = new Map();
    (HIST.votos[f.dignidad] || []).forEach(([, p, c]) => {
      const provK = HIST.provincias[p], cantK = HIST.cantones[c];
      cubiertos.set(provK + '|' + cantK, `${ambitoTexto({ provK, cantK })} (${ambitoTexto({ provK })})`);
    });
    if (cubiertos.size) {
      notas.push(`La base de ${etq.toLowerCase()} solo incluye ${[...cubiertos.values()].join(', ')}:
        las cifras de este ámbito corresponden únicamente a
        ${cubiertos.size === 1 ? 'ese cantón' : 'esos cantones'}.`);
    }
  }
  notas.push(`Hasta 2019 cada elector podía votar por varios candidatos, tantos
    como puestos se elegían: los votos válidos de esos años suman preferencias y
    no papeletas, y pueden superar al número de votantes. En 2023 se votó por
    listas. Por eso los porcentajes de nulos y blancos de 2004–2019 no son
    comparables con los de 2023.`);
  if (ambitoEleccion(f.dignidad) === 'una parroquia') {
    notas.push('Las juntas parroquiales se eligen solo en las parroquias rurales.');
  }
  return notas.map(t => `<p class="sec-nota">${t}</p>`).join('');
}


/* ============================================================================
   CÁLCULO
   ========================================================================== */

/**
 * Candidatura de una organización dentro del ámbito filtrado.
 *
 * El ámbito de elección depende de la dignidad: los alcaldes se eligen por
 * cantón y los prefectos por provincia. Solo hay un nombre que devolver si el
 * filtro llega a ese nivel; por encima —una provincia entera con dignidad de
 * alcalde, o todo el país— la misma organización presenta decenas de
 * candidaturas distintas y no existe "el candidato".
 *
 * Devuelve null en ese caso, y la interfaz muestra solo la organización.
 */
function candidatoDe(dignidad, anioIdx, opIdx, provK, cantK) {
  const tabla = (HIST.porEleccion || {})[dignidad];
  if (!tabla || !HIST.candidatos) return null;

  const ip = provK ? HIST.iProv.get(provK) : undefined;
  if (ip === undefined) return null;

  let clave;
  if (dignidad === 'ALCALDES') {
    if (!cantK) return null;                     // el ámbito abarca varios cantones
    const ic = HIST.iCant.get(cantK);
    if (ic === undefined) return null;
    clave = `${anioIdx}|${ip}|${ic}|${opIdx}`;
  } else {
    clave = `${anioIdx}|${ip}|${opIdx}`;
  }
  const i = tabla[clave];
  return i === undefined ? null : HIST.candidatos[i];
}


/**
 * Devuelve los índices de las parroquias del CNE que corresponden a una
 * parroquia de la cartografía.
 *
 * Hace falta porque los nombres no coinciden: el CNE desglosa las parroquias
 * urbanas una por una —Quito tiene 79 y ninguna se llama «QUITO»— mientras
 * que el INEC las reúne en un solo polígono. Sin esta equivalencia, elegir la
 * parroquia urbana dejaría todos los gráficos en blanco.
 *
 * Devuelve null si no hay parroquia seleccionada (sin filtrar).
 */
function indicesDeParroquia(dignidad, provK, cantK, geoParrK) {
  if (!geoParrK || !provK || !cantK) return null;

  const clave = dignidad + '|' + provK + '|' + cantK;
  if (!SEC.cacheParr.has(clave)) {
    const parrs = TERRITORIO.parroquiasPorCant.get(provK + '|' + cantK) || [];
    const p = HIST.iProv.get(provK), c = HIST.iCant.get(cantK);
    const vistas = new Set();
    (HIST.votos[dignidad] || []).forEach(([, fp, fc, fr]) => {
      if (fp === p && fc === c) vistas.add(fr);
    });
    const mapa = new Map();
    vistas.forEach(fr => {
      const g = parroquiaGeografica(HIST.parroquias[fr], parrs, cantK);
      if (!g) return;
      if (!mapa.has(g.__key)) mapa.set(g.__key, new Set());
      mapa.get(g.__key).add(fr);
    });
    SEC.cacheParr.set(clave, mapa);
  }
  return SEC.cacheParr.get(clave).get(geoParrK) || new Set();
}


/**
 * Recorre el histórico una vez y devuelve, por año, los indicadores del
 * territorio filtrado.
 *
 * El índice de fragmentación es 1 / Σ(pᵢ²), con pᵢ = votos de cada
 * organización sobre el total válido del ámbito. Equivale al número efectivo
 * de organizaciones: 1 significa que una sola se lleva todo el voto.
 *
 * Nulos y blancos llegan ya desduplicados desde preparar_secciones.py, que
 * toma el máximo dentro de cada unidad electoral antes de sumar. En crudo se
 * repiten en cada fila de candidato y darían diez veces la cifra real.
 */
function serieHistorica(dignidad, provK, cantK, parrK) {
  const p = provK ? HIST.iProv.get(provK) : -1;
  const c = cantK ? HIST.iCant.get(cantK) : -1;
  const set = indicesDeParroquia(dignidad, provK, cantK, parrK);
  const pasa = (fp, fc, fr) =>
    (p < 0 || fp === p) && (c < 0 || fc === c) && (!set || set.has(fr));

  const porAnio = new Map();
  const dame = (ai) => {
    if (!porAnio.has(ai)) porAnio.set(ai, { ops: new Map(), validos: 0, nulos: 0, blancos: 0 });
    return porAnio.get(ai);
  };

  (HIST.votos[dignidad] || []).forEach(([ai, fp, fc, fr, op, v]) => {
    if (!pasa(fp, fc, fr)) return;
    const a = dame(ai);
    a.ops.set(op, (a.ops.get(op) || 0) + v);
    a.validos += v;
  });
  (HIST.nuloblanco[dignidad] || []).forEach(([ai, fp, fc, fr, n, b]) => {
    if (!pasa(fp, fc, fr)) return;
    const a = dame(ai);
    a.nulos += n; a.blancos += b;
  });

  const salida = [];
  HIST.anios.forEach((anio, ai) => {
    const a = porAnio.get(ai);
    if (!a) return;
    const orden = [...a.ops.entries()]
      .map(([op, v]) => ({ op: HIST.organizaciones[op], votos: v,
                           pct: a.validos ? v * 100 / a.validos : 0,
                           candidato: candidatoDe(dignidad, ai, op, provK, cantK) }))
      .sort((x, y) => y.votos - x.votos);
    const hh = orden.reduce((s, o) => s + Math.pow(o.pct / 100, 2), 0);
    const primera = orden[0] || null, segunda = orden[1] || null;
    const emitidos = a.validos + a.nulos + a.blancos;

    salida.push({
      anio, validos: a.validos, nulos: a.nulos, blancos: a.blancos, emitidos,
      pctNulos: emitidos ? a.nulos * 100 / emitidos : 0,
      pctBlancos: emitidos ? a.blancos * 100 / emitidos : 0,
      organizaciones: orden, nOrganizaciones: orden.length,
      primera, segunda,
      margen: (primera && segunda) ? primera.pct - segunda.pct : null,
      concentracion: (primera && segunda) ? primera.pct + segunda.pct
                     : (primera ? primera.pct : null),
      fragmentacion: hh > 0 ? 1 / hh : 0
    });
  });
  return salida.sort((x, y) => x.anio - y.anio);
}

/** Nulos y blancos por cantón, para el mapa de diagnóstico. */
function nuloBlancoPorCanton(dignidad, anio, provK) {
  const ai = HIST.iAnio.get(anio);
  const p = provK ? HIST.iProv.get(provK) : -1;
  const val = new Map(), nb = new Map();

  (HIST.votos[dignidad] || []).forEach(([a, fp, fc, , , v]) => {
    if (a !== ai || (p >= 0 && fp !== p)) return;
    const k = HIST.provincias[fp] + '|' + HIST.cantones[fc];
    val.set(k, (val.get(k) || 0) + v);
  });
  (HIST.nuloblanco[dignidad] || []).forEach(([a, fp, fc, , n, b]) => {
    if (a !== ai || (p >= 0 && fp !== p)) return;
    const k = HIST.provincias[fp] + '|' + HIST.cantones[fc];
    const o = nb.get(k) || { nulos: 0, blancos: 0 };
    o.nulos += n; o.blancos += b; nb.set(k, o);
  });

  const out = new Map();
  nb.forEach((o, k) => {
    const emitidos = (val.get(k) || 0) + o.nulos + o.blancos;
    out.set(k, { nulos: o.nulos, blancos: o.blancos, emitidos,
                 pctNulos: emitidos ? o.nulos * 100 / emitidos : 0,
                 pctBlancos: emitidos ? o.blancos * 100 / emitidos : 0 });
  });
  return out;
}

/** Postulantes distintos en el ámbito. No se pueden sumar entre niveles. */
function postulantesDe(dignidad, anio, provK, cantK, parrK) {
  const n = (POST.niveles || {})[dignidad];
  if (!n) return 0;
  if (parrK) return n.parr[`${anio}|${provK}|${cantK}|${parrK}`] || 0;
  if (cantK) return n.cant[`${anio}|${provK}|${cantK}`] || 0;
  if (provK) return n.prov[`${anio}|${provK}`] || 0;
  return n.pais[String(anio)] || 0;
}

function postulantesPorCanton(dignidad, anio, provK) {
  const n = (POST.niveles || {})[dignidad];
  const out = new Map();
  if (!n) return out;
  const pre = anio + '|';
  for (const k in n.cant) {
    if (!k.startsWith(pre)) continue;
    const [, p, c] = k.split('|');
    if (provK && p !== provK) continue;
    out.set(p + '|' + c, n.cant[k]);
  }
  return out;
}

/**
 * ¿Cuántas elecciones distintas abarca el ámbito?
 * Los alcaldes se eligen por cantón y los prefectos por provincia: en ámbitos
 * más amplios, la primera fuerza y la fragmentación describen el agregado y
 * no una contienda concreta. La interfaz lo advierte.
 */
function eleccionesEnAmbito(dignidad, anio, f) {
  const ai = anio === null ? -1 : HIST.iAnio.get(anio);
  const p = f.provK ? HIST.iProv.get(f.provK) : -1;
  const c = f.cantK ? HIST.iCant.get(f.cantK) : -1;
  const set = new Set();
  /* Concejales: una elección por cantón. Vocales: una por parroquia. */
  const eleccion = esDignidadSoloHistorico(dignidad)
    ? ((CONFIG.dignidadesHistorico.find(d => d.id === dignidad) || {}).eleccion) : null;
  const parrs = eleccion === 'parroquia'
    ? indicesDeParroquia(dignidad, f.provK, f.cantK, f.parrK) : null;
  (HIST.votos[dignidad] || []).forEach(([a, fp, fc, fr]) => {
    if (ai >= 0 && a !== ai) return;
    if (p >= 0 && fp !== p) return;
    if (c >= 0 && fc !== c) return;
    if (parrs && !parrs.has(fr)) return;
    set.add(eleccion === 'parroquia' ? fp + '|' + fc + '|' + fr
            : (dignidad === 'ALCALDES' || eleccion === 'canton') ? fp + '|' + fc : String(fp));
  });
  return set.size;
}

function notaAmbito(dignidad, anio, f) {
  const n = eleccionesEnAmbito(dignidad, anio, f);
  if (n <= 1) return '';
  if (esDignidadSoloHistorico(dignidad)) {
    return `agregado de ${fmtNum(n)} elecciones ` +
      (ambitoEleccion(dignidad) === 'una parroquia' ? 'parroquiales' : 'cantonales');
  }
  return dignidad === 'ALCALDES'
    ? `agregado de ${fmtNum(n)} elecciones cantonales`
    : `agregado de ${fmtNum(n)} elecciones provinciales`;
}


/* ============================================================================
   UTILIDADES DE INTERFAZ
   ========================================================================== */

const sq = (s) => document.querySelector(s);
const dec = (n, d = 2) => (n || 0).toLocaleString('es-EC',
  { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Parroquias que eligen la dignidad: los concejales urbanos, solo las
 * urbanas; los rurales, solo las rurales (propiedad «estado» de la capa).
 * Las demás dignidades usan todas. Si la capa no trae «estado», todas.
 */
function parroquiasDeDignidad(dignidad, parrs) {
  const d = (CONFIG.dignidadesHistorico || []).find(x => x.id === dignidad);
  if (!d || !d.parroquias) return parrs;
  const tipo = d.parroquias === 'urbanas' ? 'URBANA' : 'RURAL';
  const sub = parrs.filter(p => normalizarTexto(String((p.properties || {}).estado || '')) === tipo);
  return sub.length ? sub : parrs;
}

function selectoresTerritorio(f, alCambiar, prefijo) {
  const provs = provinciasSeleccionables();
  const cantones = f.provK ? ((TERRITORIO.porProvK.get(f.provK) || {}).cantones || []) : [];
  const parrs = (f.provK && f.cantK)
    ? parroquiasDeDignidad(f.dignidad, TERRITORIO.parroquiasPorCant.get(f.provK + '|' + f.cantK) || []) : [];

  const html = `
    <div class="campo">
      <label for="${prefijo}-prov">Provincia</label>
      <div class="select-wrap"><select id="${prefijo}-prov">
        <option value="">Todas las provincias</option>
        ${provs.map(p => `<option value="${p.key}" ${p.key === f.provK ? 'selected' : ''}>${tituloCase(p.nombre)}</option>`).join('')}
      </select></div>
    </div>
    <div class="campo ${f.provK ? '' : 'deshabilitado'}">
      <label for="${prefijo}-cant">Cantón</label>
      <div class="select-wrap"><select id="${prefijo}-cant" ${f.provK ? '' : 'disabled'}>
        <option value="">Todos los cantones</option>
        ${cantones.map(c => `<option value="${c.key}" ${c.key === f.cantK ? 'selected' : ''}>${tituloCase(c.nombre)}</option>`).join('')}
      </select></div>
    </div>
    <div class="campo ${parrs.length ? '' : 'deshabilitado'}">
      <label for="${prefijo}-parr">Parroquia</label>
      <div class="select-wrap"><select id="${prefijo}-parr" ${parrs.length ? '' : 'disabled'}>
        <option value="">Todas las parroquias</option>
        ${parrs.map(x => `<option value="${x.__key}" ${x.__key === f.parrK ? 'selected' : ''}>${tituloCase(x.__nombre)}</option>`).join('')}
      </select></div>
      <small class="campo-nota">${parrs.length ? '' : 'Se habilita al elegir un cantón.'}</small>
    </div>`;

  const cablear = () => {
    sq('#' + prefijo + '-prov').onchange = (e) => {
      f.provK = e.target.value; f.cantK = ''; f.parrK = ''; alCambiar();
    };
    sq('#' + prefijo + '-cant').onchange = (e) => {
      f.cantK = e.target.value; f.parrK = ''; alCambiar();
    };
    sq('#' + prefijo + '-parr').onchange = (e) => { f.parrK = e.target.value; alCambiar(); };
  };
  return { html, cablear };
}

function botonesDignidad(f, alCambiar, prefijo) {
  /* Prefectos y alcaldes, y debajo concejales y vocales si hay datos. */
  const html = `<div class="dig-grupo" id="${prefijo}-dig">` +
    CONFIG.dignidades.concat(dignidadesSoloHistorico()).map(d => `
      <button type="button" class="dig-btn ${d.id === f.dignidad ? 'activo' : ''}"
              data-d="${d.id}" style="--dig-color:${CONFIG.paleta[d.id].acento}">
        <span class="dig-nombre">${d.etiqueta.toUpperCase()}</span>
        <span class="dig-nivel">${d.descripcion}</span>
      </button>`).join('') + '</div>';
  const cablear = () => {
    sq('#' + prefijo + '-dig').querySelectorAll('[data-d]').forEach(b => {
      b.onclick = () => { if (f.dignidad !== b.dataset.d) { f.dignidad = b.dataset.d; alCambiar(); } };
    });
  };
  return { html, cablear };
}

function ambitoTexto(f) {
  if (f.parrK) {
    const p = (TERRITORIO.parroquiasPorCant.get(f.provK + '|' + f.cantK) || [])
      .find(x => x.__key === f.parrK);
    return p ? tituloCase(p.__nombre) : 'Parroquia';
  }
  if (f.cantK) return tituloCase((TERRITORIO.porCantK.get(f.provK + '|' + f.cantK) || {}).nombre || '');
  if (f.provK) return tituloCase((TERRITORIO.porProvK.get(f.provK) || {}).nombre || '');
  return 'Ecuador';
}

function tarjetaKPI(etq, valor, sub, destacado) {
  return `<article class="kpi ${destacado ? 'destacado' : ''}">
    <p class="kpi-etq">${etq}</p><p class="kpi-val">${valor}</p>
    <p class="kpi-sub">${sub}</p></article>`;
}

function temaSeccion(dignidad) {
  const p = CONFIG.paleta[dignidad];
  const r = document.documentElement.style;
  r.setProperty('--acento', p.acento);
  p.rampa.forEach((c, i) => r.setProperty(`--rampa-${i + 1}`, c));
  document.body.dataset.dignidad = dignidad;
}

function montarGrafico(clave, canvas, config) {
  if (SEC.graficos[clave]) { SEC.graficos[clave].destroy(); SEC.graficos[clave] = null; }
  const el = document.getElementById(canvas);
  if (!el) return;
  try { SEC.graficos[clave] = new Chart(el.getContext('2d'), config); }
  catch (e) { console.warn('[Dashboard] gráfico ' + clave + ':', e); }
}


/* ============================================================================
   MAPA ELECTORAL — un único mapa para toda la sección

   Cambia de nivel según el filtro territorial:
     sin provincia → provincias · con provincia → sus cantones ·
     con cantón → sus parroquias
   y se pinta con un degradado continuo según el porcentaje elegido.
   ========================================================================== */

/** Mezcla dos colores hexadecimales. t = 0 devuelve a, t = 1 devuelve b. */
function mezclarColor(a, b, t) {
  const hex = (c) => [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16));
  const [r1, g1, b1] = hex(a), [r2, g2, b2] = hex(b);
  const m = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  /* En mayúsculas, como el resto de colores del proyecto. */
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`.toUpperCase();
}

/**
 * Color continuo sobre la rampa de la dignidad.
 * A mayor porcentaje, color más intenso; a menor, más claro.
 */
function colorDegradado(rampa, t) {
  const n = rampa.length - 1;
  const x = Math.max(0, Math.min(1, isFinite(t) ? t : 0)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  return mezclarColor(rampa[i], rampa[i + 1], x - i);
}

/**
 * Empareja una parroquia de la base electoral con su polígono.
 *
 * El CNE desglosa las parroquias urbanas una por una mientras que la
 * cartografía del INEC las reúne en un solo polígono (el de código terminado
 * en 50). Sin consolidarlas ahí, más de la mitad de los votos del país se
 * quedarían sin pintar, justo en las ciudades.
 */
function parroquiaGeografica(parrK, parrs, cantK) {
  const sinEspacios = (x) => x.replace(/ /g, '');
  let p = parrs.find(x => x.__key === parrK);
  if (p) return p;
  p = parrs.find(x => sinEspacios(x.__key) === sinEspacios(parrK));
  if (p) return p;
  /* Capa del CNE: ya trae cada parroquia urbana por separado y la equivalencia
     con la base electoral viene en la propia capa (nombres_cne). Lo que no
     figura en ningún polígono —las parroquias urbanas de Quito anteriores a
     2014, o una parroquia que hoy pertenece a otro cantón— no se atribuye a
     ninguno: plegarlo al polígono urbano falsearía los datos de ese polígono. */
  if (parrs.some(x => x.__nombresCNE)) {
    return parrs.find(x => x.__nombresCNE && x.__nombresCNE.includes(parrK)) || null;
  }
  return parrs.find(x => x.__urbana) || parrs.find(x => x.__key === cantK) || null;
}

/**
 * Agrega válidos, nulos y blancos del año indicado al nivel territorial que
 * corresponde, y devuelve también los porcentajes sobre votos emitidos.
 */
function agregadoElectoral(dignidad, anio, nivel, provK, cantK) {
  const ai = HIST.iAnio.get(anio);
  const p = provK ? HIST.iProv.get(provK) : -1;
  const c = cantK ? HIST.iCant.get(cantK) : -1;
  const parrs = (nivel === 'parroquia')
    ? (TERRITORIO.parroquiasPorCant.get(provK + '|' + cantK) || []) : [];

  const clave = (fp, fc, fr) => {
    if (nivel === 'provincia') return HIST.provincias[fp];
    if (nivel === 'canton') return HIST.provincias[fp] + '|' + HIST.cantones[fc];
    const g = parroquiaGeografica(HIST.parroquias[fr], parrs, cantK);
    return g ? provK + '|' + cantK + '|' + g.__key : null;
  };

  const out = new Map();
  const dame = (k) => {
    if (!out.has(k)) out.set(k, { validos: 0, nulos: 0, blancos: 0 });
    return out.get(k);
  };

  (HIST.votos[dignidad] || []).forEach(([a, fp, fc, fr, , v]) => {
    if (a !== ai || (p >= 0 && fp !== p) || (c >= 0 && fc !== c)) return;
    const k = clave(fp, fc, fr);
    if (k) dame(k).validos += v;
  });
  (HIST.nuloblanco[dignidad] || []).forEach(([a, fp, fc, fr, n, b]) => {
    if (a !== ai || (p >= 0 && fp !== p) || (c >= 0 && fc !== c)) return;
    const k = clave(fp, fc, fr);
    if (!k) return;
    const o = dame(k);
    o.nulos += n; o.blancos += b;
  });

  out.forEach(o => {
    o.emitidos = o.validos + o.nulos + o.blancos;
    o.pctValidos = o.emitidos ? o.validos * 100 / o.emitidos : 0;
    o.pctNulos = o.emitidos ? o.nulos * 100 / o.emitidos : 0;
    o.pctBlancos = o.emitidos ? o.blancos * 100 / o.emitidos : 0;
  });
  return out;
}

/* ---------------------------------------------------------------------------
   ESCALA DE COLOR GENERAL

   El rango de cada indicador se calcula una sola vez sobre todo el conjunto
   de datos —los cinco años y las dos dignidades— y no se recalcula al
   filtrar. Así el mismo color significa siempre el mismo porcentaje y los
   mapas de distintas provincias o años se pueden comparar entre sí.

   Se guarda un rango por nivel territorial porque los porcentajes se
   comportan de forma muy distinta al agregar: los nulos van de 2 % a 19 %
   entre provincias pero de 0 % a 62 % entre parroquias. Con un único rango
   común, todas las provincias caerían en una franja estrecha y saldrían
   prácticamente del mismo color.
   ------------------------------------------------------------------------- */

/* Unidades con muy pocos votos emitidos quedan fuera del cálculo del rango:
   una parroquia con 3 votos y los 3 nulos daría un máximo del 100 % y
   aplastaría la escala de todas las demás. Sí se pintan en el mapa. */
const MINIMO_EMITIDOS_ESCALA = 50;

/** Calcula, una vez, el mínimo y el máximo de cada indicador en cada nivel. */
function calcularEscalasGenerales() {
  if (HIST.escalas) return HIST.escalas;

  const niveles = { provincia: new Map(), canton: new Map(), parroquia: new Map() };
  const clave = {
    provincia: (d, a, p) => d + '|' + a + '|' + p,
    canton:    (d, a, p, c) => d + '|' + a + '|' + p + '|' + c,
    parroquia: (d, a, p, c, r) => d + '|' + a + '|' + p + '|' + c + '|' + r
  };
  const dame = (m, k) => {
    if (!m.has(k)) m.set(k, { v: 0, n: 0, b: 0 });
    return m.get(k);
  };

  for (const dig in HIST.votos) {
    (HIST.votos[dig] || []).forEach(([a, p, c, r, , v]) => {
      dame(niveles.provincia, clave.provincia(dig, a, p)).v += v;
      dame(niveles.canton, clave.canton(dig, a, p, c)).v += v;
      dame(niveles.parroquia, clave.parroquia(dig, a, p, c, r)).v += v;
    });
    (HIST.nuloblanco[dig] || []).forEach(([a, p, c, r, n, b]) => {
      const t = [dame(niveles.provincia, clave.provincia(dig, a, p)),
                 dame(niveles.canton, clave.canton(dig, a, p, c)),
                 dame(niveles.parroquia, clave.parroquia(dig, a, p, c, r))];
      t.forEach(o => { o.n += n; o.b += b; });
    });
  }

  const escalas = {};
  for (const nivel in niveles) {
    const acc = { pctValidos: [Infinity, -Infinity], pctNulos: [Infinity, -Infinity],
                  pctBlancos: [Infinity, -Infinity] };
    niveles[nivel].forEach(o => {
      const em = o.v + o.n + o.b;
      if (em < MINIMO_EMITIDOS_ESCALA) return;
      const pct = { pctValidos: o.v * 100 / em, pctNulos: o.n * 100 / em,
                    pctBlancos: o.b * 100 / em };
      for (const k in pct) {
        if (pct[k] < acc[k][0]) acc[k][0] = pct[k];
        if (pct[k] > acc[k][1]) acc[k][1] = pct[k];
      }
    });
    for (const k in acc) {
      if (!isFinite(acc[k][0])) acc[k] = [0, 100];
    }
    escalas[nivel] = acc;
  }

  HIST.escalas = escalas;
  return escalas;
}

const VARIABLES = {
  pctValidos: { etq: '% Votos válidos', campo: 'validos' },
  pctNulos:   { etq: '% Votos nulos',   campo: 'nulos' },
  pctBlancos: { etq: '% Votos blancos', campo: 'blancos' }
};

/** Dibuja el mapa con el año, la variable y el nivel territorial vigentes. */
function pintarMapaElectoral() {
  const cont = document.getElementById('mapa-electoral');
  if (!cont || !SEC.listas.historico) return;

  const f = SEC.filtros.historico;
  const anio = SEC.mapa.anio;
  const varia = SEC.mapa.variable;
  const rampa = CONFIG.paleta[f.dignidad].rampa;

  /* Nivel: se profundiza con el filtro territorial de la sección. */
  const hayParrs = f.provK && f.cantK &&
    (TERRITORIO.parroquiasPorCant.get(f.provK + '|' + f.cantK) || []).length > 0;
  const nivel = hayParrs ? 'parroquia' : (f.provK ? 'canton' : 'provincia');

  const datos = agregadoElectoral(f.dignidad, anio, nivel, f.provK, f.cantK);

  /* Geometría del nivel */
  let features;
  if (nivel === 'provincia') {
    features = (DATOS.geo.provincias.features || [])
      .filter(x => x.__key !== normalizarTexto('ZONA NO DELIMITADA'));
  } else if (nivel === 'canton') {
    features = (DATOS.geo.cantones.features || []).filter(x => x.__provK === f.provK);
  } else {
    features = TERRITORIO.parroquiasPorCant.get(f.provK + '|' + f.cantK) || [];
    /* Con una parroquia elegida el mapa muestra solo esa: las demás no se
       atenúan, desaparecen, y el encuadre se ajusta a su geometría. */
    if (f.parrK) features = features.filter(x => x.__key === f.parrK);
  }
  const claveDe = (x) => nivel === 'provincia' ? x.__key
    : nivel === 'canton' ? x.__provK + '|' + x.__key
    : f.provK + '|' + f.cantK + '|' + x.__key;

  const valor = (x) => { const d = datos.get(claveDe(x)); return d ? d[varia] : null; };
  const valores = features.map(valor).filter(v => v !== null && isFinite(v));

  /* Rango general del indicador en este nivel: no depende del filtro, de modo
     que un mismo color significa siempre el mismo porcentaje. */
  const [min, max] = calcularEscalasGenerales()[nivel][varia];
  const rango = max - min;

  /* La capa se reconstruye cuando cambia el conjunto de geometrías, no solo
     el nivel: enfocar una parroquia concreta también lo cambia. */
  const firma = [nivel, f.provK, f.cantK, f.parrK].join('|');
  if (SEC.mapas.electoral && SEC.mapas.electoral.firma !== firma) {
    SEC.mapas.electoral.map.removeLayer(SEC.mapas.electoral.capa);
    SEC.mapas.electoral.capa = null;
  }
  if (!SEC.mapas.electoral) {
    const map = L.map('mapa-electoral', {
      zoomControl: true, attributionControl: true, minZoom: 5, maxZoom: 13,
      /* Mismo criterio que el mapa de Preinscritos: sin zoom por gesto, para
         que pasar el ratón por encima no mueva el mapa. */
      scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false
    }).setView(CONFIG.vistaEcuador.centro, CONFIG.vistaEcuador.zoom);
    cont.style.background = CONFIG.mapaBase.color;
    if (map.attributionControl) map.attributionControl.addAttribution(CONFIG.mapaBase.credito);
    SEC.mapas.electoral = { map, capa: null, nivel: null, firma: null };
  }
  const M = SEC.mapas.electoral;
  if (!M.capa) {
    M.capa = L.geoJSON({ type: 'FeatureCollection', features }, {
      style: () => ({ fill: true, stroke: true, fillColor: CONFIG.paleta.sinDatos,
                      fillOpacity: .92, color: '#FFFFFF', weight: .8, opacity: .9 })
    }).addTo(M.map);
    M.nivel = nivel;
    M.firma = firma;
    M.map.fitBounds(M.capa.getBounds(), { padding: [18, 18], animate: false });
  }

  const nombreVar = VARIABLES[varia].etq;
  M.capa.eachLayer(l => {
    const x = l.feature;
    const v = valor(x);
    /* Fuera del rango general (unidades diminutas excluidas del cálculo) el
       color se queda en el extremo que corresponda. */
    const t = rango > 0 ? Math.max(0, Math.min(1, (v - min) / rango))
                        : (v === null ? 0 : 1);
    l.setStyle({ fill: true, stroke: true, fillOpacity: .92,
                 fillColor: v === null ? CONFIG.paleta.sinDatos : colorDegradado(rampa, t),
                 color: '#FFFFFF', weight: .8, opacity: .9 });
    l.unbindTooltip();
    l.off('mouseover').off('mouseout');
    const d = datos.get(claveDe(x));
    l.bindTooltip(() => `
      <div class="tt"><div class="tt-titulo">${x.__nombre}</div>
        <div class="tt-sub">${nivel === 'provincia' ? 'Provincia'
          : tituloCase(nivel === 'canton' ? x.__provNombre : ambitoTexto({ provK: f.provK, cantK: f.cantK }))}</div>
        ${d ? `<div class="tt-metricas">
          <div><span>% Válidos</span><b>${fmtPct(d.pctValidos)}</b></div>
          <div><span>% Nulos</span><b>${fmtPct(d.pctNulos)}</b></div>
          <div><span>% Blancos</span><b>${fmtPct(d.pctBlancos)}</b></div>
          <div><span>Votos emitidos</span><b>${fmtNum(d.emitidos)}</b></div>
        </div>` : '<div class="tt-sub">Sin datos de este año</div>'}
        <div class="tt-pie"><span class="tt-chip">${nombreVar}</span>
          <span class="tt-chip">${anio}</span></div></div>`,
      { sticky: true, direction: 'top', className: 'tt-wrap', opacity: 1 });
    l.on('mouseover', e => e.target.setStyle({ weight: 2.4, color: '#0A111E' }));
    l.on('mouseout', e => e.target.setStyle({ color: '#FFFFFF', weight: .8 }));
  });

  /* Panel lateral: escala de color y lectura del ámbito, con el mismo
     formato que el panel de análisis territorial de Preinscritos. */
  const poner = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  const grad = document.getElementById('me-grad');
  if (grad) grad.style.background = `linear-gradient(90deg,${rampa.join(',')})`;

  poner('me-indicador', nombreVar);
  poner('me-anio', String(anio));
  poner('me-nivel', { provincia: 'Provincial', canton: 'Cantonal',
                      parroquia: 'Parroquial' }[nivel]);
  poner('me-territorio', (nivel === 'parroquia' && f.parrK)
    ? ambitoTexto({ provK: f.provK, cantK: f.cantK, parrK: f.parrK })
    : ambitoTexto({ provK: f.provK, cantK: (nivel === 'parroquia' ? f.cantK : '') }));

  poner('me-min', dec(min, 1) + ' %');
  poner('me-max', dec(max, 1) + ' %');

  document.querySelectorAll('#me-anios [data-a]').forEach(b =>
    b.classList.toggle('activo', parseInt(b.dataset.a, 10) === anio));
  document.querySelectorAll('#me-vars [data-v]').forEach(b =>
    b.classList.toggle('activo', b.dataset.v === varia));

  setTimeout(() => M.map.invalidateSize(), 40);
}


/**
 * Histograma de distribución por grupo etario.
 * Se invoca desde el render de Preinscritos, así que sigue los mismos filtros
 * de provincia y cantón que el resto de esa página.
 */
function actualizarEtario() {
  const bloque = document.getElementById('bloque-etario');
  if (!bloque) return;
  if (!SEC.listas.etario) { bloque.hidden = true; return; }
  bloque.hidden = false;

  const grupos = ETARIO.grupos || [];
  const provK = (typeof ESTADO !== 'undefined') ? ESTADO.provK : '';
  const cantK = (typeof ESTADO !== 'undefined') ? ESTADO.cantK : '';

  let fila;
  if (cantK) fila = ETARIO.cantones[provK + '|' + cantK] || grupos.map(() => 0);
  else if (provK) fila = ETARIO.provincias[provK] || grupos.map(() => 0);
  else fila = ETARIO.pais;

  const total = fila.reduce((a, b) => a + b, 0);
  const ambito = cantK
    ? tituloCase((TERRITORIO.porCantK.get(provK + '|' + cantK) || {}).nombre || '')
    : provK ? tituloCase((TERRITORIO.porProvK.get(provK) || {}).nombre || '') : 'Ecuador';

  sq('#et-sub').textContent = `${ambito} · ${AÑO_DEMOGRAFICO}`;

  /* Solo el porcentaje de cada grupo: el total no se muestra. */
  const pct = (i) => total ? fila[i] * 100 / total : 0;
  sq('#et-cifras').innerHTML = grupos.map((g, i) => `
    <div><span>${g} años</span><b>${fmtPct(pct(i))}</b></div>`).join('');

  const dignidad = (typeof ESTADO !== 'undefined') ? ESTADO.dignidad : 'PREFECTOS';
  const rampa = CONFIG.paleta[dignidad].rampa;

  montarGrafico('etario', 'et-grafico', {
    type: 'bar',
    data: { labels: grupos.map(g => g + ' años'),
      datasets: [{ data: grupos.map((_, i) => pct(i)), borderRadius: 3, maxBarThickness: 78,
        /* Barras contiguas: es un histograma, los tramos son continuos. */
        categoryPercentage: 0.98, barPercentage: 0.98,
        backgroundColor: grupos.map((_, i) =>
          rampa[Math.min(rampa.length - 1, 1 + Math.round(i * (rampa.length - 2) / Math.max(grupos.length - 1, 1)))]) }] },
    options: {
      scales: { x: { grid: { display: false, drawBorder: false },
                     ticks: { color: TEMA.texto, font: { size: 11 } } },
                y: { grid: { color: TEMA.grilla, drawBorder: false }, beginAtZero: true,
                     ticks: { color: TEMA.tenue, font: { family: TEMA.mono, size: 10.5 },
                              callback: v => v + ' %' } } },
      plugins: { tooltip: { backgroundColor: '#0A111E', borderColor: '#2B3F5E',
        borderWidth: 1, padding: 10, displayColors: false,
        bodyFont: { family: TEMA.mono, size: 12 },
        callbacks: { label: c => ' ' + fmtPct(c.parsed.y) } } } }
  });
}


/* ============================================================================
   HISTÓRICO ELECTORAL — evolución, resultados y mapas de diagnóstico
   ========================================================================== */

function construirPanelHistorico() {
  const f = SEC.filtros.historico;
  /* Al pasar, por ejemplo, de concejales urbanos a rurales, una parroquia que
     la nueva dignidad no elige deja de estar seleccionada. */
  const restringida = (CONFIG.dignidadesHistorico || []).some(d => d.id === f.dignidad && d.parroquias);
  if (restringida && f.parrK && f.provK && f.cantK &&
      !parroquiasDeDignidad(f.dignidad, TERRITORIO.parroquiasPorCant.get(f.provK + '|' + f.cantK) || [])
        .some(p => p.__key === f.parrK)) {
    f.parrK = '';
  }
  const dig = botonesDignidad(f, renderHistorico, 'h');
  const terr = selectoresTerritorio(f, renderHistorico, 'h');

  sq('#filtros-historico').innerHTML = `
    <section class="bloque">
      <h2 class="bloque-tit"><i class="ix">01</i> Dignidad</h2>
      ${dig.html}
    </section>
    <section class="bloque">
      <h2 class="bloque-tit"><i class="ix">02</i> Territorio</h2>
      ${terr.html}
      <button class="btn btn-limpiar" type="button" id="h-limpiar">Limpiar territorio</button>
    </section>
`;

  dig.cablear(); terr.cablear();
  sq('#h-limpiar').onclick = () => {
    f.provK = ''; f.cantK = ''; f.parrK = '';
    construirPanelHistorico(); renderHistorico();
  };
}

function renderHistorico() {
  const f = SEC.filtros.historico;
  temaSeccion(f.dignidad);
  construirPanelHistorico();

  const serie = serieHistorica(f.dignidad, f.provK, f.cantK, f.parrK);
  const etq = HIST.etiquetas[f.dignidad] || f.dignidad;
  const ambito = ambitoTexto(f);
  const vista = sq('#vista-historico');

  if (!serie.length) {
    vista.innerHTML = `<section class="tarjeta sec-tarjeta">
      <h2 class="tarjeta-tit">Histórico electoral</h2>
      <p class="sec-vacio">No hay datos de ${etq} en ${ambito}.</p></section>`;
    return;
  }

  const ult = serie[serie.length - 1];
  const pri = serie[0];
  const nota = notaAmbito(f.dignidad, ult.anio, f);
  const dist = distribucionTerritorial(f, ult.anio);
  const delta = (a, b) => (!isFinite(a) || !isFinite(b) || !b) ? ''
    : `${a >= b ? '+' : ''}${dec((a - b) * 100 / b, 1)} % desde ${pri.anio}`;

  /* El nombre de la candidatura solo existe si el filtro llega al ámbito de
     una sola elección; si no, se muestra únicamente la organización. */
  const hayCandidato = serie.some(s => s.primera && s.primera.candidato);
  const celdaLugar = (d) => d.candidato
    ? `<b>${tituloCase(d.candidato)}</b><span class="lugar-op">${tituloCase(d.op)}</span>`
    : tituloCase(d.op);

  /* Concejales y vocales se eligen por listas: llevan sus propias notas, y el
     año sin candidatos en la base muestra «—» en vez de un cero. */
  const esLista = esDignidadSoloHistorico(f.dignidad);
  const nPostulantes = postulantesDe(f.dignidad, ult.anio, f.provK, f.cantK, f.parrK);
  const sinPostulantes = esLista && !nPostulantes;
  const notaLista = esLista ? notaDignidadLista(f, etq) : '';

  /* Años en que esta dignidad no existía en la base y se replicó la otra de
     concejales: el aviso solo aparece si alguno de ellos está en pantalla. */
  const replicados = (HIST_EXTRA.replicas[f.dignidad] || [])
    .filter(a => serie.some(s => s.anio === a));
  const notaReplica = replicados.length ? `<p class="sec-nota">${replicados.join(' y ')}:
    Esta dignidad no existía de forma independiente en este año; se replica la
    información disponible para mantener la comparación histórica.</p>` : '';

  /* Reescribir la vista destruye los contenedores de los mapas, así que hay
     que soltar las instancias de Leaflet antes: si no, quedan apuntando a
     elementos que ya no están en el documento y el mapa deja de dibujarse. */
  if (SEC.mapas.electoral) {
    try {
      /* stop() antes de remove(): si queda una animación de paneo en vuelo,
         al terminar buscaría un contenedor que ya no existe y reventaría. */
      SEC.mapas.electoral.map.stop();
      SEC.mapas.electoral.map.remove();
    } catch (e) { /* ya no estaba en el DOM */ }
    SEC.mapas.electoral = null;
  }

  vista.innerHTML = `
    <!-- ── Mapa electoral · misma estructura que el mapa de Preinscritos ── -->
    <section class="fila-mapa">

      <div class="tarjeta mapa-tarjeta" id="me-shell">
        <div class="ruta">
          <div class="ruta-niveles">
            <span class="ruta-etq">Año</span>
            <div class="sec-anios" id="me-anios">
              ${HIST.anios.map(a => `<button type="button" class="anio-chip" data-a="${a}">${a}</button>`).join('')}
            </div>
          </div>
          <div class="segmentado" id="me-vars">
            ${Object.keys(VARIABLES).map(k =>
              `<button type="button" data-v="${k}">${VARIABLES[k].etq}</button>`).join('')}
          </div>
        </div>
        <div id="mapa-electoral"></div>
      </div>

      <div class="tarjeta panel-territorial" id="me-panel">
        <h2 class="tarjeta-tit">Lectura del mapa</h2>

        <dl class="pt-lista">
          <div><dt>Indicador</dt><dd id="me-indicador">—</dd></div>
          <div><dt>Año</dt><dd id="me-anio">—</dd></div>
          <div><dt>Nivel</dt><dd id="me-nivel">—</dd></div>
          <div><dt>Territorio</dt><dd id="me-territorio">—</dd></div>
        </dl>

        <div class="me-escala">
          <p class="pt-etq">Escala de color</p>
          <div class="grad-barra-h" id="me-grad"></div>
          <div class="me-escala-rot">
            <span id="me-min">—</span>
            <span class="me-escala-nota">menor → mayor</span>
            <span id="me-max">—</span>
          </div>
        </div>
      </div>
    </section>

    <section class="sec-kpis">
      ${tarjetaKPI('Votos válidos', fmtNum(ult.validos),
                   `${ult.anio} · ${delta(ult.validos, pri.validos)}`, true)}
      ${tarjetaKPI('Votos nulos', fmtNum(ult.nulos), `${fmtPct(ult.pctNulos)} de los emitidos`)}
      ${tarjetaKPI('Votos en blanco', fmtNum(ult.blancos), `${fmtPct(ult.pctBlancos)} de los emitidos`)}
      ${tarjetaKPI('Postulantes', sinPostulantes ? '—' : fmtNum(nPostulantes),
                   sinPostulantes ? `sin datos de candidaturas en ${ult.anio}` : `candidaturas en ${ult.anio}`)}
    </section>

    <section class="tarjeta sec-cabecera">
      <h2 class="tarjeta-tit">Evolución electoral · ${etq} · ${ambito}</h2>
      <p class="tarjeta-sub">Comparación automática de ${serie.map(s => s.anio).join(' · ')}${nota ? ' · ' + nota : ''}</p>${notaReplica}
      ${nota ? `<p class="sec-nota">Este ámbito reúne varias contiendas distintas:
        la primera fuerza y el índice de fragmentación describen el conjunto, no
        una elección concreta. Filtra hasta
        ${ambitoEleccion(f.dignidad)} para leerlos
        como una sola contienda.</p>` : ''}${notaLista}
    </section>

    <section class="tarjeta sec-tarjeta">
      <header><h2 class="tarjeta-tit">Fragmentación y organizaciones por año</h2>
        <p class="tarjeta-sub">
          Cuántas organizaciones se presentaron y cuántas resultaron efectivas
          según el índice 1 / Σ(pᵢ²)</p></header>
      <div class="lienzo alto" style="margin-top:12px"><canvas id="hg2"></canvas></div>
      <div class="tabla-scroll" style="margin-top:14px">
        <table class="tabla">
          <thead><tr>
            <th><button type="button">Año</button></th>
            <th class="num"><button type="button">Organizaciones</button></th>
            <th class="num"><button type="button">Índice de fragmentación</button></th>
            <th class="num"><button type="button">Concentración 1ª+2ª</button></th>
          </tr></thead>
          <tbody>${serie.map(s => `<tr>
            <td class="fuerte">${s.anio}</td>
            <td class="num">${fmtNum(s.nOrganizaciones)}</td>
            <td class="num fuerte">${dec(s.fragmentacion)}</td>
            <td class="num">${s.concentracion === null ? '—' : fmtPct(s.concentracion)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="sec-nota">
        El índice equivale al número efectivo de organizaciones: 1 significa que
        una sola concentra todo el voto y valores altos indican un escenario
        disperso. Siempre es menor que el número de organizaciones presentadas,
        porque las que sacan pocos votos apenas pesan.
      </p>
    </section>

    <section class="tarjeta sec-tarjeta">
      <header><h2 class="tarjeta-tit">Primer y segundo lugar por año</h2>
        <p class="tarjeta-sub">
          Organización más votada y su inmediata seguidora en cada elección de
          ${etq} en ${ambito}</p></header>
      <div class="lienzo alto" style="margin-top:12px"><canvas id="hg6"></canvas></div>
      ${hayCandidato ? '' : esLista ? `<p class="sec-nota" style="margin-top:10px">
        En esta dignidad cada organización presenta una lista con varios
        candidatos, así que se muestra la organización.</p>` : `<p class="sec-nota" style="margin-top:10px">
        Este ámbito reúne varias contiendas, así que cada organización presenta
        muchas candidaturas y no hay un nombre único que mostrar. Filtra hasta
        ${ambitoEleccion(f.dignidad)} para ver
        quién encabezó cada lista.</p>`}
      <div class="tabla-scroll" style="margin-top:14px">
        <table class="tabla">
          <thead><tr>
            <th><button type="button">Año</button></th>
            <th><button type="button">Primer lugar</button></th>
            <th class="num"><button type="button">Votos</button></th>
            <th><button type="button">Segundo lugar</button></th>
            <th class="num"><button type="button">Votos</button></th>
            <th class="num"><button type="button">Diferencia</button></th>
          </tr></thead>
          <tbody>${serie.map(s => `<tr>
            <td class="fuerte">${s.anio}</td>
            <td class="lugar-1">${s.primera ? celdaLugar(s.primera) : '—'}</td>
            <td class="num fuerte">${s.primera ? fmtNum(s.primera.votos) : '—'}</td>
            <td class="lugar-2">${s.segunda ? celdaLugar(s.segunda) : '—'}</td>
            <td class="num">${s.segunda ? fmtNum(s.segunda.votos) : '—'}</td>
            <td class="num">${(s.primera && s.segunda)
              ? fmtNum(s.primera.votos - s.segunda.votos) + ' · ' + fmtPct(s.margen) : '—'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </section>

    <section class="sec-grid-2">
      <article class="tarjeta grafico">
        <header><h2 class="tarjeta-tit">Composición del voto</h2>
          <p class="tarjeta-sub">Válidos, nulos y blancos por año</p></header>
        <div class="lienzo alto"><canvas id="hg1"></canvas></div>
      </article>
      <article class="tarjeta grafico">
        <header><h2 class="tarjeta-tit">Concentración y margen</h2>
          <p class="tarjeta-sub">Peso de las dos primeras fuerzas y distancia entre ellas</p></header>
        <div class="lienzo alto"><canvas id="hg3"></canvas></div>
      </article>
      <article class="tarjeta grafico">
        <header><h2 class="tarjeta-tit">Nulos y blancos</h2>
          <p class="tarjeta-sub">Porcentaje sobre los votos emitidos</p></header>
        <div class="lienzo"><canvas id="hg4"></canvas></div>
      </article>
      <article class="tarjeta grafico">
        <header><h2 class="tarjeta-tit">Principales organizaciones</h2>
          <p class="tarjeta-sub">Evolución de las cinco con más voto acumulado</p></header>
        <div class="lienzo"><canvas id="hg5"></canvas></div>
      </article>
    </section>

    <section class="tarjeta sec-cabecera">
      <h2 class="tarjeta-tit">🗳️ Resultados de la última elección · ${ult.anio}</h2>
      <p class="tarjeta-sub">${etq} · ${ambito} · ${fmtNum(ult.organizaciones.length)} organizaciones</p>
    </section>

    <section class="sec-grid-2">
      <article class="tarjeta sec-tarjeta">
        <header><h2 class="tarjeta-tit">Fuerzas políticas</h2>
          <p class="tarjeta-sub">${ult.anio}${nota ? ' · ' + nota : ''}</p></header>
        <div class="fuerza">
          <span class="sec-badge">Primera fuerza</span>
          <span class="fuerza-nom">${ult.primera ? tituloCase(ult.primera.op) : '—'}</span>
          <span class="fuerza-dato">${ult.primera ? fmtNum(ult.primera.votos) + ' votos · ' + fmtPct(ult.primera.pct) : ''}</span>
          <span class="fuerza-barra"><i style="width:${ult.primera ? Math.min(100, ult.primera.pct) : 0}%"></i></span>
        </div>
        <div class="fuerza segunda">
          <span class="sec-badge">Segunda fuerza</span>
          <span class="fuerza-nom">${ult.segunda ? tituloCase(ult.segunda.op) : '—'}</span>
          <span class="fuerza-dato">${ult.segunda ? fmtNum(ult.segunda.votos) + ' votos · ' + fmtPct(ult.segunda.pct) : ''}</span>
          <span class="fuerza-barra"><i style="width:${ult.segunda ? Math.min(100, ult.segunda.pct) : 0}%"></i></span>
        </div>
        <div class="pt-doble" style="margin-top:14px">
          <div><p class="pt-etq">Margen de victoria</p>
            <p class="pt-med">${ult.margen === null ? '—' : fmtPct(ult.margen)}</p></div>
          <div><p class="pt-etq">Fragmentación</p>
            <p class="pt-med">${dec(ult.fragmentacion)}</p></div>
        </div>
      </article>

      <article class="tarjeta sec-tarjeta">
        <header><h2 class="tarjeta-tit">${dist.titulo}</h2>
          <p class="tarjeta-sub">${dist.subtitulo}</p></header>
        <div class="tabla-scroll sec-scroll" style="margin-top:12px">
          <table class="tabla">
            <thead><tr><th><button type="button">${dist.columna}</button></th>
              <th class="num"><button type="button">Votos</button></th>
              <th class="num"><button type="button">%</button></th></tr></thead>
            <tbody>${dist.filas.length ? dist.filas.map(x => `<tr>
              <td class="fuerte">${tituloCase(x.nombre)}</td>
              <td class="num">${fmtNum(x.votos)}</td>
              <td class="num">${fmtPct(x.pct)}</td></tr>`).join('')
              : '<tr><td colspan="3" class="sec-vacio">Sin votos en este ámbito.</td></tr>'}</tbody>
          </table>
        </div>
      </article>
    </section>

    <section class="tarjeta sec-tarjeta">
      <header><h2 class="tarjeta-tit">Todas las organizaciones · ${ult.anio}</h2>
        <p class="tarjeta-sub">Orden por votos</p></header>
      <div class="tabla-scroll sec-scroll" style="margin-top:12px">
        <table class="tabla">
          <thead><tr><th class="num"><button type="button">Pos.</button></th>
            <th><button type="button">Organización política</button></th>
            <th class="num"><button type="button">Votos</button></th>
            <th class="num"><button type="button">%</button></th></tr></thead>
          <tbody>${ult.organizaciones.map((o, i) => `<tr${i === 0 ? ' class="fila-ganador"' : ''}>
            <td class="num">${i + 1}</td><td class="fuerte">${tituloCase(o.op)}</td>
            <td class="num">${fmtNum(o.votos)}</td>
            <td class="num">${fmtPct(o.pct)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </section>

`;

  graficarHistorico(serie, f.dignidad);

  /* El mapa arranca en el último año y conserva después lo que elija el
     usuario, sin que ningún otro elemento dependa de esa elección. */
  if (SEC.mapa.anio === null || HIST.anios.indexOf(SEC.mapa.anio) < 0) {
    SEC.mapa.anio = ult.anio;
  }
  cablearControlesMapa();
  pintarMapaElectoral();
}

/** Los controles del mapa repintan solo el mapa. */
function cablearControlesMapa() {
  document.querySelectorAll('#me-anios [data-a]').forEach(b => {
    b.onclick = () => { SEC.mapa.anio = parseInt(b.dataset.a, 10); pintarMapaElectoral(); };
  });
  document.querySelectorAll('#me-vars [data-v]').forEach(b => {
    b.onclick = () => { SEC.mapa.variable = b.dataset.v; pintarMapaElectoral(); };
  });
}

function graficarHistorico(serie, dignidad) {
  const acento = CONFIG.paleta[dignidad].acento;
  const rampa = CONFIG.paleta[dignidad].rampa;
  const años = serie.map(s => s.anio);
  const ejeY = { grid: { color: TEMA.grilla, drawBorder: false }, beginAtZero: true,
                 ticks: { color: TEMA.tenue, font: { family: TEMA.mono, size: 11 } } };
  const ejeX = { grid: { display: false, drawBorder: false },
                 ticks: { color: TEMA.texto, font: { family: TEMA.mono, size: 11.5 } } };
  const tip = { backgroundColor: '#0A111E', borderColor: '#2B3F5E', borderWidth: 1,
                padding: 10, bodyFont: { family: TEMA.mono, size: 12 } };
  const leyenda = { display: true, labels: { color: TEMA.texto, boxWidth: 9, boxHeight: 9,
                    usePointStyle: true, pointStyle: 'circle', font: { size: 11.5 } } };

  /* Un solo eje para las dos barras.
     Con ejes separados cada barra se medía con una regla distinta y un índice
     de 3 podía dibujarse más alto que 6 organizaciones. Compartiendo escala
     la comparación es directa, y como el índice nunca puede superar al número
     de organizaciones —es su número efectivo— su barra queda siempre por
     debajo, que es justo lo que debe leerse. */
  montarGrafico('hg2', 'hg2', {
    type: 'bar',
    data: { labels: años, datasets: [
      { label: 'Organizaciones presentadas', data: serie.map(s => s.nOrganizaciones),
        backgroundColor: '#3E4E66', borderRadius: 3, maxBarThickness: 46 },
      { label: 'Organizaciones efectivas (índice)', data: serie.map(s => s.fragmentacion),
        backgroundColor: acento, borderRadius: 3, maxBarThickness: 46 }
    ] },
    options: {
      scales: {
        x: ejeX,
        y: { ...ejeY,
             title: { display: true, text: 'Organizaciones', color: '#8FA0B8',
                      font: { size: 10.5 } } }
      },
      plugins: { legend: leyenda, tooltip: { ...tip, callbacks: {
        label: c => c.datasetIndex === 0
          ? ` ${fmtNum(c.parsed.y)} organizaciones presentadas`
          : ` ${dec(c.parsed.y)} organizaciones efectivas` } } }
    }
  });

  montarGrafico('hg1', 'hg1', {
    type: 'bar',
    data: { labels: años, datasets: [
      { label: 'Válidos', data: serie.map(s => s.validos), backgroundColor: rampa[3], borderRadius: 3 },
      { label: 'Nulos', data: serie.map(s => s.nulos), backgroundColor: rampa[1], borderRadius: 3 },
      { label: 'Blancos', data: serie.map(s => s.blancos), backgroundColor: '#3E4E66', borderRadius: 3 }
    ] },
    options: { scales: { x: ejeX, y: ejeY },
      plugins: { legend: leyenda, tooltip: { ...tip,
        callbacks: { label: c => ` ${c.dataset.label}: ${fmtNum(c.parsed.y)}` } } } }
  });

  montarGrafico('hg3', 'hg3', {
    type: 'line',
    data: { labels: años, datasets: [
      { label: 'Concentración (1ª + 2ª)', data: serie.map(s => s.concentracion),
        borderColor: rampa[3], backgroundColor: rampa[3], pointRadius: 4, borderWidth: 2.5, tension: .25 },
      { label: 'Margen de victoria', data: serie.map(s => s.margen),
        borderColor: TEMA.tenue, backgroundColor: TEMA.tenue, pointRadius: 4,
        borderWidth: 2, borderDash: [5, 4], tension: .25 }
    ] },
    options: { scales: { x: ejeX, y: { ...ejeY, ticks: { ...ejeY.ticks, callback: v => v + ' %' } } },
      plugins: { legend: leyenda, tooltip: { ...tip,
        callbacks: { label: c => ` ${c.dataset.label}: ${fmtPct(c.parsed.y)}` } } } }
  });

  montarGrafico('hg4', 'hg4', {
    type: 'line',
    data: { labels: años, datasets: [
      { label: 'Nulos', data: serie.map(s => s.pctNulos), borderColor: rampa[2],
        backgroundColor: rampa[2], pointRadius: 4, borderWidth: 2.5, tension: .25 },
      { label: 'Blancos', data: serie.map(s => s.pctBlancos), borderColor: '#6B7C96',
        backgroundColor: '#6B7C96', pointRadius: 4, borderWidth: 2.5, tension: .25 }
    ] },
    options: { scales: { x: ejeX, y: { ...ejeY, ticks: { ...ejeY.ticks, callback: v => v + ' %' } } },
      plugins: { legend: leyenda, tooltip: { ...tip,
        callbacks: { label: c => ` ${c.dataset.label}: ${fmtPct(c.parsed.y)}` } } } }
  });

  /* Primer y segundo lugar, año a año.
     Las dos barras comparten eje y se distinguen por color; el nombre de cada
     organización va en el tooltip y, siempre visible, en la tabla de abajo. */
  montarGrafico('hg6', 'hg6', {
    type: 'bar',
    data: { labels: años, datasets: [
      { label: 'Primer lugar', data: serie.map(s => s.primera ? s.primera.votos : 0),
        backgroundColor: acento, borderRadius: 3, maxBarThickness: 52 },
      { label: 'Segundo lugar', data: serie.map(s => s.segunda ? s.segunda.votos : 0),
        backgroundColor: '#3E4E66', borderRadius: 3, maxBarThickness: 52 }
    ] },
    options: {
      scales: { x: ejeX, y: { ...ejeY,
        title: { display: true, text: 'Votos', color: '#8FA0B8', font: { size: 10.5 } } } },
      plugins: {
        legend: leyenda,
        tooltip: { ...tip, callbacks: {
          title: (c) => String(c[0].label),
          label: (c) => {
            const i = c.dataIndex;
            const s = serie[i];
            const dato = c.datasetIndex === 0 ? s.primera : s.segunda;
            if (!dato) return ' Sin datos';
            const lineas = [` ${c.dataset.label}`];
            if (dato.candidato) lineas.push(' ' + tituloCase(dato.candidato));
            lineas.push(' ' + tituloCase(dato.op));
            lineas.push(` ${fmtNum(dato.votos)} votos · ${fmtPct(dato.pct)}`);
            return lineas;
          }
        } } }
    }
  });

  const acum = new Map();
  serie.forEach(s => s.organizaciones.forEach(o =>
    acum.set(o.op, (acum.get(o.op) || 0) + o.votos)));
  const top = [...acum.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
  const cols = [rampa[4], rampa[3], rampa[2], rampa[1], '#6B7C96'];

  montarGrafico('hg5', 'hg5', {
    type: 'line',
    data: { labels: años, datasets: top.map((op, i) => ({
      label: tituloCase(op).slice(0, 26),
      data: serie.map(s => { const o = s.organizaciones.find(x => x.op === op); return o ? o.pct : null; }),
      borderColor: cols[i], backgroundColor: cols[i], pointRadius: 3.5,
      borderWidth: 2.2, tension: .25, spanGaps: true
    })) },
    options: { scales: { x: ejeX, y: { ...ejeY, ticks: { ...ejeY.ticks, callback: v => v + ' %' } } },
      plugins: { legend: { ...leyenda, labels: { ...leyenda.labels, font: { size: 10.5 } } },
        tooltip: { ...tip, callbacks: { label: c => ` ${c.dataset.label}: ${fmtPct(c.parsed.y)}` } } } }
  });
}

/**
 * Reparto del voto en el nivel inmediatamente inferior al filtrado:
 * país → provincias, provincia → cantones, cantón → parroquias.
 */
function distribucionTerritorial(f, anio) {
  const nivel = f.cantK ? 'parroquia' : (f.provK ? 'canton' : 'provincia');
  const ai = HIST.iAnio.get(anio);
  const p = f.provK ? HIST.iProv.get(f.provK) : -1;
  const c = f.cantK ? HIST.iCant.get(f.cantK) : -1;

  const set = indicesDeParroquia(f.dignidad, f.provK, f.cantK, f.parrK);
  const acum = new Map();
  let total = 0;
  (HIST.votos[f.dignidad] || []).forEach(([a, fp, fc, fr, , v]) => {
    if (a !== ai) return;
    if (p >= 0 && fp !== p) return;
    if (c >= 0 && fc !== c) return;
    if (set && !set.has(fr)) return;
    const k = nivel === 'provincia' ? HIST.provincias[fp]
            : nivel === 'canton' ? HIST.cantones[fc] : HIST.parroquias[fr];
    acum.set(k, (acum.get(k) || 0) + v);
    total += v;
  });

  const filas = [...acum.entries()]
    .map(([nombre, votos]) => ({ nombre, votos, pct: total ? votos * 100 / total : 0 }))
    .sort((a, b) => b.votos - a.votos);

  return {
    nivel, filas,
    titulo: nivel === 'provincia' ? 'Distribución provincial'
          : nivel === 'canton' ? 'Distribución cantonal' : 'Distribución parroquial',
    subtitulo: nivel === 'provincia' ? `Votos por provincia · ${anio}`
             : nivel === 'canton' ? `Peso de cada cantón dentro de ${ambitoTexto({ provK: f.provK })} · ${anio}`
             : `Peso de cada parroquia dentro de ${ambitoTexto({ provK: f.provK, cantK: f.cantK })} · ${anio}`,
    columna: nivel === 'provincia' ? 'Provincia' : nivel === 'canton' ? 'Cantón' : 'Parroquia'
  };
}
