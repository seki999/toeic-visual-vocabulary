import json
import tempfile
import unittest
from pathlib import Path

from append_vocabulary import append
from import_excel import ROOT, convert


class AppendTests(unittest.TestCase):
    def test_boundary_preservation_and_idempotent_reimport(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            convert(ROOT / "data-source/英语学习.xlsx", output)
            path = output / "list13.json"
            original = json.loads(path.read_text(encoding="utf-8"))
            original["items"][-1]["notes"] = "Keep this editorial change"
            original["items"][-1]["images"] = [{"src": "images/list13/keep.webp"}]
            path.write_text(json.dumps(original, ensure_ascii=False, indent=2), encoding="utf-8")
            untouched = {p.name: p.read_bytes() for p in output.glob("list*.json") if p.name != "list13.json"}
            new = append(ROOT / "data-source/英语单词20261018.xlsx", output)
            self.assertEqual(len(new), 70)
            self.assertEqual(new[0]["id"], "v000627")
            self.assertEqual(new[-1]["id"], "v000696")
            thirteen = json.loads(path.read_text(encoding="utf-8"))
            fourteen = json.loads((output / "list14.json").read_text(encoding="utf-8"))
            self.assertEqual(thirteen["items"][:26], original["items"])
            self.assertEqual(len(thirteen["items"]), 50)
            self.assertEqual(len(fourteen["items"]), 46)
            self.assertEqual([w["meaning"] for w in new if w["word"] == "autonomous"], ["自治的；自主的", "自动的；自主运行的"])
            for name, content in untouched.items():
                self.assertEqual((output / name).read_bytes(), content)
            before = {p.name: p.read_bytes() for p in output.glob("*.json")}
            self.assertEqual(append(ROOT / "data-source/英语单词20261018.xlsx", output), [])
            self.assertEqual({p.name: p.read_bytes() for p in output.glob("*.json")}, before)

    def test_tenth_group_fills_partial_list_and_spans_two_more_lists(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            convert(ROOT / "data-source/英语学习.xlsx", output)
            append(ROOT / "data-source/英语单词20261018.xlsx", output)
            path = output / "list14.json"
            fourteen = json.loads(path.read_text(encoding="utf-8"))
            fourteen["items"][-1]["notes"] = "Preserve the previous batch edits"
            fourteen["items"][-1]["images"] = [{"src": "images/list14/keep.webp"}]
            path.write_text(json.dumps(fourteen, ensure_ascii=False, indent=2), encoding="utf-8")
            before = {w["id"]: w for p in output.glob("list*.json") for w in json.loads(p.read_text(encoding="utf-8"))["items"]}
            added = append(ROOT / "data-source/英语单词_第十组_20261026.xlsx", output)
            self.assertEqual(len(added), 61)
            self.assertEqual([added[0]["id"], added[-1]["id"]], ["v000697", "v000757"])
            for lid, count in [("list14", 50), ("list15", 50), ("list16", 7)]:
                self.assertEqual(len(json.loads((output / f"{lid}.json").read_text(encoding="utf-8"))["items"]), count)
            current = {w["id"]: w for p in output.glob("list*.json") for w in json.loads(p.read_text(encoding="utf-8"))["items"]}
            for wid, word in before.items():
                self.assertEqual(current[wid], word)
            self.assertEqual(len({w["id"] for w in added if w["word"] == "buildup"}), 2)
            self.assertEqual(len({w["id"] for w in added if w["word"] == "binoculars"}), 1)
            unchanged = {p.name: p.read_bytes() for p in output.glob("*.json")}
            self.assertEqual(append(ROOT / "data-source/英语单词_第十组_20261026.xlsx", output), [])
            self.assertEqual({p.name: p.read_bytes() for p in output.glob("*.json")}, unchanged)

    def test_eleventh_group_preserves_previous_batches_and_distinct_pronunciations(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            convert(ROOT / "data-source/英语学习.xlsx", output)
            append(ROOT / "data-source/英语单词20261018.xlsx", output)
            append(ROOT / "data-source/英语单词_第十组_20261026.xlsx", output)
            path = output / "list16.json"
            data = json.loads(path.read_text(encoding="utf-8"))
            data["items"][-1]["notes"] = "Keep editorial changes"
            data["items"][-1]["images"] = [{"src": "images/list16/keep.webp"}]
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            before = {w["id"]: w for p in output.glob("list*.json") for w in json.loads(p.read_text(encoding="utf-8"))["items"]}
            source = ROOT / "data-source/英语单词_第十一组_20261103.xlsx"
            added = append(source, output)
            self.assertEqual(len(added), 73)
            self.assertEqual([added[0]["id"], added[-1]["id"]], ["v000758", "v000830"])
            self.assertEqual(len(json.loads(path.read_text(encoding="utf-8"))["items"]), 50)
            self.assertEqual(len(json.loads((output / "list17.json").read_text(encoding="utf-8"))["items"]), 30)
            self.assertEqual(len({w["ipa"]["uk"] for w in added if w["word"] == "desert"}), 2)
            self.assertEqual(len({w["ipa"]["uk"] for w in added if w["word"] == "diffuse"}), 2)
            historical = next(w for w in added if w["word"] == "cripple" and w["partOfSpeech"] == "n.")
            self.assertIn("冒犯", historical["meaning"])
            self.assertEqual(historical["collocation"]["en"], "—")
            after = {w["id"]: w for p in output.glob("list*.json") for w in json.loads(p.read_text(encoding="utf-8"))["items"]}
            for wid, word in before.items():
                self.assertEqual(after[wid], word)
            unchanged = {p.name: p.read_bytes() for p in output.glob("*.json")}
            self.assertEqual(append(source, output), [])
            self.assertEqual({p.name: p.read_bytes() for p in output.glob("*.json")}, unchanged)

    def test_twelfth_group_preserves_records_and_distinct_senses(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            convert(ROOT / "data-source/英语学习.xlsx", output)
            for source in ["英语单词20261018.xlsx", "英语单词_第十组_20261026.xlsx", "英语单词_第十一组_20261103.xlsx"]:
                append(ROOT / "data-source" / source, output)
            before = {w["id"]: w for p in output.glob("list*.json") for w in json.loads(p.read_text(encoding="utf-8"))["items"]}
            source = ROOT / "data-source/英语单词_第十二组_20261109.xlsx"
            added = append(source, output)
            self.assertEqual(len(added), 68)
            self.assertEqual([added[0]["id"], added[-1]["id"]], ["v000831", "v000898"])
            for lid, count in [("list17", 50), ("list18", 48)]:
                self.assertEqual(len(json.loads((output / f"{lid}.json").read_text(encoding="utf-8"))["items"]), count)
            self.assertEqual(len([w for w in added if w["word"] == "larceny"]), 1)
            seizures = [w for w in added if w["word"] == "seizure"]
            self.assertEqual(len(seizures), 2)
            self.assertNotEqual(seizures[0]["meaning"], seizures[1]["meaning"])
            self.assertEqual({w["partOfSpeech"] for w in added if w["word"] == "lease"}, {"n.", "v."})
            after = {w["id"]: w for p in output.glob("list*.json") for w in json.loads(p.read_text(encoding="utf-8"))["items"]}
            for wid, word in before.items():
                self.assertEqual(after[wid], word)
            unchanged = {p.name: p.read_bytes() for p in output.glob("*.json")}
            self.assertEqual(append(source, output), [])
            self.assertEqual({p.name: p.read_bytes() for p in output.glob("*.json")}, unchanged)

    def test_wrong_schema_does_not_write(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            convert(ROOT / "data-source/英语学习.xlsx", output)
            before = {p.name: p.read_bytes() for p in output.glob("*.json")}
            with self.assertRaises(ValueError):
                append(ROOT / "data-source/英语学习.xlsx", output, "3500词搞定托业考试_0829")
            self.assertEqual({p.name: p.read_bytes() for p in output.glob("*.json")}, before)


if __name__ == "__main__":
    unittest.main()
