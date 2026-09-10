export const ONBOARDING_STEP_COUNT = 8;

export interface OnboardingActions {
  skip: true;
  previous: boolean;
  next: boolean;
  finish: boolean;
}

export function onboardingActions(step: number): OnboardingActions {
  const normalized = Math.min(Math.max(Math.trunc(step), 0), ONBOARDING_STEP_COUNT - 1);
  return {
    skip: true,
    previous: normalized > 0,
    next: normalized < ONBOARDING_STEP_COUNT - 1,
    finish: normalized === ONBOARDING_STEP_COUNT - 1,
  };
}

export function moveOnboardingStep(step: number, direction: -1 | 1): number {
  return Math.min(
    Math.max(Math.trunc(step) + direction, 0),
    ONBOARDING_STEP_COUNT - 1
  );
}
