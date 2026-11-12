/* =========================================================
   Cuaderno de fiados
   ---------------------------------------------------------
   Decisiones de esta versión:
   - Moneda: pesos colombianos (COP), solo enteros.
   - "Lo que se llevó" es obligatorio.
   - Se permiten abonos parciales y quedan en el historial.
   - El fiado nuevo aparece primero.
   - Los fiados pagados quedan al final y se pueden filtrar.
   - Los datos viven en este navegador y se pueden exportar.

   Contenido:
   1. Configuración
   2. Referencias al HTML
   3. Estado de la aplicación
   4. Inicio
   5. Eventos y registro
   6. Cálculos
   7. Renderizado
   8. Utilidades
   9. Guardado, copia y restauración
   ========================================================= */

/* ---------- 1. Configuración ---------- */
const DIAS_POR_VENCER = 3;       // Días antes del vencimiento para avisar
const DIAS_MUY_ATRASADO = 15;    // Desde aquí se considera "muy atrasado"
const CLAVE_GUARDADO = 'creditos-tienda-v2';
const CLAVE_ANTERIOR = 'creditos-tienda-v1';

const formateadorDinero = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const formateadorFecha = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/* ---------- 2. Referencias al HTML ---------- */
const formulario = document.getElementById('formulario-credito');
const campoNombre = document.getElementById('nombre');
const campoDescripcion = document.getElementById('descripcion');
const campoMonto = document.getElementById('monto');
const campoFechaCredito = document.getElementById('fecha-credito');
const campoFechaLimite = document.getElementById('fecha-limite');
const campoNota = document.getElementById('nota');
const mensajeError = document.getElementById('error-formulario');
const listaCreditos = document.getElementById('lista-creditos');
const buscador = document.getElementById('buscador');
const botonesFiltro = document.querySelectorAll('.filtro');
const totalPorCobrar = document.getElementById('total-por-cobrar');
const totalAtrasado = document.getElementById('total-atrasado');
const totalPendientes = document.getElementById('total-pendientes');
const aviso = document.getElementById('aviso');
const botonExportar = document.getElementById('boton-exportar');
const botonImportar = document.getElementById('boton-importar');
const archivoImportar = document.getElementById('archivo-importar');

/* ---------- 3. Estado de la aplicación ---------- */
let creditos = cargarCreditos();
let filtroActual = 'todos';
let textoBusqueda = '';
let idAbonando = null;
let idEditando = null;
let temporizadorAviso = null;

/* ---------- 4. Inicio ---------- */
iniciar();

function iniciar() {
  ponerFechasPorDefecto();
  conectarEventos();
  renderizar();
}

function conectarEventos() {
  formulario.addEventListener('submit', guardarNuevoCredito);
  buscador.addEventListener('input', manejarBusqueda);
  listaCreditos.addEventListener('click', manejarClicEnLista);
  listaCreditos.addEventListener('submit', manejarEnvioEnLista);
  botonExportar.addEventListener('click', exportarDatos);
  botonImportar.addEventListener('click', abrirSelectorDeArchivo);
  archivoImportar.addEventListener('change', importarDatos);

  botonesFiltro.forEach(function (boton) {
    boton.addEventListener('click', function () {
      filtroActual = boton.dataset.filtro;
      actualizarBotonesFiltro();
      renderizarLista();
    });
  });
}

