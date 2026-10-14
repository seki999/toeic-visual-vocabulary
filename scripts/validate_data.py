import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'public'
m=json.loads((root/'data/manifest.json').read_text(encoding='utf-8')); ids=set(); total=0
for i, entry in enumerate(m['lists']):
    data=json.loads((root/entry['file']).read_text(encoding='utf-8'))
    assert data['id']==entry['id'] and len(data['items'])==entry['count']
    assert 0<len(data['items'])<=50
    if i<len(m['lists'])-1: assert len(data['items'])==50
    for item in data['items']:
        assert item['id'] not in ids and item['word']; ids.add(item['id']); total+=1
        for image in item['images']:
            path=Path(image['src'].lstrip('/')); assert '..' not in path.parts and path.parts[0]=='images'; assert (root/path).is_file(), image['src']
assert total==m['total']; print(f'Validated {total} unique records')
