# MiniPOS

Aplicación de escritorio para Windows para pequeños comercios. Este ZIP contiene el **esqueleto de la Fase 1**, no el POS comercial completo.

## Incluye

- Tauri 2 + Rust.
- React + TypeScript estricto + Vite.
- Interfaz inicial en español con navegación lateral.
- SQLite local administrado desde Rust mediante SQLx.
- Migración inicial versionada.
- Comandos nativos para guardar y consultar registros de prueba.
- Prueba básica de interfaz con Vitest y Testing Library.
- Módulos visuales preparados para ventas, inventario, caja, reportes y configuración.

Las pantallas que aún no se han desarrollado se identifican explícitamente; no muestran ventas falsas ni inventario ficticio.

## Requisitos en Windows

1. Node.js LTS y npm.
2. Rust estable con `rustup`.
3. Microsoft C++ Build Tools (carga de trabajo **Desarrollo para el escritorio con C++**).
4. WebView2 Runtime. Normalmente ya está instalado en Windows 10/11.

Consulta los prerrequisitos oficiales de Tauri 2 para validar el entorno antes de compilar.

## Instalación y ejecución

Abre PowerShell en la carpeta que contiene `package.json`:

```powershell
npm install
npm run tauri:dev
```

La primera compilación de Rust puede tardar varios minutos. Al iniciar la aplicación, abre **Resumen del negocio**, escribe un mensaje y pulsa **Guardar registro**. Debe aparecer en la lista después de guardarse.

Para comprobar el frontend en navegador (sin acceso a SQLite/Tauri):

```powershell
npm run dev
```

En el navegador se muestra una advertencia porque los comandos nativos solo funcionan dentro de la aplicación de escritorio.

## Pruebas y compilación

```powershell
npm test
npm run build
npm run tauri:build
```

El instalador generado por Tauri quedará dentro de `src-tauri/target/release/bundle/` si la compilación termina correctamente.

## Persistencia

La base de datos `minipos.sqlite3` se crea en el directorio local de datos de la aplicación que proporciona Tauri para Windows. No se guarda junto al ejecutable ni se borra automáticamente. SQLite activa claves foráneas y modo WAL; las migraciones se ejecutan al iniciar.

## Estructura principal

```text
src/
  app/
  components/layout/
  features/dashboard/
  features/shared/
  styles.css
src-tauri/
  src/commands/
  src/domain/                 # reservado para reglas de negocio
  src/application/             # reservado para casos de uso
  src/infrastructure/database/
  migrations/
```

## Alcance actual y siguientes pasos

Esta entrega prueba el armazón visual y una lectura/escritura local. Aún no incluye catálogo real, ventas, pagos, caja, reportes comerciales, copias de seguridad ni instalador validado.

Orden sugerido:
1. Validar requisitos locales e iniciar la aplicación.
2. Implementar productos y movimientos de inventario.
3. Implementar carrito y venta atómica (venta, detalle, pago y stock).
4. Implementar apertura/cierre de caja.
5. Construir reportes desde datos persistidos.
6. Agregar respaldo/restauración y pruebas de recuperación.

**Importante:** no se ha afirmado que la compilación haya sido ejecutada en tu computadora. La primera ejecución debe validar la compatibilidad real del entorno.