/* ---------- 5. Eventos y registro ---------- */
function guardarNuevoCredito(evento) {
  evento.preventDefault();
  ocultarError();

  const cliente = campoNombre.value.trim();
  const descripcion = campoDescripcion.value.trim();
  const montoTexto = campoMonto.value.trim();
  const fechaCredito = campoFechaCredito.value;
  const fechaLimite = campoFechaLimite.value;
  const nota = campoNota.value.trim();

  if (cliente === '') {
    mostrarError('Escribe el nombre del cliente.');
    campoNombre.focus();
    return;
  }

  if (descripcion === '') {
    mostrarError('Escribe qué se llevó el cliente.');
    campoDescripcion.focus();
    return;
  }

  if (!esEnteroPositivo(montoTexto)) {
    mostrarError('Escribe el valor sin puntos ni comas, solo números. Ejemplo: 25000.');
    campoMonto.focus();
    return;
  }

  const monto = Number(montoTexto);

  if (fechaCredito === '' || fechaLimite === '') {
    mostrarError('Completa las dos fechas.');
    return;
  }

  if (fechaLimite < fechaCredito) {
    mostrarError('La fecha límite no puede ser anterior a la fecha del fiado.');
    campoFechaLimite.focus();
    return;
  }

  creditos.push({
    id: crearId(),
    cliente: cliente,
    descripcion: descripcion,
    monto: monto,
    fechaCredito: fechaCredito,
    fechaLimite: fechaLimite,
    nota: nota,
    creadoEn: new Date().toISOString(),
    pagos: [],
  });

  guardarCreditos();

  // Dejamos el formulario listo para el siguiente cliente.
  formulario.reset();
  ponerFechasPorDefecto();
  filtroActual = 'todos';
  textoBusqueda = '';
  buscador.value = '';
  actualizarBotonesFiltro();
  renderizar();

  mostrarAviso('Fiado de ' + cliente + ' guardado.');
}

function manejarBusqueda(evento) {
  textoBusqueda = evento.target.value;
  renderizarLista();
}

function manejarClicEnLista(evento) {
  const boton = evento.target.closest('button[data-accion]');
  if (!boton) return;

  const id = boton.dataset.id;
  const credito = creditos.find(function (item) {
    return item.id === id;
  });
  if (!credito) return;

  const accion = boton.dataset.accion;

  if (accion === 'abonar') {
    idAbonando = idAbonando === id ? null : id;
    idEditando = null;
    renderizarLista();
    enfocar('.form-abono input');
    return;
  }

  if (accion === 'cancelar-abono') {
    idAbonando = null;
    renderizarLista();
    return;
  }

  if (accion === 'editar') {
    idEditando = idEditando === id ? null : id;
    idAbonando = null;
    renderizarLista();
    enfocar('.form-edicion input');
    return;
  }

  if (accion === 'cancelar-edicion') {
    idEditando = null;
    renderizarLista();
    return;
  }

  if (accion === 'pagar') {
    const saldo = calcularSaldo(credito);

    if (saldo <= 0) {
      mostrarAviso('Este fiado ya está pagado.', true);
      return;
    }

    const confirmar = confirm(
      '¿Marcar como pagado el fiado de ' + credito.cliente + ' por ' + formatearDinero(saldo) + '?'
    );
    if (!confirmar) return;

    agregarPago(credito, saldo, 'Pago total');
    guardarCreditos();
    renderizar();
    mostrarAviso('Fiado de ' + credito.cliente + ' marcado como pagado.');
    return;
  }

  if (accion === 'deshacer-pago') {
    if (credito.pagos.length === 0) {
      mostrarAviso('Este fiado no tiene abonos para deshacer.', true);
      return;
    }

    const ultimoPago = credito.pagos[credito.pagos.length - 1];
    const confirmar = confirm(
      '¿Deshacer el último abono de ' + formatearDinero(ultimoPago.monto) + '? El saldo volverá a subir.'
    );
    if (!confirmar) return;

    credito.pagos.pop();
    guardarCreditos();
    renderizar();
    mostrarAviso('Último abono deshecho.');
    return;
  }

  if (accion === 'eliminar') {
    const confirmar = confirm(
      '¿Eliminar el fiado de ' + credito.cliente + '? Esta acción no se puede deshacer.'
    );
    if (!confirmar) return;

    creditos = creditos.filter(function (item) {
      return item.id !== id;
    });
    if (idAbonando === id) idAbonando = null;
    if (idEditando === id) idEditando = null;

    guardarCreditos();
    renderizar();
    mostrarAviso('Fiado eliminado.');
  }
}

function manejarEnvioEnLista(evento) {
  if (evento.target.closest('.form-abono')) {
    manejarEnvioAbono(evento);
    return;
  }

  if (evento.target.closest('.form-edicion')) {
    manejarEnvioEdicion(evento);
  }
}

