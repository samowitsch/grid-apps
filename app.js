/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

function require_fresh(path) {
    const rpa = require.resolve(path);
    delete require.cache[rpa];
    return require(rpa);
}

const fs = require('fs');
const uglify = require('uglify-es');
const moment = require('moment');
const agent = require('express-useragent');
const license = require_fresh('./src/license.js');
const version = license.VERSION || "rogue";

const fileCache = {};
const code_src = {};
const code = {};
const mods = {};
const load = [];
const synth = {};
const api = {};

let level;
let cacheDir;
let startTime;
let lastmod;
let logger;
let debug;
let http;
let util;
let dir;
let log;

function init(mod) {
    startTime = time();
    lastmod = mod.util.lastmod;
    logger = mod.log;
    debug = mod.env.debug || mod.meta.debug;
    http = mod.http;
    util = mod.util;
    dir = mod.dir;
    log = mod.log;
    level = require('level')(mod.util.datadir("kvstore"), {valueEncoding:"json"});
    cacheDir = mod.util.datadir("cache");

    mod.on.reload(() => level.close());
    mod.on.test((req) => {
        let vmatch = mod.meta.version || undefined;
        let strict = (vmatch && mod.vmatch !== "*") ? true : false;
        let cookie = cookieValue(req.headers.cookie, "version") || undefined;
        if (strict) {
            return cookie === mod.meta.version;
        } else {
            return (!vmatch && !cookie) || (vmatch && cookie);
        }
    });

    mod.add(handleOptions);
    mod.add(fullpath({
        "/kiri"            : redir("/kiri/", 301),
        "/meta"            : redir("/meta/", 301),
        "/kiri/index.html" : redir("/kiri/", 301),
        "/meta/index.html" : redir("/meta/", 301)
    }));
    mod.add(handleVersion);
    mod.add(prepath([
        [ "/code/", handleCode ],
        [ "/data/", handleData ],
        [ "/wasm/", handleWasm ]
    ]));
    mod.add(fixedmap("/api/", api));
    if (debug) {
        mod.static("/src/", "src");
        mod.static("/mod/", "mod");
        mod.sync("/reload", () => {
            mod.reload();
            return "reload";
        });
    }
    mod.add(rewriteHtmlVersion);
    mod.static("/obj/", "web/obj");
    mod.static("/moto/", "web/moto");
    mod.static("/meta/", "web/meta");
    mod.static("/kiri/", "web/kiri");

    // load modules
    lastmod(`${dir}/mod`) && fs.readdirSync(`${dir}/mod`).forEach(dir => {
        const modpath = `mod/${dir}`;
        if (dir.charAt(0) === '.') return;
        const stats = fs.lstatSync(`${mod.dir}/${modpath}`);
        if (!(stats.isDirectory() || stats.isSymbolicLink())) return;
        loadModule(mod, modpath);
    });

    // run loads injected by modules
    while (load.length) {
        try {
            load.shift()();
        } catch (e) {
            logger.log({on_load_fail: e});
        }
    }

    // runs after module loads / injects
    prepareScripts();
};

// either add module assets to path or require(init.js)
function loadModule(mod, dir) {
    if (dir.indexOf('node_modules') >= 0) {
        return;
    }
    if (lastmod(`${mod.dir}/${dir}/.ignore`)) {
        return;
    }
    lastmod(`${mod.dir}/${dir}/init.js`) ?
        initModule(mod, `./${dir}/init.js`, dir) :
        mod.static("/", `${mod.dir}/${dir}`);
}

