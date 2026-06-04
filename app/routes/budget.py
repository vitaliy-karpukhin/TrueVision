from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
import re
import os
import base64
import json
import logging
from datetime import datetime, timezone
from app.db.database import get_db
from app.models.budget import Budget
from app.models.user import User
from app.config import SECRET_KEY, ALGORITHM
from jose import jwt, JWTError

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_BUDGET = {
    "income": 0,
    "categories": [
        {
            "id": "housing",
            "label": "Жильё",
            "color": "#4FD1C5",
            "items": [
                {"id": "h1", "label": "Аренда / ипотека",    "amount": 0},
                {"id": "h2", "label": "Коммунальные услуги", "amount": 0},
                {"id": "h3", "label": "Интернет / телефон",  "amount": 0},
            ],
        },
        {
            "id": "living",
            "label": "Жизнь и потребление",
            "color": "#68D391",
            "items": [
                {"id": "l1", "label": "Питание",        "amount": 0},
                {"id": "l2", "label": "Одежда",         "amount": 0},
                {"id": "l3", "label": "Транспорт",      "amount": 0},
                {"id": "l4", "label": "Развлечения",    "amount": 0},
            ],
        },
        {
            "id": "insurance",
            "label": "Страховки и взносы",
            "color": "#F6AD55",
            "items": [
                {"id": "i1", "label": "Медицинская страховка",  "amount": 0},
                {"id": "i2", "label": "Автострахование",        "amount": 0},
            ],
        },
        {
            "id": "savings",
            "label": "Сбережения",
            "color": "#B794F4",
            "items": [
                {"id": "s1", "label": "Накопительный счёт", "amount": 0},
                {"id": "s2", "label": "Инвестиции",         "amount": 0},
            ],
        },
    ],
}


def _get_user(authorization: Optional[str], db: Session) -> dict:
    if not authorization:
        raise HTTPException(401, "Authorization header missing")
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(401, "Invalid token")
    except JWTError:
        raise HTTPException(401, "Invalid token")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(401, "User not found")
    return {"id": user.id, "email": user.email}


def _current_period() -> str:
    return datetime.now().strftime("%Y-%m")


