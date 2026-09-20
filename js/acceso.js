/* ============================================================================
   acceso.js — INICIO DE SESIÓN Y ALCANCE TERRITORIAL

   ⚠️ LEE ESTO ANTES DE USARLO CON DATOS SENSIBLES
   Esta comprobación ocurre en el navegador, así que NO es seguridad real:
   cualquiera que abra las herramientas de desarrollo (F12) puede leer las
   contraseñas de este archivo y saltarse la pantalla. Sirve como control de
   acceso para presentaciones y uso interno —cada quien entra a lo suyo—, no
   para proteger información confidencial.

   Si necesitas protección de verdad, la contraseña tiene que pedirla el
   servidor: autenticación básica del hosting, un .htaccess o el control de
   acceso de la plataforma donde lo publiques.

   El alcance territorial, en cambio, sí recorta los datos de verdad: al
   usuario limitado se le podan las bases en memoria, de modo que ni los
   mapas, ni las tablas, ni los gráficos llegan a tener los otros territorios.
   ========================================================================== */

const ACCESO = {

  /* ── ✏️ EDITAR · USUARIOS ───────────────────────────────────────────────
     alcance: null            → ve todo el país
     alcance: {provincia,...} → solo ese territorio
     Los nombres van como aparecen en la cartografía, sin tildes.        */
  usuarios: [
    {
      usuario: 'lamana',
      alias: ['la mana'],
      clave: '123456',
      nombre: 'La Maná',
      /* Esta compilación solo contiene este territorio: el alcance no hace
         falta para recortar nada, sirve para rotularlo en el encabezado. */
      alcance: { provincia: 'COTOPAXI', canton: 'LA MANA' }
    }
  ],

  /* Estado de la sesión */
  sesion: null,
  alcance: null,
  podado: {},
  _resolver: null,
  listo: null
};


/* ============================================================================
   PANTALLA DE ACCESO
   ========================================================================== */

/** Devuelve una promesa que se resuelve cuando hay una sesión válida. */
function iniciarAcceso() {
  if (ACCESO.listo) return ACCESO.listo;

  ACCESO.listo = new Promise(resolve => { ACCESO._resolver = resolve; });

  const capa = document.getElementById('capa-acceso');
  const form = document.getElementById('form-acceso');
  if (!capa || !form) {           // sin pantalla de acceso, entrada libre
    abrirSesion(ACCESO.usuarios[0]);
    return ACCESO.listo;
  }

  /* Si ya se entró en esta pestaña, no se vuelve a pedir. */
  const guardada = leerSesionGuardada();
  if (guardada) { abrirSesion(guardada); return ACCESO.listo; }

  capa.hidden = false;
  document.body.classList.add('sin-sesion');
  setTimeout(() => { const u = document.getElementById('ac-usuario'); if (u) u.focus(); }, 60);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = (document.getElementById('ac-usuario').value || '').trim();
    const c = document.getElementById('ac-clave').value || '';
    const encontrado = buscarUsuario(u, c);
    const error = document.getElementById('ac-error');

    if (!encontrado) {
      error.hidden = false;
      error.textContent = 'Usuario o contraseña incorrectos.';
      form.classList.remove('temblor');
      void form.offsetWidth;               // reinicia la animación
      form.classList.add('temblor');
      document.getElementById('ac-clave').select();
      return;
    }
    error.hidden = true;
    capa.hidden = true;
    document.body.classList.remove('sin-sesion');
    abrirSesion(encontrado);
  });

  return ACCESO.listo;
}

/** Compara usuario y contraseña, tolerando mayúsculas y espacios. */
function buscarUsuario(usuario, clave) {
  const u = normalizarTexto(usuario);
  return ACCESO.usuarios.find(x => {
    const nombres = [x.usuario].concat(x.alias || []).map(normalizarTexto);
    return nombres.includes(u) && x.clave === clave;
  }) || null;
}

function abrirSesion(usuario) {
  ACCESO.sesion = usuario;
  ACCESO.alcance = usuario.alcance || null;
  guardarSesion(usuario);
  pintarUsuario();
  if (ACCESO._resolver) { ACCESO._resolver(usuario); ACCESO._resolver = null; }
}

