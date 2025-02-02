"use strict";

const G = 1.2; 
const M = 1.0; 
const L = 1.0; 
const dtMax = 30.0; 
const tailMax = 400; 

const barWidth = 0.04;
const barLength = 0.23;
const massRadius = 0.035;
const tailThickness = 0.012;
let nr = document.getElementById("nr")
var x = 1;
// WebGL
const quad = new Float32Array([-1, -1, +1, -1, -1, +1, +1, +1]);

const massShader = {
    vert: `
attribute vec2 a_point;
uniform   vec2 u_center;
uniform   vec2 u_aspect;
varying   vec2 v_point;
void main() {
    v_point = a_point;
    gl_Position = vec4(a_point * ${massRadius} / u_aspect + u_center, 0, 1);
}`,
    frag: `
uniform vec2 u_aspect;
uniform vec3 u_color;
varying vec2 v_point;
void main() {
    float dist = distance(vec2(0, 0), v_point);
    float v = smoothstep(1.0, 0.9, dist);
    gl_FragColor = vec4(u_color, v);
}`,
};

const barShader = {
    vert: `
attribute vec2  a_point;
uniform   float u_angle;
uniform   vec2  u_attach;
uniform   vec2  u_aspect;
void main() {
    mat2 rotate = mat2(+cos(u_angle), +sin(u_angle),
                       -sin(u_angle), +cos(u_angle));
    vec2 pos = rotate * (a_point * vec2(1, ${barWidth}) + vec2(1, 0));
    gl_Position = vec4((pos * ${barLength} / u_aspect + u_attach), 0, 1);
}`,
    frag: `
uniform vec3 u_color;
void main() {
    gl_FragColor = vec4(u_color, 1);
}`,
};

const tailShader = {
    vert: `
attribute vec2  a_point;
attribute float a_alpha;
uniform   vec2  u_aspect;
varying   float v_alpha;
void main() {
    v_alpha = a_alpha;
    gl_Position = vec4(a_point * vec2(1, -1) / u_aspect, 0, 1);
}`,
    frag: `
uniform vec3  u_color;
uniform float u_cutoff;
varying float v_alpha;
void main() {
    float icutoff = 1.0 - u_cutoff;
    gl_FragColor = vec4(u_color, max(0.0, v_alpha - u_cutoff) / icutoff);
}`,
};

function deriviative(a1, a2, p1, p2) {
    let ml2 = M * L * L;
    let cos12 = Math.cos(a1 - a2);
    let sin12 = Math.sin(a1 - a2);
    let da1 = 6 / ml2 * (2 * p1 - 3 * cos12 * p2) / (16 - 9 * cos12 * cos12);
    let da2 = 6 / ml2 * (8 * p2 - 3 * cos12 * p1) / (16 - 9 * cos12 * cos12);
    let dp1 = ml2 / -2 * (+da1 * da2 * sin12 + 3 * G / L * Math.sin(a1));
    let dp2 = ml2 / -2 * (-da1 * da2 * sin12 + 3 * G / L * Math.sin(a2));
    return [da1, da2, dp1, dp2];
}

// Update pendulum by timestep
function rk4(k1a1, k1a2, k1p1, k1p2, dt) {
    let [k1da1, k1da2, k1dp1, k1dp2] = deriviative(k1a1, k1a2, k1p1, k1p2);

    let k2a1 = k1a1 + k1da1 * dt / 2;
    let k2a2 = k1a2 + k1da2 * dt / 2;
    let k2p1 = k1p1 + k1dp1 * dt / 2;
    let k2p2 = k1p2 + k1dp2 * dt / 2;

    let [k2da1, k2da2, k2dp1, k2dp2] = deriviative(k2a1, k2a2, k2p1, k2p2);

    let k3a1 = k1a1 + k2da1 * dt / 2;
    let k3a2 = k1a2 + k2da2 * dt / 2;
    let k3p1 = k1p1 + k2dp1 * dt / 2;
    let k3p2 = k1p2 + k2dp2 * dt / 2;

    let [k3da1, k3da2, k3dp1, k3dp2] = deriviative(k3a1, k3a2, k3p1, k3p2);

    let k4a1 = k1a1 + k3da1 * dt;
    let k4a2 = k1a2 + k3da2 * dt;
    let k4p1 = k1p1 + k3dp1 * dt;
    let k4p2 = k1p2 + k3dp2 * dt;

    let [k4da1, k4da2, k4dp1, k4dp2] = deriviative(k4a1, k4a2, k4p1, k4p2);

    return [
        k1a1 + (k1da1 + 2*k2da1 + 2*k3da1 + k4da1) * dt / 6,
        k1a2 + (k1da2 + 2*k2da2 + 2*k3da2 + k4da2) * dt / 6,
        k1p1 + (k1dp1 + 2*k2dp1 + 2*k3dp1 + k4dp1) * dt / 6,
        k1p2 + (k1dp2 + 2*k2dp2 + 2*k3dp2 + k4dp2) * dt / 6
    ];
}

