# Receipt PDF font

`receipt-inter.ttf` is Inter Regular (weight 400, optical size 14), statically instantiated from Google Fonts' `ofl/inter/Inter[opsz,wght].ttf` on 2026-11-10. Source: https://github.com/google/fonts/tree/main/ofl/inter . It is shipped under the accompanying SIL Open Font License.

Generation used fontTools `instantiateVariableFont(font, {'wght': 400, 'opsz': 14})`. This is a build-time asset, not a Python runtime dependency. The full font is embedded in PDFs (rather than a fontkit glyph subset) to avoid composite-glyph rendering corruption. It includes the naira sign and extended Latin characters used by Nigerian names. Unsupported characters fail PDF generation instead of silently rendering missing glyphs.
