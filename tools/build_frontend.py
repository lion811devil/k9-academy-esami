from pathlib import Path
root=Path(__file__).resolve().parents[1]
parts=sorted((root/'src/js').glob('*.js'))
assert len(parts)==6, 'Moduli mancanti'
(root/'assets/js/app.js').write_text(''.join(p.read_text() for p in parts))
print('Bundle aggiornato: assets/js/app.js')