function manejarEnvioAbono(evento) {
  const formularioAbono = evento.target.closest('.form-abono');
  if (!formularioAbono) return;

  evento.preventDefault();

  const credito = buscarCredito(formularioAbono.dataset.id);
  if (!credito) return;

  const saldo = calcularSaldo(credito);
  const montoTexto = formularioAbono.querySelector('input').value.trim();

  if (!esEnteroPositivo(montoTexto)) {
    mostrarAviso('El abono debe ser un número entero mayor que cero, sin puntos ni comas.', true);
    return;
  }

  const monto = Number(montoTexto);

  if (monto > saldo) {
    mostrarAviso('El abono no puede superar el saldo de ' + formatearDinero(saldo) + '.', true);
    return;
  }

  agregarPago(credito, monto, 'Abono');
  idAbonando = null;
  guardarCreditos();
  renderizar();
  mostrarAviso('Abono de ' + formatearDinero(monto) + ' registrado a ' + credito.cliente + '.');
}

function manejarEnvioEdicion(evento) {
  const formularioEdicion = evento.target.closest('.form-edicion');
  if (!formularioEdicion) return;

  evento.preventDefault();

  const credito = buscarCredito(formularioEdicion.dataset.id);
  if (!credito) return;

  const error = formularioEdicion.querySelector('.mensaje-error');
  error.textContent = '';

  const cliente = formularioEdicion.querySelector('[name="edit-cliente"]').value.trim();
  const descripcion = formularioEdicion.querySelector('[name="edit-descripcion"]').value.trim();
  const montoTexto = formularioEdicion.querySelector('[name="edit-monto"]').value.trim();
  const fechaCredito = formularioEdicion.querySelector('[name="edit-fecha-credito"]').value;
  const fechaLimite = formularioEdicion.querySelector('[name="edit-fecha-limite"]').value;
  const nota = formularioEdicion.querySelector('[name="edit-nota"]').value.trim();

  if (cliente === '') {
    error.textContent = 'Escribe el nombre del cliente.';
    return;
  }

  if (descripcion === '') {
    error.textContent = 'Escribe qué se llevó el cliente.';
    return;
  }

  if (!esEnteroPositivo(montoTexto)) {
    error.textContent = 'Escribe el valor sin puntos ni comas, solo números.';
    return;
  }

  const monto = Number(montoTexto);

  if (fechaCredito === '' || fechaLimite === '') {
    error.textContent = 'Completa las dos fechas.';
    return;
  }

  if (fechaLimite < fechaCredito) {
    error.textContent = 'La fecha límite no puede ser anterior a la fecha del fiado.';
    return;
  }

  if (monto < calcularAbonado(credito)) {
    error.textContent =
      'El valor no puede ser menor que lo ya abonado (' + formatearDinero(calcularAbonado(credito)) + ').';
    return;
  }

  credito.cliente = cliente;
  credito.descripcion = descripcion;
  credito.monto = monto;
  credito.fechaCredito = fechaCredito;
  credito.fechaLimite = fechaLimite;
  credito.nota = nota;

  idEditando = null;
  guardarCreditos();
  renderizar();
  mostrarAviso('Fiado actualizado.');
}

function buscarCredito(id) {
  return creditos.find(function (item) {
    return item.id === id;
  });
}

function agregarPago(credito, monto, nota) {
  credito.pagos.push({
    fecha: fechaAInput(fechaDeHoy()),
    monto: monto,
    nota: nota,
  });
}

/* ---------- 6. Cálculos ---------- */
function calcularAbonado(credito) {
  return credito.pagos.reduce(function (suma, pago) {
    return suma + pago.monto;
  }, 0);
}

function calcularSaldo(credito) {
  return Math.max(0, credito.monto - calcularAbonado(credito));
}

