import {
  breakpointForWidth,
  contrastRatio,
  darkColors,
  lightColors,
  requiredContrast,
  sportColors,
} from '.';

describe('contrast helper', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThan(4.5); // classic AA boundary gray
  });
  it('rejects non-hex input', () => {
    expect(() => contrastRatio('red', '#fff')).toThrow();
  });
});

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as const)('%s theme meets WCAG 2.2 AA contrast', (_name, colors) => {
  it.each(requiredContrast.map((r) => [`${r.fg} on ${r.bg} (${r.note})`, r] as const))(
    '%s',
    (_label, rule) => {
      expect(contrastRatio(colors[rule.fg], colors[rule.bg])).toBeGreaterThanOrEqual(rule.min);
    },
  );
});

describe('court colors', () => {
  it.each(Object.entries(sportColors))('%s keeps its label readable', (_slug, { court, on }) => {
    expect(contrastRatio(on, court)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('themes are structurally identical', () => {
  it('both define exactly the same semantic keys', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });
});

describe('breakpoints', () => {
  it.each([
    [320, 'compact'],
    [767, 'compact'],
    [768, 'medium'],
    [1199, 'medium'],
    [1200, 'expanded'],
  ] as const)('%ipx → %s', (width, expected) => {
    expect(breakpointForWidth(width)).toBe(expected);
  });
});
