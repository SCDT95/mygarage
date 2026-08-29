/**
 * Unit conversion utilities for imperial/metric conversion.
 *
 * Canonical: SI metric (km, L, kg, m, L/100km, °C, bar, Nm)
 *
 * - All database values are stored in SI metric units (canonical).
 * - Conversion happens at render time for imperial-preferring users.
 * - UnitFormatter.formatX methods accept a METRIC value and convert to imperial for display.
 * - Form submissions should use UnitConverter.toCanonicalMetricString() to convert
 *   user input back to canonical metric before sending to the API.
 *
 * Supported conversions:
 * - Volume: liters ↔ gallons
 * - Fuel Economy: L/100km ↔ MPG
 * - Dimensions: meters ↔ feet
 * - Pressure: kPa ↔ PSI (bar = kPa/100)
 * - Weight: kilograms ↔ pounds
 * - Torque: Nm ↔ lb-ft
 * - Electric: kWh, kW, voltage (no conversion needed, universal)
 *
 * ★ DISTANCE IS NOT ON THAT LIST ANY MORE, and its absence is a statement.
 * `UNIT_ADAPTERS` in `utils/unitAdapters.ts` is where km ↔ mi happens now, off
 * the resolved `units.distance` token; plan 3b task 6 migrated the last call
 * site and deleted `formatDistance`, `getDistanceUnit`, `kmToMiles` and
 * `milesToKm`. The factor `MILES_TO_KM` stays here because that table is built
 * from it.
 */

// TYPE-ONLY, and it has to stay that way. `utils/unitAdapters.ts` imports
// `UnitConverter` and builds its adapter table at module scope, so a runtime
// import back from here would form a cycle whose evaluation order decides
// whether that table reads `UnitConverter` before the class binding leaves its
// temporal dead zone. `import type` is erased, so no cycle exists at runtime.
import type { UnitSet } from '@/types/units';

export type UnitSystem = 'imperial' | 'metric';
export type GallonStandard = 'us' | 'uk';

/**
 * Subscribers to `UnitConverter`'s ACTIVE gallon flavour.
 *
 * ★ Separate from `gallonStandardStore` on purpose, and the distinction is the
 * whole reason this exists. That store owns the BROWSER's value: it persists to
 * localStorage and holds either an anonymous client's own choice or the
 * instance default. `useResolvedGallonSync` applies the signed-in ACCOUNT's
 * flavour to the converter and must not write that key, so the store's
 * notification path cannot carry the change. This one can, and it fires for
 * every writer of the static rather than only for the store's.
 */
const converterGallonListeners = new Set<() => void>();

/**
 * Subscribe to changes in the converter's active gallon flavour.
 *
 * @param listener Called after the flavour actually changes.
 * @returns The unsubscribe function.
 */
export function subscribeToConverterGallon(listener: () => void): () => void {
  converterGallonListeners.add(listener);
  return () => {
    converterGallonListeners.delete(listener);
  };
}

/**
 * The converter's active gallon flavour, as a `useSyncExternalStore` snapshot.
 *
 * @returns 'us' or 'uk'. A primitive, so the snapshot is stable by value.
 */
export function getConverterGallon(): GallonStandard {
  return UnitConverter.getGallonStandard();
}

/** Server snapshot: nothing has resolved a flavour during prerender. */
export function getConverterGallonServerSnapshot(): GallonStandard {
  return 'us';
}

type Numeric = number | null | undefined;

/**
 * Unit conversion between imperial and metric systems.
 *
 * These bidirectional helpers keep their imperial-named signatures
 * (gallonsToLiters, litersToGallons, etc.) — they're utility functions used
 * in both directions, not tied to canonical storage. The distance pair that
 * used to be named here is gone; see the DISTANCE CONVERSIONS marker below.
 */