@router.get("/history")
def get_budget_history(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    user = _get_user(authorization, db)
    rows = (
        db.query(Budget)
        .filter(Budget.user_id == user["id"])
        .order_by(Budget.period.desc())
        .all()
    )
    return [
        {
            "period": r.period,
            "income": r.data.get("income", 0),
            "total_expenses": sum(
                item.get("amount", 0)
                for cat in r.data.get("categories", [])
                for item in cat.get("items", [])
            ),
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.get("")
def get_budget(
    period: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    user = _get_user(authorization, db)
    p = period or _current_period()
    row = db.query(Budget).filter(Budget.user_id == user["id"], Budget.period == p).first()
    if row:
        return {**row.data, "period": row.period}
    # Фолбэк: если запрошен текущий месяц и записи нет — ищем последний
    if not period:
        latest = (
            db.query(Budget)
            .filter(Budget.user_id == user["id"])
            .order_by(Budget.period.desc())
            .first()
        )
        if latest:
            return {**latest.data, "period": latest.period}
    return {**DEFAULT_BUDGET, "period": p}


@router.put("")
def save_budget(
    body: dict,
    period: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    user = _get_user(authorization, db)
    p = period or body.pop("period", None) or _current_period()
    row = db.query(Budget).filter(Budget.user_id == user["id"], Budget.period == p).first()
    if row:
        row.data = {k: v for k, v in body.items() if k != "period"}
    else:
        row = Budget(user_id=user["id"], period=p, data={k: v for k, v in body.items() if k != "period"})
        db.add(row)
    db.commit()
    return {"ok": True, "period": p}


def _parse_amount(s: str) -> float:
    s = s.strip().replace("\xa0", "").replace(" ", "")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


# ── Haushaltsbudget column → category mapping ─────────────────────────────────
# Maps German column header keywords to our category IDs
_COL_HEADERS = {
    "schutzengel": "insurance",
    "versicherung": "insurance",
    "schutz": "insurance",
    "wohnen": "housing",
    "wohnung": "housing",
    "leben": "living",
    "konsum": "living",
    "alltag": "living",
    "sparen": "savings",
    "sparplan": "savings",
    "vorsorge": "savings",
}

_COL_COLORS = {
    "insurance": "#C8922A",
    "housing":   "#C0392B",
    "living":    "#D4820A",
    "savings":   "#2D8A4E",
}

_COL_LABELS_DE = {
    "housing":   "Wohnen",
    "living":    "Leben / Konsum",
    "insurance": "Schutzengel",
    "savings":   "Sparen",
}

# ── Keyword → bucket mapping ───────────────────────────────────────────────────
HOUSING_H1 = ["miete", "kaltmiete", "hypothek", "warmmiete", "finanzierung", "darlehen"]
HOUSING_H2 = ["nebenkosten", "strom", "gas", "wasser", "heizung", "grundsteuer",
               "rundfunk", "müll", "garage", "stellplatz"]
HOUSING_H3 = ["internet", "telefon", "mobilfunk", "tv", "dsl", "festnetz"]

LIVING_L1  = ["ernährung", "lebensmittel", "essen", "nahrung", "kita", "kinder",
               "kindergarten", "schule"]
LIVING_L2  = ["kleidung", "bekleidung", "mode", "schuhe"]
LIVING_L3  = ["mobilität", "transport", "kfz-neben", "fahrkosten", "fahrt",
               "leasing", "kraftstoff", "tanken", "öpnv", "bahnticket"]
LIVING_L4  = ["vergnügen", "freizeit", "urlaub", "haustier", "zigaretten",
               "geschenke", "hobby", "handy", "smartphone", "streaming",
               "privatkredit", "beiträge", "beitrag", "vereinsbeitrag",
               "unternehmensverpflichtung", "gesundheit", "fitness",
               "sonstige", "sonstiges"]

INS_I1     = ["krankenversicherung", "kv-zusatz", "kv zusatz", "kv privat", "pflege", "pkv",
               "gesetzliche kranken"]
INS_I2     = ["kfz-versicherung", "kfz versicherung", "kfz-versicher", "autoversicherung", "kraftfahrzeug"]
INS_EXTRA  = ["unfall", "haftpflicht", "hausrat", "risiko", "rechtsschutz",
               "wohngebäude", "berufsunfähig", "glas", "risiko-lv",
               "invalidität", "lebensversicherung"]

SAV_S1     = ["sparbuch", "tagesgeld", "sparkonto", "girokonto", "bausparen"]
SAV_S2     = ["investition", "fonds", "aktien", "etf", "depot"]
SAV_EXTRA  = ["riester", "rürup", "rente", "bav", "altersvorsorge", "betriebliche"]

SKIP       = ["überschuss", "vom einkommen", "haushaltsnettoeinkommen",
              "nettoeinkommen", "budget verwendet", "soll-vergleich",
              "finanzplanung", "vertragscheck", "haushaltsbudget",
              "name", "mtl", "neuer ausgabentyp"]

BAD_LABEL  = {"oll", "valas", "kala", "e]", "ay", "v", "mtl"}


def _match(label: str, keywords: list) -> bool:
    ll = label.lower()
    return any(kw in ll for kw in keywords)


def _classify_raw_items(income: float, raw_items: list, is_haushalts: bool) -> dict:
    buckets: dict[str, float] = {
        "h1": 0, "h2": 0, "h3": 0,
        "l1": 0, "l2": 0, "l3": 0, "l4": 0,
        "i1": 0, "i2": 0,
        "s1": 0, "s2": 0,
    }
    extra_ins:   list[dict] = []
    extra_sav:   list[dict] = []
    extra_other: list[dict] = []

    for label, amount in raw_items:
        ll = label.lower().strip()
        if len(ll) < 2 or ll in BAD_LABEL or any(c.isdigit() for c in ll[:2]):
            continue
        if any(s in ll for s in SKIP):
            continue
        if _match(label, HOUSING_H1):
            buckets["h1"] += amount
        elif _match(label, HOUSING_H3):
            buckets["h3"] += amount
        elif _match(label, LIVING_L3):
            buckets["l3"] += amount
        elif _match(label, HOUSING_H2):
            buckets["h2"] += amount
        elif _match(label, LIVING_L1):
            buckets["l1"] += amount
        elif _match(label, LIVING_L2):
            buckets["l2"] += amount
        elif _match(label, LIVING_L4):
            buckets["l4"] += amount
        elif _match(label, INS_I1):
            buckets["i1"] += amount
        elif _match(label, INS_I2):
            buckets["i2"] += amount
        elif _match(label, INS_EXTRA):
            extra_ins.append({"id": f"ix_{ll[:8].replace(' ', '_')}", "label": label, "amount": round(amount, 2)})
        elif _match(label, SAV_S1):
            buckets["s1"] += amount
        elif _match(label, SAV_S2):
            buckets["s2"] += amount
        elif _match(label, SAV_EXTRA):
            extra_sav.append({"id": f"sx_{ll[:8].replace(' ', '_')}", "label": label, "amount": round(amount, 2)})
        else:
            extra_other.append({"id": f"ox_{ll[:8].replace(' ', '_')}", "label": label, "amount": round(amount, 2)})

    def _items(base: list[dict], extras: list[dict]) -> list[dict]:
        result = [i for i in base if i["amount"] > 0]
        result.extend(extras)
        return result or base

    label_fn = _COL_LABELS_DE if is_haushalts else {
        "housing": "Wohnen", "living": "Leben & Konsum",
        "insurance": "Versicherungen", "savings": "Sparen",
    }

    return {
        "income": round(income, 2),
        "categories": [
            {"id": "insurance", "label": label_fn["insurance"], "color": "#F6AD55",
             "items": _items([
                 {"id": "i1", "label": "Krankenversicherung", "amount": round(buckets["i1"], 2)},
                 {"id": "i2", "label": "KFZ-Versicherung",    "amount": round(buckets["i2"], 2)},
             ], extra_ins)},
            {"id": "housing",   "label": label_fn["housing"],   "color": "#4FD1C5",
             "items": _items([
                 {"id": "h1", "label": "Miete / Hypothek",  "amount": round(buckets["h1"], 2)},
                 {"id": "h2", "label": "Nebenkosten",        "amount": round(buckets["h2"], 2)},
                 {"id": "h3", "label": "Internet / Telefon", "amount": round(buckets["h3"], 2)},
             ], [])},
            {"id": "living",    "label": label_fn["living"],    "color": "#68D391",
             "items": _items([
                 {"id": "l1", "label": "Ernährung",  "amount": round(buckets["l1"], 2)},
                 {"id": "l2", "label": "Kleidung",   "amount": round(buckets["l2"], 2)},
                 {"id": "l3", "label": "Transport",  "amount": round(buckets["l3"], 2)},
                 {"id": "l4", "label": "Freizeit",   "amount": round(buckets["l4"], 2)},
             ], extra_other)},
            {"id": "savings",   "label": label_fn["savings"],   "color": "#B794F4",
             "items": _items([
                 {"id": "s1", "label": "Sparkonto",     "amount": round(buckets["s1"], 2)},
                 {"id": "s2", "label": "Investitionen", "amount": round(buckets["s2"], 2)},
             ], extra_sav)},
        ],
    }


def _extract_budget_from_text(text: str) -> dict:
    tl = text.lower()
    income = 0.0
    for pat in [
        # Flexible m+ to handle typos like "einkommmen" (triple m)
        r"haushaltsnettoeinkomm+en[:\s\n]*([\d][\d\.\,\s\xa0]*\d)\s*(?:€|EUR)",
        r"haushaltsnettoinkommen[:\s\n]*([\d][\d\.\,\s\xa0]*\d)\s*(?:€|EUR)",
        r"nettoeinkommen[:\s\n]*([\d][\d\.\,\s\xa0]*\d)\s*(?:€|EUR)",
        r"nettoinkommen[:\s\n]*([\d][\d\.\,\s\xa0]*\d)\s*(?:€|EUR)",
        r"([\d][\d\.\,\s\xa0]*\d),00\s*(?:€|EUR)\s*/",
        r"([\d][\d\.\,\s\xa0]*\d),00\s*(?:€|EUR)\s*\.",
        r"haushaltsnettoeinkommen[:\s\n]*([\d][\d\.\,\s\xa0]*\d)\s*(?:€|EUR)",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            income = _parse_amount(m.group(1))
            if income > 0:
                break

    AMOUNT_PAT = r"([\d]{1,3}(?:[\. ]?\d{3})*,\d{2})\s*€"

    # Format A: "Label (N) Amount €"
    MARKER_RE = re.compile(
        r"([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9 \-/\.]{1,40}?)\s*\(\d+\)\s*\n?\s*" + AMOUNT_PAT
    )
    # Format B: "Label  Amount €" (2+ spaces)
    SPACE_RE = re.compile(
        r"([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9 \-/\.]{1,40}?)  +" + AMOUNT_PAT
    )
    # Format C: "v (N) Label Amount €" — checkmark before item number
    V_MARKER_RE = re.compile(
        r"[v✓]\s+\(\d+\)\s+"
        r"([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9 \-/\.\+]{2,50}?)"
        r"\s+" + AMOUNT_PAT
    )
    # Format D: "v (N) LabelGARBLED,cents €" — pdfplumber embeds column digits into label
    # e.g. "KFZ-Versicher1u0n2g,00 €" → label="KFZ-Versicher", digits="102", amount=102.00
    V_GARBLED_RE = re.compile(
        r"[v✓]\s+\(\d+\)\s+"
        r"([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\-/\.]{3,})"  # letter-only label prefix
        r"(\w*)"                                           # garbled middle (digits mixed with letters)
        r",(\d{2})\s*€"                                    # ,cents €
    )

    raw_items: list[tuple[str, float]] = []
    seen: set[str] = set()

    for pattern in [MARKER_RE, V_MARKER_RE, SPACE_RE]:
        for m in pattern.finditer(text):
            label = m.group(1).strip().rstrip(".")
            amount = _parse_amount(m.group(2).replace(" ", ""))
            key = label.lower().strip()
            if amount > 0 and 2 < len(label) < 50 and key not in seen:
                raw_items.append((label, amount))
                seen.add(key)

    # Format D: extract digits from garbled middle to reconstruct amount
    for m in V_GARBLED_RE.finditer(text):
        label = m.group(1).strip().rstrip(".")
        key = label.lower().strip()
        if key in seen or len(label) < 3:
            continue
        garbled = m.group(2)
        cents = m.group(3)
        int_digits = "".join(c for c in garbled if c.isdigit())
        if not int_digits:
            continue
        try:
            amount = float(f"{int_digits}.{cents}")
        except ValueError:
            continue
        if amount > 0 and amount < 100000:
            raw_items.append((label, amount))
            seen.add(key)

    is_haushalts = any(kw in tl for kw in ["haushaltsbudget", "haushaltsnettoinkommen", "haushaltsnettoeinkommen", "haushaltsnettoeinkomm", "schutzengel"])
    return _classify_raw_items(income, raw_items, is_haushalts)


def _extract_budget_from_ocr_text(text: str) -> dict:
    """OCR-specific parser: handles single-space separators and split amounts."""
    tl = text.lower()

    income = 0.0
    for pat in [
        r"haushaltsnettoeinkommen[:\s]*([\d][\d\.\,\s\xa0]*\d)\s*€",
        r"nettoeinkommen[:\s]*([\d][\d\.\,\s\xa0]*\d)\s*€",
        r"einkommen[:\s]*([\d][\d\.\,\s\xa0]*\d)\s*€",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            income = _parse_amount(m.group(1))
            break

    # Split every line on (N)/(1)/{N} markers so each item is its own segment.
    # This separates multiple items that OCR merges onto one line from multi-column PDFs.
    all_segs = []
    for line in text.split('\n'):
        parts = re.split(r'(?=[\(\[{][\dN]\)?[\]\}]?\s*[A-Za-zÄÖÜäöüß])', line)
        for part in parts:
            s = part.strip()
            if s:
                all_segs.append(s)

    # Merge marker-but-no-amount segments with the next standalone amount,
    # skipping over segments that already have their own amounts.
    normalized = []
    i = 0
    while i < len(all_segs):
        seg = all_segs[i]
        has_marker = bool(re.match(r'[\(\[{][\dN]\)?[\]\}]?', seg))
        has_amount = bool(re.search(r'\d+,\d{2}\s*€', seg))

        if has_marker and not has_amount:
            merged = False
            for j in range(i + 1, min(i + 8, len(all_segs))):
                nxt = all_segs[j].strip()
                nxt_is_marker = bool(re.match(r'[\(\[{][\dN]\)?[\]\}]?\s*[A-Za-zÄÖÜäöüß]', nxt))
                nxt_has_amount = bool(re.search(r'\d+,\d{2}\s*€', nxt))
                if nxt_is_marker and not nxt_has_amount:
                    break  # another unresolved label claims the next amount
                amt = re.match(r'^([\d][\d\s\.]*,\d{2}\s*€)', nxt)
                if amt:
                    normalized.append(seg + '  ' + amt.group(1))
                    merged = True
                    break
            if not merged:
                normalized.append(seg)
        else:
            normalized.append(seg)
        i += 1

    norm_text = '\n'.join(normalized)

    # RE1: standard — (marker)(label)(1+ spaces)(amount)
    OCR_RE1 = re.compile(
        r"[\(\[{][\dN]\)?[\]\}]?\s*"
        r"([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9 \-/\.]{1,50}?)"
        r"\s+([\d]{1,3}(?:[ \.]?\d{3})*,\d{2})\s*€",
    )

    # RE2: merged lines — label (stops at single-char words like OCR "v" artifacts)
    # followed by noise up to 80 chars, then double-space + amount (our merge marker).
    OCR_RE2 = re.compile(
        r"[\(\[{][\dN]\)?[\]\}]?\s*"
        r"([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9\-/\.]+(?:\s[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9\-/\.]+)*)"
        r"[^€\n]{0,80}"
        r"  ([\d]{1,3}(?:[ \.]?\d{3})*,\d{2})\s*€",
    )

    raw_items: list[tuple[str, float]] = []
    seen: set[str] = set()

    for pattern in [OCR_RE1, OCR_RE2]:
        for m in pattern.finditer(norm_text):
            label = m.group(1).strip().rstrip('.')
            amount = _parse_amount(m.group(2).replace(' ', ''))
            key = label.lower().strip()
            if amount > 0 and 2 < len(label) < 60 and key not in seen:
                raw_items.append((label, amount))
                seen.add(key)

    is_haushalts = any(kw in tl for kw in ["haushaltsbudget", "haushaltsnettoeinkommen", "schutzengel"])
    logger.info(f"OCR parser: income={income}, items={len(raw_items)}, is_haushalts={is_haushalts}")
    return _classify_raw_items(income, raw_items, is_haushalts)


# Keyword → (category_id, color, positional_label).
# Searched in BOTH the column header AND the item labels — content-based detection.
# To support new document formats, just add keywords here.
_HEADER_KEYWORD_MAP = [
    (["schutz", "versicherung", "insurance", "unfall", "haftpflicht",
      "hausrat", "berufsunfähig", "rechtsschutz"],                "insurance", "#C8922A", "Versicherungen"),
    (["wohn", "housing", "miete", "kaltmiete", "nebenkosten",
      "finanzierung", "immobil", "rundfunk", "grundsteuer"],      "housing",   "#C0392B", "Wohnen"),
    (["leben", "konsum", "living", "alltag", "ernährung",
      "bekleidung", "mobilität", "freizeit", "privatkredit",
      "streaming", "haustier", "sonstige", "vergnügen"],          "living",    "#D4820A", "Leben / Konsum"),
    (["spar", "saving", "invest", "vorsorge", "rente", "riester",
      "rürup", "tagesgeld", "fonds", "bav", "bausparen"],         "savings",   "#2D8A4E", "Sparen"),
]

_POSITION_FALLBACK = [
    ("insurance", "#C8922A", "Versicherungen"),
    ("housing",   "#C0392B", "Wohnen"),
    ("living",    "#D4820A", "Leben / Konsum"),
    ("savings",   "#2D8A4E", "Sparen"),
]


def _detect_col_meta(col_text: str, position: int) -> tuple[str, str, str]:
    """Detect (label, cat_id, color) by scoring keyword matches in full column text.

    Category is determined by content (reliable).
    Label: use the actual header title from OCR if it's clearly a header word,
    otherwise fall back to the default label for that category.
    """
    tl = col_text.lower()

    # Score each category
    scores = []
    for keywords, cat_id, color, default_label in _HEADER_KEYWORD_MAP:
        score = sum(1 for kw in keywords if kw in tl)
        scores.append((score, cat_id, color, default_label))

    best_score, cat_id, color, default_label = max(scores, key=lambda x: x[0])

    if best_score == 0:
        # No content keywords → positional fallback
        if position < len(_POSITION_FALLBACK):
            cat_id, color, default_label = _POSITION_FALLBACK[position]
        else:
            return f"Spalte {position + 1}", f"col{position}", "#888888"

    # Use OCR title only if it looks like a genuine header (not an item name)
    ocr_title = _extract_col_title(col_text)
    label = ocr_title if ocr_title else default_label
    return label, cat_id, color


# Known item-like words that should NOT be used as column titles
_ITEM_WORDS = {
    "hausrat", "strom", "gas", "müll", "kita", "kinder", "leasing",
    "beiträge", "geschenke", "handy", "streaming", "riester", "rürup",
    "internet", "garage", "rundfunk", "girokonto", "sparbuch", "bausparen",
    "bekleidung", "pflege", "risiko", "glas", "wohngebäude",
}


def _extract_col_title(col_text: str) -> str:
    """Extract column header title from OCR text.
    Skips item lines, UI chrome, and known item-name words.
    Returns empty string when no reliable header is found.
    """
    for line in col_text.split("\n"):
        orig = line.strip()
        # Strip leading pipe/space/noise — all checks run on the cleaned version
        cleaned_start = re.sub(r'^[\s|]+', '', orig)
        if re.match(r'^[v✓vVcC©®]', cleaned_start):
            continue
        # Skip known UI lines (checked on cleaned_start, not orig)
        if re.match(
            r'^(?:Name\b|mtl\.?|Neuer\b|Vom\b|Budget|Finanz|Haus[a-z]|Arnold|Ihr\b|\d+\s*%)',
            cleaned_start, re.I
        ):
            continue
        # Strip all leading non-letter OCR noise
        s = re.sub(r'^[^A-Za-zÄÖÜäöüß]+', '', orig)
        if not s or len(s) < 4 or len(s) > 40:
            continue
        if re.search(r'\d+,\d{2}', s):
            continue
        # Reject if it's a known item word
        if s.lower().rstrip(".") in _ITEM_WORDS:
            continue
        return s
    return ""

# Matches: checkmark + number marker (1/N/any) + label + amount on same line
# OCR often reads (1) as (N) or (N due to font rendering
_ITEM_OCR_RE = re.compile(
    r'[v✓vVcC©®]?\s*[\(\[]\s*[\dNn]+\s*[\)\]]?\s*'
    r'([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß0-9 \-/\.]{1,60}?)\s+'
    r'([\d]{1,3}(?:[\s\.]?\d{3})*,\d{2})\s*€'
)

# Looser pattern: marker with ANY word chars (catches garbled markers like "(las" = "(1) Glas")
# Label MUST start with uppercase to avoid false positives from OCR fragments
_ITEM_OCR_RE_LOOSE = re.compile(
    r'[v✓vVcC]\s+[\(\[]\s*\w{1,4}\s*[\)\]]?\s*'
    r'([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9 \-/\.]{2,60}?)\s+'
    r'([\d]{1,3}(?:[\s\.]?\d{3})*,\d{2})\s*€'
)

_TOTAL_OCR_RE = re.compile(r'(\d+)\s*%\s*([\d \.]+,\d{2})\s*€\s*mtl')
_INCOME_OCR_RE = re.compile(
    r'(?:haushaltsnettoeinkommen|nettoeinkommen)[:\s]*([\d][\d\s\.\,]*\d),?\d*\s*€',
    re.IGNORECASE
)


def _preprocess_col_text(text: str) -> str:
    """Merge OCR line-wrap artifacts: label continuations + orphan amounts."""
    lines = text.split('\n')

    # Pass 1: merge lowercase continuations (label wrapped to next line)
    pass1: list[str] = []
    for line in lines:
        s = line.strip()
        if not s:
            pass1.append('')
            continue
        if (pass1
                and re.match(r'^[a-zäöüß]', s)
                and not re.search(r'\d+,\d{2}\s*€', s)
                and not re.match(r'^(?:vom|neuer)', s, re.I)):
            pass1[-1] = pass1[-1].rstrip() + s
        else:
            pass1.append(s)

    # Pass 2: attach orphan amounts to preceding marker lines that have no amount yet
    pass2: list[str] = []
    for line in pass1:
        s = line.strip()
        if not s:
            pass2.append('')
            continue
        if (pass2
                and re.match(r'^[\d][\d\s\.]*,\d{2}\s*€\s*$', s)
                and re.search(r'[v✓vVcC]\s*[\(\[]', pass2[-1])
                and not re.search(r'\d+,\d{2}\s*€', pass2[-1])):
            pass2[-1] = pass2[-1].rstrip() + ' ' + s
        else:
            pass2.append(s)

    return '\n'.join(pass2)


def _run_tesseract(img_path: str) -> str:
    """Run tesseract on an image file and return UTF-8 text."""
    import subprocess
    out = subprocess.run(
        ["/opt/homebrew/bin/tesseract", img_path, "stdout", "-l", "deu", "--psm", "6"],
        capture_output=True, timeout=30,
    )
    return out.stdout.decode("utf-8", errors="replace")


def _ocr_columns(file_path: str) -> dict | None:
    """Render PDF → split into columns → detect each dynamically → parse items."""
    try:
        import fitz
        import os
        from PIL import Image
        import io

        tmp_dir = os.path.expanduser("~/Downloads")

        pdf = fitz.open(file_path)
        pix = pdf[0].get_pixmap(matrix=fitz.Matrix(3, 3))
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        w, h = img.size

        # ── Income from header strip ─────────────────────────────────────────────
        income = 0.0
        hdr_path = os.path.join(tmp_dir, "_ocr_hdr.png")
        img.crop((0, 0, w, int(h * 0.18))).save(hdr_path)
        try:
            hdr_text = _run_tesseract(hdr_path)
        finally:
            try:
                os.unlink(hdr_path)
            except OSError:
                pass

        m = _INCOME_OCR_RE.search(hdr_text)
        if m:
            income = _parse_amount(m.group(1))
            logger.info(f"Income from header: {income}")

        # ── Split into 4 equal columns (standard format for this document type) ──
        n_cols = 4
        col_w = w // n_cols

        # ── Process each column strip ────────────────────────────────────────────
        categories = []
        pct_incomes: list[float] = []

        for i in range(n_cols):
            x0 = i * col_w
            x1 = (i + 1) * col_w if i < n_cols - 1 else w
            strip_path = os.path.join(tmp_dir, f"_ocr_col_{i}.png")
            img.crop((x0, 0, x1, h)).save(strip_path)
            try:
                raw_text = _run_tesseract(strip_path)
            finally:
                try:
                    os.unlink(strip_path)
                except OSError:
                    pass

            col_label, cat_id, color = _detect_col_meta(raw_text, i)
            col_text = _preprocess_col_text(raw_text)
            logger.info(f"OCR col {i}: detected='{col_label}' → id={cat_id}, {len(col_text)} chars")

            items: list[dict] = []
            seen: set[str] = set()
            for pattern in (_ITEM_OCR_RE, _ITEM_OCR_RE_LOOSE):
                for m in pattern.finditer(col_text):
                    label = m.group(1).strip().rstrip(".")
                    amount = _parse_amount(m.group(2))
                    key = label.lower()
                    if amount > 0 and key not in seen and len(label) >= 2:
                        items.append({
                            "id": f"{cat_id}_{len(items) + 1}",
                            "label": label,
                            "amount": amount,
                        })
                        seen.add(key)

            # Collect percentage-based income estimates as fallback
            tm = _TOTAL_OCR_RE.search(col_text)
            if tm:
                try:
                    pct = float(tm.group(1)) / 100
                    total_mtl = _parse_amount(tm.group(2).replace(" ", ""))
                    if pct > 0 and total_mtl > 0:
                        pct_incomes.append(round(total_mtl / pct, 2))
                except Exception:
                    pass

            if items:
                categories.append({
                    "id": cat_id,
                    "label": col_label,
                    "color": color,
                    "items": items,
                })

        # Fallback: average of percentage-derived incomes
        if income == 0 and pct_incomes:
            income = round(sum(pct_incomes) / len(pct_incomes), 2)
            logger.info(f"Income from pct fallback (avg of {pct_incomes}): {income}")

        if not categories:
            return None

        logger.info(f"OCR columns: income={income}, {len(categories)} cats, "
                    f"{sum(len(c['items']) for c in categories)} items")
        return {"income": income, "categories": categories}

    except Exception as e:
        logger.warning(f"OCR column extraction failed: {e}")
        return None


def _ocr_extract_budget(file_path: str) -> dict | None:
    """Render PDF pages to images → column-based OCR → structured budget."""
    result = _ocr_columns(file_path)
    if result:
        return result

    # Fallback: whole-page OCR (columns may mix)
    try:
        import fitz
        import subprocess
        import os

        pdf = fitz.open(file_path)
        pix = pdf[0].get_pixmap(matrix=fitz.Matrix(2.5, 2.5))
        img_path = os.path.expanduser("~/Downloads/_ocr_fullpage.png")
        with open(img_path, "wb") as f:
            f.write(pix.tobytes("png"))
        try:
            out = subprocess.run(
                ["/opt/homebrew/bin/tesseract", img_path, "stdout",
                 "-l", "deu", "--psm", "3"],
                capture_output=True, timeout=30
            )
            full_text = out.stdout.decode("utf-8", errors="replace")
        finally:
            try:
                os.unlink(img_path)
            except OSError:
                pass

        logger.info(f"OCR fallback total text: {len(full_text)} chars")
        if not full_text.strip():
            return None

        budget_data = _extract_budget_from_ocr_text(full_text)
        has_any = any(
            i["amount"] > 0
            for c in budget_data.get("categories", [])
            for i in c.get("items", [])
        )
        return budget_data if has_any else None
    except Exception as e:
        logger.warning(f"OCR fallback failed: {e}")
        return None


_LABEL_FIX = {
    "berufsunfähi":           "Berufsunfähigkeit",
    "kfz-versich":            "KFZ-Versicherung",
    "krankenversicherung priv": "Krankenversicherung privat voll",
    "unterhaltsverpflich":    "Unterhaltsverpflichtung",
    "kfz-nebenkosten":        "Kfz-Nebenkosten",
}

_COL_IDS = ["insurance", "housing", "living", "savings"]
_COL_COLORS_LIST = ["#C8922A", "#C0392B", "#D4820A", "#2D8A4E"]

_HEADER_KEYS = {
    "schutzengel": 0, "wohnen": 1,
    "leben": 2, "konsum": 2, "sparen": 3,
}

_SKIP_LINES = {
    "name", "mtl", "neuer ausgabentyp", "vom einkommen",
    "budget verwendet", "haushaltsnettoeinkommen",
}


def _fix_label(label: str) -> str:
    ll = label.lower().rstrip(".")
    for prefix, full in _LABEL_FIX.items():
        if ll.startswith(prefix):
            return full
    return label.rstrip(".")


def _extract_budget_by_columns(file_path: str) -> dict | None:
    """Crop PDF page into 4 columns, parse each independently."""
    COL_META = [
        ("Schutzengel",    "insurance", "#C8922A"),
        ("Wohnen",         "housing",   "#C0392B"),
        ("Leben / Konsum", "living",    "#D4820A"),
        ("Sparen",         "savings",   "#2D8A4E"),
    ]
    ITEM_RE = re.compile(
        r'(?:[v✓vV]\s*)?\(\d+\)\s+(.+?)\s+([\d]{1,3}(?:[\.\s]?\d{3})*,\d{2})\s*€'
    )

    try:
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            page = pdf.pages[0]
            w, h = page.width, page.height

            # Auto-detect column count from header line
            # Default: 4 equal columns
            n_cols = 4
            col_w = w / n_cols

            col_texts = []
            for i in range(n_cols):
                crop = page.crop((i * col_w, 0, (i + 1) * col_w, h))
                col_texts.append(crop.extract_text() or "")

    except Exception as e:
        logger.warning(f"Column crop failed: {e}")
        return None

    categories = []
    for i, col_text in enumerate(col_texts):
        if i >= len(COL_META):
            break
        label, cat_id, color = COL_META[i]

        items = []
        for m in ITEM_RE.finditer(col_text):
            raw = re.sub(r'\.{2,}$', '', m.group(1).strip())
            fixed = _fix_label(raw)
            amount = _parse_amount(m.group(2))
            if amount > 0 and len(fixed) >= 2:
                items.append({
                    "id": f"{cat_id}_{len(items) + 1}",
                    "label": fixed,
                    "amount": amount,
                })

        if items:
            categories.append({
                "id": cat_id,
                "label": label,
                "color": color,
                "items": items,
            })

    if not categories:
        return None

    logger.info(f"Column crop parser: {len(categories)} cats, {sum(len(c['items']) for c in categories)} items")
    return {"income": 0, "categories": categories}


def _vision_extract_budget(file_path: str) -> dict | None:
    """Render first PDF page → Claude Vision → structured budget dict."""
    try:
        import fitz
        pdf = fitz.open(file_path)
        pix = pdf[0].get_pixmap(matrix=fitz.Matrix(2, 2))
        img_bytes = pix.tobytes("png")
    except Exception as e:
        logger.warning(f"PDF render failed: {e}")
        return None

    prompt = """Du siehst ein Haushaltsbudget-Dokument mit 4 farbigen Spalten.

AUFGABE: Lies ALLE Zeilen mit Häkchen (✓) und Eurobetrag aus jeder Spalte — exakt so wie im Dokument.

WICHTIGE REGELN:
1. NUR Zeilen mit einem Häkchen/Checkmark (✓ oder v) UND einem Eurobetrag (z.B. "400,00 €") aufnehmen
2. Zeilen OHNE Eurobetrag komplett überspringen (auch wenn sie einen Zeilennamen haben)
3. Folgende Zeilen immer überspringen: "Name", "mtl.", Prozentwerte ("5%", "15%"), "Vom Einkommen", "Neuer Ausgabentyp", Jahresbeträge
4. Beträge exakt als float übernehmen: "400,00 €" → 400.00, "1.820,00 €" → 1820.00
5. Namen exakt aus dem Dokument übernehmen, nichts kürzen oder erfinden
6. Einkommenszeile (Haushaltsnettoeinkommen) falls sichtbar als "income" Wert setzen, sonst 0

Spalten-Mapping (von links nach rechts, immer 4 Spalten):
Spalte 1 (orange/gelb) → id="insurance", label=exakter Spaltenname, color="#C8922A"
Spalte 2 (rot)         → id="housing",   label=exakter Spaltenname, color="#C0392B"
Spalte 3 (dunkelorange)→ id="living",    label=exakter Spaltenname, color="#D4820A"
Spalte 4 (grün)        → id="savings",   label=exakter Spaltenname, color="#2D8A4E"

Item-IDs: Spalten-ID + laufende Nummer, z.B. "insurance_1", "housing_1", "living_3"

Gib NUR valides JSON zurück, kein Text drumherum:
{"income":0,"categories":[{"id":"insurance","label":"Schutzengel","color":"#C8922A","items":[{"id":"insurance_1","label":"Berufsunfähigkeit","amount":20.00},{"id":"insurance_2","label":"Unfall","amount":20.00}]},{"id":"housing","label":"Wohnen","color":"#C0392B","items":[{"id":"housing_1","label":"Kaltmiete","amount":400.00}]}]}"""

    try:
        import anthropic
        b64 = base64.standard_b64encode(img_bytes).decode("utf-8")
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        resp = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=2048,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                    {"type": "text", "text": prompt},
                ],
            }]
        )
        raw = resp.content[0].text.strip()
        if raw.startswith("```"):
            raw = re.sub(r'^```(?:json)?\n?', '', raw)
            raw = re.sub(r'\n?```$', '', raw)
        data = json.loads(raw)
        logger.info(f"Claude Vision budget: income={data.get('income')}, cats={len(data.get('categories', []))}")
        return data
    except Exception as e:
        logger.warning(f"GPT-4o Vision budget failed: {e}")
        return None


@router.post("/import/{doc_id}")
def import_budget_from_document(
    doc_id: int,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    from app.models.document import Document

    user = _get_user(authorization, db)
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.owner_id != user["id"]:
        raise HTTPException(403, "Not allowed")

    # Step 1: quick text scan to detect document type
    text = ""
    try:
        import pdfplumber
        with pdfplumber.open(doc.file_path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text += t + "\n"
    except Exception:
        pass

    logger.info(f"Budget import doc={doc_id}: file={doc.file_path}, text_len={len(text)}")

    HAUSHALTS_SIGNALS = ["schutzengel", "wohnen", "leben", "sparen", "haushaltsbudget",
                         "haushaltsnettoeinkommen", "neuer ausgabentyp"]
    is_visual_budget = any(sig in text.lower() for sig in HAUSHALTS_SIGNALS)

    budget_data = None

    if not text.strip():
        # Image-based PDF → try column OCR first (fast, free), then Vision as fallback
        logger.info("Image PDF → column OCR")
        budget_data = _ocr_columns(doc.file_path)
        if not budget_data:
            logger.info("Column OCR empty → Claude Vision fallback")
            budget_data = _vision_extract_budget(doc.file_path)
    elif is_visual_budget:
        # Text-based multi-column budget → column crop parser
        logger.info("Text budget → column crop parser")
        budget_data = _extract_budget_by_columns(doc.file_path)
        if not budget_data:
            logger.info("Column parser empty → Claude Vision fallback")
            budget_data = _vision_extract_budget(doc.file_path)

    if not budget_data and text.strip():
        logger.info("Falling back to regex parser")
        budget_data = _extract_budget_from_text(text)

    if not budget_data:
        logger.info("Trying OCR")
        budget_data = _ocr_extract_budget(doc.file_path)

    if not budget_data:
        raise HTTPException(422, f"Could not extract budget from doc {doc_id}. File: {doc.file_path}")

    logger.info(
        f"Budget import doc={doc_id}: income={budget_data.get('income')}, "
        f"cats={len(budget_data.get('categories', []))}, "
        f"items={sum(len(c.get('items', [])) for c in budget_data.get('categories', []))}"
    )

    p = _current_period()
    row = db.query(Budget).filter(Budget.user_id == user["id"], Budget.period == p).first()
    if row:
        row.data = budget_data
    else:
        row = Budget(user_id=user["id"], period=p, data=budget_data)
        db.add(row)
    db.commit()

    return {"ok": True, "budget": budget_data, "period": p}


# ── Transaction category → budget category mapping ────────────────────────────
_TX_TO_BUDGET: dict[str, str] = {
    "rent":      "housing",
    "insurance": "insurance",
    "materials": "living",
    "personnel": "living",
    "software":  "living",
    "expense":   "living",
    "other":     "living",
    "tax":       "living",
}
_INCOME_CATS = {"revenue", "income"}


@router.get("/actual")
def get_budget_actual(
    period: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """Return actual spending per budget category for the given period (YYYY-MM)."""
    user = _get_user(authorization, db)
    p = period or _current_period()

    try:
        year, month = map(int, p.split("-"))
    except ValueError:
        raise HTTPException(400, "period must be YYYY-MM")

    start = datetime(year, month, 1)
    end   = datetime(year + (month == 12), (month % 12) + 1, 1)

    from app.models.financial_event import FinancialEvent

    events = db.query(FinancialEvent).filter(
        FinancialEvent.user_id == user["id"],
        FinancialEvent.event_date >= start,
        FinancialEvent.event_date < end,
    ).all()

    totals: dict[str, float] = {}
    for e in events:
        if (e.category or "") in _INCOME_CATS:
            continue
        bucket = _TX_TO_BUDGET.get(e.category or "", "living")
        totals[bucket] = totals.get(bucket, 0.0) + (e.amount or 0)

    return {cat: round(v, 2) for cat, v in totals.items()}
