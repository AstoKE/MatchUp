import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { TOUCH_TARGET } from '../tokens';
import { useTheme } from '../theme';
import { Text } from './Text';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A single-choice field that expands in place (no modal, so it works the same on every platform and
 * keeps focus order simple). `value` null means "nothing chosen"; `noneLabel` adds an explicit way
 * to clear an optional choice.
 */
export function Select({
  label,
  options,
  value,
  onChange,
  placeholder,
  noneLabel,
  disabled = false,
  error,
}: {
  label: string;
  options: readonly SelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  noneLabel?: string;
  disabled?: boolean;
  error?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);

  const choose = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <View style={{ gap: spacing[2] }}>
      <Text variant="label" accessibilityElementsHidden importantForAccessibility="no">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder}`}
        aria-expanded={open}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() => setOpen((v) => !v)}
        style={{
          minHeight: TOUCH_TARGET,
          paddingHorizontal: spacing[4],
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: error ? colors.danger : colors.borderStrong,
          backgroundColor: colors.surfaceRaised,
          opacity: disabled ? 0.5 : 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing[2],
        }}
      >
        <Text tone={current ? 'primary' : 'secondary'} style={{ flex: 1 }}>
          {current?.label ?? placeholder}
        </Text>
        <Text tone="secondary" accessibilityElementsHidden importantForAccessibility="no">
          {open ? '▴' : '▾'}
        </Text>
      </Pressable>
      {open ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
          style={{
            borderWidth: 1,
            borderColor: colors.borderSubtle,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceRaised,
            maxHeight: 280,
          }}
        >
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {noneLabel ? (
              <Row label={noneLabel} selected={value === null} onPress={() => choose(null)} muted />
            ) : null}
            {options.map((option) => (
              <Row
                key={option.value}
                label={option.label}
                selected={option.value === value}
                onPress={() => choose(option.value)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
      {error ? (
        <Text variant="caption" tone="danger" role="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Row({
  label,
  selected,
  onPress,
  muted = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  muted?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      aria-checked={selected}
      onPress={onPress}
      style={{
        minHeight: TOUCH_TARGET,
        paddingHorizontal: spacing[4],
        justifyContent: 'center',
        backgroundColor: selected ? colors.surfaceSunken : 'transparent',
      }}
    >
      <Text variant={selected ? 'label' : 'body'} tone={muted ? 'secondary' : 'primary'}>
        {label}
      </Text>
    </Pressable>
  );
}
