
var host = {};

host.BrowserHost = class {

    constructor() {
        this._window = window;
        this._navigator = window.navigator;
        this._document = window.document;
        this._window.eval = () => {
            throw new Error('window.eval() not supported.');
        };
        this._meta = {};
        for (const element of Array.from(this._document.getElementsByTagName('meta'))) {
            if (element.name !== undefined && element.content !== undefined) {
                this._meta[element.name] = this._meta[element.name] || [];
                this._meta[element.name].push(element.content);
            }
        }
        this._environment = {
            name: this._document.title,
            type: this._meta.type ? this._meta.type[0] : 'Browser',
            version: this._meta.version ? this._meta.version[0] : null,
            date: Array.isArray(this._meta.date) && this._meta.date.length > 0 && this._meta.date[0] ? new Date(this._meta.date[0].split(' ').join('T') + 'Z') : new Date(),
            platform: /(Mac|iPhone|iPod|iPad)/i.test(this._navigator.platform) ? 'darwin' : undefined,
            agent: this._navigator.userAgent.toLowerCase().indexOf('safari') !== -1 && this._navigator.userAgent.toLowerCase().indexOf('chrome') === -1 ? 'safari' : '',
            repository: this._element('logo-github').getAttribute('href'),
            menu: true
        };
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
        return this._environment.type;
    }

    view(view) {
        this._view = view;
        return  this._capabilities();
    }

    _capabilities() {
        const list = [
            'TextDecoder', 'TextEncoder',
            'fetch', 'URLSearchParams',
            'HTMLCanvasElement.prototype.toBlob',
            'DataView.prototype.getBigInt64',
            'Worker', 'Promise', 'Symbol.asyncIterator'
        ];
        const capabilities = list.filter((capability) => {
            const path = capability.split('.').reverse();
            let obj = this.window[path.pop()];
            while (obj && path.length > 0) {
                obj = obj[path.pop()];
            }
            return obj;
        });
        this.event('browser_open', {
            browser_capabilities: capabilities.map((capability) => capability.split('.').pop()).join(',')
        });
        if (capabilities.length < list.length) {
            this.window.terminate('Your browser is not supported.');
            return new Promise(() => {});
        }
        return Promise.resolve();
    }

    start() {

        const hash = this.window.location.hash ? this.window.location.hash.replace(/^#/, '') : '';
        const search = this.window.location.search;
        const params = new URLSearchParams(search + (hash ? '&' + hash : ''));

        if (this._meta.file && this._meta.identifier) {
            const url = this._meta.file[0];
            if (this._view.accept(url)) {
                this._openModel(this._url(url), null);
                this._document.title = this._meta.identifier;
                return;
            }
        }

        const url = params.get('url');
        if (url) {
            const identifier = params.get('identifier') || null;
            const location = url
                .replace(new RegExp('^https://github.com/([\\w]*/[\\w]*)/blob/([\\w/_.]*)(\\?raw=true)?$'), 'https://raw.githubusercontent.com/$1/$2')
                .replace(new RegExp('^https://huggingface.co/(.*)/blob/(.*)$'), 'https://huggingface.co/$1/resolve/$2');
            if (this._view.accept(identifier || location)) {
                this._openModel(location, identifier).then((identifier) => {
                    this.document.title = identifier;
                });
                return;
            }
        }

        const gist = params.get('gist');
        if (gist) {
            this._openGist(gist);
            return;
        }

        const openFileButton = this._element('open-file-button');
        const openFileDialog = this._element('open-file-dialog');
        if (openFileButton && openFileDialog) {
            openFileButton.addEventListener('click', () => {
                this.execute('open');
            });
            const mobileSafari = this.environment('platform') === 'darwin' && navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
            if (!mobileSafari) {
                const base = require('./base');
                const extensions = new base.Metadata().extensions.map((extension) => '.' + extension);
                openFileDialog.setAttribute('accept', extensions.join(', '));
            }
            openFileDialog.addEventListener('change', (e) => {
                if (e.target && e.target.files && e.target.files.length > 0) {
                    const files = Array.from(e.target.files);
                    const file = files.find((file) => this._view.accept(file.name, file.size));
                    if (file) {
                        this._open(file, files);
                    }
                }
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
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const files = Array.from(e.dataTransfer.files);
                const file = files.find((file) => this._view.accept(file.name, file.size));
                if (file) {
                    this._open(file, files);
                }
            }
        });

        this._view.show('welcome');
    }

    environment(name) {
        return this._environment[name];
    }

    error(message, detail) {
        alert((message == 'Error' ? '' : message + ' ') + detail);
        return Promise.resolve(0);
    }

    confirm(message, detail) {
        return confirm(message + ' ' + detail);
    }

    require(id) {
        return new Promise((resolve, reject) => {
            this.window.require(id, (module) => resolve(module), (error) => reject(error));
        });
    }

    save(name, extension, defaultPath, callback) {
        callback(defaultPath + '.' + extension);
    }

    export(file, blob) {
        const element = this.document.createElement('a');
        element.download = file;
        element.href = URL.createObjectURL(blob);
        this.document.body.appendChild(element);
        element.click();
        this.document.body.removeChild(element);
    }

    execute(name /*, value */) {
        switch (name) {
            case 'open': {
                const openFileDialog = this._element('open-file-dialog');
                if (openFileDialog) {
                    openFileDialog.value = '';
                    openFileDialog.click();
                }
                break;
            }
            case 'report-issue': {
                this.openURL(this.environment('repository') + '/issues/new');
                break;
            }
            case 'about': {
                this._view.about();
                break;
            }
            default: {
                break;
            }
        }
    }

    request(file, encoding, base) {
        const url = base ? (base + '/' + file) : this._url(file);
        return this._request(url, null, encoding);
    }

    openURL(url) {
        this.window.location = url;
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

    _request(url, headers, encoding, callback, timeout) {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            if (!encoding) {
                request.responseType = 'arraybuffer';
            }
            if (timeout) {
                request.timeout = timeout;
            }
            const error = (status) => {
                const err = new Error("The web request failed with status code " + status + " at '" + url + "'.");
                err.type = 'error';
                err.url = url;
                return err;
            };
            const progress = (value) => {
                if (callback) {
                    callback(value);
                }
            };
            request.onload = () => {
                progress(0);
                if (request.status == 200) {
                    if (request.responseType == 'arraybuffer') {
                        const base = require('./base');
                        const buffer = new Uint8Array(request.response);
                        const stream = new base.BinaryStream(buffer);
                        resolve(stream);
                    } else {
                        resolve(request.responseText);
                    }
                } else {
                    reject(error(request.status));
                }
            };
            request.onerror = (e) => {
                progress(0);
                const err = error(request.status);
                err.type = e.type;
                reject(err);
            };
            request.ontimeout = () => {
                progress(0);
                request.abort();
                const err = new Error("The web request timed out in '" + url + "'.");
                err.type = 'timeout';
                err.url = url;
                reject(err);
            };
            request.onprogress = (e) => {
                if (e && e.lengthComputable) {
                    progress(e.loaded / e.total * 100);
                }
            };
            request.open('GET', url, true);
            if (headers) {
                for (const name of Object.keys(headers)) {
                    request.setRequestHeader(name, headers[name]);
                }
            }
            request.send();
        });
    }

    _url(file) {
        file = file.startsWith('./') ? file.substring(2) : file.startsWith('/') ? file.substring(1) : file;
        const location = this.window.location;
        const pathname = location.pathname.endsWith('/') ?
            location.pathname :
            location.pathname.split('/').slice(0, -1).join('/') + '/';
        return location.protocol + '//' + location.host + pathname + file;
    }

    _openModel(url, identifier) {
        url = url.startsWith('data:') ? url : url + ((/\?/).test(url) ? '&' : '?') + 'cb=' + (new Date()).getTime();
        this._view.show('welcome spinner');
        const progress = (value) => {
            this._view.progress(value);
        };
        return this._request(url, null, null, progress).then((stream) => {
            const context = new host.BrowserHost.Context(this, url, identifier, stream);
            return this._view.open(context).then(() => {
                return identifier || context.identifier;
            }).catch((err) => {
                if (err) {
                    this._view.error(err, null, 'welcome');
                }
            });
        }).catch((err) => {
            this.error('Model load request failed.', err.message).then(() => {
                this._view.show('welcome');
            });
        });
    }

    _open(file, files) {
        this._view.show('welcome spinner');
        const context = new host.BrowserHost.BrowserFileContext(this, file, files);
        context.open().then(() => {
            return this._view.open(context).then((model) => {
                this._view.show(null);
                this.document.title = files[0].name;
                return model;
            });
        }).catch((error) => {
            this._view.error(error, null, null);
        });
    }

    _openGist(gist) {
        this._view.show('welcome spinner');
        const url = 'https://api.github.com/gists/' + gist;
        this._request(url, { 'Content-Type': 'application/json' }, 'utf-8').then((text) => {
            const json = JSON.parse(text);
            if (json.message) {
                return this.error('Error while loading Gist.', json.message);
            }
            const key = Object.keys(json.files).find((key) => this._view.accept(json.files[key].filename));
            if (!key) {
                return this.error('Error while loading Gist.', 'Gist does not contain a model file.');
            }
            const base = require('./base');
            const file = json.files[key];
            const identifier = file.filename;
            const encoder = new TextEncoder();
            const buffer = encoder.encode(file.content);
            const stream = new base.BinaryStream(buffer);
            const context = new host.BrowserHost.Context(this, '', identifier, stream);
            this._view.open(context).then(() => {
                this.document.title = identifier;
            }).catch((error) => {
                if (error) {
                    return this._view.error(error, error.name, 'welcome');
                }
                return Promise.resolve();
            });
            return Promise.resolve();
        }).catch((err) => {
            return this._view.error(err, 'Model load request failed.', 'welcome');
        });
    }

    _element(id) {
        return this.document.getElementById(id);
    }
};

