/* =========================================================================
   GRAPIE — burbuja flotante de recomendaciones
   Lógica original de la colaboración de un compañero, adaptada para traer
   datos reales en vez de los 4 clientes de prueba y el catálogo aparte
   que traía la versión standalone.

   La capa de datos ya está conectada a la base real: al abrir la burbuja
   por primera vez, se pide una sola vez GET /api/grapie/perfil, que
   devuelve el cliente logueado (vía sesión de Flask) y el catálogo real
   de vinoteca. De ahí en adelante todo opera en memoria sobre esos datos,
   igual que la versión original — el setTimeout de "Buscando..." ya no
   simula ida y vuelta a la base (eso ya pasó una vez al abrir), se dejó
   solo como pausa de ritmo para que la respuesta no aparezca instantánea.
   ========================================================================= */

const NIVEL_BENEFICIO = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };

const BENEFICIOS = [
  { nombre: "Late check-out en hotel", tipo: "ACCESO_SERVICIO", costo_millas: 1500, categoria_minima: null },
  { nombre: "Equipaje extra 23kg", tipo: "UPGRADE_VUELO", costo_millas: 2000, categoria_minima: null },
  { nombre: "Kit de viaje premium (regalo)", tipo: "REGALO", costo_millas: 3000, categoria_minima: null },
  { nombre: "Acceso Sala VIP Ezeiza", tipo: "ACCESO_SERVICIO", costo_millas: 5000, categoria_minima: "Silver" },
  { nombre: "Upgrade a Business (vuelos nacionales)", tipo: "UPGRADE_VUELO", costo_millas: 8000, categoria_minima: "Silver" },
  { nombre: "Valija cabina de diseño (regalo)", tipo: "REGALO", costo_millas: 12000, categoria_minima: "Gold" },
  { nombre: "Upgrade a Primera Clase (internacional)", tipo: "UPGRADE_VUELO", costo_millas: 30000, categoria_minima: "Platinum" },
];
// Nota: los "beneficios de viaje" siguen siendo una lista ilustrativa —
// todavía no hay una tabla en la base para canjearlos de verdad. Se
// filtran por categoría mínima igual que los vinos exclusivos, pero
// costo_millas es solo informativo (nuestras millas son un puntaje
// acumulado que define categoría, no un saldo que se gasta).

const ICONS = { UPGRADE_VUELO: "✈️", ACCESO_SERVICIO: "🛋️", REGALO: "🎁", VINO: "🍷" };

/* =========================================================================
   ESTADO
   ========================================================================= */

let cliente = null;
let vinos = [];
let datosListos = false;

let historial = [];
let estado = "NORMAL"; // NORMAL | ESPERANDO_CONTINUAR | ESPERANDO_CIERRE

const $launcher = document.getElementById("grapie-launcher");
const $panel = document.getElementById("grapie-panel");
const $chat = document.getElementById("grapie-chat");
const $input = document.getElementById("grapie-input");
const $send = document.getElementById("grapie-send");
const $quick = document.getElementById("grapie-quick");
const $estado = document.getElementById("grapie-estado");

/* ---------- carga de datos reales (una vez por conversación) ---------- */
async function cargarDatos() {
  if (datosListos) return true;
  try {
    const r = await fetch("/api/grapie/perfil");
    if (!r.ok) throw new Error("no autenticado");
    const data = await r.json();
    cliente = data.cliente;
    vinos = data.vinos;
    datosListos = true;
    return true;
  } catch (e) {
    return false;
  }
}

function elegibleVino(v) {
  return !v.categoria_cliente || v.categoria_cliente.nivel <= cliente.categoria_cliente.nivel;
}
function elegibleBeneficio(b) {
  return !b.categoria_minima || NIVEL_BENEFICIO[b.categoria_minima] <= cliente.categoria_cliente.nivel;
}

/* ---------- normalización de sí/no ---------- */
function normalizarSiNo(texto) {
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (t === "si" || t.startsWith("si")) return "SI";
  if (t === "no" || t.startsWith("no")) return "NO";
  return null;
}

