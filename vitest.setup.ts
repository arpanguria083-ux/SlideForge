import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Provide a clipboard mock for tests
if (typeof (globalThis as any).navigator === 'undefined') {
  (globalThis as any).navigator = {};
}
(globalThis as any).navigator.clipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};