function pintarUsuario() {
  const chip = document.getElementById('usuario-chip');
  if (!chip || !ACCESO.sesion) return;
  chip.hidden = false;
  const n = document.getElementById('usuario-nombre');
  if (n) n.textContent = ACCESO.sesion.nombre || ACCESO.sesion.usuario;
  const a = document.getElementById('usuario-alcance');
  if (a) {
    a.textContent = ACCESO.alcance
      ? tituloCase(ACCESO.alcance.canton || ACCESO.alcance.provincia)
      : 'Acceso completo';
  }
  const salir = document.getElementById('btn-salir');
  if (salir) salir.onclick = cerrarSesion;
}

function cerrarSesion() {
  try { sessionStorage.removeItem('dashboard-sesion'); } catch (e) { /* sin storage */ }
  location.reload();
}

function guardarSesion(u) {
  try { sessionStorage.setItem('dashboard-sesion', u.usuario); } catch (e) { /* sin storage */ }
}

function leerSesionGuardada() {
  try {
    const v = sessionStorage.getItem('dashboard-sesion');
    return v ? (ACCESO.usuarios.find(x => x.usuario === v) || null) : null;
  } catch (e) { return null; }
}


/* ============================================================================
   ALCANCE TERRITORIAL

   En vez de esconder controles, se recortan las bases en memoria. Así ninguna
   parte del tablero —mapas, tablas, gráficos, exportaciones— llega siquiera a
   tener los territorios que el usuario no debe ver.
   ========================================================================== */

/** Claves normalizadas del alcance, o null si el usuario ve todo. */
function alcanceClaves() {
  if (!ACCESO.alcance) return null;
  return {
    provK: normalizarTexto(ACCESO.alcance.provincia || ''),
    cantK: normalizarTexto(ACCESO.alcance.canton || '')
  };
}

/** Fuerza los filtros al territorio permitido. */
function aplicarAlcanceEstado() {
  const a = alcanceClaves();
  if (!a) return;
  if (typeof ESTADO !== 'undefined') {
    ESTADO.provK = a.provK;
    ESTADO.cantK = a.cantK;
  }
  if (typeof SEC !== 'undefined' && SEC.filtros) {
    SEC.filtros.historico.provK = a.provK;
    SEC.filtros.historico.cantK = a.cantK;
  }
}

/**
 * Poda las bases ya cargadas. Es idempotente: se puede llamar cada vez que
 * llega un archivo nuevo, y solo actúa sobre lo que aún no ha recortado.
 */