export class UnitConverter {
  // Conversion factors (imperial to metric).
  //
  // The `readonly` factors are PUBLIC so `utils/unitAdapters.ts` can build its
  // per-token table from them instead of declaring a second copy, exactly as
  // `backend/app/utils/unit_adapters.py` imports them from the backend's
  // `UnitConverter`. A duplicated factor table is the defect this workstream
  // keeps finding (`telemetryUnits.ts` has four of them); one more would be a
  // fifth. The two MUTABLE fields below stay private on purpose: they are
  // process-global state driven by the instance gallon setting, and an adapter
  // resolved from a user's own `UnitSet` must never read them.
  //
  // ★ THE ONLY PLACE IN THIS FILE THE RAW-CONSTANT RULE IS OFF, and it is these
  // twelve lines rather than the whole module (plan 3b, task 2). Until now
  // `eslint.config.js` silenced `no-restricted-syntax` for `utils/units.ts`
  // outright, in a block meant for the i18n guards, and the entry in
  // `UNITS_CONSTANT_EXEMPT` beside `unitAdapters.ts` and `supplyUnits.ts` was
  // doing nothing: the later block won by ordering. Removing that whole-file
  // silence turns up twelve findings, and ten of them are right here. This is
  // the table the rule's own message tells every other file to move its
  // constants INTO, so it is exempt for a reason nothing else in this module
  // can borrow. The eleventh (a `c * 9 / 5 + 32` idiom) and the twelfth (a
  // fourteenth copy of `1.60934`) were not in this table at all, and both are
  // now gone rather than exempt.
  /* eslint-disable no-restricted-syntax -- this IS the factor table */
  static readonly US_GALLONS_TO_LITERS = 3.78541;
  static readonly UK_GALLONS_TO_LITERS = 4.54609;
  private static gallonsToLitersFactor = UnitConverter.US_GALLONS_TO_LITERS;
  static readonly MILES_TO_KM = 1.60934;
  static readonly FEET_TO_METERS = 0.3048;
  private static readonly PSI_TO_BAR = 0.0689476;
  static readonly PSI_TO_KPA = 6.89476;
  static readonly LBS_TO_KG = 0.453592;
  static readonly LBFT_TO_NM = 1.35582;
  static readonly US_MPG_TO_L100KM = 235.214;
  static readonly UK_MPG_TO_L100KM = 282.481;
  private static mpgToL100kmFactor = UnitConverter.US_MPG_TO_L100KM;
  /* eslint-enable no-restricted-syntax */

  // ── Resolved-set dispatch ────────────────────────────────────────────────
  //
  // The two mutable fields above follow the INSTANCE gallon setting, which is
  // not the same thing as the client's own units: phase 1 gave every account a
  // `resolved_units` set, so a user resolving `gal_uk` on a US-default instance
  // must get the imperial gallon regardless of what the instance holds. The
  // maps below are how a resolved token becomes a factor.
  //
  // They ARE a second dispatch of a decision `utils/unitAdapters.ts` also
  // makes, and duplicated unit knowledge is exactly what this workstream keeps
  // finding (defect L1 was a hardcoded `3.78541` under a comment claiming it
  // mirrored this class). Two things keep them honest: the `Record<...>` types
  // fail to compile if the API schema adds a token, and
  // `utils/__tests__/unitFactorParity.test.ts` asserts every entry equals what
  // `UNIT_ADAPTERS` converts. The duplication exists only because the import
  // cycle above forbids reading the adapter table directly; collapsing it is a
  // 3b job, once `unitAdapters` no longer depends on this module.

  /** Litres in one unit of each volume token a resolved set can name. */
  static readonly LITERS_PER_VOLUME_UNIT: Readonly<Record<UnitSet['volume'], number>> = {
    L: 1,
    gal_us: UnitConverter.US_GALLONS_TO_LITERS,
    gal_uk: UnitConverter.UK_GALLONS_TO_LITERS,
  };

  /** Kilograms in one unit of each mass token a resolved set can name. */
  static readonly KG_PER_MASS_UNIT: Readonly<Record<UnitSet['mass'], number>> = {
    kg: 1,
    lb: UnitConverter.LBS_TO_KG,
  };

  /**
   * Litres in the gallon a LITRE primary pairs with under show-both (spec D4b).
   *
   * `L` cannot state its own gallon flavour, so the set carries it separately.
   */
  static readonly LITERS_PER_SECONDARY_GALLON: Readonly<
    Record<UnitSet['secondary_gallon'], number>
  > = {
    us: UnitConverter.US_GALLONS_TO_LITERS,
    uk: UnitConverter.UK_GALLONS_TO_LITERS,
  };