host.BrowserHost.BrowserFileContext = class {

    constructor(host, file, blobs) {
        this._host = host;
        this._file = file;
        this._blobs = {};
        for (const blob of blobs) {
            this._blobs[blob.name] = blob;
        }
    }

    get identifier() {
        return this._file.name;
    }

    get stream() {
        return this._stream;
    }

    request(file, encoding, basename) {
        if (basename !== undefined) {
            return this._host.request(file, encoding, basename);
        }
        const blob = this._blobs[file];
        if (!blob) {
            return Promise.reject(new Error("File not found '" + file + "'."));
        }
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (encoding) {
                    resolve(e.target.result);
                } else {
                    const base = require('./base');
                    const buffer = new Uint8Array(e.target.result);
                    const stream = new base.BinaryStream(buffer);
                    resolve(stream);
                }
            };
            reader.onerror = (e) => {
                e = e || this.window.event;
                let message = '';
                const error = e.target.error;
                switch (error.code) {
                    case error.NOT_FOUND_ERR:
                        message = "File not found '" + file + "'.";
                        break;
                    case error.NOT_READABLE_ERR:
                        message = "File not readable '" + file + "'.";
                        break;
                    case error.SECURITY_ERR:
                        message = "File access denied '" + file + "'.";
                        break;
                    default:
                        message = error.message ? error.message : "File read '" + error.code.toString() + "' error '" + file + "'.";
                        break;
                }
                reject(new Error(message));
            };
            if (encoding === 'utf-8') {
                reader.readAsText(blob, encoding);
            } else {
                reader.readAsArrayBuffer(blob);
            }
        });
    }

    require(id) {
        return this._host.require(id);
    }

    exception(error, fatal) {
        this._host.exception(error, fatal);
    }

    open() {
        return this.request(this._file.name, null).then((stream) => {
            this._stream = stream;
        });
    }
};