function obtenerEstado(credito) {
  const saldo = calcularSaldo(credito);

  if (saldo <= 0) {
    return { tipo: 'pagado', texto: 'Pagado' };
  }

  const hoy = fechaDeHoy();
  const limite = parsearFecha(credito.fechaLimite);
  const diasRestantes = diasEntre(hoy, limite);

  if (diasRestantes < 0) {
    const atraso = Math.abs(diasRestantes);
    const textoDias = atraso === 1 ? '1 día' : atraso + ' días';

    if (atraso >= DIAS_MUY_ATRASADO) {
      return { tipo: 'muy-atrasado', texto: 'Muy atrasado · ' + textoDias };
    }

    return { tipo: 'atrasado', texto: 'Atrasado ' + textoDias };
  }

  if (diasRestantes === 0) {
    return { tipo: 'por-vencer', texto: 'Vence hoy' };
  }

  if (diasRestantes <= DIAS_POR_VENCER) {
    const textoDias = diasRestantes === 1 ? '1 día' : diasRestantes + ' días';
    return { tipo: 'por-vencer', texto: 'Vence en ' + textoDias };
  }

  return { tipo: 'al-dia', texto: 'Al día' };
}

/* ---------- 7. Renderizado ---------- */
function renderizar() {
  renderizarResumen();
  renderizarLista();
}

function renderizarResumen() {
  let porCobrar = 0;
  let atrasado = 0;
  let pendientes = 0;

  creditos.forEach(function (credito) {
    const saldo = calcularSaldo(credito);
    if (saldo <= 0) return;

    pendientes += 1;
    porCobrar += saldo;

    const tipo = obtenerEstado(credito).tipo;
    if (tipo === 'atrasado' || tipo === 'muy-atrasado') {
      atrasado += saldo;
    }
  });

  totalPorCobrar.textContent = formatearDinero(porCobrar);
  totalAtrasado.textContent = formatearDinero(atrasado);
  totalPendientes.textContent = pendientes;
}

function renderizarLista() {
  const visibles = creditos
    .filter(cumpleFiltro)
    .filter(cumpleBusqueda)
    .sort(compararFiados);

  if (visibles.length === 0) {
    listaCreditos.innerHTML = crearMensajeVacio();
    return;
  }

  listaCreditos.innerHTML = visibles.map(crearTarjetaCredito).join('');
}

function cumpleFiltro(credito) {
  const saldo = calcularSaldo(credito);
  const tipo = obtenerEstado(credito).tipo;

  if (filtroActual === 'pendientes') return saldo > 0;
  if (filtroActual === 'atrasados') return tipo === 'atrasado' || tipo === 'muy-atrasado';
  if (filtroActual === 'pagados') return saldo <= 0;
  return true;
}

function cumpleBusqueda(credito) {
  const busqueda = textoBusqueda.trim();
  if (busqueda === '') return true;

  const texto = normalizarTexto(credito.cliente + ' ' + credito.descripcion);
  return texto.includes(normalizarTexto(busqueda));
}

function compararFiados(a, b) {
  const pagadoA = calcularSaldo(a) <= 0;
  const pagadoB = calcularSaldo(b) <= 0;

  // Primero los pendientes y, entre ellos, el fiado más reciente.
  if (pagadoA !== pagadoB) return pagadoA ? 1 : -1;

  return b.creadoEn.localeCompare(a.creadoEn);
}

function actualizarBotonesFiltro() {
  botonesFiltro.forEach(function (boton) {
    const activo = boton.dataset.filtro === filtroActual;
    boton.classList.toggle('activo', activo);
    boton.setAttribute('aria-pressed', String(activo));
  });
}

function enfocar(selector) {
  const elemento = listaCreditos.querySelector(selector);
  if (elemento) elemento.focus();
}

function crearMensajeVacio() {
  if (creditos.length === 0) {
    return `
      <div class="vacio">
        <strong>Todavía no hay fiados</strong>
        <p>Anota el primero con el formulario.</p>
      </div>
    `;
  }

  return `
    <div class="vacio">
      <strong>No hay fiados con este filtro</strong>
      <p>Prueba con otro filtro o borra la búsqueda.</p>
    </div>
  `;
}

