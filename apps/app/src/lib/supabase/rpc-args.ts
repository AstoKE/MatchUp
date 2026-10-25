/**
 * PostgREST accepts JSON `null` for any RPC argument, but the generated types cannot express
 * nullable parameters and model every argument as non-null. `undefined` is NOT an alternative: it
 * is dropped from the request, and PostgREST then fails to find a function with fewer arguments.
 */
export function nullableArg<T>(value: T | null): T {
  return value as T;
}
