/* ============================================================================
   map.js — MOTOR CARTOGRÁFICO (Leaflet)
   Capas, coropletas, controles, leyenda dinámica y exportación de imagen.
   ========================================================================== */

const MAPA = {
  map: null,
  capas: {},
  control: {},
  clases: [],
  agregado: null,
  estado: null,
  boundsProvincia: null,
  /* contexto: mostrar el territorio que queda fuera del filtro. Desactivado
     por defecto: al elegir una provincia el mapa enseña solo esa provincia. */
  opciones: { divisiones: true, parroquias: true, contexto: false, etiquetas: false },
  onSeleccion: null          // callback inyectado desde app.js
};


/* ---------------------------------------------------------------------------
   ESTILOS
   ------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   ESTILOS

   Cada estilo declara `fill` y `stroke` de forma explícita.
   Leaflet FUSIONA las opciones en setStyle en lugar de reemplazarlas: si un
   estilo apaga `fill`, ningún estilo posterior que no lo vuelva a encender
   hará reaparecer el polígono. Sin esto, quitar un filtro dejaría el mapa
   en blanco de forma permanente.
   ------------------------------------------------------------------------- */

const ESTILO = {
  /* Territorio activo dentro del filtro: relleno según la escala de color */
  activo: (color) => ({
    fill: true, stroke: true,
    fillColor: color, fillOpacity: 0.88,
    color: '#FFFFFF', weight: 1, opacity: 0.9
  }),
  /* Territorio fuera del filtro, con el contexto activado: neutro */
  contexto: {
    fill: true, stroke: true,
    fillColor: CONFIG.paleta.contexto, fillOpacity: 0.55,
    color: '#C9D4E0', weight: 0.6, opacity: 0.7
  },
  /* Hover */
  resaltado: {
    fill: true, stroke: true,
    weight: 2.4, color: '#0A111E', fillOpacity: 0.97
  },
  /* Líneas divisorias internas (no interactivas) */
  divisionFina:  { fill: false, stroke: true, color: '#7C8FA6', weight: 0.7, opacity: 0.75, dashArray: null },
  divisionGruesa:{ fill: false, stroke: true, color: '#33445C', weight: 1.6, opacity: 0.9, dashArray: null },
  parroquial:    { fill: false, stroke: true, color: '#5C7A93', weight: 0.6, opacity: 0.85, dashArray: '3,3' },
  /* Territorio seleccionado */
  seleccion:     { fill: false, stroke: true, color: CONFIG.paleta.seleccion, weight: 3, opacity: 1 },
  /* Fuera del filtro: se retira del mapa por completo, sin relleno ni trazo */
  oculto:        { fill: false, stroke: false, fillOpacity: 0, opacity: 0 }
};


/* ---------------------------------------------------------------------------
   ALCANCE VISIBLE
   Con `contexto` desactivado (por defecto), al filtrar una provincia el mapa
   muestra solo ese territorio: ni relleno ni líneas divisorias del resto.
   ------------------------------------------------------------------------- */

/** ¿Este polígono forma parte del territorio filtrado? */
function enFoco(feature, estado, nivel) {
  if (estado.cantK && nivel === 'canton') {
    return feature.__provK === estado.provK && feature.__key === estado.cantK;
  }
  if (estado.provK) return feature.__provK === estado.provK;
  return true;
}

/** ¿Debe dibujarse esta línea divisoria? */
function lineaEnFoco(feature, estado, nivel) {
  if (MAPA.opciones.contexto) return true;   // el usuario pidió ver el entorno
  if (!estado.provK) return true;            // vista nacional: todo visible
  if (feature.__provK !== estado.provK) return false;

  /* Al enfocar un cantón concreto sobran los límites provinciales: quedarían
     dibujados alrededor de un territorio que ya no se muestra. */
  if (estado.cantK && nivel === 'canton') return feature.__nivel === 'canton';
  return true;
}


