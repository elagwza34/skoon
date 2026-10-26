/**
 * Pure rules shared by the future product-configuration write services.
 *
 * These rules deliberately do not query or mutate the database.  The database
 * service must collect dependencies in the same transaction that performs a
 * permanent delete, then call `assertConfigurationCanBeDeleted` immediately
 * before the delete.  Keeping the policy pure lets us test the accounting
 * rules without connecting to a production database.
 */

export class ProductConfigurationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
    this.name = 'ProductConfigurationError'
  }
}

export interface DeleteDependency {
  /** Human-readable Arabic relation, such as "منتجات" or "سجل طلبات". */
  label: string
  count: number
  /** Names are optional and must be populated only after authorization. */
  names?: string[]
}

/**
 * Throws the API-compatible 409 used for permanent-delete protection.
 * It never exposes more than five authorized names, so a broad dependency
 * query cannot accidentally disclose an entire branch catalogue.
 */
export function assertConfigurationCanBeDeleted(
  subject: 'المتغير' | 'القيمة' | 'الوحدة' | 'المتغير البيعي',
  dependencies: readonly DeleteDependency[],
): void {
  const relevant = dependencies.filter((dependency) => dependency.count > 0)
  if (relevant.length === 0) return

  const affected = relevant.reduce((sum, dependency) => sum + dependency.count, 0)
  const names = relevant
    .flatMap((dependency) => dependency.names ?? [])
    .slice(0, 5)
  const nameSuffix = names.length > 0 ? ` المنتجات المرتبطة: ${names.join('، ')}.` : ''
  const relationSuffix = relevant.map((dependency) => `${dependency.label} (${dependency.count})`).join('، ')

  throw new ProductConfigurationError(
    `لا يمكن حذف ${subject} لأنه مرتبط بـ ${affected} سجلًا قائمًا (${relationSuffix}). يمكنك تعطيله أو أرشفته بدلًا من حذفه.${nameSuffix}`,
    409,
  )
}

export interface ExactQuantity {
  numerator: bigint
  denominator: bigint
  /** Stable, reduced fraction used for equality/duplicate checks. */
  canonical: string
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left
  let b = right < 0n ? -right : right
  while (b !== 0n) [a, b] = [b, a % b]
  return a
}

/** Parses a positive decimal or fraction without JavaScript floating point. */
export function parseExactQuantity(input: string): ExactQuantity {
  const value = input.trim()
  const fraction = /^(\d+)\/(\d+)$/.exec(value)
  const decimal = /^(\d+)(?:\.(\d+))?$/.exec(value)
  let numerator: bigint
  let denominator: bigint

  if (fraction) {
    numerator = BigInt(fraction[1])
    denominator = BigInt(fraction[2])
  } else if (decimal) {
    const fractionalDigits = decimal[2] ?? ''
    denominator = 10n ** BigInt(fractionalDigits.length)
    numerator = BigInt(`${decimal[1]}${fractionalDigits}`)
  } else {
    throw new ProductConfigurationError('أدخل كمية موجبة بصيغة رقمية أو كسرية صحيحة.', 400)
  }

  if (numerator <= 0n || denominator <= 0n) {
    throw new ProductConfigurationError('يجب أن تكون الكمية أكبر من صفر.', 400)
  }
  const divisor = gcd(numerator, denominator)
  numerator /= divisor
  denominator /= divisor
  return { numerator, denominator, canonical: `${numerator}/${denominator}` }
}

/** A variant combination is a set, so ordering cannot create a duplicate. */
export function canonicalVariantCombination(valueIds: readonly string[]): string {
  if (valueIds.length === 0) throw new ProductConfigurationError('اختر قيمة واحدة على الأقل للمتغير.', 400)
  if (valueIds.some((id) => !/^\d+$/.test(id))) throw new ProductConfigurationError('معرّف قيمة المتغير غير صالح.', 400)
  const unique = [...new Set(valueIds)]
  if (unique.length !== valueIds.length) throw new ProductConfigurationError('لا يمكن اختيار القيمة نفسها مرتين.', 400)
  return unique.sort((left, right) => (BigInt(left) < BigInt(right) ? -1 : 1)).join(':')
}

/**
 * A conversion is allowed only inside one declared dimension.  Values are
 * exact fractions; callers persist numerator/denominator rather than a float.
 */
export function validateUnitConversion(input: {
  dimension: string
  baseDimension?: string | null
  factor?: string | null
}): ExactQuantity | null {
  if (!input.dimension.trim()) throw new ProductConfigurationError('بُعد وحدة القياس مطلوب.', 400)
  if (!input.factor) {
    if (input.baseDimension) throw new ProductConfigurationError('عامل التحويل مطلوب للوحدة التابعة.', 400)
    return null
  }
  if (!input.baseDimension || input.baseDimension !== input.dimension) {
    throw new ProductConfigurationError('لا يمكن التحويل بين وحدات ذات أبعاد مختلفة.', 400)
  }
  return parseExactQuantity(input.factor)
}
