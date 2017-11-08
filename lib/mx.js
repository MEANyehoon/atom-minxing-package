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

// const APICloud = require("apicloud-tools-core");


const APICloud = MXAPI.APICloud;
const querystring = require('querystring')
const http = require("http")
const remote = require("remote")
const dialog = remote.require("dialog") || remote["dialog"]
const fs = require("fs")

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

        var req = http.request(options, (res) => {
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                try {
                    let body = JSON.parse(chunk.toString())
                    if (body && body.status === 1) {
                        console.log("与 APICloud 建立连接!")
                    } else {
                        console.log("可能无法连接 APICloud !")
                    }
                } catch (err) {
                    console.log("可能无法连接 APICloud !")
                }
            });
        });

        req.on('error', (e) => {
            console.log(`problem with request: ${e.message}`);
        });
        req.write(postData);
        req.end();
    },
    setupAppTemplateCommand() {
        const config = MXAPI.getAppTemplateConfig();
        const typeKeys = Object.keys(config);
        typeKeys.forEach(type => {
            const templates = Object.keys(config[type]);
            templates.forEach(template => {
                atom.commands.add('atom-workspace', `apicloud:initApp,type=${type},template=${template}`,
                    (event) => (this.convertCommandToMethod({
                        event: event
                    })))
            })
        })
    },
    setupFileTemplateCommand() {
        const config = MXAPI.getPageTemplateConfig();
        const templates = Object.keys(config);
        templates.forEach(template => {
            atom.commands.add('atom-workspace', `apicloud:addFileTemplate,template=${template}`,
                (event) => (this.convertCommandToMethod({
                    event: event
                })))
        })
    },
    activate(state) {
        /* 统计信息 */
        this.report()

        /* 真机同步服务自启动. */
        // let port = this.getRandomIntInclusive(1001, 9999);
        let port = 3333;
        console.log(`随机使用端口:${port}`)

        this.port = port;
        this.tempPath = Path.resolve(Path.dirname(__dirname), 'temp');
        
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
        this.setupAppTemplateCommand();
        /* 页面模板指令集. */
        this.setupFileTemplateCommand();
        console.log('__dir->', __dirname);
        /* wifi 同步指令. */
        atom.commands.add('atom-workspace', 'apicloud:previewWifi',
            (event) => (this.convertCommandToMethod({
                event: event
            })))
        atom.commands.add('atom-workspace', 'apicloud:syncWifi',
            (event) => (this.convertCommandToMethod({
                event: event
            })))
        atom.commands.add('atom-workspace', 'apicloud:syncAllWifi',
            (event) => (this.convertCommandToMethod({
                event: event
            })))
        atom.commands.add('atom-workspace', 'apicloud:wifiLog',
            (event) => (this.convertCommandToMethod({
                event: event
            })))
        atom.commands.add('atom-workspace', 'apicloud:wifiInfo',
            (event) => (this.convertCommandToMethod({
                event: event
            })))
        atom.commands.add('atom-workspace', 'apicloud:buildToMinxing',
            (event) => (this.convertCommandToMethod({
                event: event
            })))
        atom.commands.add('atom-workspace', 'apicloud:uploadToMinxing',
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
    /* 将指令解析为对应的参数与方法,指令与方法对应的规则为: 命令空间:方法名,参数1=值1,参数2=值2,
        event 为保留参数,用于传递完整字段. */
    convertCommandToMethod({
        event: event
    }) {
        const namespace = "apicloud:"
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
    addFileTemplate({
        template,
        event
    }) {
        let name = template

        dialog.showSaveDialog({
            title: "创建 APICloud 页面框架--输入页面名称,并选中项目根目录",
            properties: ['createDirectory']
        }, (project) => {
            if (!project) {
                console.log("用户取消操作")
                return
            }

            name = Path.basename(project)

            let projectRootPath = Path.resolve(project, "../")

            if (!fs.existsSync(Path.resolve(projectRootPath, "config.xml"))) {
                atom.notifications.addWarning(`${projectRootPath} 不是有效的APICloud项目!`)
                return
            }

            atom.project.addPath(projectRootPath)
            APICloud.addFileTemplate({
                name: name,
                output: projectRootPath,
                template: template
            })
        })
    },
    /* 新建 APICloud 项目模板. */
    initApp({
        type,
        template,
        event
    }) {
        let name = template

        dialog.showSaveDialog({
            title: "创建 APICloud 项目模板",

            properties: ['createDirectory']
        }, (project) => {
            if (!project) {
                console.log("用户取消操作")
                return
            }

            let projectRootPath = project

            let workspacePath = Path.resolve(projectRootPath, "../")

            name = Path.basename(projectRootPath)
            MXAPI.init({
                type: type,
                name: name,
                template: template,
                output: workspacePath
            })
            let newAppProjectPath = Path.resolve(workspacePath, name)
            atom.project.addPath(newAppProjectPath)
        })
    },
    /* 获取当前活跃的工程目录,如果event存在,将优先使用event中文件路径所在的路径. */
    fetchProjectRootPath({
        event
    }) {
        // 优先 event 里的.
        let projectPaths = atom.project.getPaths()

        if (!projectPaths || 1 === projectPaths.length) {
            return projectPaths[0]
        }

        let textEditor = atom.workspace.getActiveTextEditor()
        let textPath = textEditor && textEditor.getPath()

        let targetProjectPath = [event.target.dataset.path, textPath].reduce(
            (targetProjectPath, domPath, index) => {
                if (targetProjectPath || !domPath) {
                    return targetProjectPath
                }

                let targetPath = domPath

                for (let i = 0; i < projectPaths.length; i++) {
                    let projectPath = projectPaths[i]

                    if (targetPath.startsWith(projectPath) &&
                        fs.existsSync(Path.resolve(projectPath, "plugin.properties"))
                    ) {
                        return projectPath
                    }
                }
            }, null)

        return targetProjectPath ? targetProjectPath : projectPaths[0]
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

        let filePath = event.target.dataset.path

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
        console.log('syncAllWifi event->', event);
        let projectRootPath = this.fetchProjectRootPath({
            event: event
        })

        if (!fs.existsSync(Path.resolve(projectRootPath, "plugin.properties"))) {
            atom.notifications.addWarning(`${projectRootPath} 不是有效的敏行项目!`)
            return
        }

        syncAll = syncAll ? 1 : 0

        APICloud.syncWifi({
            projectPath: projectRootPath,
            syncAll: syncAll
        })
        atom.notifications.addInfo(tip)
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
        console.log('build to minxing event->', event);
        dialog.showOpenDialog({
            title: "选择打包后的文件存放目录",
            properties: ['openDirectory']
        }, (savePathArr) => {
            if (!savePathArr || savePathArr.length === 0) {
                console.log("用户取消操作")
                return
            }
            const savePath = savePathArr[0];
            const projectRootPath = this.fetchProjectRootPath({
                event: event
            });
    
            if (!fs.existsSync(Path.resolve(projectRootPath, "plugin.properties"))) {
                atom.notifications.addWarning(`${projectRootPath} 不是有效的敏行项目!`)
                return
            };
            MXAPI.build({projectRootPath, savePath})
                .then(function(appInfo) {
                    const zipPath = appInfo.path;
                    console.log('已成功打包为敏行插件应用', zipPath);
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
    },
    uploadToMinxing({
        event
    }) {
        const projectRootPath = this.fetchProjectRootPath({
            event: event
        });

        if (!fs.existsSync(Path.resolve(projectRootPath, "config.xml"))) {
            atom.notifications.addWarning(`${projectRootPath} 不是有效的APICloud项目!`)
            return
        };
        const serverUrl = atom.config.get('mx.minxingServerUrl');
        MXAPI.uploadToMinxing({projectRootPath, serverUrl});
    }
};