// load module and call returned function with helper object
function initModule(mod, file, dir) {
    logger.log({module: file});
    require_fresh(file)({
        api: api,
        adm: {
            reload: prepareScripts
        },
        const: {
            args: {},
            meta: mod.meta,
            debug: debug,
            script: script,
            moddir: dir,
            rootdir: mod.dir,
            version: version
        },
        pkg: {
            agent,
            moment
        },
        mod: mods,
        util: {
            log: logger.log,
            time: time,
            guid: guid,
            mkdirs: util.mkdir,
            datadir: util.datadir,
            lastmod: lastmod,
            obj2string: obj2string,
            string2obj: string2obj,
            getCookieValue: cookieValue,
            logger: log.new
        },
        db: {
            api: db,
            level: level
        },
        inject: (code, file, options) => {
            if (!script[code]) {
                return logger.log(`inject missing target "${code}"`);
            }
            let opt = options || {};
            if (opt.end) {
                script[code].push(dir + "/" + file);
            } else {
                script[code].splice(0, 0, dir + "/" + file);
            }
        },
        path: {
            any: arg => { mod.add(arg) },
            pre: arg => { mod.add(prepath(arg)) },
            map: arg => { mod.add(fixedmap(arg)) },
            full: arg => { mod.add(fullpath(arg)) },
            static: (root, pre) => {
                mod.static(pre || "/", root);
            },
            code: (endpoint, path) => {
                let fpath = mod.dir + "/" + path;
                if (debug) {
                    code[endpoint] = fs.readFileSync(fpath);
                } else {
                    code[endpoint] = minify(fpath);
                }
                code_src[endpoint] = {
                    endpoint,
                    path: path,
                    mod: lastmod(fpath)
                };
            },
            redir: redir,
            remap: remap
        },
        handler: {
            addCORS: addCorsHeaders,
            redirect: http.redirect,
            reply404: http.reply404,
            reply: quickReply
        },
        ws: {
            register: mod.wss
        },
        onload: (fn) => {
            load.push(fn);
        },
        onexit: (fn) => {
            mod.on.exit(fn);
        }
    });
}

const script = {
    kiri : [
        "kiri",
        "ext/three",
        "license",
        "ext/clip2",
        "ext/tween",
        "ext/fsave",
        "ext/earcut",
        "add/array",
        "add/three",
        "geo/base",
        "geo/debug",
        "geo/render",
        "geo/point",
        "geo/slope",
        "geo/line",
        "geo/bounds",
        "geo/polygon",
        "geo/polygons",
        "geo/gyroid",
        "moto/kv",
        "moto/ajax",
        "moto/ctrl",
        "moto/pack",
        "moto/space",
        "moto/load-stl",
        "moto/db",
        "kiri/ui",
        "kiri/lang",
        "kiri/lang-en",
        "kiri/fill",
        "kiri/db",
        "kiri/slice",
        "kiri/slicer",
        "mode/fdm/driver",
        "mode/sla/driver",
        "mode/cam/driver",
        "mode/laser/driver",
        "kiri/layer",
        "kiri/widget",
        "kiri/print",
        "kiri/codec",
        "kiri/work",
        "kiri/conf",
        "kiri/main",
        "kiri/init",
        "kiri/export",
        "@devices",
        "@icons"
    ].map(p => p.charAt(0) !== '@' ? `src/${p}.js` : p),
    worker : [
        "kiri",
        "ext/three",
        "ext/pngjs",
        "license",
        "ext/clip2",
        "add/array",
        "add/three",
        "add/class",
        "geo/base",
        // "geo/wasm",
        "geo/debug",
        "geo/point",
        "geo/slope",
        "geo/line",
        "geo/bounds",
        "geo/polygon",
        "geo/polygons",
        "geo/gyroid",
        "moto/pack",
        "kiri/fill",
        "kiri/slice",
        "kiri/slicer",
        "mode/fdm/driver",
        "mode/sla/driver",
        "mode/cam/driver",
        "mode/laser/driver",
        "kiri/widget",
        "kiri/print",
        "kiri/codec",
        "kiri/worker"
    ].map(p => `src/${p}.js`),
    meta : [
        "ext/three",
        "license",
        "ext/tween",
        "ext/fsave",
        "ext/earcut",
        "add/array",
        "add/three",
        "geo/base",
        "geo/debug",
        "geo/render",
        "geo/point",
        "geo/slope",
        "geo/line",
        "geo/bounds",
        "geo/polygon",
        "geo/polygons",
        "geo/gyroid",
        "kiri/layer",
        "moto/kv",
        "moto/ajax",
        "moto/ctrl",
        "moto/space",
        "moto/load-stl",
        "moto/db",
        "moto/ui",
        "kiri/db",
        "meta"
    ].map(p => `src/${p}.js`)
};