  /**
   * Select US or UK imperial gallon (also updates MPG conversion).
   *
   * Notifies `subscribeToConverterGallon` when the value actually moves, so a
   * mounted component can repaint. Without that, writing these statics changes
   * every subsequent conversion and repaints nothing, which is the failure
   * `gallonStandardStore`'s docstring records: a component that had already
   * mounted kept showing US gallons after the setting resolved.
   */
  static setGallonStandard(standard: GallonStandard): void {
    const changed = standard !== UnitConverter.getGallonStandard();
    if (standard === 'uk') {
      this.gallonsToLitersFactor = this.UK_GALLONS_TO_LITERS;
      this.mpgToL100kmFactor = this.UK_MPG_TO_L100KM;
    } else {
      this.gallonsToLitersFactor = this.US_GALLONS_TO_LITERS;
      this.mpgToL100kmFactor = this.US_MPG_TO_L100KM;
    }
    if (changed) {
      for (const listener of converterGallonListeners) listener();
    }
  }

  static getGallonStandard(): GallonStandard {
    return this.gallonsToLitersFactor === this.UK_GALLONS_TO_LITERS ? 'uk' : 'us';
  }

  /**
   * Round result to specified decimal places.
   */
  private static roundResult(value: number | null, decimals: number = 2): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return parseFloat(value.toFixed(decimals));
  }

  // ========== VOLUME CONVERSIONS ==========

  /**
   * Convert gallons to liters (uses active US/UK gallon standard).
   */
  static gallonsToLiters(gallons: Numeric): number | null {
    if (gallons === null || gallons === undefined) {
      return null;
    }
    return this.roundResult(gallons * this.gallonsToLitersFactor);
  }

  /**
   * Convert liters to gallons (uses active US/UK gallon standard).
   */
  static litersToGallons(liters: Numeric): number | null {
    if (liters === null || liters === undefined) {
      return null;
    }
    return this.roundResult(liters / this.gallonsToLitersFactor);
  }

  /**
   * Convert canonical litres into the volume unit a resolved set names.
   *
   * The resolved-set counterpart of `litersToGallons`, and the reason the
   * flavour is right for a `gal_uk` user on a US-default instance. A litre set
   * returns the value untouched rather than passing it through `roundResult`:
   * this feeds form fields, and re-rounding a stored value a metric user never
   * edited would rewrite it on save.
   *
   * @param liters Canonical litres.
   * @param units The client's resolved unit set.
   * @returns The value in `units.volume`, or null when there is none.
   */
  static litersToVolumeUnit(liters: Numeric, units: UnitSet): number | null {
    if (liters === null || liters === undefined) {
      return null;
    }
    if (units.volume === 'L') {
      return liters;
    }
    return this.roundResult(liters / UnitConverter.LITERS_PER_VOLUME_UNIT[units.volume]);
  }

  // ========== DISTANCE CONVERSIONS ==========
  //
  // ★ There are none left here, and the gap is deliberate rather than an
  // oversight. `milesToKm` and `kmToMiles` were the raw pair a call site
  // reached for when it wanted to make the imperial/metric decision itself,
  // and plan 3b task 6 migrated the last two such sites (Calendar's
  // remaining-distance badge and the DEF card's estimate) onto the resolved
  // `units.distance` adapter. Both then had zero callers. Deleting them makes
  // "convert this to miles regardless of what the reader chose" inexpressible,
  // which is the same call R8 made one module over for the three
  // `toCanonical*` helpers. `MILES_TO_KM` stays: `UNIT_ADAPTERS` builds the
  // `mi` and `mph` adapters from it, which is the one place the conversion
  // should happen.

  // ========== FUEL ECONOMY CONVERSIONS ==========

  /**
   * Convert MPG to L/100km (US 235.214 or UK 282.481 per active gallon standard).
   */
  static mpgToL100km(mpg: Numeric): number | null {
    if (mpg === null || mpg === undefined || mpg === 0) {
      return null;
    }
    return this.roundResult(this.mpgToL100kmFactor / mpg, 1);
  }

  /**
   * Convert L/100km to MPG (US 235.214 or UK 282.481 per active gallon standard).
   */
  static l100kmToMpg(l100km: Numeric): number | null {
    if (l100km === null || l100km === undefined || l100km === 0) {
      return null;
    }
    return this.roundResult(this.mpgToL100kmFactor / l100km, 1);
  }

  /**
   * Convert L/100km to MPG.
   *
   * Alias of l100kmToMpg, named for the new metric-canonical
   * convention so callers can read top-down: "L per 100km to MPG".
   */
  static lPer100kmToMpg(value: Numeric): number | null {
    return this.l100kmToMpg(value);
  }

  // ========== DIMENSION CONVERSIONS ==========

  /**
   * Convert feet to meters.
   */
  static feetToMeters(feet: Numeric): number | null {
    if (feet === null || feet === undefined) {
      return null;
    }
    return this.roundResult(feet * this.FEET_TO_METERS);
  }

  /**
   * Convert meters to feet.
   */
  static metersToFeet(meters: Numeric): number | null {
    if (meters === null || meters === undefined) {
      return null;
    }
    return this.roundResult(meters / this.FEET_TO_METERS);
  }

  // ========== TEMPERATURE CONVERSIONS ==========
  //
  // Gone, with `formatTemperature`, the only thing that called either of them.
  // `celsiusToFahrenheit` held the `c * 9 / 5 + 32` idiom the ESLint leg
  // matches STRUCTURALLY (there is no constant in it distinctive enough to
  // list), so it was one of the twelve findings the whole-file exemption was
  // covering. `UNIT_ADAPTERS.f` is the live implementation and always was the
  // one with the offset spelled out; a dead second copy of a conversion is the
  // shape defect L1 took.

  // ========== PRESSURE CONVERSIONS ==========

  /**
   * Convert PSI to bar.
   */
  static psiToBar(psi: Numeric): number | null {
    if (psi === null || psi === undefined) {
      return null;
    }
    return this.roundResult(psi * this.PSI_TO_BAR);
  }

  /**
   * Convert bar to PSI.
   */
  static barToPsi(bar: Numeric): number | null {
    if (bar === null || bar === undefined) {
      return null;
    }
    return this.roundResult(bar / this.PSI_TO_BAR);
  }

  /**
   * Convert PSI to kPa.
   */
  static psiToKPa(psi: Numeric): number | null {
    if (psi === null || psi === undefined) {
      return null;
    }
    return this.roundResult(psi * this.PSI_TO_KPA);
  }

  /**
   * Convert kPa to PSI.
   */
  static kPaToPsi(kPa: Numeric): number | null {
    if (kPa === null || kPa === undefined) {
      return null;
    }
    return this.roundResult(kPa / this.PSI_TO_KPA);
  }

  // ========== WEIGHT CONVERSIONS ==========

  /**
   * Convert pounds to kilograms.
   */
  static lbsToKg(lbs: Numeric): number | null {
    if (lbs === null || lbs === undefined) {
      return null;
    }
    return this.roundResult(lbs * this.LBS_TO_KG);
  }

  /**
   * Convert kilograms to pounds.
   */
  static kgToLbs(kg: Numeric): number | null {
    if (kg === null || kg === undefined) {
      return null;
    }
    return this.roundResult(kg / this.LBS_TO_KG);
  }

  // ========== TORQUE CONVERSIONS ==========

  /**
   * Convert lb-ft to Newton-meters.
   */
  static lbftToNm(lbft: Numeric): number | null {
    if (lbft === null || lbft === undefined) {
      return null;
    }
    return this.roundResult(lbft * this.LBFT_TO_NM);
  }

  /**
   * Convert Newton-meters to lb-ft.
   */
  static nmToLbft(nm: Numeric): number | null {
    if (nm === null || nm === undefined) {
      return null;
    }
    return this.roundResult(nm / this.LBFT_TO_NM);
  }

  // ========== CANONICAL CONVERSION (FORM SUBMIT) ==========

  /**
   * Convert a user-entered value in `fromUnit` to its canonical SI metric
   * representation, returned as a string to preserve precision through the
   * API boundary (avoids parseFloat round-trip loss).
   *
   * Mirrors the backend's `to_canonical_decimal()` helper.
   *
   * Pass-through (returns the input as a string, untouched) when fromUnit
   * is already the canonical unit. For imperial units, performs an exact
   * conversion using string-friendly arithmetic and returns a string with
   * sufficient precision (12 significant digits) to round-trip cleanly.
   *
   * Supported `fromUnit` values:
   *   km, mi, L, gal, kg, lb, m, ft, C, F, kPa, PSI, Nm, lbft, L/100km, MPG
   */
  static toCanonicalMetricString(
    value: number | string | null | undefined,
    fromUnit:
      | 'km'
      | 'mi'
      | 'L'
      | 'gal'
      | 'kg'
      | 'lb'
      | 'm'
      | 'ft'
      | 'C'
      | 'F'
      | 'kPa'
      | 'PSI'
      | 'Nm'
      | 'lbft'
      | 'L/100km'
      | 'MPG'
  ): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const trimmed = typeof value === 'string' ? value.trim() : value;
    if (trimmed === '') return null;

    const num = typeof trimmed === 'string' ? parseFloat(trimmed) : trimmed;
    if (isNaN(num)) return null;

    // Canonical pass-through: preserve original string form (no parseFloat loss).
    const canonicalUnits = new Set(['km', 'L', 'kg', 'm', 'C', 'kPa', 'Nm', 'L/100km']);
    if (canonicalUnits.has(fromUnit)) {
      return typeof trimmed === 'string' ? trimmed : String(trimmed);
    }

    // Imperial → metric
    let result: number;
    switch (fromUnit) {
      case 'mi':
        result = num * UnitConverter.MILES_TO_KM;
        break;
      case 'gal':
        result = num * UnitConverter.gallonsToLitersFactor;
        break;
      case 'lb':
        result = num * UnitConverter.LBS_TO_KG;
        break;
      case 'ft':
        result = num * UnitConverter.FEET_TO_METERS;
        break;
      case 'F':
        result = (num - 32) * 5 / 9;
        break;
      case 'PSI':
        result = num * UnitConverter.PSI_TO_KPA;
        break;
      case 'lbft':
        result = num * UnitConverter.LBFT_TO_NM;
        break;
      case 'MPG':
        if (num === 0) return null;
        result = UnitConverter.mpgToL100kmFactor / num;
        break;
      default:
        return null;
    }

    // 12 significant digits is enough to losslessly round-trip the conversion
    // factors used here while still being a clean decimal string. Strip
    // trailing zeros after the decimal point (but keep integer trailing zeros).
    const precise = result.toPrecision(12);
    if (!precise.includes('.')) return precise;
    return precise.replace(/\.?0+$/, '');
  }
}

