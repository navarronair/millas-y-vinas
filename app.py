"""
Millas & Viñas — Turismo + Vinoteca
------------------------------------
App Flask que integra el módulo de Turismo (pasajes, hoteles, circuitos)
con la Vinoteca a través de un programa de fidelización por millas.

Estructura pensada para ser explicada línea por línea en un coloquio:
cada ruta hace una sola cosa y el cálculo de categoría/descuento vive
en la base de datos (funciones plpgsql), no repartido en el código Python.
"""

import os
from datetime import datetime

from dotenv import load_dotenv
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from supabase import create_client, Client
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key")

AGENCIA_ID_DEFAULT = 1  # única agencia cargada en el seed


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def cliente_logueado():
    """Devuelve el DNI del cliente en sesión, o None si no hay login."""
    return session.get("cliente_dni")


def requiere_login(f):
    """Decorator simple: redirige a /login si no hay sesión activa."""
    from functools import wraps

    @wraps(f)
    def wrapper(*args, **kwargs):
        if not cliente_logueado():
            flash("Iniciá sesión para acceder a Beneficios.", "warning")
            return redirect(url_for("login", next=request.path))
        return f(*args, **kwargs)

    return wrapper


def obtener_cliente(dni):
    res = (
        supabase.table("cliente")
        .select("*, categoria_cliente(*)")
        .eq("dni", dni)
        .single()
        .execute()
    )
    return res.data


def obtener_categorias():
    return (
        supabase.table("categoria_cliente")
        .select("*")
        .order("nivel")
        .execute()
        .data
    )


# ------------------------------------------------------------------
# Home
# ------------------------------------------------------------------

@app.route("/")
def home():
    categorias = obtener_categorias()
    circuitos = (
        supabase.table("circuito").select("*").order("circuito_id").limit(3).execute().data
    )
    return render_template("index.html", categorias=categorias, circuitos=circuitos)


# ------------------------------------------------------------------
# Explorar (catálogo de turismo)
# ------------------------------------------------------------------

@app.route("/explorar")
def explorar():
    pasajes = (
        supabase.table("pasaje")
        .select("*, salida:aero_salida_id(nombre,codigo), llegada:aero_llegada_id(nombre,codigo)")
        .order("horario_vuelo")
        .execute()
        .data
    )
    hoteles = (
        supabase.table("hotel")
        .select("*, ciudad(nombre)")
        .order("precio_noche")
        .execute()
        .data
    )
    circuitos = supabase.table("circuito").select("*").order("precio").execute().data

    return render_template(
        "explorar.html", pasajes=pasajes, hoteles=hoteles, circuitos=circuitos
    )


@app.route("/reservar/<tipo>/<int:item_id>", methods=["POST"])
@requiere_login
def reservar(tipo, item_id):
    if tipo not in ("pasaje", "hotel", "circuito"):
        flash("Tipo de reserva inválido.", "danger")
        return redirect(url_for("explorar"))

    dni = cliente_logueado()
    params = {
        "p_cliente_dni": dni,
        "p_agencia_id": AGENCIA_ID_DEFAULT,
        "p_pasaje_id": item_id if tipo == "pasaje" else None,
        "p_hotel_id": item_id if tipo == "hotel" else None,
        "p_circuito_id": item_id if tipo == "circuito" else None,
    }

    try:
        supabase.rpc("prc_registrar_reserva", params).execute()
    except Exception as exc:  # noqa: BLE001 - mostramos el error tal cual a modo de demo
        flash(f"No se pudo confirmar la reserva: {exc}", "danger")
        return redirect(url_for("explorar"))

    if tipo == "pasaje":
        flash("¡Reserva confirmada! Sumaste millas a tu cuenta.", "success")
    else:
        flash("¡Reserva confirmada!", "success")
    return redirect(url_for("mis_reservas"))


@app.route("/mis-reservas")
@requiere_login
def mis_reservas():
    dni = cliente_logueado()
    reservas = (
        supabase.table("reserva")
        .select(
            "*, pasaje(descripcion,horario_vuelo,precio), "
            "hotel(nombre,precio_noche), circuito(denominacion,precio)"
        )
        .eq("cliente_dni", dni)
        .order("fecha_reserva", desc=True)
        .execute()
        .data
    )
    return render_template("mis_reservas.html", reservas=reservas)


# ------------------------------------------------------------------
# Autenticación
# ------------------------------------------------------------------