/* ---------------------------------------------------------------------------
   INICIALIZACIÓN
   ------------------------------------------------------------------------- */

function inicializarMapa() {
  /* Segunda red de seguridad: Leaflet lanza una excepción si se le pide
     inicializar un contenedor que ya tiene un mapa. */
  if (MAPA.map) return MAPA.map;

  const base = CONFIG.mapaBase.proveedores[CONFIG.mapaBase.fondo] || null;
  const zoomMax = base ? (base.maxZoom || 19) : 13;

  const map = L.map('mapa', {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: false,
    minZoom: 5,
    maxZoom: zoomMax,
    /* Nada de zoom por gesto: la rueda del ratón secuestraba el desplazamiento
       de la página y bastaba pasar por encima del mapa para descuadrarlo. El
       zoom sigue disponible en los botones + / − y en el encuadre automático
       de los filtros. */
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false
  }).setView(CONFIG.vistaEcuador.centro, CONFIG.vistaEcuador.zoom);

  /* Lienzo limpio: el color del contenedor hace de fondo cuando no hay
     teselas, y así el mapa no depende de ningún servicio externo. */
  const cont = document.getElementById('mapa');
  if (cont) cont.style.background = CONFIG.mapaBase.color;

  if (base) {
    L.tileLayer(base.url, {
      attribution: base.atribucion,
      subdomains: base.subdominios || 'abc',
      maxZoom: base.maxZoom || 19,
      crossOrigin: 'anonymous'
    }).addTo(map);
  } else if (CONFIG.mapaBase.credito && map.attributionControl) {
    map.attributionControl.addAttribution(CONFIG.mapaBase.credito);
  }

  /* Planos de dibujo: relleno abajo, líneas al medio, selección arriba. */
  map.createPane('paneTerritorios').style.zIndex = 410;
  const pd = map.createPane('paneDivisiones');
  pd.style.zIndex = 425; pd.style.pointerEvents = 'none';
  const ps = map.createPane('paneSeleccion');
  ps.style.zIndex = 440; ps.style.pointerEvents = 'none';
  const pe = map.createPane('paneEtiquetas');
  pe.style.zIndex = 450; pe.style.pointerEvents = 'none';

  MAPA.map = map;

  /* — Capas de relleno (interactivas) — */
  MAPA.capas.provincias = L.geoJSON(DATOS.geo.provincias, {
    pane: 'paneTerritorios',
    style: () => ESTILO.contexto,
    onEachFeature: (f, l) => enlazarInteraccion(f, l, 'provincia')
  });

  MAPA.capas.cantones = L.geoJSON(DATOS.geo.cantones, {
    pane: 'paneTerritorios',
    style: () => ESTILO.contexto,
    onEachFeature: (f, l) => enlazarInteraccion(f, l, 'canton')
  });

  /* — Capas de líneas (no interactivas) — */
  MAPA.capas.divCantonal = L.geoJSON(DATOS.geo.cantones, {
    pane: 'paneDivisiones', interactive: false, style: () => ESTILO.divisionFina
  });
  MAPA.capas.divProvincial = L.geoJSON(DATOS.geo.provincias, {
    pane: 'paneDivisiones', interactive: false, style: () => ESTILO.divisionGruesa
  });

  MAPA.capas.seleccion = L.geoJSON(null, {
    pane: 'paneSeleccion', interactive: false, style: () => ESTILO.seleccion
  }).addTo(map);

  MAPA.capas.etiquetas = L.layerGroup([], { pane: 'paneEtiquetas' }).addTo(map);

  agregarControles(map);
  return map;
}


/* ---------------------------------------------------------------------------
   INTERACCIÓN CON LOS POLÍGONOS
   ------------------------------------------------------------------------- */

