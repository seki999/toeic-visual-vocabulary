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