@app.route("/registro", methods=["GET", "POST"])
def registro():
    if request.method == "POST":
        dni = request.form["dni"].strip()
        nombre = request.form["nombre"].strip()
        apellido = request.form["apellido"].strip()
        email = request.form["email"].strip().lower()
        telefono = request.form.get("telefono", "").strip()
        password = request.form["password"]

        existente = (
            supabase.table("cliente").select("dni").eq("dni", dni).execute().data
        )
        if existente:
            flash("Ya existe un cliente registrado con ese DNI.", "danger")
            return redirect(url_for("registro"))

        categoria_bronze = (
            supabase.table("categoria_cliente")
            .select("categoria_id")
            .eq("nivel", 1)
            .single()
            .execute()
            .data
        )

        supabase.table("cliente").insert(
            {
                "dni": dni,
                "nombre": nombre,
                "apellido": apellido,
                "email": email,
                "telefono": telefono,
                "password_hash": generate_password_hash(password),
                "millas_acumuladas": 0,
                "categoria_id": categoria_bronze["categoria_id"],
            }
        ).execute()

        flash("Cuenta creada. Iniciá sesión para continuar.", "success")
        return redirect(url_for("login"))

    return render_template("registro.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        dni = request.form["dni"].strip()
        password = request.form["password"]

        cliente = (
            supabase.table("cliente").select("*").eq("dni", dni).execute().data
        )
        if not cliente or not check_password_hash(cliente[0]["password_hash"], password):
            flash("DNI o contraseña incorrectos.", "danger")
            return redirect(url_for("login"))

        session["cliente_dni"] = dni
        session["cliente_nombre"] = cliente[0]["nombre"]
        flash(f"¡Bienvenido/a, {cliente[0]['nombre']}!", "success")
        return redirect(request.args.get("next") or url_for("beneficios"))

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    flash("Cerraste sesión.", "info")
    return redirect(url_for("home"))


# ------------------------------------------------------------------
# Beneficios (millas, categoría, catálogo exclusivo de vinos)
# ------------------------------------------------------------------

@app.route("/beneficios")
@requiere_login
def beneficios():
    dni = cliente_logueado()
    cliente = obtener_cliente(dni)
    categorias = obtener_categorias()

    nivel_actual = cliente["categoria_cliente"]["nivel"]
    siguiente = next((c for c in categorias if c["nivel"] == nivel_actual + 1), None)

    if siguiente:
        millas_faltantes = siguiente["millas_minimas"] - cliente["millas_acumuladas"]
        rango = siguiente["millas_minimas"] - cliente["categoria_cliente"]["millas_minimas"]
        progreso_pct = round(
            max(0, min(100, (cliente["millas_acumuladas"] - cliente["categoria_cliente"]["millas_minimas"]) / rango * 100))
        )
    else:
        millas_faltantes = 0
        progreso_pct = 100

    # Nota: no traemos stock acá para no depender de cómo PostgREST
    # resuelve el embed 1:1 (vino_id es UNIQUE en stock). El control de
    # stock real se hace igual dentro de prc_registrar_venta_vino.
    vinos = (
        supabase.table("vino")
        .select("*, bodega(nombre), categoria_cliente(nombre,nivel)")
        .order("precio")
        .execute()
        .data
    )

    compras = (
        supabase.table("venta_vino")
        .select("*, linea_venta_vino(*, vino(nombre))")
        .eq("cliente_dni", dni)
        .order("fecha", desc=True)
        .limit(5)
        .execute()
        .data
    )

    return render_template(
        "beneficios.html",
        cliente=cliente,
        siguiente=siguiente,
        millas_faltantes=millas_faltantes,
        progreso_pct=progreso_pct,
        vinos=vinos,
        compras=compras,
    )


# ------------------------------------------------------------------
# Grapie (chatbot de recomendaciones — colaboración de un compañero)
#
# Es una burbuja flotante que aparece en cualquier página del sitio
# (se inyecta en base.html, no es una página aparte). Cuando el
# usuario la abre, su JS le pega a este endpoint una sola vez para
# traer el perfil real del cliente logueado y el catálogo de vinos.
# ------------------------------------------------------------------

@app.route("/api/grapie/perfil")
def api_grapie_perfil():
    dni = cliente_logueado()
    if not dni:
        return jsonify({"error": "no autenticado"}), 401

    cliente = obtener_cliente(dni)

    # Nunca pasar el dict de `cliente` tal cual al frontend: trae
    # PASSWORD_HASH. Armamos un objeto mínimo con lo que necesita Grapie.
    cliente_publico = {
        "nombre": cliente["nombre"],
        "apellido": cliente["apellido"],
        "millas_acumuladas": cliente["millas_acumuladas"],
        "categoria_cliente": cliente["categoria_cliente"],
    }

    vinos = (
        supabase.table("vino")
        .select("*, bodega(nombre), categoria_cliente(nombre,nivel)")
        .order("precio")
        .execute()
        .data
    )

    return jsonify({"cliente": cliente_publico, "vinos": vinos})


@app.route("/vinoteca/comprar/<int:vino_id>", methods=["POST"])
@requiere_login
def comprar_vino(vino_id):
    dni = cliente_logueado()
    cantidad = int(request.form.get("cantidad", 1))

    try:
        supabase.rpc(
            "prc_registrar_venta_vino",
            {"p_cliente_dni": dni, "p_vino_id": vino_id, "p_cantidad": cantidad},
        ).execute()
        flash("¡Compra registrada! Se aplicó el descuento de tu categoría.", "success")
    except Exception as exc:  # noqa: BLE001
        flash(f"No se pudo completar la compra: {exc}", "danger")

    return redirect(url_for("beneficios"))


if __name__ == "__main__":
    app.run(debug=True)
