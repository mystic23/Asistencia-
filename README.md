# Asistencia Oficina 🏢🏠

App web móvil (PWA) muy liviana — sin servidor, sin librerías, ~30 KB — para llevar el registro de los días que vas a la oficina y controlar la regla **60/40** (60 % de los días hábiles del mes en oficina, 40 % en casa).

## Qué hace

- **📍 Marcado por ubicación:** al abrir la app compara el GPS del celular con las oficinas configuradas (por defecto *Enel Colombia Q93* y *Edificio Calle 82*). Si estás dentro del radio, marca el día como **oficina**.
- **🏠 Casa por defecto:** cualquier día hábil que ya pasó sin registro de oficina cuenta como **casa**.
- **🎉 Festivos de Colombia:** calculados automáticamente para cualquier año (Ley Emiliani + Semana Santa), sin internet.
- **🌴 Vacaciones:** agrega rangos de fechas; esos días no cuentan como hábiles.
- **📊 60/40:** días hábiles = lunes a viernes − festivos − vacaciones. Meta = 60 % (redondeo hacia arriba por defecto; configurable). Te dice cuántos días te faltan y si aún es posible cumplir.
- **📅 Calendario:** toca un día para corregirlo (auto → oficina → casa → vacaciones).
- **☁️ Gmail / Google:** historial guardado en tu Google Sheets, resúmenes y avisos a tu Gmail (ver abajo).
- **🤖 Marcado automático:** con la app cerrada, una geocerca del celular marca la oficina sola (ver abajo).
- **💾 Respaldo:** exporta CSV o un respaldo JSON.
- Funciona sin conexión e instalable en la pantalla de inicio.

## Publicarla en GitHub Pages

1. Une este código a la rama `main`.
2. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. El workflow `.github/workflows/pages.yml` la publica en
   `https://mystic23.github.io/Asistencia-/`

## Instalar en el celular

- **Android (Chrome):** abre el enlace → menú ⋮ → *Agregar a pantalla de inicio*.
- **iPhone (Safari):** abre el enlace → Compartir → *Agregar a inicio*.
- Acepta el permiso de ubicación cuando lo pida.

## Primer uso (importante)

Las coordenadas de las oficinas vienen **aproximadas**. El primer día que estés en cada edificio:
**Ajustes → Oficinas → 📍 Usar mi ubicación**. También puedes cambiar nombres, radio (metros) o agregar más sedes.

## Conectar con Gmail

Así el historial queda guardado en **tu cuenta de Google** (una hoja de Google Sheets), te llegan correos a tu Gmail y se puede marcar la oficina **sin abrir la app**. Se hace una sola vez (≈5 min, se puede desde el computador):

1. Entra a [sheets.new](https://sheets.new) con tu cuenta de Gmail y ponle nombre, p. ej. *Asistencia oficina*.
2. Menú **Extensiones → Apps Script**. Borra lo que haya y pega todo el contenido de [`apps-script/Code.gs`](apps-script/Code.gs). Guarda (💾).
3. Arriba, elige la función **`configurar`** y pulsa **Ejecutar**. Acepta los permisos (Google avisará “app no verificada”: *Configuración avanzada → Ir a … (no seguro)*; es tu propio script).
   En el **Registro de ejecución** aparece tu **TOKEN**: cópialo.
4. **Implementar → Nueva implementación** → tipo **Aplicación web** →
   *Ejecutar como:* **Yo** · *Quién tiene acceso:* **Cualquier usuario** → **Implementar**. Copia la **URL** (termina en `/exec`).
5. En la app: **Ajustes → Gmail / Google** → pega la URL y el TOKEN → **Conectar**. Debe decir *✅ Conectado a tu-correo@gmail.com*.

Desde ese momento:
- Cada registro (oficina, casa, vacaciones) se guarda en la hoja **Registros**.
- **✉️ A mi Gmail** envía el resumen del mes a tu correo.
- El día 1 de cada mes te llega automáticamente el resumen del mes anterior.
- Cada vez que se marque oficina automáticamente te llega un correo de confirmación (se puede apagar en `CORREO_AL_MARCAR` dentro del script).

> El TOKEN funciona como contraseña: no compartas la URL completa con nadie.

## Marcado automático (sin abrir la app)

Con la app **abierta**, se marca sola apenas el GPS detecta que estás en la oficina.
Con la app **cerrada**, ninguna página web puede leer el GPS, así que el celular le avisa directamente a tu script de Google al entrar a la zona de la oficina (requiere el paso anterior):

**Android — [MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid) (gratis):**
1. *Agregar macro* → **Disparador:** *Ubicación → Geocerca → Entrar* → marca el edificio en el mapa (radio 150–250 m).
2. **Acción:** *Conectividad → Solicitud HTTP* → método **GET** → pega el enlace de la oficina que aparece en la app (*Ajustes → Marcado automático → 📋 Copiar enlace*).
3. Guarda. Repite para el otro edificio.
4. En Android, quita la *optimización de batería* para MacroDroid y dale permiso de ubicación **“Permitir todo el tiempo”**.

**iPhone — Atajos:** *Automatización → Nueva → Al llegar* (elige la oficina) → *Ejecutar inmediatamente* → acción **Obtener contenido de URL** con el mismo enlace.

Cuando entres al edificio se marcará **oficina** en tu Google Sheets, te llegará un correo y la app lo mostrará la próxima vez que la abras.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html` | Interfaz |
| `app.js` | Lógica: GPS, registros, 60/40, correo, respaldo |
| `holidays.js` | Festivos de Colombia |
| `styles.css` | Estilos (modo claro/oscuro) |
| `sw.js`, `manifest.webmanifest` | Instalable y offline |
| `apps-script/Code.gs` | Script para tu cuenta de Google: historial en Sheets, correos por Gmail y marcado automático |
