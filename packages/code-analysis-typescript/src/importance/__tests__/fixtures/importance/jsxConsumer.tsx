import * as React from 'react';
import { PlainComp, ArrowComp } from './jsxComponent';

export function App(): React.ReactElement {
  return (
    <>
      <PlainComp label="hi" />
      <PlainComp label="hello"></PlainComp>
      <ArrowComp value={1} />
    </>
  );
}
