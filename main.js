import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.154.0/build/three.module.js';
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.154.0/examples/jsm/webxr/VRButton.js';
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';

let scene, camera, renderer;
let bolaMesh, bolaBody;
let pinos = [], pinoBodies = [], ronda = 1, rondasMax = 5, nivel = 1;
let dragging = false, lastMouse = null, lastWorldPos = null;
let world;
let lanzada = false;

const textureLoader = new THREE.TextureLoader();

const URLS = {
  fondo: 'https://threejs.org/examples/textures/2294472375_24a3b8ef46_o.jpg',
  piso: 'https://threejs.org/examples/textures/terrain/grasslight-big.jpg',
  pista: 'https://threejs.org/examples/textures/hardwood2_diffuse.jpg',
  bola: 'https://threejs.org/examples/textures/metal.jpg',
  pino: 'https://threejs.org/examples/textures/brick_diffuse.jpg'
};

function actualizarHUD() {
  document.getElementById("hud").innerHTML = `Nivel: ${nivel}<br>Ronda: ${ronda}/${rondasMax}`;
}

function mostrarMensaje(texto) {
  const mensaje = document.getElementById("mensaje");
  mensaje.innerText = texto;
  mensaje.style.opacity = 1;
  mensaje.style.transform = 'translateY(0)';
  setTimeout(() => {
    mensaje.style.opacity = 0;
    mensaje.style.transform = 'translateY(-20px)';
  }, 1500);
}

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = textureLoader.load(URLS.fondo);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 0); // Alinear con el origen de VR

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  const vrStatus = document.getElementById('vrstatus');
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-vr').then(supported => {
      vrStatus.innerText = supported ? '✅ VR disponible' : '⚠️ WebXR activo pero sin visor';
      vrStatus.style.color = supported ? '#00ff00' : '#ffaa00';
    });
  } else {
    vrStatus.innerText = '❌ Este navegador NO SOPORTA VR';
    vrStatus.style.color = '#ff0000';
  }

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
  directionalLight.position.set(0, 10, 5);
  scene.add(directionalLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 20),
    new THREE.MeshStandardMaterial({ map: textureLoader.load(URLS.piso) })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const pista = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 8),
    new THREE.MeshStandardMaterial({ map: textureLoader.load(URLS.pista) })
  );
  pista.rotation.x = -Math.PI / 2;
  pista.position.set(0, 0.01, -1.5);
  scene.add(pista);

  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });

  const groundBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Plane(),
    quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)
  });
  world.addBody(groundBody);

  const bolaGeo = new THREE.SphereGeometry(0.15);
  const bolaMat = new THREE.MeshStandardMaterial({ map: textureLoader.load(URLS.bola) });
  bolaMesh = new THREE.Mesh(bolaGeo, bolaMat);
  scene.add(bolaMesh);

  bolaBody = new CANNON.Body({
    mass: 1,
    shape: new CANNON.Sphere(0.15),
    position: new CANNON.Vec3(0, 0.15, -0.5), // Bola justo enfrente del jugador en VR
    linearDamping: 0.31
  });
  world.addBody(bolaBody);

  const alturaPino = 0.4;
  const centroY = alturaPino / 2;
  const posiciones = generarPosicionesPinos();
  posiciones.forEach(pos => {
    const pinoMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, alturaPino, 8),
      new THREE.MeshStandardMaterial({ map: textureLoader.load(URLS.pino) })
    );
    pinoMesh.position.set(pos.x, centroY, pos.z);
    scene.add(pinoMesh);
    pinos.push(pinoMesh);

    const shape = new CANNON.Cylinder(0.08, 0.1, alturaPino, 8);
    const pinoBody = new CANNON.Body({
      mass: 0.3,
      shape: shape,
      position: new CANNON.Vec3(pos.x, centroY, pos.z),
      material: new CANNON.Material({ friction: 0.5, restitution: 0.2 })
    });
    pinoBody.quaternion.setFromEuler(0, 0, 0);
    world.addBody(pinoBody);
    pinoBodies.push(pinoBody);
  });

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

  actualizarHUD();
}

function generarPosicionesPinos() {
  const posiciones = [];
  const filas = 4;
  const spacing = 0.5;
  const zInicial = -4.5; // Alejamos los pinos un poco más
  for (let fila = 0; fila < filas; fila++) {
    const cantidad = fila + 1;
    const offsetX = -(cantidad - 1) * spacing / 2;
    for (let i = 0; i < cantidad; i++) {
      posiciones.push({ x: offsetX + i * spacing, z: zInicial - fila * spacing });
    }
  }
  return posiciones;
}

function onPointerDown(event) {
  dragging = true;
  lastMouse = { x: event.clientX, y: event.clientY };
  lastWorldPos = bolaBody.position.clone();
  bolaBody.velocity.setZero();
  bolaBody.angularVelocity.setZero();
  event.preventDefault();
}

function onPointerMove(event) {
  if (!dragging) return;
  const deltaX = (event.clientX - lastMouse.x) * 0.01;
  const deltaZ = (event.clientY - lastMouse.y) * 0.01;
  bolaBody.position.x = lastWorldPos.x + deltaX;
  bolaBody.position.z = lastWorldPos.z + deltaZ;
  event.preventDefault();
}

function onPointerUp(event) {
  if (!dragging) return;
  dragging = false;
  const deltaX = (event.clientX - lastMouse.x) * 0.4;
  const deltaZ = (event.clientY - lastMouse.y) * 0.4;
  bolaBody.velocity.set(deltaX, 0, deltaZ);
  lanzada = true;
  event.preventDefault();
}

function animate() {
  renderer.setAnimationLoop(() => {
    world.step(1 / 60);

    bolaMesh.position.copy(bolaBody.position);
    bolaMesh.quaternion.copy(bolaBody.quaternion);

    for (let i = 0; i < pinos.length; i++) {
      pinos[i].position.copy(pinoBodies[i].position);
      pinos[i].quaternion.copy(pinoBodies[i].quaternion);
    }

    renderer.render(scene, camera);
  });
}
