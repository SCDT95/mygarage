import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// i18n guards: prevent raw currency and hardcoded locale outside utility files.
//
// Hoisted to a const because a later config object REPLACES a rule's whole
// option list rather than merging into it. The migrated-units block below
// raises `no-restricted-syntax` to 'error' for its files, and if it did not
// spread these two back in, every migrated file would quietly lose both i18n
// guards while looking stricter than the rest of the tree.
const I18N_RESTRICTED = [
  {
    // Matches a template chunk ending in `$` immediately before an
    // interpolation — i.e. `$${amount}`.
    //
    // The previous selector was TemplateLiteral[quasis.0.value.raw=/\$\$/]
    // and never fired: it demanded TWO literal dollars, but `$${amount}`
    // produces a quasi of exactly one (`$`), the second being the start of
    // `${`. It also only inspected quasis.0, so `Total: $${x}` was invisible
    // even to the intended pattern. Verified dead against a probe file.
    //
    // tail=false restricts this to chunks followed by an interpolation, so
    // prose like `costs 5 $` is not flagged.
    selector: 'TemplateElement[tail=false][value.raw=/\\$$/]',
    message:
      'Avoid raw $ in template literals for currency. Use formatCurrency() from utils/formatUtils.ts instead.',
  },
  {
    selector:
      "CallExpression[callee.property.name='toLocaleDateString'][arguments.0.value='en-US']",
    message:
      "Avoid hardcoded 'en-US' locale. Use formatDateForDisplay() from utils/dateUtils.ts instead.",
  },
]

/**
 * Unit gate, ESLint leg: raw conversion constants (plan rulings R3 and R4).
 *
 * PROVENANCE-FREE BY CONSTRUCTION, which is the whole reason this half lives
 * here. `no-restricted-syntax` performs no binding or data-flow analysis, so it
 * cannot tell `unitSystem === 'imperial'` from `theme === 'imperial'`: those
 * are AST-identical apart from a spelling. A numeric literal has no such
 * problem: 1609.34 means metres per mile wherever it appears, so a purely
 * syntactic selector is sound for it. Every `=== 'imperial'` / `=== 'metric'`
 * comparison is handled by `scripts/validate-units.ts` instead.
 *
 * CLEAN-ROOM, not baseline: `bun run lint` uses --max-warnings 0, so there is
 * no way to hold known findings quiet without whole-file exemptions that would
 * then silently accept brand-new violations in those same files. The rule is
 * therefore opt-IN via `files:` below, and that list only ever grows.
 *
 * Proven against a two-sided corpus in `scripts/units_gate_corpus.py`: eight
 * positives it must reject and four negatives it must accept, each pinned by a
 * mutation in `scripts/units_gate_selftest.py`. A gate that never fires is
 * worse than no gate, because it is believed.
 */
const UNIT_CONSTANT_RESTRICTED = [
  {
    // Conversion factors carrying FEWER than four fractional digits, which the
    // precision rule below cannot see. Derived from utils/units.ts's own
    // constant table plus frontend/scripts/inventory.py's output, not from
    // prose: 1609.34 had three independent copies where two rulings said two.
    //
    // 1.8 and 9/5 are deliberately absent: they are indistinguishable from an
    // ordinary ratio, so the Celsius idiom is matched structurally below.
    selector: 'Literal[raw=/^(?:1609\\.34|25\\.4|235\\.214|282\\.481)$/]',
    message:
      'Raw unit-conversion constant. Convert through useUnitFormat() (or makeUnitFormat() outside a component); UnitConverter in utils/units.ts owns every factor.',
  },
  {
    // Any numeric literal with four or more fractional digits. This is the
    // half that catches factors nobody listed: a UI constant (opacity, delay,
    // a line height) never carries this much precision, and every conversion
    // factor in common use does. It is how the gate stays honest about the
    // seventeen inventories in this workstream that turned out to be floors.
    selector: 'Literal[raw=/^\\d+\\.\\d{4,}$/]',
    message:
      'High-precision numeric literal: this is the shape a unit-conversion factor takes. Move it into utils/units.ts or utils/unitAdapters.ts and convert through useUnitFormat().',
  },
  {
    // Celsius to Fahrenheit, spelled `(c * 9) / 5 + 32`. Ruling R7: the idiom
    // appeared in four files and contains no constant distinctive enough to
    // list, so it is matched by shape instead.
    selector:
      "BinaryExpression[operator='+'][right.value=32][left.operator='/'][left.right.value=5]",
    message:
      'Inline Celsius-to-Fahrenheit conversion. Use the temperature adapter from useUnitFormat() so one detection heuristic survives.',
  },
  {
    // The same conversion spelled `c * 1.8 + 32`.
    selector:
      "BinaryExpression[operator='+'][right.value=32][left.operator='*'][left.right.value=1.8]",
    message:
      'Inline Celsius-to-Fahrenheit conversion. Use the temperature adapter from useUnitFormat() so one detection heuristic survives.',
  },
]