function history(n) {
    let h = {
        i: 0,
        length: 0,
        v: new Float32Array(n * 2),
        push: function(a1, a2) {
            h.v[h.i * 2 + 0] = Math.sin(a1) + Math.sin(a2);
            h.v[h.i * 2 + 1] = Math.cos(a1) + Math.cos(a2);
            h.i = (h.i + 1) % n;
            if (h.length < n)
                h.length++;
        },
        visit: function(f) {
            for (let j = h.i + n - 2; j > h.i + n - h.length - 1; j--) {
                let a = (j + 1) % n;
                let b = (j + 0) % n;
                f(h.v[a * 2], h.v[a * 2 + 1], h.v[b * 2], h.v[b * 2 + 1]);
            }
        }
    };
    return h;
}

function normalize(v0, v1) {
    let d = Math.sqrt(v0 * v0 + v1 * v1);
    return [v0 / d, v1 / d];
}

function sub(a0, a1, b0, b1) {
    return [a0 - b0, a1 - b1];
}

function add(a0, a1, b0, b1) {
    return [a0 + b0, a1 + b1];
}

function dot(ax, ay, bx, by) {
    return ax * bx + ay * by;
}

function polyline(hist, poly) {
    const w = tailThickness;
    let i = -1;
    let x0, y0;
    let xf, yf;
    hist.visit(function(x1, y1, x2, y2) {
        if (++i === 0) {
            let [lx, ly] = sub(x2, y2, x1, y1);
            let [nx, ny] = normalize(-ly, lx);
            poly[0] = x1 + w * nx;
            poly[1] = y1 + w * ny;
            poly[2] = x1 - w * nx;
            poly[3] = y1 - w * ny;
        } else {
            let [ax, ay] = sub(x1, y1, x0, y0);
            [ax, ay] = normalize(ax, ay);
            let [bx, by] = sub(x2, y2, x1, y1);
            [bx, by] = normalize(bx, by);
            let [tx, ty] = add(ax, ay, bx, by);
            [tx, ty] = normalize(tx, ty);
            let [mx, my] = [-ty, tx];
            let [lx, ly] = sub(x1, y1, x0, y0);
            let [nx, ny] = normalize(-ly, lx);
            let len = Math.min(w, w / dot(mx, my, nx, ny));
            poly[i * 4 + 0] = x1 + mx * len;
            poly[i * 4 + 1] = y1 + my * len;
            poly[i * 4 + 2] = x1 - mx * len;
            poly[i * 4 + 3] = y1 - my * len;
        }
        x0 = x1;
        y0 = y1;
        xf = x2;
        yf = y2;
    });
    let [lx, ly] = sub(xf, yf, x0, y0);
    let [nx, ny] = normalize(-ly, lx);
    i++;
    poly[i * 4 + 0] = xf + w * nx;
    poly[i * 4 + 1] = yf + w * ny;
    poly[i * 4 + 2] = xf - w * nx;
    poly[i * 4 + 3] = yf - w * ny;
}

function compile(gl, vert, frag) {
    let v = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(v, 'precision mediump float;' + vert);
    let f = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(f, 'precision mediump float;' + frag);
    gl.compileShader(v);
    if (!gl.getShaderParameter(v, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(v));
    gl.compileShader(f);
    if (!gl.getShaderParameter(f, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(f));
    let p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(p));
    gl.deleteShader(v);
    gl.deleteShader(f);
    let result = {
        program: p
    };
    let nattrib = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let a = 0; a < nattrib; a++) {
        let name = gl.getActiveAttrib(p, a).name;
        result[name] = gl.getAttribLocation(p, name);
    }
    let nuniform = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let u = 0; u < nuniform; u++) {
        let name = gl.getActiveUniform(p, u).name;
        result[name] = gl.getUniformLocation(p, name);
    }
    return result;
};

