"""Append a nine-column vocabulary workbook without repartitioning old records."""
import argparse
import json
from pathlib import Path

import openpyxl

from import_excel import ROOT, signature

HEADERS = ["单词", "词性", "英式 IPA", "美式 IPA", "汉语意思", "惯用法 / 固定搭配", "搭配的汉语意思", "汉语例句", "英语翻译"]


def append(source, output=ROOT / "public/data", sheet_name="Vocabulary"):
    output = Path(output)
    manifest_path = output / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    lists = {
        entry["id"]: json.loads((output / f'{entry["id"]}.json').read_text(encoding="utf-8"))
        for entry in manifest["lists"]
    }
    existing = [item for data in lists.values() for item in data["items"]]
    known = {item.get("sourceKey", signature(item)) for item in existing}
    maximum = max((int(item["id"][1:]) for item in existing), default=0)
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
    pending = []
    try:
        rows = iter(workbook[sheet_name].values)
        if list(next(rows, ())) != HEADERS:
            raise ValueError("Workbook headers do not match the expected nine-column vocabulary schema")
        for number, row in enumerate(rows, 2):
            values = [str(value).strip() if value is not None else "" for value in row]
            if not any(values):
                continue
            if len(values) != 9 or not all(values):
                raise ValueError(f"Row {number}: all nine vocabulary fields are required")
            word, pos, uk, us, meaning, col, colzh, zh, en = values
            item = dict(word=word, partOfSpeech=pos, ipa=dict(uk=uk, us=us), meaning=meaning,
                        collocation=dict(en=col, zh=colzh), example=dict(en=en, zh=zh))
            key = signature(item)
            if key in known:
                continue
            maximum += 1
            item.update(id=f"v{maximum:06d}", images=[], tags=[], notes="", sourceKey=key)
            pending.append(item)
            known.add(key)
    finally:
        workbook.close()
    changed = set()
    for item in pending:
        entry = manifest["lists"][-1] if manifest["lists"] else None
        if entry is None or entry["count"] == 50:
            n = int(entry["id"][4:]) + 1 if entry else 1
            lid = f"list{n:02d}"
            entry = dict(id=lid, title=f"List {n:02d}", count=0, file=f"data/{lid}.json")
            manifest["lists"].append(entry)
            lists[lid] = dict(id=lid, title=entry["title"], description="TOEIC Vocabulary", items=[])
        lists[entry["id"]]["items"].append(item)
        entry["count"] += 1
        changed.add(entry["id"])
    if pending:
        manifest["total"] = sum(entry["count"] for entry in manifest["lists"])
        for lid in sorted(changed):
            (output / f"{lid}.json").write_text(json.dumps(lists[lid], ensure_ascii=False, indent=2), encoding="utf-8")
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Appended {len(pending)} records; total {manifest['total']}; updated {', '.join(sorted(changed)) or 'none'}")
    return pending


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "public/data")
    parser.add_argument("--sheet", default="Vocabulary")
    args = parser.parse_args()
    append(args.source, args.output, args.sheet)