function podarPorAlcance() {
  const a = alcanceClaves();
  if (!a) return;
  const P = ACCESO.podado;

  /* — Cartografía — */
  if (!P.geo && typeof DATOS !== 'undefined' && DATOS.geo && DATOS.geo.cantones &&
      (DATOS.geo.cantones.features || []).length) {
    DATOS.geo.provincias.features = DATOS.geo.provincias.features
      .filter(f => normalizarTexto(propGeo(f, DATOS.campos.provincia.nombre)) === a.provK);
    DATOS.geo.cantones.features = DATOS.geo.cantones.features.filter(f => {
      const p = aplicarAlias(normalizarTexto(propGeo(f, DATOS.campos.canton.provNombre)),
                             CONFIG.aliasProvincia);
      const c = normalizarTexto(propGeo(f, DATOS.campos.canton.nombre));
      return p === a.provK && (!a.cantK || c === a.cantK);
    });
    construirIndiceTerritorial();
    P.geo = true;
  }

  /* — Parroquias, que llegan más tarde — */
  if (!P.parroquias && typeof DATOS !== 'undefined' && DATOS.geo && DATOS.geo.parroquias) {
    const cq = DATOS.campos.parroquia;
    DATOS.geo.parroquias.features = DATOS.geo.parroquias.features.filter(f => {
      const p = aplicarAlias(normalizarTexto(propGeo(f, cq.provNombre)), CONFIG.aliasProvincia);
      const c = aplicarAlias(normalizarTexto(propGeo(f, cq.cantNombre)), CONFIG.aliasCanton);
      return p === a.provK && (!a.cantK || c === a.cantK);
    });
    indexarParroquias();
    P.parroquias = true;
  }

  /* — Preinscritos —
     Las candidaturas provinciales (prefecto) no llevan cantón: se conservan
     las de la provincia, porque son las que aparecen en la papeleta de este
     territorio. Si prefieres un recorte estricto al cantón, cambia la
     condición por `r.cantK === a.cantK`. */
  /* Se comprueba la LONGITUD, no la existencia: al arrancar, DATOS.registros
     es un array vacío —que en JavaScript es verdadero— y la poda se daba por
     hecha antes de que las bases hubieran llegado, dejando pasar después los
     datos de todo el país. */
  if (!P.registros && typeof DATOS !== 'undefined' && (DATOS.registros || []).length) {
    DATOS.registros = DATOS.registros.filter(r =>
      r.provK === a.provK && (!a.cantK || !r.cantK || r.cantK === a.cantK));
    if (typeof resolverRegistros === 'function') resolverRegistros();
    P.registros = true;
  }

  /* — Electores — */
  if (!P.electores && typeof ELECTORES !== 'undefined' && ELECTORES.disponible) {
    const clave = a.provK + '|' + a.cantK;
    ELECTORES.total = a.cantK ? (ELECTORES.cantones[clave] || 0)
                              : (ELECTORES.provincias[a.provK] || 0);
    ELECTORES.provincias = { [a.provK]: ELECTORES.provincias[a.provK] || 0 };
    ELECTORES.cantones = a.cantK ? { [clave]: ELECTORES.cantones[clave] || 0 }
                                 : ELECTORES.cantones;
    if (typeof TERRITORIO !== 'undefined') {
      TERRITORIO.provincias.forEach(p => { p.electores = ELECTORES.provincias[p.key] || 0; });
      TERRITORIO.cantones.forEach(c => {
        c.electores = ELECTORES.cantones[c.provK + '|' + c.key] || 0;
      });
    }
    P.electores = true;
  }

  /* — Resultados 2023 — */
  if (!P.resultados && typeof RESULTADOS !== 'undefined' && RESULTADOS.disponible) {
    for (const dig in RESULTADOS.registros) {
      RESULTADOS.registros[dig] = RESULTADOS.registros[dig].filter(r =>
        r.provK === a.provK && (!a.cantK || r.cantK === a.cantK));
    }
    P.resultados = true;
  }

  /* — Histórico —
     La escala de color se calcula ANTES de podar: así los colores del usuario
     limitado significan lo mismo que los del administrador. */
  if (!P.historico && typeof HIST !== 'undefined' && HIST.anios.length) {
    if (typeof calcularEscalasGenerales === 'function') calcularEscalasGenerales();
    const ip = HIST.iProv.get(a.provK);
    const ic = a.cantK ? HIST.iCant.get(a.cantK) : null;
    const pasa = (p, c) => p === ip && (ic === null || c === ic);
    for (const dig in HIST.votos) {
      HIST.votos[dig] = HIST.votos[dig].filter(([, p, c]) => pasa(p, c));
    }
    for (const dig in HIST.nuloblanco) {
      HIST.nuloblanco[dig] = HIST.nuloblanco[dig].filter(([, p, c]) => pasa(p, c));
    }
    if (typeof SEC !== 'undefined') SEC.cacheParr = new Map();
    P.historico = true;
  }

  /* — Postulantes — */
  if (!P.postulantes && typeof POST !== 'undefined' &&
      Object.keys(POST.niveles || {}).length) {
    const dentro = (k) => {
      const p = k.split('|');
      return p[1] === a.provK && (!a.cantK || p.length < 3 || p[2] === a.cantK);
    };
    for (const dig in POST.niveles) {
      const n = POST.niveles[dig];
      ['prov', 'cant', 'parr'].forEach(nivel => {
        const out = {};
        for (const k in n[nivel]) if (dentro(k)) out[k] = n[nivel][k];
        n[nivel] = out;
      });
      /* El total del país pasa a ser el del territorio permitido. */
      const base = a.cantK ? n.cant : n.prov;
      const pais = {};
      for (const k in base) {
        const anio = k.split('|')[0];
        pais[anio] = (pais[anio] || 0) + base[k];
      }
      n.pais = pais;
    }
    P.postulantes = true;
  }

  /* — Grupos etarios — */
  if (!P.etario && typeof ETARIO !== 'undefined' && ETARIO.grupos.length) {
    const clave = a.provK + '|' + a.cantK;
    const fila = a.cantK ? (ETARIO.cantones[clave] || ETARIO.grupos.map(() => 0))
                         : (ETARIO.provincias[a.provK] || ETARIO.grupos.map(() => 0));
    ETARIO.pais = fila;
    ETARIO.provincias = { [a.provK]: ETARIO.provincias[a.provK] || fila };
    ETARIO.cantones = a.cantK ? { [clave]: fila } : ETARIO.cantones;
    ETARIO.exterior = ETARIO.grupos.map(() => 0);
    P.etario = true;
  }
}
