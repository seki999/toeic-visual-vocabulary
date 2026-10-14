"""Import every nonempty vocabulary row. Preserve IDs and editorial assets on reimport."""
import argparse, json, hashlib
from pathlib import Path
from collections import defaultdict
import openpyxl
ROOT = Path(__file__).resolve().parents[1]
def signature(item):
    return hashlib.sha256(json.dumps([item['word'],item['partOfSpeech'],item['meaning'],item['collocation'],item['example']],ensure_ascii=False,sort_keys=True).encode()).hexdigest()
def convert(source, output):
    output=Path(output); output.mkdir(parents=True,exist_ok=True)
    old=defaultdict(list); maximum=0
    for path in sorted(output.glob('list*.json')):
        for item in json.loads(path.read_text(encoding='utf-8'))['items']:
            old[item.get('sourceKey',signature(item))].append(item)
            maximum=max(maximum,int(item['id'][1:]))
    workbook=openpyxl.load_workbook(source,read_only=True,data_only=True)
    sheet=workbook['3500词搞定托业考试_0829']; items=[]
    for row in sheet.iter_rows(min_row=2,values_only=True):
        vals=[str(v).strip() if v is not None else '' for v in row[1:10]]
        if not vals[0]: continue
        word,pos,uk,us,meaning,col,colzh,zh,en=vals
        item=dict(word=word,partOfSpeech=pos,ipa=dict(uk=uk,us=us),meaning=meaning,collocation=dict(en=col,zh=colzh),example=dict(en=en,zh=zh))
        key=signature(item)
        previous=old[key].pop(0) if old[key] else None
        if previous:
            # Preserve all browser-exported edits; sourceKey still tracks the original row.
            item=previous.copy()
        else:
            maximum+=1; item.update(id=f'v{maximum:06d}',images=[],tags=[],notes='')
        item['sourceKey']=key; items.append(item)
    workbook.close(); lists=[]
    for start in range(0,len(items),50):
        lid=f'list{start//50+1:02d}'; chunk=items[start:start+50]
        data=dict(id=lid,title=f'List {start//50+1:02d}',description='TOEIC Vocabulary',items=chunk)
        (output/f'{lid}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
        lists.append(dict(id=lid,title=data['title'],count=len(chunk),file=f'data/{lid}.json'))
    (output/'manifest.json').write_text(json.dumps(dict(total=len(items),lists=lists),ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Imported {len(items)} records into {len(lists)} lists'); return items
if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('source',nargs='?',default=str(ROOT/'data-source/英语学习.xlsx')); p.add_argument('--output',default=str(ROOT/'public/data')); a=p.parse_args(); convert(a.source,a.output)