function crearTarjetaCredito(credito) {
  const saldo = calcularSaldo(credito);
  const abonado = calcularAbonado(credito);
  const estado = obtenerEstado(credito);
  const estaPagado = saldo <= 0;
  const abonoAbierto = idAbonando === credito.id;
  const edicionAbierta = idEditando === credito.id;

  const detalleTotal = 'Total del fiado: ' + formatearDinero(credito.monto) +
    (abonado > 0 ? ' · Abonado: ' + formatearDinero(abonado) : '') +
    (estaPagado ? ' · Pagado por completo' : '');

  const notaHTML = credito.nota
    ? '<p class="credito-nota">' + escaparHTML(credito.nota) + '</p>'
    : '';

  const alertaHTML = estado.tipo === 'muy-atrasado'
    ? '<p class="credito-alerta">Lleva mucho tiempo sin pagar. Conviene recordarle el pago.</p>'
    : '';

  const historialHTML = crearHistorial(credito);
  const resumenClienteHTML = crearResumenCliente(credito);

  const formularioAbonoHTML = abonoAbierto && !estaPagado
    ? `
      <form class="form-abono" data-id="${credito.id}">
        <label class="etiqueta-oculta" for="abono-${credito.id}">Monto del abono</label>
        <input
          id="abono-${credito.id}"
          type="number"
          inputmode="numeric"
          step="1"
          min="1"
          max="${saldo}"
          placeholder="Monto del abono"
          required
        >
        <button type="submit" class="boton boton--primario boton--pequeno">Guardar abono</button>
        <button type="button" class="boton boton--fantasma boton--pequeno" data-accion="cancelar-abono" data-id="${credito.id}">
          Cancelar
        </button>
      </form>
    `
    : '';

  const formularioEdicionHTML = edicionAbierta
    ? `
      <form class="form-edicion" data-id="${credito.id}">
        <div class="campo">
          <label for="edit-cliente-${credito.id}">Nombre del cliente</label>
          <input
            id="edit-cliente-${credito.id}"
            name="edit-cliente"
            type="text"
            maxlength="60"
            value="${escaparHTML(credito.cliente)}"
            required
          >
        </div>

        <div class="campo">
          <label for="edit-descripcion-${credito.id}">¿Qué se llevó?</label>
          <input
            id="edit-descripcion-${credito.id}"
            name="edit-descripcion"
            type="text"
            maxlength="120"
            value="${escaparHTML(credito.descripcion)}"
            required
          >
        </div>

        <div class="campo-fila">
          <div class="campo">
            <label for="edit-monto-${credito.id}">Valor del fiado</label>
            <input
              id="edit-monto-${credito.id}"
              name="edit-monto"
              type="number"
              inputmode="numeric"
              step="1"
              min="1"
              value="${credito.monto}"
              required
            >
          </div>

          <div class="campo">
            <label for="edit-fecha-credito-${credito.id}">Fecha del fiado</label>
            <input
              id="edit-fecha-credito-${credito.id}"
              name="edit-fecha-credito"
              type="date"
              value="${credito.fechaCredito}"
              required
            >
          </div>
        </div>

        <div class="campo-fila">
          <div class="campo">
            <label for="edit-fecha-limite-${credito.id}">Fecha límite</label>
            <input
              id="edit-fecha-limite-${credito.id}"
              name="edit-fecha-limite"
              type="date"
              value="${credito.fechaLimite}"
              required
            >
          </div>

          <div class="campo">
            <label for="edit-nota-${credito.id}">Nota (opcional)</label>
            <input
              id="edit-nota-${credito.id}"
              name="edit-nota"
              type="text"
              maxlength="120"
              value="${escaparHTML(credito.nota)}"
            >
          </div>
        </div>

        <p class="mensaje-error" role="alert"></p>

        <div class="form-edicion-acciones">
          <button type="submit" class="boton boton--primario boton--pequeno">Guardar cambios</button>
          <button type="button" class="boton boton--fantasma boton--pequeno" data-accion="cancelar-edicion" data-id="${credito.id}">
            Cancelar
          </button>
        </div>
      </form>
    `
    : '';

  const accionesHTML = estaPagado
    ? `
      <button type="button" class="boton boton--secundario boton--pequeno" data-accion="editar" data-id="${credito.id}">
        Editar
      </button>
      <button type="button" class="boton boton--peligro boton--pequeno" data-accion="eliminar" data-id="${credito.id}">
        Eliminar
      </button>
    `
    : `
      <button type="button" class="boton boton--primario boton--pequeno" data-accion="abonar" data-id="${credito.id}">
        ${abonoAbierto ? 'Cerrar abono' : 'Abonar'}
      </button>
      <button type="button" class="boton boton--secundario boton--pequeno" data-accion="pagar" data-id="${credito.id}">
        Marcar pagado
      </button>
      <button type="button" class="boton boton--fantasma boton--pequeno" data-accion="editar" data-id="${credito.id}">
        Editar
      </button>
      <button type="button" class="boton boton--peligro boton--pequeno" data-accion="eliminar" data-id="${credito.id}">
        Eliminar
      </button>
    `;

  return `
    <article class="credito credito--${estado.tipo}">
      <div class="credito-cabecera">
        <h3 class="credito-cliente">${escaparHTML(credito.cliente)}</h3>
        <span class="estado estado--${estado.tipo}">${estado.texto}</span>
      </div>

      <p class="credito-descripcion">${escaparHTML(credito.descripcion)}</p>
      <p class="credito-saldo">${formatearDinero(saldo)}</p>
      <p class="credito-total">${detalleTotal}</p>

      ${resumenClienteHTML}

      <div class="credito-fechas">
        <span><strong>Fiado:</strong> ${formatearFecha(credito.fechaCredito)}</span>
        <span><strong>Límite:</strong> ${formatearFecha(credito.fechaLimite)}</span>
      </div>

      ${notaHTML}
      ${alertaHTML}
      ${historialHTML}
      ${formularioAbonoHTML}
      ${formularioEdicionHTML}

      <div class="credito-acciones">
        ${accionesHTML}
      </div>
    </article>
  `;
}