/**
 * Files migrated onto the unit adapter in phase 3a, derived from
 * `git log 44c71ed..HEAD` and `frontend/scripts/inventory.py` rather than from
 * any prose list. Phase 3b appends to it as each remaining call site moves, and
 * at the end of 3b it collapses to `src/**` (that is 3b's exit criterion).
 *
 * ★ THREE DELIBERATE OMISSIONS, each with its reason, because a bare omission
 * is indistinguishable from an oversight:
 *
 *   src/utils/units.ts         The centralized converter. It IS the factor
 *                              table (US_GALLONS_TO_LITERS, MILES_TO_KM, and
 *                              the rest), so the constants belong there and
 *                              nowhere else. Already exempted outright further
 *                              down for the i18n guards, same reasoning.
 *   src/utils/unitAdapters.ts  Holds `IN32_TO_MM = 25.4 / 32`, the millimetre
 *                              factor the frontend did not have at all until
 *                              the adapter supplied it. Same role as units.ts.
 *   src/utils/supplyUnits.ts   Holds `L_PER_QUART = 0.946352946`. Decision D8
 *                              exempts supplies from the adapter's conversion
 *                              table, so this factor is correct where it is.
 *
 * NOT omitted, and worth stating because a reader will look for it:
 * `PropaneRecordForm.tsx` keeps `KG_TO_LITERS = 1.968`. That is a physical
 * density, unit-system independent and CORRECT, and the selectors above are
 * written so it is not matched (three fractional digits, and not on the named
 * list). A gate that flagged it would be flagging correct code. The corpus pins
 * that (case E-N1) so a future widening of the precision threshold cannot
 * silently break it.
 */
const UNITS_MIGRATED_FILES = [
  'src/App.tsx',
  'src/components/DEFRecordForm.tsx',
  'src/components/DEFRecordList.tsx',
  'src/components/FuelRecordForm.tsx',
  'src/components/FuelRecordList.tsx',
  'src/components/MapDisplay.tsx',
  'src/components/POICard.tsx',
  'src/components/PropaneRecordForm.tsx',
  'src/components/PropaneRecordList.tsx',
  'src/components/SuppliesUsedTab.tsx',
  'src/components/TireList.tsx',
  'src/components/livelink/VehicleLiveLinkWidget.tsx',
  'src/components/maps/LeafletMap.tsx',
  'src/components/tabs/LiveLinkLiveTab.tsx',
  'src/components/tabs/LiveLinkSessionsTab.tsx',
  'src/components/tabs/LiveLinkTripsTab.tsx',
  'src/components/vehicle-detail/VehicleEditDrawer.tsx',
  'src/contexts/AuthContext.tsx',
  'src/hooks/useGallonStandardSync.ts',
  'src/hooks/useResolvedGallonSync.ts',
  'src/hooks/useUnitFormat.ts',
  'src/hooks/useUnitPreference.ts',
  'src/pages/Analytics.tsx',
  'src/pages/POIFinder.tsx',
  'src/pages/ShopFinder.tsx',
  'src/types/units.ts',
  'src/utils/decimalSafe.ts',
  'src/utils/publicUnitDefaults.ts',
  'src/utils/telemetryUnits.ts',
  'src/utils/unitFormat.ts',
]

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules'],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      'react-hooks/incompatible-library': 'off',
      // eslint-plugin-react-hooks 7.1 introduced React Compiler-derived rules
      // that flag advisory perf/conformance issues across ~40 pre-existing
      // sites. Disabled for this release; tracked for cleanup in a dedicated
      // follow-up so the refactor isn't bundled into a hotfix.
      // TODO: re-enable as 'error' once the call sites are refactored.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The i18n validators' regexes are single-quote-only, so a double-quoted
      // t("key") or label: "English" is invisible to both gates. Zero
      // double-quoted t( exists today by luck; the reskin rewrites ~180 files.
      quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      'no-restricted-syntax': ['warn', ...I18N_RESTRICTED],
    },
  },
  // Unit gate, ESLint leg. Placed after the base block so it overrides that
  // rule, and before the exemption blocks below so an exemption still wins:
  // adding a file to UNITS_MIGRATED_FILES that is also exempted further down
  // would turn the rule off for it, not on.
  {
    files: UNITS_MIGRATED_FILES,
    rules: {
      'no-restricted-syntax': ['error', ...I18N_RESTRICTED, ...UNIT_CONSTANT_RESTRICTED],
    },
  },
  // openapi-typescript emits double-quoted strings and the file is regenerated
  // by CI's check:api-freshness — hand-fixing quote style would fight the
  // generator forever. Silence only `quotes`; every other rule still applies.
  {
    files: ['src/types/api.generated.ts'],
    rules: { quotes: 'off' },
  },
  // Exempt utility files from the i18n lint guards (they ARE the centralized implementation)
  {
    files: ['src/utils/formatUtils.ts', 'src/utils/units.ts', 'src/utils/dateUtils.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // Tests legitimately write a raw `$`: they either mock formatCurrency (and so
  // must produce its output shape) or assert against what that mock rendered.
  // Same reasoning as the utils exemption above — these stand in for the
  // implementation rather than bypassing it.
  {
    files: ['src/**/__tests__/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // Exempt E2E test files from React-specific rules (Playwright, not React)
  {
    files: ['e2e/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
)
