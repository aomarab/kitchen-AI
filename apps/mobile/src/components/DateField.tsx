import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { radius, spacing } from '../theme';
import { useTheme } from '../theme/useTheme';
import { useFormat } from '../hooks/useFormat';
import { dateFromIsoDate, isoDateFromDate } from '../lib/expiry';
import { formatDateWithHijri } from '../lib/format';

interface DateFieldProps {
  label: string;
  /** `YYYY-MM-DD`, or null for "no date". */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  clearLabel: string;
  doneLabel: string;
  /** Nothing in a kitchen expires in the past, so the wheel starts today. */
  minimumDate?: Date;
}

/**
 * Expiry as a calendar rather than typed text.
 *
 * Typing was a real failure: the API only accepts `YYYY-MM-DD`, so "31/12/2026"
 * — the format most of the world writes — was rejected, and the date is usually
 * being copied off a packet while holding it. A calendar cannot produce an
 * invalid date at all, which removes the error state rather than reporting it.
 *
 * The two platforms disagree about where a picker belongs, so this follows each
 * one: an inline calendar in a sheet on iOS, the system dialog on Android.
 */
export function DateField({
  label,
  value,
  onChange,
  placeholder,
  clearLabel,
  doneLabel,
  minimumDate,
}: DateFieldProps) {
  const { colors, isDark } = useTheme();
  const { locale, showHijri } = useFormat();
  const [open, setOpen] = useState(false);
  const selected = dateFromIsoDate(value) ?? new Date();

  const commit = (date: Date) => onChange(isoDateFromDate(date));

  const onAndroidChange = (event: DateTimePickerEvent, date?: Date) => {
    setOpen(false);
    if (event.type === 'set' && date) commit(date);
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" muted>
        {label}
      </AppText>

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: value ?? placeholder }}
        style={{
          minHeight: 48,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.xs,
          paddingHorizontal: spacing.md,
          backgroundColor: colors.surface,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <AppText style={{ color: value ? colors.text : colors.textMuted }}>
          {value
            ? formatDateWithHijri(locale, value, showHijri, { dateStyle: 'long' })
            : placeholder}
        </AppText>
        {/* A calendar reads the same in both directions, so it never mirrors. */}
        <Icon name="calendar" size={18} color={colors.textMuted} />
      </Pressable>

      {value ? (
        <Pressable onPress={() => onChange(null)} accessibilityRole="button">
          <AppText variant="caption" style={{ color: colors.primaryText }}>
            {clearLabel}
          </AppText>
        </Pressable>
      ) : null}

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={selected}
          mode="date"
          minimumDate={minimumDate}
          onChange={onAndroidChange}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
          <DateTimePicker
            value={selected}
            mode="date"
            display="inline"
            minimumDate={minimumDate}
            // Pinned to 'light' while the app had one palette. UIDatePicker
            // draws its own chrome, so a light variant inside a dark sheet
            // paints near-black day numbers on a near-black surface.
            themeVariant={isDark ? 'dark' : 'light'}
            locale={locale}
            onChange={(_event, date) => {
              if (date) commit(date);
            }}
          />
          <Button title={doneLabel} icon="check" onPress={() => setOpen(false)} />
        </Sheet>
      ) : null}
    </View>
  );
}
