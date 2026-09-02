# Desplegar en Render (para que el equipo pueda testear online)

Render despliega desde un repositorio de GitHub, así que primero hay que
subir el proyecto ahí. Después Render lo conecta y lo pone online con una
URL pública tipo `https://millas-y-vinas.onrender.com`.

## 1. Subir el proyecto a GitHub

Si nunca usaste git en esta carpeta, en PowerShell (parado en la carpeta
`turismo_vinoteca`):

```powershell
git init
git add .
git commit -m "Millas y Viñas - version inicial"
```

> Si `git` no se reconoce como comando, instalalo desde
> [git-scm.com](https://git-scm.com/download/win) y abrí una terminal nueva.

Después, en [github.com](https://github.com), creá un repositorio nuevo
(el botón verde "New"). Le podés poner `millas-y-vinas`, dejarlo **privado**
o público (no importa: el `.gitignore` ya excluye el `.env`, así que ningún
secreto se sube al repo). No marques "Add a README" para evitar conflictos.

GitHub te va a mostrar comandos para conectar tu carpeta local — son estos
(reemplazá `TU-USUARIO` por tu usuario de GitHub):

```powershell
git remote add origin https://github.com/TU-USUARIO/millas-y-vinas.git
git branch -M main
git push -u origin main
```

Te va a pedir loguearte a GitHub la primera vez (se abre el navegador).

## 2. Crear el servicio en Render

1. Entrá a [render.com](https://render.com) y creá una cuenta (podés entrar
   directo con GitHub).
2. **New** → **Blueprint**.
3. Conectá tu cuenta de GitHub si te lo pide, y seleccioná el repositorio
   `millas-y-vinas`.
4. Render detecta el archivo `render.yaml` de este proyecto automáticamente
   y te muestra el servicio ya configurado (build command, start command,
   plan free). Te va a pedir que completes dos variables antes de crear:
   - **SUPABASE_URL**: la de tu proyecto de Supabase
   - **SUPABASE_KEY**: la `service_role` key **legacy** (la misma que usás
     en tu `.env` local — la de `Legacy anon, service_role API keys`,
     no la `sb_secret_...` nueva)
5. Click en **Apply** / **Create**. Render clona el repo, instala
   `requirements.txt` y arranca la app con `gunicorn`. La primera build
   tarda unos minutos.

Cuando termine, vas a tener una URL pública (algo como
`https://millas-y-vinas.onrender.com`) — esa es la que le pasás a tus
compañeros.

## 3. Cosas para tener en cuenta

- **Plan free se "duerme"**: si nadie entra durante 15 minutos, el servicio
  se apaga solo. La primera visita después de eso tarda entre 30 y 60
  segundos en responder mientras se reactiva — no está roto, solo está
  despertando. Las visitas siguientes son rápidas.
- **Cada `git push` vuelve a desplegar solo**: si corregís algo del código
  y lo subís (`git add .` / `git commit -m "..."` / `git push`), Render
  detecta el cambio y redespliega automáticamente en un par de minutos.
- **La base de datos sigue siendo la misma de Supabase**: no hay que migrar
  ni volver a cargar nada; Render solo hostea la app Flask, que se conecta
  al mismo proyecto de Supabase que ya tenés.
- **Todos comparten los mismos datos**: si un compañero reserva un pasaje o
  compra un vino durante el testeo, esa reserva queda en la base para
  todos (es la misma base compartida). Para la defensa final puede convenir
  re-correr `schema.sql` una vez más y dejar todo prolijo antes de
  presentar.
