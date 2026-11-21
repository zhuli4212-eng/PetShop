"""Verify startup refresh against a warm, deliberately stale HTTP cache."""
from base64 import b64decode
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import argparse
import json

from playwright.sync_api import sync_playwright


PNG = b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6xoAAAAASUVORK5CYII=')
MODULE = Path(__file__).with_name('resource-preload.js').read_bytes()
MANIFEST = '/src/game-resources.test.json'
PART = '/src/game-resources.test.bin'
PAGE = b'''<!doctype html><img class="shopfront" data-petshop-src="/shop.png">
<template id="login-opening"><img data-petshop-src="/shop.png"></template>
<audio id="login-music" preload="none" data-petshop-src="/song.mp3"></audio>
<script type="module">
import { preloadGameResources } from '/resource-preload.js';
window.preload = refresh => preloadGameResources('/src/game-resources.test.json', {
  beginResources() {}, transferred() {}, prepareGame() {},
}, refresh);
window.asset = () => petshopAssetUrl('/data.txt');
window.readAsset = () => fetch(asset()).then(response => response.text());
</script>'''


class Site(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    payload = b'old!'
    resource_requests = []

    def do_GET(self):
        content_type = 'application/octet-stream'
        if self.path == MANIFEST:
            content_type = 'application/json'
            parts = [{'path': PART, 'bytes': len(PNG) + 5,
                      'files': [['/shop.png', len(PNG), 'image/png'], ['/song.mp3', 1, 'audio/mpeg'],
                                ['/data.txt', 4, 'text/plain']]}]
            data = json.dumps({'parts': parts}).encode()
        elif self.path == PART:
            data = PNG + b'\0' + self.payload
        elif self.path == '/resource-preload.js':
            content_type = 'text/javascript'
            data = MODULE
        elif self.path == '/':
            content_type = 'text/html'
            data = PAGE
        else:
            self.send_error(404)
            return
        if self.path in (MANIFEST, PART):
            self.resource_requests.append(self.path)
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'public, max-age=3600' if self.path in (MANIFEST, PART) else 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass

    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, BrokenPipeError):
            pass


def check(browser, origin, *, require_warm_hit):
    page = browser.new_page()
    page.goto(origin, wait_until='domcontentloaded')
    page.wait_for_function('Boolean(window.preload)')
    page.evaluate('''() => {
        localStorage.setItem('petshop.trial.lastUsername','test-shop');
        localStorage.setItem('petshop.command.test','untouched');
        window.requestModes = [];
        const fetchResource = window.fetch.bind(window);
        window.fetch = (url, options) => {
            if (String(url).includes('/src/game-resources.')) requestModes.push(options.cache);
            return fetchResource(url, options);
        };
    }''')
    page.evaluate('() => preload(false)')
    assert Site.resource_requests == [MANIFEST, PART]
    assert page.evaluate('readAsset()') == 'old!'
    previous_url = page.evaluate('asset()')

    Site.payload = b'new!'
    page.evaluate('() => preload(false)')
    if require_warm_hit:
        assert Site.resource_requests == [MANIFEST, PART], Site.resource_requests
        assert page.evaluate('readAsset()') == 'old!', 'Fixture needs a real stale cache hit'
    requests_before_refresh = len(Site.resource_requests)
    assert page.evaluate('url => fetch(url).then(() => false, () => true)', previous_url), 'Stale Blob URL is still live'
    stale_url = page.evaluate('asset()')

    page.evaluate('() => preload(true)')
    assert Site.resource_requests[requests_before_refresh:] == [MANIFEST, PART]
    assert page.evaluate('readAsset()') == 'new!'
    assert page.evaluate('requestModes') == ['reload'] * 2 + ['force-cache'] * 2 + ['reload'] * 2
    assert page.evaluate('url => fetch(url).then(() => false, () => true)', stale_url)
    assert page.evaluate('''() => [localStorage.getItem('petshop.trial.lastUsername'),
        localStorage.getItem('petshop.command.test')]''') == ['test-shop', 'untouched']
    page.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--webkit', action='store_true')
    args = parser.parse_args()
    with ThreadingHTTPServer(('127.0.0.1', 0), Site) as server, sync_playwright() as playwright:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            browser = playwright.webkit.launch() if args.webkit else playwright.chromium.launch(channel='msedge')
            check(browser, f'http://127.0.0.1:{server.server_port}', require_warm_hit=not args.webkit)
            browser.close()
        finally:
            server.shutdown()
    print('Warm cache policy preserved, forced refresh fetched new bytes, old Blob URLs revoked, account keys preserved.')
