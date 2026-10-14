"""Safely apply a browser ZIP export to the local checkout."""
import argparse,json,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def target(name):
    p=(ROOT/name).resolve()
    if not (p.is_relative_to(ROOT/'public/data') and p.suffix=='.json') and not (p.is_relative_to(ROOT/'public/images') and p.suffix.lower() in ['.jpg','.jpeg','.png','.webp']):
        raise ValueError(f'Forbidden path: {name}')
    return p
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('zip');args=parser.parse_args()
    with zipfile.ZipFile(args.zip) as archive:
        names=[n for n in archive.namelist() if not n.endswith('/') and n!='deleted-files.json']
        plan=[(target(n),archive.read(n)) for n in names]
        deletes=[target(n) for n in json.loads(archive.read('deleted-files.json'))] if 'deleted-files.json' in archive.namelist() else []
        for p,data in plan:
            if p.suffix=='.json':json.loads(data)
        for p,data in plan:p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
        for p in deletes:p.unlink(missing_ok=True)
    print(f'Applied {len(plan)} files, removed {len(deletes)} files')
