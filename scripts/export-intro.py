#!/usr/bin/env python3
"""
Save the opening-scene pictures as files (public/intro/<avatar>-<move>.png), so the TV shows them at once
instead of drawing 3D frames while the app starts.

  1. npm run build
  2. python scripts/export-intro.py          (serves dist/ on :8080 and accepts uploads on :8081)
  3. In a desktop browser with WebGL open  http://localhost:8080/index.html
     and run in the console:
       for (const [a,m] of [['dino','wave'],['cat','jump'],['dog','turn'],['bear','handsup']])
         await fetch('http://localhost:8081/'+a+'-'+m+'.png',{method:'POST',body:window.__exportIntro(a,m)});
  4. Ctrl+C, then npm run build (the PNGs are copied from public/).
Re-run whenever the 3D buddies or their moves change.
"""
import base64, http.server, socketserver, threading, os, functools
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'intro'
OUT.mkdir(parents=True, exist_ok=True)


class Upload(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_POST(self):
        name = os.path.basename(self.path.strip('/'))
        body = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode()
        if not name.endswith('.png') or not body.startswith('data:image/png;base64,'):
            self.send_response(400); self._cors(); self.end_headers(); return
        (OUT / name).write_bytes(base64.b64decode(body.split(',', 1)[1]))
        print('saved', OUT / name)
        self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b'ok')

    def log_message(self, *a): pass


if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / 'dist'))
    threading.Thread(target=socketserver.TCPServer(('', 8080), handler).serve_forever, daemon=True).start()
    print('serving dist on :8080, uploads on :8081 (Ctrl+C to stop)')
    socketserver.TCPServer(('', 8081), Upload).serve_forever()
