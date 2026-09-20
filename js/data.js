/* ============================================================================
   data.js — CAPA DE DATOS
   Carga de GeoJSON + Excel, detección de columnas y cruce territorial.

   ▸ TODO lo que necesitas editar está en el bloque CONFIG (abajo).
     Cada punto editable está marcado con  ✏️ EDITAR
   ========================================================================== */

const CONFIG = {

  /* Versión del tablero. Aparece al pie del panel lateral y en la consola
     del navegador: sirve para comprobar de un vistazo que no se está
     ejecutando una copia antigua guardada en la caché.                    */
  version: '3.5',

  /* ── ✏️ EDITAR · MARCA ───────────────────────────────────────────────────
     Nombre de tu consultora, títulos del encabezado y logo.               */
  marca: {
    empresa:   'INTELIGENCIA TERRITORIAL',      // nombre de la empresa
    titulo:    'ANÁLISIS ELECTORAL TERRITORIAL',
    subtitulo: 'Plataforma de inteligencia geográfica y análisis de preinscritos',
    logo:      'assets/logo.svg',               // reemplaza por tu logo.png
    ciclo:     'Elecciones Seccionales 2027'
  },

  /* ── ✏️ EDITAR · ARCHIVOS ────────────────────────────────────────────────
     Rutas relativas dentro de la carpeta del proyecto.
     Copia aquí tus archivos desde C:\Users\Admin\Downloads\Carpeta\SHP\   */
  archivos: {
    provincias: 'data/provincias.geojson',
    cantones:   'data/cantones.geojson',
    parroquias: 'data/parroquias.geojson',   // opcional: si no existe, se ignora
    excel:      'data/preinscritos.xlsx',    // cambia el nombre si es distinto
    /* Resultados de la elección de 2023, ya agregados por cantón.
       Se genera con preparar_resultados.py a partir del TSV original.
       Si el archivo no está, el tablero funciona igual sin ese bloque.   */
    resultados: 'data/resultados2023.json',
    /* Electores por provincia y cantón, del distributivo de recintos.
       Se genera con preparar_electores.py.                              */
    electores:  'data/electores.json'
  },

  /* ── ✏️ EDITAR · PROPIEDADES DEL GEOJSON ─────────────────────────────────
     Deja null para que se detecten automáticamente.
     Si tu GeoJSON usa otros nombres (ej. 'DPA_DESPRO'), escríbelos aquí.  */
  camposGeo: {
    provincia:       { codigo: null, nombre: null },  // ej: {codigo:'DPA_PROVIN', nombre:'DPA_DESPRO'}
    canton:          { codigo: null, nombre: null },  // ej: {codigo:'DPA_CANTON', nombre:'DPA_DESCAN'}
    parroquia:       { codigo: null, nombre: null }
  },

  /* Candidatos de nombre para autodetección de propiedades del GeoJSON.
     Se comparan normalizados (sin tildes, mayúsculas, sin símbolos).      */
  candidatosGeo: {
    provCodigo: ['DPA_PROVIN', 'DPA_PROV', 'COD_PROVINCIA', 'CODIGO_PROVINCIA', 'IDPROV', 'PROV_ID'],
    provNombre: ['DPA_DESPRO', 'PROVINCIA', 'PROVINCE', 'NOM_PROVINCIA', 'NOMBRE_PROVINCIA', 'PROV'],
    cantCodigo: ['DPA_CANTON', 'DPA_CANT', 'COD_CANTON', 'CODIGO_CANTON', 'IDCANT', 'CANT_ID'],
    cantNombre: ['DPA_DESCAN', 'CANTON', 'CANTÓN', 'NOM_CANTON', 'NOMBRE_CANTON', 'MUNICIPIO'],
    parrCodigo: ['DPA_PARROQ', 'COD_PARROQUIA', 'CODIGO_PARROQUIA'],
    parrNombre: ['DPA_DESPAR', 'PARROQUIA', 'NOM_PARROQUIA', 'NOMBRE_PARROQUIA'],
    /* Opcional: habilita la métrica de preinscritos por 100.000 habitantes. */
    poblacion:  ['POBLACION', 'DPA_POBL_TOTAL', 'POB_TOTAL', 'HABITANTES', 'TOTAL_POBLACION']
  },

  /* ── ✏️ EDITAR · COLUMNAS DEL EXCEL ──────────────────────────────────────
     Nombres posibles de cada columna. El primero que exista se usa.
     Si tu base tiene otro encabezado, agrégalo al inicio de la lista.     */
  columnasExcel: {
    dignidad:    ['DIGNIDAD', 'DIGNIDAD_NOMBRE', 'CARGO'],
    provincia:   ['PROVINCIA', 'PROVINCIA_NOMBRE', 'NOMBRE_PROVINCIA'],
    provCodigo:  ['PROVINCIA_CODIGO', 'COD_PROVINCIA', 'DPA_PROVIN'],
    canton:      ['CANTON', 'CANTÓN', 'CANTON_NOMBRE', 'NOMBRE_CANTON'],
    cantCodigo:  ['CANTON_CODIGO', 'COD_CANTON', 'DPA_CANTON'],
    parroquia:   ['PARROQUIA', 'PARROQUIA_NOMBRE', 'NOMBRE_PARROQUIA'],
    parrCodigo:  ['PARROQUIA_CODIGO', 'COD_PARROQUIA', 'DPA_PARROQ'],
    partido:     ['PARTIDO', 'ORGANIZACION_POLITICA', 'ORGANIZACIÓN POLÍTICA', 'MOVIMIENTO'],
    lista:       ['LISTA', 'NUMERO_LISTA', 'LISTA_NUMERO'],
    nombre:      ['NOMBRE', 'CANDIDATO', 'NOMBRE_CANDIDATO', 'NOMBRES'],
    cedula:      ['CEDULA', 'CÉDULA', 'IDENTIFICACION', 'DOCUMENTO'],
    /* Columna OPCIONAL con el conteo ya agregado.
       Si NO existe, el sistema cuenta un preinscrito por fila.           */
    preinscritos:['PREINSCRITOS', 'TOTAL_PREINSCRITOS', 'NUM_PREINSCRITOS', 'CANTIDAD']
  },

  /* Columnas mínimas obligatorias: si faltan, se muestra el panel de error */
  columnasObligatorias: ['dignidad', 'provincia'],

  /* ── ✏️ EDITAR · DIGNIDADES ──────────────────────────────────────────────
     'clave' identifica el valor en el Excel (se busca como texto contenido).
     'nivel' define el nivel geográfico principal del análisis.            */
  dignidades: [
    { id: 'PREFECTOS', etiqueta: 'Prefectos', clave: 'PREFECT',
      nivel: 'provincia', descripcion: 'Análisis provincial' },
    { id: 'ALCALDES',  etiqueta: 'Alcaldes',  clave: 'ALCALD',
      nivel: 'canton',   descripcion: 'Análisis cantonal' }
  ],
  dignidadPorDefecto: 'PREFECTOS',

  /* ── ✏️ EDITAR · DIGNIDADES SOLO DEL HISTÓRICO ───────────────────────────
     Se añaden, debajo de las anteriores, únicamente en Histórico electoral:
     Preinscritos no las usa. Sus datos están en data/historico_dignidades.json
     (preparar_historico_dignidades.py) y cada botón aparece solo si hay datos
     para el usuario que entra.
     'eleccion' es el ámbito en que se elige la dignidad.                  */
  dignidadesHistorico: [
    { id: 'CONCEJALES', etiqueta: 'Concejales', eleccion: 'canton',
      descripcion: 'Análisis cantonal' },
    { id: 'VOCALES', etiqueta: 'Vocales de juntas parroquiales', eleccion: 'parroquia',
      descripcion: 'Análisis parroquial' }
  ],

  /* ── ✏️ EDITAR · COLORES ─────────────────────────────────────────────────
     Escala secuencial de 5 clases por dignidad (de menor a mayor).
     El acento tiñe toda la interfaz según la dignidad activa.             */
  paleta: {
    PREFECTOS: {
      acento: '#F5B44A',
      rampa: ['#FFF1D2', '#FAD489', '#F0A93F', '#DA7420', '#A2450C']
    },
    ALCALDES: {
      acento: '#4ED8CB',
      rampa: ['#DDF3EF', '#A2E0D7', '#5CC4BA', '#2C9A97', '#16626C']
    },
    /* Solo en Histórico electoral (ver dignidadesHistorico). */
    CONCEJALES: {
      acento: '#BDB7FE',
      rampa: ['#F0EDFF', '#D4CFFE', '#AFA8FF', '#8580DC', '#55549D']
    },
    VOCALES: {
      acento: '#FF9ECC',
      rampa: ['#FEE9F1', '#FEC1DD', '#EE92C4', '#C669A1', '#894170']
    },
    sinDatos:  '#E4E9F0',   // territorios sin registros
    contexto:  '#F2F5F8',   // territorio fuera del filtro
    seleccion: '#0A111E'    // borde del territorio seleccionado
  },

  /* ── ✏️ EDITAR · MAPA BASE ───────────────────────────────────────────────
     CARTO pasó a exigir clave: sin ella estampa "API KEY REQUIRED" sobre
     cada tesela. Por eso el valor por defecto es 'ninguno': un lienzo limpio,
     sin depender de ningún servicio externo. Es como se imprimen los mapas
     electorales y hace que la escala de color se lea mucho mejor.

     Para usar un mapa base, cambia `fondo` por 'osm', 'esriGris' o 'carto'. */
  mapaBase: {
    fondo: 'ninguno',
    color: '#EAEFF4',        // color del lienzo cuando fondo = 'ninguno'
    credito: 'Cartografía: INEC · División Política Administrativa',
    proveedores: {
      ninguno: null,

      osm: {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        atribucion: '&copy; OpenStreetMap',
        maxZoom: 19
      },

      esriGris: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/' +
             'World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        atribucion: 'Esri, HERE, Garmin, &copy; OpenStreetMap',
        maxZoom: 16
      },

      /* Requiere clave propia. Regístrate en carto.com, copia tu API key y
         sustituye TU_CLAVE. Sin clave vuelve la marca de agua.            */
      carto: {
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?api_key=TU_CLAVE',
        atribucion: '&copy; OpenStreetMap &copy; CARTO',
        subdominios: 'abcd',
        maxZoom: 19
      }
    }
  },
  vistaEcuador: { centro: [-1.6, -78.6], zoom: 6 },

  /* ── ✏️ EDITAR · ALIAS DE NOMBRES ────────────────────────────────────────
     Puente entre el nombre del Excel (izquierda) y el del GeoJSON (derecha).
     Se comparan normalizados. Agrega aquí cualquier discrepancia nueva.   */
  aliasProvincia: {
    'STO DGO TSACHILAS': 'SANTO DOMINGO DE LOS TSACHILAS',
    'SANTO DOMINGO':     'SANTO DOMINGO DE LOS TSACHILAS',
    'STO DOMINGO':       'SANTO DOMINGO DE LOS TSACHILAS',
    'SANTO DOMINGO TSACHILAS': 'SANTO DOMINGO DE LOS TSACHILAS'
  },
  aliasCanton: {
    'A BAQUERIZO MORENO':        'ALFREDO BAQUERIZO MORENO',
    'CRNL MARCELINO MARIDUENAS': 'CRNEL MARCELINO MARIDUENA',
    'EL EMPALME':                'EMPALME',
    'GRAL A ELIZALDE':           'GNRAL ANTONIO ELIZALDE',
    'NOBOL PIEDRAHITA':          'NOBOL',
    'YAGUACHI':                  'SAN JACINTO DE YAGUACHI',
    'C J AROSEMENA TOLA':        'CARLOS JULIO AROSEMENA TOLA',
    'FCO DE ORELLANA':           'ORELLANA',
    'JOYA DE LOS SACHAS':        'LA JOYA DE LOS SACHAS',
    'PUEBLO VIEJO':              'PUEBLOVIEJO',
    'RIO VERDE':                 'RIOVERDE',
    'URCUQUI':                   'SAN MIGUEL DE URCUQUI',
    'BANOS':                     'BANOS DE AGUA SANTA',
    'PELILEO':                   'SAN PEDRO DE PELILEO',
    'PILLARO':                   'SANTIAGO DE PILLARO',
    'YANZATZA':                  'YANTZAZA'
  },

  /* Códigos de provincia excluidos del selector (zonas no delimitadas).   */
  provinciasExcluidas: ['ZONA NO DELIMITADA'],

  tabla: { filasPorPagina: 15 }
};


