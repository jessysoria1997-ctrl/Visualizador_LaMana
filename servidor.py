#!/usr/bin/env python3
"""
Servidor local para el dashboard electoral.

Hace lo mismo que `python -m http.server`, pero:

  · Silencia los ConnectionResetError / WinError 10054 que aparecen cuando el
    navegador cancela una descarga a medias (recargar la página mientras se
    baja un GeoJSON, por ejemplo). Son inofensivos, pero llenan la consola de
    trazas y hacen creer que algo se rompió.
  · No deja nada en caché, así que al editar data.js, los colores o los
    GeoJSON basta con recargar el navegador.
  · Solo registra los errores 4xx y 5xx, no cada archivo servido.
  · Abre el navegador solo.

Uso:
    python servidor.py            → http://localhost:8000
    python servidor.py 8080       → otro puerto, si el 8000 está ocupado

Para detenerlo: Ctrl + C
"""

import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

# Cortes de conexión del navegador: esperables, no son errores del servidor.
DESCONEXIONES = (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)


class Handler(SimpleHTTPRequestHandler):

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.geojson': 'application/geo+json',
        '.js': 'text/javascript',
        '.json': 'application/json',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except DESCONEXIONES:
            self.close_connection = True

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except DESCONEXIONES:
            pass

    def log_request(self, code='-', size='-'):
        # Solo interesa lo que falla; el listado de cada archivo servido sobra.
        if str(code).startswith(('4', '5')):
            super().log_request(code, size)


if __name__ == '__main__':
    url = f'http://localhost:{PUERTO}'
    try:
        servidor = ThreadingHTTPServer(('127.0.0.1', PUERTO), Handler)
    except OSError:
        print(f'\n  El puerto {PUERTO} ya está en uso.')
        print(f'  Prueba con otro:  python servidor.py {PUERTO + 1}\n')
        sys.exit(1)

    print(f'\n  Dashboard disponible en  {url}')
    print('  Aquí abajo solo aparecerán los errores reales.')
    print('  Para detener el servidor: Ctrl + C\n')

    # En un hilo aparte: en algunos equipos abrir el navegador se queda
    # colgado, y eso no debe impedir que el servidor empiece a atender.
    def abrir():
        try:
            webbrowser.open(url)
        except Exception:
            pass
    threading.Thread(target=abrir, daemon=True).start()

    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print('\n  Servidor detenido.\n')
