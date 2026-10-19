# Real card fixtures (private)

Put photos or screenshots of real cards here to check that the app's decoder reads them.
Everything in this folder except this README is git-ignored, so card numbers never reach the public repo.

Add a `fixtures.json` listing each image and what it should decode to:

```json
[
  { "file": "tesco.jpg", "format": "ean13", "code": "4006381333931" },
  { "file": "coupon.png", "format": "qr", "code": "https://example.com/c/8812" }
]
```

`format` is one of: `qr`, `ean13`, `ean8`, `upc_a`, `code128`, `code39`, `pdf417`, `aztec`, `datamatrix`.
Then run `npm test` in `web/`.