/**
 * Display formatting with unit labels.
 *
 * All format* methods accept the value in canonical SI metric form.
 * For imperial-preferring users, the metric value is converted at render time.
 *
 * ★ THE REMAINING `UnitSystem` METHODS ARE EXEMPT WITH AN EXPIRY, and this is
 * the one place the scheme is written down (plan 3b, ruling R2). How many
 * remain is deliberately not written here: `--derived` prints the set and
 * `unitsBinaryApiSurface.test.ts` pins it, and a count in prose goes stale the
 * next time one retires.
 *
 * Each of them carries exactly one `system === '...'` comparison, which is why
 * the units gate derives the same names from this class that its comparison leg
 * counts in this file. The comparison is not the defect: the parameter IS the
 * decision, already made by the caller. The defect is that `system` is
 * collapsed from VOLUME (spec D8, `useUnitPreference.ts:98`), so a
 * `{volume:'L', distance:'mi'}` user reached `formatDistance` as `'metric'` and
 * read kilometres. That is a call-site decision, and the gate reports every one
 * of these call sites under its `formatter-binary` leg.
 *
 * So each comparison carries `// units-exempt:` naming who owns its call sites.
 * A reason-bearing pragma silences anything (`EXEMPT_PRAGMA` in `validate-units.ts`), so the
 * exemptions do not rest on that prose:
 * `utils/__tests__/unitsBinaryApiSurface.test.ts` derives this surface from the
 * file and fails when a method outlives its last production caller. Seven
 * methods failed it at t=0 and are gone; `getWeightUnit` followed the moment
 * task 3 moved `PropaneRecordForm` onto the mass adapter; and `formatDistance`
 * and `getDistanceUnit` followed task 6's migration of their twenty-seven call
 * sites. Each time the test failed first, exactly as designed. The same holds
 * for every method still below.
 *
 * The resolved-set replacement already exists for all ten quantities:
 * `useUnitFormat()` in a component, `makeUnitFormat(units)` outside one.
 */
