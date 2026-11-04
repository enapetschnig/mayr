#!/usr/bin/env python3
"""Gibt die Demo-SQL-Datei aus, alle festen Daten um ganze Wochen bis in die laufende Woche verschoben."""
import re
import sys
from datetime import date, timedelta

BASIS = date(2026, 10, 26)  # Montag der Woche, auf die der Verlauf geschrieben ist
tage = max(0, (date.today() - BASIS).days // 7) * 7


def schieben(m: re.Match) -> str:
    return (date.fromisoformat(m.group(0)) + timedelta(days=tage)).isoformat()


with open(sys.argv[1], encoding="utf-8") as f:
    sys.stdout.write(re.sub(r"\b2026-\d{2}-\d{2}\b", schieben, f.read()))
