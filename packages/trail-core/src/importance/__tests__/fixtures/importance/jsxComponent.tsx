import * as React from 'react';

export function PlainComp(props: { label: string }): React.ReactElement {
  return <span>{props.label}</span>;
}

export const ArrowComp = (props: { value: number }): React.ReactElement => <span>{props.value}</span>;