export class UnitFormatter {
  /**
   * Format volume with appropriate unit label.
   *
   * Takes the client's resolved `UnitSet` rather than a binary system: the
   * gallon flavour belongs to the user (`resolved_units.volume`), not to the
   * instance-wide setting `UnitConverter`'s mutable factor follows.
   *
   * @param liters - Value in liters (canonical metric)
   * @param units - The client's resolved unit set
   * @param showBoth - Show both units (e.g., "94.6 L (25 gal)")
   */
  static formatVolume(liters: Numeric, units: UnitSet, showBoth: boolean = false): string {
    if (liters === null || liters === undefined) {
      return 'N/A';
    }

    const litersNum = typeof liters === 'string' ? parseFloat(liters) : liters;
    if (isNaN(litersNum)) return 'N/A';

    if (units.volume === 'L') {
      const primary = `${litersNum.toFixed(2)} L`;
      if (showBoth) {
        // D4b: a litre primary's counterpart gallon comes from the set, since
        // 'L' cannot state a flavour of its own.
        const gallons = litersNum / UnitConverter.LITERS_PER_SECONDARY_GALLON[units.secondary_gallon];
        return `${primary} (${gallons.toFixed(2)} gal)`;
      }
      return primary;
    } else {
      const gallons = UnitConverter.litersToVolumeUnit(litersNum, units);
      const primary = `${gallons?.toFixed(2)} gal`;
      if (showBoth) {
        return `${primary} (${litersNum.toFixed(2)} L)`;
      }
      return primary;
    }
  }