function enlazarInteraccion(feature, layer, nivel) {
  layer.on({
    mouseover: (e) => {
      if (!layer.__activo) return;
      e.target.setStyle(ESTILO.resaltado);
      e.target.bringToFront();
    },
    mouseout: (e) => {
      if (!layer.__activo) return;
      e.target.setStyle(ESTILO.activo(layer.__color));
    },
    click: () => {
      /* Un territorio fuera del filtro está oculto: no debe responder al
         clic aunque su polígono siga en el DOM. */
      if (!layer.__activo) return;
      if (typeof MAPA.onSeleccion === 'function') {
        MAPA.onSeleccion({
          nivel,
          provK: feature.__provK,
          cantK: nivel === 'canton' ? feature.__key : '',
          nombre: feature.__nombre,
          provincia: feature.__provNombre
        });
      }
    }
  });
}

/** Construye el HTML del tooltip de un territorio. */
function tooltipHTML(feature, nivel, dato, estado) {
  const dig = CONFIG.dignidades.find(d => d.id === estado.dignidad);
  const nivelTxt = nivel === 'provincia' ? 'Provincial' : 'Cantonal';
  const valor = dato ? dato.valor : 0;
  const pct   = dato ? dato.pct : 0;
  const rank  = dato ? dato.ranking : '—';
  const dens  = dato && dato.porCienMil !== null && dato.porCienMil !== undefined
    ? dato.porCienMil : null;

  return `
    <div class="tt">
      <div class="tt-titulo">${feature.__nombre}</div>
      ${nivel === 'canton'
        ? `<div class="tt-sub">${tituloCase(feature.__provNombre)}</div>` : ''}
      <div class="tt-metricas">
        <div><span>Preinscritos</span><b>${fmtNum(valor)}</b></div>
        <div><span>Participación</span><b>${fmtPct(pct)}</b></div>
        <div><span>Ranking</span><b>${rank === '—' ? '—' : '#' + rank}</b></div>
        ${dens !== null
          ? `<div><span>Por 100 mil electores</span><b>${dens.toLocaleString('es-EC',
              { maximumFractionDigits: 1 })}</b></div>` : ''}
      </div>
      <div class="tt-pie">
        <span class="tt-chip">${dig.etiqueta}</span>
        <span class="tt-chip">Nivel ${nivelTxt}</span>
      </div>
    </div>`;
}


/* ---------------------------------------------------------------------------
   REPINTADO PRINCIPAL
   ------------------------------------------------------------------------- */

/**
 * Repinta el mapa completo.
 * @param {object} estado   filtros activos {dignidad, provK, cantK}
 * @param {object} agregado resultado de agregar() al nivel principal
 */