function pendulum({
    tailColor = [2, 0, 9],
    massColor = [0, 0, 0],
    init = null
} = {}) {
    let tail = new history(tailMax);
    let a1, a2, p1, p2;
    if (init) {
        [a1, a2, p1, p2] = init;
    } else {
        a1 = Math.random() * Math.PI / 2 + Math.PI * 3 / 4;
        a2 = Math.random() * Math.PI / 2 + Math.PI * 3 / 4;
        p1 = 0.0;
        p2 = 0.0;
    }

    return {
        tailColor: tailColor,
        massColor: massColor,
        tail: tail,
        state: function() {
            return [a1, a2, p1, p2];
        },
        positions: function() {
            let x1 = +Math.sin(a1);
            let y1 = -Math.cos(a1);
            let x2 = +Math.sin(a2) + x1;
            let y2 = -Math.cos(a2) + y1;
            return [x1, y1, x2, y2];
        },
        step: function(dt) {
            [a1, a2, p1, p2] = rk4(a1, a2, p1, p2, dt);
            tail.push(a1, a2);
        },
        draw2d: function(ctx) {
            draw2d(ctx, tail, a1, a2, massColor, tailColor);
        },

        clone: function(conf) {
            if (!conf)
                conf = {};
            let cp2;
            if (p2 === 0.0)
                cp2 = Math.random() * 1e-12;
            else
                cp2 = p2 * (1 - Math.random() * 1e-10);
            conf.init = [a1, a2, p1, cp2];
            return new pendulum(conf);
        },};}
function clear3d(gl) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);}
function draw3d(gl, webgl, pendulums) {
    let w = gl.canvas.width;
    let h = gl.canvas.height;
    let z = Math.min(w, h);
    let ax = w / z;
    let ay = h / z;
    let d = barLength * 2;
    let tail = webgl.tail;
    gl.useProgram(tail.program);
    gl.uniform2f(tail.u_aspect, ax / d, ay / d);
    gl.bindBuffer(gl.ARRAY_BUFFER, webgl.alpha);
    gl.enableVertexAttribArray(tail.a_alpha);
    gl.vertexAttribPointer(tail.a_alpha, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, webgl.tailb);
    gl.enableVertexAttribArray(tail.a_point);
    gl.vertexAttribPointer(tail.a_point, 2, gl.FLOAT, false, 0, 0);
    for (let i = 0; i < pendulums.length; i++) {
        let p = pendulums[i];
        if (p.tail.length) {
            polyline(p.tail, webgl.tailpoly);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, webgl.tailpoly);
            gl.uniform3fv(tail.u_color, p.tailColor);
            let cutoff = 1 - p.tail.length * 2 / p.tail.v.length;
            gl.uniform1f(tail.u_cutoff, cutoff);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, p.tail.length * 2);}}
    let mass = webgl.mass;
    gl.useProgram(mass.program);
    gl.uniform2f(mass.u_aspect, ax, ay);
    gl.bindBuffer(gl.ARRAY_BUFFER, webgl.quad);
    gl.enableVertexAttribArray(mass.a_point);
    gl.vertexAttribPointer(mass.a_point, 2, gl.FLOAT, false, 0, 0);
    for (let i = 0; i < pendulums.length; i++) {
        let p = pendulums[i];
        let [x1, y1, x2, y2] = p.positions();
        x1 *= d / ax;
        y1 *= d / ay;
        x2 *= d / ax;
        y2 *= d / ay;
        gl.uniform3fv(mass.u_color, p.massColor);
        gl.uniform2f(mass.u_center, x1, y1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.uniform2f(mass.u_center, x2, y2);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);}
    let bar = webgl.bar;
    gl.useProgram(bar.program);
    gl.uniform2f(bar.u_aspect, ax, ay);
    gl.enableVertexAttribArray(bar.a_point);
    gl.vertexAttribPointer(bar.a_point, 2, gl.FLOAT, false, 0, 0);
    for (let i = 0; i < pendulums.length; i++) {
        let p = pendulums[i];
        let [x1, y1, x2, y2] = p.positions();
        let [a1, a2, p1, p2] = p.state();
        x1 *= d / ax;
        y1 *= d / ay;
        gl.uniform3fv(bar.u_color, p.massColor);
        gl.uniform2f(bar.u_attach, 0, 0);
        gl.uniform1f(bar.u_angle, a1 - Math.PI / 2);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.uniform2f(bar.u_attach, x1, y1);
        gl.uniform1f(bar.u_angle, a2 - Math.PI / 2);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);}};
function glRenderer(gl, tailLen) {
    let webgl = {};
    gl.clearColor(1, 1, 1, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    webgl.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, webgl.quad);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    webgl.tailb = gl.createBuffer();
    webgl.tailpoly = new Float32Array(tailLen * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, webgl.tailb);
    gl.bufferData(gl.ARRAY_BUFFER, webgl.tailpoly.byteLength, gl.STREAM_DRAW);
    webgl.alpha = gl.createBuffer();
    let alpha = new Float32Array(tailLen * 2);
    for (let i = 0; i < alpha.length; i++) {
        let v = (i + 1) / alpha.length;
        alpha[i] = 1 - v;}
    gl.bindBuffer(gl.ARRAY_BUFFER, webgl.alpha);
    gl.bufferData(gl.ARRAY_BUFFER, alpha, gl.STATIC_DRAW);
    webgl.mass = compile(gl, massShader.vert, massShader.frag);
    webgl.bar  = compile(gl, barShader.vert, barShader.frag);
    webgl.tail = compile(gl, tailShader.vert, tailShader.frag);
    webgl.renderAll = function(pendulums) {
        clear3d(gl);
        draw3d(gl, webgl, pendulums);};
    return webgl;}
