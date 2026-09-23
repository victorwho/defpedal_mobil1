import type { MeasurementSystem } from '@defensivepedal/core';

import { useAppStore } from '../store/appStore';

/**
 * The rider's measurement system — metric, or imperial for the UK and anyone
 * who flips the Profile toggle.
 *
 * Every distance, climb and speed the app renders passes through a core
 * formatter that takes this value. The formatters require it rather than
 * defaulting, so a surface that forgets to call this hook fails to compile
 * instead of quietly showing kilometres to a rider who asked for miles.
 */
export const useUnits = (): MeasurementSystem =>
  useAppStore((s) => s.measurementSystem);
