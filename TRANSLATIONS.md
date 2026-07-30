# Translation Status

MyGarage supports multiple languages through community contributions.

## Overview

| | Language | Code | Progress | Keys |
|---|----------|------|----------|------|
| 🇺🇸 | English | `en` | `████████████████████` 100% | 3253/3253 |
| 🇩🇪 | German | `de` | `███████████████████░` 94% | 3059/3253 |
| 🇫🇷 | French | `fr` | `███████████████████░` 94% | 3044/3253 |
| 🇷🇺 | Russian | `ru` | `█████████░░░░░░░░░░░` 44% | 1419/3253 |
| 🇺🇦 | Ukrainian | `uk` | `█████████░░░░░░░░░░░` 44% | 1418/3253 |
| 🇵🇱 | Polish | `pl` | `█████████░░░░░░░░░░░` 43% | 1405/3253 |
| 🇧🇷 | Brazilian Portuguese | `pt-BR` | `█████████░░░░░░░░░░░` 43% | 1405/3253 |

**Overall: 60%** average completion across 6 translated languages — English is the source (100%)

---

## Contributing Translations

We welcome translation contributions! Here's how to help:

1. **Fork** the repository
2. Translation files are in `frontend/public/locales/{language_code}/`
3. English source files (the reference) are in `frontend/src/locales/en/`
4. Each namespace has its own JSON file: `common.json`, `nav.json`, `settings.json`, `vehicles.json`, `forms.json`, `analytics.json`
5. Copy the English file structure and translate the values (keep the keys the same)
6. Preserve `{{variable}}` interpolation placeholders exactly as they appear
7. Run `bun run validate:translations` to check your work
8. Submit a **Pull Request**

### Adding a New Language

1. Create a new directory under `frontend/public/locales/` with the [ISO 639-1 code](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes) (e.g., `fr` for French)
2. Copy all JSON files from `frontend/src/locales/en/` into your new directory
3. Translate the values
4. Register the language in all three allowlists — it is **not** picked up
   automatically, and a directory that isn't registered is never loaded:
   - `frontend/src/constants/i18n.ts` — `SUPPORTED_LANGUAGES` (and `languageToLocale`)
   - `frontend/src/i18n.ts` — `supportedLngs`
   - `backend/app/constants/i18n.py` — `SUPPORTED_LANGUAGES`
5. Run `bun run validate:translations` — it fails on an unregistered directory

See [TRANSLATING.md](TRANSLATING.md) for the full guide.

---

## Contributors

Thank you to everyone who has contributed translations!

| Contributor | Languages |
|-------------|-----------|
| [Antonio (f0rZzZ)](https://github.com/f0rZzZ) | 🇵🇱 Polish, 🇷🇺 Russian, 🇺🇦 Ukrainian |
| [FabioCastilho](https://github.com/FabioCastilho) | 🇧🇷 Brazilian Portuguese |
| [roondar](https://github.com/roondar) | 🇫🇷 French |
| [SCDT95](https://github.com/SCDT95) | 🇩🇪 German |
