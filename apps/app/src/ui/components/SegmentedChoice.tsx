import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { TOUCH_TARGET } from '../tokens';
import { useTheme } from '../theme';
import { Text } from './Text';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

/** A small single-choice control (radio group semantics), e.g. the language picker. */
export function SegmentedChoice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const [focused, setFocused] = useState<T | null>(null);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: spacing[2] }}>
      <Text
        variant="label"
        tone="secondary"
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              aria-checked={selected}
              onPress={() => onChange(option.value)}
              onFocus={() => setFocused(option.value)}
              onBlur={() => setFocused(null)}
              style={{
                minHeight: TOUCH_TARGET,
                minWidth: TOUCH_TARGET,
                paddingHorizontal: spacing[4],
                paddingVertical: spacing[2],
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? colors.selected : 'transparent',
                borderWidth: 1.5,
                borderColor: selected ? colors.selected : colors.borderStrong,
                ...(focused === option.value
                  ? {
                      outlineColor: colors.focusRing,
                      outlineWidth: 2,
                      outlineOffset: 2,
                      outlineStyle: 'solid' as const,
                    }
                  : null),
              }}
            >
              <Text
                variant="label"
                style={{ color: selected ? colors.onSelected : colors.textPrimary }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