function crearResumenCliente(credito) {
  const clave = normalizarTexto(credito.cliente);
  const fiadosPendientes = creditos.filter(function (item) {
    return normalizarTexto(item.cliente) === clave && calcularSaldo(item) > 0;
  });

  if (fiadosPendientes.length <= 1) return '';

  const total = fiadosPendientes.reduce(function (suma, item) {
    return suma + calcularSaldo(item);
  }, 0);

  return `
    <p class="cliente-total">
      Este cliente debe en total: <strong>${formatearDinero(total)}</strong>
      (${fiadosPendientes.length} fiados pendientes).
    </p>
  `;
}

function crearHistorial(credito) {
  if (credito.pagos.length === 0) return '';

  const items = credito.pagos.map(function (pago) {
    return `
      <li>
        <span>${formatearFecha(pago.fecha)}</span>
        <strong>${formatearDinero(pago.monto)}</strong>
        <span class="historial-nota">${escaparHTML(pago.nota)}</span>
      </li>
    `;
  }).join('');

  return `
    <details class="historial">
      <summary>Ver abonos (${credito.pagos.length})</summary>
      <ul class="historial-lista">${items}</ul>
      <button type="button" class="boton boton--fantasma boton--pequeno" data-accion="deshacer-pago" data-id="${credito.id}">
        Deshacer último abono
      </button>
    </details>
  `;
}

/* ---------- 8. Utilidades ---------- */
function ponerFechasPorDefecto() {
  const hoy = fechaDeHoy();
  const dentroDeQuinceDias = new Date(hoy);
  dentroDeQuinceDias.setDate(hoy.getDate() + 15);

  campoFechaCredito.value = fechaAInput(hoy);
  campoFechaLimite.value = fechaAInput(dentroDeQuinceDias);
}

function fechaDeHoy() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy;
}

function parsearFecha(textoISO) {
  const partes = textoISO.split('-');
  const anio = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);
  return new Date(anio, mes - 1, dia);
}