  /**
   * Format fuel economy with appropriate unit label.
   *
   * @param lPer100km - Value in L/100km (canonical metric)
   * @param system - Target unit system
   * @param showBoth - Show both units
   */
  static formatFuelEconomy(lPer100km: Numeric, system: UnitSystem, showBoth: boolean = false): string {
    if (lPer100km === null || lPer100km === undefined) {
      return 'N/A';
    }

    const lNum = typeof lPer100km === 'string' ? parseFloat(lPer100km) : lPer100km;
    if (isNaN(lNum) || lNum === 0) return 'N/A';

    // units-exempt: binary display API; its 18 call sites are task 6's, and unitsBinaryApiSurface.test.ts deletes this method when the last one goes
    if (system === 'metric') {
      const primary = `${lNum.toFixed(1)} L/100km`;
      if (showBoth) {
        const mpg = UnitConverter.l100kmToMpg(lNum);
        return `${primary} (${mpg?.toFixed(1)} MPG)`;
      }
      return primary;
    } else {
      const mpg = UnitConverter.l100kmToMpg(lNum);
      const primary = `${mpg?.toFixed(1)} MPG`;
      if (showBoth) {
        return `${primary} (${lNum.toFixed(1)} L/100km)`;
      }
      return primary;
    }
  }

  /**
   * Format engine-hour fuel rate (the hours analog of fuel economy) with
   * appropriate unit label.
   *
   * Engine hours are dimensionless — only the volume side converts between
   * systems. Mirrors formatFuelEconomy's N/A-guard and showBoth shape; uses
   * the active gallon standard, which `useResolvedGallonSync` resolves from the
   * client's own units rather than the instance setting.
   *
   * @param lPerHr - Value in L/hr (canonical metric)
   * @param system - Target unit system
   * @param showBoth - Show both units (e.g., "3.20 L/hr (0.85 GPH)")
   */
  static formatFuelRate(lPerHr: Numeric, system: UnitSystem, showBoth: boolean = false): string {
    if (lPerHr === null || lPerHr === undefined) {
      return 'N/A';
    }

    const lNum = typeof lPerHr === 'string' ? parseFloat(lPerHr) : lPerHr;
    if (isNaN(lNum) || lNum === 0) return 'N/A';

    // Was a fourth, separately-rounded spelling of the US gallon
    // (`3.785411784`) beside a duplicate of the UK one. The dispatch is the
    // same table every other gallon decision now uses, and the active standard
    // is this CLIENT's, not the instance's (`useResolvedGallonSync`).
    const LITERS_PER_GALLON =
      UnitConverter.LITERS_PER_SECONDARY_GALLON[UnitConverter.getGallonStandard()];

    // units-exempt: binary display API; its 4 call sites are task 6's, and unitsBinaryApiSurface.test.ts deletes this method when the last one goes
    if (system === 'metric') {
      const primary = `${lNum.toFixed(2)} L/hr`;
      if (showBoth) {
        const galPerHr = lNum / LITERS_PER_GALLON;
        return `${primary} (${galPerHr.toFixed(2)} GPH)`;
      }
      return primary;
    } else {
      const galPerHr = lNum / LITERS_PER_GALLON;
      const primary = `${galPerHr.toFixed(2)} GPH`;
      if (showBoth) {
        return `${primary} (${lNum.toFixed(2)} L/hr)`;
      }
      return primary;
    }
  }

