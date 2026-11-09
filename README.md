# Asistencia Oficina 🏢🏠

App web móvil (PWA) muy liviana — sin servidor, sin librerías, ~30 KB — para llevar el registro de los días que vas a la oficina y controlar la regla **60/40** (60 % de los días hábiles del mes en oficina, 40 % en casa).

## Qué hace

- **📍 Marcado por ubicación:** al abrir la app compara el GPS del celular con las oficinas configuradas (por defecto *Enel Colombia Q93* y *Edificio Calle 82*). Si estás dentro del radio, marca el día como **oficina**.
- **🏠 Casa por defecto:** cualquier día hábil que ya pasó sin registro de oficina cuenta como **casa**.
- **🎉 Festivos de Colombia:** calculados automáticamente para cualquier año (Ley Emiliani + Semana Santa), sin internet.
- **🌴 Vacaciones:** agrega rangos de fechas; esos días no cuentan como hábiles.
- **📊 60/40:** días hábiles = lunes a viernes − festivos − vacaciones. Meta = 60 % (redondeo hacia arriba por defecto; configurable). Te dice cuántos días te faltan y si aún es posible cumplir.
- **📅 Calendario:** toca un día para corregirlo (auto → oficina → casa → vacaciones).
- **✉️ Correo:** envía el resumen del mes a tu correo (y copia opcional) con el app de correo del celular, o compártelo por WhatsApp/Teams.
- **💾 Datos privados:** todo queda guardado solo en tu celular. Exporta CSV o un respaldo JSON.
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

## Marcado automático al llegar

Una página web no puede leer el GPS en segundo plano, así que la app verifica la ubicación **cada vez que la abres**. Para que sea automático:

- **iPhone:** app *Atajos* → *Automatización* → *Al llegar* (elige la oficina) → acción *Abrir URL* con
  `https://mystic23.github.io/Asistencia-/?checkin=1`
- **Android:** crea una rutina de llegada a un lugar (Rutinas de Samsung, Tasker, etc.) que abra esa misma URL.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html` | Interfaz |
| `app.js` | Lógica: GPS, registros, 60/40, correo, respaldo |
| `holidays.js` | Festivos de Colombia |
| `styles.css` | Estilos (modo claro/oscuro) |
| `sw.js`, `manifest.webmanifest` | Instalable y offline |
