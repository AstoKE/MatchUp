import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, TextField, useTheme, type TextFieldProps } from '@/ui';

/** Password input with an accessible show/hide toggle. Never logs or exposes the value. */
export function PasswordField({
  autoComplete = 'current-password',
  ...props
}: Omit<TextFieldProps, 'secureTextEntry' | 'autoComplete'> & {
  autoComplete?: 'current-password' | 'new-password';
}) {
  const { t } = useTranslation('auth');
  const { spacing } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: spacing[1] }}>
      <TextField
        {...props}
        secureTextEntry={!visible}
        autoComplete={autoComplete}
        textContentType={autoComplete === 'new-password' ? 'newPassword' : 'password'}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
      />
      <Button
        variant="tertiary"
        label={visible ? t('hidePassword') : t('showPassword')}
        onPress={() => setVisible((value) => !value)}
        accessibilityState={{ expanded: visible }}
      />
    </View>
  );
}