  /**
   * Get volume unit label for input placeholders.
   *
   * @param units - The client's resolved unit set
   */
  static getVolumeUnit(units: UnitSet): string {
    return units.volume === 'L' ? 'L' : 'gal';
  }

  /**
   * Get fuel economy unit label for input placeholders.
   */
  static getFuelEconomyUnit(system: UnitSystem): string {
    // units-exempt: label for the same binary decision; 3 call sites, task 6, expiry enforced by unitsBinaryApiSurface.test.ts
    return system === 'imperial' ? 'MPG' : 'L/100km';
  }

  /**
   * Get fuel-rate (engine-hours economy) unit label for input placeholders.
   */
  static getFuelRateUnit(system: UnitSystem): string {
    // units-exempt: label for the same binary decision; 4 call sites, task 6, expiry enforced by unitsBinaryApiSurface.test.ts
    return system === 'imperial' ? 'GPH' : 'L/hr';
  }

  /**
   * Get the mass unit label a resolved set names.
   *
   * It replaced a binary `getWeightUnit(system)`, deleted by plan 3b task 3
   * when `PropaneRecordForm` moved onto the mass adapter and left it with no
   * production caller. That method also answered `'lbs'` where this one, the
   * `lb` adapter and the backend's table all answer `'lb'`. It exists because
   * `priceToDisplay`'s `per_weight` denominator reads `units.mass`: the label
   * beside that field has to name the same unit. `system` cannot, being
   * D8-collapsed from VOLUME, so it answers "kg" for a user who chose pounds.
   *
   * @param units - The client's resolved unit set
   */
  static getMassUnit(units: UnitSet): string {
    return units.mass === 'kg' ? 'kg' : 'lb';
  }

  // ========== SUMMARY CARD HELPERS ==========
  // All accept metric-base values and convert at render time.

  /**
   * Format a volume total for summary cards.
   * Input: liters (canonical metric). Output: "47.3 L total" or "12.5 gal total".
   */
  /**
   * Volume at total-precision (1 decimal) WITHOUT the trailing "total".
   *
   * Callers that want the number but not the word used to do
   * `formatVolumeTotal(...).replace(' total', '')`. That substring hack breaks
   * silently the moment this file is localized, so it has its own method.
   */
  static formatVolumeShort(liters: number, units: UnitSet): string {
    if (units.volume === 'L') {
      return `${liters.toFixed(1)} L`;
    }
    const gallons = UnitConverter.litersToVolumeUnit(liters, units);
    return `${(gallons ?? 0).toFixed(1)} gal`;
  }

  static formatVolumeTotal(liters: number, units: UnitSet): string {
    return `${UnitFormatter.formatVolumeShort(liters, units)} total`;
  }