function pintarMapa(estado, agregado) {
  const map = MAPA.map;
  MAPA.estado = estado;
  MAPA.agregado = agregado;

  const dig   = CONFIG.dignidades.find(d => d.id === estado.dignidad);
  const nivel = dig.nivel;

  /* 1 · Cortes de la escala de color.
     El rango se calcula sobre los territorios que se están comparando entre
     sí: todas las provincias en análisis provincial, y los cantones de la
     provincia enfocada en análisis cantonal. Así el contraste no se pierde
     al entrar en una provincia con valores homogéneos. */
  const valoresEscala = agregado.filas
    .filter(f => nivel === 'provincia' || !estado.provK || f.provK === estado.provK)
    .map(f => f.valor);
  MAPA.clases = calcularCortes(valoresEscala);

  /* 2 · Elegir capa de relleno y capa de líneas según la dignidad */
  const capaRelleno = nivel === 'provincia' ? MAPA.capas.provincias : MAPA.capas.cantones;
  const capaOtra    = nivel === 'provincia' ? MAPA.capas.cantones   : MAPA.capas.provincias;
  const capaLineas  = nivel === 'provincia' ? MAPA.capas.divCantonal : MAPA.capas.divProvincial;
  const otrasLineas = nivel === 'provincia' ? MAPA.capas.divProvincial : MAPA.capas.divCantonal;

  if (map.hasLayer(capaOtra)) map.removeLayer(capaOtra);
  if (!map.hasLayer(capaRelleno)) capaRelleno.addTo(map);

  if (map.hasLayer(otrasLineas)) map.removeLayer(otrasLineas);
  if (MAPA.opciones.divisiones) { if (!map.hasLayer(capaLineas)) capaLineas.addTo(map); }
  else if (map.hasLayer(capaLineas)) map.removeLayer(capaLineas);

  /* Divisiones parroquiales: solo las del cantón enfocado.
     Dibujar las ~1.000 parroquias del país a la vez ralentiza el mapa sin
     aportar nada, porque solo se ven las del territorio en foco.
     Va aislada: es una capa opcional y su fallo no debe tumbar la coropleta. */
  MAPA.parroquiasVisibles = [];
  try {
    if (DATOS.geo.parroquias) {
      if (!MAPA.capas.parroquias) {
        MAPA.capas.parroquias = L.geoJSON(null, {
          pane: 'paneDivisiones', interactive: false, style: () => ESTILO.parroquial
        });
      }
      const clave = estado.provK + '|' + estado.cantK;
      const parrs = (MAPA.opciones.parroquias && estado.cantK && nivel === 'canton')
        ? (TERRITORIO.parroquiasPorCant.get(clave) || []) : [];

      MAPA.capas.parroquias.clearLayers();
      if (parrs.length) {
        MAPA.capas.parroquias.addData({ type: 'FeatureCollection', features: parrs });
        if (!map.hasLayer(MAPA.capas.parroquias)) MAPA.capas.parroquias.addTo(map);
        MAPA.parroquiasVisibles = parrs;
      } else if (map.hasLayer(MAPA.capas.parroquias)) {
        map.removeLayer(MAPA.capas.parroquias);
      }
    }
  } catch (e) {
    console.warn('[Dashboard] capa parroquial omitida:', e);
    MAPA.parroquiasVisibles = [];
  }

  /* 3 · Estilar cada polígono */
  capaRelleno.eachLayer(l => {
    const f = l.feature;
    const dato = nivel === 'provincia'
      ? agregado.indice.get(f.__provK)
      : agregado.indice.get(f.__provK + '|' + f.__key);
    const dentro = enFoco(f, estado, nivel);

    if (dentro) {
      const color = dato ? colorDe(dato.valor, MAPA.clases, estado.dignidad)
                         : CONFIG.paleta.sinDatos;
      l.__activo = true; l.__color = color;
      l.setStyle(ESTILO.activo(color));
    } else if (MAPA.opciones.contexto) {
      l.__activo = false;
      l.setStyle(ESTILO.contexto);
    } else {
      /* Fuera del filtro y sin contexto: desaparece del mapa. */
      l.__activo = false;
      l.setStyle(ESTILO.oculto);
    }

    l.unbindTooltip();
    if (l.__activo) {
      l.bindTooltip(() => tooltipHTML(f, nivel, dato, estado), {
        sticky: true, direction: 'top', className: 'tt-wrap', opacity: 1
      });
    }
  });

  /* Las líneas divisorias se recortan al territorio filtrado. */
  capaLineas.setStyle(f => lineaEnFoco(f, estado, nivel)
    ? (nivel === 'provincia' ? ESTILO.divisionFina : ESTILO.divisionGruesa)
    : ESTILO.oculto);

  /* 4 · Contorno del territorio seleccionado */
  MAPA.capas.seleccion.clearLayers();
  const sel = territorioSeleccionado(estado);
  if (sel) MAPA.capas.seleccion.addData(sel.feature);

  /* 5 · Etiquetas, leyenda y controles.
     Son adornos del mapa: si alguno falla, la coropleta ya está pintada y
     el tablero debe seguir siendo usable. */
  try {
    pintarEtiquetas(estado, agregado, nivel);
    MAPA.control.leyenda && MAPA.control.leyenda.actualizar();
    MAPA.control.navegacion && MAPA.control.navegacion.actualizar();
    MAPA.control.capas && MAPA.control.capas.actualizar();
  } catch (e) {
    console.warn('[Dashboard] controles del mapa:', e);
  }
}

