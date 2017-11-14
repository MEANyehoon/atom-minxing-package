'use babel';

import {
    CompositeDisposable,
    TextEditor,
    Directory
} from 'atom';

const {
    spawn
} = require('child_process')
const Path = require("path")
const os = require("os")
const MXAPI = require("minxing-tools-core");

const APICloud = MXAPI.APICloud;
const querystring = require('querystring')
const http = require("http")
const remote = require("remote")
const dialog = remote.require("dialog") || remote["dialog"]
const fs = require("fs")


import AddDialog from './add-dialog';

export default {
    subscriptions: null,
    modalPanel: null,
    port: null,
    /*获取一个范围的随机数,可选范围内包含最大与最小值.*/
    getRandomIntInclusive(min, max) {
        min = Math.ceil(min)
        max = Math.floor(max)
        return Math.floor(Math.random() * (max - min + 1)) + min
    },
    getUserHome() { // 获取用户目录.
        return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
    },
    report() {
        let system = os.platform()
        let uuid = atom.config.get('apicloud.uuid')
        if (!uuid) {
            uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0,
                    v = c == 'x' ? r : r & 0x3 | 0x8;
                return v.toString(16)
            })
            atom.config.set('apicloud.uuid', uuid)
        }
        let info = {
            system: system,
            uuid: uuid
        }

        var postData = JSON.stringify({
            'info': info
        });

        var options = {
            hostname: "www.apicloud.com",
            path: '/setAtomInfo',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        // var req = http.request(options, (res) => {
        //     res.setEncoding('utf8');
        //     res.on('data', (chunk) => {
        //         try {
        //             let body = JSON.parse(chunk.toString())
        //             if (body && body.status === 1) {
        //                 console.log("与 敏行 建立连接!")
        //             } else {
        //                 console.log("可能无法连接 敏行 !")
        //             }
        //         } catch (err) {
        //             console.log("可能无法连接 敏行 !")
        //         }
        //     });
        // });

        // req.on('error', (e) => {
        //     console.log(`problem with request: ${e.message}`);
        // });
        // req.write(postData);
        // req.end();
    },
    setTemplateCommand(str) {
        /**
         * str = 'project' | 'page';
         */
        const config = MXAPI.Template[str.toLowerCase()].getConfig();
        const typeKeys = Object.keys(config);
        typeKeys.forEach(type => {
            const templates = Object.keys(config[type]);
            templates.forEach(template => {
                atom.commands.add('atom-workspace', `Minxing:add${str}Template,type=${type},template=${template}`,
                    (event) => (this.convertCommandToMethod({
                        event: event
                    })))
            })
        })
    },
    activate(state) {
        /* 统计信息 */
        this.report()

        /* 真机同步服务自启动. */
        let port = this.getRandomIntInclusive(1001, 9999);
        console.log(`随机使用端口:${port}`)
        this.port = port;
        this.tempPath = Path.resolve(Path.dirname(__dirname), 'temp');
        MXAPI.clearTemp(this.tempPath);
        APICloud.startWifi({
            tempPath: this.tempPath,
            port: this.port
        })

        APICloud.wifiLog(({
                level,
                content
            }) => {
                if (level === "warn") {
                    console.warn(content)
                    return
                }

                if (level === "error") {
                    console.error(content)
                    return
                }

                console.log(content)
            })
            .then(() => {
                console.log("WiFi 日志服务已启动...")
            })

        this.subscriptions = new CompositeDisposable();
        /* 项目模板指令集. */
        this.setTemplateCommand('Project');
        /* 页面模板指令集. */
        this.setTemplateCommand('Page');
        /* wifi 同步指令. */
        atom.commands.add('atom-workspace', 'Minxing:previewWifi',
            (event) => (this.convertCommandToMethod({
                event: event
            })))
        atom.commands.add('atom-workspace', 'Minxing:syncWifi',
            (event) => (this.convertCommandToMethod({
                event: event
            })))
        atom.commands.add('atom-workspace', 'Minxing:syncAllWifi',
            (event) => (this.convertCommandToMethod({
                event: event
            })))
        atom.commands.add('atom-workspace', 'Minxing:wifiLog',
            (event) => (this.convertCommandToMethod({
                event: event
            })))
        atom.commands.add('atom-workspace', 'Minxing:wifiInfo',
            (event) => (this.convertCommandToMethod({
                event: event
            })))
        atom.commands.add('atom-workspace', 'Minxing:buildToMinxing',
            (event) => (this.convertCommandToMethod({
                event: event
            })))
        atom.commands.add('atom-workspace', 'Minxing:uploadToMinxing',
            (event) => (this.convertCommandToMethod({
                event: event
            })))
    },
    deactivate() {
        this.modalPanel && this.modalPanel.destroy();
        this.subscriptions.dispose();
        APICloud.endWifi({})
    },
    serialize() {
        /* 实时记录正在使用的端口. */
        return {};
    },
    getdatasetPath({event}) {
        const target = event.target;
        let path = '';
        if (target.dataset && target.dataset.path) {
            path = target.dataset.path;
        } else if (target.lastChild){
            path = target.lastChild.dataset.path
        }
        return path;
    },
    /* 将指令解析为对应的参数与方法,指令与方法对应的规则为: 命令空间:方法名,参数1=值1,参数2=值2,
        event 为保留参数,用于传递完整字段. */
    convertCommandToMethod({
        event: event
    }) {
        const namespace = "Minxing:"
        let command = event.type
        
        if (!(new RegExp(`^${namespace}`)).test(command)) { // 说明不是自己插件的方法.
            return
        }

        let methodName = ""
        let params = {
            event: event
        }

        let methodInfo = command.substring(namespace.length, command.length).split(",")
        methodInfo.map((item, idx) => {
            if (0 === idx) {
                methodName = item
            } else {
                let paramPair = item.split("=")
                if (paramPair && 2 === paramPair.length) {
                    params[paramPair[0]] = paramPair[1]
                }
            }
        })

        if ("function" === typeof this[methodName]) {
            this[methodName](params)
        } else {
            console.warning(`${methodName} 似乎不是一个有效的方法`)
        }
    },
    /* 新建 APICloud 页面框架. */
    addPageTemplate({
        type,
        template,
        event
    }) {
        const filePath = this.getdatasetPath({ event });
        const projectRootInfo = MXAPI.Utils.fetchProjectRootInfoByFile(filePath);
        if (!projectRootInfo) {
            const errMsg = `${filePath} 不在一个有效的敏行项目中!`;
            console.log(errMsg);
            atom.notifications.addWarning(errMsg);
            return;
        }
        if (type !== projectRootInfo.type) {
            const errMsg = `模版类型与项目类型不符！`;
            console.log(errMsg);
            atom.notifications.addWarning(errMsg);
            return;
        }
        const outputPath = MXAPI.Template.page.getOutputPath({
            type,
            projectRootPath: projectRootInfo.path,
            filePath
        });
        const addDialog = new AddDialog(type, outputPath, projectRootInfo.path, template);
        addDialog.attach();
    },
    /* 新建 APICloud 项目模板. */
    addProjectTemplate({
        type,
        template,
        event
    }) {
        let name = template

        dialog.showSaveDialog({
            title: "创建 敏行项目 项目模板",

            properties: ['createDirectory']
        }, (project) => {
            if (!project) {
                console.log("用户取消操作")
                return
            }

            let projectRootPath = project

            let workspacePath = Path.resolve(projectRootPath, "../")

            name = Path.basename(projectRootPath)
            MXAPI.Template.project.add({
                type: type,
                name: name,
                template: template,
                output: workspacePath
            })
            let newAppProjectPath = Path.resolve(workspacePath, name);
            atom.project.addPath(newAppProjectPath);
        })
    },
    previewWifi({
        event
    }) {
        let {
            port,
            ip,
            clientsCount
        } = APICloud.wifiInfo()
        let tip = "同步成功,请在手机上查看运行效果!"
        if (0 === clientsCount) {
            tip = "当前网速过慢或没有设备处于连接状态,可能会影响相关同步功能的使用"
        }

        let filePath = this.getdatasetPath({ event });

        if (!filePath) {
            let textEditor = atom.workspace.getActiveTextEditor()
            filePath = textEditor && textEditor.getPath()
        }

        if (!filePath) {
            atom.notifications.addInfo("似乎没有可供预览的文件")
            return
        }

        APICloud.previewWifi({
            file: filePath
        })
        atom.notifications.addInfo(tip)
    },
    syncWifi({
        event
    }) {
        this.syncAllWifi({
            event: event,
            syncAll: false
        })
    },
    syncAllWifi({
        event,
        syncAll = true
    }) {
        let tip = "同步成功,请在手机上查看运行效果!"

        let {
            port,
            ip,
            clientsCount
        } = APICloud.wifiInfo()

        if (0 === clientsCount) {
            tip = "当前网速过慢或没有设备处于连接状态,可能会影响相关同步功能的使用"
        }
        const filePath = this.getdatasetPath({ event });
        const projectRootInfo = MXAPI.Utils.fetchProjectRootInfoByFile(filePath);
        if (!projectRootInfo) {
            atom.notifications.addWarning(`${filePath} 不在一个有效的敏行项目中!`);
            return;
        };

        syncAll = syncAll ? 1 : 0;

        APICloud.syncWifi({
            projectPath: projectRootInfo.path,
            syncAll: syncAll
        });
        atom.notifications.addInfo(tip);
    },
    wifiLog({
        event
    }) {
        atom.openDevTools()
            .then(() => {
                const defaultSuccessTip = "请在Atom开发控制台查看日志信息"
                atom.notifications.addInfo(defaultSuccessTip)
            })
    },
    wifiInfo({
        event
    }) {
        let {
            port,
            ip,
            clientsCount
        } = APICloud.wifiInfo()

        atom.openDevTools()
            .then(() => {
                let tip = `IP :${JSON.stringify(ip)}\n端口:${port}\n设备连接数:${clientsCount}`
                console.log(tip)

                atom.notifications.addInfo(tip, {
                    "detail": "还可在Atom控制台末尾随时查看;ip地址有可能有多个,哪个可用,取决你和电脑所处的网络",
                })
            })
    },
    startWifi({
        event,
        port
    }) {
        APICloud.startWifi({
            port: port
        })
        console.log("APICloud WiFi 真机同步服务已启动")
    },
    endWifi({
        event
    }) {
        APICloud.endWifi({})
        console.log("APICloud WiFi 真机同步服务已关闭")
    },
    buildToMinxing({
        event
    }) {
        const filePath = this.getdatasetPath({ event });
        const projectRootInfo = MXAPI.Utils.fetchProjectRootInfoByFile(filePath);

        if (!projectRootInfo) {
            atom.notifications.addWarning(`${filePath} 不在一个有效的敏行项目中!`)
            return
        };

        dialog.showOpenDialog({
            title: "选择打包后的文件存放目录",
            properties: ['openDirectory']
        }, (savePathArr) => {
            if (!savePathArr || savePathArr.length === 0) {
                console.log("用户取消操作")
                return
            }
            const savePath = savePathArr[0];
            
            MXAPI.build({
                projectRootPath: projectRootInfo.path,
                savePath
            })
            .then(function(appInfo) {
                const zipPath = appInfo.path;
                const tip = `已成功打包为敏行插件应用!目录为${zipPath}`;
                atom.notifications.addInfo(tip, {
                    "detail": "还可在Atom控制台末尾随时查看",
                })
            })
            .catch(e => {
                const tip = `打包出错!`;
                atom.notifications.addError(tip, {
                    "detail": `${e}`
                })
            });
        })
    }
};