import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

export type ToastKind = 'info' | 'success' | 'danger';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Errors stay longer (WCAG 2.2.1: enough time); every toast is dismissible. */
const DURATION_MS: Record<ToastKind, number> = { info: 5000, success: 5000, danger: 10000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-2), { id, message, kind }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS[kind]),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active.values()) clearTimeout(timer);
      active.clear();
    };
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const { t } = useTranslation('common');
  // Above the dock, which the toast host cannot see from here: the same height on every screen.
  const bottom = spacing[18] + spacing[6] + useSafeAreaInsets().bottom;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center' }}
    >
      {items.map((item) => (
        <View
          key={item.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[3],
            maxWidth: 560,
            marginTop: spacing[2],
            paddingLeft: spacing[4],
            paddingRight: spacing[2],
            borderRadius: radius.md,
            backgroundColor: colors.surfaceRaised,
            borderWidth: 1,
            borderColor:
              item.kind === 'danger'
                ? colors.danger
                : item.kind === 'success'
                  ? colors.success
                  : colors.borderStrong,
          }}
        >
          <Text
            style={{ flexShrink: 1 }}
            role={item.kind === 'danger' ? 'alert' : 'status'}
            accessibilityLiveRegion={item.kind === 'danger' ? 'assertive' : 'polite'}
          >
            {item.message}
          </Text>
          <Button label={t('close')} variant="tertiary" onPress={() => onDismiss(item.id)} />
        </View>
      ))}
    </View>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
