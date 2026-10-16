"""Validate story structure and record coverage, not literary or semantic correctness."""
import argparse,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FORMS={'gape':r'gap(?:e|es|ed|ing)','recuperate':r'recuperat(?:e|es|ed|ing)','insinuate':r'insinuat(?:e|es|ed|ing)','segregate':r'segregat(?:e|es|ed|ing)','vindicate':r'vindicat(?:e|es|ed|ing)','paparazzo':r'paparazz(?:o|i)','premiere':r'premier(?:e|es|ed|ing)','stampede':r'stamped(?:e|es|ed|ing)','plague':r'plagu(?:e|es|ed|ing)','tarnish':r'tarnish(?:es|ed|ing)?'}
def pattern(word):return FORMS.get(word,re.escape(word)+r'(?:s|ed|ing)?')
def validate(vocabulary,story,public=ROOT/'public'):
    errors=[];warnings=[];words={w['id']:w for w in vocabulary['items']};valid=set(words);used=set();invalid=set();missing_images=set();scene_ids=set();line_ids=set();roles=set();duplicates=[]
    text=lambda x:isinstance(x,str) and bool(x.strip())
    def image(src,where):
        if not src: warnings.append(f'{where}: image path not configured');return
        if not isinstance(src,str) or not re.fullmatch(r'images/[a-zA-Z0-9_./-]+\.webp',src) or '..' in Path(src).parts:errors.append(f'{where}: invalid image path');return
        if not (Path(public)/src).is_file():missing_images.add(src)
    def ids(values,where):
        if not isinstance(values,list) or any(not isinstance(x,str) for x in values):errors.append(f'{where}: targetWordIds must be a string array');return []
        invalid.update(set(values)-valid)
        if len(set(values))!=len(values):errors.append(f'{where}: duplicate target IDs')
        return values
    if story.get('schemaVersion')!=1 or story.get('listId')!=vocabulary['id'] or not all(text(story.get(k)) for k in ['id','title','titleZh']):errors.append('Invalid story header')
    targets=ids(story.get('targetWordIds'),'story')
    for c in story.get('characters',[]):
        if not text(c.get('id')) or c.get('id') in roles or not text(c.get('name')):errors.append('Invalid or duplicate character')
        roles.add(c.get('id'))
    if not roles:errors.append('No characters')
    if not story.get('scenes'):errors.append('No scenes')
    for scene in story.get('scenes',[]):
        sid=scene.get('id')
        if not text(sid) or sid in scene_ids:duplicates.append(sid);errors.append(f'Duplicate/invalid scene ID: {sid}')
        scene_ids.add(sid)
        if not text(scene.get('title')) or not text(scene.get('titleZh')):errors.append(f'{sid}: missing scene titles')
        image(scene.get('image'),str(sid))
        if not scene.get('lines'):errors.append(f'{sid}: no lines')
        for line in scene.get('lines',[]):
            lid=line.get('id')
            if not text(lid) or lid in line_ids:duplicates.append(lid);errors.append(f'Duplicate/invalid line ID: {lid}')
            line_ids.add(lid)
            if line.get('speakerId') not in roles:errors.append(f'{lid}: unknown speaker')
            if not text(line.get('en')) or not text(line.get('zh')):errors.append(f'{lid}: missing English/Chinese dialogue')
            declared=ids(line.get('targetWordIds'),str(lid));used.update(set(declared)&valid)
            if set(declared)-set(targets):errors.append(f'{lid}: targets outside story targetWordIds')
            for wid in declared:
                if wid in words and not re.search(r'\b'+pattern(words[wid]['word'])+r'\b',line.get('en',''),re.I):warnings.append(f"{lid}: {wid} ({words[wid]['word']}) declared but word/form not found")
            if line.get('image'):image(line['image'],str(lid))
    missing=valid-used
    if invalid:errors.append('Unknown vocabulary IDs')
    if set(targets)!=valid:errors.append('Story targets must include every record in its List')
    if missing:errors.append('Uncovered vocabulary records')
    warnings.append('Semantic review required: matching IDs and word forms cannot verify senses, plot coherence, translation accuracy, or image relevance.')
    return dict(listRecords=len(words),storyTargets=len(targets),usedIds=sorted(used),unusedIds=sorted(missing),coveragePercent=round(100*len(used)/len(words),2) if words else 0,invalidTargetIds=sorted(invalid),duplicateSceneOrLineIds=duplicates,missingImages=sorted(missing_images),errors=errors,warnings=warnings)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('list',nargs='?',default=str(ROOT/'public/data/list01.json'));p.add_argument('story',nargs='?',default=str(ROOT/'public/stories/list01.story.json'));p.add_argument('--strict-images',action='store_true');a=p.parse_args()
    report=validate(json.loads(Path(a.list).read_text(encoding='utf-8')),json.loads(Path(a.story).read_text(encoding='utf-8')))
    print(json.dumps(report,ensure_ascii=True,indent=2));raise SystemExit(1 if report['errors'] or (a.strict_images and report['missingImages']) else 0)
