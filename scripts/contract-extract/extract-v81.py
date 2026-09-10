#!/usr/bin/env python3
"""
Extract v8.1 Independent Contractor Agreement from Heather's docx into
structured JSON for the JSX contract renderer (src/contracts/v8_1.json).

Best-effort structural preservation:
  - Paragraph styles → node types:
      Title, Heading1, Heading2, Heading3 → heading with level
      ListParagraph → item
      BodyText / (no style) → para
  - Bold runs marked as {"bold": true}
  - Placeholders like {{contractor_full_name}} preserved verbatim so the
    JSX renderer can substitute them from the `contractor` prop

Rerun whenever Heather sends an updated version:

    python3 scripts/contract-extract/extract-v81.py \
        "/path/to/Tere_Doctor_Contractor_Offer_v8.1 -  Final.docx" \
        > src/contracts/v8_1.json

Manual cleanup after each extraction (~15-30 min):
  - Merge multi-column artefact duplicates in the header block
  - Fix any list-numbering that got dropped in the docx numPr → JSON step
  - Verify Schedule + Appendix render as tables/lists as intended
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

STYLE_TO_TYPE = {
    'Title':      ('heading', 0),
    'Heading1':   ('heading', 1),
    'Heading2':   ('heading', 2),
    'Heading3':   ('heading', 3),
}


def extract(docx_path: str) -> dict:
    with zipfile.ZipFile(docx_path) as z:
        xml = z.read('word/document.xml')
    root = ET.fromstring(xml)

    nodes = []
    seen_texts_recent = []   # sliding window to detect duplicate paragraphs
    # (multi-column layouts in Word produce duplicated paragraphs when the
    # source spans columns; we drop exact matches within a small window)

    for p in root.iter(f'{{{NS}}}p'):
        pPr = p.find(f'{{{NS}}}pPr')
        style = ''
        is_list = False
        if pPr is not None:
            pStyle = pPr.find(f'{{{NS}}}pStyle')
            if pStyle is not None:
                style = pStyle.get(f'{{{NS}}}val', '')
            if pPr.find(f'{{{NS}}}numPr') is not None:
                is_list = True

        # Text extraction
        texts = []
        for t in p.iter(f'{{{NS}}}t'):
            if t.text: texts.append(t.text)
        text = ''.join(texts).strip()
        if not text:
            continue
        # Duplicate detection (multi-column artefact)
        if text in seen_texts_recent:
            continue
        seen_texts_recent.append(text)
        if len(seen_texts_recent) > 8:
            seen_texts_recent.pop(0)

        # Any bold run?
        is_bold = False
        for r in p.iter(f'{{{NS}}}r'):
            rPr = r.find(f'{{{NS}}}rPr')
            if rPr is not None and rPr.find(f'{{{NS}}}b') is not None:
                is_bold = True
                break

        if style in STYLE_TO_TYPE:
            kind, level = STYLE_TO_TYPE[style]
            node = {'type': kind, 'level': level, 'text': text}
        elif is_list or style == 'ListParagraph':
            node = {'type': 'item', 'text': text}
        else:
            node = {'type': 'para', 'text': text}
        if is_bold and node['type'] not in ('heading',):
            node['bold'] = True
        nodes.append(node)

    return {
        'version': 'v8.1',
        'title': 'Independent Contractor Services Agreement — Doctor',
        'source_docx': docx_path.rsplit('/', 1)[-1],
        'nodes': nodes,
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('usage: extract-v81.py <path/to/v8.1.docx>', file=sys.stderr)
        sys.exit(1)
    data = extract(sys.argv[1])
    json.dump(data, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write('\n')
    print(f'Extracted {len(data["nodes"])} nodes', file=sys.stderr)
