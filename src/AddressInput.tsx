import React, { useState, useMemo, useEffect } from 'react';
import { TypeBadge, AddressType } from './components/TypeBadge';
import { WarningList } from './components/WarningList';
import type { ParseMessage } from './components/WarningList';
import { MemoField } from './components/MemoField';
import { detect, parse } from '../packages/core-ts';

const DEBOUNCE_MS = 300;

export const AddressInput: React.FC = () => {
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [debouncedAddress, setDebouncedAddress] = useState('');

  // Debounce input changes so validation does not block UI rendering.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedAddress(address), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [address]);

  const type = useMemo<AddressType>(() => {
    if (!debouncedAddress) return 'UNKNOWN';
    try {
      const detected = detect(debouncedAddress);
      if (detected === 'M' || detected === 'G') return detected as AddressType;
      if (detected === 'C') return 'C';
      return 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }, [debouncedAddress]);

  const parseResult = useMemo(() => {
    if (!debouncedAddress) return null;
    try {
      return parse(debouncedAddress);
    } catch (err) {
      return {
        valid: false,
        warnings: [],
        errors: [err instanceof Error ? err.message : 'Unable to parse address'],
      };
    }
  }, [debouncedAddress]);

  const showMemo = type === 'G' || type === 'UNKNOWN';

  const messages = useMemo<ParseMessage[]>(() => {
    const list: ParseMessage[] = [];
    if (parseResult) {
      for (const e of parseResult.errors || []) {
        list.push({ severity: 'error', message: typeof e === 'string' ? e : e.message });
      }
      for (const w of parseResult.warnings || []) {
        list.push({ severity: 'warning', message: typeof w === 'string' ? w : w.message });
      }
    }
    if (type === 'C') {
      list.push({
        severity: 'warning',
        message: 'Contract addresses cannot be used for standard payments.',
      });
    }
    return list;
  }, [parseResult, type]);

  const hasError = messages.some((m) => m.severity === 'error');

  return (
    <div style={{ maxWidth: '32rem', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {type !== 'UNKNOWN' && (
          <div style={{ position: 'absolute', left: '0.5rem' }}>
            <TypeBadge type={type} />
          </div>
        )}
        <input
          type="text"
          placeholder="Paste Stellar address (G..., M..., C...)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={{
            width: '100%',
            padding: `0.75rem 0.75rem 0.75rem ${type !== 'UNKNOWN' ? '3rem' : '0.75rem'}`,
            border: hasError ? '1px solid #ef4444' : '1px solid #cbd5e1',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            boxSizing: 'border-box',
            outline: 'none',
            transition: 'padding 0.2s ease, border-color 0.2s ease',
          }}
        />
      </div>

      <MemoField isVisible={showMemo && !!address} value={memo} onChange={setMemo} />

      <WarningList messages={messages} />
    </div>
  );
};
