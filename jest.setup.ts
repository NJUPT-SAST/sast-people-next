/**
 * Jest setup file
 * This file is executed before each test file
 */

import '@testing-library/jest-dom';
import React from 'react';
import { TextDecoder, TextEncoder } from 'util';

Object.assign(globalThis, {
  TextDecoder,
  TextEncoder,
});

/* jsdom 缺少 Radix（Select / DropdownMenu 等）依赖的指针与滚动 API（node 环境无 Element） */
if (typeof Element !== 'undefined') {
  for (const method of ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture'] as const) {
    if (!Element.prototype[method]) {
      Element.prototype[method] = jest.fn();
    }
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = jest.fn();
  }
}

type MockNextImageProps = React.ComponentPropsWithoutRef<'img'> & {
  priority?: boolean;
  fill?: boolean;
};

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: MockNextImageProps) => {
    const normalizedProps = { ...props };
    delete normalizedProps.priority;
    delete normalizedProps.fill;
    return React.createElement('img', normalizedProps);
  },
}));

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
    };
  },
  usePathname() {
    return '/';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
}));

// Suppress console errors in tests (optional)
// global.console = {
//   ...console,
//   error: jest.fn(),
//   warn: jest.fn(),
// };