host.BrowserHost.Context = class {

    constructor(host, url, identifier, stream) {
        this._host = host;
        this._stream = stream;
        if (identifier) {
            this._identifier = identifier;
            this._base = url;
            if (this._base.endsWith('/')) {
                this._base.substring(0, this._base.length - 1);
            }
        } else {
            const parts = url.split('?')[0].split('/');
            this._identifier = parts.pop();
            this._base = parts.join('/');
        }
    }

    get identifier() {
        return this._identifier;
    }

    get stream() {
        return this._stream;
    }

    request(file, encoding, base) {
        return this._host.request(file, encoding, base === undefined ? this._base : base);
    }

    require(id) {
        return this._host.require(id);
    }

    exception(error, fatal) {
        this._host.exception(error, fatal);
    }
};

if (!('scrollBehavior' in window.document.documentElement.style)) {
    const __scrollTo__ = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function(options) {
        if (options === undefined) {
            return;
        }
        if (options === null || typeof options !== 'object' || options.behavior === undefined || arguments[0].behavior === 'auto' || options.behavior === 'instant') {
            if (__scrollTo__) {
                __scrollTo__.apply(this, arguments);
            }
            return;
        }
        const now = () => {
            return window.performance && window.performance.now ? window.performance.now() : Date.now();
        };
        const ease = (k) => {
            return 0.5 * (1 - Math.cos(Math.PI * k));
        };
        const step = (context) => {
            const value = ease(Math.min((now() - context.startTime) / 468, 1));
            const x = context.startX + (context.x - context.startX) * value;
            const y = context.startY + (context.y - context.startY) * value;
            context.element.scrollLeft = x;
            context.element.scrollTop = y;
            if (x !== context.x || y !== context.y) {
                window.requestAnimationFrame(step.bind(window, context));
            }
        };
        const context = {
            element: this,
            x: typeof options.left === 'undefined' ? this.scrollLeft : ~~options.left,
            y: typeof options.top === 'undefined' ? this.scrollTop : ~~options.top,
            startX: this.scrollLeft,
            startY: this.scrollTop,
            startTime: now()
        };
        step(context);
    };
}
