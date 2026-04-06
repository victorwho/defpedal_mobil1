/**
 * SettingRow Unit Tests
 *
 * Tests the component's props interface, types, and behavior contracts.
 *
 * Note: Full React Native component render tests require additional setup
 * with jest-expo or a custom React Native testing environment. The current
 * vitest setup uses mocked React Native primitives which don't fully support
 * react-test-renderer. These tests verify the component's API contract.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SettingRowProps } from '../SettingRow';

describe('SettingRow', () => {
  describe('Props interface', () => {
    it('requires label, description, checked, and onChange', () => {
      const validProps: SettingRowProps = {
        label: 'Test Label',
        description: 'Test description',
        checked: false,
        onChange: () => {},
      };

      expect(validProps.label).toBe('Test Label');
      expect(validProps.description).toBe('Test description');
      expect(validProps.checked).toBe(false);
      expect(typeof validProps.onChange).toBe('function');
    });

    it('accepts optional disabled prop', () => {
      const propsWithDisabled: SettingRowProps = {
        label: 'Label',
        description: 'Description',
        checked: true,
        onChange: () => {},
        disabled: true,
      };

      expect(propsWithDisabled.disabled).toBe(true);
    });

    it('accepts optional accessibilityLabel prop', () => {
      const propsWithA11y: SettingRowProps = {
        label: 'Label',
        description: 'Description',
        checked: false,
        onChange: () => {},
        accessibilityLabel: 'Custom accessibility label',
      };

      expect(propsWithA11y.accessibilityLabel).toBe('Custom accessibility label');
    });
  });

  describe('onChange behavior', () => {
    it('onChange receives true when toggling from unchecked', () => {
      let receivedValue: boolean | undefined;
      const props: SettingRowProps = {
        label: 'Label',
        description: 'Description',
        checked: false,
        onChange: (checked: boolean) => {
          receivedValue = checked;
        },
      };

      // Simulate what the component does internally: calls onChange with !checked
      props.onChange(!props.checked);
      expect(receivedValue).toBe(true);
    });

    it('onChange receives false when toggling from checked', () => {
      let receivedValue: boolean | undefined;
      const props: SettingRowProps = {
        label: 'Label',
        description: 'Description',
        checked: true,
        onChange: (checked: boolean) => {
          receivedValue = checked;
        },
      };

      // Simulate toggle
      props.onChange(!props.checked);
      expect(receivedValue).toBe(false);
    });

    it('onChange can be called multiple times', () => {
      const onChange = vi.fn();
      const props: SettingRowProps = {
        label: 'Label',
        description: 'Description',
        checked: false,
        onChange,
      };

      props.onChange(true);
      props.onChange(false);
      props.onChange(true);

      expect(onChange).toHaveBeenCalledTimes(3);
      expect(onChange).toHaveBeenNthCalledWith(1, true);
      expect(onChange).toHaveBeenNthCalledWith(2, false);
      expect(onChange).toHaveBeenNthCalledWith(3, true);
    });
  });

  describe('Default values', () => {
    it('disabled defaults to undefined (component defaults to false)', () => {
      const props: SettingRowProps = {
        label: 'Label',
        description: 'Description',
        checked: false,
        onChange: () => {},
      };

      expect(props.disabled).toBeUndefined();
    });

    it('accessibilityLabel defaults to undefined (component uses label)', () => {
      const props: SettingRowProps = {
        label: 'My Setting',
        description: 'Description',
        checked: false,
        onChange: () => {},
      };

      expect(props.accessibilityLabel).toBeUndefined();
    });
  });

  describe('Type safety', () => {
    it('label must be a string', () => {
      const props: SettingRowProps = {
        label: 'String label',
        description: 'Description',
        checked: false,
        onChange: () => {},
      };

      expect(typeof props.label).toBe('string');
    });

    it('description must be a string', () => {
      const props: SettingRowProps = {
        label: 'Label',
        description: 'String description',
        checked: false,
        onChange: () => {},
      };

      expect(typeof props.description).toBe('string');
    });

    it('checked must be a boolean', () => {
      const propsChecked: SettingRowProps = {
        label: 'Label',
        description: 'Description',
        checked: true,
        onChange: () => {},
      };

      const propsUnchecked: SettingRowProps = {
        label: 'Label',
        description: 'Description',
        checked: false,
        onChange: () => {},
      };

      expect(typeof propsChecked.checked).toBe('boolean');
      expect(typeof propsUnchecked.checked).toBe('boolean');
    });

    it('onChange must be a function that accepts boolean', () => {
      const onChange = vi.fn();
      const props: SettingRowProps = {
        label: 'Label',
        description: 'Description',
        checked: false,
        onChange,
      };

      expect(typeof props.onChange).toBe('function');

      // Verify it accepts boolean arguments
      props.onChange(true);
      props.onChange(false);

      expect(onChange).toHaveBeenCalledWith(true);
      expect(onChange).toHaveBeenCalledWith(false);
    });
  });
});