/** Devuelve el objeto territorial actualmente seleccionado, si lo hay. */
function territorioSeleccionado(estado) {
  if (estado.cantK) return TERRITORIO.porCantK.get(estado.provK + '|' + estado.cantK);
  if (estado.provK) return TERRITORIO.porProvK.get(estado.provK);
  return null;
}

/** Etiquetas de nombre sobre los polígonos (opcional, evita saturar). */
function pintarEtiquetas(estado, agregado, nivel) {
  MAPA.capas.etiquetas.clearLayers();
  if (!MAPA.opciones.etiquetas) return;

  const poner = (feature, texto, valor, clase) => {
    const c = L.geoJSON(feature).getBounds().getCenter();
    L.marker(c, {
      pane: 'paneEtiquetas', interactive: false,
      icon: L.divIcon({ className: 'etq-mapa ' + clase,
        html: `<span>${texto}</span>${valor !== null ? `<b>${valor}</b>` : ''}`,
        iconSize: [null, null] })
    }).addTo(MAPA.capas.etiquetas);
  };

  /* Al enfocar un cantón con capa parroquial, la etiqueta útil es la parroquia. */
  if (MAPA.parroquiasVisibles && MAPA.parroquiasVisibles.length &&
      MAPA.parroquiasVisibles.length <= 45) {
    MAPA.parroquiasVisibles.forEach(f =>
      poner(f, tituloCase(f.__nombre), null, 'etq-parroquia'));
    return;
  }

  const visibles = agregado.filas.filter(f => f.geo &&
    (!estado.provK || f.provK === estado.provK) &&
    (!estado.cantK || f.key === estado.cantK));
  if (visibles.length > 45) return;   // demasiadas etiquetas: se omiten

  visibles.forEach(f => poner(f.geo.feature, f.nombre, fmtNum(f.valor), ''));
}


/* ---------------------------------------------------------------------------
   ZOOM Y NAVEGACIÓN
   ------------------------------------------------------------------------- */

function irAEcuador(animar = true) {
  MAPA.map.setView(CONFIG.vistaEcuador.centro, CONFIG.vistaEcuador.zoom, { animate: animar });
}

function irAProvincia(provK, animar = true) {
  const p = TERRITORIO.porProvK.get(provK);
  if (!p) return irAEcuador(animar);
  const b = L.geoJSON(p.feature).getBounds();
  MAPA.boundsProvincia = b;
  MAPA.map.fitBounds(b, { padding: [28, 28], animate: animar });
}

function irACanton(provK, cantK, animar = true) {
  const c = TERRITORIO.porCantK.get(provK + '|' + cantK);
  if (!c) return irAProvincia(provK, animar);
  /* Se deja holgura para conservar el contexto territorial alrededor. */
  const b = L.geoJSON(c.feature).getBounds().pad(0.55);
  MAPA.map.fitBounds(b, { padding: [24, 24], animate: animar });
}

/** Encuadre automático coherente con los filtros activos. */
function encuadrar(estado, animar = true) {
  if (estado.cantK)      irACanton(estado.provK, estado.cantK, animar);
  else if (estado.provK) irAProvincia(estado.provK, animar);
  else                   irAEcuador(animar);
}


/* ---------------------------------------------------------------------------
   CONTROLES
   ------------------------------------------------------------------------- */

