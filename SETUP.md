# Millas & Viñas — Guía de instalación

Este proyecto integra el módulo de **Turismo** (pasajes, hoteles, circuitos)
con la **Vinoteca** a través de un programa de fidelización por millas, tal
como lo diseñó el equipo en el documento original. La base de datos corre en
**Supabase (PostgreSQL)** y el front-end es una app **Flask**.

## 1. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá un proyecto nuevo
   (gratis). Elegí una contraseña de base de datos y guardala.
2. Cuando el proyecto termine de crearse, andá a **SQL Editor** (ícono de
   la izquierda).
3. Abrí el archivo `database/schema.sql` de este proyecto, copiá todo su
   contenido y pegalo en el SQL Editor. Ejecutalo (**Run**).
   - Esto crea las 20 tablas, las funciones/triggers de millas y descuento,
     habilita Row Level Security en todas las tablas, y carga datos de
     ejemplo (categorías, algunos pasajes, hoteles, circuitos, bodegas y
     vinos) para poder mostrar la app funcionando.
   - Si te aparece el cartel de **"Run without RLS" / "Run and enable
     RLS"**: elegí **"Run without RLS"**. El script ya deja RLS habilitado
     por su cuenta al final (ver más abajo por qué), así que no hace falta
     que lo haga el editor.
4. Andá a **Project Settings → API Keys**. Vas a necesitar dos valores:
   - **Project URL**: está en **Project Settings → Data API** (o en el botón
     "Connect" arriba del dashboard), algo como `https://xxxxx.supabase.co`
   - **service_role key (legacy)**: en la pestaña **"Legacy anon,
     service_role API keys"**, copiá la `service_role` (empieza con `eyJ...`).
     No uses la key nueva `sb_secret_...` — la librería `supabase-py` que usa
     este proyecto es anterior a ese formato y la rechaza con
     `SupabaseException: Invalid API key` apenas arranca la app.

## 2. Configurar el proyecto local (Windows / PowerShell)

Abrí la carpeta `turismo_vinoteca` en VS Code y en una terminal PowerShell:

```powershell
# Crear el entorno virtual (solo la primera vez)
python -m venv venv

# Activar el entorno virtual (repetir esto cada vez que abras una terminal nueva)
.\venv\Scripts\Activate.ps1
```

> Si PowerShell te tira un error de "no se puede cargar el archivo porque la
> ejecución de scripts está deshabilitada", corré esto una sola vez y volvé
> a intentar:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

Con el entorno activado (vas a ver `(venv)` al principio de la línea),
instalá las dependencias:

```powershell
pip install -r requirements.txt
```

## 3. Configurar las variables de entorno

Copiá `.env.example` como `.env` (mismo nombre, sin el `.example`) y
completá con tus datos reales de Supabase:

```
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu-service-role-key
FLASK_SECRET_KEY=cualquier-texto-random
```

## 4. Correr la app

```powershell
python app.py
```

Abrí el navegador en **http://127.0.0.1:5000**

## 5. Cuenta de demostración (ya cargada con años de uso)

El script carga un catálogo completo (8 ciudades, 9 pasajes, 6 circuitos,
10 vinos de 4 bodegas) y un cliente de prueba con historial simulado desde
2022, que llega a **categoría Platinum** a través de sus propias reservas
(no está "trucado" a mano: son 15 reservas reales que, vía los triggers de
millas, lo fueron subiendo de nivel — Bronze → Silver → Gold → Platinum) y
6 compras en la vinoteca a lo largo de esos años.

```
DNI:      28456789
Password: Vinoteca2026
```

Entrá con esa cuenta y andá a **Beneficios** para ver: la categoría
Platinum ya alcanzada, el 20% de descuento aplicado en todos los vinos, los
vinos exclusivos ya destrabados (incluidos los que requieren Platinum), y
las últimas compras en la tabla de abajo. En **Mis reservas** vas a ver el
historial completo de viajes de estos años.

Si preferís arrancar de cero para la demo en vivo, simplemente registrá una
cuenta nueva en `/registro` — esa sí empieza en Bronze con 0 millas.

## 6. Probar el flujo completo desde cero (para la defensa oral)

1. **Crear una cuenta** en `/registro` — arrancás en categoría Bronze.
2. **Explorar → reservar un pasaje** (por ejemplo, el de Buenos Aires-Madrid,
   que otorga 12.000 millas). Al confirmar, vas a ver el flash "sumaste
   millas" — eso ocurrió porque el trigger `trg_reserva_bi` copió las millas
   del pasaje a la reserva, y `trg_reserva_ai` las sumó al cliente y llamó a
   `prc_actualizar_categoria`.
3. Andá a **Beneficios** — tu categoría ya debería haber subido
   automáticamente (con 12.000 millas pasás a Silver), y vas a ver el
   descuento del 5% aplicado en los precios de la vinoteca.
4. Si reservás más pasajes hasta llegar a 15.000 millas (Gold), en
   Beneficios se van a destrabar los vinos marcados como exclusivos —
   antes aparecen bloqueados con la cinta "Requiere categoría Gold".
5. **Comprá un vino** — el total ya viene con el descuento de tu categoría
   aplicado (lo calcula `prc_registrar_venta_vino`), y la compra queda
   listada abajo en "Tus últimas compras".
6. Si intentás comprar (manualmente, vía API) un vino exclusivo sin tener
   la categoría necesaria, la base de datos lo rechaza — la validación
   vive en el trigger `trg_linea_venta_bi`, no en el código Python. Esto es
   clave para explicar en el coloquio: la integridad de la regla de negocio
   está garantizada a nivel de base de datos, no depende de que el
   front-end la respete.