/* ---------- render de mensajes ---------- */
function pintarHistorial() {
  $chat.innerHTML = "";
  historial.forEach((item) => {
    const div = document.createElement("div");
    if (item.tipo === "texto") {
      div.className = "g-msg " + item.rol;
      div.innerHTML = item.html;
    } else {
      div.className = "g-cards";
      div.innerHTML = item.html;
    }
    $chat.appendChild(div);
  });
  $chat.scrollTop = $chat.scrollHeight;
}

function agregarUsuario(texto) {
  historial.push({ tipo: "texto", rol: "user", html: escapeHtml(texto) });
  pintarHistorial();
}
function agregarBot(html) {
  historial.push({ tipo: "texto", rol: "bot", html });
  pintarHistorial();
}
function agregarCards(htmlArray) {
  if (!htmlArray.length) return;
  historial.push({ tipo: "cards", html: htmlArray.join("") });
  pintarHistorial();
}
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderProfile() {
  document.getElementById("grapie-profile").innerHTML = `
    <div>
      <div class="name">${cliente.nombre} ${cliente.apellido}</div>
      <div class="sub">${cliente.millas_acumuladas.toLocaleString("es-AR")} millas &middot; ${cliente.categoria_cliente.descuento_pct}% desc. vinoteca</div>
    </div>
    <span class="g-badge ${cliente.categoria_cliente.nombre}">${cliente.categoria_cliente.nombre}</span>
  `;
}

function wineCard(v) {
  const final = Math.round(v.precio * (1 - cliente.categoria_cliente.descuento_pct / 100));
  return `<div class="g-card wine">
    <div class="icon">${ICONS.VINO}</div>
    <div class="body">
      <div class="title">${v.nombre}</div>
      <div class="meta">${v.varietal} &middot; $${v.precio.toLocaleString("es-AR")} (con tu descuento: $${final.toLocaleString("es-AR")})</div>
      ${v.categoria_cliente ? `<span class="req">Requiere ${v.categoria_cliente.nombre}</span>` : ""}
      <br><a class="goto" href="/beneficios#vino-${v.vino_id}">Ver en Beneficios →</a>
    </div>
  </div>`;
}
function benefitCard(b) {
  return `<div class="g-card benefit">
    <div class="icon">${ICONS[b.tipo]}</div>
    <div class="body">
      <div class="title">${b.nombre}</div>
      <div class="meta">${b.costo_millas.toLocaleString("es-AR")} millas</div>
      ${b.categoria_minima ? `<span class="req">Requiere ${b.categoria_minima}</span>` : ""}
    </div>
  </div>`;
}

/* ---------- búsqueda sobre los datos ya cargados ---------- */
function consultar(query) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const lower = query.toLowerCase();
      const esSugerencia = /suger|recomend|dale|algo para mi|qu[eé] me recomend/.test(lower);

      if (esSugerencia) {
        const v = vinos.filter(elegibleVino).sort((a, b) => b.precio - a.precio)[0];
        const b = BENEFICIOS.filter(elegibleBeneficio).sort((a, b) => b.costo_millas - a.costo_millas)[0];
        resolve({ tipo: "sugerencia", vinos: v ? [v] : [], beneficios: b ? [b] : [] });
        return;
      }

      const tokens = lower.split(/\s+/).filter(Boolean);
      const matchVinos = vinos.filter((v) => {
        if (!elegibleVino(v)) return false;
        const texto = (v.nombre + " " + v.varietal + " vino").toLowerCase();
        return tokens.some((t) => texto.includes(t));
      });
      const tipoAlias = {
        upgrade: "UPGRADE_VUELO", vuelo: "UPGRADE_VUELO",
        vip: "ACCESO_SERVICIO", sala: "ACCESO_SERVICIO", servicio: "ACCESO_SERVICIO",
        regalo: "REGALO", regalos: "REGALO",
      };
      const matchBeneficios = BENEFICIOS.filter((b) => {
        if (!elegibleBeneficio(b)) return false;
        const texto = b.nombre.toLowerCase();
        const tipoMatch = tokens.some((t) => tipoAlias[t] === b.tipo);
        const textoMatch = tokens.some((t) => texto.includes(t));
        return tipoMatch || textoMatch;
      });

      resolve({
        tipo: matchVinos.length + matchBeneficios.length === 0 ? "vacio" : "busqueda",
        vinos: matchVinos,
        beneficios: matchBeneficios,
      });
    }, 550);
  });
}

