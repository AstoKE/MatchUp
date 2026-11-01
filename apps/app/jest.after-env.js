/* global jest */
const { configure } = require('@testing-library/react-native');

// The first test of a file pays for compiling its modules when Jest's cache is cold (always on CI). The default wait of
// 1 s then fails on a screen that is merely still loading, so this waits longer. It only slows tests that are failing.
configure({ asyncUtilTimeout: 10_000 });
jest.setTimeout(30_000);
