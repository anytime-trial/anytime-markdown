import { pkgBThing } from '../../pkgB/built';

export function pkgAThing(): number {
  return pkgBThing() + 1;
}
