import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Slider } from "@/components/ui/slider";

const ParticleSimulation = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const particlesRef = useRef<THREE.Mesh[]>([]);
  const worldRef = useRef<CANNON.World | null>(null);
  const bodiesRef = useRef<CANNON.Body[]>([]);
  const requestRef = useRef<number | null>(null);
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const prevTimeRef = useRef(0);

  // Simulation parameters with state for UI control
  const [numParticles, setNumParticles] = useState(1000);
  const [particleRadius, setParticleRadius] = useState(7);
  const [pushRadius, setPushRadius] = useState(80);
  const [attractionRadius, setAttractionRadius] = useState(150);
  const [attractionStrength, setAttractionStrength] = useState(25000);
  const [pushStrength, setPushStrength] = useState(30000);

  // Particle appearance
  const [particleColor, setParticleColor] = useState('#2ACBF3'); // Apple blue

  useEffect(() => {
    if (!canvasRef.current) return;

    const BOX_WIDTH = window.innerWidth;
    const BOX_HEIGHT = window.innerHeight;

    // Physics World Setup
    const world = new CANNON.World();
    world.gravity.set(0, -1000, 0); // No gravity
    world.broadphase = new CANNON.SAPBroadphase(world);
    // world.solver.iterations = 8;
    worldRef.current = world;

    // Three.js Scene Setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Renderer with transparent background
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: 'high-performance' 
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(BOX_WIDTH, BOX_HEIGHT);
    renderer.setClearColor(0x000000, 0); // Transparent background
    canvasRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Orthographic Camera
    const aspectRatio = BOX_WIDTH / BOX_HEIGHT;
    const frustumSize = 1000;
    const camera = new THREE.OrthographicCamera(
      (frustumSize * aspectRatio) / -2,
      (frustumSize * aspectRatio) / 2,
      frustumSize / 2,
      frustumSize / -2,
      1,
      2000
    );
    camera.position.z = 1000;
    cameraRef.current = camera;

    // Create the particles
    createParticles();

    // Create boundary walls
    createBoundaries(BOX_WIDTH, BOX_HEIGHT);

    // Mouse interaction
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener('resize', handleResize);

    // Animation loop
    const animate = (time: number) => {
      requestRef.current = requestAnimationFrame(animate);
      
      const deltaTime = prevTimeRef.current ? Math.min((time - prevTimeRef.current) / 1000, 0.1) : 0.016;
      prevTimeRef.current = time;
      
      world.step(deltaTime);
      
      applyForces();
      updateParticlePositions();
      
      renderer.render(scene, camera);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      if (canvasRef.current && rendererRef.current) {
        canvasRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, []);

  // Handle window resize
  const handleResize = () => {
    if (!cameraRef.current || !rendererRef.current) return;
    
    const BOX_WIDTH = window.innerWidth;
    const BOX_HEIGHT = window.innerHeight;
    
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    
    const aspectRatio = BOX_WIDTH / BOX_HEIGHT;
    const frustumSize = 1000;
    
    camera.left = (frustumSize * aspectRatio) / -2;
    camera.right = (frustumSize * aspectRatio) / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();
    
    renderer.setSize(BOX_WIDTH, BOX_HEIGHT);
    
    // Recreate boundaries with new dimensions
    if (worldRef.current) {
      // Remove old boundaries
      const bodies = worldRef.current.bodies;
      const particleBodies = bodiesRef.current;
      for (let i = bodies.length - 1; i >= 0; i--) {
        const body = bodies[i];
        if (!particleBodies.includes(body)) {
          worldRef.current.removeBody(body);
        }
      }
      
      createBoundaries(BOX_WIDTH, BOX_HEIGHT);
    }
  };

  const createParticles = () => {
    if (!sceneRef.current || !worldRef.current) return;
    const scene = sceneRef.current;
    const world = worldRef.current;
    const particles: THREE.Mesh[] = [];
    const bodies: CANNON.Body[] = [];

    // Create geometry and material once
    const geometry = new THREE.CircleGeometry(particleRadius, 32);
    
    // Create a gradient material for each particle to give a more realistic, Apple-like depth
    const color = new THREE.Color(particleColor);
    const material = new THREE.MeshBasicMaterial({ 
      color: color,
      transparent: true,
      opacity: 0.75
    });

    // Physics material
    const particleMaterial = new CANNON.Material("particleMaterial");
    particleMaterial.friction = 0.05;
    particleMaterial.restitution = 0.3;
  
    // Define a contact material for interactions between particles
    const contactMaterial = new CANNON.ContactMaterial(particleMaterial, particleMaterial, {
      friction: 0.01,
      restitution: 0.3,
    });
  
    world.addContactMaterial(contactMaterial);

    const BOX_WIDTH = window.innerWidth;
    const BOX_HEIGHT = window.innerHeight;
    const halfWidth = BOX_WIDTH / 2;
    const halfHeight = BOX_HEIGHT / 2;

    for (let i = 0; i < numParticles; i++) {
      // Initial position with better distribution
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * Math.min(halfWidth, halfHeight) * 0.8;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;

      // Three.js mesh with a subtle variation in color
      const individualColor = color.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
      const individualMaterial = material.clone();
      individualMaterial.color = individualColor;
      
      const mesh = new THREE.Mesh(geometry, individualMaterial);
      mesh.position.set(x, y, 0);
      scene.add(mesh);
      particles.push(mesh);

      // Physics body
      const shape = new CANNON.Sphere(particleRadius);
      const body = new CANNON.Body({
        mass: 1,
        position: new CANNON.Vec3(x, y, 0),
        shape: shape,
        material: particleMaterial
      });

      body.linearDamping = 0.3; // Higher damping for more controlled movement
      body.angularDamping = 0.5;
      world.addBody(body);
      bodies.push(body);
    }

    particlesRef.current = particles;
    bodiesRef.current = bodies;
  };

  const createBoundaries = (boxWidth: number, boxHeight: number) => {
    if (!worldRef.current) return;
    const world = worldRef.current;
    const halfWidth = boxWidth / 2;
    const halfHeight = boxHeight / 2;
    const boundaryThickness = 50;

    // Boundary material
    const boundaryMaterial = new CANNON.Material("boundaryMaterial");
    boundaryMaterial.friction = 0.0;
    boundaryMaterial.restitution = 0.5;

    // Create contact materials for particle-boundary interaction
    if (bodiesRef.current.length > 0) {
      const particleMaterial = bodiesRef.current[0].material as CANNON.Material;
      const boundaryContactMaterial = new CANNON.ContactMaterial(
        particleMaterial,
        boundaryMaterial,
        {
          friction: 0.0,
          restitution: 0.5,
        }
      );
      world.addContactMaterial(boundaryContactMaterial);
    }

    const createWall = (x: number, y: number, width: number, height: number) => {
      const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, boundaryThickness / 2));
      const body = new CANNON.Body({ 
        mass: 0, // Static body
        material: boundaryMaterial
      });
      body.addShape(shape);
      body.position.set(x, y, 0);
      world.addBody(body);
    };

    // Create walls with appropriate sizes
    createWall(0, halfHeight + boundaryThickness / 2, boxWidth, boundaryThickness); // Top
    createWall(0, -halfHeight - boundaryThickness / 2, boxWidth, boundaryThickness); // Bottom
    createWall(-halfWidth - boundaryThickness / 2, 0, boundaryThickness, boxHeight); // Left
    createWall(halfWidth + boundaryThickness / 2, 0, boundaryThickness, boxHeight); // Right
  };

  const handleMouseMove = (event: MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Calculate mouse position in scene coordinates
    const x = event.clientX - rect.left - window.innerWidth / 2;
    const y = -(event.clientY - rect.top) + window.innerHeight / 2;
    
    mousePositionRef.current = { x, y };
  };

  const applyForces = () => {
    if (!bodiesRef.current) return;
    const bodies = bodiesRef.current;
    const { x: mx, y: my } = mousePositionRef.current;
    
    // Apply mouse push force
    bodies.forEach((body) => {
      const dx = body.position.x - mx;
      const dy = body.position.y - my;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < pushRadius && distance > 1) {
        const forceScale = (pushRadius - distance) / pushRadius;
        const forceX = (dx / distance) * forceScale * pushStrength;
        const forceY = (dy / distance) * forceScale * pushStrength;
        body.applyForce(new CANNON.Vec3(forceX, forceY, 0), body.position);
      }
    });

    // Apply particle attraction/repulsion forces
    for (let i = 0; i < bodies.length; i++) {
      const bodyA = bodies[i];
      
      for (let j = i + 1; j < bodies.length; j++) {
        const bodyB = bodies[j];
        
        const dx = bodyB.position.x - bodyA.position.x;
        const dy = bodyB.position.y - bodyA.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Skip if particles are too close or too far
        if (distance < particleRadius * 2 || distance > attractionRadius) continue;
        
        // Calculate attraction force (inverse square law)
        const forceMagnitude = attractionStrength / (distance * distance);
        const forceX = (dx / distance) * forceMagnitude;
        const forceY = (dy / distance) * forceMagnitude;
        
        // Apply forces to both bodies (equal and opposite)
        bodyA.applyForce(new CANNON.Vec3(forceX, forceY, 0), bodyA.position);
        bodyB.applyForce(new CANNON.Vec3(-forceX, -forceY, 0), bodyB.position);
      }
    }
  };

  const updateParticlePositions = () => {
    const particles = particlesRef.current;
    const bodies = bodiesRef.current;
    
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const mesh = particles[i];
      
      if (body && mesh) {
        mesh.position.set(body.position.x, body.position.y, 0);
        mesh.rotation.z = body.quaternion.z;
      }
    }
  };

  // Handle slider changes
  const handleAttractionRadiusChange = (value: number[]) => {
    setAttractionRadius(value[0]);
  };

  const handleAttractionStrengthChange = (value: number[]) => {
    setAttractionStrength(value[0]);
  };

  return (
    <div className="min-h-screen overflow-hidden bg-background">
      <div ref={canvasRef} className="particle-canvas" />
      
      <div className="controls-container">
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-xs font-medium text-foreground/70">Attraction Distance</label>
          <Slider
            value={[attractionRadius]}
            min={50}
            max={300}
            step={10}
            onValueChange={handleAttractionRadiusChange}
            className="w-full"
          />
        </div>
        
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-xs font-medium text-foreground/70">Attraction Strength</label>
          <Slider
            value={[attractionStrength]}
            min={5000}
            max={100000}
            step={5000}
            onValueChange={handleAttractionStrengthChange}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
};

export default ParticleSimulation;