function agregarControles(map) {
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 140 }).addTo(map);

  /* — Navegación: Ecuador / Provincia / Pantalla completa — */
  const Nav = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const c = L.DomUtil.create('div', 'leaflet-bar ctrl-nav');
      c.innerHTML = `
        <button type="button" data-a="ecuador" title="Volver a Ecuador">${ICO.pais}</button>
        <button type="button" data-a="provincia" title="Volver a la provincia">${ICO.provincia}</button>
        <button type="button" data-a="pantalla" title="Pantalla completa">${ICO.expandir}</button>`;
      L.DomEvent.disableClickPropagation(c);
      c.querySelector('[data-a=ecuador]').onclick = () => {
        MAPA.onSeleccion && MAPA.onSeleccion({ nivel: 'pais' });
      };
      c.querySelector('[data-a=provincia]').onclick = () => {
        MAPA.onSeleccion && MAPA.onSeleccion({ nivel: 'volverProvincia' });
      };
      c.querySelector('[data-a=pantalla]').onclick = () => alternarPantallaCompleta();
      this._c = c;
      return c;
    },
    actualizar() {
      if (!this._c || !MAPA.estado) return;
      const b = this._c.querySelector('[data-a=provincia]');
      b.disabled = !MAPA.estado.provK;
    }
  });
  MAPA.control.navegacion = new Nav().addTo(map);

  /* — Control de capas — */
  const Capas = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const c = L.DomUtil.create('div', 'leaflet-bar ctrl-capas');
      c.innerHTML = `
        <button type="button" class="ctrl-capas-btn" title="Capas">${ICO.capas}</button>
        <div class="ctrl-capas-panel">
          <p>Capas del mapa</p>
          <label><input type="checkbox" data-o="divisiones" checked><span>Divisiones internas</span></label>
          <label data-parr class="off">
            <input type="checkbox" data-o="parroquias" checked disabled>
            <span>División parroquial <em>cargando…</em></span></label>
          <label><input type="checkbox" data-o="contexto"><span>Territorio circundante</span></label>
          <label><input type="checkbox" data-o="etiquetas"><span>Etiquetas de territorio</span></label>
        </div>`;
      L.DomEvent.disableClickPropagation(c);
      L.DomEvent.disableScrollPropagation(c);
      c.querySelector('.ctrl-capas-btn').onclick = () => c.classList.toggle('abierto');
      c.querySelectorAll('input[data-o]').forEach(inp => {
        inp.onchange = () => {
          MAPA.opciones[inp.dataset.o] = inp.checked;
          pintarMapa(MAPA.estado, MAPA.agregado);
        };
      });
      this._c = c;
      return c;
    },
    /* La capa parroquial llega después del primer pintado: el control
       refleja su estado real en cuanto está disponible. */
    actualizar() {
      if (!this._c) return;
      const fila = this._c.querySelector('[data-parr]');
      const inp = fila.querySelector('input');
      const lista = TERRITORIO.parroquiasPorCant.size > 0;
      if (lista === !inp.disabled) return;
      inp.disabled = !lista;
      fila.classList.toggle('off', !lista);
      fila.querySelector('em').textContent = lista ? '' : 'no disponible';
    }
  });
  MAPA.control.capas = new Capas().addTo(map);

  /* — Leyenda dinámica — */
  const Leyenda = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      this._c = L.DomUtil.create('div', 'ctrl-leyenda');
      L.DomEvent.disableClickPropagation(this._c);
      return this._c;
    },
    actualizar() {
      if (!this._c || !MAPA.estado) return;
      const est = MAPA.estado;
      const dig = CONFIG.dignidades.find(d => d.id === est.dignidad);
      const nivelTxt = dig.nivel === 'provincia' ? 'provincia' : 'cantón';
      const clases = MAPA.clases;

      let filas = clases.map((c, i) => {
        const color = colorDe(c.desde, clases, est.dignidad);
        const etq = c.desde === c.hasta ? fmtNum(c.desde)
                                        : `${fmtNum(c.desde)} – ${fmtNum(c.hasta)}`;
        return `<li><i style="background:${color}"></i><span>${etq}</span></li>`;
      }).join('');

      if (!clases.length) filas = '<li class="vacio">Sin registros para el filtro actual</li>';

      /* El alcance de la escala se hace explícito para evitar lecturas
         erróneas al comparar mapas de distintos filtros. */
      const alcance = (dig.nivel === 'canton' && est.provK)
        ? tituloCase((TERRITORIO.porProvK.get(est.provK) || {}).nombre || '')
        : 'nacional';

      this._c.innerHTML = `
        <div class="ley-cab">
          <strong>Preinscritos</strong>
          <em>por ${nivelTxt} · ${alcance}</em>
        </div>
        <ul class="ley-lista">${filas}</ul>
        <div class="ley-pie"><i style="background:${CONFIG.paleta.sinDatos}"></i>
          <span>Sin registros</span></div>`;
    }
  });
  MAPA.control.leyenda = new Leyenda().addTo(map);
}

