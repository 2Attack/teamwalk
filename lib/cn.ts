import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Слияние классов Tailwind без конфликтов. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
