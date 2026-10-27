"""Check a packaged release before it can be published."""
from pathlib import Path
from html.parser import HTMLParser
import argparse,json,hashlib,re
parser=argparse.ArgumentParser();parser.add_argument('directory');args=parser.parse_args();root=Path(args.directory).resolve()
release=json.loads((root/'release.json').read_text());assert release['app']=='myskme-boardroom' and release['channel']=='stable'
for name,expected in release['files'].items():
 p=root/name;assert p.is_relative_to(root) and p.is_file(),name
 data=p.read_bytes();assert len(data)==expected['bytes'] and hashlib.sha256(data).hexdigest()==expected['sha256'],name
 assert len(data)<25*1024*1024,name+' exceeds the static file size limit'
class Links(HTMLParser):
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  for k in ['src','href']:
   value=attrs.get(k,'')
   if not value or value.startswith(('https:','http:','data:','#')):continue
   assert not value.startswith('/'),'Root URL would break a subdirectory release: '+value
   path=root/value.split('#')[0].split('?')[0];assert path.exists(),value
Links().feed((root/'index.html').read_text())
for file in root.glob('*.js'):
 s=file.read_text()
 for path in re.findall(r'''["'](/(?:assets/|vendor/|[A-Za-z][\w.-]*\.(?:js|css|svg|webp|png))[^"']*)''',s):raise AssertionError('Root asset URL in '+file.name+': '+path)
 for path in re.findall(r'''(?:from\s*|import\s*\(|new URL\s*\()["'](\./[^"']+\.js)["']''',s):assert (file.parent/path).is_file(),file.name+': '+path
assert 'room-drawer' in (root/'index.html').read_text() and 'backup.js' in release['files']
print('PASS stable release '+release['version']+': '+str(len(release['files']))+' verified files; complete local links, portable module/worker paths, model hashes and static file limits')
