import assert from "node:assert/strict";
import test from "node:test";
import {
  ONBOARDING_STEP_COUNT,
  moveOnboardingStep,
  onboardingActions,
} from "../src/lib/onboarding.ts";

test("onboarding exposes the required navigation actions on every step", () => {
  assert.equal(ONBOARDING_STEP_COUNT, 9);
  assert.deepEqual(onboardingActions(0), {
    skip: true,
    previous: false,
    next: true,
    finish: false,
  });
  for (const step of [1, 2, 3, 4, 5, 6, 7]) {
    assert.deepEqual(onboardingActions(step), {
      skip: true,
      previous: true,
      next: true,
      finish: false,
    });
  }
  assert.deepEqual(onboardingActions(8), {
    skip: true,
    previous: true,
    next: false,
    finish: true,
  });
});

test("onboarding step movement stays within the nine-step flow", () => {
  assert.equal(moveOnboardingStep(0, -1), 0);
  assert.equal(moveOnboardingStep(0, 1), 1);
  assert.equal(moveOnboardingStep(6, 1), 7);
  assert.equal(moveOnboardingStep(7, 1), 8);
  assert.equal(moveOnboardingStep(8, 1), 8);
  assert.equal(moveOnboardingStep(2, -1), 1);
});
