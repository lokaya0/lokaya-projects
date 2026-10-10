import pathlib,json,hashlib,zipfile
root=pathlib.Path('elements/telegram-lower-thirds-v1');out=pathlib.Path('telegram-release');out.mkdir(exist_ok=True)
for item in json.loads((root/'packages.json').read_text()):
 data=b''.join((root/p).read_bytes() for p in item['parts'])
 assert len(data)==item['sizeBytes'],item['id']
 assert hashlib.sha256(data).hexdigest()==item['sha256'],item['id']
 p=out/(item['id']+'.zip');p.write_bytes(data)
 with zipfile.ZipFile(p) as z:assert z.testzip() is None
print('Verified all 6 complete Telegram packages')
