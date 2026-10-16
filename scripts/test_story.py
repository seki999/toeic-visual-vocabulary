import unittest,json,copy
from validate_story import validate,ROOT
class StoryValidationTests(unittest.TestCase):
    def setUp(self):
        self.vocabulary=json.loads((ROOT/'public/data/list01.json').read_text(encoding='utf-8'));self.story=json.loads((ROOT/'public/stories/list01.story.json').read_text(encoding='utf-8'))
    def test_complete_real_story(self):
        result=validate(self.vocabulary,self.story);self.assertEqual(result['coveragePercent'],100);self.assertEqual(result['errors'],[]);self.assertEqual(len(result['warnings']),1)
    def test_missing_and_invalid_records(self):
        for s in self.story['scenes']:
            for l in s['lines']:l['targetWordIds']=[i for i in l['targetWordIds'] if i!='v000001']
        self.story['scenes'][0]['lines'][0]['targetWordIds'].append('not-valid')
        r=validate(self.vocabulary,self.story);self.assertIn('v000001',r['unusedIds']);self.assertIn('not-valid',r['invalidTargetIds']);self.assertTrue(r['errors'])
    def test_structure_and_false_annotation(self):
        line=copy.deepcopy(self.story['scenes'][0]['lines'][0]);line.update(speakerId='missing',zh='',en='A completely unrelated statement.')
        self.story['scenes'][0]['lines'].append(line)
        r=validate(self.vocabulary,self.story);self.assertTrue(r['duplicateSceneOrLineIds']);self.assertTrue(any('unknown speaker' in e for e in r['errors']));self.assertTrue(any('not found' in w for w in r['warnings']))
if __name__=='__main__':unittest.main()
