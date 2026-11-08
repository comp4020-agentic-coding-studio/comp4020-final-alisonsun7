#!/usr/bin/env python3
"""Read-only material audit; --write records results, never changes the drafts."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
LIMITS = {'README.md': (400, 600), 'PROCESS.md': (900, 1100), 'research-note.md': (600, 800)}
counts, failures = {}, []
for filename, (low, high) in LIMITS.items():
    text = (ROOT / filename).read_text(encoding='utf-8')
    body = text.split('\n## References')[0]
    body = '\n'.join(line for line in body.splitlines() if not line.startswith(('#', '>')))
    body = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', body)
    body = re.sub(r'[*`_]', '', body)
    count = len(body.split())
    counts[filename] = {'bodyWords': count, 'referenceRange': [low, high], 'withinRange': low <= count <= high,
                        'sha256': hashlib.sha256(text.encode()).hexdigest()}
    if not low <= count <= high:
        failures.append(f'{filename}: {count} body words outside {low}–{high}')

files = [ROOT / name for name in LIMITS] + sorted((ROOT / 'docs/submission').glob('*.md'))
link_count = 0
for file in files:
    for label, destination in re.findall(r'!?\[([^\]]*)\]\(([^)]+)\)', file.read_text(encoding='utf-8')):
        if destination.startswith(('https://', 'http://', '#', 'mailto:')):
            continue
        target = destination.split('#', 1)[0]
        link_count += 1
        if target and not (file.parent / target).exists():
            failures.append(f'{file.relative_to(ROOT)}: missing local link {target}')

commit_ids = sorted(set(re.findall(r'github\.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/([0-9a-f]{7,40})',
                                 (ROOT / 'PROCESS.md').read_text(encoding='utf-8'))))
for commit in commit_ids:
    result = subprocess.run(['git', 'cat-file', '-e', f'{commit}^{{commit}}'], cwd=ROOT, capture_output=True)
    if result.returncode:
        failures.append(f'PROCESS.md: unresolved commit {commit}')

result = {'checkedOn': '2026-11-08', 'scope': 'Three root draft bodies, submission Markdown file targets, PROCESS commit objects; no browser, DB, human or hosted-deployment verification',
          'countMethod': 'Whitespace body tokens; Markdown headings, draft blockquote, link destinations and formatting removed; research reference section excluded',
          'documents': counts, 'localLinksChecked': link_count, 'processCommitObjectsChecked': commit_ids,
          'failures': failures}
output = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
if '--write' in sys.argv:
    (ROOT / 'docs/submission/material-check.json').write_text(output, encoding='utf-8')
print(output, end='')
sys.exit(bool(failures))