  /**
   * Format cost per volume for summary cards.
   * Input: cost per liter (canonical metric $/L). Output: "$0.91" or "$3.45".
   */
  static formatCostPerVolume(
    costPerLiter: number,
    units: UnitSet,
    currencyCode: string = 'USD',
    locale: string = 'en-US'
  ): string {
    // Defect L1's second half: this line multiplied by a hardcoded 3.78541, so
    // a UK user's card read about 20 percent low while the volume column beside
    // it converted through the dynamic factor. $/L x litres-per-unit = $/unit,
    // and a litre set's factor is 1, so the metric pass-through is the same
    // expression rather than a branch.
    const value = costPerLiter * UnitConverter.LITERS_PER_VOLUME_UNIT[units.volume];
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  /**
   * Get the label for cost-per-volume cards.
   * Returns "Avg Cost/L" or "Avg Cost/gal".
   */
  static getCostPerVolumeLabel(units: UnitSet): string {
    return `Avg Cost/${UnitFormatter.getVolumeUnit(units)}`;
  }

  /**
   * Format cost per distance for summary cards.
   * Input: cost per kilometer (canonical metric $/km).
   * Metric uses $/100 km (standard convention), imperial uses $/1,000 mi.
   */
  static formatCostPerDistance(
    costPerKm: number,
    system: UnitSystem,
    currencyCode: string = 'USD',
    locale: string = 'en-US'
  ): string {
    // The mile factor was spelled `1.60934` here, a fourteenth copy of a
    // constant this class declares two hundred lines up, and the whole-file
    // ESLint exemption is why nobody saw it. The 1000 and the 100 are not
    // conversion factors: they are how many of the user's distance units the
    // cost is quoted over, and `getCostPerDistanceLabel` names them in prose.
    // units-exempt: binary display API; 3 call sites in FuelRecordList and Analytics are task 6's, expiry enforced by unitsBinaryApiSurface.test.ts
    const value = system === 'imperial'
      ? costPerKm * UnitConverter.MILES_TO_KM * 1000  // $/km -> $/1000 mi
      : costPerKm * 100;                              // $/km -> $/100 km
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  /**
   * Get the label for cost-per-distance cards.
   * Returns "Cost/1k Miles" or "Cost/100 km".
   */
  static getCostPerDistanceLabel(system: UnitSystem): string {
    // units-exempt: label for the same binary decision; 3 call sites, task 6, expiry enforced by unitsBinaryApiSurface.test.ts
    return system === 'imperial' ? 'Cost/1k Miles' : 'Cost/100 km';
  }

  // ★ `formatVolumePerDistance` and `getVolumePerDistanceLabel` USED TO BE HERE,
  // and where they went is the point rather than a filing detail. Both derived
  // BOTH halves of a compound unit from `units.volume`, so a
  // `{volume:'L', distance:'mi'}` account read a per-kilometre rate beside an
  // odometer column reading miles. The first one's comment promised "Distance
  // migrates in 3b, per file, with its neighbours"; plan 3b task 6 kept that
  // promise, and they now live in `utils/unitFormat.ts` where `adapterFor` can
  // supply BOTH halves from the resolved set. They could not stay here: this
  // module cannot import the adapter table (see the `import type` note at the
  // top), so the distance half would have needed a second dispatch beside
  // `LITERS_PER_VOLUME_UNIT`, and a second copy of a unit decision is the
  // defect this workstream keeps unpicking.
}

/**
 * Detect user's preferred unit system from timezone.
 *
 * Smart default: US timezones → imperial, others → metric
 */
export function detectUnitSystemFromTimezone(): UnitSystem {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // US timezones (partial list, can be extended)
  const usTimezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Anchorage',
    'America/Adak',
    'Pacific/Honolulu',
    'America/Detroit',
    'America/Indiana/Indianapolis',
    'America/Kentucky/Louisville',
    'America/Boise',
  ];

  // Check if timezone starts with 'America/' (broader US/Americas detection)
  const isAmericas = timezone.startsWith('America/');
  const isUSTimezone = usTimezones.includes(timezone);

  // US timezones default to imperial, all others default to metric
  return (isUSTimezone || isAmericas) ? 'imperial' : 'metric';
}