function fechaAInput(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return anio + '-' + mes + '-' + dia;
}

function diasEntre(fechaInicio, fechaFin) {
  const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;
  const diferencia = fechaFin.getTime() - fechaInicio.getTime();
  return Math.round(diferencia / MILISEGUNDOS_POR_DIA);
}

function esFechaISO(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;

  const fecha = parsearFecha(texto);
  if (Number.isNaN(fecha.getTime())) return false;

  // Evita fechas imposibles como 2026-02-31, que JavaScript "corrige" solo.
  return (
    fecha.getFullYear() === Number(texto.slice(0, 4)) &&
    fecha.getMonth() + 1 === Number(texto.slice(5, 7)) &&
    fecha.getDate() === Number(texto.slice(8, 10))
  );
}

function formatearFecha(textoISO) {
  return formateadorFecha.format(parsearFecha(textoISO));
}

function formatearDinero(valor) {
  return formateadorDinero.format(valor);
}

function normalizarTexto(texto) {
  return String(texto)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function esEnteroPositivo(texto) {
  if (!/^\d+$/.test(texto)) return false;
  const valor = Number(texto);
  return Number.isSafeInteger(valor) && valor > 0;
}

function escaparHTML(texto) {
  return String(texto)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function crearId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'fiado-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
}

function mostrarAviso(mensaje, esError) {
  aviso.textContent = mensaje;
  aviso.classList.toggle('aviso--error', Boolean(esError));
  aviso.classList.add('aviso--visible');

  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(function () {
    aviso.classList.remove('aviso--visible');
  }, 4000);
}

function mostrarError(mensaje) {
  mensajeError.textContent = mensaje;
}

function ocultarError() {
  mensajeError.textContent = '';
}

/* ---------- 9. Guardado, copia y restauración ---------- */
function cargarCreditos() {
  try {
    const guardado = localStorage.getItem(CLAVE_GUARDADO);
    if (guardado) {
      const normalizados = normalizarLista(JSON.parse(guardado));
      const textoNormalizado = JSON.stringify(normalizados);

      // Si el archivo guardado tenía IDs repetidos o fechas raras,
      // dejamos la versión corregida guardada para la próxima visita.
      if (textoNormalizado !== guardado) {
        try {
          localStorage.setItem(CLAVE_GUARDADO, textoNormalizado);
        } catch (error) {
          console.error('No se pudo actualizar el formato de los fiados:', error);
        }
      }

      return normalizados;
    }

    const anterior = localStorage.getItem(CLAVE_ANTERIOR);
    if (anterior) {
      const migrados = normalizarLista(JSON.parse(anterior));
      localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(migrados));
      return migrados;
    }

    return [];
  } catch (error) {
    console.error('No se pudieron cargar los fiados:', error);
    return [];
  }
}

function normalizarLista(lista) {
  if (!Array.isArray(lista)) return [];

  const idsUsados = new Set();

  return lista
    .map(normalizarCredito)
    .filter(function (credito) {
      return credito !== null;
    })
    .map(function (credito) {
      let id = credito.id;

      // Si una copia trae dos fiados con el mismo ID, creamos uno nuevo
      // para que los botones no confundan un fiado con otro.
      while (idsUsados.has(id)) {
        id = crearId();
      }

      credito.id = id;
      idsUsados.add(id);
      return credito;
    });
}

function normalizarCredito(credito) {
  if (!credito || typeof credito !== 'object') return null;

  const cliente = String(credito.cliente || '').trim();
  const monto = Math.round(Number(credito.monto));

  if (cliente === '' || !Number.isSafeInteger(monto) || monto <= 0) return null;

  const fechaCredito = esFechaISO(credito.fechaCredito)
    ? credito.fechaCredito
    : fechaAInput(fechaDeHoy());

  const fechaLimite = esFechaISO(credito.fechaLimite)
    ? credito.fechaLimite
    : fechaCredito;

  const descripcion =
    String(credito.descripcion || '').trim() ||
    String(credito.nota || '').trim() ||
    'Sin detalle';

  const creadoEn =
    typeof credito.creadoEn === 'string' && credito.creadoEn.trim() !== ''
      ? credito.creadoEn
      : fechaCredito + 'T12:00:00.000Z';

  return {
    id: normalizarId(credito.id),
    cliente: cliente,
    descripcion: descripcion,
    monto: monto,
    fechaCredito: fechaCredito,
    fechaLimite: fechaLimite,
    nota: String(credito.nota || '').trim(),
    creadoEn: creadoEn,
    pagos: normalizarPagos(credito, monto),
  };
}

