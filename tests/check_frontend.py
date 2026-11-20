"""Verifiche locali senza dipendenze Python extra; richiede Node.js."""
from pathlib import Path
from html.parser import HTMLParser
from collections import Counter
import re,subprocess,tempfile
root=Path(__file__).resolve().parents[1]
s=(root/'index.html').read_text()
js=(root/'assets/js/app.js').read_text()
assert js==''.join(p.read_text() for p in sorted((root/'src/js').glob('*.js')))
assert 'K9QRCode' not in js and 'qr-vendor.js' not in s
assert 'qr-vendor.js' not in (root/'service-worker.js').read_text()
assert 'qbDifficulty' in s and 'value="difficile"' in s
subprocess.run(['node','--check',str(root/'assets/js/app.js')],check=True)
class Parser(HTMLParser):
    def __init__(self): super().__init__(); self.ids=[]
    def handle_starttag(self,tag,attrs): self.ids.extend(v for k,v in attrs if k=='id')
p=Parser(); p.feed(s); assert not [x for x,n in Counter(p.ids).items() if n>1]
with tempfile.TemporaryDirectory() as td:
    for i,inline_js in enumerate(re.findall(r'<script\b[^>]*>(.*?)</script>',s,re.S|re.I)):
        if not inline_js.strip(): continue
        f=Path(td)/f'script{i}.js'; f.write_text(inline_js); subprocess.run(['node','--check',str(f)],check=True)
    subprocess.run(['node','--check',str(root/'service-worker.js')],check=True)
    names=['qbParseCsv','qbNorm','availableQuestionFamilies','k9EncodeInline']
    code='\n'.join(re.search(r'^function '+n+r'\(.*$',js,re.M).group(0) for n in names)
    code+='\n'+r'''const assert=require('node:assert/strict');
assert.deepEqual(qbParseCsv('a;b\r\n"c;d";"e""f"'),[['a','b'],['c;d','e"f']]);
assert.throws(()=>qbParseCsv('"a;b'));
assert.equal(k9EncodeInline("D'Amico"),'D%27Amico');
let qbSummary=[{discipline:'dogsitter',families:2}];
assert.equal(availableQuestionFamilies('dogsitter'),2);
assert.equal(availableQuestionFamilies('hrdd'),0);
console.log('CSV, escaping e famiglie: OK');'''
    f=Path(td)/'unit.js'; f.write_text(code); subprocess.run(['node',str(f)],check=True)
print(f'HTML: {len(p.ids)} ID senza duplicati; sintassi JavaScript OK.')

# Protezione contro la regressione del raggruppamento e del conteggio famiglie.
sql=(root/'supabase/migrations/20261120093000_k9_v2_2_1.sql').read_text()
assert 'eligible_families < ex.question_count' in sql
assert 'family_key' in sql and 'hard_selected' in sql
assert 'k9_question_family' in sql and 'medio' in sql and 'difficile' in sql
assert 'K9QRCode' not in sql
assert (root/'docs/DETECTION_REVISIONE_100_DOMANDE.csv').is_file()
print('Guard famiglie e audit Detection: OK.')
