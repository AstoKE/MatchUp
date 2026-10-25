/** Never send the user back into a flow they just finished (onboarding, re-consent) or a legal page. */
export function destination(returnTo: string): string {
  return /^\/(onboarding|consent-update|legal)(\/|\?|$)/.test(returnTo) ? '/' : returnTo;
}
