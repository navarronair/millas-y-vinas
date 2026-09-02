/*
 * Concierge de Millas — lógica original de la colaboración de un
 * compañero, adaptada para leer datos reales en vez de los 4 clientes
 * de prueba y el catálogo aparte que traía la versión standalone:
 *
 *   - `cliente` viene del cliente logueado (window.CLIENTE_ACTUAL,
 *     inyectado por Flask en concierge.html).
 *   - `vinos` viene del catálogo real de la vinoteca (window.CATALOGO_VINOS,
 *     la misma consulta que usa la página de Beneficios).
 *
 * Los "beneficios de viaje" (upgrades, sala VIP, regalos) siguen siendo
 * una lista ilustrativa: no hay todavía una tabla en la base para
 * canjearlos de verdad, así que se filtran por categoría igual que los
 * vinos exclusivos, pero no restan millas de ningún lado.
 */

const cliente = window.CLIENTE_ACTUAL;
const vinos = window.CATALOGO_VINOS;

const descuentoPct = cliente.categoria_cliente.descuento_pct;
const nivelCliente = cliente.categoria_cliente.nivel;

const NIVEL_BENEFICIO = { Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };

const BENEFICIOS = [
  { nombre: "Late check-out en hotel", tipo: "ACCESO_SERVICIO", valor_millas: 1500, categoria_minima: null },
  { nombre: "Equipaje extra 23kg", tipo: "UPGRADE_VUELO", valor_millas: 2000, categoria_minima: null },
  { nombre: "Kit de viaje premium (regalo)", tipo: "REGALO", valor_millas: 3000, categoria_minima: null },
  { nombre: "Acceso Sala VIP Ezeiza", tipo: "ACCESO_SERVICIO", valor_millas: 5000, categoria_minima: "Silver" },
  { nombre: "Upgrade a Business (vuelos nacionales)", tipo: "UPGRADE_VUELO", valor_millas: 8000, categoria_minima: "Silver" },
  { nombre: "Valija cabina de diseño (regalo)", tipo: "REGALO", valor_millas: 12000, categoria_minima: "Gold" },
  { nombre: "Upgrade a Primera Clase (internacional)", tipo: "UPGRADE_VUELO", valor_millas: 30000, categoria_minima: "Platinum" },
];

const ICONS = { UPGRADE_VUELO: "✈️", ACCESO_SERVICIO: "🛋️", REGALO: "🎁", VINO: "🍷" };

function elegibleVino(v) {
  return !v.categoria_cliente || v.categoria_cliente.nivel <= nivelCliente;
}
function elegibleBeneficio(b) {
  return !b.categoria_minima || NIVEL_BENEFICIO[b.categoria_minima] <= nivelCliente;
}

function renderProfile() {
  document.getElementById("c-profile").innerHTML = `
    <div>
      <div class="name">${cliente.nombre} ${cliente.apellido}</div>
      <div class="sub">${cliente.millas_acumuladas.toLocaleString("es-AR")} millas acumuladas &middot; ${descuentoPct}% desc. en vinoteca</div>
    </div>
    <span class="badge ${cliente.categoria_cliente.nombre}">${cliente.categoria_cliente.nombre}</span>
  `;
}

function addBotText(html) {
  const chat = document.getElementById("c-chat");
  const div = document.createElement("div");
  div.className = "c-msg bot";
  div.innerHTML = html;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function addUserText(text) {
  const chat = document.getElementById("c-chat");
  const div = document.createElement("div");
  div.className = "c-msg user";
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function wineCard(v) {
  const final = Math.round(v.precio * (1 - descuentoPct / 100));
  return `<div class="c-card wine">
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
  return `<div class="c-card benefit">
    <div class="icon">${ICONS[b.tipo]}</div>
    <div class="body">
      <div class="title">${b.nombre}</div>
      <div class="meta">valor estimado: ${b.valor_millas.toLocaleString("es-AR")} millas</div>
      ${b.categoria_minima ? `<span class="req">Requiere ${b.categoria_minima}</span>` : ""}
    </div>
  </div>`;
}

function addCards(cardsHtmlArray) {
  const chat = document.getElementById("c-chat");
  const div = document.createElement("div");
  div.className = "c-cards";
  div.innerHTML = cardsHtmlArray.join("");
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function bestVino() {
  const opciones = vinos.filter(elegibleVino);
  return opciones.sort((a, b) => b.precio - a.precio)[0];
}

function bestBeneficio() {
  const opciones = BENEFICIOS.filter(elegibleBeneficio);
  return opciones.sort((a, b) => b.valor_millas - a.valor_millas)[0];
}

function buscar(query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

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

  return { matchVinos, matchBeneficios };
}

function handleQuery(text) {
  addUserText(text);
  const lower = text.toLowerCase();
  const esSugerencia = /suger|recomend|dale|algo para mi|qu[eé] me recomend/.test(lower);

  if (esSugerencia) {
    const v = bestVino();
    const b = bestBeneficio();
    addBotText(`Para tu categoría <strong>${cliente.categoria_cliente.nombre}</strong>, te recomiendo esto:`);
    const cards = [];
    if (v) cards.push(wineCard(v));
    if (b) cards.push(benefitCard(b));
    if (cards.length) addCards(cards);
    else addBotText("Por ahora no tengo opciones para sugerirte, ¡seguí sumando millas!");
    return;
  }

  const { matchVinos, matchBeneficios } = buscar(text);
  const total = matchVinos.length + matchBeneficios.length;
  if (total === 0) {
    addBotText(`No encontré nada disponible para vos con "<em>${text}</em>". Probá con "vino", "upgrade", "sala vip" o "regalo".`);
    return;
  }
  addBotText(`Esto es lo que encontré, disponible para tu categoría:`);
  addCards([...matchVinos.map(wineCard), ...matchBeneficios.map(benefitCard)]);
}

function resetChat() {
  document.getElementById("c-chat").innerHTML = "";
  addBotText(
    `Hola, ${cliente.nombre}. Soy tu concierge de Millas &amp; Viñas. ` +
    `Puedo sugerirte un vino y un beneficio de viaje, o buscar algo puntual. ` +
    `Probá los botones de abajo o escribime.`
  );
}

document.getElementById("c-send").onclick = () => {
  const input = document.getElementById("c-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  handleQuery(text);
};

document.getElementById("c-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("c-send").click();
});

document.querySelectorAll(".concierge-quick button").forEach((btn) => {
  btn.onclick = () => handleQuery(btn.dataset.q);
});

renderProfile();
resetChat();
