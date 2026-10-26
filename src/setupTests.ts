// src/setupTests.ts
import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

// jsdom in CRA's Jest 27 predates the encoding globals required by Router 7.
Object.assign(global, { TextDecoder, TextEncoder });
