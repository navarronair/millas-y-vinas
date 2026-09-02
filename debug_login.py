"""
Script de diagnóstico: prueba por separado (1) si la app puede leer el
cliente demo desde Supabase, y (2) si el hash guardado valida la
contraseña "Vinoteca2026". Corré esto con el venv activo:

    python debug_login.py

Después de usarlo, podés borrar este archivo — no forma parte de la app.
"""
import os
import base64
import json
from dotenv import load_dotenv

load_dotenv()

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_KEY"]

print("SUPABASE_URL configurada:", url)
print("SUPABASE_KEY empieza con:", key[:20], "...")

# Los JWT tienen 3 partes separadas por '.'; la del medio (payload) es
# base64 y se puede leer sin la clave secreta, solo para ver el "role".
try:
    payload_b64 = key.split(".")[1]
    payload_b64 += "=" * (-len(payload_b64) % 4)  # padding
    payload = json.loads(base64.urlsafe_b64decode(payload_b64))
    print("Rol codificado en la key:", payload.get("role"))
    if payload.get("role") != "service_role":
        print("\n⚠️  Esta NO es la service_role key (es '%s')." % payload.get("role"))
        print("   Volvé a Project Settings -> API Keys -> pestaña Legacy,")
        print("   y copiá la de ABAJO (service_role), no la de arriba (anon).")
except Exception as e:
    print("No se pudo decodificar como JWT:", e)

print()

from supabase import create_client
from werkzeug.security import check_password_hash

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

dni = "28456789"
password_a_probar = "Vinoteca2026"

print(f"Buscando cliente con DNI = {dni!r} ...")
res = supabase.table("cliente").select("*").eq("dni", dni).execute()
print("Filas encontradas:", len(res.data))

if not res.data:
    print("\n❌ La consulta no devolvió ninguna fila.")
    print("   Esto significa que el problema está en la conexión/consulta,")
    print("   no en la contraseña. Puede ser SUPABASE_URL, SUPABASE_KEY,")
    print("   o que este proyecto de Supabase no es el mismo donde corriste el SQL.")
else:
    cliente = res.data[0]
    stored_hash = cliente["password_hash"]
    print("Nombre en la fila encontrada:", cliente.get("nombre"))
    print(f"Hash recibido via API (longitud={len(stored_hash)}):")
    print(stored_hash)

    ok = check_password_hash(stored_hash, password_a_probar)
    print(f"\n¿'{password_a_probar}' coincide con ese hash? -> {ok}")

    if not ok:
        print("\n❌ El hash llegó via API pero NO valida la contraseña.")
        print("   Puede ser que el hash se haya alterado al pegar en el SQL")
        print("   Editor (algún carácter cambiado, aunque la longitud dé bien),")
        print("   o que la contraseña real cargada sea otra.")
    else:
        print("\n✅ Todo bien acá. Si el login web sigue fallando, el problema")
        print("   está en lo que se está tipeando en el formulario (mayúsculas,")
        print("   DNI con puntos, espacios, etc.) o en un proceso viejo de la")
        print("   app corriendo con datos en caché.")