/** Pantalla completa sobre el contenedor del mapa. */
function alternarPantallaCompleta() {
  const el = document.getElementById('mapa-shell');
  if (!document.fullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
  setTimeout(() => MAPA.map.invalidateSize(), 250);
}


/* ---------------------------------------------------------------------------
   EXPORTACIÓN DEL MAPA A PNG
   Se dibuja con Canvas a partir de la geometría proyectada: no depende de
   los tiles del mapa base, así que nunca falla por CORS.
   ------------------------------------------------------------------------- */

function descargarMapaPNG() {
  const est = MAPA.estado, agg = MAPA.agregado;
  const dig = CONFIG.dignidades.find(d => d.id === est.dignidad);
  const nivel = dig.nivel;

  const W = 1600, H = 1100, MT = 150, MB = 90;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

  /* Geometrías a dibujar: foco + contexto */
  const capaRelleno = nivel === 'provincia' ? MAPA.capas.provincias : MAPA.capas.cantones;
  const feats = [];
  capaRelleno.eachLayer(l => feats.push({ f: l.feature, activo: !!l.__activo, color: l.__color }));

  /* Extensión: los territorios en foco */
  const foco = feats.filter(x => x.activo);
  const lista = foco.length ? foco : feats;
  let minX = 180, maxX = -180, minY = 90, maxY = -90;
  lista.forEach(x => recorrer(x.f.geometry, (lng, lat) => {
    if (lng < minX) minX = lng; if (lng > maxX) maxX = lng;
    if (lat < minY) minY = lat; if (lat > maxY) maxY = lat;
  }));

  const padX = (maxX - minX) * 0.06, padY = (maxY - minY) * 0.06;
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;

  const areaW = W - 80, areaH = H - MT - MB;
  const latMed = (minY + maxY) / 2 * Math.PI / 180;
  const anchoGeo = (maxX - minX) * Math.cos(latMed), altoGeo = (maxY - minY);
  const esc = Math.min(areaW / anchoGeo, areaH / altoGeo);
  const offX = 40 + (areaW - anchoGeo * esc) / 2;
  const offY = MT + (areaH - altoGeo * esc) / 2;

  const px = (lng) => offX + (lng - minX) * Math.cos(latMed) * esc;
  const py = (lat) => offY + (maxY - lat) * esc;

  const trazar = (geom) => {
    ctx.beginPath();
    const anillos = geom.type === 'Polygon' ? geom.coordinates
                   : geom.coordinates.reduce((a, p) => a.concat(p), []);
    anillos.forEach(anillo => {
      anillo.forEach((c, i) => {
        const x = px(c[0]), y = py(c[1]);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
    });
  };

  /* Contexto en gris claro */
  feats.filter(x => !x.activo).forEach(x => {
    trazar(x.f.geometry);
    ctx.fillStyle = CONFIG.paleta.contexto; ctx.fill();
    ctx.strokeStyle = '#D5DEE8'; ctx.lineWidth = 0.8; ctx.stroke();
  });
  /* Territorios en foco con su color de la escala */
  foco.forEach(x => {
    trazar(x.f.geometry);
    ctx.fillStyle = x.color || CONFIG.paleta.sinDatos; ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.2; ctx.stroke();
  });
  /* Contorno del territorio seleccionado */
  const sel = territorioSeleccionado(est);
  if (sel) {
    trazar(sel.feature.geometry);
    ctx.strokeStyle = CONFIG.paleta.seleccion; ctx.lineWidth = 3; ctx.stroke();
  }

  /* — Cartela — */
  const acento = CONFIG.paleta[est.dignidad].acento;
  ctx.fillStyle = '#0A111E'; ctx.fillRect(0, 0, W, 96);
  ctx.fillStyle = acento;    ctx.fillRect(0, 96, W, 5);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 30px Archivo, Arial, sans-serif';
  ctx.fillText(CONFIG.marca.titulo, 40, 46);
  ctx.fillStyle = '#9FB3CC';
  ctx.font = '400 17px "IBM Plex Sans", Arial, sans-serif';
  const p = est.provK ? (TERRITORIO.porProvK.get(est.provK) || {}).nombre : 'Todas las provincias';
  const c = est.cantK ? (TERRITORIO.porCantK.get(est.provK + '|' + est.cantK) || {}).nombre : null;
  ctx.fillText(`${dig.etiqueta}  ·  ${tituloCase(p)}${c ? '  ·  ' + tituloCase(c) : ''}`, 40, 76);

  /* — Leyenda — */
  let ly = MT + 12;
  ctx.fillStyle = '#0A111E';
  ctx.font = '700 15px "IBM Plex Mono", monospace';
  ctx.fillText('PREINSCRITOS', 44, ly);
  ly += 16;
  MAPA.clases.forEach(cl => {
    ctx.fillStyle = colorDe(cl.desde, MAPA.clases, est.dignidad);
    ctx.fillRect(44, ly, 20, 12);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1; ctx.strokeRect(44, ly, 20, 12);
    ctx.fillStyle = '#33445C';
    ctx.font = '400 14px "IBM Plex Mono", monospace';
    ctx.fillText(cl.desde === cl.hasta ? fmtNum(cl.desde)
                 : `${fmtNum(cl.desde)} – ${fmtNum(cl.hasta)}`, 72, ly + 11);
    ly += 19;
  });

  /* — Pie — */
  ctx.fillStyle = '#F4F6F9'; ctx.fillRect(0, H - MB + 20, W, MB - 20);
  ctx.fillStyle = '#5A6E88';
  ctx.font = '400 14px "IBM Plex Sans", Arial, sans-serif';
  ctx.fillText(`${CONFIG.marca.empresa}  ·  ${CONFIG.marca.ciclo}` +
    (DATOS.modoDemo ? '  ·  MODO DEMOSTRACIÓN' : ''), 40, H - 42);
  ctx.fillText(`Total ${fmtNum(agg.total)} preinscritos  ·  ` +
    `${agg.filas.length} territorios  ·  ${new Date().toLocaleDateString('es-EC')}`, 40, H - 20);

  const a = document.createElement('a');
  a.download = `mapa_${est.dignidad.toLowerCase()}_${Date.now()}.png`;
  a.href = cv.toDataURL('image/png');
  a.click();
}

/** Recorre todas las coordenadas de una geometría. */
function recorrer(geom, cb) {
  const anillos = geom.type === 'Polygon' ? geom.coordinates
                 : geom.coordinates.reduce((a, p) => a.concat(p), []);
  anillos.forEach(an => an.forEach(c => cb(c[0], c[1])));
}


/* ---------------------------------------------------------------------------
   ICONOS SVG (inline, sin dependencias externas)
   ------------------------------------------------------------------------- */

const ICO = {
  pais:      '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16"/></svg>',
  provincia: '<svg viewBox="0 0 24 24"><path d="M4 7l5-2 6 2 5-2v12l-5 2-6-2-5 2z"/><path d="M9 5v12M15 7v12"/></svg>',
  expandir:  '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  capas:     '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>'
};
