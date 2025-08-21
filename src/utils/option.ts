import type { Option } from 'fp-ts/Option'
import { some, none, fromNullable, fold } from 'fp-ts/Option'
import { pipe } from 'fp-ts/function'

// Re-export commonly used Option functions
export type { Option } from 'fp-ts/Option'
export { some, none, fromNullable, fold } from 'fp-ts/Option'
export { pipe } from 'fp-ts/function'

// Helper function to convert string | null | undefined to Option<string>
export const fromStringOrNull = (value: string | null | undefined): Option<string> => 
  fromNullable(value)

// Helper function to convert Option<string> back to string | null
export const toStringOrNull = (option: Option<string>): string | null =>
  fold(
    () => null,
    (value: string) => value
  )(option)

// Helper function to safely access object properties that might be null
export const fromProperty = <T, K extends keyof T>(obj: T, key: K): Option<T[K]> =>
  fromNullable(obj[key])

// Helper function to chain optional operations
export const chainOption = <T, U>(
  option: Option<T>,
  fn: (value: T) => Option<U>
): Option<U> => pipe(option, fold(() => none, fn))
