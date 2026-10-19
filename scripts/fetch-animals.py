#!/usr/bin/env python3
"""Finds Public-domain / CC0 animal recordings on Wikimedia Commons and prints candidates.
Only files whose Commons licence is Public domain or CC0 are listed."""
import json, sys, urllib.parse, urllib.request
UA = {'User-Agent': 'ZoraPlayKidsApp/1.0 (asset licence check; +https://github.com/Vishnu2663/zora_play)'}
API = 'https://commons.wikimedia.org/w/api.php'
def call(**p):
    p['format'] = 'json'
    req = urllib.request.Request(API + '?' + urllib.parse.urlencode(p), headers=UA)
    return json.load(urllib.request.urlopen(req, timeout=30))
OK = ('public domain', 'cc0', 'cc-zero', 'pd', 'pd-')
def search(q, n=25):
    r = call(action='query', generator='search', gsrnamespace=6, gsrsearch=q + ' filetype:audio', gsrlimit=n,
             prop='imageinfo', iiprop='url|extmetadata|size|mime', iiextmetadatafilter='LicenseShortName|Artist|DateTimeOriginal|ImageDescription')
    out = []
    for pg in (r.get('query', {}).get('pages', {}) or {}).values():
        ii = (pg.get('imageinfo') or [{}])[0]
        md = ii.get('extmetadata', {})
        lic = md.get('LicenseShortName', {}).get('value', '')
        if lic.lower().startswith(OK):
            out.append((pg['title'], lic, ii.get('url'), ii.get('size'), md.get('Artist', {}).get('value', '')[:60]))
    return out
if __name__ == '__main__':
    for q in sys.argv[1:]:
        print('##', q)
        for row in search(q): print('  ', row)
