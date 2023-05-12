
var host = host || {};

const electron = require('electron');
const fs = require('fs');
const process = require('process');
const path = require('path');
const base = require('./base');

host.ElectronHost = class {

    constructor() {
        this._document = window.document;
        this._window = window;
        process.on('uncaughtException', (err) => {
            this.exception(err, true);
            this._terminate(err.message);
        });
        this._window.eval = global.eval = () => {
            throw new Error('window.eval() not supported.');
        };
        this._window.addEventListener('unload', () => {
            if (typeof __coverage__ !== 'undefined') {
                const file = path.join('.nyc_output', path.basename(window.location.pathname, '.html')) + '.json';
                /* eslint-disable no-undef */
                fs.writeFileSync(file, JSON.stringify(__coverage__));
                /* eslint-enable no-undef */
            }
        });
        this._environment = electron.ipcRenderer.sendSync('get-environment', {});
        this._environment.menu = this._environment.titlebar && this._environment.platform !== 'darwin';
        this._element('menu-button').style.opacity = 0;
        this._files = [];
        if (!/^\d\.\d\.\d$/.test(this.version)) {
            throw new Error('Invalid version.');
        }
    }

    get window() {
        return this._window;
    }

    get document() {
        return this._document;
    }

    get version() {
        return this._environment.version;
    }

    get type() {
        return 'Electron';
    }

    async view(view) {
        this._view = view;
        electron.ipcRenderer.on('open', (_, data) => {
            this._open(data);
        });
    }

    start() {
        if (this._files) {
            const files = this._files;
            delete this._files;
            if (files.length > 0) {
                const data = files.pop();
                this._open(data);
            }
        }

        this._window.addEventListener('focus', () => {
            this._document.body.classList.add('active');
        });
        this._window.addEventListener('blur', () => {
            this._document.body.classList.remove('active');
        });
        if (this._document.hasFocus()) {
            this._document.body.classList.add('active');
        }
        electron.ipcRenderer.on('recents', (_, data) => {
            this._view.recents(data);
        });
        electron.ipcRenderer.on('export', (_, data) => {
            this._view.export(data.file);
        });
        electron.ipcRenderer.on('cut', () => {
            this._view.cut();
        });
        electron.ipcRenderer.on('copy', () => {
            this._view.copy();
        });
        electron.ipcRenderer.on('paste', () => {
            this._view.paste();
        });
        electron.ipcRenderer.on('selectall', () => {
            this._view.selectAll();
        });
        electron.ipcRenderer.on('toggle', (sender, name) => {
            this._view.toggle(name);
            this._update(Object.assign({}, this._view.options));
        });
        electron.ipcRenderer.on('zoom-in', () => {
            this._element('zoom-in-button').click();
        });
        electron.ipcRenderer.on('zoom-out', () => {
            this._element('zoom-out-button').click();
        });
        electron.ipcRenderer.on('reset-zoom', () => {
            this._view.resetZoom();
        });
        electron.ipcRenderer.on('show-properties', () => {
            this._element('sidebar-button').click();
        });
        electron.ipcRenderer.on('find', () => {
            this._view.find();
        });
        electron.ipcRenderer.on('about', () => {
            this._view.about();
        });

        this._element('titlebar-close').addEventListener('click', () => {
            electron.ipcRenderer.sendSync('window-close', {});
        });
        this._element('titlebar-toggle').addEventListener('click', () => {
            electron.ipcRenderer.sendSync('window-toggle', {});
        });
        this._element('titlebar-minimize').addEventListener('click', () => {
            electron.ipcRenderer.sendSync('window-minimize', {});
        });
        electron.ipcRenderer.on('window-state', (_, data) => {
            if (this._environment.titlebar) {
                this._element('graph').style.marginTop = '32px';
                this._element('graph').style.height = 'calc(100% - 32px)';
                this._element('sidebar-title').style.marginTop = '24px';
                this._element('sidebar-closebutton').style.marginTop = '24px';
                this._element('titlebar').classList.add('titlebar-visible');
            }
            if (this._environment.titlebar && this._environment.platform !== 'darwin' && !data.fullscreen) {
                this._element('titlebar-control-box').classList.add('titlebar-control-box-visible');
            } else {
                this._element('titlebar-control-box').classList.remove('titlebar-control-box-visible');
            }
            this._element('menu-button').style.opacity = this._environment.menu ? 1 : 0;
            this._element('titlebar-maximize').style.opacity = data.maximized ? 0 : 1;
            this._element('titlebar-restore').style.opacity = data.maximized ? 1 : 0;
            this._element('titlebar-toggle').setAttribute('title', data.maximized ? 'Restore' : 'Maximize');
        });
        electron.ipcRenderer.sendSync('update-window-state', {});

        const openFileButton = this._element('open-file-button');
        if (openFileButton) {
            openFileButton.addEventListener('click', () => {
                this.execute('open');
            });
        }

        this.document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        this.document.addEventListener('drop', (e) => {
            e.preventDefault();
        });
        this.document.body.addEventListener('drop', (e) => {
            e.preventDefault();
            const paths = Array.from(e.dataTransfer.files).map(((file) => file.path));
            if (paths.length > 0) {
                electron.ipcRenderer.send('drop-paths', { paths: paths });
            }
            return false;
        });
        this._view.show('welcome');
    }

    environment(name) {
        return this._environment[name];
    }

    async error(message, detail) {
        const options = {
            type: 'error',
            message: message,
            detail: detail,
            buttons: [ 'Report', 'Cancel' ]
        };
        return electron.ipcRenderer.sendSync('show-message-box', options);
        // await this._message(message + ': ' + detail, 'Report');
        // return 0;
    }

    confirm(message, detail) {
        const result = electron.ipcRenderer.sendSync('show-message-box', {
            type: 'question',
            message: message,
            detail: detail,
            buttons: ['Yes', 'No'],
            defaultId: 0,
            cancelId: 1
        });
        return result === 0;
    }

    async require(id) {
        return require(id);
    }

    save(name, extension, defaultPath, callback) {
        const selectedFile = electron.ipcRenderer.sendSync('show-save-dialog', {
            title: 'Export Tensor',
            defaultPath: defaultPath,
            buttonLabel: 'Export',
            filters: [ { name: name, extensions: [ extension ] } ]
        });
        if (selectedFile) {
            callback(selectedFile);
        }
    }

    async export(file, blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            fs.writeFile(file, data, null, (err) => {
                if (err) {
                    this.exception(err, false);
                    this.error('Error writing file.', err.message);
                }
            });
        };

        let err = null;
        if (!blob) {
            err = new Error("Export blob is '" + JSON.stringify(blob) + "'.");
        } else if (!(blob instanceof Blob)) {
            err = new Error("Export blob type is '" + (typeof blob) + "'.");
        }

        if (err) {
            this.exception(err, false);
            await this.error('Error exporting image.', err.message);
        } else {
            reader.readAsArrayBuffer(blob);
        }
    }

    execute(name, value) {
        electron.ipcRenderer.send('execute', { name: name, value: value });
    }

    request(file, encoding, basename) {
        return new Promise((resolve, reject) => {
            const pathname = path.join(basename || __dirname, file);
            fs.stat(pathname, (err, stat) => {
                if (err && err.code === 'ENOENT') {
                    reject(new Error("The file '" + file + "' does not exist."));
                } else if (err) {
                    reject(err);
                } else if (!stat.isFile()) {
                    reject(new Error("The path '" + file + "' is not a file."));
                } else if (stat && stat.size < 0x7ffff000) {
                    fs.readFile(pathname, encoding, (err, data) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(encoding ? data : new base.BinaryStream(data));
                        }
                    });
                } else if (encoding) {
                    reject(new Error("The file '" + file + "' size (" + stat.size.toString() + ") for encoding '" + encoding + "' is greater than 2 GB."));
                } else {
                    resolve(new host.ElectronHost.FileStream(pathname, 0, stat.size, stat.mtimeMs));
                }
            });
        });
    }

    openURL(url) {
        electron.shell.openExternal(url);
    }

    // eslint-disable-next-line no-unused-vars
    exception(error, fatal) {
    }

    // eslint-disable-next-line no-unused-vars
    event_ua(category, action, label, value) {

    }

    // eslint-disable-next-line no-unused-vars
    event(name, params) {
    }

    async _context(location) {
        const basename = path.basename(location);
        const stat = fs.statSync(location);
        if (stat.isFile()) {
            const dirname = path.dirname(location);
            const stream = await this.request(basename, null, dirname);
            return new host.ElectronHost.Context(this, dirname, basename, stream);
        } else if (stat.isDirectory()) {
            const entries = new Map();
            const walk = (dir) => {
                for (const item of fs.readdirSync(dir)) {
                    const pathname = path.join(dir, item);
                    const stat = fs.statSync(pathname);
                    if (stat.isDirectory()) {
                        walk(pathname);
                    } else if (stat.isFile()) {
                        const stream = new host.ElectronHost.FileStream(pathname, 0, stat.size, stat.mtimeMs);
                        const name = pathname.split(path.sep).join(path.posix.sep);
                        entries.set(name, stream);
                    }
                }
            };
            walk(location);
            return new host.ElectronHost.Context(this, location, basename, null, entries);
        }
        throw new Error("Unsupported path stat '" + JSON.stringify(stat) + "'.");
    }

    async _open(location) {
        if (this._files) {
            this._files.push(location);
            return;
        }
        const path = location.path;
        const stat = fs.existsSync(path) ? fs.statSync(path) : null;
        const size = stat && stat.isFile() ? stat.size : 0;
        if (path && this._view.accept(path, size)) {
            this._view.show('welcome spinner');
            try {
                const context = await this._context(path);
                try {
                    const model = await this._view.open(context);
                    this._view.show(null);
                    const options = Object.assign({}, this._view.options);
                    if (model) {
                        options.path = path;
                        this._title(location.label);
                    }
                    this._update(options);
                } catch (error) {
                    const options = Object.assign({}, this._view.options);
                    if (error) {
                        await this._view.error(error, null, null);
                        options.path = null;
                    }
                    this._update(options);
                }
            } catch (error) {
                await this._view.error(error, 'Error while reading file.', null);
                this._update({ path: null });
            }
        }
    }

    _title(label) {
        const element = this._element('titlebar-content-text');
        if (element) {
            element.innerHTML = '';
            if (label) {
                const path = label.split(this._environment.separator || '/');
                for (let i = 0; i < path.length; i++) {
                    const span = this.document.createElement('span');
                    span.innerHTML = ' ' + path[i] + ' ' + (i !== path.length - 1 ? '<svg class="titlebar-icon" aria-hidden="true"><use xlink:href="#icon-arrow-right"></use></svg>' : '');
                    element.appendChild(span);
                }
            }
        }
    }

    _element(id) {
        return this.document.getElementById(id);
    }

    _update(data) {
        electron.ipcRenderer.send('window-update', data);
    }

    _terminate(message, action, callback) {
        this._element('message-text').innerText = message;
        const button = this._element('message-button');
        if (action && callback) {
            button.style.removeProperty('display');
            button.innerText = action;
            button.onclick = () => callback();
            button.focus();
        } else {
            button.style.display = 'none';
            button.onclick = null;
        }
        this._document.body.setAttribute('class', 'welcome message');
    }

    _message(message, action) {
        return new Promise((resolve) => {
            this._element('message-text').innerText = message;
            const button = this._element('message-button');
            if (action) {
                button.style.removeProperty('display');
                button.innerText = action;
                button.onclick = () => {
                    button.onclick = null;
                    this._document.body.classList.remove('message');
                    resolve();
                };
                button.focus();
            } else {
                button.style.display = 'none';
                button.onclick = null;
            }
            this._document.body.classList.add('message');
        });
    }
};