/* ============================================================================
   UTILIDADES DE TEXTO
   ========================================================================== */

/**
 * Normaliza texto para comparar Excel ↔ GeoJSON.
 * Quita tildes, unifica mayúsculas, elimina símbolos y espacios repetidos.
 * La Ñ se preserva como N para tolerar bases mal codificadas.
 */
function normalizarTexto(valor) {
  if (valor === null || valor === undefined) return '';
  let s = String(valor).toUpperCase();
  s = s.replace(/Ñ/g, '\u0001');
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/\u0001/g, 'N');
  s = s.replace(/[^A-Z0-9]+/g, ' ');
  return s.trim();
}

/** Aplica el diccionario de alias sobre un nombre ya normalizado. */
function aplicarAlias(nombreNormalizado, diccionario) {
  return diccionario[nombreNormalizado] ? normalizarTexto(diccionario[nombreNormalizado])
                                        : nombreNormalizado;
}

/** Formatea números con separador de miles local. */
function fmtNum(n) {
  return (n || 0).toLocaleString('es-EC');
}

/** Formatea porcentajes con un decimal. */
function fmtPct(n) {
  if (!isFinite(n)) return '0,0 %';
  return n.toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
}

/** Convierte a Título Capitalizado respetando preposiciones. */
function tituloCase(s) {
  if (!s) return '';
  const menores = ['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'EL'];
  return String(s).toLowerCase().split(' ').map((p, i) => {
    const up = p.toUpperCase();
    if (i > 0 && menores.includes(up)) return p;
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(' ');
}


/* ============================================================================
   ESTADO GLOBAL DE DATOS
   ========================================================================== */

const DATOS = {
  geo: { provincias: null, cantones: null, parroquias: null },
  campos: { provincia: {}, canton: {}, parroquia: {} },  // propiedades detectadas
  registros: [],          // filas normalizadas del Excel
  columnas: {},           // mapeo lógico → encabezado real
  modoDemo: false,
  sinGeometria: [],       // registros que no cruzaron con el mapa
  avisos: []
};


/* ============================================================================
   CARGA DE CAPAS GEOJSON
   ========================================================================== */

async function cargarGeoJSON(ruta, obligatorio = true) {
  try {
    const r = await fetch(ruta, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j || j.type !== 'FeatureCollection' || !Array.isArray(j.features)) {
      throw new Error('El archivo no es un FeatureCollection válido');
    }
    return j;
  } catch (e) {
    if (obligatorio) {
      throw new Error(
        `No se pudo cargar la capa <code>${ruta}</code>.<br>` +
        `Verifica que el archivo exista dentro de la carpeta <code>data/</code> ` +
        `y que estés abriendo el proyecto con un servidor local ` +
        `(<code>python -m http.server 8000</code>).`
      );
    }
    return null;
  }
}

/**
 * Detecta qué propiedad del GeoJSON corresponde a cada campo lógico.
 * Prioriza CONFIG.camposGeo; si está en null, busca por lista de candidatos
 * y, como último recurso, por coincidencia parcial del nombre.
 */
function detectarCamposGeo(fc, nivel) {
  if (!fc || !fc.features.length) return {};
  const props = Object.keys(fc.features[0].properties || {});
  const mapaNorm = {};
  props.forEach(p => { mapaNorm[normalizarTexto(p)] = p; });

  const manual = CONFIG.camposGeo[nivel] || {};
  const buscar = (candidatos, fragmento, excluir = []) => {
    for (const c of candidatos) {
      const k = normalizarTexto(c);
      if (mapaNorm[k] && !excluir.includes(mapaNorm[k])) return mapaNorm[k];
    }
    const frag = normalizarTexto(fragmento);
    for (const k in mapaNorm) {
      if (k.includes(frag) && !excluir.includes(mapaNorm[k])) return mapaNorm[k];
    }
    return null;
  };

  const pref = { provincia: 'prov', canton: 'cant', parroquia: 'parr' }[nivel];
  const cand = CONFIG.candidatosGeo;

  const codigo = manual.codigo || buscar(cand[pref + 'Codigo'] || [], pref + ' codigo');
  /* El campo de código se excluye del respaldo por coincidencia parcial:
     'dpa_provin' contiene "PROV" y podría tomarse por el nombre. */
  const res = {
    codigo,
    nombre: manual.nombre || buscar(cand[pref + 'Nombre'] || [], pref, [codigo]),
    poblacion: buscar(cand.poblacion, 'poblacion', [codigo])
  };

  /* La capa cantonal y parroquial también necesitan saber su provincia. */
  if (nivel !== 'provincia') {
    res.provCodigo = buscar(cand.provCodigo, 'prov codigo');
    res.provNombre = buscar(cand.provNombre, 'provincia', [res.provCodigo]);
  }
  if (nivel === 'parroquia') {
    res.cantCodigo = buscar(cand.cantCodigo, 'cant codigo');
    res.cantNombre = buscar(cand.cantNombre, 'canton', [res.cantCodigo]);
  }
  return res;
}

/** Lee una propiedad de un feature de forma segura. */
function propGeo(feature, campo) {
  if (!campo) return '';
  const v = feature.properties ? feature.properties[campo] : '';
  return v === null || v === undefined ? '' : String(v).trim();
}


/* ============================================================================
   CARGA Y NORMALIZACIÓN DEL EXCEL
   ========================================================================== */

/** Empareja los encabezados reales del Excel con los campos lógicos. */
function detectarColumnas(encabezados) {
  const mapaNorm = {};
  encabezados.forEach(h => { mapaNorm[normalizarTexto(h)] = h; });
  const cols = {};
  for (const campo in CONFIG.columnasExcel) {
    for (const cand of CONFIG.columnasExcel[campo]) {
      const k = normalizarTexto(cand);
      if (mapaNorm[k]) { cols[campo] = mapaNorm[k]; break; }
    }
  }
  return cols;
}

/** Clasifica el texto de dignidad del Excel en una dignidad configurada. */
function clasificarDignidad(texto) {
  const t = normalizarTexto(texto);
  for (const d of CONFIG.dignidades) {
    if (t.includes(normalizarTexto(d.clave))) return d.id;
  }
  return null;
}

/**
 * Convierte las filas crudas del Excel en registros normalizados.
 * Cada registro tiene: dignidad, claves normalizadas de territorio y peso.
 */
function normalizarRegistros(filas, cols) {
  const out = [];
  filas.forEach((fila, i) => {
    const dig = clasificarDignidad(fila[cols.dignidad]);
    if (!dig) return;                       // fila de otra dignidad → se ignora

    const provRaw = String(fila[cols.provincia] ?? '').trim();
    if (!provRaw) return;

    const cantRaw = cols.canton    ? String(fila[cols.canton]    ?? '').trim() : '';
    const parrRaw = cols.parroquia ? String(fila[cols.parroquia] ?? '').trim() : '';

    /* Peso: columna PREINSCRITOS si existe, si no cada fila vale 1. */
    let peso = 1;
    if (cols.preinscritos) {
      const v = parseFloat(String(fila[cols.preinscritos]).replace(/[^\d.,-]/g, '').replace(',', '.'));
      peso = isFinite(v) ? v : 0;
    }

    out.push({
      id: i,
      dignidad:  dig,
      provincia: provRaw,
      canton:    cantRaw,
      parroquia: parrRaw,
      provK: aplicarAlias(normalizarTexto(provRaw), CONFIG.aliasProvincia),
      cantK: cantRaw ? aplicarAlias(normalizarTexto(cantRaw), CONFIG.aliasCanton) : '',
      parrK: parrRaw ? normalizarTexto(parrRaw) : '',
      provCod: cols.provCodigo ? String(fila[cols.provCodigo] ?? '').trim() : '',
      cantCod: cols.cantCodigo ? String(fila[cols.cantCodigo] ?? '').trim() : '',
      partido: cols.partido ? String(fila[cols.partido] ?? '').trim() : '',
      lista:   cols.lista   ? String(fila[cols.lista]   ?? '').trim() : '',
      nombre:  cols.nombre  ? String(fila[cols.nombre]  ?? '').trim() : '',
      cedula:  cols.cedula  ? String(fila[cols.cedula]  ?? '').trim() : '',
      peso: peso
    });
  });
  return out;
}

/** Lee un ArrayBuffer de Excel con SheetJS y devuelve filas como objetos. */
function leerLibro(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false });
}

/** Carga el Excel configurado. Devuelve null si no está disponible. */
async function cargarExcel(ruta) {
  const r = await fetch(ruta, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return leerLibro(await r.arrayBuffer());
}


/* ============================================================================
   MODO DEMOSTRACIÓN
   Genera datos ficticios a partir de la geografía real para que el
   dashboard sea navegable aunque todavía no exista el Excel.
   ========================================================================== */

function generarDemo() {
  const filas = [];
  const partidos = ['MOVIMIENTO ALFA', 'PARTIDO BETA', 'ALIANZA GAMMA',
                    'MOVIMIENTO DELTA', 'FRENTE ÉPSILON'];
  let semilla = 7;
  const rnd = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };

  const cp = DATOS.campos.provincia, cc = DATOS.campos.canton;

  (DATOS.geo.provincias.features || []).forEach(f => {
    const prov = propGeo(f, cp.nombre);
    if (!prov) return;
    const n = 3 + Math.floor(rnd() * 10);
    for (let i = 0; i < n; i++) {
      filas.push({ DIGNIDAD: 'PREFECTO Y VICEPREFECTO', PROVINCIA: prov, CANTON: '',
                   PARTIDO: partidos[Math.floor(rnd() * partidos.length)],
                   LISTA: String(1 + Math.floor(rnd() * 99)), NOMBRE: 'CANDIDATO DEMO ' + (i + 1),
                   CEDULA: '' });
    }
  });

  (DATOS.geo.cantones.features || []).forEach(f => {
    const prov = propGeo(f, cc.provNombre), cant = propGeo(f, cc.nombre);
    if (!prov || !cant) return;
    const n = 2 + Math.floor(rnd() * 9);
    for (let i = 0; i < n; i++) {
      filas.push({ DIGNIDAD: 'ALCALDE', PROVINCIA: prov, CANTON: cant,
                   PARTIDO: partidos[Math.floor(rnd() * partidos.length)],
                   LISTA: String(1 + Math.floor(rnd() * 99)), NOMBRE: 'CANDIDATO DEMO ' + (i + 1),
                   CEDULA: '' });
    }
  });
  return filas;
}


/* ============================================================================
   ÍNDICE TERRITORIAL — puente Excel ↔ GeoJSON
   ========================================================================== */

const TERRITORIO = {
  provincias: [],           // [{cod, nombre, key, poblacion, feature, cantones:[]}]
  porProvK: new Map(),      // clave normalizada de nombre
  porProvCod: new Map(),    // código DPA de provincia
  cantones: [],
  porCantK: new Map(),      // clave "PROVK|CANTK"
  porCantCod: new Map(),    // código DPA de cantón
  parroquiasPorCant: new Map(),  // clave: código de cantón, o "PROVK|CANTK"
  hayCodigos: { provincia: false, canton: false }
};

/** Lee la población de un feature; 0 si la capa no la trae. */
function poblacionDe(feature, campos) {
  const v = parseFloat(propGeo(feature, campos.poblacion));
  return isFinite(v) ? v : 0;
}

function construirIndiceTerritorial() {
  const cp = DATOS.campos.provincia, cc = DATOS.campos.canton;
  TERRITORIO.provincias = []; TERRITORIO.porProvK.clear(); TERRITORIO.porProvCod.clear();
  TERRITORIO.cantones = [];   TERRITORIO.porCantK.clear(); TERRITORIO.porCantCod.clear();

  (DATOS.geo.provincias.features || []).forEach(f => {
    const nombre = propGeo(f, cp.nombre);
    if (!nombre) return;
    const key = normalizarTexto(nombre);
    const cod = propGeo(f, cp.codigo);
    /* Se estampan las claves en el propio feature para que el mapa
       no tenga que releer propiedades en cada repintado. */
    f.__key = key; f.__provK = key; f.__nombre = nombre; f.__provNombre = nombre;
    f.__nivel = 'provincia';
    const item = { cod, nombre, key, poblacion: poblacionDe(f, cp), feature: f, cantones: [] };
    TERRITORIO.provincias.push(item);
    TERRITORIO.porProvK.set(key, item);
    if (cod) TERRITORIO.porProvCod.set(cod, item);
  });

  (DATOS.geo.cantones.features || []).forEach(f => {
    const nombre = propGeo(f, cc.nombre);
    if (!nombre) return;
    const cod = propGeo(f, cc.codigo);
    const provCod = propGeo(f, cc.provCodigo);

    /* Jerarquía por código cuando existe; si no, por nombre normalizado. */
    const padre = (provCod && TERRITORIO.porProvCod.get(provCod)) ||
                  TERRITORIO.porProvK.get(
                    aplicarAlias(normalizarTexto(propGeo(f, cc.provNombre)), CONFIG.aliasProvincia));

    const provNombre = padre ? padre.nombre : propGeo(f, cc.provNombre);
    const provK = padre ? padre.key
                        : aplicarAlias(normalizarTexto(provNombre), CONFIG.aliasProvincia);
    const key = normalizarTexto(nombre);

    f.__key = key; f.__provK = provK; f.__nombre = nombre; f.__provNombre = provNombre;
    f.__nivel = 'canton';
    const item = { cod, provCod, nombre, key, provK, provNombre,
                   poblacion: poblacionDe(f, cc), feature: f };
    TERRITORIO.cantones.push(item);
    TERRITORIO.porCantK.set(provK + '|' + key, item);
    if (cod) TERRITORIO.porCantCod.set(cod, item);
    if (padre) padre.cantones.push(item);
  });

  TERRITORIO.hayCodigos.provincia = TERRITORIO.porProvCod.size > 0;
  TERRITORIO.hayCodigos.canton = TERRITORIO.porCantCod.size > 0;

  indexarParroquias();

  TERRITORIO.provincias.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  TERRITORIO.provincias.forEach(p => p.cantones.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
}

/**
 * Agrupa las parroquias bajo su cantón. Se ejecuta aparte porque la capa
 * parroquial se carga en segundo plano, después del primer pintado.
 */
function indexarParroquias() {
  TERRITORIO.parroquiasPorCant.clear();
  if (!DATOS.geo.parroquias) return;

  const cq = DATOS.campos.parroquia;
  (DATOS.geo.parroquias.features || []).forEach(f => {
    const cantCod = propGeo(f, cq.cantCodigo);
    const dueño = (cantCod && TERRITORIO.porCantCod.get(cantCod)) ||
      TERRITORIO.porCantK.get(
        aplicarAlias(normalizarTexto(propGeo(f, cq.provNombre)), CONFIG.aliasProvincia) + '|' +
        aplicarAlias(normalizarTexto(propGeo(f, cq.cantNombre)), CONFIG.aliasCanton));
    if (!dueño) return;

    f.__nombre = propGeo(f, cq.nombre);
    f.__key = normalizarTexto(f.__nombre);
    f.__nivel = 'parroquia';
    f.__poblacion = poblacionDe(f, cq);
    /* En la nomenclatura del INEC, el código de parroquia terminado en 50 es
       la cabecera urbana del cantón: un único polígono que agrupa todas las
       parroquias urbanas. Se marca para poder consolidar ahí los datos que
       vienen desglosados por parroquia urbana. */
    f.__cod = propGeo(f, cq.codigo);
    f.__urbana = /50$/.test(f.__cod);
    /* Capa parroquial del CNE: cada polígono trae en «nombres_cne» los nombres
       con que la base electoral lo registra —el vigente y los de años
       anteriores—, separados por «|». Con eso el cruce es explícito. */
    const nombresCNE = f.properties ? f.properties.nombres_cne : undefined;
    f.__nombresCNE = (nombresCNE === undefined || nombresCNE === null) ? null
      : String(nombresCNE).split('|').map(normalizarTexto).filter(Boolean);

    const clave = dueño.provK + '|' + dueño.key;
    if (!TERRITORIO.parroquiasPorCant.has(clave)) TERRITORIO.parroquiasPorCant.set(clave, []);
    TERRITORIO.parroquiasPorCant.get(clave).push(f);
  });
}

/** Lista de provincias para el selector (excluye zonas no delimitadas). */
function provinciasSeleccionables() {
  const excl = CONFIG.provinciasExcluidas.map(normalizarTexto);
  return TERRITORIO.provincias.filter(p => !excl.includes(p.key));
}

/**
 * Resuelve cada registro contra la geografía y canoniza sus claves.
 *
 * Prioridad de cruce, según lo pedido:
 *   1. código de cantón   2. código de provincia   3. nombre normalizado + alias
 *
 * Al canonizar, las claves del registro pasan a ser las del GeoJSON, de modo
 * que mapa, selectores, tabla y gráficos comparten siempre el mismo
 * identificador aunque el Excel escriba el territorio de otra forma.
 */
function resolverRegistros() {
  DATOS.sinGeometria = [];
  const vistos = new Set();

  DATOS.registros.forEach(r => {
    const nivel = CONFIG.dignidades.find(d => d.id === r.dignidad).nivel;

    /* Provincia */
    let prov = (r.provCod && TERRITORIO.porProvCod.get(r.provCod)) ||
               TERRITORIO.porProvK.get(r.provK);
    if (prov) { r.provK = prov.key; r.provNombreGeo = prov.nombre; }

    /* Cantón (solo relevante cuando el análisis es cantonal) */
    let cant = null;
    if (r.cantK || r.cantCod) {
      cant = (r.cantCod && TERRITORIO.porCantCod.get(r.cantCod)) ||
             TERRITORIO.porCantK.get(r.provK + '|' + r.cantK);
      if (cant) {
        r.cantK = cant.key;
        r.provK = cant.provK;
        r.cantNombreGeo = cant.nombre;
        if (!prov) { prov = TERRITORIO.porProvK.get(cant.provK); r.provNombreGeo = cant.provNombre; }
      }
    }

    r.conGeometria = nivel === 'provincia' ? !!prov : !!cant;
    if (!r.conGeometria) {
      const etq = r.provincia + (r.canton ? ' / ' + r.canton : '');
      if (!vistos.has(etq)) { vistos.add(etq); DATOS.sinGeometria.push(etq); }
    }
  });
}


/* ============================================================================
   AGREGACIÓN
   ========================================================================== */

/**
 * Agrega los registros de una dignidad al nivel indicado.
 * Devuelve { filas:[{key, provK, nombre, provincia, valor, feature}], total }
 */
function agregar(dignidad, nivel, filtro = {}) {
  const acum = new Map();
  let total = 0;

  DATOS.registros.forEach(r => {
    if (r.dignidad !== dignidad) return;
    if (filtro.provK && r.provK !== filtro.provK) return;
    if (filtro.cantK && r.cantK !== filtro.cantK) return;

    const clave = nivel === 'provincia' ? r.provK : r.provK + '|' + r.cantK;
    if (!acum.has(clave)) {
      acum.set(clave, {
        key: nivel === 'provincia' ? r.provK : r.cantK,
        provK: r.provK,
        /* Se prefiere el nombre de la cartografía oficial: así el mapa, la
           tabla y los gráficos nombran el territorio igual. */
        provincia: r.provNombreGeo || r.provincia,
        nombre: nivel === 'provincia' ? (r.provNombreGeo || r.provincia)
                                      : (r.cantNombreGeo || r.canton),
        valor: 0, registros: []
      });
    }
    const a = acum.get(clave);
    a.valor += r.peso; a.registros.push(r);
    total += r.peso;
  });

  const filas = [...acum.values()];
  filas.forEach(f => {
    f.pct = total ? (f.valor * 100 / total) : 0;
    f.geo = nivel === 'provincia'
      ? TERRITORIO.porProvK.get(f.provK)
      : TERRITORIO.porCantK.get(f.provK + '|' + f.key);
    f.poblacion = f.geo ? (f.geo.poblacion || 0) : 0;
    f.electores = f.geo ? (f.geo.electores || 0) : 0;
    /* Densidad de preinscritos: normaliza territorios de tamaño muy distinto.
       La base es el padrón electoral; si faltara, se recurre a la población. */
    const base = f.electores || f.poblacion;
    f.porCienMil = base ? (f.valor * 100000 / base) : null;
  });
  filas.sort((a, b) => b.valor - a.valor || a.nombre.localeCompare(b.nombre, 'es'));
  filas.forEach((f, i) => f.ranking = i + 1);
  return { filas, total, indice: acum };
}


/* ============================================================================
   CLASIFICACIÓN DE COLOR (cortes automáticos)
   ========================================================================== */

/**
 * Calcula hasta 5 clases a partir de los valores presentes.
 *
 * Se usan dos estrategias según la forma de los datos:
 *  · Rangos enteros estrechos (conteos de preinscritos, típicamente 2–15):
 *    intervalos iguales. Los cuantiles producirían clases degeneradas
 *    del tipo "6 – 6", que se leen mal en la leyenda.
 *  · Rangos amplios (bases ya agregadas, miles de registros):
 *    cuantiles redondeados a números limpios, con la clase superior
 *    absorbiendo la cola alta.
 */
function calcularCortes(valores) {
  const v = valores.filter(x => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const min = v[0], max = v[v.length - 1];
  if (min === max) return [{ desde: min, hasta: max }];

  const rango = max - min;
  const enteros = v.every(x => Number.isInteger(x));
  const clases = [];

  if (enteros && rango <= 14) {
    /* Intervalos iguales; la última clase recoge el resto hasta el máximo. */
    const n = Math.min(5, rango + 1);
    const paso = Math.max(1, Math.floor((rango + 1) / n));
    let desde = min;
    for (let i = 0; i < n && desde <= max; i++) {
      const hasta = (i === n - 1) ? max : Math.min(max, desde + paso - 1);
      clases.push({ desde, hasta });
      desde = hasta + 1;
    }
    return clases;
  }

  /* Cuantiles con bordes redondeados */
  const q = [];
  for (let i = 1; i <= 4; i++) q.push(v[Math.floor(i * v.length / 5)]);
  const paso = rango > 5000 ? 500 : rango > 500 ? 50 : rango > 100 ? 10 : rango > 20 ? 5 : 1;
  const cortes = [...new Set(q.map(x => Math.max(min, Math.round(x / paso) * paso)))]
    .filter(x => x > min && x < max).sort((a, b) => a - b);

  let desde = min;
  cortes.forEach(c => { clases.push({ desde, hasta: c }); desde = c + 1; });
  clases.push({ desde, hasta: max });
  return clases.filter(c => c.desde <= c.hasta);
}

/** Devuelve el índice de clase (0..n-1) para un valor. */
function claseDe(valor, clases) {
  if (!valor || !clases.length) return -1;
  for (let i = 0; i < clases.length; i++) {
    if (valor >= clases[i].desde && valor <= clases[i].hasta) return i;
  }
  return valor > clases[clases.length - 1].hasta ? clases.length - 1 : 0;
}

/** Color de relleno para un valor dado. */
function colorDe(valor, clases, dignidad) {
  const p = CONFIG.paleta[dignidad] || CONFIG.paleta.PREFECTOS;
  const i = claseDe(valor, clases);
  if (i < 0) return CONFIG.paleta.sinDatos;
  const n = Math.max(clases.length, 1);
  const idx = Math.min(p.rampa.length - 1,
    Math.round(i * (p.rampa.length - 1) / Math.max(n - 1, 1)));
  return p.rampa[idx];
}


/* ============================================================================
   ELECTORES
   Sustituye al dato de población que traía la capa parroquial, que era del
   censo de 2010. El padrón viene del distributivo de recintos electorales.
   ========================================================================== */

const ELECTORES = { disponible: false, total: 0, provincias: {}, cantones: {} };

/** Carga los electores y los reparte sobre el índice territorial. */
async function cargarElectores() {
  try {
    const r = await fetch(CONFIG.archivos.electores, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    ELECTORES.total = j.total || 0;
    ELECTORES.provincias = j.provincias || {};
    ELECTORES.cantones = j.cantones || {};
    ELECTORES.disponible = true;

    /* Se anota en cada territorio junto a la población, sin sustituirla:
       así el dato del censo sigue disponible si alguna vez hace falta. */
    TERRITORIO.provincias.forEach(p => { p.electores = ELECTORES.provincias[p.key] || 0; });
    TERRITORIO.cantones.forEach(c => {
      c.electores = ELECTORES.cantones[c.provK + '|' + c.key] || 0;
    });
    return true;
  } catch (e) {
    console.warn('[Dashboard] electores no disponibles:', e);
    ELECTORES.disponible = false;
    return false;
  }
}


/* ============================================================================
   RESULTADOS ELECTORALES 2023
   Base independiente de la de preinscritos. Contiene solo el año 2023: el
   filtrado por año se hace al preparar el archivo (preparar_resultados.py),
   de modo que ningún otro año llega siquiera al navegador.
   ========================================================================== */

const RESULTADOS = {
  disponible: false,
  anio: null,
  etiquetas: {},          // PREFECTOS → 'Prefecto', ALCALDES → 'Alcalde'
  registros: {}           // dignidad → [{provK, cantK, candidato, op, votos}]
};

/**
 * Carga los resultados ya agregados por cantón.
 * Es opcional: si el archivo falta, el tablero sigue funcionando sin el
 * bloque de resultados.
 */
async function cargarResultados() {
  if (RESULTADOS.disponible) return true;
  try {
    const r = await fetch(CONFIG.archivos.resultados, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();

    /* Los nombres largos viajan en tablas aparte y los registros solo llevan
       índices: así el archivo pesa una fracción de lo que ocuparía repetir
       cada nombre de candidato y organización en cada fila. */
    const { candidatos, organizaciones, provincias, cantones } = j;
    RESULTADOS.registros = {};
    for (const dig in j.registros) {
      RESULTADOS.registros[dig] = j.registros[dig].map(([p, c, ca, o, v]) => ({
        provK: provincias[p],
        cantK: cantones[c],
        candidato: candidatos[ca],
        op: organizaciones[o],
        votos: v
      }));
    }
    RESULTADOS.anio = j.anio;
    RESULTADOS.etiquetas = j.etiquetas || {};
    RESULTADOS.disponible = true;
    return true;
  } catch (e) {
    console.warn('[Dashboard] resultados electorales no disponibles:', e);
    RESULTADOS.disponible = false;
    return false;
  }
}

/**
 * Suma los votos de cada candidato dentro del territorio filtrado.
 *
 * Devuelve las candidaturas ordenadas de mayor a menor, con su posición ya
 * asignada (posición 1 = más votado), el total de votos del ámbito y cuántas
 * elecciones distintas se están sumando. Ese último dato importa: fuera de un
 * ámbito de elección único (un cantón para alcalde, una provincia para
 * prefecto) el primer puesto no es un "ganador" sino el más votado del
 * conjunto, y la interfaz debe decirlo.
 */
function agregarResultados(dignidad, provK, cantK) {
  const regs = (RESULTADOS.registros || {})[dignidad] || [];
  const acum = new Map();
  const ambitos = new Set();
  let total = 0;

  regs.forEach(r => {
    if (provK && r.provK !== provK) return;
    if (cantK && r.cantK !== cantK) return;

    /* El ámbito de elección depende de la dignidad: los alcaldes se eligen
       por cantón y los prefectos por provincia. */
    ambitos.add(dignidad === 'ALCALDES' ? r.provK + '|' + r.cantK : r.provK);

    const clave = r.candidato + '\u0000' + r.op;
    if (!acum.has(clave)) {
      acum.set(clave, { candidato: r.candidato, op: r.op, votos: 0 });
    }
    acum.get(clave).votos += r.votos;
    total += r.votos;
  });

  const filas = [...acum.values()].sort((a, b) =>
    b.votos - a.votos || a.candidato.localeCompare(b.candidato, 'es'));
  filas.forEach((f, i) => {
    f.posicion = i + 1;
    f.pct = total ? (f.votos * 100 / total) : 0;
  });

  return {
    filas,
    total,
    elecciones: ambitos.size,
    ganador: filas[0] || null,
    /* Un único ámbito de elección: el primer puesto sí es el ganador. */
    unica: ambitos.size === 1
  };
}


/* ============================================================================
   INICIALIZACIÓN DE DATOS
   ========================================================================== */

async function inicializarDatos() {
  /* 1 · Capas geográficas.
     La parroquial no se pide aquí: pesa más que las otras dos juntas y solo
     hace falta al entrar en un cantón, así que se carga después del primer
     pintado (ver cargarParroquias). */
  DATOS.geo.provincias = await cargarGeoJSON(CONFIG.archivos.provincias, true);
  DATOS.geo.cantones   = await cargarGeoJSON(CONFIG.archivos.cantones,   true);

  DATOS.campos.provincia = detectarCamposGeo(DATOS.geo.provincias, 'provincia');
  DATOS.campos.canton    = detectarCamposGeo(DATOS.geo.cantones,   'canton');

  if (!DATOS.campos.provincia.nombre) {
    throw new Error('No se identificó la propiedad con el <b>nombre de provincia</b> en ' +
      `<code>${CONFIG.archivos.provincias}</code>. Defínela manualmente en ` +
      '<code>js/data.js → CONFIG.camposGeo.provincia.nombre</code>.');
  }
  if (!DATOS.campos.canton.nombre) {
    throw new Error('No se identificó la propiedad con el <b>nombre de cantón</b> en ' +
      `<code>${CONFIG.archivos.cantones}</code>. Defínela manualmente en ` +
      '<code>js/data.js → CONFIG.camposGeo.canton.nombre</code>.');
  }

  construirIndiceTerritorial();

  /* 2 · Base de preinscritos */
  let filas = null;
  try {
    filas = await cargarExcel(CONFIG.archivos.excel);
  } catch (e) {
    filas = null;
  }

  if (filas && filas.length) {
    aplicarBase(filas);
  } else {
    DATOS.modoDemo = true;
    aplicarBase(generarDemo(), true);
  }
}

/**
 * Carga la capa parroquial en segundo plano. Es opcional: si el archivo no
 * existe, la aplicación sigue funcionando con tres niveles.
 * Devuelve true solo si la capa quedó lista para usarse.
 */
async function cargarParroquias() {
  if (DATOS.geo.parroquias) return true;
  const capa = await cargarGeoJSON(CONFIG.archivos.parroquias, false);
  if (!capa) return false;

  DATOS.geo.parroquias = capa;
  DATOS.campos.parroquia = detectarCamposGeo(capa, 'parroquia');
  if (!DATOS.campos.parroquia.nombre) {
    /* Sin nombre de parroquia la capa no aporta nada: se descarta en silencio. */
    DATOS.geo.parroquias = null;
    return false;
  }
  indexarParroquias();
  return TERRITORIO.parroquiasPorCant.size > 0;
}

/**
 * Aplica un conjunto de filas como base activa.
 * Se usa tanto en la carga inicial como al subir un Excel desde el panel.
 */
function aplicarBase(filas, esDemo = false) {
  const encabezados = Object.keys(filas[0] || {});
  const cols = detectarColumnas(encabezados);

  const faltantes = CONFIG.columnasObligatorias.filter(c => !cols[c]);
  if (faltantes.length) {
    const nombres = faltantes.map(f => CONFIG.columnasExcel[f][0]).join(', ');
    throw new Error(
      `La base no contiene la(s) columna(s) obligatoria(s): <b>${nombres}</b>.<br>` +
      `Encabezados encontrados: <code>${encabezados.join(', ') || '(ninguno)'}</code><br>` +
      'Ajusta los nombres en <code>js/data.js → CONFIG.columnasExcel</code>.'
    );
  }

  DATOS.columnas = cols;
  DATOS.registros = normalizarRegistros(filas, cols);
  DATOS.modoDemo = esDemo;

  if (!DATOS.registros.length) {
    throw new Error(
      'La base se leyó correctamente pero ninguna fila corresponde a las dignidades ' +
      'configuradas.<br>Revisa los valores de la columna ' +
      `<code>${cols.dignidad}</code> y las claves en ` +
      '<code>js/data.js → CONFIG.dignidades</code>.'
    );
  }

  resolverRegistros();
}
