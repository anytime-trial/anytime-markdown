/** 言語別 Hello World サンプル */
export const CODE_HELLO_SAMPLES: Record<string, string> = {
  javascript: `function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));`,

  typescript: `function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));`,

  python: `def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("World"))`,

  java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,

  c: String.raw`#include <stdio.h>

int main() {
    printf("Hello, World!\n");
    return 0;
}`,

  cpp: `#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}`,

  csharp: `using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello, World!");
    }
}`,

  go: `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}`,

  rust: `fn main() {
    println!("Hello, World!");
}`,

  ruby: `def greet(name)
  "Hello, #{name}!"
end

puts greet("World")`,

  php: `<?php
function greet(string $name): string {
    return "Hello, {$name}!";
}

echo greet("World");`,

  swift: String.raw`func greet(_ name: String) -> String {
    return "Hello, \(name)!"
}

print(greet("World"))`,

  kotlin: `fun greet(name: String): String = "Hello, $name!"

fun main() {
    println(greet("World"))
}`,

  sql: `SELECT 'Hello, World!' AS greeting;

-- Example table query
SELECT id, name, email
FROM users
WHERE active = true
ORDER BY name;`,

  bash: `#!/bin/bash

greet() {
    echo "Hello, $1!"
}

greet "World"`,

  css: `/* Basic reset */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: sans-serif;
  color: #333;
}`,

  html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hello</title>
</head>
<body>
  <h1>Hello, World!</h1>
</body>
</html>`,

  json: `{
  "name": "my-project",
  "version": "1.0.0",
  "description": "Hello World",
  "dependencies": {}
}`,

  yaml: `name: my-project
version: "1.0.0"
services:
  web:
    image: nginx
    ports:
      - "80:80"`,

  xml: `<?xml version="1.0" encoding="UTF-8"?>
<greeting>
  <message>Hello, World!</message>
</greeting>`,

  markdown: `# Hello World

This is a **Markdown** document.

- Item 1
- Item 2
- Item 3`,

  lua: `function greet(name)
    return "Hello, " .. name .. "!"
end

print(greet("World"))`,

  r: String.raw`greet <- function(name) {
  paste("Hello,", name, "!")
}

cat(greet("World"), "\n")`,

  perl: String.raw`sub greet {
    my ($name) = @_;
    return "Hello, $name!";
}

print greet("World"), "\n";`,
};
