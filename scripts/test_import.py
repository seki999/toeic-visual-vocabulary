import tempfile,unittest,json
from pathlib import Path
from import_excel import convert,ROOT
class ImportTests(unittest.TestCase):
    def test_real_source_and_reimport(self):
        with tempfile.TemporaryDirectory() as temp:
            output=Path(temp); first=convert(ROOT/'data-source/英语学习.xlsx',output)
            self.assertEqual(len(first),626)
            abstain=[w for w in first if w['word']=='abstain'];self.assertGreater(len(abstain),1);self.assertNotEqual(abstain[0]['meaning'],abstain[1]['meaning'])
            files=sorted(output.glob('list*.json'));self.assertEqual(len(files),13)
            self.assertEqual(len(json.loads(files[0].read_text(encoding='utf-8'))['items']),50)
            p=files[0];data=json.loads(p.read_text(encoding='utf-8'));data['items'][0]['notes']='editorial';data['items'][0]['images']=[{'src':'images/list01/saved.webp'}];p.write_text(json.dumps(data),encoding='utf-8')
            second=convert(ROOT/'data-source/英语学习.xlsx',output)
            self.assertEqual([w['id'] for w in first],[w['id'] for w in second]);self.assertEqual(second[0]['notes'],'editorial');self.assertEqual(second[0]['images'][0]['src'],'images/list01/saved.webp')
if __name__=='__main__': unittest.main()
