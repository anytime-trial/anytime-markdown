function createExtension<T>(config: T): T {
  return config;
}

const FooExt = createExtension({
  addAttributes() {
    return { foo: 1 };
  },
});

const BarExt = createExtension({
  addAttributes() {
    return { bar: 1 };
  },
});

void FooExt;
void BarExt;
