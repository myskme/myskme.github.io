"""Export a standalone stable static release. No credentials or player data are read."""
from pathlib import Path
import argparse,hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
source=(ROOT/'dist' if (ROOT/'dist').is_dir() else ROOT.parent/'boardroom').resolve();target=Path(args.output).resolve()
if target in [Path('/'),ROOT,source] or target.is_relative_to(source):raise SystemExit('Choose an output directory outside the source dist directory')
if target.exists() and any(target.iterdir()):raise SystemExit('Output directory must be new or empty; existing files are preserved')
manifest=json.loads((source/'vendor/katago/build.json').read_text())
for name,expected in manifest['files'].items():
 data=(source/'vendor/katago'/name).read_bytes()
 assert len(data)==expected['bytes'] and hashlib.sha256(data).hexdigest()==expected['sha256'], 'KataGo resource differs: '+name
assert hashlib.sha256((source/'vendor/katago/source.patch').read_bytes()).hexdigest()==manifest['patchSha256']
shutil.copytree(source,target,dirs_exist_ok=True,ignore=shutil.ignore_patterns('release.json'))
(target/'.nojekyll').write_text('')
version=json.loads((ROOT/'package.json').read_text())['version']
files={}
for file in sorted(target.rglob('*')):
 if not file.is_file():continue
 data=file.read_bytes();files[file.relative_to(target).as_posix()]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
release={'app':'myskme-boardroom','version':version,'channel':'stable','files':files}
(target/'release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'output':str(target),'version':version,'files':len(files)+1,'bytes':sum(f['bytes'] for f in files.values())},ensure_ascii=False))
