
"use strict";

/* =========================================
   FRANCEDRIVE 0.7
   Moteur 3D WebGL - compatible iPhone
========================================= */

const canvas = document.getElementById("game");
const speedDisplay = document.getElementById("speed");
const loading = document.getElementById("loading");

const gl = canvas.getContext("webgl", {
    antialias: true,
    alpha: false,
    powerPreference: "high-performance"
});

if (!gl) {
    loading.innerHTML = "<h2>WebGL indisponible</h2><p>Ce navigateur ne prend pas en charge WebGL.</p>";
    throw new Error("WebGL indisponible");
}

/* SCÈNE */

const scene = {
    carX: 0,
    carZ: 0,
    speed: 0,
    steering: 0,
    acceleration: 0,
    braking: 0,
    direction: 0,
    lastTime: 0,
    cameraX: 0
};

/* COMMANDES */

const keys = {
    left: false,
    right: false,
    accelerate: false,
    brake: false
};

document.querySelectorAll("[data-control]").forEach(button => {
    const control = button.dataset.control;

    button.addEventListener("pointerdown", event => {
        event.preventDefault();
        keys[control] = true;
        button.setPointerCapture(event.pointerId);
    });

    const release = event => {
        event.preventDefault();
        keys[control] = false;
    };

    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", () => {
        keys[control] = false;
    });
});

window.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft" || event.key === "a") keys.left = true;
    if (event.key === "ArrowRight" || event.key === "d") keys.right = true;
    if (event.key === "ArrowUp" || event.key === "w") keys.accelerate = true;
    if (event.key === "ArrowDown" || event.key === "s") keys.brake = true;
});

window.addEventListener("keyup", event => {
    if (event.key === "ArrowLeft" || event.key === "a") keys.left = false;
    if (event.key === "ArrowRight" || event.key === "d") keys.right = false;
    if (event.key === "ArrowUp" || event.key === "w") keys.accelerate = false;
    if (event.key === "ArrowDown" || event.key === "s") keys.brake = false;
});

window.addEventListener("blur", () => {
    Object.keys(keys).forEach(key => keys[key] = false);
});

/* SHADERS */

const vertexShaderSource = `
attribute vec3 aPosition;

uniform mat4 uMVP;

void main() {
    gl_Position = uMVP * vec4(aPosition, 1.0);
}
`;

const fragmentShaderSource = `
precision mediump float;
uniform vec4 uColor;

void main() {
    gl_FragColor = uColor;
}
`;

function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message);
    }

    return shader;
}

const program = gl.createProgram();

gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexShaderSource));
gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
}

gl.useProgram(program);

const positionLocation = gl.getAttribLocation(program, "aPosition");
const mvpLocation = gl.getUniformLocation(program, "uMVP");
const colorLocation = gl.getUniformLocation(program, "uColor");

/* GÉOMÉTRIE 3D */

const cubeVertices = new Float32Array([
    // Face avant
    -0.5,-0.5, 0.5,  0.5,-0.5, 0.5,  0.5, 0.5, 0.5,
    -0.5,-0.5, 0.5,  0.5, 0.5, 0.5, -0.5, 0.5, 0.5,

    // Face arrière
     0.5,-0.5,-0.5, -0.5,-0.5,-0.5, -0.5, 0.5,-0.5,
     0.5,-0.5,-0.5, -0.5, 0.5,-0.5,  0.5, 0.5,-0.5,

    // Face gauche
    -0.5,-0.5,-0.5, -0.5,-0.5, 0.5, -0.5, 0.5, 0.5,
    -0.5,-0.5,-0.5, -0.5, 0.5, 0.5, -0.5, 0.5,-0.5,

    // Face droite
     0.5,-0.5, 0.5,  0.5,-0.5,-0.5,  0.5, 0.5,-0.5,
     0.5,-0.5, 0.5,  0.5, 0.5,-0.5,  0.5, 0.5, 0.5,

    // Dessus
    -0.5, 0.5, 0.5,  0.5, 0.5, 0.5,  0.5, 0.5,-0.5,
    -0.5, 0.5, 0.5,  0.5, 0.5,-0.5, -0.5, 0.5,-0.5,

    // Dessous
    -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,  0.5,-0.5, 0.5,
    -0.5,-0.5,-0.5,  0.5,-0.5, 0.5, -0.5,-0.5, 0.5
]);

const vertexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);

gl.enableVertexAttribArray(positionLocation);
gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

gl.enable(gl.DEPTH_TEST);

/* MATHÉMATIQUES 3D */

function identity() {
    return new Float32Array([
        1,0,0,0,
        0,1,0,0,
        0,0,1,0,
        0,0,0,1
    ]);
}

function multiply(a, b) {
    const out = new Float32Array(16);

    for (let column = 0; column < 4; column++) {
        for (let row = 0; row < 4; row++) {
            out[column * 4 + row] =
                a[row] * b[column * 4] +
                a[4 + row] * b[column * 4 + 1] +
                a[8 + row] * b[column * 4 + 2] +
                a[12 + row] * b[column * 4 + 3];
        }
    }

    return out;
}

function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);

    return new Float32Array([
        f / aspect,0,0,0,
        0,f,0,0,
        0,0,(far + near) * nf,-1,
        0,0,(2 * far * near) * nf,0
    ]);
}

function lookAt(eye, target, up) {
    let zx = eye[0] - target[0];
    let zy = eye[1] - target[1];
    let zz = eye[2] - target[2];

    let length = Math.hypot(zx, zy, zz);
    zx /= length; zy /= length; zz /= length;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;

    length = Math.hypot(xx, xy, xz);
    xx /= length; xy /= length; xz /= length;

    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    return new Float32Array([
        xx,yx,zx,0,
        xy,yy,zy,0,
        xz,yz,zz,0,
        -(xx*eye[0] + xy*eye[1] + xz*eye[2]),
        -(yx*eye[0] + yy*eye[1] + yz*eye[2]),
        -(zx*eye[0] + zy*eye[1] + zz*eye[2]),
        1
    ]);
}

function modelMatrix(x, y, z, sx, sy, sz) {
    const m = identity();

    m[0] = sx;
    m[5] = sy;
    m[10] = sz;

    m[12] = x;
    m[13] = y;
    m[14] = z;

    return m;
}

/* DESSIN 3D */

let projection = identity();
let view = identity();

function drawCube(x, y, z, sx, sy, sz, color) {
    const model = modelMatrix(x, y, z, sx, sy, sz);
    const mvp = multiply(projection, multiply(view, model));

    gl.uniformMatrix4fv(mvpLocation, false, mvp);
    gl.uniform4fv(colorLocation, color);

    gl.drawArrays(gl.TRIANGLES, 0, 36);
}

/* ENVIRONNEMENT */

function drawEnvironment() {
    // Terrain
    drawCube(0, -0.25, scene.carZ - 2000,
        300, 0.5, 5000, [0.25, 0.48, 0.29, 1]);

    // Route
    drawCube(0, -0.02, scene.carZ - 2000,
        10, 0.12, 5000, [0.22, 0.23, 0.24, 1]);

    // Accotements
    drawCube(-5.3, 0.01, scene.carZ - 2000,
        0.6, 0.15, 5000, [0.48, 0.47, 0.38, 1]);

    drawCube(5.3, 0.01, scene.carZ - 2000,
        0.6, 0.15, 5000, [0.48, 0.47, 0.38, 1]);

    // Lignes blanches
    for (let i = 0; i < 30; i++) {
        const z = scene.carZ - i * 18 - 8;

        drawCube(0, 0.055, z,
            0.13, 0.025, 8, [0.95, 0.94, 0.82, 1]);
    }

    // Arbres et végétation
    for (let i = 0; i < 22; i++) {
        const z = scene.carZ - i * 35 - 20;

        for (const side of [-1, 1]) {
            const x = side * (9 + (i % 3) * 2);

            drawCube(x, 0.8, z,
                0.35, 1.6, 0.35, [0.35, 0.20, 0.10, 1]);

            drawCube(x, 2.1, z,
                2.2, 2.8, 2.2, [0.10, 0.35, 0.15, 1]);
        }
    }

    // Quelques bâtiments
    for (let i = 0; i < 8; i++) {
        const z = scene.carZ - i * 85 - 50;

        drawCube(-16, 2, z,
            7, 4, 8, [0.70, 0.61, 0.47, 1]);

        drawCube(17, 2, z - 30,
            8, 4, 7, [0.67, 0.66, 0.59, 1]);
    }
}

