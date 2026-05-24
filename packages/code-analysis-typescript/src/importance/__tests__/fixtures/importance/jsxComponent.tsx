import * as React from 'react';

export function PlainComp(props: Readonly<{ label: string }>): React.ReactElement {
  return <span>{props.label}</span>;
}

export const ArrowComp = (props: Readonly<{ value: number }>): React.ReactElement => <span>{props.value}</span>;
