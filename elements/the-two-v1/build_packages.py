import json,pathlib,zipfile,hashlib
root=pathlib.Path('elements/the-two-v1');out=pathlib.Path('the-two-release');out.mkdir(exist_ok=True)
def write(z,name,data):
 info=zipfile.ZipInfo(name,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o600<<16;z.writestr(info,data,compresslevel=9)
for item in json.loads((root/'packages.json').read_text()):
 dest=out/(item['id']+'.zip')
 with zipfile.ZipFile(root/item['project']) as source: aep=source.read('element.aep')
 with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  write(z,'element.aep',aep)
  for ref in item['media']:write(z,ref['target'],(root/ref['source']).read_bytes())
 data=dest.read_bytes();assert len(data)==item['sizeBytes'];assert hashlib.sha256(data).hexdigest()==item['sha256'],item['id']
print('All 92 package hashes verified')
