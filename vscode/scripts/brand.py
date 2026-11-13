#!/usr/bin/env python3
"""Apply Scrimba's distribution configuration before the upstream build."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def apply_branding(source):
    target = source / 'product.json'
    product = json.loads(target.read_text())
    overrides = json.loads((ROOT / 'product-overrides.json').read_text())
    product.update(overrides)
    target.write_text(json.dumps(product, indent='\t') + '\n')
    print(f'Configured {product["nameLong"]}: executable {product["applicationName"]}, data {product["dataFolderName"]}')


if __name__ == '__main__':
    apply_branding(ROOT / 'source')
