const canvas = document.getElementById('glcanvas');
  const gl = canvas.getContext('webgl', { alpha: true }); // Enable alpha channel
  if (!gl) {
    alert('WebGL not supported');
  }

  const labelsContainer = document.getElementById('labelsContainer');
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    labelsContainer.style.width = canvas.width + 'px';
    labelsContainer.style.height = canvas.height + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  // Shaders & setup (same as before)
  const vertexShaderSource = `
    attribute vec4 aVertexPosition;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    void main(void) {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    uniform vec4 uColor;
    void main(void) {
      gl_FragColor = uColor;
    }
  `;

  function loadShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      alert('Shader compile error: ' + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = loadShader(gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert('Shader program link error: ' + gl.getProgramInfoLog(shaderProgram));
  }
  gl.useProgram(shaderProgram);

  const programInfo = {
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
      color: gl.getUniformLocation(shaderProgram, 'uColor'),
    },
  };

  const base = 2;
  const height = 3;
  const half = base / 2;

  const vertices = new Float32Array([
    -half, 0, -half,
     half, 0, -half,
     half, 0,  half,
    -half, 0,  half,
    0, height, 0
  ]);

  const edges = new Uint16Array([
    0,1, 1,2, 2,3, 3,0,
    0,4, 1,4, 2,4, 3,4
  ]);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const edgeBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgeBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edges, gl.STATIC_DRAW);

  function createMat4() {
    return new Float32Array([
      1,0,0,0,
      0,1,0,0,
      0,0,1,0,
      0,0,0,1
    ]);
  }

  function multiplyMat4(out, a, b) {
    for(let row=0; row<4; row++) {
      for(let col=0; col<4; col++) {
        let sum = 0;
        for(let i=0; i<4; i++) {
          sum += a[row + i*4] * b[i + col*4];
        }
        out[row + col*4] = sum;
      }
    }
  }

  function perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;

    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;

    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) / (near - far);
    out[11] = -1;

    out[12] = 0;
    out[13] = 0;
    out[14] = (2 * far * near) / (near - far);
    out[15] = 0;
  }

  function translate(out, a, v) {
    for (let i=0; i<12; i++) out[i] = a[i];
    out[12] = a[12] + v[0];
    out[13] = a[13] + v[1];
    out[14] = a[14] + v[2];
    out[15] = a[15];
  }

  function rotateY(out, a, rad) {
    const s = Math.sin(rad);
    const c = Math.cos(rad);

    out[0] = c * a[0] + s * a[8];
    out[1] = c * a[1] + s * a[9];
    out[2] = c * a[2] + s * a[10];
    out[3] = c * a[3] + s * a[11];

    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];

    out[8] = -s * a[0] + c * a[8];
    out[9] = -s * a[1] + c * a[9];
    out[10] = -s * a[2] + c * a[10];
    out[11] = -s * a[3] + c * a[11];

    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }

  let rotationY = 0;

  function transformVec4(out, mat, vec) {
    for(let i=0; i<4; i++) {
      out[i] = mat[i]*vec[0] + mat[i+4]*vec[1] + mat[i+8]*vec[2] + mat[i+12]*vec[3];
    }
  }

  function projectPoint(pos3D, modelViewMatrix, projectionMatrix) {
    const vec = [pos3D[0], pos3D[1], pos3D[2], 1];
    const mvTransformed = [0,0,0,0];
    transformVec4(mvTransformed, modelViewMatrix, vec);

    const clipSpace = [0,0,0,0];
    transformVec4(clipSpace, projectionMatrix, mvTransformed);

    if (clipSpace[3] === 0) return null;
    const ndc = clipSpace.map(c => c / clipSpace[3]);

    // Use container size for mapping
    const container = document.querySelector('.pyramid-demo');
    const rect = container.getBoundingClientRect();
    const x = (ndc[0] * 0.5 + 0.5) * rect.width;
    const y = (1 - (ndc[1] * 0.5 + 0.5)) * rect.height;

    if (ndc[2] < -1 || ndc[2] > 1) return null;

    return {x, y};
  }

  const verticesForLabels = [
    [-half, 0, -half],
    [ half, 0, -half],
    [ half, 0,  half],
    [-half, 0,  half],
    [0, height, 0]
  ];

  const labels = [];
  const labelTexts = ['?', '?', 'Coding', 'Music', 'Philosophy'];

  for(let i=0; i<5; i++) {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = labelTexts[i];
    label.style.pointerEvents = 'auto';

    // Add redirect logic for specific labels
    if (labelTexts[i] === 'Coding') {
      label.addEventListener('click', () => window.location.href = 'coding.html');
    } else if (labelTexts[i] === 'Music') {
      label.addEventListener('click', () => window.location.href = 'music.html');
    } else if (labelTexts[i] === 'Philosophy') {
      label.addEventListener('click', () => window.location.href = 'philosophy.html');
    } else {
      // label.addEventListener('click', () => alert(`You clicked: ${labelTexts[i]}`));
    }

    labelsContainer.appendChild(label);
    labels.push(label);
  }

  function drawScene() {
    gl.clearColor(0.13, 0.13, 0.13, 0); // Set alpha to 0 for transparency
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const projectionMatrix = createMat4();
    perspective(projectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100);

    let modelViewMatrix = createMat4();
    translate(modelViewMatrix, modelViewMatrix, [0, -1, -8]);

    const rotationMatrix = createMat4();
    rotateY(rotationMatrix, createMat4(), rotationY);

    let combinedMatrix = createMat4();
    multiplyMat4(combinedMatrix, modelViewMatrix, rotationMatrix);
    modelViewMatrix = combinedMatrix;

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgeBuffer);

    gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
    gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);

    gl.uniform4fv(programInfo.uniformLocations.color, [1, 1, 1, 1]);

    gl.drawElements(gl.LINES, edges.length, gl.UNSIGNED_SHORT, 0);

    for (let i = 0; i < labels.length; i++) {
      const pos = verticesForLabels[i];
      const screenPos = projectPoint(pos, modelViewMatrix, projectionMatrix);
      if (screenPos) {
        labels[i].style.display = 'block';
        labels[i].style.left = screenPos.x + 'px';
        labels[i].style.top = screenPos.y + 'px';
      } else {
        labels[i].style.display = 'none';
      }
    }
  }

  function animate() {
    drawScene();
    requestAnimationFrame(animate);
  }
  animate();

  document.getElementById('rotateLeft').addEventListener('click', () => {
    rotationY -= Math.PI / 6; // 45 degrees in radians
  });
  document.getElementById('rotateRight').addEventListener('click', () => {
    rotationY += Math.PI / 6; // 45 degrees in radians
  });
