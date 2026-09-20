/* ============================================================================
   charts.js — GRÁFICOS ANALÍTICOS (Chart.js)
   Los cuatro gráficos se recalculan con cada cambio de dignidad, provincia
   o cantón. Comparten la paleta de la dignidad activa.
   ========================================================================== */

const GRAFICOS = { top: null, distribucion: null, participacion: null, organizaciones: null };

/* Tema oscuro común a todos los gráficos */
const TEMA = {
  texto:  '#B4C4DA',
  tenue:  '#8195B0',
  grilla: 'rgba(255,255,255,.07)',
  fuente: "'IBM Plex Sans', system-ui, sans-serif",
  mono:   "'IBM Plex Mono', monospace"
};

function aplicarTemaChartJS() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = TEMA.texto;
  Chart.defaults.font.family = TEMA.fuente;
  Chart.defaults.font.size = 12;
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.animation.duration = 420;
  Chart.defaults.maintainAspectRatio = false;
}

/** Devuelve n colores tomados de la rampa de la dignidad activa. */
function coloresRampa(n, dignidad, invertir = false) {
  const rampa = CONFIG.paleta[dignidad].rampa;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? rampa.length - 1
                      : Math.round((n - 1 - i) * (rampa.length - 1) / (n - 1));
    out.push(rampa[invertir ? rampa.length - 1 - t : t]);
  }
  return out;
}

