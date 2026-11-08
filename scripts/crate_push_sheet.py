#!/usr/bin/env python3
"""A contact sheet of Crate push boards for the owner to judge (plan slice 1).

    PYTHONPATH=. .venv/bin/python scripts/crate_push_sheet.py OUT.html [per_stage]

One small grid per board with its stage, fewest moves, pushes and par. Pure
HTML and CSS, no scripts. Run with the dev venv (the package import needs it).
"""

from __future__ import annotations

from datetime import date, timedelta
import html
from pathlib import Path
import sys

from custom_components.virtual_pet import crate_push as S

GLYPH = {
    ".": "",
    "#": "▓",
    "~": "≈",
    "P": "🐾",
    "p": "🐾",
    "b": "▣",
    "n": "◎",
    "B": "▣",
}


def cell(c: str) -> str:
    cls = {"#": "wall", "~": "void", "n": "spot", "p": "spot", "B": "spot"}.get(c, "")
    inner = {"P": "pet", "p": "pet", "b": "crate", "B": "crate"}.get(c, "")
    mark = {"n": "◎"}.get(c, "")
    body = (
        f'<i class="{inner}"></i>'
        if inner
        else html.escape(mark or GLYPH[c] if c in "#~" else mark)
    )
    return f'<td class="{cls}">{body}</td>'


def sheet(per_stage: int) -> str:
    out = []
    for stage in S.LEVELS:
        out.append(f"<h2>{stage}</h2><div class=row>")
        d0 = date(2026, 11, 9)
        for i in range(per_stage):
            day = (d0 + timedelta(days=i)).isoformat()
            b = S.crate_push_board("pet", day, None, stage)
            s = S.solve(b)
            rows = "".join(
                "<tr>" + "".join(cell(c) for c in r) + "</tr>" for r in b.grid
            )
            out.append(
                f"<figure><table>{rows}</table><figcaption>{len(s.moves)} moves · "
                f"{s.pushes} pushes · par {b.par} · {b.tries} tries</figcaption></figure>"
            )
        out.append("</div>")
    css = (
        "body{font:14px system-ui;margin:12px;background:#fff;color:#222}"
        "h2{margin:16px 0 4px;text-transform:capitalize}.row{display:flex;flex-wrap:wrap;gap:12px}"
        "figure{margin:0}table{border-collapse:collapse}td{width:34px;height:34px;border:1px solid #cfd;"
        "background:#f3f8ee;text-align:center;padding:0}td.wall{background:#6b5d4a;color:#fff}"
        "td.void{background:#cde;color:#47a}td.spot{background:#fde8c2}"
        "i.crate{display:block;margin:5px;height:22px;background:#b07a3c;border:2px solid #7a5222;box-sizing:border-box}"
        "i.pet{display:block;margin:6px;height:20px;width:20px;border-radius:50%;background:#3a8f5c;float:left}"
        "td.spot:empty::after,td.spot:not(:has(i))::after{content:'◎';color:#c98a1c}"
        "figcaption{font-size:12px;color:#555;margin-top:3px}"
    )
    return (
        f"<!doctype html><meta charset=utf-8><title>Crate push boards</title><style>{css}</style>"
        + "".join(out)
    )


if __name__ == "__main__":
    path = Path(sys.argv[1])
    path.write_text(
        sheet(int(sys.argv[2]) if len(sys.argv) > 2 else 5), encoding="utf-8"
    )
    print(path)
