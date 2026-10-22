import React from 'react';

export type ParseMessageSeverity = 'error' | 'warning';

export interface ParseMessage {
  severity: ParseMessageSeverity;
  message: string;
}

export interface WarningListProps {
  messages?: ParseMessage[];
  /** Backwards-compatible string warnings (rendered as warnings). */
  warnings?: string[];
}

const styleBySeverity: Record<ParseMessageSeverity, React.CSSProperties> = {
  error: {
    background: '#fef2f2',
    border: '1px solid #ef4444',
    color: '#991b1b',
  },
  warning: {
    background: '#fffbeb',
    border: '1px solid #f59e0b',
    color: '#92400e',
  },
};

export const WarningList: React.FC<WarningListProps> = ({ messages, warnings }) => {
  const normalized: ParseMessage[] = [
    ...(messages ?? []),
    ...(warnings ?? []).map((w) => ({ severity: 'warning' as const, message: w })),
  ];

  if (normalized.length === 0) return null;

  return (
    <ul
      role="alert"
      style={{
        listStyle: 'none',
        margin: '0.75rem 0 0 0',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      {normalized.map((msg, idx) => (
        <li
          key={`${msg.severity}-${idx}`}
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            lineHeight: 1.4,
            ...styleBySeverity[msg.severity],
          }}
        >
          {msg.message}
        </li>
      ))}
    </ul>
  );
};
