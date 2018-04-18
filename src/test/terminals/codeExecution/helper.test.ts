// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// tslint:disable:no-multiline-string no-trailing-whitespace

import { expect } from 'chai';
import { EOL } from 'os';
import * as TypeMoq from 'typemoq';
import { Range, Selection, TextDocument, TextEditor, TextLine, Uri } from 'vscode';
import { IApplicationShell, IDocumentManager } from '../../../client/common/application/types';
import { PythonLanguage } from '../../../client/common/constants';
import { CodeExecutionHelper } from '../../../client/terminals/codeExecution/helper';
import { ICodeExecutionHelper } from '../../../client/terminals/types';

// tslint:disable-next-line:max-func-body-length
suite('Terminal - Code Execution Helper', () => {
    let documentManager: TypeMoq.IMock<IDocumentManager>;
    let applicationShell: TypeMoq.IMock<IApplicationShell>;
    let helper: ICodeExecutionHelper;
    let document: TypeMoq.IMock<TextDocument>;
    let editor: TypeMoq.IMock<TextEditor>;
    setup(() => {
        documentManager = TypeMoq.Mock.ofType<IDocumentManager>();
        applicationShell = TypeMoq.Mock.ofType<IApplicationShell>();
        helper = new CodeExecutionHelper(documentManager.object, applicationShell.object);

        document = TypeMoq.Mock.ofType<TextDocument>();
        editor = TypeMoq.Mock.ofType<TextEditor>();
        editor.setup(e => e.document).returns(() => document.object);
    });

    test('Ensure blank lines are removed', async () => {
        const code = ['import sys', '', '', '', 'print(sys.executable)', '', 'print("1234")', '', '', 'print(1)', 'print(2)'];
        const expectedCode = code.filter(line => line.trim().length > 0).join(EOL);
        const normalizedZCode = helper.normalizeLines(code.join(EOL));
        expect(normalizedZCode).to.be.equal(expectedCode);
    });
    test('Display message if there\s no active file', async () => {
        documentManager.setup(doc => doc.activeTextEditor).returns(() => undefined);

        const uri = await helper.getFileToExecute();
        expect(uri).to.be.an('undefined');
        applicationShell.verify(a => a.showErrorMessage(TypeMoq.It.isAnyString()), TypeMoq.Times.once());
    });

    test('Display message if active file is unsaved', async () => {
        documentManager.setup(doc => doc.activeTextEditor).returns(() => editor.object);
        document.setup(doc => doc.isUntitled).returns(() => true);

        const uri = await helper.getFileToExecute();
        expect(uri).to.be.an('undefined');
        applicationShell.verify(a => a.showErrorMessage(TypeMoq.It.isAnyString()), TypeMoq.Times.once());
    });

    test('Display message if active file is non-python', async () => {
        document.setup(doc => doc.isUntitled).returns(() => false);
        document.setup(doc => doc.languageId).returns(() => 'html');
        documentManager.setup(doc => doc.activeTextEditor).returns(() => editor.object);

        const uri = await helper.getFileToExecute();
        expect(uri).to.be.an('undefined');
        applicationShell.verify(a => a.showErrorMessage(TypeMoq.It.isAnyString()), TypeMoq.Times.once());
    });

    test('Returns file uri', async () => {
        document.setup(doc => doc.isUntitled).returns(() => false);
        document.setup(doc => doc.languageId).returns(() => PythonLanguage.language);
        const expectedUri = Uri.file('one.py');
        document.setup(doc => doc.uri).returns(() => expectedUri);
        documentManager.setup(doc => doc.activeTextEditor).returns(() => editor.object);

        const uri = await helper.getFileToExecute();
        expect(uri).to.be.deep.equal(expectedUri);
    });

    test('Returns file uri even if saving fails', async () => {
        document.setup(doc => doc.isUntitled).returns(() => false);
        document.setup(doc => doc.isDirty).returns(() => true);
        document.setup(doc => doc.languageId).returns(() => PythonLanguage.language);
        document.setup(doc => doc.save()).returns(() => Promise.resolve(false));
        const expectedUri = Uri.file('one.py');
        document.setup(doc => doc.uri).returns(() => expectedUri);
        documentManager.setup(doc => doc.activeTextEditor).returns(() => editor.object);

        const uri = await helper.getFileToExecute();
        expect(uri).to.be.deep.equal(expectedUri);
    });

    test('Dirty files are saved', async () => {
        document.setup(doc => doc.isUntitled).returns(() => false);
        document.setup(doc => doc.isDirty).returns(() => true);
        document.setup(doc => doc.languageId).returns(() => PythonLanguage.language);
        const expectedUri = Uri.file('one.py');
        document.setup(doc => doc.uri).returns(() => expectedUri);
        documentManager.setup(doc => doc.activeTextEditor).returns(() => editor.object);

        const uri = await helper.getFileToExecute();
        expect(uri).to.be.deep.equal(expectedUri);
        document.verify(doc => doc.save(), TypeMoq.Times.once());
    });

    test('Non-Dirty files are not-saved', async () => {
        document.setup(doc => doc.isUntitled).returns(() => false);
        document.setup(doc => doc.isDirty).returns(() => false);
        document.setup(doc => doc.languageId).returns(() => PythonLanguage.language);
        const expectedUri = Uri.file('one.py');
        document.setup(doc => doc.uri).returns(() => expectedUri);
        documentManager.setup(doc => doc.activeTextEditor).returns(() => editor.object);

        const uri = await helper.getFileToExecute();
        expect(uri).to.be.deep.equal(expectedUri);
        document.verify(doc => doc.save(), TypeMoq.Times.never());
    });

    test('Returns current line if nothing is selected', async () => {
        const lineContents = 'Line Contents';
        editor.setup(e => e.selection).returns(() => new Selection(3, 0, 3, 0));
        const textLine = TypeMoq.Mock.ofType<TextLine>();
        textLine.setup(t => t.text).returns(() => lineContents);
        document.setup(d => d.lineAt(TypeMoq.It.isAny())).returns(() => textLine.object);

        const content = await helper.getSelectedTextToExecute(editor.object);
        expect(content).to.be.equal(lineContents);
    });

    test('Returns selected text', async () => {
        const lineContents = 'Line Contents';
        editor.setup(e => e.selection).returns(() => new Selection(3, 0, 10, 5));
        const textLine = TypeMoq.Mock.ofType<TextLine>();
        textLine.setup(t => t.text).returns(() => lineContents);
        document.setup(d => d.getText(TypeMoq.It.isAny())).returns((r: Range) => `${r.start.line}.${r.start.character}.${r.end.line}.${r.end.character}`);

        const content = await helper.getSelectedTextToExecute(editor.object);
        expect(content).to.be.equal('3.0.10.5');
    });

    test('saveFileIfDirty will not fail if file is not opened', async () => {
        documentManager.setup(d => d.textDocuments).returns(() => []).verifiable(TypeMoq.Times.once());

        await helper.saveFileIfDirty(Uri.file(`${__filename}.py`));
        documentManager.verifyAll();
    });

    test('File will be saved if file is dirty', async () => {
        documentManager.setup(d => d.textDocuments).returns(() => [document.object]).verifiable(TypeMoq.Times.once());
        document.setup(doc => doc.isUntitled).returns(() => false);
        document.setup(doc => doc.isDirty).returns(() => true);
        document.setup(doc => doc.languageId).returns(() => PythonLanguage.language);
        const expectedUri = Uri.file('one.py');
        document.setup(doc => doc.uri).returns(() => expectedUri);

        await helper.saveFileIfDirty(expectedUri);
        documentManager.verifyAll();
        document.verify(doc => doc.save(), TypeMoq.Times.once());
    });

    test('File will be not saved if file is not dirty', async () => {
        documentManager.setup(d => d.textDocuments).returns(() => [document.object]).verifiable(TypeMoq.Times.once());
        document.setup(doc => doc.isUntitled).returns(() => false);
        document.setup(doc => doc.isDirty).returns(() => false);
        document.setup(doc => doc.languageId).returns(() => PythonLanguage.language);
        const expectedUri = Uri.file('one.py');
        document.setup(doc => doc.uri).returns(() => expectedUri);

        await helper.saveFileIfDirty(expectedUri);
        documentManager.verifyAll();
        document.verify(doc => doc.save(), TypeMoq.Times.never());
    });
});