/* ---------- flujo principal ---------- */
async function procesarMensaje(texto) {
  agregarUsuario(texto);
  $input.value = "";

  if (estado === "ESPERANDO_CONTINUAR") {
    const r = normalizarSiNo(texto);
    if (r === "SI") {
      estado = "NORMAL";
      agregarBot("Perfecto, ¿en qué más te puedo ayudar?");
    } else if (r === "NO") {
      estado = "ESPERANDO_CIERRE";
      agregarBot("¿Desea terminar con la consulta? <strong>Sí/No</strong>");
    } else {
      agregarBot("Perdón, no te entendí. ¿Podés responder con Sí o No?");
    }
    return;
  }

  if (estado === "ESPERANDO_CIERRE") {
    const r = normalizarSiNo(texto);
    if (r === "SI") {
      agregarBot("¡Gracias por tu consulta! Cerrando la conversación. 👋");
      cerrarConsultaDefinitivamente();
    } else if (r === "NO") {
      estado = "NORMAL";
      agregarBot("Perfecto, ¿en qué más te puedo ayudar?");
    } else {
      agregarBot("Perdón, no te entendí. ¿Podés responder con Sí o No?");
    }
    return;
  }

  // estado === NORMAL: consulta real
  historial.push({ tipo: "texto", rol: "bot typing", html: "<em>Buscando en tu vinoteca...</em>" });
  pintarHistorial();

  const resultado = await consultar(texto);
  historial.pop();

  if (resultado.tipo === "sugerencia") {
    agregarBot(`Para tu categoría <strong>${cliente.categoria_cliente.nombre}</strong>, te recomiendo esto:`);
    agregarCards([...resultado.vinos.map(wineCard), ...resultado.beneficios.map(benefitCard)]);
  } else if (resultado.tipo === "vacio") {
    agregarBot(`No encontré nada disponible para vos con "<em>${escapeHtml(texto)}</em>". Probá con "vino", "upgrade", "sala vip" o "regalo".`);
  } else {
    agregarBot("Esto es lo que encontré, disponible para tu categoría:");
    agregarCards([...resultado.vinos.map(wineCard), ...resultado.beneficios.map(benefitCard)]);
  }

  estado = "ESPERANDO_CONTINUAR";
  agregarBot("¿Tiene alguna otra pregunta? <strong>Sí/No</strong>");
}

function cerrarConsultaDefinitivamente() {
  estado = "NORMAL";
  $quick.classList.add("disabled");
  $input.disabled = true;
  $send.disabled = true;
  $estado.textContent = "Consulta finalizada";
  setTimeout(() => {
    historial = [];
    $panel.classList.add("hidden");
    $input.disabled = false;
    $send.disabled = false;
    $quick.classList.remove("disabled");
    $estado.textContent = "Consulta activa";
  }, 1400);
}

/* ---------- apertura / cierre del pop-up ---------- */
$launcher.addEventListener("click", async () => {
  const abriendo = $panel.classList.contains("hidden");
  $panel.classList.toggle("hidden");
  if (!abriendo || historial.length > 0) return;

  agregarBot("Conectando con tu perfil...");
  const ok = await cargarDatos();
  historial = [];

  if (!ok) {
    agregarBot("No pude cargar tu perfil ahora mismo. Recargá la página e intentá de nuevo.");
    return;
  }

  renderProfile();
  agregarBot(
    `¡Hola, ${cliente.nombre}! Soy <strong>Grapie</strong> 🍇, tu concierge de millas. ` +
    `Preguntame por un vino o un beneficio de viaje, o pedime una sugerencia.`
  );
});

document.getElementById("grapie-cerrar").addEventListener("click", () => {
  if (estado === "ESPERANDO_CIERRE" || !datosListos) return;
  estado = "ESPERANDO_CIERRE";
  agregarBot("¿Desea terminar con la consulta? <strong>Sí/No</strong>");
});

$send.addEventListener("click", () => {
  const texto = $input.value.trim();
  if (!texto || !datosListos) return;
  procesarMensaje(texto);
});
$input.addEventListener("keydown", (e) => { if (e.key === "Enter") $send.click(); });
document.querySelectorAll(".grapie-quick button").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!datosListos) return;
    procesarMensaje(btn.dataset.q);
  });
});
