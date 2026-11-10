import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import zipfile

def run(*command, **options):
    return subprocess.run(command, check=True, **options)

def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def public_id(key):
    return key if len(key) <= 64 else key[:47]+'-'+hashlib.sha256(key.encode()).hexdigest()[:16]

stage=Path(os.environ['RUNNER_TEMP'])/'montage-stage.zip'
with zipfile.ZipFile(stage) as archive:
    assert archive.testzip() is None
    source=json.loads(archive.read('project-objects.json'))
    original_ids={public_id(k):k for k in source}
    assert len(source)==len(original_ids)==487
    build=Path(os.environ['RUNNER_TEMP'])/'montage-content'
    build.mkdir()
    for kind in ('items','previews','posters','catalogs'):
        (build/kind).mkdir()
    for name in archive.namelist():
        parts=PurePosixPath(name).parts
        if len(parts)==2 and parts[0] in ('previews','posters'):
            assert re.fullmatch(r'[a-z0-9_-]+\.(mp4|jpg)',parts[1])
            with archive.open(name) as src,(build/name).open('wb') as dst:
                shutil.copyfileobj(src,dst)
    for kind,count in (('montage-transitions',66),('montage-effects',421)):
        key=f'catalogs/{kind}.json'
        data=json.loads(archive.read(key))
        assert data['version']==1 and len(data['items'])==count
        for item in data['items']:
            ident=item['id']
            assert re.fullmatch(r'[a-z0-9_-]{1,64}',ident)
            expected=f'items/{ident}.zip'
            assert item['downloadUrl'].endswith('/'+expected)
            dest=build/expected
            members=source[original_ids[ident]]
            assert item['entry'] in members
            with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=4) as z:
                for member,digest in members.items():
                    p=PurePosixPath(member)
                    assert not p.is_absolute() and '..' not in p.parts and '\\' not in member
                    assert re.fullmatch(r'[a-f0-9]{64}',digest)
                    contents=archive.read('objects/'+digest)
                    assert hashlib.sha256(contents).hexdigest()==digest
                    z.writestr(member,contents)
            item.update(sha256=sha(dest),sizeBytes=dest.stat().st_size)
            assert item['sizeBytes']<100_000_000
            for k,folder in [('preview','previews'),('poster','posters')]:
                assert (build/folder/item[k].rsplit('/',1)[1]).is_file()
        (build/key).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
print('Verified 487 individual downloads, 487 posters, 487 previews.',flush=True)
run('git','config','user.name','github-actions[bot]')
run('git','config','user.email','41898282+github-actions[bot]@users.noreply.github.com')
run('git','config','http.postBuffer','524288000')
run('git','switch','--orphan','montage-content-build')
ref='refs/heads/codex/montage-content-stage-v1'
assets=[p for kind in ('items','posters','previews') for p in sorted((build/kind).iterdir())]
batch=[]; size=0
def push_batch():
    if not batch:return
    rel=[p.relative_to(build).as_posix() for p in batch]
    for p,name in zip(batch,rel):
        dest=Path(name)
        dest.parent.mkdir(exist_ok=True)
        shutil.copyfile(p,dest)
    run('git','add','--',*rel)
    run('git','commit','-m','Stage verified Montage assets')
    run('git','push','origin','HEAD:'+ref)
for p in assets:
    n=p.stat().st_size
    if size+n>400_000_000 and batch:
        push_batch();batch=[];size=0
    batch.append(p);size+=n
push_batch()
shutil.copytree(build/'catalogs','catalogs')
run('git','add','catalogs')
run('git','commit','-m','Publish separately downloadable Montage transitions and effects')
run('git','push','origin','HEAD:refs/heads/montage-content-v1')
