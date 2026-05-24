import type { Node } from 'web-tree-sitter';
import { createPythonParser } from '../PythonParser';
import { classifyPythonFile } from '../PythonFileClassifier';

async function rootOf(src: string): Promise<Node> {
  const parser = await createPythonParser();
  return parser.parse(src)!.rootNode;
}

describe('classifyPythonFile', () => {
  it('excludes test files and stubs by filename (no root needed)', () => {
    expect(classifyPythonFile('pkg/test_service.py')).toBe('excluded');
    expect(classifyPythonFile('pkg/service_test.py')).toBe('excluded');
    expect(classifyPythonFile('conftest.py')).toBe('excluded');
    expect(classifyPythonFile('pkg/types.pyi')).toBe('excluded');
  });

  it('classifies files under ui/views/templates dirs as ui (path-based)', () => {
    expect(classifyPythonFile('app/views/home.py')).toBe('ui');
    expect(classifyPythonFile('app/templates/page.py')).toBe('ui');
    expect(classifyPythonFile('src/widgets/button.py')).toBe('ui');
  });

  it('classifies files importing a UI framework as ui', async () => {
    const root = await rootOf('import streamlit as st\n\n\ndef main():\n    st.write("hi")\n');
    expect(classifyPythonFile('dashboard.py', root)).toBe('ui');
  });

  it('classifies from-import of a qualified UI framework as ui', async () => {
    const root = await rootOf('from PyQt5.QtWidgets import QApplication\n');
    expect(classifyPythonFile('gui.py', root)).toBe('ui');
  });

  it('classifies flask render_template / django render as ui', async () => {
    const flask = await rootOf('from flask import Flask, render_template\n');
    expect(classifyPythonFile('web.py', flask)).toBe('ui');
    const django = await rootOf('from django.shortcuts import render\n');
    expect(classifyPythonFile('handlers.py', django)).toBe('ui');
  });

  it('classifies plain backend modules as logic', async () => {
    const root = await rootOf('import os\nfrom flask import Flask\n\n\ndef build():\n    return os.getcwd()\n');
    expect(classifyPythonFile('service.py', root)).toBe('logic');
  });

  it('returns logic for an undecided file without a root', () => {
    expect(classifyPythonFile('service.py')).toBe('logic');
  });
});
