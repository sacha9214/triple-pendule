"""Inline tools/swingup.json into index.html (the `const SWING = ...;//SWING-DATA` line)."""
import os, re
here = os.path.dirname(__file__)
data = open(os.path.join(here, 'swingup.json')).read().strip()
path = os.path.join(here, '..', 'index.html')
html = open(path).read()
html, n = re.subn(r'const SWING = .*;//SWING-DATA', lambda _: f'const SWING = {data};//SWING-DATA', html)
assert n == 1
open(path, 'w').write(html)
print('inlined', len(data), 'bytes')
