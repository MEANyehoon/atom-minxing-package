'use babel';

import Dialog from './dialog';
const MXAPI = require("minxing-tools-core");


export default class AddPageDialog extends Dialog{
    constructor(type, outputPath, project, template) {
        super({
            initialPath: '',
            select: false,
            iconClass: 'icon-file-add',
            prompt: `向${outputPath}中添加页面, 请输入页面名称`
        });
        this.type = type;
        this.outputPath = outputPath;
        this.project = project;
        this.template = template;
    }
    onConfirm(name) {
        const err = MXAPI.Template.page.add({
            type: this.type,
            name: name,
            output: this.outputPath,
            project: this.project,
            template: this.template
        });
        if (err) {
            console.warn(err);
        }
        this.closePanel();
    }
}