/** Recorta un texto largo para que quepa en el eje. */
function corto(s, n = 22) {
  s = tituloCase(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Opciones base para barras horizontales. */
function opcionesBarraH(sufijo = '') {
  return {
    indexAxis: 'y',
    layout: { padding: { right: 14 } },
    scales: {
      x: { grid: { color: TEMA.grilla, drawBorder: false },
           ticks: { color: TEMA.tenue, font: { family: TEMA.mono, size: 11 }, precision: 0 } },
      y: { grid: { display: false, drawBorder: false },
           ticks: { color: TEMA.texto, font: { size: 11.5 }, autoSkip: false } }
    },
    plugins: {
      tooltip: {
        backgroundColor: '#0A111E', borderColor: '#2B3F5E', borderWidth: 1,
        titleFont: { size: 12.5 }, bodyFont: { family: TEMA.mono, size: 12 },
        padding: 10, displayColors: false,
        callbacks: { label: (c) => ` ${fmtNum(c.parsed.x)} preinscritos${sufijo}` }
      }
    }
  };
}

/** Destruye y recrea un gráfico sobre su canvas. */
function montar(clave, idCanvas, config) {
  if (GRAFICOS[clave]) { GRAFICOS[clave].destroy(); GRAFICOS[clave] = null; }
  const el = document.getElementById(idCanvas);
  if (!el) return;
  try {
    GRAFICOS[clave] = new Chart(el.getContext('2d'), config);
  } catch (e) {
    /* Un gráfico roto no debe llevarse por delante al resto del tablero. */
    console.warn(`[Dashboard] gráfico ${clave} no disponible:`, e);
    GRAFICOS[clave] = null;
  }
}

/** Mensaje cuando un gráfico no tiene datos. */
function vacio(idCanvas, clave, texto) {
  if (GRAFICOS[clave]) { GRAFICOS[clave].destroy(); GRAFICOS[clave] = null; }
  const el = document.getElementById(idCanvas);
  if (!el) return;
  const ctx = el.getContext('2d');
  ctx.clearRect(0, 0, el.width, el.height);
  ctx.fillStyle = TEMA.tenue;
  ctx.font = `13px ${TEMA.fuente}`;
  ctx.textAlign = 'center';
  ctx.fillText(texto, el.width / 2, el.height / 2);
}


/* ---------------------------------------------------------------------------
   ACTUALIZACIÓN GENERAL
   ------------------------------------------------------------------------- */

/**
 * @param {object} estado   filtros activos
 * @param {object} agregado agregación al nivel principal (ya filtrada)
 * @param {array}  registros registros filtrados (para el gráfico de partidos)
 */
function actualizarGraficos(estado, agregado, registros) {
  const dig = CONFIG.dignidades.find(d => d.id === estado.dignidad);
  const nivelTxt = dig.nivel === 'provincia' ? 'provincia' : 'cantón';
  const acento = CONFIG.paleta[estado.dignidad].acento;

  /* — 1 · Top 10 territorios — */
  const top = agregado.filas.slice(0, 10);
  document.getElementById('g1-sub').textContent =
    `Los ${Math.min(10, top.length)} territorios con más preinscritos · nivel ${nivelTxt}`;

  if (!top.length) {
    vacio('g1', 'top', 'Sin datos para el filtro actual');
  } else {
    montar('top', 'g1', {
      type: 'bar',
      data: {
        labels: top.map(f => corto(f.nombre)),
        datasets: [{
          data: top.map(f => f.valor),
          backgroundColor: coloresRampa(top.length, estado.dignidad),
          borderRadius: 3, borderSkipped: false, barThickness: 15
        }]
      },
      options: opcionesBarraH()
    });
  }

  /* — 2 · Distribución territorial — */
  const distProv = !estado.provK;
  const dist = distProv
    ? agregado.filas.slice()
    : agregar(estado.dignidad, 'canton', { provK: estado.provK }).filas;

  document.getElementById('g2-sub').textContent = distProv
    ? `Preinscritos por ${nivelTxt} · orden descendente`
    : `Cantones de ${tituloCase((TERRITORIO.porProvK.get(estado.provK) || {}).nombre || '')}`;

  if (!dist.length) {
    vacio('g2', 'distribucion', 'Sin datos para el filtro actual');
  } else {
    const d = dist.slice(0, 26);
    montar('distribucion', 'g2', {
      type: 'bar',
      data: {
        labels: d.map(f => corto(f.nombre, 16)),
        datasets: [{
          data: d.map(f => f.valor),
          backgroundColor: d.map(f =>
            (estado.cantK && f.key === estado.cantK) ? acento
              : colorDe(f.valor, MAPA.clases, estado.dignidad)),
          borderRadius: 3, borderSkipped: false, maxBarThickness: 26
        }]
      },
      options: {
        scales: {
          x: { grid: { display: false, drawBorder: false },
               ticks: { color: TEMA.tenue, font: { size: 10 }, maxRotation: 60, minRotation: 45 } },
          y: { grid: { color: TEMA.grilla, drawBorder: false },
               ticks: { color: TEMA.tenue, font: { family: TEMA.mono, size: 11 }, precision: 0 },
               beginAtZero: true }
        },
        plugins: {
          tooltip: {
            backgroundColor: '#0A111E', borderColor: '#2B3F5E', borderWidth: 1,
            padding: 10, displayColors: false,
            bodyFont: { family: TEMA.mono, size: 12 },
            callbacks: { label: (c) => ` ${fmtNum(c.parsed.y)} preinscritos` }
          }
        }
      }
    });
  }

  /* — 3 · Participación porcentual — */
  const base = agregado.filas.slice();
  const cabeza = base.slice(0, 6);
  const resto = base.slice(6).reduce((a, f) => a + f.valor, 0);
  const etiquetas = cabeza.map(f => tituloCase(f.nombre));
  const valores = cabeza.map(f => f.valor);
  if (resto > 0) { etiquetas.push(`Otros (${base.length - 6})`); valores.push(resto); }

  document.getElementById('g3-sub').textContent =
    `Peso relativo de cada ${nivelTxt} sobre el total filtrado`;

  if (!valores.length) {
    vacio('g3', 'participacion', 'Sin datos para el filtro actual');
  } else {
    const cols = coloresRampa(valores.length, estado.dignidad);
    if (resto > 0) cols[cols.length - 1] = '#3E4E66';
    montar('participacion', 'g3', {
      type: 'doughnut',
      data: { labels: etiquetas, datasets: [{
        data: valores, backgroundColor: cols,
        borderColor: '#131F33', borderWidth: 2, hoverOffset: 6 }] },
      options: {
        cutout: '58%',
        plugins: {
          legend: {
            display: true, position: 'right',
            labels: { color: TEMA.texto, boxWidth: 9, boxHeight: 9,
                      usePointStyle: true, pointStyle: 'circle',
                      font: { size: 11.5 }, padding: 9 }
          },
          tooltip: {
            backgroundColor: '#0A111E', borderColor: '#2B3F5E', borderWidth: 1,
            padding: 10, displayColors: false,
            bodyFont: { family: TEMA.mono, size: 12 },
            callbacks: {
              label: (c) => {
                const tot = c.dataset.data.reduce((a, b) => a + b, 0);
                return ` ${fmtNum(c.parsed)} · ${fmtPct(c.parsed * 100 / tot)}`;
              }
            }
          }
        }
      }
    });
  }

  /* — 4 · Organizaciones políticas — */
  const porPartido = new Map();
  registros.forEach(r => {
    const k = r.partido || 'SIN REGISTRO';
    porPartido.set(k, (porPartido.get(k) || 0) + r.peso);
  });
  const partidos = [...porPartido.entries()]
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor).slice(0, 10);

  document.getElementById('g4-sub').textContent =
    `${fmtNum(porPartido.size)} organizaciones con preinscritos en el territorio filtrado`;

  if (!partidos.length || !DATOS.columnas.partido) {
    vacio('g4', 'organizaciones', DATOS.columnas.partido
      ? 'Sin datos para el filtro actual'
      : 'La base no incluye columna de organización política');
  } else {
    montar('organizaciones', 'g4', {
      type: 'bar',
      data: {
        labels: partidos.map(p => corto(p.nombre, 30)),
        datasets: [{
          data: partidos.map(p => p.valor),
          backgroundColor: coloresRampa(partidos.length, estado.dignidad),
          borderRadius: 3, borderSkipped: false, barThickness: 13
        }]
      },
      options: opcionesBarraH()
    });
  }
}