## Qué se agregó respecto del documento original del equipo

El documento de tus compañeros define perfectamente el modelo de datos,
pero no incluye precios de pasajes/hoteles/circuitos ni autenticación de
usuarios (necesarios para una web real). Se agregaron, sobre la base ya
definida:

- `password_hash` en `cliente` (login web)
- `precio` en `pasaje`, `precio_noche` en `hotel`, `precio` en `circuito`
- `imagen_url` en `vino` (no usado por ahora — las fotos son de picsum.photos)
- Dos funciones nuevas para que Flask pueda invocar la lógica sin tocarla
  desde Python: `prc_registrar_reserva` (arma el INSERT en reserva) y los
  triggers/funciones ya definidas en el documento, portadas 1 a 1 de
  PL/SQL (Oracle) a plpgsql (Postgres).

Todo lo demás —tablas, relaciones, reglas de millas/categoría/catálogo
exclusivo— es exactamente el diseño que armó el equipo.

## Nota técnica: por qué todo está en minúscula

El documento original (como Oracle) usa nombres en MAYÚSCULA
(`CLIENTE`, `MILLAS_ACUMULADAS`, etc.). Postgres, en cambio, guarda
cualquier nombre sin comillas en minúscula automáticamente — escribas
`CREATE TABLE CLIENTE` o `create table cliente`, en la base termina
llamándose `cliente` igual. El problema aparece cuando algo *sí* le pone
comillas a esa mayúscula (por ejemplo, el propio SQL Editor de Supabase,
cuando arma el `ALTER TABLE "CLIENTE" ENABLE ROW LEVEL SECURITY` al
elegir "Run and enable RLS"): ahí `"CLIENTE"` con comillas es un nombre
distinto de `cliente` sin comillas, y Postgres tira
`relation "CLIENTE" does not exist`. Eso fue exactamente lo que pasó.

La solución más prolija (y la que se usa en este proyecto) es escribir
todo directo en minúscula desde el script, así no depende de que ninguna
herramienta decida ponerle comillas o no. Por eso `schema.sql`, `app.py`
y las plantillas usan `cliente`, `nombre`, `millas_acumuladas`, etc. en
vez de `CLIENTE`, `NOMBRE`, `MILLAS_ACUMULADAS`. Para la defensa oral,
esto también es un buen punto para mencionar: es una diferencia real
entre cómo maneja mayúsculas Oracle (donde los nombres sin comillas se
guardan en MAYÚSCULA) y Postgres (donde se guardan en minúscula) — algo
que suele salir cuando se porta un modelo de una base a la otra.

## Ideas para seguir puliendo (si da el tiempo)

- Panel de administrador para cargar/editar vinos, pasajes, hoteles.
- Selección de cantidad de pasajeros / participantes en una reserva
  (la tabla `PARTICIPANTE` / `RESERVA_PARTICIPANTE` ya está en el modelo).
- Página de detalle de cada vino/circuito/hotel.
- Barra de progreso animada y notificación cuando subís de categoría.
- Conectar los "beneficios de viaje" de Grapie (upgrades, sala VIP,
  regalos) a una tabla real con canje efectivo de millas, igual que ya
  existe para el catálogo exclusivo de vinos.

## Sobre Grapie (la burbuja de chat)

Es la colaboración de un compañero: un chatbot simple (sin IA, coincidencia
de palabras clave) que sugiere vinos y beneficios de viaje según la
categoría del cliente. Pasó por dos versiones — la primera era una página
aparte (`/concierge`, ya no existe); esta es una **burbuja flotante** que
aparece en cualquier página del sitio (se inyecta en `templates/base.html`,
visible solo si hay una sesión iniciada), con un flujo de conversación más
prolijo: indicador de "escribiendo...", confirmación Sí/No al final de
cada consulta, y cierre de conversación.

La versión original traía 4 clientes de prueba hardcodeados (con un
selector de chips) y su propio catálogo de vinos aparte. Para integrarla:

- Al abrir la burbuja, su JS (`static/js/grapie.js`) pide una sola vez
  `GET /api/grapie/perfil` — un endpoint nuevo en `app.py` que devuelve el
  **cliente realmente logueado** (vía sesión de Flask) y el **catálogo
  real de vinoteca**, no los datos de prueba. Por eso se sacó el selector
  de clientes.
- El catálogo de vinos que recomienda es el mismo de `/beneficios` —
  mismos precios, mismo descuento por categoría, mismos vinos exclusivos.
  Cada tarjeta de vino linkea directo a `/beneficios#vino-ID`.
- Los "beneficios de viaje" (upgrades, sala VIP, regalos) siguen siendo
  una lista ilustrativa dentro del JS, porque todavía no hay una tabla en
  la base para canjearlos de verdad — se filtran por categoría mínima
  igual que los vinos exclusivos, pero no hay backend real de canje.
- El endpoint `/api/grapie/perfil` arma a mano un diccionario mínimo del
  cliente (nombre, apellido, millas, categoría) en vez de mandar la fila
  completa — la fila real trae `password_hash`, que nunca debe llegar al
  navegador.
- Se adaptó la paleta de colores propia que traía (parecida pero no
  idéntica a la del resto del sitio) para que use las mismas variables
  de `static/css/style.css` — así se ve como parte del sitio en cualquier
  página donde aparezca, no como un widget de terceros pegado encima.