const db = {
    // --------
    key: arr => arr.join("/"),
    // --------
    get: key => {
        if (Array.isArray(key)) key = db.key(key);
            return promise((resolve,reject) => {
                level.get(key,(err,record) => {
                resolve(record,err);
            });
        });
    },

    // --------
    put: (key, value) => {
    if (Array.isArray(key)) key = db.key(key);
        return promise((resolve,reject) => {
            level.put(key,value,(err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },
    // --------
    del: key => {
    return promise((resolve,reject) => {
        level.del(key, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};

function promise(resolve, reject) {
    return new Promise(resolve, reject);
}

function rval() {
    return (Math.round(Math.random()*0xffffffff)).toString(36);
}

function guid() {
    return time().toString(36)+rval()+rval()+rval();
}

function time() {
    return Date.now();
}

function obj2string(o) {
    return JSON.stringify(o);
}

function string2obj(s) {
    return JSON.parse(s);
}

function handleVersion(req, res, next) {
    if (req.app.path === "/kiri/" && req.url.indexOf(version) < 0) {
        if (req.url.indexOf("?") > 0) {
            return http.redirect(res, `${req.url},ver:${version}`);
        } else {
            return http.redirect(res, `${req.url}?ver:${version}`);
        }
    } else {
        next();
    }
}

function handleOptions(req, res, next) {
    try {
        req.app.ua = agent.parse(req.headers['user-agent'] || '');
    } catch (e) {
        logger.log("ua parse error on : "+req.headers['user-agent']);
    }
    if (req.method === 'OPTIONS') {
        addCorsHeaders(req, res);
        res.end();
    } else {
        next();
    }
}

function handleData(req, res, next) {
    addCorsHeaders(req, res);
    res.setHeader('Cache-Control', 'private, no-cache, max-age=0');

    let tok = req.app.path.split('/'),
        muid = req.headers['x-moto-ajax'],
        space = tok[2] || null,
        version = tok[3],
        valid = space && space.length >= 4 && space.length <= 8;

    function genKey() {
        while (true) {
            let k = Math.round(Math.random() * 9999999999).toString(36);
            if (k.length >= 4 && k.length <= 8) return k;
        }
    }

    function countKey(space) {
        return db.key(['meta/counter',space]);
    }

    function ownerKey(space) {
        return db.key(['meta/owner',muid,'space',space]);
    }

    function recordKey(space, version) {
        return db.key(["meta/space",space,version]);
    }

    // retrieve latest space data
    if (valid && req.method === 'GET' && valid) {
        function send(rec, version) {
            if (rec) {
                res.write(obj2string({space:space,ver:version,rec:rec}));
                res.end();
            } else {
                res.end();
            }
        }

        function retrieve(version) {
            return db.get(recordKey(space,version))
                .then(record => {
                    send(record || null, version);
                })
        }

        if (version) {
            retrieve(version)
        } else {
            db.get(countKey(space)).then(version => retrieve(version));
        }
    } else if (valid && req.method === 'POST') {
        let dbOwner = null,
            dbVersion = null,
            postBody = null,
            spacein = space,
            version = 0,
            body = '';

        function checkDone() {
            if (!(dbVersion && postBody)) return;
            // if not owner, assign new space id
            if (dbVersion > 1) {
                if (!dbOwner) {
                    space = genKey();
                    version = 1;
                    logger.log({forked:space,from:spacein,by:muid});
                }
            }
            // log what we have
            logger.log({
                space: space,
                ver: dbVersion,
                uid: muid,
                size: postBody.length
            });
            if (muid && muid.length > 0) {
                level.put(recordKey(space, dbVersion), body);
                level.put(ownerKey(space), {time: time(), ver: dbVersion});
                level.put(countKey(space), dbVersion);
            }
            res.end(obj2string({space: space, ver: dbVersion}));
        }

        // accumulate post body
        req.on('data', data => { body += data });
        req.on('end', () => {
            postBody = body;
            checkDone();
        });

        // fetch owner and version information
        db.get(ownerKey(space))
            .then(owner => {
                dbOwner = owner;
                return db.get(countKey(space));
             })
            .then(version => {
                dbVersion = parseInt(version || "0") + 1;
                checkDone();
            });

        return;

    }  else {

        next();

    }
}

function handleWasm(req, res, next) {
    let [root, file] = req.app.path.split('/').slice(1);
    let ext = (file || '').split('.')[1];
    let path = `${dir}/wasm/${file}`;
    let mod = lastmod(path);

    if (root === 'wasm' && ext === 'wasm' && mod) {
        let imd = ifModifiedDate(req);
        if (imd && mod <= imd) {
            res.writeHead(304, "Not Modified");
            return res.end();
        }
        res.writeHead(200, {
            'Content-Type': 'application/wasm',
            'Cache-Control': 'public, max-age=600',
            'Last-Modified': new Date(mod).toGMTString(),
        });
        res.end(fs.readFileSync(path));
    } else {
        next();
    }
}

function handleCode(req, res, next) {
    let key = req.app.path.split('/')[2].split('.')[0],
        ck = code_src[key],
        js = code[key];

    if (!js) {
        return http.reply404(req, res);
    }

    if (ck) {
        let mod = lastmod(ck.path);
        if (mod > ck.mod) {
            if (debug) {
                js = code[ck.endpoint] = fs.readFileSync(ck.path);
            } else {
                js = code[ck.endpoint] = minify(ck.path);
            }
            ck.mod = mod;
        }
    }

    addCorsHeaders(req, res);
    serveCode(req, res, {
        code: js,
        mtime: startTime
    });
}

function serveCode(req, res, code) {
    if (code.deny) {
        return http.reply404(req, res);
    }

    let imd = ifModifiedDate(req);
    if (imd && code.mtime <= imd && !code.nocache) {
        res.writeHead(304, "Not Modified");
        res.end();
        return;
    }

    let cacheControl = code.nocache ?
        'private, max-age=0' :
        'public, max-age=600';

    res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': cacheControl,
        'Last-Modified': new Date(code.mtime).toGMTString(),
    });
    res.end(code.code);
}

function generateIcons() {
    let root = `${dir}/src/ico`;
    let icos = {};
    fs.readdirSync(root).forEach(file => {
        let name = file.split(".")[0]   ;
        icos[name] = fs.readFileSync(`${root}/${file}`).toString();
    });
    synth.icons = `self.icons = ${JSON.stringify(icos)};`;
}

function generateDevices() {
    let root = `${dir}/src/dev`;
    let devs = {};
    fs.readdirSync(root).forEach(type => {
        let map = devs[type] = devs[type] || {};
        fs.readdirSync(`${root}/${type}`).forEach(device => {
            map[device] = JSON.parse(fs.readFileSync(`${root}/${type}/${device}`));
        });
    });
    synth.devices = `self.devices = ${JSON.stringify(devs)};`;
}

function prepareScripts() {
    generateIcons();
    generateDevices();
    code.meta = concatCode(script.meta);
    code.kiri = concatCode(script.kiri);
    code.worker = concatCode(script.worker);
}

function concatCode(array) {
    let code = [];
    let direct = array.filter(f => f.charAt(0) !== '@');
    let inject = array.filter(f => f.charAt(0) === '@').map(f => f.substring(1));

    // in debug mode, the script should load dependent
    // scripts instead of serving a complete bundle
    if (debug) {
        let code = [ '(function() { let load = [ ' ];
        direct.forEach(file => {
            code.push(`"/${file.replace(/\\/g,'/')}?${version}",`);
        });
        code.push([
            ']; function load_next() {',
            'let file = load.shift();',
            'if (!file) return;',
            'if (!self.document) { importScripts(file); return load_next() }',
            'let s = document.createElement("script");',
            's.type = "text/javascript";',
            's.src = file;',
            's.onload = load_next;',
            'document.head.appendChild(s);',
            '} load_next(); })();',
            'self.debug=true;'
        ].join('\n'));
        inject.forEach(key => {
            code.push(synth[key]);
        });
        return code.join('\n');
    }

    direct.forEach(file => {
        let cached = getCachedFile(file, function(path) {
            return minify(`${dir}/${file}`);
        });
        code.push(cached);
    });

    inject.forEach(key => {
        code.push(synth[key]);
    });

    return code.join('');
}

function getCachedFile(file, fn) {
    let filePath = `${dir}/${file}`;
    let cachePath = cacheDir + "/" + file
            .replace(/\//g,'_')
            .replace(/\\/g,'_')
            .replace(/:/g,'_'),
        cached = fileCache[filePath],
        now = time();

    if (cached) {
        if (now - cached.lastcheck > 60000) {
            let smod = lastmod(filePath),
                cmod = cached.mtime;

            if (!smod) throw "missing source file";
            if (smod > cmod) cached = null;

            cached.lastcheck = now;
        }
    }

    if (!cached) {
        let smod = lastmod(filePath),
            cmod = lastmod(cachePath),
            cacheData;

        if (cmod >= smod) {
            cacheData = fs.readFileSync(cachePath);
        } else {
            logger.log({update_cache:filePath});
            cacheData = fn(filePath);
            fs.writeFileSync(cachePath, cacheData);
        }

        cached = {
            data: cacheData,
            mtime: cmod || now,
            lastcheck: now
        };

        fileCache[filePath] = cached;
    }

    return cached.data;
}

function minify(path) {
    let code = fs.readFileSync(path);
    let mini = uglify.minify(code.toString());
    if (mini.error) {
        console.trace(mini.error);
        throw mini.error;
    }
    return mini.code;
}

function quickReply(res, code, msg) {
    res.writeHead(code);
    res.end(msg+"\n");
}

function ifModifiedDate(req) {
    let ims = req.headers['if-modified-since'];
    if (ims) {
        // because sys time has a higher resolution than
        // seconds converted from IMS header. so give it
        // an extra second
        return new Date(ims).getTime() + 1000;
    }
    return 0;
}

function addCorsHeaders(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'X-Moto-Ajax, Content-Type');
    res.setHeader("Access-Control-Allow-Origin", req.headers['origin'] || '*');
    res.setHeader("Allow", "GET,POST,OPTIONS");
}

// dispatch for path prefixs
function prepath(pre) {

    function handle(req, res, next) {
        pre.uid = pre.uid || guid();
        req.ppi = req.ppi || {};

        let path = req.app.path,
            key, fn, i = req.ppi[pre.uid] || 0;

        while (i < pre.length) {
            key = pre[i][0];
            fn = pre[i++][1];
            if (path.indexOf(key) === 0) {
                return fn(req, res, () => {
                    req.ppi[pre.uid] = i;
                    handle(req, res, next);
                });
            }
        }

        next();
    }

    return handle;
}

// dispatch full fixed paths
function fullpath(map) {
    return (req, res, next) => {
        let fn = map[req.app.path];
        if (fn) fn(req, res, next);
        else next();
    };
}

// dispatch full paths based on a prefix and a function map
function fixedmap(prefix, map) {
    return (req, res, next) => {
        let path = req.app.path;
        if (path.indexOf(prefix) != 0) return next();
        let fn = map[path.substring(prefix.length)];
        if (fn) fn(req, res, next);
        else next();
    };
}

// HTTP 307 redirect
function redir(path, type) {
    return (req, res, next) => http.redirect(res, path, type);
}

// mangle request path
function remap(path) {
    return (req, res, next) => {
        req.url = req.app.path = path;
        next();
    }
}

function cookieValue(cookie,key) {
    if (!cookie) return null;
    key = (key || "key") + "=";
    let kpos = cookie.lastIndexOf(key);
    if (kpos >= 0) {
        return cookie.substring(kpos+key.length).split(';')[0];
    } else {
        return null;
    }
}

function rewriteHtmlVersion(req, res, next) {
    if (req.app.path === "/kiri/") {
        let real_write = res.write;
        let real_end = res.end;
        res.write = function() {
            arguments[0] = arguments[0].toString().replace(/{{version}}/g,version);
            real_write.apply(res, arguments);
        };
        res.end = function() {
            if (arguments[0]) {
                arguments[0] = arguments[0].toString().replace(/{{version}}/g,version);
            }
            real_end.apply(res, arguments);
        };
    }

    next();
}

module.exports = init;
