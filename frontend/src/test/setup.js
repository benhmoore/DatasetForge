import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect method with Testing Library's matchers
expect.extend(matchers);

// Run cleanup after each test case
afterEach(() => {
  cleanup();
});