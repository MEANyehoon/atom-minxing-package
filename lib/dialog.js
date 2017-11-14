'use babel';
import {
    TextEditor,
    CompositeDisposable,
    Disposable,
    Range,
    Point
} from 'atom';
export default class Dialog {
    constructor({
        initialPath,
        select,
        iconClass,
        prompt
    }) {
        this.disposables = new CompositeDisposable()

        this.element = document.createElement('div');
        this.element.classList.add('minxing-view-dialog')
        this.promptText = document.createElement('label');
        this.promptText.classList.add('icon');
        iconClass && this.promptText.classList.add(iconClass);
        this.promptText.textContent = prompt;
        this.element.appendChild(this.promptText)

        this.miniEditor = new TextEditor({
            mini: true
        })
        const blurHandler = () => {
            document.hasFocus() && this.closePanel();
        };
        this.miniEditor.element.addEventListener('blur', blurHandler);
        this.disposables.add(new Disposable(() => this.miniEditor.element.removeEventListener('blur', blurHandler)));
        this.element.appendChild(this.miniEditor.element)
        
        this.errorMessage = document.createElement('div')
        this.errorMessage.classList.add('error-message');
        this.disposables.add(this.miniEditor.onDidChange(() => this.showError));
        this.element.appendChild(this.errorMessage)

        atom.commands.add (this.element, 'core:confirm', () => this.onConfirm(this.miniEditor.getText()));
        atom.commands.add (this.element, 'core:cancel', () => this.cancel());

        this.miniEditor.setText(initialPath);

        if (select) {
            const extension = getFullExtension(initialPath);
            const baseName = path.basename(initialPath);
            const selectionStart = initialPath.length - baseName.length
            const selectionEnd = baseName === extension ? initialPath.length : initialPath.length - extension.length;
            this.miniEditor.setSelectedBufferRange(Range(Point(0, selectionStart), Point(0, selectionEnd)));
        }
    }
    attach() {
        this.panel = atom.workspace.addModalPanel({
            item: this.element
        });
        this.miniEditor.element.focus()
        this.miniEditor.scrollToCursorPosition()
    };

    closePanel() {
        const panel = this.panel;
        this.panel = null;
        panel && panel.destroy();
        this.miniEditor.destroy()
        this.disposables.dispose()
        const activePane = atom.workspace.getCenter().getActivePane()
        !activePane.isDestroyed() && activePane.activate();
    }

    cancel() {
        this.closePanel();
        const treeView = document.querySelector('.tree-view');
        treeView && treeView.focus();
    }

    showError(message) {
        this.errorMessage.textContent = message;
        if(message) {
            this.element.classList.add('error')
            window.setTimeout(() => {
                this.element.classList.remove('error');
            },  300);
        }
    }
}