function color2style(color) {
    let r = Math.round(255 * color[0]);
    let g = Math.round(255 * color[1]);
    let b = Math.round(255 * color[2]);
    return 'rgb(' + r + ',' + g + ',' + b + ')';}
function clear2d(ctx) {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);}
function draw2d(ctx, tail, a1, a2, massColor, tailColor) {
    let w = ctx.canvas.width;
    let h = ctx.canvas.height;
    let cx = w / 2;
    let cy = h / 2;
    let z = Math.min(w, h);
    let d = z * barLength;
    let x0 = Math.sin(a1) * d + cx;
    let y0 = Math.cos(a1) * d + cy;
    let x1 = Math.sin(a2) * d + x0;
    let y1 = Math.cos(a2) * d + y0;
    let massStyle = color2style(massColor);
    ctx.lineCap = 'butt';
    ctx.lineWidth = z * tailThickness / 2;
    ctx.strokeStyle = color2style(tailColor);
    let n = tail.length;
    tail.visit(function(x0, y0, x1, y1) {
        ctx.globalAlpha = n-- / tail.length;
        ctx.beginPath();
        ctx.moveTo(x0 * d + cx, y0 * d + cy);
        ctx.lineTo(x1 * d + cx, y1 * d + cy);
        ctx.stroke();
    });

    ctx.lineWidth = z * barWidth / 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'bevel';
    ctx.strokeStyle = massStyle;
    ctx.fillStyle = massStyle;
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x0, y0, z * massRadius / 2, 0, 2 * Math.PI);
    ctx.arc(x1, y1, z * massRadius / 2, 0, 2 * Math.PI);
    ctx.fill();}
(function() {
    let state = [new pendulum()];
    let params = new URL(document.location);
    let useWebGL = params.searchParams.get("webgl") !== '0';
    let c2d = document.getElementById('c2d');
    let c3d = document.getElementById('c3d');
    let canvas;
    let mode;
    let running = true;
    let gl = useWebGL ? c3d.getContext('webgl') : null;
    let ctx = c2d.getContext('2d');
    let renderer = null;
    if (!gl) {
        mode = '2d-only';
        canvas = c2d;
        c3d.style.display = 'none';} 
        else {
        renderer = new glRenderer(gl, tailMax);
        mode = '3d';
        canvas = c3d;
        c2d.style.display = 'none';}
    function toggleMode() {
        switch (mode) {
            case '2d':
                mode = '3d';
                canvas = c3d;
                c3d.style.display = 'block';
                c2d.style.display = 'none';
                break;
            case '3d':
                mode = '2d';
                canvas = c2d;
                c2d.style.display = 'block';
                c3d.style.display = 'none';
                break;}}
    window.addEventListener('keypress', function(e) {
        switch (e.charCode) {
            case 32: // SPACE
                running = !running;
                break;
            case 97: // a
                x = x + 1
                console.log(x)
                nr.innerText = x
                let color = [Math.random(), Math.random(), Math.random()];
                state.push(new pendulum({tailColor: color}));
                break;
            case 99: // c
                if (state.length) {
                    let color = [Math.random(), Math.random(), Math.random()];
                    state.push(state[0].clone({tailColor: color}));
                }
                break;
            case 100: // d
                x = x - 1
                console.log(x)
                nr.innerText = x
                if (x < 0) {x = 0}
                if (state.length)
                    state.pop();
                break;
            case 109: // m
                toggleMode();
                break;
        }
    });
    let last = 0.0;
    function cb(t) {
        let dt = Math.min(t - last, dtMax);
        let ww = window.innerWidth;
        let wh = window.innerHeight;
        if (canvas.width != ww || canvas.height != wh) {
            /* Only resize when necessary */
            canvas.width = ww;
            canvas.height = wh;
        }
        if (running)
            for (let i = 0; i < state.length; i++)
                state[i].step(dt / 1000.0);
        if (mode === '3d') {
            clear3d(gl);
            renderer.renderAll(state);
        } else {
            clear2d(ctx);
            for (let i = 0; i < state.length; i++)
                state[i].draw2d(ctx);
        }
        last = t;
        window.requestAnimationFrame(cb);
    }

    window.requestAnimationFrame(cb);
}());