/* VOITURE */

function drawCar() {
    const x = scene.carX;
    const z = scene.carZ;

    // Carrosserie
    drawCube(x, 0.55, z,
        1.9, 0.65, 3.8, [0.08, 0.35, 0.85, 1]);

    // Habitacle
    drawCube(x, 1.08, z - 0.35,
        1.45, 0.75, 1.8, [0.12, 0.19, 0.27, 1]);

    // Roues
    for (const side of [-1, 1]) {
        for (const front of [-1, 1]) {
            drawCube(
                x + side * 1.02,
                0.30,
                z + front * 1.15,
                0.35, 0.55, 0.75,
                [0.04, 0.04, 0.04, 1]
            );
        }
    }

    // Phares avant
    for (const side of [-1, 1]) {
        drawCube(x + side * 0.65, 0.62, z - 1.93,
            0.35, 0.22, 0.08, [1, 0.95, 0.65, 1]);
    }
}

/* CAMÉRA */

function updateCamera() {
    const targetX = scene.carX * 0.7;

    scene.cameraX += (targetX - scene.cameraX) * 0.06;

    const eye = [
        scene.cameraX,
        6,
        scene.carZ + 10
    ];

    const target = [
        scene.carX,
        0.8,
        scene.carZ - 9
    ];

    view = lookAt(eye, target, [0, 1, 0]);
}

/* PHYSIQUE */

function updatePhysics(delta) {
    const dt = Math.min(delta, 0.05);

    if (keys.accelerate) {
        scene.speed += 12 * dt;
    } else {
        scene.speed -= 2.5 * dt;
    }

    if (keys.brake) {
        scene.speed -= 20 * dt;
    }

    scene.speed = Math.max(0, Math.min(65, scene.speed));

    let steering = 0;

    if (keys.left) steering -= 1;
    if (keys.right) steering += 1;

    scene.steering += (steering - scene.steering) * Math.min(1, dt * 9);

    const speedFactor = 0.25 + scene.speed / 25;

    scene.carX += scene.steering * speedFactor * dt * 5;

    scene.carZ -= scene.speed * dt / 3.6;

    // Limite de la chaussée
    scene.carX = Math.max(-4, Math.min(4, scene.carX));

    speedDisplay.textContent = Math.round(scene.speed) + " km/h";
}

/* AFFICHAGE */

function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);

    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    gl.viewport(0, 0, width, height);

    projection = perspective(
        Math.PI / 3,
        width / height,
        0.1,
        3000
    );
}

window.addEventListener("resize", resize);

function render() {
    resize();

    gl.clearColor(0.43, 0.68, 0.77, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    updateCamera();

    drawEnvironment();
    drawCar();
}

/* BOUCLE PRINCIPALE */

function loop(timestamp) {
    const delta = scene.lastTime
        ? (timestamp - scene.lastTime) / 1000
        : 0;

    scene.lastTime = timestamp;

    updatePhysics(delta);
    render();

    requestAnimationFrame(loop);
}

/* DÉMARRAGE */

resize();

loading.classList.add("hidden");

setTimeout(() => {
    loading.style.display = "none";
}, 500);

requestAnimationFrame(loop);

console.log("FranceDrive 0.7 - moteur 3D initialisé");