function normalizarId(id) {
  if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id)) return id;
  return crearId();
}

function normalizarPagos(credito, monto) {
  if (Array.isArray(credito.pagos)) {
    return credito.pagos
      .map(function (pago) {
        if (!pago || typeof pago !== 'object') return null;

        const valor = Math.round(Number(pago.monto));
        if (!Number.isSafeInteger(valor) || valor <= 0) return null;

        return {
          fecha: esFechaISO(pago.fecha) ? pago.fecha : fechaAInput(fechaDeHoy()),
          monto: valor,
          nota: String(pago.nota || '').trim() || 'Abono',
        };
      })
      .filter(function (pago) {
        return pago !== null;
      });
  }

  const abonado = Math.round(Number(credito.abonado) || 0);
  if (Number.isSafeInteger(abonado) && abonado > 0) {
    return [{
      fecha: esFechaISO(credito.fechaCredito) ? credito.fechaCredito : fechaAInput(fechaDeHoy()),
      monto: Math.min(abonado, monto),
      nota: 'Abono anterior',
    }];
  }

  return [];
}

function guardarCreditos() {
  try {
    localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(creditos));
  } catch (error) {
    console.error('No se pudieron guardar los fiados:', error);
    mostrarAviso('No se pudieron guardar los datos en este navegador.', true);
  }
}

function exportarDatos() {
  try {
    const datos = {
      app: 'cuaderno-de-fiados',
      version: 2,
      exportadoEn: new Date().toISOString(),
      creditos: creditos,
    };

    const contenido = JSON.stringify(datos, null, 2);
    const archivo = new Blob([contenido], { type: 'application/json' });
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement('a');

    enlace.href = url;
    enlace.download = 'fiados-' + fechaAInput(fechaDeHoy()) + '.json';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    // Damos un segundo antes de liberar el archivo para que la descarga alcance a iniciar.
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);

    mostrarAviso('Copia descargada.');
  } catch (error) {
    console.error('No se pudo exportar:', error);
    mostrarAviso('No se pudo descargar la copia.', true);
  }
}

function abrirSelectorDeArchivo() {
  archivoImportar.click();
}

async function importarDatos(evento) {
  const archivo = evento.target.files[0];
  if (!archivo) return;

  try {
    const texto = await archivo.text();
    const datos = JSON.parse(texto);
    const lista = Array.isArray(datos) ? datos : datos.creditos;

    if (!Array.isArray(lista)) {
      mostrarAviso('El archivo no tiene el formato de una copia válida.', true);
      return;
    }

    const importados = normalizarLista(lista);
    if (importados.length === 0) {
      mostrarAviso('El archivo no contiene fiados válidos.', true);
      return;
    }

    const confirmar = confirm(
      'Esto reemplazará los ' + creditos.length + ' fiados actuales por ' +
      importados.length + ' fiados del archivo. ¿Continuar?'
    );
    if (!confirmar) return;

    creditos = importados;
    filtroActual = 'todos';
    textoBusqueda = '';
    buscador.value = '';
    idAbonando = null;
    idEditando = null;
    actualizarBotonesFiltro();
    guardarCreditos();
    renderizar();
    mostrarAviso('Copia restaurada.');
  } catch (error) {
    console.error('No se pudo importar:', error);
    mostrarAviso('No se pudo leer el archivo. Verifica que sea una copia válida.', true);
  } finally {
    archivoImportar.value = '';
  }
}
