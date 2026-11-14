# אייקון בתלת־ממד (Blender)

הסצנות נבנות בקוד ומרונדרות ב־Blender Cycles: תאורה פיזיקלית, חומרים של פליז, אמייל ונייר.

```bash
uv venv -p 3.11 bvenv && uv pip install -p bvenv/bin/python bpy==4.5.0 fonttools brotli
# להמיר את Frank Ruhl Libre (מ־@fontsource) ל־TTF לתוך תיקיית fonts/
ICON_FONT_DIR=fonts bvenv/bin/python astrolabe.py 96 . astrolabe.png
ICON_FONT_DIR=fonts bvenv/bin/python tearoff.py 96 . tearoff.png
```

- `astrolabe.py`: אצטרולב עברי עשוי פליז ואמייל כחול עם גיליוש, החודשים העבריים חרוטים על השוליים.
- `tearoff.py`: לוח תלישה עם התאריך חתוך בנייר ואור שחר שבוקע מבעד לאותיות.
