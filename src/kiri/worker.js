/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// (function() {

const base = self.base,
    util = base.util,
    time = util.time,
    kiri = self.kiri,
    ver = kiri.version,
    Widget = kiri.Widget,
    current = self.worker = {
        print: null,
        snap: null
    };

let cache = {};

console.log(`kiri | init work | ${ver}`);
base.debug.disable();

// catch clipper alerts and convert to console messages
self.alert = function(o) {
    console.log(o);
};

let dispatch = {
    decimate: function(vertices, send) {
        vertices = new Float32Array(vertices),
        vertices = Widget.pointsToVertices(Widget.verticesToPoints(vertices, true));
        send.done(vertices);
    },

    snap: function(data, send) {
        current.snap = data;
        send.done();
    },

    slice: function(data, send) {
        let settings = data.settings,
            vertices = new Float32Array(data.vertices),
            position = data.position,
            tracking = data.tracking,
            points = Widget.verticesToPoints(vertices),
            state = data.state || {},
            rotation = state.rotation,
            centerz = state.centerz,
            movez = state.movez;

        if (rotation) {
            state.rotate = new THREE.Matrix4().makeRotationY(-rotation);
        }

        send.data({update:0.05, updateStatus:"slicing"});

        let widget = kiri.newWidget(data.id).setPoints(points),
            last = util.time(),
            now;

        // do it here so cancel can work
        cache[data.id] = widget;

        // fake mesh object to satisfy printing
        widget.track = tracking;
        widget.mesh = {
            widget: widget,
            position: position
        };

        try {

        widget.slice(settings, function(error) {
            if (error) {
                delete cache[data.id];
                send.data({error: error});
            } else {
                let slices = widget.slices || [];
                send.data({send_start: time()});
                send.data({
                    topo: settings.synth.sendTopo ? widget.topo : null,
                    stats: widget.stats,
                    slices: slices.length
                });
                slices.forEach(function(slice,index) {
                    send.data({index: index, slice: slice.encode(state)});
                })
                if (self.debug && widget.polish) {
                    send.data({polish: kiri.codec.encode(widget.polish)});
                }
                send.data({send_end: time()});
            }
            send.done({done: true});
        }, function(update, msg) {
            now = util.time();
            if (now - last < 10 && update < 0.99) return;
            // on update
            send.data({update: (0.05 + update * 0.95), updateStatus: msg});
            last = now;
        });

        } catch (error) {
            send.data({error: error.toString()});
            console.log(error);
        }
    },

    printSetup: function(data, send) {
        let widgets = [], key;
        for (key in cache) {
            if (cache.hasOwnProperty(key)) widgets.push(cache[key]);
        }

        send.data({update:0.05, updateStatus:"preview"});

        current.print = kiri.newPrint(data.settings, widgets, data.id);
        current.print.setup(false, function(update, msg) {
            send.data({
                update: update,
                updateStatus: msg
            });
        }, function() {
            send.done({
                done: true,
                output: current.print.encodeOutput()
            });
        });
    },

    printExport: function(data, send) {
        current.print.export(false, function(line, direct) {
            send.data({line}, direct);
        }, function(done, direct) {
            send.done({done}, direct);
        });
    },

    printGCode: function(data, send) {
        current.print.exportGCode(false, function(gcode) {
            send.done({
                gcode: gcode,
                lines: current.print.lines,
                bytes: current.print.bytes,
                bounds: current.print.bounds,
                distance: current.print.distance,
                time: current.print.time
            });
        }, function(line) {
            send.data({line:line});
        });
    },

    clear: function(data, send) {
        current.snap = null;
        current.print = null;
        if (!data.id) {
            cache = {};
            send.done({ clear: true });
            return;
        }
        let had = cache[data.id] !== undefined;
        delete cache[data.id];
        send.done({
            id: data.id,
            had: had,
            has: cache[data.id] !== undefined
        });
    },
};

self.onmessage = function(e) {
    let time_recv = util.time(),
        msg = e.data,
        run = dispatch[msg.task],
        send = {
            data : function(data,direct) {
                self.postMessage({
                    seq: msg.seq,
                    task: msg.task,
                    done: false,
                    data: data
                },direct);
            },
            done : function(data,direct) {
                self.postMessage({
                    seq: msg.seq,
                    task: msg.task,
                    done: true,
                    data: data
                },direct);
            }
        };

    if (run) {
        let time_xfer = (time_recv - msg.time),
            output = run(msg.data, send),
            time_send = util.time(),
            time_proc = time_send - time_recv;

        if (output) self.postMessage({
            seq: msg.seq,
            task: msg.task,
            time_send: time_xfer,
            time_proc: time_proc,
            // replaced on reply side
            time_recv: util.time(),
            data: output
        });
    } else {
        console.log({kiri_msg:e});
    }
};

// })();