host.ElectronHost.FileStream = class {

    constructor(file, start, length, mtime) {
        this._file = file;
        this._start = start;
        this._length = length;
        this._position = 0;
        this._mtime = mtime;
    }

    get position() {
        return this._position;
    }

    get length() {
        return this._length;
    }

    stream(length) {
        const file = new host.ElectronHost.FileStream(this._file, this._position, length, this._mtime);
        this.skip(length);
        return file;
    }

    seek(position) {
        this._position = position >= 0 ? position : this._length + position;
    }

    skip(offset) {
        this._position += offset;
        if (this._position > this._length) {
            throw new Error('Expected ' + (this._position - this._length) + ' more bytes. The file might be corrupted. Unexpected end of file.');
        }
    }

    peek(length) {
        length = length !== undefined ? length : this._length - this._position;
        if (length < 0x10000000) {
            const position = this._fill(length);
            this._position -= length;
            return this._buffer.subarray(position, position + length);
        }
        const position = this._position;
        this.skip(length);
        this.seek(position);
        const buffer = new Uint8Array(length);
        this._read(buffer, position);
        return buffer;
    }

    read(length) {
        length = length !== undefined ? length : this._length - this._position;
        if (length < 0x10000000) {
            const position = this._fill(length);
            return this._buffer.subarray(position, position + length);
        }
        const position = this._position;
        this.skip(length);
        const buffer = new Uint8Array(length);
        this._read(buffer, position);
        return buffer;
    }

    byte() {
        const position = this._fill(1);
        return this._buffer[position];
    }

    _fill(length) {
        if (this._position + length > this._length) {
            throw new Error('Expected ' + (this._position + length - this._length) + ' more bytes. The file might be corrupted. Unexpected end of file.');
        }
        if (!this._buffer || this._position < this._offset || this._position + length > this._offset + this._buffer.length) {
            this._offset = this._position;
            this._buffer = new Uint8Array(Math.min(0x10000000, this._length - this._offset));
            this._read(this._buffer, this._offset);
        }
        const position = this._position;
        this._position += length;
        return position - this._offset;
    }

    _read(buffer, offset) {
        const descriptor = fs.openSync(this._file, 'r');
        const stat = fs.statSync(this._file);
        if (stat.mtimeMs != this._mtime) {
            throw new Error("File '" + this._file + "' last modified time changed.");
        }
        try {
            fs.readSync(descriptor, buffer, 0, buffer.length, offset + this._start);
        } finally {
            fs.closeSync(descriptor);
        }
    }
};

host.ElectronHost.Context = class {

    constructor(host, folder, identifier, stream, entries) {
        this._host = host;
        this._folder = folder;
        this._identifier = identifier;
        this._stream = stream;
        this._entries = entries || new Map();
    }

    get identifier() {
        return this._identifier;
    }

    get stream() {
        return this._stream;
    }

    get entries() {
        return this._entries;
    }

    request(file, encoding, base) {
        return this._host.request(file, encoding, base === undefined ? this._folder : base);
    }

    require(id) {
        return this._host.require(id);
    }

    exception(error, fatal) {
        this._host.exception(error, fatal);
    }
};

window.addEventListener('load', () => {
    global.protobuf = require('./protobuf');
    global.flatbuffers = require('./flatbuffers');
    const value = new host.ElectronHost();
    const view = require('./view');
    window.__view__ = new view.View(value);
});
